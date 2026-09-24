/**
 * `tea-evaluate preflight`: drive an evaluation's preflight legs against the
 * real target and take the verdict from the eval-quality CLI (AD-6).
 *
 * The steps, each stopping the run with its own exit when it fails:
 *
 *   1. `check` over the folder (exit 10 on any authoring defect);
 *   2. the target is launchable: a `cli` interface, no probe that seeds a
 *      defect, and every registry target present and executable in a
 *      disposable copy of `launch.root` (exit 12 otherwise; see below);
 *   3. `eval-quality compile` and `eval-quality seal` over the run's copy of
 *      `contract.json`, their outputs written into `runs/<invocationId>/` (a
 *      documented non-zero exit passes through);
 *   4. the legs, planned and driven by eval-quality's `runPreflight` through a
 *      recording port over the registry's command-line adapter in that copy,
 *      every observation written under `runs/<invocationId>/observations/` as
 *      it arrives; a leg the adapter refuses or cannot run is written under
 *      `runs/<invocationId>/faults/` and ends the run (exit 10 for a denial, 12
 *      otherwise);
 *   5. `eval-quality preflight --observations ... --run-id <invocationId>` over
 *      the persisted files, whose exit code is the command's exit code.
 *
 * `runPreflight` also returns a verdict. It is discarded: an enforced verdict
 * comes from the CLI over persisted files, so CI can reproduce it by hand, and
 * the run's `engine/preflight.json` records the call that produced it.
 *
 * Seeded probes: a manifestation witness's leg runs against the mutated copy
 * of its defect's mutation (AD-6), which Story 1.7 builds, so this release
 * refuses an evaluation holding a probe that seeds a defect. Every other
 * committed probe seeds none, and the preflight plan reads nothing from a probe
 * that seeds none, so the probe list the CLI receives is empty.
 *
 * The copy: the legs run in a temp copy of `launch.root` (without `.git` and
 * the evaluation's own `runs/`), and the copy is removed when the command ends,
 * on an interrupting signal included. A symbolic link in the copy points into
 * the copy, and a link out of `launch.root` is refused (exit 12), so a write
 * under the copied tree stays in the copy, and an artifact the adapter reads
 * back is one this run wrote. Each directory `workspace.provision` lists is
 * linked in from the target, writable: a leg that writes under a provisioned
 * directory writes into the target's own directory. Story 1.7 replaces the
 * copy with the pristine and mutated workspaces AD-8 describes, whose
 * provisioned links are read-only.
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { checkEvaluation } = require('./check');
const { MANIFEST_NAME } = require('./folder');
const { loadEngine } = require('./engine');
const { runEngineStage } = require('./engine-cli');
const { registryFromEvaluation } = require('./registry');

const CONTRACT_NAME = 'contract.json';
const PROBE_FILE = /\.probe\.json$/;

/** The eval-quality fault a command-line adapter throws when its policy refuses a request. */
const DENIAL_FAULT = 'forbidden-target';

/** The errors `runPreflight` raises while planning, before any leg reaches the port; the CLI raises the same over the same files. */
const PLANNING_FAULTS = new Set(['schema-parse-failure', 'schema-version-mismatch']);

/** An injected environment value shorter than this is not scrubbed from output: it would match ordinary text. */
const MIN_SCRUBBED_VALUE_LENGTH = 8;
const SCRUBBED = '[redacted]';

