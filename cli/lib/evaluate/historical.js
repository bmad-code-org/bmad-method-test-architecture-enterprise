/**
 * The historical route (AD-6, AD-8, AD-9): a seeded probe whose defect is a
 * real one a commit fixed, qualified across that fix boundary.
 *
 * A committed historical probe names its fix commit (`qualification.fixCommit`,
 * a hexadecimal commit id). The post-fix revision is that commit
 * and the pre-fix revision its first parent, both by full id. The probe is
 * refused, with the reason, when the run has no revisions to address or the
 * target cannot run at one of them (`historicalRevisions` names each case); a
 * refused probe runs nowhere and the rest of the run goes on. A `fixCommit`
 * that names no commit in a full-history repository is an authoring defect
 * (exit 10).
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
 *
 * The deployment route (Story 1.32) serves a target reachable only as a
 * remote deployment. The committed probe names, in place of `fixCommit`, a
 * pre-fix and a post-fix deployment (`qualification.deployments`): the
 * release identifier each runs and the origin each HTTP interface answers at.
 * Each origin must be one the registry's HTTP policy authorizes, which
 * eval-quality's `evaluateTarget` decides before any arm runs; a deployment it
 * does not authorize refuses the probe with its reason. The fail-before arm
 * runs against the pre-fix deployment and the pass-after arm against the
 * post-fix one, with the same verdicts required and the same evidence files;
 * the qualified probe records `artifactDigest` as the digest of the pre-fix
 * release identifier and `fixCommitDigest` as that of the post-fix one. The
 * witness leg and the trials of the arm `historical:<pre-fix release>` reach
 * the pre-fix deployment (`deploymentRoute`). No worktree is made, so the
 * route needs no git history.
 */

'use strict';

const path = require('node:path');

const { admissionRefusal, armVerdict, referenceTo } = require('./admission');
const { causeNote, faultRecord, hostEnvironmentPort, reasonNote, runArm } = require('./arm');
const { DeploymentUnreachable, isApiEntry, originKey, originTarget, sharedOrigin } = require('./http-target');
const { expectedSchemaVersion } = require('./engine');
const { evaluateOracles, oraclesOfBehaviors } = require('./evaluator');
const { WorkspaceRefusal, isDirectory, runGit, trackedTreeDigest } = require('./workspace');

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
 * A `fixCommit` that does not resolve in a repository with its full history
 * is an authoring defect (`defect`, exit 10): the probe names a commit that
 * is not there. In a shallow clone the same miss, and a fix commit whose
 * parent the clone cut off, refuse the probe, naming the shallow history. So
 * do a pristine workspace that is not a git worktree, a fix commit that is
 * not an ancestor of the evaluated commit (git's own error when it cannot
 * tell), and one with no parent. A `fixCommit` that resolves through a ref of
 * the same spelling (a branch named like an id) is an authoring defect too.
 * Whether the target can run at each revision is `qualifyHistoricalProbe`'s
 * question, answered on the worktrees themselves.
 *
 * @param {object} options
 * @param {object} options.pristine the run's pristine workspace
 * @param {string} options.fixCommit the committed probe's `qualification.fixCommit`
 * @param {typeof runGit} [options.git] how git is asked, for a test to answer in its place
 * @returns {{ fix: string, preFix: string } | { refused: string } | { defect: string }}
 */
