'use strict';

/**
 * The parent of one `log stream` the Seatbelt audit reads (`confinement-audit.js`), which ends the stream, and every process the
 * stream's executable started (a wrapper's real `log`), when the runtime ends, however the runtime ends.
 *
 *   confinement-audit-stream.cjs <log executable> [argument ...]
 *   confinement-audit-stream.cjs --watch <pid>[,<pid> ...] <log executable> [argument ...]
 *
 * macOS cannot tie a child's life to its parent's, and a runtime killed outright (SIGKILL), or one Node aborts, runs no `exit` handler:
 * a `log stream` the runtime started itself then ran on, its parent launchd, until its own `--timeout`.
 *
 * A trial's stream holds the runtime's lifeline on this process's standard input, a pipe the runtime never writes. The runtime starts
 * this process as the leader of its own process group, with the stream in that group. The pipe reaches its end when the runtime
 * closes it or when the runtime is gone, whatever ended it, and this process then kills its whole group with SIGKILL, itself included.
 * The runtime ends a stream by killing the group too.
 *
 * The observer probe at selection runs synchronously, from a shell that cannot hand a pipe on, so its stream is started `--watch`ing
 * the runtime's process id and the shell's: the stream runs as the leader of a group of its own, and once either process is gone
 * this process kills that group. A signal it receives (the shell's `kill` once the probe is decided) goes to the stream's group.
 *
 * The stream gets this process's standard output and standard error, and this process ends as the stream ended, by its exit code or
 * by its signal. A stream that cannot start ends this process with 127 (not found) or 126 (not runnable), its reason on standard
 * error, as a shell would.
 *
 * The file is also a module for the runtime's tests: required, it starts nothing. It requires nothing of the repository.
 */

const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');

/** The signals this process passes to the stream. */
const FORWARDED = Object.freeze(['SIGTERM', 'SIGINT', 'SIGHUP', 'SIGQUIT', 'SIGUSR1', 'SIGUSR2']);

/** How often a `--watch`ing guard looks for the processes it watches. */
const WATCH_MS = 100;

/** The words a shell gives the start failures a missing or unrunnable executable causes. */
const START_REASONS = Object.freeze({ ENOENT: 'No such file or directory', EACCES: 'Permission denied' });

/** Writes to standard error through the descriptor, which the stream shares. */
function say(text) {
  try {
    fs.writeSync(2, `${text}\n`);
  } catch {
    // A closed standard error has no reader to tell.
  }
}

/** Says why the stream did not start and returns the exit code that tells it: 127 not found, 126 anything else. */
function failedStart(command, error) {
  say(`${command}: ${START_REASONS[error.code] ?? error.message} (${error.message})`);
  return error.code === 'ENOENT' ? 127 : 126;
}

/**
 * The arguments of a guard call: the process ids it watches (empty for a guard that holds a lifeline), the stream's executable and
 * its arguments; `null` for a call that names no executable or watches something that is no process id.
 *
 * @param {string[]} argv the arguments after the script's path
 * @returns {{ watched: number[], command: string, args: string[] } | null}
 */
function parseArguments(argv) {
  let rest = argv;
  let watched = [];
  if (rest[0] === '--watch') {
    watched = String(rest[1] ?? '')
      .split(',')
      .map(Number);
    if (watched.length === 0 || !watched.every((pid) => Number.isInteger(pid) && pid > 1)) return null;
    rest = rest.slice(2);
  }
  const [command, ...args] = rest;
  if (typeof command !== 'string' || command === '') return null;
  return { watched, command, args };
}

/** Whether process `pid` still runs. */
function running(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/** Sends `signal` to process group `group`; a group that is gone has nothing to end. */
function signalGroup(group, signal) {
  try {
    process.kill(-group, signal);
    return true;
  } catch {
    return false;
  }
}

function main() {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed === null) {
    say('usage: confinement-audit-stream.cjs [--watch <pid>[,<pid> ...]] <log executable> [argument ...]');
    process.exitCode = 126;
    return;
  }
  const { watched, command, args } = parsed;
  const watching = watched.length > 0;
  let child;
  try {
    // A watched stream leads a group of its own; a lifeline's stream stays in this process's group, which the runtime made.
    child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'], detached: watching });
  } catch (error) {
    process.exitCode = failedStart(command, error);
    return;
  }
  let timer = null;
  // The stream and every process it started. A group outlives its leader while any member runs, and its id is not reused meanwhile.
  const endAll = () => {
    if (watching) {
      if (Number.isInteger(child.pid)) signalGroup(child.pid, 'SIGKILL');
    } else if (!signalGroup(process.pid, 'SIGKILL')) child.kill('SIGKILL');
  };
  if (watching) {
    timer = setInterval(() => {
      if (!watched.every((pid) => running(pid))) endAll();
    }, WATCH_MS);
  } else {
    process.stdin.once('end', endAll);
    process.stdin.once('close', endAll);
    process.stdin.once('error', endAll);
    process.stdin.resume();
  }
  for (const name of FORWARDED)
    process.on(name, () => {
      if (!watching || !Number.isInteger(child.pid) || !signalGroup(child.pid, name)) child.kill(name);
    });
  let failed = false;
  child.once('error', (error) => {
    failed = true;
    clearInterval(timer);
    process.exitCode = failedStart(command, error);
    process.stdin.destroy();
  });
  // Nothing else holds the event loop once the lifeline is let go, so this process ends once the stream has, with the exit code set here.
  child.once('exit', (code, signal) => {
    clearInterval(timer);
    process.stdin.destroy();
    // What the stream's executable left in its group (a wrapper's real `log`) ends with it.
    if (watching) signalGroup(child.pid, 'SIGKILL');
    if (failed) return;
    if (signal === null) {
      process.exitCode = code ?? 1;
      return;
    }
    for (const name of FORWARDED) process.removeAllListeners(name);
    // Node starts with SIGPIPE and SIGXFSZ ignored; a listener added and removed again returns a signal to its default action, which ends this process by it.
    if (signal !== 'SIGKILL' && signal !== 'SIGSTOP') {
      process.on(signal, () => {});
      process.removeAllListeners(signal);
    }
    // A signal that leaves this process running ends it as a shell reports a signalled child: 128 plus the signal's number.
    process.exitCode = 128 + (os.constants.signals[signal] ?? 0);
    process.kill(process.pid, signal);
  });
}

if (require.main === module) main();

module.exports = { FORWARDED, parseArguments };