/** The result of one `tea-evaluate preflight`. */
class PreflightOutcome {
  /**
   * @param {object} fields
   * @param {'check'|'launch'|'engine'|'leg'|'verdict'} fields.stage where the run stopped
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

/** Every committed probe that seeds a defect, by file name. */
function seededProbeFiles(folder) {
  const directory = path.join(folder, 'probes');
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((name) => PROBE_FILE.test(name))
    .filter((name) => {
      const probe = readJson(path.join(directory, name));
      return Array.isArray(probe.defects) && probe.defects.length > 0;
    })
    .sort();
}

/** A leg's file name: its order in the run, then its identifier made safe for a path. */
function legFileName(sequence, legId) {
  return `${String(sequence).padStart(3, '0')}-${encodeURIComponent(String(legId))}.json`;
}

/**
 * The request as it may be written to disk: environment values are replaced by
 * their keys, since a request carries the host's credentials.
 */
function persistableRequest(request) {
  return { ...request, channels: { ...request.channels, environment: Object.keys(request.channels?.environment ?? {}).sort() } };
}

/** `value` with every string in `secrets` replaced, walking arrays and objects. */
function scrub(value, secrets) {
  if (typeof value === 'string') return secrets.reduce((text, secret) => text.split(secret).join(SCRUBBED), value);
  if (Array.isArray(value)) return value.map((item) => scrub(item, secrets));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrub(item, secrets)]));
  }
  return value;
}

/**
 * An environment-probe port that records every leg.
 *
 * Each request gains the host's values for the environment keys its registry
 * entry permits, beneath the ones the leg declares, since a leg's command reads
 * its credentials from the environment and the command-line adapter hands the
 * child nothing but PATH and what the request carries. A request for a pair the
 * registry does not name goes to the adapter unchanged, so the adapter's own
 * policy refuses it. A request is recorded with its environment as keys only,
 * and every injected value is scrubbed from the observation before it is
 * written or returned, since a credential is never evidence.
 *
 * @returns {{ port: {probe: Function}, observations: object[], calls: () => number, fault: () => object|null }}
 */
function recordingPort({ port, registry, runDirectory }) {
  const observations = [];
  let sequence = 0;
  let fault = null;
  const probe = async (request, signal) => {
    sequence += 1;
    const legSequence = sequence;
    let augmented = request;
    try {
      const registered = request?.kind === 'cli' && registry.targetFor(request.interfaceId, request.executable) !== undefined;
      const injected = registered ? registry.hostEnvironment(request.interfaceId, [], request.executable) : {};
      augmented = registered
        ? { ...request, channels: { ...request.channels, environment: { ...injected, ...request.channels.environment } } }
        : request;
      const secrets = Object.values(injected)
        .filter((value) => value.length >= MIN_SCRUBBED_VALUE_LENGTH)
        .sort((a, b) => b.length - a.length);
      const observation = scrub(await port.probe(augmented, signal), secrets);
      writeJson(path.join(runDirectory, 'observations', legFileName(legSequence, request.probeId)), {
        legId: request.probeId,
        sequence: legSequence,
        request: persistableRequest(augmented),
        observation,
      });
      observations.push(observation);
      return observation;
    } catch (error) {
      fault = {
        legId: request?.probeId ?? null,
        sequence: legSequence,
        code: typeof error?.code === 'string' ? error.code : null,
        message: String(error?.message ?? error),
        request: persistableRequest(augmented),
      };
      writeJson(path.join(runDirectory, 'faults', legFileName(legSequence, fault.legId)), fault);
      throw error;
    }
  };
  return { port: { probe }, observations, calls: () => sequence, fault: () => fault };
}

/** A target root the legs cannot run in a faithful, contained copy of; `preflight` refuses it with exit 12. */
class CopyRefusal extends Error {
  constructor(message) {
    super(message);
    this.name = 'CopyRefusal';
  }
}

/** Whether `candidate` is `root` or a path inside it. */
function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/** The real path of `candidate`, whose missing tail (a dangling link's target) is joined to the real path of the part that exists. */
function realPathLoosely(candidate) {
  const missing = [];
  let existing = candidate;
  for (;;) {
    try {
      return path.join(fs.realpathSync(existing), ...missing);
    } catch {
      const parent = path.dirname(existing);
      if (parent === existing) return candidate;
      missing.unshift(path.basename(existing));
      existing = parent;
    }
  }
}

/** Every symbolic link under `directory`, without following one. */
function symbolicLinksUnder(directory) {
  const links = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) links.push(full);
    else if (entry.isDirectory()) links.push(...symbolicLinksUnder(full));
  }
  return links;
}

