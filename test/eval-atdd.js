/**
 * atdd eval harness.
 *
 * `bmad-testarch-atdd` reads a story's acceptance criteria and writes red-phase
 * test scaffolds under `test.skip()`. This measures the one thing that was never
 * measured: whether an activated scaffold actually fails, and fails because the
 * behavior is missing rather than because the scaffold is broken.
 *
 * WHY THIS SUITE EXISTS
 *
 * The manifest carried `bmad-testarch-atdd` under `deferred`: fragment selection
 * covers which knowledge a run loads, and nothing executes the tests a run
 * generates, so nothing shows they fail before implementation for the intended
 * reason, map to the supplied criteria, or leave production code alone. This
 * suite is that execution.
 *
 * TWO COMMANDS, ONE STAGED WORKSPACE
 *
 * Generation and execution are two separate commands, and only the first is a
 * vendor call. `tea-atdd-runner` (cli/atdd-runner.js) drives the workflow and
 * writes scaffolds under the staged workspace's `tests/`; this harness then
 * spawns `cli/atdd-red-check.js` directly, wrapped in
 * `cli/lib/atdd-isolation.js`'s sandboxed backend, to activate and execute what
 * was written. `atdd-red-check` carries no vendor knowledge and needs no
 * credential, so it is invoked as a plain child process rather than through
 * eval-quality's command-line adapter, the way `test/lib/runner-capabilities.js`
 * runs `git status` directly rather than through a probe port.
 *
 * WHAT IS MEASURED
 *
 *   red for the intended reason   a criterion-mapped test whose activated run
 *                                 failed with a message matching the criterion's
 *                                 declared pattern. This is the headline: the
 *                                 suite exists to tell this apart from every
 *                                 other exit path.
 *   vacuous pass                  a mapped test that passed against the
 *                                 unimplemented fixture, ceiling zero
 *   still skipped                 a mapped test whose activation did not take,
 *                                 because it used a call other than
 *                                 `test.skip()`, ceiling zero
 *   load errors                   a spec file that never parsed or never
 *                                 imported, so nothing in it ran, ceiling zero
 *   unmapped tests                a test naming no criterion's id, ceiling zero
 *   criteria coverage             the fraction of the story's criteria reached
 *                                 by at least one mapped test
 *   production mutations          a file outside `tests/` and `test-artifacts/`
 *                                 that changed during generation or during
 *                                 execution, ceiling zero regardless of what the
 *                                 tests did
 *   stability                     the same scored answer on identical input,
 *                                 over everything above
 *
 * WHERE A CRITERION COMES FROM
 *
 * A test maps to a criterion by carrying its id, `AC-<n>`, in its title, which
 * is the workflow's own scaffold convention in every example its step files
 * show. `test/fixtures/atdd-eval/ground-truth.json` declares each criterion's
 * `declaredPattern`, the shape Playwright's own `expect().toBe()` failure
 * produces against the exact value the story states, derived from the fixture's
 * routes rather than from any run.
 *
 * THE GROUND TRUTH IS NEVER IN THE AGENT'S CONTEXT
 *
 * The staged workspace holds the fixture project, the story, a resolved TEA
 * config, and a copy of the skill. `ground-truth.json` is not copied, and the
 * pre-flight asserts it the way test/eval-nfr.js does: no staged file carries
 * its bytes, no staged path is named for it, and the assembled prompt contains
 * none of the tokens that appear only in it.
 *
 * THREE MODES
 *
 *   --validate-only   Static. No vendor, no cost, no network. Asserts the
 *                     corpus is internally consistent and staging keeps the
 *                     ground truth out of the agent's workspace and prompt.
 *   --preflight-only  The static checks, then the generation runner: is the
 *                     agent executable on PATH, does it answer --version, does
 *                     a built-in vendor have a credential. Exits before any
 *                     model call.
 *   default           Spends a vendor run per repetition, then runs the
 *                     deterministic execution half with no further cost.
 *
 * ISOLATION
 *
 * `cli/atdd-red-check.js` runs generated test code, so every invocation of it
 * is wrapped in `cli/lib/atdd-isolation.js`'s sandboxed backend, and
 * `test/test-atdd-isolation.js` proves the backend confines a hostile spec on
 * this machine before this suite is registered as covering the skill. A
 * machine with no working backend is an environment failure here, never a
 * clean run.
 *
 * Usage:
 *   node test/eval-atdd.js --validate-only
 *   node test/eval-atdd.js --preflight-only --agent codex
 *   node test/eval-atdd.js --agent claude --runs 2
 *   node test/eval-atdd.js --agent custom --agent-cmd my-runner --agent-arg --headless
 *   node test/eval-atdd.js --agent claude --json results/atdd.json
 *
 * Exit codes:
 *   0  the corpus is valid (--validate-only), the runner is ready
 *      (--preflight-only), or every vendor met the thresholds
 *   1  a threshold was missed, or the corpus is inconsistent (a real result)
 *   2  the environment could not run the eval (nothing was measured): a missing
 *      credential or executable, a timeout, a transport error, a missing or
 *      unreadable artifact, a runner that wrote outside its workspace, no
 *      working isolation backend, or fewer completed runs than were declared
 */

'use strict';

const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { AGENT_ADAPTERS, resolveModel } = require('../cli/lib/agent-adapters');
const { missingCredential } = require('./eval-test-review');
const { loadSuiteManifest, suiteById } = require('./lib/suite-manifest');
const { contractVersionsFor } = require('./lib/contract-versions');
const {
  digest,
  digestFiles,
  digestPrompts,
  repositoryState,
  probeVersion,
  redactArgs,
  measured,
  diagnosticRecord,
  numericContributions,
  classifyDiagnosticQuality,
  suiteResultRecord,
  writeSuiteResult,
} = require('./lib/eval-record');
const { worstFailureClass, exitCodeForFailureClass } = require('./schema/eval-result');
const { workingTreeState, workingTreeChanges } = require('./lib/runner-capabilities');
const { PROBE_TIMEOUT_MS, boundedProbe } = require('./lib/bounded-probe');
const { nowMs, nowIso, elapsedMsSince } = require('./lib/clock');
const {
  createProbePort,
  hostEnvironment,
  observedText,
  probeCommandWithRetry,
  probeRequest,
  targetProblems,
} = require('./lib/probe-targets');
const {
  selectBackend,
  sandboxedCommand,
  buildSeatbeltProfile,
  childEnvironment,
  probeBackend,
  DEFAULT_CPU_SECONDS,
} = require('../cli/lib/atdd-isolation');

const PROJECT_ROOT = path.join(__dirname, '..');
const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'atdd-eval');
const GROUND_TRUTH = path.join(FIXTURE_ROOT, 'ground-truth.json');
const SKILL_ROOT = path.join(PROJECT_ROOT, 'src', 'workflows', 'testarch', 'bmad-testarch-atdd');
const RED_CHECK_PATH = path.join(PROJECT_ROOT, 'cli', 'atdd-red-check.js');
const SUITE_ID = 'atdd';
const CASE_ID = 'reservations';

// Generation reads the whole story and every step file, and can dispatch two
// parallel worker subagents, so it is a real workflow run rather than a
// fragment selection. Twenty minutes matches the bound test/eval-nfr.js and
// test/eval-trace.js apply to a comparable workflow.
const RUN_TIMEOUT_MINUTES = 20;
const RUN_TIMEOUT_MS = RUN_TIMEOUT_MINUTES * 60_000;

// The execution half spawns Playwright once per spec file against a server
// tea-atdd-red-check starts and holds open itself (see FIXTURE_SERVER below),
// entirely local and entirely deterministic; thirty seconds per file is
// generous for a handful of API-only specs against a fixture with no browser.
const RED_CHECK_PER_FILE_TIMEOUT_MS = 30_000;
const RED_CHECK_OVERALL_TIMEOUT_MS = 5 * 60_000;

