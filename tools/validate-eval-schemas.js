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
 * - the runner capabilities it declares are the ones the harness grants its runner,
 * - the preflight argv it declares really probes the runner, in both directions,
 * - every generated contract under test/contracts is claimed by a suite,
 * - every TEA skill has a covering suite or a deferred declaration, and
 * - test/schema/eval-result.schema.json is what the Zod source generates.
 *
 * The threshold check is the one that earns its place. A manifest that declares
 * a gate nobody runs is worse than no manifest: it reads as a specification and
 * is actually a comment. The case-count check follows the same rule, which is why
 * it asks the harness rather than counting the manifest's own fixture list, and
 * the capability check follows it too: the harness exports the list it hands to
 * its runner, and the manifest has to say the same thing.
 *
 * The preflight check is the one that spawns a process. `runnerCapabilities` and
 * `preflightArgs` were both declared for months with nothing reading them, and a
 * comparison of two constants cannot tell whether a preflight argv reaches the
 * runner at all. So each suite's declared argv is run twice through the real
 * harness, once with a runner that does not exist and once with one that does,
 * and both the exit code and the result record have to say the right thing.
 * That costs a few seconds and no credential, and it is the only way to know
 * that `eval:all --preflight-only` fails before money is spent when the runner
 * is missing.
 *
 * Usage: node tools/validate-eval-schemas.js [--write]
 * Exit codes: 0 = valid, 1 = validation failures, 2 = the check could not run
 *
 * --write regenerates test/schema/eval-result.schema.json from the Zod source.
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');
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
 * Every harness `suite-manifest.json` names, as a literal require() rather than
 * one built from `entry.harness` at runtime. A literal keeps the load inside the
 * dependency-direction gate's declared edges rather than escaping its notice
 * as a specifier the gate could not read.
 *
 * `test/eval-automate.js` invokes no agent at all (see its own header for why),
 * so it has no generation runner of its own to probe. `checkPreflightProbesRunner`
 * below still spawns it with `--agent custom --agent-cmd <path>` the same way it
 * spawns every other suite, and that harness's `--preflight-only` mode answers
 * the probe purely so this check keeps working the same way for every suite.
 */
const HARNESS_LOADERS = {
  'test/eval-atdd.js': () => require('../test/eval-atdd.js'),
  'test/eval-automate.js': () => require('../test/eval-automate.js'),
  'test/eval-bmad-tea-routing.js': () => require('../test/eval-bmad-tea-routing.js'),
  'test/eval-ci.js': () => require('../test/eval-ci.js'),
  'test/eval-fragment-selection.js': () => require('../test/eval-fragment-selection.js'),
  'test/eval-framework-scaffold.js': () => require('../test/eval-framework-scaffold.js'),
  'test/eval-nfr.js': () => require('../test/eval-nfr.js'),
  'test/eval-test-design.js': () => require('../test/eval-test-design.js'),
  'test/eval-teach-me-testing.js': () => require('../test/eval-teach-me-testing.js'),
  'test/eval-test-review.js': () => require('../test/eval-test-review.js'),
  'test/eval-trace.js': () => require('../test/eval-trace.js'),
  'test/eval-transcript.js': () => require('../test/eval-transcript.js'),
};

/**
 * The suite's harness module, or null once the failure has been reported.
 *
 * @param {object} entry
 * @param {string[]} problems
 * @returns {object|null}
 */
