/** Deterministic contract checks for per-repetition live diagnostics. */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const {
  diagnosticRecord,
  numericContributions,
  classifyDiagnosticQuality,
  redactSecrets,
  artifactEvidence,
  suiteResultRecord,
  runSummaryRecord,
} = require('./lib/eval-record');
const { compareEvalRuns } = require('./lib/compare-eval-runs');
const {
  diagnosticSchema,
  validateEvalResult,
  validateEvalRun,
  SCHEMA_VERSION,
  LEGACY_SCHEMA_VERSION,
  ROOT_CAUSES,
} = require('./schema/eval-result');
const atdd = require('./eval-atdd');
const automate = require('./eval-automate');
const routing = require('./eval-bmad-tea-routing');
const ci = require('./eval-ci');
const fragment = require('./eval-fragment-selection');
const framework = require('./eval-framework-scaffold');
const nfr = require('./eval-nfr');
const teach = require('./eval-teach-me-testing');
const design = require('./eval-test-design');
const review = require('./eval-test-review');
const trace = require('./eval-trace');
const transcript = require('./eval-transcript');
const evalAll = require('./eval-all');

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

function suiteRecord(runners, cases = [{ id: 'case-a', promptDigest: DIGEST }]) {
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
    cases,
    runners,
    durationMs: 1,
  });
}

