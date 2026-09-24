/**
 * The processes `runAgent` puts between a runner and its agent, so a timeout,
 * a signal, or the death of the runner or of this supervisor stops every
 * process the agent started, and no process the agent leaves behind holds the
 * runner's pipes.
 *
 * `runAgent` blocks in `spawnSync`, which on a timeout signals only its direct
 * child: a shell, a tool call or a sub-agent the agent started lives on. It
 * also returns only once every copy of the pipes it gave its child is closed,
 * so a process that inherited them and left the agent's process group (for a
 * new session) would keep the runner waiting for as long as it lives. Two
 * processes stand in between:
 *
 * - The supervisor, `spawnSync`'s direct child, stays in the runner's process
 *   group, so a terminal's Ctrl-C or Ctrl-\ and a signal to the runner's whole
 *   group reach it. It forwards `SIGINT`, `SIGTERM`, `SIGHUP` and `SIGQUIT` to
 *   the group leader, exits when the runner is gone, and kills the leader and
 *   the agent's group when the leader has not ended 5 s past the wall clock (a
 *   leader stopped with `SIGSTOP`, say) or ends without a report.
 * - The group leader, which the supervisor starts in a new session, starts the
 *   agent as the leader of a process group of its own, tells the supervisor
 *   the agent's pid, and holds one end of a socket, the lifeline, whose other
 *   end only the supervisor holds. The kernel closes the lifeline however the
 *   supervisor ends, `SIGKILL` included, and the leader then stops the group.
 *
 * The agent's standard input, output and error are pipes the leader owns: the
 * leader copies the runner's input to the agent and the agent's output to the
 * runner, and only the leader and the supervisor hold the runner's own pipes.
 * The leader stops the agent's group by sending it `SIGTERM` (or the forwarded
 * signal, or a stopping signal the leader itself receives) and sending the
 * agent `SIGKILL` if it is still running after a grace period. It does so on the wall clock,
 * on a signal and when the lifeline closes. When the agent exits, every
 * process left in its group receives `SIGKILL` at once, since nothing the
 * agent started may outlive the turn. The leader then copies what the agent's
 * output pipes still hold and closes them once each reaches its end, stays
 * empty for 100 ms, or has been read for 2 s in all while the runner keeps up;
 * output any process writes after that is lost.
 *
 * The outcome reaches the runner as one JSON object on file descriptor 3,
 * which the agent does not inherit: `{ status, signal }` for an agent that
 * ended, `{ timedOut: true }` for one that outlived the wall clock,
 * `{ spawnError: { code, message } }` for one that could not start, and
 * `{ failure }` for a supervisor that ended before the agent, and for a leader
 * that ended without a report. The leader writes its report on the runner's
 * descriptor itself, which it inherits from the supervisor, and then kills the
 * supervisor, which has nothing left to do, before it copies the rest of the
 * output. A Ctrl-Z suspends the runner and the supervisor while the agent runs
 * on, bounded by its wall clock and the runner's end; the report and the
 * agent's output wait in the runner's pipes and in the leader until it
 * resumes, however long it stays suspended.
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

/** What the leader writes on the lifeline once the agent has started, so the supervisor can stop the agent's group. */
const AGENT_LINE = /^agent (\d+)$/m;

/** How long a signalled agent gets before `SIGKILL`. */
const GRACE_MS = 2000;

/** How long an output pipe may stay empty after the agent exits before the leader closes it. */
const QUIET_MS = 100;

/**
 * How long the leader reads an output pipe after the agent exits, counting
 * only the time the runner keeps up, so a process that goes on writing to it
 * cannot keep the runner waiting.
 */
const DRAIN_MS = 2000;

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

/** Whether `fd` is a pipe or a socket, as the runner's descriptors are; a test may hand the leader others. */
function streamable(fd) {
  try {
    const stat = fs.fstatSync(fd);
    return stat.isFIFO() || stat.isSocket();
  } catch {
    return false;
  }
}

