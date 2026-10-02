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
 * new session) would keep the runner waiting for as long as it lives. Three
 * processes stand in between:
 *
 * - The supervisor, `spawnSync`'s direct child, stays in the runner's process
 *   group, so a terminal's Ctrl-C or Ctrl-\ and a signal to the runner's whole
 *   group reach it. It forwards `SIGINT`, `SIGTERM`, `SIGHUP` and `SIGQUIT` to
 *   the group leader, exits when the runner is gone, and kills the leader and
 *   the agent's group when the leader has not ended 5 s past the wall clock (a
 *   leader stopped with `SIGSTOP`, say) or ends without a report.
 * - The leader, which the supervisor starts in a new session, starts a guardian
 *   as the agent group's leader. It knows that group ID as soon as spawn
 *   returns and tells the supervisor. Its lifeline closes however the
 *   supervisor ends, `SIGKILL` included.
 * - The guardian starts the agent in its own group and holds a separate
 *   lifeline from the leader. If the leader and supervisor both die, the
 *   guardian still stops the group when that lifeline closes.
 *
 * The agent's standard input, output and error are pipes the leader owns and
 * the guardian passes through: the leader copies the runner's input to the
 * agent and its output to the runner. Only the leader and supervisor hold
 * the runner's own pipes.
 * The leader stops the agent's group by sending it `SIGTERM` (or the forwarded
 * signal, or a stopping signal the leader itself receives) and sending the
 * group `SIGKILL` if it is still running after a grace period. It does so on the wall clock,
 * on a signal and when the lifeline closes. An agent still running then ends
 * by `SIGKILL`, and `stoppedBy` keeps the signal that asked it to stop: a
 * `SIGQUIT`, whose default action writes a core file, can leave the agent
 * dumping past the grace period wherever the kernel hands cores to a
 * collector, and the kernel then records the `SIGKILL`. When the agent exits, every
 * process left in its group receives `SIGKILL` at once, since nothing the
 * agent started may outlive the turn. The leader then copies what the agent's
 * output pipes still hold and closes them once each reaches its end, stays
 * empty for 100 ms, or has been read for 2 s in all while the runner keeps up;
 * output any process writes after that is lost.
 *
 * The outcome reaches the runner as one JSON object on file descriptor 3,
 * which the agent does not inherit: `{ status, signal }` for an agent that
 * ended, with `stoppedBy` naming the stopping signal when one (forwarded or
 * received) made the leader stop the group, `{ timedOut: true }` for one that
 * outlived the wall clock,
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
 * console. Before the guardian starts the agent, a PowerShell helper assigns
 * the guardian to a kill-on-close Job Object. Ordinary descendants inherit
 * the job, whose sole handle closes when the guardian's pipe closes. Setup
 * has its own 90 s bound; the agent's wall clock starts when the guardian
 * reports the actual agent PID. The supervisor's startup backstop runs 105 s
 * from its own start, allowing for cold Node startup before the guardian's
 * setup timer begins.
 *
 * Usage (from `run-agent.js` only):
 *   node agent-supervisor.js <runnerPid> <timeoutMs> <command> [args...]
 * and, for the group leader the supervisor starts:
 *   node agent-supervisor.js --group-leader <supervisorPid> <timeoutMs> <command> [args...]
 */

'use strict';

const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

/** Synchronous, opt-in trace for the Windows guardian startup probe. */
function trace(stage, detail = '') {
  if (!process.env.TEA_WINDOWS_JOB_TRACE) return;
  try {
    const message = String(detail).replaceAll(/\s+/g, ' ').slice(0, 1000);
    fs.appendFileSync(process.env.TEA_WINDOWS_JOB_TRACE, `${Date.now()} node ${process.pid} ${stage} ${message}\n`);
  } catch {
    // A diagnostic must never affect supervision.
  }
}

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

/** Cold Windows PowerShell startup took 25.8 s in CI; setup has a separate 90 s bound. */
const WINDOWS_SETUP_MS = 90_000;

/** Allows cold Node startup before the guardian's own setup timer begins. */
const WINDOWS_STARTUP_SLACK_MS = 15_000;

/** How often the supervisor checks that the runner is alive. */
const POLL_MS = 100;

/** The longest delay one Node timer holds; a longer wall clock chains several. */
const MAX_TIMER_MS = 2 ** 31 - 1;

