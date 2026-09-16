/**
 * Drift between two stored `runSummaryRecord`s.
 *
 * Reports what changed between two `eval:all` runs, suite by suite: a
 * `failureClass` change, a measurement change, and a suite present in one run
 * and not the other. This is a measurement diff over `suiteResultRecord`'s own
 * fields — `failureClass`, `measurements`, `thresholds`, `declaredRepetitions`.
 *
 * For a suite whose stored result carries `{outcomes, strength,
 * comparabilityKey}`, the comparison calls `test/lib/compare-dominance.js`'s
 * `compareStoredResults` (Story 5.1) directly, so a suite that does produce
 * `eval-quality`'s `ComparableResult` shape is compared through the package's
 * own dominance rule rather than through a second, home-grown one.
 *
 * WHAT COUNTS AS "THE SAME SUITE-MANIFEST CONFIGURATION"
 *
 * Two runs refuse to compare when they were not measured the same way, mirroring
 * `compareStoredResults`'s own refuse-first pattern: a verdict computed across a
 * changed measuring stick is not a verdict about drift. Two things make a run
 * incomparable to another:
 *
 *   - a different installed `eval-quality` (`evalQualityVersion` at the top of
 *     the record), because every suite below it was scored against that install;
 *   - for any suite present in BOTH runs, a different `declaredRepetitions` or a
 *     different `thresholds` object — the bar itself moved, so a `failureClass`
 *     or measurement difference could mean the bar moved rather than the score
 *     did, and conflating the two is exactly the false reading a refusal exists
 *     to prevent.
 *
 * A suite present in only one of the two runs is NOT a configuration mismatch by
 * this rule and does not refuse the comparison: Epic 6 adds suites one at a time,
 * and a run recorded mid-epic is expected to name a suite the other run does not
 * have. That suite is reported as added or removed instead (see the Acceptance
 * Criteria on Story 5.2, which states both outcomes under one "same
 * configuration" precondition).
 */

'use strict';

const { scoringPolicy } = require('./eval-quality-inputs');
const { compareStoredResults } = require('./compare-dominance');

/**
 * @param {Record<string, number>} a
 * @param {Record<string, number>} b
 * @returns {boolean}
 */
