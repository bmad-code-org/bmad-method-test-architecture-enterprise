'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { engineProjection, phaseOf, projectTrial, writeInterpretation } = require('../cli/lib/evaluate/interpret');
const { createArtifactValidator } = require('../cli/lib/evaluate/records');
const { RunDirectory } = require('../cli/lib/evaluate/run-directory');
const { buildProject, API_INTERFACE, CLI_INTERFACE, OPERATION_ID } = require('./lib/evaluate-reused-operation');
const { scratchDirectories } = require('./lib/scratch-directories');
const { suite } = require('./lib/evaluate-story-121');

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const test = suite('tea-evaluate-interpret');
const PHASES = { notes: { step: 'process', result: 'outcome' } };
const findingKeys = new Set([
  'findingType',
  'findingId',
  'oracleId',
  'probeId',
  'behaviorId',
  'severity',
  'summary',
  'confidence',
  'observationIds',
  'evidenceArtifacts',
  'quotedEvidence',
  'citations',
  'oracleEvidencePointers',
]);

const sha256Of = (file) => `sha256:${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;

/**
 * Story 1.42: one contract whose command interface and HTTP interface both declare `grade-answer`, with a phase for each
 * pair. A real run records both routes, every sealed record meets the published schema, and a scored run's citations carry
 * the interface and the phase of their own pair.
 */
async function checkReusedOperation() {
  const scratch = scratchDirectories('tea-evaluate-reused-operation');
  try {
    const project = buildProject(scratch.make('project'));
    const { folder, env } = project;
    const digested = test.cli(folder, 'digest', [], env);
    assert.equal(digested.status, 0, digested.output);
    const checked = test.cli(folder, 'check', [], env);
    assert.equal(checked.status, 0, `a contract that reuses an operation ID across interfaces must check clean\n${checked.output}`);
    const ran = test.cli(folder, 'run', [], env);
    assert.equal(ran.status, 0, ran.output);
    const run = test.latest(folder);
    const index = read(path.join(run, 'trial-sets.json'));
    const contract = read(path.join(run, index.contract));
    const planned = new Map(contract.interactionPlan.map((step) => [step.stepId, step]));
    assert.deepEqual(
      [...planned.values()].map((step) => [step.interfaceId, step.operationId]),
      [
        [API_INTERFACE, OPERATION_ID],
        [CLI_INTERFACE, OPERATION_ID],
      ],
      'the plan names the shared operation ID on both interfaces',
    );
    const validate = createArtifactValidator();
    const recordPaths = index.trialSets.flatMap((set) => set.records);
    assert.ok(recordPaths.length >= 3, 'the run sealed a record for each probe');
    for (const relative of recordPaths) {
      const record = read(path.join(run, relative));
      assert.deepEqual(await validate('sealed-run-record', record), [], `${relative} meets the published sealed-run-record schema`);
      const seen = record.observations.map((observation) => [observation.interfaceId, observation.operationId]);
      assert.deepEqual(
        seen.sort(),
        [
          [API_INTERFACE, OPERATION_ID],
          [CLI_INTERFACE, OPERATION_ID],
        ].sort(),
        `${relative} records one observation for each route, each naming its interface`,
      );
      for (const observation of record.observations) {
        const step = planned.get(observation.observationId.replace(/^.*?-(grade-run(?:-cli)?)$/, '$1'));
        assert.equal(
          observation.interfaceId,
          step.interfaceId,
          `${relative} ${observation.observationId} names the interface of its plan step`,
        );
        // The published schema rejects an observation that lost its interface, on either route.
        const stripped = structuredClone(record);
        delete stripped.observations.find((candidate) => candidate.observationId === observation.observationId).interfaceId;
        assert.notDeepEqual(
          await validate('sealed-run-record', stripped),
          [],
          `${observation.interfaceId} observation without interfaceId`,
        );
      }
    }

    // Reused IDs keep distinct phases: the phase of a pair is looked up in its own interface.
    const phases = { [API_INTERFACE]: { [OPERATION_ID]: 'outcome' }, [CLI_INTERFACE]: { [OPERATION_ID]: 'process' } };
    assert.equal(phaseOf(phases, API_INTERFACE, OPERATION_ID), 'outcome');
    assert.equal(phaseOf(phases, CLI_INTERFACE, OPERATION_ID), 'process');
    assert.equal(phaseOf(phases, 'grader-other', OPERATION_ID), undefined);
    assert.equal(phaseOf(phases, 'constructor', OPERATION_ID), undefined);
    assert.equal(phaseOf(phases, CLI_INTERFACE, 'constructor'), undefined);

    const scored = test.cli(folder, 'score', ['--run', path.basename(run)], env);
    assert.equal(scored.status, 0, scored.output);
    const interpretation = read(path.join(run, 'interpretation.json'));
    const snapshot = read(path.join(run, 'run.json')).operationPhases;
    const manifest = read(path.join(folder, 'evaluation.json')).operationPhases;
    assert.deepEqual(snapshot, manifest, 'run.json snapshots the manifest phases');
    assert.equal(manifest[API_INTERFACE][OPERATION_ID], 'outcome');
    assert.equal(manifest[CLI_INTERFACE][OPERATION_ID], 'process');
    const citedOn = { process: new Set(), outcome: new Set() };
    let cited = 0;
    for (const probe of interpretation.probes) {
      const set = index.trialSets.find(({ probeId }) => probeId === probe.probeId);
      for (const [position, trial] of probe.trials.entries()) {
        const record = read(path.join(run, set.records[position]));
        for (const finding of trial.findings) {
          for (const citation of finding.citations) {
            const observation = record.observations.find(({ observationId }) => observationId === citation.observationId);
            assert.equal(citation.interfaceId, observation.interfaceId, `${probe.probeId} citation names the interface of its record`);
            assert.equal(citation.operationId, observation.operationId);
            assert.equal(citation.phase, snapshot[observation.interfaceId][observation.operationId], "the phase is the pair's own");
            assert.equal(citation.phase, manifest[observation.interfaceId][observation.operationId], "the phase is the manifest's");
            citedOn[citation.phase].add(`${probe.probeId}:${citation.interfaceId}`);
            cited += 1;
          }
        }
        // A finding that cites only one route stands in only that route's partition.
        for (const finding of trial.findings) {
          const phasesCited = new Set(finding.citations.map(({ phase }) => phase));
          assert.equal(trial.process.includes(finding.findingId), phasesCited.has('process'));
          assert.equal(trial.outcome.includes(finding.findingId), phasesCited.has('outcome'));
        }
      }
    }
    assert.ok(cited >= 2, 'the run produced a finding for each interface');
    assert.deepEqual([...citedOn.process], [`P-003:${CLI_INTERFACE}`], 'the process partition holds only the command route');
    assert.deepEqual([...citedOn.outcome], [`P-002:${API_INTERFACE}`], 'the outcome partition holds only the HTTP route');

    // A sealed record of the prior schema version is refused with the engine's named stamp finding, and nothing is scored.
    const [firstRecord] = recordPaths;
    const recordFile = path.join(run, firstRecord);
    const prior = read(recordFile);
    prior.schemaVersion = 6;
    fs.writeFileSync(recordFile, `${JSON.stringify(prior, null, 2)}\n`);
    const runFile = path.join(run, 'run.json');
    const runRecord = read(runFile);
    runRecord.artifacts.records[firstRecord] = sha256Of(recordFile);
    fs.writeFileSync(runFile, `${JSON.stringify(runRecord, null, 2)}\n`);
    const scoreDirectories = fs.readdirSync(path.join(run, 'scores')).length;
    const refused = test.cli(folder, 'score', ['--run', path.basename(run)], env);
    assert.equal(refused.status, 10, refused.output);
    assert.match(refused.output, /sealed-run-record carries "schemaVersion" 6 where this build reads 7/);
    assert.equal(fs.readdirSync(path.join(run, 'scores')).length, scoreDirectories, 'a prior-version record reached the scorer');
  } finally {
    scratch.removeAll();
  }
}

async function main() {
  try {
    const observations = [
      { observationId: 'late', sequence: 7, interfaceId: 'notes', operationId: 'step', provenance: 'evaluator-chosen' },
      { observationId: 'first', sequence: 3, interfaceId: 'notes', operationId: 'result', provenance: 'baseline' },
      { observationId: 'last', sequence: 12, interfaceId: 'notes', operationId: 'result', provenance: 'evaluator-chosen' },
      { observationId: 'low', sequence: 1, interfaceId: 'notes', operationId: 'step', provenance: 'baseline' },
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
          finding('F-004', 'low', ['late'], null),
        ],
      },
      PHASES,
      new Map([['O-001', { direction: { evidenceTargets: ['/interactions/result/stdout'] } }]]),
    );
    assert.equal(projected.firstMaterialError.sequence, 3);
    assert.equal(projected.firstMaterialError.observationId, 'first');
    assert.deepEqual(projected.process, ['F-001', 'F-003', 'F-004']);
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
    assert.equal(projected.findings[3].citations[0].observationId, 'late');
    assert.equal(projected.findings.length, 4);
    assert.deepEqual(
      projectTrial(
        { trialIndex: 6, observations, findings: [finding('F-009', 'material', ['late', 'low'])] },
        { notes: { step: 'process' } },
        new Map(),
      ).findings[0].citations.map(({ observationId, phase }) => [observationId, phase]),
      [
        ['late', 'process'],
        ['low', 'process'],
      ],
    );
    assert.throws(
      () =>
        projectTrial(
          { trialIndex: 4, observations, findings: [finding('F-006', 'material', ['absent'])] },
          { notes: { step: 'process' } },
          new Map(),
        ),
      /F-006 cites observation absent/,
    );
    assert.throws(
      () =>
        projectTrial(
          { trialIndex: 4, observations, findings: [finding('F-006', 'material', ['last'])] },
          { notes: { step: 'process' } },
          new Map(),
        ),
      /last names unclassified operation result of interface notes/,
    );
    const criticalOnly = projectTrial(
      { trialIndex: 5, observations, findings: [finding('F-007', 'critical', ['last']), finding('F-008', 'low', ['low'])] },
      PHASES,
      new Map(),
    );
    assert.equal(criticalOnly.firstMaterialError.sequence, 12);
    assert.equal(criticalOnly.firstMaterialError.findingId, 'F-007');
    // Two interfaces that declare one operation ID keep their own phases (Story 1.42): the same `operationId` on the cli
    // interface is `process` and on the api interface `outcome`, and a citation carries its interface.
    const shared = [
      { observationId: 'cli-note', sequence: 1, interfaceId: 'notes-cli', operationId: 'read-note', provenance: 'baseline' },
      { observationId: 'api-note', sequence: 2, interfaceId: 'notes-api', operationId: 'read-note', provenance: 'baseline' },
    ];
    const sharedPhases = { 'notes-cli': { 'read-note': 'process' }, 'notes-api': { 'read-note': 'outcome' } };
    const sharedProjection = projectTrial(
      {
        trialIndex: 1,
        observations: shared,
        findings: [finding('F-020', 'material', ['cli-note']), finding('F-021', 'material', ['api-note'])],
      },
      sharedPhases,
      new Map(),
    );
    assert.deepEqual(
      sharedProjection.findings.map(({ citations }) =>
        citations.map(({ interfaceId, operationId, phase }) => [interfaceId, operationId, phase]),
      ),
      [[['notes-cli', 'read-note', 'process']], [['notes-api', 'read-note', 'outcome']]],
    );
    assert.deepEqual([sharedProjection.process, sharedProjection.outcome], [['F-020'], ['F-021']]);
    assert.throws(
      () =>
        projectTrial(
          { trialIndex: 1, observations: shared, findings: [finding('F-022', 'material', ['api-note'])] },
          { 'notes-cli': { 'read-note': 'process' } },
          new Map(),
        ),
      /api-note names unclassified operation read-note of interface notes-api/,
    );
    const production = { outcomes: [{ oracleId: 'O-001' }], reducedProbeOutcomes: [], strength: { vector: {} }, productionVerdict: 'PASS' };
    assert.deepEqual(engineProjection(production), production);
    assert.equal(
      projectTrial({ trialIndex: 3, observations, findings: [finding('F-005', 'low', ['low'])] }, { notes: { step: 'process' } }, new Map())
        .firstMaterialError,
      null,
    );

    // A Git hook exports repository-local GIT_* values. Fixture commits must
    // create their own repository even when this test runs inside that hook.
    const gitNames = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE'];
    const inheritedGit = gitNames.map((name) => [name, process.env[name]]);
    for (const name of gitNames) process.env[name] = '/dev/null';
    let project;
    try {
      project = test.project('scored');
    } finally {
      for (const [name, value] of inheritedGit) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
    const ran = test.cli(project.folder, 'run', [], project.env);
    assert.equal(ran.status, 0, ran.output);
    const run = test.latest(project.folder);
    const manifest = path.join(project.folder, 'evaluation.json');
    const currentManifest = read(manifest);
    currentManifest.operationPhases.verdict['judge-request'] = 'process';
    fs.writeFileSync(manifest, `${JSON.stringify(currentManifest, null, 2)}\n`);
    const scored = test.cli(project.folder, 'score', ['--run', path.basename(run)], project.env);
    assert.equal(scored.status, 0, scored.output);
    const interpretation = read(path.join(run, 'interpretation.json'));
    const index = read(path.join(run, 'trial-sets.json'));
    const contract = read(path.join(run, index.contract));
    const scoreSummary = read(path.join(run, 'scores', interpretation.scoreInvocationId, 'score.json'));
    const scores = scoreSummary.scores;
    const runSnapshot = read(path.join(run, 'run.json'));
    const phaseBytes = fs.readFileSync(path.join(run, 'operation-phases.json'));
    assert.equal(runSnapshot.artifacts.operationPhases, `sha256:${crypto.createHash('sha256').update(phaseBytes).digest('hex')}`);
    assert.deepEqual(JSON.parse(phaseBytes.toString('utf8')), runSnapshot.operationPhases);
    assert.deepEqual(Object.keys(interpretation).sort(), ['probes', 'scoreInvocationId', 'strengthAggregate']);
    // The aggregate is carried as a pointer to the engine's copied file, its digest and its floors copy; no rate or decision is restated.
    const pointer = interpretation.strengthAggregate;
    assert.deepEqual(Object.keys(pointer).sort(), ['digest', 'floors', 'floorsDigest', 'path', 'reason', 'status']);
    assert.equal(pointer.status, 'copied');
    assert.equal(pointer.reason, null);
    assert.equal(pointer.path, scoreSummary.strengthAggregate.aggregate);
    const sha256 = (file) =>
      `sha256:${crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(project.folder, file)))
        .digest('hex')}`;
    assert.equal(pointer.digest, sha256(pointer.path));
    assert.equal(pointer.floorsDigest, sha256(pointer.floors));
    let sawFirstMaterialError = false;
    assert.equal(read(path.join(run, 'run.json')).operationPhases.verdict['judge-request'], 'outcome');
    assert.deepEqual(
      interpretation.probes.map(({ probeId }) => probeId),
      index.trialSets.map(({ probeId }) => probeId),
    );
    for (const [position, probe] of interpretation.probes.entries()) {
      assert.deepEqual(Object.keys(probe).sort(), [
        'engine',
        'evidence',
        'probeId',
        'scoreExitCode',
        'scoreFailure',
        'scoreRecord',
        'trials',
      ]);
      const set = index.trialSets[position];
      const score = scores.find(({ probeId }) => probeId === probe.probeId);
      const evidence = read(path.join(project.folder, score.evidence));
      assert.equal(probe.evidence, score.evidence);
      assert.equal(probe.scoreExitCode, score.exitCode);
      assert.equal(probe.scoreRecord, score.record);
      assert.equal(probe.scoreFailure, score.failure);
      for (const field of ['outcomes', 'reducedProbeOutcomes', 'strength', 'contractVerdict'])
        assert(Buffer.from(JSON.stringify(probe.engine[field]), 'utf8').equals(Buffer.from(JSON.stringify(evidence[field]), 'utf8')));
      assert.deepEqual(Object.keys(probe.engine).sort(), ['contractVerdict', 'outcomes', 'reducedProbeOutcomes', 'strength']);
      for (const [trialPosition, trial] of probe.trials.entries()) {
        assert.deepEqual(Object.keys(trial).sort(), ['findings', 'firstMaterialError', 'outcome', 'process', 'record', 'trialIndex']);
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
        const first = materialCitations[0];
        assert.deepEqual(
          trial.firstMaterialError,
          first
            ? {
                findingId: first.findingId,
                observationId: first.observation.observationId,
                sequence: first.observation.sequence,
                interfaceId: first.observation.interfaceId,
                operationId: first.observation.operationId,
                provenance: first.observation.provenance,
                phase: runSnapshot.operationPhases[first.observation.interfaceId][first.observation.operationId],
              }
            : null,
        );
        if (trial.firstMaterialError !== null) sawFirstMaterialError = true;
        for (const [findingPosition, traced] of trial.findings.entries()) {
          const original = record.findings[findingPosition];
          assert.deepEqual(Object.keys(traced).sort(), [...Object.keys(original), 'citations', 'oracleEvidencePointers'].sort());
          assert(Object.keys(traced).every((key) => findingKeys.has(key)));
          assert.equal(traced.oracleId, original.oracleId);
          assert.deepEqual(traced.quotedEvidence, original.quotedEvidence);
          assert.deepEqual(traced.evidenceArtifacts, original.evidenceArtifacts);
          assert.deepEqual(
            traced.oracleEvidencePointers,
            original.oracleId === null ? null : contract.oracles.find(({ id }) => id === original.oracleId).direction.evidenceTargets,
          );
          assert.deepEqual(
            traced.citations,
            original.observationIds.map((observationId) => {
              const observed = record.observations.find((candidate) => candidate.observationId === observationId);
              return {
                observationId,
                sequence: observed.sequence,
                interfaceId: observed.interfaceId,
                operationId: observed.operationId,
                provenance: observed.provenance,
                phase: runSnapshot.operationPhases[observed.interfaceId][observed.operationId],
              };
            }),
          );
        }
      }
    }
    assert.equal(sawFirstMaterialError, true, 'the persisted scored run contains no first material error');
    // The view helpers write through the run directory's held writer and summarize the evidence artifacts they are handed.
    const writer = RunDirectory.attach(run);
    const evidenceOf = (entries) =>
      new Map(
        entries
          .filter(({ evidence }) => evidence !== null)
          .map(({ probeId, evidence }) => [probeId, read(path.join(project.folder, evidence))]),
      );
    const readInput = (relative) => read(path.join(run, relative));
    const interpretationArgs = {
      writer,
      readInput,
      scoreInvocationId: interpretation.scoreInvocationId,
      trialSets: index.trialSets,
      scores,
      evidence: evidenceOf(scores),
      contractPath: index.contract,
      operationPhases: read(path.join(run, 'run.json')).operationPhases,
      strengthAggregate: scoreSummary.strengthAggregate,
    };
    const multiRecord = path.join(run, 'multi-citation-record.json');
    fs.writeFileSync(
      multiRecord,
      `${JSON.stringify({ trialIndex: 1, observations, findings: [finding('F-010', 'material', ['late', 'low'])] })}\n`,
    );
    writeInterpretation({
      ...interpretationArgs,
      trialSets: [{ ...index.trialSets[0], records: [path.basename(multiRecord)] }],
      scores: [scores[0]],
      operationPhases: PHASES,
    });
    const multiView = read(path.join(run, 'interpretation.json'));
    assert.deepEqual(
      multiView.probes[0].trials[0].findings[0].citations.map(({ observationId, phase }) => [observationId, phase]),
      [
        ['late', 'process'],
        ['low', 'process'],
      ],
    );
    assert.deepEqual(multiView.probes[0].trials[0].process, ['F-010']);
    assert.equal(multiView.probes[0].trials[0].firstMaterialError.sequence, 1);
    fs.unlinkSync(multiRecord);
    // The view reads the bytes `score` held at its input check and nothing from the run directory: a record or the
    // contract that differs on disk cannot reach it (Story 1.68).
    const heldSet = index.trialSets.find((set) => readInput(set.records[0]).findings.length > 0);
    assert.ok(heldSet, 'no record of the run has a finding to drop');
    const heldRecord = structuredClone(readInput(heldSet.records[0]));
    heldRecord.findings = [];
    writeInterpretation({
      ...interpretationArgs,
      trialSets: [heldSet],
      scores: scores.filter(({ probeId }) => probeId === heldSet.probeId),
      readInput: (relative) => (relative === heldSet.records[0] ? heldRecord : readInput(relative)),
    });
    assert.deepEqual(read(path.join(run, 'interpretation.json')).probes[0].trials[0].findings, [], 'the view read the record from disk');
    const view = path.join(run, 'interpretation.json');
    const sentinel = path.join(project.directory, 'outside.txt');
    fs.writeFileSync(sentinel, 'outside\n');
    fs.unlinkSync(view);
    fs.symlinkSync(sentinel, view);
    const rescored = test.cli(project.folder, 'score', ['--run', path.basename(run)], project.env);
    assert.equal(rescored.status, 0, rescored.output);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'outside\n');
    assert.equal(fs.lstatSync(view).isFile(), true);
    const tamperRunFile = path.join(run, 'run.json');
    const untampered = fs.readFileSync(tamperRunFile);
    const tampered = JSON.parse(untampered.toString('utf8'));
    tampered.operationPhases.verdict['judge-request'] = 'process';
    fs.writeFileSync(tamperRunFile, `${JSON.stringify(tampered, null, 2)}\n`);
    const scoreDirectories = fs.readdirSync(path.join(run, 'scores')).length;
    const tamperScore = test.cli(project.folder, 'score', ['--run', path.basename(run)], project.env);
    assert.equal(tamperScore.status, 10, tamperScore.output);
    assert.match(tamperScore.output, /operation-phases\.json/);
    assert.equal(fs.readdirSync(path.join(run, 'scores')).length, scoreDirectories, 'scorer ran after run.json phase tampering');
    fs.writeFileSync(tamperRunFile, untampered);
    writeInterpretation({
      writer,
      readInput,
      scoreInvocationId: 'missing-artifacts',
      evidence: new Map(),
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
      strengthAggregate: {
        ...scoreSummary.strengthAggregate,
        status: 'absent',
        reason: 'no evidence artifact was copied',
        aggregate: null,
        aggregateDigest: null,
      },
    });
    assert.deepEqual(
      [read(view).strengthAggregate.status, read(view).strengthAggregate.path, read(view).strengthAggregate.digest],
      ['absent', null, null],
    );
    assert(read(view).probes.every(({ engine }) => engine === null));
    assert(
      read(view).probes.every(
        ({ evidence, scoreExitCode, scoreRecord, scoreFailure }) =>
          evidence === null && scoreExitCode === 3 && scoreRecord !== null && scoreFailure === 'invalid input',
      ),
    );
    writer.close();
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
    await checkReusedOperation();
    process.stdout.write('Evaluate interpretation trace and engine copies passed.\n');
  } finally {
    test.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
