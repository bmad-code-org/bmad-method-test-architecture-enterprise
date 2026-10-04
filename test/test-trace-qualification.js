/**
 * A trace probe claims `rollbackVerified: true` only after the mutation it describes was qualified in a
 * disposable copy (Story 1.99, AD-8).
 *
 * `tools/generate-probes.js` used to state the claim as a constant for the three coverage gaps of the
 * seeded set, each citing the clean set's summary and the seeded set's own, which are summaries of two
 * different epics. The mutation of each gap now withholds it from the stored correct summary of the
 * seeded set (`test/replay/trace/seeded-correct-run/`): the criterion's priority band reads as covered,
 * and the arm resolves the oracle that reads the summary's priority breakdown over the summary the
 * workspace holds, through `test/lib/probe-qualification.js`. The checks every corpus shares (the
 * performed sequence, each failing step, the generator over failures) are
 * `test/lib/qualification-suite.js`; this suite adds what is the trace corpus's own:
 *
 * - Each twin under `test/fixtures/probe-mutants/trace/` is the stored summary with the gap's band read as covered and the
 *   numbers the summary derives from it moved with it, and nothing else. The suite reads each twin from the path the
 *   builder's emitted probe cites and lists the leaf paths it differs from the summary at: the inventory's covered count
 *   and percentage, the gap's band, and the gate criteria that read the inventory. The P0 twin (AC-2) also carries the
 *   gate the P0 band decides (`gate_status`, the P0 criteria, the recommendation that named the gap), so it does not
 *   contradict itself. Every twin's gate decision and criteria equal what the gate rules derive from the twin's own
 *   numbers, and the stored summary's do too.
 * - The shared kit asserts which oracles flip: the breakdown oracle and the inventory oracle for each twin, the gate
 *   criteria oracle beside them (the criteria read the inventory), and the gate oracle itself for the P0 twin only.
 * - The gate oracle (`gate_status` equals FAIL) cannot serve as the arm of the P2 and P3 gaps: AC-2 holds the P0 band
 *   at 50%, so withholding AC-8 or AC-10 leaves the gate at FAIL. That is why those probes name the breakdown oracle and
 *   the P0 probe names the gate oracle, and a change that points them elsewhere stops the generator.
 *
 * Usage: node test/test-trace-qualification.js
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { buildTraceProbes } = require('../tools/generate-probes');
const { isDeepStrictEqual } = require('node:util');

const { changedJsonPaths, exitWith, runQualificationSuite } = require('./lib/qualification-suite');

const PROJECT_ROOT = path.join(__dirname, '..');
const REFERENCE = path.join(
  PROJECT_ROOT,
  'test',
  'replay',
  'trace',
  'seeded-correct-run',
  'test-artifacts',
  'trace',
  'e2e-trace-summary-epic-4.json',
);
const TWINS = path.join(PROJECT_ROOT, 'test', 'fixtures', 'probe-mutants', 'trace');
const GROUND_TRUTH = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'test', 'fixtures', 'trace-eval', 'ground-truth.json'), 'utf8'));
const SEEDED = GROUND_TRUTH.fixtureSets.find((set) => set.id.startsWith('seeded'));
const GAPS = SEEDED.criteria.filter((criterion) => criterion.trueCoverage !== 'FULL');
const BREAKDOWN_ORACLE = 'O-004';
const GATE_ORACLE = 'O-001';

const twinOf = (id) => path.join(TWINS, id.toLowerCase(), path.basename(REFERENCE));

/** The percentage the summary derives (`Math.round(covered / total * 100)`, and 100 for an empty band), as the skill's own arithmetic. */
const pct = ({ covered, total }) => (total === 0 ? 100 : Math.round((covered / total) * 100));

/** The gate decision and criteria the skill's rules 1 to 5 derive from a summary's own bands (step-05, `skillRuleCitations.gateRule*`). */
function gateOf(summary) {
  const p0 = pct(summary.coverage.priority_breakdown.P0);
  const p1 = pct(summary.coverage.priority_breakdown.P1);
  const overall = pct(summary.coverage.inventory);
  const decision = p0 < 100 || overall < 80 || p1 < 80 ? 'FAIL' : p1 >= 90 ? 'PASS' : 'CONCERNS';
  return {
    decision,
    criteria: {
      p0_coverage_required: '100%',
      p0_coverage_actual: `${p0}%`,
      p0_status: p0 >= 100 ? 'MET' : 'NOT_MET',
      p1_coverage_target: '90%',
      p1_coverage_minimum: '80%',
      p1_coverage_actual: `${p1}%`,
      p1_status: p1 >= 90 ? 'MET' : p1 >= 80 ? 'PARTIAL' : 'NOT_MET',
      overall_coverage_minimum: '80%',
      overall_coverage_actual: `${overall}%`,
      overall_status: overall >= 80 ? 'MET' : 'NOT_MET',
    },
  };
}

