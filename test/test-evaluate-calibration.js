'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { suite } = require('./lib/evaluate-story-121');

const test = suite('tea-evaluate-calibration');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const ROOT = path.join(__dirname, '..');
const STUB = path.join(ROOT, 'test/fixtures/evaluate/stub-judge.js');

try {
  const project = test.project('judge', ({ folder, directory }) => {
    const contractFile = path.join(folder, 'contract.json');
    const contract = read(contractFile);
    contract.rubrics = [
      {
        id: 'R-101',
        scaleLevels: [
          { level: 0, anchor: 'The response misses the verdict.' },
          { level: 1, anchor: 'The response states the verdict.' },
        ],
        failureModePenalties: [{ name: 'missing-verdict', description: 'A missing verdict scores zero.' }],
        maxLength: 200,
        criteria: [
          { id: 'RC-101', text: 'Does the response state the verdict?', evidence: '/interactions/judge-run/stdout' },
          { id: 'RC-102', text: 'Does the response explain the verdict?', evidence: '/interactions/judge-run/stdout' },
        ],
      },
    ];
    write(contractFile, contract);
    const manifestFile = path.join(folder, 'evaluation.json');
    const evaluation = read(manifestFile);
    evaluation.judge = {
      agent: 'custom',
      agentCommand: process.execPath,
      agentArgs: [STUB, '--capture', path.join(directory, 'prompts.jsonl')],
      timeoutMs: 60_000,
    };
    evaluation.judgeCalibration = { minimumAgreement: 0.9 };
    write(manifestFile, evaluation);
    write(path.join(folder, 'policy/evaluator-conditions.json'), {
      schemaVersion: 1,
      modelSnapshot: 'none',
      systemPromptDigest: `sha256:${crypto.createHash('sha256').update('').digest('hex')}`,
      judge: { modelSnapshot: 'stub-judge-2026-09' },
    });
    write(path.join(folder, 'policy/judge-calibration.json'), {
      items: ['RC-101', 'RC-102'].flatMap((criterionId) =>
        [0, 1].map((level) => ({
          rubricId: 'R-101',
          criterionId,
          response: `calibration response ${level}`,
          expectedLevel: level,
        })),
      ),
    });
  });
  const checked = test.cli(project.folder, 'check');
  assert.equal(checked.status, 0, checked.output);
  const failed = test.cli(project.folder, 'run', [], project.env);
  assert.equal(failed.status, 11, failed.output);
  const failedRun = test.latest(project.folder);
  const report = read(path.join(failedRun, 'judge-calibration.json'));
  assert.equal(report.criteria[0].agreement, 0.5);
  assert.equal(report.criteria[0].largestLevelDistance, 1);
  assert.equal(fs.existsSync(path.join(failedRun, 'trial-sets.json')), false);
  assert.equal(fs.existsSync(path.join(failedRun, 'trial-sets/P-001/record-1.json')), false);
  const prompts = fs.readFileSync(path.join(project.directory, 'prompts.jsonl'), 'utf8');
  assert.equal(prompts.includes('expectedLevel'), false);
  assert.equal(prompts.includes('calibration response 0'), true);
  const calibrationPrompts = prompts
    .trim()
    .split('\n')
    .map(JSON.parse)
    .map((prompt) => JSON.parse(prompt.slice(prompt.indexOf('Rubrics and evidence (JSON):') + 'Rubrics and evidence (JSON):'.length)));
  assert.equal(calibrationPrompts.length, 4);
  assert.deepEqual(calibrationPrompts.map((material) => material.rubrics[0].criteria[0].criterionId).sort(), [
    'RC-101',
    'RC-101',
    'RC-102',
    'RC-102',
  ]);
  for (const material of calibrationPrompts) {
    assert.equal(material.rubrics.length, 1);
    assert.equal(material.rubrics[0].criteria.length, 1);
    assert.match(material.rubrics[0].criteria[0].evidence, /^calibration response [01]$/);
  }

  const manifestFile = path.join(project.folder, 'evaluation.json');
  const evaluation = read(manifestFile);
  evaluation.judgeCalibration.minimumAgreement = 0.5;
  write(manifestFile, evaluation);
  const first = test.cli(project.folder, 'run', [], project.env);
  assert.equal(first.status, 0, first.output);
  const firstRun = test.latest(project.folder);
  assert.ok(
    fs.statSync(path.join(firstRun, 'judge-calibration.json')).mtimeMs <=
      fs.statSync(path.join(firstRun, 'trial-sets/P-001/record-1.json')).mtimeMs,
  );
  const firstRecord = read(path.join(firstRun, 'run.json'));
  const firstConfig = read(path.join(firstRun, 'evaluator-configuration.json'));
  assert.match(firstConfig.decodingParameters['tea.judgeCalibrationDigest'], /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(firstConfig.judgeConfiguration).sort(), ['modelSnapshot', 'systemPromptDigest']);
  const firstScore = test.cli(project.folder, 'score', ['--run', path.basename(firstRun)], project.env);
  assert.equal(firstScore.status, 0, firstScore.output);
  evaluation.judgeCalibration.minimumAgreement = 0.4;
  write(manifestFile, evaluation);
  const thresholdRunResult = test.cli(project.folder, 'run', [], project.env);
  assert.equal(thresholdRunResult.status, 0, thresholdRunResult.output);
  const thresholdRun = test.latest(project.folder);
  const thresholdRecord = read(path.join(thresholdRun, 'run.json'));
  const thresholdConfig = read(path.join(thresholdRun, 'evaluator-configuration.json'));
  assert.equal(firstConfig.decodingParameters['tea.judgeCalibrationMinimumAgreement'], 0.5);
  assert.equal(thresholdConfig.decodingParameters['tea.judgeCalibrationMinimumAgreement'], 0.4);
  assert.equal(
    thresholdConfig.decodingParameters['tea.judgeCalibrationDigest'],
    firstConfig.decodingParameters['tea.judgeCalibrationDigest'],
  );
  assert.notEqual(thresholdRecord.evaluatorConfigurationDigest, firstRecord.evaluatorConfigurationDigest);
  const thresholdScore = test.cli(project.folder, 'score', ['--run', path.basename(thresholdRun)], project.env);
  assert.equal(thresholdScore.status, 0, thresholdScore.output);
  const firstScoreId = fs.readdirSync(path.join(firstRun, 'scores')).sort().at(-1);
  const thresholdScoreId = fs.readdirSync(path.join(thresholdRun, 'scores')).sort().at(-1);
  const firstEvidence = read(path.join(firstRun, 'scores', firstScoreId, 'P-001/evidence-artifact.json'));
  const thresholdEvidence = read(path.join(thresholdRun, 'scores', thresholdScoreId, 'P-001/evidence-artifact.json'));
  assert.notEqual(JSON.stringify(firstEvidence.scoringVersionInputs), JSON.stringify(thresholdEvidence.scoringVersionInputs));
  const calibrationFile = path.join(project.folder, 'policy/judge-calibration.json');
  const edited = read(calibrationFile);
  edited.items[0].response += ' edited';
  write(calibrationFile, edited);
  const second = test.cli(project.folder, 'run', [], project.env);
  assert.equal(second.status, 0, second.output);
  const secondRun = test.latest(project.folder);
  const secondRecord = read(path.join(secondRun, 'run.json'));
  const secondConfig = read(path.join(secondRun, 'evaluator-configuration.json'));
  assert.notEqual(
    secondConfig.decodingParameters['tea.judgeCalibrationDigest'],
    firstConfig.decodingParameters['tea.judgeCalibrationDigest'],
  );
  assert.notEqual(secondRecord.evaluatorConfigurationDigest, firstRecord.evaluatorConfigurationDigest);
  const secondScore = test.cli(project.folder, 'score', ['--run', path.basename(secondRun)], project.env);
  assert.equal(secondScore.status, 0, secondScore.output);
  const secondScoreId = fs.readdirSync(path.join(secondRun, 'scores')).sort().at(-1);
  const secondEvidence = read(path.join(secondRun, 'scores', secondScoreId, 'P-001/evidence-artifact.json'));
  assert.notEqual(JSON.stringify(thresholdEvidence.scoringVersionInputs), JSON.stringify(secondEvidence.scoringVersionInputs));
  process.stdout.write('Evaluate rubric calibration and scoring version checks passed.\n');
} finally {
  test.cleanup();
}
