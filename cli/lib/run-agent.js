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
const { spawn, spawnSync } = require('node:child_process');
const { AGENT_ADAPTERS, DEFAULT_CAPABILITIES, RUNNER_CAPABILITIES, bridgedArgsRefused, resolveModel } = require('./agent-adapters');

const STDERR_TAIL_LINES = 20;
const DEFAULT_TIMEOUT_MS = 1_800_000; // 30 minutes
/** The most either output stream may carry before the run is ended as a failure. */
const MAX_BUFFER = 64 * 1024 * 1024;
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
 * Everything a supervised agent run needs before it starts: the adapter's
 * command and argv, the prompt as input (or on argv, for an adapter that
 * reads it there), the minimal environment, and the supervisor's argv.
 *
 * With `options.bridge` the adapter's bridged argv replaces its capability
 * argv: the agent then runs with no built-in tool and reaches the world only
 * through that one MCP server (`tea-evaluate`'s sealed-brief evaluator,
 * AD-21). An adapter with no bridged argv refuses it.
 *
 * @returns {{ command: string, supervisorArgs: string[], input: string|undefined, env: object, cwd: string, timeout: number }}
 * @throws {Error} AGENT_UNKNOWN, CAPABILITY_UNKNOWN, AGENT_COMMAND_REQUIRED, AGENT_BRIDGE_UNSUPPORTED
 */
function agentInvocation(
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
    bridge,
    sourceEnv = process.env,
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
  if (bridge !== undefined && typeof adapter.buildBridgedArgv !== 'function') {
    const error = new Error(`agent "${agent}" has no bridged run, one whose only tools are an MCP bridge's.`);
    error.code = 'AGENT_BRIDGE_UNSUPPORTED';
    throw error;
  }
  const locked = bridge === undefined ? [] : bridgedArgsRefused(agent, agentArgs);
  if (locked.length > 0) {
    const error = new Error(`agent "${agent}" cannot take ${locked.join(', ')} in a bridged run: the bridge is its only tool.`);
    error.code = 'AGENT_BRIDGE_LOCKED';
    throw error;
  }
  const resolvedCommand = agentCommand || adapter.command;
  if (!resolvedCommand) {
    const error = new Error(`agent "${agent}" requires an explicit --agent-cmd executable.`);
    error.code = 'AGENT_COMMAND_REQUIRED';
    throw error;
  }
  const resolvedModel = resolveModel(agent, model, agentArgs);
  let agentArgv =
    bridge === undefined
      ? adapter.buildArgv(agentArgs, resolvedModel, capabilities)
      : adapter.buildBridgedArgv(agentArgs, resolvedModel, bridge);
  let input = prompt;
  if (adapter.promptViaArgv) {
    agentArgv = agentArgv.map((arg) => (arg === '__PROMPT__' ? prompt : arg));
    input = undefined;
  }
  const isolated = spawnPrefix.length > 0;
  const command = isolated ? spawnPrefix[0] : resolvedCommand;
  const args = isolated ? [...spawnPrefix.slice(1), resolvedCommand, ...agentArgv] : agentArgv;
  return {
    command,
    supervisorArgs: [SUPERVISOR, String(process.pid), String(timeout), command, ...args],
    input,
    env: buildMinimalEnv(envPass, sourceEnv, adapter.envNames),
    cwd,
    timeout,
  };
}

/**
 * What the agent printed, or the error that says why it could not answer,
 * read from the supervisor's report and the captured streams.
 *
 * @param {{ outcome: object, stdout: string, stderr: string }} ended
 * @param {{ command: string, timeout: number }} invocation
 * @returns {{ stdout: string, stderr: string }}
 */
