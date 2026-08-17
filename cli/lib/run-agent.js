/**
 * Spawn the review agent CLI through a built-in adapter or the custom runner
 * contract. This is one of two subprocesses the
 * CLI launches; the other is `git diff` in changed-tests.js. Never exercised
 * live by unit tests (a stub agent is used instead) — see
 * docs/reference/tea-test-review-cli.md for how each real vendor was verified.
 *
 * Hardening notes:
 * - claude, codex, and custom receive the prompt on STDIN via spawnSync `input`.
 *   Adapters with promptViaArgv, currently agy, place it in argv because their
 *   CLI does not accept stdin. That transport can expose the prompt to local
 *   process inspection and must be documented per adapter.
 * - The child receives a minimal environment (PATH, HOME, locale, proxy, and
 *   the selected adapter's vendor variables only) plus names explicitly
 *   allowed with --env-pass.
 * - options.spawnPrefix wraps the agent command for filesystem isolation
 *   (sandbox-exec/bwrap from isolate.js); with the chmod fallback it is empty.
 * - Each adapter's argv is responsible for scoping tool access and approval
 *   behavior for its own vendor (see agent-adapters.js).
 */

const { spawnSync } = require('node:child_process');
const { AGENT_ADAPTERS, resolveModel } = require('./agent-adapters');

const STDERR_TAIL_LINES = 20;
const DEFAULT_TIMEOUT_MS = 1_800_000; // 30 minutes

// USER is load-bearing, not cosmetic: without it claude/codex cannot read
// their stored credentials (subscription/keychain/OAuth, all keyed by
// HOME) and fail with a "not logged in" agent error. LOGNAME travels with it
// by convention. Each adapter's own envNames (agent-adapters.js) layer the
// vendor-specific API-key fallback on top of this shared base.
const BASE_ENV_NAMES = ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY'];

/**
 * Build the minimal child environment: the base names plus any adapter and
 * --env-pass names, each included only when actually set in the parent.
 *
 * @param {string[]} envPass - Extra variable names allowed through.
 * @param {object} [sourceEnv] - Environment to read from (tests inject here).
 * @param {string[]} [adapterEnvNames] - Vendor-specific names from the selected adapter.
 * @returns {object}
 */
function buildMinimalEnv(envPass = [], sourceEnv = process.env, adapterEnvNames = []) {
  const env = {};
  for (const name of [...BASE_ENV_NAMES, ...adapterEnvNames, ...envPass]) {
    if (sourceEnv[name] !== undefined) {
      env[name] = sourceEnv[name];
    }
  }
  return env;
}

/**
 * Run the agent with the prompt on stdin, capturing stdout/stderr.
 *
 * @param {string} prompt - Headless prompt bundle from build-prompt.
 * @param {object} [options]
 * @param {string} [options.agent] - Adapter key from agent-adapters.js (default claude).
 * @param {string} [options.agentCommand] - Executable override (--agent-cmd); replaces only the
 *   adapter's default command, not its argv/env.
 * @param {string[]} [options.agentArgs] - Extra args appended after the adapter's own argv (--agent-arg passthrough).
 * @param {string} [options.model] - Model to pin for this run; defaults to the adapter's defaultModel.
 * @param {number} [options.timeout] - Wall-clock timeout in ms (default 1800000); SIGTERM on expiry.
 * @param {string} [options.cwd] - Working directory for the agent.
 * @param {string[]} [options.envPass] - Extra env var names allowed through to the child.
 * @param {string[]} [options.spawnPrefix] - Isolation wrapper (e.g. sandbox-exec -f profile).
 * @returns {{ stdout: string, stderr: string }} Captured output from a successful agent run.
 * @throws {Error} AGENT_NOT_FOUND when the executable is missing, AGENT_FAILED
 *   on spawn error, timeout, or non-zero exit.
 */
function runAgent(
  prompt,
  {
    agent = 'claude',
    agentCommand,
    agentArgs = [],
    model,
    timeout = DEFAULT_TIMEOUT_MS,
    cwd = process.cwd(),
    envPass = [],
    spawnPrefix = [],
  } = {},
) {
  const adapter = AGENT_ADAPTERS[agent];
  if (!adapter) {
    const error = new Error(`Unknown agent "${agent}"; expected one of ${Object.keys(AGENT_ADAPTERS).join(', ')}.`);
    error.code = 'AGENT_UNKNOWN';
    throw error;
  }
  const resolvedCommand = agentCommand || adapter.command;
  if (!resolvedCommand) {
    const error = new Error(`agent "${agent}" requires an explicit --agent-cmd executable.`);
    error.code = 'AGENT_COMMAND_REQUIRED';
    throw error;
  }
  let agentArgv = adapter.buildArgv(agentArgs, resolveModel(agent, model, agentArgs));
  let input = prompt;
  if (adapter.promptViaArgv) {
    agentArgv = agentArgv.map((arg) => (arg === '__PROMPT__' ? prompt : arg));
    input = undefined;
  }
  const isolated = spawnPrefix.length > 0;
  const command = isolated ? spawnPrefix[0] : resolvedCommand;
  const args = isolated ? [...spawnPrefix.slice(1), resolvedCommand, ...agentArgv] : agentArgv;

  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    input,
    env: buildMinimalEnv(envPass, process.env, adapter.envNames),
    maxBuffer: 64 * 1024 * 1024,
    timeout,
    killSignal: 'SIGTERM',
  });

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      const error = new Error(`agent executable not found: ${command}`);
      error.code = 'AGENT_NOT_FOUND';
      throw error;
    }
    const detail = result.error.code === 'ETIMEDOUT' ? `timed out after ${timeout}ms (SIGTERM sent)` : result.error.message;
    const error = new Error(`Agent "${command}" failed: ${detail}`);
    error.code = 'AGENT_FAILED';
    throw error;
  }

  if (result.status !== 0) {
    const stderrTail = (result.stderr || '').trim().split('\n').slice(-STDERR_TAIL_LINES).join('\n');
    if (stderrTail) {
      console.error(`Agent stderr (last ${STDERR_TAIL_LINES} lines):\n${stderrTail}`);
    }
    // A signal-killed child (OOM, an external kill, anything outside the
    // ETIMEDOUT case already handled above) reports status as null; naming
    // the signal beats a bare "exited with code null".
    const outcome = result.signal ? `was killed by signal ${result.signal}` : `exited with code ${result.status}`;
    const error = new Error(`Agent "${command}" ${outcome}.`);
    error.code = 'AGENT_FAILED';
    throw error;
  }

  return { stdout: result.stdout || '', stderr: result.stderr || '' };
}

module.exports = { runAgent, buildMinimalEnv };
