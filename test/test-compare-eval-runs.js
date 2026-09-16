/**
 * `test/lib/compare-eval-runs.js` and `test/lib/contract-versions.js`, proven
 * against fixture pairs covering every row of Story 5.2's I/O & Edge-Case
 * Matrix. No live call: every run-summary here is a hand-built object shaped
 * like `test/schema/eval-result.js`'s `evalRunSchema`, never a real `eval:all`
 * output.
 *
 * The two modules are proven together because one matrix row
 * ("a suite's `contracts` path resolves to a file with no `schemaVersion`") is
 * about `contractVersionsFor`, not about the comparison, and the story's own
 * task list names this one file as covering both.
 *
 * Usage: node test/test-compare-eval-runs.js
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { compareEvalRuns, isComparableShaped } = require('./lib/compare-eval-runs');
const { contractVersionsFor } = require('./lib/contract-versions');
const { evalResultSchema, evalRunSchema } = require('./schema/eval-result');

const colors = { reset: '[0m', red: '[31m', green: '[32m' };

const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

/* -------------------------------------------------------------------------- */
/* Fixture builders                                                            */
/* -------------------------------------------------------------------------- */

const DIGEST = `sha256:${'0'.repeat(64)}`;

/** One suite-result record, schema-shaped, with sane defaults a check can override. */
function suiteResult(id, overrides = {}) {
  const { suite: suiteOverrides, ...rest } = overrides;
  return {
    schemaVersion: '1.3.0',
    kind: 'suite-result',
    generatedAt: '2026-09-16T00:00:00.000Z',
    mode: 'live',
    repository: { commit: 'abc123', dirty: false },
    suite: {
      id,
      evalType: 'behavioral',
      skills: ['bmad-testarch-atdd'],
      contracts: [],
      ciTier: 'full-matrix',
      runnerCapabilities: ['read-only'],
      fixtureDigest: DIGEST,
      promptDigest: null,
      caseIds: [],
      cases: [],
      thresholds: { accuracy: 0.9 },
      declaredRepetitions: 2,
      ...suiteOverrides,
    },
    runners: [
      {
        agent: 'agy',
        executable: 'agy',
        version: null,
        model: null,
        parameters: { agentArgs: [], envPassNames: [], timeoutMs: 60_000, promptTransport: 'stdin' },
        repetitions: { expected: 2, completed: 2 },
        measurements: { accuracy: 0.9 },
        durationMs: 100,
        usage: null,
        failureClass: 'none',
        failures: [],
      },
    ],
    durationMs: 100,
    failureClass: 'none',
    exitCode: 0,
    ...rest,
  };
}

/** One run-summary record, schema-shaped. */
function runSummary(suites, overrides = {}) {
  return {
    schemaVersion: '1.3.0',
    kind: 'run-summary',
    generatedAt: '2026-09-16T00:00:00.000Z',
    repository: { commit: 'abc123', dirty: false },
    evalQualityVersion: '3.3.0',
    suites,
    unaccountedSkills: [],
    durationMs: 200,
    failureClass: 'none',
    exitCode: 0,
    ...overrides,
  };
}

/** A `ComparableResult` slice, the shape `compareStoredResults` reads. */
function comparableResult(comparabilityKey, rate) {
  return {
    comparabilityKey,
    outcomes: [{ probeId: 'p1', state: rate === 1 ? 'caught' : 'missed', severity: 'critical' }],
    strength: {
      denominator: '1 admitted probe(s)',
      basis: 'measured',
      comparable: true,
      note: null,
      vector: { defect: { caught: rate, exercised: 1, rate }, gameability: null, 'zero-action': null },
    },
  };
}

function assertFixtureIsSchemaValid(record, schema, label) {
  const result = schema.safeParse(record);
  check(
    result.success,
    `${label} fixture is not schema-valid, so it proves nothing: ${result.success ? '' : JSON.stringify(result.error.issues)}`,
  );
}

/* -------------------------------------------------------------------------- */
/* I/O matrix: compareEvalRuns                                                 */
/* -------------------------------------------------------------------------- */

async function checkFirstRun() {
  const current = runSummary([suiteResult('atdd')]);
  assertFixtureIsSchemaValid(current, evalRunSchema, 'first-run current');
  const result = await compareEvalRuns(null, current);
  check(result.status === 'first-run', `expected status "first-run", got "${result.status}"`);
  check(result.message === 'no prior run to compare against', `unexpected first-run message: ${result.message}`);
}

async function checkNoDrift() {
  const previous = runSummary([suiteResult('atdd')]);
  const current = runSummary([suiteResult('atdd')]);
  const result = await compareEvalRuns(previous, current);
  check(result.status === 'compared', `expected status "compared", got "${result.status}"`);
  check(result.drift === false, 'two identical runs reported drift');
  check(
    result.addedSuites.length === 0 && result.removedSuites.length === 0 && result.suiteChanges.length === 0,
    'a clean comparison reported a change',
  );
}

