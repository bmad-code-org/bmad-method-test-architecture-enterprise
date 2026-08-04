/**
 * Per-vendor agent adapter table: how to invoke each supported headless CLI.
 *
 * Each adapter supplies the default executable, the argv the CLI needs for a
 * non-interactive run with file read/write access to the working directory,
 * and the vendor-specific env var names to layer on top of run-agent.js's
 * BASE_ENV_NAMES (PATH/HOME/USER/LOGNAME/locale/proxy). HOME is already in the
 * base set, and both vendors store subscription credentials in files keyed by
 * it, which is what a developer machine normally uses.
 *
 * The envNames below are NOT a uniform API-key fallback. claude reads
 * ANTHROPIC_API_KEY / CLAUDE_CODE_OAUTH_TOKEN from the environment; codex
 * 0.146.0 does not read OPENAI_API_KEY at all and authenticates only from
 * ~/.codex/auth.json. Verified 2026-08-03 with HOME pointed at an empty
 * directory: with only the variable set, the request carries no credential
 * ("Missing bearer or basic authentication in header"); after
 * `printenv OPENAI_API_KEY | codex login --with-api-key` the same request
 * fails as "Incorrect API key provided", which proves the key is now sent.
 * OPENAI_API_KEY stays listed because the login step consumes it, and because
 * a future codex may read it directly. A caller with no auth.json — every CI
 * runner — must run that login before invoking this adapter.
 *
 * claude argv verified live against claude CLI 2.1.220, codex argv against
 * codex-cli 0.146.0 (both 2026-08-03, same review target: a real Playwright
 * spec, not a stub) — see docs/reference/tea-test-review-cli.md for what
 * "verified" means per vendor.
 *
 * Each adapter also pins a defaultModel. Left unpinned, the model is whatever
 * the vendor CLI resolves from its own config — ~/.codex/config.toml or
 * ~/.claude/settings.json on a developer machine, and the vendor's built-in
 * default on a CI runner, which has neither file. That makes the model an
 * unstated input to a scored gate: cost, latency, and the verdict itself move
 * when a developer edits a dotfile or a vendor ships a new default. Pinning
 * here makes the local run and the CI run the same run. --model overrides it.
 *
 * The pinned values are aliases, not immutable snapshots: "sonnet" follows
 * Anthropic's current Sonnet and "gpt-5.6-sol" is a family slug. They hold the
 * tier steady, not the exact weights. Pass a fully-qualified slug to --model
 * when a run has to be reproducible across model generations.
 *
 * A gemini adapter was drafted and partially probed (the real `-p`/
 * `--approval-mode yolo`/`--skip-trust` flag surface, and that --skip-trust
 * clears the headless trusted-folder gate) but dropped from this table: this
 * account's `gemini` CLI OAuth login is on a since-deprecated Code Assist
 * free tier (IneligibleTierError) and no GEMINI_API_KEY/GOOGLE_API_KEY was
 * available to fall back to, so it was never verified end-to-end with a
 * parseable report. Re-add once it can actually be run, not before.
 */

const TOOLS = 'Read,Write,Edit,Glob,Grep';
const MODEL_VALUE_PATTERN = /^[\w.:[\]/-]+$/;

function modelArgumentError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * Validate a model value before it reaches a vendor argv.
 *
 * @param {string} value - Candidate model slug.
 * @param {string} source - User-facing source label for errors.
 * @returns {string} The validated value.
 */
function validateModelValue(value, source) {
  if (!value || !MODEL_VALUE_PATTERN.test(value) || value.startsWith('-')) {
    throw modelArgumentError(
      'MODEL_ARG_INVALID',
      `${source} must be a bare model name (letters, digits, and . _ - : / [ ]) and may not start with "-"; got ${JSON.stringify(value)}.`,
    );
  }
  return value;
}

/**
 * Extract the single model selected through passthrough argv.
 *
 * Both separated and equals forms are supported. Multiple declarations are
 * rejected because their precedence differs by vendor and codex rejects a
 * repeated model flag outright.
 *
 * @param {string[]} flags - Every spelling that sets the model for this vendor.
 * @param {string[]} extra - Passthrough argv.
 * @returns {string|null} The selected model, or null when absent.
 */
function modelFromArgs(flags, extra = []) {
  const declared = [];
  for (let index = 0; index < extra.length; index++) {
    const arg = extra[index];
    for (const flag of flags) {
      if (arg === flag) {
        declared.push(validateModelValue(extra[index + 1], `${flag} passthrough value`));
        break;
      }
      if (arg.startsWith(`${flag}=`)) {
        declared.push(validateModelValue(arg.slice(flag.length + 1), `${flag} passthrough value`));
        break;
      }
    }
  }
  if (declared.length > 1) {
    throw modelArgumentError(
      'MODEL_ARG_CONFLICT',
      `Passthrough argv declares the model ${declared.length} times; provide exactly one model source.`,
    );
  }
  return declared[0] ?? null;
}

