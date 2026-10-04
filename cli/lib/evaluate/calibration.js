/** Labelled rubric examples and their run gate (AD-22). */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { recordObservation } = require('./records');

const CALIBRATION_PATH = 'policy/judge-calibration.json';
const READ_REGULAR = fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0) | (fs.constants.O_NOFOLLOW ?? 0);

function parsedResponse(response, name, shape = 'any') {
  let value;
  try {
    value = JSON.parse(response);
  } catch {
    if (shape !== 'any') throw new Error(`${name} needs a JSON ${shape} response`);
    return response;
  }
  if (
    ['object', 'structured'].includes(shape) &&
    (value === null || typeof value !== 'object' || (shape === 'object' && Array.isArray(value)))
  )
    throw new Error(`${name} needs a JSON ${shape} response`);
  return value;
}

function calibrationProjection(criterion, response, responseKind) {
  const pointerParts = criterion.evidence.split('/');
  const channel = pointerParts[3];
  const member = pointerParts[4];
  const tail = pointerParts.slice(5);
  const text = { kind: 'text', value: response };
  const tagged = (name, hasTail) => {
    const kind = responseKind ?? (hasTail ? 'json' : 'text');
    if (hasTail && kind === 'text') throw new Error(`${name} evidence has a nested pointer and needs a JSON response`);
    return kind === 'json' ? { kind: 'json', value: parsedResponse(response, name, hasTail ? 'structured' : 'json') } : text;
  };
  switch (channel) {
    case 'stdout': {
      return { stdout: tagged('stdout', member !== undefined) };
    }
    case 'stderr': {
      return { stderr: tagged('stderr', member !== undefined) };
    }
    case 'response-body': {
      if (member !== undefined && responseKind === 'text')
        throw new Error('response-body evidence has a nested pointer and needs a JSON response');
      return {
        responseBody:
          responseKind === 'text'
            ? response
            : parsedResponse(response, 'response-body', member === undefined ? (responseKind === 'json' ? 'json' : 'any') : 'structured'),
      };
    }
    case 'response-headers': {
      if (responseKind === 'text') throw new Error('response-headers needs a JSON object response');
      return { responseHeaders: parsedResponse(response, 'response-headers', 'object') };
    }
    case 'response-status':
    case 'exit-code': {
      if (responseKind !== undefined) throw new Error(`${channel} does not use responseKind`);
      const value = Number(response);
      if (!Number.isInteger(value) || (channel === 'response-status' && value < 0))
        throw new Error(`${channel} needs an integer response${channel === 'response-status' ? ' of zero or more' : ''}`);
      return channel === 'response-status' ? { responseStatus: value } : { exitCode: value };
    }
    case 'artifact': {
      return { artifacts: { [member]: tagged('artifact', tail.length > 0) } };
    }
    case 'call-inputs': {
      if (responseKind === 'text') throw new Error(`call-inputs/${member} needs a JSON object response`);
      return { callInputs: { [member]: parsedResponse(response, `call-inputs/${member}`, 'object') } };
    }
    default: {
      throw new Error(`unsupported calibration evidence channel ${JSON.stringify(channel)}`);
    }
  }
}

function calibrationObservation({ criterion, response, responseKind, interfaceId, operationId }) {
  return recordObservation({
    observationId: 'calibration',
    sequence: 1,
    interfaceId,
    operationId,
    callInputs: {},
    ...calibrationProjection(criterion, response, responseKind),
  });
}

/**
 * The interface and operation the contract's interaction plan gives the step a criterion reads, else `calibration` for both.
 * An operation ID is scoped to its interface, so the pair is the identity.
 */
function calibrationStepPair(contract, criterion) {
  const stepId = /^\/interactions\/([^/]+)/.exec(criterion.evidence)?.[1];
  const plan = Array.isArray(contract?.interactionPlan) ? contract.interactionPlan : [];
  const step = plan.find((candidate) => candidate !== null && typeof candidate === 'object' && candidate.stepId === stepId);
  return { interfaceId: step?.interfaceId ?? 'calibration', operationId: step?.operationId ?? 'calibration' };
}

/**
 * What is wrong with the labelled file for the rubrics `contract` declares.
 *
 * Under a partition plan (Story 1.105) `contract` can be one partition's view, and the labelled file is one file for every
 * partition: with `partial`, an item that names a criterion the view does not hold belongs to another partition, or to none,
 * and is neither validated nor judged here. `check` reads the whole contract, so it still names an item of no criterion.
 *
 * @param {object} evaluation
 * @param {object} contract
 * @param {object|undefined} calibration the parsed labelled file
 * @param {object} engine
 * @param {object} [options]
 * @param {boolean} [options.partial] `contract` is one partition's view of the evaluation's contract
 * @param {(rubric: object, rubricIndex: number, criterion: object, criterionIndex: number) => string|undefined} [options.label]
 *   the name a finding gives a criterion of the held-out plan, or undefined for one `contract.json` declares. A criterion with a name
 *   is a sealed one (Story 1.51's id-only rule): its evidence pointer, the channel and member it names and its scale's level values
 *   never reach a finding, because the findings reach the authoring loop.
 * @returns {string[]}
 */
