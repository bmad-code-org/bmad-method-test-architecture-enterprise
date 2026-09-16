/**
 * A TEA-level wrapper around `eval-quality`'s own `compareDominance` (AD-7),
 * closing the one gap the package leaves to its caller.
 *
 * The package's `compareDominance` returns the same four-valued
 * `'incomparable'` whether two results disagree on `comparabilityKey` (they
 * do not measure the same scoring-policy-and-probe-set at all) or whether
 * they agree and a genuine component-wise comparison finds no winner. A
 * caller that treats that string as one of four ordinary verdicts would
 * silently accept "these two runs are not comparable in the first place" as
 * a measured tie. `compareStoredResults` checks `comparabilityKey` first and
 * refuses distinctly, with the reason, before the package ever runs.
 * Everything else — including each side's own `strength.comparable`, which
 * the package already checks and folds into its own `'incomparable'`
 * answer — is left untouched: this wrapper adds one check ahead of the
 * package's, it does not relax or duplicate what the package already does.
 *
 * Usage: `await compareStoredResults(a, b, severityFloor)`, where `a` and
 * `b` are each the `{outcomes, strength, comparabilityKey}` slice of a
 * stored `EvidenceArtifact` (`eval-quality`'s own `ComparableResult` shape),
 * and `severityFloor` is the scoring policy's own declared floor
 * (`test/probes/scoring-policy.json`'s `severityFloor`, read through
 * `scoringPolicy()` in `./eval-quality-inputs.js`).
 */

'use strict';

const { loadEvalQuality } = require('./eval-quality-inputs');

/**
 * `null` when both sides measure the same scoring-policy-and-probe-set, the
 * reason string otherwise.
 * @param {{comparabilityKey: string}} a
 * @param {{comparabilityKey: string}} b
 * @returns {string | null}
 */
function refusalReason(a, b) {
  if (a.comparabilityKey === b.comparabilityKey) return null;
  return (
    `comparabilityKey differs (${a.comparabilityKey} vs ${b.comparabilityKey}): the two results do not ` +
    'measure the same scoring policy and probe set, so no relation between them is meaningful'
  );
}

/**
 * @param {{outcomes: object[], strength: object, comparabilityKey: string}} a
 * @param {{outcomes: object[], strength: object, comparabilityKey: string}} b
 * @param {string} severityFloor
 * @returns {Promise<{ok: true, relation: string} | {ok: false, reason: string}>}
 */
async function compareStoredResults(a, b, severityFloor) {
  const reason = refusalReason(a, b);
  if (reason !== null) return { ok: false, reason };
  const { compareDominance } = await loadEvalQuality();
  return { ok: true, relation: compareDominance(a, b, severityFloor) };
}

module.exports = { compareStoredResults, refusalReason };
