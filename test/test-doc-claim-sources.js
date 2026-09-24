/**
 * The doc-claims gate's own source module computes what it claims to, and the
 * guards that are not borrowed from an already-tested module actually fire.
 *
 * WHY THIS FILE EXISTS
 *
 * `test/lib/doc-claim-sources.js` is what `eval-quality.config.json`'s
 * `doc-claims` section reads. `npm run test:doc-claims` proves the module's
 * values agree with the published pages today; it proves nothing about
 * whether the module's own derivation logic is correct, and this file is
 * where that logic lives: `FUTURE_KEYS` is parsed out of `module.yaml`'s
 * comment markers rather than hand-listed, `atLeast()` does its own semver
 * comparison, and `keyIsUnread()` decides what counts as "referenced." A shape
 * copied from `test/lib/doc-count-sources.js` (Story 4.1), which reads it
 * independently of the module under test rather than re-running the module's
 * own arithmetic back at itself.
 *
 * Usage: node test/test-doc-claim-sources.js
 */

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const failures = [];

function check(name, fn) {
  try {
    fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.error(`  FAIL  ${name}`);
  }
}

// keyIsUnread's word-boundary check (below) needs a real reference staged
// under src/workflows/ before doc-claim-sources.js is first required: its
// workflowFileBodies cache memoizes at the first call inside that module,
// triggered at module load by RISK_THRESHOLD_UNREAD's own computation, so
// calling keyIsUnread afterward would only ever see the directory listing
// from before this file existed. Cleanup runs once at the very end of this
// file, guarded by SIGINT/SIGTERM handlers so an interrupted run doesn't
// leave the probe file behind under src/workflows -- the same lifecycle
// test/test-clock-port.js uses around its own probe skill.
const workflowsRoot = path.join(__dirname, '..', 'src', 'workflows');
const stagingFile = path.join(workflowsRoot, `doc-claim-sources-test-${process.pid}.md`);
const probeKey = `probe_key_${process.pid}`;
fs.writeFileSync(stagingFile, `if ${probeKey} is set, do the thing\n`);
const removeStagingFile = () => fs.rmSync(stagingFile, { force: true });
process.once('SIGINT', removeStagingFile);
process.once('SIGTERM', removeStagingFile);

const source = require('./lib/doc-claim-sources.js');
const { EXIT, VERDICT_KEYS, SKIP_KEYS } = require('../cli/test-review.js');
const { RECOMMENDATION_ENUM } = require('../cli/lib/parse-report.js');
const { EXIT_CODES: EVALUATE_EXIT_CODES } = require('../cli/evaluate.js');
const { EXIT_CODES: RUNNER_EXIT_CODES } = require('../cli/lib/runner-exit-codes.js');

check('RECOMMENDATION_ENUM is re-exported unchanged from cli/lib/parse-report.js', () => {
  assert.deepStrictEqual(source.RECOMMENDATION_ENUM, RECOMMENDATION_ENUM);
});

check('MOBILE_ROW_IDS and PLAYWRIGHT_UTILS_ROW_IDS match an independent read of criteria-registry.md', () => {
  // Independent of tools/validate-criteria-fragments.js's parseRegistryRows():
  // this re-derives the same two lists from the raw table text with its own
  // pipe-splitting rather than calling the shared parser back with the same
  // predicate strings production already uses, which would prove only that
  // calling one function twice is deterministic, not that the parser or the
  // predicate itself reads the right column.
  const registryPath = path.join(
    __dirname,
    '..',
    'src',
    'workflows',
    'testarch',
    'bmad-testarch-test-review',
    'steps-c',
    'criteria-registry.md',
  );
  const mobileIds = [];
  const playwrightUtilsIds = [];
  for (const line of fs.readFileSync(registryPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());
    if (cells.length < 5) continue;
    const id = cells[0];
    if (!/^[CHML]\d+$/.test(id)) continue;
    const gate = cells.at(-1);
    if (gate.includes('Maestro flow')) mobileIds.push(id);
    if (gate.includes('playwrightUtils')) playwrightUtilsIds.push(id);
  }
  assert.ok(mobileIds.length > 0, 'fixture setup: expected at least one Maestro-flow row in criteria-registry.md');
  assert.ok(playwrightUtilsIds.length > 0, 'fixture setup: expected at least one playwrightUtils row in criteria-registry.md');
  assert.deepStrictEqual(source.MOBILE_ROW_IDS, mobileIds);
  assert.deepStrictEqual(source.PLAYWRIGHT_UTILS_ROW_IDS, playwrightUtilsIds);
});

