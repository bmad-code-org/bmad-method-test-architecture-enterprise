/**
 * `test/lib/compare-dominance.js`'s `compareStoredResults`, proven against a
 * fixture pair per relation `eval-quality`'s `DOMINANCE_RELATIONS` declares,
 * plus the key-boundary refusal AC1 asks for and the `strength.comparable`
 * honouring AC1 asks for beside it.
 *
 * `test/fixtures/dominance/comparable-results.json` is hand-authored rather
 * than drawn from a real probe corpus: `compareDominance`'s own component
 * comparison and severity-floor override are `eval-quality`'s to prove, not
 * TEA's to re-prove. What TEA needs proven is narrower and specific to this
 * wiring: that each of the four relations the type declares really is
 * reachable through this file's fixtures, that a comparabilityKey mismatch
 * is refused rather than folded into `'incomparable'` as if it were a fifth
 * ordinary verdict, and that a `strength.comparable: false` side is left to
 * the package's own check rather than overridden by this wrapper.
 *
 * Usage: node test/test-compare-dominance.js
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { compareStoredResults } = require('./lib/compare-dominance');
const { loadEvalQuality, scoringPolicy } = require('./lib/eval-quality-inputs');
const { publishedMember } = require('./lib/vocabularies');

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'dominance', 'comparable-results.json');

const colors = { reset: '[0m', red: '[31m', green: '[32m' };

const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function loadFixtures() {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
}

/** Every fixture whose top-level key names a `DOMINANCE_RELATIONS` value, keyed by that value. */
function relationFixtures(fixtures) {
  const { aDominatesB, bDominatesA, equivalent, incomparableNeitherDominates } = fixtures;
  return {
    'a-dominates-b': aDominatesB,
    'b-dominates-a': bDominatesA,
    equivalent,
    incomparable: incomparableNeitherDominates,
  };
}

async function checkEachDeclaredRelationIsReachable(fixtures, severityFloor, registries) {
  const byRelation = relationFixtures(fixtures);
  for (const relation of registries.DOMINANCE_RELATIONS) {
    const fixture = byRelation[relation];
    check(
      fixture !== undefined,
      `DOMINANCE_RELATIONS publishes "${relation}" and no fixture declares it; the fixture set is not exhaustive`,
    );
    if (fixture === undefined) continue;
    const held = publishedMember(registries, fixture.declaredRelation, `${relation} fixture's own declared relation`);
    check(
      held === relation,
      `the ${relation} fixture's declaredRelation reads "${fixture.declaredRelation}" after being held to the vocabulary, expected "${relation}"`,
    );
    const result = await compareStoredResults(fixture.a, fixture.b, severityFloor);
    check(result.ok === true, `the ${relation} fixture was refused (${result.ok === false ? result.reason : ''}) rather than compared`);
    if (result.ok) {
      check(result.relation === relation, `the ${relation} fixture compared as "${result.relation}", expected "${relation}"`);
    }
  }
}

async function checkKeyBoundaryIsRefusedNotVerdicted(fixtures, severityFloor) {
  const { a, b } = fixtures.keyBoundaryRefused;
  check(
    a.comparabilityKey !== b.comparabilityKey,
    'the keyBoundaryRefused fixture must itself carry two different comparabilityKey values to test anything',
  );
  const result = await compareStoredResults(a, b, severityFloor);
  check(result.ok === false, 'a comparabilityKey mismatch returned a verdict instead of a refusal');
  if (result.ok === false) {
    check(result.reason.includes('comparabilityKey'), `the refusal reason does not name comparabilityKey: ${result.reason}`);
  }
}

/**
 * `strength.comparable: false` must still reach the package's own check
 * rather than be treated as ordinary input: this wrapper adds the
 * comparabilityKey check ahead of the package, it does not touch this one.
 * Built from the `a-dominates-b` fixture (a clear raw winner) with `a` marked
 * non-comparable, so a wrapper that skipped this check would report
 * `a-dominates-b` here instead of `incomparable`.
 */
async function checkNonComparableSideIsHonoured(fixtures, severityFloor) {
  const { a, b } = fixtures.aDominatesB;
  const aNotComparable = { ...a, strength: { ...a.strength, comparable: false } };
  const result = await compareStoredResults(aNotComparable, b, severityFloor);
  check(
    result.ok === true,
    `a strength.comparable: false pair was refused rather than compared: ${result.ok === false ? result.reason : ''}`,
  );
  if (result.ok) {
    check(
      result.relation === 'incomparable',
      `a strength.comparable: false side compared as "${result.relation}", expected "incomparable"`,
    );
  }
}

async function main() {
  const { DOMINANCE_RELATIONS } = await loadEvalQuality();
  const registries = { DOMINANCE_RELATIONS };
  const policy = await scoringPolicy();
  const fixtures = loadFixtures();

  await checkEachDeclaredRelationIsReachable(fixtures, policy.severityFloor, registries);
  await checkKeyBoundaryIsRefusedNotVerdicted(fixtures, policy.severityFloor);
  await checkNonComparableSideIsHonoured(fixtures, policy.severityFloor);

  if (failures.length > 0) {
    console.error(`${colors.red}${failures.length} of ${checks} dominance-comparison check(s) failed:${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log(
    `${colors.green}ok${colors.reset} all ${checks} dominance-comparison check(s) passed, covering all ${DOMINANCE_RELATIONS.length} DOMINANCE_RELATIONS values`,
  );
  return 0;
}

if (require.main === module) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = { relationFixtures };
