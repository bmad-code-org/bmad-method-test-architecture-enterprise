/**
 * test-review eval harness.
 *
 * The workflow's quality has been asserted rather than measured. This measures it,
 * against a fixture corpus with known ground truth, and reports these numbers per
 * vendor:
 *
 *   recall                — planted defects the reviewer named, at the right line
 *   nonFalsePositiveRate  — the share of everything it reported that is not a
 *                           DEFINITE false positive, where definite means reported
 *                           against the clean fixture, which has no defects by
 *                           construction
 *   unattributed          — findings on a seeded fixture that match no planted row,
 *                           carried beside the rate and never folded into it
 *   unlocated             — findings the reviewer gave no file for, which nothing
 *                           can adjudicate, carried beside the rate as well
 *   variance              — spread of the quality score across repeated runs of
 *                           IDENTICAL input
 *
 * Every one of those is scored from the verdict's own `findings` array. The verdict
 * is the contract, so the numbers come from the same parse the CLI gated the report
 * on; see scoreVerdict for the two ways a second parser here answered differently.
 *
 * The variance number is the one nobody had. Two reviewers scoring the same four
 * files 82 and 85 tells you the spread across vendors; it says nothing about whether
 * one vendor returns 82 twice. A gate whose verdict moves on re-run is not a gate,
 * and you cannot know that from a single run.
 *
 * The rate above used to be called precision, which was a claim the number could not
 * support. Precision needs every reported finding adjudicated as correct or
 * incorrect, and an unmatched finding on a seeded fixture is neither until a human
 * judges it: a fixture can carry an incidental real defect nobody planted. Only the
 * clean fixture supports a definite verdict, so only it can lower the rate, and the
 * name now says so. Its threshold is unchanged.
 *
 * The clean fixture is not optional either way. A reviewer that reports every
 * possible finding scores perfect recall and is useless.
 *
 * Every declared repetition must complete. Variance across two of three runs is not
 * variance, so a lost run makes stability unmeasurable and exits 2.
 *
 * Usage:
 *   node test/eval-test-review.js --agent codex --runs 3
 *   node test/eval-test-review.js --agent claude --agent codex --runs 5
 *   node test/eval-test-review.js --agent custom --agent-cmd my-runner --agent-arg --headless
 *   node test/eval-test-review.js --agent codex --json results/test-review.json
 *   node test/eval-test-review.js --preflight-only
 *
 * Exit codes:
 *   0  every requested vendor met the thresholds
 *   1  a vendor missed a threshold (a real result, reported)
 *   2  the environment could not run the eval (nothing was measured): a missing
 *      credential, a timeout, a transport error, an unparseable reply, a missing
 *      artifact, or fewer completed runs than were declared
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { AGENT_ADAPTERS, resolveModel } = require('../cli/lib/agent-adapters');
const { loadSuiteManifest, suiteById } = require('./lib/suite-manifest');
const {
  digest,
  digestFiles,
  repositoryState,
  probeVersion,
  redactArgs,
  measured,
  suiteResultRecord,
  writeSuiteResult,
} = require('./lib/eval-record');
const { worstFailureClass, exitCodeForFailureClass } = require('./schema/eval-result');

const PROJECT_ROOT = path.join(__dirname, '..');
const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'test-review-eval');
const GROUND_TRUTH = path.join(FIXTURE_ROOT, 'ground-truth.json');
const CLI = path.join(PROJECT_ROOT, 'cli', 'test-review.js');
const SUITE_ID = 'test-review';

/**
 * Thresholds. Deliberately conservative: this harness exists to detect regression
 * and vendor drift, so a bar nobody can clear teaches nothing and a bar everyone
 * clears teaches nothing either. Raise them as the rubric tightens.
 */
const RUN_TIMEOUT_MINUTES = 15;
const RUN_TIMEOUT_MS = RUN_TIMEOUT_MINUTES * 60_000;

