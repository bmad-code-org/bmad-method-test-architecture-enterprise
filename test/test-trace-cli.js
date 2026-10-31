'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const yaml = require('js-yaml');
const {
  sourceOracleLedger,
  epicTicketSources,
  requirementOracle,
  resolveTraceTarget,
  tracePaths,
  validateTraceOutputs,
  publishTraceOutputs,
} = require('../cli/lib/trace-command');
const { liveAliasMap, liveReference } = require('../cli/lib/trace-live');

const cli = path.join(__dirname, '..', 'cli', 'trace.js');
const agent = path.join(__dirname, 'fixtures', 'trace-cli-agent.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-trace-cli-'));
let checks = 0;

function run(mode, extra = [], project = root) {
  const result = spawnSync(
    process.execPath,
    [
      cli,
      '--project-root',
      project,
      '--target',
      'docs/epic-4-export.md',
      '--agent',
      'custom',
      '--agent-cmd',
      process.execPath,
      '--agent-arg',
      agent,
      '--env-pass',
      'TEA_TRACE_TEST_STUB_MODE',
      '--retries',
      '0',
      ...extra,
    ],
    {
      encoding: 'utf8',
      timeout: 30_000,
      env: { ...process.env, TEA_TRACE_TEST_STUB_MODE: mode },
    },
  );
  assert.equal(result.signal, null, result.stderr);
  return { ...result, payload: JSON.parse(result.stdout) };
}

const V7_EPIC = [
  '---',
  'id: 1',
  'type: epic',
  'title: "Shoppers check out"',
  'parent: initiative-shop',
  '---',
  '',
  '# Shoppers check out',
  '',
  '## Requirements',
  '',
  'R1 (parent R1) (P0): A shopper pays for a cart with a saved card.',
  'R2 (parent R2): A declined card shows its reason and keeps the cart.',
  'R3 (prd FR-7): A receipt reaches the shopper by email.',
  'R4 (parent R3): An order total matches the priced cart.',
  '',
  '## Notes',
  '',
  '- Parked: R9 (parent R5): gift cards wait for the wallet epic.',
  '',
].join('\n');

/** The export fixture's epic: V7_EPIC plus R5, a requirement no story covers. */
const V7_EXPORT_EPIC = V7_EPIC.replace(
  'R4 (parent R3): An order total matches the priced cart.\n',
  'R4 (parent R3): An order total matches the priced cart.\nR5 (parent R4): A refund returns to the saved card.\n',
);
const V7_TARGET = { type: 'epic', id: 'shop--e1', runScope: 'epic', runKey: 'epic-shop--e1', epicKey: 'shop--e1' };
const V7_LEAVES = {
  'story-saved-card.md': [
    '---',
    'id: 1',
    'type: story',
    'title: "Shoppers pay with a saved card"',
    'parent: epic-checkout',
    'covers: [R1, R2, R3, R4]',
    '---',
    '',
    '# Shoppers pay with a saved card',
    '',
    '## Description',
    '',
    'A shopper pays with a stored card, or learns why it was declined.',
    '',
    '## Requirements',
    '',
    '1. **Saved card payment completes the order** (R1, R3, R4) (P0)',
    '   **Given** a shopper with a saved card',
    '   **When** they pay for the cart',
    '   **Then** the order completes',
    '',
    '2. **Declined card shows the decline reason** (R2)',
    '   **Given** a declined saved card',
    '   **When** the shopper pays',
    '   **Then** the decline reason shows',
    '',
  ],
  'story-expired-card.md': [
    '---',
    'id: 2',
    'type: story',
    'title: "Expired cards are refused"',
    'parent: epic-checkout',
    'covers: [R2]',
    '---',
    '',
    '# Expired cards are refused',
    '',
    '## Requirements',
    '',
    '1. **Expired card is refused before charging** (R2, R9)',
    '   **Given** an expired card',
    '   **When** the shopper pays',
    '   **Then** nothing is charged',
    '',
  ],
};
const V7_ENTRIES = [
  '[[entry]]',
  'id = 1',
  'type = "story"',
  'title = "Shoppers pay with a saved card"',
  'verify = "A saved card pays for a cart."',
  'covers = ["R1", "R2", "R3", "R4"]',
  '',
  '[[entry]]',
  'id = 2',
  'type = "story"',
  'title = "Expired cards are refused"',
  'verify = "An expired card is refused."',
  'covers = ["R2"]',
  '',
  '[[entry]]',
  'id = 3',
  'type = "story"',
  'title = "Checkout is fast"',
  'verify = "Checkout answers within two seconds."',
  'covers = []',
  '',
];

/**
 * Native ticket shapes beside the export fixture's stories: a bug leaf and a spike leaf with criteria
 * under `## Acceptance Criteria`, and an unpulled verify-only story whose build plan lists its criteria
 * after the bold `**Acceptance Criteria:**` label in `## Tasks & Acceptance`.
 */
const V7_NATIVE_FILES = {
  'bug-declined-retry.md': [
    '---',
    'id: 4',
    'type: bug',
    'title: "A declined retry empties the cart"',
    'parent: epic-checkout',
    'covers: [R2]',
    '---',
    '',
    '# A declined retry empties the cart',
    '',
    '## Description',
    '',
    'Retrying a declined card empties the cart instead of keeping it.',
    '',
    '## Acceptance Criteria',
    '',
    '1. **Declined retry keeps the cart** (R2)',
    '   **Given** a declined saved card',
    '   **When** the shopper retries',
    '   **Then** the cart is kept',
    '',
  ],
  'spike-wallet.md': [
    '---',
    'id: 5',
    'type: spike',
    'title: "Choose a wallet provider"',
    'parent: epic-checkout',
    'covers: [R4]',
    '---',
    '',
    '# Choose a wallet provider',
    '',
    '## Acceptance Criteria',
    '',
    '1. **Wallet providers are compared on order totals** (R4)',
    '   Verify: the comparison is recorded in docs/wallet.md',
    '',
  ],
  'story-receipt-resend-plan.md': [
    '---',
    'ticket: 6',
    'status: in-progress',
    '---',
    '',
    '# Receipt resend',
    '',
    '## Tasks & Acceptance',
    '',
    '**Execution:**',
    '',
    '- [ ] `src/receipt.js` -- add resend -- shoppers lose receipts',
    '',
    '**Acceptance Criteria:**',
    '',
    '- Given a sent receipt, when the shopper asks again, then the receipt is resent (R3)',
    '- **Resend is rate limited** (P0): Given three resends in a minute, when a fourth is asked, then it is refused',
    '',
    '## Prior builds',
    '',
    '### Acceptance Criteria',
    '',
    '- Given an old build, then nothing',
    '',
  ],
};
const V7_NATIVE_ENTRIES = [
  '[[entry]]',
  'id = 4',
  'type = "bug"',
  'title = "A declined retry empties the cart"',
  'verify = "A declined retry keeps the cart."',
  'covers = ["R2"]',
  '',
  '[[entry]]',
  'id = 5',
  'type = "spike"',
  'title = "Choose a wallet provider"',
  'verify = "A provider is chosen."',
  'covers = ["R4"]',
  '',
  '[[entry]]',
  'id = 6',
  'type = "story"',
  'title = "Receipts can be resent"',
  'verify = "A receipt can be resent."',
  'covers = ["R3"]',
  '',
];

/** Write the export fixture's ticket tree under its own project root and return the epic file. */
function writeV7Tree(projectRoot, epicText = V7_EXPORT_EPIC, native = false) {
  const epicDir = path.join(projectRoot, '_bmad-output', 'initiative-shop', 'tickets', 'epic-checkout');
  fs.mkdirSync(path.join(epicDir, 'tickets'), { recursive: true });
  fs.writeFileSync(path.join(epicDir, '..', 'tickets.toml'), '[[epic]]\nid = 1\nslug = "epic-checkout"\n');
  fs.writeFileSync(path.join(epicDir, 'epic-checkout.md'), epicText);
  fs.writeFileSync(path.join(epicDir, 'tickets', 'tickets.toml'), [...V7_ENTRIES, ...(native ? V7_NATIVE_ENTRIES : [])].join('\n'));
  for (const [name, lines] of Object.entries({ ...V7_LEAVES, ...(native ? V7_NATIVE_FILES : {}) }))
    fs.writeFileSync(path.join(epicDir, 'tickets', name), lines.join('\n'));
  return path.join(epicDir, 'epic-checkout.md');
}

/** The `path:line` of the first line in a fixture ticket file holding `text`. */
function citation(source, name, text) {
  const lines = name === 'tickets.toml' ? [...V7_ENTRIES, ...V7_NATIVE_ENTRIES] : { ...V7_LEAVES, ...V7_NATIVE_FILES }[name];
  const line = lines.findIndex((entry) => entry.includes(text)) + 1;
  assert.ok(line > 0, `${name} holds ${text}`);
  return `${path.join(path.dirname(source), 'tickets', name)}:${line}`;
}

const storyKey = (id) => id.slice(0, id.lastIndexOf('--'));

/**
 * A completed requirement-oracle export as Trace Step 5 would leave it for `shop--e1`, over the ticket
 * tree `writeV7Tree` writes beside `source`. `retally` derives every count, gate field and summary row.
 */
function v7Export(source, epicText = V7_EXPORT_EPIC, native = false) {
  const requirements = sourceOracleLedger(epicText, source, V7_TARGET);
  const nativeCriteria = [
    {
      id: 'shop--e1-s4--AC-1',
      name: 'Declined retry keeps the cart',
      text: '**Declined retry keeps the cart** (R2) **Given** a declined saved card **When** the shopper retries **Then** the cart is kept',
      priority: 'P1',
      priorityBasis: 'inferred',
      source: citation(source, 'bug-declined-retry.md', 'Declined retry keeps the cart'),
      validLinks: ['R2'],
      invalidLinks: [],
      exception: 'none',
    },
    {
      id: 'shop--e1-s5--AC-1',
      name: 'Wallet providers are compared on order totals',
      text: '**Wallet providers are compared on order totals** (R4) Verify: the comparison is recorded in docs/wallet.md',
      priority: 'P2',
      priorityBasis: 'inferred',
      source: citation(source, 'spike-wallet.md', 'Wallet providers are compared'),
      validLinks: ['R4'],
      invalidLinks: [],
      exception: 'none',
    },
    {
      id: 'shop--e1-s6--AC-1',
      name: 'Given a sent receipt, when the shopper asks again, then the receipt is resent',
      text: 'Given a sent receipt, when the shopper asks again, then the receipt is resent (R3)',
      priority: 'P1',
      priorityBasis: 'inferred',
      source: citation(source, 'story-receipt-resend-plan.md', 'Given a sent receipt'),
      validLinks: ['R3'],
      invalidLinks: [],
      exception: 'none',
    },
    {
      id: 'shop--e1-s6--AC-2',
      name: 'Resend is rate limited',
      text: '**Resend is rate limited** (P0): Given three resends in a minute, when a fourth is asked, then it is refused',
      priority: 'P0',
      priorityBasis: 'explicit',
      source: citation(source, 'story-receipt-resend-plan.md', 'Resend is rate limited'),
      validLinks: [],
      invalidLinks: [],
      exception: 'unlinked',
    },
  ];
  const criterionLedger = [
    {
      id: 'shop--e1-s1--AC-1',
      name: 'Saved card payment completes the order',
      text: '**Saved card payment completes the order** (R1, R3, R4) (P0) **Given** a shopper with a saved card **When** they pay for the cart **Then** the order completes',
      priority: 'P0',
      priorityBasis: 'explicit',
      source: citation(source, 'story-saved-card.md', 'Saved card payment completes the order'),
      validLinks: ['R1', 'R3', 'R4'],
      invalidLinks: [],
      exception: 'none',
    },
    {
      id: 'shop--e1-s1--AC-2',
      name: 'Declined card shows the decline reason',
      text: '**Declined card shows the decline reason** (R2) **Given** a declined saved card **When** the shopper pays **Then** the decline reason shows',
      priority: 'P1',
      priorityBasis: 'inferred',
      source: citation(source, 'story-saved-card.md', 'Declined card shows the decline reason'),
      validLinks: ['R2'],
      invalidLinks: [],
      exception: 'none',
    },
    {
      id: 'shop--e1-s2--AC-1',
      name: 'Expired card is refused before charging',
      text: '**Expired card is refused before charging** (R2, R9) **Given** an expired card **When** the shopper pays **Then** nothing is charged',
      priority: 'P1',
      priorityBasis: 'inferred',
      source: citation(source, 'story-expired-card.md', 'Expired card is refused before charging'),
      validLinks: ['R2'],
      invalidLinks: ['R9'],
      exception: 'invalid-link',
    },
    {
      id: 'shop--e1-s3--verify',
      name: 'Checkout answers within two seconds.',
      text: 'Checkout answers within two seconds.',
      priority: 'P0',
      priorityBasis: 'inferred',
      source: citation(source, 'tickets.toml', 'Checkout answers within two seconds.'),
      validLinks: [],
      invalidLinks: [],
      exception: 'unlinked',
    },
    ...(native ? nativeCriteria : []),
  ].map((criterion) => ({
    ...criterion,
    localId: criterion.id.split('--').at(-1),
    story: storyKey(criterion.id),
    declaredLinks: [...criterion.validLinks, ...criterion.invalidLinks],
  }));
  const rank = (priority) => Number(priority.slice(1));
  const oracleLedger = [
    ...requirements.map((row) => {
      const contributors = criterionLedger.filter((criterion) => criterion.validLinks.includes(row.id.split('--').at(-1)));
      const inherited = contributors.map(({ priority }) => priority).toSorted((left, right) => rank(left) - rank(right))[0];
      return {
        ...row,
        kind: 'requirement',
        parent: /^R\d+ \(([^)]*)\)/m.exec(epicText.split('\n')[Number(row.source.split(':').at(-1)) - 1])?.[1] ?? null,
        // R5 has no contributor: its priority is inferred from the requirement text (Step 1 section E).
        priority: row.priority ?? inherited ?? 'P2',
        priorityBasis: row.priority ? 'explicit' : inherited ? 'contributors' : 'inferred',
        contributors: contributors.map(({ id }) => id),
      };
    }),
    ...criterionLedger
      .filter((criterion) => criterion.exception !== 'none')
      .map(({ id, name, priority, priorityBasis, source, exception }) => ({
        id,
        kind: 'exception',
        exception,
        // A gate row names its criterion: the bold name alone, or a verify-only criterion's verify text.
        requirement: name,
        priority,
        priorityBasis,
        source,
      })),
  ];
  const criterionStatus = Object.fromEntries(criterionLedger.map(({ id }) => [id, 'FULL']));
  const status = {
    'shop--e1--R1': 'FULL',
    'shop--e1--R2': 'FULL',
    'shop--e1--R3': 'PARTIAL',
    'shop--e1--R4': 'FULL',
    'shop--e1--R5': 'NONE',
    'shop--e1-s2--AC-1': 'FULL',
    'shop--e1-s3--verify': 'FULL',
    ...(native ? { 'shop--e1-s6--AC-2': 'FULL' } : {}),
  };
  const tests = {
    'shop--e1-s1--AC-1': '1.1-LIVE-001',
    'shop--e1-s1--AC-2': '1.1-E2E-002',
    'shop--e1-s2--AC-1': '1.2-API-001',
    'shop--e1-s3--verify': '1.3-LIVE-001',
    'shop--e1-s4--AC-1': '1.4-API-001',
    'shop--e1-s5--AC-1': '1.5-API-001',
    'shop--e1-s6--AC-1': '1.6-API-001',
    'shop--e1-s6--AC-2': '1.6-API-002',
  };
  const progress = {
    runKey: 'epic-shop--e1',
    runScope: 'epic',
    workflowStatus: 'completed',
    lastStep: 'step-05-gate-decision',
    stepsCompleted: [
      'step-01-load-context',
      'step-02-discover-tests',
      'step-03-map-criteria',
      'step-04-analyze-gaps',
      'step-05-gate-decision',
    ],
    coverageBasis: 'acceptance_criteria',
    oracleResolutionMode: 'formal_requirements',
    oracleGranularity: 'requirements',
    criterionLedger,
    oracleLedger,
  };
  const summary = {
    schema_version: '0.3.0',
    snapshot_at: '2026-10-30T00:00:00.000Z',
    collection_mode: 'contract_static',
    collection_status: 'COLLECTED',
    decision_mode: 'deterministic',
    target: { type: 'epic', id: 'shop--e1' },
    repo: 'trace-v7-fixture',
    source_sha: 'unknown',
    evaluator: 'test',
    confidence: 'high',
    inventory_basis: 'acceptance_criteria',
    oracle: {
      resolution_mode: 'formal_requirements',
      confidence: 'high',
      sources: [source],
      synthetic: false,
      granularity: 'requirements',
    },
    gate_basis: 'priority_thresholds',
    coverage: {
      // Counted from criterionLedger: AC-1 serves R1, R3 and R4 but its one live test counts once.
      by_level: {
        e2e: { tests: 1, criteria_covered: 1 },
        api: { tests: 1, criteria_covered: 1 },
        component: { tests: 0, criteria_covered: 0 },
        unit: { tests: 0, criteria_covered: 0 },
        live: { tests: 2, criteria_covered: 2 },
        other: { tests: 0, criteria_covered: 0 },
      },
    },
    tests: { files: 3, cases: 4, skipped_cases: 0, fixme_cases: 0, pending_cases: 0 },
    risk_summary: { critical_open: 0, high_open: 0, medium_open: 0, low_open: 0 },
    // Live-only rows: R1, R3 and R4 through live-only AC-1, and the live-only verify exception.
    live_evidence: { requirements_live_only: 4 },
    blockers: [],
    recommendations: [],
    rejected_evidence: [],
  };
  const missing = { 'shop--e1--R3': ['the receipt email reaches the shopper'] };
  return retally({ progress, status, criterionStatus, tests, missing, summary });
}