/**
 * How `cli/atdd-red-check.js` starts and reaches the fixture, so every spec
 * file talks to one server instance instead of letting Playwright's own
 * `webServer` start and stop one per file. That was tried first and measured
 * never completing its own teardown under one isolation backend: the started
 * process and Playwright's wait for it to end both sat idle past this
 * harness's own wall-clock bounds. `test/fixtures/atdd-eval/reservations/package.json`
 * declares `npm start`, which every node fixture this suite might grow also
 * would, and its own `src/server.js` answers `/health` on `PORT`.
 *
 * The port is resolved once per process, from an OS-assigned ephemeral port,
 * rather than a fixed number: a fixed port is shared mutable state between
 * every invocation of this suite on one host, and two of them running at
 * once, in two worktrees or two peer sessions, is an ordinary occurrence
 * here. `startServer` in `cli/atdd-red-check.js` refuses to start when
 * something already answers its health URL, so a fixed port made the second
 * invocation fail with "already in use" rather than run. `getFreePort`
 * resolves once and every repetition in this process reuses the same port,
 * which is safe: each run's server is fully stopped before the next one
 * starts (`cli/atdd-red-check.js`'s own `finally` block).
 */
let fixtureServerPortPromise = null;

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

/** The one fixture-server port this process uses, resolved on first use and reused after. */
function fixtureServerPort() {
  if (fixtureServerPortPromise === null) fixtureServerPortPromise = getFreePort();
  return fixtureServerPortPromise;
}

/**
 * What the generation runner is allowed to do, checked against the manifest's
 * declaration by tools/validate-eval-schemas.js the same way THRESHOLDS is.
 * Execution is not a runner capability in this vocabulary at all: it spends no
 * vendor call, so RUNNER_CAPABILITIES names only the half that does.
 */
const RUNNER_CAPABILITIES = ['scoped-artifact-writes'];

/** The command this harness probes for generation, by the names test/lib/probe-targets.js and the atdd contract share. */
const ATDD_INTERFACE = 'tea-atdd-runner';
const ATDD_OPERATION = 'generate-red-phase-tests';

/**
 * The one file, relative to `{test_dir}`, the prompt asks generation to write
 * every scaffold into. A generated scaffold set has no fixed name in general —
 * the workflow's own step-04 dispatches an API worker and an E2E worker into
 * separate files it names itself — but this fixture is a JSON API with no
 * browser surface, so asking for one named path is an honest simplification
 * rather than a constraint fighting the workflow. It is also what makes the
 * deliverable addressable at all: the contract's `descriptorChannel` names one
 * artifact path, and a path an agent is free to invent is not one a contract
 * can point at before the run.
 */
const ATDD_SCAFFOLD_RELATIVE_PATH = path.join('api', 'reservations.spec.ts');

/** A test maps to the criterion whose id it carries in its title, the workflow's own scaffold convention. */
const CRITERION_ID = /\bAC-(\d+)\b/;

/**
 * Every failure Playwright's own `expect()` library raises names the matcher
 * call this way, ANSI codes stripped, whichever matcher failed:
 * `expect(received).toBe(expected)`, `expect(received).toEqual(expected)`, and
 * so on. Verified live across `toBe`, `toEqual` and `toContain`. A test that
 * fails by throwing a plain `Error` carries none of this, even when its
 * message text happens to match a criterion's declared pattern, because a
 * declared pattern is usually just the literal "Expected: X" / "Received: Y"
 * text a hand-thrown message can reproduce with no assertion behind it at all.
 */
const ASSERTION_LIBRARY_MARKER = /\bexpect\(/;

/**
 * Keys that appear only in ground-truth.json: the field names this corpus
 * invents to hold its own answers, and the vocabulary of its own commentary.
 * Finding one in a staged file or in the prompt means the answers reached the
 * agent, which invalidates the measurement.
 */
const GROUND_TRUTH_ONLY_TOKENS = ['declaredPattern', 'skillRuleCitations', 'vacuous-pass', 'wrong-reason-red'];

/**
 * Thresholds. AC1's own rule admits no slack: an assertion failure matching the
 * declared pattern is correct, and a pass, a still-skipped scaffold, a load
 * error, or any other non-assertion exit is a defect, with nothing in between.
 * `redForIntendedReasonRate` is therefore 1, and every distinct way of not
 * being red for the intended reason gets its own zero ceiling beside it, so a
 * run that clears every ceiling clears the rate as a direct consequence rather
 * than by admitted slack.
 */
const THRESHOLDS = {
  redForIntendedReasonRate: 1,
  criteriaCoverage: 1,
  maxVacuousPass: 0,
  maxStillSkipped: 0,
  maxLoadErrors: 0,
  maxNonAssertionExit: 0,
  maxUnmappedTests: 0,
  maxProductionMutations: 0,
  maxUnstableCases: 0,
};

const colors = { reset: '[0m', red: '[31m', green: '[32m', yellow: '[33m', cyan: '[36m', dim: '[2m' };

function fatal(code, message) {
  console.error(`${colors.red}eval: ${message}${colors.reset}`);
  process.exit(code);
}

function parseArgs(argv) {
  const agents = [];
  const agentArgs = [];
  const envPass = [];
  let runs = 2;
  let validateOnly = false;
  let preflightOnly = false;
  let agentCmd;
  let model;
  let jsonPath;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--agent': {
        const value = argv[index + 1];
        if (!value) fatal(2, '--agent requires a vendor name');
        agents.push(value);
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
  if (agents.length === 0) agents.push('claude');
  if (agents.includes('custom') && !agentCmd) fatal(2, '--agent custom requires --agent-cmd');
  if (agents.includes('custom') && model) {
    fatal(2, '--model is not supported by --agent custom; pass the runner model through --agent-arg');
  }
  if (agents.length > 1 && (agentCmd || agentArgs.length > 0 || envPass.length > 0 || model)) {
    fatal(2, 'runner overrides require exactly one --agent; run separate commands for different runner configurations');
  }
  if (validateOnly && preflightOnly) fatal(2, '--validate-only and --preflight-only name different modes; pass one');
  if (runs < 2 && !validateOnly && !preflightOnly) {
    console.error(`${colors.yellow}note${colors.reset}: --runs ${runs} cannot measure stability; use --runs 2 or more.`);
  }
  return { agents, runs, validateOnly, preflightOnly, agentCmd, agentArgs, envPass, model, jsonPath };
}

/* -------------------------------------------------------------------------- */
/* Ground truth and corpus validation                                         */
/* -------------------------------------------------------------------------- */

function loadGroundTruth() {
  if (!fs.existsSync(GROUND_TRUTH)) return null;
  try {
    return JSON.parse(fs.readFileSync(GROUND_TRUTH, 'utf8'));
  } catch {
    return null;
  }
}

/** Every file under a directory, relative to it, sorted, excluding dotdirs a fixture never needs. */
function filesUnder(root) {
  const found = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) found.push(path.relative(root, absolute));
    }
  };
  if (fs.existsSync(root)) walk(root);
  return found;
}

/**
 * Static validation of the corpus: every cited rule still says what the ground
 * truth rests on, every declared criterion pattern compiles, the story states
 * every criterion's id, and the fixture project exists.
 *
 * @param {object} groundTruth
 * @returns {string[]} Problems; empty when the corpus is internally consistent.
 */
