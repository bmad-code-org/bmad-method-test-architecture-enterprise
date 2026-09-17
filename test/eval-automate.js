/**
 * automate eval harness.
 *
 * `bmad-testarch-automate` is deferred in `test/evals/suite-manifest.json` with
 * nothing behind it but fragment selection: no suite proves its generated tests
 * pass on working code, fail on a real regression, or avoid vacuous or
 * duplicate coverage. This is that suite.
 *
 * NO LIVE AGENT MODE
 *
 * Every other behavioral suite in this manifest spends a real vendor call in its
 * ungated `npm run eval:*` entrypoint and gates only a `--validate-only` data
 * check in `npm test`, and that check is static: it skips the vendor call
 * entirely, which is the cost `--validate-only` exists to avoid. This suite has
 * no vendor call to skip, so `--validate-only` does not mean that here: it is
 * deliberately identical to the default invocation, running the exact same live
 * cycle end to end (measured: ~5s, real servers, real Playwright, real HTTP),
 * because there is no cost left for it to avoid skipping. `--preflight-only` is
 * the fast, static mode instead (measured: ~0.07s): it only checks that the
 * corpus and Playwright resolve, and starts no server and runs no spec file.
 * Four hand-authored Playwright spec sets under
 * `test/fixtures/automate-eval/cases/` stand in for what a real
 * `bmad-testarch-automate` run could produce. Running the suite against a real
 * model is the residual `docs/explanation/eval-quality-roadmap.md` records on
 * this skill's row, the same way it is recorded on `bmad-testarch-atdd`'s.
 *
 * `--agent` / `--agent-cmd` / `--runs` are still accepted, only so this
 * harness's argv shape matches every other suite's for `test/eval-all.js` and
 * for `tools/validate-eval-schemas.js`'s preflight-probe check, which spawns
 * every registered harness with `--agent custom --agent-cmd <path>` once
 * against a runner that exists and once against one that does not.
 * `--preflight-only` probes the named executable purely to answer that check.
 * `--runs` is parsed and validated and then never read again: every live run
 * is one repetition, because nothing here varies from run to run for a repeat
 * to measure. None of the three is read by the live cycle itself.
 *
 * WHAT IS MEASURED
 *
 * Two live HTTP runs per case: `voucher-service` unmutated, and the same
 * service with `test/test-automate-eval-fixture.js`'s own seeded regression
 * applied to a scratch copy (`cartTotal >= voucher.minimumSpend` flipped to
 * `cartTotal > voucher.minimumSpend`). Every case's spec file runs, unmodified,
 * against both, over real HTTP, the same way `cli/atdd-red-check.js` executes a
 * real Playwright run rather than inspecting source.
 *
 *   correct-run          boundary-value assertions covering all four rules the
 *                         story states. One of them redeems at a cart total
 *                         exactly equal to minimumSpend, which is the only
 *                         input the seeded mutation changes the answer for:
 *                         accepted on the fixed run, wrongly rejected on the
 *                         mutated one. The scorer must attribute that failure
 *                         to the seeded boundary through its declared pattern.
 *   misses-regression     the same four rules, asserted only with interior
 *                         values that never land on the boundary. Every test
 *                         passes on both runs, and the scorer must report this
 *                         case as not detecting the regression rather than as
 *                         a clean pass: nothing failed, which is the defect.
 *   vacuous-pass          one assertion that cannot fail against real
 *                         behavior (every real response is under HTTP 600),
 *                         passing on both runs and reported as vacuous rather
 *                         than counted as coverage.
 *   duplicate             two tests with the same input and the same
 *                         assertion, both passing, the second reported as a
 *                         duplicate rather than counted as coverage.
 *
 * Vacuousness and duplication are scored statically, over the case's own
 * source text, before either server starts: a declared `vacuousPattern` must
 * be found inside the named test's own body, and a declared `duplicateOfTitle`
 * must name a test whose body is textually identical (whitespace collapsed) to
 * the one that duplicates it. This is `validateCorpus`, and it is what
 * `--validate-only` runs before the live cycle so a corpus that has drifted
 * from its own claims is caught before any server starts.
 *
 * ISOLATION
 *
 * Not needed and not built. NFR9's isolation and net-guard proofs cover
 * `test/eval-atdd.js`'s generated-test execution and Story 6.9's scaffold
 * install, the two suites in this epic that execute output nobody wrote by
 * hand. Every spec file this suite runs is hand-authored and committed; there
 * is no untrusted output here to confine.
 *
 * Usage:
 *   node test/eval-automate.js
 *   node test/eval-automate.js --validate-only
 *   node test/eval-automate.js --preflight-only
 *   node test/eval-automate.js --json results/automate.json
 *
 * Exit codes:
 *   0  every case scored exactly as its ground truth declares
 *   1  a threshold was missed: a measured quality failure
 *   2  the environment could not run the eval: a missing fixture, a corpus
 *      inconsistency, a server that would not start, or a Playwright run that
 *      produced no report
 */

'use strict';

const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const { boundedProbe } = require('./lib/bounded-probe');
const { loadSuiteManifest, suiteById } = require('./lib/suite-manifest');
const {
  digestFiles,
  repositoryState,
  measured,
  diagnosticRecord,
  numericContributions,
  classifyDiagnosticQuality,
  suiteResultRecord,
  writeSuiteResult,
} = require('./lib/eval-record');
const { nowMs, nowIso, elapsedMsSince } = require('./lib/clock');
const { worstFailureClass, exitCodeForFailureClass } = require('./schema/eval-result');

const PROJECT_ROOT = path.join(__dirname, '..');
const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'automate-eval');
const SERVICE_ROOT = path.join(FIXTURE_ROOT, 'voucher-service');
const CASES_ROOT = path.join(FIXTURE_ROOT, 'cases');
const CASES_CONFIG_PATH = path.join(CASES_ROOT, 'playwright.config.ts');
const GROUND_TRUTH_PATH = path.join(FIXTURE_ROOT, 'ground-truth.json');
const SUITE_ID = 'automate';