function historicalRevisions({ pristine, fixCommit, git = runGit }) {
  if (pristine.kind !== 'git-worktree') {
    return {
      refused: `the pristine workspace is a temp copy${pristine.dirty ? ' of the working tree' : ''}, not a git worktree, so the run has no revisions to address; evaluate a committed git target without --from-working-tree`,
    };
  }
  const ask = (args) => git(['-C', pristine.repository, ...args]);
  const shallow = ask(['rev-parse', '--is-shallow-repository']);
  const isShallow = shallow.ok && shallow.stdout.trim() === 'true';
  const resolved = ask(['rev-parse', '--verify', '--quiet', '--end-of-options', `${fixCommit}^{commit}`]);
  if (!resolved.ok) {
    return isShallow
      ? {
          refused: `fixCommit ${fixCommit} is not in the shallow history of ${pristine.repository}; fetch the full history (git fetch --unshallow) to qualify it`,
        }
      : { defect: `fixCommit ${fixCommit} names no commit in ${pristine.repository}` };
  }
  const fix = resolved.stdout.trim();
  // An id that resolves through a branch or tag of the same spelling is a ref, which moves as history advances.
  if (!fix.startsWith(fixCommit)) {
    return {
      defect: `fixCommit ${fixCommit} resolves to ${fix} through a ref of that name, not as a commit id; name the commit by its own id`,
    };
  }
  const ancestor = ask(['merge-base', '--is-ancestor', fix, pristine.commit]);
  if (!ancestor.ok) {
    return {
      refused:
        ancestor.status === 1
          ? `fix commit ${fix} is not an ancestor of the evaluated commit ${pristine.commit}, so the code under evaluation does not carry the fix`
          : `git cannot tell whether fix commit ${fix} is an ancestor of the evaluated commit ${pristine.commit}: ${ancestor.detail}`,
    };
  }
  const parent = ask(['rev-parse', '--verify', '--quiet', `${fix}^1`]);
  if (!parent.ok) {
    return {
      refused: isShallow
        ? `fix commit ${fix} has no parent in the shallow history of ${pristine.repository}; fetch the full history (git fetch --unshallow) to qualify it`
        : `fix commit ${fix} has no parent, so there is no pre-fix revision for the defect to fail before the fix`,
    };
  }
  const preFix = parent.stdout.trim();
  return { fix, preFix };
}

/**
 * One arm at one revision: the plan run once through `port` (a worktree's,
 * or a deployment's), judged over `oracleIds`. A step the registry refuses
 * stops with exit 10, any other arm failure with exit 12, after its fault is
 * written with `where` the arm ran.
 */
