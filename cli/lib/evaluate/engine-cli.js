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
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { ENGINE_CLI_ENV, engineCliPath } = require('./engine');

const NODE_SCRIPT = /\.(?:c|m)?js$/;

/** Raised when a stage could not be run at all, or ended with no exit code; `tea-evaluate` reports it as infrastructure (exit 12). */
class EngineStageError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'EngineStageError';
  }
}

/** A generous ceiling on what one stage may print; a stage printing more could not run. */
const MAX_STAGE_OUTPUT_BYTES = 64 * 1024 * 1024;

/**
 * The exits an eval-quality stage documents, which pass through: 0 success,
 * 2 FAIL, 3 Invalid or a failed preflight, 4 a structural failure, 5 a runtime
 * fault, 64 usage. Exit 1 is left out: it is a CONCERNS promoted by `--strict`,
 * which `tea-evaluate` never passes, so a 1 is a crashed process with no verdict
 * behind it. Any code outside the set is reported as a stage that could not run.
 */
const DOCUMENTED_EXITS = new Set([0, 2, 3, 4, 5, 64]);

/**
 * Spawns `eval-quality <stage> ...args` and records the call.
 *
 * A script path (`.js`, `.cjs`, `.mjs`) runs under this process's own Node, so
 * the engine never depends on a shebang or an executable bit; any other path is
 * spawned directly. The record names the executable and whether
 * `TEA_EVALUATE_ENGINE_CLI` substituted it, so the evidence shows which program
 * produced a verdict, and a substitution is announced through `log`.
 *
 * @param {string} stage `compile`, `seal`, `preflight` or `score`
 * @param {string[]} args
 * @param {object} options
 * @param {string} options.runDirectory `runs/<invocationId>/`; the record goes to `engine/<stage>.json` in it
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {(line: string) => void} [options.log]
 * @returns {{ exitCode: number, stdout: string, stderr: string, recordPath: string }}
 * @throws {EngineStageError} when the stage cannot start, is killed by a signal, or exits with an undocumented code
 */
function runEngineStage(stage, args, { runDirectory, env = process.env, log = () => {} }) {
  const cli = engineCliPath(env);
  const substituted = typeof env[ENGINE_CLI_ENV] === 'string' && env[ENGINE_CLI_ENV].length > 0;
  if (substituted) log(`${ENGINE_CLI_ENV} substitutes ${cli} for the eval-quality CLI`);
  const argv = [stage, ...args];
  const [command, commandArgs] = NODE_SCRIPT.test(cli) ? [process.execPath, [cli, ...argv]] : [cli, argv];
  const result = spawnSync(command, commandArgs, { encoding: 'utf8', env, maxBuffer: MAX_STAGE_OUTPUT_BYTES });
  const exitCode = result.status;
  const directory = path.join(runDirectory, 'engine');
  fs.mkdirSync(directory, { recursive: true });
  const recordPath = path.join(directory, `${stage}.json`);
  const record = {
    stage,
    cli,
    substituted,
    argv,
    exitCode,
    signal: result.signal,
    error: result.error?.message ?? null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
  fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  if (result.error) {
    throw new EngineStageError(`could not run eval-quality ${stage} at ${cli}: ${result.error.message}`, { cause: result.error });
  }
  // A stage killed by a signal has no exit code of its own, and none is made up
  // for it here.
  if (exitCode === null) throw new EngineStageError(`eval-quality ${stage} was killed by ${result.signal} and reported no exit code`);
  if (!DOCUMENTED_EXITS.has(exitCode)) {
    throw new EngineStageError(
      `eval-quality ${stage} exited ${exitCode}, which is no exit the CLI documents; its output is in ${recordPath}`,
    );
  }
  return { exitCode, stdout: record.stdout, stderr: record.stderr, recordPath };
}

module.exports = { DOCUMENTED_EXITS, EngineStageError, runEngineStage };
