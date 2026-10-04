/**
 * Mutation qualification for the test-design probe corpus (AD-8, Story 1.49).
 *
 * A test-design controlled-mutation probe says one edit to the reference design
 * produces the stored seeded design, and that the oracle it names holds on the
 * first and is violated by the second. The cycle that proves it, and the
 * derivation of the exact edit from the two documents, are
 * `test/lib/mutation-qualification.js`, shared with the test-review, trace, nfr
 * and ci corpora (Story 1.99). This module supplies the test-design arm:
 * `scoreDocument`, the same projection `test/test-eval-replay.js` stores
 * (`projectTestDesignResult`), read for the oracle's own polarity. Each arm's
 * result is also held against the result the stored run records, so the
 * evidence a probe cites is the evidence the cycle performed.
 *
 * Only the cycle yields `rollbackVerified: true`; this module returns the
 * cycle's evidence and states the flag nowhere.
 */

'use strict';

const { QUALIFICATION_EXITS, QualificationError } = require('../../cli/lib/evaluate/mutation');
const { deriveReplaceExact, qualifyStoredMutation } = require('./mutation-qualification');
const { projectTestDesignResult } = require('./test-design-result');

/** The design's name inside the workspace; the mutation's `targetArtifact`, relative to the workspace root. */
const TARGET_ARTIFACT = 'design.md';

/**
 * Whether one oracle holds on one scored run, or null when the run records no answer for it.
 *
 * A run the harness refused as unparseable never reached `documentMentions`, so a vocabulary oracle has no
 * reading there and the run is left out of that oracle's evidence.
 *
 * @param {{kind: string, oracleId: string, risk: {id: string}|null}} entry the corpus entry the oracle was generated from
 * @param {object} result a projected run
 * @returns {boolean|null}
 */
function testDesignOracleHolds(entry, result) {
  if (entry.kind === 'run-measured') return result.unmeasurable === undefined && result.shape.rows > 0;
  if (entry.kind === 'projection-coherence') {
    throw new QualificationError(
      QUALIFICATION_EXITS.authoring,
      `${entry.oracleId} guards the runner's projection, which no stored design can make incoherent, so no stored run evidences it`,
    );
  }
  if (result.unmeasurable !== undefined) return null;
  const mentioned = result.mentions[entry.risk.id];
  if (typeof mentioned !== 'boolean') {
    throw new QualificationError(
      QUALIFICATION_EXITS.authoring,
      `a stored run records no mention of ${entry.risk.id}, which ${entry.oracleId} reads`,
    );
  }
  return entry.kind === 'material-vocabulary' ? mentioned : !mentioned;
}

/**
 * The default arm: the workspace's design, scored the way the replay corpus scores a stored one, and
 * read for the oracle's polarity.
 *
 * @returns {{verdict: 'held'|'violated'|'inconclusive', result: object}}
 */
function scoreDocument({ text, entry, set, categories }) {
  const result = projectTestDesignResult(text, set, categories);
  const holds = testDesignOracleHolds(entry, result);
  return { verdict: holds === true ? 'held' : holds === false ? 'violated' : 'inconclusive', result };
}

/**
 * Qualifies one test-design controlled-mutation probe in a disposable copy.
 *
 * @param {object} options
 * @param {string} options.mutationId the cycle's label, for its messages
 * @param {string} options.referencePath absolute path of the stored reference design
 * @param {string} options.mutatedPath absolute path of the stored seeded design
 * @param {{kind: string, oracleId: string, risk: object|null}} options.entry the oracle the probe names
 * @param {object} options.set the fixture set both documents are scored against
 * @param {Set<string>} options.categories the workflow's risk categories
 * @param {{baseline: object, mutated: object}} options.stored the results the stored runs record
 * @param {(arm: {phase: string, file: string, text: string, entry: object, set: object, categories: Set<string>}) => Promise<object>|object} [options.arm]
 *   one arm; `scoreDocument` by default
 * @param {(bytes: Uint8Array) => string} [options.digestBytes] eval-quality's own by default
 * @returns {Promise<{mutation: object, evidence: object}>} the cycle's own evidence, `rollbackVerified` included
 * @throws {QualificationError} at the first step that fails; no qualified probe follows
 */
async function qualifyTestDesignMutation({
  mutationId,
  referencePath,
  mutatedPath,
  entry,
  set,
  categories,
  stored,
  arm = scoreDocument,
  digestBytes,
}) {
  return qualifyStoredMutation({
    mutationId,
    targetArtifact: TARGET_ARTIFACT,
    referencePath,
    mutatedPath,
    stored,
    digestBytes,
    arm: ({ phase, file, text }) => arm({ phase, file, text, entry, set, categories }),
  });
}

module.exports = {
  TARGET_ARTIFACT,
  deriveReplaceExact,
  qualifyTestDesignMutation,
  scoreDocument,
  testDesignOracleHolds,
};
