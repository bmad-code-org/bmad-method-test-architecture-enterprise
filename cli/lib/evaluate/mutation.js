/**
 * Controlled mutation and its rollback proof (AD-8), generalized from the
 * mutate, measure, restore cycle TeA's automate-eval fixture proved live
 * first.
 *
 * A mutation is `mutations/M-NNN.mutation.json`: a `targetArtifact` relative to
 * `launch.root` and a `replace-exact` operator whose `find` text must occur in
 * the file exactly once. It is only ever applied inside a disposable workspace,
 * never to the adopter's tree.
 *
 * `runMutationCycle` runs AD-8's six steps in order over one workspace:
 *
 *   1. the clean arm, which must pass (the baseline-pass evidence);
 *   2. the mutation, applied;
 *   3. the mutated arm, which must fail (the mutated-fail evidence);
 *   4. the original bytes, restored (also when step 3 throws);
 *   5. the restored bytes' digest and mode, compared with the pre-mutation
 *      ones;
 *   6. the baseline arm again, until it passes, at most `1 + reExecutionCap`
 *      times.
 *
 * `rollbackVerified` is the conjunction of step 5's equality and step 6's pass,
 * computed here, never written as a constant (`test:evaluate-boundaries` refuses
 * a `rollbackVerified: true` literal anywhere under `cli/`). A step that fails
 * throws a `QualificationError` carrying AD-10's exit and the evidence gathered
 * so far: 10 for an occurrence count other than 1 or a target that is not a
 * regular file, 11 for a baseline that does not pass or a mutated arm that does
 * not fail, 12 for a mutation or restore that cannot be written, a restore
 * whose digest or mode differs, an arm that cannot run, or a restored
 * workspace that does not pass again within the cap (eval-quality reads a
 * re-execution cap exceeded as an unfit harness). An arm is the caller's: a function of the phase that
 * reports `held` (the oracles hold), `violated` (one fails) or `inconclusive`.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { expectedSchemaVersion, loadEngine } = require('./engine');
const { isInside } = require('./workspace');

/** AD-10's exits for a qualification that stops. */
const QUALIFICATION_EXITS = Object.freeze({ authoring: 10, weakness: 11, infrastructure: 12 });

/** A mutation cycle step that failed; `exitCode` is AD-10's, and `evidence` what the cycle had gathered. */
class QualificationError extends Error {
  constructor(exitCode, message, evidence = null) {
    super(message);
    this.name = 'QualificationError';
    this.exitCode = exitCode;
    this.evidence = evidence;
  }
}

/** How often `find` occurs in `bytes`, overlapping occurrences included, so `abab` occurs twice in `ababab`. */
function countOccurrences(bytes, find) {
  if (find.length === 0) return 0;
  let count = 0;
  for (let at = bytes.indexOf(find); at !== -1; at = bytes.indexOf(find, at + 1)) count += 1;
  return count;
}

/**
 * The bytes a `replace-exact` mutation turns the target into, without writing
 * them: the file, its original bytes and its mutated bytes.
 *
 * The directory holding the file must resolve, links followed, inside
 * `within` (the workspace directory), and that real directory is recorded,
 * so the cycle can refuse to write or read through a path an arm later
 * swapped for a link, `launch.root` itself or any directory above it
 * included. A link inside the workspace (one the workspace already contains)
 * is followed like any directory.
 *
 * @param {string} root the workspace's `launch.root`
 * @param {{mutationId: string, targetArtifact: string, operator: {find: string, replace: string}}} mutation
 * @param {object} [options]
 * @param {string} [options.within] the directory every write and read must stay inside; `root` by default
 * @returns {{ file: string, original: Buffer, mutated: Buffer, mode: number, realDirectory: string }}
 * @throws {QualificationError} exit 10 for a target that is not a regular file or a `find` that does not occur exactly once, exit 12 for one outside `within`
 */
