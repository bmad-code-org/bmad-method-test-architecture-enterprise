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
 */

'use strict';

/** How often the heartbeat checks that the CLI is alive. */
const POLL_MS = 100;

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
  if (!Number.isInteger(parentPid) || parentPid < 1 || !(intervalSeconds > 0)) process.exit(64);
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
