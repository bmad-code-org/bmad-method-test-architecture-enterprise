/**
 * TEA's own answers for the `doc-claims` gate: the artifacts its published
 * pages' prose claims are held against, each read from the source that owns
 * it rather than re-typed. Shape copied from `test/lib/doc-count-sources.js`
 * (Story 4.1) and from eval-quality's own `scripts/doc-claim-sources.ts`.
 *
 * Every guard here throws rather than returning a wrong answer, so a gate
 * refusal names this module instead of holding a page against a silently
 * wrong value.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { z } = require('zod');
const yaml = require('yaml');
const TOML = require('smol-toml');

const { parseRegistryRows } = require('../../tools/validate-criteria-fragments.js');
const { EXIT, VERDICT_KEYS, SKIP_KEYS } = require('../../cli/test-review.js');
const { RECOMMENDATION_ENUM } = require('../../cli/lib/parse-report.js');
const { EXIT_CODES: EVALUATE_EXIT_CODES } = require('../../cli/evaluate.js');
const { EXIT_CODES: RUNNER_EXIT_CODES } = require('../../cli/lib/runner-exit-codes.js');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

function refuse(message) {
  throw new Error(`doc-claim-sources: ${message}`);
}

// ---------------------------------------------------------------------------
// lists
// ---------------------------------------------------------------------------

/** The four-member recommendation enum, held in docs/reference/tea-test-review-cli.md. */
exports.RECOMMENDATION_ENUM = RECOMMENDATION_ENUM;

/**
 * The criteria-registry row ids tagged for a Maestro flow and for
 * playwright-utils adoption, held in docs/reference/execution-targets.md.
 * Read from `criteria-registry.md`'s own "Applicability"/"Convention" column
 * via the parser `tools/validate-criteria-fragments.js` already owns, rather
 * than a second copy of the table's cell-count and id-shape rules.
 */
const registryRows = parseRegistryRows();
if (registryRows.length === 0) refuse('criteria-registry.md parsed to zero rows');

exports.MOBILE_ROW_IDS = registryRows.filter((row) => row.gate.includes('Maestro flow')).map((row) => row.id);
exports.PLAYWRIGHT_UTILS_ROW_IDS = registryRows.filter((row) => row.gate.includes('playwrightUtils')).map((row) => row.id);

if (exports.MOBILE_ROW_IDS.length === 0) refuse('no criteria-registry row is tagged for a Maestro flow');
if (exports.PLAYWRIGHT_UTILS_ROW_IDS.length === 0) refuse('no criteria-registry row is tagged for playwright-utils adoption');

// ---------------------------------------------------------------------------
// fences
// ---------------------------------------------------------------------------

/**
 * Zod schemas for the review verdict and skip payload, built from `VERDICT_KEYS`
 * and `SKIP_KEYS` themselves rather than duplicated by hand, so a key added or
 * dropped there changes what the docs' worked examples are held against with
 * no second edit. `always` keys are required, `conditional` keys are optional,
 * and no other key is allowed, mirroring `assertDeclaredKeys` in
 * `cli/test-review.js`: that function checks presence, not the per-key type
 * hint `VERDICT_KEYS`/`SKIP_KEYS` carry, so this schema does the same and no
 * more.
 */
// `z.unknown()` alone accepts a missing key as readily as a present one, since
// an absent property parses as `undefined` and unknown admits that too; the
// refinement is what actually enforces presence for an `always` key.
const required = () => z.unknown().refine((value) => value !== undefined, { message: 'is required' });

function schemaFromKeys(keys) {
  // `always` and `conditional` are each a spread from a shared source merged
  // with hand-listed keys, two different merges into the same two objects, so
  // nothing already guarantees they're disjoint; building `conditional` after
  // `always` below would otherwise let an overlapping key silently demote a
  // required field to optional with no error.
  const overlap = Object.keys(keys.always).filter((key) => key in keys.conditional);
  if (overlap.length > 0) refuse(`"${overlap.join(', ')}" is declared both always and conditional`);
  const shape = {};
  for (const key of Object.keys(keys.always)) shape[key] = required();
  for (const key of Object.keys(keys.conditional)) shape[key] = z.unknown().optional();
  return z.object(shape).strict();
}