function validateCorpus(groundTruth) {
  const problems = [];

  const citations = groundTruth.skillRuleCitations ?? {};
  for (const [key, citation] of Object.entries(citations)) {
    const absolute = path.join(PROJECT_ROOT, citation.file);
    if (!fs.existsSync(absolute)) {
      problems.push(`skillRuleCitations.${key}: ${citation.file} does not exist`);
      continue;
    }
    const body = fs.readFileSync(absolute, 'utf8');
    if (typeof citation.requiredPhrase !== 'string' || citation.requiredPhrase.trim().length === 0) {
      problems.push(`skillRuleCitations.${key}: declares no requiredPhrase`);
    } else if (!body.includes(citation.requiredPhrase)) {
      problems.push(`skillRuleCitations.${key}: ${citation.file} no longer contains ${JSON.stringify(citation.requiredPhrase)}`);
    }
  }

  const projectRoot = groundTruth.projectRoot;
  const projectAbsolute = projectRoot ? path.join(FIXTURE_ROOT, projectRoot) : null;
  if (!projectAbsolute || !fs.existsSync(projectAbsolute)) {
    problems.push(`projectRoot ${projectRoot ?? '(not declared)'} does not exist under test/fixtures/atdd-eval/`);
    return problems;
  }
  for (const required of ['package.json', 'playwright.config.ts', path.join('src', 'server.js')]) {
    if (!fs.existsSync(path.join(projectAbsolute, required))) {
      problems.push(`${projectRoot}/${required} does not exist, and the fixture needs it to run`);
    }
  }

  const storyAbsolute = groundTruth.storyFile ? path.join(PROJECT_ROOT, groundTruth.storyFile) : null;
  if (!storyAbsolute || !fs.existsSync(storyAbsolute)) {
    problems.push(`storyFile ${groundTruth.storyFile ?? '(not declared)'} does not exist`);
    return problems;
  }
  const storyText = fs.readFileSync(storyAbsolute, 'utf8');

  const criteria = groundTruth.criteria ?? [];
  if (criteria.length === 0) {
    problems.push('criteria is missing or empty');
    return problems;
  }
  const seenIds = new Set();
  for (const criterion of criteria) {
    const label = `criteria[${criterion.id ?? '(no id)'}]`;
    if (!criterion.id || !/^AC-\d+$/.test(criterion.id)) {
      problems.push(`${label}: id must match AC-<n>`);
      continue;
    }
    if (seenIds.has(criterion.id)) problems.push(`${label}: duplicate id`);
    seenIds.add(criterion.id);
    if (!storyText.includes(criterion.id)) {
      problems.push(`${label}: the story does not mention ${criterion.id}, so nothing in it states this criterion`);
    }
    if (typeof criterion.declaredPattern !== 'string' || criterion.declaredPattern.trim().length === 0) {
      problems.push(`${label}: declares no declaredPattern`);
      continue;
    }
    try {
      new RegExp(criterion.declaredPattern);
    } catch (error) {
      problems.push(`${label}: declaredPattern does not compile: ${error.message}`);
    }
  }
  if (criteria.length < 2) {
    problems.push('criteria declares fewer than two rows, so criteria coverage and the accuracy rate are the same fraction');
  }

  // A corpus with no vacuous-pass temptation measures half of what this suite
  // exists for. AC-5 in the authored corpus extends a route the fixture
  // already serves, which is what makes a vacuous pass possible. That shape is
  // assumed here rather than asserted: nothing above starts the fixture, so no
  // request confirms it actually answers 200 on the route the story extends.
  return problems;
}

/**
 * Every criterion id the story states, checked against the staged workspace
 * and the assembled prompt for a ground-truth leak, before any call is spent.
 *
 * @param {string} workspaceDir
 * @param {string} prompt
 * @returns {string[]}
 */
function assertGroundTruthAbsent(workspaceDir, prompt) {
  const problems = [];
  const groundTruthBytes = fs.existsSync(GROUND_TRUTH) ? fs.readFileSync(GROUND_TRUTH, 'utf8') : null;
  for (const relative of filesUnder(workspaceDir)) {
    if (path.basename(relative) === 'ground-truth.json') {
      problems.push(`staged workspace contains ${relative}`);
      continue;
    }
    const text = fs.readFileSync(path.join(workspaceDir, relative), 'utf8');
    if (groundTruthBytes && text === groundTruthBytes) {
      problems.push(`staged file ${relative} carries the ground truth verbatim`);
      continue;
    }
    for (const token of GROUND_TRUTH_ONLY_TOKENS) {
      if (text.includes(token)) problems.push(`staged file ${relative} carries the ground-truth-only key "${token}"`);
    }
  }
  for (const token of GROUND_TRUTH_ONLY_TOKENS) {
    if (prompt.includes(token)) problems.push(`prompt carries the ground-truth-only key "${token}"`);
  }
  return problems;
}

/* -------------------------------------------------------------------------- */
/* Staging                                                                     */
/* -------------------------------------------------------------------------- */

function configYaml(projectRoot) {
  return [
    '# Written by test/eval-atdd.js for the staged reservations fixture.',
    'user_name: tea-eval-harness',
    `project_name: ${projectRoot}`,
    'communication_language: English',
    'document_output_language: English',
    'output_folder: docs',
    'test_artifacts: test-artifacts',
    'tea_browser_automation: none',
    'tea_use_playwright_utils: false',
    'tea_use_pactjs_utils: false',
    'tea_execution_mode: sequential',
    'tea_capability_probe: false',
    '',
  ].join('\n');
}

/**
 * Stage the fixture project into a disposable workspace.
 *
 * Layout, with the workspace itself as the agent's working directory:
 *
 *   <projectRoot>/   the fixture service and story, plus a resolved config and an empty tests/
 *   skill/           the bmad-testarch-atdd workflow, copied verbatim
 *
 * @param {object} groundTruth
 * @returns {{dir: string, projectDir: string, productionFiles: string[]}}
 */
function stageWorkspace(groundTruth) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-atdd-eval-'));
  const projectDir = path.join(dir, groundTruth.projectRoot);
  const sourceRoot = path.join(FIXTURE_ROOT, groundTruth.projectRoot);

  for (const relative of filesUnder(sourceRoot)) {
    const target = path.join(projectDir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(sourceRoot, relative), target);
  }
  fs.mkdirSync(path.join(projectDir, groundTruth.testDir), { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'test-artifacts'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, '_bmad', 'tea'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, '_bmad', 'tea', 'config.yaml'), configYaml(groundTruth.projectRoot), 'utf8');

  for (const relative of filesUnder(SKILL_ROOT)) {
    const target = path.join(dir, 'skill', relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(SKILL_ROOT, relative), target);
  }

  // Production files: everything under the project root except the scaffold
  // directory and the harness's own additions. This is what "no production
  // file has changed" is checked against, before generation and again after
  // execution.
  const productionFiles = filesUnder(projectDir).filter(
    (relative) =>
      !relative.startsWith(`${groundTruth.testDir}${path.sep}`) &&
      !relative.startsWith(`test-artifacts${path.sep}`) &&
      !relative.startsWith(`_bmad${path.sep}`),
  );
  return { dir, projectDir, productionFiles };
}

/** One digest per file under `root`, keyed by relative path, so a specific changed path can be named rather than only that some file in the set changed. */
function digestFilesByPath(root, relativePaths) {
  const digests = new Map();
  for (const relative of relativePaths) {
    const absolute = path.join(root, relative);
    try {
      // The permission bits ride along with the content digest: a scaffold that
      // flips a production file's executable bit without changing a byte is
      // still a detected mutation, matching cli/atdd-red-check.js's own
      // snapshotFile for the execution phase.
      const mode = fs.statSync(absolute).mode & 0o777;
      digests.set(relative, `${mode.toString(8)}:${digest(fs.readFileSync(absolute))}`);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      digests.set(relative, null);
    }
  }
  return digests;
}

/** The relative paths whose digest differs between two digestFilesByPath() results over the same relativePaths, sorted for a stable report. */
function changedPaths(before, after) {
  const changed = [];
  for (const [relative, beforeDigest] of before) {
    if (after.get(relative) !== beforeDigest) changed.push(relative);
  }
  return changed.sort();
}

