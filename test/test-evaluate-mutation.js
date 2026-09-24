/**
 * `tea-evaluate preflight`'s disposable workspaces and controlled mutations,
 * end to end (Story 1.7, AD-8).
 *
 * Every case builds a temp project from `test/fixtures/evaluate/mutation/`: a
 * verdict command (`bin/verdict.js`) that judges its request by
 * `rules/policy.txt`, a provisioned `vendor/`, and the evaluation under
 * `evals/verdict/`, whose seeded probe P-002 qualifies through M-001 (strict
 * relaxed to lenient). The command prints the SHA-256 of `rules/policy.txt`
 * from its own working directory, whether that directory is a git worktree,
 * and whether a write under `vendor/` succeeded, so each claim below rests on
 * evidence the runtime does not compute itself. The real `tea-evaluate
 * preflight` runs against the real installed eval-quality, with a private
 * temp directory per case.
 *
 * - A git target: the arms and legs ran in a detached worktree of the commit,
 *   `run.json` records `dirty: false` and the commit, the qualified probe
 *   carries `rollbackVerified: true` and meets eval-quality's probe schema,
 *   its evidence references digest the files they name, `mutatedDigest`
 *   differs from `preDigest` and `restoredDigest` equals it, the baseline
 *   re-run's stdout names `preDigest` and the mutated arm's names
 *   `mutatedDigest`, the manifestation witness's leg ran in the mutated
 *   workspace and every other leg in the pristine one (each observation
 *   records its `cwd`), the CLI's verdict passed with both seeded checks
 *   satisfied, a write under the provisioned directory was denied, and
 *   afterwards the project's `git status`, every file's digest and
 *   `git worktree list` are what they were, with nothing left in the temp
 *   directory.
 * - Uncommitted work: without `--from-working-tree` the commit is evaluated
 *   and the command says the edit was not; with it, a temp copy of the
 *   working tree is evaluated and `run.json` records `dirty: true`.
 * - A `copy` workspace and a target outside any git repository: a temp copy,
 *   `dirty: false`, and a tree digest.
 * - Failures, each with no qualified probe written, the project unchanged and
 *   no workspace left: a `find` text absent or present twice exits 10; a
 *   baseline that does not pass and a mutation that does not change the
 *   verdict exit 11; an unwritable temp directory, a restore that cannot
 *   write, and a target exiting an infrastructure code exit 12.
 * - The cycle over scripted arms: a restored digest that differs stops at
 *   step 5 with exit 12, and the baseline re-runs at most
 *   `1 + reExecutionCap` times.
 * - A run started with a git hook's `GIT_DIR`, `GIT_WORK_TREE` and
 *   `GIT_INDEX_FILE` naming another repository still evaluates the project's
 *   own commit and leaves the other repository untouched.
 * - A target that tags the commit through its worktree, and a leg that writes
 *   into the project, each exit 12 with no qualified probe; a project inside
 *   a larger repository runs despite a link out elsewhere in it, and a
 *   provisioned directory that is a link is refused.
 * - Units: the restored mode, overlapping occurrences, the evaluator's
 *   polarity, the arm's binding rules and order, the tree digest, and the
 *   leg cache with its pinned key.
 * - A mutated arm that leaves an unreadable directory behind still lets its
 *   workspace be removed.
 * - A run interrupted by `SIGTERM` mid-arm ends by that signal and leaves no
 *   workspace, worktree entry or target process behind.
 * - A target that writes into the project from its mutated arm (through a
 *   path the host environment hands it) exits 12 on the runtime's own reading
 *   of the adopter's tree, with no qualified probe.
 *
 * Usage: node test/test-evaluate-mutation.js
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const { ENGINE_CLI_ENV } = require('../cli/lib/evaluate/engine');
const { ArmError, runArm } = require('../cli/lib/evaluate/arm');
const { loadEngine } = require('../cli/lib/evaluate/engine');
const { admissionRefusal, armVerdict } = require('../cli/lib/evaluate/preflight');
const { dispositionOf } = require('../cli/lib/evaluate/evaluator');
const { QualificationError, countOccurrences, qualifiedProbe, runMutationCycle } = require('../cli/lib/evaluate/mutation');
const { cacheOnlyPort, cachingPort, requestKey, treeDigest } = require('../cli/lib/evaluate/workspace');
const { createArtifactValidator } = require('../cli/lib/evaluate/records');

const PROJECT_ROOT = path.join(__dirname, '..');
const EVALUATE = path.join(PROJECT_ROOT, 'cli', 'evaluate.js');
const FIXTURE = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'mutation');
const EVALUATION = path.join('evals', 'verdict');
const POLICY = path.join('rules', 'policy.txt');
const WITNESS_LEG = 'manifest-lenient';

/** This process's environment without the variables that would reroute git or the engine. */
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== ENGINE_CLI_ENV && !name.startsWith('GIT_')));
const GIT_IDENTITY = ['-c', 'user.name=TeA test', '-c', 'user.email=tea-test@example.test', '-c', 'core.hooksPath=/dev/null'];
/** The test's own git reads no global or system configuration, so a developer's signing or hook settings cannot reach its commits. */
const GIT_ENV = { ...BASE_ENV, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
/** How long one spawned command may run before the case fails instead of hanging the suite. */
const SPAWN_TIMEOUT_MS = 120_000;
/** Root ignores permission bits, so the read-only cases cannot be observed as root. */
const IS_ROOT = process.getuid?.() === 0;

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };

const failures = [];
let checks = 0;
const scratch = [];

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function tempDir(label) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), `tea-evaluate-mutation-${label}-`));
  scratch.push(directory);
  return directory;
}

/**
 * Removes a scratch directory, whatever a failing run left in it: a
 * workspace whose provisioned directories are read-only included.
 */