exports.VERDICT_SCHEMA = schemaFromKeys(VERDICT_KEYS);
exports.SKIP_SCHEMA = schemaFromKeys(SKIP_KEYS);

// ---------------------------------------------------------------------------
// codes
// ---------------------------------------------------------------------------

/**
 * The exit codes `tea-test-review`, `tea-evaluate` and the runners, whose table
 * `tea-skill-runner` documents, spell, as strings (`readModuleStrings` reads an
 * array of strings), each code once. `tea-evaluate preflight` also passes an
 * eval-quality stage's exit through, and every one of those codes (3 to 5, and
 * 64) is among them.
 */
exports.EXIT_CODE_STRINGS = [
  ...new Set([...Object.values(EXIT), ...Object.values(EVALUATE_EXIT_CODES), ...Object.values(RUNNER_EXIT_CODES)].map(String)),
];

// ---------------------------------------------------------------------------
// dated
// ---------------------------------------------------------------------------

const manifest = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'test', 'evals', 'suite-manifest.json'), 'utf8'));
if (!Array.isArray(manifest.deferred)) refuse('suite-manifest.json has no "deferred" array');
const deferredSkills = new Set(manifest.deferred.map((entry) => entry.skill));

/** docs/explanation/eval-quality-adoption-guide.md, "none of the eight skills fragment selection spans is still listed as deferred." */
const fragmentSelectionSuite = manifest.suites.find((suite) => suite.id === 'fragment-selection');
if (fragmentSelectionSuite === undefined) refuse('suite-manifest.json registers no suite with id "fragment-selection"');
const fragmentSelectionSkills = fragmentSelectionSuite.skills ?? [];
if (fragmentSelectionSkills.length === 0) refuse('the fragment-selection suite names no skills');
exports.NO_FRAGMENT_SELECTION_SKILL_DEFERRED = fragmentSelectionSkills.filter((skill) => deferredSkills.has(skill)).length === 0;

/**
 * docs/explanation/eval-quality-adoption-guide.md:203, "the 34 CONCERNS the
 * stored corpus scores, every one of which test/probes/expected-strength.json
 * already records as expected."
 */
const expectedStrength = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'test', 'probes', 'expected-strength.json'), 'utf8'));
let concernsCount = 0;
for (const corpus of Object.values(expectedStrength)) {
  for (const probe of Object.values(corpus.probes ?? {})) {
    if (probe.verdict === 'CONCERNS') concernsCount += 1;
  }
}
exports.THIRTY_FOUR_CONCERNS = concernsCount === 34;

/**
 * docs/explanation/eval-quality-command-adapter.md:255,273, "as of 1.4.0."
 * The claim is about when a capability arrived, so this compares `>=`, not
 * `==`, against the lockfile-resolved release: updating the lockfile further
 * keeps the claim true.
 */
// Read the lockfile as data through fs. A relative require() would cross
// test/'s declared dependency-direction root.
const evalQualityVersion = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package-lock.json'), 'utf8')).packages?.[
  'node_modules/eval-quality'
]?.version;
if (!evalQualityVersion) refuse('package-lock.json has no resolved eval-quality version');

function atLeast(version, floor) {
  const parsed = version
    .replace(/^[^\d]*/, '')
    .split('.')
    .map(Number);
  if (parsed.length !== 3 || parsed.some((part) => Number.isNaN(part))) {
    refuse(`"${version}" is not a plain major.minor.patch version this comparison can read`);
  }
  const [major, minor, patch] = parsed;
  const [floorMajor, floorMinor, floorPatch] = floor.split('.').map(Number);
  if (major !== floorMajor) return major > floorMajor;
  if (minor !== floorMinor) return minor > floorMinor;
  return patch >= floorPatch;
}
exports.atLeast = atLeast;
exports.EVAL_QUALITY_AT_LEAST_1_4_0 = atLeast(evalQualityVersion, '1.4.0');

