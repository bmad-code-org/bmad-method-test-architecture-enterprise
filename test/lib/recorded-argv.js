'use strict';

/**
 * The two directions between an engine call's argv as it ran and as its record states it (`cli/lib/evaluate/recorded-paths.js`).
 *
 * A call record names a file inside the evaluation folder by its path below the folder, a private staging file as
 * `<staging>/<name>` and the score invocation's own directory as `<score-invocation>`, so the record names no machine path.
 * A suite that compares a record with the argv a shim logged states the logged argv in the same forms; a suite that reruns
 * the engine on a record resolves the forms back.
 */

const path = require('node:path');

const { SCORE_INVOCATION, STAGING, pathRecorder } = require('../../cli/lib/evaluate/recorded-paths');

/** The argv the record states for a call that ran `argv` over `folder`, in the score invocation `scoreInvocation` when there is one. */
function recordedArgv(argv, { folder, scoreInvocation = null }) {
  const recorder = pathRecorder({ folder, scoreInvocation });
  return argv.map((argument) => recorder.argument(argument));
}

/**
 * The argv a record states, resolved to run: a file below the folder made absolute, `<score-invocation>` replaced by the
 * invocation, and the staging file replaced by `out`.
 */
function runnableArgv(recorded, { folder, scoreInvocation = null, out }) {
  return recorded.map((argument) => {
    if (typeof argument !== 'string') return argument;
    if (argument.startsWith(`${STAGING}/`)) return out;
    if (!argument.startsWith('runs/')) return argument;
    return path.join(folder, ...argument.replaceAll(SCORE_INVOCATION, scoreInvocation ?? SCORE_INVOCATION).split('/'));
  });
}

/** The folder and invocation of a score directory `<folder>/runs/<run>/scores/<scoreInvocationId>`. */
function scoreContext(scoreDirectory) {
  return { folder: path.resolve(scoreDirectory, '..', '..', '..', '..'), scoreInvocation: path.basename(scoreDirectory) };
}

module.exports = { recordedArgv, runnableArgv, scoreContext };
