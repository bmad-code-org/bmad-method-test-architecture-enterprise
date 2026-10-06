/**
 * `tea-evaluate ci --evaluation <folder> --tier <pr|merge|scheduled|release>`: the checks of one CI tier, run as
 * `ci/evaluation-ci-plan.json` says and enforced through eval-quality's exits alone (AD-10, AD-11, AD-12, CAP-11).
 *
 * The plan (`ci-plan.js`) is the only definition of tier membership. The runtime reads it, validates its placement
 * rules (exit 10 on a finding, 64 when the plan is absent) and runs exactly the checks whose `placement.tier` is the
 * tier asked for, in plan order. Every check runs, whether or not an earlier one failed, so the evidence bundle is
 * complete. An `evaluate` check is run by its id; its `command` records the `tea-evaluate` argv a reader can run by hand, and a pipeline runs `tea-evaluate ci --tier <tier>` once per tier. A
 * `gate` check is an `eval-quality-gates` command the adopter adopted, run as a child process with no shell and the
 * plan's argv, in the evaluation folder, as the leader of a process group of its own: it ends at the plan check's
 * `timeoutMs` or past 64 MiB of output (exit 12, what it printed kept), and a signal to `ci` reaches the group first.
 *
 * Every stage exit passes through verbatim and nothing here computes a verdict from evidence: the engine's exits and
 * the evidence artifact decide. The class and action of an exit are looked up in AD-10's table (`ci-plan.js`), CONCERNS
 * is read from the evidence artifact's `contractVerdict` and is a warning (exit 0 plus a warning line and a `warn` row),
 * and `ci` passes no `--strict`. The final exit is the most severe blocking result in the order 64, 12, 5, 4, 3, 13, 11,
 * 10, 2, 1, then 0.
 *
 * Persistence: `runs/<invocationId>/` is created through `RunDirectory`, so the write rules of Story 1.8 hold. Per
 * check it holds `checks/<id>/exit-code`, `stdout` and `stderr` byte for byte, and `ci.json` (the tier, whether the
 * baseline is stale, each check's exit, class, action and evidence paths, and the final exit). A replay's produced
 * evidence goes to `replay/`. The invocation's one scratch directory sits beneath its private parent in the user's
 * private root (`workspace.js` `makePrivateParent`, the root a confined target is denied) and holds the replay's copy of
 * the folder and every staging directory of an engine call, the replay's `score` included, so one removal of the parent
 * leaves nothing behind.
 *
 * The checks of the `pr` tier that read the committed `baseline/`:
 *
 *   - `replay` places the baseline's bytes at `runs/<acceptedRun>/` in a scratch copy of the evaluation folder (the
 *     sealed records name their artifacts under that path, and `score` refuses a reference outside the run directory
 *     it scores), runs eval-quality's preflight stage over the baseline's contract, probes and observations, and runs
 *     `score` over it (`runScoreCommand`), under the strength floors the baseline's own score recorded. The produced
 *     score subtree is the one `scores/` entry that is new after the call; `baseline/scores/` must hold the accepted
 *     invocation alone, and the manifest's ids must be invocation ids, since each names a directory. The produced
 *     verdict and the per-probe evidence artifacts, strength aggregate and floors file are compared byte for byte with
 *     the baseline's. The stage exits pass through; when they are 0 or 2 and
 *     a file differs, is missing or is extra, the check exits 13 (evaluation evidence drift). Every file `score`
 *     writes under `scores/<id>/` is compared, the call records (each probe's `score.json` and `aggregate-strength.json`)
 *     included, since they record neutral path forms (`recorded-paths.js`) that a replay of the same records writes
 *     again. The one file left out is the invocation's own `scores/<id>/score.json` summary, which names this replay's
 *     invocation id.
 *   - `gameability` scores the gameability arm of every gameability probe through `score` over the baseline's records;
 *     no target launches.
 *   - `oracle-agreement` reads the `corroboration` the engine recorded on each oracle outcome of the baseline evidence.
 *     `disagrees`, or `not-evaluable` or `unreached` on an oracle a behavior of the contract names, exits 11.
 *
 * The live tiers (`merge`, `scheduled`, `release`) drive the commands Epic 1 ships: a live preflight, a twin run (a run
 * of the partition the baseline recorded, so everything for the default `both`, at the scoring policy's
 * `minimumTrialCount`), the held-out partition on its own, judge calibration (read from the
 * report a run writes before its first trial) and a strength comparison against the baseline through `compare.js`. The
 * strength floor is applied per probe class from the floor decisions the engine recorded in the strength aggregate of the
 * twin run and of the held-out run, each on its own: a breach warns on `scheduled` and blocks on `release` (exit 2). A
 * stale baseline (the current contract, corpus or policy digest, or the strength floors, differ from the ones the
 * baseline recorded) warns, and blocks on `release` (exit 11); the rule applies once per tier whenever `baseline/`
 * exists, and each check that reads the baseline carries it too, combined with its own exit by severity. A `refused` comparison, across `evalQualityVersion` included, is informational and
 * routes to `compare --accept`; a probe the baseline measured stronger than this run is a warning.
 *
 * `ci.js` reaches eval-quality only through `engine.js` and `runEngineStage`, so a stage is a string name here.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { checkEvaluation } = require('./check');
const {
  BASELINE,
  baselineTreeFindings,
  lstatOrNull,
  probesOf,
  readBaselineJson,
  readBaselineManifest,
  readEvidence,
  runCompareCommand,
  scoreInvocations,
  walkRegular,
} = require('./compare');
const { buildCorpusIndex, corpusDigestOf } = require('./corpus-index');
const { loadEngine } = require('./engine');
const { runEngineStage } = require('./engine-cli');
const { signalGroup, stopGroups } = require('./process-group');
const { escapeUnprintable, findingLine } = require('./finding-lines');
const { isApiEntry } = require('./http-target');
const { PLAN_PATH, TIERS, classify, mostSevere, readPlan } = require('./ci-plan');
const { PartitionPlanError, loadContractView } = require('./partition');
const { calibrationShortfalls } = require('./calibration');
const { ensureRunsDirectory, newInvocationId, readJson, runPreflightCommand } = require('./preflight');
const { createArtifactValidator } = require('./records');
const { textNeutralizer } = require('./recorded-paths');
const { RunDirectory, RunDirectoryError } = require('./run-directory');
const { runRunCommand } = require('./run');
const { runScoreCommand } = require('./score');
const { regularFileBytes } = require('./score-inputs');
const {
  cleanUpOnSignal,
  heldPrivateRoot,
  makePrivateParent,
  makeScratchDirectory,
  privateRootBase,
  privateRootName,
  removeScratchDirectory,
} = require('./workspace');

const WIRING = 64;
const AUTHORING = 10;
const WEAKNESS = 11;
const INFRASTRUCTURE = 12;
const DRIFT = 13;
const FLOOR_BREACH = 2;
const OK = 0;

const CONTRACT_NAME = 'contract.json';
const POLICY_NAME = 'policy/scoring-policy.json';
const CONFORMANCE_FILE = 'adapter/http-probe-port.conformance.mjs';
const SCRATCH_PREFIX = 'tea-evaluate-replay-';
const OWNER_NAME = '.tea-evaluate-ci-owner.json';
/** What a replay leaves out of its comparison: the invocation's own summary, which names the invocation id of this replay. */
const SUMMARY_RECORD = 'score.json';
/**
 * What a child (a gate, the conformance run) may print and how long it may run. A child that prints more than
 * `MAX_OUTPUT_BYTES` (64 MiB, both streams together) is killed and the check exits 12 with what was captured; a gate
 * that runs past its plan check's `timeoutMs` (`DEFAULT_GATE_TIMEOUT_MS` when the plan names none) is stopped the same way.
 */
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const DEFAULT_GATE_TIMEOUT_MS = 600_000;
const CONFORMANCE_TIMEOUT_MS = 120_000;
/** How long a child that was sent SIGTERM for a timeout has before SIGKILL, and how long it has after a forwarded SIGINT or SIGTERM of `ci`. */
const TIMEOUT_KILL_GRACE_MS = 2000;
const SIGNAL_GRACE_MS = 500;
/** How long a child's streams may stay open after it exited (a descendant holding them) before its group is killed. */
const STREAM_CLOSE_GRACE_MS = 2000;
/** The lines of a failing check's output the summary repeats; the whole of it is in `checks/<id>/stdout`. */
const SUMMARY_LINES = 40;
/** The characters of one such line the summary repeats. */
const SUMMARY_LINE_CHARS = 400;