/** Derive the export's counts, Step 5 gate fields and `summary.oracle.rows` from its ledgers and statuses. */
function retally(value) {
  const { progress, status, criterionStatus, missing, summary } = value;
  const rows = progress.oracleLedger;
  const breakdown = Object.fromEntries(
    ['P0', 'P1', 'P2', 'P3'].map((priority) => {
      const bucket = rows.filter((row) => row.priority === priority);
      const covered = bucket.filter((row) => status[row.id] === 'FULL').length;
      return [priority, { total: bucket.length, covered, pct: bucket.length > 0 ? Math.round((covered / bucket.length) * 100) : 100 }];
    }),
  );
  const covered = rows.filter((row) => status[row.id] === 'FULL').length;
  const overall = Math.round((covered / rows.length) * 100);
  summary.coverage.inventory = { total: rows.length, covered, pct: overall };
  summary.coverage.priority_breakdown = breakdown;
  summary.risk_summary.critical_open = breakdown.P0.total - breakdown.P0.covered;
  const { P0, P1 } = breakdown;
  const verdict = P0.pct < 100 || overall < 80 || P1.pct < 80 ? 'FAIL' : P1.pct < 90 ? 'CONCERNS' : 'PASS';
  summary.gate_status = verdict === 'PASS' && summary.live_evidence.requirements_live_only > 0 ? 'CONCERNS' : verdict;
  summary.gate_criteria = {
    p0_coverage_required: '100%',
    p0_coverage_actual: `${P0.pct}%`,
    p0_status: P0.pct === 100 ? 'MET' : 'NOT_MET',
    p1_coverage_target: '90%',
    p1_coverage_minimum: '80%',
    p1_coverage_actual: `${P1.pct}%`,
    p1_status: P1.pct >= 90 ? 'MET' : P1.pct >= 80 ? 'PARTIAL' : 'NOT_MET',
    overall_coverage_minimum: '80%',
    overall_coverage_actual: `${overall}%`,
    overall_status: overall >= 80 ? 'MET' : 'NOT_MET',
  };
  summary.oracle.rows = rows.map((row) =>
    row.kind === 'exception'
      ? {
          id: row.id,
          kind: row.kind,
          priority: row.priority,
          priority_basis: row.priorityBasis,
          coverage: status[row.id],
          exception: row.exception,
        }
      : {
          id: row.id,
          kind: row.kind,
          priority: row.priority,
          priority_basis: row.priorityBasis,
          coverage: status[row.id],
          parent: row.parent,
          missing_behaviors: missing[row.id] ?? [],
          contributors: row.contributors.map((id) => ({ id, story: storyKey(id), coverage: criterionStatus[id] })),
        },
  );
  return value;
}

/**
 * Step 3's `Requirement Aggregation` mapping for an export: one criterion row per criterionLedger record
 * with its status, and one gate row per oracleLedger row aggregated from those statuses by AC5.
 */
function step3Aggregation({ progress, criterionStatus, missing }) {
  const aggregate = (statuses, behaviors) =>
    statuses.every((status) => status === 'NONE')
      ? 'NONE'
      : statuses.every((status) => status === 'FULL') && behaviors.length === 0
        ? 'FULL'
        : 'PARTIAL';
  return {
    criterionMatrix: (progress.criterionLedger ?? []).map(({ id, story, localId }) => ({
      id,
      story,
      localId,
      coverage: criterionStatus[id],
      tests: [],
    })),
    traceabilityMatrix: progress.oracleLedger.map((row) => {
      if (row.kind === 'exception') return { id: row.id, kind: row.kind, exception: row.exception, coverage: criterionStatus[row.id] };
      const contributors = row.contributors.map((id) => ({ id, story: storyKey(id), coverage: criterionStatus[id], tests: [] }));
      const missingBehaviors = missing[row.id] ?? [];
      return {
        id: row.id,
        kind: row.kind,
        contributors,
        missingBehaviors,
        tests: [],
        coverage: aggregate(
          contributors.map((contributor) => contributor.coverage),
          missingBehaviors,
        ),
      };
    }),
  };
}

/**
 * Render the export the way AC9 specifies: gate table, `### <id> (P<n>): <text>` details, contributor
 * tables, and Step 3's `Requirement Aggregation` block, derived from the export unless `aggregation` is set.
 */
function writeV7Export(
  directory,
  { progress, status, criterionStatus, tableStatus = criterionStatus, tests, missing, summary, aggregation },
) {
  const paths = tracePaths(directory, progress.runKey);
  fs.mkdirSync(path.dirname(paths.matrix), { recursive: true });
  const rows = progress.oracleLedger;
  const flat = (text) => text.replaceAll(/\s+/g, ' ');
  const matrix = [
    `---\n${yaml.dump(progress, { lineWidth: -1 })}---`,
    '',
    '# Traceability Matrix - Epic shop--e1',
    '',
    '| Priority | Total | Covered |',
    '| --- | --- | --- |',
    ...['P0', 'P1', 'P2', 'P3'].map(
      (priority) =>
        `| ${priority} | ${summary.coverage.priority_breakdown[priority].total} | ${summary.coverage.priority_breakdown[priority].covered} |`,
    ),
    '',
    '| ID | Requirement | Priority | Coverage |',
    '| --- | --- | --- | --- |',
    ...rows.map((row) => `| ${row.id} | ${flat(row.requirement)} | ${row.priority} | ${status[row.id]} |`),
    '',
    ...rows.flatMap((row) => [
      `### ${row.id} (${row.priority}): ${flat(row.requirement)}`,
      '',
      `- **Coverage:** ${status[row.id]}`,
      ...(row.kind === 'requirement'
        ? [
            `- **Parent:** ${row.parent ?? 'none'}`,
            `- **Missing behaviors:** ${(missing[row.id] ?? []).join('; ') || (row.contributors.length > 0 ? 'none' : 'no story covers it')}`,
            // A requirement with no contributors reads "Contributors: none" and has no table.
            ...(row.contributors.length > 0
              ? [
                  '- **Contributors:**',
                  '',
                  '| Contributor | Story | Status | Tests |',
                  '| --- | --- | --- | --- |',
                  ...row.contributors.map((id) => `| ${id} | ${storyKey(id)} | ${tableStatus[id]} | ${tests[id]} |`),
                ]
              : ['- **Contributors:** none']),
          ]
        : ['- **Exception:** link exception from criterionLedger']),
      '',
    ]),
    '## Requirement Aggregation',
    '',
    '```json',
    JSON.stringify(aggregation ?? step3Aggregation({ progress, criterionStatus, missing }), null, 2),
    '```',
    '',
  ].join('\n');
  fs.writeFileSync(paths.matrix, matrix);
  const links = { trace_report_path: paths.matrix };
  fs.writeFileSync(paths.summary, JSON.stringify({ ...summary, links }));
  const gate = summary.gate_criteria;
  fs.writeFileSync(
    paths.gate,
    JSON.stringify({
      schema_version: '0.1.0',
      evaluated_at: summary.snapshot_at,
      target: summary.target,
      gate_status: summary.gate_status,
      collection_status: summary.collection_status,
      gate_basis: summary.gate_basis,
      rationale: 'Fixture decision',
      critical_open: summary.risk_summary.critical_open,
      p0_status: gate.p0_status,
      p1_status: gate.p1_status,
      overall_status: gate.overall_status,
      links,
    }),
  );
  return paths;
}

/** Validate a v7 export variant: `mutate` edits the fixture before it is written; `rewriteMatrix` edits the written matrix. */
function v7Validator(base, epicText = V7_EXPORT_EPIC, { native = false } = {}) {
  const projectRoot = path.join(base, 'project');
  const source = writeV7Tree(projectRoot, epicText, native);
  const target = { ...V7_TARGET, document: source };
  const oracleLedger = sourceOracleLedger(epicText, source, target);
  let variant = 0;
  return (mutate = () => {}, { rewriteMatrix, ...options } = {}) => {
    const value = v7Export(source, epicText, native);
    mutate(value);
    const paths = writeV7Export(path.join(base, 'runs', String(variant++)), value);
    if (rewriteMatrix) fs.writeFileSync(paths.matrix, rewriteMatrix(fs.readFileSync(paths.matrix, 'utf8')));
    return validateTraceOutputs({
      paths,
      target,
      collectionMode: 'contract_static',
      allowGate: true,
      oracleLedger,
      requireOracleLedger: true,
      tickets: epicTicketSources(projectRoot, target),
      ...options,
    });
  };
}

function check(name, action) {
  action();
  checks++;
  process.stdout.write(`✓ ${name}\n`);
}