check(
  'EXIT_CODE_STRINGS is every exit code cli/test-review.js, cli/evaluate.js and the runner table declare, stringified, each once',
  () => {
    // Written out: test-review's 0 to 3, the runner table's 0 and 2 to 6, and tea-evaluate's 0, 10, 12 and 64.
    assert.deepStrictEqual(
      [...source.EXIT_CODE_STRINGS].sort((a, b) => a - b),
      ['0', '1', '2', '3', '4', '5', '6', '10', '12', '64'],
    );
    for (const code of [...Object.values(EXIT), ...Object.values(EVALUATE_EXIT_CODES), ...Object.values(RUNNER_EXIT_CODES)]) {
      assert.ok(source.EXIT_CODE_STRINGS.includes(String(code)), `declared exit ${code} is missing`);
    }
    for (const code of ['10', '12', '64']) assert.ok(source.EXIT_CODE_STRINGS.includes(code), `tea-evaluate's exit ${code} is missing`);
    for (const code of ['2', '3', '4', '5', '6'])
      assert.ok(source.EXIT_CODE_STRINGS.includes(code), `tea-skill-runner's exit ${code} is missing`);
  },
);

check('VERDICT_SCHEMA requires every VERDICT_KEYS.always key and rejects an undeclared one', () => {
  const base = Object.fromEntries(Object.keys(VERDICT_KEYS.always).map((key) => [key, null]));
  assert.strictEqual(source.VERDICT_SCHEMA.safeParse(base).success, true);
  for (const key of Object.keys(VERDICT_KEYS.always)) {
    const missing = { ...base };
    delete missing[key];
    assert.strictEqual(source.VERDICT_SCHEMA.safeParse(missing).success, false, `${key} should be required`);
  }
  assert.strictEqual(source.VERDICT_SCHEMA.safeParse({ ...base, notARealKey: 1 }).success, false);
});

check('SKIP_SCHEMA requires every SKIP_KEYS.always key and rejects an undeclared one', () => {
  const base = Object.fromEntries(Object.keys(SKIP_KEYS.always).map((key) => [key, null]));
  assert.strictEqual(source.SKIP_SCHEMA.safeParse(base).success, true);
  for (const key of Object.keys(SKIP_KEYS.always)) {
    const missing = { ...base };
    delete missing[key];
    assert.strictEqual(source.SKIP_SCHEMA.safeParse(missing).success, false, `${key} should be required`);
  }
  assert.strictEqual(source.SKIP_SCHEMA.safeParse({ ...base, notARealKey: 1 }).success, false);
});

check('FUTURE_KEYS matches an independent walk of module.yaml’s "⏭️ FUTURE" marker positions', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'src', 'module.yaml'), 'utf8');
  const parsed = require('yaml').parse(text);
  const promptedKeys = new Set(
    Object.keys(parsed).filter((key) => typeof parsed[key] === 'object' && parsed[key] !== null && 'prompt' in parsed[key]),
  );
  const lines = text.split('\n');
  const expected = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!/⏭️\s*FUTURE/.test(lines[index])) continue;
    // A marker's group runs through every consecutive prompted key that
    // follows it, not only the first one.
    for (const candidate of lines.slice(index + 1)) {
      if (/⏭️\s*FUTURE/.test(candidate)) break;
      const match = candidate.match(/^([A-Za-z_][A-Za-z0-9_-]*):/);
      if (match === null) continue;
      if (!promptedKeys.has(match[1])) break;
      expected.push(match[1]);
    }
  }
  assert.ok(expected.length > 0, 'fixture setup: expected at least one "⏭️ FUTURE" marker in module.yaml');
  assert.deepStrictEqual(source.FUTURE_KEYS, expected);
});

