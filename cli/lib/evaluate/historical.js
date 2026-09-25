/**
 * The historical route (AD-6, AD-8, AD-9): a seeded probe whose defect is a
 * real one a commit fixed, qualified across that fix boundary.
 *
 * A committed historical probe names its fix commit (`qualification.fixCommit`,
 * any revision git resolves to a commit). The post-fix revision is that commit
 * and the pre-fix revision its first parent, both by full id. The probe is
 * refused, with the reason, when the run has no revisions to address (the
 * pristine workspace is a copy, not a git worktree), when `fixCommit` does not
 * resolve, when it is not an ancestor of the evaluated commit (git's own error
 * when it cannot tell, a shallow clone say), when it has no parent, or when
 * the pre-fix revision holds no `launch.root` or skill root; a refused probe
 * runs nowhere and the rest of the run goes on.
 *
 * Qualification runs the interaction plan once in a worktree at each revision
 * (`qualify-<probeId>-fail-before` at the parent, `qualify-<probeId>-pass-after`
 * at the fix), judged by the deterministic evaluator over the oracles of the
 * probe's behaviors: they must be violated before the fix and hold after it,
 * or the probe does not qualify (exit 11). The evidence lands under
 * `qualification/<probeId>/` as `fail-before.json` and `pass-after.json`.
 *
 * The qualified probe's `artifactDigest` is the tracked tree of the
 * implementation root at the pre-fix revision, the revision the defect lives
 * in; `fixCommitDigest` is `digestBytes` over the fix commit's full id, and
 * `oracleStableAcrossRevisions` is true because both arms are judged by the
 * one compiled contract the run read before any arm ran, whatever either
 * revision holds of the evaluation folder.
 *
 * A defect's manifestation-witness leg runs in a worktree at the pre-fix
 * revision (`historicalRoute`), and the arm `historical:<preFixSha>` runs its
 * trials in fresh workspaces reproducing it.
 */

'use strict';

const path = require('node:path');

const { admissionRefusal, armVerdict, referenceTo } = require('./admission');
const { hostEnvironmentPort, runArm } = require('./arm');
const { expectedSchemaVersion } = require('./engine');
const { evaluateOracles, oraclesOfBehaviors } = require('./evaluator');
const { runGit, trackedTreeDigest } = require('./workspace');

/** The eval-quality fault a command-line adapter throws when its policy refuses a request. */
const DENIAL_FAULT = 'forbidden-target';

/** The two qualification phases, each at its revision, with the verdict its oracles must give. */
const PHASES = [
  { phase: 'fail-before', revision: 'preFix', expected: 'violated', meaning: 'the defect shows before the fix' },
  { phase: 'pass-after', revision: 'fix', expected: 'held', meaning: 'the fix removes it' },
];

/**
 * The two revisions a historical probe straddles, or why it has none.
 *
 * @param {object} options
 * @param {object} options.pristine the run's pristine workspace
 * @param {string} options.fixCommit the committed probe's `qualification.fixCommit`
 * @param {string[]} [options.roots] absolute directories the pre-fix revision must hold (`launch.root`, the skill root)
 * @returns {{ fix: string, preFix: string } | { refused: string }}
 */
