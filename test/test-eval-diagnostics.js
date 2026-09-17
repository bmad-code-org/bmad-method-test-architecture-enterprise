/** Deterministic contract checks for per-repetition live diagnostics. */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const { diagnosticRecord, classifyDiagnosticQuality, suiteResultRecord, runSummaryRecord } = require('./lib/eval-record');
const { compareEvalRuns } = require('./lib/compare-eval-runs');
const { validateEvalResult, validateEvalRun, SCHEMA_VERSION, LEGACY_SCHEMA_VERSION } = require('./schema/eval-result');

const PROJECT_ROOT = path.join(__dirname, '..');
const LEGACY_RESULT = path.join(__dirname, 'results', 'eval-all', 'history', '2026-09-17T12-23-09-218Z.json');
const DIGEST = `sha256:${'0'.repeat(64)}`;
const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function runner(diagnostics, overrides = {}) {
  return {
    agent: 'diagnostic-test',
    executable: process.execPath,
    version: process.version,
    model: null,
    parameters: { agentArgs: [], envPassNames: [], timeoutMs: 1000, promptTransport: 'stdin' },
    repetitions: {
      expected: diagnostics.length,
      completed: diagnostics.filter((entry) => entry.completionState === 'completed').length,
    },
    measurements: { accuracy: 1 },
    durationMs: 1,
    usage: null,
    failureClass: 'none',
    failures: [],
    diagnostics,
    ...overrides,
  };
}

function suiteRecord(runners) {
  return suiteResultRecord({
    generatedAt: '2026-09-17T00:00:00.000Z',
    mode: 'live',
    suite: {
      id: 'diagnostic-test',
      evalType: 'behavioral',
      skills: ['bmad-testarch-atdd'],
      contracts: [],
      ciTier: 'deterministic',
      runnerCapabilities: ['read-only'],
      thresholds: { accuracy: 1, maxUnstableCases: 0 },
      repetitions: 2,
    },
    repository: { commit: 'abc123', dirty: false },
    fixtureDigest: DIGEST,
    promptDigest: DIGEST,
    cases: [{ id: 'case-a', promptDigest: DIGEST }],
    runners,
    durationMs: 1,
  });
}

