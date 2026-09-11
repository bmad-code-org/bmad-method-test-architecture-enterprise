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
 * that is fine.
 *
 * Three failures, and they are kept apart because each sends a reader somewhere
 * different. A registry that is missing altogether is an export that moved, and
 * naming an arm there would be the same misreading one level up. An arm the
 * registry does not carry is an arm renamed or withdrawn. A count that is present
 * and not a positive whole number is a registry that has changed shape while the
 * arm is fine. Collapsing any two of those produces a message that contradicts
 * itself: an earlier draft of this file answered a present-but-undefined entry
 * with "publishes no outcome count for the "command-probe" arm. It publishes
 * command-probe."
 *
 * It throws rather than returning a sentinel. Every caller is a check whose whole
 * job is the comparison this number is one side of, so a caller that carried on
 * with a sentinel would be reporting a conformance result it could not have
 * computed. A throw is the package's shape having moved, which is a
 * could-not-run rather than a TEA failure, and both callers classify it as one.
 *
 * `test/test-port-totality.js` holds every arm TEA runs to reading its count
 * through this function, on a live source line, and drives all three failures
 * above rather than describing them.
 */

'use strict';

/**
 * @param {Record<string, number>} counts - The package's own `CONFORMANCE_OUTCOME_COUNTS`.
 * @param {string} arm - The arm whose complete-run length is wanted, e.g. `command-probe`.
 * @returns {number}
 */
function expectedOutcomeCount(counts, arm) {
  if (counts === null || typeof counts !== 'object') {
    throw new Error(
      `eval-quality published no CONFORMANCE_OUTCOME_COUNTS to read the "${arm}" conformance arm from; it is ${String(counts)}. ` +
        'The registry itself was renamed or withdrawn upstream, so no arm can be looked up and the arm named here is not the problem.',
    );
  }
  // `Object.hasOwn` rather than a bare read, so a prototype key is a missing arm
  // rather than a function: `counts['constructor']` would otherwise return
  // `Object` and fail one check later as a count that is not a whole number,
  // which names the registry when the arm is what is wrong.
  if (!Object.hasOwn(counts, arm)) {
    const published = Object.keys(counts).sort();
    throw new Error(
      `eval-quality publishes no outcome count for the "${arm}" conformance arm. ` +
        `It publishes ${published.length === 0 ? 'none at all' : published.join(', ')}. ` +
        'The arm was renamed or withdrawn upstream, so the check that runs it has to be pointed at its new name or removed with the arm.',
    );
  }
  const expected = counts[arm];
  // A count that is present and not a positive whole number would compare against
  // a report length and fail as a mismatch, which is the same misreading as an
  // absent entry one step later: the arm is fine and the registry is not.
  // `String` rather than `JSON.stringify`, which renders NaN and Infinity alike
  // as `null` and throws outright on a BigInt, losing the message it was building.
  if (!Number.isInteger(expected) || expected <= 0) {
    throw new Error(
      `eval-quality publishes ${String(expected)} as the outcome count for the "${arm}" conformance arm, which is not a positive whole number of assertions.`,
    );
  }
  return expected;
}

module.exports = { expectedOutcomeCount };
