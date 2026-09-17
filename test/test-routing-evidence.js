/** Deterministic validation for Story 1.3's committed live routing evidence. */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadCorpus } = require('./eval-bmad-tea-routing');
const { digestFiles } = require('./lib/eval-record');
const { validateEvalResult } = require('./schema/eval-result');

const PROJECT_ROOT = path.join(__dirname, '..');
const EVIDENCE_ROOT = path.join(__dirname, 'results', 'live-eval-remediation', 'story-1-3');
const FIXTURES = ['test/fixtures/tea-routing-eval/intents.json'];

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(EVIDENCE_ROOT, file), 'utf8'));
}

function checkEqual(failures, actual, expected, label) {
  try {
    assert.deepStrictEqual(actual, expected);
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
  }
}

function qualityDiagnosticProjection(diagnostics, failures, file) {
  const found = [];
  for (const entry of diagnostics) {
    if (entry.failureClass === 'none') {
      checkEqual(failures, [entry.rootCause, entry.reason, entry.triage], [null, null, []], `${file} neutral diagnostic`);
      continue;
    }
    checkEqual(failures, entry.failureClass, 'quality', `${file} diagnostic failure class`);
    checkEqual(failures, entry.rootCause, 'tea-workflow-defect', `${file} diagnostic root cause`);
    checkEqual(
      failures,
      entry.triage.map((item) => item.rootCause),
      entry.triage.map(() => 'tea-workflow-defect'),
      `${file} triage root causes`,
    );
    checkEqual(failures, entry.reason, entry.triage.map((item) => item.reason).join('; '), `${file} diagnostic reasons`);
    found.push([entry.caseId, entry.repetition, entry.signature, entry.reason]);
  }
  return found;
}

async function main() {
  const failures = [];
  const contract = readJson('evidence-contract.json');
  const provenance = readJson('evidence-provenance.json');
  const corpus = await loadCorpus();

  checkEqual(failures, contract.version, 1, 'evidence contract version');
  checkEqual(
    failures,
    provenance,
    {
      story: '1.3',
      requestedRunner: { agent: 'claude', model: 'sonnet' },
      runnerAvailability: {
        status: 'unavailable',
        boundary: 'confirmed weekly usage limit',
        reportedBy: 'delivery coordinator',
        additionalCallsAttempted: 0,
      },
      substituteRunner: { agent: 'codex', model: 'gpt-5.6-sol' },
      comparability: {
        sameCorpus: true,
        sameGroundTruth: true,
        sameThresholds: true,
        sameRepetitions: true,
        sameRunner: false,
        sameModel: false,
        claim: 'focused remediation evidence with a disclosed runner substitution',
      },
      chronology: {
        preFixCapture: 'retrospective clean-detached-worktree run at the diagnostic-only commit',
        developmentAttempt:
          'clean-worktree run at b78fc67eee5223a267fa2f0e604a8dc269ae96e0; failed the zero-confident-route-on-unservable threshold',
        postFixCapture: 'clean-worktree run at the corrected implementation commit',
      },
    },
    'runner substitution provenance',
  );
  checkEqual(
    failures,
    corpus.cases.map((item) => item.id),
    contract.caseIds,
    'live corpus case ids',
  );
  checkEqual(failures, await digestFiles(PROJECT_ROOT, FIXTURES), contract.fixtureDigest, 'live fixture digest');

  const expectedGrid = contract.caseIds.flatMap((caseId) => [
    [caseId, 1],
    [caseId, 2],
  ]);

  for (const [file, expected] of Object.entries(contract.records)) {
    const record = readJson(file);
    const validation = validateEvalResult(record);
    if (!validation.success) failures.push(`${file}: record fails the eval-result schema`);
    checkEqual(failures, record.schemaVersion, '1.4.0', `${file} schema version`);
    checkEqual(failures, record.generatedAt, expected.generatedAt, `${file} capture timestamp`);
    checkEqual(failures, record.mode, 'live', `${file} run mode`);
    checkEqual(failures, record.repository, expected.repository, `${file} repository provenance`);
    checkEqual(failures, record.suite.id, 'bmad-tea-routing', `${file} suite id`);
    checkEqual(failures, record.suite.fixtureDigest, contract.fixtureDigest, `${file} fixture digest`);
    checkEqual(failures, record.suite.promptDigest, expected.suitePromptDigest, `${file} suite prompt digest`);
    checkEqual(failures, record.suite.caseIds, contract.caseIds, `${file} case ids`);
    checkEqual(
      failures,
      record.suite.cases.map((item) => item.id),
      contract.caseIds,
      `${file} prompt case ids`,
    );
    checkEqual(
      failures,
      record.suite.cases.map((item) => item.promptDigest),
      expected.casePromptDigests,
      `${file} case prompt digests`,
    );
    checkEqual(failures, record.suite.thresholds, contract.thresholds, `${file} thresholds`);
    checkEqual(failures, record.suite.declaredRepetitions, 2, `${file} declared repetitions`);
    checkEqual(failures, record.runners.length, 1, `${file} runner count`);

    const runner = record.runners[0];
    checkEqual(
      failures,
      {
        agent: runner.agent,
        executable: runner.executable,
        version: runner.version,
        model: runner.model,
        parameters: runner.parameters,
      },
      contract.runner,
      `${file} runner provenance`,
    );
    checkEqual(failures, runner.repetitions, { expected: 36, completed: 36 }, `${file} repetition aggregate`);
    checkEqual(failures, runner.measurements, expected.measurements, `${file} measurement aggregates`);
    checkEqual(failures, runner.failureClass, expected.failureClass, `${file} failure class`);
    checkEqual(failures, runner.failures, expected.failures, `${file} failure list`);
    checkEqual(
      failures,
      runner.diagnostics.map((entry) => [entry.caseId, entry.repetition]),
      expectedGrid,
      `${file} exact case and repetition grid`,
    );
    checkEqual(
      failures,
      runner.diagnostics.map((entry) => entry.completionState),
      expectedGrid.map(() => 'completed'),
      `${file} completion grid`,
    );
    checkEqual(
      failures,
      qualityDiagnosticProjection(runner.diagnostics, failures, file),
      expected.qualityDiagnostics,
      `${file} quality diagnoses`,
    );
  }

  if (failures.length > 0) {
    console.error(`routing evidence: ${failures.length} failure(s)`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`routing evidence: ${Object.keys(contract.records).length} records and ${expectedGrid.length} grid cells each passed`);
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exit(1);
});
