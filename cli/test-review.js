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
 * 2 environment/config error, 3 agent, parse, or report-artifact failure. A
 * waiver never applies to exit 2 or 3: infrastructure failures are never
 * waivable.
 *
 * The payload shapes are declared as VERDICT_KEYS and SKIP_KEYS and exported,
 * because test/contracts/test-review.contract.json states the verdict's key set
 * and types and had no way to check that claim against this file.
 *
 * Usage:
 *   tea-test-review --base origin/main --agent claude --json test-review.json
 *   tea-test-review --agent none --files x.spec.ts   # print prompt bundle only
 */

const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Command } = require('commander');

const { resolveSkill } = require('./lib/resolve-skill');
const {
  getChangedFiles,
  getChangedTestFiles,
  getContextFiles,
  getUnscorableTestArtifacts,
  getForcedUnscorableCandidates,
  getDeletedTestFiles,
  contextBasisFor,
  isTestFile,
  assertSafePaths,
  registerExtraTestPattern,
} = require('./lib/changed-tests');
const { buildPrompt } = require('./lib/build-prompt');
const {
  parseReport,
  normalizeReportScore,
  deriveRecommendation,
  effectiveScoreFor,
  verdictRuleFor,
  verdictFor,
  scoreFails,
  rawScoreForViolations,
  PARSED_VERDICT_KEYS,
} = require('./lib/parse-report');
const { getDiffEvidence, applyFindingProvenance, subtractCounts } = require('./lib/diff-evidence');
const { computeConventionBaseline } = require('./lib/convention-baseline');
const { loadRegistryRowSeverities } = require('./lib/registry-rows');
const { runAgent } = require('./lib/run-agent');
const { AGENT_ADAPTERS, resolveModel } = require('./lib/agent-adapters');
const { withIsolation, selectBackend } = require('./lib/isolate');
const { resolveTeaConfig, PACT_MCP_VALUES } = require('./lib/resolve-tea-config');
const { TEA_CLI_VERSION, buildReviewProvenance } = require('./lib/review-provenance');

const EXIT = {
  PASS: 0,
  VERDICT_FAIL: 1,
  ENV_ERROR: 2,
  AGENT_OR_PARSE_ERROR: 3,
};

const AGENTS = new Set([...Object.keys(AGENT_ADAPTERS), 'none']);
const SCOPES = new Set(['single', 'directory', 'suite']);
const FAIL_ON_LEVELS = new Set(['request-changes', 'block']);
const GATE_ON_MODES = new Set(['introduced', 'all']);
const DEFAULT_TIMEOUT_MS = 1_800_000; // 30 minutes
const ENV_PASS_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const AGENT_OUTPUT_TAIL_LINES = 20;
const AGENT_OUTPUT_TAIL_CHARS = 8000;

// The adapter a run uses when --agent is not given. Named because
// tools/generate-contracts.js supplies it on the contract's sensitivity-witness
// legs, and a leg has to be a request this CLI could actually be handed.
const DEFAULT_AGENT = 'claude';

/**
 * Every key the verdict payload can carry, with the JSON type of each.
 *
 * This composes what parseReport contributes with the wrapper metadata, the
 * delta-gate fields, the CLI-computed diagnostics, and waiver metadata.
 * tools/generate-contracts.js derives
 * test-review.contract.json's response descriptor from it, so the contract's
 * requiredKeys, permittedKeys and types are read off the CLI. The transcription
 * they replaced permitted fifteen keys against the twenty-two named here.
 *
 * `model` is typed `null` ("declared, type not stated") because an adapter with
 * no model flag resolves no model and the key carries null on those runs, so no
 * single JSON type is true for it.
 */
const VERDICT_KEYS = {
  always: {
    report: 'string',
    files: 'array',
    agent: 'string',
    model: null,
    gateOn: 'string',
    gatingQualityScore: 'number',
    gatingViolations: 'object',
    reviewProvenance: 'object',
    ...PARSED_VERDICT_KEYS.always,
  },
  conditional: {
    ...PARSED_VERDICT_KEYS.conditional,
    unscorableTestArtifacts: 'array',
    gateFailures: 'array',
    waived: 'boolean',
    waiveReason: 'string',
    waiveUntil: 'string',
    allFindingsRecommendation: 'string',
  },
};

