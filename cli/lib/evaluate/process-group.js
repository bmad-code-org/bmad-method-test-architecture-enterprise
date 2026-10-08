/**
 * Ends the child processes a command started, each the leader of a process group of its own.
 *
 * A gate, the conformance run and an eval-quality stage run as detached children, so a signal that reaches
 * `tea-evaluate` alone (a `kill` of its pid, a runner that stops one process) ends them through their groups
 * and no descendant outlives the command. A SIGKILL of `tea-evaluate` itself runs no handler, and no portable
 * parent-death signal exists, so it leaves a running child in its group.
 */

'use strict';

/**
 * Signals the process group `child` leads (the child itself where groups do not exist). A group that is gone is not an
 * error, and neither is one whose members have all ended and wait to be reaped: macOS answers EPERM for it.
 */
function signalGroup(child, signal) {
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH' && error.code !== 'EPERM') throw error;
  }
}

/** Blocks for `milliseconds`; for a signal handler about to end the process, which cannot await. */
function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

/**
 * Ends every child in `children`: `signal` goes to its process group first and, once `graceMs` has passed (a wait that
 * blocks, since the caller is a signal handler about to end the process), SIGKILL follows. The set is empty afterwards.
 */
function stopGroups(children, signal, graceMs) {
  if (children.size === 0) return;
  for (const child of children) signalGroup(child, signal);
  if (signal !== 'SIGKILL') {
    sleepSync(graceMs);
    for (const child of children) signalGroup(child, 'SIGKILL');
  }
  children.clear();
}

module.exports = { signalGroup, sleepSync, stopGroups };