/** docs/explanation/eval-quality-roadmap.md:167, "Every harness has probed through the port as of `eval-quality` 1.2.0." */
exports.EVAL_QUALITY_AT_LEAST_1_2_0 = atLeast(evalQualityVersion, '1.2.0');

/** docs/explanation/eval-quality-roadmap.md:169, "every authorization has declared which environment keys its requests may carry since 3.0.0." */
exports.EVAL_QUALITY_AT_LEAST_3_0_0 = atLeast(evalQualityVersion, '3.0.0');

/**
 * docs/explanation/eval-quality-roadmap.md:168, "The lockfile records the
 * resolved eval-quality release." The claim holds when the lockfile entry has
 * a plain release version. Capability floors above use the same version.
 */
exports.EVAL_QUALITY_LOCKFILE_RECORDS_RELEASE = /^\d+\.\d+\.\d+$/.test(evalQualityVersion);

/** README.md:410, "All 35 rows are currently mapped across 51 anchors." */
const { MANIFEST: fragmentManifest } = require('../../tools/validate-criteria-fragments.js');
exports.THIRTY_FIVE_ROWS_MAPPED = registryRows.length === 35 && Object.keys(fragmentManifest).length === registryRows.length;

/** docs/how-to/workflows/run-atdd.md:8, "TEA currently emits these scaffolds with `test.skip()`." */
const atddStepsRoot = path.join(PROJECT_ROOT, 'skills', 'bmad-testarch-atdd', 'steps-c');
const atddStepFiles = fs.existsSync(atddStepsRoot) ? fs.readdirSync(atddStepsRoot).filter((name) => name.endsWith('.md')) : [];
if (atddStepFiles.length === 0) refuse(`${atddStepsRoot} has no step files`);
exports.ATDD_EMITS_TEST_SKIP = atddStepFiles.some((name) => fs.readFileSync(path.join(atddStepsRoot, name), 'utf8').includes('test.skip('));

/**
 * A key is read either as a bare `{key}` interpolation (the template
 * substitution shape, e.g. `harness-pipeline-template.yaml`'s
 * `Framework: {test_framework}`) or as the key name on its own word boundary
 * (the shape a checklist uses for a conditional, e.g. "if `tea_use_playwright_utils`
 * is true"). Checking only the interpolation shape would report a key read
 * exclusively through a conditional as unread; checking both is what makes
 * "this key is genuinely referenced nowhere" a claim about the whole codebase
 * rather than about one reference style.
 */
// `keyIsUnread` is called once per setup key below. Walking every workflow file
// from disk on each call multiplies that cost by the key count
// for no reason: the tree does not change mid-load, so the walk and every
// file's contents are read once and reused.
let workflowFileBodies = null;

/**
 * What a workflow reads: every workflow skill folder plus the shared knowledge
 * base. The bmad-tea agent and the bmod-tea record are left out; bmod.toml
 * declares the setup keys, so counting it would mark every key as read.
 */
function workflowReadRoots() {
  const skillsRoot = path.join(PROJECT_ROOT, 'skills');
  return [
    ...fs
      .readdirSync(skillsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== 'bmad-tea' && !entry.name.startsWith('bmod-'))
      .map((entry) => path.join(skillsRoot, entry.name)),
    path.join(skillsRoot, 'bmod-tea', 'knowledge'),
  ];
}

function readWorkflowFileBodies() {
  if (workflowFileBodies === null) {
    workflowFileBodies = workflowReadRoots().flatMap((root) =>
      fs
        .readdirSync(root, { recursive: true })
        .filter((name) => fs.statSync(path.join(root, name)).isFile())
        .map((name) => fs.readFileSync(path.join(root, name), 'utf8')),
    );
  }
  return workflowFileBodies;
}

function keyIsUnread(key) {
  const wordBoundary = new RegExp(`\\b${key}\\b`);
  return !readWorkflowFileBodies().some((body) => wordBoundary.test(body));
}
exports.keyIsUnread = keyIsUnread;

exports.RISK_THRESHOLD_UNREAD = keyIsUnread('risk_threshold');

