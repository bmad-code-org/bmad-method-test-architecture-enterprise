/**
 * Per-vendor agent adapter table: how to invoke each supported headless CLI.
 *
 * Each adapter supplies the default executable, the argv the CLI needs for a
 * non-interactive run with file read/write access to the working directory,
 * and the vendor-specific env var names to layer on top of run-agent.js's
 * BASE_ENV_NAMES (PATH/HOME/USER/LOGNAME/locale/proxy). HOME is already in
 * the base set and covers every vendor here: claude and codex both store
 * OAuth/subscription credentials under files keyed by HOME, so the envNames
 * below are only the API-key fallbacks a user may set instead.
 *
 * claude argv verified live against claude CLI 2.1.220, codex argv against
 * codex-cli 0.146.0 (both 2026-08-03, same review target: a real Playwright
 * spec, not a stub) — see docs/reference/tea-test-review-cli.md for what
 * "verified" means per vendor.
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

const AGENT_ADAPTERS = {
  claude: {
    command: 'claude',
    // --safe-mode strips repo customizations for the review run; --tools/
    // --allowedTools scope the run to the same read/write/search surface
    // every adapter gets.
    buildArgv: (extra) => ['-p', '--output-format', 'text', '--tools', TOOLS, '--allowedTools', TOOLS, '--safe-mode', ...extra],
    envNames: ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_OAUTH_TOKEN'],
  },
  codex: {
    command: 'codex',
    // `codex exec` reads the prompt from stdin when no PROMPT arg is given.
    // --sandbox workspace-write grants read/write/exec inside cwd without
    // needing --dangerously-bypass-approvals-and-sandbox: verified live that
    // a workspace-write file write completes with no approval prompt and no
    // TTY, because approval is only for escalating past the sandbox.
    // --skip-git-repo-check matters under --isolate, where the agent's cwd
    // is a fresh tmpdir with no .git.
    buildArgv: (extra) => ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '--color', 'never', ...extra],
    envNames: ['OPENAI_API_KEY'],
  },
};

module.exports = { AGENT_ADAPTERS, TOOLS };
