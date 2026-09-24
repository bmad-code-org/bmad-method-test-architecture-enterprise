/**
 * `tea-evaluate preflight`: qualify an evaluation's seeded probes in a
 * disposable workspace, drive its preflight legs against the real target, and
 * take the verdict from the eval-quality CLI (AD-6, AD-8).
 *
 * The steps, each stopping the run with its own exit when it fails:
 *
 *   1. `check` over the folder (exit 10 on any authoring defect);
 *   2. the evaluation is one this release can run: a `cli` interface, and
 *      every probe that seeds a defect on the `controlled-mutation` route
 *      (exit 12 otherwise, before anything runs);
 *   3. the pristine workspace (`workspace.js`: a detached worktree at the
 *      evaluated commit, or a temp copy), every registry target present and
 *      executable in it, and `runs/<invocationId>/run.json` recording what was
 *      evaluated (exit 12 when the workspace cannot be made);
 *   4. `eval-quality compile` and `eval-quality seal` over the run's copy of
 *      `contract.json` (a documented non-zero exit passes through);
 *   5. each seeded probe qualified through AD-8's six steps (`mutation.js`) in
 *      a workspace of its own (`qualify-<probeId>`, reproducing the pristine
 *      one and removed after its cycle), with the single-trial arm executor
 *      (`arm.js`) and the deterministic evaluator (`evaluator.js`); its
 *      evidence is written under `runs/<invocationId>/qualification/<probeId>/`
 *      as far as the cycle got, and a step that fails exits 10, 11 or 12 with
 *      no qualified probe written;
 *   6. the adopter's project read again and compared with its reading before
 *      the workspaces were made (exit 12 on any change);
 *   7. one mutated workspace per mutation, reproducing the pristine one, its
 *      mutation applied and its digest held to the one the cycle measured;
 *   8. the legs, planned and driven by eval-quality's `runPreflight` through a
 *      recording port: a leg a defect's manifestation witness names runs in
 *      that defect's mutated workspace, every other leg in the pristine one,
 *      and each observation is written under `observations/` with the
 *      workspace and working directory it ran in; a leg the adapter refuses or
 *      cannot run is written under `faults/` and ends the run (exit 10 for a
 *      denial, 12 otherwise);
 *   9. the adopter's project read again (exit 12 on any change, with the
 *      probe list removed), then `eval-quality preflight --observations ...
 *      --run-id <invocationId>` over the persisted files, whose exit code is
 *      the command's exit code, and last the qualified probes written to
 *      `runs/<invocationId>/probes/`.
 *
 * `runPreflight` also returns a verdict. It is discarded: an enforced verdict
 * comes from the CLI over persisted files, so CI can reproduce it by hand, and
 * the run's `engine/preflight.json` records the call that produced it. Every
 * workspace is removed when the command ends, on an interrupting signal
 * included.
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { hostEnvironmentPort, persistableRequest, runArm } = require('./arm');
const { TEA_MANIFEST, checkEvaluation } = require('./check');
const { MANIFEST_NAME } = require('./folder');
const { engineVersion, loadEngine } = require('./engine');
const { runEngineStage } = require('./engine-cli');
const { evaluateOracles, oraclesOfBehaviors } = require('./evaluator');
const { QualificationError, applyReplaceExact, qualifiedProbe, runMutationCycle } = require('./mutation');
const { createArtifactValidator } = require('./records');
const { registryFromEvaluation } = require('./registry');
const {
  WorkspaceRefusal,
  adopterTreeState,
  cleanUpOnSignal,
  createWorkspace,
  joinAsSpelled,
  realPathLoosely,
  removeWorkspace,
  treeDigest,
} = require('./workspace');

const CONTRACT_NAME = 'contract.json';
const POLICY_PATH = 'policy/scoring-policy.json';
const PROBE_FILE = /\.probe\.json$/;
const QUALIFIED_ROUTE = 'controlled-mutation';

/** The eval-quality fault a command-line adapter throws when its policy refuses a request. */
const DENIAL_FAULT = 'forbidden-target';

/** The errors `runPreflight` raises while planning, before any leg reaches the port; the CLI raises the same over the same files. */
const PLANNING_FAULTS = new Set(['schema-parse-failure', 'schema-version-mismatch']);