async function checkRegressionReported() {
  const previous = runSummary([suiteResult('atdd')]);
  const current = runSummary([suiteResult('atdd', { failureClass: 'quality', exitCode: 1 })]);
  const result = await compareEvalRuns(previous, current);
  check(result.status === 'compared', `expected status "compared", got "${result.status}"`);
  check(result.drift === true, 'a failureClass regression did not read as drift');
  const change = result.suiteChanges.find((entry) => entry.id === 'atdd');
  check(change !== undefined, 'the regressed suite is not named in suiteChanges');
  check(
    change?.failureClass?.from === 'none' && change?.failureClass?.to === 'quality',
    `expected failureClass none -> quality, got ${JSON.stringify(change?.failureClass)}`,
  );
}

async function checkMeasurementChangeReported() {
  const previous = runSummary([suiteResult('atdd')]);
  const current = runSummary([
    suiteResult('atdd', {
      runners: [{ ...suiteResult('atdd').runners[0], measurements: { accuracy: 0.5 } }],
    }),
  ]);
  const result = await compareEvalRuns(previous, current);
  const change = result.suiteChanges.find((entry) => entry.id === 'atdd');
  check(change !== undefined, 'a measurement change did not surface the suite in suiteChanges');
  const metricChange = change?.measurementChanges.find((entry) => entry.metric === 'agy:accuracy');
  check(metricChange !== undefined, 'the changed measurement is not named');
  check(metricChange?.from === 0.9 && metricChange?.to === 0.5, `expected 0.9 -> 0.5, got ${JSON.stringify(metricChange)}`);
}

async function checkAddedSuiteNamed() {
  const previous = runSummary([suiteResult('atdd')]);
  const current = runSummary([suiteResult('atdd'), suiteResult('ci')]);
  const result = await compareEvalRuns(previous, current);
  check(result.status === 'compared', `expected status "compared", got "${result.status}"`);
  check(result.drift === true, 'an added suite did not read as drift');
  check(result.addedSuites.includes('ci'), `"ci" is not named as added: ${JSON.stringify(result.addedSuites)}`);
  check(result.removedSuites.length === 0, 'an added suite was also reported as removed');
}

async function checkRemovedSuiteNamed() {
  const previous = runSummary([suiteResult('atdd'), suiteResult('ci')]);
  const current = runSummary([suiteResult('atdd')]);
  const result = await compareEvalRuns(previous, current);
  check(result.status === 'compared', `expected status "compared", got "${result.status}"`);
  check(result.drift === true, 'a removed suite did not read as drift');
  check(result.removedSuites.includes('ci'), `"ci" is not named as removed: ${JSON.stringify(result.removedSuites)}`);
  check(result.addedSuites.length === 0, 'a removed suite was also reported as added');
}

async function checkVersionMismatchRefused() {
  const previous = runSummary([suiteResult('atdd')], { evalQualityVersion: '3.3.0' });
  const current = runSummary([suiteResult('atdd')], { evalQualityVersion: '3.4.0' });
  const result = await compareEvalRuns(previous, current);
  check(result.status === 'refused', `expected status "refused", got "${result.status}"`);
  check(result.status !== 'compared', 'a version mismatch must never read as "no drift found"');
  check(
    result.reason?.includes('3.3.0') && result.reason?.includes('3.4.0'),
    `refusal reason does not name both versions: ${result.reason}`,
  );
}

async function checkSuiteConfigMismatchRefused() {
  const previous = runSummary([suiteResult('atdd')]);
  const current = runSummary([suiteResult('atdd', { suite: { thresholds: { accuracy: 0.5 } } })]);
  const result = await compareEvalRuns(previous, current);
  check(result.status === 'refused', `a declared-threshold mismatch must refuse, got status "${result.status}"`);
  check(result.reason?.includes('atdd'), `refusal reason does not name the suite: ${result.reason}`);

  const previousReps = runSummary([suiteResult('atdd')]);
  const currentReps = runSummary([suiteResult('atdd', { suite: { declaredRepetitions: 3 } })]);
  const repsResult = await compareEvalRuns(previousReps, currentReps);
  check(repsResult.status === 'refused', `a declared-repetitions mismatch must refuse, got status "${repsResult.status}"`);
}

async function checkSuiteSetDifferenceIsNotAConfigRefusal() {
  // The story's own Acceptance Criteria states both outcomes under one "same
  // configuration" precondition: a suite present in only one run is reported
  // as added or removed, and does not by itself refuse the comparison.
  const previous = runSummary([suiteResult('atdd')]);
  const current = runSummary([suiteResult('atdd'), suiteResult('ci')]);
  const result = await compareEvalRuns(previous, current);
  check(result.status === 'compared', `a suite unique to one run must not refuse the comparison, got status "${result.status}"`);
}

