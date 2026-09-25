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
 * variables) and the `evaluator.environmentKeys` the adopter names.
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
const { EvaluatorError, readAnswer } = require('./judgment-rows');
const { releaseScratchDirectory, makeScratchDirectory } = require('./workspace');

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
 * @returns {Promise<{ answer: object, stdout: string, stderr: string, stdoutBytes: Buffer, stderrBytes: Buffer, outcome: object }>}
 *   what it printed as text, which the answer is read from, and as the bytes it wrote
 * @throws {EvaluatorError}
 */
async function runCommandEvaluator({ folder, evaluator, sealedBrief, observations, mapping, validate, scratch, env = process.env }) {
  const executable = path.join(folder, ...evaluator.command.split('/'));
  const cwd = makeScratchDirectory(scratch, 'tea-evaluate-command-');
  let ended;
  try {
    ended = await runSupervised({
      command: executable,
      args: evaluator.args ?? [],
      input: `${JSON.stringify({ sealedBrief, observations })}\n`,
      cwd,
      env: buildMinimalEnv(evaluator.environmentKeys ?? [], env),
      timeout: evaluator.timeoutMs,
    });
  } finally {
    releaseScratchDirectory(scratch, cwd);
  }
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

module.exports = { runCommandEvaluator };