/**
 * Model argv for an adapter, suppressed when the --agent-arg passthrough
 * already sets the model itself.
 *
 * The suppression is not politeness, it is required for codex: clap rejects a
 * repeated --model outright ("the argument '--model <MODEL>' cannot be used
 * multiple times", verified against codex-cli 0.146.0), so emitting the pinned
 * default alongside a passthrough -m would turn every such run into a usage
 * error. claude 2.1.220 takes the last occurrence instead, but both vendors go
 * through this same path so the passthrough behaves identically either way.
 *
 * @param {string[]} flags - Every spelling that sets the model for this vendor.
 * @param {string} [model] - Resolved model, or falsy to emit nothing.
 * @param {string[]} extra - The passthrough argv, scanned for those spellings.
 * @returns {string[]}
 */
function modelArgv(flags, model, extra) {
  if (!model) {
    return [];
  }
  const alreadySet = extra.some((arg) => flags.some((flag) => arg === flag || arg.startsWith(`${flag}=`)));
  return alreadySet ? [] : [flags[0], model];
}

const AGENT_ADAPTERS = {
  claude: {
    command: 'claude',
    defaultModel: 'sonnet',
    modelFlags: ['--model'],
    // --safe-mode strips repo customizations for the review run; --tools/
    // --allowedTools scope the run to the same read/write/search surface
    // every adapter gets.
    buildArgv: (extra = [], model) => [
      '-p',
      '--output-format',
      'text',
      '--tools',
      TOOLS,
      '--allowedTools',
      TOOLS,
      '--safe-mode',
      ...modelArgv(AGENT_ADAPTERS.claude.modelFlags, model, extra),
      ...extra,
    ],
    envNames: ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_OAUTH_TOKEN'],
  },
  codex: {
    command: 'codex',
    defaultModel: 'gpt-5.6-sol',
    modelFlags: ['-m', '--model'],
    // `codex exec` reads the prompt from stdin when no PROMPT arg is given.
    // --sandbox workspace-write grants read/write/exec inside cwd without
    // needing --dangerously-bypass-approvals-and-sandbox: verified live that
    // a workspace-write file write completes with no approval prompt and no
    // TTY, because approval is only for escalating past the sandbox.
    // --skip-git-repo-check matters under --isolate, where the agent's cwd
    // is a fresh tmpdir with no .git.
    //
    // Reasoning effort is deliberately not pinned here. It is a second
    // unstated input (a local model_reasoning_effort = "max" costs ~10s even
    // on a one-word prompt, measured 2026-08-03), but it is codex-only, so
    // pinning it in this vendor-agnostic table would give the flag a meaning
    // no other adapter can honor. Set it per run with
    // --agent-arg -c --agent-arg model_reasoning_effort=low.
    buildArgv: (extra = [], model) => [
      'exec',
      '--skip-git-repo-check',
      '--sandbox',
      'workspace-write',
      '--color',
      'never',
      ...modelArgv(AGENT_ADAPTERS.codex.modelFlags, model, extra),
      ...extra,
    ],
    envNames: ['OPENAI_API_KEY'],
  },
};

/**
 * The model a run will actually use: one passthrough declaration, the explicit
 * --model value, or the adapter's pinned default in that precedence order.
 *
 * @param {string} agent - Adapter key.
 * @param {string} [model] - Explicit --model value.
 * @param {string[]} [extra] - Vendor passthrough argv that may declare a model.
 * @returns {string|null} Resolved model, or null for an unknown adapter.
 */
function resolveModel(agent, model, extra = []) {
  const adapter = AGENT_ADAPTERS[agent];
  if (!adapter) {
    return null;
  }
  const hasExplicitModel = model !== undefined && model !== null;
  const passthroughModel = modelFromArgs(adapter.modelFlags, extra);
  if (hasExplicitModel && passthroughModel) {
    throw modelArgumentError(
      'MODEL_ARG_CONFLICT',
      `Model is set by both --model (${JSON.stringify(model)}) and passthrough argv (${JSON.stringify(
        passthroughModel,
      )}); provide exactly one model source.`,
    );
  }
  return passthroughModel || (hasExplicitModel ? validateModelValue(model, '--model') : adapter.defaultModel);
}

module.exports = { AGENT_ADAPTERS, TOOLS, resolveModel, modelFromArgs, validateModelValue };