/** The outcome of one `tea-evaluate ci`. */
class CiOutcome {
  constructor({ exitCode, message, findings = [], runDirectory = null, report = [], checks = [] }) {
    this.exitCode = exitCode;
    this.message = message;
    this.findings = findings;
    this.runDirectory = runDirectory;
    this.report = report;
    this.checks = checks;
  }
}

/** A check's result: its exit, the bytes its two streams hold and what the summary and `ci.json` carry; `source` names the tool when the runtime made the exit itself. */
function result(exitCode, { stdout = '', stderr = '', warnings = [], notes = [], runs = [], artifacts = [], source } = {}) {
  return { exitCode, stdout, stderr, warnings, notes, runs, artifacts, source };
}

/** `tea-evaluate <name>`'s printed output for a command's outcome, as `cli/evaluate.js` prints it. */
function printedOutcome(name, outcome, logged) {
  const out = [];
  for (const finding of outcome.findings ?? []) out.push(findingLine(finding.file, finding.rule, finding.message));
  for (const line of outcome.report ?? []) out.push(`${escapeUnprintable(line)}\n`);
  for (const entry of outcome.scores ?? []) {
    const how = entry.exitCode === null ? 'could not run' : `exited ${entry.exitCode}`;
    out.push(
      `${escapeUnprintable(entry.probeId)}: eval-quality score ${how}; ${escapeUnprintable(entry.evidence ?? 'no evidence artifact')}\n`,
    );
  }
  const [summary, ...detail] = String(outcome.message).trimEnd().split('\n');
  const err = [...logged, ...detail].map((line) => `tea-evaluate ${name}: ${escapeUnprintable(line)}\n`);
  out.push(`tea-evaluate ${name}: ${escapeUnprintable(summary)} (exit ${outcome.exitCode})\n`);
  return { stdout: out.join(''), stderr: err.join('') };
}

function relativeTo(folder, file) {
  return path.relative(folder, file).split(path.sep).join('/');
}

// ---------------------------------------------------------------------------
// The invocation

/**
 * Removes what a killed `ci` over this evaluation folder left in the user's private root: a private parent
 * (`run-<pid>-*`) whose pid is gone and whose replay scratch directory carries an owner file naming that pid and this
 * folder. A parent of another folder, of an owner that still runs, or one with no owner file is left as it is.
 */
function reclaimReplayScratch(folder, log) {
  if (process.platform === 'win32') return;
  const root = heldPrivateRoot(path.join(privateRootBase(), privateRootName()));
  if (root === null) return;
  let names;
  try {
    names = fs.readdirSync(root);
  } catch {
    return;
  }
  const real = fs.realpathSync.native(folder);
  for (const name of names) {
    const parent = path.join(root, name);
    const named = /^run-(\d+)-/.exec(name);
    if (named === null) continue;
    try {
      const pid = Number(named[1]);
      const replay = fs.readdirSync(parent).find((entry) => entry.startsWith(SCRATCH_PREFIX));
      if (replay === undefined) continue;
      const owner = JSON.parse(fs.readFileSync(path.join(parent, replay, OWNER_NAME), 'utf8'));
      if (owner.folder !== real || owner.pid !== pid || !Number.isInteger(pid) || pid <= 0) continue;
      try {
        process.kill(pid, 0);
        continue;
      } catch (error) {
        if (error.code !== 'ESRCH') continue;
      }
      removeScratchDirectory(parent);
      log(`removed the replay scratch directory ${path.join(parent, replay)}, which a killed ci run left behind`);
    } catch {
      // Not a directory this command owns, or one it cannot read: left as it is.
    }
  }
}

/**
 * Runs `tea-evaluate ci` over one evaluation folder.
 *
 * @param {string} folder the resolved evaluation folder
 * @param {object} options
 * @param {string} options.tier `pr`, `merge`, `scheduled` or `release`
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {(line: string) => void} [options.log]
 * @returns {Promise<CiOutcome>}
 */
async function runCiCommand(folder, { tier, env = process.env, log = () => {} } = {}) {
  if (!TIERS.includes(tier)) {
    return new CiOutcome({ exitCode: WIRING, message: `unknown tier ${JSON.stringify(tier)}; choose ${TIERS.join(', ')}` });
  }
  const read = readPlan(folder);
  if (read.absent) {
    return new CiOutcome({
      exitCode: WIRING,
      findings: [
        {
          file: PLAN_PATH,
          rule: 'wiring',
          message: `the evaluation has no CI plan at ${read.path}; write one, or run the ci stage of the Evaluate skill`,
        },
      ],
      message: `no ${PLAN_PATH}; nothing ran`,
    });
  }
  if (read.plan === undefined) {
    return new CiOutcome({
      exitCode: AUTHORING,
      findings: read.findings,
      message: `${read.findings.length} problem(s) in ${PLAN_PATH}; nothing ran`,
    });
  }
  const checks = read.plan.checks.filter((entry) => entry.placement.tier === tier);

  reclaimReplayScratch(folder, log);
  let writer;
  try {
    writer = RunDirectory.create(ensureRunsDirectory(folder), newInvocationId());
  } catch (error) {
    if (!(error instanceof RunDirectoryError)) throw error;
    return new CiOutcome({ exitCode: INFRASTRUCTURE, message: `the CI run directory cannot be created: ${error.message}` });
  }
  const scratch = [];
  const removeScratch = () => {
    for (const directory of scratch.splice(0)) {
      try {
        removeScratchDirectory(directory);
      } catch (error) {
        scratch.push(directory);
        log(`could not remove the private directory ${directory}: ${error.message}`);
      }
    }
  };
  const context = createContext({ folder, tier, env, log, writer, scratch });
  // An interrupting signal ends the engine stage that is running (`cleanUpOnSignal` does, before this handler), reaches the gate's
  // process group and removes the scratch directory.
  const release = cleanUpOnSignal([], new AbortController(), {
    onSignal: (name) => {
      stopChildren(context, name, SIGNAL_GRACE_MS);
      removeScratch();
    },
  });
  try {
    const rows = [];
    for (const entry of checks) rows.push(await runCheck(context, entry));
    const baseline = rows.length === 0 ? null : await tierBaseline(context);
    return finish({ folder, tier, writer, rows, baseline });
  } finally {
    release();
    stopChildren(context, 'SIGKILL', 0);
    removeScratch();
    writer.close();
  }
}

/** The per-invocation state every check shares: the run directory, the scratch list, the running children and the memoized baseline reads. */
function createContext({ folder, tier, env, log, writer, scratch }) {
  const memo = new Map();
  const context = {
    folder,
    tier,
    env,
    log,
    writer,
    scratch,
    /** The child processes (each the leader of its own process group) the invocation has running. */
    children: new Set(),
    /** `make()`'s value, computed once per invocation. */
    once(key, make) {
      if (!memo.has(key)) memo.set(key, make());
      return memo.get(key);
    },
  };
  return context;
}

/**
 * The invocation's one scratch directory (`tea-evaluate-replay-*`) beneath the invocation's private parent, which is the
 * first entry of the scratch list (`makePrivateParent`, so a signal or the end of the run removes the parent and with it
 * everything below), with an owner file naming the pid and the evaluation folder so the next `ci` over the folder can
 * reclaim it after a kill that no handler saw. The replay's copy of the evaluation folder, every staging directory of an
 * engine call and the staging root of the replay's `score` live inside it.
 */
function invocationScratch(context) {
  return context.once('scratch-root', () => {
    makePrivateParent(context.scratch);
    const directory = makeScratchDirectory(context.scratch, SCRATCH_PREFIX);
    fs.writeFileSync(
      path.join(directory, OWNER_NAME),
      `${JSON.stringify({ pid: process.pid, folder: fs.realpathSync.native(context.folder) })}\n`,
    );
    return directory;
  });
}

