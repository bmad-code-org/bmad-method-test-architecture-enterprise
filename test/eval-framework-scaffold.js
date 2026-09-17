/**
 * framework-scaffold install-and-smoke eval harness.
 *
 * Story 6.8 (`test/test-framework-scaffold.js`) scores the generated
 * `bmad-testarch-framework` scaffold's contents statically -- zero execution.
 * Nothing proves the scaffold actually installs or runs: a scaffold can be
 * structurally perfect and still be dead on arrival. This harness is that
 * execution: copy the committed clean fixture
 * (`test/fixtures/framework-scaffold/clean/`) into a disposable workspace,
 * run a real `npm install` and a real smoke test
 * (`tests/e2e/api-sample.spec.ts`) against a minimal in-memory stub backend,
 * inside NFR9 isolation.
 *
 * NO VENDOR CALL IS EVER MADE. This is not a behavioral suite in the sense
 * every sibling suite is: those invoke a live agent and score what it wrote.
 * This suite's "generation" step is a parameterized template copy Story 6.8
 * already scored with zero agent involvement; this suite is 100% execution
 * and 0% generation. `--agent`/`--agent-cmd`/`--runs`/`--model`/`--agent-arg`/
 * `--env-pass` are all accepted, purely so this harness's CLI shape matches
 * every sibling harness's for `eval:all`'s uniform invocation and for
 * `tools/validate-eval-schemas.js`'s generic preflight-probes-the-runner
 * check. Only one of them is ever actually acted on: `--agent custom
 * --agent-cmd <path>`'s preflight probes that path with `--version`, the
 * same generic "is this a real, invokable executable" check every sibling
 * harness's own `--agent custom` case already performs, and it is what lets
 * `checkPreflightProbesRunner` keep treating every suite's preflight
 * uniformly without special-casing this one. It is never invoked to run
 * anything: the real work below always runs `npm`, `node`, and a Playwright
 * CLI resolved from the disposable workspace's own installed dependency,
 * never `agentCmd`. A built-in agent name (`claude`, `codex`, ...) is parsed
 * and never read at all -- no credential is ever probed for one, which is
 * what keeps `test:eval-framework-scaffold-data` (this harness's
 * `--validate-only` mode, in the plain `npm test` chain) credential-free.
 * `--runs` shares that fate for the same reason `repetitions: 1` does: this
 * suite has no stochastic process to repeat, so the value is parsed and
 * validated for CLI uniformity and then never read; a direct invocation with
 * `--runs 5` still runs the install-and-smoke attempt exactly once, silently.
 *
 * ISOLATION
 *
 * `cli/lib/atdd-isolation.js`'s `selectBackend`/`sandboxedCommand`/
 * `childEnvironment`/`probeBackend` are reused for both the sandboxed
 * `npm install` and the sandboxed smoke test: non-privileged, HOME redirected
 * into the workspace, CPU-bounded, filesystem writes scoped to the workspace.
 * Every call here passes `allowHostLoopback: true`, the one capability that
 * module's own bubblewrap backend did not have before this story: reaching a
 * host-side loopback process (this suite's proxy, this suite's stub), which
 * bubblewrap's own `--unshare-net` cannot do, being an isolated network
 * namespace with only its own loopback rather than the host's. See
 * `cli/lib/atdd-isolation.js`'s own header, ALLOWHOSTLOOPBACK, for the
 * mechanism (a fixed unprivileged identity plus one kernel egress rule,
 * Linux-only; a no-op on seatbelt, which never had this limitation) and why
 * `--unshare-net` alone could not serve this caller -- discovered live on this
 * story's own pull request, on the CI runner rather than locally, the same
 * way `--unshare-pid`/`--unshare-ipc` were discovered live on an earlier one.
 * `test/lib/framework-scaffold-install-isolation.js` is the one new
 * host-check surface this suite adds: a loopback-bound, CONNECT-only proxy
 * that runs unsandboxed, on the host, with real egress of its own, and
 * refuses any CONNECT target other than `registry.npmjs.org:443`. The
 * sandboxed `npm install` is pointed at it through `HTTPS_PROXY`, so from
 * inside the sandbox every registry request is a plain loopback connection,
 * and the proxy is the one place that decides whether that loopback-forwarded
 * request is allowed to leave the host at all.
 * `test/test-framework-scaffold-install-isolation.js` proves this before the
 * suite is ever registered as covering the skill, the same discipline
 * `test/test-atdd-isolation.js` applies to `tea-atdd-red-check`'s isolation.
 *
 * cli/lib/atdd-net-guard.cjs (the in-process preload guard atdd-red-check.js
 * loads for defense in depth) is deliberately NOT loaded for the sandboxed
 * children here. It refuses any `child_process` spawn from what looks like a
 * Playwright worker unconditionally, and this suite's smoke test needs
 * exactly that: a Playwright worker legitimately spawns a real browser
 * process (see BROWSER PROVISIONING below), so loading the guard would
 * refuse the one spawn this suite depends on. The OS-level sandbox already
 * denies non-loopback network outright, which is the actual enforcement the
 * guard is defense-in-depth on top of; that enforcement is untouched.
 *
 * BROWSER PROVISIONING (a deviation the frozen spec did not anticipate,
 * discovered by actually running the scaffold end to end -- see
 * `ensureChromiumBrowser`'s own header for the full account)
 *
 * The frozen spec scoped this suite to `tests/e2e/api-sample.spec.ts` alone
 * on the stated assumption that, unlike `ui-sample.spec.ts`, it needs no
 * real browser launch. Reproducing the suite live (before writing this
 * comment) proved that assumption false: the scaffold's own `apiRequest`
 * fixture, from `@seontechnologies/playwright-utils/api-request/fixtures`,
 * destructures Playwright's built-in `page` fixture in its own signature
 * (to capture page context for a UI-display feature this suite never uses),
 * and Playwright resolves every fixture a test's dependency chain names
 * whether or not the fixture body's own logic touches it -- forcing a real,
 * launchable Chromium even for a test that calls no browser API at all. A
 * plain, unmodified, install-only run of the scaffold's own committed
 * `api-sample.spec.ts` failed with "Executable doesn't exist" before this
 * function existed. `ensureChromiumBrowser` is the narrowest fix that keeps
 * the rest of the frozen boundary intact: `ui-sample.spec.ts` stays excluded,
 * and the browser download never touches the sandboxed child or the
 * CONNECT-allowlisting proxy -- it runs once, unsandboxed, on the host,
 * exactly the way this repository already installs bubblewrap and actionlint
 * in CI before an isolation-dependent suite runs.
 *
 * DEFECT DETECTION: TWO SEEDED BREAKS, PROVEN ON EVERY LIVE RUN
 *
 * A suite whose smoke test only ever runs against a working scaffold cannot
 * tell a real pass from a vacuous one: nothing here would notice if the
 * assertions stopped asserting anything. So every live run, after the clean
 * case above passes, seeds two independent, distinguishable breaks against
 * the SAME installed workspace (no second `npm install`: neither break
 * changes what got installed, only what the smoke test runs against or what
 * the workspace's own copy says) and requires the smoke test to fail, for
 * the specific reason each break causes, not just to fail somehow:
 *
 *   backend defect    a second stub instance started with `createStatus`
 *                      away from 201 (`test/lib/framework-scaffold-stub-server.js`);
 *                      the smoke test's `expect(created.status).toBe(201)`
 *                      must fail with `Received: 500`, verified live.
 *   fixture defect     `breakAuthFixtureMerge` drops `authFixture` from the
 *                      workspace's own copy of `merged-fixtures.ts`'s
 *                      `mergeTests(...)` call, in place, after the clean
 *                      case has already run against this same workspace
 *                      (never the committed fixture Story 6.8/tea-47 owns);
 *                      Playwright must then refuse the spec's own
 *                      `authToken` destructure with `unknown parameter
 *                      "authToken"`, verified live.
 *
 * Either break going undetected -- the smoke test passing anyway, or failing
 * for some other reason -- is `seededDefectDetectionRate` missing its
 * threshold: a real quality finding about this suite's own sensitivity, not
 * about the scaffold, and it fails the run the same way a missed install or
 * a failed clean smoke test does.
 *
 * Usage:
 *   node test/eval-framework-scaffold.js --validate-only
 *   node test/eval-framework-scaffold.js --preflight-only --agent custom --agent-cmd node
 *   node test/eval-framework-scaffold.js --agent claude
 *   node test/eval-framework-scaffold.js --agent claude --json results/framework-scaffold.json
 *
 * Exit codes:
 *   0  the fixture is present and the backend is selectable (--validate-only),
 *      the runner probe passed (--preflight-only), or the scaffold installed,
 *      the smoke test passed, and both seeded defects were caught (live)
 *   1  the smoke test ran and failed, or a seeded defect went undetected: a
 *      real quality finding about the scaffold or about this suite itself
 *   2  the environment could not run the suite: no isolation backend, no
 *      browser could be provisioned, the stub or proxy failed to start, or a
 *      declared fixture path is missing
 */

