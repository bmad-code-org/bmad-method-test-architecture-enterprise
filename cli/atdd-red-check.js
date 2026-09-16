#!/usr/bin/env node
/**
 * tea-atdd-red-check — activates and executes the scaffolds
 * `bmad-testarch-atdd` wrote, and reports what actually happened.
 *
 * This is the deterministic half of the ATDD suite, and it carries no vendor
 * knowledge at all: it never calls a model, never resolves a credential, and
 * every input it reads is a file on disk. `cli/atdd-runner.js` is the other
 * half, the one that spends a model call to generate the scaffolds this
 * command then activates.
 *
 * Its whole surface is one turn:
 *
 *   a project directory with test.skip() scaffolds under {test-dir}/
 *     -> each scaffold's test.skip() is removed
 *     -> each spec file is executed on its own, so one file's load failure
 *        never masks another file's result
 *     -> one JSON report is left on disk
 *
 * WHY EACH FILE RUNS ON ITS OWN
 *
 * Playwright aborts the whole invocation, every file, the moment any one spec
 * file fails to import or fails to parse: measured live, a syntax error in one
 * file and a working test in a sibling file produced zero executed tests and
 * zero reported results for either. A generated scaffold that does not parse is
 * exactly the defect this suite exists to catch, so scoring it has to cost
 * nothing else in the run.
 *
 * WHY ACTIVATION IS A TEXT REPLACEMENT
 *
 * The workflow's own contract is `test.skip('title', async (...) => {...})`,
 * one call per scaffold, and "activate a scaffold" means removing that call so
 * the test executes. A file with zero `test.skip(` occurrences was never a
 * red-phase scaffold to begin with — it shipped active, or shipped skipped some
 * other way `checkFile` cannot see — and is reported as such rather than run
 * through a no-op replacement that would score it identically to a compliant
 * file.
 *
 * WHAT THIS COMMAND DOES NOT DO
 *
 * It does not decide which criterion a test maps to, does not judge whether a
 * failure message matches the story's declared pattern, and does not classify
 * red-for-the-right-reason from wrong-reason. All three are `test/eval-atdd.js`
 * scoring a report this command produced, over the story's ground truth, which
 * this command never reads. Keeping the split is what lets the report be
 * replayed against a changed ground truth with no re-execution: the recorded
 * facts do not move, only their judgment does.
 *
 * ISOLATION
 *
 * This command does not isolate itself. `test/eval-atdd.js` and
 * `cli/lib/atdd-isolation.js` wrap the whole invocation of this process in the
 * sandboxed backend before it ever starts, the way a caller wraps any command
 * it wants confined; the alternative, isolating from inside, cannot confine the
 * process already running unconfined at the moment it decided to. NFR9 names
 * the properties test/test-atdd-isolation.js proves.
 *
 * Usage:
 *   tea-atdd-red-check --project-root <dir> --report <path> [--test-dir tests]
 *     [--node-path <dir>] [--per-file-timeout-ms 15000]
 *
 * Exit codes:
 *   0  every spec file ran to some conclusion and the report was written,
 *      whatever the tests inside it did — a red phase and a vacuous pass are
 *      both a completed run
 *   2  a usage error, or the run could not be set up (no project, no spec
 *      files, the Playwright entry point could not be resolved)
 */

'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { Command } = require('commander');