/**
 * Every key the skip payload can carry.
 *
 * A skip is a different shape from a verdict: no agent ran, so it states a null
 * recommendation and score and carries none of the fields a review produces. It
 * is deliberately excluded from the contract's response descriptor, because one
 * descriptor covering both shapes could only declare the union, and a union
 * whose recommendation and score are sometimes null asserts nothing about the
 * verdict the contract exists to check. Declared and asserted here so the
 * exclusion stays a tracked decision.
 */
const SKIP_KEYS = {
  always: {
    skipped: 'boolean',
    reason: 'string',
    recommendation: null,
    qualityScore: null,
    files: 'array',
    contextBasis: 'string',
    contextFiles: 'array',
    gateOn: 'string',
    reviewProvenance: 'object',
  },
  conditional: {
    unscorableTestArtifacts: 'array',
    deletedFiles: 'array',
    waived: 'boolean',
    waiveReason: 'string',
    waiveUntil: 'string',
  },
};

/**
 * Refuse to publish a payload whose keys disagree with its declaration.
 *
 * The contract's descriptor is generated from these constants, so an undeclared
 * key would ship a verdict the published contract forbids, and a declared
 * `always` key gone missing would ship one the contract's requiredKeys demand.
 * Both are code defects rather than report content, so this throws instead of
 * routing through an exit code.
 */
function assertDeclaredKeys(payload, declaration, label) {
  for (const key of Object.keys(declaration.always)) {
    if (!Object.hasOwn(payload, key)) {
      throw new Error(`tea-test-review: the ${label} payload is missing declared key "${key}"`);
    }
  }
  for (const key of Object.keys(payload)) {
    if (!Object.hasOwn(declaration.always, key) && !Object.hasOwn(declaration.conditional, key)) {
      throw new Error(`tea-test-review: the ${label} payload carries "${key}", which its key declaration does not name`);
    }
  }
  return payload;
}

function fail(exitCode, message) {
  console.error(`tea-test-review: ${message}`);
  process.exit(exitCode);
}

function collect(value, previous) {
  return [...previous, value];
}

/**
 * Keep the pre-multi-vendor passthrough spelling working while exposing the
 * generic name as the only documented interface. Normalizing argv before
 * Commander parses it preserves the exact order when old and new spellings
 * are mixed, which matters for paired vendor arguments such as `-c value`.
 *
 * @param {string[]} argv - Process argv.
 * @returns {{ argv: string[], usedDeprecatedAlias: boolean }}
 */
function normalizeAgentArgAliases(argv) {
  let usedDeprecatedAlias = false;
  const normalized = argv.map((arg) => {
    if (arg === '--claude-arg') {
      usedDeprecatedAlias = true;
      return '--agent-arg';
    }
    if (arg.startsWith('--claude-arg=')) {
      usedDeprecatedAlias = true;
      return `--agent-arg=${arg.slice('--claude-arg='.length)}`;
    }
    return arg;
  });
  return { argv: normalized, usedDeprecatedAlias };
}

function boundedAgentOutputTail(value) {
  const byLines = String(value || '')
    .trim()
    .split(/\r?\n/)
    .slice(-AGENT_OUTPUT_TAIL_LINES)
    .join('\n');
  return byLines.length > AGENT_OUTPUT_TAIL_CHARS ? byLines.slice(-AGENT_OUTPUT_TAIL_CHARS) : byLines;
}