function sameThresholds(a, b) {
  const left = Object.entries(a ?? {}).sort(([x], [y]) => x.localeCompare(y));
  const right = Object.entries(b ?? {}).sort(([x], [y]) => x.localeCompare(y));
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * One run's suites, keyed by suite id.
 *
 * @param {{suites: Array<{suite: {id: string}}>}} run
 * @returns {Map<string, object>}
 */
function suitesById(run) {
  return new Map(run.suites.map((suiteResult) => [suiteResult.suite.id, suiteResult]));
}

/**
 * Every reason two runs' declared configuration disagrees for a suite both
 * carry, or an empty array when every suite they share agrees.
 *
 * @param {Map<string, object>} previousSuites
 * @param {Map<string, object>} currentSuites
 * @returns {string[]}
 */
function configMismatches(previousSuites, currentSuites) {
  const reasons = [];
  for (const [id, previousResult] of previousSuites) {
    const currentResult = currentSuites.get(id);
    if (!currentResult) continue;
    const previousSuite = previousResult.suite;
    const currentSuite = currentResult.suite;
    if (previousSuite.declaredRepetitions !== currentSuite.declaredRepetitions) {
      reasons.push(
        `suite "${id}" declares ${previousSuite.declaredRepetitions} repetition(s) in the earlier run and ${currentSuite.declaredRepetitions} in this one`,
      );
    }
    if (!sameThresholds(previousSuite.thresholds, currentSuite.thresholds)) {
      reasons.push(
        `suite "${id}" declares different thresholds between the two runs: ${JSON.stringify(previousSuite.thresholds)} vs ${JSON.stringify(currentSuite.thresholds)}`,
      );
    }
  }
  return reasons;
}

/**
 * `null` when the two runs can be compared, the refusal reason otherwise.
 *
 * @param {{evalQualityVersion: string, suites: Array<object>}} previous
 * @param {{evalQualityVersion: string, suites: Array<object>}} current
 * @returns {string|null}
 */
function refusalReason(previous, current) {
  if (previous.evalQualityVersion !== current.evalQualityVersion) {
    return (
      `eval-quality version differs (${previous.evalQualityVersion} vs ${current.evalQualityVersion}): the two runs were not measured ` +
      'by the same installed package, so no drift between them is meaningful'
    );
  }
  const mismatches = configMismatches(suitesById(previous), suitesById(current));
  if (mismatches.length > 0) {
    return `the suite manifest's own configuration differs between the two runs: ${mismatches.join('; ')}`;
  }
  return null;
}

/**
 * One flattened measurement per `<agent>:<metric>` key, across every runner a
 * suite result carries. Flattened rather than compared runner-by-runner: a
 * suite's runner set is free to change between two runs (a different `--agent`
 * flag, a runner added or dropped) without that alone being a configuration
 * mismatch, and flattening turns "this runner is gone" into "these keys are
 * gone" so one diff loop handles both without a second shape.
 *
 * @param {{runners: Array<{agent: string, measurements: Record<string, number|null>}>}} suiteResult
 * @returns {Record<string, number|null>}
 */
function flattenMeasurements(suiteResult) {
  const flat = {};
  for (const runner of suiteResult.runners ?? []) {
    for (const [metric, value] of Object.entries(runner.measurements ?? {})) {
      flat[`${runner.agent}:${metric}`] = value;
    }
  }
  return flat;
}

/**
 * Every measurement key whose value differs (including a key present on only
 * one side), `from`/`to` each `undefined` when the key is absent on that side.
 *
 * @param {object} previousSuiteResult
 * @param {object} currentSuiteResult
 * @returns {Array<{metric: string, from: number|null|undefined, to: number|null|undefined}>}
 */
function measurementChanges(previousSuiteResult, currentSuiteResult) {
  const before = flattenMeasurements(previousSuiteResult);
  const after = flattenMeasurements(currentSuiteResult);
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes = [];
  for (const metric of [...keys].sort()) {
    const from = Object.hasOwn(before, metric) ? before[metric] : undefined;
    const to = Object.hasOwn(after, metric) ? after[metric] : undefined;
    if (from !== to) changes.push({ metric, from, to });
  }
  return changes;
}

/**
 * Whether a stored suite result carries the `ComparableResult` shape
 * `compareStoredResults` (TEA Story 5.1) reads: `{outcomes, strength,
 * comparabilityKey}`. No suite `eval:all` runs today produces this — see the
 * module comment — so this always reads false against a real stored record.
 * It is a structural check rather than a schema check on purpose: a schema-valid
 * `evalResultSchema` record can never carry these keys at all (the schema is
 * `.strict()`), so this is the only test that can ever say yes, the day a suite
 * genuinely starts carrying them under a schema revision that allows it.
 *
 * @param {object} suiteResult
 * @returns {boolean}
 */
function isComparableShaped(suiteResult) {
  return (
    Array.isArray(suiteResult?.outcomes) &&
    suiteResult?.strength !== null &&
    typeof suiteResult?.strength === 'object' &&
    typeof suiteResult?.comparabilityKey === 'string'
  );
}

/**
 * The dominance relation between two suites' stored results, when both carry
 * `ComparableResult` data, or `null` when either does not. Reads
 * `test/probes/scoring-policy.json`'s `severityFloor` the same way
 * `test/test-probe-corpus.js` does, since that is the one severity floor this
 * repository has declared.
 *
 * @param {object} previousSuiteResult
 * @param {object} currentSuiteResult
 * @returns {Promise<{ok: true, relation: string}|{ok: false, reason: string}|null>}
 */
async function dominanceFor(previousSuiteResult, currentSuiteResult) {
  if (!isComparableShaped(previousSuiteResult) || !isComparableShaped(currentSuiteResult)) return null;
  const policy = await scoringPolicy();
  return compareStoredResults(previousSuiteResult, currentSuiteResult, policy.severityFloor);
}

/**
 * Compare a stored run against the run that was just produced.
 *
 * @param {object|null} previous The prior `latest.json`, or `null` when none is stored yet.
 * @param {object} current The run-summary record just produced.
 * @returns {Promise<
 *   | {status: 'first-run', message: string}
 *   | {status: 'refused', reason: string}
 *   | {status: 'compared', drift: boolean, addedSuites: string[], removedSuites: string[], suiteChanges: Array<object>}
 * >}
 */
async function compareEvalRuns(previous, current) {
  if (previous === null) {
    return { status: 'first-run', message: 'no prior run to compare against' };
  }

  const reason = refusalReason(previous, current);
  if (reason !== null) return { status: 'refused', reason };

  const previousSuites = suitesById(previous);
  const currentSuites = suitesById(current);

  const addedSuites = [...currentSuites.keys()].filter((id) => !previousSuites.has(id)).sort();
  const removedSuites = [...previousSuites.keys()].filter((id) => !currentSuites.has(id)).sort();

  const suiteChanges = [];
  for (const [id, previousResult] of previousSuites) {
    const currentResult = currentSuites.get(id);
    if (!currentResult) continue;

    const failureClassChanged = previousResult.failureClass !== currentResult.failureClass;
    const changedMeasurements = measurementChanges(previousResult, currentResult);
    // Present only when both sides ever carry `ComparableResult` data, which no
    // suite does today; see `dominanceFor` and the module comment above. A
    // refusal is itself a finding, but an `'equivalent'` verdict is what "no
    // drift" looks like from `compareDominance` and must not read as one.
    const dominance = await dominanceFor(previousResult, currentResult);
    const dominanceIsChange = dominance !== null && (!dominance.ok || dominance.relation !== 'equivalent');

    if (!failureClassChanged && changedMeasurements.length === 0 && !dominanceIsChange) continue;

    suiteChanges.push({
      id,
      failureClass: failureClassChanged ? { from: previousResult.failureClass, to: currentResult.failureClass } : null,
      measurementChanges: changedMeasurements,
      dominance,
    });
  }

  return {
    status: 'compared',
    drift: addedSuites.length > 0 || removedSuites.length > 0 || suiteChanges.length > 0,
    addedSuites,
    removedSuites,
    suiteChanges,
  };
}

module.exports = { compareEvalRuns, refusalReason, isComparableShaped };
