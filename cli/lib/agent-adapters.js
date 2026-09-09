/**
 * Agent adapter table: how to invoke each supported headless CLI.
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
 * A built-in gemini adapter was drafted and partially probed (the real `-p`/
 * `--approval-mode yolo`/`--skip-trust` flag surface, and that --skip-trust
 * clears the headless trusted-folder gate) but dropped from this table: this
 * account's `gemini` CLI OAuth login is on a since-deprecated Code Assist
 * free tier (IneligibleTierError) and no GEMINI_API_KEY/GOOGLE_API_KEY was
 * available to fall back to, so it was never verified end-to-end with a
 * parseable report. Re-add once it can actually be run. Until then, Gemini and
 * other headless CLIs can use the custom adapter with an explicit executable
 * and argv. That path makes no vendor-specific claims and keeps its runner
 * contract visible at the call site.
 */

/**
 * What a runner may do to the filesystem, in the words test/evals/suite-manifest.json
 * declares per suite. The three are tiers: `command-execution` includes
 * `scoped-artifact-writes`, which includes `read-only`, because a runner that can
 * run a shell can write with it, so granting the shell and withholding the write
 * tools would be a declaration the argv does not honour.
 *
 * Each built-in adapter turns the strongest declared tier into its own vendor
 * argv below. `custom` and `agy` receive no capability argv at all: the custom
 * contract puts the tool policy on the caller's command line, and agy exposes
 * no flag that narrows its tool set. A harness that declares `read-only` for one
 * of those runners has to enforce it itself, which test/eval-fragment-selection.js
 * does by running in an empty scratch directory and failing any run that leaves
 * a file behind.
 */
const RUNNER_CAPABILITIES = ['read-only', 'scoped-artifact-writes', 'command-execution'];

/** What a caller gets when it declares nothing: the tier the review CLI has always run at. */
const DEFAULT_CAPABILITIES = ['scoped-artifact-writes'];

const WRITE_TOOLS = ['Write', 'Edit'];
const COMMAND_TOOLS = ['Bash'];
// Delegation, which claude spells `Task` on the command line and exposes to the
// model as `Agent`. step-03-quality-evaluation.md dispatches four quality workers
// and resolves its execution mode from a runtime capability probe, so without this
// the probe finds no launcher and every headless run collapses to `sequential` no
// matter what tea_execution_mode says.
//
// A launched subagent inherits this exact list, verified live against claude
// 2.1.266 under the argv below: the child reported `Agent, Edit, Glob, Grep, Read,
// Write` and no shell. So "the shell only under command-execution" holds at the four
// workers as well as at the parent, and granting delegation does not widen the tool
// surface by the back door.
//
// It is granted from `scoped-artifact-writes` upward, that being the first tier
// at which the workers' declared outputs can exist: each writes
// /tmp/tea-test-review-<dimension>-<timestamp>.json, and step-03 section 5 aborts
// the workflow when one of them is missing. A `read-only` runner cannot finish
// that step in any mode, so handing it a launcher would widen the tool surface
// while enabling nothing.
const DELEGATE_TOOLS = ['Task'];

/** The tier a capability list resolves to: the strongest one named. */
function strongestCapability(capabilities = DEFAULT_CAPABILITIES) {
  let strongest = 'read-only';
  for (const capability of capabilities) {
    if (RUNNER_CAPABILITIES.indexOf(capability) > RUNNER_CAPABILITIES.indexOf(strongest)) strongest = capability;
  }
  return strongest;
}

/** claude's `--tools` list for a capability tier; the default tier spells the list the CLI has always passed. */
function claudeTools(capabilities) {
  const tier = strongestCapability(capabilities);
  return [
    'Read',
    ...(tier === 'read-only' ? [] : WRITE_TOOLS),
    'Glob',
    'Grep',
    ...(tier === 'read-only' ? [] : DELEGATE_TOOLS),
    ...(tier === 'command-execution' ? COMMAND_TOOLS : []),
  ].join(',');
}

/**
 * codex's `--sandbox` mode for a capability tier. `workspace-write` grants
 * read, write, and exec inside cwd, so it is the mode for both upper tiers;
 * codex has no mode that writes without executing.
 */
function codexSandbox(capabilities) {
  return strongestCapability(capabilities) === 'read-only' ? 'read-only' : 'workspace-write';
}

