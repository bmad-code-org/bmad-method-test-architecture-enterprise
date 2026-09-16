/**
 * Scores a generated `bmad-testarch-framework` scaffold's contents.
 *
 * No generated scaffold is ever inspected: the workflow's own step files (config,
 * fixtures, sample tests, package.json scripts, and a three-part hook registration)
 * are trusted to have produced what they describe, with nothing to catch a scaffold
 * that is structurally present but substantively wrong. That is exactly the failure
 * a file-count or directory-existence check cannot see, and exactly what this file
 * scores instead: each category returns its own `{ ok, problems }`, never folded
 * into one boolean, so a report can say precisely what is wrong and where.
 *
 * SCOPE
 *
 * One canonical path only: frontend stack, Playwright, TypeScript, Playwright Utils
 * enabled, no Pact. `test/fixtures/framework-scaffold/clean/` is that scaffold,
 * built to what `steps-c/step-03-scaffold-framework.md` and
 * `steps-c/step-04-docs-and-scripts.md` describe. This suite does not attempt to
 * cover every stack/language/Pact combination the workflow supports (frontend,
 * backend in five languages, mobile, contract testing) — say so here plainly rather
 * than implying full coverage.
 *
 * WHAT THIS FILE DOES NOT DO
 *
 * Executes nothing: no agent call, no `npm install`, no network. Every check is a
 * static read of the fixture tree. Installing and smoke-testing the scaffold is
 * Story 6.9's suite, declared separately so its wall clock and its network
 * dependency never gate this one.
 *
 * SELF-TESTING BY MUTATION
 *
 * Each category is proven to fail by copying the clean fixture to a scratch temp
 * directory, mutating one thing, rescoring, and asserting that exactly the targeted
 * category fails while every other category still reports ok — rather than by
 * committing nine near-duplicate defect fixtures. The scratch directory is removed
 * in `finally` on every case.
 *
 * Usage: node test/test-framework-scaffold.js
 * Exit codes: 0 every category ok and every seeded mutation proved, 1 otherwise
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PROJECT_ROOT = path.join(__dirname, '..');
const CLEAN_FIXTURE_DIR = path.join(__dirname, 'fixtures', 'framework-scaffold', 'clean');
const REAL_HOOK_PATH = path.join(
  PROJECT_ROOT,
  'src',
  'workflows',
  'testarch',
  'bmad-testarch-framework',
  'resources',
  'hooks',
  'tea-enforce.cjs',
);

const colors = {
  reset: '[0m',
  red: '[31m',
  green: '[32m',
  yellow: '[33m',
  cyan: '[36m',
  dim: '[2m',
};

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

function readText(dir, relPath) {
  try {
    return fs.readFileSync(path.join(dir, relPath), 'utf8');
  } catch {
    return null;
  }
}

/** `{ value, error }`: `error` is set on a missing file or invalid JSON, never both null with no value. */
function readJson(dir, relPath) {
  const text = readText(dir, relPath);
  if (text === null) return { value: null, error: `${relPath} is missing` };
  try {
    return { value: JSON.parse(text), error: null };
  } catch (error) {
    return { value: null, error: `${relPath} is not valid JSON (${error.message})` };
  }
}

function ok(problems) {
  return { ok: problems.length === 0, problems };
}

// ---------------------------------------------------------------------------
// Tiny scope-aware text helpers
//
// TypeScript 7's package no longer exports a parser (`createSourceFile` and
// friends are gone from both the root entry and `typescript/unstable/ast`,
// which carries type guards and a scanner but nothing that builds a tree from
// source text), so structural checks below use hand-rolled, brace/string-aware
// scoping instead of a real AST. Each function tracks nesting depth and string
// state as it scans, which is what lets a check see "is this key a direct,
// active property of this specific object literal" rather than "does this
// text appear anywhere in the file" -- the gap a commented-out setting or a
// setting moved one level deeper both exploit against a plain regex over the
// whole file.
// ---------------------------------------------------------------------------

/** Removes `//` and `/* *\/` comments while leaving string/template contents untouched. */
function stripComments(source) {
  let result = '';
  let i = 0;
  let inLineComment = false;
  let inBlockComment = false;
  let stringChar = null;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (inLineComment) {
      if (c === '\n') {
        inLineComment = false;
        result += c;
      }
      i += 1;
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && next === '/') {
        inBlockComment = false;
        i += 2;
        continue;
      }
      if (c === '\n') result += c;
      i += 1;
      continue;
    }
    if (stringChar) {
      result += c;
      if (c === '\\') {
        result += next ?? '';
        i += 2;
        continue;
      }
      if (c === stringChar) stringChar = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      stringChar = c;
      result += c;
      i += 1;
      continue;
    }
    if (c === '/' && next === '/') {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (c === '/' && next === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }
    result += c;
    i += 1;
  }
  return result;
}

