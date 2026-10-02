/**
 * Mutation qualification for the test-design probe corpus (AD-8, Story 1.49).
 *
 * A test-design controlled-mutation probe says one edit to the reference design
 * produces the stored seeded design, and that the oracle it names holds on the
 * first and is violated by the second. `tools/generate-probes.js` used to state
 * `rollbackVerified: true` for it because both documents sit side by side on
 * disk. Two stored files prove no rollback, so this module performs the cycle
 * instead, with the runtime's own `runMutationCycle` (`cli/lib/evaluate/mutation.js`):
 *
 *   1. a disposable workspace receives a copy of the reference design;
 *   2. the clean arm scores it, and the oracle must hold;
 *   3. one `replace-exact` mutation, derived from the two stored documents, is applied;
 *   4. the mutated arm scores it, and the oracle must be violated;
 *   5. the original bytes are restored and their digest compared with the pre-mutation one;
 *   6. the clean arm runs again and must hold.
 *
 * Only that sequence yields `rollbackVerified: true`; the value is the cycle's
 * own conjunction of the digest equality and the clean rerun, never a constant.
 * A step that fails throws a `QualificationError` and the caller emits no probe.
 *
 * An arm is `scoreDocument`: the same projection `test/test-eval-replay.js`
 * stores (`projectTestDesignResult`), read for the oracle's own polarity. Each
 * arm's result is also held against the result the stored run records, so the
 * evidence a probe cites is the evidence the cycle performed. The two stored
 * documents are digested before and after the cycle and must not change, and
 * the workspace is removed in `finally`.
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');

const { QUALIFICATION_EXITS, QualificationError, countOccurrences, runMutationCycle } = require('../../cli/lib/evaluate/mutation');
const { loadEngine } = require('../../cli/lib/evaluate/engine');
const { projectTestDesignResult } = require('./test-design-result');

/** The design's name inside the workspace; the mutation's `targetArtifact`, relative to the workspace root. */
const TARGET_ARTIFACT = 'design.md';

/**
 * The scorer is deterministic, so a clean arm that failed after a byte-exact restore would be a
 * harness that does not reproduce its own result. The cycle re-runs it once and no more.
 */
const RE_EXECUTION_CAP = 0;

/**
 * Whether one oracle holds on one scored run, or null when the run records no answer for it.
 *
 * A run the harness refused as unparseable never reached `documentMentions`, so a vocabulary oracle has no
 * reading there and the run is left out of that oracle's evidence rather than counted as a violation it did
 * not record.
 *
 * @param {{kind: string, oracleId: string, risk: {id: string}|null}} entry the corpus entry the oracle was generated from
 * @param {object} result a projected run
 * @returns {boolean|null}
 */