function planReplaceExact(root, mutation, { within = root } = {}) {
  const file = path.join(root, ...mutation.targetArtifact.split('/'));
  let stats;
  try {
    stats = fs.lstatSync(file);
  } catch {
    throw new QualificationError(
      QUALIFICATION_EXITS.authoring,
      `${mutation.mutationId}: targetArtifact ${mutation.targetArtifact} does not exist in the workspace`,
    );
  }
  if (stats.isFile() && stats.nlink > 1) {
    throw new QualificationError(
      QUALIFICATION_EXITS.infrastructure,
      `${mutation.mutationId}: targetArtifact ${mutation.targetArtifact} shares its data with ${stats.nlink - 1} other path(s) (a hard link), which a write could reach outside the workspace`,
    );
  }
  if (!stats.isFile()) {
    throw new QualificationError(
      QUALIFICATION_EXITS.authoring,
      `${mutation.mutationId}: targetArtifact ${mutation.targetArtifact} is ${stats.isSymbolicLink() ? 'a symbolic link' : 'not a regular file'}; name the file itself`,
    );
  }
  const realWithin = fs.realpathSync.native(within);
  const realDirectory = fs.realpathSync.native(path.dirname(file));
  if (!isInside(realWithin, realDirectory)) {
    throw new QualificationError(
      QUALIFICATION_EXITS.infrastructure,
      `${mutation.mutationId}: the directory holding targetArtifact ${mutation.targetArtifact} resolves to ${realDirectory}, outside the workspace ${realWithin}, so a write to it would leave the workspace`,
    );
  }
  const original = fs.readFileSync(file);
  const find = Buffer.from(mutation.operator.find, 'utf8');
  const occurrences = countOccurrences(original, find);
  if (occurrences !== 1) {
    throw new QualificationError(
      QUALIFICATION_EXITS.authoring,
      `${mutation.mutationId}: ${mutation.targetArtifact} holds ${occurrences} occurrence(s) of the operator's find text; replace-exact needs exactly 1`,
    );
  }
  const at = original.indexOf(find);
  const mutated = Buffer.concat([
    original.subarray(0, at),
    Buffer.from(mutation.operator.replace, 'utf8'),
    original.subarray(at + find.length),
  ]);
  return { file, original, mutated, mode: stats.mode & 0o7777, realDirectory };
}

/**
 * Why the planned target no longer stays where it was planned, or null: the
 * directory holding it must still resolve, links followed, to the real
 * directory recorded at plan time, and the file must not have become a link.
 * An arm that swaps a directory on the path, `launch.root` or one above it
 * for a link (to the adopter's tree, say) would otherwise carry the runtime's
 * own write or read out of the workspace.
 */
function containmentProblem(planned) {
  let realDirectory;
  try {
    realDirectory = fs.realpathSync.native(path.dirname(planned.file));
  } catch {
    return 'the directory holding it no longer exists';
  }
  if (realDirectory !== planned.realDirectory) {
    return `the directory holding it now resolves to ${realDirectory}, not the workspace's ${planned.realDirectory}`;
  }
  try {
    const stats = fs.lstatSync(planned.file);
    if (stats.isSymbolicLink()) return 'it is now a symbolic link';
    if (stats.isFile() && stats.nlink > 1) return 'it now shares its data with another path (a hard link)';
  } catch {
    // A missing file is the restore's to report.
  }
  return null;
}

/** Stops the cycle (exit 12) when the target no longer stays where it was planned; an arm may have rewritten the path. */
function assertContained(planned, mutation, evidence, when) {
  const problem = containmentProblem(planned);
  if (problem === null) return;
  throw new QualificationError(
    QUALIFICATION_EXITS.infrastructure,
    `${mutation.mutationId}: ${when}, ${problem}, so the runtime will not write or read ${mutation.targetArtifact} through it`,
    evidence,
  );
}

/**
 * Replaces `file` with a new file holding `bytes` at `mode`: the old one is
 * removed first, so the write lands in a file of its own even when the old
 * one shared its data with another path (a hard link). A failure is an
 * infrastructure stop (exit 12) naming `what`.
 */
function writeOrStop(file, bytes, mode, what, evidence) {
  try {
    fs.rmSync(file, { force: true });
    fs.writeFileSync(file, bytes, { mode });
    fs.chmodSync(file, mode);
  } catch (error) {
    throw new QualificationError(QUALIFICATION_EXITS.infrastructure, `${what} could not be written: ${error.message}`, evidence);
  }
}

/**
 * Plans a `replace-exact` mutation and writes it.
 *
 * @returns {{ file: string, original: Buffer, mutated: Buffer }}
 * @throws {QualificationError}
 */
function applyReplaceExact(root, mutation, options) {
  const planned = planReplaceExact(root, mutation, options);
  writeOrStop(planned.file, planned.mutated, planned.mode, `${mutation.mutationId}'s mutation of ${mutation.targetArtifact}`, null);
  return planned;
}

/** A file's permission bits, or null when it cannot be read. */
function modeOf(file) {
  try {
    return fs.lstatSync(file).mode & 0o7777;
  } catch {
    return null;
  }
}