/** The result of one `tea-evaluate preflight`. */
class PreflightOutcome {
  /**
   * @param {object} fields
   * @param {'check'|'launch'|'engine'|'qualification'|'leg'|'verdict'} fields.stage where the run stopped
   * @param {number} fields.exitCode
   * @param {string} fields.message
   * @param {Array<{file: string, rule: string, message: string}>} [fields.findings]
   * @param {string} [fields.runDirectory]
   */
  constructor({ stage, exitCode, message, findings = [], runDirectory = null }) {
    this.stage = stage;
    this.exitCode = exitCode;
    this.message = message;
    this.findings = findings;
    this.runDirectory = runDirectory;
  }
}

/** A stop inside a run, carrying the outcome it ends with. */
class RunStop extends Error {
  constructor(outcome) {
    super(outcome.message);
    this.name = 'RunStop';
    this.outcome = outcome;
  }
}

/**
 * One identifier per invocation: sortable by start time, unique within it.
 *
 * @returns {string}
 */
function newInvocationId() {
  const stamp = new Date().toISOString().replaceAll(/[-:.]/g, '');
  return `${stamp}-${crypto.randomBytes(4).toString('hex')}`;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** `relative` in POSIX form. */
function posix(relative) {
  return relative.split(path.sep).join('/');
}

/** Every committed probe that seeds a defect, sorted by file name, parsed. */
function seededProbes(folder) {
  const directory = path.join(folder, 'probes');
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((name) => PROBE_FILE.test(name))
    .sort()
    .map((name) => ({ file: `probes/${name}`, probe: readJson(path.join(directory, name)) }))
    .filter(({ probe }) => Array.isArray(probe.defects) && probe.defects.length > 0);
}

/** A leg's file name: its order in the run, then its identifier made safe for a path. */
function legFileName(sequence, legId) {
  return `${String(sequence).padStart(3, '0')}-${encodeURIComponent(String(legId))}.json`;
}

/**
 * An environment-probe port that routes each leg to its workspace and records
 * it.
 *
 * A leg named in `routes` (a manifestation witness's leg) runs through that
 * route's port, every other leg through `pristine`'s. Every request goes
 * through `hostEnvironmentPort`, so it carries the host's values for the keys
 * its registry entry permits, and every injected value is scrubbed from what
 * is written or returned. Each observation is written with the workspace
 * label and working directory the leg ran in.
 *
 * @param {object} options
 * @param {{label: string, cwd: string, port: object}} options.pristine
 * @param {Map<string, {label: string, cwd: string, port: object}>} [options.routes] by leg identifier
 * @param {object} options.registry
 * @param {string} options.runDirectory
 * @returns {{ port: {probe: Function}, observations: object[], calls: () => number, fault: () => object|null }}
 */
function recordingPort({ pristine, routes = new Map(), registry, runDirectory }) {
  const observations = [];
  const ports = new Map();
  const portFor = (route) => {
    if (!ports.has(route)) ports.set(route, hostEnvironmentPort({ port: route.port, registry }));
    return ports.get(route);
  };
  let sequence = 0;
  let fault = null;
  const probe = async (request, signal) => {
    sequence += 1;
    const legSequence = sequence;
    const route = routes.get(request?.probeId) ?? pristine;
    try {
      const answered = await portFor(route).probe(request, signal);
      writeJson(path.join(runDirectory, 'observations', legFileName(legSequence, request.probeId)), {
        legId: request.probeId,
        sequence: legSequence,
        workspace: route.label,
        cwd: route.cwd,
        request: persistableRequest(answered.request),
        observation: answered.observation,
      });
      observations.push(answered.observation);
      return answered.observation;
    } catch (error) {
      fault = {
        legId: request?.probeId ?? null,
        sequence: legSequence,
        workspace: route.label,
        cwd: route.cwd,
        code: typeof error?.code === 'string' ? error.code : null,
        message: String(error?.message ?? error),
        request: persistableRequest(error?.request ?? request),
      };
      writeJson(path.join(runDirectory, 'faults', legFileName(legSequence, fault.legId)), fault);
      throw error;
    }
  };
  return { port: { probe }, observations, calls: () => sequence, fault: () => fault };
}

/** `runs/`, created with a `.gitignore` that ignores everything in it, so no run lands in the adopter's commits (AD-12). */
function ensureRunsDirectory(folder) {
  const runs = path.join(folder, 'runs');
  fs.mkdirSync(runs, { recursive: true });
  const ignore = path.join(runs, '.gitignore');
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '*\n');
  return runs;
}

