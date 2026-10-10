#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const prompt = fs.readFileSync(0, 'utf8');
const mode = process.env.TEA_TRACE_TEST_STUB_MODE ?? 'pass';
const counter = path.join(process.cwd(), 'agent-attempts.json');
const attempt = fs.existsSync(counter) ? JSON.parse(fs.readFileSync(counter, 'utf8')) + 1 : 1;
fs.writeFileSync(counter, JSON.stringify(attempt));
const quoted = '"(?:[^"\\\\]|\\\\.)*"';
const capture = (pattern) => JSON.parse(prompt.match(new RegExp(pattern))[1]);
const matrixPath = capture(`Resolve \\{outputFile\\} and \\{default_output_file\\} to (${quoted})`);
const summaryPath = capture(`\\{e2e_trace_summary_output\\} to (${quoted})`);
const gatePath = capture(`\\{gate_decision_output\\} to (${quoted})`);
const identity = JSON.parse(prompt.match(/Resolved identity: (\{.*\})\. Preserve/)[1]);
const collection = capture(`Resolve \\{collection_mode\\} to (${quoted})`);
const allowGate = prompt.match(/\{allow_gate\} to (true|false)/)[1] === 'true';
if (mode === 'retry' && attempt === 1) {
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, '{"stale":true}');
  process.stderr.write('temporary transport failure\n');
  process.exit(1);
}
if (mode === 'fail-agent') process.exit(1);
const gateStatus = mode === 'gap' ? 'FAIL' : mode === 'concerns' ? 'CONCERNS' : 'PASS';
const pct = mode === 'gap' ? 0 : 100;
const inventory = { total: 1, covered: mode === 'gap' ? 0 : 1, pct };
const snapshot = '2026-10-09T00:00:00.000Z';
const eligible = allowGate && ['contract_static', 'runtime_manifest'].includes(collection);
const summary = {
  schema_version: '0.3.0', snapshot_at: snapshot, collection_mode: collection,
  collection_status: ({ waived: 'WAIVED', restricted: 'RESTRICTED', inaccessible: 'INACCESSIBLE', deferred_shared: 'DEFERRED_SHARED' })[collection] ?? 'COLLECTED',
  decision_mode: 'deterministic', target: { type: identity.type, id: identity.id },
  repo: 'trace-cli-fixture', source_sha: 'unknown', evaluator: 'test agent', confidence: 'high', inventory_basis: 'acceptance_criteria',
  oracle: { resolution_mode: 'formal_requirements', confidence: 'high', sources: [identity.document], synthetic: false },
  gate_basis: eligible ? 'priority_thresholds' : 'none',
  coverage: {
    inventory,
    priority_breakdown: { P0: inventory, P1: { total: 0, covered: 0, pct: 100 }, P2: { total: 0, covered: 0, pct: 100 }, P3: { total: 0, covered: 0, pct: 100 } },
    by_level: Object.fromEntries(['e2e', 'api', 'component', 'unit', 'live', 'other'].map((level) => [level, { tests: level === 'api' ? 1 : 0, criteria_covered: level === 'api' && pct === 100 ? 1 : 0 }])),
  },
  tests: { files: 1, cases: 1, skipped_cases: 0, pending_cases: 0, fixme_cases: 0 },
  risk_summary: { critical_open: pct === 0 ? 1 : 0, high_open: 0, medium_open: 0, low_open: 0 }, live_evidence: {},
  blockers: [], recommendations: [], rejected_evidence: [], links: { trace_report_path: matrixPath },
};
if (eligible) {
  summary.gate_status = gateStatus;
  summary.gate_criteria = {
    p0_coverage_required: '100%', p0_coverage_actual: `${pct}%`, p0_status: pct === 100 ? 'MET' : 'NOT_MET',
    p1_coverage_target: '90%', p1_coverage_minimum: '80%', p1_coverage_actual: '100%', p1_status: 'MET',
    overall_coverage_minimum: '80%', overall_coverage_actual: `${pct}%`, overall_status: pct === 100 ? 'MET' : 'NOT_MET',
  };
}
if (mode === 'bad-arithmetic') summary.coverage.inventory = { ...inventory, pct: 37 };
if (mode === 'wrong-target') summary.target.id = '99';
if (mode === 'bad-confidence') summary.confidence = 'auto';
if (mode === 'bad-collection') summary.collection_status = 'UNKNOWN';
if (mode === 'automated-waiver') summary.gate_status = 'WAIVED';
if (mode === 'missing-criteria') delete summary.gate_criteria;
fs.mkdirSync(path.dirname(matrixPath), { recursive: true });
const progress = mode === 'incomplete' ? 'in-progress' : 'completed';
fs.writeFileSync(matrixPath, `---\nrunKey: ${identity.runKey}\nrunScope: ${identity.runScope}\nworkflowStatus: ${progress}\nlastStep: step-05-gate-decision\nstepsCompleted: [step-01-load-context, step-02-discover-tests, step-03-map-criteria, step-04-analyze-gaps, step-05-gate-decision]\n---\n\n# Trace\n\n### AC-1: Example\n\n- **Coverage:** ${pct ? 'FULL' : 'NONE'}\n`);
if (mode !== 'missing-summary') fs.writeFileSync(summaryPath, JSON.stringify(summary));
if (eligible && mode !== 'missing-gate') {
  fs.writeFileSync(gatePath, JSON.stringify({ schema_version: '0.1.0', evaluated_at: snapshot, target: summary.target, gate_status: mode === 'contradictory-gate' ? 'FAIL' : gateStatus, collection_status: summary.collection_status, gate_basis: summary.gate_basis, rationale: 'Fixture decision', critical_open: summary.risk_summary.critical_open, p0_status: summary.gate_criteria?.p0_status, p1_status: summary.gate_criteria?.p1_status, overall_status: summary.gate_criteria?.overall_status, links: summary.links }));
}
process.stdout.write('trace fixture agent completed\n');
