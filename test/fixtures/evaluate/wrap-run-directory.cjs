/**
 * Preloaded with `node --require` to run `tea-evaluate run` over a run
 * directory whose verification fails at one named point, so the path a run
 * takes when it cannot seal after its last write (a completed `run.json` and
 * `trial-sets.json` already written) is exercised without racing a process
 * against the runtime (Story 1.8, final review round 1).
 *
 * `TEA_EVALUATE_FAIL_VERIFY` names the point: `RunDirectory.verify` throws a
 * `RunDirectoryError` when its `when` argument contains that text, and runs
 * as usual otherwise.
 */

'use strict';

const path = require('node:path');

const { RunDirectory, RunDirectoryError } = require(path.join(__dirname, '..', '..', '..', 'cli', 'lib', 'evaluate', 'run-directory.js'));

const failAt = process.env.TEA_EVALUATE_FAIL_VERIFY;
const verify = RunDirectory.prototype.verify;
RunDirectory.prototype.verify = function verifyOrFail(when) {
  if (failAt && String(when).includes(failAt)) {
    throw new RunDirectoryError(`the run directory is not what the runtime wrote ${when}: an entry planted for the test`);
  }
  return verify.call(this, when);
};
