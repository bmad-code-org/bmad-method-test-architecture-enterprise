/**
 * Proof that `test/eval-atdd.js`'s `scoreRun` requires a real Playwright
 * assertion behind a "red for the intended reason" verdict, not just message
 * text that happens to match the criterion's declared pattern.
 *
 * Playwright's JSON reporter carries no field that separates an `expect()`
 * matcher failure from a plain thrown `Error`: both land in the same
 * `result.error.message` string (verified live against a real Playwright run
 * across `toBe`, `toEqual` and `toContain`). A criterion's `declaredPattern`
 * is usually the literal "Expected: X" / "Received: Y" text an assertion
 * failure prints, and a hand-thrown `Error` can reproduce that same text with
 * no assertion behind it at all. `scoreRun` closes that gap by also requiring
 * the message to carry the `expect(` marker every real matcher failure
 * prints; this proves the requirement is actually enforced, on synthetic
 * reports built directly rather than through the full staged corpus.
 *
 * Usage: node test/test-atdd-scoring.js
 * Exit codes: 0 every property held, 1 a property did not hold
 */

'use strict';

const { declaredCriterionId, loadGroundTruth, scoreRun } = require('./eval-atdd');

const colors = { reset: '[0m', red: '[31m', green: '[32m', dim: '[2m' };
let failures = 0;

function assert(condition, label, detail) {
  if (condition) {
    console.log(`  ${colors.green}✓${colors.reset} ${label}`);
    return;
  }
  failures += 1;
  console.log(`  ${colors.red}✗ ${label}${colors.reset}`);
  if (detail) console.log(`    ${colors.dim}${detail}${colors.reset}`);
}

/** One file, one test, against AC-1: message and status are what a real red-check report would carry. */
function reportFor(message) {
  return {
    files: [
      {
        file: 'tests/api/reservations.spec.ts',
        loadError: null,
        hadSkipCall: true,
        tests: [{ title: '[P0] AC-1 reserving a free locker creates it', status: 'failed', message }],
      },
    ],
  };
}

function main() {
  console.log('scoreRun requires assertion provenance, not just message text\n');

  const groundTruth = loadGroundTruth();
  if (!groundTruth) {
    console.error(`${colors.red}could not load the atdd ground truth${colors.reset}`);
    process.exit(2);
  }

  const realAssertion = 'Error: expect(received).toBe(expected) // Object.is equality\n\nExpected: 201\nReceived: 404';
  const declaredIds = new Set(groundTruth.criteria.map(({ id }) => id));
  assert(declaredCriterionId('[P0] AC-1 one criterion', declaredIds) === 'AC-1', 'one declared criterion id maps');
  assert(declaredCriterionId('[P0] no criterion', declaredIds) === null, 'a title with no criterion id does not map');
  assert(declaredCriterionId('[P0] AC-1 AC-2 two criteria', declaredIds) === null, 'a title with multiple criterion ids does not map');
  assert(declaredCriterionId('[P0] AC-1 AC-1 repeated criterion', declaredIds) === null, 'a repeated criterion id does not map');
  assert(declaredCriterionId('[P0] AC-999 undeclared criterion', declaredIds) === null, 'an undeclared criterion id does not map');
  const scoredReal = scoreRun(groundTruth, reportFor(realAssertion), []);
  const ac1Real = scoredReal.perCriterion.find((entry) => entry.id === 'AC-1');
  assert(
    ac1Real?.outcome === 'red-for-intended-reason',
    'a real expect() failure matching the declared pattern scores red-for-intended-reason',
    JSON.stringify(ac1Real),
  );

  const forgedThrow = 'Error: Expected: 201\nReceived: 404';
  const scoredForged = scoreRun(groundTruth, reportFor(forgedThrow), []);
  const ac1Forged = scoredForged.perCriterion.find((entry) => entry.id === 'AC-1');
  assert(
    ac1Forged?.outcome === 'non-assertion-exit',
    'a hand-thrown Error reproducing the same text, with no expect() behind it, does not score red-for-intended-reason',
    JSON.stringify(ac1Forged),
  );

  console.log('');
  if (failures > 0) {
    console.log(`${colors.red}${failures} propert${failures === 1 ? 'y' : 'ies'} did not hold.${colors.reset}\n`);
    process.exit(1);
  }
  console.log(`${colors.green}assertion provenance is enforced.${colors.reset}\n`);
}

main();
