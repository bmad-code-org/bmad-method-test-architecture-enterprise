/**
 * The deferred-declaration gate `test/eval-all.js` runs before anything else,
 * proved directly rather than only against today's manifest.
 *
 * WHY THIS FILE EXISTS
 *
 * `test/lib/suite-manifest.js`'s `unaccountedSkills` is what decides whether
 * `eval:all` exits 2 before running a single suite: a skill with neither a
 * behavioral suite nor a `deferred` entry is unaccounted, and the run refuses.
 * Nothing exercised that decision directly. The manifest's `deferred` array
 * happening to hold zero entries today would look identical to a bug that made
 * the check always pass, and a bug that made it always fail would look
 * identical to the array happening to hold at least one entry. Story 6.12
 * (empty the deferred array) is exactly the change that drives the array to
 * zero entries, so this is the case most likely to expose either bug, and
 * fixture manifests make both directions provable independent of the array's
 * size on any given day.
 *
 * Usage: node test/test-suite-manifest.js
 */

'use strict';

const assert = require('node:assert');

const { unaccountedSkills, skillsOf } = require('./lib/suite-manifest');

const failures = [];

function check(name, fn) {
  try {
    fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.error(`  FAIL  ${name}`);
  }
}

function behavioralSuite(skill) {
  return { id: `${skill}-suite`, evalType: 'behavioral', skill };
}

function deferredEntry(skill) {
  return { skill, owner: 'TEA maintainers', missingEvidence: 'fixture', exitCondition: 'fixture' };
}

check('flags a skill with neither a behavioral suite nor a deferred entry', () => {
  const manifest = { deferred: [], suites: [behavioralSuite('bmad-tea')] };
  const unaccounted = unaccountedSkills(manifest, ['bmad-tea', 'bmad-testarch-framework']);
  assert.deepStrictEqual(unaccounted, ['bmad-testarch-framework']);
});

check('reports nothing when the deferred array is empty and every skill has a behavioral suite', () => {
  const manifest = {
    deferred: [],
    suites: [behavioralSuite('bmad-tea'), behavioralSuite('bmad-testarch-framework'), behavioralSuite('bmad-teach-me-testing')],
  };
  const unaccounted = unaccountedSkills(manifest, ['bmad-tea', 'bmad-testarch-framework', 'bmad-teach-me-testing']);
  assert.deepStrictEqual(unaccounted, []);
});

check('a deferred entry accounts for a skill with no behavioral suite', () => {
  const manifest = { deferred: [deferredEntry('bmad-testarch-framework')], suites: [behavioralSuite('bmad-tea')] };
  const unaccounted = unaccountedSkills(manifest, ['bmad-tea', 'bmad-testarch-framework']);
  assert.deepStrictEqual(unaccounted, []);
});

check('a fragment-selection-only entry does not account for a skill: routing evidence is not coverage', () => {
  const manifest = { deferred: [], suites: [{ id: 'fragment-selection', evalType: 'fragment-selection', skills: ['bmad-tea'] }] };
  const unaccounted = unaccountedSkills(manifest, ['bmad-tea']);
  assert.deepStrictEqual(unaccounted, ['bmad-tea']);
});

check('skillsOf falls back to an empty list for an infrastructure entry, not [undefined]', () => {
  assert.deepStrictEqual(skillsOf({ evalType: 'infrastructure' }), []);
});

if (failures.length > 0) {
  console.error('\nSuite manifest declaration-gate validation failed:\n');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('The deferred-declaration gate fails on an unaccounted skill and passes when the deferred array is empty.');