/** Files newly present under `root` that were not in `known`, excluding the scaffold and harness directories. */
function addedFiles(root, known, testDir) {
  return filesUnder(root).filter(
    (relative) =>
      !relative.startsWith(`${testDir}${path.sep}`) &&
      !relative.startsWith(`test-artifacts${path.sep}`) &&
      !relative.startsWith(`_bmad${path.sep}`) &&
      !known.includes(relative),
  );
}

/* -------------------------------------------------------------------------- */
/* Prompt                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The prompt the generation run gets. States the run's configuration and the
 * story to work from, and nothing about which routes exist or do not: the
 * fixture is left to be discovered the way step-01 discovers a codebase.
 *
 * `storyRelativePath` is the one value the atdd contract's sensitivity witness
 * varies: the corpus's own story names AC-1 through AC-5, and the witness-only
 * story under test/fixtures/atdd-eval/witness/ names AC-9 alone, so two prompts
 * differing only in this value produce two scaffolds naming different
 * criteria, which is a true and checkable claim that the command reads its
 * standard input. It is never varied by test/eval-atdd.js itself, which always
 * scores the corpus's own story.
 *
 * @param {object} groundTruth
 * @param {{storyRelativePath?: string}} [options]
 * @returns {string}
 */
function buildPrompt(groundTruth, { storyRelativePath } = {}) {
  const root = groundTruth.projectRoot;
  const storyPath = storyRelativePath ?? path.join('docs', 'stories', '4-2-reserve-a-locker.md');
  // The sensitivity witness's second leg overrides storyRelativePath with a
  // path that climbs out of root on purpose, to point at a story no other
  // fixture names; the scope sentence below has to say so explicitly there,
  // or it reads as forbidding the read the very next line asks for.
  const storyOutsideRoot = storyPath.startsWith('..');
  const scopeNote = storyOutsideRoot
    ? `nothing outside that directory is relevant to this story, except \`{story_file}\` itself, named above.`
    : `nothing outside that directory is relevant to this story.`;
  return [
    `You are running the TEA workflow \`bmad-testarch-atdd\` against the project in \`${root}/\`.`,
    '',
    'The workflow is in `skill/`. Read `skill/instructions.md` first, then execute every step file it',
    'names in order, in full, without skipping or reordering. The step files are under `skill/steps-c/`.',
    '',
    '----- run configuration -----',
    'Resolve the workflow placeholders to these values:',
    '',
    `- \`{project-root}\`: \`${root}\``,
    `- \`{config_source}\`: \`${root}/_bmad/tea/config.yaml\``,
    `- \`{test_artifacts}\`: \`${root}/test-artifacts\``,
    `- \`{test_dir}\`: \`${root}/${groundTruth.testDir}\``,
    '- `{skill-root}`: `skill`',
    `- \`{story_file}\`: \`${root}/${storyPath}\``,
    '',
    `The story is at \`${root}/${storyPath}\`. Read the whole project under`,
    `\`${root}/\` to discover its stack, existing routes, and test framework the way step-01 says to;`,
    scopeNote,
    '',
    '----- what to produce -----',
    `Generate red-phase acceptance test scaffolds for every acceptance criterion the story states, into`,
    `exactly one file: \`${root}/${groundTruth.testDir}/${ATDD_SCAFFOLD_RELATIVE_PATH}\`. The fixture is a`,
    "JSON API with no browser surface, so every criterion is an API test and none needs the workflow's",
    "E2E worker. Every scaffold must be a `test.skip()` call, per the workflow's own TDD red-phase rule,",
    'asserting the behavior the criterion promises rather than a placeholder. Do not add, edit, or delete',
    'any file outside that one path: this workflow generates tests and touches nothing else.',
    '',
    'When you are done, print one line naming how many test files you wrote. Nothing else you print is read.',
  ].join('\n');
}

/** The one case this suite scores, and the prompt it is sent, for the result record's digest. */
function caseIndex(groundTruth) {
  return [{ id: CASE_ID, prompt: buildPrompt(groundTruth) }];
}

/** @returns {string[]} */
function caseIds() {
  return [CASE_ID];
}

/* -------------------------------------------------------------------------- */
/* Execution and scoring                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Run `cli/atdd-red-check.js` against a staged workspace, wrapped in the
 * isolation backend. This is a plain child process: no vendor call, no
 * credential, and no probe port, because there is nothing here for the port's
 * authorization machinery to confine that the sandbox does not already confine
 * more strictly.
 *
 * @param {string} projectDir
 * @param {string} reportPath
 * @param {string} backend
 * @returns {Promise<{ok: true, report: object}|{ok: false, failureClass: string, reason: string}>}
 */
async function runRedCheck(projectDir, reportPath, backend) {
  const port = await fixtureServerPort();
  const args = [
    RED_CHECK_PATH,
    '--project-root',
    projectDir,
    '--report',
    reportPath,
    // The directory itself, not the repository root: `--node-path` becomes the
    // spawned Playwright process's NODE_PATH, and that environment variable is
    // searched for a module by name directly rather than walked up through a
    // node_modules hierarchy the way `require.resolve`'s own `paths` option is.
    '--node-path',
    path.join(PROJECT_ROOT, 'node_modules'),
    '--per-file-timeout-ms',
    String(RED_CHECK_PER_FILE_TIMEOUT_MS),
    '--server-command',
    // `PORT=<n>` set for this one shell invocation, ahead of the command
    // itself: `cli/atdd-red-check.js` spawns `--server-command` with `shell:
    // true` and an environment closed to `PATH` alone, so this is the one
    // channel that reaches `npm start` with the chosen port. `npm` forwards
    // its own environment to the script it runs, the same as any `PORT=1234
    // npm start` on a command line.
    `PORT=${port} npm start`,
    '--server-health-url',
    `http://127.0.0.1:${port}/health`,
  ];

  let profilePath;
  if (backend === 'seatbelt') {
    profilePath = path.join(projectDir, '..', 'atdd-red-check.sb');
    fs.writeFileSync(profilePath, buildSeatbeltProfile({ workspace: projectDir }), 'utf8');
  }
  const vector = sandboxedCommand({
    backend,
    profilePath,
    workspace: projectDir,
    cpuSeconds: DEFAULT_CPU_SECONDS,
    command: process.execPath,
    args,
  });
  const result = spawnSync(vector.command, vector.args, {
    cwd: projectDir,
    env: childEnvironment({ path: process.env.PATH, home: projectDir }),
    encoding: 'utf8',
    timeout: RED_CHECK_OVERALL_TIMEOUT_MS,
  });

  if (result.error) {
    return { ok: false, failureClass: 'environment-transport', reason: `tea-atdd-red-check failed to start: ${result.error.message}` };
  }
  if (result.signal || result.status === null) {
    return { ok: false, failureClass: 'environment-timeout', reason: `tea-atdd-red-check was killed (${result.signal ?? 'timeout'})` };
  }
  if (result.status !== 0) {
    const tail = String(result.stderr || result.stdout || '')
      .trim()
      .split('\n')
      .slice(-3)
      .join(' | ');
    return { ok: false, failureClass: 'environment-configuration', reason: tail || `tea-atdd-red-check exited ${result.status}` };
  }
  if (!fs.existsSync(reportPath)) {
    return { ok: false, failureClass: 'environment-missing-artifact', reason: 'tea-atdd-red-check exited 0 but wrote no report' };
  }
  try {
    return { ok: true, report: JSON.parse(fs.readFileSync(reportPath, 'utf8')) };
  } catch (error) {
    return { ok: false, failureClass: 'environment-parser', reason: `the red-check report did not parse: ${error.message}` };
  }
}

