/**
 * The `command` evaluator (AD-21): an adopter executable under the
 * evaluation folder's `evaluator/` (its own harness, a skill-specific
 * evaluator, custom code, or a wrapper over any evaluation framework), run
 * once per trial after the trial's observations are collected.
 *
 * It receives `{ sealedBrief, observations }` on stdin, JSON, each
 * observation the record observation the trial will carry, `observationId`
 * included, and prints one JSON object `{ rows, recommendation? }` on
 * stdout (`judgment-rows.js`).
 *
 * It runs under `cli/lib/agent-supervisor.js`, as every agent TeA starts
 * does: in a process group of its own, stopped with `SIGTERM` at
 * `evaluator.timeoutMs` and killed with `SIGKILL` after the supervisor's
 * grace period, every process left in its group killed when it ends, and all
 * of it stopped if the runtime dies. It runs in place, from the evaluation
 * folder's `evaluator/`, so a module it loads resolves as it does outside a
 * run (a package in the project's `node_modules`, say), and the run reads the
 * layer's files again before each launch and after each trial, stopping on
 * any byte that differs from what the configuration digests
 * (`evaluators.js` `evaluatorLayerChange`). Its working directory is an empty
 * private directory in the run's `scratch`, removed afterwards and however
 * the run ends, so it reads its own files relative to itself; its environment
 * is the base set agents get (PATH, HOME, USER, LOGNAME, locale and proxy
 * variables) and the `evaluator.environmentKeys` the adopter names. In a
 * confined run it starts through the evaluation layer's confinement
 * (`confinement.js` `layerPrefix`), so neither it nor any process it starts
 * can write under `evaluator/` (Story 1.31).
 *
 * The frameworks it depends on are declared in `evaluator/frameworks.json` and read through the same launch path
 * (`observeFrameworks`, Story 1.44): each declared version probe starts as the evaluator does, with the same
 * environment, an empty private working directory of its own and the same confinement, and prints the installed
 * package identity and version (`frameworks.js`).
 *
 * Its stdout is read as UTF-8 (a byte sequence that is not UTF-8 reads as
 * U+FFFD), and what it printed is kept as the bytes it wrote. One that cannot
 * start, is still running at its wall clock, exits other than 0, or prints
 * an answer outside the import contract throws `EvaluatorError` carrying what
 * it printed; the trial yields no record and the run exits 12 (AD-10).
 */

'use strict';

const path = require('node:path');

const { buildMinimalEnv, runSupervised } = require('../run-agent');
const { DEFAULT_PROBE_TIMEOUT_MS, effectiveProbeTimeoutMs, readProbeAnswer, stderrNote } = require('./frameworks');
const { EvaluatorError, readAnswer } = require('./judgment-rows');
const { releaseScratchDirectory, makeScratchDirectory } = require('./workspace');

/**
 * Starts one executable under the evaluation folder's `evaluator/` exactly as
 * the evaluator itself starts: through `spawnPrefix` when the run confines it,
 * under the supervisor, with an empty private working directory in `scratch`
 * removed afterwards, the base environment plus `evaluator.environmentKeys`,
 * and a supplied timeout (the evaluator's by default) as its wall clock. The evaluator's launch and a
 * framework's version probe (`observeFrameworks`) both go through it, so a
 * probe sees what the evaluator sees.
 *
 * @returns {Promise<object>} `runSupervised`'s report: the outcome and the streams
 */
async function launchExecutable({ folder, evaluator, command, args, input, scratch, env, spawnPrefix, timeoutMs = evaluator.timeoutMs }) {
  const executable = path.join(folder, ...command.split('/'));
  const cwd = makeScratchDirectory(scratch, 'tea-evaluate-command-');
  try {
    return await runSupervised({
      command: spawnPrefix.length === 0 ? executable : spawnPrefix[0],
      args: [...spawnPrefix.slice(1), ...(spawnPrefix.length === 0 ? [] : [executable]), ...args],
      input,
      cwd,
      env: buildMinimalEnv(evaluator.environmentKeys ?? [], env),
      timeout: timeoutMs,
    });
  } finally {
    releaseScratchDirectory(scratch, cwd);
  }
}

/**
 * Reads the installed version of each declared framework (Story 1.44): runs
 * the dependency's version probe through the evaluator's own launch path
 * (`launchExecutable`) and reads the `{ package, version }` it prints
 * (`frameworks.js`). A probe that cannot start, outlives the timeout, exits
 * other than 0 or prints another shape yields no observation for that
 * dependency and a `fault` naming why, with what it printed. After the first
 * fault, later probes do not start; each still gets an entry naming its
 * effective bound. Nothing is thrown for a dependency that is missing: the
 * caller compares the entries with the declaration.
 *
 * @param {object} options
 * @param {string} options.folder the evaluation folder
 * @param {object} options.evaluator `evaluation.json`'s `command` evaluator
 * @param {Array<{ package: string, probe: { command: string, args: string[] } }>} options.frameworks
 * @param {string[]} options.scratch
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {string[]} [options.spawnPrefix]
 * @returns {Promise<Array<{ package: string, observed: { package: string, version: string }|null, fault: string|null, stdout: string, stderr: string }>>}
 *   one entry per declared framework, in the order given
 */
