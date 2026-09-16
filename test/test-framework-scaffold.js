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
// Category: config (playwright.config.ts)
// ---------------------------------------------------------------------------

const CONFIG_CHECKS = [
  { label: 'fullyParallel: true', pattern: /fullyParallel:\s*true\b/ },
  { label: 'actionTimeout: 15000', pattern: /actionTimeout:\s*15000\b/ },
  { label: 'navigationTimeout: 30000', pattern: /navigationTimeout:\s*30000\b/ },
  { label: 'top-level timeout: 60000', pattern: /(?<!action)(?<!navigation)\btimeout:\s*60000\b/ },
  { label: "trace: 'retain-on-failure-and-retries'", pattern: /trace:\s*['"]retain-on-failure-and-retries['"]/ },
  { label: "screenshot: 'only-on-failure'", pattern: /screenshot:\s*['"]only-on-failure['"]/ },
  { label: "video: 'retain-on-failure'", pattern: /video:\s*['"]retain-on-failure['"]/ },
  { label: 'HTML reporter', pattern: /\[\s*['"]html['"]/ },
  { label: 'JUnit reporter', pattern: /\[\s*['"]junit['"]/ },
  { label: 'baseURL env fallback (BASE_URL)', pattern: /baseURL:[^,\n]*process\.env\.BASE_URL/ },
];

function scoreConfig(dir) {
  const source = readText(dir, 'playwright.config.ts');
  if (source === null) return ok(['playwright.config.ts is missing']);
  const problems = CONFIG_CHECKS.filter((check) => !check.pattern.test(source)).map((check) => `missing ${check.label}`);
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

  const problems = [];
  for (const member of REQUIRED_AUTH_PROVIDER_MEMBERS) {
    if (!new RegExp(`\\b${member}\\s*:`).test(source)) problems.push(`AuthProvider is missing ${member}`);
  }
  if (!/setAuthProvider\s*\(/.test(source)) problems.push('missing setAuthProvider(...) call');
  if (!/createAuthFixtures\s*\(\s*\)/.test(source)) problems.push('missing base.extend(createAuthFixtures()) wiring');
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
    (entry) => Array.isArray(entry?.hooks) && entry.hooks.some((hook) => typeof hook?.command === 'string' && hook.command.includes(flag)),
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
 * Presence and shape only: does `.tea/enforce-config.json` name a non-empty
 * `testGlobs` and a well-formed `hookSha256`. Deliberately does not cross-check
 * `hookSha256` against the actual bytes of `.claude/hooks/tea-enforce.cjs` — that
 * would make an edit to the hook script (the hookScript category's own seeded
 * mutation) also fail this category, which is exactly the folding-together the
 * AC requires each part to stay independent of.
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
