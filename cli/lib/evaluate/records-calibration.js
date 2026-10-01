/**
 * Calibration of the rubric scores a `records` evaluator imports (AD-21,
 * AD-22, Story 1.40).
 *
 * The harness runs its own scorer over the labelled items in
 * `policy/judge-calibration.json` and writes what the scorer saw and answered
 * beside its records, as `<records>/calibration-judgments.json`:
 *
 *   { "schemaVersion": 1,
 *     "scorerConfigurationDigest": "sha256:...",
 *     "items": [{ "rubricId", "criterionId", "scorerInput", "answer" }] }
 *
 * one item per labelled item, in the labelled file's order. The runtime does
 * not run the harness's scorer. It verifies what only it can: every item's
 * `scorerInput` is exactly the label-free observation the runtime derives
 * from the labelled item (so `expectedLevel` never reached the scorer), the
 * judgments name the scorer configuration the imported
 * `EvaluatorConfiguration` describes, and that configuration binds the
 * labelled file's digest and `judgeCalibration.minimumAgreement`. It then
 * computes agreement itself through the gate Story 1.21 built.
 *
 * `scorerConfigurationDigest` is `digestArtifact` over the imported
 * configuration with its two `tea.judgeCalibration*` keys removed from
 * `decodingParameters`: the full configuration's digest covers the labelled
 * file's digest, which the harness cannot know before the file is final.
 *
 * `verifyRecordsCalibration` is the one verification; `check` and `run` both
 * call it, so they cannot disagree. A provenance defect is an authoring
 * defect (`EvaluatorLayerError`, exit 10). Low agreement is exit 11.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { CALIBRATION_PATH, calibrationObservation, calibrationOperationId, calibrationProblems, runCalibration } = require('./calibration');
const { EvaluatorLayerError } = require('./evaluators');

const JUDGMENTS_NAME = 'calibration-judgments.json';
const CONFIGURATION_NAME = 'evaluator-configuration.json';
const DIGEST_KEY = 'tea.judgeCalibrationDigest';
const MINIMUM_KEY = 'tea.judgeCalibrationMinimumAgreement';
const JUDGMENTS_FIELDS = new Set(['schemaVersion', 'scorerConfigurationDigest', 'items']);
const ITEM_FIELDS = new Set(['rubricId', 'criterionId', 'scorerInput', 'answer']);

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Whether two JSON values are equal, an object's key order aside. */
function sameJson(left, right) {
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, at) => sameJson(item, right[at]))
    );
  if (isObject(left) && isObject(right)) {
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && sameJson(left[key], right[key]));
  }
  return left === right;
}

/** The configuration with the two calibration bindings removed: what the harness's scorer ran under. */
function scorerConfiguration(configuration) {
  const scorer = structuredClone(configuration);
  if (isObject(scorer.decodingParameters)) {
    delete scorer.decodingParameters[DIGEST_KEY];
    delete scorer.decodingParameters[MINIMUM_KEY];
  }
  return scorer;
}

/** The judgments file's parsed value, or null when the records directory holds none; never through a link. */
function readJudgments(root, spelled) {
  let stats;
  try {
    stats = fs.lstatSync(path.join(root, JUDGMENTS_NAME));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new EvaluatorLayerError(`${spelled} cannot be read: ${error.message}`);
  }
  if (!stats.isFile()) throw new EvaluatorLayerError(`${spelled} is not a regular file the evaluation folder holds`);
  try {
    return { value: JSON.parse(fs.readFileSync(path.join(root, JUDGMENTS_NAME), 'utf8')) };
  } catch (error) {
    throw new EvaluatorLayerError(`${spelled} is not JSON: ${error.message}`);
  }
}

function bindingProblems(configuration, spelled, labelled, evaluation, engine) {
  const parameters = isObject(configuration?.decodingParameters) ? configuration.decodingParameters : {};
  const problems = [];
  for (const [key, expected, what] of [
    [DIGEST_KEY, engine.digestBytes(labelled.bytes), 'the digest of policy/judge-calibration.json'],
    [MINIMUM_KEY, evaluation.judgeCalibration.minimumAgreement, "evaluation.json's judgeCalibration.minimumAgreement"],
  ]) {
    if (!Object.hasOwn(parameters, key))
      problems.push(`${spelled} carries no decodingParameters["${key}"]; the harness binds ${what}, ${JSON.stringify(expected)}`);
    else if (parameters[key] !== expected)
      problems.push(
        `${spelled} binds decodingParameters["${key}"] ${JSON.stringify(parameters[key])}; ${what} is ${JSON.stringify(expected)}`,
      );
  }
  return problems;
}

/** The ways one judgments item departs from the labelled item at its position. */
function itemProblems(entry, index, item, { rubric, criterion }, contract) {
  if (!isObject(entry)) return [`items[${index}] must be an object`];
  const problems = Object.keys(entry)
    .filter((field) => !ITEM_FIELDS.has(field))
    .map((field) => `items[${index}] has an unknown field ${JSON.stringify(field)}`);
  if (entry.rubricId !== item.rubricId || entry.criterionId !== item.criterionId) {
    problems.push(
      `items[${index}] names ${entry.rubricId}/${entry.criterionId}; the labelled item at that position is ${item.rubricId}/${item.criterionId}, and the judgments follow the labelled file's order`,
    );
    return problems;
  }
  // The harness wrote JSON, so a member the observation leaves undefined is absent from what it can match.
  // eslint-disable-next-line unicorn/prefer-structured-clone -- structuredClone keeps undefined members
  const expected = JSON.parse(
    JSON.stringify(
      calibrationObservation({
        criterion,
        response: item.response,
        responseKind: item.responseKind,
        operationId: calibrationOperationId(contract, criterion),
      }),
    ),
  );
  if (!sameJson(entry.scorerInput, expected)) {
    problems.push(
      `items[${index}].scorerInput is not the label-free observation the runtime derives from the labelled item${isObject(entry.scorerInput) && Object.hasOwn(entry.scorerInput, 'expectedLevel') ? '; it carries expectedLevel, the label, which the scorer must never see' : ''}`,
    );
  }
  if (entry.answer !== null && !rubric.scaleLevels.some((level) => level.level === entry.answer))
    problems.push(
      `items[${index}].answer ${JSON.stringify(entry.answer)} is not null or an anchored level of ${item.rubricId}/${item.criterionId}`,
    );
  return problems;
}

