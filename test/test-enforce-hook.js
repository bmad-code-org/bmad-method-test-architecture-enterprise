/**
 * Tests for the write-time enforcement hook the `framework` workflow scaffolds.
 *
 * Two jobs, and the first one is the reason this file exists at all.
 *
 * 1. DRIFT. The hook's rules are rows from `criteria-registry.md`, and the
 *    registry is the single source of truth for both the predicate and the
 *    severity. Nothing stopped the two from disagreeing: a severity edited in the
 *    registry and not in the hook ships one number to the reviewer and another to
 *    the blocker. So every rule the hook implements is checked against its row,
 *    and every Absolute row in the registry must be either implemented or listed
 *    in DEFERRED with a reason. A new Absolute row fails this test until somebody
 *    decides which side it belongs on, which is the whole anti-rot mechanism.
 *
 * 2. BEHAVIOR. The hook blocks writes. A false positive there is worse than a
 *    missed violation, because it teaches the user to remove the hook. The cases
 *    below are mostly negative for that reason: a doc example in a comment, a
 *    `cy.wait('@alias')`, a `test.skip` with a documented reason, a Maestro rule
 *    on a repo with no Maestro glob.
 *
 * Usage: node test/test-enforce-hook.js
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const hook = require('../src/workflows/testarch/bmad-testarch-framework/resources/hooks/tea-enforce.cjs');

const colors = {
  reset: '[0m',
  green: '[32m',
  red: '[31m',
  yellow: '[33m',
  cyan: '[36m',
  dim: '[2m',
};

let passed = 0;
let failed = 0;

function assert(condition, testName, errorMessage = '') {
  if (condition) {
    console.log(`${colors.green}✓${colors.reset} ${testName}`);
    passed += 1;
  } else {
    console.log(`${colors.red}✗${colors.reset} ${testName}`);
    if (errorMessage) console.log(`  ${colors.dim}${errorMessage}${colors.reset}`);
    failed += 1;
  }
}

// The registry table contract has one parser, in tools/validate-criteria-fragments.js.
// It was duplicated here, and two copies of the cell-count and id-shape rules can
// drift: a registry format change would then be caught by one tool and silently
// mis-parsed by the other, which is the failure both tools exist to prevent.
const { parseRegistryRows } = require('../tools/validate-criteria-fragments');

function run() {
  console.log(`${colors.cyan}========================================`);
  console.log('TEA Enforcement Hook Tests');
  console.log(`========================================${colors.reset}\n`);

  // ==========================================================================
  console.log(`${colors.yellow}Test Suite 1: Registry Drift${colors.reset}\n`);
  // ==========================================================================

  const rows = parseRegistryRows();
  assert(rows.length >= 30, `criteria-registry.md parsed (${rows.length} rows)`, 'expected at least 30 criterion rows');

  const byId = new Map(rows.map((row) => [row.id, row]));
  const validSeverities = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
  assert(
    rows.every((row) => validSeverities.has(row.severity)),
    'every parsed row has a recognized severity (the parser is reading the right column)',
    rows
      .filter((row) => !validSeverities.has(row.severity))
      .map((row) => `${row.id}: "${row.severity}"`)
      .join(', '),
  );

  for (const rule of hook.RULES) {
    const row = byId.get(rule.id);
    assert(Boolean(row), `hook rule ${rule.id} exists in the registry`);
    if (!row) continue;
    assert(
      rule.severity === row.severity,
      `hook rule ${rule.id} carries the registry's severity (${row.severity})`,
      `hook says ${rule.severity}`,
    );
    assert(
      row.gate.startsWith('Absolute'),
      `hook rule ${rule.id} is an Absolute row`,
      `registry gate is "${row.gate}"; only Absolute rows are hook-eligible because the others need a per-file or per-repo gate the hook cannot evaluate`,
    );
    assert(rule.gate === 'Absolute', `hook rule ${rule.id} declares its gate`);
    assert(
      rule.action === 'block' || typeof rule.actionReason === 'string',
      `hook rule ${rule.id} states why it warns instead of blocking`,
      'a non-blocking rule must carry actionReason',
    );
    assert(typeof rule.fix === 'string' && rule.fix.length > 20, `hook rule ${rule.id} tells the agent how to fix it`);
  }

  const absoluteRows = rows.filter((row) => row.gate.startsWith('Absolute'));
  const implemented = new Set(hook.RULES.map((rule) => rule.id));
  const deferred = new Set(Object.keys(hook.DEFERRED));
  const unclassified = absoluteRows.filter((row) => !implemented.has(row.id) && !deferred.has(row.id));
  assert(
    unclassified.length === 0,
    `every Absolute registry row is implemented or deferred (${absoluteRows.length} rows)`,
    `unclassified: ${unclassified.map((row) => `${row.id} ${row.criterion}`).join(', ')} — add a rule to tea-enforce.cjs or an entry to DEFERRED explaining why a pattern cannot decide it`,
  );

  const overlap = [...implemented].filter((id) => deferred.has(id));
  assert(overlap.length === 0, 'no row is both implemented and deferred', overlap.join(', '));

  const strayDeferred = [...deferred].filter((id) => !byId.has(id) || !byId.get(id).gate.startsWith('Absolute'));
  assert(strayDeferred.length === 0, 'every DEFERRED entry names an Absolute registry row', strayDeferred.join(', '));

  assert(
    Object.values(hook.DEFERRED).every((reason) => typeof reason === 'string' && reason.length > 30),
    'every DEFERRED entry states a reason',
  );

  console.log('');

  // ==========================================================================
  console.log(`${colors.yellow}Test Suite 2: Rules Fire (multi-language)${colors.reset}\n`);
  // ==========================================================================

  const config = { ...hook.DEFAULT_CONFIG };
  const scan = (file, source, options) => hook.scanContent(file, source, config, options);
  const ids = (findings) => findings.map((finding) => finding.rule.id).sort();

  const cases = [
    ['tests/a.spec.ts', 'test.only("x", async () => {\n  await go();\n});\n', 'C2', 'Playwright test.only'],
    ['tests/a.spec.ts', 'fdescribe("suite", () => {});\n', 'C2', 'Jasmine fdescribe'],
    ['tests/a.spec.ts', 'expect(true).toBe(true);\n', 'C3', 'boolean tautology'],
    ['tests/a.spec.ts', 'expect(user.id).toEqual(user.id);\n', 'C3', 'identifier compared to itself'],
    ['tests/a.spec.ts', 'await page.waitForTimeout(500);\n', 'H1', 'Playwright hard wait'],
    ['tests/a.cy.ts', 'cy.wait(2000);\n', 'H1', 'Cypress numeric wait'],
    ['tests/test_login.py', 'time.sleep(3)\n', 'H1', 'pytest hard wait'],
    ['tests/test_login.py', 'assert total == total\n', 'C3', 'python self-comparison'],
    ['src/LoginTest.java', 'Thread.sleep(1000);\n', 'H1', 'JUnit hard wait'],
    ['src/LoginTest.java', 'assertEquals(actual, actual);\n', 'C3', 'JUnit self-comparison'],
    ['pkg/login_test.go', 'time.Sleep(2 * time.Second)\n', 'H1', 'Go hard wait'],
    ['.maestro/login.yaml', 'appId: com.example\n---\n- launchApp\n- sleep: 3000\n- assertVisible: "Home"\n', 'H1', 'Maestro sleep step'],
    ['.maestro/login.yaml', 'appId: com.example\n---\n- launchApp\n- tapOn: "Login"\n', 'C4', 'Maestro flow that asserts nothing'],
    [
      'vitest.config.pact.ts',
      'export default { test: { fileParallelism: false, maxWorkers: 4 } };\n',
      'H8',
      'pact config defeats serialization',
    ],
  ];

  for (const [file, source, expected, label] of cases) {
    const found = ids(scan(file, source));
    assert(found.includes(expected), `${expected} fires: ${label}`, `got [${found.join(', ')}] for ${file}`);
  }

  assert(
    ids(scan('vitest.config.pact.ts', 'export default { test: { pool: "forks" } };\n')).includes('H6'),
    'H6 fires: pact config omits fileParallelism: false',
  );

  const oversize = `${'const x = 1;\n'.repeat(1001)}`;
  assert(ids(scan('tests/big.spec.ts', oversize)).includes('H5'), 'H5 fires: file over 1000 lines');

  const skipped = ids(scan('tests/a.spec.ts', 'test.skip("checkout", async () => {});\n'));
  assert(skipped.includes('C1'), 'C1 fires: undocumented test.skip');

  // The comment check reads the raw line, because a stripped line has had its
  // comments blanked along with its strings. Reading it without knowing the
  // language, or without tracking string state, makes a `#` inside a JavaScript
  // test title look like a documented reason and silences the row.
  assert(
    ids(scan('tests/a.spec.ts', 'test.skip("renders # hashtag", () => {});\n')).includes('C1'),
    'C1 still fires: a # inside a JavaScript test title is not a comment',
  );
  assert(
    ids(scan('src/LoginTest.java', '@Disabled\nvoid rendersHashTag() { }\n')).includes('C1'),
    'C1 still fires: a bare @Disabled with no reason string',
  );
  assert(
    ids(scan('tests/test_login.py', '@pytest.mark.skip\ndef test_renders_hash():\n    pass\n')).includes('C1'),
    'C1 still fires: a bare @pytest.mark.skip',
  );
  assert(hook.commentIndex('test.skip("a # b", () => {});', 'js') === -1, 'commentIndex: # is not a comment marker in JavaScript');
  assert(hook.commentIndex('assert x == 1  # why', 'py') === 15, 'commentIndex: # is a comment marker in Python');
  assert(hook.commentIndex('const url = "http://x";', 'js') === -1, 'commentIndex: // inside a string literal is not a comment');
  assert(
    hook.RULES.find((rule) => rule.id === 'C1').action === 'warn',
    'C1 warns rather than blocks',
    'a blocking C1 would fight the API guidance that sanctions test.skip plus a FIXME',
  );

  console.log('');

  // ==========================================================================
  console.log(`${colors.yellow}Test Suite 3: No False Positives${colors.reset}\n`);
  // ==========================================================================

  const clean = [
    [
      'tests/a.spec.ts',
      '// await page.waitForTimeout(500) is banned; use a web-first assertion\nawait expect(row).toBeVisible();\n',
      'H1 in a line comment',
    ],
    ['tests/a.spec.ts', '/*\n * Bad: await page.waitForTimeout(500)\n */\nawait expect(row).toBeVisible();\n', 'H1 in a block comment'],
    ['tests/a.spec.ts', 'const message = "call waitForTimeout(500) and you will flake";\n', 'H1 inside a string literal'],
    ['tests/a.spec.ts', 'cy.wait("@getUser");\n', 'aliased cy.wait is not a hard wait'],
    ['tests/a.spec.ts', 'expect(response.status()).toBe(200);\n', 'a real assertion is not tautological'],
    ['tests/a.spec.ts', 'expect(value).not.toBe(value);\n', '.not self-comparison always fails, so it is not C3'],
    [
      'tests/a.spec.ts',
      'test.skip("checkout", async () => {}); // FIXME: API returns 500, see TEA-412\n',
      'documented skip is not reported',
    ],
    ['tests/a.spec.ts', '// Skipped until the API is fixed\ntest.skip("checkout", async () => {});\n', 'skip documented on the line above'],
    [
      'tests/test_login.py',
      '@pytest.mark.skip(reason="upstream returns 500, see TEA-412")\ndef test_checkout():\n    pass\n',
      'a Python skip carrying its own reason string',
    ],
    [
      'src/LoginTest.java',
      '@Disabled("upstream returns 500, see TEA-412")\nvoid checkout() { }\n',
      'a JUnit @Disabled carrying its own reason string',
    ],
    [
      'tests/a.spec.ts',
      "const pattern = /it's only a test/;\nawait expect(row).toBeVisible();\n",
      'a regex literal containing a quote does not swallow the file',
    ],
    ['tests/test_login.py', '# time.sleep(3) would flake here\nassert total == expected\n', 'python comment is stripped'],
    [
      '.maestro/login.yaml',
      'appId: com.example\n---\n- launchApp\n- tapOn: "Login"\n- assertVisible: "Welcome"\n',
      'a Maestro flow that asserts is clean',
    ],
    ['.maestro/config.yaml', 'flows:\n  - "*.yaml"\n', 'a Maestro config is not a flow and does not fire C4'],
    [
      'vitest.config.pact.ts',
      'export default { test: { fileParallelism: false, maxWorkers: 1, isolate: true } };\n',
      'a correct pact config is clean',
    ],
  ];

  for (const [file, source, label] of clean) {
    const found = ids(scan(file, source));
    assert(found.length === 0, `no violation: ${label}`, `got [${found.join(', ')}] for ${file}`);
  }

  console.log('');

  // ==========================================================================
  console.log(`${colors.yellow}Test Suite 4: Gates${colors.reset}\n`);
  // ==========================================================================

  assert(
    scan('src/app/checkout.ts', 'await page.waitForTimeout(500);\n').length === 0,
    'a production file outside the test globs is not scanned',
  );

  const noMaestro = { ...hook.DEFAULT_CONFIG, testGlobs: ['tests/**/*.spec.ts'] };
  assert(
    hook.scanContent('.maestro/login.yaml', 'appId: x\n---\n- launchApp\n- tapOn: "Login"\n', noMaestro).length === 0,
    'a repo whose detected stack has no Maestro glob cannot fire the Maestro rows',
    'this is the registry Gate column honoured structurally: a closed gate is not a violation',
  );

  const noPact = { ...hook.DEFAULT_CONFIG, pactConfigGlobs: [] };
  assert(
    hook.scanContent('vitest.config.pact.ts', 'export default { test: {} };\n', noPact).length === 0,
    'a repo with no pact config glob cannot fire H6/H8',
  );

  const k6 = { ...hook.DEFAULT_CONFIG, testGlobs: ['**/*.spec.js', 'k6/**/*.js'], excludeGlobs: ['k6/**'] };
  assert(
    hook.scanContent('k6/checkout-load.js', "import { sleep } from 'k6';\nexport default function () {\n  sleep(1);\n}\n", k6).length === 0,
    'excludeGlobs keeps H1 off k6 scripts, where sleep() is the correct way to model think-time',
  );

  const disabled = { ...hook.DEFAULT_CONFIG, disabledRules: ['H1'] };
  assert(
    hook.scanContent('tests/a.spec.ts', 'await page.waitForTimeout(500);\n', disabled).length === 0,
    'disabledRules turns a rule off for the project',
  );

  console.log('');

  // ==========================================================================
  console.log(`${colors.yellow}Test Suite 5: Fragment vs Whole File${colors.reset}\n`);
  // ==========================================================================

  assert(
    ids(scan('tests/big.spec.ts', 'const x = 1;\n', { fragmentOnly: true })).length === 0,
    'file-scope rules do not run against an Edit fragment',
  );
  assert(
    ids(scan('.maestro/login.yaml', '- tapOn: "Login"\n', { fragmentOnly: true })).length === 0,
    'C4 does not fire on a fragment of a Maestro flow',
  );
  assert(
    ids(scan('tests/a.spec.ts', 'await page.waitForTimeout(500);\n', { fragmentOnly: true })).includes('H1'),
    'line-scope rules still run against an Edit fragment',
  );

  console.log('');

  // ==========================================================================
  console.log(`${colors.yellow}Test Suite 6: Payload Handling${colors.reset}\n`);
  // ==========================================================================

  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-enforce-'));
  try {
    fs.mkdirSync(path.join(sandbox, 'tests'), { recursive: true });
    const specPath = path.join(sandbox, 'tests', 'checkout.spec.ts');
    fs.writeFileSync(specPath, 'test.only("checkout", async () => {});\n');

    const bashTargets = hook.targetsFromPayload(
      { tool_name: 'Bash', tool_input: { command: "cat > tests/checkout.spec.ts <<'EOF'\ntest.only('x', () => {});\nEOF" } },
      hook.DEFAULT_CONFIG,
      sandbox,
    );
    assert(
      bashTargets.some((target) => target.endsWith(path.join('tests', 'checkout.spec.ts'))),
      'a Bash heredoc write names a target the post pass can re-read',
      `got ${JSON.stringify(bashTargets)}`,
    );

    const sedTargets = hook.targetsFromPayload(
      { tool_name: 'Bash', tool_input: { command: "sed -i '' 's/a/b/' tests/checkout.spec.ts" } },
      hook.DEFAULT_CONFIG,
      sandbox,
    );
    assert(sedTargets.length === 1, 'a sed -i write names a target', `got ${JSON.stringify(sedTargets)}`);

    assert(
      hook.scanFile(specPath, hook.DEFAULT_CONFIG, sandbox).some((finding) => finding.rule.id === 'C2'),
      'the post pass re-reads the file from disk and finds what Bash wrote',
    );

    const outside = hook.targetsFromPayload(
      { tool_name: 'Bash', tool_input: { command: 'cat > /etc/hosts.spec.ts' } },
      hook.DEFAULT_CONFIG,
      sandbox,
    );
    assert(outside.length === 0, 'a path outside the project root is never scanned');
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }

  const multi = hook.fragmentsFromPayload({
    tool_name: 'MultiEdit',
    tool_input: { edits: [{ new_string: 'a' }, { new_string: 'b' }] },
  });
  assert(multi.length === 2 && multi.every((fragment) => fragment.fragmentOnly), 'MultiEdit contributes every edit as a fragment');

  assert(hook.main(['--pre']) === 0, 'an empty payload fails open');

  console.log('');

  // ==========================================================================
  console.log(`${colors.yellow}Test Suite 7: Hook Self-Integrity${colors.reset}\n`);
  // ==========================================================================

  const hookPath = path.join(
    __dirname,
    '..',
    'src',
    'workflows',
    'testarch',
    'bmad-testarch-framework',
    'resources',
    'hooks',
    'tea-enforce.cjs',
  );
  const realSha = crypto.createHash('sha256').update(fs.readFileSync(hookPath)).digest('hex');

  assert(hook.integrityWarning({ ...hook.DEFAULT_CONFIG }) === null, 'no hash configured means the check is off');
  assert(hook.integrityWarning({ hookSha256: realSha }) === null, 'a matching hash is silent');
  const drift = hook.integrityWarning({ hookSha256: 'deadbeef' });
  assert(typeof drift === 'string' && drift.includes('deadbeef'), 'a mismatched hash warns and names both hashes');
  assert(
    drift.includes(hook.REGISTRY_PATH),
    'the drift warning says what the guarantee was',
    'an edited copy is outside the registry-agreement test, and the message has to say so or nobody acts on it',
  );

  console.log('');

  // ==========================================================================
  console.log(`${colors.cyan}========================================`);
  console.log('Test Results:');
  console.log(`  Passed: ${colors.green}${passed}${colors.reset}`);
  console.log(`  Failed: ${colors.red}${failed}${colors.reset}`);
  console.log(`========================================${colors.reset}\n`);

  if (failed === 0) {
    console.log(`${colors.green}✨ Enforcement hook tests passed!${colors.reset}\n`);
    process.exit(0);
  }
  console.log(`${colors.red}❌ Enforcement hook tests failed${colors.reset}\n`);
  process.exit(1);
}

run();