/**
 * README.md's "Eleven are wired" sentence and configuration.md's "Declared but
 * Not Yet Wired" sentence: the keys `skills/bmod-tea/bmod.toml` asks at setup
 * against a grep of the workflow skills and the knowledge base. A setup key no workflow
 * reads is a FUTURE key.
 */
const bmodToml = TOML.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'skills', 'bmod-tea', 'bmod.toml'), 'utf8'));
const configQuestions = bmodToml.bmod?.config_questions;
if (!Array.isArray(configQuestions) || configQuestions.length === 0) refuse('skills/bmod-tea/bmod.toml has no [[bmod.config_questions]]');
const SETUP_KEYS = configQuestions.map((question, index) => {
  if (typeof question.key !== 'string' || question.key.length === 0) {
    refuse(`skills/bmod-tea/bmod.toml's config question ${index + 1} has no key`);
  }
  return question.key;
});
exports.SETUP_KEYS = SETUP_KEYS;

const FUTURE_KEYS = SETUP_KEYS.filter((key) => keyIsUnread(key));
exports.FUTURE_KEYS = FUTURE_KEYS;

/** Every key setup asks is read somewhere in a workflow skill or the knowledge base. */
exports.EVERY_SETUP_KEY_WIRED = FUTURE_KEYS.length === 0;

/** configuration.md, "no workflow reads it yet": exactly one setup key that nothing reads. */
exports.ONE_FUTURE_KEY_UNREAD = FUTURE_KEYS.length === 1;

/** README.md, "Eleven are wired into workflows today": eleven setup keys are read and one is not. */
exports.ELEVEN_WIRED_ONE_FUTURE = SETUP_KEYS.length - FUTURE_KEYS.length === 11 && exports.ONE_FUTURE_KEY_UNREAD;

// ---------------------------------------------------------------------------
// output layout
// ---------------------------------------------------------------------------

/**
 * The folder rule configuration.md's "Output Layout" section states: every
 * testarch workflow writes under `{test_artifacts}/<workflow>/`, where
 * `<workflow>` is the skill directory name without its `bmad-testarch-` prefix.
 *
 * A workflow's declared output paths are every `{test_artifacts}/...` string in
 * its `workflow.yaml` (any depth, so `outputs[].path` and trace's named
 * `*_output` keys count) and every `{test_artifacts}/...` value in the YAML
 * frontmatter of its `steps-c/`, `steps-e/` and `steps-v/` files. Two kinds of
 * value are inputs rather than outputs and are left out on purpose: a
 * `workflow.yaml` key ending in `_input` (trace's `live-verification-results.json`
 * and `gate-waivers.md`, whose published contract is the root of
 * `{test_artifacts}`), and a frontmatter key starting with `legacy` (the flat
 * pre-folder path a resume step migrates from).
 *
 * A step body can name a write target too, for example a screenshot's
 * `--filename={test_artifacts}/<file>.png`, so every `{test_artifacts}/<file>.<ext>`
 * that sits flat at the root in a step body is a misplaced output as well.
 * A body line that marks the path as an older location (legacy, pre-folder,
 * pre-scoping, or written by older TEA versions) names a place to read from,
 * and trace's two root inputs keep their published root location, so both
 * are left out.
 */
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

function frontmatterOf(text, file = '(unnamed file)') {
  const match = FRONTMATTER.exec(text);
  if (match === null) return {};
  let parsed;
  try {
    parsed = yaml.parse(match[1]);
  } catch (error) {
    refuse(`${file} has frontmatter that is not valid YAML: ${error.message}`);
  }
  return parsed !== null && typeof parsed === 'object' ? parsed : {};
}

function bodyOf(text) {
  const match = FRONTMATTER.exec(text);
  return match === null ? text : text.slice(match[0].length);
}