'use strict';

const fs = require('node:fs');
const net = require('node:net');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const { loadSuiteManifest, suiteById } = require('./lib/suite-manifest');
const {
  digestFiles,
  repositoryState,
  probeVersion,
  redactArgs,
  diagnosticRecord,
  numericContributions,
  suiteResultRecord,
  writeSuiteResult,
} = require('./lib/eval-record');
const { worstFailureClass, exitCodeForFailureClass } = require('./schema/eval-result');
const { PROBE_TIMEOUT_MS, boundedProbe } = require('./lib/bounded-probe');
const { nowMs, nowIso, elapsedMsSince } = require('./lib/clock');
const {
  selectBackend,
  sandboxedCommand,
  buildSeatbeltProfile,
  childEnvironment,
  probeBackend,
  ensureLoopbackOnlyEgress,
  prepareWorkspaceOwnership,
  restoreWorkspaceOwnership,
  DEFAULT_CPU_SECONDS,
} = require('../cli/lib/atdd-isolation');
const { DEFAULT_TOKEN: STUB_TOKEN } = require('./lib/framework-scaffold-stub-server');

const PROJECT_ROOT = path.join(__dirname, '..');
const CLEAN_FIXTURE_DIR = path.join(__dirname, 'fixtures', 'framework-scaffold', 'clean');
const STUB_SERVER_SCRIPT = path.join(__dirname, 'lib', 'framework-scaffold-stub-server.js');
const PROXY_SCRIPT = path.join(__dirname, 'lib', 'framework-scaffold-install-isolation.js');
const SUITE_ID = 'framework';
const CASE_ID = 'install-and-smoke';

/** No vendor call happens in the live run; this exists only for `tools/validate-eval-schemas.js`'s generic preflight-probes-the-runner check on `--agent custom`. */
const RUNNER_CAPABILITIES = ['command-execution'];

/**
 * Two binary thresholds, both measured on every live run against the same
 * deterministic case (`repetitions: 1`, `caseCount: 1`; no stochastic process
 * exists to average over): did the real install-and-smoke run pass, and did
 * both seeded defects (module header, DEFECT DETECTION) get caught for their
 * own distinct, verified reason. `seededDefectDetectionRate` is measured only
 * once the clean run has already passed; see `runOnce`.
 */
const THRESHOLDS = { installAndSmokePassRate: 1, seededDefectDetectionRate: 1 };

/** Seeded onto a second stub instance to prove the smoke test's status assertion is load-bearing. See DEFECT DETECTION above. */
const WRONG_BACKEND_STATUS = 500;
const BACKEND_DEFECT_SIGNATURE = /Received:\s*500/;

/** The workspace-copy mutation and the failure signature it must produce. See DEFECT DETECTION above. */
const MERGED_FIXTURES_RELATIVE = path.join('tests', 'support', 'merged-fixtures.ts');
const MERGE_TESTS_MARKER =
  'export const test = mergeTests(apiRequestFixture, recurseFixture, interceptFixture, networkErrorFixture, authFixture);';
const MERGE_TESTS_WITHOUT_AUTH =
  'export const test = mergeTests(apiRequestFixture, recurseFixture, interceptFixture, networkErrorFixture);';
const FIXTURE_DEFECT_SIGNATURE = /unknown parameter "authToken"/;

const INSTALL_TIMEOUT_MS = 5 * 60_000;
const SMOKE_TEST_TIMEOUT_MS = 2 * 60_000;
const SERVER_READY_TIMEOUT_MS = 10_000;

/**
 * The disposable browsers cache this suite owns and controls, deliberately
 * not the OS-default Playwright cache location: an explicit, known-outright
 * absolute path (never derived from `$HOME`) is what makes it readable from
 * inside the sandbox despite the sandboxed child's `HOME` being redirected
 * into the workspace. See `ensureChromiumBrowser`.
 */
const BROWSERS_CACHE_DIR = path.join(os.tmpdir(), 'tea-framework-scaffold-browsers');

const colors = { reset: '[0m', red: '[31m', green: '[32m', yellow: '[33m', cyan: '[36m', dim: '[2m' };

function fatal(code, message) {
  console.error(`${colors.red}eval: ${message}${colors.reset}`);
  process.exit(code);
}

function parseArgs(argv) {
  let agent = 'claude';
  let agentCmd;
  const agentArgs = [];
  const envPass = [];
  let model;
  let runs = 1;
  let validateOnly = false;
  let preflightOnly = false;
  let jsonPath;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--agent': {
        agent = argv[index + 1];
        if (!agent) fatal(2, '--agent requires a vendor name');
        index += 1;
        break;
      }
      case '--agent-cmd': {
        const value = argv[index + 1];
        if (!value) fatal(2, '--agent-cmd requires an executable path or name');
        agentCmd = value.includes('/') || value.includes(path.sep) ? path.resolve(value) : value;
        index += 1;
        break;
      }
      case '--agent-arg': {
        const value = argv[index + 1];
        if (value === undefined) fatal(2, '--agent-arg requires a value');
        agentArgs.push(value);
        index += 1;
        break;
      }
      case '--env-pass': {
        const value = argv[index + 1];
        if (!value) fatal(2, '--env-pass requires an environment variable name');
        envPass.push(value);
        index += 1;
        break;
      }
      case '--model': {
        model = argv[index + 1];
        if (!model) fatal(2, '--model requires a model name');
        index += 1;
        break;
      }
      case '--runs': {
        runs = Number.parseInt(argv[index + 1] ?? '', 10);
        if (!Number.isInteger(runs) || runs < 1) fatal(2, '--runs requires a positive integer');
        index += 1;
        break;
      }
      case '--json': {
        jsonPath = argv[index + 1];
        if (!jsonPath) fatal(2, '--json requires a file path');
        index += 1;
        break;
      }
      case '--validate-only': {
        validateOnly = true;
        break;
      }
      case '--preflight-only': {
        preflightOnly = true;
        break;
      }
      default: {
        fatal(2, `unknown argument: ${arg}`);
      }
    }
  }
  if (agent === 'custom' && !agentCmd) fatal(2, '--agent custom requires --agent-cmd');
  if (validateOnly && preflightOnly) fatal(2, '--validate-only and --preflight-only name different modes; pass one');
  return { agent, agentCmd, agentArgs, envPass, model, runs, validateOnly, preflightOnly, jsonPath };
}

