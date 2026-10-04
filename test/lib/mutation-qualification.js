/**
 * The mutation cycle every probe corpus qualifies its controlled-mutation probes
 * through (AD-8, Stories 1.49 and 1.99).
 *
 * A controlled-mutation probe says one edit to a stored artifact turns a run the
 * oracle it names accepts into a run it rejects. `tools/generate-probes.js` used
 * to state `rollbackVerified: true` for such a probe because both artifacts sit
 * side by side on disk. Two stored files prove no rollback, so this module
 * performs the cycle with the runtime's own `runMutationCycle`
 * (`cli/lib/evaluate/mutation.js`):
 *
 *   1. a disposable workspace receives a copy of the stored reference artifact;
 *   2. the clean arm scores it, and the oracle must hold;
 *   3. one `replace-exact` mutation, derived from the reference and the stored mutated artifact, is applied;
 *   4. the mutated arm scores it, and the oracle must be violated;
 *   5. the original bytes are restored and their digest compared with the pre-mutation one;
 *   6. the clean arm runs again and must hold.
 *
 * Only that sequence yields `rollbackVerified: true`; the value is the cycle's own
 * conjunction of the digest equality and the clean rerun, and this module returns
 * the cycle's evidence and states the flag nowhere. A step that fails throws a
 * `QualificationError` and the caller emits no probe.
 *
 * What an arm is belongs to the corpus: the test-design corpus scores a document
 * with the replay projection, the others resolve the probe's own oracle over the
 * artifact. The caller supplies it. When the caller also supplies the results the
 * stored runs record, each arm's result must equal the one it stands for, so the
 * evidence a probe cites is the evidence the cycle performed. The two stored
 * artifacts are digested before and after the cycle and must not change, and the
 * workspace is removed in `finally`.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');

const { QUALIFICATION_EXITS, QualificationError, countOccurrences, runMutationCycle } = require('../../cli/lib/evaluate/mutation');
const { loadEngine } = require('../../cli/lib/evaluate/engine');
const { WorkspaceRefusal, makePrivateParent, makeScratchDirectory, removeScratchDirectory } = require('../../cli/lib/evaluate/workspace');
const { removeDeadPrivateParents } = require('./scratch-directories');

/**
 * The scorers here are deterministic, so a clean arm that failed after a byte-exact restore would be a
 * harness that does not reproduce its own result. The cycle re-runs it once and no more.
 */
const RE_EXECUTION_CAP = 0;