const GROUPS = process.platform !== 'win32';

/** The signals the supervisor forwards and the leader answers by stopping the group; Windows emulates only the first three. */
const STOPPING = GROUPS ? ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT'] : ['SIGINT', 'SIGTERM', 'SIGHUP'];

const LEADER_FLAG = '--group-leader';
const GUARDIAN_FLAG = '--agent-guardian';

/** The guardian is the agent's group leader. Its lifeline is held only by the leader. */
function guard([command, ...args]) {
  trace('guardian-enter');
  const lifeline = new net.Socket({ fd: 4, readable: true, writable: false });
  trace('guardian-lifeline-ready');
  lifeline.on('error', () => {});
  let stopping = false;
  let finished = false;
  let agent = null;
  let job = null;
  let abandoned = false;
  let failSetup = null;
  let pendingStop = null;
  const stop = (signal) => {
    if (stopping || finished) return;
    stopping = true;
    if (!GROUPS && agent === null) {
      pendingStop = signal;
      if (failSetup !== null) failSetup(new Error(`guardian stopped by ${signal} during Windows Job Object setup`));
      return;
    }
    if (GROUPS) {
      try {
        process.kill(-process.pid, signal);
      } catch {
        /* The group ended. */
      }
    } else if (agent !== null) {
      agent.kill(signal);
    }
    setTimeout(() => {
      if (GROUPS) {
        try {
          process.kill(-process.pid, 'SIGKILL');
        } catch {
          /* The group ended. */
        }
      } else if (agent !== null) agent.kill('SIGKILL');
    }, GRACE_MS);
  };
  for (const name of STOPPING) process.on(name, () => stop(name));
  lifeline.once('close', () => {
    abandoned = true;
    stop('SIGTERM');
    if (job !== null && !finished) job.stdin.end();
  });

  const launch = () => {
    trace('guardian-launch-check', `abandoned=${abandoned} stopping=${stopping} finished=${finished}`);
    if (abandoned || stopping || finished) return;
    agent = spawn(command, args, { stdio: 'inherit' });
    trace('guardian-agent-spawned', `pid=${agent.pid}`);
    if (agent.pid !== undefined) {
      trace('guardian-agent-pid-write-start', `pid=${agent.pid}`);
      const error = write(5, `${agent.pid}\n`);
      trace('guardian-agent-pid-write-end', error ? `error=${error.message}` : `pid=${agent.pid}`);
      if (error) {
        finished = true;
        write(
          3,
          JSON.stringify({
            spawnError: { code: error.code ?? 'PID_REPORT', message: `the guardian could not report the agent PID: ${error.message}` },
          }),
        );
        trace('guardian-report-written', 'agent PID report failure on fd3');
        agent.kill('SIGKILL');
        job.stdin.end();
        process.exit(0);
      }
    }
    if (stopping) agent.kill('SIGTERM');
    agent.once('error', (error) => {
      if (finished) return;
      finished = true;
      write(3, JSON.stringify({ spawnError: { code: error.code ?? null, message: error.message } }));
      trace('guardian-report-written', `spawn error ${error.message}`);
      if (job !== null) job.stdin.end();
      process.exit(0);
    });
    agent.once('exit', (status, signal) => {
      trace('guardian-agent-exit', `status=${status} signal=${signal}`);
      if (finished) return;
      finished = true;
      write(3, JSON.stringify({ status, signal }));
      trace('guardian-report-written', `status=${status} signal=${signal}`);
      if (GROUPS) {
        try {
          process.kill(-process.pid, 'SIGKILL');
        } catch {
          /* The group ended. */
        }
      } else {
        job.stdin.end();
        process.exit(0);
      }
    });
  };

  // The guardian joins the kill-on-close job before it can start the agent.
  if (GROUPS) return launch();
  const systemRoot = process.env.SystemRoot;
  const powershell =
    systemRoot && path.isAbsolute(systemRoot) ? path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : null;
  let trustedHelper = false;
  try {
    trustedHelper = powershell !== null && fs.statSync(powershell).isFile();
  } catch {
    // A missing system helper fails setup before the agent can start.
  }
  if (!trustedHelper) {
    write(
      3,
      JSON.stringify({
        spawnError: { code: 'JOB_OBJECT', message: 'Windows Job Object setup failed: trusted PowerShell executable unavailable' },
      }),
    );
    process.exit(0);
  }
  trace('guardian-helper-spawn-start');
  job = spawn(
    powershell,
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(__dirname, 'windows-job-owner.ps1'),
      '-GuardianPid',
      String(process.pid),
    ],
    {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  trace('guardian-helper-spawned', `pid=${job.pid}`);
  let ready = false;
  let output = '';
  let diagnostic = '';
  trace('guardian-setup-deadline', `${WINDOWS_SETUP_MS}ms`);
  const setupTimer = setTimeout(() => {
    trace('guardian-setup-timeout');
    failSetup(new Error('Windows Job Object setup timed out'));
  }, WINDOWS_SETUP_MS);
  failSetup = (error) => {
    if (ready || finished) return;
    trace('guardian-setup-fail', error.message);
    finished = true;
    clearTimeout(setupTimer);
    write(
      3,
      JSON.stringify({
        spawnError: {
          code: error.code ?? 'JOB_OBJECT',
          message: `Windows Job Object setup failed: ${error.message}${diagnostic ? `: ${diagnostic.trim()}` : ''}`,
        },
      }),
    );
    trace('guardian-report-written', 'setup failure on fd3');
    job.stdin.destroy();
    trace('guardian-helper-kill-requested', `accepted=${job.kill()}`);
    if (process.env.TEA_WINDOWS_JOB_TRACE) setTimeout(() => process.exit(0), 1000);
    else process.exit(0);
  };
  job.stdin.on('error', () => {});
  job.stdout.setEncoding('utf8');
  job.stdout.on('data', (chunk) => {
    trace('guardian-helper-stdout', chunk);
    output += chunk;
    if (output.length > 8192) return failSetup(new Error('Windows Job Object helper sent excessive output'));
    const newline = output.indexOf('\n');
    if (newline === -1) return;
    const line = output.slice(0, newline).trim();
    if (line.startsWith('ERROR ')) return failSetup(new Error(line.slice('ERROR '.length)));
    if (line !== 'READY') return failSetup(new Error('Windows Job Object helper sent an invalid readiness report'));
    ready = true;
    trace('guardian-helper-ready');
    clearTimeout(setupTimer);
    if (abandoned) return job.stdin.end();
    launch();
  });
  job.stderr.setEncoding('utf8');
  job.stderr.on('data', (chunk) => {
    trace('guardian-helper-stderr', chunk);
    diagnostic += chunk.slice(0, Math.max(0, 4096 - diagnostic.length));
  });
  job.once('error', (error) => {
    trace('guardian-helper-error', error.message);
    failSetup(error);
  });
  job.once('close', (status, signal) => {
    trace('guardian-helper-close', `status=${status} signal=${signal}`);
    failSetup(new Error(`Windows Job Object helper closed with status ${status} and signal ${signal} before readiness`));
  });
  if (pendingStop !== null) failSetup(new Error(`guardian stopped by ${pendingStop} during Windows Job Object setup`));
}

/** Calls `callback` after `ms`, past the 2^31-1 ms one timer can hold. */
function after(ms, callback) {
  if (ms > MAX_TIMER_MS) setTimeout(() => after(ms - MAX_TIMER_MS, callback), MAX_TIMER_MS);
  else setTimeout(callback, ms);
}

function write(fd, text) {
  try {
    fs.writeSync(fd, text);
    return null;
  } catch (error) {
    // Whoever reads it is gone.
    return error;
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
  trace('leader-enter', `timeout=${timeoutArgument}`);
  const supervisorPid = Number(supervisorArgument);
  const lifeline = new net.Socket({ fd: LIFELINE_FD, readable: true, writable: true });
  lifeline.on('error', () => {});
  // Pipes this process owns: a process the agent leaves behind may hold them,
  // and the runner's, which only this process and the supervisor hold, stay out of its reach.
  const agent = spawn(process.execPath, [__filename, GUARDIAN_FLAG, command, ...args], {
    stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe', 'pipe'],
    detached: GROUPS,
  });
  trace('leader-guardian-spawned', `pid=${agent.pid}`);
  if (agent.pid !== undefined) {
    trace('leader-guardian-pid-write-start', `pid=${agent.pid}`);
    const error = write(LIFELINE_FD, `agent ${agent.pid}\n`);
    trace('leader-guardian-pid-write-end', error ? `error=${error.message}` : `pid=${agent.pid}`);
  }
  let guardianReport = '';
  let completeAfterGuardianExit = null;
  let agentPid = null;
  let agentPidLine = '';
  agent.stdio[3].setEncoding('utf8');
  agent.stdio[3].on('data', (chunk) => {
    trace('leader-guardian-report-data', chunk);
    guardianReport += chunk;
    if (completeAfterGuardianExit !== null) completeAfterGuardianExit();
  });
  agent.stdio[3].on('end', () => trace('leader-guardian-report-end'));
  agent.stdio[4].on('error', () => {});
  agent.stdio[5].setEncoding('utf8');
  agent.stdio[5].on('error', (error) => trace('leader-agent-pid-error', error.message));
  agent.stdio[5].on('end', () => trace('leader-agent-pid-end'));

  trace('leader-relay-setup-start');
  const input = descriptorStream(0, false);
  input.on('error', () => agent.stdin.destroy());
  // An agent that ends or stops reading leaves the rest of its input unread.
  agent.stdin.on('error', () => input.destroy());
  input.pipe(agent.stdin);
  const outputs = [relay(agent.stdout, 1), relay(agent.stderr, 2)];
  trace('leader-relay-setup-end');

  let timedOut = false;
  let supervisorGone = false;
  let settled = false;
  let wallClockStarted = false;
  let killTimer = null;
  /** The stopping signal that first made this process stop the group, reported beside how the agent ended. */
  let stoppedBy = null;

  const signalGroup = (signal) => {
    try {
      if (GROUPS) process.kill(-agent.pid, signal);
      else agent.kill(signal);
    } catch {
      // The group is already gone.
    }
  };
  const stop = (signal, { requested = false } = {}) => {
    if (settled || agent.pid === undefined) return;
    if (requested && stoppedBy === null) stoppedBy = signal;
    signalGroup(signal);
    if (killTimer === null)
      killTimer = setTimeout(() => {
        signalGroup('SIGKILL');
        if (!GROUPS) {
          // Windows has no process groups. Stop the actual agent even if its guardian is stubborn.
          if (agentPid !== null) {
            try {
              process.kill(agentPid, 'SIGKILL');
            } catch {
              /* The agent ended. */
            }
          }
          spawnSync('taskkill', ['/PID', String(agent.pid), '/T', '/F'], { stdio: 'ignore', timeout: GRACE_MS });
          agent.kill('SIGKILL');
        }
      }, GRACE_MS);
  };
  const finish = (outcome) => {
    if (settled) return;
    trace('leader-finish', JSON.stringify(outcome));
    settled = true;
    clearTimeout(killTimer);
    agent.stdio[4].end();
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

  // The agent's wall clock starts after the guardian confirms its real PID.
  agent.stdio[5].on('data', (chunk) => {
    trace('leader-agent-pid-data', chunk);
    agentPidLine += chunk;
    if (settled || wallClockStarted || !agentPidLine.includes('\n')) return;
    const pid = Number(agentPidLine.split('\n', 1)[0]);
    if (!Number.isSafeInteger(pid) || pid <= 0) return;
    agentPid = pid;
    wallClockStarted = true;
    if (GROUPS) return;
    trace('leader-agent-ready', `pid=${pid} timeout=${timeoutArgument}`);
    write(LIFELINE_FD, 'ready\n');
    trace('leader-supervisor-ready-written', `pid=${pid}`);
    after(Number(timeoutArgument), () => {
      if (settled) return;
      trace('leader-wallclock-timeout', `agentPid=${agentPid}`);
      timedOut = true;
      stop('SIGTERM');
    });
  });

  // A stopping signal sent to this process alone stops the agent's group, as a forwarded one does.
  for (const name of STOPPING) process.on(name, () => stop(name, { requested: true }));

  agent.once('error', (error) => finish({ spawnError: { code: error.code ?? null, message: error.message } }));
  agent.once('exit', (status, signal) => {
    trace('leader-guardian-exit', `status=${status} signal=${signal} report=${guardianReport}`);
    const complete = () => {
      if (settled) return;
      if (timedOut) return finish({ timedOut: true });
      if (supervisorGone)
        return finish({ failure: 'the agent supervisor ended before the agent did, so its group leader stopped the agent' });
      let outcome;
      try {
        outcome = JSON.parse(guardianReport);
      } catch {
        outcome =
          stoppedBy !== null && signal !== null
            ? { status: null, signal }
            : { failure: `the agent guardian ended ${signal ?? status} without reporting` };
      }
      return finish(stoppedBy === null ? outcome : { ...outcome, stoppedBy });
    };
    if (GROUPS) {
      if (agent.stdio[3].readableEnded) complete();
      else agent.stdio[3].once('end', complete);
      return;
    }
    completeAfterGuardianExit = () => {
      if (agent.stdio[3].readableEnded) return complete();
      try {
        JSON.parse(guardianReport);
        return complete();
      } catch {
        // Wait briefly for a report already in the pipe.
      }
    };
    completeAfterGuardianExit();
    if (!settled) {
      agent.stdio[3].once('end', complete);
      setTimeout(complete, 1000);
    }
  });

  if (GROUPS)
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
    for (const name of lines) if (STOPPING.includes(name)) stop(name, { requested: true });
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
  trace('supervisor-enter', `runner=${runnerPidArgument} timeout=${timeoutArgument}`);
  const runnerPid = Number(runnerPidArgument);
  const timeout = Number(timeoutArgument);
  const leader = spawn(process.execPath, [__filename, LEADER_FLAG, String(process.pid), timeoutArgument, command, ...args], {
    stdio: ['inherit', 'inherit', 'inherit', 'pipe', RUNNER_REPORT_FD],
    detached: GROUPS,
  });
  trace('supervisor-leader-spawned', `pid=${leader.pid}`);
  const lifeline = leader.stdio[LIFELINE_FD];
  lifeline.on('error', () => {});
  let heard = '';
  lifeline.setEncoding('utf8');
  let overdue = false;
  let overduePhase = null;
  let ready = false;
  let pending = '';

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
    trace('supervisor-fail', failure);
    write(RUNNER_REPORT_FD, JSON.stringify({ failure }));
    process.exit(0);
  };
  leader.once('error', (error) => fail(`the agent's group leader could not start: ${error.message}`));
  leader.once('exit', () => {
    if (!heard.includes(REPORTED)) killAgentGroup();
  });
  leader.once('close', (status, signal) => {
    trace('supervisor-leader-close', `status=${status} signal=${signal} overdue=${overdue}`);
    if (heard.includes(REPORTED)) return process.exit(0);
    if (overdue) {
      const failure =
        overduePhase === 'setup'
          ? `the agent's group leader gave no report ${WINDOWS_STARTUP_SLACK_MS}ms past the Windows Job Object setup bound`
          : `the agent's group leader gave no report ${BACKSTOP_MS}ms past the agent's ${timeout}ms wall clock`;
      return fail(failure);
    }
    const ending = signal ? `was killed by signal ${signal}` : `exited with code ${status}`;
    return fail(`the agent's group leader ${ending} without reporting how the agent ended`);
  });

  // Setup and agent execution have separate bounds. The wall clock begins
  // only after the leader sees the guardian's real agent PID.
  const backstop = (phase) => {
    if (overdue || heard.includes(REPORTED)) return;
    overdue = true;
    overduePhase = phase;
    try {
      if (GROUPS) process.kill(-leader.pid, 'SIGKILL');
      else leader.kill('SIGKILL');
    } catch {
      // The leader is already gone.
    }
    killAgentGroup();
  };
  lifeline.on('data', (chunk) => {
    trace('supervisor-lifeline-data', chunk);
    heard += chunk;
    pending += chunk;
    const lines = pending.split('\n');
    pending = lines.pop();
    for (const line of lines) {
      if (line !== 'ready' || ready) continue;
      ready = true;
      trace('supervisor-agent-ready', `timeout=${timeout}`);
      after(timeout + BACKSTOP_MS, () => backstop('agent'));
    }
  });
  if (GROUPS) after(timeout + BACKSTOP_MS, () => backstop('agent'));
  else
    after(WINDOWS_SETUP_MS + WINDOWS_STARTUP_SLACK_MS, () => {
      if (!ready) backstop('setup');
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
else if (argv[0] === GUARDIAN_FLAG) guard(argv.slice(1));
else supervise(argv);