/** The substring strictly inside the `{`/`}` pair opening at `openBraceIndex`, or null if unbalanced. */
function extractBraceBody(source, openBraceIndex) {
  if (source[openBraceIndex] !== '{') return null;
  let depth = 0;
  for (let i = openBraceIndex; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openBraceIndex + 1, i);
    }
  }
  return null;
}

/** Splits an object literal's body into its top-level `key: value` segments, never inside a nested brace/bracket/paren/string. */
function splitTopLevel(objectBody) {
  const parts = [];
  let depth = 0;
  let current = '';
  let stringChar = null;
  for (let i = 0; i < objectBody.length; i += 1) {
    const c = objectBody[i];
    if (stringChar) {
      current += c;
      if (c === '\\') {
        current += objectBody[i + 1] ?? '';
        i += 1;
        continue;
      }
      if (c === stringChar) stringChar = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      stringChar = c;
      current += c;
      continue;
    }
    if (c === '{' || c === '[' || c === '(') {
      depth += 1;
      current += c;
      continue;
    }
    if (c === '}' || c === ']' || c === ')') {
      depth -= 1;
      current += c;
      continue;
    }
    if (c === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += c;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/** `{ key: 'value text, exactly as written' }` for every direct property of an object literal's body. Nested objects stay as one opaque value. */
function topLevelProperties(objectBody) {
  const map = new Map();
  for (const part of splitTopLevel(objectBody)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;
    const key = trimmed
      .slice(0, colonIndex)
      .trim()
      .replaceAll(/^['"]|['"]$/g, '');
    map.set(key, trimmed.slice(colonIndex + 1).trim());
  }
  return map;
}

/** The direct properties of the object literal `defineConfig(...)` is called with, or null if no such call is found. */
function defineConfigProperties(strippedSource) {
  const call = /\bdefineConfig\s*\(\s*\{/.exec(strippedSource);
  if (!call) return null;
  const openBrace = strippedSource.indexOf('{', call.index);
  const body = extractBraceBody(strippedSource, openBrace);
  return body === null ? null : topLevelProperties(body);
}

/** The direct properties of the object literal a `key: {` value holds within `properties`, or an empty map if absent/not an object. */
function nestedObjectProperties(strippedSource, properties, key) {
  const value = properties.get(key);
  if (!value || !value.startsWith('{')) return new Map();
  const body = extractBraceBody(value, 0);
  return body === null ? new Map() : topLevelProperties(body);
}

// ---------------------------------------------------------------------------
// Category: config (playwright.config.ts)
// ---------------------------------------------------------------------------

const TOP_LEVEL_CONFIG_CHECKS = [
  { key: 'fullyParallel', label: 'fullyParallel: true', matches: (value) => value === 'true' },
  { key: 'timeout', label: 'top-level timeout: 60000', matches: (value) => value === '60000' },
  { key: 'reporter', label: 'HTML reporter', matches: (value) => /['"]html['"]/.test(value) },
  { key: 'reporter', label: 'JUnit reporter', matches: (value) => /['"]junit['"]/.test(value) },
];

const USE_CONFIG_CHECKS = [
  { key: 'actionTimeout', label: 'use.actionTimeout: 15000', matches: (value) => value === '15000' },
  { key: 'navigationTimeout', label: 'use.navigationTimeout: 30000', matches: (value) => value === '30000' },
  {
    key: 'trace',
    label: "use.trace: 'retain-on-failure-and-retries'",
    matches: (value) => /^['"]retain-on-failure-and-retries['"]$/.test(value),
  },
  { key: 'screenshot', label: "use.screenshot: 'only-on-failure'", matches: (value) => /^['"]only-on-failure['"]$/.test(value) },
  { key: 'video', label: "use.video: 'retain-on-failure'", matches: (value) => /^['"]retain-on-failure['"]$/.test(value) },
  { key: 'baseURL', label: 'use.baseURL env fallback (BASE_URL)', matches: (value) => /process\.env\.BASE_URL/.test(value) },
];

function scoreConfig(dir) {
  const source = readText(dir, 'playwright.config.ts');
  if (source === null) return ok(['playwright.config.ts is missing']);

  const stripped = stripComments(source);
  const topLevel = defineConfigProperties(stripped);
  if (!topLevel) return ok(['no defineConfig({...}) call found']);
  const useProps = nestedObjectProperties(stripped, topLevel, 'use');

  const problems = [];
  for (const check of TOP_LEVEL_CONFIG_CHECKS) {
    const value = topLevel.get(check.key);
    if (value === undefined || !check.matches(value)) problems.push(`missing ${check.label}`);
  }
  for (const check of USE_CONFIG_CHECKS) {
    const value = useProps.get(check.key);
    if (value === undefined || !check.matches(value)) problems.push(`missing ${check.label}`);
  }
  return ok(problems);
}

// ---------------------------------------------------------------------------
// Category: env (.env.example, .nvmrc)
// ---------------------------------------------------------------------------

function scoreEnv(dir) {
  const problems = [];
  const envExample = readText(dir, '.env.example');
  if (envExample === null) {
    problems.push('.env.example is missing');
  } else {
    for (const key of ['TEST_ENV', 'BASE_URL', 'API_URL']) {
      if (!new RegExp(`^${key}=`, 'm').test(envExample)) problems.push(`.env.example is missing ${key}`);
    }
  }

  const nvmrc = readText(dir, '.nvmrc');
  if (nvmrc === null) {
    problems.push('.nvmrc is missing');
  } else if (!/^(?:\d+(?:\.\d+){0,2}|lts\/[\w.*-]+)\s*$/.test(nvmrc.trim())) {
    problems.push(`.nvmrc does not name a Node version (got ${JSON.stringify(nvmrc.trim())})`);
  }

  return ok(problems);
}

// ---------------------------------------------------------------------------
// Category: merged fixtures (tests/support/merged-fixtures.ts)
// ---------------------------------------------------------------------------

const REQUIRED_MERGED_FIXTURES = ['apiRequestFixture', 'recurseFixture', 'interceptFixture', 'networkErrorFixture', 'authFixture'];

function scoreMergedFixtures(dir) {
  const source = readText(dir, 'tests/support/merged-fixtures.ts');
  if (source === null) return ok(['tests/support/merged-fixtures.ts is missing']);

  const problems = [];
  const call = /mergeTests\(([^)]*)\)/.exec(source);
  if (!call) {
    problems.push('no mergeTests(...) call found');
    return ok(problems);
  }
  const merged = new Set(call[1].split(',').map((entry) => entry.trim()));
  for (const name of REQUIRED_MERGED_FIXTURES) {
    if (!merged.has(name)) problems.push(`mergeTests(...) is missing ${name}`);
  }
  if (!/export\s*\{\s*expect\s*\}\s*from\s*['"]@playwright\/test['"]/.test(source)) {
    problems.push("missing `export { expect } from '@playwright/test'`");
  }
  if (!/export\s*\{\s*log\s*\}/.test(source)) {
    problems.push('missing `export { log }`');
  }
  return ok(problems);
}

// ---------------------------------------------------------------------------
// Category: auth fixture (tests/support/auth-fixture.ts)
// ---------------------------------------------------------------------------

const REQUIRED_AUTH_PROVIDER_MEMBERS = [
  'getEnvironment',
  'getUserIdentifier',
  'extractToken',
  'extractCookies',
  'isTokenExpired',
  'manageAuthToken',
];

function scoreAuthFixture(dir) {
  const source = readText(dir, 'tests/support/auth-fixture.ts');
  if (source === null) return ok(['tests/support/auth-fixture.ts is missing']);

  const stripped = stripComments(source);
  const problems = [];

  // The member check has to land on the object actually passed to
  // setAuthProvider(...), not just anywhere in the file: a member's name
  // sitting in a comment, or in a second, unused object, is not a member the
  // registered provider carries.
  const registration = /\bsetAuthProvider\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/.exec(stripped);
  if (registration) {
    const identifier = registration[1];
    const declaration = new RegExp(`\\b(?:const|let|var)\\s+${identifier}\\b[^=]*=\\s*\\{`).exec(stripped);
    const openBrace = declaration ? stripped.indexOf('{', declaration.index) : -1;
    const providerBody = openBrace === -1 ? null : extractBraceBody(stripped, openBrace);
    if (providerBody === null) {
      problems.push(`could not find the object literal assigned to ${identifier}, the identifier passed to setAuthProvider(...)`);
    } else {
      const providerProps = topLevelProperties(providerBody);
      for (const member of REQUIRED_AUTH_PROVIDER_MEMBERS) {
        if (!providerProps.has(member)) problems.push(`AuthProvider is missing ${member}`);
      }
    }
  } else {
    problems.push('missing setAuthProvider(...) call');
  }
  if (!/createAuthFixtures\s*\(\s*\)/.test(stripped)) problems.push('missing base.extend(createAuthFixtures()) wiring');
  return ok(problems);
}

// ---------------------------------------------------------------------------
// Category: sample tests (tests/e2e/*.spec.ts)
// ---------------------------------------------------------------------------

function scoreSampleFile(dir, relPath, extraChecks) {
  const source = readText(dir, relPath);
  if (source === null) return [`${relPath} is missing`];

  const problems = [];
  if (/from\s*['"]@playwright\/test['"]/.test(source)) {
    problems.push(`${relPath} imports from '@playwright/test' directly instead of '../support/merged-fixtures'`);
  }
  if (!/from\s*['"]\.\.\/support\/merged-fixtures['"]/.test(source)) {
    problems.push(`${relPath} does not import test/expect from '../support/merged-fixtures'`);
  }
  for (const check of extraChecks) {
    if (!check.pattern.test(source)) problems.push(`${relPath} ${check.label}`);
  }
  return problems;
}

function scoreSampleTests(dir) {
  const problems = [
    ...scoreSampleFile(dir, 'tests/e2e/api-sample.spec.ts', [{ pattern: /\bapiRequest\s*\(/, label: 'does not use apiRequest' }]),
    ...scoreSampleFile(dir, 'tests/e2e/ui-sample.spec.ts', [
      { pattern: /interceptNetworkCall\s*\(/, label: 'does not use interceptNetworkCall' },
      { pattern: /page\.goto\s*\(/, label: 'does not call page.goto' },
    ]),
  ];
  return ok(problems);
}

// ---------------------------------------------------------------------------
// Category: package.json script
// ---------------------------------------------------------------------------

function scorePackageScript(dir) {
  const { value, error } = readJson(dir, 'package.json');
  if (error) return ok([error]);
  const script = value?.scripts?.['test:e2e'];
  if (typeof script !== 'string' || script.trim() === '') return ok(['package.json is missing scripts["test:e2e"]']);
  if (!/\bplaywright\s+test\b/.test(script)) {
    return ok([`package.json's scripts["test:e2e"] does not invoke Playwright's test command (got ${JSON.stringify(script)})`]);
  }
  return ok([]);
}

// ---------------------------------------------------------------------------
// Category: docs (tests/README.md)
// ---------------------------------------------------------------------------

const DOCS_CHECKS = [
  { label: 'a Setup section', pattern: /^#{1,3}\s*Setup/im },
  { label: 'a Running Tests section', pattern: /^#{1,3}\s*Running/im },
  { label: 'an Architecture section', pattern: /^#{1,3}\s*Architecture/im },
  { label: 'a CI Integration section', pattern: /^#{1,3}\s*CI/im },
  { label: 'a mention of disabledRules for the enforcement hook', pattern: /disabledRules/ },
  { label: 'a mention of the criteria registry as the source of severity', pattern: /criteria registry/i },
];

function scoreDocs(dir) {
  const source = readText(dir, 'tests/README.md');
  if (source === null) return ok(['tests/README.md is missing']);
  const problems = DOCS_CHECKS.filter((check) => !check.pattern.test(source)).map((check) => `missing ${check.label}`);
  return ok(problems);
}

// ---------------------------------------------------------------------------
// Hook registration, scored as three independent categories
// ---------------------------------------------------------------------------

function hookEntriesFire(entries, flag) {
  if (!Array.isArray(entries)) return false;
  return entries.some(
    (entry) =>
      Array.isArray(entry?.hooks) &&
      entry.hooks.some(
        (hook) => typeof hook?.command === 'string' && hook.command.includes('tea-enforce.cjs') && hook.command.includes(flag),
      ),
  );
}

function scoreHookSettings(dir) {
  const { value, error } = readJson(dir, '.claude/settings.json');
  if (error) return ok([error]);

  const problems = [];
  const hooks = value?.hooks || {};
  if (!hookEntriesFire(hooks.PreToolUse, '--pre')) problems.push('`.claude/settings.json` is missing the PreToolUse (--pre) hook entry');
  if (!hookEntriesFire(hooks.PostToolUse, '--post'))
    problems.push('`.claude/settings.json` is missing the PostToolUse (--post) hook entry');
  if (!hookEntriesFire(hooks.Stop, '--stop')) problems.push('`.claude/settings.json` is missing the Stop (--stop) hook entry');
  return ok(problems);
}

/**
 * `.tea/enforce-config.json` names a non-empty `testGlobs`, and `hookSha256`
 * is well-formed and equal to the *real, canonical* hook's digest — read from
 * `REAL_HOOK_PATH`, never from the fixture's own copy of `tea-enforce.cjs`.
 * Comparing against the fixture's own bytes would make an edit to the hook
 * script (the `hookScript` category's own seeded mutation) also fail this
 * category, exactly the folding-together the AC requires each part to stay
 * independent of; comparing against the real source instead still catches a
 * `hookSha256` that is well-formed but simply wrong, which the shape check
 * alone cannot.
 */
function scoreHookConfig(dir) {
  const { value, error } = readJson(dir, '.tea/enforce-config.json');
  if (error) return ok([error]);

  const problems = [];
  if (!Array.isArray(value?.testGlobs) || value.testGlobs.length === 0) {
    problems.push('`.tea/enforce-config.json` is missing a non-empty testGlobs array');
  }
  if (typeof value?.hookSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(value.hookSha256)) {
    problems.push('`.tea/enforce-config.json` is missing hookSha256 (a 64-char sha256 hex digest)');
  } else if (fs.existsSync(REAL_HOOK_PATH)) {
    const canonicalHash = crypto.createHash('sha256').update(fs.readFileSync(REAL_HOOK_PATH)).digest('hex');
    if (value.hookSha256 !== canonicalHash) {
      problems.push(
        `\`.tea/enforce-config.json\`'s hookSha256 (${value.hookSha256}) does not match the real hook's digest (${canonicalHash})`,
      );
    }
  }
  return ok(problems);
}

function scoreHookScript(dir) {
  const fixturePath = path.join(dir, '.claude', 'hooks', 'tea-enforce.cjs');
  if (!fs.existsSync(fixturePath)) return ok(['.claude/hooks/tea-enforce.cjs is missing']);
  if (!fs.existsSync(REAL_HOOK_PATH)) {
    return ok([`the real hook source is missing at ${path.relative(PROJECT_ROOT, REAL_HOOK_PATH)}`]);
  }

  const fixtureBuffer = fs.readFileSync(fixturePath);
  const realBuffer = fs.readFileSync(REAL_HOOK_PATH);
  if (Buffer.compare(fixtureBuffer, realBuffer) === 0) return ok([]);

  const fixtureHash = crypto.createHash('sha256').update(fixtureBuffer).digest('hex');
  const realHash = crypto.createHash('sha256').update(realBuffer).digest('hex');
  return ok([
    '.claude/hooks/tea-enforce.cjs is not byte-identical to ' +
      `${path.relative(PROJECT_ROOT, REAL_HOOK_PATH)} (fixture sha256 ${fixtureHash}, real sha256 ${realHash}, ` +
      `fixture is ${fixtureBuffer.length} bytes, real is ${realBuffer.length} bytes)`,
  ]);
}

// ---------------------------------------------------------------------------
// Aggregator
// ---------------------------------------------------------------------------

const CATEGORY_SCORERS = {
  config: scoreConfig,
  env: scoreEnv,
  mergedFixtures: scoreMergedFixtures,
  authFixture: scoreAuthFixture,
  sampleTests: scoreSampleTests,
  packageScript: scorePackageScript,
  docs: scoreDocs,
  hookSettings: scoreHookSettings,
  hookConfig: scoreHookConfig,
  hookScript: scoreHookScript,
};

function scoreScaffold(dir) {
  const categories = {};
  for (const [name, scorer] of Object.entries(CATEGORY_SCORERS)) {
    categories[name] = scorer(dir);
  }
  const allOk = Object.values(categories).every((category) => category.ok);
  return { ok: allOk, categories };
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition, label, detail) {
  if (condition) {
    console.log(`  ${colors.green}✓${colors.reset} ${label}`);
    passed += 1;
  } else {
    console.log(`  ${colors.red}✗ ${label}${colors.reset}`);
    if (detail) console.log(`    ${colors.dim}${detail}${colors.reset}`);
    failed += 1;
  }
}

function printReport(result) {
  for (const [name, category] of Object.entries(result.categories)) {
    const icon = category.ok ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
    console.log(`  ${icon} ${name}`);
    for (const problem of category.problems) console.log(`      ${colors.dim}- ${problem}${colors.reset}`);
  }
}

/** Copies the clean fixture to a scratch temp dir, mutates it, scores it, cleans up in `finally`. */
function withMutatedScratch(mutate, run) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-framework-scaffold-'));
  try {
    fs.cpSync(CLEAN_FIXTURE_DIR, scratch, { recursive: true });
    mutate(scratch);
    run(scratch);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

function writeJson(dir, relPath, value) {
  fs.writeFileSync(path.join(dir, relPath), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJsonForMutation(dir, relPath) {
  return JSON.parse(fs.readFileSync(path.join(dir, relPath), 'utf8'));
}

/** Runs one seeded-mutation case: mutate, score, assert the targeted category fails and every other stays ok. */
function runMutationCase({ label, mutate, category, expectedProblemSubstring, extraAssert }) {
  withMutatedScratch(mutate, (scratch) => {
    const scored = scoreScaffold(scratch);
    const targeted = scored.categories[category];
    assert(targeted && targeted.ok === false, `${label}: ${category} category fails`, JSON.stringify(targeted));
    if (targeted && !targeted.ok && expectedProblemSubstring) {
      assert(
        targeted.problems.some((problem) => problem.includes(expectedProblemSubstring)),
        `${label}: ${category} names "${expectedProblemSubstring}"`,
        JSON.stringify(targeted.problems),
      );
    }
    const others = Object.entries(scored.categories).filter(([name]) => name !== category);
    const stillOk = others.filter(([, result]) => !result.ok);
    assert(stillOk.length === 0, `${label}: every other category still reports ok`, JSON.stringify(stillOk));
    if (extraAssert) extraAssert(scored, label);
  });
}

function main() {
  console.log(`${colors.cyan}========================================`);
  console.log('bmad-testarch-framework scaffold scoring');
  console.log(`========================================${colors.reset}\n`);
  console.log(
    `${colors.dim}Scores one canonical scaffold path only: frontend, Playwright, TypeScript, Playwright Utils enabled, no Pact.${colors.reset}\n`,
  );

  // ==========================================================================
  console.log(`${colors.yellow}The committed clean fixture${colors.reset}\n`);
  // ==========================================================================

  const cleanResult = scoreScaffold(CLEAN_FIXTURE_DIR);
  printReport(cleanResult);
  console.log('');
  assert(cleanResult.ok, 'every category reports ok on the committed clean fixture', JSON.stringify(cleanResult));
  console.log('');

  // ==========================================================================
  console.log(`${colors.yellow}Seeded-mutation self-tests (nine cases, per the I/O matrix)${colors.reset}\n`);
  // ==========================================================================

  runMutationCase({
    label: 'config missing required timeout/artifact settings',
    category: 'config',
    expectedProblemSubstring: 'actionTimeout',
    mutate(scratch) {
      const configPath = path.join(scratch, 'playwright.config.ts');
      const mutated = fs.readFileSync(configPath, 'utf8').replace(/actionTimeout:\s*15000,?\n?/, '');
      fs.writeFileSync(configPath, mutated, 'utf8');
    },
  });

  // Regression cover for a real gap: a plain regex over the whole file text
  // is satisfied by a commented-out setting, since the text is still there.
  runMutationCase({
    label: 'config settings present only as comments',
    category: 'config',
    expectedProblemSubstring: 'actionTimeout',
    mutate(scratch) {
      const configPath = path.join(scratch, 'playwright.config.ts');
      const source = fs.readFileSync(configPath, 'utf8');
      const mutated = source.replaceAll(
        /^(\s*)(fullyParallel|timeout|actionTimeout|navigationTimeout|trace|screenshot|video|baseURL):/gm,
        '$1// $2:',
      );
      if (mutated === source) throw new Error('fixture no longer has settings on their own line to comment out');
      fs.writeFileSync(configPath, mutated, 'utf8');
    },
  });

  // Regression cover for a real gap: a setting moved one level deeper under
  // an unrelated key (still somewhere inside `use { ... }`) still matched a
  // whole-file regex for "actionTimeout: 15000" even though no active
  // top-level `use` property carries it.
  runMutationCase({
    label: 'config setting moved out of its expected scope',
    category: 'config',
    expectedProblemSubstring: 'actionTimeout',
    mutate(scratch) {
      const configPath = path.join(scratch, 'playwright.config.ts');
      const source = fs.readFileSync(configPath, 'utf8');
      const mutated = source.replace('actionTimeout: 15000,', 'headers: { actionTimeout: 15000 },');
      if (mutated === source) throw new Error('fixture no longer has a top-level use.actionTimeout to relocate');
      fs.writeFileSync(configPath, mutated, 'utf8');
    },
  });

  runMutationCase({
    label: 'merged-fixtures.ts drops a required fixture from the merge',
    category: 'mergedFixtures',
    expectedProblemSubstring: 'authFixture',
    mutate(scratch) {
      const mergedPath = path.join(scratch, 'tests', 'support', 'merged-fixtures.ts');
      const mutated = fs
        .readFileSync(mergedPath, 'utf8')
        .replace(
          'mergeTests(apiRequestFixture, recurseFixture, interceptFixture, networkErrorFixture, authFixture)',
          'mergeTests(apiRequestFixture, recurseFixture, interceptFixture, networkErrorFixture)',
        );
      fs.writeFileSync(mergedPath, mutated, 'utf8');
    },
  });

  runMutationCase({
    label: 'auth-fixture.ts missing one of the six AuthProvider members',
    category: 'authFixture',
    expectedProblemSubstring: 'extractCookies',
    mutate(scratch) {
      const authPath = path.join(scratch, 'tests', 'support', 'auth-fixture.ts');
      const lines = fs.readFileSync(authPath, 'utf8').split('\n');
      const startIndex = lines.findIndex((line) => line.trim().startsWith('extractCookies:'));
      if (startIndex === -1) throw new Error('fixture no longer has an extractCookies member to remove');
      let endIndex = startIndex;
      while (!lines[endIndex].includes('],')) endIndex += 1;
      lines.splice(startIndex, endIndex - startIndex + 1);
      fs.writeFileSync(authPath, lines.join('\n'), 'utf8');
    },
  });

  // Regression cover for a real gap: `scoreAuthFixture` used to search the
  // whole file for each member's name, so a member sitting in a comment or in
  // a second, unused object still passed. This empties the object actually
  // registered through setAuthProvider(...) while leaving every member's
  // name findable elsewhere in the file.
  runMutationCase({
    label: 'AuthProvider members present outside the registered object',
    category: 'authFixture',
    expectedProblemSubstring: 'getEnvironment',
    mutate(scratch) {
      const authPath = path.join(scratch, 'tests', 'support', 'auth-fixture.ts');
      const source = fs.readFileSync(authPath, 'utf8');
      const marker = 'const authProvider: AuthProvider = {';
      if (!source.includes(marker)) throw new Error('fixture no longer declares authProvider the expected way');
      const mutated = source.replace(
        marker,
        [
          'const authProvider: AuthProvider = {};',
          '// getEnvironment, getUserIdentifier, extractToken, extractCookies, isTokenExpired, manageAuthToken',
          '// all named here, but not on the object actually registered above.',
          'const unusedAuthProvider: AuthProvider = {',
        ].join('\n'),
      );
      fs.writeFileSync(authPath, mutated, 'utf8');
    },
  });

  runMutationCase({
    label: 'sample test imports @playwright/test directly',
    category: 'sampleTests',
    expectedProblemSubstring: "imports from '@playwright/test' directly",
    mutate(scratch) {
      const samplePath = path.join(scratch, 'tests', 'e2e', 'api-sample.spec.ts');
      const original = fs.readFileSync(samplePath, 'utf8');
      const mutated = original.replace("from '../support/merged-fixtures';", "from '@playwright/test';");
      if (mutated === original) throw new Error('fixture no longer imports from ../support/merged-fixtures to mutate');
      fs.writeFileSync(samplePath, mutated, 'utf8');
    },
  });

  runMutationCase({
    label: 'package.json missing test:e2e',
    category: 'packageScript',
    expectedProblemSubstring: 'test:e2e',
    mutate(scratch) {
      const manifest = readJsonForMutation(scratch, 'package.json');
      delete manifest.scripts['test:e2e'];
      writeJson(scratch, 'package.json', manifest);
    },
  });

  // Regression cover for a real gap: any non-empty string used to satisfy
  // `packageScript`, so a script that runs nothing Playwright-shaped at all
  // still passed.
  runMutationCase({
    label: 'test:e2e set to a non-Playwright command',
    category: 'packageScript',
    expectedProblemSubstring: 'does not invoke',
    mutate(scratch) {
      const manifest = readJsonForMutation(scratch, 'package.json');
      manifest.scripts['test:e2e'] = 'echo scaffold';
      writeJson(scratch, 'package.json', manifest);
    },
  });

  runMutationCase({
    label: '.claude/hooks/tea-enforce.cjs edited locally (not byte-identical)',
    category: 'hookScript',
    expectedProblemSubstring: 'is not byte-identical',
    mutate(scratch) {
      const hookPath = path.join(scratch, '.claude', 'hooks', 'tea-enforce.cjs');
      fs.appendFileSync(hookPath, '\n// locally edited\n');
    },
  });

  runMutationCase({
    label: '.tea/enforce-config.json missing hookSha256',
    category: 'hookConfig',
    expectedProblemSubstring: 'hookSha256',
    mutate(scratch) {
      const config = readJsonForMutation(scratch, '.tea/enforce-config.json');
      delete config.hookSha256;
      writeJson(scratch, '.tea/enforce-config.json', config);
    },
  });

  runMutationCase({
    label: '.tea/enforce-config.json missing testGlobs',
    category: 'hookConfig',
    expectedProblemSubstring: 'testGlobs',
    mutate(scratch) {
      const config = readJsonForMutation(scratch, '.tea/enforce-config.json');
      delete config.testGlobs;
      writeJson(scratch, '.tea/enforce-config.json', config);
    },
  });

  // Regression cover for a real gap: `hookConfig` used to check hookSha256's
  // shape only, so a well-formed but simply wrong digest passed. The fixture's
  // own tea-enforce.cjs is left untouched, which is what keeps this case
  // isolated from hookScript's own byte-identity mutation above.
  runMutationCase({
    label: '.tea/enforce-config.json carries a well-formed but wrong hookSha256',
    category: 'hookConfig',
    expectedProblemSubstring: 'does not match',
    mutate(scratch) {
      const config = readJsonForMutation(scratch, '.tea/enforce-config.json');
      config.hookSha256 = '0'.repeat(64);
      writeJson(scratch, '.tea/enforce-config.json', config);
    },
  });

  runMutationCase({
    label: '.claude/settings.json missing the Stop hook entry only',
    category: 'hookSettings',
    expectedProblemSubstring: 'Stop (--stop)',
    mutate(scratch) {
      const settings = readJsonForMutation(scratch, '.claude/settings.json');
      delete settings.hooks.Stop;
      writeJson(scratch, '.claude/settings.json', settings);
    },
    // "Every other category still reports ok" (asserted above, unconditionally) already
    // proves PreToolUse/PostToolUse are untouched at the scaffold level. This names the
    // AC's own, narrower case: the hookSettings category's own problem list names
    // exactly Stop, not "hooks incomplete" and not PreToolUse/PostToolUse.
    extraAssert(scored, label) {
      const { problems } = scored.categories.hookSettings;
      assert(
        problems.some((problem) => problem.includes('Stop')) &&
          !problems.some((problem) => problem.includes('PreToolUse')) &&
          !problems.some((problem) => problem.includes('PostToolUse')),
        `${label}: names exactly Stop, not "hooks incomplete" and not PreToolUse/PostToolUse`,
        JSON.stringify(problems),
      );
    },
  });

  // Regression cover for a real gap: `hookEntriesFire` used to accept any
  // command containing the stage flag, so a command unrelated to the
  // enforcement hook (but carrying the same flag text) still passed.
  runMutationCase({
    label: 'hook commands carry the stage flag but not the hook path',
    category: 'hookSettings',
    expectedProblemSubstring: 'PreToolUse',
    mutate(scratch) {
      const settings = readJsonForMutation(scratch, '.claude/settings.json');
      for (const [section, flag] of [
        ['PreToolUse', '--pre'],
        ['PostToolUse', '--post'],
        ['Stop', '--stop'],
      ]) {
        for (const entry of settings.hooks[section]) {
          for (const hook of entry.hooks) hook.command = `echo ${flag}`;
        }
      }
      writeJson(scratch, '.claude/settings.json', settings);
    },
  });

  console.log(`${colors.yellow}Beyond the I/O matrix: env and docs, proven the same way${colors.reset}\n`);

  // Beyond the I/O matrix's nine named cases: "Always" also requires every category
  // provable to fail, and the matrix does not carry a row for env or docs.
  runMutationCase({
    label: '.env.example drops BASE_URL',
    category: 'env',
    expectedProblemSubstring: 'BASE_URL',
    mutate(scratch) {
      const envPath = path.join(scratch, '.env.example');
      const mutated = fs
        .readFileSync(envPath, 'utf8')
        .split('\n')
        .filter((line) => !line.startsWith('BASE_URL='))
        .join('\n');
      fs.writeFileSync(envPath, mutated, 'utf8');
    },
  });

  runMutationCase({
    label: 'tests/README.md drops the enforcement-hook documentation',
    category: 'docs',
    expectedProblemSubstring: 'disabledRules',
    mutate(scratch) {
      const readmePath = path.join(scratch, 'tests', 'README.md');
      const mutated = fs.readFileSync(readmePath, 'utf8').replace(/## Write-Time Enforcement[\s\S]*?(?=\n## )/, '');
      fs.writeFileSync(readmePath, mutated, 'utf8');
    },
  });

  console.log('');

  // ==========================================================================
  console.log(`${colors.yellow}No network, no install, no agent${colors.reset}\n`);
  // ==========================================================================

  // Structural, not textual: a doc comment is free to say the words "npm install": what
  // must never appear is a network module require or a process-spawning call, which is
  // what an actual install or network reach would need.
  const ownSource = fs.readFileSync(__filename, 'utf8');
  assert(
    !/require\(\s*['"]node:(?:https?|child_process)['"]\s*\)/.test(ownSource),
    'this file requires no network or process-spawning module',
  );
  assert(!/\bfetch\s*\(/.test(ownSource), 'this file makes no fetch call');

  console.log('');
  console.log(`${colors.cyan}========================================`);
  console.log('Test Results:');
  console.log(`  Passed: ${colors.green}${passed}${colors.reset}`);
  console.log(`  Failed: ${colors.red}${failed}${colors.reset}`);
  console.log(`========================================${colors.reset}\n`);

  if (failed === 0) {
    console.log(`${colors.green}✨ scaffold scoring proven on the clean fixture and every seeded mutation${colors.reset}\n`);
    process.exit(0);
  }
  console.log(`${colors.red}❌ scaffold scoring has unproven or broken categories${colors.reset}\n`);
  process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = { scoreScaffold, CLEAN_FIXTURE_DIR, REAL_HOOK_PATH };