/** The digest of a file's current bytes, or null when it cannot be read. */
function digestOfFile(file, digestBytes) {
  try {
    return digestBytes(fs.readFileSync(file));
  } catch {
    return null;
  }
}

/**
 * AD-8's six steps over one workspace.
 *
 * @param {object} options
 * @param {string} options.root the workspace's `launch.root`
 * @param {string} [options.within] the workspace directory every write and read must stay inside; `root` by default
 * @param {object} options.mutation the parsed mutation file
 * @param {(phase: string) => Promise<{verdict: 'held'|'violated'|'inconclusive'}>} options.runArm
 *   the phase is `baseline`, `mutated`, or `re-pass-<n>`; anything else the arm returns is kept as evidence
 * @param {number} options.reExecutionCap the scoring policy's cap on re-running the baseline in step 6
 * @param {(bytes: Uint8Array) => string} [options.digestBytes] eval-quality's own by default
 * @param {(line: string) => void} [options.log]
 * @returns {Promise<object>} the evidence: the three digests, each arm's result, and `rollbackVerified`
 * @throws {QualificationError}
 */
async function runMutationCycle({ root, within = root, mutation, runArm, reExecutionCap, digestBytes, log = () => {} }) {
  const digestOf = digestBytes ?? (await loadEngine()).digestBytes;
  const planned = planReplaceExact(root, mutation, { within });
  const evidence = {
    mutationId: mutation.mutationId,
    targetArtifact: mutation.targetArtifact,
    preDigest: digestOf(planned.original),
    mutatedDigest: null,
    restoredDigest: null,
    reExecutionCap,
    baseline: null,
    mutated: null,
    rePasses: [],
    rollbackVerified: false,
  };

  // An arm that cannot run stops the cycle with the evidence so far: its
  // own exit when it names one (a denied request is 10), otherwise 12.
  const arm = async (phase) => {
    try {
      return await runArm(phase);
    } catch (error) {
      if (error instanceof QualificationError) throw error;
      const stop = new QualificationError(
        Number.isInteger(error?.exitCode) ? error.exitCode : QUALIFICATION_EXITS.infrastructure,
        `${mutation.mutationId}: the ${phase} arm could not run: ${error?.message ?? error}`,
        evidence,
      );
      stop.fault = { phase, code: typeof error?.code === 'string' ? error.code : null, message: String(error?.message ?? error) };
      throw stop;
    }
  };

  log(`${mutation.mutationId}: step 1, the clean arm`);
  evidence.baseline = await arm('baseline');
  if (evidence.baseline.verdict !== 'held') {
    throw new QualificationError(
      QUALIFICATION_EXITS.weakness,
      `${mutation.mutationId}: the clean arm did not pass (${evidence.baseline.verdict}) before the mutation, so a failure after it would prove nothing`,
      evidence,
    );
  }

  log(`${mutation.mutationId}: step 2, the mutation applied to ${mutation.targetArtifact}`);
  assertContained(planned, mutation, evidence, 'after the clean arm');
  writeOrStop(planned.file, planned.mutated, planned.mode, `${mutation.mutationId}'s mutation of ${mutation.targetArtifact}`, evidence);
  evidence.mutatedDigest = digestOfFile(planned.file, digestOf);
  try {
    log(`${mutation.mutationId}: step 3, the mutated arm`);
    evidence.mutated = await arm('mutated');
  } finally {
    log(`${mutation.mutationId}: step 4, the original bytes restored`);
    assertContained(planned, mutation, evidence, 'after the mutated arm');
    restoreArtifact(planned, mutation, evidence);
    assertContained(planned, mutation, evidence, 'after the restore');
    evidence.restoredDigest = digestOfFile(planned.file, digestOf);
  }

  log(`${mutation.mutationId}: step 5, the restored digest checked`);
  const restoredMode = modeOf(planned.file);
  if (evidence.restoredDigest !== evidence.preDigest || restoredMode !== planned.mode) {
    throw new QualificationError(
      QUALIFICATION_EXITS.infrastructure,
      evidence.restoredDigest === evidence.preDigest
        ? `${mutation.mutationId}: the restored ${mutation.targetArtifact} has mode ${restoredMode?.toString(8)}, not the pre-mutation ${planned.mode.toString(8)}`
        : `${mutation.mutationId}: the restored ${mutation.targetArtifact} digests to ${evidence.restoredDigest}, not the pre-mutation ${evidence.preDigest}`,
      evidence,
    );
  }
  if (evidence.mutated.verdict !== 'violated') {
    throw new QualificationError(
      QUALIFICATION_EXITS.weakness,
      `${mutation.mutationId}: the mutated arm did not fail (${evidence.mutated.verdict}), so the probe's oracle does not catch this mutation`,
      evidence,
    );
  }

  const attempts = 1 + reExecutionCap;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    log(`${mutation.mutationId}: step 6, the baseline re-run (attempt ${attempt} of ${attempts})`);
    const rePass = await arm(`re-pass-${attempt}`);
    evidence.rePasses.push(rePass);
    assertContained(planned, mutation, evidence, `after re-pass ${attempt}`);
    if (rePass.verdict === 'held') break;
  }
  const rePassed = evidence.rePasses.at(-1)?.verdict === 'held';
  evidence.rollbackVerified = evidence.restoredDigest === evidence.preDigest && restoredMode === planned.mode && rePassed;
  if (!evidence.rollbackVerified) {
    // The target is byte for byte what it was, so a baseline that no longer
    // passes says the harness does not reproduce its own result: eval-quality
    // reads a re-execution cap exceeded as an unfit harness, never as a weak
    // contract.
    throw new QualificationError(
      QUALIFICATION_EXITS.infrastructure,
      `${mutation.mutationId}: the restored workspace did not pass the baseline again within ${attempts} run(s) (reExecutionCap ${reExecutionCap}), so the harness does not reproduce its baseline and the rollback is not proved`,
      evidence,
    );
  }
  return evidence;
}