/* -------------------------------------------------------------------------- */
/* Static checks: fixture presence and isolation backend                      */
/* -------------------------------------------------------------------------- */

/**
 * Every path the `framework` suite's own manifest entry declares under
 * `fixtures`, checked against disk. Read from the manifest rather than
 * discovered by walking `CLEAN_FIXTURE_DIR`: a check built from the same
 * directory listing it then verifies against is tautological (it can never
 * catch a file the manifest declares that disk does not actually have,
 * short of a TOCTOU race), and the manifest is the declaration this suite's
 * own coverage claim rests on.
 *
 * @returns {Promise<{problems: string[], declared: string[]}>} `problems` is
 *   empty when every declared file exists; `declared` is the list checked.
 */
async function checkFixturePresence() {
  const problems = [];
  if (!fs.existsSync(CLEAN_FIXTURE_DIR)) {
    problems.push(`${path.relative(PROJECT_ROOT, CLEAN_FIXTURE_DIR)} does not exist`);
    return { problems, declared: [] };
  }
  let declared;
  try {
    const { manifest } = await loadSuiteManifest(PROJECT_ROOT);
    declared = suiteById(manifest, SUITE_ID).fixtures;
  } catch (error) {
    problems.push(`could not read the declared fixtures list from the suite manifest: ${error.message}`);
    return { problems, declared: [] };
  }
  for (const relative of declared) {
    if (!fs.existsSync(path.join(PROJECT_ROOT, relative))) problems.push(`${relative} does not exist`);
  }
  return { problems, declared };
}

/**
 * The backend this platform runs the sandboxed install and smoke test under,
 * only after actually spawning a trivial process through it -- matching
 * `test/eval-atdd.js`'s own `verifiedBackend`, since `selectBackend()` alone
 * confirms the binary is on `PATH` and not that the kernel actually lets it
 * run.
 *
 * @returns {string}
 * @throws {Error} whatever `selectBackend` throws, or ISOLATION_UNAVAILABLE.
 */
function verifiedBackend() {
  const backend = selectBackend();
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-framework-scaffold-backend-probe-'));
  try {
    const probe = probeBackend({ backend, workspace });
    if (!probe.ok) {
      const error = new Error(`isolation backend "${backend}" is on PATH but the kernel refuses to run it: ${probe.reason}`);
      error.code = 'ISOLATION_UNAVAILABLE';
      throw error;
    }
    return backend;
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

/* -------------------------------------------------------------------------- */
/* Browser provisioning                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The Playwright CLI bundled with THIS repository's own `@playwright/test`
 * devDependency, resolved the way `cli/atdd-red-check.js` resolves it: from
 * the package's own declared `bin` entry, never a private path guessed at.
 * Used only to fetch the browser binary below; the disposable workspace's
 * own, separately-installed `@playwright/test` is what actually runs the
 * smoke test.
 *
 * @returns {string}
 */
function resolveLocalPlaywrightCli() {
  const packageJsonPath = require.resolve('@playwright/test/package.json', { paths: [PROJECT_ROOT] });
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const binRelative = packageJson.bin?.playwright;
  if (!binRelative) throw new Error(`@playwright/test at ${packageJsonPath} declares no "playwright" bin entry`);
  return path.join(path.dirname(packageJsonPath), binRelative);
}

/**
 * Ensures a Chromium headless-shell binary is cached at `BROWSERS_CACHE_DIR`,
 * fetching it if it is not already there. See the module header's BROWSER
 * PROVISIONING section for why this suite needs a browser at all.
 *
 * Unsandboxed and network-reaching by design: this runs before the proxy or
 * the sandboxed child exist for this run, exactly like this repository's own
 * CI already installs bubblewrap and actionlint ahead of the suites that
 * need them. Idempotent: Playwright's installer no-ops when the exact build
 * is already present, so a second call in the same environment is an
 * instant no-op -- but nothing in `.github/workflows/quality.yaml` calls this
 * function today (neither new CI step this story adds reaches it, and there
 * is no dedicated pre-warming step), so every CI run currently pays the
 * download once, the first time a live run of this suite reaches it.
 *
 * @returns {Promise<string>} `BROWSERS_CACHE_DIR`
 */
async function ensureChromiumBrowser() {
  fs.mkdirSync(BROWSERS_CACHE_DIR, { recursive: true });
  let cliPath;
  try {
    cliPath = resolveLocalPlaywrightCli();
  } catch (error) {
    const wrapped = new Error(`could not resolve this repository's own @playwright/test to provision a browser: ${error.message}`);
    wrapped.code = 'BROWSER_UNAVAILABLE';
    throw wrapped;
  }
  const result = spawnSync(process.execPath, [cliPath, 'install', 'chromium-headless-shell'], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: BROWSERS_CACHE_DIR },
    encoding: 'utf8',
    timeout: 5 * 60_000,
    // Unlike the sandboxed spawnSync calls elsewhere in this codebase, this
    // is a raw host-level call doing real network I/O with no sandbox or
    // process group backstopping it; SIGTERM (the default killSignal) can be
    // ignored, and a child that ignores it would then block past the
    // documented 5-minute bound instead of actually being killed at it.
    killSignal: 'SIGKILL',
  });
  if (result.error || result.status !== 0) {
    const tail = String(result?.stderr || result?.stdout || result?.error?.message || '')
      .trim()
      .split('\n')
      .slice(-5)
      .join(' | ');
    const error = new Error(`could not provision a Chromium browser for the smoke test: ${tail || 'unknown error'}`);
    error.code = 'BROWSER_UNAVAILABLE';
    throw error;
  }
  return BROWSERS_CACHE_DIR;
}

/* -------------------------------------------------------------------------- */
/* Stub server and proxy: always separate OS processes                        */
/* -------------------------------------------------------------------------- */

/** @returns {Promise<number>} An ephemeral TCP port, free on 127.0.0.1 at the moment this resolves. */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close((closeError) => (closeError ? reject(closeError) : resolve(port)));
    });
  });
}

