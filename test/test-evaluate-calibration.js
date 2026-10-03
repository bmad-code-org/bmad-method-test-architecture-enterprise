'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { calibrationObservation, calibrationProblems, calibrationStepPair } = require('../cli/lib/evaluate/calibration');
const { suite } = require('./lib/evaluate-story-121');

const test = suite('tea-evaluate-calibration');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const ROOT = path.join(__dirname, '..');
const STUB = path.join(ROOT, 'test/fixtures/evaluate/stub-judge.js');

try {
  const nested = calibrationObservation({
    criterion: { evidence: '/interactions/judge-run/stdout/0' },
    response: '["calibration example"]',
    operationId: 'judge-run',
  });
  assert.deepEqual(nested.stdout, { kind: 'json', value: ['calibration example'] });
  assert.equal(nested.callInputs.argument, null);
  assert.deepEqual(nested.artifacts, {});
  const input = calibrationObservation({
    criterion: { evidence: '/interactions/judge-run/call-inputs/argument/verdict' },
    response: '{"verdict":"accepted"}',
    operationId: 'judge-run',
  });
  assert.deepEqual(input.callInputs.argument, { verdict: 'accepted' });
  const status = calibrationObservation({
    criterion: { evidence: '/interactions/judge-run/response-status' },
    response: '201',
    operationId: 'judge-run',
  });
  assert.equal(status.responseStatus, 201);
  const jsonRoot = calibrationObservation({
    criterion: { evidence: '/interactions/judge-run/stdout' },
    response: '{"example":"accepted"}',
    responseKind: 'json',
    operationId: 'judge-run',
  });
  assert.deepEqual(jsonRoot.stdout, { kind: 'json', value: { example: 'accepted' } });
  const textBody = calibrationObservation({
    criterion: { evidence: '/interactions/judge-run/response-body' },
    response: '{"example":"literal text"}',
    responseKind: 'text',
    operationId: 'judge-run',
  });
  assert.equal(textBody.responseBody, '{"example":"literal text"}');
  const engine = require('eval-quality');
  const nestedCriterion = { id: 'RC-101', evidence: '/interactions/judge-run/stdout/example' };
  const unreachable = calibrationProblems(
    { evaluator: { kind: 'command' }, judgeCalibration: { minimumAgreement: 1 } },
    { rubrics: [{ id: 'R-101', criteria: [nestedCriterion], scaleLevels: [{ level: 0 }] }] },
    { items: [{ rubricId: 'R-101', criterionId: 'RC-101', response: '{"other":"missing"}', expectedLevel: 0 }] },
    engine,
  );
  assert.match(unreachable.join('; '), /response does not reach \/interactions\/judge-run\/stdout\/example/);
  // Story 1.42: the observation the check resolves a response against names an interface beside its operation.
  const seen = [];
  const spying = {
    ...engine,
    makeResolveOperand: (observations, ...rest) => {
      seen.push(...Object.values(observations));
      return engine.makeResolveOperand(observations, ...rest);
    },
  };
  calibrationProblems(
    { evaluator: { kind: 'command' }, judgeCalibration: { minimumAgreement: 1 } },
    { rubrics: [{ id: 'R-101', criteria: [nestedCriterion], scaleLevels: [{ level: 0 }] }] },
    { items: [{ rubricId: 'R-101', criterionId: 'RC-101', response: '{"example":"accepted"}', expectedLevel: 0 }] },
    spying,
  );
  assert.equal(seen.length, 1);
  assert.equal(typeof seen[0].interfaceId, 'string', 'the calibration observation names no interface');
  // Story 1.103: a criterion's step gives its own interface and operation, also where two interfaces share the operation ID.
  const shared = {
    interactionPlan: [
      { stepId: 'first-run', interfaceId: 'grader-cli', operationId: 'grade-answer' },
      { stepId: 'second-run', interfaceId: 'grader-api', operationId: 'grade-answer' },
    ],
  };
  const pairOf = (contract, stepId) => calibrationStepPair(contract, { evidence: `/interactions/${stepId}/stdout` });
  assert.deepEqual(pairOf(shared, 'first-run'), { interfaceId: 'grader-cli', operationId: 'grade-answer' });
  assert.deepEqual(pairOf(shared, 'second-run'), { interfaceId: 'grader-api', operationId: 'grade-answer' });
  assert.deepEqual(pairOf(shared, 'absent-run'), { interfaceId: 'calibration', operationId: 'calibration' });
  assert.deepEqual(pairOf({}, 'first-run'), { interfaceId: 'calibration', operationId: 'calibration' });

  const project = test.project(
    'judge',
    ({ folder, directory }) => {
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
        agentArgs: [STUB, '--capture', path.join(directory, 'prompts.jsonl'), '--event-log', path.join(directory, 'launches.jsonl')],
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
      // The ordering assertions read the target's launches beside the judge's events, from the launch marker.
    },
    { marker: true },
  );
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
  const eventsFile = path.join(project.directory, 'launches.jsonl');
  const events = () => fs.readFileSync(eventsFile, 'utf8').trim().split('\n').map(JSON.parse);
  const failedEvents = events();
  assert.equal(failedEvents.filter((event) => event.calibration).length, 4);
  assert.equal(
    failedEvents.some((event) => event.workspace?.startsWith('trial-')),
    false,
  );
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
  const beforeFirstRun = events().length;
  const first = test.cli(project.folder, 'run', [], project.env);
  assert.equal(first.status, 0, first.output);
  const firstRun = test.latest(project.folder);
  const firstEvents = events().slice(beforeFirstRun);
  const firstTrialLaunch = firstEvents.findIndex((event) => event.workspace?.startsWith('trial-'));
  assert.ok(firstTrialLaunch >= 4, `trial launched before calibration: ${JSON.stringify(firstEvents)}`);
  assert.equal(firstEvents.slice(0, firstTrialLaunch).filter((event) => event.calibration).length, 4);
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
  assert.notEqual(firstEvidence.scoringVersion, thresholdEvidence.scoringVersion);
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
  assert.notEqual(thresholdEvidence.scoringVersion, secondEvidence.scoringVersion);
  const jsonItems = read(calibrationFile);
  jsonItems.items = jsonItems.items.map((item) => ({
    ...item,
    response: JSON.stringify({ example: item.response }),
    responseKind: 'json',
  }));
  write(calibrationFile, jsonItems);
  const beforeJsonPrompts = fs.readFileSync(path.join(project.directory, 'prompts.jsonl'), 'utf8').trim().split('\n').length;
  const jsonCheck = test.cli(project.folder, 'check');
  assert.equal(jsonCheck.status, 0, jsonCheck.output);
  const jsonRun = test.cli(project.folder, 'run', [], project.env);
  assert.equal(jsonRun.status, 0, jsonRun.output);
  const jsonPrompts = fs
    .readFileSync(path.join(project.directory, 'prompts.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .slice(beforeJsonPrompts, beforeJsonPrompts + 4)
    .map(JSON.parse)
    .map((prompt) => JSON.parse(prompt.slice(prompt.indexOf('Rubrics and evidence (JSON):') + 'Rubrics and evidence (JSON):'.length)));
  assert.equal(jsonPrompts.length, 4);
  for (const material of jsonPrompts) {
    assert.match(material.rubrics[0].criteria[0].evidence.example, /^calibration response [01]/);
    assert.equal(JSON.stringify(material).includes('expectedLevel'), false);
  }
  // The judge in a confined run (Story 1.31): it starts through the evaluation layer's confinement and calibrates and
  // scores as it does unconfined, with no launch marker for the target to write outside its workspace. At every launch,
  // calibration and trial alike, it tries to write into the evaluation folder's runs/: the opted-out run first, where
  // the writes land (so the confined refusal cannot pass for want of an attempt), then the confined run, which refuses
  // every one.
  const planted = path.join(project.folder, 'runs', '.layer-planted');
  const plantLog = path.join(project.directory, 'plants.jsonl');
  const plantedEvaluation = read(manifestFile);
  plantedEvaluation.judge.agentArgs.push('--plant', planted, '--plant-log', plantLog);
  write(manifestFile, plantedEvaluation);
  const attempts = () => (fs.existsSync(plantLog) ? fs.readFileSync(plantLog, 'utf8').trim().split('\n').map(JSON.parse) : []);
  const openRun = test.cli(project.folder, 'run', [], project.env);
  assert.equal(openRun.status, 0, openRun.output);
  const openAttempts = attempts();
  assert.ok(
    openAttempts.some((attempt) => attempt.calibration) && openAttempts.some((attempt) => !attempt.calibration),
    `the opted-out judge did not try its write in calibration and in a trial: ${JSON.stringify(openAttempts)}`,
  );
  assert.ok(
    openAttempts.every((attempt) => attempt.outcome === 'allowed') && fs.existsSync(planted),
    `the opted-out judge could not write into the evaluation folder, so the confined case proves nothing: ${JSON.stringify(openAttempts)}`,
  );
  fs.rmSync(planted);
  fs.rmSync(plantLog);
  const confinedEvaluation = read(manifestFile);
  delete confinedEvaluation.confinement;
  write(manifestFile, confinedEvaluation);
  const promptCount = () => fs.readFileSync(path.join(project.directory, 'prompts.jsonl'), 'utf8').trim().split('\n').length;
  const beforeConfined = promptCount();
  const confinedRun = test.cli(project.folder, 'run');
  assert.equal(confinedRun.status, 0, confinedRun.output);
  assert.equal(
    read(path.join(test.latest(project.folder), 'run.json')).confinement,
    process.platform === 'darwin' ? 'seatbelt' : 'bubblewrap',
  );
  assert.ok(promptCount() > beforeConfined + 4, 'the confined run did not calibrate and then judge its trials');
  const confinedAttempts = attempts();
  for (const [phase, calibrating] of [
    ['calibration', true],
    ['a trial', false],
  ]) {
    const made = confinedAttempts.filter((attempt) => attempt.calibration === calibrating);
    assert.ok(made.length > 0, `the confined judge tried no write during ${phase}, so the case proves nothing`);
    assert.ok(
      made.every((attempt) => /^refused (EPERM|EACCES|EROFS|ENOENT)$/.test(attempt.outcome)),
      `a confined run's judge wrote into the evaluation folder during ${phase}: ${JSON.stringify(made)}`,
    );
  }
  assert.equal(fs.existsSync(planted), false, `a confined run's judge planted ${planted}`);
  process.stdout.write('Evaluate rubric calibration and scoring version checks passed.\n');
} finally {
  test.cleanup();
}