function calibrationProblems(evaluation, contract, calibration, engine, { partial = false, label } = {}) {
  const problems = [];
  const rubrics = Array.isArray(contract?.rubrics) ? contract.rubrics : [];
  if (rubrics.length === 0) {
    // A view with no rubric has nothing to judge, and the labelled file may serve the partition that has some.
    if (partial) return problems;
    if (evaluation.judgeCalibration !== undefined || calibration !== undefined)
      problems.push('the contract declares no rubric, so judge calibration has nothing to score');
    return problems;
  }
  if (evaluation.judgeCalibration?.minimumAgreement === undefined)
    problems.push('judgeCalibration.minimumAgreement is required when the contract declares a rubric');
  if (calibration === undefined) {
    problems.push(`${CALIBRATION_PATH} is required when the contract declares a rubric`);
    return problems;
  }
  if (calibration === null || typeof calibration !== 'object' || Array.isArray(calibration) || !Array.isArray(calibration.items)) {
    problems.push(`${CALIBRATION_PATH} must contain an items array`);
    return problems;
  }
  if (
    rubrics.some(
      (rubric) =>
        rubric === null ||
        typeof rubric !== 'object' ||
        !Array.isArray(rubric.criteria) ||
        !Array.isArray(rubric.scaleLevels) ||
        rubric.criteria.some(
          (criterion) => criterion === null || typeof criterion !== 'object' || typeof criterion.evidence !== 'string',
        ) ||
        rubric.scaleLevels.some((level) => level === null || typeof level !== 'object'),
    )
  ) {
    problems.push('contract rubrics must be valid before judge calibration');
    return problems;
  }
  const expected = new Map();
  const criteria = new Map();
  const sealed = new Map();
  for (const [rubricIndex, rubric] of rubrics.entries())
    for (const [criterionIndex, criterion] of (rubric.criteria ?? []).entries()) {
      const key = `${rubric.id}/${criterion.id}`;
      expected.set(key, new Set((rubric.scaleLevels ?? []).map((level) => level.level)));
      criteria.set(key, criterion);
      const name = label?.(rubric, rubricIndex, criterion, criterionIndex);
      if (name !== undefined) sealed.set(key, name);
    }
  const named = (key) => sealed.get(key) ?? key;
  const covered = new Map([...expected].map(([key]) => [key, new Set()]));
  for (const [index, item] of calibration.items.entries()) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      problems.push(`items[${index}] must be an object`);
      continue;
    }
    const key = `${item?.rubricId}/${item?.criterionId}`;
    if (!expected.has(key)) {
      if (!partial) problems.push(`items[${index}] names unknown rubric criterion ${key}`);
      continue;
    }
    if (typeof item.response !== 'string' || item.response.length === 0) problems.push(`items[${index}] needs a nonempty response`);
    else {
      try {
        const criterion = criteria.get(key);
        const observation = calibrationObservation({
          criterion,
          response: item.response,
          responseKind: item.responseKind,
          interfaceId: 'calibration',
          operationId: 'calibration',
        });
        const stepId = criterion.evidence.split('/')[2];
        const resolve = engine.makeResolveOperand({ [stepId]: observation }, {});
        if (resolve({ pointer: criterion.evidence }, engine.ABSENT, 'calibration') === engine.ABSENT)
          problems.push(
            `items[${index}] response does not reach ${sealed.has(key) ? `the evidence of ${named(key)}` : criterion.evidence}`,
          );
      } catch (error) {
        // The engine's own wording names the channel and member the pointer reads, which a sealed criterion keeps to itself.
        problems.push(`items[${index}] ${sealed.has(key) ? `response cannot be read at the evidence of ${named(key)}` : error.message}`);
      }
    }
    if (expected.get(key).has(item.expectedLevel)) covered.get(key).add(item.expectedLevel);
    else problems.push(`items[${index}] expectedLevel ${JSON.stringify(item.expectedLevel)} is not an anchored level of ${named(key)}`);
    if (Object.keys(item).some((field) => !['rubricId', 'criterionId', 'response', 'responseKind', 'expectedLevel'].includes(field)))
      problems.push(`items[${index}] has an unknown field`);
    if (item.responseKind !== undefined && !['text', 'json'].includes(item.responseKind))
      problems.push(`items[${index}] responseKind must be text or json`);
  }
  for (const [key, levels] of expected) {
    const missing = [...levels].filter((level) => !covered.get(key).has(level));
    if (sealed.has(key)) {
      if (missing.length > 0) problems.push(`${named(key)} has no calibration item labelled at one of its anchored levels`);
    } else for (const level of missing) problems.push(`${key} has no calibration item labelled at anchored level ${level}`);
  }
  return problems;
}

