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
const pct = ['gap', 'wrong-verdict'].includes(mode) ? 0 : 100;
const inventory = { total: 1, covered: pct === 0 ? 0 : 1, pct };
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
  risk_summary: { critical_open: pct === 0 ? 1 : 0, high_open: 0, medium_open: 0, low_open: 0 }, live_evidence: { requirements_live_only: 0 },
  blockers: [], recommendations: [], rejected_evidence: [], links: { trace_report_path: matrixPath },
};
if (mode === 'concerns') {
  summary.confidence = 'medium';
  summary.oracle.confidence = 'medium';
  summary.oracle.synthetic = true;
  summary.oracle.resolution_mode = 'synthetic_source';
  summary.inventory_basis = 'synthetic_requirements';
}
if (eligible) {
  summary.gate_status = gateStatus;
  summary.gate_criteria = {
    p0_coverage_required: '100%', p0_coverage_actual: `${pct}%`, p0_status: pct === 100 ? 'MET' : 'NOT_MET',
    p1_coverage_target: '90%', p1_coverage_minimum: '80%', p1_coverage_actual: '100%', p1_status: 'MET',
    overall_coverage_minimum: '80%', overall_coverage_actual: `${pct}%`, overall_status: pct === 100 ? 'MET' : 'NOT_MET',
  };
}
if (mode === 'bad-arithmetic') summary.coverage.inventory = { ...inventory, pct: 37 };
if (mode === 'contradictory-percent') {
  summary.coverage.inventory = { total: 1, covered: 0, pct: 0 };
  summary.coverage.priority_breakdown.P0 = { total: 1, covered: 0, pct: 0 };
  summary.coverage.by_level.api.criteria_covered = 0;
  summary.risk_summary.critical_open = 1;
}
if (mode === 'wrong-priority-total') summary.coverage.inventory = { total: 2, covered: 2, pct: 100 };
if (mode === 'wrong-priority-covered') {
  summary.coverage.inventory = { total: 2, covered: 2, pct: 100 };
  summary.coverage.priority_breakdown.P0 = { total: 2, covered: 1, pct: 50 };
}
if (mode === 'wrong-threshold') summary.gate_criteria.p0_coverage_required = '0%';
if (mode === 'ignored-confidence') {
  summary.confidence = 'medium';
  summary.oracle.confidence = 'medium';
  summary.oracle.synthetic = true;
}
if (mode === 'ignored-live-only') summary.live_evidence.requirements_live_only = 1;
if (mode === 'missing-live-only') delete summary.live_evidence.requirements_live_only;
if (mode === 'ignored-synthetic-basis') {
  summary.inventory_basis = 'synthetic_requirements';
  summary.confidence = 'medium';
  summary.oracle.confidence = 'medium';
}
if (mode === 'contradictory-critical-gaps') summary.risk_summary.critical_open = 1;
if (mode === 'wrong-target') summary.target.id = '99';
if (mode === 'bad-confidence') summary.confidence = 'auto';
if (mode === 'bad-collection') summary.collection_status = 'UNKNOWN';
if (mode === 'automated-waiver') summary.gate_status = 'WAIVED';
if (mode === 'missing-criteria') delete summary.gate_criteria;
fs.mkdirSync(path.dirname(matrixPath), { recursive: true });
const progress = mode === 'incomplete' ? 'in-progress' : 'completed';
fs.writeFileSync(matrixPath, `---\nrunKey: ${identity.runKey}\nrunScope: ${identity.runScope}\nworkflowStatus: ${progress}\nlastStep: step-05-gate-decision\nstepsCompleted: [step-01-load-context, step-02-discover-tests, step-03-map-criteria, step-04-analyze-gaps, step-05-gate-decision]\n---\n\n# Trace\n\n### AC-1: Example (P0)\n\n- **Coverage:** ${pct ? 'FULL' : 'NONE'}\n`);
if (mode !== 'missing-summary') fs.writeFileSync(summaryPath, JSON.stringify(summary));
if (eligible && mode !== 'missing-gate') {
  fs.writeFileSync(gatePath, JSON.stringify({ schema_version: '0.1.0', evaluated_at: snapshot, target: summary.target, gate_status: mode === 'contradictory-gate' ? 'FAIL' : gateStatus, collection_status: summary.collection_status, gate_basis: summary.gate_basis, rationale: 'Fixture decision', critical_open: summary.risk_summary.critical_open, p0_status: summary.gate_criteria?.p0_status, p1_status: summary.gate_criteria?.p1_status, overall_status: summary.gate_criteria?.overall_status, links: summary.links }));
}
if (mode.startsWith('late-json-')) {
  fs.linkSync(identity.document, path.join(process.cwd(), 'late-result.json'));
  if (mode === 'late-json-failure') process.exit(1);
}
if (mode === 'late-artifact-alias') {
  const published = path.join(process.cwd(), 'artifacts', 'trace', path.basename(matrixPath));
  fs.mkdirSync(path.dirname(published), { recursive: true });
  fs.linkSync(identity.document, published);
}
if (mode === 'late-artifact-escape') {
  const published = path.join(process.cwd(), 'artifacts', 'trace', path.basename(matrixPath));
  fs.mkdirSync(path.dirname(published), { recursive: true });
  fs.symlinkSync(path.join(`${process.cwd()}-outside`, 'sentinel.md'), published);
}
if (mode === 'late-artifact-pair') {
  const published = path.join(process.cwd(), 'artifacts', 'trace', path.basename(matrixPath));
  fs.mkdirSync(path.dirname(published), { recursive: true });
  fs.writeFileSync(published, '# Agent-created matrix sentinel');
  fs.linkSync(published, path.join(path.dirname(published), path.basename(summaryPath)));
}
if (mode === 'matrix-contradiction') fs.writeFileSync(matrixPath, fs.readFileSync(matrixPath, 'utf8').replace('FULL', 'NONE'));
if (mode === 'matrix-missing-priority') fs.writeFileSync(matrixPath, fs.readFileSync(matrixPath, 'utf8').replace(' (P0)', ''));
if (mode === 'matrix-duplicate') fs.appendFileSync(matrixPath, '\n### AC-1: Duplicate (P0)\n\n- **Coverage:** FULL\n');
if (mode.startsWith('attempt-')) {
  const old = mode === 'attempt-outside-link' ? `${process.cwd()}-old-matrix.md` : path.join(process.cwd(), 'old-matrix.md');
  fs.copyFileSync(matrixPath, old);
  fs.utimesSync(old, new Date(0), new Date(0));
  fs.unlinkSync(matrixPath);
  if (mode === 'attempt-hardlink') fs.linkSync(old, matrixPath);
  else fs.symlinkSync(old, matrixPath);
}
if (mode === 'partial-publication') fs.mkdirSync(path.join(process.cwd(), 'artifacts', 'trace', path.basename(summaryPath)), { recursive: true });
process.stdout.write('trace fixture agent completed\n');