/** A private directory inside the invocation's scratch directory, which the invocation removes however it ends. */
function stagingDirectory(context, prefix) {
  return makeScratchDirectory(context.scratch, prefix, invocationScratch(context));
}

async function runCheck(context, entry) {
  const logged = [];
  const scoped = {
    ...context,
    log: (line) => {
      logged.push(line);
      context.log(line);
    },
  };
  let outcome;
  try {
    outcome = entry.kind === 'gate' ? await runGate(scoped, entry) : await EVALUATE_CHECKS[entry.id](scoped, entry);
    if (entry.kind === 'evaluate' && READS_BASELINE.has(entry.id)) outcome = await applyStaleness(scoped, outcome);
  } catch (error) {
    // An engine that cannot run, or a stage killed or exiting undocumented, is infrastructure; so is anything unexpected,
    // since exit 1 means nothing in AD-10's table for tea-evaluate. The message is kept; the stack trace is dropped.
    outcome = result(INFRASTRUCTURE, { stderr: `${escapeUnprintable(String(error?.message ?? error))}\n`, source: 'tea-evaluate' });
  }
  if (outcome.stderr === '' && logged.length > 0) outcome.stderr = `${logged.map((line) => escapeUnprintable(line)).join('\n')}\n`;
  // What an `evaluate` check printed and logged is uploaded with `runs/`, so it is recorded in the neutral forms; a gate's output is the gate's own.
  if (entry.kind === 'evaluate') {
    const neutral = textNeutralizer({ folder: context.folder });
    outcome = {
      ...outcome,
      stdout: neutral(outcome.stdout),
      stderr: neutral(outcome.stderr),
      warnings: outcome.warnings.map(neutral),
      notes: outcome.notes.map(neutral),
    };
  }
  // The action comes from AD-10's table alone; the plan's `enforcement` records the class and changes nothing here.
  const classified = classify(entry.kind, outcome.exitCode, outcome.source);
  let { action } = classified;
  if (action === 'pass' && outcome.warnings.length > 0) action = 'warn';
  const base = `checks/${entry.id}`;
  context.writer.write(`${base}/exit-code`, `${outcome.exitCode}\n`);
  context.writer.write(`${base}/stdout`, outcome.stdout);
  context.writer.write(`${base}/stderr`, outcome.stderr);
  return {
    id: entry.id,
    kind: entry.kind,
    tier: entry.placement.tier,
    exit: outcome.exitCode,
    class: classified.class,
    action,
    enforcement: entry.enforcement,
    evidence: entry.evidence,
    files: [`${base}/exit-code`, `${base}/stdout`, `${base}/stderr`, ...outcome.artifacts],
    runs: outcome.runs,
    warnings: outcome.warnings,
    notes: outcome.notes,
    stdout: Buffer.isBuffer(outcome.stdout) ? outcome.stdout.toString('utf8') : outcome.stdout,
  };
}

/** `ci.json`, the summary, and the final exit: the most severe blocking result. */
function finish({ folder, tier, writer, rows, baseline }) {
  const blocking = rows.filter((row) => row.action === 'block').map((row) => row.exit);
  // The stale-baseline rule applies once per tier, whichever checks the plan holds: it blocks `release`, and a failed
  // staleness check is infrastructure.
  if (baseline?.error !== undefined) blocking.push(INFRASTRUCTURE);
  else if (baseline?.stale === true && tier === 'release') blocking.push(WEAKNESS);
  const exitCode = mostSevere(blocking);
  const warnings = [...new Set(rows.flatMap((row) => row.warnings))];
  if (baseline?.stale === true && tier !== 'release') {
    const message = staleMessage(baseline.reasons);
    if (!warnings.includes(message)) warnings.push(message);
  }
  writer.writeJson('ci.json', {
    invocationId: path.basename(writer.root),
    tier,
    plan: PLAN_PATH,
    baseline,
    checks: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      tier: row.tier,
      exit: row.exit,
      class: row.class,
      action: row.action,
      enforcement: row.enforcement,
      evidence: row.evidence,
      files: row.files,
      runs: row.runs,
      warnings: row.warnings,
      notes: row.notes,
    })),
    warnings,
    exit: exitCode,
  });
  const report = [];
  for (const row of rows) {
    report.push(`${row.id}: exit ${row.exit} (${row.class}), ${row.action}`);
    if (row.action !== 'pass') {
      const shown = row.stdout.split('\n').filter((line) => line !== '');
      for (const line of shown.slice(0, SUMMARY_LINES)) {
        report.push(
          `  ${line.length > SUMMARY_LINE_CHARS ? `${line.slice(0, SUMMARY_LINE_CHARS)}... (${line.length - SUMMARY_LINE_CHARS} more character(s))` : line}`,
        );
      }
      if (shown.length > SUMMARY_LINES) {
        report.push(
          `  ... ${shown.length - SUMMARY_LINES} more line(s) in ${relativeTo(folder, writer.pathOf(`checks/${row.id}/stdout`))}`,
        );
      }
      for (const note of row.notes) report.push(`  note: ${note}`);
    }
  }
  for (const warning of warnings) report.push(`warning: ${warning}`);
  if (baseline?.error !== undefined) report.push(`baseline: the staleness check could not run: ${baseline.error}`);
  const blocked = rows.filter((row) => row.action === 'block').length;
  const warned = rows.filter((row) => row.action === 'warn').length;
  return new CiOutcome({
    exitCode,
    runDirectory: writer.root,
    report,
    checks: rows,
    message:
      rows.length === 0
        ? `the ${tier} tier has no checks in the plan; nothing ran`
        : `${rows.length} check(s) of the ${tier} tier ran, ${blocked} blocking, ${warned} warning; the evidence is in ${relativeTo(folder, writer.root)}`,
  });
}

// ---------------------------------------------------------------------------
// Child processes: gate checks and the conformance run

/**
 * Ends every child the invocation has running (`stopGroups`, `process-group.js`): `signal` goes to its process group first and,
 * once `graceMs` has passed, SIGKILL follows. Nothing a gate started outlives `ci` that way, except when `ci` itself is killed
 * with SIGKILL, which no handler sees. The engine stages end through `cleanUpOnSignal`, which stops them before this runs.
 */
function stopChildren(context, signal, graceMs) {
  stopGroups(context.children, signal, graceMs);
}

/**
 * Runs `command` with `args` and no shell, stdin closed, as the leader of a process group of its own, in `cwd` under the
 * invocation's environment. Both streams are captured byte for byte, whatever the exit.
 *
 * The child ends early when it runs past `timeoutMs` (SIGTERM to its group, then SIGKILL) or prints more than
 * `MAX_OUTPUT_BYTES` (SIGKILL; the captured bytes stop at the bound; output of exactly the bound passes). Once the child has
 * ended its process group is killed, so no descendant outlives the call. Resolves with `{ status, signal, stdout, stderr,
 * ended, error }`: `ended` names why the runtime stopped it (`timeout`, `output`), `error` is a failure to start it.
 */
