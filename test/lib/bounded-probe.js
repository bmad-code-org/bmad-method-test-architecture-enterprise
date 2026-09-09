/**
 * Bounded environment probes.
 *
 * Three kinds of probe interrogate the environment rather than a system under
 * test, so `eval-quality`'s command adapter does not cover them: a runner's
 * `--version`, a `git` question about the working tree, and the macOS keychain
 * lookup that says whether a vendor has a stored login. Every one of them was a
 * bare `spawnSync` with no timeout, which is a hang with nowhere to report it:
 * a pre-flight exists to fail fast before a paid matrix starts, and a pre-flight
 * that blocks forever is worse than one that fails, because CI shows a job
 * running rather than a job broken.
 *
 * This is the bounded helper the command-adapter design note says they need. It
 * is deliberately small: one `spawnSync` with a deadline and a killSignal, and
 * one shape of answer, so a caller can tell a timeout from a non-zero exit from
 * an executable that is not there.
 */

'use strict';

const { spawnSync } = require('node:child_process');

/**
 * Ten seconds. Every probe here answers from local state: a version string a
 * CLI prints without a network call, a `git status` over a checkout, a keychain
 * item. A second is the honest scale and ten is generous enough that a cold
 * filesystem cache or a laptop under load does not produce a false timeout.
 */
const PROBE_TIMEOUT_MS = 10_000;

/**
 * Run one bounded probe.
 *
 * SIGKILL rather than the default SIGTERM: a probe that ignored SIGTERM is
 * exactly the hang this exists to end, and there is nothing for it to clean up.
 *
 * @param {string} executable
 * @param {string[]} args
 * @param {object} [options]
 * @param {number} [options.timeoutMs]
 * @param {string} [options.cwd]
 * @returns {{ok: true, stdout: string, stderr: string}
 *          |{ok: false, reason: 'timeout'|'not-found'|'failed', detail: string, status: number|null}}
 */
function boundedProbe(executable, args, { timeoutMs = PROBE_TIMEOUT_MS, cwd } = {}) {
  const result = spawnSync(executable, args, {
    encoding: 'utf8',
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
    ...(cwd === undefined ? {} : { cwd }),
  });

  // A killed probe reports the timeout through `error.code` on some platforms
  // and through the signal alone on others, so both are read.
  if (result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGKILL') {
    return { ok: false, reason: 'timeout', detail: `${executable} did not answer within ${timeoutMs}ms and was killed`, status: null };
  }
  if (result.error) {
    return {
      ok: false,
      reason: 'not-found',
      detail: `${executable} could not be run (${result.error.code ?? result.error.message})`,
      status: null,
    };
  }
  if (result.status !== 0) {
    return { ok: false, reason: 'failed', detail: `${executable} exited ${result.status}`, status: result.status };
  }
  return { ok: true, stdout: String(result.stdout ?? ''), stderr: String(result.stderr ?? '') };
}

module.exports = { PROBE_TIMEOUT_MS, boundedProbe };
