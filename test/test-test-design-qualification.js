/**
 * A test-design probe claims `rollbackVerified: true` only after the mutation it
 * describes was qualified in a disposable copy (Story 1.49, AD-8).
 *
 * `tools/generate-probes.js` used to write the claim as a constant because the
 * reference design and the seeded design sit side by side on disk. This suite
 * holds the replacement, `test/lib/test-design-qualification.js`, which copies
 * the reference design into a workspace, scores the clean arm, applies one exact
 * mutation, scores the mutated arm, restores the original bytes, compares their
 * digest and scores the clean arm again, through the runtime's own
 * `runMutationCycle`.
 *
 * - The performed sequence: the arms run in AD-8's order against the bytes AD-8
 *   names (the reference, the stored seeded design, the reference again), the
 *   digests the evidence records agree, the stored designs hold their bytes, and
 *   `git status` of the whole checkout is what it was.
 * - The workspace: every cycle's directory lies outside the checkout and is gone
 *   afterwards, whether the cycle qualified or stopped. A signal ends a cycle by
 *   its default action, and the next cycle reclaims the dead process's parent.
 * - Each failing step, planted one at a time, stops the cycle with AD-10's exit
 *   and no qualified result: a clean arm that fails (11), a mutated arm that
 *   holds or is inconclusive (11), a restore that cannot be written (12), a
 *   restored digest that differs (12), a clean rerun that fails (12), a stored
 *   result the cycle did not reproduce in the baseline, mutated or rerun arm
 *   (12), an arm that returns no result (12), a stored reference or seeded design
 *   that changed during the cycle (12), and a stored design that is not UTF-8 or a
 *   vocabulary oracle with no reading (10).
 * - The generator: `buildTestDesignProbes` emits no probe when one cycle fails or
 *   reports a rollback it did not verify, every controlled-mutation probe it does
 *   emit carries its cycle's own result, and `writeCorpora` writes nothing when a
 *   later corpus cannot be built.
 * - The derived mutation: `deriveReplaceExact` over an insertion, a deletion, a
 *   replaced middle, a span that needs context on either side to be unique, and
 *   the documents it refuses: two that are the same, and two that only the whole
 *   reference turns into the other.
 *
 * Usage: node test/test-test-design-qualification.js
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');

const prettier = require('prettier');

const { privateRootBase, privateRootIn } = require('../cli/lib/evaluate/workspace');

const { QualificationError } = require('../cli/lib/evaluate/mutation');
const { loadEngine } = require('../cli/lib/evaluate/engine');
const { TARGET_ARTIFACT, deriveReplaceExact, qualifyTestDesignMutation, scoreDocument } = require('./lib/test-design-qualification');
const { GeneratorError, buildTestDesignProbes, loadGeneratorCorpus, run, writeCorpora } = require('../tools/generate-probes');
const { holdPrivateParents, scratchDirectories } = require('./lib/scratch-directories');

const PROJECT_ROOT = path.join(__dirname, '..');
const REPLAY_ROOT = path.join(PROJECT_ROOT, 'test', 'replay', 'test-design');
const GROUND_TRUTH = JSON.parse(
  fs.readFileSync(path.join(PROJECT_ROOT, 'test', 'fixtures', 'test-design-eval', 'ground-truth.json'), 'utf8'),
);
const CATEGORIES = new Set(GROUND_TRUTH.riskCategories ?? []);
const SEEDED = GROUND_TRUTH.fixtureSets.find((set) => (set.materialRisks ?? []).length > 0);
const COMMITTED_PROBES = path.join(PROJECT_ROOT, 'test', 'probes', 'test-design.probes.json');

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };
const failures = [];
let checks = 0;
const scratch = scratchDirectories('tea-test-design-qualification');

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

const replayDesign = (id) => path.join(REPLAY_ROOT, id, 'design.md');
const replayResult = (id) => JSON.parse(fs.readFileSync(path.join(REPLAY_ROOT, id, 'expected.json'), 'utf8')).result;

/** The git state of the whole checkout, so a cycle that wrote anywhere in the adopter's tree shows. */
function gitStatus() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: PROJECT_ROOT, env, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git status exited ${result.status}: ${result.stderr}`);
  return result.stdout;
}

/** Every workspace directory an arm ran in, so the suite can show each is outside the checkout and gone. */
const workspaces = new Set();

function track(input) {
  workspaces.add(path.dirname(input.file));
}

/** The real arm, with its workspace noted. */
function trackedScore(input) {
  track(input);
  return scoreDocument(input);
}

function checkWorkspacesGone(label) {
  for (const directory of workspaces) {
    check(!directory.startsWith(PROJECT_ROOT), `${label}: a workspace was made inside the checkout at ${directory}`);
    check(!fs.existsSync(directory), `${label}: the workspace ${directory} still exists`);
    check(!fs.existsSync(path.dirname(directory)), `${label}: the private parent ${path.dirname(directory)} still exists`);
  }
  workspaces.clear();
}

/**
 * One qualification over copies of two stored designs, so a case that tampers with a source
 * changes the copy and leaves the repository's stored design alone.
 */
function fixture(label, { mutatedId, entry, referenceId = 'seeded-correct-run' }) {
  const directory = scratch.make(label);
  const referencePath = path.join(directory, 'reference.md');
  const mutatedPath = path.join(directory, 'mutated.md');
  fs.copyFileSync(replayDesign(referenceId), referencePath);
  fs.copyFileSync(replayDesign(mutatedId), mutatedPath);
  return {
    mutationId: 'M-900',
    referencePath,
    mutatedPath,
    entry,
    set: SEEDED,
    categories: CATEGORIES,
    stored: { baseline: replayResult(referenceId), mutated: replayResult(mutatedId) },
  };
}

/** O-009 reads the browser category in a scored register row above the 1 to 3 guard band. */
const BROWSER_ENTRY = {
  kind: 'unsupported-vocabulary',
  oracleId: 'O-009',
  risk: SEEDED.unsupportedRisks.find((risk) => risk.id === 'browser-and-accessibility-regression'),
};
const BROWSER_CASE = { mutatedId: 'seeded-z-browser-risk-scored', entry: BROWSER_ENTRY };

/** An arm that records what it read, lets a case tamper first, and then scores like the real one. */
function recordingArm(trace, digestBytes, tamper = {}) {
  return async (input) => {
    track(input);
    const digestBefore = digestBytes(fs.readFileSync(input.file));
    trace.push({ phase: input.phase, file: input.file, digest: digestBefore, text: input.text });
    tamper[input.phase]?.(input);
    return scoreDocument({ ...input, text: fs.readFileSync(input.file, 'utf8') });
  };
}

async function outcome(options) {
  const before = process.cwd();
  try {
    return { qualified: await qualifyTestDesignMutation({ arm: trackedScore, ...options }) };
  } catch (error) {
    if (!(error instanceof QualificationError)) throw error;
    return { error };
  } finally {
    // A cycle that stops mid-way (a restore that cannot be written, say) still leaves the process where it found it.
    check(process.cwd() === before, `a cycle left the working directory at ${process.cwd()}, not ${before}`);
  }
}

async function checkPerformedSequence(digestBytes) {
  const options = fixture('performed', BROWSER_CASE);
  const trace = [];
  const statusBefore = gitStatus();
  const reference = fs.readFileSync(options.referencePath);
  const seeded = fs.readFileSync(options.mutatedPath);
  const { qualified, error } = await outcome({ ...options, arm: recordingArm(trace, digestBytes) });
  check(error === undefined && qualified?.evidence.rollbackVerified === true, `the browser mutation did not qualify: ${error?.message}`);
  if (qualified === undefined) return;

  const { evidence } = qualified;
  check(
    JSON.stringify(trace.map((step) => step.phase)) === JSON.stringify(['baseline', 'mutated', 're-pass-1']),
    `the arms ran as ${JSON.stringify(trace.map((step) => step.phase))}; AD-8 orders the clean arm, the mutated arm, then the clean rerun`,
  );
  check(trace[0]?.digest === digestBytes(reference), 'the clean arm did not read the reference design');
  check(
    trace[1]?.digest === digestBytes(seeded),
    'the mutated arm did not read the stored seeded design, so the mutation is not the edit that yields it',
  );
  check(trace[2]?.digest === digestBytes(reference), 'the clean rerun did not read the reference design');
  check(
    evidence.preDigest === digestBytes(reference) &&
      evidence.mutatedDigest === digestBytes(seeded) &&
      evidence.restoredDigest === evidence.preDigest,
    `the evidence records pre ${evidence.preDigest}, mutated ${evidence.mutatedDigest} and restored ${evidence.restoredDigest}`,
  );
  check(evidence.preDigest !== evidence.mutatedDigest, 'the mutation left the design unchanged');
  check(
    evidence.baseline.verdict === 'held' && evidence.mutated.verdict === 'violated' && evidence.rePasses.at(-1).verdict === 'held',
    'the arms did not hold, violate and hold in turn',
  );
  check(
    qualified.mutation.operator.occurrences === 1 && qualified.mutation.targetArtifact === TARGET_ARTIFACT,
    'the mutation is not one exact operator on the design',
  );
  checkWorkspacesGone('the performed sequence');
  check(
    digestBytes(fs.readFileSync(options.referencePath)) === digestBytes(reference) &&
      digestBytes(fs.readFileSync(options.mutatedPath)) === digestBytes(seeded),
    'a stored design changed',
  );
  check(gitStatus() === statusBefore, 'the checkout status moved while the mutation was qualified');
}

async function checkRealCorpus(digestBytes) {
  // The other two kinds of oracle, over the stored documents themselves.
  const material = SEEDED.materialRisks[0];
  const cases = [
    ['run-measured', { kind: 'run-measured', oracleId: 'O-001', risk: null }, 'seeded-register-absent'],
    ['material-vocabulary', { kind: 'material-vocabulary', oracleId: 'O-002', risk: material }, firstRunMissing(material)],
  ];
  for (const [label, entry, mutatedId] of cases) {
    check(mutatedId !== null, `no stored seeded run omits ${entry.risk?.id ?? 'the register'}`);
    if (mutatedId === null) continue;
    const { qualified, error } = await outcome({ ...fixture(label, { mutatedId, entry }), digestBytes });
    check(qualified?.evidence.rollbackVerified === true, `the ${label} mutation toward ${mutatedId} did not qualify: ${error?.message}`);
  }
}

/** The first stored run of the seeded set whose document never reaches the vocabulary of `risk`. */
function firstRunMissing(risk) {
  for (const id of fs.readdirSync(REPLAY_ROOT).sort()) {
    const stored = JSON.parse(fs.readFileSync(path.join(REPLAY_ROOT, id, 'expected.json'), 'utf8'));
    if (stored.inputs.fixtureSet === SEEDED.id && stored.result.unmeasurable === undefined && stored.result.mentions[risk.id] === false)
      return id;
  }
  return null;
}

async function checkFailingSteps(digestBytes) {
  const wrapped = async (label, tamper, extra = {}) =>
    outcome({ ...fixture(label, BROWSER_CASE), arm: recordingArm([], digestBytes, tamper), ...extra });
  const mutatedBytes = () => fs.readFileSync(replayDesign('seeded-z-browser-risk-scored'));
  const referenceBytes = () => fs.readFileSync(replayDesign('seeded-correct-run'));

  const brokenBaseline = await wrapped('baseline', { baseline: ({ file }) => fs.writeFileSync(file, mutatedBytes()) });
  check(
    brokenBaseline.error?.exitCode === 11 && brokenBaseline.qualified === undefined,
    `a clean arm that fails stopped with ${brokenBaseline.error?.exitCode ?? 'a qualified result'}; expected 11 and no result`,
  );

  const mutationHolds = await wrapped('mutation-holds', { mutated: ({ file }) => fs.writeFileSync(file, referenceBytes()) });
  check(
    mutationHolds.error?.exitCode === 11 && mutationHolds.qualified === undefined,
    `a mutated arm that holds stopped with ${mutationHolds.error?.exitCode ?? 'a qualified result'}; expected 11 and no result`,
  );

  // The mutated arm leaves a directory where the design was, so the restore cannot write it back.
  const failedRestore = await wrapped('restore', {
    mutated: ({ file }) => {
      fs.rmSync(file);
      fs.mkdirSync(file);
      fs.writeFileSync(path.join(file, 'kept'), 'x');
    },
  });
  check(
    failedRestore.error?.exitCode === 12 && /restore/.test(failedRestore.error.message) && failedRestore.qualified === undefined,
    `a restore that cannot be written stopped with ${failedRestore.error?.exitCode ?? 'a qualified result'}: ${failedRestore.error?.message}; expected 12 naming the restore`,
  );

  // A digest function that reads the original bytes as a third value once the mutated arm has run,
  // as a restore that wrote something else would.
  let mutatedArmRan = false;
  const driftingDigest = (bytes) =>
    mutatedArmRan && Buffer.from(bytes).equals(referenceBytes()) ? 'sha256:restored-bytes-that-differ' : digestBytes(bytes);
  const mismatched = await outcome({
    ...fixture('digest', BROWSER_CASE),
    arm: recordingArm([], digestBytes, {
      mutated: () => {
        mutatedArmRan = true;
      },
    }),
    digestBytes: driftingDigest,
  });
  check(
    mismatched.error?.exitCode === 12 && mismatched.error.message.includes('not the pre-mutation') && mismatched.qualified === undefined,
    `a restored digest that differs stopped with ${mismatched.error?.exitCode ?? 'a qualified result'}: ${mismatched.error?.message}; expected 12 at the digest check`,
  );
  check(mismatched.error?.evidence?.rollbackVerified === false, 'a restored digest that differs still recorded rollbackVerified');

  // The rerun fails its verdict while scoring what the stored run records, so only the cycle's own
  // reading of the rerun can stop it.
  const rerunFails = fixture('rerun', BROWSER_CASE);
  const failedRerun = await outcome({
    ...rerunFails,
    arm: async (input) => {
      const answer = trackedScore(input);
      return input.phase === 're-pass-1' ? { ...answer, verdict: 'violated' } : answer;
    },
  });
  check(
    failedRerun.error?.exitCode === 12 && failedRerun.qualified === undefined,
    `a clean rerun that fails stopped with ${failedRerun.error?.exitCode ?? 'a qualified result'}; expected 12 and no result`,
  );
  // And a rerun that reads wrong bytes is stopped by the stored evidence it no longer matches.
  const wrongRerun = await wrapped('rerun-bytes', { 're-pass-1': ({ file }) => fs.writeFileSync(file, mutatedBytes()) });
  check(wrongRerun.error?.exitCode === 12 && wrongRerun.qualified === undefined, 'a clean rerun over the mutated bytes still qualified');

  const drifted = await outcome({
    ...fixture('drift', BROWSER_CASE),
    stored: { ...fixture('drift-source', BROWSER_CASE).stored, mutated: { unmeasurable: 'x' } },
  });
  check(
    drifted.error?.exitCode === 12 && /stored run records/.test(drifted.error.message) && drifted.qualified === undefined,
    `stored evidence the cycle did not perform stopped with ${drifted.error?.exitCode ?? 'a qualified result'}: ${drifted.error?.message}; expected 12`,
  );

  // The clean arm and the rerun both read the stored baseline, so a stale baseline result stops the cycle at the first of them.
  const staleBaseline = await outcome({
    ...fixture('stale-baseline', BROWSER_CASE),
    stored: { ...fixture('stale-baseline-source', BROWSER_CASE).stored, baseline: { unmeasurable: 'x' } },
  });
  check(
    staleBaseline.error?.exitCode === 12 && /stored run records/.test(staleBaseline.error.message) && staleBaseline.qualified === undefined,
    `a stale baseline result stopped with ${staleBaseline.error?.exitCode ?? 'a qualified result'}: ${staleBaseline.error?.message}; expected 12`,
  );
  const baselineOnly = await outcome({
    ...fixture('baseline-only', BROWSER_CASE),
    arm: async (input) => {
      const answer = trackedScore(input);
      return input.phase === 'baseline' ? { ...answer, result: { ...answer.result, shapeFailures: ['planted'] } } : answer;
    },
  });
  check(
    baselineOnly.error?.exitCode === 12 &&
      /the baseline arm scored a result/.test(baselineOnly.error.message) &&
      baselineOnly.qualified === undefined,
    `a clean arm that scores another result stopped with ${baselineOnly.error?.exitCode ?? 'a qualified result'}: ${baselineOnly.error?.message}; expected 12 naming the baseline arm`,
  );
  const driftingRerun = await outcome({
    ...fixture('drifting-rerun', BROWSER_CASE),
    arm: async (input) => {
      const answer = trackedScore(input);
      return input.phase === 're-pass-1' ? { ...answer, result: { ...answer.result, shapeFailures: ['planted'] } } : answer;
    },
  });
  check(
    driftingRerun.error?.exitCode === 12 &&
      /re-pass-1 arm scored a result/.test(driftingRerun.error.message) &&
      driftingRerun.qualified === undefined,
    `a clean rerun that scores another result stopped with ${driftingRerun.error?.exitCode ?? 'a qualified result'}: ${driftingRerun.error?.message}; expected 12 naming re-pass-1`,
  );
  const silentArm = await outcome({
    ...fixture('silent-arm', BROWSER_CASE),
    arm: async (input) => ({ ...trackedScore(input), result: undefined }),
  });
  check(silentArm.error?.exitCode === 12 && silentArm.qualified === undefined, 'an arm that returns no result still qualified');

  // A vocabulary oracle has no reading on a design the harness refuses, so the mutated arm is inconclusive and proves nothing.
  const unreadable = await outcome({
    ...fixture('inconclusive', {
      mutatedId: 'seeded-register-absent',
      entry: { kind: 'material-vocabulary', oracleId: 'O-002', risk: SEEDED.materialRisks[0] },
    }),
  });
  check(
    unreadable.error?.exitCode === 11 && /inconclusive/.test(unreadable.error.message) && unreadable.qualified === undefined,
    `an inconclusive mutated arm stopped with ${unreadable.error?.exitCode ?? 'a qualified result'}: ${unreadable.error?.message}; expected 11`,
  );

  const notText = fixture('not-utf8', BROWSER_CASE);
  fs.writeFileSync(notText.referencePath, Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a]));
  const binary = await outcome(notText);
  check(
    binary.error?.exitCode === 10 && /UTF-8/.test(binary.error.message),
    `a design that is not UTF-8 gave ${binary.error?.exitCode ?? 'a qualified result'}; expected 10`,
  );

  const seededTouched = fixture('seeded-touched', BROWSER_CASE);
  const touchedSeeded = await outcome({
    ...seededTouched,
    arm: recordingArm([], digestBytes, { mutated: () => fs.appendFileSync(seededTouched.mutatedPath, '\nextra\n') }),
  });
  check(
    touchedSeeded.error?.exitCode === 12 &&
      /stored artifact changed/.test(touchedSeeded.error.message) &&
      touchedSeeded.qualified === undefined,
    `a stored seeded design that changed during the cycle stopped with ${touchedSeeded.error?.exitCode ?? 'a qualified result'}: ${touchedSeeded.error?.message}; expected 12`,
  );

  const seededNotText = fixture('seeded-not-utf8', BROWSER_CASE);
  fs.writeFileSync(seededNotText.mutatedPath, Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a]));
  const seededBinary = await outcome(seededNotText);
  check(
    seededBinary.error?.exitCode === 10 && /stored mutated/.test(seededBinary.error.message),
    `a stored seeded design that is not UTF-8 gave ${seededBinary.error?.exitCode ?? 'a qualified result'}; expected 10 naming it`,
  );

  // An oracle whose risk the scored run never mentions has no boolean reading, which is an authoring defect.
  const noReading = await outcome(
    fixture('no-reading', {
      mutatedId: 'seeded-z-browser-risk-scored',
      entry: { kind: 'material-vocabulary', oracleId: 'O-002', risk: { id: 'a-risk-no-run-records' } },
    }),
  );
  check(
    noReading.error?.exitCode === 10 && /records no mention/.test(noReading.error.message),
    `an oracle with no reading gave ${noReading.error?.exitCode ?? 'a qualified result'}: ${noReading.error?.message}; expected 10`,
  );

  // A projection-coherence oracle guards the runner's projection, which no stored design can break, so no
  // cycle can qualify a defect for it and the corpus carries no probe for it.
  const coherence = await outcome(
    fixture('coherence', {
      ...BROWSER_CASE,
      entry: { kind: 'projection-coherence', oracleId: 'O-016', risk: null },
    }),
  );
  check(
    coherence.error?.exitCode === 10 && /guards the runner's projection/.test(coherence.error.message) && coherence.qualified === undefined,
    `a projection-coherence oracle gave ${coherence.error?.exitCode ?? 'a qualified result'}: ${coherence.error?.message}; expected 10`,
  );

  // The default arm must read the workspace file of its own phase. After the restore the file is rewritten
  // with the mutated bytes while the digest still reads as the original, so only a rerun that scores the
  // restored workspace file (not text captured earlier, not a stored design) sees the difference.
  const restoredFixture = fixture('restored-file', BROWSER_CASE);
  let workspaceFile = null;
  let mutatedArmRan2 = false;
  let rewritten = false;
  const rewriting = await outcome({
    ...restoredFixture,
    arm: (input) => {
      workspaceFile = input.file;
      if (input.phase === 'mutated') mutatedArmRan2 = true;
      return trackedScore(input);
    },
    digestBytes: (bytes) => {
      if (mutatedArmRan2 && !rewritten && Buffer.from(bytes).equals(referenceBytes())) {
        rewritten = true;
        fs.writeFileSync(workspaceFile, mutatedBytes());
      }
      return digestBytes(bytes);
    },
  });
  check(
    rewritten && rewriting.error?.exitCode === 12 && rewriting.qualified === undefined,
    `a restored workspace file rewritten after its digest stopped with ${rewriting.error?.exitCode ?? 'a qualified result'}: ${rewriting.error?.message}; expected 12`,
  );

  const sourceTouched = fixture('source-touched', BROWSER_CASE);
  const touched = await outcome({
    ...sourceTouched,
    arm: recordingArm([], digestBytes, { mutated: () => fs.appendFileSync(sourceTouched.referencePath, '\nextra\n') }),
  });
  check(
    touched.error?.exitCode === 12 && /stored artifact changed/.test(touched.error.message) && touched.qualified === undefined,
    `a stored design that changed during the cycle stopped with ${touched.error?.exitCode ?? 'a qualified result'}: ${touched.error?.message}; expected 12`,
  );
  checkWorkspacesGone('the failing steps');
}

function checkDerivedMutation() {
  const applied = (original, mutated) => {
    const { find, replace } = deriveReplaceExact(original, mutated);
    return { find, replace, text: original.replace(find, () => replace) };
  };
  const insertion = applied('a\nb\nc\n', 'a\nb\nnew\nc\n');
  check(insertion.text === 'a\nb\nnew\nc\n' && insertion.find !== '', 'an insertion did not become an exact replacement with an anchor');
  const deletion = applied('a\nb\nc\n', 'a\nc\n');
  check(deletion.text === 'a\nc\n' && deletion.find === 'b\n' && deletion.replace === '', 'a deletion did not become an exact replacement');
  const middle = applied('a\nb\nc\n', 'a\nB1\nB2\nc\n');
  check(middle.text === 'a\nB1\nB2\nc\n' && middle.find === 'b\n', 'a replaced middle did not become an exact replacement');
  // `row\n` occurs three times, so the span needs the line before it to be unique.
  const repeated = applied('x\nrow\nrow\nrow\ny\n', 'x\nrow\nrow\nrow\nrow\ny\n');
  check(
    repeated.text === 'x\nrow\nrow\nrow\nrow\ny\n' && 'x\nrow\nrow\nrow\ny\n'.split(repeated.find).length === 2,
    'a span that repeats did not widen until it occurred exactly once',
  );
  // An insertion after the last line has no line after it, so the context can only come from before it.
  const trailing = applied('x\nrow\nrow\nrow\n', 'x\nrow\nrow\nrow\nrow\n');
  check(
    trailing.text === 'x\nrow\nrow\nrow\nrow\n' && trailing.find === 'row\nrow\nrow\n',
    `an insertion at the end of repeated lines gave the anchor ${JSON.stringify(trailing.find)}`,
  );
  // An insertion before the first line has no line before it, so the context can only come from after it.
  const leading = applied('a\nb\n', 'new\na\nb\n');
  check(
    leading.text === 'new\na\nb\n' && leading.find === 'a\n',
    `an insertion before the first line gave the anchor ${JSON.stringify(leading.find)}`,
  );
  // Two repeated lines become three: the only unique span is the whole document, which is the edit that turns any file into any
  // other, so it names no mutation and is refused (Story 1.99).
  let wholeDocument = null;
  try {
    deriveReplaceExact('row\nrow\n', 'row\nrow\nrow\n');
  } catch (error) {
    wholeDocument = error;
  }
  check(
    wholeDocument instanceof QualificationError && wholeDocument.exitCode === 10 && /whole reference/.test(wholeDocument.message),
    `a span that is unique only as the whole document was given an operator: ${wholeDocument?.message ?? 'no refusal'}`,
  );
  let replacedWhole = null;
  try {
    deriveReplaceExact('a\nb\n', 'c\nd\n');
  } catch (error) {
    replacedWhole = error;
  }
  check(
    replacedWhole instanceof QualificationError && replacedWhole.exitCode === 10,
    'two documents that share no line were given a mutation, though no edit short of the whole file turns one into the other',
  );
  const unterminated = applied('a\nb', 'a\nc');
  check(unterminated.text === 'a\nc', 'a document without a final newline did not round-trip');
  let identical = null;
  try {
    deriveReplaceExact('same\n', 'same\n');
  } catch (error) {
    identical = error;
  }
  check(identical instanceof QualificationError && identical.exitCode === 10, 'two identical documents were given a mutation');
  let anchorless = null;
  try {
    deriveReplaceExact('', 'x\n');
  } catch (error) {
    anchorless = error;
  }
  check(
    anchorless instanceof QualificationError && anchorless.exitCode === 10,
    'an empty document, which nothing can anchor, was given a mutation',
  );
}

/** Every `rollbackVerified` the committed probes carry was produced by a cycle. */
async function checkGenerator(digestBytes) {
  await loadGeneratorCorpus();
  const performed = [];
  const statusBefore = gitStatus();
  const spy = async (options) => {
    const qualified = await qualifyTestDesignMutation({ ...options, arm: trackedScore, digestBytes });
    performed.push({ mutationId: options.mutationId, qualified });
    return qualified;
  };
  let probes = [];
  try {
    probes = await buildTestDesignProbes({ qualify: spy });
  } catch (error) {
    check(false, `the generator stopped over the stored corpus: ${error.message}`);
    return;
  }
  const mutationProbes = probes.filter((probe) => probe.qualification.route === 'controlled-mutation');
  check(mutationProbes.length > 0, 'the generator emitted no controlled-mutation probe');
  check(
    performed.length === mutationProbes.length &&
      performed.every(
        ({ qualified }) => qualified.evidence.rePasses.length > 0 && qualified.evidence.preDigest === qualified.evidence.restoredDigest,
      ),
    `${performed.length} cycle(s) were performed for ${mutationProbes.length} controlled-mutation probe(s), each of which needs its own`,
  );
  check(
    mutationProbes.every((probe, index) => probe.qualification.rollbackVerified === performed[index].qualified.evidence.rollbackVerified),
    'a probe states a rollback claim other than the one its cycle reached',
  );
  // These cycles worked on the repository's own stored designs, so the status of the checkout can show a write.
  check(gitStatus() === statusBefore, 'the checkout status moved while the generator qualified the corpus');
  checkWorkspacesGone('the generator');
  check(
    probes
      .filter((probe) => probe.qualification.route !== 'controlled-mutation')
      .every((probe) => !('rollbackVerified' in probe.qualification)),
    'a probe without a mutation carries a rollback claim',
  );
  const committed = JSON.parse(fs.readFileSync(COMMITTED_PROBES, 'utf8'));
  check(
    committed.filter((probe) => probe.qualification.rollbackVerified === true).length === performed.length,
    `the committed corpus claims ${committed.filter((probe) => probe.qualification.rollbackVerified === true).length} verified rollback(s) and ${performed.length} were performed`,
  );
  check(
    !/rollbackVerified['"]?\s*:\s*true/.test(buildTestDesignProbes.toString()),
    'the test-design builder states a rollback claim as a literal',
  );

  const rejection = async (qualify) => {
    try {
      await buildTestDesignProbes({ qualify });
      return null;
    } catch (error) {
      return error;
    }
  };
  const plantedFailure = await rejection(async (options) => {
    if (options.mutationId !== 'M-003') return spy(options);
    throw new QualificationError(12, 'planted: the restore could not be written');
  });
  check(
    plantedFailure instanceof GeneratorError &&
      plantedFailure.message.includes('O-003') &&
      plantedFailure.message.includes('no probe is emitted'),
    `a failed cycle gave ${plantedFailure?.message ?? 'a corpus'}; expected a generator error naming O-003 and emitting no probe`,
  );
  const unverified = await rejection(async (options) => {
    const qualified = await spy(options);
    return options.mutationId === 'M-005' ? { ...qualified, evidence: { ...qualified.evidence, rollbackVerified: false } } : qualified;
  });
  check(
    unverified instanceof GeneratorError && unverified.message.includes('did not verify its rollback'),
    `a cycle that reports no verified rollback gave ${unverified?.message ?? 'a corpus'}; expected a generator error`,
  );
  const silent = await rejection(async (options) => {
    const qualified = await spy(options);
    if (options.mutationId !== 'M-004') return qualified;
    const evidence = Object.fromEntries(Object.entries(qualified.evidence).filter(([key]) => key !== 'rollbackVerified'));
    return { ...qualified, evidence };
  });
  check(silent instanceof GeneratorError, 'a cycle result that states no rollback claim still produced a corpus');
  // Each conjunct of the digest-backed claim, broken alone: the evidence otherwise stays the cycle's own.
  const forged = (mutationId, patch) =>
    rejection(async (options) => {
      const qualified = await spy(options);
      return options.mutationId === mutationId
        ? { ...qualified, evidence: { ...qualified.evidence, ...patch(qualified.evidence) } }
        : qualified;
    });
  const digestCases = [
    ['a pre-mutation digest that is not the reference design', () => ({ preDigest: 'sha256:other' })],
    ['a restored digest that differs', () => ({ restoredDigest: 'sha256:other' })],
    ['a mutated digest equal to the pre-mutation digest', (evidence) => ({ mutatedDigest: evidence.preDigest })],
    ['a mutated digest that is not the stored seeded design', () => ({ mutatedDigest: 'sha256:other' })],
    [
      'a last re-pass that did not hold',
      (evidence) => ({ rePasses: evidence.rePasses.map((rePass) => ({ ...rePass, verdict: 'violated' })) }),
    ],
    ['no re-pass at all', () => ({ rePasses: [] })],
  ];
  for (const [index, [name, patch]] of digestCases.entries()) {
    const error = await forged(`M-00${index + 2}`, patch);
    check(error instanceof GeneratorError && error.message.includes('did not verify its rollback'), `${name} still produced a corpus`);
  }
  const invented = await rejection(async (options) => {
    const qualified = await spy(options);
    // The claim the cycle really reached, carried with digests nobody computed.
    const evidence = {
      rollbackVerified: qualified.evidence.rollbackVerified,
      preDigest: 'sha256:x',
      restoredDigest: 'sha256:x',
      mutatedDigest: 'sha256:y',
      rePasses: [{ verdict: 'held' }],
    };
    return options.mutationId === 'M-005' ? { ...qualified, evidence } : qualified;
  });
  check(invented instanceof GeneratorError, 'a cycle result with invented digests and no cycle behind it still produced a corpus');
  // A claim with no digests behind it is not the cycle's evidence.
  const fabricated = await rejection(async (options) => {
    const qualified = await spy(options);
    return options.mutationId === 'M-006'
      ? { ...qualified, evidence: { rollbackVerified: qualified.evidence.rollbackVerified } }
      : qualified;
  });
  check(fabricated instanceof GeneratorError, "a rollback claim carrying none of the cycle's digests still produced a corpus");
}

/** The digest of every file under a directory, so a test sees any file the writer touched. */
function treeDigest(root) {
  const hash = crypto.createHash('sha256');
  for (const name of fs.readdirSync(root).sort()) {
    hash.update(`${name}\0`);
    hash.update(fs.readFileSync(path.join(root, name)));
  }
  return hash.digest('hex');
}

/**
 * `writeCorpora` builds every corpus before it writes any: an early corpus that is stale on disk stays
 * as it was when a later target cannot be built, where a writer that wrote as it built would have rewritten it.
 */
async function checkBuildBeforeWrite() {
  const probeRoot = scratch.make('probe-root');
  fs.writeFileSync(path.join(probeRoot, 'early.probes.json'), '[\n  "stale"\n]\n');
  const before = treeDigest(probeRoot);
  const targetList = [
    { relativePath: 'early.probes.json', build: () => ['fresh'] },
    {
      relativePath: 'late.probes.json',
      build: () => {
        throw new QualificationError(12, 'planted: a later corpus could not be built');
      },
    },
  ];
  const log = console.log;
  console.log = () => {};
  let rejected = null;
  try {
    await writeCorpora({ probeRoot, targetList, check: false, prettierConfig: await prettier.resolveConfig(COMMITTED_PROBES) });
  } catch (error) {
    rejected = error;
  }
  check(
    rejected instanceof QualificationError,
    `a corpus that cannot be built gave ${rejected?.message ?? 'a write'}; expected the build error to reach main, which exits 2`,
  );
  check(treeDigest(probeRoot) === before, 'a stale early corpus was rewritten although a later corpus could not be built');

  // And once every corpus builds, the same writer does write them.
  const written = scratch.make('probe-root-written');
  console.log = () => {};
  await writeCorpora({
    probeRoot: written,
    targetList: [targetListEntry('one.probes.json', ['one']), targetListEntry('two.probes.json', ['two'])],
    check: false,
    prettierConfig: await prettier.resolveConfig(COMMITTED_PROBES),
  }).finally(() => {
    console.log = log;
  });
  check(fs.readdirSync(written).length === 2, 'the corpora that built were not written');
}

/**
 * `run` is what `main` returns to the shell: 2 when a later corpus cannot be built, with the root untouched,
 * and 0 once every corpus builds and the root holds them.
 */
async function checkRunExit() {
  const prettierConfig = await prettier.resolveConfig(COMMITTED_PROBES);
  const quiet = async (work) => {
    const { log, error } = { log: console.log, error: console.error };
    console.log = () => {};
    console.error = () => {};
    try {
      return await work();
    } finally {
      console.log = log;
      console.error = error;
    }
  };
  const probeRoot = scratch.make('run-root');
  fs.writeFileSync(path.join(probeRoot, 'early.probes.json'), '[\n  "stale"\n]\n');
  const before = treeDigest(probeRoot);
  const failing = [
    targetListEntry('early.probes.json', ['fresh']),
    {
      relativePath: 'late.probes.json',
      build: () => {
        throw new QualificationError(12, 'planted: a later corpus could not be built');
      },
    },
  ];
  const code = await quiet(() => run({ probeRoot, targetList: failing, check: false, prettierConfig }));
  check(code === 2, `a corpus that cannot be built made the generator exit ${code}; expected 2`);
  check(treeDigest(probeRoot) === before, 'the generator touched the probe root although a corpus could not be built');
  const sound = await quiet(() =>
    run({ probeRoot, targetList: [targetListEntry('early.probes.json', ['fresh'])], check: false, prettierConfig }),
  );
  check(
    sound === 0 && fs.readFileSync(path.join(probeRoot, 'early.probes.json'), 'utf8').includes('fresh'),
    'a root whose corpora build was not written',
  );
  const stale = await quiet(() =>
    run({ probeRoot, targetList: [targetListEntry('early.probes.json', ['other'])], check: true, prettierConfig }),
  );
  check(stale === 1, `a stale corpus in check mode made the generator exit ${stale}; expected 1`);
}

function targetListEntry(relativePath, probes) {
  return { relativePath, build: () => probes };
}

/** A child process that qualifies the browser mutation with `armSource` for its mutated arm, and what it printed. */
function qualifyingChild(label, armSource) {
  const { mutationId, referencePath, mutatedPath, entry, set, stored } = fixture(label, BROWSER_CASE);
  const payload = JSON.stringify({ mutationId, referencePath, mutatedPath, entry, set, categories: [...CATEGORIES], stored });
  const library = path.join(__dirname, 'lib', 'test-design-qualification.js');
  const script = `
    const fs = require('node:fs');
    const { qualifyTestDesignMutation, scoreDocument } = require(${JSON.stringify(library)});
    const options = JSON.parse(process.argv[1]);
    options.categories = new Set(options.categories);
    options.arm = (input) => {
      ${armSource}
      return scoreDocument(input);
    };
    qualifyTestDesignMutation(options).then(() => process.exit(0), () => process.exit(1));
  `;
  const child = spawn(process.execPath, ['-e', script, payload], { stdio: ['ignore', 'pipe', 'inherit'] });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  const ended = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  return { child, ended, printed: () => output };
}

/** How a child ended, with a bound so a hung child fails the case and does not stall the suite. */
async function endedWithin(child, ended, milliseconds) {
  let timer;
  const result = await Promise.race([
    ended,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve({ code: null, signal: 'timeout' }), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
  if (result.signal === 'timeout') child.kill('SIGKILL');
  return result;
}

/**
 * A signal ends a cycle by its default action: the production arm is synchronous, so the whole cycle runs
 * in one turn of the event loop and a handler would be removed before the loop could run it, which leaves
 * the process alive and the signal swallowed. The child here busy-waits in its mutated arm.
 * A killed cycle leaves its pid-named parent, and the next cycle in any process reclaims it.
 */
async function checkSignals() {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    const { child, ended, printed } = qualifyingChild(
      `signal-${signal}`,
      `if (input.phase === 'mutated') { fs.writeSync(1, 'READY ' + input.file + '\\n'); for (const end = Date.now() + 4000; Date.now() < end; ) { /* a synchronous arm */ } }`,
    );
    // The parent the cycle makes is held before it exists: the reaper of a suite running at the same time removes the parent of
    // every dead process, and the case needs the killed cycle's parent for the next cycle to reclaim.
    holdPrivateParents(child.pid);
    const deadline = Date.now() + 30_000;
    while (!/READY (.+)\n/.test(printed()) && Date.now() < deadline && child.exitCode === null) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const file = /READY (.+)\n/.exec(printed())?.[1];
    check(file !== undefined, `the ${signal} child never reached its mutated arm`);
    // The parent must exist while its cycle is alive. After the child is dead any process that reaps (another copy of
    // this suite, a generator, a suite sharing the private root) may already have removed it.
    const parent = file === undefined ? null : path.dirname(path.dirname(file));
    check(parent !== null && fs.existsSync(parent), `the ${signal} child's cycle has no private parent while it runs`);
    child.kill(signal);
    const result = await endedWithin(child, ended, 30_000);
    check(result.signal === signal, `a cycle sent ${signal} ended by ${result.signal ?? `exit ${result.code}`}; the signal must end it`);

    // Dead processes' parents: the one the killed cycle left, and one planted under a pid known to be dead.
    const left = parent === null ? [] : [parent];
    const dead = spawnSync(process.execPath, ['-e', '']);
    holdPrivateParents(dead.pid);
    const planted = path.join(privateRootIn(privateRootBase()), `run-${dead.pid}-planted`);
    fs.mkdirSync(planted);
    fs.writeFileSync(path.join(planted, 'design.md'), 'x');
    left.push(planted);
    const next = qualifyingChild(`reaper-${signal}`, '');
    const reaped = await endedWithin(next.child, next.ended, 60_000);
    check(reaped.code === 0, `the cycle after the ${signal} one ended with ${reaped.signal ?? `exit ${reaped.code}`}; expected 0`);
    for (const directory of left) {
      check(!fs.existsSync(directory), `a cycle did not reclaim the dead process's parent ${directory}`);
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
}

async function main() {
  try {
    const { digestBytes } = await loadEngine();
    await checkPerformedSequence(digestBytes);
    await checkRealCorpus(digestBytes);
    await checkFailingSteps(digestBytes);
    checkDerivedMutation();
    await checkGenerator(digestBytes);
    await checkBuildBeforeWrite();
    await checkRunExit();
    await checkSignals();
  } finally {
    scratch.removeAll();
  }
  if (failures.length > 0) {
    console.error(`${colors.red}${failures.length} of ${checks} test-design qualification check(s) failed:${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log(`${colors.green}ok${colors.reset} all ${checks} test-design qualification check(s) passed`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(`${colors.red}the test-design qualification test could not run:${colors.reset} ${error.stack ?? error}`);
    process.exitCode = 2;
  },
);