check('atLeast() compares a real version correctly and refuses a version it cannot parse', () => {
  assert.strictEqual(source.atLeast('3.2.0', '1.4.0'), true);
  assert.strictEqual(source.atLeast('1.3.0', '1.4.0'), false);
  assert.strictEqual(source.atLeast('1.4.0', '1.4.0'), true);
  assert.throws(() => source.atLeast('not-a-version', '1.4.0'), /is not a plain major\.minor\.patch version/);
  assert.throws(() => source.atLeast('1.4', '1.4.0'), /is not a plain major\.minor\.patch version/);
  assert.throws(() => source.atLeast('1.4.0-beta.1', '1.4.0'), /is not a plain major\.minor\.patch version/);

  // A relative require() of package.json reads as an import escaping this
  // file's declared dependency-direction root (test/), since package.json
  // sits outside it; reading it as data through fs keeps the check honest.
  const pin = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).devDependencies['eval-quality'];
  assert.strictEqual(source.EVAL_QUALITY_PIN_IS_4_1_2, pin === '4.1.2');
});

check('keyIsUnread reports a genuinely referenced key as read, not just an injected probe as unread', () => {
  // A genuinely referenced key proves the "read" (false) branch actually
  // fires against real, pre-existing content, so a `.some()`→`.every()` typo
  // (an easy mistake, `.every()` is used one line below on a sibling array in
  // production) cannot silently make every `*_UNREAD` export stay `true`
  // forever with this file still green. tea_use_playwright_utils is
  // confirmed referenced under src/workflows/ by direct grep, so this needs
  // no staged fixture.
  assert.strictEqual(source.keyIsUnread('tea_use_playwright_utils'), false);
});

check('keyIsUnread’s word-boundary check finds a real bare-word reference, not only {key} interpolation', () => {
  // probeKey is staged into stagingFile (top of this file, before
  // doc-claim-sources.js's first require) as a bare word with no surrounding
  // braces, so this calls the real production function rather than
  // re-implementing its search, and a positive result here can only come from
  // the word-boundary regex actually matching prose.
  assert.strictEqual(source.keyIsUnread(probeKey), false, 'a bare-word reference with no surrounding braces should be found');
});