async function observeFrameworks({ folder, evaluator, frameworks, scratch, env = process.env, spawnPrefix = [] }) {
  const entries = [];
  let earlierFault = false;
  for (const framework of frameworks) {
    const { command, args } = framework.probe;
    const label = `the version probe of ${framework.package} (${command})`;
    const effectiveTimeoutMs = effectiveProbeTimeoutMs(framework, evaluator);
    if (earlierFault) {
      entries.push({
        package: framework.package,
        effectiveProbeTimeoutMs: effectiveTimeoutMs,
        observed: null,
        fault: 'not probed because an earlier framework probe failed',
        stdout: '',
        stderr: '',
      });
      continue;
    }
    const ended = await launchExecutable({
      folder,
      evaluator,
      command,
      args,
      input: '',
      scratch,
      env,
      spawnPrefix,
      timeoutMs: effectiveTimeoutMs,
    });
    const { outcome, stdout, stderr } = ended;
    const entry = { package: framework.package, effectiveProbeTimeoutMs: effectiveTimeoutMs, observed: null, fault: null, stdout, stderr };
    if (outcome.spawnError) entry.fault = `${label} could not start: ${outcome.spawnError.message}`;
    else if (outcome.timedOut) {
      const requestedTimeoutMs = framework.probe.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
      entry.fault = `${label} was still running at its ${effectiveTimeoutMs}ms probe timeout${effectiveTimeoutMs < requestedTimeoutMs ? ' (capped by evaluator.timeoutMs)' : ''}`;
    } else if (outcome.failure) entry.fault = `${label} did not finish: ${outcome.failure}`;
    else if (outcome.status === 0) {
      const answer = readProbeAnswer(framework.package, stdout);
      if ('fault' in answer) entry.fault = `${label}: ${answer.fault}`;
      else entry.observed = answer;
    } else {
      entry.fault = `${label} ${outcome.signal ? `was killed by signal ${outcome.signal}` : `exited ${outcome.status}`}${stderrNote(stderr)}`;
    }
    entries.push(entry);
    earlierFault = entry.fault !== null;
  }
  return entries;
}

/**
 * Runs the evaluator over one trial.
 *
 * @param {object} options
 * @param {string} options.folder the evaluation folder, whose `evaluator/` the executable runs from
 * @param {object} options.evaluator `evaluation.json`'s `evaluator`
 * @param {object} options.sealedBrief
 * @param {object[]} options.observations the trial's record observations, by sequence
 * @param {object} options.mapping
 * @param {(value: unknown) => string[]} options.validate the mapping's row validator
 * @param {string[]} options.scratch the run's private directories, which its working directory joins while it runs
 * @param {NodeJS.ProcessEnv} [options.env] the environment the base variables and `environmentKeys` are read from
 * @param {string[]} [options.spawnPrefix] the command the evaluator starts through; none by default
 * @returns {Promise<{ answer: object, stdout: string, stderr: string, stdoutBytes: Buffer, stderrBytes: Buffer, outcome: object }>}
 *   what it printed as text, which the answer is read from, and as the bytes it wrote
 * @throws {EvaluatorError}
 */
async function runCommandEvaluator({
  folder,
  evaluator,
  sealedBrief,
  observations,
  mapping,
  validate,
  scratch,
  env = process.env,
  spawnPrefix = [],
}) {
  const ended = await launchExecutable({
    folder,
    evaluator,
    command: evaluator.command,
    args: evaluator.args ?? [],
    input: `${JSON.stringify({ sealedBrief, observations })}\n`,
    scratch,
    env,
    spawnPrefix,
  });
  const { outcome, stdout, stderr, stdoutBytes, stderrBytes } = ended;
  const streams = { stdout, stderr, stdoutBytes, stderrBytes };
  const fail = (message) => Object.assign(new EvaluatorError(message, streams), { outcome });
  if (outcome.spawnError) throw fail(`the evaluator ${evaluator.command} could not start: ${outcome.spawnError.message}`);
  if (outcome.timedOut) {
    throw fail(
      `the evaluator ${evaluator.command} was still running at its ${evaluator.timeoutMs}ms timeout, so its process group was stopped`,
    );
  }
  if (outcome.failure) throw fail(`the evaluator ${evaluator.command} did not finish: ${outcome.failure}`);
  if (outcome.status !== 0) {
    throw fail(
      `the evaluator ${evaluator.command} ${outcome.signal ? `was killed by signal ${outcome.signal}` : `exited ${outcome.status}`}, so its answer is not read`,
    );
  }
  try {
    return { answer: readAnswer({ text: stdout, mapping, validate }), ...streams, outcome };
  } catch (error) {
    if (!(error instanceof EvaluatorError)) throw error;
    throw fail(error.message);
  }
}

module.exports = { observeFrameworks, runCommandEvaluator };