/**
 * A readable or writable stream over this process's descriptor `fd`. A pipe
 * or socket gets an event-loop stream, which waits out a full or empty pipe
 * even when the descriptor is non-blocking: the runner's descriptors are
 * shared with the supervisor, and on Linux they can turn non-blocking under
 * load, where a thread-pool write would fail with `EAGAIN`. Its writes never
 * block the event loop, where the wall clock runs, so a runner that stops
 * reading (a Ctrl-Z) holds back only the output. Any other descriptor gets a
 * thread-pool stream.
 */
function descriptorStream(fd, writable) {
  if (streamable(fd)) return new net.Socket({ fd, readable: !writable, writable });
  return writable ? fs.createWriteStream(null, { fd, autoClose: false }) : fs.createReadStream(null, { fd, autoClose: false });
}

/**
 * Copies `source`, one of the agent's output pipes, to this process's file
 * descriptor `fd`, the runner's pipe. While the runner lags, reading waits, so
 * the agent's writes wait as they would on the runner's own pipe.
 *
 * `close(callback)`, called once the agent has exited, keeps copying and calls
 * `callback` once the pipe has ended, stayed empty for `QUIET_MS`, or been
 * read for `DRAIN_MS` in all, and everything read has been written. Neither
 * clock runs while the runner lags.
 */
function relay(source, fd) {
  const sink = descriptorStream(fd, true);
  let lagging = false;
  let done = false;
  let flushing = false;
  let unwritten = 0;
  let closing = null;
  let quiet = null;
  let drain = null;
  let drainLeft = DRAIN_MS;
  let drainSince = 0;

  const holdClocks = () => {
    clearTimeout(quiet);
    quiet = null;
    if (drain === null) return;
    clearTimeout(drain);
    drain = null;
    drainLeft -= Date.now() - drainSince;
  };
  const runClocks = () => {
    if (closing === null || done || lagging) return;
    holdClocks();
    drainSince = Date.now();
    quiet = setTimeout(end, QUIET_MS);
    drain = setTimeout(end, Math.max(0, drainLeft));
  };
  // Calls back once the pipe is done and every chunk read has been written,
  // or can no longer be, since the runner is gone.
  const flush = () => {
    if (closing === null || !done || flushing) return;
    if (unwritten > 0 && !sink.destroyed) return;
    flushing = true;
    closing();
  };
  function end() {
    if (done) return;
    done = true;
    holdClocks();
    source.destroy();
    flush();
  }
  const written = () => {
    unwritten -= 1;
    flush();
  };

  // The runner is gone, so nothing more can reach it.
  sink.on('error', () => {
    sink.destroy();
    end();
    flush();
  });
  source.on('error', end);
  source.on('end', end);
  source.on('data', (chunk) => {
    unwritten += 1;
    if (!sink.write(chunk, written)) {
      lagging = true;
      holdClocks();
      source.pause();
      sink.once('drain', () => {
        lagging = false;
        source.resume();
        runClocks();
      });
    }
    runClocks();
  });

  return {
    close(callback) {
      closing = callback;
      if (done) flush();
      else runClocks();
    },
  };
}

/**
 * The group leader: starts the agent in a process group of its own, copies
 * its input and output, stops the group on the wall clock, on a signal, when
 * the lifeline closes, and when the agent exits, and reports to the runner.
 */
