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
 * of it stopped if the runtime dies. Its working directory is an empty
 * temporary directory removed afterwards, so it reads its own files relative
 * to itself; its environment is the base set agents get (PATH, HOME, USER,
 * LOGNAME, locale and proxy variables) and the `evaluator.environmentKeys` the
 * adopter names.
 *
 * One that cannot start, is still running at its wall clock, exits other
 * than 0, or prints an answer outside the import contract throws
 * `EvaluatorError` carrying what it printed; the trial yields no record and
 * the run exits 12 (AD-10).
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildMinimalEnv, runSupervised } = require('../run-agent');
const { EvaluatorError, readAnswer } = require('./judgment-rows');

/**
 * Runs the evaluator over one trial.
 *
 * @param {object} options
 * @param {string} options.folder the evaluation folder
 * @param {object} options.evaluator `evaluation.json`'s `evaluator`
 * @param {object} options.sealedBrief
 * @param {object[]} options.observations the trial's record observations, by sequence
 * @param {object} options.mapping
 * @param {(value: unknown) => string[]} options.validate the mapping's row validator
 * @param {NodeJS.ProcessEnv} [options.env] the environment the base variables and `environmentKeys` are read from
 * @returns {Promise<{ answer: object, stdout: string, stderr: string, outcome: object }>}
 * @throws {EvaluatorError}
 */
async function runCommandEvaluator({ folder, evaluator, sealedBrief, observations, mapping, validate, env = process.env }) {
  const executable = path.join(folder, ...evaluator.command.split('/'));
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-evaluate-command-'));
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
    fs.rmSync(cwd, { recursive: true, force: true });
  }
  const { outcome, stdout, stderr } = ended;
  const fail = (message) => Object.assign(new EvaluatorError(message, { stdout, stderr }), { outcome });
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
    return { answer: readAnswer({ text: stdout, mapping, validate }), stdout, stderr, outcome };
  } catch (error) {
    if (!(error instanceof EvaluatorError)) throw error;
    throw fail(error.message);
  }
}

module.exports = { runCommandEvaluator };
