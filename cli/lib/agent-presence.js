/**
 * Refuse a review whose agent CLI cannot run, before the run is paid for.
 *
 * Installing and logging in an agent is the caller's job (a CI step, a developer's shell). This
 * module only notices that it did not happen and says how to fix it, so a missing CLI is an
 * environment error (exit 2) with an install command instead of an agent failure (exit 3) that a
 * retry would repeat.
 *
 * Two checks, in order:
 * 1. The executable is on the PATH the agent will run with (or the path --agent-cmd names).
 * 2. For a vendor CLI the adapter names itself, the vendor's own login status command succeeds.
 *    A command the caller overrides with --agent-cmd is not the vendor CLI, so it is not asked.
 *
 * Only a definitive "not logged in" (a non-zero exit from the status command) refuses the run. A
 * status command that cannot run, times out, or does not exist in an older vendor CLI proves
 * nothing, and refusing on it would block a run that would have worked.
 */

const { spawnSync } = require('node:child_process');

const { AGENT_ADAPTERS } = require('./agent-adapters');
const { buildMinimalEnv, executableFound } = require('./run-agent');

const STATUS_TIMEOUT_MS = 15_000;

/** Per-agent data the adapter table does not carry: how to install the CLI and how to ask whether it is logged in. */
const AGENT_SETUP = {
  claude: {
    install: 'npm install -g @anthropic-ai/claude-code',
    statusArgv: ['auth', 'status'],
    login: 'run `claude auth login`, or set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN (from `claude setup-token`)',
  },
  codex: {
    install: 'npm install -g @openai/codex',
    statusArgv: ['login', 'status'],
    login: 'run `codex login`, or in CI `printenv OPENAI_API_KEY | codex login --with-api-key`',
  },
  agy: {
    install: 'install the agy CLI and put it on PATH',
    statusArgv: null,
    login: null,
  },
};

function unavailable(message) {
  const error = new Error(message);
  error.code = 'AGENT_UNAVAILABLE';
  return error;
}

/**
 * @param {object} options
 * @param {string} options.agent - Adapter name.
 * @param {string} [options.agentCommand] - --agent-cmd override.
 * @param {string[]} [options.envPass] - Variables allowed through to the agent.
 * @param {string} [options.cwd] - Directory a relative command resolves against.
 * @param {object} [options.sourceEnv] - Environment the agent's own is built from.
 * @throws {Error} With code AGENT_UNAVAILABLE when the CLI is missing or logged out.
 */
function assertAgentReady({ agent, agentCommand, envPass = [], cwd = process.cwd(), sourceEnv = process.env }) {
  const adapter = AGENT_ADAPTERS[agent];
  const command = agentCommand || adapter?.command;
  if (!adapter || !command) {
    return;
  }
  const env = buildMinimalEnv(envPass, sourceEnv, adapter.envNames);
  const setup = AGENT_SETUP[agent];
  if (!executableFound(command, env.PATH, cwd)) {
    const remedy = agentCommand ? `Check --agent-cmd ${agentCommand}.` : setup ? `Install it with: ${setup.install}` : '';
    throw unavailable(`agent executable not found: ${command}. ${remedy}`.trim());
  }
  if (agentCommand || !setup?.statusArgv) {
    return;
  }
  const status = spawnSync(command, setup.statusArgv, {
    env,
    cwd,
    encoding: 'utf8',
    timeout: STATUS_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (status.error || status.signal || status.status === null || status.status === 0) {
    return;
  }
  throw unavailable(
    `agent "${agent}" is installed but not logged in (\`${command} ${setup.statusArgv.join(' ')}\` exited ${status.status}). To fix: ${setup.login}.`,
  );
}

module.exports = { assertAgentReady, AGENT_SETUP };