/** The call this command removes to activate a scaffold. Word-boundary anchored so `test.describe.skip(` is untouched. */
const SKIP_CALL = /\btest\.skip\(/g;

/**
 * ANSI escape sequences, stripped from every message this command records.
 * Playwright's own error formatting colors a `expect()` failure's diff
 * unconditionally rather than reading `FORCE_COLOR`, so a message a later
 * scorer pattern-matches against would otherwise carry escape codes between
 * words that a plain-text pattern does not expect.
 */
// eslint-disable-next-line no-control-regex -- the ESC byte is the thing being matched, not an accident
const ANSI_ESCAPE = /\[[0-9;]*m/g;

function stripAnsi(value) {
  return String(value ?? '').replaceAll(ANSI_ESCAPE, '');
}

/**
 * Directories a production-file digest never descends into: the test suite
 * itself, its own output, package state nobody hand-writes, and `_bmad`, the
 * eval harness's own bookkeeping directory (the staged workflow config the
 * generation prompt tells the agent to read, not the fixture's product
 * surface). `test/eval-atdd.js`'s generation-phase scope excludes the same
 * directory for the same reason; the two phases check the same tree and have
 * to draw the "production" boundary the same way, or an identical write
 * scores differently depending only on which phase made it.
 */
const DIGEST_EXCLUDED_DIRECTORIES = new Set(['node_modules', 'test-results', '.cache', '.tea-atdd-cache', '_bmad']);

function fail(message) {
  process.stderr.write(`tea-atdd-red-check: ${message}\n`);
  process.exit(2);
}

/**
 * A file's content and permission bits together, so a scaffold that flips a
 * production file's executable bit without touching a single byte is still a
 * detected mutation: content alone is silent on it, and git records the bit.
 */
function snapshotFile(absolute) {
  const mode = fs.statSync(absolute).mode & 0o777;
  return `${mode.toString(8)}:${fs.readFileSync(absolute).toString('base64')}`;
}

/** Every file under `root`, relative to it, in a stable order, skipping the excluded directories and the test/output directories named. */
function filesUnder(root, { skip = [] } = {}) {
  const skipSet = new Set(skip.map((entry) => path.resolve(root, entry)));
  const found = [];
  const walk = (directory) => {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (DIGEST_EXCLUDED_DIRECTORIES.has(entry.name) || skipSet.has(absolute)) continue;
        walk(absolute);
      } else if (entry.isFile()) {
        found.push(path.relative(root, absolute));
      }
    }
  };
  walk(root);
  return found;
}

/** Every `*.spec.ts` under `testDir`, relative to `projectRoot`, in a stable order. */
function discoverSpecFiles(projectRoot, testDir) {
  const absolute = path.join(projectRoot, testDir);
  if (!fs.existsSync(absolute)) return [];
  const found = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.spec.ts')) found.push(path.relative(projectRoot, full));
    }
  };
  walk(absolute);
  return found;
}

/**
 * The Playwright CLI entry point, resolved from `@playwright/test`'s own
 * `bin` declaration rather than a private path guessed at, the way
 * tools/generate-contracts.js reads a package's exported constants instead of
 * transcribing them. `nodePath` is searched first so a project with no
 * `node_modules` of its own resolves the copy this repository declares as a
 * devDependency.
 *
 * @param {string[]} searchPaths
 * @returns {string}
 */
function resolvePlaywrightCli(searchPaths) {
  let packageJsonPath;
  try {
    packageJsonPath = require.resolve('@playwright/test/package.json', { paths: searchPaths });
  } catch (error) {
    fail(`could not resolve @playwright/test from [${searchPaths.join(', ')}]: ${error.message}`);
  }
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const binRelative = packageJson.bin?.playwright;
  if (!binRelative) fail(`@playwright/test at ${packageJsonPath} declares no "playwright" bin entry`);
  const cliPath = path.join(path.dirname(packageJsonPath), binRelative);
  if (!fs.existsSync(cliPath)) fail(`@playwright/test declares its CLI at ${cliPath}, which does not exist`);
  return cliPath;
}

/**
 * One spec file, executed alone: activated, run, and read back.
 *
 * @returns {{
 *   file: string,
 *   hadSkipCall: boolean,
 *   loadError: string|null,
 *   tests: Array<{title: string, status: string, message: string|null}>,
 * }}
 */