/**
 * Points every symbolic link the copy holds at the copy.
 *
 * A link is copied verbatim, then resolved against the target tree it came
 * from: a link whose target lies inside `launch.root` is rewritten as a
 * relative link to the same place in the copy, so a write through it lands in
 * the copy; a link whose target lies outside `launch.root` is refused, since a
 * leg writing through it would write into the adopter's files.
 */
function containLinks(root, copy) {
  for (const link of symbolicLinksUnder(copy)) {
    const relative = path.relative(copy, link);
    const source = path.join(root, relative);
    const target = realPathLoosely(path.resolve(path.dirname(source), fs.readlinkSync(source)));
    if (!isInside(root, target)) {
      throw new CopyRefusal(
        `${relative.split(path.sep).join('/')} in launch.root is a symbolic link to ${target}, outside launch.root; a leg writing through it would write outside the disposable copy, so provision its directory or remove the link`,
      );
    }
    const contained = path.relative(path.dirname(link), path.join(copy, path.relative(root, target))) || '.';
    if (fs.readlinkSync(link) === contained) continue;
    const kind = fs.existsSync(target) && fs.statSync(target).isDirectory() ? 'dir' : 'file';
    fs.unlinkSync(link);
    fs.symlinkSync(contained, link, kind);
  }
}

/**
 * A temp copy of the target root for the legs to run in: everything but `.git`,
 * the provisioned directories (linked in from the target instead) and the
 * evaluation's own `runs/`, with every symbolic link pointing into the copy.
 *
 * Refused with a `CopyRefusal`: a root that is not a directory, a temp
 * directory inside the root (the copy would copy itself), an entry that is
 * neither a file, a directory nor a link (a FIFO, a socket, a device), and a
 * link out of the root. A copy that fails part way is removed before the error
 * leaves this function.
 *
 * @param {object} options
 * @param {string} options.root the target root, by its real path
 * @param {string[]} options.provision `workspace.provision`
 * @param {string} options.runsDirectory the evaluation's `runs/`, by its real path
 * @returns {{ directory: string, root: string }} the temp directory to remove, and the copy's root
 */