function historicalRevisions({ pristine, fixCommit, roots = [] }) {
  if (pristine.kind !== 'git-worktree') {
    return {
      refused: `the pristine workspace is a temp copy${pristine.dirty ? ' of the working tree' : ''}, not a git worktree, so the run has no revisions to address; evaluate a committed git target without --from-working-tree`,
    };
  }
  const resolved = runGit(['-C', pristine.repository, 'rev-parse', '--verify', '--quiet', '--end-of-options', `${fixCommit}^{commit}`]);
  if (!resolved.ok) return { refused: `fixCommit ${JSON.stringify(fixCommit)} does not resolve to a commit in ${pristine.repository}` };
  const fix = resolved.stdout.trim();
  const ancestor = runGit(['-C', pristine.repository, 'merge-base', '--is-ancestor', fix, pristine.commit]);
  if (!ancestor.ok) {
    return {
      refused:
        ancestor.status === 1
          ? `fix commit ${fix} is not an ancestor of the evaluated commit ${pristine.commit}, so the code under evaluation does not carry the fix`
          : `git cannot tell whether fix commit ${fix} is an ancestor of the evaluated commit ${pristine.commit}: ${ancestor.detail}`,
    };
  }
  const parent = runGit(['-C', pristine.repository, 'rev-parse', '--verify', '--quiet', `${fix}^1`]);
  if (!parent.ok)
    return { refused: `fix commit ${fix} has no parent, so there is no pre-fix revision for the defect to fail before the fix` };
  const preFix = parent.stdout.trim();
  for (const root of roots) {
    const relative = path.relative(pristine.repository, root).split(path.sep).join('/');
    if (relative === '') continue;
    if (!runGit(['-C', pristine.repository, 'rev-parse', '--verify', '--quiet', `${preFix}:${relative}`]).ok) {
      return { refused: `the pre-fix revision ${preFix} holds no ${relative}, so the target cannot run there` };
    }
  }
  return { fix, preFix };
}

/**
 * One arm at one revision: the plan run once in `workspace`, judged over
 * `oracleIds`. A step the registry refuses stops with exit 10, any other arm
 * failure with exit 12, after its fault is written.
 */
async function revisionArm({ contract, workspace, registry, oracleIds, policy, writer, directory, phase, file, stop, signal }) {
  const problems = registry.targetProblems(workspace.root);
  if (problems.length > 0) {
    throw stop({
      stage: 'qualification',
      exitCode: 12,
      message: `${file}: the registry cannot launch in the ${phase} workspace: ${problems.join('; ')}`,
    });
  }
  const { port } = await registry.createProbePort({ cwd: workspace.root, projectRoot: workspace.root });
  let arm;
  try {
    arm = await runArm({ contract, port: hostEnvironmentPort({ port, registry }), registry, label: phase, signal });
  } catch (error) {
    writer.writeJson(`${directory}/fault.json`, {
      phase,
      workspace: workspace.label,
      commit: workspace.commit,
      code: typeof error?.code === 'string' ? error.code : null,
      message: String(error?.message ?? error),
      steps: error?.steps ?? [],
    });
    const denied = error?.code === DENIAL_FAULT;
    throw stop({
      stage: 'qualification',
      exitCode: denied ? 10 : 12,
      message: `${file}: the ${phase} arm ${denied ? 'was denied by the registry' : 'could not run'}: ${error?.message ?? error}`,
    });
  }
  const oracles = await evaluateOracles({
    contract,
    stepObservations: arm.stepObservations,
    oracleIds,
    regexMatchStepBudget: policy.regexMatchStepBudget,
  });
  return { verdict: armVerdict(oracles), oracles, steps: arm.steps };
}

/**
 * Qualifies one historical probe across its fix boundary and builds the
 * qualified probe, validated against eval-quality's probe schema and admitted
 * by its qualification gate. Throws a `RunStop` with the phase's exit when a
 * step fails.
 *
 * @returns {Promise<{ probe: object, historical: { fix: string, preFix: string } }>}
 */
