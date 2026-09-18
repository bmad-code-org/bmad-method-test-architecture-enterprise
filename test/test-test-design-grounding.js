/**
 * Deterministic guard for test-design grounding and coverage-link guidance.
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', 'src', 'workflows', 'testarch', 'bmad-testarch-test-design');
const riskStep = fs.readFileSync(path.join(ROOT, 'steps-c', 'step-03-risk-and-testability.md'), 'utf8');
const coverageStep = fs.readFileSync(path.join(ROOT, 'steps-c', 'step-04-coverage-plan.md'), 'utf8');
const template = fs.readFileSync(path.join(ROOT, 'test-design-template.md'), 'utf8');

assert.match(riskStep, /Ground every risk in an explicit statement from the supplied epic/);
assert.match(riskStep, /Do not add plausible risks merely because they are common in other systems/);
assert.match(coverageStep, /Use the exact `Risk ID` assigned in the risk register/);
assert.match(coverageStep, /Give every material risk at least one coverage row/);
assert.match(template, /Use the exact `Risk ID` from the risk assessment in `Risk Link`/);
assert.match(template, /Every material risk must appear in at least one coverage row/);

console.log('test-design grounding and coverage-link guidance is enforced');
