/**
 * Baseline refresh cleanup.
 *
 * Verifies that tools/refresh-evaluate-baselines.js swaps the pending baselines in and leaves nothing behind, neither its scratch
 * folder nor its holding folder nor anything inside an evaluation folder, whether the refresh succeeds, fails before it publishes,
 * fails mid-swap and rolls back, or is interrupted by a signal. The receipt's rename is the commit point: before it a failure rolls
 * every baseline back it can, and a failed restore keeps the holding folder for the baselines it could not restore; after it the
 * published baselines and receipt stay, and a holding folder the refresh cannot mark or inspect is kept, reported, and fails the
 * run.
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
const { HoldingKept, publishBaselines, slotOf, withWorkspace } = require('../tools/refresh-evaluate-baselines.js');

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
  return folders.map((folder) => {
    const pending = path.join(slotOf(holding, folder), 'pending');
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
  const finished = withWorkspace(
    repo.root,
    ({ scratch, holding }) => {
      Object.assign(used, { scratch, holding });
      publishBaselines({
        candidates: stage(holding, repo.folders, { skip }),
        holding,
        receiptFile: repo.receiptFile,
        receipt: { refreshed: true },
        verify: (folder) => verify(folder, holding),
      });
    },
    { folders: repo.folders },
  );
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
        withWorkspace(
          repo.root,
          ({ scratch: made, holding }) => {
            scratch = made;
            fs.mkdirSync(path.join(made, '0', 'evaluation'), { recursive: true });
            stage(holding, repo.folders);
            throw new Error('candidate beta: probe scores moved');
          },
          { folders: repo.folders },
        ),
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
          fs.renameSync(path.join(slotOf(holding, folder), 'retired'), path.join(slotOf(holding, folder), 'moved'));
          // Without its staged receipt the folder shows no sign of an unfinished refresh; the failed rollback alone keeps it.
          fs.rmSync(path.join(holding, 'receipt.json'));
          throw new Error('beta: digest findings');
        },
      });
      await assert.rejects(
        finished,
        (error) => error instanceof HoldingKept && error.message.includes(used.holding) && /beta: digest findings/.test(error.message),
      );
      assert.equal(baselineOf(repo.folders[0]), 'old alpha\n', 'alpha was left unrestored after beta failed');
      assert.equal(
        fs.existsSync(path.join(slotOf(used.holding, repo.folders[1]), 'moved', 'baseline.json')),
        true,
        'the holding folder was removed',
      );
      assert.equal(fs.existsSync(used.scratch), false, `the scratch folder ${used.scratch} is left behind`);
    }),
  );

  for (const signal of ['SIGINT', 'SIGTERM']) {
    await check(`a refresh ended by ${signal} leaves nothing behind and ends as the signal would`, () =>
      inRepository({}, async (repo) => {
        const script = `
          const { slotOf, withWorkspace } = require(${JSON.stringify(TOOL)});
          const folders = ${JSON.stringify(repo.folders)};
          withWorkspace(${JSON.stringify(repo.root)}, ({ scratch, holding }) => {
            require('node:fs').mkdirSync(require('node:path').join(slotOf(holding, folders[0]), 'pending'), { recursive: true });
            process.stdout.write(JSON.stringify({ scratch, holding }) + '\\n');
            return new Promise(() => setInterval(() => {}, 1000));
          }, { folders });`;
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

  await check("the holding folder is only its owner's under a permissive umask, and the staged receipt cannot be swapped", () =>
    inRepository({ receipt: '{"old":true}\n' }, async (repo) => {
      const umask = process.umask(0o002);
      let mode = null;
      try {
        const { used, finished } = publish(repo, {
          verify: (folder, holding) => {
            mode = fs.statSync(holding).mode & 0o777;
            if (path.basename(folder) === 'beta') fs.writeFileSync(path.join(holding, 'receipt.json'), '{"forged":true}\n');
          },
        });
        await assert.rejects(finished, /receipt\.json changed after the refresh staged it/);
        assert.equal(mode, 0o700, `the holding folder had mode ${mode?.toString(8)}`);
        assert.deepEqual(repo.folders.map(baselineOf), ['old alpha\n', 'old beta\n']);
        assert.equal(fs.readFileSync(repo.receiptFile, 'utf8'), '{"old":true}\n');
        assertNothingLeft(repo, used.scratch);
      } finally {
        process.umask(umask);
      }
    }),
  );

  await check('a refresh that cannot mark itself published after its receipt is in place keeps what it published and the folder', () =>
    inRepository({ receipt: '{"old":true}\n' }, async (repo) => {
      const { used, finished } = publish(repo, {
        // A folder where the marker would go makes the marker's write fail once the receipt is in place.
        verify: (folder, holding) => fs.mkdirSync(path.join(holding, 'published'), { recursive: true }),
      });
      await assert.rejects(
        finished,
        (error) => error instanceof HoldingKept && /published every baseline and the receipt, but could not mark/.test(error.message),
      );
      assert.deepEqual(repo.folders.map(baselineOf), ['new alpha\n', 'new beta\n']);
      assert.deepEqual(JSON.parse(fs.readFileSync(repo.receiptFile, 'utf8')), { refreshed: true });
      assert.equal(fs.existsSync(used.holding), true, 'the holding folder was removed');
    }),
  );

  await check('a publish whose holding folder cannot be inspected afterwards keeps it, says so, and fails the run', () =>
    inRepository({ receipt: '{"old":true}\n' }, async (repo) => {
      const errors = [];
      const consoleError = console.error;
      const exitCode = process.exitCode;
      console.error = (line) => errors.push(String(line));
      try {
        const { used, finished } = publish(repo, {
          // An entry no refresh makes leaves the folder uninspectable once the publish is through.
          verify: (folder, holding) => fs.writeFileSync(path.join(holding, 'stray'), 'x\n'),
        });
        await finished;
        assert.equal(process.exitCode, 1, `the run's exit code is ${process.exitCode}`);
        assert.ok(
          errors.some((line) => line.includes(`kept ${used.holding}`) && line.includes('inspect')),
          `the kept folder was not reported: ${JSON.stringify(errors)}`,
        );
        assert.deepEqual(repo.folders.map(baselineOf), ['new alpha\n', 'new beta\n']);
        assert.deepEqual(JSON.parse(fs.readFileSync(repo.receiptFile, 'utf8')), { refreshed: true });
        assert.equal(fs.existsSync(used.holding), true, 'the holding folder was removed');
      } finally {
        console.error = consoleError;
        process.exitCode = exitCode;
      }
    }),
  );

  await check('a holding folder left by a refresh says what it holds and what to do with it', () =>
    inRepository({}, async (repo) => {
      // A rollback that failed: beta's original stays retired, and the next refresh names it in place of starting.
      const { used, finished } = publish(repo, {
        verify: (folder, holding) => {
          if (path.basename(folder) !== 'beta') return;
          // A non-empty folder where beta's new baseline would go back makes beta's restore fail with its original still retired.
          fs.mkdirSync(path.join(slotOf(holding, folder), 'pending'));
          fs.writeFileSync(path.join(slotOf(holding, folder), 'pending', 'blocker'), 'x\n');
          throw new Error('beta: digest findings');
        },
      });
      await assert.rejects(finished, HoldingKept);
      const next = await withWorkspace(repo.root, () => {}, { folders: repo.folders }).then(
        () => null,
        (error) => error,
      );
      const retired = path.join(slotOf(used.holding, repo.folders[1]), 'retired');
      assert.ok(
        next?.message.includes('never finished publishing') &&
          next.message.includes(`${retired} is the baseline ${path.join(repo.folders[1], 'baseline')} held before the refresh`),
        `the refusal over a kept holding folder reads ${next?.message}`,
      );
      assert.equal(fs.existsSync(retired), true, 'the retired baseline is gone');
      // An inventory that gained an evaluation sorting before the others still names the evaluation the baseline came from.
      const grown = await withWorkspace(repo.root, () => {}, {
        folders: [path.join(repo.root, 'evals', 'aardvark'), ...repo.folders],
      }).then(
        () => null,
        (error) => error,
      );
      assert.ok(
        grown?.message.includes(`${retired} is the baseline ${path.join(repo.folders[1], 'baseline')} held before the refresh`),
        `the refusal under a grown inventory reads ${grown?.message}`,
      );
      // An inventory that no longer lists the evaluation leaves the folder to a person.
      const shrunk = await withWorkspace(repo.root, () => {}, { folders: [repo.folders[0]] }).then(
        () => null,
        (error) => error,
      );
      assert.match(shrunk?.message ?? '', /it holds entries no refresh makes, so inspect .* by hand/);
      // A published marker beside the staged receipt is no state a refresh leaves; a person decides.
      fs.writeFileSync(path.join(used.holding, 'published'), '');
      const both = await withWorkspace(repo.root, () => {}, { folders: repo.folders }).then(
        () => null,
        (error) => error,
      );
      assert.match(both?.message ?? '', /it holds entries no refresh makes, so inspect .* by hand/);
      fs.rmSync(path.join(used.holding, 'published'));
      // Without the staged receipt and without the published marker, nobody can tell; the folder stays and a person decides.
      fs.rmSync(path.join(used.holding, 'receipt.json'));
      const unknown = await withWorkspace(repo.root, () => {}, { folders: repo.folders }).then(
        () => null,
        (error) => error,
      );
      assert.match(unknown?.message ?? '', /it cannot tell whether its refresh published, so inspect .* by hand/);
      assert.equal(fs.existsSync(retired), true, 'the retired baseline is gone');
      // With the published marker, the retired baselines are the replaced ones.
      fs.writeFileSync(path.join(used.holding, 'published'), '');
      const published = await withWorkspace(repo.root, () => {}, { folders: repo.folders }).then(
        () => null,
        (error) => error,
      );
      assert.match(
        published?.message ?? '',
        /published every baseline and the receipt, so the 1 retired baseline\(s\) in it are the replaced ones/,
      );
      fs.rmSync(used.holding, { recursive: true });
      fs.mkdirSync(used.holding);
      const empty = await withWorkspace(repo.root, () => {}, { folders: repo.folders }).then(
        () => null,
        (error) => error,
      );
      assert.match(empty?.message ?? '', /it holds no retired baseline; if no refresh is running, remove/);
      // An entry no refresh makes, such as a link out of the folder, is neither followed nor removed: a person inspects it.
      fs.symlinkSync(os.tmpdir(), path.join(used.holding, '0'));
      const linked = await withWorkspace(repo.root, () => {}, { folders: repo.folders }).then(
        () => null,
        (error) => error,
      );
      assert.match(linked?.message ?? '', /it holds entries no refresh makes, so inspect .* by hand before you remove it/);
      assert.equal(fs.lstatSync(path.join(used.holding, '0')).isSymbolicLink(), true, 'the link was removed');
    }),
  );

  await check('the tool, refused at its first evaluation, leaves nothing in its checkout or its temp folder', () => {
    // A disposable checkout with the tool, its modules and the first evaluation, under its own lock and temp folder. Its source is
    // a commit of the empty tree, so the tool fails to read the first baseline at it before it stages anything, whatever engine
    // is installed.
    const checkout = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-refresh-cleanup-checkout-'));
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-refresh-cleanup-temp-'));
    const first = 'test/evaluations/bmad-tea-evaluate';
    const author = {
      GIT_AUTHOR_NAME: 'test',
      GIT_AUTHOR_EMAIL: 'test@example.invalid',
      GIT_COMMITTER_NAME: 'test',
      GIT_COMMITTER_EMAIL: 'test@example.invalid',
    };
    const git = (cwd, args) => spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...author }, input: '' });
    try {
      for (const folder of ['cli', 'tools', 'test/lib'])
        fs.cpSync(path.join(ROOT, folder), path.join(checkout, folder), { recursive: true });
      // The evaluation comes from one commit's tree, so a refresh or an edit in the working tree cannot change it midway.
      const archive = spawnSync('git', ['archive', '--format=tar', 'HEAD', '--', first], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 });
      assert.equal(archive.status, 0, archive.stderr?.toString());
      const unpacked = spawnSync('tar', ['-x', '-C', checkout], { input: archive.stdout });
      assert.equal(unpacked.status, 0, unpacked.stderr?.toString());
      fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(checkout, 'package.json'));
      fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(checkout, 'node_modules'), 'dir');
      assert.equal(git(checkout, ['init', '-q']).status, 0);
      const tree = git(checkout, ['hash-object', '-t', 'tree', '-w', '--stdin']).stdout.trim();
      const source = git(checkout, ['commit-tree', tree, '-m', 'empty source']);
      assert.equal(source.status, 0, source.stderr);
      const status = git(checkout, ['status', '--porcelain', '--untracked-files=all']).stdout;
      const result = spawnSync(
        process.execPath,
        [path.join(checkout, 'tools', 'refresh-evaluate-baselines.js'), '--source', source.stdout.trim()],
        {
          cwd: checkout,
          encoding: 'utf8',
          env: { ...process.env, TMPDIR: temp },
        },
      );
      assert.equal(result.status, 1, `the tool exited ${result.status}\n${result.stdout}${result.stderr}`);
      assert.ok(
        result.stderr.includes(`${first}/baseline/baseline.json`),
        `the tool failed elsewhere than at the first baseline:\n${result.stderr}`,
      );
      assert.deepEqual(fs.readdirSync(temp), [], 'the tool left a folder in its temp folder');
      assert.equal(fs.existsSync(holdingOf(checkout)), false, 'the tool left its holding folder in the checkout');
      assert.equal(git(checkout, ['status', '--porcelain', '--untracked-files=all']).stdout, status, 'the tool changed its checkout');
    } finally {
      fs.rmSync(checkout, { recursive: true, force: true });
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