const THRESHOLDS = {
  criticalRecall: 1, // every CRITICAL row must be found. A missed .skip is the whole failure mode.
  recall: 0.7,
  // Named for what it measures. Only a finding against the clean fixture is a
  // definite false positive; see scoreVerdict for why an unmatched finding on a
  // seeded fixture cannot be counted as either correct or incorrect.
  nonFalsePositiveRate: 0.8,
  maxScoreStdev: 3, // a wider spread than one MEDIUM violation means the score is not reproducible
};

const colors = {
  reset: '[0m',
  red: '[31m',
  green: '[32m',
  yellow: '[33m',
  cyan: '[36m',
  dim: '[2m',
};

function parseArgs(argv) {
  const agents = [];
  const agentArgs = [];
  const envPass = [];
  let runs = 3;
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
  // Variance across one run is not a number. Say so rather than printing 0.
  if (runs < 2 && !preflightOnly) {
    console.error(`${colors.yellow}note${colors.reset}: --runs ${runs} cannot measure variance; use --runs 2 or more.`);
  }
  return { agents, runs, preflightOnly, agentCmd, agentArgs, envPass, model, jsonPath };
}

function fatal(code, message) {
  console.error(`${colors.red}eval: ${message}${colors.reset}`);
  process.exit(code);
}

/**
 * Whether a vendor has no usable credential in ANY of the shapes its CLI accepts.
 * Returns a problem string, or null when the vendor can authenticate.
 *
 * Stored credentials are keyed by HOME, which is why run-agent.js forwards HOME
 * and USER. Claude also accepts its documented environment variables. Codex
 * 0.146.0 does not consume OPENAI_API_KEY directly; CI must first write
 * ~/.codex/auth.json with `codex login --with-api-key`. See agent-adapters.js.
 */
function missingCredential(agent) {
  const home = process.env.HOME || os.homedir();
  if (agent === 'claude') {
    if (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN) return null;
    if (fs.existsSync(path.join(home, '.claude', '.credentials.json'))) return null;
    const keychain = spawnSync('security', ['find-generic-password', '-s', 'Claude Code-credentials'], { encoding: 'utf8' });
    if (!keychain.error && keychain.status === 0) return null;
    return 'claude needs ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN, or a stored login (keychain / ~/.claude/.credentials.json)';
  }
  if (agent === 'codex') {
    if (fs.existsSync(path.join(home, '.codex', 'auth.json'))) return null;
    return 'codex needs a stored login at ~/.codex/auth.json (in CI: printenv OPENAI_API_KEY | codex login --with-api-key)';
  }
  return null;
}

/**
 * Bounded pre-flight. For a skill the environment IS repo state plus tool
 * availability, and that is where every unintended defect in the earlier
 * experiment rounds lived. Without this, a missing credential reports as 0% recall
 * and reads as "the reviewer found nothing", which is the most expensive possible
 * way to be wrong about your own tool.
 */
