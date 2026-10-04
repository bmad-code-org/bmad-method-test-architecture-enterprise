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
 * - Each twin under `test/fixtures/probe-mutants/trace/` edits the summary's inventory and the one
 *   priority band of its gap, and nothing else. The breakdown oracle fails on every twin and holds on
 *   the stored summary.
 * - The gate oracle (`gate_status` equals FAIL) cannot serve as the arm of the P2 and P3 gaps: AC-2
 *   holds the P0 band at 50%, so withholding AC-8 or AC-10 leaves the gate at FAIL. That is why the
 *   probes name the breakdown oracle, and a change that points them back at the gate stops the generator.
 *
 * Usage: node test/test-trace-qualification.js
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { buildTraceProbes } = require('../tools/generate-probes');
const { exitWith, runQualificationSuite } = require('./lib/qualification-suite');

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

async function ownBand({ check, contract, corpusArm }) {
  const breakdown = corpusArm({ corpus: 'trace', contract, oracleId: BREAKDOWN_ORACLE });
  const gate = corpusArm({ corpus: 'trace', contract, oracleId: GATE_ORACLE });
  const reference = fs.readFileSync(REFERENCE, 'utf8');
  check(breakdown({ text: reference }).verdict === 'held', `${BREAKDOWN_ORACLE} does not hold on the stored summary`);
  check(gate({ text: reference }).verdict === 'held', `${GATE_ORACLE} does not hold on the stored summary`);
  // A summary that is not JSON carries no artifact, which no oracle can read, so the arm reaches no conclusion.
  check(breakdown({ text: 'not a summary' }).verdict === 'inconclusive', 'an unreadable summary was read as a conclusion');
  const bands = (text) => JSON.parse(text).coverage.priority_breakdown;
  for (const gap of GAPS) {
    const text = fs.readFileSync(twinOf(gap.id), 'utf8');
    check(breakdown({ text }).verdict === 'violated', `the twin that withholds ${gap.id} does not violate ${BREAKDOWN_ORACLE}`);
    const before = bands(reference);
    const after = bands(text);
    for (const priority of Object.keys(before)) {
      const same = JSON.stringify(before[priority]) === JSON.stringify(after[priority]);
      check(
        priority === gap.priority ? !same && after[priority].covered === after[priority].total : same,
        `the twin of ${gap.id} ${priority === gap.priority ? `leaves ${priority} short of covered` : `moves the ${priority} band`}`,
      );
    }
  }
  const lowerBands = GAPS.filter((gap) => gap.priority !== 'P0');
  check(lowerBands.length > 0, 'the seeded set carries no gap below P0');
  for (const gap of lowerBands) {
    check(
      gate({ text: fs.readFileSync(twinOf(gap.id), 'utf8') }).verdict === 'held',
      `the gate oracle fails on the twin of ${gap.id}, so the breakdown oracle is no longer the only one that serves`,
    );
  }
}

exitWith(
  runQualificationSuite({
    title: 'trace',
    scratchPrefix: 'tea-trace-qualification',
    corpus: 'trace',
    build: buildTraceProbes,
    probesFile: path.join(PROJECT_ROOT, 'test', 'probes', 'trace.probes.json'),
    sample: { oracleId: BREAKDOWN_ORACLE, referencePath: REFERENCE, mutatedPath: twinOf(GAPS[0].id) },
    extra: ownBand,
  }),
  'trace',
);
