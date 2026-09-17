/**
 * ci eval harness.
 *
 * `bmad-testarch-ci` reads a project, reads the pipeline its team asked for, and
 * writes a workflow file. This measures whether that file parses, whether it
 * lints, whether it carries each element the request named, and whether it
 * carries anything the request did not, against a corpus whose true answers
 * were written from the fixture design and from the workflow's own rules,
 * never from a run.
 *
 * WHY THIS SUITE EXISTS
 *
 * The manifest carried `bmad-testarch-ci` under `deferred` with one sentence of
 * missing evidence: the generated pipeline configuration was never parsed or
 * linted, so a syntactically invalid workflow would pass unnoticed. That is the
 * sentence this corpus answers. The two headline metrics count parse failures
 * and lint findings, and both ceilings are zero.
 *
 * HOW A RUN IS DRIVEN
 *
 * `tea-ci-runner` (cli/ci-runner.js) is the command, and its whole surface is a
 * prompt on standard input and an agent run in the working directory, so this
 * harness stages the project, assembles the prompt itself, and probes that
 * command through eval-quality's command-line adapter with the staged workspace
 * as the authorization's working directory. The one artifact the workflow
 * leaves behind that a linter can hold to account, `.github/workflows/test.yml`,
 * comes back on the observation as tagged `json`, `text`, or `absent`, which is
 * what lets a file the run never wrote be classified as a missing artifact
 * rather than read through an `existsSync` race. The registry in
 * test/lib/probe-targets.js authorizes the run before a process starts, caps its
 * output, and SIGKILLs it a minute after RUN_TIMEOUT_MS as a backstop; the
 * runner's own --timeout-ms is the clock that classifies.
 *
 * WHAT IS MEASURED
 *
 *   parse failures       the workflow file read through the yaml package in strict
 *                        mode; a file that does not parse is a defect, ceiling zero
 *   lint findings        every error actionlint reports under the flags pinned below,
 *                        ceiling zero
 *   requested elements   each element the request names, scored on its own against
 *                        the parsed document: a trigger with its branches or cron, a
 *                        permission scope at its level, a command as a standalone
 *                        invocation in a run: block, a gate by its shape, an upload
 *                        step by its path, condition and retention, and the Node
 *                        version by where it comes from
 *   trigger accuracy     the trigger elements on their own, because a workflow with
 *                        the wrong triggers never runs and every other element is moot
 *   unrequested elements every trigger, permission scope, test-runner invocation,
 *                        gate job and upload step the request did not ask for,
 *                        ceiling zero
 *   rule violations      the two rules the workflow states about its own output: no
 *                        unsafe context interpolated into a run: block, and no
 *                        continue-on-error on a step that runs tests, ceiling zero
 *   stability            the same scored answer on identical input, over everything above
 *   fixture mutations    the run must not change or delete a file the project came with
 *
 * WHAT ACTIONLINT IS RUN WITH
 *
 * The flags are pinned in ACTIONLINT below and recorded in every result record:
 * JSON output, no colour, and the shellcheck and pyflakes integrations turned
 * off, so the lint result is a fact about the workflow rather than about which
 * external linters the host happened to have. The version floats, because a
 * pinned tool version is a number somebody has to remember to bump; the
 * pre-flight refuses a version below ACTIONLINT.minimumVersion, whose flags this
 * harness depends on, and the version that ran is written into the result
 * record so two runs are only compared when they held it constant.
 *
 * THE RUN HAS NO SHELL
 *
 * The suite declares `scoped-artifact-writes`, as every sibling suite does, so
 * the agent can read and write the workspace and run nothing. Step 1 of the
 * workflow wants to run the project's tests locally and halt if they fail, and
 * a shell-less run cannot. The prompt says so and tells the run to record those
 * checks as not run and continue; nothing here attests that the fixture's tests
 * pass, because nothing here runs them.
 *
 * THE GROUND TRUTH IS NEVER IN THE AGENT'S CONTEXT
 *
 * Each case runs in a staged workspace holding one project, a resolved TEA
 * config, a minimal `.git/` so step 1's repository check and the platform
 * detection have something to read, and a copy of the skill. `ground-truth.json`
 * is not copied, and the pre-flight asserts it: no staged file carries its
 * bytes, no staged path is named for it, and the assembled prompt contains none
 * of the tokens that appear only in it. The request the run is scored against
 * is a file in the project, `docs/ci-requirements.md`, and --validate-only
 * resolves every element's `requestQuote` in it, so a run is scored only on
 * what it was asked.
 *
 * ONE PROJECT PER RUN
 *
 * The two projects are two services with two requests. Each is its own
 * workspace, its own agent call, and its own case.
 *
 * THREE MODES
 *
 *   --validate-only   Static. No vendor, no cost, no network. Asserts the corpus is
 *                     internally consistent, that every rule it cites still exists
 *                     under the section it names, that every declared project file
 *                     is on disk and nothing else is, that every requested element
 *                     is quoted from the request file, and that staging keeps the
 *                     ground truth out of the agent's workspace and prompt.
 *   --preflight-only  The static checks, then the runner and the linter: is the
 *                     agent executable on PATH, does it answer --version, does a
 *                     built-in vendor have a credential, is actionlint on PATH at
 *                     or above the floor. Exits before any model call. This is what
 *                     `eval:all --preflight-only` runs, and the argv the suite
 *                     manifest declares as preflightArgs.
 *   default           Spends a vendor run per project per repetition. It needs a
 *                     logged-in claude or codex.
 *
 * EVERY DECLARED REPETITION MUST COMPLETE
 *
 * Stability is a claim about repeated runs. A case that lost a run has fewer
 * observations than the gate declared, so it is unmeasurable and exits 2.
 *
 * Usage:
 *   node test/eval-ci.js --validate-only
 *   node test/eval-ci.js --preflight-only --agent codex
 *   node test/eval-ci.js --agent claude --runs 2
 *   node test/eval-ci.js --agent codex --set minimal-lantern-audit-log
 *   node test/eval-ci.js --agent custom --agent-cmd my-runner --agent-arg --headless
 *   node test/eval-ci.js --agent claude --json results/ci.json
 *
 * Exit codes:
 *   0  the corpus is valid (--validate-only), the runner is ready (--preflight-only),
 *      or every vendor met the thresholds
 *   1  a threshold was missed, or the corpus is inconsistent (a real result)
 *   2  the environment could not run the eval (nothing was measured): a missing
 *      credential, executable or linter, a timeout, a transport error, a missing or
 *      unreadable artifact, a runner that wrote outside its workspace, or fewer
 *      completed runs than were declared
 */

'use strict';

/*
 * WHAT STILL REACHES `fs` DIRECTLY, AND WHY
 *
 * The same four groups test/eval-nfr.js's header names, plus the linter's own
 * scratch file.
 *
 * - Directory walks and their guards, which enumerate a staged tree. The
 *   file-system port reads one caller-owned path and cannot read a directory at
 *   all.
 * - Pre-flight existence questions, over the ground truth and over the ci
 *   workflow directory. The workflow root is a directory; the ground truth check
 *   here is the same convention `preflight()` in test/eval-nfr.js keeps.
 * - Workspace lifecycle calls: `mkdtemp`, `mkdir`, `copyFile` and `rm` that
 *   create and remove the staged workspace and the minimal `.git/` inside it.
 *   Directory operations have no port method; the two `copyFile` calls are the
 *   same wrapper omission test/eval-nfr.js records.
 * - `lintWorkflow`'s own scratch file. It writes the workflow text into a
 *   directory this function created a line above and removes before returning,
 *   so there is no absence to answer and no caller-owned path to protect; the
 *   file exists only to give `actionlint` something to open.
 *
 * Every read of a file's contents whose absence is a real question, and every
 * write into a project's own tree, goes through `test/lib/file-system-port.js`.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const semver = require('semver');
const YAML = require('yaml');

const { AGENT_ADAPTERS, resolveModel } = require('../cli/lib/agent-adapters');
const { failureClassForExit } = require('../cli/ci-runner');
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
  diagnosticRateMiss,
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
const { readBytes, readJson, readText, writeText } = require('./lib/file-system-port');

const PROJECT_ROOT = path.join(__dirname, '..');
const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'ci-eval');
const GROUND_TRUTH = path.join(FIXTURE_ROOT, 'ground-truth.json');
const SKILL_ROOT = path.join(PROJECT_ROOT, 'src', 'workflows', 'testarch', 'bmad-testarch-ci');
const SUITE_ID = 'ci';

// A complete CI run reads four step files, the template, several knowledge
// fragments and the whole project, and writes a workflow, helper scripts and
// documentation, so it is a much longer call than a fragment selection. Twenty
// minutes bounds a hang without cutting off a slow but working run, which is
// the same clock the nfr and trace harnesses apply to comparable workflows.
const RUN_TIMEOUT_MINUTES = 20;
const RUN_TIMEOUT_MS = RUN_TIMEOUT_MINUTES * 60_000;

/**
 * What the runner is allowed to do, checked against the manifest's declaration by
 * tools/validate-eval-schemas.js the same way THRESHOLDS is. See THE RUN HAS NO
 * SHELL in the header.
 */
const RUNNER_CAPABILITIES = ['scoped-artifact-writes'];

/**
 * The command this harness probes, by the names test/lib/probe-targets.js and the
 * ci contract share.
 */
const CI_INTERFACE = 'tea-ci-runner';
const CI_OPERATION = 'generate-pipeline';

/**
 * The one platform this corpus targets and the path step-02 resolves for it.
 * validateCorpus holds ground-truth.json to the same two values, because
 * actionlint lints GitHub Actions and nothing else.
 */
const PLATFORM = 'github-actions';
const WORKFLOW_PATH = path.posix.join('.github', 'workflows', 'test.yml');

/**
 * The linter, with the flags pinned. See WHAT ACTIONLINT IS RUN WITH in the
 * header for why the flags are fixed and the version is not.
 *
 * `-format '{{json .}}'` makes the output one JSON array of findings, which is
 * the only machine-readable shape actionlint offers; `-shellcheck=` and
 * `-pyflakes=` are the empty-string spelling that disables each integration.
 * The file path is appended per call.
 */
const ACTIONLINT = {
  executable: 'actionlint',
  args: ['-no-color', '-format', '{{json .}}', '-shellcheck=', '-pyflakes='],
  // The floor is the oldest release whose flag semantics this harness was written
  // against. It never needs bumping: a newer actionlint passes, an older one is
  // refused at pre-flight with a reason.
  minimumVersion: '1.7.0',
};

/** A lint of one file answers in well under a second; thirty seconds is the hang bound. */
const LINT_TIMEOUT_MS = 30_000;

/** The kinds an expected element may declare, and what each one is checked with. */
const ELEMENT_KINDS = ['trigger', 'permission', 'node-version', 'command', 'gate', 'artifact'];

/** The gate shapes checkElement knows how to read. */
const GATE_SHAPES = ['lint-precedes-tests', 'matrix-shards', 'burn-in'];

/**
 * The invocations that run a test suite, in any run: block.
 *
 * An invocation matching one of these that no requested command covers is an
 * unrequested test command. The list is the one step-02 and step-03 name
 * across the stacks the workflow supports; a runner it does not name is not
 * counted, which errs toward under-reporting rather than toward inventing a
 * finding. Each pattern is bounded on both sides so `npm test` inside
 * `npm test:e2e` and `jest` inside `jest-junit` are not matches.
 */
const TEST_RUNNER_PATTERNS = [
  /(?<![\w-])npm test(?![\w:-])/g,
  /(?<![\w-])npm run test(?::[\w-]+)?(?![\w:-])/g,
  /(?<![\w-])(?:npx |pnpm |yarn )?playwright test(?![\w-])/g,
  /(?<![\w-])(?:npx |pnpm |yarn )?vitest(?: run)?(?![\w-])/g,
  /(?<![\w-])(?:npx |pnpm |yarn )?jest(?![\w-])/g,
  /(?<![\w-])(?:npx |pnpm |yarn )?cypress run(?![\w-])/g,
  /(?<![\w-])(?:python -m )?pytest(?![\w-])/g,
  /(?<![\w-])go test(?![\w-])/g,
  /(?<![\w-])(?:mvn|gradle|\.\/gradlew) test(?![\w-])/g,
  /(?<![\w-])dotnet test(?![\w-])/g,
  /(?<![\w-])bundle exec rspec(?![\w-])/g,
  /(?<![\w-])maestro test(?![\w-])/g,
];