function runChild(context, { command, args, cwd, timeoutMs }) {
  return new Promise((resolve) => {
    const captured = { stdout: [], stderr: [] };
    let size = 0;
    let ended = null;
    const timers = [];
    let child;
    try {
      child = spawn(command, args, { cwd, env: context.env, shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      resolve({ status: null, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), ended, error });
      return;
    }
    context.children.add(child);
    let settled = false;
    const settle = (status, signal, error) => {
      if (settled) return;
      settled = true;
      for (const timer of timers) clearTimeout(timer);
      context.children.delete(child);
      // Whatever the group still holds is killed once its leader has ended, a descendant that closed its streams included.
      if (child.pid !== undefined) signalGroup(child, 'SIGKILL');
      resolve({
        status,
        signal,
        stdout: Buffer.concat(captured.stdout),
        stderr: Buffer.concat(captured.stderr),
        ended,
        error,
      });
    };
    const stop = (reason, signal) => {
      ended ??= reason;
      signalGroup(child, signal);
    };
    for (const name of ['stdout', 'stderr']) {
      child[name].on('data', (chunk) => {
        const room = MAX_OUTPUT_BYTES - size;
        if (room <= 0) {
          stop('output', 'SIGKILL');
          return;
        }
        const kept = chunk.length > room ? chunk.subarray(0, room) : chunk;
        captured[name].push(kept);
        size += kept.length;
        // Output of exactly the bound passes; the first byte past it stops the child.
        if (chunk.length > room) stop('output', 'SIGKILL');
      });
    }
    if (timeoutMs !== undefined) {
      timers.push(
        setTimeout(() => {
          stop('timeout', 'SIGTERM');
          timers.push(setTimeout(() => signalGroup(child, 'SIGKILL'), TIMEOUT_KILL_GRACE_MS));
        }, timeoutMs),
      );
    }
    child.on('error', (error) => {
      if (child.pid === undefined) settle(null, null, error);
    });
    child.on('exit', (status, signal) => {
      // A descendant that kept the streams open after the child ended is killed with the rest of its group.
      timers.push(
        setTimeout(() => {
          signalGroup(child, 'SIGKILL');
          child.stdout?.destroy();
          child.stderr?.destroy();
          settle(status, signal);
        }, STREAM_CLOSE_GRACE_MS),
      );
    });
    child.on('close', (status, signal) => settle(status, signal));
  });
}

/** What a stopped or unstartable child means for its check; null when it ran to an exit of its own. */
function childProblem(ran, command, { timeoutMs }) {
  if (ran.error !== undefined) return `could not start ${command}: ${ran.error.message}`;
  if (ran.ended === 'timeout') return `${command} ran past its ${timeoutMs} ms limit and was stopped`;
  if (ran.ended === 'output')
    return `${command} printed more than ${MAX_OUTPUT_BYTES} bytes and was stopped; what it printed up to the bound is kept`;
  if (ran.status === null) return `${command} ended with no exit code (${ran.signal ?? 'unknown'})`;
  return null;
}

/** A `gate` check: the plan's argv as a child process with no shell, its three outputs kept whatever its exit. */
async function runGate(context, entry) {
  const [command, ...args] = entry.command;
  const timeoutMs = entry.timeoutMs ?? DEFAULT_GATE_TIMEOUT_MS;
  const ran = await runChild(context, { command, args, cwd: context.folder, timeoutMs });
  const problem = childProblem(ran, command, { timeoutMs });
  if (ran.error !== undefined) {
    return result(INFRASTRUCTURE, { stdout: ran.stdout, stderr: `${problem}\n`, notes: [problem], source: 'tea-evaluate' });
  }
  if (problem !== null) return result(INFRASTRUCTURE, { stdout: ran.stdout, stderr: ran.stderr, notes: [problem], source: 'tea-evaluate' });
  return result(ran.status, { stdout: ran.stdout, stderr: ran.stderr });
}

// ---------------------------------------------------------------------------
// evaluate checks

async function checkCheck(context) {
  // The check's engine compile works in a directory on the invocation's list, beside the replay's scratch directory, which carries the
  // owner file: a signal removes the private parent, and the next `ci` over the folder removes it after a SIGKILL.
  invocationScratch(context);
  const findings = await checkEvaluation(context.folder, { env: context.env, scratch: context.scratch });
  const text = findings.map((entry) => findingLine(entry.file, entry.rule, entry.message));
  text.push(
    findings.length === 0
      ? `tea-evaluate check: ${context.folder} has no authoring defects\n`
      : `tea-evaluate check: ${findings.length} authoring defect(s) in ${context.folder}\n`,
  );
  return result(findings.length === 0 ? OK : AUTHORING, { stdout: text.join('') });
}

/** `compile` and `seal` over the evaluation's `contract.json`, through the engine CLI; the stage's exit passes through. */
async function engineStageCheck(context, entry, stage, produced) {
  const staging = stagingDirectory(context, 'tea-evaluate-engine-');
  const output = path.join(staging, produced);
  const called = await runEngineStage(stage, ['--in', path.join(context.folder, CONTRACT_NAME), '--out', output], {
    runDirectory: context.writer.root,
    folder: context.folder,
    recordPath: `checks/${entry.id}/engine.json`,
    writer: context.writer,
    env: context.env,
    log: context.log,
  });
  const artifacts = [`checks/${entry.id}/engine.json`];
  if (fs.existsSync(output)) {
    context.writer.copyIn(`checks/${entry.id}/${produced}`, output);
    artifacts.push(`checks/${entry.id}/${produced}`);
  }
  return result(called.exitCode, { stdout: called.stdout, stderr: called.stderr, artifacts });
}

/** eval-quality's environment-probe conformance suite over the evaluation's HTTP port, against a loopback stub it starts and closes itself. */
async function apiConformanceCheck(context) {
  let evaluation;
  try {
    evaluation = readJson(path.join(context.folder, 'evaluation.json'));
  } catch (error) {
    return result(AUTHORING, { stdout: `${findingLine('evaluation.json', 'json', `cannot be read: ${error.message}`)}` });
  }
  if (!(evaluation.registry ?? []).some(isApiEntry)) {
    return result(WIRING, {
      stdout: `${findingLine(PLAN_PATH, 'wiring', 'the evaluation declares no HTTP target, so there is no port to hold to conformance; take api-conformance out of the plan')}`,
    });
  }
  const file = path.join(context.folder, ...CONFORMANCE_FILE.split('/'));
  if (!fs.existsSync(file)) {
    return result(AUTHORING, {
      stdout: `${findingLine(CONFORMANCE_FILE, 'adapter', "is absent; render it from the Evaluate skill's template beside the HTTP port")}`,
    });
  }
  const ran = await runChild(context, { command: process.execPath, args: [file], cwd: context.folder, timeoutMs: CONFORMANCE_TIMEOUT_MS });
  const problem = childProblem(ran, 'the conformance run', { timeoutMs: CONFORMANCE_TIMEOUT_MS });
  if (problem !== null) return result(INFRASTRUCTURE, { stdout: ran.stdout, stderr: ran.stderr, notes: [problem] });
  // The conformance file exits 1 when an assertion fails: the adopter's port does not answer as the suite requires.
  return result(ran.status === 0 ? OK : ran.status === 1 ? AUTHORING : INFRASTRUCTURE, { stdout: ran.stdout, stderr: ran.stderr });
}

// --- the baseline

/** A path below `root` made of `segments`; an Error when it resolves anywhere else, so no id names a place outside its directory. */
function confine(root, ...segments) {
  const base = path.resolve(root);
  const resolved = path.resolve(base, ...segments);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) throw new Error(`${resolved} is outside ${base}`);
  return resolved;
}

/**
 * What the manifest names must be what `baseline/` holds: `scores/` is a real directory holding the accepted score
 * invocation, as a real directory, and nothing else (AD-12 keeps the latest subtree alone), so the replay compares the
 * baseline with a produced subtree.
 */
function baselineLayoutFindings(directory, manifest) {
  const findings = [];
  const scores = path.join(directory, 'scores');
  const problem = (message) => findings.push({ file: `${BASELINE}/scores`, rule: 'baseline-file', message });
  const stats = lstatOrNull(scores);
  if (stats === null || !stats.isDirectory()) {
    problem('is not a real directory holding the accepted score invocation');
    return findings;
  }
  const names = fs.readdirSync(scores).sort();
  if (names.length !== 1 || names[0] !== manifest.scoreInvocationId) {
    const held = names.length === 0 ? 'nothing' : names.map((name) => JSON.stringify(name)).join(', ');
    problem(`holds ${held}; the baseline keeps the accepted score invocation ${manifest.scoreInvocationId} alone (AD-12)`);
    return findings;
  }
  const accepted = lstatOrNull(path.join(scores, manifest.scoreInvocationId));
  if (accepted === null || !accepted.isDirectory()) problem(`${manifest.scoreInvocationId} is not a real directory`);
  return findings;
}

