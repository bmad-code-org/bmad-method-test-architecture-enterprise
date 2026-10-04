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
 * - Each twin under `test/fixtures/probe-mutants/test-review/` withholds exactly one row, and the suite reads each twin from
 *   the path the builder's emitted probe cites. It is the stored review's own bytes (the `$comment` and every ledger field included)
 *   with the lines of that row's finding removed and nothing added. Its oracle fails on it and the other twelve oracles of the contract hold, which the shared kit
 *   asserts for every committed probe. The stored review holds all nine row oracles.
 * - The arm reads a verdict that is no object (`null`, a list, text that is not JSON) as no artifact and reaches no
 *   conclusion, and a verdict with no findings member leaves the row oracles abstaining. The exit-code oracle (O-013)
 *   depends on the exit code the arm derives from the recommendation: it holds on the stored review, which blocks, and
 *   fails on the same review approving.
 *
 * Usage: node test/test-test-review-qualification.js
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { buildTestReviewProbes } = require('../tools/generate-probes');
const { isDeepStrictEqual } = require('node:util');

const { changedLines, exitWith, runQualificationSuite } = require('./lib/qualification-suite');

const PROJECT_ROOT = path.join(__dirname, '..');
const REFERENCE = path.join(PROJECT_ROOT, 'test', 'replay', 'test-review', 'full-recall', 'verdict.json');
const TWINS = path.join(PROJECT_ROOT, 'test', 'fixtures', 'probe-mutants', 'test-review');
const GROUND_TRUTH = JSON.parse(
  fs.readFileSync(path.join(PROJECT_ROOT, 'test', 'fixtures', 'test-review-eval', 'ground-truth.json'), 'utf8'),
);
const PLANTED_ROWS = GROUND_TRUTH.files.flatMap((entry) => (entry.planted ?? []).map((plant) => plant.row));

async function ownRowOnly({ check, contract, corpusArm, probes }) {
  const oracleOf = (row) => `O-${String(PLANTED_ROWS.indexOf(row) + 1).padStart(3, '0')}`;
  const arm = (oracleId) => corpusArm({ corpus: 'test-review', contract, oracleId });
  const reference = fs.readFileSync(REFERENCE, 'utf8');
  const findings = (text) => JSON.parse(text).findings.map((finding) => finding.row);
  check(
    probes.length === PLANTED_ROWS.length,
    `the builder emitted ${probes.length} controlled-mutation probe(s) for ${PLANTED_ROWS.length} planted rows`,
  );
  for (const probe of probes) {
    const { baselinePassEvidence, mutatedFailEvidence, mutationOperator } = probe.qualification;
    const row = mutationOperator.replace('withhold-registry-row-', '').toUpperCase();
    check(PLANTED_ROWS.includes(row), `${probe.probeId} names ${row}, which is no planted row`);
    check(
      path.join(PROJECT_ROOT, baselinePassEvidence.path) === REFERENCE,
      `${probe.probeId} cites ${baselinePassEvidence.path} as its clean arm, not the stored review that reports every plant`,
    );
    const twin = fs.readFileSync(path.join(PROJECT_ROOT, mutatedFailEvidence.path), 'utf8');
    // The twin is the stored review's own bytes with one region removed, that row's finding, and nothing added: the `$comment` and every
    // ledger field are the reference's, so the derived operator is one removal of exactly that finding.
    const block = JSON.stringify(
      JSON.parse(reference).findings.find((found) => found.row === row),
      null,
      2,
    )
      .split('\n')
      .map((line) => `    ${line}`)
      .join('\n');
    const withoutFinding = [`${block},\n`, `,\n${block}`].map((region) => reference.replace(region, '')).find((text) => text !== reference);
    const difference = changedLines(reference, twin);
    check(
      difference.lines === undefined &&
        difference.added.length === 0 &&
        difference.removed.length === block.split('\n').length &&
        withoutFinding === twin,
      `the twin of ${row} differs from the stored review as ${JSON.stringify({ at: difference.at, removed: difference.removed?.length, added: difference.added?.length, lines: difference.lines?.length })}; expected the lines of the finding of ${row} removed as one region and nothing added`,
    );
    check(
      JSON.stringify(findings(twin)) === JSON.stringify(findings(reference).filter((found) => found !== row)),
      `the twin of ${row} does not differ from the stored review by that one finding`,
    );
    check(
      isDeepStrictEqual(
        JSON.parse(twin).findings,
        JSON.parse(reference).findings.filter((finding) => finding.row !== row),
      ),
      `the twin of ${row} changed a finding it kept`,
    );
    check(arm(oracleOf(row))({ text: twin }).verdict === 'violated', `the twin that withholds ${row} does not violate ${oracleOf(row)}`);
  }
  // A verdict that is no JSON object carries no artifact, which no oracle can read, so the arm reaches no conclusion.
  for (const [what, text] of [
    ['text that is not JSON', 'not a verdict'],
    ['JSON null', 'null'],
    ['a JSON list', '[]'],
    ['a JSON string', '"Block"'],
  ]) {
    check(arm(oracleOf(PLANTED_ROWS[0]))({ text }).verdict === 'inconclusive', `${what} was read as a conclusion`);
  }
  // A verdict with no findings member is the shape of nothing to read, so the oracle abstains.
  check(arm(oracleOf(PLANTED_ROWS[0]))({ text: '{}' }).verdict === 'inconclusive', 'a verdict with no findings was read as a conclusion');
  for (const row of PLANTED_ROWS) {
    check(
      arm(oracleOf(row))({ text: reference }).verdict === 'held',
      `${oracleOf(row)} does not hold on the stored review that reports every plant`,
    );
  }
  // The exit code the arm derives from the recommendation is what O-013 reads: the stored review blocks (exit 1), an approval exits 0.
  const exitOracle = contract.oracles.find((oracle) => JSON.stringify(oracle.check).includes('/exit-code'));
  check(exitOracle !== undefined, 'no oracle of the contract reads the exit code, so the arm derives one nothing depends on');
  if (exitOracle !== undefined) {
    check(arm(exitOracle.id)({ text: reference }).verdict === 'held', `${exitOracle.id} does not hold on the stored review, which blocks`);
    const approving = JSON.stringify({ ...JSON.parse(reference), recommendation: 'Approve' });
    check(
      arm(exitOracle.id)({ text: approving }).verdict === 'violated',
      `${exitOracle.id} does not follow the exit code the recommendation derives`,
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
    witnessDirection: 'plant-reported',
    extra: ownRowOnly,
  }),
  'test-review',
);
