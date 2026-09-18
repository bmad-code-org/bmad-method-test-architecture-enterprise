/**
 * Deterministic contract for the NFR supplied-evidence ledger and publication
 * audit. The live suite measures model behavior. This guard keeps the workflow
 * instructions that produced the correction present on every commit.
 */

'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.join(__dirname, '..');
const WORKFLOW_ROOT = path.join(PROJECT_ROOT, 'src', 'workflows', 'testarch', 'bmad-testarch-nfr');
const BASELINE = path.join(PROJECT_ROOT, 'test', 'results', 'eval-all', 'latest.json');
const PRE_FIX_DIAGNOSTICS = path.join(PROJECT_ROOT, 'test', 'results', 'live-eval-remediation', 'story-1-5', 'pre-fix-diagnostics.json');
const EVIDENCE_ROOT = path.dirname(PRE_FIX_DIAGNOSTICS);
const FILES = {
  thresholds: path.join(WORKFLOW_ROOT, 'steps-c', 'step-02-define-thresholds.md'),
  gather: path.join(WORKFLOW_ROOT, 'steps-c', 'step-03-gather-evidence.md'),
  orchestrate: path.join(WORKFLOW_ROOT, 'steps-c', 'step-04-evaluate-and-score.md'),
  security: path.join(WORKFLOW_ROOT, 'steps-c', 'step-04a-subagent-security.md'),
  performance: path.join(WORKFLOW_ROOT, 'steps-c', 'step-04b-subagent-performance.md'),
  reliability: path.join(WORKFLOW_ROOT, 'steps-c', 'step-04c-subagent-reliability.md'),
  maintainability: path.join(WORKFLOW_ROOT, 'steps-c', 'step-04d-subagent-maintainability.md'),
  aggregate: path.join(WORKFLOW_ROOT, 'steps-c', 'step-04e-aggregate-nfr.md'),
  publish: path.join(WORKFLOW_ROOT, 'steps-c', 'step-05-generate-report.md'),
  template: path.join(WORKFLOW_ROOT, 'nfr-report-template.md'),
};