/* -------------------------------------------------------------------------- */
/* The compareStoredResults call site: unreachable today, reachable and       */
/* correct the day a suite carries ComparableResult data                     */
/* -------------------------------------------------------------------------- */

async function checkDominanceCallSiteIsInertOnOrdinaryData() {
  const previous = suiteResult('atdd');
  const current = suiteResult('atdd', { failureClass: 'quality', exitCode: 1 });
  assertFixtureIsSchemaValid(previous, evalResultSchema, 'ordinary suite');
  check(isComparableShaped(previous) === false, 'a schema-valid suite result reads as ComparableResult-shaped; it must not');

  const result = await compareEvalRuns(runSummary([previous]), runSummary([current]));
  const change = result.suiteChanges.find((entry) => entry.id === 'atdd');
  check(
    change?.dominance === null,
    `an ordinary suite change carried a dominance verdict it never earned: ${JSON.stringify(change?.dominance)}`,
  );
}

async function checkDominanceCallSiteFiresOnComparableData() {
  const previous = suiteResult('atdd', comparableResult('k1', 1));
  const current = suiteResult('atdd', comparableResult('k1', 0.5));
  check(isComparableShaped(previous) === true, 'a ComparableResult-shaped suite is not recognised as one');

  const result = await compareEvalRuns(runSummary([previous]), runSummary([current]));
  const change = result.suiteChanges.find((entry) => entry.id === 'atdd');
  check(change !== undefined, 'a worsened ComparableResult did not surface as a suite change');
  check(change?.dominance?.ok === true, `expected a dominance verdict, got ${JSON.stringify(change?.dominance)}`);
  check(change?.dominance?.relation === 'a-dominates-b', `expected "a-dominates-b", got "${change?.dominance?.relation}"`);
}

async function checkEquivalentDominanceIsNotReportedAsDrift() {
  const previous = suiteResult('atdd', comparableResult('k1', 1));
  const current = suiteResult('atdd', comparableResult('k1', 1));
  const result = await compareEvalRuns(runSummary([previous]), runSummary([current]));
  check(result.drift === false, 'two ComparableResult-equivalent runs with nothing else changed reported drift');
}

/* -------------------------------------------------------------------------- */
/* contractVersionsFor                                                        */
/* -------------------------------------------------------------------------- */

async function checkContractVersionsFor() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-contract-versions-'));
  try {
    fs.writeFileSync(path.join(dir, 'stamped.contract.json'), JSON.stringify({ schemaVersion: 5 }), 'utf8');
    fs.writeFileSync(path.join(dir, 'unstamped.contract.json'), JSON.stringify({ contractId: 'x' }), 'utf8');
    fs.writeFileSync(path.join(dir, 'malformed.contract.json'), '{ not valid json', 'utf8');

    const suite = {
      contracts: ['stamped.contract.json', 'unstamped.contract.json', 'malformed.contract.json', 'missing.contract.json'],
    };
    const versions = await contractVersionsFor(suite, dir);

    check(
      versions['stamped.contract.json'] === '5',
      `a contract with schemaVersion 5 must read back "5", got ${JSON.stringify(versions['stamped.contract.json'])}`,
    );
    check(
      versions['unstamped.contract.json'] === null,
      `a contract with no schemaVersion field must read null, got ${JSON.stringify(versions['unstamped.contract.json'])}`,
    );
    check(
      versions['malformed.contract.json'] === null,
      `a contract that is not valid JSON must read null rather than throw, got ${JSON.stringify(versions['malformed.contract.json'])}`,
    );
    check(
      versions['missing.contract.json'] === null,
      `a contract file that does not exist must read null rather than throw, got ${JSON.stringify(versions['missing.contract.json'])}`,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/* -------------------------------------------------------------------------- */

async function main() {
  await checkFirstRun();
  await checkNoDrift();
  await checkRegressionReported();
  await checkMeasurementChangeReported();
  await checkAddedSuiteNamed();
  await checkRemovedSuiteNamed();
  await checkVersionMismatchRefused();
  await checkSuiteConfigMismatchRefused();
  await checkSuiteSetDifferenceIsNotAConfigRefusal();
  await checkDominanceCallSiteIsInertOnOrdinaryData();
  await checkDominanceCallSiteFiresOnComparableData();
  await checkEquivalentDominanceIsNotReportedAsDrift();
  await checkContractVersionsFor();

  if (failures.length > 0) {
    console.error(`${colors.red}${failures.length} of ${checks} check(s) failed:${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log(`${colors.green}ok${colors.reset} all ${checks} check(s) passed, covering every row of Story 5.2's I/O & Edge-Case Matrix`);
  return 0;
}

if (require.main === module) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = { suiteResult, runSummary, comparableResult };