async function revisionArm({ contract, port, where, registry, oracleIds, policy, writer, directory, phase, file, stop, signal }) {
  let arm;
  try {
    arm = await runArm({ contract, port: hostEnvironmentPort({ port, registry }), registry, label: phase, signal });
  } catch (error) {
    writer.writeJson(`${directory}/fault.json`, {
      phase,
      ...where,
      ...faultRecord(error),
      steps: error?.steps ?? [],
    });
    const denied = error?.code === DENIAL_FAULT;
    throw stop({
      stage: 'qualification',
      exitCode: denied ? 10 : 12,
      message: `${file}: the ${phase} arm ${denied ? `was denied by the registry${reasonNote(error)}` : 'could not run'}: ${error?.message ?? error}${causeNote(error)}`,
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

/** The oracles a historical probe's arms are judged over: those of every behavior it discharges, or exit 10 when there are none. */
function historicalOracles({ contract, probe, file, stop }) {
  const behaviorIds = [probe.behaviorId, ...probe.defects.map((defect) => defect.behaviorId)];
  const oracleIds = oraclesOfBehaviors(contract, behaviorIds);
  if (oracleIds.length === 0) {
    throw stop({
      stage: 'qualification',
      exitCode: 10,
      message: `${file}: the behaviors it discharges (${[...new Set(behaviorIds)].join(', ')}) declare no oracle, so no arm can pass or fail`,
    });
  }
  return oracleIds;
}

/**
 * Runs both qualification arms in order, each through the port `portOf`
 * gives its phase, writes each arm's evidence as `<phase>.json` with `where`
 * the arm ran, and stops with exit 11 when an arm goes the other way; the
 * references to both evidence files.
 */
async function qualifyingArms({ folder, contract, probe, file, oracleIds, registry, policy, engine, writer, stop, log, signal, phases }) {
  const directory = `qualification/${probe.probeId}`;
  const references = {};
  for (const { phase, expected, meaning, at, where, port } of phases) {
    log(`${file}: the ${phase} arm at ${at}`);
    const result = await revisionArm({ contract, port, where, registry, oracleIds, policy, writer, directory, phase, file, stop, signal });
    const evidenceFile = `${directory}/${phase}.json`;
    writer.writeJson(evidenceFile, {
      probeId: probe.probeId,
      phase,
      ...where,
      verdict: result.verdict,
      oracles: result.oracles,
      steps: result.steps,
    });
    if (result.verdict !== expected) {
      throw stop({
        stage: 'qualification',
        exitCode: 11,
        message: `${file}: the ${phase} arm at ${at} is ${result.verdict} where ${meaning} (${expected}), so the probe does not qualify; the evidence is in ${path.relative(folder, writer.pathOf(evidenceFile))}`,
      });
    }
    references[phase] = referenceTo(folder, writer, evidenceFile, engine.digestBytes);
  }
  return references;
}

/**
 * The qualified historical probe, validated against eval-quality's probe
 * schema and admitted by its qualification gate (exit 10 otherwise):
 * `artifactDigest` names what the defect lives in (the pre-fix revision's
 * tree, or the pre-fix release) and `fixCommitDigest` the fix boundary (the
 * fix commit's id, or the post-fix release).
 */
async function historicalCandidate({
  evaluation,
  contract,
  file,
  probe,
  digests,
  artifactDigest,
  fixCommitDigest,
  references,
  engine,
  validate,
  stop,
}) {
  const failBeforeEvidence = references['fail-before'];
  const candidate = {
    schemaVersion: expectedSchemaVersion('probe'),
    parentDigest: null,
    revisionCount: 0,
    probeId: probe.probeId,
    probeClass: probe.probeClass,
    behaviorId: probe.behaviorId,
    systemId: evaluation.evaluationId,
    implementationDigest: digests.implementationDigest,
    artifactDigest,
    commitDigest: digests.commitDigest,
    rationale: probe.rationale,
    qualification: {
      route: 'historical',
      failBeforeEvidence,
      passAfterEvidence: references['pass-after'],
      fixCommitDigest,
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
  return candidate;
}

/**
 * Qualifies one historical probe across its fix boundary and builds the
 * qualified probe, validated against eval-quality's probe schema and admitted
 * by its qualification gate. Throws a `RunStop` with the phase's exit when a
 * step fails.
 *
 * @returns {Promise<{ probe: object, historical: { fix: string, preFix: string } } | { refused: string }>}
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
  const oracleIds = historicalOracles({ contract, probe, file, stop });
  // Both revisions' worktrees are made and checked before either arm runs, so a revision the target cannot
  // run at refuses the probe, with the reason, before any evidence is written. The checks are the ones a
  // launch meets: the worktree holds launch.root with no submodule under it, the skill root is a directory,
  // and every registry target is present and executable (links followed, provisioned copies included).
  const workspaces = {};
  try {
    for (const { phase, revision } of PHASES) {
      const commit = revisions[revision];
      let workspace;
      try {
        workspace = make(`qualify-${probe.probeId}-${phase}`, null, { commit });
      } catch (error) {
        if (error instanceof WorkspaceRefusal && error.atRevision)
          return { refused: `the ${revision === 'fix' ? 'fix' : 'pre-fix'} revision ${commit} cannot run the target: ${error.message}` };
        throw error;
      }
      workspaces[phase] = workspace;
      const skillRoot = path.join(workspace.root, ...(evaluation.launch.skillRoot ?? '.').split('/'));
      const problems = [
        ...(isDirectory(skillRoot) ? [] : [`launch.skillRoot ${evaluation.launch.skillRoot} is not a directory`]),
        ...registry.targetProblems(workspace.root),
      ];
      if (problems.length > 0) {
        return {
          refused: `the ${revision === 'fix' ? 'fix' : 'pre-fix'} revision ${commit} cannot run the target: ${problems.join('; ')}`,
        };
      }
    }
    const phases = [];
    for (const { phase, revision, expected, meaning } of PHASES) {
      const workspace = workspaces[phase];
      const { port } = await registry.createProbePort({ cwd: workspace.root, projectRoot: workspace.root });
      phases.push({
        phase,
        expected,
        meaning,
        at: revisions[revision],
        where: {
          commit: revisions[revision],
          fixCommit: revisions.fix,
          workspace: workspace.label,
        },
        port,
      });
    }
    const references = await qualifyingArms({
      folder,
      contract,
      probe,
      file,
      oracleIds,
      registry,
      policy,
      engine,
      writer,
      stop,
      log,
      signal,
      phases,
    });
    const skillRoot = (evaluation.launch.skillRoot ?? '.').split('/');
    const candidate = await historicalCandidate({
      evaluation,
      contract,
      file,
      probe,
      digests,
      // The defect lives in the pre-fix revision, so that revision's tracked tree is the artifact under test.
      artifactDigest: trackedTreeDigest({
        repository: pristine.repository,
        commit: revisions.preFix,
        directory: path.join(root, ...skillRoot),
        exclude: [folder],
      }),
      fixCommitDigest: engine.digestBytes(Buffer.from(revisions.fix, 'utf8')),
      references,
      engine,
      validate,
      stop,
    });
    log(`${file}: qualified; it fails at ${revisions.preFix} and passes at ${revisions.fix}`);
    return { probe: candidate, historical: { fix: revisions.fix, preFix: revisions.preFix } };
  } finally {
    for (const workspace of Object.values(workspaces)) discard(workspace);
  }
}

/**
 * The pre-fix and post-fix deployments a deployment-routed probe names, or
 * the reason the runtime cannot address them: the refusals of `check`'s
 * `historical` rule on the boundary, a probe naming neither boundary,
 * deployments beside a `fixCommit`, one deployment without the other, one
 * release for both, a registry entry that is not an HTTP entry, origins that
 * are not an http or https origin for each HTTP interface of the registry and
 * no other, or a pre-fix origin reaching a post-fix one. `check` refuses each
 * first, so this guard is defence in depth: reaching one here stops the
 * qualification with exit 12.
 *
 * @param {object} qualification the committed probe's `qualification`
 * @param {object[]} registry the evaluation's registry entries
 * @returns {{ preFix: object, fix: object } | { unaddressable: string }}
 */
function deploymentPair(qualification, registry) {
  const { deployments, fixCommit } = qualification;
  if (deployments === undefined && fixCommit === undefined) {
    return { unaddressable: 'it names neither a fixCommit nor deployments, so there is no fix boundary to qualify across' };
  }
  if (fixCommit !== undefined) {
    return {
      unaddressable: 'it names deployments beside a fixCommit, so the runtime cannot tell a worktree route from a deployment route',
    };
  }
  const missing = ['preFix', 'fix'].filter((name) => deployments?.[name] === undefined);
  if (missing.length > 0) {
    return { unaddressable: `it names no ${missing.join(' and no ')} deployment, so there is no fix boundary to qualify across` };
  }
  if (deployments.preFix.release === deployments.fix.release) {
    return {
      unaddressable: `it names release ${JSON.stringify(deployments.preFix.release)} for both deployments, so there is no fix boundary to qualify across`,
    };
  }
  const other = registry.filter((entry) => !isApiEntry(entry));
  if (other.length > 0) {
    return {
      unaddressable: `the registry declares ${other.map((entry) => JSON.stringify(entry?.interfaceId)).join(', ')}, which a deployment does not answer over HTTP`,
    };
  }
  const wanted = registry.map((entry) => entry.interfaceId).sort();
  for (const side of ['preFix', 'fix']) {
    const origins = deployments[side].origins ?? {};
    const named = Object.keys(origins).sort();
    if (JSON.stringify(named) !== JSON.stringify(wanted) || named.some((id) => originTarget(origins[id]) === null)) {
      return {
        unaddressable: `its ${side} deployment names ${JSON.stringify(origins)}, where every HTTP interface of the registry (${wanted.join(', ')}) needs one http or https origin`,
      };
    }
  }
  const shared = sharedOrigin(deployments.preFix.origins, deployments.fix.origins);
  if (shared !== null) {
    return {
      unaddressable: `its pre-fix origin for ${shared.preFix} and its post-fix origin for ${shared.fix} both reach ${shared.origin}, so the fail-before arm would reach the post-fix deployment`,
    };
  }
  return { preFix: deployments.preFix, fix: deployments.fix };
}

/**
 * What names the target a historical arm runs at, so two probes on one arm
 * label can be held to one target: a worktree, or the pre-fix deployment's
 * origins, each read as `originKey` reads it (scheme, host with one trailing
 * dot dropped, port), by interface in sorted order, so the same origins
 * spelled or ordered otherwise name the same target.
 */
function routeIdentity(historical) {
  if (historical.deployments === undefined) return 'a worktree';
  const { origins } = historical.deployments.preFix;
  const read = Object.keys(origins)
    .sort()
    .map((id) => `${id}=${originKey(origins[id]) ?? origins[id]}`);
  return `the origins ${read.join(', ')}`;
}

/**
 * Qualifies one deployment-routed historical probe: each deployment is first
 * held to the registry's HTTP policy (a deployment eval-quality does not
 * authorize refuses the probe, with its reason; one whose host does not
 * resolve is unreachable, exit 12), then the plan runs once against the
 * pre-fix deployment, where the oracles of the probe's behaviors must be
 * violated, and once against the post-fix one, where they must hold (exit 11
 * otherwise). No workspace is made: every HTTP call goes to the deployment's
 * origin, starts nothing, and is decided over the one authorization
 * eval-quality allowed there. The qualified probe records `artifactDigest` as
 * the digest of the pre-fix release identifier and `fixCommitDigest` as the
 * digest of the post-fix one.
 *
 * @returns {Promise<{ probe: object, historical: { fix: string, preFix: string, deployments: object } } | { refused: string }>}
 */
async function qualifyDeploymentProbe({
  folder,
  evaluation,
  contract,
  file,
  probe,
  deployments,
  pristine,
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
  const oracleIds = historicalOracles({ contract, probe, file, stop });
  const reached = {};
  for (const { revision } of PHASES) {
    const { release, origins } = deployments[revision];
    const side = revision === 'fix' ? 'post-fix' : 'pre-fix';
    let access;
    try {
      access = await registry.deploymentAccess(origins, { signal });
    } catch (error) {
      if (!(error instanceof DeploymentUnreachable)) throw error;
      throw stop({
        stage: 'qualification',
        exitCode: 12,
        message: `${file}: the ${side} deployment ${release} cannot be reached: ${error.message}`,
      });
    }
    if (access.refused !== undefined) {
      return { refused: `the ${side} deployment ${release} is not one the registry authorizes: ${access.refused}` };
    }
    reached[revision] = { release, ...access };
  }
  const phases = [];
  for (const { phase, revision, expected, meaning } of PHASES) {
    const deployment = reached[revision];
    const { port } = await registry.createProbePort({ cwd: pristine.root, projectRoot: pristine.root, deployment });
    phases.push({
      phase,
      expected,
      meaning,
      at: `the deployment of ${deployment.release}`,
      where: { release: deployment.release, origins: deployment.origins },
      port,
    });
  }
  const references = await qualifyingArms({
    folder,
    contract,
    probe,
    file,
    oracleIds,
    registry,
    policy,
    engine,
    writer,
    stop,
    log,
    signal,
    phases,
  });
  const candidate = await historicalCandidate({
    evaluation,
    contract,
    file,
    probe,
    digests,
    // The defect lives in the pre-fix release, and the post-fix release is the fix boundary.
    artifactDigest: engine.digestBytes(Buffer.from(reached.preFix.release, 'utf8')),
    fixCommitDigest: engine.digestBytes(Buffer.from(reached.fix.release, 'utf8')),
    references,
    engine,
    validate,
    stop,
  });
  log(`${file}: qualified; it fails at the deployment of ${reached.preFix.release} and passes at the deployment of ${reached.fix.release}`);
  return { probe: candidate, historical: { fix: reached.fix.release, preFix: reached.preFix.release, deployments: reached } };
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
  return { label: `historical:${preFix}`, cwd: workspace.root, port, workspace, deployment: null };
}

/**
 * Where a deployment-routed probe's witness legs go: the pre-fix deployment
 * the qualification reached, through a port whose HTTP calls reach its
 * origins over the authorization eval-quality allowed there, beside the
 * pristine workspace (no server starts, so nothing runs there for an HTTP
 * call). The trials of its arm reach the same deployment.
 */
async function deploymentRoute({ deployment, pristine, registry, log }) {
  const { port } = await registry.createProbePort({ cwd: pristine.root, projectRoot: pristine.root, deployment });
  log(`pre-fix deployment of ${deployment.release}: ${Object.values(deployment.origins).join(', ')}`);
  return { label: `historical:${deployment.release}`, cwd: pristine.root, port, workspace: null, deployment };
}

module.exports = {
  deploymentPair,
  deploymentRoute,
  historicalRevisions,
  historicalRoute,
  qualifyDeploymentProbe,
  qualifyHistoricalProbe,
  routeIdentity,
};
