/**
 * The progress heartbeat tea-test-review runs while its agent works.
 *
 * `runAgent` blocks the CLI in `spawnSync` with no streamed output, so a real
 * review prints nothing for minutes and looks hung. Nothing in the CLI's own
 * process can run while it blocks, so the heartbeat is this separate process:
 * it writes one "agent still running" line to the stderr it inherits every
 * interval, until the CLI kills it.
 *
 * It starts no process of its own, so killing it closes that stderr at once.
 * An earlier `sh -c` loop around `sleep` did not: killing the shell orphaned
 * the running `sleep`, which held the CLI's stderr open for up to 15 s after
 * the CLI exited, and every caller reading that stderr through a pipe waited
 * that long for end of file.
 *
 * It also ends itself once the CLI is gone, the same way agent-supervisor.js
 * notices its runner is gone: it gets another parent, or on Windows, the
 * CLI's pid stops answering. A CLI killed by `SIGKILL` cannot kill its
 * heartbeat, and without this check the heartbeat would print forever into
 * whatever still reads that stderr.
 *
 * Usage: node heartbeat.js <parentPid> <intervalSeconds>
 *
 * Exits 64 at once for an interval outside 0.05 to 3600 s.
 */

'use strict';

/** How often the heartbeat checks that the CLI is alive. */
const POLL_MS = 100;

/**
 * The interval range the heartbeat accepts, in seconds. Node fires a timer
 * past 2^31-1 ms, or one given a non-finite delay, after 1 ms, so an interval
 * out of range would print about a line per millisecond.
 */
const MIN_INTERVAL_SECONDS = 0.05;
const MAX_INTERVAL_SECONDS = 3600;

function validInterval(seconds) {
  return Number.isFinite(seconds) && seconds >= MIN_INTERVAL_SECONDS && seconds <= MAX_INTERVAL_SECONDS;
}

function parentGone(parentPid) {
  if (process.platform !== 'win32') return process.ppid !== parentPid;
  try {
    process.kill(parentPid, 0);
    return false;
  } catch (error) {
    return error.code === 'ESRCH';
  }
}

function beat([parentArgument, intervalArgument]) {
  const parentPid = Number(parentArgument);
  const intervalSeconds = Number(intervalArgument);
  if (!Number.isInteger(parentPid) || parentPid < 1 || !validInterval(intervalSeconds)) process.exit(64);
  const started = Date.now();
  const watch = () => {
    if (parentGone(parentPid)) process.exit(0);
  };
  watch();
  setInterval(watch, POLL_MS);
  setInterval(() => {
    const elapsed = Math.round((Date.now() - started) / 1000);
    process.stderr.write(`tea-test-review: agent still running (${elapsed}s elapsed)...\n`);
  }, intervalSeconds * 1000);
}

if (require.main === module) beat(process.argv.slice(2));

module.exports = { MAX_INTERVAL_SECONDS, MIN_INTERVAL_SECONDS, validInterval };