/** What an arm's oracles say together: `held` when every one holds, `violated` when one fails, otherwise `inconclusive`. */
function armVerdict(oracles) {
  if (oracles.every((oracle) => oracle.disposition === 'held')) return 'held';
  return oracles.some((oracle) => oracle.disposition === 'violated') ? 'violated' : 'inconclusive';
}

/** An artifact reference to a file the run wrote, by its path relative to the evaluation folder. */
function referenceTo(folder, file, digestBytes) {
  return { storage: 'public', path: posix(path.relative(folder, file)), privateRef: null, digest: digestBytes(fs.readFileSync(file)) };
}

/**
 * Writes one probe's qualification evidence as far as the cycle got: each arm
 * that ran and the rollback record. Returns the files written, by name.
 */
function writeQualificationEvidence(directory, { probe, evidence, workspace, fault = null }) {
  const files = {};
  if (fault !== null) {
    files.fault = path.join(directory, 'fault.json');
    writeJson(files.fault, { probeId: probe.probeId, mutationId: evidence.mutationId, ...fault });
  }
  const arm = (name, result, digestField) => {
    if (result === null) return;
    files[name] = path.join(directory, `${name}.json`);
    writeJson(files[name], {
      probeId: probe.probeId,
      mutationId: evidence.mutationId,
      phase: name,
      workspace,
      targetArtifact: evidence.targetArtifact,
      targetArtifactDigest: evidence[digestField],
      verdict: result.verdict,
      oracles: result.oracles,
      steps: result.steps,
    });
  };
  arm('baseline-pass', evidence.baseline, 'preDigest');
  arm('mutated-fail', evidence.mutated, 'mutatedDigest');
  files.rollback = path.join(directory, 'rollback.json');
  writeJson(files.rollback, {
    probeId: probe.probeId,
    mutationId: evidence.mutationId,
    targetArtifact: evidence.targetArtifact,
    preDigest: evidence.preDigest,
    mutatedDigest: evidence.mutatedDigest,
    restoredDigest: evidence.restoredDigest,
    reExecutionCap: evidence.reExecutionCap,
    rePasses: evidence.rePasses.map((rePass) => ({
      phase: rePass.phase,
      verdict: rePass.verdict,
      oracles: rePass.oracles,
      steps: rePass.steps,
    })),
    rollbackVerified: evidence.rollbackVerified,
  });
  return files;
}

/**
 * Runs `tea-evaluate preflight` over one evaluation folder.
 *
 * @param {string} folder the resolved evaluation folder
 * @param {object} [options]
 * @param {boolean} [options.fromWorkingTree] evaluate the working tree, uncommitted work included, in a temp copy
 * @param {NodeJS.ProcessEnv} [options.env] the environment the engine CLI stage runs under
 * @param {(line: string) => void} [options.log] progress lines for an operator
 * @returns {Promise<PreflightOutcome>}
 */