/**
 * Score one red-check report against the ground truth's criteria.
 *
 * @param {object} groundTruth
 * @param {object} report tea-atdd-red-check's own report shape.
 * @param {string[]} productionMutatedFromGeneration Production-relative paths that changed during generation.
 * @returns {object}
 */
function scoreRun(groundTruth, report, productionMutatedFromGeneration = []) {
  const criteria = groundTruth.criteria ?? [];
  const byCriterion = new Map(criteria.map((criterion) => [criterion.id, { criterion, tests: [] }]));
  const unmapped = [];
  const loadErrors = [];

  for (const file of report.files ?? []) {
    if (file.loadError) {
      loadErrors.push({ file: file.file, reason: file.loadError });
      continue;
    }
    for (const test of file.tests ?? []) {
      const match = CRITERION_ID.exec(test.title);
      const criterionId = match ? `AC-${match[1]}` : null;
      if (criterionId && byCriterion.has(criterionId)) {
        byCriterion.get(criterionId).tests.push({ file: file.file, ...test });
      } else {
        unmapped.push({ file: file.file, title: test.title });
      }
    }
  }

  const perCriterion = [...byCriterion.values()].map(({ criterion, tests }) => {
    const pattern = new RegExp(criterion.declaredPattern);
    const classified = tests.map((test) => {
      if (test.status === 'passed') return { ...test, outcome: 'vacuous-pass' };
      if (test.status === 'skipped') return { ...test, outcome: 'still-skipped' };
      if (test.status === 'failed' && test.message && ASSERTION_LIBRARY_MARKER.test(test.message) && pattern.test(test.message)) {
        return { ...test, outcome: 'red-for-intended-reason' };
      }
      return { ...test, outcome: 'non-assertion-exit' };
    });
    return {
      id: criterion.id,
      present: classified.length > 0,
      // The first mapped test decides the criterion's own outcome, the same
      // "first section decides" rule test/eval-nfr.js applies to a repeated
      // domain assessment: several scaffolds naming one criterion is a
      // reasonable shape and the criterion's own status has to be one answer.
      outcome: classified[0]?.outcome ?? 'unmapped',
      tests: classified,
    };
  });

  const mappedTests = perCriterion.flatMap((entry) => entry.tests);
  const redCount = mappedTests.filter((test) => test.outcome === 'red-for-intended-reason').length;
  const vacuousPass = mappedTests.filter((test) => test.outcome === 'vacuous-pass');
  const stillSkipped = mappedTests.filter((test) => test.outcome === 'still-skipped');
  const nonAssertion = mappedTests.filter((test) => test.outcome === 'non-assertion-exit');
  const covered = perCriterion.filter((entry) => entry.present).length;

  const productionMutations = [...new Set([...productionMutatedFromGeneration, ...(report.productionFilesTouched ?? [])])].sort();

  return {
    caseId: CASE_ID,
    // Whether any scaffold file used the workflow's own `test.skip()` call at
    // all, read off tea-atdd-red-check's own report rather than re-derived:
    // it is the one fact this contract's `uses-test-skip` oracle states, and
    // it is a property of the file before activation, which nothing else in
    // this scored object records.
    usesTestSkip: (report.files ?? []).some((file) => file.hadSkipCall === true),
    perCriterion,
    mappedTestCount: mappedTests.length,
    redForIntendedReasonCount: redCount,
    redForIntendedReasonRate: measured(mappedTests.length === 0 ? Number.NaN : redCount / mappedTests.length),
    criteriaCoverage: measured(criteria.length === 0 ? Number.NaN : covered / criteria.length),
    vacuousPass,
    stillSkipped,
    nonAssertion,
    unmapped,
    loadErrors,
    productionMutations,
  };
}

/**
 * The scored answer as one string, for stability. Covers every field a
 * repetition's threshold reads, and nothing environmental.
 *
 * @param {object} scored One scoreRun result.
 * @returns {string}
 */
function signatureOf(scored) {
  return JSON.stringify([
    scored.perCriterion.map((entry) => [entry.id, entry.outcome]),
    scored.redForIntendedReasonCount,
    scored.mappedTestCount,
    scored.vacuousPass.map((test) => `${test.file}:${test.title}`),
    scored.stillSkipped.map((test) => `${test.file}:${test.title}`),
    scored.nonAssertion.map((test) => `${test.file}:${test.title}`),
    scored.unmapped.map((test) => `${test.file}:${test.title}`),
    scored.loadErrors.map((entry) => entry.file),
    scored.productionMutations,
  ]);
}

function atddDiagnosticProjection(scored) {
  return {
    redForIntendedReason: {
      numerator: scored.redForIntendedReasonCount,
      denominator: scored.mappedTestCount,
      threshold: THRESHOLDS.redForIntendedReasonRate,
    },
    criteriaCoverage: {
      numerator: scored.perCriterion.filter((entry) => entry.present).length,
      denominator: scored.perCriterion.length,
      threshold: THRESHOLDS.criteriaCoverage,
    },
    vacuousPass: scored.vacuousPass.length,
    maxVacuousPass: THRESHOLDS.maxVacuousPass,
    stillSkipped: scored.stillSkipped.length,
    maxStillSkipped: THRESHOLDS.maxStillSkipped,
    nonAssertionExit: scored.nonAssertion.length,
    maxNonAssertionExit: THRESHOLDS.maxNonAssertionExit,
    loadErrors: scored.loadErrors.length,
    maxLoadErrors: THRESHOLDS.maxLoadErrors,
    unmapped: scored.unmapped.length,
    maxUnmappedTests: THRESHOLDS.maxUnmappedTests,
    productionMutations: scored.productionMutations.length,
    maxProductionMutations: THRESHOLDS.maxProductionMutations,
    maxUnstableCases: THRESHOLDS.maxUnstableCases,
  };
}

function atddDiagnosticClassifier(diagnostics) {
  const variants = new Set(diagnostics.filter((entry) => entry.completionState === 'completed').map((entry) => entry.signature));
  return (entry, failures) => {
    const metric = entry.metricContributions;
    const failed = failures.join('; ');
    const reasons = [];
    if (
      failed.includes('redForIntendedReasonRate') &&
      (metric['redForIntendedReason.denominator'] === 0 ||
        metric['redForIntendedReason.numerator'] / metric['redForIntendedReason.denominator'] < metric['redForIntendedReason.threshold'])
    )
      reasons.push('redForIntendedReasonRate');
    if (
      failed.includes('criteriaCoverage') &&
      (metric['criteriaCoverage.denominator'] === 0 ||
        metric['criteriaCoverage.numerator'] / metric['criteriaCoverage.denominator'] < metric['criteriaCoverage.threshold'])
    )
      reasons.push('criteriaCoverage');
    for (const [needle, value, ceiling] of [
      ['vacuous pass', 'vacuousPass', 'maxVacuousPass'],
      ['still-skipped', 'stillSkipped', 'maxStillSkipped'],
      ['non-assertion exit', 'nonAssertionExit', 'maxNonAssertionExit'],
      ['load error', 'loadErrors', 'maxLoadErrors'],
      ['unmapped test', 'unmapped', 'maxUnmappedTests'],
      ['production mutation', 'productionMutations', 'maxProductionMutations'],
    ]) {
      if (failed.includes(needle) && metric[value] > metric[ceiling]) reasons.push(value);
    }
    if (failed.includes('unstable case') && variants.size > 1) reasons.push('unstable case');
    if (reasons.length === 0) return null;
    return {
      reasons,
      rootCause: reasons.length === 1 && reasons[0] === 'unstable case' ? 'model-instability' : 'tea-workflow-defect',
    };
  };
}

/* -------------------------------------------------------------------------- */
/* One complete run                                                            */
/* -------------------------------------------------------------------------- */

/**
 * One generation call plus one execution check, in a fresh staged workspace.
 *
 * @returns {Promise<{ok: true, scored: object}|{ok: false, failureClass: string, reason: string}>}
 */