function preflight({ agents, agentCmd }) {
  const problems = [];
  const versions = {};
  // Every problem carries the failure class it belongs to, so a missing
  // credential and a missing fixture stay distinguishable in the result record
  // instead of collapsing into one "could not run".
  const report = (failureClass, message) => problems.push({ failureClass, message });

  if (!fs.existsSync(CLI)) report('environment-missing-artifact', `CLI not found at ${CLI}`);
  if (!fs.existsSync(GROUND_TRUTH)) report('environment-missing-artifact', `ground truth not found at ${GROUND_TRUTH}`);

  let groundTruth = null;
  if (fs.existsSync(GROUND_TRUTH)) {
    try {
      groundTruth = JSON.parse(fs.readFileSync(GROUND_TRUTH, 'utf8'));
    } catch (error) {
      report('environment-configuration', `ground truth is not valid JSON: ${error.message}`);
    }
  }

  // Every fixture the manifest names must exist, and every line it cites must be
  // inside the file. A manifest pointing past the end of a fixture scores recall
  // against nothing and always reports a miss.
  for (const entry of groundTruth?.files ?? []) {
    const absolute = path.join(FIXTURE_ROOT, entry.path);
    if (!fs.existsSync(absolute)) {
      report('environment-missing-artifact', `fixture missing: ${entry.path}`);
      continue;
    }
    const lineCount = fs.readFileSync(absolute, 'utf8').split('\n').length;
    for (const planted of entry.planted ?? []) {
      if (planted.line > lineCount) {
        report('environment-configuration', `${entry.path}: ground truth cites line ${planted.line}, file has ${lineCount}`);
      }
      // An admitted line past the end of the file would score a fabricated
      // location as a hit, which is the rubric's own named penalty.
      for (const admitted of planted.admittedLines ?? []) {
        if (admitted < 1 || admitted > lineCount) {
          report('environment-configuration', `${entry.path}: ${planted.row} admits line ${admitted}, file has ${lineCount}`);
        }
      }
      // A plant whose own firing line is not admitted cannot be found by a
      // reviewer that cites it exactly, which is the one citation that is always
      // right.
      if (Array.isArray(planted.admittedLines) && !planted.admittedLines.includes(planted.line)) {
        report('environment-configuration', `${entry.path}: ${planted.row} does not admit its own line ${planted.line}`);
      }
    }
  }

  // mustNotReport is only meaningful on a fixture with nothing planted, and
  // scoreVerdict derives the clean set from `planted.length === 0` rather than
  // from the key. Pin the invariant here so the two cannot drift apart.
  for (const entry of groundTruth?.files ?? []) {
    if (entry.mustNotReport && (entry.planted ?? []).length > 0) {
      report(
        'environment-configuration',
        `${entry.path}: mustNotReport requires an empty planted array; a definite false positive is only definite on a clean fixture`,
      );
    }
  }

  for (const agent of agents) {
    if (!Object.prototype.hasOwnProperty.call(AGENT_ADAPTERS, agent)) {
      report('environment-configuration', `unknown agent "${agent}"; expected one of ${Object.keys(AGENT_ADAPTERS).join(', ')}`);
      continue;
    }
    const executable = agent === 'custom' ? agentCmd : agent;
    const probe = spawnSync(executable, ['--version'], { encoding: 'utf8' });
    if (probe.error) report('environment-transport', `agent CLI "${executable}" is not on PATH (${probe.error.code})`);
    else if (probe.status === 0)
      versions[agent] =
        String(probe.stdout || '')
          .trim()
          .split('\n')[0] || null;
    else report('environment-transport', `agent CLI "${executable}" failed its --version probe (exit ${probe.status})`);
    const credential = agent === 'custom' ? null : missingCredential(agent);
    if (credential) report('environment-authentication', credential);
  }

  if (problems.length === 0) {
    console.log(
      `${colors.green}✓${colors.reset} pre-flight: CLI, fixtures, ground truth, and runner executable(s) available; built-in credentials checked`,
    );
  }
  return { problems, groundTruth, versions };
}

/** The three fixtures under review, as repository-relative paths. */
function reviewFilePaths() {
  return ['seeded/checkout.spec.ts', 'seeded/orders.service.spec.ts', 'clean/profile.spec.ts'].map((relative) =>
    path.relative(PROJECT_ROOT, path.join(FIXTURE_ROOT, relative)),
  );
}

/**
 * The ids of the cases this suite scores, in the order the result record writes
 * them. One review call covers the whole corpus and each reviewed file is scored
 * on its own, so a case here is a file.
 *
 * tools/validate-eval-schemas.js checks the manifest's `caseCount` against the
 * length of this, the same way it checks its thresholds against THRESHOLDS. It
 * has to come from the harness: deriving the count from the manifest's own
 * fixture list makes the check compare the manifest with itself.
 *
 * @returns {string[]}
 */
function caseIds() {
  return reviewFilePaths();
}

/**
 * One review of the whole fixture corpus.
 *
 * Returns `{ ok: true, verdict }`, or `{ ok: false, failureClass }` naming why
 * nothing came back. The distinction is the whole point: a timeout and a missing
 * verdict used to return null, and the caller then scored the runs that survived,
 * which converted a failed model call into a lower measured score.
 *
 * @returns {{ok: true, verdict: object}|{ok: false, failureClass: string}}
 */
