/**
 * Baseline refresh cleanup.
 *
 * Verifies that tools/refresh-evaluate-baselines.js swaps the pending baselines in and leaves nothing behind, neither its scratch
 * folder nor its holding folder nor anything inside an evaluation folder, whether the refresh succeeds, fails before it publishes,
 * fails mid-swap and rolls back, or is interrupted by a signal. Only a failed rollback keeps the holding folder, for the baselines
 * it could not restore, and it still restores every other one.
 *
 * Usage: node test/test-refresh-evaluate-baselines.js
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const TOOL = path.join(__dirname, '..', 'tools', 'refresh-evaluate-baselines.js');
const ROOT = path.join(__dirname, '..');
const { HoldingKept, publishBaselines, withWorkspace } = require('../tools/refresh-evaluate-baselines.js');

const failures = [];

async function check(name, fn) {
  try {
    await fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`  FAIL  ${name}`);
  }
}

/** A repository root holding two evaluation folders, each with a baseline that reads `old <name>`, and an optional receipt. */
function repository({ receipt = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-refresh-cleanup-'));
  const folders = ['alpha', 'beta'].map((name) => {
    const folder = path.join(root, 'evals', name);
    fs.mkdirSync(path.join(folder, 'baseline'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'baseline', 'baseline.json'), `old ${name}\n`);
    return folder;
  });
  const receiptFile = path.join(root, 'receipt.json');
  if (receipt !== null) fs.writeFileSync(receiptFile, receipt);
  return { root, folders, receiptFile };
}

/** Runs `fn` over a fresh repository and removes the repository whatever `fn` does. */
async function inRepository(options, fn) {
  const repo = repository(options);
  try {
    await fn(repo);
  } finally {
    fs.rmSync(repo.root, { recursive: true, force: true });
  }
}

/** Stages a pending baseline that reads `new <name>` for each folder, as the refresh does once every candidate has passed. */
function stage(holding, folders, { skip = [] } = {}) {
  return folders.map((folder, index) => {
    const pending = path.join(holding, String(index), 'pending');
    if (!skip.includes(path.basename(folder))) {
      fs.mkdirSync(pending, { recursive: true });
      fs.writeFileSync(path.join(pending, 'baseline.json'), `new ${path.basename(folder)}\n`);
    }
    return { folder, pending };
  });
}

const baselineOf = (folder) => fs.readFileSync(path.join(folder, 'baseline', 'baseline.json'), 'utf8');
const holdingOf = (root) => path.join(root, '.baseline-refresh');

/** Nothing the refresh made is left: no scratch, no holding folder at the root, no `runs/` or stray entry in an evaluation folder. */
function assertNothingLeft({ root, folders }, scratch) {
  assert.equal(fs.existsSync(scratch), false, `the scratch folder ${scratch} is left behind`);
  assert.equal(fs.existsSync(holdingOf(root)), false, 'the holding folder is left at the repository root');
  for (const folder of folders) assert.deepEqual(fs.readdirSync(folder), ['baseline'], `${folder} holds more than its baseline`);
}

/** Publishes `repo`'s two staged baselines inside a workspace, returning the scratch and holding folders it used. */
function publish(repo, { verify = () => {}, skip = [] } = {}) {
  const used = {};
  const finished = withWorkspace(repo.root, ({ scratch, holding }) => {
    Object.assign(used, { scratch, holding });
    publishBaselines({
      candidates: stage(holding, repo.folders, { skip }),
      holding,
      receiptFile: repo.receiptFile,
      receipt: { refreshed: true },
      verify: (folder) => verify(folder, holding),
    });
  });
  return { used, finished };
}

async function main() {
  await check('a refresh that succeeds publishes every baseline and the receipt, and leaves nothing behind', () =>
    inRepository({ receipt: '{"old":true}\n' }, async (repo) => {
      const { used, finished } = publish(repo);
      await finished;
      assert.deepEqual(repo.folders.map(baselineOf), ['new alpha\n', 'new beta\n']);
      assert.deepEqual(JSON.parse(fs.readFileSync(repo.receiptFile, 'utf8')), { refreshed: true });
      assert.equal(fs.existsSync(`${repo.receiptFile}.pending`), false);
      assertNothingLeft(repo, used.scratch);
    }),
  );

  await check('a refresh that fails before it publishes leaves the baselines alone and nothing behind', () =>
    inRepository({}, async (repo) => {
      let scratch = null;
      await assert.rejects(
        withWorkspace(repo.root, ({ scratch: made, holding }) => {
          scratch = made;
          fs.mkdirSync(path.join(made, '0', 'evaluation'), { recursive: true });
          stage(holding, repo.folders);
          throw new Error('candidate beta: probe scores moved');
        }),
        /probe scores moved/,
      );
      assert.deepEqual(repo.folders.map(baselineOf), ['old alpha\n', 'old beta\n']);
      assertNothingLeft(repo, scratch);
    }),
  );

  for (const receipt of ['{"old":true}\n', null]) {
    const earlier = receipt === null ? 'no' : 'an';
    await check(
      `a check that fails after a swap rolls every baseline back and leaves the receipt as it was (${earlier} earlier receipt)`,
      () =>
        inRepository({ receipt }, async (repo) => {
          // A file the refresh does not own beside the receipt stays as it is.
          fs.writeFileSync(`${repo.receiptFile}.pending`, "not the refresh's\n");
          const { used, finished } = publish(repo, {
            verify: (folder) => assert.notEqual(path.basename(folder), 'beta', 'beta: digest findings'),
          });
          await assert.rejects(finished, /beta: digest findings/);
          assert.deepEqual(repo.folders.map(baselineOf), ['old alpha\n', 'old beta\n']);
          assert.equal(fs.existsSync(repo.receiptFile) ? fs.readFileSync(repo.receiptFile, 'utf8') : null, receipt);
          assert.equal(fs.readFileSync(`${repo.receiptFile}.pending`, 'utf8'), "not the refresh's\n");
          fs.rmSync(`${repo.receiptFile}.pending`);
          assertNothingLeft(repo, used.scratch);
        }),
    );
  }

  await check('a pending baseline that cannot be moved in rolls every baseline back, its own included', () =>
    inRepository({}, async (repo) => {
      const { used, finished } = publish(repo, { skip: ['beta'] });
      await assert.rejects(finished, /ENOENT/);
      assert.deepEqual(repo.folders.map(baselineOf), ['old alpha\n', 'old beta\n']);
      assertNothingLeft(repo, used.scratch);
    }),
  );

  await check('a rollback that fails restores every other baseline, keeps the holding folder and names it', () =>
    inRepository({}, async (repo) => {
      const { used, finished } = publish(repo, {
        verify: (folder, holding) => {
          if (path.basename(folder) !== 'beta') return;
          // beta's retired baseline can no longer go back, so beta's restore, the first of the rollback, fails.
          fs.renameSync(path.join(holding, '1', 'retired'), path.join(holding, '1', 'moved'));
          throw new Error('beta: digest findings');
        },
      });
      await assert.rejects(
        finished,
        (error) => error instanceof HoldingKept && error.message.includes(used.holding) && /beta: digest findings/.test(error.message),
      );
      assert.equal(baselineOf(repo.folders[0]), 'old alpha\n', 'alpha was left unrestored after beta failed');
      assert.equal(fs.existsSync(path.join(used.holding, '1', 'moved', 'baseline.json')), true, 'the holding folder was removed');
      assert.equal(fs.existsSync(used.scratch), false, `the scratch folder ${used.scratch} is left behind`);
    }),
  );

  for (const signal of ['SIGINT', 'SIGTERM']) {
    await check(`a refresh ended by ${signal} leaves nothing behind and ends as the signal would`, () =>
      inRepository({}, async (repo) => {
        const script = `
          const { withWorkspace } = require(${JSON.stringify(TOOL)});
          withWorkspace(${JSON.stringify(repo.root)}, ({ scratch, holding }) => {
            require('node:fs').mkdirSync(require('node:path').join(holding, '0', 'pending'), { recursive: true });
            process.stdout.write(JSON.stringify({ scratch, holding }) + '\\n');
            return new Promise(() => setInterval(() => {}, 1000));
          });`;
        const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'inherit'] });
        const used = await new Promise((resolve, reject) => {
          child.stdout.once('data', (chunk) => resolve(JSON.parse(chunk.toString())));
          child.once('exit', (code) => reject(new Error(`the child exited ${code} before it started`)));
        });
        const ended = new Promise((resolve) => child.once('exit', (code, received) => resolve(received)));
        child.kill(signal);
        assert.equal(await ended, signal);
        assert.equal(fs.existsSync(used.holding), false, `the holding folder ${used.holding} is left behind`);
        assertNothingLeft(repo, used.scratch);
      }),
    );
  }

  await check('a second refresh of the same checkout refuses to start while the first holds it, and touches nothing', () =>
    inRepository({}, async (repo) => {
      let second = null;
      let secondScratch = null;
      const { used, finished } = publish(repo, {
        verify: (folder) => {
          if (path.basename(folder) !== 'alpha') return;
          // Its outcome is taken at once, so its refusal is never an unhandled rejection while the first refresh runs on.
          second = withWorkspace(repo.root, ({ scratch }) => {
            secondScratch = scratch;
          }).then(
            () => null,
            (error) => error,
          );
        },
      });
      await finished;
      const refused = await second;
      assert.ok(refused?.message.includes(`another refresh holds ${used.holding}`), `the second refresh ended as ${refused}`);
      assert.equal(secondScratch, null, 'the second refresh ran its work');
      assert.deepEqual(repo.folders.map(baselineOf), ['new alpha\n', 'new beta\n']);
      assertNothingLeft(repo, used.scratch);
    }),
  );

  await check('the tool, refused at its first evaluation, leaves no folder at the repository root or in the temp folder', () => {
    // The source is a commit of the empty tree, written to a temporary object store beside the repository's, so the tool fails to
    // read the first baseline at it, before it stages anything, whatever engine is installed, and the repository stays untouched.
    const objects = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-refresh-cleanup-objects-'));
    // The tool's temp folder is this case's own, so another refresh's scratch elsewhere is never taken for a leak.
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-refresh-cleanup-temp-'));
    const git = (args, env) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', env });
    const common = path.resolve(ROOT, git(['rev-parse', '--git-common-dir']).stdout.trim());
    const env = { ...process.env, GIT_OBJECT_DIRECTORY: objects, GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(common, 'objects') };
    try {
      const emptyTree = git(['hash-object', '-t', 'tree', '-w', '--stdin'], env);
      const source = spawnSync('git', ['commit-tree', emptyTree.stdout.trim(), '-m', 'empty source'], {
        cwd: ROOT,
        encoding: 'utf8',
        env: {
          ...env,
          GIT_AUTHOR_NAME: 'test',
          GIT_AUTHOR_EMAIL: 'test@example.invalid',
          GIT_COMMITTER_NAME: 'test',
          GIT_COMMITTER_EMAIL: 'test@example.invalid',
        },
        input: '',
      });
      assert.equal(source.status, 0, source.stderr);
      const status = git(['status', '--porcelain', '--untracked-files=all']).stdout;
      const held = fs.existsSync(holdingOf(ROOT));
      const result = spawnSync(process.execPath, [TOOL, '--source', source.stdout.trim()], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...env, TMPDIR: temp },
      });
      assert.equal(result.status, 1, `the tool exited ${result.status}\n${result.stdout}${result.stderr}`);
      assert.match(result.stderr, /baseline\/baseline\.json/, `the tool failed elsewhere than at the first baseline:\n${result.stderr}`);
      assert.deepEqual(fs.readdirSync(temp), [], 'the tool left a folder in its temp folder');
      assert.equal(fs.existsSync(holdingOf(ROOT)), held, 'the tool left its holding folder at the repository root');
      assert.equal(git(['status', '--porcelain', '--untracked-files=all']).stdout, status, 'the tool changed the repository');
    } finally {
      fs.rmSync(objects, { recursive: true, force: true });
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });

  if (failures.length > 0) {
    console.error('\nBaseline refresh cleanup failed:\n');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log('Baseline refresh leaves nothing behind.');
}

main();