async function runPreflightCommand(folder, { fromWorkingTree = false, env = process.env, log = () => {} } = {}) {
  const findings = await checkEvaluation(folder);
  if (findings.length > 0) {
    return new PreflightOutcome({ stage: 'check', exitCode: 10, message: `${findings.length} authoring defect(s)`, findings });
  }

  const evaluation = readJson(path.join(folder, MANIFEST_NAME));
  if (evaluation.interface !== 'cli') {
    return new PreflightOutcome({
      stage: 'launch',
      exitCode: 12,
      message: `preflight drives cli targets; this evaluation declares interface ${JSON.stringify(evaluation.interface)}`,
    });
  }
  const seeded = seededProbes(folder);
  const unqualifiable = seeded.filter(({ probe }) => probe.qualification?.route !== QUALIFIED_ROUTE);
  if (unqualifiable.length > 0) {
    return new PreflightOutcome({
      stage: 'launch',
      exitCode: 12,
      message: `${unqualifiable.map(({ file, probe }) => `${file} (route ${probe.qualification?.route})`).join(', ')} seed a defect on a route this release does not qualify; it qualifies seeded probes on the ${QUALIFIED_ROUTE} route only, so a retry cannot pass`,
    });
  }

  const root = realPathLoosely(joinAsSpelled(folder, evaluation.launch.root));
  const runsDirectory = ensureRunsDirectory(folder);
  const workspaces = [];
  const controller = new AbortController();
  const retractOnSignal = [];
  const release = cleanUpOnSignal(workspaces, controller, { paths: retractOnSignal });
  try {
    const readTree = () => adopterTreeState(root, { exclude: [runsDirectory] });
    const before = readTree();
    // Every workspace after the first reproduces it, so the run evaluates one
    // set of bytes whatever changes in the project meanwhile.
    const make = (label, basis = null) => {
      const workspace = createWorkspace({
        root,
        kind: evaluation.workspace.kind,
        provision: evaluation.workspace.provision,
        exclude: [folder],
        fromWorkingTree,
        label,
        basis,
      });
      workspaces.push(workspace);
      return workspace;
    };
    const discard = (workspace) => {
      workspaces.splice(workspaces.indexOf(workspace), 1);
      removeWorkspace(workspace);
    };
    const pristine = make('pristine');
    log(
      `pristine workspace, ${pristine.kind === 'git-worktree' ? `a detached worktree at ${pristine.commit}` : `a temp copy${pristine.dirty ? ' of the working tree' : ''}`}: ${pristine.root}`,
    );
    if (pristine.kind === 'git-worktree' && before.status.length > 0) {
      log('the working tree has uncommitted changes, which this run does not evaluate; pass --from-working-tree to evaluate them');
    }
    return await runInWorkspaces({
      folder,
      evaluation,
      seeded,
      pristine,
      make,
      discard,
      before,
      readTree,
      runsDirectory,
      retractOnSignal,
      env,
      log,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof RunStop) return error.outcome;
    if (error instanceof WorkspaceRefusal) return new PreflightOutcome({ stage: 'launch', exitCode: 12, message: error.message });
    throw error;
  } finally {
    release();
    for (const workspace of workspaces) {
      try {
        removeWorkspace(workspace);
      } catch (error) {
        log(`could not remove the ${workspace.label} workspace at ${workspace.directory}: ${error.message}`);
      }
    }
  }
}

async function runInWorkspaces({
  folder,
  evaluation,
  seeded,
  pristine,
  make,
  discard,
  before,
  readTree,
  runsDirectory,
  retractOnSignal,
  env,
  log,
  signal,
}) {
  const registry = registryFromEvaluation(evaluation, { root: pristine.root });
  const problems = registry.targetProblems(pristine.root);
  if (problems.length > 0) {
    return new PreflightOutcome({ stage: 'launch', exitCode: 12, message: `the registry cannot launch: ${problems.join('; ')}` });
  }

  const invocationId = newInvocationId();
  const runDirectory = path.join(runsDirectory, invocationId);
  fs.mkdirSync(runDirectory, { recursive: true });
  log(`run ${invocationId}: ${runDirectory}`);
  const outcome = (fields) => new PreflightOutcome({ runDirectory, ...fields });
  const stop = (fields) => new RunStop(outcome(fields));
  const run = {
    invocationId,
    command: 'preflight',
    teaVersion: TEA_MANIFEST.version,
    evalQualityVersion: engineVersion(),
    commit: pristine.commit,
    dirty: pristine.dirty,
    workspace: {
      kind: pristine.kind,
      commit: pristine.commit,
      tree: pristine.tree,
      treeDigest: pristine.treeDigest,
      dirty: pristine.dirty,
    },
    workspaces: { pristine: pristine.root },
    adopterTree: { repository: before.repository, unchanged: null },
  };
  const runPath = path.join(runDirectory, 'run.json');
  writeJson(runPath, run);

  // The run keeps its own copy of the contract, so every stage below reads the
  // same bytes and the verdict can be reproduced from the run directory alone.
  const contractPath = path.join(runDirectory, CONTRACT_NAME);
  fs.copyFileSync(path.join(folder, CONTRACT_NAME), contractPath);
  const contract = readJson(contractPath);

  for (const [stage, output] of [
    ['compile', 'eval-contract.json'],
    ['seal', 'sealed-evaluator-brief.json'],
  ]) {
    const result = runEngineStage(stage, ['--in', contractPath, '--out', path.join(runDirectory, output)], { runDirectory, env, log });
    if (result.exitCode !== 0) {
      return outcome({
        stage: 'engine',
        exitCode: result.exitCode,
        message: `eval-quality ${stage} exited ${result.exitCode}\n${result.stderr}`,
      });
    }
  }

  const engine = await loadEngine();
  const { port: pristineAdapter } = await registry.createProbePort({ cwd: pristine.root, projectRoot: pristine.root });
  // The adopter's tree, read again after the qualification and after the
  // legs: a change stops the run with no qualified probe written (AD-8).
  const treeUnchanged = (when) => {
    const unchanged = JSON.stringify(readTree()) === JSON.stringify(before);
    run.adopterTree.unchanged = unchanged;
    writeJson(runPath, run);
    if (!unchanged) {
      throw stop({
        stage: when === 'qualification' ? 'qualification' : 'leg',
        exitCode: 12,
        message: `the adopter's ${before.repository === null ? 'project (launch.root)' : `tree at ${before.repository} (its git status, file contents or shared git state)`} changed during the ${when}, so no rollback is proved and no qualified probe is written; if you edited files meanwhile, run again`,
      });
    }
  };

  const qualified = [];
  if (seeded.length > 0) {
    const policy = readJson(path.join(folder, POLICY_PATH));
    const validate = createArtifactValidator();
    for (const { file, probe } of seeded) {
      // Each probe is qualified in a workspace of its own, so nothing its
      // mutated arm leaves behind reaches another probe or the legs.
      const workspace = make(`qualify-${probe.probeId}`, pristine);
      try {
        qualified.push(
          await qualifySeededProbe({
            folder,
            evaluation,
            contract,
            file,
            probe,
            pristine,
            workspace,
            registry,
            policy,
            engine,
            validate,
            runDirectory,
            stop,
            log,
            signal,
          }),
        );
      } finally {
        discard(workspace);
      }
    }
    treeUnchanged('qualification');
  }

  // One mutated workspace per mutation, for the legs its witnesses name.
  const routes = new Map();
  const mutatedByMutation = new Map();
  for (const entry of qualified) {
    let route = mutatedByMutation.get(entry.mutation.mutationId);
    if (route === undefined) {
      route = await mutatedRoute({ entry, pristine, make, registry, engine, stop, log });
      mutatedByMutation.set(entry.mutation.mutationId, route);
      run.workspaces[route.label] = route.cwd;
      writeJson(runPath, run);
    }
    for (const defect of entry.probe.defects) {
      if (defect.manifestationWitness !== null) routes.set(defect.manifestationWitness.legId, route);
    }
  }

  let verdict;
  // The CLI's probe list. A run that stops before the CLI's verdict completes
  // (a leg fault, a tree change, an engine stage that could not run, an
  // interrupting signal) removes it, so no qualified probe outlives a run
  // that failed.
  const probesPath = path.join(runDirectory, 'probes.json');
  const probes = qualified.map((entry) => entry.probe);
  writeJson(probesPath, probes);
  retractOnSignal.push(probesPath);
  let settled = false;
  try {
    const recorder = recordingPort({
      pristine: { label: 'pristine', cwd: pristine.root, port: pristineAdapter },
      routes,
      registry,
      runDirectory,
    });
    try {
      await engine.runPreflight({
        contract,
        probes,
        runId: invocationId,
        port: recorder.port,
        signal,
        // Leg progress only. The library's closing line reports the verdict this
        // command discards, and printing it would name a second verdict source.
        sink: (diagnostic) => {
          if (diagnostic.message.startsWith('leg ')) log(diagnostic.message);
        },
      });
    } catch (error) {
      const fault = recorder.fault();
      if (fault !== null) {
        return outcome({
          stage: 'leg',
          exitCode: fault.code === DENIAL_FAULT ? 10 : 12,
          message: `leg ${fault.legId} ${fault.code === DENIAL_FAULT ? 'was denied by the registry' : 'could not run'}: ${fault.message}`,
        });
      }
      const planning =
        recorder.calls() === 0 &&
        (error?.name === 'StructuralFailure' || (error?.name === 'RuntimeFault' && PLANNING_FAULTS.has(error.code)));
      if (!planning) {
        return outcome({ stage: 'leg', exitCode: 12, message: `the legs could not finish: ${error?.message ?? error}` });
      }
      // The plan itself refused before any leg ran. The CLI plans from the same
      // contract and probes, so it reports that refusal with its own exit below.
      log(`runPreflight refused the plan: ${error.message}`);
    }
    const observationsPath = path.join(runDirectory, 'observations.json');
    writeJson(observationsPath, recorder.observations);
    treeUnchanged('legs');

    verdict = runEngineStage(
      'preflight',
      [
        '--contract',
        contractPath,
        '--probes',
        probesPath,
        '--observations',
        observationsPath,
        '--run-id',
        invocationId,
        '--out',
        path.join(runDirectory, 'preflight-verdict.json'),
      ],
      { runDirectory, env, log },
    );
    settled = true;
  } finally {
    if (!settled) fs.rmSync(probesPath, { force: true });
  }
  for (const entry of qualified) writeJson(path.join(runDirectory, 'probes', `${entry.probe.probeId}.probe.json`), entry.probe);
  return outcome({
    stage: 'verdict',
    exitCode: verdict.exitCode,
    message: `eval-quality preflight exited ${verdict.exitCode}; its verdict and diagnostics are in ${path.relative(folder, runDirectory)}`,
  });
}

/**
 * Why a qualified probe may not reach the CLI, or null when it may: it must
 * meet eval-quality's published probe schema and pass eval-quality's own
 * qualification gate (`qualifyProbe`, against the operation its signature
 * names), so the runtime hands the CLI admitted probes only.
 *
 * @param {object} options
 * @param {object} options.candidate the qualified probe
 * @param {object} options.contract
 * @param {object} options.engine the loaded eval-quality library
 * @param {(kind: string, value: unknown) => Promise<string[]>} options.validate
 * @returns {Promise<string|null>}
 */
async function admissionRefusal({ candidate, contract, engine, validate }) {
  const problems = await validate('probe', candidate);
  if (problems.length > 0) return `the qualified probe does not meet eval-quality's probe schema: ${problems.join('; ')}`;
  const home =
    candidate.defectSignature === null ? null : engine.resolveHomeOperation(candidate.defectSignature, contract.permittedInterfaces);
  const admission = engine.qualifyProbe(candidate, home);
  if (admission.qualified) return null;
  return `eval-quality's qualification gate refuses the qualified probe: ${admission.failures.map((failure) => `${failure.code} (${failure.detail})`).join('; ')}`;
}

/**
 * The mutated workspace one mutation's witness legs run in: a workspace of its
 * own with the mutation applied, whose digest must equal the one the cycle
 * measured, and whose registry targets must launch.
 */
async function mutatedRoute({ entry, pristine, make, registry, engine, stop, log }) {
  const { mutation } = entry;
  const workspace = make(`mutated-${mutation.mutationId}`, pristine);
  let applied;
  try {
    applied = applyReplaceExact(workspace.root, mutation, { within: workspace.directory });
  } catch (error) {
    if (!(error instanceof QualificationError)) throw error;
    throw stop({ stage: 'qualification', exitCode: error.exitCode, message: error.message });
  }
  const digest = engine.digestBytes(fs.readFileSync(applied.file));
  if (digest !== entry.mutatedDigest) {
    throw stop({
      stage: 'launch',
      exitCode: 12,
      message: `the mutated workspace for ${mutation.mutationId} digests to ${digest}, not the ${entry.mutatedDigest} the qualification measured`,
    });
  }
  const targetProblems = registry.targetProblems(workspace.root);
  if (targetProblems.length > 0) {
    throw stop({
      stage: 'launch',
      exitCode: 12,
      message: `the registry cannot launch in the mutated workspace: ${targetProblems.join('; ')}`,
    });
  }
  const { port } = await registry.createProbePort({ cwd: workspace.root, projectRoot: workspace.root });
  log(`mutated workspace for ${mutation.mutationId}: ${workspace.root}`);
  return { label: `mutated:${mutation.mutationId}`, cwd: workspace.root, port };
}

/**
 * One seeded probe through AD-8's six steps in its own qualification
 * workspace, its evidence written as far as the cycle got, and the qualified
 * probe built,
 * validated against eval-quality's probe schema and admitted by its
 * qualification gate. Throws a `RunStop` with the cycle's exit when a step
 * fails.
 */
async function qualifySeededProbe({
  folder,
  evaluation,
  contract,
  file,
  probe,
  pristine,
  workspace,
  registry,
  policy,
  engine,
  validate,
  runDirectory,
  stop,
  log,
  signal,
}) {
  const mutationId = probe.qualification.mutation;
  const mutation = readJson(path.join(folder, 'mutations', `${mutationId}.mutation.json`));
  const behaviorIds = [probe.behaviorId, ...probe.defects.map((defect) => defect.behaviorId)];
  const oracleIds = oraclesOfBehaviors(contract, behaviorIds);
  if (oracleIds.length === 0) {
    throw stop({
      stage: 'qualification',
      exitCode: 10,
      message: `${file}: the behaviors it discharges (${[...new Set(behaviorIds)].join(', ')}) declare no oracle, so no arm can pass or fail`,
    });
  }
  const implementationRoot = path.join(pristine.root, ...(evaluation.launch.skillRoot ?? '.').split('/'));
  if (!fs.existsSync(implementationRoot) || !fs.statSync(implementationRoot).isDirectory()) {
    throw stop({
      stage: 'launch',
      exitCode: 12,
      message: `launch.skillRoot ${evaluation.launch.skillRoot} is not a directory in the workspace, so there is no implementation to evaluate`,
    });
  }
  const implementationDigest = treeDigest(implementationRoot, { exclude: [...pristine.provisioned, path.join(pristine.top, '.git')] });
  const commitDigest = pristine.kind === 'git-worktree' ? engine.digestBytes(Buffer.from(pristine.commit, 'utf8')) : pristine.treeDigest;
  const directory = path.join(runDirectory, 'qualification', probe.probeId);
  log(`${file}: qualifying through ${mutationId} in ${workspace.root}`);
  const { port: adapter } = await registry.createProbePort({ cwd: workspace.root, projectRoot: workspace.root });
  const armPort = hostEnvironmentPort({ port: adapter, registry });
  const runArmFor = async (phase) => {
    let arm;
    try {
      arm = await runArm({ contract, port: armPort, registry, label: phase, signal });
    } catch (error) {
      // A request the registry refuses is an authoring defect, as a refused leg is.
      if (error?.code === DENIAL_FAULT) error.exitCode = 10;
      throw error;
    }
    const oracles = await evaluateOracles({
      contract,
      stepObservations: arm.stepObservations,
      oracleIds,
      regexMatchStepBudget: policy.regexMatchStepBudget,
    });
    return { phase, verdict: armVerdict(oracles), oracles, steps: arm.steps };
  };
  let evidence;
  try {
    evidence = await runMutationCycle({
      root: workspace.root,
      within: workspace.directory,
      mutation,
      runArm: runArmFor,
      reExecutionCap: policy.reExecutionCap,
      digestBytes: engine.digestBytes,
      log,
    });
  } catch (error) {
    if (error instanceof QualificationError) {
      if (error.evidence !== null) {
        writeQualificationEvidence(directory, { probe, evidence: error.evidence, workspace: workspace.label, fault: error.fault ?? null });
      }
      throw stop({ stage: 'qualification', exitCode: error.exitCode, message: `${file}: ${error.message}` });
    }
    throw error;
  }
  const files = writeQualificationEvidence(directory, { probe, evidence, workspace: workspace.label });
  const candidate = qualifiedProbe({
    probe,
    mutation,
    systemId: evaluation.evaluationId,
    digests: { implementationDigest, commitDigest, artifactDigest: evidence.preDigest },
    baselinePassEvidence: referenceTo(folder, files['baseline-pass'], engine.digestBytes),
    mutatedFailEvidence: referenceTo(folder, files['mutated-fail'], engine.digestBytes),
    rollbackVerified: evidence.rollbackVerified,
  });
  const refusal = await admissionRefusal({ candidate, contract, engine, validate });
  if (refusal !== null) throw stop({ stage: 'qualification', exitCode: 10, message: `${file}: ${refusal}` });
  log(`${file}: qualified; the restored digest matched and the baseline passed again`);
  return { probe: candidate, mutation, mutatedDigest: evidence.mutatedDigest };
}

module.exports = { PreflightOutcome, admissionRefusal, armVerdict, newInvocationId, recordingPort, runPreflightCommand };
