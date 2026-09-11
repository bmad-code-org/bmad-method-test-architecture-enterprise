/**
 * The clock TEA measures elapsed time with, read through `eval-quality`'s shipped
 * `createSystemClockAdapter` rather than off the wall clock in each harness.
 *
 * Seven harnesses called `Date.now()` directly and each one decided for itself
 * what a duration was. That is thirty-six readings with no boundary, no
 * conformance statement, and no way to script one, so a duration in a `--json`
 * result record was a number no test could ever pin: every assertion about it had
 * to be "some non-negative integer", which is satisfied by a stopped clock.
 *
 * `createSystemClockAdapter` is a real `ClockPort`, and `runClockPortConformance`
 * is the package's own executable statement of what that port must do. TEA now
 * reads through it, `test/test-probe-conformance.js` certifies it, and
 * `test/test-clock-port.js` proves the port is actually in the path.
 *
 * WHY THIS IS INJECTABLE, AND WHAT THAT BUYS
 *
 * A port adopted but never scripted is a port nobody can tell from the thing it
 * replaced. `TEA_CLOCK_FIXTURE` names a file of ISO instants, and when it is set
 * the mechanism handed to the adapter returns them in order instead of reading
 * the system clock. That is the seam the revertibility check uses: it runs a
 * harness under a scripted clock and asserts the recorded `durationMs` is exactly
 * the scripted delta. Replace the port call with `Date.now()` and the variable is
 * ignored, the duration becomes real elapsed time, and the assertion fails.
 *
 * The variable is read once, at module load, so a harness cannot be handed a
 * different clock halfway through a run.
 *
 * WHY EVERY READING IS ASYNCHRONOUS
 *
 * `ClockPort.read` returns a promise, because a port that could only be
 * synchronous would exclude every clock that is not the local process's. So
 * `elapsedMsSince` is awaited at each call site. Where a caller cannot await, it
 * computes the duration in the asynchronous frame above and passes the number
 * down, which is what every harness does with its result record.
 */

'use strict';

const fs = require('node:fs');

/** The adapter module is ESM and this repository is CommonJS, so the import is asynchronous and cached. */
let adapterPromise;

/**
 * The scripted instants, when `TEA_CLOCK_FIXTURE` names a readable file of them.
 *
 * One ISO instant per line, blank lines ignored. Read once at module load so a
 * run cannot change clocks midway. A file that names fewer instants than the run
 * reads is a defect in the fixture rather than something to paper over, so the
 * mechanism throws when it runs out instead of falling back to the system clock:
 * a silent fallback would make the scripted check pass against a real clock,
 * which is the one thing it exists to rule out.
 */
const SCRIPTED = (() => {
  const file = process.env.TEA_CLOCK_FIXTURE;
  if (!file) return null;
  const instants = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (instants.length === 0) throw new Error(`TEA_CLOCK_FIXTURE names ${file}, which declares no instant`);
  return { instants, index: 0 };
})();

/**
 * The mechanism the adapter reads through: the system clock, or the scripted
 * instants when a fixture is named.
 *
 * @param {AbortSignal} [signal]
 * @returns {Promise<string>} An ISO-8601 instant.
 */
async function mechanism(signal) {
  if (signal?.aborted) throw Object.assign(new Error('the clock read was aborted'), { name: 'AbortError' });
  if (SCRIPTED === null) return new Date().toISOString();
  if (SCRIPTED.index >= SCRIPTED.instants.length) {
    throw new Error(
      `the scripted clock has ${SCRIPTED.instants.length} instant(s) and the run asked for one more; the fixture is short, and falling back to the system clock here would let this check pass against the clock it exists to rule out`,
    );
  }
  const instant = SCRIPTED.instants[SCRIPTED.index];
  SCRIPTED.index += 1;
  return instant;
}

/** One `ClockPort`, built on first use. */
async function clockPort() {
  if (adapterPromise === undefined) {
    adapterPromise = import('eval-quality/adapters').then(({ createSystemClockAdapter }) => createSystemClockAdapter(mechanism));
  }
  return adapterPromise;
}

/**
 * The current instant in epoch milliseconds, read through the port.
 *
 * The port answers with an ISO-8601 string, which is the interchange shape a
 * `ClockPort` declares. Callers measuring elapsed time want a number, and
 * converting in one place is what stops seven harnesses each deciding how.
 *
 * @param {AbortSignal} [signal]
 * @returns {Promise<number>}
 */
async function nowMs(signal) {
  const port = await clockPort();
  const response = await port.read({}, signal ?? new AbortController().signal);
  const parsed = Date.parse(response.now);
  if (Number.isNaN(parsed)) throw new Error(`the clock port returned ${JSON.stringify(response.now)}, which is not an ISO-8601 instant`);
  return parsed;
}

/**
 * Milliseconds elapsed since a mark taken by `nowMs`.
 *
 * Clamped at zero. A duration is a non-negative integer in every result record
 * schema TEA writes, and a clock that stepped backwards would otherwise fail the
 * record's own parse with a message about the schema rather than about the clock.
 *
 * @param {number} markMs A value from `nowMs`.
 * @param {AbortSignal} [signal]
 * @returns {Promise<number>}
 */
async function elapsedMsSince(markMs, signal) {
  return Math.max(0, Math.round((await nowMs(signal)) - markMs));
}

/**
 * The current instant as an ISO-8601 string, read through the port.
 *
 * Every result record carries a `generatedAt`, and it used to come from
 * `new Date().toISOString()` inside `test/lib/eval-record.js`. Under a scripted
 * clock that produced a record whose durations were scripted and whose stamp was
 * real, describing a run that began in March and was generated in September, and
 * nothing in the schema objected. A record states one run and it reads one clock.
 *
 * @param {AbortSignal} [signal]
 * @returns {Promise<string>}
 */
async function nowIso(signal) {
  const port = await clockPort();
  const response = await port.read({}, signal ?? new AbortController().signal);
  return response.now;
}

/** Whether this process is running on a scripted clock, which only the checks that script one should be. */
function isScripted() {
  return SCRIPTED !== null;
}

module.exports = { nowMs, nowIso, elapsedMsSince, isScripted, clockPort };