async function ownBand({ check, contract, corpusArm, probes }) {
  const breakdown = corpusArm({ corpus: 'trace', contract, oracleId: BREAKDOWN_ORACLE });
  const gate = corpusArm({ corpus: 'trace', contract, oracleId: GATE_ORACLE });
  const reference = fs.readFileSync(REFERENCE, 'utf8');
  const before = JSON.parse(reference);
  check(breakdown({ text: reference }).verdict === 'held', `${BREAKDOWN_ORACLE} does not hold on the stored summary`);
  check(gate({ text: reference }).verdict === 'held', `${GATE_ORACLE} does not hold on the stored summary`);
  // A summary that is not a JSON object carries no artifact, which no oracle can read, so the arm reaches no conclusion.
  for (const text of ['not a summary', 'null', '[]']) {
    check(breakdown({ text }).verdict === 'inconclusive', `an unreadable summary (${text}) was read as a conclusion`);
  }
  // The stored summary states the gate its own numbers derive.
  const stored = gateOf(before);
  check(
    before.gate_status === stored.decision && isDeepStrictEqual(before.gate_criteria, stored.criteria),
    `the stored summary states a gate that its own bands do not derive (${stored.decision})`,
  );
  check(probes.length === GAPS.length, `the builder emitted ${probes.length} controlled-mutation probe(s) for ${GAPS.length} seeded gaps`);
  const gapIds = new Set(GAPS.map((gap) => gap.id));
  for (const probe of probes) {
    const gapId = probe.qualification.mutationOperator.replace('withhold-coverage-', '').toUpperCase();
    const gap = GAPS.find((candidate) => candidate.id === gapId);
    check(gapIds.has(gapId), `${probe.probeId} names ${gapId}, which is no gap of the seeded set`);
    if (gap === undefined) continue;
    check(
      path.join(PROJECT_ROOT, probe.qualification.baselinePassEvidence.path) === REFERENCE,
      `${probe.probeId} cites ${probe.qualification.baselinePassEvidence.path}, not the stored summary of the seeded set, as its clean arm`,
    );
    const text = fs.readFileSync(path.join(PROJECT_ROOT, probe.qualification.mutatedFailEvidence.path), 'utf8');
    const after = JSON.parse(text);
    const band = `/coverage/priority_breakdown/${gap.priority}`;
    const p0Gap = gap.priority === 'P0';
    // The summary's own consequence of covering the gap, and nothing the gap does not reach.
    const expected = [
      '/coverage/inventory/covered',
      '/coverage/inventory/pct',
      `${band}/covered`,
      `${band}/pct`,
      '/gate_criteria/overall_coverage_actual',
      '/gate_criteria/overall_status',
      ...(p0Gap ? ['/gate_status', '/gate_criteria/p0_coverage_actual', '/gate_criteria/p0_status', '/recommendations'] : []),
    ].sort();
    const moved = changedJsonPaths(before, after).sort();
    check(
      JSON.stringify(moved) === JSON.stringify(expected),
      `the twin of ${gap.id} differs from the stored summary at ${JSON.stringify(moved)}; expected ${JSON.stringify(expected)}`,
    );
    // Both moved by the one criterion: the inventory and the band each count it, and the band reads fully covered.
    check(
      after.coverage.inventory.covered === before.coverage.inventory.covered + 1 &&
        after.coverage.priority_breakdown[gap.priority].covered === before.coverage.priority_breakdown[gap.priority].covered + 1 &&
        after.coverage.priority_breakdown[gap.priority].covered === after.coverage.priority_breakdown[gap.priority].total,
      `the twin of ${gap.id} does not count the criterion once in the inventory and once in ${gap.priority}, with ${gap.priority} fully covered`,
    );
    check(
      after.coverage.inventory.pct === pct(after.coverage.inventory) &&
        after.coverage.priority_breakdown[gap.priority].pct === pct(after.coverage.priority_breakdown[gap.priority]),
      `the twin of ${gap.id} states a percentage its own counts do not give`,
    );
    // The gate the twin states is the one its own numbers derive, so the summary does not contradict itself.
    const derived = gateOf(after);
    check(
      after.gate_status === derived.decision && isDeepStrictEqual(after.gate_criteria, derived.criteria),
      `the twin of ${gap.id} states gate ${after.gate_status} and criteria ${JSON.stringify(after.gate_criteria)}; its own bands derive ${derived.decision}`,
    );
    check(
      !after.recommendations.some((recommendation) => recommendation.priority === 'URGENT' && recommendation.requirements.includes(gap.id)),
      `the twin of ${gap.id} still carries an URGENT recommendation that names the gap it covers`,
    );
    check(breakdown({ text }).verdict === 'violated', `the twin that withholds ${gap.id} does not violate ${BREAKDOWN_ORACLE}`);
    // Only the P0 twin reaches the gate: the gate stays FAIL while AC-2 holds the P0 band at 50%.
    check(
      gate({ text }).verdict === (p0Gap ? 'violated' : 'held'),
      `the gate oracle ${p0Gap ? 'holds on' : 'fails on'} the twin of ${gap.id}, so the gate oracle and the breakdown oracle no longer divide the gaps as the probes name them`,
    );
  }
  check(
    GAPS.some((gap) => gap.priority !== 'P0'),
    'the seeded set carries no gap below P0',
  );
}

exitWith(
  runQualificationSuite({
    title: 'trace',
    scratchPrefix: 'tea-trace-qualification',
    corpus: 'trace',
    build: buildTraceProbes,
    probesFile: path.join(PROJECT_ROOT, 'test', 'probes', 'trace.probes.json'),
    sample: { oracleId: BREAKDOWN_ORACLE, referencePath: REFERENCE, mutatedPath: twinOf(GAPS[0].id) },
    witnessDirection: 'plant-reported',
    flips: {
      byProject: true,
      // The inventory and the band move with every twin, and the gate criteria read the inventory; the gate itself moves with the P0 twin.
      expected: (probe, designated) => (designated === GATE_ORACLE ? ['O-001', 'O-002', 'O-003', 'O-004'] : ['O-002', 'O-003', 'O-004']),
    },
    extra: ownBand,
  }),
  'trace',
);
