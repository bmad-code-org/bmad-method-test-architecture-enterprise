/**
 * `tea-evaluate preflight`: qualify an evaluation's seeded probes in a
 * disposable workspace, drive its preflight legs against the real target, and
 * take the verdict from the eval-quality CLI (AD-6, AD-8).
 *
 * The steps, each stopping the run with its own exit when it fails:
 *
 *   1. `check` over the folder (exit 10 on any authoring defect);
 *   2. the evaluation is one this release can run: every probe that seeds a
 *      defect on the `controlled-mutation` or `historical` route (exit 12
 *      otherwise, before anything runs), and, when the registry declares an
 *      HTTP target, the evaluation's own HTTP port, started once from
 *      `adapter/http-probe-port.mjs` and asked for the protocol it speaks
 *      (`http-target.js`; exit 10 when it is absent or does not start TeA's
 *      host, 12 when its process cannot start or answer in time), with every
 *      auth header's value set on the host (exit 10 otherwise);
 *   3. the pristine workspace (`workspace.js`: a detached worktree at the
 *      evaluated commit, or a temp copy), every registry target present and
 *      executable in it, and `runs/<invocationId>/run.json` recording what was
 *      evaluated (exit 12 when the workspace cannot be made);
 *   4. `eval-quality compile` and `eval-quality seal` over the run's copy of
 *      `contract.json` (a documented non-zero exit passes through);
 *   5. each seeded probe qualified: a controlled mutation through AD-8's six
 *      steps (`mutation.js`) in a workspace of its own (`qualify-<probeId>`,
 *      reproducing the pristine one and removed after its cycle), a
 *      historical probe across its fix boundary (`historical.js`: failing in
 *      a worktree at the fix commit's parent and passing in one at the fix
 *      commit, or, on the deployment route, failing against the pre-fix
 *      deployment and passing against the post-fix one), each arm run by the
 *      single-trial arm executor (`arm.js`) and
 *      judged by the deterministic evaluator (`evaluator.js`); the evidence
 *      is written under `runs/<invocationId>/qualification/<probeId>/` as far
 *      as the qualification got, and a step that fails exits 10, 11 or 12
 *      with no qualified probe written. A historical probe with no revisions
 *      to address, or naming a deployment the registry's HTTP policy does not
 *      authorize, is refused with its reason (`run.json`'s `refused` and
 *      `refused/<probeId>.json`) and left out of everything after, which does
 *      not fail the run;
 *   6. the adopter's project read again and compared with its reading before
 *      the workspaces were made (exit 12 on any change);
 *   7. one mutated workspace per mutation, reproducing the pristine one, its
 *      mutation applied and its digest held to the one the cycle measured,
 *      one worktree per pre-fix revision a historical probe names, and one
 *      port per pre-fix deployment (two probes naming one historical arm
 *      label at two targets exit 10);
 *   8. the legs, planned and driven by eval-quality's `runPreflight` through a
 *      recording port: a leg a defect's manifestation witness names runs in
 *      that defect's mutated workspace (or, on the historical route, its
 *      pre-fix worktree or its pre-fix deployment), every other leg in the
 *      pristine one,
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
 * `tea-evaluate run` shares this pipeline (`runPipeline`): it refuses what it
 * cannot score before any workspace is made, and carries on past a verdict
 * that passed while every workspace is still live (`run.js`).
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

const { admissionRefusal, armVerdict, referenceTo } = require('./admission');
const { causeNote, faultRecord, hostEnvironmentPort, persistableRequest, reasonNote, runArm } = require('./arm');
const { TEA_MANIFEST, checkEvaluation } = require('./check');
const { MANIFEST_NAME } = require('./folder');
const { engineVersion, loadEngine } = require('./engine');
const { runEngineStage } = require('./engine-cli');
const { evaluateOracles, oraclesOfBehaviors } = require('./evaluator');
const { degenerateResponsePath, qualifyGameabilityProbes } = require('./gameability');
const {
  deploymentPair,
  deploymentRoute,
  historicalRevisions,
  historicalRoute,
  qualifyDeploymentProbe,
  qualifyHistoricalProbe,
  routeIdentity,
} = require('./historical');
const { QualificationError, applyReplaceExact, qualifiedProbe, runMutationCycle } = require('./mutation');
const { createArtifactValidator } = require('./records');
const { HttpPortError, isApiEntry, missingCredentials, probeHttpPort } = require('./http-target');
const { registryFromEvaluation } = require('./registry');
const { RunDirectory, RunDirectoryError } = require('./run-directory');
const {
  WorkspaceRefusal,
  adopterTreeState,
  cleanUpOnSignal,
  createWorkspace,
  joinAsSpelled,
  makeScratchDirectory,
  realPathLoosely,
  releaseScratchDirectory,
  removeScratchDirectory,
  removeWorkspace,
  trackedTreeDigest,
  treeDigest,
} = require('./workspace');

const CONTRACT_NAME = 'contract.json';
const POLICY_PATH = 'policy/scoring-policy.json';
const PROBE_FILE = /\.probe\.json$/;
/** The routes a seeded probe qualifies on; `run` also materializes clean controls and gameability probes. */
const QUALIFIED_ROUTES = ['controlled-mutation', 'historical'];