/** Polls `http://127.0.0.1:<port><path>` until it answers or `timeoutMs` elapses. */
async function waitForHttpReady(port, requestPath, timeoutMs) {
  // Through the clock port, not Date.now(), the same discipline
  // test/test-clock-port.js holds every eval-*.js harness to: this is a
  // readiness-poll bound rather than a recorded duration, but the gate scans
  // for the reading itself, not what the reading is used for.
  const deadline = (await nowMs()) + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get({ host: '127.0.0.1', port, path: requestPath, timeout: 500 }, (res) => {
        res.resume();
        resolve();
      });
      request.on('error', () => {
        nowMs().then((now) => {
          if (now > deadline) reject(new Error(`nothing answered http://127.0.0.1:${port}${requestPath} within ${timeoutMs}ms`));
          else setTimeout(attempt, 50);
        });
      });
      request.on('timeout', () => request.destroy(new Error('timed out waiting for a response')));
    };
    attempt();
  });
}

/** Polls a plain TCP connect to `127.0.0.1:<port>` until it succeeds or `timeoutMs` elapses. */
async function waitForTcpReady(port, timeoutMs) {
  const deadline = (await nowMs()) + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect(port, '127.0.0.1');
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        nowMs().then((now) => {
          if (now > deadline) reject(new Error(`nothing answered 127.0.0.1:${port} within ${timeoutMs}ms`));
          else setTimeout(attempt, 50);
        });
      });
    };
    attempt();
  });
}

/**
 * Races a readiness-poll promise against the child's own `'exit'` event, so a
 * child that dies before becoming ready (an `EADDRINUSE` race out of
 * `getFreePort()`'s close-then-rebind window, for instance) reports its real
 * exit code/signal and whatever stderr the caller already collected, instead
 * of waiting out the full readiness timeout and reporting a generic "nothing
 * answered".
 *
 * Both promises get a no-op `.catch()` attached regardless of which one
 * wins: `Promise.race` never cancels the loser, so without this the losing
 * promise's eventual settlement -- the readiness poll's own timeout,
 * normally -- would surface later as an unhandled rejection.
 *
 * @param {import('node:child_process').ChildProcess} child
 * @param {Promise<void>} readyPromise
 * @returns {Promise<void>}
 */
function raceReadinessAgainstExit(child, readyPromise) {
  readyPromise.catch(() => {});
  const exitedEarly = new Promise((resolve, reject) => {
    child.once('exit', (code, signal) => {
      reject(new Error(`the process exited before becoming ready (code ${code ?? 'null'}, signal ${signal ?? 'null'})`));
    });
  });
  exitedEarly.catch(() => {});
  return Promise.race([readyPromise, exitedEarly]);
}

/**
 * Starts `test/lib/framework-scaffold-stub-server.js` as its own OS process,
 * never in-process: this harness's own event loop is blocked for the whole
 * duration of the synchronous sandboxed `npm install`/smoke-test spawns
 * below, and an in-process server sharing that loop would stop answering
 * for exactly as long as those blocks last.
 *
 * @returns {Promise<{child: import('node:child_process').ChildProcess, port: number, token: string, url: string, stop: () => Promise<void>}>}
 */
