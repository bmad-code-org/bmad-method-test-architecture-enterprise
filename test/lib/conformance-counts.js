/**
 * The number of outcomes a complete run of one published conformance arm
 * produces, read from the package.
 *
 * `eval-quality` publishes `CONFORMANCE_OUTCOME_COUNTS`, and every arm TEA runs
 * asserts the length of its report against the entry for that arm. The count has
 * to come from the package rather than from a literal here, because the arms
 * grow: the command-probe arm was fifteen assertions when TEA first ran it and
 * is sixteen now, and a transcribed number would have gone on passing while the
 * suite ran one assertion TEA never looked at.
 *
 * Reading it by subscript is most of the way there and leaves one gap, which is
 * what this function closes. `CONFORMANCE_OUTCOME_COUNTS['command-probe']` for
 * an arm the package has stopped publishing is `undefined`, and `undefined`
 * compared against a report length is a mismatch reported as "the suite produced
 * 16 outcome(s) and a complete command-probe run is undefined". That is a true
 * statement about a count and the wrong statement about what happened: the arm is
 * gone, or it was renamed, and the reader is sent to look at an assertion list
 * that is fine. A missing entry is a different failure from a count that moved
 * and it says so here, naming the arm it could not find and the arms the package
 * does publish.
 *
 * It throws rather than returning a sentinel. Every caller is a check whose whole
 * job is the comparison this number is one side of, so a caller that carried on
 * with a sentinel would be reporting a conformance result it could not have
 * computed. The callers already treat a throw as "this check could not run",
 * which is the honest class for a package whose shape moved.
 *
 * `test/test-port-totality.js` holds every arm TEA runs to reading its count
 * through this or by subscript, on a live source line, and holds this function
 * to naming the arm when the entry is absent.
 */

'use strict';

/**
 * @param {Record<string, number>} counts - The package's own `CONFORMANCE_OUTCOME_COUNTS`.
 * @param {string} arm - The arm whose complete-run length is wanted, e.g. `command-probe`.
 * @returns {number}
 */
function expectedOutcomeCount(counts, arm) {
  const published = counts === null || typeof counts !== 'object' ? [] : Object.keys(counts).sort();
  const expected = published.includes(arm) ? counts[arm] : undefined;
  if (expected === undefined) {
    throw new Error(
      `eval-quality publishes no outcome count for the "${arm}" conformance arm. ` +
        `It publishes ${published.length === 0 ? 'none at all' : published.join(', ')}. ` +
        'The arm was renamed or withdrawn upstream, so the check that runs it has to be pointed at its new name or removed with the arm.',
    );
  }
  // A non-integer or non-positive count would compare against a report length and
  // fail as a mismatch, which is the same misreading as an absent entry one step
  // later: the arm is fine and the registry is not.
  if (!Number.isInteger(expected) || expected <= 0) {
    throw new Error(
      `eval-quality publishes ${JSON.stringify(expected)} as the outcome count for the "${arm}" conformance arm, which is not a positive whole number of assertions.`,
    );
  }
  return expected;
}

module.exports = { expectedOutcomeCount };
