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
 *   isolation manifest (each trial's workspace granted, no mount observed, the
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
 *   `score` stderr non-empty, and no evidence artifact.
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
 *
 * Usage: node test/test-evaluate-run.js
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const AjvModule = require('ajv/dist/2020');

const { ENGINE_CLI_ENV, engineCliPath, loadEngine } = require('../cli/lib/evaluate/engine');
const { ArmError, runArm, stoppedFromOutside } = require('../cli/lib/evaluate/arm');
const { uncommittedUnder } = require('../cli/lib/evaluate/preflight');
const { judgeTrial } = require('../cli/lib/evaluate/evaluator');
const { recordObservation, createArtifactValidator } = require('../cli/lib/evaluate/records');
const { RunDirectory, RunDirectoryError } = require('../cli/lib/evaluate/run-directory');
const { setRecommendation } = require('../cli/lib/evaluate/run');
const { combinedExit } = require('../cli/lib/evaluate/score');
const { scratchDirectories } = require('./lib/scratch-directories');

const Ajv = AjvModule.default ?? AjvModule;

const PROJECT_ROOT = path.join(__dirname, '..');
const EVALUATE = path.join(PROJECT_ROOT, 'cli', 'evaluate.js');
const SHIM = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'engine-shim.js');
const FIXTURE = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'mutation');
const ASSETS = path.join(PROJECT_ROOT, 'src', 'workflows', 'testarch', 'bmad-testarch-evaluate', 'assets');
const CONDITIONS_SCHEMA = path.join(PROJECT_ROOT, 'cli', 'lib', 'evaluate', 'schemas', 'evaluator-conditions.schema.json');
const WRAP_RUN_DIRECTORY = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'wrap-run-directory.cjs');
const EVALUATION = path.join('evals', 'verdict');
const TRIALS = 3;

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
 */
function makeProject(label, { edit = () => {}, below = null } = {}) {
  const repository = path.join(tempDir(label), 'repository');
  const project = below === null ? repository : path.join(repository, below);
  fs.cpSync(FIXTURE, project, { recursive: true, filter: (from) => path.basename(from) !== 'runs' });
  fs.writeFileSync(path.join(repository, '.gitignore'), 'vendor/\n');
  if (below !== null) {
    fs.mkdirSync(path.join(repository, 'other'));
    fs.writeFileSync(path.join(repository, 'other', 'notes.txt'), 'beside the project\n');
  }
  const folder = path.join(project, EVALUATION);
  edit({ project, folder });
  const digested = evaluate(['digest', '--evaluation', folder]);
  if (digested.status !== 0) throw new Error(`digest failed for ${label}: ${digested.output}`);
  git(repository, ['init', '--quiet', '--initial-branch', 'main']);
  git(repository, ['add', '--all']);
  git(repository, ['commit', '--quiet', '--message', 'the verdict project']);
  const directory = tempDir(`${label}-temp`);
  runtimeTemps.push({ label, directory });
  return { repository, project, folder, env: { TMPDIR: directory, TMP: directory, TEMP: directory } };
}