function runReview(agent, runIndex, runner = {}) {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-eval-'));
  const jsonPath = path.join(runDir, 'verdict.json');
  // `--output` defaults to `test-review.md` resolved against cwd, which this call sets to
  // PROJECT_ROOT, so an unredirected run writes its report into the real repo tree. Only
  // the JSON verdict is ever scored; the markdown report is redirected into the same
  // disposable runDir the JSON already uses, purely so nothing lands outside it.
  const reportPath = path.join(runDir, 'test-review.md');
  const reviewFiles = reviewFilePaths();

  try {
    // No --fail-on override: the enum is request-changes|block, so there is no "never".
    // A verdict failure exits 1 and still writes the verdict, which is all this needs;
    // the harness reads the JSON regardless of exit code and only treats a MISSING
    // verdict as a failed run.
    //
    // Every run is bounded. An agent that hangs would otherwise stall the whole
    // matrix with no output and no way to tell a hang from a slow model.
    const cliArgs = [CLI, '--agent', agent, '--files', reviewFiles.join(','), '--json', jsonPath, '--output', reportPath];
    if (runner.agentCmd) cliArgs.push('--agent-cmd', runner.agentCmd);
    if (runner.model) cliArgs.push('--model', runner.model);
    for (const value of runner.agentArgs ?? []) cliArgs.push(`--agent-arg=${value}`);
    for (const name of runner.envPass ?? []) cliArgs.push('--env-pass', name);
    const result = spawnSync(process.execPath, cliArgs, {
      encoding: 'utf8',
      cwd: PROJECT_ROOT,
      timeout: RUN_TIMEOUT_MS,
    });

    if (result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM') {
      console.error(`  ${colors.red}run ${runIndex + 1}: timed out after ${RUN_TIMEOUT_MINUTES} minutes${colors.reset}`);
      return { ok: false, failureClass: 'environment-timeout' };
    }
    if (!fs.existsSync(jsonPath)) {
      console.error(`  ${colors.red}run ${runIndex + 1}: no verdict written${colors.reset} (exit ${result.status})`);
      if (result.stderr) console.error(`  ${colors.dim}${result.stderr.trim().split('\n').slice(-3).join('\n  ')}${colors.reset}`);
      return { ok: false, failureClass: 'environment-missing-artifact' };
    }
    try {
      return { ok: true, verdict: JSON.parse(fs.readFileSync(jsonPath, 'utf8')) };
    } catch (error) {
      console.error(`  ${colors.red}run ${runIndex + 1}: verdict is not valid JSON: ${error.message}${colors.reset}`);
      return { ok: false, failureClass: 'environment-parser' };
    }
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
}

/**
 * The lines a reviewer may cite for one planted defect and still be scored as
 * having found it.
 *
 * `admittedLines` is the authority and every plant carries one. Each set is
 * derived from the fixture and holds the line the rule fires on, the enclosing
 * declaration, and the comment naming the row. The symmetric `lineTolerance`
 * radius it replaced was justified in one direction only, so it failed to reach
 * the enclosing declaration for two plants while admitting lines past the end of
 * a file for two others.
 *
 * The radius remains the fallback for a plant that declares no set, so ground
 * truth written against the older shape still scores rather than scoring zero.
 */
function admittedLinesFor(planted, tolerance) {
  if (Array.isArray(planted.admittedLines) && planted.admittedLines.length > 0) {
    return new Set(planted.admittedLines.map(Number));
  }
  const window = new Set();
  for (let line = Math.max(1, planted.line - tolerance); line <= planted.line + tolerance; line += 1) window.add(line);
  return window;
}

/**
 * Score one verdict against ground truth.
 *
 * The findings come from the verdict's own `findings` array, which the CLI builds
 * once from the report's finding blocks and gates the report on. That is what
 * makes the verdict the contract rather than the markdown beside it.
 *
 * This used to re-parse the report here with two regular expressions of its own,
 * and the second parser answered differently in both directions. It read raw
 * lines, so a finding quoted inside a fenced example report counted as real,
 * which is the spoof cli/lib/parse-report.js strips fences to prevent. And it
 * dropped a finding whose location line it could not read, which then tripped a
 * declared-versus-attributed guard and scored the whole run unmeasurable.
 *
 * A planted defect counts as found when a reported finding cites the same
 * registry row at one of the lines admitted for it. Matching on the row is
 * what makes this comparable across vendors: prose descriptions of the same defect
 * differ, row identities do not.
 *
 * Returns null when the verdict carries no findings array, which is a verdict
 * written by something other than this CLI, so there is nothing to score.
 */
function scoreVerdict(verdict, groundTruth) {
  const tolerance = groundTruth.lineTolerance ?? 0;
  if (!Array.isArray(verdict.findings)) return null;

  // A finding the report gave no file for is kept in the verdict deliberately, and
  // nothing here can judge it: it matches no plant, it names no fixture, so it is
  // neither a definite false positive nor an unattributed finding. It is counted on
  // its own and left out of the rate's denominator, which is a rate over the
  // findings that can be adjudicated at all. Folding it in would dilute the
  // false-positive share with findings nobody can check.
  const reported = verdict.findings.filter((finding) => typeof finding.file === 'string' && finding.file.length > 0);
  const unlocated = verdict.findings.length - reported.length;
  const cleanPaths = new Set((groundTruth.files ?? []).filter((f) => (f.planted ?? []).length === 0).map((f) => f.path));

  const planted = [];
  for (const entry of groundTruth.files ?? []) {
    for (const item of entry.planted ?? []) planted.push({ ...item, path: entry.path });
  }

  const matched = new Set();
  const hits = planted.filter((expected) => {
    const found = reported.find((actual, actualIndex) => {
      if (matched.has(actualIndex)) return false;
      const samePath = String(actual.file ?? '').endsWith(path.basename(expected.path));
      const sameRow = String(actual.row ?? '').toUpperCase() === expected.row;
      const closeEnough = admittedLinesFor(expected, tolerance).has(Number(actual.line ?? -1));
      if (samePath && sameRow && closeEnough) {
        matched.add(actualIndex);
        return true;
      }
      return false;
    });
    return Boolean(found);
  });

  // Two different things, kept apart on purpose.
  //
  // A violation against the clean fixture is a definite false positive: that file
  // has no defects by construction, so anything reported there is invented.
  //
  // A violation on a SEEDED fixture that matched no planted row is unattributed, not
  // necessarily wrong. A fixture can carry an incidental real defect nobody planted.
  // Folding those into the false-positive count would punish a reviewer for being
  // right about something the manifest failed to anticipate, so they are reported
  // separately and nonFalsePositiveRate is computed from the definite ones. That is
  // also why the metric is not called precision: precision would require every
  // reported finding to be adjudicated, and these are not.
  const isCleanFixture = (file) => [...cleanPaths].some((clean) => String(file).endsWith(path.basename(clean)));

  const falsePositives = reported.filter((actual, actualIndex) => !matched.has(actualIndex) && isCleanFixture(actual.file));
  const unattributed = reported.filter((actual, actualIndex) => !matched.has(actualIndex) && !isCleanFixture(actual.file));

  const criticalPlanted = planted.filter((p) => p.row.startsWith('C'));
  const criticalHits = hits.filter((p) => p.row.startsWith('C'));

  return {
    score: Number(verdict.qualityScore ?? Number.NaN),
    recommendation: verdict.recommendation ?? 'n/a',
    planted: planted.length,
    hits: hits.length,
    misses: planted.filter((p) => !hits.includes(p)),
    criticalPlanted: criticalPlanted.length,
    criticalHits: criticalHits.length,
    reported: reported.length,
    falsePositives: falsePositives.length,
    unattributed: unattributed.length,
    unlocated,
  };
}

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const stdev = (values) => {
  if (values.length < 2) return Number.NaN;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
};
const ratio = (numerator, denominator) => (denominator === 0 ? Number.NaN : numerator / denominator);
const pct = (value) => (Number.isNaN(value) ? '  n/a' : `${(value * 100).toFixed(0).padStart(3)}%`);

/**
 * The digest of the exact prompt the CLI sends, read out of the CLI's own
 * `--agent none` mode rather than rebuilt here: a digest of a prompt the harness
 * reconstructed is a digest of something that was never sent.
 *
 * Absolute paths that change every run are normalized out first. Without that the
 * digest is a fresh number each time and compares with nothing.
 *
 * @returns {string|null} Null when the CLI could not produce a prompt.
 */
function promptDigestFromCli() {
  const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-eval-prompt-'));
  try {
    const args = [CLI, '--agent', 'none', '--files', reviewFilePaths().join(','), '--output', path.join(probeDir, 'test-review.md')];
    const probe = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: PROJECT_ROOT, timeout: 120_000 });
    if (probe.error || probe.status !== 0 || !probe.stdout) return null;
    const normalized = probe.stdout.split(PROJECT_ROOT).join('<project-root>').split(probeDir).join('<run-dir>');
    return digest(normalized);
  } catch {
    return null;
  } finally {
    fs.rmSync(probeDir, { recursive: true, force: true });
  }
}

