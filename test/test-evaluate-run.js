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
 *
 * Usage: node test/test-evaluate-run.js [--group=run|confinement|aggregate|held-inputs]
 * CI runs the four groups as `test:evaluate-run`, `test:evaluate-confinement`, `test:evaluate-aggregate` and
 * `test:evaluate-held-inputs`; with no `--group` every case runs.
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
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
const { setRecommendation } = require('../cli/lib/evaluate/run');
const {
  MECHANISM_NAMES,
  PLATFORM_ENV,
  confinedCommandMechanism,
  confinedMcpMechanism,
  selectConfinement,
  targetSandbox,
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
const CONFINEMENT_GUARD = path.join(PROJECT_ROOT, 'cli', 'lib', 'evaluate', 'confinement-guard.cjs');
const CONFINEMENT_STATUS = path.join(PROJECT_ROOT, 'cli', 'lib', 'evaluate', 'confinement-status.cjs');
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
function makeProject(label, { edit = () => {}, below = null, unconfined = false, history = () => {} } = {}) {
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
        operationId: 'send-identity',
        after: null,
        cardinality: 'exactly-one',
        inputBinding: { argument: null, option: null, environment: null, stdin: { identity: { principal: 'reviewer' } } },
      },
      {
        stepId: 'operator-step',
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
  const passedRow = reference.split('\n').find((line) => /^\| 3-5\s+\|/.test(line)) ?? '';
  check(
    /Score input integrity/.test(passedRow) && /exit and reason lines are what the held inputs produce/.test(passedRow),
    "the reference's exit 3-5 row does not say a stage's exit is passed through only while the call's artifact, exit and reason lines are what the held inputs produce",
  );
  const exitRow = reference.split('\n').find((line) => /^\| 12\s+\| infrastructure:/.test(line)) ?? '';
  check(
    /an input that changed or appeared while a call ran/.test(exitRow) &&
      /a call whose staged artifact, exit or `eval-quality:` diagnostic lines the held inputs do not reproduce/.test(exitRow),
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
  check(
    [path.join(realFolder, 'contract.json'), path.join(realFolder, 'runs', 'tamper.txt')].every((entry) => probedMounts.includes(entry)),
    `the audit did not report the evaluation folder's paths the target reached for: ${JSON.stringify(probedMounts)}`,
  );
  const probedScore = evaluate(['score', '--evaluation', probed.folder], probed.env);
  check(
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
  const observedMounts = observedMountsOf(observedDirectory, 'P-001');
  check(
    JSON.stringify(observedMounts) === JSON.stringify([realOutside]),
    `P-001's observed mounts are ${JSON.stringify(observedMounts)}; expected [${realOutside}]`,
  );
  const otherMounts = observedMountsOf(observedDirectory, 'P-002');
  check(
    JSON.stringify(otherMounts) === '[]',
    `P-002's trials read nothing ungranted, yet its manifest lists ${JSON.stringify(otherMounts)}`,
  );
  const observedScore = evaluate(['score', '--evaluation', observed.folder], observed.env);
  check(
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
    const project = makeProject(label, { unconfined: !confined });
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
      check(
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

  const root = fs.realpathSync(tempDir('confinement-units-guard'));
  const workspace = path.join(root, 'workspace');
  const project = path.join(root, 'project');
  const withheld = path.join(project, 'evals', 'verdict');
  fs.mkdirSync(workspace);
  fs.mkdirSync(withheld, { recursive: true });
  fs.mkdirSync(path.join(root, 'outside'));
  fs.writeFileSync(path.join(root, 'outside', 'secret.txt'), 'outside every grant\n');
  fs.writeFileSync(path.join(root, 'outside', 'touched.txt'), 'its times changed through a link-level call\n');
  fs.writeFileSync(path.join(withheld, 'contract.json'), '{}\n');
  fs.writeFileSync(path.join(workspace, 'own.txt'), 'the workspace\n');
  fs.symlinkSync(path.join(root, 'outside', 'secret.txt'), path.join(workspace, 'link.txt'));
  const report = path.join(root, 'report', 'report.jsonl');
  fs.mkdirSync(path.dirname(report));
  const audited = spawnSync(
    process.execPath,
    [
      '--require',
      CONFINEMENT_GUARD,
      '-e',
      `const fs = require('node:fs'); const [touched, ...read] = process.argv.slice(1); for (const file of read) fs.readFileSync(file); fs.lutimesSync(touched, new Date(), new Date());`,
      path.join(root, 'outside', 'touched.txt'),
      path.join(workspace, 'own.txt'),
      path.join(workspace, 'link.txt'),
      path.join(withheld, 'contract.json'),
    ],
    {
      encoding: 'utf8',
      timeout: SPAWN_TIMEOUT_MS,
      env: {
        ...BASE_ENV,
        // The project is granted, as a system path declared over it would be; the evaluation folder inside it is withheld.
        TEA_EVALUATE_CONFINEMENT_AUDIT: JSON.stringify({
          report,
          granted: [workspace, path.dirname(report), project],
          withheld: [withheld],
        }),
      },
    },
  );
  const reported = fs.existsSync(report)
    ? fs
        .readFileSync(report, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line).path)
        .sort()
    : [];
  check(
    audited.status === 0 &&
      JSON.stringify(reported) ===
        JSON.stringify(
          [
            path.join(root, 'outside', 'secret.txt'),
            path.join(root, 'outside', 'touched.txt'),
            path.join(withheld, 'contract.json'),
          ].sort(),
        ),
    `the audit reported ${JSON.stringify(reported)}; expected the link's real target, the file lutimes wrote and the withheld contract under a granted project\n${audited.stderr}`,
  );
  // The preload's one pure helper, read in a process of its own, since this file loads no .cjs module (test:direction).
  const installRoots = spawnSync(
    process.execPath,
    [
      '-e',
      `const { nodeInstallRoot } = require(${JSON.stringify(CONFINEMENT_GUARD)}); process.stdout.write(JSON.stringify(['/bin/node', '/usr/local/bin/node'].map(nodeInstallRoot)));`,
    ],
    { encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS },
  ).stdout;
  check(
    installRoots === JSON.stringify(['/bin', '/usr/local']),
    `the audit's Node installations for /bin/node and /usr/local/bin/node are ${installRoots}; expected ["/bin","/usr/local"]`,
  );

  // The Bubblewrap vector: a process-id namespace of its own with its own procfs (no `/proc/<pid>/root` into the runtime's
  // mounts), ending with its parent, and no user service manager; only the report file and this call's own status file
  // are writable, not the directories they sit in, and the target's status file name cannot be guessed.
  const unitRoot = fs.realpathSync(tempDir('confinement-units-bwrap'));
  const unitWorkspace = path.join(unitRoot, 'workspace');
  const unitReport = path.join(unitRoot, 'audit', 'report.jsonl');
  const unitStatus = path.join(unitRoot, 'status');
  fs.mkdirSync(unitWorkspace);
  fs.mkdirSync(path.dirname(unitReport));
  fs.mkdirSync(unitStatus);
  fs.writeFileSync(unitReport, '');
  const unitSandbox = targetSandbox({
    confinement: { mode: 'bubblewrap', executable: '/usr/bin/bwrap', evaluationFolder: folder },
    workspace: unitWorkspace,
    report: unitReport,
    status: unitStatus,
  });
  const wrapped = unitSandbox.wrap('/bin/true', []);
  const bound = wrapped.args.flatMap((argument, index) => (argument === '--bind' ? [wrapped.args[index + 1]] : []));
  check(
    ['--unshare-pid', '--proc', '--die-with-parent', '--new-session'].every((flag) => wrapped.args.includes(flag)),
    `the Bubblewrap vector lacks its process namespace, procfs, die-with-parent or session: ${wrapped.args.join(' ')}`,
  );
  check(
    bound.includes(unitReport) &&
      bound.includes(wrapped.statusFile) &&
      !bound.includes(path.dirname(unitReport)) &&
      !bound.includes(unitStatus) &&
      /^status-1-[0-9a-f]{16}\.json$/.test(path.basename(wrapped.statusFile)),
    `the Bubblewrap vector binds ${JSON.stringify(bound)}; expected the workspace, the report file and the status file of the call, no directory of either`,
  );
  // A report flooded past what the runtime reads, or cut shorter than an earlier read found it, names itself as the mount.
  fs.writeFileSync(unitReport, `${JSON.stringify({ path: '/etc/hostname' })}\n`);
  const first = unitSandbox.observedMounts();
  fs.writeFileSync(unitReport, '');
  const cut = unitSandbox.observedMounts();
  fs.writeFileSync(unitReport, Buffer.alloc(5 * 1024 * 1024, 0x20));
  const flooded = unitSandbox.observedMounts();
  check(
    first.includes('/etc/hostname') && !first.includes(unitReport) && cut.includes(unitReport) && flooded.includes(unitReport),
    `the audit report's tampering reads ${JSON.stringify({ first, cut, flooded })}; expected the report's own path once it is cut or flooded`,
  );

  // A report cut back during a call is seen when that call ends, against what an earlier call left, and stays seen;
  // a report replaced by a directory, or removed, is tampering too.
  const settleReport = path.join(unitRoot, 'audit', 'settle.jsonl');
  fs.writeFileSync(settleReport, '');
  const settling = targetSandbox({
    confinement: { mode: 'bubblewrap', executable: '/usr/bin/bwrap', evaluationFolder: folder },
    workspace: unitWorkspace,
    report: settleReport,
    status: unitStatus,
  });
  fs.writeFileSync(settleReport, `${JSON.stringify({ path: '/etc/hostname' })}\n`);
  settling.settle();
  fs.writeFileSync(settleReport, '');
  settling.settle();
  fs.writeFileSync(settleReport, `${JSON.stringify({ path: '/etc/os-release-and-a-name-longer-than-the-first' })}\n`);
  check(
    settling.observedMounts().includes(settleReport),
    `a report cut back in one call and refilled before the trial's end is not held against the trial: ${JSON.stringify(settling.observedMounts())}`,
  );
  fs.rmSync(settleReport);
  fs.mkdirSync(settleReport);
  check(
    targetSandbox({
      confinement: { mode: 'bubblewrap', executable: '/usr/bin/bwrap', evaluationFolder: folder },
      workspace: unitWorkspace,
      report: settleReport,
      status: unitStatus,
    })
      .observedMounts()
      .includes(settleReport),
    'a report replaced by a directory is not held against the trial',
  );
  fs.rmSync(settleReport, { recursive: true });
  check(
    targetSandbox({
      confinement: { mode: 'bubblewrap', executable: '/usr/bin/bwrap', evaluationFolder: folder },
      workspace: unitWorkspace,
      report: settleReport,
      status: unitStatus,
    })
      .observedMounts()
      .includes(settleReport),
    'a report removed by the target is not held against the trial',
  );

  // A Bubblewrap that fails before its shim runs is not a target that exited with Bubblewrap's code; one whose shim ran is.
  for (const started of [false, true]) {
    const statusOfCall = path.join(unitStatus, `started-${started}.json`);
    fs.writeFileSync(statusOfCall, started ? '{"started":true}\n' : '');
    let outcome;
    try {
      outcome = await confinedCommandMechanism(
        { run: async () => ({ exitCode: 1, stderr: { kind: 'text', value: 'bwrap: cannot bind\n' } }) },
        { wrap: (target, args) => ({ target, args, statusFile: statusOfCall }), environment: (env) => env, settle: () => {} },
      ).run({ target: '/bin/true', subcommandPath: [], argv: [], env: {} }, new AbortController().signal);
    } catch (error) {
      outcome = error;
    }
    check(
      started ? outcome?.exitCode === 1 : outcome?.name === 'ConfinementError' && outcome.message.includes('bwrap: cannot bind'),
      `a Bubblewrap call whose shim ${started ? 'ran' : 'never ran'} reads ${JSON.stringify(outcome?.message ?? outcome)}`,
    );
  }

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
      environment: (env) => env,
      settle: () => {},
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
        { wrap: (target, args) => ({ target, args, statusFile: endedStatus }), environment: (env) => env, settle: () => {} },
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
  check(
    ['HEAD', 'config', 'objects'].every((name) => observed.includes(path.join(projectGit, name))),
    `the audit did not report the target's attempts on the project's git directory: ${JSON.stringify(observed)}`,
  );
  check(
    !observed.some((entry) => entry.startsWith(`${path.join(projectGit, 'worktrees')}${path.sep}`)),
    `the audit reported the target's read of its own worktree's metadata: ${JSON.stringify(observed)}`,
  );
  const audited = evaluate(['score', '--evaluation', project.folder], project.env);
  check(
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
    const confined = makeProject(`withheld-context-${context}`);
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
    // A target's own temp directory per call.
    'confinement.js': 1,
    // The audit report's directory and Bubblewrap's status directory, both granted to a target.
    'registry.js': 2,
    // The file a started HTTP service reports its port in, granted to the target.
    'http-target.js': 1,
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
        parentOnly: targetSandbox({ confinement, workspace, privateRoot: firstParent, status }),
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

  // A partial clone is refused before any history is packed, by either marker.
  for (const [label, configure] of [
    ['extension', (repository) => git(repository, ['config', 'extensions.partialClone', 'origin'])],
    ['remote', (repository) => git(repository, ['config', 'remote.origin.promisor', 'true'])],
  ]) {
    const partial = makeHistoryRepository(`withheld-edge-partial-${label}`);
    configure(partial.repository);
    let partialRefusal = null;
    try {
      createWorkspace({ root: partial.repository, kind: 'git', exclude: [partial.folder], label: 'partial', withholdHistory: true });
    } catch (error) {
      partialRefusal = error;
    }
    check(
      partialRefusal instanceof WorkspaceRefusal &&
        partialRefusal.message.includes('partial clone') &&
        partialRefusal.message.includes('"confinement": false') &&
        partialRefusal.message.includes('fetch the full history'),
      `a partial clone (${label}) was not refused with its cause and both ways out: ${partialRefusal?.message}`,
    );
    check(
      !git(partial.repository, ['worktree', 'list', '--porcelain']).toString('utf8').includes('tea-evaluate-partial'),
      `a refused partial clone (${label}) left a worktree registration`,
    );
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
  { name: 'the confined evaluation folder', body: checkConfinedEvaluationFolder, group: 'confinement' },
  { name: 'the observed mounts', body: checkObservedMounts, group: 'confinement' },
  { name: 'the platform refusal', body: checkPlatformRefusal, group: 'confinement' },
  { name: 'the leftover process', body: checkLeftoverProcess, group: 'confinement' },
  { name: 'the evaluator swap', body: checkEvaluatorSwap, group: 'confinement' },
  { name: 'the confinement refusals', body: checkConfinementRefusals, group: 'confinement' },
  { name: "a confined target's temp directory", body: checkTargetTemp, group: 'confinement' },
  { name: 'the confinement units', body: checkConfinementUnits, group: 'confinement' },
  { name: "a confined target's git history", body: checkWithheldHistoryRun, group: 'confinement' },
  { name: 'the withheld git history units', body: checkWithheldHistoryUnits, group: 'confinement' },
  { name: 'the withheld git history edges', body: checkWithheldHistoryEdges, group: 'confinement' },
  { name: "the probe ports' git access", body: checkProbePortGitAccess, group: 'confinement' },
  { name: "the layer's private directory sources", body: checkPrivateDirectorySources, group: 'confinement' },
  { name: 'the private root across runs', body: checkPrivateRootAcrossRuns, group: 'confinement' },
  { name: 'the confinement reference', body: checkConfinementReference, group: 'confinement' },
  { name: 'the held score inputs', body: checkHeldInputs, group: 'held-inputs' },
  { name: 'the held score diagnostics', body: checkHeldDiagnostics, group: 'held-inputs' },
  { name: 'the held strength aggregate', body: checkHeldAggregate, group: 'held-inputs' },
  { name: 'the score input reference', body: checkScoreInputReference, group: 'held-inputs' },
  { name: "the bridge's admission token reference", body: checkBridgeTokenReference, group: 'confinement' },
];
const GROUPS = new Set(CASES.map(({ group }) => group));

/** Runs one case; an exception is a failed check, so the cases after it still run and every failure is reported. */
async function runCase(name, body) {
  try {
    await body();
  } catch (error) {
    check(false, `${name} could not finish: ${error.stack ?? error}`);
  }
}

/** The `--group=<name>` argument's value, `null` when the flag is absent, `''` when it carries no name. */
function requestedGroup() {
  const argument = process.argv.find((value) => value === '--group' || value.startsWith('--group='));
  return argument === undefined ? null : argument.slice('--group='.length);
}

async function main() {
  const group = requestedGroup();
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
      for (const { name, body, group: caseGroup } of CASES) {
        if (group === null || caseGroup === group) await runCase(name, body);
      }
    }
    for (const { label, directory } of runtimeTemps) {
      const left = fs.readdirSync(directory);
      check(left.length === 0, `the ${label} project's runs left ${JSON.stringify(left)} in their temp directory`);
    }
  } finally {
    scratch.removeAll();
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
