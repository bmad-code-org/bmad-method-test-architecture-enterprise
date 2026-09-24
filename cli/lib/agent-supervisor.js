/**
 * The processes `runAgent` puts between a runner and its agent, so a timeout,
 * a signal, or the death of the runner or of this supervisor stops every
 * process the agent started.
 *
 * `runAgent` blocks in `spawnSync`, which on a timeout signals only its direct
 * child: a shell, a tool call or a sub-agent the agent started lives on. Two
 * processes stand in between:
 *
 * - The supervisor, `spawnSync`'s direct child, stays in the runner's process
 *   group, so a terminal's Ctrl-C or Ctrl-\ and a signal to the runner's whole
 *   group reach it. It forwards `SIGINT`, `SIGTERM`, `SIGHUP` and `SIGQUIT` to
 *   the group leader, exits when the runner is gone, and kills the leader's
 *   group when the leader has not ended 5 s past the wall clock (a leader
 *   stopped with `SIGSTOP`, say).
 * - The group leader, which the supervisor starts in a new session, starts the
 *   agent in its own process group and holds one end of a socket, the
 *   lifeline, whose other end only the supervisor holds. The kernel closes the
 *   lifeline however the supervisor ends, `SIGKILL` included, and the leader
 *   then stops the group.
 *
 * The leader stops the group by sending it `SIGTERM` (or the forwarded signal)
 * and sending the agent `SIGKILL` if it is still running after a grace
 * period. It does so on the wall clock, on a forwarded signal and when the
 * lifeline closes. When the agent exits, every process left in the group
 * receives `SIGKILL` at once, since nothing the agent started may outlive the
 * turn; output such a process would write later is lost.
 *
 * The outcome reaches the runner as one JSON object on file descriptor 3,
 * which the agent does not inherit: `{ status, signal }` for an agent that
 * ended, `{ timedOut: true }` for one that outlived the wall clock,
 * `{ spawnError: { code, message } }` for one that could not start, and
 * `{ failure }` for a supervisor that ended before the agent, and for a leader
 * that ended without a report. The leader writes its report on the runner's
 * descriptor itself, which it inherits from the supervisor, and then kills the
 * supervisor, which has nothing left to do. A Ctrl-Z suspends the runner and
 * the supervisor while the agent runs on, bounded by its wall clock and the
 * runner's end; the report and the agent's output wait in the runner's pipes
 * until it resumes, however long it stays suspended.
 *
 * Windows has no process groups: the leader stays in the supervisor's
 * console, and signals, the lifeline and the timeout reach the agent alone.
 *
 * Usage (from `run-agent.js` only):
 *   node agent-supervisor.js <runnerPid> <timeoutMs> <command> [args...]
 * and, for the group leader the supervisor starts:
 *   node agent-supervisor.js --group-leader <supervisorPid> <timeoutMs> <command> [args...]
 */

'use strict';

const fs = require('node:fs');
const net = require('node:net');
const { spawn } = require('node:child_process');

/** The runner's report pipe, in the supervisor. */
const RUNNER_REPORT_FD = 3;

/** The lifeline, in the group leader. */
const LIFELINE_FD = 3;

/** The runner's report pipe, in the group leader, which inherits it from the supervisor. */
const LEADER_REPORT_FD = 4;

/** What the leader writes on the lifeline once it has reported, so the supervisor reports nothing of its own. */
const REPORTED = 'reported\n';

/** How long a signalled agent gets before `SIGKILL`. */
const GRACE_MS = 2000;

/** How long past the wall clock the supervisor waits for the leader: its grace period and some slack. */
const BACKSTOP_MS = 5000;

/** How often the supervisor checks that the runner is alive. */
const POLL_MS = 100;

/** The longest delay one Node timer holds; a longer wall clock chains several. */
const MAX_TIMER_MS = 2 ** 31 - 1;

const GROUPS = process.platform !== 'win32';

/** The signals the supervisor forwards and the leader answers by stopping the group; Windows emulates only the first three. */
const STOPPING = GROUPS ? ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT'] : ['SIGINT', 'SIGTERM', 'SIGHUP'];

const LEADER_FLAG = '--group-leader';

/** Calls `callback` after `ms`, past the 2^31-1 ms one timer can hold. */
function after(ms, callback) {
  if (ms > MAX_TIMER_MS) setTimeout(() => after(ms - MAX_TIMER_MS, callback), MAX_TIMER_MS);
  else setTimeout(callback, ms);
}

function write(fd, text) {
  try {
    fs.writeSync(fd, text);
  } catch {
    // Whoever reads it is gone.
  }
}

/**
 * The group leader: starts the agent in its own process group, stops the
 * group on the wall clock, on a forwarded signal, when the lifeline closes,
 * and when the agent exits, and reports to the runner.
 */
