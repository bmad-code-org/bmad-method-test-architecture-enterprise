/**
 * One value held against the `eval-quality` vocabulary that publishes it.
 *
 * `eval-quality` exports five closed vocabularies off its root barrel:
 * `FAILURE_CODES`, `RUNTIME_FAULT_CODES`, `QUALIFICATION_FAILURES`, `VERDICTS`
 * and `EVALUATOR_RECOMMENDATIONS`. TEA reads members of all five off package
 * artifacts and writes members of two back into them, and until this function
 * existed it did all of that against string literals somebody had transcribed.
 * No TEA file referenced a single one of the registries, so a code renamed
 * upstream stopped matching in silence: `failureClassForFault` fell through to
 * its default class, `failureShape` recorded the string `unknown`, and every
 * check downstream stayed green over a vocabulary that had moved.
 *
 * Three things every message here does, because a membership failure is read by
 * somebody who does not yet know which side moved. It names the vocabulary, so
 * the reader knows which registry to open. It quotes the offending value, so a
 * value that is nearly right is visibly nearly right. And it lists what the
 * registry actually publishes, so the rename is in the message rather than a
 * second lookup away.
 *
 * WHY THE REGISTRIES ARE PASSED IN
 *
 * This module imports nothing. `eval-quality` is ESM and this repository is
 * CommonJS, so reaching the registries from here would make every membership
 * check asynchronous and would put a second module resolution between the caller
 * and the values it is holding. The caller already has the barrel it read the
 * value from, and passing the registries keeps the check pure, synchronous, and
 * anchored to the same resolution the value came from. That is the shape
 * `test/lib/conformance-counts.js` established for the same reason.
 *
 * WHY A RECORD RATHER THAN AN ARRAY
 *
 * The registries arrive keyed by their export names, which is what lets the
 * message name the vocabulary without the caller restating it: `publishedMember({
 * VERDICTS }, ...)` in shorthand carries the package's own spelling into the
 * error text, and a caller cannot label one registry with another's name.
 *
 * It also makes the union case one shape rather than a second function. A
 * compile fault carries a code from `RUNTIME_FAULT_CODES` when the compiler
 * threw a `RuntimeFault` and from `FAILURE_CODES` when it threw a
 * `StructuralFailure`, and the caller holding the thrown error is not always the
 * one that knows which. Passing both registries holds the code against their
 * union and names both in the failure.
 *
 * FOUR FAILURES, KEPT APART
 *
 * They are separate for the reason `conformance-counts.js` keeps its three
 * apart: each sends a reader somewhere different. A registry that is not an
 * array at all is an export that moved, and naming the value there would be a
 * misreading one level up. A registry that is published and empty can vouch for
 * nothing, and reporting the value as unpublished would send a reader to look at
 * a value that is fine. A value that is not a string is the field TEA read
 * having changed shape rather than a vocabulary having moved. Only the fourth is
 * a genuine membership failure.
 *
 * It throws rather than returning a sentinel or a boolean. Every caller is
 * reading a value it is about to branch on, record into a baseline, or hand back
 * to the package, so a caller that carried on with a sentinel would be doing one
 * of those with a value nothing vouches for. That is the `unknown` string this
 * function exists to remove, arriving by another route.
 *
 * `test/test-port-totality.js` holds TEA's recognised members of all five
 * registries through this function and drives every one of the four failures
 * rather than describing them.
 */

'use strict';

/**
 * @param {Record<string, unknown>} registries - The package's own registries, keyed by their export names.
 * @param {unknown} value - The value to hold against their union.
 * @param {string} source - Where TEA read or wrote the value, for the message.
 * @returns {string} The value, when it is a published member.
 */
function publishedMember(registries, value, source) {
  if (registries === null || typeof registries !== 'object' || Object.keys(registries).length === 0) {
    throw new Error(
      `no eval-quality registry was supplied to hold ${source} against; the argument is ${String(registries)}. ` +
        'A membership check with no vocabulary behind it holds nothing, so it refuses rather than passing every value.',
    );
  }

  const names = Object.keys(registries).sort();
  // `Array.isArray` rather than a truthiness test, because the package publishes
  // these as plain arrays and every other shape means the export moved: a
  // renamed registry reads as `undefined` here, and a registry that became an
  // object or a Set would otherwise be iterated into a member list nobody
  // published.
  const notArrays = names.filter((name) => !Array.isArray(registries[name]));
  if (notArrays.length > 0) {
    throw new Error(
      `eval-quality published no ${notArrays.join(' and no ')} to hold ${source} against; ` +
        `${notArrays.map((name) => `${name} is ${String(registries[name])}`).join(', ')}. ` +
        'The registry itself was renamed or withdrawn upstream, so no value can be looked up and the value being checked is not the problem.',
    );
  }

  const published = [...new Set(names.flatMap((name) => registries[name]))].sort();
  // A published-but-empty registry fails every value, which is the correct
  // outcome and the wrong message: it would report each value as unpublished and
  // send a reader to look at values that are fine. It is also the shape a
  // membership check passes vacuously in the other direction, where a ledger
  // holds its own members against a registry that lists none.
  if (published.length === 0) {
    throw new Error(
      `eval-quality publishes ${names.join(' and ')} with no members at all, so ${source} can be held against nothing. ` +
        'A registry that lists nothing vouches for nothing, and the value being checked is not the problem.',
    );
  }

  if (typeof value !== 'string') {
    // A TypeError rather than an Error, because this branch is exactly a type
    // check: the vocabulary is intact and the field handed to it is not a string.
    //
    // `JSON.stringify` rather than `String`, and with a fallback of its own:
    // `String({})` renders every plain object as the same useless
    // `[object Object]`, which defeats the "quotes the offending value" promise
    // this module opens with for exactly the shape most worth seeing quoted.
    // `JSON.stringify` itself answers `undefined` (the value, not a string) for
    // `undefined`, so the fallback covers the one input it cannot render.
    const rendered = JSON.stringify(value) ?? String(value);
    throw new TypeError(
      `${source} is ${rendered}, which is not a string and so is no member of ${names.join(' or ')}. ` +
        'The field TEA read has changed shape rather than the vocabulary having moved.',
    );
  }

  if (!published.includes(value)) {
    throw new Error(
      `${source} is ${JSON.stringify(value)}, which eval-quality's ${names.join(' and ')} does not publish. ` +
        `It publishes ${published.join(', ')}. ` +
        'A value in no registry is a vocabulary that moved upstream, and recording it anyway is what makes the move silent.',
    );
  }

  return value;
}

module.exports = { publishedMember };