function runOneSpecFile({ projectRoot, relativeFile, cliPath, nodePathDirectory, netGuardPath, timeoutMs, baseUrl }) {
  const absolute = path.join(projectRoot, relativeFile);
  const original = fs.readFileSync(absolute, 'utf8');
  const hadSkipCall = SKIP_CALL.test(original);
  SKIP_CALL.lastIndex = 0;
  const activated = original.replace(SKIP_CALL, 'test(');
  fs.writeFileSync(absolute, activated, 'utf8');

  const jsonOutputPath = path.join(projectRoot, 'test-results', `${relativeFile.replaceAll(/[\\/]/g, '__')}.json`);
  fs.mkdirSync(path.dirname(jsonOutputPath), { recursive: true });
  fs.rmSync(jsonOutputPath, { force: true });

  const nodeArgs = [cliPath, 'test', relativeFile, '--reporter=json'];
  const env = {
    // PATH is load-bearing rather than incidental: the fixture's own
    // playwright.config.ts declares a `webServer` command (`node src/server.js`),
    // which Playwright spawns itself, and that spawn needs `node` on PATH.
    // Nothing else from the parent's environment is passed through, matching
    // the minimal-child-environment idiom cli/lib/run-agent.js already applies
    // to a vendor call: a generated test gets exactly what it needs to run
    // against the fixture and nothing that could carry a credential.
    PATH: process.env.PATH ?? '',
    NODE_PATH: nodePathDirectory,
    NODE_OPTIONS: `--require=${netGuardPath}`,
    PLAYWRIGHT_JSON_OUTPUT_NAME: jsonOutputPath,
    // Read by the project's own playwright.config.ts. Set, this points
    // baseURL at the server this command started and is holding open across
    // every spec file, and the config's own `reuseExistingServer` is what
    // then makes Playwright skip managing a webServer process of its own.
    ...(baseUrl ? { LOCKER_BASE_URL: baseUrl } : {}),
    // Playwright's TypeScript transform caches under os.tmpdir() by default,
    // which sits outside the workspace an isolated run is confined to write
    // under. Pointed inside the project instead, so a correct run under
    // isolation is not indistinguishable from a run whose cache write was
    // refused.
    PWTEST_CACHE_DIR: path.join(projectRoot, '.tea-atdd-cache'),
    // Deterministic across machines: no color codes to strip out of a message
    // a later scorer pattern-matches against, and no host CI variable reaching
    // the child (see cli/lib/probe-targets.js's own reasoning for the same
    // exclusion): a workflow that reads CI to decide anything would behave
    // differently under this check than it does for the operator who runs it.
    FORCE_COLOR: '0',
    CI: '',
  };
  // Not sandboxed here. Isolation confines a process from the outside, so the
  // caller (test/eval-atdd.js) wraps this whole command's invocation in
  // cli/lib/atdd-isolation.js's sandboxedCommand before it ever starts; by the
  // time this function runs, the process it is already inside is the one
  // being confined, and everything spawnSync starts below inherits that.
  const result = spawnSync(process.execPath, nodeArgs, {
    cwd: projectRoot,
    env,
    encoding: 'utf8',
    timeout: timeoutMs,
  });

  if (!fs.existsSync(jsonOutputPath)) {
    const tail = String(result.stderr || result.stdout || '')
      .trim()
      .split('\n')
      .filter(Boolean)
      .slice(-6)
      .join(' | ');
    return {
      file: relativeFile,
      hadSkipCall,
      loadError: result.error
        ? `spawn failed: ${result.error.message}`
        : result.signal
          ? `killed by ${result.signal}${result.signal === 'SIGTERM' && result.status === null ? ' (timed out)' : ''}`
          : `no JSON report was written (exit ${result.status}); ${tail || 'nothing on stderr'}`,
      tests: [],
    };
  }

  let report;
  try {
    report = JSON.parse(fs.readFileSync(jsonOutputPath, 'utf8'));
  } catch (error) {
    return { file: relativeFile, hadSkipCall, loadError: `the JSON report did not parse: ${error.message}`, tests: [] };
  }

  // A load-time failure (a syntax error, an import that does not resolve) is
  // reported in `errors` and nowhere in `suites`: the file never ran, so there
  // is no per-test result to read.
  if (Array.isArray(report.errors) && report.errors.length > 0) {
    return {
      file: relativeFile,
      hadSkipCall,
      loadError: report.errors.map((entry) => stripAnsi(entry.message ?? entry).split('\n')[0]).join('; '),
      tests: [],
    };
  }

  const tests = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        // `test.status` is Playwright's own reporter-facing summary
        // ("expected"/"unexpected"/"flaky"/"skipped"), which says whether the
        // run matched its own expectation and not what actually happened to
        // it. The last attempt's own status ("passed", "failed", "timedOut",
        // "skipped", "interrupted") is what a scorer needs, because it reads
        // the same four values every Playwright run can produce regardless of
        // what the test declared as `expectedStatus`.
        const last = test.results?.at(-1);
        // The full message, not just its first line: an `expect().toBe()`
        // failure carries "Expected: X" and "Received: Y" on later lines, and
        // that is exactly the text a criterion's declared pattern matches
        // against. Truncating here would keep the generic "Object.is
        // equality" preamble and drop the one thing that says whether the
        // test actually exercised the right value.
        tests.push({
          title: spec.title,
          status: last?.status ?? 'skipped',
          message: last?.error?.message ? stripAnsi(last.error.message) : null,
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);

  return { file: relativeFile, hadSkipCall, loadError: null, tests };
}

/**
 * A GET to `url`, resolving true on any HTTP response and false on a
 * connection error. Used only to poll for readiness; a 404 still means
 * something is listening.
 *
 * @param {string} url
 * @returns {Promise<boolean>}
 */
function respondsOnce(url) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout: 1000 }, (response) => {
      response.resume();
      resolve(true);
    });
    request.on('error', () => resolve(false));
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
  });
}