function stageCopy({ root, provision, runsDirectory }) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new CopyRefusal(`launch.root ${root} is not a directory`);
  }
  const temp = fs.realpathSync(os.tmpdir());
  if (isInside(root, temp)) {
    throw new CopyRefusal(
      `the temp directory ${temp} is inside launch.root ${root}, so the copy would copy itself; point TMPDIR outside the evaluated project`,
    );
  }
  const directory = fs.mkdtempSync(path.join(temp, 'tea-evaluate-copy-'));
  try {
    const copy = path.join(directory, 'target');
    const provisioned = new Set(provision.map((entry) => path.join(root, ...entry.replace(/\/+$/, '').split('/'))));
    fs.cpSync(root, copy, {
      recursive: true,
      verbatimSymlinks: true,
      filter: (source) => {
        if (source === path.join(root, '.git') || source === runsDirectory || provisioned.has(source)) return false;
        const stats = fs.lstatSync(source);
        if (!stats.isFile() && !stats.isDirectory() && !stats.isSymbolicLink()) {
          throw new CopyRefusal(
            `${path.relative(root, source).split(path.sep).join('/')} in launch.root is neither a file, a directory nor a symbolic link (a FIFO, a socket or a device), which the disposable copy cannot hold; remove it or provision its directory`,
          );
        }
        return true;
      },
    });
    containLinks(root, copy);
    for (const target of provisioned) {
      if (!fs.existsSync(target)) continue;
      const link = path.join(copy, path.relative(root, target));
      fs.mkdirSync(path.dirname(link), { recursive: true });
      fs.symlinkSync(target, link, 'dir');
    }
    return { directory, root: copy };
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Removes the staged copy when the process is interrupted, since a signal ends
 * the process before any `finally` runs: aborts the in-flight leg (the adapter
 * kills its runner, whose supervisor then stops the agent's process group),
 * removes the copy, and raises the same signal again with the default action,
 * so the caller sees the process end by that signal.
 *
 * @returns {() => void} removes the handlers
 */
function cleanUpOnSignal(directory, controller) {
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  const handlers = new Map();
  const release = () => {
    for (const [name, handler] of handlers) process.removeListener(name, handler);
  };
  for (const name of signals) {
    const handler = () => {
      release();
      controller.abort();
      fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      process.kill(process.pid, name);
    };
    handlers.set(name, handler);
    process.on(name, handler);
  }
  return release;
}

/** `runs/`, created with a `.gitignore` that ignores everything in it, so no run lands in the adopter's commits (AD-12). */
function ensureRunsDirectory(folder) {
  const runs = path.join(folder, 'runs');
  fs.mkdirSync(runs, { recursive: true });
  const ignore = path.join(runs, '.gitignore');
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '*\n');
  return runs;
}

/**
 * Runs `tea-evaluate preflight` over one evaluation folder.
 *
 * @param {string} folder the resolved evaluation folder
 * @param {object} [options]
 * @param {NodeJS.ProcessEnv} [options.env] the environment the engine CLI stage runs under
 * @param {(line: string) => void} [options.log] progress lines for an operator
 * @returns {Promise<PreflightOutcome>}
 */
async function runPreflightCommand(folder, { env = process.env, log = () => {} } = {}) {
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
  const seeded = seededProbeFiles(folder);
  if (seeded.length > 0) {
    return new PreflightOutcome({
      stage: 'launch',
      exitCode: 12,
      message: `${seeded.map((name) => `probes/${name}`).join(', ')} seed a defect, whose manifestation witness runs against the mutated copy of its mutation; this release builds no mutated copy, so a retry cannot pass`,
    });
  }

  const root = realPathLoosely(path.resolve(folder, evaluation.launch.root));
  const provision = evaluation.workspace?.provision ?? [];
  const runsDirectory = ensureRunsDirectory(folder);
  let staged;
  try {
    staged = stageCopy({ root, provision, runsDirectory });
  } catch (error) {
    if (!(error instanceof CopyRefusal)) throw error;
    return new PreflightOutcome({ stage: 'launch', exitCode: 12, message: error.message });
  }
  const controller = new AbortController();
  const release = cleanUpOnSignal(staged.directory, controller);
  try {
    return await runInCopy({ folder, evaluation, copyRoot: staged.root, runsDirectory, env, log, signal: controller.signal });
  } finally {
    release();
    fs.rmSync(staged.directory, { recursive: true, force: true });
  }
}

async function runInCopy({ folder, evaluation, copyRoot, runsDirectory, env, log, signal }) {
  const registry = registryFromEvaluation(evaluation, { root: copyRoot });
  const problems = registry.targetProblems();
  if (problems.length > 0) {
    return new PreflightOutcome({ stage: 'launch', exitCode: 12, message: `the registry cannot launch: ${problems.join('; ')}` });
  }

  const invocationId = newInvocationId();
  const runDirectory = path.join(runsDirectory, invocationId);
  fs.mkdirSync(runDirectory, { recursive: true });
  log(`run ${invocationId}: ${runDirectory}`);
  const outcome = (fields) => new PreflightOutcome({ runDirectory, ...fields });
  // The run keeps its own copy of the contract, so every stage below reads the
  // same bytes and the verdict can be reproduced from the run directory alone.
  const contractPath = path.join(runDirectory, CONTRACT_NAME);
  fs.copyFileSync(path.join(folder, CONTRACT_NAME), contractPath);

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

  const probesPath = path.join(runDirectory, 'probes.json');
  writeJson(probesPath, []);
  const engine = await loadEngine();
  const { port: adapter } = await registry.createProbePort({ cwd: copyRoot });
  const recorder = recordingPort({ port: adapter, registry, runDirectory });
  try {
    await engine.runPreflight({
      contract: readJson(contractPath),
      probes: [],
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

  const verdict = runEngineStage(
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
  return outcome({
    stage: 'verdict',
    exitCode: verdict.exitCode,
    message: `eval-quality preflight exited ${verdict.exitCode}; its verdict and diagnostics are in ${path.relative(folder, runDirectory)}`,
  });
}

module.exports = { CopyRefusal, PreflightOutcome, newInvocationId, recordingPort, runPreflightCommand, stageCopy };
