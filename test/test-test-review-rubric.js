/**
 * tea-test-review: the rubric.
 *
 * Two rubric changes ship together, and this file holds each to its evidence:
 *
 *   - Test names are not scored. No row, bonus, convention key or report line
 *     asks whether a test name is behavior-shaped, the bonus tops out at 25, and
 *     the verdict names the rubric version that dropped it.
 *   - H3 and H10 fire on the defect they name. The paired cases below are
 *     review fixtures (adds-defects, covariance-no-checker, covariance-config-only):
 *     a branch that asserts the expected value on every path is not High while an
 *     assertion a guard can skip is, and a type-assignability test is not a
 *     shape-only assertion when CI runs a type checker while the same test with no
 *     checker run by CI, or a value test that accepts every wrong value, still is.
 *
 * The agent judges the pairs; this file proves the fixtures hold the shapes the
 * pairs name and that the rule text discriminates between them. The evaluation
 * corpus is sealed and does not yet carry a probe for the two unchecked fixtures.
 *
 * Usage: node test/test-test-review-rubric.js
 */

const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');

const { parseReport } = require('../cli/lib/parse-report');
const { loadRegistryRowSeverities } = require('../cli/lib/registry-rows');
const { CONVENTION_KEYS } = require('../cli/lib/convention-baseline');
const { buildPrompt } = require('../cli/lib/build-prompt');
const { RUBRIC_VERSION, skillRubricVersion, buildReviewProvenance } = require('../cli/lib/review-provenance');

const repoRoot = path.join(__dirname, '..');
const skillRoot = path.join(repoRoot, 'skills', 'bmad-testarch-test-review');
const reposRoot = path.join(__dirname, 'fixtures', 'test-review-evaluation', 'repos');
const registryRowSeverities = loadRegistryRowSeverities(skillRoot);

let passed = 0;
let failed = 0;

