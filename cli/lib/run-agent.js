/**
 * Spawn the review agent CLI through a built-in adapter or the custom runner
 * contract. This is one of two subprocesses the
 * CLI launches; the other is `git diff` in changed-tests.js. Never exercised
 * live by unit tests (a stub agent is used instead); see the TEA documentation's
 * tea-test-review CLI reference
 * (https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/reference/tea-test-review-cli/)
 * for how each real vendor was verified.
 *
 * Hardening notes:
 * - claude, codex, and custom receive the prompt on STDIN via spawnSync `input`.
 *   Adapters with promptViaArgv, currently agy, place it in argv because their
 *   CLI does not accept stdin. That transport can expose the prompt to local
 *   process inspection and must be documented per adapter.
 * - The child receives a minimal environment (PATH, HOME, locale, proxy, and
 *   the selected adapter's vendor variables only) plus names explicitly
 *   allowed with --env-pass.
 * - The agent runs in its own process group under agent-supervisor.js. A
 *   timeout sends the group SIGTERM and the agent SIGKILL after a grace
 *   period; the group is also stopped when the runner or the supervisor dies,
 *   and killed when the agent exits, so no process left in the group outlives
 *   the turn. The agent's stdin, stdout and stderr are pipes the supervisor's
 *   group leader owns and copies, so a process the agent leaves outside its
 *   group (in a new session, say) cannot hold this runner's pipes open. On
 *   Windows, which has no process groups, the timeout and the signals reach
 *   the agent alone.
 * - options.spawnPrefix wraps the agent command for filesystem isolation
 *   (sandbox-exec/bwrap from isolate.js); with the chmod fallback it is empty.
 * - Each adapter's argv is responsible for scoping tool access and approval
 *   behavior for its own vendor (see agent-adapters.js). The caller's declared
 *   capabilities decide how wide that scope is; the default is the review CLI's.
 */

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { AGENT_ADAPTERS, DEFAULT_CAPABILITIES, RUNNER_CAPABILITIES, resolveModel } = require('./agent-adapters');

