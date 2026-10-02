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
 *   digests the evidence records agree, the workspace is gone afterwards, and
 *   neither the stored designs nor the repository's `git status` moved.
 * - Each failing step, planted one at a time, stops the cycle with AD-10's exit
 *   and no qualified result: a clean arm that fails (11), a mutated arm that
 *   holds (11), a restore that cannot be written (12), a restored digest that
 *   differs (12), a clean rerun that fails (12), stored evidence the cycle did
 *   not perform (12) and a stored design that changed during the cycle (12).
 * - The generator over those failures: `buildTestDesignProbes` emits no probe
 *   when one cycle fails or reports a rollback it did not verify, and every
 *   controlled-mutation probe it does emit carries the cycle's own result.
 * - The derived mutation: `deriveReplaceExact` over an insertion, a deletion, a
 *   replaced middle and a span that needs context before it is unique.
 *
 * Usage: node test/test-test-design-qualification.js
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { QualificationError } = require('../cli/lib/evaluate/mutation');
const { loadEngine } = require('../cli/lib/evaluate/engine');
const { TARGET_ARTIFACT, deriveReplaceExact, qualifyTestDesignMutation, scoreDocument } = require('./lib/test-design-qualification');
const { GeneratorError, buildTestDesignProbes, loadGeneratorCorpus } = require('../tools/generate-probes');
const { scratchDirectories } = require('./lib/scratch-directories');

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

/**
 * The git state of the trees a cycle reads, so a cycle that reached the adopter's tree shows. It is scoped to
 * the stored designs and the probe corpus rather than the whole checkout, because the suites of a sharded
 * `npm test` write elsewhere in it at the same time.
 */
function gitStatus() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all', '--', 'test/replay/test-design', 'test/probes'], {
    cwd: PROJECT_ROOT,
    env,
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout : `git exited ${result.status} ${result.stderr}`;
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
    const digestBefore = digestBytes(fs.readFileSync(input.file));
    trace.push({ phase: input.phase, file: input.file, digest: digestBefore, text: input.text });
    tamper[input.phase]?.(input);
    return scoreDocument({ ...input, text: fs.readFileSync(input.file, 'utf8') });
  };
}

async function outcome(options) {
  const before = process.cwd();
  try {
    return { qualified: await qualifyTestDesignMutation(options) };
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
  check(error === undefined && qualified?.rollbackVerified === true, `the browser mutation did not qualify: ${error?.message}`);
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
  check(
    !trace.some((step) => step.file.startsWith(PROJECT_ROOT)) && !fs.existsSync(trace[0].file),
    'the cycle worked inside the repository or left its workspace behind',
  );
  check(
    digestBytes(fs.readFileSync(options.referencePath)) === digestBytes(reference) &&
      digestBytes(fs.readFileSync(options.mutatedPath)) === digestBytes(seeded),
    'a stored design changed',
  );
  check(gitStatus() === statusBefore, 'the repository status moved while the mutation was qualified');
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
    check(qualified?.rollbackVerified === true, `the ${label} mutation toward ${mutatedId} did not qualify: ${error?.message}`);
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
      const answer = scoreDocument(input);
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

  // The clean arm's stored result is held too: a stale baseline run qualifies nothing, whether the clean arm or the rerun reads it.
  const staleBaseline = await outcome({
    ...fixture('stale-baseline', BROWSER_CASE),
    stored: { ...fixture('stale-baseline-source', BROWSER_CASE).stored, baseline: { unmeasurable: 'x' } },
  });
  check(
    staleBaseline.error?.exitCode === 12 && /stored run records/.test(staleBaseline.error.message) && staleBaseline.qualified === undefined,
    `a stale baseline result stopped with ${staleBaseline.error?.exitCode ?? 'a qualified result'}: ${staleBaseline.error?.message}; expected 12`,
  );
  const driftingRerun = await outcome({
    ...fixture('drifting-rerun', BROWSER_CASE),
    arm: async (input) => {
      const answer = scoreDocument(input);
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
    arm: async ({ phase, ...input }) => ({ ...scoreDocument({ ...input, phase }), result: undefined }),
  });
  check(silentArm.error?.exitCode === 12 && silentArm.qualified === undefined, 'an arm that returns no result still qualified');

  // A vocabulary oracle has no reading on a design the harness refuses, so the mutated arm is inconclusive and proves nothing.
  const unreadable = await outcome(
    fixture('inconclusive', {
      mutatedId: 'seeded-register-absent',
      entry: { kind: 'material-vocabulary', oracleId: 'O-002', risk: SEEDED.materialRisks[0] },
    }),
  );
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

  const sourceTouched = fixture('source-touched', BROWSER_CASE);
  const touched = await outcome({
    ...sourceTouched,
    arm: recordingArm([], digestBytes, { mutated: () => fs.appendFileSync(sourceTouched.referencePath, '\nextra\n') }),
  });
  check(
    touched.error?.exitCode === 12 && /stored design changed/.test(touched.error.message) && touched.qualified === undefined,
    `a stored design that changed during the cycle stopped with ${touched.error?.exitCode ?? 'a qualified result'}: ${touched.error?.message}; expected 12`,
  );
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
  const unterminated = applied('a\nb', 'a\nc');
  check(unterminated.text === 'a\nc', 'a document without a final newline did not round-trip');
  let identical = null;
  try {
    deriveReplaceExact('same\n', 'same\n');
  } catch (error) {
    identical = error;
  }
  check(identical instanceof QualificationError && identical.exitCode === 10, 'two identical documents were given a mutation');
}

/** Every `rollbackVerified` the committed probes carry was produced by a cycle. */
async function checkGenerator(digestBytes) {
  await loadGeneratorCorpus();
  const performed = [];
  const spy = async (options) => {
    const qualified = await qualifyTestDesignMutation({ ...options, digestBytes });
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
    mutationProbes.every((probe, index) => probe.qualification.rollbackVerified === performed[index].qualified.rollbackVerified),
    'a probe states a rollback claim other than the one its cycle reached',
  );
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
    return options.mutationId === 'M-005' ? { ...qualified, rollbackVerified: false } : qualified;
  });
  check(
    unverified instanceof GeneratorError && unverified.message.includes('did not verify its rollback'),
    `a cycle that reports no verified rollback gave ${unverified?.message ?? 'a corpus'}; expected a generator error`,
  );
  const silent = await rejection(async (options) => {
    const { rollbackVerified, ...rest } = await spy(options);
    return options.mutationId === 'M-004' ? rest : { ...rest, rollbackVerified };
  });
  check(silent instanceof GeneratorError, 'a cycle result that states no rollback claim still produced a corpus');
}

async function main() {
  try {
    const { digestBytes } = await loadEngine();
    await checkPerformedSequence(digestBytes);
    await checkRealCorpus(digestBytes);
    await checkFailingSteps(digestBytes);
    checkDerivedMutation();
    await checkGenerator(digestBytes);
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