// A line naming an older location reads from it; it never writes there.
const LEGACY_LINE = /legacy|pre-folder|pre-scoping|older TEA versions/i;
// trace's workflow.yaml `*_input` files, whose published contract is the root of `{test_artifacts}`.
const ROOT_INPUTS = new Set(['live-verification-results.json', 'gate-waivers.md']);
const FLAT_TARGET = /\{test_artifacts\}\/([^/\s`'"()[\]]+\.[A-Za-z0-9]+)(?![^\s`'"()[\]]*\/)/g;

function flatBodyTargets(skillDir) {
  const found = [];
  for (const stepsDir of ['steps-c', 'steps-e', 'steps-v']) {
    const root = path.join(skillDir, stepsDir);
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root).filter((each) => each.endsWith('.md'))) {
      const lines = bodyOf(fs.readFileSync(path.join(root, name), 'utf8')).split(/\r?\n/);
      for (const line of lines) {
        if (LEGACY_LINE.test(line)) continue;
        for (const match of line.matchAll(FLAT_TARGET)) {
          if (ROOT_INPUTS.has(match[1])) continue;
          found.push({ source: `${stepsDir}/${name}`, key: null, value: `{test_artifacts}/${match[1]}` });
        }
      }
    }
  }
  return found;
}

function collectTestArtifactPaths(value, key, found) {
  if (typeof value === 'string') {
    if (value.startsWith('{test_artifacts}/')) found.push({ key, value });
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectTestArtifactPaths(item, key, found);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [childKey, child] of Object.entries(value)) collectTestArtifactPaths(child, childKey, found);
  }
}

function declaredOutputPaths(skillDir) {
  const found = [];
  const workflowYamlPath = path.join(skillDir, 'workflow.yaml');
  if (fs.existsSync(workflowYamlPath)) {
    const fromYaml = [];
    collectTestArtifactPaths(yaml.parse(fs.readFileSync(workflowYamlPath, 'utf8')), null, fromYaml);
    for (const entry of fromYaml) {
      if (entry.key !== null && entry.key.endsWith('_input')) continue;
      found.push({ source: 'workflow.yaml', ...entry });
    }
  }
  for (const stepsDir of ['steps-c', 'steps-e', 'steps-v']) {
    const root = path.join(skillDir, stepsDir);
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root).filter((each) => each.endsWith('.md'))) {
      const file = path.join(root, name);
      const frontmatter = frontmatterOf(fs.readFileSync(file, 'utf8'), file);
      for (const [key, value] of Object.entries(frontmatter)) {
        if (key.startsWith('legacy')) continue;
        if (typeof value === 'string' && value.startsWith('{test_artifacts}/')) found.push({ source: `${stepsDir}/${name}`, key, value });
      }
    }
  }
  return found;
}

/**
 * The declared output paths of one skill directory that sit outside its own
 * `{test_artifacts}/<workflow>/` folder. Takes the directory so the test file
 * can point it at a staged fixture skill as well as a real one.
 */
function misplacedOutputs(skillDir) {
  const folder = path.basename(skillDir).replace(/^bmad-testarch-/, '');
  return [
    ...declaredOutputPaths(skillDir).filter((entry) => !entry.value.startsWith(`{test_artifacts}/${folder}/`)),
    ...flatBodyTargets(skillDir),
  ];
}
exports.declaredOutputPaths = declaredOutputPaths;
exports.flatBodyTargets = flatBodyTargets;
exports.misplacedOutputs = misplacedOutputs;

// Evaluate is the one `bmad-testarch-*` skill that writes nowhere under
// `{test_artifacts}`: its evaluation folders live under its own
// `evaluations_folder` customization (`{workflow.evaluations_folder}`), so the
// folder rule does not govern it.
const testarchRoot = path.join(PROJECT_ROOT, 'skills');
const layoutSkillDirs = fs
  .readdirSync(testarchRoot)
  .filter((name) => name.startsWith('bmad-testarch-') && name !== 'bmad-testarch-evaluate')
  .map((name) => path.join(testarchRoot, name));
if (layoutSkillDirs.length === 0) refuse(`${testarchRoot} has no bmad-testarch-* skill directories`);

/**
 * configuration.md, "Outputs land in one folder per workflow": every
 * governed workflow declares at least one output path, and none of them sits
 * outside that workflow's own folder.
 */
exports.OUTPUTS_IN_WORKFLOW_FOLDERS = layoutSkillDirs.every(
  (skillDir) => declaredOutputPaths(skillDir).length > 0 && misplacedOutputs(skillDir).length === 0,
);