function readCalibration(folder) {
  const directory = path.join(folder, 'policy');
  const file = path.join(folder, CALIBRATION_PATH);
  try {
    if (!fs.lstatSync(directory).isDirectory() || fs.realpathSync(directory) !== path.join(fs.realpathSync(folder), 'policy'))
      throw new Error(`${CALIBRATION_PATH} is reached through a link or a non-directory policy path`);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  let descriptor;
  try {
    descriptor = fs.openSync(file, READ_REGULAR);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`${CALIBRATION_PATH} must be a regular in-folder file`);
  }
  try {
    if (!fs.fstatSync(descriptor).isFile()) throw new Error(`${CALIBRATION_PATH} must be a regular in-folder file`);
    const bytes = fs.readFileSync(descriptor);
    return { bytes, value: JSON.parse(bytes.toString('utf8')) };
  } finally {
    fs.closeSync(descriptor);
  }
}

/** The digest of the labelled file's bytes: what a configuration binds as `tea.judgeCalibrationDigest` and a run records. */
function labelledDigest(labelled, engine) {
  return engine.digestBytes(labelled.bytes);
}

/**
 * The criteria of a calibration report whose agreement is below its `minimumAgreement`, each as a sentence; empty when
 * every criterion meets it. `run` stops with exit 11 on any, and `tea-evaluate ci` reads the same report with this.
 */
function calibrationShortfalls(report) {
  return report.criteria
    .filter((criterion) => criterion.agreement < report.minimumAgreement)
    .map(
      (criterion) =>
        `${criterion.rubricId}/${criterion.criterionId}: judge agreement ${criterion.agreement} is below the minimum ${report.minimumAgreement}`,
    );
}

/**
 * Whether a run's calibration holds only the criteria of its own view (Story 1.105). Under a partition plan one labelled file
 * serves every partition, so a development or held-out run skips the items of the other partition's criteria; the both run
 * and a folder with no plan hold every criterion and refuse an item that belongs to none.
 *
 * @param {string} partition the run's partition: `development`, `held-out` or `both`
 * @param {{ partitionPlan?: object }} evaluation
 * @returns {boolean}
 */
function calibrationPartial(partition, evaluation) {
  return evaluation.partitionPlan !== undefined && partition !== 'both';
}

/** A report carries the judge's answer beside its label, never into its input. */
async function runCalibration({ calibration, evaluation, contract, engine, writer, stop, judgeItem, partial = false }) {
  if ((contract.rubrics ?? []).length === 0) return null;
  const problems = calibrationProblems(evaluation, contract, calibration?.value, engine, { partial });
  if (problems.length > 0)
    throw stop({
      stage: 'trial',
      exitCode: 12,
      message: `judge calibration became invalid before trial: ${problems.join('; ')}`,
    });
  const criteria = [];
  for (const rubric of contract.rubrics)
    for (const criterion of rubric.criteria) {
      const items = [];
      const levels = new Set(rubric.scaleLevels.map((level) => level.level));
      for (const item of calibration.value.items.filter((entry) => entry.rubricId === rubric.id && entry.criterionId === criterion.id)) {
        const answer = await judgeItem({ rubric, criterion, response: item.response, responseKind: item.responseKind });
        items.push({
          expectedLevel: item.expectedLevel,
          actualLevel: answer,
          levelDistance: levels.has(answer) ? Math.abs(answer - item.expectedLevel) : null,
        });
      }
      const agreement = items.filter((item) => item.actualLevel === item.expectedLevel).length / items.length;
      criteria.push({
        rubricId: rubric.id,
        criterionId: criterion.id,
        agreement,
        largestLevelDistance: items.some((item) => item.levelDistance === null)
          ? null
          : Math.max(...items.map((item) => item.levelDistance)),
        items,
      });
    }
  const report = { minimumAgreement: evaluation.judgeCalibration.minimumAgreement, criteria };
  writer.writeJson('judge-calibration.json', report);
  if (calibrationShortfalls(report).length > 0)
    throw stop({
      stage: 'trial',
      exitCode: 11,
      message: `judge calibration agreement fell below ${report.minimumAgreement}; see judge-calibration.json`,
    });
  return { digest: labelledDigest(calibration, engine), report };
}

module.exports = {
  CALIBRATION_PATH,
  calibrationObservation,
  calibrationPartial,
  calibrationStepPair,
  calibrationProblems,
  calibrationShortfalls,
  labelledDigest,
  readCalibration,
  runCalibration,
};
