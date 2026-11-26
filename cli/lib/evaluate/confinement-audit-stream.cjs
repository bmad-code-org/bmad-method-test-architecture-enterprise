'use strict';

/**
 * The parent of one `log stream` the Seatbelt audit reads (`confinement-audit.js`), which ends the stream when the runtime ends,
 * however the runtime ends.
 *
 *   confinement-audit-stream.cjs <log executable> [argument ...]
 *
 * macOS cannot tie a child's life to its parent's, and a runtime killed outright (SIGKILL), or one Node aborts, runs no `exit` handler:
 * a `log stream` the runtime started itself then ran on, its parent launchd, until its own `--timeout` of four hours.
 * This process holds the runtime's lifeline on its standard input, a pipe the runtime never writes. The pipe reaches its end when the
 * runtime closes it or when the runtime is gone, whatever ended it, and this process then kills the stream with SIGKILL.
 * The runtime starts this process as the leader of its own process group and ends the stream by killing that group, so a kill that
 * reaches this process reaches the stream too.
 *
 * The stream gets this process's standard output and standard error; a signal this process receives is passed to the stream; this
 * process ends as the stream ended, by its exit code or by its signal. A stream that cannot start ends this process with 127 (not
 * found) or 126 (not runnable), its reason on standard error, as a shell would.
 *
 * The file is also a module for the runtime's tests: required, it starts nothing. It requires nothing of the repository.
 */

const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');

/** The signals this process passes to the stream. */
const FORWARDED = Object.freeze(['SIGTERM', 'SIGINT', 'SIGHUP', 'SIGQUIT', 'SIGUSR1', 'SIGUSR2']);

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
  say(`${command}: ${error.message}`);
  return error.code === 'ENOENT' ? 127 : 126;
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (typeof command !== 'string') {
    say('usage: confinement-audit-stream.cjs <log executable> [argument ...]');
    process.exitCode = 126;
    return;
  }
  let child;
  try {
    child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'] });
  } catch (error) {
    process.exitCode = failedStart(command, error);
    return;
  }
  // A kill through a child Node has already reaped sends nothing, so no other process can take the stream's place here.
  const endStream = () => child.kill('SIGKILL');
  process.stdin.once('end', endStream);
  process.stdin.once('close', endStream);
  process.stdin.once('error', endStream);
  process.stdin.resume();
  for (const name of FORWARDED) process.on(name, () => child.kill(name));
  let failed = false;
  child.once('error', (error) => {
    failed = true;
    process.exitCode = failedStart(command, error);
    process.stdin.destroy();
  });
  // Nothing else holds the event loop once the lifeline is let go, so this process ends once the stream has, with the exit code set here.
  child.once('exit', (code, signal) => {
    process.stdin.destroy();
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

module.exports = { FORWARDED };
