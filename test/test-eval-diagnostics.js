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
  redactArgs,
  redactSecrets,
  artifactEvidence,
  suiteResultRecord,
  runSummaryRecord,
  writeSuiteResult,
} = require('./lib/eval-record');
const { compareEvalRuns } = require('./lib/compare-eval-runs');
const {
  diagnosticSchema,
  validateEvalResult,
  validateEvalRun,
  SCHEMA_VERSION,
  PREVIOUS_SCHEMA_VERSION,
  LEGACY_SCHEMA_VERSION,
  ROOT_CAUSES,
  worstFailureClass,
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
const PREVIOUS_SUITE_RESULT = path.join(__dirname, 'fixtures', 'eval-result', 'v1.4.0-suite-result.json');
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

function suiteRecord(runners, cases = [{ id: 'case-a', promptDigest: DIGEST }], requestedRepetitions = null, thresholds = null) {
  const effectiveThresholds = thresholds ?? { accuracy: 1 };
  const declaredRepetitions =
    requestedRepetitions ??
    (runners.length > 0 && cases.length > 0 ? Math.max(...runners.map((entry) => entry.repetitions.expected / cases.length)) : 2);
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
      thresholds: effectiveThresholds,
      repetitions: declaredRepetitions,
    },
    repository: { commit: 'abc123', dirty: false },
    fixtureDigest: DIGEST,
    promptDigest: DIGEST,
    cases,
    runners,
    declaredRepetitions,
    durationMs: 1,
  });
}