/** Splits text into lines that keep their terminators, so joining them returns the text. */
function linesOf(text) {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

/**
 * The one `replace-exact` operator that turns `original` into `mutated`.
 *
 * The lines the two documents share at both ends are trimmed away. What is left is widened by whole lines
 * of context until it occurs in `original` exactly once, which the operator requires and which a pure
 * insertion (an empty `find`) needs before it has an anchor at all. An operator that has to span the whole
 * original is refused: it is the edit that turns any file into any other, and names no mutation.
 *
 * @param {string} original
 * @param {string} mutated
 * @returns {{find: string, replace: string}}
 * @throws {QualificationError} when the two documents are the same, or no operator narrower than the whole of `original` reproduces `mutated`
 */
function deriveReplaceExact(original, mutated) {
  if (original === mutated) {
    throw new QualificationError(
      QUALIFICATION_EXITS.authoring,
      'the stored mutated artifact is byte for byte the reference artifact, so no mutation exists',
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
  // Each pass widens by a line on either side, so a span that is still not unique after every line has been added never will be.
  for (let widened = 0; widened <= before.length; widened += 1) {
    const candidate = span();
    if (countOccurrences(Buffer.from(original), Buffer.from(candidate.find)) === 1) {
      // Any two files differ by "replace the whole reference", so an operator that spans every line proves no edit: a stored
      // twin has to differ from its reference by a bounded one.
      if (start === 0 && endBefore === before.length) {
        throw new QualificationError(
          QUALIFICATION_EXITS.authoring,
          'the only exact operator over whole lines replaces the whole reference artifact, so the stored mutated artifact is not one edit of it',
        );
      }
      return candidate;
    }
    if (start > 0) start -= 1;
    if (endBefore < before.length) {
      endBefore += 1;
      endAfter += 1;
    }
  }
  throw new QualificationError(
    QUALIFICATION_EXITS.authoring,
    'no replace-exact operator over whole lines reproduces the stored mutated artifact',
  );
}

/** The digest the cycle's evidence uses (eval-quality's `digestBytes`) of a stored file's bytes. */
async function digestStoredFile(file) {
  return (await loadEngine()).digestBytes(fs.readFileSync(file));
}

let reaped = false;

/** Removes the private parents of runs that were killed, once per process, as the test suites do before they start. */
function reapDeadWorkspaces() {
  if (reaped) return;
  reaped = true;
  removeDeadPrivateParents();
}

/**
 * Qualifies one controlled-mutation probe in a disposable copy.
 *
 * @param {object} options
 * @param {string} options.mutationId the cycle's label, for its messages
 * @param {string} options.targetArtifact the artifact's path inside the workspace, with forward slashes
 * @param {string} options.referencePath absolute path of the stored reference artifact, the one the clean arm accepts
 * @param {string} options.mutatedPath absolute path of the stored mutated artifact the one exact edit yields
 * @param {(arm: {phase: string, file: string, text: string}) => Promise<{verdict: string, result?: object}>|{verdict: string, result?: object}} options.arm
 *   one arm; it reads the workspace file, so each phase scores the bytes that phase holds
 * @param {{baseline: object, mutated: object}} [options.stored] the results the stored runs record; each arm's result must equal its own
 * @param {(bytes: Uint8Array) => string} [options.digestBytes] eval-quality's own by default
 * @returns {Promise<{mutation: object, evidence: object}>} the cycle's own evidence, `rollbackVerified` included
 * @throws {QualificationError} at the first step that fails; no qualified probe follows
 */
async function qualifyStoredMutation({ mutationId, targetArtifact, referencePath, mutatedPath, arm, stored, digestBytes }) {
  const digestOf = digestBytes ?? (await loadEngine()).digestBytes;
  const reference = fs.readFileSync(referencePath);
  const mutatedStored = fs.readFileSync(mutatedPath);
  const sourceDigests = [digestOf(reference), digestOf(mutatedStored)];
  // A mutation operator is text, so an artifact that does not read back as the bytes it holds cannot be edited exactly.
  for (const [label, bytes] of [
    ['reference', reference],
    ['stored mutated', mutatedStored],
  ]) {
    if (!Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes)) {
      throw new QualificationError(
        QUALIFICATION_EXITS.authoring,
        `${mutationId}: the ${label} artifact is not valid UTF-8, so no exact text mutation can reproduce it`,
      );
    }
  }

  const mutation = {
    mutationId,
    targetArtifact,
    operator: {
      kind: 'replace-exact',
      ...deriveReplaceExact(reference.toString('utf8'), mutatedStored.toString('utf8')),
      occurrences: 1,
    },
  };

  reapDeadWorkspaces();
  // The runtime's convention for a disposable directory: a pid-named parent under the user's private root,
  // outside the checkout whatever TMPDIR is, removed when the cycle ends. A signal ends the process by its
  // default action, since a handler cannot run inside a cycle whose arm is synchronous and would only swallow
  // the signal; the dead process's parent is reclaimed by the next cycle (`reapDeadWorkspaces`).
  const scratch = [];
  let parent;
  let root;
  try {
    parent = makePrivateParent(scratch);
    root = makeScratchDirectory(scratch, 'design-qualification-');
  } catch (error) {
    if (!(error instanceof WorkspaceRefusal)) throw error;
    throw new QualificationError(QUALIFICATION_EXITS.infrastructure, `${mutationId}: ${error.message}`);
  }
  try {
    const file = path.join(root, ...targetArtifact.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, reference);
    const runArm = async (phase) => {
      const text = fs.readFileSync(file, 'utf8');
      return arm({ phase, file, text });
    };
    const evidence = await runMutationCycle({ root, mutation, runArm, reExecutionCap: RE_EXECUTION_CAP, digestBytes: digestOf });
    // The evidence a probe cites is the evidence the cycle performed: every arm scored what the stored
    // run records for the document it read.
    if (stored !== undefined) {
      const expectations = [
        ['baseline', evidence.baseline, stored.baseline],
        ['mutated', evidence.mutated, stored.mutated],
        ...evidence.rePasses.map((rePass, index) => [`re-pass-${index + 1}`, rePass, stored.baseline]),
      ];
      for (const [phase, performed, recorded] of expectations) {
        if (!isDeepStrictEqual(performed.result, recorded)) {
          throw new QualificationError(
            QUALIFICATION_EXITS.infrastructure,
            `${mutationId}: the ${phase} arm scored a result that differs from the one the stored run records, so the stored evidence is not what the cycle performed`,
            evidence,
          );
        }
      }
    }

    // The adopter's tree is untouched: the stored artifacts hold the bytes they held before the cycle.
    const after = [digestOf(fs.readFileSync(referencePath)), digestOf(fs.readFileSync(mutatedPath))];
    if (!isDeepStrictEqual(sourceDigests, after)) {
      throw new QualificationError(
        QUALIFICATION_EXITS.infrastructure,
        `${mutationId}: a stored artifact changed while its mutation was qualified, so the cycle reached outside its workspace`,
        evidence,
      );
    }
    return { mutation, evidence };
  } finally {
    removeScratchDirectory(parent);
  }
}

module.exports = { RE_EXECUTION_CAP, deriveReplaceExact, digestStoredFile, qualifyStoredMutation };