/**
 * Step 4: the original bytes back in place, as a regular file of its own with
 * its original mode: whatever the mutated arm left at the path (a link, a hard
 * link) is removed first, and a directory there makes the restore fail.
 */
function restoreArtifact(planned, mutation, evidence) {
  writeOrStop(planned.file, planned.original, planned.mode, `the restore of ${mutation.targetArtifact}`, evidence);
}

/** The free-text operator eval-quality records, spelled from the operator itself. */
function describeOperator(operator) {
  return `replace-exact: ${JSON.stringify(operator.find)} -> ${JSON.stringify(operator.replace)} (occurrences ${operator.occurrences})`;
}

/**
 * The qualified probe a committed controlled-mutation probe becomes once its
 * cycle has run (AD-9): the authored fields, the runtime-owned digests and
 * lineage, the mutation file's fields, and the evidence references.
 *
 * @param {object} options
 * @param {object} options.probe the committed probe
 * @param {object} options.mutation the mutation file
 * @param {string} options.systemId
 * @param {{implementationDigest: string, artifactDigest: string, commitDigest: string}} options.digests
 * @param {object} options.baselinePassEvidence an artifact reference
 * @param {object} options.mutatedFailEvidence an artifact reference
 * @param {boolean} options.rollbackVerified the cycle's own result
 * @returns {object} a Probe
 */
function qualifiedProbe({ probe, mutation, systemId, digests, baselinePassEvidence, mutatedFailEvidence, rollbackVerified }) {
  return {
    schemaVersion: expectedSchemaVersion('probe'),
    parentDigest: null,
    revisionCount: 0,
    probeId: probe.probeId,
    probeClass: probe.probeClass,
    behaviorId: probe.behaviorId,
    systemId,
    implementationDigest: digests.implementationDigest,
    artifactDigest: digests.artifactDigest,
    commitDigest: digests.commitDigest,
    rationale: probe.rationale,
    qualification: {
      route: 'controlled-mutation',
      mutationSource: mutation.mutationSource,
      mutationOperator: describeOperator(mutation.operator),
      targetArtifact: { storage: 'public', path: mutation.targetArtifact, privateRef: null, digest: digests.artifactDigest },
      expectedObservableFailure: mutation.expectedObservableFailure,
      baselinePassEvidence,
      mutatedFailEvidence,
      rollbackVerified,
    },
    expectedClean: false,
    defects: probe.defects.map((defect) => ({
      defectId: defect.defectId,
      behaviorId: defect.behaviorId,
      summary: defect.summary,
      severity: defect.severity,
      oracleEvidence: [mutatedFailEvidence],
      source: defect.source,
      manifestationWitness: defect.manifestationWitness,
    })),
    defectSignature: probe.defectSignature ?? null,
  };
}

module.exports = {
  QUALIFICATION_EXITS,
  QualificationError,
  applyReplaceExact,
  countOccurrences,
  planReplaceExact,
  qualifiedProbe,
  runMutationCycle,
};