check('misplacedOutputs flags a flat output path and leaves inputs and legacy paths alone', () => {
  // A staged fixture skill outside src/workflows, so the real tree's current
  // state cannot make this pass or fail: one output inside the skill's own
  // folder, one flat at the root (the misplacement), one `_input` key and one
  // `legacy*` frontmatter key that are both flat on purpose.
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-claim-sources-'));
  try {
    const skillDir = path.join(scratch, 'bmad-testarch-probe');
    fs.mkdirSync(path.join(skillDir, 'steps-c'), { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'workflow.yaml'),
      [
        'variables:',
        '  some_input: "{test_artifacts}/some-input.json"',
        'default_output_file: "{test_artifacts}/probe/probe-report-{run_key}.md"',
        'summary_output: "{test_artifacts}/probe-summary.json"',
        '',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(skillDir, 'steps-c', 'step-01b-resume.md'),
      [
        '---',
        "outputFile: '{test_artifacts}/probe/probe-report-{run_key}.md'",
        "legacyOutputFile: '{test_artifacts}/probe-report.md'",
        '---',
        '',
        '# Resume',
        '',
      ].join('\n'),
    );
    const declared = source.declaredOutputPaths(skillDir).map((entry) => entry.value);
    assert.deepStrictEqual([...declared].sort(), [
      '{test_artifacts}/probe-summary.json',
      '{test_artifacts}/probe/probe-report-{run_key}.md',
      '{test_artifacts}/probe/probe-report-{run_key}.md',
    ]);
    assert.deepStrictEqual(
      source.misplacedOutputs(skillDir).map((entry) => entry.value),
      ['{test_artifacts}/probe-summary.json'],
    );
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

check('misplacedOutputs flags a flat write target in a step body and leaves legacy lines and trace root inputs alone', () => {
  // A staged fixture skill whose declared outputs all sit in its own folder, so
  // the one misplacement is the screenshot a step body writes flat at the root.
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-claim-sources-'));
  try {
    const skillDir = path.join(scratch, 'bmad-testarch-probe');
    fs.mkdirSync(path.join(skillDir, 'steps-c'), { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'steps-c', 'step-02-capture.md'),
      [
        '---',
        "outputFile: '{test_artifacts}/probe/probe-report-{run_key}.md'",
        '---',
        '',
        '# Capture',
        '',
        '1. `playwright-cli -s=tea-probe-{run_key} screenshot --filename={test_artifacts}/probe-{run_key}-home.png`',
        '2. `playwright-cli -s=tea-probe-{run_key} screenshot --filename={test_artifacts}/probe/probe-{run_key}-home.png`',
        '3. Fall back to the legacy root `{test_artifacts}/probe-report.md` when the scoped report is absent.',
        '4. Read waivers from `{test_artifacts}/gate-waivers.md` and live results from `{test_artifacts}/live-verification-results.json`.',
        '',
      ].join('\n'),
    );
    assert.deepStrictEqual(
      source.misplacedOutputs(skillDir).map((entry) => `${entry.source} ${entry.value}`),
      ['steps-c/step-02-capture.md {test_artifacts}/probe-{run_key}-home.png'],
    );
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

check('declaredOutputPaths refuses step frontmatter that is not valid YAML, naming the file', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-claim-sources-'));
  try {
    const skillDir = path.join(scratch, 'bmad-testarch-probe');
    fs.mkdirSync(path.join(skillDir, 'steps-c'), { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'steps-c', 'step-01-broken.md'),
      "---\noutputFile: '{test_artifacts}/probe/x.md\n---\n\n# Broken\n",
    );
    assert.throws(
      () => source.declaredOutputPaths(skillDir),
      /doc-claim-sources: .*step-01-broken\.md has frontmatter that is not valid YAML/,
    );
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

check('ELEVEN_WIRED_ONE_FUTURE agrees with a literal list of the eleven wired keys and risk_threshold as the FUTURE one', () => {
  // Literal on purpose: recomputing the lists with the module's own helpers would
  // agree with the module whatever module.yaml said. A key added, removed or
  // re-marked in module.yaml has to be restated here to pass.
  const WIRED = [
    'test_artifacts',
    'tea_evaluations_folder',
    'tea_use_playwright_utils',
    'tea_use_pactjs_utils',
    'tea_pact_mcp',
    'tea_browser_automation',
    'tea_execution_mode',
    'tea_capability_probe',
    'test_stack_type',
    'ci_platform',
    'test_framework',
  ];
  const parsed = require('yaml').parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'module.yaml'), 'utf8'));
  const prompted = Object.keys(parsed).filter((key) => typeof parsed[key] === 'object' && parsed[key] !== null && 'prompt' in parsed[key]);
  assert.deepStrictEqual(source.FUTURE_KEYS, ['risk_threshold']);
  assert.deepStrictEqual(
    prompted.filter((key) => key !== 'risk_threshold'),
    WIRED,
  );
  for (const key of WIRED) assert.strictEqual(source.keyIsUnread(key), false, `${key} is wired, so some workflow file reads it`);
  assert.strictEqual(source.keyIsUnread('risk_threshold'), true, 'risk_threshold is FUTURE, so no workflow file reads it');
  assert.strictEqual(source.ELEVEN_WIRED_ONE_FUTURE, true);
});

check('THIRTY_FOUR_CONCERNS matches an independent count of "CONCERNS" verdicts in expected-strength.json', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'probes', 'expected-strength.json'), 'utf8'));
  let count = 0;
  for (const corpus of Object.values(data)) {
    for (const probe of Object.values(corpus.probes ?? {})) {
      if (probe.verdict === 'CONCERNS') count += 1;
    }
  }
  assert.strictEqual(source.THIRTY_FOUR_CONCERNS, count === 34);
  assert.strictEqual(count, 34);
});

removeStagingFile();
process.off('SIGINT', removeStagingFile);
process.off('SIGTERM', removeStagingFile);

if (failures.length > 0) {
  console.error('\ndoc-claim-sources validation failed:\n');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('doc-claim-sources computes its values correctly.');
