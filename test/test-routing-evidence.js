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
 * The eighteen original cases' digests, recorded here rather than only inside
 * each `cases/<id>.json` snapshot. A digest stored beside the data it
 * protects stays self-consistent under a coordinated edit of both fields in
 * the same file; a second copy in this source file does not, since editing a
 * snapshot's `intent` or `groundTruth` without also editing this literal (a
 * different file, in its own diff hunk) now fails here.
 */
const EXPECTED_CASE_DIGESTS = {
  'acceptance-tests-before-code': 'sha256:66eaff7d8d0dd6c27f1f71f0884a4b78a1ce8bc0b61197bd5107f19b5ad6e4ba',
  'epic-risk-before-tests': 'sha256:12a86a5e755fbc76699cb63bfdce1156d1a4e64965c839e25fccee7580c1c003',
  'good-or-covering-what-matters': 'sha256:95842385e7a682b7fb7cd73ecfb25d20a197ed0e9d0c52cd0cd8120d6d8380c9',
  'hire-a-qa-lead': 'sha256:0d1a944fb833f2c14251f65188892affb00f2c3f33c153d23a3ef7b77cd6b1b8',
  'implemented-feature-no-tests': 'sha256:7a30e63d0b786933872ff00e5a3cbd867fdf4b611b9385dcab52caf9da61e3bd',
  'learn-testing-properly': 'sha256:44923a46338209779cceae9b2f35649610e284c77f84e7f1e9d9d6e863793603',
  'measured-some-nfrs-planned-none': 'sha256:4306e801f9d063b0ae890c48a5363592d0687053e6e76033320d228844bb1570',
  'nfr-evidence-on-hand': 'sha256:6b687701e55f5d9a7e32646e6a3ea893365c2c89c6243480f5c1ef99df7f3888',
  'no-framework-yet': 'sha256:a6a62655dfe46039ffc5c353d8148c1f9cc82e696dc29bc3cb90ed4d39aa17ed',
  'penetration-test-staging': 'sha256:ebbb4144d7879f8841878453c884bae9eedb0d5aa27bd9cb1d6046fda7ccf497',
  'pipeline-quality-gates': 'sha256:b92a6b85450671120610b92598b7175e98a37f9e512d5e260395b03108f20dbe',
  'release-gate-sequence': 'sha256:a1edfc7ef76f6c614d1f566fe8897ec82b818e65dc6a73e373a4d889abb810f3',
  'review-existing-tests': 'sha256:30cfd925b46b2f8083368bd458a87b748c2e0f452b51e5f347f297d65bc776b1',
  'run-and-fix-ci-failures': 'sha256:b7a8d3b1fb2a7c0e4d3f39081b6273b90902664967f01f5ddacc02357b7ff8bb',
  'story-half-done': 'sha256:63e1ece075fc2a89edb970e6975c9819cf211c81f0b72cc278590469e38be058',
  'thin-coverage-on-payments': 'sha256:e4710a957bfabe0419699746252a29323b24a51e287feea866a74ca77c8ab460',
  'trace-criteria-to-tests': 'sha256:ddf0766497da0fd7dd6c196e1aeee5542dd6c19e62ea0e7fbc596036497c8e0d',
  'write-production-code': 'sha256:d2a03e69bd69506a60e245efbf3061bcba201ede505a37f9608a1823257d135f',
};

/**
 * Each recorded case id, held byte-identical to its frozen snapshot, and
 * every snapshot's digest held to the independently recorded copy above.
 *
 * The snapshot's own `caseDigest` is recomputed and checked first, so a hand
 * edit of the snapshot file itself is caught before it could hide a live
 * edit; only then is the live corpus entry compared to the snapshot. A
 * missing or corrupt snapshot file is one failure among many rather than an
 * uncaught exception, so every other recorded case still gets checked.
 *
 * @returns {Map<string, object>} case id to its ground truth, for every case
 *   whose snapshot was read successfully.
 */
function checkCaseSnapshots(failures, contract, corpus) {
  const liveById = new Map(corpus.cases.map((item) => [item.id, item]));
  const expectedById = new Map();
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
    checkEqual(failures, snapshot.caseDigest, EXPECTED_CASE_DIGESTS[id], `cases/${id}.json digest matches the independently recorded copy`);

    const live = liveById.get(id);
    checkEqual(failures, { id: live.id, intent: live.intent }, snapshot.intent, `intents.json :: ${id} matches its snapshot`);
    checkEqual(failures, live.expected, snapshot.groundTruth, `ground-truth.json :: ${id} matches its snapshot`);
    expectedById.set(id, snapshot.groundTruth);
  }
  return expectedById;
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
  const expectedById = checkCaseSnapshots(failures, contract, corpus);

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
