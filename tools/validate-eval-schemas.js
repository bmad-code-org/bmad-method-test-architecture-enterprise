/**
 * Eval Suite Manifest and Result Schema Validator
 *
 * Deterministic, credential-free, and no model calls: this is the pull-request
 * half of the eval story. It checks that
 *
 * - test/evals/suite-manifest.json matches its Zod schema,
 * - every path the manifest declares exists,
 * - the thresholds it declares are the thresholds the harnesses actually apply,
 * - the case count it declares is the number of cases the harness scores,
 * - every generated contract under test/contracts is claimed by a suite,
 * - every TEA skill has a behavioral suite or a deferred declaration, and
 * - test/schema/eval-result.schema.json is what the Zod source generates.
 *
 * The threshold check is the one that earns its place. A manifest that declares
 * a gate nobody runs is worse than no manifest: it reads as a specification and
 * is actually a comment. The case-count check follows the same rule, which is why
 * it asks the harness rather than counting the manifest's own fixture list.
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
const CONTRACT_ROOT = path.join(PROJECT_ROOT, 'test', 'contracts');

/** The JSON Schema projection of the Zod source, byte-for-byte as it is committed. */
function generateResultSchema() {
  const schema = zodToJsonSchema(evalRunSchema, {
    name: 'EvalRun',
    definitions: { EvalResult: evalResultSchema },
    $refStrategy: 'root',
  });
  return `${JSON.stringify(schema, null, 2)}\n`;
}

/**
 * The suite's harness module, or null once the failure has been reported.
 *
 * @param {object} entry
 * @param {string[]} problems
 * @returns {object|null}
 */
function loadHarness(entry, problems) {
  try {
    return require(path.join(PROJECT_ROOT, entry.harness));
  } catch (error) {
    problems.push(`${entry.id}: harness ${entry.harness} could not be loaded: ${error.message}`);
    return null;
  }
}

/**
 * The case ids the harness will actually score.
 *
 * This has to come from the harness. Deriving a behavioral suite's count from its
 * own `fixtures` list made the check compare the manifest with itself, and it
 * misreported: the trace suite reads fourteen fixture files across two cases, so
 * the tautology declared fourteen while the result record wrote two case ids.
 *
 * @param {object} entry
 * @param {string[]} problems
 * @returns {string[]|null}
 */
function harnessCaseIds(entry, problems) {
  const harness = loadHarness(entry, problems);
  if (!harness) return null;
  if (typeof harness.caseIds !== 'function') {
    problems.push(`${entry.id}: ${entry.harness} exports no caseIds(), so the manifest's caseCount cannot be checked`);
    return null;
  }
  try {
    return harness.caseIds();
  } catch (error) {
    problems.push(`${entry.id}: ${entry.harness} caseIds() threw: ${error.message}`);
    return null;
  }
}

function compareThresholds(entry, problems) {
  const harness = loadHarness(entry, problems);
  if (!harness) return;
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
  for (const relative of [entry.harness, ...entry.fixtures, ...entry.groundTruth, ...entry.contracts]) {
    if (!fs.existsSync(path.join(PROJECT_ROOT, relative))) {
      problems.push(`${entry.id}: declares ${relative}, which does not exist`);
    }
  }
}

/** Every *.contract.json under test/contracts, at any depth, repository-relative. */
function generatedContracts(directory = CONTRACT_ROOT) {
  const found = [];
  for (const child of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(directory, child.name);
    if (child.isDirectory()) found.push(...generatedContracts(full));
    else if (child.name.endsWith('.contract.json')) found.push(path.relative(PROJECT_ROOT, full));
  }
  return found;
}

/**
 * Contracts on disk that no suite claims.
 *
 * checkPaths only proves a declared path exists. Without the reverse check a
 * contract can be generated, committed, and linked from nothing, which is the
 * state every suite entry was in when `contract` was one nullable path that every
 * suite left null.
 *
 * @param {object} manifest
 * @param {string[]} problems
 */
function checkContractsAreClaimed(manifest, problems) {
  const claimed = new Set(manifest.suites.flatMap((entry) => entry.contracts));
  for (const relative of generatedContracts()) {
    if (!claimed.has(relative)) problems.push(`${relative}: exists under test/contracts and no suite in the manifest names it`);
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

    const ids = harnessCaseIds(entry, problems);
    if (ids && ids.length !== entry.caseCount) {
      problems.push(`${entry.id}: manifest declares ${entry.caseCount} case(s), ${entry.harness} scores ${ids.length}`);
    }

    for (const skill of skillsOf(entry)) {
      if (!known.has(skill)) problems.push(`${entry.id}: names skill "${skill}", which is not a TEA skill in this repository`);
    }
  }

  for (const entry of manifest.deferred) {
    if (!known.has(entry.skill)) problems.push(`deferred: names skill "${entry.skill}", which is not a TEA skill in this repository`);
  }

  checkContractsAreClaimed(manifest, problems);

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

module.exports = { generateResultSchema, generatedContracts };
