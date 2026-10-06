/**
 * Runs one stage of the eval-quality CLI and keeps what it said.
 *
 * Every verdict CI enforces comes from the eval-quality CLI over persisted
 * files (AD-1, AD-6), and `tea-evaluate` passes a stage's exit code through
 * verbatim (AD-10). This file is the one place a stage is spawned: the
 * executable is `engineCliPath()` (the installed `eval-quality` bin, or the
 * `TEA_EVALUATE_ENGINE_CLI` substitute a test points at a shim), and each
 * call's argv, exit code, stdout and stderr are written under the run's
 * `engine/` directory, so a verdict and its diagnostics can be read back
 * after the run (AD-12).
 *
 * The record holds neutral path forms (`recorded-paths.js`): a file inside the
 * evaluation folder by its path below it, a staging file as `<staging>/<name>`,
 * and the executable below the engine package, so a record published with a
 * baseline or a CI artifact names no machine path.
 * The messages of an `EngineStageError` name the executable and the record in the same forms, since callers write them into records.
 *
 * A stage runs as an asynchronous child that leads a process group of its own, and every live stage is on one list
 * (`liveStages`). A synchronous call would hold the event loop, so a SIGINT or SIGTERM that reached `tea-evaluate` could not run
 * its handler until the stage ended, and a stage that hangs would hold the command and its scratch directories.
 * While a stage is live this module keeps a guard on SIGINT, SIGTERM, SIGHUP and SIGQUIT: it sends the signal to each stage's
 * group, SIGKILL after a grace, and ends the process by the same signal once no other handler is left to do it. A command's own
 * handler (`tea-evaluate ci` removes its scratch directories) is registered earlier and runs first.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { ENGINE_CLI_ENV, engineCliPath, enginePackageRoot } = require('./engine');
const { signalGroup, stopGroups } = require('./process-group');
const { pathRecorder, recordedEngineCli, textNeutralizer } = require('./recorded-paths');

const NODE_SCRIPT = /\.(?:c|m)?js$/;

/** Raised when a stage could not be run at all, or ended with no exit code; `tea-evaluate` reports it as infrastructure (exit 12). */
class EngineStageError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'EngineStageError';
  }
}

/** A generous ceiling on what one stage may print on each stream; a stage printing more could not run. */
const MAX_STAGE_OUTPUT_BYTES = 64 * 1024 * 1024;

/** How long a stage that was sent the guard's signal has before SIGKILL. */
const STAGE_SIGNAL_GRACE_MS = 500;

/** The eval-quality stages that are running now, each the leader of its own process group. */
const liveStages = new Set();

const GUARDED_SIGNALS = process.platform === 'win32' ? ['SIGINT', 'SIGTERM', 'SIGHUP'] : ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT'];
let guards = null;

/**
 * Ends every live stage: `signal` goes to each stage's process group and, after `graceMs` (a wait that blocks, since the caller is
 * a signal handler about to end the process), SIGKILL follows.
 *
 * @param {NodeJS.Signals} signal
 * @param {number} graceMs
 */
function stopEngineStages(signal, graceMs) {
  stopGroups(liveStages, signal, graceMs);
}

/**
 * While a stage is live, a signal that ends the process ends the stage first. The command's own handler runs ahead of this one
 * (it was registered earlier) and ends the process itself; when this is the only listener the signal's default action would have
 * run, so the guard stops the stages and raises the signal again with the default action restored.
 */
function guardStages() {
  if (guards !== null) return;
  guards = new Map();
  for (const name of GUARDED_SIGNALS) {
    const guard = () => {
      stopEngineStages(name, STAGE_SIGNAL_GRACE_MS);
      if (process.listenerCount(name) > 1) return;
      unguardStages();
      process.kill(process.pid, name);
    };
    guards.set(name, guard);
    process.on(name, guard);
  }
}

function unguardStages() {
  if (guards === null) return;
  for (const [name, guard] of guards) process.removeListener(name, guard);
  guards = null;
}

// A process that ends through `process.exit` leaves no stage running either.
process.on('exit', () => {
  for (const child of liveStages) signalGroup(child, 'SIGKILL');
});