async function main() {
  const first = diagnosticRecord({
    caseId: 'case-a',
    repetition: 1,
    signature: 'answer-a',
    metricContributions: { accuracy: 1 },
    evidence: [{ kind: 'output-signature', value: 'answer-a' }],
  });
  const second = diagnosticRecord({
    caseId: 'case-a',
    repetition: 2,
    signature: 'answer-b',
    metricContributions: { accuracy: 0 },
    evidence: [{ kind: 'artifact', value: 'test-artifacts/report.json' }],
  });
  const qualityDiagnostics = classifyDiagnosticQuality([first, second], ['accuracy', '1 unstable case']);
  const quality = suiteRecord([
    runner(qualityDiagnostics, {
      measurements: { accuracy: 0.5, unstableCases: 1 },
      failureClass: 'quality',
      failures: ['accuracy', '1 unstable case'],
    }),
  ]);
  check(quality.schemaVersion === SCHEMA_VERSION, `new writer emitted ${quality.schemaVersion}, expected ${SCHEMA_VERSION}`);
  check(validateEvalResult(quality).success, 'a quality result with one diagnostic per repetition is schema-valid');
  check(
    quality.runners[0].diagnostics.map((entry) => entry.signature).join(',') === 'answer-a,answer-b',
    'an unstable pair keeps both exact signatures',
  );
  check(
    quality.runners[0].diagnostics.every((entry) => entry.failureClass === 'quality' && entry.reason?.includes('accuracy')),
    'quality diagnostics carry the quality class and reason',
  );

  const environment = diagnosticRecord({
    caseId: 'case-a',
    repetition: 2,
    signature: 'discarded',
    metricContributions: { accuracy: 0 },
    failureClass: 'environment-timeout',
    reason: 'runner timed out',
  });
  check(environment.signature === null, 'an environment failure carries no stability signature');
  check(Object.keys(environment.metricContributions).length === 0, 'an environment failure carries no quality contribution');
  const environmentResult = suiteRecord([
    runner([first, environment], {
      repetitions: { expected: 2, completed: 1 },
      measurements: { accuracy: 1 },
      failureClass: 'environment-timeout',
      failures: ['one repetition timed out'],
    }),
  ]);
  check(validateEvalResult(environmentResult).success, 'an environment failure and the completed quality measurement validate together');
  check(environmentResult.runners[0].measurements.accuracy === 1, 'an environment failure does not lower the aggregate quality metric');

  const extraField = structuredClone(quality);
  extraField.runners[0].diagnostics[0].rawOutput = 'unbounded output';
  check(!validateEvalResult(extraField).success, 'the current diagnostic schema rejects undeclared evidence fields');

  const missingDiagnostic = structuredClone(quality);
  missingDiagnostic.runners[0].diagnostics.pop();
  check(!validateEvalResult(missingDiagnostic).success, 'the current schema requires one diagnostic per attempted repetition');

  const legacy = JSON.parse(fs.readFileSync(LEGACY_RESULT, 'utf8'));
  check(legacy.schemaVersion === LEGACY_SCHEMA_VERSION, `protected baseline is ${legacy.schemaVersion}, expected ${LEGACY_SCHEMA_VERSION}`);
  check(validateEvalRun(legacy).success, 'the protected 1.3.0 run remains readable');
  check(
    createHash('sha256').update(fs.readFileSync(LEGACY_RESULT)).digest('hex') ===
      '201138d028e6c5612dc5786a1617025c6b9d01cf0de2d34e00f37cff8c8c7631',
    'the protected baseline remains byte-for-byte unchanged',
  );

  const currentRun = runSummaryRecord({
    generatedAt: '2026-09-17T00:00:00.000Z',
    repository: { commit: 'abc123', dirty: false },
    suites: [quality],
    unaccountedSkills: [],
    durationMs: 1,
  });
  check(validateEvalRun(currentRun).success, 'a current run summary containing diagnostics validates');

  const legacyPair = structuredClone(currentRun);
  legacyPair.schemaVersion = LEGACY_SCHEMA_VERSION;
  for (const suite of legacyPair.suites) {
    suite.schemaVersion = LEGACY_SCHEMA_VERSION;
    for (const resultRunner of suite.runners) delete resultRunner.diagnostics;
  }
  check(validateEvalRun(legacyPair).success, 'a synthetic 1.3.0 run validates through the legacy read path');
  const comparison = await compareEvalRuns(legacyPair, currentRun);
  check(comparison.status === 'compared', `cross-version comparison returned ${comparison.status}`);

  const liveOutput = path.join(os.tmpdir(), `eval-diagnostics-${process.pid}.json`);
  try {
    const live = spawnSync(process.execPath, [path.join(PROJECT_ROOT, 'test', 'eval-automate.js'), '--json', liveOutput], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });
    check(live.status === 0, `deterministic automate harness exited ${live.status}: ${live.stderr}`);
    if (live.status === 0 && fs.existsSync(liveOutput)) {
      const emitted = JSON.parse(fs.readFileSync(liveOutput, 'utf8'));
      check(validateEvalResult(emitted).success, 'deterministic automate output validates with diagnostics');
      const emittedRunner = emitted.runners[0];
      const pairs = emittedRunner.diagnostics.map((entry) => `${entry.caseId}:${entry.repetition}`);
      check(new Set(pairs).size === pairs.length, 'deterministic automate diagnostics use unique case and repetition pairs');
      check(
        emittedRunner.diagnostics.length === emitted.suite.caseIds.length * emitted.suite.declaredRepetitions,
        'deterministic automate covers every declared case repetition',
      );
    }
  } finally {
    fs.rmSync(liveOutput, { force: true });
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'evals', 'suite-manifest.json'), 'utf8'));
  for (const entry of manifest.suites) {
    const source = fs.readFileSync(path.join(PROJECT_ROOT, entry.harness), 'utf8');
    check(source.includes('diagnosticRecord('), `${entry.harness} constructs no per-repetition diagnostic`);
    check(source.includes('diagnostics:'), `${entry.harness} does not attach diagnostics to its runner record`);
  }

  if (failures.length > 0) {
    console.error(`eval diagnostics: ${failures.length} failure(s) across ${checks} checks`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`eval diagnostics: ${checks} checks passed`);
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exit(1);
});
