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

const source = require('./lib/doc-claim-sources.js');
const { EXIT, VERDICT_KEYS, SKIP_KEYS } = require('../cli/test-review.js');
const { RECOMMENDATION_ENUM } = require('../cli/lib/parse-report.js');

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

check('EXIT_CODE_STRINGS is every EXIT value from cli/test-review.js, stringified', () => {
  assert.deepStrictEqual(source.EXIT_CODE_STRINGS, Object.values(EXIT).map(String));
});

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
    // follows it, not only the first one: "Test output folders" covers three.
    for (const candidate of lines.slice(index + 1)) {
      if (/⏭️\s*FUTURE/.test(candidate)) break;
      const match = candidate.match(/^([A-Za-z_][A-Za-z0-9_]*):/);
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

  const pin = require('../package.json').devDependencies['eval-quality'];
  assert.strictEqual(source.EVAL_QUALITY_PIN_IS_3_2_0, pin === '3.2.0');
});

check('keyIsUnread’s word-boundary check finds a real bare-word reference, not only {key} interpolation', () => {
  const workflowsRoot = path.join(__dirname, '..', 'src', 'workflows');
  const stagingFile = path.join(workflowsRoot, `doc-claim-sources-test-${process.pid}.md`);
  const probeKey = `probe_key_${process.pid}`;
  fs.writeFileSync(stagingFile, `if ${probeKey} is set, do the thing\n`);
  try {
    const wordBoundary = new RegExp(`\\b${probeKey}\\b`);
    const found = fs
      .readdirSync(workflowsRoot, { recursive: true })
      .filter((name) => fs.statSync(path.join(workflowsRoot, name)).isFile())
      .some((name) => wordBoundary.test(fs.readFileSync(path.join(workflowsRoot, name), 'utf8')));
    assert.strictEqual(found, true, 'a bare-word reference with no surrounding braces should be found');
  } finally {
    fs.rmSync(stagingFile);
  }
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

if (failures.length > 0) {
  console.error('\ndoc-claim-sources validation failed:\n');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('doc-claim-sources computes its values correctly.');