/**
 * The four case ids this suite scores, in the order the corpus's own README
 * and the story's I/O matrix list them. There is no single `CASE_ID` the way
 * `test/eval-atdd.js` declares one: that suite scores one generation run
 * (`reservations`) repeated over `--runs`, while this suite's four hand-authored
 * cases are each the whole measurement, with no repetition and no run to
 * distinguish from a "case" the way atdd's own six scorer-fixture cases are
 * distinct from its one scored unit. `caseIds()` below is what
 * `tools/validate-eval-schemas.js` checks the manifest's `caseCount` against.
 */
const CASE_IDS = ['correct-run', 'misses-regression', 'vacuous-pass', 'duplicate'];

// The same text-replace mutation test/test-automate-eval-fixture.js proves is
// unique and reversible. Both files declare it independently rather than
// sharing an export, because that script has no module.exports of its own (it
// is a `main()`-only entrypoint); a change to vouchers.js's boundary check
// already fails `npm run test:automate-eval-fixture` on a stale digest before
// this suite would ever see a silently-diverged constant.
const MUTATION_FROM = 'cartTotal >= voucher.minimumSpend';
const MUTATION_TO = 'cartTotal > voucher.minimumSpend';

const SERVER_START_TIMEOUT_MS = 10_000;
const PLAYWRIGHT_TIMEOUT_MS = 60_000;

/**
 * Every count this suite ceilings at zero: on this hand-authored corpus, the
 * scorer must classify all four cases exactly as their ground truth declares,
 * every time. There is no agent output to admit slack for, so nothing here is
 * a rate; each is a count of a distinct way the live run could disagree with
 * the corpus's own claim about itself.
 */
const THRESHOLDS = {
  maxLoadErrors: 0,
  maxUndetectedRegressionCases: 0,
  maxFalseRegressionDetections: 0,
  maxUnattributedFailures: 0,
  maxUnexpectedOutcomes: 0,
};

/**
 * This harness spawns Playwright and the fixture's own server as child
 * processes and reads their output back; it grants and needs nothing beyond
 * that. There is no generation step to scope a write for, and no agent
 * runner to confine, which is the whole reason `command-execution` is the one
 * capability declared rather than `scoped-artifact-writes`.
 */
const RUNNER_CAPABILITIES = ['command-execution'];

const colors = { reset: '[0m', red: '[31m', green: '[32m', yellow: '[33m', cyan: '[36m', dim: '[2m' };

/**
 * The Playwright CLI entry point, resolved the way `cli/atdd-red-check.js`'s
 * own `resolvePlaywrightCli` does (read `@playwright/test`'s own `bin`
 * declaration rather than a private path guessed at), but throwing instead of
 * calling that helper's `fail()` (`process.exit(2)`). That exit is fine at
 * atdd-red-check's own call sites, which run before anything is holding a
 * resource open; calling it from inside this harness's live cycle would exit
 * the process out from under `runLiveCycle`'s `finally`, leaking both started
 * servers and the mutated scratch directory. Resolved once, up front, before
 * either server starts, and the resolved path is threaded down to every
 * `runCaseAgainstServer` call rather than re-resolved per case.
 *
 * @returns {string}
 * @throws {Error} When @playwright/test cannot be resolved or declares no CLI.
 */
function resolvePlaywrightCliPath() {
  const packageJsonPath = require.resolve('@playwright/test/package.json', { paths: [PROJECT_ROOT] });
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const binRelative = packageJson.bin?.playwright;
  if (!binRelative) throw new Error(`@playwright/test at ${packageJsonPath} declares no "playwright" bin entry`);
  const cliPath = path.join(path.dirname(packageJsonPath), binRelative);
  if (!fs.existsSync(cliPath)) throw new Error(`@playwright/test declares its CLI at ${cliPath}, which does not exist`);
  return cliPath;
}

function fatal(code, message) {
  console.error(`${colors.red}eval: ${message}${colors.reset}`);
  process.exit(code);
}

function parseArgs(argv) {
  let validateOnly = false;
  let preflightOnly = false;
  let runs = 1;
  let agent = null;
  let agentCmd;
  const agentArgs = [];
  const envPass = [];
  let model;
  let jsonPath;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--agent': {
        agent = argv[index + 1];
        if (!agent) fatal(2, '--agent requires a value');
        index += 1;
        break;
      }
      case '--runs': {
        runs = Number.parseInt(argv[index + 1] ?? '', 10);
        if (!Number.isInteger(runs) || runs < 1) fatal(2, '--runs requires a positive integer');
        index += 1;
        break;
      }
      case '--agent-cmd': {
        agentCmd = argv[index + 1];
        if (!agentCmd) fatal(2, '--agent-cmd requires an executable path or name');
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
        if (!model) fatal(2, '--model requires a value');
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
  return { validateOnly, preflightOnly, runs, agent, agentCmd, agentArgs, envPass, model, jsonPath };
}

/* -------------------------------------------------------------------------- */
/* Ground truth and corpus validation                                         */
/* -------------------------------------------------------------------------- */

