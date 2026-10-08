/**
 * The before state of an evaluation: `tea-evaluate run --before-state` records a run whose clean controls are declared
 * known-failing, so an adopter evaluating a skill with known defects can measure its starting point with `run`.
 *
 * A clean control declares the defect in its attestation: a `noKnownDefectStatement` that begins with
 * `Known defect at this revision:`. eval-quality records that string without reading it, so the declaration is TeA's
 * own convention, and what it unlocks is small: the run does not stop with exit 11 on that control's failing baseline.
 * Every verdict still comes from `eval-quality score` (AD-6); the failing control scores `false-positive`.
 *
 * A before state is never a baseline. `run.json` records it under `beforeState`, and `compare` and `compare --accept`
 * refuse such a run; they also refuse any run whose sealed clean control still declares a known defect, so a run.json
 * edited by hand cannot launder the record.
 */

'use strict';

const KNOWN_DEFECT_PREFIX = 'Known defect at this revision:';

/** Whether `probe` is a clean control whose attestation declares a known defect. */
function declaresKnownDefect(probe) {
  const qualification = probe?.qualification;
  return (
    qualification?.route === 'clean-control' &&
    typeof qualification.noKnownDefectStatement === 'string' &&
    qualification.noKnownDefectStatement.trimStart().startsWith(KNOWN_DEFECT_PREFIX)
  );
}

/**
 * Whether a clean control may fail its baseline under `--before-state`: it declares a known defect, and every oracle of its
 * behavior decided (held or violated) with at least one violated. An oracle that could not decide stays a weakness of the
 * evaluation, so a control with one still stops the run.
 */
function mayFailBaseline(probe, oracles) {
  return (
    declaresKnownDefect(probe) &&
    oracles.length > 0 &&
    oracles.every((oracle) => oracle.disposition === 'held' || oracle.disposition === 'violated') &&
    oracles.some((oracle) => oracle.disposition === 'violated')
  );
}

/** The sentence a before-state run, its `score` and its refusals share. */
const NOT_A_BASELINE = 'a before state is never accepted as a baseline';

/** What the run's closing message and `score` add for a before-state `run.json` entry, or '' when it holds none. */
function beforeStateNote(beforeState) {
  if (beforeState === null || typeof beforeState !== 'object') return '';
  const controls = Array.isArray(beforeState.controls) ? beforeState.controls : [];
  const failing = controls.filter((control) => control.baseline === 'violated').map((control) => control.probeId);
  const passing = controls.filter((control) => control.baseline === 'held').map((control) => control.probeId);
  return (
    `; BEFORE STATE: ${failing.length} clean control(s) recorded as known-failing (${failing.join(', ') || 'none'}), so ${NOT_A_BASELINE}` +
    (passing.length === 0
      ? ''
      : `; ${passing.join(', ')} ${passing.length === 1 ? 'declares' : 'declare'} a known defect yet ${passing.length === 1 ? 'its' : 'their'} baseline passed, so update the statement once the defect is fixed`)
  );
}

module.exports = { KNOWN_DEFECT_PREFIX, NOT_A_BASELINE, beforeStateNote, declaresKnownDefect, mayFailBaseline };
