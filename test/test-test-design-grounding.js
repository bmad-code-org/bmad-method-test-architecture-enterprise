/**
 * Deterministic guard for test-design grounding and coverage-link guidance.
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { matchesGroups, normalizeText } = require('./eval-test-design');

const ROOT = path.join(__dirname, '..', 'skills', 'bmad-tea-test-design');
const riskStep = fs.readFileSync(path.join(ROOT, 'steps-c', 'step-03-risk-and-testability.md'), 'utf8');
const coverageStep = fs.readFileSync(path.join(ROOT, 'steps-c', 'step-04-coverage-plan.md'), 'utf8');
const template = fs.readFileSync(path.join(ROOT, 'test-design-template.md'), 'utf8');

assert.match(riskStep, /Ground every risk in an explicit statement from the supplied epic/);
assert.match(riskStep, /Do not add plausible risks merely because they are common in other systems/);
assert.match(riskStep, /Register exactly one scored risk per merged gap statement/);
assert.match(riskStep, /When the supplied sources state no gap at all, register one residual risk for each story/);
assert.match(riskStep, /exactly as many cells as that header/);
assert.match(coverageStep, /Use the exact `Risk ID` assigned in the risk register/);
assert.match(coverageStep, /Give every scored risk exactly one risk-linked coverage row/);
assert.match(coverageStep, /A risk never appears under two priority headings/);
assert.match(template, /Use the exact `Risk ID` from the risk assessment in `Risk Link`/);
assert.match(template, /Every scored risk has exactly one risk-linked row/);

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'test-design-eval', 'ground-truth.json'), 'utf8'));
const risks = fixture.fixtureSets.find((set) => set.id === 'seeded-offline-order-capture').materialRisks;
const descriptions = [
  [
    'data-sync-conflict-overwrite',
    'Two offline editors apply arrival order without version checks. Later arrivals silently erase earlier lines and their history.',
  ],
  [
    'data-sync-conflict-overwrite',
    'Two offline technicians accept edits by arrival order without version checks and silently discard earlier lines.',
  ],
  ['ops-no-release-kill-switch', 'No flag or staged release; disabling needs a new build and 1–3 days of store review.'],
  ['ops-no-release-kill-switch', 'Disabling requires a new store build and a one-to-three-day delay for every technician.'],
];
for (const [id, description] of descriptions) {
  const risk = risks.find((entry) => entry.id === id);
  assert.ok(risk, `missing fixture risk ${id}`);
  assert.ok(matchesGroups(risk.anyOf, normalizeText(description)), `${id} should match an observed equivalent risk description`);
}

console.log('test-design grounding and coverage-link guidance is enforced');
