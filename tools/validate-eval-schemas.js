/**
 * Eval Suite Manifest and Result Schema Validator
 *
 * Deterministic, credential-free, and no model calls: this is the pull-request
 * half of the eval story. It checks that
 *
 * - test/evals/suite-manifest.json matches its Zod schema,
 * - every path the manifest declares exists,
 * - the thresholds it declares are the thresholds the harnesses actually apply,
 * - the case count it declares is the case count the fixtures contain,
 * - every TEA skill has a behavioral suite or a deferred declaration, and
 * - test/schema/eval-result.schema.json is what the Zod source generates.
 *
 * The threshold check is the one that earns its place. A manifest that declares
 * a gate nobody runs is worse than no manifest: it reads as a specification and
 * is actually a comment.
 *
 * Usage: node tools/validate-eval-schemas.js [--write]
 * Exit codes: 0 = valid, 1 = validation failures, 2 = the check could not run
 *
 * --write regenerates test/schema/eval-result.schema.json from the Zod source.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { zodToJsonSchema } = require('zod-to-json-schema');

const { loadSuiteManifest, skillsOf, unaccountedSkills, MANIFEST_RELATIVE_PATH } = require('../test/lib/suite-manifest');
const { teaSkills } = require('../test/lib/tea-skills');
const { evalResultSchema, evalRunSchema } = require('../test/schema/eval-result');

const PROJECT_ROOT = path.join(__dirname, '..');
const RESULT_SCHEMA_PATH = path.join(PROJECT_ROOT, 'test', 'schema', 'eval-result.schema.json');
const RESULT_SCHEMA_RELATIVE_PATH = path.relative(PROJECT_ROOT, RESULT_SCHEMA_PATH);

/** The JSON Schema projection of the Zod source, byte-for-byte as it is committed. */
function generateResultSchema() {
  const schema = zodToJsonSchema(evalRunSchema, {
    name: 'EvalRun',
    definitions: { EvalResult: evalResultSchema },
    $refStrategy: 'root',
  });
  return `${JSON.stringify(schema, null, 2)}\n`;
}

/** Case count per eval type, derived from the fixtures rather than trusted. */
function actualCaseCount(entry) {
  if (entry.evalType === 'fragment-selection') {
    let total = 0;
    for (const relative of entry.fixtures) {
      const parsed = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, relative), 'utf8'));
      total += Array.isArray(parsed.cases) ? parsed.cases.length : 0;
    }
    return total;
  }
  // A behavioral suite reviews one fixture per case; the corpus is the case list.
  return entry.fixtures.length;
}

function compareThresholds(entry, problems) {
  const harnessPath = path.join(PROJECT_ROOT, entry.harness);
  let harness;
  try {
    harness = require(harnessPath);
  } catch (error) {
    problems.push(`${entry.id}: harness ${entry.harness} could not be loaded: ${error.message}`);
    return;
  }
  const applied = harness.THRESHOLDS;
  if (!applied || typeof applied !== 'object') {
    problems.push(`${entry.id}: ${entry.harness} exports no THRESHOLDS, so the manifest's declaration cannot be checked`);
    return;
  }
  const declaredKeys = Object.keys(entry.thresholds).sort();
  const appliedKeys = Object.keys(applied).sort();
  if (declaredKeys.join(',') !== appliedKeys.join(',')) {
    problems.push(
      `${entry.id}: manifest declares thresholds [${declaredKeys.join(', ')}] but the harness applies [${appliedKeys.join(', ')}]`,
    );
    return;
  }
  for (const key of declaredKeys) {
    if (entry.thresholds[key] !== applied[key]) {
      problems.push(`${entry.id}: threshold ${key} is ${entry.thresholds[key]} in the manifest and ${applied[key]} in ${entry.harness}`);
    }
  }
}

function checkPaths(entry, problems) {
  const declared = [entry.harness, ...entry.fixtures, ...entry.groundTruth];
  if (entry.contract) declared.push(entry.contract);
  for (const relative of declared) {
    if (!fs.existsSync(path.join(PROJECT_ROOT, relative))) {
      problems.push(`${entry.id}: declares ${relative}, which does not exist`);
    }
  }
}

function main() {
  const write = process.argv.slice(2).includes('--write');
  const problems = [];

  let manifest;
  try {
    ({ manifest } = loadSuiteManifest(PROJECT_ROOT));
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(error.code === 'EVAL_MANIFEST_INVALID' ? 1 : 2);
  }

  const skills = teaSkills(PROJECT_ROOT);
  if (skills.length === 0) {
    console.error('❌ no TEA skills found under src/workflows/testarch or src/agents; the coverage check cannot run');
    process.exit(2);
  }

  const known = new Set(skills);
  for (const entry of manifest.suites) {
    checkPaths(entry, problems);
    compareThresholds(entry, problems);

    const counted = actualCaseCount(entry);
    if (counted !== entry.caseCount) {
      problems.push(`${entry.id}: manifest declares ${entry.caseCount} case(s), the fixtures contain ${counted}`);
    }

    for (const skill of skillsOf(entry)) {
      if (!known.has(skill)) problems.push(`${entry.id}: names skill "${skill}", which is not a TEA skill in this repository`);
    }
  }

  for (const entry of manifest.deferred) {
    if (!known.has(entry.skill)) problems.push(`deferred: names skill "${entry.skill}", which is not a TEA skill in this repository`);
  }

  for (const skill of unaccountedSkills(manifest, skills)) {
    problems.push(`${skill}: has no behavioral suite and no deferred declaration, so eval:all would imply coverage that does not exist`);
  }

  const generated = generateResultSchema();
  if (write) {
    fs.writeFileSync(RESULT_SCHEMA_PATH, generated, 'utf8');
    console.log(`✅ wrote ${RESULT_SCHEMA_RELATIVE_PATH} from the Zod source`);
  } else if (!fs.existsSync(RESULT_SCHEMA_PATH)) {
    problems.push(`${RESULT_SCHEMA_RELATIVE_PATH} is missing; regenerate it with "node tools/validate-eval-schemas.js --write"`);
  } else if (fs.readFileSync(RESULT_SCHEMA_PATH, 'utf8') !== generated) {
    problems.push(
      `${RESULT_SCHEMA_RELATIVE_PATH} is out of date with test/schema/eval-result.js; regenerate it with "node tools/validate-eval-schemas.js --write"`,
    );
  }

  if (problems.length > 0) {
    console.error('❌ eval manifest validation failed:\n');
    for (const problem of problems) console.error(`   ${problem}`);
    console.error('');
    process.exit(1);
  }

  const covered = manifest.suites.filter((entry) => entry.evalType === 'behavioral').length;
  console.log(
    `✅ ${MANIFEST_RELATIVE_PATH}: ${manifest.suites.length} suite(s) (${covered} behavioral), ` +
      `${manifest.deferred.length} deferred, ${skills.length} TEA skill(s) accounted for`,
  );
  console.log(`✅ ${RESULT_SCHEMA_RELATIVE_PATH} matches test/schema/eval-result.js`);
}

if (require.main === module) main();

module.exports = { generateResultSchema, actualCaseCount };
