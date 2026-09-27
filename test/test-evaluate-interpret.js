'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { engineProjection, projectTrial, writeInterpretation } = require('../cli/lib/evaluate/interpret');
const { suite } = require('./lib/evaluate-story-121');

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const test = suite('tea-evaluate-interpret');

try {
  const observations = [
    { observationId: 'late', sequence: 7, operationId: 'step', provenance: 'evaluator-chosen' },
    { observationId: 'first', sequence: 3, operationId: 'result', provenance: 'baseline' },
    { observationId: 'last', sequence: 12, operationId: 'result', provenance: 'evaluator-chosen' },
    { observationId: 'low', sequence: 1, operationId: 'step', provenance: 'baseline' },
  ];
  const finding = (id, severity, observationIds, oracleId = 'O-001') => ({
    findingId: id,
    findingType: 'defect',
    oracleId,
    severity,
    observationIds,
    quotedEvidence: [{ quote: 'verbatim evidence', channel: 'stdout', artifactId: null }],
  });
  const projected = projectTrial(
    {
      trialIndex: 2,
      observations,
      findings: [
        finding('F-001', 'material', ['late', 'first']),
        finding('F-002', 'critical', ['last']),
        finding('F-003', 'low', ['low']),
        finding('F-004', 'low', [], null),
      ],
    },
    { step: 'process', result: 'outcome' },
    new Map([['O-001', { direction: { evidenceTargets: ['/interactions/result/stdout'] } }]]),
  );
  assert.equal(projected.firstMaterialError.sequence, 3);
  assert.equal(projected.firstMaterialError.observationId, 'first');
  assert.deepEqual(projected.process, ['F-001', 'F-003']);
  assert.deepEqual(projected.outcome, ['F-001', 'F-002']);
  assert.deepEqual(projected.findings[0].oracleEvidencePointers, ['/interactions/result/stdout']);
  assert.deepEqual(projected.findings[0].quotedEvidence[0].quote, 'verbatim evidence');
  assert.deepEqual(
    projected.findings[0].citations.map(({ sequence, phase }) => [sequence, phase]),
    [
      [7, 'process'],
      [3, 'outcome'],
    ],
  );
  assert.equal(projected.findings[3].oracleEvidencePointers, null);
  assert.deepEqual(projected.findings[3].citations, []);
  assert.equal(projected.findings.length, 4);
  assert.throws(
    () =>
      projectTrial({ trialIndex: 4, observations, findings: [finding('F-006', 'material', ['absent'])] }, { step: 'process' }, new Map()),
    /F-006 cites observation absent/,
  );
  assert.throws(
    () => projectTrial({ trialIndex: 4, observations, findings: [finding('F-006', 'material', ['last'])] }, { step: 'process' }, new Map()),
    /last names unclassified operation result/,
  );
  const criticalOnly = projectTrial(
    { trialIndex: 5, observations, findings: [finding('F-007', 'critical', ['last']), finding('F-008', 'low', ['low'])] },
    { step: 'process', result: 'outcome' },
    new Map(),
  );
  assert.equal(criticalOnly.firstMaterialError.sequence, 12);
  assert.equal(criticalOnly.firstMaterialError.findingId, 'F-007');
  const production = { outcomes: [{ oracleId: 'O-001' }], reducedProbeOutcomes: [], strength: { vector: {} }, productionVerdict: 'PASS' };
  assert.deepEqual(engineProjection(production), production);
  assert.equal(
    projectTrial({ trialIndex: 3, observations, findings: [finding('F-005', 'low', ['low'])] }, { step: 'process' }, new Map())
      .firstMaterialError,
    null,
  );

  const project = test.project('scored');
  const ran = test.cli(project.folder, 'run', [], project.env);
  assert.equal(ran.status, 0, ran.output);
  const run = test.latest(project.folder);
  const manifest = path.join(project.folder, 'evaluation.json');
  const currentManifest = read(manifest);
  currentManifest.operationPhases['judge-request'] = 'process';
  fs.writeFileSync(manifest, `${JSON.stringify(currentManifest, null, 2)}\n`);
  const scored = test.cli(project.folder, 'score', ['--run', path.basename(run)], project.env);
  assert.equal(scored.status, 0, scored.output);
  const interpretation = read(path.join(run, 'interpretation.json'));
  const index = read(path.join(run, 'trial-sets.json'));
  const contract = read(path.join(run, index.contract));
  const scores = read(path.join(run, 'scores', interpretation.scoreInvocationId, 'score.json')).scores;
  let sawFirstMaterialError = false;
  assert.equal(read(path.join(run, 'run.json')).operationPhases['judge-request'], 'outcome');
  assert.deepEqual(
    interpretation.probes.map(({ probeId }) => probeId),
    index.trialSets.map(({ probeId }) => probeId),
  );
  for (const [position, probe] of interpretation.probes.entries()) {
    const set = index.trialSets[position];
    const score = scores.find(({ probeId }) => probeId === probe.probeId);
    const evidence = read(path.join(project.folder, score.evidence));
    assert.equal(probe.evidence, score.evidence);
    assert.equal(probe.scoreExitCode, score.exitCode);
    assert.equal(probe.scoreRecord, score.record);
    assert.equal(probe.scoreFailure, score.failure);
    assert.equal(JSON.stringify(probe.engine.outcomes), JSON.stringify(evidence.outcomes));
    assert.equal(JSON.stringify(probe.engine.reducedProbeOutcomes), JSON.stringify(evidence.reducedProbeOutcomes));
    assert.equal(JSON.stringify(probe.engine.strength), JSON.stringify(evidence.strength));
    assert.equal(JSON.stringify(probe.engine.contractVerdict), JSON.stringify(evidence.contractVerdict));
    assert.deepEqual(Object.keys(probe.engine).sort(), ['contractVerdict', 'outcomes', 'reducedProbeOutcomes', 'strength']);
    for (const [trialPosition, trial] of probe.trials.entries()) {
      const record = read(path.join(run, set.records[trialPosition]));
      assert.equal(trial.record, set.records[trialPosition]);
      assert.equal(trial.findings.length, record.findings.length);
      assert.deepEqual(trial.process, []);
      assert.deepEqual(
        trial.outcome,
        record.findings.filter(({ observationIds }) => observationIds.length > 0).map(({ findingId }) => findingId),
      );
      const materialCitations = record.findings
        .filter(({ severity }) => severity === 'material' || severity === 'critical')
        .flatMap(({ findingId, observationIds }) =>
          observationIds.map((id) => ({ findingId, observation: record.observations.find(({ observationId }) => observationId === id) })),
        )
        .sort((left, right) => left.observation.sequence - right.observation.sequence);
      assert.equal(trial.firstMaterialError?.observationId ?? null, materialCitations[0]?.observation.observationId ?? null);
      if (trial.firstMaterialError !== null) sawFirstMaterialError = true;
      for (const [findingPosition, traced] of trial.findings.entries()) {
        const original = record.findings[findingPosition];
        assert.deepEqual(traced.quotedEvidence, original.quotedEvidence);
        assert.deepEqual(traced.evidenceArtifacts, original.evidenceArtifacts);
        assert.deepEqual(
          traced.oracleEvidencePointers,
          original.oracleId === null ? null : contract.oracles.find(({ id }) => id === original.oracleId).direction.evidenceTargets,
        );
        for (const citation of traced.citations) {
          const observed = record.observations.find(({ observationId }) => observationId === citation.observationId);
          assert.deepEqual(citation, {
            observationId: observed.observationId,
            sequence: observed.sequence,
            operationId: observed.operationId,
            provenance: observed.provenance,
            phase: read(path.join(run, 'run.json')).operationPhases[observed.operationId],
          });
        }
      }
    }
  }
  assert.equal(sawFirstMaterialError, true, 'the persisted scored run contains no first material error');
  const interpretationArgs = {
    folder: project.folder,
    runDirectory: run,
    scoreInvocationId: interpretation.scoreInvocationId,
    trialSets: index.trialSets,
    scores,
    contractPath: index.contract,
    operationPhases: read(path.join(run, 'run.json')).operationPhases,
  };
  for (const kind of ['contract', 'record', 'evidence']) {
    const linked = path.join(run, `${kind}-input-link.json`);
    const options = structuredClone(interpretationArgs);
    if (kind === 'contract') {
      fs.symlinkSync(path.join(run, index.contract), linked);
      options.contractPath = path.basename(linked);
    } else if (kind === 'record') {
      fs.symlinkSync(path.join(run, index.trialSets[0].records[0]), linked);
      options.trialSets[0].records[0] = path.basename(linked);
    } else {
      fs.symlinkSync(path.join(project.folder, scores[0].evidence), linked);
      options.scores[0].evidence = path.relative(project.folder, linked);
    }
    assert.throws(() => writeInterpretation(options), /symbolic link/, `${kind} link was followed`);
  }
  const view = path.join(run, 'interpretation.json');
  const sentinel = path.join(project.directory, 'outside.txt');
  fs.writeFileSync(sentinel, 'outside\n');
  fs.unlinkSync(view);
  fs.symlinkSync(sentinel, view);
  const rescored = test.cli(project.folder, 'score', ['--run', path.basename(run)], project.env);
  assert.equal(rescored.status, 0, rescored.output);
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'outside\n');
  assert.equal(fs.lstatSync(view).isFile(), true);
  writeInterpretation({
    folder: project.folder,
    runDirectory: run,
    scoreInvocationId: 'missing-artifacts',
    trialSets: index.trialSets,
    scores: index.trialSets.map(({ probeId }, index) => ({
      probeId,
      evidence: null,
      exitCode: 3,
      record: scores[index].record,
      failure: 'invalid input',
    })),
    contractPath: index.contract,
    operationPhases: read(path.join(run, 'run.json')).operationPhases,
  });
  assert(read(view).probes.every(({ engine }) => engine === null));
  assert(
    read(view).probes.every(
      ({ evidence, scoreExitCode, scoreRecord, scoreFailure }) =>
        evidence === null && scoreExitCode === 3 && scoreRecord !== null && scoreFailure === 'invalid input',
    ),
  );
  const runFile = path.join(run, 'run.json');
  const outdated = read(runFile);
  delete outdated.operationPhases;
  fs.writeFileSync(runFile, `${JSON.stringify(outdated, null, 2)}\n`);
  const refused = test.cli(project.folder, 'score', ['--run', path.basename(run)], project.env);
  assert.equal(refused.status, 10, refused.output);
  assert.match(refused.output, /run\.json.*operationPhases/);

  const invalidProject = test.project('invalid-score');
  const invalidRunResult = test.cli(invalidProject.folder, 'run', [], invalidProject.env);
  assert.equal(invalidRunResult.status, 0, invalidRunResult.output);
  const invalidRun = test.latest(invalidProject.folder);
  const invalidSets = read(path.join(invalidRun, 'trial-sets.json')).trialSets;
  fs.unlinkSync(path.join(invalidRun, invalidSets[0].isolationManifest));
  const invalidScore = test.cli(invalidProject.folder, 'score', ['--run', path.basename(invalidRun)], invalidProject.env);
  assert.equal(invalidScore.status, 3, invalidScore.output);
  const invalidView = read(path.join(invalidRun, 'interpretation.json'));
  assert.equal(invalidView.probes.find(({ probeId }) => probeId === invalidSets[0].probeId).engine, null);
  const invalidProbe = invalidView.probes.find(({ probeId }) => probeId === invalidSets[0].probeId);
  assert.equal(invalidProbe.evidence, null);
  assert.equal(invalidProbe.scoreExitCode, 3);
  assert.match(invalidProbe.scoreRecord, /score\.json$/);

  const danglingProject = test.project('dangling-citation');
  const danglingRunResult = test.cli(danglingProject.folder, 'run', [], danglingProject.env);
  assert.equal(danglingRunResult.status, 0, danglingRunResult.output);
  const danglingRun = test.latest(danglingProject.folder);
  const danglingIndex = read(path.join(danglingRun, 'trial-sets.json'));
  const citedRecord = danglingIndex.trialSets
    .flatMap(({ records }) => records)
    .find((relative) => read(path.join(danglingRun, relative)).findings.some(({ observationIds }) => observationIds.length > 0));
  assert(citedRecord, 'fixture produced no finding that cites an observation');
  const recordFile = path.join(danglingRun, citedRecord);
  const badRecord = read(recordFile);
  badRecord.findings.find(({ observationIds }) => observationIds.length > 0).observationIds[0] = 'absent-observation';
  fs.writeFileSync(recordFile, `${JSON.stringify(badRecord, null, 2)}\n`);
  const danglingRunFile = path.join(danglingRun, 'run.json');
  const danglingRunData = read(danglingRunFile);
  danglingRunData.artifacts.records[citedRecord] =
    `sha256:${crypto.createHash('sha256').update(fs.readFileSync(recordFile)).digest('hex')}`;
  fs.writeFileSync(danglingRunFile, `${JSON.stringify(danglingRunData, null, 2)}\n`);
  const danglingScore = test.cli(danglingProject.folder, 'score', ['--run', path.basename(danglingRun)], danglingProject.env);
  assert.equal(danglingScore.status, 10, danglingScore.output);
  assert.match(danglingScore.output, /absent-observation/);
  assert.equal(fs.existsSync(path.join(danglingRun, 'scores')), false, 'scorer ran after a dangling citation was found');
  process.stdout.write('Evaluate interpretation trace and engine copies passed.\n');
} finally {
  test.cleanup();
}