/**
 * Write the machine-readable record when --json asked for one, then exit with
 * the code the failure class carries. The class is derived from the runners and
 * the suite-level problems, and the exit code from the class, so the printed
 * outcome and the recorded outcome cannot disagree.
 */
function finish({ options, startedAt, mode, runners, suiteFailureClasses = [] }) {
  const failureClass = worstFailureClass([...runners.map((runner) => runner.failureClass), ...suiteFailureClasses]);
  const exitCode = exitCodeForFailureClass(failureClass);

  if (options.jsonPath) {
    // The record's suite identity comes from the manifest, so a manifest that
    // cannot be read means the record cannot be written. That is a configuration
    // failure, never a silent skip of the file the caller asked for.
    let suite;
    try {
      suite = suiteById(loadSuiteManifest(PROJECT_ROOT).manifest, SUITE_ID);
    } catch (error) {
      console.error(`${colors.red}eval: ${error.message}${colors.reset}`);
      process.exit(2);
    }
    // One review call covers the whole corpus, so every case shares the bundle's
    // prompt digest.
    const promptDigest = mode === 'live' ? promptDigestFromCli() : null;
    writeSuiteResult(
      options.jsonPath,
      suiteResultRecord({
        mode,
        suite,
        repository: repositoryState(PROJECT_ROOT),
        fixtureDigest: digestFiles(PROJECT_ROOT, suite.fixtures),
        promptDigest,
        cases: caseIds().map((id) => ({ id, promptDigest })),
        runners,
        durationMs: Date.now() - startedAt,
        suiteFailureClasses,
      }),
    );
    console.log(`${colors.dim}result written to ${options.jsonPath}${colors.reset}`);
  }

  process.exit(exitCode);
}