function harnessProjectionFixtures() {
  return [
    {
      id: 'atdd',
      projection: () =>
        atdd.atddDiagnosticProjection({
          redForIntendedReasonCount: 1,
          mappedTestCount: 1,
          perCriterion: [{ present: true }],
          vacuousPass: [],
          stillSkipped: [],
          nonAssertion: [],
          loadErrors: [],
          unmapped: [],
          productionMutations: [],
        }),
    },
    {
      id: 'automate',
      projection: () =>
        automate.automateDiagnosticProjection({
          expectedDetectsRegression: true,
          detectedRegression: true,
          tests: [{ classification: 'matches-declared' }],
        }),
    },
    {
      id: 'bmad-tea-routing',
      projection: () =>
        routing.routingDiagnosticProjection({
          expectedAction: 'route',
          actionCorrect: true,
          menuCorrect: true,
          workflowCorrect: true,
          routeCorrect: true,
          tokensFound: 1,
          tokens: 1,
          scopeFound: 1,
          scopeTokens: 1,
          scopeWithinBound: true,
          scopeOk: true,
          candidatesNamed: 0,
          candidates: 0,
          clarifyOk: false,
          missingStated: false,
          declineOk: false,
          confidentRouteOnUnservable: false,
          confidentRouteOnAmbiguous: false,
          unroutedClearIntent: false,
        }),
    },
    {
      id: 'ci',
      projection: () =>
        ci.ciDiagnosticProjection(
          {
            parse: { ok: true },
            lint: { findings: [] },
            elements: [{ kind: 'trigger', present: true }],
            unrequested: [],
            ruleViolations: [],
          },
          0,
        ),
    },
    { id: 'fragment-selection', projection: () => fragment.fragmentDiagnosticProjection(fragment.scoreCase({ expect: {} }, [])) },
    {
      id: 'framework-scaffold',
      projection: () => framework.frameworkDiagnosticProjection({ installAndSmokePassRate: 1, seededDefectDetectionRate: 1 }),
    },
    {
      id: 'nfr',
      projection: () =>
        nfr.nfrDiagnosticProjection(
          {
            domainResults: [{ ok: true, undecidable: true, threshold: { ok: true } }],
            unknownThreshold: { ok: true },
            overall: { ok: true },
            coverage: { present: 1, total: 1 },
            groundedCriteria: { hits: 1, total: 1 },
            duplicateDomainSections: [],
            gateDisagreements: [],
            unsupportedPass: [],
            fabricated: [],
            cleanFalsePositives: 0,
          },
          0,
        ),
    },
    {
      id: 'teach-me-testing',
      projection: () =>
        teach.teachDiagnosticProjection({
          placement: { holds: true },
          correction: { holds: true },
          reTeaching: { holds: true },
          continuation: { holds: true },
          mastery: { unearned: [] },
        }),
    },
    {
      id: 'test-design',
      projection: () =>
        design.testDesignDiagnosticProjection(
          {
            grounding: { matched: 1, declared: 1, topSeverityMissed: 0 },
            shape: { rows: 1, inScale: 1, arithmeticOk: 1, arithmeticTotal: 1, validCategories: 1, bandOk: 1, banded: 1, wellFormedIds: 1 },
            ungrounded: [],
            links: { resolved: 1, total: 1 },
            orderingChecks: [{ resolvable: true, ok: true }],
            flattenedPriorities: false,
            coverageChecks: [{ ok: true }],
            unscoredRiskTables: [],
            ceiling: { excess: 0 },
          },
          0,
        ),
    },
    {
      id: 'test-review',
      projection: () =>
        review.reviewDiagnosticProjection({
          planted: ['C1:file:1'],
          hits: ['C1:file:1'],
          criticalPlanted: 1,
          criticalHits: 1,
          reportedFindings: ['C1:file:1'],
          falsePositives: 0,
          outOfScope: 0,
          unattributed: 0,
          unlocated: 0,
          score: 100,
        }),
    },
    {
      id: 'trace',
      projection: () =>
        trace.traceDiagnosticProjection(
          {
            statusResults: [{ ok: true, discriminating: true }],
            gate: { ok: true },
            gateCriteria: [{ ok: true }],
            arithmetic: [{ ok: true }],
            oracleResolution: [{ ok: true }],
            runMetadata: [{ ok: true }],
            citations: { resolved: 1, total: 1 },
            rejectedEvidence: [{ ok: true }],
            waivers: { scored: true, checks: [{ ok: true }] },
            live: [{ ok: true }],
            cleanFalsePositives: 0,
            invented: [],
            duplicates: [],
          },
          0,
        ),
    },
    { id: 'transcript', projection: () => transcript.transcriptDiagnosticProjection({ holds: true }) },
  ];
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
  const qualityDiagnostics = classifyDiagnosticQuality([first, second], ['accuracy', '1 unstable case'], (entry) => ({
    reasons: entry.metricContributions.accuracy === 0 ? ['accuracy', 'unstable case'] : ['unstable case'],
    rootCause: entry.metricContributions.accuracy === 0 ? 'tea-workflow-defect' : 'model-instability',
  }));
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
    quality.runners[0].diagnostics.every((entry) => entry.failureClass === 'quality' && entry.reason),
    'case-level classification marks only diagnostics selected by the scorer projection',
  );
  check(quality.runners[0].diagnostics[0].rootCause === 'model-instability', 'an instability-only finding names model instability');
  check(quality.runners[0].diagnostics[1].rootCause === 'tea-workflow-defect', 'a deterministic metric miss names the workflow defect');

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

  const incompleteGrid = suiteRecord(
    [runner([first, { ...second, repetition: 2 }])],
    [
      { id: 'case-a', promptDigest: DIGEST },
      { id: 'case-b', promptDigest: DIGEST },
    ],
  );
  check(!validateEvalResult(incompleteGrid).success, 'the current schema rejects a count-correct grid that omits a declared case');

  const undeclaredCaseRecord = structuredClone(quality);
  undeclaredCaseRecord.suite.cases[0].id = 'case-outside-manifest';
  check(!validateEvalResult(undeclaredCaseRecord).success, 'the current schema rejects case metadata outside its declared case ids');

  const secrets = [
    'Authorization: Bearer ghp_exampleSecret',
    'sk-live-abcdef123456',
    'https://example.test/?token=mysecretvalue',
    '{"password":"open-sesame","safe":"visible"}',
    'credential=arbitrary-sensitive-value',
  ];
  for (const secret of secrets) {
    const redacted = redactSecrets(secret);
    check(redacted.includes('[redacted]'), `secret sanitizer redacts ${secret.split(/[ :=]/)[0]}`);
    check(
      !/exampleSecret|live-abcdef|mysecretvalue|open-sesame|arbitrary-sensitive-value/.test(redacted),
      'secret sanitizer removes the complete value',
    );
  }
  const sanitizedDiagnostic = diagnosticRecord({
    caseId: 'case-a',
    repetition: 1,
    signature: secrets.join(' '),
    reason: secrets.join(' '),
    evidence: [{ kind: 'summary', value: secrets.join(' ') }],
  });
  check(
    !/exampleSecret|live-abcdef|mysecretvalue|open-sesame|arbitrary-sensitive-value/.test(JSON.stringify(sanitizedDiagnostic)),
    'signature, reason, and evidence share the complete-value sanitizer',
  );

  for (const rootCause of ROOT_CAUSES) {
    const classified = diagnosticRecord({
      caseId: 'case-a',
      repetition: 1,
      signature: rootCause,
      failureClass: 'quality',
      rootCause,
      reason: rootCause,
    });
    check(classified.rootCause === rootCause, `diagnostics represent the ${rootCause} triage category`);
  }

  for (const fixture of harnessProjectionFixtures()) {
    const metrics = numericContributions(fixture.projection());
    check(Object.keys(metrics).length > 0, `${fixture.id} exposes a non-empty diagnostic metric projection`);
    check(
      Object.values(metrics).every((value) => Number.isFinite(value)),
      `${fixture.id} projects only finite numeric contributions`,
    );
    check(
      Object.keys(metrics).some((key) => key.endsWith('.threshold') || key.startsWith('max') || key.endsWith('Ceiling')),
      `${fixture.id} projects the threshold or ceiling that interprets its contribution`,
    );
    const success = diagnosticRecord({ caseId: fixture.id, repetition: 1, signature: 'stable', metricContributions: metrics });
    check(diagnosticSchema.safeParse(success).success, `${fixture.id} builds a valid success diagnostic`);
    const [qualityFinding] = classifyDiagnosticQuality([success], ['fixture miss'], () => ({
      reasons: ['fixture miss'],
      rootCause: 'tea-workflow-defect',
    }));
    check(
      diagnosticSchema.safeParse(qualityFinding).success && qualityFinding.failureClass === 'quality',
      `${fixture.id} builds a valid case-level quality diagnostic`,
    );
    const environmentFinding = diagnosticRecord({
      caseId: fixture.id,
      repetition: 1,
      failureClass: 'environment-timeout',
      rootCause: 'harness-defect',
      reason: 'fixture timeout',
    });
    check(
      diagnosticSchema.safeParse(environmentFinding).success && environmentFinding.completionState === 'failed',
      `${fixture.id} builds a valid environment diagnostic`,
    );
    const unstablePair = classifyDiagnosticQuality(
      [success, diagnosticRecord({ caseId: fixture.id, repetition: 2, signature: 'changed', metricContributions: metrics })],
      ['unstable case'],
      () => ({ reasons: ['unstable case'], rootCause: 'model-instability' }),
    );
    check(
      unstablePair.every((entry) => entry.failureClass === 'quality' && entry.rootCause === 'model-instability'),
      `${fixture.id} preserves both signatures in an instability finding`,
    );
  }

  const reviewSignatureFixture = {
    caseId: 'test/fixtures/test-review/seeded/orders.spec.js',
    hits: ['C1:seeded/orders.spec.js:12'],
    misses: ['H1:seeded/orders.spec.js:28'],
    reportedFindings: ['C1:seeded/orders.spec.js:12'],
    falsePositives: 0,
    outOfScope: 0,
    unattributed: 0,
    unlocated: 0,
    recommendation: 'changes-requested',
  };
  const movedReviewFinding = {
    ...reviewSignatureFixture,
    hits: ['C2:seeded/orders.spec.js:44'],
    misses: ['H2:seeded/orders.spec.js:61'],
    reportedFindings: ['C2:seeded/orders.spec.js:44'],
  };
  check(
    review.reviewSignature(reviewSignatureFixture) !== review.reviewSignature(movedReviewFinding),
    'test-review signatures distinguish equal-count findings with different identities and locations',
  );

  const embeddedArtifact = artifactEvidence('staged/test-artifacts/report.md', '# Report\nsecret-free evidence');
  check(embeddedArtifact[0].value === 'staged/test-artifacts/report.md', 'artifact evidence records the actual staged path');
  check(/^sha256:[\da-f]{64} /.test(embeddedArtifact[1].value), 'artifact evidence embeds a digest beside its bounded excerpt');

  const childCrash = await evalAll.placeholderRecord(
    {
      id: 'child-crash',
      evalType: 'behavioral',
      skill: 'bmad-testarch-atdd',
      contracts: [],
      ciTier: 'deterministic',
      runnerCapabilities: ['read-only'],
      fixtures: [],
      thresholds: {},
      repetitions: 1,
    },
    { preflightOnly: false },
    0,
    1,
    'child-crash',
  );
  check(validateEvalResult(childCrash).success, 'eval-all writes a schema-valid placeholder when a child produces no JSON');
  check(
    childCrash.suiteDiagnostics[0]?.failureClass === 'environment-missing-artifact' && childCrash.suiteDiagnostics[0]?.reason,
    'eval-all records the child failure class and reason in a suite-attempt diagnostic',
  );

  const mismatchedSeverity = structuredClone(environmentResult);
  mismatchedSeverity.runners[0].failureClass = 'quality';
  mismatchedSeverity.failureClass = 'quality';
  mismatchedSeverity.exitCode = 1;
  check(!validateEvalResult(mismatchedSeverity).success, 'a quality runner containing only an environment failure is rejected');

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
    delete suite.suiteDiagnostics;
    for (const resultRunner of suite.runners) delete resultRunner.diagnostics;
  }
  check(validateEvalRun(legacyPair).success, 'a synthetic 1.3.0 run validates through the legacy read path');
  const comparison = await compareEvalRuns(legacyPair, currentRun);
  check(comparison.status === 'compared', `cross-version comparison returned ${comparison.status}`);

  const baselineWithExplicitStability = structuredClone(legacy);
  const fragmentSelection = baselineWithExplicitStability.suites.find((suite) => suite.suite.id === 'fragment-selection');
  fragmentSelection.suite.thresholds.maxUnstableCases = 0;
  const baselineComparison = await compareEvalRuns(legacy, baselineWithExplicitStability);
  check(
    baselineComparison.status === 'compared',
    `the actual protected baseline normalizes fragment-selection's implicit zero stability ceiling (${baselineComparison.status})`,
  );

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

  const processFailures = [
    [automate.playwrightProcessFailure({ error: { code: 'ETIMEDOUT', message: 'timed out' } }), 'environment-timeout'],
    [automate.playwrightProcessFailure({ error: { code: 'ENOENT', message: 'missing executable' } }), 'environment-transport'],
    [automate.playwrightProcessFailure({ signal: 'SIGKILL' }), 'environment-timeout'],
    [automate.playwrightProcessFailure({ status: 0 }, 'empty output'), 'environment-missing-artifact'],
  ];
  for (const [failure, expectedClass] of processFailures) {
    check(failure.failureClass === expectedClass, `automate preserves ${expectedClass} at the Playwright process boundary`);
  }
  for (const expectedClass of ['environment-parser', 'environment-harness']) {
    const scored = automate.scoreCase(
      { id: expectedClass, detectsRegression: true, tests: [] },
      { loadError: expectedClass, loadFailure: { failureClass: expectedClass, reason: expectedClass }, tests: [] },
      { loadError: null, loadFailure: null, tests: [] },
    );
    check(scored.loadFailure.failureClass === expectedClass, `automate preserves ${expectedClass} through case scoring`);
  }

  const reviewOutput = path.join(os.tmpdir(), `eval-review-diagnostics-${process.pid}.json`);
  try {
    const reviewRun = spawnSync(
      process.execPath,
      [
        path.join(PROJECT_ROOT, 'test', 'eval-test-review.js'),
        '--agent',
        'custom',
        '--agent-cmd',
        path.join(PROJECT_ROOT, 'test', 'fixtures', 'test-review-cli', 'stub-agent.js'),
        '--env-pass',
        'STUB_MODE',
        '--runs',
        '1',
        '--json',
        reviewOutput,
      ],
      { cwd: PROJECT_ROOT, encoding: 'utf8', env: { ...process.env, STUB_MODE: 'findings' }, timeout: 60_000 },
    );
    check(reviewRun.status === 1, `deterministic test-review quality fixture exited ${reviewRun.status}: ${reviewRun.stderr}`);
    if (fs.existsSync(reviewOutput)) {
      const emitted = JSON.parse(fs.readFileSync(reviewOutput, 'utf8'));
      check(validateEvalResult(emitted).success, 'deterministic test-review output validates with a complete case grid');
      const emittedRunner = emitted.runners[0];
      check(
        emittedRunner.diagnostics.length === emitted.suite.caseIds.length,
        'test-review emits one diagnostic for every reviewed file in its effective repetition',
      );
      check(
        emittedRunner.diagnostics.every((entry) => emitted.suite.caseIds.includes(entry.caseId)),
        'test-review diagnostics use declared file case ids',
      );
      check(
        emittedRunner.diagnostics.some((entry) => entry.failureClass === 'quality') &&
          emittedRunner.diagnostics.some((entry) => entry.failureClass === 'none'),
        'test-review classifies contributing files while preserving a clean file',
      );
      check(
        emittedRunner.diagnostics.every((entry) => Object.hasOwn(entry.metricContributions, 'recall.numerator')),
        'test-review records the per-file numerators that drive its aggregate recall',
      );
    }
  } finally {
    fs.rmSync(reviewOutput, { force: true });
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