/** What `baseline/` holds and what a check that reads it needs; `problem()` makes a finished result when it cannot be read. */
function locateBaseline(context) {
  return context.once('baseline', () => {
    const directory = path.join(context.folder, BASELINE);
    const stats = lstatOrNull(directory);
    if (stats === null) {
      return {
        absent: true,
        problem: () =>
          result(WIRING, {
            stdout: findingLine(
              BASELINE,
              'wiring',
              `${directory} holds no baseline to read; accept a scored run with tea-evaluate compare --accept in a reviewed pull request`,
            ),
          }),
      };
    }
    const findings = [];
    if (stats.isDirectory()) findings.push(...baselineTreeFindings(context.folder));
    else findings.push({ file: BASELINE, rule: 'baseline-file', message: 'is a link or a file where the baseline directory is required' });
    const { manifest, findings: manifestFindings } =
      findings.length === 0 ? readBaselineManifest(context.folder) : { manifest: null, findings: [] };
    findings.push(...manifestFindings);
    if (findings.length === 0) findings.push(...baselineLayoutFindings(directory, manifest));
    const record = findings.length === 0 ? readBaselineJson(directory, 'run.json', findings) : null;
    if (findings.length > 0) {
      return {
        problem: () => result(AUTHORING, { stdout: findings.map((entry) => findingLine(entry.file, entry.rule, entry.message)).join('') }),
      };
    }
    return { directory, manifest, record };
  });
}

/** The strength floors the baseline's score recorded (`strength-floors.json`), or null when that file is not a readable JSON object. */
function baselineFloors(baseline) {
  try {
    const file = path.join(baseline.directory, 'scores', baseline.manifest.scoreInvocationId, 'strength-floors.json');
    const value = JSON.parse(regularFileBytes(file).toString('utf8'));
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/** `value` serialized with its keys in order, so two floors objects compare by content. */
function stable(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return JSON.stringify(value ?? null);
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
    .join(',')}}`;
}

/**
 * Why the baseline is stale: the current contract, corpus, policy or strength floors differ from the ones the baseline
 * recorded (the digests in `baseline.json`, the floors in its score's `strength-floors.json`).
 */
function staleBaseline(context, baseline) {
  return context.once('stale', async () => {
    const engine = await loadEngine();
    const reasons = [];
    try {
      const digest = await corpusDigestOf(await buildCorpusIndex(context.folder));
      if (digest !== baseline.manifest.corpusDigest)
        reasons.push(`the corpus digest is ${digest}, the baseline's ${baseline.manifest.corpusDigest}`);
    } catch (error) {
      reasons.push(`the corpus digest cannot be computed (${error.message})`);
    }
    try {
      const digest = engine.digestBytes(fs.readFileSync(path.join(context.folder, ...POLICY_NAME.split('/'))));
      if (digest !== baseline.manifest.policyDigest)
        reasons.push(`the policy digest is ${digest}, the baseline's ${baseline.manifest.policyDigest}`);
    } catch (error) {
      reasons.push(`the scoring policy cannot be read (${error.message})`);
    }
    const recorded = baselineFloors(baseline);
    if (recorded !== null) {
      let current;
      try {
        current = readJson(path.join(context.folder, 'evaluation.json')).strengthFloor;
      } catch {
        current = undefined;
      }
      if (stable(current) !== stable(recorded))
        reasons.push(`the strength floors are ${stable(current)}, the baseline's ${stable(recorded)}`);
    }
    const staging = stagingDirectory(context, 'tea-evaluate-engine-');
    const compiled = path.join(staging, 'eval-contract.json');
    // The baseline's compiled contract is the one its partition ran (Story 1.51), which under a partition plan is the
    // folder's contract.json for the development partition and a derived view for the others.
    let contractFile = path.join(context.folder, CONTRACT_NAME);
    let viewProblem = null;
    let evaluation = null;
    try {
      evaluation = readJson(path.join(context.folder, 'evaluation.json'));
    } catch {
      // An evaluation.json that cannot be read is the check's finding, and the folder's contract.json is compiled as before.
    }
    if (evaluation?.partitionPlan !== undefined && baseline.manifest.partition !== 'development') {
      try {
        const view = loadContractView({ folder: context.folder, evaluation, partition: baseline.manifest.partition });
        const staged = path.join(staging, CONTRACT_NAME);
        fs.writeFileSync(staged, view.bytes);
        // The compile reads the staged view only once it is written.
        contractFile = staged;
      } catch (error) {
        // Every failure to derive the view is a reason, so a baseline is never passed without its digest comparison.
        viewProblem = error instanceof PartitionPlanError ? error.message : `an unexpected ${error?.name ?? 'error'} while deriving it`;
      }
    }
    if (viewProblem !== null) reasons.push(`the ${baseline.manifest.partition} view of the contract cannot be derived (${viewProblem})`);
    const stage = await runEngineStage('compile', ['--in', contractFile, '--out', compiled], {
      runDirectory: context.writer.root,
      folder: context.folder,
      recordPath: 'baseline-staleness/engine.json',
      writer: context.writer,
      env: context.env,
      log: context.log,
    });
    // A contract that does not compile is the compile check's finding; there is no compiled digest to compare.
    if (stage.exitCode === 0 && fs.existsSync(compiled)) {
      const digest = engine.digestArtifact(JSON.parse(fs.readFileSync(compiled, 'utf8')), 'EvalContract');
      if (digest !== baseline.manifest.contractDigest)
        reasons.push(`the contract digest is ${digest}, the baseline's ${baseline.manifest.contractDigest}`);
    }
    return reasons;
  });
}

function staleMessage(reasons) {
  return `the baseline is stale (${reasons.join('; ')}); re-record it with tea-evaluate compare --accept in a reviewed pull request`;
}

/** The checks whose result the stale-baseline rule reads: each one reads `baseline/` or measures against it. */
const READS_BASELINE = new Set(['replay', 'gameability', 'oracle-agreement', 'twin-run', 'strength-comparison']);

/**
 * The stale-baseline rule over a result of a check that reads `baseline/`: a warning, and on `release` exit 11 combined
 * with the check's own exit by severity, so the stale finding stays visible next to a non-zero exit of the check. Nothing applies when the
 * baseline cannot be read, which the check reports itself.
 */
async function applyStaleness(context, outcome) {
  const baseline = locateBaseline(context);
  if (baseline.problem !== undefined) return outcome;
  const reasons = await staleBaseline(context, baseline);
  if (reasons.length === 0) return outcome;
  const message = staleMessage(reasons);
  if (context.tier === 'release') {
    outcome.exitCode = mostSevere([outcome.exitCode, WEAKNESS]);
    outcome.stdout += findingLine(BASELINE, 'stale-baseline', message);
  } else {
    outcome.warnings.push(message);
  }
  return outcome;
}

/**
 * The stale-baseline rule once for the tier, whichever checks the plan holds: `null` when `baseline/` is absent or
 * unreadable (the checks that read it say so), otherwise whether it is stale and why. A failed staleness check carries
 * its message in `error`.
 */
async function tierBaseline(context) {
  const baseline = locateBaseline(context);
  if (baseline.absent === true || baseline.problem !== undefined) return null;
  try {
    // `ci.json` records the reasons in the neutral forms, as each check's warning does, so the tier's warning is the same text.
    const neutral = textNeutralizer({ folder: context.folder });
    const reasons = (await staleBaseline(context, baseline)).map(neutral);
    return { stale: reasons.length > 0, reasons };
  } catch (error) {
    return { stale: false, reasons: [], error: textNeutralizer({ folder: context.folder })(String(error?.message ?? error)) };
  }
}

// --- the replay

/** Every regular file under `root/relative` as `path below relative -> bytes`, the invocation's summary left out; null with findings when a link is met. */
function evidenceFiles(root, relative) {
  const files = new Map();
  const findings = [];
  walkRegular(
    root,
    relative,
    (child) => {
      const name = child.slice(relative.length + 1);
      if (name === SUMMARY_RECORD) return;
      files.set(name, regularFileBytes(path.join(root, ...child.split('/'))));
    },
    findings,
    'baseline-file',
    '',
  );
  return { files, findings };
}

