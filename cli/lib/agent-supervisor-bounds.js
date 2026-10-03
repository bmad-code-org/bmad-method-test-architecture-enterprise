'use strict';

/** The leader's grace period and slack beyond the agent timeout. */
const SUPERVISOR_BACKSTOP_MS = 5000;
/** POSIX watchdog setup and cold Node startup precede the agent wall clock. */
const POSIX_SETUP_MS = 10_000;
const POSIX_STARTUP_SLACK_MS = 15_000;
/** Windows Job Object setup has a separate clock before the agent starts. */
const WINDOWS_SETUP_MS = 90_000;
/** Allows cold Node startup before the guardian's setup timer begins. */
const WINDOWS_STARTUP_SLACK_MS = 15_000;

/** Reserve the supervisor's startup and cleanup clocks for a synchronous agent call. */
function supervisedAgentCeilingMs(timeoutMs, platform = process.platform) {
  return (
    timeoutMs +
    SUPERVISOR_BACKSTOP_MS +
    (platform === 'win32' ? WINDOWS_SETUP_MS + WINDOWS_STARTUP_SLACK_MS : POSIX_SETUP_MS + POSIX_STARTUP_SLACK_MS)
  );
}

module.exports = {
  SUPERVISOR_BACKSTOP_MS,
  POSIX_SETUP_MS,
  POSIX_STARTUP_SLACK_MS,
  WINDOWS_SETUP_MS,
  WINDOWS_STARTUP_SLACK_MS,
  supervisedAgentCeilingMs,
};