/** The per-runner half of the result record. */
function runnerRecord(agent, options, versions, { expected, completed, measurements, durationMs, failureClass, failures }) {
  const executable = agent === 'custom' ? options.agentCmd : agent;
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
    usage: null, // No built-in adapter reports tokens or cost yet; a zero would be a claim.
    failureClass,
    failures,
  };
}

function main() {
  const startedAt = Date.now();
  const options = parseArgs(process.argv.slice(2));
  const { agents, runs, preflightOnly } = options;

  console.log(`${colors.cyan}========================================`);
  console.log('tea-test-review eval harness');
  console.log(`========================================${colors.reset}\n`);

  const { problems, groundTruth, versions } = preflight(options);
  if (problems.length > 0) {
    console.error(`${colors.red}eval pre-flight failed; nothing was measured:${colors.reset}`);
    for (const problem of problems) console.error(`  - ${problem.message}`);
    console.error(`\n${colors.dim}A failed pre-flight is exit 2, never a 0% score.${colors.reset}`);
    finish({
      options,
      startedAt,
      mode: preflightOnly ? 'preflight-only' : 'live',
      runners: [],
      suiteFailureClasses: problems.map((problem) => problem.failureClass),
    });
  }
  if (preflightOnly) {
    console.log(`\n${colors.green}pre-flight only; nothing measured.${colors.reset}`);
    finish({ options, startedAt, mode: 'preflight-only', runners: [] });
  }

  const plantedTotal = (groundTruth.files ?? []).reduce((sum, file) => sum + (file.planted ?? []).length, 0);
  console.log(
    `${colors.dim}corpus: ${groundTruth.files.length} fixtures, ${plantedTotal} planted defects, ${runs} run(s) per agent${colors.reset}\n`,
  );

  const runners = [];

  for (const agent of agents) {
    console.log(`${colors.cyan}${agent}${colors.reset}`);
    const agentStartedAt = Date.now();
    const results = [];
    const lostRunClasses = [];

    for (let runIndex = 0; runIndex < runs; runIndex += 1) {
      const outcome = runReview(agent, runIndex, options);
      if (!outcome.ok) {
        lostRunClasses.push(outcome.failureClass);
        continue;
      }
      const scored = scoreVerdict(outcome.verdict, groundTruth);
      if (!scored) {
        console.error(
          `  ${colors.red}run ${runIndex + 1}: the verdict carries no findings array, so nothing could be scored${colors.reset}`,
        );
        lostRunClasses.push('environment-parser');
        continue;
      }
      results.push(scored);
      console.log(
        `  run ${runIndex + 1}: score ${scored.score}, ${scored.recommendation}, ` +
          `recall ${scored.hits}/${scored.planted}, false positives ${scored.falsePositives}, ` +
          `unattributed ${scored.unattributed}, unlocated ${scored.unlocated}`,
      );
    }

    if (results.length === 0) {
      console.error(`  ${colors.red}no successful runs; nothing was measured for ${agent}${colors.reset}\n`);
      runners.push(
        runnerRecord(agent, options, versions, {
          expected: runs,
          completed: 0,
          measurements: {},
          durationMs: Date.now() - agentStartedAt,
          failureClass: worstFailureClass([...lostRunClasses, 'environment-incomplete-repetitions']),
          failures: ['no run produced a scorable result'],
        }),
      );
      continue;
    }

    const recall = mean(results.map((r) => ratio(r.hits, r.planted)));
    const criticalRecall = mean(results.map((r) => ratio(r.criticalHits, r.criticalPlanted)));
    const nonFalsePositiveRate = mean(results.map((r) => ratio(r.reported - r.falsePositives, r.reported)));
    const unattributedMean = mean(results.map((r) => r.unattributed));
    const unlocatedMean = mean(results.map((r) => r.unlocated));
    const scoreSpread = stdev(results.map((r) => r.score));
    const verdicts = new Set(results.map((r) => r.recommendation));

    console.log(`  ${colors.dim}────────${colors.reset}`);
    console.log(`  recall            ${pct(recall)}   (threshold ${pct(THRESHOLDS.recall)})`);
    console.log(`  CRITICAL recall   ${pct(criticalRecall)}   (threshold ${pct(THRESHOLDS.criticalRecall)})`);
    console.log(
      `  non-false-positive${pct(nonFalsePositiveRate)}   (threshold ${pct(THRESHOLDS.nonFalsePositiveRate)}, ` +
        'clean-fixture findings are the only definite false positives)',
    );
    console.log(
      `  unattributed      ${unattributedMean
        .toFixed(1)
        .padStart(
          5,
        )}   ${colors.dim}findings on seeded fixtures matching no planted row; review these by hand, they may be real${colors.reset}`,
    );
    console.log(
      `  unlocated         ${unlocatedMean
        .toFixed(1)
        .padStart(5)}   ${colors.dim}findings naming no file, so no scorer can judge them either way${colors.reset}`,
    );
    console.log(
      `  score stdev       ${Number.isNaN(scoreSpread) ? ' n/a' : scoreSpread.toFixed(2).padStart(5)}   (max ${THRESHOLDS.maxScoreStdev})`,
    );
    console.log(
      `  verdict stability ${verdicts.size === 1 ? `${colors.green}stable${colors.reset}` : `${colors.red}${verdicts.size} different verdicts on identical input${colors.reset}`}`,
    );

    const missed = results[0].misses;
    if (missed.length > 0) {
      console.log(`  ${colors.yellow}missed on run 1:${colors.reset}`);
      for (const miss of missed) console.log(`    ${miss.row} ${miss.path}:${miss.line} — ${miss.what}`);
    }

    const measurements = {
      recall: measured(recall),
      criticalRecall: measured(criticalRecall),
      nonFalsePositiveRate: measured(nonFalsePositiveRate),
      unattributedMean: measured(unattributedMean),
      unlocatedMean: measured(unlocatedMean),
      scoreStdev: measured(scoreSpread),
      distinctVerdicts: verdicts.size,
      meanScore: measured(mean(results.map((r) => r.score))),
    };

    // A lost run is an environment failure, and it takes variance and stability
    // with it: agreement across two of three runs is one fewer observation than
    // the gate declared, so reporting it as stable would launder the loss into a
    // pass. The numbers above still print, because a partial measurement is worth
    // reading even when it cannot be scored.
    if (results.length < runs) {
      const failureClass = worstFailureClass([...lostRunClasses, 'environment-incomplete-repetitions']);
      console.log(
        `  ${colors.red}only ${results.length}/${runs} declared repetitions completed; variance and stability are unmeasurable${colors.reset}\n`,
      );
      runners.push(
        runnerRecord(agent, options, versions, {
          expected: runs,
          completed: results.length,
          measurements,
          durationMs: Date.now() - agentStartedAt,
          failureClass,
          failures: [`${results.length} of ${runs} declared repetitions completed`],
        }),
      );
      continue;
    }

    // NaN fails every comparison, so an unmeasurable metric would otherwise pass
    // its threshold silently: a reviewer that reports nothing at all divides by
    // zero and clears the bar it never met. Unmeasurable is a failure here, and it
    // says which metric. scoreSpread is the one exception, since a single run
    // legitimately has no variance to measure.
    const failures = [];
    for (const [label, value, threshold] of [
      ['CRITICAL recall', criticalRecall, THRESHOLDS.criticalRecall],
      ['recall', recall, THRESHOLDS.recall],
      ['non-false-positive rate', nonFalsePositiveRate, THRESHOLDS.nonFalsePositiveRate],
    ]) {
      if (Number.isNaN(value)) failures.push(`${label} (unmeasurable)`);
      else if (value < threshold) failures.push(label);
    }
    if (!Number.isNaN(scoreSpread) && scoreSpread > THRESHOLDS.maxScoreStdev) failures.push('score variance');
    if (verdicts.size > 1) failures.push('verdict stability');

    if (failures.length > 0) {
      console.log(`  ${colors.red}below threshold: ${failures.join(', ')}${colors.reset}\n`);
    } else {
      console.log(`  ${colors.green}all thresholds met${colors.reset}\n`);
    }

    runners.push(
      runnerRecord(agent, options, versions, {
        expected: runs,
        completed: results.length,
        measurements,
        durationMs: Date.now() - agentStartedAt,
        failureClass: failures.length > 0 ? 'quality' : 'none',
        failures,
      }),
    );
  }

  finish({ options, startedAt, mode: 'live', runners });
}

// Only when invoked directly, so the scoring internals can be exercised without
// spending a vendor run: the harness that measures the reviewer needs measuring too.
if (require.main === module) {
  main();
}

module.exports = {
  admittedLinesFor,
  scoreVerdict,
  missingCredential,
  parseArgs,
  reviewFilePaths,
  caseIds,
  THRESHOLDS,
  SUITE_ID,
};