try {
  check('source oracle ignores unrelated labels and merges matching table and detail claims', () => {
    const source = [
      '# Epic-4: Export',
      '',
      '| ID | Description |',
      '| --- | --- |',
      '| RISK-1 | Cache expiry |',
      '',
      'Phase-1: Setup',
      'S3: bucket policy',
      'OAuth2: required',
      '',
      '| ID | Requirement | Priority |',
      '| --- | --- | --- |',
      '| AC-1 | Admin may export. | P0 |',
      '',
      '### AC-1 (P0): Admin may export.',
      'FR-2: Member access is denied.',
    ].join('\n');
    const ledger = sourceOracleLedger(source, 'requirements.md');
    assert.deepEqual(
      ledger.map((row) => [row.id, row.priority]),
      [
        ['AC-1', 'P0'],
        ['FR-2', null],
      ],
    );
    assert.throws(() => sourceOracleLedger(`${source}\nAC-1 (P1): Admin may export.`, 'requirements.md'), /conflicting priorities/);
    assert.equal(sourceOracleLedger('AC-1: P1 tenants can export (P0)', 'requirements.md')[0].priority, 'P0');
  });
  fs.mkdirSync(path.join(root, 'docs'));
  fs.mkdirSync(path.join(root, 'tests'));
  fs.mkdirSync(path.join(root, '_bmad', 'custom'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'epic-4-export.md'), '# Epic 4: Export\n\nAC-1: Admin may export.\n');
  fs.writeFileSync(
    path.join(root, '_bmad', 'config.toml'),
    '[core]\nuser_name = "CLI tester"\n[modules.tea]\ntest_artifacts = "artifacts"\n',
  );
  fs.writeFileSync(path.join(root, '_bmad', 'custom', 'bmad-tea-trace.toml'), '[workflow]\npersistent_facts = ["trace policy applies"]\n');

  check('packaged skill, resolved config, scope-specific artifacts, raw evidence', () => {
    const result = run('pass', ['--json', 'result.json']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.payload.gate_status, 'PASS');
    assert.equal(result.payload.run_key, 'epic-4');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'result.json'), 'utf8')), result.payload);
    const prompt = fs.readFileSync(path.join(result.payload.evidence, 'attempt-1', 'prompt.txt'), 'utf8');
    assert.match(prompt, /bmad-tea-trace\/SKILL.md/);
    assert.match(prompt, /CLI tester/);
    assert.match(prompt, /trace policy applies/);
    assert.match(prompt, /artifacts\/live-verification-results.json/);
    assert.match(prompt, /artifacts\/gate-waivers.md/);
    assert.match(fs.readFileSync(path.join(result.payload.evidence, 'attempt-1', 'stdout.txt'), 'utf8'), /trace fixture agent completed/);
    const summary = JSON.parse(fs.readFileSync(result.payload.artifacts.summary, 'utf8'));
    assert.equal(summary.links.trace_report_path, result.payload.artifacts.matrix);
  });
  check('CLI accepts a criterion repeated in a source table and detail heading', () => {
    const file = path.join(root, 'docs', 'epic-4-export.md');
    const original = fs.readFileSync(file);
    try {
      fs.writeFileSync(
        file,
        '# Epic 4: Export\n\n| ID | Requirement | Priority |\n| --- | --- | --- |\n| AC-1 | Admin may export. | P0 |\n\n### AC-1 (P0): Admin may export.\n',
      );
      const result = run('pass');
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.payload.coverage.total, 1);
    } finally {
      fs.writeFileSync(file, original);
    }
  });
  check('matrix accepts a priority in its criterion heading without a table', () => {
    const result = run('matrix-priority-heading');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.payload.coverage.total, 1);
  });
  check('matrix ignores example headings outside the oracle', () => {
    const result = run('matrix-example-heading');
    assert.equal(result.status, 0, result.payload.reason);
    assert.equal(result.payload.coverage.total, 1);
  });
  check('matrix accepts compact and trailing source priorities', () => {
    const file = path.join(root, 'docs', 'epic-4-export.md');
    const original = fs.readFileSync(file);
    try {
      fs.writeFileSync(file, '# Epic 4: Export\n\nAC-1(P0): Admin may export.\n');
      assert.equal(run('matrix-compact-priority-heading').status, 0);
      fs.writeFileSync(file, '# Epic 4: Export\n\nAC-1: P1 tenants can export (P0)\n');
      const result = run('matrix-trailing-priority');
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.payload.coverage.total, 1);
    } finally {
      fs.writeFileSync(file, original);
    }
  });
  check('computed FAIL exits 1 and remains reviewable', () => {
    const result = run('gap');
    assert.equal(result.status, 1);
    assert.equal(result.payload.gate_status, 'FAIL');
    assert.ok(fs.existsSync(result.payload.artifacts.gate));
  });
  check('CONCERNS enforcement is explicit', () => {
    assert.equal(run('concerns').status, 0);
    assert.equal(run('concerns', ['--fail-on', 'concerns']).status, 1);
  });
  check('contract-static collection cannot suppress its gate', () => {
    const result = run('contract-static-waived');
    assert.equal(result.status, 3, result.payload.reason);
    assert.match(result.payload.reason, /contract_static collection/);
  });
  check('fresh live failures cap a passing automated gate and preserve stale evidence semantics', () => {
    assert.equal(run('fresh-failure').status, 3);
    assert.equal(run('fresh-invalid-count').status, 3);
    const concerns = run('fresh-failure-concerns');
    assert.equal(concerns.status, 0, concerns.stderr);
    assert.equal(concerns.payload.gate_status, 'CONCERNS');
    assert.equal(run('fresh-failure-concerns', ['--fail-on', 'concerns']).status, 1);
    assert.equal(run('stale-failure').payload.gate_status, 'PASS');
  });
  check('Step 5 executable rules cap fresh failures without lifting existing FAIL decisions', () => {
    const step = fs.readFileSync(path.join(__dirname, '..', 'skills', 'bmad-tea-trace', 'steps-c', 'step-05-gate-decision.md'), 'utf8');
    const script = step.slice(step.indexOf("let gateDecision = 'NOT_EVALUATED'")).split('\n```')[0];
    for (const [freshness, failed, p0Coverage, expected, freshFailed] of [
      ['fresh', 1, 100, 'CONCERNS'],
      ['fresh', 1, 50, 'FAIL'],
      ['stale', 1, 100, 'PASS'],
      ['not_present', 0, 100, 'PASS'],
      ['mixed', 1, 100, 'CONCERNS', 1],
      ['stale', 1, 100, 'CONCERNS', 1],
      ['fresh', 1, 100, 'PASS', 0],
    ]) {
      const actual = require('node:vm').runInNewContext(`${script}\ngateDecision`, {
        gateEligible: true,
        allowGate: true,
        collectionStatus: 'COLLECTED',
        p0Coverage,
        overallCoverage: 100,
        effectiveP1Coverage: 100,
        hasP1Requirements: false,
        criticalGaps: p0Coverage === 100 ? 0 : 1,
        syntheticOracle: false,
        effectiveOracleConfidence: 'high',
        liveOnlyCoveredRequirements: 0,
        liveEvidence: { freshness, failed, fresh_failed: freshFailed },
      });
      assert.equal(actual, expected);
    }
  });
  check('frozen oracle priorities reject consistent report reprioritization', () => {
    const file = path.join(root, 'docs', 'epic-4-export.md');
    const original = fs.readFileSync(file, 'utf8');
    try {
      for (const source of [
        '### AC-1 (P0): Admin may export.\n',
        '| ID | Requirement | Priority |\n| --- | --- | --- |\n| AC-1 | Admin may export. | P0 |\n',
      ]) {
        fs.writeFileSync(file, `# Epic 4: Export\n\n${source}`);
        const result = run('source-priority-drift');
        assert.equal(result.status, 3, result.stderr);
        assert.match(result.payload.reason, /explicit source priority/);
        assert.equal(fs.readFileSync(file, 'utf8'), `# Epic 4: Export\n\n${source}`);
      }
      fs.writeFileSync(file, original);
      for (const mode of ['missing-oracle-ledger', 'oracle-ledger-drift', 'mutated-source']) {
        const result = run(mode);
        assert.equal(result.status, 3, `${mode}: ${result.stderr}`);
        fs.writeFileSync(file, original);
      }
    } finally {
      fs.writeFileSync(file, original);
    }
  });
  check('non-string artifact configuration preserves inputs and invokes no agent', () => {
    const config = path.join(root, '_bmad', 'config.toml');
    const original = fs.readFileSync(config, 'utf8');
    const before = fs.readFileSync(path.join(root, 'agent-attempts.json'), 'utf8');
    try {
      for (const value of ['42', 'true', '["artifacts"]', '""']) {
        const text = `[modules.tea]\ntest_artifacts = ${value}\n`;
        fs.writeFileSync(config, text);
        const result = run('pass');
        assert.equal(result.status, 2);
        assert.match(result.payload.reason, /test_artifacts.*nonempty string/);
        assert.equal(fs.readFileSync(config, 'utf8'), text);
        assert.equal(fs.readFileSync(path.join(root, 'agent-attempts.json'), 'utf8'), before);
      }
    } finally {
      fs.writeFileSync(config, original);
    }
  });
  check('frozen requirement text and source bindings survive ledger and matrix publication', () => {
    const file = path.join(root, 'docs', 'epic-4-export.md');
    const original = fs.readFileSync(file, 'utf8');
    try {
      fs.writeFileSync(file, '# Epic 4: Export\n\n### AC-1 (P0): **Admin may export.**\n');
      assert.equal(run('pass').status, 0);
      const gate = path.join(root, 'artifacts', 'trace', 'gate-decision-epic-4.json');
      const previousGate = fs.readFileSync(gate);
      for (const mode of ['source-text-drift', 'source-binding-drift', 'matrix-text-drift', 'missing-oracle-ledger']) {
        const result = run(mode);
        assert.equal(result.status, 3, `${mode}: ${result.stderr}`);
        assert.match(result.payload.reason, /frozen requirement|source binding|oracleLedger/);
        assert.equal(fs.readFileSync(file, 'utf8'), '# Epic 4: Export\n\n### AC-1 (P0): **Admin may export.**\n');
        assert.deepEqual(fs.readFileSync(gate), previousGate);
      }
    } finally {
      fs.writeFileSync(file, original);
    }
  });
  check('a matrix heading may drop the trailing sentence period; a changed word still fails', () => {
    const file = path.join(root, 'docs', 'epic-4-export.md');
    const original = fs.readFileSync(file, 'utf8');
    try {
      fs.writeFileSync(file, '# Epic 4: Export\n\nAC-1 (P0): A guest submits email and address and receives an order number.\n');
      const accepted = run('matrix-trailing-period');
      assert.equal(accepted.status, 0, accepted.payload.reason);
      assert.match(fs.readFileSync(accepted.payload.artifacts.matrix, 'utf8'), /### AC-1: A guest .* order number \(P0\)/);
      const drifted = run('matrix-text-drift');
      assert.equal(drifted.status, 3, drifted.stderr);
      assert.match(drifted.payload.reason, /AC-1 changed its frozen requirement text in the matrix/);
    } finally {
      fs.writeFileSync(file, original);
    }
  });
  check('a criterion-oracle summary may omit granularity but never claims requirements', () => {
    const result = run('summary-requirements-granularity');
    assert.equal(result.status, 3, result.stderr);
    assert.match(result.payload.reason, /oracle\.granularity must be criteria/);
  });
  check('consecutive colon criteria and wrapped titles preserve every source row', () => {
    const file = path.join(root, 'docs', 'epic-4-export.md');
    const original = fs.readFileSync(file, 'utf8');
    try {
      const text = '# Epic 4: Export\n\nAC-1 (P0): Admin may\nexport.\nAC-2 (P0): Deny member export.\n';
      fs.writeFileSync(file, text);
      const accepted = run('pass');
      assert.equal(accepted.status, 0, accepted.stderr);
      assert.equal(accepted.payload.coverage.total, 2);
      const ledger = sourceOracleLedger(text, file);
      assert.deepEqual(
        ledger.map((row) => [row.id, row.source]),
        [
          ['AC-1', `${file}:3`],
          ['AC-2', `${file}:5`],
        ],
      );
      const dropped = run('missing-source-criterion');
      assert.equal(dropped.status, 3, dropped.stderr);
      assert.match(dropped.payload.reason, /frozen source criterion identities/);
    } finally {
      fs.writeFileSync(file, original);
    }
  });
  check('supplied native live failures remain authoritative with missing, stale, or mixed summary metadata', () => {
    for (const args of [
      ['init', '-q'],
      ['add', 'docs', '_bmad/config.toml'],
      ['-c', 'user.name=Trace fixture', '-c', 'user.email=trace@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture'],
    ]) {
      const git = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
      assert.equal(git.status, 0, git.stderr);
    }
    const current = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
    const stale = current[0] === 'a' ? 'b'.repeat(40) : 'a'.repeat(40);
    const live = path.join(root, 'live.json');
    const write = (results) => fs.writeFileSync(live, JSON.stringify({ schema_version: '0.1.0', source_sha: current, results }));
    const failure = { id: '1.1-LIVE-001', requirement_id: 'AC-1', status: 'fail' };
    try {
      write([failure]);
      for (const mode of ['manifest-omitted', 'manifest-stale-cap', 'manifest-ignored-cap']) {
        const result = run(mode, ['--live-results', 'live.json']);
        assert.equal(result.status, 3, `${mode}: ${result.stderr}`);
        assert.match(result.payload.reason, /frozen supplied manifest|gate decision/);
      }
      assert.equal(run('manifest-concerns', ['--live-results', 'live.json']).payload.gate_status, 'CONCERNS');
      write([failure, { id: '1.1-LIVE-002', requirement_id: 'AC-1', status: 'pass', source_sha: stale }]);
      const mixed = run('manifest-concerns', ['--live-results', 'live.json']);
      assert.equal(mixed.status, 0, mixed.stderr);
      assert.equal(mixed.payload.gate_status, 'CONCERNS');
      write([{ ...failure, source_sha: stale }]);
      const old = run('manifest-pass', ['--live-results', 'live.json']);
      assert.equal(old.status, 0, old.stderr);
      assert.equal(old.payload.gate_status, 'PASS');
      write([failure]);
      const mutation = run('manifest-input-mutation', ['--live-results', 'live.json']);
      assert.equal(mutation.status, 3, mutation.stderr);
      assert.match(mutation.payload.reason, /changed a supplied input/);
      write([{ id: '1.1-LIVE-003', status: 'fail' }]);
      const ignoredInvalidFailure = run('manifest-invalid-failure-ignored', ['--live-results', 'live.json']);
      assert.equal(ignoredInvalidFailure.status, 0, ignoredInvalidFailure.stderr);
      assert.equal(ignoredInvalidFailure.payload.gate_status, 'PASS');
      write([
        { id: '1.1-LIVE-003', requirement_id: 'AC-1', status: 'pass' },
        { ...failure, id: '1.1-LIVE-003' },
      ]);
      const ignoredDuplicateFailure = run('manifest-invalid-failure-ignored', ['--live-results', 'live.json']);
      assert.equal(ignoredDuplicateFailure.status, 0, ignoredDuplicateFailure.stderr);
      assert.equal(ignoredDuplicateFailure.payload.gate_status, 'PASS');
    } finally {
      fs.unlinkSync(live);
    }
  });
  check('a HEAD change during live verification leaves the previous report intact', () => {
    const current = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
    const live = path.join(root, 'live.json');
    const files = Object.values(tracePaths(path.join(root, 'artifacts'), 'epic-4'));
    const previous = files.map((file) => fs.readFileSync(file));
    fs.writeFileSync(
      live,
      JSON.stringify({
        schema_version: '0.1.0',
        source_sha: current,
        results: [{ id: '1.1-LIVE-001', requirement_id: 'AC-1', status: 'pass' }],
      }),
    );
    try {
      const result = run('manifest-advance-head', ['--live-results', 'live.json']);
      assert.equal(result.status, 3, result.stderr);
      assert.match(result.payload.reason, /source revision changed/);
      const next = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
      assert.notEqual(next, current);
      for (const [index, file] of files.entries()) assert.deepEqual(fs.readFileSync(file), previous[index]);
    } finally {
      fs.unlinkSync(live);
    }
  });
  check('no-gate removes the previous scope gate and omits its signal', () => {
    const result = run('pass', ['--no-gate']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.payload.gate_status, null);
    assert.equal(result.payload.artifacts.gate, null);
    assert.ok(!fs.existsSync(path.join(root, 'artifacts', 'trace', 'gate-decision-epic-4.json')));
  });
  check('inventory-only emits coverage without a computed gate', () => {
    const result = run('pass', ['--collection-mode', 'inventory_only']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.payload.collection_status, 'COLLECTED');
    assert.equal(result.payload.gate_status, null);
  });
  check('runtime-manifest with missing evidence reports inaccessible and publishes no gate', () => {
    const args = ['--test-dir', 'missing-tests', '--collection-mode', 'runtime_manifest'];
    const falseSuccess = run('pass', args);
    assert.equal(falseSuccess.status, 3, falseSuccess.stderr);
    assert.match(falseSuccess.payload.reason, /runtime-manifest collection status/);
    const result = run('runtime-inaccessible', args);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.payload.collection_status, 'INACCESSIBLE');
    assert.equal(result.payload.gate_status, null);
    const file = path.join(root, 'unreadable-live.json');
    fs.writeFileSync(file, '{malformed');
    try {
      const invalid = run('pass', [...args, '--live-results', 'unreadable-live.json']);
      assert.equal(invalid.status, 3, invalid.stderr);
      const inaccessible = run('runtime-inaccessible', [...args, '--live-results', 'unreadable-live.json']);
      assert.equal(inaccessible.status, 0, inaccessible.stderr);
      assert.equal(inaccessible.payload.gate_status, null);
      assert.equal(fs.readFileSync(file, 'utf8'), '{malformed');
    } finally {
      fs.unlinkSync(file);
    }
  });
  check('story, release, hotfix, and system identities match the skill contract', () => {
    const documents = [
      ['1-2-user auth.md', '# Story 1.2: User auth\n', 'story-1-2-user auth', '1.2'],
      ['release.md', '# Release 2.4.0\n', 'release-2-4-0', '2.4.0'],
      ['hotfix.md', '# Hotfix HF-7\n', 'hotfix-hf-7', 'HF-7'],
      ['requirements.md', '```markdown\n# Story 99.1: Example\n```\n\n# Epic 4: Actual scope\n', 'epic-4', '4'],
    ];
    for (const [file, content, key, id] of documents) {
      fs.writeFileSync(path.join(root, 'docs', file), content);
      const result = run('pass', ['--target', `docs/${file}`]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.payload.run_key, key);
      const summary = JSON.parse(fs.readFileSync(result.payload.artifacts.summary, 'utf8'));
      assert.equal(summary.target.id, id);
    }
    const system = run('pass', ['--target', '']);
    assert.equal(system.status, 0, system.stderr);
    assert.equal(system.payload.run_key, 'system');
  });
  check('non-collecting modes preserve their status and omit gate signals', () => {
    for (const [mode, status] of Object.entries({
      waived: 'WAIVED',
      restricted: 'RESTRICTED',
      inaccessible: 'INACCESSIBLE',
      deferred_shared: 'DEFERRED_SHARED',
    })) {
      const result = run('pass', ['--collection-mode', mode]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.payload.collection_status, status);
      assert.equal(result.payload.gate_status, null);
    }
  });
  check('malformed, missing, incomplete, wrong-target, and contradictory artifacts fail', () => {
    const summary = path.join(root, 'artifacts', 'trace', 'e2e-trace-summary-epic-4.json');
    const previous = fs.readFileSync(summary);
    for (const mode of [
      'bad-arithmetic',
      'missing-summary',
      'missing-gate',
      'incomplete',
      'wrong-target',
      'contradictory-gate',
      'bad-confidence',
      'bad-collection',
      'automated-waiver',
      'missing-criteria',
      'contradictory-percent',
      'wrong-priority-total',
      'wrong-priority-covered',
      'wrong-verdict',
      'wrong-threshold',
      'ignored-confidence',
      'ignored-live-only',
      'missing-live-only',
      'ignored-synthetic-basis',
      'contradictory-critical-gaps',
      'matrix-contradiction',
      'matrix-missing-priority',
      'matrix-duplicate',
    ]) {
      const result = run(mode);
      assert.equal(result.status, 3, `${mode}: ${result.stderr}`);
      assert.equal(result.payload.status, 'failed');
      assert.ok(result.payload.evidence);
      assert.deepEqual(fs.readFileSync(summary), previous, mode);
    }
  });
  check('attempt artifacts cannot import stale symlinks or hardlinked evidence', () => {
    const matrix = path.join(root, 'artifacts', 'trace', 'traceability-matrix-epic-4.md');
    const previous = fs.readFileSync(matrix);
    for (const mode of ['attempt-outside-link', 'attempt-stale-link', 'attempt-hardlink']) {
      const result = run(mode);
      assert.equal(result.status, 3, `${mode}: ${result.stderr}`);
      assert.ok(result.payload.evidence);
      assert.deepEqual(fs.readFileSync(matrix), previous);
    }
    fs.unlinkSync(`${root}-old-matrix.md`);
  });
  check('late destination directories preserve current failure evidence without partial publication', () => {
    for (const file of Object.values(tracePaths(path.join(root, 'artifacts'), 'epic-4'))) if (fs.existsSync(file)) fs.unlinkSync(file);
    const json = path.join(root, 'result.json');
    fs.writeFileSync(json, '{"status":"completed","gate_status":"PASS"}');
    const result = run('partial-publication', ['--json', 'result.json']);
    assert.equal(result.status, 2, result.stderr);
    assert.ok(result.payload.evidence);
    assert.ok(!fs.existsSync(json));
    assert.ok(!fs.existsSync(path.join(root, 'artifacts', 'trace', 'traceability-matrix-epic-4.md')));
    fs.rmdirSync(path.join(root, 'artifacts', 'trace', 'e2e-trace-summary-epic-4.json'));
  });
  check('publication failures replace the command JSON with the failed result', () => {
    const json = path.join(root, 'result.json');
    const directory = path.join(root, 'locked-artifacts', 'trace');
    fs.mkdirSync(directory, { recursive: true });
    fs.chmodSync(directory, 0o555);
    try {
      let writable = false;
      try {
        const probe = fs.mkdtempSync(path.join(directory, 'probe-'));
        fs.rmdirSync(probe);
        writable = true;
      } catch {
        writable = false;
      }
      if (writable) return;
      fs.writeFileSync(json, '{"status":"completed","gate_status":"PASS"}');
      const result = run('pass', ['--output-dir', 'locked-artifacts', '--json', 'result.json']);
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.payload.reason, /Trace publication failed/);
      assert.deepEqual(JSON.parse(fs.readFileSync(json, 'utf8')), result.payload);
    } finally {
      fs.chmodSync(directory, 0o755);
    }
  });
  check('publication rolls back a failed second installation and retains recovery copies if rollback fails', () => {
    const directory = path.join(root, 'transaction');
    fs.mkdirSync(directory);
    const destinations = tracePaths(directory, 'epic-4');
    fs.mkdirSync(path.dirname(destinations.matrix));
    const value = { matrix: 'new matrix', summary: { links: {} }, gate: null };
    const old = new Map(Object.values(destinations).map((file) => [file, `original ${path.basename(file)}`]));
    for (const [file, bytes] of old) fs.writeFileSync(file, bytes);
    const io = {
      ...fs,
      renameSync(source, target) {
        if (target === destinations.summary && path.basename(source) === 'next') throw new Error('simulated second installation failure');
        return fs.renameSync(source, target);
      },
    };
    assert.throws(() => publishTraceOutputs(value, destinations, io), /previous reports restored/);
    for (const [file, bytes] of old) assert.equal(fs.readFileSync(file, 'utf8'), bytes);
    assert.ok(!fs.readdirSync(path.dirname(destinations.matrix)).some((name) => name.startsWith('.tea-trace-publish-')));
    const brokenRollback = {
      ...io,
      renameSync(source, target) {
        if (path.basename(source) === 'previous') throw new Error('simulated rollback failure');
        return io.renameSync(source, target);
      },
    };
    assert.throws(() => publishTraceOutputs(value, destinations, brokenRollback), /recovery backups retained.*rollback failures/);
    const retained = fs.readdirSync(path.dirname(destinations.matrix)).filter((name) => name.startsWith('.tea-trace-publish-'));
    assert.ok(retained.some((name) => fs.existsSync(path.join(path.dirname(destinations.matrix), name, 'previous'))));
  });
  check('transport retry uses a fresh directory and preserves the failed attempt', () => {
    fs.unlinkSync(path.join(root, 'agent-attempts.json'));
    const result = run('retry', ['--retries', '1']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.payload.attempts, 2);
    const first = path.join(result.payload.evidence, 'attempt-1', 'trace', 'e2e-trace-summary-epic-4.json');
    assert.deepEqual(JSON.parse(fs.readFileSync(first, 'utf8')), { stale: true });
    assert.equal(JSON.parse(fs.readFileSync(result.payload.artifacts.summary, 'utf8')).gate_status, 'PASS');
  });
  check('failed reruns preserve published reports until a valid replacement is ready', () => {
    assert.equal(run('pass').status, 0);
    const files = Object.values(tracePaths(path.join(root, 'artifacts'), 'epic-4'));
    const previous = files.map((file) => fs.readFileSync(file));
    for (const mode of ['fail-agent', 'bad-arithmetic']) {
      const result = run(mode, ['--json', 'result.json']);
      assert.equal(result.status, 3, result.stderr);
      assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'result.json'), 'utf8')).status, 'failed');
      for (const [index, file] of files.entries()) assert.deepEqual(fs.readFileSync(file), previous[index]);
    }
    const result = run('gap');
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.payload.gate_status, 'FAIL');
    for (const [index, file] of files.entries()) assert.notDeepEqual(fs.readFileSync(file), previous[index]);
  });
  check('invalid config and target fail before an agent call', () => {
    const before = fs.readFileSync(path.join(root, 'agent-attempts.json'), 'utf8');
    for (const args of [
      ['--target', 'missing.md'],
      ['--collection-mode', 'guess'],
      ['--gate-type', 'guess'],
      ['--retries', '-1'],
      ['--output-dir', '../outside'],
    ])
      assert.equal(run('pass', args).status, 2);
    assert.equal(fs.readFileSync(path.join(root, 'agent-attempts.json'), 'utf8'), before);
  });
  check('absolute temporary-project inputs resolve through their canonical ancestors', () => {
    const target = path.join(root, 'docs', 'epic-4-export.md');
    const result = run('pass', ['--target', target]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.payload.run_key, 'epic-4');
  });
  check('artifact descendants and aliased inputs remain intact before agent execution', () => {
    const beforeCalls = fs.readFileSync(path.join(root, 'agent-attempts.json'), 'utf8');
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-trace-external-'));
    const artifactRoot = path.join(root, 'aliased-artifacts');
    fs.mkdirSync(artifactRoot);
    const externalSummary = path.join(outside, 'e2e-trace-summary-epic-4.json');
    fs.writeFileSync(externalSummary, 'keep external evidence');
    fs.symlinkSync(outside, path.join(artifactRoot, 'trace'), process.platform === 'win32' ? 'junction' : 'dir');
    try {
      const result = run('pass', ['--output-dir', 'aliased-artifacts']);
      assert.equal(result.status, 2, result.stderr);
      assert.equal(fs.readFileSync(externalSummary, 'utf8'), 'keep external evidence');
      assert.equal(fs.readFileSync(path.join(root, 'agent-attempts.json'), 'utf8'), beforeCalls);
    } finally {
      fs.rmSync(artifactRoot, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
    const directory = path.join(root, 'input-artifacts', 'trace');
    fs.mkdirSync(directory, { recursive: true });
    for (const [flag, file, contents] of [
      ['--target', 'traceability-matrix-epic-4.md', '# Epic 4: Original requirements\n\nAC-1: Preserve this source.\n'],
      ['--live-results', 'e2e-trace-summary-epic-4.json', '{"original":"live input"}'],
      ['--waiver-register', 'gate-decision-epic-4.json', 'Original waiver input'],
    ]) {
      const relative = path.join('input-artifacts', 'trace', file);
      fs.writeFileSync(path.join(root, relative), contents);
      assert.equal(run('pass', ['--output-dir', 'input-artifacts', flag, relative]).status, 2);
      assert.equal(fs.readFileSync(path.join(root, relative), 'utf8'), contents);
      assert.equal(fs.readFileSync(path.join(root, 'agent-attempts.json'), 'utf8'), beforeCalls);
    }
    const original = path.join(root, 'docs', 'epic-4-export.md');
    const matrix = path.join(directory, 'traceability-matrix-epic-4.md');
    fs.unlinkSync(matrix);
    fs.linkSync(original, matrix);
    const contents = fs.readFileSync(original, 'utf8');
    assert.equal(run('pass', ['--output-dir', 'input-artifacts']).status, 2);
    assert.equal(fs.readFileSync(original, 'utf8'), contents);
  });
  check('diagnostic retention rejects repository-owned paths before invoking a runner', () => {
    const result = spawnSync(process.execPath, [path.join(__dirname, 'eval-trace.js'), '--validate-only', '--artifacts-dir', __dirname], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /outside the evaluation repository/);
  });
  check('result paths preserve inputs and trace artifacts, and create parent folders', () => {
    const target = path.join(root, 'docs', 'epic-4-export.md');
    const original = fs.readFileSync(target, 'utf8');
    assert.equal(run('pass', ['--json', 'docs/epic-4-export.md']).status, 2);
    fs.symlinkSync(target, path.join(root, 'target-alias.json'));
    assert.equal(run('pass', ['--json', 'target-alias.json']).status, 2);
    fs.linkSync(target, path.join(root, 'target-hardlink.json'));
    assert.equal(run('pass', ['--json', 'target-hardlink.json']).status, 2);
    assert.equal(fs.readFileSync(target, 'utf8'), original);
    assert.equal(run('pass', ['--json', 'artifacts/trace/e2e-trace-summary-epic-4.json']).status, 2);
    const result = run('pass', ['--json', 'result/nested/verdict.json']);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'result/nested/verdict.json'), 'utf8')), result.payload);
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-trace-outside-'));
    try {
      fs.symlinkSync(path.join(outside, 'uncreated'), path.join(root, 'dangling-output'));
      assert.equal(run('pass', ['--output-dir', 'dangling-output']).status, 2);
      assert.deepEqual(fs.readdirSync(outside), []);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
  check('diagnostic evaluations retain source, prompt, observation, and streams', () => {
    const evidence = path.join(root, 'evaluation-evidence');
    const result = spawnSync(
      process.execPath,
      [
        path.join(__dirname, 'eval-trace.js'),
        '--agent',
        'custom',
        '--agent-cmd',
        path.join(__dirname, 'fixtures', 'trace-runner', 'stub-agent.js'),
        '--env-pass',
        'STUB_MODE',
        '--runs',
        '1',
        '--set',
        'seeded-tenant-data-export',
        '--artifacts-dir',
        evidence,
      ],
      {
        encoding: 'utf8',
        timeout: 60_000,
        env: { ...process.env, STUB_MODE: 'wrong-key' },
      },
    );
    assert.equal(result.status, 1, result.stderr);
    const retained = fs.readdirSync(evidence);
    assert.equal(retained.length, 1);
    const directory = path.join(evidence, retained[0]);
    for (const file of ['prompt.txt', 'stdout.txt', 'stderr.txt', 'observation.json'])
      assert.ok(fs.existsSync(path.join(directory, file)), file);
    assert.ok(
      fs.existsSync(path.join(directory, 'workspace', 'tenant-data-export', 'docs', 'epics', 'epic-4-tenant-data-export-and-erasure.md')),
    );
    assert.ok(!fs.existsSync(path.join(directory, 'workspace', 'ground-truth.json')));
  });
  check('actual Codex public captures retain exact bytes and pass the current artifact validator', () => {
    const evidence = path.join(__dirname, 'results', 'live-eval-remediation', 'trace-codex-2026-10-09');
    for (const [name, id, expected] of [
      ['seeded-tenant-data-export', '4', 'FAIL'],
      ['clean-api-token-lifecycle', '5', 'PASS'],
    ]) {
      const manifest = JSON.parse(fs.readFileSync(path.join(evidence, `public-${name}-manifest.json`), 'utf8'));
      assert.ok(manifest.files.every((file) => !file.path.endsWith('/stderr.txt') && file.bytes > 0));
      const archive = fs.readFileSync(path.join(evidence, manifest.archive));
      assert.equal(createHash('sha256').update(archive).digest('hex'), manifest.archiveSha256);
      assert.equal(manifest.groundTruthAbsent, true);
      const captured = JSON.parse(gunzipSync(archive).toString('utf8'));
      assert.equal(captured.files.length, manifest.files.length);
      const files = new Map();
      for (const [index, entry] of captured.files.entries()) {
        const bytes = Buffer.from(entry.base64, 'base64');
        const pin = manifest.files[index];
        assert.equal(entry.path, pin.path);
        assert.equal(bytes.length, pin.bytes);
        assert.equal(createHash('sha256').update(bytes).digest('hex'), pin.sha256);
        files.set(entry.path, bytes);
      }
      const result = JSON.parse(files.get('invocation/result.json'));
      assert.equal(result.exitCode, expected === 'FAIL' ? 1 : 0);
      assert.equal(result.fixtureMutated, false);
      const directory = path.join(root, 'capture-validation', name);
      const target = { type: 'epic', id, runKey: `epic-${id}`, runScope: 'epic' };
      const paths = tracePaths(directory, target.runKey);
      fs.mkdirSync(path.dirname(paths.matrix), { recursive: true });
      for (const [kind, destination] of Object.entries(paths)) {
        const original = [...files.entries()].find(
          ([name]) => name.includes('/test-artifacts/trace/') && name.endsWith(path.basename(destination)),
        );
        assert.ok(original, `missing captured ${kind}`);
        if (kind === 'matrix') fs.writeFileSync(destination, original[1]);
        else {
          // Relocate only the published link in this temporary validation copy.
          // The archive and its byte pins retain the original absolute link.
          const value = JSON.parse(original[1]);
          value.links.trace_report_path = paths.matrix;
          fs.writeFileSync(destination, JSON.stringify(value));
        }
      }
      assert.equal(
        validateTraceOutputs({
          paths,
          target,
          collectionMode: 'contract_static',
          allowGate: true,
          oracleLedger: sourceOracleLedger(
            fs.readFileSync(
              path.join(
                __dirname,
                'fixtures',
                'trace-eval',
                id === '4' ? 'seeded' : 'clean',
                'docs',
                'epics',
                id === '4' ? 'epic-4-tenant-data-export-and-erasure.md' : 'epic-5-api-token-lifecycle.md',
              ),
              'utf8',
            ),
            'captured source',
          ),
          requireOracleLedger: true,
          // Original captures predate the typed Step 1 ledger. This offline replay
          // checks their frozen identity/priority contract; the public CLI requires it.
          allowLegacyExplicitOracle: true,
        }).summary.gate_status,
        expected,
      );
    }
  });

  check('repeated diagnostic after archive preserves all four actual measurements and byte pins', () => {
    const directory = path.join(__dirname, 'results', 'live-eval-remediation', 'trace-codex-2026-10-09');
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'after-attempt-2-manifest.json'), 'utf8'));
    assert.ok(manifest.files.every((file) => !file.path.endsWith('/stderr.txt') && file.bytes > 0));
    const archive = fs.readFileSync(path.join(directory, manifest.archive));
    assert.equal(createHash('sha256').update(archive).digest('hex'), manifest.archiveSha256);
    const capture = JSON.parse(gunzipSync(archive));
    assert.equal(capture.sourceCommit, 'f4045e99d8440adfba3789db9a9b438727a5324f');
    assert.equal(capture.files.length, manifest.files.length);
    for (const [index, file] of capture.files.entries()) {
      const bytes = Buffer.from(file.base64, 'base64');
      assert.equal(file.path, manifest.files[index].path);
      assert.equal(bytes.length, manifest.files[index].bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.files[index].sha256);
    }
    const result = capture.files.find((file) => file.path === 'invocation/result.json');
    const bytes = Buffer.from(result.base64, 'base64');
    assert.deepEqual(bytes, fs.readFileSync(path.join(directory, 'after-attempt-2.json')));
    const value = JSON.parse(bytes);
    assert.equal(value.exitCode, 0);
    assert.equal(value.repository.dirty, false);
    assert.deepEqual(value.runners[0].repetitions, { expected: 4, completed: 4 });
    assert.equal(value.runners[0].measurements.unstableCases, 0);
    assert.equal(value.runners[0].measurements.fixtureMutations, 0);
  });
  check('later actual public Codex captures preserve original exits and frozen source ledgers', () => {
    const directory = path.join(__dirname, 'results', 'live-eval-remediation', 'trace-codex-2026-10-09');
    for (const [capture, commit, legacy] of [
      ['public-before-cr', '8ee3aa5cd8af16dbabe4b8a8d0df09c931b68cc4', true],
      ['public-after-cr', '7eabcf927a1400b5599c6027da71efdf2aa64dea', false],
    ]) {
      const manifest = JSON.parse(fs.readFileSync(path.join(directory, capture, 'public-native.manifest.json')));
      assert.ok(manifest.files.every((file) => !file.path.endsWith('/stderr.txt') && file.bytes > 0));
      const compressed = fs.readFileSync(path.join(directory, capture, manifest.archive));
      assert.equal(createHash('sha256').update(compressed).digest('hex'), manifest.archiveSha256);
      assert.equal(manifest.sourceCommit, commit);
      assert.deepEqual(manifest.nativeExits, [1, 0]);
      const archived = JSON.parse(gunzipSync(compressed));
      const files = new Map(archived.files.map((file) => [file.path, Buffer.from(file.base64, 'base64')]));
      assert.equal(files.size, manifest.files.length);
      for (const pin of manifest.files) {
        assert.equal(files.get(pin.path).length, pin.bytes);
        assert.equal(createHash('sha256').update(files.get(pin.path)).digest('hex'), pin.sha256);
      }
      for (const [name, id, expected] of [
        ['seeded', '4', 'FAIL'],
        ['clean', '5', 'PASS'],
      ]) {
        const invocation = JSON.parse(files.get(`${name}-invocation.json`));
        assert.match(invocation.sourceCommit, /^[0-9a-f]{7,40}$/);
        assert.ok(commit.startsWith(invocation.sourceCommit));
        assert.deepEqual(JSON.parse(files.get(`${name}-result.json`)).changedInputs, []);
        const prompt = [...files.entries()]
          .find(([file]) => file.startsWith(`${name}/.tea-runs/`) && file.endsWith('/prompt.txt'))[1]
          .toString();
        const frozen = prompt.match(/Frozen source oracle ledger: (\[.*\])\. Preserve/);
        const targetDocument = invocation.args[invocation.args.indexOf('--target') + 1];
        const ledger = frozen
          ? JSON.parse(frozen[1])
          : sourceOracleLedger(files.get(`${name}/${targetDocument}`).toString(), 'captured source');
        const target = { type: 'epic', id, runKey: `epic-${id}`, runScope: 'epic' };
        const paths = tracePaths(path.join(root, 'later-capture-validation', capture, name), target.runKey);
        fs.mkdirSync(path.dirname(paths.matrix), { recursive: true });
        for (const [kind, destination] of Object.entries(paths)) {
          const original = [...files.entries()].find(
            ([file]) => file.startsWith(`${name}/.tea-runs/`) && file.endsWith(path.basename(destination)),
          )[1];
          if (kind === 'matrix') fs.writeFileSync(destination, original);
          else {
            const value = JSON.parse(original);
            value.links.trace_report_path = paths.matrix;
            fs.writeFileSync(destination, JSON.stringify(value));
          }
        }
        const liveFile = files.get(`${name}/test-artifacts/live-verification-results.json`);
        assert.equal(
          validateTraceOutputs({
            paths,
            target,
            collectionMode: 'contract_static',
            allowGate: true,
            oracleLedger: ledger,
            requireOracleLedger: true,
            allowLegacyExplicitOracle: legacy,
            liveCapture: liveFile ? { manifest: JSON.parse(liveFile), currentSha: '' } : undefined,
          }).summary.gate_status,
          expected,
        );
      }
    }
  });

  check('agent-created output aliases are rejected before publication and failure-result writes', () => {
    const target = path.join(root, 'docs', 'epic-4-export.md');
    const before = fs.readFileSync(target);
    const outside = `${root}-outside`;
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'sentinel.md'), 'external sentinel');
    try {
      for (const mode of ['late-json-success', 'late-json-failure', 'late-artifact-alias', 'late-artifact-escape', 'late-artifact-pair']) {
        const json = path.join(root, 'late-result.json');
        if (fs.existsSync(json)) fs.unlinkSync(json);
        fs.writeFileSync(json, '{"status":"completed","gate_status":"PASS"}');
        const matrix = path.join(root, 'artifacts', 'trace', 'traceability-matrix-epic-4.md');
        if (fs.existsSync(matrix)) fs.unlinkSync(matrix);
        if (mode === 'late-artifact-pair') {
          const summary = path.join(root, 'artifacts', 'trace', 'e2e-trace-summary-epic-4.json');
          if (fs.existsSync(summary)) fs.unlinkSync(summary);
        }
        const result = run(mode, ['--json', 'late-result.json']);
        assert.equal(result.status, 2, `${mode}: ${result.stderr}`);
        assert.equal(result.payload.status, 'failed');
        if (!mode.startsWith('late-json-')) assert.ok(!fs.existsSync(json));
        assert.deepEqual(fs.readFileSync(target), before);
        assert.equal(fs.readFileSync(path.join(outside, 'sentinel.md'), 'utf8'), 'external sentinel');
        if (mode === 'late-artifact-pair') assert.equal(fs.readFileSync(matrix, 'utf8'), '# Agent-created matrix sentinel');
      }
      for (const file of [path.join(root, 'late-result.json'), path.join(root, 'artifacts', 'trace', 'traceability-matrix-epic-4.md')])
        if (fs.existsSync(file)) fs.unlinkSync(file);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  check('native v7 epics resolve to initiative-qualified run keys; v6 epics keep epic-<n>', () => {
    const tree = (initiative, epics, folder, text = V7_EPIC) => {
      const tickets = path.join(root, '_bmad-output', `initiative-${initiative}`, 'tickets');
      fs.mkdirSync(path.join(tickets, folder, 'tickets'), { recursive: true });
      fs.writeFileSync(
        path.join(tickets, 'tickets.toml'),
        epics.map(([id, slug]) => `[[epic]]\nid = ${id}\nslug = "${slug}"\n`).join('\n'),
      );
      fs.writeFileSync(path.join(tickets, folder, `${folder}.md`), text);
      // One verify-only story covering every R line: the fixture agent maps it as each requirement's contributor.
      fs.writeFileSync(
        path.join(tickets, folder, 'tickets', 'tickets.toml'),
        '[[entry]]\nid = 1\ntype = "story"\ntitle = "Checkout"\nverify = "A shopper checks out end to end."\ncovers = ["R1", "R2", "R3", "R4"]\n',
      );
      return path.relative(root, path.join(tickets, folder, `${folder}.md`));
    };
    const shop = tree('shop', [[1, 'epic-checkout']], 'epic-checkout');
    const ops = tree('ops', [[1, 'epic-checkout']], 'epic-checkout', V7_EPIC.replace('R2 (parent R2)', 'R2 (parent R7)'));
    const loyalty = tree('shop', [[1, 'epic-checkout']], 'epic-loyalty');
    // A native epic whose title starts with "Story" is still an epic: the folder shape decides before the heading.
    const stories = tree(
      'shop',
      [
        [1, 'epic-checkout'],
        [2, 'epic-stories'],
      ],
      'epic-stories',
      V7_EPIC.replace('# Shoppers check out', '# Story publishing'),
    );
    const resolve = (target, extra = {}) => resolveTraceTarget({ projectRoot: root, target, ...extra });
    for (const [target, key, epicId, label] of [
      [shop, 'shop--e1', '1', 'Shoppers check out'],
      [ops, 'ops--e1', '1', 'Shoppers check out'],
      [loyalty, 'shop--epic-loyalty', null, 'Shoppers check out'],
      [stories, 'shop--e2', '2', 'Story publishing'],
    ]) {
      const identity = resolve(target);
      assert.deepEqual(
        [identity.type, identity.id, identity.runScope, identity.runKey, identity.epicKey, identity.epicId],
        ['epic', key, 'epic', `epic-${key}`, key, epicId],
      );
      assert.equal(identity.label, label);
    }
    assert.equal(resolve(shop, { targetId: '1' }).runKey, 'epic-shop--e1');
    assert.throws(() => resolve(shop, { targetId: 'checkout' }), /does not name the v7 epic shop--e1/);
    // An explicit --gate-type still wins over the native shape.
    assert.deepEqual((({ type, runKey, epicKey }) => [type, runKey, epicKey])(resolve(stories, { gateType: 'story', targetId: '2.1' })), [
      'story',
      'story-epic-stories',
      undefined,
    ]);
    const v6 = resolve('docs/epic-4-export.md');
    assert.deepEqual([v6.id, v6.runKey, v6.epicKey], ['4', 'epic-4', undefined]);

    const artifacts = path.join(fs.realpathSync(root), 'artifacts');
    const published = new Set();
    for (const [target, runKey, id] of [
      [shop, 'epic-shop--e1', 'shop--e1'],
      [ops, 'epic-ops--e1', 'ops--e1'],
      [stories, 'epic-shop--e2', 'shop--e2'],
      ['docs/epic-4-export.md', 'epic-4', '4'],
    ]) {
      const result = run('pass', ['--target', target]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.payload.run_key, runKey);
      const expected = tracePaths(artifacts, runKey);
      assert.deepEqual(result.payload.artifacts, expected);
      for (const file of Object.values(expected)) {
        assert.ok(fs.existsSync(file), file);
        assert.ok(!published.has(file), `${file} is shared by two targets`);
        published.add(file);
      }
      const summary = JSON.parse(fs.readFileSync(expected.summary, 'utf8'));
      assert.deepEqual(summary.target, { type: 'epic', id });
      const progress = yaml.load(fs.readFileSync(expected.matrix, 'utf8').match(/^---\n([\s\S]*?)\n---/)[1]);
      assert.equal(progress.runKey, runKey);
      if (id === '4') {
        assert.equal(progress.oracleGranularity, undefined);
        assert.equal(summary.oracle.granularity, undefined);
      } else {
        assert.equal(progress.oracleGranularity, 'requirements');
        assert.equal(summary.oracle.granularity, 'requirements');
        assert.deepEqual(
          progress.oracleLedger.map((row) => row.id),
          ['R1', 'R2', 'R3', 'R4'].map((local) => `${id}--${local}`),
        );
        assert.deepEqual(
          summary.oracle.rows.map((row) => [row.id, row.coverage, row.contributors.map((contributor) => contributor.id)]),
          ['R1', 'R2', 'R3', 'R4'].map((local) => [`${id}--${local}`, 'FULL', [`${id}-s1--verify`]]),
        );
        const prompt = fs.readFileSync(path.join(result.payload.evidence, 'attempt-1', 'prompt.txt'), 'utf8');
        assert.match(prompt, new RegExp(`This is v7 epic ${id}; the frozen ledger holds its Requirements lines`));
        assert.match(prompt, /oracle\.rows to one entry per oracleLedger row/);
      }
    }
    const omitted = run('missing-source-criterion', ['--target', shop]);
    assert.equal(omitted.status, 3, omitted.stderr);
    assert.match(omitted.payload.reason, /omits epic requirement shop--e1--R2/);
    const rewritten = run('source-text-drift', ['--target', ops]);
    assert.equal(rewritten.status, 3, rewritten.stderr);
    assert.match(rewritten.payload.reason, /requirement ops--e1--R1 changed its frozen requirement text/);
    // The epic's ticket sources are protected inputs, like the epic file itself.
    const index = path.join(root, path.dirname(shop), 'tickets', 'tickets.toml');
    const original = fs.readFileSync(index);
    try {
      const mutated = run('mutate-ticket-index', ['--target', shop]);
      assert.equal(mutated.status, 3, mutated.stderr);
      assert.match(mutated.payload.reason, /Trace agent changed a supplied input: .*epic-checkout\/tickets\/tickets\.toml/);
    } finally {
      fs.writeFileSync(index, original);
    }
  });

  check('native v7 story leaves resolve to their story-contract keys; v6 stories keep their basename', () => {
    const leaf = (relative, frontmatterLines, heading = '# Guest checkout form') => {
      const file = path.join(root, '_bmad-output', relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(
        file,
        ['---', ...frontmatterLines, '---', '', heading, '', '## Requirements', '', '1. **Guest submits the order** (R1)', ''].join('\n'),
      );
      return path.relative(root, file);
    };
    fs.mkdirSync(path.join(root, '_bmad-output', 'initiative-kiosk', 'tickets'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '_bmad-output', 'initiative-kiosk', 'tickets', 'tickets.toml'),
      '[[epic]]\nid = 3\nslug = "epic-checkout"\n',
    );
    const epicLeaf = leaf('initiative-kiosk/tickets/epic-checkout/tickets/story-guest-checkout-form.md', ['id: 1', 'type: story']);
    const unnumbered = leaf('initiative-kiosk/tickets/epic-loyalty/tickets/story-points.md', ['id: 4', 'type: story']);
    const initiativeLeaf = leaf('initiative-solo/tickets/story-login.md', ['id: 2', 'type: story']);
    const backlog = leaf('backlog/story-coupon-banner.md', ['type: story']);
    const resolve = (target, extra = {}) => resolveTraceTarget({ projectRoot: root, target, ...extra });
    for (const [target, storyId, key, container] of [
      [epicLeaf, '3.1', 'kiosk--e3-s1', '_bmad-output/initiative-kiosk/tickets/epic-checkout'],
      [unnumbered, '4', 'kiosk--epic-loyalty-s4', '_bmad-output/initiative-kiosk/tickets/epic-loyalty'],
      [initiativeLeaf, '2', 'solo--s2', '_bmad-output/initiative-solo'],
      [backlog, 'story-coupon-banner.md', 'backlog--story-coupon-banner', '_bmad-output/backlog'],
    ]) {
      for (const gateType of [undefined, 'story']) {
        const identity = resolve(target, { gateType });
        assert.deepEqual(
          [identity.type, identity.id, identity.runScope, identity.runKey, identity.storyKey, identity.ticketRef, identity.label],
          ['story', storyId, 'story', `story-${key}`, key, `${storyId} @ ${container}`, 'Guest checkout form'],
        );
        assert.equal(identity.storyFile, path.join(root, target));
      }
    }
    assert.equal(resolve(epicLeaf, { targetId: 'kiosk--e3-s1' }).runKey, 'story-kiosk--e3-s1');
    assert.throws(() => resolve(epicLeaf, { targetId: '1.2' }), /does not name the v7 story kiosk--e3-s1/);
    // A plan beside the leaf and a v6 story file keep their earlier routes.
    const v6 = path.join(root, 'docs', '1-2-user-auth.md');
    fs.writeFileSync(v6, '# Story 1.2: User auth\n\nAC-1: A user signs in.\n');
    assert.deepEqual((({ id, runKey, storyKey }) => [id, runKey, storyKey])(resolve('docs/1-2-user-auth.md')), [
      '1.2',
      'story-1-2-user-auth',
      undefined,
    ]);

    const artifacts = path.join(fs.realpathSync(root), 'artifacts');
    const result = run('pass', ['--target', epicLeaf, '--gate-type', 'story']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.payload.run_key, 'story-kiosk--e3-s1');
    const expected = tracePaths(artifacts, 'story-kiosk--e3-s1');
    assert.deepEqual(result.payload.artifacts, expected);
    for (const file of Object.values(expected)) assert.ok(fs.existsSync(file), file);
    assert.deepEqual(JSON.parse(fs.readFileSync(expected.summary, 'utf8')).target, { type: 'story', id: '3.1' });
  });

  check('native epic source capture reads only Requirements lines and halts on a repeated local id', () => {
    const ledger = sourceOracleLedger(V7_EPIC, 'epic-checkout.md', { epicKey: 'shop--e1' });
    assert.deepEqual(
      ledger.map((row) => [row.id, row.priority, row.requirement, row.source]),
      [
        ['shop--e1--R1', 'P0', 'A shopper pays for a cart with a saved card.', 'epic-checkout.md:12'],
        ['shop--e1--R2', null, 'A declined card shows its reason and keeps the cart.', 'epic-checkout.md:13'],
        ['shop--e1--R3', null, 'A receipt reaches the shopper by email.', 'epic-checkout.md:14'],
        ['shop--e1--R4', null, 'An order total matches the priced cart.', 'epic-checkout.md:15'],
      ],
    );
    assert.ok(requirementOracle({ epicKey: 'shop--e1' }, ledger));
    assert.equal(requirementOracle({}, ledger), false);
    // A v6 epic and an epic with no R lines keep today's criterion capture.
    assert.deepEqual(sourceOracleLedger(V7_EPIC, 'epic-checkout.md'), []);
    const noSpine = '# Loyalty\n\n## Requirements\n\nAC-1 (P1): Points accrue on paid orders.\n';
    assert.deepEqual(
      sourceOracleLedger(noSpine, 'epic-loyalty.md', { epicKey: 'shop--epic-loyalty' }).map((row) => row.id),
      ['AC-1'],
    );
    assert.throws(
      () => sourceOracleLedger(V7_EPIC.replace('R3 (prd FR-7)', 'R2 (prd FR-7)'), 'epic-checkout.md', { epicKey: 'shop--e1' }),
      /Epic shop--e1 defines R2 twice, at epic-checkout\.md:13 and epic-checkout\.md:14/,
    );
    assert.throws(
      () =>
        sourceOracleLedger(
          V7_EPIC.replace('(parent R2):', '(parent R2, P1):').replace('keeps the cart.', 'keeps the cart. (P2)'),
          'epic-checkout.md',
          { epicKey: 'shop--e1' },
        ),
      /gives R2 conflicting priorities/,
    );
    // Formatting is stripped around the identifier only; literal `*` and backticks in the body survive.
    const literal = [
      '## Requirements',
      '',
      'R1 (parent R1): The *.json files retain the literal `*`.',
      '**R2** (parent R2): An order of 2 * 3 * 4 items prices each line.',
      '**R3 (parent R3, P1):** Run `ls *.csv` to list every export.',
      '`R4` (parent R4): **Refunds** settle within a day.',
      '',
    ].join('\n');
    assert.deepEqual(
      sourceOracleLedger(literal, 'epic.md', { epicKey: 'shop--e1' }).map((row) => [row.id, row.priority, row.requirement]),
      [
        ['shop--e1--R1', null, 'The *.json files retain the literal `*`.'],
        ['shop--e1--R2', null, 'An order of 2 * 3 * 4 items prices each line.'],
        ['shop--e1--R3', 'P1', 'Run `ls *.csv` to list every export.'],
        ['shop--e1--R4', null, '**Refunds** settle within a day.'],
      ],
    );
    assert.deepEqual(
      sourceOracleLedger('**AC-1** (P0): Exports match *.csv\n', 'requirements.md').map((row) => [row.id, row.priority, row.requirement]),
      [['AC-1', 'P0', 'Exports match *.csv']],
    );
  });

  check('a v7 requirement export validates over its intended denominator and rejects contradictory rows', () => {
    const validate = v7Validator(path.join(root, 'v7-export'));
    const accepted = validate();
    // Five requirement rows plus the invalid-link and unlinked exception rows; contributor rows are not counted.
    assert.deepEqual(accepted.summary.coverage.inventory, { total: 7, covered: 5, pct: 71 });
    assert.deepEqual(
      Object.values(accepted.summary.coverage.priority_breakdown).map((bucket) => [bucket.total, bucket.covered]),
      [
        [4, 3],
        [2, 2],
        [1, 0],
        [0, 0],
      ],
    );
    // R3 inherits P0 from its only contributor, so its missing behavior fails the P0 gate.
    assert.equal(accepted.summary.gate_status, 'FAIL');
    assert.deepEqual(
      accepted.summary.oracle.rows.map((row) => [row.id, row.priority, row.priority_basis, row.coverage]),
      [
        ['shop--e1--R1', 'P0', 'explicit', 'FULL'],
        ['shop--e1--R2', 'P1', 'contributors', 'FULL'],
        ['shop--e1--R3', 'P0', 'contributors', 'PARTIAL'],
        ['shop--e1--R4', 'P0', 'contributors', 'FULL'],
        ['shop--e1--R5', 'P2', 'inferred', 'NONE'],
        ['shop--e1-s2--AC-1', 'P1', 'inferred', 'FULL'],
        ['shop--e1-s3--verify', 'P0', 'inferred', 'FULL'],
      ],
    );
    // Live-only FULL and exception rows keep the CONCERNS cap on otherwise passing coverage.
    const passing = (value) => {
      value.status['shop--e1--R3'] = 'FULL';
      value.missing = {};
      retally(value);
    };
    assert.equal(validate(passing).summary.gate_status, 'CONCERNS');
    assert.throws(
      () =>
        validate((value) => {
          passing(value);
          value.summary.gate_status = 'PASS';
        }),
      /gate decision contradicts/,
    );
    assert.throws(
      () =>
        validate((value) => {
          value.summary.coverage.inventory = { total: 4, covered: 3, pct: 75 };
          value.summary.coverage.priority_breakdown.P0 = { total: 1, covered: 1, pct: 100 };
          value.summary.coverage.priority_breakdown.P1 = { total: 2, covered: 2, pct: 100 };
        }),
      /P0 coverage contradicts its summary/,
    );
    assert.throws(
      () => validate((value) => (value.summary.coverage.by_level.live.criteria_covered = 5)),
      /live criteria_covered exceeds the Step 1 criterionLedger/,
    );

    const row = (value, id) => value.progress.oracleLedger.find((entry) => entry.id === id);
    const criterion = (value, id) => value.progress.criterionLedger.find((entry) => entry.id === id);
    const summaryRow = (value, id) => value.summary.oracle.rows.find((entry) => entry.id === id);
    const drop = (value, id) => {
      value.progress.criterionLedger = value.progress.criterionLedger.filter((entry) => entry.id !== id);
      value.progress.oracleLedger = value.progress.oracleLedger.filter((entry) => entry.id !== id);
      for (const entry of value.progress.oracleLedger)
        if (entry.contributors) entry.contributors = entry.contributors.filter((contributor) => contributor !== id);
      delete value.status[id];
    };
    // Each mutation keeps the reported arithmetic consistent unless the arithmetic is what it breaks.
    for (const [name, mutate, message] of [
      [
        'omitted requirement',
        (value) => (value.progress.oracleLedger = value.progress.oracleLedger.filter((entry) => entry.id !== 'shop--e1--R3')),
        /omits epic requirement shop--e1--R3/,
      ],
      [
        'rewritten requirement text',
        (value) => (row(value, 'shop--e1--R2').requirement = 'A declined card shows its reason.'),
        /requirement shop--e1--R2 changed its frozen requirement text/,
      ],
      [
        'changed explicit requirement priority',
        (value) => (row(value, 'shop--e1--R1').priority = 'P1'),
        /requirement shop--e1--R1 changed its explicit source priority/,
      ],
      // F1: an inherited priority below the highest contributor would move R3's gap out of the P0 bucket.
      [
        'inherited priority lowered',
        (value) => (row(value, 'shop--e1--R3').priority = 'P2'),
        /requirement shop--e1--R3 priority must be P0, the highest priority among its contributors/,
      ],
      [
        'inferred priority beside contributors',
        (value) => Object.assign(row(value, 'shop--e1--R3'), { priority: 'P2', priorityBasis: 'inferred' }),
        /requirement shop--e1--R3 must record priorityBasis contributors/,
      ],
      [
        'explicit basis without a stated priority',
        (value) => (row(value, 'shop--e1--R4').priorityBasis = 'explicit'),
        /requirement shop--e1--R4 must record priorityBasis contributors/,
      ],
      [
        'criterion without a priority',
        (value) => delete criterion(value, 'shop--e1-s1--AC-2').priority,
        /criterionLedger has an invalid or duplicate criterion/,
      ],
      [
        'criterion without a priorityBasis',
        (value) => delete criterion(value, 'shop--e1-s1--AC-2').priorityBasis,
        /criterionLedger has an invalid or duplicate criterion/,
      ],
      [
        'leaf priority dropped to inferred',
        (value) => (criterion(value, 'shop--e1-s1--AC-1').priorityBasis = 'inferred'),
        /criterion shop--e1-s1--AC-1 must keep the explicit priority P0 its source states/,
      ],
      [
        'exception row absent from criterionLedger',
        (value) => {
          value.progress.criterionLedger = value.progress.criterionLedger.filter((entry) => entry.id !== 'shop--e1-s2--AC-1');
          row(value, 'shop--e1--R2').contributors = ['shop--e1-s1--AC-2'];
        },
        /row shop--e1-s2--AC-1 is neither an epic requirement nor a criterionLedger link exception/,
      ],
      [
        'exception row for a linked criterion',
        (value) => Object.assign(criterion(value, 'shop--e1-s2--AC-1'), { declaredLinks: ['R2'], invalidLinks: [], exception: 'none' }),
        /neither an epic requirement nor a criterionLedger link exception/,
      ],
      [
        'exception text drift',
        (value) => (row(value, 'shop--e1-s3--verify').requirement = 'Checkout is fast.'),
        /exception row shop--e1-s3--verify requirement must be its criterion's name "Checkout answers within two seconds\."/,
      ],
      [
        // The rule the live runs broke: an exception row names its criterion, never its Given/When/Then text.
        'exception row freezing the full criterion text',
        (value) => (row(value, 'shop--e1-s2--AC-1').requirement = criterion(value, 'shop--e1-s2--AC-1').text),
        /exception row shop--e1-s2--AC-1 requirement must be its criterion's name "Expired card is refused before charging"/,
      ],
      [
        'criterion name absent from its text',
        (value) => (criterion(value, 'shop--e1-s1--AC-2').name = 'Declined card is retried'),
        /criterion shop--e1-s1--AC-2 text must contain its name "Declined card is retried"/,
      ],
      [
        'criterion without a name',
        (value) => delete criterion(value, 'shop--e1-s1--AC-2').name,
        /criterionLedger has an invalid or duplicate criterion/,
      ],
      [
        'criterion without its full text',
        (value) => delete criterion(value, 'shop--e1-s1--AC-2').text,
        /criterionLedger has an invalid or duplicate criterion/,
      ],
      [
        'exception priority lowered',
        (value) => {
          row(value, 'shop--e1-s3--verify').priority = 'P3';
          retally(value);
        },
        /exception row shop--e1-s3--verify changed its criterion's priority/,
      ],
      [
        'link exception dropped from the gate',
        (value) => {
          value.progress.oracleLedger = value.progress.oracleLedger.filter((entry) => entry.id !== 'shop--e1-s3--verify');
          retally(value);
        },
        /criterion shop--e1-s3--verify has link exception unlinked but no gate row/,
      ],
      [
        'invalid link hidden as none',
        (value) => (criterion(value, 'shop--e1-s2--AC-1').exception = 'none'),
        /criterion shop--e1-s2--AC-1 must record exception invalid-link/,
      ],
      [
        'undefined id sorted as valid',
        (value) => Object.assign(criterion(value, 'shop--e1-s2--AC-1'), { validLinks: ['R2', 'R9'], invalidLinks: [] }),
        /sorts its links differently from the epic's Requirements lines/,
      ],
      [
        'dropped contributor',
        (value) => (row(value, 'shop--e1--R2').contributors = ['shop--e1-s1--AC-2']),
        /requirement shop--e1--R2 must list exactly the criteria whose validLinks name it as contributors/,
      ],
      [
        'declared links disagree with their split',
        (value) => (criterion(value, 'shop--e1-s2--AC-1').declaredLinks = ['R2']),
        /sorts its links differently from the epic's Requirements lines/,
      ],
      [
        'exception row with another exception',
        (value) => (row(value, 'shop--e1-s3--verify').exception = 'invalid-link'),
        /exception row shop--e1-s3--verify must record kind exception and its criterion's exception unlinked/,
      ],
      [
        'requirement row without kind',
        (value) => delete row(value, 'shop--e1--R1').kind,
        /requirement shop--e1--R1 must record kind requirement/,
      ],
      ['missing criterionLedger', (value) => delete value.progress.criterionLedger, /must persist the Step 1 criterionLedger/],
      [
        'criterion granularity on a spine epic',
        (value) => delete value.progress.oracleGranularity,
        /must record oracleGranularity: requirements/,
      ],
      // F5: the CLI's own ticket capture exposes omitted, rewritten and invented criteria.
      [
        'omitted uncovered contributor',
        (value) => {
          drop(value, 'shop--e1-s1--AC-2');
          retally(value);
        },
        /criterionLedger lists 1 criteria for shop--e1-s1; the story contract selects 2 from .*story-saved-card\.md/,
      ],
      [
        'omitted unlinked criterion',
        (value) => {
          drop(value, 'shop--e1-s3--verify');
          retally(value);
        },
        /criterionLedger omits shop--e1-s3, entry 3 of .*tickets\.toml/,
      ],
      [
        'rewritten leaf criterion name',
        (value) =>
          Object.assign(criterion(value, 'shop--e1-s1--AC-2'), {
            name: 'Declined card is retried',
            text: '**Declined card is retried** (R2) **Given** a declined saved card **When** the shopper pays **Then** the card is retried',
          }),
        /no shop--e1-s1 criterion named "Declined card shows the decline reason" \(R2\) from .*story-saved-card\.md:22/,
      ],
      [
        // A name that merely contains the leaf's bold name is a different criterion.
        'leaf criterion name extended',
        (value) =>
          Object.assign(criterion(value, 'shop--e1-s1--AC-2'), {
            name: 'Declined card shows the decline reason (R2)',
          }),
        /no shop--e1-s1 criterion named "Declined card shows the decline reason" \(R2\)/,
      ],
      [
        'leaf criterion links changed',
        (value) => {
          // A consistent rewrite: AC-1 stops naming R4, so R4 loses its contributor and becomes an inferred NONE row.
          Object.assign(criterion(value, 'shop--e1-s1--AC-1'), { validLinks: ['R1', 'R3'], declaredLinks: ['R1', 'R3'] });
          Object.assign(row(value, 'shop--e1--R4'), { contributors: [], priorityBasis: 'inferred' });
          value.status['shop--e1--R4'] = 'NONE';
          retally(value);
        },
        /no shop--e1-s1 criterion named "Saved card payment completes the order" \(R1, R3, R4\) from .*story-saved-card\.md:17/,
      ],
      [
        'rewritten verify criterion text',
        (value) => {
          Object.assign(criterion(value, 'shop--e1-s3--verify'), { name: 'Checkout is fast.', text: 'Checkout is fast.' });
          row(value, 'shop--e1-s3--verify').requirement = 'Checkout is fast.';
        },
        /must give verify-only entry shop--e1-s3 one criterion: its verify line as name and text, linked to its covers/,
      ],
      [
        'verify criterion named differently from its verify line',
        (value) => {
          Object.assign(criterion(value, 'shop--e1-s3--verify'), { name: 'Checkout answers' });
          row(value, 'shop--e1-s3--verify').requirement = 'Checkout answers';
        },
        /must give verify-only entry shop--e1-s3 one criterion: its verify line as name and text, linked to its covers/,
      ],
      [
        'invented criterion source',
        (value) => (criterion(value, 'shop--e1-s1--AC-1').source = '/invented:1'),
        /criterion shop--e1-s1--AC-1 source \/invented:1 is not a path:line inside the epic folder/,
      ],
      [
        'source on another line of the leaf',
        (value) => (criterion(value, 'shop--e1-s1--AC-1').source = criterion(value, 'shop--e1-s1--AC-2').source),
        /criterion shop--e1-s1--AC-1 source .*story-saved-card\.md:22 must be .*story-saved-card\.md:17, where "Saved card payment completes the order" starts/,
      ],
      [
        'criterion for a story the epic does not list',
        (value) => {
          const extra = { ...criterion(value, 'shop--e1-s3--verify'), id: 'shop--e1-s9--verify', story: 'shop--e1-s9' };
          value.progress.criterionLedger.push(extra);
          value.progress.oracleLedger.push({ ...row(value, 'shop--e1-s3--verify'), id: extra.id });
          value.status[extra.id] = 'FULL';
          retally(value);
        },
        /criterion shop--e1-s9--verify names no entry of .*tickets\.toml/,
      ],
      // F7: the published summary labels its inventory with the progress granularity.
      ['summary without granularity', (value) => delete value.summary.oracle.granularity, /oracle\.granularity must be requirements/],
      [
        'summary declaring criterion granularity',
        (value) => (value.summary.oracle.granularity = 'criteria'),
        /oracle\.granularity must be requirements/,
      ],
      // F6: the published rows are the gate ledger, in order, with the matrix statuses.
      ['summary without rows', (value) => delete value.summary.oracle.rows, /oracle\.rows must list every oracleLedger row/],
      [
        'summary rows out of order',
        (value) => (value.summary.oracle.rows = value.summary.oracle.rows.toReversed()),
        /oracle\.rows\[0\] must be shop--e1--R1, in oracleLedger order/,
      ],
      [
        'summary row priority differs',
        (value) => (summaryRow(value, 'shop--e1--R5').priority = 'P3'),
        /summary row shop--e1--R5 kind, priority or priority_basis differs/,
      ],
      [
        'summary row coverage differs from the matrix',
        (value) => (summaryRow(value, 'shop--e1-s3--verify').coverage = 'NONE'),
        /summary row shop--e1-s3--verify coverage differs from the matrix/,
      ],
      [
        'summary row parent differs',
        (value) => (summaryRow(value, 'shop--e1--R2').parent = 'parent R7'),
        /summary row shop--e1--R2 parent differs/,
      ],
      [
        'summary row drops a contributor',
        (value) => summaryRow(value, 'shop--e1--R2').contributors.pop(),
        /summary row shop--e1--R2 contributors must be the oracleLedger contributors/,
      ],
      [
        'matrix contributor table disagrees',
        (value) => (value.tableStatus = { ...value.criterionStatus, 'shop--e1-s1--AC-2': 'PARTIAL' }),
        /contributors table for shop--e1--R2 disagrees/,
      ],
      // F2: AC5's aggregation, reconciled with contributor statuses and missing behaviors.
      [
        'FULL with its sole contributor NONE',
        (value) => {
          value.criterionStatus['shop--e1-s1--AC-1'] = 'NONE';
          retally(value);
        },
        /requirement shop--e1--R1 is FULL, but contributor shop--e1-s1--AC-1 is NONE/,
      ],
      [
        'FULL with no contributors',
        (value) => {
          value.status['shop--e1--R5'] = 'FULL';
          retally(value);
        },
        /requirement shop--e1--R5 is FULL, but no criterion contributes to it/,
      ],
      [
        'FULL with a missing behavior on an otherwise passing gate',
        (value) => {
          value.status['shop--e1--R3'] = 'FULL';
          retally(value);
        },
        /requirement shop--e1--R3 is FULL, but it lists missing behaviors/,
      ],
      [
        'FULL with a UNIT-ONLY contributor on an otherwise passing gate',
        (value) => {
          passing(value);
          value.criterionStatus['shop--e1-s1--AC-2'] = 'UNIT-ONLY';
          retally(value);
        },
        /requirement shop--e1--R2 is FULL, but contributor shop--e1-s1--AC-2 is UNIT-ONLY/,
      ],
      [
        'NONE with a covered contributor',
        (value) => {
          value.status['shop--e1--R2'] = 'NONE';
          retally(value);
        },
        /requirement shop--e1--R2 is NONE, but contributor shop--e1-s1--AC-2 is FULL/,
      ],
      [
        'PARTIAL when every contributor is FULL and nothing is missing',
        (value) => {
          value.status['shop--e1--R4'] = 'PARTIAL';
          retally(value);
        },
        /requirement shop--e1--R4 is PARTIAL, but its contributors and missing behaviors make it FULL/,
      ],
      [
        'one criterion with two coverages',
        (value) => {
          value.status['shop--e1-s2--AC-1'] = 'PARTIAL';
          retally(value);
        },
        /criterion shop--e1-s2--AC-1 is PARTIAL in one gate row and FULL in shop--e1--R2's contributors/,
      ],
      ['missing ticket capture', () => {}, /needs the epic's independently captured tickets/],
    ])
      assert.throws(() => validate(mutate, name === 'missing ticket capture' ? { tickets: undefined } : {}), message, name);
    // A criterion-oracle target never accepts a requirements declaration.
    assert.throws(
      () => validate(() => {}, { target: { ...V7_TARGET, epicKey: undefined }, oracleLedger: [] }),
      /needs a native v7 epic's frozen Requirements lines/,
    );
  });

  // Round 2, F5: the CLI captures the criteria the story contract selects in every native ticket shape,
  // and binds each returned criterion to its full captured text, links, priority and exact source line.
  check('ticket capture reads native story, bug, spike and plan criteria in the story contract order', () => {
    const projectRoot = path.join(root, 'v7-native-capture', 'project');
    const source = writeV7Tree(projectRoot, V7_EXPORT_EPIC, true);
    const ticketsDir = path.join(path.dirname(source), 'tickets');
    // A plan beside a leaf with numbered criteria is never selected; an Acceptance Criteria heading in a plan is.
    fs.writeFileSync(
      path.join(ticketsDir, 'story-saved-card-plan.md'),
      '---\nticket: 1\n---\n\n## Acceptance Criteria\n\n- Never selected\n',
    );
    fs.appendFileSync(
      path.join(ticketsDir, 'tickets.toml'),
      '\n[[entry]]\nid = 7\ntype = "story"\ntitle = "Totals"\nverify = "Totals add up."\ncovers = ["R4"]\n',
    );
    fs.writeFileSync(
      path.join(ticketsDir, 'story-totals-plan.md'),
      '---\nticket: 7\n---\n\n# Totals\n\n## Acceptance Criteria\n\n1. **Total matches the cart** (R4, P1)\n   Given a priced cart, then the total matches\n',
    );
    const tickets = epicTicketSources(projectRoot, { ...V7_TARGET, document: source });
    const shape = (entry) => [
      entry.id,
      entry.selection,
      ...entry.criteria.map((criterion) => [
        path.basename(criterion.file),
        criterion.line,
        criterion.name,
        criterion.text.replaceAll(/\s+/g, ' '),
        criterion.links,
        criterion.priority,
      ]),
    ];
    assert.deepEqual(tickets.entries.map(shape), [
      [
        '1',
        'numbered',
        [
          'story-saved-card.md',
          17,
          'Saved card payment completes the order',
          '**Saved card payment completes the order** (R1, R3, R4) (P0) **Given** a shopper with a saved card **When** they pay for the cart **Then** the order completes',
          ['R1', 'R3', 'R4'],
          'P0',
        ],
        [
          'story-saved-card.md',
          22,
          'Declined card shows the decline reason',
          '**Declined card shows the decline reason** (R2) **Given** a declined saved card **When** the shopper pays **Then** the decline reason shows',
          ['R2'],
          null,
        ],
      ],
      [
        '2',
        'numbered',
        [
          'story-expired-card.md',
          13,
          'Expired card is refused before charging',
          '**Expired card is refused before charging** (R2, R9) **Given** an expired card **When** the shopper pays **Then** nothing is charged',
          ['R2', 'R9'],
          null,
        ],
      ],
      ['3', 'verify'],
      [
        '4',
        'numbered',
        [
          'bug-declined-retry.md',
          17,
          'Declined retry keeps the cart',
          '**Declined retry keeps the cart** (R2) **Given** a declined saved card **When** the shopper retries **Then** the cart is kept',
          ['R2'],
          null,
        ],
      ],
      [
        '5',
        'numbered',
        [
          'spike-wallet.md',
          13,
          'Wallet providers are compared on order totals',
          '**Wallet providers are compared on order totals** (R4) Verify: the comparison is recorded in docs/wallet.md',
          ['R4'],
          null,
        ],
      ],
      [
        '6',
        'plan',
        [
          'story-receipt-resend-plan.md',
          16,
          'Given a sent receipt, when the shopper asks again, then the receipt is resent',
          'Given a sent receipt, when the shopper asks again, then the receipt is resent (R3)',
          ['R3'],
          null,
        ],
        [
          'story-receipt-resend-plan.md',
          17,
          'Resend is rate limited',
          '**Resend is rate limited** (P0): Given three resends in a minute, when a fourth is asked, then it is refused',
          [],
          'P0',
        ],
      ],
      [
        '7',
        'plan',
        [
          'story-totals-plan.md',
          9,
          'Total matches the cart',
          '**Total matches the cart** (R4, P1) Given a priced cart, then the total matches',
          ['R4'],
          'P1',
        ],
      ],
    ]);
    // A verify-only entry keeps the tickets.toml line of its verify key.
    assert.deepEqual(
      tickets.entries[2].verify.map((verify) => [path.basename(verify.file), verify.line, verify.text]),
      [['tickets.toml', V7_ENTRIES.indexOf('verify = "Checkout answers within two seconds."') + 1, 'Checkout answers within two seconds.']],
    );
  });

  // Once a story is pulled its leaf is the ticket: stale index text never stands in for the leaf's Verify or covers.
  check("a pulled leaf's Verify and covers replace the stale index entry's", () => {
    const base = path.join(root, 'v7-stale-verify');
    const validate = v7Validator(base);
    const epicDir = path.join(base, 'project', '_bmad-output', 'initiative-shop', 'tickets', 'epic-checkout');
    const leaf = path.join(epicDir, 'tickets', 'story-checkout-fast.md');
    const current = 'Checkout rejects stolen cards before charging. (P0)';
    fs.writeFileSync(
      leaf,
      [
        '---',
        'id: 3',
        'type: story',
        'title: "Checkout is fast"',
        'parent: epic-checkout',
        'covers: []',
        '---',
        '',
        '# Checkout is fast',
        '',
        '## Requirements',
        '',
        `Verify: ${current}`,
        '',
      ].join('\n'),
    );
    const tickets = epicTicketSources(path.join(base, 'project'), { ...V7_TARGET, document: path.join(epicDir, 'epic-checkout.md') });
    assert.deepEqual(
      tickets.entries[2].verify.map((verify) => [path.basename(verify.file), verify.line, verify.text]),
      [['story-checkout-fast.md', 13, current]],
    );
    // The stale index verify line, frozen as the criterion, is rejected.
    assert.throws(() => validate(), /verify-only entry shop--e1-s3/);
    const pulled = (covered) => (value) => {
      const criterion = value.progress.criterionLedger.find((entry) => entry.id === 'shop--e1-s3--verify');
      Object.assign(criterion, { name: current, text: current, priority: 'P0', priorityBasis: 'explicit', source: `${leaf}:13` });
      Object.assign(
        value.progress.oracleLedger.find((row) => row.id === 'shop--e1-s3--verify'),
        { requirement: current, priority: 'P0', priorityBasis: 'explicit', source: `${leaf}:13` },
      );
      value.criterionStatus['shop--e1-s3--verify'] = covered;
      value.status['shop--e1-s3--verify'] = covered;
      retally(value);
    };
    // The leaf's current P0 criterion controls the gate: unproven, it fails it.
    const unproven = validate(pulled('NONE')).summary;
    assert.deepEqual([unproven.gate_status, unproven.gate_criteria.p0_status], ['FAIL', 'NOT_MET']);
    const proven = validate(pulled('FULL')).summary.coverage.priority_breakdown.P0;
    assert.deepEqual(
      [proven.total, proven.covered],
      [unproven.coverage.priority_breakdown.P0.total, unproven.coverage.priority_breakdown.P0.covered + 1],
    );
    // A pulled leaf with no criterion and no Verify is refused before any agent runs, naming the leaf.
    const pulledText = fs.readFileSync(leaf, 'utf8');
    fs.writeFileSync(leaf, pulledText.replace(`Verify: ${current}`, 'Draft.'));
    assert.throws(
      () => epicTicketSources(path.join(base, 'project'), { ...V7_TARGET, document: path.join(epicDir, 'epic-checkout.md') }),
      (error) => error.code === 'TRACE_INPUT_INVALID' && error.message.startsWith(`${leaf} states no numbered criteria`),
    );
    fs.writeFileSync(leaf, pulledText);
    // The leaf's covers win over the index entry's.
    fs.writeFileSync(leaf, fs.readFileSync(leaf, 'utf8').replace('covers: []', 'covers: [R5]'));
    const recovered = epicTicketSources(path.join(base, 'project'), { ...V7_TARGET, document: path.join(epicDir, 'epic-checkout.md') });
    assert.deepEqual(recovered.entries[2].covers, ['R5']);
  });

  // Fenced and indented blocks inside a criterion are requirement text: a ledger that drops them is incomplete.
  check('ticket capture keeps fenced and indented behavior blocks in criterion text', () => {
    const base = path.join(root, 'v7-fenced-capture');
    const validate = v7Validator(base);
    const epicDir = path.join(base, 'project', '_bmad-output', 'initiative-shop', 'tickets', 'epic-checkout');
    const leaf = path.join(epicDir, 'tickets', 'story-expired-card.md');
    fs.writeFileSync(
      leaf,
      [
        ...V7_LEAVES['story-expired-card.md'].slice(0, -1),
        '',
        '   ```gherkin',
        '   Then exactly one charge exists and no duplicate is possible',
        '   ```',
        '',
        '   ```json',
        '   { "status": 402, "cvv": "redacted" }',
        '   ```',
        '',
        '       audit row written with the refusal reason',
        '',
      ].join('\n'),
    );
    const tickets = epicTicketSources(path.join(base, 'project'), { ...V7_TARGET, document: path.join(epicDir, 'epic-checkout.md') });
    const [captured] = tickets.entries[1].criteria;
    for (const behavior of [
      'Then exactly one charge exists and no duplicate is possible',
      '"cvv": "redacted"',
      'audit row written with the refusal reason',
    ])
      assert.ok(captured.text.includes(behavior), `captured text keeps ${behavior}`);
    // A ledger frozen without the blocks is rejected; one carrying them is accepted.
    assert.throws(() => validate(), /shop--e1-s2--AC-1 text differs/);
    const complete = (value) => {
      value.progress.criterionLedger.find((entry) => entry.id === 'shop--e1-s2--AC-1').text = captured.text.replaceAll(/\s+/g, ' ');
    };
    assert.equal(validate(complete).summary.gate_status, 'FAIL');
    for (const behavior of ['no duplicate is possible', '"cvv": "redacted"', 'refusal reason']) {
      const dropped = (value) => {
        complete(value);
        const criterion = value.progress.criterionLedger.find((entry) => entry.id === 'shop--e1-s2--AC-1');
        criterion.text = criterion.text.replace(behavior, '');
      };
      assert.throws(() => validate(dropped), /shop--e1-s2--AC-1 text differs/, `dropping ${behavior} is rejected`);
    }
  });

  check('a v7 export over native bug, spike and plan criteria binds the complete selected criteria', () => {
    const validate = v7Validator(path.join(root, 'v7-native-export'), V7_EXPORT_EPIC, { native: true });
    const accepted = validate();
    assert.deepEqual(
      accepted.summary.oracle.rows.filter((row) => row.kind === 'exception').map((row) => [row.id, row.priority, row.exception]),
      [
        ['shop--e1-s2--AC-1', 'P1', 'invalid-link'],
        ['shop--e1-s3--verify', 'P0', 'unlinked'],
        ['shop--e1-s6--AC-2', 'P0', 'unlinked'],
      ],
    );
    const uncovered = (value) => {
      value.criterionStatus['shop--e1-s6--AC-2'] = 'NONE';
      value.status['shop--e1-s6--AC-2'] = 'NONE';
      retally(value);
    };
    // The unlinked P0 plan criterion stays in the gate: uncovered, it fails it.
    assert.equal(validate(uncovered).summary.gate_status, 'FAIL');
    const criterion = (value, id) => value.progress.criterionLedger.find((entry) => entry.id === id);
    for (const [name, mutate, message] of [
      [
        'omitted unlinked P0 plan criterion',
        (value) => {
          uncovered(value);
          value.progress.criterionLedger = value.progress.criterionLedger.filter((entry) => entry.id !== 'shop--e1-s6--AC-2');
          value.progress.oracleLedger = value.progress.oracleLedger.filter((entry) => entry.id !== 'shop--e1-s6--AC-2');
          delete value.status['shop--e1-s6--AC-2'];
          retally(value);
        },
        /criterionLedger lists 1 criteria for shop--e1-s6; the story contract selects 2 from .*story-receipt-resend-plan\.md/,
      ],
      [
        'plan criterion explicit priority lowered',
        (value) => {
          // A consistent rewrite: the exception row copies the criterion's basis, as Step 1 section E requires.
          criterion(value, 'shop--e1-s6--AC-2').priorityBasis = 'inferred';
          value.progress.oracleLedger.find((entry) => entry.id === 'shop--e1-s6--AC-2').priorityBasis = 'inferred';
          retally(value);
        },
        /criterion shop--e1-s6--AC-2 must keep the explicit priority P0 its source states/,
      ],
      [
        'plan criterion body rewritten under the same label',
        (value) => (criterion(value, 'shop--e1-s6--AC-2').text = '**Resend is rate limited** (P0): Given one resend, then it is refused'),
        /criterion shop--e1-s6--AC-2 text differs from the criterion at .*story-receipt-resend-plan\.md:17/,
      ],
      [
        'plan criterion cited at the plan history',
        (value) =>
          (criterion(value, 'shop--e1-s6--AC-1').source = citation(
            value.summary.oracle.sources[0],
            'story-receipt-resend-plan.md',
            'old build',
          )),
        /criterion shop--e1-s6--AC-1 source .*story-receipt-resend-plan\.md:23 must be .*story-receipt-resend-plan\.md:16/,
      ],
      [
        'spike criterion verify line dropped from its text',
        (value) => (criterion(value, 'shop--e1-s5--AC-1').text = '**Wallet providers are compared on order totals** (R4)'),
        /criterion shop--e1-s5--AC-1 text differs from the criterion at .*spike-wallet\.md:13/,
      ],
      [
        'bug criterion replaced by its verify line',
        (value) =>
          Object.assign(criterion(value, 'shop--e1-s4--AC-1'), {
            name: 'A declined retry keeps the cart.',
            text: 'A declined retry keeps the cart.',
            source: citation(value.summary.oracle.sources[0], 'tickets.toml', 'A declined retry keeps the cart.'),
          }),
        /no shop--e1-s4 criterion named "Declined retry keeps the cart" \(R2\) from .*bug-declined-retry\.md:17/,
      ],
    ])
      assert.throws(() => validate(mutate), message, name);
  });

  check('a numbered criterion keeps its full frozen text and its exact source line', () => {
    const base = path.join(root, 'v7-frozen-criteria');
    const validate = v7Validator(base);
    const criterion = (value, id) => value.progress.criterionLedger.find((entry) => entry.id === id);
    // The body is rewritten while the bold name, links and priority stay.
    assert.throws(
      () =>
        validate(
          (value) =>
            (criterion(value, 'shop--e1-s1--AC-1').text =
              '**Saved card payment completes the order** (R1, R3, R4) (P0): Given an empty cart, Then it is charged twice.'),
        ),
      /criterion shop--e1-s1--AC-1 text differs from the criterion at .*story-saved-card\.md:17/,
    );
    // Another file inside the epic folder holding the same name is not where the criterion starts.
    const notes = path.join(base, 'project', '_bmad-output', 'initiative-shop', 'tickets', 'epic-checkout', 'notes.md');
    fs.writeFileSync(notes, '# Notes\n\nSaved card payment completes the order\n');
    assert.throws(
      () => validate((value) => (criterion(value, 'shop--e1-s1--AC-1').source = `${notes}:3`)),
      /criterion shop--e1-s1--AC-1 source .*notes\.md:3 must be .*story-saved-card\.md:17, where "Saved card payment completes the order" starts/,
    );
    // A verify criterion cites its verify line, nowhere else.
    assert.throws(
      () =>
        validate((value) => {
          // Its exception row copies the citation, so only the ticket capture can tell.
          criterion(value, 'shop--e1-s3--verify').source = `${notes}:3`;
          value.progress.oracleLedger.find((entry) => entry.id === 'shop--e1-s3--verify').source = `${notes}:3`;
        }),
      /criterion shop--e1-s3--verify source .*notes\.md:3 must be .*tickets\.toml:\d+, its verify line/,
    );
    // An inferred priority claimed as explicit is not what the leaf states.
    assert.throws(
      () => validate((value) => (criterion(value, 'shop--e1-s1--AC-2').priorityBasis = 'explicit')),
      /criterion shop--e1-s1--AC-2 must record priorityBasis inferred; .*story-saved-card\.md:22 states no priority/,
    );
    // Formatting and whitespace are presentation: the same text with its markup dropped still binds.
    validate((value) => {
      criterion(value, 'shop--e1-s1--AC-2').text =
        'Declined card shows the decline reason (R2)\n  Given a declined saved card When the shopper pays Then the decline reason shows.';
    });
  });

  // Round 2, F2: final coverage must match the criterion mapping Step 3 persisted.
  check("final coverage reconciles with Step 3's persisted Requirement Aggregation", () => {
    const validate = v7Validator(path.join(root, 'v7-aggregation'));
    // A consistent run where the saved card criterion is unproven: R1, R3 and R4 rest on it alone and are NONE.
    const unproven = (value) => {
      value.criterionStatus['shop--e1-s1--AC-1'] = 'NONE';
      for (const id of ['shop--e1--R1', 'shop--e1--R3', 'shop--e1--R4']) value.status[id] = 'NONE';
      retally(value);
    };
    const consistent = validate(unproven);
    assert.equal(consistent.summary.gate_status, 'FAIL');
    assert.match(consistent.matrix, /^## Requirement Aggregation$/m);
    const saved = (value) => step3Aggregation({ ...value, criterionStatus: { ...value.criterionStatus } });
    for (const [name, mutate, message] of [
      [
        // The saved NONE assessment stays while both final renderings and the summary arithmetic say FULL.
        'final FULL over a saved NONE criterion',
        (value) => {
          unproven(value);
          value.aggregation = saved(value);
          value.criterionStatus['shop--e1-s1--AC-1'] = 'FULL';
          for (const id of ['shop--e1--R1', 'shop--e1--R3', 'shop--e1--R4']) value.status[id] = 'FULL';
          value.missing = {};
          retally(value);
        },
        /final coverage gives criterion shop--e1-s1--AC-1 FULL, but Step 3's Requirement Aggregation assessed it NONE/,
      ],
      [
        'final drops a missing behavior Step 3 recorded',
        (value) => {
          value.aggregation = saved(value);
          value.status['shop--e1--R3'] = 'FULL';
          value.missing = {};
          retally(value);
        },
        /gate row shop--e1--R3 is FULL, but Step 3's Requirement Aggregation makes it PARTIAL/,
      ],
      [
        'final rewords a missing behavior',
        (value) => {
          value.aggregation = saved(value);
          value.missing = { 'shop--e1--R3': ['an invoice is printed'] };
          retally(value);
        },
        /requirement shop--e1--R3 missing_behaviors differ from Step 3's persisted missingBehaviors/,
      ],
      [
        'final exception row contradicts its saved criterion',
        (value) => {
          value.aggregation = saved(value);
          value.aggregation.criterionMatrix.find((row) => row.id === 'shop--e1-s3--verify').coverage = 'NONE';
          value.aggregation.traceabilityMatrix.find((row) => row.id === 'shop--e1-s3--verify').coverage = 'NONE';
        },
        /final coverage gives criterion shop--e1-s3--verify FULL, but Step 3's Requirement Aggregation assessed it NONE/,
      ],
      [
        'saved requirement row contradicts AC5',
        (value) => {
          value.aggregation = saved(value);
          value.aggregation.traceabilityMatrix.find((row) => row.id === 'shop--e1--R3').coverage = 'FULL';
        },
        /Step 3 requirement shop--e1--R3 is FULL, but its contributors and missingBehaviors make it PARTIAL/,
      ],
      [
        'saved contributor differs from its criterion row',
        (value) => {
          value.aggregation = saved(value);
          value.aggregation.traceabilityMatrix.find((row) => row.id === 'shop--e1--R2').contributors[0].coverage = 'NONE';
        },
        /Step 3 requirement shop--e1--R2 gives contributor shop--e1-s1--AC-2 NONE, but its criterionMatrix row is FULL/,
      ],
      [
        'saved mapping omits a criterion',
        (value) => {
          value.aggregation = saved(value);
          value.aggregation.criterionMatrix.pop();
        },
        /Step 3 criterionMatrix omits criterion shop--e1-s3--verify/,
      ],
      [
        'saved mapping names a criterion the ledger does not hold',
        (value) => {
          value.aggregation = saved(value);
          value.aggregation.criterionMatrix.push({ id: 'shop--e1-s9--AC-1', coverage: 'FULL' });
        },
        /Step 3 criterionMatrix row shop--e1-s9--AC-1 is not a criterionLedger record/,
      ],
      [
        'saved gate rows out of ledger order',
        (value) => {
          value.aggregation = saved(value);
          value.aggregation.traceabilityMatrix.reverse();
        },
        /Step 3 traceabilityMatrix\[0\] must be requirement row shop--e1--R1, in oracleLedger order/,
      ],
    ])
      assert.throws(() => validate(mutate), message, name);
    // Step 5 replaced the body and dropped the block, or it was never written.
    for (const [name, rewriteMatrix, message] of [
      [
        'missing block',
        (matrix) => matrix.slice(0, matrix.indexOf('## Requirement Aggregation')),
        /must keep Step 3's Requirement Aggregation block/,
      ],
      ['block without json', (matrix) => matrix.replace('```json', '```text'), /must keep Step 3's Requirement Aggregation block/],
      [
        'unreadable block',
        (matrix) => matrix.replace('"criterionMatrix"', 'criterionMatrix'),
        /Requirement Aggregation block is not valid JSON/,
      ],
    ])
      assert.throws(() => validate(() => {}, { rewriteMatrix }), message, name);
  });

  // Live run, epic shop--e1: an exception row froze the criterion's full Given/When/Then text while the
  // detail heading carried only its bold name, so table and detail disagreed.
  check('an exception row names its criterion by bold name in the ledger, the table cell and the heading', () => {
    const validate = v7Validator(path.join(root, 'v7-exception-name'));
    const accepted = validate();
    const saved = yaml.load(accepted.matrix.match(/^---\n([\s\S]*?)\n---/)[1]);
    assert.equal(saved.oracleLedger.find((row) => row.id === 'shop--e1-s2--AC-1').requirement, 'Expired card is refused before charging');
    assert.match(accepted.matrix, /^\| shop--e1-s2--AC-1 \| Expired card is refused before charging \| P1 \| FULL \|$/m);
    assert.match(accepted.matrix, /^### shop--e1-s2--AC-1 \(P1\): Expired card is refused before charging$/m);
    // The live run's shape: ledger and table freeze the full text, the heading names the criterion.
    assert.throws(
      () =>
        validate(
          (value) => {
            const text = value.progress.criterionLedger.find((entry) => entry.id === 'shop--e1-s2--AC-1').text;
            value.progress.oracleLedger.find((row) => row.id === 'shop--e1-s2--AC-1').requirement = text;
          },
          {
            rewriteMatrix: (matrix) =>
              matrix.replace(/^### shop--e1-s2--AC-1 \(P1\): .*$/m, '### shop--e1-s2--AC-1 (P1): Expired card is refused before charging'),
          },
        ),
      /exception row shop--e1-s2--AC-1 requirement must be its criterion's name "Expired card is refused before charging"/,
    );
    // A heading whose text genuinely differs from the ledger name still fails.
    assert.throws(
      () =>
        validate(() => {}, {
          rewriteMatrix: (matrix) =>
            matrix.replace(
              '### shop--e1-s2--AC-1 (P1): Expired card is refused before charging',
              '### shop--e1-s2--AC-1 (P1): Expired card is refused',
            ),
        }),
      /criterion shop--e1-s2--AC-1 table and detail requirement text disagree/,
    );
    // So does a table cell that differs while the heading matches.
    assert.throws(
      () =>
        validate(() => {}, {
          rewriteMatrix: (matrix) =>
            matrix.replace(
              '| shop--e1-s2--AC-1 | Expired card is refused before charging |',
              '| shop--e1-s2--AC-1 | Expired card is refused before charging (R2, R9) |',
            ),
        }),
      /criterion shop--e1-s2--AC-1 table and detail requirement text disagree/,
    );
    // A heading carrying the priority basis is not the `(P<n>)` form; with no table to fall back on, the row is missing.
    assert.throws(
      () =>
        validate(() => {}, {
          rewriteMatrix: (matrix) =>
            matrix
              .replace(
                '### shop--e1-s2--AC-1 (P1): Expired card is refused before charging',
                '### shop--e1-s2--AC-1 (P1, inferred): Expired card is refused before charging',
              )
              .replace(/^\| shop--e1-s2--AC-1 \|.*\n/m, ''),
        }),
      /criterion shop--e1-s2--AC-1 differs from its frozen oracle priority or is missing/,
    );
  });

  // Live run, epic shopb--e1: no story covers R1, so its summary row lists no contributors and the matrix
  // needs no contributors table.
  check('a requirement with no contributors needs no contributors table', () => {
    const validate = v7Validator(path.join(root, 'v7-no-contributors'));
    const accepted = validate();
    const r5 = accepted.matrix.slice(accepted.matrix.indexOf('### shop--e1--R5'), accepted.matrix.indexOf('### shop--e1-s2--AC-1'));
    assert.match(r5, /- \*\*Contributors:\*\* none/);
    assert.doesNotMatch(r5, /\| Contributor \|/);
    assert.deepEqual(accepted.summary.oracle.rows.find((row) => row.id === 'shop--e1--R5').contributors, []);
    const r5Table = (rows) => (matrix) =>
      matrix.replace(
        '- **Contributors:** none',
        `- **Contributors:**\n\n| Contributor | Story | Status | Tests |\n| --- | --- | --- | --- |\n${rows}`,
      );
    // An explicit empty table and the live run's placeholder row both list no contributor.
    validate(() => {}, { rewriteMatrix: r5Table('') });
    validate(() => {}, { rewriteMatrix: r5Table('| none | none | none | none |\n') });
    // A table that lists a contributor the summary row does not still fails.
    assert.throws(
      () => validate(() => {}, { rewriteMatrix: r5Table('| shop--e1-s1--AC-1 | shop--e1-s1 | FULL | 1.1-LIVE-001 |\n') }),
      /matrix contributors table for shop--e1--R5 disagrees with its summary row/,
    );
    // And a requirement with contributors still needs its table.
    assert.throws(
      () =>
        validate(() => {}, {
          rewriteMatrix: (matrix) =>
            matrix.replace(/(### shop--e1--R2 [\s\S]*?)- \*\*Contributors:\*\*\n\n\|[\s\S]*?\n\n/, '$1- **Contributors:** none\n\n'),
        }),
      /matrix contributors table for shop--e1--R2 disagrees with its summary row/,
    );
  });

  // Live run, story leaf shop--e1-s1 (criterion oracle): the ledger froze the full criterion text and the
  // heading read `AC-1: Order number shown (R1) (P0, inferred)`.
  check('a v7 story leaf trace names each numbered criterion by its bold name', () => {
    const projectRoot = path.join(root, 'v7-leaf-names', 'project');
    const epic = writeV7Tree(projectRoot);
    const leaf = path.join(path.dirname(epic), 'tickets', 'story-saved-card.md');
    const target = { ...resolveTraceTarget({ projectRoot, target: leaf }), document: leaf };
    assert.equal(target.runKey, 'story-shop--e1-s1');
    const sourceLedger = sourceOracleLedger(fs.readFileSync(leaf, 'utf8'), leaf, target);
    assert.deepEqual(sourceLedger, []);
    const criteria = [
      { id: 'AC-1', name: 'Saved card payment completes the order', links: 'R1, R3, R4', priority: 'P0', basis: 'explicit' },
      { id: 'AC-2', name: 'Declined card shows the decline reason', links: 'R2', priority: 'P1', basis: 'inferred' },
    ];
    let variant = 0;
    const validateLeaf = ({ requirement = (criterion) => criterion.name, heading } = {}) => {
      const oracleLedger = criteria.map((criterion) => ({
        id: criterion.id,
        requirement: requirement(criterion),
        priority: criterion.priority,
        source: `${leaf}:${V7_LEAVES['story-saved-card.md'].findIndex((line) => line.includes(criterion.name)) + 1}`,
      }));
      const paths = tracePaths(path.join(root, 'v7-leaf-names', 'runs', String(variant++)), target.runKey);
      fs.mkdirSync(path.dirname(paths.matrix), { recursive: true });
      const progress = {
        runKey: target.runKey,
        runScope: target.runScope,
        workflowStatus: 'completed',
        lastStep: 'step-05-gate-decision',
        stepsCompleted: [
          'step-01-load-context',
          'step-02-discover-tests',
          'step-03-map-criteria',
          'step-04-analyze-gaps',
          'step-05-gate-decision',
        ],
        oracleGranularity: 'criteria',
        oracleLedger,
      };
      const details = criteria.flatMap((criterion, index) => [
        heading ? heading(criterion) : `#### ${criterion.id} (${criterion.priority}): ${oracleLedger[index].requirement}`,
        '',
        '- **Coverage:** FULL',
        `- **Priority basis:** ${criterion.basis}`,
        `- **Links:** ${criterion.links}`,
        '',
      ]);
      fs.writeFileSync(paths.matrix, [`---\n${yaml.dump(progress, { lineWidth: -1 })}---`, '', '# Trace', '', ...details].join('\n'));
      const breakdown = {
        P0: { total: 1, covered: 1, pct: 100 },
        P1: { total: 1, covered: 1, pct: 100 },
        P2: { total: 0, covered: 0, pct: 100 },
        P3: { total: 0, covered: 0, pct: 100 },
      };
      const summary = {
        schema_version: '0.3.0',
        snapshot_at: '2026-10-30T00:00:00.000Z',
        collection_mode: 'contract_static',
        collection_status: 'COLLECTED',
        decision_mode: 'deterministic',
        target: { type: 'story', id: target.id },
        repo: 'trace-v7-fixture',
        source_sha: 'unknown',
        evaluator: 'test',
        confidence: 'high',
        inventory_basis: 'acceptance_criteria',
        oracle: { resolution_mode: 'formal_requirements', confidence: 'high', sources: [leaf], synthetic: false, granularity: 'criteria' },
        gate_basis: 'priority_thresholds',
        gate_status: 'PASS',
        gate_criteria: {
          p0_coverage_required: '100%',
          p0_coverage_actual: '100%',
          p0_status: 'MET',
          p1_coverage_target: '90%',
          p1_coverage_minimum: '80%',
          p1_coverage_actual: '100%',
          p1_status: 'MET',
          overall_coverage_minimum: '80%',
          overall_coverage_actual: '100%',
          overall_status: 'MET',
        },
        coverage: {
          inventory: { total: 2, covered: 2, pct: 100 },
          priority_breakdown: breakdown,
          by_level: Object.fromEntries(
            ['e2e', 'api', 'component', 'unit', 'live', 'other'].map((level) => [
              level,
              { tests: level === 'api' ? 2 : 0, criteria_covered: level === 'api' ? 2 : 0 },
            ]),
          ),
        },
        tests: { files: 1, cases: 2, skipped_cases: 0, fixme_cases: 0, pending_cases: 0 },
        risk_summary: { critical_open: 0, high_open: 0, medium_open: 0, low_open: 0 },
        live_evidence: { requirements_live_only: 0 },
        blockers: [],
        recommendations: [],
        rejected_evidence: [],
        links: { trace_report_path: paths.matrix },
      };
      fs.writeFileSync(paths.summary, JSON.stringify(summary));
      fs.writeFileSync(
        paths.gate,
        JSON.stringify({
          schema_version: '0.1.0',
          evaluated_at: summary.snapshot_at,
          target: summary.target,
          gate_status: 'PASS',
          collection_status: 'COLLECTED',
          gate_basis: summary.gate_basis,
          rationale: 'Fixture decision',
          critical_open: 0,
          p0_status: 'MET',
          p1_status: 'MET',
          overall_status: 'MET',
          links: summary.links,
        }),
      );
      return validateTraceOutputs({
        paths,
        target,
        collectionMode: 'contract_static',
        allowGate: true,
        oracleLedger: sourceLedger,
        requireOracleLedger: true,
      });
    };
    assert.equal(validateLeaf().summary.gate_status, 'PASS');
    // The live run's shape: the ledger froze the full text and the heading appended its links and basis.
    const fullText = (criterion) =>
      V7_LEAVES['story-saved-card.md']
        .slice(V7_LEAVES['story-saved-card.md'].findIndex((line) => line.includes(criterion.name)))
        .slice(0, 4)
        .map((line) => line.trim().replace(/^\d+\.\s*/, ''))
        .join(' ');
    assert.throws(
      () =>
        validateLeaf({
          requirement: fullText,
          heading: (criterion) =>
            `#### ${criterion.id}: ${criterion.name} (${criterion.links}) (${criterion.priority}, ${criterion.basis})`,
        }),
      /Trace criterion AC-1 changed its frozen requirement text in the matrix/,
    );
    // A heading whose text genuinely differs from the ledger name still fails.
    assert.throws(
      () =>
        validateLeaf({ heading: (criterion) => `#### ${criterion.id} (${criterion.priority}): ${criterion.name} (${criterion.links})` }),
      /Trace criterion AC-1 changed its frozen requirement text in the matrix/,
    );
  });

  check('requirement text with literal asterisks and backticks reconciles end to end', () => {
    const epic = V7_EXPORT_EPIC.replace(
      'R4 (parent R3): An order total matches the priced cart.',
      'R4 (parent R3): The *.json export totals 2 * 3 lines and keeps `*` literal.',
    );
    const validate = v7Validator(path.join(root, 'v7-literal'), epic);
    const accepted = validate();
    const saved = yaml.load(accepted.matrix.match(/^---\n([\s\S]*?)\n---/)[1]).oracleLedger.find((row) => row.id === 'shop--e1--R4');
    assert.equal(saved.requirement, 'The *.json export totals 2 * 3 lines and keeps `*` literal.');
    assert.throws(
      () =>
        validate((value) => {
          value.progress.oracleLedger.find((row) => row.id === 'shop--e1--R4').requirement =
            'The .json export totals 2 3 lines and keeps  literal.';
        }),
      /requirement shop--e1--R4 changed its frozen requirement text/,
    );
  });

  check('requirement-oracle live records resolve through one alias map before failure grouping', () => {
    const criteria = ['shop--e1-s1--AC-1', 'shop--e1-s1--AC-2', 'shop--e1-s2--AC-1', 'shop--e1-s3--verify'];
    const requirements = ['shop--e1--R1', 'shop--e1--R2', 'shop--e1--R3', 'shop--e1--R4'];
    const aliases = liveAliasMap(criteria, requirements);
    assert.deepEqual(aliases.get('shop--e1-s1--AC-2'), { id: 'shop--e1-s1--AC-2' });
    assert.deepEqual(aliases.get('AC-2'), { id: 'shop--e1-s1--AC-2' });
    assert.deepEqual(aliases.get('verify'), { id: 'shop--e1-s3--verify' });
    assert.deepEqual(aliases.get('AC-1'), { reason: 'ambiguous-local-id', carriers: ['shop--e1-s1--AC-1', 'shop--e1-s2--AC-1'] });
    assert.deepEqual(aliases.get('shop--e1--R1'), { reason: 'requirement-row' });
    assert.deepEqual(aliases.get('R1'), { reason: 'requirement-row' });
    const sha = 'a'.repeat(40);
    const stale = 'b'.repeat(40);
    const live = (results) => liveReference({ manifest: { schema_version: '0.1.0', source_sha: sha, results }, currentSha: sha }, aliases);
    const record = (id, requirement, status = 'pass', extra = {}) => ({ id, requirement_id: requirement, status, ...extra });
    const outcome = live([
      record('L-1', 'shop--e1-s3--verify'),
      record('L-2', 'AC-2'),
      record('L-3', 'AC-1'),
      record('L-4', 'shop--e1--R1'),
      record('L-5', 'R2'),
      record('L-6', 'AC-9'),
    ]);
    assert.deepEqual(
      outcome.records.map((row) => [row.supplied_requirement_id, row.requirement_id, row.disposition, row.reason]),
      [
        ['shop--e1-s3--verify', 'shop--e1-s3--verify', 'counted', null],
        ['AC-2', 'shop--e1-s1--AC-2', 'counted', null],
        ['AC-1', 'AC-1', 'unmatched', 'ambiguous-local-id'],
        ['shop--e1--R1', 'shop--e1--R1', 'unmatched', 'requirement-row'],
        ['R2', 'R2', 'unmatched', 'requirement-row'],
        ['AC-9', 'AC-9', 'unmatched', 'unknown-id'],
      ],
    );
    for (const [pass, fail] of [
      ['shop--e1-s1--AC-2', 'AC-2'],
      ['AC-2', 'shop--e1-s1--AC-2'],
    ]) {
      const contradicted = live([record('L-1', pass), record('L-2', fail, 'fail')]);
      assert.deepEqual(
        contradicted.records.map((row) => row.disposition),
        ['contradicted', 'fail'],
        `${pass} pass with ${fail} fail`,
      );
      assert.deepEqual([contradicted.failed, contradicted.freshFailed], [1, 1]);
    }
    // Invalid and stale precedence survive aliasing.
    const precedence = live([
      record('L-1', 'AC-2', 'pass', { source_sha: stale }),
      record('L-1', 'AC-2'),
      record('L-2', 'AC-2', 'blocked'),
    ]);
    assert.deepEqual(
      precedence.records.map((row) => row.disposition),
      ['stale', 'invalid', 'blocked'],
    );
    // The criterion oracle keeps exact identity matching.
    assert.equal(
      liveReference(
        { manifest: { schema_version: '0.1.0', source_sha: sha, results: [record('L-1', 'AC-2')] }, currentSha: sha },
        new Map([['AC-1', { id: 'AC-1' }]]),
      ).records[0].disposition,
      'unmatched',
    );

    // validateTraceOutputs applies the same map: freshness follows canonical dispositions.
    const v7 = v7Validator(path.join(root, 'v7-live'));
    const validate = (results, liveEvidence) =>
      v7((value) => Object.assign(value.summary.live_evidence, { present: true, current_source_sha: sha, ...liveEvidence }), {
        liveCapture: { manifest: { schema_version: '0.1.0', source_sha: sha, results }, currentSha: sha },
      });
    const staleRequirement = record('L-9', 'shop--e1--R1', 'pass', { source_sha: stale });
    // A unique local pass counts, so a stale record beside it leaves the evidence mixed.
    validate([record('L-1', 'AC-2'), staleRequirement], { freshness: 'mixed', failed: 0, fresh_failed: 0 });
    assert.throws(
      () => validate([record('L-1', 'AC-2'), staleRequirement], { freshness: 'stale', failed: 0, fresh_failed: 0 }),
      /live evidence freshness differs/,
    );
    for (const [pass, fail] of [
      ['shop--e1-s1--AC-2', 'AC-2'],
      ['AC-2', 'shop--e1-s1--AC-2'],
    ]) {
      const results = [record('L-1', pass), record('L-2', fail, 'fail'), staleRequirement];
      validate(results, { freshness: 'stale', failed: 1, fresh_failed: 1 });
      assert.throws(() => validate(results, { freshness: 'mixed', failed: 1, fresh_failed: 1 }), /live evidence freshness differs/);
    }
  });

  check('prompt inspection requires no agent and does not replace reports', () => {
    assert.equal(run('pass').status, 0);
    const file = path.join(root, 'artifacts', 'trace', 'e2e-trace-summary-epic-4.json');
    const before = fs.readFileSync(file, 'utf8');
    const result = spawnSync(process.execPath, [cli, '--project-root', root, '--target', 'docs/epic-4-export.md', '--agent', 'none'], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Resolved identity:.*epic-4/);
    assert.equal(fs.readFileSync(file, 'utf8'), before);
  });
  process.stdout.write(`${checks} trace CLI checks passed.\n`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