/**
 * Start the fixture's own server once, for every spec file to share.
 *
 * This exists because Playwright's own `webServer` lifecycle is what a spec
 * file's config declares, and under one isolation backend that lifecycle was
 * measured never completing its own teardown: the started process, and
 * Playwright's own wait for it to end, both sat idle past every wall-clock
 * bound this command declares. Starting the server here and killing it with
 * SIGKILL rather than waiting on it to exit on its own is what a caller
 * controls instead. `reuseExistingServer` in the project's own
 * `playwright.config.ts` is what then makes Playwright skip trying to start
 * or stop a server of its own: it finds one already answering and leaves it
 * alone.
 *
 * `detached: true` makes the spawned shell the leader of its own process
 * group, which is why `stopServer` kills `-child.pid` rather than `child.pid`:
 * the command actually declared, `npm start`, is the shell's own child rather
 * than the shell itself, so killing only the shell's PID leaves that real
 * server process orphaned and still holding the port. Measured live: with a
 * bare `child.kill('SIGKILL')`, the port answered again a second later; with
 * the process-group kill below, it did not.
 *
 * @param {{command: string, cwd: string, env: Record<string,string>, healthUrl: string, timeoutMs: number}} options
 * @returns {Promise<import('node:child_process').ChildProcess>}
 */
async function startServer({ command, cwd, env, healthUrl, timeoutMs }) {
  // Checked before spawning, not just polled after: the readiness loop below
  // treats any response as ready, so a stray process already bound to the port
  // would let the poll succeed while this run's own server failed to bind, and
  // every spec file would then run against whatever that stray process is.
  if (await respondsOnce(healthUrl)) {
    throw new Error(`the fixture server URL is already in use: ${healthUrl}`);
  }
  const child = spawn(command, { cwd, env, shell: true, stdio: 'ignore', detached: true });
  const deadline = Date.now() + timeoutMs;
  let spawnError = null;
  child.once('error', (error) => {
    spawnError = error;
  });
  while (Date.now() < deadline) {
    if (spawnError) throw new Error(`the fixture server failed to start: ${spawnError.message}`);
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`the fixture server exited (code ${child.exitCode}, signal ${child.signalCode}) before answering ${healthUrl}`);
    }
    if (await respondsOnce(healthUrl)) return child;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  stopServer(child);
  throw new Error(`the fixture server did not answer ${healthUrl} within ${timeoutMs}ms`);
}

/** SIGKILL rather than SIGTERM: this command owns the server for its own run and needs it gone, not given a chance to linger. */
function stopServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    // already gone, or the group leader itself is what died
    try {
      child.kill('SIGKILL');
    } catch {
      // already gone
    }
  }
}

