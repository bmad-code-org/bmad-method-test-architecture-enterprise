/** Mutation checks for the routing ambiguity table's oracle binding. */

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

async function main() {
  const corpus = await loadCorpus();
  const skill = fs.readFileSync(SKILL_FILE, 'utf8');
  const clean = await validateCorpus(corpus, { skill });
  check(clean.length === 0, `the shipped ambiguity table is invalid:\n${clean.join('\n')}`);

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
