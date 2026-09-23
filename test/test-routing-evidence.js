/**
 * Deterministic validation for Story 1.3's committed live routing evidence.
 *
 * The evidence's `caseIds` and whole-file digests are frozen at the eighteen
 * cases the live runs actually measured. The Evaluate initiative's own Story
 * 1.3 (a later, unrelated story sharing this number) adds a nineteenth case to
 * the same corpus, so the corpus is no longer byte-identical to what the
 * evidence recorded. Each of the original eighteen cases is snapshotted under
 * `cases/<id>.json`, extracted while the live corpus still matched the
 * evidence's whole-file digests, so this test holds every recorded case
 * byte-identical to its snapshot while admitting cases added after it.
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadCorpus } = require('./eval-bmad-tea-routing');
const { digest } = require('./lib/eval-record');
const { validateEvalResult } = require('./schema/eval-result');

const EVIDENCE_ROOT = path.join(__dirname, 'results', 'live-eval-remediation', 'story-1-3');
const CASES_ROOT = path.join(EVIDENCE_ROOT, 'cases');

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(EVIDENCE_ROOT, file), 'utf8'));
}

function readCaseSnapshot(id) {
  return JSON.parse(fs.readFileSync(path.join(CASES_ROOT, `${id}.json`), 'utf8'));
}

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;

/**
 * Each recorded case id, held byte-identical to its frozen snapshot.
 *
 * The snapshot's own `caseDigest` is recomputed and checked first, so a hand
 * edit of the snapshot file itself is caught before it could hide a live
 * edit; only then is the live corpus entry compared to the snapshot. A
 * missing or corrupt snapshot file is one failure among many rather than an
 * uncaught exception, so every other recorded case still gets checked.
 */
function checkCaseSnapshots(failures, contract, corpus) {
  const liveById = new Map(corpus.cases.map((item) => [item.id, item]));
  for (const id of contract.caseIds) {
    if (!liveById.has(id)) {
      failures.push(`live corpus: recorded case "${id}" is missing`);
      continue;
    }
    let snapshot;
    try {
      snapshot = readCaseSnapshot(id);
    } catch (error) {
      failures.push(`cases/${id}.json: ${error.message}`);
      continue;
    }
    const recomputed = digest([JSON.stringify(snapshot.intent), JSON.stringify(snapshot.groundTruth)]);
    checkEqual(failures, recomputed, snapshot.caseDigest, `cases/${id}.json self-digest`);

    const live = liveById.get(id);
    checkEqual(failures, { id: live.id, intent: live.intent }, snapshot.intent, `intents.json :: ${id} matches its snapshot`);
    checkEqual(failures, live.expected, snapshot.groundTruth, `ground-truth.json :: ${id} matches its snapshot`);
  }
}

function checkEqual(failures, actual, expected, label) {
  try {
    assert.deepStrictEqual(actual, expected);
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
  }
}

/**
 * The deterministic prefix of `signatureOf`'s format (`action|menuCode|workflow|...`)
 * a correct answer to this case must carry. The trailing `candidateCodesNamed`
 * segment is left unconstrained: a clarify case's passing threshold does not
 * fix which spellings the agent named, only that naming recall cleared it.
 */
function expectedSignaturePrefix(expected) {
  if (expected.expectedAction === 'route') return `route|${expected.expectedMenuCode}|${expected.expectedWorkflow ?? ''}|`;
  return `${expected.expectedAction}||`;
}

function qualityDiagnosticProjection(diagnostics, failures, file, expectedById) {
  const found = [];
  for (const entry of diagnostics) {
    if (entry.failureClass === 'none') {
      checkEqual(failures, [entry.rootCause, entry.reason, entry.triage], [null, null, []], `${file} neutral diagnostic`);
      const expected = expectedById.get(entry.caseId);
      if (expected === undefined) {
        failures.push(`${file}: diagnostic names case "${entry.caseId}", which has no recorded ground truth`);
      } else if (!entry.signature.startsWith(expectedSignaturePrefix(expected))) {
        failures.push(
          `${file} :: ${entry.caseId} rep ${entry.repetition}: signature "${entry.signature}" does not start with the expected "${expectedSignaturePrefix(expected)}"`,
        );
      }
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
  const expectedById = new Map(contract.caseIds.map((id) => [id, readCaseSnapshot(id).groundTruth]));

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
  checkCaseSnapshots(failures, contract, corpus);

  // Per-case snapshots superseded these as the live-corpus check once the
  // corpus grew past the eighteen cases they were computed over, so they are
  // no longer compared against anything live; this holds them to the shape a
  // real digest has, so a corrupted field still fails rather than sitting
  // unchecked.
  if (!SHA256_PATTERN.test(contract.fixtureDigest)) failures.push('evidence contract fixtureDigest is not a sha256 digest');
  if (!SHA256_PATTERN.test(contract.recordFixtureDigest)) failures.push('evidence contract recordFixtureDigest is not a sha256 digest');

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
    checkEqual(failures, record.suite.fixtureDigest, contract.recordFixtureDigest, `${file} fixture digest`);
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
      qualityDiagnosticProjection(runner.diagnostics, failures, file, expectedById),
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