/**
 * Runs `command` as the leader of its own process group with stdin closed, and keeps both streams byte for byte.
 * Resolves with `{ status, signal, stdout, stderr, error }`, as `spawnSync` answers: `error` is a failure to start the program, or
 * a stream past `MAX_STAGE_OUTPUT_BYTES` (the stage is killed and the bytes up to the bound are kept).
 */
function spawnStage(command, commandArgs, env) {
  return new Promise((resolve) => {
    const captured = { stdout: [], stderr: [] };
    const sizes = { stdout: 0, stderr: 0 };
    let overflow = null;
    let child;
    try {
      child = spawn(command, commandArgs, { env, shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      resolve({ status: null, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), error });
      return;
    }
    liveStages.add(child);
    guardStages();
    let settled = false;
    const settle = (status, signal, error) => {
      if (settled) return;
      settled = true;
      liveStages.delete(child);
      if (liveStages.size === 0) unguardStages();
      resolve({
        status,
        signal,
        stdout: Buffer.concat(captured.stdout),
        stderr: Buffer.concat(captured.stderr),
        error: error ?? overflow ?? undefined,
      });
    };
    for (const name of ['stdout', 'stderr']) {
      child[name].on('data', (chunk) => {
        const room = MAX_STAGE_OUTPUT_BYTES - sizes[name];
        const kept = chunk.length > room ? chunk.subarray(0, room) : chunk;
        captured[name].push(kept);
        sizes[name] += kept.length;
        if (chunk.length > room && overflow === null) {
          overflow = Object.assign(new Error(`spawn ${command} ENOBUFS`), { code: 'ENOBUFS' });
          signalGroup(child, 'SIGKILL');
        }
      });
    }
    // A program that cannot start has no pid; an error after the start is the stream's own and the exit still follows.
    child.on('error', (error) => {
      if (child.pid === undefined) settle(null, null, error);
    });
    child.on('close', (status, signal) => settle(status, signal));
  });
}

/**
 * The exits each eval-quality stage documents, which pass through; any other
 * code is reported as a stage that could not run.
 *
 * eval-quality's exit table (`EXIT_CODE_TABLE` in its `dist/cli/render.js`,
 * and `exitCodeFor` in `dist/cli/exit-codes.js`): 0 success, 1 a CONCERNS
 * promoted by `--strict`, 2 FAIL, 3 Invalid or a failed preflight, 4 a
 * structural failure, 5 a runtime fault, 64 usage. Only `score` reaches a
 * verdict, so 2 is a `score` exit alone, and only `preflight` and `score` can
 * be Invalid, so 3 is theirs. `aggregate-strength` produces no verdict and exits
 * 0 whatever its floor decisions are, 4 on a set whose artifacts disagree or
 * contradict themselves and 5 on a fault in its inputs. Exit 1 is left out everywhere: it is a CONCERNS
 * promoted by `--strict`, which `tea-evaluate` never passes, so a 1 is a
 * crashed process with no verdict behind it. The stages are string keys, since
 * `test:evaluate-boundaries` forbids the stage names as identifiers.
 */
const DOCUMENTED_EXITS = new Map([
  ['compile', new Set([0, 4, 5, 64])],
  ['seal', new Set([0, 4, 5, 64])],
  ['preflight', new Set([0, 3, 4, 5, 64])],
  ['score', new Set([0, 2, 3, 4, 5, 64])],
  ['aggregate-strength', new Set([0, 4, 5, 64])],
]);

/**
 * Spawns `eval-quality <stage> ...args` and records the call.
 *
 * A script path (`.js`, `.cjs`, `.mjs`) runs under this process's own Node, so
 * the engine never depends on a shebang or an executable bit; any other path is
 * spawned directly. The record names the executable and whether
 * `TEA_EVALUATE_ENGINE_CLI` substituted it, so the evidence shows which program
 * produced a verdict, and a substitution is announced through `log`.
 *
 * @param {string} stage `compile`, `seal`, `preflight`, `score` or `aggregate-strength`
 * @param {string[]} args
 * @param {object} options
 * @param {string} options.runDirectory `runs/<invocationId>/`; the record goes to `engine/<stage>.json` in it
 * @param {string} options.folder the evaluation folder the call runs over, which the record's argv names files below
 * @param {string|null} [options.scoreInvocation] the score invocation the call belongs to, which the record's argv names as `<score-invocation>`
 * @param {string} [options.recordPath] where the record goes instead, for a stage called more than once in a run (`score`, once per probe, and `aggregate-strength`, in the score directory)
 * @param {{ write: (file: string, bytes: string) => string }} [options.writer] the run directory's writer, which writes the record as a new file and holds its digest (`run-directory.js`)
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {(line: string) => void} [options.log]
 * @returns {Promise<{ exitCode: number, stdout: string, stderr: string, recordPath: string }>}
 * @throws {EngineStageError} when the stage cannot start, is killed by a signal, or exits with an undocumented code
 */
async function runEngineStage(
  stage,
  args,
  { runDirectory, folder, scoreInvocation = null, recordPath: recordAt = null, writer = null, env = process.env, log = () => {} },
) {
  if (typeof folder !== 'string' || folder === '') throw new TypeError('runEngineStage needs the evaluation folder the call runs over');
  const cli = engineCliPath(env);
  const substituted = typeof env[ENGINE_CLI_ENV] === 'string' && env[ENGINE_CLI_ENV].length > 0;
  if (substituted) log(`${ENGINE_CLI_ENV} substitutes ${cli} for the eval-quality CLI`);
  const argv = [stage, ...args];
  const [command, commandArgs] = NODE_SCRIPT.test(cli) ? [process.execPath, [cli, ...argv]] : [cli, argv];
  const ran = await spawnStage(command, commandArgs, env);
  const result = { ...ran, stdout: ran.stdout.toString('utf8'), stderr: ran.stderr.toString('utf8') };
  const exitCode = result.status;
  const recordPath = recordAt ?? path.join(runDirectory, 'engine', `${stage}.json`);
  const recorder = pathRecorder({ folder, scoreInvocation });
  // The argv is recorded first: the output's paths are read back through the forms the argv gave.
  const recordedArgv = argv.map((argument) => recorder.argument(argument));
  const recordedCli = recordedEngineCli(cli, { substituted, packageRoot: enginePackageRoot });
  // A spawn error names the command it tried, which is the Node executable for a script engine: the record and the thrown message name the program by its recorded form.
  const neutral = textNeutralizer({ folder });
  const spawnError =
    result.error === undefined
      ? null
      : neutral(recorder.text(result.error.message.split(command).join(NODE_SCRIPT.test(cli) ? path.basename(command) : recordedCli)));
  const record = {
    stage,
    cli: recordedCli,
    substituted,
    argv: recordedArgv,
    exitCode,
    signal: result.signal,
    error: spawnError,
    stdout: neutral(recorder.text(result.stdout ?? '')),
    stderr: neutral(recorder.text(result.stderr ?? '')),
  };
  if (writer === null) {
    fs.mkdirSync(path.dirname(recordPath), { recursive: true });
    fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  } else {
    writer.write(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  }
  if (result.error) {
    throw new EngineStageError(`could not run eval-quality ${stage} at ${recordedCli}: ${spawnError}`, { cause: result.error });
  }
  // A stage killed by a signal has no exit code of its own, and none is made up
  // for it here.
  if (exitCode === null) throw new EngineStageError(`eval-quality ${stage} was killed by ${result.signal} and reported no exit code`);
  if (!DOCUMENTED_EXITS.get(stage)?.has(exitCode)) {
    throw new EngineStageError(
      `eval-quality ${stage} exited ${exitCode}, which is no exit the CLI documents for ${stage}; its output is in ${recorder.argument(recordPath)}`,
    );
  }
  // The caller reads what the stage printed; only the record states it in the neutral forms.
  return { exitCode, stdout: result.stdout ?? '', stderr: result.stderr ?? '', recordPath };
}

module.exports = { DOCUMENTED_EXITS, EngineStageError, runEngineStage };