/**
 * The scratch copy of the evaluation folder with the baseline's bytes placed at `runs/<acceptedRun>/`, built once per
 * invocation. Baseline bytes are read only from `baseline/`; `baseline.json` is the manifest and is not part of a run.
 * The copy's `strengthFloor` is the floors the baseline's own score recorded, so the replay scores the baseline as it
 * was accepted and an edit to the floors since is a stale baseline.
 */
function scratchRun(context, baseline) {
  return context.once('scratch', () => {
    const directory = invocationScratch(context);
    const folder = path.join(directory, 'evaluation');
    const skipped = new Set(['runs', BASELINE, 'node_modules', '.git']);
    fs.cpSync(context.folder, folder, {
      recursive: true,
      filter: (source) => {
        const relative = path.relative(context.folder, source);
        return relative === '' || !skipped.has(relative.split(path.sep)[0]);
      },
    });
    const floors = baselineFloors(baseline);
    if (floors !== null) {
      const file = path.join(folder, 'evaluation.json');
      try {
        const evaluation = readJson(file);
        evaluation.strengthFloor = floors;
        fs.writeFileSync(file, `${JSON.stringify(evaluation, null, 2)}\n`);
      } catch {
        // An evaluation.json that cannot be read is what `score` reports for the copy.
      }
    }
    const acceptedRun = baseline.manifest.acceptedRun;
    const runDirectory = confine(folder, 'runs', acceptedRun);
    fs.mkdirSync(path.dirname(runDirectory), { recursive: true });
    fs.cpSync(baseline.directory, runDirectory, {
      recursive: true,
      filter: (source) => source !== path.join(baseline.directory, 'baseline.json'),
    });
    const stagingRoot = path.join(directory, 'score-staging');
    fs.mkdirSync(stagingRoot);
    return { directory, folder, runDirectory, acceptedRun, stagingRoot };
  });
}

/** eval-quality's preflight stage over the baseline's contract, probes and observations; its verdict is copied to `replay/`. */
function replayPreflight(context, baseline) {
  return context.once('replay-preflight', async () => {
    const scratch = scratchRun(context, baseline);
    const staging = path.join(scratch.directory, 'preflight');
    fs.mkdirSync(staging);
    const output = path.join(staging, 'preflight-verdict.json');
    const stage = await runEngineStage(
      'preflight',
      [
        '--contract',
        path.join(scratch.runDirectory, CONTRACT_NAME),
        '--probes',
        path.join(scratch.runDirectory, 'probes.json'),
        '--observations',
        path.join(scratch.runDirectory, 'observations.json'),
        '--run-id',
        scratch.acceptedRun,
        '--out',
        output,
      ],
      {
        runDirectory: context.writer.root,
        folder: scratch.folder,
        recordPath: 'replay/engine/preflight.json',
        writer: context.writer,
        env: context.env,
        log: context.log,
      },
    );
    let verdict = null;
    if (fs.existsSync(output)) {
      verdict = fs.readFileSync(output);
      context.writer.write('replay/preflight-verdict.json', verdict);
    }
    return { exitCode: stage.exitCode, stderr: stage.stderr, verdict };
  });
}

/**
 * `score` over the placed baseline in the scratch copy; every file it wrote is copied to `replay/scores/`. The produced
 * subtree is the one `scores/` entry that is new after the call, so no entry already there (the accepted one, or a
 * planted one) is ever read as produced. The call's staging directories live in the scratch directory.
 */
function replayScore(context, baseline) {
  return context.once('replay-score', async () => {
    const scratch = scratchRun(context, baseline);
    const logged = [];
    const before = new Set(scoreInvocations(scratch.runDirectory) ?? []);
    const outcome = await runScoreCommand(scratch.folder, {
      run: scratch.acceptedRun,
      env: context.env,
      stagingRoot: scratch.stagingRoot,
      log: (line) => {
        logged.push(line);
        context.log(line);
      },
    });
    const created = (scoreInvocations(scratch.runDirectory) ?? []).filter((name) => !before.has(name));
    const scoreId = created.length === 1 ? created[0] : null;
    let produced = new Map();
    if (scoreId !== null) {
      const relative = `scores/${scoreId}`;
      ({ files: produced } = evidenceFiles(scratch.runDirectory, relative));
      // Everything the score wrote is kept as evidence, its summary included; the comparison leaves the summary out.
      const everything = new Map();
      walkRegular(
        scratch.runDirectory,
        relative,
        (child) => everything.set(child.slice(relative.length + 1), regularFileBytes(path.join(scratch.runDirectory, ...child.split('/')))),
        [],
        'replay-file',
        '',
      );
      for (const [name, bytes] of everything) context.writer.write(`replay/scores/${name}`, bytes);
    }
    return { outcome, scoreId, produced, logged, probes: outcome.scores ?? [] };
  });
}

/** The CONCERNS the evidence artifacts record: a warning each (`ci` passes no `--strict`). */
function concernsOf(files, label) {
  const warnings = [];
  for (const [name, bytes] of files) {
    if (path.posix.basename(name) !== 'evidence-artifact.json') continue;
    let verdict;
    try {
      verdict = JSON.parse(bytes.toString('utf8')).contractVerdict;
    } catch {
      continue;
    }
    if (verdict === 'CONCERNS')
      warnings.push(`${label}${path.posix.dirname(name)}: eval-quality records CONCERNS in its evidence artifact`);
  }
  return warnings;
}

async function replayCheck(context) {
  const baseline = locateBaseline(context);
  if (baseline.problem !== undefined) return baseline.problem();
  const verdict = await replayPreflight(context, baseline);
  const scored = await replayScore(context, baseline);
  const engine = await loadEngine();
  const digest = (bytes) => engine.digestBytes(bytes);

  const expected = new Map();
  const findings = [];
  const scoreId = baseline.manifest.scoreInvocationId;
  // The layout check has held `scores/` to the accepted invocation alone; the path is confined all the same.
  confine(baseline.directory, 'scores', scoreId);
  const scoreDirectory = `scores/${scoreId}`;
  const { files: baselineFiles, findings: walked } = evidenceFiles(baseline.directory, scoreDirectory);
  findings.push(...walked.map((entry) => `${entry.file}: ${entry.message}`));
  for (const [name, bytes] of baselineFiles) expected.set(`scores/${name}`, bytes);
  try {
    expected.set('preflight-verdict.json', regularFileBytes(path.join(baseline.directory, 'preflight-verdict.json')));
  } catch (error) {
    findings.push(`preflight-verdict.json: cannot be read from ${BASELINE}/ (${error.message})`);
  }
  const produced = new Map([...scored.produced].map(([name, bytes]) => [`scores/${name}`, bytes]));
  if (verdict.verdict !== null) produced.set('preflight-verdict.json', verdict.verdict);

  const drift = [];
  for (const [name, bytes] of expected) {
    if (!produced.has(name)) drift.push(`${name}: the replay produced no such file; the baseline holds ${digest(bytes)}`);
    else if (!produced.get(name).equals(bytes))
      drift.push(`${name}: the replay produced ${digest(produced.get(name))}; the baseline holds ${digest(bytes)}`);
  }
  for (const [name, bytes] of produced) {
    if (!expected.has(name)) drift.push(`${name}: the replay produced a file the baseline does not hold (${digest(bytes)})`);
  }

  const stageExits = [verdict.exitCode, scored.outcome.exitCode];
  const combined = mostSevere(stageExits);
  // The stage exits pass through; 13 applies only when they are success or FAIL and the bytes differ.
  const exitCode = (combined === OK || combined === FLOOR_BREACH) && drift.length > 0 ? DRIFT : combined;
  const out = [];
  for (const entry of findings) out.push(`${entry}\n`);
  for (const entry of drift) out.push(findingLine('replay', 'drift', entry));
  for (const entry of scored.outcome.findings ?? []) out.push(findingLine(entry.file, entry.rule, entry.message));
  out.push(
    `tea-evaluate ci replay: eval-quality preflight exited ${verdict.exitCode}, score exited ${scored.outcome.exitCode}; ${expected.size} baseline file(s) compared, ${drift.length} difference(s) (exit ${exitCode})\n`,
  );
  return result(exitCode, {
    stdout: out.join(''),
    stderr: verdict.stderr + scored.logged.map((line) => `${escapeUnprintable(line)}\n`).join(''),
    warnings: concernsOf(scored.produced, 'replay '),
    artifacts: ['replay/preflight-verdict.json', 'replay/engine/preflight.json'],
  });
}

