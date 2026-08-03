#!/usr/bin/env node
/**
 * tea-test-review — headless runner for the bmad-testarch-test-review skill.
 *
 * Locates the installed skill in a consuming project, splits the PR diff into
 * the test files to review and the rest of the change to read as context,
 * builds a headless prompt that bypasses the skill's interactive menu, spawns
 * the agent with the prompt on stdin (optionally under filesystem isolation),
 * and parses the strict-schema test-review.md into a JSON verdict with a
 * CI-friendly exit code.
 *
 * The context set takes no configuration: if the story is in the PR it is in
 * the diff. The report must publish the resulting Context Basis, so an Approve
 * reached without requirements says so on its face.
 *
 * Exit codes: 0 pass/skip (or a verdict failure waived with --waive), 1 review
 * verdict fail (or a skip with --fail-on-skip / a deletions-only diff),
 * 2 environment/config error, 3 agent or parse failure. A waiver never applies
 * to exit 2 or 3: environment, agent, and parse failures are never waivable.
 *
 * Usage:
 *   tea-test-review --base origin/main --agent claude --json test-review.json
 *   tea-test-review --agent none --files x.spec.ts   # print prompt bundle only
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Command } = require('commander');

const { resolveSkill } = require('./lib/resolve-skill');
const {
  getChangedFiles,
  getChangedTestFiles,
  getContextFiles,
  getDeletedTestFiles,
  contextBasisFor,
  isTestFile,
  assertSafePaths,
  registerExtraTestPattern,
} = require('./lib/changed-tests');
const { buildPrompt } = require('./lib/build-prompt');
const { parseReport, verdictFor, scoreFails } = require('./lib/parse-report');
const { runAgent } = require('./lib/run-agent');
const { AGENT_ADAPTERS, resolveModel } = require('./lib/agent-adapters');
const { withIsolation, selectBackend } = require('./lib/isolate');
const { resolveTeaConfig, PACT_MCP_VALUES } = require('./lib/resolve-tea-config');

const EXIT = {
  PASS: 0,
  VERDICT_FAIL: 1,
  ENV_ERROR: 2,
  AGENT_OR_PARSE_ERROR: 3,
};

const AGENTS = new Set([...Object.keys(AGENT_ADAPTERS), 'none']);
const SCOPES = new Set(['single', 'directory', 'suite']);
const FAIL_ON_LEVELS = new Set(['request-changes', 'block']);
const DEFAULT_TIMEOUT_MS = 1_800_000; // 30 minutes
const ENV_PASS_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function fail(exitCode, message) {
  console.error(`tea-test-review: ${message}`);
  process.exit(exitCode);
}

function collect(value, previous) {
  return [...previous, value];
}

/**
 * Validate a --waive-until value: it must be a real calendar date in YYYY-MM-DD
 * form, strictly after the local today (day granularity, local timezone).
 *
 * @param {string} value - The --waive-until option value.
 * @returns {string|null} The trimmed date string when valid, else null.
 */
function parseWaiveUntil(value) {
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null; // rolled over (e.g. 2026-02-30): not a real calendar date
  }
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return date.getTime() > today.getTime() ? trimmed : null;
}

function writeJsonFile(jsonPath, payload) {
  try {
    fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
    fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  } catch (error) {
    fail(EXIT.ENV_ERROR, `Failed to write JSON verdict to ${jsonPath}: ${error.message}`);
  }
}