/** The eval-quality fault the command-line and MCP adapters throw when their policy refuses a request. */
const DENIAL_FAULT = 'forbidden-target';

/** The errors `runPreflight` raises while planning, before any leg reaches the port; the CLI raises the same over the same files. */
const PLANNING_FAULTS = new Set(['schema-parse-failure', 'schema-version-mismatch']);

/** The result of one `tea-evaluate preflight`. */
class PreflightOutcome {
  /**
   * @param {object} fields
   * @param {'check'|'launch'|'engine'|'qualification'|'leg'|'verdict'|'trial'|'run-directory'} fields.stage where the run stopped
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

/**
 * Every committed gameability probe, sorted by file name, parsed, each with
 * its degenerate response's bytes and steps, read before anything runs.
 */
function gameabilityProbes(folder) {
  const directory = path.join(folder, 'probes');
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((name) => PROBE_FILE.test(name))
    .sort()
    .map((name) => ({ file: `probes/${name}`, probe: readJson(path.join(directory, name)) }))
    .filter(({ probe }) => probe.qualification?.route === 'gameability')
    .map((entry) => {
      const bytes = fs.readFileSync(path.join(folder, ...degenerateResponsePath(entry.probe.probeId).split('/')));
      return { ...entry, bytes, steps: JSON.parse(bytes.toString('utf8')).steps };
    });
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
 * @param {RunDirectory} options.writer the run directory, which holds `observations/` and `faults/`
 * @returns {{ port: {probe: Function}, observations: object[], calls: () => number, fault: () => object|null }}
 */
function recordingPort({ pristine, routes = new Map(), registry, writer }) {
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
      writer.writeJson(`observations/${legFileName(legSequence, request.probeId)}`, {
        legId: request.probeId,
        sequence: legSequence,
        workspace: route.label,
        cwd: route.cwd,
        ...(route.deployment ? { origins: route.deployment.origins } : {}),
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
        ...(route.deployment ? { origins: route.deployment.origins } : {}),
        ...faultRecord(error),
        request: persistableRequest(error?.request ?? request),
      };
      writer.writeJson(`faults/${legFileName(legSequence, fault.legId)}`, fault);
      throw error;
    }
  };
  return { port: { probe }, observations, calls: () => sequence, fault: () => fault };
}

/**
 * Whether the adopter's git status (read before the workspaces were made)
 * names any path under the evaluation folder: an edit, a deletion or an
 * untracked file. Outside git there is no committed state to differ from.
 */
function uncommittedUnder(before, folder) {
  if (before.repository === null) return false;
  const relative = path.relative(before.repository, folder).split(path.sep).join('/');
  if (relative.startsWith('..')) return false;
  const prefix = relative === '' ? '' : `${relative}/`;
  const records = before.status.split('\u0000').filter((record) => record.length > 0);
  const paths = [];
  for (let index = 0; index < records.length; index += 1) {
    paths.push(records[index].slice(3));
    // A rename or copy names its source in the record after it, with no status of its own.
    if (/^[RC]/.test(records[index]) && index + 1 < records.length) {
      index += 1;
      paths.push(records[index]);
    }
  }
  return paths.some((relativePath) => relativePath.startsWith(prefix));
}

/**
 * `runs/`, created with a `.gitignore` that ignores everything in it, so no
 * run lands in the adopter's commits (AD-12). `runs/` must be a directory of
 * its own and its `.gitignore` a file, never a link a target left there,
 * since every run is written below it.
 */
function ensureRunsDirectory(folder) {
  const runs = path.join(folder, 'runs');
  try {
    fs.mkdirSync(runs);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  if (!fs.lstatSync(runs).isDirectory()) throw new RunDirectoryError(`${runs} is not a directory, so no run can be written below it`);
  const ignore = path.join(runs, '.gitignore');
  let descriptor = null;
  try {
    descriptor = fs.openSync(
      ignore,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0),
      0o644,
    );
    fs.writeSync(descriptor, '*\n');
  } catch (error) {
    if (error.code !== 'EEXIST' && error.code !== 'ELOOP') throw error;
    if (!fs.lstatSync(ignore).isFile())
      throw new RunDirectoryError(`${ignore} is not a file, so runs/ is not kept out of the adopter's commits`);
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
  }
  return runs;
}

/**
 * Writes one probe's qualification evidence as far as the cycle got: each arm
 * that ran and the rollback record. Returns the files written, by name.
 */
function writeQualificationEvidence(writer, directory, { probe, evidence, workspace, fault = null }) {
  const files = {};
  if (fault !== null) {
    files.fault = `${directory}/fault.json`;
    writer.writeJson(files.fault, { probeId: probe.probeId, mutationId: evidence.mutationId, ...fault });
  }
  const arm = (name, result, digestField) => {
    if (result === null) return;
    files[name] = `${directory}/${name}.json`;
    writer.writeJson(files[name], {
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
  files.rollback = `${directory}/rollback.json`;
  writer.writeJson(files.rollback, {
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
function runPreflightCommand(folder, options = {}) {
  return runPipeline(folder, { ...options, command: 'preflight' });
}

/**
 * The preflight pipeline, which `tea-evaluate run` continues past the verdict.
 *
 * `prepare` sees the checked evaluation before any workspace is made and may
 * stop the command with an outcome. `afterVerdict` runs once the CLI's
 * verdict exits 0, while every workspace is still live, and its outcome is
 * the command's; a verdict that does not pass ends the command there. A
 * private directory it makes for a process it starts goes into its `scratch`
 * (`workspace.js` `makeScratchDirectory`), which the command removes however it
 * ends, an interrupting signal included.
 *
 * `afterVerdict` also receives the run directory's `writer` and the digests
 * of the compiled contract and the sealed brief, taken when the stages wrote
 * them; it calls `markSealed()` once it has written and verified its last file, and
 * lists in `retractUnlessSealed` the files a run that does not seal removes.
 *
 * @param {string} folder
 * @param {object} options
 * @param {'preflight'|'run'} options.command recorded in `run.json`
 * @param {boolean} [options.fromWorkingTree]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {(line: string) => void} [options.log]
 * @param {(context: object) => PreflightOutcome|null|Promise<PreflightOutcome|null>} [options.prepare]
 * @param {(context: object) => Promise<PreflightOutcome>} [options.afterVerdict]
 * @returns {Promise<PreflightOutcome>}
 */
async function runPipeline(folder, options) {
  // The invocation's run directory and run.json, held in memory, so its end is
  // recorded from what the runtime knows, never from a file read back.
  const state = { writer: null, run: null, sealed: false, retractUnlessSealed: [] };
  try {
    return await recordEnd(await pipeline(folder, options, state), state);
  } finally {
    // The directories the run made stay held open until here, so none of
    // their inode numbers can pass to a directory the target makes.
    state.writer?.close();
  }
}

/** Records how the invocation ended in run.json, unless the run sealed its trial sets and recorded its own end. */
function recordEnd(outcome, state) {
  // run.json says how the invocation ended, so a reader of the run directory
  // (and `tea-evaluate score`) can tell a run that stopped from one that is
  // complete, and why. A run that sealed its trial sets recorded its own end.
  if (state.run !== null && !state.sealed) {
    state.run.outcome = { stage: outcome.stage, exitCode: outcome.exitCode, message: outcome.message };
    if (state.run.command === 'run') state.run.completed = false;
    // Each step is tried on its own, and one the runtime cannot take is named
    // in the outcome, so nobody reads the run directory as this end recorded.
    const failed = [];
    for (const [what, step] of [
      ...state.retractUnlessSealed.map((file) => [`remove ${file}`, () => state.writer.remove(file)]),
      ['record this end in run.json', () => state.writer.replaceJson('run.json', state.run)],
    ]) {
      try {
        step();
      } catch (error) {
        if (!(error instanceof RunDirectoryError)) throw error;
        failed.push(`could not ${what}: ${error.message}`);
      }
    }
    if (failed.length > 0) {
      return new PreflightOutcome({
        ...outcome,
        message: `${outcome.message}\nthe run directory does not record this end, since the runtime ${failed.join('; and ')}`,
      });
    }
  }
  return outcome;
}

async function pipeline(
  folder,
  { command, fromWorkingTree = false, env = process.env, log = () => {}, prepare = () => null, afterVerdict = null },
  state,
) {
  const findings = await checkEvaluation(folder);
  if (findings.length > 0) {
    return new PreflightOutcome({ stage: 'check', exitCode: 10, message: `${findings.length} authoring defect(s)`, findings });
  }

  const evaluation = readJson(path.join(folder, MANIFEST_NAME));
  const seeded = seededProbes(folder);
  const unqualifiable = seeded.filter(({ probe }) => !QUALIFIED_ROUTES.includes(probe.qualification?.route));
  if (unqualifiable.length > 0) {
    return new PreflightOutcome({
      stage: 'launch',
      exitCode: 12,
      message: `${unqualifiable.map(({ file, probe }) => `${file} (route ${probe.qualification?.route})`).join(', ')} seed a defect on a route this release does not qualify; it qualifies seeded probes on the ${QUALIFIED_ROUTES.join(' and ')} routes only, so a retry cannot pass`,
    });
  }
  // The evaluation's HTTP port, asked for its protocol once, before any workspace is made, so a port that does not serve
  // stops the run as an authoring defect (a port that could not run at all, as infrastructure) with nothing started; and
  // every auth header's value present, since a call with none would read its refusal as the target's behavior.
  let httpPort;
  if ((evaluation.registry ?? []).some(isApiEntry)) {
    const missing = missingCredentials(evaluation.registry);
    if (missing.length > 0) return new PreflightOutcome({ stage: 'check', exitCode: 10, message: missing.join('; ') });
    try {
      httpPort = await probeHttpPort(folder);
    } catch (error) {
      if (!(error instanceof HttpPortError)) throw error;
      return new PreflightOutcome({ stage: error.exitCode === 12 ? 'launch' : 'check', exitCode: error.exitCode, message: error.message });
    }
  }
  const workspaces = [];
  const controller = new AbortController();
  // Run-directory files an interrupting signal removes (the CLI's probe list
  // until its verdict), and the private directories the command makes for
  // the processes it starts (engine stages, an evaluator, a judge, the
  // bridge), which are removed however it ends.
  const retractOnSignal = [];
  const scratch = [];
  // Each directory is tried on its own, write bits restored first, and one that cannot be removed is reported,
  // so no failure here keeps the workspaces from being removed after it.
  const removeScratch = () => {
    for (const directory of scratch.splice(0)) {
      try {
        removeScratchDirectory(directory);
      } catch (error) {
        scratch.push(directory);
        log(`could not remove the private directory ${directory}: ${error.message}`);
      }
    }
  };
  const onSignal = (name) => {
    removeScratch();
    if (state.writer === null || state.sealed) return;
    try {
      for (const file of [...retractOnSignal, ...state.retractUnlessSealed]) state.writer.remove(file);
      state.run.outcome = { stage: 'signal', exitCode: null, signal: name, message: `stopped by ${name} before it finished` };
      if (state.run.command === 'run') state.run.completed = false;
      state.writer.replaceJson('run.json', state.run);
    } catch {
      // The signal still ends the process; run.json keeps its last state.
    }
  };
  const release = cleanUpOnSignal(workspaces, controller, { onSignal });
  try {
    const refused = await prepare({ folder, evaluation, seeded });
    const gameability = gameabilityProbes(folder);
    if (refused !== null) return refused;

    const root = realPathLoosely(joinAsSpelled(folder, evaluation.launch.root));
    const runsDirectory = ensureRunsDirectory(folder);
    const readTree = () => adopterTreeState(root, { exclude: [runsDirectory] });
    const before = readTree();
    // Every workspace after the first reproduces it, so the run evaluates one
    // set of bytes whatever changes in the project meanwhile.
    const make = (label, basis = null, { commit = null } = {}) => {
      const workspace = createWorkspace({
        root,
        kind: evaluation.workspace.kind,
        provision: evaluation.workspace.provision,
        exclude: [folder],
        fromWorkingTree,
        label,
        basis,
        commit,
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
    // The evaluation folder is read from the working tree (the workspaces
    // leave it out), so uncommitted work in it reaches the run, which is then
    // dirty: no committed state names what it measured.
    const evaluationDirty = uncommittedUnder(before, folder);
    if (pristine.kind === 'git-worktree' && before.status.length > 0) {
      log(
        evaluationDirty
          ? 'the evaluation folder has uncommitted changes, which this run reads, so it is recorded as dirty; the rest of the working tree is evaluated as committed'
          : 'the working tree has uncommitted changes, which this run does not evaluate; pass --from-working-tree to evaluate them',
      );
    }
    return await runInWorkspaces({
      command,
      httpPort,
      evaluationDirty,
      afterVerdict,
      folder,
      root,
      evaluation,
      seeded,
      gameability,
      pristine,
      make,
      discard,
      before,
      readTree,
      runsDirectory,
      retractOnSignal,
      scratch,
      state,
      env,
      log,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof RunStop) return error.outcome;
    if (error instanceof WorkspaceRefusal) return new PreflightOutcome({ stage: 'launch', exitCode: 12, message: error.message });
    if (error instanceof RunDirectoryError) {
      return new PreflightOutcome({
        stage: 'run-directory',
        exitCode: 12,
        message: error.message,
        runDirectory: state.writer?.root ?? null,
      });
    }
    throw error;
  } finally {
    release();
    removeScratch();
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
  command,
  httpPort,
  evaluationDirty,
  afterVerdict,
  folder,
  root,
  evaluation,
  seeded,
  gameability,
  pristine,
  make,
  discard,
  before,
  readTree,
  runsDirectory,
  retractOnSignal,
  scratch,
  state,
  env,
  log,
  signal,
}) {
  const registry = registryFromEvaluation(evaluation, { root: pristine.root, httpPort, scratch });
  const problems = registry.targetProblems(pristine.root);
  if (problems.length > 0) {
    return new PreflightOutcome({ stage: 'launch', exitCode: 12, message: `the registry cannot launch: ${problems.join('; ')}` });
  }

  const invocationId = newInvocationId();
  // Every file below is written through the run directory's writer, which
  // refuses an entry it did not make and holds the digest of every file it
  // wrote (`run-directory.js`): a target can reach runs/ and plant a link there.
  const writer = RunDirectory.create(runsDirectory, invocationId);
  const runDirectory = writer.root;
  state.writer = writer;
  log(`run ${invocationId}: ${runDirectory}`);
  const outcome = (fields) => new PreflightOutcome({ runDirectory, ...fields });
  const stop = (fields) => new RunStop(outcome(fields));
  const run = {
    invocationId,
    command,
    teaVersion: TEA_MANIFEST.version,
    evalQualityVersion: engineVersion(),
    commit: pristine.commit,
    dirty: pristine.dirty || evaluationDirty,
    evaluationFolder: { dirty: evaluationDirty },
    workspace: {
      kind: pristine.kind,
      commit: pristine.commit,
      tree: pristine.tree,
      treeDigest: pristine.treeDigest,
      dirty: pristine.dirty,
    },
    workspaces: { pristine: pristine.root },
    adopterTree: { repository: before.repository, unchanged: null },
    refused: [],
  };
  state.run = run;
  const writeRun = () => writer.replaceJson('run.json', run);
  writeRun();

  // The run keeps its own copy of the contract, so every stage below reads the
  // same bytes and the verdict can be reproduced from the run directory alone.
  const contractBytes = fs.readFileSync(path.join(folder, CONTRACT_NAME));
  const contractPath = writer.write(CONTRACT_NAME, contractBytes);
  const contract = JSON.parse(contractBytes.toString('utf8'));

  // An engine stage writes its output into a private directory made for the
  // call, which no target has seen, and the runtime copies it into the run
  // directory through its writer, which holds the digest of what it wrote.
  const engineStage = (stage, args, output) => {
    const staging = makeScratchDirectory(scratch, 'tea-evaluate-engine-');
    try {
      const produced = path.join(staging, output);
      const result = runEngineStage(stage, [...args, '--out', produced], { runDirectory, writer, env, log });
      if (fs.existsSync(produced)) writer.copyIn(output, produced);
      return result;
    } finally {
      releaseScratchDirectory(scratch, staging);
    }
  };

  for (const [stage, output] of [
    ['compile', 'eval-contract.json'],
    ['seal', 'sealed-evaluator-brief.json'],
  ]) {
    const result = engineStage(stage, ['--in', contractPath], output);
    if (result.exitCode !== 0) {
      return outcome({
        stage: 'engine',
        exitCode: result.exitCode,
        message: `eval-quality ${stage} exited ${result.exitCode}\n${result.stderr}`,
      });
    }
  }

  const engine = await loadEngine();
  // The compiled contract and the sealed brief as the stages wrote them, read
  // before any target runs, so their digests never come from bytes a target
  // could have rewritten. A substituted engine CLI may write neither.
  let sealed = null;
  if (writer.has('eval-contract.json') && writer.has('sealed-evaluator-brief.json')) {
    const compiledContract = writer.readJson('eval-contract.json');
    const sealedBrief = writer.readJson('sealed-evaluator-brief.json');
    sealed = {
      contractDigest: engine.digestArtifact(compiledContract, 'EvalContract'),
      sealedBriefDigest: engine.digestArtifact(sealedBrief, 'SealedEvaluatorBrief'),
    };
  }
  const { port: pristineAdapter } = await registry.createProbePort({ cwd: pristine.root, projectRoot: pristine.root });
  // The adopter's tree, read again after the qualification and after the
  // legs: a change stops the run with no qualified probe written (AD-8).
  const treeUnchanged = (when, { record = true } = {}) => {
    const unchanged = JSON.stringify(readTree()) === JSON.stringify(before);
    run.adopterTree.unchanged = unchanged;
    if (record || !unchanged) writeRun();
    if (!unchanged) {
      throw stop({
        stage: { qualification: 'qualification', legs: 'leg', trials: 'trial', sealing: 'trial' }[when],
        exitCode: 12,
        message: `the adopter's ${before.repository === null ? 'project (launch.root)' : `tree at ${before.repository} (its git status, file contents or shared git state)`} changed during the ${when === 'sealing' ? 'sealing of the trial sets' : when}, so ${when === 'trials' || when === 'sealing' ? 'no trial set is written' : 'no rollback is proved and no qualified probe is written'}; if you edited files meanwhile, run again`,
      });
    }
  };

  const qualified = [];
  const policyPath = path.join(folder, POLICY_PATH);
  const policy = fs.existsSync(policyPath) ? readJson(policyPath) : null;
  const validate = createArtifactValidator();
  const digests =
    seeded.length > 0 || gameability.length > 0 || afterVerdict !== null
      ? attestedDigests({ folder, root, evaluation, pristine, engine, stop })
      : null;
  if (seeded.length > 0) {
    for (const { file, probe } of seeded) {
      if (probe.qualification.route === 'historical') {
        // A refused probe runs nowhere; the rest of the run goes on without it (AD-8).
        const refuse = (reason) => {
          const refusal = { probeId: probe.probeId, file, route: 'historical', reason };
          run.refused.push(refusal);
          writer.writeJson(`refused/${probe.probeId}.json`, refusal);
          writeRun();
          log(`${file}: refused: ${reason}`);
        };
        // A probe naming no fixCommit takes the deployment route, where one naming neither boundary is unaddressable.
        if (probe.qualification.deployments !== undefined || probe.qualification.fixCommit === undefined) {
          const deployments = deploymentPair(
            probe.qualification,
            (evaluation.registry ?? []).filter(isApiEntry).map((entry) => entry.interfaceId),
          );
          if (deployments.unaddressable !== undefined) {
            return outcome({
              stage: 'qualification',
              exitCode: 12,
              message: `${file}: the runtime cannot address its deployments: ${deployments.unaddressable}`,
            });
          }
          const historical = await qualifyDeploymentProbe({
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
          });
          if (historical.refused === undefined) qualified.push(historical);
          else refuse(historical.refused);
          continue;
        }
        const revisions = historicalRevisions({ pristine, fixCommit: probe.qualification.fixCommit });
        if (revisions.defect !== undefined) {
          return outcome({ stage: 'check', exitCode: 10, message: `${file}: ${revisions.defect}` });
        }
        if (revisions.refused !== undefined) {
          refuse(revisions.refused);
          continue;
        }
        const historical = await qualifyHistoricalProbe({
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
        });
        if (historical.refused === undefined) qualified.push(historical);
        else refuse(historical.refused);
        continue;
      }
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
            workspace,
            registry,
            policy,
            engine,
            validate,
            digests,
            writer,
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
  // Each gameability probe qualified over its degenerate response, launching nothing, so
  // preflight and run both refuse one that does not game its naive oracle (exit 11).
  const gameabilityQualified = await qualifyGameabilityProbes({
    folder,
    evaluation,
    contract,
    registry,
    gameability,
    policy,
    engine,
    validate,
    digests,
    writer,
    stop,
    log,
    signal,
  });

  // One mutated workspace per mutation, one pre-fix worktree per historical
  // revision, and one pre-fix deployment per release, for the legs their
  // witnesses name. A historical arm is keyed by its label, so two probes on
  // one label must name one route: a worktree and a deployment, or two sets
  // of pre-fix origins, under one label would run one arm at two targets.
  const routes = new Map();
  const mutatedByMutation = new Map();
  const historicalByRevision = new Map();
  for (const entry of qualified) {
    const [byKey, key] =
      entry.historical === undefined ? [mutatedByMutation, entry.mutation.mutationId] : [historicalByRevision, entry.historical.preFix];
    let route = byKey.get(key);
    // Labels that differ only in letter case name one trial directory on a case-insensitive file system.
    const sameLabel =
      entry.historical === undefined
        ? undefined
        : [...byKey.keys()].find((other) => other.toLowerCase() === key.toLowerCase() && other !== key);
    if (sameLabel !== undefined) {
      throw stop({
        stage: 'qualification',
        exitCode: 10,
        message: `${entry.probe.probeId} runs on the arm historical:${key}, which differs from the arm historical:${sameLabel} of another probe only in letter case, so their trials would share one directory where the file system ignores case; give one release another identifier`,
      });
    }
    if (route !== undefined && entry.historical !== undefined && route.identity !== routeIdentity(entry.historical)) {
      throw stop({
        stage: 'qualification',
        exitCode: 10,
        message: `${entry.probe.probeId} runs on the arm historical:${key} at ${routeIdentity(entry.historical)}, where another probe runs it at ${route.identity}; one arm runs one target, so give the deployment's release an identifier no other probe's pre-fix revision or deployment uses`,
      });
    }
    if (route === undefined) {
      if (entry.historical === undefined) route = await mutatedRoute({ entry, pristine, make, registry, engine, stop, log });
      else if (entry.historical.deployments === undefined) route = await historicalRoute({ preFix: key, make, registry, stop, log });
      else route = await deploymentRoute({ deployment: entry.historical.deployments.preFix, pristine, registry, log });
      if (entry.historical !== undefined) route.identity = routeIdentity(entry.historical);
      byKey.set(key, route);
      if (route.deployment === null || route.deployment === undefined) run.workspaces[route.label] = route.cwd;
      else {
        run.deployments ??= {};
        run.deployments[route.label] = { release: key, origins: route.deployment.origins };
      }
      writeRun();
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
  const probes = qualified.map((entry) => entry.probe);
  const probesPath = writer.writeJson('probes.json', probes);
  retractOnSignal.push('probes.json');
  let settled = false;
  try {
    const recorder = recordingPort({
      pristine: { label: 'pristine', cwd: pristine.root, port: pristineAdapter },
      routes,
      registry,
      writer,
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
      if (error instanceof RunDirectoryError) throw error;
      const fault = recorder.fault();
      if (fault !== null) {
        return outcome({
          stage: 'leg',
          exitCode: fault.code === DENIAL_FAULT ? 10 : 12,
          message: `leg ${fault.legId} ${fault.code === DENIAL_FAULT ? `was denied by the registry${reasonNote(fault)}` : 'could not run'}: ${fault.message}${causeNote(fault)}`,
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
    const observationsPath = writer.writeJson('observations.json', recorder.observations);
    treeUnchanged('legs');
    // The CLI reads the run directory next: it must hold what the runtime wrote, and nothing else.
    writer.verify('after the legs');

    verdict = engineStage(
      'preflight',
      ['--contract', contractPath, '--probes', probesPath, '--observations', observationsPath, '--run-id', invocationId],
      'preflight-verdict.json',
    );
    settled = true;
  } finally {
    if (!settled) writer.remove('probes.json');
  }
  for (const entry of [...qualified, ...gameabilityQualified]) writer.writeJson(`probes/${entry.probe.probeId}.probe.json`, entry.probe);
  if (afterVerdict === null || verdict.exitCode !== 0) {
    return outcome({
      stage: 'verdict',
      exitCode: verdict.exitCode,
      message: `eval-quality preflight exited ${verdict.exitCode}; its verdict and diagnostics are in ${path.relative(folder, runDirectory)}${afterVerdict === null ? '' : ', and no trial ran'}`,
    });
  }
  try {
    return await afterVerdict({
      folder,
      evaluation,
      contract,
      registry,
      pristine,
      make,
      discard,
      qualified,
      routesByMutation: mutatedByMutation,
      routesByRevision: historicalByRevision,
      gameability: gameabilityQualified,
      policy,
      engine,
      validate,
      digests,
      sealed,
      invocationId,
      runDirectory,
      writer,
      run,
      writeRun,
      treeUnchanged,
      retractUnlessSealed: state.retractUnlessSealed,
      markSealed: () => {
        state.sealed = true;
      },
      outcome,
      stop,
      log,
      signal,
      scratch,
      env,
    });
  } catch (error) {
    if (error instanceof RunStop) return error.outcome;
    throw error;
  }
}

/**
 * The digests AD-7 attests on every probe the run qualifies: `commitDigest`,
 * the evaluated commit (`digestBytes` over its id) or, for a copy, the
 * workspace's tree digest; and `implementationDigest`, the tracked tree of
 * `launch.skillRoot` (or `launch.root`) at that commit, the evaluation folder
 * left out (`trackedTreeDigest`), or for a copy the tree digest of the same
 * directory in the workspace without its provisioned directories.
 */
function attestedDigests({ folder, root, evaluation, pristine, engine, stop }) {
  const skillRoot = (evaluation.launch.skillRoot ?? '.').split('/');
  const implementationRoot = path.join(pristine.root, ...skillRoot);
  if (!fs.existsSync(implementationRoot) || !fs.statSync(implementationRoot).isDirectory()) {
    throw stop({
      stage: 'launch',
      exitCode: 12,
      message: `launch.skillRoot ${evaluation.launch.skillRoot} is not a directory in the workspace, so there is no implementation to evaluate`,
    });
  }
  if (pristine.kind === 'git-worktree') {
    return {
      commitDigest: engine.digestBytes(Buffer.from(pristine.commit, 'utf8')),
      implementationDigest: trackedTreeDigest({
        repository: pristine.repository,
        commit: pristine.commit,
        directory: path.join(root, ...skillRoot),
        exclude: [folder],
      }),
    };
  }
  return {
    commitDigest: pristine.treeDigest,
    implementationDigest: treeDigest(implementationRoot, { exclude: pristine.provisioned }),
  };
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
  workspace,
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
  const directory = `qualification/${probe.probeId}`;
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
        writeQualificationEvidence(writer, directory, {
          probe,
          evidence: error.evidence,
          workspace: workspace.label,
          fault: error.fault ?? null,
        });
      }
      throw stop({ stage: 'qualification', exitCode: error.exitCode, message: `${file}: ${error.message}` });
    }
    throw error;
  }
  const files = writeQualificationEvidence(writer, directory, { probe, evidence, workspace: workspace.label });
  const candidate = qualifiedProbe({
    probe,
    mutation,
    systemId: evaluation.evaluationId,
    digests: { ...digests, artifactDigest: evidence.preDigest },
    baselinePassEvidence: referenceTo(folder, writer, files['baseline-pass'], engine.digestBytes),
    mutatedFailEvidence: referenceTo(folder, writer, files['mutated-fail'], engine.digestBytes),
    rollbackVerified: evidence.rollbackVerified,
  });
  const refusal = await admissionRefusal({ candidate, contract, engine, validate });
  if (refusal !== null) throw stop({ stage: 'qualification', exitCode: 10, message: `${file}: ${refusal}` });
  log(`${file}: qualified; the restored digest matched and the baseline passed again`);
  return { probe: candidate, mutation, mutatedDigest: evidence.mutatedDigest };
}

module.exports = {
  PreflightOutcome,
  RunStop,
  admissionRefusal,
  armVerdict,
  ensureRunsDirectory,
  newInvocationId,
  readJson,
  recordingPort,
  referenceTo,
  runPipeline,
  runPreflightCommand,
  uncommittedUnder,
  writeJson,
};