// --- checks that read the baseline's own evidence or its scored records

async function gameabilityCheck(context) {
  const baseline = locateBaseline(context);
  if (baseline.problem !== undefined) return baseline.problem();
  const directory = path.join(baseline.directory, 'probes');
  const ids = [];
  const findings = [];
  const stats = lstatOrNull(directory);
  if (stats !== null && !stats.isDirectory()) {
    findings.push({ file: `${BASELINE}/probes`, rule: 'baseline-file', message: 'is not a directory' });
  } else if (stats !== null) {
    for (const name of fs.readdirSync(directory).sort()) {
      if (!name.endsWith('.probe.json')) continue;
      const probe = readBaselineJson(baseline.directory, `probes/${name}`, findings);
      if (probe?.qualification?.route === 'gameability') ids.push(probe.probeId);
    }
  }
  if (findings.length > 0) {
    return result(AUTHORING, { stdout: findings.map((entry) => findingLine(entry.file, entry.rule, entry.message)).join('') });
  }
  if (ids.length === 0) {
    return result(OK, {
      stdout: 'tea-evaluate ci gameability: the baseline holds no gameability probe\n',
      notes: ['no gameability probe'],
    });
  }
  const scored = await replayScore(context, baseline);
  const entries = scored.probes.filter((entry) => ids.includes(entry.probeId));
  const out = [];
  const exits = [];
  for (const id of ids) {
    const entry = entries.find((candidate) => candidate.probeId === id);
    if (entry === undefined || entry.exitCode === null || entry.evidence === null) {
      exits.push(INFRASTRUCTURE);
      out.push(
        findingLine(`probes/${id}.probe.json`, 'gameability', 'the gameability arm was not scored: score produced no evidence for it'),
      );
    } else {
      exits.push(entry.exitCode);
      out.push(`${id}: gameability arm scored through eval-quality score, exit ${entry.exitCode}; ${entry.evidence}\n`);
    }
  }
  // A score that stopped before any probe (its input checks, say) has no per-probe exit; its own exit passes through.
  // A probe that was not scored is infrastructure (12), which outranks every exit a score gives.
  const exitCode = scored.probes.length === 0 ? scored.outcome.exitCode : mostSevere(exits);
  for (const entry of scored.outcome.findings ?? []) out.push(findingLine(entry.file, entry.rule, entry.message));
  const evidence = new Map([...scored.produced].filter(([name]) => ids.some((id) => name.startsWith(`${id}/`))));
  return result(exitCode, { stdout: out.join(''), warnings: concernsOf(evidence, 'gameability '), artifacts: ['replay/scores'] });
}

/** The oracles a behavior of the contract names: the ones whose outcome must be evaluable and reached. */
function requiredOracles(contract) {
  return new Set((Array.isArray(contract?.behaviors) ? contract.behaviors : []).flatMap((behavior) => behavior?.oracles ?? []));
}

async function oracleAgreementCheck(context) {
  const baseline = locateBaseline(context);
  if (baseline.problem !== undefined) return baseline.problem();
  const findings = [];
  const index = readBaselineJson(baseline.directory, 'trial-sets.json', findings);
  const contract = readBaselineJson(baseline.directory, CONTRACT_NAME, findings);
  const probes = index === null ? null : probesOf(index);
  if (probes === null && findings.length === 0)
    findings.push({ file: `${BASELINE}/trial-sets.json`, rule: 'baseline-file', message: 'does not name its trial sets by probe' });
  const evidence =
    findings.length > 0
      ? new Map()
      : await readEvidence({
          root: baseline.directory,
          scoreId: baseline.manifest.scoreInvocationId,
          probes,
          validate: createArtifactValidator(),
          findings,
          label: `${BASELINE}/`,
        });
  if (findings.length > 0) {
    return result(AUTHORING, { stdout: findings.map((entry) => findingLine(entry.file, entry.rule, entry.message)).join('') });
  }
  const required = requiredOracles(contract);
  const problems = [];
  for (const [probeId, artifact] of evidence) {
    for (const outcome of artifact.outcomes) {
      const where = `${BASELINE}/scores/${baseline.manifest.scoreInvocationId}/${probeId}/evidence-artifact.json`;
      const name = `${probeId} oracle ${outcome.oracleId}`;
      if (outcome.corroboration === 'disagrees') {
        problems.push(
          findingLine(
            where,
            'oracle-agreement',
            `${name}: eval-quality records corroboration disagrees (state ${outcome.state}); the evaluator's judgment and the evidence do not agree`,
          ),
        );
      } else if (required.has(outcome.oracleId) && outcome.corroboration === 'not-evaluable') {
        problems.push(
          findingLine(
            where,
            'oracle-agreement',
            `${name}: eval-quality records corroboration not-evaluable for an oracle a behavior requires`,
          ),
        );
      } else if (required.has(outcome.oracleId) && outcome.state === 'unreached') {
        problems.push(
          findingLine(where, 'oracle-agreement', `${name}: eval-quality records the outcome unreached for an oracle a behavior requires`),
        );
      }
    }
  }
  const out = [
    ...problems,
    `tea-evaluate ci oracle-agreement: ${evidence.size} probe(s) of the baseline read, ${problems.length} oracle outcome(s) that disagree or cannot be evaluated\n`,
  ];
  return result(problems.length === 0 ? OK : WEAKNESS, { stdout: out.join('') });
}

// --- the live checks

function floorBreaches(aggregateBytes) {
  let aggregate;
  try {
    aggregate = JSON.parse(aggregateBytes.toString('utf8'));
  } catch {
    return [];
  }
  const decisions = aggregate?.floorDecisions;
  if (decisions === null || typeof decisions !== 'object') return [];
  return Object.entries(decisions)
    .filter(([, entry]) => entry?.decision === 'does-not-meet')
    .map(([probeClass, entry]) => ({
      probeClass,
      floor: entry.floor,
      rate: aggregate.classes?.[probeClass]?.rate ?? null,
      basis: entry.basis,
    }));
}

/**
 * A run of `partition` (everything when it is undefined) of `trials` trials per arm (the evaluation's own when it is
 * undefined) through `tea-evaluate run`, scored when it completed; shared by the checks that need the same run in one invocation.
 */
function liveRun(context, { partition, trials } = {}) {
  return context.once(`live-${partition ?? 'both'}-${trials ?? 'declared'}`, async () => {
    const logged = [];
    const log = (line) => {
      logged.push(line);
      context.log(line);
    };
    const ran = await runRunCommand(context.folder, { partition, trials, env: context.env, log });
    const runId = ran.runDirectory === null ? null : path.basename(ran.runDirectory);
    const scored =
      ran.exitCode === OK && runId !== null ? await runScoreCommand(context.folder, { run: runId, env: context.env, log }) : null;
    return { ran, scored, runId, logged };
  });
}

/** The latest score invocation of a scored live run: its directory name, or null. */
function latestScore(live) {
  if (live.scored === null || live.scored.runDirectory === null) return null;
  return (scoreInvocations(live.scored.runDirectory) ?? []).at(-1) ?? null;
}

/** The strength floor over the aggregate a live run's score wrote: a breach warns, and on `release` exits 2. */
function applyFloors(context, live, outcome, label) {
  const latest = latestScore(live);
  if (latest === null) return outcome;
  let bytes;
  try {
    bytes = regularFileBytes(path.join(live.scored.runDirectory, 'scores', latest, 'strength-aggregate.json'));
  } catch {
    outcome.notes.push(`${label}: no strength aggregate, so no class-wide floor applies`);
    return outcome;
  }
  for (const breach of floorBreaches(bytes)) {
    const message = `${label}: the ${breach.probeClass} class does not meet its strength floor ${breach.floor} (rate ${breach.rate}, ${breach.basis})`;
    if (context.tier === 'release') {
      outcome.exitCode = mostSevere([outcome.exitCode, FLOOR_BREACH]);
      outcome.stdout += findingLine('strength-aggregate.json', 'strength-floor', message);
    } else outcome.warnings.push(message);
  }
  return outcome;
}

