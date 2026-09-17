/**
 * Hold the ATDD workflow to the generation rules proven by the live
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
const { createHash } = require('node:crypto');

const PROJECT_ROOT = path.join(__dirname, '..');
const WORKFLOW_ROOT = path.join(PROJECT_ROOT, 'src', 'workflows', 'testarch', 'bmad-testarch-atdd');
const FILES = {
  preflight: path.join(WORKFLOW_ROOT, 'steps-c', 'step-01-preflight-and-context.md'),
  strategy: path.join(WORKFLOW_ROOT, 'steps-c', 'step-03-test-strategy.md'),
  api: path.join(WORKFLOW_ROOT, 'steps-c', 'step-04a-subagent-api-failing.md'),
  e2e: path.join(WORKFLOW_ROOT, 'steps-c', 'step-04b-subagent-e2e-failing.md'),
  aggregate: path.join(WORKFLOW_ROOT, 'steps-c', 'step-04c-aggregate.md'),
  validate: path.join(WORKFLOW_ROOT, 'steps-c', 'step-05-validate-and-complete.md'),
  validateMode: path.join(WORKFLOW_ROOT, 'steps-v', 'step-01-validate.md'),
  checklist: path.join(WORKFLOW_ROOT, 'checklist.md'),
  template: path.join(WORKFLOW_ROOT, 'atdd-checklist-template.md'),
  docs: path.join(PROJECT_ROOT, 'docs', 'how-to', 'workflows', 'run-atdd.md'),
};
const PRE_CHANGE_DIAGNOSTICS = path.join(PROJECT_ROOT, 'test', 'results', 'atdd-story-1.2', 'pre-change-diagnostics.json');

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

function assignCriterionIds(criteria) {
  const supplied = criteria.filter(({ id }) => id).map(({ id }) => id);
  if (new Set(supplied).size !== supplied.length) throw new Error('duplicate supplied criterion id');
  const used = new Set(supplied);
  let candidate = 1;
  return criteria.map((criterion) => {
    if (criterion.id) return { ...criterion, idSource: 'supplied' };
    while (used.has(`AC-${candidate}`)) candidate += 1;
    const id = `AC-${candidate}`;
    used.add(id);
    candidate += 1;
    return { ...criterion, id, idSource: 'generated' };
  });
}

function declaredTitleCriterion(title, declaredIds) {
  const ids = title.match(/\bAC-\d+\b/g) ?? [];
  return ids.length === 1 && declaredIds.has(ids[0]) ? ids[0] : null;
}

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function main() {
  console.log('ATDD workflow guidance for criterion-mapped, intended red failures\n');

  const sources = Object.fromEntries(Object.keys(FILES).map((name) => [name, read(name)]));
  const required = [
    ['preflight', 'Preserve every supplied criterion id'],
    ['preflight', 'assign the lowest unused `AC-<positive integer>` id'],
    ['preflight', '{ id, idSource: supplied | generated, text }'],
    ['strategy', 'Record the exact declared acceptance criterion id on every scenario'],
    ['strategy', 'Identify the one criterion-defining assertion that must fail first'],
    ['strategy', 'choose the transition-bearing branch as the primary red-phase scenario'],
    ['api', 'Every leaf `test.skip()` title MUST include exactly one declared acceptance criterion id'],
    ['api', '"criterion_registry"'],
    ['api', 'The criterion-defining assertion MUST be the first assertion that can fail'],
    ['api', 'choose the transition-bearing branch for the primary scaffold'],
    ['e2e', 'Every leaf `test.skip()` title MUST include exactly one declared acceptance criterion id'],
    ['e2e', '"criterion_registry"'],
    ['e2e', 'The criterion-defining assertion MUST be the first potentially failing operation'],
    ['e2e', 'choose the transition-bearing branch for the primary scaffold'],
    ['aggregate', 'Require exactly one token'],
    ['aggregate', 'require that token to be a member of the registry'],
    ['aggregate', 'Reject aggregation when any declared acceptance criterion has no leaf test'],
    ['validate', 'Every executable leaf title carries exactly one id from the persisted criterion registry'],
    ['validate', 'The criterion-defining assertion is the first assertion that can fail'],
    ['validateMode', 'generated ids follow the lowest-unused `AC-<n>` rule'],
    ['validateMode', 'Require exactly one token and require it to exist in the registry'],
    ['validateMode', 'first potentially failing operation'],
    ['checklist', 'Every executable leaf title carries exactly one declared `AC-<n>` id'],
    ['checklist', 'Criterion-defining assertion is the first assertion that can fail'],
    ['checklist', 'E2E criterion-defining assertion is the first potentially failing operation'],
    ['checklist', 'State-transition criteria exercise the transition-bearing branch first'],
    ['template', 'ID source'],
    ['docs', 'assigns each the lowest unused `AC-<n>` id'],
    ['docs', 'first potentially failing operation'],
  ];

  for (const [source, phrase] of required) {
    assert(sources[source].includes(phrase), `${source} keeps ${JSON.stringify(phrase)}`);
  }

  for (const source of ['api', 'e2e']) {
    const titles = literalSkipTitles(sources[source]);
    assert(titles.length > 0, `${source} carries literal test.skip() examples`);
    const declaredIds = new Set(['AC-1', 'AC-2']);
    for (const title of titles) {
      assert(
        declaredTitleCriterion(title, declaredIds) !== null,
        `${source} example maps its leaf title to exactly one declared criterion`,
        JSON.stringify(title),
      );
    }
  }

  const unnamed = [
    { id: 'AC-2', text: 'supplied two' },
    { text: 'first unnamed' },
    { id: 'AC-7', text: 'supplied seven' },
    { text: 'second unnamed' },
  ];
  const assigned = assignCriterionIds(unnamed);
  assert(
    assigned.map(({ id }) => id).join(',') === 'AC-2,AC-1,AC-7,AC-3',
    'unnamed criteria receive stable collision-free ids while supplied ids stay unchanged',
    JSON.stringify(assigned),
  );
  assert(JSON.stringify(assignCriterionIds(unnamed)) === JSON.stringify(assigned), 'criterion id assignment is deterministic');
  assert(declaredTitleCriterion('[P0] AC-1 valid', new Set(['AC-1'])) === 'AC-1', 'title guard accepts one declared id');
  assert(declaredTitleCriterion('[P0] no id', new Set(['AC-1'])) === null, 'title guard rejects zero ids');
  assert(declaredTitleCriterion('[P0] AC-1 AC-2 two ids', new Set(['AC-1', 'AC-2'])) === null, 'title guard rejects multiple ids');
  assert(declaredTitleCriterion('[P0] AC-9 undeclared', new Set(['AC-1'])) === null, 'title guard rejects an undeclared id');

  const e2eTitles = literalSkipTitles(sources.e2e);
  const e2eFailureBoundaries = sources.e2e.match(/await expect\(async \(\) => \{/g) ?? [];
  assert(
    e2eFailureBoundaries.length === e2eTitles.length,
    'every E2E example starts its journey inside one criterion-owned assertion boundary',
    `${e2eFailureBoundaries.length} boundaries for ${e2eTitles.length} examples`,
  );

  const diagnostics = JSON.parse(fs.readFileSync(PRE_CHANGE_DIAGNOSTICS, 'utf8'));
  const baseline = diagnostics.provenance.protectedBaseline;
  assert(
    sha256(path.join(PROJECT_ROOT, baseline.path)) === baseline.sha256,
    'pre-change diagnostics bind to the protected baseline digest',
  );
  assert(
    diagnostics.provenance.protectedInputs.every(
      ({ path: inputPath, sha256: digest }) => sha256(path.join(PROJECT_ROOT, inputPath)) === digest,
    ),
    'pre-change diagnostics bind every protected scoring input by digest',
  );
  assert(
    diagnostics.provenance.diagnosticWitnesses.every(
      ({ path: witnessPath, sha256: digest }) => sha256(path.join(PROJECT_ROOT, witnessPath)) === digest,
    ),
    'pre-change diagnostics bind every deterministic witness by digest',
  );
  assert(
    diagnostics.diagnostics.filter(({ repetition }) => Number.isInteger(repetition)).length === 2,
    'pre-change diagnostics cover both repetitions',
  );
  const taxonomy = new Set(diagnostics.rootCauseTaxonomy);
  const contributions = [
    ...diagnostics.aggregate.failingContributions,
    ...diagnostics.diagnostics.flatMap(({ failingContributions }) => failingContributions),
  ];
  assert(
    contributions.every(({ rootCause }) => taxonomy.has(rootCause)),
    'every failing ATDD contribution uses the five-category taxonomy',
  );
  assert(
    diagnostics.aggregate.failingContributions
      .map(({ metric }) => metric)
      .sort()
      .join(',') === 'criteriaCoverage,nonAssertionExit,redForIntendedReasonRate,unmapped,unstableCases',
    'pre-change diagnostics preserve every protected-baseline threshold miss',
  );
  assert(
    diagnostics.diagnostics
      .flatMap(({ failingContributions }) => failingContributions.map(({ metric }) => metric))
      .sort()
      .join(',') === 'criteriaCoverage,nonAssertionExit,redForIntendedReasonRate,redForIntendedReasonRate,unmapped,unstableCases',
    'repetition diagnostics account for every failing contribution and stability miss',
  );

  console.log('');
  if (failures > 0) {
    console.log(`${colors.red}${failures} ATDD guidance check(s) failed.${colors.reset}\n`);
    process.exit(1);
  }
  console.log(`${colors.green}ATDD generation guidance keeps every intended-failure invariant.${colors.reset}\n`);
}

main();