async function qualifyHistoricalProbe({
  folder,
  root,
  evaluation,
  contract,
  file,
  probe,
  revisions,
  pristine,
  make,
  discard,
  registry,
  policy,
  engine,
  validate,
  digests,
  writer,
  stop,
  log,
  signal,
}) {
  const behaviorIds = [probe.behaviorId, ...probe.defects.map((defect) => defect.behaviorId)];
  const oracleIds = oraclesOfBehaviors(contract, behaviorIds);
  if (oracleIds.length === 0) {
    throw stop({
      stage: 'qualification',
      exitCode: 10,
      message: `${file}: the behaviors it discharges (${[...new Set(behaviorIds)].join(', ')}) declare no oracle, so no arm can pass or fail`,
    });
  }
  const directory = `qualification/${probe.probeId}`;
  const evidence = {};
  for (const { phase, revision, expected, meaning } of PHASES) {
    const commit = revisions[revision];
    log(`${file}: the ${phase} arm at ${commit}`);
    const workspace = make(`qualify-${probe.probeId}-${phase}`, null, { commit });
    let result;
    try {
      result = await revisionArm({ contract, workspace, registry, oracleIds, policy, writer, directory, phase, file, stop, signal });
    } finally {
      discard(workspace);
    }
    const evidenceFile = `${directory}/${phase}.json`;
    writer.writeJson(evidenceFile, {
      probeId: probe.probeId,
      phase,
      commit,
      fixCommit: revisions.fix,
      workspace: workspace.label,
      verdict: result.verdict,
      oracles: result.oracles,
      steps: result.steps,
    });
    if (result.verdict !== expected) {
      throw stop({
        stage: 'qualification',
        exitCode: 11,
        message: `${file}: the ${phase} arm at ${commit} is ${result.verdict} where ${meaning} (${expected}), so the probe does not qualify; the evidence is in ${path.relative(folder, writer.pathOf(evidenceFile))}`,
      });
    }
    evidence[phase] = { file: evidenceFile };
  }
  const failBeforeEvidence = referenceTo(folder, writer, evidence['fail-before'].file, engine.digestBytes);
  const skillRoot = (evaluation.launch.skillRoot ?? '.').split('/');
  const candidate = {
    schemaVersion: expectedSchemaVersion('probe'),
    parentDigest: null,
    revisionCount: 0,
    probeId: probe.probeId,
    probeClass: probe.probeClass,
    behaviorId: probe.behaviorId,
    systemId: evaluation.evaluationId,
    implementationDigest: digests.implementationDigest,
    // The defect lives in the pre-fix revision, so that revision's tracked tree is the artifact under test.
    artifactDigest: trackedTreeDigest({
      repository: pristine.repository,
      commit: revisions.preFix,
      directory: path.join(root, ...skillRoot),
      exclude: [folder],
    }),
    commitDigest: digests.commitDigest,
    rationale: probe.rationale,
    qualification: {
      route: 'historical',
      failBeforeEvidence,
      passAfterEvidence: referenceTo(folder, writer, evidence['pass-after'].file, engine.digestBytes),
      fixCommitDigest: engine.digestBytes(Buffer.from(revisions.fix, 'utf8')),
      // Both arms are judged by the one compiled contract the run read before any arm ran, so the oracle is the same at both revisions.
      oracleStableAcrossRevisions: true,
    },
    expectedClean: false,
    defects: probe.defects.map((defect) => ({
      defectId: defect.defectId,
      behaviorId: defect.behaviorId,
      summary: defect.summary,
      severity: defect.severity,
      oracleEvidence: [failBeforeEvidence],
      source: defect.source,
      manifestationWitness: defect.manifestationWitness,
    })),
    defectSignature: probe.defectSignature ?? null,
  };
  const refusal = await admissionRefusal({ candidate, contract, engine, validate });
  if (refusal !== null) throw stop({ stage: 'qualification', exitCode: 10, message: `${file}: ${refusal}` });
  log(`${file}: qualified; it fails at ${revisions.preFix} and passes at ${revisions.fix}`);
  return { probe: candidate, historical: { fix: revisions.fix, preFix: revisions.preFix } };
}

/**
 * The workspace a historical probe's witness legs run in: a worktree at the
 * pre-fix revision, whose registry targets must launch. Its trials reproduce
 * it, so it is returned beside its port.
 */
async function historicalRoute({ preFix, make, registry, stop, log }) {
  const workspace = make(`historical-${preFix}`, null, { commit: preFix });
  const problems = registry.targetProblems(workspace.root);
  if (problems.length > 0) {
    throw stop({
      stage: 'launch',
      exitCode: 12,
      message: `the registry cannot launch in the pre-fix workspace at ${preFix}: ${problems.join('; ')}`,
    });
  }
  const { port } = await registry.createProbePort({ cwd: workspace.root, projectRoot: workspace.root });
  log(`pre-fix workspace at ${preFix}: ${workspace.root}`);
  return { label: `historical:${preFix}`, cwd: workspace.root, port, workspace };
}

module.exports = { historicalRevisions, historicalRoute, qualifyHistoricalProbe };
