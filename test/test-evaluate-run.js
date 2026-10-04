/**
 * `tea-evaluate run` and `tea-evaluate score`, end to end (Story 1.8, AD-6,
 * AD-7, AD-10, AD-12).
 *
 * Every case builds a temp git project from `test/fixtures/evaluate/mutation/`:
 * a verdict command (`bin/verdict.js`) that judges its request by
 * `rules/policy.txt` and prints the request it received, a clean control
 * P-001, and a probe P-002 that M-001 seeds (strict relaxed to lenient), with
 * `trials: 3` against the policy's `minimumTrialCount` 3. The real `tea-evaluate`
 * runs against the real installed eval-quality, with a private temp directory
 * per case.
 *
 * - A run: `runs/<invocationId>/` holds one trial set per probe, each with
 *   three Sealed Run Records (one `runId` per set and none shared across sets,
 *   `trialIndex` 1..3, `mode: contract-scoring`, `conditionArm` `clean` or
 *   `mutated:M-001`, `evaluator-chosen` observations whose request is the
 *   interaction plan's bound literal, as the target's own stdout shows), one
 *   isolation manifest (each trial's workspace granted, no mount observed by
 *   the confinement's audit, the
 *   one command the plan ran observed out of a two-command registry, one
 *   call per plan step and trial), and one evaluator configuration for the
 *   run whose `sealedBriefDigest` is the digest of the persisted sealed
 *   brief, with `modelSnapshot: none` and the digest of the empty byte
 *   string; every one meets eval-quality's published schema. `run.json`
 *   records the versions, digests (of every file `score` reads), runner and
 *   model, trial count, a duration no shorter than the trials, commit and
 *   `dirty`. Each probe's digests are the ones AD-7 names, computed here with
 *   git and SHA-256.
 * - A score with the real engine: P-001 `passed-clean-control` and P-002
 *   `caught` in every trial, reduced over three trials, with a comparable
 *   strength vector and the run's corpus digest; `eval-quality score` run by hand on the persisted argv
 *   gives the same exit and byte-identical evidence, on that passing run and
 *   on a FAIL (trial 2 of P-002 rewritten as an evaluator that saw nothing).
 * - A score with the isolation manifest removed: exit 3, the probe's persisted
 *   `score` stderr non-empty, and no evidence artifact, and so no aggregate
 *   call: the invocation's summary records the aggregate absent with its reason.
 * - The run-wide strength aggregate (Story 1.45), over the real engine: five
 *   qualified defect probes beside a clean control, four caught, produce one
 *   copied `strength-aggregate.json` whose bytes equal the engine's (a direct
 *   rerun of the recorded argv with a fresh `--out`) and whose input digests
 *   equal the persisted evidence's; the same evidence meets a `0.75` floor and
 *   does not meet `0.9` with the exit unchanged; an absent class is `null`, a
 *   class with no exercised probe has `rate: null`, a trial set below the
 *   policy's minimum is not comparable, and the clean control stays outside the
 *   denominator; a probe with no evidence, an engine refusal (exit 4 and 5), a
 *   tampered evidence file and a forged aggregate (digest, probe set, engine
 *   version, schema, bytes, a link) each copy nothing and are recorded.
 * - A score through a logging shim at `TEA_EVALUATE_ENGINE_CLI`: one `score`
 *   call per probe carrying every trial's `--record` and the set's manifest;
 *   each call's stdout and stderr (several lines each) and exit code
 *   persisted byte for byte and keyed by probe; the command's exit the most
 *   severe call's own, whichever probe made it. Each persisted artifact kind
 *   that fails its schema, a `trial-sets.json` path that leaves the run
 *   directory, a record or manifest rewritten after the run (its digest no
 *   longer the one `run.json` recorded), a reference out of the run
 *   directory, and a run.json that does not say completed each exit 10 (64
 *   for the last) with no call, and so do a record the run never sealed,
 *   named in the index under a new name, a manifest reference naming the
 *   other set's manifest, and a record swapped for a FIFO (never waited on).
 * - A trial that exits an infrastructure code: no record, exit 12, and
 *   `score` refuses the incomplete run with 64. A target that writes into the
 *   project during a trial exits 12, and so does one that plants a link in
 *   the run directory where a record would go (the adopter's tree untouched)
 *   or rewrites the compiled contract, and so does one that swaps
 *   `trials/clean` for a link into the project, replaces it, or moves
 *   `trials/` into the project behind a link (nothing written there); a run
 *   whose last verification fails after its index was written ends
 *   incomplete, with no index, and so does one whose project changes while
 *   it seals; a run directory moved away before the last verification leaves
 *   no run.json saying completed and an exit message naming the end the
 *   runtime could not record;
 *   a clean control whose baseline does not pass exits 11; `run` refuses a
 *   folder with no policy or no probe (10), a probe on a route it does not
 *   run (12), and a `runs/` or `runs/.gitignore` a target left as a link
 *   (12, nothing written through it); `score` refuses a folder with no
 *   run (64) and an index of another version (10).
 * - A run whose `policy/evaluator-conditions.json` names a model records it,
 *   and one whose second mutated trial accepts carries the set's FAIL
 *   recommendation in every record, which the engine accepts.
 * - A run with clean controls only and `trials: 4`, from an evaluation folder
 *   holding uncommitted work, and the newest of two runs scored by default;
 *   one run's trial set copied into the other, its runId named in the index,
 *   is refused.
 * - A project below its repository's top: the implementation digest is the
 *   tracked tree of that directory, moved by a commit inside it and not by
 *   one beside it.
 * - The run directory's writer: a file written while its directory is moved
 *   out is removed again and the write refused, and a read of a file swapped
 *   for a FIFO is refused at once.
 * - Units: the deterministic evaluator's judgment of a trial (quotation
 *   channels and fallbacks, the severity of an oracle two behaviors share),
 *   the set-level recommendation, and the combined exit.
 * - The skill's policy templates carry no threshold values and validate once
 *   filled; the evaluation-folder `.gitignore` template and TeA's root
 *   `.gitignore` ignore `runs/`.
 * - File-system confinement (Story 1.31), on this host's real mechanism: every
 *   run above is confined unless it opts out (the cases whose target writes
 *   into the project or the run directory on purpose, which prove the
 *   runtime's own checks an opted-out run relies on); `run.json` records the
 *   mechanism and each forbidden input's note names it; a target is refused
 *   the contract and a write into `runs/`, a process it leaves running is
 *   refused the rewrite of a sealed record and its digest after `run` exits,
 *   and one that swaps a tracked `evaluator/` file as the evaluator launches is
 *   refused, each beside an opted-out control where the same attempt lands; a
 *   path it opens outside what it was granted is an observed mount eval-quality
 *   records as an isolation violation, unless its registry entry declares it
 *   in `systemPaths`; a platform with no mechanism exits 12 unless the
 *   evaluation opts out, which `run.json` records; the reference names each
 *   platform's mechanism under its exact heading.
 * - The network of a Bubblewrap target (Story 1.63): the status shim's bridge
 *   over Unix sockets on every host (the protocol's valid line and each
 *   refusal, no outbound connection from a refused line, the listener ending
 *   with the target on every path), the vectors and probes that carry
 *   `--unshare-net` and the layer's that does not, a host that refuses the
 *   namespace (exit 12), and, on a Linux host with Bubblewrap and strace
 *   (the Linux CI job), an abstract Unix socket and a host loopback port that
 *   a confined process cannot reach while a path socket it can, the same
 *   commands reaching all three with the flag taken out; the reference's
 *   network claims each name the case that backs them.
 *
 * Usage: node test/test-evaluate-run.js [--group=run|confinement|aggregate|held-inputs] [--only=<text in a case's name>]
 * CI runs the four groups as `test:evaluate-run`, `test:evaluate-confinement`, `test:evaluate-aggregate` and
 * `test:evaluate-held-inputs`; with no `--group` every case runs.
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');

const AjvModule = require('ajv/dist/2020');

const { ENGINE_CLI_ENV, engineCliPath, loadEngine } = require('../cli/lib/evaluate/engine');
const { ArmError, runArm, stoppedFromOutside } = require('../cli/lib/evaluate/arm');
const { uncommittedUnder } = require('../cli/lib/evaluate/preflight');
const { judgeTrial } = require('../cli/lib/evaluate/evaluator');
const { recordObservation, createArtifactValidator } = require('../cli/lib/evaluate/records');
const { RunDirectory, RunDirectoryError } = require('../cli/lib/evaluate/run-directory');
const {
  channelEntry,
  egressRefusalNote,
  leftSocketsNote,
  lostCanaryNote,
  readObservedMounts,
  runTrial,
  setRecommendation,
  socketTruncationEntry,
} = require('../cli/lib/evaluate/run');
const {
  createRegistry,
  egressRegistryProblems,
  egressResolver,
  registryProblems,
  removedNetworkProblem,
} = require('../cli/lib/evaluate/registry');
const {
  MAX_DETAIL_CHARS,
  MAX_HOST_BYTES,
  MAX_REFUSALS,
  MAX_TUNNELS,
  egressAuthorization,
  isEgressHost,
  parseConnectLine,
  startEgress,
} = require('../cli/lib/evaluate/confinement-egress');
const { BRIDGE_HOSTS, bridgeAccepts, bridgeHostOf, startForwarder } = require('../cli/lib/evaluate/confinement-relay');
const { executableOnPath } = require('../cli/lib/isolation-primitives');
const {
  BUBBLEWRAP_ARGUMENT_LIMIT,
  MAX_HIDDEN_SOCKETS,
  PINNED_SOCKETS,
  SCAN_DIRECTORIES,
  hostPathSockets: listedHostSockets,
  listHostSockets,
  socketBudget,
  socketTablePaths,
} = require('../cli/lib/evaluate/host-sockets');

/** The list of the host's sockets with no well-known path pinned, which a case names itself (this host's `/var/run/docker.sock` is a link into the user's home on macOS). */
const hostPathSockets = (options) => listedHostSockets({ pinned: [], ...options });
const {
  TRACE_CLONES,
  TRACE_PATH_SYSCALLS,
  TRACE_SYSCALLS,
  TraceReader,
  decodeString,
  parseReportLine,
  probeReportStream,
  probeTrace,
  splitArguments,
  traceDecision,
} = require('../cli/lib/evaluate/confinement-audit');
const {
  LOG_ENV,
  MECHANISM_NAMES,
  PLATFORM_ENV,
  confinedCommandMechanism,
  forbiddenInputNote,
  confinedMcpMechanism,
  layerPrefix,
  makeAuditDirectory,
  makeTargetHome,
  nodeInstallRoot,
  probeObserver,
  releaseTargetHome,
  selectConfinement,
  targetSandbox,
  chmodDirectoryNoFollow,
  unlockDirectories,
} = require('../cli/lib/evaluate/confinement');
const {
  WorkspaceRefusal,
  createWorkspace,
  gitAccessOf,
  journalDirectory,
  makePrivateParent,
  reclaimDeadWorkspaces,
  removeWorkspace,
} = require('../cli/lib/evaluate/workspace');
const { combinedExit } = require('../cli/lib/evaluate/score');
const { agentReplyAndUsage } = require('../cli/lib/agent-adapters');
const { parseUsageReport } = require('../cli/lib/evaluate/usage-report');
const { scratchDirectories } = require('./lib/scratch-directories');

const Ajv = AjvModule.default ?? AjvModule;

const PROJECT_ROOT = path.join(__dirname, '..');
const EVALUATE = path.join(PROJECT_ROOT, 'cli', 'evaluate.js');
const SHIM = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'engine-shim.js');
const RACE_ENGINE = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'race-engine.js');
const WRAP_SCORE_WRITER = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'wrap-score-writer.cjs');
const FIXTURE = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'mutation');
const ASSETS = path.join(PROJECT_ROOT, 'src', 'workflows', 'testarch', 'bmad-testarch-evaluate', 'assets');
const CONDITIONS_SCHEMA = path.join(PROJECT_ROOT, 'cli', 'lib', 'evaluate', 'schemas', 'evaluator-conditions.schema.json');
const WRAP_RUN_DIRECTORY = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'wrap-run-directory.cjs');
const REPORT_LISTENER = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'report-listener.cjs');
const CONFINEMENT_STATUS = path.join(PROJECT_ROOT, 'cli', 'lib', 'evaluate', 'confinement-status.cjs');
const LOSSY_LOG = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'lossy-log.cjs');
const CUT_SOCKET_REPORT = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'cut-socket-report.cjs');
const REFUSED_EGRESS_REPORT = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'refused-egress-report.cjs');
const EVALUATION = path.join('evals', 'verdict');
const TRIALS = 3;
/** The confinement this host runs targets under (Story 1.31); the suite runs where one exists, as TeA's CI does. */
const CONFINEMENT = process.platform === 'darwin' ? 'seatbelt' : 'bubblewrap';

const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== ENGINE_CLI_ENV && !name.startsWith('GIT_')));
const GIT_IDENTITY = ['-c', 'user.name=TeA test', '-c', 'user.email=tea-test@example.test', '-c', 'core.hooksPath=/dev/null'];
const GIT_ENV = { ...BASE_ENV, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
/** `git check-ignore` reading the repository's own rules only, never a developer's global excludes file. */
const CHECK_IGNORE = ['-c', 'core.excludesFile=/dev/null', 'check-ignore', '-q'];
const SPAWN_TIMEOUT_MS = 120_000;

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };

const failures = [];
let checks = 0;
const scratch = scratchDirectories('tea-evaluate-run');
/** Each project's private temp directory, which every run and score must leave empty. */
const runtimeTemps = [];

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

/** The messages of checks that expect the kernel's report channel on macOS to deliver a report (Story 1.60), which can lose one. */
const reportFailures = new Set();

/** `check` for an expectation that a report arrived: a lossy case that fails only these checks runs again before they count. */
function checkReport(condition, message) {
  checks += 1;
  if (condition) return;
  failures.push(message);
  reportFailures.add(message);
}

/**
 * An audit's list held to the paths it should name: one that names a path nobody read fails at once, and one that lacks a
 * path it should name fails as a lost report.
 */
function checkMounts(observed, expected, what) {
  const extra = observed.filter((entry) => !expected.includes(entry));
  check(extra.length === 0, `${what}: the audit listed ${JSON.stringify(extra)} beyond ${JSON.stringify(expected)}`);
  const missing = expected.filter((entry) => !observed.includes(entry));
  checkReport(missing.length === 0, `${what}: the audit did not list ${JSON.stringify(missing)}; it listed ${JSON.stringify(observed)}`);
}

function tempDir(label) {
  return scratch.make(label);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function editJson(file, edit) {
  const value = readJson(file);
  edit(value);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** A file a run or score should have written, parsed; a missing one is a failed check and reads as `null`. */
function written(file, what) {
  if (!fs.existsSync(file)) {
    check(false, `${what}: ${path.basename(path.dirname(file))}/${path.basename(file)} was not written`);
    return null;
  }
  return readJson(file);
}

/** The shim's logged calls, one argv per line. */
function loggedCalls(log) {
  return fs.existsSync(log)
    ? fs
        .readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line))
    : [];
}

function sha256(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function git(project, args) {
  const result = spawnSync('git', ['-C', project, ...GIT_IDENTITY, ...args], {
    env: GIT_ENV,
    timeout: SPAWN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${project}: ${result.stderr}`);
  return result.stdout;
}

function evaluate(args, env = {}, node = [], { timeout = SPAWN_TIMEOUT_MS } = {}) {
  const result = spawnSync(process.execPath, [...node, EVALUATE, ...args], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    env: { ...BASE_ENV, ...env },
    timeout,
    killSignal: 'SIGKILL',
  });
  if (result.error) throw new Error(`tea-evaluate ${args.join(' ')} did not finish: ${result.error.message}`);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, output: `${result.stdout}${result.stderr}` };
}

/**
 * A committed temp project from the fixture; `edit` changes it before the
 * index is digested and the commit made. With `below`, the project sits in
 * that directory of a larger repository whose top holds `other/` beside it.
 * With `unconfined`, the evaluation opts out of file-system confinement, for
 * a case that proves the runtime's own checks against a target that writes
 * where it must not, which a confined run refuses (Story 1.31). `history`
 * makes further commits after the first, with the project and its folder.
 */
let cachedGitToolchain = null;

/**
 * The directories of this host's `git` outside the system's own (Story 1.60): the confinement audits every process of a target,
 * a `git` the fixture's target runs included, and a toolchain outside `/usr` is read from where it is installed, as an adopter
 * declares it in `systemPaths` (a Homebrew prefix on macOS, the developer directory of a Command Line Tools or Xcode shim).
 * Nothing on a host whose git lives under `/usr`, as CI's does.
 */
function gitToolchainPaths() {
  if (cachedGitToolchain !== null) return cachedGitToolchain;
  const found = spawnSync('which', ['git'], { encoding: 'utf8', env: BASE_ENV }).stdout.trim();
  const paths = new Set();
  if (found !== '') {
    const real = fs.realpathSync(found);
    const cellar = real.indexOf('/Cellar/');
    if (cellar !== -1) paths.add(real.slice(0, cellar));
    else if (!real.startsWith('/usr/') && !real.startsWith('/bin/')) paths.add(path.dirname(path.dirname(real)));
    if (process.platform === 'darwin' && real.startsWith('/usr/bin/')) {
      const developer = spawnSync('xcode-select', ['-p'], { encoding: 'utf8' }).stdout.trim();
      for (const entry of [developer, '/Library/Developer', '/Library/Apple', '/Library/Preferences']) if (entry !== '') paths.add(entry);
    }
  }
  cachedGitToolchain = [...paths].filter((entry) => fs.existsSync(entry));
  return cachedGitToolchain;
}

function makeProject(label, { edit = () => {}, below = null, unconfined = false, history = () => {}, toolchain = false } = {}) {
  const repository = path.join(tempDir(label), 'repository');
  const project = below === null ? repository : path.join(repository, below);
  fs.cpSync(FIXTURE, project, { recursive: true, filter: (from) => path.basename(from) !== 'runs' });
  fs.writeFileSync(path.join(repository, '.gitignore'), 'vendor/\n');
  if (below !== null) {
    fs.mkdirSync(path.join(repository, 'other'));
    fs.writeFileSync(path.join(repository, 'other', 'notes.txt'), 'beside the project\n');
  }
  const folder = path.join(project, EVALUATION);
  if (unconfined) editJson(path.join(folder, 'evaluation.json'), (evaluation) => (evaluation.confinement = false));
  // A case whose target runs `git` declares where this host installed it, when that is outside the system's directories.
  if (toolchain && gitToolchainPaths().length > 0) {
    editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
      for (const entry of evaluation.registry) entry.systemPaths = [...(entry.systemPaths ?? []), ...gitToolchainPaths()];
    });
  }
  edit({ project, folder });
  const digested = evaluate(['digest', '--evaluation', folder]);
  if (digested.status !== 0) throw new Error(`digest failed for ${label}: ${digested.output}`);
  git(repository, ['init', '--quiet', '--initial-branch', 'main']);
  git(repository, ['add', '--all']);
  git(repository, ['commit', '--quiet', '--message', 'the verdict project']);
  history({ repository, project, folder });
  const directory = tempDir(`${label}-temp`);
  runtimeTemps.push({ label, directory });
  return { repository, project, folder, env: { TMPDIR: directory, TMP: directory, TEMP: directory } };
}

/** The newest run directory under `runs/`; with `expected`, how many there must be. */
function runDirectoryOf(folder, expected = 1) {
  const runs = path.join(folder, 'runs');
  const names = fs.existsSync(runs) ? fs.readdirSync(runs).filter((name) => name !== '.gitignore' && name !== '.workspace-journal') : [];
  check(names.length === expected, `expected ${expected} run directory(ies), found ${JSON.stringify(names)}`);
  return names.length === 0 ? null : path.join(runs, names.sort().at(-1));
}

/** The newest score invocation's directory in a run. */
function latestScoreDirectory(runDirectory) {
  const scores = path.join(runDirectory, 'scores');
  const names = fs.existsSync(scores) ? fs.readdirSync(scores).sort() : [];
  return names.length === 0 ? null : path.join(scores, names.at(-1));
}

/** `eval-quality score` run directly on the argv a `tea-evaluate score` call persisted, with its own `--out`. */
function directScore(record, out) {
  const argv = [...record.argv];
  argv[argv.indexOf('--out') + 1] = out;
  const cli = engineCliPath(BASE_ENV);
  const result = spawnSync(process.execPath, [cli, ...argv], { encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS, killSignal: 'SIGKILL' });
  return { status: result.status, bytes: fs.existsSync(out) ? fs.readFileSync(out) : null };
}

/** Each probe's persisted `score` call and evidence agree with a direct `eval-quality score` over the same inputs. */
function checkDirectRerun(label, scoreDirectory) {
  for (const probeId of ['P-001', 'P-002']) {
    const record = written(path.join(scoreDirectory, probeId, 'score.json'), `${label}, ${probeId}'s score call`);
    if (record === null) continue;
    const persisted = path.join(scoreDirectory, probeId, 'evidence-artifact.json');
    const direct = directScore(record, path.join(tempDir(`${label.replaceAll(' ', '-')}-direct`), 'evidence.json'));
    check(
      direct.status === record.exitCode,
      `${label}: eval-quality score run directly on ${probeId}'s inputs exited ${direct.status}; tea-evaluate recorded ${record.exitCode}`,
    );
    check(
      direct.bytes !== null && fs.existsSync(persisted) && direct.bytes.equals(fs.readFileSync(persisted)),
      `${label}: ${probeId}'s evidence from a direct eval-quality score is not byte-identical to the persisted evidence`,
    );
  }
}

/** `eval-quality aggregate-strength` run directly on the argv a `tea-evaluate score` invocation persisted, with its own `--out`. */
function directAggregate(record, out) {
  const argv = [...record.argv];
  argv[argv.indexOf('--out') + 1] = out;
  const cli = engineCliPath(BASE_ENV);
  const result = spawnSync(process.execPath, [cli, ...argv], { encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS, killSignal: 'SIGKILL' });
  return { status: result.status, bytes: fs.existsSync(out) ? fs.readFileSync(out) : null };
}

/**
 * An invocation's aggregate against the engine: the copy equals what a direct rerun of the recorded argv writes byte for
 * byte, the argv names the persisted evidence, the floors copy and the run's own policy, and each input digest equals the
 * digest of the evidence file the invocation persisted, computed here from the file (`digestArtifact` over its parse).
 */
function checkAggregateRerun(label, { engine, runDirectory, scoreDirectory, probeIds }) {
  const call = written(path.join(scoreDirectory, 'aggregate-strength.json'), `${label}'s aggregate call`);
  const copied = path.join(scoreDirectory, 'strength-aggregate.json');
  if (call === null || !fs.existsSync(copied)) {
    check(false, `${label}: the invocation copied no strength aggregate`);
    return null;
  }
  const direct = directAggregate(call, path.join(tempDir(`${label.replaceAll(' ', '-')}-aggregate`), 'strength-aggregate.json'));
  check(direct.status === 0 && direct.bytes !== null, `${label}: eval-quality aggregate-strength run directly exited ${direct.status}`);
  const bytes = fs.readFileSync(copied);
  check(
    direct.bytes?.equals(bytes) === true,
    `${label}: the copied aggregate is not byte-identical to a direct eval-quality aggregate-strength`,
  );
  const value = (flag) => call.argv[call.argv.indexOf(flag) + 1];
  const evidenceFlags = call.argv.flatMap((argument, at) => (argument === '--evidence' ? [call.argv[at + 1]] : []));
  check(
    JSON.stringify(evidenceFlags) ===
      JSON.stringify(probeIds.map((probeId) => path.join(scoreDirectory, probeId, 'evidence-artifact.json'))) &&
      value('--floors') === path.join(scoreDirectory, 'strength-floors.json') &&
      value('--policy') === path.join(runDirectory, 'scoring-policy.json') &&
      call.argv[0] === 'aggregate-strength',
    `${label}: the aggregate call carried ${JSON.stringify(call.argv)}`,
  );
  const out = value('--out');
  check(
    typeof out === 'string' &&
      path.basename(out) === 'strength-aggregate.json' &&
      path.basename(path.dirname(out)).startsWith('tea-evaluate-aggregate-') &&
      !fs.existsSync(path.dirname(out)),
    `${label}: the aggregate call names --out ${out}, which is not a removed staging file`,
  );
  const aggregate = JSON.parse(bytes.toString('utf8'));
  for (const input of aggregate.inputs) {
    const persisted = engine.digestArtifact(
      JSON.parse(fs.readFileSync(path.join(scoreDirectory, input.probeId, 'evidence-artifact.json'), 'utf8')),
      'EvidenceArtifact',
    );
    check(
      input.artifactDigest === persisted,
      `${label}: ${input.probeId}'s recorded digest ${input.artifactDigest} is not its persisted evidence's ${persisted}`,
    );
  }
  check(
    JSON.stringify(aggregate.inputs.map((input) => input.probeId)) === JSON.stringify([...probeIds].sort()) &&
      aggregate.engineVersion === engine.VERSION,
    `${label}: the aggregate covers ${JSON.stringify(aggregate.inputs.map((input) => input.probeId))} under engine ${aggregate.engineVersion}`,
  );
  return aggregate;
}

/** The run's own files: run.json, the trial sets, the manifests, the configuration and the probes' AD-7 digests. */
async function checkRunShape({ engine, validate, repository, project, folder, runDirectory }) {
  const commit = git(repository, ['rev-parse', 'HEAD']).toString().trim();
  const contract = readJson(path.join(folder, 'contract.json'));
  const compiled = written(path.join(runDirectory, 'eval-contract.json'), 'the compiled contract');
  const brief = written(path.join(runDirectory, 'sealed-evaluator-brief.json'), 'the sealed brief');
  const contractDigest = compiled === null ? null : engine.digestArtifact(compiled, 'EvalContract');
  const sealedBriefDigest = brief === null ? null : engine.digestArtifact(brief, 'SealedEvaluatorBrief');

  // run.json (AD-7, AD-12).
  const run = written(path.join(runDirectory, 'run.json'), 'run.json') ?? {};
  check(run.command === 'run' && run.completed === true, `run.json records command ${run.command} and completed ${run.completed}`);
  check(run.seed === 'story-1.30-seed', `run.json records matcher seed ${JSON.stringify(run.seed)}`);
  check(
    run.teaVersion === JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8')).version,
    `run.json records TeA ${run.teaVersion}`,
  );
  check(
    run.evalQualityVersion === engine.VERSION,
    `run.json records eval-quality ${run.evalQualityVersion}, not the installed ${engine.VERSION}`,
  );
  check(run.evaluationFolder?.dirty === false, `run.json records the evaluation folder as ${JSON.stringify(run.evaluationFolder)}`);
  check(
    run.commit === commit && run.dirty === false,
    `run.json records commit ${run.commit} and dirty ${run.dirty}; expected ${commit} and false`,
  );
  check(
    contractDigest !== null && run.contractDigest === contractDigest,
    'run.json records a contract digest other than the compiled contract',
  );
  check(
    run.corpusDigest === engine.digestArtifact(readJson(path.join(folder, 'corpus-index.json')), 'corpus-index.json'),
    'run.json records a corpus digest other than the digest of corpus-index.json',
  );
  const trialElapsed = ['clean', 'mutated-M-001']
    .flatMap((arm) => [1, 2, 3].map((trial) => path.join(runDirectory, 'trials', arm, `trial-${trial}.json`)))
    .reduce((total, file) => total + (written(file, 'a trial evidence file')?.elapsedMs ?? 0), 0);
  check(
    run.trialCount === TRIALS && Number.isFinite(run.durationMs) && trialElapsed > 0 && run.durationMs >= trialElapsed,
    `run.json records ${run.trialCount} trials over ${run.durationMs} ms, while the trials alone took ${trialElapsed} ms`,
  );
  check(
    Array.isArray(run.runner) && run.runner.some((entry) => entry.executable === 'verdict' && entry.target === 'bin/verdict.js'),
    `run.json names no runner: ${JSON.stringify(run.runner)}`,
  );
  check(
    run.model?.modelSnapshot === 'none' && run.model?.systemPromptDigest === sha256(Buffer.alloc(0)),
    `run.json records model ${JSON.stringify(run.model)}`,
  );
  check(run.confinement === CONFINEMENT, `run.json records confinement ${JSON.stringify(run.confinement)}; expected ${CONFINEMENT}`);
  // This case holds the entries' shape on every host; the audit channel case holds what the log delivered.
  checkChannelRecords(run.observedMountsChannel, auditedTrials(), { lossless: false });
  checkSocketTruncationRecords(run.hostSocketTruncation);

  // The evaluator configuration (AD-7, NFR8): the seal's digest, and a no-model run's two fields.
  const configuration = written(path.join(runDirectory, 'evaluator-configuration.json'), 'the evaluator configuration') ?? {};
  const configurationDigest = engine.digestArtifact(configuration, 'EvaluatorConfiguration');
  for (const problem of await validate('evaluator-configuration', configuration))
    check(false, `the evaluator configuration fails its published schema: ${problem}`);
  check(
    sealedBriefDigest !== null && configuration.sealedBriefDigest === sealedBriefDigest,
    'the evaluator configuration carries a sealedBriefDigest other than the persisted sealed brief',
  );
  check(
    configuration.modelSnapshot === 'none',
    `a run that uses no model records modelSnapshot ${JSON.stringify(configuration.modelSnapshot)}`,
  );
  check(
    configuration.systemPromptDigest === sha256(Buffer.alloc(0)),
    `a run that uses no model records systemPromptDigest ${configuration.systemPromptDigest}`,
  );

  // The trial sets (AD-7).
  const index = written(path.join(runDirectory, 'trial-sets.json'), 'trial-sets.json') ?? {};
  const sets = index.trialSets ?? [];
  check(
    JSON.stringify(sets.map((set) => [set.probeId, set.conditionArm])) ===
      JSON.stringify([
        ['P-001', 'clean'],
        ['P-002', 'mutated:M-001'],
      ]),
    `the trial sets are ${JSON.stringify(sets.map((set) => [set.probeId, set.conditionArm]))}`,
  );
  const runIds = sets.map((set) => set.runId);
  check(
    new Set(runIds).size === runIds.length && runIds.every((id) => id.startsWith(run.invocationId)),
    `the trial sets' runIds ${JSON.stringify(runIds)} are not one each, derived from ${run.invocationId}`,
  );
  const plannedStdin = contract.interactionPlan[0].inputBinding.stdin.prompt.literal;
  for (const set of sets) {
    check(set.records.length === TRIALS, `${set.probeId} holds ${set.records.length} records; expected ${TRIALS}`);
    const records = set.records.map((relative) => readJson(path.join(runDirectory, relative)));
    check(
      JSON.stringify(records.map((record) => record.trialIndex)) === JSON.stringify([1, 2, 3]),
      `${set.probeId}'s trialIndex values are ${JSON.stringify(records.map((record) => record.trialIndex))}`,
    );
    for (const record of records) {
      const where = `${set.probeId} trial ${record.trialIndex}`;
      for (const problem of await validate('sealed-run-record', record))
        check(false, `${where}: the record fails its published schema: ${problem}`);
      check(
        record.runId === set.runId && record.conditionArm === set.conditionArm && record.mode === 'contract-scoring',
        `${where} carries runId ${record.runId}, arm ${record.conditionArm}, mode ${record.mode}`,
      );
      check(record.evaluatorConfigurationDigest === configurationDigest, `${where}: the record names another evaluator configuration`);
      check(record.sealedBriefDigest === sealedBriefDigest, `${where}: the record's sealedBriefDigest is not the persisted sealed brief's`);
      check(record.contractDigest === contractDigest, `${where}: the record's contractDigest is not the compiled contract's`);
      for (const observation of record.observations) {
        check(
          observation.provenance === 'evaluator-chosen',
          `${where}: observation ${observation.observationId} is ${observation.provenance}`,
        );
        const stdout = observation.stdout?.value ?? '';
        check(
          stdout.includes(`request: ${plannedStdin}\n`),
          `${where}: the target received something other than the plan's bound literal: ${stdout.split('\n')[0]}`,
        );
        check(observation.callInputs.stdin?.prompt === plannedStdin, `${where}: the record's call inputs are not the plan's bound literal`);
      }
    }
    const manifest = written(path.join(runDirectory, set.isolationManifest), `${set.probeId}'s isolation manifest`) ?? {};
    for (const problem of await validate('isolation-manifest', manifest))
      check(false, `${set.probeId}: the isolation manifest fails its published schema: ${problem}`);
    check(
      manifest.runId === set.runId &&
        manifest.conditionArm === set.conditionArm &&
        manifest.contractDigest === contractDigest &&
        manifest.evaluatorConfigurationDigest === configurationDigest,
      `${set.probeId}'s isolation manifest is for ${manifest.runId} ${manifest.conditionArm}, contract ${manifest.contractDigest}, configuration ${manifest.evaluatorConfigurationDigest}`,
    );
    check(
      JSON.stringify((manifest.allowedMounts ?? []).filter((mount) => !mount.startsWith('read-only '))) ===
        JSON.stringify([1, 2, 3].map((trial) => `git-worktree trial-${set.conditionArm.replace(':', '-')}-${trial}`)),
      `${set.probeId}'s isolation manifest does not name the workspace of each trial: ${JSON.stringify(manifest.allowedMounts)}`,
    );
    // A clean target opens nothing outside what it was granted, so the confinement's audit reports no mount.
    check(
      JSON.stringify(manifest.observedMounts) === '[]',
      `${set.probeId}'s isolation manifest claims observed mounts ${JSON.stringify(manifest.observedMounts)}`,
    );
    // Each forbidden input's note names the confinement that withheld it (Story 1.31).
    const notes = Object.values(manifest.forbiddenInputAccounting ?? {}).map((entry) => entry.note);
    check(
      notes.length === 7 &&
        notes.every((note) => note.includes(`Withheld as well by ${MECHANISM_NAMES[CONFINEMENT]} file-system confinement`)),
      `${set.probeId}'s forbidden-input notes do not name ${MECHANISM_NAMES[CONFINEMENT]}: ${JSON.stringify(notes)}`,
    );
    // Two registry commands granted, the one the plan calls observed, once per plan step and trial.
    check(
      JSON.stringify(manifest.toolAllowlist) === JSON.stringify(['verdict/verdict', 'verdict/verdict-audit']) &&
        JSON.stringify(manifest.observedToolCalls) === JSON.stringify(['verdict/verdict']),
      `${set.probeId}'s manifest grants ${JSON.stringify(manifest.toolAllowlist)} and observed ${JSON.stringify(manifest.observedToolCalls)}`,
    );
    check(
      manifest.actualResourceUse?.toolCalls === contract.interactionPlan.length * TRIALS,
      `${set.probeId}'s manifest records ${manifest.actualResourceUse?.toolCalls} tool calls; the plan's ${contract.interactionPlan.length} step(s) ran ${TRIALS} times`,
    );
    // run.json anchors each record and the manifest by the digest of the bytes the run wrote.
    for (const relative of [...set.records, set.isolationManifest]) {
      const expected =
        relative === set.isolationManifest ? run.artifacts?.isolationManifests?.[set.probeId] : run.artifacts?.records?.[relative];
      check(
        expected === sha256(fs.readFileSync(path.join(runDirectory, relative))),
        `run.json anchors ${relative} to ${expected}, not the digest of its bytes`,
      );
    }
  }
  check(
    run.artifacts?.contract === sha256(fs.readFileSync(path.join(runDirectory, 'eval-contract.json'))),
    `run.json anchors the compiled contract to ${run.artifacts?.contract}`,
  );

  // The probe digests AD-7 names, computed here with git and SHA-256.
  const listing = git(repository, ['ls-tree', '-r', '-z', 'HEAD^{tree}'])
    .toString('utf8')
    .split('\u0000')
    .filter((entry) => entry.length > 0 && !entry.slice(entry.indexOf('\t') + 1).startsWith('evals/verdict/'));
  const implementationDigest = sha256(Buffer.from(listing.map((entry) => `${entry}\u0000`).join(''), 'utf8'));
  const commitDigest = sha256(Buffer.from(commit, 'utf8'));
  const artifactDigest = sha256(fs.readFileSync(path.join(project, 'rules', 'policy.txt')));
  for (const [probeId, artifact] of [
    ['P-002', artifactDigest],
    ['P-001', implementationDigest],
  ]) {
    const probe = written(path.join(runDirectory, 'probes', `${probeId}.probe.json`), probeId);
    if (probe === null) continue;
    for (const problem of await validate('probe', probe)) check(false, `${probeId} fails its published schema: ${problem}`);
    check(
      probe.commitDigest === commitDigest,
      `${probeId}'s commitDigest ${probe.commitDigest} is not the evaluated commit's ${commitDigest}`,
    );
    check(
      probe.implementationDigest === implementationDigest,
      `${probeId}'s implementationDigest ${probe.implementationDigest} is not the tracked tree's ${implementationDigest}`,
    );
    check(probe.artifactDigest === artifact, `${probeId}'s artifactDigest ${probe.artifactDigest} is not ${artifact}`);
    if (probeId === 'P-001')
      check(
        probe.qualification?.revisionCommitDigest === commitDigest,
        'the clean control names a revision other than the evaluated commit',
      );
  }
  return { index, configuration, run };
}

/** The real engine's score of the run: every vote, the reduction, a comparable strength vector, and the calls' inputs. */
async function checkRealScore({ engine, validate, folder, env, runDirectory, index, policy, run }) {
  const scored = evaluate(['score', '--evaluation', folder], env);
  check(scored.status === 0, `score exited ${scored.status}; expected 0\n${scored.output}`);
  const scoreDirectory = latestScoreDirectory(runDirectory);
  if (scoreDirectory === null) {
    check(false, 'score wrote no score directory');
    return;
  }
  for (const [probeId, state] of [
    ['P-001', 'passed-clean-control'],
    ['P-002', 'caught'],
  ]) {
    const evidence = written(path.join(scoreDirectory, probeId, 'evidence-artifact.json'), `${probeId}'s evidence`);
    if (evidence === null) continue;
    for (const problem of await validate('evidence-artifact', evidence))
      check(false, `${probeId}'s evidence fails its published schema: ${problem}`);
    const reduced = evidence.reducedProbeOutcomes?.[0];
    const votes = (reduced?.trialVotes ?? []).map((vote) => vote.state);
    check(
      votes.length === TRIALS && votes.every((vote) => vote === state),
      `${probeId}'s trial votes are ${JSON.stringify(votes)}; expected ${state} in each of ${TRIALS}`,
    );
    check(
      evidence.trials?.completed === TRIALS && evidence.trials?.declaredMinimum === policy.minimumTrialCount,
      `${probeId} completed ${evidence.trials?.completed} trials`,
    );
    check(evidence.strength?.comparable === true, `${probeId}'s strength vector is not comparable: ${JSON.stringify(evidence.strength)}`);
    check(
      evidence.scoringVersionInputs?.corpusDigest === run.corpusDigest,
      `${probeId} was scored against corpus ${evidence.scoringVersionInputs?.corpusDigest}, not the run's ${run.corpusDigest}`,
    );
    check(
      probeId !== 'P-002' || (reduced?.caught === true && evidence.strength?.vector?.defect?.rate === 1),
      `P-002 did not reduce to a catch: ${JSON.stringify(reduced)}`,
    );
    const call = written(path.join(scoreDirectory, probeId, 'score.json'), `${probeId}'s score call`) ?? { argv: [] };
    const set = index.trialSets.find((candidate) => candidate.probeId === probeId);
    const value = (flag) => call.argv[call.argv.indexOf(flag) + 1];
    check(
      JSON.stringify(call.argv.flatMap((argument, at) => (argument === '--record' ? [call.argv[at + 1]] : []))) ===
        JSON.stringify(set.records.map((relative) => path.join(runDirectory, relative))) &&
        value('--isolation-manifest') === path.join(runDirectory, set.isolationManifest) &&
        value('--evaluator-configuration') === path.join(runDirectory, 'evaluator-configuration.json') &&
        value('--probe') === path.join(runDirectory, set.probe),
      `${probeId}'s score call carried ${JSON.stringify(call.argv)}`,
    );
    // `--out` is the private staging file the call really used: outside the evaluation folder, under the run's private
    // parent beneath the user's private root in `/tmp`, whatever the run's temp directory is (Story 1.58), and gone once the call was copied in.
    const out = value('--out');
    check(
      typeof out === 'string' &&
        path.basename(out) === 'evidence-artifact.json' &&
        path.basename(path.dirname(out)).startsWith('tea-evaluate-score-') &&
        path.basename(path.dirname(path.dirname(out))).startsWith('run-') &&
        /^tea-evaluate-p\w+$/.test(path.basename(path.dirname(path.dirname(path.dirname(out))))) &&
        ['/tmp', fs.realpathSync('/tmp')].includes(path.dirname(path.dirname(path.dirname(path.dirname(out))))) &&
        !fs.existsSync(path.dirname(path.dirname(out))) &&
        !out.startsWith(`${folder}${path.sep}`) &&
        !fs.existsSync(path.dirname(out)),
      `${probeId}'s score call names --out ${out}, which is not a removed staging file in the private root`,
    );
  }
  checkDirectRerun('the passing run', scoreDirectory);
  const aggregate = checkAggregateRerun('the passing run', {
    engine,
    runDirectory,
    scoreDirectory,
    probeIds: index.trialSets.map((set) => set.probeId),
  });
  if (aggregate !== null) {
    for (const problem of await validate('strength-aggregate', aggregate))
      check(false, `the passing run's aggregate fails its published schema: ${problem}`);
    check(
      aggregate.classes.defect?.eligible === 1 &&
        aggregate.classes.defect.rate === 1 &&
        aggregate.classes['zero-action'] === null &&
        aggregate.inputs.find((input) => input.probeId === 'P-001')?.probeClass === null,
      `the passing run's aggregate counts ${JSON.stringify(aggregate.classes)}, with its clean control in a class`,
    );
    const summary = written(path.join(scoreDirectory, 'score.json'), "the passing run's score summary")?.strengthAggregate;
    const digestOf = (relative) => engine.digestBytes(fs.readFileSync(path.join(folder, relative)));
    check(
      summary?.status === 'copied' &&
        summary.exitCode === 0 &&
        summary.reason === null &&
        digestOf(summary.aggregate) === summary.aggregateDigest &&
        digestOf(summary.floors) === summary.floorsDigest &&
        JSON.stringify(summary.evidenceDigests) ===
          JSON.stringify(Object.fromEntries(aggregate.inputs.map((input) => [input.probeId, input.artifactDigest]))),
      `the passing run's summary records ${JSON.stringify(summary)}`,
    );
    check(
      JSON.stringify(readJson(path.join(scoreDirectory, 'strength-floors.json'))) ===
        JSON.stringify(readJson(path.join(folder, 'evaluation.json')).strengthFloor),
      "the floors copy is not evaluation.json's strengthFloor",
    );
  }
}

/**
 * The score through a logging shim that runs the real eval-quality CLI beneath known streams: one call per probe, the
 * streams and codes kept per probe, the most severe exit passed through. P-002's manifest is left out, so P-001 exits 0
 * and P-002 exits 3 (Invalid, no artifact), which the held bytes also give.
 */
function checkShimmedScore({ folder, env, runDirectory, index }) {
  const log = path.join(tempDir('shim'), 'argv.log');
  const shimEnv = {
    ...env,
    [ENGINE_CLI_ENV]: SHIM,
    TEA_EVALUATE_SHIM_LOG: log,
    TEA_EVALUATE_SHIM_RUN_REAL: '1',
    TEA_EVALUATE_SHIM_STREAMS: 'known-bytes',
  };
  const manifestFile = path.join(runDirectory, index.trialSets.find((set) => set.probeId === 'P-002').isolationManifest);
  const manifestBytes = fs.readFileSync(manifestFile);
  fs.rmSync(manifestFile);
  let shimmed;
  try {
    shimmed = evaluate(['score', '--evaluation', folder], shimEnv);
  } finally {
    fs.writeFileSync(manifestFile, manifestBytes);
  }
  check(
    shimmed.status === 3,
    `score through a shim whose P-001 call exits 0 and P-002 call exits 3 exited ${shimmed.status}; expected 3\n${shimmed.output}`,
  );
  const calls = loggedCalls(log);
  check(
    calls.length === 2 && calls.every((argv) => argv[0] === 'score'),
    `the shim logged ${calls.length} call(s): ${JSON.stringify(calls.map((argv) => argv[0]))}`,
  );
  const scoreDirectory = latestScoreDirectory(runDirectory);
  for (const set of index.trialSets) {
    const argv = calls.find((candidate) => candidate[candidate.indexOf('--probe') + 1]?.endsWith(`${set.probeId}.probe.json`)) ?? [];
    const records = argv.flatMap((argument, at) => (argument === '--record' ? [argv[at + 1]] : []));
    check(
      JSON.stringify(records) === JSON.stringify(set.records.map((relative) => path.join(runDirectory, relative))),
      `${set.probeId}'s score call carried records ${JSON.stringify(records)}`,
    );
    check(
      set.probeId === 'P-002'
        ? !argv.includes('--isolation-manifest')
        : argv[argv.indexOf('--isolation-manifest') + 1] === path.join(runDirectory, set.isolationManifest),
      `${set.probeId}'s score call carried another isolation manifest, or one that is not there`,
    );
    const call = written(path.join(scoreDirectory, set.probeId, 'score.json'), `${set.probeId}'s shimmed score call`);
    if (call === null) continue;
    // The recorded argv is the argv that ran, the staging path in `--out` included.
    check(
      JSON.stringify(call.argv) === JSON.stringify(argv),
      `${set.probeId}'s persisted argv ${JSON.stringify(call.argv)} is not the argv the engine was called with, ${JSON.stringify(argv)}`,
    );
    const probeFile = `${set.probeId}.probe.json`;
    const code = set.probeId === 'P-001' ? 0 : 3;
    const stream = (name) => `known-bytes ${name} ${probeFile}\nknown-bytes ${name} 2 ${probeFile}\nknown-bytes ${name} 3 ${probeFile}`;
    check(call.stdout === stream('stdout'), `${set.probeId}'s persisted stdout is ${JSON.stringify(call.stdout)}`);
    // The real CLI's own diagnostics lead the shim's known bytes (an Invalid result names its reason there).
    check(call.stderr.endsWith(stream('stderr')), `${set.probeId}'s persisted stderr is ${JSON.stringify(call.stderr)}`);
    const diagnostics = call.stderr.slice(0, call.stderr.length - stream('stderr').length);
    check(
      set.probeId === 'P-002' ? /^eval-quality: invalid: .*isolation manifest absent/m.test(diagnostics) : diagnostics === '',
      `${set.probeId}'s persisted stderr leads with ${JSON.stringify(diagnostics)}`,
    );
    check(
      call.exitCode === code && call.substituted === true,
      `${set.probeId}'s persisted call records exit ${call.exitCode}, substituted ${call.substituted}; expected ${code}`,
    );
  }
  return shimEnv;
}

/** Every persisted artifact kind that fails its schema, and a path out of the run directory, exit 10 before any engine call. */
function checkRefusedArtifacts({ engine, folder, runDirectory, shimEnv }) {
  const log = shimEnv.TEA_EVALUATE_SHIM_LOG;
  const tamper = (label, relative, edit, expectedFile = relative, pattern = null) => {
    const file = path.join(runDirectory, relative);
    const original = fs.readFileSync(file);
    try {
      const value = JSON.parse(original.toString('utf8'));
      edit(value);
      fs.writeFileSync(file, JSON.stringify(value));
      fs.rmSync(log, { force: true });
      const refused = evaluate(['score', '--evaluation', folder], shimEnv);
      check(refused.status === 10, `score over ${label} exited ${refused.status}; expected 10\n${refused.output}`);
      check(refused.stdout.includes(`${expectedFile}: [`), `score did not name ${expectedFile} for ${label}:\n${refused.stdout}`);
      if (pattern !== null) check(pattern.test(refused.stdout), `score did not say why it refused ${label}:\n${refused.stdout}`);
      check(loggedCalls(log).length === 0, `score called the engine over ${label}`);
    } finally {
      fs.writeFileSync(file, original);
    }
  };
  const restamp = (value) => {
    value.schemaVersion = 'one';
  };
  tamper('a record off its schema', 'trial-sets/P-001/record-1.json', (value) => (value.mode = 'rehearsal'));
  tamper('an isolation manifest off its schema', 'trial-sets/P-002/isolation-manifest.json', restamp);
  tamper('an evaluator configuration off its schema', 'evaluator-configuration.json', restamp);
  tamper('a probe off its schema', 'probes/P-001.probe.json', restamp);
  tamper('a scoring policy off its schema', 'scoring-policy.json', restamp);
  tamper('a compiled contract off its schema', 'eval-contract.json', restamp);
  tamper('a preflight verdict off its schema', 'preflight-verdict.json', restamp);
  tamper(
    'a record path out of the run directory',
    'trial-sets.json',
    (value) => (value.trialSets[0].records[0] = '../../contract.json'),
    'trial-sets.json',
  );
  tamper('a probe ID that climbs out of the score directory', 'trial-sets.json', (value) => (value.trialSets[0].probeId = '../../../x'));
  tamper('a trial set with no trial sets', 'trial-sets.json', (value) => (value.trialSets = []));
  tamper('a corpus digest the run did not record', 'trial-sets.json', (value) => (value.corpusDigest = `sha256:${'0'.repeat(64)}`));
  tamper(
    "a trial set naming another probe's file",
    'trial-sets.json',
    (value) => (value.trialSets[0].probe = value.trialSets[1].probe),
    'probes/P-002.probe.json',
  );
  tamper('a trial set missing a record', 'trial-sets.json', (value) => value.trialSets[1].records.pop());
  tamper('a record of another run', 'trial-sets/P-002/record-3.json', (value) => (value.runId = 'another-run'));
  tamper(
    'a record with another sealed brief',
    'trial-sets/P-001/record-2.json',
    (value) => (value.sealedBriefDigest = `sha256:${'0'.repeat(64)}`),
  );
  tamper(
    'a record whose actions reference is private',
    'trial-sets/P-001/record-3.json',
    (value) => (value.actionsArtifact = { storage: 'private', path: null, privateRef: 'elsewhere', digest: value.actionsArtifact.digest }),
  );
  tamper('an index that drops a probe the run sealed', 'trial-sets.json', (value) => value.trialSets.pop());
  tamper(
    'an index that names one record twice',
    'trial-sets.json',
    (value) => (value.trialSets[0].records[1] = value.trialSets[0].records[0]),
  );
  tamper('a probe edited after the run', 'probes/P-002.probe.json', (value) => (value.defects[0].severity = 'low'));
  tamper('a preflight verdict edited after the run', 'preflight-verdict.json', (value) => (value.runId = 'another-run'));
  tamper('an evaluator configuration edited after the run', 'evaluator-configuration.json', (value) => (value.seed = 7));
  tamper(
    'a trial whose actions evidence was edited',
    'trials/clean/trial-1.json',
    (value) => (value.forged = true),
    'trial-sets/P-001/record-1.json',
  );
  tamper(
    'an isolation manifest edited after the records named it',
    'trial-sets/P-001/isolation-manifest.json',
    (value) => (value.actualResourceUse.wallClockSeconds += 1),
    'trial-sets/P-001/record-1.json',
  );
  tamper(
    "a record whose actions reference names a file outside this run's directory",
    'trial-sets/P-001/record-2.json',
    (value) => (value.actionsArtifact = { ...value.actionsArtifact, path: 'contract.json' }),
    'trial-sets/P-001/record-2.json',
    /its actions artifact contract\.json lies outside this run directory/,
  );
  // A record whose manifest reference names the other set's manifest, digest and all.
  const otherManifest = readJson(path.join(runDirectory, 'trial-sets', 'P-002', 'record-1.json')).isolationManifestArtifact;
  tamper(
    "a record whose isolation-manifest reference names another set's manifest",
    'trial-sets/P-001/record-1.json',
    (value) => (value.isolationManifestArtifact = otherManifest),
    'trial-sets/P-001/record-1.json',
    /its isolation manifest \S+trial-sets\/P-002\/isolation-manifest\.json is not its set's \S+trial-sets\/P-001\/isolation-manifest\.json/,
  );

  // Rewrites that keep every file on its schema and every reference agreeing
  // with its file: only the digests run.json recorded tell them from the run.
  const rewrite = (label, edits, expectedFile) => {
    const originals = new Map(edits.map(([relative]) => [relative, fs.readFileSync(path.join(runDirectory, relative))]));
    try {
      for (const [relative, kind, edit] of edits) {
        const file = path.join(runDirectory, relative);
        const value = readJson(file);
        edit(value);
        fs.writeFileSync(file, engine.serializeArtifact(value, kind));
      }
      fs.rmSync(log, { force: true });
      const refused = evaluate(['score', '--evaluation', folder], shimEnv);
      check(
        refused.status === 10 && refused.stdout.includes(`${expectedFile}: [run-integrity]`),
        `score over ${label} exited ${refused.status}; expected 10 naming ${expectedFile}\n${refused.output}`,
      );
      check(loggedCalls(log).length === 0, `score called the engine over ${label}`);
    } finally {
      for (const [relative, bytes] of originals) fs.writeFileSync(path.join(runDirectory, relative), bytes);
    }
  };
  rewrite(
    'a record rewritten to a pass',
    [
      [
        'trial-sets/P-002/record-1.json',
        'SealedRunRecord',
        (value) => {
          value.findings = [];
          value.evaluatorRecommendation = 'PASS';
          value.oracleDispositions = value.oracleDispositions.map((entry) => ({ ...entry, disposition: 'held' }));
        },
      ],
    ],
    'trial-sets/P-002/record-1.json',
  );
  rewrite(
    'a compiled contract edited after the run',
    [['eval-contract.json', 'EvalContract', (value) => (value.behaviors[0].severity = 'low')]],
    'eval-contract.json',
  );
  const manifestFile = path.join(runDirectory, 'trial-sets', 'P-001', 'isolation-manifest.json');
  const editedManifest = readJson(manifestFile);
  editedManifest.observedToolCalls = [];
  const editedDigest = engine.digestBytes(Buffer.from(engine.serializeArtifact(editedManifest, 'IsolationManifest')));
  rewrite(
    'an isolation manifest rewritten with its records',
    [
      ['trial-sets/P-001/isolation-manifest.json', 'IsolationManifest', (value) => (value.observedToolCalls = [])],
      ...[1, 2, 3].map((trial) => [
        `trial-sets/P-001/record-${trial}.json`,
        'SealedRunRecord',
        (value) => (value.isolationManifestArtifact = { ...value.isolationManifestArtifact, digest: editedDigest }),
      ]),
    ],
    'trial-sets/P-001/isolation-manifest.json',
  );

  // A record copied under a name the run never sealed, rewritten to a pass,
  // and named in the index in place of the one it copies: it meets its
  // schema and its references, and only its missing digest in run.json
  // tells it from the run.
  const indexPath = path.join(runDirectory, 'trial-sets.json');
  const indexBytes = fs.readFileSync(indexPath);
  const copied = path.join(runDirectory, 'trial-sets', 'P-002', 'record-9.json');
  try {
    const copy = readJson(path.join(runDirectory, 'trial-sets', 'P-002', 'record-1.json'));
    copy.findings = [];
    copy.evaluatorRecommendation = 'PASS';
    copy.oracleDispositions = copy.oracleDispositions.map((entry) => ({ ...entry, disposition: 'held' }));
    fs.writeFileSync(copied, engine.serializeArtifact(copy, 'SealedRunRecord'));
    const renamed = JSON.parse(indexBytes.toString('utf8'));
    const set = renamed.trialSets.find((entry) => entry.probeId === 'P-002');
    set.records = set.records.map((relative) =>
      relative === 'trial-sets/P-002/record-1.json' ? 'trial-sets/P-002/record-9.json' : relative,
    );
    fs.writeFileSync(indexPath, JSON.stringify(renamed));
    fs.rmSync(log, { force: true });
    const unsealed = evaluate(['score', '--evaluation', folder], shimEnv);
    check(
      unsealed.status === 10 && /trial-sets\/P-002\/record-9\.json: \[run-integrity\] has no digest in run\.json/.test(unsealed.stdout),
      `score over a record the run never sealed exited ${unsealed.status}; expected 10 saying it has no digest in run.json\n${unsealed.output}`,
    );
    check(loggedCalls(log).length === 0, 'score called the engine over a record the run never sealed');
  } finally {
    fs.writeFileSync(indexPath, indexBytes);
    fs.rmSync(copied, { force: true });
  }

  // A FIFO swapped in for a record: score refuses it at once and never waits on it.
  const fifoRecord = path.join(runDirectory, 'trial-sets', 'P-001', 'record-1.json');
  const fifoBytes = fs.readFileSync(fifoRecord);
  try {
    fs.rmSync(fifoRecord);
    const made = spawnSync('mkfifo', [fifoRecord]);
    check(made.status === 0, `mkfifo could not make a FIFO for the score case: ${made.stderr}`);
    fs.rmSync(log, { force: true });
    const fifo = evaluate(['score', '--evaluation', folder], shimEnv, [], { timeout: 30_000 });
    check(
      fifo.status === 10 && /trial-sets\/P-001\/record-1\.json: \[\S+\] .*is not a regular file the run wrote/.test(fifo.stdout),
      `score over a record swapped for a FIFO exited ${fifo.status}; expected 10 naming it as no regular file\n${fifo.output}`,
    );
    check(loggedCalls(log).length === 0, 'score called the engine over a record swapped for a FIFO');
  } finally {
    fs.rmSync(fifoRecord, { force: true });
    fs.writeFileSync(fifoRecord, fifoBytes);
  }

  // A run.json that does not say the run completed has nothing to score, its index notwithstanding.
  const runFile = path.join(runDirectory, 'run.json');
  const runBytes = fs.readFileSync(runFile);
  try {
    const { completed, outcome, ...rest } = JSON.parse(runBytes.toString('utf8'));
    check(completed === true && outcome?.exitCode === 0, `a completed run's run.json records ${JSON.stringify({ completed, outcome })}`);
    fs.writeFileSync(runFile, JSON.stringify(rest));
    const running = evaluate(['score', '--evaluation', folder], shimEnv);
    check(
      running.status === 64 && /still running or was stopped/.test(running.output),
      `score over a run whose run.json records no end exited ${running.status}; expected 64\n${running.output}`,
    );
  } finally {
    fs.writeFileSync(runFile, runBytes);
  }

  const indexFile = path.join(runDirectory, 'trial-sets.json');
  const original = fs.readFileSync(indexFile);
  try {
    const index = JSON.parse(original.toString('utf8'));
    index.schemaVersion = 2;
    fs.writeFileSync(indexFile, JSON.stringify(index));
    const other = evaluate(['score', '--evaluation', folder], shimEnv);
    check(
      other.status === 10 && /trial-sets\.json: \[schema\] \/schemaVersion/.test(other.output),
      `score over a trial-sets.json of another version exited ${other.status}; expected 10\n${other.output}`,
    );
  } finally {
    fs.writeFileSync(indexFile, original);
  }
  fs.writeFileSync(indexFile, '{ "truncated": ');
  try {
    const truncated = evaluate(['score', '--evaluation', folder], shimEnv);
    check(
      truncated.status === 10 && /trial-sets\.json: \[json\]/.test(truncated.stdout),
      `score over a truncated trial-sets.json exited ${truncated.status}; expected 10\n${truncated.output}`,
    );
  } finally {
    fs.writeFileSync(indexFile, original);
  }
  const unknown = evaluate(['score', '--evaluation', folder, '--run', 'no-such-run'], shimEnv);
  check(unknown.status === 64, `score --run naming no run exited ${unknown.status}; expected 64`);
  const escaping = evaluate(['score', '--evaluation', folder, '--run', '..'], shimEnv);
  check(escaping.status === 64, `score --run .. exited ${escaping.status}; expected 64`);
}

/** A FAIL (trial 2 of P-002 rewritten as an evaluator that saw nothing), then an Invalid (P-002's manifest omitted). */
function checkFailAndInvalid({ engine, folder, env, runDirectory }) {
  const recordFile = path.join(runDirectory, 'trial-sets', 'P-002', 'record-2.json');
  const missed = readJson(recordFile);
  missed.findings = [];
  missed.oracleDispositions = missed.oracleDispositions.map((disposition) => ({ ...disposition, disposition: 'held' }));
  const missedBytes = Buffer.from(engine.serializeArtifact(missed, 'SealedRunRecord'));
  fs.writeFileSync(recordFile, missedBytes);
  // The FAIL fixture is a run whose evaluator saw nothing in trial 2, so run.json anchors the rewritten record.
  const runFile = path.join(runDirectory, 'run.json');
  const run = readJson(runFile);
  run.artifacts.records['trial-sets/P-002/record-2.json'] = engine.digestBytes(missedBytes);
  fs.writeFileSync(runFile, `${JSON.stringify(run, null, 2)}\n`);
  const failed = evaluate(['score', '--evaluation', folder], env);
  check(failed.status === 2, `score over a missed trial exited ${failed.status}; expected 2 (FAIL)\n${failed.output}`);
  const failDirectory = latestScoreDirectory(runDirectory);
  const failEvidence = written(path.join(failDirectory, 'P-002', 'evidence-artifact.json'), "the FAIL run's P-002 evidence");
  const failVotes = (failEvidence?.reducedProbeOutcomes?.[0]?.trialVotes ?? []).map((vote) => vote.state);
  check(
    JSON.stringify(failVotes) === JSON.stringify(['caught', 'missed', 'caught']),
    `the FAIL run's votes are ${JSON.stringify(failVotes)}`,
  );
  checkDirectRerun('the FAIL run', failDirectory);
  // A FAIL leaves every probe's evidence, so the aggregate is copied and the exit stays the probe's own.
  checkAggregateRerun('the FAIL run', { engine, runDirectory, scoreDirectory: failDirectory, probeIds: ['P-001', 'P-002'] });

  // The isolation manifest omitted: Invalid, with the diagnostics kept (AD-10).
  fs.rmSync(path.join(runDirectory, 'trial-sets', 'P-002', 'isolation-manifest.json'));
  const invalid = evaluate(['score', '--evaluation', folder], env);
  check(
    invalid.status === 3,
    `score with P-002's isolation manifest omitted exited ${invalid.status}; expected 3 (Invalid)\n${invalid.output}`,
  );
  const invalidDirectory = latestScoreDirectory(runDirectory);
  const invalidCall = written(path.join(invalidDirectory, 'P-002', 'score.json'), "the Invalid run's P-002 score call");
  if (invalidCall === null) return;
  check(!invalidCall.argv.includes('--isolation-manifest'), 'score filled in an isolation manifest the trial set does not have');
  check(invalidCall.exitCode === 3, `the persisted P-002 score call exited ${invalidCall.exitCode}`);
  check(invalidCall.stderr.trim().length > 0, 'the persisted P-002 score stderr is empty, so nothing says why the trial set is Invalid');
  check(
    /P-002: eval-quality: invalid: .*isolation manifest absent/.test(invalid.output),
    `score did not report the Invalid reason:\n${invalid.output}`,
  );
  check(
    /isolation manifest absent/.test(invalidCall.stderr),
    `the persisted P-002 score stderr does not name the absent manifest: ${JSON.stringify(invalidCall.stderr)}`,
  );
  check(!fs.existsSync(path.join(invalidDirectory, 'P-002', 'evidence-artifact.json')), 'an Invalid score left an evidence artifact');
  // No evidence for a probe: no aggregate call, nothing written for one, and the summary says why.
  const invalidSummary = written(path.join(invalidDirectory, 'score.json'), "the Invalid run's score summary");
  check(
    invalidSummary?.strengthAggregate?.status === 'absent' &&
      /P-002/.test(invalidSummary.strengthAggregate.reason ?? '') &&
      invalidSummary.strengthAggregate.aggregate === null &&
      invalidSummary.strengthAggregate.call === null,
    `the Invalid run's summary records the aggregate as ${JSON.stringify(invalidSummary?.strengthAggregate)}`,
  );
  for (const name of ['strength-aggregate.json', 'strength-floors.json', 'aggregate-strength.json'])
    check(!fs.existsSync(path.join(invalidDirectory, name)), `an Invalid score left ${name}`);
}

async function checkRunAndScore() {
  // Two principal bindings reach the target in plan order, while sealed call inputs keep only labels.
  const principalReceived = [];
  const principalContract = {
    permittedInterfaces: [
      {
        logicalId: 'principal-cli',
        kind: 'cli',
        operations: [
          {
            operationId: 'send-identity',
            invocation: { executable: 'principal-cli', subcommandPath: [] },
            requestShape: {
              argument: { requiredKeys: [], permittedKeys: [], types: {} },
              option: { requiredKeys: [], permittedKeys: [], types: {} },
              environment: { requiredKeys: [], permittedKeys: [], types: {} },
              stdin: { requiredKeys: ['identity'], permittedKeys: ['identity'], types: { identity: 'string' } },
            },
          },
        ],
      },
    ],
    interactionPlan: [
      {
        stepId: 'reviewer-step',
        interfaceId: 'principal-cli',
        operationId: 'send-identity',
        after: null,
        cardinality: 'exactly-one',
        inputBinding: { argument: null, option: null, environment: null, stdin: { identity: { principal: 'reviewer' } } },
      },
      {
        stepId: 'operator-step',
        interfaceId: 'principal-cli',
        operationId: 'send-identity',
        after: null,
        cardinality: 'exactly-one',
        inputBinding: { argument: null, option: null, environment: null, stdin: { identity: { principal: 'operator' } } },
      },
    ],
  };
  const principalArm = await runArm({
    contract: principalContract,
    port: {
      probe: async (request) => {
        principalReceived.push(request.channels.stdin.value);
        return {
          request,
          observation: {
            kind: 'cli',
            exitCode: 0,
            stdout: { kind: 'text', value: '' },
            stderr: { kind: 'text', value: '' },
            artifacts: {},
          },
        };
      },
    },
    registry: {
      targetFor: () => ({ infrastructureExitCodes: [3] }),
      principalValue: (principal) => (principal === 'reviewer' ? 'reviewer-secret' : 'operator-secret'),
    },
    label: 'principal-run',
  });
  check(
    JSON.stringify(principalReceived) === JSON.stringify(['reviewer-secret', 'operator-secret']) &&
      principalArm.stepObservations['reviewer-step'].principal === 'reviewer' &&
      principalArm.stepObservations['operator-step'].principal === 'operator' &&
      !JSON.stringify(principalArm).includes('reviewer-secret') &&
      !JSON.stringify(principalArm).includes('operator-secret'),
    `principal run received ${JSON.stringify(principalReceived)} and recorded ${JSON.stringify(principalArm)}`,
  );

  const engine = await loadEngine();
  const validate = createArtifactValidator();
  // A second registry command the plan never calls, so the manifest's grants and observations differ.
  const made = makeProject('happy', {
    edit: ({ folder: evaluation }) => {
      const manifest = path.join(evaluation, 'evaluation.json');
      const value = readJson(manifest);
      value.registry.push({ ...value.registry[0], executable: 'verdict-audit' });
      fs.writeFileSync(manifest, `${JSON.stringify(value, null, 2)}\n`);
    },
  });
  const { folder, env } = made;
  const ran = evaluate(['run', '--evaluation', folder, '--seed', 'story-1.30-seed'], env);
  check(ran.status === 0, `run exited ${ran.status}; expected 0\n${ran.output}`);
  const runDirectory = runDirectoryOf(folder);
  if (runDirectory === null) return;
  const policy = readJson(path.join(folder, 'policy', 'scoring-policy.json'));
  const { index, run } = await checkRunShape({ engine, validate, ...made, runDirectory });
  if (!Array.isArray(index.trialSets)) return;
  await checkRealScore({ engine, validate, folder, env, runDirectory, index, policy, run });
  const shimEnv = checkShimmedScore({ folder, env, runDirectory, index });
  checkRefusedArtifacts({ engine, folder, runDirectory, shimEnv });
  checkFailAndInvalid({ engine, folder, env, runDirectory });
}

/** Rewrites one probe's three records and anchors the rewrite in run.json, as the FAIL fixture does; returns the undo. */
function rewriteRecords({ engine, runDirectory, probeId, edit }) {
  const runFile = path.join(runDirectory, 'run.json');
  const originalRun = fs.readFileSync(runFile);
  const originals = new Map();
  const run = JSON.parse(originalRun.toString('utf8'));
  for (const trial of [1, 2, 3]) {
    const relative = `trial-sets/${probeId}/record-${trial}.json`;
    const file = path.join(runDirectory, relative);
    originals.set(file, fs.readFileSync(file));
    const record = readJson(file);
    edit(record);
    const bytes = Buffer.from(engine.serializeArtifact(record, 'SealedRunRecord'));
    fs.writeFileSync(file, bytes);
    run.artifacts.records[relative] = engine.digestBytes(bytes);
  }
  fs.writeFileSync(runFile, `${JSON.stringify(run, null, 2)}\n`);
  return () => {
    for (const [file, bytes] of originals) fs.writeFileSync(file, bytes);
    fs.writeFileSync(runFile, originalRun);
  };
}

/** Rewrites the run's scoring policy copy and anchors it in run.json; returns the undo. */
function rewritePolicy({ engine, runDirectory, edit }) {
  const runFile = path.join(runDirectory, 'run.json');
  const policyFile = path.join(runDirectory, 'scoring-policy.json');
  const originalRun = fs.readFileSync(runFile);
  const originalPolicy = fs.readFileSync(policyFile);
  const policy = JSON.parse(originalPolicy.toString('utf8'));
  edit(policy);
  const bytes = Buffer.from(engine.serializeArtifact(policy, 'ScoringPolicy'));
  fs.writeFileSync(policyFile, bytes);
  const run = JSON.parse(originalRun.toString('utf8'));
  run.policyDigest = engine.digestBytes(bytes);
  fs.writeFileSync(runFile, `${JSON.stringify(run, null, 2)}\n`);
  return () => {
    fs.writeFileSync(policyFile, originalPolicy);
    fs.writeFileSync(runFile, originalRun);
  };
}

/**
 * Four more seeded defect probes beside the fixture's P-002 and clean control P-001: P-003 to P-006, each its own
 * mutation (M-002 to M-005 relax `gate-2` to `gate-5` in the policy) and its own witness, which the verdict command's
 * `relaxed: gate-<n>` line tells apart. The floor starts at 0.75.
 */
function addDefectProbes({ project, folder }) {
  fs.writeFileSync(
    path.join(project, 'rules', 'policy.txt'),
    `mode: strict\n${[2, 3, 4, 5].map((gate) => `gate-${gate}: strict\n`).join('')}`,
  );
  const base = JSON.stringify(readJson(path.join(folder, 'probes', 'P-002.probe.json')));
  const mutation = readJson(path.join(folder, 'mutations', 'M-001.mutation.json'));
  for (const gate of [2, 3, 4, 5]) {
    const number = String(gate + 1).padStart(3, '0');
    const mutationId = `M-${String(gate).padStart(3, '0')}`;
    const probe = JSON.parse(
      base.replaceAll('manifest-lenient', `manifest-lenient-${gate}`).replaceAll('verdict: rejected', `relaxed: gate-${gate}`),
    );
    probe.probeId = `P-${number}`;
    probe.defects[0].defectId = `D-${number}`;
    probe.qualification.mutation = mutationId;
    probe.rationale = `Seeded defect: ${mutationId} relaxes gate-${gate}, and the verdict command then reports it.`;
    fs.writeFileSync(path.join(folder, 'probes', `${probe.probeId}.probe.json`), `${JSON.stringify(probe, null, 2)}\n`);
    fs.writeFileSync(
      path.join(folder, 'mutations', `${mutationId}.mutation.json`),
      `${JSON.stringify(
        {
          ...mutation,
          mutationId,
          mutationSource: `rules/policy.txt: gate-${gate} relaxed to lenient`,
          operator: { ...mutation.operator, find: `gate-${gate}: strict`, replace: `gate-${gate}: lenient` },
        },
        null,
        2,
      )}\n`,
    );
  }
  editJson(path.join(folder, 'evaluation.json'), (evaluation) => (evaluation.strengthFloor = { defect: 0.75 }));
}

/** The decision and basis the aggregate states for each class, as `class:decision/basis`. */
function decisionsOf(aggregate) {
  return Object.entries(aggregate.floorDecisions).map(([name, { decision, basis }]) => `${name}:${decision}/${basis}`);
}

/**
 * The run-wide strength aggregate (Story 1.45), over the real engine. Five qualified defect probes beside a clean
 * control, P-006 left uncaught in every trial; every number asserted here is the engine's, and TeA only copied it.
 */
async function checkStrengthAggregate() {
  const engine = await loadEngine();
  const validate = createArtifactValidator();
  const made = makeProject('strength', { edit: addDefectProbes });
  const { folder, env } = made;
  const uncaught = ['trial-mutated-M-005-1', 'trial-mutated-M-005-2', 'trial-mutated-M-005-3'].join(',');
  const ran = evaluate(['run', '--evaluation', folder, '--seed', 'story-1.45'], { ...env, VERDICT_WHEN: uncaught, VERDICT_DO: 'accept' });
  check(ran.status === 0, `the five-probe run exited ${ran.status}; expected 0\n${ran.output}`);
  const runDirectory = runDirectoryOf(folder);
  if (runDirectory === null) return;
  const probeIds = ['P-001', 'P-002', 'P-003', 'P-004', 'P-005', 'P-006'];
  const floors = (value) => editJson(path.join(folder, 'evaluation.json'), (evaluation) => (evaluation.strengthFloor = value));
  const score = (extra = {}, expected = 2) => {
    const result = evaluate(['score', '--evaluation', folder], { ...env, ...extra });
    check(result.status === expected, `score exited ${result.status}; expected ${expected}\n${result.output}`);
    const scoreDirectory = latestScoreDirectory(runDirectory);
    return { result, scoreDirectory, summary: written(path.join(scoreDirectory, 'score.json'), 'the score summary')?.strengthAggregate };
  };

  // Four of five caught meets the 0.75 floor; the exit is the uncaught probe's own FAIL, and the floor never moves it.
  const first = score();
  const aggregate = checkAggregateRerun('the 0.75 floor', { engine, runDirectory, scoreDirectory: first.scoreDirectory, probeIds });
  if (aggregate === null) return;
  for (const problem of await validate('strength-aggregate', aggregate))
    check(false, `the aggregate fails its published schema: ${problem}`);
  check(
    JSON.stringify(aggregate.classes.defect) === JSON.stringify({ caught: 4, comparable: true, eligible: 5, exercised: 5, rate: 0.8 }) &&
      aggregate.classes.gameability === null &&
      aggregate.classes['zero-action'] === null,
    `the aggregate counts ${JSON.stringify(aggregate.classes)}`,
  );
  check(
    JSON.stringify(aggregate.floorDecisions.defect) === JSON.stringify({ basis: 'rate-meets-floor', decision: 'meets', floor: 0.75 }),
    `four of five against a 0.75 floor reads ${JSON.stringify(aggregate.floorDecisions.defect)}`,
  );
  check(
    aggregate.inputs.map((input) => `${input.probeId}:${input.probeClass}`).join(',') ===
      'P-001:null,P-002:defect,P-003:defect,P-004:defect,P-005:defect,P-006:defect',
    `the aggregate's inputs are ${JSON.stringify(aggregate.inputs)}; the clean control must stay outside every class`,
  );
  check(
    first.summary?.status === 'copied' && first.summary.exitCode === 0 && first.summary.partition === 'both',
    `the summary records ${JSON.stringify(first.summary)}`,
  );
  const pointers = ['partitions.json', 'interpretation.json'].map((name) => readJson(path.join(runDirectory, name)).strengthAggregate);
  check(
    pointers.every(
      (pointer) =>
        pointer.status === 'copied' && pointer.digest === first.summary.aggregateDigest && pointer.path === first.summary.aggregate,
    ),
    `the views point at ${JSON.stringify(pointers)}, not at the copied aggregate`,
  );

  // The same evidence at 0.9 does not meet it. The counts and every input digest stay, the decision flips, the exit holds.
  floors({ defect: 0.9 });
  const second = score();
  const stricter = checkAggregateRerun('the 0.9 floor', { engine, runDirectory, scoreDirectory: second.scoreDirectory, probeIds });
  if (stricter !== null) {
    check(
      JSON.stringify(stricter.floorDecisions.defect) ===
        JSON.stringify({ basis: 'rate-below-floor', decision: 'does-not-meet', floor: 0.9 }),
      `four of five against a 0.9 floor reads ${JSON.stringify(stricter.floorDecisions.defect)}`,
    );
    check(
      JSON.stringify(stricter.classes) === JSON.stringify(aggregate.classes) &&
        JSON.stringify(stricter.inputs.map((input) => input.artifactDigest)) ===
          JSON.stringify(aggregate.inputs.map((input) => input.artifactDigest)),
      'the 0.9 floor changed the counts or the evidence digests of the same evidence',
    );
  }

  // Declared floors read per class: no floor is undeclared, a floor with no eligible probe does not meet. The clean control
  // declares class zero-action and still counts for none.
  floors({ 'zero-action': 1 });
  const absentClass = score();
  const classes = checkAggregateRerun('the zero-action floor', {
    engine,
    runDirectory,
    scoreDirectory: absentClass.scoreDirectory,
    probeIds,
  });
  check(
    classes !== null &&
      classes.classes['zero-action'] === null &&
      decisionsOf(classes).join(',') ===
        'defect:undeclared/no-floor-declared,gameability:undeclared/no-floor-declared,zero-action:does-not-meet/no-eligible-probe',
    `a floor on a class with no eligible probe reads ${JSON.stringify(classes?.floorDecisions)}`,
  );
  floors({});
  const noFloors = score();
  const undeclared = checkAggregateRerun('no floors', { engine, runDirectory, scoreDirectory: noFloors.scoreDirectory, probeIds });
  check(
    undeclared !== null && decisionsOf(undeclared).every((decision) => decision.endsWith('undeclared/no-floor-declared')),
    `declaring no floor reads ${JSON.stringify(undeclared?.floorDecisions)}`,
  );
  floors({ defect: 0.75 });

  // Some, not all, eligible probes unexercised: the floor is not met whatever the rate over the others.
  const restoreUnexercised = rewriteRecords({
    engine,
    runDirectory,
    probeId: 'P-004',
    edit: (record) => {
      // The evaluator saw nothing and attempted no oracle: the step never ran.
      record.observations = [];
      record.findings = [];
      record.oracleDispositions = [{ oracleId: 'O-001', disposition: 'not-attempted', observationIds: [], note: 'the step never ran' }];
    },
  });
  const partial = score();
  const unexercised = checkAggregateRerun('one unexercised probe', {
    engine,
    runDirectory,
    scoreDirectory: partial.scoreDirectory,
    probeIds,
  });
  check(
    unexercised !== null &&
      JSON.stringify(unexercised.classes.defect) ===
        JSON.stringify({ caught: 3, comparable: true, eligible: 5, exercised: 4, rate: 0.75 }) &&
      unexercised.floorDecisions.defect.basis === 'unexercised-probe' &&
      unexercised.floorDecisions.defect.decision === 'does-not-meet',
    `an unexercised probe reads ${JSON.stringify(unexercised?.classes.defect)} and ${JSON.stringify(unexercised?.floorDecisions.defect)}`,
  );
  restoreUnexercised();

  // A probe with no evidence artifact: its score is Invalid, no aggregate call is made and the summary says why.
  const manifest = path.join(runDirectory, 'trial-sets', 'P-004', 'isolation-manifest.json');
  const manifestBytes = fs.readFileSync(manifest);
  fs.rmSync(manifest);
  const scoreLog = path.join(tempDir('strength-absent'), 'score.log');
  const aggregateLog = path.join(path.dirname(scoreLog), 'aggregate.log');
  const raced = (mode, extra = {}) => ({
    [ENGINE_CLI_ENV]: RACE_ENGINE,
    TEA_RACE_LOG: scoreLog,
    TEA_RACE_AGGREGATE_LOG: aggregateLog,
    TEA_RACE_MODE: '',
    TEA_RACE_AGGREGATE: mode,
    TEA_RACE_TARGET: path.dirname(scoreLog),
    ...extra,
  });
  const absent = score(raced(''), 3);
  fs.writeFileSync(manifest, manifestBytes);
  check(
    loggedCalls(scoreLog).length === probeIds.length && loggedCalls(aggregateLog).length === 0,
    `a probe with no evidence made ${loggedCalls(scoreLog).length} score call(s) and ${loggedCalls(aggregateLog).length} aggregate call(s); expected ${probeIds.length} and 0`,
  );
  check(
    absent.summary?.status === 'absent' &&
      /P-004/.test(absent.summary.reason ?? '') &&
      absent.summary.aggregate === null &&
      absent.summary.floors === null &&
      readJson(path.join(runDirectory, 'partitions.json')).strengthAggregate.status === 'absent',
    `an absent aggregate is recorded as ${JSON.stringify(absent.summary)}`,
  );
  for (const name of ['strength-aggregate.json', 'strength-floors.json', 'aggregate-strength.json'])
    check(!fs.existsSync(path.join(absent.scoreDirectory, name)), `a score with a probe lacking evidence left ${name}`);

  // No strengthFloor in evaluation.json: the aggregate is absent with the reason, no floors copy or aggregate call is made, and the score exits as the probes alone.
  editJson(path.join(folder, 'evaluation.json'), (evaluation) => delete evaluation.strengthFloor);
  const undeclaredFloor = score(raced(''), 2);
  floors({ defect: 0.75 });
  check(
    undeclaredFloor.summary?.status === 'absent' &&
      /strengthFloor/.test(undeclaredFloor.summary.reason ?? '') &&
      undeclaredFloor.summary.floors === null &&
      undeclaredFloor.summary.aggregate === null,
    `a score with no strengthFloor is recorded as ${JSON.stringify(undeclaredFloor.summary)}`,
  );
  for (const name of ['strength-aggregate.json', 'strength-floors.json', 'aggregate-strength.json'])
    check(!fs.existsSync(path.join(undeclaredFloor.scoreDirectory, name)), `a score with no strengthFloor left ${name}`);
  check(
    loggedCalls(aggregateLog).length === 0,
    `a score with no strengthFloor made ${loggedCalls(aggregateLog).length} aggregate call(s); expected 0`,
  );

  // The engine refuses the set: exit 5 for a floor outside the classes it admits. Nothing is copied and the exit joins the
  // most severe combination (5 beats the FAIL's 2) because the held bytes give the same refusal.
  floors({ canary: 1 });
  const canary = score({}, 5);
  floors({ defect: 0.75 });
  check(
    canary.summary?.status === 'refused' &&
      canary.summary.exitCode === 5 &&
      !fs.existsSync(path.join(canary.scoreDirectory, 'strength-aggregate.json')),
    `a canary floor the engine refuses is recorded as ${JSON.stringify(canary.summary)}`,
  );
  // An evidence file that contradicts itself under the aggregate's read is a persisted file a process rewrote, not a set the
  // engine refused: the held bytes give an aggregate, so the run exits 12 (Story 1.68) and copies none.
  const contradicted = score(raced('inconsistent-evidence'), 12);
  check(
    contradicted.summary?.status === 'failed' &&
      /no longer holds the bytes the runtime wrote/.test(contradicted.summary.reason ?? '') &&
      !fs.existsSync(path.join(contradicted.scoreDirectory, 'strength-aggregate.json')),
    `an evidence file rewritten under the aggregate is recorded as ${JSON.stringify(contradicted.summary)}`,
  );

  // A persisted evidence file that changed, or an aggregate that does not match what was persisted, is copied nowhere and exits 12.
  for (const [mode, pattern, status] of [
    ['tamper-evidence', /records evidence digest .* for P-001/, 'mismatch'],
    ['forge-digest', /records evidence digest sha256:0{64} for P-001/, 'mismatch'],
    ['forge-probes', /covers probes .*, and this invocation scored/, 'mismatch'],
    ['forge-engine', /names engine 0\.0\.1, not the .* run\.json recorded/, 'mismatch'],
    ['forge-floor', /records floor 0\.5 for defect, and evaluation\.json declares 0\.75/, 'mismatch'],
    ['swap-floors', /records floor 0\.1 for defect, and evaluation\.json declares 0\.75/, 'mismatch'],
    ['tamper-floors', /strength-floors\.json no longer holds the bytes the runtime wrote/, 'failed'],
    ['forge-schema', /fails its published schema/, 'mismatch'],
    ['garbage', /is not JSON/, 'mismatch'],
    ['stage-link', /link or a non-file entry/, 'failed'],
  ]) {
    const forged = score(raced(mode), 12);
    check(
      forged.summary?.status === status &&
        pattern.test(forged.summary.reason ?? '') &&
        forged.summary.aggregate === null &&
        forged.summary.floors !== null &&
        forged.summary.call !== null &&
        !fs.existsSync(path.join(forged.scoreDirectory, 'strength-aggregate.json')) &&
        /strength aggregate: /.test(forged.result.output),
      `${mode}: the summary records ${JSON.stringify(forged.summary)}`,
    );
  }
  // A file planted where the aggregate is copied is refused by the held writer: the summary keeps the call and the floors that were written.
  const sentinel = path.join(tempDir('strength-plant'), 'sentinel.txt');
  fs.writeFileSync(sentinel, 'outside\n');
  const planted = score(raced('plant-aggregate', { TEA_RACE_SENTINEL: sentinel }), 12);
  check(
    planted.summary?.status === 'failed' &&
      /strength-aggregate\.json, which the runtime did not write/.test(planted.summary.reason ?? '') &&
      planted.summary.call !== null &&
      planted.summary.floors !== null &&
      planted.summary.aggregate === null &&
      fs.readFileSync(sentinel, 'utf8') === 'outside\n',
    `a planted aggregate is recorded as ${JSON.stringify(planted.summary)}`,
  );
  check(
    fs.readdirSync(env.TMPDIR).length === 0,
    `the aggregate runs left ${JSON.stringify(fs.readdirSync(env.TMPDIR))} in the run's temp directory`,
  );
}

/**
 * The null and non-comparable readings, each from one engine call over the fixture's clean control and one defect probe:
 * a class with no eligible probe is `null`, an admitted class with no exercised probe has `rate: null`, and a trial set
 * below the policy's `minimumTrialCount` is not comparable, each distinct from the others.
 */
async function checkAggregateStates() {
  const engine = await loadEngine();
  const { folder, env } = makeProject('states');
  const ran = evaluate(['run', '--evaluation', folder, '--seed', 'story-1.45-states'], env);
  check(ran.status === 0, `the states run exited ${ran.status}; expected 0\n${ran.output}`);
  const runDirectory = runDirectoryOf(folder);
  if (runDirectory === null) return;
  const probeIds = ['P-001', 'P-002'];
  const read = (label) => {
    const scored = evaluate(['score', '--evaluation', folder], env);
    check(scored.status === 0, `${label}: score exited ${scored.status}; expected 0\n${scored.output}`);
    return checkAggregateRerun(label, { engine, runDirectory, scoreDirectory: latestScoreDirectory(runDirectory), probeIds });
  };
  const shape = (aggregate) => ({
    defect: JSON.stringify(aggregate?.classes.defect),
    zeroAction: JSON.stringify(aggregate?.classes['zero-action']),
    decisions: aggregate === null ? '' : decisionsOf(aggregate).join(','),
  });

  const measured = shape(read('a measured class'));
  check(
    measured.defect === JSON.stringify({ caught: 1, comparable: true, eligible: 1, exercised: 1, rate: 1 }) &&
      measured.zeroAction === 'null' &&
      measured.decisions ===
        'defect:meets/rate-meets-floor,gameability:undeclared/no-floor-declared,zero-action:does-not-meet/no-eligible-probe',
    `a measured class and a class with no eligible probe read ${JSON.stringify(measured)}`,
  );

  // The policy asks for more trials than the set holds: the class stays measured and stops being comparable.
  const restorePolicy = rewritePolicy({ engine, runDirectory, edit: (policy) => (policy.minimumTrialCount = 4) });
  const short = shape(read('a trial set below the minimum'));
  restorePolicy();
  check(
    short.defect === JSON.stringify({ caught: 1, comparable: false, eligible: 1, exercised: 1, rate: 1 }) &&
      short.decisions.startsWith('defect:does-not-meet/not-comparable,'),
    `a trial set below minimumTrialCount reads ${JSON.stringify(short)}`,
  );

  // The only defect probe is never exercised: the class exists with rate null, which is not the null of a class with no probe.
  const restoreRecords = rewriteRecords({
    engine,
    runDirectory,
    probeId: 'P-002',
    edit: (record) => {
      // The evaluator saw nothing and attempted no oracle: the step never ran.
      record.observations = [];
      record.findings = [];
      record.oracleDispositions = [{ oracleId: 'O-001', disposition: 'not-attempted', observationIds: [], note: 'the step never ran' }];
    },
  });
  const idle = shape(read('an admitted class with no exercised probe'));
  restoreRecords();
  check(
    idle.defect === JSON.stringify({ caught: 0, comparable: true, eligible: 1, exercised: 0, rate: null }) &&
      idle.decisions.startsWith('defect:does-not-meet/no-exercised-probe,'),
    `an admitted class with no exercised probe reads ${JSON.stringify(idle)}`,
  );
}

/** Target reports survive trial boundaries, exact sums, and the distinction between zero and absent telemetry. */
function checkTargetUsageReports() {
  const runner = spawnSync(
    process.execPath,
    [
      path.join(PROJECT_ROOT, 'cli', 'skill-runner.js'),
      '--skill-root',
      'test/fixtures/evaluate/stub-agent/skill',
      '--agent',
      'custom',
      '--agent-cmd',
      process.execPath,
      '--agent-arg',
      path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'stub-agent', 'agent.js'),
    ],
    {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      input: 'STUB-USAGE {"inputTokens":2,"outputTokens":3,"costUsd":"0.01"}',
      timeout: 30_000,
    },
  );
  check(
    runner.status === 0 && /skill: stub-skill/.test(runner.stdout) && /TEA_EVALUATE_USAGE_JSON:\{"inputTokens":2/.test(runner.stderr),
    `skill runner did not preserve answer and emit usage: ${runner.status} ${runner.stdout} ${runner.stderr}`,
  );
  for (const [name, report] of [
    ['fractional tokens', '{"inputTokens":1.5,"outputTokens":2,"costUsd":"0"}'],
    ['overflowing tokens', '{"inputTokens":9007199254740992,"outputTokens":2,"costUsd":"0"}'],
    ['malformed JSON', '{'],
    ['negative cost', '{"inputTokens":1,"outputTokens":2,"costUsd":"-1"}'],
    ['overflowing cost', '{"inputTokens":1,"outputTokens":2,"costUsd":"9007199254740992"}'],
  ]) {
    let refusal = null;
    try {
      parseUsageReport(`TEA_EVALUATE_USAGE_JSON:${report}\n`, name);
    } catch (error) {
      refusal = error;
    }
    check(refusal instanceof Error && /target usage report/.test(refusal.message), `${name} was not rejected as an invalid report`);
  }
  const claude = agentReplyAndUsage(
    'claude',
    JSON.stringify({ result: 'answer', usage: { input_tokens: 2, cache_read_input_tokens: 3, output_tokens: 4 }, total_cost_usd: 7e-7 }),
    '',
  );
  check(
    claude.stdout === 'answer' &&
      claude.usage?.inputTokens === 5 &&
      claude.usage?.outputTokens === 4 &&
      claude.usage?.costUsd === '0.0000007',
    `claude adapter translated ${JSON.stringify(claude)}`,
  );
  const codex = agentReplyAndUsage(
    'codex',
    [
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'reply' } }),
      JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 8, output_tokens: 9 } }),
    ].join('\n'),
    '',
  );
  check(codex.stdout === 'reply' && codex.usage === null, 'codex token-only report was claimed as a complete cost report');
  const known = { inputTokens: 7, outputTokens: 11, costUsd: '0.00125' };
  const reported = makeProject('usage-reported', {
    edit: ({ folder }) => {
      const file = path.join(folder, 'contract.json');
      const contract = readJson(file);
      contract.interactionPlan.push({ ...contract.interactionPlan[0], stepId: 'judge-again', after: 'judge-run' });
      fs.writeFileSync(file, `${JSON.stringify(contract, null, 2)}\n`);
    },
  });
  const measured = evaluate(['run', '--evaluation', reported.folder], {
    ...reported.env,
    VERDICT_USAGE: JSON.stringify(known),
  });
  check(measured.status === 0, `reported usage run exited ${measured.status}: ${measured.output}`);
  const measuredDirectory = runDirectoryOf(reported.folder);
  check(measuredDirectory !== null, 'reported usage run did not write a run directory');
  if (measuredDirectory !== null) {
    const run = readJson(path.join(measuredDirectory, 'run.json'));
    const firstEvidence = readJson(path.join(measuredDirectory, 'trials', 'clean', 'trial-1.json'));
    check(
      run.unreportedResourceUse?.length === 0,
      `reported usage was marked unreported: ${JSON.stringify(run.unreportedResourceUse)}; first stderr: ${JSON.stringify(firstEvidence.steps?.[0]?.observation?.stderr)}; environment: ${JSON.stringify(firstEvidence.steps?.[0]?.request?.channels?.environment)}`,
    );
    const index = readJson(path.join(measuredDirectory, 'trial-sets.json'));
    for (const set of index.trialSets) {
      const manifest = readJson(path.join(measuredDirectory, set.isolationManifest));
      check(
        manifest.actualResourceUse?.inputTokens === 42 &&
          manifest.actualResourceUse?.outputTokens === 66 &&
          manifest.actualResourceUse?.costUsd === '0.0075',
        `${set.probeId} usage sum is ${JSON.stringify(manifest.actualResourceUse)}`,
      );
      for (const file of set.records) {
        const record = readJson(path.join(measuredDirectory, file));
        check(
          record.resourceUse?.inputTokens === 14 && record.resourceUse?.outputTokens === 22 && record.resourceUse?.costUsd === '0.0025',
          `${file} usage is ${JSON.stringify(record.resourceUse)}`,
        );
      }
    }
  }

  for (const [name, report, missing] of [
    ['usage-unreported', undefined, true],
    ['usage-zero', JSON.stringify({ inputTokens: 0, outputTokens: 0, costUsd: '0' }), false],
  ]) {
    const made = makeProject(name);
    const outcome = evaluate(['run', '--evaluation', made.folder], {
      ...made.env,
      ...(report === undefined ? {} : { VERDICT_USAGE: report }),
    });
    check(outcome.status === 0, `${name} exited ${outcome.status}: ${outcome.output}`);
    const directory = runDirectoryOf(made.folder);
    check(directory !== null, `${name} did not write a run directory`);
    if (directory === null) continue;
    const run = readJson(path.join(directory, 'run.json'));
    check(
      run.unreportedResourceUse.every(
        (entry) =>
          typeof entry.conditionArm === 'string' &&
          Number.isInteger(entry.trialIndex) &&
          entry.trialIndex > 0 &&
          Array.isArray(entry.stepIds) &&
          entry.stepIds.length > 0 &&
          entry.stepIds.every((stepId) => typeof stepId === 'string'),
      ),
      `${name} unreported marker has an invalid shape: ${JSON.stringify(run.unreportedResourceUse)}`,
    );
    check(
      missing ? run.unreportedResourceUse?.length === 6 : run.unreportedResourceUse?.length === 0,
      `${name} unreported marker is ${JSON.stringify(run.unreportedResourceUse)}`,
    );
  }

  const invalid = makeProject('usage-invalid');
  const failed = evaluate(['run', '--evaluation', invalid.folder], {
    ...invalid.env,
    VERDICT_USAGE: JSON.stringify(known),
    VERDICT_WHEN: 'trial-clean-1',
    VERDICT_USAGE_BAD: '{"inputTokens":-1,"outputTokens":2,"costUsd":"0"}',
  });
  check(
    failed.status === 12 && /target usage report.*inputTokens/.test(failed.output),
    `invalid usage ended ${failed.status}: ${failed.output}`,
  );
  const failedDirectory = runDirectoryOf(invalid.folder);
  if (failedDirectory !== null) {
    check(!fs.existsSync(path.join(failedDirectory, 'trial-sets.json')), 'invalid usage sealed a trial set');
    check(!fs.existsSync(path.join(failedDirectory, 'trial-sets')), 'invalid usage sealed measured-zero records');
  }

  const reference = fs.readFileSync(path.join(PROJECT_ROOT, 'docs', 'reference', 'tea-evaluate-cli.md'), 'utf8');
  const runSection = reference.split(/^## run\s*$/m)[1]?.split(/^## /m)[0] ?? '';
  check(
    /TEA_EVALUATE_USAGE_JSON/.test(runSection) && /unreportedResourceUse/.test(runSection) && /stderr/.test(runSection),
    'the exact ## run section must explain the target report source and unreported marker',
  );
}

/** A trial that exits an infrastructure code yields no record, and the run exits 12; so does a target writing into the project mid-trial. */
function checkStoppedRuns() {
  const infra = makeProject('infra');
  const ran = evaluate(['run', '--evaluation', infra.folder], {
    ...infra.env,
    VERDICT_WHEN: 'trial-clean-2',
    VERDICT_DO: 'infrastructure',
  });
  check(ran.status === 12, `a run whose second clean trial exits an infrastructure code exited ${ran.status}; expected 12\n${ran.output}`);
  check(/trial-clean-2 yields no record/.test(ran.output), `the run did not say the trial yields no record:\n${ran.output}`);
  const runDirectory = runDirectoryOf(infra.folder);
  if (runDirectory !== null) {
    check(!fs.existsSync(path.join(runDirectory, 'trial-sets.json')), 'a run with an infrastructure trial wrote trial-sets.json');
    check(!fs.existsSync(path.join(runDirectory, 'trial-sets')), 'a run with an infrastructure trial wrote records');
    const evidence = written(path.join(runDirectory, 'trials', 'clean', 'trial-2.json'), 'the infrastructure trial');
    check(/infrastructure exit code/.test(evidence?.fault?.message ?? ''), 'the infrastructure trial left no fault evidence');
    check(
      fs.existsSync(path.join(runDirectory, 'trials', 'clean', 'trial-1.json')),
      'the trial before the infrastructure trial left no evidence',
    );
  }
  const scored = evaluate(['score', '--evaluation', infra.folder], infra.env);
  check(
    scored.status === 64 && /did not complete/.test(scored.output) && /trial stage with exit 12/.test(scored.output),
    `score over a run that stopped exited ${scored.status}; expected 64 naming where it stopped\n${scored.output}`,
  );
  const stoppedRun = runDirectory === null ? {} : (written(path.join(runDirectory, 'run.json'), "the stopped run's run.json") ?? {});
  check(
    stoppedRun.completed === false && stoppedRun.outcome?.exitCode === 12,
    `a stopped run's run.json records ${JSON.stringify({ completed: stoppedRun.completed, outcome: stoppedRun.outcome })}`,
  );

  // A signal ends P-002's first qualification arm: the arm executor every trial shares stops as it would in a trial.
  const killed = makeProject('killed');
  const signalled = evaluate(['run', '--evaluation', killed.folder], { ...killed.env, VERDICT_WHEN: 'qualify-P-002', VERDICT_DO: 'kill' });
  check(
    signalled.status === 12 && /stopped by a signal from outside/.test(signalled.output),
    `a run whose target a signal ended exited ${signalled.status}; expected 12\n${signalled.output}`,
  );
  const killedRun = runDirectoryOf(killed.folder);
  check(killedRun === null || !fs.existsSync(path.join(killedRun, 'probes.json')), 'a run whose target a signal ended qualified its probe');

  const failing = makeProject('preflight-fails');
  const shimLog = path.join(tempDir('preflight-shim'), 'argv.log');
  const stopped = evaluate(['run', '--evaluation', failing.folder], {
    ...failing.env,
    [ENGINE_CLI_ENV]: SHIM,
    TEA_EVALUATE_SHIM_LOG: shimLog,
    TEA_EVALUATE_SHIM_EXIT_PREFLIGHT: '3',
  });
  check(
    stopped.status === 3 && /no trial ran/.test(stopped.output),
    `a run whose preflight verdict failed exited ${stopped.status}; expected 3 with no trial\n${stopped.output}`,
  );
  const failingRun = runDirectoryOf(failing.folder);
  check(failingRun === null || !fs.existsSync(path.join(failingRun, 'trials')), 'a run whose preflight verdict failed ran trials');

  const touched = makeProject('touch', { unconfined: true });
  const touch = path.join(touched.project, 'rules', 'touched.txt');
  const wrote = evaluate(['run', '--evaluation', touched.folder], {
    ...touched.env,
    VERDICT_WHEN: 'trial-clean-1',
    VERDICT_DO: 'touch',
    VERDICT_TOUCH: touch,
  });
  check(wrote.status === 12, `a run whose trial wrote into the project exited ${wrote.status}; expected 12\n${wrote.output}`);
  check(/changed during the trials/.test(wrote.output), `the run did not say the project changed during the trials:\n${wrote.output}`);
  const touchedRun = runDirectoryOf(touched.folder);
  check(
    touchedRun === null || !fs.existsSync(path.join(touchedRun, 'trial-sets.json')),
    'a run whose trial wrote into the project wrote trial-sets.json',
  );
  check(
    touchedRun === null || !fs.existsSync(path.join(touchedRun, 'trials', 'clean', 'trial-2.json')),
    'a run whose first trial wrote into the project ran another trial',
  );

  // A target that plants a link in the run directory where a record would go:
  // the run stops before any trial set is written, and the adopter's tree,
  // where the link points, is never written.
  const planted = makeProject('plant', { unconfined: true });
  const policyFile = path.join(planted.project, 'rules', 'policy.txt');
  const policyBytes = fs.readFileSync(policyFile);
  const plantedRun = evaluate(['run', '--evaluation', planted.folder], {
    ...planted.env,
    VERDICT_WHEN: 'trial-clean-1',
    VERDICT_DO: 'plant',
    VERDICT_TOUCH: policyFile,
  });
  check(
    plantedRun.status === 12 && /trial-sets is an entry the runtime did not write/.test(plantedRun.output),
    `a run whose target planted a link in its run directory exited ${plantedRun.status}; expected 12 naming the entry\n${plantedRun.output}`,
  );
  check(fs.readFileSync(policyFile).equals(policyBytes), 'a run wrote through the link its target planted into the adopter tree');
  check(
    git(planted.repository, ['status', '--porcelain']).toString().trim() === '',
    `the adopter's tree changed under a planted link: ${git(planted.repository, ['status', '--porcelain'])}`,
  );
  const plantedDirectory = runDirectoryOf(planted.folder);
  if (plantedDirectory !== null) {
    check(
      !fs.existsSync(path.join(plantedDirectory, 'trial-sets.json')),
      'a run whose directory held a planted link wrote trial-sets.json',
    );
    const plantedRecord = written(path.join(plantedDirectory, 'run.json'), "the planted run's run.json") ?? {};
    check(
      plantedRecord.completed === false && plantedRecord.outcome?.exitCode === 12,
      `a run whose directory held a planted link records ${JSON.stringify({ completed: plantedRecord.completed, outcome: plantedRecord.outcome })}`,
    );
  }

  // A target that rewrites the compiled contract in the run directory: the run stops before any trial set names it.
  const forged = makeProject('forge', { unconfined: true });
  const forgedRun = evaluate(['run', '--evaluation', forged.folder], { ...forged.env, VERDICT_WHEN: 'trial-clean-1', VERDICT_DO: 'forge' });
  check(
    forgedRun.status === 12 && /eval-contract\.json no longer holds the bytes the runtime wrote/.test(forgedRun.output),
    `a run whose target rewrote the compiled contract exited ${forgedRun.status}; expected 12 naming it\n${forgedRun.output}`,
  );
  const forgedDirectory = runDirectoryOf(forged.folder);
  check(
    forgedDirectory === null || !fs.existsSync(path.join(forgedDirectory, 'trial-sets')),
    'a run whose compiled contract was rewritten wrote trial sets',
  );

  // The last verification fails after the index was written: the run ends
  // incomplete, its index retracted, and score refuses it.
  const unsealed = makeProject('unsealed');
  const unsealedRun = evaluate(
    ['run', '--evaluation', unsealed.folder],
    { ...unsealed.env, TEA_EVALUATE_VERIFY_AT: 'after the trial sets were sealed', TEA_EVALUATE_VERIFY_DO: 'fail' },
    ['--require', WRAP_RUN_DIRECTORY],
  );
  check(unsealedRun.status === 12, `a run whose last verification failed exited ${unsealedRun.status}; expected 12\n${unsealedRun.output}`);
  const unsealedDirectory = runDirectoryOf(unsealed.folder);
  if (unsealedDirectory !== null) {
    const unsealedRecord = written(path.join(unsealedDirectory, 'run.json'), "the unsealed run's run.json") ?? {};
    check(
      unsealedRecord.completed === false && unsealedRecord.outcome?.stage === 'run-directory' && unsealedRecord.outcome?.exitCode === 12,
      `a run whose last verification failed records ${JSON.stringify({ completed: unsealedRecord.completed, outcome: unsealedRecord.outcome })}`,
    );
    check(!fs.existsSync(path.join(unsealedDirectory, 'trial-sets.json')), 'a run whose last verification failed kept trial-sets.json');
  }
  const unsealedScore = evaluate(['score', '--evaluation', unsealed.folder], unsealed.env);
  check(
    unsealedScore.status === 64,
    `score over a run that did not seal exited ${unsealedScore.status}; expected 64\n${unsealedScore.output}`,
  );

  // The project changes while the trial sets are sealed, after the last
  // trial's read: the read before run.json says completed stops the run.
  const sealing = makeProject('sealing-touch');
  const sealingRun = evaluate(
    ['run', '--evaluation', sealing.folder],
    {
      ...sealing.env,
      TEA_EVALUATE_VERIFY_AT: 'after the trials',
      TEA_EVALUATE_VERIFY_DO: 'touch',
      TEA_EVALUATE_VERIFY_FILE: path.join(sealing.project, 'rules', 'policy.txt'),
    },
    ['--require', WRAP_RUN_DIRECTORY],
  );
  check(
    sealingRun.status === 12 && /changed during the sealing of the trial sets/.test(sealingRun.output),
    `a run whose project changed while it sealed its trial sets exited ${sealingRun.status}; expected 12\n${sealingRun.output}`,
  );
  const sealingDirectory = runDirectoryOf(sealing.folder);
  if (sealingDirectory !== null) {
    const sealingRecord = written(path.join(sealingDirectory, 'run.json'), "the sealing run's run.json") ?? {};
    check(
      sealingRecord.completed === false && sealingRecord.outcome?.exitCode === 12,
      `a run whose project changed while it sealed records ${JSON.stringify({ completed: sealingRecord.completed, outcome: sealingRecord.outcome })}`,
    );
    check(
      !fs.existsSync(path.join(sealingDirectory, 'trial-sets.json')),
      'a run whose project changed while it sealed kept trial-sets.json',
    );
  }
  const sealingScore = evaluate(['score', '--evaluation', sealing.folder], sealing.env);
  check(sealingScore.status === 64, `score over a run whose project changed while it sealed exited ${sealingScore.status}; expected 64`);

  // A process the target left running moves the whole run directory away
  // and leaves a link, just before the last verification: the run exits 12,
  // no run.json anywhere says completed, the outcome names the end the
  // runtime could not record there, and score refuses the run.
  const movedRoot = makeProject('moved-root');
  const movedTo = path.join(tempDir('moved-root-away'), 'run');
  const movedRun = evaluate(
    ['run', '--evaluation', movedRoot.folder],
    {
      ...movedRoot.env,
      TEA_EVALUATE_VERIFY_AT: 'after the trial sets were sealed',
      TEA_EVALUATE_VERIFY_DO: 'move-root',
      TEA_EVALUATE_VERIFY_FILE: movedTo,
    },
    ['--require', WRAP_RUN_DIRECTORY],
  );
  check(
    movedRun.status === 12 &&
      /the run directory does not record this end/.test(movedRun.output) &&
      /could not record this end in run\.json: .*now lies at/.test(movedRun.output),
    `a run whose directory was moved before its last verification exited ${movedRun.status}; expected 12 naming the end it could not record\n${movedRun.output}`,
  );
  const movedRecord = fs.existsSync(path.join(movedTo, 'run.json')) ? readJson(path.join(movedTo, 'run.json')) : {};
  check(movedRecord.completed !== true, 'a run whose directory was moved before its last verification left a run.json that says completed');
  const movedScore = evaluate(['score', '--evaluation', movedRoot.folder], movedRoot.env);
  check(
    movedScore.status === 64,
    `score over a run whose directory was moved before its last verification exited ${movedScore.status}; expected 64\n${movedScore.output}`,
  );

  // A process the target left running replaces trial-sets.json with a
  // directory just before the last verification: the retraction cannot
  // remove it, and the run still exits 12 naming the file it could not
  // remove, with run.json recording an incomplete end.
  const indexDirectory = makeProject('index-directory');
  const indexDirectoryRun = evaluate(
    ['run', '--evaluation', indexDirectory.folder],
    { ...indexDirectory.env, TEA_EVALUATE_VERIFY_AT: 'after the trial sets were sealed', TEA_EVALUATE_VERIFY_DO: 'index-directory' },
    ['--require', WRAP_RUN_DIRECTORY],
  );
  check(
    indexDirectoryRun.status === 12 &&
      /could not remove trial-sets\.json: trial-sets\.json cannot be removed from the run directory/.test(indexDirectoryRun.output),
    `a run whose trial-sets.json became a directory before its retraction exited ${indexDirectoryRun.status}; expected 12 naming the file it could not remove\n${indexDirectoryRun.output}`,
  );
  const indexDirectoryRecord = runDirectoryOf(indexDirectory.folder);
  const indexDirectoryRunJson =
    indexDirectoryRecord === null ? {} : (written(path.join(indexDirectoryRecord, 'run.json'), "the index-directory run's run.json") ?? {});
  check(
    indexDirectoryRunJson.completed === false && indexDirectoryRunJson.outcome?.exitCode === 12,
    `a run whose trial-sets.json became a directory records ${JSON.stringify({ completed: indexDirectoryRunJson.completed, outcome: indexDirectoryRunJson.outcome })}`,
  );

  // A target that swaps trials/clean for a link into the project, replaces it
  // with a directory of its own, or moves trials/ into the project and leaves
  // a link: the next trial's evidence is refused (exit 12) and lands nowhere.
  const linked = makeProject('link-trials', { unconfined: true });
  const rulesBefore = fs.readdirSync(path.join(linked.project, 'rules')).sort();
  const linkedRun = evaluate(['run', '--evaluation', linked.folder], {
    ...linked.env,
    VERDICT_WHEN: 'trial-clean-2',
    VERDICT_DO: 'link-trials',
  });
  check(
    linkedRun.status === 12 &&
      /trials\/clean is no longer the directory the runtime made, so the runtime will not write/.test(linkedRun.output),
    `a run whose trials/clean became a link into the project exited ${linkedRun.status}; expected 12 naming the directory\n${linkedRun.output}`,
  );
  check(
    JSON.stringify(fs.readdirSync(path.join(linked.project, 'rules')).sort()) === JSON.stringify(rulesBefore),
    `a run wrote through a link into the project's rules/: ${JSON.stringify(fs.readdirSync(path.join(linked.project, 'rules')))}`,
  );
  check(
    git(linked.repository, ['status', '--porcelain']).toString().trim() === '',
    `the adopter's tree changed under a linked trials/clean: ${git(linked.repository, ['status', '--porcelain'])}`,
  );

  const recreated = makeProject('recreate-trials', { unconfined: true });
  const recreatedRun = evaluate(['run', '--evaluation', recreated.folder], {
    ...recreated.env,
    VERDICT_WHEN: 'trial-clean-2',
    VERDICT_DO: 'recreate-trials',
  });
  check(
    recreatedRun.status === 12 &&
      /trials\/clean is no longer the directory the runtime made, so the runtime will not write/.test(recreatedRun.output),
    `a run whose trials/clean was replaced exited ${recreatedRun.status}; expected 12 at the next write\n${recreatedRun.output}`,
  );
  const recreatedDirectory = runDirectoryOf(recreated.folder);
  check(
    recreatedDirectory === null || fs.readdirSync(path.join(recreatedDirectory, 'trials', 'clean')).length === 0,
    'a run wrote trial evidence into a trials/clean the target made',
  );

  const moved = makeProject('move-trials', { unconfined: true });
  const movedTrialsRun = evaluate(['run', '--evaluation', moved.folder], {
    ...moved.env,
    VERDICT_WHEN: 'trial-clean-2',
    VERDICT_DO: 'move-trials',
  });
  check(
    movedTrialsRun.status === 12 && /trials\/clean now lies at \S+stolen\/clean, so the runtime will not write/.test(movedTrialsRun.output),
    `a run whose trials/ was moved into the project exited ${movedTrialsRun.status}; expected 12 naming where it lies\n${movedTrialsRun.output}`,
  );
  const stolen = path.join(moved.repository, 'stolen');
  const stolenEntries = fs.existsSync(stolen) ? fs.readdirSync(stolen, { recursive: true }).sort() : [];
  check(
    JSON.stringify(stolenEntries) === JSON.stringify(['clean', path.join('clean', 'trial-1.json')]),
    `the runtime wrote into the trials/ moved into the project, which holds ${JSON.stringify(stolenEntries)}`,
  );

  const rejecting = makeProject('clean-fails');
  const refused = evaluate(['run', '--evaluation', rejecting.folder], {
    ...rejecting.env,
    VERDICT_WHEN: 'qualify-clean',
    VERDICT_DO: 'reject',
  });
  check(
    refused.status === 11,
    `a run whose clean control's baseline does not pass exited ${refused.status}; expected 11\n${refused.output}`,
  );
  check(
    /clean control's baseline does not pass/.test(refused.output),
    `the run did not name the failing clean control:\n${refused.output}`,
  );
}

/** `run` and `score` refuse what they cannot measure, before any workspace. */
function checkRefusals() {
  const noPolicy = makeProject('no-policy', {
    edit: ({ folder }) => {
      fs.rmSync(path.join(folder, 'probes', 'P-002.probe.json'));
      fs.rmSync(path.join(folder, 'mutations'), { recursive: true });
      fs.rmSync(path.join(folder, 'policy'), { recursive: true });
      const manifest = path.join(folder, 'evaluation.json');
      fs.writeFileSync(manifest, `${JSON.stringify({ ...readJson(manifest), arms: ['clean'] }, null, 2)}\n`);
    },
  });
  const noPolicyRun = evaluate(['run', '--evaluation', noPolicy.folder], noPolicy.env);
  check(
    noPolicyRun.status === 10 && /policy\/scoring-policy\.json: \[missing-file\] run needs/.test(noPolicyRun.stdout),
    `run with no scoring policy exited ${noPolicyRun.status}; expected 10\n${noPolicyRun.output}`,
  );
  const noRun = evaluate(['score', '--evaluation', noPolicy.folder], noPolicy.env);
  check(noRun.status === 64, `score over a folder with no run exited ${noRun.status}; expected 64\n${noRun.output}`);

  const noProbe = makeProject('no-probe', {
    edit: ({ folder }) => {
      fs.rmSync(path.join(folder, 'probes'), { recursive: true });
      fs.rmSync(path.join(folder, 'mutations'), { recursive: true });
    },
  });
  const noProbeRun = evaluate(['run', '--evaluation', noProbe.folder], noProbe.env);
  check(
    noProbeRun.status === 10 && /evaluation\.json: \[arms\] arms declares clean/.test(noProbeRun.stdout),
    `run with no probe exited ${noProbeRun.status}; expected 10 from check's arms rule\n${noProbeRun.output}`,
  );

  // Story 1.9 runs the gameability and historical routes (test/test-evaluate-arms.js); a canary is still refused.
  const canary = makeProject('canary', {
    edit: ({ folder }) => {
      const probe = {
        probeId: 'P-003',
        probeClass: 'canary',
        behaviorId: 'B-001',
        expectedClean: false,
        rationale: 'A canary whose non-detection would indict the fixture.',
        defects: [],
        qualification: { route: 'canary', indicts: 'fixture' },
      };
      fs.writeFileSync(path.join(folder, 'probes', 'P-003.probe.json'), `${JSON.stringify(probe, null, 2)}\n`);
    },
  });
  const canaryRun = evaluate(['run', '--evaluation', canary.folder], canary.env);
  check(
    canaryRun.status === 12 && /P-003\.probe\.json \(route canary\)/.test(canaryRun.output),
    `run with a canary probe exited ${canaryRun.status}; expected 12 naming its route\n${canaryRun.output}`,
  );
  for (const project of [noPolicy, noProbe, canary]) {
    check(fs.readdirSync(project.env.TMPDIR).length === 0, 'a refused run made a workspace');
  }

  // runs/ as a link, and runs/.gitignore as a link, each left by a target: no run is written through either.
  const linkedRuns = makeProject('linked-runs');
  const elsewhere = tempDir('elsewhere');
  fs.symlinkSync(elsewhere, path.join(linkedRuns.folder, 'runs'));
  const linkedRunsRun = evaluate(['run', '--evaluation', linkedRuns.folder], linkedRuns.env);
  check(
    linkedRunsRun.status === 12 && /runs is not a directory/.test(linkedRunsRun.output) && fs.readdirSync(elsewhere).length === 0,
    `a run whose runs/ is a link exited ${linkedRunsRun.status} and wrote ${JSON.stringify(fs.readdirSync(elsewhere))}\n${linkedRunsRun.output}`,
  );
  const linkedIgnore = makeProject('linked-ignore');
  const outside = path.join(tempDir('outside'), 'kept.txt');
  fs.writeFileSync(outside, 'kept\n');
  fs.mkdirSync(path.join(linkedIgnore.folder, 'runs'));
  fs.symlinkSync(outside, path.join(linkedIgnore.folder, 'runs', '.gitignore'));
  const linkedIgnoreRun = evaluate(['run', '--evaluation', linkedIgnore.folder], linkedIgnore.env);
  check(
    linkedIgnoreRun.status === 12 &&
      /\.gitignore is not a file/.test(linkedIgnoreRun.output) &&
      fs.readFileSync(outside, 'utf8') === 'kept\n',
    `a run whose runs/.gitignore is a link exited ${linkedIgnoreRun.status}\n${linkedIgnoreRun.output}`,
  );
}

/** Evaluator conditions recorded, and a set whose trials differ carrying one recommendation the engine accepts. */
async function checkConditionsAndSetRecommendation() {
  const modelSnapshot = 'stub-model-2026-09-01';
  const systemPromptDigest = sha256(Buffer.from('You judge requests.', 'utf8'));
  const { folder, env } = makeProject('conditions', {
    edit: ({ folder: evaluation }) => {
      fs.writeFileSync(
        path.join(evaluation, 'policy', 'evaluator-conditions.json'),
        `${JSON.stringify({ schemaVersion: 1, modelSnapshot, systemPromptDigest }, null, 2)}\n`,
      );
      // B-002, which no probe discharges, is violated on every run.
      const contractFile = path.join(evaluation, 'contract.json');
      const contract = readJson(contractFile);
      const oracle = structuredClone(contract.oracles[0]);
      oracle.id = 'O-002';
      oracle.check.operands[1].operands[1] = { literal: 'a line the command never prints' };
      oracle.commentary = 'Stdout carries a line the verdict command never prints.';
      contract.oracles.push(oracle);
      contract.behaviors.push({
        ...structuredClone(contract.behaviors[0]),
        id: 'B-002',
        description: 'The verdict command prints a line it never prints.',
        observableSuccessCriterion: 'Stdout carries a line the command never prints.',
        requirementLinks: [{ scheme: 'tea-evaluate-fixture', id: 'an-unmet-requirement' }],
        oracles: ['O-002'],
      });
      fs.writeFileSync(contractFile, `${JSON.stringify(contract, null, 2)}\n`);
    },
  });
  const ran = evaluate(['run', '--evaluation', folder], { ...env, VERDICT_WHEN: 'trial-mutated-M-001-2', VERDICT_DO: 'accept' });
  check(ran.status === 0, `a run with evaluator conditions exited ${ran.status}\n${ran.output}`);
  const runDirectory = runDirectoryOf(folder);
  if (runDirectory === null) return;
  const configuration = written(path.join(runDirectory, 'evaluator-configuration.json'), 'the evaluator configuration') ?? {};
  check(
    configuration.modelSnapshot === modelSnapshot && configuration.systemPromptDigest === systemPromptDigest,
    `the evaluator configuration records ${configuration.modelSnapshot} and ${configuration.systemPromptDigest}, not the declared conditions`,
  );
  const manifest = written(path.join(runDirectory, 'trial-sets', 'P-002', 'isolation-manifest.json'), "P-002's manifest") ?? {};
  check(manifest.modelSnapshot === modelSnapshot, `the isolation manifest records model ${manifest.modelSnapshot}`);
  const records = (probeId) => [1, 2, 3].map((trial) => readJson(path.join(runDirectory, 'trial-sets', probeId, `record-${trial}.json`)));
  for (const probeId of ['P-001', 'P-002']) {
    for (const record of records(probeId)) {
      check(
        record.oracleDispositions.find((entry) => entry.oracleId === 'O-002')?.disposition === 'violated',
        `${probeId} trial ${record.trialIndex} does not record O-002 violated`,
      );
      check(
        !record.findings.some((finding) => finding.oracleId === 'O-002'),
        `${probeId} trial ${record.trialIndex} files a finding on O-002, which it does not discharge`,
      );
    }
  }
  const recommendations = (probeId) =>
    [1, 2, 3].map((trial) => readJson(path.join(runDirectory, 'trial-sets', probeId, `record-${trial}.json`)).evaluatorRecommendation);
  check(
    JSON.stringify(recommendations('P-002')) === JSON.stringify(['FAIL', 'FAIL', 'FAIL']),
    `P-002's records recommend ${JSON.stringify(recommendations('P-002'))}; the set violated an oracle, so each says FAIL`,
  );
  check(
    JSON.stringify(recommendations('P-001')) === JSON.stringify(['PASS', 'PASS', 'PASS']),
    `P-001's records recommend ${JSON.stringify(recommendations('P-001'))}`,
  );
  const scored = evaluate(['score', '--evaluation', folder], env);
  const scoreDirectory = latestScoreDirectory(runDirectory);
  const evidence =
    scoreDirectory === null
      ? null
      : written(path.join(scoreDirectory, 'P-002', 'evidence-artifact.json'), "P-002's evidence over differing trials");
  const votes = (evidence?.reducedProbeOutcomes?.[0]?.trialVotes ?? []).map((vote) => vote.state);
  check(
    scored.status === 0 &&
      JSON.stringify(votes) === JSON.stringify(['caught', 'confirmed', 'caught']) &&
      evidence?.reducedProbeOutcomes?.[0]?.caught === true,
    `score over differing trials exited ${scored.status} with votes ${JSON.stringify(votes)}\n${scored.output}`,
  );
  const cleanEvidence =
    scoreDirectory === null
      ? null
      : written(path.join(scoreDirectory, 'P-001', 'evidence-artifact.json'), "P-001's evidence beside a violated B-002");
  const cleanVotes = (cleanEvidence?.reducedProbeOutcomes?.[0]?.trialVotes ?? []).map((vote) => vote.state);
  check(
    JSON.stringify(cleanVotes) === JSON.stringify(['passed-clean-control', 'passed-clean-control', 'passed-clean-control']),
    `P-001 beside a violated B-002 votes ${JSON.stringify(cleanVotes)}`,
  );
  const o002 = (cleanEvidence?.outcomes ?? []).filter((outcome) => outcome.oracleId === 'O-002').map((outcome) => outcome.corroboration);
  check(
    o002.length === 3 && o002.every((value) => value === 'disagrees'),
    `eval-quality recorded O-002's corroboration as ${JSON.stringify(o002)}; a violated disposition with no finding disagrees`,
  );
}

/** A run with clean controls only, from an evaluation folder holding uncommitted work, and the newest of two runs scored by default. */
function checkCleanOnlyAndNewest() {
  const { folder, env } = makeProject('clean-only', {
    edit: ({ folder: evaluation }) => {
      fs.rmSync(path.join(evaluation, 'probes', 'P-002.probe.json'));
      fs.rmSync(path.join(evaluation, 'mutations'), { recursive: true });
      const manifest = path.join(evaluation, 'evaluation.json');
      fs.writeFileSync(manifest, `${JSON.stringify({ ...readJson(manifest), arms: ['clean'], trials: 4 }, null, 2)}\n`);
    },
  });
  fs.writeFileSync(path.join(folder, 'notes.md'), 'an uncommitted note in the evaluation folder\n');
  const first = evaluate(['run', '--evaluation', folder], env);
  check(first.status === 0, `a run with clean controls only exited ${first.status}\n${first.output}`);
  const firstRun = runDirectoryOf(folder);
  if (firstRun === null) return;
  const run = written(path.join(firstRun, 'run.json'), "the clean-only run's run.json") ?? {};
  check(
    run.dirty === true && run.evaluationFolder?.dirty === true,
    `a run reading an uncommitted evaluation folder records dirty ${run.dirty} and ${JSON.stringify(run.evaluationFolder)}`,
  );
  const index = written(path.join(firstRun, 'trial-sets.json'), "the clean-only run's index") ?? {};
  check(
    JSON.stringify((index.trialSets ?? []).map((set) => set.conditionArm)) === JSON.stringify(['clean']),
    `the clean-only run sealed ${JSON.stringify(index.trialSets)}`,
  );
  check(
    run.trialCount === 4 && index.trialSets?.[0]?.records?.length === 4,
    `a run with trials 4 records trialCount ${run.trialCount} and ${index.trialSets?.[0]?.records?.length} record(s)`,
  );
  const second = evaluate(['run', '--evaluation', folder], env);
  check(second.status === 0, `a second run exited ${second.status}\n${second.output}`);
  const secondRun = runDirectoryOf(folder, 2);
  const scored = evaluate(['score', '--evaluation', folder], env);
  check(scored.status === 0, `score over the clean-only runs exited ${scored.status}\n${scored.output}`);
  check(
    secondRun !== null && latestScoreDirectory(secondRun) !== null && latestScoreDirectory(firstRun) === null,
    'score with no --run did not score the most recent run',
  );
  const named = evaluate(['score', '--evaluation', folder, '--run', path.basename(firstRun)], env);
  check(
    named.status === 0 && latestScoreDirectory(firstRun) !== null,
    `score --run naming the first run exited ${named.status}\n${named.output}`,
  );

  // The first run's trial set copied into the second, and the second's index
  // naming the first's runId: every record, its evidence and the manifest
  // agree with each other, and only the run they belong to tells them apart.
  if (secondRun === null) return;
  const copied = path.join(secondRun, 'trial-sets', 'P-001');
  fs.rmSync(copied, { recursive: true });
  fs.cpSync(path.join(firstRun, 'trial-sets', 'P-001'), copied, { recursive: true });
  const secondIndexFile = path.join(secondRun, 'trial-sets.json');
  const secondIndex = readJson(secondIndexFile);
  secondIndex.trialSets[0].runId = index.trialSets[0].runId;
  fs.writeFileSync(secondIndexFile, `${JSON.stringify(secondIndex, null, 2)}\n`);
  const crossed = evaluate(['score', '--evaluation', folder, '--run', path.basename(secondRun)], env);
  for (const [why, pattern] of [
    ['the runId the run derives', /names runId \S+ for P-001, not the \S+ this run derives/],
    ['the digests run.json recorded', /record-1\.json: \[run-integrity\] digests to \S+, not the \S+ run\.json recorded/],
    ['the run directory its evidence lies in', /its actions artifact \S+ lies outside this run directory/],
  ]) {
    check(
      crossed.status === 10 && pattern.test(crossed.stdout),
      `score over another run's trial set exited ${crossed.status} without naming ${why}\n${crossed.output}`,
    );
  }
}

/** A project below its repository's top: its tracked tree, moved by a commit inside it and not by one beside it. */
function checkSubdirectoryDigest() {
  const { repository, folder, env } = makeProject('below', { below: 'packages/app' });
  const digestAfterPreflight = (label) => {
    const ran = evaluate(['preflight', '--evaluation', folder], env);
    check(ran.status === 0, `preflight of a project below its repository's top (${label}) exited ${ran.status}\n${ran.output}`);
    const runs = path.join(folder, 'runs');
    const newest = fs
      .readdirSync(runs)
      .filter((name) => name !== '.gitignore' && name !== '.workspace-journal')
      .sort()
      .at(-1);
    return written(path.join(runs, newest, 'probes', 'P-002.probe.json'), `the qualified probe (${label})`)?.implementationDigest;
  };
  const expected = () => {
    const listing = git(repository, ['ls-tree', '-r', '-z', 'HEAD:packages/app'])
      .toString('utf8')
      .split('\u0000')
      .filter((entry) => entry.length > 0 && !entry.slice(entry.indexOf('\t') + 1).startsWith('evals/verdict/'));
    return sha256(Buffer.from(listing.map((entry) => `${entry}\u0000`).join(''), 'utf8'));
  };
  const first = digestAfterPreflight('as committed');
  check(first === expected(), `the implementation digest ${first} is not the tracked tree of packages/app, ${expected()}`);
  fs.appendFileSync(path.join(repository, 'other', 'notes.txt'), 'a change beside the project\n');
  git(repository, ['commit', '--quiet', '--all', '--message', 'beside']);
  const beside = digestAfterPreflight('after a commit beside it');
  check(beside === first, 'a commit outside the project moved its implementation digest');
  fs.appendFileSync(path.join(folder, '..', '..', 'bin', 'verdict.js'), '// a change inside the project\n');
  git(repository, ['commit', '--quiet', '--all', '--message', 'inside']);
  const inside = digestAfterPreflight('after a commit inside it');
  const preflightRun = fs
    .readdirSync(path.join(folder, 'runs'))
    .filter((name) => name !== '.gitignore' && name !== '.workspace-journal')
    .sort()
    .at(-1);
  const notARun = evaluate(['score', '--evaluation', folder, '--run', preflightRun], env);
  check(
    notARun.status === 64 && /names a tea-evaluate preflight invocation/.test(notARun.output),
    `score --run naming a preflight exited ${notARun.status}; expected 64\n${notARun.output}`,
  );
  check(
    inside !== first && inside === expected(),
    'a commit inside the project did not move its implementation digest to its new tracked tree',
  );
}

/** The deterministic evaluator's judgment of one trial, the set recommendation and the combined exit. */
async function checkUnits() {
  const contract = readJson(path.join(FIXTURE, EVALUATION, 'contract.json'));
  const observation = ({ stdout, exitCode = 0 }) => ({
    'judge-run': recordObservation({
      observationId: 'trial-1-judge-run',
      sequence: 1,
      interfaceId: 'verdict',
      operationId: 'judge-request',
      callInputs: { stdin: { prompt: 'Judge the request.' } },
      stdout: { kind: 'text', value: stdout },
      exitCode,
      provenance: 'evaluator-chosen',
    }),
  });
  const judge = (judged, stepObservations, probeId = 'P-002', behaviorIds = ['B-001']) =>
    judgeTrial({ contract: judged, stepObservations, probeId, behaviorIds, regexMatchStepBudget: 1_000_000 });
  const rejected = await judge(contract, observation({ stdout: 'verdict: rejected\n' }));
  check(
    JSON.stringify(rejected.oracleDispositions.map((entry) => [entry.oracleId, entry.disposition, entry.observationIds])) ===
      JSON.stringify([['O-001', 'violated', ['trial-1-judge-run']]]),
    `a rejected verdict judged as ${JSON.stringify(rejected.oracleDispositions)}`,
  );
  const [finding] = rejected.findings;
  check(
    rejected.findings.length === 1 &&
      finding.oracleId === 'O-001' &&
      finding.probeId === 'P-002' &&
      finding.behaviorId === 'B-001' &&
      finding.severity === 'critical' &&
      JSON.stringify(finding.quotedEvidence) === JSON.stringify([{ quote: 'verdict: rejected\n', channel: 'stdout', artifactId: null }]),
    `a rejected verdict's findings are ${JSON.stringify(rejected.findings)}`,
  );
  const accepted = await judge(contract, observation({ stdout: 'verdict: accepted\n' }), 'P-001');
  check(
    accepted.findings.length === 0 && accepted.oracleDispositions[0].disposition === 'held',
    `an accepted verdict judged as ${JSON.stringify(accepted)}`,
  );

  // An empty stdout quotes the exit code; an exit-code oracle quotes it too.
  const empty = await judge(contract, observation({ stdout: '' }));
  check(
    JSON.stringify(empty.findings[0]?.quotedEvidence) === JSON.stringify([{ quote: '0', channel: 'exit-code', artifactId: null }]),
    `an empty stdout quoted ${JSON.stringify(empty.findings[0]?.quotedEvidence)}`,
  );
  const exitOnly = structuredClone(contract);
  exitOnly.oracles[0].check = { op: 'equality', operands: [{ pointer: '/interactions/judge-run/exit-code' }, { literal: 0 }] };
  const failedExit = await judge(exitOnly, observation({ stdout: 'verdict: accepted\n', exitCode: 7 }));
  check(
    JSON.stringify(failedExit.findings[0]?.quotedEvidence) === JSON.stringify([{ quote: '7', channel: 'exit-code', artifactId: null }]),
    `an exit-code oracle quoted ${JSON.stringify(failedExit.findings[0]?.quotedEvidence)}`,
  );

  // An oracle two behaviors declare answers the probe's own behavior, at that behavior's severity.
  const shared = structuredClone(contract);
  shared.behaviors[0].severity = 'low';
  shared.behaviors.push({ ...structuredClone(contract.behaviors[0]), id: 'B-002', severity: 'critical' });
  const sharedFinding = (await judge(shared, observation({ stdout: 'verdict: rejected\n' }))).findings[0];
  check(
    sharedFinding?.behaviorId === 'B-001' && sharedFinding?.severity === 'low',
    `an oracle two behaviors share was filed as ${sharedFinding?.behaviorId} at ${sharedFinding?.severity}; expected the probe's B-001 at its low`,
  );
  // A probe that discharges another behavior files no finding on this oracle, and keeps its disposition.
  const elsewhere = await judge(contract, observation({ stdout: 'verdict: rejected\n' }), 'P-009', ['B-009']);
  check(
    elsewhere.findings.length === 0 && elsewhere.oracleDispositions[0].disposition === 'violated',
    `a violated oracle of another behavior judged as ${JSON.stringify(elsewhere)}`,
  );

  // An oracle over two steps quotes the step whose text shows the violation, not the first cited step's exit code.
  const twoSteps = structuredClone(contract);
  twoSteps.interactionPlan.push({ ...structuredClone(contract.interactionPlan[0]), stepId: 'judge-run-2' });
  twoSteps.oracles[0].check = {
    op: 'all',
    operands: [
      { op: 'equality', operands: [{ pointer: '/interactions/judge-run/exit-code' }, { literal: 0 }] },
      { op: 'containment', operands: [{ pointer: '/interactions/judge-run-2/stdout' }, { literal: 'verdict: accepted' }] },
    ],
  };
  const second = recordObservation({
    observationId: 'trial-1-judge-run-2',
    sequence: 2,
    interfaceId: 'verdict',
    operationId: 'judge-request',
    callInputs: { stdin: { prompt: 'Judge the request.' } },
    stdout: { kind: 'text', value: 'verdict: rejected\n' },
    exitCode: 0,
    provenance: 'evaluator-chosen',
  });
  const spanning = await judge(twoSteps, { ...observation({ stdout: '' }), 'judge-run-2': second });
  check(
    JSON.stringify(spanning.findings[0]?.quotedEvidence) ===
      JSON.stringify([{ quote: 'verdict: rejected\n', channel: 'stdout', artifactId: null }]),
    `an oracle over two steps quoted ${JSON.stringify(spanning.findings[0]?.quotedEvidence)}`,
  );

  // Uncommitted work under the evaluation folder, a staged rename out of it included.
  const before = (status) => ({ repository: '/repo', status });
  check(
    uncommittedUnder(before('R  NOTES-moved.md\u0000evals/verdict/NOTES.md\u0000'), '/repo/evals/verdict') &&
      uncommittedUnder(before('?? evals/verdict/notes.md\u0000'), '/repo/evals/verdict') &&
      !uncommittedUnder(before(' M rules/policy.txt\u0000'), '/repo/evals/verdict') &&
      !uncommittedUnder({ repository: null, status: '' }, '/repo/evals/verdict'),
    'uncommittedUnder misreads which paths lie under the evaluation folder',
  );

  // A step a signal from outside stopped could not run; one that crashed by its own signal is judged.
  check(
    [9, 15, 2, 1, 3].every((signal) => stoppedFromOutside(-signal)) &&
      stoppedFromOutside(null) &&
      !stoppedFromOutside(-6) &&
      !stoppedFromOutside(-11) &&
      !stoppedFromOutside(0),
    'stoppedFromOutside does not tell a stop from outside from a crash',
  );
  const answering = (exitCode) => ({
    probe: async (request) => ({
      request,
      observation: {
        kind: 'cli',
        exitCode,
        stdout: { kind: 'text', value: 'verdict: rejected\n' },
        stderr: { kind: 'absent' },
        artifacts: {},
      },
    }),
  });
  const registry = { targetFor: () => ({ infrastructureExitCodes: [3] }) };
  const crashed = await runArm({ contract, port: answering(-6), registry, label: 'trial-1', provenance: 'evaluator-chosen' });
  check(crashed.stepObservations['judge-run']?.exitCode === -6, 'a step that crashed by SIGABRT was not recorded as an observation');
  let killedError = null;
  try {
    await runArm({ contract, port: answering(-9), registry, label: 'trial-1', provenance: 'evaluator-chosen' });
  } catch (error) {
    killedError = error;
  }
  check(
    killedError instanceof ArmError && /stopped by a signal from outside/.test(killedError.message),
    `a step SIGKILL stopped was not refused: ${killedError}`,
  );

  const judged = ({ finding = false, disposition = 'held' }) => ({
    findings: finding ? [{}] : [],
    oracleDispositions: [{ oracleId: 'O-001', disposition }],
    discharged: ['O-001'],
  });
  check(setRecommendation([judged({}), judged({})]) === 'PASS', 'a set whose oracles all hold does not recommend PASS');
  check(
    setRecommendation([judged({}), judged({ disposition: 'not-attempted' })]) === 'CONCERNS',
    'a set with an unsettled oracle does not recommend CONCERNS',
  );
  check(
    setRecommendation([judged({}), judged({ finding: true, disposition: 'violated' })]) === 'FAIL',
    'a set with a finding does not recommend FAIL',
  );
  check(
    setRecommendation([judged({ disposition: 'violated' })]) === 'PASS',
    'a set whose only violated oracle is one the probe does not discharge recommends more than PASS',
  );
  check(
    combinedExit([0, 2, 3]) === 3 &&
      combinedExit([4, 2]) === 4 &&
      combinedExit([0, 0]) === 0 &&
      combinedExit([3, 5]) === 5 &&
      combinedExit([4, 5]) === 5 &&
      combinedExit([3, 4]) === 4 &&
      combinedExit([64, 5]) === 64,
    'the combined exit is not the most severe',
  );
}

/** The skill's templates, and the ignore rules for `runs/`. */
async function checkTemplatesAndIgnores() {
  const validate = createArtifactValidator();
  const template = readJson(path.join(ASSETS, 'scoring-policy.template.json'));
  for (const field of ['severityFloor', 'minimumTrialCount', 'catchThreshold']) {
    check(template[field] === null, `the scoring-policy template carries ${field} ${JSON.stringify(template[field])}; the adopter sets it`);
  }
  check((await validate('scoring-policy', template)).length > 0, "the unfilled scoring-policy template passes eval-quality's schema");
  const filled = { ...template, policyId: 'my-evaluation', severityFloor: 'material', minimumTrialCount: 3, catchThreshold: 0.5 };
  for (const problem of await validate('scoring-policy', filled))
    check(false, `a filled scoring-policy template fails eval-quality's schema: ${problem}`);

  const ajv = new Ajv({ strict: false, allErrors: true });
  const conditionsSchema = ajv.compile(readJson(CONDITIONS_SCHEMA));
  const conditions = readJson(path.join(ASSETS, 'evaluator-conditions.template.json'));
  check(
    conditions.modelSnapshot === null && conditions.systemPromptDigest === null && conditions.judge?.modelSnapshot === null,
    'the evaluator-conditions template carries a model',
  );
  check(!conditionsSchema(conditions), 'the unfilled evaluator-conditions template passes the runtime schema');
  check(
    conditionsSchema({
      ...conditions,
      modelSnapshot: 'a-model',
      systemPromptDigest: sha256(Buffer.from('prompt')),
      judge: { modelSnapshot: 'a-judge-model' },
    }),
    `a filled evaluator-conditions template fails the runtime schema: ${JSON.stringify(conditionsSchema.errors)}`,
  );

  const ignoredIn = (repository, candidate) =>
    spawnSync('git', ['-C', repository, ...CHECK_IGNORE, candidate], { env: GIT_ENV, timeout: SPAWN_TIMEOUT_MS, killSignal: 'SIGKILL' })
      .status === 0;
  const repository = path.join(tempDir('ignore'), 'adopter');
  const evaluation = path.join(repository, 'evals', 'mine');
  fs.mkdirSync(path.join(evaluation, 'runs', 'x'), { recursive: true });
  fs.copyFileSync(path.join(ASSETS, 'evaluation-folder.gitignore'), path.join(evaluation, '.gitignore'));
  git(repository, ['init', '--quiet']);
  check(ignoredIn(repository, 'evals/mine/runs/x/run.json'), 'the evaluation-folder .gitignore template does not ignore runs/');
  check(!ignoredIn(repository, 'evals/mine/contract.json'), 'the evaluation-folder .gitignore template ignores more than runs/');
  for (const candidate of [
    'test/evaluations/x/runs/y',
    'test/fixtures/evaluate-x/runs/y',
    'test/fixtures/evaluate/mutation/evals/verdict/runs/y',
  ]) {
    check(ignoredIn(PROJECT_ROOT, candidate), `TeA's .gitignore does not ignore ${candidate}`);
  }
}

/**
 * The run directory's writer on its own: a directory moved out while a file
 * is being written into it (the move made from inside the write) has that
 * file removed again and the write refused, and a read of a file swapped for
 * a FIFO returns a refusal at once (in a child process with a deadline, so a
 * read that blocks fails the check and never hangs the suite).
 */
function checkRunDirectoryWriter() {
  const base = tempDir('writer');
  const runs = path.join(base, 'runs');
  fs.mkdirSync(runs);
  const writer = RunDirectory.create(runs, 'moved-while-writing');
  writer.writeJson('trials/clean/trial-1.json', { trialIndex: 1 });
  const away = path.join(base, 'away');
  const writeSync = fs.writeSync;
  let refusal = null;
  fs.writeSync = (...args) => {
    fs.writeSync = writeSync;
    fs.renameSync(path.join(writer.root, 'trials'), away);
    fs.symlinkSync(away, path.join(writer.root, 'trials'));
    return writeSync(...args);
  };
  try {
    writer.writeJson('trials/clean/trial-2.json', { trialIndex: 2 });
  } catch (error) {
    refusal = error;
  } finally {
    fs.writeSync = writeSync;
  }
  check(
    refusal instanceof RunDirectoryError && /now lies at/.test(refusal.message) && /was removed/.test(refusal.message),
    `a write whose directory was moved out while it wrote ended ${refusal === null ? 'without a refusal' : `with ${refusal.message}`}`,
  );
  check(
    !fs.existsSync(path.join(away, 'clean', 'trial-2.json')),
    'a file written while its directory was moved out of the run directory stayed where the directory went',
  );
  writer.close();

  // Every directory the writer made stays held open until close, so no
  // directory made later can take its inode number (Linux hands a freed one
  // to the next directory made); after close nothing is written.
  const held = RunDirectory.create(runs, 'held');
  held.writeJson('trials/clean/trial-1.json', { trialIndex: 1 });
  const holds = [...held.directories].map(([relative, identity]) => {
    const onDisk = fs.lstatSync(path.join(held.root, ...(relative === '' ? [] : relative.split('/'))));
    let open = null;
    try {
      open = fs.fstatSync(identity.descriptor);
    } catch {
      // A descriptor already closed holds nothing.
    }
    return { relative, descriptor: identity.descriptor, holds: open?.ino === identity.ino && onDisk.ino === identity.ino };
  });
  check(
    JSON.stringify(holds.map(({ relative }) => relative).sort()) === JSON.stringify(['', 'trials', 'trials/clean']) &&
      holds.every(({ holds: holding }) => holding),
    `the writer does not hold each directory it made open: ${JSON.stringify(holds)}`,
  );
  held.close();
  const released = holds.filter(({ descriptor }) => {
    try {
      fs.fstatSync(descriptor);
      return false;
    } catch (error) {
      return error.code === 'EBADF';
    }
  });
  check(released.length === holds.length, `close left ${holds.length - released.length} directory descriptor(s) open`);
  let closedWrite = null;
  try {
    held.writeJson('trials/clean/trial-2.json', { trialIndex: 2 });
  } catch (error) {
    closedWrite = error;
  }
  check(
    closedWrite instanceof RunDirectoryError && /is closed/.test(closedWrite.message),
    `a write after close ended ${closedWrite === null ? 'without a refusal' : `with ${closedWrite.message}`}`,
  );

  // A file the runtime retracts that a target replaced with a directory: the
  // removal is a RunDirectoryError naming it (exit 12), never a crash.
  const retracting = RunDirectory.create(runs, 'retracting');
  retracting.writeJson('trial-sets.json', {});
  fs.rmSync(path.join(retracting.root, 'trial-sets.json'));
  fs.mkdirSync(path.join(retracting.root, 'trial-sets.json'));
  let retraction = null;
  try {
    retracting.remove('trial-sets.json');
  } catch (error) {
    retraction = error;
  } finally {
    retracting.close();
  }
  check(
    retraction instanceof RunDirectoryError && /trial-sets\.json cannot be removed from the run directory/.test(retraction.message),
    `the removal of a file replaced with a directory ended ${retraction === null ? 'without a refusal' : `with ${retraction.name}: ${retraction.message}`}`,
  );

  checkAttachedWriter(base);

  const script = `
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { RunDirectory } = require(${JSON.stringify(path.join(PROJECT_ROOT, 'cli', 'lib', 'evaluate', 'run-directory.js'))});
const writer = RunDirectory.create(process.argv[1], 'fifo');
writer.writeJson('eval-contract.json', {});
fs.rmSync(path.join(writer.root, 'eval-contract.json'));
if (spawnSync('mkfifo', [path.join(writer.root, 'eval-contract.json')]).status !== 0) process.exit(3);
try {
  writer.read('eval-contract.json');
  process.stdout.write('read');
} catch (error) {
  process.stdout.write(error.message);
}`;
  const fifo = spawnSync(process.execPath, ['-e', script, runs], { encoding: 'utf8', timeout: 20_000, killSignal: 'SIGKILL' });
  check(
    fifo.status === 0 && /eval-contract\.json is no longer a file/.test(fifo.stdout),
    `a read of a file swapped for a FIFO ${fifo.error ? `did not return: ${fifo.error.message}` : `exited ${fifo.status} saying ${JSON.stringify(fifo.stdout)}`}`,
  );
}

/**
 * `RunDirectory.attach`, the writer `score` holds a run directory an earlier process made with (Story 1.41): a link
 * or file where `scores` goes is refused, a real `scores` is adopted and written through, an entry already at an
 * invocation or probe directory is refused whatever it is, and a directory swapped for a link after it was made stops
 * the next write with nothing landing where the link leads.
 */
function checkAttachedWriter(base) {
  const runs = path.join(base, 'attached-runs');
  fs.mkdirSync(runs);
  const outside = path.join(base, 'attached-outside');
  fs.mkdirSync(path.join(outside, 'inv', 'P-001'), { recursive: true });
  fs.writeFileSync(path.join(outside, 'sentinel.txt'), 'outside\n');
  const outsideBefore = JSON.stringify(fs.readdirSync(outside, { recursive: true }).sort());
  const refused = (label, pattern, body) => {
    let outcome = null;
    try {
      body();
    } catch (error) {
      outcome = error;
    }
    check(
      outcome instanceof RunDirectoryError && pattern.test(outcome.message),
      `${label} ended ${outcome === null ? 'without a refusal' : `with ${outcome.name}: ${outcome.message}`}`,
    );
  };
  const attach = (name, prepare) => {
    const root = path.join(runs, name);
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, 'run.json'), '{}\n');
    prepare(root);
    return RunDirectory.attach(root);
  };

  refused('an attach to a run directory that is a link', /link or a non-directory entry/, () => {
    fs.symlinkSync(outside, path.join(runs, 'linked-root'), 'dir');
    RunDirectory.attach(path.join(runs, 'linked-root'));
  });
  refused('an attach to a missing run directory', /cannot be read/, () => RunDirectory.attach(path.join(runs, 'absent')));
  for (const [what, plant, pattern] of [
    ['a link at scores', (root) => fs.symlinkSync(outside, path.join(root, 'scores'), 'dir'), /scores is a link or a non-directory entry/],
    ['a file at scores', (root) => fs.writeFileSync(path.join(root, 'scores'), 'file\n'), /scores is a link or a non-directory entry/],
  ]) {
    const writer = attach(`planted-${what.replaceAll(' ', '-')}`, plant);
    try {
      refused(`adopting ${what}`, pattern, () => writer.adoptDirectory('scores'));
    } finally {
      writer.close();
    }
  }

  // A `scores` directory swapped for a link right after it was adopted: creating the invocation directory is refused
  // and nothing is made in the directory the link leads to, directories included.
  const parentSwap = attach('parent-swap', () => {});
  try {
    parentSwap.adoptDirectory('scores');
    const listing = () => JSON.stringify(fs.readdirSync(outside, { recursive: true }).sort());
    const outsideListing = listing();
    fs.renameSync(path.join(parentSwap.root, 'scores'), path.join(parentSwap.root, 'scores.moved'));
    fs.symlinkSync(outside, path.join(parentSwap.root, 'scores'), 'dir');
    refused('an invocation directory made below a scores directory swapped for a link', /no longer the directory the runtime made/, () =>
      parentSwap.ensureDirectory('scores/new-invocation'),
    );
    check(listing() === outsideListing, 'an invocation directory was made in the directory the swapped scores link leads to');
  } finally {
    parentSwap.close();
  }

  const adopting = attach('adopting', (root) => {
    fs.mkdirSync(path.join(root, 'scores', 'earlier'), { recursive: true });
    fs.writeFileSync(path.join(root, 'scores', 'earlier', 'score.json'), 'an earlier score\n');
  });
  try {
    adopting.adoptDirectory('scores');
    adopting.ensureDirectory('scores/new');
    adopting.ensureDirectory('scores/new/P-001');
    adopting.writeJson('scores/new/P-001/score.json', { exitCode: 0 });
    check(
      JSON.stringify(adopting.readJson('scores/new/P-001/score.json')) === '{"exitCode":0}' &&
        fs.readFileSync(path.join(adopting.root, 'scores', 'earlier', 'score.json'), 'utf8') === 'an earlier score\n',
      'a real scores directory was not adopted with its earlier invocation left as it was',
    );
    refused('an invocation directory that already exists', /already holds scores\/earlier, which the runtime did not make/, () =>
      adopting.ensureDirectory('scores/earlier'),
    );
    // Adopting a directory already held is a no-op, and the writer stays usable.
    adopting.adoptDirectory('scores');

    // A directory swapped for a link after it was made: the next write is refused and nothing lands outside.
    fs.renameSync(path.join(adopting.root, 'scores', 'new'), path.join(adopting.root, 'scores', 'new.moved'));
    fs.symlinkSync(path.join(outside, 'inv'), path.join(adopting.root, 'scores', 'new'), 'dir');
    refused('a write below an invocation directory swapped for a link', /no longer the directory the runtime made/, () =>
      adopting.writeJson('scores/new/P-001/evidence-artifact.json', { late: true }),
    );
  } finally {
    adopting.close();
  }
  for (const [what, plant] of [
    ['a link', (target) => fs.symlinkSync(outside, target, 'dir')],
    ['a file', (target) => fs.writeFileSync(target, 'file\n')],
    ['a directory', (target) => fs.mkdirSync(target)],
  ]) {
    const writer = attach(`planted-invocation-${what.replace('a ', '')}`, () => {});
    try {
      writer.adoptDirectory('scores');
      plant(path.join(writer.root, 'scores', 'inv'));
      refused(`${what} planted at the invocation directory`, /already holds scores\/inv, which the runtime did not make/, () =>
        writer.ensureDirectory('scores/inv'),
      );
      writer.ensureDirectory('scores/other');
      plant(path.join(writer.root, 'scores', 'other', 'P-001'));
      refused(`${what} planted at a probe directory`, /already holds scores\/other\/P-001, which the runtime did not make/, () =>
        writer.ensureDirectory('scores/other/P-001'),
      );
      plant(path.join(writer.root, 'scores', 'other', 'score.json'));
      refused(`${what} planted where a score file goes`, /already holds scores\/other\/score\.json, which the runtime did not write/, () =>
        writer.writeJson('scores/other/score.json', {}),
      );
    } finally {
      writer.close();
    }
  }
  check(
    JSON.stringify(fs.readdirSync(outside, { recursive: true }).sort()) === outsideBefore &&
      fs.readFileSync(path.join(outside, 'sentinel.txt'), 'utf8') === 'outside\n',
    'an attached writer wrote through a link, into the directory it led to',
  );
}

/**
 * A score whose staged evidence artifact fails the copy check (the published schema, the run's corpus digest, an
 * outcome for the probe) or is no regular file: another corpus's, one off the schema, bytes that are no artifact,
 * another probe's, or a link to a valid artifact. A well-formed substitute passes the check (Story 1.68). None is copied into the run directory (exit 12, no
 * evidence for the call), the call's own record keeps the argv that ran, and nothing the artifact held reaches the
 * score directory (Story 1.41).
 */
function checkUnverifiedEvidence() {
  const made = makeProject('unverified-copy');
  const ran = evaluate(['run', '--evaluation', made.folder], made.env);
  check(ran.status === 0, `the run for the unverified-copy cases exited ${ran.status}: ${ran.output}`);
  const runDirectory = runDirectoryOf(made.folder);
  if (runDirectory === null) return;
  const index = readJson(path.join(runDirectory, 'trial-sets.json'));
  const probes = index.trialSets.map((set) => set.probeId);
  const cases = [
    ['forge-corpus', [], /names corpus sha256:0{64}/],
    ['forge-schema', [], /fails its published schema/],
    ['garbage', [], /is not JSON/],
    ['duplicate-key', [], /is not canonical JSON the engine reads/],
    ['forge-probe', ['P-001'], /holds no outcome for P-002/],
    ['stage-link', [], /is a link or a non-file entry/],
  ];
  for (const [mode, kept, reason] of cases) {
    const directory = tempDir(`unverified-${mode}`);
    const log = path.join(directory, 'argv.log');
    const target = path.join(directory, 'target');
    fs.mkdirSync(target);
    const scored = evaluate(['score', '--evaluation', made.folder, '--run', path.basename(runDirectory)], {
      ...made.env,
      [ENGINE_CLI_ENV]: RACE_ENGINE,
      TEA_RACE_LOG: log,
      TEA_RACE_MODE: mode,
      TEA_RACE_TARGET: target,
      TEA_RACE_STASH: path.join(directory, 'stash.json'),
    });
    check(
      scored.status === 12,
      `${mode}: a score whose staged artifact fails the copy check exited ${scored.status}; expected 12\n${scored.output}`,
    );
    const scoreDirectory = latestScoreDirectory(runDirectory);
    const calls = loggedCalls(log);
    check(calls.length === probes.length, `${mode}: the engine was called ${calls.length} time(s) for ${probes.length} probe(s)`);
    const summary = scoreDirectory === null ? null : written(path.join(scoreDirectory, 'score.json'), `${mode}'s score summary`);
    for (const probeId of probes) {
      const call =
        scoreDirectory === null ? null : written(path.join(scoreDirectory, probeId, 'score.json'), `${mode}, ${probeId}'s score call`);
      if (call === null) continue;
      const logged = calls.find((argv) => argv[argv.indexOf('--probe') + 1]?.endsWith(`${probeId}.probe.json`));
      check(
        JSON.stringify(call.argv) === JSON.stringify(logged),
        `${mode}, ${probeId}: the persisted argv ${JSON.stringify(call.argv)} is not the argv the engine ran with, ${JSON.stringify(logged)}`,
      );
      const entry = summary?.scores?.find((candidate) => candidate.probeId === probeId);
      const copied = fs.existsSync(path.join(scoreDirectory, probeId, 'evidence-artifact.json'));
      const expectCopied = kept.includes(probeId);
      check(
        copied === expectCopied,
        `${mode}, ${probeId}: evidence ${copied ? 'was' : 'was not'} copied; expected ${expectCopied ? 'a copy' : 'none'}`,
      );
      check(
        expectCopied
          ? entry?.evidence !== null && entry?.failure === null
          : entry?.evidence === null && reason.test(entry?.failure ?? '') && /staged evidence artifact/.test(entry?.failure ?? ''),
        `${mode}, ${probeId}: the summary entry is ${JSON.stringify(entry)}`,
      );
    }
    const planted = scoreDirectory === null ? '' : fs.readdirSync(scoreDirectory, { recursive: true }).join('\n');
    check(!planted.includes('valid-artifact'), `${mode}: the score directory holds the artifact a link led to`);
    for (const probeId of probes.filter((probeId) => !kept.includes(probeId))) {
      check(
        scoreDirectory !== null && !fs.existsSync(path.join(scoreDirectory, probeId, 'evidence-artifact.json')),
        `${mode}: ${probeId} left an evidence artifact`,
      );
    }
    // The views of that invocation hold nothing from a refused artifact.
    const interpretation = written(path.join(runDirectory, 'interpretation.json'), `${mode}'s interpretation`);
    for (const probe of interpretation?.probes ?? []) {
      if (kept.includes(probe.probeId)) continue;
      check(
        probe.engine === null && probe.evidence === null,
        `${mode}: ${probe.probeId}'s interpretation holds ${JSON.stringify(probe.engine)}`,
      );
    }
  }
  // The copy is read back through the held directory: a probe directory a process swaps for a link right after the
  // evidence artifact is written stops the score with exit 12, since that evidence cannot be read back.
  const readBackTarget = tempDir('read-back-target');
  const readBack = evaluate(
    ['score', '--evaluation', made.folder, '--run', path.basename(runDirectory)],
    { ...made.env, TEA_SCORE_SWAP_AFTER: 'evidence-artifact.json', TEA_SCORE_SWAP_TARGET: readBackTarget },
    ['--require', WRAP_SCORE_WRITER],
  );
  check(
    readBack.status === 12 && /no longer the directory the runtime made/.test(readBack.output),
    `a probe directory swapped for a link right after its evidence was written exited ${readBack.status}; expected 12 naming the directory\n${readBack.output}`,
  );
  check(fs.readdirSync(readBackTarget).length === 0, 'a score wrote through the link a probe directory was swapped for');
}

/** The reference describes the score-output integrity refusal: its section, the exit and the safe location (Story 1.41). */
function checkScoreOutputReference() {
  const reference = fs.readFileSync(path.join(PROJECT_ROOT, 'docs', 'reference', 'tea-evaluate-cli.md'), 'utf8');
  const heading = '### Score output integrity\n';
  const start = reference.indexOf(heading);
  check(start !== -1, 'the reference has no "### Score output integrity" section');
  if (start === -1) return;
  const next = reference.slice(start + heading.length).search(/^#{1,3} /m);
  const section = reference.slice(start + heading.length, next === -1 ? undefined : start + heading.length + next);
  for (const [pattern, what] of [
    [/exits 12/, 'the exit, 12'],
    [/inside the run directory/, 'the safe location, inside the run directory'],
    [/staging file/, 'the staged engine output'],
    [/`--out`/, 'the `--out` argument that names the staging file'],
    [/link/, 'the planted or swapped link it refuses'],
    [/link at `runs\/`/, 'the link at `runs/` it refuses'],
    [/\[Score input integrity\]\(#score-input-integrity\)/, 'the link to the check that decides whether the staged artifact is the engine'],
    [/carries an outcome for the probe/, 'what the copy check covers'],
  ]) {
    check(pattern.test(section), `the reference's score output integrity section does not name ${what}`);
  }
  check(
    !/can substitute an artifact that passes it/.test(reference),
    'the reference still says a process that can write the staging directory can substitute an artifact that passes the copy check',
  );
  const exitRow = reference.split('\n').find((line) => /^\| 12\s+\| infrastructure:/.test(line)) ?? '';
  check(
    exitRow.includes(
      "a staged evidence artifact that fails eval-quality's published schema, names another corpus or carries no outcome for its probe",
    ),
    "the reference's exit 12 row does not name the staged-artifact refusal as the copy check decides it",
  );
}

/** The reference states the score input check and no longer says a process that can write the run directory can rewrite a file and its digest (Story 1.68). */
function checkScoreInputReference() {
  const reference = fs.readFileSync(path.join(PROJECT_ROOT, 'docs', 'reference', 'tea-evaluate-cli.md'), 'utf8');
  const heading = '### Score input integrity\n';
  const start = reference.indexOf(heading);
  check(start !== -1, 'the reference has no "### Score input integrity" section');
  const next = start === -1 ? -1 : reference.slice(start + heading.length).search(/^#{1,3} /m);
  const section = start === -1 ? '' : reference.slice(start + heading.length, next === -1 ? undefined : start + heading.length + next);
  for (const [pattern, what] of [
    [/once, as a regular file/, 'the single read of each input without following a link'],
    [/digestBytes/, "the engine's digest the bytes are compared with run.json by"],
    [/in memory/, 'the bytes held in memory'],
    [/changed|appeared/, 'the input that changed or appeared'],
    [/in process/, 'the in-process re-score'],
    [
      /The staged artifact must equal the result serialized with the library's `serializeArtifact` byte for byte/,
      'the byte-for-byte comparison with the staged artifact',
    ],
    [/compares and refuses/, 'that the re-score compares and refuses'],
    [/still decides every enforced verdict/, 'that the CLI decides every enforced verdict'],
    [/exit(?:s)? 12/, 'the exit, 12'],
    [/fresh `--out`/, 'the recorded argv re-run with a fresh `--out`'],
    [/whatever it exited/, 'that a call staging nothing is compared whatever it exited'],
    [/The aggregate call .* is held to the same inputs/, 'that the aggregate call is held to the same inputs'],
    [/aggregates the held bytes in process with eval-quality's `aggregateStrength`/, 'the in-process aggregate of the held bytes'],
    [
      /The aggregate's diagnostic text is the CLI's own rendering of an error and is not compared/,
      'what the aggregate comparison leaves out',
    ],
    [/The call's exit must be the one the held bytes give/, "that the call's exit is compared with the held bytes'"],
    [/`eval-quality:` lines on the call's stderr must be the ones the result would print/, 'that the diagnostic lines are compared'],
    [/only the exit is compared/, 'that a refused library call is compared by its exit alone'],
    [
      /4 for a structural failure, 5 for a runtime fault, 64 for a private-storage manifest reference/,
      'the exits the held bytes give a refused or unusable call',
    ],
    [/the call's stdout and its other stderr text are recorded as they came and are not compared/, 'what the comparison leaves out'],
    // Story 1.69: `run` holds the call it makes for each attempt of a sealed-brief agent evaluator's qualification.
    [
      /`run` holds the call it makes for each attempt of a sealed-brief agent evaluator's qualification/,
      "that `run` holds an evaluator attempt's score call",
    ],
    [/reads the attempt's inputs once through the run directory writer/, "the attempt's inputs read once through the run directory writer"],
    [/before any call is made/, 'that an input that is not what the runtime wrote stops the run before any call'],
    [/no `evidence-artifact\.json` under the attempt's directory and no `evaluator-qualification\.json`/, 'what a refused attempt leaves'],
    [
      /The staged bytes the comparison accepted are the bytes copied into the run directory and read for the vote/,
      'that the staged bytes are copied and read once',
    ],
  ]) {
    check(pattern.test(section), `the reference's score input integrity section does not name ${what}`);
  }
  for (const [pattern, what] of [
    [/can rewrite both/, 'the sentence that a process able to write the run directory can rewrite a file and its digest'],
    [/a target's leftover process can\./, 'the sentence that a leftover process of an opted-out run can rewrite them'],
    [/can substitute an artifact that passes/, 'the sentence that a staged artifact can be substituted'],
    [/Story 1\.68/, 'a pointer to the story that has now closed the limit'],
    [/unless it exits 4, 5 or 64/, 'the exemption of the exits that state no verdict'],
  ]) {
    check(!pattern.test(reference), `the reference still carries ${what}`);
  }
  const qualifying = reference.slice(reference.indexOf('### Qualifying a sealed-brief agent\n'));
  check(
    /The call is held to the bytes the runtime wrote, the way `score` holds its inputs \(see \[Score input integrity\]/.test(
      qualifying.slice(0, qualifying.search(/^### (?!Qualifying)/m)),
    ),
    "the reference's qualification section does not say an attempt's score call is held to the bytes the runtime wrote",
  );
  const passedRow = reference.split('\n').find((line) => /^\| 3-5\s+\|/.test(line)) ?? '';
  check(
    /Score input integrity/.test(passedRow) && /exit and reason lines are what the held inputs produce/.test(passedRow),
    "the reference's exit 3-5 row does not say a stage's exit is passed through only while the call's artifact, exit and reason lines are what the held inputs produce",
  );
  const exitRow = reference.split('\n').find((line) => /^\| 12\s+\| infrastructure:/.test(line)) ?? '';
  check(
    /an input that changed or appeared while a call ran/.test(exitRow) &&
      /a call whose staged artifact, exit or `eval-quality:` diagnostic lines the held inputs do not reproduce/.test(exitRow) &&
      /an input that changed or was not the bytes the runtime wrote, or a staged artifact, exit or `eval-quality:` line the held bytes do not give/.test(
        exitRow,
      ),
    "the reference's exit 12 row does not name an input that changed during a call, or a call whose artifact, exit or diagnostic lines the held inputs do not reproduce",
  );
}

/** Every score input path of a run, as the enumeration should list them. */
function expectedScoreInputs(index) {
  return [
    index.contract,
    index.preflightVerdict,
    index.evaluatorConfiguration,
    index.policy,
    ...index.trialSets.flatMap((set) => [set.probe, ...set.records, set.isolationManifest]),
  ].sort();
}

/**
 * The inputs `score` held between the check and the engine's read (Story 1.68, AD-6, AD-7, AD-12): the module's own
 * units over a real run, a normal and a repeated score, the recorded argv, and a process that rewrites an input for
 * the engine's read and restores it, plants a manifest or substitutes a well-formed artifact with altered outcomes.
 */
async function checkHeldInputs() {
  const engine = await loadEngine();
  const { holdScoreInputs, scoreInputList } = require('../cli/lib/evaluate/score-inputs');
  const made = makeProject('held-inputs', { unconfined: true });
  const ran = evaluate(['run', '--evaluation', made.folder], made.env);
  check(ran.status === 0, `the run for the held-input cases exited ${ran.status}: ${ran.output}`);
  const runDirectory = runDirectoryOf(made.folder);
  if (runDirectory === null) return;
  const runName = path.basename(runDirectory);
  const index = readJson(path.join(runDirectory, 'trial-sets.json'));
  const record = readJson(path.join(runDirectory, 'run.json'));
  const probes = index.trialSets.map((set) => set.probeId);
  const scoreArgs = ['score', '--evaluation', made.folder, '--run', runName];
  const evidenceIn = (directory) =>
    directory === null ? [] : fs.readdirSync(directory, { recursive: true }).filter((entry) => entry.endsWith('evidence-artifact.json'));

  // The enumeration lists every file the engine reads once, and holds none twice.
  const inputs = scoreInputList({ runDirectory, index, record });
  check(
    JSON.stringify(inputs.map((input) => input.relative).sort()) === JSON.stringify(expectedScoreInputs(index)),
    `the score inputs are ${JSON.stringify(inputs.map((input) => input.relative))}; the run's trial-sets.json names ${JSON.stringify(expectedScoreInputs(index))}`,
  );
  check(
    inputs.every((input) => typeof input.expected === 'string' && input.what.length > 0),
    'a score input has no recorded digest or no name',
  );

  // A normal score and a repeated score are unchanged: both hold evidence, the two agree byte for byte, and a direct
  // eval-quality score on the recorded argv with a fresh `--out` reproduces each.
  const firstScore = evaluate(scoreArgs, made.env);
  const secondScore = evaluate(scoreArgs, made.env);
  check(
    firstScore.status === 0 && secondScore.status === 0,
    `a normal and a repeated score exited ${firstScore.status} and ${secondScore.status}`,
  );
  const invocations = fs.readdirSync(path.join(runDirectory, 'scores')).sort();
  check(invocations.length === 2, `two scores left ${JSON.stringify(invocations)}`);
  const [firstDirectory, secondDirectory] = invocations.map((name) => path.join(runDirectory, 'scores', name));
  for (const probeId of probes) {
    const files = [firstDirectory, secondDirectory].map((directory) => path.join(directory, probeId, 'evidence-artifact.json'));
    check(
      files.every((file) => fs.existsSync(file)) && fs.readFileSync(files[0]).equals(fs.readFileSync(files[1])),
      `${probeId}: the repeated score did not hold the same evidence as the first`,
    );
    const call = written(path.join(secondDirectory, probeId, 'score.json'), `${probeId}'s repeated score call`);
    if (call === null) continue;
    // The recorded argv names the run directory's own files; only `--out` names the private staging file.
    const named = call.argv.filter((argument, position) =>
      /^--(record|contract|probe|preflight-verdict|policy|isolation-manifest|evaluator-configuration)$/.test(call.argv[position - 1] ?? ''),
    );
    check(
      named.length >= 7 && named.every((file) => file.startsWith(`${runDirectory}${path.sep}`)),
      `${probeId}: the recorded argv names a path outside the run directory: ${JSON.stringify(named)}`,
    );
    const out = call.argv[call.argv.indexOf('--out') + 1];
    check(!out.startsWith(runDirectory) && path.basename(out) === 'evidence-artifact.json', `${probeId}: the recorded --out is ${out}`);
  }
  checkDirectRerun('the normal score', firstDirectory);
  checkDirectRerun('the repeated score', secondDirectory);

  // Files the cases below rewrite, link or remove; they are put back whatever a case throws.
  const [firstSet, secondSet] = index.trialSets;
  const recordFile = path.join(runDirectory, firstSet.records[0]);
  const manifestFile = path.join(runDirectory, secondSet.isolationManifest);
  const indexFile = path.join(runDirectory, 'trial-sets.json');
  const preflightFile = path.join(runDirectory, index.preflightVerdict);
  const runFile = path.join(runDirectory, 'run.json');
  const originals = [recordFile, manifestFile, indexFile, preflightFile, runFile].map((file) => [file, fs.readFileSync(file)]);
  const [, manifestBytes] = originals[1];
  const [, recordBytes] = originals[0];
  const [, indexBytes] = originals[2];
  try {
    // The module over the real run: what is held reproduces each persisted artifact, and the check finds a change.
    const heldInputs = holdScoreInputs({ runDirectory, index, record, engine });
    for (const set of index.trialSets) {
      const reproduced = await heldInputs.reproduce(set);
      const persisted = path.join(secondDirectory, set.probeId, 'evidence-artifact.json');
      check(
        reproduced.artifact !== null && fs.existsSync(persisted) && reproduced.artifact.equals(fs.readFileSync(persisted)),
        `${set.probeId}: the in-process score of the held bytes is not byte-identical to the persisted evidence`,
      );
      check(
        reproduced.exitCode === 0 && reproduced.lines.length === 0,
        `${set.probeId}: the in-process score of the held bytes gives exit ${reproduced.exitCode} and lines ${JSON.stringify(reproduced.lines)}; the clean score exited 0 with none`,
      );
    }
    check(heldInputs.changedSince() === null, 'a freshly held run reports a changed input');
    // The re-score reads the held bytes and nothing from the run directory: a record rewritten on disk since the hold
    // does not change what it returns.
    const flipped = JSON.parse(recordBytes.toString('utf8'));
    flipped.evaluatorRecommendation = flipped.evaluatorRecommendation === 'FAIL' ? 'PASS' : 'FAIL';
    fs.writeFileSync(recordFile, `${JSON.stringify(flipped)}\n`);
    const fromHeld = await heldInputs.reproduce(firstSet);
    check(
      fromHeld.artifact !== null &&
        fromHeld.artifact.equals(fs.readFileSync(path.join(secondDirectory, firstSet.probeId, 'evidence-artifact.json'))),
      'the in-process score read a record from the run directory instead of the held bytes',
    );
    fs.writeFileSync(recordFile, recordBytes);
    fs.writeFileSync(recordFile, `${recordBytes.toString('utf8')} `);
    const rewritten = heldInputs.changedSince();
    check(
      rewritten?.relative === firstSet.records[0] && /changed after the input check/.test(rewritten.message),
      `a rewritten record was reported as ${JSON.stringify(rewritten)}`,
    );
    fs.rmSync(recordFile);
    fs.symlinkSync(path.join(runDirectory, firstSet.probe), recordFile);
    const linked = heldInputs.changedSince();
    check(
      linked?.relative === firstSet.records[0] && /symbolic link/.test(linked.message),
      `a record swapped for a link was reported as ${JSON.stringify(linked)}`,
    );
    fs.rmSync(recordFile);
    fs.writeFileSync(recordFile, recordBytes);
    check(heldInputs.changedSince() === null, 'the restored record is still reported as changed');
    check(heldInputs.anchorFinding(firstSet.records[0]) === null, 'a record the run sealed has an anchoring finding');
    let unknown = null;
    try {
      heldInputs.entry('eval-contract-other.json');
    } catch (error) {
      unknown = error.message;
    }
    check(/not a score input/.test(unknown ?? ''), `a path that is no score input was held: ${unknown}`);

    // A manifest absent at the check holds as absent: no file is handed to the engine, the held bytes give no artifact,
    // and a file that appears afterwards is named.
    fs.rmSync(manifestFile);
    const withoutManifest = holdScoreInputs({ runDirectory, index, record, engine });
    check(withoutManifest.exists(secondSet.isolationManifest) === false, 'an absent manifest was held as present');
    const invalidWithout = await withoutManifest.reproduce(secondSet);
    check(
      invalidWithout.artifact === null &&
        invalidWithout.exitCode === 3 &&
        invalidWithout.lines.some((line) => /^eval-quality: invalid: .*isolation manifest absent/.test(line)),
      `the held bytes of a set with no manifest give ${JSON.stringify(invalidWithout)}; expected no artifact, exit 3 and the absent-manifest reason`,
    );
    check(withoutManifest.changedSince() === null, 'an absent manifest is reported as changed before anything appears');
    fs.writeFileSync(manifestFile, manifestBytes);
    const appeared = withoutManifest.changedSince();
    check(
      appeared?.relative === secondSet.isolationManifest && /appeared after the input check/.test(appeared.message),
      `a manifest that appeared was reported as ${JSON.stringify(appeared)}`,
    );

    // A process rewrites an input for the engine's read and restores it before the call returns, or substitutes a
    // well-formed artifact with altered outcomes: the staged artifact is not the one the held bytes produce.
    const attacks = [
      ...['record', 'contract', 'preflight', 'policy', 'configuration', 'probe', 'manifest'].map((kind) => [
        `restore-${kind}`,
        /verified inputs/,
        probes,
      ]),
      // Bytes that are no JSON make the engine fault with no artifact (exit 4 or 5); the held bytes still produce one.
      ['restore-unreadable', /the call staged no evidence artifact, and the verified inputs produce one/, probes, [4, 5]],
      ['forge-outcomes', /differs from the one the verified inputs produce/, probes],
      // The same value in other bytes: only a byte comparison tells it from the engine's own artifact.
      ['reformat-artifact', /differs from the one the verified inputs produce/, probes],
      ['reorder-artifact', /differs from the one the verified inputs produce/, probes],
      // A repeated key is refused earlier still, by the copy check's lexical read.
      ['duplicate-key-artifact', /is not canonical JSON the engine reads/, probes],
    ];
    for (const [mode, reason, refused, engineExits] of attacks) {
      const directory = tempDir(`held-${mode}`);
      const log = path.join(directory, 'argv.log');
      const scored = evaluate(scoreArgs, {
        ...made.env,
        [ENGINE_CLI_ENV]: RACE_ENGINE,
        TEA_RACE_LOG: log,
        TEA_RACE_MODE: mode,
        TEA_RACE_TARGET: directory,
      });
      const scoreDirectory = latestScoreDirectory(runDirectory);
      check(
        scored.status === 12,
        `${mode}: a call whose artifact the held inputs do not reproduce exited ${scored.status}; expected 12\n${scored.output}`,
      );
      check(
        loggedCalls(log).length === probes.length,
        `${mode}: the engine was called ${loggedCalls(log).length} time(s) for ${probes.length} probe(s)`,
      );
      const summary = scoreDirectory === null ? null : written(path.join(scoreDirectory, 'score.json'), `${mode}'s score summary`);
      for (const probeId of refused) {
        const entry = summary?.scores?.find((candidate) => candidate.probeId === probeId);
        check(
          entry?.evidence === null && reason.test(entry?.failure ?? ''),
          `${mode}, ${probeId}: the summary entry is ${JSON.stringify(entry)}; expected no evidence and ${reason}`,
        );
      }
      check(evidenceIn(scoreDirectory).length === 0, `${mode}: evidence was copied: ${JSON.stringify(evidenceIn(scoreDirectory))}`);
      if (engineExits !== undefined) {
        const call = scoreDirectory === null ? null : written(path.join(scoreDirectory, probes[0], 'score.json'), `${mode}'s score call`);
        check(engineExits.includes(call?.exitCode), `${mode}: the engine call exited ${call?.exitCode}; expected one of ${engineExits}`);
      }
      // The shim put the inputs back, so the held bytes still stand.
      check(heldInputs.changedSince() === null, `${mode}: an input is still changed after the shim restored it`);
    }

    // A staged artifact where the verified inputs give none: P-002's manifest is left out, so the engine calls the set
    // Invalid and stages nothing, and a process stages the clean score's evidence for it anyway.
    fs.rmSync(manifestFile);
    const stashLog = path.join(tempDir('held-stash'), 'argv.log');
    const stashed = evaluate(scoreArgs, {
      ...made.env,
      [ENGINE_CLI_ENV]: RACE_ENGINE,
      TEA_RACE_LOG: stashLog,
      TEA_RACE_MODE: 'stage-stashed',
      TEA_RACE_PROBE: secondSet.probeId,
      TEA_RACE_STASH_DIR: firstDirectory,
    });
    const stashDirectory = latestScoreDirectory(runDirectory);
    check(
      stashed.status === 12,
      `a staged artifact over a set the engine called Invalid exited ${stashed.status}; expected 12\n${stashed.output}`,
    );
    const stashSummary =
      stashDirectory === null ? null : written(path.join(stashDirectory, 'score.json'), "the stashed artifact's summary");
    const stashEntry = stashSummary?.scores?.find((candidate) => candidate.probeId === secondSet.probeId);
    check(
      stashEntry?.evidence === null && /which produce no artifact/.test(stashEntry?.failure ?? ''),
      `the stashed artifact's entry is ${JSON.stringify(stashEntry)}`,
    );
    check(
      !fs.existsSync(path.join(stashDirectory, secondSet.probeId, 'evidence-artifact.json')),
      'an artifact staged over a set the verified inputs give none was copied',
    );
    fs.writeFileSync(manifestFile, manifestBytes);

    // Presence is read from the one open that reads the bytes: a link at a manifest path that points nowhere is a link
    // to refuse (exit 10, no engine call), not an absent manifest.
    const danglingLog = path.join(tempDir('held-dangling'), 'argv.log');
    fs.rmSync(manifestFile);
    fs.symlinkSync(path.join(runDirectory, 'nowhere.json'), manifestFile);
    const dangling = evaluate(scoreArgs, { ...made.env, [ENGINE_CLI_ENV]: RACE_ENGINE, TEA_RACE_LOG: danglingLog });
    check(
      dangling.status === 10 && /isolation-manifest\.json/.test(dangling.output) && /symbolic link/.test(dangling.output),
      `a manifest path holding a dangling link exited ${dangling.status}; expected 10 naming the link\n${dangling.output}`,
    );
    check(loggedCalls(danglingLog).length === 0, 'score called the engine over a dangling link at a manifest path');
    fs.rmSync(manifestFile);
    fs.writeFileSync(manifestFile, manifestBytes);

    // A path the index names as two kinds of input is refused before any engine call, whichever digest it would match.
    editJson(indexFile, (value) => (value.policy = value.contract));
    const aliasLog = path.join(tempDir('held-alias'), 'argv.log');
    const aliased = evaluate(scoreArgs, { ...made.env, [ENGINE_CLI_ENV]: RACE_ENGINE, TEA_RACE_LOG: aliasLog });
    check(
      aliased.status === 10 && /is named as both the compiled contract and the policy the run used/.test(aliased.output),
      `an index naming the contract as the policy exited ${aliased.status}; expected 10 naming both roles\n${aliased.output}`,
    );
    check(loggedCalls(aliasLog).length === 0, 'score called the engine over an index naming one path as two inputs');
    fs.writeFileSync(indexFile, indexBytes);

    // The call's exit is compared with the exit the held bytes give, so an artifact that agrees is not enough. A clean
    // run: an input is rewritten so the engine exits 3, put back, and the earlier clean artifact is staged in its place.
    const exitAttack = (label, mode, kind, reason) => {
      const log = path.join(tempDir(`held-exit-${label}`), 'argv.log');
      const attacked = evaluate(scoreArgs, {
        ...made.env,
        [ENGINE_CLI_ENV]: RACE_ENGINE,
        TEA_RACE_LOG: log,
        TEA_RACE_MODE: mode,
        TEA_RACE_KIND: kind,
        TEA_RACE_STASH_DIR: firstDirectory,
      });
      const directory = latestScoreDirectory(runDirectory);
      const summary = directory === null ? null : written(path.join(directory, 'score.json'), `${label}'s score summary`);
      check(attacked.status === 12, `${label}: exited ${attacked.status}; expected 12\n${attacked.output}`);
      for (const probeId of probes) {
        const entry = summary?.scores?.find((candidate) => candidate.probeId === probeId);
        check(
          entry?.evidence === null && reason.test(entry?.failure ?? ''),
          `${label}, ${probeId}: the summary entry is ${JSON.stringify(entry)}; expected no evidence and ${reason}`,
        );
      }
      check(evidenceIn(directory).length === 0, `${label}: evidence was copied: ${JSON.stringify(evidenceIn(directory))}`);
    };
    exitAttack('restage-over-an-exit-3', 'restore-and-restage', 'preflight', /the call exited 3 where the verified inputs give 0/);

    // An Invalid run: the preflight verdict is sealed as failed (a clean score exits 3 with no artifact). It is rewritten
    // as passed for the engine's read, put back, and the staged artifact removed: nothing is staged, exactly what the
    // held bytes give, and only the exit (0) is not.
    const sealedFailed = Buffer.from(`${JSON.stringify({ ...readJson(preflightFile), passed: false }, null, 2)}\n`, 'utf8');
    fs.writeFileSync(preflightFile, sealedFailed);
    editJson(runFile, (value) => (value.artifacts.preflightVerdict = engine.digestBytes(sealedFailed)));
    const invalidScore = evaluate(scoreArgs, made.env);
    check(
      invalidScore.status === 3,
      `a run sealed with a failed preflight verdict exited ${invalidScore.status}; expected 3\n${invalidScore.output}`,
    );
    exitAttack('unstage-an-exit-0', 'restore-and-unstage', 'preflight-pass', /the call exited 0 where the verified inputs give 3/);
    // The same Invalid run, rewritten into another invalidating condition for the engine's read: both exit 3 with no
    // artifact, and only the reasons on stderr differ from what the held bytes give.
    exitAttack(
      'another-reason-for-an-exit-3',
      'restore-and-unstage',
      'configuration',
      /diagnostics differ from those the verified inputs give/,
    );
    for (const [file, bytes] of originals.slice(3)) fs.writeFileSync(file, bytes);

    // A manifest absent at the check and planted before the call returns is named as appeared since the check; the set
    // the shim leaves alone is still copied.
    fs.rmSync(manifestFile);
    const plantLog = path.join(tempDir('held-plant'), 'argv.log');
    const planted = evaluate(scoreArgs, {
      ...made.env,
      [ENGINE_CLI_ENV]: RACE_ENGINE,
      TEA_RACE_LOG: plantLog,
      TEA_RACE_MODE: 'plant-manifest',
      TEA_RACE_PROBE: secondSet.probeId,
      TEA_RACE_TARGET: runDirectory,
    });
    const plantDirectory = latestScoreDirectory(runDirectory);
    check(planted.status === 12, `a manifest planted after the check exited ${planted.status}; expected 12\n${planted.output}`);
    const plantSummary =
      plantDirectory === null ? null : written(path.join(plantDirectory, 'score.json'), "the planted manifest's summary");
    const plantedEntry = plantSummary?.scores?.find((candidate) => candidate.probeId === secondSet.probeId);
    check(
      plantedEntry?.evidence === null &&
        new RegExp(`${secondSet.isolationManifest.replaceAll('.', String.raw`\.`)} appeared after the input check`).test(
          plantedEntry?.failure ?? '',
        ),
      `the planted manifest's entry is ${JSON.stringify(plantedEntry)}`,
    );
    check(
      JSON.stringify(evidenceIn(plantDirectory).map((entry) => entry.split(path.sep)[0])) === JSON.stringify([firstSet.probeId]),
      `a planted manifest left evidence ${JSON.stringify(evidenceIn(plantDirectory))}; expected only ${firstSet.probeId}'s`,
    );
    fs.rmSync(manifestFile);
    fs.writeFileSync(manifestFile, manifestBytes);
  } finally {
    for (const [file, bytes] of originals) {
      fs.rmSync(file, { force: true });
      fs.writeFileSync(file, bytes);
    }
  }
}

/**
 * What the re-score returns when the library refuses the held bytes or the CLI would refuse them before scoring, what a
 * diagnostic line looks like when the held bytes give a qualification failure, and a newline inside a diagnostic
 * (Story 1.68). Each case works on a snapshot of the run directory, put back afterwards.
 */
async function checkHeldDiagnostics() {
  const engine = await loadEngine();
  const { holdScoreInputs } = require('../cli/lib/evaluate/score-inputs');
  const made = makeProject('held-diagnostics', { unconfined: true });
  const ran = evaluate(['run', '--evaluation', made.folder], made.env);
  check(ran.status === 0, `the run for the held-diagnostic cases exited ${ran.status}: ${ran.output}`);
  const runDirectory = runDirectoryOf(made.folder);
  if (runDirectory === null) return;
  const scoreArgs = ['score', '--evaluation', made.folder, '--run', path.basename(runDirectory)];
  const index = readJson(path.join(runDirectory, 'trial-sets.json'));
  const record = () => readJson(path.join(runDirectory, 'run.json'));
  const [firstSet, secondSet] = index.trialSets;
  const snapshot = path.join(tempDir('held-diagnostics-snapshot'), 'run');
  fs.cpSync(runDirectory, snapshot, { recursive: true });
  const restore = () => {
    fs.rmSync(runDirectory, { recursive: true });
    fs.cpSync(snapshot, runDirectory, { recursive: true });
  };
  /** Rewrites a JSON file of the run and restamps the digests that name it, the way a run that sealed it would hold them. */
  const reseal = (relative, edit, restamp) => {
    const file = path.join(runDirectory, relative);
    editJson(file, edit);
    const digest = engine.digestBytes(fs.readFileSync(file));
    editJson(path.join(runDirectory, 'run.json'), (value) => restamp(value, digest));
    return digest;
  };
  /** The `eval-quality:` pieces of a stderr text, split the way the CLI's lines are. */
  const diagnosticsOf = (text) => text.split('\n').filter((line) => line.startsWith('eval-quality: '));
  try {
    // The library refuses the held bytes with a structural failure (exit 4), a runtime fault or any other error (exit 5),
    // and a private-storage manifest reference is a usage error (exit 64) the CLI raises before it scores.
    const held = holdScoreInputs({ runDirectory, index, record: record(), engine });
    const refusing = (error) =>
      holdScoreInputs({
        runDirectory,
        index,
        record: record(),
        engine: {
          ...engine,
          runScore: async () => {
            throw error;
          },
        },
      });
    for (const [label, error, exitCode] of [
      ['a structural failure', new engine.StructuralFailure('binding-cycle', 'EvalContract', 'refused'), 4],
      ['a runtime fault', new engine.RuntimeFault('schema-parse-failure', 'Probe', 'refused'), 5],
      ['an error of neither class', new Error('a defect'), 5],
    ]) {
      const refused = await refusing(error).reproduce(firstSet);
      check(
        refused.artifact === null && refused.exitCode === exitCode && refused.lines === null,
        `the re-score of ${label} is ${JSON.stringify(refused)}; expected no artifact, exit ${exitCode} and no lines`,
      );
    }
    const privateRecord = path.join(runDirectory, firstSet.records[0]);
    editJson(privateRecord, (value) => (value.isolationManifestArtifact.storage = 'private'));
    const usage = await holdScoreInputs({ runDirectory, index, record: record(), engine }).reproduce(firstSet);
    check(
      usage.artifact === null && usage.exitCode === 64 && usage.lines === null,
      `the re-score of a private-storage manifest reference is ${JSON.stringify(usage)}; expected no artifact, exit 64 and no lines`,
    );
    restore();
    check((await held.reproduce(firstSet)).exitCode === 0, 'the re-score of an unchanged run is not exit 0');

    // A probe the engine rejects: the held bytes give a qualification failure line and an Invalid basis. A clean score
    // passes the engine's exit 3 through, and the lines the re-score gives are the ones the CLI printed.
    reseal(
      firstSet.probe,
      (value) => (value.probeClass = 'defect'),
      (value, digest) => (value.artifacts.probes[firstSet.probeId] = digest),
    );
    const rejected = evaluate(scoreArgs, made.env);
    check(
      rejected.status === 3,
      `a score over a probe the engine rejects exited ${rejected.status}; expected the engine's 3\n${rejected.output}`,
    );
    const rejectedDirectory = latestScoreDirectory(runDirectory);
    const rejectedCall =
      rejectedDirectory === null ? null : written(path.join(rejectedDirectory, firstSet.probeId, 'score.json'), 'the rejected probe call');
    const printed = diagnosticsOf(rejectedCall?.stderr ?? '');
    check(
      printed.some((line) => line.startsWith('eval-quality: qualification-route-incompatible: ')) &&
        printed.some((line) => line.startsWith('eval-quality: invalid: ')),
      `the rejected probe's call printed ${JSON.stringify(printed)}; expected a qualification failure line and an Invalid basis line`,
    );
    const rejectedRun = holdScoreInputs({ runDirectory, index, record: record(), engine });
    const reproduced = await rejectedRun.reproduce(firstSet);
    check(
      reproduced.exitCode === 3 &&
        reproduced.artifact === null &&
        JSON.stringify(reproduced.lines.flatMap((line) => diagnosticsOf(line))) === JSON.stringify(printed),
      `the re-score of the rejected probe is ${JSON.stringify(reproduced)}; the CLI printed ${JSON.stringify(printed)}`,
    );
    restore();

    // A newline inside a diagnostic (a mount path the confinement audit reported): the CLI writes it as it is, and an
    // untampered run it scores Invalid is not refused. The control without the newline scores the same way.
    const sealMount = (mount) => {
      const digest = reseal(
        secondSet.isolationManifest,
        (value) => (value.observedMounts = [mount]),
        (value, sealed) => (value.artifacts.isolationManifests[secondSet.probeId] = sealed),
      );
      for (const relative of secondSet.records) {
        editJson(path.join(runDirectory, relative), (value) => (value.isolationManifestArtifact.digest = digest));
        editJson(path.join(runDirectory, 'run.json'), (value) => {
          value.artifacts.records[relative] = engine.digestBytes(fs.readFileSync(path.join(runDirectory, relative)));
        });
      }
    };
    for (const [label, mount] of [
      ['without a newline', '/tmp/evilname'],
      ['with a newline', '/tmp/evil\nname'],
    ]) {
      restore();
      sealMount(mount);
      const scored = evaluate(scoreArgs, made.env);
      const directory = latestScoreDirectory(runDirectory);
      const call = directory === null ? null : written(path.join(directory, secondSet.probeId, 'score.json'), `the mount ${label}`);
      check(
        scored.status === 3 && call?.exitCode === 3,
        `a score over an observed mount ${label} exited ${scored.status} with the call at ${call?.exitCode}; expected 3 for both\n${scored.output}`,
      );
      check(
        /mount outside allowlist/.test(call?.stderr ?? ''),
        `the call over a mount ${label} did not name the mount: ${JSON.stringify(call?.stderr)}`,
      );
      if (mount.includes('\n')) {
        const given = await holdScoreInputs({ runDirectory, index, record: record(), engine }).reproduce(secondSet);
        check(
          given.lines.some((line) => line.includes('\n')),
          `the re-score of a mount with a newline gave ${JSON.stringify(given.lines)}; expected a line that carries it`,
        );
      }
    }
  } finally {
    restore();
  }
}

/**
 * The aggregate call (Story 1.45) held to the same inputs (Story 1.68): the run's policy rewritten for the aggregate's
 * read and kept, rewritten and restored, or made unreadable and restored, and a well-formed aggregate substituted. A
 * clean score reproduces the persisted aggregate byte for byte.
 */
async function checkHeldAggregate() {
  const engine = await loadEngine();
  const { holdScoreInputs } = require('../cli/lib/evaluate/score-inputs');
  const made = makeProject('held-aggregate', { unconfined: true });
  const ran = evaluate(['run', '--evaluation', made.folder], made.env);
  check(ran.status === 0, `the run for the held-aggregate cases exited ${ran.status}: ${ran.output}`);
  const runDirectory = runDirectoryOf(made.folder);
  if (runDirectory === null) return;
  const scoreArgs = ['score', '--evaluation', made.folder, '--run', path.basename(runDirectory)];
  const index = readJson(path.join(runDirectory, 'trial-sets.json'));
  const snapshot = path.join(tempDir('held-aggregate-snapshot'), 'run');
  fs.cpSync(runDirectory, snapshot, { recursive: true });
  const restore = () => {
    fs.rmSync(runDirectory, { recursive: true });
    fs.cpSync(snapshot, runDirectory, { recursive: true });
  };
  const scored = (mode) =>
    evaluate(scoreArgs, {
      ...made.env,
      [ENGINE_CLI_ENV]: RACE_ENGINE,
      TEA_RACE_LOG: path.join(tempDir('held-aggregate-log'), 'argv.log'),
      TEA_RACE_AGGREGATE: mode,
      TEA_RACE_TARGET: runDirectory,
    });
  const summaryOf = () => {
    const directory = latestScoreDirectory(runDirectory);
    return { directory, summary: directory === null ? null : written(path.join(directory, 'score.json'), 'the aggregate score summary') };
  };
  try {
    // A clean score: the aggregate the CLI staged is what the held bytes give, byte for byte and in its exit.
    const clean = scored('');
    check(clean.status === 0, `a clean score with the aggregate exited ${clean.status}\n${clean.output}`);
    const { directory: cleanDirectory, summary: cleanSummary } = summaryOf();
    check(
      cleanSummary?.strengthAggregate?.status === 'copied',
      `the clean aggregate is ${JSON.stringify(cleanSummary?.strengthAggregate)}`,
    );
    if (cleanDirectory !== null) {
      const held = holdScoreInputs({ runDirectory, index, record: readJson(path.join(runDirectory, 'run.json')), engine });
      const reproduced = held.reproduceAggregate({
        evidence: index.trialSets.map((set) => fs.readFileSync(path.join(cleanDirectory, set.probeId, 'evidence-artifact.json'))),
        floors: fs.readFileSync(path.join(cleanDirectory, 'strength-floors.json')),
      });
      const persisted = path.join(cleanDirectory, 'strength-aggregate.json');
      check(
        reproduced.exitCode === 0 && fs.existsSync(persisted) && reproduced.aggregate?.equals(fs.readFileSync(persisted)),
        'the in-process aggregate of the held bytes is not byte-identical to the persisted aggregate',
      );
      // Floors that are no JSON are a fault of an input (exit 5), and a set the engine refuses is exit 4.
      const faulted = held.reproduceAggregate({ evidence: [], floors: Buffer.from('not json') });
      check(
        faulted.aggregate === null && faulted.exitCode === 5,
        `the aggregate of floors that are no JSON is ${JSON.stringify(faulted)}; expected none and exit 5`,
      );
      // The policy is read through the lexical scanner too: a repeated key is a fault (exit 5), not an aggregate.
      const policyFile = path.join(runDirectory, index.policy);
      const policyText = fs.readFileSync(policyFile, 'utf8');
      fs.writeFileSync(policyFile, policyText.replace('{', '{"policyId":"first",'));
      const duplicated = holdScoreInputs({
        runDirectory,
        index,
        record: readJson(path.join(runDirectory, 'run.json')),
        engine,
      }).reproduceAggregate({
        evidence: index.trialSets.map((set) => fs.readFileSync(path.join(cleanDirectory, set.probeId, 'evidence-artifact.json'))),
        floors: fs.readFileSync(path.join(cleanDirectory, 'strength-floors.json')),
      });
      fs.writeFileSync(policyFile, policyText);
      check(
        duplicated.aggregate === null && duplicated.exitCode === 5,
        `the aggregate over a policy with a repeated key is ${JSON.stringify(duplicated)}; expected none and exit 5`,
      );
      const firstEvidence = fs.readFileSync(path.join(cleanDirectory, index.trialSets[0].probeId, 'evidence-artifact.json'));
      const refused = held.reproduceAggregate({
        evidence: [firstEvidence, firstEvidence],
        floors: fs.readFileSync(path.join(cleanDirectory, 'strength-floors.json')),
      });
      check(
        refused.aggregate === null && refused.exitCode === 4,
        `the aggregate of one probe's evidence twice is ${JSON.stringify(refused)}; expected none and exit 4`,
      );
    }
    const aggregateReason = (mode) => {
      restore();
      const attacked = scored(mode);
      const { directory, summary } = summaryOf();
      check(attacked.status === 12, `${mode}: the aggregate call exited ${attacked.status}; expected 12\n${attacked.output}`);
      check(
        summary?.strengthAggregate?.status === 'mismatch',
        `${mode}: the aggregate is ${JSON.stringify(summary?.strengthAggregate)}; expected a mismatch`,
      );
      check(
        directory !== null && !fs.existsSync(path.join(directory, 'strength-aggregate.json')),
        `${mode}: an aggregate was copied for a call the held inputs do not stand behind`,
      );
      return summary?.strengthAggregate?.reason ?? '';
    };
    // The policy rewritten for the aggregate's read and kept: the file is named.
    const policyFile = index.policy;
    check(
      new RegExp(`${policyFile.replaceAll('.', String.raw`\.`)} changed after the input check`).test(aggregateReason('rewrite-policy')),
      'a policy rewritten for the aggregate and kept was not named',
    );
    // Rewritten for the read and restored: the engine refuses a policy the evidence does not name (exit 4) where the
    // held bytes give an aggregate, and only that exit shows it.
    check(
      /the call exited 4 where the verified inputs give 0/.test(aggregateReason('restore-policy')),
      'a policy rewritten for the aggregate and restored was not refused for its exit',
    );
    // Unreadable for the read and restored: the call exits 5 where the held bytes give an aggregate.
    check(
      /the call exited 5 where the verified inputs give 0/.test(aggregateReason('garble-policy')),
      'a policy made unreadable for the aggregate and restored was not refused for its exit',
    );
    // A usage error from the aggregate call (exit 64) is one the held bytes never give: exit 12, not a pass-through.
    check(
      /the call exited 64 where the verified inputs give 0/.test(aggregateReason('usage-error')),
      'an aggregate call that exited 64 was not refused for its exit',
    );
    // A well-formed aggregate that agrees with every digest and floor but not with the evidence.
    check(
      /differs from the one the verified inputs produce/.test(aggregateReason('forge-aggregate')),
      'a well-formed substituted aggregate was not refused',
    );
  } finally {
    restore();
  }
}

/** What the first plan step of a trial printed on stdout, from its evidence file. */
function trialStdout(runDirectory, arm, trialIndex) {
  const evidence =
    runDirectory === null
      ? null
      : written(path.join(runDirectory, 'trials', arm, `trial-${trialIndex}.json`), `${arm} trial ${trialIndex}`);
  const stdout = evidence?.steps?.[0]?.observation?.stdout;
  return typeof stdout === 'string' ? stdout : String(stdout?.value ?? '');
}

/** Blocks the event loop for `ms`: the cases around it run the CLI synchronously. */
function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * A listener on 127.0.0.1 (`fixtures/evaluate/report-listener.cjs`) that a
 * stub's leftover process reports its attempt to, since a confined process
 * can write nothing a test could read: `port` to hand the stub, `line(pattern)`
 * waiting ten seconds at most for a reported line that matches, and `close()`.
 */
function reportListener(label) {
  const directory = tempDir(`${label}-listener`);
  const lines = path.join(directory, 'lines.txt');
  const portFile = path.join(directory, 'port');
  const child = spawn(process.execPath, [REPORT_LISTENER, lines, portFile], { stdio: 'ignore' });
  const deadline = Date.now() + 10_000;
  while (!fs.existsSync(portFile) && Date.now() < deadline) pause(20);
  const port = fs.existsSync(portFile) ? fs.readFileSync(portFile, 'utf8').trim() : '';
  const read = () => (fs.existsSync(lines) ? fs.readFileSync(lines, 'utf8') : '');
  return {
    port,
    line(pattern) {
      const until = Date.now() + 10_000;
      for (;;) {
        const found = read()
          .split('\n')
          .find((line) => pattern.test(line));
        if (found !== undefined || Date.now() > until) return found ?? null;
        pause(50);
      }
    },
    lines: read,
    close: () => child.kill('SIGKILL'),
  };
}

/** Whether a process whose command line carries `marker` is running now. */
function running(marker) {
  const listed = spawnSync('ps', ['-A', '-o', 'args='], { encoding: 'utf8' });
  return String(listed.stdout)
    .split('\n')
    .some((line) => line.includes(marker));
}

/** Waits, a minute at most, until no process whose command line carries `marker` is running; whether none is. */
function waitUntilGone(marker) {
  const deadline = Date.now() + 60_000;
  while (running(marker)) {
    if (Date.now() > deadline) return false;
    pause(100);
  }
  return true;
}

/** The trials a run over the verdict fixture audits: every trial of the clean and the mutated arm. */
function auditedTrials() {
  return ['clean', 'mutated:M-001'].flatMap((conditionArm) =>
    Array.from({ length: TRIALS }, (_, index) => ({ conditionArm, trialIndex: index + 1 })),
  );
}

/**
 * The host-socket entries a run records (Story 1.82): `hostSocketTruncation` is a list on every completed run, empty unless a trial's
 * calls left sockets of other users reachable because the room for mounts ran out. A test host holds far fewer sockets than a call can
 * hide, so the list is empty here; the units hold the entry's shape.
 */
function checkSocketTruncationRecords(entries) {
  check(
    Array.isArray(entries) && entries.length === 0,
    `run.json records the host-socket truncation ${JSON.stringify(entries)}; expected an empty list (a test host holds fewer sockets than a call can hide)`,
  );
}

/**
 * The audit channel entries a run records (Story 1.81), one per audited trial and nothing else: each names its trial, counts
 * the canaries sent and delivered, says whether the log reported lost events, and is `lossy` exactly when the log delivered
 * fewer canaries than were sent or reported a loss. Linux's trace loses nothing and sends none, so every Linux entry is
 * `complete` with none sent; a macOS trial always sends at least the final one. A macOS trial whose canaries the log lost reads
 * as a lost report, which the lossy cases run again.
 */
function checkChannelRecords(entries, trials, { lossless = true } = {}) {
  check(Array.isArray(entries), `run.json records no observedMountsChannel list: ${JSON.stringify(entries)}`);
  if (!Array.isArray(entries)) return;
  check(
    JSON.stringify(entries.map(({ conditionArm, trialIndex }) => ({ conditionArm, trialIndex }))) === JSON.stringify(trials),
    `the audit channel names the trials ${JSON.stringify(entries.map(({ conditionArm, trialIndex }) => `${conditionArm} ${trialIndex}`))}; expected ${JSON.stringify(trials.map(({ conditionArm, trialIndex }) => `${conditionArm} ${trialIndex}`))}`,
  );
  for (const entry of entries) {
    const what = `the audit channel of ${entry.conditionArm} trial ${entry.trialIndex}`;
    check(
      JSON.stringify(Object.keys(entry).sort()) ===
        JSON.stringify(['canariesDelivered', 'canariesSent', 'completeness', 'conditionArm', 'logReportedLoss', 'trialIndex']),
      `${what} holds the fields ${JSON.stringify(Object.keys(entry))}`,
    );
    check(
      Number.isInteger(entry.canariesSent) &&
        Number.isInteger(entry.canariesDelivered) &&
        entry.canariesDelivered >= 0 &&
        entry.canariesDelivered <= entry.canariesSent &&
        typeof entry.logReportedLoss === 'boolean' &&
        entry.completeness === (entry.canariesDelivered < entry.canariesSent || entry.logReportedLoss ? 'lossy' : 'complete'),
      `${what} is ${JSON.stringify(entry)}; expected counts with delivered at most sent and 'lossy' exactly when fewer were delivered or the log reported a loss`,
    );
    if (process.platform === 'darwin') {
      check(entry.canariesSent >= 2, `${what} sent fewer than its first and final canary on macOS: ${JSON.stringify(entry)}`);
      if (lossless) {
        checkReport(
          entry.completeness === 'complete',
          `${what} lost canaries on a host the case expects to deliver every one: ${JSON.stringify(entry)}`,
        );
      }
    } else {
      check(
        entry.canariesSent === 0 && entry.canariesDelivered === 0 && entry.logReportedLoss === false && entry.completeness === 'complete',
        `${what} is ${JSON.stringify(entry)}; a Linux trial records complete with no canary sent`,
      );
    }
  }
}

/** The observed mounts of one probe's trial set in a run directory. */
function observedMountsOf(runDirectory, probeId) {
  return runDirectory === null ? null : readJson(path.join(runDirectory, 'trial-sets', probeId, 'isolation-manifest.json')).observedMounts;
}

/**
 * A command evaluator for the verdict fixture that starts through a wrapper
 * waiting a second before it runs `evaluator/impl.js`: the window Story
 * 1.31's case swaps `impl.js` in, after the run's last read of the layer.
 */
function useWrappedEvaluator(folder) {
  const evaluator = path.join(folder, 'evaluator');
  fs.mkdirSync(evaluator, { recursive: true });
  fs.cpSync(
    path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'evaluators', 'command', 'evaluator', 'mapping.json'),
    path.join(evaluator, 'mapping.json'),
  );
  fs.cpSync(
    path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'evaluators', 'command', 'evaluator', 'frameworks.json'),
    path.join(evaluator, 'frameworks.json'),
  );
  fs.writeFileSync(
    path.join(evaluator, 'judge.sh'),
    '#!/bin/sh\n# Waits a second, then runs the evaluator beside it.\nsleep 1\nexec node "$(dirname "$0")/impl.js"\n',
    {
      mode: 0o755,
    },
  );
  fs.writeFileSync(
    path.join(evaluator, 'impl.js'),
    [
      '#!/usr/bin/env node',
      "'use strict';",
      "const fs = require('node:fs');",
      "const input = JSON.parse(fs.readFileSync(0, 'utf8'));",
      "const text = (observation) => String(observation.stdout?.value ?? '');",
      "const judged = input.observations.find((observation) => text(observation).includes('verdict:')) ?? input.observations[0];",
      'const cite = [judged.observationId];',
      "const row = text(judged).includes('verdict: accepted')",
      "  ? { key: 'verdict-accepted', outcome: 'pass', observationIds: cite, comment: 'original bytes ran' }",
      "  : { key: 'verdict-accepted', outcome: 'fail', observationIds: cite, quote: 'verdict: rejected', quoteChannel: 'stdout', confidence: 0.9, comment: 'original bytes ran' };",
      'process.stdout.write(`${JSON.stringify({ rows: [row] })}\\n`);',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
    evaluation.evaluator = { kind: 'command', command: 'evaluator/judge.sh', timeoutMs: 60_000 };
  });
}

/**
 * File-system confinement (Story 1.31), in the six cases below, each against this host's real
 * mechanism (Seatbelt on macOS, Bubblewrap on Linux) and the real
 * eval-quality, with the same stub in a run that opted out as the control
 * showing the stub's attempt succeeds when nothing confines it:
 *
 * - a target that reads the evaluation folder's contract.json and writes into
 *   runs/ is refused both, the run completes, the contract is unchanged, and
 *   the audit reports both paths, which score reads as an isolation violation;
 * - a target that reads a file outside its workspace has it listed as an
 *   observed mount, which eval-quality records as an isolation violation; the
 *   same read under a registry entry declaring the file's directory in
 *   systemPaths is not reported;
 * - a platform with no mechanism refuses run with exit 12, and an evaluation
 *   that opts out runs there and records "opt-out", its note saying so;
 * - a process the target leaves running, which rewrites a sealed record and
 *   its digest in run.json once run has exited, is refused, and score passes;
 * - a process the target leaves running, which swaps a tracked evaluator/ file
 *   while the evaluator launches and has it put itself back, is refused, and
 *   the trial is judged by the bytes the run digested;
 * - the reference's section, read under its exact heading, names each
 *   platform's mechanism and what an opted-out run records.
 */
async function checkConfinedEvaluationFolder() {
  const refusal = /^refused (EPERM|EACCES|ENOENT|EROFS)$/;
  const probed = makeProject('confinement-probe');
  const contractBytes = fs.readFileSync(path.join(probed.folder, 'contract.json'));
  const probedRun = evaluate(['run', '--evaluation', probed.folder], {
    ...probed.env,
    VERDICT_WHEN: 'trial-clean-1',
    VERDICT_DO: 'probe-confinement',
  });
  check(
    probedRun.status === 0,
    `a confined run whose target probed the evaluation folder exited ${probedRun.status}; expected 0\n${probedRun.output}`,
  );
  const probedDirectory = runDirectoryOf(probed.folder);
  const probedOut = trialStdout(probedDirectory, 'clean', 1);
  const contractRead = /contract-read: (.*)/.exec(probedOut)?.[1];
  const runsWrite = /runs-write: (.*)/.exec(probedOut)?.[1];
  check(
    refusal.test(contractRead ?? ''),
    `a confined target's read of contract.json ended ${JSON.stringify(contractRead)}; expected a refusal\n${probedOut}`,
  );
  check(
    refusal.test(runsWrite ?? ''),
    `a confined target's write into runs/ ended ${JSON.stringify(runsWrite)}; expected a refusal\n${probedOut}`,
  );
  check(!fs.existsSync(path.join(probed.folder, 'runs', 'tamper.txt')), 'a confined target wrote runs/tamper.txt');
  check(fs.readFileSync(path.join(probed.folder, 'contract.json')).equals(contractBytes), 'a confined target changed contract.json');
  const probedRecord = probedDirectory === null ? {} : readJson(path.join(probedDirectory, 'run.json'));
  check(
    probedRecord.completed === true && probedRecord.confinement === CONFINEMENT,
    `the probed run records ${JSON.stringify({ completed: probedRecord.completed, confinement: probedRecord.confinement })}`,
  );
  // Each forbidden input's note names the confinement that withheld it.
  const probedNotes =
    probedDirectory === null
      ? []
      : Object.values(readJson(path.join(probedDirectory, 'trial-sets', 'P-001', 'isolation-manifest.json')).forbiddenInputAccounting).map(
          (entry) => entry.note,
        );
  check(
    probedNotes.length === 7 &&
      probedNotes.every((note) => note.includes(`Withheld as well by ${MECHANISM_NAMES[CONFINEMENT]} file-system confinement`)),
    `a confined run's forbidden-input notes do not name ${MECHANISM_NAMES[CONFINEMENT]}: ${JSON.stringify(probedNotes)}`,
  );
  const realFolder = fs.realpathSync(probed.folder);
  const probedMounts = observedMountsOf(probedDirectory, 'P-001') ?? [];
  checkReport(
    [path.join(realFolder, 'contract.json'), path.join(realFolder, 'runs', 'tamper.txt')].every((entry) => probedMounts.includes(entry)),
    `the audit did not report the evaluation folder's paths the target reached for: ${JSON.stringify(probedMounts)}`,
  );
  const probedScore = evaluate(['score', '--evaluation', probed.folder], probed.env);
  checkReport(
    probedScore.status === 3 && probedScore.output.includes(`mount outside allowlist: ${path.join(realFolder, 'contract.json')}`),
    `score over a target that reached for the contract exited ${probedScore.status}; expected 3 with the isolation violation\n${probedScore.output}`,
  );
  check(
    !probedScore.output.includes('opted out of file-system confinement'),
    `score over a confined run says it opted out\n${probedScore.output}`,
  );
  // The control: with the confinement off, the same stub reads the contract and writes into runs/.
  const probedOpen = makeProject('confinement-probe-open', { unconfined: true });
  const probedOpenRun = evaluate(['run', '--evaluation', probedOpen.folder], {
    ...probedOpen.env,
    VERDICT_WHEN: 'trial-clean-1',
    VERDICT_DO: 'probe-confinement',
  });
  const tamper = path.join(probedOpen.folder, 'runs', 'tamper.txt');
  const tampered = fs.existsSync(tamper);
  fs.rmSync(tamper, { force: true });
  const probedOpenOut = trialStdout(runDirectoryOf(probedOpen.folder), 'clean', 1);
  check(
    probedOpenRun.status === 0 && tampered && /contract-read: allowed/.test(probedOpenOut) && /runs-write: allowed/.test(probedOpenOut),
    `the unconfined control did not read the contract and write into runs/ (exit ${probedOpenRun.status}):\n${probedOpenOut}\n${probedOpenRun.output}`,
  );
}

/** A path outside the workspace, reported as an observed mount unless the registry entry declares it (Story 1.31). */
async function checkObservedMounts() {
  const outside = path.join(tempDir('confinement-outside'), 'host-notes.txt');
  fs.writeFileSync(outside, 'a file no trial was granted\n');
  const realOutside = fs.realpathSync(outside);
  const observed = makeProject('confinement-observed');
  const observedRun = evaluate(['run', '--evaluation', observed.folder], {
    ...observed.env,
    VERDICT_WHEN: 'trial-clean-1',
    VERDICT_DO: 'read-ungranted',
    VERDICT_TOUCH: outside,
  });
  check(
    observedRun.status === 0,
    `a confined run whose target read an ungranted file exited ${observedRun.status}; expected 0\n${observedRun.output}`,
  );
  const observedDirectory = runDirectoryOf(observed.folder);
  check(
    /ungranted-read: allowed/.test(trialStdout(observedDirectory, 'clean', 1)),
    'the target could not read the ungranted file, so the case proves nothing',
  );
  checkMounts(observedMountsOf(observedDirectory, 'P-001'), [realOutside], "P-001's observed mounts after a target's read");
  const otherMounts = observedMountsOf(observedDirectory, 'P-002');
  check(
    JSON.stringify(otherMounts) === '[]',
    `P-002's trials read nothing ungranted, yet its manifest lists ${JSON.stringify(otherMounts)}`,
  );
  const observedScore = evaluate(['score', '--evaluation', observed.folder], observed.env);
  checkReport(
    observedScore.status === 3 && observedScore.output.includes(`mount outside allowlist: ${realOutside}`),
    `score over an observed ungranted mount exited ${observedScore.status}; expected 3 with eval-quality's isolation violation\n${observedScore.output}`,
  );
  const declared = makeProject('confinement-declared', {
    edit: ({ folder }) =>
      editJson(path.join(folder, 'evaluation.json'), (evaluation) => (evaluation.registry[0].systemPaths = [path.dirname(realOutside)])),
  });
  const declaredRun = evaluate(['run', '--evaluation', declared.folder], {
    ...declared.env,
    VERDICT_WHEN: 'trial-clean-1',
    VERDICT_DO: 'read-ungranted',
    VERDICT_TOUCH: outside,
  });
  const declaredMounts = observedMountsOf(runDirectoryOf(declared.folder), 'P-001');
  check(
    declaredRun.status === 0 && JSON.stringify(declaredMounts) === '[]',
    `a read under a declared system path was reported (exit ${declaredRun.status}, observed ${JSON.stringify(declaredMounts)})\n${declaredRun.output}`,
  );
}

/**
 * The audit's parts on their own (Story 1.60): the strace trace parsed into path accesses, the decision that lists one,
 * the kernel's sandbox reports parsed under the sandbox's token, and the two observers refusing what they cannot confirm.
 */
async function checkAuditParsers() {
  const marker = { program: '/usr/local/bin/node', text: 'status-1-abcd.json' };
  const accesses = [];
  const reader = new TraceReader({ marker, cwd: '/work/ws', onAccess: (access) => accesses.push(access) });
  const trace = [
    // Bubblewrap's own setup, before the target's start: dropped, whatever it names, though it carries the target's command.
    '12    execve("/usr/bin/bwrap", ["bwrap", "--", "/usr/local/bin/node", "/lib/confinement-status.cjs", "/tmp/status-1-abcd.json"], 0x1 /* 6 vars */) = 0',
    '12    openat(3</proc>, "self/mountinfo", O_RDONLY|O_CLOEXEC) = 6</proc/12/mountinfo>',
    '13    mount("none", "/newroot/etc/hostname", NULL, MS_RDONLY, NULL) = 0',
    '14    execve("/usr/local/bin/node", ["/usr/local/bin/node", "/lib/confinement-status.cjs", "/tmp/status-1-abcd.json", "/bin/sh"], 0x1 /* 6 vars */) = 0',
    // What the target does: a read outside the grants, a missing path, a relative open, a write the mechanism refused.
    '15    openat(AT_FDCWD</work/ws>, "/opt/secret/notes.txt", O_RDONLY|O_CLOEXEC) = 3</opt/secret/notes.txt>',
    '15    openat(AT_FDCWD</work/ws>, "/opt/secret/missing", O_RDONLY) = -1 ENOENT (No such file or directory)',
    '15    openat(AT_FDCWD</work/ws>, "data/in.txt", O_RDONLY) = 4</work/ws/data/in.txt>',
    '15    openat(AT_FDCWD</work/ws>, "/usr/bin/true", O_RDONLY|O_PATH) = 5</usr/bin/true>',
    '15    execve("/opt/tool/bin/jq", ["jq", "."], 0x1 /* 6 vars */) = 0',
    '15    openat(AT_FDCWD</work/ws>, "/etc/out.txt", O_WRONLY|O_CREAT|O_TRUNC, 0666) = -1 EROFS (Read-only file system)',
    // A call split by another process's output, joined per pid; the path holds an escaped space and a quote.
    String.raw`16    openat(AT_FDCWD</work/ws>, "/opt/a b\"c.txt", O_RDONLY <unfinished ...>`,
    '17    chdir("/opt/dir") = 0',
    '16    <... openat resumed>)             = 3</opt/a b"c.txt>',
    // A process after `chdir` resolves a relative path of a call with no directory argument against it, and a child inherits it.
    '17    mkdir("sub", 0777)                = -1 EROFS (Read-only file system)',
    '17    clone(child_stack=NULL, flags=CLONE_CHILD_SETTID|SIGCHLD) = 18',
    '18    unlink("gone")                    = -1 EROFS (Read-only file system)',
    '18    readlinkat(AT_FDCWD</work/ws>, "/opt/lnk", "/x", 4096) = 2',
    // An absolute path needs no directory: a descriptor strace cannot name leaves it readable.
    '15    openat(7, "/opt/abs/secret", O_RDONLY) = 3</opt/abs/secret>',
    // Non-ASCII bytes are escaped in a path and in a descriptor's annotation alike.
    String.raw`15    openat(AT_FDCWD</work/ws>, "/work/ws/caf\303\251.txt", O_RDONLY) = 3</work/ws/caf\303\251.txt>`,
    String.raw`15    openat(AT_FDCWD</work/w\303\251>, "rel.txt", O_RDONLY) = 3</work/w\303\251/rel.txt>`,
    // A vforked child runs before its parent's `clone` returns, and a namespace's `clone` returns the namespace's own number,
    // which `--decode-pids=pidns` names as strace sees it (22 here): the child's relative path waits for it.
    '21    chdir("/opt/vf") = 0',
    '21    clone(child_stack=0x1, flags=CLONE_VM|CLONE_VFORK|SIGCHLD <unfinished ...>',
    '22    mkdir("child-rel", 0777) = -1 EROFS (Read-only file system)',
    "21    <... clone resumed>) = 3 /* 22 in strace's PID NS */",
    // A vforked child that changes directory before its parent's `clone` returns keeps that directory, and so does a thread
    // another thread's `chdir` reached (`CLONE_FS` shares the directory), where a plain fork copies it.
    '31    chdir("/opt/p") = 0',
    '31    clone(child_stack=0x1, flags=CLONE_VM|CLONE_VFORK|SIGCHLD <unfinished ...>',
    '32    chdir("/eval/runs") = 0',
    '32    mkdir("y", 0777) = -1 EROFS (Read-only file system)',
    "31    <... clone resumed>) = 5 /* 32 in strace's PID NS */",
    "31    clone(child_stack=0x1, flags=CLONE_VM|CLONE_FS|CLONE_FILES|CLONE_THREAD|CLONE_SIGHAND) = 6 /* 33 in strace's PID NS */",
    '31    chdir("/opt/q") = 0',
    '33    rmdir("thread-rel") = -1 EROFS (Read-only file system)',
    "31    clone(child_stack=NULL, flags=CLONE_CHILD_SETTID|SIGCHLD) = 7 /* 34 in strace's PID NS */",
    '31    chdir("/opt/r") = 0',
    '34    unlink("fork-rel") = -1 EROFS (Read-only file system)',
    '35    mkdirat(AT_FDCWD, "bare", 0777) = -1 EROFS (Read-only file system)',

    '15    --- SIGCHLD {si_signo=SIGCHLD, si_code=CLD_EXITED, si_pid=3, si_uid=1001, si_status=0} ---',
    '15    utimensat(AT_FDCWD</work/ws>, NULL, NULL, 0) = 0',
    '',
  ];
  for (const line of trace) reader.push(line);
  reader.finish();
  const seen = accesses.map((access) => `${access.kind} ${access.path}${access.ok ? '' : ` ${access.errno}`}`).sort();
  const expectedAccesses = [
    'read /opt/secret/notes.txt',
    'read /opt/secret/missing ENOENT',
    'read /work/ws/data/in.txt',
    'read /opt/tool/bin/jq',
    'write /etc/out.txt EROFS',
    'read /opt/a b"c.txt',
    'read /opt/abs/secret',
    'read /work/ws/café.txt',
    'read /work/wé/rel.txt',
    'write /opt/vf/child-rel EROFS',
    'write /eval/runs/y EROFS',
    'write /opt/q/thread-rel EROFS',
    'write /opt/q/fork-rel EROFS',
    'write /work/ws/bare EROFS',
    'write /opt/dir/sub EROFS',
    'write /opt/dir/gone EROFS',
    'read /opt/lnk',
  ].sort();
  check(JSON.stringify(seen) === JSON.stringify(expectedAccesses) && reader.begun, `the trace reader found ${JSON.stringify(seen)}`);
  // The Node installation granted is the one above `bin/`, the directory itself at the file system's root, and no directory that
  // holds the user's home (a node in `~/bin` would grant the home).
  check(
    nodeInstallRoot('/usr/local/bin/node') === '/usr/local' &&
      nodeInstallRoot('/bin/node') === '/bin' &&
      nodeInstallRoot(path.join(os.homedir(), 'bin', 'node')) === path.join(os.homedir(), 'bin'),
    `the Node installation granted is ${JSON.stringify(['/usr/local/bin/node', '/bin/node', path.join(os.homedir(), 'bin', 'node')].map(nodeInstallRoot))}`,
  );
  check(
    accesses.find((access) => access.path === '/opt/secret/notes.txt')?.real === '/opt/secret/notes.txt' &&
      accesses.find((access) => access.path === '/work/ws/data/in.txt')?.real === '/work/ws/data/in.txt',
    'an opened file keeps the real path strace printed',
  );

  const grants = {
    read: ['/work/ws', '/usr', '/etc', '/proj', '/proj/.git/worktrees/w'],
    requested: ['/usr', '/etc'],
    write: ['/work/ws'],
    withheld: ['/work/evals', '/proj/.git'],
    withheldExcept: ['/proj/.git/worktrees/w'],
  };
  const decided = (access) => traceDecision({ ok: true, errno: null, real: access.path, ...access }, grants);
  for (const [name, access, expected] of [
    ['an ungranted read', { kind: 'read', path: '/opt/secret' }, '/opt/secret'],
    ['a granted read', { kind: 'read', path: '/usr/lib/libc.so' }, null],
    ['the root directory', { kind: 'read', path: '/' }, null],
    // The operating system links its own files elsewhere (a stub resolver's `/etc/resolv.conf`), which no target can change.
    ['a system file linked elsewhere', { kind: 'read', path: '/etc/resolv.conf', real: '/run/systemd/resolve/stub-resolv.conf' }, null],
    ['a path under /proc that leads anywhere', { kind: 'read', path: '/proc/self/root/home/secret', real: '/home/secret' }, '/home/secret'],
    ['a link that leads outside', { kind: 'read', path: '/work/ws/link', real: '/opt/secret' }, '/opt/secret'],
    ['a missing ungranted path', { kind: 'read', path: '/opt/none', ok: false, errno: 'ENOENT' }, null],
    ['a refused ungranted read', { kind: 'read', path: '/root', ok: false, errno: 'EACCES' }, '/root'],
    [
      'a missing withheld path',
      { kind: 'read', path: '/work/evals/contract.json', ok: false, errno: 'ENOENT' },
      '/work/evals/contract.json',
    ],
    ['a granted path under a withheld one', { kind: 'read', path: '/proj/.git/config' }, '/proj/.git/config'],
    ['the excepted entry', { kind: 'read', path: '/proj/.git/worktrees/w/HEAD' }, null],
    ['a write that landed', { kind: 'write', path: '/work/ws/out' }, null],
    ['a refused write outside', { kind: 'write', path: '/etc/out', ok: false, errno: 'EROFS' }, '/etc/out'],
    ['a refused write for another reason', { kind: 'write', path: '/etc/out', ok: false, errno: 'ENOSPC' }, null],
    ['a refused write inside the workspace', { kind: 'write', path: '/work/ws/out', ok: false, errno: 'EACCES' }, null],
    ['a refused write of a withheld path', { kind: 'write', path: '/work/evals/runs/x', ok: false, errno: 'ENOENT' }, '/work/evals/runs/x'],
  ]) {
    check(
      decided(access) === expected,
      `the decision for ${name} is ${JSON.stringify(decided(access))}; expected ${JSON.stringify(expected)}`,
    );
  }

  // Paths the lexical reading gets wrong (Story 1.60, round 1): a process's own root or directory link leads anywhere in the
  // namespace though it sits under the /proc grant, and a `..` after a link names another file than the collapsed path. Each
  // line runs through the reader and the decision with a host that resolves the exec's path to the file the kernel opened.
  const listed = (lines, resolveReal = () => null) => {
    const found = [];
    const walker = new TraceReader({
      marker: null,
      cwd: '/work/ws',
      resolveReal,
      onAccess: (access) => {
        const entry = traceDecision(access, { ...grants, read: [...grants.read, '/proc', '/dev'] });
        if (entry !== null) found.push(entry);
      },
    });
    for (const line of lines) walker.push(line);
    walker.finish();
    return found;
  };
  for (const [name, lines, expected, resolveReal] of [
    [
      'an exec through /proc/self/root',
      ['15    execve("/proc/self/root/home/x/tool", ["tool"], 0x1 /* 1 var */) = 0'],
      ['/proc/self/root/home/x/tool'],
    ],
    [
      'an exec through another process directory link',
      ['15    execve("/proc/4242/cwd/tool", ["tool"], 0x1 /* 1 var */) = 0'],
      ['/proc/4242/cwd/tool'],
    ],
    [
      'a link read through /proc/self/root',
      ['15    readlinkat(AT_FDCWD</work/ws>, "/proc/self/root/home/x/l", "/x", 4096) = 2'],
      ['/proc/self/root/home/x/l'],
    ],
    [
      'an exec through /proc/self/cwd and a `..`',
      ['15    execve("/proc/self/cwd/../eval/tool", ["tool"], 0x1 /* 1 var */) = 0'],
      ['/proc/self/eval/tool'],
    ],
    [
      'an exec through a per-thread root link',
      ['15    execve("/proc/self/task/77/root/work/eval/tool", ["tool"], 0x1 /* 1 var */) = 0'],
      ['/proc/self/task/77/root/work/eval/tool'],
    ],
    [
      'an exec through another process thread directory',
      ['15    execve("/proc/4242/task/77/cwd/tool", ["tool"], 0x1 /* 1 var */) = 0'],
      ['/proc/4242/task/77/cwd/tool'],
    ],
    [
      'an exec of a /proc path with `..`, which the evaluator never resolves for the target',
      ['15    execve("/proc/sys/kernel/../x/tool", ["tool"], 0x1 /* 1 var */) = 0'],
      ['/proc/sys/x/tool'],
      () => '/home/u/leak',
    ],
    [
      'an exec with a `..` before the link',
      ['15    execve("/proc/self/../self/root/home/victim/tool", ["tool"], 0x1 /* 1 var */) = 0'],
      ['/proc/self/root/home/victim/tool'],
    ],
    [
      'an exec with a `..` between a link and its siblings',
      ['15    execve("/proc/self/fd/../root/home/victim/tool", ["tool"], 0x1 /* 1 var */) = 0'],
      ['/proc/self/root/home/victim/tool'],
    ],
    [
      'an exec that leaves /proc and returns',
      ['15    execve("/proc/../proc/15/root/home/victim/tool", ["tool"], 0x1 /* 1 var */) = 0'],
      ['/proc/15/root/home/victim/tool'],
    ],
    [
      'an exec that climbs out of a thread directory',
      ['15    execve("/proc/self/task/77/../../root/home/victim/tool", ["tool"], 0x1 /* 1 var */) = 0'],
      ['/proc/self/root/home/victim/tool'],
    ],
    [
      'an exec that starts in /dev and goes into /proc',
      ['15    execve("/dev/../proc/self/root/home/victim/tool", ["tool"], 0x1 /* 1 var */) = 0'],
      ['/proc/self/root/home/victim/tool'],
      () => '/home/u/leak',
    ],
    [
      'an exec through thread-self and `..`',
      ['15    execve("/proc/thread-self/../../root/home/victim/tool", ["tool"], 0x1 /* 1 var */) = 0'],
      ['/root/home/victim/tool'],
    ],
    ['an exec through /dev/stdin', ['15    execve("/dev/stdin/tool", ["tool"], 0x1 /* 1 var */) = 0'], ['/dev/stdin/tool']],
    ['an exec through /dev/stdout', ['15    execve("/dev/stdout/tool", ["tool"], 0x1 /* 1 var */) = 0'], ['/dev/stdout/tool']],
    ['an exec through /dev/stderr', ['15    execve("/dev/stderr/tool", ["tool"], 0x1 /* 1 var */) = 0'], ['/dev/stderr/tool']],
    ['a bare exec of a descriptor link', ['15    execve("/proc/self/fd/9", ["tool"], 0x1 /* 1 var */) = 0'], ['/proc/self/fd/9']],
    ['a bare exec of /dev/fd', ['15    execve("/dev/fd/9", ["tool"], 0x1 /* 1 var */) = 0'], ['/dev/fd/9']],
    [
      'a bare exec of a mapped file',
      ['15    execve("/proc/4242/map_files/7f00-7f10", ["tool"], 0x1 /* 1 var */) = 0'],
      ['/proc/4242/map_files/7f00-7f10'],
    ],
    [
      'a bare exec of a thread descriptor',
      ['15    execve("/proc/self/task/77/fd/9", ["tool"], 0x1 /* 1 var */) = 0'],
      ['/proc/self/task/77/fd/9'],
    ],
    [
      'an exec of a descriptor with an empty path',
      ['15    execveat(3</home/victim/tool>, "", ["tool"], 0x1 /* 1 var */, AT_EMPTY_PATH) = 0'],
      ['/home/victim/tool'],
    ],
    [
      'a relative exec after a chdir through a process link',
      [
        '15    chdir("/home/victim") = 0',
        '15    chdir("/proc/self/cwd/..") = 0',
        '15    execve("victim/tool", ["tool"], 0x1 /* 1 var */) = 0',
      ],
      ['/proc/self/victim/tool'],
    ],
    [
      'a relative exec after an fchdir to an ungranted directory',
      ['15    fchdir(3</home/victim>) = 0', '15    execve("./tool", ["tool"], 0x1 /* 1 var */) = 0'],
      ['/home/victim/tool'],
    ],
    ['a relative exec after an ordinary chdir', ['15    chdir("/usr/bin") = 0', '15    execve("true", ["tool"], 0x1 /* 1 var */) = 0'], []],
    [
      'a relative exec after leaving a process link by an absolute chdir',
      ['15    chdir("/proc/self/cwd/..") = 0', '15    chdir("/usr/bin") = 0', '15    execve("true", ["tool"], 0x1 /* 1 var */) = 0'],
      [],
    ],
    ['a re-exec of the process itself', ['15    execve("/proc/self/exe", ["tool"], 0x1 /* 1 var */) = 0'], []],
    ['a read of a descriptor link', ['15    readlink("/proc/self/fd/1", "/dev/null", 4096) = 9'], []],
    [
      'an exec through a directory descriptor',
      ['15    execve("/proc/self/fd/9/tool", ["tool"], 0x1 /* 1 var */) = 0'],
      ['/proc/self/fd/9/tool'],
    ],
    ['an exec through /dev/fd', ['15    execve("/dev/fd/9/tool", ["tool"], 0x1 /* 1 var */) = 0'], ['/dev/fd/9/tool']],
    [
      'an exec through doubled slashes and a dot',
      ['15    execve("/proc//self/./root/work/eval/tool", ["tool"], 0x1 /* 1 var */) = 0'],
      ['/proc/self/root/work/eval/tool'],
    ],
    ['a write the mechanism allowed through /proc/self/cwd', ['15    mkdir("/proc/self/cwd/build", 0777) = 0'], []],
    [
      'an open that found nothing through /proc/self/cwd',
      ['15    openat(AT_FDCWD</work/ws>, "/proc/self/cwd/missing", O_RDONLY) = -1 ENOENT (No such file or directory)'],
      [],
    ],
    ['readlink of /proc/self/exe', ['15    readlink("/proc/self/exe", "/usr/bin/node", 4096) = 13'], []],
    [
      'an exec whose `..` follows a link into a system directory',
      ['15    execve("/usr/lib/ssl/certs/../../../home/u/tool", ["tool"], 0x1 /* 1 var */) = 0'],
      ['/home/u/tool'],
      (raw) => (raw === '/usr/lib/ssl/certs/../../../home/u/tool' ? '/home/u/tool' : null),
    ],
    [
      'an open whose `..` follows a link into a system directory',
      ['15    openat(AT_FDCWD</work/ws>, "/usr/lib/ssl/certs/../../../home/u/secret", O_RDONLY) = 3</home/u/secret>'],
      ['/home/u/secret'],
    ],
    [
      'a relative open after a chdir into a linked directory',
      ['15    chdir("/usr/lib/ssl/certs") = 0', '15    openat(AT_FDCWD, "../../../home/u/secret", O_RDONLY) = 3</home/u/secret>'],
      ['/home/u/secret'],
    ],
    [
      'a system file the system links elsewhere',
      ['15    openat(AT_FDCWD</work/ws>, "/etc/resolv.conf", O_RDONLY) = 3</run/systemd/resolve/stub-resolv.conf>'],
      [],
    ],
  ]) {
    const found = listed(lines, resolveReal);
    check(
      JSON.stringify(found) === JSON.stringify(expected),
      `${name} listed ${JSON.stringify(found)}; expected ${JSON.stringify(expected)}`,
    );
  }

  // The kernel's reports: one line of the log per report, the sandbox's token on the second line of the message.
  const token = 'tea-evaluate-audit-0123456789abcdef';
  const line = (message, extra = {}) =>
    JSON.stringify({ eventType: 'logEvent', processImagePath: '/kernel', eventMessage: message, ...extra });
  for (const [name, text, expected] of [
    [
      'an allowed read',
      line(`Sandbox: cat(7) allow file-read-data /opt/x\n${token}`),
      { operation: 'file-read-data', denied: false, path: '/opt/x' },
    ],
    [
      'a refused write',
      line(`Sandbox: bash(8) deny(1) file-write-create /opt/new\n${token}`),
      { operation: 'file-write-create', denied: true, path: '/opt/new' },
    ],
    [
      'a duplicate',
      line(`3 duplicate reports for Sandbox: ls(9) deny(1) file-read-data /opt/d\n${token}`),
      { operation: 'file-read-data', denied: true, path: '/opt/d' },
    ],
    [
      'a path holding a line break',
      line(`Sandbox: cat(7) allow file-read-data /opt/a\nb\n${token}`),
      { operation: 'file-read-data', denied: false, path: '/opt/a\nb' },
    ],
    [
      'a process named with a parenthesis',
      line(`Sandbox: weird(1)(7) allow file-read-data /opt/x\n${token}`),
      { operation: 'file-read-data', denied: false, path: '/opt/x' },
    ],
    ['another sandbox', line('Sandbox: cat(7) allow file-read-data /opt/x\ntea-evaluate-audit-ffffffffffffffff'), null],
    [
      'a message of a process that is not the kernel',
      line(`Sandbox: cat(7) allow file-read-data /opt/x\n${token}`, { processImagePath: '/usr/bin/logger' }),
      null,
    ],
    ['a metadata operation', line(`Sandbox: stat(7) deny(1) file-read-metadata /opt/x\n${token}`), null],
    ['a relative path', line(`Sandbox: cat(7) allow file-read-data opt/x\n${token}`), null],
    ['the stream header', `Filtering the log data using "process == \\"kernel\\" AND composedMessage CONTAINS \\"${token}\\""`, null],
    [
      'a refused hard link',
      line(`Sandbox: ln(9) deny(1) forbidden-link-priv<file-write*> /opt/src /work/dst\n${token}`),
      { operation: 'forbidden-link-priv<file-write*>', denied: true, path: '/opt/src' },
    ],
    ['a loss event', JSON.stringify({ eventType: 'lossEvent' }), { lost: true }],
  ]) {
    const parsed = parseReportLine(text, token);
    check(
      JSON.stringify(parsed) === JSON.stringify(expected),
      `the report line for ${name} parsed as ${JSON.stringify(parsed)}; expected ${JSON.stringify(expected)}`,
    );
  }
  check(
    JSON.stringify(splitArguments(String.raw`AT_FDCWD</a,b (c)>, "x, \"y\")", {flags=O_RDONLY|O_CLOEXEC, how=[1, 2]}, 0666) = 3`).args) ===
      JSON.stringify(['AT_FDCWD</a,b (c)>', String.raw`"x, \"y\")"`, '{flags=O_RDONLY|O_CLOEXEC, how=[1, 2]}', '0666']) &&
      decodeString(String.raw`"a\303\251\n\x41\""`) === 'aé\nA"',
    "strace's arguments and escapes were not split and decoded",
  );
  // The parser acts on a syscall only if strace is told to report it: a name the parser handles that the filter lacks is a blind spot no canned line shows.
  const handled = [...Object.keys(TRACE_PATH_SYSCALLS), ...TRACE_CLONES, 'chdir', 'fchdir'];
  const unfiltered = handled.filter((name) => !TRACE_SYSCALLS.includes(name));
  check(unfiltered.length === 0, `strace is not told to report ${unfiltered.join(', ')}, which the trace parser handles`);
}

/**
 * The observers refuse what they cannot confirm (Story 1.60): a `log` that never reports the sentinel read (macOS), a `strace`
 * that is missing, traces nothing or fails (Linux), and an audited sandbox whose observer stops or whose trace holds no start
 * of the target; none of them returns an empty list of observed mounts.
 */
async function checkAuditRefusals() {
  // An audit that cannot confirm what a trial opened ends the trial with no record (exit 12), whatever the platform: the error
  // of the audit's read is the trial's, and an empty list is never put in its place.
  const stopped = (details) => Object.assign(new Error(details.message), details);
  let mapped = null;
  try {
    await readObservedMounts(
      async () => {
        throw new Error('the audit could not confirm');
      },
      { stop: stopped, label: 'trial-clean-1' },
    );
  } catch (error) {
    mapped = error;
  }
  check(
    mapped?.exitCode === 12 &&
      mapped.stage === 'trial' &&
      mapped.message.includes('trial-clean-1 yields no record: the audit could not confirm'),
    `an audit whose read failed ended the trial as ${JSON.stringify(mapped?.message)}; expected no record, exit 12`,
  );
  check(
    JSON.stringify(await readObservedMounts(async () => ['/a'], { stop: stopped, label: 'trial-clean-1' })) === '["/a"]',
    'a successful audit read was changed',
  );
  // The audit's directory is made only beneath the run's private parent, which no target can reach.
  let withoutParent = null;
  try {
    makeAuditDirectory([]);
  } catch (error) {
    withoutParent = error;
  }
  check(
    withoutParent?.name === 'ConfinementError' && withoutParent.message.includes('private parent'),
    `an audit directory was made with no private parent: ${withoutParent}`,
  );
  const bin = tempDir('audit-refusals');
  const script = (name, body) => {
    const file = path.join(bin, name);
    fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
    return file;
  };
  const silentLog = script('silent-log', 'sleep 30');
  const endedLog = script('ended-log', 'echo "log: cannot read the unified log" >&2; exit 1');
  const folder = tempDir('audit-refusals-folder');
  const workspace = tempDir('audit-refusals-workspace');
  const confinement = selectConfinement({ evaluation: {}, folder });
  if (confinement.refusal !== undefined) throw new Error(confinement.refusal);

  if (confinement.mode === 'seatbelt') {
    const started = Date.now();
    const silent = probeReportStream({ sandboxExec: confinement.executable, logExecutable: silentLog });
    check(
      typeof silent === 'string' && silent.includes('did not report a read the sandbox allowed') && Date.now() - started < 15_000,
      `a log stream that never reports was confirmed or took too long: ${JSON.stringify(silent)} after ${Date.now() - started} ms`,
    );
    const ended = probeReportStream({ sandboxExec: confinement.executable, logExecutable: endedLog });
    check(
      typeof ended === 'string' && ended.includes('stream ended before it reported') && ended.includes('cannot read the unified log'),
      `a log stream that ended was not refused with its own words: ${JSON.stringify(ended)}`,
    );
    const missing = probeReportStream({ sandboxExec: confinement.executable, logExecutable: path.join(bin, 'no-such-log') });
    check(
      typeof missing === 'string' && missing.includes('stream ended before it reported') && missing.includes('No such file'),
      `a log executable that does not exist was not refused: ${JSON.stringify(missing)}`,
    );
    // The sandbox's own stream ends mid-trial: the read of its mounts fails, naming the stream.
    const directory = fs.realpathSync(tempDir('audit-ended'));
    const sandbox = targetSandbox({
      confinement: { ...confinement, observer: { executable: endedLog } },
      workspace,
      audit: { directory },
    });
    let failure = null;
    try {
      await sandbox.start();
    } catch (error) {
      failure = error;
    } finally {
      sandbox.release();
    }
    check(
      failure?.name === 'ConfinementError' && failure.message.includes('log stream ended'),
      `a sandbox whose log stream ended before it started was not refused: ${failure}`,
    );
    // A stream that ends after the sandbox started (the target killed it, or the log stopped): the read of the mounts fails.
    const live = targetSandbox({ confinement, workspace, audit: { directory: fs.realpathSync(tempDir('audit-killed')) } });
    await live.start();
    live.release();
    await new Promise((resolve) => setTimeout(resolve, 200));
    let killed = null;
    try {
      await live.observedMounts();
    } catch (error) {
      killed = error;
    }
    check(
      killed?.name === 'ConfinementError' && killed.message.includes('log stream ended'),
      `a sandbox whose log stream was killed mid-trial returned its mounts: ${killed}`,
    );

    // A stream the host stalls (SIGSTOP) never returns the barrier's read: the mounts are unconfirmed, never an empty list.
    const stalled = targetSandbox({
      confinement,
      workspace,
      audit: { directory: fs.realpathSync(tempDir('audit-stalled')), barrierMs: 1500 },
    });
    await stalled.start();
    const stalledToken = /with message "(tea-evaluate-audit-[0-9a-f]{16})"/.exec(stalled.wrap('/bin/true', []).args[1])[1];
    const streamPids = () =>
      spawnSync('pgrep', ['-f', `CONTAINS "${stalledToken}"`], { encoding: 'utf8' })
        .stdout.split('\n')
        .filter(Boolean)
        .map(Number);
    const frozen = streamPids();
    for (const pid of frozen) process.kill(pid, 'SIGSTOP');
    let unconfirmed = null;
    try {
      await stalled.observedMounts();
    } catch (error) {
      unconfirmed = error;
    } finally {
      for (const pid of frozen) process.kill(pid, 'SIGKILL');
      stalled.release();
    }
    check(
      frozen.length > 0 && unconfirmed?.name === 'ConfinementError' && unconfirmed.message.includes('did not return a read'),
      `a sandbox whose log stream stalled returned its mounts (${frozen.length} stream process(es)): ${unconfirmed}`,
    );
    // A stream that reports lost events and no read leaves the trial unconfirmed.
    const lossyLog = script('lossy-log', 'echo \'{"eventType":"lossEvent"}\'; exec /usr/bin/log "$@"');
    const lossy = targetSandbox({
      confinement: { ...confinement, observer: { executable: lossyLog } },
      workspace,
      audit: { directory: fs.realpathSync(tempDir('audit-lossy')) },
    });
    await lossy.start();
    let lostEvents = null;
    try {
      await lossy.observedMounts();
    } catch (error) {
      lostEvents = error;
    } finally {
      lossy.release();
    }
    check(
      lostEvents?.name === 'ConfinementError' && lostEvents.message.includes('lost events'),
      `a sandbox whose log stream reported lost events and no read returned its mounts: ${lostEvents}`,
    );
    // The barrier is what makes the list complete: a stream that delivers a second late still lists the path read just before.
    const slowLog = script('slow-log', '/usr/bin/log "$@" | (sleep 1; cat)');
    const slowDirectory = fs.realpathSync(tempDir('audit-slow'));
    const slow = targetSandbox({
      confinement: { ...confinement, observer: { executable: slowLog } },
      workspace,
      status: tempDir('audit-slow-status'),
      audit: { directory: slowDirectory },
    });
    await slow.start();
    const slowToken = /with message "(tea-evaluate-audit-[0-9a-f]{16})"/.exec(slow.wrap('/bin/true', []).args[1])[1];
    const slowFile = path.join(fs.realpathSync(tempDir('audit-slow-outside')), 'late.txt');
    fs.writeFileSync(slowFile, 'late\n');
    const slowWrapped = slow.wrap('/bin/cat', [slowFile]);
    await new Promise((resolve) => spawn(slowWrapped.target, slowWrapped.args, { cwd: workspace, stdio: 'ignore' }).once('exit', resolve));
    const slowMounts = await slow.observedMounts();
    slow.release();
    spawnSync('pkill', ['-f', slowToken]);
    check(
      JSON.stringify(slowMounts) === JSON.stringify([slowFile]),
      `a read made just before the end of the trial was ${JSON.stringify(slowMounts)} through a slow log; expected [${slowFile}]`,
    );

    // The registry's release ends the audit: no `log stream` of this process outlives the trial's release.
    const outstanding = () =>
      spawnSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' })
        .stdout.split('\n')
        .filter((line) => new RegExp(String.raw`^\s*\d+\s+${process.pid}\s`).test(line) && line.includes('CONTAINS "tea-evaluate-audit-'))
        .length;
    const scratchList = [];
    makePrivateParent(scratchList);
    const registry = createRegistry(readJson(path.join(FIXTURE, 'evals', 'verdict', 'evaluation.json')).registry, {
      root: FIXTURE,
      scratch: scratchList,
      confinement,
    });
    const before = outstanding();
    const probePort = await registry.createProbePort({
      cwd: workspace,
      projectRoot: workspace,
      workspace,
      git: null,
      privateRoot: scratchList.privateRoot,
      audit: true,
    });
    const during = outstanding();
    probePort.releaseHome();
    await new Promise((resolve) => setTimeout(resolve, 500));
    const after = outstanding();
    for (const directory of scratchList) fs.rmSync(directory, { recursive: true, force: true });
    check(
      during === before + 1 && after === before,
      `the probe port's audit held ${during - before} log stream(s) and ${after - before} after its release; expected 1 and 0`,
    );
  }

  // The Linux half needs no Linux: a `bwrap` that runs its command and a `strace` that is refused, traces nothing or confirms its
  // probe stand in for the real ones on any host.
  const stubBwrap = script('bwrap', 'while [ "$1" != "--" ]; do shift; done; shift; exec "$@"');
  const absent = selectConfinement({
    evaluation: {},
    folder,
    env: { PATH: path.dirname(stubBwrap), [PLATFORM_ENV]: 'linux' },
    platform: 'linux',
  });
  check(
    absent.refusal?.includes('strace is not on PATH') &&
      absent.refusal.includes('version 6.1 or later') &&
      absent.refusal.includes('"confinement": false'),
    `a host with no strace was not refused naming it and the opt-out: ${JSON.stringify(absent.refusal)}`,
  );
  const vector = [stubBwrap, '--unshare-user', '--ro-bind', '/', '/', '--dev', '/dev', '--'];
  const untraced = script('untraced-strace', 'while [ "$1" != "--" ]; do shift; done; shift; exec "$@"');
  const failing = script('failing-strace', 'echo "strace: ptrace(PTRACE_TRACEME): Operation not permitted" >&2; exit 1');
  const none = probeTrace({ strace: untraced, vector });
  check(
    typeof none === 'string' && none.includes('no read of the probe file'),
    `a strace that traces nothing was confirmed: ${JSON.stringify(none)}`,
  );
  const refused = probeTrace({ strace: failing, vector });
  check(
    typeof refused === 'string' && refused.includes('exit 1') && refused.includes('Operation not permitted'),
    `a strace that failed was not refused with its own words: ${JSON.stringify(refused)}`,
  );
  // An audited call whose trace holds no start of the target: the audit failed, so the call is refused.
  const bubblewrap = {
    mode: 'bubblewrap',
    executable: stubBwrap,
    evaluationFolder: path.resolve(folder),
    observer: { executable: untraced },
  };
  const sandbox = targetSandbox({
    confinement: bubblewrap,
    workspace,
    status: tempDir('audit-untraced-status'),
    audit: { directory: fs.realpathSync(tempDir('audit-untraced')) },
  });
  const wrapped = sandbox.wrap(process.execPath, ['-e', '']);
  spawnSync(wrapped.target, wrapped.args, { cwd: workspace, encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS });
  let failure = null;
  try {
    await sandbox.collect(wrapped, { started: true });
  } catch (error) {
    failure = error;
  }
  check(
    failure?.name === 'ConfinementError' && failure.message.includes('holds no start of its target'),
    `a call whose trace holds nothing was not refused: ${failure}`,
  );
  // The failure is the audit's for the rest of the sandbox's life: the trial's mounts are unknown, never an empty list.
  let later = null;
  try {
    await sandbox.observedMounts();
  } catch (error) {
    later = error;
  }
  check(later === failure, `a sandbox whose call could not be traced returned its mounts: ${later}`);

  // A call that throws after its target started is still held to its trace (a timed-out server, say): the status file names the
  // start, whichever mechanism the call went through.
  for (const kind of ['command', 'tool']) {
    const statusFile = path.join(tempDir(`audit-threw-${kind}`), 'status-1.json');
    fs.writeFileSync(statusFile, '{"started":true}\n');
    const collected = [];
    const fake = {
      wrap: (target, args) => ({ target, args, statusFile }),
      collect: async (_wrapped, options) => collected.push(options),
    };
    const failingBase = {
      run: async () => {
        throw new Error('the call timed out');
      },
      callTool: async () => {
        throw new Error('the call timed out');
      },
    };
    const mechanism = kind === 'command' ? confinedCommandMechanism(failingBase, fake) : confinedMcpMechanism(failingBase, fake);
    try {
      await (kind === 'command'
        ? mechanism.run({ target: '/bin/true', subcommandPath: [], argv: [], env: {} }, new AbortController().signal)
        : mechanism.callTool({ target: '/bin/true', targetArgs: [], env: {} }, new AbortController().signal));
    } catch {
      // The call's own failure.
    }
    check(
      collected.length === 1 && collected[0].started === true && !fs.existsSync(statusFile),
      `a ${kind} call that threw after its target started was collected as ${JSON.stringify(collected)}; expected one read of the trace with started true, and the status file removed`,
    );
  }

  // A failed start of the audit ends the trial with no record, exit 12 (run.js maps the probe port's error, as it maps the read).
  const trialDirectory = tempDir('audit-trial');
  let trialStop = null;
  try {
    await runTrial({
      arm: { slug: 'clean', conditionArm: 'clean', mutation: null, basis: null, probes: [] },
      trialIndex: 1,
      contract: {},
      registry: {
        targetProblems: () => [],
        privateRoot: null,
        createProbePort: async () => {
          throw new Error("the audit's log stream ended before the trial's reads were confirmed");
        },
      },
      pristine: null,
      make: () => ({ root: trialDirectory, top: trialDirectory, directory: trialDirectory, kind: 'directory', provisioned: [] }),
      discard: () => {},
      engine: {},
      writer: { writeJson: () => {} },
      stop: (details) => Object.assign(new Error(details.message), details),
      signal: undefined,
      snapshot: { layer: { evaluator: { kind: 'deterministic' } } },
      run: {},
    });
  } catch (error) {
    trialStop = error;
  }
  check(
    trialStop?.exitCode === 12 && trialStop.message.includes('yields no record') && trialStop.message.includes('log stream ended'),
    `a trial whose audit could not start ended as ${JSON.stringify(trialStop?.message ?? trialStop)}; expected exit 12, no record`,
  );
}

/**
 * The real mechanism's audit over every kind of process this host runs (Story 1.60): a shell script's own processes and a
 * process started with an empty environment are seen as a Node process is; what a clean script reads, a path declared in
 * `systemPaths`, a path that does not exist, a metadata probe are not reported, the execution of an ungranted binary is; two sandboxes
 * audited at once each list their own file; a burst of reads is reported.
 */
async function checkAuditMechanism() {
  const folder = tempDir('audit-folder');
  const workspace = fs.realpathSync(tempDir('audit-workspace'));
  const outside = fs.realpathSync(tempDir('audit-outside'));
  const confinement = selectConfinement({ evaluation: {}, folder });
  if (confinement.refusal !== undefined) throw new Error(confinement.refusal);
  fs.writeFileSync(path.join(outside, 'one.txt'), 'one\n');
  fs.writeFileSync(path.join(outside, 'two.txt'), 'two\n');
  fs.writeFileSync(path.join(workspace, 'own.txt'), 'own\n');
  // A binary, whose execution is no read (a script would be read by its interpreter).
  fs.copyFileSync(fs.realpathSync(['/usr/bin/true', '/bin/true'].find((entry) => fs.existsSync(entry))), path.join(outside, 'tool'));
  fs.chmodSync(path.join(outside, 'tool'), 0o755);

  const open = async ({ readable = [] } = {}) => {
    const directory = fs.realpathSync(tempDir('audit-directory'));
    const sandbox = targetSandbox({ confinement, workspace, status: tempDir('audit-status'), audit: { directory } });
    await sandbox.start();
    /** Runs a command confined and reads what it opened, once. */
    const run = async (command, args, { env = { PATH: '/usr/bin:/bin' } } = {}) => {
      const wrapped = sandbox.wrap(command, args, [], readable);
      const ran = await new Promise((resolve) => {
        const child = spawn(wrapped.target, wrapped.args, { cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        let stdout = '';
        child.stderr.on('data', (chunk) => (stderr += chunk));
        child.stdout.on('data', (chunk) => (stdout += chunk));
        child.once('exit', (status) => resolve({ status, stderr, stdout }));
      });
      await sandbox.collect(wrapped, { started: true });
      return ran;
    };
    return { sandbox, run };
  };
  const mountsOf = async ({ sandbox }) => {
    try {
      return await sandbox.observedMounts();
    } finally {
      sandbox.release();
    }
  };
  const one = path.join(outside, 'one.txt');
  const two = path.join(outside, 'two.txt');

  // The kernel's report channel on macOS can lose a report (measured: about 1 in 400 reports under a saturated host, and a few
  // in 1,600 under the load of this very suite), so a scenario that expects a report is repeated before it fails there;
  // strace sees every syscall, and a scenario that expects nothing can only pass more often for a lost report, so those run once.
  const attempts = process.platform === 'darwin' ? 6 : 1;
  /**
   * What a scenario found against what it should find: a path nobody read fails at once, one the audit should have listed
   * is a lost report and may be retried; `allowed` names paths that may appear without being expected.
   */
  const judge = (observed, expected, what, allowed = []) => {
    const extra = observed.filter((entry) => !expected.includes(entry) && !allowed.includes(entry));
    if (extra.length > 0)
      return { failure: `${what}: the audit listed ${JSON.stringify(extra)} beyond ${JSON.stringify(expected)}`, lost: false };
    const missing = expected.filter((entry) => !observed.includes(entry));
    return missing.length > 0
      ? { failure: `${what}: the audit did not list ${JSON.stringify(missing)}; it listed ${JSON.stringify(observed)}`, lost: true }
      : { failure: null, lost: false };
  };
  const eventually = async (scenario) => {
    let result = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      result = await scenario();
      if (result.failure === null || !result.lost) break;
      // The loss comes in windows of a second or two on a loaded host, so the next attempt waits one out.
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    if (result.lost) checkReport(false, result.failure);
    else check(result.failure === null, result.failure);
  };

  // A shell script's own processes: an ungranted read, and a refused write that the mechanism answers EPERM or EROFS.
  await eventually(async () => {
    const shell = await open();
    const shellRan = await shell.run('/bin/sh', ['-c', `cat ${one} >/dev/null; echo x >${path.join(outside, 'new.txt')}`]);
    const mounts = await mountsOf(shell);
    if (fs.existsSync(path.join(outside, 'new.txt'))) return { failure: 'a confined shell wrote outside its workspace', lost: false };
    return judge(
      mounts,
      [one, path.join(outside, 'new.txt')],
      `a shell's read and refused write (the shell exited ${shellRan.status}: ${shellRan.stderr})`,
    );
  });

  // A process started with an empty environment, which no preload would have seen.
  await eventually(async () => {
    const cleared = await open();
    await cleared.run('/bin/sh', [
      '-c',
      `env -i /bin/cat ${two} >/dev/null; env -i ${process.execPath} -e 'require("node:fs").readFileSync(process.argv[1])' ${one}`,
    ]);
    return judge(await mountsOf(cleared), [one, two], 'processes started with an empty environment');
  });

  // What a clean script does is no violation: system files, a listing of /, the date, its own workspace, a path that does not
  // exist and a metadata probe.
  const clean = await open();
  const cleanRan = await clean.run('/bin/sh', [
    '-c',
    `cat /etc/hosts >/dev/null; ls / >/dev/null; date >/dev/null; cat ${path.join(workspace, 'own.txt')} >/dev/null; cat ${path.join(outside, 'missing.txt')} 2>/dev/null; stat ${one} >/dev/null`,
  ]);
  check(
    JSON.stringify(await mountsOf(clean)) === '[]' && cleanRan.status === 0,
    `the audit of a clean script listed observed mounts (the script exited ${cleanRan.status}: ${cleanRan.stderr})`,
  );

  // The audit never loosens the boundary: a read of the evaluation folder is refused as it is without one (a rule that names
  // `file-read-data` for the report would otherwise override the denial of `file-read*`), and it is listed.
  fs.writeFileSync(path.join(folder, 'contract.json'), '{}\n');
  const contract = path.join(fs.realpathSync(folder), 'contract.json');
  await eventually(async () => {
    const refusedRead = await open();
    const refusedRan = await refusedRead.run(process.execPath, [
      '-e',
      `try { require('node:fs').readFileSync(${JSON.stringify(contract)}); console.log('allowed'); } catch (error) { console.log('refused ' + error.code); }`,
    ]);
    const mounts = await mountsOf(refusedRead);
    if (!refusedRan.stdout.trim().startsWith('refused')) {
      return {
        failure: `an audited sandbox's read of the evaluation folder's contract answered ${JSON.stringify(refusedRan.stdout.trim())}`,
        lost: false,
      };
    }
    return judge(mounts, [contract], "an audited sandbox's read of the evaluation folder's contract");
  });

  // The execution of an ungranted binary reads it, so it is listed (macOS also lists the directory the shell looked in).
  await eventually(async () => {
    const executed = await open();
    await executed.run('/bin/sh', ['-c', path.join(outside, 'tool')]);
    return judge(await mountsOf(executed), [path.join(outside, 'tool')], 'the execution of an ungranted binary', [outside]);
  });

  // A path declared in `systemPaths` is granted.
  const declared = await open({ readable: [outside] });
  await declared.run('/bin/sh', ['-c', `cat ${one} >/dev/null`]);
  check(JSON.stringify(await mountsOf(declared)) === '[]', 'a read under a declared system path was reported');

  // Two sandboxes at once: each lists its own file only, whatever the other read.
  await eventually(async () => {
    const [first, second] = await Promise.all([open(), open()]);
    await Promise.all([first.run('/bin/sh', ['-c', `cat ${one} >/dev/null`]), second.run('/bin/sh', ['-c', `cat ${two} >/dev/null`])]);
    const [firstMounts, secondMounts] = [await mountsOf(first), await mountsOf(second)];
    const results = [
      judge(firstMounts, [one], 'the first of two sandboxes audited at once'),
      judge(secondMounts, [two], 'the second of two sandboxes audited at once'),
    ];
    const failed = results.filter((result) => result.failure !== null);
    return {
      failure: failed.map((result) => result.failure).join('; ') || null,
      lost: failed.length > 0 && failed.every((result) => result.lost),
    };
  });

  // A burst of reads: thousands of distinct ungranted files in one process are reported, most of them or all.
  const files = path.join(outside, 'burst');
  fs.mkdirSync(files);
  for (let index = 0; index < 2000; index += 1) fs.writeFileSync(path.join(files, `f${index}.txt`), 'x');
  const burst = await open();
  await burst.run(process.execPath, [
    '-e',
    `const fs = require('node:fs'); for (let i = 0; i < 2000; i += 1) fs.readFileSync(${JSON.stringify(files)} + '/f' + i + '.txt');`,
  ]);
  const burstMounts = await mountsOf(burst);
  check(
    (process.platform === 'darwin' ? burstMounts.length >= 500 : burstMounts.length === 2000) &&
      burstMounts.every((entry) => entry.startsWith(files)),
    `a burst of 2000 reads listed ${burstMounts.length} paths; expected most of them (the kernel's log loses some of a burst on macOS)`,
  );
}

/**
 * A confined run whose target is a shell script (Story 1.60): the audit sees the script's own processes, which no preload
 * could have, and `score` records the isolation violation; a clean script, a declared system path, a missing path and a
 * metadata probe leave `observedMounts` empty; a process started with an empty environment and a refused write are seen too.
 */
async function checkShellTargetAudit() {
  const outside = path.join(tempDir('shell-audit-outside'), 'host-notes.txt');
  fs.writeFileSync(outside, 'a file no trial was granted\n');
  const realOutside = fs.realpathSync(outside);
  const shellProject = (label, act, touch, extra = () => {}) => {
    const project = makeProject(label, {
      edit: ({ folder }) =>
        editJson(path.join(folder, 'evaluation.json'), (evaluation) => {
          evaluation.registry[0].target = 'bin/verdict.sh';
          evaluation.registry[0].environmentKeys.push('VERDICT_SH');
          extra(evaluation);
        }),
    });
    const file = typeof touch === 'function' ? touch(project) : touch;
    const ran = evaluate(['run', '--evaluation', project.folder], { ...project.env, VERDICT_SH: act, VERDICT_TOUCH: file });
    return { ...project, ran, directory: runDirectoryOf(project.folder) };
  };

  // An ungranted read by a shell script: listed for both probes (every trial of the target runs the script), and score exits 3.
  const read = shellProject('shell-audit-read', 'read', outside);
  check(
    read.ran.status === 0,
    `a confined run whose shell target read an ungranted file exited ${read.ran.status}; expected 0\n${read.ran.output}`,
  );
  for (const probeId of ['P-001', 'P-002']) {
    checkMounts(observedMountsOf(read.directory, probeId), [realOutside], `${probeId}'s observed mounts after a shell target's read`);
  }
  const readScore = evaluate(['score', '--evaluation', read.folder], read.env);
  checkReport(
    readScore.status === 3 && readScore.output.includes(`mount outside allowlist: ${realOutside}`),
    `score over a shell target's ungranted read exited ${readScore.status}; expected 3 with eval-quality's isolation violation\n${readScore.output}`,
  );

  // The same read from a path declared in `systemPaths`, and what a clean script does: nothing is listed, and score does not exit 3.
  const declared = shellProject('shell-audit-declared', 'read', outside, (evaluation) => {
    evaluation.registry[0].systemPaths = [path.dirname(realOutside)];
  });
  check(
    declared.ran.status === 0,
    `a run whose shell target read under a declared system path exited ${declared.ran.status}\n${declared.ran.output}`,
  );
  checkMounts(observedMountsOf(declared.directory, 'P-001'), [], "a shell target's read under a declared system path");
  const clean = shellProject('shell-audit-clean', 'clean', outside);
  check(clean.ran.status === 0, `a clean shell target's run exited ${clean.ran.status}\n${clean.ran.output}`);
  for (const probeId of ['P-001', 'P-002'])
    checkMounts(observedMountsOf(clean.directory, probeId), [], `a clean shell target's ${probeId}`);
  const cleanScore = clean.ran.status === 0 ? evaluate(['score', '--evaluation', clean.folder], clean.env) : clean.ran;
  check(cleanScore.status !== 3, `score over a clean shell target exited 3\n${cleanScore.output}`);

  // A process started with an empty environment, a refused write and a read of a withheld file.
  fs.writeFileSync(`${outside}.node`, 'read by a process started with an empty environment, from Node\n');
  const cleared = shellProject('shell-audit-cleared', 'cleared', outside);
  check(
    cleared.ran.status === 0,
    `a run whose shell target started processes with an empty environment exited ${cleared.ran.status}\n${cleared.ran.output}`,
  );
  checkMounts(
    observedMountsOf(cleared.directory, 'P-001'),
    [realOutside, `${realOutside}.node`],
    'processes started with an empty environment (cat reads the file, Node its neighbor)',
  );
  const target = path.join(tempDir('shell-audit-write'), 'written.txt');
  const write = shellProject('shell-audit-write', 'write', target);
  check(
    write.ran.status === 0 && !fs.existsSync(target),
    `a shell target's write outside its workspace exited ${write.ran.status} and the file ${fs.existsSync(target) ? 'was written' : 'was not written'}\n${write.ran.output}`,
  );
  checkMounts(
    observedMountsOf(write.directory, 'P-001'),
    [path.join(fs.realpathSync(path.dirname(target)), 'written.txt')],
    "a shell target's refused write",
  );
  const withheld = shellProject('shell-audit-withheld', 'withheld', (project) => path.join(project.folder, 'contract.json'));
  check(
    withheld.ran.status === 0,
    `a run whose shell target read the evaluation folder's contract exited ${withheld.ran.status}\n${withheld.ran.output}`,
  );
  checkMounts(
    observedMountsOf(withheld.directory, 'P-001'),
    [path.join(fs.realpathSync(withheld.folder), 'contract.json')],
    "a shell target's read of the evaluation folder's contract",
  );
}

/**
 * A `log` that loses every Nth report (`fixtures/evaluate/lossy-log.cjs`), written as the executable `TEA_EVALUATE_AUDIT_LOG`
 * names; `end()` ends the real `log` it started, which the runtime's SIGKILL of the stub leaves running.
 */
function lossyLogStub(every) {
  const directory = tempDir('lossy-log');
  const pids = tempDir('lossy-log-pids');
  const executable = path.join(directory, 'log');
  fs.writeFileSync(executable, `#!/bin/sh\nexec "${process.execPath}" "${LOSSY_LOG}" ${every} "${pids}" "$@"\n`, { mode: 0o755 });
  return {
    executable,
    end() {
      for (const name of fs.readdirSync(pids)) {
        const pid = Number(fs.readFileSync(path.join(pids, name), 'utf8'));
        const command = spawnSync('ps', ['-p', String(pid), '-o', 'args='], { encoding: 'utf8' }).stdout;
        if (!command.includes('/usr/bin/log stream') || !command.includes('tea-evaluate-audit-')) continue;
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // The real `log` reached its own timeout between the listing and the kill.
        }
      }
    },
  };
}

/** The summary line of a run whose trials lost no canary names no trial's counts and no lost audit report. */
function checkSummaryNamesNoLoss(summary, what) {
  check(
    !/ trial \d+ \(/.test(summary ?? '') && !String(summary).includes('lost audit reports'),
    `${what}: the summary names a loss: ${JSON.stringify(summary)}`,
  );
}

/**
 * How many of its own canary reads the audit says the log delivered (Story 1.81), through the real CLI: on macOS a run whose
 * `log` loses every second report records each trial's loss in `run.json` and names the trials that lost canaries in the
 * run's summary, and a run over the real `log` loses none and says nothing; on Linux every trial records `complete` with no
 * canary sent, since `strace` reports every traced syscall of the call. Each half runs on the host that has its mechanism and
 * names why it was skipped elsewhere.
 */
async function checkAuditChannelRun() {
  if (process.platform === 'darwin') {
    skipCase(
      'Linux audit channel',
      `Bubblewrap and strace exist on Linux only, and this host is ${process.platform}; the Linux CI job runs it`,
    );
    const stub = lossyLogStub(2);
    try {
      const lossy = makeProject('audit-channel-lossy');
      const lossyRun = evaluate(['run', '--evaluation', lossy.folder], { ...lossy.env, [LOG_ENV]: stub.executable });
      check(
        lossyRun.status === 0,
        `a confined run over a log that loses reports exited ${lossyRun.status}; expected 0\n${lossyRun.output}`,
      );
      const directory = runDirectoryOf(lossy.folder);
      const record = directory === null ? {} : readJson(path.join(directory, 'run.json'));
      checkChannelRecords(record.observedMountsChannel, auditedTrials(), { lossless: false });
      const entries = Array.isArray(record.observedMountsChannel) ? record.observedMountsChannel : [];
      const lost = entries.filter((entry) => entry.completeness === 'lossy');
      check(
        lost.length > 0,
        `no trial of a run over a log that loses every second report recorded a lost canary: ${JSON.stringify(entries)}`,
      );
      const summary = record.outcome?.message ?? '';
      check(
        lostCanaryNote(entries) !== '' &&
          summary.endsWith(lostCanaryNote(entries)) &&
          lost.every((entry) =>
            summary.includes(
              `${entry.conditionArm} trial ${entry.trialIndex} (${entry.canariesSent - entry.canariesDelivered} of ${entry.canariesSent}`,
            ),
          ) &&
          entries
            .filter((entry) => entry.completeness === 'complete')
            .every((entry) => !summary.includes(`${entry.conditionArm} trial ${entry.trialIndex} (`)),
        `the run's summary does not name each trial that lost canaries with its counts, and no other: ${JSON.stringify(summary)}`,
      );
      check(
        lossyRun.output.includes(lostCanaryNote(entries)),
        `the command's own output does not carry the summary's note on lost canaries\n${lossyRun.output}`,
      );
    } finally {
      stub.end();
    }
  } else {
    skipCase(
      'macOS audit channel',
      `the kernel's log exists on macOS only (the lossy log and the real log), and this host is ${process.platform}; the macOS hosts run it`,
    );
  }
  if (process.platform === 'linux') {
    const absent = ['bwrap', 'strace'].filter((name) => executableOnPath(name, process.env) === null);
    if (absent.length > 0) {
      skipCase('Linux audit channel', `${absent.join(' and ')} not on PATH; the Linux CI job installs both`);
      return;
    }
  } else if (process.platform !== 'darwin') {
    return;
  }
  // The real log on a host that is not saturated loses none, and a Linux trace loses none: every trial is complete and the
  // summary names no loss.
  const project = makeProject('audit-channel-real');
  const ran = evaluate(['run', '--evaluation', project.folder], project.env);
  check(ran.status === 0, `a confined run over this host's real audit exited ${ran.status}; expected 0\n${ran.output}`);
  const directory = runDirectoryOf(project.folder);
  const record = directory === null ? {} : readJson(path.join(directory, 'run.json'));
  checkChannelRecords(record.observedMountsChannel, auditedTrials());
  checkSocketTruncationRecords(record.hostSocketTruncation);
  const summary = record.outcome?.message ?? '';
  if (process.platform === 'darwin') {
    checkReport(
      !/ trial \d+ \(/.test(summary),
      `a run whose trials lost no canary names a loss in its summary: ${JSON.stringify(summary)}`,
    );
  } else {
    checkSummaryNamesNoLoss(summary, 'a confined Linux run');
  }
}

/**
 * The audit channel's parts on their own (Story 1.81): a trial's entry and the summary's note from counts, the canary reads of
 * a macOS sandbox (sent while the trial runs, two at least in a trial shorter than a tick, delivered through the token, never
 * listed as a mount, their files removed, lost with the log's reports or killed by a target, the log's own loss event) and, on
 * any host through stand-ins, the sandbox that sends none under Bubblewrap and the port that audits nothing under an opt-out.
 */
async function checkAuditChannelUnits() {
  const arm = { conditionArm: 'mutated:M-001' };
  const counts = (canariesSent, canariesDelivered, logReportedLoss = false) => ({ canariesSent, canariesDelivered, logReportedLoss });
  check(
    JSON.stringify(channelEntry(arm, { trialIndex: 2, auditChannel: counts(41, 38) })) ===
      JSON.stringify({
        conditionArm: 'mutated:M-001',
        trialIndex: 2,
        completeness: 'lossy',
        canariesSent: 41,
        canariesDelivered: 38,
        logReportedLoss: false,
      }),
    'a trial that lost 3 of 41 canaries was not recorded as lossy with its counts',
  );
  for (const complete of [counts(41, 41), counts(0, 0)]) {
    check(
      channelEntry(arm, { trialIndex: 1, auditChannel: complete }).completeness === 'complete',
      `a trial with ${JSON.stringify(complete)} was not recorded as complete`,
    );
  }
  check(
    channelEntry(arm, { trialIndex: 1, auditChannel: counts(41, 41, true) }).completeness === 'lossy',
    'a trial whose log reported lost events was recorded as complete',
  );
  const entries = [
    { conditionArm: 'clean', trialIndex: 1, completeness: 'complete', canariesSent: 40, canariesDelivered: 40, logReportedLoss: false },
    { conditionArm: 'clean', trialIndex: 2, completeness: 'lossy', canariesSent: 40, canariesDelivered: 37, logReportedLoss: false },
    {
      conditionArm: 'mutated:M-001',
      trialIndex: 1,
      completeness: 'lossy',
      canariesSent: 52,
      canariesDelivered: 51,
      logReportedLoss: false,
    },
    { conditionArm: 'mutated:M-001', trialIndex: 2, completeness: 'lossy', canariesSent: 52, canariesDelivered: 52, logReportedLoss: true },
  ];
  const note = lostCanaryNote(entries);
  check(
    note.includes('clean trial 2 (3 of 40)') &&
      note.includes('mutated:M-001 trial 1 (1 of 52)') &&
      note.includes('mutated:M-001 trial 2 (the log reported lost events)') &&
      !note.includes('clean trial 1') &&
      note.includes('those trials'),
    `the summary's note on lost canaries is ${JSON.stringify(note)}; expected the three lossy trials with their counts and not the complete one`,
  );
  check(lostCanaryNote(entries.slice(0, 1)) === '', 'a run whose trials lost no canary got a note on lost canaries');
  check(lostCanaryNote([]) === '', 'a run with no audited trial got a note on lost canaries');

  const folder = tempDir('audit-channel-folder');
  const workspace = tempDir('audit-channel-workspace');
  const confinement = selectConfinement({ evaluation: {}, folder });
  if (confinement.refusal !== undefined) throw new Error(confinement.refusal);

  if (confinement.mode === 'seatbelt') {
    const bin = tempDir('audit-channel-macos-bin');
    const script = (name, body) => {
      const file = path.join(bin, name);
      fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
      return file;
    };
    // The sandbox's audit over `observer`'s log (and `sandboxExec`, when a case stands in for the kernel's executable): started,
    // idle for `waitMs` (or while `idle` runs, when a case acts during the wait), then `act` runs a call of the target, then the
    // mounts and the channel are read.
    const read = async (observer, { waitMs, sandboxExec = confinement.executable, act = null, idle = null }) => {
      const directory = fs.realpathSync(tempDir('audit-channel'));
      const sandbox = targetSandbox({
        confinement: { ...confinement, executable: sandboxExec, observer: { executable: observer } },
        workspace,
        audit: { directory },
      });
      try {
        await sandbox.start();
        await (idle === null ? new Promise((resolve) => setTimeout(resolve, waitMs)) : idle(sandbox));
        if (act !== null) await act(sandbox);
        const mounts = await sandbox.observedMounts();
        return { mounts, channel: sandbox.auditChannel(), directory };
      } finally {
        sandbox.release();
      }
    };
    // A trial shorter than a tick still has its first and its final canary.
    const brief = await read('/usr/bin/log', { waitMs: 0 });
    check(
      brief.channel?.canariesSent >= 2,
      `a trial that ended at once sent ${JSON.stringify(brief.channel)}; expected the first and the final canary`,
    );
    // A trial that runs for a second has one about every 50 ms, delivered through the real log (rarely a report is lost on a busy host).
    const quiet = await read('/usr/bin/log', { waitMs: 1200 });
    check(
      quiet.channel.canariesSent >= 12,
      `a trial that ran for 1.2 seconds sent ${JSON.stringify(quiet.channel)}; expected at least 12, half of the nominal 24 at one every 50 ms`,
    );
    checkReport(
      quiet.channel.canariesDelivered === quiet.channel.canariesSent && quiet.channel.logReportedLoss === false,
      `the real log lost canaries: ${JSON.stringify(quiet.channel)}`,
    );
    check(JSON.stringify(quiet.mounts) === '[]', `canary reads were listed as observed mounts: ${JSON.stringify(quiet.mounts)}`);
    check(
      fs.readdirSync(quiet.directory).every((name) => !name.startsWith('canary-')),
      `canary files remain in the audit directory: ${JSON.stringify(fs.readdirSync(quiet.directory))}`,
    );
    // A log that loses every second report leaves the canaries it lost counted.
    const stub = lossyLogStub(2);
    try {
      const lossy = await read(stub.executable, { waitMs: 1200 });
      check(
        lossy.channel.canariesSent >= 5 && lossy.channel.canariesDelivered < lossy.channel.canariesSent,
        `a log that loses every second report delivered ${JSON.stringify(lossy.channel)}; expected fewer canaries than were sent`,
      );
      check(
        lossy.channel.canariesDelivered > 0,
        `a log that loses every second report delivered no canary: ${JSON.stringify(lossy.channel)}`,
      );
    } finally {
      stub.end();
    }
    // A target that kills its canaries (a read process that ends by a signal) cannot hide the loss: each counts as sent.
    const killer = script('sandbox-exec', `case "$*" in *canary-*) exit 143 ;; esac\nexec ${confinement.executable} "$@"`);
    const killed = await read('/usr/bin/log', { waitMs: 400, sandboxExec: killer });
    check(
      killed.channel.canariesSent >= 2 && killed.channel.canariesDelivered === 0,
      `canaries a target killed were recorded as ${JSON.stringify(killed.channel)}; expected them counted as sent and undelivered`,
    );
    // A host whose process table is full, or a target that stops the canary's executable from starting, cannot hide the loss
    // either: a canary counts as sent when it is attempted, so the ones that could not start are counted and undelivered.
    const refusing = script('refusing-sandbox-exec', `exec ${confinement.executable} "$@"`);
    const unspawnable = await read('/usr/bin/log', {
      waitMs: 0,
      sandboxExec: refusing,
      idle: async () => {
        fs.chmodSync(refusing, 0o000);
        await new Promise((resolve) => setTimeout(resolve, 600));
        fs.chmodSync(refusing, 0o755);
      },
    });
    check(
      unspawnable.channel.canariesSent >= 8 &&
        unspawnable.channel.canariesDelivered < unspawnable.channel.canariesSent &&
        channelEntry(arm, { trialIndex: 1, auditChannel: unspawnable.channel }).completeness === 'lossy',
      `canaries that could not be spawned for 600 ms were recorded as ${JSON.stringify(unspawnable.channel)}; expected them counted as sent and undelivered, so lossy`,
    );
    // A target that freezes the runtime for two seconds (a stop signal to its parent) leaves no tick to run, so the canaries
    // the cadence called for in that time count as sent and undelivered.
    // A parent that resumes a stopped child (a shell's job control) undoes the freeze at once, so the case measures the
    // largest gap between two ticks of its own timer and judges the gap rule only when the freeze happened.
    let largestGapMs = 0;
    const frozen = await read('/usr/bin/log', {
      waitMs: 0,
      act: async (sandbox) => {
        let last = process.hrtime.bigint();
        const probe = setInterval(() => {
          const now = process.hrtime.bigint();
          largestGapMs = Math.max(largestGapMs, Number(now - last) / 1e6);
          last = now;
        }, 10);
        const wrapped = sandbox.wrap('/bin/sh', ['-c', 'kill -STOP $PPID; sleep 2; kill -CONT $PPID']);
        await new Promise((resolve) => spawn(wrapped.target, wrapped.args, { cwd: workspace, stdio: 'ignore' }).once('exit', resolve));
        clearInterval(probe);
      },
    });
    check(
      largestGapMs >= 1500,
      `the runtime was not frozen (its largest timer gap was ${Math.round(largestGapMs)} ms): the parent of this run resumed it, as a shell's job control does, so the gap rule was not exercised; run the suite directly from a shell prompt`,
    );
    check(
      frozen.channel.canariesSent >= 20 &&
        frozen.channel.canariesDelivered < frozen.channel.canariesSent &&
        channelEntry(arm, { trialIndex: 1, auditChannel: frozen.channel }).completeness === 'lossy',
      `a runtime frozen for 2 seconds was recorded as ${JSON.stringify(frozen.channel)}; expected the canaries it missed counted as sent and undelivered, so lossy`,
    );
    // No more than `CANARY_IN_FLIGHT` canary reads run at once on a host too slow to finish them, and a tick the cap skips
    // counts as a canary sent and undelivered.
    const slots = tempDir('audit-channel-slots');
    const started = path.join(tempDir('audit-channel-started'), 'started.log');
    const slow = script(
      'slow-sandbox-exec',
      `case "$*" in *canary-*) echo started >>${started}; mkdir ${slots}/$$; sleep 1; rmdir ${slots}/$$; exit 0 ;; esac\nexec ${confinement.executable} "$@"`,
    );
    let mostAtOnce = 0;
    const crowded = await read('/usr/bin/log', {
      waitMs: 1200,
      sandboxExec: slow,
      idle: async () => {
        const poll = setInterval(() => {
          mostAtOnce = Math.max(mostAtOnce, fs.readdirSync(slots).length);
        }, 5);
        await new Promise((resolve) => setTimeout(resolve, 1200));
        clearInterval(poll);
      },
    });
    const spawned = fs.readFileSync(started, 'utf8').split('\n').filter(Boolean).length;
    check(
      mostAtOnce >= 6 && mostAtOnce <= 8,
      `${mostAtOnce} canary reads ran at once while each took a second; expected the cap of 8 to hold and be reached`,
    );
    check(
      crowded.channel.canariesSent - spawned >= 6 && crowded.channel.canariesDelivered < crowded.channel.canariesSent,
      `${spawned} canary reads were started and ${JSON.stringify(crowded.channel)} recorded; expected the ticks the cap skipped counted as sent and undelivered`,
    );
    // A final canary whose process cannot start leaves nothing measured, which is a failure of the audit and not a complete trial.
    const vanishing = script('vanishing-sandbox-exec', `exec ${confinement.executable} "$@"`);
    let unmeasured = null;
    try {
      await read('/usr/bin/log', { waitMs: 0, sandboxExec: vanishing, act: async () => fs.rmSync(vanishing) });
    } catch (error) {
      unmeasured = error;
    }
    check(
      unmeasured?.name === 'ConfinementError' && unmeasured.message.includes('final canary read could not start'),
      `a trial whose final canary could not start ended as ${unmeasured}; expected the audit's failure`,
    );
    // A log that reports lost events is recorded as having lost them, whatever its canaries show.
    const outside = path.join(fs.realpathSync(tempDir('audit-channel-outside')), 'host-notes.txt');
    fs.writeFileSync(outside, 'a file no trial was granted\n');
    const reportsLoss = script('loss-log', 'echo \'{"eventType":"lossEvent"}\'; exec /usr/bin/log "$@"');
    const loss = await read(reportsLoss, {
      waitMs: 0,
      act: async (sandbox) => {
        const wrapped = sandbox.wrap('/bin/cat', [outside]);
        await new Promise((resolve) => spawn(wrapped.target, wrapped.args, { cwd: workspace, stdio: 'ignore' }).once('exit', resolve));
      },
    });
    checkReport(
      loss.channel.logReportedLoss === true && JSON.stringify(loss.mounts) === JSON.stringify([fs.realpathSync(outside)]),
      `a log that reported lost events was recorded as ${JSON.stringify(loss.channel)} with the mounts ${JSON.stringify(loss.mounts)}`,
    );
  } else {
    skipCase('macOS canary reads', `the kernel's log exists on macOS only, and this host is ${process.platform}; the macOS hosts run it`);
  }

  // A Bubblewrap sandbox sends no canary: strace reports every traced syscall of the call. The audit's observer of a Linux
  // sandbox has no process to start, so stand-in executables stand for `bwrap` and `strace` on any host.
  const stubBwrap = path.join(tempDir('audit-channel-bwrap'), 'bwrap');
  const untraced = path.join(tempDir('audit-channel-strace'), 'strace');
  const bubblewrap = {
    mode: 'bubblewrap',
    executable: stubBwrap,
    evaluationFolder: path.resolve(folder),
    observer: { executable: untraced },
  };
  const traced = targetSandbox({
    confinement: bubblewrap,
    workspace,
    status: tempDir('audit-channel-status'),
    audit: { directory: fs.realpathSync(tempDir('audit-channel-traced')) },
  });
  await traced.start();
  check(
    JSON.stringify(await traced.observedMounts()) === '[]' && JSON.stringify(traced.auditChannel()) === JSON.stringify(counts(0, 0)),
    `a Bubblewrap sandbox's audit channel is ${JSON.stringify(traced.auditChannel())}; expected no canary sent, none delivered and no reported loss`,
  );
  const plain = targetSandbox({ confinement: bubblewrap, workspace, status: tempDir('audit-channel-plain-status') });
  check(plain.auditChannel() === null, 'a sandbox that does not audit reported an audit channel');
  // A port of a run that opted out audits nothing, so its trial has no entry.
  const optedOut = createRegistry(readJson(path.join(FIXTURE, 'evals', 'verdict', 'evaluation.json')).registry, {
    root: FIXTURE,
    scratch: [],
    confinement: { mode: 'opt-out', evaluationFolder: path.resolve(folder) },
  });
  const port = await optedOut.createProbePort({
    cwd: workspace,
    projectRoot: workspace,
    workspace,
    git: null,
    privateRoot: null,
    audit: true,
  });
  check(port.auditChannel() === null, 'the port of a run that opted out of confinement reported an audit channel');
  port.releaseHome();
}

/**
 * A run whose observer cannot confirm itself, or fails during a trial, exits 12 with the cause, on any host (Story 1.60): the
 * Linux mechanism is stood in for by a `bwrap` that runs its command unconfined and a `strace` that is refused, or that
 * confirms the probe and then traces nothing, so the run reaches the refusal and the trial's failure end to end.
 */
async function checkObserverRefusalRun() {
  const stubs = tempDir('observer-stubs');
  const stub = (name, body) => fs.writeFileSync(path.join(stubs, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  stub(
    'bwrap',
    String.raw`dev_dst=""; dev_src=""; prev=""; last_src=""
for a in "$@"; do
  if [ "$prev" = "--bind" ]; then last_src="$a"
  elif [ -n "$last_src" ]; then
    case "$a" in /dev/*) dev_src="$last_src"; dev_dst="$a" ;; esac
    last_src=""
  fi
  prev="$a"
done
while [ "$1" != "--" ]; do shift; done
shift
if [ -n "$dev_dst" ]; then
  for a in "$@"; do
    if [ "$a" = "$dev_dst" ]; then set -- "$@" "$dev_src"; else set -- "$@" "$a"; fi
    shift
  done
fi
exec "$@"`,
  );
  const environment = (project) => ({ ...project.env, PATH: `${stubs}${path.delimiter}${process.env.PATH}`, [PLATFORM_ENV]: 'linux' });

  stub('strace', 'echo "strace: ptrace(PTRACE_TRACEME): Operation not permitted" >&2; exit 1');
  const refused = makeProject('observer-refused');
  const refusedRun = evaluate(['run', '--evaluation', refused.folder], environment(refused));
  check(
    refusedRun.status === 12 &&
      refusedRun.output.includes('cannot observe a confined process on this host') &&
      refusedRun.output.includes('Operation not permitted') &&
      refusedRun.output.includes('"confinement": false'),
    `a run on a host whose strace is refused exited ${refusedRun.status}; expected 12 naming the cause and the opt-out\\n${refusedRun.output}`,
  );
  check(runDirectoryOf(refused.folder, 0) === null, 'a run refused for its observer wrote a run directory');

  // The probe passes (the stub traces the reader it is asked about) and every real call is traced by nothing.
  stub(
    'strace',
    String.raw`out=""; prev=""
for a in "$@"; do if [ "$prev" = "-o" ]; then out="$a"; fi; prev="$a"; done
case "$prev" in
  */tea-evaluate-observer-probe-*) printf '1 openat(AT_FDCWD</>, "%s", O_RDONLY) = 3<%s>\n' "$prev" "$prev" > "$out"; exit 0 ;;
esac
while [ "$1" != "--" ]; do shift; done; shift; exec "$@"`,
  );
  const untraced = makeProject('observer-untraced');
  const untracedRun = evaluate(['run', '--evaluation', untraced.folder], environment(untraced));
  check(
    untracedRun.status === 12 &&
      untracedRun.output.includes('holds no start of its target') &&
      untracedRun.output.includes('yields no record'),
    `a run whose observer traced nothing exited ${untracedRun.status}; expected 12 with no record for the trial\\n${untracedRun.output}`,
  );
}

/**
 * What a cut list of host sockets reaches in a real run (Story 1.82), through the real CLI: no test host holds more sockets than a
 * call can hide, so a preload (`fixtures/evaluate/cut-socket-report.cjs`) makes each target sandbox report one cut call of two with five
 * sockets left reachable, as the registry's probe port reads it. Each audited trial then appears under `hostSocketTruncation` in
 * `run.json` with its counts, and the run's summary and the command's own output name each of them. The units hold the sandbox's
 * count and the entry's shape; this case holds the wiring between them (the registry's port, the trial, `run.json`, the summary), so
 * a registry that reports nothing, a run that does not record the report and a summary without the note each fail it.
 */
async function checkHostSocketRecordRun() {
  if (process.platform === 'linux') {
    const absent = ['bwrap', 'strace'].filter((name) => executableOnPath(name, process.env) === null);
    if (absent.length > 0) {
      skipCase('host socket record', `${absent.join(' and ')} not on PATH; the Linux CI job installs both`);
      return;
    }
  } else if (process.platform !== 'darwin') {
    skipCase('host socket record', `Seatbelt and Bubblewrap exist on macOS and Linux only, and this host is ${process.platform}`);
    return;
  }
  const project = makeProject('host-socket-record');
  const ran = evaluate(['run', '--evaluation', project.folder], project.env, ['--require', CUT_SOCKET_REPORT]);
  check(ran.status === 0, `a confined run whose sandboxes report a cut list exited ${ran.status}; expected 0\n${ran.output}`);
  const directory = runDirectoryOf(project.folder);
  const record = directory === null ? {} : readJson(path.join(directory, 'run.json'));
  const entries = Array.isArray(record.hostSocketTruncation) ? record.hostSocketTruncation : [];
  check(
    JSON.stringify(entries) ===
      JSON.stringify(
        auditedTrials().map(({ conditionArm, trialIndex }) => ({
          conditionArm,
          trialIndex,
          calls: 2,
          truncatedCalls: 1,
          socketsLeftReachable: 5,
        })),
      ),
    `run.json records the host-socket truncation ${JSON.stringify(record.hostSocketTruncation)}; expected one entry for each audited trial (${JSON.stringify(auditedTrials())}) with 2 calls, 1 cut and 5 sockets left reachable`,
  );
  const summary = record.outcome?.message ?? '';
  check(
    entries.length > 0 &&
      summary.endsWith(leftSocketsNote(entries)) &&
      entries.every((entry) => summary.includes(`${entry.conditionArm} trial ${entry.trialIndex} (1 of 2 call(s), up to 5 socket(s))`)) &&
      summary.includes('the host held more Unix sockets than a call can hide'),
    `the run's summary does not name each trial whose calls left sockets reachable with its counts: ${JSON.stringify(summary)}`,
  );
  check(
    entries.length > 0 && ran.output.includes(leftSocketsNote(entries)),
    `the command's own output does not carry the summary's note on the sockets left reachable\n${ran.output}`,
  );
}

/** A platform with no mechanism: refused, unless the evaluation opts out, which run.json and the notes record (Story 1.31). */
async function checkPlatformRefusal() {
  const platformless = makeProject('confinement-platformless');
  const refused = evaluate(['run', '--evaluation', platformless.folder], { ...platformless.env, [PLATFORM_ENV]: 'plan9' });
  check(
    refused.status === 12 &&
      refused.output.includes('file-system confinement has no mechanism on plan9') &&
      refused.output.includes('"confinement": false'),
    `run on a platform with no confinement exited ${refused.status}; expected 12 naming the platform and the opt-out\n${refused.output}`,
  );
  check(runDirectoryOf(platformless.folder, 0) === null, 'a refused run on a platform with no confinement wrote a run directory');
  // preflight decides the confinement in the same pipeline, so it refuses the same way.
  const refusedPreflight = evaluate(['preflight', '--evaluation', platformless.folder], { ...platformless.env, [PLATFORM_ENV]: 'plan9' });
  check(
    refusedPreflight.status === 12 && refusedPreflight.output.includes('file-system confinement has no mechanism on plan9'),
    `preflight on a platform with no confinement exited ${refusedPreflight.status}; expected 12 naming the platform\n${refusedPreflight.output}`,
  );
  const optedOut = makeProject('confinement-opted-out', { unconfined: true });
  const optedOutRun = evaluate(['run', '--evaluation', optedOut.folder], { ...optedOut.env, [PLATFORM_ENV]: 'plan9' });
  check(
    optedOutRun.status === 0,
    `an opted-out run on a platform with no confinement exited ${optedOutRun.status}; expected 0\n${optedOutRun.output}`,
  );
  const optedOutDirectory = runDirectoryOf(optedOut.folder);
  const optedOutRecord = optedOutDirectory === null ? {} : readJson(path.join(optedOutDirectory, 'run.json'));
  check(
    optedOutRecord.confinement === 'opt-out',
    `an opted-out run records confinement ${JSON.stringify(optedOutRecord.confinement)}; expected "opt-out"`,
  );
  // Nothing audited an opted-out trial, so the run records no audit channel for any of them (Story 1.81).
  check(
    JSON.stringify(optedOutRecord.observedMountsChannel) === '[]',
    `an opted-out run records the audit channel ${JSON.stringify(optedOutRecord.observedMountsChannel)}; expected an empty list`,
  );
  const optedOutNotes =
    optedOutDirectory === null
      ? []
      : Object.values(
          readJson(path.join(optedOutDirectory, 'trial-sets', 'P-001', 'isolation-manifest.json')).forbiddenInputAccounting,
        ).map((entry) => entry.note);
  check(
    optedOutNotes.length === 7 &&
      optedOutNotes.every((note) => note.includes('opted out of file-system confinement') && !note.includes('Withheld as well by')),
    `an opted-out run's forbidden-input notes claim a confinement: ${JSON.stringify(optedOutNotes)}`,
  );
  // score says an opted-out run's targets ran unconfined, in its summary and its score.json.
  const optedOutScore = evaluate(['score', '--evaluation', optedOut.folder], optedOut.env);
  const optedOutScores = optedOutDirectory === null ? null : latestScoreDirectory(optedOutDirectory);
  check(
    optedOutScore.status === 0 &&
      optedOutScore.output.includes('the run opted out of file-system confinement') &&
      optedOutScores !== null &&
      readJson(path.join(optedOutScores, 'score.json')).confinement === 'opt-out',
    `score over an opted-out run did not say its targets ran unconfined (exit ${optedOutScore.status})\n${optedOutScore.output}`,
  );
}

/** A leftover process that rewrites a sealed record and its digest in run.json once run has exited (Story 1.31). */
async function checkLeftoverProcess() {
  for (const confined of [true, false]) {
    const label = confined ? 'confinement-leftover' : 'confinement-leftover-open';
    const project = makeProject(label, { unconfined: !confined, toolchain: true });
    const marker = path.join(tempDir(`${label}-marker`), 'leftover');
    const listener = reportListener(label);
    let reported;
    let ran;
    try {
      ran = evaluate(['run', '--evaluation', project.folder], {
        ...project.env,
        VERDICT_WHEN: 'trial-clean-1',
        VERDICT_DO: 'leftover-tamper',
        VERDICT_TOUCH: marker,
        VERDICT_REPORT: listener.port,
      });
      check(waitUntilGone(marker), `${label}: the leftover process was still running a minute after run exited`);
      reported = listener.line(/^tamper: /);
    } finally {
      listener.close();
    }
    check(ran.status === 0, `${label}: run exited ${ran.status}; expected 0\n${ran.output}`);
    // The leftover process's own report, sent once the runtime had exited: proof that it ran and attempted the rewrite.
    // Under Bubblewrap the target's process ids are a namespace of their own: what it leaves running ends with it, and
    // it cannot see the runtime at all, so the case holds only that no rewrite ever lands.
    const namespaced = confined && process.platform === 'linux';
    check(
      confined
        ? /^tamper: refused (EPERM|EACCES|ENOENT|EROFS)$/.test(reported ?? '') || (namespaced && reported === null)
        : reported === 'tamper: allowed',
      `${label}: the leftover process reported ${JSON.stringify(reported)}; expected ${confined ? 'its rewrite refused' : 'its rewrite allowed'}`,
    );
    const runDirectory = runDirectoryOf(project.folder);
    check(
      namespaced || /leftover-runtime: \d+/.test(trialStdout(runDirectory, 'clean', 1)),
      `${label}: the stub found no runtime for its leftover process to outlive: ${trialStdout(runDirectory, 'clean', 1)}`,
    );
    const record = runDirectory === null ? {} : readJson(path.join(runDirectory, 'trial-sets', 'P-001', 'record-1.json'));
    const scored = evaluate(['score', '--evaluation', project.folder], project.env);
    if (confined) {
      check(
        record.evaluatorRecommendation === 'PASS',
        `a confined leftover process rewrote record-1.json: ${record.evaluatorRecommendation}`,
      );
      check(scored.status === 0, `score after a confined leftover process exited ${scored.status}; expected 0\n${scored.output}`);
    } else {
      // The control: unconfined, the rewrite lands with its digest, so score hands it to the engine, which refuses the set.
      const why = fs.existsSync(`${marker}.error`) ? fs.readFileSync(`${marker}.error`, 'utf8') : 'no error noted';
      check(
        record.evaluatorRecommendation === 'FAIL',
        `the unconfined control never rewrote record-1.json, so the case proves nothing: ${why}`,
      );
      check(
        scored.status === 3 && !scored.output.includes('record-1.json'),
        `score over the unconfined control's rewritten record exited ${scored.status}; expected the engine's 3 with no finding of its own\n${scored.output}`,
      );
    }
  }
}

/** A leftover process that swaps a tracked evaluator/ file while the evaluator launches, and has it put itself back (Story 1.31). */
async function checkEvaluatorSwap() {
  for (const confined of [true, false]) {
    const label = confined ? 'confinement-swap' : 'confinement-swap-open';
    const project = makeProject(label, { unconfined: !confined, edit: ({ folder }) => useWrappedEvaluator(folder) });
    const implBytes = fs.readFileSync(path.join(project.folder, 'evaluator', 'impl.js'));
    const marker = path.join(tempDir(`${label}-marker`), 'swapper');
    const listener = reportListener(label);
    let reported;
    let ran;
    try {
      ran = evaluate(['run', '--evaluation', project.folder], {
        ...project.env,
        VERDICT_WHEN: 'trial-clean-1',
        VERDICT_DO: 'swap-evaluator',
        VERDICT_TOUCH: marker,
        VERDICT_REPORT: listener.port,
      });
      check(waitUntilGone(marker), `${label}: the swapping process was still running a minute after run exited`);
      reported = listener.line(/^swap/);
    } finally {
      listener.close();
    }
    check(ran.status === 0, `${label}: run exited ${ran.status}; expected 0\n${ran.output}`);
    // The swapping process's own report: it saw the evaluator start, then attempted the swap.
    // Under Bubblewrap the swapper ends with the target's process namespace, before the evaluator launches.
    const namespaced = confined && process.platform === 'linux';
    check(
      confined
        ? /^swap: refused (EPERM|EACCES|ENOENT|EROFS)$/.test(reported ?? '') || (namespaced && reported === null)
        : reported === 'swap: allowed',
      `${label}: the swapping process reported ${JSON.stringify(reported)}; expected ${confined ? 'its swap refused once the evaluator started' : 'its swap allowed'}`,
    );
    const runDirectory = runDirectoryOf(project.folder);
    const answered =
      runDirectory === null ? null : readJson(path.join(runDirectory, 'trials', 'clean', 'trial-1.json')).evaluator?.answer?.rows?.[0];
    const record = runDirectory === null ? {} : readJson(path.join(runDirectory, 'trial-sets', 'P-001', 'record-1.json'));
    // The row-converting evaluator's trials record their audit channel as the deterministic evaluator's do (Story 1.81).
    const channel = runDirectory === null ? undefined : readJson(path.join(runDirectory, 'run.json')).observedMountsChannel;
    if (confined) checkChannelRecords(channel, auditedTrials(), { lossless: false });
    else
      check(
        JSON.stringify(channel) === '[]',
        `an unconfined run records the audit channel ${JSON.stringify(channel)}; expected an empty list`,
      );
    check(
      fs.readFileSync(path.join(project.folder, 'evaluator', 'impl.js')).equals(implBytes),
      `${label}: evaluator/impl.js does not hold the committed bytes after the run`,
    );
    if (confined) {
      check(
        answered?.comment === 'original bytes ran',
        `a confined run's trial-clean-1 was judged by other bytes than the ones it digested: ${JSON.stringify(answered)}`,
      );
      check(record.findings?.length === 0, `a confined run's clean control carries findings: ${JSON.stringify(record.findings)}`);
      // The row-converting evaluator's trials carry the audit's observed mounts too: the refused swap is one.
      const swapped = path.join(fs.realpathSync(project.folder), 'evaluator', 'impl.js');
      const mounts = observedMountsOf(runDirectory, 'P-001') ?? [];
      checkReport(
        namespaced || mounts.includes(swapped),
        `a confined run's P-001 does not list the swap it refused as an observed mount: ${JSON.stringify(mounts)}`,
      );
    } else {
      // The control: unconfined, the swapped bytes run and put the original back, so the layer reads the same afterwards.
      check(
        answered?.comment === 'swapped bytes ran',
        `the unconfined control never ran swapped bytes, so the case proves nothing: ${JSON.stringify(answered)}`,
      );
    }
  }
}

/**
 * What stops a confined command before anything starts, each with exit 12 and
 * no run directory (Story 1.31): a mechanism present on PATH that cannot
 * confine a trivial process (a stub bwrap failing as a kernel without
 * unprivileged user namespaces makes it fail, on a host named Linux), a temp
 * directory inside the evaluation folder, and an evaluation folder or temp
 * directory whose path no profile can carry.
 */
async function checkConfinementRefusals() {
  const refusedWith = (label, result, expected) => {
    check(
      result.status === 12 && expected.every((text) => result.output.includes(text)),
      `${label}: run exited ${result.status}; expected 12 naming ${JSON.stringify(expected)}\n${result.output}`,
    );
  };
  const probed = makeProject('confinement-probe-refused');
  const stubs = tempDir('confinement-stub-bwrap');
  fs.writeFileSync(path.join(stubs, 'bwrap'), '#!/bin/sh\necho "bwrap: setting up uid map: Permission denied" >&2\nexit 1\n', {
    mode: 0o755,
  });
  const probeRefused = evaluate(['run', '--evaluation', probed.folder], {
    ...probed.env,
    [PLATFORM_ENV]: 'linux',
    PATH: `${stubs}${path.delimiter}${process.env.PATH}`,
  });
  refusedWith('a mechanism whose probe fails', probeRefused, [
    `${MECHANISM_NAMES.bubblewrap} cannot confine a process on this host`,
    'bwrap: setting up uid map: Permission denied',
    'unprivileged user namespaces',
    '"confinement": false',
  ]);
  check(runDirectoryOf(probed.folder, 0) === null, 'a run whose mechanism failed its probe wrote a run directory');

  // A temp directory under the evaluation folder's ignored runs/, so the folder stays clean for the checks before it.
  const inside = makeProject('confinement-temp-inside');
  const insideTemp = path.join(inside.folder, 'runs', 'tmp');
  fs.mkdirSync(insideTemp, { recursive: true });
  const insideRefused = evaluate(['run', '--evaluation', inside.folder], { TMPDIR: insideTemp, TMP: insideTemp, TEMP: insideTemp });
  refusedWith('a temp directory inside the evaluation folder', insideRefused, ['is inside the evaluation folder', 'point TMPDIR outside']);

  const quoted = makeProject('confinement-quoted-folder', { below: 'quo"ted' });
  refusedWith('an evaluation folder whose path holds a quote', evaluate(['run', '--evaluation', quoted.folder], quoted.env), [
    "the evaluation folder's path",
    'holds a quote, a backslash or a line break',
  ]);
  check(runDirectoryOf(quoted.folder, 0) === null, 'a run whose evaluation folder no profile can carry wrote a run directory');

  const quotedTemp = makeProject('confinement-quoted-temp');
  const unsafeTemp = path.join(tempDir('confinement-quoted-temp-parent'), 'te"mp');
  fs.mkdirSync(unsafeTemp);
  refusedWith(
    'a temp directory whose path holds a quote',
    evaluate(['run', '--evaluation', quotedTemp.folder], { TMPDIR: unsafeTemp, TMP: unsafeTemp, TEMP: unsafeTemp }),
    ['the temp directory', 'holds a quote, a backslash or a line break', 'point TMPDIR elsewhere'],
  );
  check(runDirectoryOf(quotedTemp.folder, 0) === null, 'a run whose temp directory no profile can carry wrote a run directory');
}

/** A confined target writes the private temp directory each call hands it, which the audit does not report (Story 1.31). */
async function checkTargetTemp() {
  const project = makeProject('confinement-temp');
  const ran = evaluate(['run', '--evaluation', project.folder], {
    ...project.env,
    VERDICT_WHEN: 'trial-clean-1',
    VERDICT_DO: 'write-temp',
  });
  check(ran.status === 0, `a confined run whose target wrote its temp directory exited ${ran.status}; expected 0\n${ran.output}`);
  const runDirectory = runDirectoryOf(project.folder);
  const out = trialStdout(runDirectory, 'clean', 1);
  const temp = /temp-dir: (.*)/.exec(out)?.[1] ?? '';
  check(/temp-write: allowed/.test(out), `a confined target could not write the temp directory it was handed:\n${out}`);
  check(
    temp !== '' && path.dirname(temp) === fs.realpathSync(project.env.TMPDIR) && !fs.existsSync(temp),
    `a confined call's temp directory ${JSON.stringify(temp)} is not a private directory under the run's temp directory, removed after the call`,
  );
  check(
    JSON.stringify(observedMountsOf(runDirectory, 'P-001')) === '[]',
    `a write into the call's own temp directory was reported: ${JSON.stringify(observedMountsOf(runDirectory, 'P-001'))}`,
  );
}

/** What the `write-home` act printed, by name: `name: value` lines. */
function homeReport(stdout) {
  return Object.fromEntries(
    [
      ...stdout.matchAll(
        /^(home|xdg|home-before|parent-list|root-list|run-homes|peer-read|home-write|xdg-write|beside-write|host-write): (.*)$/gm,
      ),
    ].map((m) => [m[1], m[2]]),
  );
}

/**
 * A confined target keeps its state in a private home (Story 1.59): `HOME` and the XDG base directories name a directory
 * beneath the run's private parent that the trial may write, whatever the registry entry's `environmentKeys` pass from
 * the host; the host's home, the directory the home sits in and the evaluation folder stay closed; the target reaches no
 * other home, whether another stage's, another trial's or another run's; the next trial starts with an empty home; and
 * no home outlives the run. An opt-out run keeps the host environment and makes no home.
 */
async function checkTargetHome() {
  const hostHome = fs.realpathSync(tempDir('home-host'));
  const hostEnv = {
    HOME: hostHome,
    XDG_CONFIG_HOME: path.join(hostHome, 'config'),
    XDG_CACHE_HOME: path.join(hostHome, 'cache'),
    XDG_DATA_HOME: path.join(hostHome, 'data'),
    VERDICT_TOUCH: path.join(hostHome, 'touched.txt'),
  };
  // Another run's private parent beneath the same root, holding a file no target of this run may read.
  const peerScratch = [];
  const peerFile = path.join(makePrivateParent(peerScratch), 'peer-secret.txt');
  fs.writeFileSync(peerFile, 'another run\n');
  hostEnv.VERDICT_PEER = peerFile;
  try {
    await checkTargetHomeRuns(hostHome, hostEnv);
  } finally {
    for (const directory of peerScratch) fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function checkTargetHomeRuns(hostHome, hostEnv) {
  const passHome = ({ folder }) =>
    editJson(path.join(folder, 'evaluation.json'), (evaluation) =>
      evaluation.registry[0].environmentKeys.push('HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'VERDICT_PEER'),
    );
  const closed = /^refused (EPERM|EACCES|ENOENT)$/;
  // The confined project's plan has a second step, so the calls of one arm are two: the second must find the first's state.
  const twoSteps = ({ folder }) =>
    editJson(path.join(folder, 'contract.json'), (contract) => {
      contract.interactionPlan.push({ ...structuredClone(contract.interactionPlan[0]), stepId: 'judge-run-again', after: 'judge-run' });
    });

  const project = makeProject('confinement-home', {
    edit: (made) => {
      passHome(made);
      twoSteps(made);
    },
  });
  const ran = evaluate(['run', '--evaluation', project.folder], {
    ...project.env,
    ...hostEnv,
    VERDICT_WHEN: 'qualify-P-002,trial-clean-1,trial-clean-2',
    VERDICT_DO: 'write-home',
  });
  check(ran.status === 0, `a confined run whose target kept state under HOME exited ${ran.status}; expected 0\n${ran.output}`);
  const runDirectory = runDirectoryOf(project.folder);
  const root = fs.realpathSync(path.join('/tmp', `tea-evaluate-p${process.getuid()}`));
  const homes = [];
  const everyHome = new Set();
  const stepsOf = (trial) => {
    const evidence = written(path.join(runDirectory, 'trials', 'clean', `trial-${trial}.json`), `clean trial ${trial}`);
    return (evidence?.steps ?? []).map((step) => String(step.observation?.stdout?.value ?? step.observation?.stdout ?? ''));
  };
  for (const trial of [1, 2]) {
    const [out, again] = stepsOf(trial);
    const second = homeReport(again ?? '');
    // The calls of one trial share its home, so the second step finds what the first wrote.
    check(
      second.home === homeReport(out ?? '').home && /\.verdict-state\/session\.json/.test(second['home-before'] ?? ''),
      `confined trial ${trial}'s second step found ${second['home-before']} in ${second.home}; the calls of one trial keep the state they write`,
    );
    const report = homeReport(out);
    homes.push(report.home);
    everyHome.add(report.home);
    const label = `confined trial ${trial}`;
    const home = report.home ?? '';
    check(
      path.dirname(path.dirname(home)) === root &&
        path.basename(path.dirname(home)).startsWith('run-') &&
        path.basename(home).startsWith('tea-evaluate-target-home-'),
      `${label} saw HOME ${JSON.stringify(report.home)}; expected a private home beneath the run's private parent in ${root}\n${out}`,
    );
    check(
      report.xdg === ['.config', '.cache', path.join('.local', 'share')].map((name) => path.join(home, name)).join(' '),
      `${label} saw the XDG base directories ${JSON.stringify(report.xdg)}; expected directories inside HOME, the host's values overridden`,
    );
    check(
      report['home-write'] === 'allowed' && report['xdg-write'] === 'allowed',
      `${label} could not write its state: ${JSON.stringify({ home: report['home-write'], xdg: report['xdg-write'] })}`,
    );
    check(
      report['home-before'] === '[]',
      `${label} started with ${report['home-before']} in its home; each trial starts with an empty one`,
    );
    // Only its own home is reachable: the parent and the root answer a refusal or show nothing but the path to the home
    // (Bubblewrap's empty file system holds the mount point), and another run's file is out of reach.
    check(
      closed.test(report['parent-list'] ?? '') || report['parent-list'] === JSON.stringify([path.basename(home)]),
      `${label} listed its home's parent as ${report['parent-list']}; expected a refusal or its own home alone`,
    );
    check(
      closed.test(report['root-list'] ?? '') || report['root-list'] === JSON.stringify([path.basename(path.dirname(home))]),
      `${label} listed the private root as ${report['root-list']}; expected a refusal or its own parent alone`,
    );
    check(closed.test(report['peer-read'] ?? ''), `${label} read another run's file: ${report['peer-read']}`);
    for (const [name, what] of [
      ['beside-write', 'the directory its home sits in'],
      ['host-write', "the host's real home"],
    ]) {
      check(/^refused (EPERM|EACCES|EROFS|ENOENT)$/.test(report[name] ?? ''), `${label} wrote ${what}: ${JSON.stringify(report[name])}`);
    }
  }
  check(homes[0] !== undefined && homes[0] !== homes[1], `two trials shared one home: ${JSON.stringify(homes)}`);

  // The baseline, mutated and re-pass arms of one probe's qualification share one port and one working directory, and each
  // writes its state; an arm that kept the one before's would carry state across a mutation, so each starts empty.
  const qualified = ['baseline-pass', 'mutated-fail', 'rollback'].map((phase) => {
    const file = path.join(runDirectory, 'qualification', 'P-002', `${phase}.json`);
    const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    for (const match of text.matchAll(/(?:\\n|")home: ([^\\"]*)\\n/g)) everyHome.add(match[1]);
    return { phase, before: /home-before: ([^\\]*)\\n/.exec(text)?.[1], written: /home-write: (\w+)/.exec(text)?.[1] };
  });
  check(
    qualified.every(({ before, written }) => before === '[]' && written === 'allowed'),
    `the qualification arms of one probe found ${JSON.stringify(qualified)} in their homes; each independent arm starts with an empty home it can write`,
  );
  check(!fs.existsSync(path.join(hostHome, 'touched.txt')), "a confined target wrote a file in the host's real home");
  // Every home an arm reported (a new one for each independent arm) is gone once the run ends.
  check(
    everyHome.size >= 5 &&
      [...everyHome].every(
        (home) => home !== undefined && path.isAbsolute(home) && !fs.existsSync(home) && !fs.existsSync(path.dirname(home)),
      ),
    `a private home or the run's private parent outlived the run: ${JSON.stringify([...everyHome].filter((home) => home !== undefined && fs.existsSync(path.dirname(home))))} of ${everyHome.size} reported`,
  );

  // The opt-out run keeps today's environment and makes no home. Its target is not withheld the private root, so it lists
  // the homes under the run's own parent and reads the peer file (the control that the confined reads above are refusals).
  const open = makeProject('confinement-home-open', { edit: passHome, unconfined: true });
  const openRan = evaluate(['run', '--evaluation', open.folder], {
    ...open.env,
    ...hostEnv,
    VERDICT_WHEN: 'trial-clean-1',
    VERDICT_DO: 'write-home',
  });
  check(openRan.status === 0, `an unconfined run exited ${openRan.status}; expected 0\n${openRan.output}`);
  const openReport = homeReport(trialStdout(runDirectoryOf(open.folder), 'clean', 1));
  check(
    openReport.home === '[redacted]' && openReport.xdg === '[redacted] [redacted] [redacted]',
    `an unconfined target saw ${JSON.stringify({ home: openReport.home, xdg: openReport.xdg })}; expected the host's values, which the run records redacted`,
  );
  check(
    openReport['run-homes'] === JSON.stringify({ found: true, homes: [] }),
    `an unconfined target saw ${openReport['run-homes']} under its run's private parent; expected the parent found and no home, since an opt-out run keeps the host environment and makes none`,
  );
  check(openReport['peer-read'] === 'allowed', `the unconfined control read another run's file as ${openReport['peer-read']}`);
}

/**
 * What a target confined with its own home reaches beneath the private root (the real mechanism of this host): its home
 * writable and readable; a sibling home, the private parent and the root, another run's parent, the evaluation folder and
 * a unix socket under the root refused or empty.
 */
async function checkHomeReach({ made, sibling, parent, root, folder, workspace }) {
  const confinement = selectConfinement({ evaluation: {}, folder });
  if (confinement.refusal !== undefined) throw new Error(confinement.refusal);
  const status = confinement.mode === 'bubblewrap' ? tempDir('home-reach-status') : null;
  const peer = fs.mkdtempSync(path.join(root, 'run-0-peer-'));
  fs.writeFileSync(path.join(peer, 'secret.txt'), 'another run\n');
  fs.writeFileSync(path.join(sibling, 'secret.txt'), 'a sibling home\n');
  fs.mkdirSync(path.join(made, 'm'));
  fs.writeFileSync(path.join(made, 'm', 'index.js'), 'module.exports = 42;\n');
  const socket = path.join(parent, 'b.sock');
  const server = net.createServer((connection) => connection.end());
  await new Promise((resolve) => server.listen(socket, resolve));
  try {
    const sandbox = targetSandbox({ confinement, workspace, privateRoot: root, home: made, status });
    const probe = `
      const fs = require('node:fs');
      const net = require('node:net');
      const [home, sibling, parent, root, peer, socket] = process.argv.slice(1);
      const attempt = (name, action) => { try { return name + ': ' + action(); } catch (error) { return name + ': refused ' + error.code; } };
      const lines = [
        attempt('own-write', () => { fs.writeFileSync(home + '/x', '1'); return 'allowed'; }),
        attempt('own-read', () => fs.readFileSync(home + '/x', 'utf8') === '1' ? 'allowed' : 'wrong'),
        attempt('sibling-read', () => fs.readFileSync(sibling + '/secret.txt', 'utf8')),
        attempt('sibling-write', () => { fs.writeFileSync(sibling + '/y', '1'); return 'allowed'; }),
        attempt('peer-read', () => fs.readFileSync(peer + '/secret.txt', 'utf8')),
        attempt('parent-list', () => JSON.stringify(fs.readdirSync(parent))),
        attempt('root-list', () => JSON.stringify(fs.readdirSync(root))),
        attempt('parent-write', () => { fs.writeFileSync(parent + '/y', '1'); return 'allowed'; }),
        // What an agent CLI does with its home: load a module stored in it, resolve its path, make directories, change into it.
        attempt('module', () => require(home + '/m/index.js') === 42 ? 'allowed' : 'wrong'),
        attempt('realpath', () => fs.realpathSync(home) === home ? 'allowed' : 'wrong'),
        attempt('mkdir-p', () => { require('node:child_process').execFileSync('mkdir', ['-p', home + '/.config/x']); return 'allowed'; }),
        attempt('cd-pwd', () => require('node:child_process').execFileSync('/bin/sh', ['-c', 'cd "$0" && pwd -P', home], { encoding: 'utf8' }).trim() === home ? 'allowed' : 'wrong'),
      ];
      const client = net.connect(socket);
      client.on('connect', () => { console.log(lines.join('\\n') + '\\nsocket: allowed'); client.destroy(); });
      client.on('error', (error) => console.log(lines.join('\\n') + '\\nsocket: refused ' + error.code));
    `;
    const wrapped = sandbox.wrap(process.execPath, ['-e', probe, made, sibling, parent, root, peer, socket]);
    const ran = spawnSync(wrapped.target, wrapped.args, { encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS, cwd: workspace });
    const reached = Object.fromEntries([...ran.stdout.matchAll(/^([a-z-]+): (.*)$/gm)].map((match) => [match[1], match[2]]));
    const closed = /^refused (EPERM|EACCES|ENOENT|EROFS|ECONNREFUSED)$/;
    // A second call of the same sandbox finds what the first wrote, and a sibling home it has no grant for stays closed.
    const again = sandbox.wrap(process.execPath, [
      '-e',
      "process.stdout.write(require('node:fs').readFileSync(process.argv[1] + '/x', 'utf8'))",
      made,
    ]);
    const second = spawnSync(again.target, again.args, { encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS, cwd: workspace });
    check(
      second.stdout === '1',
      `a second call of one sandbox read ${JSON.stringify(second.stdout)} from its home; expected what the first call wrote\n${second.stderr}`,
    );
    check(
      reached['own-write'] === 'allowed' && reached['own-read'] === 'allowed',
      `a confined target could not use its own home: ${ran.stdout}${ran.stderr}`,
    );
    check(
      ['module', 'realpath', 'mkdir-p', 'cd-pwd'].every((name) => reached[name] === 'allowed'),
      `a confined target could not resolve and use its home's path: ${JSON.stringify(['module', 'realpath', 'mkdir-p', 'cd-pwd'].map((name) => [name, reached[name]]))}`,
    );
    // The same use of the home is no isolation violation for the audit.
    const auditDirectory = fs.realpathSync(tempDir('home-reach-audit'));
    const audited = targetSandbox({ confinement, workspace, privateRoot: root, home: made, status, audit: { directory: auditDirectory } });
    await audited.start();
    try {
      const auditScript =
        "const fs = require('node:fs'); const home = process.argv[1]; require(home + '/m/index.js'); fs.realpathSync(home); fs.mkdirSync(home + '/.config/y', { recursive: true }); fs.writeFileSync(home + '/.config/y/z', '1');";
      const walked = audited.wrap(process.execPath, ['-e', auditScript, made]);
      const walk = spawnSync(walked.target, walked.args, { encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS, cwd: workspace });
      await audited.collect(walked, { started: true });
      const mounts = await audited.observedMounts();
      check(
        walk.status === 0 && mounts.length === 0,
        `a confined Node process that loaded a module from its home and wrote it exited ${walk.status} with observed mounts ${JSON.stringify(mounts)}\n${walk.stderr}`,
      );
    } finally {
      audited.release();
    }
    for (const name of ['sibling-read', 'sibling-write', 'peer-read', 'parent-write', 'socket']) {
      check(closed.test(reached[name] ?? ''), `a confined target with its own home reached ${name}: ${JSON.stringify(reached[name])}`);
    }
    // Bubblewrap's empty file system holds the mount point of the home, so a listing shows the path to it and nothing else.
    check(
      closed.test(reached['parent-list'] ?? '') || reached['parent-list'] === JSON.stringify([path.basename(made)]),
      `a confined target listed its home's parent as ${reached['parent-list']}`,
    );
    check(
      closed.test(reached['root-list'] ?? '') || reached['root-list'] === JSON.stringify([path.basename(parent)]),
      `a confined target listed the private root as ${reached['root-list']}`,
    );
    check(
      fs.readFileSync(path.join(sibling, 'secret.txt'), 'utf8') === 'a sibling home\n' && !fs.existsSync(path.join(sibling, 'y')),
      'a confined target changed a sibling home',
    );
  } finally {
    server.close();
    fs.rmSync(peer, { recursive: true, force: true });
  }
}

/**
 * `unlockDirectories` follows no link (Story 1.59): a process that swaps a directory of its home for a link to a directory
 * outside, while the runtime opens the home up to remove it, cannot have the outside directory's mode changed. A child
 * swaps the two names in a loop; the outside directory is mode 700, which following the link would raise to the link's 755.
 */
function checkNoFollowUnlock(parent, closedMode = null) {
  if (closedMode !== null) {
    // The route that opens a closed directory sets exactly 700 on a real directory and leaves what a link names alone.
    const closed = fs.mkdtempSync(path.join(parent, 'closed-'));
    const target = tempDir('closed-outside');
    fs.chmodSync(target, 0o755);
    const link = path.join(closed, 'lnk');
    fs.symlinkSync(target, link);
    const real = path.join(closed, 'dir');
    fs.mkdirSync(real);
    fs.chmodSync(real, closedMode);
    try {
      chmodDirectoryNoFollow(link, fs.lstatSync(link));
    } catch {
      // A link is refused outright where the system opens it with `O_NOFOLLOW`.
    }
    chmodDirectoryNoFollow(real, fs.lstatSync(real));
    check(
      (fs.statSync(target).mode & 0o777) === 0o755 && (fs.statSync(real).mode & 0o777) === 0o700,
      `the no-follow chmod left ${(fs.statSync(target).mode & 0o777).toString(8)} on what a link names (expected 755) and ${(fs.statSync(real).mode & 0o777).toString(8)} on a closed directory (expected 700)`,
    );
    fs.rmSync(closed, { recursive: true, force: true });
  }
  const base = fs.mkdtempSync(path.join(parent, 'flip-'));
  const outside = tempDir('flip-outside');
  fs.mkdirSync(path.join(outside, 'inner'));
  fs.writeFileSync(path.join(outside, 'inner', 'kept'), 'outside\n');
  fs.chmodSync(path.join(outside, 'inner'), 0o700);
  fs.chmodSync(outside, 0o700);
  fs.mkdirSync(path.join(base, 'dir', 'sub'), { recursive: true });
  fs.symlinkSync(outside, path.join(base, 'lnk'));
  const flipper = spawn(
    process.execPath,
    [
      '-e',
      `const fs = require('node:fs'); const [base] = process.argv.slice(1);
       const closed = process.argv[2] === '' ? null : Number(process.argv[2]);
       for (;;) { try { fs.renameSync(base + '/dir', base + '/hold'); if (closed !== null && fs.lstatSync(base + '/hold').isDirectory()) fs.chmodSync(base + '/hold', closed); fs.renameSync(base + '/lnk', base + '/dir'); fs.renameSync(base + '/hold', base + '/lnk'); } catch {} }`,
      base,
      closedMode === null ? '' : String(closedMode),
    ],
    { stdio: 'ignore' },
  );
  try {
    const started = Date.now();
    let rounds = 0;
    while (Date.now() - started < 1500) {
      unlockDirectories(base);
      rounds += 1;
    }
    const modes = [outside, path.join(outside, 'inner')].map((directory) => fs.statSync(directory).mode & 0o777);
    check(
      modes.every((mode) => mode === 0o700) && rounds > 20,
      `opening up a directory a process swapped for a link${closedMode === null ? '' : ` while keeping its own mode ${closedMode.toString(8)}`} changed the outside directories' modes to ${modes.map((mode) => mode.toString(8))} after ${rounds} rounds`,
    );
  } finally {
    flipper.kill('SIGKILL');
    unlockDirectories(base);
    fs.rmSync(base, { recursive: true, force: true });
  }
}

/**
 * The private home's parts on their own (Story 1.59): a sandbox refuses a home inside the evaluation folder or the
 * workspace, grants a home outside the private root as it grants the call's temp directory, and treats a home beneath the
 * root as the one exception to the root's withholding (profile, vector and audit); `makeTargetHome` makes it beneath the
 * run's private parent and lists it in `scratch`; the real mechanism lets a target use its own home and reach no sibling
 * home, other run's parent, listing of the root or socket under it; a reset or release removes a read-only directory;
 * both mechanisms hand a call `HOME` and the XDG variables over any host value, and none without a home.
 */
async function checkTargetHomeUnits() {
  const root = fs.realpathSync(tempDir('home-units'));
  const folder = path.join(root, 'evals', 'verdict');
  const workspace = path.join(root, 'workspace');
  const privateRoot = path.join(root, 'private');
  const home = path.join(root, 'home');
  const status = path.join(root, 'status');
  for (const directory of [folder, workspace, privateRoot, home, status]) fs.mkdirSync(directory, { recursive: true });
  const modes = {
    seatbelt: { mode: 'seatbelt', executable: '/usr/bin/sandbox-exec', evaluationFolder: folder },
    bubblewrap: { mode: 'bubblewrap', executable: '/usr/bin/bwrap', evaluationFolder: folder },
  };
  const build = (mode, extra) => targetSandbox({ confinement: modes[mode], workspace, status, ...extra });

  for (const [what, unsafe, named] of [
    ['the evaluation folder', path.join(folder, 'home'), 'the evaluation folder'],
    ['the workspace', path.join(workspace, 'home'), 'the workspace'],
  ]) {
    for (const mode of Object.keys(modes)) {
      let refused = null;
      try {
        build(mode, { privateRoot, home: unsafe });
      } catch (error) {
        refused = error;
      }
      check(
        refused?.name === 'ConfinementError' && refused.message.includes(`is inside ${named}`),
        `a ${mode} sandbox with a home inside ${what} was not refused: ${refused}`,
      );
    }
  }

  // A home outside the private root is granted as the call's temp directory is.
  const seatbelt = build('seatbelt', { privateRoot, home });
  const writeRules = (text) => text.slice(text.indexOf('(allow file-write*'), text.indexOf('(literal "/dev/null")'));
  const profile = seatbelt.wrap('/bin/true', []).args[1];
  check(writeRules(profile).includes(`(subpath "${home}")`), `the Seatbelt profile grants no write to the home:\n${profile}`);
  check(
    !writeRules(build('seatbelt', { privateRoot }).wrap('/bin/true', []).args[1]).includes(home),
    'a Seatbelt profile for a sandbox with no home grants it',
  );
  const bound = (wrapped) => wrapped.args.flatMap((argument, index) => (argument === '--bind' ? [wrapped.args[index + 1]] : []));
  check(bound(build('bubblewrap', { home }).wrap('/bin/true', [])).includes(home), 'the Bubblewrap vector binds no home');
  check(!bound(build('bubblewrap', {}).wrap('/bin/true', [])).includes(home), 'a Bubblewrap vector for a sandbox with no home binds it');
  // The audit's report rule exempts the home with the other read grants, and only when the sandbox has one (Story 1.60).
  const auditedProfile = (extra) =>
    targetSandbox({
      confinement: { ...modes.seatbelt, observer: { executable: '/usr/bin/log' } },
      workspace,
      audit: { directory: root },
      ...extra,
    }).wrap('/bin/true', []).args[1];
  const reportRule = (text) => text.slice(text.indexOf('(allow file-read-data'), text.indexOf('(with report)'));
  check(
    reportRule(auditedProfile({ home })).includes(`(require-not (subpath "${home}"))`),
    "the audit's report rule does not exempt the home",
  );
  check(!reportRule(auditedProfile({})).includes(home), "the audit's report rule exempts a home the sandbox has none of");

  // A home beneath the private root (the run's own parent holds it) is the one exception to the root's withholding: the
  // Seatbelt allowance comes after the root's denial, which the last matching rule overrides, and the Bubblewrap bind comes
  // between the empty file system over the root and its read-only remount, which touches that mount alone.
  const rootHome = path.join(privateRoot, 'run-1-abc', 'tea-evaluate-target-home-x');
  fs.mkdirSync(rootHome, { recursive: true });
  const inRoot = build('seatbelt', { privateRoot, home: rootHome }).wrap('/bin/true', []).args[1];
  const rootDeny = inRoot.indexOf(`(deny file-read* file-write*\n  (subpath "${privateRoot}")`);
  const rootAllow = inRoot.indexOf(`(allow file-read* file-write*\n  (subpath "${rootHome}")`);
  check(
    rootDeny !== -1 && rootAllow > rootDeny && !writeRules(inRoot).includes(rootHome),
    `the Seatbelt profile does not re-allow the home beneath the private root after the root's denial:\n${inRoot}`,
  );
  const rootArguments = build('bubblewrap', { privateRoot, home: rootHome }).wrap('/bin/true', []).args;
  const at = (...words) =>
    rootArguments.findIndex((argument, index) => words.every((word, offset) => rootArguments[index + offset] === word));
  // The trace's grants name the home beneath the root too, where the vector binds it on its own: a write inside the home that the
  // file system refuses (a read-only directory a tool left) is no isolation violation.
  const tracedHome = targetSandbox({
    confinement: { ...modes.bubblewrap, observer: { executable: '/usr/bin/strace' } },
    workspace,
    status,
    privateRoot,
    home: rootHome,
    audit: { directory: root },
  }).wrap('/bin/true', []);
  check(
    tracedHome.trace.grants.write.includes(rootHome) && tracedHome.trace.grants.read.includes(rootHome),
    `the trace's grants for a home beneath the private root are ${JSON.stringify(tracedHome.trace.grants)}`,
  );
  check(
    at('--tmpfs', privateRoot) !== -1 &&
      at('--bind', rootHome, rootHome) > at('--tmpfs', privateRoot) &&
      at('--remount-ro', privateRoot) > at('--bind', rootHome, rootHome),
    `the Bubblewrap vector does not bind the home beneath the private root between the root's empty file system and its remount: ${rootArguments.join(' ')}`,
  );
  const rootStatus = path.join(privateRoot, 'run-1-abc', 'tea-evaluate-status-x');
  fs.mkdirSync(rootStatus);
  const statusWrapped = build('bubblewrap', { privateRoot, home: rootHome, status: rootStatus }).wrap('/bin/true', []);
  const statusMount = path.join('/dev', path.basename(statusWrapped.statusFile));
  const statusAt = (...words) =>
    statusWrapped.args.findIndex((argument, index) => words.every((word, offset) => statusWrapped.args[index + offset] === word));
  check(
    statusAt('--bind', statusWrapped.statusFile, statusMount) > statusAt('--dev', '/dev') &&
      statusAt('--bind', statusWrapped.statusFile, statusWrapped.statusFile) === -1 &&
      statusAt('--bind', rootStatus, rootStatus) === -1,
    `the Bubblewrap vector exposed the status directory beneath the private root: ${statusWrapped.args.join(' ')}`,
  );
  const auditedStatus = targetSandbox({
    confinement: { ...modes.bubblewrap, observer: { executable: '/usr/bin/strace' } },
    workspace,
    privateRoot,
    home: rootHome,
    status: rootStatus,
    audit: { directory: root },
  }).wrap('/bin/true', []);
  const statusAccess = {
    kind: 'write',
    path: path.join('/dev', path.basename(auditedStatus.statusFile)),
    real: path.join('/dev', path.basename(auditedStatus.statusFile)),
    ok: true,
    errno: null,
  };
  check(
    !auditedStatus.trace.grants.withheldExcept.includes(auditedStatus.statusFile) &&
      !auditedStatus.trace.grants.withheldExcept.includes(rootStatus) &&
      traceDecision(statusAccess, auditedStatus.trace.grants) === null,
    'the audited Bubblewrap status-file mount was not granted outside the withheld private root',
  );
  // The report rule comes before the home's re-grant, which overrides it, so the home is no violation, and the root's
  // denial after it carries the token, so a refused read of the root is reported.
  const auditedRoot = auditedProfile({ privateRoot, home: rootHome });
  const token = /\(with message "(tea-evaluate-audit-[0-9a-f]{16})"\)/.exec(auditedRoot)?.[1];
  check(
    token !== undefined &&
      auditedRoot.indexOf('(with report)') <
        auditedRoot.indexOf(`(allow file-read-data file-read* file-write*\n  (subpath "${rootHome}")`) &&
      auditedRoot.includes(`(deny file-read-data file-read* file-write*\n  (subpath "${privateRoot}")`) &&
      auditedRoot.includes(`(subpath "${privateRoot}") (with message "${token}"))`) &&
      !auditedProfile({ privateRoot }).includes(`(with message "${token}")`),
    `the audited profile does not report before the home's re-grant and tag the root's denial with the sandbox's own token:\n${auditedRoot}`,
  );

  // The home is made beneath the run's private parent, where the sandbox withholds every other home.
  const scratch = [];
  const parent = makePrivateParent(scratch);
  const made = makeTargetHome(scratch);
  const sibling = makeTargetHome(scratch);
  const loose = [];
  const fallback = makeTargetHome(loose);
  try {
    check(
      path.dirname(made) === fs.realpathSync(parent) &&
        path.basename(made).startsWith('tea-evaluate-target-home-') &&
        scratch.includes(made),
      `the private home ${made} is not a directory of the run's private parent listed in scratch`,
    );
    check(
      path.dirname(fallback) === fs.realpathSync(os.tmpdir()) && loose.includes(fallback),
      `a scratch list with no private parent put the home at ${fallback}; expected the system temp directory`,
    );
    check(
      ['.config', '.cache', path.join('.local', 'share')].every((name) => fs.statSync(path.join(made, name)).isDirectory()),
      'the private home holds no XDG base directories',
    );
    // The audit's directory is made beside the home beneath the run's private parent, which every target withholds, so no target can
    // read, write or replace what the runtime reads of the audit (Story 1.60).
    const auditDirectory = makeAuditDirectory(scratch);
    check(
      path.dirname(auditDirectory) === fs.realpathSync(parent) &&
        path.basename(auditDirectory).startsWith('tea-evaluate-audit-') &&
        scratch.includes(auditDirectory),
      `the audit's directory ${auditDirectory} is not a directory of the run's private parent listed in scratch`,
    );
    await checkHomeReach({ made, sibling, parent, root: scratch.privateRoot, folder, workspace });

    // A directory a process left read-only inside the home does not keep it: a release removes the home, and the retired
    // name it was moved to for the removal is gone too.
    fs.mkdirSync(path.join(made, 'cache', 'locked'), { recursive: true });
    fs.writeFileSync(path.join(made, 'cache', 'locked', 'entry'), 'x\n');
    fs.chmodSync(path.join(made, 'cache', 'locked'), 0o555);
    releaseTargetHome(scratch, made);
    check(
      !fs.existsSync(made) &&
        !scratch.includes(made) &&
        !scratch.some((directory) => directory.includes('retired')) &&
        !fs.readdirSync(parent).some((name) => name.includes('retired')),
      `a release of a home holding a read-only directory left ${JSON.stringify(fs.readdirSync(parent))} beneath the parent and ${JSON.stringify(scratch)} in scratch`,
    );
    checkNoFollowUnlock(parent);
    // A directory the agent keeps closed (no owner bits) cannot be opened, so the mode is set by another route that follows no link.
    checkNoFollowUnlock(parent, 0o077);

    // A sandbox pointed at another home grants that one and sets its variables from then on, and no longer names the old one.
    const [first, second] = [path.join(parent, 'switch-a'), path.join(parent, 'switch-b')];
    fs.mkdirSync(first);
    fs.mkdirSync(second);
    const switching = targetSandbox({
      confinement: { mode: 'seatbelt', executable: '/usr/bin/sandbox-exec', evaluationFolder: folder },
      workspace,
      privateRoot: scratch.privateRoot,
      home: first,
    });
    const named = () => switching.wrap('/bin/true', []).args[1];
    const seenBefore = (
      await confinedCommandMechanism({ run: async (request) => ({ seen: request.env }) }, switching).run(
        { target: '/bin/true', subcommandPath: [], argv: [], env: {} },
        new AbortController().signal,
      )
    ).seen;
    switching.setHome(second);
    const seenAfter = (
      await confinedCommandMechanism({ run: async (request) => ({ seen: request.env }) }, switching).run(
        { target: '/bin/true', subcommandPath: [], argv: [], env: {} },
        new AbortController().signal,
      )
    ).seen;
    check(
      seenBefore.HOME === first &&
        seenAfter.HOME === second &&
        named().includes(`(subpath "${second}")`) &&
        !named().includes(`(subpath "${first}")`),
      `a sandbox pointed at another home still names the old one: ${JSON.stringify({ before: seenBefore.HOME, after: seenAfter.HOME })}`,
    );
  } finally {
    for (const directory of [made, sibling, fallback]) {
      unlockDirectories(directory);
      fs.rmSync(directory, { recursive: true, force: true });
    }
    for (const directory of scratch) fs.rmSync(directory, { recursive: true, force: true });
  }

  const hostEnv = {
    HOME: '/host/home',
    XDG_CONFIG_HOME: '/host/config',
    XDG_CACHE_HOME: '/host/cache',
    XDG_DATA_HOME: '/host/data',
    KEPT: 'yes',
  };
  const environments = {};
  const fake = (extra) => ({
    wrap: (target, args) => ({ target, args, statusFile: null }),
    ...extra,
  });
  for (const [what, sandboxHome] of [
    ['with a home', home],
    ['without one', null],
  ]) {
    const command = confinedCommandMechanism({ run: async (request) => ({ exitCode: 0, seen: request.env }) }, fake({ home: sandboxHome }));
    const tool = confinedMcpMechanism(
      { callTool: async (request) => ({ isError: false, seen: request.env }) },
      fake({ home: sandboxHome }),
    );
    environments[`command ${what}`] = (
      await command.run({ target: '/bin/true', subcommandPath: [], argv: [], env: hostEnv }, new AbortController().signal)
    ).seen;
    environments[`tool ${what}`] = (
      await tool.callTool({ target: '/bin/true', targetArgs: [], env: hostEnv }, new AbortController().signal)
    ).seen;
  }
  for (const [what, sandboxHome, env] of [
    ['command', home, {}],
    ['tool', home, {}],
  ]) {
    // An entry that passes no HOME or XDG variable still gets all four (the starter entry's `environmentKeys` is empty).
    const bare =
      what === 'command'
        ? await confinedCommandMechanism({ run: async (request) => ({ seen: request.env }) }, fake({ home: sandboxHome })).run(
            { target: '/bin/true', subcommandPath: [], argv: [], env },
            new AbortController().signal,
          )
        : await confinedMcpMechanism({ callTool: async (request) => ({ seen: request.env }) }, fake({ home: sandboxHome })).callTool(
            { target: '/bin/true', targetArgs: [], env },
            new AbortController().signal,
          );
    check(
      bare.seen.HOME === home && ['XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME'].every((name) => bare.seen[name]?.startsWith(home)),
      `a confined ${what} call over an environment holding no HOME or XDG variable got ${JSON.stringify(bare.seen)}; expected all four set inside the home`,
    );
  }
  for (const kind of ['command', 'tool']) {
    const withHome = environments[`${kind} with a home`];
    // No preload is loaded into a target's processes any more (Story 1.60).
    check(withHome.NODE_OPTIONS === undefined, `a confined ${kind} call's environment carries NODE_OPTIONS ${withHome.NODE_OPTIONS}`);
    check(
      withHome.HOME === home &&
        withHome.XDG_CONFIG_HOME === path.join(home, '.config') &&
        withHome.XDG_CACHE_HOME === path.join(home, '.cache') &&
        withHome.XDG_DATA_HOME === path.join(home, '.local', 'share') &&
        withHome.KEPT === 'yes',
      `a confined ${kind} call with a home got ${JSON.stringify(withHome)}; expected HOME and the XDG directories inside the home over the host's values`,
    );
    const without = environments[`${kind} without one`];
    check(
      without.HOME === '/host/home' && without.XDG_DATA_HOME === '/host/data',
      `a confined ${kind} call with no home got ${JSON.stringify(without)}; expected the host's values`,
    );
  }
}

/**
 * The confinement's parts on their own (Story 1.31): a workspace inside the
 * evaluation folder is refused, the status shim records the signal that ended
 * its target and ends as a signalled child even for a signal Node ignores, the
 * audit judges a path by its real path and reports anything under the
 * evaluation folder whatever grant covers it, and the Node installation it
 * grants is never the file system's root; a confined tool-server call gets a
 * private temp directory, removed with the status a signal left once it ends.
 */
async function checkConfinementUnits() {
  const folder = path.join(tempDir('confinement-units'), 'evals', 'verdict');
  fs.mkdirSync(folder, { recursive: true });
  let refused = null;
  try {
    targetSandbox({
      confinement: { mode: CONFINEMENT, executable: '/bin/true', evaluationFolder: folder },
      workspace: path.join(folder, 'ws'),
      status: folder,
    });
  } catch (error) {
    refused = error;
  }
  check(
    refused?.name === 'ConfinementError' && refused.message.includes('is inside the evaluation folder'),
    `a workspace inside the evaluation folder was not refused: ${refused}`,
  );

  const statusDirectory = tempDir('confinement-units-status');
  for (const [signal, number] of [
    ['SIGTERM', 15],
    ['SIGPIPE', 13],
  ]) {
    const statusFile = path.join(statusDirectory, `${signal}.json`);
    const ended = spawnSync(process.execPath, [CONFINEMENT_STATUS, statusFile, '/bin/sh', '-c', `kill -${signal.slice(3)} $$`], {
      encoding: 'utf8',
      timeout: SPAWN_TIMEOUT_MS,
    });
    const recorded = fs.existsSync(statusFile) ? readJson(statusFile).signal : null;
    // Node dies of SIGTERM; it ignores SIGPIPE, so the shim then exits 128 + 13 as a shell reports the child.
    const endedAs = signal === 'SIGPIPE' ? ended.status === 128 + number : ended.signal === signal;
    check(
      recorded === signal && endedAs && readJson(statusFile).started === true,
      `the status shim over a target ${signal} ended recorded ${JSON.stringify(recorded)} and ended ${JSON.stringify({ status: ended.status, signal: ended.signal })}`,
    );
  }

  // The Bubblewrap vector: a process-id namespace of its own with its own procfs (no `/proc/<pid>/root` into the runtime's
  // mounts), ending with its parent, and no user service manager; only this call's own status file is writable, not the
  // directory it sits in, and the target's status file name cannot be guessed. An audited sandbox runs the same vector under
  // `strace` outside the namespace, writing a trace file the vector never binds (Story 1.60).
  const unitRoot = fs.realpathSync(tempDir('confinement-units-bwrap'));
  const unitWorkspace = path.join(unitRoot, 'workspace');
  const unitAudit = path.join(unitRoot, 'audit');
  const unitStatus = path.join(unitRoot, 'status');
  fs.mkdirSync(unitWorkspace);
  fs.mkdirSync(unitAudit);
  fs.mkdirSync(unitStatus);
  const bubblewrap = { mode: 'bubblewrap', executable: '/usr/bin/bwrap', evaluationFolder: folder };
  // The host's own sockets change the command's shape (a call that hides some goes through the launcher), so the units name none.
  const unitSandbox = targetSandbox({ confinement: bubblewrap, workspace: unitWorkspace, status: unitStatus, hostSockets: () => [] });
  const wrapped = unitSandbox.wrap('/bin/true', []);
  check(
    /^[0-9a-f]{64}$/.test(wrapped.statusKey) &&
      JSON.stringify(readJson(wrapped.statusFile)) === JSON.stringify({ secret: wrapped.statusKey }),
    'the host did not seed a private 256-bit status key before Bubblewrap',
  );
  const bound = (call) => call.args.flatMap((argument, index) => (argument === '--bind' ? [call.args[index + 1]] : []));
  check(
    ['--unshare-pid', '--proc', '--die-with-parent', '--new-session'].every((flag) => wrapped.args.includes(flag)),
    `the Bubblewrap vector lacks its process namespace, procfs, die-with-parent or session: ${wrapped.args.join(' ')}`,
  );
  check(
    bound(wrapped).includes(wrapped.statusFile) &&
      !bound(wrapped).includes(unitStatus) &&
      /^status-1-[0-9a-f]{16}\.json$/.test(path.basename(wrapped.statusFile)) &&
      wrapped.target === '/usr/bin/bwrap' &&
      wrapped.trace === undefined,
    `the Bubblewrap vector binds ${JSON.stringify(bound(wrapped))}; expected the workspace and the status file of the call, no directory of it, and no tracer for a sandbox that does not audit`,
  );
  const traced = targetSandbox({
    confinement: { ...bubblewrap, observer: { executable: '/usr/bin/strace' } },
    workspace: unitWorkspace,
    status: unitStatus,
    audit: { directory: unitAudit },
    hostSockets: () => [],
  }).wrap('/bin/true', []);
  const bwrapAt = traced.args.indexOf('/usr/bin/bwrap');
  check(
    traced.target === '/usr/bin/strace' &&
      traced.args[0] === '-f' &&
      traced.args.includes('--seccomp-bpf') &&
      traced.args.includes('--decode-pids=pidns') &&
      traced.args[traced.args.indexOf('-o') + 1] === traced.trace.file &&
      path.dirname(traced.trace.file) === unitAudit &&
      traced.args[bwrapAt - 1] === '--' &&
      bwrapAt > 0 &&
      !traced.args.slice(bwrapAt).includes(traced.trace.file) &&
      !traced.args.slice(bwrapAt).includes(unitAudit),
    `an audited Bubblewrap call is ${JSON.stringify([traced.target, ...traced.args])}; expected strace -f --seccomp-bpf outside the namespace, its trace in the audit directory and neither bound into the namespace`,
  );
  let unobserved = null;
  try {
    targetSandbox({ confinement: bubblewrap, workspace: unitWorkspace, status: unitStatus, audit: { directory: unitAudit } });
  } catch (error) {
    unobserved = error;
  }
  check(
    unobserved?.name === 'ConfinementError' && unobserved.message.includes('observer'),
    `an audited sandbox over a confinement that carries no observer was not refused: ${unobserved}`,
  );

  // A Bubblewrap that fails before its shim runs is not a target that exited with Bubblewrap's code; one whose shim ran is.
  for (const started of [false, true]) {
    const statusOfCall = path.join(unitStatus, `started-${started}.json`);
    fs.writeFileSync(statusOfCall, started ? '{"started":true}\n' : '');
    let outcome;
    try {
      outcome = await confinedCommandMechanism(
        { run: async () => ({ exitCode: 1, stderr: { kind: 'text', value: 'bwrap: cannot bind\n' } }) },
        { wrap: (target, args) => ({ target, args, statusFile: statusOfCall }) },
      ).run({ target: '/bin/true', subcommandPath: [], argv: [], env: {} }, new AbortController().signal);
    } catch (error) {
      outcome = error;
    }
    check(
      started ? outcome?.exitCode === 1 : outcome?.name === 'ConfinementError' && outcome.message.includes('bwrap: cannot bind'),
      `a Bubblewrap call whose shim ${started ? 'ran' : 'never ran'} reads ${JSON.stringify(outcome?.message ?? outcome)}`,
    );
  }

  // The target can write its bound status file, so unsigned outcomes and a replayed signed start cannot supply an exit.
  for (const [name, write] of [
    ['forged signal', (call) => fs.writeFileSync(call.statusFile, '{"started":true,"complete":true,"signal":"SIGKILL"}\n')],
    [
      'replayed start',
      (call) => {
        const { signedStatus } = require('../cli/lib/evaluate/confinement-status.cjs');
        fs.writeFileSync(call.statusFile, `${JSON.stringify(signedStatus(call.statusKey, { started: true }))}\n`);
      },
    ],
  ]) {
    const call = unitSandbox.wrap('/bin/true', []);
    write(call);
    let outcome;
    try {
      outcome = await confinedCommandMechanism({ run: async () => ({ exitCode: 137 }) }, { wrap: () => call }).run(
        { target: '/bin/true', subcommandPath: [], argv: [], env: {} },
        new AbortController().signal,
      );
    } catch (error) {
      outcome = error;
    }
    check(outcome?.name === 'ConfinementError' && outcome.message.includes('integrity'), `${name} was accepted as a target exit`);
  }
  for (const [name, shimArgs, engineExit, expectedExit] of [
    ['normal', [process.execPath, '-e', 'process.exit(7)'], 7, 7],
    ['signal', ['/bin/sh', '-c', 'kill -TERM $$'], 143, -15],
    ['bridge error', ['--bridge', path.join(unitRoot, 'absent', 'bridge.sock'), '/bin/true'], 126, 126],
  ]) {
    const call = unitSandbox.wrap('/bin/true', []);
    const args =
      shimArgs[0] === '--bridge' ? [...shimArgs.slice(0, 2), call.statusFile, ...shimArgs.slice(2)] : [call.statusFile, ...shimArgs];
    const shim = spawnSync(process.execPath, [CONFINEMENT_STATUS, ...args], { encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS });
    check(
      shim.status === engineExit || (name === 'signal' && shim.signal === 'SIGTERM'),
      `${name} shim exited ${shim.status}/${shim.signal}`,
    );
    let outcome;
    try {
      outcome = await confinedCommandMechanism({ run: async () => ({ exitCode: engineExit }) }, { wrap: () => call }).run(
        { target: '/bin/true', subcommandPath: [], argv: [], env: {} },
        new AbortController().signal,
      );
    } catch (error) {
      outcome = error;
    }
    check(outcome?.exitCode === expectedExit, `${name} signed status produced ${JSON.stringify(outcome?.message ?? outcome)}`);
  }
  const neverStarted = unitSandbox.wrap('/bin/true', []);
  let neverStartedOutcome;
  try {
    neverStartedOutcome = await confinedCommandMechanism({ run: async () => ({ exitCode: 1 }) }, { wrap: () => neverStarted }).run(
      { target: '/bin/true', subcommandPath: [], argv: [], env: {} },
      new AbortController().signal,
    );
  } catch (error) {
    neverStartedOutcome = error;
  }
  check(
    neverStartedOutcome?.name === 'ConfinementError' && !fs.existsSync(neverStarted.statusFile),
    'a seeded call with no shim start was accepted',
  );
  const forgedTool = unitSandbox.wrap('/bin/true', []);
  fs.writeFileSync(forgedTool.statusFile, '{"started":true,"complete":true,"signal":"SIGTERM"}\n');
  let forgedToolOutcome;
  try {
    forgedToolOutcome = await confinedMcpMechanism(
      { callTool: async () => ({ isError: true, exitCode: 143 }) },
      { wrap: () => forgedTool },
    ).callTool({ target: '/bin/true', targetArgs: [], env: {} }, new AbortController().signal);
  } catch (error) {
    forgedToolOutcome = error;
  }
  check(forgedToolOutcome?.name === 'ConfinementError' && forgedToolOutcome.message.includes('integrity'), 'MCP accepted a forged signal');

  // A tool-server call answered: it has no exit, so the runtime only removes the status a signal left.
  const statusFile = path.join(tempDir('confinement-units-mcp'), 'status-1.json');
  fs.writeFileSync(statusFile, '{"signal":"SIGTERM"}\n');
  let seen = null;
  const mechanism = confinedMcpMechanism(
    {
      callTool: async (request) => {
        seen = { env: request.env, existed: fs.existsSync(request.env.TMPDIR) };
        return { isError: false, structuredResult: {} };
      },
    },
    {
      wrap: (target, args, writable) => ({ target, args: [...args, ...writable], statusFile }),
    },
  );
  await mechanism.callTool({ target: '/bin/true', targetArgs: [], env: {} }, new AbortController().signal);
  check(
    seen !== null &&
      seen.existed &&
      seen.env.TMP === seen.env.TMPDIR &&
      seen.env.TEMP === seen.env.TMPDIR &&
      !fs.existsSync(seen.env.TMPDIR) &&
      !fs.existsSync(statusFile),
    `a confined tool-server call's temp directory and status: ${JSON.stringify({ seen, statusLeft: fs.existsSync(statusFile) })}`,
  );

  // A session the tool server's process ended before it answered reports the exit of the process Bubblewrap ran: a
  // signal the shim recorded is the signal's number negated, as a command's is; a plain exit keeps its code; a status
  // without a start mark leaves the exit code unattributable, so it is a confinement error.
  for (const [what, status, engineExit, expected] of [
    ['a signal of its own (SIGABRT)', '{"started":true,"signal":"SIGABRT"}\n', 134, -6],
    ['a signal from outside (SIGKILL)', '{"started":true,"signal":"SIGKILL"}\n', 137, -9],
    ['a plain exit', '{"started":true}\n', 3, 3],
    ['a status file with no start mark', '', 1, 'ConfinementError'],
  ]) {
    const endedStatus = path.join(tempDir('confinement-units-mcp-ended'), 'status-1.json');
    fs.writeFileSync(endedStatus, status);
    let outcome;
    try {
      outcome = await confinedMcpMechanism(
        { callTool: async () => ({ isError: true, exitCode: engineExit }) },
        { wrap: (target, args) => ({ target, args, statusFile: endedStatus }) },
      ).callTool({ target: '/bin/true', targetArgs: [], env: {} }, new AbortController().signal);
    } catch (error) {
      outcome = error;
    }
    check(
      (expected === 'ConfinementError'
        ? outcome?.name === expected &&
          outcome.message.includes('holds no start mark') &&
          outcome.message.includes('exit code 1 cannot be told from')
        : outcome?.exitCode === expected && outcome.isError === true) && !fs.existsSync(endedStatus),
      `a confined tool server ended by ${what} reads ${JSON.stringify(outcome?.message ?? outcome)}; expected ${expected}`,
    );
  }
}

/**
 * The committed evaluation folder is withheld from a confined target's git (Story 1.57), in two parts:
 *
 * - `checkWithheldHistoryRun` runs the real CLI over a project that commits its evaluation folder in three commits and
 *   lets a stub target ask its worktree's git for the contract at the evaluated commit and at an older one, for a folder
 *   blob id read from `git log --raw`, with replace refs disabled, and for the project's git directory by path; it also
 *   runs the worktree's own git operations. The same stub in a run that opted out is the control that the asks work
 *   when nothing withholds, and the probe digests and the commit the target sees are the adopter's.
 * - `checkWithheldHistoryUnits` builds workspaces directly, to hold the builder's edges (content the folder shares with
 *   the rest of the tree, a folder that changed across commits, a shallow repository, a failing `git pack-objects`, an
 *   opt-out run) and each part's revert check: the builder skipped, the `commondir` left on the adopter's repository and
 *   the git directory's deny removed each let the stub read what the change withholds.
 */
function withheldHistoryProject(label, { unconfined = false } = {}) {
  return makeProject(label, {
    unconfined,
    toolchain: true,
    // A file outside the folder holding the contract's bytes: content the folder shares with the rest of the tree.
    edit: ({ project, folder }) => {
      fs.mkdirSync(path.join(project, 'docs'), { recursive: true });
      fs.copyFileSync(path.join(folder, 'contract.json'), path.join(project, 'docs', 'contract-copy.json'));
    },
    // The folder holds three different trees across the history: the fixture's, then two versions of a note beside it.
    history: ({ repository, folder }) => {
      for (const version of ['one', 'two']) {
        fs.writeFileSync(path.join(folder, 'notes.md'), `note ${version}\n`);
        git(repository, ['add', '--all']);
        git(repository, ['commit', '--quiet', '--message', `note ${version}`]);
      }
    },
  });
}

/** The `<name>: <how>` lines the `probe-git` stub printed, by name. */
function probeGitLines(stdout) {
  return Object.fromEntries(
    stdout
      .split('\n')
      .map((line) => /^([a-z-]+): (.*)$/.exec(line))
      .filter((match) => match !== null)
      .map(([, name, how]) => [name, how]),
  );
}

async function checkWithheldHistoryRun() {
  const project = withheldHistoryProject('withheld-history');
  const head = git(project.repository, ['rev-parse', 'HEAD']).toString('utf8').trim();
  const branches = git(project.repository, ['for-each-ref', '--format=%(refname) %(objectname)']).toString('utf8');
  const objects = () => git(project.repository, ['cat-file', '--batch-all-objects', '--batch-check']).toString('utf8');
  const objectsBefore = objects();
  const ran = evaluate(['run', '--evaluation', project.folder], { ...project.env, VERDICT_WHEN: 'trial-clean-1', VERDICT_DO: 'probe-git' });
  check(
    ran.status === 0,
    `a confined run whose target asked its git for the committed evaluation folder exited ${ran.status}; expected 0\n${ran.output}`,
  );
  const runDirectory = runDirectoryOf(project.folder);
  const out = trialStdout(runDirectory, 'clean', 1);
  const seen = probeGitLines(out);
  for (const name of ['head-contract-show', 'head-contract-cat', 'older-contract-show', 'folder-tree-cat', 'folder-tree-without-replace']) {
    check(
      /^none \d+$/.test(seen[name] ?? ''),
      `a confined target's ${name} ended ${JSON.stringify(seen[name])}; expected no object\n${out}`,
    );
  }
  check(
    seen['folder-in-tree'] === '0',
    `a confined target's git lists ${seen['folder-in-tree']} path(s) under the evaluation folder\n${out}`,
  );
  check(
    seen['history-folder-blobs'] === '0',
    `a confined target's git log --raw names ${seen['history-folder-blobs']} folder blob(s)\n${out}`,
  );
  check(seen['history-blob-read'] === 'none', `a confined target read a folder blob named by the history\n${out}`);
  check(seen['refs-beyond-replace'] === '0', `a confined target's git names ${seen['refs-beyond-replace']} ref(s) of the project\n${out}`);
  check(
    seen['shared-content-show'] === 'printed',
    `a file outside the folder with the folder's bytes was not readable: ${seen['shared-content-show']}\n${out}`,
  );
  check(seen['tracked-show'] === 'printed', `a tracked file outside the folder was not readable: ${seen['tracked-show']}\n${out}`);
  check(
    /^exit 0$/.test(seen.status ?? ''),
    `a confined target's git status over the evaluated tree ended ${JSON.stringify(seen.status)}; expected exit 0 and no change\n${out}`,
  );
  check(
    /^exit 0 \(3 line\(s\)\)$/.test(seen.log ?? ''),
    `a confined target's git log ended ${JSON.stringify(seen.log)}; expected exit 0 with the three commits\n${out}`,
  );
  check(
    seen.diff === 'exit 0',
    `a confined target's git diff HEAD ended ${JSON.stringify(seen.diff)}; expected exit 0 and no change\n${out}`,
  );
  check(
    (seen['log-patch'] ?? '').startsWith('exit 0 '),
    `a confined target's git log -p ended ${JSON.stringify(seen['log-patch'])}; expected exit 0\n${out}`,
  );
  for (const name of ['project-git-head', 'project-git-objects', 'project-git-config']) {
    check(
      /^refused (EPERM|EACCES|ENOENT)$/.test(seen[name] ?? ''),
      `a confined target's ${name} ended ${JSON.stringify(seen[name])}; expected a refusal\n${out}`,
    );
  }
  check(
    seen['own-git-head'] === 'allowed',
    `a confined target could not read its own worktree's metadata: ${seen['own-git-head']}\n${out}`,
  );

  check(
    /\/git-view$/.test(seen['commondir-file'] ?? '') && seen['git-view'] === 'present',
    `a confined worktree's commondir ${JSON.stringify(seen['commondir-file'])} does not name the withheld repository beside its checkout\n${out}`,
  );

  // The audit side: the target's attempts on the project's git directory are reported, and its own worktree's entry is not.
  const projectGit = fs.realpathSync(path.join(project.repository, '.git'));
  const observed = observedMountsOf(runDirectory, 'P-001') ?? [];
  checkReport(
    ['HEAD', 'config', 'objects'].every((name) => observed.includes(path.join(projectGit, name))),
    `the audit did not report the target's attempts on the project's git directory: ${JSON.stringify(observed)}`,
  );
  check(
    !observed.some((entry) => entry.startsWith(`${path.join(projectGit, 'worktrees')}${path.sep}`)),
    `the audit reported the target's read of its own worktree's metadata: ${JSON.stringify(observed)}`,
  );
  const audited = evaluate(['score', '--evaluation', project.folder], project.env);
  checkReport(
    audited.status === 3 && audited.output.includes(`mount outside allowlist: ${path.join(projectGit, 'HEAD')}`),
    `score over a target that reached for the project's git directory exited ${audited.status}; expected 3 with the isolation violation\n${audited.output}`,
  );
  check(
    !audited.output.includes(`mount outside allowlist: ${path.join(projectGit, 'worktrees')}`),
    `score named the worktree's own metadata as an isolation violation\n${audited.output}`,
  );

  // The probe digests AD-7 names read the adopter's repository, so the worktree's private one leaves them as they were.
  const probe = written(path.join(runDirectory, 'probes', 'P-002.probe.json'), 'the qualified probe (withheld history)');
  check(
    probe?.commitDigest === sha256(Buffer.from(head, 'utf8')),
    `the qualified probe's commitDigest ${probe?.commitDigest} is not the evaluated commit's ${sha256(Buffer.from(head, 'utf8'))}`,
  );
  const listing = git(project.repository, ['ls-tree', '-r', '-z', 'HEAD^{tree}'])
    .toString('utf8')
    .split('\u0000')
    .filter((entry) => entry.length > 0 && !entry.slice(entry.indexOf('\t') + 1).startsWith('evals/verdict/'));
  const implementationDigest = sha256(Buffer.from(listing.map((entry) => `${entry}\u0000`).join(''), 'utf8'));
  check(
    probe?.implementationDigest === implementationDigest,
    `the qualified probe's implementationDigest ${probe?.implementationDigest} is not the tracked tree's ${implementationDigest}`,
  );
  check(objects() === objectsBefore, 'a confined run changed the objects of the adopter repository');
  check(
    git(project.repository, ['for-each-ref', '--format=%(refname) %(objectname)']).toString('utf8') === branches,
    'a confined run changed the refs of the adopter repository',
  );
  check(
    !fs.existsSync(path.join(project.repository, '.git', 'refs', 'replace')),
    'a confined run wrote refs/replace into the adopter repository',
  );

  // The control: the same stub in a run that opted out reads the committed contract, so the asks above can find it.
  const open = withheldHistoryProject('withheld-history-open', { unconfined: true });
  const openRan = evaluate(['run', '--evaluation', open.folder], { ...open.env, VERDICT_WHEN: 'trial-clean-1', VERDICT_DO: 'probe-git' });
  check(openRan.status === 0, `the unconfined control run exited ${openRan.status}\n${openRan.output}`);
  const openOut = trialStdout(runDirectoryOf(open.folder), 'clean', 1);
  const control = probeGitLines(openOut);
  for (const name of ['head-contract-show', 'head-contract-cat', 'older-contract-show', 'folder-tree-cat', 'history-blob-read']) {
    check(
      control[name] === 'printed',
      `the unconfined control's ${name} ended ${JSON.stringify(control[name])}; expected the committed folder\n${openOut}`,
    );
  }
  check(
    ['project-git-head', 'project-git-objects', 'project-git-config'].every((name) => control[name] === 'allowed'),
    `the unconfined control could not read the project's git directory\n${openOut}`,
  );
  check(
    control['commondir-file'] === '../..' && control['git-view'] === 'absent',
    `an opt-out run's worktree names the common directory ${JSON.stringify(control['commondir-file'])} with git-view ${control['git-view']}; expected ../.. and none\n${openOut}`,
  );
  check(!fs.existsSync(path.join(open.repository, '.git', 'refs', 'replace')), 'the unconfined control changed the adopter repository');

  // The same stub in the workspaces a leg, a mutation and a qualification run in: the project's git directory is refused in
  // each when the run confines, and each worktree of an opt-out run still names the adopter's common directory.
  for (const context of ['pristine', 'mutated-M-001', 'qualify-clean', 'qualify-P-002', 'trial-mutated-M-001-1']) {
    const confined = makeProject(`withheld-context-${context}`, { toolchain: true });
    const contextRan = evaluate(['run', '--evaluation', confined.folder], {
      ...confined.env,
      VERDICT_WHEN: context,
      VERDICT_DO: 'probe-git',
    });
    check(
      contextRan.status === 0,
      `a confined run whose ${context} workspace probed git exited ${contextRan.status}\n${contextRan.output}`,
    );
    const reports = probeGitReports(runDirectoryOf(confined.folder));
    check(reports.length > 0, `the stub's probe in the ${context} workspace left no report`);
    for (const report of reports) {
      check(
        ['project-git-head', 'project-git-objects', 'project-git-config'].every((name) =>
          /^refused (EPERM|EACCES|ENOENT)$/.test(report[name] ?? ''),
        ),
        `the ${context} workspace's target read the project's git directory: ${JSON.stringify(report)}`,
      );
      check(
        report['own-git-head'] === 'allowed' && /\/git-view$/.test(report['commondir-file'] ?? '') && report['git-view'] === 'present',
        `the ${context} workspace's worktree does not read a withheld repository: ${JSON.stringify(report)}`,
      );
    }
  }
  for (const context of ['pristine', 'mutated-M-001']) {
    const optOut = makeProject(`withheld-context-open-${context}`, { unconfined: true });
    const optOutRan = evaluate(['run', '--evaluation', optOut.folder], { ...optOut.env, VERDICT_WHEN: context, VERDICT_DO: 'probe-git' });
    check(optOutRan.status === 0, `an opt-out run whose ${context} workspace probed git exited ${optOutRan.status}\n${optOutRan.output}`);
    const reports = probeGitReports(runDirectoryOf(optOut.folder));
    check(reports.length > 0, `the stub's probe in the opt-out ${context} workspace left no report`);
    for (const report of reports) {
      check(
        report['commondir-file'] === '../..' && report['git-view'] === 'absent',
        `an opt-out ${context} workspace built a withheld repository: ${JSON.stringify(report)}`,
      );
    }
  }
}

/** Every `probe-git` report in a run directory's records (a trial, a leg, a qualification arm), parsed. */
function probeGitReports(runDirectory) {
  const reports = [];
  const visit = (value) => {
    if (Array.isArray(value)) for (const item of value) visit(item);
    else if (value !== null && typeof value === 'object') {
      const stdout = value.stdout?.value;
      if (typeof stdout === 'string' && stdout.includes('project-git-head: ')) reports.push(probeGitLines(stdout));
      for (const item of Object.values(value)) visit(item);
    }
  };
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.json')) visit(readJson(full));
    }
  };
  if (runDirectory !== null) walk(runDirectory);
  return reports;
}

/**
 * The git a confined target sees of a sparse-checkout project (Story 1.85), through the real CLI. The `probe-sparse` stub prints
 * `git status --porcelain`, `git ls-files`, `git ls-files -t`, `git sparse-checkout list`, the sparse settings and the tracked
 * files the checkout holds; `sparseView` asks the project for the same lines, so each is compared byte for byte. The
 * evaluation folder is an empty tree to the target (Story 1.57), so its paths leave the project's lines.
 */
const SPARSE_CONE = ['bin', 'rules', 'evals'];
const SPARSE_PATTERNS = ['/*', '!/docs/', '!/archive/', '!/src/'];

/** A project with tracked files outside the directories its stub target needs, then sparse over the rest. */
function sparseProject(label, { cone = true, sparse = true, index = false } = {}) {
  return makeProject(label, {
    toolchain: true,
    edit: ({ project }) => {
      for (const [file, text] of [
        [path.join('docs', 'guide.md'), 'a guide\n'],
        [path.join('archive', 'old', 'notes.txt'), 'old notes\n'],
        [path.join('src', 'library.js'), 'module.exports = 1;\n'],
      ]) {
        fs.mkdirSync(path.dirname(path.join(project, file)), { recursive: true });
        fs.writeFileSync(path.join(project, file), text);
      }
    },
    history: ({ repository }) => {
      if (!sparse) return;
      git(
        repository,
        cone
          ? ['sparse-checkout', 'set', ...(index ? ['--sparse-index'] : []), ...SPARSE_CONE]
          : ['sparse-checkout', 'set', '--no-cone', ...SPARSE_PATTERNS],
      );
    },
  });
}

/** What the `probe-sparse` stub prints, asked of the project itself, with the evaluation folder's paths left out. */
function sparseView(directory) {
  const ask = (...args) => spawnSync('git', args, { cwd: directory, env: GIT_ENV, encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS });
  const answer = (result, keep = () => true) =>
    result.status === 0 ? JSON.stringify(result.stdout.split('\n').filter(keep).join('\n')) : `exit ${result.status}`;
  const configured = (key) => {
    const value = ask('config', '--get', key);
    return value.status === 0 ? value.stdout.trim() : 'unset';
  };
  const outsideFolder = (line) => !/^(. )?evals\/verdict\//.test(line);
  // The stub's lines end with the newline of the last entry; a listing that filters lines keeps that newline.
  const listing = (result) =>
    result.status === 0 ? JSON.stringify(result.stdout.split('\n').filter(outsideFolder).join('\n')) : `exit ${result.status}`;
  const onDisk = ask('ls-files')
    .stdout.split('\n')
    .filter((name) => name.length > 0 && outsideFolder(name) && fs.existsSync(path.join(directory, name)));
  return {
    status: listing(ask('status', '--porcelain')),
    'ls-files': listing(ask('ls-files')),
    'ls-files-t': listing(ask('ls-files', '-t')),
    'sparse-list': answer(ask('sparse-checkout', 'list')),
    'sparse-config': `${configured('core.sparseCheckout')}/${configured('core.sparseCheckoutCone')}`,
    'files-on-disk': JSON.stringify(onDisk),
  };
}

/** The stub's `probe-sparse` lines for the clean arm's first trial, with the evaluation folder's paths left out of the listings. */
function sparseLines(project, { env = {} } = {}) {
  const { ran, out, seen } = historyLines(project, { env, act: 'probe-sparse' });
  const outsideFolder = (line) => !/^(. )?evals\/verdict\//.test(line);
  for (const name of ['ls-files', 'ls-files-t']) {
    if (typeof seen[name] === 'string' && seen[name].startsWith('"')) {
      seen[name] = JSON.stringify(JSON.parse(seen[name]).split('\n').filter(outsideFolder).join('\n'));
    }
  }
  if (typeof seen['files-on-disk'] === 'string' && seen['files-on-disk'].startsWith('[')) {
    seen['files-on-disk'] = JSON.stringify(JSON.parse(seen['files-on-disk']).filter(outsideFolder));
  }
  return { ran, out, seen };
}

/** Each line the target printed equals the project's, and the project is the sparse one the case means to compare with. */
function checkSparseLines({ what, project, seen, out, sparse }) {
  const expected = sparseView(project.repository);
  for (const name of Object.keys(expected)) {
    check(
      seen[name] === expected[name],
      `a confined target's ${name} over ${what} printed ${seen[name]}; the project's prints ${expected[name]}`,
    );
  }
  if (sparse) {
    check(expected.status === '""', `the ${what} project's own status is not clean: ${expected.status}`);
    check(
      /\nS |^"S /.test(expected['ls-files-t'].replaceAll(String.raw`\n`, '\n')),
      `the ${what} project has no skip-worktree entry, so the case proves nothing`,
    );
    check(
      /docs\/guide\.md/.test(seen['ls-files'] ?? '') && !/docs\/guide\.md/.test(seen['files-on-disk'] ?? ''),
      `a confined target's git over ${what} must list docs/guide.md, which the checkout does not hold\n${out}`,
    );
    check(
      /^true\//.test(seen['sparse-config'] ?? '') && (seen['sparse-list'] ?? '').startsWith('"'),
      `a confined target's git over ${what} reads sparse settings ${seen['sparse-config']} and a list of ${seen['sparse-list']}\n${out}`,
    );
  } else {
    check(
      seen['sparse-config'] === 'unset/unset' &&
        seen['sparse-list'] === 'exit 128' &&
        !/\nS |^"S /.test((seen['ls-files-t'] ?? '').replaceAll(String.raw`\n`, '\n')),
      `a confined target's git over ${what} shows sparse settings ${seen['sparse-config']}, a list of ${seen['sparse-list']} or a skip-worktree entry\n${out}`,
    );
  }
}

async function checkSparseCheckout() {
  // A cone-mode sparse project and one with a pattern list: the target's status is the project's (clean), its file list and
  // its skip-worktree flags are the project's, and `git sparse-checkout list` reads the project's patterns.
  for (const [label, cone, index] of [
    ['cone', true, false],
    ['pattern list', false, false],
    ['cone with a sparse index', true, true],
  ]) {
    const project = sparseProject(`sparse-${label.replaceAll(' ', '-')}`, { cone, index });
    if (index) {
      check(
        git(project.repository, ['ls-files', '--sparse'])
          .toString('utf8')
          .split('\n')
          .some((name) => name.endsWith('/')),
        "the project's index holds no sparse directory entry, so the sparse-index case proves nothing",
      );
    }
    const { ran, out, seen } = sparseLines(project);
    check(ran.status === 0, `a confined run over a sparse project (${label}) exited ${ran.status}; expected 0\n${ran.output}`);
    if (ran.status === 0) checkSparseLines({ what: `a sparse project (${label})`, project, seen, out, sparse: true });
  }

  // A project that is not sparse keeps the index it has today: the target's lines equal the project's, and carry no sparse setting.
  const plain = sparseProject('sparse-none', { sparse: false });
  {
    const { ran, out, seen } = sparseLines(plain);
    check(ran.status === 0, `a confined run over a project that is not sparse exited ${ran.status}; expected 0\n${ran.output}`);
    if (ran.status === 0) {
      checkSparseLines({ what: 'a project that is not sparse', project: plain, seen, out, sparse: false });
      check(
        /docs\/guide\.md/.test(seen['files-on-disk'] ?? ''),
        `a confined target's checkout of a project that is not sparse lacks docs/guide.md\n${out}`,
      );
    }
  }

  // A blob-less clone made with `--sparse` (Story 1.80's partial-clone shape): nothing fetches and the status is the project's.
  if (hostSkipsLazyFetch()) {
    const source = sparseProject('sparse-origin', { cone: true });
    const partial = partialCloneOf(source, 'blob:none', 'sparse', { sparse: SPARSE_CONE });
    check(missingObjectsOf(partial.repository).length > 0, 'the --sparse blob:none clone holds its whole history on disk');
    const { ran, out, seen } = sparseLines(partial);
    check(ran.status === 0, `a confined run over a --sparse blob:none clone exited ${ran.status}; expected 0\n${ran.output}`);
    if (ran.status === 0) checkSparseLines({ what: 'a --sparse blob:none clone', project: partial, seen, out, sparse: true });
    check(
      !fs.existsSync(partial.fetchLog),
      `a process fetched from the promisor remote of a --sparse clone:\n${fs.existsSync(partial.fetchLog) ? fs.readFileSync(partial.fetchLog, 'utf8') : ''}`,
    );
  }
}

/**
 * Every call that makes a target's port names the git access of the workspace it runs in and the user's private root
 * directory (Story 1.58), or its sandbox would withhold nothing.
 */
function checkProbePortGitAccess() {
  const directory = path.join(PROJECT_ROOT, 'cli', 'lib', 'evaluate');
  let calls = 0;
  for (const name of fs.readdirSync(directory).filter((entry) => entry.endsWith('.js'))) {
    const text = fs.readFileSync(path.join(directory, name), 'utf8');
    for (const match of text.matchAll(/registry\.createProbePort\(/g)) {
      let depth = 0;
      let end = match.index + match[0].length - 1;
      for (; end < text.length; end += 1) {
        if (text[end] === '(') depth += 1;
        else if (text[end] === ')' && --depth === 0) break;
      }
      calls += 1;
      check(
        /git:\s*gitAccessOf\(\w+\)/.test(text.slice(match.index, end)),
        `a createProbePort call in ${name} (character ${match.index}) does not pass git: gitAccessOf(workspace)`,
      );
      check(
        /privateRoot:\s*registry\.privateRoot\b/.test(text.slice(match.index, end)),
        `a createProbePort call in ${name} (character ${match.index}) does not pass privateRoot: registry.privateRoot`,
      );
    }
  }
  check(calls === 9, `found ${calls} createProbePort call(s) in cli/lib/evaluate; expected 9`);
}

/**
 * A private directory the evaluation layer makes for itself is made through `makeScratchDirectory`, beneath the run's
 * private parent (Story 1.58), and a directory made straight in the temp directory is one a target is granted or the
 * parent itself. A new `mkdtempSync` in the evaluate runtime fails this scan until it is named here with the reason it
 * may sit beside the parent.
 */
function checkPrivateDirectorySources() {
  const directory = path.join(PROJECT_ROOT, 'cli', 'lib', 'evaluate');
  const allowed = {
    // The private parent, the scratch fallback for a list without one, and a staged copy.
    'workspace.js': 3,
    // A target's own temp directory per call (granted to it), the sandbox's private home beneath the run's private parent (Story 1.59, granted to
    // it), the audit's directory beneath the same parent, which no target can reach (Story 1.60), and a call's egress proxy directory
    // (Story 1.83), beneath the same parent where the run has one, which the target sees read-only at a path under the synthetic /dev.
    'confinement.js': 4,
    // The two probes that confirm an observer before a run starts: each makes a directory in the system temp directory, runs one trivial process
    // and removes it at once; no target is ever granted either.
    'confinement-audit.js': 2,
    // Bubblewrap's status directory, granted to a target.
    'registry.js': 1,
    // The file a started HTTP service reports its port in, and the directory of the bridge's socket (Story 1.63), each granted to the target.
    'http-target.js': 2,
    // The bridge's directory (socket and token file) beneath the run's private parent, on Windows, and the fallback of a bridge opened with no parent.
    'bridge.js': 3,
    // `compare --accept` stages the new baseline under `runs/.compare-staging/` in the evaluation folder (already withheld from every
    // target, and on the file system `baseline/` is on so each rename stays atomic); the command starts no process of the layer.
    'compare.js': 1,
  };
  const found = {};
  for (const name of fs.readdirSync(directory).filter((entry) => entry.endsWith('.js'))) {
    const count = [...fs.readFileSync(path.join(directory, name), 'utf8').matchAll(/mkdtempSync\(/g)].length;
    if (count > 0) found[name] = count;
  }
  check(
    JSON.stringify(Object.fromEntries(Object.entries(found).sort())) === JSON.stringify(Object.fromEntries(Object.entries(allowed).sort())),
    `the evaluate runtime makes temp directories in ${JSON.stringify(found)}; expected ${JSON.stringify(allowed)}: a private directory of the evaluation layer goes through makeScratchDirectory, beneath the run's private parent`,
  );
}

/**
 * Story 1.58: a sandbox is built over the user's private root, `/tmp/tea-evaluate-p<uid>` whatever each run's `TMPDIR` is, so a
 * run's parent made after it, by another run with any temp directory, is refused as well: the second run's token file and socket are out of the first sandbox's reach. The control builds the sandbox over the
 * first run's parent alone (the per-run design), which the second run's files are readable through.
 */
async function checkPrivateRootAcrossRuns() {
  if (process.platform === 'win32') return;
  const folder = tempDir('root-folder');
  const confinement = selectConfinement({ evaluation: {}, folder });
  if (confinement.refusal !== undefined) throw new Error(confinement.refusal);
  const workspace = tempDir('root-workspace');
  const status = confinement.mode === 'bubblewrap' ? tempDir('root-status') : null;
  const probe = `
    const fs = require('node:fs');
    const net = require('node:net');
    const [tokenFile, socket] = process.argv.slice(1);
    let token;
    try { token = fs.readFileSync(tokenFile, 'utf8') === 'second-run-token' ? 'token' : 'allowed'; } catch (error) { token = 'refused ' + error.code; }
    const client = net.connect(socket);
    client.on('connect', () => { console.log('token: ' + token + '\\nsocket: allowed'); client.destroy(); });
    client.on('error', (error) => console.log('token: ' + token + '\\nsocket: refused ' + error.code));
  `;
  const withheld = process.platform === 'linux' ? /^refused (EPERM|EACCES|ENOENT|ECONNREFUSED)$/ : /^refused EPERM$/;
  const previous = process.env.TMPDIR;
  const parents = [];
  /** `makePrivateParent` for a run whose `TMPDIR` is `temp` (the suite's own when `null`). */
  const parentFor = (list, temp) => {
    if (temp === null) delete process.env.TMPDIR;
    else process.env.TMPDIR = temp;
    try {
      const parent = makePrivateParent(list);
      parents.push(parent);
      return parent;
    } finally {
      if (previous === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = previous;
    }
  };
  const long = fs.mkdtempSync(path.join(tempDir('root-long'), `${'a'.repeat(60)}-`));
  const short = tempDir('root-short');
  let server = null;
  try {
    // Each pair is two runs of one user whose temp directories differ: the first run's sandbox is built, and the second run's
    // parent is made after it, with a token file and a socket in it.
    for (const [what, firstTemp, secondTemp] of [
      ['two runs with the suite temp directory', null, null],
      ['a second run with a long temp directory', null, long],
      ['a second run with another short temp directory', null, short],
      ['a first run with a long temp directory and a second with a short one', long, short],
    ]) {
      const first = [];
      const firstParent = parentFor(first, firstTemp);
      const sandboxes = {
        root: targetSandbox({ confinement, workspace, privateRoot: first.privateRoot, status }),
        // The host's sockets are hidden from every Bubblewrap target (Story 1.82), so the control is told to hide none.
        parentOnly: targetSandbox({ confinement, workspace, privateRoot: firstParent, status, hostSockets: () => [] }),
      };
      const second = [];
      const secondParent = parentFor(second, secondTemp);
      const directory = fs.mkdtempSync(path.join(secondParent, 's-'));
      const tokenFile = path.join(directory, 'token');
      fs.writeFileSync(tokenFile, 'second-run-token', { mode: 0o600 });
      const socket = path.join(directory, 'b.sock');
      server = net.createServer((connection) => connection.end());
      await new Promise((resolve) => server.listen(socket, resolve));
      check(
        path.dirname(secondParent) === first.privateRoot && secondParent !== firstParent,
        `${what}: the second run's parent is not beneath the first run's root`,
      );
      const attempt = (sandbox) => {
        const wrapped = sandbox.wrap(process.execPath, ['-e', probe, tokenFile, socket], []);
        const result = spawnSync(wrapped.target, wrapped.args, {
          cwd: workspace,
          encoding: 'utf8',
          timeout: SPAWN_TIMEOUT_MS,
          killSignal: 'SIGKILL',
        });
        return Object.fromEntries(
          result.stdout
            .split('\n')
            .filter((line) => line.includes(': '))
            .map((line) => line.split(': ')),
        );
      };
      const seen = attempt(sandboxes.root);
      check(
        withheld.test(seen.token ?? ''),
        `${what}: a sandbox built for one run read the token file of another run: ${JSON.stringify(seen.token)}; expected a refusal`,
      );
      check(
        withheld.test(seen.socket ?? ''),
        `${what}: a sandbox built for one run connected to the socket of another run: ${JSON.stringify(seen.socket)}; expected a refusal`,
      );
      // The control: a sandbox over the first run's parent alone reaches the second run's files, so the case sees what the root withholds.
      const narrow = attempt(sandboxes.parentOnly);
      check(
        narrow.token === 'token' && narrow.socket === 'allowed',
        `${what}: a sandbox over one run's parent alone ended ${JSON.stringify(narrow)} on another run's files; expected the token read and the socket connected`,
      );
      await new Promise((resolve) => server.close(() => resolve()));
      server = null;
    }
  } finally {
    if (server !== null) await new Promise((resolve) => server.close(() => resolve()));
    for (const parent of parents) fs.rmSync(parent, { recursive: true, force: true });
  }
}

/** A repository with the evaluation folder committed twice with different trees, for the workspace cases below. */
function makeHistoryRepository(label, { shallow = false, refFormat = null, objectFormat = null } = {}) {
  const repository = path.join(fs.realpathSync(tempDir(label)), 'repository');
  fs.mkdirSync(path.join(repository, 'evals', 'verdict', 'probes'), { recursive: true });
  fs.mkdirSync(path.join(repository, 'docs'));
  fs.mkdirSync(path.join(repository, 'src'));
  const folder = path.join(repository, 'evals', 'verdict');
  git(repository, [
    'init',
    '--quiet',
    '--initial-branch',
    'main',
    ...(refFormat === null ? [] : [`--ref-format=${refFormat}`]),
    ...(objectFormat === null ? [] : [`--object-format=${objectFormat}`]),
  ]);
  const commit = (message) => {
    git(repository, ['add', '--all']);
    git(repository, ['commit', '--quiet', '--message', message]);
  };
  fs.writeFileSync(path.join(repository, 'src', 'a.txt'), 'source a\n');
  fs.writeFileSync(path.join(folder, 'contract.json'), 'secret contract one\n');
  fs.writeFileSync(path.join(folder, 'probes', 'p.json'), 'secret probe one\n');
  commit('one');
  fs.writeFileSync(path.join(folder, 'contract.json'), 'secret contract two\n');
  fs.writeFileSync(path.join(folder, 'probes', 'p.json'), 'secret probe two\n');
  fs.writeFileSync(path.join(repository, 'src', 'a.txt'), 'source a, changed\n');
  commit('two');
  // Outside the folder, with the bytes of the folder's current contract and the folder's whole current probes/ subtree.
  fs.copyFileSync(path.join(folder, 'contract.json'), path.join(repository, 'docs', 'contract-copy.txt'));
  fs.cpSync(path.join(folder, 'probes'), path.join(repository, 'docs', 'probes'), { recursive: true });
  commit('three');
  if (!shallow) return { repository, folder };
  const clone = path.join(fs.realpathSync(tempDir(`${label}-clone`)), 'clone');
  const cloned = spawnSync('git', ['clone', '--quiet', '--depth', '1', `file://${repository}`, clone], { env: GIT_ENV, encoding: 'utf8' });
  if (cloned.status !== 0) throw new Error(`could not make a shallow clone: ${cloned.stderr}`);
  return { repository: clone, folder: path.join(clone, 'evals', 'verdict') };
}

/** Runs `script` in `sh` under the host's confinement, as a target in `workspace` would run; `git` is the sandbox's git access. */
function runConfined(workspace, folder, script, { git: gitAccess = gitAccessOf(workspace) } = {}) {
  const confinement = selectConfinement({ evaluation: {}, folder });
  if (confinement.refusal !== undefined) throw new Error(confinement.refusal);
  const status = confinement.mode === 'bubblewrap' ? tempDir('withheld-history-status') : null;
  const sandbox = targetSandbox({ confinement, workspace: workspace.top, git: gitAccess, status });
  const wrapped = sandbox.wrap('/bin/sh', ['-c', script], []);
  const result = spawnSync(wrapped.target, wrapped.args, {
    cwd: workspace.root,
    encoding: 'utf8',
    timeout: SPAWN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** The ids git names for the folder's files at every commit of the history, read from the adopter's repository. */
function folderBlobsOf(repository, folder) {
  const relative = path.relative(repository, folder).split(path.sep).join('/');
  const blobs = [];
  for (const commit of git(repository, ['--no-replace-objects', 'rev-list', 'HEAD']).toString('utf8').trim().split('\n')) {
    const listed = git(repository, ['--no-replace-objects', 'ls-tree', '-r', commit, '--', relative]).toString('utf8').trim();
    for (const line of listed.split('\n').filter((entry) => entry.length > 0)) blobs.push(/^\d+ blob ([0-9a-f]+)\t/.exec(line)[1]);
  }
  return [...new Set(blobs)];
}

async function checkWithheldHistoryUnits() {
  const { repository, folder } = makeHistoryRepository('withheld-units');
  const options = { root: repository, kind: 'git', exclude: [folder] };
  const commits = git(repository, ['rev-list', 'HEAD']).toString('utf8').trim().split('\n');
  const folderBlobs = folderBlobsOf(repository, folder);
  check(folderBlobs.length === 4, `the history repository holds ${folderBlobs.length} folder blob(s); expected 4`);
  // A folder blob whose bytes the rest of the tree holds too stays readable by id: its bytes are readable at that other path.
  const shared = git(repository, ['ls-tree', '-r', 'HEAD', '--', 'docs']).toString('utf8');
  const blobs = folderBlobs.filter((blob) => !shared.includes(blob));
  check(blobs.length === 2, `${blobs.length} folder blob(s) are held by the folder alone; expected 2`);
  const objectsBefore = git(repository, ['cat-file', '--batch-all-objects', '--batch-check']).toString('utf8');
  const refsBefore = git(repository, ['for-each-ref']).toString('utf8');
  const asks = [
    ...commits.flatMap((commit) => [
      `git cat-file -e ${commit}:evals/verdict/contract.json`,
      `git show ${commit}:evals/verdict/probes/p.json`,
    ]),
    ...blobs.map((blob) => `git cat-file -e ${blob}`),
    'git --no-replace-objects cat-file -p HEAD:evals/verdict',
  ];
  // Every ask must end non-zero; a script that prints the status of each, so one failing does not hide the rest.
  const ask = (workspace, gitAccess) =>
    runConfined(workspace, folder, asks.map((line) => `${line} >/dev/null 2>&1 && echo "read: ${line}"`).join('\n') + '\ntrue', {
      git: gitAccess,
    });

  // The change: nothing of the folder is readable, content shared with it is, and the target's own git works.
  const withheld = createWorkspace({ ...options, label: 'withheld', withholdHistory: true });
  try {
    check(
      typeof withheld.gitView === 'string' && fs.existsSync(path.join(withheld.gitView, 'objects')),
      'a confined git workspace has no withheld repository',
    );
    check(
      path.dirname(withheld.gitView) === withheld.directory && !withheld.gitView.startsWith(`${withheld.top}${path.sep}`),
      "the withheld repository is not beside the checkout, inside the workspace's directory",
    );
    const read = ask(withheld, gitAccessOf(withheld));
    check(read.stdout.trim() === '', `a confined git workspace let the target read the folder:\n${read.stdout}`);
    const own = runConfined(
      withheld,
      folder,
      [
        'git status --porcelain',
        'echo "status: $?"',
        'git log --format=%H',
        'git diff HEAD',
        'echo "diff: $?"',
        'git log -p >/dev/null',
        'echo "log-patch: $?"',
        'git show HEAD:src/a.txt',
        'git show HEAD:docs/contract-copy.txt',
        'git show HEAD:docs/probes/p.json',
        'git log -p -- docs/probes >/dev/null',
        'echo "log-docs: $?"',
        'git cat-file -p HEAD:evals/verdict | wc -c',
        'git rev-parse HEAD',
      ].join('\n'),
    );
    const expectedLog = commits.join('\n');
    check(
      own.stdout.startsWith(
        `status: 0\n${expectedLog}\ndiff: 0\nlog-patch: 0\nsource a, changed\nsecret contract two\nsecret probe two\nlog-docs: 0\n`,
      ) && own.stdout.trim().endsWith(`0\n${commits[0]}`),
      `the target's own git operations in a confined git workspace printed:\n${own.stdout}${own.stderr}`,
    );
    const hidden = runConfined(
      withheld,
      folder,
      `cat ${path.join(repository, '.git', 'HEAD')} 2>/dev/null; ls ${path.join(repository, '.git', 'objects')} 2>/dev/null; cat ${path.join(repository, '.git', 'config')} 2>/dev/null; cat ${path.join(withheld.metadata, 'HEAD')}`,
    );
    check(
      hidden.stdout.trim() === commits[0],
      `the project's git directory was readable, or the worktree's own metadata was not:\n${hidden.stdout}`,
    );
    check(
      git(repository, ['cat-file', '--batch-all-objects', '--batch-check']).toString('utf8') === objectsBefore &&
        git(repository, ['for-each-ref']).toString('utf8') === refsBefore,
      'building the withheld repository wrote an object or a ref into the adopter repository',
    );
    check(
      git(repository, ['rev-list', 'HEAD']).toString('utf8').trim().split('\n').join('') === commits.join(''),
      'a commit id of the adopter repository changed',
    );
    // The workspace and its registration go together, the withheld repository with the directory.
    const view = withheld.gitView;
    removeWorkspace(withheld);
    check(!fs.existsSync(view) && !fs.existsSync(withheld.directory), 'removing a workspace left its withheld repository');
    check(
      !git(repository, ['worktree', 'list', '--porcelain']).toString('utf8').includes(withheld.top),
      'removing a workspace left its registration',
    );
  } finally {
    if (fs.existsSync(withheld.directory)) removeWorkspace(withheld);
  }

  // Revert checks: the target reads the folder when the builder is skipped (today's worktree), when the worktree keeps the
  // adopter's common directory, and the project's git directory is readable when its deny is removed.
  const reads = (result) =>
    result.stdout
      .trim()
      .split('\n')
      .filter((line) => line.startsWith('read: ')).length;
  const skipped = createWorkspace({ ...options, label: 'skipped' });
  try {
    check(
      skipped.gitView === null && fs.readFileSync(path.join(skipped.metadata, 'commondir'), 'utf8').trim() === '../..',
      'an opt-out workspace has a withheld repository',
    );
    check(!fs.existsSync(path.join(skipped.directory, 'git-view')), 'an opt-out workspace built a withheld repository directory');
    const open = ask(skipped, null);
    check(
      reads(open) === asks.length,
      `without the builder the stub read ${reads(open)} of ${asks.length} folder asks; expected the committed folder\n${open.stdout}`,
    );
    const broken = runConfined(skipped, folder, 'git status >/dev/null 2>&1; echo "status: $?"');
    check(
      broken.stdout.trim() !== 'status: 0',
      'with the project git directory withheld and no withheld repository, the worktree git still worked',
    );
  } finally {
    removeWorkspace(skipped);
  }
  const kept = createWorkspace({ ...options, label: 'kept', withholdHistory: true });
  try {
    fs.writeFileSync(path.join(kept.metadata, 'commondir'), '../..\n');
    const open = ask(kept, null);
    check(reads(open) > 0, `with the worktree on the adopter's common directory the stub read nothing of the folder\n${open.stdout}`);
  } finally {
    removeWorkspace(kept);
  }
  const unguarded = createWorkspace({ ...options, label: 'unguarded', withholdHistory: true });
  try {
    const open = runConfined(unguarded, folder, `cat ${path.join(repository, '.git', 'HEAD')}`, { git: null });
    check(open.stdout.trim().length > 0, "with the git directory's deny removed the stub could not read the project's git directory");
  } finally {
    removeWorkspace(unguarded);
  }

  // A historical probe's revision is a worktree at another commit, built by the same recipe at that commit.
  const older = createWorkspace({ ...options, label: 'older', commit: commits[2], withholdHistory: true });
  try {
    const history = runConfined(
      older,
      folder,
      'git rev-parse HEAD; git log --format=%H | wc -l; git cat-file -e HEAD:evals/verdict/contract.json || echo "no folder"; git show HEAD:src/a.txt',
    );
    check(
      history.stdout.split('\n')[0] === commits[2] &&
        /^\s*1$/.test(history.stdout.split('\n')[1]) &&
        history.stdout.includes('no folder\nsource a\n'),
      `a withheld repository at an older commit printed:\n${history.stdout}${history.stderr}`,
    );
    const leaks = ask(older, gitAccessOf(older));
    check(leaks.stdout.trim() === '', `a withheld repository at an older commit let the target read the folder:\n${leaks.stdout}`);
  } finally {
    removeWorkspace(older);
  }

  // A shallow repository: the withheld repository carries the same boundary, and git log stops where the adopter's does.
  const shallow = makeHistoryRepository('withheld-units-shallow', { shallow: true });
  const shallowWorkspace = createWorkspace({
    root: shallow.repository,
    kind: 'git',
    exclude: [shallow.folder],
    label: 'shallow',
    withholdHistory: true,
  });
  try {
    check(
      fs.existsSync(path.join(shallowWorkspace.gitView, 'shallow')) &&
        fs.readFileSync(path.join(shallowWorkspace.gitView, 'shallow'), 'utf8') ===
          fs.readFileSync(path.join(shallow.repository, '.git', 'shallow'), 'utf8'),
      "the withheld repository of a shallow project does not carry the adopter's shallow file",
    );
    const log = runConfined(
      shallowWorkspace,
      shallow.folder,
      'git log --format=%H; git status --porcelain; git cat-file -p HEAD:evals/verdict | wc -c',
    );
    const adopterLog = git(shallow.repository, ['log', '--format=%H']).toString('utf8');
    check(
      log.stdout.startsWith(adopterLog) && adopterLog.trim().split('\n').length === 1,
      `a shallow project's log in the workspace printed:\n${log.stdout}${log.stderr}`,
    );
  } finally {
    removeWorkspace(shallowWorkspace);
  }

  // A run killed after the withheld repository is built leaves the workspace, its repository and its registration; the next
  // run's reclaim removes all three.
  const killed = makeHistoryRepository('withheld-units-killed');
  const runs = path.join(killed.folder, 'runs');
  fs.mkdirSync(runs);
  const abandoned = spawn(
    process.execPath,
    [
      '-e',
      `const workspace = require(${JSON.stringify(path.join(PROJECT_ROOT, 'cli', 'lib', 'evaluate', 'workspace.js'))});
       const [root, folder, runs] = process.argv.slice(1);
       const journal = workspace.journalDirectory(runs);
       const made = workspace.createWorkspace({ root, kind: 'git', exclude: [folder], label: 'killed', withholdHistory: true, ownership: { folder, root, journal, runId: 'killed-run' } });
       process.stdout.write(JSON.stringify({ directory: made.directory, gitView: made.gitView, top: made.top }) + '\\n');
       setInterval(() => {}, 1000);`,
      killed.repository,
      killed.folder,
      runs,
    ],
    { env: BASE_ENV, stdio: ['ignore', 'pipe', 'inherit'] },
  );
  const closed = new Promise((resolve) => abandoned.once('close', resolve));
  const made = await new Promise((resolve) => {
    let text = '';
    abandoned.stdout.on('data', (chunk) => {
      text += chunk;
      if (text.includes('\n')) resolve(JSON.parse(text));
    });
    abandoned.once('close', () => resolve(null));
  });
  abandoned.kill('SIGKILL');
  await closed;
  check(made !== null && fs.existsSync(path.join(made.gitView, 'objects')), 'the killed run never built its withheld repository');
  if (made !== null) {
    check(
      git(killed.repository, ['worktree', 'list', '--porcelain']).toString('utf8').includes(made.top),
      'the killed run left no worktree registration to reclaim',
    );
    const journal = journalDirectory(runs);
    const reclaimed = [];
    try {
      reclaimDeadWorkspaces({ folder: killed.folder, root: killed.repository, journal, log: (message) => reclaimed.push(message) });
    } finally {
      journal.close();
    }
    check(
      !fs.existsSync(made.directory) && !fs.existsSync(made.gitView),
      `the reclaim left the killed run's workspace or withheld repository (${reclaimed.join('; ')})`,
    );
    check(
      !git(killed.repository, ['worktree', 'list', '--porcelain']).toString('utf8').includes(made.top),
      "the reclaim left the killed run's worktree registration",
    );
  }

  // A build step that fails is a refusal that leaves no workspace and no registration.
  const failing = makeHistoryRepository('withheld-units-failing');
  const bin = tempDir('withheld-units-bin');
  const realGit = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim();
  fs.writeFileSync(
    path.join(bin, 'git'),
    `#!/bin/sh\nfor argument in "$@"; do\n  if [ "$argument" = pack-objects ]; then echo "pack-objects refused by the case" >&2; exit 1; fi\ndone\nexec "${realGit}" "$@"\n`,
    { mode: 0o755 },
  );
  const temporary = tempDir('withheld-units-temp');
  const environment = { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR };
  process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;
  process.env.TMPDIR = temporary;
  let refusal = null;
  try {
    createWorkspace({ root: failing.repository, kind: 'git', exclude: [failing.folder], label: 'failing', withholdHistory: true });
  } catch (error) {
    refusal = error;
  } finally {
    process.env.PATH = environment.PATH;
    if (environment.TMPDIR === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = environment.TMPDIR;
  }
  check(
    refusal instanceof WorkspaceRefusal && refusal.message.includes('pack-objects'),
    `a failing git pack-objects did not refuse the workspace: ${refusal?.stack ?? refusal}`,
  );
  check(
    fs.readdirSync(temporary).length === 0,
    `a refused workspace left ${JSON.stringify(fs.readdirSync(temporary))} in the temp directory`,
  );
  check(
    !git(failing.repository, ['worktree', 'list', '--porcelain']).toString('utf8').includes('tea-evaluate-failing'),
    'a refused workspace left its worktree registration',
  );
  check(
    !fs.existsSync(path.join(failing.repository, '.git', 'worktrees')) ||
      fs.readdirSync(path.join(failing.repository, '.git', 'worktrees')).length === 0,
    'a refused workspace left its worktree metadata',
  );
}

/** Runs `body` with a `git` ahead of the real one on `PATH` that runs `script` first (it may `exit`), and TMPDIR at `temporary`. */
function withGitWrapper(script, temporary, body) {
  const bin = tempDir('withheld-git-wrapper');
  const realGit = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim();
  fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\n${script}\nexec "${realGit}" "$@"\n`, { mode: 0o755 });
  const saved = { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR };
  process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;
  if (temporary !== null) process.env.TMPDIR = temporary;
  try {
    return body();
  } finally {
    process.env.PATH = saved.PATH;
    if (saved.TMPDIR === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = saved.TMPDIR;
  }
}

/** The builder's refusals and edges that need a particular repository (Story 1.57). */
async function checkWithheldHistoryEdges() {
  // A folder tracked at the commit that no tree is found for (a spelling that differs from the repository's) refuses.
  const spelled = makeHistoryRepository('withheld-edge-spelling');
  let refusal = null;
  withGitWrapper(
    'for argument in "$@"; do\n  if [ "$argument" = --batch-check ]; then\n    while read -r line; do echo "$line missing"; done\n    exit 0\n  fi\ndone',
    null,
    () => {
      try {
        createWorkspace({ root: spelled.repository, kind: 'git', exclude: [spelled.folder], label: 'spelling', withholdHistory: true });
      } catch (error) {
        refusal = error;
      }
    },
  );
  check(
    refusal instanceof WorkspaceRefusal && refusal.message.includes('is tracked at commit'),
    `a folder tracked at the commit with no tree found did not refuse: ${refusal?.stack ?? refusal}`,
  );

  // The script of asks that must all end non-zero: the folder's files at every commit, by path and by the blob ids held by the folder alone.
  const folderAsks = (repository, folder) => {
    const everyCommit = git(repository, ['--no-replace-objects', 'rev-list', 'HEAD']).toString('utf8').trim().split('\n');
    const shared = git(repository, ['ls-tree', '-r', 'HEAD', '--', 'docs']).toString('utf8');
    const alone = folderBlobsOf(repository, folder).filter((blob) => !shared.includes(blob));
    return [
      ...everyCommit.flatMap((commit) => [
        `git cat-file -e ${commit}:evals/verdict/contract.json`,
        `git show ${commit}:evals/verdict/probes/p.json`,
      ]),
      ...alone.map((blob) => `git cat-file -e ${blob}`),
      'git --no-replace-objects cat-file -p HEAD:evals/verdict',
    ];
  };
  const readsOf = (workspace, repository, folder) =>
    runConfined(
      workspace,
      folder,
      `${folderAsks(repository, folder)
        .map((line) => `${line} >/dev/null 2>&1 && echo "read: ${line}"`)
        .join('\n')}\ntrue`,
    ).stdout.trim();

  // A git that does not know the format questions (before 2.45 and 2.38) echoes the flag with exit 0: the formats are then
  // unknown and are not passed to `git init`.
  const echoing = makeHistoryRepository('withheld-edge-echo');
  let echoed = null;
  let echoFailure = null;
  withGitWrapper(
    'for argument in "$@"; do\n  case "$argument" in\n    --show-ref-format|--show-object-format) echo "$argument"; exit 0 ;;\n  esac\ndone',
    null,
    () => {
      try {
        echoed = createWorkspace({
          root: echoing.repository,
          kind: 'git',
          exclude: [echoing.folder],
          label: 'echo',
          withholdHistory: true,
        });
      } catch (error) {
        echoFailure = error;
      }
    },
  );
  check(echoed !== null, `a git that echoes the format questions broke the build: ${echoFailure?.message}`);
  if (echoed !== null) {
    try {
      check(
        readsOf(echoed, echoing.repository, echoing.folder) === '',
        'a workspace built with unknown formats let the target read the folder',
      );
    } finally {
      removeWorkspace(echoed);
    }
  }

  // The adopter's graft hides a commit from its own rev-list; the history that is withheld is the one under the graft.
  const grafted = makeHistoryRepository('withheld-edge-graft');
  const graftCommits = git(grafted.repository, ['rev-list', 'HEAD']).toString('utf8').trim().split('\n');
  git(grafted.repository, ['replace', '--graft', graftCommits[1]]);
  const graftedWorkspace = createWorkspace({
    root: grafted.repository,
    kind: 'git',
    exclude: [grafted.folder],
    label: 'graft',
    withholdHistory: true,
  });
  try {
    check(
      git(grafted.repository, ['rev-list', 'HEAD']).toString('utf8').trim().split('\n').length === 2,
      'the graft did not hide the oldest commit from the adopter',
    );
    check(
      readsOf(graftedWorkspace, grafted.repository, grafted.folder) === '',
      'a grafted adopter let the target read the folder of a commit its graft hides',
    );
  } finally {
    removeWorkspace(graftedWorkspace);
  }

  // The adopter's ref and object formats are the store's.
  for (const [label, options, flag] of [
    ['reftable', { refFormat: 'reftable' }, '--ref-format=reftable'],
    ['sha256', { objectFormat: 'sha256' }, '--object-format=sha256'],
  ]) {
    const probe = spawnSync('git', ['init', '--quiet', flag, path.join(tempDir(`withheld-edge-${label}-probe`), 'probe')], {
      env: GIT_ENV,
    });
    if (probe.status !== 0) {
      console.log(`  skipped the ${label} case: this host's git cannot init with ${flag}`);
      continue;
    }
    const formatted = makeHistoryRepository(`withheld-edge-${label}`, options);
    let built = null;
    let failure = null;
    try {
      built = createWorkspace({ root: formatted.repository, kind: 'git', exclude: [formatted.folder], label, withholdHistory: true });
    } catch (error) {
      failure = error;
    }
    check(built !== null, `a ${label} adopter broke the build: ${failure?.message}`);
    if (built !== null) {
      try {
        check(readsOf(built, formatted.repository, formatted.folder) === '', `a ${label} adopter let the target read the folder`);
        const status = runConfined(built, formatted.folder, 'git status --porcelain; git log --format=%H | wc -l');
        check(/^\s*3\n$/.test(status.stdout), `git in a ${label} workspace printed:\n${status.stdout}${status.stderr}`);
      } finally {
        removeWorkspace(built);
      }
    }
  }

  // A project that names a promisor remote, by either marker, builds from the objects it holds: the remote names no URL, so
  // a fetch would fail the build (Story 1.80).
  for (const [label, configure] of hostSkipsLazyFetch()
    ? [
        ['extension', (repository) => git(repository, ['config', 'extensions.partialClone', 'origin'])],
        ['remote', (repository) => git(repository, ['config', 'remote.origin.promisor', 'true'])],
      ]
    : []) {
    const partial = makeHistoryRepository(`withheld-edge-partial-${label}`);
    configure(partial.repository);
    let built = null;
    let failure = null;
    try {
      built = createWorkspace({
        root: partial.repository,
        kind: 'git',
        exclude: [partial.folder],
        label: 'partial',
        withholdHistory: true,
      });
    } catch (error) {
      failure = error;
    }
    check(built !== null, `a project naming a promisor remote (${label}) broke the build: ${failure?.message}`);
    if (built !== null) {
      try {
        check(
          readsOf(built, partial.repository, partial.folder) === '',
          `a project naming a promisor remote (${label}) let the target read the folder`,
        );
        const status = runConfined(built, partial.folder, 'git status --porcelain; git log --format=%H | wc -l; git show HEAD:src/a.txt');
        check(
          /^\s*3\nsource a, changed\n$/.test(status.stdout),
          `git over a project naming a promisor remote (${label}) printed:\n${status.stdout}${status.stderr}`,
        );
        const carried = fs.readFileSync(path.join(built.gitView, 'config'), 'utf8');
        check(
          !/promisor|partialclone|remote/i.test(carried),
          `the withheld repository of a project naming a promisor remote (${label}) carried it:\n${carried}`,
        );
      } finally {
        removeWorkspace(built);
      }
    }
  }

  // A copy workspace in a repository withholds the project's git directory too.
  const copied = makeHistoryRepository('withheld-edge-copy');
  const copy = createWorkspace({ root: copied.repository, kind: 'copy', exclude: [copied.folder], label: 'copy' });
  try {
    const head = path.join(copied.repository, '.git', 'HEAD');
    check(
      runConfined(copy, copied.folder, `cat ${head}`).stdout.trim() === '',
      "a confined copy workspace could read the project's git directory",
    );
    check(
      runConfined(copy, copied.folder, `cat ${head}`, { git: null }).stdout.trim() !== '',
      "the copy case's control could not read the git directory",
    );
  } finally {
    removeWorkspace(copy);
  }

  // A folder outside launch.root leaves the checkout too, and git sees it as an empty tree: nothing untracked, nothing deleted.
  const outside = makeHistoryRepository('withheld-edge-outside');
  const away = createWorkspace({
    root: path.join(outside.repository, 'src'),
    kind: 'git',
    exclude: [outside.folder],
    label: 'outside',
    withholdHistory: true,
  });
  try {
    check(!fs.existsSync(path.join(away.top, 'evals', 'verdict')), 'the evaluation folder outside launch.root stayed in the checkout');
    const status = runConfined(away, outside.folder, 'git status --porcelain; echo "exit $?"');
    check(
      status.stdout === 'exit 0\n',
      `git status in a workspace whose folder lies outside launch.root printed:\n${status.stdout}${status.stderr}`,
    );
  } finally {
    removeWorkspace(away);
  }

  // Objects borrowed through alternates are the history too: the borrowed store is withheld, and git still reads the history.
  const lender = makeHistoryRepository('withheld-edge-alternates');
  const borrowerParent = path.join(fs.realpathSync(tempDir('withheld-edge-alternates-clone')), 'borrower');
  const cloned = spawnSync('git', ['clone', '--quiet', '--shared', lender.repository, borrowerParent], { env: GIT_ENV, encoding: 'utf8' });
  check(cloned.status === 0, `could not make a repository with alternates: ${cloned.stderr}`);
  const borrower = createWorkspace({
    root: borrowerParent,
    kind: 'git',
    exclude: [path.join(borrowerParent, 'evals', 'verdict')],
    label: 'alternates',
    withholdHistory: true,
  });
  try {
    const lent = path.join(fs.realpathSync(lender.repository), '.git', 'objects');
    check(
      JSON.stringify(gitAccessOf(borrower).alternates) === JSON.stringify([lent]),
      `the git access names the alternates ${JSON.stringify(gitAccessOf(borrower).alternates)}; expected ${lent}`,
    );
    const log = runConfined(borrower, path.join(borrowerParent, 'evals', 'verdict'), `git log --format=%H; ls ${lent}`);
    const lenderLog = git(lender.repository, ['log', '--format=%H']).toString('utf8');
    check(log.stdout === lenderLog, `a workspace over borrowed objects printed:\n${log.stdout}${log.stderr}`);
    const open = runConfined(borrower, path.join(borrowerParent, 'evals', 'verdict'), `ls ${lent}`, {
      git: { ...gitAccessOf(borrower), alternates: [] },
    });
    check(open.stdout.includes('pack'), "the alternates case's control could not read the borrowed store");
  } finally {
    removeWorkspace(borrower);
  }

  // A second workspace for the same commit links the first one's objects and packs nothing.
  const cached = makeHistoryRepository('withheld-edge-cache');
  const log = path.join(tempDir('withheld-edge-cache-log'), 'git.log');
  const first = [];
  withGitWrapper(`printf '%s\\n' "$*" >> "${log}"`, null, () => {
    first.push(createWorkspace({ root: cached.repository, kind: 'git', exclude: [cached.folder], label: 'first', withholdHistory: true }));
  });
  const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n') : []);
  const walks = calls().filter((line) => line.includes('rev-list --objects')).length;
  check(
    calls().some((line) => line.includes('pack-objects')) && walks === 2,
    `the first workspace made ${walks} restore walk(s) over its store (expected the walk that finds the shared objects and one that confirms them)`,
  );
  const packsBefore = calls().filter((line) => line.includes('pack-objects')).length;
  const second = [];
  withGitWrapper(`printf '%s\\n' "$*" >> "${log}"`, null, () => {
    second.push(
      createWorkspace({ root: cached.repository, kind: 'git', exclude: [cached.folder], label: 'second', withholdHistory: true }),
    );
  });
  try {
    check(
      calls().filter((line) => line.includes('pack-objects')).length === packsBefore &&
        calls().filter((line) => line.includes('rev-list --objects')).length === walks,
      'a second workspace for the same commit packed the history again',
    );
    const reads = runConfined(
      second[0],
      cached.folder,
      'git status --porcelain; git show HEAD:docs/probes/p.json; git cat-file -e HEAD:evals/verdict/contract.json || echo "no folder"; git cat-file -p HEAD:evals/verdict | wc -c',
    );
    check(
      /^secret probe two\nno folder\n\s*0\n$/.test(reads.stdout),
      `a workspace whose store was linked from another printed:\n${reads.stdout}${reads.stderr}`,
    );
    check(
      fs.statSync(path.join(second[0].gitView, 'objects', 'pack', fs.readdirSync(path.join(second[0].gitView, 'objects', 'pack'))[0]))
        .nlink > 1,
      'the second workspace copied the packs of the first in place of linking them',
    );
  } finally {
    removeWorkspace(second[0]);
    removeWorkspace(first[0]);
  }

  // A third workspace after the cached store is gone is built in full again.
  const gone = [];
  withGitWrapper(`printf '%s\\n' "$*" >> "${log}"`, null, () => {
    gone.push(createWorkspace({ root: cached.repository, kind: 'git', exclude: [cached.folder], label: 'third', withholdHistory: true }));
  });
  try {
    check(
      calls().filter((line) => line.includes('pack-objects')).length > packsBefore,
      'a workspace whose cached store was gone did not pack the history',
    );
    check(
      runConfined(gone[0], cached.folder, 'git log --format=%H').stdout === git(cached.repository, ['log', '--format=%H']).toString('utf8'),
      'a rebuilt withheld repository lost the history',
    );
  } finally {
    removeWorkspace(gone[0]);
  }

  // The adopter's reading of the tree (file mode, exclude rules) carries over: the target's git says what the adopter's says.
  const configured = makeHistoryRepository('withheld-edge-fidelity');
  git(configured.repository, ['config', 'core.filemode', 'false']);
  fs.mkdirSync(path.join(configured.repository, '.git', 'info'), { recursive: true });
  fs.appendFileSync(path.join(configured.repository, '.git', 'info', 'exclude'), '*.log\n');
  git(configured.repository, ['remote', 'add', 'origin', 'https://user:secret@example.test/repo.git']);
  const script = 'chmod +x src/a.txt; echo x > noise.log; git status --porcelain; echo "exit $?"';
  const plain = createWorkspace({ root: configured.repository, kind: 'git', exclude: [configured.folder], label: 'plain' });
  const withheldConfigured = createWorkspace({
    root: configured.repository,
    kind: 'git',
    exclude: [configured.folder],
    label: 'configured',
    withholdHistory: true,
  });
  try {
    const before = runConfined(plain, configured.folder, script, { git: null });
    const after = runConfined(withheldConfigured, configured.folder, script);
    // Today's worktree lists the evaluation folder's files as deleted; the empty tree lists nothing, and nothing else differs.
    const beforeWithoutFolder = before.stdout
      .split('\n')
      .filter((line) => !line.startsWith(' D evals/verdict/'))
      .join('\n');
    check(
      beforeWithoutFolder === 'exit 0\n',
      `the adopter's git status over the configured repository printed:\n${before.stdout}${before.stderr}`,
    );
    check(after.stdout === 'exit 0\n', `the target's git status differs from the adopter's:\n${after.stdout}${after.stderr}`);
    const carried = fs.readFileSync(path.join(withheldConfigured.gitView, 'config'), 'utf8');
    check(/filemode = false/.test(carried), 'the withheld repository did not carry core.filemode');
    check(!/remote|secret|example\.test/.test(carried), `the withheld repository carried a remote or a credential:\n${carried}`);
    check(
      fs.readFileSync(path.join(withheldConfigured.gitView, 'info', 'exclude'), 'utf8').includes('*.log'),
      'the withheld repository did not carry info/exclude',
    );
  } finally {
    removeWorkspace(withheldConfigured);
    removeWorkspace(plain);
  }

  // A tracked filter driver (a clean and smudge pair named in .gitattributes) is part of how the adopter's git reads the tree.
  const filtered = makeHistoryRepository('withheld-edge-filter');
  git(filtered.repository, ['config', 'filter.upper.clean', 'tr A-Z a-z']);
  git(filtered.repository, ['config', 'filter.upper.smudge', 'tr a-z A-Z']);
  fs.writeFileSync(path.join(filtered.repository, '.gitattributes'), 'src/shout.txt filter=upper\n');
  fs.writeFileSync(path.join(filtered.repository, 'src', 'shout.txt'), 'quiet words\n');
  git(filtered.repository, ['add', '--all']);
  git(filtered.repository, ['commit', '--quiet', '--message', 'a filtered file']);
  const filterScript = 'git status --porcelain; echo "exit $?"';
  const filteredPlain = createWorkspace({ root: filtered.repository, kind: 'git', exclude: [filtered.folder], label: 'filter-plain' });
  const filteredWithheld = createWorkspace({
    root: filtered.repository,
    kind: 'git',
    exclude: [filtered.folder],
    label: 'filter-withheld',
    withholdHistory: true,
  });
  try {
    check(
      fs.readFileSync(path.join(filteredPlain.top, 'src', 'shout.txt'), 'utf8') === 'QUIET WORDS\n',
      'the adopter checkout did not smudge the filtered file',
    );
    const adopterStatus = runConfined(filteredPlain, filtered.folder, filterScript, { git: null }).stdout.split('\n');
    const targetStatus = runConfined(filteredWithheld, filtered.folder, filterScript).stdout;
    check(
      adopterStatus.filter((line) => !line.startsWith(' D evals/verdict/')).join('\n') === 'exit 0\n' && targetStatus === 'exit 0\n',
      `the target's git status over a filtered file printed ${JSON.stringify(targetStatus)}; the adopter's printed ${JSON.stringify(adopterStatus)}`,
    );
  } finally {
    removeWorkspace(filteredWithheld);
    removeWorkspace(filteredPlain);
  }
}

/**
 * What the withheld repository shows a confined target of the project (Story 1.80), through the real CLI: a project cloned
 * with a promisor remote (`--filter=blob:none` and `--filter=tree:0`) runs with no fetch and no exit 12, a project's tags
 * (lightweight and annotated, those inside the evaluated history) reach the target's git with no remote, URL, credential or
 * hook, a history whose object walk prints more than six million ids is read as a stream, and a filter driver's whole
 * configuration reaches it.
 */
const LARGE_WALK_OBJECTS = 7_000_000;

/** A project that commits its evaluation folder in three commits, plus a file outside it that changes in each. */
function reachProject(label, { drivers = false, tags = false } = {}) {
  return makeProject(label, {
    toolchain: true,
    edit: ({ project, folder }) => {
      fs.mkdirSync(path.join(project, 'docs'), { recursive: true });
      fs.copyFileSync(path.join(folder, 'contract.json'), path.join(project, 'docs', 'contract-copy.json'));
    },
    history: ({ repository, folder }) => {
      for (const version of ['one', 'two']) {
        fs.writeFileSync(path.join(folder, 'notes.md'), `note ${version}\n`);
        fs.writeFileSync(path.join(repository, 'docs', 'history.txt'), `history ${version}\n`);
        git(repository, ['add', '--all']);
        git(repository, ['commit', '--quiet', '--message', `note ${version}`]);
      }
      if (drivers) {
        git(repository, ['config', 'filter.upper.clean', 'tr A-Z a-z']);
        git(repository, ['config', 'filter.upper.smudge', 'tr a-z A-Z']);
        // A boolean written with no value, which `git config --get-regexp` prints as the key alone.
        fs.appendFileSync(path.join(repository, '.git', 'config'), '[filter "upper"]\n\trequired\n');
        git(repository, ['config', 'filter.my driver.clean', 'cat']);
        git(repository, ['config', 'filter.my driver.smudge', 'cat']);
        fs.writeFileSync(path.join(repository, '.gitattributes'), 'docs/shout.up filter=upper\n');
        fs.writeFileSync(path.join(repository, 'docs', 'shout.up'), 'quiet words\n');
        git(repository, ['add', '--all']);
        git(repository, ['commit', '--quiet', '--message', 'a filtered file']);
      }
      if (tags) {
        git(repository, ['tag', 'light', 'HEAD~2']);
        git(repository, ['tag', '--annotate', '--message', 'release 2.0', 'v2.0', 'HEAD~1']);
        // A tag on a commit the evaluated history does not reach, and one on a tree: neither can name a commit of the history.
        git(repository, ['switch', '--quiet', '--create', 'side', 'HEAD~1']);
        fs.writeFileSync(path.join(repository, 'side.txt'), 'side\n');
        git(repository, ['add', '--all']);
        git(repository, ['commit', '--quiet', '--message', 'side']);
        git(repository, ['tag', 'side-tag']);
        git(repository, ['switch', '--quiet', 'main']);
        git(repository, ['tag', 'tree-tag', 'HEAD^{tree}']);
        git(repository, ['remote', 'add', 'origin', 'https://user:secret@example.test/repo.git']);
        git(repository, ['config', 'credential.helper', 'store']);
        const hooks = path.join(repository, '.git', 'hooks');
        fs.mkdirSync(hooks, { recursive: true });
        fs.writeFileSync(path.join(hooks, 'pre-commit'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
      }
    },
  });
}

/** `project` cloned with `filter`, its remote logging every upload-pack it serves to `fetchLog`; the clone holds what a checkout needs. */
function partialCloneOf(project, filter, label, { sparse = null } = {}) {
  const root = path.dirname(project.repository);
  const origin = path.join(root, 'origin.git');
  const clone = path.join(root, `partial-${label}`);
  const fetchLog = path.join(root, `fetches-${label}.log`);
  const run = (args) => {
    const result = spawnSync('git', args, { env: GIT_ENV, encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS, killSignal: 'SIGKILL' });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  };
  if (!fs.existsSync(origin)) {
    run(['clone', '--quiet', '--bare', project.repository, origin]);
    run(['-C', origin, 'config', 'uploadpack.allowFilter', 'true']);
    run(['-C', origin, 'config', 'uploadpack.allowAnySHA1InWant', 'true']);
  }
  run(['clone', '--quiet', `--filter=${filter}`, ...(sparse === null ? [] : ['--sparse']), `file://${origin}`, clone]);
  // The cone's blobs come from the remote now, before the remote logs what it serves.
  if (sparse !== null) run(['-C', clone, 'sparse-checkout', 'set', ...sparse]);
  const wrapper = path.join(root, `upload-pack-${label}.sh`);
  fs.writeFileSync(wrapper, `#!/bin/sh\necho "$@" >> '${fetchLog}'\nexec git upload-pack "$@"\n`, { mode: 0o755 });
  run(['-C', clone, 'config', 'remote.origin.uploadpack', wrapper]);
  // The gitignored runtime directory the evaluation provisions, when the project has one.
  if (fs.existsSync(path.join(project.repository, 'vendor'))) {
    fs.cpSync(path.join(project.repository, 'vendor'), path.join(clone, 'vendor'), { recursive: true });
  }
  return { repository: clone, folder: path.join(clone, EVALUATION), env: project.env, fetchLog };
}

let lazyFetchSkippable = null;

/**
 * Whether this host's git honors `GIT_NO_LAZY_FETCH` (2.44 and later), asked once. The partial-clone cases run only where
 * it does; under `CI` a git that does not is a failed check, so the cases cannot go unrun there.
 */
function hostSkipsLazyFetch() {
  if (lazyFetchSkippable !== null) return lazyFetchSkippable;
  const asked = spawnSync('git', ['--version'], { env: GIT_ENV, encoding: 'utf8' }).stdout;
  const [, major, minor] = /(\d+)\.(\d+)/.exec(asked) ?? [];
  lazyFetchSkippable = Number(major) > 2 || (Number(major) === 2 && Number(minor) >= 44);
  if (!lazyFetchSkippable) {
    if (process.env.CI)
      check(false, `this CI host's ${asked.trim()} predates GIT_NO_LAZY_FETCH (git 2.44), so the partial-clone cases cannot run`);
    else
      console.log(
        `  skipped the partial-clone cases: this host's ${asked.trim()} predates GIT_NO_LAZY_FETCH (git 2.44); TeA's CI runs them`,
      );
  }
  return lazyFetchSkippable;
}

/** The ids a partial clone lacks on disk, asked without fetching. */
function missingObjectsOf(repository) {
  const walked = spawnSync('git', ['-C', repository, 'rev-list', '--objects', '--missing=print', 'HEAD'], {
    env: { ...GIT_ENV, GIT_NO_LAZY_FETCH: '1' },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return walked.stdout.split('\n').filter((line) => line.startsWith('?'));
}

/** What the `probe-history` stub printed in the clean arm's first trial. */
function historyLines(project, { env = {}, act = 'probe-history' } = {}) {
  const ran = evaluate(['run', '--evaluation', project.folder], {
    ...project.env,
    ...env,
    VERDICT_WHEN: 'trial-clean-1',
    VERDICT_DO: act,
  });
  const out = ran.status === 0 ? trialStdout(runDirectoryOf(project.folder), 'clean', 1) : '';
  return { ran, out, seen: probeGitLines(out) };
}

async function checkWithheldHistoryReach() {
  // A project cloned with a promisor remote: the target's git shows what the project holds on disk, and nothing fetches.
  for (const filter of hostSkipsLazyFetch() ? ['blob:none', 'tree:0'] : []) {
    const source = reachProject(`reach-partial-${filter.replace(':', '-')}`);
    const partial = partialCloneOf(source, filter, filter.replace(':', '-'));
    check(
      missingObjectsOf(partial.repository).length > 0,
      `the ${filter} clone holds its whole history on disk; the case needs a partial clone`,
    );
    const objects = () => git(partial.repository, ['cat-file', '--batch-all-objects', '--batch-check']).toString('utf8');
    const objectsBefore = objects();
    const { ran, out, seen } = historyLines(partial);
    check(ran.status === 0, `a confined run over a ${filter} partial clone exited ${ran.status}; expected 0\n${ran.output}`);
    check(
      /^exit 0 \(0 line\(s\)\)$/.test(seen.status ?? ''),
      `a confined target's git status over a ${filter} clone ended ${JSON.stringify(seen.status)}\n${out}`,
    );
    check(
      /^exit 0 \(3 line\(s\)\)$/.test(seen.log ?? ''),
      `a confined target's git log over a ${filter} clone ended ${JSON.stringify(seen.log)}\n${out}`,
    );
    check(
      seen['show-tracked'] === 'printed',
      `a confined target could not show a tracked file of a ${filter} clone: ${seen['show-tracked']}\n${out}`,
    );
    check(
      seen['show-shared'] === 'printed',
      `a confined target could not show the file outside the folder that holds the contract's bytes in a ${filter} clone: ${seen['show-shared']}\n${out}`,
    );
    check(
      /^none \d+$/.test(seen['show-folder'] ?? ''),
      `a confined target read the committed contract of a ${filter} clone: ${seen['show-folder']}\n${out}`,
    );
    check(
      !fs.existsSync(partial.fetchLog),
      `a process fetched from the promisor remote of a ${filter} clone:\n${fs.existsSync(partial.fetchLog) ? fs.readFileSync(partial.fetchLog, 'utf8') : ''}`,
    );
    check(objects() === objectsBefore, `a confined run over a ${filter} clone changed the clone's objects`);
  }

  // Tags: those inside the evaluated history reach the target's git, with their annotations, and no remote, URL, credential or hook does.
  const tagged = reachProject('reach-tags', { tags: true });
  {
    const { ran, out, seen } = historyLines(tagged);
    check(ran.status === 0, `a confined run over a project with tags exited ${ran.status}; expected 0\n${ran.output}`);
    check(
      seen.tags === 'light,v2.0',
      `a confined target's git tag -l printed ${JSON.stringify(seen.tags)}; expected the tags inside the history, light and v2.0\n${out}`,
    );
    check(
      /^v2\.0-1-g[0-9a-f]+$/.test(seen.describe ?? ''),
      `a confined target's git describe --tags printed ${JSON.stringify(seen.describe)}; expected v2.0-1-g<id>\n${out}`,
    );
    check(
      seen['tag-tracked'] === 'light=printed,v2.0=printed',
      `a confined target read ${JSON.stringify(seen['tag-tracked'])} of the tagged commits' files\n${out}`,
    );
    check(
      seen['tag-folder'] === 'light=none,v2.0=none',
      `a confined target read the committed contract at a tag: ${JSON.stringify(seen['tag-folder'])}\n${out}`,
    );
    check(
      seen.remotes === '0' && seen.carried === '0' && seen.hooks === '0',
      `a confined target's git carries ${seen.remotes} remote(s), ${seen.carried} remote, URL, credential or hook setting(s) and ${seen.hooks} hook(s); expected none\n${out}`,
    );
  }

  // A filter driver: its whole configuration reaches the target, a name with a space and a `required` with no value included.
  const filtered = reachProject('reach-filters', { drivers: true });
  {
    const { ran, out, seen } = historyLines(filtered);
    check(ran.status === 0, `a confined run over a project with filter drivers exited ${ran.status}; expected 0\n${ran.output}`);
    check(
      /^exit 0 \(0 line\(s\)\)$/.test(seen.status ?? ''),
      `a confined target's git status over a filtered file ended ${JSON.stringify(seen.status)}; the project's lists nothing\n${out}`,
    );
    check(seen.required === 'true', `a confined target's filter.upper.required is ${JSON.stringify(seen.required)}; expected true\n${out}`);
    check(
      (seen.filters ?? '').includes('filter.my driver.clean=cat') && (seen.filters ?? '').includes('filter.my driver.smudge=cat'),
      `a confined target's git lost the filter driver named with a space: ${JSON.stringify(seen.filters)}\n${out}`,
    );
  }

  // A history whose object walk prints more than six million ids: the walk is read as a stream, so no buffer bounds it.
  const large = reachProject('reach-large');
  {
    const stubs = tempDir('reach-large-git');
    const real = spawnSync('which', ['git'], { encoding: 'utf8', env: BASE_ENV }).stdout.trim();
    // The store's object walk answers as git does and then prints more ids; every other git call is git's.
    fs.writeFileSync(
      path.join(stubs, 'git'),
      `#!/bin/sh\ncase " $* " in\n  *" rev-list "*"--objects"*"--missing=print"*)\n    echo walked >> "$STUB_LOG"\n    "${real}" "$@" || exit $?\n    exec awk -v n=${LARGE_WALK_OBJECTS} 'BEGIN { for (i = 1; i <= n; i++) printf "%040x\\n", i }'\n    ;;\nesac\nexec "${real}" "$@"\n`,
      { mode: 0o755 },
    );
    const walkLog = path.join(stubs, 'walks.log');
    const { ran, out, seen } = historyLines(large, { env: { PATH: `${stubs}${path.delimiter}${BASE_ENV.PATH}`, STUB_LOG: walkLog } });
    check(fs.existsSync(walkLog), 'the stub git on PATH never saw the store walk, so the case does not exercise a large walk');
    check(
      ran.status === 0,
      `a confined run over a history of more than six million objects exited ${ran.status}; expected 0\n${ran.output}`,
    );
    check(
      /^exit 0 \(0 line\(s\)\)$/.test(seen.status ?? '') && seen['show-tracked'] === 'printed' && seen['show-shared'] === 'printed',
      `a confined target's git over a history of more than six million objects printed ${JSON.stringify(seen)}\n${out}`,
    );
    check(
      /^none \d+$/.test(seen['show-folder'] ?? ''),
      `a confined target read the committed contract over the large history: ${seen['show-folder']}\n${out}`,
    );
  }
}

/**
 * The withheld repository's reach, built directly (Story 1.80): the tags it carries and drops, the configuration of a
 * filter driver and of a boolean written with no value, a partial clone built with no fetch and a failing pack, and the
 * streaming reader run with a heap too small for the output it reads.
 */
async function checkWithheldHistoryReachUnits() {
  // Tags: those inside the history are carried with their annotations, a later build sees a tag added since, and nothing
  // outside the history, no remote, URL, credential or hook is.
  const tagged = makeHistoryRepository('reach-unit-tags');
  git(tagged.repository, ['tag', 'light', 'HEAD~2']);
  git(tagged.repository, ['tag', '--annotate', '--message', 'release one', 'v1', 'HEAD~1']);
  git(tagged.repository, ['-c', 'advice.nestedTag=false', 'tag', '--annotate', '--message', 'nested', 'nested', 'v1']);
  git(tagged.repository, ['switch', '--quiet', '--create', 'side', 'HEAD~1']);
  fs.writeFileSync(path.join(tagged.repository, 'side.txt'), 'side\n');
  git(tagged.repository, ['add', '--all']);
  git(tagged.repository, ['commit', '--quiet', '--message', 'side']);
  git(tagged.repository, ['tag', 'side-tag']);
  git(tagged.repository, ['switch', '--quiet', 'main']);
  git(tagged.repository, ['tag', 'tree-tag', 'HEAD^{tree}']);
  git(tagged.repository, ['remote', 'add', 'origin', 'https://user:secret@example.test/repo.git']);
  const build = (repository, label) =>
    createWorkspace({ root: repository.repository, kind: 'git', exclude: [repository.folder], label, withholdHistory: true });
  const first = build(tagged, 'tags-first');
  let second = null;
  try {
    const asked = runConfined(
      first,
      tagged.folder,
      String.raw`git -c tag.sort=refname tag -l | tr "\n" " "; echo; git describe --tags --exact-match HEAD~2; git cat-file -t nested; git rev-parse "nested^{commit}"; git show v1:src/a.txt; git show light:evals/verdict/contract.json 2>/dev/null | grep -c secret`,
    );
    const [names = '', described = '', type = '', peeled = '', shown = '', folder = ''] = asked.stdout.split('\n');
    check(
      names === 'light nested v1 ',
      `the tags a target's git lists are ${JSON.stringify(names)}; expected light, nested and v1 (not side-tag or tree-tag)`,
    );
    check(described === 'light', `git describe --tags --exact-match HEAD~2 printed ${JSON.stringify(described)}; expected light`);
    check(type === 'tag', `an annotated tag's object type reads ${JSON.stringify(type)}; expected tag`);
    check(
      peeled === git(tagged.repository, ['rev-parse', 'HEAD~1']).toString('utf8').trim(),
      `a nested tag peels to ${JSON.stringify(peeled)}; expected the tagged commit`,
    );
    check(shown === 'source a, changed', `git show v1:src/a.txt printed ${JSON.stringify(shown)}`);
    check(folder === '0', `git show light:<the committed contract> printed ${folder} line(s) with the contract's bytes; expected none`);
    const names2 = git(first.gitView, ['for-each-ref', '--format=%(refname)'])
      .toString('utf8')
      .split('\n')
      .filter((line) => line !== '');
    check(
      names2.filter((name) => !name.startsWith('refs/replace/')).join(' ') === 'refs/tags/light refs/tags/nested refs/tags/v1',
      `the withheld repository's refs are ${JSON.stringify(names2)}; expected the three tags beside the replace entries`,
    );
    const config = fs.readFileSync(path.join(first.gitView, 'config'), 'utf8');
    check(
      !/remote|secret|example\.test|credential/i.test(config),
      `the withheld repository's config carries a remote or a credential:\n${config}`,
    );
    check(!fs.existsSync(path.join(first.gitView, 'hooks')), 'the withheld repository carries a hooks directory');
    // A second workspace for the same commit links the first's objects and still gets the tags, and a tag added between the
    // two is seen: the store it links from was built for another set of tags.
    git(tagged.repository, ['tag', '--annotate', '--message', 'late', 'late', 'HEAD']);
    second = build(tagged, 'tags-second');
    const later = runConfined(second, tagged.folder, String.raw`git -c tag.sort=refname tag -l | tr "\n" " "`).stdout;
    check(later === 'late light nested v1 ', `a second workspace after a tag was added lists ${JSON.stringify(later)}`);
    const third = build(tagged, 'tags-third');
    try {
      check(
        runConfined(third, tagged.folder, String.raw`git -c tag.sort=refname tag -l | tr "\n" " "`).stdout === later,
        'a workspace that links the objects of an earlier one lost the tags',
      );
    } finally {
      removeWorkspace(third);
    }
  } finally {
    if (second !== null) removeWorkspace(second);
    removeWorkspace(first);
  }

  // Configuration: a filter driver named with a space, a `required` and booleans written with no value reach the store.
  const configured = makeHistoryRepository('reach-unit-config');
  git(configured.repository, ['config', 'filter.my driver.clean', 'cat']);
  git(configured.repository, ['config', 'filter.my driver.smudge', 'cat']);
  git(configured.repository, ['config', 'filter.my driver.process', 'cat --filter']);
  fs.appendFileSync(
    path.join(configured.repository, '.git', 'config'),
    '[filter "my driver"]\n\trequired\n[filter "bare"]\n\trequired\n[core]\n\tsymlinks\n\tfilemode = false\n',
  );
  const configuredWorkspace = build(configured, 'config');
  try {
    const stored = (key) =>
      spawnSync('git', ['--git-dir', configuredWorkspace.gitView, 'config', '--get', key], {
        env: GIT_ENV,
        encoding: 'utf8',
      }).stdout.trim();
    check(
      stored('filter.my driver.clean') === 'cat',
      `a filter driver named with a space has clean ${JSON.stringify(stored('filter.my driver.clean'))} in the withheld repository`,
    );
    check(stored('filter.my driver.process') === 'cat --filter', 'a filter driver named with a space lost its process command');
    check(stored('filter.my driver.required') === 'true', 'a required written with no value was not carried as true');
    check(stored('filter.bare.required') === 'true', 'a driver whose only key is a required with no value was not carried');
    check(
      stored('core.symlinks') === 'true' && stored('core.filemode') === 'false',
      'a core boolean written with no value was not carried as true',
    );
  } finally {
    removeWorkspace(configuredWorkspace);
  }

  // A partial clone builds from the objects on disk: the promisor remote is never asked, and a pack that fails refuses.
  for (const filter of hostSkipsLazyFetch() ? ['blob:none', 'tree:0'] : []) {
    const label = `unit-${filter.replace(':', '-')}`;
    const source = makeHistoryRepository(`reach-${label}`);
    const partial = partialCloneOf({ repository: source.repository, env: {} }, filter, label);
    const objects = () => git(partial.repository, ['cat-file', '--batch-all-objects', '--batch-check']).toString('utf8');
    const before = objects();
    check(missingObjectsOf(partial.repository).length > 0, `the ${filter} clone of the history repository holds all its objects`);
    const built = build(partial, `partial-${label}`);
    try {
      const seen = runConfined(
        built,
        partial.folder,
        'git status --porcelain; git log --format=%H | wc -l; git show HEAD:src/a.txt; git show HEAD:docs/contract-copy.txt; git show HEAD:evals/verdict/contract.json 2>&1 | head -c 40',
      ).stdout;
      check(
        /^\s*3\nsource a, changed\nsecret contract two\n(?!secret)/.test(seen),
        `git in a ${filter} clone's withheld repository printed ${JSON.stringify(seen)}; expected a clean status, three commits, the tracked file and the shared copy, and no committed contract`,
      );
      check(!fs.existsSync(partial.fetchLog), `a process fetched from the promisor remote of the ${filter} clone`);
      check(objects() === before, `building over the ${filter} clone changed its objects`);
    } finally {
      removeWorkspace(built);
    }
  }
  // A git that cannot be told not to fetch (before 2.44) is refused for a partial clone, with the way out.
  const oldGit = makeHistoryRepository('reach-unit-old-git');
  const oldGitPartial = partialCloneOf({ repository: oldGit.repository, env: {} }, 'blob:none', 'old-git');
  let oldGitRefusal = null;
  withGitWrapper('if [ "$1" = --version ]; then echo "git version 2.43.0"; exit 0; fi', null, () => {
    try {
      build(oldGitPartial, 'partial-old-git');
    } catch (error) {
      oldGitRefusal = error;
    }
  });
  check(
    oldGitRefusal instanceof WorkspaceRefusal &&
      oldGitRefusal.message.includes('git version 2.43.0') &&
      oldGitRefusal.message.includes('2.44') &&
      oldGitRefusal.message.includes('"confinement": false'),
    `a partial clone under git 2.43 was not refused with the version and both ways out: ${oldGitRefusal?.message}`,
  );
  check(!fs.existsSync(oldGitPartial.fetchLog), 'a refused partial build under git 2.43 fetched from the remote');
  const failing = makeHistoryRepository('reach-unit-partial-pack');
  const failingPartial = partialCloneOf({ repository: failing.repository, env: {} }, 'blob:none', 'failing');
  const failingTemp = tempDir('reach-unit-partial-pack-temp');
  let refusal = null;
  if (hostSkipsLazyFetch()) {
    withGitWrapper('case " $* " in\n  *" pack-objects "*) echo "the case broke the pack" >&2; exit 1 ;;\nesac', failingTemp, () => {
      try {
        build(failingPartial, 'partial-failing');
      } catch (error) {
        refusal = error;
      }
    });
    check(
      refusal instanceof WorkspaceRefusal &&
        refusal.message.includes('rev-list') &&
        refusal.message.includes('pack-objects') &&
        refusal.message.includes('the case broke the pack'),
      `a failing pack over a partial clone did not refuse naming both stages and the cause: ${refusal?.message}`,
    );
    check(
      !git(failingPartial.repository, ['worktree', 'list', '--porcelain']).toString('utf8').includes('tea-evaluate-partial-failing'),
      'a refused partial build left a worktree registration',
    );
    // A stage a signal kills is named with the signal, and the status the supervisor reports is the shell's.
    const killedTemp = tempDir('reach-unit-partial-kill-temp');
    let killed = null;
    withGitWrapper('case " $* " in\n  *" pack-objects "*) kill -TERM $$ ;;\nesac', killedTemp, () => {
      try {
        build(failingPartial, 'partial-killed');
      } catch (error) {
        killed = error;
      }
    });
    check(
      killed instanceof WorkspaceRefusal &&
        killed.message.includes('git pack-objects was killed by SIGTERM') &&
        killed.message.includes('ended 143'),
      `a pack a signal killed did not refuse naming the stage and the signal: ${killed?.message}`,
    );
    check(
      fs.readdirSync(failingTemp).length === 0,
      `a refused partial build left ${JSON.stringify(fs.readdirSync(failingTemp))} in the temp directory`,
    );
  }

  // Every spelling git accepts for a true `promisor` marks a partial clone, so the build reads the project as a partial clone
  // (the git 2.43 refusal names it) and never as a full one.
  for (const [spelling, write] of [
    ['yes', (repository) => git(repository, ['config', 'remote.origin.promisor', 'yes'])],
    ['1', (repository) => git(repository, ['config', 'remote.origin.promisor', '1'])],
    ['on', (repository) => git(repository, ['config', 'remote.origin.promisor', 'on'])],
    ['a key with no value', (repository) => fs.appendFileSync(path.join(repository, '.git', 'config'), '[remote "origin"]\n\tpromisor\n')],
  ]) {
    const marked = makeHistoryRepository(`reach-unit-promisor-${spelling.replaceAll(/\W+/g, '-')}`);
    write(marked.repository);
    let marker = null;
    withGitWrapper('if [ "$1" = --version ]; then echo "git version 2.43.0"; exit 0; fi', null, () => {
      try {
        build(marked, 'promisor-spelling');
      } catch (error) {
        marker = error;
      }
    });
    check(
      marker instanceof WorkspaceRefusal && marker.message.includes('remote.origin.promisor is true'),
      `a promisor marker written as ${spelling} was not read as a partial clone: ${marker?.message ?? 'built'}`,
    );
  }

  // A folder whose name ends in " tree", present only in a later commit: the answers for the commits that lack it are
  // `<commit>:<path> missing`, and none of them is a tree.
  const spaced = makeHistoryRepository('reach-unit-spaced');
  const spacedFolder = path.join(spaced.repository, 'evals', 'my tree');
  fs.mkdirSync(spacedFolder, { recursive: true });
  fs.writeFileSync(path.join(spacedFolder, 'answers.txt'), 'SECRET-SPACED\n');
  git(spaced.repository, ['add', '--all']);
  git(spaced.repository, ['commit', '--quiet', '--message', 'a folder whose name ends in tree']);
  const spacedWorkspace = build({ repository: spaced.repository, folder: spacedFolder }, 'spaced');
  try {
    check(
      runConfined(
        spacedWorkspace,
        spacedFolder,
        'git show "HEAD:evals/my tree/answers.txt" 2>/dev/null | grep -c SECRET; git show HEAD:src/a.txt',
      ).stdout === '0\nsource a, changed\n',
      'a folder named "my tree" was readable through the target\'s git, or the build lost the rest of the tree',
    );
  } finally {
    removeWorkspace(spacedWorkspace);
  }

  // A confined run fetches nothing: the checkout of a revision whose objects a partial clone lacks is refused naming it, the
  // clone's head still builds, and the remote is never asked.
  for (const filter of hostSkipsLazyFetch() ? ['blob:none', 'tree:0'] : []) {
    const label = `historical-${filter.replace(':', '-')}`;
    const source = makeHistoryRepository(`reach-unit-${label}`);
    const partial = partialCloneOf({ repository: source.repository, env: {} }, filter, label);
    const old = git(partial.repository, ['rev-parse', 'HEAD~2']).toString('utf8').trim();
    let historical = null;
    try {
      createWorkspace({ root: partial.repository, kind: 'git', exclude: [partial.folder], label, commit: old, withholdHistory: true });
    } catch (error) {
      historical = error;
    }
    check(
      historical instanceof WorkspaceRefusal &&
        historical.message.includes(old) &&
        historical.message.includes('partial clone') &&
        historical.message.includes('"confinement": false'),
      `a confined checkout of ${old} in a ${filter} clone was not refused naming the revision: ${historical?.message ?? 'built'}`,
    );
    check(!fs.existsSync(partial.fetchLog), `the checkout of an older revision fetched from the remote of the ${filter} clone`);
    check(
      !git(partial.repository, ['worktree', 'list', '--porcelain']).toString('utf8').includes(`tea-evaluate-${label}`),
      `a refused checkout in a ${filter} clone left a worktree registration`,
    );
  }

  // The streaming reader holds one line at a time: with a heap of 48 MB it reads 2,000,000 commit ids and as many answers,
  // and 2,000,000 object ids, and keeps only what it is asked to.
  const stubs = tempDir('reach-unit-stream');
  fs.writeFileSync(
    path.join(stubs, 'git'),
    `#!/bin/sh\ncase " $* " in\n  *" rev-list "*)\n    exec awk 'BEGIN { for (i = 1; i <= 2000000; i++) printf "%040x\\n", i; print "?${'a'.repeat(40)}"; print "?${'b'.repeat(40)}" }'\n    ;;\n  *" cat-file "*)\n    exec awk '{ printf "%040x tree 0\\n", NR % 3 }'\n    ;;\nesac\nexit 2\n`,
    { mode: 0o755 },
  );
  const reader = path.join(PROJECT_ROOT, 'cli', 'lib', 'evaluate', 'git-lines.js');
  const stream = (job) =>
    spawnSync(process.execPath, ['--max-old-space-size=48', reader], {
      encoding: 'utf8',
      input: JSON.stringify(job),
      env: { ...BASE_ENV, PATH: `${stubs}${path.delimiter}${BASE_ENV.PATH}` },
      timeout: SPAWN_TIMEOUT_MS,
      killSignal: 'SIGKILL',
    });
  const missingRead = stream({ mode: 'missing', git: ['rev-list', '--objects', '--missing=print', 'HEAD'], keep: null });
  check(
    missingRead.status === 0 && missingRead.stdout === `${'a'.repeat(40)}\n${'b'.repeat(40)}\n`,
    `the streaming reader over 2,000,000 object ids ended ${missingRead.status} and printed ${JSON.stringify(missingRead.stdout.slice(0, 100))}: ${missingRead.stderr.slice(0, 200)}`,
  );
  const kept = stream({ mode: 'missing', git: ['rev-list', '--objects', '--missing=print', 'HEAD'], keep: ['b'.repeat(40)] });
  check(
    kept.status === 0 && kept.stdout === `${'b'.repeat(40)}\n`,
    `the streaming reader with a keep list printed ${JSON.stringify(kept.stdout)}`,
  );
  const treesRead = stream({ mode: 'trees', list: ['rev-list', 'HEAD'], ask: ['cat-file', '--batch-check'], path: 'evals/verdict' });
  check(
    treesRead.status === 0 && treesRead.stdout.split('\n').filter((line) => line !== '').length === 3,
    `the streaming reader over 2,000,000 commits ended ${treesRead.status} and printed ${JSON.stringify(treesRead.stdout.slice(0, 200))}: ${treesRead.stderr.slice(0, 200)}`,
  );
  const failedRead = spawnSync(process.execPath, [reader], {
    encoding: 'utf8',
    input: JSON.stringify({ mode: 'missing', git: ['unknown-command'], keep: null }),
    env: { ...BASE_ENV, PATH: `${stubs}${path.delimiter}${BASE_ENV.PATH}` },
  });
  check(
    failedRead.status === 2 && failedRead.stdout === '',
    `the streaming reader over a failing git ended ${failedRead.status} and printed ${JSON.stringify(failedRead.stdout)}`,
  );

  // A stage that dies partway fails the whole job and prints nothing, so a history read in part never reads as a whole.
  const dying = tempDir('reach-unit-dying');
  fs.writeFileSync(
    path.join(dying, 'git'),
    `#!/bin/sh\ncase " $* " in\n  *" rev-list "*)\n    if [ "$STUB_DIE" = list ]; then awk 'BEGIN { for (i = 1; i <= 1000; i++) printf "%040x\\n", i }'; exit 3; fi\n    if [ "$STUB_DIE" = listkill ]; then awk 'BEGIN { for (i = 1; i <= 1000; i++) printf "%040x\\n", i }'; kill -KILL $$; fi\n    exec awk 'BEGIN { for (i = 1; i <= 1000; i++) printf "%040x\\n", i }'\n    ;;\n  *" cat-file "*)\n    if [ "$STUB_DIE" = ask ]; then head -n 5 | awk '{ printf "%040x tree 0\\n", NR }'; exit 4; fi\n    if [ "$STUB_DIE" = askkill ]; then head -n 5 | awk '{ printf "%040x tree 0\\n", NR }'; kill -KILL $$; fi\n    exec awk '{ printf "%040x tree 0\\n", NR }'\n    ;;\nesac\nexit 2\n`,
    { mode: 0o755 },
  );
  for (const [who, expected, named] of [
    ['list', 3, 'git rev-list exited 3'],
    ['ask', 4, 'git cat-file exited 4'],
    ['listkill', 137, 'git rev-list was killed by SIGKILL'],
    ['askkill', 137, 'git cat-file was killed by SIGKILL'],
  ]) {
    const died = spawnSync(process.execPath, [reader], {
      encoding: 'utf8',
      input: JSON.stringify({ mode: 'trees', list: ['rev-list', 'HEAD'], ask: ['cat-file', '--batch-check'], path: 'evals/verdict' }),
      env: { ...BASE_ENV, STUB_DIE: who, PATH: `${dying}${path.delimiter}${BASE_ENV.PATH}` },
      timeout: 60_000,
      killSignal: 'SIGKILL',
    });
    check(
      died.status === expected && died.stdout === '' && died.stderr.includes(named),
      `the streaming reader over a ${who} that dies ended ${died.status}, printed ${JSON.stringify(died.stdout.slice(0, 80))} and said ${JSON.stringify(died.stderr.slice(0, 120))}; expected ${expected}, nothing and "${named}"`,
    );
  }
  // The same through a build: a commit list that fails refuses the workspace, and no folder tree goes unreplaced.
  const listing = makeHistoryRepository('reach-unit-listing');
  let listingRefusal = null;
  withGitWrapper(
    'case " $* " in\n  *" rev-list "*) case " $* " in\n    *--objects*) ;;\n    *) echo "rev-list broke" >&2; exit 1 ;;\n  esac ;;\nesac',
    null,
    () => {
      try {
        build(listing, 'listing');
      } catch (error) {
        listingRefusal = error;
      }
    },
  );
  check(
    listingRefusal instanceof WorkspaceRefusal && listingRefusal.message.includes('rev-list'),
    `a failing commit list did not refuse the workspace: ${listingRefusal?.message}`,
  );

  // Every walk of the history that grows with it goes through the streaming reader, not a buffered `runGit`.
  const source = fs.readFileSync(path.join(PROJECT_ROOT, 'cli', 'lib', 'evaluate', 'workspace.js'), 'utf8');
  const treesBody = source.slice(source.indexOf('function treesAtPath('), source.indexOf('function tagsWithin('));
  check(
    treesBody.includes("mode: 'trees'") && !/\brunGit\(/.test(treesBody),
    "treesAtPath no longer reads the history's commits and trees through the streaming reader",
  );
  check(
    source.includes("mode: 'missing'") && source.includes("mode: 'pack'") && source.includes("mode: 'reached'"),
    "the build no longer reads the store walk, the folder's objects and a partial clone's pack through the streaming reader",
  );

  // A pack job's revisions travel on standard input, so a history with thousands of tags and folder trees is no argument
  // vector's problem, and a pack that dies early ends the job at once with its own status.
  const packers = tempDir('reach-unit-pack');
  fs.writeFileSync(
    path.join(packers, 'git'),
    `#!/bin/sh\ncase " $* " in\n  *" rev-list "*)\n    cat >/dev/null\n    exec awk 'BEGIN { for (i = 1; i <= 2000000; i++) printf "%040x\\n", i }'\n    ;;\n  *" pack-objects "*)\n    if [ -n "$STUB_PACK_FAIL" ]; then echo "pack-objects broke" >&2; exit 3; fi\n    if [ -n "$STUB_PACK_KILL" ]; then kill -TERM $$; fi\n    exec cat >/dev/null\n    ;;\nesac\nexit 2\n`,
    { mode: 0o755 },
  );
  const manyRevs = Array.from({ length: 20_000 }, (_, index) => `^${index.toString(16).padStart(40, '0')}`);
  for (const [label, env, expected, named] of [
    ['a pack of 20,000 revisions', {}, 0, ''],
    ['a pack that fails early', { STUB_PACK_FAIL: '1' }, 3, 'git pack-objects exited 3'],
    ['a pack a signal kills', { STUB_PACK_KILL: '1' }, 143, 'git pack-objects was killed by SIGTERM'],
  ]) {
    const packed = spawnSync(process.execPath, [reader], {
      encoding: 'utf8',
      input: JSON.stringify({ mode: 'pack', list: ['rev-list', '--objects', '--stdin'], pack: ['pack-objects', 'out'], revs: manyRevs }),
      env: { ...BASE_ENV, ...env, PATH: `${packers}${path.delimiter}${BASE_ENV.PATH}` },
      timeout: 60_000,
      killSignal: 'SIGKILL',
    });
    check(
      packed.status === expected && packed.stderr.includes(named),
      `the streaming reader over ${label} ended ${packed.status} ${packed.error?.code ?? ''}; expected ${expected} and "${named}": ${packed.stderr.slice(0, 200)}`,
    );
  }

  // A withheld path with a non-ASCII name: the folder is found at the commit that tracks it, and one removed from the index
  // but still in the history is withheld there.
  const unicode = makeHistoryRepository('reach-unit-unicode');
  const accented = path.join(unicode.repository, 'évaluation');
  fs.mkdirSync(accented);
  fs.writeFileSync(path.join(accented, 'answers.txt'), 'SECRET-ANSWER\n');
  git(unicode.repository, ['add', '--all']);
  git(unicode.repository, ['commit', '--quiet', '--message', 'accented folder']);
  const accentedWorkspace = build({ repository: unicode.repository, folder: accented }, 'unicode-tracked');
  try {
    check(
      runConfined(accentedWorkspace, accented, 'git show HEAD:évaluation/answers.txt 2>/dev/null | grep -c SECRET; git show HEAD:src/a.txt')
        .stdout === '0\nsource a, changed\n',
      "a folder with a non-ASCII name was readable through the target's git, or the build lost the rest of the tree",
    );
  } finally {
    removeWorkspace(accentedWorkspace);
  }
  git(unicode.repository, ['rm', '--quiet', '--cached', '-r', 'évaluation']);
  fs.writeFileSync(path.join(unicode.repository, '.gitignore'), 'évaluation/\n');
  git(unicode.repository, ['add', '--all']);
  git(unicode.repository, ['commit', '--quiet', '--message', 'untrack the accented folder']);
  check(
    git(unicode.repository, ['show', 'HEAD~1:évaluation/answers.txt']).toString('utf8') === 'SECRET-ANSWER\n',
    'the project itself cannot read the untracked accented folder from its history, so the case below proves nothing',
  );
  const removedWorkspace = build({ repository: unicode.repository, folder: accented }, 'unicode-removed');
  try {
    const removed = runConfined(
      removedWorkspace,
      accented,
      'git cat-file -t HEAD~1:évaluation; git ls-tree -r HEAD~1:évaluation | wc -l | tr -d " "; git show HEAD~1:évaluation/answers.txt 2>/dev/null | grep -c SECRET',
    );
    check(
      removed.stdout === 'tree\n0\n0\n',
      `a folder with a non-ASCII name that the index no longer tracks was readable in the history through the target's git: ${JSON.stringify(removed)}`,
    );
  } finally {
    removeWorkspace(removedWorkspace);
  }
}

/** The reference names each platform's mechanism under its exact heading, and what an opted-out run records (Story 1.31). */
function checkConfinementReference() {
  const reference = fs.readFileSync(path.join(PROJECT_ROOT, 'docs', 'reference', 'tea-evaluate-cli.md'), 'utf8');
  const heading = '### File-system confinement\n';
  const start = reference.indexOf(heading);
  const section = start === -1 ? '' : reference.slice(start + heading.length, reference.indexOf('\n## ', start));
  check(start !== -1, 'the reference has no "### File-system confinement" section');
  check(
    /^- macOS: Seatbelt, through `\/usr\/bin\/sandbox-exec`/m.test(section),
    "the reference's confinement section does not name macOS's mechanism, Seatbelt through sandbox-exec",
  );
  check(
    /^- Linux: Bubblewrap, through `bwrap`/m.test(section),
    "the reference's confinement section does not name Linux's mechanism, Bubblewrap through bwrap",
  );
  check(section.includes('"confinement": "opt-out"'), "the reference's confinement section does not say what an opted-out run records");
  // The git history is withheld (Story 1.57): the passage saying it stays readable is gone, and the section says what replaces it.
  check(
    !/git directory included/.test(section) &&
      !/still reads the committed contract/.test(section) &&
      !/against the commit still reads/.test(section),
    "the reference's confinement section still says the project's git history stays readable",
  );
  check(
    section.includes("user's private root directory") && section.includes('connect to a unix socket'),
    "the reference's confinement section does not say the confinement withholds the user's private root directory",
  );
  check(
    section.includes('with the evaluation folder as an empty tree') &&
      section.includes("the project's git directory is withheld") &&
      /a target that must read the project's git directory opts out/i.test(section),
    "the reference's confinement section does not say the target's git sees the evaluation folder as an empty tree, that the project's git directory is withheld and that a target that must read it opts out",
  );
  // Story 1.80: the three limits the withheld repository had are gone, and the section says what replaces each.
  check(
    !/no branches or tags/.test(section) &&
      !/six million objects/.test(section) &&
      !/A project that is a partial clone[^\n]*is refused/.test(section) &&
      !/Five limits apply/.test(section) &&
      /^ {2}Two limits apply\.$/m.test(section),
    "the reference's confinement section still lists the partial-clone, tag or very-large-history limit, or does not count the two limits that remain",
  );
  check(
    section.includes('A project cloned with a promisor remote') &&
      section.includes('no process of a confined run fetches from the remote') &&
      section.includes('lists the tags of your project that point into the evaluated commit') &&
      section.includes('reads every walk that grows with the history as a stream') &&
      section.includes('a driver whose name holds a space and a `required` written with no value') &&
      section.includes('an older git makes a partial-clone project exit 12, with the way out named'),
    "the reference's confinement section does not say a promisor-remote project runs without a fetch, that the target's git lists the project's tags, that the history is read as a stream and that a filter driver's whole configuration is carried",
  );
  // Story 1.85: a sparse-checkout project shows the target the project's status.
  check(
    section.includes(
      "(`git sparse-checkout set` in cone mode or with a pattern list, a sparse index, and a clone made with `--sparse`) shows the target the project's status",
    ) &&
      section.includes('the private repository carries `core.sparseCheckout` and `core.sparseCheckoutCone`') &&
      section.includes('marks every tracked file outside the cone as skip-worktree') &&
      section.includes(
        "The target's `git status` lists no deletion, `git ls-files` lists the files outside the cone, and `git sparse-checkout list` prints your patterns.",
      ) &&
      section.includes('A project that is not sparse keeps the index it has'),
    "the reference's confinement section does not say a sparse-checkout project shows the target the project's status (no deletion, the files outside the cone listed, the cone's patterns) and that a project that is not sparse keeps its index",
  );
  // Story 1.59: the one private home a confined trial may write, and the variables that name it.
  check(
    section.includes('one private home directory') &&
      section.includes('a login an agent stored under your real home is not found under the private home') &&
      ['`HOME`', '`XDG_CONFIG_HOME`', '`XDG_CACHE_HOME`', '`XDG_DATA_HOME`'].every((name) => section.includes(name)) &&
      section.includes("replace any host value, including one a registry entry's `environmentKeys` names") &&
      section.includes('each independent arm or leg starts with an empty home') &&
      section.includes('reads and writes its own home and nothing else under the root') &&
      section.includes('A run that opts out of confinement keeps the host environment and makes no home'),
    "the reference's confinement section does not say a confined trial gets a private home that HOME and the XDG base directories name, over any host value, empty for the next trial, and that an opt-out run has none",
  );
  // Story 1.60: the audit is the mechanism's, for every process, and the passages that said only Node processes write it are gone.
  check(
    section.includes('through the mechanism itself and for every process the target starts, whatever its language or environment') &&
      section.includes('`/usr/bin/log stream`') &&
      section.includes('`strace -f --seccomp-bpf --decode-pids=pidns`') &&
      section.includes('no code runs inside the target') &&
      section.includes('cannot confirm itself stops the command with exit 12') &&
      section.includes('`io_uring`') &&
      section.includes("the kernel's reports are lossy") &&
      !/covers Node processes alone/.test(section) &&
      !/the one file of the audit a target may write/.test(section) &&
      !/Every Node process of the trial loads/.test(section) &&
      !section.includes('confinement-guard') &&
      !section.includes('NODE_OPTIONS'),
    "the reference's confinement section does not say the audit is the mechanism's for every process of the target (the log stream on macOS, strace on Linux, no code in the target, exit 12 for an observer that cannot confirm itself, what it does not see), or still describes the Node preload and its report file",
  );
  // Story 1.81: macOS reports are lossy, with the measurements, and the run records how much each trial lost.
  check(
    section.includes("the kernel's reports are lossy: the log lost none of 3,000 reports at a quiet host's 440 a second") &&
      section.includes('one to five of 1,600 on a host saturated by other work') &&
      section.includes('7 to 20 percent of a burst of 40,000 a second') &&
      section.includes("`run.json`'s `observedMountsChannel`") &&
      [
        '`conditionArm`',
        '`trialIndex`',
        '`canariesSent`',
        '`canariesDelivered`',
        '`logReportedLoss`',
        '`completeness`',
        '`complete`',
        '`lossy`',
      ].every((name) => section.includes(name)) &&
      section.includes('every 50 ms') &&
      section.includes('a single report of the target can still drop between two canaries') &&
      section.includes('The summary line of `run` names every `lossy` trial') &&
      section.includes('Every Linux trial records `complete` with no canary sent') &&
      !section.includes('No run records the loss yet') &&
      !section.includes('Story 1.81 adds'),
    "the reference's confinement section does not state that macOS reports are lossy with the measurements, name the `observedMountsChannel` field of run.json with its entries and the 50 ms canary, say the summary names each lossy trial and a Linux trial is complete with no canary, or still says no run records the loss",
  );
}

/**
 * The bridge passage of the reference, read under its exact heading, states that the confinement withholds the run's private
 * directories, so the token is unreadable to a confined target, and the sentence saying a target can read it is gone (Story 1.58).
 */
function checkBridgeTokenReference() {
  const reference = fs.readFileSync(path.join(PROJECT_ROOT, 'docs', 'reference', 'tea-evaluate-cli.md'), 'utf8');
  const heading = "#### The bridge's admission token\n";
  const start = reference.indexOf(heading);
  const layer = reference.indexOf('\n### The evaluation layer\n');
  const end = start === -1 ? -1 : reference.slice(start + heading.length).search(/\n#{1,4} /);
  const passage = start === -1 ? '' : reference.slice(start + heading.length, end === -1 ? undefined : start + heading.length + end);
  check(start !== -1, `the reference has no "${heading.trim()}" section`);
  const layerEnd = layer === -1 ? -1 : reference.indexOf('\n### ', layer + 1);
  check(
    layer !== -1 && start > layer && (layerEnd === -1 || start < layerEnd),
    `the reference's "${heading.trim()}" section is not under "### The evaluation layer"`,
  );
  check(
    passage.includes("The confinement withholds the run's private directories from every target") &&
      passage.includes('the token is unreadable to a confined target') &&
      passage.includes('one private parent directory') &&
      passage.includes('one private root') &&
      passage.includes('SIGKILL') &&
      passage.includes('connection to a unix socket'),
    "the reference's bridge passage does not state that the confinement withholds the run's private directories, so the token is unreadable to a confined target",
  );
  check(
    !/can read that token before the agent connects/.test(reference) && !/private directory lies outside it/.test(reference),
    'the reference still says a confined target can read the bridge token',
  );
}

// ---------------------------------------------------------------- Story 1.63: no route to the host's abstract sockets

/** Prints that a case that needs another host did not run, naming why, so a skipped case is never mistaken for a passing one. */
function skipCase(label, reason) {
  console.log(`  skipped the ${label} case: ${reason}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The directories of cases whose Unix sockets need a short path (a socket path holds about 100 bytes), removed when the suite ends. */
const socketDirectories = [];

/** A directory under `/tmp` for a Unix socket: the suite's own scratch directories are too deep for a socket path on macOS. */
function socketDirectory() {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join('/tmp', 'tea-bs-')));
  socketDirectories.push(directory);
  return directory;
}

/**
 * What a bridge socket yields for `payload`: every byte until the bridge closes the connection, or until `until` text has
 * arrived, or `ms` pass. The client ends its side when the bridge ends its own, so a refusal closes at once.
 */
function exchange(socketPath, payload, { end = false, until = null, ms = 3000 } = {}) {
  return new Promise((resolve) => {
    const socket = net.connect({ path: socketPath, allowHalfOpen: true });
    const chunks = [];
    const text = () => Buffer.concat(chunks).toString('utf8');
    const done = () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(text());
    };
    const timer = setTimeout(done, ms);
    socket.on('data', (chunk) => {
      chunks.push(chunk);
      if (until !== null && text().length >= until.length) done();
    });
    socket.on('end', () => socket.end());
    socket.on('close', done);
    socket.on('error', (error) => {
      chunks.push(Buffer.from(`<${error.code}>`));
      done();
    });
    socket.on('connect', () => {
      socket.write(payload);
      if (end) socket.end();
    });
  });
}

/**
 * A loopback TCP server that echoes what it reads and counts the connections it accepted. With `shortPort` its port has four
 * digits (a port above 1023 needs no privilege), so a line that writes it with a leading zero is still a line of five digits.
 */
async function listenEchoing(host = '127.0.0.1', { shortPort = false } = {}) {
  const server = net.createServer((socket) => {
    server.accepted += 1;
    server.sockets.add(socket);
    socket.once('close', () => server.sockets.delete(socket));
    socket.on('error', () => {});
    socket.pipe(socket);
  });
  server.accepted = 0;
  server.sockets = new Set();
  const listenOn = (port) =>
    new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.off('error', reject);
        resolve();
      });
    });
  for (let attempt = 0; shortPort && attempt < 50; attempt += 1) {
    try {
      await listenOn(2000 + Math.floor(Math.random() * 8000));
      return server;
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
    }
  }
  await listenOn(0);
  return server;
}

/** Closes a server and every connection it holds, which `net.Server` does not do on its own. */
function closeServer(server) {
  return new Promise((resolve) => {
    server.close(resolve);
    for (const socket of server.sockets ?? []) socket.destroy();
    server.closeAllConnections?.();
  });
}

/**
 * The status shim started with `--bridge` in `directory`, its target a Node program (a process that idles until it is
 * signalled by default). Resolves once the shim's socket exists, with the child and what it ended with.
 */
async function startBridgeShim(directory, { target = [process.execPath, '-e', 'setInterval(() => {}, 1000)'] } = {}) {
  const bridge = path.join(directory, 'bridge.sock');
  const status = path.join(directory, 'status.json');
  const child = spawn(process.execPath, [CONFINEMENT_STATUS, '--bridge', bridge, status, ...target], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr += chunk));
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal, stderr })));
  const deadline = Date.now() + 10_000;
  while (!fs.existsSync(bridge) && Date.now() < deadline && child.exitCode === null) await sleep(25);
  return { child, bridge, status, exited };
}

/**
 * The bridge half of the status shim (Story 1.63), driven over Unix sockets with no Bubblewrap on any host: a valid first
 * line is answered `ok` and the bytes that follow it in the same write reach the port and come back; every refusal of the
 * matrix (a host outside the loopback names, a port that is no decimal number from 1 to 65535, a missing newline, an oversized
 * line, a line that never arrives) is answered `fail` with no outbound connection, which a counting server shows, and a port
 * nothing listens on is `fail` too; the listener ends with the target on every path (an exit, a signal, a bridge that cannot
 * listen) and the socket is removed, the target's exit code and the status file as before; the argument parser keeps the
 * status file and the target apart from the option.
 */
async function checkBridgeShim() {
  const counting = await listenEchoing('127.0.0.1', { shortPort: true });
  const countedPort = counting.address().port;
  const directory = socketDirectory();
  const shims = [];
  /** A shim of this case; every one is ended however the case ends, so no idle target keeps the suite running. */
  const shimmed = async (where, options) => {
    const started = await startBridgeShim(where, options);
    shims.push(started);
    return started;
  };
  /** The first `length` bytes a connection yields after it sends `payload`, or what it had at `ms`. */
  const answerTo = (socketPath, payload, length) =>
    new Promise((resolve) => {
      const socket = net.connect({ path: socketPath, allowHalfOpen: true });
      let received = '';
      const done = () => {
        clearTimeout(timer);
        resolve({ received, socket });
      };
      const timer = setTimeout(done, 3000);
      socket.on('data', (chunk) => {
        received += chunk;
        if (received.length >= length) done();
      });
      socket.on('error', done);
      socket.on('connect', () => payload(socket));
    });
  const ipv6 = Object.values(os.networkInterfaces())
    .flat()
    .some((address) => address?.address === '::1');
  const counting6 = ipv6 ? await listenEchoing('::1') : null;
  try {
    const shim = await shimmed(directory);
    check(
      shim.child.exitCode === null && fs.existsSync(shim.bridge),
      `the shim with --bridge made no socket at ${shim.bridge}: ${JSON.stringify(await Promise.race([shim.exited, sleep(100)]))}`,
    );
    const started = fs.existsSync(shim.status) ? readJson(shim.status) : null;
    check(started?.started === true, `the shim with --bridge wrote the status ${JSON.stringify(started)}; expected the start mark`);

    // The bytes after the first line go to the port: the echo server returns them.
    const answered = await exchange(shim.bridge, `127.0.0.1 ${countedPort}\nping`, { until: 'ok\nping' });
    check(answered === 'ok\nping', `a valid first line with bytes after it was answered ${JSON.stringify(answered)}; expected "ok\\nping"`);
    check(counting.accepted === 1, `the valid line made ${counting.accepted} connection(s) to the port; expected 1`);
    const named = await exchange(shim.bridge, `localhost ${countedPort}\n`, { until: 'ok\n' });
    check(
      named === 'ok\n' && counting.accepted === 2,
      `"localhost <port>" was answered ${JSON.stringify(named)} after ${counting.accepted} connection(s)`,
    );
    if (counting6 === null) {
      skipCase('IPv6 loopback bridge line', 'this host has no ::1 address');
    } else {
      const sixth = await exchange(shim.bridge, `::1 ${counting6.address().port}\nping`, { until: 'ok\nping' });
      check(
        sixth === 'ok\nping' && counting6.accepted === 1,
        `"::1 <port>" was answered ${JSON.stringify(sixth)} after ${counting6.accepted} connection(s)`,
      );
    }
    // The first line arrives in two writes.
    const split = await answerTo(
      shim.bridge,
      (socket) => {
        socket.write('127.0.0.1 ');
        setTimeout(() => socket.write(`${countedPort}\n`), 50);
      },
      3,
    );
    split.socket.destroy();
    check(split.received === 'ok\n', `a first line sent in two writes was answered ${JSON.stringify(split.received)}; expected "ok\\n"`);
    const accepted = counting.accepted;

    // Refused lines: each is answered `fail`, the connection ends, and the counting server saw nothing more.
    const filler = 'x'.repeat(100);
    for (const [label, payload, end] of [
      ['a host that is no loopback name (127.0.0.2)', `127.0.0.2 ${countedPort}\n`, false],
      ['a mapped IPv4 address', `::ffff:127.0.0.1 ${countedPort}\n`, false],
      ['the wildcard address', `0.0.0.0 ${countedPort}\n`, false],
      ['a name that resolves to the loopback', `localhost.localdomain ${countedPort}\n`, false],
      ['an empty host', ` ${countedPort}\n`, false],
      ['a port that is not a number', '127.0.0.1 http\n', false],
      ['a port with a letter after its digits', `127.0.0.1 ${countedPort}x\n`, false],
      ['port zero', '127.0.0.1 0\n', false],
      ['a port with a leading zero', `127.0.0.1 0${countedPort}\n`, false],
      ['port 65536', '127.0.0.1 65536\n', false],
      ['port 99999', '127.0.0.1 99999\n', false],
      ['a port with a sign', `127.0.0.1 +${countedPort}\n`, false],
      ['two spaces between the fields', `127.0.0.1  ${countedPort}\n`, false],
      ['a carriage return before the newline', `127.0.0.1 ${countedPort}\r\n`, false],
      ['a third field', `127.0.0.1 ${countedPort} extra\n`, false],
      ['the host alone', '127.0.0.1\n', false],
      ['no newline before the sender closes', `127.0.0.1 ${countedPort}`, true],
      ['an oversized line with no newline', filler, false],
      ['an oversized line with its newline', `127.0.0.1 ${countedPort}${' '.repeat(100)}\n`, false],
      ['an empty line', '\n', false],
    ]) {
      const refused = await exchange(shim.bridge, payload, { end });
      check(refused === 'fail\n', `${label} was answered ${JSON.stringify(refused)}; expected "fail\\n"`);
    }
    // A first line that never completes is refused at the listener's ceiling.
    const silent = await exchange(shim.bridge, '127.0.0.1 ', { ms: 9000 });
    check(
      silent === 'fail\n',
      `a first line that never completed was answered ${JSON.stringify(silent)}; expected "fail\\n" at the line's ceiling (5 s)`,
    );
    check(
      counting.accepted === accepted,
      `${counting.accepted - accepted} refused line(s) made an outbound connection to the port the line named`,
    );
    const free = await new Promise((resolve) => {
      const probe = net.createServer();
      probe.listen(0, '127.0.0.1', () => {
        const { port } = probe.address();
        probe.close(() => resolve(port));
      });
    });
    const closed = await exchange(shim.bridge, `127.0.0.1 ${free}\n`);
    check(closed === 'fail\n', `a port nothing listens on was answered ${JSON.stringify(closed)}; expected "fail\\n"`);

    // A connection held open is closed when the target ends, and the shim ends as a signalled child does.
    const held = await answerTo(shim.bridge, (socket) => socket.write(`127.0.0.1 ${countedPort}\n`), 3);
    check(held.received === 'ok\n', `a connection held open was answered ${JSON.stringify(held.received)}; expected "ok\\n"`);
    const heldClosed = new Promise((resolve) => {
      held.socket.once('end', () => resolve(true));
      held.socket.once('close', () => resolve(true));
    });
    shim.child.kill('SIGTERM');
    const ended = await Promise.race([shim.exited, sleep(10_000).then(() => null)]);
    check(
      ended !== null && ended.signal === 'SIGTERM' && readJson(shim.status).signal === 'SIGTERM',
      `a shim whose target was ended by SIGTERM ended as ${JSON.stringify(ended)} with the status ${JSON.stringify(fs.existsSync(shim.status) ? readJson(shim.status) : null)}`,
    );
    check(
      (await Promise.race([heldClosed, sleep(3000).then(() => false)])) === true,
      'a held bridge connection was still open after the shim ended',
    );
    check(!fs.existsSync(shim.bridge), 'the shim left its socket behind after its target was signalled');
    held.socket.destroy();

    // A target that exits by itself: its code is the shim's, the status file holds the start mark alone, the socket is gone,
    // and a connection the listener holds keeps the shim alive for the drain deadline (2 s) at most.
    const exitBegan = Date.now();
    const exiting = await shimmed(socketDirectory(), {
      target: [process.execPath, '-e', 'setTimeout(() => process.exit(7), 700)'],
    });
    const through = await answerTo(exiting.bridge, (socket) => socket.write(`127.0.0.1 ${countedPort}\n`), 3);
    check(
      through.received === 'ok\n',
      `a connection held through a shim whose target exits was answered ${JSON.stringify(through.received)}`,
    );
    const exitedAs = await Promise.race([exiting.exited, sleep(10_000).then(() => null)]);
    check(
      exitedAs !== null && exitedAs.code === 7 && exitedAs.signal === null && Date.now() - exitBegan < 7000,
      `a shim whose target exited 7 ended as ${JSON.stringify(exitedAs)} after ${Date.now() - exitBegan} ms; expected exit 7 within the target's time and the 2 s a spliced connection may drain`,
    );
    check(
      JSON.stringify(readJson(exiting.status)) === JSON.stringify({ started: true }) && !fs.existsSync(exiting.bridge),
      `a shim whose target exited left the status ${JSON.stringify(fs.existsSync(exiting.status) ? readJson(exiting.status) : null)} and ${fs.existsSync(exiting.bridge) ? 'its socket' : 'no socket'}; expected the start mark and no socket`,
    );
    through.socket.destroy();

    // A target that cannot start: the bridge is closed with it and the shim ends 127, as without a bridge.
    const absent = await shimmed(socketDirectory(), { target: ['/nonexistent/tea-target'] });
    const absentEnded = await Promise.race([absent.exited, sleep(10_000).then(() => null)]);
    check(
      absentEnded?.code === 127 && !fs.existsSync(absent.bridge),
      `a shim whose target does not exist ended as ${JSON.stringify(absentEnded)} with ${fs.existsSync(absent.bridge) ? 'its socket left' : 'no socket'}; expected 127 and no socket`,
    );

    // A bridge that cannot listen ends the shim before the target runs, its reason on standard error.
    const marker = path.join(tempDir('bridge-shim-marker'), 'target-ran');
    const unlistened = spawnSync(
      process.execPath,
      [
        CONFINEMENT_STATUS,
        '--bridge',
        path.join(directory, 'missing', 'bridge.sock'),
        path.join(directory, 'unlistened-status.json'),
        process.execPath,
        '-e',
        `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`,
      ],
      { encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS },
    );
    check(
      unlistened.status === 126 && unlistened.stderr.includes('bridge ') && !fs.existsSync(marker),
      `a shim whose bridge cannot listen ended ${unlistened.status} (target ran: ${fs.existsSync(marker)}): ${unlistened.stderr}`,
    );

    // The runtime's half keeps its own copy of the hosts the shim connects to; the two lists must not drift.
    const listed = /const BRIDGE_HOSTS = Object\.freeze\(\[([^\]]*)\]\)/.exec(fs.readFileSync(CONFINEMENT_STATUS, 'utf8'));
    const shimHosts = listed === null ? [] : [...listed[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
    check(
      JSON.stringify([...shimHosts].sort()) === JSON.stringify([...BRIDGE_HOSTS].sort()) && shimHosts.length > 0,
      `the shim connects to ${JSON.stringify(shimHosts)} and the runtime forwards for ${JSON.stringify(BRIDGE_HOSTS)}`,
    );
  } finally {
    for (const started of shims) {
      if (started.child.exitCode === null && started.child.signalCode === null) {
        started.child.kill('SIGTERM');
        await Promise.race([started.exited, sleep(5000)]);
        if (started.child.exitCode === null && started.child.signalCode === null) started.child.kill('SIGKILL');
      }
    }
    await closeServer(counting);
    if (counting6 !== null) await closeServer(counting6);
  }
}

/**
 * Reads everything a connection through a bridge yields once `host port` is asked: the bytes after the bridge's `ok`, how many
 * of them and whether the answer was `ok`. The reader pauses between chunks when `slow`, so what the bridge holds back from a
 * slow reader is what it has to deliver once the target is gone. With `halfClose` the client ends its side after `request`.
 */
function throughBridge(socketPath, port, { request = '', halfClose = false, slow = false, ms = 20_000 } = {}) {
  return new Promise((resolve) => {
    const socket = net.connect({ path: socketPath, allowHalfOpen: true });
    let head = '';
    let answered = false;
    let bytes = 0;
    let sample = '';
    const done = () => {
      clearTimeout(timer);
      socket.destroy();
      resolve({ answered, bytes, head, sample });
    };
    const timer = setTimeout(done, ms);
    socket.on('connect', () => {
      socket.write(`127.0.0.1 ${port}\n${request}`);
      if (halfClose) socket.end();
    });
    socket.on('data', (chunk) => {
      let body = chunk;
      if (!answered) {
        head += chunk.toString('latin1');
        const newline = head.indexOf('\n');
        if (newline === -1) return;
        answered = head.slice(0, newline) === 'ok';
        body = Buffer.from(head.slice(newline + 1), 'latin1');
        if (!answered) return done();
      }
      bytes += body.length;
      if (sample.length < 16) sample += body.toString('latin1', 0, 16);
      if (slow) {
        socket.pause();
        setTimeout(() => socket.resume(), 5);
      }
    });
    socket.on('end', done);
    socket.on('error', done);
  });
}

/** A Node server program for a shim's target: answers each connection as `behavior` says and prints its port to `portFile`. */
function targetServer(portFile, behavior) {
  return [
    process.execPath,
    '-e',
    `
    const net = require('node:net');
    const fs = require('node:fs');
    const body = Buffer.alloc(4 * 1024 * 1024, 'x');
    const behavior = ${JSON.stringify(behavior)};
    const server = net.createServer((socket) => {
      socket.on('error', () => {});
      if (behavior === 'end-then-exit') {
        socket.on('finish', () => process.exit(0));
        socket.end(body);
      } else if (behavior === 'reply-after-end') {
        socket.on('data', () => {});
        socket.on('end', () => socket.end(body));
      } else if (behavior === 'reset') {
        socket.resetAndDestroy();
      }
    });
    server.listen(0, '127.0.0.1', () => fs.writeFileSync(${JSON.stringify(portFile)}, String(server.address().port)));
  `,
  ];
}

/** Waits for a port file a target program writes, and returns the port. */
async function portFrom(file) {
  const deadline = Date.now() + 10_000;
  while (!fs.existsSync(file) && Date.now() < deadline) await sleep(20);
  return fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8')) : 0;
}

/**
 * What the bridge's two halves carry and when they let go (Story 1.63), over Unix sockets on every host. Through the shim: a
 * target that writes a 4 MiB body, ends and exits at once still delivers every byte (the listener drains the spliced
 * connection and cuts it only at its deadline); a client that writes, half-closes and reads slowly receives all 4 MiB of the
 * answer; an upstream that resets after the bridge's `ok` ends the connection without a `fail` among its bytes; a client that
 * goes before the upstream connects leaves no connection on the port; a refused line's connection is cut within about a
 * second when its client never ends its side. The connect ceiling (`BRIDGE_CONNECT_MS`) has no case: a connection that
 * hangs needs a route that drops packets, which no loopback gives portably.
 */
async function checkBridgeShimStreams() {
  const SIZE = 4 * 1024 * 1024;
  const shims = [];
  const shimmed = async (where, options) => {
    const started = await startBridgeShim(where, options);
    shims.push(started);
    return started;
  };
  try {
    // A target that ends a 4 MiB body and exits.
    const endingDirectory = socketDirectory();
    const ending = await shimmed(endingDirectory, { target: targetServer(path.join(endingDirectory, 'port'), 'end-then-exit') });
    const endingPort = await portFrom(path.join(endingDirectory, 'port'));
    const fetched = await throughBridge(ending.bridge, endingPort);
    check(
      fetched.answered && fetched.bytes === SIZE,
      `a target that ended a ${SIZE}-byte body and exited delivered ${fetched.bytes} byte(s) through the bridge (answered: ${fetched.answered})`,
    );
    const endingExit = await Promise.race([ending.exited, sleep(10_000).then(() => null)]);
    check(
      endingExit !== null && endingExit.code === 0,
      `the shim of a target that ended its answer ended as ${JSON.stringify(endingExit)}; expected exit 0`,
    );

    // A client that writes, half-closes and reads slowly.
    const replyDirectory = socketDirectory();
    const replying = await shimmed(replyDirectory, { target: targetServer(path.join(replyDirectory, 'port'), 'reply-after-end') });
    const replyPort = await portFrom(path.join(replyDirectory, 'port'));
    const replied = await throughBridge(replying.bridge, replyPort, { request: 'go', halfClose: true, slow: true });
    check(
      replied.answered && replied.bytes === SIZE,
      `a client that half-closed and read slowly received ${replied.bytes} of ${SIZE} byte(s) (answered: ${replied.answered})`,
    );

    // An upstream that resets the connection after the bridge's ok: no `fail` among the bytes the client reads.
    const resetDirectory = socketDirectory();
    const resetting = await shimmed(resetDirectory, { target: targetServer(path.join(resetDirectory, 'port'), 'reset') });
    const resetPort = await portFrom(path.join(resetDirectory, 'port'));
    const reset = await throughBridge(resetting.bridge, resetPort, { ms: 5000 });
    check(
      !reset.head.includes('fail') && reset.bytes === 0,
      `an upstream that reset the connection after the bridge's ok left the client ${JSON.stringify(reset.head)} and ${reset.bytes} byte(s); expected no fail`,
    );

    // A client that goes before the upstream connects leaves nothing connected on the port, and the shim goes on serving.
    const holder = await listenEchoing();
    try {
      const early = net.connect({ path: ending.bridge });
      early.on('error', () => {});
      const goneDirectory = socketDirectory();
      const serving = await shimmed(goneDirectory);
      const gone = net.connect({ path: serving.bridge });
      gone.on('error', () => {});
      gone.write(`127.0.0.1 ${holder.address().port}\n`);
      gone.destroy();
      early.destroy();
      await sleep(600);
      check(
        holder.sockets.size === 0,
        `a client that left before the upstream connected left ${holder.sockets.size} connection(s) on the port`,
      );
      const after = await exchange(serving.bridge, `127.0.0.1 ${holder.address().port}\n`, { until: 'ok\n' });
      check(after === 'ok\n', `the shim answered ${JSON.stringify(after)} after a client left early; expected "ok\\n"`);
    } finally {
      await closeServer(holder);
    }

    // A refused line whose client never ends its own side is cut about a second later: a write after that meets a closed peer.
    const cutDirectory = socketDirectory();
    const cutting = await shimmed(cutDirectory);
    const cut = await new Promise((resolve) => {
      const socket = net.connect({ path: cutting.bridge, allowHalfOpen: true });
      let ended = false;
      const result = (value) => {
        clearTimeout(timer);
        socket.destroy();
        resolve(value);
      };
      const timer = setTimeout(() => result('held'), 4000);
      socket.on('connect', () => socket.write('not a line\n'));
      socket.on('data', () => {});
      socket.on('end', () => {
        ended = true;
        setTimeout(() => socket.write('x'), 1600);
        setTimeout(() => socket.write('y'), 1900);
      });
      socket.on('error', () => result(ended ? 'cut' : 'error before the answer'));
      socket.on('close', () => result(ended ? 'cut' : 'closed before the answer'));
    });
    check(
      cut === 'cut',
      `a refused line whose client never ended its side was ${JSON.stringify(cut)}; expected the connection cut within about 2 s`,
    );
  } finally {
    for (const started of shims) {
      if (started.child.exitCode === null && started.child.signalCode === null) {
        started.child.kill('SIGTERM');
        await Promise.race([started.exited, sleep(5000)]);
        if (started.child.exitCode === null && started.child.signalCode === null) started.child.kill('SIGKILL');
      }
    }
  }
}

/**
 * The network namespace of a Bubblewrap target (Story 1.63) as the vectors and the selection state it, on any host: the
 * target's vector and both probes carry `--unshare-net` and the evaluation layer's does not; a host that refuses the
 * namespace is refused at selection and by `run` with exit 12, naming Bubblewrap's words and the opt-out; a call that names
 * a bridge passes its socket to the shim and grants the socket's directory, and only a socket inside a granted directory;
 * the command mechanism bridges under Bubblewrap alone, a tool server's call names no bridge, and Seatbelt carries none.
 */
async function checkNetworkNamespaceUnits() {
  const root = fs.realpathSync(tempDir('network-units'));
  const folder = path.join(root, 'evals', 'verdict');
  const workspace = path.join(root, 'workspace');
  const status = path.join(root, 'status');
  const bridgeDirectory = path.join(root, 'bridge');
  for (const directory of [folder, workspace, status, bridgeDirectory]) fs.mkdirSync(directory, { recursive: true });
  const bubblewrap = { mode: 'bubblewrap', executable: '/usr/bin/bwrap', evaluationFolder: folder };
  const sandbox = targetSandbox({ confinement: bubblewrap, workspace, status });

  const wrapped = sandbox.wrap('/bin/true', []);
  const flags = wrapped.args.filter((argument) => argument === '--unshare-net').length;
  check(
    flags === 1 && wrapped.args.indexOf('--unshare-net') < wrapped.args.indexOf('--ro-bind') && !wrapped.args.includes('--bridge'),
    `a Bubblewrap target's vector holds --unshare-net ${flags} time(s) and ${wrapped.args.includes('--bridge') ? 'a' : 'no'} bridge: ${wrapped.args.join(' ')}`,
  );
  const layer = layerPrefix(bubblewrap);
  check(
    !layer.includes('--unshare-net'),
    `the evaluation layer's vector holds --unshare-net, which cuts off the host's loopback: ${layer.join(' ')}`,
  );

  // The host a bridge names is the namespace's own loopback, whichever spelling eval-quality's policy canonicalizes an address to.
  for (const [address, host] of [
    ['127.0.0.1', '127.0.0.1'],
    ['::1', '::1'],
    ['0000:0000:0000:0000:0000:0000:0000:0001', '::1'],
    ['127.0.0.2', null],
    ['10.0.0.5', null],
    ['::2', null],
    ['::ffff:7f00:1', null],
    ['localhost', null],
    ['', null],
  ]) {
    check(
      bridgeHostOf(address) === host,
      `the bridge names ${JSON.stringify(bridgeHostOf(address))} for ${JSON.stringify(address)}; expected ${JSON.stringify(host)}`,
    );
  }

  // A call that names a bridge.
  const socket = path.join(bridgeDirectory, 'bridge.sock');
  const bridged = sandbox.wrap('/bin/true', [], [bridgeDirectory], [], { bridge: socket });
  const at = bridged.args.indexOf('--bridge');
  const bound = bridged.args.flatMap((argument, index) => (argument === '--bind' ? [bridged.args[index + 1]] : []));
  check(
    at > 0 &&
      bridged.args[at + 1] === socket &&
      bridged.args[at + 2] === bridged.statusFile &&
      /confinement-status\.cjs$/.test(bridged.args[at - 1]) &&
      bound.includes(bridgeDirectory) &&
      bridged.args.slice(at + 3).join(' ') === '/bin/true',
    `a bridged call's command is ${JSON.stringify(bridged.args.slice(-6))} with binds ${JSON.stringify(bound)}; expected the shim, --bridge, the socket, the status file and the target, the socket's directory bound`,
  );
  for (const [label, candidate, grants] of [
    ['a socket outside every granted directory', path.join(root, 'elsewhere', 'bridge.sock'), [bridgeDirectory]],
    ['a socket when the call grants no directory', socket, []],
    ['a relative socket path', 'bridge.sock', [bridgeDirectory]],
  ]) {
    let refused = null;
    try {
      sandbox.wrap('/bin/true', [], grants, [], { bridge: candidate });
    } catch (error) {
      refused = error;
    }
    check(refused?.name === 'ConfinementError' && refused.message.includes('bridge'), `${label} was not refused: ${refused}`);
  }
  const seatbelt = targetSandbox({
    confinement: { mode: 'seatbelt', executable: '/usr/bin/sandbox-exec', evaluationFolder: folder },
    workspace,
  });
  const seatbeltWrapped = seatbelt.wrap('/bin/true', [], [bridgeDirectory], [], { bridge: socket });
  check(!seatbeltWrapped.args.includes('--bridge') && seatbeltWrapped.statusFile === null, 'a Seatbelt call carried a bridge');

  // The command mechanism asks for the bridge's directory and passes the socket on; the tool server's call names none.
  const seen = [];
  const fake = (mode) => ({
    mode,
    wrap: (target, args, writable, readable, options) => {
      seen.push({ writable, options });
      return { target, args, statusFile: null };
    },
    collect: async () => {},
  });
  const base = { run: async () => ({ exitCode: 0, stdout: '', stderr: '' }), callTool: async () => ({ result: {}, stderr: '' }) };
  check(
    confinedCommandMechanism(base, fake('bubblewrap')).bridges === true &&
      confinedCommandMechanism(base, fake('seatbelt')).bridges === false,
    'the command mechanism does not bridge under Bubblewrap alone',
  );
  const mechanism = confinedCommandMechanism(base, fake('bubblewrap'));
  const signal = new AbortController().signal;
  await mechanism.run({ target: '/bin/true', subcommandPath: [], argv: [], env: {}, bridge: socket }, signal);
  await mechanism.run({ target: '/bin/true', subcommandPath: [], argv: [], env: {} }, signal);
  await confinedMcpMechanism(base, fake('bubblewrap')).callTool({ target: '/bin/true', targetArgs: [], env: {} }, signal);
  check(
    seen.length === 3 &&
      seen[0].writable.includes(bridgeDirectory) &&
      seen[0].options.bridge === socket &&
      !seen[1].writable.includes(bridgeDirectory) &&
      seen[1].options?.bridge == null &&
      seen[2].options?.bridge == null,
    `the mechanisms passed ${JSON.stringify(seen)}; expected the bridge's directory and socket for the bridged call alone`,
  );

  // The probes carry the namespace: each Bubblewrap run the selection makes names it.
  const stubs = tempDir('network-stubs');
  const log = path.join(stubs, 'bwrap.log');
  const stub = (name, body) => fs.writeFileSync(path.join(stubs, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  stub('bwrap', `echo "$*" >> ${JSON.stringify(log)}\nwhile [ "$1" != "--" ]; do shift; done; shift; exec "$@"`);
  const env = { PATH: stubs, [PLATFORM_ENV]: 'linux' };
  selectConfinement({ evaluation: {}, folder, env, platform: 'linux' });
  const lines = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : []);
  check(
    lines().length === 1 && lines()[0].includes('--unshare-net'),
    `the mechanism probe ran Bubblewrap with ${JSON.stringify(lines())}; expected one run naming --unshare-net`,
  );
  stub('strace', 'while [ "$1" != "--" ]; do shift; done; shift; exec "$@"');
  probeObserver({ mode: 'bubblewrap', executable: path.join(stubs, 'bwrap') }, env);
  check(
    lines().length === 2 && lines()[1].includes('--unshare-net'),
    `the observer probe ran Bubblewrap with ${JSON.stringify(lines().slice(1))}; expected one run naming --unshare-net`,
  );

  // A host that cannot create the namespace is refused at selection, and a run there exits 12.
  const refusing = tempDir('network-refusing');
  fs.writeFileSync(
    path.join(refusing, 'bwrap'),
    `#!/bin/sh
for argument in "$@"; do
  if [ "$argument" = "--unshare-net" ]; then echo "bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted" >&2; exit 1; fi
done
while [ "$1" != "--" ]; do shift; done; shift; exec "$@"
`,
    { mode: 0o755 },
  );
  const refused = selectConfinement({ evaluation: {}, folder, env: { PATH: refusing, [PLATFORM_ENV]: 'linux' }, platform: 'linux' });
  check(
    refused.refusal?.includes('cannot confine a process on this host') &&
      refused.refusal.includes('RTM_NEWADDR: Operation not permitted') &&
      refused.refusal.includes('"confinement": false'),
    `a host that refuses the network namespace was not refused naming Bubblewrap's words and the opt-out: ${JSON.stringify(refused)}`,
  );
  const project = makeProject('network-refused');
  const ran = evaluate(['run', '--evaluation', project.folder], {
    ...project.env,
    PATH: `${refusing}${path.delimiter}${process.env.PATH}`,
    [PLATFORM_ENV]: 'linux',
  });
  check(
    ran.status === 12 && ran.output.includes('RTM_NEWADDR: Operation not permitted') && ran.output.includes('"confinement": false'),
    `a run on a host that refuses the network namespace exited ${ran.status}; expected 12 naming Bubblewrap's message and the opt-out\n${ran.output}`,
  );
  check(runDirectoryOf(project.folder, 0) === null, 'a run refused for the network namespace wrote a run directory');
}

// ---------------------------------------------------------------- Story 1.83: a route to the hosts an entry authorizes

/** Calls `attempt` until it answers true or `ms` pass. */
async function waitUntil(attempt, ms = 5000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await attempt()) return true;
    await sleep(50);
  }
  return false;
}

/** What an egress proxy answers a tunnel it allows with, before the bytes of the tunnel. */
const TUNNEL_OPENED = 'HTTP/1.1 200 Connection Established\r\n\r\n';

/** The head of a `CONNECT` request for `host:port`. */
function connectHead(host, port) {
  return `CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n\r\n`;
}

/** The authorization eval-quality's policy holds for one host a registry entry lists (`confinement-egress.js`). */
function egressItem(interfaceId, host, port, addresses = ['127.0.0.1']) {
  return egressAuthorization({ interfaceId, maxElapsedMs: 1000 }, { host, port, addresses });
}

/**
 * The egress proxy of one call (Story 1.83) over Unix sockets, on every host, with eval-quality's own `evaluateTarget` deciding:
 * a request for the listed host and port is tunneled to a loopback echo server, a request for another port, another host or an
 * address no item names is answered 403 naming the reason, the host and the entry and is recorded, and nothing reaches the server;
 * a host no item names is refused before any name is resolved; the resolved addresses an item names are the ones connected to;
 * only `CONNECT` is served; an entry that authorizes nothing reaches nothing; the record and the tunnels are bounded; and closing the
 * proxy cuts its tunnels and leaves no file behind, the authorization having been held in memory alone.
 */
async function checkEgressProxyUnits() {
  const { evaluateTarget } = await loadEngine();
  const directory = socketDirectory();
  const provider = await listenEchoing();
  const other = await listenEchoing();
  const port = provider.address().port;
  const otherPort = other.address().port;
  const opened = [];
  const open = async (authorizations, options = {}) => {
    const socketPath = path.join(directory, `p${opened.length}.sock`);
    const refusals = [];
    const proxy = await startEgress({
      socketPath,
      authorizations,
      evaluateTarget,
      onRefusal: (refusal) => refusals.push(refusal),
      ...options,
    });
    opened.push(proxy);
    return { socketPath, proxy, refusals };
  };
  const ask = (call, host, hostPort, after = '') =>
    exchange(call.socketPath, `${connectHead(host, hostPort)}${after}`, { until: after === '' ? null : `${TUNNEL_OPENED}${after}` });
  try {
    for (const [line, expected] of [
      ['CONNECT api.example.test:443 HTTP/1.1', { host: 'api.example.test', port: 443 }],
      ['CONNECT API.Example.TEST:443 HTTP/1.0', { host: 'api.example.test', port: 443 }],
      ['CONNECT 127.0.0.1:8080 HTTP/1.1', { host: '127.0.0.1', port: 8080 }],
      ['CONNECT [::1]:443 HTTP/1.1', { host: '::1', port: 443 }],
      ['CONNECT [0:0:0:0:0:0:0:1]:443 HTTP/1.1', { host: '::1', port: 443 }],
      ['GET / HTTP/1.1', null],
      ['connect host.test:443 HTTP/1.1', null],
      ['CONNECT host.test HTTP/1.1', null],
      ['CONNECT host.test:0 HTTP/1.1', null],
      ['CONNECT host.test:00443 HTTP/1.1', null],
      ['CONNECT host.test:+443 HTTP/1.1', null],
      ['CONNECT host.test:65536 HTTP/1.1', null],
      ['CONNECT user@host.test:443 HTTP/1.1', null],
      ['CONNECT http://host.test:443 HTTP/1.1', null],
      ['CONNECT [host]:443 HTTP/1.1', null],
      ['CONNECT bücher.test:443 HTTP/1.1', null],
      ['CONNECT host.test:443 HTTP/2', null],
      [`CONNECT ${'a'.repeat(MAX_HOST_BYTES)}:443 HTTP/1.1`, { host: 'a'.repeat(MAX_HOST_BYTES), port: 443 }],
      [`CONNECT ${'a'.repeat(MAX_HOST_BYTES + 1)}:443 HTTP/1.1`, null],
      [`CONNECT ${'a'.repeat(8100)}:443 HTTP/1.1`, null],
    ]) {
      check(
        JSON.stringify(parseConnectLine(line)) === JSON.stringify(expected),
        `the proxy read ${JSON.stringify(line.slice(0, 80))} as ${JSON.stringify(parseConnectLine(line))}; expected ${JSON.stringify(expected)}`,
      );
    }

    // The listed host and port are tunneled, and the bytes after the head reach the server and come back.
    const listed = await open([egressItem('assistant', '127.0.0.1', port)]);
    const tunneled = await ask(listed, '127.0.0.1', port, 'ping');
    check(
      tunneled === `${TUNNEL_OPENED}ping` && provider.accepted === 1,
      `a tunnel to the listed host answered ${JSON.stringify(tunneled)} after ${provider.accepted} connection(s); expected the tunnel's answer and the echo of ping`,
    );

    // Another port is refused: the answer names the reason, the host and the entry, the record holds it and nothing connects.
    const wrongPort = await ask(listed, '127.0.0.1', otherPort);
    check(
      wrongPort.startsWith('HTTP/1.1 403 Forbidden') &&
        wrongPort.includes('port-not-authorized') &&
        wrongPort.includes(`127.0.0.1:${otherPort}`) &&
        wrongPort.includes('"assistant"') &&
        other.accepted === 0,
      `a request for a port no item lists was answered ${JSON.stringify(wrongPort)} after ${other.accepted} connection(s) to it; expected a 403 naming port-not-authorized, the host and "assistant", and no connection`,
    );
    check(
      JSON.stringify(
        listed.refusals.map(({ interfaceIds, host, port: refusedPort, address, reason }) => ({
          interfaceIds,
          host,
          refusedPort,
          address,
          reason,
        })),
      ) ===
        JSON.stringify([
          { interfaceIds: ['assistant'], host: '127.0.0.1', refusedPort: otherPort, address: null, reason: 'port-not-authorized' },
        ]),
      `the refusal was recorded as ${JSON.stringify(listed.refusals)}; expected the entry, the host, the port and the reason, with no address`,
    );
    check(
      listed.proxy.refusals().refusals.length === 1 && listed.proxy.refusals().refusals[0].count === 1,
      "the proxy's own record does not hold the one refusal with a count of 1",
    );
    await ask(listed, '127.0.0.1', otherPort);
    check(
      listed.proxy.refusals().refusals[0].count === 2 && listed.proxy.refusals().refusals.length === 1,
      'a request made twice was not counted twice in one entry',
    );

    // Only CONNECT is served; a head that is no request, or too long, gets no tunnel.
    const forwarded = await exchange(listed.socketPath, `GET http://127.0.0.1:${port}/ HTTP/1.1\r\n\r\n`);
    check(
      forwarded.startsWith('HTTP/1.1 405') && forwarded.includes('Allow: CONNECT'),
      `a plain proxy request was answered ${JSON.stringify(forwarded)}; expected 405 naming CONNECT`,
    );
    for (const head of ['CONNECT 127.0.0.1:0 HTTP/1.1', 'CONNECT 127.0.0.1 HTTP/1.1', 'hello']) {
      const answered = await exchange(listed.socketPath, `${head}\r\n\r\n`);
      check(answered.startsWith('HTTP/1.1 400'), `the head ${JSON.stringify(head)} was answered ${JSON.stringify(answered)}; expected 400`);
    }
    const long = await exchange(listed.socketPath, `CONNECT ${'a'.repeat(9000)}`);
    check(
      !long.startsWith('HTTP/'),
      `a head of 9,000 bytes with no end was answered ${JSON.stringify(long.slice(0, 80))}; expected the connection cut with no answer`,
    );
    check(provider.accepted === 1 && other.accepted === 0, 'a request that was no CONNECT reached a server');

    // What a refusal records is bounded: a host past 253 bytes is answered 400 and recorded nowhere, so 60 requests with a host of
    // 8,100 characters leave the record empty; a detail past `MAX_DETAIL_CHARS` is cut, so the record of a call stays small.
    const oversized = await open([egressItem('assistant', '127.0.0.1', port)]);
    for (let at = 0; at < MAX_REFUSALS + 10; at += 1) {
      const answered = await exchange(oversized.socketPath, `CONNECT ${String(at).padStart(8100, 'a')}:443 HTTP/1.1\r\n\r\n`);
      if (!answered.startsWith('HTTP/1.1 400')) {
        check(false, `a host of 8,100 characters was answered ${JSON.stringify(answered.slice(0, 60))}; expected 400`);
        break;
      }
    }
    check(
      oversized.refusals.length === 0 && oversized.proxy.refusals().refusals.length === 0 && oversized.proxy.refusals().omitted === 0,
      `60 requests with a host of 8,100 characters left a record of ${JSON.stringify(oversized.proxy.refusals()).length} bytes; expected none, since the proxy reads no such host`,
    );
    const verbose = await open([egressItem('assistant', '127.0.0.1', port)], {
      evaluateTarget: (policy, request) => ({
        ...evaluateTarget(policy, request),
        detail: `${'long detail '.repeat(10_000)}`,
      }),
    });
    const longest = `${'b'.repeat(MAX_HOST_BYTES - 5)}.test`;
    for (let at = 0; at < MAX_REFUSALS + 10; at += 1) await ask(verbose, `${String(at).padStart(MAX_HOST_BYTES - 5, 'b')}.test`, 443);
    const bounded = verbose.proxy.refusals();
    const recorded = JSON.stringify(bounded).length;
    const bound = MAX_REFUSALS * (MAX_DETAIL_CHARS + MAX_HOST_BYTES + 400);
    check(
      bounded.refusals.length === MAX_REFUSALS &&
        bounded.refusals.every((refusal) => refusal.detail.length <= MAX_DETAIL_CHARS + 3 && refusal.host.length <= MAX_HOST_BYTES) &&
        verbose.refusals.every((refusal) => refusal.detail.length <= MAX_DETAIL_CHARS + 3) &&
        recorded <= bound,
      `${MAX_REFUSALS + 10} refusals with a detail of 120,000 characters and a host of ${longest.length} bytes left a record of ${recorded} bytes (${bounded.refusals.length} kept, longest detail ${Math.max(0, ...bounded.refusals.map((refusal) => refusal.detail.length))}); expected at most ${bound} bytes and a detail cut to ${MAX_DETAIL_CHARS} characters`,
    );

    // A host no item names is refused before any name is resolved; a listed name resolves once and connects to the address decided.
    let lookups = 0;
    let answers = [{ address: '127.0.0.1' }];
    const lookup = async () => {
      lookups += 1;
      if (answers instanceof Error) throw answers;
      return answers;
    };
    const named = await open([egressItem('assistant', 'provider.test', port)], { lookup });
    const stranger = await ask(named, 'stranger.test', port);
    check(
      stranger.startsWith('HTTP/1.1 403') && stranger.includes('host-not-authorized') && lookups === 0,
      `a host no item lists was answered ${JSON.stringify(stranger)} after ${lookups} lookup(s); expected a 403 naming host-not-authorized and no lookup, since a name the entry does not list is never resolved`,
    );
    const resolved = await ask(named, 'provider.test', port, 'ping');
    check(
      resolved === `${TUNNEL_OPENED}ping` && lookups === 1,
      `a listed name was answered ${JSON.stringify(resolved)} after ${lookups} lookup(s); expected a tunnel after one lookup`,
    );
    answers = [{ address: '192.0.2.7' }];
    const accepted = provider.accepted;
    const unnamed = await ask(named, 'provider.test', port);
    check(
      unnamed.startsWith('HTTP/1.1 403') && unnamed.includes('address-not-authorized') && provider.accepted === accepted,
      `a listed name that resolved to an address no item names was answered ${JSON.stringify(unnamed)}; expected a 403 naming address-not-authorized and no connection`,
    );
    check(
      named.refusals.at(-1)?.address === '192.0.2.7',
      `the refusal of an unlisted address recorded ${JSON.stringify(named.refusals.at(-1))}; expected the address 192.0.2.7`,
    );
    answers = ['192.0.2.7', '127.0.0.1'];
    const second = await ask(named, 'provider.test', port, 'ping');
    check(
      second === `${TUNNEL_OPENED}ping`,
      `a name that resolved to an unlisted address and then a listed one was answered ${JSON.stringify(second)}; expected a tunnel to the listed address`,
    );
    answers = Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
    const refusedBefore = named.refusals.length;
    const lost = await ask(named, 'provider.test', port);
    check(
      lost.startsWith('HTTP/1.1 502') && lost.includes('ENOTFOUND') && named.refusals.length === refusedBefore,
      `a listed name that does not resolve was answered ${JSON.stringify(lost)}; expected a 502 and no refusal, since the entry authorized it`,
    );

    // An address that cannot be reached lets the next allowed address try.
    answers = ['::1', '127.0.0.1'];
    const fallback = await open([egressItem('assistant', 'provider.test', port, ['::1', '127.0.0.1'])], { lookup });
    const fellBack = await ask(fallback, 'provider.test', port, 'ping');
    check(
      fellBack === `${TUNNEL_OPENED}ping`,
      `a name whose first allowed address refused the connection was answered ${JSON.stringify(fellBack)}; expected a tunnel through the next allowed address`,
    );

    // One entry that lists several items reaches each of them: two hosts, and one host on two ports.
    answers = [{ address: '127.0.0.1' }];
    const hosts = await open([egressItem('assistant', 'alpha.test', port), egressItem('assistant', 'beta.test', otherPort)], { lookup });
    check(
      (await ask(hosts, 'alpha.test', port, 'ping')) === `${TUNNEL_OPENED}ping` &&
        (await ask(hosts, 'beta.test', otherPort, 'ping')) === `${TUNNEL_OPENED}ping`,
      'an entry that lists two hosts did not reach both',
    );
    const thirdHost = await ask(hosts, 'gamma.test', port);
    check(
      thirdHost.startsWith('HTTP/1.1 403') && thirdHost.includes('host-not-authorized'),
      `a third host was answered ${JSON.stringify(thirdHost)}; expected a 403`,
    );
    const ports = await open([egressItem('assistant', '127.0.0.1', otherPort), egressItem('assistant', '127.0.0.1', port)]);
    check(
      (await ask(ports, '127.0.0.1', port, 'ping')) === `${TUNNEL_OPENED}ping`,
      'an entry that lists one host on two ports did not reach its second port',
    );

    // Two entries that start one target: either one's item allows, and a refusal names both.
    const both = await open([egressItem('first', '127.0.0.1', otherPort), egressItem('second', '127.0.0.1', port)]);
    check(
      (await ask(both, '127.0.0.1', port, 'ping')) === `${TUNNEL_OPENED}ping`,
      'the second entry of two that start one target did not allow its own host',
    );
    const neither = await ask(both, '127.0.0.1', 9);
    check(
      neither.includes('"first", "second"') && JSON.stringify(both.refusals.at(-1)?.interfaceIds) === JSON.stringify(['first', 'second']),
      `a request neither entry lists was answered ${JSON.stringify(neither)} and recorded ${JSON.stringify(both.refusals.at(-1))}; expected both entries named`,
    );

    // An entry that authorizes nothing reaches nothing.
    const none = await open([]);
    const nothing = await ask(none, '127.0.0.1', port);
    check(
      nothing.startsWith('HTTP/1.1 403') && nothing.includes('interface-not-authorized'),
      `a proxy with no authorization answered ${JSON.stringify(nothing)}; expected a 403 naming interface-not-authorized`,
    );

    // The record keeps the first distinct refusals and counts the rest; the tunnels are capped.
    const crowded = await open([egressItem('assistant', '127.0.0.1', port)]);
    for (let at = 0; at < MAX_REFUSALS + 10; at += 1) await ask(crowded, `h${at}.test`, 443);
    const record = crowded.proxy.refusals();
    check(
      record.refusals.length === MAX_REFUSALS && record.omitted === 10,
      `after ${MAX_REFUSALS + 10} distinct refusals the record holds ${record.refusals.length} and omits ${record.omitted}; expected ${MAX_REFUSALS} and 10`,
    );
    const held = await Promise.all(
      Array.from(
        { length: MAX_TUNNELS },
        () =>
          new Promise((resolve) => {
            const socket = net.connect({ path: listed.socketPath });
            socket.on('connect', () => socket.write(connectHead('127.0.0.1', port)));
            socket.once('data', () => resolve(socket));
            socket.on('error', () => resolve(socket));
          }),
      ),
    );
    const full = await ask(listed, '127.0.0.1', port);
    check(full.startsWith('HTTP/1.1 503'), `the ${MAX_TUNNELS + 1}th tunnel was answered ${JSON.stringify(full)}; expected 503`);
    for (const socket of held) socket.destroy();
    await waitUntil(async () => (await ask(listed, '127.0.0.1', port, 'ping')) === `${TUNNEL_OPENED}ping`);
    check((await ask(listed, '127.0.0.1', port, 'ping')) === `${TUNNEL_OPENED}ping`, 'a tunnel was refused after the held tunnels ended');

    // A connection that never sends its head holds a descriptor too, so the connections are capped as well.
    // Connected in batches: a burst past the listen backlog of a Unix socket is refused by the kernel before the proxy sees it.
    const idle = [];
    while (idle.length < 2 * MAX_TUNNELS) {
      idle.push(
        ...(await Promise.all(
          Array.from(
            { length: 32 },
            () =>
              new Promise((resolve) => {
                const socket = net.connect({ path: listed.socketPath });
                socket.on('connect', () => resolve(socket));
                socket.on('error', () => resolve(socket));
              }),
          ),
        )),
      );
      await sleep(20);
    }
    await sleep(300);
    const over = await ask(listed, '127.0.0.1', port);
    check(
      !over.startsWith('HTTP/'),
      `a connection past ${2 * MAX_TUNNELS} open ones was answered ${JSON.stringify(over.slice(0, 60))}; expected it cut`,
    );
    for (const socket of idle) socket.destroy();
    await waitUntil(async () => (await ask(listed, '127.0.0.1', port, 'ping')) === `${TUNNEL_OPENED}ping`);

    // Closing the proxy cuts a tunnel that is open and leaves nothing: no socket and no file of an authorization.
    const live = await new Promise((resolve) => {
      const socket = net.connect({ path: listed.socketPath });
      socket.on('connect', () => socket.write(connectHead('127.0.0.1', port)));
      socket.once('data', () => resolve(socket));
    });
    const cut = new Promise((resolve) => live.once('close', () => resolve('cut')));
    await Promise.all(opened.map((proxy) => proxy.close()));
    opened.length = 0;
    check((await Promise.race([cut, sleep(3000).then(() => 'open')])) === 'cut', 'closing the proxy left a tunnel open');
    check(
      fs.readdirSync(directory).length === 0,
      `closing the proxies left ${JSON.stringify(fs.readdirSync(directory))}; expected no socket and no file`,
    );
    check((await exchange(listed.socketPath, connectHead('127.0.0.1', port))).startsWith('<'), 'a closed proxy still answered');
  } finally {
    await Promise.all(opened.map((proxy) => proxy.close()));
    for (const server of [provider, other]) await closeServer(server);
  }
}

/**
 * The egress half of the status shim (Story 1.83), on every host: the arguments in either order, the loopback listener that connects
 * each connection to the proxy's Unix socket and ends with the shim, and the real shim as a process: it announces the proxy to the
 * target in `HTTPS_PROXY`, `https_proxy` and `NODE_USE_ENV_PROXY`, the target tunnels through it to a server only the proxy reaches,
 * a call with no `--egress` carries no proxy variable, and the shim runs a bridge and an egress listener together.
 */
async function checkEgressShim() {
  const shim = require('../cli/lib/evaluate/confinement-status.cjs');
  const both = shim.parseArguments(['--egress', '/e/s', '--bridge', '/b/b', '/s/status.json', 'target', 'a']);
  const other = shim.parseArguments(['--bridge', '/b/b', '--egress', '/e/s', '/s/status.json', 'target', 'a']);
  check(
    JSON.stringify(both) ===
      JSON.stringify({ bridge: '/b/b', egress: '/e/s', avoid: [], statusFile: '/s/status.json', target: 'target', args: ['a'] }) &&
      JSON.stringify(both) === JSON.stringify(other) &&
      shim.parseArguments(['/s/status.json', 'target']).egress === null,
    `the shim read its arguments as ${JSON.stringify(both)} and ${JSON.stringify(other)}; expected --bridge and --egress in either order and neither by default`,
  );
  const avoiding = shim.parseArguments(['--egress', '/e/s', '--avoid', '34567', '/s/status.json', 'target', '--avoid', '9']);
  check(
    JSON.stringify(avoiding.avoid) === '[34567]' && avoiding.egress === '/e/s' && avoiding.args.join(' ') === '--avoid 9',
    `the shim read ${JSON.stringify(avoiding)}; expected the port after --avoid, and the target's own --avoid left to the target`,
  );
  check(
    shim.parseArguments(['--avoid', '0', '--avoid', 'x', '--avoid', '65536', '/s/status.json', 'target']).avoid.length === 0,
    'the shim kept an --avoid that is no port',
  );
  check(
    JSON.stringify(shim.egressEnvironment(4321)) ===
      JSON.stringify({ HTTPS_PROXY: 'http://127.0.0.1:4321', https_proxy: 'http://127.0.0.1:4321', NODE_USE_ENV_PROXY: '1' }),
    `the shim names the proxy ${JSON.stringify(shim.egressEnvironment(4321))}; expected both spellings of the HTTPS proxy and Node's switch`,
  );

  const directory = socketDirectory();
  const standIn = path.join(directory, 'stand-in.sock');
  const echo = net.createServer((socket) => {
    echo.sockets.add(socket);
    socket.once('close', () => echo.sockets.delete(socket));
    socket.on('error', () => {});
    socket.pipe(socket);
  });
  echo.sockets = new Set();
  await new Promise((resolve) => echo.listen(standIn, resolve));
  try {
    const served = await shim.serveEgress(standIn);
    check(
      served.server.address().address === '127.0.0.1',
      `the egress listener is bound to ${served.server.address().address}; expected the namespace's loopback 127.0.0.1`,
    );
    const socket = net.connect({ host: '127.0.0.1', port: served.port });
    const back = await new Promise((resolve) => {
      socket.on('connect', () => socket.write('through'));
      socket.once('data', (chunk) => resolve(String(chunk)));
      socket.on('error', (error) => resolve(`<${error.code}>`));
    });
    check(back === 'through', `bytes through the egress listener came back as ${JSON.stringify(back)}; expected through`);
    const closed = new Promise((resolve) => socket.once('close', () => resolve('closed')));
    served.close();
    check(
      (await Promise.race([closed, sleep(3000).then(() => 'open')])) === 'closed',
      'closing the egress listener left a connection open',
    );
    const refused = await new Promise((resolve) => {
      const again = net.connect({ host: '127.0.0.1', port: served.port });
      again.on('connect', () => (again.destroy(), resolve('connected')));
      again.on('error', (error) => resolve(error.code));
    });
    check(refused === 'ECONNREFUSED', `a closed egress listener answered ${refused}; expected ECONNREFUSED`);
  } finally {
    await closeServer(echo);
  }

  // A started server binds a port of the namespace's loopback that the runtime chose for it, so the egress listener must not take that
  // port: when the system gives it one (the first listen is made to return it here, as the 1 in 7,000 chance does), it listens again.
  {
    const probe = await shim.serveEgress(standIn.replace('stand-in', 'unused'));
    const reserved = probe.port;
    probe.close();
    await sleep(50);
    const original = net.Server.prototype.listen;
    let handed = 0;
    net.Server.prototype.listen = function (options, ...rest) {
      if (handed === 0 && options?.port === 0) {
        handed += 1;
        return original.call(this, { ...options, port: reserved }, ...rest);
      }
      return original.call(this, options, ...rest);
    };
    let kept;
    try {
      kept = await shim.serveEgress(standIn.replace('stand-in', 'unused'), [reserved]);
    } finally {
      net.Server.prototype.listen = original;
    }
    check(
      handed === 1 && kept.port !== reserved && kept.server.listening,
      `an egress listener that was given the port ${reserved} the target's server binds listens on ${kept.port}; expected another port`,
    );
    kept.close();
    const exhausted = await (async () => {
      net.Server.prototype.listen = function (options, ...rest) {
        return original.call(this, { ...options, port: reserved }, ...rest);
      };
      try {
        await shim.serveEgress(standIn.replace('stand-in', 'unused'), [reserved]);
        return 'listened';
      } catch (error) {
        return error.message;
      } finally {
        net.Server.prototype.listen = original;
      }
    })();
    check(
      exhausted.includes('the system gave only ports the target') && exhausted.includes(String(reserved)),
      `an egress listener that was only ever given the reserved port ended with ${JSON.stringify(exhausted)}; expected it to give up naming the port`,
    );
  }

  // The real shim: the target reads the proxy variables, tunnels to a server only the proxy reaches, and the listener ends with it.
  const { evaluateTarget } = await loadEngine();
  const provider = await listenEchoing();
  const providerPort = provider.address().port;
  const proxySocket = path.join(directory, 'proxy.sock');
  const proxy = await startEgress({
    socketPath: proxySocket,
    authorizations: [egressItem('assistant', '127.0.0.1', providerPort)],
    evaluateTarget,
  });
  const clean = { PATH: process.env.PATH };
  const run = (args, script, extra = {}) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, [CONFINEMENT_STATUS, ...args, process.execPath, '-e', script], {
        env: { ...clean, ...extra },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '';
      child.stdout.on('data', (chunk) => (out += chunk));
      child.stderr.on('data', (chunk) => (out += chunk));
      child.on('close', (status) => resolve({ status, out: out.trim() }));
    });
  const through = `
    const net = require('node:net');
    const url = new URL(process.env.HTTPS_PROXY);
    const socket = net.connect({ host: url.hostname, port: Number(url.port) });
    let text = '';
    socket.on('connect', () => socket.write('CONNECT 127.0.0.1:${providerPort} HTTP/1.1\\r\\n\\r\\nping'));
    socket.on('data', (chunk) => { text += chunk; if (text.endsWith('ping')) socket.destroy(); });
    socket.on('close', () => console.log(JSON.stringify({ https: process.env.HTTPS_PROXY, lower: process.env.https_proxy, node: process.env.NODE_USE_ENV_PROXY, text })));`;
  try {
    const ran = await run(['--egress', proxySocket, path.join(directory, 'status.json')], through);
    let report = null;
    try {
      report = JSON.parse(ran.out);
    } catch {
      report = ran.out;
    }
    check(
      ran.status === 0 &&
        typeof report === 'object' &&
        /^http:\/\/127\.0\.0\.1:\d+$/.test(report.https) &&
        report.https === report.lower &&
        report.node === '1' &&
        report.text === `${TUNNEL_OPENED}ping`,
      `a target started by the shim with --egress printed ${JSON.stringify(report)} (exit ${ran.status}); expected the proxy variables and a tunnel to the listed server`,
    );
    const refusedAfter = await new Promise((resolve) => {
      const port = Number(new URL(report?.https ?? 'http://127.0.0.1:1').port);
      const again = net.connect({ host: '127.0.0.1', port });
      again.on('connect', () => (again.destroy(), resolve('connected')));
      again.on('error', (error) => resolve(error.code));
    });
    check(
      refusedAfter === 'ECONNREFUSED',
      `the egress listener answered ${refusedAfter} after its target ended; expected it closed with the target`,
    );

    // No `--egress`, no proxy variable; with both options the target starts once each listener is up.
    const plain = await run(
      [path.join(directory, 'status-plain.json')],
      'console.log(JSON.stringify([process.env.HTTPS_PROXY ?? null, process.env.https_proxy ?? null, process.env.NODE_USE_ENV_PROXY ?? null]))',
    );
    check(
      plain.status === 0 && plain.out === '[null,null,null]',
      `a call with no --egress printed ${JSON.stringify(plain.out)}; expected no proxy variable`,
    );
    const bridgeSocket = path.join(directory, 'bridge.sock');
    const together = await run(
      ['--bridge', bridgeSocket, '--egress', proxySocket, path.join(directory, 'status-both.json')],
      "console.log(JSON.stringify([require('node:fs').statSync(process.argv[1]).isSocket(), Boolean(process.env.HTTPS_PROXY)]))".replace(
        'process.argv[1]',
        JSON.stringify(bridgeSocket),
      ),
    );
    check(
      together.status === 0 && together.out === '[true,true]',
      `a call with a bridge and an egress listener printed ${JSON.stringify(together.out)} (exit ${together.status}); expected both up before the target ran`,
    );
    check(!fs.existsSync(bridgeSocket), 'the bridge socket outlived the shim that served it');

    // `main` hands `--avoid` to `serveEgress`: a preload makes the shim's first `listen({ port: 0 })` return the reserved port, as
    // the 1 in 7,000 chance does, and the target reads the port it was told. With `--avoid` it is another port; without it the
    // preload's port is the one told, which shows the preload takes effect.
    const reservation = await shim.serveEgress(path.join(directory, 'unused-reservation'));
    const reservedPort = reservation.port;
    reservation.close();
    await reservation.closed;
    const preload = path.join(directory, 'give-reserved-port.cjs');
    fs.writeFileSync(
      preload,
      `const net = require('node:net');
const original = net.Server.prototype.listen;
let handed = false;
net.Server.prototype.listen = function (options, ...rest) {
  if (!handed && options && options.port === 0) {
    handed = true;
    return original.call(this, { ...options, port: Number(process.env.TEA_TEST_RESERVED_PORT) }, ...rest);
  }
  return original.call(this, options, ...rest);
};
`,
    );
    const told = (name, avoidArgs) =>
      new Promise((resolve) => {
        const child = spawn(
          process.execPath,
          [
            '--require',
            preload,
            CONFINEMENT_STATUS,
            '--egress',
            proxySocket,
            ...avoidArgs,
            path.join(directory, `status-${name}.json`),
            process.execPath,
            '-e',
            'console.log(new URL(process.env.HTTPS_PROXY).port)',
          ],
          { env: { ...clean, TEA_TEST_RESERVED_PORT: String(reservedPort) }, stdio: ['ignore', 'pipe', 'pipe'] },
        );
        let out = '';
        child.stdout.on('data', (chunk) => (out += chunk));
        child.stderr.on('data', (chunk) => (out += chunk));
        child.on('close', (status) => resolve({ status, out: out.trim() }));
      });
    const unavoided = await told('unavoided', []);
    check(
      unavoided.status === 0 && unavoided.out === String(reservedPort),
      `the shim run with no --avoid under the preload printed ${JSON.stringify(unavoided.out)} (exit ${unavoided.status}); expected the reserved port ${reservedPort}, which shows the preload takes effect`,
    );
    const avoided = await told('avoided', ['--avoid', String(reservedPort)]);
    check(
      avoided.status === 0 && /^[1-9][0-9]*$/.test(avoided.out) && avoided.out !== String(reservedPort),
      `the shim run with --avoid ${reservedPort} under the preload printed ${JSON.stringify(avoided.out)} (exit ${avoided.status}); expected the target's HTTPS_PROXY on another port`,
    );
  } finally {
    await proxy.close();
    await closeServer(provider);
  }
}

/**
 * The vector and the mechanisms of an egress call (Story 1.83) on any host, over a stand-in Bubblewrap: the proxy's directory is bound
 * read-only at a synthetic `/dev` path after the private root is emptied, and the shim is told that path; a directory outside the
 * private root is seen as it is; the sockets the call hides leave the directory out; a socket path outside the runtime's own
 * directories or inside the call's grants is refused; Seatbelt carries no proxy. The command and tool-server mechanisms open one
 * proxy for each call whose entries list a host, serve it while the call runs, record what it refuses in the sandbox's report
 * and remove its directory however the call ends; a call with no host gets none.
 */
async function checkEgressVectorUnits() {
  const root = fs.realpathSync(tempDir('egress-units'));
  const folder = path.join(root, 'evals', 'verdict');
  const workspace = path.join(root, 'workspace');
  const status = path.join(root, 'status');
  const privateRoot = path.join(root, 'private');
  const parent = path.join(privateRoot, 'run-1-abcdef');
  const inside = path.join(parent, 'tea-egress-abcdef');
  const outside = path.join(root, 'elsewhere', 'tea-egress-ghijkl');
  for (const directory of [folder, workspace, status, inside, outside]) fs.mkdirSync(directory, { recursive: true });
  const bubblewrap = { mode: 'bubblewrap', executable: '/usr/bin/bwrap', evaluationFolder: folder };
  const asked = [];
  const sandbox = targetSandbox({
    confinement: bubblewrap,
    workspace,
    status,
    privateRoot,
    hostSockets: (options) => (asked.push(options), []),
  });

  const wrapped = sandbox.wrap('/bin/true', [], [], [], { egress: path.join(inside, 's') });
  const mount = '/dev/tea-egress-abcdef';
  const bindAt = wrapped.args.findIndex((argument, at) => argument === '--ro-bind' && wrapped.args[at + 1] === inside);
  const emptied = wrapped.args.findIndex((argument, at) => argument === '--tmpfs' && wrapped.args[at + 1] === privateRoot);
  const egressAt = wrapped.args.indexOf('--egress');
  check(
    bindAt > emptied &&
      emptied > 0 &&
      wrapped.args[bindAt + 2] === mount &&
      wrapped.args[egressAt + 1] === `${mount}/s` &&
      wrapped.args[egressAt + 2] === wrapped.statusFile,
    `an egress call's vector is ${wrapped.args.join(' ')}; expected the directory bound read-only at ${mount} after the private root is emptied and --egress ${mount}/s before the status file`,
  );
  check(
    !wrapped.args.some((argument, at) => argument === '--bind' && wrapped.args[at + 1] === inside),
    "the proxy's directory was bound writable",
  );
  check(
    (asked.at(-1)?.except ?? []).includes(inside),
    `the host sockets were asked to leave out ${JSON.stringify(asked.at(-1)?.except)}; expected the proxy's directory`,
  );

  const seen = sandbox.wrap('/bin/true', [], [], [], { egress: path.join(outside, 's') });
  check(
    !seen.args.some((argument, at) => argument === '--ro-bind' && seen.args[at + 1] === outside) &&
      seen.args[seen.args.indexOf('--egress') + 1] === path.join(outside, 's'),
    `a proxy directory outside the private root has the vector ${seen.args.join(' ')}; expected no extra bind and its own path`,
  );
  check(!sandbox.wrap('/bin/true', []).args.includes('--egress'), 'a call with no proxy carried --egress');
  // A server told a port of the namespace's loopback keeps it: the shim is told to keep its egress listener off that port.
  const avoiding = sandbox.wrap('/bin/true', [], [], [], { egress: path.join(inside, 's'), listenPort: 34_567 });
  const avoidAt = avoiding.args.indexOf('--avoid');
  check(
    avoidAt > avoiding.args.indexOf('--egress') &&
      avoiding.args[avoidAt + 1] === '34567' &&
      avoiding.args[avoidAt + 2] === avoiding.statusFile,
    `a call whose server is told port 34567 has the vector ${avoiding.args.join(' ')}; expected --avoid 34567 after --egress and before the status file`,
  );
  check(
    !sandbox.wrap('/bin/true', [], [], [], { egress: path.join(inside, 's') }).args.includes('--avoid') &&
      !sandbox.wrap('/bin/true', [], [], [], { listenPort: 34_567 }).args.includes('--avoid'),
    'a call told no port, or a call with no proxy, carried --avoid',
  );
  for (const [label, candidate, grants] of [
    ['a relative socket', 's', []],
    ['a socket in the workspace', path.join(workspace, 's'), []],
    ['a socket in a directory the call may write', path.join(outside, 's'), [outside]],
  ]) {
    let refused = null;
    try {
      sandbox.wrap('/bin/true', [], grants, [], { egress: candidate });
    } catch (error) {
      refused = error;
    }
    check(refused?.name === 'ConfinementError' && refused.message.includes('egress'), `${label} was not refused: ${refused}`);
  }
  const seatbelt = targetSandbox({
    confinement: { mode: 'seatbelt', executable: '/usr/bin/sandbox-exec', evaluationFolder: folder },
    workspace,
  });
  check(
    !seatbelt.wrap('/bin/true', [], [], [], { egress: path.join(outside, 's') }).args.includes('--egress'),
    'a Seatbelt call carried a proxy',
  );
  check(
    seatbelt.egressReport() === null && sandbox.egressReport() !== null,
    'the egress report is null under Seatbelt and a record under Bubblewrap',
  );

  // The mechanisms open one proxy for each call whose entries list a host, serve it, record its refusals and remove it.
  const provider = await listenEchoing();
  const port = provider.address().port;
  // A socket path holds about 100 bytes, which the suite's own scratch directories exceed on macOS.
  const callParent = socketDirectory();
  const scratchList = [];
  Object.defineProperty(scratchList, 'privateParent', { value: callParent });
  const refusals = [];
  let live = null;
  let livePort = null;
  const recording = (mode) => ({
    mode,
    wrap: (target, args, writable, readable, options) => (
      (live = options?.egress ?? null),
      (livePort = options?.listenPort ?? null),
      { target, args, statusFile: null }
    ),
    collect: async () => {},
    noteEgressRefusal: (refusal) => refusals.push(refusal),
  });
  const signal = new AbortController().signal;
  const inCall = [];
  const base = {
    run: async () => {
      const during =
        live === null
          ? null
          : {
              socket: live,
              listed: scratchList.includes(path.dirname(live)),
              tunnel: await exchange(live, connectHead('127.0.0.1', port), { until: TUNNEL_OPENED }),
              refused: await exchange(live, connectHead('127.0.0.1', 9)),
            };
      inCall.push(during);
      return { exitCode: 0, stdout: '', stderr: '' };
    },
    callTool: async () => {
      inCall.push(
        live === null ? null : { socket: live, tunnel: await exchange(live, connectHead('127.0.0.1', port), { until: TUNNEL_OPENED }) },
      );
      return { result: {}, stderr: '' };
    },
  };
  const authorizations = (target) => (target === '/bin/listed' ? [egressItem('assistant', '127.0.0.1', port)] : []);
  const commands = confinedCommandMechanism(base, recording('bubblewrap'), () => [], scratchList, authorizations);
  await commands.run({ target: '/bin/listed', subcommandPath: [], argv: [], env: {} }, signal);
  const first = inCall.at(-1);
  check(
    first !== null &&
      path.dirname(path.dirname(first.socket)) === callParent &&
      path.basename(path.dirname(first.socket)).startsWith('tea-egress-') &&
      first.listed &&
      first.tunnel === TUNNEL_OPENED &&
      first.refused.startsWith('HTTP/1.1 403') &&
      !fs.existsSync(path.dirname(first.socket)) &&
      !scratchList.includes(path.dirname(first.socket)),
    `a call whose entry lists a host ran with the proxy ${JSON.stringify(first)}; expected a live proxy in a private directory beneath the run's private parent, on the scratch list while the call ran and gone after it`,
  );
  check(
    refusals.length === 1 && refusals[0].host === '127.0.0.1' && refusals[0].port === 9 && refusals[0].interfaceIds[0] === 'assistant',
    `the sandbox noted ${JSON.stringify(refusals)}; expected the refusal of 127.0.0.1:9 for "assistant"`,
  );
  check(livePort === null, `a call whose request named no port was wrapped with listenPort ${livePort}; expected none`);
  await commands.run({ target: '/bin/listed', subcommandPath: [], argv: [], env: {}, listenPort: 34_567 }, signal);
  check(
    livePort === 34_567,
    `a call whose request named the port 34567 its server binds was wrapped with listenPort ${livePort}; expected 34567`,
  );
  await commands.run({ target: '/bin/plain', subcommandPath: [], argv: [], env: {} }, signal);
  check(inCall.at(-1) === null && fs.readdirSync(callParent).length === 0, 'a call whose entry lists no host got a proxy');
  await confinedMcpMechanism(base, recording('bubblewrap'), () => [], scratchList, authorizations).callTool(
    { target: '/bin/listed', targetArgs: [], env: {} },
    signal,
  );
  check(
    inCall.at(-1)?.tunnel === TUNNEL_OPENED && fs.readdirSync(callParent).length === 0,
    'a tool server whose entry lists a host did not get a live proxy, or left its directory',
  );
  live = null;
  await confinedCommandMechanism(base, recording('seatbelt'), () => [], scratchList, authorizations).run(
    { target: '/bin/listed', subcommandPath: [], argv: [], env: {} },
    signal,
  );
  check(inCall.at(-1) === null, 'a Seatbelt call got a proxy');
  // A call that fails removes its directory too.
  const failing = confinedCommandMechanism(
    {
      run: async () => {
        throw new Error('the call failed');
      },
    },
    recording('bubblewrap'),
    () => [],
    scratchList,
    authorizations,
  );
  let failed = null;
  try {
    await failing.run({ target: '/bin/listed', subcommandPath: [], argv: [], env: {} }, signal);
  } catch (error) {
    failed = error;
  }
  check(
    failed?.message === 'the call failed' && fs.readdirSync(callParent).length === 0 && scratchList.length === 0,
    `a call that threw left ${JSON.stringify(fs.readdirSync(callParent))} and ${JSON.stringify(scratchList)}`,
  );
  // Without a private parent the directory is made under the temp directory, and under /tmp when that leaves no room for a socket path.
  const bare = [];
  const realTemp = process.env.TMPDIR;
  const long = path.join(root, 'x'.repeat(90));
  fs.mkdirSync(long);
  process.env.TMPDIR = long;
  try {
    await confinedCommandMechanism(base, recording('bubblewrap'), () => [], bare, authorizations).run(
      { target: '/bin/listed', subcommandPath: [], argv: [], env: {} },
      signal,
    );
  } finally {
    if (realTemp === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = realTemp;
  }
  check(
    /^\/(private\/)?tmp\/tea-egress-[A-Za-z0-9]{6}\/s$/.test(inCall.at(-1)?.socket ?? ''),
    `a long temp directory put the proxy at ${inCall.at(-1)?.socket}; expected a directory under /tmp`,
  );
  await closeServer(provider);
}

/**
 * The per-entry `egress` field (Story 1.83): the registry holds each entry's hosts, `check` refuses an item that cannot hold as written
 * and an entry that still declares the retired `network` field, naming the entry and the field that replaced it, entries that start
 * one target must agree, each started target's calls hold the authorizations of its entries, the isolation manifest's note names the
 * entries that authorize hosts under Bubblewrap and no other confinement's, and `run.json` records them as `egress` and what the
 * proxies refused as `egressRefusals`.
 */
async function checkEgressField() {
  const verdict = readJson(path.join(FIXTURE, EVALUATION, 'evaluation.json')).registry[0];
  const server = {
    kind: 'mcp',
    interfaceId: 'tools',
    target: 'bin/tools.js',
    targetArgs: [],
    tools: ['t'],
    environmentKeys: [],
    maxElapsedMs: 1000,
  };
  const listed = [{ host: 'api.example.test', port: 443, addresses: ['203.0.113.10', '2001:db8::10'] }];
  for (const entry of [
    verdict,
    server,
    {
      kind: 'api',
      interfaceId: 'service',
      scheme: 'http',
      host: '127.0.0.1',
      addresses: ['127.0.0.1'],
      methods: ['GET'],
      safeMethods: [],
      maxRedirects: 0,
      maxElapsedMs: 1000,
      maxRequestBytes: 1,
      maxResponseBytes: 1,
      server: { target: 'server/s.js', targetArgs: [], environmentKeys: [], portEnvironmentKey: 'PORT', readyTimeoutMs: 1000 },
    },
  ]) {
    const problems = registryProblems([{ ...entry, egress: listed }]);
    check(problems.length === 0, `an entry of kind ${entry.kind ?? 'cli'} that lists egress was refused: ${JSON.stringify(problems)}`);
  }
  for (const [label, egress] of [
    ['an item with another field', [{ ...listed[0], scheme: 'https' }]],
    ['a port of 0', [{ ...listed[0], port: 0 }]],
    ['a port above 65535', [{ ...listed[0], port: 65_536 }]],
    ['a port written as text', [{ ...listed[0], port: '443' }]],
    ['no addresses', [{ ...listed[0], addresses: [] }]],
    ['no host', [{ port: 443, addresses: ['203.0.113.10'] }]],
  ]) {
    const problems = registryProblems([{ ...verdict, egress }]);
    check(
      problems.some((problem) => problem.startsWith('registry[0]/egress')),
      `${label} was not refused naming the entry: ${JSON.stringify(problems)}`,
    );
  }

  // The retired field: any value is refused with the entry named and a pointer to the replacement, and no second generic finding.
  for (const value of ['host', 'isolated', 'bridged']) {
    const problems = registryProblems([{ ...verdict, network: value }]);
    check(
      problems.length === 1 &&
        problems[0].startsWith('registry[0] (the interface "verdict") declares "network"') &&
        problems[0].includes('"egress"') &&
        problems[0].includes('Story 1.83') &&
        problems[0].includes('tea-evaluate-cli.md#file-system-confinement'),
      `an entry declaring "network": ${JSON.stringify(value)} got ${JSON.stringify(problems)}; expected one finding naming the entry, the field that replaced it and the reference`,
    );
  }
  const retiredProblem = removedNetworkProblem(0, { network: 'host' });
  check(retiredProblem.startsWith('registry[0] declares "network"'), 'an entry with no interface ID was not named by its position');

  // What `check` adds: a host spelled otherwise than a URL spells it, a host listed twice, an address that is no literal, and an HTTP entry that starts nothing.
  const find = async (entries) => egressRegistryProblems(entries);
  check(
    (await find([{ ...verdict, egress: [{ ...listed[0], host: 'API.Example.TEST' }] }])).length === 0,
    'a host differing from its URL spelling by letter case alone was refused',
  );
  const spelled = await find([{ ...verdict, egress: [{ ...listed[0], host: '127.1' }] }]);
  check(
    spelled.some((problem) => problem.includes('registry[0].egress[0]') && problem.includes('"127.0.0.1"')),
    `a host written 127.1 got ${JSON.stringify(spelled)}; expected the URL spelling named`,
  );
  // The proxy's request grammar and `check` share one host source: an item no `CONNECT` request can name is refused before a run.
  for (const [label, host, expected] of [
    ['a wildcard', '*.example.test', 'wildcard'],
    ['a name with a tilde', 'a~b.example.test', 'cannot read'],
    ['a name past 253 bytes', `${'a'.repeat(250)}.test`, 'cannot read'],
  ]) {
    const found = await find([{ ...verdict, egress: [{ ...listed[0], host }] }]);
    check(
      found.some((problem) => problem.includes('registry[0].egress[0]') && problem.includes(expected)),
      `${label} (${JSON.stringify(host.slice(0, 40))}) got ${JSON.stringify(found)}; expected a finding naming the item and "${expected}"`,
    );
  }
  for (const host of ['::1', '2001:db8::10', 'a_b.example.test', 'a'.repeat(253), '127.0.0.1']) {
    check(isEgressHost(host), `the host ${JSON.stringify(host.slice(0, 40))} was not one the proxy can read`);
  }
  for (const host of ['*.example.test', 'a~b.example.test', 'a'.repeat(254), '', 'a b']) {
    check(!isEgressHost(host), `the host ${JSON.stringify(host.slice(0, 40))} was one the proxy can read`);
  }
  check(
    (await find([{ ...verdict, egress: [{ host: '::1', port: 443, addresses: ['::1'] }] }])).length === 0,
    'an IPv6 host the proxy reads was refused',
  );
  const twice = await find([{ ...verdict, egress: [listed[0], { ...listed[0], addresses: ['203.0.113.11'] }] }]);
  check(
    twice.some((problem) => problem.includes('registry[0].egress[1]') && problem.includes('a second time')),
    `a host and port listed twice got ${JSON.stringify(twice)}`,
  );
  const unnamed = await find([{ ...verdict, egress: [{ ...listed[0], addresses: ['api.example.test'] }] }]);
  check(
    unnamed.some((problem) => problem.includes('registry[0].egress[0]') && problem.includes('parseProbeTargetPolicy')),
    `an address that is a name got ${JSON.stringify(unnamed)}; expected eval-quality's parser named`,
  );
  const deployed = await find([
    {
      kind: 'api',
      interfaceId: 'deployed',
      scheme: 'https',
      host: 'a.example.test',
      port: 443,
      addresses: ['203.0.113.1'],
      methods: ['GET'],
      safeMethods: [],
      maxRedirects: 0,
      maxElapsedMs: 1000,
      maxRequestBytes: 1,
      maxResponseBytes: 1,
      egress: listed,
    },
  ]);
  check(
    deployed.some((problem) => problem.includes('names no server')),
    `an HTTP entry that names its port and lists egress got ${JSON.stringify(deployed)}`,
  );
  // Entries that start one target hold one egress.
  const same = registryProblems([
    { ...verdict, interfaceId: 'one', egress: listed },
    { ...verdict, interfaceId: 'two', executable: 'other' },
  ]);
  check(
    same.some((problem) => problem.includes('registry[1]') && problem.includes('another egress')),
    `two entries that start one target with different egress were not refused: ${JSON.stringify(same)}`,
  );
  const alike = registryProblems([
    { ...verdict, interfaceId: 'one', egress: listed },
    { ...verdict, interfaceId: 'two', executable: 'other', egress: [...listed] },
  ]);
  check(
    !alike.some((problem) => problem.includes('another egress')),
    `two entries that agree on the egress were refused: ${JSON.stringify(alike)}`,
  );

  // Each kind of entry hands its calls its own authorizations.
  const kinds = [
    { kind: 'cli', interfaceId: 'plain', target: 'bin/plain.js', maxElapsedMs: 1000 },
    { kind: 'mcp', interfaceId: 'tools', target: 'bin/tools.js', maxElapsedMs: 1000, egress: listed },
    {
      kind: 'api',
      interfaceId: 'service',
      server: { target: 'server/service.js' },
      maxElapsedMs: 1000,
      egress: [{ host: '127.0.0.1', port: 9, addresses: ['127.0.0.1'] }],
    },
    { kind: 'api', interfaceId: 'deployed', port: 80, maxElapsedMs: 1000, egress: listed },
    { kind: 'cli', interfaceId: 'second', target: 'bin/tools.js', maxElapsedMs: 1000, egress: listed },
  ];
  const egressOf = egressResolver(kinds, (entry) => (entry.kind === 'api' ? entry.server?.target : entry.target));
  const summarize = (authorizations) =>
    authorizations.map(({ interfaceId, host, port, scheme, methods }) => [interfaceId, host, port, scheme, methods.join(',')]);
  check(
    JSON.stringify(summarize(egressOf('bin/tools.js'))) ===
      JSON.stringify([
        ['tools', 'api.example.test', 443, 'https', 'GET'],
        ['second', 'api.example.test', 443, 'https', 'GET'],
      ]) &&
      JSON.stringify(summarize(egressOf('server/service.js'))) === JSON.stringify([['service', '127.0.0.1', 9, 'https', 'GET']]) &&
      egressOf('bin/plain.js').length === 0 &&
      egressOf('port-80').length === 0 &&
      egressOf('bin/unknown.js').length === 0,
    `the authorizations of the targets were ${JSON.stringify(['bin/tools.js', 'server/service.js', 'bin/plain.js', 'port-80'].map((target) => summarize(egressOf(target))))}; expected both entries' items for the shared tool server, the service's own, and none for a command with no egress, an HTTP entry that starts nothing and an unknown target`,
  );
  const registry = createRegistry(
    [verdict, { ...server, egress: listed }, { ...server, interfaceId: 'zeta', target: 'bin/z.js', egress: [listed[0]] }],
    { root: tempDir('egress-registry') },
  );
  check(
    JSON.stringify(registry.egressEntries) ===
      JSON.stringify([
        { interfaceId: 'tools', hosts: ['api.example.test:443'] },
        { interfaceId: 'zeta', hosts: ['api.example.test:443'] },
      ]),
    `the registry lists the entries that authorize hosts as ${JSON.stringify(registry.egressEntries)}; expected tools and zeta by interface ID with their host:port items`,
  );

  const bubblewrap = { mode: 'bubblewrap', executable: '/usr/bin/bwrap', evaluationFolder: '/eval' };
  const seatbelt = { mode: 'seatbelt', executable: '/usr/bin/sandbox-exec', evaluationFolder: '/eval' };
  const entries = [{ interfaceId: 'assistant', hosts: ['api.example.test:443'] }];
  const noted = forbiddenInputNote(bubblewrap, entries);
  check(
    noted.includes('"assistant" (api.example.test:443) authorize the hosts named') &&
      noted.includes('abstract Unix sockets') &&
      noted.includes('egress proxy'),
    `the Bubblewrap note ends ${JSON.stringify(noted.slice(-380))}; expected the entries and their hosts named`,
  );
  check(
    !forbiddenInputNote(bubblewrap, []).includes('egress') &&
      !forbiddenInputNote(seatbelt, entries).includes('egress') &&
      !forbiddenInputNote({ mode: 'opt-out' }, entries).includes('egress'),
    'a note named egress for a run with no such entry, a Seatbelt run or an opted-out run',
  );
  check(forbiddenInputNote(bubblewrap, []) === forbiddenInputNote(bubblewrap), 'the note of a run with no egress changed');

  // `check` over a project: the retired field is refused naming the entry and the pointer (exit 10), a listed host passes.
  const retired = makeProject('egress-retired', {
    edit: ({ folder }) => editJson(path.join(folder, 'evaluation.json'), (evaluation) => (evaluation.registry[0].network = 'host')),
  });
  const refused = evaluate(['check', '--evaluation', retired.folder], retired.env);
  check(
    refused.status === 10 &&
      refused.output.includes('registry[0] (the interface "verdict") declares "network": "host", a field Story 1.83 removed') &&
      refused.output.includes('"egress"') &&
      !refused.output.includes('must NOT have additional properties ("network")'),
    `check over an entry with network "host" exited ${refused.status}; expected 10 naming the entry, the removed field and "egress"\n${refused.output}`,
  );
  // A tool-server or HTTP entry carrying the retired field gets the same one finding: the `if`, `then` and `else` its definition sits in add no raw line.
  for (const [label, fixture] of [
    ['a tool-server', path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate-mcp', 'evals', 'grader')],
    ['an HTTP', path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate-api', 'evals', 'grader')],
  ]) {
    const folder = path.join(tempDir('egress-retired-kind'), 'grader');
    fs.cpSync(fixture, folder, { recursive: true, filter: (from) => path.basename(from) !== 'runs' });
    editJson(path.join(folder, 'evaluation.json'), (evaluation) => (evaluation.registry[0].network = 'host'));
    const found = evaluate(['check', '--evaluation', folder]);
    check(
      found.status === 10 &&
        found.output.includes('declares "network": "host", a field Story 1.83 removed') &&
        found.output.includes('1 authoring defect(s)') &&
        !/must match "(then|else)" schema/.test(found.output),
      `check over ${label} entry with network "host" exited ${found.status}; expected 10 and one finding with no raw "then" or "else" line\n${found.output}`,
    );
  }
  const authorized = makeProject('egress-listed', {
    edit: ({ folder }) => editJson(path.join(folder, 'evaluation.json'), (evaluation) => (evaluation.registry[0].egress = listed)),
  });
  const checked = evaluate(['check', '--evaluation', authorized.folder], authorized.env);
  check(checked.status === 0, `check over an entry that lists a host exited ${checked.status}; expected 0\n${checked.output}`);
  const badSpelling = makeProject('egress-spelled', {
    edit: ({ folder }) =>
      editJson(path.join(folder, 'evaluation.json'), (evaluation) => (evaluation.registry[0].egress = [{ ...listed[0], host: '127.1' }])),
  });
  const badChecked = evaluate(['check', '--evaluation', badSpelling.folder], badSpelling.env);
  check(
    badChecked.status === 10 && badChecked.output.includes('registry[0].egress[0]'),
    `check over a host spelled 127.1 exited ${badChecked.status}; expected 10 naming registry[0].egress[0]\n${badChecked.output}`,
  );

  // A run records what each entry authorizes and, where nothing authorizes, an empty list; the Bubblewrap note names the entry.
  const hosted = makeProject('egress-run', {
    edit: ({ folder }) =>
      editJson(
        path.join(folder, 'evaluation.json'),
        (evaluation) => (evaluation.registry[0].egress = [{ host: '127.0.0.1', port: 9, addresses: ['127.0.0.1'] }]),
      ),
  });
  const ran = evaluate(['run', '--evaluation', hosted.folder], hosted.env);
  check(ran.status === 0, `a run whose entry lists a host exited ${ran.status}; expected 0\n${ran.output}`);
  const runDirectory = runDirectoryOf(hosted.folder);
  const record = runDirectory === null ? {} : readJson(path.join(runDirectory, 'run.json'));
  check(
    JSON.stringify(record.egress) === JSON.stringify([{ interfaceId: 'verdict', hosts: ['127.0.0.1:9'] }]) &&
      JSON.stringify(record.egressRefusals) === '[]' &&
      record.hostNetwork === undefined &&
      record.confinement === CONFINEMENT,
    `run.json records egress ${JSON.stringify(record.egress)}, egressRefusals ${JSON.stringify(record.egressRefusals)} and hostNetwork ${JSON.stringify(record.hostNetwork)}; expected the entry's host, an empty list of refusals and no hostNetwork`,
  );
  const note =
    runDirectory === null
      ? ''
      : Object.values(readJson(path.join(runDirectory, 'trial-sets', 'P-001', 'isolation-manifest.json')).forbiddenInputAccounting)[0].note;
  check(
    CONFINEMENT === 'bubblewrap' ? note.includes('"verdict" (127.0.0.1:9) authorize the hosts named') : !note.includes('egress'),
    `the isolation manifest's note is ${JSON.stringify(note.slice(-260))}; expected it to name the entry under Bubblewrap and no egress under Seatbelt`,
  );
  const plain = makeProject('egress-default');
  const plainRan = evaluate(['run', '--evaluation', plain.folder], plain.env);
  const plainDirectory = runDirectoryOf(plain.folder);
  const plainRecord = plainDirectory === null ? {} : readJson(path.join(plainDirectory, 'run.json'));
  check(
    plainRan.status === 0 && JSON.stringify(plainRecord.egress) === '[]' && JSON.stringify(plainRecord.egressRefusals) === '[]',
    `a run whose entries list no host recorded egress ${JSON.stringify(plainRecord.egress)} and egressRefusals ${JSON.stringify(plainRecord.egressRefusals)}; expected two empty lists`,
  );

  // The registry hands each call its entry's hosts: a run on a (stood-in) Linux host passes `--egress` to the Bubblewrap command of every
  // target call whose entry lists a host and to none whose entry lists none. The stub `bwrap` logs the arguments of each call and runs
  // its command; the stub `strace` confirms its probe and traces nothing, so the run ends at the first call's audit (exit 12).
  const stubs = tempDir('egress-wiring-stubs');
  const log = path.join(stubs, 'bwrap.log');
  const stub = (name, body) => fs.writeFileSync(path.join(stubs, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  stub('bwrap', `echo "$*" >> ${JSON.stringify(log)}\nwhile [ "$1" != "--" ]; do shift; done; shift; exec "$@"`);
  stub(
    'strace',
    String.raw`out=""; prev=""
for a in "$@"; do if [ "$prev" = "-o" ]; then out="$a"; fi; prev="$a"; done
case "$prev" in
  */tea-evaluate-observer-probe-*) printf '1 openat(AT_FDCWD</>, "%s", O_RDONLY) = 3<%s>\n' "$prev" "$prev" > "$out"; exit 0 ;;
esac
while [ "$1" != "--" ]; do shift; done; shift; exec "$@"`,
  );
  const targetCalls = (project) => {
    fs.rmSync(log, { force: true });
    evaluate(['run', '--evaluation', project.folder], {
      ...project.env,
      PATH: `${stubs}${path.delimiter}${process.env.PATH}`,
      [PLATFORM_ENV]: 'linux',
    });
    return (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n') : []).filter((line) => line.includes('confinement-status.cjs'));
  };
  const hostedCalls = targetCalls(hosted);
  const plainCalls = targetCalls(plain);
  check(
    hostedCalls.length > 0 &&
      hostedCalls.every(
        (line) => line.includes('--egress /dev/tea-egress-') && line.includes('--ro-bind') && line.includes('/dev/tea-egress-'),
      ),
    `the target calls of a run whose entry lists a host were ${JSON.stringify(hostedCalls.map((line) => line.slice(-200)))}; expected at least one and each with --egress at a /dev/tea-egress-* path`,
  );
  check(
    plainCalls.length > 0 && plainCalls.every((line) => !line.includes('--egress') && line.includes('--unshare-net')),
    `the target calls of a run whose entry lists no host were ${JSON.stringify(plainCalls.map((line) => line.slice(0, 60)))}; expected at least one, none with --egress and each with --unshare-net`,
  );
}

/**
 * What a run records of the requests an egress proxy refused (Story 1.83), on any host with a mechanism: no real call is refused on a
 * host with no proxy, so a preload makes each target sandbox report two refusals, and `run.json`'s `egressRefusals` and the summary
 * name each audited trial with the host, the port and the entry.
 */
async function checkEgressRecord() {
  if (process.platform === 'linux') {
    const absent = ['bwrap', 'strace'].filter((name) => executableOnPath(name, process.env) === null);
    if (absent.length > 0) {
      skipCase('egress record', `${absent.join(' and ')} not on PATH; the Linux CI job installs both`);
      return;
    }
  } else if (process.platform !== 'darwin') {
    skipCase('egress record', `Seatbelt and Bubblewrap exist on macOS and Linux only, and this host is ${process.platform}`);
    return;
  }
  const project = makeProject('egress-record');
  const ran = evaluate(['run', '--evaluation', project.folder], project.env, ['--require', REFUSED_EGRESS_REPORT]);
  check(ran.status === 0, `a confined run whose sandboxes report refused requests exited ${ran.status}; expected 0\n${ran.output}`);
  const directory = runDirectoryOf(project.folder);
  const record = directory === null ? {} : readJson(path.join(directory, 'run.json'));
  const refusals = [
    {
      interfaceIds: ['verdict'],
      host: 'api.example.test',
      port: 443,
      address: null,
      reason: 'host-not-authorized',
      detail: 'host "api.example.test" is not the authorized "127.0.0.1"',
      count: 3,
    },
    {
      interfaceIds: ['verdict'],
      host: '127.0.0.1',
      port: 9,
      address: '127.0.0.1',
      reason: 'port-not-authorized',
      detail: 'port 9 is not the authorized 8',
      count: 1,
    },
  ];
  const entries = Array.isArray(record.egressRefusals) ? record.egressRefusals : [];
  check(
    JSON.stringify(entries) ===
      JSON.stringify(auditedTrials().map(({ conditionArm, trialIndex }) => ({ conditionArm, trialIndex, refusals, omitted: 4 }))),
    `run.json records the refused requests ${JSON.stringify(record.egressRefusals)}; expected one entry for each audited trial (${JSON.stringify(auditedTrials())}) with the two refusals and 4 omitted`,
  );
  const summary = record.outcome?.message ?? '';
  check(
    entries.length > 0 &&
      summary.includes(egressRefusalNote(entries)) &&
      entries.every((entry) =>
        summary.includes(
          `${entry.conditionArm} trial ${entry.trialIndex} (api.example.test:443 for "verdict", host-not-authorized, and 5 more)`,
        ),
      ),
    `the run's summary does not name each trial whose proxy refused a request with its host, port and entry: ${JSON.stringify(summary)}`,
  );
  check(
    entries.length > 0 && ran.output.includes(egressRefusalNote(entries)),
    `the command's own output does not carry the summary's note on the refused requests\n${ran.output}`,
  );
}

/** Starts a server in a process of its own, which the synchronous CLI cannot starve: its port, and what ends it. */
async function listenInProcess() {
  const child = spawn(
    process.execPath,
    [
      '-e',
      "const s=require('node:net').createServer((c)=>{c.on('error',()=>{});c.end('provider')});s.listen(0,'127.0.0.1',()=>console.log(s.address().port))",
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  );
  const port = await new Promise((resolve) => child.stdout.once('data', (chunk) => resolve(Number(String(chunk).trim()))));
  return { port, stop: () => child.kill('SIGKILL') };
}

/**
 * The route a confined Linux target has to the hosts its entry lists, on a Linux host with Bubblewrap and strace only (Story 1.83; the
 * Linux CI job proves it, a macOS host skips it). A loopback server of the runtime's stands in for a model provider. For an entry that
 * lists it, a confined process asks the proxy named in `HTTPS_PROXY` for a tunnel and reaches the server, while another port of the
 * host's loopback, another host and an abstract Unix socket the runtime serves are refused, and a direct connection to the server
 * fails, the namespace holding a loopback and nothing else; real clients (Node's HTTPS client with `NODE_USE_ENV_PROXY`, `curl`)
 * tunnel through it, while curl with no proxy or handed it without `-p` opens no tunnel and gets no route; for an entry that lists nothing there is no proxy variable and every connection fails; the refusals reach the
 * sandbox's report; and a call's directory is gone after it.
 */
async function checkEgressRoute() {
  const label = 'egress route';
  if (process.platform !== 'linux') {
    skipCase(label, `Bubblewrap exists on Linux only, and this host is ${process.platform}; the Linux CI job runs it`);
    return;
  }
  const absent = ['bwrap', 'strace'].filter((name) => executableOnPath(name, process.env) === null);
  if (absent.length > 0) {
    skipCase(label, `${absent.join(' and ')} not on PATH; the Linux CI job installs both`);
    return;
  }
  const folder = tempDir('egress-folder');
  const confinement = selectConfinement({ evaluation: {}, folder });
  if (confinement.refusal !== undefined) throw new Error(confinement.refusal);
  const workspace = fs.realpathSync(tempDir('egress-workspace'));
  const sandbox = targetSandbox({ confinement, workspace, status: tempDir('egress-status') });
  const provider = await listenEchoing();
  const port = provider.address().port;
  const elsewhere = await listenEchoing();
  const abstractName = `tea-evaluate-egress-${crypto.randomBytes(6).toString('hex')}`;
  const abstractServer = net.createServer((socket) => socket.end());
  await new Promise((resolve, reject) => {
    abstractServer.once('error', reject);
    abstractServer.listen({ path: `\0${abstractName}` }, resolve);
  });
  const scratchList = [];
  const base = {
    run: (request) =>
      new Promise((resolve) => {
        const child = spawn(request.target, request.argv, { cwd: workspace, env: request.env, stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        child.stdout.on('data', (chunk) => (out += chunk));
        child.stderr.on('data', (chunk) => (out += chunk));
        const timer = setTimeout(() => child.kill('SIGKILL'), SPAWN_TIMEOUT_MS);
        child.on('close', (exitCode) => (clearTimeout(timer), resolve({ exitCode, out: out.trim() })));
      }),
  };
  const listed = (interfaceId) => () => [egressItem(interfaceId, '127.0.0.1', port)];
  const call = async (egressOf, script, ...args) => {
    const mechanism = confinedCommandMechanism(base, sandbox, () => [], scratchList, egressOf);
    const ran = await mechanism.run({
      target: process.execPath,
      subcommandPath: [],
      argv: ['-e', script, ...args],
      env: { PATH: process.env.PATH },
    });
    return ran.exitCode === 0 ? ran.out : `exit ${ran.exitCode}: ${ran.out}`;
  };
  const PROBE = `
    const net = require('node:net');
    const [kind, a, b] = process.argv.slice(1);
    const done = (text) => { console.log(text); process.exit(0); };
    if (kind === 'direct') {
      const socket = net.connect({ host: '127.0.0.1', port: Number(a) });
      socket.on('connect', () => done('connected'));
      socket.on('error', (error) => done('refused ' + error.code));
    } else if (kind === 'abstract') {
      const socket = net.connect({ path: '\\0' + a });
      socket.on('connect', () => done('connected'));
      socket.on('error', (error) => done('refused ' + error.code));
    } else {
      if (!process.env.HTTPS_PROXY) done('no proxy variable');
      const url = new URL(process.env.HTTPS_PROXY);
      const socket = net.connect({ host: url.hostname, port: Number(url.port) });
      let text = '';
      socket.on('connect', () => socket.write('CONNECT ' + a + ':' + b + ' HTTP/1.1\\r\\n\\r\\nping'));
      socket.on('data', (chunk) => { text += chunk; if (text.endsWith('ping') || text.includes('\\r\\n\\r\\n') && !text.startsWith('HTTP/1.1 200')) socket.destroy(); });
      socket.on('close', () => done(text.split('\\r\\n')[0] + (text.endsWith('ping') ? ' ping' : '')));
      socket.on('error', (error) => done('error ' + error.code));
    }`;
  try {
    const entry = listed('assistant');
    const reached = await call(entry, PROBE, 'proxy', '127.0.0.1', String(port));
    check(
      reached === 'HTTP/1.1 200 Connection Established ping',
      `an entry that lists the server, tunneling to it through the proxy, got ${JSON.stringify(reached)}; expected the tunnel and the echo of ping`,
    );
    check(provider.accepted === 1, `the listed server accepted ${provider.accepted} connection(s) from the proxy; expected 1`);
    const otherPort = await call(entry, PROBE, 'proxy', '127.0.0.1', String(elsewhere.address().port));
    check(
      otherPort.startsWith('HTTP/1.1 403 Forbidden') && elsewhere.accepted === 0,
      `the same entry asking for another port of the host's loopback got ${JSON.stringify(otherPort)} after ${elsewhere.accepted} connection(s) to it; expected 403 and none`,
    );
    const otherHost = await call(entry, PROBE, 'proxy', 'example.org', '443');
    check(
      otherHost.startsWith('HTTP/1.1 403 Forbidden'),
      `the same entry asking for another host got ${JSON.stringify(otherHost)}; expected 403`,
    );
    const direct = await call(entry, PROBE, 'direct', String(port));
    check(
      direct === 'refused ECONNREFUSED',
      `the same entry connecting to the listed server without the proxy got ${JSON.stringify(direct)}; expected refused ECONNREFUSED, since the namespace holds a loopback and nothing else`,
    );
    const abstract = await call(entry, PROBE, 'abstract', abstractName);
    check(
      abstract === 'refused ECONNREFUSED',
      `the same entry connecting to an abstract Unix socket the runtime serves got ${JSON.stringify(abstract)}; expected refused ECONNREFUSED`,
    );
    const report = sandbox.egressReport();
    check(
      report.refusals.some(
        (refusal) =>
          refusal.host === 'example.org' &&
          refusal.port === 443 &&
          refusal.interfaceIds[0] === 'assistant' &&
          refusal.reason === 'host-not-authorized',
      ) && report.refusals.some((refusal) => refusal.port === elsewhere.address().port && refusal.reason === 'port-not-authorized'),
      `the sandbox's report of the refusals is ${JSON.stringify(report)}; expected both requests, with the host, the port and the entry`,
    );

    // An entry that lists nothing has no proxy variable and reaches nothing.
    const none = () => [];
    for (const [what, kind, a, b] of [
      ['through a proxy', 'proxy', '127.0.0.1', String(port)],
      ['directly', 'direct', String(port)],
      ['to an abstract Unix socket', 'abstract', abstractName],
    ]) {
      const got = await call(none, PROBE, kind, a, b);
      check(
        got === (kind === 'proxy' ? 'no proxy variable' : 'refused ECONNREFUSED'),
        `an entry that lists no host, connecting ${what}, got ${JSON.stringify(got)}; expected ${kind === 'proxy' ? 'no proxy variable' : 'refused ECONNREFUSED'}`,
      );
    }
    check(
      provider.accepted === 1,
      `the listed server accepted ${provider.accepted} connection(s) after the entry that lists nothing tried; expected the one the listed entry made`,
    );

    // Real clients that read the variable the shim set.
    const nodeClient = `
      const https = require('node:https');
      https.get({ host: '127.0.0.1', port: ${port}, rejectUnauthorized: false, path: '/' }, (response) => { let t = ''; response.on('data', (c) => (t += c)); response.on('end', () => console.log('node ' + t)); }).on('error', (error) => console.log('node error ' + (error.code ?? error.message)));`;
    const openssl = executableOnPath('openssl', process.env);
    if (openssl === null) console.log('  skipped the Node HTTPS client leg of the egress route case: openssl is not on PATH');
    else {
      const material = tempDir('egress-tls');
      const made = spawnSync(
        openssl,
        [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-keyout',
          path.join(material, 'key.pem'),
          '-out',
          path.join(material, 'cert.pem'),
          '-days',
          '2',
          '-subj',
          '/CN=127.0.0.1',
        ],
        { stdio: 'ignore' },
      );
      if (made.status === 0) {
        const secured = https.createServer(
          { key: fs.readFileSync(path.join(material, 'key.pem')), cert: fs.readFileSync(path.join(material, 'cert.pem')) },
          (request, response) => response.end('tls through the proxy'),
        );
        await new Promise((resolve) => secured.listen(0, '127.0.0.1', resolve));
        try {
          const tlsPort = secured.address().port;
          const tlsClient = nodeClient.replace(String(port), String(tlsPort));
          const got = await call(() => [egressItem('assistant', '127.0.0.1', tlsPort)], tlsClient);
          check(
            got === 'node tls through the proxy',
            `Node's HTTPS client in a confined target got ${JSON.stringify(got)}; expected the server's answer through the proxy named in HTTPS_PROXY`,
          );
          const without = await call(() => [], tlsClient);
          check(
            without.startsWith('node error '),
            `Node's HTTPS client in a confined target whose entry lists nothing got ${JSON.stringify(without)}; expected an error`,
          );
        } finally {
          await new Promise((resolve) => secured.close(resolve));
        }
      }
    }
    if (executableOnPath('curl', process.env) === null) {
      console.log('  skipped the curl leg of the egress route case: curl is not on PATH');
    } else {
      const web = http.createServer((request, response) => response.end('greeting through the proxy'));
      let webConnections = 0;
      web.on('connection', () => (webConnections += 1));
      await new Promise((resolve) => web.listen(0, '127.0.0.1', resolve));
      try {
        const webPort = web.address().port;
        const script = `const { spawnSync } = require('node:child_process'); const r = spawnSync('curl', ['-sS', '-p', '-x', process.env.HTTPS_PROXY, '--max-time', '10', 'http://127.0.0.1:${webPort}/'], { encoding: 'utf8' }); console.log('curl ' + (r.status === 0 ? r.stdout : 'failed ' + r.status));`;
        const curled = await call(() => [egressItem('assistant', '127.0.0.1', webPort)], script);
        check(
          curled === 'curl greeting through the proxy',
          `curl in a confined target tunneling through HTTPS_PROXY got ${JSON.stringify(curled)}; expected the server's greeting`,
        );
        // A client that opens no `CONNECT` tunnel has no route: the shim sets `HTTPS_PROXY` alone, so curl without `-x` dials the
        // namespace's own loopback, and curl handed the proxy without `-p` sends a plain request the proxy answers `405`.
        const plainCurl = (proxyArgs) =>
          `const { spawnSync } = require('node:child_process'); const r = spawnSync('curl', ['-sS', ${proxyArgs}'--max-time', '10', '-o', '/dev/null', '-w', '%{http_code}', 'http://127.0.0.1:${webPort}/'], { encoding: 'utf8' }); console.log('curl ' + (r.status === 0 ? r.stdout : 'failed ' + r.status));`;
        const served = webConnections;
        const unproxied = await call(() => [egressItem('assistant', '127.0.0.1', webPort)], plainCurl(''));
        check(
          unproxied === 'curl failed 7',
          `curl in a confined target with no \`-x\` got ${JSON.stringify(unproxied)}; expected failed 7, since the shim sets HTTPS_PROXY alone and the loopback of the namespace holds no server`,
        );
        const untunneled = await call(() => [egressItem('assistant', '127.0.0.1', webPort)], plainCurl("'-x', process.env.HTTPS_PROXY, "));
        check(
          untunneled === 'curl 405',
          `curl in a confined target handed the proxy without \`-p\` got ${JSON.stringify(untunneled)}; expected 405, since the proxy reads \`CONNECT\` alone`,
        );
        check(
          webConnections === served,
          `the server accepted ${webConnections - served} connection(s) from the two requests that opened no tunnel; expected none`,
        );
      } finally {
        await closeServer(web);
      }
    }
    check(scratchList.length === 0, `the calls left ${JSON.stringify(scratchList)} on the scratch list`);
  } finally {
    for (const server of [provider, elsewhere]) await closeServer(server);
    await closeServer(abstractServer);
  }
}

/** The egress proxy directories (full paths) beneath the private parents of the run with process id `pid`. */
function proxyDirectories(privateRoot, pid) {
  // A parent the run removes between the two reads is gone, so it holds none.
  const names = (directory) => {
    try {
      return fs.readdirSync(directory);
    } catch {
      return [];
    }
  };
  return names(privateRoot)
    .filter((name) => name.startsWith(`run-${pid}-`))
    .flatMap((parent) =>
      names(path.join(privateRoot, parent))
        .filter((name) => name.startsWith('tea-egress-'))
        .map((name) => path.join(privateRoot, parent, name)),
    );
}

/**
 * The proxy directories (of `list()`) whose proxy answers a tunnel to `port` now, polled until one does, the deadline passes or
 * `alive()` is false; `[]` then. A call's directory exists from `mkdtempSync` in `openEgress` and the proxy binds its socket
 * only afterwards (`startEgress`), so a directory alone is no proof that the call under test is live.
 */
async function answeringProxies(list, port, alive) {
  const deadline = Date.now() + SPAWN_TIMEOUT_MS;
  while (alive() && Date.now() < deadline) {
    const answering = [];
    for (const directory of list()) {
      const answer = await exchange(path.join(directory, 's'), connectHead('127.0.0.1', port), { until: TUNNEL_OPENED });
      if (answer === TUNNEL_OPENED) answering.push(directory);
    }
    if (answering.length > 0) return answering;
    await sleep(50);
  }
  return [];
}

/**
 * A real run's egress, on a Linux host with Bubblewrap and strace only (Story 1.83): the verdict target of a run whose entry lists a
 * loopback server tunnels to it through `HTTPS_PROXY`, is refused another port and another host, and cannot connect to any of them
 * directly; `run.json` names the two refusals with the host, the port and the entry and the summary says so; a run ended by SIGTERM
 * while the call is live leaves no proxy directory beneath the private root and nothing in the temp directory.
 */
async function checkEgressRun() {
  const label = 'egress run';
  if (process.platform !== 'linux') {
    skipCase(label, `Bubblewrap exists on Linux only, and this host is ${process.platform}; the Linux CI job runs it`);
    return;
  }
  const absent = ['bwrap', 'strace'].filter((name) => executableOnPath(name, process.env) === null);
  if (absent.length > 0) {
    skipCase(label, `${absent.join(' and ')} not on PATH; the Linux CI job installs both`);
    return;
  }
  const provider = await listenInProcess();
  const refusedPort = provider.port === 9 ? 10 : 9;
  const asked = [`127.0.0.1:${provider.port}`, `127.0.0.1:${refusedPort}`, 'example.org:443'];
  try {
    const project = makeProject('egress-linux', {
      edit: ({ folder }) =>
        editJson(
          path.join(folder, 'evaluation.json'),
          (evaluation) => (evaluation.registry[0].egress = [{ host: '127.0.0.1', port: provider.port, addresses: ['127.0.0.1'] }]),
        ),
    });
    const ran = evaluate(['run', '--evaluation', project.folder], {
      ...project.env,
      VERDICT_WHEN: 'trial-clean-1',
      VERDICT_DO: 'probe-egress',
      VERDICT_TOUCH: asked.join(','),
    });
    check(ran.status === 0, `a confined run whose target probes its egress exited ${ran.status}; expected 0\n${ran.output}`);
    const directory = runDirectoryOf(project.folder);
    const out = trialStdout(directory, 'clean', 1);
    const expected = [
      'egress-proxy: named',
      `egress ${asked[0]}: 200`,
      `direct ${asked[0]}: refused ECONNREFUSED`,
      `egress ${asked[1]}: 403`,
      `direct ${asked[1]}: refused ECONNREFUSED`,
      `egress ${asked[2]}: 403`,
      `direct ${asked[2]}: refused`,
    ];
    check(
      expected.every((line) => out.includes(line)),
      `the target's probe of its egress printed ${JSON.stringify(out)}; expected each of ${JSON.stringify(expected)}`,
    );
    const record = directory === null ? {} : readJson(path.join(directory, 'run.json'));
    const entry = (record.egressRefusals ?? []).find((candidate) => candidate.conditionArm === 'clean' && candidate.trialIndex === 1);
    check(
      JSON.stringify((entry?.refusals ?? []).map(({ interfaceIds, host, port, reason }) => [interfaceIds, host, port, reason]).sort()) ===
        JSON.stringify(
          [
            [['verdict'], '127.0.0.1', refusedPort, 'port-not-authorized'],
            [['verdict'], 'example.org', 443, 'host-not-authorized'],
          ].sort(),
        ) && entry.omitted === 0,
      `run.json names the refusals of clean trial 1 as ${JSON.stringify(entry)}; expected 127.0.0.1:${refusedPort} (port-not-authorized) and example.org:443 (host-not-authorized) for "verdict"`,
    );
    check(
      (record.outcome?.message ?? '').includes('the egress proxy refused a host the target asked for in clean trial 1') &&
        (record.outcome?.message ?? '').includes('for "verdict"'),
      `the run's summary is ${JSON.stringify(record.outcome?.message)}; expected it to name the refused host and the entry`,
    );
    check(
      fs.readdirSync(project.env.TMPDIR).length === 0,
      `a finished run left ${JSON.stringify(fs.readdirSync(project.env.TMPDIR))} in its temp directory`,
    );

    // A run ended by SIGTERM while the call is live removes the proxy's directory with the rest of the run's private directories.
    const privateRoot = path.join('/tmp', `tea-evaluate-p${process.getuid()}`);
    const live = makeProject('egress-signal', {
      edit: ({ folder }) =>
        editJson(
          path.join(folder, 'evaluation.json'),
          (evaluation) => (evaluation.registry[0].egress = [{ host: '127.0.0.1', port: provider.port, addresses: ['127.0.0.1'] }]),
        ),
    });
    const child = spawn(process.execPath, [EVALUATE, 'run', '--evaluation', live.folder], {
      cwd: PROJECT_ROOT,
      env: { ...BASE_ENV, ...live.env, VERDICT_WHEN: 'trial-clean-1', VERDICT_DO: 'hold-egress' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    const ended = new Promise((resolve) => child.on('exit', (code, name) => resolve({ code, name })));
    const proxies = () => proxyDirectories(privateRoot, child.pid);
    // The held call's directory exists from `mkdtempSync` in `openEgress` and its proxy binds the socket only afterwards, so the
    // signal goes once the proxy answers a tunnel; a signal sent in that window meets a call that is not live yet.
    const during = await answeringProxies(proxies, provider.port, () => child.exitCode === null);
    child.kill('SIGTERM');
    const { code, name } = await ended;
    check(
      name === 'SIGTERM' && during.length === 1,
      `a run ended by SIGTERM mid-call ended with code ${code} and signal ${name} and held ${JSON.stringify(during)} answering mid-call; expected one live proxy directory beneath its private root\n${output}`,
    );
    const left = fs.existsSync(privateRoot)
      ? fs.readdirSync(privateRoot).filter((entryName) => entryName.startsWith(`run-${child.pid}-`))
      : [];
    check(
      left.length === 0 && proxies().length === 0,
      `a run ended by SIGTERM mid-call left ${JSON.stringify(left)} beneath the private root`,
    );
    check(
      fs.readdirSync(live.env.TMPDIR).length === 0,
      `a run ended by SIGTERM mid-call left ${JSON.stringify(fs.readdirSync(live.env.TMPDIR))} in its temp directory`,
    );

    // A run killed outright (SIGKILL) runs no handler, and the next run over the same evaluation reclaims what it left beneath its
    // private parent, the proxy's directory included.
    const killed = makeProject('egress-kill', {
      edit: ({ folder }) =>
        editJson(
          path.join(folder, 'evaluation.json'),
          (evaluation) => (evaluation.registry[0].egress = [{ host: '127.0.0.1', port: provider.port, addresses: ['127.0.0.1'] }]),
        ),
    });
    const victim = spawn(process.execPath, [EVALUATE, 'run', '--evaluation', killed.folder], {
      cwd: PROJECT_ROOT,
      env: { ...BASE_ENV, ...killed.env, VERDICT_WHEN: 'trial-clean-1', VERDICT_DO: 'hold-egress' },
      stdio: 'ignore',
    });
    const victimEnded = new Promise((resolve) => victim.on('exit', resolve));
    const victimProxies = () => proxyDirectories(privateRoot, victim.pid);
    const heldBefore = (await answeringProxies(victimProxies, provider.port, () => victim.exitCode === null)).length;
    victim.kill('SIGKILL');
    await victimEnded;
    const orphaned = fs.readdirSync(privateRoot).filter((name) => name.startsWith(`run-${victim.pid}-`));
    check(
      heldBefore === 1 && orphaned.length === 1,
      `a run killed mid-call held ${heldBefore} proxy directory(ies) and left ${JSON.stringify(orphaned)}; expected one of each, since no handler runs`,
    );
    const next = evaluate(['run', '--evaluation', killed.folder], { ...killed.env });
    const remaining = fs.readdirSync(privateRoot).filter((name) => name.startsWith(`run-${victim.pid}-`));
    check(
      remaining.length === 0 && next.output.includes('reclaimed private parent from killed run'),
      `the run after a killed one left ${JSON.stringify(remaining)} beneath the private root and printed ${JSON.stringify(next.output.slice(0, 300))}; expected the killed run's private parent, its proxy directory included, reclaimed`,
    );
    // What a killed run leaves in the temp directory is the call's own temp directory (Story 1.131 reclaims it).
    const leftTemp = fs.readdirSync(killed.env.TMPDIR);
    check(
      leftTemp.every((name) => name.startsWith('tea-evaluate-target-tmp-')),
      `a killed run left ${JSON.stringify(leftTemp)} in its temp directory; expected nothing of the egress proxy`,
    );
    for (const name of leftTemp) fs.rmSync(path.join(killed.env.TMPDIR, name), { recursive: true, force: true });
  } finally {
    provider.stop();
  }
}

/** The probe a confined process runs: connects to what `kind` names and prints what happened. */
const CONNECT_PROBE = `
const net = require('node:net');
const [kind, target] = process.argv.slice(1);
const socket =
  kind === 'tcp'
    ? net.connect({ host: '127.0.0.1', port: Number(target) })
    : net.connect({ path: kind === 'abstract' ? '\\0' + target : target });
socket.on('connect', () => {
  console.log('connected');
  socket.destroy();
});
socket.on('error', (error) => console.log('refused ' + error.code));
`;

/** A command run to its end without blocking this process (the servers the cases start answer meanwhile). */
function runToEnd(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    const timer = setTimeout(() => child.kill('SIGKILL'), SPAWN_TIMEOUT_MS);
    child.on('close', (status, signal) => {
      clearTimeout(timer);
      resolve({ status, signal, stdout, stderr });
    });
  });
}

/**
 * The route to the host's abstract sockets, on a Linux host with Bubblewrap and strace only (Story 1.63; the Linux CI job
 * proves it, a macOS host skips it). The runtime serves an abstract Unix socket and a loopback TCP port; a confined process
 * connects to each and both are refused (`ECONNREFUSED`); the same commands with `--unshare-net` taken out of the real vector
 * connect to both, which is the revert check (a vector that lost the flag fails the first assertion, and a control that
 * cannot connect proves the case vacuous). A command target's process has a loopback and nothing else, and its status file
 * and exit code are as before. A service the target starts is reached through the bridge from the host (`bridgeAccepts`,
 * `startForwarder`), asked about a port of the host's own loopback the target's namespace does not hold, and the target
 * asking the bridge for that host port gets `fail`: a connection to the socket from inside reaches the namespace's loopback.
 */
async function checkAbstractSocketRoute() {
  const label = 'abstract-socket route';
  if (process.platform !== 'linux') {
    skipCase(label, `Bubblewrap exists on Linux only, and this host is ${process.platform}; the Linux CI job runs it`);
    return;
  }
  const absent = ['bwrap', 'strace'].filter((name) => executableOnPath(name, process.env) === null);
  if (absent.length > 0) {
    skipCase(label, `${absent.join(' and ')} not on PATH; the Linux CI job installs both`);
    return;
  }
  const folder = tempDir('abstract-folder');
  const confinement = selectConfinement({ evaluation: {}, folder });
  if (confinement.refusal !== undefined) throw new Error(confinement.refusal);
  const workspace = fs.realpathSync(tempDir('abstract-workspace'));
  const sandbox = targetSandbox({ confinement, workspace, status: tempDir('abstract-status') });
  const withoutNetwork = (wrapped) => ({ ...wrapped, args: wrapped.args.filter((argument) => argument !== '--unshare-net') });
  const launch = (wrapped, options = {}) => runToEnd(wrapped.target, wrapped.args, { cwd: workspace, ...options });

  const abstractName = `tea-evaluate-abstract-${crypto.randomBytes(6).toString('hex')}`;
  const abstractServer = net.createServer((socket) => socket.end());
  await new Promise((resolve, reject) => {
    abstractServer.once('error', reject);
    abstractServer.listen({ path: `\0${abstractName}` }, resolve);
  });
  const tcpServer = net.createServer((socket) => socket.end());
  await new Promise((resolve) => tcpServer.listen(0, '127.0.0.1', resolve));
  const attempt = async (kind, target, { stripped = false } = {}) => {
    const wrapped = sandbox.wrap(process.execPath, ['-e', CONNECT_PROBE, kind, target]);
    const ran = await launch(stripped ? withoutNetwork(wrapped) : wrapped);
    return ran.status === 0 ? ran.stdout.trim() : `exit ${ran.status}: ${ran.stderr.trim()}`;
  };
  try {
    for (const [what, kind, target] of [
      ['an abstract Unix socket the runtime serves', 'abstract', abstractName],
      ["a TCP port on the host's loopback", 'tcp', String(tcpServer.address().port)],
    ]) {
      const refused = await attempt(kind, target);
      check(
        refused === 'refused ECONNREFUSED',
        `a confined process connecting to ${what} got ${JSON.stringify(refused)}; expected refused ECONNREFUSED`,
      );
      const control = await attempt(kind, target, { stripped: true });
      check(
        control === 'connected',
        `with --unshare-net taken out of the vector, a confined process connecting to ${what} got ${JSON.stringify(control)}; expected connected, since the case proves nothing otherwise`,
      );
    }
    // A command target runs with a loopback only; its output, exit code and status file are what they were.
    const command = sandbox.wrap(process.execPath, ['-e', "console.log(Object.keys(require('node:os').networkInterfaces()).join(','))"]);
    const listed = await launch(command);
    check(
      listed.status === 0 &&
        listed.stdout.trim() === 'lo' &&
        readJson(command.statusFile).started === true &&
        readJson(command.statusFile).signal === undefined,
      `a command target's interfaces were ${JSON.stringify(listed.stdout.trim())} (exit ${listed.status}); expected lo alone, exit 0 and a start mark`,
    );
    const failing = sandbox.wrap(process.execPath, ['-e', 'process.exit(5)']);
    check((await launch(failing)).status === 5, 'a command target that exits 5 did not keep its exit code in its own namespace');

    // A service the target starts is reached through the bridge; the target asking the bridge for a port of the host's
    // loopback is told `fail`, since the shim connects inside its own namespace.
    const bridgeDirectory = socketDirectory();
    const bridge = path.join(bridgeDirectory, 'bridge.sock');
    const service = `
      const http = require('node:http');
      const net = require('node:net');
      const [bridge, hostPort] = process.argv.slice(1);
      const server = http.createServer((request, response) => response.end('through the bridge'));
      server.listen(0, '127.0.0.1', () => {
        const asking = net.connect({ path: bridge });
        let answer = '';
        asking.on('data', (chunk) => (answer += chunk));
        asking.on('close', () => console.log('LISTENING ' + server.address().port + ' ASKED ' + JSON.stringify(answer)));
        asking.on('error', (error) => console.log('LISTENING ' + server.address().port + ' ASKED ' + error.code));
        asking.on('connect', () => asking.write('127.0.0.1 ' + hostPort + '\\n'));
      });
      setInterval(() => {}, 1000);
    `;
    const served = sandbox.wrap(process.execPath, ['-e', service, bridge, String(tcpServer.address().port)], [bridgeDirectory], [], {
      bridge,
    });
    const child = spawn(served.target, served.args, { cwd: workspace, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    try {
      const deadline = Date.now() + 20_000;
      while (!/LISTENING \d+ ASKED .*\n/.test(output) && Date.now() < deadline && child.exitCode === null) await sleep(50);
      const match = /LISTENING (\d+) ASKED (.*)\n/.exec(output);
      check(
        match !== null,
        `a confined service behind a bridge printed ${JSON.stringify(output)}; expected its port and what the bridge answered it`,
      );
      if (match !== null) {
        const inside = Number(match[1]);
        check(
          JSON.parse(match[2]) === 'fail\n',
          `the service asking its own bridge for a port of the host's loopback was answered ${match[2]}; expected "fail\\n"`,
        );
        check(
          (await bridgeAccepts(bridge, '127.0.0.1', inside)) === true &&
            (await bridgeAccepts(bridge, '127.0.0.1', tcpServer.address().port)) === 'ECONNREFUSED',
          'the bridge did not answer ok for the service port and fail for a port of the host only',
        );
        const forwarder = await startForwarder({ socketPath: bridge, address: '127.0.0.1', targetPort: inside, port: 0 });
        try {
          const body = await new Promise((resolve) => {
            http
              .get({ host: '127.0.0.1', port: forwarder.port, path: '/' }, (response) => {
                let text = '';
                response.on('data', (chunk) => (text += chunk));
                response.on('end', () => resolve(text));
              })
              .on('error', (error) => resolve(`error ${error.code}`));
          });
          check(body === 'through the bridge', `a request through the forwarder to the confined service got ${JSON.stringify(body)}`);
        } finally {
          await forwarder.close();
        }
      }
    } finally {
      // A child that ended already has no close left to wait for (a shim that exited, a Bubblewrap that failed).
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await Promise.race([new Promise((resolve) => child.once('close', resolve)), sleep(10_000)]);
      }
    }
  } finally {
    for (const server of [abstractServer, tcpServer]) await closeServer(server);
  }
}

// ---------------------------------------------------------------- Story 1.82: no route to the host's path-based sockets

/** The kernel's own header and rows of `/proc/net/unix`, as a stand-in table for the cases below. */
function socketTable(...entries) {
  const row = (name, inode) => `0000000000000000: 00000002 00000000 00010000 0001 01 ${inode}${name === null ? '' : ` ${name}`}`;
  return (
    ['Num       RefCount Protocol Flags    Type St Inode Path', ...entries.map((name, index) => row(name, 20_000 + index))].join('\n') +
    '\n'
  );
}

/** Listens on a Unix socket file and answers each connection with its end; the server and its path. */
async function listenOnSocket(socketPath) {
  const server = net.createServer((socket) => socket.end());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolve);
  });
  return server;
}

/**
 * The sockets a call mounts an empty device file over, read from the arguments file the launcher hands Bubblewrap
 * (`--args`); `null` for a call whose vector does not read that file, or whose file holds anything but `--ro-bind /dev/null <socket>`
 * triples.
 */
function maskedSockets(wrapped) {
  if (typeof wrapped.socketFile !== 'string') return [];
  // The vector must name the file the launcher opens, or Bubblewrap never reads a mount.
  if (wrapped.args.filter((argument, at) => argument === '--args' && wrapped.args[at + 1] === '3').length !== 1) return null;
  const words = fs.readFileSync(wrapped.socketFile, 'utf8').split('\0');
  if (words.pop() !== '' || words.length % 3 !== 0) return null;
  const sockets = [];
  for (let at = 0; at < words.length; at += 3) {
    if (words[at] !== '--ro-bind' || words[at + 1] !== '/dev/null') return null;
    sockets.push(words[at + 2]);
  }
  return sockets;
}

/**
 * A Bubblewrap command with the arguments file of the empty-device mounts taken out, which is the case's control: the
 * launcher goes, `--args <descriptor>` goes, and the command runs without a mount over a socket.
 */
function withoutSocketMasks(wrapped, executable) {
  if (typeof wrapped.socketFile !== 'string') return wrapped;
  const inner = wrapped.args.slice(wrapped.args.indexOf(executable));
  const at = inner.indexOf('--args');
  return { ...wrapped, target: inner[0], args: at === -1 ? inner.slice(1) : [...inner.slice(1, at), ...inner.slice(at + 2)] };
}

/**
 * An `fs` stand-in for the host's list (`hostPathSockets({ fileSystem })`): `tree` maps a directory to its entries (a `name`, as
 * a string or as the bytes a file system holds, and a `type` of `socket`, `directory` or `file`), a socket is a socket file where
 * `lstat` finds it, `refused` maps a path to the error code `lstat` answers, and every other path is gone. A file system that
 * holds names no UTF-8 (macOS refuses to make one) and directories no user could search is made here, without a user to be.
 */
function listFileSystem({ tree, refused = {}, table = path.join(os.tmpdir(), 'no-such-table') }) {
  const asked = [];
  const missing = (file) => Object.assign(new Error(`ENOENT: no such file or directory, '${file}'`), { code: 'ENOENT' });
  // A path is compared by its bytes: the decoded text of a name that is no UTF-8 names no file.
  const typeByPath = new Map(
    Object.entries(tree).flatMap(([directory, entries]) =>
      entries.map(({ name, type }) => [Buffer.concat([Buffer.from(`${directory}/`), Buffer.from(name)]).toString('latin1'), type]),
    ),
  );
  const typeOf = (file) => typeByPath.get(Buffer.from(file).toString('latin1')) ?? (tree[file] === undefined ? null : 'directory');
  return {
    asked,
    readFileSync: (file) => fs.readFileSync(file === table ? table : file),
    readdirSync(directory) {
      if (tree[directory] === undefined) throw missing(directory);
      return tree[directory].map(({ name, type }) => ({
        name: Buffer.from(name),
        isSocket: () => type === 'socket',
        isDirectory: () => type === 'directory',
      }));
    },
    realpathSync: {
      native(file) {
        if (typeOf(file) === null) throw missing(file);
        return file;
      },
    },
    lstatSync(file) {
      asked.push(file);
      if (refused[file] !== undefined)
        throw Object.assign(new Error(`${refused[file]}: permission denied, lstat '${file}'`), { code: refused[file] });
      const type = typeOf(file);
      if (type === null) throw missing(file);
      return { isSocket: () => type === 'socket' };
    },
  };
}

/**
 * The list of the host's sockets and the mounts it makes (Story 1.82), on every host: the table's rows (a path with a space,
 * an abstract name, an unnamed socket and a relative name); the real socket files that survive the filter (a link to a socket
 * or to its directory gives the socket's real path once, and a regular file, a vanished path and a path inside a granted
 * directory are left out); a missing table (a host with no Unix sockets, or a stand-in for Linux on another system) and an
 * unreadable one; the vector of a Bubblewrap call (one empty device file over each socket before the binds, whatever the
 * entry's network, the grants and the sandbox's own mounts handed to the list as what to leave out, a path no vector can carry
 * refused); a Seatbelt call that asks for no list; and the call that is made again when Bubblewrap could not start over a
 * socket that went away.
 */
async function checkPathSocketUnits() {
  const base = socketDirectory();
  const servers = [];
  try {
    // The table's rows.
    const text = socketTable(
      '/run/dbus/system_bus_socket',
      '/tmp/a dir/with space.sock',
      '@abstract-name',
      null,
      'relative.sock',
      '/var/run/docker.sock',
    );
    check(
      JSON.stringify(socketTablePaths(text)) ===
        JSON.stringify(['/run/dbus/system_bus_socket', '/tmp/a dir/with space.sock', '/var/run/docker.sock']),
      `the table's paths were ${JSON.stringify(socketTablePaths(text))}; expected the three absolute paths, the space kept, and none for an abstract, an unnamed or a relative socket`,
    );

    // The real files the table names.
    const own = path.join(base, 'own');
    const elsewhere = path.join(base, 'elsewhere');
    fs.mkdirSync(own);
    fs.mkdirSync(elsewhere);
    const hostSocket = path.join(elsewhere, 'host.sock');
    const ownSocket = path.join(own, 'own.sock');
    servers.push(await listenOnSocket(hostSocket), await listenOnSocket(ownSocket));
    const link = path.join(base, 'link.sock');
    fs.symlinkSync(hostSocket, link);
    const linkedDirectory = path.join(base, 'linked');
    fs.symlinkSync(elsewhere, linkedDirectory);
    const regular = path.join(elsewhere, 'regular');
    fs.writeFileSync(regular, '');
    const table = path.join(base, 'unix');
    fs.writeFileSync(
      table,
      socketTable(
        hostSocket,
        link,
        path.join(linkedDirectory, 'host.sock'),
        ownSocket,
        regular,
        path.join(elsewhere, 'gone.sock'),
        'host.sock',
        '@abstract',
      ),
    );
    const listed = hostPathSockets({ table, roots: [] });
    check(
      JSON.stringify(listed) === JSON.stringify([hostSocket, ownSocket].sort()),
      `the list was ${JSON.stringify(listed)}; expected the two real socket files once each, by real path: a link and a link to a directory resolve to them, a regular file, a vanished path, a relative name and an abstract name name nothing`,
    );
    const kept = hostPathSockets({ table, except: [own], roots: [] });
    check(
      JSON.stringify(kept) === JSON.stringify([hostSocket]),
      `with a granted directory left out the list was ${JSON.stringify(kept)}; expected only the socket outside it`,
    );
    // A socket moved after it bound is listed under a path that is gone; the socket files beside that path are listed.
    const moved = path.join(base, 'moved');
    fs.mkdirSync(moved);
    const final = path.join(moved, 'control');
    servers.push(await listenOnSocket(final));
    const movedTable = path.join(base, 'moved-table');
    fs.writeFileSync(movedTable, socketTable(path.join(moved, 'control.XXXXXXXXXXXXXXXX'), path.join(base, 'no-such-directory', 'x.sock')));
    const beside = hostPathSockets({ table: movedTable, roots: [] });
    check(
      JSON.stringify(beside) === JSON.stringify([final]),
      `with a table row for a path that was moved the list was ${JSON.stringify(beside)}; expected the socket file beside it`,
    );
    // The directories sockets are kept in are scanned for socket files the table does not name (a Docker socket shared into a
    // container, a socket bound by a relative path): the directory's own and its directories' are found, the ones below are not.
    const scanned = path.join(base, 'scanned');
    fs.mkdirSync(path.join(scanned, 'one', 'two'), { recursive: true });
    const shallow = path.join(scanned, 'shared.sock');
    const middle = path.join(scanned, 'one', 'middle.sock');
    const deep = path.join(scanned, 'one', 'two', 'deep.sock');
    for (const socketPath of [shallow, middle, deep]) servers.push(await listenOnSocket(socketPath));
    const found = hostPathSockets({ table: path.join(base, 'absent'), roots: [scanned, path.join(base, 'no-such-root')] });
    check(
      JSON.stringify(found) === JSON.stringify([middle, shallow].sort()),
      `a scan of a directory found ${JSON.stringify(found)}; expected the sockets in it and in its directories, and none below`,
    );
    check(
      !hostPathSockets({ table: path.join(base, 'absent'), roots: [scanned], except: [path.join(scanned, 'one')] }).includes(middle),
      'a scan listed a socket inside a directory left out',
    );
    // A scan that fails for a reason that is no path to hide (a process out of descriptors, an I/O error) fails the list, so a
    // socket only the scan would find is never left unmasked by a scan that did not finish; a root that is gone or one nobody can
    // search names nothing to hide.
    const scanTree = { [scanned]: [{ name: 'one.sock', type: 'socket' }] };
    const failingScan = (code) => {
      const standIn = listFileSystem({ tree: scanTree });
      standIn.readdirSync = () => {
        throw Object.assign(new Error(`${code}: scan failed`), { code });
      };
      return standIn;
    };
    for (const code of ['EMFILE', 'EIO']) {
      let thrown = null;
      try {
        hostPathSockets({ table: path.join(base, 'absent'), roots: [scanned], fileSystem: failingScan(code) });
      } catch (error) {
        thrown = error;
      }
      check(
        thrown?.code === code,
        `a scan that failed with ${code} gave ${thrown === null ? 'a list' : thrown.code}; expected the list to fail with it`,
      );
    }
    for (const code of ['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM']) {
      check(
        hostPathSockets({ table: path.join(base, 'absent'), roots: [scanned], fileSystem: failingScan(code) }).length === 0,
        `a scan that failed with ${code} did not list nothing`,
      );
    }
    // A name the runtime cannot spell: a socket file whose name is no UTF-8 (another user can make one in /tmp) and a directory whose
    // name is none decode to a path that is another file, and a mount over it stops every call. Neither is listed, the sockets
    // beside them are, and `lstat` is never asked about the decoded path. The table's row decodes to the same path and names
    // the directory the neighbors are read from.
    const bytes = (text) => Buffer.from(text, 'latin1');
    const nonUtf8Table = path.join(base, 'non-utf8-table');
    fs.writeFileSync(nonUtf8Table, bytes(socketTable('/tmp/ÿevil.sock')));
    const spellable = listFileSystem({
      table: nonUtf8Table,
      tree: {
        '/tmp': [
          { name: 'ok.sock', type: 'socket' },
          { name: bytes('ÿevil.sock'), type: 'socket' },
          { name: bytes('ÿdirectory'), type: 'directory' },
        ],
        [`/tmp/${bytes('ÿdirectory').toString('utf8')}`]: [{ name: 'inside.sock', type: 'socket' }],
      },
    });
    const spelled = hostPathSockets({ table: nonUtf8Table, roots: ['/tmp'], fileSystem: spellable });
    check(
      JSON.stringify(spelled) === JSON.stringify(['/tmp/ok.sock']) && spellable.asked.every((file) => !file.includes('�')),
      `a host holding a socket file named by bytes that are no UTF-8 listed ${JSON.stringify(spelled)} and asked lstat about ${JSON.stringify(spellable.asked)}; expected only the socket beside it, and no path a mount could not name`,
    );
    // A socket in a directory the runtime cannot search (listable, mode 744): `lstat` answers EACCES, the target cannot reach the
    // file either, and the entry is left out, as a path that is gone is, so it neither stops a call nor sends it round again.
    const searchable = listFileSystem({
      tree: {
        '/tmp': [
          { name: 'ok.sock', type: 'socket' },
          { name: 'noexec', type: 'directory' },
        ],
        '/tmp/noexec': [{ name: 's.sock', type: 'socket' }],
      },
      refused: { '/tmp/noexec/s.sock': 'EACCES' },
    });
    check(
      JSON.stringify(hostPathSockets({ table: path.join(base, 'absent'), roots: ['/tmp'], fileSystem: searchable })) ===
        JSON.stringify(['/tmp/ok.sock']),
      'a socket in a directory the runtime cannot search was listed, or the list failed over it',
    );
    if (process.getuid?.() !== 0) {
      const denied = path.join(base, 'denied');
      fs.mkdirSync(path.join(denied, 'noexec'), { recursive: true });
      servers.push(await listenOnSocket(path.join(denied, 'noexec', 's.sock')));
      fs.chmodSync(path.join(denied, 'noexec'), 0o444);
      try {
        const listedDenied = hostPathSockets({ table: path.join(base, 'absent'), roots: [denied] });
        check(
          listedDenied.length === 0,
          `a socket in a directory that is listable and not searchable was listed: ${JSON.stringify(listedDenied)}`,
        );
      } finally {
        fs.chmodSync(path.join(denied, 'noexec'), 0o755);
      }
    }
    // A host holding more sockets than a call can mount (another user can make as many socket files as the temp directory
    // takes): the list keeps the sockets of the kernel's table first, then each scanned root in turn, and ends at the bound,
    // which Bubblewrap's 9,000 arguments (three a mount) hold with room to spare.
    const crowd = Array.from({ length: MAX_HIDDEN_SOCKETS + 3000 }, (_, at) => ({
      name: `s-${String(at).padStart(6, '0')}.sock`,
      type: 'socket',
    }));
    const crowded = listFileSystem({
      table: nonUtf8Table,
      tree: { '/run': [{ name: 'docker.sock', type: 'socket' }], '/tmp': crowd },
    });
    const crowdTable = path.join(base, 'crowd-table');
    fs.writeFileSync(crowdTable, socketTable('/run/docker.sock'));
    const bounded = hostPathSockets({
      table: crowdTable,
      roots: ['/run', '/tmp'],
      fileSystem: { ...crowded, readFileSync: fs.readFileSync },
    });
    check(
      bounded.length === MAX_HIDDEN_SOCKETS &&
        bounded[0] === '/run/docker.sock' &&
        bounded[1] === '/tmp/s-000000.sock' &&
        MAX_HIDDEN_SOCKETS * 3 <= 8000,
      `a host with ${crowd.length + 1} socket files listed ${bounded.length}, the first ${bounded[0]}; expected ${MAX_HIDDEN_SOCKETS} (three Bubblewrap arguments each, nine thousand at most), the table's socket first`,
    );
    const few = hostPathSockets({
      table: crowdTable,
      roots: ['/run', '/tmp'],
      limit: 2,
      fileSystem: { ...crowded, readFileSync: fs.readFileSync },
    });
    check(
      JSON.stringify(few) === JSON.stringify(['/run/docker.sock', '/tmp/s-000000.sock']),
      `a list bounded at two was ${JSON.stringify(few)}`,
    );
    // The list is ranked by who can create a socket before it is cut (the host's own sockets first, then the runtime's user's, then
    // every other user's), so a local user who makes sockets in bulk can push out only their own and, taken in turns, no other user's
    // while the room holds a socket for each owner. The owner is injected (`uidOf`),
    // since a unit cannot chown. Each padding socket sorts before `/run`, the shape that pushed a service out of the list.
    const owners = (file) => (file.startsWith('/run') ? 0 : file.startsWith('/srv') ? 1000 : file.startsWith('/svc') ? 33 : 65_534);
    const rankOptions = { ownUid: 1000, uidOf: owners };
    const padding = Array.from({ length: MAX_HIDDEN_SOCKETS + 100 }, (_, at) => `/home/other/p-${String(at).padStart(5, '0')}.sock`);
    const paddedTable = path.join(base, 'padded-table');
    fs.writeFileSync(paddedTable, socketTable('/run/docker.sock', '/run/dbus/system_bus_socket', ...padding));
    const padded = listHostSockets({
      ...rankOptions,
      table: paddedTable,
      roots: [],
      pinned: [],
      fileSystem: {
        ...listFileSystem({
          tree: {
            '/run': [
              { name: 'docker.sock', type: 'socket' },
              { name: 'dbus', type: 'directory' },
            ],
            '/run/dbus': [{ name: 'system_bus_socket', type: 'socket' }],
            '/home/other': padding.map((socketPath) => ({ name: path.basename(socketPath), type: 'socket' })),
          },
        }),
        readFileSync: fs.readFileSync,
      },
    });
    check(
      padded.sockets.length === MAX_HIDDEN_SOCKETS &&
        JSON.stringify(padded.sockets.slice(0, 2)) === JSON.stringify(['/run/dbus/system_bus_socket', '/run/docker.sock']) &&
        padded.left === 102 &&
        padded.refused === null,
      `${padding.length} sockets of another user sorting before /run left the list as ${padded.sockets.length} long, starting ${JSON.stringify(padded.sockets.slice(0, 2))}, with ${padded.left} cut and the refusal ${padded.refused}; expected ${MAX_HIDDEN_SOCKETS} sockets with the two root-owned services first (each group sorted), 102 cut and no refusal`,
    );
    // The second route needs no descriptor: one socket moved after it bound and a directory full of stale socket files beside it
    // fill the neighbor group, which is read before the scanned roots; the services under a scanned root stay in the list.
    const staleTable = path.join(base, 'stale-table');
    fs.writeFileSync(staleTable, socketTable('/home/other/control.XXXXXXXX'));
    const stale = listHostSockets({
      ...rankOptions,
      table: staleTable,
      roots: ['/run'],
      pinned: [],
      fileSystem: {
        ...listFileSystem({
          tree: {
            '/home/other': padding.map((socketPath) => ({ name: path.basename(socketPath), type: 'socket' })),
            '/run': [{ name: 'docker.sock', type: 'socket' }],
          },
        }),
        readFileSync: fs.readFileSync,
      },
    });
    check(
      stale.sockets.length === MAX_HIDDEN_SOCKETS && stale.sockets[0] === '/run/docker.sock' && stale.left === 101,
      `${padding.length} stale socket files beside a moved path left the list as ${stale.sockets.length} long, starting ${JSON.stringify(stale.sockets.slice(0, 1))}, with ${stale.left} cut; expected ${MAX_HIDDEN_SOCKETS} sockets, the service under /run first and 101 cut`,
    );
    // A system account's socket ranks with root's, ahead of the runtime's user's and every other user's.
    const rankFileSystem = (tree) => ({ ...listFileSystem({ tree }), readFileSync: fs.readFileSync });
    const mixed = rankFileSystem({
      '/run': [{ name: 'a.sock', type: 'socket' }],
      '/svc': [{ name: 's.sock', type: 'socket' }],
      '/srv': [{ name: 'me.sock', type: 'socket' }],
      '/home/other': [{ name: 'o.sock', type: 'socket' }],
    });
    const ranked = listHostSockets({
      ...rankOptions,
      table: path.join(base, 'absent'),
      roots: ['/home/other', '/srv', '/svc', '/run'],
      pinned: [],
      fileSystem: mixed,
      limit: 3,
    });
    check(
      JSON.stringify(ranked.sockets) === JSON.stringify(['/svc/s.sock', '/run/a.sock', '/srv/me.sock']) && ranked.left === 1,
      `with sockets of a system account, root, the runtime's user and another user the list was ${JSON.stringify(ranked.sockets)} with ${ranked.left} cut; expected the system account's and root's (in the order the sources run), then the runtime's user's, and another user's cut`,
    );
    // The call is refused when the sockets only the host's own accounts and the runtime's user can create exceed the room.
    const owned = rankFileSystem({
      '/run': [
        { name: 'a.sock', type: 'socket' },
        { name: 'b.sock', type: 'socket' },
      ],
      '/srv': [
        { name: 'one.sock', type: 'socket' },
        { name: 'two.sock', type: 'socket' },
      ],
    });
    const overBudget = listHostSockets({
      ...rankOptions,
      table: path.join(base, 'absent'),
      roots: ['/run', '/srv'],
      pinned: [],
      fileSystem: owned,
      limit: 3,
    });
    check(
      overBudget.sockets.length === 0 &&
        /holds 4 Unix sockets that only root, a system account or the user running the call can create/.test(overBudget.refused ?? '') &&
        /room to hide 3/.test(overBudget.refused ?? ''),
      `two root-owned and two own sockets over a room of three were ${JSON.stringify(overBudget)}; expected a refusal naming the 4 sockets and the room of 3`,
    );
    let refusedError = null;
    try {
      hostPathSockets({ ...rankOptions, table: path.join(base, 'absent'), roots: ['/run', '/srv'], fileSystem: owned, limit: 3 });
    } catch (error) {
      refusedError = error;
    }
    check(refusedError?.code === 'EHOSTSOCKETBUDGET', `the array form of a refused list did not throw: ${refusedError}`);
    const atBudget = listHostSockets({
      ...rankOptions,
      table: path.join(base, 'absent'),
      roots: ['/run', '/srv'],
      pinned: [],
      fileSystem: owned,
      limit: 4,
    });
    check(
      atBudget.refused === null && atBudget.sockets.length === 4 && atBudget.left === 0,
      `four sockets in a room of four were ${JSON.stringify(atBudget)}`,
    );
    // Another user cannot cause the refusal: five sockets of theirs over a room of three are cut and the call goes ahead.
    const others = rankFileSystem({ '/home/other': Array.from({ length: 5 }, (_, at) => ({ name: `o${at}.sock`, type: 'socket' })) });
    const crowdedByOthers = listHostSockets({
      ...rankOptions,
      table: path.join(base, 'absent'),
      roots: ['/home/other'],
      pinned: [],
      fileSystem: others,
      limit: 3,
    });
    check(
      crowdedByOthers.refused === null && crowdedByOthers.sockets.length === 3 && crowdedByOthers.left === 2,
      `five sockets of another user over a room of three were ${JSON.stringify(crowdedByOthers)}; expected three listed, two cut and no refusal`,
    );
    // Every other user's sockets are taken in turns (the first socket of each owner, then the second of each), so one user's padding
    // cannot push out a third user's socket: `carol` serves one socket and `nobody` binds 2,100 that sort ahead of it, the shape that
    // listed none of carol's before the turns. The owners are injected (`uidOf`).
    const turnOwners = (file) =>
      file.startsWith('/home/pad') ? 65_534 : file.startsWith('/srv/dave') ? 1003 : file.startsWith('/tmp/carol') ? 1002 : 0;
    const turnOptions = { ownUid: 1000, uidOf: turnOwners, table: path.join(base, 'absent'), pinned: [] };
    const socketEntries = (directory, names) => ({ [directory]: names.map((name) => ({ name, type: 'socket' })) });
    const padded2100 = listHostSockets({
      ...turnOptions,
      roots: ['/home/pad', '/tmp/carol'],
      fileSystem: rankFileSystem({
        ...socketEntries(
          '/home/pad',
          Array.from({ length: MAX_HIDDEN_SOCKETS + 100 }, (_, at) => `a-${String(at).padStart(5, '0')}.sock`),
        ),
        ...socketEntries('/tmp/carol', ['agent.sock']),
      }),
    });
    check(
      padded2100.sockets.length === MAX_HIDDEN_SOCKETS &&
        padded2100.sockets.includes('/tmp/carol/agent.sock') &&
        padded2100.left === 101 &&
        padded2100.refused === null,
      `${MAX_HIDDEN_SOCKETS + 100} sockets of one user sorting before another user's socket left the list as ${padded2100.sockets.length} long, carol's socket ${padded2100.sockets.includes('/tmp/carol/agent.sock') ? 'listed' : 'missing'}, with ${padded2100.left} cut; expected the other user's socket listed and 101 cut`,
    );
    const owners3 = rankFileSystem({
      ...socketEntries(
        '/home/pad',
        Array.from({ length: 10 }, (_, at) => `a${at}.sock`),
      ),
      ...socketEntries('/srv/dave', ['d0.sock', 'd1.sock', 'd2.sock']),
      ...socketEntries('/tmp/carol', ['c0.sock']),
    });
    const inTurns = listHostSockets({ ...turnOptions, roots: ['/home/pad', '/srv/dave', '/tmp/carol'], fileSystem: owners3, limit: 5 });
    check(
      JSON.stringify(inTurns.sockets) ===
        JSON.stringify(['/home/pad/a0.sock', '/srv/dave/d0.sock', '/tmp/carol/c0.sock', '/home/pad/a1.sock', '/srv/dave/d1.sock']) &&
        inTurns.left === 9,
      `ten sockets of one user, three of another and one of a third over a room of five were ${JSON.stringify(inTurns.sockets)} with ${inTurns.left} cut; expected the first socket of each owner, then the second of each while the room lasts`,
    );
    const fewerThanOwners = listHostSockets({
      ...turnOptions,
      roots: ['/home/pad', '/srv/dave', '/tmp/carol'],
      fileSystem: owners3,
      limit: 2,
    });
    check(
      JSON.stringify(fewerThanOwners.sockets) === JSON.stringify(['/home/pad/a0.sock', '/srv/dave/d0.sock']),
      `a room of two for three owners listed ${JSON.stringify(fewerThanOwners.sockets)}; expected the first two owners' first sockets (the stated bound: the room is smaller than the owners)`,
    );
    // A directory holding a very large number of socket files beside one moved path: the neighbors join the list in a loop that
    // stops at the room, so no argument list or array grows with the directory (a spread of 150,000 elements overflows the stack),
    // and the sockets the room cut are counted. The directory reader is injected, so no 150,000 files are made.
    const moveTable = (...names) => {
      const file = path.join(base, `moved-${names.length}-table`);
      fs.writeFileSync(file, socketTable(...names));
      return file;
    };
    const hugeNames = Array.from({ length: 150_001 }, (_, at) => `n-${String(at).padStart(6, '0')}.sock`);
    const huge = rankFileSystem(socketEntries('/home/pad', hugeNames));
    let hugeList = null;
    let hugeError = null;
    try {
      hugeList = listHostSockets({ ...rankOptions, table: moveTable('/home/pad/tmp-name'), roots: [], pinned: [], fileSystem: huge });
    } catch (error) {
      hugeError = error;
    }
    check(
      hugeError === null &&
        hugeList.sockets.length === MAX_HIDDEN_SOCKETS &&
        hugeList.sockets[0] === '/home/pad/n-000000.sock' &&
        hugeList.left === hugeNames.length - MAX_HIDDEN_SOCKETS &&
        huge.asked.length === hugeNames.length + 1,
      `${hugeNames.length} socket files beside one moved path ended in ${hugeError === null ? `${hugeList.sockets.length} sockets with ${hugeList.left} cut after ${huge.asked.length} lstat call(s)` : `${hugeError.name}: ${hugeError.message}`}; expected ${MAX_HIDDEN_SOCKETS} listed, ${hugeNames.length - MAX_HIDDEN_SOCKETS} cut and one lstat call for each name and one for the directory (the owner of each is read)`,
    );
    // Many rows that name a path gone from one directory: the directory is read once and each of its neighbors is added once,
    // whatever the number of rows.
    const crowdNames = hugeNames.slice(0, MAX_HIDDEN_SOCKETS + 1000);
    const gone = Array.from({ length: 300 }, (_, at) => `/home/pad/gone-${String(at).padStart(3, '0')}`);
    const goneFileSystem = rankFileSystem(socketEntries('/home/pad', crowdNames));
    const reads = [];
    const goneList = listHostSockets({
      ...rankOptions,
      table: moveTable(...gone),
      roots: [],
      pinned: [],
      fileSystem: {
        ...goneFileSystem,
        readdirSync: (directory, options) => (reads.push(directory), goneFileSystem.readdirSync(directory, options)),
      },
    });
    check(
      reads.length === 1 &&
        goneList.sockets.length === MAX_HIDDEN_SOCKETS &&
        goneList.left === 1000 &&
        goneFileSystem.asked.length === crowdNames.length + 1,
      `${gone.length} table rows for paths gone from one directory of ${crowdNames.length} socket files read the directory ${reads.length} time(s), listed ${goneList.sockets.length} with ${goneList.left} cut after ${goneFileSystem.asked.length} lstat call(s); expected one read, ${MAX_HIDDEN_SOCKETS} listed, 1000 cut and one lstat call for each name and one for the directory, whatever the number of rows`,
    );
    // The neighbors are ranked by their owner, whichever directory the table names first: another user's directory of 3,000 socket
    // files (one moved socket held open beside them) cannot push out the runtime user's own moved socket (an SSH control master
    // binds `cm-host.tmp` and links it to `cm-host.sock`), root's, or a third user's, in either order of the table's rows. The
    // owners are injected (`uidOf`).
    const neighborOwners = (file) =>
      file === '/tmp/shared' || file === '/tmp/shared/z-root.sock' || file.startsWith('/var/lib/svc')
        ? 0
        : file.startsWith('/srv/me')
          ? 1000
          : file.startsWith('/tmp/carol')
            ? 1002
            : 65_534;
    const neighborTree = {
      ...socketEntries('/home/pad', crowdNames),
      ...socketEntries('/srv/me/.ssh', ['cm-host.sock']),
      ...socketEntries('/var/lib/svc', ['svc.sock']),
      ...socketEntries('/tmp/carol', ['agent.sock']),
      ...socketEntries('/tmp/shared', [...crowdNames, 'z-root.sock']),
    };
    const neighborRows = [
      ['/home/pad/tmp-name', '/srv/me/.ssh/cm-host.tmp', '/var/lib/svc/svc.tmp', '/tmp/carol/agent.tmp'],
      ['/tmp/carol/agent.tmp', '/var/lib/svc/svc.tmp', '/srv/me/.ssh/cm-host.tmp', '/home/pad/tmp-name'],
    ];
    for (const rows of neighborRows) {
      const ownRanked = listHostSockets({
        ownUid: 1000,
        uidOf: neighborOwners,
        table: moveTable(...rows, ...rows.map((row) => `${row}-again`)),
        roots: [],
        pinned: [],
        fileSystem: rankFileSystem(neighborTree),
      });
      const wanted = ['/var/lib/svc/svc.sock', '/srv/me/.ssh/cm-host.sock', '/tmp/carol/agent.sock'];
      check(
        wanted.every((socket) => ownRanked.sockets.includes(socket)) &&
          ownRanked.sockets.slice(0, 2).join(',') === wanted.slice(0, 2).join(',') &&
          ownRanked.sockets.length === MAX_HIDDEN_SOCKETS &&
          ownRanked.left === crowdNames.length - MAX_HIDDEN_SOCKETS + 3 &&
          ownRanked.refused === null,
        `with ${crowdNames.length} socket files of another user beside a moved path read ${rows[0] === '/home/pad/tmp-name' ? 'before' : 'after'} the moved paths of root's, the runtime user's and a third user's sockets the list held ${JSON.stringify(ownRanked.sockets.slice(0, 4))} (${ownRanked.sockets.length} long) with ${ownRanked.left} cut and the refusal ${ownRanked.refused}; expected root's, the runtime user's and the third user's sockets listed, root's and the runtime user's first, and no refusal`,
      );
    }
    // Root's socket in the very directory another user filled, sorting after 2,000 of theirs: charged to its own owner, it is listed.
    const sharedList = listHostSockets({
      ownUid: 1000,
      uidOf: neighborOwners,
      table: moveTable('/tmp/shared/gone'),
      roots: [],
      pinned: [],
      fileSystem: rankFileSystem(neighborTree),
    });
    check(
      sharedList.sockets[0] === '/tmp/shared/z-root.sock' &&
        sharedList.sockets.length === MAX_HIDDEN_SOCKETS &&
        sharedList.left === crowdNames.length - MAX_HIDDEN_SOCKETS + 1 &&
        sharedList.refused === null,
      `root's socket in a directory where another user's ${crowdNames.length} socket files sort first was ${JSON.stringify(sharedList.sockets.slice(0, 2))}, ${sharedList.sockets.length} long with ${sharedList.left} cut; expected it first and the other user's cut`,
    );
    // The directories are visited by who owns them: 100 sockets of one user in a root-owned directory (the shape of a shared temp
    // directory) are listed ahead of the same user's 2,000 in a directory of their own that sorts first by name.
    const visitList = listHostSockets({
      ownUid: 1000,
      uidOf: (file) => (file === '/run/x' ? 0 : 65_534),
      table: moveTable('/home/pad/gone', '/run/x/gone'),
      roots: [],
      pinned: [],
      fileSystem: rankFileSystem({
        ...socketEntries('/home/pad', crowdNames.slice(0, MAX_HIDDEN_SOCKETS)),
        ...socketEntries(
          '/run/x',
          crowdNames.slice(0, 100).map((name) => `x-${name}`),
        ),
      }),
    });
    check(
      visitList.sockets.length === MAX_HIDDEN_SOCKETS &&
        crowdNames.slice(0, 100).every((name) => visitList.sockets.includes(`/run/x/x-${name}`)) &&
        visitList.left === 100,
      `100 sockets of one user in a root-owned directory and 2,000 of theirs in a directory of their own that sorts first were ${visitList.sockets.length} long with ${visitList.left} cut and ${crowdNames.slice(0, 100).filter((name) => visitList.sockets.includes(`/run/x/x-${name}`)).length} of the first 100 listed; expected the root-owned directory read first, all 100 listed and 100 of the other directory cut`,
    );
    // A pinned service socket leads the list whoever owns it and however many sockets follow, a pin the host lacks is skipped, and
    // a pinned socket counts toward the sockets whose count refuses the call.
    const pinnedFileSystem = rankFileSystem({
      '/home/other': [
        { name: 'docker.sock', type: 'socket' },
        { name: 'x.sock', type: 'socket' },
      ],
      '/srv': [
        { name: 'me.sock', type: 'socket' },
        { name: 'you.sock', type: 'socket' },
      ],
    });
    const pinnedOptions = {
      ...rankOptions,
      table: path.join(base, 'absent'),
      roots: ['/home/other', '/srv'],
      pinned: ['/home/other/docker.sock', '/run/podman/podman.sock'],
      fileSystem: pinnedFileSystem,
    };
    const pinnedList = listHostSockets({ ...pinnedOptions, limit: 3 });
    check(
      JSON.stringify(pinnedList.sockets) === JSON.stringify(['/home/other/docker.sock', '/srv/me.sock', '/srv/you.sock']) &&
        pinnedList.left === 1 &&
        pinnedList.refused === null,
      `a pinned socket owned by another user, two of the runtime's user's, one more of another user's and a room of three were ${JSON.stringify(pinnedList)}; expected the pinned socket first, the two of the runtime's user's, and the other user's cut`,
    );
    check(
      listHostSockets({ ...pinnedOptions, limit: 2 }).refused !== null,
      "a pinned socket and two of the runtime's user's over a room of two were not refused; the pinned socket counts toward the refusal",
    );
    check(
      [
        '/run/docker.sock',
        '/var/run/docker.sock',
        '/run/containerd/containerd.sock',
        '/run/podman/podman.sock',
        '/run/dbus/system_bus_socket',
        '/run/systemd/private',
      ].every((service) => PINNED_SOCKETS.includes(service)),
      `the pinned sockets are ${JSON.stringify(PINNED_SOCKETS)}; expected Docker, containerd, Podman, the system bus and systemd's private socket among them`,
    );
    // A socket under /dev or /proc takes no room: the caller leaves both out because the vector mounts them of its own.
    const replacedTable = path.join(base, 'replaced-table');
    fs.writeFileSync(replacedTable, socketTable('/dev/shm/pad-1.sock', '/proc/1/root/x.sock', '/run/docker.sock'));
    const replaced = listHostSockets({
      ...rankOptions,
      table: replacedTable,
      roots: [],
      pinned: [],
      except: ['/dev', '/proc'],
      fileSystem: rankFileSystem({
        '/dev/shm': [{ name: 'pad-1.sock', type: 'socket' }],
        '/proc/1/root': [{ name: 'x.sock', type: 'socket' }],
        '/run': [{ name: 'docker.sock', type: 'socket' }],
      }),
    });
    check(
      JSON.stringify(replaced.sockets) === JSON.stringify(['/run/docker.sock']) && replaced.left === 0,
      `sockets under /dev and /proc, left out, listed as ${JSON.stringify(replaced)}; expected the one under /run and nothing cut`,
    );
    // The scan reads at most the bound of directories of a root, in name order: a socket in a later directory is left out.
    const crowdedRoot = path.join(base, 'crowded-root');
    for (const name of ['a', 'b']) fs.mkdirSync(path.join(crowdedRoot, name), { recursive: true });
    for (const name of ['a', 'b']) servers.push(await listenOnSocket(path.join(crowdedRoot, name, 'later.sock')));
    const absentTable = path.join(base, 'absent');
    check(
      JSON.stringify(hostPathSockets({ table: absentTable, roots: [crowdedRoot], directories: 1 })) ===
        JSON.stringify([path.join(crowdedRoot, 'a', 'later.sock')]) &&
        hostPathSockets({ table: absentTable, roots: [crowdedRoot] }).length === 2,
      'a scan bounded at one directory did not leave out the socket of the second, or an unbounded scan left one out',
    );
    // A line break in a socket file's name under a scanned root is found and hidden (the table's rows end at a line break, so it
    // is the scan that names it); a hard link to a socket file listed by the table is another path to it and is not listed.
    const broken = path.join(base, 'broken');
    fs.mkdirSync(broken);
    const lineBreak = path.join(broken, 'line\nbreak.sock');
    servers.push(await listenOnSocket(lineBreak));
    check(
      JSON.stringify(hostPathSockets({ table: absentTable, roots: [broken] })) === JSON.stringify([lineBreak]),
      'a socket file whose name holds a line break under a scanned root was not listed',
    );
    // The table's rows end at a line break, so a socket under a directory whose name holds one is named by no row the runtime can
    // read; outside the scanned roots it stays reachable, which the reference states.
    const brokenDirectory = path.join(base, 'line\nbreak-directory');
    fs.mkdirSync(brokenDirectory);
    const brokenOutside = path.join(brokenDirectory, 'outside.sock');
    servers.push(await listenOnSocket(brokenOutside));
    const brokenTable = path.join(base, 'broken-table');
    fs.writeFileSync(brokenTable, socketTable(brokenOutside));
    check(
      hostPathSockets({ table: brokenTable, roots: [] }).length === 0,
      'a socket under a directory whose name holds a line break, outside the scanned roots, was listed from a table row that a line break splits',
    );
    check(
      MAX_HIDDEN_SOCKETS === 2000 && SCAN_DIRECTORIES === 2000,
      `the bounds are ${MAX_HIDDEN_SOCKETS} sockets and ${SCAN_DIRECTORIES} directories; the reference states 2,000 of each`,
    );
    const hardDirectory = path.join(base, 'hard');
    fs.mkdirSync(hardDirectory);
    const hardLink = path.join(hardDirectory, 'hard.sock');
    fs.linkSync(hostSocket, hardLink);
    const hardTable = path.join(base, 'hard-table');
    fs.writeFileSync(hardTable, socketTable(hostSocket));
    const hardList = hostPathSockets({ table: hardTable, roots: [] });
    check(
      JSON.stringify(hardList) === JSON.stringify([hostSocket]) && !hardList.includes(hardLink),
      `with a hard link to a listed socket file the list was ${JSON.stringify(hardList)}; expected the listed path alone, which leaves the link reachable, the limit the reference states`,
    );
    check(hostPathSockets({ table: path.join(base, 'absent'), roots: [] }).length === 0, 'a host with no socket table listed a socket');
    let unreadable = null;
    try {
      hostPathSockets({ table: base, roots: [] });
    } catch (error) {
      unreadable = error;
    }
    check(
      unreadable !== null,
      'a socket table the runtime could not read was taken for an empty one, which would leave every socket reachable',
    );

    // The vector of a Bubblewrap call.
    const root = fs.realpathSync(tempDir('path-socket-units'));
    const folder = path.join(root, 'evals', 'verdict');
    const workspace = path.join(root, 'workspace');
    const status = path.join(root, 'status');
    const callDirectory = path.join(root, 'call');
    const privateRoot = path.join(root, 'private');
    const gitDirectory = path.join(root, 'project', '.git');
    for (const directory of [folder, workspace, status, callDirectory, privateRoot, gitDirectory])
      fs.mkdirSync(directory, { recursive: true });
    const bubblewrap = { mode: 'bubblewrap', executable: '/usr/bin/bwrap', evaluationFolder: folder };
    const asked = [];
    const sandbox = targetSandbox({
      confinement: bubblewrap,
      workspace,
      status,
      privateRoot,
      git: { directory: gitDirectory, metadata: null },
      hostSockets: (options) => (asked.push(options), ['/run/docker.sock', '/tmp/agent/agent.sock']),
    });
    const wrapped = sandbox.wrap('/bin/true', [], [callDirectory]);
    const at = wrapped.args.indexOf('--args');
    const masks = maskedSockets(wrapped);
    check(
      JSON.stringify(masks) === JSON.stringify(['/run/docker.sock', '/tmp/agent/agent.sock']) &&
        wrapped.target === '/bin/sh' &&
        wrapped.args[at + 1] === '3' &&
        !wrapped.args.includes('/dev/null') &&
        at > wrapped.args.indexOf('--unsetenv') &&
        at > wrapped.args.indexOf('--ro-bind') &&
        at < wrapped.args.indexOf('--bind') &&
        wrapped.hiddenSockets.length === 2,
      `a Bubblewrap call's vector is ${wrapped.args.join(' ')} with the mounts ${JSON.stringify(masks)}; expected an empty device file over each socket the list named, carried by the file the launcher hands Bubblewrap (--args), after the root bind and the isolation and before the first bind, and a list of two`,
    );
    const left = asked[0]?.except ?? [];
    const named = (directory) => left.includes(directory);
    check(
      [
        workspace,
        callDirectory,
        folder,
        gitDirectory,
        privateRoot,
        '/dev',
        '/proc',
        ...(fs.existsSync('/run/user') ? ['/run/user'] : []),
      ].every(named),
      `the list was asked to leave out ${JSON.stringify(left)}; expected the workspace, the call's directory, the evaluation folder, the git directory, the private root, /dev, /proc and /run/user where it exists, which the call owns or the sandbox covers or replaces`,
    );
    // A socket another user bound under a name no profile could carry cannot refuse every call: the argument carries it as it is.
    const odd = targetSandbox({ confinement: bubblewrap, workspace, status, hostSockets: () => [String.raw`/tmp/a"b\c.sock`] }).wrap(
      '/bin/true',
      [],
    );
    check(
      JSON.stringify(maskedSockets(odd)) === JSON.stringify([String.raw`/tmp/a"b\c.sock`]) && odd.hiddenSockets.length === 1,
      `a socket whose path holds a quote and a backslash was not carried into the vector: ${odd.args.join(' ')}`,
    );
    // The mounts of a list that long reach Bubblewrap in a file, so the call's argument list stays short.
    const crowdedCall = targetSandbox({
      confinement: bubblewrap,
      workspace,
      status,
      hostSockets: () =>
        Array.from({ length: MAX_HIDDEN_SOCKETS }, (_, at) => `/tmp/many-${String(at).padStart(6, '0')}-padding-padding-padding.sock`),
    }).wrap('/bin/true', []);
    check(
      crowdedCall.args.join(' ').length < 4000 && maskedSockets(crowdedCall)?.length === MAX_HIDDEN_SOCKETS,
      `a call hiding ${MAX_HIDDEN_SOCKETS} sockets has ${crowdedCall.args.join(' ').length} characters of arguments and ${maskedSockets(crowdedCall)?.length} mounts in its file; expected a short list and every mount in the file`,
    );
    // A list longer than the call's command leaves room for is refused at the call, whatever produced it.
    let tooMany = null;
    try {
      targetSandbox({
        confinement: bubblewrap,
        workspace,
        status,
        hostSockets: () => Array.from({ length: 30_000 }, (_, at) => `/tmp/many-${at}.sock`),
      }).wrap('/bin/true', []);
    } catch (error) {
      tooMany = error;
    }
    check(
      tooMany?.name === 'ConfinementError' && /leaves room for 2000/.test(tooMany.message),
      `a list of 30000 sockets was not refused by a call with room for ${MAX_HIDDEN_SOCKETS}: ${tooMany}`,
    );
    // The room for mounts is what the call's own command leaves: Bubblewrap counts the whole command line, the target's arguments
    // included, with what `--args` reads against one bound (a host with 2,000 mounts and a target of 3,100 arguments refused to start).
    const honoring =
      (count, asks = []) =>
      ({ limit }) => {
        asks.push(limit);
        return {
          sockets: Array.from({ length: Math.min(count, limit) }, (_, at) => `/tmp/many-${String(at).padStart(5, '0')}.sock`),
          left: Math.max(0, count - limit),
          refused: null,
        };
      };
    const counted = (wrapped, executable) =>
      wrapped.args.length - wrapped.args.indexOf(executable) + 3 * (maskedSockets(wrapped)?.length ?? 0);
    for (const length of [0, 100, 2900, 3100, 6000]) {
      const asks = [];
      const long = targetSandbox({ confinement: bubblewrap, workspace, status, hostSockets: honoring(5000, asks) }).wrap(
        '/bin/true',
        Array.from({ length }, (_, at) => String(at)),
      );
      const total = counted(long, '/usr/bin/bwrap');
      const mounts = maskedSockets(long)?.length;
      check(
        asks.length === 1 &&
          total <= BUBBLEWRAP_ARGUMENT_LIMIT - 1 &&
          (mounts === MAX_HIDDEN_SOCKETS ? total < 8990 : total >= 8990) &&
          mounts === asks[0],
        `a target with ${length} arguments was given the room ${asks[0]} and mounts ${mounts} sockets, ${total} arguments in all; expected the room of its command (${MAX_HIDDEN_SOCKETS} at most), a total of 8990 to 8999 arguments once the room is not the bound, and the call hiding what the room holds`,
      );
    }
    check(
      socketBudget(11) === MAX_HIDDEN_SOCKETS &&
        socketBudget(BUBBLEWRAP_ARGUMENT_LIMIT) === 0 &&
        socketBudget(100_000) === 0 &&
        socketBudget(3111) === 1960 &&
        socketBudget(8000) === 330,
      `the room for mounts was ${socketBudget(11)} for a command of 11 arguments, ${socketBudget(3111)} for 3111, ${socketBudget(8000)} for 8000; expected 2000, 1960 and 330, and none for a command past the bound`,
    );
    // A call whose command leaves less room than the sockets root, the system accounts and the runtime's user can create is refused.
    const hostOwned = listFileSystem({
      tree: { '/run': Array.from({ length: 5 }, (_, at) => ({ name: `svc-${at}.sock`, type: 'socket' })) },
    });
    const rootOwned = (options) =>
      listHostSockets({
        ...options,
        table: path.join(base, 'absent'),
        roots: ['/run'],
        pinned: [],
        uidOf: () => 0,
        fileSystem: { ...hostOwned, readFileSync: fs.readFileSync },
      });
    const roomy = targetSandbox({ confinement: bubblewrap, workspace, status, hostSockets: rootOwned }).wrap('/bin/true', ['1', '2']);
    check(maskedSockets(roomy)?.length === 5, `a call with room for its five root-owned sockets hid ${maskedSockets(roomy)?.length}`);
    let tight = null;
    const statusBefore = fs.readdirSync(status).length;
    try {
      targetSandbox({ confinement: bubblewrap, workspace, status, hostSockets: rootOwned }).wrap(
        '/bin/true',
        Array.from({ length: 8950 }, (_, at) => String(at)),
      );
    } catch (error) {
      tight = error;
    }
    check(
      tight?.name === 'ConfinementError' &&
        /holds 5 Unix sockets that only root, a system account or the user running the call can create/.test(tight.message) &&
        /room to hide \d/.test(tight.message) &&
        /of the 9000 arguments Bubblewrap accepts/.test(tight.message) &&
        fs.readdirSync(status).length === statusBefore,
      `a call whose own 8950 arguments leave no room for five root-owned sockets ended ${tight?.message ?? 'without a refusal'}; expected a ConfinementError naming the sockets, the room and Bubblewrap's bound, with no status file left`,
    );
    // A list the call's own host sockets cannot hold stays out of the arguments of the retry: the second start keeps the first list.
    const sizeAsks = [];
    const keptList = targetSandbox({ confinement: bubblewrap, workspace, status, hostSockets: honoring(5000, sizeAsks) });
    const first = keptList.wrap(
      '/bin/true',
      Array.from({ length: 3100 }, (_, at) => String(at)),
    );
    const again = keptList.wrap(
      '/bin/true',
      Array.from({ length: 3100 }, (_, at) => String(at)),
      [],
      [],
      { sockets: first.hiddenSockets.slice(1) },
    );
    check(
      sizeAsks.length === 1 &&
        counted(again, '/usr/bin/bwrap') <= BUBBLEWRAP_ARGUMENT_LIMIT - 1 &&
        maskedSockets(again)?.length === first.hiddenSockets.length - 1,
      `the retry of a call with 3100 arguments asked for the room ${sizeAsks.length} time(s) in all and held ${maskedSockets(again)?.length} sockets in ${counted(again, '/usr/bin/bwrap')} arguments; expected the first list less one, within the bound`,
    );

    // The target's environment equals the call's for every variable whose name is a valid shell identifier and that the shell does
    // not initialize, whether or not the host holds sockets: the launcher's shell leaves `PWD` (dash), `SHLVL`, `_` and `OLDPWD`
    // (bash) in the environment of what it executes and resets `IFS`, `OPTIND` and `PPID` (dash) when the call's environment held
    // them, and `env` puts each back as the call had it. The limit below holds what the launcher does not carry (Story 1.89). The stub
    // stands in for Bubblewrap and is no shell (a shell would set the same variables again), and the full environment is compared.
    const envStubs = tempDir('environment-stubs');
    const envStub = path.join(envStubs, 'bwrap');
    fs.writeFileSync(
      envStub,
      `#!${process.execPath}\nconst i = process.argv.indexOf('--');\nconst ran = require('node:child_process').spawnSync(process.argv[i + 1], process.argv.slice(i + 2), { stdio: 'inherit' });\nprocess.exit(ran.status ?? 1);\n`,
      { mode: 0o755 },
    );
    const printEnvironment = ['-e', 'process.stdout.write(JSON.stringify(Object.entries(process.env).sort()))'];
    const environmentOf = (sockets, environment) => {
      const wrapped = targetSandbox({
        confinement: { mode: 'bubblewrap', executable: envStub, evaluationFolder: folder },
        workspace,
        status,
        hostSockets: () => sockets,
      }).wrap(process.execPath, printEnvironment, [], [], { environment });
      const ran = spawnSync(wrapped.target, wrapped.args, { cwd: workspace, env: environment, encoding: 'utf8' });
      return { hid: wrapped.socketFile !== null, status: ran.status, out: ran.stdout, err: ran.stderr };
    };
    for (const [what, environment] of [
      ['no variable of the shell', { FOO: '1', PATH: process.env.PATH }],
      [
        'a PWD that names another directory, a SHLVL, an OLDPWD and a _',
        { FOO: '1', PATH: process.env.PATH, PWD: '/nonexistent', SHLVL: '7', OLDPWD: '/old', _: '/usr/bin/odd' },
      ],
      ['an empty PWD', { PATH: process.env.PATH, PWD: '' }],
      ['an IFS, an OPTIND and a PPID', { FOO: '1', PATH: process.env.PATH, IFS: 'x', OPTIND: '5', PPID: '7' }],
      ['an empty IFS and an OPTIND of 0', { PATH: process.env.PATH, IFS: '', OPTIND: '0' }],
      ['an OPTIND that is no number', { FOO: '1', PATH: process.env.PATH, OPTIND: 'abc' }],
      [
        'ordinary names that are valid shell identifiers',
        { PATH: process.env.PATH, my_setting: 'a b', _x1: '', HOME: '/home/tester', LANG: 'C', TERM: 'dumb', Mixed_Case9: '=x=' },
      ],
    ]) {
      const without = environmentOf([], environment);
      const hiding = environmentOf([hostSocket], environment);
      check(
        !without.hid && hiding.hid && without.status === 0 && hiding.status === 0 && without.out === hiding.out,
        `with ${what} the target's environment was ${without.out} without hidden sockets and ${hiding.out} with them (exit ${without.status} and ${hiding.status}: ${without.err}${hiding.err}); expected the same`,
      );
    }
    // The limit the reference states: a name no shell can hold, an exported shell function and a variable bash initializes itself
    // are the shell's to change, so the environment of a call that hides sockets can differ from the call's. The control (no hidden
    // socket) holds each exactly, and on any one host's `sh` at least one of the three differs; Story 1.89 replaces the launcher and
    // turns this check into byte-identity.
    const limitEnvironments = [
      ['a name that is no valid shell name', { PATH: process.env.PATH, 'my.setting': 'v' }],
      ['an exported shell function', { PATH: process.env.PATH, 'BASH_FUNC_f%%': '() { echo f; }' }],
      ['a held PS1', { PATH: process.env.PATH, PS1: 'prompt> ' }],
    ];
    let limitDiffers = 0;
    for (const [what, environment] of limitEnvironments) {
      const without = environmentOf([], environment);
      const hiding = environmentOf([hostSocket], environment);
      const [key, value] = Object.entries(environment).find(([name]) => name !== 'PATH');
      check(
        !without.hid && hiding.hid && without.status === 0 && hiding.status === 0 && without.out.includes(JSON.stringify([key, value])),
        `with ${what} the call without hidden sockets printed ${without.out} (exit ${without.status}: ${without.err}); expected the control to hold ${key} exactly`,
      );
      if (without.out !== hiding.out) limitDiffers += 1;
    }
    check(
      limitDiffers > 0,
      "the three environments the launcher does not carry (a name no shell holds, an exported function, a held PS1) all reached the target unchanged on this host's sh; the reference states the limit and Story 1.89 closes it, so update both together",
    );
    // What the calls left reachable once the room ran out is counted for the run to record (`socketReport`): the calls that listed,
    // those the room cut and the most sockets one call left; a sandbox that hides none (Seatbelt) reports nothing.
    const lefts = [0, 7, 3];
    const reporting = targetSandbox({
      confinement: bubblewrap,
      workspace,
      status,
      hostSockets: () => ({ sockets: ['/run/docker.sock'], left: lefts.shift(), refused: null }),
    });
    const reportBefore = reporting.socketReport();
    for (let call = 0; call < 3; call += 1) reporting.wrap('/bin/true', []);
    check(
      JSON.stringify(reportBefore) === JSON.stringify({ calls: 0, truncatedCalls: 0, socketsLeftReachable: 0 }) &&
        JSON.stringify(reporting.socketReport()) === JSON.stringify({ calls: 3, truncatedCalls: 2, socketsLeftReachable: 7 }),
      `three calls that left 0, 7 and 3 sockets reachable reported ${JSON.stringify(reporting.socketReport())}; expected 3 calls, 2 cut and 7 at most, from ${JSON.stringify(reportBefore)}`,
    );
    check(
      targetSandbox({
        confinement: { mode: 'seatbelt', executable: '/usr/bin/sandbox-exec', evaluationFolder: folder },
        workspace,
      }).socketReport() === null,
      'a Seatbelt sandbox reported what it left reachable, which only Bubblewrap hides',
    );
    // The entry of a trial that left sockets reachable, and the summary's sentence; a trial that left none has no entry.
    const armOf = { conditionArm: 'clean' };
    check(
      JSON.stringify(
        socketTruncationEntry(armOf, { trialIndex: 2, hostSocketReport: { calls: 5, truncatedCalls: 2, socketsLeftReachable: 7 } }),
      ) === JSON.stringify({ conditionArm: 'clean', trialIndex: 2, calls: 5, truncatedCalls: 2, socketsLeftReachable: 7 }) &&
        socketTruncationEntry(armOf, { trialIndex: 1, hostSocketReport: { calls: 5, truncatedCalls: 0, socketsLeftReachable: 0 } }) ===
          null &&
        socketTruncationEntry(armOf, { trialIndex: 1, hostSocketReport: null }) === null &&
        leftSocketsNote([]) === '' &&
        leftSocketsNote([{ conditionArm: 'clean', trialIndex: 2, calls: 5, truncatedCalls: 2, socketsLeftReachable: 7 }]).includes(
          'clean trial 2 (2 of 5 call(s), up to 7 socket(s))',
        ),
      'the run.json entry of a trial that left sockets reachable, or the summary sentence naming it, was not as stated',
    );
    let relative = null;
    try {
      targetSandbox({ confinement: bubblewrap, workspace, status, hostSockets: () => ['relative.sock'] }).wrap('/bin/true', []);
    } catch (error) {
      relative = error;
    }
    check(relative?.name === 'ConfinementError', `a socket with no absolute path was not refused: ${relative}`);
    const none = targetSandbox({ confinement: bubblewrap, workspace, status, hostSockets: () => [] }).wrap('/bin/true', []);
    check(
      none.socketFile === null && none.target === '/usr/bin/bwrap' && !none.args.includes('--args') && none.hiddenSockets.length === 0,
      'a call for a host with no socket carried a mask or a launcher',
    );
    let seatbeltAsked = false;
    targetSandbox({
      confinement: { mode: 'seatbelt', executable: '/usr/bin/sandbox-exec', evaluationFolder: folder },
      workspace,
      hostSockets: () => ((seatbeltAsked = true), []),
    }).wrap('/bin/true', []);
    check(!seatbeltAsked, 'a Seatbelt call asked for the host sockets, which only Bubblewrap hides');
    const layer = layerPrefix(bubblewrap);
    check(
      !layer.includes('/dev/null') && !layer.includes('--args'),
      "the evaluation layer's vector hides a socket, which only a target's does",
    );

    // The call that is made again.
    const stubs = tempDir('masked-start-stubs');
    const counter = path.join(stubs, 'count');
    const failures = path.join(stubs, 'failures');
    const maskLog = path.join(stubs, 'masks');
    const effects = path.join(stubs, 'effects');
    // Fails to start as Bubblewrap does over a socket that went away until it has been started `failures` times, writing the
    // mounts it was handed (`--args` reads descriptor 3) to a file of its own; once it starts, it runs the command after `--`.
    const writeStub = (body) => fs.writeFileSync(path.join(stubs, 'bwrap'), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
    const startOver = `n=$(cat ${JSON.stringify(counter)} 2>/dev/null || echo 0); n=$((n + 1)); echo $n > ${JSON.stringify(counter)}
tr '\\0' '\\n' <&3 > ${JSON.stringify(maskLog)}-$n 2>/dev/null`;
    const failing = `if [ "$n" -le "$(cat ${JSON.stringify(failures)})" ]; then echo "bwrap: Can't create file at /tmp/agent/agent.sock: Read-only file system" >&2; exit 1; fi
while [ "$1" != "--" ]; do shift; done; shift; exec "$@"`;
    writeStub(`${startOver}\n${failing}`);
    const stubbed = { mode: 'bubblewrap', executable: path.join(stubs, 'bwrap'), evaluationFolder: folder };
    const launch = (request) =>
      runToEnd(request.target, request.argv ?? request.targetArgs, { env: { PATH: process.env.PATH }, cwd: workspace }).then((ran) => ({
        exitCode: ran.status,
        stdout: ran.stdout,
        stderr: ran.stderr,
      }));
    // The adapter throws when a tool server's process ends before the session answers, as Bubblewrap that never started does.
    const tool = async (request) => {
      const ran = await launch(request);
      if (ran.exitCode !== 0) throw new Error('the server exited during initialize');
      return ran;
    };
    const inner = { run: launch, callTool: tool };
    const ran = ['-e', "console.log('ran')"];
    // `lists` is what each ask for the host's sockets returns, the last one again after that; the mounts of each start are read back.
    const attempt = async (lists, failed, { signal = new AbortController().signal, tool = false, argv = ran } = {}) => {
      fs.writeFileSync(failures, String(failed));
      for (const name of fs.readdirSync(stubs)) if (name === 'count' || name.startsWith('masks-')) fs.rmSync(path.join(stubs, name));
      let asked = 0;
      const hostSockets = () => lists[Math.min(asked++, lists.length - 1)];
      const sandboxed = targetSandbox({ confinement: stubbed, workspace, status, hostSockets });
      const mechanism = tool
        ? confinedMcpMechanism(inner, sandboxed, () => [], [])
        : confinedCommandMechanism(inner, sandboxed, () => [], []);
      let outcome;
      try {
        outcome = tool
          ? await mechanism.callTool({ target: process.execPath, targetArgs: argv, env: {} }, signal)
          : await mechanism.run({ target: process.execPath, subcommandPath: [], argv, env: {} }, signal);
      } catch (error) {
        outcome = error;
      }
      const calls = Number(fs.readFileSync(counter, 'utf8'));
      const starts = Array.from({ length: calls }, (_, at) => {
        const logged = path.join(stubs, `masks-${at + 1}`);
        return fs.existsSync(logged)
          ? fs
              .readFileSync(logged, 'utf8')
              .split('\n')
              .filter((line) => line.startsWith('/') && line !== '/dev/null')
          : [];
      });
      return { outcome, calls, lists: asked, starts, report: sandboxed.socketReport() };
    };
    // A socket that went away: the list names a path that is no socket now.
    const vanished = '/tmp/agent/agent.sock';
    const sockets = [vanished];
    const once = await attempt([[vanished, hostSocket]], 1);
    check(
      once.calls === 2 &&
        once.outcome.exitCode === 0 &&
        once.outcome.stdout.trim() === 'ran' &&
        JSON.stringify(once.starts) === JSON.stringify([[vanished, hostSocket], [hostSocket]]),
      `a call whose Bubblewrap failed once over a hidden socket made ${once.calls} start(s) and ended ${JSON.stringify(once.outcome.message ?? once.outcome)} with the mounts ${JSON.stringify(once.starts)}; expected a second start over the call's own list without the vanished socket that ran the target`,
    );
    // The call that started again counts once in the record of what the room left reachable, with the list of its first start.
    const cutOnce = await attempt([{ sockets: [vanished, hostSocket], left: 4, refused: null }], 1);
    check(
      cutOnce.calls === 2 && JSON.stringify(cutOnce.report) === JSON.stringify({ calls: 1, truncatedCalls: 1, socketsLeftReachable: 4 }),
      `a call whose list left 4 sockets reachable and started twice reported ${JSON.stringify(cutOnce.report)} after ${cutOnce.calls} start(s); expected one call, cut once, 4 left`,
    );
    const always = await attempt([sockets], 99);
    check(
      always.calls === 2 &&
        always.outcome?.name === 'ConfinementError' &&
        always.outcome.message.includes("Can't create file at /tmp/agent/agent.sock"),
      `a call whose Bubblewrap never started over a hidden socket made ${always.calls} start(s) and ended ${JSON.stringify(always.outcome?.message ?? always.outcome)}; expected a second start without the vanished socket, then the refusal naming Bubblewrap's words`,
    );
    const plain = await attempt([[]], 1);
    check(
      plain.calls === 1 && plain.outcome?.name === 'ConfinementError',
      `a call that hides no socket and failed to start made ${plain.calls} start(s); expected one, since nothing it hid can have gone away`,
    );
    // A hidden socket that is still there and a start that failed all the same is no race, and fails at once.
    const still = await attempt([[hostSocket]], 99);
    check(
      still.calls === 1 && still.outcome?.name === 'ConfinementError',
      `a call whose hidden socket still existed made ${still.calls} start(s); expected one, since the socket did not go away`,
    );
    const aborted = new AbortController();
    aborted.abort();
    const stopped = await attempt([sockets], 99, { signal: aborted.signal });
    check(stopped.calls === 1, `a call that was aborted made ${stopped.calls} start(s); expected one`);
    const tooled = await attempt([sockets], 1, { tool: true });
    check(
      tooled.calls === 2 && tooled.outcome.exitCode === 0,
      `a tool server whose Bubblewrap failed once over a hidden socket made ${tooled.calls} start(s); expected a second that ran it`,
    );
    const tooledAlways = await attempt([sockets], 99, { tool: true });
    check(
      tooledAlways.calls === 2 && /exited during initialize/.test(tooledAlways.outcome?.message ?? ''),
      `a tool server whose Bubblewrap never started made ${tooledAlways.calls} start(s) and ended ${JSON.stringify(tooledAlways.outcome?.message)}; expected a second without the vanished socket, then the adapter's own error`,
    );

    // A socket another user creates while the call starts cannot join it: the second start keeps the call's own list, so churn
    // on a busy host cannot keep a call from starting, and the list is asked for once.
    const fresh = path.join(base, 'fresh.sock');
    servers.push(await listenOnSocket(fresh));
    const churned = await attempt(
      [
        [vanished, hostSocket],
        [hostSocket, fresh],
      ],
      1,
    );
    check(
      churned.calls === 2 &&
        churned.lists === 1 &&
        JSON.stringify(churned.starts[1]) === JSON.stringify([hostSocket]) &&
        churned.outcome.exitCode === 0,
      `a call started again over churning sockets asked for the list ${churned.lists} time(s) and mounted ${JSON.stringify(churned.starts)}; expected one list, and a second start over the call's own list without the vanished socket and with no socket another process created meanwhile`,
    );
    // The starts are bounded by the list: each start that fails over a socket that went away has one fewer, so a list of three
    // sockets that go away one at a time ends after four starts, the last with none.
    const going = ['a', 'b', 'c'].map((name) => path.join(base, `going-${name}.sock`));
    for (const goingSocket of going) servers.push(await listenOnSocket(goingSocket));
    writeStub(
      `${startOver}\nfor file in ${going.map((file) => JSON.stringify(file)).join(' ')}; do if [ -S "$file" ]; then rm -f "$file"; break; fi; done\n${failing}`,
    );
    const goneByOne = await attempt([going], 99);
    check(
      goneByOne.calls === 4 &&
        goneByOne.lists === 1 &&
        JSON.stringify(goneByOne.starts.map((entry) => entry.length)) === JSON.stringify([3, 2, 1, 0]) &&
        goneByOne.outcome?.name === 'ConfinementError',
      `a call whose three hidden sockets went away one by one made ${goneByOne.calls} start(s) over ${JSON.stringify(goneByOne.starts.map((entry) => entry.length))} socket(s); expected four starts over three, two, one and none, then the refusal`,
    );
    // A tool server that started and ended is never run again, whatever a hidden socket did meanwhile: the shim ran, so the
    // signed status says it started, and the adapter's error for a server that ended is the server's own.
    writeStub(`${startOver}\n${failing}`);
    const effect = `require('node:fs').appendFileSync(${JSON.stringify(effects)}, 'ran\\n'); process.exit(3);`;
    fs.rmSync(effects, { force: true });
    const ended = await attempt([sockets], 0, { tool: true, argv: ['-e', effect] });
    const effectLines = fs.existsSync(effects) ? fs.readFileSync(effects, 'utf8').trim().split('\n').length : 0;
    check(
      ended.calls === 1 && effectLines === 1 && /exited during initialize/.test(ended.outcome?.message ?? ''),
      `a tool server that started, appended to a file and exited with 3 while a hidden socket went away was started ${ended.calls} time(s) and ran ${effectLines} time(s); expected one start, and the adapter's own error`,
    );
    fs.rmSync(effects, { force: true });
    const endedCommand = await attempt([sockets], 0, { argv: ['-e', effect] });
    check(
      endedCommand.calls === 1 &&
        fs.existsSync(effects) &&
        fs.readFileSync(effects, 'utf8').trim().split('\n').length === 1 &&
        endedCommand.outcome.exitCode === 3,
      `a command that started, appended to a file and exited with 3 while a hidden socket went away was started ${endedCommand.calls} time(s); expected one start that kept its own exit code`,
    );
    // A target that damages its status file is not run again as a call that never started: here the status file is gone.
    writeStub(`${startOver}
for argument in "$@"; do case "$argument" in */status-*.json) rm -f "$argument" ;; esac; done
exit 1`);
    const damaged = await attempt([sockets], 0);
    check(damaged.calls === 1, `a call whose status file was damaged made ${damaged.calls} start(s); expected one`);
  } finally {
    for (const server of servers) await closeServer(server);
  }
}

/** The probe a confined process runs once its go file exists: connects to an early and a late socket and prints each answer. */
const LATE_PROBE = `
const net = require('node:net');
const fs = require('node:fs');
const [go, early, late] = process.argv.slice(1);
const connect = (target) => new Promise((resolve) => {
  const socket = net.connect({ path: target });
  socket.on('connect', () => { socket.destroy(); resolve('connected'); });
  socket.on('error', (error) => resolve('refused ' + error.code));
});
(async () => {
  while (!fs.existsSync(go)) await new Promise((resolve) => setTimeout(resolve, 20));
  console.log(JSON.stringify({ early: await connect(early), late: await connect(late) }));
})();
`;

/**
 * The route to the host's path-based sockets, on a Linux host with Bubblewrap and strace only (Story 1.82; the Linux CI job
 * proves it, a macOS host skips it). The runtime serves a Unix socket file under the temp directory outside every grant, and the
 * host's own `/run/dbus/system_bus_socket` and `/var/run/docker.sock` are tried where they exist and the runtime's user can
 * connect to them (neither is bound here). A confined process connecting to each is refused (`ECONNREFUSED`), by the file and
 * by a link to it, and the same commands with the empty device files taken out of
 * the real vector connect to each, which is the revert check. A socket in the workspace and one in a private directory of the
 * call stay connectable. A socket the runtime binds after the call started is reached, which is the limit the reference states.
 */
async function checkPathSocketRoute() {
  const label = 'path-socket route';
  if (process.platform !== 'linux') {
    skipCase(label, `Bubblewrap exists on Linux only, and this host is ${process.platform}; the Linux CI job runs it`);
    return;
  }
  const absent = ['bwrap', 'strace'].filter((name) => executableOnPath(name, process.env) === null);
  if (absent.length > 0) {
    skipCase(label, `${absent.join(' and ')} not on PATH; the Linux CI job installs both`);
    return;
  }
  const folder = tempDir('path-socket-folder');
  const confinement = selectConfinement({ evaluation: {}, folder });
  if (confinement.refusal !== undefined) throw new Error(confinement.refusal);
  const workspace = socketDirectory();
  const callDirectory = socketDirectory();
  const outsideDirectory = socketDirectory();
  const sandbox = targetSandbox({ confinement, workspace, status: tempDir('path-socket-status') });
  const launch = (wrapped) => runToEnd(wrapped.target, wrapped.args, { cwd: workspace });
  const attempt = async (target, { stripped = false } = {}) => {
    const wrapped = sandbox.wrap(process.execPath, ['-e', CONNECT_PROBE, 'path', target], [callDirectory]);
    const ran = await launch(stripped ? withoutSocketMasks(wrapped, confinement.executable) : wrapped);
    return ran.status === 0 ? ran.stdout.trim() : `exit ${ran.status}: ${ran.stderr.trim()}`;
  };
  const servers = [];
  try {
    const outside = path.join(outsideDirectory, 'host.sock');
    servers.push(await listenOnSocket(outside));
    const link = path.join(outsideDirectory, 'link.sock');
    fs.symlinkSync(outside, link);
    const targets = [
      ['a Unix socket file the runtime serves under the temp directory, outside the grants', outside],
      ['a link to that socket file', link],
    ];
    // The host's own services, where the runtime's user can reach them, so the case proves nothing less than a real route.
    for (const system of ['/run/dbus/system_bus_socket', '/var/run/docker.sock']) {
      let reachable = false;
      try {
        reachable =
          fs.statSync(system).isSocket() &&
          (await runToEnd(process.execPath, ['-e', CONNECT_PROBE, 'path', system])).stdout.trim() === 'connected';
      } catch {
        reachable = false;
      }
      if (reachable) targets.push([`the host's ${system}`, system]);
      else console.log(`  the host's ${system} is absent here or not reachable to this user; the case tries the sockets it can reach`);
    }
    // A socket file another user left under a name that is no UTF-8 (`/tmp/\xffevil.sock`): the name decodes to a path that does not
    // exist, and a mount over it stops every call. The call starts, and the file stays reachable, which the reference states.
    // The file is bound under a name Node can spell and renamed by bytes, since a listening path is text.
    const spelledName = path.join(outsideDirectory, 'plain.sock');
    const strange = Buffer.concat([Buffer.from(`${outsideDirectory}/`), Buffer.from([0xff]), Buffer.from('evil.sock')]);
    servers.push(await listenOnSocket(spelledName));
    fs.renameSync(spelledName, strange);
    const strangeCall = sandbox.wrap(process.execPath, ['-e', CONNECT_PROBE, 'path', outside], [callDirectory]);
    check(
      !maskedSockets(strangeCall)?.some((hidden) => hidden.includes('\uFFFD')) && maskedSockets(strangeCall)?.includes(outside),
      "a socket file whose name is no UTF-8 sent a path no mount can name into the call's vector, or the socket beside it was left out",
    );
    const started = await attempt(outside);
    check(
      started === 'refused ECONNREFUSED',
      `a call started with a socket file of a name that is no UTF-8 beside the socket it connects to ended ${JSON.stringify(started)}; expected refused ECONNREFUSED, since the call starts and hides the socket beside it`,
    );
    // The target's own arguments count toward Bubblewrap's bound of 9,000 with the mounts: a target of 3,100 arguments starts, and its
    // connection is refused all the same (with the list's own 2,000 sockets and no allowance for the arguments it failed to start).
    const longCall = sandbox.wrap(
      process.execPath,
      ['-e', CONNECT_PROBE, 'path', outside, ...Array.from({ length: 3100 }, (_, at) => String(at))],
      [callDirectory],
    );
    const longRan = await launch(longCall);
    check(
      longCall.hiddenSockets.length > 0 && longRan.status === 0 && longRan.stdout.trim() === 'refused ECONNREFUSED',
      `a call with 3100 arguments hiding ${longCall.hiddenSockets.length} sockets ended ${JSON.stringify(longRan.status === 0 ? longRan.stdout.trim() : `exit ${longRan.status}: ${longRan.stderr.trim()}`)}; expected it to start and refuse the connection`,
    );
    for (const [what, target] of targets) {
      const refused = await attempt(target);
      check(
        refused === 'refused ECONNREFUSED',
        `a confined process connecting to ${what} got ${JSON.stringify(refused)}; expected refused ECONNREFUSED`,
      );
      const control = await attempt(target, { stripped: true });
      check(
        control === 'connected',
        `with the empty device files taken out of the vector, a confined process connecting to ${what} got ${JSON.stringify(control)}; expected connected, since the case proves nothing otherwise`,
      );
    }

    // What the call owns stays connectable: a socket in its workspace and one in a private directory of the call.
    const ownSockets = [path.join(workspace, 'workspace.sock'), path.join(callDirectory, 'call.sock')];
    for (const socketPath of ownSockets) servers.push(await listenOnSocket(socketPath));
    const ownVector = sandbox.wrap(process.execPath, ['-e', 'void 0'], [callDirectory]);
    check(
      ownSockets.every((socketPath) => !maskedSockets(ownVector)?.includes(socketPath)) && ownVector.hiddenSockets.length > 0,
      "the vector of a call hides a socket of the call's own, or hides none, so the case below proves nothing",
    );
    for (const socketPath of ownSockets) {
      const reached = await attempt(socketPath);
      check(
        reached === 'connected',
        `a confined process connecting to its own socket ${path.relative('/tmp', socketPath)} got ${JSON.stringify(reached)}; expected connected`,
      );
    }

    // A socket the runtime binds after the call started: the list was read when the call began, so it is reached.
    const lateSocket = path.join(outsideDirectory, 'late.sock');
    const goFile = path.join(workspace, 'go');
    const wrapped = sandbox.wrap(process.execPath, ['-e', LATE_PROBE, goFile, outside, lateSocket], [callDirectory]);
    const child = spawn(wrapped.target, wrapped.args, { cwd: workspace, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    const closed = new Promise((resolve) => child.once('close', resolve));
    try {
      servers.push(await listenOnSocket(lateSocket));
      fs.writeFileSync(goFile, '');
      let giveUp;
      await Promise.race([closed, new Promise((resolve) => (giveUp = setTimeout(resolve, 30_000)))]);
      clearTimeout(giveUp);
      let answers = null;
      try {
        answers = JSON.parse(output.trim());
      } catch {
        answers = output;
      }
      check(
        answers?.early === 'refused ECONNREFUSED' && answers?.late === 'connected',
        `a process started before a socket was bound answered ${JSON.stringify(answers)}; expected the early socket refused and the late one reached, the limit the reference states`,
      );
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  } finally {
    for (const server of servers) await closeServer(server);
  }
}

/**
 * The sentences of the reference that speak of the network, namespaces, sockets or the reach of a target, service or process,
 * and are neither a claim of the table nor one of the earlier stories' sentences listed beside it: what a claim no case backs
 * looks like to `checkBridgeReference`. Inside the confinement section the screen is wide (a sentence naming Bubblewrap, a
 * target, a service, a process or an entry together with reach, connect, listen, internet, a route, a model provider or the
 * host's network); outside it the screen is the words only this story's claims use.
 *
 * @param {string} reference the reference's text
 * @param {Array<[string, string[]]>} claims
 * @returns {string[]}
 */
function unbackedNetworkSentences(reference, claims) {
  const heading = '### File-system confinement\n';
  const start = reference.indexOf(heading);
  const next = start === -1 ? -1 : reference.indexOf('\n## ', start);
  const section = start === -1 ? '' : reference.slice(start + heading.length, next === -1 ? undefined : next);
  const sentencesOf = (text) =>
    text
      .split('\n')
      .flatMap((line) => line.split(/(?<=\.) (?=[A-Z`])/))
      .map((sentence) => sentence.replace(/^[-\s]+/, ''));
  // The earlier stories' sentences that mention a socket, the bridge, a namespace or a host for their own reasons.
  const earlier = [
    "can neither read, write nor connect to a unix socket under the user's private root directory",
    'Every other process the run starts to run your code or an agent',
    'On Linux the runtime runs the Bubblewrap command under `strace -f',
    'These variables replace any host value',
    'reads the rest of the host, since Node, git and your toolchain read from the system',
    "The target's git sees the evaluated commit's full history",
    "cannot change its worktree's git state",
    'The audit lists a path once, by its real path',
    'A target that reads one ungranted file while the host is saturated',
    'A registry entry names what its target legitimately reads outside the workspace',
    'Every symbolic link under `launch.root`',
    'It also refuses a pre-fix origin that reaches a post-fix one',
    'The token file, the configuration file that names it',
    'Seatbelt denies each read and write under the root',
    "An exec or link read through a process's own links",
  ];
  const known = (sentence) => claims.some(([claim]) => claim === sentence) || earlier.some((prior) => sentence.startsWith(prior));
  const insideScreen =
    /(Bubblewrap|isolated|target|service|process|entry).*(reach|connect|listen|internet|route|model provider|outside service|host's network|host network)|(reach|connect|internet|route).*(Bubblewrap|isolated|target|service)|network|abstract|loopback|forward|\bbridge\b|socket|namespace|D-Bus|\bMach\b|firewall|egress|proxy/i;
  const outsideScreen =
    /abstract|D-Bus|socket|reach.*host|internet|network namespace|loopback and nothing else|forwarded service|bridge the runtime owns/i;
  const inside = new Set(sentencesOf(section));
  return [
    ...sentencesOf(section).filter((sentence) => insideScreen.test(sentence) && !known(sentence)),
    ...sentencesOf(reference).filter((sentence) => !inside.has(sentence) && outsideScreen.test(sentence) && !known(sentence)),
  ];
}

/**
 * The reference's claims about the network (Story 1.63) held against the cases that back them: every claim is a sentence of
 * the reference, names the cases that back it (each a case a suite runs), and every sentence that speaks of the network,
 * namespaces, sockets or the reach of a target is a claim of the table or one of the earlier stories' sentences, so a sentence
 * no case backs fails here (`unbackedNetworkSentences`; scratch sentences of the kinds a claim takes are each screened out
 * below). The old sentence that said a Bubblewrap target shares the host's network namespace is gone.
 */
function checkBridgeReference() {
  const reference = fs.readFileSync(path.join(PROJECT_ROOT, 'docs', 'reference', 'tea-evaluate-cli.md'), 'utf8');
  check(reference.includes('### File-system confinement\n'), 'the reference has no "### File-system confinement" section');
  const claims = [
    [
      '`egress`: the hosts a confined target\'s processes may reach, each `{ "host", "port", "addresses" }`, on a command, tool-server or HTTP entry that starts a process; see [File-system confinement](#file-system-confinement).',
      ['the egress field'],
    ],
    ["A Linux skill or agent target lists its model provider's host and port.", ['the egress field', 'the egress route']],
    [
      "Under Bubblewrap a started service runs in a network namespace of its own and the port it reports is the one it bound there (see [File-system confinement](#file-system-confinement)); the runtime's listener takes the same number on the host when it is free, and the call goes to the port the listener holds.",
      ['the bridged server', 'the bridged server, stood in'],
    ],
    [
      'Linux: Bubblewrap, through `bwrap` on `PATH` (`apt-get install bubblewrap`), in an unprivileged user namespace with a read-only view of `/`, a process-id namespace and procfs of its own, a network namespace of its own, an empty `/run/user`, and an empty device file over each path-based Unix socket the host serves.',
      ['the network namespace units', 'the path socket units'],
    ],
    [
      'The runtime first confines a trivial process through the mechanism, since a host can carry the executable and still refuse it (a kernel that forbids unprivileged user namespaces, or a container that forbids creating a network namespace).',
      ['the network namespace units'],
    ],
    [
      "A Bubblewrap target, and every process it starts, run in a network namespace of their own with a loopback and nothing else, so the host's abstract Unix sockets, a desktop session's D-Bus among them, do not exist for them.",
      ['the abstract socket route', 'the network namespace units'],
    ],
    [
      'A host that cannot create the network namespace is refused at selection (exit 12), as one that cannot start Bubblewrap is.',
      ['the network namespace units'],
    ],
    [
      'An HTTP service the target starts stays reachable from the runtime through a bridge the runtime owns: the confined process serves a Unix socket in a private directory of the call, and the runtime listens on the address and port the call is configured for and forwards each connection through that socket, with no network path between the namespaces.',
      ['the bridged server', 'the bridge shim', 'the abstract socket route'],
    ],
    [
      'A service that reports its port reports the one it bound inside the namespace; the runtime listens on the same number when the host has it free and on a port the system gives otherwise, and the call is configured for the port the runtime listens on.',
      ['the bridged server', 'the bridged server, stood in'],
    ],
    [
      'Under Bubblewrap an isolated started service must listen on `127.0.0.1` or `::1`, and an address the registry authorizes for it that is any other stops the call.',
      ['the bridged server'],
    ],
    [
      'A command target and a tool server have a loopback only and no bridge.',
      ['the abstract socket route', 'the network namespace units'],
    ],
    [
      "A Bubblewrap target has no network beyond that loopback and the proxy its entry's `egress` gives it, so a target that calls a model provider or an outside HTTPS service lists the host in `egress` on its entry.",
      ['the egress route', 'the egress run'],
    ],
    [
      'Each command, tool-server and HTTP entry that starts a process takes `egress`, one `{ "host", "port", "addresses" }` item for each host and port its processes may reach, and `check` refuses an item eval-quality\'s `parseProbeTargetPolicy` refuses, a host spelled otherwise than a URL spells it, a host and port listed twice and an HTTP entry that names no server.',
      ['the egress field'],
    ],
    [
      '`"network"` is no longer a field: `check` refuses an entry that declares it, naming the entry and pointing at `egress`.',
      ['the egress field'],
    ],
    [
      "An entry that lists `egress` gives each of its calls one route out, a proxy the runtime owns: the runtime serves it on a Unix socket in a private directory of the call, the call's status shim listens on a loopback port of the namespace and connects each connection to that socket, and the target starts with the port in `HTTPS_PROXY` and `https_proxy` and with `NODE_USE_ENV_PROXY=1`, which Node reads.",
      ['the egress shim', 'the egress vector units', 'the egress route'],
    ],
    [
      "The proxy tunnels an HTTP `CONNECT` request for a host and port an item lists, decided by eval-quality's `evaluateTarget` as the evaluation's HTTP port's requests are, and answers a request for another host, port or address `403` naming the reason, the host and the entry (a request that is no `CONNECT` gets `405`, a malformed head `400`, a host that does not resolve or cannot be reached `502` and a call past 128 tunnels `503`).",
      ['the egress proxy units', 'the egress route'],
    ],
    [
      'A host no item names is refused before its name is resolved, and the proxy connects to the resolved addresses an item names, the next when one cannot be reached.',
      ['the egress proxy units'],
    ],
    [
      'The shim announces the proxy in `HTTPS_PROXY` alone and the proxy reads `CONNECT` alone, so a client that opens no `CONNECT` tunnel (a plain `http://` request, a database driver) has no route; a target that needs one sets `"confinement": false` with a recorded reason.',
      ['the egress proxy units', 'the egress route'],
    ],
    [
      'A tunnel to a listed host and port carries whatever bytes the client sends, TLS or not, so a client that tunnels (`curl -p -x "$HTTPS_PROXY"`) reaches a plain-HTTP gateway on the host\'s loopback that an item lists.',
      ['the egress route'],
    ],
    [
      "A connection from a target to the host's loopback, to an abstract Unix socket or to any host without the proxy finds a loopback and nothing else.",
      ['the egress route', 'the egress run'],
    ],
    [
      'A host in a request or an item holds letters, digits, `.`, `-` and `_` and at most 253 bytes, or is an IPv6 address; the proxy answers a longer or otherwise spelled host `400`, and `check` refuses such an item and a wildcard such as `*.example.com`, which no request can match.',
      ['the egress proxy units', 'the egress field'],
    ],
    [
      'An entry that lists no host has no proxy, no proxy variable and no route to any host.',
      ['the egress route', 'the egress vector units'],
    ],
    [
      "The proxy and its socket are private to the call: its directory lies beneath the run's private parent, the target sees it read-only, the authorization is held in the runtime's memory with no file, and the end of the call, its failure and a signal that ends the run remove it, while the next run over the evaluation reclaims one a run killed outright left.",
      ['the egress proxy units', 'the egress vector units', 'the egress run'],
    ],
    [
      "`run.json`'s `egress` lists each entry that lists hosts with its `host:port` items, its `egressRefusals` lists each trial whose proxy refused a request with the host, the port, the entry, the reason, the address when the host resolved and a count (at most 50 distinct requests, the rest counted in `omitted`, each detail cut to 500 characters), and the run's summary names those trials.",
      ['the egress field', 'the egress record', 'the egress run', 'the egress proxy units'],
    ],
    [
      'A completed `run` also records `egress`, each entry that lists hosts with its `host:port` items, and, once it ran trials, `egressRefusals`, the trials whose egress proxy refused a request (`[]` when none did; see [File-system confinement](#file-system-confinement)).',
      ['the egress field', 'the egress record'],
    ],
    ["The isolation manifest's forbidden-input notes name the entries that list hosts under Bubblewrap.", ['the egress field']],
    [
      "The evaluation layer's processes keep the host's network, since the evaluation's HTTP port reaches the forwarded service over the host's loopback.",
      ['the network namespace units'],
    ],
    [
      'A Bubblewrap target cannot connect to a path-based Unix socket of the host: `/var/run/docker.sock`, the system bus at `/run/dbus/system_bus_socket`, an agent socket under `/tmp` and every other socket file the kernel lists as bound on the host or the runtime finds under `/run`, `/var/run`, `/tmp` and `/var/tmp` answer `ECONNREFUSED`, since the runtime mounts an empty device file over each one when a call starts.',
      ['the path socket route', 'the path socket units'],
    ],
    [
      "A socket inside the target's workspace or inside a private directory of the call (the bridge's directory included) stays connectable.",
      ['the path socket route', 'the path socket units', 'the confined pipeline'],
    ],
    [
      "The runtime reads the kernel's table of bound Unix sockets (`/proc/net/unix`) and walks those directories one level down for each call, so a socket a host process binds after the call started stays reachable for that call, and so does one bound in another network namespace outside those directories, one whose path holds a line break in a directory the runtime does not walk, one whose file name is no UTF-8, and a second path to the same socket file through a hard link or another mount.",
      ['the path socket route', 'the path socket units'],
    ],
    [
      "A call hides at most as many sockets as its Bubblewrap command leaves room for, and at most 2,000 in any case, since Bubblewrap takes 9,000 arguments for the command line (the target's own arguments included) and the mounts together, and the runtime reads at most 2,000 directories of each scanned directory.",
      ['the path socket units', 'the path socket route'],
    ],
    [
      "The list is ranked by who can create a socket before it is cut: the Docker, containerd, Podman, system bus and systemd sockets by name first, then the sockets of root and of the system accounts, then those of the user running the call, then every other user's in turns (the first socket of each owner, then the second of each), so a local user who makes sockets in bulk cannot push out another user's socket while the room left after those holds one socket for each owner, and a socket in `/dev` or `/proc` takes no room since the vector replaces both.",
      ['the path socket units'],
    ],
    [
      "The socket files beside a path a process moved after it bound (OpenSSH's control master does this) join the list in that same order of owners: the directories are read by who owns them, each socket is charged to its own owner, and one other user's socket files stop joining once that user holds the whole room, so one user's directory of socket files cannot push out the moved socket of root, of a system account, of the user running the call or of a third user, whichever directory the kernel's table names first.",
      ['the path socket units'],
    ],
    [
      'The bound that remains: the socket files of one other user beside a moved path past the room stay reachable and are counted in `socketsLeftReachable`.',
      ['the path socket units'],
    ],
    [
      "The launcher that hands Bubblewrap the mounts leaves the target's environment as the call gave it for every variable whose name is a valid shell identifier and that the shell does not initialize, and it restores `PWD`, `OLDPWD`, `SHLVL`, `_`, `IFS`, `OPTIND` and `PPID` to the call's value (or leaves each unset).",
      ['the path socket units'],
    ],
    [
      'The limit: a call that hides sockets can change or drop a variable whose name a shell cannot hold (`my.setting`, `BASH_FUNC_f%%`), an exported shell function, and a variable bash initializes itself (`PS1`, `PS2`, `PS4`, `LINENO`, `RANDOM`, `SHELLOPTS`, `BASHOPTS`, `BASH`, `BASH_VERSION`) when `sh` is bash, and Story 1.89 closes it.',
      ['the path socket units'],
    ],
    [
      'A call is refused (exit 12, naming the count and the room) when the sockets only root, the system accounts and the user running the call can create exceed the room, which no other user can cause.',
      ['the path socket units'],
    ],
    [
      "`run.json`'s `hostSocketTruncation` lists each trial whose calls left sockets of other users reachable because the room ran out, with its `conditionArm`, `trialIndex`, `calls`, `truncatedCalls` and `socketsLeftReachable`, and the run's summary names those trials; the list is empty when no call was cut.",
      ['the path socket units', 'the run and its scores', "the audit's channel", 'the host socket record'],
    ],
    [
      'A completed `run` that ran trials also records `hostSocketTruncation`, the trials whose calls left sockets of other users reachable because the room for mounts ran out (`[]` when no call was cut; see [File-system confinement](#file-system-confinement)).',
      ['the path socket units', 'the run and its scores', 'the host socket record'],
    ],
    [
      'A socket file the runtime cannot reach by its exact path (a directory it cannot search, a file that went away) is left out, since the target cannot reach it either.',
      ['the path socket units'],
    ],
    [
      "The evaluation layer's processes keep every socket of the host, since their `/` is a writable bind of the host's, where a mount over a socket file that went away would create a file on the host.",
      ['the path socket units'],
    ],
    [
      "macOS Seatbelt hides no host socket apart from the ones under the user's private root, so a macOS target can connect to a path-based socket outside that root.",
      ['the Seatbelt network and Mach services'],
    ],
    [
      'macOS Seatbelt is unchanged: it has no abstract sockets, it accepts `egress` and ignores it, and its Mach services are a separate channel the profile does not close.',
      ['the Seatbelt network and Mach services', 'the egress field'],
    ],
    [
      "The runtime observes no network access, so the network allowlist and the observed network targets are empty; a Bubblewrap target has a loopback and the hosts its entry lists through the proxy (see [File-system confinement](#file-system-confinement)), and a macOS target keeps the host's network.",
      ['the network namespace units', 'the Seatbelt network and Mach services', 'the egress field'],
    ],
    [
      "On Linux the entry also lists the model provider's host and port in `egress`, since the agent calls it and a Bubblewrap target has a loopback only (see [File-system confinement](#file-system-confinement)).",
      ['the egress field'],
    ],
  ];
  // The cases of this suite, and of the HTTP suite, whose runner lists each as `await runCase('<name>', ...)` on a line of its own.
  const apiSource = fs.readFileSync(path.join(PROJECT_ROOT, 'test', 'test-evaluate-api.js'), 'utf8');
  const caseNames = new Set([
    ...CASES.map(({ name }) => name),
    ...[...apiSource.matchAll(/^\s*await runCase\(['"]([^'"]+)['"], /gm)].map((match) => match[1]),
  ]);
  const lines = new Set(
    reference
      .split('\n')
      .flatMap((line) => line.split(/(?<=\.) (?=[A-Z`])/))
      .map((sentence) => sentence.replace(/^[-\s]+/, '')),
  );
  for (const [sentence, backedBy] of claims) {
    check(lines.has(sentence), `the reference does not state: ${sentence}`);
    for (const name of backedBy) {
      check(caseNames.has(name), `the reference's claim "${sentence.slice(0, 60)}..." names the case "${name}", which no suite runs`);
    }
  }
  const unbacked = unbackedNetworkSentences(reference, claims);
  check(unbacked.length === 0, `the reference makes network claims no case backs: ${JSON.stringify(unbacked)}`);
  // Sentences of the kinds an unbacked claim takes, each placed in the confinement section and, for the narrow screen, after it.
  const scratch = [
    'A Bubblewrap target can connect to the internet through the host.',
    'A confined service reaches the host over its own network.',
    'A target on Linux has a route to its model provider.',
    'A Bubblewrap process may listen on any address.',
    'An entry that declares `"network": "isolated"` can reach an outside service.',
    'The runtime puts a firewall around every target.',
    'An abstract socket of the host is closed to a macOS target.',
    'A Bubblewrap target can connect to a path-based socket of the host.',
  ];
  const heading = '### File-system confinement\n';
  const at = reference.indexOf(heading) + heading.length;
  for (const sentence of scratch) {
    const inSection = `${reference.slice(0, at)}${sentence}\n${reference.slice(at)}`;
    check(
      unbackedNetworkSentences(inSection, claims).includes(sentence),
      `an unbacked sentence in the confinement section passed the screen: ${sentence}`,
    );
  }
  for (const sentence of [
    'An abstract socket of the host is closed to every target.',
    'A service started by the runtime can reach the host.',
    'Nothing reaches the internet from a target.',
  ]) {
    check(
      unbackedNetworkSentences(`${reference}\n## Elsewhere\n\n${sentence}\n`, claims).includes(sentence),
      `an unbacked sentence outside the confinement section passed the screen: ${sentence}`,
    );
  }
  // Story 1.83: the reference teaches the authorization, and the retired declaration appears only in the sentence that says it is gone.
  const retiredSentence =
    '`"network"` is no longer a field: `check` refuses an entry that declares it, naming the entry and pointing at `egress`.';
  const declaring = reference
    .split('\n')
    .filter((line) => /"network"|`network`|until Story 1\.83|hostNetwork/.test(line) && line !== retiredSentence);
  check(
    declaring.length === 0,
    `the reference still teaches the retired network declaration: ${JSON.stringify(declaring.map((line) => line.slice(0, 120)))}`,
  );
  check(
    !/shares the host's network namespace/.test(reference) && !/Story 1\.63 closes that route/.test(reference),
    "the reference still says a Bubblewrap target shares the host's network namespace",
  );
  // Story 1.82: the sentence that listed the host's sockets as connectable is gone, and the one that replaces it names what is hidden.
  const confinementSection = (reference.split('### File-system confinement\n')[1] ?? '').split(/\n#{2,3} /)[0];
  check(
    !/Path-based Unix sockets that the read-only `\/` still shows/.test(reference) &&
      !/Story 1\.82 closes that route/.test(reference) &&
      !/stay connectable, and Story/.test(reference) &&
      confinementSection.includes('`/var/run/docker.sock`') &&
      confinementSection.includes('`/run/dbus/system_bus_socket`') &&
      confinementSection.includes('answer `ECONNREFUSED`') &&
      confinementSection.includes("A socket inside the target's workspace") &&
      confinementSection.includes('stays reachable for that call') &&
      confinementSection.includes('at most 2,000 in any case') &&
      confinementSection.includes('ranked by who can create a socket') &&
      confinementSection.includes('A call is refused (exit 12') &&
      confinementSection.includes('`hostSocketTruncation`'),
    "the reference's confinement section still lists the host's path-based sockets as connectable, or does not name the sockets a target cannot connect to and the ones it reaches",
  );
}

/**
 * A macOS target's network and Mach services are as before (Story 1.63): a Seatbelt target still reaches a TCP port on the
 * host's loopback and still asks a Mach service (the directory service, through `dscl`) for an answer. A host without
 * Seatbelt skips it.
 */
async function checkSeatbeltNetworkAndMach() {
  const label = 'Seatbelt network and Mach services';
  if (process.platform !== 'darwin') {
    skipCase(label, `Seatbelt exists on macOS only, and this host is ${process.platform}`);
    return;
  }
  const folder = tempDir('seatbelt-network-folder');
  const confinement = selectConfinement({ evaluation: {}, folder });
  if (confinement.refusal !== undefined) throw new Error(confinement.refusal);
  const workspace = fs.realpathSync(tempDir('seatbelt-network-workspace'));
  const sandbox = targetSandbox({ confinement, workspace });
  const server = net.createServer((socket) => socket.end());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    // Seatbelt has no network namespace: the field is accepted, and the target connects whichever value its entry declares.
    for (const network of ['isolated', 'host']) {
      const wrapped = sandbox.wrap(process.execPath, ['-e', CONNECT_PROBE, 'tcp', String(server.address().port)], [], [], { network });
      const connected = await runToEnd(wrapped.target, wrapped.args, { cwd: workspace });
      check(
        connected.stdout.trim() === 'connected',
        `a Seatbelt target with network ${network} connecting to the host's loopback got ${JSON.stringify(connected.stdout.trim())}; expected connected`,
      );
    }
    // Seatbelt hides no host socket but the private root's: a path-based socket outside it is reached (Story 1.82).
    const hostSocket = path.join(socketDirectory(), 'host.sock');
    const hostServer = net.createServer((socket) => socket.end());
    await new Promise((resolve) => hostServer.listen(hostSocket, resolve));
    try {
      const wrapped = sandbox.wrap(process.execPath, ['-e', CONNECT_PROBE, 'path', hostSocket]);
      const connected = await runToEnd(wrapped.target, wrapped.args, { cwd: workspace });
      check(
        connected.stdout.trim() === 'connected',
        `a Seatbelt target connecting to a path-based socket outside the private root got ${JSON.stringify(connected.stdout.trim())}; expected connected, which the reference states`,
      );
    } finally {
      await closeServer(hostServer);
    }
    const asked = sandbox.wrap('/usr/bin/dscl', ['.', '-read', '/Users/root', 'UniqueID']);
    const answered = await runToEnd(asked.target, asked.args, { cwd: workspace });
    check(
      answered.status === 0 && /UniqueID: 0/.test(answered.stdout),
      `a Seatbelt target asking the directory service through Mach got exit ${answered.status}: ${answered.stdout}${answered.stderr}`,
    );
  } finally {
    await closeServer(server);
  }
}

/**
 * Every case in run order with the group it belongs to. CI runs the groups as four scripts (`--group=run`, which is
 * `test:evaluate-run`, `--group=confinement`, which is `test:evaluate-confinement`, `--group=aggregate`, which is
 * `test:evaluate-aggregate`, and `--group=held-inputs`, which is `test:evaluate-held-inputs`, Story 1.68) so no one runner carries the whole file's wall time; with no `--group` every case runs. Story 1.31's confinement cases each stand on their own, so one that
 * cannot finish leaves the others to report.
 */
const CASES = [
  { name: 'the units', body: checkUnits, group: 'run' },
  { name: 'the run directory writer', body: checkRunDirectoryWriter, group: 'run' },
  { name: 'the templates and ignores', body: checkTemplatesAndIgnores, group: 'run' },
  { name: 'the run and its scores', body: checkRunAndScore, group: 'run' },
  { name: 'the strength aggregate', body: checkStrengthAggregate, group: 'aggregate' },
  { name: 'the aggregate states', body: checkAggregateStates, group: 'aggregate' },
  { name: 'the unverified evidence copies', body: checkUnverifiedEvidence, group: 'run' },
  { name: 'the score output reference', body: checkScoreOutputReference, group: 'run' },
  { name: 'target usage reports', body: checkTargetUsageReports, group: 'run' },
  { name: 'the stopped runs', body: checkStoppedRuns, group: 'run' },
  { name: 'the refusals', body: checkRefusals, group: 'run' },
  { name: 'the conditions and the set recommendation', body: checkConditionsAndSetRecommendation, group: 'run' },
  { name: 'the clean-only runs', body: checkCleanOnlyAndNewest, group: 'run' },
  { name: 'the subdirectory digest', body: checkSubdirectoryDigest, group: 'run' },
  { name: 'the confined evaluation folder', body: checkConfinedEvaluationFolder, group: 'confinement', lossy: true },
  { name: 'the observed mounts', body: checkObservedMounts, group: 'confinement', lossy: true },
  { name: 'the platform refusal', body: checkPlatformRefusal, group: 'confinement' },
  { name: 'the leftover process', body: checkLeftoverProcess, group: 'confinement' },
  { name: 'the evaluator swap', body: checkEvaluatorSwap, group: 'confinement', lossy: true },
  { name: 'the confinement refusals', body: checkConfinementRefusals, group: 'confinement' },
  { name: "a confined target's temp directory", body: checkTargetTemp, group: 'confinement' },
  { name: "a confined target's private home", body: checkTargetHome, group: 'confinement' },
  { name: "the private home's units", body: checkTargetHomeUnits, group: 'confinement' },
  { name: 'the confinement units', body: checkConfinementUnits, group: 'confinement' },
  { name: 'the shell target audit', body: checkShellTargetAudit, group: 'confinement', lossy: true },
  { name: "the audit's parsers and decision", body: checkAuditParsers, group: 'confinement' },
  { name: "the audit's refusals", body: checkAuditRefusals, group: 'confinement' },
  { name: "the observer's refusal of a run", body: checkObserverRefusalRun, group: 'confinement' },
  { name: "the audit's channel", body: checkAuditChannelRun, group: 'confinement', lossy: true },
  { name: 'the host socket record', body: checkHostSocketRecordRun, group: 'confinement' },
  { name: "the audit channel's units", body: checkAuditChannelUnits, group: 'confinement', lossy: true },
  { name: "the audit's mechanism", body: checkAuditMechanism, group: 'confinement', lossy: true },
  { name: "a confined target's git history", body: checkWithheldHistoryRun, group: 'confinement', lossy: true },
  { name: 'the withheld git history units', body: checkWithheldHistoryUnits, group: 'confinement' },
  { name: 'the withheld git history edges', body: checkWithheldHistoryEdges, group: 'confinement' },
  { name: "a confined target's git reach", body: checkWithheldHistoryReach, group: 'confinement' },
  { name: "the withheld git history's reach units", body: checkWithheldHistoryReachUnits, group: 'confinement' },
  { name: "a confined target's sparse checkout", body: checkSparseCheckout, group: 'confinement' },
  { name: "the probe ports' git access", body: checkProbePortGitAccess, group: 'confinement' },
  { name: "the layer's private directory sources", body: checkPrivateDirectorySources, group: 'confinement' },
  { name: 'the private root across runs', body: checkPrivateRootAcrossRuns, group: 'confinement' },
  { name: 'the confinement reference', body: checkConfinementReference, group: 'confinement' },
  { name: 'the held score inputs', body: checkHeldInputs, group: 'held-inputs' },
  { name: 'the held score diagnostics', body: checkHeldDiagnostics, group: 'held-inputs' },
  { name: 'the held strength aggregate', body: checkHeldAggregate, group: 'held-inputs' },
  { name: 'the score input reference', body: checkScoreInputReference, group: 'held-inputs' },
  { name: "the bridge's admission token reference", body: checkBridgeTokenReference, group: 'confinement' },
  { name: 'the bridge shim', body: checkBridgeShim, group: 'confinement' },
  { name: 'the bridge shim streams', body: checkBridgeShimStreams, group: 'confinement' },
  { name: 'the network namespace units', body: checkNetworkNamespaceUnits, group: 'confinement' },
  { name: 'the egress proxy units', body: checkEgressProxyUnits, group: 'confinement' },
  { name: 'the egress shim', body: checkEgressShim, group: 'confinement' },
  { name: 'the egress vector units', body: checkEgressVectorUnits, group: 'confinement' },
  { name: 'the egress field', body: checkEgressField, group: 'confinement' },
  { name: 'the egress record', body: checkEgressRecord, group: 'confinement' },
  { name: 'the egress route', body: checkEgressRoute, group: 'confinement' },
  { name: 'the egress run', body: checkEgressRun, group: 'confinement' },
  { name: 'the abstract socket route', body: checkAbstractSocketRoute, group: 'confinement' },
  { name: 'the path socket units', body: checkPathSocketUnits, group: 'confinement' },
  { name: 'the path socket route', body: checkPathSocketRoute, group: 'confinement' },
  { name: 'the Seatbelt network and Mach services', body: checkSeatbeltNetworkAndMach, group: 'confinement' },
  { name: 'the network reference', body: checkBridgeReference, group: 'confinement' },
];
const GROUPS = new Set(CASES.map(({ group }) => group));

/**
 * Runs one case; an exception is a failed check, so the cases after it still run and every failure is reported. A `lossy`
 * case expects the confinement's audit to report a path, and on macOS the kernel's report channel can lose a report under load
 * (Story 1.60), so a case whose every failure is a missing report (`checkReport`) runs again, up to two more times, before
 * those failures count; a failure of any other check counts at once, and each attempt that is dropped is printed.
 */
async function runCase(name, body, lossy = false) {
  const attempts = lossy && process.platform === 'darwin' ? 3 : 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const failuresBefore = failures.length;
    const checksBefore = checks;
    try {
      await body();
    } catch (error) {
      check(false, `${name} could not finish: ${error.stack ?? error}`);
    }
    const fresh = failures.slice(failuresBefore);
    if (fresh.length === 0 || attempt === attempts || !fresh.every((message) => reportFailures.has(message))) return;
    console.error(`${name}: attempt ${attempt} lost a report of the kernel's log (${fresh.length} missing); running it again`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    failures.length = failuresBefore;
    checks = checksBefore;
  }
}

/** The `--group=<name>` argument's value, `null` when the flag is absent, `''` when it carries no name. */
function requestedGroup() {
  const argument = process.argv.find((value) => value === '--group' || value.startsWith('--group='));
  return argument === undefined ? null : argument.slice('--group='.length);
}

/** The `--only=<text>` argument's value: with it, only the cases whose name holds the text run (a development aid). */
function requestedCase() {
  const argument = process.argv.find((value) => value.startsWith('--only='));
  return argument === undefined ? null : argument.slice('--only='.length);
}

async function main() {
  const group = requestedGroup();
  const only = requestedCase();
  if (group !== null && !GROUPS.has(group)) {
    console.error(
      `${colors.red}unknown --group ${JSON.stringify(group)}:${colors.reset} expected one of ${[...GROUPS].map((name) => `--group=${name}`).join(', ')}`,
    );
    return 2;
  }
  try {
    if (process.argv.includes('--usage-only')) {
      await runCase('target usage reports', checkTargetUsageReports);
    } else {
      for (const { name, body, group: caseGroup, lossy } of CASES) {
        if ((group === null || caseGroup === group) && (only === null || name.includes(only))) await runCase(name, body, lossy === true);
      }
    }
    for (const { label, directory } of runtimeTemps) {
      const left = fs.readdirSync(directory);
      check(left.length === 0, `the ${label} project's runs left ${JSON.stringify(left)} in their temp directory`);
    }
  } finally {
    scratch.removeAll();
    for (const directory of socketDirectories) fs.rmSync(directory, { recursive: true, force: true });
  }
  if (failures.length > 0) {
    console.error(`${colors.red}${failures.length} of ${checks} tea-evaluate run check(s) failed:${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log(`${colors.green}ok${colors.reset} all ${checks} tea-evaluate run check(s) passed`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(`${colors.red}the tea-evaluate run test could not run:${colors.reset} ${error.stack ?? error}`);
    process.exitCode = 2;
  },
);