function lead([supervisorArgument, timeoutArgument, command, ...args]) {
  const supervisorPid = Number(supervisorArgument);
  // The leader receives every signal it sends its own group, and outlives
  // them so it can report how the agent ended.
  for (const name of STOPPING) process.on(name, () => {});

  const lifeline = new net.Socket({ fd: LIFELINE_FD, readable: true, writable: true });
  lifeline.on('error', () => {});
  const agent = spawn(command, args, { stdio: 'inherit' });
  let timedOut = false;
  let supervisorGone = false;
  let settled = false;
  let killTimer = null;

  const signalGroup = (signal) => {
    try {
      if (GROUPS) process.kill(-process.pid, signal);
      else agent.kill(signal);
    } catch {
      // The group is already gone.
    }
  };
  const stop = (signal) => {
    signalGroup(signal);
    if (killTimer === null) killTimer = setTimeout(() => agent.kill('SIGKILL'), GRACE_MS);
  };
  const finish = (outcome) => {
    if (settled) return;
    settled = true;
    // Straight to the runner, so a supervisor suspended with it cannot hold the report back.
    write(LEADER_REPORT_FD, JSON.stringify(outcome));
    write(LIFELINE_FD, REPORTED);
    if (GROUPS) {
      // The supervisor has nothing left to do, and a stopped one would keep the
      // runner waiting. It is killed only while it is still this process's
      // parent, so a reused pid is never hit.
      try {
        if (process.ppid === supervisorPid) process.kill(supervisorPid, 'SIGKILL');
      } catch {
        // The supervisor is already gone.
      }
      // Everything left in the group ends with the turn, this process included.
      signalGroup('SIGKILL');
    }
    process.exit(0);
  };

  agent.once('error', (error) => finish({ spawnError: { code: error.code ?? null, message: error.message } }));
  agent.once('exit', (status, signal) => {
    if (timedOut) return finish({ timedOut: true });
    if (supervisorGone)
      return finish({ failure: 'the agent supervisor ended before the agent did, so its group leader stopped the agent' });
    return finish({ status, signal });
  });

  after(Number(timeoutArgument), () => {
    timedOut = true;
    stop('SIGTERM');
  });

  let pending = '';
  lifeline.on('data', (chunk) => {
    pending += chunk.toString('utf8');
    const lines = pending.split('\n');
    pending = lines.pop();
    for (const name of lines) if (STOPPING.includes(name)) stop(name);
  });
  // The supervisor is gone, however it ended. A group already stopping (the
  // supervisor forwarded a Ctrl-C, then exited with the runner) keeps the
  // signal it received.
  lifeline.once('close', () => {
    if (killTimer !== null) return;
    supervisorGone = true;
    stop('SIGTERM');
  });
}

/**
 * The supervisor: starts the group leader, forwards signals to it, exits when
 * the runner is gone, kills the leader's group when the leader outlives the
 * wall clock by `BACKSTOP_MS`, and reports to the runner when the leader ended
 * without a report.
 */
function supervise([runnerPidArgument, timeoutArgument, command, ...args]) {
  const runnerPid = Number(runnerPidArgument);
  const timeout = Number(timeoutArgument);
  const leader = spawn(process.execPath, [__filename, LEADER_FLAG, String(process.pid), timeoutArgument, command, ...args], {
    stdio: ['inherit', 'inherit', 'inherit', 'pipe', RUNNER_REPORT_FD],
    detached: GROUPS,
  });
  const lifeline = leader.stdio[LIFELINE_FD];
  lifeline.on('error', () => {});
  let heard = '';
  lifeline.setEncoding('utf8');
  lifeline.on('data', (chunk) => (heard += chunk));
  let overdue = false;

  const fail = (failure) => {
    write(RUNNER_REPORT_FD, JSON.stringify({ failure }));
    process.exit(0);
  };
  leader.once('error', (error) => fail(`the agent's group leader could not start: ${error.message}`));
  // A leader killed on its own leaves its group behind.
  leader.once('exit', () => {
    try {
      if (GROUPS) process.kill(-leader.pid, 'SIGKILL');
    } catch {
      // The group is already gone.
    }
  });
  leader.once('close', (status, signal) => {
    if (heard.includes(REPORTED)) return process.exit(0);
    if (overdue) return fail(`the agent's group leader gave no report ${BACKSTOP_MS}ms past the agent's ${timeout}ms wall clock`);
    const ending = signal ? `was killed by signal ${signal}` : `exited with code ${status}`;
    return fail(`the agent's group leader ${ending} without reporting how the agent ended`);
  });

  // A leader that has not ended well past the wall clock cannot stop its
  // group, so the group is killed with it.
  after(timeout + BACKSTOP_MS, () => {
    overdue = true;
    try {
      if (GROUPS) process.kill(-leader.pid, 'SIGKILL');
      else leader.kill('SIGKILL');
    } catch {
      // The group is already gone.
    }
  });

  for (const name of STOPPING) process.on(name, () => lifeline.write(`${name}\n`));

  // The runner is gone once this process has another parent (it may already
  // have one at start), or, on Windows, once the runner's pid is unused.
  // Exiting closes the lifeline, and the leader stops the group.
  const runnerGone = GROUPS
    ? () => process.ppid !== runnerPid
    : () => {
        try {
          process.kill(runnerPid, 0);
          return false;
        } catch (error) {
          return error.code === 'ESRCH';
        }
      };
  const watch = () => {
    if (runnerGone()) process.exit(0);
  };
  watch();
  setInterval(watch, POLL_MS);
}

const argv = process.argv.slice(2);
if (argv[0] === LEADER_FLAG) lead(argv.slice(1));
else supervise(argv);
