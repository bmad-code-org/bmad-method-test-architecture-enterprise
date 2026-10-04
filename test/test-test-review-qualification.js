/**
 * A test-review probe claims `rollbackVerified: true` only after the mutation it describes was qualified
 * in a disposable copy (Story 1.99, AD-8).
 *
 * `tools/generate-probes.js` used to state the claim as a constant for the nine planted registry rows,
 * each citing a stored review and a clean control that is a different file. The mutation of each row now
 * withholds that row's finding from the stored review that reports every plant
 * (`test/replay/test-review/full-recall/verdict.json`), and the arm resolves the oracle that discharges
 * the row's behavior over the verdict the workspace holds, through `test/lib/probe-qualification.js`.
 * The checks every corpus shares (the performed sequence, each failing step, the generator over failures)
 * are `test/lib/qualification-suite.js`; this suite adds what is the review's own:
 *
 * - Each twin under `test/fixtures/probe-mutants/test-review/` withholds exactly one row. Its oracle
 *   fails on it, the other eight hold, and the stored review holds all nine.
 *
 * Usage: node test/test-test-review-qualification.js
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { buildTestReviewProbes } = require('../tools/generate-probes');
const { exitWith, runQualificationSuite } = require('./lib/qualification-suite');

const PROJECT_ROOT = path.join(__dirname, '..');
const REFERENCE = path.join(PROJECT_ROOT, 'test', 'replay', 'test-review', 'full-recall', 'verdict.json');
const TWINS = path.join(PROJECT_ROOT, 'test', 'fixtures', 'probe-mutants', 'test-review');
const GROUND_TRUTH = JSON.parse(
  fs.readFileSync(path.join(PROJECT_ROOT, 'test', 'fixtures', 'test-review-eval', 'ground-truth.json'), 'utf8'),
);
const PLANTED_ROWS = GROUND_TRUTH.files.flatMap((entry) => (entry.planted ?? []).map((plant) => plant.row));

async function ownRowOnly({ check, contract, corpusArm }) {
  const oracleOf = (row) => `O-${String(PLANTED_ROWS.indexOf(row) + 1).padStart(3, '0')}`;
  const reference = fs.readFileSync(REFERENCE, 'utf8');
  for (const row of PLANTED_ROWS) {
    const twin = fs.readFileSync(path.join(TWINS, row.toLowerCase(), 'verdict.json'), 'utf8');
    check(row !== undefined && contract.oracles.some((oracle) => oracle.id === oracleOf(row)), `${row} has no oracle ${oracleOf(row)}`);
    const verdicts = Object.fromEntries(
      PLANTED_ROWS.map((other) => [
        other,
        corpusArm({ corpus: 'test-review', contract, oracleId: oracleOf(other) })({ text: twin }).verdict,
      ]),
    );
    check(verdicts[row] === 'violated', `the twin that withholds ${row} does not violate ${oracleOf(row)}`);
    for (const other of PLANTED_ROWS.filter((candidate) => candidate !== row)) {
      check(verdicts[other] === 'held', `the twin that withholds ${row} also fails ${oracleOf(other)}, the oracle of ${other}`);
    }
    const findings = (text) => JSON.parse(text).findings.map((finding) => finding.row);
    check(
      JSON.stringify(findings(twin)) === JSON.stringify(findings(reference).filter((found) => found !== row)),
      `the twin of ${row} does not differ from the stored review by that one finding`,
    );
  }
  // A verdict that is not JSON carries no artifact, which no oracle can read, so the arm reaches no conclusion.
  check(
    corpusArm({ corpus: 'test-review', contract, oracleId: oracleOf(PLANTED_ROWS[0]) })({ text: 'not a verdict' }).verdict ===
      'inconclusive',
    'an unreadable verdict was read as a conclusion',
  );
  // A verdict with no findings member is the shape of nothing to read, so the oracle abstains.
  check(
    corpusArm({ corpus: 'test-review', contract, oracleId: oracleOf(PLANTED_ROWS[0]) })({ text: '{}' }).verdict === 'inconclusive',
    'a verdict with no findings was read as a conclusion',
  );
  for (const row of PLANTED_ROWS) {
    check(
      corpusArm({ corpus: 'test-review', contract, oracleId: oracleOf(row) })({ text: reference }).verdict === 'held',
      `${oracleOf(row)} does not hold on the stored review that reports every plant`,
    );
  }
}

exitWith(
  runQualificationSuite({
    title: 'test-review',
    scratchPrefix: 'tea-test-review-qualification',
    corpus: 'test-review',
    build: buildTestReviewProbes,
    probesFile: path.join(PROJECT_ROOT, 'test', 'probes', 'test-review.probes.json'),
    sample: { oracleId: 'O-002', referencePath: REFERENCE, mutatedPath: path.join(TWINS, 'h1', 'verdict.json') },
    extra: ownRowOnly,
  }),
  'test-review',
);