async function runCase(groundTruth, options, agent, runIndex, backend) {
  const workspace = stageWorkspace(groundTruth);
  try {
    const prompt = buildPrompt(groundTruth);
    const leaked = assertGroundTruthAbsent(workspace.dir, prompt);
    if (leaked.length > 0) {
      return { ok: false, failureClass: 'environment-configuration', reason: leaked.join('; ') };
    }

    const beforeGeneration = digestFilesByPath(workspace.projectDir, workspace.productionFiles);
    const treeBefore = workingTreeState(PROJECT_ROOT);
    const { port } = await createProbePort({
      cwd: workspace.dir,
      interfaceIds: [ATDD_INTERFACE],
      artifacts: { [ATDD_INTERFACE]: { scaffold: path.join(groundTruth.projectRoot, groundTruth.testDir, ATDD_SCAFFOLD_RELATIVE_PATH) } },
      environmentKeys: { [ATDD_INTERFACE]: options.envPass },
    });
    const result = await probeCommandWithRetry(
      port,
      probeRequest({
        probeId: `${CASE_ID}-run-${runIndex + 1}`,
        interfaceId: ATDD_INTERFACE,
        operationId: ATDD_OPERATION,
        option: { ...atddRunnerOptions(options), agent },
        environment: hostEnvironment(ATDD_INTERFACE, options.envPass),
        stdin: { kind: 'text', value: prompt },
      }),
      new AbortController().signal,
    );
    const treeChanges = workingTreeChanges(treeBefore, workingTreeState(PROJECT_ROOT));
    if (treeChanges.length > 0) {
      return {
        ok: false,
        failureClass: 'environment-configuration',
        reason: `the generation runner changed the repository under a scoped-artifact-writes declaration: ${treeChanges.join(', ')}`,
      };
    }
    if (!result.ok) return { ok: false, failureClass: result.failureClass, reason: result.reason };
    const { observation } = result;
    if (observation.exitCode !== 0) {
      const tail = observedText(observation.stderr).trim().split('\n').filter(Boolean).slice(-3).join(' | ');
      return {
        ok: false,
        failureClass: failureClassForExit(observation.exitCode),
        reason: tail || `tea-atdd-runner exited ${observation.exitCode}`,
      };
    }

    const afterGeneration = digestFilesByPath(workspace.projectDir, workspace.productionFiles);
    const productionMutatedByGeneration = [
      ...changedPaths(beforeGeneration, afterGeneration),
      ...addedFiles(workspace.projectDir, workspace.productionFiles, groundTruth.testDir),
    ];

    const reportPath = path.join(workspace.projectDir, 'test-artifacts', 'atdd-red-report.json');
    const treeBeforeExecution = workingTreeState(PROJECT_ROOT);
    const redCheck = await runRedCheck(workspace.projectDir, reportPath, backend);
    // The sandbox is what actually confines the generated tests this runs; this
    // is a second, independent detector so a sandbox that silently stopped
    // confining is not the only thing standing between generated test code and
    // the real repository. Checked regardless of redCheck.ok, since a hostile
    // spec could reach the repository on its way to a non-zero exit too.
    const executionTreeChanges = workingTreeChanges(treeBeforeExecution, workingTreeState(PROJECT_ROOT));
    if (executionTreeChanges.length > 0) {
      return {
        ok: false,
        failureClass: 'environment-configuration',
        reason: `executing the generated tests changed the real repository, which the sandbox exists to prevent: ${executionTreeChanges.join(', ')}`,
      };
    }
    if (!redCheck.ok) return redCheck;

    return { ok: true, scored: scoreRun(groundTruth, redCheck.report, productionMutatedByGeneration) };
  } finally {
    fs.rmSync(workspace.dir, { recursive: true, force: true });
  }
}

function atddRunnerOptions(options) {
  const option = { 'timeout-ms': String(RUN_TIMEOUT_MS) };
  if (options.agentCmd) option['agent-cmd'] = options.agentCmd;
  if (options.model) option.model = options.model;
  if (options.agentArgs.length > 0) option['agent-arg'] = [...options.agentArgs];
  if (options.envPass.length > 0) option['env-pass'] = [...options.envPass];
  return option;
}

/** Exit-code-to-failure-class table shared with the other runner commands. */
function failureClassForExit(code) {
  const table = {
    0: 'none',
    2: 'usage',
    3: 'environment-configuration',
    4: 'environment-transport',
    5: 'environment-timeout',
    6: 'environment-parser',
  };
  return table[code] ?? 'environment-transport';
}

/* -------------------------------------------------------------------------- */
/* Pre-flight                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The backend this platform runs generated tests under, only after actually
 * spawning a trivial process through it. `selectBackend()` alone confirms the
 * binary is on `PATH`; a host can carry that binary and still refuse the
 * kernel feature it needs (an unprivileged user namespace, on some hardened
 * distributions), and a check that only looked at `PATH` would schedule a
 * live run that dies at its first spawn instead of refusing before it starts.
 *
 * @returns {string}
 * @throws {Error} whatever `selectBackend` throws, or an `ISOLATION_UNAVAILABLE`
 *   error naming the backend the kernel refused to run.
 */
function verifiedBackend() {
  const backend = selectBackend();
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-atdd-backend-probe-'));
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

function preflight({ agents, agentCmd }) {
  const problems = [];
  const versions = {};
  const report = (failureClass, message) => problems.push({ failureClass, message });

  if (!fs.existsSync(GROUND_TRUTH)) report('environment-missing-artifact', `ground truth not found at ${GROUND_TRUTH}`);
  if (!fs.existsSync(SKILL_ROOT)) report('environment-missing-artifact', `atdd workflow not found at ${SKILL_ROOT}`);
  for (const problem of targetProblems(PROJECT_ROOT, [ATDD_INTERFACE])) report('environment-configuration', problem);

  try {
    verifiedBackend();
  } catch (error) {
    report('environment-configuration', `no isolation backend runs here, so generated tests cannot be executed safely: ${error.message}`);
  }

  for (const agent of agents) {
    if (!Object.hasOwn(AGENT_ADAPTERS, agent)) {
      report('environment-configuration', `unknown agent "${agent}"; expected one of ${Object.keys(AGENT_ADAPTERS).join(', ')}`);
      continue;
    }
    const executable = agent === 'custom' ? agentCmd : agent;
    const probe = boundedProbe(executable, ['--version']);
    if (probe.ok) {
      versions[agent] =
        String(probe.stdout || '')
          .trim()
          .split('\n')[0] || null;
    } else if (probe.reason === 'failed') {
      report('environment-transport', `agent CLI "${executable}" failed its --version probe (exit ${probe.status})`);
    } else if (probe.reason === 'timeout') {
      report('environment-transport', `agent CLI "${executable}" did not answer --version within ${PROBE_TIMEOUT_MS}ms and was killed`);
    } else {
      report('environment-transport', `agent CLI "${executable}" is not on PATH (${probe.detail})`);
    }
    const credential = agent === 'custom' ? null : missingCredential(agent);
    if (credential) report('environment-authentication', credential);
  }
  return { problems, versions };
}

/* -------------------------------------------------------------------------- */
/* Reporting                                                                   */
/* -------------------------------------------------------------------------- */

const ratio = (numerator, denominator) => (denominator === 0 ? Number.NaN : numerator / denominator);
const pct = (value) => (Number.isNaN(value) ? '  n/a' : `${(value * 100).toFixed(0).padStart(3)}%`);

async function finish({ options, startedAt, mode, groundTruth, runners, suiteFailureClasses = [] }) {
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
    const cases = groundTruth ? caseIndex(groundTruth).map((item) => ({ id: item.id, promptDigest: digest(item.prompt) })) : [];
    await writeSuiteResult(
      options.jsonPath,
      suiteResultRecord({
        generatedAt: await nowIso(),
        mode,
        suite,
        repository: repositoryState(PROJECT_ROOT),
        fixtureDigest: await digestFiles(PROJECT_ROOT, suite.fixtures),
        promptDigest: groundTruth ? digestPrompts(caseIndex(groundTruth)) : null,
        cases,
        runners,
        durationMs: await elapsedMsSince(startedAt),
        suiteFailureClasses,
        contractVersions: await contractVersionsFor(suite, PROJECT_ROOT),
      }),
    );
    console.log(`${colors.dim}result written to ${options.jsonPath}${colors.reset}`);
  }
  process.exit(exitCode);
}

