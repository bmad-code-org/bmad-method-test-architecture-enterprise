/**
 * The process `runAgent` spawns between a runner and its agent, so a timeout
 * or a dying runner stops every process the agent started.
 *
 * `runAgent` blocks in `spawnSync`, which on a timeout signals only its direct
 * child: a shell, a tool call or a sub-agent the agent started lives on. This
 * script runs as that direct child. It starts the agent as the leader of a new
 * process group, handing it its own standard streams, and then:
 *
 * - on the wall clock, sends `SIGTERM` to the whole group and `SIGKILL` after a
 *   grace period;
 * - when the agent exits, kills whatever is left of its group, since nothing
 *   the agent started may outlive the turn;
 * - on `SIGINT`, `SIGTERM` or `SIGHUP`, forwards the signal to the group, so a
 *   Ctrl-C at a terminal still reaches the agent, and `SIGKILL`s the group after
 *   the grace period;
 * - when its parent dies (a runner killed by the caller's own timeout, which
 *   `spawnSync` cannot observe), sends the group `SIGTERM`, then `SIGKILL`
 *   after the grace period.
 *
 * The outcome is written as one JSON object on file descriptor 3, which the
 * agent does not inherit: `{ status, signal }` for an agent that ended,
 * `{ timedOut: true }` for one that outlived the wall clock, and
 * `{ spawnError: { code, message } }` for one that could not start.
 *
 * Windows has no process groups, so there the direct child is the one process
 * killed, as eval-quality's MCP adapter does.
 *
 * Usage (from `run-agent.js` only):
 *   node agent-supervisor.js <timeoutMs> <command> [args...]
 */

'use strict';

const fs = require('node:fs');
const { spawn } = require('node:child_process');

const STATUS_FD = 3;

/** How long a signalled group gets before `SIGKILL`. */
const GRACE_MS = 2000;

/** How often the parent's liveness is checked. */
const POLL_MS = 100;

const GROUPS = process.platform !== 'win32';

function report(outcome) {
  try {
    fs.writeSync(STATUS_FD, JSON.stringify(outcome));
  } catch {
    // The runner is gone; nobody reads the outcome.
  }
}

/** Signals the agent's process group, or the agent alone where there are no groups. Whether any process received it. */
function signalGroup(child, signal) {
  try {
    if (GROUPS) process.kill(-child.pid, signal);
    else child.kill(signal);
    return true;
  } catch {
    return false;
  }
}

function main(argv) {
  const [timeoutArgument, command, ...args] = argv;
  const timeoutMs = Number(timeoutArgument);
  const parent = process.ppid;
  const child = spawn(command, args, { stdio: 'inherit', detached: GROUPS });
  let settled = false;
  let timedOut = false;
  let killTimer = null;

  const escalate = () => {
    if (killTimer !== null) return;
    killTimer = setTimeout(() => signalGroup(child, 'SIGKILL'), GRACE_MS);
  };
  const finish = (outcome) => {
    if (settled) return;
    settled = true;
    report(outcome);
    // Whatever the agent left behind in its group ends with the turn.
    signalGroup(child, 'SIGKILL');
    process.exit(0);
  };

  child.once('error', (error) => finish({ spawnError: { code: error.code ?? null, message: error.message } }));
  child.once('exit', (status, signal) => finish(timedOut ? { timedOut: true } : { status, signal }));

  setTimeout(() => {
    timedOut = true;
    signalGroup(child, 'SIGTERM');
    escalate();
  }, timeoutMs);

  for (const name of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(name, () => {
      signalGroup(child, name);
      escalate();
    });
  }

  // A parent that died leaves this process with another parent; the agent's
  // group goes with it, on the same terms as a timeout.
  const watch = setInterval(() => {
    if (process.ppid === parent) return;
    clearInterval(watch);
    signalGroup(child, 'SIGTERM');
    escalate();
  }, POLL_MS);
}

main(process.argv.slice(2));
