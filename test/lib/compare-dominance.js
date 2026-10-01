/**
 * TeA's door to `eval-quality`'s `compareDominance` (AD-7) for its own tests
 * and tools.
 *
 * The logic is the runtime's since Story 2.1: `cli/lib/evaluate/compare.js`
 * holds `compareStoredResults`, which checks `comparabilityKey` ahead of the
 * package and refuses distinctly, with the reason, because the package answers
 * `'incomparable'` both when two results do not measure the same scoring policy
 * and probe set and when they agree and a component-wise comparison finds no
 * winner. This file keeps the names its callers import; it holds no logic and
 * no TeA data of its own, since the one TeA input (the scoring policy's
 * `severityFloor`) is each caller's own argument.
 *
 * Usage: `await compareStoredResults(a, b, severityFloor)`, where `a` and `b`
 * are each the `{outcomes, strength, comparabilityKey, scoredProbeId,
 * reducedProbeOutcomes, trials}` slice of a stored `EvidenceArtifact` and
 * `severityFloor` is the scoring policy's own declared floor
 * (`test/probes/scoring-policy.json`'s `severityFloor`, read through
 * `scoringPolicy()` in `./eval-quality-inputs.js`).
 */

'use strict';

const { compareStoredResults, refusalReason } = require('../../cli/lib/evaluate/compare');

module.exports = { compareStoredResults, refusalReason };
