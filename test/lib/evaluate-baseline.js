'use strict';

/**
 * What `test:evaluate-compare` (Story 2.1) and `test:evaluate-ci` (Story 2.2) both need to accept a baseline and replay
 * it: a copy of a scored project, the commit a reviewed pull request makes, a clean run scored through the real CLI, and
 * the placement of an accepted baseline at `runs/<acceptedRun>/` in a scratch copy of the evaluation folder.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

/**
 * A copy of a project's repository in a temp directory of its own; the evaluation folder inside it. The copy's root is
 * pushed on `copies`, which the suite removes when it ends.
 */
function copyOf(project, copies) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'tea-evaluate-baseline-copy-'));
  copies.push(root);
  const repository = path.join(root, 'repository');
  // Node's native cpSync aborts if a loose-object directory disappears
  // during traversal on macOS. Let Git copy its own store, restore the source
  // HEAD and deletions, then overlay the working tree and ignored run evidence.
  const cloned = spawnSync('git', ['clone', '--quiet', '--no-local', project.repository, repository], {
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  });
  assert.equal(cloned.status, 0, `clone: ${cloned.stderr}`);
  const git = (location, args) =>
    spawnSync('git', ['-C', location, ...args], {
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    });
  const sourceHead = git(project.repository, ['rev-parse', 'HEAD']);
  assert.equal(sourceHead.status, 0, `source HEAD: ${sourceHead.stderr}`);
  const sourceBranch = git(project.repository, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  assert.ok(sourceBranch.status === 0 || sourceBranch.status === 1, `source branch: ${sourceBranch.stderr}`);
  const checkedOut = git(
    repository,
    sourceBranch.status === 0
      ? ['checkout', '--quiet', '-B', sourceBranch.stdout.trim(), sourceHead.stdout.trim()]
      : ['checkout', '--quiet', '--detach', sourceHead.stdout.trim()],
  );
  assert.equal(checkedOut.status, 0, `copy HEAD: ${checkedOut.stderr}`);
  const tracked = git(repository, ['ls-files', '-z']);
  assert.equal(tracked.status, 0, `tracked paths: ${tracked.stderr}`);
  for (const relative of tracked.stdout.split('\0').filter(Boolean)) {
    try {
      fs.lstatSync(path.join(project.repository, relative));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      fs.rmSync(path.join(repository, relative), { recursive: true, force: true });
    }
  }
  fs.cpSync(project.repository, repository, {
    recursive: true,
    force: true,
    filter: (source) => source !== path.join(project.repository, '.git'),
  });
  return path.join(repository, path.relative(project.repository, project.folder));
}

/** Commits the repository's current state, as the reviewed pull request that accepts a baseline does. */
function commitAll(repository, message) {
  const git = ['-c', 'user.name=TeA test', '-c', 'user.email=tea-test@example.test', '-c', 'core.hooksPath=/dev/null'];
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };
  for (const args of [
    ['add', '--all'],
    ['commit', '--quiet', '-m', message],
  ]) {
    const run = spawnSync('git', [...git, '-C', repository, ...args], { encoding: 'utf8', env });
    assert.equal(run.status, 0, `${args.join(' ')}: ${run.stderr}`);
  }
}

/** One clean `run` and its `score` through the CLI of `suite` (`test/lib/evaluate-story-121.js`); the run directory. */
function runAndScore(suite, project, runArgs = []) {
  const ran = suite.cli(project.folder, 'run', runArgs, project.env);
  assert.equal(ran.status, 0, ran.output);
  const run = suite.latest(project.folder);
  const scored = suite.cli(project.folder, 'score', ['--run', path.basename(run)], project.env);
  assert.equal(scored.status, 0, scored.output);
  return run;
}

/**
 * Replaces `runs/<acceptedRun>/` in the evaluation folder `folder` with the bytes of its `baseline/`. The sealed records
 * name their actions artifacts and isolation manifests as `runs/<acceptedRun>/...` and `score` refuses a reference outside
 * the run directory it scores, so a replay places the baseline at the accepted id; under any other id every record would
 * reach outside its run. `skip` names baseline files left out (`baseline.json` always is).
 */
function placeBaseline(folder, acceptedRun, skip = []) {
  const runDirectory = path.join(folder, 'runs', acceptedRun);
  fs.rmSync(runDirectory, { recursive: true, force: true });
  fs.cpSync(path.join(folder, 'baseline'), runDirectory, {
    recursive: true,
    filter: (file) => path.basename(file) !== 'baseline.json' && !skip.includes(path.basename(file)),
  });
  return runDirectory;
}

/**
 * `baseline/baseline.json`'s `files` map rewritten to the bytes `baseline/` holds now: a baseline edited by hand together with
 * its manifest, which is a sealed and self-consistent baseline that the digest check (Story 1.90) accepts. A case that plants a
 * defect below that check (another engine's `run.json`, evidence off its schema) reseals, so the defect it names is the one that
 * refuses. `digestBytes` is eval-quality's.
 */
function resealBaseline(folder, { digestBytes }) {
  const baseline = path.join(folder, 'baseline');
  const file = path.join(baseline, 'baseline.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const name of Object.keys(manifest.files)) manifest.files[name] = digestBytes(fs.readFileSync(path.join(baseline, name)));
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

module.exports = { commitAll, copyOf, placeBaseline, resealBaseline, runAndScore };
