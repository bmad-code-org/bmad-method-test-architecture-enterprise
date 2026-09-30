'use strict';

/**
 * The process Bubblewrap starts in a target's place (Story 1.31,
 * `confinement.js`): it runs the target with its own standard streams and
 * environment and ends as the target ended, and when a signal ended the
 * target it first writes that signal to the status file the runtime named;
 * before it starts the target it writes `started` there, so the runtime can tell
 * a target that never started (Bubblewrap could not set up) from one that ran.
 *
 * Bubblewrap forks the command it confines and exits `128 + n` when a signal
 * `n` ended it, so without this file a target a signal stopped would read as
 * one that exited with a code of its own, and a crash or a kill would be
 * judged as the target's behavior where the runtime reads a target that could
 * not run. Seatbelt runs the command in place and needs none of this.
 *
 *   confinement-status.cjs <status file> <target> [argument ...]
 *
 * A signal this process receives is passed to the target. A target that
 * cannot start ends this process with 127 (not found) or 126 (not runnable),
 * as a shell would, its reason on standard error.
 */

const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');

const [statusFile, target, ...args] = process.argv.slice(2);
const FORWARDED = ['SIGTERM', 'SIGINT', 'SIGHUP', 'SIGQUIT', 'SIGUSR1', 'SIGUSR2'];

// The mark that this process ran: Bubblewrap that fails before starting it leaves the file empty, which the runtime
// reads as a target that never started and not as one that exited with Bubblewrap's own code.
try {
  fs.writeFileSync(statusFile, `${JSON.stringify({ started: true })}\n`);
} catch {
  // The runtime then reads the call as one that never started.
}
const child = spawn(target, args, { stdio: 'inherit' });
for (const name of FORWARDED) process.on(name, () => child.kill(name));
child.once('error', (error) => {
  process.stderr.write(`${target}: ${error.message}\n`);
  process.exitCode = error.code === 'ENOENT' ? 127 : 126;
});
// Nothing else holds the event loop, so this process ends once the target has, with the exit code set here.
child.once('exit', (code, signal) => {
  if (signal === null) {
    process.exitCode = code ?? 1;
    return;
  }
  try {
    fs.writeFileSync(statusFile, `${JSON.stringify({ started: true, signal })}\n`);
  } catch {
    // The runtime then reads Bubblewrap's own exit, 128 plus the signal's number.
  }
  for (const name of FORWARDED) process.removeAllListeners(name);
  // A signal this process ignores or handles by default (SIGPIPE, SIGUSR1 starts Node's inspector) leaves it running,
  // so it then ends as a shell reports a signalled child: 128 plus the signal's number.
  process.exitCode = 128 + (os.constants.signals[signal] ?? 0);
  process.kill(process.pid, signal);
});
