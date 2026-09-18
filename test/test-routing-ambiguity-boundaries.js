/** Mutation checks for the routing boundary tables and their oracle binding. */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { loadCorpus, validateCorpus } = require('./eval-bmad-tea-routing');

const PROJECT_ROOT = path.join(__dirname, '..');
const SKILL_FILE = path.join(PROJECT_ROOT, 'src', 'agents', 'bmad-tea', 'SKILL.md');

const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

async function validateMutation(corpus, skill, description) {
  const problems = await validateCorpus(corpus, { skill });
  check(problems.length > 0, `${description} mutation passed validation`);
  return problems;
}

function includes(problems, fragment, description) {
  check(
    problems.some((problem) => problem.includes(fragment)),
    `${description} mutation did not report ${JSON.stringify(fragment)}`,
  );
}

function unservableBoundaryRows(skill) {
  const start = '<!-- routing-unservable-boundaries:start -->';
  const end = '<!-- routing-unservable-boundaries:end -->';
  const startIndex = skill.indexOf(start);
  const endIndex = skill.indexOf(end);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) return [];
  const block = skill.slice(startIndex + start.length, endIndex);
  return block
    .split('\n')
    .filter((line) => /^\| `/.test(line))
    .map((line) => line.match(/^\| `([^`]+)`\s+\|\s+([^|]+)\|\s+([^|]+)\|\s+([^|]+)\|$/))
    .filter(Boolean)
    .map((match) => ({ sourceCase: match[1], result: match[2].trim(), boundary: match[3].trim(), missing: match[4].trim() }));
}

function validateUnservableBoundaries(corpus, skill) {
  const problems = [];
  const rows = unservableBoundaryRows(skill);
  const byCase = new Map(rows.map((row) => [row.sourceCase, row]));
  const declineCases = corpus.cases.filter((item) => item.expected?.expectedAction === 'decline');

  if (byCase.size !== rows.length) problems.push('src/agents/bmad-tea/SKILL.md repeats an unservable boundary source case');

  for (const item of declineCases) {
    const row = byCase.get(item.id);
    if (!row) {
      problems.push(`src/agents/bmad-tea/SKILL.md declares no unservable boundary for "${item.id}"`);
      continue;
    }
    if (!row.result || !row.boundary || !row.missing) {
      problems.push(`src/agents/bmad-tea/SKILL.md carries an incomplete unservable boundary for "${item.id}"`);
    }
  }
  for (const row of rows) {
    const item = corpus.cases.find((candidate) => candidate.id === row.sourceCase);
    if (!item) problems.push(`src/agents/bmad-tea/SKILL.md unservable boundary "${row.sourceCase}" is orphaned from the intent corpus`);
    else if (item.expected?.expectedAction !== 'decline') {
      problems.push(`src/agents/bmad-tea/SKILL.md unservable boundary "${row.sourceCase}" references a servable case`);
    }
  }
  return problems;
}

async function main() {
  const corpus = await loadCorpus();
  const skill = fs.readFileSync(SKILL_FILE, 'utf8');
  const clean = await validateCorpus(corpus, { skill });
  check(clean.length === 0, `the shipped ambiguity table is invalid:\n${clean.join('\n')}`);
  const cleanUnservable = validateUnservableBoundaries(corpus, skill);
  check(cleanUnservable.length === 0, `the shipped unservable table is invalid:\n${cleanUnservable.join('\n')}`);

  const factDrift = skill.replace(
    'Existing tests raise both writing-quality and requirements-coverage concerns',
    'Existing tests raise only writing-quality concerns',
  );
  includes(await validateMutation(corpus, factDrift, 'fact drift'), 'ambiguity boundary facts drifted from the oracle', 'fact drift');

  const decidingDrift = skill.replace(
    'Whether to assess how well the tests are written or map what they cover and evaluate ship readiness',
    'Whether the team wants a short report or a long report',
  );
  includes(
    await validateMutation(corpus, decidingDrift, 'deciding-information drift'),
    'ambiguity boundary missing deciding information drifted from the oracle',
    'deciding-information drift',
  );

  const candidateDrift = skill.replace('Review Tests (`RV`), Trace Coverage (`TR`)', 'Review Tests (`RV`), Test Design (`TD`)');
  includes(
    await validateMutation(corpus, candidateDrift, 'candidate drift'),
    'ambiguity boundary candidate codes drifted',
    'candidate drift',
  );

  const orphan = skill.replace('`good-or-covering-what-matters`', '`missing-routing-case`');
  includes(await validateMutation(corpus, orphan, 'orphan boundary'), 'is orphaned from the intent corpus', 'orphan boundary');

  const overClarified = skill.replace('`good-or-covering-what-matters`', '`review-existing-tests`');
  includes(
    await validateMutation(corpus, overClarified, 'clear-intent over-clarification'),
    'clear and unservable intents must not be over-clarified',
    'clear-intent over-clarification',
  );

  const row = skill.split('\n').find((line) => line.startsWith('| `good-or-covering-what-matters`'));
  const duplicate = skill.replace(row, `${row}\n${row}`);
  includes(await validateMutation(corpus, duplicate, 'duplicate boundary'), 'repeats ambiguity boundary source case', 'duplicate boundary');

  const missingUnservable = skill.replace('| `run-and-fix-ci-failures`', '| `missing-run-and-fix-ci-failures`');
  includes(
    validateUnservableBoundaries(corpus, missingUnservable),
    'declares no unservable boundary for "run-and-fix-ci-failures"',
    'missing unservable boundary',
  );

  for (const [description, malformed] of [
    ['missing unservable start marker', skill.replace('<!-- routing-unservable-boundaries:start -->', '')],
    ['missing unservable end marker', skill.replace('<!-- routing-unservable-boundaries:end -->', '')],
    [
      'reversed unservable markers',
      skill
        .replace('<!-- routing-unservable-boundaries:start -->', '<!-- routing-unservable-boundaries:temporary -->')
        .replace('<!-- routing-unservable-boundaries:end -->', '<!-- routing-unservable-boundaries:start -->')
        .replace('<!-- routing-unservable-boundaries:temporary -->', '<!-- routing-unservable-boundaries:end -->'),
    ],
  ]) {
    includes(validateUnservableBoundaries(corpus, malformed), 'declares no unservable boundary for "run-and-fix-ci-failures"', description);
  }

  const servableInUnservableTable = skill.replace('| `run-and-fix-ci-failures`', '| `review-existing-tests`');
  includes(
    validateUnservableBoundaries(corpus, servableInUnservableTable),
    'unservable boundary "review-existing-tests" references a servable case',
    'servable unservable boundary',
  );

  const unservableRow = skill.split('\n').find((line) => line.startsWith('| `run-and-fix-ci-failures`'));
  const duplicateUnservable = skill.replace(unservableRow, `${unservableRow}\n${unservableRow}`);
  includes(
    validateUnservableBoundaries(corpus, duplicateUnservable),
    'repeats an unservable boundary source case',
    'duplicate unservable boundary',
  );

  if (failures.length > 0) {
    console.error(`routing ambiguity boundaries: ${failures.length} failure(s) across ${checks} checks`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log(`routing ambiguity boundaries: ${checks} checks passed`);
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exit(1);
});