function testDesignOracleHolds(entry, result) {
  if (entry.kind === 'run-measured') return result.unmeasurable === undefined && result.shape.rows > 0;
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

/** Splits text into lines that keep their terminators, so joining them returns the text. */
function linesOf(text) {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

/**
 * The one `replace-exact` operator that turns `original` into `mutated`.
 *
 * The lines the two documents share at both ends are trimmed away. What is left is widened by whole lines
 * of context until it occurs in `original` exactly once, which the operator requires and which a pure
 * insertion (an empty `find`) needs before it has an anchor at all.
 *
 * @param {string} original
 * @param {string} mutated
 * @returns {{find: string, replace: string}}
 * @throws {QualificationError} when the two documents are the same, or no operator reproduces `mutated`
 */
function deriveReplaceExact(original, mutated) {
  if (original === mutated) {
    throw new QualificationError(
      QUALIFICATION_EXITS.authoring,
      'the stored mutated design is byte for byte the reference design, so no mutation exists',
    );
  }
  const before = linesOf(original);
  const after = linesOf(mutated);
  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head += 1;
  let tail = 0;
  while (tail < before.length - head && tail < after.length - head && before.at(-1 - tail) === after.at(-1 - tail)) tail += 1;

  let start = head;
  let endBefore = before.length - tail;
  let endAfter = after.length - tail;
  const span = () => ({ find: before.slice(start, endBefore).join(''), replace: after.slice(start, endAfter).join('') });
  while (countOccurrences(Buffer.from(original), Buffer.from(span().find)) !== 1) {
    if (start === 0 && endBefore === before.length) {
      throw new QualificationError(
        QUALIFICATION_EXITS.authoring,
        'no replace-exact operator over whole lines reproduces the stored mutated design',
      );
    }
    if (start > 0) start -= 1;
    if (endBefore < before.length) {
      endBefore += 1;
      endAfter += 1;
    }
  }
  return span();
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

/** A result as it reads back from disk: JSON drops the members a projection leaves undefined. */
function asStored(result) {
  if (result === undefined) return result;
  // eslint-disable-next-line unicorn/prefer-structured-clone -- structuredClone keeps undefined members, which a stored result cannot hold
  return JSON.parse(JSON.stringify(result));
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
 * @returns {Promise<{mutation: object, evidence: object, rollbackVerified: boolean}>}
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
  const digestOf = digestBytes ?? (await loadEngine()).digestBytes;
  const reference = fs.readFileSync(referencePath);
  const mutatedStored = fs.readFileSync(mutatedPath);
  const sourceDigests = [digestOf(reference), digestOf(mutatedStored)];
  // A mutation operator is text, so a design that does not read back as the bytes it holds cannot be edited exactly.
  for (const [label, bytes] of [
    ['reference', reference],
    ['stored seeded', mutatedStored],
  ]) {
    if (!Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes)) {
      throw new QualificationError(
        QUALIFICATION_EXITS.authoring,
        `${mutationId}: the ${label} design is not valid UTF-8, so no exact text mutation can reproduce it`,
      );
    }
  }

  const mutation = {
    mutationId,
    targetArtifact: TARGET_ARTIFACT,
    operator: {
      kind: 'replace-exact',
      ...deriveReplaceExact(reference.toString('utf8'), mutatedStored.toString('utf8')),
      occurrences: 1,
    },
  };

  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'tea-design-qualification-'));
  try {
    const file = path.join(root, TARGET_ARTIFACT);
    fs.writeFileSync(file, reference);
    const runArm = async (phase) => {
      const text = fs.readFileSync(file, 'utf8');
      return arm({ phase, file, text, entry, set, categories });
    };
    const evidence = await runMutationCycle({ root, mutation, runArm, reExecutionCap: RE_EXECUTION_CAP, digestBytes: digestOf });
    if (evidence.rollbackVerified !== true) {
      throw new QualificationError(
        QUALIFICATION_EXITS.infrastructure,
        `${mutationId}: the cycle ended without a verified rollback, so no probe may claim one`,
        evidence,
      );
    }

    // The mutation the cycle applied is the edit that yields the stored seeded design, byte for byte.
    if (evidence.mutatedDigest !== sourceDigests[1]) {
      throw new QualificationError(
        QUALIFICATION_EXITS.infrastructure,
        `${mutationId}: the mutated design digests to ${evidence.mutatedDigest}, not the stored seeded design's ${sourceDigests[1]}, so the mutated arm did not read the bytes the probe cites`,
        evidence,
      );
    }

    // The evidence a probe cites is the evidence the cycle performed: every arm scored what the stored
    // run records for the document it read.
    const expectations = [
      ['baseline', evidence.baseline, stored.baseline],
      ['mutated', evidence.mutated, stored.mutated],
      ...evidence.rePasses.map((rePass, index) => [`re-pass-${index + 1}`, rePass, stored.baseline]),
    ];
    for (const [phase, performed, recorded] of expectations) {
      if (!isDeepStrictEqual(asStored(performed.result), recorded)) {
        throw new QualificationError(
          QUALIFICATION_EXITS.infrastructure,
          `${mutationId}: the ${phase} arm scored a result that differs from the one the stored run records, so the stored evidence is not what the cycle performed; run npm run test:eval-replay`,
          evidence,
        );
      }
    }

    // The adopter's tree is untouched: the stored documents hold the bytes they held before the cycle.
    const after = [digestOf(fs.readFileSync(referencePath)), digestOf(fs.readFileSync(mutatedPath))];
    if (!isDeepStrictEqual(sourceDigests, after)) {
      throw new QualificationError(
        QUALIFICATION_EXITS.infrastructure,
        `${mutationId}: a stored design changed while its mutation was qualified, so the cycle reached outside its workspace`,
        evidence,
      );
    }
    return { mutation, evidence, rollbackVerified: evidence.rollbackVerified };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

module.exports = {
  TARGET_ARTIFACT,
  deriveReplaceExact,
  qualifyTestDesignMutation,
  scoreDocument,
  testDesignOracleHolds,
};