function loadGroundTruth() {
  if (!fs.existsSync(GROUND_TRUTH_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(GROUND_TRUTH_PATH, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Every `test('title', async (...) => { ... })` block in a spec file's source,
 * with its title and its own body text, found by counting braces from the
 * first one after the callback arrow rather than by a regex over the whole
 * function: the assertion bodies in this corpus are short, but a brace count
 * is what keeps this correct if one ever nests an object literal.
 *
 * The count skips over `'...'`, `"..."` and `` `...` `` spans (escapes
 * honored) so a brace character sitting inside a string or a template literal
 * never perturbs the depth. It does not parse a template literal's `${...}`
 * interpolations back into code, and it does not skip comments or regex
 * literals: none of this corpus's hand-authored bodies use any of those, and
 * a real parser is more machinery than a fixture this size needs.
 *
 * @param {string} sourceText
 * @returns {Array<{title: string, body: string}>}
 */
function extractTestBlocks(sourceText) {
  const callPattern = /\btest\(\s*(['"`])((?:\\.|(?!\1).)*)\1\s*,\s*async\s*\([^)]*\)\s*=>\s*\{/g;
  const blocks = [];
  let match;
  while ((match = callPattern.exec(sourceText)) !== null) {
    const title = match[2];
    const openBraceIndex = match.index + match[0].length - 1;
    let depth = 1;
    let index = openBraceIndex + 1;
    while (index < sourceText.length && depth > 0) {
      const char = sourceText[index];
      switch (char) {
        case "'":
        case '"':
        case '`': {
          const quote = char;
          index += 1;
          while (index < sourceText.length && sourceText[index] !== quote) {
            index += sourceText[index] === '\\' ? 2 : 1;
          }
          // index now sits on the closing quote (or ran off the end of an
          // unterminated string); the loop's own += 1 below steps past it.
          break;
        }
        case '{': {
          depth += 1;
          break;
        }
        case '}': {
          depth -= 1;
          break;
        }
        default: {
          break;
        }
      }
      index += 1;
    }
    blocks.push({ title, body: sourceText.slice(openBraceIndex + 1, index - 1) });
  }
  return blocks;
}

const normalizeWhitespace = (text) => text.replaceAll(/\s+/g, ' ').trim();

/**
 * Static validation of the corpus: every case names the fixed set of ids this
 * suite scores, every declared test exists in its spec file's own source,
 * every declared pattern compiles, a declared `vacuousPattern` is found
 * inside the exact test it is declared against, and a declared
 * `duplicateOfTitle` names a test whose body is textually identical to the
 * one that duplicates it. Nothing here starts a server or spends a vendor
 * call.
 *
 * @param {object} groundTruth
 * @returns {string[]} Problems; empty when the corpus is internally consistent.
 */
function validateCorpus(groundTruth) {
  const problems = [];
  const cases = groundTruth?.cases ?? [];
  const declaredIds = cases.map((entry) => entry.id);
  if (declaredIds.length !== CASE_IDS.length || !CASE_IDS.every((id) => declaredIds.includes(id))) {
    problems.push(`cases must declare exactly [${CASE_IDS.join(', ')}]; found [${declaredIds.join(', ') || '(none)'}]`);
    return problems;
  }

  for (const caseEntry of cases) {
    const label = `cases[${caseEntry.id}]`;
    if (typeof caseEntry.specFile !== 'string' || caseEntry.specFile.trim().length === 0) {
      problems.push(`${label}: declares no specFile`);
      continue;
    }
    const specAbsolute = path.join(FIXTURE_ROOT, caseEntry.specFile);
    if (!fs.existsSync(specAbsolute)) {
      problems.push(`${label}: specFile ${caseEntry.specFile} does not exist`);
      continue;
    }
    if (typeof caseEntry.detectsRegression !== 'boolean') problems.push(`${label}: detectsRegression must be a boolean`);

    const sourceText = fs.readFileSync(specAbsolute, 'utf8');
    const blocks = extractTestBlocks(sourceText);
    const blockByTitle = new Map(blocks.map((block) => [block.title, block]));

    const tests = caseEntry.tests ?? [];
    if (tests.length === 0) {
      problems.push(`${label}: declares no tests`);
      continue;
    }
    const seenTitles = new Set();
    let regressionTestCount = 0;
    for (const testEntry of tests) {
      const testLabel = `${label} :: ${testEntry.title ?? '(no title)'}`;
      if (typeof testEntry.title !== 'string' || testEntry.title.trim().length === 0) {
        problems.push(`${testLabel}: declares no title`);
        continue;
      }
      if (seenTitles.has(testEntry.title)) {
        problems.push(`${testLabel}: duplicate title in ground truth`);
        continue;
      }
      seenTitles.add(testEntry.title);
      const block = blockByTitle.get(testEntry.title);
      if (!block) {
        problems.push(`${testLabel}: no test in ${caseEntry.specFile} carries this title`);
        continue;
      }
      if (!['pass', 'fail'].includes(testEntry.fixedOutcome)) {
        problems.push(`${testLabel}: fixedOutcome must be "pass" or "fail"`);
      }
      if (!['pass', 'fail'].includes(testEntry.mutatedOutcome)) {
        problems.push(`${testLabel}: mutatedOutcome must be "pass" or "fail"`);
      }
      if (testEntry.mutatedOutcome === 'fail') {
        regressionTestCount += 1;
        if (typeof testEntry.attributionPattern !== 'string' || testEntry.attributionPattern.trim().length === 0) {
          problems.push(`${testLabel}: mutatedOutcome is "fail" and declares no attributionPattern`);
        } else {
          try {
            new RegExp(testEntry.attributionPattern);
          } catch (error) {
            problems.push(`${testLabel}: attributionPattern does not compile: ${error.message}`);
          }
        }
        // A test that catches the regression is, by definition, not vacuous
        // (its assertion can fail, and did on the mutated run) and not a
        // no-op duplicate (its own failure is the coverage). scoreCase's
        // classification chain checks vacuousness/duplication only once the
        // outcome shape and the attribution already agree with the declared
        // "fail", so a test carrying both declarations would silently score
        // as vacuous or duplicate rather than as the catch it claims to be;
        // refusing the corpus here is cheaper than a classification bug.
        if (testEntry.vacuousPattern !== undefined || testEntry.duplicateOfTitle !== undefined) {
          problems.push(`${testLabel}: mutatedOutcome is "fail" and cannot also declare vacuousPattern or duplicateOfTitle`);
        }
      }
      if (testEntry.vacuousPattern !== undefined) {
        try {
          const pattern = new RegExp(testEntry.vacuousPattern);
          if (!pattern.test(block.body)) {
            problems.push(`${testLabel}: vacuousPattern ${JSON.stringify(testEntry.vacuousPattern)} is not found in this test's own body`);
          }
        } catch (error) {
          problems.push(`${testLabel}: vacuousPattern does not compile: ${error.message}`);
        }
      }
      if (testEntry.duplicateOfTitle !== undefined) {
        const original = blockByTitle.get(testEntry.duplicateOfTitle);
        if (!original) {
          problems.push(`${testLabel}: duplicateOfTitle "${testEntry.duplicateOfTitle}" names no test in this case`);
        } else if (normalizeWhitespace(original.body) !== normalizeWhitespace(block.body)) {
          problems.push(`${testLabel}: declared a duplicate of "${testEntry.duplicateOfTitle}", but the two test bodies differ`);
        }
      }
    }
    if (caseEntry.detectsRegression && regressionTestCount === 0) {
      problems.push(`${label}: detectsRegression is true but no test declares mutatedOutcome "fail"`);
    }
    if (!caseEntry.detectsRegression && regressionTestCount > 0) {
      problems.push(`${label}: detectsRegression is false but ${regressionTestCount} test(s) declare mutatedOutcome "fail"`);
    }
  }
  return problems;
}

/** @returns {string[]} */
function caseIds() {
  return [...CASE_IDS];
}

/* -------------------------------------------------------------------------- */
/* Servers: the real, unmutated fixture and a mutated scratch copy            */
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

/** A GET to `url`, resolving true on any HTTP response and false on a connection error. */
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
 * A scratch copy of `voucher-service/src/`, with the seeded regression
 * applied: the boundary check in `vouchers.js` flipped from inclusive to
 * exclusive. The committed `voucher-service/` tree is never written; this is
 * the same staging pattern `test/test-automate-eval-fixture.js` proves is
 * reversible, applied here to a full directory copy so a real server can run
 * from it rather than to the one function that script calls directly.
 *
 * @returns {string} The scratch directory's absolute path.
 */
function stageMutatedService() {
  // Read and validated before anything is created on disk: a throw here has no
  // scratch directory yet to leak. Creating the directory first and validating
  // after would leave it behind on the throw path, since this function's own
  // caller (runLiveCycle) does not take ownership of mutatedDir until it comes
  // back with a value to assign to the variable its `finally` cleans up.
  const original = fs.readFileSync(path.join(SERVICE_ROOT, 'src', 'vouchers.js'), 'utf8');
  const occurrences = original.split(MUTATION_FROM).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `voucher-service/src/vouchers.js contains ${occurrences} occurrence(s) of "${MUTATION_FROM}", and the mutation needs exactly one to apply unambiguously`,
    );
  }
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-automate-eval-mutated-'));
  fs.mkdirSync(path.join(scratchDir, 'src'), { recursive: true });
  fs.copyFileSync(path.join(SERVICE_ROOT, 'src', 'server.js'), path.join(scratchDir, 'src', 'server.js'));
  fs.writeFileSync(path.join(scratchDir, 'src', 'vouchers.js'), original.replace(MUTATION_FROM, MUTATION_TO), 'utf8');
  return scratchDir;
}

/**
 * Starts `<cwd>/src/server.js` as a child process and waits for it to answer
 * `/health`.
 *
 * @param {{cwd: string, port: number}} options
 * @returns {Promise<import('node:child_process').ChildProcess>}
 */
async function startVoucherServer({ cwd, port }) {
  const healthUrl = `http://127.0.0.1:${port}/health`;
  if (await respondsOnce(healthUrl)) throw new Error(`port ${port} is already answering; refusing to start a second server on it`);
  const child = spawn(process.execPath, [path.join(cwd, 'src', 'server.js')], {
    cwd,
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  const deadline = (await nowMs()) + SERVER_START_TIMEOUT_MS;
  let spawnError = null;
  child.once('error', (error) => {
    spawnError = error;
  });
  while ((await nowMs()) < deadline) {
    if (spawnError) throw new Error(`voucher-service failed to start from ${cwd}: ${spawnError.message}`);
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`voucher-service exited (code ${child.exitCode}, signal ${child.signalCode}) before answering ${healthUrl}`);
    }
    if (await respondsOnce(healthUrl)) return child;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  stopVoucherServer(child);
  throw new Error(`voucher-service did not answer ${healthUrl} within ${SERVER_START_TIMEOUT_MS}ms`);
}

/** SIGKILL rather than SIGTERM: this harness owns the server for its own run and needs it gone, not given a chance to linger. */
function stopVoucherServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try {
    child.kill('SIGKILL');
  } catch {
    // already gone
  }
}

/* -------------------------------------------------------------------------- */
/* Running one case's spec file against one live server                       */
/* -------------------------------------------------------------------------- */

// eslint-disable-next-line no-control-regex -- the ESC byte is the thing being matched, not an accident
const ANSI_ESCAPE = /\[[0-9;]*m/g;
function stripAnsi(value) {
  return String(value ?? '').replaceAll(ANSI_ESCAPE, '');
}

function playwrightProcessFailure(result, tail = '') {
  const timedOut = result.error?.code === 'ETIMEDOUT';
  const failureClass = timedOut
    ? 'environment-timeout'
    : result.error
      ? 'environment-transport'
      : result.signal
        ? 'environment-timeout'
        : 'environment-missing-artifact';
  const reason = result.error
    ? `${timedOut ? 'Playwright timed out' : 'spawn failed'}: ${result.error.message}`
    : result.signal
      ? `Playwright was killed by ${result.signal}`
      : `no JSON report was written (exit ${result.status}); ${tail || 'nothing on stderr'}`;
  return { failureClass, reason };
}

/**
 * One case's spec file, run once against one already-running server.
 *
 * @param {{specAbsolute: string, baseUrl: string, cliPath: string}} options
 * @returns {{loadError: string|null, loadFailure: {failureClass: string, reason: string}|null, tests: Array<{title: string, status: string, message: string|null}>}}
 */
function runCaseAgainstServer({ specAbsolute, baseUrl, cliPath }) {
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-automate-eval-run-'));
  const jsonOutputPath = path.join(scratchDir, 'report.json');
  try {
    const args = [cliPath, 'test', specAbsolute, '--config', CASES_CONFIG_PATH, '--reporter=json'];
    const env = {
      ...process.env,
      NODE_PATH: path.join(PROJECT_ROOT, 'node_modules'),
      PLAYWRIGHT_JSON_OUTPUT_NAME: jsonOutputPath,
      VOUCHER_BASE_URL: baseUrl,
      TEA_AUTOMATE_OUTPUT_DIR: path.join(scratchDir, 'test-results'),
      PWTEST_CACHE_DIR: path.join(scratchDir, '.cache'),
      FORCE_COLOR: '0',
      CI: '',
    };
    const result = spawnSync(process.execPath, args, { cwd: CASES_ROOT, env, encoding: 'utf8', timeout: PLAYWRIGHT_TIMEOUT_MS });

    if (!fs.existsSync(jsonOutputPath)) {
      const tail = String(result.stderr || result.stdout || '')
        .trim()
        .split('\n')
        .filter(Boolean)
        .slice(-6)
        .join(' | ');
      const loadFailure = playwrightProcessFailure(result, tail);
      return { loadError: loadFailure.reason, loadFailure, tests: [] };
    }

    let report;
    try {
      report = JSON.parse(fs.readFileSync(jsonOutputPath, 'utf8'));
    } catch (error) {
      const reason = `the JSON report did not parse: ${error.message}`;
      return { loadError: reason, loadFailure: { failureClass: 'environment-parser', reason }, tests: [] };
    }
    if (Array.isArray(report.errors) && report.errors.length > 0) {
      const reason = report.errors.map((entry) => stripAnsi(entry.message ?? entry).split('\n')[0]).join('; ');
      return { loadError: reason, loadFailure: { failureClass: 'environment-harness', reason }, tests: [] };
    }

    const tests = [];
    const walk = (suite) => {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          const last = test.results?.at(-1);
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
    return { loadError: null, loadFailure: null, tests };
  } finally {
    fs.rmSync(scratchDir, { recursive: true, force: true });
  }
}

/* -------------------------------------------------------------------------- */
/* Scoring                                                                     */
/* -------------------------------------------------------------------------- */

/** Playwright's own reporter status, reduced to the three-way answer a declared outcome is checked against. */
function outcomeOf(testResult) {
  if (!testResult) return 'missing';
  if (testResult.status === 'passed') return 'pass';
  if (testResult.status === 'failed' || testResult.status === 'timedOut') return 'fail';
  return 'other';
}

function findTest(run, title) {
  return (run?.tests ?? []).find((entry) => entry.title === title);
}

/**
 * Score one case's ground truth against its fixed-run and mutated-run
 * reports.
 *
 * @param {object} caseEntry
 * @param {{loadError: string|null, loadFailure?: object|null, tests: Array<object>}} fixedRun
 * @param {{loadError: string|null, loadFailure?: object|null, tests: Array<object>}} mutatedRun
 * @returns {object}
 */
function scoreCase(caseEntry, fixedRun, mutatedRun) {
  if (fixedRun?.loadError || mutatedRun?.loadError) {
    const loadFailure = fixedRun?.loadFailure ??
      mutatedRun?.loadFailure ?? {
        failureClass: 'environment-harness',
        reason: fixedRun?.loadError ?? mutatedRun?.loadError,
      };
    return {
      id: caseEntry.id,
      loadError: loadFailure.reason,
      loadFailure,
      tests: [],
      detectedRegression: false,
      expectedDetectsRegression: caseEntry.detectsRegression,
      verdict: 'load-error',
    };
  }

  const regressionTitles = new Set((caseEntry.tests ?? []).filter((entry) => entry.mutatedOutcome === 'fail').map((entry) => entry.title));

  const tests = (caseEntry.tests ?? []).map((testEntry) => {
    const fixed = findTest(fixedRun, testEntry.title);
    const mutated = findTest(mutatedRun, testEntry.title);
    const fixedOutcome = outcomeOf(fixed);
    const mutatedOutcome = outcomeOf(mutated);
    const fixedMatches = fixedOutcome === testEntry.fixedOutcome;
    const mutatedMatches = testEntry.mutatedOutcome === 'fail' ? mutatedOutcome === 'fail' : mutatedOutcome === 'pass';

    let attributionOk = null;
    if (testEntry.mutatedOutcome === 'fail' && mutatedMatches) {
      const pattern = new RegExp(testEntry.attributionPattern);
      attributionOk = Boolean(mutated?.message && pattern.test(mutated.message));
    }

    const isVacuous = typeof testEntry.vacuousPattern === 'string';
    const isDuplicate = typeof testEntry.duplicateOfTitle === 'string';

    let classification;
    if (!fixedMatches || !mutatedMatches) classification = 'unexpected-outcome';
    else if (testEntry.mutatedOutcome === 'fail' && !attributionOk) classification = 'unattributed-failure';
    else if (isVacuous) classification = 'vacuous';
    else if (isDuplicate) classification = 'duplicate';
    else classification = 'matches-declared';

    return { title: testEntry.title, fixedOutcome, mutatedOutcome, fixedMatches, mutatedMatches, attributionOk, classification };
  });

  const detectedRegression = tests.some((test) => regressionTitles.has(test.title) && test.classification === 'matches-declared');
  return {
    id: caseEntry.id,
    loadError: null,
    loadFailure: null,
    tests,
    detectedRegression,
    expectedDetectsRegression: caseEntry.detectsRegression,
    verdict: detectedRegression ? 'catches-regression' : 'does-not-detect-regression',
  };
}

/**
 * Score every case against a completed pair of live runs.
 *
 * @param {object} groundTruth
 * @param {Map<string, object>} fixedRuns Keyed by case id.
 * @param {Map<string, object>} mutatedRuns Keyed by case id.
 * @returns {object}
 */
function scoreRun(groundTruth, fixedRuns, mutatedRuns) {
  const cases = (groundTruth.cases ?? []).map((caseEntry) =>
    scoreCase(caseEntry, fixedRuns.get(caseEntry.id), mutatedRuns.get(caseEntry.id)),
  );

  let loadErrors = 0;
  let undetectedRegressionCases = 0;
  let falseRegressionDetections = 0;
  let unattributedFailures = 0;
  let unexpectedOutcomes = 0;
  // Counts every test's classification, including the two "correct, and
  // therefore uninteresting as a failure" ones (vacuous, duplicate) and the
  // baseline (matches-declared): AC2 asks that a vacuous or duplicated test be
  // reported as such, not only that it not be miscounted as a defect, and
  // these are what carry that report into the printed output and the --json
  // record's measurements below.
  const classificationCounts = { 'matches-declared': 0, vacuous: 0, duplicate: 0, 'unattributed-failure': 0, 'unexpected-outcome': 0 };
  for (const scoredCase of cases) {
    if (scoredCase.loadError) {
      loadErrors += 1;
      continue;
    }
    if (scoredCase.expectedDetectsRegression && !scoredCase.detectedRegression) undetectedRegressionCases += 1;
    if (!scoredCase.expectedDetectsRegression && scoredCase.detectedRegression) falseRegressionDetections += 1;
    for (const test of scoredCase.tests) {
      classificationCounts[test.classification] += 1;
      if (test.classification === 'unattributed-failure') unattributedFailures += 1;
      if (test.classification === 'unexpected-outcome') unexpectedOutcomes += 1;
    }
  }

  return {
    cases,
    loadErrors,
    undetectedRegressionCases,
    falseRegressionDetections,
    unattributedFailures,
    unexpectedOutcomes,
    classificationCounts,
  };
}

function automateDiagnosticProjection(scoredCase) {
  const classifications = scoredCase.tests ?? [];
  return {
    expectedDetectsRegression: scoredCase.expectedDetectsRegression,
    detectedRegression: scoredCase.detectedRegression,
    undetectedRegression: scoredCase.expectedDetectsRegression && !scoredCase.detectedRegression,
    falseRegressionDetection: !scoredCase.expectedDetectsRegression && scoredCase.detectedRegression,
    unattributedFailures: classifications.filter((test) => test.classification === 'unattributed-failure').length,
    unexpectedOutcomes: classifications.filter((test) => test.classification === 'unexpected-outcome').length,
    matchingOutcomes: classifications.filter((test) => test.classification === 'matches-declared').length,
    vacuousTests: classifications.filter((test) => test.classification === 'vacuous').length,
    duplicateTests: classifications.filter((test) => test.classification === 'duplicate').length,
    maxUndetectedRegressionCases: THRESHOLDS.maxUndetectedRegressionCases,
    maxFalseRegressionDetections: THRESHOLDS.maxFalseRegressionDetections,
    maxUnattributedFailures: THRESHOLDS.maxUnattributedFailures,
    maxUnexpectedOutcomes: THRESHOLDS.maxUnexpectedOutcomes,
  };
}

function automateDiagnosticClassifier(entry, failures) {
  const metrics = entry.metricContributions;
  const failed = failures.join('; ').toLowerCase();
  const reasons = [];
  if (failed.includes('undetected regression') && metrics.undetectedRegression === 1) reasons.push('undetected regression');
  if (failed.includes('false regression detection') && metrics.falseRegressionDetection === 1) reasons.push('false regression detection');
  if (failed.includes('unattributed failure') && metrics.unattributedFailures > 0) reasons.push('unattributed failure');
  if (failed.includes('unexpected outcome') && metrics.unexpectedOutcomes > 0) reasons.push('unexpected outcome');
  return reasons.length > 0 ? { reasons, rootCause: 'harness-defect' } : null;
}

/* -------------------------------------------------------------------------- */
/* The live cycle: stage, run every case twice, score                         */
/* -------------------------------------------------------------------------- */

/**
 * Stage the mutated scratch copy, start both servers, run every case's spec
 * file against each, and score the result. Always tears both servers and the
 * scratch copy down, even on failure.
 *
 * @param {object} groundTruth
 * @returns {Promise<object>} The object `scoreRun` returns.
 */
async function runLiveCycle(groundTruth) {
  // Resolved before anything is staged or started: a failure here has nothing
  // yet to clean up, whereas calling the exit-happy resolver from inside the
  // staged-and-running block below would skip the `finally` entirely.
  const cliPath = resolvePlaywrightCliPath();
  const fixedPort = await getFreePort();
  const mutatedDir = stageMutatedService();
  let mutatedPort;
  let fixedServer;
  let mutatedServer;
  try {
    mutatedPort = await getFreePort();
    fixedServer = await startVoucherServer({ cwd: SERVICE_ROOT, port: fixedPort });
    mutatedServer = await startVoucherServer({ cwd: mutatedDir, port: mutatedPort });

    const fixedRuns = new Map();
    const mutatedRuns = new Map();
    for (const caseEntry of groundTruth.cases) {
      const specAbsolute = path.join(FIXTURE_ROOT, caseEntry.specFile);
      fixedRuns.set(caseEntry.id, runCaseAgainstServer({ specAbsolute, baseUrl: `http://127.0.0.1:${fixedPort}`, cliPath }));
      mutatedRuns.set(caseEntry.id, runCaseAgainstServer({ specAbsolute, baseUrl: `http://127.0.0.1:${mutatedPort}`, cliPath }));
    }
    return scoreRun(groundTruth, fixedRuns, mutatedRuns);
  } finally {
    stopVoucherServer(fixedServer);
    stopVoucherServer(mutatedServer);
    fs.rmSync(mutatedDir, { recursive: true, force: true });
  }
}

/* -------------------------------------------------------------------------- */
/* Pre-flight                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * This suite invokes no agent, so there is nothing of its own to probe here.
 * The one check below exists so that `tools/validate-eval-schemas.js`'s
 * generic preflight-probe check, which spawns every registered harness with
 * `--agent custom --agent-cmd <path>` once against a runner that exists and
 * once against one that does not, gets a real transport failure on the first
 * and a real success on the second. Nothing named here is ever run again.
 *
 * @param {{agent: string|null, agentCmd: string|undefined}} options
 * @returns {{failureClass: string, message: string}[]}
 */
function preflightProblems({ agent, agentCmd }) {
  const problems = [];
  if (!fs.existsSync(GROUND_TRUTH_PATH))
    problems.push({ failureClass: 'environment-missing-artifact', message: `ground truth not found at ${GROUND_TRUTH_PATH}` });
  if (!fs.existsSync(CASES_ROOT))
    problems.push({ failureClass: 'environment-missing-artifact', message: `no cases found at ${CASES_ROOT}` });
  try {
    resolvePlaywrightCliPath();
  } catch {
    problems.push({ failureClass: 'environment-configuration', message: '@playwright/test could not be resolved' });
  }
  if (agent === 'custom') {
    const probe = boundedProbe(agentCmd, ['--version']);
    if (!probe.ok) {
      const failureClass = probe.reason === 'timeout' ? 'environment-timeout' : 'environment-transport';
      problems.push({ failureClass, message: `runner executable "${agentCmd}" ${probe.detail}` });
    }
  }
  return problems;
}

/* -------------------------------------------------------------------------- */
/* Reporting                                                                   */
/* -------------------------------------------------------------------------- */

function printReport(scored) {
  for (const scoredCase of scored.cases) {
    if (scoredCase.loadError) {
      console.log(`  ${colors.red}✗ ${scoredCase.id}: load error: ${scoredCase.loadError}${colors.reset}`);
      continue;
    }
    const expected = scoredCase.expectedDetectsRegression ? 'catches-regression' : 'does-not-detect-regression';
    const ok = scoredCase.verdict === expected;
    console.log(
      `  ${ok ? colors.green : colors.red}${ok ? '✓' : '✗'} ${scoredCase.id}: ${scoredCase.verdict}${colors.reset}${
        ok ? '' : ` ${colors.dim}(expected ${expected})${colors.reset}`
      }`,
    );
    for (const test of scoredCase.tests) {
      const isAnomaly = test.classification === 'unattributed-failure' || test.classification === 'unexpected-outcome';
      const marker = isAnomaly ? `${colors.red}✗` : `${colors.green}✓`;
      console.log(`        ${marker} ${test.classification}:${colors.reset} ${test.title}`);
    }
  }
}

async function finish({ options, startedAt, mode, groundTruth, suiteFailureClasses, runners = [] }) {
  const worst = worstFailureClass([...runners.map((runner) => runner.failureClass), ...suiteFailureClasses]);
  const exitCode = exitCodeForFailureClass(worst);

  if (options.jsonPath) {
    let suite;
    try {
      suite = suiteById((await loadSuiteManifest(PROJECT_ROOT)).manifest, SUITE_ID);
    } catch (error) {
      console.error(`${colors.red}eval: ${error.message}${colors.reset}`);
      process.exit(2);
    }
    const cases = groundTruth ? groundTruth.cases.map((entry) => ({ id: entry.id, promptDigest: null })) : [];
    await writeSuiteResult(
      options.jsonPath,
      suiteResultRecord({
        generatedAt: await nowIso(),
        mode,
        suite,
        repository: repositoryState(PROJECT_ROOT),
        fixtureDigest: await digestFiles(PROJECT_ROOT, suite.fixtures),
        promptDigest: null,
        cases,
        runners,
        durationMs: await elapsedMsSince(startedAt),
        suiteFailureClasses,
      }),
    );
    console.log(`${colors.dim}result written to ${options.jsonPath}${colors.reset}`);
  }
  process.exit(exitCode);
}

async function main() {
  const startedAt = await nowMs();
  const options = parseArgs(process.argv.slice(2));
  const mode = options.preflightOnly ? 'preflight-only' : options.validateOnly ? 'validate-only' : 'live';

  console.log(`${colors.cyan}========================================`);
  console.log('tea automate eval harness');
  console.log(`========================================${colors.reset}\n`);

  const groundTruth = loadGroundTruth();
  if (!groundTruth) {
    console.error(`${colors.red}eval: ground truth at ${GROUND_TRUTH_PATH} is missing or not valid JSON${colors.reset}`);
    await finish({ options, startedAt, mode, groundTruth: null, suiteFailureClasses: ['environment-missing-artifact'] });
    return;
  }

  const corpusProblems = validateCorpus(groundTruth);
  if (corpusProblems.length > 0) {
    console.error(`${colors.red}the corpus is inconsistent:${colors.reset}`);
    for (const problem of corpusProblems) console.error(`  ${colors.red}✗${colors.reset} ${problem}`);
    console.error('');
    await finish({ options, startedAt, mode, groundTruth, suiteFailureClasses: ['quality'] });
    return;
  }
  console.log(`${colors.green}✓${colors.reset} ${groundTruth.cases.length} case(s) declared; every test resolves in its own spec file`);

  if (options.preflightOnly) {
    const readiness = preflightProblems(options);
    if (readiness.length > 0) {
      console.error(`${colors.red}eval pre-flight failed:${colors.reset}`);
      for (const problem of readiness) console.error(`  - ${problem.message}`);
      await finish({ options, startedAt, mode, groundTruth, suiteFailureClasses: readiness.map((problem) => problem.failureClass) });
      return;
    }
    console.log(`${colors.green}✓${colors.reset} the corpus is in place and Playwright resolves`);
    await finish({ options, startedAt, mode, groundTruth, suiteFailureClasses: [] });
    return;
  }

  let scored;
  try {
    scored = await runLiveCycle(groundTruth);
  } catch (error) {
    console.error(`${colors.red}eval: ${error.message}${colors.reset}`);
    await finish({ options, startedAt, mode, groundTruth, suiteFailureClasses: ['environment-configuration'] });
    return;
  }

  printReport(scored);

  console.log(`\n  ${colors.dim}────────${colors.reset}`);
  console.log(`  load errors                  ${String(scored.loadErrors).padStart(4)}   (max ${THRESHOLDS.maxLoadErrors})`);
  console.log(
    `  undetected regression cases  ${String(scored.undetectedRegressionCases).padStart(4)}   (max ${THRESHOLDS.maxUndetectedRegressionCases})`,
  );
  console.log(
    `  false regression detections  ${String(scored.falseRegressionDetections).padStart(4)}   (max ${THRESHOLDS.maxFalseRegressionDetections})`,
  );
  console.log(
    `  unattributed failures        ${String(scored.unattributedFailures).padStart(4)}   (max ${THRESHOLDS.maxUnattributedFailures})`,
  );
  console.log(
    `  unexpected outcomes          ${String(scored.unexpectedOutcomes).padStart(4)}   (max ${THRESHOLDS.maxUnexpectedOutcomes})`,
  );

  const failures = [];
  if (scored.loadErrors > THRESHOLDS.maxLoadErrors) failures.push(`${scored.loadErrors} load error(s)`);
  if (scored.undetectedRegressionCases > THRESHOLDS.maxUndetectedRegressionCases) {
    failures.push(`${scored.undetectedRegressionCases} undetected regression case(s)`);
  }
  if (scored.falseRegressionDetections > THRESHOLDS.maxFalseRegressionDetections) {
    failures.push(`${scored.falseRegressionDetections} false regression detection(s)`);
  }
  if (scored.unattributedFailures > THRESHOLDS.maxUnattributedFailures)
    failures.push(`${scored.unattributedFailures} unattributed failure(s)`);
  if (scored.unexpectedOutcomes > THRESHOLDS.maxUnexpectedOutcomes) failures.push(`${scored.unexpectedOutcomes} unexpected outcome(s)`);

  if (failures.length > 0) console.log(`\n  ${colors.red}below threshold: ${failures.join(', ')}${colors.reset}\n`);
  else console.log(`\n  ${colors.green}all thresholds met${colors.reset}\n`);

  const diagnostics = classifyDiagnosticQuality(
    scored.cases.map((scoredCase) => {
      const signature = JSON.stringify({
        verdict: scoredCase.verdict ?? null,
        expectedDetectsRegression: scoredCase.expectedDetectsRegression,
        loadFailure: scoredCase.loadFailure ?? null,
        classifications: (scoredCase.tests ?? []).map((test) => test.classification),
      });
      return diagnosticRecord({
        caseId: scoredCase.id,
        repetition: 1,
        signature: scoredCase.loadError ? null : signature,
        metricContributions: scoredCase.loadError ? {} : numericContributions(automateDiagnosticProjection(scoredCase)),
        failureClass: scoredCase.loadFailure?.failureClass ?? 'none',
        rootCause: scoredCase.loadFailure ? 'harness-defect' : null,
        reason: scoredCase.loadFailure?.reason ?? null,
        evidence: scoredCase.loadError
          ? [{ kind: 'summary', value: `${scoredCase.loadFailure?.failureClass ?? 'environment-harness'}: ${scoredCase.loadError}` }]
          : [{ kind: 'output-signature', value: signature }],
      });
    }),
    failures,
    automateDiagnosticClassifier,
  );
  const runner = {
    agent: 'deterministic',
    executable: process.execPath,
    version: process.version,
    model: null,
    parameters: { agentArgs: [], envPassNames: [], timeoutMs: PLAYWRIGHT_TIMEOUT_MS, promptTransport: 'stdin' },
    repetitions: {
      expected: scored.cases.length,
      completed: scored.cases.filter((scoredCase) => !scoredCase.loadError).length,
    },
    measurements: {
      loadErrors: measured(scored.loadErrors),
      undetectedRegressionCases: measured(scored.undetectedRegressionCases),
      falseRegressionDetections: measured(scored.falseRegressionDetections),
      unattributedFailures: measured(scored.unattributedFailures),
      unexpectedOutcomes: measured(scored.unexpectedOutcomes),
      // Every test's classification, so a vacuous or duplicated test's
      // correct classification is visible in the --json record too, not only
      // in the printed report. `suiteResultSchema.cases` is `{id,
      // promptDigest}` and strict, shared by every suite's result record, so
      // per-test detail cannot live there; these three counts, plus
      // unattributedFailures and unexpectedOutcomes above, sum to the total
      // test count across every case that did not end in a load error.
      matchesDeclaredTests: measured(scored.classificationCounts['matches-declared']),
      vacuousTests: measured(scored.classificationCounts.vacuous),
      duplicateTests: measured(scored.classificationCounts.duplicate),
    },
    durationMs: await elapsedMsSince(startedAt),
    usage: null,
    failureClass: worstFailureClass(diagnostics.map((entry) => entry.failureClass)),
    failures,
    diagnostics,
  };

  await finish({ options, startedAt, mode, groundTruth, suiteFailureClasses: [], runners: [runner] });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`${colors.red}eval: ${error?.stack ?? error}${colors.reset}`);
    process.exit(2);
  });
}

module.exports = {
  parseArgs,
  loadGroundTruth,
  validateCorpus,
  scoreRun,
  scoreCase,
  playwrightProcessFailure,
  automateDiagnosticProjection,
  automateDiagnosticClassifier,
  extractTestBlocks,
  caseIds,
  THRESHOLDS,
  RUNNER_CAPABILITIES,
  SUITE_ID,
  CASE_IDS,
  MUTATION_FROM,
  MUTATION_TO,
};
