/**
 * The comparison of an `eval-quality score` call with the inputs it was held to (Story 1.68, 1.69, AD-6, AD-7, AD-12).
 *
 * `tea-evaluate score` scores every probe of a sealed run.
 * `tea-evaluate run` scores every attempt of a sealed-brief agent evaluator's qualification (`scoreAttempt` in `run.js`).
 * Both hold the bytes of the call's inputs (`score-inputs.js`), run the engine's CLI, and compare what the call did with what the held bytes give.
 * This module is the one place that comparison and its wording live.
 * It is also the one file that asks `HeldInputs.reproduce` for the in-process score (`test:evaluate-boundaries` holds that call site).
 * `score.js` requires `run.js`, so `run.js` cannot require `score.js`, and the comparison sits here for both.
 *
 * The comparison only refuses.
 * It supplies no verdict, exit code, vote or artifact (AD-6, amended 2026-10-01).
 */

'use strict';

const fs = require('node:fs');

const { DIAGNOSTIC_PREFIX, regularFileBytes } = require('./score-inputs');

/** The lines of `text` that start an `eval-quality: ` diagnostic. */
function diagnosticLines(text) {
  return text.split('\n').filter((line) => line.startsWith(DIAGNOSTIC_PREFIX));
}

/**
 * Why a call's result is not the one the held inputs stand behind, or null (Story 1.68): an input changed or appeared
 * since the check (named first), or the call is not what the CLI does with the held bytes. That is the staged artifact
 * (byte for byte; an absent file must match a result with no artifact, whatever the call exited), then the call's exit,
 * then the `eval-quality: ` lines on its stderr that explain an Invalid result (AD-10 classifies an exit 3 from them),
 * when the library gives them. The comparison only refuses; it never decides.
 */
async function heldRefusal({ held, set, staged, exitCode, stderr }) {
  const changed = held.changedSince();
  if (changed !== null) return `${changed.relative} ${changed.message}`;
  const expected = await held.reproduce(set);
  if (expected.artifact === null) {
    if (staged.bytes !== null) return 'the staged evidence artifact is not the result of the verified inputs, which produce no artifact';
  } else if (staged.bytes === null) {
    return 'the call staged no evidence artifact, and the verified inputs produce one';
  } else if (!expected.artifact.equals(staged.bytes)) {
    return 'the staged evidence artifact differs from the one the verified inputs produce (an in-process score of the held bytes)';
  }
  // A call that could not run or was killed has no exit of its own to compare.
  if (exitCode !== null && exitCode !== expected.exitCode) {
    return `the call exited ${exitCode} where the verified inputs give ${expected.exitCode} (an in-process score of the held bytes)`;
  }
  if (expected.lines !== null && exitCode !== null) {
    // The CLI writes each line plus a newline and keeps any newline inside it (a mount path or a key can carry one), so
    // both sides go through the same split before the prefixed pieces are compared.
    const printed = diagnosticLines(stderr);
    if (JSON.stringify(printed) !== JSON.stringify(diagnosticLines(expected.lines.map((line) => `${line}\n`).join('')))) {
      return "the call's eval-quality diagnostics differ from those the verified inputs give (an in-process score of the held bytes)";
    }
  }
  return null;
}

/** The staged artifact's bytes (null when the call wrote none), read as a regular file without following a link. */
function stagedArtifact(file) {
  let stats;
  try {
    stats = fs.lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return { bytes: null };
    return { problem: `cannot be examined: ${error.message}` };
  }
  if (!stats.isFile()) return { problem: 'is a link or a non-file entry' };
  try {
    return { bytes: regularFileBytes(file) };
  } catch (error) {
    return { problem: `cannot be read: ${error.message}` };
  }
}

module.exports = { heldRefusal, stagedArtifact };