function runnerRecord(agent, options, versions, { expected, completed, measurements, durationMs, failures, diagnostics = [] }) {
  const executable = agent === 'custom' ? options.agentCmd : agent;
  const classifiedDiagnostics = classifyDiagnosticQuality(diagnostics, failures, atddDiagnosticClassifier(diagnostics));
  return {
    agent,
    executable,
    version: versions[agent] ?? probeVersion(executable),
    model: resolveModel(agent, options.model, options.agentArgs),
    parameters: {
      agentArgs: redactArgs(options.agentArgs),
      envPassNames: [...options.envPass],
      timeoutMs: RUN_TIMEOUT_MS,
      promptTransport: AGENT_ADAPTERS[agent]?.promptViaArgv ? 'argv' : 'stdin',
    },
    repetitions: { expected, completed },
    measurements,
    durationMs,
    usage: null,
    failureClass: worstFailureClass(classifiedDiagnostics.map((entry) => entry.failureClass)),
    failures,
    diagnostics: classifiedDiagnostics,
  };
}

async function main() {
  const startedAt = await nowMs();
  const options = parseArgs(process.argv.slice(2));
  const { agents, runs, validateOnly, preflightOnly } = options;
  const staticMode = validateOnly ? 'validate-only' : preflightOnly ? 'preflight-only' : 'live';

  console.log(`${colors.cyan}========================================`);
  console.log('tea atdd eval harness');
  console.log(`========================================${colors.reset}\n`);

  const groundTruth = loadGroundTruth();
  if (!groundTruth) {
    console.error(`${colors.red}eval: ground truth at ${GROUND_TRUTH} is missing or not valid JSON${colors.reset}`);
    await finish({
      options,
      startedAt,
      mode: staticMode,
      groundTruth: null,
      runners: [],
      suiteFailureClasses: ['environment-missing-artifact'],
    });
  }

  const problems = validateCorpus(groundTruth);
  if (problems.length > 0) {
    console.error(`${colors.red}the corpus is inconsistent:${colors.reset}`);
    for (const problem of problems) console.error(`  ${colors.red}✗${colors.reset} ${problem}`);
    console.error('');
    await finish({
      options,
      startedAt,
      mode: staticMode,
      groundTruth,
      runners: [],
      suiteFailureClasses: problems.map((message) => ({ failureClass: 'quality', rootCause: 'corpus-defect', message })),
    });
  }
  console.log(
    `${colors.green}✓${colors.reset} ${groundTruth.criteria.length} criterion(s) declared; every cited rule resolves and the story states every id`,
  );

  if (validateOnly || preflightOnly) {
    const workspace = stageWorkspace(groundTruth);
    try {
      const prompt = buildPrompt(groundTruth);
      const leaked = assertGroundTruthAbsent(workspace.dir, prompt);
      if (leaked.length > 0) {
        console.error(`${colors.red}eval: the staged workspace would hand the agent the answers:${colors.reset}`);
        for (const problem of leaked) console.error(`  ${colors.red}✗${colors.reset} ${problem}`);
        await finish({
          options,
          startedAt,
          mode: staticMode,
          groundTruth,
          runners: [],
          suiteFailureClasses: ['environment-configuration'],
        });
      }
      const testDirAbsolute = path.join(workspace.projectDir, groundTruth.testDir);
      if (filesUnder(testDirAbsolute).length > 0) {
        console.error(`${colors.red}eval: the staged test directory is not empty; the run must write the only files in it${colors.reset}`);
        await finish({
          options,
          startedAt,
          mode: staticMode,
          groundTruth,
          runners: [],
          suiteFailureClasses: ['environment-configuration'],
        });
      }
      console.log(`  ${colors.green}✓${colors.reset} staged workspace carries no ground truth and an empty ${groundTruth.testDir}/`);
    } finally {
      fs.rmSync(workspace.dir, { recursive: true, force: true });
    }
    if (validateOnly) {
      console.log(`\n${colors.green}corpus valid; nothing measured (--validate-only).${colors.reset}\n`);
      await finish({ options, startedAt, mode: 'validate-only', groundTruth, runners: [] });
    }
  }

  const { problems: readiness, versions } = preflight(options);
  if (readiness.length > 0) {
    console.error(`${colors.red}eval pre-flight failed; nothing was measured:${colors.reset}`);
    for (const problem of readiness) console.error(`  - ${problem.message}`);
    console.error(`\n${colors.dim}A failed pre-flight is exit 2, never a 0% score.${colors.reset}`);
    await finish({
      options,
      startedAt,
      mode: staticMode,
      groundTruth,
      runners: [],
      suiteFailureClasses: readiness,
    });
  }
  if (preflightOnly) {
    console.log(
      `${colors.green}✓${colors.reset} runner executable(s) answer --version; built-in credentials and the isolation backend checked`,
    );
    console.log(`\n${colors.green}pre-flight only; nothing measured.${colors.reset}\n`);
    await finish({ options, startedAt, mode: 'preflight-only', groundTruth, runners: [] });
  }

  let backend;
  try {
    backend = verifiedBackend();
  } catch (error) {
    console.error(`${colors.red}eval: ${error.message}${colors.reset}`);
    await finish({ options, startedAt, mode: 'live', groundTruth, runners: [], suiteFailureClasses: ['environment-configuration'] });
  }
  console.log(`${colors.dim}${runs} run(s), isolation backend: ${backend}${colors.reset}\n`);

  const runners = [];
  for (const agent of agents) {
    console.log(`${colors.cyan}${agent}${colors.reset}`);
    const agentStartedAt = await nowMs();
    const totals = {
      redForIntendedReasonRateSum: 0,
      criteriaCoverageSum: 0,
      measuredRedRate: 0,
      measuredCoverage: 0,
      vacuousPass: 0,
      stillSkipped: 0,
      nonAssertion: 0,
      loadErrors: 0,
      unmapped: 0,
      productionMutations: 0,
    };
    const caseScores = [];
    const signatures = new Set();
    const lostRunClasses = [];
    const diagnostics = [];

    for (let runIndex = 0; runIndex < runs; runIndex += 1) {
      const outcome = await runCase(groundTruth, options, agent, runIndex, backend);
      if (!outcome.ok) {
        console.error(`  ${colors.red}run ${runIndex + 1}: ${outcome.reason}${colors.reset}`);
        lostRunClasses.push(outcome.failureClass);
        diagnostics.push(
          diagnosticRecord({ caseId: CASE_ID, repetition: runIndex + 1, failureClass: outcome.failureClass, reason: outcome.reason }),
        );
        continue;
      }
      caseScores.push(outcome.scored);
      const signature = signatureOf(outcome.scored);
      signatures.add(signature);
      diagnostics.push(
        diagnosticRecord({
          caseId: CASE_ID,
          repetition: runIndex + 1,
          signature,
          metricContributions: numericContributions(atddDiagnosticProjection(outcome.scored)),
          evidence: [{ kind: 'output-signature', value: signature }],
        }),
      );

      if (!Number.isNaN(outcome.scored.redForIntendedReasonRate ?? Number.NaN)) {
        totals.redForIntendedReasonRateSum += outcome.scored.redForIntendedReasonRate;
        totals.measuredRedRate += 1;
      }
      if (!Number.isNaN(outcome.scored.criteriaCoverage ?? Number.NaN)) {
        totals.criteriaCoverageSum += outcome.scored.criteriaCoverage;
        totals.measuredCoverage += 1;
      }
      totals.vacuousPass += outcome.scored.vacuousPass.length;
      totals.stillSkipped += outcome.scored.stillSkipped.length;
      totals.nonAssertion += outcome.scored.nonAssertion.length;
      totals.loadErrors += outcome.scored.loadErrors.length;
      totals.unmapped += outcome.scored.unmapped.length;
      totals.productionMutations += outcome.scored.productionMutations.length;
    }

    const completedRuns = caseScores.length;
    const complete = completedRuns === runs;
    const stable = signatures.size === 1 && complete;

    if (completedRuns > 0) {
      const first = caseScores[0];
      console.log(
        `  ${colors.dim}first run:${colors.reset} ${first.redForIntendedReasonCount}/${first.mappedTestCount} red for the intended reason, ` +
          `${(first.criteriaCoverage * 100).toFixed(0)}% criteria coverage, ${stable ? 'stable' : complete ? `${colors.red}${signatures.size} different answers on identical input${colors.reset}` : `${colors.red}only ${completedRuns}/${runs} runs measured${colors.reset}`}`,
      );
      for (const test of first.vacuousPass) console.log(`        ${colors.red}vacuous pass:${colors.reset} ${test.file} :: ${test.title}`);
      for (const test of first.stillSkipped)
        console.log(`        ${colors.red}still skipped:${colors.reset} ${test.file} :: ${test.title}`);
      for (const test of first.nonAssertion)
        console.log(`        ${colors.red}non-assertion exit:${colors.reset} ${test.file} :: ${test.title}`);
      for (const test of first.unmapped) console.log(`        ${colors.red}unmapped:${colors.reset} ${test.file} :: ${test.title}`);
      for (const entry of first.loadErrors) console.log(`        ${colors.red}load error:${colors.reset} ${entry.file}: ${entry.reason}`);
      for (const relative of first.productionMutations) console.log(`        ${colors.red}production mutation:${colors.reset} ${relative}`);
    }

    const measurements = {
      redForIntendedReasonRate: measured(ratio(totals.redForIntendedReasonRateSum, totals.measuredRedRate)),
      criteriaCoverage: measured(ratio(totals.criteriaCoverageSum, totals.measuredCoverage)),
      vacuousPass: totals.vacuousPass,
      stillSkipped: totals.stillSkipped,
      nonAssertionExit: totals.nonAssertion,
      loadErrors: totals.loadErrors,
      unmapped: totals.unmapped,
      productionMutations: totals.productionMutations,
      unstableCases: complete && !stable ? 1 : 0,
      incompleteCases: complete ? 0 : 1,
    };

    console.log(`  ${colors.dim}────────${colors.reset}`);
    console.log(
      `  red for intended reason  ${pct(measurements.redForIntendedReasonRate ?? Number.NaN)}   (threshold ${pct(THRESHOLDS.redForIntendedReasonRate)})`,
    );
    console.log(
      `  criteria coverage        ${pct(measurements.criteriaCoverage ?? Number.NaN)}   (threshold ${pct(THRESHOLDS.criteriaCoverage)})`,
    );
    console.log(`  vacuous pass             ${String(totals.vacuousPass).padStart(4)}   (max ${THRESHOLDS.maxVacuousPass})`);
    console.log(`  still skipped            ${String(totals.stillSkipped).padStart(4)}   (max ${THRESHOLDS.maxStillSkipped})`);
    console.log(`  non-assertion exit       ${String(totals.nonAssertion).padStart(4)}   (max ${THRESHOLDS.maxNonAssertionExit})`);
    console.log(`  load errors              ${String(totals.loadErrors).padStart(4)}   (max ${THRESHOLDS.maxLoadErrors})`);
    console.log(`  unmapped tests           ${String(totals.unmapped).padStart(4)}   (max ${THRESHOLDS.maxUnmappedTests})`);
    console.log(
      `  production mutations     ${String(totals.productionMutations).padStart(4)}   (max ${THRESHOLDS.maxProductionMutations})`,
    );

    const failures = [];
    const redRate = measurements.redForIntendedReasonRate;
    if (redRate === null) failures.push('redForIntendedReasonRate (unmeasurable)');
    else if (redRate < THRESHOLDS.redForIntendedReasonRate) failures.push('redForIntendedReasonRate');
    const coverage = measurements.criteriaCoverage;
    if (coverage === null) failures.push('criteriaCoverage (unmeasurable)');
    else if (coverage < THRESHOLDS.criteriaCoverage) failures.push('criteriaCoverage');
    if (totals.vacuousPass > THRESHOLDS.maxVacuousPass) failures.push(`${totals.vacuousPass} vacuous pass(es)`);
    if (totals.stillSkipped > THRESHOLDS.maxStillSkipped) failures.push(`${totals.stillSkipped} still-skipped scaffold(s)`);
    if (totals.nonAssertion > THRESHOLDS.maxNonAssertionExit) failures.push(`${totals.nonAssertion} non-assertion exit(s)`);
    if (totals.loadErrors > THRESHOLDS.maxLoadErrors) failures.push(`${totals.loadErrors} load error(s)`);
    if (totals.unmapped > THRESHOLDS.maxUnmappedTests) failures.push(`${totals.unmapped} unmapped test(s)`);
    if (totals.productionMutations > THRESHOLDS.maxProductionMutations)
      failures.push(`${totals.productionMutations} production mutation(s)`);
    if (measurements.unstableCases > THRESHOLDS.maxUnstableCases) failures.push(`${measurements.unstableCases} unstable case(s)`);

    if (measurements.incompleteCases > 0) {
      const failureClass = worstFailureClass([...lostRunClasses, 'environment-incomplete-repetitions']);
      console.log(`  ${colors.red}fewer than ${runs} declared repetitions completed; stability is unmeasurable${colors.reset}\n`);
      runners.push(
        runnerRecord(agent, options, versions, {
          expected: runs,
          completed: completedRuns,
          measurements,
          durationMs: await elapsedMsSince(agentStartedAt),
          failureClass,
          failures: [...failures, `short of ${runs} repetitions`],
          diagnostics,
        }),
      );
      continue;
    }

    if (failures.length > 0) console.log(`  ${colors.red}below threshold: ${failures.join(', ')}${colors.reset}\n`);
    else console.log(`  ${colors.green}all thresholds met${colors.reset}\n`);

    runners.push(
      runnerRecord(agent, options, versions, {
        expected: runs,
        completed: completedRuns,
        measurements,
        durationMs: await elapsedMsSince(agentStartedAt),
        failureClass: failures.length > 0 ? 'quality' : 'none',
        failures,
        diagnostics,
      }),
    );
  }

  await finish({ options, startedAt, mode: 'live', groundTruth, runners });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`${colors.red}eval: ${error?.stack ?? error}${colors.reset}`);
    process.exit(2);
  });
}

module.exports = {
  runnerRecord,
  parseArgs,
  loadGroundTruth,
  validateCorpus,
  stageWorkspace,
  assertGroundTruthAbsent,
  buildPrompt,
  caseIndex,
  caseIds,
  scoreRun,
  signatureOf,
  atddDiagnosticProjection,
  atddDiagnosticClassifier,
  runRedCheck,
  RUNNER_CAPABILITIES,
  THRESHOLDS,
  SUITE_ID,
  CASE_ID,
  ATDD_INTERFACE,
  ATDD_OPERATION,
  RED_CHECK_PATH,
  CRITERION_ID,
  ATDD_SCAFFOLD_RELATIVE_PATH,
};