/** The tool list the review CLI runs with, kept under its historical name for the callers that read it. */
const TOOLS = claudeTools(DEFAULT_CAPABILITIES);
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
    // --allowedTools scope the run to the tool surface the caller's declared
    // capabilities allow: search and read always, write and delegation only
    // above read-only, the shell only under command-execution. Both flags carry
    // the same list because --tools decides what exists and --allowedTools
    // decides what runs without a prompt; naming a tool in one and not the other
    // either hides it or stops the headless run to ask about it.
    //
    // claude 2.1.266 has no turn cap to pair with these. `--max-budget-usd`
    // is the nearest vendor bound and is reachable through the passthrough
    // (--agent-arg --max-budget-usd --agent-arg 2.00); it stays out of this
    // table for the same reason codex's reasoning effort does, since it is one
    // vendor's flag and the other adapters cannot honor it. The vendor-agnostic
    // bound is the wall-clock timeout in run-agent.js, which the CLI scales to
    // the size of the review set.
    buildArgv: (extra = [], model, capabilities = DEFAULT_CAPABILITIES) => [
      '-p',
      '--output-format',
      'text',
      '--tools',
      claudeTools(capabilities),
      '--allowedTools',
      claudeTools(capabilities),
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
    // TTY, because approval is only for escalating past the sandbox. A caller
    // declaring read-only gets --sandbox read-only instead, which is the
    // vendor's own enforcement of that tier.
    // --skip-git-repo-check matters under --isolate, where the agent's cwd
    // is a fresh tmpdir with no .git.
    //
    // No parallel-worker argv here, deliberately. `codex exec` exposes no
    // subagent launcher for step-03's four quality workers to run on, so the
    // prompt's tea_execution_mode=auto resolves through the capability probe to
    // sequential on this adapter, which is the same run codex did before. The
    // output contract, the aggregation, and the score are identical in either
    // mode (step-03: "Mode changes orchestration only"), so codex loses the
    // wall-clock gain and nothing else.
    //
    // Reasoning effort is deliberately not pinned here. It is a second
    // unstated input (a local model_reasoning_effort = "max" costs ~10s even
    // on a one-word prompt, measured 2026-08-03), but it is codex-only, so
    // pinning it in this vendor-agnostic table would give the flag a meaning
    // no other adapter can honor. Set it per run with
    // --agent-arg -c --agent-arg model_reasoning_effort=low.
    buildArgv: (extra = [], model, capabilities = DEFAULT_CAPABILITIES) => [
      'exec',
      '--skip-git-repo-check',
      '--sandbox',
      codexSandbox(capabilities),
      '--color',
      'never',
      ...modelArgv(AGENT_ADAPTERS.codex.modelFlags, model, extra),
      ...extra,
    ],
    envNames: ['OPENAI_API_KEY'],
  },
  custom: {
    command: null,
    defaultModel: null,
    modelFlags: [],
    // The custom runner contract is intentionally small: read the complete
    // prompt from stdin, operate in cwd, write any requested artifact named in
    // the prompt, print the final response to stdout, and exit nonzero on
    // failure. Every argv value is supplied explicitly with --agent-arg, so a
    // declared capability adds nothing here; see RUNNER_CAPABILITIES.
    buildArgv: (extra = []) => [...extra],
    envNames: [],
  },
  agy: {
    command: 'agy',
    defaultModel: null,
    modelFlags: ['--model'],
    promptViaArgv: true,
    // agy reads its prompt from the --print argument on argv.
    buildArgv: (extra = [], model) => [
      '--print',
      '__PROMPT__',
      '--output-format',
      'text',
      '--dangerously-skip-permissions',
      ...modelArgv(AGENT_ADAPTERS.agy.modelFlags, model, extra),
      ...extra,
    ],
    envNames: [],
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
  if (adapter.modelFlags.length === 0) {
    if (model !== undefined && model !== null) {
      throw modelArgumentError(
        'MODEL_UNSUPPORTED',
        `--model is not supported by the ${agent} adapter; pass the runner's model flag with --agent-arg.`,
      );
    }
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

module.exports = {
  AGENT_ADAPTERS,
  DEFAULT_CAPABILITIES,
  RUNNER_CAPABILITIES,
  TOOLS,
  claudeTools,
  codexSandbox,
  resolveModel,
  modelFromArgs,
  strongestCapability,
  validateModelValue,
};