function removeScratch(directory) {
  const unlock = (current) => {
    fs.chmodSync(current, 0o755);
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) unlock(path.join(current, entry.name));
    }
  };
  if (fs.existsSync(directory)) unlock(directory);
  fs.rmSync(directory, { recursive: true, force: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** A file a run should have written, parsed; a missing one is a failed check and reads as an empty object, so the checks after it name what is wrong. */
function evidenceOf(file) {
  if (!fs.existsSync(file)) {
    check(false, `the run wrote no ${path.basename(path.dirname(file))}/${path.basename(file)}`);
    return {};
  }
  return readJson(file);
}

function sha256(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function git(project, args) {
  const result = spawnSync('git', ['-C', project, ...GIT_IDENTITY, ...args], {
    encoding: 'utf8',
    env: GIT_ENV,
    timeout: SPAWN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${project}: ${result.stderr}`);
  return result.stdout;
}

function evaluate(args, env = {}) {
  const result = spawnSync(process.execPath, [EVALUATE, ...args], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    env: { ...BASE_ENV, ...env },
    timeout: SPAWN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
  if (result.error) throw new Error(`tea-evaluate ${args.join(' ')} did not finish: ${result.error.message}`);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, output: `${result.stdout}${result.stderr}` };
}

/**
 * A temp project from the fixture. `edit` changes it before the index is
 * digested and, for a git project, before the commit.
 *
 * @returns {{ project: string, folder: string, temp: {directory: string, env: object} }}
 */
function makeProject(label, { git: isGit = true, edit = () => {} } = {}) {
  const project = path.join(tempDir(label), 'project');
  fs.cpSync(FIXTURE, project, { recursive: true, filter: (from) => path.basename(from) !== 'runs' });
  fs.writeFileSync(path.join(project, '.gitignore'), 'vendor/\n');
  const folder = path.join(project, EVALUATION);
  edit({ project, folder });
  const digested = evaluate(['digest', '--evaluation', folder]);
  if (digested.status !== 0) throw new Error(`digest failed for ${label}: ${digested.output}`);
  if (isGit) {
    git(project, ['init', '--quiet', '--initial-branch', 'main']);
    git(project, ['add', '--all']);
    git(project, ['commit', '--quiet', '--message', 'the verdict project']);
  }
  const directory = tempDir(`${label}-temp`);
  return { project, folder, temp: { directory, env: { TMPDIR: directory, TMP: directory, TEMP: directory } } };
}

function editJson(file, edit) {
  const value = readJson(file);
  edit(value);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function editMutation(folder, edit) {
  editJson(path.join(folder, 'mutations', 'M-001.mutation.json'), (mutation) => edit(mutation.operator));
}

/** Every file under `project` but `.git` and the evaluation's `runs/`, by relative path, with its digest. */
function fileDigests(project) {
  const digests = {};
  const skip = new Set([path.join(project, '.git'), path.join(project, EVALUATION, 'runs')]);
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (skip.has(full)) continue;
      if (entry.isDirectory()) visit(full);
      else digests[path.relative(project, full)] = entry.isSymbolicLink() ? `link:${fs.readlinkSync(full)}` : sha256(fs.readFileSync(full));
    }
  };
  visit(project);
  return digests;
}

/**
 * What the adopter's tree looks like: `git status`, every file's digest, the
 * worktree list, every ref (a worktree made on a new branch would add one),
 * the stash, and the repository's own configuration.
 */
function adopterState(project, isGit = true) {
  return {
    status: isGit ? git(project, ['status', '--porcelain=v1', '--untracked-files=all']) : null,
    files: JSON.stringify(fileDigests(project)),
    worktrees: isGit ? git(project, ['worktree', 'list', '--porcelain']) : null,
    refs: isGit ? git(project, ['for-each-ref']) : null,
    stash: isGit ? git(project, ['stash', 'list']) : null,
    config: isGit ? sha256(fs.readFileSync(path.join(project, '.git', 'config'))) : null,
  };
}

function runPreflight(fixture, args = []) {
  return evaluate(['preflight', '--evaluation', fixture.folder, ...args], fixture.temp.env);
}

/** The one run directory an invocation wrote, or null when it wrote none; more than one is a failed check. */
function runDirectoryOf(folder) {
  const runs = path.join(folder, 'runs');
  if (!fs.existsSync(runs)) return null;
  const entries = fs.readdirSync(runs, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  check(entries.length <= 1, `one invocation wrote ${entries.length} run directories under ${runs}`);
  return entries.length === 1 ? path.join(runs, entries[0].name) : null;
}

/** Every qualified probe a run wrote. */
function qualifiedProbes(runDirectory) {
  if (runDirectory === null) return [];
  const directory = path.join(runDirectory, 'probes');
  return fs.existsSync(directory) ? fs.readdirSync(directory).filter((name) => name.endsWith('.probe.json')) : [];
}

/** The value a stub's stdout line `<field>: <value>` gives. */
function stubField(stdout, field) {
  return new RegExp(`^${field}: (.*)$`, 'm').exec(stdout ?? '')?.[1];
}

function armStdout(arm) {
  return arm?.steps?.[0]?.observation?.stdout?.value;
}

/** The project and the temp directory after a run are what they were before it. */
function checkUntouched(label, fixture, before, isGit = true) {
  const after = adopterState(fixture.project, isGit);
  check(after.status === before.status, `${label}: git status of the project changed:\n${before.status}---\n${after.status}`);
  check(after.files === before.files, `${label}: a file in the project changed`);
  check(after.worktrees === before.worktrees, `${label}: git worktree list changed:\n${after.worktrees}`);
  check(after.refs === before.refs, `${label}: the project's refs changed:\n${before.refs}---\n${after.refs}`);
  check(after.stash === before.stash, `${label}: the project's stash changed`);
  check(after.config === before.config, `${label}: the project's .git/config changed`);
  const left = fs.readdirSync(fixture.temp.directory);
  check(left.length === 0, `${label}: the run left ${JSON.stringify(left)} in the temp directory`);
}

// ---------------------------------------------------------------------------

/** The git target's implementation digest, which a second project of the same files, checked out elsewhere, must reproduce. */
let gitTargetImplementationDigest;

/** A host credential the registry permits, long enough for the runtime to scrub. */
const SECRET = 'verdict-credential-0123456789';

/** Every file under `directory`, with its text. */
function textsUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { recursive: true })
    .map((relative) => path.join(directory, relative))
    .filter((file) => fs.statSync(file).isFile())
    .map((file) => ({ file, text: fs.readFileSync(file, 'utf8') }));
}

async function checkGitTarget() {
  const fixture = makeProject('git');
  const before = adopterState(fixture.project);
  const result = evaluate(['preflight', '--evaluation', fixture.folder], { ...fixture.temp.env, VERDICT_SECRET: SECRET });
  check(result.status === 0, `preflight over the git target exited ${result.status}; expected 0\n${result.output}`);
  checkUntouched('the git target', fixture, before);
  const runDirectory = runDirectoryOf(fixture.folder);
  check(runDirectory !== null, 'the git target wrote no run directory');
  if (runDirectory === null) return;

  const run = evidenceOf(path.join(runDirectory, 'run.json'));
  const head = git(fixture.project, ['rev-parse', 'HEAD']).trim();
  check(run.dirty === false, `run.json records dirty ${run.dirty} for a committed git target; expected false`);
  check(run.commit === head && run.workspace?.commit === head, `run.json records commit ${run.commit}; expected ${head}`);
  check(run.workspace?.kind === 'git-worktree', `the git target's workspace is ${run.workspace?.kind}; expected git-worktree`);
  check(run.adopterTree?.unchanged === true, 'run.json does not record the adopter tree as unchanged');

  const qualification = path.join(runDirectory, 'qualification', 'P-002');
  const baseline = evidenceOf(path.join(qualification, 'baseline-pass.json'));
  const mutated = evidenceOf(path.join(qualification, 'mutated-fail.json'));
  const rollback = evidenceOf(path.join(qualification, 'rollback.json'));
  const committed = fs.readFileSync(path.join(fixture.project, POLICY));
  const preDigest = sha256(committed);
  const mutatedDigest = sha256(Buffer.from(committed.toString('utf8').replace('mode: strict', 'mode: lenient')));
  check(rollback.preDigest === preDigest, `preDigest is ${rollback.preDigest}; the committed policy digests to ${preDigest}`);
  check(rollback.mutatedDigest !== rollback.preDigest, 'mutatedDigest equals preDigest; the mutation changed nothing');
  check(
    rollback.mutatedDigest === mutatedDigest,
    `mutatedDigest is ${rollback.mutatedDigest}; the mutated policy digests to ${mutatedDigest}`,
  );
  check(rollback.restoredDigest === rollback.preDigest, `restoredDigest ${rollback.restoredDigest} is not preDigest ${rollback.preDigest}`);
  check(rollback.rollbackVerified === true, 'rollback.json does not record rollbackVerified: true');
  const rePass = (rollback.rePasses ?? []).at(-1);
  check(
    rollback.rePasses?.length === 1,
    `the baseline was re-run ${rollback.rePasses?.length} time(s) though its first re-run passed; step 6 stops at the first pass`,
  );
  check(
    stubField(armStdout(rePass), 'digest') === rollback.preDigest,
    `the baseline re-run's own stdout names digest ${stubField(armStdout(rePass), 'digest')}; expected preDigest ${rollback.preDigest}`,
  );
  check(
    stubField(armStdout(mutated), 'digest') === rollback.mutatedDigest,
    `the mutated arm's own stdout names digest ${stubField(armStdout(mutated), 'digest')}; expected mutatedDigest ${rollback.mutatedDigest}`,
  );
  check(stubField(armStdout(baseline), 'digest') === rollback.preDigest, "the baseline arm's stdout does not name preDigest");
  check(
    stubField(armStdout(baseline), 'request') === 'Judge the request.',
    `the arm sent stdin ${JSON.stringify(stubField(armStdout(baseline), 'request'))}; a one-key stdin binding is sent as its text`,
  );
  check(baseline.verdict === 'held' && mutated.verdict === 'violated', `the arms' verdicts are ${baseline.verdict} and ${mutated.verdict}`);
  check(
    stubField(armStdout(baseline), 'workspace') === 'git-worktree',
    `the baseline arm ran in a "${stubField(armStdout(baseline), 'workspace')}" directory; a git target runs in a detached worktree`,
  );
  check(stubField(armStdout(baseline), 'vendor') === 'provisioned', 'the provisioned vendor/ was not readable in the workspace');
  if (IS_ROOT) {
    console.log('skipped: the read-only provisioning check, since root ignores permission bits; run the suite as another user');
  } else {
    check(
      stubField(armStdout(baseline), 'vendor-write') === 'denied',
      `a write under the provisioned vendor/ was ${stubField(armStdout(baseline), 'vendor-write')}; the workspace holds it read-only`,
    );
  }

  const probes = qualifiedProbes(runDirectory);
  check(JSON.stringify(probes) === JSON.stringify(['P-002.probe.json']), `the run wrote qualified probes ${JSON.stringify(probes)}`);
  const probe = evidenceOf(path.join(runDirectory, 'probes', 'P-002.probe.json'));
  const problems = await createArtifactValidator()('probe', probe);
  check(problems.length === 0, `the qualified probe does not meet eval-quality's probe schema: ${problems.join('; ')}`);
  check(probe.qualification?.rollbackVerified === true, 'the qualified probe does not carry rollbackVerified: true');
  check(probe.artifactDigest === preDigest, `the probe's artifactDigest is ${probe.artifactDigest}; expected ${preDigest}`);
  gitTargetImplementationDigest = probe.implementationDigest;
  check(
    probe.commitDigest === sha256(Buffer.from(head, 'utf8')),
    `the worktree probe's commitDigest is ${probe.commitDigest}; expected the SHA-256 of the evaluated commit id ${head}`,
  );
  for (const field of ['baselinePassEvidence', 'mutatedFailEvidence']) {
    const reference = probe.qualification?.[field];
    check(reference !== undefined, `the qualified probe carries no ${field}`);
    if (reference === undefined) continue;
    const bytes = fs.readFileSync(path.join(fixture.folder, reference.path));
    check(sha256(bytes) === reference.digest, `${field} records digest ${reference.digest}; ${reference.path} digests to ${sha256(bytes)}`);
  }
  check(
    JSON.stringify(evidenceOf(path.join(runDirectory, 'probes.json'))) === JSON.stringify([probe]),
    'the probe list the CLI received is not the qualified probe',
  );

  const observationDirectory = path.join(runDirectory, 'observations');
  const observations = fs.existsSync(observationDirectory)
    ? fs.readdirSync(observationDirectory).map((name) => readJson(path.join(observationDirectory, name)))
    : [];
  const witness = observations.find((entry) => entry.legId === WITNESS_LEG);
  check(witness !== undefined, `no observation of the witness leg ${WITNESS_LEG}`);
  check(
    witness?.workspace === 'mutated:M-001' && witness?.cwd === run.workspaces['mutated:M-001'],
    `the witness leg ran in ${witness?.workspace} (${witness?.cwd}); expected the mutated workspace ${run.workspaces['mutated:M-001']}`,
  );
  check(run.workspaces['mutated:M-001'] !== run.workspaces.pristine, 'the mutated and pristine workspaces are one directory');
  check(
    stubField(witness?.observation?.stdout?.value, 'digest') === rollback.mutatedDigest,
    "the witness leg's own stdout does not name the mutated digest",
  );
  const cleanLegs = observations.filter((candidate) => candidate.legId !== WITNESS_LEG);
  check(cleanLegs.length === 4, `the run observed ${cleanLegs.length} clean legs; the plan holds two witness legs and two control legs`);
  for (const entry of cleanLegs) {
    check(
      entry.workspace === 'pristine' && entry.cwd === run.workspaces.pristine,
      `leg ${entry.legId} ran in ${entry.workspace} (${entry.cwd}); expected the pristine workspace ${run.workspaces.pristine}`,
    );
    check(
      stubField(entry.observation?.stdout?.value, 'digest') === preDigest,
      `leg ${entry.legId}'s stdout does not name the pristine digest`,
    );
  }
  const verdict = evidenceOf(path.join(runDirectory, 'preflight-verdict.json'));
  check(verdict.passed === true, `the CLI's preflight verdict is passed: ${verdict.passed}`);
  for (const kind of ['seeded-faults-scoped', 'seeded-fault-fired']) {
    const outcome = (verdict.checks ?? []).find((entry) => entry.kind === kind)?.outcome;
    check(outcome === 'satisfied', `the ${kind} check is ${outcome}; expected satisfied`);
  }
  check(!fs.existsSync(path.join(fixture.project, 'vendor', 'probe-write.txt')), "a leg wrote into the project's own vendor/");

  // The legs run in a workspace the qualification never touched: the residue
  // the mutated arm left behind reached no clean leg.
  check(stubField(armStdout(mutated), 'residue') === 'no', 'the mutated arm found residue before it wrote any');
  check(stubField(armStdout(rePass), 'residue') === 'yes', "the re-run did not see the mutated arm's residue, so the case proves nothing");
  for (const entry of cleanLegs) {
    check(
      stubField(entry.observation?.stdout?.value, 'residue') === 'no',
      `leg ${entry.legId} saw what the qualification's mutated arm left behind`,
    );
    check(
      stubField(entry.observation?.stdout?.value, 'evaluation') === 'absent',
      `leg ${entry.legId} could read the evaluation folder, which names the planted defect`,
    );
  }
  // The permitted credential reached the target and was scrubbed from every record.
  check(stubField(armStdout(baseline), 'secret') === '[redacted]', 'the host credential did not reach the target, or was not scrubbed');
  for (const { file, text } of textsUnder(runDirectory)) {
    check(!text.includes(SECRET), `${path.relative(runDirectory, file)} holds the host credential`);
  }
}

function checkUncommittedWork() {
  const fixture = makeProject('dirty');
  const edited = 'mode: strict\n# edited in the working tree\n';
  fs.writeFileSync(path.join(fixture.project, POLICY), edited);
  const committedDigest = sha256(git(fixture.project, ['show', `HEAD:${POLICY.split(path.sep).join('/')}`]));

  const before = adopterState(fixture.project);
  const atCommit = runPreflight(fixture);
  check(atCommit.status === 0, `preflight over a dirty git target exited ${atCommit.status}; expected 0\n${atCommit.output}`);
  check(atCommit.stderr.includes('--from-working-tree'), `the run does not say the uncommitted edit was left out:\n${atCommit.output}`);
  checkUntouched('the dirty target at its commit', fixture, before);
  let runDirectory = runDirectoryOf(fixture.folder);
  if (runDirectory !== null) {
    const rollback = evidenceOf(path.join(runDirectory, 'qualification', 'P-002', 'rollback.json'));
    check(rollback.preDigest === committedDigest, 'without --from-working-tree the run evaluated the working tree, not the commit');
    check(evidenceOf(path.join(runDirectory, 'run.json')).dirty === false, 'a run of the commit records dirty: true');
    fs.rmSync(path.join(fixture.folder, 'runs'), { recursive: true, force: true });
  }

  const beforeWorking = adopterState(fixture.project);
  const working = runPreflight(fixture, ['--from-working-tree']);
  check(working.status === 0, `preflight --from-working-tree exited ${working.status}; expected 0\n${working.output}`);
  checkUntouched('the working tree run', fixture, beforeWorking);
  runDirectory = runDirectoryOf(fixture.folder);
  check(runDirectory !== null, 'the working tree run wrote no run directory');
  if (runDirectory === null) return;
  const run = evidenceOf(path.join(runDirectory, 'run.json'));
  check(run.dirty === true && run.workspace.dirty === true, `run.json records dirty ${run.dirty} under --from-working-tree; expected true`);
  check(run.workspace.kind === 'copy', `the working tree run's workspace is ${run.workspace.kind}; expected a temp copy`);
  const rollback = evidenceOf(path.join(runDirectory, 'qualification', 'P-002', 'rollback.json'));
  check(rollback.preDigest === sha256(Buffer.from(edited)), 'under --from-working-tree the run did not evaluate the uncommitted edit');
  const baseline = evidenceOf(path.join(runDirectory, 'qualification', 'P-002', 'baseline-pass.json'));
  check(
    stubField(armStdout(baseline), 'workspace') === 'plain',
    `the working tree run's arm ran in a "${stubField(armStdout(baseline), 'workspace')}" directory`,
  );
}

function checkCopyWorkspaces() {
  for (const [label, options] of [
    ['a copy workspace', { git: true, kind: 'copy' }],
    ['a target outside any git repository', { git: false, kind: 'git' }],
  ]) {
    const fixture = makeProject(label.split(' ').at(-1), {
      git: options.git,
      edit: ({ folder }) => editJson(path.join(folder, 'evaluation.json'), (value) => (value.workspace.kind = options.kind)),
    });
    if (!options.git) {
      const enclosing = spawnSync('git', ['-C', fixture.project, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', env: GIT_ENV });
      if (enclosing.status === 0) {
        check(
          false,
          `${label}: the temp directory sits inside the git repository ${enclosing.stdout.trim()}; point TMPDIR outside any repository`,
        );
        continue;
      }
    }
    const before = adopterState(fixture.project, options.git);
    const result = runPreflight(fixture);
    check(result.status === 0, `preflight over ${label} exited ${result.status}; expected 0\n${result.output}`);
    checkUntouched(label, fixture, before, options.git);
    const runDirectory = runDirectoryOf(fixture.folder);
    if (runDirectory === null) {
      check(false, `${label} wrote no run directory`);
      continue;
    }
    const run = evidenceOf(path.join(runDirectory, 'run.json'));
    check(run.dirty === false, `run.json records dirty ${run.dirty} for ${label}; expected false`);
    check(run.commit === null, `run.json records commit ${run.commit} for ${label}, whose bytes no commit names`);
    check(run.workspace.kind === 'copy', `${label}'s workspace is ${run.workspace.kind}; expected a temp copy`);
    check(/^sha256:[0-9a-f]{64}$/.test(run.workspace.treeDigest ?? ''), `${label}'s run.json records no tree digest`);
    const baseline = evidenceOf(path.join(runDirectory, 'qualification', 'P-002', 'baseline-pass.json'));
    check(
      stubField(armStdout(baseline), 'workspace') === 'plain',
      `${label}'s arm ran in a "${stubField(armStdout(baseline), 'workspace')}" directory`,
    );
    check(qualifiedProbes(runDirectory).length === 1, `${label} wrote no qualified probe`);
    const copyProbe = evidenceOf(path.join(runDirectory, 'probes', 'P-002.probe.json'));
    check(
      copyProbe.commitDigest === run.workspace.treeDigest,
      `${label}'s probe commitDigest is ${copyProbe.commitDigest}; a copy names no commit, so it is the tree digest ${run.workspace.treeDigest}`,
    );
  }
}

/** Each failing case: its exit, its message, no qualified probe, and nothing changed or left behind. */
function checkFailures() {
  const cases = [
    {
      name: 'a find text the target does not hold',
      edit: ({ folder }) => editMutation(folder, (operator) => (operator.find = 'mode: absent')),
      exit: 10,
      says: '0 occurrence(s)',
    },
    {
      name: 'a find text the target holds twice',
      edit: ({ project }) => fs.writeFileSync(path.join(project, POLICY), 'mode: strict\nmode: strict\n'),
      exit: 10,
      says: '2 occurrence(s)',
    },
    {
      name: 'a baseline that does not pass',
      edit: ({ project, folder }) => {
        fs.writeFileSync(path.join(project, POLICY), 'mode: lenient\n');
        editMutation(folder, (operator) => {
          operator.find = 'mode: lenient';
          operator.replace = 'mode: strict';
        });
      },
      exit: 11,
      says: 'the clean arm did not pass',
      evidence: ['baseline-pass.json', 'rollback.json'],
    },
    {
      name: 'a mutation the verdict does not notice',
      edit: ({ folder }) => editMutation(folder, (operator) => (operator.replace = 'mode: strict, as before')),
      exit: 11,
      says: 'the mutated arm did not fail',
      evidence: ['baseline-pass.json', 'mutated-fail.json', 'rollback.json'],
    },
    {
      name: 'a restore that cannot write',
      edit: ({ folder }) => editMutation(folder, (operator) => (operator.replace = 'mode: lenient\nsabotage: restore')),
      exit: 12,
      says: 'the restore of rules/policy.txt could not be written',
    },
    {
      name: 'a mutated arm that links the target directory out of its workspace',
      edit: ({ folder }) => editMutation(folder, (operator) => (operator.replace = 'mode: lenient\nsabotage: link')),
      env: (fixture) => ({ VERDICT_LINK: path.join(fixture.project, 'rules') }),
      exit: 12,
      says: 'rules is a symbolic link',
    },
    {
      name: 'a seeded probe with no defect signature',
      edit: ({ folder }) => editJson(path.join(folder, 'probes', 'P-002.probe.json'), (probe) => delete probe.defectSignature),
      exit: 10,
      says: 'signature-absent',
    },
    {
      name: 'a target exiting an infrastructure code',
      edit: ({ folder }) => editMutation(folder, (operator) => (operator.replace = 'infrastructure: exit 3')),
      exit: 12,
      says: 'infrastructure exit code',
    },
    {
      name: 'a temp directory that does not exist',
      before: (fixture) => {
        fixture.temp.env = {
          TMPDIR: path.join(fixture.temp.directory, 'missing'),
          TMP: path.join(fixture.temp.directory, 'missing'),
          TEMP: path.join(fixture.temp.directory, 'missing'),
        };
      },
      exit: 12,
      says: 'point TMPDIR at an existing directory',
      noRun: true,
    },
    {
      name: 'an unwritable temp directory',
      before: (fixture) => fs.chmodSync(fixture.temp.directory, 0o555),
      exit: 12,
      says: 'could not create a workspace',
      noRun: true,
      skip: IS_ROOT && "root ignores the temp directory's permission bits",
    },
  ];
  for (const failure of cases) {
    if (failure.skip) {
      console.log(`skipped: ${failure.name}, since ${failure.skip}`);
      continue;
    }
    const fixture = makeProject(failure.name.split(' ').slice(-2).join('-'), { edit: failure.edit ?? (() => {}) });
    const before = adopterState(fixture.project);
    failure.before?.(fixture);
    const result = evaluate(['preflight', '--evaluation', fixture.folder], { ...fixture.temp.env, ...failure.env?.(fixture) });
    fs.chmodSync(fixture.temp.directory, 0o755);
    check(
      result.status === failure.exit,
      `preflight with ${failure.name} exited ${result.status}; expected ${failure.exit}\n${result.output}`,
    );
    check(result.stdout.includes(failure.says), `preflight with ${failure.name} does not say "${failure.says}":\n${result.output}`);
    const runDirectory = runDirectoryOf(fixture.folder);
    check(qualifiedProbes(runDirectory).length === 0, `preflight with ${failure.name} wrote a qualified probe`);
    if (failure.noRun) check(runDirectory === null, `preflight with ${failure.name} started a run`);
    else {
      check(runDirectory !== null, `preflight with ${failure.name} wrote no run directory`);
      check(
        runDirectory !== null && !fs.existsSync(path.join(runDirectory, 'probes.json')),
        `preflight with ${failure.name} handed the CLI a probe list`,
      );
      for (const file of failure.evidence ?? []) {
        check(
          runDirectory !== null && fs.existsSync(path.join(runDirectory, 'qualification', 'P-002', file)),
          `preflight with ${failure.name} kept no qualification/P-002/${file}`,
        );
      }
    }
    checkUntouched(failure.name, fixture, before);
  }
}

/**
 * A target that writes outside its workspace (a path the host environment
 * hands it) during the mutated arm changes the adopter's tree, which the
 * runtime's own before and after readings catch: exit 12, and no qualified
 * probe.
 */
function checkAdopterTreeGuard() {
  const fixture = makeProject('touch', {
    edit: ({ folder }) => editMutation(folder, (operator) => (operator.replace = 'mode: lenient\nsabotage: adopter')),
  });
  const touched = path.join(fixture.project, 'notes.txt');
  const worktrees = git(fixture.project, ['worktree', 'list', '--porcelain']);
  const result = evaluate(['preflight', '--evaluation', fixture.folder], { ...fixture.temp.env, VERDICT_TOUCH: touched });
  check(result.status === 12, `preflight whose target wrote into the project exited ${result.status}; expected 12\n${result.output}`);
  check(result.stdout.includes("the adopter's tree"), `the refusal does not name the adopter's tree:\n${result.output}`);
  check(fs.existsSync(touched), 'the stub never wrote outside its workspace, so the case proves nothing');
  const runDirectory = runDirectoryOf(fixture.folder);
  check(qualifiedProbes(runDirectory).length === 0, 'a run whose target changed the project wrote a qualified probe');
  check(
    runDirectory !== null && evidenceOf(path.join(runDirectory, 'run.json')).adopterTree.unchanged === false,
    'run.json does not record the adopter tree as changed',
  );
  check(git(fixture.project, ['worktree', 'list', '--porcelain']) === worktrees, 'the run left a worktree behind');
  check(fs.readdirSync(fixture.temp.directory).length === 0, 'the run left a workspace in the temp directory');
}

/**
 * The cycle itself, over a scratch directory and scripted arms: step 5 stops a
 * restore whose digest differs with exit 12 on its own (a digest function that
 * answers a third value for the restored bytes), and step 6 re-runs the
 * baseline at most `1 + reExecutionCap` times.
 */
async function checkCycle() {
  const root = tempDir('cycle');
  fs.mkdirSync(path.join(root, 'rules'));
  fs.writeFileSync(path.join(root, POLICY), 'mode: strict\n');
  const mutation = {
    mutationId: 'M-001',
    targetArtifact: 'rules/policy.txt',
    operator: { kind: 'replace-exact', find: 'mode: strict', replace: 'mode: lenient', occurrences: 1 },
  };
  const scripted = (verdicts) => {
    const phases = [];
    const runArm = async (phase) => {
      phases.push(phase);
      return { verdict: verdicts[phase] ?? 'held' };
    };
    return { phases, runArm };
  };
  const outcome = async (options) => {
    try {
      return { evidence: await runMutationCycle({ root, mutation, digestBytes: sha256, ...options }) };
    } catch (error) {
      if (!(error instanceof QualificationError)) throw error;
      return { error };
    }
  };

  // The original bytes digest to a third value once the mutated bytes have
  // been digested, as a restore that wrote something else would read.
  let mutatedSeen = false;
  const drifting = await outcome({
    ...scripted({ mutated: 'violated' }),
    reExecutionCap: 0,
    digestBytes: (bytes) => {
      const original = Buffer.from(bytes).toString('utf8') === 'mode: strict\n';
      if (!original) mutatedSeen = true;
      return original && mutatedSeen ? 'sha256:restored-bytes-that-differ' : sha256(bytes);
    },
  });
  check(
    drifting.error?.exitCode === 12 && drifting.error.message.includes('not the pre-mutation'),
    `a restore whose digest differs stopped with ${drifting.error?.exitCode ?? 'no error'}: ${drifting.error?.message}; expected 12 at step 5`,
  );
  check(drifting.error?.evidence?.rollbackVerified === false, 'a restore whose digest differs still recorded rollbackVerified');
  check(fs.readFileSync(path.join(root, POLICY), 'utf8') === 'mode: strict\n', 'the cycle left the target mutated');

  const flaky = scripted({ mutated: 'violated', 're-pass-1': 'violated', 're-pass-2': 'held' });
  const recovered = await outcome({ runArm: flaky.runArm, reExecutionCap: 1 });
  check(
    recovered.evidence?.rollbackVerified === true && recovered.evidence.rePasses.length === 2,
    `a baseline that passes on its second re-run within reExecutionCap 1 gave ${JSON.stringify(recovered.error?.message ?? recovered.evidence?.rePasses)}`,
  );
  check(
    JSON.stringify(flaky.phases) === JSON.stringify(['baseline', 'mutated', 're-pass-1', 're-pass-2']),
    `the cycle ran its arms as ${JSON.stringify(flaky.phases)}; AD-8 orders baseline, mutated, then the re-runs`,
  );
  // Step 5 comes before the mutated verdict: a drifted restore stops with 12
  // even when the mutated arm did not fail.
  let heldSeen = false;
  const driftingHeld = await outcome({
    ...scripted({ mutated: 'held' }),
    reExecutionCap: 0,
    digestBytes: (bytes) => {
      const original = Buffer.from(bytes).toString('utf8') === 'mode: strict\n';
      if (!original) heldSeen = true;
      return original && heldSeen ? 'sha256:restored-bytes-that-differ' : sha256(bytes);
    },
  });
  check(
    driftingHeld.error?.exitCode === 12,
    `a drifted restore beside a mutated arm that held stopped with ${driftingHeld.error?.exitCode ?? 'no error'}; expected 12, step 5 before the mutated verdict`,
  );
  for (const [phase, verdicts] of [
    ['baseline', { baseline: 'inconclusive' }],
    ['mutated', { mutated: 'inconclusive' }],
  ]) {
    const unsettled = await outcome({ ...scripted(verdicts), reExecutionCap: 0 });
    check(
      unsettled.error?.exitCode === 11,
      `an inconclusive ${phase} arm stopped with ${unsettled.error?.exitCode ?? 'no error'}; expected 11`,
    );
  }

  const first = scripted({ mutated: 'violated' });
  await outcome({ runArm: first.runArm, reExecutionCap: 2 });
  check(
    JSON.stringify(first.phases) === JSON.stringify(['baseline', 'mutated', 're-pass-1']),
    `a baseline that passes its first re-run under reExecutionCap 2 ran ${JSON.stringify(first.phases)}; step 6 stops at the first pass`,
  );
  const capped = await outcome({ ...scripted({ mutated: 'violated', 're-pass-1': 'violated', 're-pass-2': 'held' }), reExecutionCap: 0 });
  check(
    capped.error?.exitCode === 12 && capped.error.evidence?.rePasses?.length === 1,
    `a baseline that fails its only re-run under reExecutionCap 0 stopped with ${capped.error?.exitCode ?? 'no error'} after ${capped.error?.evidence?.rePasses?.length} re-run(s); expected 12 (an unfit harness) after 1`,
  );
}

/**
 * The rest of the runtime units the end-to-end cases reach only on their
 * happy path: the restored mode, overlapping occurrences, the evaluator's
 * polarity, the arm's binding rules and order, the tree digest, and the live
 * harness's leg cache.
 */
async function checkUnits() {
  const root = tempDir('units');
  fs.mkdirSync(path.join(root, 'bin'));
  const script = path.join(root, 'bin', 'run.sh');
  fs.writeFileSync(script, '#!/bin/sh\necho strict\n');
  fs.chmodSync(script, 0o755);
  const mutation = {
    mutationId: 'M-002',
    targetArtifact: 'bin/run.sh',
    operator: { kind: 'replace-exact', find: 'strict', replace: 'lenient', occurrences: 1 },
  };
  const verdicts = { mutated: 'violated' };
  let evidence = {};
  try {
    evidence = await runMutationCycle({
      root,
      mutation,
      digestBytes: sha256,
      reExecutionCap: 0,
      runArm: async (phase) => ({ verdict: verdicts[phase] ?? 'held' }),
    });
  } catch (error) {
    if (!(error instanceof QualificationError)) throw error;
    check(false, `the executable target stopped the cycle: ${error.message}`);
  }
  check(evidence.rollbackVerified === true, 'the executable target was not qualified');
  check(
    (fs.statSync(script).mode & 0o777) === 0o755,
    `the restore left bin/run.sh with mode ${(fs.statSync(script).mode & 0o777).toString(8)}; expected 755`,
  );

  check(countOccurrences(Buffer.from('ababab'), Buffer.from('abab')) === 2, 'overlapping occurrences of the find text count once');

  check(
    dispositionOf('true', 'expects-hold') === 'held' && dispositionOf('false', 'expects-hold') === 'violated',
    'an expects-hold oracle reads its resolution the wrong way',
  );
  check(
    dispositionOf('false', 'expects-violation') === 'held' && dispositionOf('true', 'expects-violation') === 'violated',
    'an expects-violation oracle reads its resolution the wrong way',
  );
  check(dispositionOf('insufficient-evidence', 'expects-hold') === 'not-attempted', 'insufficient evidence is not read as not attempted');

  const contract = readJson(path.join(FIXTURE, EVALUATION, 'contract.json'));
  const step = contract.interactionPlan[0];
  const sent = [];
  const port = {
    probe: async (request) => {
      sent.push(request.probeId);
      return {
        request,
        observation: {
          probeId: request.probeId,
          kind: 'cli',
          exitCode: 0,
          stdout: { kind: 'text', value: '' },
          stderr: { kind: 'text', value: '' },
          artifacts: {},
        },
      };
    },
  };
  const registry = { targetFor: () => ({ infrastructureExitCodes: [3] }) };
  const ordered = {
    ...contract,
    interactionPlan: [
      { ...step, stepId: 'second', after: 'first' },
      { ...step, stepId: 'first' },
    ],
  };
  await runArm({ contract: ordered, port, registry, label: 'order' });
  check(
    JSON.stringify(sent) === JSON.stringify(['order-first', 'order-second']),
    `the arm ran its steps as ${JSON.stringify(sent)}; a step runs after the one its after clause names`,
  );
  for (const binding of [{ matcher: 'any' }, { captured: '/interactions/first/stdout' }, { principal: 'reviewer' }]) {
    const unbound = { ...contract, interactionPlan: [{ ...step, inputBinding: { ...step.inputBinding, stdin: { prompt: binding } } }] };
    let refused = null;
    try {
      await runArm({ contract: unbound, port, registry, label: 'binding' });
    } catch (error) {
      refused = error;
    }
    check(
      refused instanceof ArmError,
      `an arm binding stdin with ${JSON.stringify(binding)} ran; this release sends literal bindings only`,
    );
  }

  const tree = path.join(root, 'tree');
  fs.mkdirSync(path.join(tree, 'a'), { recursive: true });
  fs.writeFileSync(path.join(tree, 'a', 'b.txt'), 'one\n');
  const first = treeDigest(tree);
  check(treeDigest(tree) === first, 'the tree digest of an unchanged tree moved');
  fs.writeFileSync(path.join(tree, 'a', 'b.txt'), 'two\n');
  check(treeDigest(tree) !== first, 'the tree digest did not move with a file');

  // An arm is held only when every oracle holds; one the evidence cannot settle leaves it inconclusive.
  check(
    armVerdict([{ disposition: 'held' }, { disposition: 'not-attempted' }]) === 'inconclusive',
    'an arm with an unsettled oracle reads as held',
  );
  check(
    armVerdict([{ disposition: 'not-attempted' }, { disposition: 'violated' }]) === 'violated',
    'an arm with a violated oracle does not read as violated',
  );
  check(armVerdict([{ disposition: 'held' }]) === 'held', 'an arm whose oracles hold does not read as held');

  // A qualified probe reaches the CLI only past eval-quality's schema and qualification gate.
  const engine = await loadEngine();
  const validate = createArtifactValidator();
  const probe = readJson(path.join(FIXTURE, EVALUATION, 'probes', 'P-002.probe.json'));
  const reference = { storage: 'public', path: 'runs/x/qualification/P-002/baseline-pass.json', privateRef: null, digest: sha256('x') };
  const candidate = qualifiedProbe({
    probe,
    mutation: readJson(path.join(FIXTURE, EVALUATION, 'mutations', 'M-001.mutation.json')),
    systemId: 'verdict-mutation',
    digests: { implementationDigest: sha256('i'), commitDigest: sha256('c'), artifactDigest: sha256('a') },
    baselinePassEvidence: reference,
    mutatedFailEvidence: reference,
    rollbackVerified: true,
  });
  check((await admissionRefusal({ candidate, contract, engine, validate })) === null, 'a well-formed qualified probe was refused');
  const { schemaVersion, ...unstamped } = candidate;
  void schemaVersion;
  const malformed = await admissionRefusal({ candidate: unstamped, contract, engine, validate });
  check(String(malformed).includes("eval-quality's probe schema"), `a qualified probe with no schemaVersion was admitted: ${malformed}`);
  const unsigned = await admissionRefusal({ candidate: { ...candidate, defectSignature: null }, contract, engine, validate });
  check(String(unsigned).includes('signature-absent'), `a defect probe with no signature passed the qualification gate: ${unsigned}`);

  // The leg cache: a pinned key, one live call per request, credentials kept out of the record.
  const request = {
    probeId: 'leg-a',
    interfaceId: 'verdict',
    operationId: 'judge-request',
    kind: 'cli',
    executable: 'verdict',
    subcommandPath: [],
    channels: { argument: {}, option: {}, environment: {}, stdin: { kind: 'text', value: 'x' } },
  };
  check(
    requestKey(request) === '2b2cf6ac9d3e86e8fd1800a6d4f7f229',
    `requestKey of the pinned request is ${requestKey(request)}; a changed key orphans every recorded leg cache`,
  );
  const cacheDir = path.join(root, 'cache');
  let spawned = 0;
  const live = cachingPort({
    cacheDir,
    augment: (planned) => ({ ...planned, channels: { ...planned.channels, environment: { TOKEN: SECRET } } }),
    makePort: async () => {
      const workspace = { root: fs.mkdtempSync(path.join(root, 'leg-')) };
      return {
        workspace,
        port: {
          probe: async (augmented) => {
            spawned += 1;
            return {
              probeId: augmented.probeId,
              kind: 'cli',
              exitCode: 0,
              stdout: { kind: 'text', value: 'ok' },
              stderr: { kind: 'text', value: '' },
              artifacts: {},
            };
          },
        },
      };
    },
  });
  await live.probe(request);
  const again = await live.probe({ ...request, probeId: 'leg-b' });
  check(
    spawned === 1 && again.probeId === 'leg-b',
    `the leg cache spawned ${spawned} time(s) for one request, or answered with another leg's id`,
  );
  const record = fs.readFileSync(path.join(cacheDir, `${requestKey(request)}.json`), 'utf8');
  check(record.includes('"TOKEN"') && !record.includes(SECRET), 'the cached record holds a credential value, or not its key');
  let forcedSpawns = 0;
  const forced = cachingPort({
    cacheDir,
    force: true,
    makePort: async () => {
      const workspace = { root: fs.mkdtempSync(path.join(root, 'leg-')) };
      return {
        workspace,
        port: {
          probe: async (augmented) => {
            forcedSpawns += 1;
            return {
              probeId: augmented.probeId,
              kind: 'cli',
              exitCode: 0,
              stdout: { kind: 'text', value: `run ${forcedSpawns}` },
              stderr: { kind: 'text', value: '' },
              artifacts: {},
            };
          },
        },
      };
    },
  });
  await forced.probe(request);
  const shared = await forced.probe({ ...request, probeId: 'leg-d' });
  check(
    forcedSpawns === 1 && shared.stdout.value === 'run 1',
    `under force, a second leg sending one request spawned ${forcedSpawns} time(s); the first leg's evidence must stand`,
  );
  const cached = await cacheOnlyPort({ cacheDir }).probe({ ...request, probeId: 'leg-c' });
  check(cached.probeId === 'leg-c', 'the cache-only port answered with another leg id');
  let missed = null;
  try {
    await cacheOnlyPort({ cacheDir }).probe({ ...request, channels: { ...request.channels, stdin: { kind: 'text', value: 'y' } } });
  } catch (error) {
    missed = error;
  }
  check(missed !== null, 'the cache-only port answered a request it never saw');
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * A run interrupted by `SIGTERM` while its mutated arm runs in a worktree ends
 * by that signal, and leaves no workspace, no worktree entry, no target
 * process, and an unchanged project.
 */
async function checkInterrupted() {
  const fixture = makeProject('interrupt', {
    edit: ({ folder }) => editMutation(folder, (operator) => (operator.replace = 'mode: lenient\nsleep: 30000')),
  });
  const before = adopterState(fixture.project);
  const pidFile = path.join(tempDir('interrupt-pid'), 'pid');
  const child = spawn(process.execPath, [EVALUATE, 'preflight', '--evaluation', fixture.folder], {
    cwd: PROJECT_ROOT,
    env: { ...BASE_ENV, ...fixture.temp.env, VERDICT_PID: pidFile },
    stdio: 'ignore',
  });
  const closed = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
  let target = null;
  for (let waited = 0; waited < 20_000 && target === null; waited += 50) {
    if (fs.existsSync(pidFile) && Number(fs.readFileSync(pidFile, 'utf8')) > 0) target = Number(fs.readFileSync(pidFile, 'utf8'));
    else await delay(50);
  }
  check(target !== null, 'the interrupted run never reached its mutated arm');
  child.kill('SIGTERM');
  const ended = await Promise.race([closed, delay(SPAWN_TIMEOUT_MS).then(() => null)]);
  if (ended === null) {
    child.kill('SIGKILL');
    check(false, `the interrupted run was still running ${SPAWN_TIMEOUT_MS} ms after SIGTERM`);
    return;
  }
  check(ended.signal === 'SIGTERM', `the interrupted run ended by ${ended.signal ?? `exit ${ended.code}`}; expected SIGTERM`);
  if (target !== null) {
    // Alive means the pid still runs the verdict stub, so a reused pid cannot read as a survivor.
    const runsStub = () => {
      const listed = spawnSync('ps', ['-p', String(target), '-o', 'command='], { encoding: 'utf8' });
      return listed.status === 0 && listed.stdout.includes('verdict.js');
    };
    let alive = runsStub();
    for (let waited = 0; waited < 5000 && alive; waited += 50) {
      await delay(50);
      alive = runsStub();
    }
    check(!alive, `the target the interrupted arm started (pid ${target}) outlived the run`);
    if (alive) process.kill(target, 'SIGKILL');
  }
  checkUntouched('the interrupted run', fixture, before);
}

/**
 * A run started with `GIT_DIR`, `GIT_WORK_TREE` and `GIT_INDEX_FILE` pointing
 * at another repository, as inside a git hook, still makes its worktree from
 * the project's own repository and leaves the other one untouched.
 */
function checkHookEnvironment() {
  const fixture = makeProject('hook');
  const other = makeProject('hook-other');
  const before = adopterState(fixture.project);
  const otherBefore = adopterState(other.project);
  const result = evaluate(['preflight', '--evaluation', fixture.folder], {
    ...fixture.temp.env,
    GIT_DIR: path.join(other.project, '.git'),
    GIT_WORK_TREE: other.project,
    GIT_INDEX_FILE: path.join(other.project, 'no-such-index'),
  });
  check(result.status === 0, `preflight under a hook's GIT_ variables exited ${result.status}; expected 0\n${result.output}`);
  checkUntouched("the run under a hook's GIT_ variables", fixture, before);
  const otherAfter = adopterState(other.project);
  check(
    JSON.stringify(otherAfter) === JSON.stringify(otherBefore),
    "the run under a hook's GIT_ variables changed the repository they name",
  );
  const runDirectory = runDirectoryOf(fixture.folder);
  const run = runDirectory === null ? {} : evidenceOf(path.join(runDirectory, 'run.json'));
  check(
    run.commit === git(fixture.project, ['rev-parse', 'HEAD']).trim(),
    `the run under a hook's GIT_ variables evaluated commit ${run.commit}, not the project's own HEAD`,
  );
  const probe = runDirectory === null ? {} : evidenceOf(path.join(runDirectory, 'probes', 'P-002.probe.json'));
  check(
    probe.implementationDigest === gitTargetImplementationDigest,
    `the same files checked out in another worktree digest to ${probe.implementationDigest}, not ${gitTargetImplementationDigest}; the digest must not depend on where the checkout sits`,
  );
}

/**
 * The adopter's repository, not only its working tree: a target that tags the
 * commit through the worktree it runs in changes the refs the adopter's
 * repository shares, and a leg of an evaluation with no seeded probe that
 * writes into the project is caught after the legs. Both exit 12 with no
 * qualified probe.
 */
function checkSharedRepository() {
  const tagged = makeProject('refs', {
    edit: ({ folder }) => editMutation(folder, (operator) => (operator.replace = 'mode: lenient\nsabotage: refs')),
  });
  const refsBefore = git(tagged.project, ['for-each-ref']);
  const result = runPreflight(tagged);
  check(result.status === 12, `preflight whose target tagged the shared repository exited ${result.status}; expected 12\n${result.output}`);
  check(result.stdout.includes("the adopter's tree"), `the refusal does not name the adopter's tree:\n${result.output}`);
  check(fs.readdirSync(tagged.temp.directory).length === 0, 'the run whose target tagged the repository left a workspace behind');
  check(git(tagged.project, ['for-each-ref']) !== refsBefore, 'the stub never tagged the shared repository, so the case proves nothing');
  check(qualifiedProbes(runDirectoryOf(tagged.folder)).length === 0, 'a run whose target tagged the repository wrote a qualified probe');

  // info/exclude sits in the git directory the worktree shares, beside the refs and the configuration.
  const excluded = makeProject('exclude', {
    edit: ({ folder }) => editMutation(folder, (operator) => (operator.replace = 'mode: lenient\nsabotage: exclude')),
  });
  const excludeFile = path.join(excluded.project, '.git', 'info', 'exclude');
  const excludeBefore = fs.existsSync(excludeFile) ? fs.readFileSync(excludeFile, 'utf8') : '';
  const excludedResult = runPreflight(excluded);
  check(
    excludedResult.status === 12 && excludedResult.stdout.includes("the adopter's tree"),
    `preflight whose target wrote the shared info/exclude exited ${excludedResult.status}; expected 12 naming the adopter's tree\n${excludedResult.output}`,
  );
  check(
    (fs.existsSync(excludeFile) ? fs.readFileSync(excludeFile, 'utf8') : '') !== excludeBefore,
    'the stub never wrote the shared info/exclude, so the case proves nothing',
  );

  // A leg of a seeded evaluation that writes into the project stops the run
  // after the legs, and nothing the run wrote reads as a qualified pass.
  const legWrites = makeProject('leg-writes', {
    edit: ({ project }) => fs.writeFileSync(path.join(project, POLICY), 'mode: strict\nsabotage: leg-writes\n'),
  });
  const legTouched = path.join(legWrites.project, 'notes.txt');
  const legWritesResult = evaluate(['preflight', '--evaluation', legWrites.folder], { ...legWrites.temp.env, VERDICT_TOUCH: legTouched });
  check(
    legWritesResult.status === 12 && legWritesResult.stdout.includes('changed during the legs'),
    `preflight whose seeded run's leg wrote into the project exited ${legWritesResult.status}; expected 12 after the legs\n${legWritesResult.output}`,
  );
  const legRun = runDirectoryOf(legWrites.folder);
  check(
    legRun !== null && !fs.existsSync(path.join(legRun, 'probes.json')),
    'a run stopped after its legs kept the probe list it handed the CLI',
  );
  check(
    legRun !== null && !fs.existsSync(path.join(legRun, 'preflight-verdict.json')),
    'a run stopped after its legs holds a preflight verdict',
  );
  check(qualifiedProbes(legRun).length === 0, 'a run stopped after its legs wrote a qualified probe');

  const legs = makeProject('legs', {
    edit: ({ project, folder }) => {
      fs.writeFileSync(path.join(project, POLICY), 'mode: strict\nsabotage: adopter\n');
      fs.rmSync(path.join(folder, 'probes', 'P-002.probe.json'));
    },
  });
  const touched = path.join(legs.project, 'notes.txt');
  const legsResult = evaluate(['preflight', '--evaluation', legs.folder], { ...legs.temp.env, VERDICT_TOUCH: touched });
  check(
    legsResult.status === 12,
    `preflight whose legs wrote into the project exited ${legsResult.status}; expected 12\n${legsResult.output}`,
  );
  check(fs.existsSync(touched), 'the legs never wrote into the project, so the case proves nothing');
  const runDirectory = runDirectoryOf(legs.folder);
  check(
    runDirectory !== null && readJson(path.join(runDirectory, 'run.json')).adopterTree.unchanged === false,
    'run.json does not record the change the legs made',
  );
}

/**
 * A mutated arm that leaves an unreadable directory behind in its workspace:
 * the qualification workspace is still removed, and the run still qualifies.
 */
function checkLockedLeftovers() {
  const fixture = makeProject('locked', {
    edit: ({ folder }) => editMutation(folder, (operator) => (operator.replace = 'mode: lenient\nsabotage: locked')),
  });
  const before = adopterState(fixture.project);
  const result = runPreflight(fixture);
  check(result.status === 0, `preflight whose mutated arm locked a directory exited ${result.status}; expected 0\n${result.output}`);
  checkUntouched('the locked leftovers', fixture, before);
}

/**
 * A project inside a larger repository: a symbolic link elsewhere in the
 * repository that leads outside it does not stop the run, and a provisioned
 * directory that is itself a link is refused before its target is locked.
 */
function checkRepositoryShape() {
  const outer = tempDir('monorepo');
  const project = path.join(outer, 'packages', 'verdict');
  fs.mkdirSync(path.dirname(project), { recursive: true });
  fs.cpSync(FIXTURE, project, { recursive: true, filter: (from) => path.basename(from) !== 'runs' });
  fs.writeFileSync(path.join(outer, '.gitignore'), 'vendor/\n');
  fs.symlinkSync(path.join(os.tmpdir()), path.join(outer, 'outside-link'));
  git(outer, ['init', '--quiet', '--initial-branch', 'main']);
  git(outer, ['add', '--all']);
  git(outer, ['commit', '--quiet', '--message', 'a monorepo']);
  const temp = tempDir('monorepo-temp');
  const nested = evaluate(['preflight', '--evaluation', path.join(project, EVALUATION)], { TMPDIR: temp, TMP: temp, TEMP: temp });
  check(
    nested.status === 0 && nested.stdout.includes('eval-quality preflight exited 0'),
    `preflight over a project in a repository with a link out elsewhere exited ${nested.status}; expected 0\n${nested.output}`,
  );
  check(fs.readdirSync(temp).length === 0, 'the nested run left a workspace behind');

  // A temp directory inside the repository, outside launch.root, is refused
  // for a copy workspace too: a workspace there would read as a change to the
  // adopter's tree.
  const inside = path.join(outer, 'scratch');
  fs.mkdirSync(inside);
  editJson(path.join(project, EVALUATION, 'evaluation.json'), (value) => (value.workspace.kind = 'copy'));
  const insideResult = evaluate(['preflight', '--evaluation', path.join(project, EVALUATION)], {
    TMPDIR: inside,
    TMP: inside,
    TEMP: inside,
  });
  check(
    insideResult.status === 12 && insideResult.stdout.includes('point TMPDIR outside'),
    `preflight of a copy workspace with TMPDIR inside the repository exited ${insideResult.status}; expected 12 naming TMPDIR\n${insideResult.output}`,
  );
  check(fs.readdirSync(inside).length === 0, 'the refused run left a workspace inside the repository');

  // A submodule under launch.root, which a worktree checks out empty, is refused.
  const withSubmodule = makeProject('submodule');
  const head = git(withSubmodule.project, ['rev-parse', 'HEAD']).trim();
  git(withSubmodule.project, ['update-index', '--add', '--cacheinfo', `160000,${head},libs/shared`]);
  git(withSubmodule.project, ['commit', '--quiet', '--message', 'a submodule']);
  const submoduleResult = runPreflight(withSubmodule);
  check(
    submoduleResult.status === 12 && submoduleResult.stdout.includes('libs/shared'),
    `preflight over a project holding a submodule exited ${submoduleResult.status}; expected 12 naming it\n${submoduleResult.output}`,
  );
  check(fs.readdirSync(withSubmodule.temp.directory).length === 0, 'the refused submodule run left a workspace behind');

  // implementationDigest follows the implementation's bytes, and not a provisioned directory's.
  const digestOf = (label, edit) => {
    const fixture = makeProject(label, { edit });
    const outcome = runPreflight(fixture);
    const runDirectory = runDirectoryOf(fixture.folder);
    check(outcome.status === 0 && runDirectory !== null, `preflight over the ${label} project exited ${outcome.status}\n${outcome.output}`);
    return runDirectory === null ? null : evidenceOf(path.join(runDirectory, 'probes', 'P-002.probe.json')).implementationDigest;
  };
  const edited = digestOf('edited', ({ project: editedProject }) =>
    fs.appendFileSync(path.join(editedProject, 'bin', 'verdict.js'), '// edited\n'),
  );
  check(edited !== null && edited !== gitTargetImplementationDigest, 'the implementation digest did not move with bin/verdict.js');
  const vendored = digestOf('vendored', ({ project: vendoredProject }) =>
    fs.writeFileSync(path.join(vendoredProject, 'vendor', 'library.txt'), 'provisioned, another version\n'),
  );
  check(vendored === gitTargetImplementationDigest, `the implementation digest moved with vendor/, a provisioned directory: ${vendored}`);

  // Untracked (gitignored, as node_modules is) and tracked, so each of the
  // workspace's two refusals is reached.
  for (const [label, ignore] of [
    ['an untracked provisioned link', 'vendor\n'],
    ['a tracked provisioned link', ''],
  ]) {
    const linked = makeProject(`provision-link-${ignore === '' ? 'tracked' : 'untracked'}`, {
      edit: ({ project: linkedProject }) => {
        fs.rmSync(path.join(linkedProject, 'vendor'), { recursive: true });
        fs.symlinkSync('rules', path.join(linkedProject, 'vendor'));
        fs.writeFileSync(path.join(linkedProject, '.gitignore'), ignore);
      },
    });
    const refused = runPreflight(linked);
    check(
      refused.status === 12 && refused.stdout.includes('provisioned directory vendor is a symbolic link'),
      `preflight with ${label} exited ${refused.status}; expected 12 naming the link\n${refused.output}`,
    );
    const rulesMode = fs.statSync(path.join(linked.project, 'rules')).mode & 0o222;
    check(rulesMode !== 0, `${label} left the directory it leads to read-only`);
  }
}

async function main() {
  try {
    await checkCycle();
    await checkUnits();
    await checkGitTarget();
    checkUncommittedWork();
    checkCopyWorkspaces();
    checkFailures();
    checkAdopterTreeGuard();
    checkHookEnvironment();
    checkSharedRepository();
    checkLockedLeftovers();
    checkRepositoryShape();
    await checkInterrupted();
  } finally {
    for (const directory of scratch) removeScratch(directory);
  }
  if (failures.length > 0) {
    console.error(`${colors.red}${failures.length} of ${checks} tea-evaluate mutation check(s) failed:${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log(`${colors.green}ok${colors.reset} all ${checks} tea-evaluate mutation check(s) passed`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(`${colors.red}the tea-evaluate mutation test could not run:${colors.reset} ${error.stack ?? error}`);
    process.exitCode = 2;
  },
);
