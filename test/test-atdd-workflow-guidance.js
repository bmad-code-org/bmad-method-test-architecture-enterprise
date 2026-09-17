/**
 * Hold the ATDD workflow to the three generation rules proven by the live
 * baseline and the executable replay fixtures:
 *
 *   every leaf title maps to one supplied acceptance criterion;
 *   an unimplemented prerequisite cannot mask the criterion-defining failure;
 *   a state-transition criterion exercises its transition-bearing branch.
 *
 * The examples are part of the instruction surface. A correct prose rule next
 * to an example that violates it still teaches the violating shape, so every
 * literal test.skip() example is checked as well.
 *
 * Usage: node test/test-atdd-workflow-guidance.js
 * Exit codes: 0 every rule held, 1 a rule moved or an example violated it
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.join(__dirname, '..');
const WORKFLOW_ROOT = path.join(PROJECT_ROOT, 'src', 'workflows', 'testarch', 'bmad-testarch-atdd');
const FILES = {
  strategy: path.join(WORKFLOW_ROOT, 'steps-c', 'step-03-test-strategy.md'),
  api: path.join(WORKFLOW_ROOT, 'steps-c', 'step-04a-subagent-api-failing.md'),
  e2e: path.join(WORKFLOW_ROOT, 'steps-c', 'step-04b-subagent-e2e-failing.md'),
  aggregate: path.join(WORKFLOW_ROOT, 'steps-c', 'step-04c-aggregate.md'),
  validate: path.join(WORKFLOW_ROOT, 'steps-c', 'step-05-validate-and-complete.md'),
  checklist: path.join(WORKFLOW_ROOT, 'checklist.md'),
};

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m', dim: '\u001B[2m' };
let failures = 0;

function assert(condition, label, detail = '') {
  if (condition) {
    console.log(`  ${colors.green}✓${colors.reset} ${label}`);
    return;
  }
  failures += 1;
  console.log(`  ${colors.red}✗ ${label}${colors.reset}`);
  if (detail) console.log(`    ${colors.dim}${detail}${colors.reset}`);
}

function read(name) {
  return fs.readFileSync(FILES[name], 'utf8');
}

function literalSkipTitles(text) {
  return [...text.matchAll(/test\.skip\(\s*(['"`])([^'"`]+)\1/g)].map((match) => match[2]);
}

function main() {
  console.log('ATDD workflow guidance for criterion-mapped, intended red failures\n');

  const sources = Object.fromEntries(Object.keys(FILES).map((name) => [name, read(name)]));
  const required = [
    ['strategy', 'Record the exact supplied acceptance criterion id on every scenario'],
    ['strategy', 'Identify the one criterion-defining assertion that must fail first'],
    ['strategy', 'choose the transition-bearing branch as the primary red-phase scenario'],
    ['api', 'Every leaf `test.skip()` title MUST include exactly one supplied acceptance criterion id'],
    ['api', 'The criterion-defining assertion MUST be the first assertion that can fail'],
    ['api', 'choose the transition-bearing branch for the primary scaffold'],
    ['e2e', 'Every leaf `test.skip()` title MUST include exactly one supplied acceptance criterion id'],
    ['e2e', 'The criterion-defining assertion MUST be the first assertion that can fail'],
    ['e2e', 'choose the transition-bearing branch for the primary scaffold'],
    ['aggregate', 'Reject any leaf test title that carries zero or multiple supplied criterion ids'],
    ['aggregate', 'Reject aggregation when any supplied acceptance criterion has no leaf test'],
    ['validate', 'Every executable leaf title carries exactly one supplied acceptance criterion id'],
    ['validate', 'The criterion-defining assertion is the first assertion that can fail'],
    ['checklist', 'Every executable leaf title carries exactly one supplied `AC-<n>` id'],
    ['checklist', 'Criterion-defining assertion is the first assertion that can fail'],
    ['checklist', 'State-transition criteria exercise the transition-bearing branch first'],
  ];

  for (const [source, phrase] of required) {
    assert(sources[source].includes(phrase), `${source} keeps ${JSON.stringify(phrase)}`);
  }

  for (const source of ['api', 'e2e']) {
    const titles = literalSkipTitles(sources[source]);
    assert(titles.length > 0, `${source} carries literal test.skip() examples`);
    for (const title of titles) {
      assert(/^\[P[0-3]\] AC-\d+\b/.test(title), `${source} example maps its leaf title to one criterion`, JSON.stringify(title));
    }
  }

  console.log('');
  if (failures > 0) {
    console.log(`${colors.red}${failures} ATDD guidance check(s) failed.${colors.reset}\n`);
    process.exit(1);
  }
  console.log(`${colors.green}ATDD generation guidance keeps every intended-failure invariant.${colors.reset}\n`);
}

main();