function harnessRunnerWriter(id, diagnostics) {
  const options = { agentCmd: process.execPath, agentArgs: [], envPass: [], model: null };
  const versions = { custom: process.version };
  const diagnosticFailures = [...new Set(diagnostics.flatMap((entry) => entry.mappedFailures ?? []))];
  const payload = {
    expected: diagnostics.length,
    completed: diagnostics.filter((entry) => entry.completionState === 'completed').length,
    measurements: { accuracy: diagnostics.some((entry) => entry.failureClass === 'quality') ? 0 : 1 },
    durationMs: 1,
    failures: diagnosticFailures,
    diagnostics,
    diagnosticClassifier: () => null,
  };
  switch (id) {
    case 'atdd': {
      return atdd.runnerRecord('custom', options, versions, payload);
    }
    case 'automate': {
      return automate.automateRunnerRecord({ scored: payload.measurements, diagnostics, failures: diagnosticFailures, durationMs: 1 });
    }
    case 'bmad-tea-routing': {
      return routing.runnerRecord('custom', options, versions, payload);
    }
    case 'ci': {
      return ci.runnerRecord('custom', options, versions, [], payload);
    }
    case 'fragment-selection': {
      return fragment.runnerRecord('custom', options, versions, payload);
    }
    case 'framework-scaffold': {
      return framework.runnerRecord(options, {
        ...payload,
        failureClass: worstFailureClass(diagnostics.map((entry) => entry.failureClass)),
        tools: [],
      });
    }
    case 'nfr': {
      return nfr.runnerRecord('custom', options, versions, payload);
    }
    case 'teach-me-testing': {
      return teach.runnerRecord('custom', options, versions, payload);
    }
    case 'test-design': {
      return design.runnerRecord('custom', options, versions, payload);
    }
    case 'test-review': {
      return review.runnerRecord('custom', options, versions, payload);
    }
    case 'trace': {
      return trace.runnerRecord('custom', options, versions, payload);
    }
    case 'transcript': {
      return transcript.runnerRecord(process.version, payload);
    }
    default: {
      throw new Error(`no deterministic writer fixture for ${id}`);
    }
  }
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
    mappedFailures: ['one repetition timed out'],
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
    'Authorization: Basic dXNlcjpwYXNzd29yZA==',
    'Proxy-Authorization: Bearer proxy-bearer-secret',
    'Proxy-Authorization: Basic proxy-basic-secret',
    'sk-live-abcdef123456',
    'https://example.test/?token=mysecretvalue',
    '{"password":"open-sesame","safe":"visible"}',
    'credential=arbitrary-sensitive-value',
  ];
  for (const secret of secrets) {
    const redacted = redactSecrets(secret);
    check(redacted.includes('[redacted]'), `secret sanitizer redacts ${secret.split(/[ :=]/)[0]}`);
    check(
      !/exampleSecret|dXNlcjpwYXNzd29yZA|proxy-bearer-secret|proxy-basic-secret|live-abcdef|mysecretvalue|open-sesame|arbitrary-sensitive-value/.test(
        redacted,
      ),
      'secret sanitizer removes the complete value',
    );
    check(redactSecrets(redacted) === redacted, 'secret sanitizer is idempotent after complete-value redaction');
  }
  check(
    redactSecrets('Authorization: Bearer top-secret') === 'Authorization: [redacted]',
    'Authorization redaction leaves one exact marker',
  );
  check(
    redactSecrets('Proxy-Authorization=Basic cHJveHk6c2VjcmV0') === 'Proxy-Authorization=[redacted]',
    'Proxy-Authorization redaction leaves one exact marker',
  );
  const sanitizedDiagnostic = diagnosticRecord({
    caseId: 'case-a',
    repetition: 1,
    signature: secrets.join(' '),
    reason: secrets.join(' '),
    evidence: [{ kind: 'summary', value: secrets.join(' ') }],
  });
  check(
    !/exampleSecret|dXNlcjpwYXNzd29yZA|proxy-bearer-secret|proxy-basic-secret|live-abcdef|mysecretvalue|open-sesame|arbitrary-sensitive-value/.test(
      JSON.stringify(sanitizedDiagnostic),
    ),
    'signature, reason, and evidence share the complete-value sanitizer',
  );
  const persistedSecretPath = path.join(os.tmpdir(), `eval-secret-diagnostics-${process.pid}.json`);
  try {
    const persistedSecretRecord = suiteRecord([runner([first])], undefined, 1);
    persistedSecretRecord.runners[0].parameters.agentArgs = redactArgs([
      '--header',
      'Authorization: Bearer persisted-bearer-secret',
      '--header=Proxy-Authorization: Basic persisted-basic-secret',
    ]);
    await writeSuiteResult(persistedSecretPath, persistedSecretRecord);
    const persistedBytes = fs.readFileSync(persistedSecretPath, 'utf8');
    check(
      !persistedBytes.includes('persisted-bearer-secret') && !persistedBytes.includes('persisted-basic-secret'),
      'serialized runner parameters remove complete Authorization and Proxy-Authorization credentials',
    );
  } finally {
    fs.rmSync(persistedSecretPath, { force: true });
  }

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
    const success = diagnosticRecord({
      caseId: fixture.id,
      repetition: 1,
      signature: 'stable',
      metricContributions: metrics,
      evidence: [{ kind: 'output-signature', value: 'stable' }],
    });
    check(diagnosticSchema.safeParse(success).success, `${fixture.id} builds a valid success diagnostic`);
    check(
      validateEvalResult(suiteRecord([harnessRunnerWriter(fixture.id, [success])], [{ id: fixture.id, promptDigest: DIGEST }])).success,
      `${fixture.id} writes a schema-valid deterministic success result`,
    );
    const [qualityFinding] = classifyDiagnosticQuality([success], ['fixture miss'], () => ({
      reasons: ['fixture miss'],
      rootCause: 'tea-workflow-defect',
    }));
    check(
      diagnosticSchema.safeParse(qualityFinding).success && qualityFinding.failureClass === 'quality',
      `${fixture.id} builds a valid case-level quality diagnostic`,
    );
    check(
      validateEvalResult(suiteRecord([harnessRunnerWriter(fixture.id, [qualityFinding])], [{ id: fixture.id, promptDigest: DIGEST }]))
        .success,
      `${fixture.id} writes a schema-valid deterministic quality result`,
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
    check(
      validateEvalResult(suiteRecord([harnessRunnerWriter(fixture.id, [environmentFinding])], [{ id: fixture.id, promptDigest: DIGEST }]))
        .success,
      `${fixture.id} writes a schema-valid deterministic environment result`,
    );
    const unstablePair = classifyDiagnosticQuality(
      [
        success,
        diagnosticRecord({
          caseId: fixture.id,
          repetition: 2,
          signature: 'changed',
          metricContributions: metrics,
          evidence: [{ kind: 'output-signature', value: 'changed' }],
        }),
      ],
      ['unstable case'],
      () => ({ reasons: ['unstable case'], rootCause: 'model-instability' }),
    );
    check(
      unstablePair.every((entry) => entry.failureClass === 'quality' && entry.rootCause === 'model-instability'),
      `${fixture.id} preserves both signatures in an instability finding`,
    );
    check(
      validateEvalResult(suiteRecord([harnessRunnerWriter(fixture.id, unstablePair)], [{ id: fixture.id, promptDigest: DIGEST }])).success,
      `${fixture.id} writes a schema-valid deterministic instability result`,
    );
  }

  for (const [phase, measurements] of [
    ['npm-install', { installAndSmokePassRate: 0, seededDefectDetectionRate: null }],
    ['smoke-test', { installAndSmokePassRate: 0, seededDefectDetectionRate: null }],
    ['defect-detection', { installAndSmokePassRate: 1, seededDefectDetectionRate: 0 }],
  ]) {
    const outcome = { ok: false, phase, failureClass: 'quality', reason: `${phase} quality fixture` };
    const diagnostic = framework.frameworkOutcomeDiagnostic(outcome, measurements);
    const frameworkRunner = framework.runnerRecord(
      { agentArgs: [], envPass: [] },
      {
        durationMs: 1,
        failureClass: 'quality',
        failures: [`${phase}: ${outcome.reason}`],
        measurements,
        completed: 1,
        tools: [],
        diagnostics: [diagnostic],
      },
    );
    const outputPath = path.join(os.tmpdir(), `eval-framework-${phase}-${process.pid}.json`);
    try {
      await writeSuiteResult(outputPath, suiteRecord([frameworkRunner], [{ id: framework.CASE_ID, promptDigest: null }], 1));
      const emitted = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      check(
        validateEvalResult(emitted).success && emitted.runners[0].diagnostics[0].triage[0]?.rootCause === 'tea-workflow-defect',
        `framework ${phase} quality outcome writes a schema-valid triaged artifact`,
      );
    } finally {
      fs.rmSync(outputPath, { force: true });
    }
  }

  const reviewSignatureFixture = {
    caseId: 'test/fixtures/test-review/seeded/orders.spec.js',
    planted: ['C1:seeded/orders.spec.js:12', 'H1:seeded/orders.spec.js:28'],
    hits: ['C1:seeded/orders.spec.js:12'],
    misses: ['H1:seeded/orders.spec.js:28'],
    reportedFindings: ['C1:seeded/orders.spec.js:12'],
    falsePositives: 0,
    outOfScope: 0,
    unattributed: 0,
    unlocated: 0,
    recommendation: 'changes-requested',
    score: 90,
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
  check(
    review.reviewSignature(reviewSignatureFixture) ===
      review.reviewSignature({ ...reviewSignatureFixture, recommendation: 'approve', score: 80 }),
    'test-review file signatures contain only file-attributable evidence',
  );
  const bundleSignatureFixture = { ...reviewSignatureFixture, caseId: review.BUNDLE_CASE_ID };
  check(
    review.reviewSignature(bundleSignatureFixture) !== review.reviewSignature({ ...bundleSignatureFixture, score: 80 }),
    'test-review bundle signatures expose score-only variance',
  );
  const reviewGroundTruth = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, 'test', 'fixtures', 'test-review-eval', 'ground-truth.json'), 'utf8'),
  );
  const outOfScopeVerdict = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, 'test', 'replay', 'test-review', 'out-of-scope-finding', 'verdict.json'), 'utf8'),
  );
  const scoredOutOfScope = review.scoreVerdict(outOfScopeVerdict, reviewGroundTruth);
  const movedOutOfScopeVerdict = structuredClone(outOfScopeVerdict);
  const outOfScopeBundle = scoredOutOfScope.caseScores.find((entry) => entry.caseId === review.BUNDLE_CASE_ID);
  const movedOutOfScopeFinding = movedOutOfScopeVerdict.findings.find((finding) =>
    outOfScopeBundle.outOfScopeFindings.includes(review.canonicalFindingIdentity(finding)),
  );
  movedOutOfScopeFinding.line = Number(movedOutOfScopeFinding.line ?? 0) + 7;
  const movedOutOfScopeScore = review.scoreVerdict(movedOutOfScopeVerdict, reviewGroundTruth);
  const movedOutOfScopeBundle = movedOutOfScopeScore.caseScores.find((entry) => entry.caseId === review.BUNDLE_CASE_ID);
  check(
    review.reviewSignature(outOfScopeBundle) !== review.reviewSignature(movedOutOfScopeBundle),
    'test-review production signatures distinguish out-of-scope finding identities and locations',
  );
  check(
    scoredOutOfScope.caseScores
      .filter((entry) => entry.caseId !== review.BUNDLE_CASE_ID)
      .every((entry) => entry.outOfScope === 0 && entry.unlocated === 0),
    'test-review keeps global findings out of file-attributable cases',
  );
  const unlocatedVerdict = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, 'test', 'replay', 'test-review', 'row-without-location', 'verdict.json'), 'utf8'),
  );
  const scoredUnlocated = review.scoreVerdict(unlocatedVerdict, reviewGroundTruth);
  const changedUnlocatedVerdict = structuredClone(unlocatedVerdict);
  const changedUnlocatedFinding = changedUnlocatedVerdict.findings.find(
    (finding) => typeof finding.file !== 'string' || finding.file.length === 0,
  );
  changedUnlocatedFinding.title = `${changedUnlocatedFinding.title} moved`;
  const changedUnlocatedScore = review.scoreVerdict(changedUnlocatedVerdict, reviewGroundTruth);
  const unlocatedBundle = scoredUnlocated.caseScores.find((entry) => entry.caseId === review.BUNDLE_CASE_ID);
  const changedUnlocatedBundle = changedUnlocatedScore.caseScores.find((entry) => entry.caseId === review.BUNDLE_CASE_ID);
  check(
    review.reviewSignature(unlocatedBundle) !== review.reviewSignature(changedUnlocatedBundle),
    'test-review production signatures distinguish unlocated finding identities',
  );

  const reviewVarianceDiagnostics = [90, 80].map((score, index) => {
    const caseScore = {
      ...reviewSignatureFixture,
      caseId: review.BUNDLE_CASE_ID,
      score,
      criticalPlanted: 0,
      criticalHits: 0,
      reportedCount: 1,
    };
    const signature = review.reviewSignature(caseScore);
    return diagnosticRecord({
      caseId: caseScore.caseId,
      repetition: index + 1,
      signature,
      metricContributions: numericContributions(review.reviewDiagnosticProjection(caseScore)),
      evidence: [{ kind: 'output-signature', value: signature }],
    });
  });
  const classifiedReviewVariance = classifyDiagnosticQuality(
    reviewVarianceDiagnostics,
    ['score variance'],
    review.reviewDiagnosticClassifier(reviewVarianceDiagnostics),
  );
  check(
    classifiedReviewVariance.every((entry) => entry.rootCause === 'model-instability'),
    'test-review maps score-only repeated-run variance to model instability',
  );

  const outOfScopeScore = {
    ...reviewSignatureFixture,
    caseId: review.BUNDLE_CASE_ID,
    criticalPlanted: 0,
    criticalHits: 0,
    reportedFindings: [],
    reportedCount: 1,
    falsePositives: 1,
    outOfScope: 1,
  };
  const outOfScopeMetrics = numericContributions(review.reviewDiagnosticProjection(outOfScopeScore));
  const outOfScopeDiagnostic = diagnosticRecord({
    caseId: outOfScopeScore.caseId,
    repetition: 1,
    signature: review.reviewSignature(outOfScopeScore),
    metricContributions: outOfScopeMetrics,
    evidence: [{ kind: 'output-signature', value: 'out-of-scope-only' }],
  });
  const [classifiedOutOfScope] = classifyDiagnosticQuality(
    [outOfScopeDiagnostic],
    ['non-false-positive rate'],
    review.reviewDiagnosticClassifier([outOfScopeDiagnostic]),
  );
  check(
    outOfScopeMetrics['nonFalsePositiveRate.denominator'] === 1 && classifiedOutOfScope.failureClass === 'quality',
    'test-review assigns out-of-scope findings to the same case numerator and denominator used by the aggregate',
  );

  const mixedRootCauseDiagnostic = diagnosticRecord({
    caseId: 'automate-mixed-root-cause',
    repetition: 1,
    signature: 'mixed',
    metricContributions: { undetectedRegression: 1, unexpectedOutcomes: 1 },
    evidence: [{ kind: 'summary', value: 'deterministic classifier fixture' }],
  });
  const [mixedRootCause] = classifyDiagnosticQuality(
    [mixedRootCauseDiagnostic],
    ['undetected regression', 'unexpected outcome'],
    automate.automateDiagnosticClassifier,
  );
  check(
    mixedRootCause.triage.some((entry) => entry.rootCause === 'harness-defect') &&
      mixedRootCause.triage.some((entry) => entry.rootCause === 'oracle-defect'),
    'production classifiers preserve distinct reason and root-cause pairs for mixed findings',
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
  const childExitOne = await evalAll.placeholderRecord(
    {
      id: 'child-exit-one',
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
    1,
    1,
    'child-exit-one',
  );
  check(
    validateEvalResult(childExitOne).success && childExitOne.failureClass === 'environment-missing-artifact',
    'eval-all treats a missing child result at exit 1 as an environment failure',
  );

  const childFixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-all-child-record-'));
  const childSuite = {
    id: 'child-record',
    evalType: 'behavioral',
    skill: 'bmad-testarch-atdd',
    contracts: [],
    ciTier: 'deterministic',
    runnerCapabilities: ['read-only'],
    fixtures: [],
    thresholds: {},
    repetitions: 1,
  };
  try {
    const unreadablePath = path.join(childFixtureDir, 'unreadable.json');
    fs.writeFileSync(unreadablePath, '{broken json', 'utf8');
    const unreadable = await evalAll.readChildRecord(
      { jsonPath: unreadablePath, label: 'unreadable-child', suite: childSuite },
      { preflightOnly: false },
      2,
      1,
    );
    check(
      validateEvalResult(unreadable).success && unreadable.suiteDiagnostics[0].failureClass === 'environment-parser',
      'eval-all converts unreadable child JSON into a parser diagnostic',
    );
    check(
      unreadable.suiteDiagnostics[0].evidence[0].value.includes('exit=2'),
      'unreadable child diagnostics preserve child status evidence',
    );

    const invalidPath = path.join(childFixtureDir, 'invalid.json');
    fs.writeFileSync(invalidPath, '{}\n', 'utf8');
    const invalid = await evalAll.readChildRecord(
      { jsonPath: invalidPath, label: 'invalid-child', suite: childSuite },
      { preflightOnly: false },
      1,
      1,
    );
    check(
      validateEvalResult(invalid).success && invalid.suiteDiagnostics[0].failureClass === 'environment-harness',
      'eval-all validates parseable child JSON immediately and records invalid output as a harness failure',
    );

    const wrongSuitePath = path.join(childFixtureDir, 'wrong-suite.json');
    fs.writeFileSync(wrongSuitePath, `${JSON.stringify(childCrash)}\n`, 'utf8');
    const wrongSuite = await evalAll.readChildRecord(
      { jsonPath: wrongSuitePath, label: 'wrong-suite-child', suite: childSuite },
      { preflightOnly: false },
      2,
      1,
    );
    check(
      wrongSuite.suite.id === childSuite.id &&
        wrongSuite.suiteDiagnostics[0].failureClass === 'environment-harness' &&
        wrongSuite.suiteDiagnostics[0].reason.includes('another invocation'),
      'eval-all rejects a schema-valid child record written for another suite',
    );

    const matchingRecord = await evalAll.placeholderRecord(childSuite, { preflightOnly: false }, 2, 1, 'matching-child');
    const staleConfiguration = structuredClone(matchingRecord);
    staleConfiguration.suite.declaredRepetitions = 2;
    const stalePath = path.join(childFixtureDir, 'stale-configuration.json');
    fs.writeFileSync(stalePath, `${JSON.stringify(staleConfiguration)}\n`, 'utf8');
    const stale = await evalAll.readChildRecord(
      { jsonPath: stalePath, label: 'stale-child', suite: childSuite },
      { preflightOnly: false },
      2,
      1,
    );
    check(
      stale.suiteDiagnostics[0].failureClass === 'environment-harness' && stale.suiteDiagnostics[0].reason.includes('declared repetitions'),
      'eval-all rejects a child record whose invocation-bound repetition configuration is stale',
    );

    const matchingPath = path.join(childFixtureDir, 'matching.json');
    fs.writeFileSync(matchingPath, `${JSON.stringify(matchingRecord)}\n`, 'utf8');
    const matching = await evalAll.readChildRecord(
      { jsonPath: matchingPath, label: 'matching-child', suite: childSuite },
      { preflightOnly: false },
      2,
      1,
    );
    check(
      matching.suiteDiagnostics[0].failureClass === 'environment-missing-artifact' &&
        matching.suiteDiagnostics[0].reason === matchingRecord.suiteDiagnostics[0].reason &&
        JSON.stringify(matching.suiteDiagnostics[0].evidence) === JSON.stringify(matchingRecord.suiteDiagnostics[0].evidence),
      'eval-all preserves a valid zero-runner child record and its original premeasurement evidence',
    );

    const previousChild = structuredClone(matchingRecord);
    previousChild.schemaVersion = PREVIOUS_SCHEMA_VERSION;
    for (const diagnostic of previousChild.suiteDiagnostics) delete diagnostic.rootCause;
    const previousPath = path.join(childFixtureDir, 'previous-schema.json');
    fs.writeFileSync(previousPath, `${JSON.stringify(previousChild)}\n`, 'utf8');
    const rejectedPrevious = await evalAll.readChildRecord(
      { jsonPath: previousPath, label: 'previous-schema-child', suite: childSuite },
      { preflightOnly: false },
      2,
      1,
    );
    check(
      rejectedPrevious.schemaVersion === SCHEMA_VERSION &&
        rejectedPrevious.suiteDiagnostics[0].reason.includes('expected current writer schema'),
      'eval-all reads frozen 1.4.0 evidence but refuses to fold it into a current run summary',
    );

    const atddInvocation = { suite: childSuite, script: path.join(PROJECT_ROOT, 'test', 'eval-atdd.js') };
    const expectedPromptIdentity = await evalAll.promptIdentityForInvocation(atddInvocation, []);
    const boundCaseIds = expectedPromptIdentity.cases.map((entry) => entry.id);
    const caseBoundRecord = structuredClone(matchingRecord);
    caseBoundRecord.suite.caseIds = boundCaseIds;
    caseBoundRecord.suite.cases = expectedPromptIdentity.cases;
    caseBoundRecord.suite.promptDigest = expectedPromptIdentity.promptDigest;
    caseBoundRecord.runners = [runner([first], { measurements: { accuracy: 1 } })];
    const exactCaseProblems = await evalAll.childBindingProblems(caseBoundRecord, atddInvocation, {
      preflightOnly: false,
      agents: [],
      workflows: [],
    });
    check(exactCaseProblems.length === 0, `eval-all accepts invocation-bound case and prompt digests: ${exactCaseProblems.join('; ')}`);
    const reviewInvocation = { suite: childSuite, script: path.join(PROJECT_ROOT, 'test', 'eval-test-review.js') };
    const reviewCaseIds = await evalAll.caseIdsForInvocation(reviewInvocation, []);
    const preflightBoundRecord = structuredClone(caseBoundRecord);
    preflightBoundRecord.mode = 'preflight-only';
    preflightBoundRecord.suite.caseIds = reviewCaseIds;
    preflightBoundRecord.suite.promptDigest = null;
    preflightBoundRecord.suite.cases = reviewCaseIds.map((id) => ({ id, promptDigest: null }));
    const preflightProblems = await evalAll.childBindingProblems(preflightBoundRecord, reviewInvocation, {
      preflightOnly: true,
      agents: [],
      workflows: [],
    });
    check(
      preflightProblems.length === 0,
      `eval-all accepts null prompt digests from a bound preflight record: ${preflightProblems.join('; ')}`,
    );
    const wrongCaseRecord = structuredClone(caseBoundRecord);
    wrongCaseRecord.suite.caseIds[0] = 'invented-case';
    wrongCaseRecord.suite.cases[0].id = 'invented-case';
    const wrongCaseProblems = await evalAll.childBindingProblems(wrongCaseRecord, atddInvocation, {
      preflightOnly: false,
      agents: [],
      workflows: [],
    });
    check(wrongCaseProblems.includes('case ids do not match invocation'), 'eval-all rejects a schema-valid invented case grid');
    const wrongSuitePrompt = structuredClone(caseBoundRecord);
    wrongSuitePrompt.suite.promptDigest = DIGEST;
    const wrongSuitePromptProblems = await evalAll.childBindingProblems(wrongSuitePrompt, atddInvocation, {
      preflightOnly: false,
      agents: [],
      workflows: [],
    });
    check(
      wrongSuitePromptProblems.includes('suite prompt digest does not match invocation'),
      'eval-all rejects a child suite prompt digest from another invocation',
    );
    const wrongCasePrompt = structuredClone(caseBoundRecord);
    wrongCasePrompt.suite.cases[0].promptDigest = DIGEST;
    const wrongCasePromptProblems = await evalAll.childBindingProblems(wrongCasePrompt, atddInvocation, {
      preflightOnly: false,
      agents: [],
      workflows: [],
    });
    check(
      wrongCasePromptProblems.includes('case prompt digests do not match invocation'),
      'eval-all rejects per-case prompt digests from another invocation',
    );

    const wrongRepository = structuredClone(matchingRecord);
    wrongRepository.repository.commit = 'wrong-commit';
    const repositoryProblems = await evalAll.childBindingProblems(
      wrongRepository,
      { suite: childSuite },
      { preflightOnly: false, agents: [] },
    );
    check(
      repositoryProblems.includes('repository does not match invocation'),
      'eval-all binds child evidence to the current repository state',
    );
  } finally {
    fs.rmSync(childFixtureDir, { recursive: true, force: true });
  }

  const corpusFailure = suiteResultRecord({
    generatedAt: '2026-09-17T00:00:00.000Z',
    mode: 'validate-only',
    suite: childSuite,
    repository: { commit: 'abc123', dirty: false },
    fixtureDigest: DIGEST,
    promptDigest: null,
    cases: [],
    runners: [],
    durationMs: 1,
    suiteFailureClasses: [{ failureClass: 'quality', message: 'fixture oracle names an unknown case' }],
  });
  check(
    validateEvalResult(corpusFailure).success && corpusFailure.suiteDiagnostics[0].rootCause === 'corpus-defect',
    'corpus validation failures emit production suite diagnostics classified as corpus defects',
  );
  const preflightFailure = suiteResultRecord({
    generatedAt: '2026-09-17T00:00:00.000Z',
    mode: 'preflight-only',
    suite: childSuite,
    repository: { commit: 'abc123', dirty: false },
    fixtureDigest: DIGEST,
    promptDigest: null,
    cases: [],
    runners: [],
    durationMs: 1,
    suiteFailureClasses: [{ failureClass: 'environment-configuration', message: 'runner is unavailable' }],
  });
  check(
    validateEvalResult(preflightFailure).success && preflightFailure.suiteDiagnostics[0].reason === 'runner is unavailable',
    'preflight failures emit suite diagnostics with their reason',
  );

  const inconsistentSuite = structuredClone(preflightFailure);
  inconsistentSuite.failureClass = 'none';
  inconsistentSuite.exitCode = 0;
  check(!validateEvalResult(inconsistentSuite).success, 'suite severity must be derived from runner and suite diagnostic evidence');

  const mismatchedSeverity = structuredClone(environmentResult);
  mismatchedSeverity.runners[0].failureClass = 'quality';
  mismatchedSeverity.failureClass = 'quality';
  mismatchedSeverity.exitCode = 1;
  check(!validateEvalResult(mismatchedSeverity).success, 'a quality runner containing only an environment failure is rejected');

  const unnamedQualityFailure = structuredClone(quality);
  unnamedQualityFailure.runners[0].failures = [];
  for (const diagnostic of unnamedQualityFailure.runners[0].diagnostics) diagnostic.mappedFailures = [];
  check(!validateEvalResult(unnamedQualityFailure).success, 'a quality runner must name at least one aggregate failure');
  const environmentMappedQuality = structuredClone(environmentResult);
  environmentMappedQuality.runners[0].failureClass = 'quality';
  environmentMappedQuality.runners[0].failures = ['accuracy'];
  environmentMappedQuality.runners[0].diagnostics[1].mappedFailures = ['accuracy'];
  environmentMappedQuality.failureClass = 'quality';
  environmentMappedQuality.exitCode = 1;
  check(!validateEvalResult(environmentMappedQuality).success, 'an environment diagnostic cannot satisfy a quality runner failure mapping');
  const qualityFailureOnEnvironment = structuredClone(environmentResult);
  qualityFailureOnEnvironment.runners[0].failures = ['accuracy'];
  qualityFailureOnEnvironment.runners[0].diagnostics[1].mappedFailures = ['accuracy'];
  check(
    !validateEvalResult(qualityFailureOnEnvironment).success,
    'a measured aggregate failure cannot map only to an environment diagnostic',
  );

  const legacy = JSON.parse(fs.readFileSync(LEGACY_RESULT, 'utf8'));
  check(legacy.schemaVersion === LEGACY_SCHEMA_VERSION, `protected baseline is ${legacy.schemaVersion}, expected ${LEGACY_SCHEMA_VERSION}`);
  check(validateEvalRun(legacy).success, 'the protected 1.3.0 run remains readable');
  check(
    createHash('sha256').update(fs.readFileSync(LEGACY_RESULT)).digest('hex') ===
      '201138d028e6c5612dc5786a1617025c6b9d01cf0de2d34e00f37cff8c8c7631',
    'the protected baseline remains byte-for-byte unchanged',
  );

  const frozenPreviousResult = JSON.parse(fs.readFileSync(PREVIOUS_SUITE_RESULT, 'utf8'));
  check(
    validateEvalResult(frozenPreviousResult).success,
    'the checked-in artifact emitted by the 1.4.0 writer validates through its frozen reader',
  );
  const previousResultWithTriage = structuredClone(frozenPreviousResult);
  for (const resultRunner of previousResultWithTriage.runners) {
    for (const diagnostic of resultRunner.diagnostics) {
      diagnostic.triage = diagnostic.failureClass === 'quality' ? [{ reason: diagnostic.reason, rootCause: diagnostic.rootCause }] : [];
    }
  }
  check(validateEvalResult(previousResultWithTriage).success, 'a later 1.4.0 artifact carrying triage validates through the frozen reader');
  previousResultWithTriage.runners[0].diagnostics[0].triage = [{ reason: 'wrong historical triage', rootCause: 'oracle-defect' }];
  check(
    !validateEvalResult(previousResultWithTriage).success,
    'the frozen reader rejects 1.4.0 triage that contradicts its diagnostic root cause',
  );
  const previousCleanResult = structuredClone(frozenPreviousResult);
  previousCleanResult.runners[0].failureClass = 'none';
  previousCleanResult.runners[0].failures = [];
  previousCleanResult.runners[0].diagnostics[0].failureClass = 'none';
  previousCleanResult.runners[0].diagnostics[0].rootCause = null;
  previousCleanResult.runners[0].diagnostics[0].reason = null;
  previousCleanResult.runners[0].diagnostics[0].triage = [];
  previousCleanResult.failureClass = 'none';
  previousCleanResult.exitCode = 0;
  check(validateEvalResult(previousCleanResult).success, 'a clean later 1.4.0 diagnostic accepts an empty triage');
  previousCleanResult.runners[0].diagnostics[0].triage = [{ reason: 'contradicts clean failure class', rootCause: 'tea-workflow-defect' }];
  check(
    !validateEvalResult(previousCleanResult).success,
    'the frozen reader rejects 1.4.0 triage that contradicts a clean diagnostic failure class',
  );
  const previousResult = structuredClone(quality);
  previousResult.schemaVersion = PREVIOUS_SCHEMA_VERSION;
  for (const resultRunner of previousResult.runners) {
    for (const diagnostic of resultRunner.diagnostics) {
      delete diagnostic.triage;
      delete diagnostic.mappedFailures;
      delete diagnostic.mappedMeasurements;
      diagnostic.metricContributions = {};
      diagnostic.evidence = [];
    }
  }
  check(
    validateEvalResult(previousResult).success,
    'a stored 1.4.0 suite result validates through the frozen reader without inheriting 1.5.0 requirements',
  );

  const currentRun = runSummaryRecord({
    generatedAt: '2026-09-17T00:00:00.000Z',
    repository: { commit: 'abc123', dirty: false },
    suites: [quality],
    unaccountedSkills: [],
    durationMs: 1,
  });
  check(validateEvalRun(currentRun).success, 'a current run summary containing diagnostics validates');
  const previousRun = structuredClone(currentRun);
  previousRun.schemaVersion = PREVIOUS_SCHEMA_VERSION;
  previousRun.suites = [previousResult];
  check(validateEvalRun(previousRun).success, 'a stored 1.4.0 run summary validates through the frozen reader');
  const inconsistentRun = structuredClone(currentRun);
  inconsistentRun.failureClass = 'none';
  inconsistentRun.exitCode = 0;
  check(!validateEvalRun(inconsistentRun).success, 'run-summary severity must be derived from child suite evidence');

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
    [automate.playwrightProcessFailure({ signal: 'SIGSEGV' }), 'environment-harness'],
    [automate.playwrightProcessFailure({ status: 0 }, 'empty output'), 'environment-missing-artifact'],
  ];
  for (const [failure, expectedClass] of processFailures) {
    check(failure.failureClass === expectedClass, `automate preserves ${expectedClass} at the Playwright process boundary`);
  }
  const frameworkProcessFailures = [
    [framework.sandboxedCommandFailure({ error: { code: 'ETIMEDOUT', message: 'deadline' } }, 'npm install'), 'environment-timeout'],
    [framework.sandboxedCommandFailure({ error: { code: 'ENOENT', message: 'missing' } }, 'npm install'), 'environment-transport'],
    [framework.sandboxedCommandFailure({ signal: 'SIGSEGV', status: null }, 'smoke test'), 'environment-harness'],
    [framework.sandboxedCommandFailure({ signal: null, status: 1, stderr: 'assertion failed' }, 'smoke test'), 'quality'],
  ];
  for (const [failure, expectedClass] of frameworkProcessFailures) {
    check(failure.failureClass === expectedClass, `framework preserves ${expectedClass} at the sandboxed process boundary`);
  }
  for (const expectedClass of ['environment-parser', 'environment-harness']) {
    const scored = automate.scoreCase(
      { id: expectedClass, detectsRegression: true, tests: [] },
      { loadError: expectedClass, loadFailure: { failureClass: expectedClass, reason: expectedClass }, tests: [] },
      { loadError: null, loadFailure: null, tests: [] },
    );
    check(scored.loadFailure.failureClass === expectedClass, `automate preserves ${expectedClass} through case scoring`);
  }
  const automateLoadFailure = automate.scoreRun(
    { cases: [{ id: 'load-failure', detectsRegression: true, tests: [] }] },
    new Map([
      [
        'load-failure',
        {
          loadError: 'Playwright did not load',
          loadFailure: { failureClass: 'environment-harness', reason: 'Playwright did not load' },
          tests: [],
        },
      ],
    ]),
    new Map([['load-failure', { loadError: null, loadFailure: null, tests: [] }]]),
  );
  check(
    Object.values(automate.automateMeasurements(automateLoadFailure)).every((value) => value === null),
    'automate records no low quality aggregate when a case is unmeasurable',
  );

  const escapedSecrets = [String.raw`password="alpha\"omega-secret"`, String.raw`token='alpha\'omega-secret'`];
  for (const secret of escapedSecrets) {
    const sanitized = redactSecrets(secret);
    check(sanitized.endsWith('[redacted]'), 'secret sanitizer consumes escaped quotes inside quoted values');
    check(!sanitized.includes('omega-secret'), 'secret sanitizer removes suffixes after escaped quotes');
  }
  const sanitizedArgs = redactArgs([
    'Authorization: Bearer arbitrary-sensitive-value',
    '--header=Authorization: Bearer another-sensitive-value',
    '--label=safe-value',
  ]);
  check(!sanitizedArgs.join(' ').includes('arbitrary-sensitive-value'), 'retained Authorization arguments pass through the sanitizer');
  check(!sanitizedArgs.join(' ').includes('another-sensitive-value'), '--flag=value values pass through the sanitizer');
  check(sanitizedArgs.includes('--label=safe-value'), 'ordinary retained arguments preserve their value');

  const emptyMetrics = diagnosticRecord({
    caseId: 'empty-metrics',
    repetition: 1,
    signature: 'stable',
    evidence: [{ kind: 'summary', value: 'bounded' }],
  });
  check(!diagnosticSchema.safeParse(emptyMetrics).success, 'completed diagnostics require metric contributions');
  const emptyEvidence = diagnosticRecord({
    caseId: 'empty-evidence',
    repetition: 1,
    signature: 'stable',
    metricContributions: { score: 1 },
  });
  check(!diagnosticSchema.safeParse(emptyEvidence).success, 'completed diagnostics require evidence');

  const zeroGrid = suiteRecord([runner([], { repetitions: { expected: 0, completed: 0 }, measurements: {} })], undefined, 1);
  check(!validateEvalResult(zeroGrid).success, 'a live writer cannot declare cases with zero effective repetitions');
  const cleanZeroRunner = suiteRecord([], undefined, 1);
  check(!validateEvalResult(cleanZeroRunner).success, 'a clean live suite with declared cases cannot omit every runner');
  const premeasurementFailure = suiteResultRecord({
    generatedAt: '2026-09-17T00:00:00.000Z',
    mode: 'live',
    suite: {
      id: 'premeasurement-failure',
      evalType: 'behavioral',
      skill: 'bmad-testarch-atdd',
      contracts: [],
      ciTier: 'deterministic',
      runnerCapabilities: ['read-only'],
      thresholds: {},
      repetitions: 1,
    },
    repository: { commit: 'abc123', dirty: false },
    fixtureDigest: DIGEST,
    promptDigest: null,
    cases: [{ id: 'case-a', promptDigest: null }],
    runners: [],
    declaredRepetitions: 1,
    durationMs: 1,
    suiteDiagnostics: [{ failureClass: 'environment-configuration', reason: 'runner unavailable' }],
  });
  check(
    validateEvalResult(premeasurementFailure).success,
    'a live premeasurement failure may omit runners when suite evidence explains it',
  );
  const zeroRequestedPremeasurement = structuredClone(premeasurementFailure);
  zeroRequestedPremeasurement.suite.declaredRepetitions = 0;
  check(
    !validateEvalResult(zeroRequestedPremeasurement).success,
    'a live suite cannot erase its requested repetition count when premeasurement evidence exists',
  );
  check(!validateEvalResult(suiteRecord([], [], 0)).success, 'a clean live suite cannot validate with no cases and no runners');

  const partialRequestedGrid = suiteRecord([runner([first, second])], undefined, 3);
  check(!validateEvalResult(partialRequestedGrid).success, 'observed attempts cannot rewrite a larger requested repetition count');

  const unmappedFailure = suiteRecord([runner([first, second], { failures: ['aggregate miss'], measurements: { accuracy: 0.5 } })]);
  check(!validateEvalResult(unmappedFailure).success, 'runner failure strings require mapped diagnostic failures');
  const unmappedMeasurement = suiteRecord([runner([first, second], { measurements: { accuracy: null } })]);
  check(!validateEvalResult(unmappedMeasurement).success, 'failed measurements require mapped diagnostic failures');
  const cleanFailureMapping = suiteRecord([runner([{ ...first, mappedFailures: ['aggregate miss'] }], { failures: ['aggregate miss'] })]);
  check(!validateEvalResult(cleanFailureMapping).success, 'a clean diagnostic cannot satisfy a failed-threshold mapping');
  const cleanMeasurementMapping = suiteRecord([
    runner([{ ...first, mappedMeasurements: ['accuracy'] }], { measurements: { accuracy: null } }),
  ]);
  check(!validateEvalResult(cleanMeasurementMapping).success, 'a clean diagnostic cannot satisfy a null-measurement mapping');
  const unmatchedQualityOnLostRun = classifyDiagnosticQuality(
    [
      diagnosticRecord({
        caseId: 'case-a',
        repetition: 1,
        failureClass: 'environment-timeout',
        reason: 'runner timed out',
      }),
    ],
    ['accuracy'],
    () => null,
    { measurements: {}, expected: 1, completed: 0 },
  );
  check(
    unmatchedQualityOnLostRun[0].mappedFailures.length === 0,
    'an unmatched quality failure is never attached to environment evidence as a fallback',
  );

  const oneOfTwoMapped = diagnosticRecord({
    caseId: 'case-a',
    repetition: 1,
    signature: 'two-thresholds',
    metricContributions: { accuracy: 0, restraint: 0 },
    failureClass: 'quality',
    rootCause: 'tea-workflow-defect',
    reason: 'accuracy and restraint',
    mappedFailures: ['accuracy'],
    evidence: [{ kind: 'summary', value: 'two threshold fixture' }],
  });
  const partiallyMappedThresholds = suiteRecord([
    runner([oneOfTwoMapped], {
      measurements: { accuracy: 0, restraint: 0 },
      failureClass: 'quality',
      failures: ['accuracy', 'restraint'],
    }),
  ]);
  check(!validateEvalResult(partiallyMappedThresholds).success, 'every failed threshold needs its own diagnostic mapping');
  const fullyMappedThresholds = structuredClone(partiallyMappedThresholds);
  fullyMappedThresholds.runners[0].diagnostics[0].mappedFailures.push('restraint');
  check(validateEvalResult(fullyMappedThresholds).success, 'all failed thresholds validate once each maps to diagnostic evidence');

  const oneOfTwoNullsMapped = diagnosticRecord({
    caseId: 'case-a',
    repetition: 1,
    signature: 'two-nulls',
    metricContributions: { attempted: 1 },
    failureClass: 'quality',
    rootCause: 'harness-defect',
    reason: 'two measurements unmeasurable',
    mappedFailures: ['accuracy (unmeasurable)', 'restraint (unmeasurable)'],
    mappedMeasurements: ['accuracy'],
    evidence: [{ kind: 'summary', value: 'two null measurement fixture' }],
  });
  const partiallyMappedNulls = suiteRecord([
    runner([oneOfTwoNullsMapped], {
      measurements: { accuracy: null, restraint: null },
      failureClass: 'quality',
      failures: ['accuracy (unmeasurable)', 'restraint (unmeasurable)'],
    }),
  ]);
  check(!validateEvalResult(partiallyMappedNulls).success, 'every non-optional null measurement needs its own diagnostic mapping');
  const fullyMappedNulls = structuredClone(partiallyMappedNulls);
  fullyMappedNulls.runners[0].diagnostics[0].mappedMeasurements.push('restraint');
  check(validateEvalResult(fullyMappedNulls).success, 'all null measurements validate once each maps to diagnostic evidence');

  const threeRuns = [1, 2, 3].map((repetition) =>
    diagnosticRecord({
      caseId: 'case-a',
      repetition,
      signature: 'stable',
      metricContributions: { accuracy: 1 },
      evidence: [{ kind: 'output-signature', value: 'stable' }],
    }),
  );
  const expandedRunRecord = suiteRecord([runner(threeRuns)]);
  check(
    expandedRunRecord.suite.declaredRepetitions === 3 && validateEvalResult(expandedRunRecord).success,
    'writers persist a requested three-repetition declaration and cover its full grid',
  );

  for (const varianceName of ['scoreStdev', 'unstableCases']) {
    const varianceThreshold = varianceName === 'scoreStdev' ? { accuracy: 1, maxScoreStdev: 1 } : { accuracy: 1, maxUnstableCases: 0 };
    const repeatedNullVariance = suiteRecord(
      [runner([first, second], { measurements: { accuracy: 1, [varianceName]: null } })],
      undefined,
      null,
      varianceThreshold,
    );
    check(!validateEvalResult(repeatedNullVariance).success, `${varianceName} cannot stay null after two completed repetitions`);
    const singleNullVariance = suiteRecord(
      [runner([first], { measurements: { accuracy: 1, [varianceName]: null } })],
      undefined,
      1,
      varianceThreshold,
    );
    check(validateEvalResult(singleNullVariance).success, `${varianceName} may be null when fewer than two repetitions were requested`);
  }
  const missingVariance = suiteRecord([runner([first, second])], undefined, 2, { accuracy: 1, maxUnstableCases: 0 });
  check(!validateEvalResult(missingVariance).success, 'a repeated suite cannot omit its declared variance measurement');
  const optionalWaiverOracle = suiteRecord([runner([first, second], { measurements: { accuracy: 1, waiverOracleAccuracy: null } })]);
  check(validateEvalResult(optionalWaiverOracle).success, 'waiver oracle variance may remain null when no scored waiver exists');
  const incompleteVarianceFailure = '1 of 2 declared repetitions completed';
  const failedVarianceAttempt = diagnosticRecord({
    caseId: 'case-a',
    repetition: 2,
    failureClass: 'environment-timeout',
    reason: 'second repetition timed out',
    mappedFailures: [incompleteVarianceFailure],
    mappedMeasurements: ['scoreStdev', 'unstableCases'],
  });
  const mappedIncompleteVariance = suiteRecord(
    [
      runner([first, failedVarianceAttempt], {
        repetitions: { expected: 2, completed: 1 },
        measurements: { accuracy: 1, scoreStdev: null, unstableCases: null },
        failureClass: 'environment-timeout',
        failures: [incompleteVarianceFailure],
      }),
    ],
    undefined,
    2,
    { accuracy: 1, maxScoreStdev: 1, maxUnstableCases: 0 },
  );
  check(
    validateEvalResult(mappedIncompleteVariance).success,
    'repeated-run null variance validates when failed-attempt diagnostics map the missing measurements',
  );
  const falselyStableIncomplete = structuredClone(mappedIncompleteVariance);
  falselyStableIncomplete.runners[0].measurements.unstableCases = 0;
  falselyStableIncomplete.runners[0].diagnostics[1].mappedMeasurements = ['scoreStdev'];
  check(!validateEvalResult(falselyStableIncomplete).success, 'an incomplete requested grid cannot report a measured stability value');
  const derivedIncompleteDiagnostics = classifyDiagnosticQuality(
    [
      diagnosticRecord({
        caseId: 'case-a',
        repetition: 1,
        failureClass: 'environment-missing-artifact',
        reason: 'the requested artifact was not written',
      }),
    ],
    ['accuracy (unmeasurable)', '1 case short of 1 repetition'],
    () => null,
    { measurements: { accuracy: null }, expected: 1, completed: 0 },
  );
  check(
    validateEvalResult(
      suiteRecord(
        [
          runner(derivedIncompleteDiagnostics, {
            measurements: { accuracy: null },
            failureClass: 'environment-missing-artifact',
            failures: ['accuracy (unmeasurable)', '1 case short of 1 repetition'],
          }),
        ],
        undefined,
        1,
      ),
    ).success,
    'a lost repetition maps every unmeasurable threshold and null metric to its failed-attempt evidence',
  );

  for (const [script, message] of [
    ['eval-automate.js', 'deterministic automate harness'],
    ['eval-framework-scaffold.js', 'deterministic framework harness'],
  ]) {
    const excessiveRuns = spawnSync(process.execPath, [path.join(PROJECT_ROOT, 'test', script), '--runs', '2'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      timeout: 10_000,
    });
    check(
      excessiveRuns.status === 2 && excessiveRuns.stderr.includes(message),
      `${script} rejects unsupported repetitions before live work starts`,
    );
  }
  for (const malformed of ['1suffix', '1.5', '01', '+1', ' 1', '999999999999999999999999999999999999']) {
    for (const script of ['eval-automate.js', 'eval-framework-scaffold.js']) {
      const parsed = spawnSync(process.execPath, [path.join(PROJECT_ROOT, 'test', script), '--runs', malformed], {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        timeout: 10_000,
      });
      check(
        parsed.status === 2 && parsed.stderr.includes('--runs requires a positive integer'),
        `${script} rejects the full malformed repetition value ${JSON.stringify(malformed)}`,
      );
    }
    let evalAllRejected = false;
    try {
      evalAll.parseArgs(['--agent', 'claude', '--review-runs', malformed]);
    } catch (error) {
      evalAllRejected = error.code === 'EVAL_USAGE' && error.message.includes('requires a positive integer');
    }
    check(evalAllRejected, `eval-all rejects the full malformed repetition value ${JSON.stringify(malformed)}`);
  }

  const emptySelectionSignature = JSON.stringify([]);
  const emptySelection = diagnosticRecord({
    caseId: 'fragment-empty-selection',
    repetition: 1,
    signature: emptySelectionSignature,
    metricContributions: numericContributions(fragment.fragmentDiagnosticProjection(fragment.scoreCase({ expect: {} }, []))),
    evidence: [{ kind: 'output-signature', value: emptySelectionSignature }],
  });
  check(diagnosticSchema.safeParse(emptySelection).success, 'fragment writer records an empty selection with the canonical [] signature');

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

  for (const fixture of [
    {
      id: 'atdd',
      script: 'eval-atdd.js',
      agent: path.join(PROJECT_ROOT, 'test', 'fixtures', 'atdd-runner', 'stub-agent.js'),
      variance: 'unstableCases',
      timeout: 30_000,
    },
    {
      id: 'test-review',
      script: 'eval-test-review.js',
      agent: path.join(PROJECT_ROOT, 'test', 'fixtures', 'test-review-cli', 'stub-agent.js'),
      variance: 'scoreStdev',
      timeout: 90_000,
    },
  ]) {
    const outputPath = path.join(os.tmpdir(), `eval-${fixture.id}-incomplete-${process.pid}.json`);
    try {
      const incompleteRun = spawnSync(
        process.execPath,
        [
          path.join(PROJECT_ROOT, 'test', fixture.script),
          '--agent',
          'custom',
          '--agent-cmd',
          fixture.agent,
          '--env-pass',
          'STUB_MODE',
          '--runs',
          '2',
          '--json',
          outputPath,
        ],
        { cwd: PROJECT_ROOT, encoding: 'utf8', env: { ...process.env, STUB_MODE: 'fail' }, timeout: fixture.timeout },
      );
      check(incompleteRun.status === 2, `${fixture.id} incomplete deterministic writer exits 2`);
      if (fs.existsSync(outputPath)) {
        const emitted = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
        const emittedRunner = emitted.runners[0];
        check(validateEvalResult(emitted).success, `${fixture.id} incomplete writer emits a schema-valid artifact`);
        check(emittedRunner.measurements[fixture.variance] === null, `${fixture.id} leaves incomplete variance unmeasurable`);
        check(
          emittedRunner.diagnostics
            .filter((entry) => entry.completionState === 'failed')
            .every((entry) => entry.mappedMeasurements.includes(fixture.variance)),
          `${fixture.id} maps incomplete variance to every failed repetition`,
        );
      }
    } finally {
      fs.rmSync(outputPath, { force: true });
    }
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