function assert(condition, name, detail) {
  if (condition) {
    passed += 1;
    console.log(`\u001B[32m✓\u001B[0m ${name}`);
  } else {
    failed += 1;
    console.log(`\u001B[31m✗\u001B[0m ${name}`);
    if (detail !== undefined) console.log(`  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
  }
}

function section(name, body) {
  console.log(`\n${name}\n`);
  try {
    body();
  } catch (error) {
    failed += 1;
    console.log(`\u001B[31m✗\u001B[0m ${name} threw: ${error.stack ?? error.message}`);
  }
}

const read = (...segments) => fs.readFileSync(path.join(...segments), 'utf8');
const registry = read(skillRoot, 'steps-c', 'criteria-registry.md');
const row = (id) => registry.split('\n').find((line) => line.startsWith(`| ${id} `)) ?? '';
const skillFiles = (directory = skillRoot) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? skillFiles(full) : [full];
  });

section('test names are not scored', () => {
  assert(
    registryRowSeverities.L5 === undefined && Object.keys(registryRowSeverities).length === 35,
    'the registry has no L5 row and 35 rows in all',
    Object.keys(registryRowSeverities).length,
  );
  const mentions = skillFiles().filter((file) =>
    /bddNaming|excellentBdd|Excellent BDD|BDD Format|Given-When-Then|\bL5\b|Implementation-shaped name|behavioral.naming|six (bonus )?categories|max \+30|0 to 30/i.test(
      fs.readFileSync(file, 'utf8'),
    ),
  );
  assert(
    mentions.length === 0,
    'nothing in the review skill scores, measures or reports test naming',
    mentions.map((file) => path.relative(repoRoot, file)),
  );
  assert(
    !CONVENTION_KEYS.includes('bddNaming') && CONVENTION_KEYS.length === 7,
    'the convention baseline measures seven keys and none of them is test naming',
    CONVENTION_KEYS,
  );
  const prompt = buildPrompt({
    skillRoot,
    files: ['tests/a.spec.ts'],
    outputPath: '/tmp/r.md',
    conventionBaseline: {
      baselineUnavailable: false,
      corpusSize: 8,
      sampled: 8,
      scanned: 8,
      sampledFiles: ['tests/b.spec.ts'],
      conventions: Object.fromEntries(CONVENTION_KEYS.map((key) => [key, { mechanical: false }])),
    },
  });
  assert(!/bddNaming|BDD|Given-When-Then/.test(prompt), 'the prompt never asks the agent to judge test naming');
  assert(
    prompt.includes('multiple of 5 from 0 to 25') && prompt.includes('Each of the five bonus categories'),
    'the prompt states five bonus categories and a 25-point ceiling',
  );

  const template = read(skillRoot, 'test-review-template.md');
  const ledger = template.slice(template.indexOf('Bonus Points:'), template.indexOf('Total Bonus:'));
  assert((ledger.match(/\+\{0\|5\}/g) ?? []).length === 5, 'the template ledger lists five bonus categories', ledger);

  const example = read(skillRoot, 'resources', 'test-review.example.md');
  const withBonus = (total) => example.replace(/^Total Bonus:\s+\+\d+$/m, `Total Bonus:             +${total}`);
  assert(parseReport(withBonus(25), { registryRowSeverities }).findings.length === 3, 'a bonus of 25, five categories at 5, is accepted');
  let rejected = '';
  try {
    parseReport(withBonus(30), { registryRowSeverities });
  } catch (error) {
    rejected = error.message;
  }
  assert(
    /within 0-25/.test(rejected) && /five bonus categories/.test(rejected),
    'a bonus of 30, the old six-category ceiling, is refused',
    rejected,
  );
  assert(
    !/Excellent BDD/.test(example) && (example.match(/^\s+\w[\w -]*:\s+\+\d$/gm) ?? []).length === 5,
    'the example scores five bonus categories',
  );
});

// Reports from different rubrics are not comparable, so a change to what the
// rubric scores must move the version. This digest covers the registry's row table
// and the template's bonus ledger; the failure message says what to bump.
const RUBRIC_DIGEST = '409f946c7a256346';
const rubricDigest = () => {
  const rows = registry
    .split('\n')
    .filter((line) => /^\| [A-Z]\d+ /.test(line))
    .join('\n')
    .replaceAll(/\s+/g, ' ');
  const template = read(skillRoot, 'test-review-template.md');
  const ledger = template.slice(template.indexOf('Bonus Points:'), template.indexOf('Total Bonus:'));
  return crypto.createHash('sha256').update(rows).update(ledger.replaceAll(/\s+/g, ' ')).digest('hex').slice(0, 16);
};

section('the rubric version', () => {
  assert(
    rubricDigest() === RUBRIC_DIGEST,
    `the registry rows and bonus ledger still match the rubric ${RUBRIC_VERSION} digest`,
    `digest is ${rubricDigest()}: if the rubric changed, bump rubric_version in workflow.yaml and RUBRIC_VERSION in cli/lib/review-provenance.js, then update RUBRIC_DIGEST`,
  );
  assert(skillRubricVersion(skillRoot) === '5.0', 'the skill declares rubric 5.0 in workflow.yaml', skillRubricVersion(skillRoot));
  const provenance = buildReviewProvenance({
    projectRoot: repoRoot,
    skillRoot,
    baseRef: 'HEAD',
    filesProvided: true,
    modelIdentifier: null,
  });
  assert(
    provenance.skillRubricVersion === '5.0' && provenance.sources.skillRubricVersion === 'workflow.yaml rubric_version',
    'the verdict reports the rubric version and where it came from',
    provenance,
  );
  assert(RUBRIC_VERSION === skillRubricVersion(skillRoot), 'the version the CLI scores is the version the skill declares');
  assert(skillRubricVersion(path.join(repoRoot, 'skills', 'bmad-testarch-trace')) === null, 'a skill with no rubric version reports null');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-rubric-version-'));
  try {
    const versionOf = (workflow) => {
      fs.writeFileSync(path.join(scratch, 'workflow.yaml'), workflow);
      return skillRubricVersion(scratch);
    };
    assert(versionOf('rubric_version: "5.0"\n') === '5.0', 'a quoted version is read');
    assert(versionOf("rubric_version: '5.0' # note\n") === '5.0', 'a single-quoted version with a trailing comment is read');
    assert(versionOf('rubric_version: 5.0\n') === null, 'an unquoted number is refused, since YAML would read 5.10 as 5.1');
    assert(versionOf('rubric_version:\n') === null, 'an empty version reads as null');
    assert(versionOf('rubric_version: ""\n') === null, 'an empty string reads as null');
    assert(versionOf('rubric_version: latest\n') === null, 'a version that is not dotted digits reads as null');
    assert(versionOf('rubric_version: [5, 0]\n') === null, 'a non-string version reads as null');
    assert(versionOf('name: x\n') === null, 'a workflow with no rubric_version reads as null');
    assert(versionOf('rubric_version: "5.0\n') === null, 'unparseable YAML reads as null');
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

section('H3: a branch that cannot hide a wrong result', () => {
  const fixture = read(reposRoot, 'adds-defects', 'pr', 'tests', 'test_checkout.py');
  assert(
    /@pytest\.mark\.parametrize\(\("code", "expected"\)[\s\S]*?def test_lookup_discount_by_code[\s\S]*?if expected is None:\s+assert rate is None\s+else:\s+assert rate == expected/.test(
      fixture,
    ),
    'the false-positive control is a parameter-driven branch that asserts the expected value on every path',
  );
  assert(
    /def test_discount_lowers_the_total[\s\S]*?total = apply_discount\(cart, "SAVE10"\)\s+if total < cart\.total\(\):\s+assert total == 18\.0/.test(
      fixture,
    ),
    "the true positive is an assertion guarded by the system's own output",
  );
  const h3 = row('H3');
  assert(
    /skipped, swallowed, or selected from the system's own output/.test(h3),
    'H3 names the three ways an assertion is lost',
    h3.slice(0, 200),
  );
  assert(
    /guards an assertion so some path asserts nothing \(whatever decides the branch\)/.test(h3),
    'H3 fires on a guard that leaves a path with no assertion, whatever decides the branch',
  );
  assert(
    /Does not fire: a branch whose condition reads only test inputs[\s\S]*?where every path asserts the expected value/.test(h3),
    'H3 excludes a test-input branch that asserts the expected value on every path',
  );
  assert(
    /A branch decided by the system's own output still fires when every path asserts/.test(h3),
    'H3 still fires on a branch the system output decides when every path asserts a literal',
  );
  assert(
    /Advisory Observation[\s\S]*no severity and no deduction/.test(h3),
    'H3 sends that shape to an advisory observation with no severity and no deduction',
  );
  assert(/\|\s+HIGH\s+\|/.test(h3) && registryRowSeverities.H3 === 'High', 'H3 stays High for the defect it names');
  const worker = read(skillRoot, 'steps-c', 'step-03a-subagent-determinism.md');
  assert(
    /H3 asks whether the assertion can be skipped, swallowed or picked by the system's own output/.test(worker) &&
      /a parameter guard with no `else`[\s\S]*?skips the check for every other case/.test(worker) &&
      /A branch whose condition reads only test inputs[\s\S]*?cannot hide a wrong result: do not emit H3 for it/.test(worker) &&
      /A branch decided by the system's own output fires even when every path asserts \(`if response\.ok: assert body == order`/.test(
        worker,
      ),
    'the determinism worker fires H3 on a parameter guard with no else, stands down on a test-input branch that asserts on every path, and fires when the system output decides',
  );
  const fragment = read(repoRoot, 'skills', 'bmod-tea', 'knowledge', 'test-quality.md');
  assert(
    /A branch in a test is a defect only when it can hide a wrong result/.test(fragment) &&
      /a parameter guard with no `else` skips it for every other case/.test(fragment) &&
      /Drop the `else` and the cases that miss the `if` assert nothing, which is H3/.test(fragment) &&
      /passes a regression that answers 404 for a valid order/.test(fragment),
    'the knowledge fragment teaches the same line, including the parameter guard with no else and the output-decided branch',
  );
});

section('H10: a type-assignability test and a value test', () => {
  const typed = read(reposRoot, 'adds-defects', 'pr', 'tests', 'test_checkout.py');
  const untyped = read(reposRoot, 'covariance-no-checker', 'pr', 'tests', 'test_checkout.py');
  const configOnly = read(reposRoot, 'covariance-config-only', 'pr', 'tests', 'test_checkout.py');
  const covariance =
    /def test_result_is_covariant\(\) -> None:\n {4}receipt = checkout\(Cart\(\)\)\n {4}result: Result\[Receipt\] = wrap\(receipt\)\n {4}widened: Result\[object\] = result\n {4}assert widened\.value is not None/;
  assert(
    covariance.test(typed) && covariance.test(untyped) && covariance.test(configOnly),
    'the covariance test is the same in the checked, the unchecked and the configured-only repository',
  );
  assert(/assert receipt\.total is not None/.test(typed), 'the true positive is a value test that accepts every wrong total');
  const checked = `${read(reposRoot, 'adds-defects', 'base', 'pyproject.toml')}\n${read(reposRoot, 'adds-defects', 'base', '.github', 'workflows', 'ci.yml')}`;
  const unchecked = `${read(reposRoot, 'covariance-no-checker', 'base', 'pyproject.toml')}\n${read(reposRoot, 'covariance-no-checker', 'base', '.github', 'workflows', 'ci.yml')}`;
  assert(/\[tool\.mypy\]/.test(checked) && /run: mypy/.test(checked), 'the checked repository configures and runs mypy');
  assert(!/mypy|pyright/.test(unchecked) && /run: pytest/.test(unchecked), 'the unchecked repository runs pytest and no type checker');
  const configuredOnly = `${read(reposRoot, 'covariance-config-only', 'base', 'pyproject.toml')}\n${read(reposRoot, 'covariance-config-only', 'base', '.github', 'workflows', 'ci.yml')}`;
  const ciRuns = (repo) =>
    [...read(reposRoot, repo, 'base', '.github', 'workflows', 'ci.yml').matchAll(/^\s+- run: (.+)$/gm)].map((match) => match[1]);
  assert(
    /\[tool\.mypy\]/.test(configuredOnly) && ciRuns('covariance-config-only').join('|') === 'pip install pytest|pytest',
    'the configured-only repository declares mypy in pyproject and CI only installs and runs pytest',
  );
  const excludes = `${read(reposRoot, 'covariance-checker-excludes-tests', 'base', 'pyproject.toml')}`;
  assert(
    covariance.test(read(reposRoot, 'covariance-checker-excludes-tests', 'pr', 'tests', 'test_checkout.py')) &&
      ciRuns('covariance-checker-excludes-tests').join('|') === 'pip install pytest mypy|mypy|pytest' &&
      /\[tool\.mypy\][\s\S]*files = \["shop"\]/.test(excludes) &&
      !/tests/.test(excludes.slice(excludes.indexOf('[tool.mypy]'))),
    'the checker-excludes-tests repository runs mypy in CI over shop only, so the test file is never type-checked',
  );
  const h10 = row('H10');
  assert(
    /Four cases do not fire it/.test(h10) && /static type assignability/.test(h10),
    'H10 excludes a static type assignability test',
    h10.slice(0, 200),
  );
  assert(
    /on the test's file \(the checker's file list or `include` covers the test, with no `exclude` or `ignore_errors` for it\)/.test(h10),
    "H10 exempts the test only where the checker covers the test's file",
  );
  assert(
    /mypy, pyright, `tsc`/.test(h10) && /runs a static type checker[^.]*directly or through a script the CI runs/.test(h10),
    'H10 exempts the test only where CI runs the checker',
  );
  assert(
    /a checker that is only configured \(`\[tool\.mypy\]`, `tsconfig\.json`\) and never run asserts nothing about the type, so the row fires/.test(
      h10,
    ),
    'H10 fires on the same test when a checker is configured and CI never runs it',
  );
  assert(
    /value test that accepts every wrong value of the right shape|every wrong value of the right type still passes/.test(h10),
    'H10 keeps the value test that accepts every wrong value',
  );
  assert(/HIGH/.test(h10), 'H10 stays High for the defect it names');
  const worker = read(skillRoot, 'steps-c', 'step-03a-subagent-determinism.md');
  assert(
    /H10 asks whether any wrong value of the right shape passes/.test(worker) &&
      /read the project's CI workflow and the scripts it calls[\s\S]*?for a step that invokes the checker/.test(worker) &&
      /Configuration alone[\s\S]*?does not count[\s\S]*?H10 fires/.test(worker) &&
      /`mypy shop\/` or a `tsconfig` that excludes `\*\*\/\*\.spec\.ts` never checks the test/.test(worker),
    'the determinism worker looks for a step that runs the checker, and configuration alone does not exempt',
  );
  const fragment = read(repoRoot, 'skills', 'bmod-tea', 'knowledge', 'test-quality.md');
  assert(
    /Read the project's CI and type-check configuration/.test(fragment) &&
      /static type check that CI runs/.test(fragment) &&
      /only configured[\s\S]*?never run does not count/.test(fragment),
    'the knowledge fragment teaches the same line',
  );
});

section('genuine broken assertions stay severe', () => {
  const full = read(reposRoot, 'full-file', 'base', 'tests', 'test_ledger.py');
  assert(
    /except AssertionError:\n\s+pass/.test(full) && /for [^\n]* in [^\n]*:\n\s+assert/.test(full),
    'the full-file fixture keeps a swallowed assertion and a loop that may never run',
  );
  assert(
    registryRowSeverities.H3 === 'High' && registryRowSeverities.H10 === 'High',
    'both rows are High in the registry map',
    registryRowSeverities,
  );
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
