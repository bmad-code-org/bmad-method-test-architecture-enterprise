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
 *   of the adopter's tree, with no qualified probe, in a run that opted out of
 *   file-system confinement; a confined run refuses the write itself (Story
 *   1.31), and `run.json` records the confinement.
 * - The cases whose target writes outside its workspace on purpose (the
 *   project, the shared git directory, a pid file, its workspace's parent) run
 *   with `"confinement": false`, since they prove the runtime's own checks,
 *   which an opted-out run relies on; a confined run refuses those writes.
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
const {
  WorkspaceRefusal,
  cacheOnlyPort,
  cachingPort,
  createWorkspace,
  journalDirectory,
  makePrivateParent,
  privateRootBase,
  privateRootIn,
  privateRootName,
  reclaimDeadPrivateParents,
  retirePrivateParentOwnership,
  removePrivateParentDirectory,
  removeScratchDirectory,
  removeWorkspace,
  requestKey,
  treeDigest,
} = require('../cli/lib/evaluate/workspace');
const { createArtifactValidator } = require('../cli/lib/evaluate/records');
const { holdPrivateParents, scratchDirectories } = require('./lib/scratch-directories');

const PROJECT_ROOT = path.join(__dirname, '..');
const EVALUATE = path.join(PROJECT_ROOT, 'cli', 'evaluate.js');
const SHIM = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'engine-shim.js');
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
const scratch = scratchDirectories('tea-evaluate-mutation');

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
 * With `unconfined`, the evaluation opts out of file-system confinement, for a
 * case whose target writes outside its workspace on purpose.
 *
 * @returns {{ project: string, folder: string, temp: {directory: string, env: object} }}
 */