function canonicalCitation(candidate, projectDirectory) {
  if (typeof candidate !== 'string' || candidate.includes('\\') || path.isAbsolute(candidate) || /^[A-Za-z]:\//.test(candidate))
    return null;
  let normalized = candidate;
  if (normalized.startsWith('./')) normalized = normalized.slice(2);
  else if (normalized.startsWith(`${projectDirectory}/`)) normalized = normalized.slice(projectDirectory.length + 1);
  if (
    !normalized ||
    normalized.startsWith('./') ||
    normalized.startsWith(`${projectDirectory}/`) ||
    normalized.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    return null;
  }
  return normalized;
}

function normalizeDeclaredFindings(declared, returned) {
  const byId = new Map();
  for (const finding of returned) {
    assert.equal(typeof finding?.criterion_id, 'string', 'worker findings must carry criterion_id');
    assert.ok(!byId.has(finding.criterion_id), `duplicate worker criterion_id must fail: ${finding.criterion_id}`);
    byId.set(finding.criterion_id, finding);
  }
  return declared.map((criterion) => {
    if (byId.has(criterion.id)) {
      const finding = { ...byId.get(criterion.id) };
      delete finding.evidence_gaps;
      delete finding.gaps;
      return { ...finding, criterion_id: criterion.id, category: criterion.label };
    }
    return {
      criterion_id: criterion.id,
      category: criterion.label,
      status: 'CONCERNS',
      evidence: [],
      gaps: [{ criterion_id: criterion.id, message: `${criterion.label}: no supplied implementation evidence` }],
    };
  });
}

function publicationAudit({ declared, returned, ledger, suppliedProjectRoot, projectDirectory }) {
  const declaredById = new Map(declared.map((criterion) => [criterion.id, criterion]));
  assert.equal(declaredById.size, declared.length, 'declared criterion IDs must be unique');
  const thresholdSources = new Set(declared.map((criterion) => criterion.threshold_source).filter(Boolean));
  const evidenceByCriterion = new Map();
  const ledgerByPath = new Map();

  for (const entry of ledger) {
    assert.equal(typeof entry, 'object', 'ledger entries must be objects');
    assert.equal(entry.source_type, 'implementation-evidence', 'ledger source_type must be implementation-evidence');
    assert.equal(canonicalCitation(entry.path, projectDirectory), entry.path, `ledger path must be canonical: ${entry.path}`);
    assert.ok(!ledgerByPath.has(entry.path), `duplicate ledger path must fail: ${entry.path}`);
    assert.ok(!thresholdSources.has(entry.path), `threshold source must not enter implementation evidence: ${entry.path}`);
    const resolved = path.resolve(suppliedProjectRoot, entry.path);
    assert.ok(fs.existsSync(resolved) && fs.lstatSync(resolved).isFile(), `ledger path must be a supplied regular file: ${entry.path}`);
    assert.ok(Array.isArray(entry.observations) && entry.observations.length > 0, `ledger observations must be non-empty: ${entry.path}`);
    const observations = new Set();
    for (const observation of entry.observations) {
      assert.ok(declaredById.has(observation?.criterion_id), `ledger criterion must be declared: ${observation?.criterion_id}`);
      assert.ok(typeof observation?.supports === 'string' && observation.supports.trim(), 'ledger support must be non-empty');
      const observationKey = `${observation.criterion_id}\0${observation.supports}`;
      assert.ok(!observations.has(observationKey), `duplicate ledger observation must fail: ${entry.path}`);
      observations.add(observationKey);
      const evidence = { path: entry.path, supports: observation.supports };
      evidenceByCriterion.set(observation.criterion_id, [...(evidenceByCriterion.get(observation.criterion_id) ?? []), evidence]);
    }
    ledgerByPath.set(entry.path, observations);
  }

  return normalizeDeclaredFindings(declared, returned).map((finding) => {
    const criterion = declaredById.get(finding.criterion_id);
    const bound = (evidenceByCriterion.get(finding.criterion_id) ?? []).sort(
      (left, right) => left.path.localeCompare(right.path) || left.supports.localeCompare(right.supports),
    );
    const rejected = (Array.isArray(finding.evidence) ? finding.evidence : []).filter((item) => {
      const canonicalPath = canonicalCitation(item?.path, projectDirectory);
      return (
        canonicalPath === null ||
        typeof item?.supports !== 'string' ||
        !ledgerByPath.get(canonicalPath)?.has(`${finding.criterion_id}\0${item.supports}`)
      );
    });
    const gapMessage =
      criterion.threshold === 'UNKNOWN'
        ? `${criterion.label}: declared threshold is UNKNOWN`
        : rejected.length > 0
          ? `${criterion.label}: submitted citation rejected by publication audit`
          : bound.length === 0
            ? `${criterion.label}: no supplied implementation evidence`
            : null;
    return {
      ...finding,
      category: criterion.label,
      status: gapMessage === null ? finding.status : 'CONCERNS',
      description:
        bound.length === 0
          ? `${criterion.label}: no supplied implementation evidence.`
          : `${criterion.label}: ${bound.map((item) => item.supports).join('; ')}.`,
      evidence: bound,
      gaps: gapMessage === null ? [] : [{ criterion_id: criterion.id, message: gapMessage }],
      rejected,
    };
  });
}

function main() {
  const sources = Object.fromEntries(Object.entries(FILES).map(([name, file]) => [name, fs.readFileSync(file, 'utf8')]));
  const required = [
    ['thresholds', '`declared_nfr_criteria` map'],
    ['thresholds', '`recorded_only_nfr_criteria` list'],
    ['thresholds', 'The checklist never creates an assessment criterion'],
    ['thresholds', 'never treat it as implementation evidence'],
    ['gather', '`supplied_evidence_ledger` before any domain evaluation'],
    ['gather', 'relative to `supplied_project_root`'],
    ['gather', 'supplied project-directory prefix'],
    ['gather', '"source_type": "implementation-evidence"'],
    ['gather', '"criterion_id": "{STABLE_CRITERION_ID_FROM_DECLARED_SCOPE}"'],
    ['gather', 'exactly one structured gap in declared'],
    ['gather', 'Read the file'],
    ['gather', '`subagentContext.evidence_gaps`'],
    ['orchestrate', 'Every worker receives the complete `supplied_evidence_ledger`'],
    ['aggregate', 'Audit Every Citation Before Aggregation'],
    ['aggregate', 'Normalize Findings to the Declared Scope'],
    ['aggregate', 'requirements or threshold-source document is'],
    ['aggregate', 'canonicalEvidencePath'],
    ['aggregate', 'evidenceByCriterion'],
    ['aggregate', 'Duplicate ledger path'],
    ['aggregate', 'is not a supplied regular file'],
    ['aggregate', 'Threshold source is mislabeled as implementation evidence'],
    ['aggregate', 'normalizedDomainAssessments'],
    ['publish', 'final prepublication pass'],
    ['publish', 'No item recorded in `citation_audit[].rejected` appears in the report'],
    ['publish', 'repeated runs over equivalent evidence yield the same'],
    ['publish', 'Every ledger observation bound to a declared criterion appears'],
    ['publish', '`## Recorded-Only NFR Criteria` table'],
    ['template', '**Supports:** {SUPPORTED_OBSERVATION}'],
  ];
  for (const [source, phrase] of required) {
    assert.ok(sources[source].includes(phrase), `${source} must retain ${JSON.stringify(phrase)}`);
  }

  for (const worker of ['security', 'performance', 'reliability', 'maintainability']) {
    assert.ok(sources[worker].includes('subagentContext.supplied_evidence_ledger'), `${worker} must receive the ledger`);
    assert.ok(sources[worker].includes('"path": "{PROJECT_RELATIVE_PATH_FROM_LEDGER}"'), `${worker} must cite an exact path`);
    assert.ok(sources[worker].includes('"supports": "{OBSERVATION_FROM_LEDGER}"'), `${worker} must state supported evidence`);
    assert.ok(sources[worker].includes('"evidence_gaps"'), `${worker} must emit evidence gaps`);
    assert.ok(sources[worker].includes('declared_nfr_criteria'), `${worker} must use the declared scope`);
    assert.ok(sources[worker].includes('never copy it into `evidence`'), `${worker} must keep threshold sources out of evidence`);
    assert.ok(
      sources[worker].includes('Assign the finding status solely by comparing the supplied implementation'),
      `${worker} must assign status against the declared threshold`,
    );
    assert.ok(
      sources[worker].includes('a moderate-only dependency finding remains'),
      `${worker} must keep an allowed moderate dependency finding at PASS`,
    );
    assert.ok(
      sources[worker].includes('cannot lower the finding or\ndomain status'),
      `${worker} must keep out-of-threshold severity from lowering the domain`,
    );
    assert.ok(sources[worker].includes('select every ledger observation'), `${worker} must select complete criterion-bound evidence`);
    assert.ok(sources[worker].includes('Emit no\nnarrower, broader, or free-form gap'), `${worker} must emit one fixed gap per criterion`);
  }

  const templateEvidence = sources.template.match(/\*\*Evidence:\*\*/g) ?? [];
  const templateSupport = sources.template.match(/\*\*Supports:\*\*/g) ?? [];
  assert.ok(templateEvidence.length > 0, 'report template must contain evidence fields');
  assert.equal(templateSupport.length, templateEvidence.length, 'every report evidence field must carry its supported statement');

  const contaminatingExamples = [
    'src/auth/oauth.ts',
    'coverage/lcov-report/index.html',
    'reports/jscpd/jscpd-report.json',
    'uptime-report-2025-10-14.csv',
    'logs/errors-2025-10.log',
    'ci-burn-in-2025-10-14.log',
    'Coverage at 84%',
    'API endpoints respond in <150ms',
  ];
  const guidance = Object.values(sources).join('\n');
  for (const example of contaminatingExamples) {
    assert.ok(!guidance.includes(example), `guidance must not contain plausible evidence example ${JSON.stringify(example)}`);
  }

  const suppliedProjectRoot = path.join(PROJECT_ROOT, 'test', 'fixtures', 'nfr-eval', 'clean');
  const projectDirectory = 'atlas-notification-relay';
  const declared = [
    { id: 'latency', label: 'Response time', threshold: '300 ms', threshold_source: 'docs/tech-spec.md' },
    { id: 'throughput', label: 'Throughput', threshold: '250 requests per second', threshold_source: 'docs/tech-spec.md' },
    { id: 'retry', label: 'Retry behavior', threshold: 'UNKNOWN', threshold_source: 'docs/tech-spec.md' },
    { id: 'security', label: 'Dependency security', threshold: 'zero critical or high', threshold_source: 'docs/tech-spec.md' },
  ];
  const ledger = [
    {
      path: 'evidence/load-test-2026-09-02.json',
      observations: [
        { criterion_id: 'latency', supports: 'measured result satisfies the declared latency threshold' },
        { criterion_id: 'throughput', supports: 'measured result satisfies the declared throughput threshold' },
      ],
      source_type: 'implementation-evidence',
    },
    {
      path: 'evidence/dependency-scan-2026-09-01.json',
      observations: [{ criterion_id: 'security', supports: 'dependency scan reports no critical or high findings' }],
      source_type: 'implementation-evidence',
    },
  ];
  const audit = (criteria, returned, evidenceLedger = ledger) =>
    publicationAudit({ declared: criteria, returned, ledger: evidenceLedger, suppliedProjectRoot, projectDirectory });
  const latencyLedger = [{ ...ledger[0], observations: [ledger[0].observations[0]] }];
  const supported = audit(
    [declared[0]],
    [
      {
        category: 'Unsupported worker prose',
        criterion_id: 'latency',
        status: 'PASS',
        description: 'worker-authored unsupported description',
        evidence: [{ path: ledger[0].path, supports: ledger[0].observations[0].supports }],
      },
    ],
    latencyLedger,
  )[0];
  assert.equal(supported.status, 'PASS');
  assert.deepEqual(supported.gaps, []);
  assert.equal(supported.description, 'Response time: measured result satisfies the declared latency threshold.');

  const projectPrefixed = audit(
    [declared[0]],
    [
      {
        category: 'Supported claim',
        criterion_id: 'latency',
        status: 'PASS',
        evidence: [
          { path: `${projectDirectory}/${ledger[0].path}`, supports: ledger[0].observations[0].supports },
          { path: `./${ledger[0].path}`, supports: ledger[0].observations[0].supports },
          { path: ledger[0].path, supports: ledger[0].observations[0].supports },
        ],
      },
    ],
    latencyLedger,
  )[0];
  assert.deepEqual(projectPrefixed.evidence, [{ path: ledger[0].path, supports: ledger[0].observations[0].supports }]);
  assert.deepEqual(projectPrefixed, supported, 'the two equivalent path spellings and duplicate evidence must normalize identically');

  const reorderedEquivalent = audit(
    [declared[0]],
    [
      {
        category: 'Supported claim',
        criterion_id: 'latency',
        status: 'PASS',
        evidence: [
          { path: `./${ledger[0].path}`, supports: ledger[0].observations[0].supports },
          { path: `${projectDirectory}/${ledger[0].path}`, supports: ledger[0].observations[0].supports },
        ].toReversed(),
      },
    ],
    latencyLedger,
  )[0];
  assert.deepEqual(
    reorderedEquivalent,
    supported,
    'equivalent ledger, citation spelling, duplication, and order must produce one stable scored shape',
  );

  const missing = audit([declared[2]], [{ criterion_id: 'retry', category: 'Missing evidence', status: 'PASS', evidence: [] }], [])[0];
  assert.equal(missing.status, 'CONCERNS');
  assert.deepEqual(missing.gaps, [{ criterion_id: 'retry', message: 'Retry behavior: declared threshold is UNKNOWN' }]);

  const wrongSuppliedFile = audit(
    [declared[0], declared[3]],
    [
      {
        category: 'Wrong supplied file',
        criterion_id: 'latency',
        status: 'PASS',
        evidence: [{ path: ledger[1].path, supports: ledger[1].observations[0].supports }],
      },
      { criterion_id: 'security', category: 'Security', status: 'PASS', evidence: [] },
    ],
    [latencyLedger[0], ledger[1]],
  )[0];
  assert.equal(wrongSuppliedFile.status, 'CONCERNS');
  assert.deepEqual(wrongSuppliedFile.evidence, [{ path: ledger[0].path, supports: ledger[0].observations[0].supports }]);
  assert.deepEqual(wrongSuppliedFile.gaps, [
    { criterion_id: 'latency', message: 'Response time: submitted citation rejected by publication audit' },
  ]);
  assert.equal(wrongSuppliedFile.rejected.length, 1);

  assert.throws(
    () =>
      audit(
        [declared[0]],
        [],
        [{ path: 'docs/tech-spec.md', source_type: 'implementation-evidence', observations: [ledger[0].observations[0]] }],
      ),
    /threshold source must not enter implementation evidence/,
  );
  assert.throws(() => audit([declared[0]], [], [latencyLedger[0], { ...latencyLedger[0] }]), /duplicate ledger path must fail/);
  assert.throws(
    () => audit([declared[0]], [], [{ ...latencyLedger[0], observations: [{ ...ledger[0].observations[0], supports: '' }] }]),
    /ledger support must be non-empty/,
  );
  assert.throws(() => audit([declared[0]], [], [{ ...latencyLedger[0], path: 'evidence' }]), /ledger path must be a supplied regular file/);
  assert.throws(
    () => audit([declared[0]], [], [{ ...latencyLedger[0], path: 'evidence/missing.json' }]),
    /ledger path must be a supplied regular file/,
  );
  assert.throws(
    () => audit([declared[0]], [{ criterion_id: 'latency' }, { criterion_id: 'latency' }], latencyLedger),
    /duplicate worker criterion_id must fail/,
  );

  const scoped = normalizeDeclaredFindings(declared.slice(0, 2), [
    { criterion_id: 'optimization', category: 'Optimization', status: 'CONCERNS', evidence: [] },
    { criterion_id: 'throughput', category: 'Request capacity', status: 'PASS', evidence: [] },
    { criterion_id: 'latency', category: 'API latency', status: 'PASS', evidence: [] },
  ]);
  assert.deepEqual(
    scoped.map(({ criterion_id, category, status }) => [criterion_id, category, status]),
    [
      ['latency', 'Response time', 'PASS'],
      ['throughput', 'Throughput', 'PASS'],
    ],
    'undeclared checklist categories must create no finding, gap, or CONCERNS status',
  );

  const divergenceCriteria = declared.slice(0, 3);
  const divergenceLedger = [ledger[0]];
  const stabilize = (returned) => audit(divergenceCriteria, returned, divergenceLedger);
  const sparseWorker = stabilize([
    {
      criterion_id: 'latency',
      category: 'Response time',
      status: 'PASS',
      evidence: [{ path: ledger[0].path, supports: ledger[0].observations[0].supports }],
      evidence_gaps: ['Retry behavior'],
    },
    { criterion_id: 'throughput', category: 'Throughput', status: 'PASS', evidence: [] },
    { criterion_id: 'retry', category: 'Retry behavior', status: 'CONCERNS', evidence: [] },
  ]);
  const expansiveWorker = stabilize([
    {
      criterion_id: 'latency',
      category: 'Response-time threshold',
      status: 'PASS',
      evidence: [],
      evidence_gaps: ['Response-time threshold', 'Resource-usage thresholds'],
    },
    {
      criterion_id: 'throughput',
      category: 'Throughput threshold',
      status: 'PASS',
      evidence: [{ path: `${projectDirectory}/${ledger[0].path}`, supports: ledger[0].observations[1].supports }],
    },
    {
      criterion_id: 'retry',
      category: 'Write retry behavior',
      status: 'CONCERNS',
      evidence: [],
      evidence_gaps: ['Write retry behavior'],
    },
  ]);
  assert.deepEqual(
    expansiveWorker,
    sparseWorker,
    '4-versus-13 style citation coverage and free-form gap labels must normalize to one criterion-complete result',
  );
  assert.deepEqual(sparseWorker[2].gaps, [{ criterion_id: 'retry', message: 'Retry behavior: declared threshold is UNKNOWN' }]);

  const diagnostics = JSON.parse(fs.readFileSync(PRE_FIX_DIAGNOSTICS, 'utf8'));
  const baselineDigest = createHash('sha256').update(fs.readFileSync(BASELINE)).digest('hex');
  assert.equal(baselineDigest, diagnostics.source.aggregateSha256, 'pre-fix evidence must bind the protected baseline byte for byte');
  assert.deepEqual(
    diagnostics.runs.map(({ caseId, repetition }) => [caseId, repetition]),
    [
      ['gapped-harbor-billing-ledger', 1],
      ['gapped-harbor-billing-ledger', 2],
      ['clean-atlas-notification-relay', 1],
      ['clean-atlas-notification-relay', 2],
    ],
    'pre-fix evidence must cover the exact two-bundle, two-repetition grid',
  );
  const fabricated = diagnostics.runs.flatMap((run) =>
    Object.entries(run.fabricated).flatMap(([domain, paths]) => paths.map((citation) => [run.caseId, run.repetition, domain, citation])),
  );
  assert.equal(fabricated.length, 22, 'pre-fix evidence must attribute all 22 fabricated citations');
  assert.ok(
    fabricated.every((entry) => entry.every(Boolean)),
    'every fabricated citation must identify case, repetition, domain, and path',
  );
  assert.equal(
    diagnostics.runs.flatMap((run) => run.wrongSuppliedFile).length,
    1,
    'pre-fix evidence must preserve the wrong supplied-file finding',
  );
  assert.equal(
    new Set(diagnostics.runs.filter((run) => run.unstable).map((run) => run.caseId)).size,
    2,
    'pre-fix evidence must classify both unstable cases',
  );
  assert.ok(
    diagnostics.runs.every((run) => run.rootCause === 'tea-workflow-defect'),
    'every pre-fix quality failure must carry its classified root cause',
  );

  const provenance = JSON.parse(fs.readFileSync(path.join(EVIDENCE_ROOT, 'evidence-provenance.json'), 'utf8'));
  for (const attempt of [
    provenance.preFixAttempt,
    provenance.postFixAttempt,
    provenance.codexLowDiagnostic,
    provenance.codexLowRerunDiagnostic,
    provenance.codexFinalDiagnostic,
    provenance.codexConfirmation,
  ]) {
    const recordPath = path.join(EVIDENCE_ROOT, attempt.record);
    const digest = createHash('sha256').update(fs.readFileSync(recordPath)).digest('hex');
    assert.equal(digest, attempt.sha256, `${attempt.record} must match its provenance digest`);
    const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
    assert.equal(record.failureClass, attempt.outcome, `${attempt.record} must preserve its recorded outcome`);
    assert.equal(record.runners[0].repetitions.completed, attempt.completedRepetitions);
  }

  const confirmation = JSON.parse(fs.readFileSync(path.join(EVIDENCE_ROOT, provenance.codexConfirmation.record), 'utf8'));
  assert.equal(confirmation.exitCode, 0, 'the substituted confirmation must exit successfully');
  assert.equal(confirmation.runners[0].measurements.unstableCases, 0, 'both confirmation bundles must be stable');
  assert.deepEqual(confirmation.runners[0].failures, [], 'the substituted confirmation must meet every threshold');
  assert.equal(
    provenance.runnerAvailability.exactMessage,
    "You've hit your weekly limit · resets Sep 22 at 3pm (America/Chicago)",
    'the exact Claude quota block must remain in provenance',
  );
  assert.equal(
    provenance.substitutionPrecedent.claim,
    'focused remediation evidence with a disclosed runner substitution',
    'the successful substitute must use the repository precedent without claiming runner-level comparability',
  );

  console.log('NFR evidence guidance keeps ledger propagation, publication auditing, gap handling, and placeholder-only examples.');
}

main();