function main() {
  const program = new Command();

  program
    .name('tea-test-review')
    .description(
      "Headless runner for the bmad-testarch-test-review skill: scopes the review to the PR's changed test files, reads the rest of the diff as context, and emits a JSON verdict with CI-friendly exit codes.",
    )
    .option('--base <ref>', 'git base ref used to diff changed files', 'origin/main')
    .option(
      '--files <list>',
      'file list used verbatim as the review set; repeatable and comma-separated (skips git diff and the test-file filter)',
      collect,
      [],
    )
    .option(
      '--scope <scope>',
      'review_scope override passed to the skill (single|directory|suite); default derives from the review set size (single for one file, directory otherwise)',
    )
    .option('--test-dir <dir>', 'test directory hint passed to the skill', 'tests')
    .option(
      '--test-glob <substring-or-regex>',
      'extra test-file matcher appended to the built-in rules: a plain substring or a /regex/ matched against the repo-relative path (repeatable)',
      collect,
      [],
    )
    .option('--project-root <dir>', 'consuming project root', process.cwd())
    .option(
      '--skill-root <path>',
      'explicit trusted skill root (directory containing SKILL.md); skips the install probe. When it resolves outside --project-root the control-plane guard is moot: the PR diff cannot touch a reviewer that lives outside the checkout',
    )
    .option('--output <file>', 'report path the agent must write', 'test-review.md')
    .option('--json <file>', 'also write the verdict JSON to this file')
    .option(
      '--agent <agent>',
      `review executor: ${[...Object.keys(AGENT_ADAPTERS), 'none'].join('|')} (none prints the prompt bundle only)`,
      'claude',
    )
    .option(
      '--model <model>',
      `model the review agent runs on, overriding whatever the vendor CLI would resolve from its own config (pinned defaults: ${Object.entries(
        AGENT_ADAPTERS,
      )
        .map(([name, adapter]) => `${name}=${adapter.defaultModel}`)
        .join(', ')})`,
    )
    .option('--agent-cmd <path>', 'override the agent executable (advanced; used by tests with a stub agent)')
    .option('--claude-arg <arg>', 'extra argument passed through to the claude CLI (repeatable)', collect, [])
    .option(
      '--env-pass <NAME>',
      'environment variable name allowed through to the agent beyond the minimal default set (repeatable)',
      collect,
      [],
    )
    .option('--timeout-ms <n>', 'agent wall-clock timeout in milliseconds (SIGTERM on expiry)', String(DEFAULT_TIMEOUT_MS))
    .option('--min-score <n>', 'verdict fails when the report quality score is below n (integer 0-100)')
    .option('--max-critical <n>', 'verdict fails when the report declares more than n Critical violations (integer; default: no cap)')
    .option('--min-files <n>', 'verdict fails when the report reviews fewer than n files (integer)', '1')
    .option('--fail-on <level>', 'weakest recommendation that fails CI: request-changes or block', 'request-changes')
    .option('--fail-on-skip', 'exit 1 instead of 0 when the review is skipped (no changed test files)')
    .option(
      '--waive <reason>',
      'waive any verdict-fail outcome (exit 0 instead of 1) and record this reason in the verdict payload; requires --waive-until. Exit 2/3 (environment, agent, or parse failures) are NEVER waivable',
    )
    .option(
      '--waive-until <YYYY-MM-DD>',
      'expiry for --waive; must be a real calendar date strictly in the future (compared at day granularity against the local date)',
    )
    .option('--isolate', 'run the agent under filesystem isolation (sandbox-exec, bwrap, or chmod fallback)')
    .option('--no-isolate', 'disable filesystem isolation (default: isolated when CI is set, otherwise off)')
    .option(
      '--use-playwright-utils',
      'force tea_use_playwright_utils on, overriding _bmad/tea/config.yaml (default when nothing states it: true)',
    )
    .option('--no-use-playwright-utils', 'force tea_use_playwright_utils off, overriding _bmad/tea/config.yaml')
    .option('--use-pactjs-utils', 'force tea_use_pactjs_utils on, overriding _bmad/tea/config.yaml (default when nothing states it: false)')
    .option('--no-use-pactjs-utils', 'force tea_use_pactjs_utils off, overriding _bmad/tea/config.yaml')
    .option('--pact-mcp <mode>', `force tea_pact_mcp, overriding _bmad/tea/config.yaml (${PACT_MCP_VALUES.join('|')}; default: none)`);

  program.exitOverride();
  try {
    program.parse(process.argv);
  } catch (error) {
    // --help/--version print their output and throw with exitCode 0.
    if (error.exitCode === 0) {
      process.exit(EXIT.PASS);
    }
    fail(EXIT.ENV_ERROR, error.message);
  }
  const options = program.opts();

  if (!AGENTS.has(options.agent)) {
    fail(EXIT.ENV_ERROR, `--agent must be one of ${[...AGENTS].join(', ')}; got "${options.agent}".`);
  }
  if (options.scope !== undefined && !SCOPES.has(options.scope)) {
    fail(EXIT.ENV_ERROR, `--scope must be one of ${[...SCOPES].join(', ')}; got "${options.scope}".`);
  }
  if (!FAIL_ON_LEVELS.has(options.failOn)) {
    fail(EXIT.ENV_ERROR, `--fail-on must be one of ${[...FAIL_ON_LEVELS].join(', ')}; got "${options.failOn}".`);
  }
  if (options.pactMcp !== undefined && !PACT_MCP_VALUES.includes(options.pactMcp)) {
    fail(EXIT.ENV_ERROR, `--pact-mcp must be one of ${PACT_MCP_VALUES.join(', ')}; got "${options.pactMcp}".`);
  }
  // Rejected rather than ignored: --agent none runs no agent, so honoring a
  // model here would be a lie, and silently dropping a stated input is the
  // failure mode --model exists to remove.
  if (options.model !== undefined && options.agent === 'none') {
    fail(EXIT.ENV_ERROR, '--model has no meaning with --agent none, which runs no agent; drop one of the two.');
  }
  let resolvedModel = null;
  if (options.agent !== 'none') {
    try {
      resolvedModel = resolveModel(options.agent, options.model, options.claudeArg);
    } catch (error) {
      if (error.code === 'MODEL_ARG_INVALID' || error.code === 'MODEL_ARG_CONFLICT') {
        fail(EXIT.ENV_ERROR, error.message);
      }
      throw error;
    }
  }
  const timeoutMs = Number.parseInt(options.timeoutMs, 10);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    fail(EXIT.ENV_ERROR, `--timeout-ms must be a positive integer; got "${options.timeoutMs}".`);
  }
  let minScore;
  if (options.minScore !== undefined) {
    if (!/^\d+$/.test(options.minScore.trim())) {
      fail(EXIT.ENV_ERROR, `--min-score must be an integer 0-100; got "${options.minScore}".`);
    }
    minScore = Number.parseInt(options.minScore, 10);
    if (minScore > 100) {
      fail(EXIT.ENV_ERROR, `--min-score must be an integer 0-100; got "${options.minScore}".`);
    }
  }
  let maxCritical;
  if (options.maxCritical !== undefined) {
    if (!/^\d+$/.test(options.maxCritical.trim())) {
      fail(EXIT.ENV_ERROR, `--max-critical must be a non-negative integer; got "${options.maxCritical}".`);
    }
    maxCritical = Number.parseInt(options.maxCritical, 10);
  }
  if (!/^\d+$/.test(options.minFiles.trim())) {
    fail(EXIT.ENV_ERROR, `--min-files must be a non-negative integer; got "${options.minFiles}".`);
  }
  const minFiles = Number.parseInt(options.minFiles, 10);
  if (options.waiveUntil !== undefined && options.waive === undefined) {
    fail(EXIT.ENV_ERROR, '--waive-until requires --waive <reason>.');
  }
  let waiver = null;
  if (options.waive !== undefined) {
    if (options.waiveUntil === undefined) {
      fail(EXIT.ENV_ERROR, '--waive requires --waive-until <YYYY-MM-DD> (a real calendar date strictly in the future).');
    }
    const waiveUntil = parseWaiveUntil(options.waiveUntil);
    if (waiveUntil === null) {
      fail(
        EXIT.ENV_ERROR,
        `--waive-until must be a real calendar date in YYYY-MM-DD form, strictly in the future; got "${options.waiveUntil}".`,
      );
    }
    waiver = { reason: options.waive, until: waiveUntil };
  }
  for (const name of options.envPass) {
    if (!ENV_PASS_NAME.test(name)) {
      fail(EXIT.ENV_ERROR, `--env-pass must be an environment variable name; got "${name}".`);
    }
  }
  try {
    for (const glob of options.testGlob) {
      registerExtraTestPattern(glob);
    }
  } catch (error) {
    if (error.code === 'INVALID_TEST_GLOB') {
      fail(EXIT.ENV_ERROR, error.message);
    }
    throw error;
  }

  const projectRoot = path.resolve(options.projectRoot);
  const outputPath = path.resolve(projectRoot, options.output);
  const jsonPath = options.json ? path.resolve(projectRoot, options.json) : null;
  if (jsonPath && jsonPath === outputPath) {
    fail(EXIT.ENV_ERROR, '--output and --json must resolve to different files.');
  }

  // An explicit --skill-root is the trusted source of truth: it bypasses the
  // install probe entirely and is validated directly.
  let skillRoot;
  if (options.skillRoot === undefined) {
    try {
      skillRoot = resolveSkill(projectRoot);
    } catch (error) {
      if (error.code === 'SKILL_MISSING') {
        fail(EXIT.ENV_ERROR, error.message);
      }
      throw error;
    }
  } else {
    skillRoot = path.resolve(projectRoot, options.skillRoot);
    if (!fs.existsSync(path.join(skillRoot, 'SKILL.md'))) {
      fail(EXIT.ENV_ERROR, `--skill-root "${options.skillRoot}" does not contain a SKILL.md (resolved: ${skillRoot}).`);
    }
  }

  // Every config key step-01 branches on is resolved here (flag, then the
  // project's config.yaml, then the module default) and stated in the prompt.
  // An unstated key is one the agent decides per run.
  let teaConfig;
  try {
    teaConfig = resolveTeaConfig({ projectRoot, flags: options }).values;
  } catch (error) {
    if (error.code === 'TEA_CONFIG_INVALID') {
      fail(EXIT.ENV_ERROR, error.message);
    }
    throw error;
  }

  /** Evaluate every verdict gate against a parsed report; returns failure reasons (empty = pass). */
  function evaluateGates(parsed) {
    const failures = [];
    if (verdictFor(parsed.recommendation, options.failOn) === 'fail') {
      failures.push(`Verdict "${parsed.recommendation}" fails --fail-on ${options.failOn}.`);
    }
    if (minScore !== undefined && scoreFails(parsed.qualityScore, minScore)) {
      failures.push(`Quality score ${parsed.qualityScore} fails --min-score ${minScore}.`);
    }
    if (maxCritical !== undefined && parsed.violations.critical > maxCritical) {
      failures.push(`Critical violations ${parsed.violations.critical} exceeds --max-critical ${maxCritical}.`);
    }
    if (parsed.reviewedFiles.length < minFiles) {
      failures.push(`insufficient evidence: ${parsed.reviewedFiles.length} files reviewed (${minFiles} required)`);
    }
    return failures;
  }

  /**
   * When a failing outcome is waived, print a prominent WAIVED banner to stdout
   * (so the CI log cannot hide it) and attach the waiver fields to the payload.
   * Only verdict-fail outcomes reach here; exit 2/3 never do.
   */
  function applyWaiver(payload, failing) {
    if (!failing || !waiver) {
      return payload;
    }
    console.log('==========================================================');
    console.log(`WAIVED: test-review gate failure waived until ${waiver.until}`);
    console.log(`Reason: ${waiver.reason}`);
    console.log('==========================================================');
    return { ...payload, waived: true, waiveReason: waiver.reason, waiveUntil: waiver.until };
  }

  // One diff, both lists. Test files are the review set and get scored;
  // everything else is the context set and gets read. If the story is in the
  // PR it is in the diff, which is why there is no flag for any of this.
  // An explicit --files list is authoritative user intent and never consults
  // git, so it produces a review set and no context.
  const filesProvided = options.files.length > 0;
  let allChangedFiles = null;
  let changedTestFiles;
  let contextFiles = [];
  let contextTruncated = false;
  try {
    if (filesProvided) {
      changedTestFiles = getChangedTestFiles({ files: options.files, projectRoot });
    } else {
      allChangedFiles = getChangedFiles({ base: options.base, projectRoot });
      changedTestFiles = allChangedFiles.filter((file) => isTestFile(file));
      ({ files: contextFiles, truncated: contextTruncated } = getContextFiles(allChangedFiles));
    }
  } catch (error) {
    if (error.code === 'GIT_DIFF_FAILED' || error.code === 'BASE_UNRESOLVABLE') {
      fail(EXIT.ENV_ERROR, error.message);
    }
    throw error;
  }
  const contextBasis = contextBasisFor({ files: contextFiles, truncated: contextTruncated });

  // Fail closed on hostile paths before they reach the prompt (or anywhere
  // else). Context paths travel in their own delimited block and get the same
  // treatment as the review set.
  try {
    assertSafePaths(changedTestFiles);
    assertSafePaths(contextFiles);
  } catch (error) {
    if (error.code === 'UNSAFE_PATH') {
      fail(EXIT.ENV_ERROR, error.message);
    }
    throw error;
  }

  if (changedTestFiles.length === 0) {
    // A deletions-only diff is never a pass: distinguish it from a
    // zero-test-change diff with a second --diff-filter=D pass.
    let deletedTestFiles = [];
    if (!filesProvided) {
      try {
        deletedTestFiles = getDeletedTestFiles({ base: options.base, projectRoot });
      } catch (error) {
        if (error.code === 'GIT_DIFF_FAILED' || error.code === 'BASE_UNRESOLVABLE') {
          fail(EXIT.ENV_ERROR, error.message);
        }
        throw error;
      }
    }
    const deletionsOnly = deletedTestFiles.length > 0;
    const skipFails = deletionsOnly || options.failOnSkip;
    const skipped = {
      skipped: true,
      reason: deletionsOnly ? 'only test deletions in diff; nothing to review' : 'no changed test files in diff',
      recommendation: null,
      qualityScore: null,
      files: [],
      contextBasis,
      contextFiles,
    };
    if (deletionsOnly) {
      skipped.deletedFiles = deletedTestFiles;
      console.log('Only test deletions detected in the diff; nothing to review.');
    } else {
      console.log('No changed test files detected; skipping test review.');
    }
    const skippedPayload = applyWaiver(skipped, skipFails);
    console.log(JSON.stringify(skippedPayload, null, 2));
    if (jsonPath) {
      writeJsonFile(jsonPath, skippedPayload);
    }
    process.exit(skipFails && !waiver ? EXIT.VERDICT_FAIL : EXIT.PASS);
  }

  if (options.agent === 'none') {
    const prompt = buildPrompt({
      skillRoot,
      files: changedTestFiles,
      outputPath,
      scope: options.scope,
      testDir: options.testDir,
      teaConfig,
      contextFiles,
      contextBasis,
    });
    console.log(prompt);
    if (jsonPath) {
      writeJsonFile(jsonPath, { promptOnly: true, files: changedTestFiles, contextFiles, contextBasis });
    }
    process.exit(EXIT.PASS);
  }

  // Control-plane guard: a PR that modifies the effective skill rewrites the
  // reviewer gating it. Fail closed unless the user supplied --files explicitly
  // (explicit intent is authoritative). Only applies when the skill lives
  // inside the project root; an explicit --skill-root outside the checkout is
  // untouchable by the diff, so the guard is moot and never runs.
  if (!filesProvided) {
    const relativeSkillRoot = path.relative(projectRoot, skillRoot);
    const skillInsideProject = relativeSkillRoot === '' || (!relativeSkillRoot.startsWith('..') && !path.isAbsolute(relativeSkillRoot));
    if (skillInsideProject) {
      const skillPrefix = relativeSkillRoot === '' ? './' : relativeSkillRoot.split(path.sep).join('/') + '/';
      const touched = relativeSkillRoot === '' ? allChangedFiles : allChangedFiles.filter((file) => file.startsWith(skillPrefix));
      if (touched.length > 0) {
        fail(
          EXIT.ENV_ERROR,
          `The diff modifies the reviewer control plane (${skillPrefix}): ${touched.join(', ')}. ` +
            'The gate cannot trust a review defined by the change under review; review the skill change separately or vendor a pinned skill from outside the checkout.',
        );
      }
    }
  }

  // Isolation defaults on in CI unless explicitly overridden either way.
  const isolateExplicit = program.getOptionValueSource('isolate') === 'cli';
  const isolateRequested = isolateExplicit ? options.isolate : Boolean(process.env.CI);
  let isolationActive = false;
  if (isolateRequested) {
    let backend;
    try {
      backend = selectBackend();
    } catch (error) {
      if (error.code === 'ISOLATION_ERROR') {
        fail(EXIT.ENV_ERROR, error.message);
      }
      throw error;
    }
    if (backend !== null) {
      isolationActive = true;
    } else if (isolateExplicit) {
      fail(EXIT.ENV_ERROR, '--isolate was requested but no isolation backend (sandbox-exec, bwrap, chmod) is available on this platform.');
    } else {
      console.error('tea-test-review: CI requested isolation but no backend is available on this platform; continuing without it.');
    }
  }

  // Never parse a leftover report or verdict from a previous run: delete both
  // first, then require artifacts newer than this run's start time.
  fs.rmSync(outputPath, { force: true });
  if (jsonPath) {
    fs.rmSync(jsonPath, { force: true });
  }
  const runStart = Date.now();

  const writablePaths = [outputPath, ...(jsonPath ? [jsonPath] : [])];
  let redirectDir = null;
  let gateFailures = [];

  // runAgent() blocks synchronously with no streamed output, so a real review
  // (minutes, on a large file) prints nothing at all until it's done and looks
  // hung. This heartbeat is a separate OS process, not a JS timer, because
  // nothing in this process can run while runAgent's spawnSync call blocks it.
  const startHeartbeat = (intervalSeconds = 15) => {
    // Printed from Node, not from inside the sh -c script, so the model name
    // never has to survive shell quoting.
    console.error(`tea-test-review: agent running (${options.agent}, model ${resolvedModel})...`);
    const script =
      'i=0; while true; do sleep ' +
      intervalSeconds +
      '; i=$((i + ' +
      intervalSeconds +
      ')); echo "tea-test-review: agent still running (${i}s elapsed)..." 1>&2; done';
    const heartbeat = spawn('sh', ['-c', script], { stdio: ['ignore', 'ignore', 'inherit'] });
    // Cosmetic (progress dots for a long blocking spawnSync call): a spawn
    // failure here must never surface as an uncaught 'error' event and take
    // the real review down with it.
    heartbeat.on('error', () => {});
    heartbeat.unref();
    return () => heartbeat.kill();
  };

  const executeRun = ({ agentCwd, spawnPrefix }) => {
    // Under isolation the agent writes into a fresh tmpdir; the CLI copies the
    // artifacts back to the requested paths after a successful run.
    let agentOutputPath = outputPath;
    let agentJsonPath = jsonPath;
    if (isolationActive) {
      redirectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-test-review-'));
      agentOutputPath = path.join(redirectDir, 'test-review.md');
      agentJsonPath = jsonPath ? path.join(redirectDir, 'verdict.json') : null;
    }

    const prompt = buildPrompt({
      skillRoot,
      files: changedTestFiles,
      outputPath: agentOutputPath,
      scope: options.scope,
      testDir: options.testDir,
      teaConfig,
      contextFiles,
      contextBasis,
    });

    const stopHeartbeat = startHeartbeat();
    try {
      runAgent(prompt, {
        agent: options.agent,
        agentCommand: options.agentCmd,
        agentArgs: options.claudeArg,
        model: options.model,
        timeout: timeoutMs,
        cwd: agentCwd,
        envPass: options.envPass,
        spawnPrefix,
      });
    } finally {
      stopHeartbeat();
    }

    if (!fs.existsSync(agentOutputPath) || fs.statSync(agentOutputPath).mtimeMs <= runStart) {
      // Throw rather than fail()/process.exit() here: this runs inside
      // withIsolation's callback, and exiting the process skips its finally
      // block (restoreModes(), the chmod-fallback permission restore) along
      // with the outer redirectDir cleanup below. Thrown errors propagate
      // through both finally blocks before the outer catch calls fail().
      const error = new Error(
        `Agent finished but no fresh report was written to ${agentOutputPath}; refusing to parse a stale or missing report.`,
      );
      error.code = 'REPORT_MISSING';
      throw error;
    }

    // The report is copied back even when the verdict fails or parsing fails;
    // on agent failure nothing was produced and nothing is copied.
    if (redirectDir) {
      fs.copyFileSync(agentOutputPath, outputPath);
    }

    let parsed;
    try {
      parsed = parseReport(fs.readFileSync(agentOutputPath, 'utf8'), {
        reviewedFiles: changedTestFiles,
        contextFiles,
        contextBasis,
      });
    } catch (error) {
      if (error.code === 'REPORT_UNPARSEABLE') {
        // Same reasoning as the freshness check above: throw, don't exit, so
        // isolation cleanup runs before the process actually terminates.
        const wrapped = new Error(`${error.message} (report: ${outputPath})`);
        wrapped.code = 'REPORT_UNPARSEABLE';
        throw wrapped;
      }
      throw error;
    }
    gateFailures = evaluateGates(parsed);

    // The verdict JSON files manifest is the report's own Reviewed Files
    // section — what the agent actually reviewed — never the input list.
    // agent/model travel with it so a stored verdict says what produced it:
    // a score is only comparable against another score from the same reviewer.
    const verdictPayload = {
      report: path.relative(projectRoot, outputPath),
      files: parsed.reviewedFiles,
      agent: options.agent,
      model: resolvedModel,
      ...parsed,
    };
    if (gateFailures.length > 0) {
      verdictPayload.gateFailures = gateFailures;
    }
    const finalPayload = applyWaiver(verdictPayload, gateFailures.length > 0);
    console.log(JSON.stringify(finalPayload, null, 2));

    if (agentJsonPath) {
      // No freshness check here, unlike the report: the CLI is the only writer of
      // the verdict JSON and writeJsonFile already fails closed on a write error,
      // so a stale verdict is not reachable. The pre-run rm still applies, so a
      // failed run leaves no previous verdict behind.
      writeJsonFile(agentJsonPath, finalPayload);
      if (redirectDir) {
        fs.copyFileSync(agentJsonPath, jsonPath);
      }
    }
  };

  try {
    if (isolationActive) {
      withIsolation(projectRoot, writablePaths, executeRun);
    } else {
      executeRun({ agentCwd: projectRoot, spawnPrefix: [] });
    }
  } catch (error) {
    if (
      error.code === 'AGENT_FAILED' ||
      error.code === 'AGENT_NOT_FOUND' ||
      error.code === 'REPORT_MISSING' ||
      error.code === 'REPORT_UNPARSEABLE'
    ) {
      fail(EXIT.AGENT_OR_PARSE_ERROR, error.message);
    }
    if (error.code === 'ISOLATION_ERROR') {
      fail(EXIT.ENV_ERROR, error.message);
    }
    throw error;
  } finally {
    if (redirectDir) {
      fs.rmSync(redirectDir, { recursive: true, force: true });
    }
  }

  for (const failure of gateFailures) {
    console.error(failure);
  }
  process.exit(gateFailures.length > 0 && !waiver ? EXIT.VERDICT_FAIL : EXIT.PASS);
}

try {
  main();
} catch (error) {
  // Exit code 1 is reserved strictly for a failing review verdict; anything
  // unexpected reaching here is an agent/runner failure.
  fail(EXIT.AGENT_OR_PARSE_ERROR, error && error.message ? error.message : String(error));
}