function agentAnswer({ outcome, stdout, stderr }, { command, timeout }) {
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
  // What the agent printed before it failed, for a caller that keeps a failing agent's streams as evidence.
  const withStreams = (error) => Object.assign(error, { stdout: stdout || '', stderr: stderr || '' });
  if (outcome.timedOut) {
    const error = new Error(`Agent "${command}" failed: timed out after ${timeout}ms (SIGTERM sent)`);
    error.code = 'AGENT_FAILED';
    throw withStreams(error);
  }
  if (outcome.failure) {
    const error = new Error(`Agent "${command}" failed: ${outcome.failure}`);
    error.code = 'AGENT_FAILED';
    throw withStreams(error);
  }

  if (outcome.status !== 0) {
    const stderrTail = (stderr || '').trim().split('\n').slice(-STDERR_TAIL_LINES).join('\n');
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
    throw withStreams(error);
  }

  return { stdout: stdout || '', stderr: stderr || '' };
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
 * @param {{ name: string, command: string, args: string[] }} [options.bridge] - The one MCP server
 *   the agent may use, in place of every built-in tool (runAgentAsync's callers only: a
 *   synchronous run blocks the event loop a bridge's host serves on).
 * @returns {{ stdout: string, stderr: string }} Captured output from a successful agent run.
 * @throws {Error} AGENT_NOT_FOUND when the executable is missing, AGENT_FAILED
 *   on spawn error, timeout, or non-zero exit (a timeout or non-zero exit carries
 *   the agent's `stdout` and `stderr` on the error), CAPABILITY_UNKNOWN when a declared
 *   capability is not one the manifest vocabulary names.
 */
function runAgent(prompt, options = {}) {
  const invocation = agentInvocation(prompt, options);
  // The agent runs in its own process group under the supervisor, which stops
  // the group on the wall clock, on a signal, when the runner or the
  // supervisor dies, and when the agent exits; the report on file descriptor 3
  // says how the agent ended. spawnSync returns once every copy of these pipes
  // is closed, and only the supervisor and its group leader hold them.
  // spawnSync gets no timeout of its own: its timer counts time the runner
  // spends suspended (Ctrl-Z), and on expiry it closes the pipes before reading
  // what they hold, the agent's reply included. The group leader owns the wall
  // clock, and the supervisor the backstop past it.
  const result = spawnSync(process.execPath, invocation.supervisorArgs, {
    cwd: invocation.cwd,
    encoding: 'utf8',
    input: invocation.input,
    env: invocation.env,
    maxBuffer: MAX_BUFFER,
    stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
    // Output past maxBuffer ends the supervisor at once; its end closes the lifeline, and the group leader stops the agent.
    killSignal: 'SIGKILL',
  });
  return agentAnswer({ outcome: supervisedOutcome(result), stdout: result.stdout, stderr: result.stderr }, invocation);
}

/**
 * `command` run under the supervisor without blocking the event loop: its own
 * process group, stopped on the wall clock, on a signal and when this process
 * dies, with `input` on its stdin. Resolves with the supervisor's report and
 * the captured streams whatever the command did; output past `MAX_BUFFER` on
 * either stream ends the supervisor, which stops the group, and is reported
 * as a failure.
 *
 * @param {object} options
 * @param {string} options.command
 * @param {string[]} [options.args]
 * @param {string} [options.input]
 * @param {string} options.cwd
 * @param {object} options.env the whole child environment
 * @param {number} options.timeout wall clock in milliseconds
 * @returns {Promise<{ outcome: object, stdout: string, stderr: string, stdoutBytes: Buffer, stderrBytes: Buffer }>}
 *   each stream as text and as the bytes the command wrote
 */
function runSupervised({ command, args = [], input, cwd, env, timeout }) {
  return superviseAsync({
    supervisorArgs: [SUPERVISOR, String(process.pid), String(timeout), command, ...args],
    input,
    cwd,
    env,
  });
}

/**
 * The supervisor spawned asynchronously, its streams and report collected:
 * each stream as UTF-8 text (a byte sequence that is not UTF-8 read as
 * U+FFFD) and as the bytes the command wrote (`stdoutBytes`, `stderrBytes`).
 */
function superviseAsync({ supervisorArgs, input, cwd, env }) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(process.execPath, supervisorArgs, { cwd, env, stdio: ['pipe', 'pipe', 'pipe', 'pipe'] });
    } catch (error) {
      // A spawn the system refuses at once (no descriptors left, say) is a supervisor that could not start.
      resolve({
        outcome: { failure: `the agent supervisor could not start: ${error.message}` },
        stdout: '',
        stderr: '',
        stdoutBytes: Buffer.alloc(0),
        stderrBytes: Buffer.alloc(0),
      });
      return;
    }
    const chunks = { stdout: [], stderr: [], report: [] };
    const sizes = { stdout: 0, stderr: 0 };
    let overflow = null;
    let spawnFailure = null;
    const collect = (name) => (chunk) => {
      // Past the cap nothing more is kept, so what is kept is a faithful prefix of each stream.
      if (overflow !== null) return;
      if (name !== 'report') {
        const room = MAX_BUFFER - sizes[name];
        sizes[name] += chunk.length;
        if (sizes[name] > MAX_BUFFER) {
          overflow = `the command's ${name} passed ${MAX_BUFFER} bytes`;
          chunks[name].push(chunk.subarray(0, room));
          child.kill('SIGKILL');
          return;
        }
      }
      chunks[name].push(chunk);
    };
    child.stdout.on('data', collect('stdout'));
    child.stderr.on('data', collect('stderr'));
    child.stdio[3].on('data', collect('report'));
    for (const stream of [child.stdout, child.stderr, child.stdio[3]]) stream.on('error', () => {});
    child.stdin.on('error', () => {});
    child.once('error', (error) => (spawnFailure = error));
    child.once('close', (status, signal) => {
      const bytes = (name) => Buffer.concat(chunks[name]);
      const outcome =
        spawnFailure === null && overflow === null
          ? supervisedOutcome({ output: [null, null, null, bytes('report').toString('utf8')], status, signal })
          : { failure: overflow ?? spawnFailure.message };
      const stdoutBytes = bytes('stdout');
      const stderrBytes = bytes('stderr');
      resolve({ outcome, stdout: stdoutBytes.toString('utf8'), stderr: stderrBytes.toString('utf8'), stdoutBytes, stderrBytes });
    });
    child.stdin.end(input ?? '');
  });
}

/**
 * `runAgent` without blocking the event loop, for a caller that serves the
 * agent while it runs (the bridge a sealed-brief evaluator acts through).
 * Same options, same answer, same errors, each also carrying the bytes the
 * agent wrote (`stdoutBytes`, `stderrBytes`).
 *
 * @returns {Promise<{ stdout: string, stderr: string, stdoutBytes: Buffer, stderrBytes: Buffer }>}
 */
async function runAgentAsync(prompt, options = {}) {
  const invocation = agentInvocation(prompt, options);
  const ended = await superviseAsync(invocation);
  const bytes = { stdoutBytes: ended.stdoutBytes, stderrBytes: ended.stderrBytes };
  try {
    return { ...agentAnswer(ended, invocation), ...bytes };
  } catch (error) {
    throw Object.assign(error, bytes);
  }
}

module.exports = { runAgent, runAgentAsync, runSupervised, buildMinimalEnv };
