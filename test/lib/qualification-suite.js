/**
 * The checks every probe corpus's mutation qualification suite shares (Story 1.99, AD-8).
 *
 * `test/test-test-review-qualification.js`, `test-trace-qualification.js`, `test-nfr-qualification.js` and
 * `test-ci-qualification.js` each hand this kit one corpus: its builder in `tools/generate-probes.js`, its
 * committed probe file, and one real mutation (an oracle, the stored reference artifact and the stored
 * mutated one). The kit then holds the corpus to the rule of Story 1.99:
 *
 * - The performed sequence. The arms run in AD-8's order against the bytes AD-8 names (the reference, the
 *   stored mutated artifact, the reference again), the digests the evidence records agree, both stored
 *   artifacts hold their bytes, every workspace lay outside the checkout and is gone, and `git status`
 *   of the whole checkout is what it was.
 * - Each failing step, planted one at a time, stops the cycle with AD-10's exit and no qualified result:
 *   a clean arm that fails (11), a mutated arm that holds or is inconclusive (11), a restore that cannot
 *   be written (12), a restored digest that differs (12), a clean rerun that fails or reads wrong bytes
 *   (12), a stored artifact that changed during the cycle (12) or is not UTF-8 (10).
 * - The generator. The corpus's builder performs one cycle for every controlled-mutation probe it emits, each
 *   probe carries its own cycle's claim, and the builder emits no probe when a cycle fails in any of
 *   the four ways the story names (failed restore, mismatched digest, missing baseline pass, missing
 *   mutated failure) or reports a rollback it did not verify. The builder's source states no claim as a literal.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { QualificationError } = require('../../cli/lib/evaluate/mutation');
const { loadEngine } = require('../../cli/lib/evaluate/engine');
const { corpusArm, loadCorpusContract, qualifyCorpusMutation } = require('./probe-qualification');
const { scratchDirectories } = require('./scratch-directories');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };

/** The git state of the whole checkout, so a cycle that wrote anywhere in the adopter's tree shows. */
function gitStatus() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: PROJECT_ROOT, env, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git status exited ${result.status}: ${result.stderr}`);
  return result.stdout;
}

/**
 * @param {object} options
 * @param {string} options.title names the corpus in the summary line
 * @param {string} options.scratchPrefix lowercase words joined by hyphens, the suite's temp directory prefix
 * @param {'test-review'|'trace'|'nfr'|'ci'} options.corpus
 * @param {(options: {qualify: Function}) => Promise<object[]>} options.build the corpus's builder in `tools/generate-probes.js`
 * @param {string} options.probesFile absolute path of the committed probe file
 * @param {{oracleId: string, referencePath: string, mutatedPath: string}} options.sample one real mutation of the corpus, with absolute paths
 * @param {(kit: object) => Promise<void>} [options.extra] the corpus's own checks
 * @returns {Promise<number>} the exit code
 */
async function runQualificationSuite({ title, scratchPrefix, corpus, build, probesFile, sample, extra }) {
  const failures = [];
  let checks = 0;
  const scratch = scratchDirectories(scratchPrefix);
  const check = (condition, message) => {
    checks += 1;
    if (!condition) failures.push(message);
  };

  const contract = loadCorpusContract(corpus);
  const { digestBytes } = await loadEngine();
  const { loadGeneratorCorpus, GeneratorError } = require('../../tools/generate-probes');

  /** Every workspace directory an arm ran in, so the suite can show each is outside the checkout and gone. */
  const workspaces = new Set();
  const track = (input) => workspaces.add(path.dirname(input.file));

  /** The real arm of an oracle, with its workspace noted and a case's tampering applied first. */
  const armFor = (options, tamper = {}, trace = []) => {
    const base = corpusArm({ corpus, contract, oracleId: options.oracleId });
    return async (input) => {
      track(input);
      trace.push({ phase: input.phase, digest: digestBytes(fs.readFileSync(input.file)) });
      tamper[input.phase]?.(input, options);
      return base({ ...input, text: fs.readFileSync(input.file, 'utf8') });
    };
  };

  const checkWorkspacesGone = (label) => {
    for (const directory of workspaces) {
      check(!directory.startsWith(PROJECT_ROOT), `${label}: a workspace was made inside the checkout at ${directory}`);
      check(!fs.existsSync(directory), `${label}: the workspace ${directory} still exists`);
      check(!fs.existsSync(path.dirname(directory)), `${label}: the private parent ${path.dirname(directory)} still exists`);
    }
    workspaces.clear();
  };

  /** One qualification over copies of the two stored artifacts, so a case that tampers with a source changes the copy. */
  const fixture = (label, overrides = {}) => {
    const directory = scratch.make(label);
    const referencePath = path.join(directory, 'reference');
    const mutatedPath = path.join(directory, 'mutated');
    fs.copyFileSync(sample.referencePath, referencePath);
    fs.copyFileSync(sample.mutatedPath, mutatedPath);
    return { corpus, contract, oracleId: sample.oracleId, mutationId: 'M-900', referencePath, mutatedPath, digestBytes, ...overrides };
  };

  const outcome = async (options) => {
    const before = process.cwd();
    try {
      return { qualified: await qualifyCorpusMutation({ arm: armFor(options), ...options }) };
    } catch (error) {
      if (!(error instanceof QualificationError)) throw error;
      return { error };
    } finally {
      // A cycle that stops mid-way (a restore that cannot be written, say) still leaves the process where it found it.
      check(process.cwd() === before, `a cycle left the working directory at ${process.cwd()}, not ${before}`);
    }
  };

  const stopped = (result, exitCode, pattern, what) =>
    check(
      result.error?.exitCode === exitCode &&
        result.qualified === undefined &&
        (pattern === undefined || pattern.test(result.error.message)),
      `${what} stopped with ${result.error?.exitCode ?? 'a qualified result'}: ${result.error?.message}; expected ${exitCode}${pattern ? ` naming ${pattern}` : ''} and no result`,
    );

  async function checkPerformedSequence() {
    const options = fixture('performed');
    const trace = [];
    const statusBefore = gitStatus();
    const reference = fs.readFileSync(options.referencePath);
    const mutated = fs.readFileSync(options.mutatedPath);
    const { qualified, error } = await outcome({ ...options, arm: armFor(options, {}, trace) });
    check(error === undefined && qualified?.evidence.rollbackVerified === true, `the sample mutation did not qualify: ${error?.message}`);
    if (qualified === undefined) return;

    const { evidence } = qualified;
    check(
      JSON.stringify(trace.map((step) => step.phase)) === JSON.stringify(['baseline', 'mutated', 're-pass-1']),
      `the arms ran as ${JSON.stringify(trace.map((step) => step.phase))}; AD-8 orders the clean arm, the mutated arm, then the clean rerun`,
    );
    check(trace[0]?.digest === digestBytes(reference), 'the clean arm did not read the reference artifact');
    check(
      trace[1]?.digest === digestBytes(mutated),
      'the mutated arm did not read the stored mutated artifact, so the mutation is not the edit that yields it',
    );
    check(trace[2]?.digest === digestBytes(reference), 'the clean rerun did not read the reference artifact');
    check(
      evidence.preDigest === digestBytes(reference) &&
        evidence.mutatedDigest === digestBytes(mutated) &&
        evidence.restoredDigest === evidence.preDigest,
      `the evidence records pre ${evidence.preDigest}, mutated ${evidence.mutatedDigest} and restored ${evidence.restoredDigest}`,
    );
    check(evidence.preDigest !== evidence.mutatedDigest, 'the mutation left the artifact unchanged');
    check(
      evidence.baseline.verdict === 'held' && evidence.mutated.verdict === 'violated' && evidence.rePasses.at(-1).verdict === 'held',
      'the arms did not hold, violate and hold in turn',
    );
    check(qualified.mutation.operator.occurrences === 1, 'the mutation is not one exact operator');
    check(
      qualified.mutation.operator.find !== '' && reference.toString('utf8').split(qualified.mutation.operator.find).length === 2,
      'the operator does not find its text exactly once in the reference',
    );
    check(
      reference.toString('utf8').replace(qualified.mutation.operator.find, () => qualified.mutation.operator.replace) ===
        mutated.toString('utf8'),
      'the operator does not turn the reference into the stored mutated artifact',
    );
    // The shipped arm, not the suite's: it scores the bytes the workspace holds in each phase.
    const shipped = await outcome({ ...fixture('shipped-arm'), arm: undefined });
    check(
      shipped.qualified?.evidence.rollbackVerified === true,
      `the corpus's own arm did not qualify the sample mutation: ${shipped.error?.message ?? 'no rollback verified'}`,
    );
    checkWorkspacesGone('the performed sequence');
    check(
      digestBytes(fs.readFileSync(options.referencePath)) === digestBytes(reference) &&
        digestBytes(fs.readFileSync(options.mutatedPath)) === digestBytes(mutated),
      'a stored artifact changed',
    );
    check(gitStatus() === statusBefore, 'the checkout status moved while the mutation was qualified');
  }

  async function checkFailingSteps() {
    const wrapped = (label, tamper, extra = {}) => {
      const options = fixture(label);
      return outcome({ ...options, arm: armFor(options, tamper), ...extra });
    };
    const mutatedBytes = () => fs.readFileSync(sample.mutatedPath);
    const referenceBytes = () => fs.readFileSync(sample.referencePath);

    // A missing baseline pass: the clean arm reads the mutated bytes, so the oracle fails before the mutation.
    stopped(
      await wrapped('baseline', { baseline: ({ file }) => fs.writeFileSync(file, mutatedBytes()) }),
      11,
      undefined,
      'a clean arm that fails',
    );

    // A missing mutated failure: the mutated arm reads the reference bytes, so the oracle still holds.
    stopped(
      await wrapped('mutation-holds', { mutated: ({ file }) => fs.writeFileSync(file, referenceBytes()) }),
      11,
      undefined,
      'a mutated arm that holds',
    );

    // A failed restore: the mutated arm leaves a directory where the artifact was, so the restore cannot write it back.
    stopped(
      await wrapped('restore', {
        mutated: ({ file }) => {
          fs.rmSync(file);
          fs.mkdirSync(file);
          fs.writeFileSync(path.join(file, 'kept'), 'x');
        },
      }),
      12,
      /restore/,
      'a restore that cannot be written',
    );

    // A mismatched digest: a digest function that reads the original bytes as a third value once the mutated arm has run,
    // as a restore that wrote something else would.
    let mutatedArmRan = false;
    const mismatchedOptions = fixture('digest');
    const mismatched = await outcome({
      ...mismatchedOptions,
      arm: armFor(mismatchedOptions, {
        mutated: () => {
          mutatedArmRan = true;
        },
      }),
      digestBytes: (bytes) =>
        mutatedArmRan && Buffer.from(bytes).equals(referenceBytes()) ? 'sha256:restored-bytes-that-differ' : digestBytes(bytes),
    });
    stopped(mismatched, 12, /not the pre-mutation/, 'a restored digest that differs');
    check(mismatched.error?.evidence?.rollbackVerified === false, 'a restored digest that differs still recorded rollbackVerified');

    // The rerun fails its verdict, so only the cycle's own reading of the rerun can stop it.
    const rerunOptions = fixture('rerun');
    const base = armFor(rerunOptions);
    stopped(
      await outcome({
        ...rerunOptions,
        arm: async (input) => {
          const answer = await base(input);
          return input.phase === 're-pass-1' ? { ...answer, verdict: 'violated' } : answer;
        },
      }),
      12,
      undefined,
      'a clean rerun that fails',
    );
    stopped(
      await wrapped('rerun-bytes', { 're-pass-1': ({ file }) => fs.writeFileSync(file, mutatedBytes()) }),
      12,
      undefined,
      'a clean rerun over the mutated bytes',
    );

    // A mutated arm that reaches no conclusion proves nothing.
    const inconclusiveOptions = fixture('inconclusive');
    const inconclusiveBase = armFor(inconclusiveOptions);
    stopped(
      await outcome({
        ...inconclusiveOptions,
        arm: async (input) => {
          const answer = await inconclusiveBase(input);
          return input.phase === 'mutated' ? { ...answer, verdict: 'inconclusive' } : answer;
        },
      }),
      11,
      /inconclusive/,
      'an inconclusive mutated arm',
    );

    const notText = fixture('not-utf8');
    fs.writeFileSync(notText.referencePath, Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a]));
    stopped(await outcome(notText), 10, /UTF-8/, 'a reference artifact that is not UTF-8');
    const mutatedNotText = fixture('mutated-not-utf8');
    fs.writeFileSync(mutatedNotText.mutatedPath, Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a]));
    stopped(await outcome(mutatedNotText), 10, /stored mutated/, 'a stored mutated artifact that is not UTF-8');

    const referenceTouched = fixture('reference-touched');
    stopped(
      await outcome({
        ...referenceTouched,
        arm: armFor(referenceTouched, { mutated: () => fs.appendFileSync(referenceTouched.referencePath, '\nextra\n') }),
      }),
      12,
      /stored artifact changed/,
      'a stored reference that changed during the cycle',
    );
    const mutatedTouched = fixture('mutated-touched');
    stopped(
      await outcome({
        ...mutatedTouched,
        arm: armFor(mutatedTouched, { mutated: () => fs.appendFileSync(mutatedTouched.mutatedPath, '\nextra\n') }),
      }),
      12,
      /stored artifact changed/,
      'a stored mutated artifact that changed during the cycle',
    );

    // The same mutated bytes as the reference is no mutation at all.
    const noMutation = fixture('no-mutation');
    fs.copyFileSync(noMutation.referencePath, noMutation.mutatedPath);
    stopped(await outcome(noMutation), 10, /byte for byte/, 'a mutated artifact identical to the reference');
    checkWorkspacesGone('the failing steps');
  }

  /** Every `rollbackVerified` the committed probes carry was produced by a cycle, and a failed one emits no probe. */
  async function checkGenerator() {
    await loadGeneratorCorpus();
    const performed = [];
    const statusBefore = gitStatus();
    const spy = async (options) => {
      const qualified = await qualifyCorpusMutation({ ...options, arm: armFor(options), digestBytes });
      performed.push({ mutationId: options.mutationId, qualified, options });
      return qualified;
    };
    let probes = [];
    try {
      probes = await build({ qualify: spy });
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
    // The artifacts a probe cites are the ones its cycle worked on: the reference it copied, the stored mutated artifact it edited toward.
    const absolute = (reference) => path.join(PROJECT_ROOT, reference.path);
    for (const [index, probe] of mutationProbes.entries()) {
      const { options } = performed[index] ?? {};
      const { targetArtifact, baselinePassEvidence, mutatedFailEvidence, mutationSource } = probe.qualification;
      check(
        options !== undefined &&
          absolute(targetArtifact) === options.referencePath &&
          absolute(baselinePassEvidence) === options.referencePath &&
          absolute(mutatedFailEvidence) === options.mutatedPath &&
          path.join(PROJECT_ROOT, mutationSource) === options.referencePath,
        `${probe.probeId} cites artifacts other than the ones its cycle ${options?.mutationId ?? 'M-?'} worked on`,
      );
    }
    check(
      mutationProbes.every((probe) => probe.qualification.rollbackVerified === true),
      'a controlled-mutation probe was emitted without a verified rollback',
    );
    // The cycles worked on the repository's own stored artifacts, so the status of the checkout can show a write.
    check(gitStatus() === statusBefore, 'the checkout status moved while the generator qualified the corpus');
    checkWorkspacesGone('the generator');
    check(
      probes
        .filter((probe) => probe.qualification.route !== 'controlled-mutation')
        .every((probe) => !('rollbackVerified' in probe.qualification)),
      'a probe without a mutation carries a rollback claim',
    );
    const committed = JSON.parse(fs.readFileSync(probesFile, 'utf8'));
    check(
      committed.filter((probe) => probe.qualification.rollbackVerified === true).length === performed.length,
      `the committed corpus claims ${committed.filter((probe) => probe.qualification.rollbackVerified === true).length} verified rollback(s) and ${performed.length} were performed`,
    );
    check(!/rollbackVerified['"]?\s*:\s*true/.test(build.toString()), 'the corpus builder states a rollback claim as a literal');

    const rejection = async (qualify) => {
      try {
        await build({ qualify });
        return null;
      } catch (error) {
        return error;
      }
    };
    const rejected = (error, what, pattern) =>
      check(
        error instanceof GeneratorError && pattern.test(error.message),
        `${what} gave ${error?.message ?? 'a corpus'}; expected a generator error matching ${pattern} and no probe`,
      );

    // The four failures the story names, planted in the cycle itself and read through the builder: no probe is emitted.
    // Each case tampers with the cycle of one probe and reads that probe's own stored bytes, so it holds in every corpus.
    const planted = (mutationId, tamperOf, extraOf = () => ({})) =>
      rejection((options) => {
        const target = options.mutationId === mutationId;
        return qualifyCorpusMutation({
          ...options,
          arm: armFor(options, target ? tamperOf(options) : {}),
          digestBytes,
          ...(target ? extraOf(options) : {}),
        });
      });
    let armRan = false;
    const second = mutationProbes.length > 1 ? 'M-002' : 'M-001';
    rejected(
      await planted(second, (options) => ({ baseline: ({ file }) => fs.writeFileSync(file, fs.readFileSync(options.mutatedPath)) })),
      'a clean arm that fails',
      /AD-10 exit 11\), so no probe is emitted/,
    );
    rejected(
      // The mutated arm sees the original bytes, so the oracle holds.
      await planted(second, (options) => ({ mutated: ({ file }) => fs.writeFileSync(file, fs.readFileSync(options.referencePath)) })),
      'a mutated arm that holds',
      /AD-10 exit 11\), so no probe is emitted/,
    );
    rejected(
      await planted(second, () => ({
        mutated: ({ file }) => {
          fs.rmSync(file);
          fs.mkdirSync(file);
          fs.writeFileSync(path.join(file, 'kept'), 'x');
        },
      })),
      'a restore that cannot be written',
      /AD-10 exit 12\), so no probe is emitted: .*restore/,
    );
    rejected(
      await planted(
        second,
        () => ({
          mutated: () => {
            armRan = true;
          },
        }),
        (options) => ({
          digestBytes: (bytes) =>
            armRan && fs.readFileSync(options.referencePath).equals(Buffer.from(bytes))
              ? 'sha256:restored-bytes-that-differ'
              : digestBytes(bytes),
        }),
      ),
      'a restored digest that differs',
      /AD-10 exit 12\), so no probe is emitted: .*not the pre-mutation/,
    );
    check(workspaces.size > 0, 'the planted failures ran no arm');
    checkWorkspacesGone('the planted failures');

    // A cycle result that says more than the cycle did.
    const plantedFailure = await rejection(async (options) => {
      if (options.mutationId !== 'M-001') return spy(options);
      throw new QualificationError(12, 'planted: the restore could not be written');
    });
    rejected(plantedFailure, 'a failed cycle', /no probe is emitted/);
    const unverified = await rejection(async (options) => {
      const qualified = await spy(options);
      return options.mutationId === second ? { ...qualified, evidence: { ...qualified.evidence, rollbackVerified: false } } : qualified;
    });
    rejected(unverified, 'a cycle that reports no verified rollback', /did not verify its rollback/);
    const silent = await rejection(async (options) => {
      const qualified = await spy(options);
      if (options.mutationId !== 'M-001') return qualified;
      return {
        ...qualified,
        evidence: Object.fromEntries(Object.entries(qualified.evidence).filter(([key]) => key !== 'rollbackVerified')),
      };
    });
    rejected(silent, 'a cycle result that states no rollback claim', /did not verify its rollback/);
    // Each conjunct of the digest-backed claim, broken alone: the evidence otherwise stays the cycle's own.
    const forged = (mutationId, patch) =>
      rejection(async (options) => {
        const qualified = await spy(options);
        return options.mutationId === mutationId
          ? { ...qualified, evidence: { ...qualified.evidence, ...patch(qualified.evidence) } }
          : qualified;
      });
    const digestCases = [
      ['a pre-mutation digest that is not the stored reference', () => ({ preDigest: 'sha256:other' })],
      ['a restored digest that differs', () => ({ restoredDigest: 'sha256:other' })],
      ['a mutated digest that is not the stored mutated artifact', () => ({ mutatedDigest: 'sha256:other' })],
      [
        'a last re-pass that did not hold',
        (evidence) => ({ rePasses: evidence.rePasses.map((rePass) => ({ ...rePass, verdict: 'violated' })) }),
      ],
      ['no re-pass at all', () => ({ rePasses: [] })],
    ];
    for (const [name, patch] of digestCases) {
      rejected(await forged('M-001', patch), name, /did not verify its rollback/);
    }
    const fabricated = await rejection(async (options) => {
      const qualified = await spy(options);
      return options.mutationId === 'M-001' ? { ...qualified, evidence: { rollbackVerified: true } } : qualified;
    });
    rejected(fabricated, "a rollback claim carrying none of the cycle's digests", /did not verify its rollback/);
    const nothing = await rejection(async () => ({}));
    rejected(nothing, 'a cycle that returns no evidence', /did not verify its rollback/);
    check(gitStatus() === statusBefore, 'the checkout status moved while the generator rejected the planted cycles');
  }

  /**
   * The committed probe file read directly, not through the builder: for each controlled-mutation probe the
   * oracle its behavior discharges holds on the artifact it names as its target and is violated by the
   * mutated artifact it cites, and both artifacts carry the digests the probe records.
   */
  function checkCommittedProbes() {
    const committed = JSON.parse(fs.readFileSync(probesFile, 'utf8'));
    for (const probe of committed.filter((entry) => entry.qualification.route === 'controlled-mutation')) {
      const { targetArtifact, baselinePassEvidence, mutatedFailEvidence } = probe.qualification;
      const behavior = contract.behaviors.find((candidate) => candidate.id === probe.behaviorId);
      check(behavior?.oracles.length === 1, `${probe.probeId}: ${probe.behaviorId} does not discharge exactly one oracle`);
      const arm = corpusArm({ corpus, contract, oracleId: behavior.oracles[0] });
      const read = (reference) => fs.readFileSync(path.join(PROJECT_ROOT, reference.path), 'utf8');
      check(
        targetArtifact.path === baselinePassEvidence.path,
        `${probe.probeId}: the target artifact is not the artifact its clean arm accepted`,
      );
      check(
        arm({ text: read(baselinePassEvidence) }).verdict === 'held',
        `${probe.probeId}: ${behavior.oracles[0]} does not hold on ${baselinePassEvidence.path}`,
      );
      check(
        arm({ text: read(mutatedFailEvidence) }).verdict === 'violated',
        `${probe.probeId}: ${behavior.oracles[0]} is not violated by ${mutatedFailEvidence.path}`,
      );
      check(
        mutatedFailEvidence.path !== baselinePassEvidence.path && probe.qualification.mutationSource === targetArtifact.path,
        `${probe.probeId}: the mutation names no edit of its own target`,
      );
    }
  }

  try {
    await checkPerformedSequence();
    await checkFailingSteps();
    await checkGenerator();
    checkCommittedProbes();
    if (extra !== undefined) await extra({ check, contract, corpusArm, digestBytes });
  } finally {
    scratch.removeAll();
  }
  if (failures.length > 0) {
    console.error(`${colors.red}${failures.length} of ${checks} ${title} qualification check(s) failed:${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log(`${colors.green}ok${colors.reset} all ${checks} ${title} qualification check(s) passed`);
  return 0;
}

/** Runs a suite and sets the exit code, the way every suite here ends. */
function exitWith(promise, title) {
  promise.then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(`${colors.red}the ${title} qualification test could not run:${colors.reset} ${error.stack ?? error}`);
      process.exitCode = 2;
    },
  );
}

module.exports = { exitWith, gitStatus, runQualificationSuite };