/** The result of a live run and its score as the CLI prints them; the CONCERNS its evidence records are warnings. */
function liveOutcome(context, live, label) {
  const parts = printedOutcome('run', live.ran, live.logged);
  let { stdout } = parts;
  let exitCode = live.ran.exitCode;
  if (live.scored !== null) {
    stdout += printedOutcome('score', live.scored, []).stdout;
    exitCode = live.scored.exitCode;
  }
  const runs = live.ran.runDirectory === null ? [] : [relativeTo(context.folder, live.ran.runDirectory)];
  const latest = latestScore(live);
  const warnings = latest === null ? [] : concernsOf(evidenceFiles(live.scored.runDirectory, `scores/${latest}`).files, `${label} `);
  return result(exitCode, { stdout, stderr: parts.stderr, runs, warnings, notes: [`${label}: run ${live.runId ?? 'none'}`] });
}

async function preflightLiveCheck(context) {
  const logged = [];
  const outcome = await runPreflightCommand(context.folder, {
    env: context.env,
    log: (line) => {
      logged.push(line);
      context.log(line);
    },
  });
  const parts = printedOutcome('preflight', outcome, logged);
  return result(outcome.exitCode, {
    ...parts,
    runs: outcome.runDirectory === null ? [] : [relativeTo(context.folder, outcome.runDirectory)],
  });
}

/** The scoring policy's `minimumTrialCount`, or undefined when the policy cannot be read (the run's own check reports that). */
function minimumTrialCount(context) {
  try {
    const value = readJson(path.join(context.folder, ...POLICY_NAME.split('/'))).minimumTrialCount;
    return Number.isInteger(value) && value >= 1 ? value : undefined;
  } catch {
    return;
  }
}

/**
 * What a twin run repeats (AD-10): the partition the baseline recorded, so the comparison measures the same probe set
 * (a baseline of `both`, the default of `run`, is a run of everything, held-out probes included, since a development
 * run against it is a `refused` comparison; the held-out check applies the floor to that partition on its own), at the
 * scoring policy's `minimumTrialCount`.
 */
function twinSettings(context) {
  const partition = locateBaseline(context).manifest?.partition;
  return { partition: partition === 'development' || partition === 'held-out' ? partition : undefined, trials: minimumTrialCount(context) };
}

async function twinRunCheck(context) {
  const live = await liveRun(context, twinSettings(context));
  return applyFloors(context, live, liveOutcome(context, live, 'twin run'), 'twin run');
}

async function heldOutCheck(context) {
  const live = await liveRun(context, { partition: 'held-out' });
  return applyFloors(context, live, liveOutcome(context, live, 'held-out partition'), 'held-out partition');
}

/** Judge calibration is the report a run writes before its first trial; a rubric-free contract has nothing to calibrate. */
async function judgeCalibrationCheck(context) {
  let contract;
  try {
    contract = readJson(path.join(context.folder, CONTRACT_NAME));
  } catch (error) {
    return result(AUTHORING, { stdout: findingLine(CONTRACT_NAME, 'json', `cannot be read as JSON: ${error.message}`) });
  }
  // The run below is the baseline's partition, which holds that partition's criteria only (Story 1.105): a rubric only the
  // held-out plan declares is calibrated by a held-out baseline's run, and one only `contract.json` declares by the others'.
  let evaluation;
  try {
    evaluation = readJson(path.join(context.folder, 'evaluation.json'));
  } catch {
    // An evaluation.json that cannot be read is the check's finding, and the folder's contract.json is read as before.
  }
  if (evaluation?.partitionPlan !== undefined) {
    try {
      contract = loadContractView({ folder: context.folder, evaluation, partition: twinSettings(context).partition ?? 'both' }).contract;
    } catch (error) {
      if (!(error instanceof PartitionPlanError)) throw error;
      return result(AUTHORING, { stdout: findingLine('evaluation.json', 'partition-plan', error.message) });
    }
  }
  if (!Array.isArray(contract?.rubrics) || contract.rubrics.length === 0) {
    return result(OK, { stdout: 'tea-evaluate ci judge-calibration: the contract declares no rubric\n', notes: ['no rubric declared'] });
  }
  const live = await liveRun(context, twinSettings(context));
  const outcome = liveOutcome(context, live, 'judge calibration');
  const report = live.ran.runDirectory === null ? null : path.join(live.ran.runDirectory, 'judge-calibration.json');
  if (report === null || !fs.existsSync(report)) return outcome;
  const shortfalls = calibrationShortfalls(JSON.parse(regularFileBytes(report).toString('utf8')));
  if (shortfalls.length === 0) {
    // The calibration passed; another stage of the run may still have stopped it, which the twin run reports.
    return result(OK, {
      stdout: outcome.stdout,
      stderr: outcome.stderr,
      runs: outcome.runs,
      warnings: outcome.warnings,
      notes: ['judge calibration met its minimum agreement'],
    });
  }
  return result(WEAKNESS, {
    stdout: shortfalls.map((message) => findingLine('judge-calibration.json', 'judge-calibration', message)).join('') + outcome.stdout,
    stderr: outcome.stderr,
    runs: outcome.runs,
    warnings: outcome.warnings,
  });
}

/** The scored twin run compared with `baseline/` through `compare.js`; a regression warns, a refusal informs. */
async function strengthComparisonCheck(context) {
  const baseline = locateBaseline(context);
  const live = await liveRun(context, twinSettings(context));
  const outcome = liveOutcome(context, live, 'strength comparison');
  if (live.scored === null || outcome.exitCode !== OK) return outcome;
  if (baseline.problem !== undefined) {
    // No baseline is a first run for a comparison: informational.
    if (baseline.absent === true) {
      outcome.notes.push('first-run: baseline/ holds no baseline to compare with; accept one with tea-evaluate compare --accept');
      outcome.stdout += `tea-evaluate ci strength-comparison: first-run, ${BASELINE}/ holds no baseline to compare with\n`;
      return outcome;
    }
    return baseline.problem();
  }
  const logged = [];
  const compared = await runCompareCommand(context.folder, { run: live.runId, log: (line) => logged.push(line) });
  const text = printedOutcome('compare', compared, logged);
  outcome.stdout += text.stdout;
  outcome.exitCode = compared.exitCode;
  if (compared.status === 'refused')
    outcome.notes.push(`refused: ${compared.message}; informational, re-record the baseline with tea-evaluate compare --accept`);
  for (const { probeId, relation } of compared.relations ?? []) {
    if (relation === 'a-dominates-b')
      outcome.warnings.push(`strength regression against the baseline: ${probeId} measures weaker than the baseline's (${relation})`);
  }
  return outcome;
}

/** Every `evaluate` check id, by the id the plan names; the closed set the plan schema accepts. */
const EVALUATE_CHECKS = Object.fromEntries([
  ['check', checkCheck],
  ['compile', (context, entry) => engineStageCheck(context, entry, 'compile', 'eval-contract.json')],
  ['seal', (context, entry) => engineStageCheck(context, entry, 'seal', 'sealed-evaluator-brief.json')],
  ['api-conformance', apiConformanceCheck],
  ['gameability', gameabilityCheck],
  ['oracle-agreement', oracleAgreementCheck],
  ['replay', replayCheck],
  ['preflight-live', preflightLiveCheck],
  ['twin-run', twinRunCheck],
  ['held-out', heldOutCheck],
  ['judge-calibration', judgeCalibrationCheck],
  ['strength-comparison', strengthComparisonCheck],
]);

module.exports = { SUMMARY_RECORD, CiOutcome, EVALUATE_CHECKS, MAX_OUTPUT_BYTES, confine, runCiCommand };