const STDERR_TAIL_LINES = 20;
const DEFAULT_TIMEOUT_MS = 1_800_000; // 30 minutes
const SUPERVISOR = path.join(__dirname, 'agent-supervisor.js');

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
 * How the supervised agent ended, from the report on file descriptor 3:
 * `{ status, signal }` (with `stoppedBy` when a stopping signal asked the
 * agent's group to stop), `{ timedOut }`, `{ spawnError }`, or `{ failure }`.
 * Output past `maxBuffer`, a supervisor that could not start, and one that
 * ended with no report behind it are failures of the supervisor.
 */
function supervisedOutcome(result) {
  if (result.error) return { failure: result.error.message };
  try {
    const report = JSON.parse(result.output?.[3] ?? '');
    if (report !== null && typeof report === 'object') return report;
  } catch {
    // Fall through: no report.
  }
  const ending = result.signal ? `was killed by signal ${result.signal}` : `exited with code ${result.status}`;
  return { failure: `the agent supervisor ${ending} without reporting how the agent ended` };
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
 * @param {number} [options.timeout] - Wall-clock timeout in ms (default 1800000); on expiry the agent's
 *   process group receives SIGTERM, and the agent SIGKILL after the supervisor's grace period.
 * @param {string} [options.cwd] - Working directory for the agent.
 * @param {string[]} [options.envPass] - Extra env var names allowed through to the child.
 * @param {string[]} [options.spawnPrefix] - Isolation wrapper (e.g. sandbox-exec -f profile).
 * @param {string[]} [options.capabilities] - What the run may do to the filesystem, in the
 *   suite manifest's words (RUNNER_CAPABILITIES in agent-adapters.js). The built-in adapters
 *   turn the strongest one into vendor argv; the default is the tier the review CLI has
 *   always run at, so a caller that declares nothing gets the same run as before.
 * @returns {{ stdout: string, stderr: string }} Captured output from a successful agent run.
 * @throws {Error} AGENT_NOT_FOUND when the executable is missing, AGENT_FAILED
 *   on spawn error, timeout, or non-zero exit, CAPABILITY_UNKNOWN when a declared
 *   capability is not one the manifest vocabulary names.
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
    capabilities = DEFAULT_CAPABILITIES,
  } = {},
) {
  const adapter = AGENT_ADAPTERS[agent];
  if (!adapter) {
    const error = new Error(`Unknown agent "${agent}"; expected one of ${Object.keys(AGENT_ADAPTERS).join(', ')}.`);
    error.code = 'AGENT_UNKNOWN';
    throw error;
  }
  if (
    !Array.isArray(capabilities) ||
    capabilities.length === 0 ||
    capabilities.some((capability) => !RUNNER_CAPABILITIES.includes(capability))
  ) {
    const error = new Error(
      `runner capabilities must be a non-empty list drawn from ${RUNNER_CAPABILITIES.join(', ')}; got ${JSON.stringify(capabilities)}.`,
    );
    error.code = 'CAPABILITY_UNKNOWN';
    throw error;
  }
  const resolvedCommand = agentCommand || adapter.command;
  if (!resolvedCommand) {
    const error = new Error(`agent "${agent}" requires an explicit --agent-cmd executable.`);
    error.code = 'AGENT_COMMAND_REQUIRED';
    throw error;
  }
  let agentArgv = adapter.buildArgv(agentArgs, resolveModel(agent, model, agentArgs), capabilities);
  let input = prompt;
  if (adapter.promptViaArgv) {
    agentArgv = agentArgv.map((arg) => (arg === '__PROMPT__' ? prompt : arg));
    input = undefined;
  }
  const isolated = spawnPrefix.length > 0;
  const command = isolated ? spawnPrefix[0] : resolvedCommand;
  const args = isolated ? [...spawnPrefix.slice(1), resolvedCommand, ...agentArgv] : agentArgv;

  // The agent runs in its own process group under the supervisor, which stops
  // the group on the wall clock, on a signal, when the runner or the
  // supervisor dies, and when the agent exits; the report on file descriptor 3
  // says how the agent ended. spawnSync returns once every copy of these pipes
  // is closed, and only the supervisor and its group leader hold them.
  // spawnSync gets no timeout of its own: its timer counts time the runner
  // spends suspended (Ctrl-Z), and on expiry it closes the pipes before reading
  // what they hold, the agent's reply included. The group leader owns the wall
  // clock, and the supervisor the backstop past it.
  const result = spawnSync(process.execPath, [SUPERVISOR, String(process.pid), String(timeout), command, ...args], {
    cwd,
    encoding: 'utf8',
    input,
    env: buildMinimalEnv(envPass, process.env, adapter.envNames),
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
    // Output past maxBuffer ends the supervisor at once; its end closes the lifeline, and the group leader stops the agent.
    killSignal: 'SIGKILL',
  });
  const outcome = supervisedOutcome(result);

  if (outcome.spawnError) {
    if (outcome.spawnError.code === 'ENOENT') {
      const error = new Error(`agent executable not found: ${command}`);
      error.code = 'AGENT_NOT_FOUND';
      throw error;
    }
    const error = new Error(`Agent "${command}" failed: ${outcome.spawnError.message}`);
    error.code = 'AGENT_FAILED';
    throw error;
  }
  if (outcome.timedOut) {
    const error = new Error(`Agent "${command}" failed: timed out after ${timeout}ms (SIGTERM sent)`);
    error.code = 'AGENT_FAILED';
    throw error;
  }
  if (outcome.failure) {
    const error = new Error(`Agent "${command}" failed: ${outcome.failure}`);
    error.code = 'AGENT_FAILED';
    throw error;
  }

  if (outcome.status !== 0) {
    const stderrTail = (result.stderr || '').trim().split('\n').slice(-STDERR_TAIL_LINES).join('\n');
    if (stderrTail) {
      console.error(`Agent stderr (last ${STDERR_TAIL_LINES} lines):\n${stderrTail}`);
    }
    // A signal-killed child (OOM, an external kill, anything outside the
    // ETIMEDOUT case already handled above) reports status as null; naming
    // the signal beats a bare "exited with code null".
    const ending = outcome.signal ? `was killed by signal ${outcome.signal}` : `exited with code ${outcome.status}`;
    // A stop the agent outlived ends in the grace period's SIGKILL; the report names the signal that asked for it.
    let stopped = '';
    if (typeof outcome.stoppedBy === 'string' && outcome.stoppedBy !== outcome.signal) {
      stopped =
        outcome.signal === 'SIGKILL'
          ? ` once it outlived the grace period after a ${outcome.stoppedBy} to its process group`
          : ` after a ${outcome.stoppedBy} to its process group`;
    }
    const error = new Error(`Agent "${command}" ${ending}${stopped}.`);
    error.code = 'AGENT_FAILED';
    throw error;
  }

  return { stdout: result.stdout || '', stderr: result.stderr || '' };
}

module.exports = { runAgent, buildMinimalEnv };