/** The newest run directory under `runs/`; with `expected`, how many there must be. */
function runDirectoryOf(folder, expected = 1) {
  const runs = path.join(folder, 'runs');
  const names = fs.existsSync(runs) ? fs.readdirSync(runs).filter((name) => name !== '.gitignore') : [];
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
    // The runtime observes no file-system access, so it claims no observed mount.
    check(
      JSON.stringify(manifest.observedMounts) === '[]',
      `${set.probeId}'s isolation manifest claims observed mounts ${JSON.stringify(manifest.observedMounts)}`,
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
async function checkRealScore({ validate, folder, env, runDirectory, index, policy, run }) {
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
  }
  checkDirectRerun('the passing run', scoreDirectory);
}

/** The score through a logging shim: one call per probe, the streams and codes kept per probe, the most severe exit passed through. */
function checkShimmedScore({ folder, env, runDirectory, index }) {
  const log = path.join(tempDir('shim'), 'argv.log');
  const shimEnv = {
    ...env,
    [ENGINE_CLI_ENV]: SHIM,
    TEA_EVALUATE_SHIM_LOG: log,
    TEA_EVALUATE_SHIM_EXIT_SCORE_P_001: '4',
    TEA_EVALUATE_SHIM_EXIT_SCORE_P_002: '2',
    TEA_EVALUATE_SHIM_STREAMS: 'known-bytes',
  };
  const shimmed = evaluate(['score', '--evaluation', folder], shimEnv);
  check(
    shimmed.status === 4,
    `score through a shim whose P-001 call exits 4 and P-002 call exits 2 exited ${shimmed.status}; expected 4\n${shimmed.output}`,
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
      argv[argv.indexOf('--isolation-manifest') + 1] === path.join(runDirectory, set.isolationManifest),
      `${set.probeId}'s score call carried another isolation manifest`,
    );
    const call = written(path.join(scoreDirectory, set.probeId, 'score.json'), `${set.probeId}'s shimmed score call`);
    if (call === null) continue;
    const probeFile = `${set.probeId}.probe.json`;
    const code = set.probeId === 'P-001' ? 4 : 2;
    const stream = (name) => `known-bytes ${name} ${probeFile}\nknown-bytes ${name} 2 ${probeFile}\nknown-bytes ${name} 3 ${probeFile}`;
    check(call.stdout === stream('stdout'), `${set.probeId}'s persisted stdout is ${JSON.stringify(call.stdout)}`);
    check(call.stderr === stream('stderr'), `${set.probeId}'s persisted stderr is ${JSON.stringify(call.stderr)}`);
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
}

async function checkRunAndScore() {
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
  const ran = evaluate(['run', '--evaluation', folder], env);
  check(ran.status === 0, `run exited ${ran.status}; expected 0\n${ran.output}`);
  const runDirectory = runDirectoryOf(folder);
  if (runDirectory === null) return;
  const policy = readJson(path.join(folder, 'policy', 'scoring-policy.json'));
  const { index, run } = await checkRunShape({ engine, validate, ...made, runDirectory });
  if (!Array.isArray(index.trialSets)) return;
  await checkRealScore({ validate, folder, env, runDirectory, index, policy, run });
  const shimEnv = checkShimmedScore({ folder, env, runDirectory, index });
  checkRefusedArtifacts({ engine, folder, runDirectory, shimEnv });
  checkFailAndInvalid({ engine, folder, env, runDirectory });
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

  const touched = makeProject('touch');
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
  const planted = makeProject('plant');
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
  const forged = makeProject('forge');
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
  const linked = makeProject('link-trials');
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

  const recreated = makeProject('recreate-trials');
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

  const moved = makeProject('move-trials');
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

  const gameability = makeProject('gameability', {
    edit: ({ folder }) => {
      const seeded = readJson(path.join(folder, 'probes', 'P-002.probe.json'));
      const probe = {
        probeId: 'P-003',
        probeClass: 'gameability',
        behaviorId: 'B-001',
        expectedClean: false,
        rationale: 'A degenerate answer that says accepted without judging.',
        defects: [],
        defectSignature: seeded.defectSignature,
        qualification: { route: 'gameability', degenerateResponse: 'verdict: accepted, whatever the request' },
      };
      fs.writeFileSync(path.join(folder, 'probes', 'P-003.probe.json'), `${JSON.stringify(probe, null, 2)}\n`);
    },
  });
  const gameabilityRun = evaluate(['run', '--evaluation', gameability.folder], gameability.env);
  check(
    gameabilityRun.status === 12 && /P-003\.probe\.json \(route gameability\)/.test(gameabilityRun.output),
    `run with a gameability probe exited ${gameabilityRun.status}; expected 12 naming its route\n${gameabilityRun.output}`,
  );
  for (const project of [noPolicy, noProbe, gameability]) {
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
      .filter((name) => name !== '.gitignore')
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
    .filter((name) => name !== '.gitignore')
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
      observation: { exitCode, stdout: { kind: 'text', value: 'verdict: rejected\n' }, stderr: { kind: 'absent' }, artifacts: {} },
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
  check(conditions.modelSnapshot === null && conditions.systemPromptDigest === null, 'the evaluator-conditions template carries a model');
  check(!conditionsSchema(conditions), 'the unfilled evaluator-conditions template passes the runtime schema');
  check(
    conditionsSchema({ ...conditions, modelSnapshot: 'a-model', systemPromptDigest: sha256(Buffer.from('prompt')) }),
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

/** Runs one case; an exception is a failed check, so the cases after it still run and every failure is reported. */
async function runCase(name, body) {
  try {
    await body();
  } catch (error) {
    check(false, `${name} could not finish: ${error.stack ?? error}`);
  }
}

async function main() {
  try {
    await runCase('the units', checkUnits);
    await runCase('the run directory writer', checkRunDirectoryWriter);
    await runCase('the templates and ignores', checkTemplatesAndIgnores);
    await runCase('the run and its scores', checkRunAndScore);
    await runCase('the stopped runs', checkStoppedRuns);
    await runCase('the refusals', checkRefusals);
    await runCase('the conditions and the set recommendation', checkConditionsAndSetRecommendation);
    await runCase('the clean-only runs', checkCleanOnlyAndNewest);
    await runCase('the subdirectory digest', checkSubdirectoryDigest);
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
