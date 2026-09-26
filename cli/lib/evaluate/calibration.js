/** Labelled rubric examples and their run gate (AD-22). */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CALIBRATION_PATH = 'policy/judge-calibration.json';
const READ_REGULAR = fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0) | (fs.constants.O_NOFOLLOW ?? 0);

function calibrationProblems(evaluation, contract, calibration) {
  const problems = [];
  const rubrics = Array.isArray(contract?.rubrics) ? contract.rubrics : [];
  if (rubrics.length === 0) {
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
  const expected = new Map();
  for (const rubric of rubrics)
    for (const criterion of rubric.criteria ?? [])
      expected.set(`${rubric.id}/${criterion.id}`, new Set((rubric.scaleLevels ?? []).map((level) => level.level)));
  const covered = new Map([...expected].map(([key]) => [key, new Set()]));
  for (const [index, item] of calibration.items.entries()) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      problems.push(`items[${index}] must be an object`);
      continue;
    }
    const key = `${item?.rubricId}/${item?.criterionId}`;
    if (!expected.has(key)) {
      problems.push(`items[${index}] names unknown rubric criterion ${key}`);
      continue;
    }
    if (typeof item.response !== 'string' || item.response.length === 0) problems.push(`items[${index}] needs a nonempty response`);
    if (expected.get(key).has(item.expectedLevel)) covered.get(key).add(item.expectedLevel);
    else problems.push(`items[${index}] expectedLevel ${JSON.stringify(item.expectedLevel)} is not an anchored level of ${key}`);
    if (Object.keys(item).some((field) => !['rubricId', 'criterionId', 'response', 'expectedLevel'].includes(field)))
      problems.push(`items[${index}] has an unknown field`);
  }
  for (const [key, levels] of expected)
    for (const level of levels)
      if (!covered.get(key).has(level)) problems.push(`${key} has no calibration item labelled at anchored level ${level}`);
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

/** A report carries the judge's answer beside its label, never into its input. */
async function runCalibration({ calibration, evaluation, contract, engine, writer, stop, judgeItem }) {
  if ((contract.rubrics ?? []).length === 0) return null;
  const criteria = [];
  for (const rubric of contract.rubrics)
    for (const criterion of rubric.criteria) {
      const items = [];
      const levels = new Set(rubric.scaleLevels.map((level) => level.level));
      for (const item of calibration.value.items.filter((entry) => entry.rubricId === rubric.id && entry.criterionId === criterion.id)) {
        const answer = await judgeItem({ rubric, criterion, response: item.response });
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
  if (criteria.some((criterion) => criterion.agreement < report.minimumAgreement))
    throw stop({
      stage: 'trial',
      exitCode: 11,
      message: `judge calibration agreement fell below ${report.minimumAgreement}; see judge-calibration.json`,
    });
  return { digest: engine.digestBytes(calibration.bytes), report };
}

module.exports = { CALIBRATION_PATH, calibrationProblems, readCalibration, runCalibration };