async function main(argv) {
  const program = new Command();
  program
    .name('tea-atdd-red-check')
    .description('Activate and execute the red-phase scaffolds under a project, and report what happened.')
    .requiredOption('--project-root <dir>', 'the staged project whose tests/ directory holds the scaffolds')
    .requiredOption('--report <path>', 'where to write the JSON report')
    .option('--test-dir <dir>', 'the scaffold directory, relative to --project-root', 'tests')
    .option('--node-path <dir>', "a node_modules directory to resolve @playwright/test from, ahead of the project's own")
    .option('--per-file-timeout-ms <n>', 'wall-clock bound per spec file', String(15_000))
    .option('--server-command <cmd>', 'command that starts the fixture the scaffolds run against, if this command should manage it')
    .option('--server-health-url <url>', 'a URL that answers once the fixture is ready; required with --server-command')
    .option('--server-start-timeout-ms <n>', 'how long to wait for --server-health-url to answer', String(15_000));

  program.exitOverride();
  try {
    program.parse(argv);
  } catch (error) {
    if (error.exitCode === 0) return;
    fail(error.message);
  }

  const options = program.opts();
  const projectRoot = path.resolve(options.projectRoot);
  if (!fs.existsSync(projectRoot)) fail(`--project-root ${projectRoot} does not exist`);
  const perFileTimeoutMs = Number.parseInt(options.perFileTimeoutMs, 10);
  if (!Number.isInteger(perFileTimeoutMs) || perFileTimeoutMs <= 0) fail('--per-file-timeout-ms must be a positive integer');

  const searchPaths = options.nodePath ? [options.nodePath, projectRoot] : [projectRoot];
  const cliPath = resolvePlaywrightCli(searchPaths);
  const netGuardPath = path.join(__dirname, 'lib', 'atdd-net-guard.cjs');

  const beforeFiles = filesUnder(projectRoot, { skip: [options.testDir, 'test-artifacts', 'test-results'] });
  const beforeDigest = new Map(
    beforeFiles.map((relative) => {
      try {
        return [relative, snapshotFile(path.join(projectRoot, relative))];
      } catch {
        return [relative, null];
      }
    }),
  );

  const specFiles = discoverSpecFiles(projectRoot, options.testDir);
  if (specFiles.length === 0) fail(`no *.spec.ts files found under ${path.join(projectRoot, options.testDir)}`);

  if (options.serverCommand && !options.serverHealthUrl) fail('--server-command requires --server-health-url');
  if (options.serverHealthUrl && !options.serverCommand) fail('--server-health-url requires --server-command');
  let server = null;
  if (options.serverCommand) {
    const startTimeoutMs = Number.parseInt(options.serverStartTimeoutMs, 10);
    if (!Number.isInteger(startTimeoutMs) || startTimeoutMs <= 0) fail('--server-start-timeout-ms must be a positive integer');
    try {
      server = await startServer({
        command: options.serverCommand,
        cwd: projectRoot,
        env: { PATH: process.env.PATH ?? '' },
        healthUrl: options.serverHealthUrl,
        timeoutMs: startTimeoutMs,
      });
    } catch (error) {
      fail(error.message);
    }
  }

  let results;
  try {
    results = specFiles.map((relativeFile) =>
      runOneSpecFile({
        projectRoot,
        relativeFile,
        cliPath,
        nodePathDirectory: options.nodePath ?? projectRoot,
        netGuardPath,
        timeoutMs: perFileTimeoutMs,
        // Playwright's own `reuseExistingServer` (declared in the project's
        // config) is what makes it skip starting or stopping a server of its
        // own once this one already answers `--server-health-url`.
        baseUrl: options.serverHealthUrl ? options.serverHealthUrl.replace(/\/health$/, '') : undefined,
      }),
    );
  } finally {
    stopServer(server);
  }

  const afterFiles = filesUnder(projectRoot, { skip: [options.testDir, 'test-artifacts', 'test-results'] });
  const afterSet = new Set(afterFiles);
  const productionFilesTouched = [];
  for (const relative of new Set([...beforeDigest.keys(), ...afterFiles])) {
    const before = beforeDigest.has(relative) ? beforeDigest.get(relative) : null;
    const after = afterSet.has(relative)
      ? (() => {
          try {
            return snapshotFile(path.join(projectRoot, relative));
          } catch {
            return null;
          }
        })()
      : null;
    if (before !== after) productionFilesTouched.push(relative);
  }
  productionFilesTouched.sort();

  const report = {
    schemaVersion: 1,
    projectRoot,
    testDir: options.testDir,
    specFileCount: specFiles.length,
    productionFilesTouched,
    files: results,
  };

  fs.mkdirSync(path.dirname(path.resolve(options.report)), { recursive: true });
  fs.writeFileSync(options.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`Wrote ${path.relative(projectRoot, path.resolve(options.report))}.\n`);
}

if (require.main === module) {
  main(process.argv).catch((error) => fail(error?.stack ?? error?.message ?? String(error)));
}

module.exports = { discoverSpecFiles, filesUnder, resolvePlaywrightCli, runOneSpecFile, SKIP_CALL, DIGEST_EXCLUDED_DIRECTORIES };