/** A run: block that lints, for the unrequested-gate count when no lint gate was asked for. */
const LINT_INVOCATION = /(?<![\w-])(?:npm run lint|npx eslint|eslint |prettier --check)/;

/**
 * A retry wrapper action.
 *
 * Checked only against a project whose own request forbids it by name
 * (`set.isMinimalRequest`), never unconditionally. The skill's own
 * checklist calls for retry logic with no stack or request condition
 * ("Step 7: Retry Logic" carries no gate at all), so a full-request project
 * that wraps a flaky step in one of these is doing exactly what the
 * checklist asks for, not accumulating something nobody wanted.
 */
const RETRY_ACTION = /^(?:nick-fields|nick-invision|Wandalen)\/retry(?:@|$)/;

/**
 * The three unsafe contexts step-02 and the validate step name, inside a run:
 * block. `${{ inputs.* }}`, the whole `${{ github.event.* }}` namespace, and
 * `${{ github.head_ref }}`. The safe contexts the same step lists (steps
 * outputs, matrix, runner.os, github.sha, github.ref, secrets, env) are outside
 * this pattern on purpose.
 */
const UNSAFE_CONTEXT = /\$\{\{\s*(?:inputs\.[^}]*?|github\.event\.[^}]*?|github\.head_ref)\s*\}\}/g;

/**
 * The threshold each negative control in the corpus reaches a verdict through,
 * keyed by the control's id. validateCorpus holds the two lists equal in both
 * directions, as the nfr harness does.
 */
const NEGATIVE_CONTROL_ENFORCEMENT = {
  'configuration-must-parse': 'maxParseFailures',
  'configuration-must-lint-clean': 'maxLintFindings',
  'no-element-the-request-did-not-ask-for': 'maxUnrequestedElements',
  'no-unsafe-interpolation-in-run': 'maxWorkflowRuleViolations',
  'project-files-are-read-only': 'maxFixtureMutations',
};

/**
 * The exclusion each rejected case in the corpus states, as a predicate every
 * fixture set has to satisfy, keyed by the case's id.
 */
const REJECTED_CASE_EXCLUSIONS = {
  'platform-other-than-github-actions': (set, groundTruth) => groundTruth.platform === PLATFORM && groundTruth.outputPath === WORKFLOW_PATH,
  'request-stated-only-in-the-prompt': (set) =>
    typeof set.requestSource === 'string' && (set.projectFiles ?? []).includes(set.requestSource),
  'request-with-fewer-than-three-elements': (set) => (set.expectedElements ?? []).length >= 3,
};

/**
 * Keys that appear only in ground-truth.json. Finding one in a staged file or in
 * the prompt means the answers reached the agent, which invalidates the
 * measurement. Each is a key no workflow file, no fixture and no skill file
 * carries; assertGroundTruthAbsent is what holds that true.
 */
const GROUND_TRUTH_ONLY_TOKENS = ['expectedElements', 'requestQuote', 'mustNotEmit', 'isMinimalRequest'];

/**
 * The words that say what a project's request is for. None of them may appear
 * in a project root, because the root is a directory the agent works in and a
 * run that reads `minimal` in its own path has been told the answer.
 */
const ROLE_WORDS = ['full', 'minimal', 'clean', 'control', 'seeded', 'planted', 'template'];

/**
 * Thresholds. The two ceilings the suite exists for are zero; the recall carries
 * the judgment about the request; the trigger accuracy is the one element class
 * a workflow cannot get wrong and still run at all.
 */
const THRESHOLDS = {
  // A file the yaml package refuses in strict mode. The deliverable is a
  // configuration file, and one that does not parse is not one.
  maxParseFailures: 0,
  // Every error actionlint reports under the pinned flags: an undefined job in
  // `needs`, an unknown input on a known action, a type error in an expression,
  // an untrusted input interpolated into a script, a syntax error. Each is a
  // workflow that fails on its first push.
  maxLintFindings: 0,
  // Eighteen requested elements across the two projects, thirteen and five.
  // 0.9 admits one miss in the corpus and no more, which is the width of a
  // single defensible disagreement about how an element is spelled.
  requestedElementRecall: 0.9,
  // The four trigger elements on their own. A workflow whose triggers are
  // wrong never runs on the event the team asked for, so nothing else in it
  // matters, and the one disagreement the recall admits can never be a trigger.
  triggerAccuracy: 1,
  // A trigger, a permission scope, a test-runner invocation, a gate job or an
  // upload step the request did not ask for. The template is a starting point
  // to adapt, and the minimal request says outright that nothing beyond its
  // list is wanted, so the ceiling is zero.
  maxUnrequestedElements: 0,
  // The two rules the workflow states about its own output. Both are stated in
  // as many words, so there is nothing to admit.
  maxWorkflowRuleViolations: 0,
  // Identical input must produce the identical scored answer.
  //
  // No stored replay case can breach this one and none should be written. A
  // case is unstable when signatureOf differs across the repetitions of one
  // project, so breaching it takes two runs of the same workspace; a replay
  // case holds one workflow file. What exercises it is the repetition loop in
  // main(), at --runs 2 or more, and test/test-eval-replay.js's
  // checkCiSignatures, which holds signatureOf to covering everything scored and
  // nothing environmental.
  maxUnstableCases: 0,
  // The workflow scaffolds a pipeline and does not edit the project. A run that
  // rewrote package.json or a test has changed the benchmark. Added files are
  // not mutations, because adding files is what a scaffolder does.
  //
  // No stored replay case can breach this one either. A mutation is a
  // difference between the digest of the staged project before the run and
  // after it, and a replay corpus has no workspace to stage. What exercises it
  // is runCase's digestTree comparison over a real run, which
  // test/test-probe-targets.js drives against the stub.
  maxFixtureMutations: 0,
};

const colors = {
  reset: '[0m',
  red: '[31m',
  green: '[32m',
  yellow: '[33m',
  cyan: '[36m',
  dim: '[2m',
};

function fatal(code, message) {
  console.error(`${colors.red}eval: ${message}${colors.reset}`);
  process.exit(code);
}

function parseArgs(argv) {
  const agents = [];
  const sets = [];
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
      case '--set': {
        const value = argv[index + 1];
        if (!value) fatal(2, '--set requires a fixture set id');
        sets.push(value);
        index += 1;
        break;
      }
      case '--runs': {
        // Tested on the raw string before the parse. Number.parseInt truncates, so
        // values such as `2.5` and `3abc` otherwise become valid small run counts.
        const value = argv[index + 1] ?? '';
        if (!/^[0-9]+$/.test(value)) fatal(2, '--runs requires a positive integer');
        runs = Number.parseInt(value, 10);
        if (!Number.isInteger(runs) || runs < 1) fatal(2, '--runs requires a positive integer');
        index += 1;
        break;
      }
      case '--agent-cmd': {
        const value = argv[index + 1];
        if (!value) fatal(2, '--agent-cmd requires an executable path or name');
        // A path is resolved here, against the operator's working directory. The
        // runner executes in a staged workspace, so a relative path handed
        // through unchanged would resolve against that workspace and fail every
        // run after passing the pre-flight, which probes it from here. A bare
        // name stays a PATH lookup, which is the same everywhere.
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
  // Stability across one run is not a measurement. Say so rather than printing stable.
  if (runs < 2 && !validateOnly && !preflightOnly) {
    console.error(`${colors.yellow}note${colors.reset}: --runs ${runs} cannot measure stability; use --runs 2 or more.`);
  }
  return { agents, sets, runs, validateOnly, preflightOnly, agentCmd, agentArgs, envPass, model, jsonPath };
}

/* -------------------------------------------------------------------------- */
/* Ground truth                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Parse ground-truth.json.
 *
 * The existence check this used to open with is gone rather than converted: the
 * port answers absence, so asking first was a second reading of the same
 * question with a window between them.
 *
 * @returns {Promise<object|null>} Null when the file is missing or unparseable, so the
 *   caller can report that as an environment failure rather than crash inside a reporter.
 */
async function loadGroundTruth() {
  try {
    const read = await readJson(GROUND_TRUTH);
    return read.present ? read.value : null;
  } catch (error) {
    // A parse failure only. A bare catch would swallow every class the read can
    // raise, so a permission error, a directory in place of the file or an
    // aborted signal would all report as "missing or not valid JSON".
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

/** The fixture sets to run, filtered by --set when it was given. */
function selectSets(groundTruth, requested) {
  const all = groundTruth.fixtureSets ?? [];
  if (requested.length === 0) return all;
  return all.filter((set) => requested.includes(set.id));
}

/* -------------------------------------------------------------------------- */
/* Corpus validation                                                           */
/* -------------------------------------------------------------------------- */

/** Every file under a directory, as posix paths relative to it, sorted. */
function filesUnder(root) {
  const found = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) found.push(path.relative(root, absolute).split(path.sep).join('/'));
    }
  };
  if (fs.existsSync(root)) walk(root);
  return found;
}