function makeProject(label, { git: isGit = true, edit = () => {}, unconfined = false } = {}) {
  const project = path.join(tempDir(label), 'project');
  fs.cpSync(FIXTURE, project, { recursive: true, filter: (from) => path.basename(from) !== 'runs' });
  fs.writeFileSync(path.join(project, '.gitignore'), 'vendor/\n');
  const folder = path.join(project, EVALUATION);
  if (unconfined) editJson(path.join(folder, 'evaluation.json'), (evaluation) => (evaluation.confinement = false));
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
  const entries = fs
    .readdirSync(runs, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== '.workspace-journal');
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
function checkUntouched(label, fixture, before, isGit = true, { checkTemp = true } = {}) {
  const after = adopterState(fixture.project, isGit);
  check(after.status === before.status, `${label}: git status of the project changed:\n${before.status}---\n${after.status}`);
  check(after.files === before.files, `${label}: a file in the project changed`);
  check(after.worktrees === before.worktrees, `${label}: git worktree list changed:\n${after.worktrees}`);
  check(after.refs === before.refs, `${label}: the project's refs changed:\n${before.refs}---\n${after.refs}`);
  check(after.stash === before.stash, `${label}: the project's stash changed`);
  check(after.config === before.config, `${label}: the project's .git/config changed`);
  if (checkTemp) {
    const left = fs.readdirSync(fixture.temp.directory);
    check(left.length === 0, `${label}: the run left ${JSON.stringify(left)} in the temp directory`);
  }
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
      says: 'now resolves to',
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
  // Confined (Story 1.31): the write is refused where it is made, so the project never changes and the probe qualifies.
  const confined = makeProject('touch-confined', {
    edit: ({ folder }) => editMutation(folder, (operator) => (operator.replace = 'mode: lenient\nsabotage: adopter')),
  });
  const confinedTouched = path.join(confined.project, 'notes.txt');
  const confinedResult = evaluate(['preflight', '--evaluation', confined.folder], { ...confined.temp.env, VERDICT_TOUCH: confinedTouched });
  check(
    confinedResult.status === 0,
    `a confined preflight whose target wrote into the project exited ${confinedResult.status}; expected 0\n${confinedResult.output}`,
  );
  check(!fs.existsSync(confinedTouched), 'a confined target wrote into the project');
  const confinedRun = runDirectoryOf(confined.folder);
  const confinedRecord = confinedRun === null ? {} : evidenceOf(path.join(confinedRun, 'run.json'));
  check(
    confinedRecord.confinement === (process.platform === 'darwin' ? 'seatbelt' : 'bubblewrap') &&
      confinedRecord.adopterTree?.unchanged === true,
    `a confined preflight's run.json records confinement ${confinedRecord.confinement} and the adopter tree ${JSON.stringify(confinedRecord.adopterTree)}`,
  );

  const fixture = makeProject('touch', {
    unconfined: true,
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
  check(
    runDirectory !== null && evidenceOf(path.join(runDirectory, 'run.json')).confinement === 'opt-out',
    'run.json does not record the opted-out run as confinement "opt-out"',
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

  // A clean arm that swaps the target for a hard link to a file outside the
  // workspace: the mutation must not be written into that file.
  const linkRoot = path.join(root, 'hard-link');
  fs.mkdirSync(path.join(linkRoot, 'rules'), { recursive: true });
  fs.writeFileSync(path.join(linkRoot, POLICY), 'mode: strict\n');
  const outside = path.join(root, 'adopter-policy.txt');
  fs.writeFileSync(outside, 'mode: strict\n');
  let hardLinked = null;
  try {
    await runMutationCycle({
      root: linkRoot,
      mutation: {
        mutationId: 'M-003',
        targetArtifact: 'rules/policy.txt',
        operator: { kind: 'replace-exact', find: 'mode: strict', replace: 'mode: lenient', occurrences: 1 },
      },
      digestBytes: sha256,
      reExecutionCap: 0,
      runArm: async (phase) => {
        if (phase === 'baseline') {
          fs.rmSync(path.join(linkRoot, POLICY));
          fs.linkSync(outside, path.join(linkRoot, POLICY));
        }
        return { verdict: phase === 'mutated' ? 'violated' : 'held' };
      },
    });
  } catch (error) {
    if (!(error instanceof QualificationError)) throw error;
    hardLinked = error;
  }
  check(
    hardLinked?.exitCode === 12 && hardLinked.message.includes('hard link'),
    `a clean arm that hard-linked the target outside the workspace stopped with ${hardLinked?.exitCode ?? 'no error'}: ${hardLinked?.message}; expected 12 naming the hard link`,
  );
  check(fs.readFileSync(outside, 'utf8') === 'mode: strict\n', 'the mutation was written into the file the target was hard-linked to');

  // A process a target left running swaps the target's directory for a link
  // to a directory outside the workspace between the runtime's check and its
  // write (the wrapped rmSync makes the race deterministic): the write stays
  // in the directory the plan recorded, and the outside file keeps its bytes.
  const raceRoot = path.join(root, 'race');
  fs.mkdirSync(path.join(raceRoot, 'rules'), { recursive: true });
  fs.writeFileSync(path.join(raceRoot, POLICY), 'mode: strict\n');
  const outsideRules = path.join(root, 'outside-rules');
  fs.mkdirSync(outsideRules);
  fs.writeFileSync(path.join(outsideRules, 'policy.txt'), 'mode: strict\n# an uncommitted edit outside\n');
  const realRmSync = fs.rmSync;
  let raced = false;
  fs.rmSync = function racingRmSync(target, ...rest) {
    if (!raced && String(target).endsWith('policy.txt')) {
      raced = true;
      fs.renameSync(path.join(raceRoot, 'rules'), path.join(raceRoot, 'rules-aside'));
      fs.symlinkSync(outsideRules, path.join(raceRoot, 'rules'));
    }
    return realRmSync.call(fs, target, ...rest);
  };
  let raceStop = null;
  try {
    await runMutationCycle({
      root: raceRoot,
      mutation: {
        mutationId: 'M-004',
        targetArtifact: 'rules/policy.txt',
        operator: { kind: 'replace-exact', find: 'mode: strict', replace: 'mode: lenient', occurrences: 1 },
      },
      digestBytes: sha256,
      reExecutionCap: 0,
      runArm: async (phase) => ({ verdict: phase === 'mutated' ? 'violated' : 'held' }),
    });
  } catch (error) {
    if (!(error instanceof QualificationError)) throw error;
    raceStop = error;
  } finally {
    fs.rmSync = realRmSync;
  }
  check(raced, 'the racing rmSync never ran, so the case proves nothing');
  check(
    raceStop?.exitCode === 12,
    `a target directory swapped for a link mid-write stopped the cycle with ${raceStop?.exitCode ?? 'no error'}; expected 12`,
  );
  check(
    fs.existsSync(path.join(outsideRules, 'policy.txt')) &&
      fs.readFileSync(path.join(outsideRules, 'policy.txt'), 'utf8') === 'mode: strict\n# an uncommitted edit outside\n',
    'the runtime removed or rewrote the file outside the workspace the swapped link led to',
  );

  // A clean arm that removes the target's directory and makes a new one in
  // its place, the target file included: the plan holds the recorded
  // directory open, so the new one cannot take its inode number (Linux's
  // ext4 and overlayfs would hand it over), and the mutation is refused.
  const recreateRoot = path.join(root, 'recreate');
  fs.mkdirSync(path.join(recreateRoot, 'rules'), { recursive: true });
  fs.writeFileSync(path.join(recreateRoot, POLICY), 'mode: strict\n');
  let recreateStop = null;
  let recreatedBy = null;
  try {
    await runMutationCycle({
      root: recreateRoot,
      mutation: {
        mutationId: 'M-005',
        targetArtifact: 'rules/policy.txt',
        operator: { kind: 'replace-exact', find: 'mode: strict', replace: 'mode: lenient', occurrences: 1 },
      },
      digestBytes: sha256,
      reExecutionCap: 0,
      runArm: async (phase) => {
        if (phase === 'baseline') {
          fs.rmSync(path.join(recreateRoot, 'rules'), { recursive: true });
          fs.mkdirSync(path.join(recreateRoot, 'rules'));
          fs.writeFileSync(path.join(recreateRoot, POLICY), 'mode: strict\n');
          recreatedBy = fs.statSync(path.join(recreateRoot, 'rules')).ino;
        }
        return { verdict: phase === 'mutated' ? 'violated' : 'held' };
      },
    });
  } catch (error) {
    if (!(error instanceof QualificationError)) throw error;
    recreateStop = error;
  }
  check(recreatedBy !== null, 'the recreating clean arm never ran, so the case proves nothing');
  check(
    recreateStop?.exitCode === 12 && recreateStop.message.includes('is no longer the directory the plan recorded'),
    `a clean arm that replaced the target's directory stopped the cycle with ${recreateStop?.exitCode ?? 'no error'}: ${recreateStop?.message}; expected 12 naming the directory`,
  );
  check(
    fs.readFileSync(path.join(recreateRoot, POLICY), 'utf8') === 'mode: strict\n',
    'the mutation was written into a directory the clean arm made',
  );

  // A process a target left running moves the target's directory out of the
  // workspace and leaves a link in its place between the runtime's check and
  // its entering the directory (the wrapped chdir makes the race
  // deterministic): the directory keeps its inode, so only the path the
  // system reports for it tells the runtime it now lies elsewhere.
  const moveRoot = path.join(root, 'move');
  fs.mkdirSync(path.join(moveRoot, 'rules'), { recursive: true });
  fs.writeFileSync(path.join(moveRoot, POLICY), 'mode: strict\n');
  const movedAway = path.join(root, 'moved-away');
  const realChdir = process.chdir;
  let armed = false;
  let moved = false;
  process.chdir = function movingChdir(directory) {
    if (armed && !moved && String(directory).endsWith(`${path.sep}rules`)) {
      moved = true;
      fs.renameSync(path.join(moveRoot, 'rules'), movedAway);
      fs.symlinkSync(movedAway, path.join(moveRoot, 'rules'));
    }
    return realChdir.call(process, directory);
  };
  let moveStop = null;
  try {
    await runMutationCycle({
      root: moveRoot,
      mutation: {
        mutationId: 'M-006',
        targetArtifact: 'rules/policy.txt',
        operator: { kind: 'replace-exact', find: 'mode: strict', replace: 'mode: lenient', occurrences: 1 },
      },
      digestBytes: sha256,
      reExecutionCap: 0,
      runArm: async (phase) => {
        if (phase === 'baseline') armed = true;
        return { verdict: phase === 'mutated' ? 'violated' : 'held' };
      },
    });
  } catch (error) {
    if (!(error instanceof QualificationError)) throw error;
    moveStop = error;
  } finally {
    process.chdir = realChdir;
  }
  check(moved, 'the moving chdir never ran, so the case proves nothing');
  check(
    moveStop?.exitCode === 12 && moveStop.message.includes('now lies at'),
    `a target directory moved out behind a link stopped the cycle with ${moveStop?.exitCode ?? 'no error'}: ${moveStop?.message}; expected 12 naming where it lies`,
  );
  check(
    fs.readFileSync(path.join(movedAway, 'policy.txt'), 'utf8') === 'mode: strict\n',
    'the mutation was written into the target directory after it was moved out of the workspace',
  );

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
  const requests = [];
  const port = {
    probe: async (request) => {
      sent.push(request.probeId);
      requests.push(request);
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
  // A captured binding is sent (Story 1.18, test:evaluate-workflow). A type-violating matcher reaches JSON stdin with another type.
  const malformedContract = structuredClone(contract);
  malformedContract.permittedInterfaces[0].operations[0].requestShape.stdin.permittedKeys.push('action');
  malformedContract.permittedInterfaces[0].operations[0].requestShape.stdin.types.action = 'string';
  malformedContract.interactionPlan = [
    {
      ...step,
      inputBinding: { ...step.inputBinding, stdin: { action: { literal: 'judge' }, prompt: { matcher: 'type-violating' } } },
    },
  ];
  const malformedArm = await runArm({ contract: malformedContract, port, registry, label: 'malformed' });
  check(
    requests.at(-1)?.channels.stdin.kind === 'json' &&
      requests.at(-1).channels.stdin.value.prompt === 42 &&
      malformedArm.stepObservations[step.stepId].callInputs.stdin.prompt === 42,
    'the type-violating matcher did not send and record a JSON number against the declared string prompt',
  );
  for (const channel of ['argument', 'option', 'environment']) {
    const unbound = structuredClone(contract);
    unbound.permittedInterfaces[0].operations[0].requestShape[channel].permittedKeys.push('value');
    unbound.permittedInterfaces[0].operations[0].requestShape[channel].types.value = 'string';
    unbound.interactionPlan[0].inputBinding[channel] = { value: { matcher: 'type-violating' } };
    let refused = null;
    const before = requests.length;
    try {
      await runArm({ contract: unbound, port, registry, label: 'binding' });
    } catch (error) {
      refused = error;
    }
    check(
      refused instanceof ArmError && refused.message.includes(`type-violating ${channel}.value`) && requests.length === before,
      `a type-violating ${channel} reached the command port: ${refused}`,
    );
  }
  for (const binding of [{ unsupported: 'binding' }]) {
    const unbound = { ...contract, interactionPlan: [{ ...step, inputBinding: { ...step.inputBinding, stdin: { prompt: binding } } }] };
    let refused = null;
    try {
      await runArm({ contract: unbound, port, registry, label: 'binding' });
    } catch (error) {
      refused = error;
    }
    check(
      refused instanceof ArmError,
      `an arm binding stdin with ${JSON.stringify(binding)} ran; this release sends literal, matcher, principal and captured bindings only`,
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

function processIsLive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

/** A failed ps lookup cannot identify a reused PID, so it is uncertain until the kernel says the PID is gone. */
function commandProcessState(pid, command) {
  const listed = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
  if (listed.status === 0 && listed.stdout.trim()) return listed.stdout.includes(command) ? 'alive' : 'gone';
  try {
    process.kill(pid, 0);
    return 'uncertain';
  } catch (error) {
    return error.code === 'ESRCH' ? 'gone' : 'uncertain';
  }
}

function verdictProcessState(pid) {
  return commandProcessState(pid, 'verdict.js');
}

function stopMatchedVerdict(pid) {
  if (verdictProcessState(pid) !== 'alive') return;
  try {
    process.kill(pid, 'SIGKILL');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

/**
 * A run interrupted by `SIGTERM` while its mutated arm runs in a worktree ends
 * by that signal, and leaves no workspace, no worktree entry, no target
 * process, and an unchanged project.
 */
async function checkInterrupted() {
  const fixture = makeProject('interrupt', {
    unconfined: true,
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
  holdPrivateParents(child.pid);
  let target = null;
  for (let waited = 0; waited < 20_000 && target === null; waited += 50) {
    if (fs.existsSync(pidFile) && Number(fs.readFileSync(pidFile, 'utf8')) > 0) target = Number(fs.readFileSync(pidFile, 'utf8'));
    else await delay(50);
  }
  check(target !== null, 'the interrupted run never reached its mutated arm');
  child.kill('SIGTERM');
  let timeout;
  const deadline = new Promise((resolve) => {
    timeout = setTimeout(() => resolve(null), SPAWN_TIMEOUT_MS);
  });
  let ended;
  try {
    ended = await Promise.race([closed, deadline]);
  } finally {
    clearTimeout(timeout);
  }
  if (ended === null) {
    child.kill('SIGKILL');
    check(false, `the interrupted run was still running ${SPAWN_TIMEOUT_MS} ms after SIGTERM`);
    return;
  }
  check(ended.signal === 'SIGTERM', `the interrupted run ended by ${ended.signal ?? `exit ${ended.code}`}; expected SIGTERM`);
  if (target !== null) {
    let state = verdictProcessState(target);
    for (let waited = 0; waited < 5000 && state !== 'gone'; waited += 50) {
      await delay(50);
      state = verdictProcessState(target);
    }
    check(state === 'gone', `the target the interrupted arm started (pid ${target}) outlived the run or could not be identified`);
    if (state === 'alive') stopMatchedVerdict(target);
  }
  checkUntouched('the interrupted run', fixture, before);
  const journal = path.join(fixture.folder, 'runs', '.workspace-journal');
  check(
    fs.readdirSync(journal).every((name) => !name.startsWith('aux-')),
    'the SIGTERM cleanup left a private-parent ownership record after removing its parent',
  );
}

/** A SIGKILL leaves a journaled workspace which the next preflight reclaims. */
async function checkKilledRun(
  label,
  {
    isGit = true,
    liveOwner = false,
    unmarked = false,
    partialMarker = false,
    partialTeardown = false,
    uncertain = false,
    partialGit = false,
    missingDirectory = false,
    metadataUnavailable = false,
  } = {},
) {
  const fixture = makeProject(label, {
    git: isGit,
    unconfined: true,
    edit: ({ folder }) => editMutation(folder, (operator) => (operator.replace = 'mode: lenient\nsleep: 30000')),
  });
  const originalState = adopterState(fixture.project, isGit);
  const journal = path.join(fixture.folder, 'runs', '.workspace-journal');
  const pidFile = path.join(tempDir(`${label}-pid`), 'pid');
  const started = [];
  const launch = (pid) => {
    const child = spawn(process.execPath, [EVALUATE, 'preflight', '--evaluation', fixture.folder], {
      cwd: PROJECT_ROOT,
      env: { ...BASE_ENV, ...fixture.temp.env, VERDICT_PID: pid },
      stdio: 'ignore',
    });
    const closed = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
    holdPrivateParents(child.pid);
    started.push({ child, closed });
    return { child, closed };
  };
  const entries = () =>
    fs.existsSync(journal)
      ? fs
          .readdirSync(journal)
          .filter((name) => name.endsWith('.json'))
          .map((name) => readJson(path.join(journal, name)))
      : [];
  const until = async (test, milliseconds = 20_000) => {
    for (let elapsed = 0; elapsed < milliseconds; elapsed += 50) {
      const found = test();
      if (found) return found;
      await delay(50);
    }
    return null;
  };
  const unlock = (directory) => {
    fs.chmodSync(directory, 0o700);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) unlock(path.join(directory, entry.name));
    }
  };
  let abandoned = null;
  let target = null;
  let metadata = null;
  try {
    const first = launch(pidFile);
    abandoned = await until(() =>
      fs.existsSync(pidFile)
        ? entries().find((entry) => fs.existsSync(entry.directory) && entry.kind === (isGit ? 'git-worktree' : 'copy'))
        : null,
    );
    check(abandoned !== null, `${label}: the killed run never reached a workspace with a running target`);
    if (abandoned === null) return;
    check(fs.existsSync(path.join(abandoned.directory, '.tea-evaluate-owner.json')), `${label}: the workspace has no owner marker`);
    check(fs.existsSync(`${abandoned.directory}.tea-evaluate-owner.json`), `${label}: the workspace has no surviving cleanup marker`);
    if (isGit)
      check(
        git(fixture.project, ['worktree', 'list', '--porcelain']).includes(abandoned.top),
        `${label}: the live worktree has no registration`,
      );

    if (liveOwner) {
      const second = launch(path.join(tempDir(`${label}-second-pid`), 'pid'));
      const secondEntry = await until(() => entries().find((entry) => entry.ownerPid === second.child.pid));
      check(secondEntry !== null, `${label}: the second preflight never made its workspace`);
      check(fs.existsSync(abandoned.directory), `${label}: the next preflight reclaimed a live owner's workspace`);
      check(
        git(fixture.project, ['worktree', 'list', '--porcelain']).includes(abandoned.top),
        `${label}: the next preflight removed a live registration`,
      );
      second.child.kill('SIGKILL');
      await Promise.race([second.closed, delay(5000)]);
    }
    first.child.kill('SIGKILL');
    const ended = await Promise.race([first.closed, delay(5000).then(() => null)]);
    check(ended?.signal === 'SIGKILL', `${label}: the killed preflight did not close within 5 s`);
    target = Number(fs.readFileSync(pidFile, 'utf8'));
    const targetEnded = await until(() => verdictProcessState(target) === 'gone', 5000);
    check(targetEnded !== null, `${label}: the killed preflight left its target running`);
    if (targetEnded === null) {
      stopMatchedVerdict(target);
      await delay(100);
    }
    check(fs.existsSync(abandoned.directory), `${label}: SIGKILL did not leave a workspace to recover`);
    if (isGit)
      check(
        git(fixture.project, ['worktree', 'list', '--porcelain']).includes(abandoned.top),
        `${label}: SIGKILL did not leave a worktree registration`,
      );
    const stateAfterKill = adopterState(fixture.project, isGit);
    check(stateAfterKill.status === originalState.status, `${label}: the killed run changed the adopter's git status`);
    check(stateAfterKill.files === originalState.files, `${label}: the killed run changed an adopter file`);
    check(stateAfterKill.refs === originalState.refs, `${label}: the killed run changed the adopter's refs`);
    check(stateAfterKill.stash === originalState.stash, `${label}: the killed run changed the adopter's stash`);
    check(stateAfterKill.config === originalState.config, `${label}: the killed run changed the adopter's Git configuration`);
    if (isGit && (partialGit || missingDirectory)) {
      const pointer = fs
        .readFileSync(path.join(abandoned.top, '.git'), 'utf8')
        .trim()
        .replace(/^gitdir:\s*/, '');
      metadata = path.resolve(abandoned.top, pointer);
      check(fs.existsSync(metadata), `${label}: the worktree has no Git metadata`);
    }
    if (partialGit) {
      // Model a kill after Git registered the worktree but before checkout wrote its .git pointer.
      fs.rmSync(path.join(abandoned.top, '.git'));
      check(
        git(fixture.project, ['worktree', 'list', '--porcelain']).includes(abandoned.top),
        `${label}: the partial checkout lost its registration`,
      );
    } else if (missingDirectory) {
      // Model a dead worktree whose directory disappeared while Git still records it.
      unlock(abandoned.directory);
      fs.rmSync(abandoned.directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      check(fs.existsSync(metadata), `${label}: the missing workspace lost its Git metadata`);
      check(
        git(fixture.project, ['worktree', 'list', '--porcelain']).includes(abandoned.top),
        `${label}: the missing workspace lost its registration`,
      );
    } else {
      if (!isGit) {
        const other = makeProject(`${label}-unrelated`, { git: false });
        const otherResult = runPreflight(other);
        check(otherResult.status === 0, `${label}: the unrelated project did not complete its preflight`);
        check(fs.existsSync(abandoned.directory), `${label}: another non-Git project reclaimed this project's copy`);
      }
      if (unmarked) {
        // Model a kill after exclusive mkdir and before the marker write.
        unlock(abandoned.directory);
        fs.rmSync(abandoned.directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        fs.mkdirSync(abandoned.directory, { mode: 0o700 });
      } else if (partialMarker) {
        // Model a kill during the marker write, before the target copy begins.
        const marker = path.join(abandoned.directory, '.tea-evaluate-owner.json');
        const prefix = fs.readFileSync(marker, 'utf8').slice(0, 24);
        unlock(abandoned.directory);
        fs.rmSync(abandoned.directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        fs.mkdirSync(abandoned.directory, { mode: 0o700 });
        fs.writeFileSync(marker, prefix, { mode: 0o600 });
      } else if (partialTeardown) {
        // Model a kill after recursive cleanup unlinked the inner marker but before it removed the target files.
        fs.rmSync(path.join(abandoned.directory, '.tea-evaluate-owner.json'));
      }
    }

    editMutation(fixture.folder, (operator) => (operator.replace = 'mode: lenient'));
    const digested = evaluate(['digest', '--evaluation', fixture.folder]);
    check(digested.status === 0, `${label}: could not re-digest the fixture after removing its sleep`);
    if (uncertain) {
      const marker = path.join(abandoned.directory, '.tea-evaluate-owner.json');
      const originalMarker = fs.readFileSync(marker, 'utf8');
      const journalFile = fs
        .readdirSync(journal)
        .filter((name) => name.endsWith('.json'))
        .map((name) => path.join(journal, name))
        .find((file) => readJson(file).directory === abandoned.directory);
      check(journalFile !== undefined, `${label}: the abandoned copy has no journal entry`);
      if (journalFile === undefined) return;
      const originalJournal = fs.readFileSync(journalFile, 'utf8');
      const live = { ...JSON.parse(originalJournal), ownerPid: process.pid };
      fs.writeFileSync(journalFile, `${JSON.stringify(live)}\n`);
      fs.writeFileSync(marker, `${JSON.stringify(live)}\n`);
      const liveRun = evaluate(['preflight', '--evaluation', fixture.folder], fixture.temp.env);
      check(liveRun.status === 0, `${label}: preflight with a live marker exited ${liveRun.status}`);
      const preserved = fs.existsSync(abandoned.directory);
      check(preserved, `${label}: preflight reclaimed a workspace whose marker named a live process`);
      fs.writeFileSync(journalFile, originalJournal);
      if (!preserved) return;
      fs.writeFileSync(marker, originalMarker);
      fs.writeFileSync(marker, `${JSON.stringify({ ...JSON.parse(originalMarker), ownerPid: process.pid })}\n`);
      const refused = evaluate(['preflight', '--evaluation', fixture.folder], fixture.temp.env);
      check(refused.status === 0, `${label}: preflight with an unverifiable owner exited ${refused.status}`);
      check(fs.existsSync(abandoned.directory), `${label}: preflight reclaimed a workspace whose marker disagreed with its journal`);
      fs.writeFileSync(marker, originalMarker);
    }
    const before = { ...adopterState(fixture.project, isGit), worktrees: originalState.worktrees };
    const otherTemp = tempDir(`${label}-later-temp`);
    if (metadataUnavailable) {
      // Git metadata can be unreadable during one recovery attempt. Retain its journal until verification can resume.
      const worktrees = path.join(fixture.project, '.git', 'worktrees');
      const parked = path.join(fixture.project, '.git', 'worktrees-parked');
      fs.renameSync(worktrees, parked);
      fs.writeFileSync(worktrees, 'temporarily unavailable\n');
      try {
        evaluate(['preflight', '--evaluation', fixture.folder], { TMPDIR: otherTemp, TMP: otherTemp, TEMP: otherTemp });
        check(
          entries().some((entry) => entry.directory === abandoned.directory),
          `${label}: unreadable metadata retired the journal`,
        );
      } finally {
        fs.rmSync(worktrees);
        fs.renameSync(parked, worktrees);
      }
      check(fs.existsSync(metadata), `${label}: Git metadata disappeared during the blocked recovery`);
    }
    const recovered = evaluate(['preflight', '--evaluation', fixture.folder], { TMPDIR: otherTemp, TMP: otherTemp, TEMP: otherTemp });
    check(recovered.status === 0, `${label}: recovery preflight exited ${recovered.status}\n${recovered.output}`);
    const reportedPath = missingDirectory ? metadata : abandoned.directory;
    check(recovered.output.includes(reportedPath), `${label}: recovery output omitted ${reportedPath}`);
    check(!fs.existsSync(abandoned.directory), `${label}: recovery left the killed workspace`);
    check(!entries().some((entry) => entry.directory === abandoned.directory), `${label}: recovery left the workspace journal entry`);
    check(entries().length === 0, `${label}: recovery left owned workspace journal entries`);
    if (missingDirectory) check(!fs.existsSync(metadata), `${label}: recovery left the Git metadata`);
    if (isGit)
      check(
        !git(fixture.project, ['worktree', 'list', '--porcelain']).includes(abandoned.top),
        `${label}: recovery left the Git registration`,
      );
    checkUntouched(`${label} recovery`, fixture, before, isGit, { checkTemp: false });
  } finally {
    for (const { child, closed } of started) {
      child.kill('SIGKILL');
      await Promise.race([closed, delay(5000)]);
    }
    if (target === null && fs.existsSync(pidFile)) target = Number(fs.readFileSync(pidFile, 'utf8'));
    if (target !== null) stopMatchedVerdict(target);
  }
}

/** A real CLI killed while the engine owns staging leaves its parent for the next preflight. */
async function checkKilledEngineStage() {
  if (process.platform === 'win32') return;
  const fixture = makeProject('killed-engine-stage', { git: false });
  const before = adopterState(fixture.project, false);
  const ready = path.join(tempDir('engine-stage-ready'), 'pid');
  const logFile = path.join(tempDir('engine-stage-log'), 'calls.jsonl');
  const privateRoot = path.join('/tmp', `tea-evaluate-p${process.getuid()}`);
  const child = spawn(process.execPath, [EVALUATE, 'preflight', '--evaluation', fixture.folder], {
    cwd: PROJECT_ROOT,
    env: {
      ...BASE_ENV,
      ...fixture.temp.env,
      [ENGINE_CLI_ENV]: SHIM,
      TEA_EVALUATE_SHIM_LOG: logFile,
      TEA_EVALUATE_SHIM_HOLD_STAGE: 'compile',
      TEA_EVALUATE_SHIM_READY: ready,
    },
    stdio: 'ignore',
  });
  const closed = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
  // The parent this CLI makes is held before it exists, so the reaper of a suite running at the same time leaves it once the CLI is killed.
  holdPrivateParents(child.pid);
  let parent;
  let otherChild;
  let otherClosed;
  let otherParent;
  let otherReady;
  try {
    for (let waited = 0; waited < 20_000 && !fs.existsSync(ready); waited += 50) await delay(50);
    check(fs.existsSync(ready), 'the real preflight never reached the held engine compile');
    if (!fs.existsSync(ready)) return;
    parent = path.join(privateRoot, fs.readdirSync(privateRoot).find((name) => name.startsWith(`run-${child.pid}-`)) ?? 'missing');
    check(fs.existsSync(parent), 'the held engine compile has no private parent');
    const stage = fs.existsSync(parent) ? fs.readdirSync(parent).find((name) => name.startsWith('tea-evaluate-engine-')) : null;
    check(stage !== null && stage !== undefined, 'the held engine compile has no staging directory');
    if (stage === null || stage === undefined) return;
    const livePreflight = evaluate(['preflight', '--evaluation', fixture.folder], fixture.temp.env);
    check(livePreflight.status === 0, `a second preflight beside a live owner exited ${livePreflight.status}\n${livePreflight.output}`);
    check(fs.existsSync(parent), 'a second preflight reclaimed a live owner’s private parent');
    const other = makeProject('killed-engine-unrelated', { git: false });
    const unrelated = runPreflight(other);
    check(unrelated.status === 0, `an unrelated evaluation preflight exited ${unrelated.status}\n${unrelated.output}`);
    check(fs.existsSync(parent), 'another evaluation reclaimed the live parent');
    otherReady = path.join(tempDir('unrelated-engine-stage-ready'), 'pid');
    otherChild = spawn(process.execPath, [EVALUATE, 'preflight', '--evaluation', other.folder], {
      cwd: PROJECT_ROOT,
      env: {
        ...BASE_ENV,
        ...other.temp.env,
        [ENGINE_CLI_ENV]: SHIM,
        TEA_EVALUATE_SHIM_LOG: path.join(tempDir('unrelated-engine-stage-log'), 'calls.jsonl'),
        TEA_EVALUATE_SHIM_HOLD_STAGE: 'compile',
        TEA_EVALUATE_SHIM_READY: otherReady,
      },
      stdio: 'ignore',
    });
    otherClosed = new Promise((resolve) => otherChild.once('close', (code, signal) => resolve({ code, signal })));
    holdPrivateParents(otherChild.pid);
    for (let waited = 0; waited < 20_000 && !fs.existsSync(otherReady); waited += 50) await delay(50);
    check(fs.existsSync(otherReady), 'the unrelated real preflight never reached its held engine compile');
    if (!fs.existsSync(otherReady)) return;
    otherParent = path.join(
      privateRoot,
      fs.readdirSync(privateRoot).find((name) => name.startsWith(`run-${otherChild.pid}-`)) ?? 'missing',
    );
    const otherStage = fs.existsSync(otherParent)
      ? fs.readdirSync(otherParent).find((name) => name.startsWith('tea-evaluate-engine-'))
      : null;
    check(otherStage !== undefined && otherStage !== null, 'the unrelated held engine compile has no staging directory');
    const otherStagePath = path.join(otherParent, otherStage ?? 'missing');
    check(fs.existsSync(otherParent) && fs.existsSync(otherStagePath), 'the unrelated live run has no private parent and engine stage');
    child.kill('SIGKILL');
    check((await Promise.race([closed, delay(5000).then(() => null)]))?.signal === 'SIGKILL', 'the held preflight did not die by SIGKILL');
    check(
      fs.existsSync(parent) && stage !== undefined && fs.existsSync(path.join(parent, stage)),
      'SIGKILL did not leave the engine stage',
    );
    const unrelatedAfterKill = runPreflight(other);
    check(
      unrelatedAfterKill.status === 0,
      `another evaluation after the kill exited ${unrelatedAfterKill.status}\n${unrelatedAfterKill.output}`,
    );
    check(fs.existsSync(parent), 'another evaluation reclaimed the dead parent it does not own');
    const laterTemp = tempDir('killed-engine-later-temp');
    const marker = path.join(parent, '.tea-evaluate-private-owner.json');
    const originalMarker = fs.readFileSync(marker, 'utf8');
    fs.writeFileSync(marker, `${JSON.stringify({ ...JSON.parse(originalMarker), runId: 'unverifiable' })}\n`);
    const uncertain = evaluate(['preflight', '--evaluation', fixture.folder], { TMPDIR: laterTemp, TMP: laterTemp, TEMP: laterTemp });
    check(uncertain.status === 0, `preflight with an unverifiable parent exited ${uncertain.status}\n${uncertain.output}`);
    check(fs.existsSync(parent), 'preflight removed a parent whose marker disagreed with its journal');
    fs.writeFileSync(marker, originalMarker);
    const parked = path.join(privateRoot, `.parked-${crypto.randomUUID()}`);
    fs.renameSync(parent, parked);
    fs.symlinkSync(parked, parent);
    try {
      const linked = evaluate(['preflight', '--evaluation', fixture.folder], { TMPDIR: laterTemp, TMP: laterTemp, TEMP: laterTemp });
      check(linked.status === 0, `preflight with a linked parent exited ${linked.status}\n${linked.output}`);
      check(fs.lstatSync(parent).isSymbolicLink() && fs.existsSync(parked), 'recovery followed a link planted at the private parent');
    } finally {
      fs.rmSync(parent);
      fs.renameSync(parked, parent);
    }
    await delay(100);
    check(
      otherChild.exitCode === null && otherChild.signalCode === null && processIsLive(otherChild.pid),
      'the unrelated engine owner ended before same-evaluation recovery',
    );
    const recovered = evaluate(['preflight', '--evaluation', fixture.folder], { TMPDIR: laterTemp, TMP: laterTemp, TEMP: laterTemp });
    const otherLiveAfterRecovery = processIsLive(otherChild.pid);
    await delay(100);
    check(recovered.status === 0, `recovery after a killed engine compile exited ${recovered.status}\n${recovered.output}`);
    check(recovered.output.includes(parent), `recovery did not report the killed parent ${parent}`);
    check(recovered.output.includes(path.join(parent, stage)), `recovery did not report the killed engine stage ${stage}`);
    check(!fs.existsSync(parent), `recovery left the killed engine stage parent ${parent}`);
    check(
      otherLiveAfterRecovery && otherChild.exitCode === null && otherChild.signalCode === null && processIsLive(otherChild.pid),
      'the unrelated engine owner ended during same-evaluation recovery',
    );
    check(
      fs.existsSync(otherParent) && fs.existsSync(otherStagePath),
      'same-evaluation recovery removed the unrelated live engine stage or parent',
    );
    const auxiliaryRecords = fs
      .readdirSync(path.join(fixture.folder, 'runs', '.workspace-journal'))
      .filter((name) => name.startsWith('aux-'));
    check(auxiliaryRecords.length === 0, `normal exit or recovery left auxiliary ownership records: ${auxiliaryRecords}`);
    checkUntouched('killed engine recovery', fixture, before, false, { checkTemp: false });
  } finally {
    if (otherChild) {
      otherChild.kill('SIGKILL');
      await Promise.race([otherClosed, delay(5000)]);
      if (otherReady && fs.existsSync(otherReady)) {
        try {
          process.kill(Number(fs.readFileSync(otherReady, 'utf8')), 'SIGKILL');
        } catch {
          /* The shim ended. */
        }
      }
      if (otherParent && fs.existsSync(otherParent)) removeScratchDirectory(otherParent);
    }
    child.kill('SIGKILL');
    await Promise.race([closed, delay(5000)]);
    if (fs.existsSync(ready)) {
      try {
        process.kill(Number(fs.readFileSync(ready, 'utf8')), 'SIGKILL');
      } catch {
        /* The shim ended. */
      }
    }
    if (parent && fs.existsSync(parent)) removeScratchDirectory(parent);
  }
}

/** Recovery checks a recorded Windows root and handles a marker interrupted during its exclusive write. */
function checkAuxiliaryJournalEdges() {
  const fixture = makeProject('auxiliary-journal-edges', { git: false });
  const runs = path.join(fixture.folder, 'runs');
  fs.mkdirSync(runs, { recursive: true });
  const journal = journalDirectory(runs);
  const dead = spawnSync(process.execPath, ['-e', '']).pid;
  // The parents planted under the dead pid are held before they exist, so the reaper of a suite running at the same time leaves them.
  holdPrivateParents(dead);
  const oldBase = tempDir('auxiliary-old-base');
  const oldRoot = privateRootIn(oldBase);
  const currentRoot = privateRootIn(privateRootBase());
  const made = [];
  const records = [];
  const log = [];
  const linked = [];
  const linkedParent = makePrivateParent(linked, { folder: fixture.folder, root: fixture.project, journal, runId: 'linked-cleanup' });
  const parkedParent = `${linkedParent}-parked`;
  const victim = tempDir('private-parent-swap-victim');
  const survivor = path.join(victim, 'survivor');
  fs.writeFileSync(survivor, 'keep');
  fs.renameSync(linkedParent, parkedParent);
  fs.symlinkSync(victim, linkedParent, 'dir');
  let refusedLinkedParent = false;
  try {
    removePrivateParentDirectory(linkedParent, linked.privateParentIdentity);
  } catch (error) {
    refusedLinkedParent = error instanceof WorkspaceRefusal;
  } finally {
    fs.rmSync(linkedParent, { force: true });
    fs.renameSync(parkedParent, linkedParent);
  }
  check(refusedLinkedParent && fs.existsSync(survivor), 'private-parent cleanup followed a replaced link into another tree');
  removePrivateParentDirectory(linkedParent, linked.privateParentIdentity);
  retirePrivateParentOwnership(linked);
  const unregistered = [];
  const unregisteredParent = makePrivateParent(unregistered, {
    folder: fixture.folder,
    root: fixture.project,
    journal,
    runId: 'unregistered-child',
  });
  const unregisteredChild = path.join(unregisteredParent, 'tea-evaluate-unregistered');
  const unregisteredRecord = path.join(journal.root, unregistered.privateOwnership.name);
  fs.mkdirSync(unregisteredChild);
  const originalRemoveUnregistered = fs.rmSync;
  let refusedUnregistered = false;
  try {
    fs.rmSync = (candidate, options) => {
      if (candidate === unregisteredChild) throw new Error('injected unregistered-child removal failure');
      return originalRemoveUnregistered(candidate, options);
    };
    try {
      removePrivateParentDirectory(unregisteredParent, unregistered.privateParentIdentity);
    } catch (error) {
      refusedUnregistered = error.message === 'injected unregistered-child removal failure';
    }
  } finally {
    fs.rmSync = originalRemoveUnregistered;
  }
  try {
    check(refusedUnregistered, 'private-parent cleanup skipped the unregistered direct child');
    check(
      fs.existsSync(unregisteredChild) &&
        fs.existsSync(path.join(unregisteredParent, '.tea-evaluate-private-owner.json')) &&
        fs.existsSync(unregisteredRecord),
      'failed unregistered-child cleanup lost the parent marker or journal',
    );
    removePrivateParentDirectory(unregisteredParent, unregistered.privateParentIdentity);
    retirePrivateParentOwnership(unregistered);
    check(!fs.existsSync(unregisteredParent) && !fs.existsSync(unregisteredRecord), 'private-parent cleanup retry left scratch or journal');
  } finally {
    if (fs.existsSync(unregisteredParent)) removeScratchDirectory(unregisteredParent);
    retirePrivateParentOwnership(unregistered);
  }
  for (const failure of ['write', 'fsync', 'marker']) {
    const originalWrite = fs.writeFileSync;
    const originalFsync = fs.fsyncSync;
    const list = [];
    let writes = 0;
    let refused = false;
    try {
      fs.writeFileSync = (file, contents, options) => {
        if (typeof file === 'number' && (failure === 'write' || failure === 'marker')) {
          writes += 1;
          if ((failure === 'write' && writes === 1) || (failure === 'marker' && writes === 2)) {
            fs.writeSync(file, Buffer.from(contents).subarray(0, 12));
            throw new Error(`injected ${failure} failure`);
          }
        }
        return originalWrite(file, contents, options);
      };
      if (failure === 'fsync')
        fs.fsyncSync = () => {
          throw new Error('injected fsync failure');
        };
      makePrivateParent(list, { folder: fixture.folder, root: fixture.project, journal, runId: `failed-${failure}` });
    } catch (error) {
      refused = error.message === `injected ${failure} failure`;
    } finally {
      fs.writeFileSync = originalWrite;
      fs.fsyncSync = originalFsync;
      if (list.privateParent) removeScratchDirectory(list.privateParent);
      retirePrivateParentOwnership(list);
    }
    check(refused, `private-parent ${failure} failure did not stop creation`);
    check(
      fs.readdirSync(journal.root).every((name) => !name.startsWith('aux-')),
      `private-parent ${failure} failure left a partial auxiliary journal record`,
    );
  }
  const record = (
    privateRoot,
    { markerBytes = null, extra = false, actualRoot = privateRoot, parentAbsent = false, markerAbsent = false } = {},
  ) => {
    const nonce = crypto.randomUUID();
    const parent = path.join(privateRoot, `run-${dead}-${nonce}`);
    const entry = {
      version: 1,
      kind: 'private-parent',
      folder: fs.realpathSync.native(fixture.folder),
      root: fs.realpathSync.native(fixture.project),
      runId: `auxiliary-${nonce.replaceAll('-', '')}`,
      ownerPid: dead,
      privateRoot,
      directory: parent,
    };
    const name = `aux-${nonce}.json`;
    const physicalParent = path.join(actualRoot, path.basename(parent));
    if (!parentAbsent) fs.mkdirSync(physicalParent, { mode: 0o700 });
    const expected = Buffer.from(`${JSON.stringify(entry)}\n`);
    if (!parentAbsent && !markerAbsent)
      fs.writeFileSync(
        path.join(physicalParent, '.tea-evaluate-private-owner.json'),
        markerBytes === null ? expected : markerBytes(expected),
        {
          mode: 0o600,
        },
      );
    if (!parentAbsent && extra) fs.writeFileSync(path.join(physicalParent, 'unverified'), 'keep');
    fs.writeFileSync(path.join(journal.root, name), expected, { mode: 0o600 });
    made.push(physicalParent);
    records.push(path.join(journal.root, name));
    return parent;
  };
  try {
    check(
      oldRoot !== null && currentRoot !== null && path.basename(oldRoot) === privateRootName(),
      'private roots could not be made for the auxiliary recovery case',
    );
    if (oldRoot === null || currentRoot === null) return;
    const oldParent = record(oldRoot);
    const oldStage = path.join(oldParent, 'tea-evaluate-engine-old');
    fs.mkdirSync(oldStage);
    if (process.platform !== 'win32') {
      reclaimDeadPrivateParents({ folder: fixture.folder, root: fixture.project, journal, log: (line) => log.push(line) });
      check(fs.existsSync(oldParent), 'POSIX recovery accepted a root outside its fixed private root');
    }
    reclaimDeadPrivateParents({ folder: fixture.folder, root: fixture.project, journal, platform: 'win32', log: (line) => log.push(line) });
    check(
      !fs.existsSync(oldParent) && log.some((line) => line.includes(oldStage)),
      'recovery skipped a verified parent under an earlier Windows temp root',
    );

    record(currentRoot, { parentAbsent: true });
    const journalOnly = records.at(-1);
    reclaimDeadPrivateParents({ folder: fixture.folder, root: fixture.project, journal, log: (line) => log.push(line) });
    check(!fs.existsSync(journalOnly), 'recovery retained a journal entry whose parent was never created');
    const unmarked = record(currentRoot, { markerAbsent: true });
    reclaimDeadPrivateParents({ folder: fixture.folder, root: fixture.project, journal, log: (line) => log.push(line) });
    check(!fs.existsSync(unmarked), 'recovery retained an empty parent created before its marker');

    for (const [label, bytes] of [
      ['empty', () => Buffer.alloc(0)],
      ['prefix', (expected) => expected.subarray(0, 24)],
    ]) {
      const parent = record(currentRoot, { markerBytes: bytes });
      reclaimDeadPrivateParents({ folder: fixture.folder, root: fixture.project, journal, log: (line) => log.push(line) });
      check(!fs.existsSync(parent), `recovery retained a ${label} interrupted private-parent marker`);
    }
    const interruptedParent = record(currentRoot);
    const interruptedJournal = records.at(-1);
    const firstChild = path.join(interruptedParent, 'tea-evaluate-engine-first');
    const secondChild = path.join(interruptedParent, 'tea-evaluate-engine-second');
    fs.mkdirSync(firstChild);
    fs.mkdirSync(secondChild);
    const originalRemove = fs.rmSync;
    let interrupted = false;
    try {
      fs.rmSync = (candidate, options) => {
        if (candidate === path.join(path.basename(interruptedParent), path.basename(secondChild))) {
          interrupted = true;
          throw new Error('injected child-removal failure');
        }
        return originalRemove(candidate, options);
      };
      reclaimDeadPrivateParents({ folder: fixture.folder, root: fixture.project, journal, log: (line) => log.push(line) });
    } finally {
      fs.rmSync = originalRemove;
    }
    check(interrupted, 'recovery did not attempt to remove the second auxiliary child');
    check(!fs.existsSync(firstChild) && fs.existsSync(secondChild), 'interrupted recovery did not stop between auxiliary children');
    check(
      fs.existsSync(path.join(interruptedParent, '.tea-evaluate-private-owner.json')) && fs.existsSync(interruptedJournal),
      'interrupted recovery lost its parent marker or journal record',
    );
    reclaimDeadPrivateParents({ folder: fixture.folder, root: fixture.project, journal, log: (line) => log.push(line) });
    check(!fs.existsSync(interruptedParent) && !fs.existsSync(interruptedJournal), 'retry did not reclaim the interrupted parent');
    check(
      log.some((line) => line.includes(secondChild)),
      'retry did not report the remaining auxiliary child',
    );
    const occupied = record(currentRoot, { markerBytes: (expected) => expected.subarray(0, 24), extra: true });
    reclaimDeadPrivateParents({ folder: fixture.folder, root: fixture.project, journal, log: (line) => log.push(line) });
    check(fs.existsSync(occupied), 'recovery removed a partial-marker parent containing another entry');
    const linkedBase = tempDir('auxiliary-linked-base');
    const linkedRoot = path.join(linkedBase, privateRootName());
    let linkedRootAvailable = true;
    try {
      fs.symlinkSync(oldRoot, linkedRoot, 'dir');
    } catch (error) {
      if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error;
      linkedRootAvailable = false;
    }
    if (linkedRootAvailable) {
      const linked = record(linkedRoot, { actualRoot: oldRoot });
      reclaimDeadPrivateParents({
        folder: fixture.folder,
        root: fixture.project,
        journal,
        platform: 'win32',
        log: (line) => log.push(line),
      });
      check(fs.existsSync(linked) && fs.lstatSync(linkedRoot).isSymbolicLink(), 'recovery followed a linked recorded private root');
    }
    if (process.platform !== 'win32') {
      for (const kind of ['journal', 'marker']) {
        const parent = record(currentRoot);
        const journalFile = records.at(-1);
        const file = kind === 'journal' ? journalFile : path.join(parent, '.tea-evaluate-private-owner.json');
        const outside = path.join(tempDir(`auxiliary-${kind}-swap`), 'record.json');
        fs.copyFileSync(file, outside);
        const parked = `${file}.parked`;
        const originalLstat = fs.lstatSync;
        let swapped = false;
        fs.lstatSync = (candidate, ...args) => {
          const inspected = originalLstat(candidate, ...args);
          if (!swapped && candidate === (kind === 'journal' ? path.basename(file) : file)) {
            fs.renameSync(file, parked);
            fs.symlinkSync(outside, file);
            swapped = true;
          }
          return inspected;
        };
        try {
          reclaimDeadPrivateParents({ folder: fixture.folder, root: fixture.project, journal, log: (line) => log.push(line) });
        } finally {
          fs.lstatSync = originalLstat;
          if (swapped) {
            fs.unlinkSync(file);
            fs.renameSync(parked, file);
          }
        }
        check(swapped && fs.existsSync(parent), `recovery followed a ${kind} file swapped for a link after inspection`);
      }
    }
  } finally {
    for (const file of records) fs.rmSync(file, { force: true });
    for (const parent of made) if (fs.existsSync(parent)) removeScratchDirectory(parent);
    journal.close();
  }
}

/** The Windows CLI reclaims a verified parent from its old TEMP root. */
function checkWindowsChangedTempCli() {
  if (process.platform !== 'win32') return;
  const fixture = makeProject('windows-old-private-root', { git: false, unconfined: true });
  // A controlled target refusal keeps this recovery check independent of Windows .js launch associations.
  fs.rmSync(path.join(fixture.project, 'bin', 'verdict.js'));
  const runs = path.join(fixture.folder, 'runs');
  fs.mkdirSync(runs, { recursive: true });
  const journal = journalDirectory(runs);
  const oldRoot = privateRootIn(tempDir('windows-old-root-base'));
  const nonce = crypto.randomUUID();
  const dead = spawnSync(process.execPath, ['-e', '']).pid;
  const parent = path.join(oldRoot, `run-${dead}-${nonce}`);
  const entry = {
    version: 1,
    kind: 'private-parent',
    folder: fs.realpathSync.native(fixture.folder),
    root: fs.realpathSync.native(fixture.project),
    runId: 'windows-old-temp',
    ownerPid: dead,
    privateRoot: oldRoot,
    directory: parent,
  };
  fs.mkdirSync(parent, { mode: 0o700 });
  fs.mkdirSync(path.join(parent, 'tea-evaluate-engine-old'));
  fs.writeFileSync(path.join(parent, '.tea-evaluate-private-owner.json'), `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  fs.writeFileSync(path.join(journal.root, `aux-${nonce}.json`), `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  journal.close();
  try {
    const laterTemp = tempDir('windows-new-temp');
    const recovered = evaluate(['preflight', '--evaluation', fixture.folder], { TMPDIR: laterTemp, TMP: laterTemp, TEMP: laterTemp });
    check(
      recovered.status === 12 && recovered.output.includes('bin/verdict.js does not exist'),
      `Windows preflight after TEMP changed did not reach the controlled target refusal: ${recovered.status}\n${recovered.output}`,
    );
    check(recovered.output.includes(parent), `Windows preflight did not report the old private parent ${parent}`);
    check(!fs.existsSync(parent), `Windows preflight left the old private parent ${parent}`);
  } finally {
    if (fs.existsSync(parent)) removeScratchDirectory(parent);
  }
}

/** A missing launch root still reaches the workspace refusal path. */
function checkMissingLaunchRoot() {
  const fixture = makeProject('missing-launch-root', { git: false });
  editJson(path.join(fixture.folder, 'evaluation.json'), (evaluation) => (evaluation.launch.root = 'missing-launch-root'));
  const refused = runPreflight(fixture);
  check(
    refused.status === 12 && /launch\.root .* is not a directory/.test(refused.output),
    `preflight with a missing launch.root exited ${refused.status} without the workspace refusal\n${refused.output}`,
  );
}

/** A target that swaps runs/ cannot redirect the next workspace journal write into the adopter tree. */
function checkJournalParentSwap() {
  const fixture = makeProject('journal-parent-swap', { git: false });
  const runs = path.join(fixture.folder, 'runs');
  const moved = `${runs}.moved`;
  const sink = path.join(fixture.project, 'journal-sink');
  fs.mkdirSync(runs);
  fs.mkdirSync(sink);
  fs.mkdirSync(path.join(sink, '.workspace-journal'), { mode: 0o700 });
  const journal = journalDirectory(runs);
  const options = {
    root: fixture.project,
    kind: 'copy',
    exclude: [fixture.folder],
    ownership: { folder: fixture.folder, root: fixture.project, journal, runId: 'journal-parent-swap' },
  };
  let first = null;
  let next = null;
  try {
    first = createWorkspace({ ...options, label: 'pristine' });
    fs.renameSync(runs, moved);
    fs.symlinkSync(sink, runs);
    let refusal = null;
    try {
      next = createWorkspace({ ...options, label: 'next' });
    } catch (error) {
      refusal = error;
    }
    check(refusal !== null, 'a swapped runs/ parent allowed a second workspace journal write');
    check(
      fs.readdirSync(path.join(sink, '.workspace-journal')).length === 0,
      'a swapped runs/ parent redirected a journal file into the adopter tree',
    );
  } finally {
    if (fs.lstatSync(runs).isSymbolicLink()) fs.rmSync(runs);
    if (fs.existsSync(moved)) fs.renameSync(moved, runs);
    if (next !== null) {
      try {
        removeWorkspace(next);
      } catch {
        fs.rmSync(next.directory, { recursive: true, force: true });
      }
    }
    if (first !== null) removeWorkspace(first);
    journal.close();
  }
}

/** A killed preflight must stop Git's in-flight checkout before the next run reclaims its workspace. */
async function checkKilledCheckout() {
  if (process.platform === 'win32') return;
  const fixture = makeProject('killed-checkout');
  const originalWorktrees = git(fixture.project, ['worktree', 'list', '--porcelain']);
  const pidFile = path.join(tempDir('killed-checkout-pid'), 'pid');
  const script = path.join(tempDir('killed-checkout-filter'), 'hold.sh');
  fs.writeFileSync(script, `#!/bin/sh\nprintf '%s\\n' "$$" > '${pidFile}'\nsleep 15\ncat\n`, { mode: 0o700 });
  const attributes = path.join(fixture.project, '.git', 'info', 'attributes');
  fs.writeFileSync(attributes, 'rules/policy.txt filter=tea-hold\n');
  git(fixture.project, ['config', 'filter.tea-hold.smudge', `sh ${script}`]);
  const child = spawn(process.execPath, [EVALUATE, 'preflight', '--evaluation', fixture.folder], {
    cwd: PROJECT_ROOT,
    env: { ...BASE_ENV, ...fixture.temp.env },
    stdio: 'ignore',
  });
  const closed = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
  holdPrivateParents(child.pid);
  let filterPid = null;
  try {
    for (let elapsed = 0; elapsed < 20_000 && filterPid === null; elapsed += 50) {
      if (fs.existsSync(pidFile)) filterPid = Number(fs.readFileSync(pidFile, 'utf8'));
      else await delay(50);
    }
    check(filterPid !== null, 'Git checkout did not reach the blocking smudge filter');
    if (filterPid === null) return;
    child.kill('SIGKILL');
    const ended = await Promise.race([closed, delay(5000).then(() => null)]);
    check(ended?.signal === 'SIGKILL', 'preflight did not close after checkout was killed');
    let filterGone = false;
    for (let elapsed = 0; elapsed < 7000 && !filterGone; elapsed += 50) {
      filterGone = commandProcessState(filterPid, script) === 'gone';
      if (!filterGone) await delay(50);
    }
    check(filterGone, `the Git checkout filter (pid ${filterPid}) survived the killed preflight`);
    const journal = path.join(fixture.folder, 'runs', '.workspace-journal');
    const abandoned = fs
      .readdirSync(journal)
      .filter((name) => name.endsWith('.json'))
      .map((name) => readJson(path.join(journal, name)));
    check(abandoned.length > 0, 'the killed checkout left no journal for recovery');
    fs.rmSync(attributes);
    git(fixture.project, ['config', '--unset', 'filter.tea-hold.smudge']);
    const recovered = runPreflight(fixture);
    check(recovered.status === 0, `preflight after a killed Git checkout exited ${recovered.status}: ${recovered.output}`);
    for (const entry of abandoned) check(!fs.existsSync(entry.directory), 'recovery left a killed checkout workspace');
    check(fs.readdirSync(journal).filter((name) => name.endsWith('.json')).length === 0, 'recovery left a killed checkout journal');
    check(git(fixture.project, ['worktree', 'list', '--porcelain']) === originalWorktrees, 'recovery left a killed checkout registration');
  } finally {
    child.kill('SIGKILL');
    await Promise.race([closed, delay(5000)]);
    if (filterPid !== null && commandProcessState(filterPid, script) === 'alive') {
      try {
        process.kill(filterPid, 'SIGKILL');
      } catch (error) {
        check(error.code === 'ESRCH', `could not stop the matched Git checkout filter: ${error.message}`);
      }
    }
    fs.rmSync(attributes, { force: true });
  }
}

function checkRecoveryDocumentation() {
  const reference = fs.readFileSync(path.join(PROJECT_ROOT, 'docs', 'reference', 'tea-evaluate-cli.md'), 'utf8');
  const section = reference.split('## The workspace\n')[1]?.split('\n## ')[0] ?? '';
  check(
    /workspace marker/.test(section) && /killed run/.test(section) && /next preflight/.test(section),
    'the workspace reference does not explain the marker and next-preflight recovery of a killed run',
  );
  check(
    /private parent also has an auxiliary ownership record/.test(section) &&
      /killed preflight can leave engine staging/.test(section) &&
      /killed `run` can leave command evaluator scratch/.test(section) &&
      /exact parent path, marker and dead owner/.test(section) &&
      /original private root/.test(section) &&
      /marker write interrupted before completion/.test(section),
    'the workspace reference does not explain verified auxiliary recovery after a killed preflight or run',
  );
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
    unconfined: true,
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
    unconfined: true,
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
    unconfined: true,
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
    unconfined: true,
    edit: ({ project, folder }) => {
      fs.writeFileSync(path.join(project, POLICY), 'mode: strict\nsabotage: adopter\n');
      fs.rmSync(path.join(folder, 'probes', 'P-002.probe.json'));
      editJson(path.join(folder, 'evaluation.json'), (evaluation) => (evaluation.arms = ['clean']));
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
  check(
    vendored === gitTargetImplementationDigest,
    `the implementation digest moved with vendor/, which the tracked tree does not hold: ${vendored}`,
  );
  // A copy has no tracked tree, so its digest walks the files and must leave the provisioned directory out.
  const asCopy =
    (edit) =>
    ({ project: copyProject, folder: copyFolder }) => {
      const manifest = path.join(copyFolder, 'evaluation.json');
      fs.writeFileSync(manifest, JSON.stringify({ ...readJson(manifest), workspace: { kind: 'copy', provision: ['vendor'] } }, null, 2));
      edit(copyProject);
    };
  const copied = digestOf(
    'copied',
    asCopy(() => {}),
  );
  const copiedVendored = digestOf(
    'copied-vendored',
    asCopy((copyProject) => fs.writeFileSync(path.join(copyProject, 'vendor', 'library.txt'), 'provisioned, another version\n')),
  );
  check(
    copied !== null && copiedVendored === copied,
    `a copy's implementation digest moved with vendor/, a provisioned directory: ${copiedVendored}`,
  );

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

/**
 * The round-two containment and cleanup cases: a mutated arm that swaps its
 * whole working directory for a link to the project cannot carry the restore
 * into the project, an in-project link on the target's path is followed like
 * any directory, an engine stage that cannot run leaves no probe list, and a
 * temp directory the repository ignores is accepted inside it.
 */
function checkRound2() {
  const swapped = makeProject('swap-root', {
    unconfined: true,
    edit: ({ folder }) => editMutation(folder, (operator) => (operator.replace = 'mode: lenient\nsabotage: swap-root')),
  });
  // An uncommitted edit the restore would overwrite with the committed bytes if it followed the link.
  fs.appendFileSync(path.join(swapped.project, POLICY), '# a local edit\n');
  const swappedBefore = adopterState(swapped.project);
  const swappedResult = evaluate(['preflight', '--evaluation', swapped.folder], { ...swapped.temp.env, VERDICT_LINK: swapped.project });
  check(
    swappedResult.status === 12 && swappedResult.stdout.includes('now resolves to'),
    `preflight whose mutated arm swapped its working directory for a link exited ${swappedResult.status}; expected 12\n${swappedResult.output}`,
  );
  check(qualifiedProbes(runDirectoryOf(swapped.folder)).length === 0, 'a run whose arm swapped its root wrote a qualified probe');
  checkUntouched('the swapped root', swapped, swappedBefore);

  const linkedPath = makeProject('in-project-link', {
    edit: ({ project }) => {
      fs.mkdirSync(path.join(project, 'config'));
      fs.renameSync(path.join(project, 'rules'), path.join(project, 'config', 'rules'));
      fs.symlinkSync(path.join('config', 'rules'), path.join(project, 'rules'));
    },
  });
  const linkedBefore = adopterState(linkedPath.project);
  const linkedResult = runPreflight(linkedPath);
  check(
    linkedResult.status === 0 && qualifiedProbes(runDirectoryOf(linkedPath.folder)).length === 1,
    `preflight whose targetArtifact sits behind an in-project link exited ${linkedResult.status}; expected 0 and a qualified probe\n${linkedResult.output}`,
  );
  checkUntouched('the in-project link', linkedPath, linkedBefore);

  const shimmed = makeProject('engine-stage');
  const shimLog = path.join(tempDir('engine-stage-log'), 'argv.log');
  const shimResult = evaluate(['preflight', '--evaluation', shimmed.folder], {
    ...shimmed.temp.env,
    [ENGINE_CLI_ENV]: SHIM,
    TEA_EVALUATE_SHIM_LOG: shimLog,
    TEA_EVALUATE_SHIM_EXIT_PREFLIGHT: '2',
  });
  check(
    shimResult.status === 12,
    `preflight whose verdict stage exits an undocumented 2 exited ${shimResult.status}; expected 12\n${shimResult.output}`,
  );
  const shimRun = runDirectoryOf(shimmed.folder);
  check(
    shimRun !== null && fs.existsSync(path.join(shimRun, 'engine', 'preflight.json')),
    'the shimmed run never reached its verdict stage',
  );
  check(
    shimRun !== null && !fs.existsSync(path.join(shimRun, 'probes.json')),
    'a run whose verdict stage could not run kept its probe list',
  );
  check(qualifiedProbes(shimRun).length === 0, 'a run whose verdict stage could not run wrote a qualified probe');

  const ignored = makeProject('ignored-temp');
  fs.appendFileSync(path.join(ignored.project, '.gitignore'), 'ignored-tmp/\n');
  const ignoredTemp = path.join(ignored.project, 'ignored-tmp');
  fs.mkdirSync(ignoredTemp);
  const ignoredResult = evaluate(['preflight', '--evaluation', ignored.folder], {
    TMPDIR: ignoredTemp,
    TMP: ignoredTemp,
    TEMP: ignoredTemp,
  });
  check(
    ignoredResult.status === 0,
    `preflight with a TMPDIR the repository ignores exited ${ignoredResult.status}; expected 0\n${ignoredResult.output}`,
  );
  check(fs.readdirSync(ignoredTemp).length === 0, 'the run left a workspace in the ignored temp directory');
}

async function main() {
  try {
    if (process.argv.includes('--windows-auxiliary-only')) {
      checkWindowsChangedTempCli();
    } else if (process.argv.includes('--auxiliary-only')) {
      await checkKilledEngineStage();
      checkAuxiliaryJournalEdges();
      checkMissingLaunchRoot();
      await checkInterrupted();
      checkRecoveryDocumentation();
    } else {
      await checkCycle();
      await checkUnits();
      await checkGitTarget();
      checkUncommittedWork();
      checkCopyWorkspaces();
      checkFailures();
      checkAdopterTreeGuard();
      checkHookEnvironment();
      checkRound2();
      checkSharedRepository();
      checkLockedLeftovers();
      checkRepositoryShape();
      await checkInterrupted();
      await checkKilledRun('killed-git', { liveOwner: true });
      await checkKilledRun('killed-git-partial', { partialGit: true });
      await checkKilledRun('killed-git-missing', { missingDirectory: true });
      await checkKilledRun('killed-git-unavailable-metadata', { missingDirectory: true, metadataUnavailable: true });
      await checkKilledRun('killed-copy', { isGit: false, uncertain: true });
      await checkKilledRun('unmarked-copy', { isGit: false, unmarked: true });
      await checkKilledRun('partial-marker-copy', { isGit: false, partialMarker: true });
      await checkKilledRun('partial-teardown-copy', { isGit: false, partialTeardown: true });
      await checkKilledEngineStage();
      checkAuxiliaryJournalEdges();
      checkWindowsChangedTempCli();
      checkMissingLaunchRoot();
      await checkKilledCheckout();
      checkJournalParentSwap();
      checkRecoveryDocumentation();
    }
  } finally {
    scratch.removeAll();
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