function lead([supervisorArgument, timeoutArgument, command, ...args]) {
  const supervisorPid = Number(supervisorArgument);
  const lifeline = new net.Socket({ fd: LIFELINE_FD, readable: true, writable: true });
  lifeline.on('error', () => {});
  // Pipes this process owns: a process the agent leaves behind may hold them,
  // and the runner's, which only this process and the supervisor hold, stay out of its reach.
  const agent = spawn(command, args, { stdio: 'pipe', detached: GROUPS });
  if (agent.pid !== undefined) write(LIFELINE_FD, `agent ${agent.pid}\n`);

  const input = descriptorStream(0, false);
  input.on('error', () => agent.stdin.destroy());
  // An agent that ends or stops reading leaves the rest of its input unread.
  agent.stdin.on('error', () => input.destroy());
  input.pipe(agent.stdin);
  const outputs = [relay(agent.stdout, 1), relay(agent.stderr, 2)];

  let timedOut = false;
  let supervisorGone = false;
  let settled = false;
  let killTimer = null;

  const signalGroup = (signal) => {
    try {
      if (GROUPS) process.kill(-agent.pid, signal);
      else agent.kill(signal);
    } catch {
      // The group is already gone.
    }
  };
  const stop = (signal) => {
    if (settled || agent.pid === undefined) return;
    signalGroup(signal);
    if (killTimer === null) killTimer = setTimeout(() => agent.kill('SIGKILL'), GRACE_MS);
  };
  const finish = (outcome) => {
    if (settled) return;
    settled = true;
    // Everything left in the agent's group ends with the turn.
    if (GROUPS && agent.pid !== undefined) signalGroup('SIGKILL');
    input.destroy();
    agent.stdin.destroy();
    // Straight to the runner, so a supervisor suspended with it cannot hold the report back.
    write(LEADER_REPORT_FD, JSON.stringify(outcome));
    write(LIFELINE_FD, REPORTED);
    if (GROUPS) {
      // The supervisor has nothing left to do, and a stopped one would keep
      // the runner waiting. It is killed only while it is still this
      // process's parent, so a reused pid is never hit.
      try {
        if (process.ppid === supervisorPid) process.kill(supervisorPid, 'SIGKILL');
      } catch {
        // The supervisor is already gone.
      }
    }
    let open = outputs.length;
    for (const output of outputs) output.close(() => --open === 0 && process.exit(0));
  };

  // A stopping signal sent to this process alone stops the agent's group, as a forwarded one does.
  for (const name of STOPPING) process.on(name, () => stop(name));

  agent.once('error', (error) => finish({ spawnError: { code: error.code ?? null, message: error.message } }));
  agent.once('exit', (status, signal) => {
    if (timedOut) return finish({ timedOut: true });
    if (supervisorGone)
      return finish({ failure: 'the agent supervisor ended before the agent did, so its group leader stopped the agent' });
    return finish({ status, signal });
  });

  after(Number(timeoutArgument), () => {
    if (settled) return;
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
    if (settled || killTimer !== null) return;
    supervisorGone = true;
    stop('SIGTERM');
  });
}

/**
 * The supervisor: starts the group leader, forwards signals to it, exits when
 * the runner is gone, kills the leader and the agent's group when the leader
 * outlives the wall clock by `BACKSTOP_MS` or ends without a report, and then
 * reports to the runner itself.
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

  // The group a leader that ended or hung without a report leaves behind.
  const killAgentGroup = () => {
    const started = AGENT_LINE.exec(heard);
    try {
      if (GROUPS && started !== null) process.kill(-Number(started[1]), 'SIGKILL');
    } catch {
      // The group is already gone.
    }
  };
  const fail = (failure) => {
    write(RUNNER_REPORT_FD, JSON.stringify({ failure }));
    process.exit(0);
  };
  leader.once('error', (error) => fail(`the agent's group leader could not start: ${error.message}`));
  leader.once('exit', () => {
    if (!heard.includes(REPORTED)) killAgentGroup();
  });
  leader.once('close', (status, signal) => {
    if (heard.includes(REPORTED)) return process.exit(0);
    if (overdue) return fail(`the agent's group leader gave no report ${BACKSTOP_MS}ms past the agent's ${timeout}ms wall clock`);
    const ending = signal ? `was killed by signal ${signal}` : `exited with code ${status}`;
    return fail(`the agent's group leader ${ending} without reporting how the agent ended`);
  });

  // A leader that has not ended well past the wall clock cannot stop the
  // agent's group, so both are killed.
  after(timeout + BACKSTOP_MS, () => {
    overdue = true;
    try {
      if (GROUPS) process.kill(-leader.pid, 'SIGKILL');
      else leader.kill('SIGKILL');
    } catch {
      // The leader is already gone.
    }
    killAgentGroup();
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