function loadHarness(entry, problems) {
  const load = HARNESS_LOADERS[entry.harness];
  if (!load) {
    problems.push(`${entry.id}: harness ${entry.harness} is not one of the loaders this script declares; add it to HARNESS_LOADERS`);
    return null;
  }
  try {
    return load();
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
 * Asynchronous because a harness may read its corpus through `eval-quality`'s
 * file-system port, which is asynchronous. `await` on a harness that still
 * returns an array is the identity, so the harnesses that have not converted
 * are unaffected.
 *
 * @param {object} entry
 * @param {string[]} problems
 * @returns {Promise<string[]|null>}
 */
async function harnessCaseIds(entry, problems) {
  const harness = loadHarness(entry, problems);
  if (!harness) return null;
  if (typeof harness.caseIds !== 'function') {
    problems.push(`${entry.id}: ${entry.harness} exports no caseIds(), so the manifest's caseCount cannot be checked`);
    return null;
  }
  try {
    return await harness.caseIds();
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

/**
 * The capabilities the harness grants its runner, against the ones the manifest
 * declares. Exact set equality: a harness that grants more than it declares is
 * the defect this check exists for, and one that grants less is a manifest that
 * overstates what the runner can do.
 */
function compareRunnerCapabilities(entry, problems) {
  const harness = loadHarness(entry, problems);
  if (!harness) return;
  const granted = harness.RUNNER_CAPABILITIES;
  if (!Array.isArray(granted)) {
    problems.push(`${entry.id}: ${entry.harness} exports no RUNNER_CAPABILITIES, so the manifest's runnerCapabilities cannot be checked`);
    return;
  }
  const declared = [...entry.runnerCapabilities].sort().join(', ');
  const applied = [...granted].sort().join(', ');
  if (declared !== applied) {
    problems.push(`${entry.id}: manifest declares runnerCapabilities [${declared}] and ${entry.harness} grants [${applied}]`);
  }
}

/**
 * Two probes per suite, through the declared preflight argv, and what each must
 * produce. A runner that does not exist is a transport failure with exit 2, and
 * `node` itself standing in as a custom runner answers --version and passes. The
 * result record is read as well as the exit code, because the mode it carries is
 * the harness saying it knew this was a preflight, and the class it carries is
 * the harness saying what the probe found.
 */
const PREFLIGHT_PROBES = [
  {
    label: 'a missing runner',
    agentCmd: (runDir) => path.join(runDir, 'no-such-runner'),
    exitCode: 2,
    failureClass: 'environment-transport',
  },
  { label: 'a present runner', agentCmd: () => process.execPath, exitCode: 0, failureClass: 'none' },
];

function checkPreflightProbesRunner(entry, problems) {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-preflight-check-'));
  const argv = entry.harnessOptions.preflightArgs;
  try {
    for (const probe of PREFLIGHT_PROBES) {
      const jsonPath = path.join(runDir, `${entry.id}-${probe.failureClass}.json`);
      const result = spawnSync(
        process.execPath,
        [path.join(PROJECT_ROOT, entry.harness), ...argv, '--agent', 'custom', '--agent-cmd', probe.agentCmd(runDir), '--json', jsonPath],
        { cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 180_000 },
      );
      const where = `${entry.id}: preflightArgs [${argv.join(' ')}] with ${probe.label}`;
      if (result.error) {
        problems.push(`${where} could not run: ${result.error.message}`);
        continue;
      }
      if (result.status !== probe.exitCode) {
        const tail = String(result.stderr || result.stdout || '')
          .trim()
          .split('\n')
          .slice(-3)
          .join(' | ');
        problems.push(`${where} exited ${result.status}, expected ${probe.exitCode}; the preflight does not probe the runner (${tail})`);
        continue;
      }
      if (!fs.existsSync(jsonPath)) {
        problems.push(`${where} wrote no result record to --json`);
        continue;
      }
      let record;
      try {
        record = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      } catch (error) {
        problems.push(`${where} wrote an unreadable result record: ${error.message}`);
        continue;
      }
      if (record.mode !== 'preflight-only') {
        problems.push(`${where} recorded mode "${record.mode}", expected "preflight-only"`);
      }
      if (record.failureClass !== probe.failureClass) {
        problems.push(`${where} recorded failureClass "${record.failureClass}", expected "${probe.failureClass}"`);
      }
    }
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
}

function checkPaths(entry, problems) {
  for (const relative of [entry.harness, ...entry.fixtures, ...entry.groundTruth, ...entry.contracts]) {
    if (!fs.existsSync(path.join(PROJECT_ROOT, relative))) {
      problems.push(`${entry.id}: declares ${relative}, which does not exist`);
    }
  }
}

/** Check the thresholds that Evaluate and its scoring policy actually use. */
function checkEvaluateAuthored(entry, problems, projectRoot = PROJECT_ROOT) {
  const evaluationPath = path.join(projectRoot, entry.evaluation);
  const policyPath = path.join(path.dirname(evaluationPath), 'policy', 'scoring-policy.json');
  const realRoot = fs.realpathSync(projectRoot);
  let evaluation;
  let policy;
  for (const [label, file, assign] of [
    ['evaluation', evaluationPath, (value) => (evaluation = value)],
    ['scoring policy', policyPath, (value) => (policy = value)],
  ]) {
    try {
      const realFile = fs.realpathSync(file);
      const relative = path.relative(realRoot, realFile);
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        problems.push(`${entry.id}: ${label} resolves outside the repository: ${path.relative(projectRoot, file)}`);
        continue;
      }
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        problems.push(`${entry.id}: ${label} at ${path.relative(projectRoot, file)} must be a JSON object`);
        continue;
      }
      assign(parsed);
    } catch (error) {
      problems.push(`${entry.id}: cannot read ${label} at ${path.relative(projectRoot, file)}: ${error.message}`);
    }
  }
  if (evaluation === undefined || policy === undefined) return;
  const expected = {
    trials: evaluation.trials,
    strengthFloor: evaluation.strengthFloor,
    catchThreshold: policy.catchThreshold,
    minimumTrialCount: policy.minimumTrialCount,
    severityFloor: policy.severityFloor,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (!isDeepStrictEqual(entry.thresholds[key], value)) {
      problems.push(
        `${entry.id}: threshold ${key} differs from ${key === 'trials' || key === 'strengthFloor' ? entry.evaluation : path.relative(projectRoot, policyPath)}`,
      );
    }
  }
}

function coveringSuites(manifest) {
  return manifest.suites.filter((entry) => entry.evalType === 'behavioral' || entry.evalType === 'evaluate-authored');
}

function checkAuthoredFixture(
  problems,
  fixturePath = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'suite-manifest-authored.json'),
) {
  let fixture;
  try {
    fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  } catch (error) {
    problems.push(`Evaluate-authored fixture manifest cannot be read: ${error.message}`);
    return;
  }
  const parsed = require('../test/schema/suite-manifest').validateSuiteManifest(fixture);
  if (!parsed.success) {
    problems.push(`Evaluate-authored fixture manifest is off-schema: ${parsed.error.issues[0]?.message}`);
    return;
  }
  const fixtureSkills = ['temp-skill'];
  for (const skill of unaccountedSkills(parsed.data, fixtureSkills)) problems.push(`Evaluate-authored fixture leaves ${skill} unaccounted`);
  const covered = new Set(coveringSuites(parsed.data).flatMap(skillsOf));
  for (const skill of fixtureSkills) {
    if (!covered.has(skill)) problems.push(`Evaluate-authored fixture covering count omits ${skill}`);
  }
  if (!parsed.data.suites.some((entry) => entry.evalType === 'evaluate-authored')) {
    problems.push('Evaluate-authored fixture has no Evaluate-authored suite');
  }
  checkAuthoringPaths(parsed.data, problems);
  for (const entry of parsed.data.suites) {
    if (entry.evalType === 'evaluate-authored') checkEvaluateAuthored(entry, problems);
  }
}

function checkAuthoringPaths(manifest, problems) {
  const authoringPath = new Map();
  for (const entry of manifest.suites) {
    if (entry.evalType !== 'behavioral' && entry.evalType !== 'evaluate-authored') continue;
    for (const skill of skillsOf(entry)) {
      const previous = authoringPath.get(skill);
      if (previous && previous !== entry.evalType) problems.push(`${skill}: has both behavioral and Evaluate-authored suites (AD-14)`);
      authoringPath.set(skill, entry.evalType);
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
  const claimed = new Set(manifest.suites.flatMap((entry) => entry.contracts ?? []));
  for (const relative of generatedContracts()) {
    if (!claimed.has(relative)) problems.push(`${relative}: exists under test/contracts and no suite in the manifest names it`);
  }
}

async function main() {
  const fixtureArg = process.argv.indexOf('--fixture-manifest');
  if (fixtureArg !== -1) {
    const fixturePath = process.argv[fixtureArg + 1];
    if (!fixturePath) {
      console.error('❌ --fixture-manifest requires a path');
      process.exit(2);
    }
    const fixtureProblems = [];
    checkAuthoredFixture(fixtureProblems, fixturePath);
    if (fixtureProblems.length > 0) {
      console.error(fixtureProblems.join('\n'));
      process.exit(1);
    }
    console.log('✅ Evaluate-authored fixture manifest is valid');
    return;
  }
  const write = process.argv.slice(2).includes('--write');
  const problems = [];

  let manifest;
  try {
    ({ manifest } = await loadSuiteManifest(PROJECT_ROOT));
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
  checkAuthoringPaths(manifest, problems);
  checkAuthoredFixture(problems);
  for (const entry of manifest.suites) {
    if (entry.evalType === 'evaluate-authored') {
      checkEvaluateAuthored(entry, problems);
    } else {
      checkPaths(entry, problems);
      compareThresholds(entry, problems);
      compareRunnerCapabilities(entry, problems);
      checkPreflightProbesRunner(entry, problems);

      const ids = await harnessCaseIds(entry, problems);
      if (ids && ids.length !== entry.caseCount) {
        problems.push(`${entry.id}: manifest declares ${entry.caseCount} case(s), ${entry.harness} scores ${ids.length}`);
      }
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
    problems.push(`${skill}: has no covering suite and no deferred declaration, so eval:all would imply coverage that does not exist`);
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

  const covered = coveringSuites(manifest).length;
  const authored = manifest.suites.filter((entry) => entry.evalType === 'evaluate-authored').length;
  console.log(
    `✅ ${MANIFEST_RELATIVE_PATH}: ${manifest.suites.length} suite(s) (${covered} covering, ${authored} Evaluate-authored), ` +
      `${manifest.deferred.length} deferred, ${skills.length} TEA skill(s) accounted for`,
  );
  console.log(
    `✅ every suite's thresholds, case count, and runner capabilities match its harness; ` +
      `every declared preflight fails on a missing runner and passes on a present one`,
  );
  console.log(`✅ ${RESULT_SCHEMA_RELATIVE_PATH} matches test/schema/eval-result.js`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error?.stack ?? error);
    process.exit(1);
  });
}

module.exports = { generateResultSchema, generatedContracts, checkEvaluateAuthored, checkAuthoringPaths };