function printMissingReportDiagnostics(agentResult) {
  for (const [label, value] of [
    ['stdout', agentResult && agentResult.stdout],
    ['stderr', agentResult && agentResult.stderr],
  ]) {
    const tail = boundedAgentOutputTail(value);
    if (tail) {
      console.error(`Agent ${label} before missing report (bounded tail):\n${tail}`);
    }
  }
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

function reportArtifactFailure(action, artifactPath, cause) {
  const error = new Error(`Failed to ${action} report artifact ${artifactPath}: ${cause.message}`);
  error.code = 'REPORT_ARTIFACT';
  return error;
}

function reportTemporaryPath(artifactPath) {
  return path.join(path.dirname(artifactPath), `.${path.basename(artifactPath)}.${randomUUID()}.tmp`);
}

function replaceReportArtifact(artifactPath, temporaryPath, writeTemporary) {
  let temporaryReady = false;
  try {
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    writeTemporary(temporaryPath);
    temporaryReady = true;
    fs.renameSync(temporaryPath, artifactPath);
  } catch (error) {
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {
      // Preserve the artifact error that caused the failure.
    }
    throw reportArtifactFailure(temporaryReady ? 'replace' : 'prepare', artifactPath, error);
  }
}

function copyReportArtifact(sourcePath, artifactPath, temporaryPath) {
  replaceReportArtifact(artifactPath, temporaryPath, (temporary) => {
    fs.copyFileSync(sourcePath, temporary);
  });
}

function writeReportArtifact(artifactPath, temporaryPath, content) {
  replaceReportArtifact(artifactPath, temporaryPath, (temporary) => {
    fs.writeFileSync(temporary, content, 'utf8');
  });
}

function appendDeltaAdvisory(report, findings, recommendation, qualityScore) {
  const advisory = findings.filter((finding) => !finding.verdict_impact);
  const lines = [
    '',
    '## PR Delta Gate',
    '',
    '**Gate Mode**: introduced',
    `**Gate Recommendation**: ${recommendation}`,
    `**Gate Quality Score**: ${qualityScore}/100`,
  ];
  if (advisory.length === 0) {
    lines.push('', 'No pre-existing findings were excluded from the PR verdict.');
  } else {
    lines.push('', '### Pre-existing Findings (Advisory)', '');
    for (const finding of advisory) {
      const location = finding.file ? `${finding.file}${finding.line === null ? '' : `:${finding.line}`}` : 'location unavailable';
      lines.push(
        `- **${finding.severity || 'Unscored'} ${finding.row}: ${finding.title}** — ${location}`,
        `  - Changed-line evidence: ${finding.changed_line_evidence.reason}.`,
        '  - Verdict impact: no.',
      );
    }
  }
  return `${report.trimEnd()}\n${lines.join('\n')}\n`;
}

function main() {
  const program = new Command();

  program
    .name('tea-test-review')
    .version(TEA_CLI_VERSION)
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
      '--focus <text>',
      'requester focus note handed to the reviewer verbatim (e.g. the text after an @mention that triggered the run); may raise scrutiny, never waives findings, and is quoted as a **Focus**: line in the report',
    )
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
      DEFAULT_AGENT,
    )
    .option(
      '--model <model>',
      `model the review agent runs on, overriding whatever the vendor CLI would resolve from its own config (pinned defaults: ${Object.entries(
        AGENT_ADAPTERS,
      )
        .filter(([, adapter]) => adapter.defaultModel)
        .map(([name, adapter]) => `${name}=${adapter.defaultModel}`)
        .join(', ')})`,
    )
    .option(
      '--agent-cmd <path>',
      'override the selected adapter executable; required with --agent custom for any stdin-driven headless CLI',
    )
    .option('--agent-arg <arg>', 'extra argument appended to the selected agent CLI argv (repeatable)', collect, [])
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
    .option(
      '--gate-on <mode>',
      'findings that affect the verdict: introduced or all (default: introduced for git-diff PR reviews, all with --files)',
    )
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
  const normalizedArgv = normalizeAgentArgAliases(process.argv);
  if (normalizedArgv.usedDeprecatedAlias) {
    console.error('tea-test-review: --claude-arg is deprecated; use --agent-arg.');
  }
  try {
    program.parse(normalizedArgv.argv);
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
  if (options.agent === 'custom' && !options.agentCmd) {
    fail(EXIT.ENV_ERROR, '--agent custom requires --agent-cmd <path>.');
  }
  if (options.scope !== undefined && !SCOPES.has(options.scope)) {
    fail(EXIT.ENV_ERROR, `--scope must be one of ${[...SCOPES].join(', ')}; got "${options.scope}".`);
  }
  if (!FAIL_ON_LEVELS.has(options.failOn)) {
    fail(EXIT.ENV_ERROR, `--fail-on must be one of ${[...FAIL_ON_LEVELS].join(', ')}; got "${options.failOn}".`);
  }
  if (options.gateOn !== undefined && !GATE_ON_MODES.has(options.gateOn)) {
    fail(EXIT.ENV_ERROR, `--gate-on must be one of ${[...GATE_ON_MODES].join(', ')}; got "${options.gateOn}".`);
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
      resolvedModel = resolveModel(options.agent, options.model, options.agentArg);
    } catch (error) {
      if (error.code === 'MODEL_ARG_INVALID' || error.code === 'MODEL_ARG_CONFLICT' || error.code === 'MODEL_UNSUPPORTED') {
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
  let installedPackages;
  try {
    const resolvedTeaConfig = resolveTeaConfig({ projectRoot, flags: options });
    teaConfig = resolvedTeaConfig.values;
    installedPackages = resolvedTeaConfig.installed;
  } catch (error) {
    if (error.code === 'TEA_CONFIG_INVALID') {
      fail(EXIT.ENV_ERROR, error.message);
    }
    throw error;
  }

  /** Evaluate every verdict gate against the selected finding set; returns failure reasons (empty = pass). */
  function evaluateGates(parsed) {
    const failures = [];
    if (verdictFor(parsed.recommendation, options.failOn) === 'fail') {
      failures.push(`Verdict "${parsed.recommendation}" under --gate-on ${gateOn} fails --fail-on ${options.failOn}.`);
    }
    if (minScore !== undefined && scoreFails(parsed.gatingQualityScore, minScore)) {
      failures.push(`Gating quality score ${parsed.gatingQualityScore} under --gate-on ${gateOn} fails --min-score ${minScore}.`);
    }
    if (maxCritical !== undefined && parsed.gatingViolations.critical > maxCritical) {
      failures.push(
        `Critical violations ${parsed.gatingViolations.critical} exceeds --max-critical ${maxCritical} under --gate-on ${gateOn}.`,
      );
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
  const gateOn = options.gateOn ?? (filesProvided ? 'all' : 'introduced');
  if (filesProvided && gateOn === 'introduced') {
    fail(
      EXIT.ENV_ERROR,
      '--gate-on introduced requires git diff evidence; --files skips git. Drop --files and use --base, or use --gate-on all.',
    );
  }
  let allChangedFiles = null;
  let changedTestFiles;
  let contextFiles = [];
  let contextTruncated = false;
  // Changed test artifacts the ledger has no criteria for (Gherkin features,
  // Robot suites, .http collections). They stay out of the review set, but
  // a reviewed-files manifest that simply omits them reads as though the diff
  // held nothing else, so they are disclosed and carry the --test-glob remedy.
  let unscorableTestArtifacts = [];
  let diffEvidence = new Map();
  try {
    if (filesProvided) {
      changedTestFiles = getChangedTestFiles({ files: options.files, projectRoot });
    } else {
      allChangedFiles = getChangedFiles({ base: options.base, projectRoot });
      changedTestFiles = allChangedFiles.filter((file) => isTestFile(file));
      diffEvidence = getDiffEvidence({ base: options.base, projectRoot, files: changedTestFiles });
      ({ files: contextFiles, truncated: contextTruncated } = getContextFiles(allChangedFiles));
      unscorableTestArtifacts = getUnscorableTestArtifacts(allChangedFiles);
    }
  } catch (error) {
    if (error.code === 'GIT_DIFF_FAILED' || error.code === 'BASE_UNRESOLVABLE') {
      fail(EXIT.ENV_ERROR, error.message);
    }
    throw error;
  }
  const contextBasis = contextBasisFor({ files: contextFiles, truncated: contextTruncated });
  const reviewProvenance = buildReviewProvenance({
    projectRoot,
    skillRoot,
    baseRef: options.base,
    filesProvided,
    modelIdentifier: resolvedModel,
    gateMode: gateOn,
  });

  // Files --test-glob forced in that no built-in rule recognizes. The CLI cannot
  // tell whether a registry row attached, so it names them to the agent rather
  // than letting a zero-violation run publish 100/Approve over an unread format.
  const forcedUnscorableCandidates = getForcedUnscorableCandidates(changedTestFiles);

  // Fail closed on hostile paths before they reach the prompt (or anywhere
  // else). Context paths travel in their own delimited block and get the same
  // treatment as the review set.
  try {
    assertSafePaths(changedTestFiles);
    assertSafePaths(contextFiles);
    assertSafePaths(unscorableTestArtifacts);
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
    // No `findings` key here, for the same reason there is no `violations` key: no
    // agent ran and no report exists, so an empty array would assert that a review
    // looked and found nothing. An absent field says nothing looked.
    const skipped = {
      skipped: true,
      reason: deletionsOnly ? 'only test deletions in diff; nothing to review' : 'no changed test files in diff',
      recommendation: null,
      qualityScore: null,
      files: [],
      contextBasis,
      contextFiles,
      gateOn,
      reviewProvenance,
    };
    // The worst case for a silent scope cap: a diff whose ONLY test change is a
    // Maestro flow or a .feature file skips with "no changed test files", which
    // reads as "this PR touched no tests" when it plainly did.
    if (unscorableTestArtifacts.length > 0) {
      skipped.unscorableTestArtifacts = unscorableTestArtifacts;
      skipped.reason = `${skipped.reason}; ${unscorableTestArtifacts.length} changed test artifact${unscorableTestArtifacts.length === 1 ? '' : 's'} in a format the ledger cannot score (use --test-glob to include)`;
    }
    if (deletionsOnly) {
      skipped.deletedFiles = deletedTestFiles;
      console.log('Only test deletions detected in the diff; nothing to review.');
    } else {
      console.log('No changed test files detected; skipping test review.');
    }
    for (const artifact of unscorableTestArtifacts) {
      console.error(`tea-test-review: changed test artifact not scorable by the ledger: ${artifact} (use --test-glob to include it)`);
    }
    const skippedPayload = assertDeclaredKeys(applyWaiver(skipped, skipFails), SKIP_KEYS, 'skip');
    console.log(JSON.stringify(skippedPayload, null, 2));
    if (jsonPath) {
      writeJsonFile(jsonPath, skippedPayload);
    }
    process.exit(skipFails && !waiver ? EXIT.VERDICT_FAIL : EXIT.PASS);
  }

  // step-02-discover-tests.md §2b's convention baseline, computed here instead of
  // left to the agent to sample: see cli/lib/convention-baseline.js's header
  // comment for why an agent-derived sampled fraction cannot be trusted. Computed
  // once and reused for both the printed prompt and (below) the parsed-report
  // cross-check, so the two can never see a different corpus.
  const conventionBaseline = computeConventionBaseline({ projectRoot, reviewFiles: changedTestFiles });

  // criteria-registry.md's row -> severity map, read from the skill itself so a
  // report's "**Row**: <id>" citations can be checked against real rows instead of
  // trusted. null on a skill root with no registry file (e.g. a bare test fixture);
  // parseReport treats that as "no grounding available" rather than failing closed.
  const registryRowSeverities = loadRegistryRowSeverities(skillRoot);

  if (options.agent === 'none') {
    const prompt = buildPrompt({
      skillRoot,
      files: changedTestFiles,
      outputPath,
      scope: options.scope,
      testDir: options.testDir,
      teaConfig,
      installedPackages,
      contextFiles,
      contextBasis,
      focus: options.focus,
      unscorableTestArtifacts,
      forcedUnscorableCandidates,
      conventionBaseline,
    });
    console.log(prompt);
    if (jsonPath) {
      writeJsonFile(jsonPath, {
        promptOnly: true,
        files: changedTestFiles,
        contextFiles,
        contextBasis,
        unscorableTestArtifacts,
        gateOn,
        reviewProvenance,
      });
    }
    // `process.exit` here truncated the prompt. `console.log` on a pipe is
    // asynchronous, and exiting discards whatever has not drained, so a caller
    // capturing this output received the first 8 KB and nothing said so. The
    // prompt is 15 KB, and the eval harness digests it to detect a prompt
    // change, so every change past the 8 KB mark was invisible to the digest.
    // Setting the code and returning lets the write finish.
    process.exitCode = EXIT.PASS;
    return;
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

  const copiedReportTemporaryPath = reportTemporaryPath(outputPath);
  const normalizedReportTemporaryPath = reportTemporaryPath(outputPath);
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

  // Under isolation the agent writes into a fresh tmpdir. Artifact processing
  // happens after withIsolation restores the project, so an atomic rename never
  // needs a project directory to be writable while the agent is running.
  if (isolationActive) {
    redirectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-test-review-'));
  }
  const agentOutputPath = redirectDir ? path.join(redirectDir, 'test-review.md') : outputPath;
  const prompt = buildPrompt({
    skillRoot,
    files: changedTestFiles,
    outputPath: agentOutputPath,
    scope: options.scope,
    testDir: options.testDir,
    teaConfig,
    installedPackages,
    contextFiles,
    contextBasis,
    focus: options.focus,
    unscorableTestArtifacts,
    forcedUnscorableCandidates,
    conventionBaseline,
  });

  const executeAgent = ({ agentCwd, spawnPrefix }) => {
    const stopHeartbeat = startHeartbeat();
    let agentResult;
    try {
      agentResult = runAgent(prompt, {
        agent: options.agent,
        agentCommand: options.agentCmd,
        agentArgs: options.agentArg,
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
      printMissingReportDiagnostics(agentResult);
      const error = new Error(
        `Agent finished but no fresh report was written to ${agentOutputPath}; refusing to parse a stale or missing report.`,
      );
      error.code = 'REPORT_MISSING';
      throw error;
    }
  };

  const processReport = () => {
    // The report is copied back even when the verdict fails or parsing fails;
    // on agent failure nothing was produced and nothing is copied.
    if (redirectDir) {
      copyReportArtifact(agentOutputPath, outputPath, copiedReportTemporaryPath);
    }

    const rawReport = fs.readFileSync(agentOutputPath, 'utf8');
    let parsed;
    try {
      parsed = parseReport(rawReport, {
        reviewedFiles: changedTestFiles,
        contextFiles,
        contextBasis,
        unscorableTestArtifacts,
        conventionBaseline,
        registryRowSeverities,
      });
    } catch (error) {
      if (error.code === 'REPORT_UNPARSEABLE') {
        const wrapped = new Error(`${error.message} (report: ${outputPath})`);
        wrapped.code = 'REPORT_UNPARSEABLE';
        throw wrapped;
      }
      throw error;
    }

    const normalizedReport = normalizeReportScore(rawReport, parsed);
    writeReportArtifact(outputPath, normalizedReportTemporaryPath, normalizedReport);
    if (parsed.reportedQualityScore !== undefined) {
      console.error(
        `tea-test-review: normalized agent Quality Score ${parsed.reportedQualityScore} to effective score ${parsed.qualityScore} ` +
          `(raw deduction score ${parsed.rawQualityScore}; cap ${parsed.scoreCap}).`,
      );
    }
    // Loudly, because it is the gate that moved. The agent's recommendation is a
    // free-text field; the one the gate acts on is now computed from the counts, so a
    // substitution here means the report would have let something through (or blocked
    // something) that its own findings do not support.
    if (parsed.reportedRecommendation !== undefined) {
      console.error(
        `tea-test-review: normalized agent Recommendation "${parsed.reportedRecommendation}" to "${parsed.recommendation}", ` +
          `required by ${parsed.violations.critical} Critical / ${parsed.violations.high} High / ` +
          `${parsed.violations.medium} Medium / ${parsed.violations.low} Low at score ${parsed.qualityScore}.`,
      );
    }
    const allFindingsRecommendation = parsed.recommendation;
    parsed.findings = applyFindingProvenance(parsed.findings, diffEvidence, gateOn);
    const advisoryFindings = parsed.findings.filter((finding) => !finding.verdict_impact);
    const gatingViolations = subtractCounts(parsed.violations, advisoryFindings);
    const gatingRawQualityScore = rawScoreForViolations(parsed.rawQualityScore, parsed.violations, gatingViolations);
    const { qualityScore: gatingQualityScore } = effectiveScoreFor(gatingRawQualityScore, gatingViolations);
    const gatingRecommendation = deriveRecommendation(gatingViolations, gatingQualityScore);
    const gatingVerdictRule = verdictRuleFor(gatingViolations, gatingQualityScore, advisoryFindings.length);
    if (gateOn === 'introduced') {
      parsed.recommendation = gatingRecommendation;
      parsed.verdictRule = gatingVerdictRule;
      const currentReport = fs.readFileSync(outputPath, 'utf8');
      writeReportArtifact(
        outputPath,
        normalizedReportTemporaryPath,
        appendDeltaAdvisory(currentReport, parsed.findings, gatingRecommendation, gatingQualityScore),
      );
    }
    const gated = { ...parsed, gatingQualityScore, gatingViolations };
    gateFailures = evaluateGates(gated);

    // The verdict JSON files manifest is the report's own Reviewed Files
    // section — what the agent actually reviewed — never the input list.
    // agent/model travel with it so a stored verdict says what produced it:
    // a score is only comparable against another score from the same reviewer.
    // parsed.findings rides along for the same reason: violations alone is four
    // severity counts, so a consumer that wants to know WHICH defects were found
    // had to re-parse the markdown report to learn it.
    const verdictPayload = {
      report: path.relative(projectRoot, outputPath),
      files: parsed.reviewedFiles,
      agent: options.agent,
      model: resolvedModel,
      gateOn,
      gatingQualityScore,
      gatingViolations,
      reviewProvenance,
      ...parsed,
    };
    if (allFindingsRecommendation !== gatingRecommendation) {
      verdictPayload.allFindingsRecommendation = allFindingsRecommendation;
    }
    // Also CLI-computed, so a consumer reading only the verdict learns that a
    // changed test artifact went unscored. parseReport separately refuses a
    // report that dropped any of these from its disclosure section.
    if (unscorableTestArtifacts.length > 0) {
      verdictPayload.unscorableTestArtifacts = unscorableTestArtifacts;
    }
    if (gateFailures.length > 0) {
      verdictPayload.gateFailures = gateFailures;
    }
    const finalPayload = assertDeclaredKeys(applyWaiver(verdictPayload, gateFailures.length > 0), VERDICT_KEYS, 'verdict');
    console.log(JSON.stringify(finalPayload, null, 2));

    if (jsonPath) {
      // No freshness check here, unlike the report: the CLI is the only writer of
      // the verdict JSON and writeJsonFile already fails closed on a write error,
      // so a stale verdict is not reachable. The pre-run rm still applies, so a
      // failed run leaves no previous verdict behind.
      writeJsonFile(jsonPath, finalPayload);
    }
  };

  const cleanupRunArtifacts = () => {
    for (const temporaryPath of [copiedReportTemporaryPath, normalizedReportTemporaryPath]) {
      try {
        fs.rmSync(temporaryPath, { force: true });
      } catch (error) {
        console.error(`tea-test-review WARNING: failed to remove temporary report ${temporaryPath}: ${error.message}`);
      }
    }
    if (redirectDir) {
      try {
        fs.rmSync(redirectDir, { recursive: true, force: true });
      } catch (error) {
        console.error(`tea-test-review WARNING: failed to remove temporary directory ${redirectDir}: ${error.message}`);
      }
      redirectDir = null;
    }
  };

  try {
    if (isolationActive) {
      withIsolation(projectRoot, [], executeAgent);
    } else {
      executeAgent({ agentCwd: projectRoot, spawnPrefix: [] });
    }
    processReport();
  } catch (error) {
    if (
      error.code === 'AGENT_FAILED' ||
      error.code === 'AGENT_NOT_FOUND' ||
      error.code === 'REPORT_MISSING' ||
      error.code === 'REPORT_UNPARSEABLE' ||
      error.code === 'REPORT_ARTIFACT'
    ) {
      cleanupRunArtifacts();
      fail(EXIT.AGENT_OR_PARSE_ERROR, error.message);
    }
    if (error.code === 'ISOLATION_ERROR') {
      cleanupRunArtifacts();
      fail(EXIT.ENV_ERROR, error.message);
    }
    throw error;
  } finally {
    cleanupRunArtifacts();
  }

  for (const failure of gateFailures) {
    console.error(failure);
  }
  process.exit(gateFailures.length > 0 && !waiver ? EXIT.VERDICT_FAIL : EXIT.PASS);
}

// Guarded so tools/generate-contracts.js can read VERDICT_KEYS without running a
// review; this file is only ever executed as the `tea-test-review` bin.
if (require.main === module) {
  try {
    main();
  } catch (error) {
    // Exit code 1 is reserved strictly for a failing review verdict; anything
    // unexpected reaching here is an agent/runner failure.
    fail(EXIT.AGENT_OR_PARSE_ERROR, error && error.message ? error.message : String(error));
  }
}

module.exports = { VERDICT_KEYS, SKIP_KEYS, DEFAULT_AGENT };