/** The heading text of one markdown line, or null when the line is not a heading. */
function headingText(line) {
  const match = /^#{1,6}\s+(.*?)\s*$/.exec(line);
  return match ? match[1].replaceAll(/[#*`]/g, '').trim() : null;
}

/**
 * Every markdown heading text in a file's contents, for checking a citation's
 * named section.
 *
 * Takes the lines rather than the path, because the one caller has already read
 * the file to split it: reading it a second time is the same question twice with
 * a window in between.
 */
function headingsOf(lines) {
  const headings = new Set();
  for (const line of lines) {
    const text = headingText(line);
    if (text) headings.add(text);
  }
  return headings;
}

/**
 * The one-based line range a named section occupies, from its heading to the line
 * before the next heading of the same depth or shallower.
 */
function sectionRange(lines, section) {
  const index = lines.findIndex((line) => headingText(line) === section);
  if (index === -1) return null;
  const depth = /^(#{1,6})\s/.exec(lines[index])[1].length;
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const next = /^(#{1,6})\s/.exec(lines[cursor]);
    if (next && next[1].length <= depth) return { start: index + 1, end: cursor };
  }
  return { start: index + 1, end: lines.length };
}

/** Runs of whitespace collapsed, so a quote resolves across a wrapped line. */
function collapse(text) {
  return String(text).replaceAll(/\s+/g, ' ').trim();
}

/** The npm script one requested command runs, or null for a command that is not an npm script. */
function npmScriptOf(command) {
  const run = /^npm run (\S+)$/.exec(command);
  if (run) return run[1];
  if (command === 'npm test') return 'test';
  return null;
}

/**
 * Static validation of the corpus. This is what a pull request runs, and it is
 * what stops the ground truth from rotting into assertions about rules that moved
 * out of the files they were quoted from, or about elements nobody asked for.
 *
 * Problems are hard failures. Notices are recorded and printed without failing,
 * and they are reserved for a citation's line span: the section name is the stable
 * anchor and the line numbers drift whenever a step file is edited.
 *
 * @param {object} groundTruth
 * @returns {Promise<{problems: string[], notices: string[]}>}
 */
async function validateCorpus(groundTruth) {
  const problems = [];
  const notices = [];

  if (groundTruth.platform !== PLATFORM) {
    problems.push(`platform is "${groundTruth.platform}", this harness lints ${PLATFORM} and nothing else`);
  }
  if (groundTruth.outputPath !== WORKFLOW_PATH) {
    problems.push(`outputPath is "${groundTruth.outputPath}", this harness reads ${WORKFLOW_PATH}`);
  }

  const citations = groundTruth.skillRuleCitations ?? {};
  // Every rule the corpus rests an element on has to still exist under the
  // section it names and still say what the corpus says it says.
  for (const [key, citation] of Object.entries(citations)) {
    const absolute = path.join(PROJECT_ROOT, citation.file);
    // The existence check that used to guard this read is gone: the read answers
    // absence itself, and the same problem is reported off that answer.
    const cited = await readText(absolute);
    if (!cited.present) {
      problems.push(`skillRuleCitations.${key}: ${citation.file} does not exist`);
      continue;
    }
    const lines = cited.text.split('\n');
    if (typeof citation.section !== 'string' || citation.section.trim().length === 0) {
      problems.push(`skillRuleCitations.${key}: declares no section`);
      continue;
    }
    if (!headingsOf(lines).has(citation.section)) {
      problems.push(`skillRuleCitations.${key}: ${citation.file} has no section titled "${citation.section}"`);
      continue;
    }
    // The heading existing is not the rule existing. `requiredPhrase` is a short
    // verbatim fragment of the rule itself, so deleting what the rule says fails
    // here rather than drifting past.
    if (typeof citation.requiredPhrase !== 'string' || citation.requiredPhrase.trim().length === 0) {
      problems.push(`skillRuleCitations.${key}: declares no requiredPhrase, so nothing holds the cited section to still stating the rule`);
    } else {
      const phraseSection = sectionRange(lines, citation.section);
      const body = phraseSection ? lines.slice(phraseSection.start, phraseSection.end).join('\n') : '';
      if (!body.includes(citation.requiredPhrase)) {
        problems.push(
          `skillRuleCitations.${key}: section "${citation.section}" no longer contains ${JSON.stringify(citation.requiredPhrase)}, so the rule this corpus rests on is gone`,
        );
      }
    }
    const [start, end] = String(citation.lines).split('-').map(Number);
    const last = Number.isFinite(end) ? end : start;
    if (!Number.isFinite(start) || last > lines.length) {
      notices.push(`skillRuleCitations.${key}: cites lines ${citation.lines}, ${citation.file} has ${lines.length}`);
      continue;
    }
    const section = sectionRange(lines, citation.section);
    if (section && (start < section.start || last > section.end)) {
      notices.push(
        `skillRuleCitations.${key}: cites ${citation.file}:${citation.lines}, section "${citation.section}" now spans ${section.start}-${section.end}`,
      );
    }
  }

  if (!Array.isArray(groundTruth.fixtureSets) || groundTruth.fixtureSets.length === 0) {
    problems.push('fixtureSets is missing or empty');
    return { problems, notices };
  }

  const seenSetIds = new Set();
  const seenProjectRoots = new Set();
  for (const set of groundTruth.fixtureSets) {
    const label = `fixtureSets[${set.id || '(no id)'}]`;
    if (!set.id) problems.push(`${label}: no id`);
    if (seenSetIds.has(set.id)) problems.push(`${label}: duplicate id`);
    seenSetIds.add(set.id);

    // The project root is what makes a project an addressable input: the prompt
    // is written against it. Two sets sharing a root would send one prompt. A
    // root naming the set's role would hand the run the answer.
    if (set.projectRoot) {
      if (seenProjectRoots.has(set.projectRoot)) problems.push(`${label}: duplicate projectRoot "${set.projectRoot}"`);
      seenProjectRoots.add(set.projectRoot);
      if (!/^[a-z\d]+(?:-[a-z\d]+)*$/.test(set.projectRoot)) {
        problems.push(`${label}: projectRoot "${set.projectRoot}" is not a lowercase hyphenated directory name`);
      }
      for (const role of ROLE_WORDS) {
        if (set.projectRoot.includes(role)) problems.push(`${label}: projectRoot "${set.projectRoot}" names the set's role ("${role}")`);
      }
    } else {
      problems.push(`${label}: projectRoot is not declared`);
    }
    if (typeof set.remoteOwner !== 'string' || !/^[a-z\d]+(?:-[a-z\d]+)*$/.test(set.remoteOwner)) {
      problems.push(
        `${label}: remoteOwner is missing or is not a lowercase hyphenated name, and the staged .git/config names a remote under it`,
      );
    }
    if (typeof set.isMinimalRequest !== 'boolean') problems.push(`${label}: isMinimalRequest is not a boolean`);

    // The declared project file list is held equal to what is on disk in both
    // directions, for the reason the nfr harness gives: a shipped file the
    // corpus never describes is an input the ground truth says nothing about,
    // and a described file nobody ships is a name that resolves to nothing.
    const setRoot = set.root ? path.join(FIXTURE_ROOT, set.root) : null;
    let onDisk = [];
    if (!setRoot || !fs.existsSync(setRoot)) {
      problems.push(`${label}: root ${set.root ?? '(not declared)'} does not exist under test/fixtures/ci-eval/`);
    } else {
      onDisk = filesUnder(setRoot);
      const declared = [...(set.projectFiles ?? [])].sort();
      for (const relative of declared) {
        if (!onDisk.includes(relative)) problems.push(`${label}: projectFiles names ${relative}, which is not under ${set.root}/`);
      }
      for (const relative of onDisk) {
        if (!declared.includes(relative)) problems.push(`${label}: ${set.root}/${relative} is staged and projectFiles does not declare it`);
      }
      // Required and non-empty rather than checked only when truthy, for the
      // reason the nfr harness records: an empty string satisfies a presence test
      // and then names no file.
      if (typeof set.requestSource !== 'string' || set.requestSource.trim().length === 0) {
        problems.push(`${label}: requestSource is missing or empty, so nothing names where this project states its request`);
      } else if (!onDisk.includes(set.requestSource)) {
        problems.push(`${label}: requestSource ${set.requestSource} is not a file in this project`);
      }
      // The Node version the corpus expects a run to read is the one the file
      // states, held equal so the node-version element cannot pass on a number
      // typed twice. The existence check that used to guard this read is gone:
      // the read answers absence itself.
      if (typeof set.nvmrcVersion !== 'string' || set.nvmrcVersion.trim().length === 0) {
        problems.push(`${label}: nvmrcVersion is missing or empty`);
      } else {
        const nvmrc = await readText(path.join(setRoot, '.nvmrc'));
        if (!nvmrc.present) {
          problems.push(`${label}: declares nvmrcVersion and ships no .nvmrc`);
        } else if (nvmrc.text.trim() !== set.nvmrcVersion) {
          problems.push(`${label}: nvmrcVersion is ${set.nvmrcVersion} and .nvmrc says ${nvmrc.text.trim()}`);
        }
      }
    }

    let requestText = null;
    if (setRoot && typeof set.requestSource === 'string') {
      const requested = await readText(path.join(setRoot, set.requestSource));
      if (requested.present) requestText = collapse(requested.text);
    }
    let scripts = null;
    if (setRoot) {
      try {
        const packageJson = await readJson(path.join(setRoot, 'package.json'));
        if (packageJson.present) scripts = packageJson.value.scripts ?? {};
      } catch (error) {
        if (error instanceof SyntaxError) problems.push(`${label}: package.json is not valid JSON`);
        else throw error;
      }
    }

    const elements = set.expectedElements ?? [];
    if (elements.length === 0) problems.push(`${label}: declares no expectedElements, so nothing is requested and nothing can be scored`);
    const seenElementIds = new Set();
    for (const element of elements) {
      const elementLabel = `${label}.expectedElements[${element.id || '(no id)'}]`;
      if (!element.id) problems.push(`${elementLabel}: no id`);
      if (seenElementIds.has(element.id)) problems.push(`${elementLabel}: duplicate id`);
      seenElementIds.add(element.id);
      if (!ELEMENT_KINDS.includes(element.kind)) {
        problems.push(`${elementLabel}: kind "${element.kind}" is not one of [${ELEMENT_KINDS.join(', ')}]`);
        continue;
      }
      if (!citations[element.rule]) {
        problems.push(`${elementLabel}: rule "${element.rule}" names no entry in skillRuleCitations`);
      }
      // Every element is a quote from the request file. A requested element the
      // request does not state is a score against something the run was never
      // asked, which is the mistake this check exists to refuse.
      if (typeof element.requestQuote !== 'string' || element.requestQuote.trim().length === 0) {
        problems.push(`${elementLabel}: declares no requestQuote, so nothing holds the request file to asking for it`);
      } else if (requestText !== null && !requestText.includes(collapse(element.requestQuote))) {
        problems.push(`${elementLabel}: requestQuote ${JSON.stringify(element.requestQuote)} does not appear in ${set.requestSource}`);
      }
      // A contract token is a literal the contract's own oracle searches the
      // document for, and an empty one is satisfied by every document. Null
      // means the element states no token, which is a decision rather than a gap.
      if (element.contractToken !== null && (typeof element.contractToken !== 'string' || element.contractToken.trim().length === 0)) {
        problems.push(`${elementLabel}: contractToken is neither null nor a non-empty string`);
      }
      switch (element.kind) {
        case 'trigger': {
          if (typeof element.event !== 'string' || element.event.length === 0) problems.push(`${elementLabel}: trigger declares no event`);
          if (element.branches !== undefined && (!Array.isArray(element.branches) || element.branches.length === 0)) {
            problems.push(`${elementLabel}: branches is declared and is not a non-empty list`);
          }
          if (element.cron !== undefined && (typeof element.cron !== 'string' || element.cron.trim().length === 0)) {
            problems.push(`${elementLabel}: cron is declared and is not a non-empty string`);
          }
          break;
        }
        case 'permission': {
          if (typeof element.scope !== 'string' || typeof element.level !== 'string') {
            problems.push(`${elementLabel}: permission declares no scope or no level`);
          }
          break;
        }
        case 'command': {
          if (typeof element.command !== 'string' || element.command.trim().length === 0) {
            problems.push(`${elementLabel}: command is missing or empty`);
            break;
          }
          const script = npmScriptOf(element.command);
          if (script !== null && scripts !== null && !Object.hasOwn(scripts, script)) {
            problems.push(`${elementLabel}: asks for "${element.command}" and the project's package.json declares no "${script}" script`);
          }
          break;
        }
        case 'gate': {
          if (!GATE_SHAPES.includes(element.gate)) {
            problems.push(`${elementLabel}: gate "${element.gate}" is not one of [${GATE_SHAPES.join(', ')}]`);
            break;
          }
          if (typeof element.command !== 'string' || element.command.trim().length === 0) {
            problems.push(`${elementLabel}: gate declares no command`);
            break;
          }
          const script = npmScriptOf(element.command);
          if (script !== null && scripts !== null && !Object.hasOwn(scripts, script)) {
            problems.push(`${elementLabel}: gate runs "${element.command}" and the project's package.json declares no "${script}" script`);
          }
          if (element.gate === 'lint-precedes-tests' && (!Array.isArray(element.testCommands) || element.testCommands.length === 0)) {
            problems.push(`${elementLabel}: lint-precedes-tests declares no testCommands to wait for it`);
          }
          if (element.gate === 'matrix-shards' && (!Number.isInteger(element.shards) || element.shards < 2 || element.failFast !== false)) {
            problems.push(`${elementLabel}: matrix-shards declares no shard count above one or leaves failFast anything other than false`);
          }
          if (element.gate === 'burn-in' && (!Number.isInteger(element.iterations) || element.iterations < 2)) {
            problems.push(`${elementLabel}: burn-in declares no iteration count above one`);
          }
          break;
        }
        case 'artifact': {
          if (typeof element.pathToken !== 'string' || element.pathToken.trim().length === 0) {
            problems.push(`${elementLabel}: artifact declares no pathToken`);
          }
          if (typeof element.onFailureOnly !== 'boolean') problems.push(`${elementLabel}: onFailureOnly is not a boolean`);
          if (element.retentionDays !== undefined && !Number.isInteger(element.retentionDays)) {
            problems.push(`${elementLabel}: retentionDays is declared and is not an integer`);
          }
          break;
        }
        default: {
          break;
        }
      }
    }
    if (!elements.some((element) => element.kind === 'trigger')) {
      problems.push(`${label}: requests no trigger, so nothing says when the pipeline should run`);
    }

    // The minimal request forbids things by name, and each forbidden thing is a
    // token the contract's oracle can search the document for. A non-minimal set
    // forbids nothing, because its request is what it asks for and the
    // unrequested count is what catches the rest.
    const forbidden = set.mustNotEmit ?? [];
    if (set.isMinimalRequest === true && forbidden.length === 0) {
      problems.push(`${label}: is the minimal request and declares nothing under mustNotEmit`);
    }
    for (const [index, entry] of forbidden.entries()) {
      if (typeof entry?.token !== 'string' || entry.token.trim().length === 0) {
        problems.push(`${label}.mustNotEmit[${index}]: token is missing or empty, which every document satisfies`);
      }
    }
  }

  // A corpus with no minimal request has no control against a run that emits
  // everything, and one with no full request measures nothing about keeping
  // elements through adaptation.
  if (!groundTruth.fixtureSets.some((set) => set.isMinimalRequest === true)) {
    problems.push('no fixture set is the minimal request, so a workflow that emits everything would clear this suite');
  }
  if (!groundTruth.fixtureSets.some((set) => set.isMinimalRequest === false)) {
    problems.push('no fixture set carries a full request, so nothing measures whether elements survive adaptation');
  }

  // Every negative control the corpus declares is enforced by a threshold this
  // harness applies, and every enforcement row names a control the corpus still
  // declares.
  const controls = groundTruth.negativeControls ?? [];
  for (const control of controls) {
    const key = NEGATIVE_CONTROL_ENFORCEMENT[control.id];
    if (!key) {
      problems.push(
        `negativeControls[${control.id ?? '(no id)'}]: no row in NEGATIVE_CONTROL_ENFORCEMENT names the threshold that enforces it`,
      );
    } else if (!Object.hasOwn(THRESHOLDS, key)) {
      problems.push(
        `negativeControls[${control.id}]: NEGATIVE_CONTROL_ENFORCEMENT names threshold "${key}", which THRESHOLDS does not declare`,
      );
    }
  }
  for (const id of Object.keys(NEGATIVE_CONTROL_ENFORCEMENT)) {
    if (!controls.some((control) => control.id === id)) {
      problems.push(`NEGATIVE_CONTROL_ENFORCEMENT names "${id}", which negativeControls does not declare`);
    }
  }

  // Every rejected case is an exclusion every fixture set has to satisfy.
  const rejected = groundTruth.rejectedCases ?? [];
  for (const entry of rejected) {
    const holds = REJECTED_CASE_EXCLUSIONS[entry.id];
    if (!holds) {
      problems.push(`rejectedCases[${entry.id ?? '(no id)'}]: no predicate in REJECTED_CASE_EXCLUSIONS checks the exclusion`);
      continue;
    }
    for (const set of groundTruth.fixtureSets) {
      if (!holds(set, groundTruth))
        problems.push(`rejectedCases[${entry.id}]: fixtureSets[${set.id}] carries the case the corpus says it rejects`);
    }
  }
  for (const id of Object.keys(REJECTED_CASE_EXCLUSIONS)) {
    if (!rejected.some((entry) => entry.id === id)) {
      problems.push(`REJECTED_CASE_EXCLUSIONS names "${id}", which rejectedCases does not declare`);
    }
  }

  return { problems, notices };
}

/* -------------------------------------------------------------------------- */
/* Workspace staging                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Digest of a file list, keyed by relative path so a rename shows up.
 *
 * The `try`/`catch` that separated `ENOENT` from everything else is gone: the
 * port makes absence a value and raises the rest, so the marker is written where
 * the read says the file was not there and a permission error still reaches the
 * caller.
 */
async function digestTree(root, relativePaths) {
  const parts = [];
  for (const relative of [...relativePaths].sort()) {
    const read = await readBytes(path.join(root, relative));
    if (read.present) parts.push(relative, read.bytes);
    else parts.push(relative, '\0missing', relative);
  }
  return digest(parts);
}

/**
 * The one artifact the runner leaves behind that this harness reads, as the
 * authorization's artifact map names it.
 *
 * The path is relative to the authorization's working directory, which is the
 * staged workspace, so it names the project's own root rather than the
 * workflow's default under a project root that is the working directory.
 *
 * @param {object} set
 * @returns {{workflow: string}}
 */
function ciArtifactPaths(set) {
  return { workflow: path.join(set.projectRoot, WORKFLOW_PATH) };
}

/** The resolved TEA config the staged run reads its placeholders from. */
function configYaml(set) {
  return [
    '# Written by test/eval-ci.js for one staged project.',
    '# test_artifacts points inside this workspace only, so the progress file the run writes',
    '# lands beside the project it scaffolded and nowhere else.',
    'user_name: tea-eval-harness',
    `project_name: ${set.projectRoot}`,
    'communication_language: English',
    'document_output_language: English',
    'output_folder: docs',
    'test_artifacts: test-artifacts',
    '# Both library flags are off. Neither project carries the packages, and with a flag on',
    '# step-01 would route the run to the framework workflow instead of scaffolding the',
    '# plain pipeline the request asks for.',
    'tea_use_playwright_utils: false',
    'tea_use_pactjs_utils: false',
    '# Sequential keeps the step-02 workers in this process. A subagent mode would have them',
    '# write under /tmp, outside the workspace the capability declaration scopes the run to.',
    'tea_execution_mode: sequential',
    'tea_capability_probe: false',
    '',
  ].join('\n');
}

/**
 * The smallest `.git/` step 1 accepts: a HEAD, a config naming an origin on
 * github.com, and the two directories git itself creates empty. Step 1 halts
 * with "Git repository required" when the directory is missing and reads the
 * remote to infer the platform, and actionlint finds a project root by the same
 * directory, so the staged project carries one the harness writes rather than
 * one the corpus ships, since git will not track a nested repository.
 */
async function writeMinimalGitDirectory(projectDir, set) {
  const gitDir = path.join(projectDir, '.git');
  fs.mkdirSync(path.join(gitDir, 'objects', 'info'), { recursive: true });
  fs.mkdirSync(path.join(gitDir, 'objects', 'pack'), { recursive: true });
  fs.mkdirSync(path.join(gitDir, 'refs', 'heads'), { recursive: true });
  fs.mkdirSync(path.join(gitDir, 'refs', 'tags'), { recursive: true });
  await writeText(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
  await writeText(
    path.join(gitDir, 'config'),
    [
      '[core]',
      '\trepositoryformatversion = 0',
      '\tfilemode = true',
      '\tbare = false',
      '[remote "origin"]',
      `\turl = https://github.com/${set.remoteOwner}/${set.projectRoot}.git`,
      '\tfetch = +refs/heads/*:refs/remotes/origin/*',
      '[branch "main"]',
      '\tremote = origin',
      '\tmerge = refs/heads/main',
      '',
    ].join('\n'),
  );
}

/**
 * Stage one project into a disposable workspace.
 *
 * Layout, with the workspace itself as the agent's working directory:
 *
 *   <projectRoot>/   the project, plus a resolved _bmad/tea/config.yaml, an empty
 *                    test-artifacts/, and the minimal .git/ above
 *   skill/           the bmad-testarch-ci workflow, copied verbatim
 *
 * The project root is the set's own, so the prompt that names it says which
 * project the run scaffolds. The skill sits outside the project root on purpose:
 * its templates are complete pipelines, and a project that contained them would
 * hand the run a workflow file to copy.
 *
 * @param {object} set
 * @returns {Promise<{dir: string, projectDir: string, projectFiles: string[], projectDigest: string}>}
 */
async function stageWorkspace(set) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-ci-eval-'));
  try {
    return await stageIntoWorkspace(dir, set);
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}

async function stageIntoWorkspace(dir, set) {
  const projectDir = path.join(dir, set.projectRoot);
  const setRoot = path.join(FIXTURE_ROOT, set.root);

  for (const relative of filesUnder(setRoot)) {
    const target = path.join(projectDir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(setRoot, relative), target);
  }

  fs.mkdirSync(path.join(projectDir, 'test-artifacts'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, '_bmad', 'tea'), { recursive: true });
  await writeText(path.join(projectDir, '_bmad', 'tea', 'config.yaml'), configYaml(set));
  await writeMinimalGitDirectory(projectDir, set);

  for (const relative of filesUnder(SKILL_ROOT)) {
    const target = path.join(dir, 'skill', relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(SKILL_ROOT, relative), target);
  }

  // The project files the run must leave alone: exactly what the corpus
  // shipped, which validateCorpus holds equal to `projectFiles`. Everything the
  // harness wrote and everything the run adds is outside the list.
  const projectFiles = filesUnder(setRoot);
  return { dir, projectDir, projectFiles, projectDigest: await digestTree(projectDir, projectFiles) };
}

/**
 * Assert the staged workspace holds no part of the ground truth.
 *
 * @param {string} dir Workspace root.
 * @returns {Promise<string[]>} Problems, empty when the workspace is clean.
 */
async function assertGroundTruthAbsent(dir) {
  const problems = [];
  // Both existence checks are gone: each read answers absence itself. A staged
  // file that vanished between the walk and the read used to throw out of a
  // validator whose whole job is to report, and is reported now.
  const groundTruthBytes = (await readText(GROUND_TRUTH)).text;
  for (const relative of filesUnder(dir)) {
    if (path.basename(relative) === 'ground-truth.json') {
      problems.push(`staged workspace contains ${relative}`);
      continue;
    }
    const staged = await readText(path.join(dir, relative));
    if (!staged.present) {
      problems.push(`staged file ${relative} disappeared between the walk and the read, so it was not checked`);
      continue;
    }
    const text = staged.text;
    if (groundTruthBytes && text === groundTruthBytes) {
      problems.push(`staged file ${relative} carries the ground truth verbatim`);
      continue;
    }
    for (const token of GROUND_TRUTH_ONLY_TOKENS) {
      if (text.includes(token)) problems.push(`staged file ${relative} carries the ground-truth-only key "${token}"`);
    }
  }
  return problems;
}

/* -------------------------------------------------------------------------- */
/* Prompt                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The prompt one project gets.
 *
 * Every path is relative to the workspace, which keeps the text identical across
 * runs and machines and makes its digest something a later run can compare with.
 *
 * It states the run's configuration and nothing about the answers: no element
 * is named, no trigger, command or artifact is spelled out, and the request is
 * left to be read from the file the project keeps it in, the way step 1 reads
 * everything else about the project. The one fact about the project the prompt
 * carries is its root, which is what makes it an addressable input.
 *
 * `ciPlatform` is the one configuration value a caller may vary. The harness
 * never does; the ci contract's sensitivity witness does, because step-02
 * resolves the output path from the platform, so two prompts differing in that
 * one value produce a workflow file at `.github/workflows/test.yml` on one leg
 * and nothing at that path on the other.
 *
 * @param {object} set
 * @param {{ciPlatform?: string}} [options]
 * @returns {string}
 */
function buildPrompt(set, { ciPlatform = PLATFORM } = {}) {
  const root = set.projectRoot;
  return [
    `You are running the TEA workflow \`bmad-testarch-ci\` against the project in \`${root}/\`.`,
    '',
    'The workflow is in `skill/`. Read `skill/instructions.md` first, then execute every step file it',
    'names in order, in full, without skipping or reordering. The step files are under `skill/steps-c/`.',
    '',
    '----- run configuration -----',
    'Resolve the workflow placeholders and variables to these values:',
    '',
    `- \`{project-root}\`: \`${root}\``,
    `- \`{config_source}\`: \`${root}/_bmad/tea/config.yaml\``,
    `- \`{test_artifacts}\`: \`${root}/test-artifacts\``,
    '- `{skill-root}`: `skill`',
    `- \`ci_platform\`: \`${ciPlatform}\``,
    `- \`test_dir\`: \`${root}/tests\``,
    '',
    `The pipeline this project needs is stated in \`${root}/${set.requestSource}\`, which its team wrote. Treat it as`,
    'the decisions the pipeline has to carry, and read the rest of the project the way step 1 says to.',
    '',
    'This workspace has no shell, so the checks in step 1 that run a command, such as running the test suite',
    'locally or confirming that dependencies are installed, cannot be executed here. Record each of those as',
    'not run and continue; do not halt on them. Everything else step 1 asks about is readable from the tree.',
    '',
    '----- what to produce -----',
    `Write the pipeline configuration to the path step 2 resolves for \`ci_platform\` under \`${root}/\`, and write`,
    `\`${root}/test-artifacts/ci-pipeline-progress.md\` as the steps direct.`,
    '',
    `Do not edit or delete any file that was under \`${root}/\` when you started. This workflow adds a pipeline to a`,
    'project and changes nothing the project already had.',
    '',
    'When you are done, print one line naming the pipeline file you wrote. Nothing else you print is read.',
  ].join('\n');
}

/** Every case with the exact prompt it is sent. */
function caseIndex(sets) {
  return sets.map((set) => ({ id: set.id, prompt: buildPrompt(set) }));
}

/**
 * The ids of the cases this suite scores: one per project, which is one staged
 * workspace and one agent call. tools/validate-eval-schemas.js checks the
 * manifest's `caseCount` against the length of this.
 *
 * @returns {Promise<string[]>}
 */
async function caseIds() {
  return ((await loadGroundTruth())?.fixtureSets ?? []).map((set) => set.id);
}

/* -------------------------------------------------------------------------- */
/* Workflow reading                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The workflow file read through the yaml package in strict mode.
 *
 * YAML 1.2 core schema, which is what the package defaults to and what GitHub
 * reads: `on` is a plain key rather than the YAML 1.1 boolean, and a duplicate
 * key is an error rather than a silent override. The first line of each error
 * is kept, because the package's messages go on to quote the source.
 *
 * @param {string} text
 * @returns {{ok: true, workflow: object}|{ok: false, errors: string[]}}
 */
function parseWorkflow(text) {
  const document = YAML.parseDocument(String(text), { uniqueKeys: true, strict: true });
  if (document.errors.length > 0) {
    return { ok: false, errors: document.errors.map((error) => `${error.code}: ${String(error.message).split('\n')[0]}`) };
  }
  const value = document.toJS({ mapAsMap: false });
  // A document that parses to a scalar, a list or nothing is not a workflow. It
  // is scored as one that carries no element, and actionlint says why.
  return { ok: true, workflow: value && typeof value === 'object' && !Array.isArray(value) ? value : {} };
}

/** The first line of `actionlint -version`, which is the bare version, or null when the probe failed. */
function actionlintVersion() {
  const probe = boundedProbe(ACTIONLINT.executable, ['-version']);
  if (!probe.ok) return { ok: false, probe };
  const version = String(probe.stdout ?? '')
    .trim()
    .split('\n')[0]
    .trim();
  return { ok: true, version };
}

/**
 * The workflow linted with actionlint under the pinned flags.
 *
 * The text is written to `.github/workflows/test.yml` under a fresh directory
 * rather than linted where the run left it, so a stored replay case and a live
 * observation go through one path and the linter sees the same file name in
 * both. actionlint exits 1 when it found something and 0 when it did not, and
 * both are measured results; every other exit is the environment.
 *
 * @param {string} text
 * @returns {{ok: true, findings: Array<{kind: string, message: string, line: number|null}>}
 *          |{ok: false, failureClass: string, reason: string}}
 */
function lintWorkflow(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-ci-lint-'));
  try {
    const file = path.join(dir, WORKFLOW_PATH);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, String(text), 'utf8');
    const result = spawnSync(ACTIONLINT.executable, [...ACTIONLINT.args, file], {
      cwd: dir,
      encoding: 'utf8',
      timeout: LINT_TIMEOUT_MS,
      killSignal: 'SIGKILL',
    });
    if (result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGKILL') {
      return {
        ok: false,
        failureClass: 'environment-timeout',
        reason: `actionlint did not finish within ${LINT_TIMEOUT_MS}ms and was killed`,
      };
    }
    if (result.error) {
      return {
        ok: false,
        failureClass: 'environment-configuration',
        reason: `actionlint could not be run (${result.error.code ?? result.error.message}); install it and put it on PATH`,
      };
    }
    if (result.status !== 0 && result.status !== 1) {
      const tail = String(result.stderr ?? '')
        .trim()
        .split('\n')
        .filter(Boolean)
        .slice(-2)
        .join(' | ');
      return { ok: false, failureClass: 'environment-transport', reason: `actionlint exited ${result.status}: ${tail || 'no diagnostic'}` };
    }
    let parsed;
    try {
      parsed = JSON.parse(String(result.stdout ?? '').trim() || '[]');
    } catch {
      return {
        ok: false,
        failureClass: 'environment-parser',
        reason: 'actionlint printed something other than the JSON array its -format asks for',
      };
    }
    if (!Array.isArray(parsed)) {
      return { ok: false, failureClass: 'environment-parser', reason: 'actionlint printed JSON that is not an array of findings' };
    }
    return {
      ok: true,
      findings: parsed.map((entry) => ({
        kind: String(entry?.kind ?? 'unknown'),
        message: String(entry?.message ?? ''),
        line: Number.isInteger(entry?.line) ? entry.line : null,
      })),
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The workflow text off the tagged artifact the probe observation carries.
 *
 * `absent` is a run that never wrote the file, and a missing artifact. `json`
 * is a file JSON.parse accepts, which is also YAML GitHub accepts, so it is
 * serialized back to text and read like any other; `text` is read as is.
 *
 * @param {{kind: string, value?: unknown}} artifact
 * @returns {{ok: true, text: string}|{ok: false, failureClass: string, reason: string}}
 */
function workflowFromArtifact(artifact) {
  if (!artifact || artifact.kind === 'absent') {
    return { ok: false, failureClass: 'environment-missing-artifact', reason: `no ${WORKFLOW_PATH} was written` };
  }
  if (artifact.kind === 'json') return { ok: true, text: `${JSON.stringify(artifact.value, null, 2)}\n` };
  if (artifact.kind !== 'text' || typeof artifact.value !== 'string') {
    return { ok: false, failureClass: 'environment-parser', reason: `${WORKFLOW_PATH} is not a text document` };
  }
  return { ok: true, text: artifact.value };
}

/**
 * The workflow as a file on disk, tagged the way the adapter would tag it and
 * then read through workflowFromArtifact, so a stored replay case and a live
 * observation go through one reader.
 *
 * @param {string} directory Directory holding `.github/workflows/test.yml`.
 * @returns {Promise<{ok: true, text: string}|{ok: false, failureClass: string, reason: string}>}
 */
async function readWorkflow(directory) {
  // The existence check that used to guard this read is gone: the read answers
  // absence, and `absent` is the tagged artifact a run that wrote nothing leaves.
  const read = await readText(path.join(directory, WORKFLOW_PATH));
  return workflowFromArtifact(read.present ? { kind: 'text', value: read.text } : { kind: 'absent' });
}

/**
 * Whether the workflow, read as one string, carries a literal.
 *
 * This is the document-global predicate the ci contract's oracles are paired
 * with. The contract's vocabulary addresses a text artifact as one string, so a
 * `containment` oracle can ask whether the document mentions `npm test` and
 * cannot ask whether a run: block invokes it. The harness scores the second
 * question through checkElement; this function answers the first, and
 * test/test-contract-oracles.js holds each oracle to agreeing with it.
 *
 * @param {string} text
 * @param {string} literal
 * @returns {boolean}
 */
function workflowMentions(text, literal) {
  return String(text).includes(literal);
}

/* -------------------------------------------------------------------------- */
/* Scoring                                                                     */
/* -------------------------------------------------------------------------- */

function escapeRegex(text) {
  return String(text).replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/** A list from a value that YAML may spell as one item or as many. */
function asList(value) {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * The `on` block as a map from event name to its configuration, whichever of
 * the three spellings the workflow used: one string, a list of strings, or a
 * map from event to configuration.
 */
function triggersOf(workflow) {
  const on = workflow?.on;
  const found = new Map();
  if (typeof on === 'string') {
    found.set(on, null);
  } else if (Array.isArray(on)) {
    for (const event of on) {
      if (typeof event === 'string') found.set(event, null);
    }
  } else if (on && typeof on === 'object') {
    for (const [event, config] of Object.entries(on)) found.set(event, config ?? null);
  }
  return found;
}

/** Every job as `[id, job]`, skipping anything that is not a mapping. */
function jobsOf(workflow) {
  const jobs = workflow?.jobs;
  if (!jobs || typeof jobs !== 'object' || Array.isArray(jobs)) return [];
  return Object.entries(jobs).filter(([, job]) => job && typeof job === 'object' && !Array.isArray(job));
}

/** The steps of one job, as `{index, step}`, skipping anything that is not a mapping. */
function stepsOf(job) {
  return asList(job?.steps)
    .map((step, index) => ({ index, step }))
    .filter(({ step }) => step && typeof step === 'object' && !Array.isArray(step));
}

/** Every step in the workflow with the job it belongs to. */
function allSteps(workflow) {
  return jobsOf(workflow).flatMap(([jobId, job]) => stepsOf(job).map(({ index, step }) => ({ jobId, job, index, step })));
}

/** Every run: script in the workflow, as a string, with where it is. */
function runScripts(workflow) {
  return allSteps(workflow)
    .filter(({ step }) => typeof step.run === 'string' || typeof step.run === 'number')
    .map((entry) => ({ ...entry, script: String(entry.step.run) }));
}

/** The run: scripts of one job, as strings. */
function jobScripts(job) {
  return stepsOf(job)
    .filter(({ step }) => typeof step.run === 'string' || typeof step.run === 'number')
    .map(({ step }) => String(step.run));
}

/** Whether a step uses a given action, at any version. */
function usesAction(step, action) {
  return typeof step.uses === 'string' && (step.uses === action || step.uses.startsWith(`${action}@`));
}

/**
 * A command as a standalone invocation: at the start of a line or after a shell
 * separator, and followed by the end, whitespace or a separator, so `npm test`
 * is not found inside `npm test:e2e` and `npm run lint` is not found inside
 * `npm run lint:fix`.
 */
function commandPattern(command) {
  return new RegExp(String.raw`(?:^|[\s;&|(])${escapeRegex(command)}(?=$|[\s;&|)])`, 'm');
}

/** Whether any script in the list invokes the command. */
function invokes(scripts, command) {
  const pattern = commandPattern(command);
  return scripts.some((script) => pattern.test(script));
}

/** The `needs` of a job, as a list of job ids. */
function needsOf(job) {
  return asList(job?.needs).map(String);
}

/** Every job id a job waits for, directly or through the jobs it waits for. */
function needsClosure(jobs, jobId) {
  const byId = new Map(jobs);
  const seen = new Set();
  const pending = [...needsOf(byId.get(jobId))];
  while (pending.length > 0) {
    const next = pending.pop();
    if (seen.has(next)) continue;
    seen.add(next);
    pending.push(...needsOf(byId.get(next)));
  }
  return seen;
}

/** The text of an upload step's `path`, which may be one string or a list. */
function pathText(value) {
  return asList(value).map(String).join('\n');
}

/** Whether a job is a burn-in job, by its id or its display name. */
function isBurnInJob(jobId, job) {
  return /burn[-_ ]?in/i.test(jobId) || (typeof job?.name === 'string' && /burn[-_ ]?in/i.test(job.name));
}

/** Whether a job carries a shard matrix. */
function hasShardMatrix(job) {
  const matrix = job?.strategy?.matrix;
  return Boolean(matrix) && typeof matrix === 'object' && !Array.isArray(matrix) && Object.hasOwn(matrix, 'shard');
}

/**
 * Whether one setup-node step takes its version from `.nvmrc`, in any of the
 * three spellings a workflow uses: `node-version-file` naming the file, a
 * literal `node-version` equal to what the file says, or a `node-version`
 * expression reading a step output that an earlier run: step in the same job
 * produced from the file. The template ships the third.
 */
function nodeVersionFromNvmrc(job, index, step, version) {
  const inputs = step.with && typeof step.with === 'object' ? step.with : {};
  const file = inputs['node-version-file'];
  if (typeof file === 'string' && /(?:^|\/)\.nvmrc$/.test(file.trim())) return true;
  const value = inputs['node-version'];
  if (value === undefined || value === null) return false;
  const text = String(value).trim();
  if (text === version) return true;
  if (/^\$\{\{\s*steps\.[\w-]+\.outputs\.[\w-]+\s*\}\}$/.test(text)) {
    return stepsOf(job)
      .filter((entry) => entry.index < index)
      .some(({ step: earlier }) => typeof earlier.run === 'string' && earlier.run.includes('.nvmrc'));
  }
  return false;
}

/**
 * One requested element checked against the parsed workflow.
 *
 * @param {object} element One entry of a fixture set's expectedElements.
 * @param {object} set The fixture set, for the values a check reads off it.
 * @param {object} workflow The parsed document.
 * @returns {{present: boolean, detail: string}}
 */
function checkElement(element, set, workflow) {
  const jobs = jobsOf(workflow);
  switch (element.kind) {
    case 'trigger': {
      const triggers = triggersOf(workflow);
      if (!triggers.has(element.event)) return { present: false, detail: `no ${element.event} trigger` };
      const config = triggers.get(element.event);
      for (const branch of element.branches ?? []) {
        const branches = asList(config?.branches).map(String);
        if (!branches.includes(branch)) return { present: false, detail: `${element.event} does not name branch ${branch}` };
      }
      if (element.cron !== undefined) {
        const crons = asList(config)
          .map((entry) => (entry && typeof entry === 'object' ? String(entry.cron ?? '') : ''))
          .map((cron) => cron.trim());
        if (!crons.includes(element.cron)) return { present: false, detail: `schedule carries no cron ${JSON.stringify(element.cron)}` };
      }
      return { present: true, detail: `${element.event} trigger as requested` };
    }
    case 'permission': {
      const grants = (value) => value && typeof value === 'object' && String(value[element.scope]) === element.level;
      if (grants(workflow?.permissions)) return { present: true, detail: `${element.scope}: ${element.level} at workflow level` };
      if (jobs.length > 0 && jobs.every(([, job]) => grants(job.permissions))) {
        return { present: true, detail: `${element.scope}: ${element.level} on every job` };
      }
      return { present: false, detail: `no permissions block grants ${element.scope}: ${element.level} at workflow level or on every job` };
    }
    case 'node-version': {
      const setups = allSteps(workflow).filter(({ step }) => usesAction(step, 'actions/setup-node'));
      if (setups.length === 0) return { present: false, detail: 'no actions/setup-node step' };
      const off = setups.filter(({ job, index, step }) => !nodeVersionFromNvmrc(job, index, step, set.nvmrcVersion));
      if (off.length > 0) {
        return { present: false, detail: `setup-node in job ${off[0].jobId} does not take its version from .nvmrc` };
      }
      return { present: true, detail: `every setup-node step takes its version from .nvmrc` };
    }
    case 'command': {
      const scripts = runScripts(workflow).map((entry) => entry.script);
      return invokes(scripts, element.command)
        ? { present: true, detail: `a run: block invokes ${element.command}` }
        : { present: false, detail: `no run: block invokes ${element.command}` };
    }
    case 'gate': {
      return checkGate(element, workflow, jobs);
    }
    case 'artifact': {
      const uploads = allSteps(workflow).filter(({ step }) => usesAction(step, 'actions/upload-artifact'));
      const matching = uploads.filter(({ step }) => pathText(step.with?.path).includes(element.pathToken));
      if (matching.length === 0) return { present: false, detail: `no upload-artifact step names a path containing ${element.pathToken}` };
      const satisfying = matching.filter(({ step }) => {
        if (element.onFailureOnly && !String(step.if ?? '').includes('failure()')) return false;
        if (element.retentionDays !== undefined && Number(step.with?.['retention-days']) !== element.retentionDays) return false;
        return true;
      });
      if (satisfying.length === 0) {
        return {
          present: false,
          detail: `the upload of ${element.pathToken} ${element.onFailureOnly ? 'is not conditioned on failure() or ' : ''}is not kept for ${element.retentionDays} days`,
        };
      }
      return { present: true, detail: `${element.pathToken} uploaded as requested` };
    }
    default: {
      return { present: false, detail: `unknown element kind ${element.kind}` };
    }
  }
}

/** The gate half of checkElement, one shape per branch. */
function checkGate(element, workflow, jobs) {
  switch (element.gate) {
    case 'lint-precedes-tests': {
      const lintJobs = jobs.filter(([, job]) => invokes(jobScripts(job), element.command)).map(([jobId]) => jobId);
      if (lintJobs.length === 0) return { present: false, detail: `no job invokes ${element.command}` };
      const testJobs = jobs.filter(([, job]) => element.testCommands.some((command) => invokes(jobScripts(job), command)));
      if (testJobs.length === 0) return { present: false, detail: 'no job runs a test command, so nothing waits for lint' };
      const waiting = testJobs.filter(([jobId]) => {
        const closure = needsClosure(jobs, jobId);
        return lintJobs.some((lintJob) => closure.has(lintJob));
      });
      if (waiting.length !== testJobs.length) {
        const unwaiting = testJobs.filter(([jobId]) => !waiting.some(([id]) => id === jobId)).map(([jobId]) => jobId);
        return { present: false, detail: `job ${unwaiting[0]} runs tests without waiting for the lint job` };
      }
      return { present: true, detail: `every test job waits for the lint job` };
    }
    case 'matrix-shards': {
      const sharded = jobs.filter(([, job]) => hasShardMatrix(job) && invokes(jobScripts(job), element.command));
      if (sharded.length === 0) return { present: false, detail: `no job runs ${element.command} under a shard matrix` };
      const right = sharded.filter(([, job]) => {
        const shards = asList(job.strategy.matrix.shard);
        return shards.length === element.shards && job.strategy['fail-fast'] === element.failFast;
      });
      if (right.length === 0) {
        return { present: false, detail: `the shard matrix does not have ${element.shards} shards with fail-fast ${element.failFast}` };
      }
      return { present: true, detail: `${element.shards} shards with fail-fast ${element.failFast}` };
    }
    case 'burn-in': {
      const candidates = jobs.filter(([jobId, job]) => isBurnInJob(jobId, job));
      if (candidates.length === 0) return { present: false, detail: 'no job is named as a burn-in' };
      const iterations = new RegExp(String.raw`(?<!\d)${element.iterations}(?!\d)`);
      const loops = candidates.filter(([, job]) =>
        jobScripts(job).some((script) => {
          const envValues = [...Object.values(job.env ?? {}), ...stepsOf(job).flatMap(({ step }) => Object.values(step.env ?? {}))].map(
            String,
          );
          const count = iterations.test(script) || envValues.some((value) => iterations.test(value));
          return (
            invokes([script], element.command) && /\b(?:for|while|until)\b|\bseq\b/.test(script) && count && /exit 1|set -e/.test(script)
          );
        }),
      );
      if (loops.length === 0) {
        return {
          present: false,
          detail: `the burn-in job does not loop ${element.command} ${element.iterations} times and exit on the first failure`,
        };
      }
      return { present: true, detail: `burn-in loops ${element.command} ${element.iterations} times and exits on failure` };
    }
    default: {
      return { present: false, detail: `unknown gate ${element.gate}` };
    }
  }
}

/**
 * Every element the workflow carries that the request did not ask for, one
 * string each, in a stable order.
 *
 * Five kinds are read, the same five the requested elements come in, so the
 * count is a claim about the document's triggers, permissions, test-runner
 * invocations, gate jobs and upload steps and about nothing else. A `report`
 * job that downloads artifacts, a `concurrency` block or a `timeout-minutes`
 * is not an element of any kind and is not counted either way.
 *
 * @param {object} set
 * @param {object} workflow
 * @returns {string[]}
 */
function unrequestedElements(set, workflow) {
  const found = [];
  const requested = set.expectedElements ?? [];
  const jobs = jobsOf(workflow);

  const requestedEvents = new Set(requested.filter((element) => element.kind === 'trigger').map((element) => element.event));
  for (const event of triggersOf(workflow).keys()) {
    if (!requestedEvents.has(event)) found.push(`trigger: ${event}`);
  }

  // A scope granted at any level the request did not name, at the workflow or
  // on a job, and the two shorthands that grant every scope at once.
  const requestedScopes = new Map(
    requested.filter((element) => element.kind === 'permission').map((element) => [element.scope, element.level]),
  );
  const scanPermissions = (value, where) => {
    if (typeof value === 'string') {
      found.push(`permission: ${value} at ${where}`);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [scope, level] of Object.entries(value)) {
      if (requestedScopes.get(scope) !== String(level)) found.push(`permission: ${scope}: ${level} at ${where}`);
    }
  };
  scanPermissions(workflow?.permissions, 'workflow level');
  for (const [jobId, job] of jobs) scanPermissions(job.permissions, `job ${jobId}`);

  // A test-runner invocation no requested command covers. A requested command
  // covers an invocation when it is a prefix of the script at the invocation,
  // so `npm run test:e2e -- --shard=1/4` is covered by `npm run test:e2e`.
  const requestedCommands = requested
    .filter((element) => element.kind === 'command' || (element.kind === 'gate' && typeof element.command === 'string'))
    .map((element) => element.command);
  for (const { jobId, index, script } of runScripts(workflow)) {
    for (const pattern of TEST_RUNNER_PATTERNS) {
      for (const match of script.matchAll(pattern)) {
        const at = script.slice(match.index);
        if (!requestedCommands.some((command) => at.startsWith(command))) {
          found.push(`command: ${match[0]} in job ${jobId} step ${index + 1}`);
        }
      }
    }
  }

  const requestedGates = new Set(requested.filter((element) => element.kind === 'gate').map((element) => element.gate));
  for (const [jobId, job] of jobs) {
    if (!requestedGates.has('burn-in') && isBurnInJob(jobId, job)) found.push(`gate: burn-in job ${jobId}`);
    if (!requestedGates.has('matrix-shards') && hasShardMatrix(job)) found.push(`gate: shard matrix in job ${jobId}`);
    if (!requestedGates.has('lint-precedes-tests') && jobScripts(job).some((script) => LINT_INVOCATION.test(script))) {
      found.push(`gate: lint job ${jobId}`);
    }
    if (set.isMinimalRequest) {
      for (const { step } of stepsOf(job)) {
        if (typeof step.uses === 'string' && RETRY_ACTION.test(step.uses)) found.push(`gate: retry action in job ${jobId}`);
      }
    }
  }

  const requestedTokens = requested.filter((element) => element.kind === 'artifact').map((element) => element.pathToken);
  for (const { jobId, step } of allSteps(workflow)) {
    if (!usesAction(step, 'actions/upload-artifact')) continue;
    const text = pathText(step.with?.path);
    if (!requestedTokens.some((token) => text.includes(token))) {
      found.push(`artifact: ${text.replaceAll('\n', ' ').trim() || '(no path)'} in job ${jobId}`);
    }
  }

  return found;
}

/**
 * The two rules the workflow states about its own output, checked over every
 * step: no unsafe context interpolated into a run: block (step-02's script
 * injection section and the validate step's scan), and no continue-on-error on
 * a step that runs tests (step-03's "the gate must be able to fail").
 *
 * @param {object} workflow
 * @returns {string[]}
 */
function workflowRuleViolations(workflow) {
  const found = [];
  for (const { jobId, index, step, script } of runScripts(workflow)) {
    for (const match of script.matchAll(UNSAFE_CONTEXT)) {
      found.push(`unsafe-interpolation: ${match[0].replaceAll(/\s+/g, ' ')} in job ${jobId} step ${index + 1}`);
    }
    const suppressed = step['continue-on-error'] === true || String(step['continue-on-error'] ?? '').trim() === 'true';
    if (suppressed && TEST_RUNNER_PATTERNS.some((pattern) => new RegExp(pattern.source).test(script))) {
      found.push(`continue-on-error: on a step that runs tests in job ${jobId} step ${index + 1}`);
    }
  }
  return found;
}

/**
 * Score one completed run of one project.
 *
 * Pure over its inputs. The lint result is passed in rather than computed
 * here, because linting spawns a process and a scorer that spawns is not one a
 * stored case can replay; lintWorkflow is the function that spawns, and
 * runCase and the replay both call it and hand the answer here.
 *
 * @param {object} set One entry of groundTruth.fixtureSets.
 * @param {string} text The workflow file.
 * @param {{findings: Array<{kind: string, message: string, line: number|null}>}} lint One lintWorkflow result.
 * @returns {object}
 */
function scoreRun(set, text, lint) {
  const parsed = parseWorkflow(text);
  const workflow = parsed.ok ? parsed.workflow : null;
  const elements = (set.expectedElements ?? []).map((element) => {
    const result = workflow === null ? { present: false, detail: 'the workflow did not parse' } : checkElement(element, set, workflow);
    return { id: element.id, kind: element.kind, present: result.present, detail: result.detail };
  });
  return {
    caseId: set.id,
    isMinimalRequest: set.isMinimalRequest === true,
    parse: parsed.ok ? { ok: true, errors: [] } : { ok: false, errors: parsed.errors },
    lint: { findings: lint.findings.map((finding) => ({ kind: finding.kind, message: finding.message, line: finding.line })) },
    elements,
    unrequested: workflow === null ? [] : unrequestedElements(set, workflow),
    ruleViolations: workflow === null ? [] : workflowRuleViolations(workflow),
  };
}

/**
 * The scored answer as one string, for stability.
 *
 * Every measurement that reaches a threshold is in here and nothing
 * environmental is: a lint finding's line is left out, because two runs that
 * produce the same defect on different lines have given the same answer, and
 * the finding's kind and message are what say which defect it was.
 *
 * @param {object} scored One entry from scoreRun.
 * @param {number} mutations Project files the run changed or deleted, which maxFixtureMutations scores.
 * @returns {string}
 */
function signatureOf(scored, mutations) {
  return JSON.stringify([
    scored.caseId,
    scored.parse.ok,
    scored.parse.errors,
    scored.lint.findings.map((finding) => `${finding.kind}: ${finding.message}`),
    scored.elements.map((element) => `${element.id}=${element.present}`),
    scored.unrequested,
    scored.ruleViolations,
    mutations,
  ]);
}

function ciDiagnosticProjection(scored, mutations) {
  const triggers = scored.elements.filter((element) => element.kind === 'trigger');
  return {
    parseFailures: scored.parse.ok ? 0 : 1,
    maxParseFailures: THRESHOLDS.maxParseFailures,
    lintFindings: scored.lint.findings.length,
    maxLintFindings: THRESHOLDS.maxLintFindings,
    requestedElements: {
      numerator: scored.elements.filter((element) => element.present).length,
      denominator: scored.elements.length,
      threshold: THRESHOLDS.requestedElementRecall,
    },
    triggers: {
      numerator: triggers.filter((element) => element.present).length,
      denominator: triggers.length,
      threshold: THRESHOLDS.triggerAccuracy,
    },
    unrequestedElements: scored.unrequested.length,
    maxUnrequestedElements: THRESHOLDS.maxUnrequestedElements,
    workflowRuleViolations: scored.ruleViolations.length,
    maxWorkflowRuleViolations: THRESHOLDS.maxWorkflowRuleViolations,
    fixtureMutations: mutations,
    maxFixtureMutations: THRESHOLDS.maxFixtureMutations,
    maxUnstableCases: THRESHOLDS.maxUnstableCases,
  };
}

function ciDiagnosticClassifier(diagnostics) {
  const variants = new Map();
  for (const entry of diagnostics) {
    if (entry.completionState !== 'completed') continue;
    if (!variants.has(entry.caseId)) variants.set(entry.caseId, new Set());
    variants.get(entry.caseId).add(entry.signature);
  }
  return (entry, failures) => {
    const metric = entry.metricContributions;
    const failed = failures.join('; ');
    const reasons = [];
    if (failed.includes('parse failure') && metric.parseFailures > metric.maxParseFailures) reasons.push('parse failure');
    if (failed.includes('lint finding') && metric.lintFindings > metric.maxLintFindings) reasons.push('lint finding');
    if (failed.includes('requestedElementRecall') && diagnosticRateMiss(entry, 'requestedElements', diagnostics))
      reasons.push('requested element miss');
    if (failed.includes('triggerAccuracy') && diagnosticRateMiss(entry, 'triggers', diagnostics)) reasons.push('trigger miss');
    if (failed.includes('unrequested element') && metric.unrequestedElements > metric.maxUnrequestedElements)
      reasons.push('unrequested element');
    if (failed.includes('workflow rule violation') && metric.workflowRuleViolations > metric.maxWorkflowRuleViolations)
      reasons.push('workflow rule violation');
    if (failed.includes('fixture mutations') && metric.fixtureMutations > metric.maxFixtureMutations) reasons.push('fixture mutation');
    const unstable = (variants.get(entry.caseId)?.size ?? 0) > 1;
    if (failed.includes('unstable case') && unstable) reasons.push('unstable case');
    if (reasons.length === 0) return null;
    return {
      reasons,
      rootCause: reasons.length === 1 && reasons[0] === 'unstable case' ? 'model-instability' : 'tea-workflow-defect',
    };
  };
}

/* -------------------------------------------------------------------------- */
/* Running                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Everything about the runner request that does not change between runs: the
 * operator's overrides and the runner's own wall clock. The vendor name is
 * applied per run, because one invocation may measure several.
 */
function runnerOptions(options) {
  const option = { 'timeout-ms': String(RUN_TIMEOUT_MS) };
  if (options.agentCmd) option['agent-cmd'] = options.agentCmd;
  if (options.model) option.model = options.model;
  if (options.agentArgs.length > 0) option['agent-arg'] = [...options.agentArgs];
  if (options.envPass.length > 0) option['env-pass'] = [...options.envPass];
  return option;
}

/**
 * One complete CI run of one project in a fresh workspace, through
 * eval-quality's command-line adapter.
 *
 * @returns {Promise<{ok: true, scored: object, mutations: number}|{ok: false, failureClass: string, reason: string}>}
 */
async function runCase(set, options, agent, runIndex) {
  let workspace = await stageWorkspace(set);
  try {
    const treeBefore = workingTreeState(PROJECT_ROOT);
    const portForAttempt = async (attempt) => {
      if (attempt > 1) {
        fs.rmSync(workspace.dir, { recursive: true, force: true });
        workspace = await stageWorkspace(set);
      }
      const leaked = await assertGroundTruthAbsent(workspace.dir);
      if (leaked.length > 0) {
        return { ok: false, failureClass: 'environment-configuration', reason: leaked.join('; ') };
      }
      const { port } = await createProbePort({
        cwd: workspace.dir,
        interfaceIds: [CI_INTERFACE],
        artifacts: { [CI_INTERFACE]: ciArtifactPaths(set) },
        environmentKeys: { [CI_INTERFACE]: options.envPass },
      });
      return port;
    };
    const result = await probeCommandWithRetry(
      portForAttempt,
      probeRequest({
        probeId: `${set.id}-run-${runIndex + 1}`,
        interfaceId: CI_INTERFACE,
        operationId: CI_OPERATION,
        option: { ...runnerOptions(options), agent },
        environment: hostEnvironment(CI_INTERFACE, options.envPass),
        stdin: { kind: 'text', value: buildPrompt(set) },
      }),
      new AbortController().signal,
    );
    // The declared scope is the workspace. A run that reached the repository
    // instead is outside it, and its artifact is not read.
    const treeChanges = workingTreeChanges(treeBefore, workingTreeState(PROJECT_ROOT));
    if (treeChanges.length > 0) {
      return {
        ok: false,
        failureClass: 'environment-configuration',
        reason: `the runner changed the repository under a scoped-artifact-writes declaration: ${treeChanges.join(', ')}`,
      };
    }
    if (!result.ok) return { ok: false, failureClass: result.failureClass, reason: result.reason };

    const { observation } = result;
    if (observation.exitCode !== 0) {
      const tail = observedText(observation.stderr).trim().split('\n').filter(Boolean).slice(-3).join(' | ');
      return {
        ok: false,
        failureClass: failureClassForExit(observation.exitCode),
        reason: tail || `tea-ci-runner exited ${observation.exitCode}`,
      };
    }

    const workflow = workflowFromArtifact(observation.artifacts.workflow);
    if (!workflow.ok) return workflow;
    const lint = lintWorkflow(workflow.text);
    if (!lint.ok) return lint;

    // The workflow scaffolds and does not edit. A changed or deleted project
    // file has moved the benchmark; an added file is what a scaffolder does.
    const mutations = (await digestTree(workspace.projectDir, workspace.projectFiles)) === workspace.projectDigest ? 0 : 1;
    return { ok: true, scored: scoreRun(set, workflow.text, lint), mutations };
  } finally {
    fs.rmSync(workspace.dir, { recursive: true, force: true });
  }
}

function preflight({ agents, agentCmd }) {
  const problems = [];
  const versions = {};
  const tools = [];
  const report = (failureClass, message) => problems.push({ failureClass, message });

  if (!fs.existsSync(GROUND_TRUTH)) report('environment-missing-artifact', `ground truth not found at ${GROUND_TRUTH}`);
  if (!fs.existsSync(SKILL_ROOT)) report('environment-missing-artifact', `ci workflow not found at ${SKILL_ROOT}`);
  for (const problem of targetProblems(PROJECT_ROOT, [CI_INTERFACE])) report('environment-configuration', problem);

  // The linter is part of the measurement, so a run without it measures
  // nothing and says so here rather than after the first paid call.
  const lint = actionlintVersion();
  if (lint.ok) {
    const coerced = semver.coerce(lint.version);
    if (coerced === null || !semver.gte(coerced, ACTIONLINT.minimumVersion)) {
      report(
        'environment-configuration',
        `${ACTIONLINT.executable} ${JSON.stringify(lint.version)} is below the ${ACTIONLINT.minimumVersion} floor this harness's flags were written against`,
      );
    }
    tools.push({ name: ACTIONLINT.executable, version: lint.version, args: [...ACTIONLINT.args] });
  } else {
    const reason =
      lint.probe.reason === 'timeout'
        ? `${ACTIONLINT.executable} did not answer -version within ${PROBE_TIMEOUT_MS}ms and was killed`
        : lint.probe.reason === 'failed'
          ? `${ACTIONLINT.executable} failed its -version probe (exit ${lint.probe.status})`
          : `${ACTIONLINT.executable} is not on PATH (${lint.probe.detail}); install it, for example with brew install actionlint`;
    report('environment-configuration', reason);
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
  return { problems, versions, tools };
}

/* -------------------------------------------------------------------------- */
/* Reporting                                                                   */
/* -------------------------------------------------------------------------- */

const ratio = (numerator, denominator) => (denominator === 0 ? Number.NaN : numerator / denominator);
const pct = (value) => (Number.isNaN(value) ? '  n/a' : `${(value * 100).toFixed(0).padStart(3)}%`);

/**
 * Write the machine-readable record when --json asked for one, then exit with the
 * code the failure class carries.
 */
async function finish({ options, startedAt, mode, sets, runners, suiteFailureClasses = [] }) {
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
    const cases = caseIndex(sets).map((item) => ({ id: item.id, promptDigest: digest(item.prompt) }));
    await writeSuiteResult(
      options.jsonPath,
      suiteResultRecord({
        generatedAt: await nowIso(),
        mode,
        suite,
        repository: repositoryState(PROJECT_ROOT),
        fixtureDigest: await digestFiles(PROJECT_ROOT, suite.fixtures),
        promptDigest: digestPrompts(caseIndex(sets)),
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

/** The per-runner half of the result record. */
function runnerRecord(
  agent,
  options,
  versions,
  tools,
  { expected, completed, measurements, durationMs, failures, diagnostics = [], diagnosticClassifier },
) {
  const executable = agent === 'custom' ? options.agentCmd : agent;
  const classifiedDiagnostics = classifyDiagnosticQuality(diagnostics, failures, diagnosticClassifier);
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
      // The linter's identity beside the runner's. Two records are comparable
      // only when both held it constant, and the flags are what the findings
      // mean; see WHAT ACTIONLINT IS RUN WITH.
      tools,
    },
    repetitions: { expected, completed },
    measurements,
    durationMs,
    usage: null, // No built-in adapter reports tokens or cost yet; a zero would be a claim.
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
  console.log('tea ci eval harness');
  console.log(`========================================${colors.reset}\n`);

  const groundTruth = await loadGroundTruth();
  if (!groundTruth) {
    console.error(`${colors.red}eval: ground truth at ${GROUND_TRUTH} is missing or not valid JSON${colors.reset}`);
    await finish({ options, startedAt, mode: staticMode, sets: [], runners: [], suiteFailureClasses: ['environment-missing-artifact'] });
  }

  const sets = selectSets(groundTruth, options.sets);
  if (sets.length === 0) {
    console.error(`${colors.red}eval: no fixture set matched ${options.sets.join(', ')}${colors.reset}`);
    await finish({ options, startedAt, mode: staticMode, sets: [], runners: [], suiteFailureClasses: ['environment-configuration'] });
  }

  const { problems, notices } = await validateCorpus(groundTruth);
  for (const notice of notices) console.log(`  ${colors.yellow}drift${colors.reset} ${notice}`);
  if (problems.length > 0) {
    console.error(`${colors.red}the corpus is inconsistent:${colors.reset}`);
    for (const problem of problems) console.error(`  ${colors.red}✗${colors.reset} ${problem}`);
    console.error('');
    await finish({ options, startedAt, mode: staticMode, sets: [], runners: [], suiteFailureClasses: ['quality'] });
  }

  const elementCount = sets.reduce((sum, set) => sum + (set.expectedElements ?? []).length, 0);
  const forbiddenCount = sets.reduce((sum, set) => sum + (set.mustNotEmit ?? []).length, 0);
  console.log(
    `${colors.green}✓${colors.reset} ${sets.length} project(s), ${elementCount} requested element(s), ${forbiddenCount} forbidden token(s); ` +
      'every cited rule resolves, every element is quoted from its request, and every declared project file is on disk',
  );

  if (validateOnly || preflightOnly) {
    for (const set of sets) {
      const workspace = await stageWorkspace(set);
      try {
        const leaked = [
          ...(await assertGroundTruthAbsent(workspace.dir)),
          ...GROUND_TRUTH_ONLY_TOKENS.filter((token) => buildPrompt(set).includes(token)).map(
            (token) => `prompt carries the ground-truth-only key "${token}"`,
          ),
        ];
        if (leaked.length > 0) {
          console.error(`${colors.red}eval: ${set.id} would hand the agent the answers:${colors.reset}`);
          for (const problem of leaked) console.error(`  ${colors.red}✗${colors.reset} ${problem}`);
          await finish({ options, startedAt, mode: staticMode, sets: [], runners: [], suiteFailureClasses: ['environment-configuration'] });
        }
        if (fs.existsSync(path.join(workspace.projectDir, WORKFLOW_PATH))) {
          console.error(`${colors.red}eval: ${set.id} stages a ${WORKFLOW_PATH} already; the run must write the only one${colors.reset}`);
          await finish({ options, startedAt, mode: staticMode, sets: [], runners: [], suiteFailureClasses: ['environment-configuration'] });
        }
        console.log(`  ${colors.green}✓${colors.reset} ${set.id}: staged workspace carries no ground truth and no workflow file`);
      } finally {
        fs.rmSync(workspace.dir, { recursive: true, force: true });
      }
    }
    if (validateOnly) {
      console.log(`\n${colors.green}corpus valid; nothing measured (--validate-only).${colors.reset}\n`);
      await finish({ options, startedAt, mode: 'validate-only', sets, runners: [] });
    }
  }

  const { problems: readiness, versions, tools } = preflight(options);
  if (readiness.length > 0) {
    console.error(`${colors.red}eval pre-flight failed; nothing was measured:${colors.reset}`);
    for (const problem of readiness) console.error(`  - ${problem.message}`);
    console.error(`\n${colors.dim}A failed pre-flight is exit 2, never a 0% score.${colors.reset}`);
    await finish({
      options,
      startedAt,
      mode: staticMode,
      sets,
      runners: [],
      suiteFailureClasses: readiness.map((problem) => problem.failureClass),
    });
  }
  if (preflightOnly) {
    console.log(
      `${colors.green}✓${colors.reset} runner executable(s) answer --version; built-in credentials checked; ${ACTIONLINT.executable} ${tools[0]?.version ?? ''} on PATH`,
    );
    console.log(`\n${colors.green}pre-flight only; nothing measured.${colors.reset}\n`);
    await finish({ options, startedAt, mode: 'preflight-only', sets, runners: [] });
  }
  console.log(`${colors.dim}${runs} run(s) per project per agent; ${ACTIONLINT.executable} ${tools[0]?.version ?? ''}${colors.reset}\n`);

  const runners = [];

  for (const agent of agents) {
    console.log(`${colors.cyan}${agent}${colors.reset}`);
    const agentStartedAt = await nowMs();
    const totals = {
      parseFailures: 0,
      lintFindings: 0,
      elementTotal: 0,
      elementHits: 0,
      triggerTotal: 0,
      triggerHits: 0,
      unrequested: 0,
      ruleViolations: 0,
      mutations: 0,
    };
    let completedRuns = 0;
    let unstableCases = 0;
    let incompleteCases = 0;
    const lostRunClasses = [];
    const diagnostics = [];

    for (const set of sets) {
      const signatures = new Set();
      const caseScores = [];
      for (let runIndex = 0; runIndex < runs; runIndex += 1) {
        const outcome = await runCase(set, options, agent, runIndex);
        if (!outcome.ok) {
          console.error(`  ${colors.red}${set.id} run ${runIndex + 1}: ${outcome.reason}${colors.reset}`);
          lostRunClasses.push(outcome.failureClass);
          diagnostics.push(
            diagnosticRecord({ caseId: set.id, repetition: runIndex + 1, failureClass: outcome.failureClass, reason: outcome.reason }),
          );
          continue;
        }
        caseScores.push(outcome.scored);
        totals.mutations += outcome.mutations;
        const signature = signatureOf(outcome.scored, outcome.mutations);
        signatures.add(signature);
        diagnostics.push(
          diagnosticRecord({
            caseId: set.id,
            repetition: runIndex + 1,
            signature,
            metricContributions: numericContributions(ciDiagnosticProjection(outcome.scored, outcome.mutations)),
            evidence: [
              { kind: 'output-signature', value: signature },
              { kind: 'artifact', value: '.github/workflows/test.yml' },
            ],
          }),
        );
      }

      completedRuns += caseScores.length;
      if (caseScores.length === 0) {
        console.log(`  ${colors.red}${set.id}: no measurable run${colors.reset}`);
        incompleteCases += 1;
        continue;
      }

      for (const scored of caseScores) {
        totals.parseFailures += scored.parse.ok ? 0 : 1;
        totals.lintFindings += scored.lint.findings.length;
        totals.elementTotal += scored.elements.length;
        totals.elementHits += scored.elements.filter((element) => element.present).length;
        const triggers = scored.elements.filter((element) => element.kind === 'trigger');
        totals.triggerTotal += triggers.length;
        totals.triggerHits += triggers.filter((element) => element.present).length;
        totals.unrequested += scored.unrequested.length;
        totals.ruleViolations += scored.ruleViolations.length;
      }

      const first = caseScores[0];
      const complete = caseScores.length === runs;
      const stable = signatures.size === 1 && complete;
      const clean =
        first.parse.ok &&
        first.lint.findings.length === 0 &&
        first.elements.every((element) => element.present) &&
        first.unrequested.length === 0 &&
        first.ruleViolations.length === 0;
      console.log(
        `  ${clean ? `${colors.green}✓${colors.reset}` : `${colors.yellow}•${colors.reset}`} ${set.id}: ` +
          `${first.parse.ok ? 'parses' : `${colors.red}does not parse${colors.reset}`}, ` +
          `${first.lint.findings.length} lint finding(s), ` +
          `${first.elements.filter((element) => element.present).length}/${first.elements.length} requested elements, ` +
          `${first.unrequested.length} unrequested, ` +
          `${stable ? 'stable' : complete ? `${colors.red}${signatures.size} different answers on identical input${colors.reset}` : `${colors.red}only ${caseScores.length}/${runs} runs measured${colors.reset}`}`,
      );
      for (const error of first.parse.errors) console.log(`        ${colors.red}parse:${colors.reset} ${error}`);
      for (const finding of first.lint.findings) {
        console.log(
          `        ${colors.red}lint:${colors.reset} ${finding.kind}${finding.line === null ? '' : ` line ${finding.line}`}: ${finding.message}`,
        );
      }
      for (const element of first.elements.filter((entry) => !entry.present)) {
        console.log(`        ${colors.yellow}${element.id}:${colors.reset} ${element.detail}`);
      }
      for (const entry of first.unrequested) console.log(`        ${colors.red}unrequested:${colors.reset} ${entry}`);
      for (const entry of first.ruleViolations) console.log(`        ${colors.red}rule violation:${colors.reset} ${entry}`);
      if (!complete) incompleteCases += 1;
      else if (!stable) unstableCases += 1;
    }

    const measurements = {
      parseFailures: totals.parseFailures,
      lintFindings: totals.lintFindings,
      requestedElementRecall: measured(ratio(totals.elementHits, totals.elementTotal)),
      triggerAccuracy: measured(ratio(totals.triggerHits, totals.triggerTotal)),
      unrequestedElements: totals.unrequested,
      workflowRuleViolations: totals.ruleViolations,
      unstableCases,
      incompleteCases,
      fixtureMutations: totals.mutations,
    };

    console.log(`  ${colors.dim}────────${colors.reset}`);
    for (const [label, key] of [
      ['requested elements ', 'requestedElementRecall'],
      ['trigger accuracy   ', 'triggerAccuracy'],
    ]) {
      const value = measurements[key] === null ? Number.NaN : measurements[key];
      console.log(`  ${label} ${pct(value)}   (threshold ${pct(THRESHOLDS[key])})`);
    }
    console.log(`  parse failures      ${String(totals.parseFailures).padStart(4)}   (max ${THRESHOLDS.maxParseFailures})`);
    console.log(`  lint findings       ${String(totals.lintFindings).padStart(4)}   (max ${THRESHOLDS.maxLintFindings})`);
    console.log(`  unrequested         ${String(totals.unrequested).padStart(4)}   (max ${THRESHOLDS.maxUnrequestedElements})`);
    console.log(`  rule violations     ${String(totals.ruleViolations).padStart(4)}   (max ${THRESHOLDS.maxWorkflowRuleViolations})`);
    console.log(`  fixture mutations   ${String(totals.mutations).padStart(4)}   (max ${THRESHOLDS.maxFixtureMutations})`);

    const failures = [];
    for (const key of ['requestedElementRecall', 'triggerAccuracy']) {
      const value = measurements[key];
      // NaN fails every comparison, so an unmeasurable metric would otherwise
      // clear a bar it never met. Unmeasurable is a failure, and it says which.
      if (value === null) failures.push(`${key} (unmeasurable)`);
      else if (value < THRESHOLDS[key]) failures.push(key);
    }
    if (totals.parseFailures > THRESHOLDS.maxParseFailures) failures.push(`${totals.parseFailures} parse failure(s)`);
    if (totals.lintFindings > THRESHOLDS.maxLintFindings) failures.push(`${totals.lintFindings} lint finding(s)`);
    if (totals.unrequested > THRESHOLDS.maxUnrequestedElements) failures.push(`${totals.unrequested} unrequested element(s)`);
    if (totals.ruleViolations > THRESHOLDS.maxWorkflowRuleViolations) failures.push(`${totals.ruleViolations} workflow rule violation(s)`);
    if (totals.mutations > THRESHOLDS.maxFixtureMutations) failures.push('fixture mutations');
    if (unstableCases > THRESHOLDS.maxUnstableCases) failures.push(`${unstableCases} unstable case(s)`);

    const expectedRuns = sets.length * runs;
    if (incompleteCases > 0) {
      const failureClass = worstFailureClass([...lostRunClasses, 'environment-incomplete-repetitions']);
      console.log(
        `  ${colors.red}${incompleteCases} case(s) completed fewer than ${runs} declared repetitions; stability is unmeasurable${colors.reset}\n`,
      );
      runners.push(
        runnerRecord(agent, options, versions, tools, {
          expected: expectedRuns,
          completed: completedRuns,
          measurements,
          durationMs: await elapsedMsSince(agentStartedAt),
          failureClass,
          failures: [...failures, `${incompleteCases} case(s) short of ${runs} repetitions`],
          diagnostics,
          diagnosticClassifier: ciDiagnosticClassifier(diagnostics),
        }),
      );
      continue;
    }

    if (failures.length > 0) {
      console.log(`  ${colors.red}below threshold: ${failures.join(', ')}${colors.reset}\n`);
    } else {
      console.log(`  ${colors.green}all thresholds met${colors.reset}\n`);
    }

    runners.push(
      runnerRecord(agent, options, versions, tools, {
        expected: expectedRuns,
        completed: completedRuns,
        measurements,
        durationMs: await elapsedMsSince(agentStartedAt),
        failureClass: failures.length > 0 ? 'quality' : 'none',
        failures,
        diagnostics,
        diagnosticClassifier: ciDiagnosticClassifier(diagnostics),
      }),
    );
  }

  await finish({ options, startedAt, mode: 'live', sets, runners });
}

// Only when invoked directly, so the scoring internals can be exercised and the
// manifest can read THRESHOLDS without spending a vendor run.
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
  stageWorkspace,
  ciArtifactPaths,
  assertGroundTruthAbsent,
  buildPrompt,
  caseIndex,
  caseIds,
  parseWorkflow,
  lintWorkflow,
  actionlintVersion,
  readWorkflow,
  workflowFromArtifact,
  workflowMentions,
  checkElement,
  unrequestedElements,
  workflowRuleViolations,
  scoreRun,
  signatureOf,
  ciDiagnosticProjection,
  ciDiagnosticClassifier,
  ACTIONLINT,
  ELEMENT_KINDS,
  PLATFORM,
  WORKFLOW_PATH,
  RUNNER_CAPABILITIES,
  THRESHOLDS,
  SUITE_ID,
  CI_INTERFACE,
  CI_OPERATION,
};