/**
 * Every way the imported configuration and the judgments file fall short of
 * a verifiable calibration; empty when they hold. Shared by `check` and `run`.
 *
 * @param {object} options
 * @param {string} options.records `evaluator.records`, as spelled in `evaluation.json`
 * @param {string} options.root the records directory, resolved
 * @param {object} options.configuration the harness's `EvaluatorConfiguration`
 * @param {object} options.evaluation
 * @param {object} options.contract
 * @param {{ bytes: Buffer, value: object }} options.labelled `readCalibration(folder)`
 * @param {object} options.engine
 * @returns {{ problems: Array<{ file: string, message: string }>, judgments: object|null }} each problem names the file it is in
 */
function verifyRecordsCalibration({ records, root, configuration, evaluation, contract, labelled, engine }) {
  const file = `${records}/${JUDGMENTS_NAME}`;
  const configurationFile = `${records}/${CONFIGURATION_NAME}`;
  const unusable = calibrationProblems(evaluation, contract, labelled?.value, engine);
  if (unusable.length > 0) return { problems: unusable.map((message) => ({ file: CALIBRATION_PATH, message })), judgments: null };
  const problems = bindingProblems(configuration, configurationFile, labelled, evaluation, engine).map((message) => ({
    file: configurationFile,
    message,
  }));
  const add = (message) => problems.push({ file, message });
  let read;
  try {
    read = readJudgments(root, file);
  } catch (error) {
    if (!(error instanceof EvaluatorLayerError)) throw error;
    add(error.message);
    return { problems, judgments: null };
  }
  if (read === null) {
    add(
      `${file} is not there; a records evaluator whose contract declares a rubric needs the harness's calibration judgments beside its records`,
    );
    return { problems, judgments: null };
  }
  const judgments = read.value;
  if (!isObject(judgments) || !Array.isArray(judgments.items)) {
    add(`${file} must be an object holding an items array`);
    return { problems, judgments: null };
  }
  for (const field of Object.keys(judgments))
    if (!JUDGMENTS_FIELDS.has(field)) add(`${file} has an unknown field ${JSON.stringify(field)}`);
  if (judgments.schemaVersion !== 1) add(`${file} schemaVersion must be 1`);
  let scorerDigest;
  try {
    scorerDigest = engine.digestArtifact(scorerConfiguration(configuration), 'EvaluatorConfiguration');
  } catch (error) {
    problems.push({
      file: configurationFile,
      message: `${configurationFile} cannot be digested as an EvaluatorConfiguration: ${error.message}`,
    });
  }
  if (scorerDigest !== undefined && judgments.scorerConfigurationDigest !== scorerDigest) {
    add(
      `${file} names scorerConfigurationDigest ${JSON.stringify(judgments.scorerConfigurationDigest)}, and the imported configuration without its calibration bindings digests to ${scorerDigest}, so the judgments are not from the scorer that produced the records`,
    );
  }
  const criteria = new Map();
  for (const rubric of contract.rubrics)
    for (const criterion of rubric.criteria) criteria.set(`${rubric.id}/${criterion.id}`, { rubric, criterion });
  const labelledItems = labelled.value.items;
  if (judgments.items.length !== labelledItems.length)
    add(
      `${file} holds ${judgments.items.length} items; policy/judge-calibration.json holds ${labelledItems.length}, and the judgments need exactly one per labelled item`,
    );
  for (const [index, item] of labelledItems.entries()) {
    if (index >= judgments.items.length) break;
    for (const message of itemProblems(judgments.items[index], index, item, criteria.get(`${item.rubricId}/${item.criterionId}`), contract))
      add(message);
  }
  return { problems, judgments };
}

/**
 * Verifies the harness's judgments and runs the calibration gate over its
 * answers: the report is written to the run directory and agreement below the
 * minimum stops the run with exit 11, before any record is copied.
 *
 * @throws {EvaluatorLayerError} the judgments are absent or unverifiable (exit 10)
 */
async function calibrateImported({ records, root, configuration, labelled, evaluation, contract, engine, writer, stop }) {
  const { problems, judgments } = verifyRecordsCalibration({ records, root, configuration, evaluation, contract, labelled, engine });
  if (problems.length > 0)
    throw new EvaluatorLayerError(
      `the imported rubric scores carry no verifiable calibration: ${problems.map((problem) => problem.message).join('; ')}`,
    );
  const answers = new Map();
  for (const entry of judgments.items) {
    const key = `${entry.rubricId}/${entry.criterionId}`;
    answers.set(key, [...(answers.get(key) ?? []), entry.answer]);
  }
  const judgeItem = ({ rubric, criterion }) => answers.get(`${rubric.id}/${criterion.id}`).shift();
  return runCalibration({ calibration: labelled, evaluation, contract, engine, writer, stop, judgeItem });
}

module.exports = { JUDGMENTS_NAME, calibrateImported, verifyRecordsCalibration };