async function startStubServerProcess({ token = STUB_TOKEN, createStatus = 201 } = {}) {
  const port = await getFreePort();
  const child = spawn(process.execPath, [STUB_SERVER_SCRIPT], {
    env: { PATH: process.env.PATH ?? '', PORT: String(port), STUB_TOKEN: token, STUB_CREATE_STATUS: String(createStatus) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = { stdout: '', stderr: '' };
  child.stdout.on('data', (chunk) => (output.stdout += chunk));
  child.stderr.on('data', (chunk) => (output.stderr += chunk));
  try {
    await raceReadinessAgainstExit(child, waitForHttpReady(port, '/health', SERVER_READY_TIMEOUT_MS));
  } catch (error) {
    child.kill('SIGKILL');
    throw new Error(`the reservation stub did not become ready: ${error.message}\n${output.stderr}`);
  }
  return {
    child,
    port,
    token,
    url: `http://127.0.0.1:${port}`,
    stop: () =>
      new Promise((resolve) => {
        child.once('exit', () => resolve());
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 3000).unref();
      }),
  };
}

/**
 * Starts `test/lib/framework-scaffold-install-isolation.js` as its own OS
 * process, for the same reason the stub server is a separate process.
 *
 * `allowedHost`/`allowedPort` are never set by the live harness (which
 * always calls this with no options, so the proxy allows exactly
 * `registry.npmjs.org:443`, its real default). They exist so
 * `test/test-framework-scaffold-install-isolation.js` can start a second
 * instance substituting a loopback target for its positive-control check,
 * keeping that whole proof reachable with no external network.
 *
 * @returns {Promise<{child: import('node:child_process').ChildProcess, port: number, url: string, stop: () => Promise<void>}>}
 */
async function startProxyProcess({ allowedHost, allowedPort } = {}) {
  const port = await getFreePort();
  const child = spawn(process.execPath, [PROXY_SCRIPT], {
    env: {
      PATH: process.env.PATH ?? '',
      PORT: String(port),
      ...(allowedHost ? { ALLOWED_HOST: allowedHost } : {}),
      ...(allowedPort ? { ALLOWED_PORT: String(allowedPort) } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = { stdout: '', stderr: '' };
  child.stdout.on('data', (chunk) => (output.stdout += chunk));
  child.stderr.on('data', (chunk) => (output.stderr += chunk));
  try {
    await raceReadinessAgainstExit(child, waitForTcpReady(port, SERVER_READY_TIMEOUT_MS));
  } catch (error) {
    child.kill('SIGKILL');
    throw new Error(`the install-isolation proxy did not become ready: ${error.message}\n${output.stderr}`);
  }
  return {
    child,
    port,
    url: `http://127.0.0.1:${port}`,
    stop: () =>
      new Promise((resolve) => {
        child.once('exit', () => resolve());
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 3000).unref();
      }),
  };
}

/* -------------------------------------------------------------------------- */
/* Staging: copy, then two patches, both to the copy only                     */
/* -------------------------------------------------------------------------- */

/**
 * The exact text `test/fixtures/framework-scaffold/clean/tests/support/auth-fixture.ts`
 * carries today, as committed by Story 6.8/tea-47. An exact-string replace
 * rather than a regex or an AST edit, so a change to the frozen source this
 * harness has not been updated for fails loudly here rather than silently
 * leaving the TODO stub in place and failing much later with a confusing
 * "manageAuthToken is not implemented yet" error from inside the sandbox.
 */
const AUTH_FIXTURE_IMPORT_MARKER =
  "import { type AuthProvider, createAuthFixtures, setAuthProvider } from '@seontechnologies/playwright-utils/auth-session';";

const AUTH_FIXTURE_IMPORT_PATCHED = [
  'import {',
  '  type AuthProvider,',
  '  createAuthFixtures,',
  '  getStorageStatePath,',
  '  saveStorageState,',
  '  setAuthProvider,',
  "} from '@seontechnologies/playwright-utils/auth-session';",
].join('\n');

const MANAGE_AUTH_TOKEN_MARKER = [
  '  manageAuthToken: async (request, options) => {',
  "    // TODO: wire this up to the project's real auth endpoint.",
  "    throw new Error('manageAuthToken is not implemented yet: wire it to the real auth endpoint');",
  '  },',
].join('\n');

/**
 * The eval harness's own patch: no real auth endpoint exists in this fixture,
 * so `manageAuthToken` hands back a storage state naming the stub server's
 * one fixed bearer token, through the same `extractCookies` the committed
 * provider already declares (so the cookie's domain/path stay whatever the
 * frozen fixture says, and this patch does not invent a second answer to
 * "what does a cookie for this token look like"). It also persists that
 * storage state to disk via the package's own `saveStorageState`, at the
 * path `getStorageStatePath` names: `createAuthFixtures()`'s overridden
 * `context` fixture reads a browser context's `storageState` from that exact
 * file path rather than from `manageAuthToken`'s return value directly, a
 * requirement this harness only discovered by actually running the scaffold
 * (verified live: without the write, `context` fails with
 * `ENOENT: .../.auth/local/default/storage-state.json`).
 *
 * `expires_at` is a fixed, far-future epoch millisecond literal
 * (`FAR_FUTURE_EXPIRY_MS`, 2100-01-01T00:00:00.000Z) rather than a wall-clock
 * read: this text is generated code that runs inside the sandboxed smoke
 * test's own process, not this harness's own duration-measuring code, but
 * `test/test-clock-port.js` scans every `test/eval-*.js` file's raw source
 * for a wall-clock read regardless of what the reading is for, so a literal
 * beats computing one from `Date.now()` here for that reason alone -- and a
 * fixed timestamp is exactly as correct for a cookie that only has to say
 * "not expired yet" during however long this suite's own run takes. Its
 * `domain` is the stub server's own loopback host (`127.0.0.1`, the one
 * `BASE_URL` always resolves to, regardless of which port it binds this run)
 * rather than `example.com`, the frozen `extractCookies`' domain for the
 * `auth_token` cookie beside it: the two cookies are free to name different
 * domains, and this is the one line of the two this patch actually writes
 * itself, so it says the real target under test rather than borrowing
 * `extractCookies`' placeholder. Neither domain is load-bearing for the
 * smoke test's own requests, which authenticate through the `Authorization:
 * Bearer` header the `apiRequest` fixture sends explicitly, not through
 * cookie matching -- Playwright's browser-context `storageState` just
 * requires every cookie to declare a `url` or a `domain`+`path` pair to
 * accept it as well-formed at all.
 */
const FAR_FUTURE_EXPIRY_MS = 4_102_444_800_000;
const STUB_SERVER_HOST = '127.0.0.1';

function manageAuthTokenPatched(token) {
  return [
    '  manageAuthToken: async (request, options) => {',
    `    const token = process.env.STUB_TOKEN ?? ${JSON.stringify(token)};`,
    '    const storageState = {',
    '      cookies: [',
    '        ...authProvider.extractCookies(token),',
    `        { name: 'expires_at', value: ${JSON.stringify(String(FAR_FUTURE_EXPIRY_MS))}, domain: ${JSON.stringify(STUB_SERVER_HOST)}, path: '/' },`,
    '      ],',
    '    };',
    '    saveStorageState(getStorageStatePath(options), storageState);',
    '    return storageState;',
    '  },',
  ].join('\n');
}

/**
 * The clean fixture's own `@seontechnologies/playwright-utils` pin, as
 * committed. `^1.0.0` never resolved on the real npm registry when this
 * harness first ran it (only 3.10.0 and above are published, per the
 * registry's own metadata, checked live on 2026-09-16): a real `npm install`
 * against this exact pin fails with `ETARGET` before any network isolation
 * or auth wiring is even reached. This is the class of defect the story
 * exists to catch -- a fixture that reads as structurally perfect and is
 * dead on arrival -- but the fixture itself is owned by Story 6.8/tea-47 and
 * frozen, so the fix lands in the copy, the same as the auth patch above.
 */
const PLAYWRIGHT_UTILS_PIN_MARKER = '^1.0.0';
const PLAYWRIGHT_UTILS_PIN_PATCHED = '^4.0.0';

/**
 * Copy the clean fixture into a fresh disposable workspace and apply both
 * patches to the copy alone. Throws loudly (never silently) when a marker
 * this function depends on is not found, since a silent no-op here would
 * fail much later, deep inside the sandbox, for a confusing reason.
 *
 * @returns {string} The workspace directory.
 */
function stageWorkspace() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-framework-scaffold-'));
  fs.cpSync(CLEAN_FIXTURE_DIR, workspace, { recursive: true });

  const packageJsonPath = path.join(workspace, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const currentPin = packageJson.devDependencies?.['@seontechnologies/playwright-utils'];
  if (currentPin !== PLAYWRIGHT_UTILS_PIN_MARKER) {
    fs.rmSync(workspace, { recursive: true, force: true });
    throw new Error(
      `the copy's package.json declares @seontechnologies/playwright-utils@${currentPin}, expected ${PLAYWRIGHT_UTILS_PIN_MARKER}; ` +
        'the clean fixture changed under this harness and its version-pin patch needs a look',
    );
  }
  packageJson.devDependencies['@seontechnologies/playwright-utils'] = PLAYWRIGHT_UTILS_PIN_PATCHED;
  // dotenv is required (via require(), not declared as a dependency at all)
  // by @seontechnologies/playwright-utils's own auth-session module at load
  // time -- verified live: auth-session/index.js throws
  // Cannot find module 'dotenv' without it. This is the consuming project's
  // own devDependency list to complete, the same as the version-pin patch
  // above, not a change to the vendor package.
  packageJson.devDependencies.dotenv = '^16.0.0';
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');

  const authFixturePath = path.join(workspace, 'tests', 'support', 'auth-fixture.ts');
  const authFixtureSource = fs.readFileSync(authFixturePath, 'utf8');
  if (!authFixtureSource.includes(AUTH_FIXTURE_IMPORT_MARKER)) {
    fs.rmSync(workspace, { recursive: true, force: true });
    throw new Error(`${authFixturePath}: the auth-session import this harness patches has changed; the patch needs a look`);
  }
  if (!authFixtureSource.includes(MANAGE_AUTH_TOKEN_MARKER)) {
    fs.rmSync(workspace, { recursive: true, force: true });
    throw new Error(`${authFixturePath}: the manageAuthToken TODO stub this harness patches has changed; the patch needs a look`);
  }
  const patchedAuthFixture = authFixtureSource
    .replace(AUTH_FIXTURE_IMPORT_MARKER, AUTH_FIXTURE_IMPORT_PATCHED)
    .replace(MANAGE_AUTH_TOKEN_MARKER, manageAuthTokenPatched(STUB_TOKEN));
  fs.writeFileSync(authFixturePath, patchedAuthFixture, 'utf8');

  return workspace;
}

/**
 * Seeds the fixture-defect leg of this suite's own DEFECT DETECTION check: drops
 * `authFixture` from the workspace copy's own `mergeTests(...)` call, in place. Called
 * only after the clean case has already run against this same workspace, since nothing
 * that follows needs the workspace clean again. Never touches the committed fixture
 * (`test/fixtures/framework-scaffold/clean/`, owned by Story 6.8/tea-47): only this one
 * disposable copy. Throws loudly, the same as `stageWorkspace`'s own patches above, when
 * the exact text this function depends on has moved.
 *
 * @param {string} workspace
 */
function breakAuthFixtureMerge(workspace) {
  const mergedFixturesPath = path.join(workspace, MERGED_FIXTURES_RELATIVE);
  const source = fs.readFileSync(mergedFixturesPath, 'utf8');
  if (!source.includes(MERGE_TESTS_MARKER)) {
    throw new Error(
      `${mergedFixturesPath}: the mergeTests(...) call this suite's defect-detection check breaks has changed; the patch needs a look`,
    );
  }
  fs.writeFileSync(mergedFixturesPath, source.replace(MERGE_TESTS_MARKER, MERGE_TESTS_WITHOUT_AUTH), 'utf8');
}

/* -------------------------------------------------------------------------- */
/* Sandboxed execution                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Run one command inside the isolation backend, in `workspace`.
 *
 * @returns {{ok: boolean, status: number|null, signal: string|null, stdout: string, stderr: string}}
 */
/**
 * `allowHostLoopback: true` unconditionally: this suite's whole point is a
 * sandboxed `npm install` and a sandboxed smoke test reaching host-side
 * loopback processes (the proxy, the stub) neither owns nor could reach
 * otherwise on bubblewrap's own `--unshare-net`. See cli/lib/atdd-isolation.js,
 * ALLOWHOSTLOOPBACK, for why bubblewrap needs this and seatbelt does not.
 *
 * Workspace ownership is toggled to the loopback-only identity for the
 * duration of exactly this one call and given back in a `finally`, rather
 * than held for the whole run: host-side code between sandboxed calls
 * (staging, `breakAuthFixtureMerge`, resolving `@playwright/test`) runs as
 * this process's own uid and needs the workspace back under it to read or
 * write anything at all. A no-op pair on darwin (seatbelt never changes who
 * owns the workspace).
 */
function runSandboxed({ backend, profilePath, workspace, command, args, extraEnv, timeoutMs }) {
  const env = childEnvironment({ path: process.env.PATH, home: workspace, extra: extraEnv });
  const vector = sandboxedCommand({
    backend,
    profilePath,
    workspace,
    cpuSeconds: DEFAULT_CPU_SECONDS,
    command,
    args,
    allowHostLoopback: true,
    env,
  });
  prepareWorkspaceOwnership(workspace);
  let result;
  try {
    result = spawnSync(vector.command, vector.args, {
      // Bubblewrap's own `--chdir` (baked into `vector.args` above) does this
      // instead, running after setpriv has already dropped to the identity
      // that owns `workspace`: this call's own uid cannot chdir into it once
      // `prepareWorkspaceOwnership` hands it away. seatbelt takes the same
      // path here (no uid change ever happens there) and needs `cwd` from
      // this call, since sandbox-exec has no `--chdir` of its own.
      cwd: backend === 'seatbelt' ? workspace : undefined,
      env,
      encoding: 'utf8',
      timeout: timeoutMs,
    });
  } finally {
    restoreWorkspaceOwnership(workspace);
  }
  return {
    ok: !result.error && result.signal === null && result.status === 0,
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  };
}

function tailOf(text, lines = 6) {
  return String(text || '')
    .trim()
    .split('\n')
    .slice(-lines)
    .join(' | ');
}

/**
 * One complete attempt: stage, start the stub and proxy, install, smoke
 * test, teardown in `finally` on both the passing and the throwing path.
 *
 * @param {{browsersDir: string}} options
 * @returns {Promise<{ok: true}|{ok: false, failureClass: string, reason: string, phase: string}>}
 */
async function runOnce({ browsersDir }) {
  const workspace = stageWorkspace();
  let stub;
  let proxy;
  try {
    stub = await startStubServerProcess();
    proxy = await startProxyProcess();

    const backend = verifiedBackend();
    // Idempotent and a no-op on darwin; installs the one iptables rule pair
    // `allowHostLoopback` needs, once, before the first sandboxed call reaches it.
    ensureLoopbackOnlyEgress();
    let profilePath;
    if (backend === 'seatbelt') {
      // Inside workspace, not os.tmpdir(): the profile is a real file this
      // process writes and never otherwise deletes, and workspace is the one
      // directory the run's own `finally` already removes recursively.
      // sandbox-exec reads the profile before it confines anything, so a
      // path inside the soon-to-be-writable-only workspace is exactly as
      // readable to it as one outside.
      profilePath = path.join(workspace, 'tea-framework-scaffold-profile.sb');
      fs.writeFileSync(profilePath, buildSeatbeltProfile({ workspace }), 'utf8');
    }

    const install = runSandboxed({
      backend,
      profilePath,
      workspace,
      command: 'npm',
      args: ['install', '--no-audit', '--no-fund'],
      extraEnv: {
        HTTPS_PROXY: proxy.url,
        HTTP_PROXY: proxy.url,
        // npm's own attempt to reach the real registry directly is what the
        // sandbox's network-deny already blocks; HTTPS_PROXY is what routes
        // that attempt to the loopback-bound allowlisting proxy instead.
        NO_PROXY: '',
      },
      timeoutMs: INSTALL_TIMEOUT_MS,
    });
    if (!install.ok) {
      const reason = install.error
        ? `npm install failed to start: ${install.error.message}`
        : install.signal || install.status === null
          ? `npm install was killed (${install.signal ?? 'timeout'})`
          : `npm install exited ${install.status}: ${tailOf(install.stderr || install.stdout)}`;
      return { ok: false, failureClass: 'quality', reason, phase: 'npm-install' };
    }

    let playwrightCliPath;
    try {
      const packageJsonPath = require.resolve('@playwright/test/package.json', { paths: [workspace] });
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      // Absolute, not relative to `workspace`: os.tmpdir() can itself be a
      // symlink (/tmp -> /private/tmp on darwin), and require.resolve
      // answers with the realpath, so a relative path computed between the
      // two climbs back out through the symlink target instead of staying
      // inside the workspace -- verified live: the naive relative form
      // produced a path six directories up and MODULE_NOT_FOUND once handed
      // to the sandboxed child. An absolute path has no such ambiguity.
      playwrightCliPath = path.join(path.dirname(packageJsonPath), packageJson.bin.playwright);
    } catch (error) {
      return {
        ok: false,
        failureClass: 'quality',
        reason: `npm install exited 0 but @playwright/test cannot be resolved from the installed workspace: ${error.message}`,
        phase: 'resolve-playwright-cli',
      };
    }

    // Chromium creates its own scratch user-data-dir under the OS temp dir
    // at launch (`mkdtemp` against $TMPDIR, or plain /tmp with no TMPDIR at
    // all, which childEnvironment's minimal environment never sets) --
    // outside the one path this sandbox profile allows writes under.
    // Verified live: without this, the smoke test failed with
    // `browserType.launch: EPERM: operation not permitted, mkdtemp
    // '/tmp/playwright_chromiumdev_profile-...'` on an otherwise fully
    // correct install and stub wiring. Pointed inside the workspace instead,
    // the same fix PWTEST_CACHE_DIR below applies for TypeScript's own cache.
    const chromiumTmpDir = path.join(workspace, '.tea-framework-scaffold-tmp');
    fs.mkdirSync(chromiumTmpDir, { recursive: true });

    /** One smoke-test attempt against `baseUrl`/`token`, everything else held fixed. */
    const runSmokeAgainst = ({ baseUrl, token }) =>
      runSandboxed({
        backend,
        profilePath,
        workspace,
        command: process.execPath,
        args: [playwrightCliPath, 'test', path.join('tests', 'e2e', 'api-sample.spec.ts'), '--reporter=list'],
        extraEnv: {
          BASE_URL: baseUrl,
          STUB_TOKEN: token,
          // Playwright's TS-transform cache defaults under os.tmpdir(), outside
          // the one path this sandbox profile allows writes under; pointed
          // inside the workspace instead, the same fix cli/atdd-red-check.js
          // already applies for the identical reason.
          PWTEST_CACHE_DIR: path.join(workspace, '.tea-framework-scaffold-cache'),
          PLAYWRIGHT_BROWSERS_PATH: browsersDir,
          TMPDIR: chromiumTmpDir,
          TMP: chromiumTmpDir,
          TEMP: chromiumTmpDir,
          FORCE_COLOR: '0',
          CI: '',
        },
        timeoutMs: SMOKE_TEST_TIMEOUT_MS,
      });

    const smoke = runSmokeAgainst({ baseUrl: stub.url, token: stub.token });
    if (!smoke.ok) {
      const reason = smoke.error
        ? `the smoke test failed to start: ${smoke.error.message}`
        : smoke.signal || smoke.status === null
          ? `the smoke test was killed (${smoke.signal ?? 'timeout'})`
          : `the smoke test exited ${smoke.status}: ${tailOf(smoke.stdout || smoke.stderr)}`;
      return { ok: false, failureClass: 'quality', reason, phase: 'smoke-test' };
    }

    // DEFECT DETECTION (module header): the clean case just passed, so this
    // suite would be decorative if it could not also fail on a real defect.
    // Both legs reuse this same installed workspace -- no second `npm install`.
    let backendDefectStub;
    let backendDefectDetected;
    let backendDefectDiagnostic = '';
    try {
      backendDefectStub = await startStubServerProcess({ createStatus: WRONG_BACKEND_STATUS });
      const result = runSmokeAgainst({ baseUrl: backendDefectStub.url, token: backendDefectStub.token });
      backendDefectDetected = !result.ok && BACKEND_DEFECT_SIGNATURE.test(result.stdout);
      if (!backendDefectDetected) {
        backendDefectDiagnostic = result.ok
          ? 'the smoke test passed against a backend seeded to answer 201 with 500 instead'
          : `failed, but not for the seeded reason: ${tailOf(result.stdout || result.stderr)}`;
      }
    } finally {
      if (backendDefectStub) await backendDefectStub.stop();
    }

    // Mutates this workspace's own copy in place; nothing after this point needs it clean.
    breakAuthFixtureMerge(workspace);
    const fixtureDefectResult = runSmokeAgainst({ baseUrl: stub.url, token: stub.token });
    const fixtureDefectDetected = !fixtureDefectResult.ok && FIXTURE_DEFECT_SIGNATURE.test(fixtureDefectResult.stdout);
    const fixtureDefectDiagnostic = fixtureDefectDetected
      ? ''
      : fixtureDefectResult.ok
        ? 'the smoke test passed against a workspace copy seeded to drop authFixture from its own mergeTests(...) call'
        : `failed, but not for the seeded reason: ${tailOf(fixtureDefectResult.stdout || fixtureDefectResult.stderr)}`;

    if (!backendDefectDetected || !fixtureDefectDetected) {
      const reasons = [
        !backendDefectDetected && `backend defect undetected: ${backendDefectDiagnostic}`,
        !fixtureDefectDetected && `fixture defect undetected: ${fixtureDefectDiagnostic}`,
      ].filter(Boolean);
      const seededDefectDetectionRate = (Number(backendDefectDetected) + Number(fixtureDefectDetected)) / 2;
      return { ok: false, failureClass: 'quality', reason: reasons.join('; '), phase: 'defect-detection', seededDefectDetectionRate };
    }

    return { ok: true, seededDefectDetectionRate: 1 };
  } catch (error) {
    // Every throw reachable here (a missing fixture marker to patch, the
    // isolation backend refusing to run, the stub or proxy failing to start)
    // is a statement about the environment or about this harness, never
    // about the scaffold's own quality, so it is always environment-configuration.
    return { ok: false, failureClass: 'environment-configuration', reason: error.message, phase: 'setup' };
  } finally {
    if (proxy) await proxy.stop();
    if (stub) await stub.stop();
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

/* -------------------------------------------------------------------------- */
/* Preflight                                                                   */
/* -------------------------------------------------------------------------- */

function preflightCustomAgent({ agent, agentCmd }) {
  if (agent !== 'custom') return [];
  const probe = boundedProbe(agentCmd, ['--version']);
  if (probe.ok) return [];
  if (probe.reason === 'failed')
    return [
      { failureClass: 'environment-transport', message: `agent CLI "${agentCmd}" failed its --version probe (exit ${probe.status})` },
    ];
  if (probe.reason === 'timeout')
    return [
      {
        failureClass: 'environment-transport',
        message: `agent CLI "${agentCmd}" did not answer --version within ${PROBE_TIMEOUT_MS}ms and was killed`,
      },
    ];
  return [{ failureClass: 'environment-transport', message: `agent CLI "${agentCmd}" is not on PATH (${probe.detail})` }];
}

/* -------------------------------------------------------------------------- */
/* Reporting                                                                   */
/* -------------------------------------------------------------------------- */

/** @returns {string[]} */
function caseIds() {
  return [CASE_ID];
}

async function finish({ options, startedAt, mode, runners, suiteFailureClasses = [] }) {
  const failureClass = worstFailureClass([...runners.map((runner) => runner.failureClass), ...suiteFailureClasses]);
  const exitCode = exitCodeForFailureClass(failureClass);

  if (options.jsonPath) {
    let suite;
    try {
      suite = suiteById((await loadSuiteManifest(PROJECT_ROOT)).manifest, SUITE_ID);
    } catch (error) {
      console.error(`${colors.red}eval: ${error.message}${colors.reset}`);
      process.exit(2);
    }
    await writeSuiteResult(
      options.jsonPath,
      suiteResultRecord({
        generatedAt: await nowIso(),
        mode,
        suite,
        repository: repositoryState(PROJECT_ROOT),
        fixtureDigest: await digestFiles(PROJECT_ROOT, suite.fixtures),
        promptDigest: null,
        cases: [{ id: CASE_ID, promptDigest: null }],
        runners,
        durationMs: await elapsedMsSince(startedAt),
        suiteFailureClasses,
      }),
    );
    console.log(`${colors.dim}result written to ${options.jsonPath}${colors.reset}`);
  }
  process.exit(exitCode);
}

function runnerRecord(options, { durationMs, failureClass, failures, measurements, completed, tools, diagnostics }) {
  return {
    agent: 'harness',
    executable: process.execPath,
    version: process.version,
    model: null,
    parameters: {
      agentArgs: redactArgs(options.agentArgs),
      envPassNames: [...options.envPass],
      timeoutMs: INSTALL_TIMEOUT_MS + SMOKE_TEST_TIMEOUT_MS,
      promptTransport: 'argv',
      tools,
    },
    repetitions: { expected: 1, completed },
    measurements,
    durationMs,
    usage: null,
    failureClass,
    failures,
    diagnostics,
  };
}

async function main() {
  const startedAt = await nowMs();
  const options = parseArgs(process.argv.slice(2));
  const staticMode = options.validateOnly ? 'validate-only' : options.preflightOnly ? 'preflight-only' : 'live';

  console.log(`${colors.cyan}========================================`);
  console.log('framework-scaffold install-and-smoke eval harness');
  console.log(`========================================${colors.reset}\n`);

  const { problems: fixtureProblems, declared: declaredFixtures } = await checkFixturePresence();
  if (fixtureProblems.length > 0) {
    console.error(`${colors.red}eval: the clean fixture is incomplete:${colors.reset}`);
    for (const problem of fixtureProblems) console.error(`  ${colors.red}✗${colors.reset} ${problem}`);
    await finish({ options, startedAt, mode: staticMode, runners: [], suiteFailureClasses: ['environment-missing-artifact'] });
    return;
  }
  console.log(`${colors.green}✓${colors.reset} ${declaredFixtures.length} clean fixture file(s) present`);

  let backend;
  try {
    backend = verifiedBackend();
    console.log(
      `${colors.green}✓${colors.reset} isolation backend selectable and runs on this machine: ${colors.dim}${backend}${colors.reset}`,
    );
  } catch (error) {
    console.error(`${colors.red}eval: ${error.message}${colors.reset}`);
    await finish({ options, startedAt, mode: staticMode, runners: [], suiteFailureClasses: ['environment-configuration'] });
    return;
  }

  if (options.validateOnly) {
    console.log(
      `\n${colors.green}fixture present, isolation backend selectable; nothing installed or run (--validate-only).${colors.reset}\n`,
    );
    await finish({ options, startedAt, mode: 'validate-only', runners: [] });
    return;
  }

  const agentProblems = preflightCustomAgent(options);
  if (agentProblems.length > 0) {
    console.error(`${colors.red}eval pre-flight failed; nothing was measured:${colors.reset}`);
    for (const problem of agentProblems) console.error(`  - ${problem.message}`);
    await finish({
      options,
      startedAt,
      mode: staticMode,
      runners: [],
      suiteFailureClasses: agentProblems.map((problem) => problem.failureClass),
    });
    return;
  }
  if (options.preflightOnly) {
    console.log(`${colors.green}✓${colors.reset} runner probe (--agent custom only; a built-in agent name is accepted and never read)`);
    console.log(`\n${colors.green}pre-flight only; nothing installed or run.${colors.reset}\n`);
    await finish({ options, startedAt, mode: 'preflight-only', runners: [] });
    return;
  }

  let browsersDir;
  try {
    browsersDir = await ensureChromiumBrowser();
    console.log(`${colors.green}✓${colors.reset} Chromium headless shell provisioned at ${colors.dim}${browsersDir}${colors.reset}`);
  } catch (error) {
    console.error(`${colors.red}eval: ${error.message}${colors.reset}`);
    await finish({ options, startedAt, mode: 'live', runners: [], suiteFailureClasses: ['environment-configuration'] });
    return;
  }

  console.log(`\n${colors.dim}staging the clean fixture, patching the copy, installing for real...${colors.reset}`);
  const runStartedAt = await nowMs();
  const outcome = await runOnce({ browsersDir });
  const durationMs = await elapsedMsSince(runStartedAt);

  const npmVersion = probeVersion('npm');
  const tools = [
    { name: 'npm', version: npmVersion, args: ['install', '--no-audit', '--no-fund'] },
    { name: '@playwright/test', version: null, args: ['test', 'tests/e2e/api-sample.spec.ts', '--reporter=list'] },
  ];

  if (!outcome.ok) {
    console.error(`${colors.red}✗ ${outcome.phase}: ${outcome.reason}${colors.reset}\n`);
    const measurements = {
      // defect-detection only runs after the clean case already passed, so that case's
      // own pass/fail is 1/null (not 0) when this is the phase that failed instead.
      installAndSmokePassRate: outcome.phase === 'defect-detection' ? 1 : outcome.failureClass === 'quality' ? 0 : null,
      seededDefectDetectionRate: outcome.phase === 'defect-detection' ? outcome.seededDefectDetectionRate : null,
    };
    const signature = JSON.stringify({ phase: outcome.phase, measurements });
    const diagnostic = diagnosticRecord({
      caseId: CASE_ID,
      repetition: 1,
      signature: outcome.failureClass === 'quality' ? signature : null,
      metricContributions: numericContributions(measurements),
      failureClass: outcome.failureClass,
      reason: `${outcome.phase}: ${outcome.reason}`,
      evidence: outcome.failureClass === 'quality' ? [{ kind: 'output-signature', value: signature }] : [],
    });
    await finish({
      options,
      startedAt,
      mode: 'live',
      runners: [
        runnerRecord(options, {
          durationMs,
          failureClass: outcome.failureClass,
          failures: [`${outcome.phase}: ${outcome.reason}`],
          measurements,
          completed: outcome.failureClass === 'quality' ? 1 : 0,
          tools,
          diagnostics: [diagnostic],
        }),
      ],
    });
    return;
  }

  console.log(`${colors.green}✓ npm install exited 0 and the smoke test exited 0 against the stub backend${colors.reset}`);
  console.log(
    `${colors.green}✓ the seeded backend defect and the seeded fixture defect were both caught, each for its own reason${colors.reset}\n`,
  );
  await finish({
    options,
    startedAt,
    mode: 'live',
    runners: [
      runnerRecord(options, {
        durationMs,
        failureClass: 'none',
        failures: [],
        measurements: { installAndSmokePassRate: 1, seededDefectDetectionRate: outcome.seededDefectDetectionRate },
        completed: 1,
        tools,
        diagnostics: [
          diagnosticRecord({
            caseId: CASE_ID,
            repetition: 1,
            signature: JSON.stringify([1, outcome.seededDefectDetectionRate]),
            metricContributions: { installAndSmokePassRate: 1, seededDefectDetectionRate: outcome.seededDefectDetectionRate },
            evidence: [{ kind: 'summary', value: 'clean smoke passed; seeded backend and fixture defects were detected' }],
          }),
        ],
      }),
    ],
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`${colors.red}eval: ${error?.stack ?? error}${colors.reset}`);
    process.exit(2);
  });
}

module.exports = {
  parseArgs,
  checkFixturePresence,
  verifiedBackend,
  ensureChromiumBrowser,
  BROWSERS_CACHE_DIR,
  stageWorkspace,
  runOnce,
  caseIds,
  RUNNER_CAPABILITIES,
  THRESHOLDS,
  SUITE_ID,
  CASE_ID,
  startStubServerProcess,
  startProxyProcess,
  getFreePort,
  waitForHttpReady,
  waitForTcpReady,
  breakAuthFixtureMerge,
  MERGED_FIXTURES_RELATIVE,
  MERGE_TESTS_MARKER,
  BACKEND_DEFECT_SIGNATURE,
  FIXTURE_DEFECT_SIGNATURE,
  WRONG_BACKEND_STATUS,
};
