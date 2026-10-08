/**
 * tea-test-review: pull request scope.
 *
 * A pull request review reports what the pull request owns. This file proves the
 * pieces that make that so:
 *
 *   - enclosing-block.js finds the test around a line and reads what a line defines;
 *   - diff-evidence.js attributes a finding on an unchanged assertion to the changed
 *     line that made it ineffective (setup, a fixture, a hook, a constant, a
 *     decorator), keeps a deleted assertion and a range Location PR-owned, and
 *     leaves a finding in untouched code pre-existing;
 *   - pr-scope-report.js cuts the pre-existing findings from a report so it parses to
 *     the verdict the CLI gates on, and refuses to cut when blocks and findings
 *     disagree;
 *   - the CLI names its review mode in the verdict and the report, hands the agent
 *     the changed ranges, drops old-line findings from both, and records the model
 *     ID that ran.
 *
 * Usage: node test/test-test-review-pr-scope.js
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Git hooks export repository-local GIT_* variables. Clear them before this
// harness creates nested repositories or starts CLI children, so each git
// command discovers the repository from its own cwd.
for (const name of Object.keys(process.env)) {
  if (name.startsWith('GIT_')) delete process.env[name];
}

const { enclosingFunction, sharedIdentifiers, definedIdentifiers } = require('../cli/lib/enclosing-block');
const { getDiffEvidence, classifyFinding, applyFindingProvenance } = require('../cli/lib/diff-evidence');
const { scopeReportToPullRequest } = require('../cli/lib/pr-scope-report');
const { parseReport, findingBlockSpans } = require('../cli/lib/parse-report');
const { loadRegistryRowSeverities } = require('../cli/lib/registry-rows');
const { resolvedModelFromAnswer, agentAnswerText } = require('../cli/lib/agent-adapters');
const { buildPrompt } = require('../cli/lib/build-prompt');

const repoRoot = path.join(__dirname, '..');
const skillRoot = path.join(repoRoot, 'skills', 'bmad-testarch-test-review');
const fixturesRoot = path.join(__dirname, 'fixtures', 'test-review-cli');
const stubAgent = path.join(fixturesRoot, 'stub-agent.js');
const cliPath = path.join(repoRoot, 'cli', 'test-review.js');
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

/** One section's throw is one failure, so the sections after it still run. */
function section(name, body) {
  console.log(`\n${name}\n`);
  try {
    body();
  } catch (error) {
    failed += 1;
    console.log(`\u001B[31m✗\u001B[0m ${name} threw: ${error.stack ?? error.message}`);
  }
}

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${result.stderr || result.error?.message}`);
  }
  return result.stdout;
}

/** A repository with `base` committed on main and `change` committed on branch pr. */
function pullRequestRepo(root, name, base, change, { subdirectory } = {}) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  git(['init', '-q', '-b', 'main'], dir);
  git(['config', 'user.email', 'tea-tests@example.com'], dir);
  git(['config', 'user.name', 'TEA Tests'], dir);
  git(['config', 'commit.gpgsign', 'false'], dir);
  const write = (files) => {
    for (const [file, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.writeFileSync(path.join(dir, file), content);
    }
    git(['add', '.'], dir);
  };
  write(base);
  git(['commit', '-q', '-m', 'base'], dir);
  git(['checkout', '-q', '-b', 'pr'], dir);
  write(change);
  git(['commit', '-q', '-m', 'pull request'], dir);
  return subdirectory ? path.join(dir, subdirectory) : dir;
}

/** The classification of one finding in a pull request that turns `base` into `change`. */
function classifyIn(root, name, file, base, change, finding, lineEnd = null) {
  const repo = pullRequestRepo(root, name, { [file]: base }, { [file]: change });
  const evidence = getDiffEvidence({ base: 'main', projectRoot: repo, files: [file] });
  return classifyFinding({ file, ...finding }, evidence, lineEnd);
}

const lines = (...entries) => `${entries.join('\n')}\n`;

const DISCOUNT_BASE = lines(
  "test('applies the discount', () => {",
  '  const cart = makeCart();',
  '  const expected = 18;',
  "  expect(applyDiscount(cart, 'SAVE10')).toBe(expected);",
  '});',
  '',
  "test('keeps the total for an unknown code', () => {",
  '  const cart = makeCart();',
  '  if (cart.total() > 0) {',
  "    expect(applyDiscount(cart, 'NOPE')).toBe(cart.total());",
  '  }',
  '});',
);
const DISCOUNT_PR = DISCOUNT_BASE.replace('const expected = 18;', "const expected = applyDiscount(cart, 'SAVE10');");

const PYTHON_BASE = lines(
  'from shop import Cart, apply_discount',
  '',
  '',
  'def test_save10_takes_ten_percent_off():',
  '    cart = Cart()',
  '    cart.add("book", 20.0)',
  '    expected = 18.0',
  '    assert apply_discount(cart, "SAVE10") == expected',
  '',
  '',
  'def test_unknown_code_keeps_the_total():',
  '    cart = Cart()',
  '    cart.add("book", 20.0)',
  '    assert apply_discount(cart, "NOPE") == 20.0',
);
const PYTHON_PR = PYTHON_BASE.replace('expected = 18.0', 'expected = apply_discount(cart, "SAVE10")');

/** The CHANGED LINES block of a prompt, parsed. */
function changedLinesIn(prompt) {
  const begin = prompt.indexOf('---BEGIN CHANGED LINES---\n');
  const end = prompt.indexOf('\n---END CHANGED LINES---');
  if (begin === -1 || end === -1) return null;
  try {
    return JSON.parse(prompt.slice(begin + '---BEGIN CHANGED LINES---\n'.length, end));
  } catch {
    return null;
  }
}

function throwsUnparseable(callback) {
  try {
    callback();
    return false;
  } catch (error) {
    return error.code === 'REPORT_UNPARSEABLE';
  }
}

function main() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-pr-scope-'));
  try {
    section('hook-style Git environment', () => {
      const sentinel = path.join(tmpRoot, 'sentinel');
      fs.mkdirSync(sentinel);
      git(['init', '-q', '-b', 'main'], sentinel);
      git(['config', 'user.email', 'sentinel@example.com'], sentinel);
      git(['config', 'user.name', 'Sentinel'], sentinel);
      git(['config', 'commit.gpgsign', 'false'], sentinel);
      fs.writeFileSync(path.join(sentinel, 'keep.txt'), 'unchanged\n');
      git(['add', '.'], sentinel);
      git(['commit', '-q', '-m', 'sentinel'], sentinel);
      const head = git(['rev-parse', 'HEAD'], sentinel);
      const probe = spawnSync(process.execPath, [__filename], {
        encoding: 'utf8',
        env: {
          ...process.env,
          TEA_PR_SCOPE_PROBE: '1',
          GIT_DIR: path.join(sentinel, '.git'),
          GIT_WORK_TREE: sentinel,
          GIT_INDEX_FILE: path.join(sentinel, '.git', 'index'),
        },
      });
      assert(
        probe.status === 0 &&
          git(['rev-parse', 'HEAD'], sentinel) === head &&
          git(['config', 'user.email'], sentinel).trim() === 'sentinel@example.com' &&
          git(['status', '--porcelain'], sentinel) === '',
        'hook-style Git variables cannot redirect this file into the calling repository',
        `status=${probe.status} stderr=${probe.stderr.slice(0, 300)}`,
      );
    });

    section('enclosing-block', () => {
      const python = PYTHON_BASE.split('\n');
      assert(
        JSON.stringify(enclosingFunction(python, 8)) === JSON.stringify({ start: 4, header: 4, end: 8 }),
        'a Python assertion resolves to its def, which ends at the blank lines before the next def',
        enclosingFunction(python, 8),
      );
      assert(
        JSON.stringify(enclosingFunction(python, 14)) === JSON.stringify({ start: 11, header: 11, end: 14 }),
        'the last test of a file resolves to its own def',
        enclosingFunction(python, 14),
      );
      assert(enclosingFunction(python, 1) === null, 'a module-level import has no enclosing function');
      assert(
        enclosingFunction(python, 99) === null && enclosingFunction(python, 3) === null,
        'an out-of-range or blank line resolves to nothing',
      );

      const typescript = DISCOUNT_BASE.split('\n');
      assert(
        JSON.stringify(enclosingFunction(typescript, 4)) === JSON.stringify({ start: 1, header: 1, end: 5 }),
        'a TypeScript expectation resolves to its it/test callback, closer included',
        enclosingFunction(typescript, 4),
      );
      assert(
        JSON.stringify(enclosingFunction(typescript, 10)) === JSON.stringify({ start: 7, header: 7, end: 12 }),
        'an expectation nested in an if still resolves to the test',
        enclosingFunction(typescript, 10),
      );
      const loop = [
        "test('a', () => {",
        '  const items = load();',
        '  for (const item of items) {',
        '    expect(item).toBe(1);',
        '  }',
        '});',
      ];
      assert(enclosingFunction(loop, 4)?.header === 1, 'a for loop is control flow and no test header', enclosingFunction(loop, 4));
      const wrappedDecorator = ['@pytest.mark.parametrize(', '    "x",', '    [1, 2],', ')', 'def test_x(x):', '    assert x > 0'];
      assert(
        JSON.stringify(enclosingFunction(wrappedDecorator, 6)) === JSON.stringify({ start: 1, header: 5, end: 6 }),
        'a def that follows a wrapped decorator includes the whole decorator',
        enclosingFunction(wrappedDecorator, 6),
      );
      const oneLineDecorator = ['@pytest.mark.parametrize("expected", [18.0])', 'def test_x(expected):', '    assert f() == expected'];
      assert(
        JSON.stringify(enclosingFunction(oneLineDecorator, 3)) === JSON.stringify({ start: 1, header: 2, end: 3 }),
        'a one-line decorator is part of the block',
        enclosingFunction(oneLineDecorator, 3),
      );
      const wrapped = ['def test_wrapped(', '    cart,', '    code,', '):', '    total = apply(cart, code)', '    assert total == 18.0'];
      assert(
        JSON.stringify(enclosingFunction(wrapped, 6)) === JSON.stringify({ start: 1, header: 1, end: 6 }),
        'a def whose signature wraps lines keeps its whole body',
        enclosingFunction(wrapped, 6),
      );
      const rspec = ['  it "applies the discount" do', '    cart = build(:cart)', '    expect(apply(cart)).to eq(18)', '  end'];
      assert(enclosingFunction(rspec, 3)?.header === 1, 'an RSpec it block is a test header', enclosingFunction(rspec, 3));
      const csharp = [
        '    public void AppliesTheDiscount()',
        '    {',
        '        var expected = Load();',
        '        Assert.Equal(expected, Apply());',
        '    }',
      ];
      assert(
        enclosingFunction(csharp, 4)?.header === 1,
        'a C# method with its brace on the next line is a header',
        enclosingFunction(csharp, 4),
      );
      const php = [
        '    public function testApplies(): void',
        '    {',
        '        $expected = load();',
        '        $this->assertSame($expected, apply());',
        '    }',
      ];
      assert(
        enclosingFunction(php, 4)?.header === 1,
        'a PHP method with its brace on the next line is a header',
        enclosingFunction(php, 4),
      );

      assert(
        sharedIdentifiers(
          "  const expected = applyDiscount(cart, 'SAVE10');",
          "  expect(applyDiscount(cart, 'SAVE10')).toBe(expected);",
        ).join(',') === 'applydiscount,cart,expected',
        'two lines share their identifiers, string literals and trivial words ignored',
      );
      assert(sharedIdentifiers('    x = apply(cart)', '    assert x == 18.0').length === 0, 'a one-letter name ties nothing together');
      assert(
        [...definedIdentifiers('    expected = apply_discount(cart, "SAVE10")')].join(',') === 'expected' &&
          [...definedIdentifiers('    self.expected = load()')].join(',') === 'expected' &&
          [...definedIdentifiers('  let(:expected_total) { 18 }')].join(',') === 'expected_total' &&
          definedIdentifiers('    assert apply(cart) == expected').size === 0 &&
          definedIdentifiers('    # expected = 5').size === 0,
        'a line defines the left side of an assignment and a Ruby let, and nothing for a comparison or a comment',
      );
    });

    section('diff-evidence attribution', () => {
      for (const [label, file, base, change, symptom, cause, otherLine] of [
        ['TypeScript', 'tests/discount.spec.ts', DISCOUNT_BASE, DISCOUNT_PR, 4, 3, 10],
        ['Python', 'tests/test_discount.py', PYTHON_BASE, PYTHON_PR, 8, 7, 14],
      ]) {
        const repo = pullRequestRepo(tmpRoot, `attribution-${label}`, { [file]: base }, { [file]: change });
        const evidence = getDiffEvidence({ base: 'main', projectRoot: repo, files: [file] });
        const symptomFinding = classifyFinding({ file, line: symptom, row: 'C3' }, evidence);
        assert(
          symptomFinding.line === cause &&
            symptomFinding.provenance === 'modified' &&
            symptomFinding.changed_line_evidence.changed === true,
          `${label}: a finding on the unchanged assertion moves to the changed setup line that caused it`,
          symptomFinding,
        );
        assert(
          symptomFinding.changed_line_evidence.symptomLine === symptom &&
            /defines expected/.test(symptomFinding.changed_line_evidence.reason),
          `${label}: the evidence keeps the symptom line and names what the changed line defines`,
          symptomFinding.changed_line_evidence,
        );
        const classified = applyFindingProvenance([{ file, line: symptom, row: 'C3' }], evidence, 'introduced');
        assert(classified[0].verdict_impact === true, `${label}: the attributed finding gates under --gate-on introduced`, classified[0]);
        const whole = applyFindingProvenance([{ file, line: symptom, row: 'C3' }], evidence, 'all');
        assert(
          whole[0].line === symptom && whole[0].changed_line_evidence.symptomLine === symptom,
          `${label}: a whole-file review keeps the agent's own line`,
          whole[0],
        );
        const otherTest = classifyFinding({ file, line: otherLine, row: 'H3' }, evidence);
        assert(
          otherTest.provenance === 'pre_existing' && otherTest.line === otherLine,
          `${label}: a finding in a test the pull request did not touch stays pre-existing, on its own line`,
          otherTest,
        );
        const changedLine = classifyFinding({ file, line: cause, row: 'C3' }, evidence);
        assert(
          changedLine.provenance === 'modified' && changedLine.changed_line_evidence.symptomLine === undefined,
          `${label}: a finding already on the changed line is classified as before`,
          changedLine,
        );
        const noLine = classifyFinding({ file, line: null, row: 'C3' }, evidence);
        assert(
          noLine.provenance === 'modified' && /conservatively/.test(noLine.changed_line_evidence.reason),
          `${label}: a finding with no line stays conservative`,
          noLine,
        );
        const pastEnd = classifyFinding({ file, line: 999, row: 'C3' }, evidence);
        const beforeStart = classifyFinding({ file, line: 0, row: 'C3' }, evidence);
        assert(
          pastEnd.provenance === 'modified' &&
            beforeStart.provenance === 'modified' &&
            /outside the file/.test(pastEnd.changed_line_evidence.reason),
          `${label}: a line outside the file stays conservative and cannot disappear`,
          { pastEnd, beforeStart },
        );
      }

      const closest = classifyIn(
        tmpRoot,
        'closest',
        'tests/closest.spec.ts',
        lines(
          "test('a', () => {",
          '  const cart = makeCart(1);',
          '  const expected = 18;',
          '  expect(applyDiscount(cart)).toBe(expected);',
          '  cart.reset();',
          '});',
        ),
        lines(
          "test('a', () => {",
          '  const cart = makeCart(2);',
          '  const expected = applyDiscount(cart);',
          '  expect(applyDiscount(cart)).toBe(expected);',
          '  cart.reset();',
          '});',
        ),
        { line: 4, row: 'C3' },
      );
      assert(closest.line === 3, 'with several changed definitions the closest one before the assertion is the cause', closest);
      const laterChange = classifyIn(
        tmpRoot,
        'later-change',
        'tests/later.spec.ts',
        lines(
          "test('a', () => {",
          '  const cart = makeCart(1);',
          '  const expected = 18;',
          '  expect(applyDiscount(cart)).toBe(expected);',
          '  const cart2 = makeCart(1);',
          '});',
        ),
        lines(
          "test('a', () => {",
          '  const cart = makeCart(1);',
          '  const expected = 18;',
          '  expect(applyDiscount(cart)).toBe(expected);',
          '  const cart2 = makeCart(2);',
          '});',
        ),
        { line: 4, row: 'C3' },
      );
      assert(laterChange.provenance === 'pre_existing', 'a changed line after the assertion is never its cause', laterChange);

      const introduced = classifyIn(
        tmpRoot,
        'introduced-cause',
        'tests/introduced.spec.ts',
        lines("test('a', () => {", '  const cart = makeCart();', '  expect(cart.total()).toBe(20);', '});'),
        lines("test('a', () => {", '  const cart = makeCart();', '  cart.total = () => 20;', '  expect(cart.total()).toBe(20);', '});'),
        { line: 4, row: 'C3' },
      );
      assert(
        introduced.line === 3 && introduced.provenance === 'introduced',
        'an added defining line makes the finding introduced',
        introduced,
      );

      const fixture = classifyIn(
        tmpRoot,
        'fixture',
        'tests/test_fixture.py',
        lines(
          'import pytest',
          '',
          '',
          '@pytest.fixture',
          'def expected_total():',
          '    return 18.0',
          '',
          '',
          'def test_total(expected_total):',
          '    assert apply_discount(20.0, "SAVE10") == expected_total',
        ),
        lines(
          'import pytest',
          '',
          '',
          '@pytest.fixture',
          'def expected_total():',
          '    return apply_discount(20.0, "SAVE10")',
          '',
          '',
          'def test_total(expected_total):',
          '    assert apply_discount(20.0, "SAVE10") == expected_total',
        ),
        { line: 10, row: 'C3' },
      );
      assert(
        fixture.line === 6 && fixture.provenance === 'modified',
        'a changed pytest fixture is the cause of the assertion that receives it',
        fixture,
      );

      const hook = classifyIn(
        tmpRoot,
        'hook',
        'tests/hook.spec.ts',
        lines(
          "describe('cart', () => {",
          '  let expected;',
          '  beforeEach(() => {',
          '    expected = 18;',
          '  });',
          '',
          "  it('applies', () => {",
          '    expect(applyDiscount(20)).toBe(expected);',
          '  });',
          '});',
        ),
        lines(
          "describe('cart', () => {",
          '  let expected;',
          '  beforeEach(() => {',
          '    expected = applyDiscount(20);',
          '  });',
          '',
          "  it('applies', () => {",
          '    expect(applyDiscount(20)).toBe(expected);',
          '  });',
          '});',
        ),
        { line: 8, row: 'C3' },
      );
      assert(hook.line === 4, 'a changed beforeEach is the cause of the assertion that reads what it sets', hook);

      const setUp = classifyIn(
        tmpRoot,
        'setup',
        'tests/test_unit.py',
        lines(
          'class CartTest(TestCase):',
          '    def setUp(self):',
          '        self.expected = 18.0',
          '',
          '    def test_total(self):',
          '        self.assertEqual(apply_discount(20.0), self.expected)',
        ),
        lines(
          'class CartTest(TestCase):',
          '    def setUp(self):',
          '        self.expected = apply_discount(20.0)',
          '',
          '    def test_total(self):',
          '        self.assertEqual(apply_discount(20.0), self.expected)',
        ),
        { line: 6, row: 'C3' },
      );
      assert(setUp.line === 3, 'a changed unittest setUp is the cause of the assertion that reads self.expected', setUp);

      const constant = classifyIn(
        tmpRoot,
        'constant',
        'tests/test_constant.py',
        lines('EXPECTED = 18.0', '', '', 'def test_total():', '    assert apply_discount(20.0) == EXPECTED'),
        lines('EXPECTED = apply_discount(20.0)', '', '', 'def test_total():', '    assert apply_discount(20.0) == EXPECTED'),
        { line: 5, row: 'C3' },
      );
      assert(constant.line === 1, 'a changed module constant is the cause of the assertion that reads it', constant);

      const parametrize = classifyIn(
        tmpRoot,
        'parametrize',
        'tests/test_param.py',
        lines(
          '@pytest.mark.parametrize(',
          '    "expected",',
          '    [18.0],',
          ')',
          'def test_total(expected):',
          '    assert apply_discount(20.0) == expected',
        ),
        lines(
          '@pytest.mark.parametrize(',
          '    "expected",',
          '    [apply_discount(20.0)],',
          ')',
          'def test_total(expected):',
          '    assert apply_discount(20.0) == expected',
        ),
        { line: 6, row: 'H10' },
      );
      assert(
        parametrize.provenance === 'modified' && parametrize.changed_line_evidence.symptomLine === 6,
        'a changed wrapped parametrize table is the cause of the assertion it feeds',
        parametrize,
      );

      const rspec = classifyIn(
        tmpRoot,
        'rspec',
        'spec/cart_spec.rb',
        lines(
          'RSpec.describe Cart do',
          '  it "applies the discount" do',
          '    expected = 18',
          '    expect(apply(20)).to eq(expected)',
          '  end',
          'end',
        ),
        lines(
          'RSpec.describe Cart do',
          '  it "applies the discount" do',
          '    expected = apply(20)',
          '    expect(apply(20)).to eq(expected)',
          '  end',
          'end',
        ),
        { line: 4, row: 'C3' },
      );
      assert(rspec.line === 3, 'an RSpec example is attributed like any other test', rspec);

      const sharedName = classifyIn(
        tmpRoot,
        'shared-name',
        'tests/pw.spec.ts',
        lines("test('a', async ({ page }) => {", "  await page.goto('/cart');", '  await page.waitForTimeout(2000);', '});'),
        lines("test('a', async ({ page }) => {", "  await page.goto('/cart?coupon=X');", '  await page.waitForTimeout(2000);', '});'),
        { line: 3, row: 'H1' },
      );
      assert(
        sharedName.provenance === 'pre_existing',
        'editing a line that merely shares a name with an old defect does not take ownership of it',
        sharedName,
      );
      const redefined = classifyIn(
        tmpRoot,
        'redefined',
        'tests/test_unrelated.py',
        lines('def test_a():', '    response = call()', '    assert response'),
        lines('def test_a():', '    response = call("x")', '    assert response'),
        { line: 3, row: 'H10' },
      );
      assert(
        redefined.line === 2 && redefined.provenance === 'modified',
        'a changed definition of the name an old assertion reads takes the assertion, since the setup can change what it checks',
        redefined,
      );
      const otherRow = classifyIn(
        tmpRoot,
        'other-row',
        'tests/test_other_row.py',
        lines('def test_a():', '    cart = make()', '    time.sleep(2)', '    assert cart'),
        lines('def test_a():', '    cart = make(2)', '    time.sleep(2)', '    assert cart'),
        { line: 3, row: 'H1' },
      );
      assert(otherRow.provenance === 'pre_existing', 'a hard wait is not an assertion row and stays with the base', otherRow);
      const comment = classifyIn(
        tmpRoot,
        'comment',
        'tests/test_comment.py',
        lines('def test_a():', '    response = call()', '    assert response'),
        lines('def test_a():', '    # response = the response must come back', '    response = call()', '    assert response'),
        { line: 4, row: 'H10' },
      );
      assert(comment.provenance === 'pre_existing', 'a comment added above an old assertion does not take ownership of it', comment);
      const localShadow = classifyIn(
        tmpRoot,
        'local-shadow',
        'tests/test_shadow.py',
        lines('def test_a():', '    total = 5', '    assert total == 5', '', '', 'def test_b():', '    total = 7'),
        lines('def test_a():', '    total = 5', '    assert total == 5', '', '', 'def test_b():', '    total = 9'),
        { line: 3, row: 'C3' },
      );
      assert(
        localShadow.provenance === 'pre_existing',
        "a name the assertion's own test defines is not redefined by a change in another test",
        localShadow,
      );

      const deleted = classifyIn(
        tmpRoot,
        'deleted',
        'tests/del.spec.ts',
        lines(
          "test('a', () => {",
          '  const cart = makeCart();',
          '  expect(cart.total()).toBe(20);',
          '});',
          '',
          "test('b', () => {",
          '  expect(1).toBe(1);',
          '});',
        ),
        lines("test('a', () => {", '  const cart = makeCart();', '});', '', "test('b', () => {", '  expect(1).toBe(1);', '});'),
        { line: 2, row: 'C4' },
      );
      assert(
        deleted.provenance === 'modified' && /removed an assertion/.test(deleted.changed_line_evidence.reason),
        'a test that lost its assertion is PR-owned',
        deleted,
      );
      const deletedElsewhere = classifyIn(
        tmpRoot,
        'deleted-elsewhere',
        'tests/del2.spec.ts',
        lines(
          "test('a', () => {",
          '  const cart = makeCart();',
          '  expect(cart.total()).toBe(20);',
          '});',
          '',
          "test('b', () => {",
          '  const x = 1;',
          '  expect(x).toBe(1);',
          '});',
        ),
        lines(
          "test('a', () => {",
          '  const cart = makeCart();',
          '  expect(cart.total()).toBe(20);',
          '});',
          '',
          "test('b', () => {",
          '  expect(1).toBe(1);',
          '});',
        ),
        { line: 3, row: 'H10' },
      );
      assert(
        deletedElsewhere.provenance === 'pre_existing',
        'a deletion in another test does not take ownership of an old finding',
        deletedElsewhere,
      );

      const ranged = classifyIn(
        tmpRoot,
        'range',
        'tests/test_shop.py',
        lines('def test_shop():', '    a = 1', '    b = 2', '    c = 3', '    d = 4', '    assert a'),
        lines('def test_shop():', '    a = 1', '    b = 2', '    c = 30', '    d = 4', '    assert a'),
        { line: 2, row: 'C3' },
        5,
      );
      assert(
        ranged.provenance === 'modified' && ranged.changed_line_evidence.changed === true,
        'a Location range that covers a changed line is PR-owned',
        ranged,
      );
      const rangeMiss = classifyIn(
        tmpRoot,
        'range-miss',
        'tests/test_shop2.py',
        lines('def test_shop():', '    a = 1', '    b = 2', '    c = 3', '    assert a'),
        lines('def test_shop():', '    a = 1', '    b = 2', '    c = 3', '    assert a', '    x = 9'),
        { line: 2, row: 'H1' },
        3,
      );
      assert(rangeMiss.provenance === 'pre_existing', 'a Location range clear of every change stays pre-existing', rangeMiss);

      const threeTests = lines(
        'def test_a():',
        '    assert 1',
        '',
        '',
        'def test_b():',
        '    assert 1',
        '',
        '',
        'def test_c():',
        '    assert 1',
      );
      const twoTests = lines('def test_a():', '    assert 1', '', '', 'def test_b():', '    assert 1');
      const addedTest = classifyIn(tmpRoot, 'm4-added-test', 'tests/test_m4.py', twoTests, threeTests, { line: 9, row: 'M4' });
      assert(
        addedTest.provenance === 'pre_existing' && /judges how the file is grouped/.test(addedTest.changed_line_evidence.reason),
        "a third test added to an ungrouped file does not make the whole file the pull request's (M4)",
        addedTest,
      );
      const groupingChange = classifyIn(
        tmpRoot,
        'm4-grouping',
        'tests/grouping.spec.ts',
        lines("describe('cart', () => {", "  it('a', () => {});", "  it('b', () => {});", "  it('c', () => {});", '});'),
        lines("it('a', () => {});", "it('b', () => {});", "it('c', () => {});"),
        { line: 1, row: 'M4' },
      );
      assert(groupingChange.provenance === 'modified', "removing a describe from a file makes M4 the pull request's", groupingChange);

      const unrelated = pullRequestRepo(
        tmpRoot,
        'attribution-unrelated',
        { 'tests/mixed.spec.ts': "test('a', () => {\n  const widget = 1;\n  const gadget = 2;\n  expect(gadget).toBe(2);\n});\n" },
        { 'tests/mixed.spec.ts': "test('a', () => {\n  const widget = 5;\n  const gadget = 2;\n  expect(gadget).toBe(2);\n});\n" },
      );
      const unrelatedEvidence = getDiffEvidence({ base: 'main', projectRoot: unrelated, files: ['tests/mixed.spec.ts'] });
      assert(
        classifyFinding({ file: 'tests/mixed.spec.ts', line: 4, row: 'C3' }, unrelatedEvidence).provenance === 'pre_existing',
        'a changed line that defines nothing the assertion reads does not take ownership of it',
      );
      const addedRepo = pullRequestRepo(tmpRoot, 'attribution-added', { 'README.md': 'x\n' }, { 'tests/new.spec.ts': DISCOUNT_BASE });
      const addedEvidence = getDiffEvidence({ base: 'main', projectRoot: addedRepo, files: ['tests/new.spec.ts'] });
      assert(
        classifyFinding({ file: 'tests/new.spec.ts', line: 4, row: 'C3' }, addedEvidence).provenance === 'introduced',
        'a finding in an added file is introduced, symptom or not',
      );

      // ---- the shapes the first review round found, and the rows and boundaries each rule needs ----
      const caseOf = (name, file, base, change, finding, lineEnd = null) => classifyIn(tmpRoot, name, file, base, change, finding, lineEnd);

      const otherLocals = caseOf(
        'other-locals',
        'tests/test_other_locals.py',
        lines('def test_a(client):', '    assert client.get() is not None', '', '', 'def test_b():', '    client = make()'),
        lines('def test_a(client):', '    assert client.get() is not None', '', '', 'def test_b():', '    client = make(2)'),
        { line: 2, row: 'H10' },
      );
      assert(
        otherLocals.provenance === 'pre_existing' && otherLocals.line === 2,
        "a change to a local of another test never takes an untouched test's finding",
        otherLocals,
      );
      const otherLocalMethod = caseOf(
        'other-local-method',
        'tests/other.spec.ts',
        lines(
          "test('a', () => {",
          '  const total = cart.total();',
          '  expect(total).toBe(1);',
          '});',
          '',
          "test('b', () => {",
          '  expect(cart.total()).toBeTruthy();',
          '});',
        ),
        lines(
          "test('a', () => {",
          '  const total = cart.total(2);',
          '  expect(total).toBe(1);',
          '});',
          '',
          "test('b', () => {",
          '  expect(cart.total()).toBeTruthy();',
          '});',
        ),
        { line: 7, row: 'H10' },
      );
      assert(
        otherLocalMethod.provenance === 'pre_existing',
        "a method name shared with another test's local ties nothing together",
        otherLocalMethod,
      );

      const renamed = caseOf(
        'renamed',
        'tests/renamed.spec.ts',
        lines("it('sums the cart', () => {", '  expect(cart.total).toBe(cart.total);', '});'),
        lines("it('sums the cart total', () => {", '  expect(cart.total).toBe(cart.total);', '});'),
        { line: 2, row: 'C3' },
      );
      assert(renamed.provenance === 'pre_existing', 'renaming a test does not take its old findings', renamed);
      const renamedDef = caseOf(
        'renamed-def',
        'tests/test_renamed.py',
        lines('def test_total(cart):', '    assert cart.total() == cart.total()'),
        lines('def test_cart_total(cart):', '    assert cart.total() == cart.total()'),
        { line: 2, row: 'C3' },
      );
      assert(renamedDef.provenance === 'pre_existing', 'renaming a def does not take its old findings', renamedDef);
      const newParameter = caseOf(
        'new-parameter',
        'tests/test_param_added.py',
        lines('def test_total(cart):', '    assert apply(cart) == expected'),
        lines('def test_total(cart, expected):', '    assert apply(cart) == expected'),
        { line: 2, row: 'C3' },
      );
      assert(
        newParameter.line === 1 && newParameter.provenance === 'modified',
        'a changed parameter list is the cause of the assertion that reads the new parameter',
        newParameter,
      );

      const wrappedStatement = caseOf(
        'wrapped-statement',
        'tests/test_wrapped_statement.py',
        lines('def test_save10():', '    expected = (', '        18.0', '    )', '    assert apply_discount(20.0) == expected'),
        lines(
          'def test_save10():',
          '    expected = (',
          '        apply_discount(20.0)',
          '    )',
          '    assert apply_discount(20.0) == expected',
        ),
        { line: 5, row: 'C3' },
      );
      assert(
        wrappedStatement.line === 3 && wrappedStatement.provenance === 'modified',
        'a changed continuation line takes the definition of the statement it continues',
        wrappedStatement,
      );
      const wrappedTs = caseOf(
        'wrapped-ts',
        'tests/wrapped.spec.ts',
        lines("test('a', () => {", '  const expected = round(', '    18,', '  );', '  expect(applyDiscount(20)).toBe(expected);', '});'),
        lines(
          "test('a', () => {",
          '  const expected = round(',
          '    applyDiscount(20),',
          '  );',
          '  expect(applyDiscount(20)).toBe(expected);',
          '});',
        ),
        { line: 5, row: 'C3' },
      );
      assert(wrappedTs.line === 3, 'a wrapped TypeScript call is read the same way', wrappedTs);

      const transitive = caseOf(
        'transitive',
        'tests/test_transitive.py',
        lines('def test_save10():', '    base = 18.0', '    expected = base', '    assert apply_discount(20.0) == expected'),
        lines(
          'def test_save10():',
          '    base = apply_discount(20.0)',
          '    expected = base',
          '    assert apply_discount(20.0) == expected',
        ),
        { line: 4, row: 'C3' },
      );
      assert(transitive.line === 2, 'a changed definition the assertion reaches through other assignments is the cause', transitive);

      const mocked = caseOf(
        'mocked',
        'tests/test_mocked.py',
        lines('def test_checkout(mocker):', '    cart = make()', '    assert checkout(cart) == 18.0'),
        lines(
          'def test_checkout(mocker):',
          '    cart = make()',
          '    mocker.patch("app.checkout", return_value=18.0)',
          '    assert checkout(cart) == 18.0',
        ),
        { line: 4, row: 'C3' },
      );
      assert(
        mocked.line === 3 && mocked.provenance === 'introduced',
        'an added patch of the code under test is the cause of the assertion on it',
        mocked,
      );
      const spied = caseOf(
        'spied',
        'tests/spied.spec.ts',
        lines("test('a', () => {", '  expect(pricing.applyDiscount(20)).toBe(18);', '});'),
        lines(
          "test('a', () => {",
          "  jest.spyOn(pricing, 'applyDiscount').mockReturnValue(18);",
          '  expect(pricing.applyDiscount(20)).toBe(18);',
          '});',
        ),
        { line: 3, row: 'C3' },
      );
      assert(spied.line === 2, 'an added spy of the code under test is the cause of the assertion on it', spied);
      const withAs = caseOf(
        'with-as',
        'tests/test_with_as.py',
        lines('def test_checkout():', '    with patch("app.other") as stub:', '        assert apply_discount(stub) == 18.0'),
        lines('def test_checkout():', '    with patch("app.apply_discount") as stub:', '        assert apply_discount(stub) == 18.0'),
        { line: 3, row: 'C3' },
      );
      assert(withAs.line === 2, 'a changed `with ... as name` binding is a definition', withAs);

      const replacedAssertion = caseOf(
        'replaced-assertion',
        'tests/test_replaced.py',
        lines('def test_total():', '    total = compute()', '    assert total == 18.0'),
        lines('def test_total():', '    total = compute()', '    print(total)'),
        { line: 1, row: 'C4' },
      );
      assert(
        replacedAssertion.provenance === 'modified',
        'a test whose assertion was replaced by a statement is PR-owned for C4',
        replacedAssertion,
      );
      const wholeTest = caseOf(
        'whole-test',
        'tests/whole.spec.ts',
        lines("test('a', () => {", '  const user = load();', '  expect(user.id).toBe(42);', '  expect(user.name).toBeDefined();', '});'),
        lines("test('a', () => {", '  const user = load();', '  expect(user.id).toBe(43);', '  expect(user.name).toBeDefined();', '});'),
        { line: 4, row: 'H10' },
      );
      assert(
        wholeTest.provenance === 'modified' && /describes the whole test/.test(wholeTest.changed_line_evidence.reason),
        'a changed test owns the rows that describe the whole test (H10)',
        wholeTest,
      );
      const wholeTestComment = caseOf(
        'whole-test-comment',
        'tests/whole2.spec.ts',
        lines("test('a', () => {", '  const user = load();', '  expect(user.name).toBeDefined();', '});'),
        lines("test('a', () => {", '  // the user must load', '  const user = load();', '  expect(user.name).toBeDefined();', '});'),
        { line: 4, row: 'H10' },
      );
      assert(wholeTestComment.provenance === 'pre_existing', 'a comment added to a test does not take its findings', wholeTestComment);
      const commentDeleted = caseOf(
        'comment-deleted',
        'tests/test_comment_deleted.py',
        lines('def test_a():', '    # todo one', '    # todo two', '    x = 1', '    assert x == x'),
        lines('def test_a():', '    x = 1', '    assert x == x'),
        { line: 3, row: 'C3' },
      );
      assert(commentDeleted.provenance === 'pre_existing', 'deleting comment lines in a test does not take its findings', commentDeleted);

      const bigBase = Array.from({ length: 989 }, (_, index) => `x${index} = ${index}`);
      const tail = Array.from({ length: 30 }, (_, index) => `y${index} = ${index}`);
      const crossed = caseOf('size-crossed', 'tests/test_big.py', lines(...bigBase), lines(...bigBase, ...tail), { line: 1, row: 'H5' });
      assert(
        crossed.provenance === 'modified' && /took the file over/.test(crossed.changed_line_evidence.reason),
        'the pull request that takes a file over 1000 lines owns H5',
        crossed,
      );
      const alreadyBig = caseOf(
        'size-already',
        'tests/test_big2.py',
        lines(...bigBase, ...tail),
        lines('import os', ...bigBase.slice(1), ...tail, 'z = 1'),
        { line: 1, row: 'H5' },
      );
      assert(alreadyBig.provenance === 'pre_existing', 'a file that was already over 1000 lines stays with the base', alreadyBig);

      const notGrouping = caseOf(
        'not-grouping',
        'tests/pw2.spec.ts',
        lines(
          "test('a', async ({ context }) => {",
          '  await context.clearCookies();',
          '});',
          '',
          "test('b', async () => {});",
          "test('c', async () => {});",
        ),
        lines(
          "test('a', async ({ context }) => {",
          '  await context.clearCookies(true);',
          '});',
          '',
          "test('b', async () => {});",
          "test('c', async () => {});",
        ),
        { line: 5, row: 'M4' },
      );
      assert(
        notGrouping.provenance === 'pre_existing',
        'a line that merely contains the word context is not a grouping construct',
        notGrouping,
      );
      const exportsLine = caseOf(
        'exports-line',
        'tests/exports.spec.ts',
        lines("test('a', () => {});", "test('b', () => {});", "test('c', () => {});", 'module.exports = { a: 1 };'),
        lines("test('a', () => {});", "test('b', () => {});", "test('c', () => {});", 'module.exports = { a: 2 };'),
        { line: 1, row: 'M4' },
      );
      assert(exportsLine.provenance === 'pre_existing', 'module.exports is not a grouping construct', exportsLine);

      // Row membership: each assertion row is attributed, and a row about anything else is not.
      for (const row of ['C3', 'C4', 'C5', 'C6', 'H3', 'H10']) {
        const got = caseOf(
          `row-${row}`,
          `tests/test_row_${row}.py`,
          lines('def test_a():', '    expected = 1', '    assert f() == expected'),
          lines('def test_a():', '    expected = g()', '    assert f() == expected'),
          { line: 3, row },
        );
        assert(got.line === 2 && got.provenance === 'modified', `row ${row} is attributed to the changed definition`, got);
      }
      const delayed = caseOf(
        'delayed',
        'tests/test_delay.py',
        lines('def test_a():', '    delay = 2', '    time.sleep(delay)'),
        lines('def test_a():', '    delay = 3', '    time.sleep(delay)'),
        { line: 3, row: 'H1' },
      );
      assert(
        delayed.provenance === 'pre_existing',
        'a hard wait that reads a changed name is not an assertion row and stays with the base',
        delayed,
      );

      const laterRedefinition = caseOf(
        'later-redefinition',
        'tests/test_later_redefinition.py',
        lines('def test_a():', '    total = 18', '    assert f() == total', '    total = 0'),
        lines('def test_a():', '    total = 18', '    assert f() == total', '    total = 1'),
        { line: 3, row: 'C3' },
      );
      assert(
        laterRedefinition.provenance === 'pre_existing',
        'a later redefinition of a name the assertion reads is not its cause',
        laterRedefinition,
      );
      const fixtureBelow = caseOf(
        'fixture-below',
        'tests/test_fixture_below.py',
        lines(
          'def test_a(expected):',
          '    value = f()',
          '    assert value == expected',
          '',
          '',
          '@pytest.fixture',
          'def expected():',
          '    return 1',
        ),
        lines(
          'def test_a(expected):',
          '    value = f()',
          '    assert value == expected',
          '',
          '',
          '@pytest.fixture',
          'def expected():',
          '    return g()',
        ),
        { line: 3, row: 'C3' },
      );
      assert(
        fixtureBelow.line === 8 && fixtureBelow.provenance === 'modified',
        'a fixture defined below the test is the cause of the assertion that receives it',
        fixtureBelow,
      );
      const commentInFixture = caseOf(
        'comment-in-fixture',
        'tests/test_comment_fixture.py',
        lines(
          '@pytest.fixture',
          'def expected_total():',
          '    return 18.0',
          '',
          '',
          'def test_total(expected_total):',
          '    assert f() == expected_total',
        ),
        lines(
          '@pytest.fixture',
          'def expected_total():',
          '    # expected_total stays 18.0',
          '    return 18.0',
          '',
          '',
          'def test_total(expected_total):',
          '    assert f() == expected_total',
        ),
        { line: 8, row: 'C3' },
      );
      assert(commentInFixture.provenance === 'pre_existing', 'a comment added inside a fixture is not a cause', commentInFixture);
      const oneLineDecorator = caseOf(
        'one-line-decorator',
        'tests/test_decorator.py',
        lines('@pytest.mark.parametrize("expected", [18.0])', 'def test_a(expected):', '    assert f() == expected'),
        lines('@pytest.mark.parametrize("expected", [19.0])', 'def test_a(expected):', '    assert f() == expected'),
        { line: 3, row: 'C3' },
      );
      assert(
        oneLineDecorator.line === 1 && oneLineDecorator.provenance === 'modified',
        'a changed one-line parametrize table is the cause of the assertion it feeds',
        oneLineDecorator,
      );

      const firstBodyLineDeleted = caseOf(
        'deleted-first-line',
        'tests/del3.spec.ts',
        lines("test('a', () => {", '  expect(cart.total()).toBe(20);', '  const x = 1;', '  expect(x).toBe(1);', '});'),
        lines("test('a', () => {", '  const x = 1;', '  expect(x).toBe(1);', '});'),
        { line: 3, row: 'C4' },
      );
      assert(
        firstBodyLineDeleted.provenance === 'modified',
        'an assertion deleted from the first line of a test is PR-owned',
        firstBodyLineDeleted,
      );
      const lastLineDeleted = caseOf(
        'deleted-last-line',
        'tests/test_del4.py',
        lines('def test_a():', '    x = 1', '    assert x == 2'),
        lines('def test_a():', '    x = 1'),
        { line: 2, row: 'C4' },
      );
      assert(lastLineDeleted.provenance === 'modified', 'an assertion deleted from the last line of a test is PR-owned', lastLineDeleted);

      // Changed test-support files outside the review set.
      const conftestRepo = pullRequestRepo(
        tmpRoot,
        'conftest',
        {
          'tests/conftest.py': lines('import pytest', '', '', '@pytest.fixture', 'def expected_total():', '    return 18.0'),
          'tests/test_checkout.py': lines(
            'def test_total(expected_total):',
            '    assert checkout(make_cart()) == expected_total',
            '',
            '',
            'def test_other():',
            '    assert True',
          ),
        },
        {
          'tests/conftest.py': lines(
            'import pytest',
            '',
            '',
            '@pytest.fixture',
            'def expected_total():',
            '    return checkout(make_cart())',
          ),
          'tests/test_checkout.py': lines(
            'def test_total(expected_total):',
            '    assert checkout(make_cart()) == expected_total',
            '',
            '',
            'def test_other():',
            '    assert 1 == 1',
          ),
        },
      );
      const conftestEvidence = getDiffEvidence({
        base: 'main',
        projectRoot: conftestRepo,
        files: ['tests/test_checkout.py'],
        contextFiles: ['tests/conftest.py', 'src/pricing.py'],
      });
      const viaConftest = classifyFinding({ file: 'tests/test_checkout.py', line: 2, row: 'C3' }, conftestEvidence);
      assert(
        viaConftest.file === 'tests/conftest.py' &&
          viaConftest.line === 6 &&
          viaConftest.provenance === 'modified' &&
          viaConftest.changed_line_evidence.symptomFile === 'tests/test_checkout.py',
        'a changed conftest fixture is the cause of the assertion that receives it, and the finding is cited there',
        viaConftest,
      );
      assert(
        [...conftestEvidence.contexts.keys()].join(',') === 'tests/conftest.py',
        'only test-support files outside the review set are read as context, and production sources are not',
        [...conftestEvidence.contexts.keys()],
      );
      const wholeFileConftest = applyFindingProvenance([{ file: 'tests/test_checkout.py', line: 2, row: 'C3' }], conftestEvidence, 'all');
      assert(
        wholeFileConftest[0].file === 'tests/test_checkout.py' && wholeFileConftest[0].line === 2,
        "a whole-file review keeps the agent's file and line",
        wholeFileConftest[0],
      );

      // Cost: a table of thousands of changed rows with several findings stays fast.
      const tableBase = lines(
        'test.each([',
        ...Array.from({ length: 6000 }, (_, index) => `  [${index}, ${index}],`),
        "])('row', (a, b) => {",
        '  expect(a).toBe(b);',
        '});',
        '',
        ...Array.from({ length: 8 }, (_, index) => `test('t${index}', () => { expect(cart${index}).toBeTruthy(); });`),
      );
      const tableChange = tableBase.replaceAll(/\[(\d+), \d+\]/g, '[$1, 0]');
      const timingRepo = pullRequestRepo(tmpRoot, 'timing', { 'tests/table.spec.ts': tableBase }, { 'tests/table.spec.ts': tableChange });
      const timingEvidence = getDiffEvidence({ base: 'main', projectRoot: timingRepo, files: ['tests/table.spec.ts'] });
      const started = Date.now();
      for (let index = 0; index < 8; index += 1)
        classifyFinding({ file: 'tests/table.spec.ts', line: 6005 + index, row: 'H10' }, timingEvidence);
      assert(
        Date.now() - started < 3000,
        'classifying findings beside a table of thousands of changed rows stays fast',
        `${Date.now() - started} ms`,
      );
      const hostile = Date.now();
      sharedIdentifiers(`x = "${'\\'.repeat(60)}`, `y = "${'\\'.repeat(60)}`);
      assert(Date.now() - hostile < 500, 'a line of unterminated quotes and escapes cannot hang the scan', `${Date.now() - hostile} ms`);

      // ---- third round: hooks and helpers in other languages, imports, support files in the review set ----
      const javaHook = caseOf(
        'java-hook',
        'src/test/java/CartTest.java',
        lines(
          'class CartTest {',
          '    private double expected;',
          '',
          '    @BeforeEach',
          '    void setUp() {',
          '        expected = 18.0;',
          '    }',
          '',
          '    @Test',
          '    void applies() {',
          '        assertEquals(expected, apply(20.0));',
          '    }',
          '}',
        ),
        lines(
          'class CartTest {',
          '    private double expected;',
          '',
          '    @BeforeEach',
          '    void setUp() {',
          '        expected = apply(20.0);',
          '    }',
          '',
          '    @Test',
          '    void applies() {',
          '        assertEquals(expected, apply(20.0));',
          '    }',
          '}',
        ),
        { line: 11, row: 'C3' },
      );
      assert(
        javaHook.line === 6 && javaHook.provenance === 'modified',
        'a changed JUnit @BeforeEach is the cause of the assertion that reads what it sets',
        javaHook,
      );
      const javaHelper = caseOf(
        'java-helper',
        'src/test/java/HelperTest.java',
        lines(
          'class HelperTest {',
          '    private double expectedFor(double price) {',
          '        return 18.0;',
          '    }',
          '',
          '    @Test',
          '    void applies() {',
          '        assertEquals(expectedFor(20.0), apply(20.0));',
          '    }',
          '}',
        ),
        lines(
          'class HelperTest {',
          '    private double expectedFor(double price) {',
          '        return apply(price);',
          '    }',
          '',
          '    @Test',
          '    void applies() {',
          '        assertEquals(expectedFor(20.0), apply(20.0));',
          '    }',
          '}',
        ),
        { line: 8, row: 'C3' },
      );
      assert(javaHelper.line === 3, 'a changed Java helper method is the cause of the assertion that calls it', javaHelper);
      const csharpHook = caseOf(
        'csharp-hook',
        'tests/CartTests.cs',
        lines(
          'public class CartTests',
          '{',
          '    private decimal expected;',
          '',
          '    [SetUp]',
          '    public void Init()',
          '    {',
          '        expected = 18m;',
          '    }',
          '',
          '    [Test]',
          '    public void Applies()',
          '    {',
          '        Assert.AreEqual(expected, Apply(20m));',
          '    }',
          '}',
        ),
        lines(
          'public class CartTests',
          '{',
          '    private decimal expected;',
          '',
          '    [SetUp]',
          '    public void Init()',
          '    {',
          '        expected = Apply(20m);',
          '    }',
          '',
          '    [Test]',
          '    public void Applies()',
          '    {',
          '        Assert.AreEqual(expected, Apply(20m));',
          '    }',
          '}',
        ),
        { line: 14, row: 'C3' },
      );
      assert(csharpHook.line === 8, 'a changed NUnit [SetUp] is the cause of the assertion that reads what it sets', csharpHook);
      const phpHook = caseOf(
        'php-hook',
        'tests/CartTest.php',
        lines(
          'class CartTest extends TestCase',
          '{',
          '    protected function setUp(): void',
          '    {',
          '        $this->expected = 18.0;',
          '    }',
          '',
          '    public function testApplies(): void',
          '    {',
          '        $this->assertSame($this->expected, apply(20.0));',
          '    }',
          '}',
        ),
        lines(
          'class CartTest extends TestCase',
          '{',
          '    protected function setUp(): void',
          '    {',
          '        $this->expected = apply(20.0);',
          '    }',
          '',
          '    public function testApplies(): void',
          '    {',
          '        $this->assertSame($this->expected, apply(20.0));',
          '    }',
          '}',
        ),
        { line: 10, row: 'C3' },
      );
      assert(phpHook.line === 5, 'a changed PHPUnit setUp is the cause of the assertion that reads what it sets', phpHook);
      const extended = caseOf(
        'playwright-extend',
        'tests/fixtures.ts',
        lines(
          'export const test = base.extend({',
          '  expected: async ({}, use) => {',
          '    await use(18);',
          '  },',
          '});',
          '',
          "test('applies', async ({ expected }) => {",
          '  expect(applyDiscount(20)).toBe(expected);',
          '});',
        ),
        lines(
          'export const test = base.extend({',
          '  expected: async ({}, use) => {',
          '    await use(applyDiscount(20));',
          '  },',
          '});',
          '',
          "test('applies', async ({ expected }) => {",
          '  expect(applyDiscount(20)).toBe(expected);',
          '});',
        ),
        { line: 8, row: 'C3' },
      );
      assert(extended.line === 3, 'a changed Playwright test.extend fixture is the cause of the assertion that receives it', extended);

      const importLine = caseOf(
        'import-line',
        'tests/test_notify.py',
        lines('from unittest.mock import ANY, call, patch', '', '', 'def test_old(send):', '    send.assert_has_calls([call("x", ANY)])'),
        lines(
          'from unittest.mock import ANY, MagicMock, call, patch',
          '',
          '',
          'def test_old(send):',
          '    send.assert_has_calls([call("x", ANY)])',
        ),
        { line: 5, row: 'C5' },
      );
      assert(
        importLine.provenance === 'pre_existing',
        'a changed import line defines nothing, even when it names a mock library',
        importLine,
      );

      // A support file that is itself in the review set is searched like any other changed file.
      const bothRepo = pullRequestRepo(
        tmpRoot,
        'both-in-review-set',
        {
          'tests/conftest.py': lines('import pytest', '', '', '@pytest.fixture', 'def expected_total():', '    return 18.0'),
          'tests/test_cart.py': lines(
            'def test_total(expected_total):',
            '    assert checkout(make_cart()) == expected_total',
            '',
            '',
            'def test_other():',
            '    assert True',
          ),
        },
        {
          'tests/conftest.py': lines(
            'import pytest',
            '',
            '',
            '@pytest.fixture',
            'def expected_total():',
            '    return checkout(make_cart())',
          ),
          'tests/test_cart.py': lines(
            'def test_total(expected_total):',
            '    assert checkout(make_cart()) == expected_total',
            '',
            '',
            'def test_other():',
            '    assert 1 == 1',
          ),
        },
      );
      const bothEvidence = getDiffEvidence({ base: 'main', projectRoot: bothRepo, files: ['tests/conftest.py', 'tests/test_cart.py'] });
      const viaSupport = classifyFinding({ file: 'tests/test_cart.py', line: 2, row: 'C3' }, bothEvidence);
      assert(
        viaSupport.file === 'tests/conftest.py' && viaSupport.line === 6,
        'a changed conftest in the review set is the cause of the assertion that receives its fixture',
        viaSupport,
      );

      const nested = pullRequestRepo(
        tmpRoot,
        'subdirectory',
        { 'pkg/tests/test_t.py': PYTHON_BASE },
        { 'pkg/tests/test_t.py': PYTHON_PR },
        { subdirectory: 'pkg' },
      );
      const nestedEvidence = getDiffEvidence({ base: 'main', projectRoot: nested, files: ['pkg/tests/test_t.py'] });
      const nestedFinding = classifyFinding({ file: 'pkg/tests/test_t.py', line: 8, row: 'C3' }, nestedEvidence);
      assert(
        nestedEvidence.get('pkg/tests/test_t.py').changedRanges.length === 1 && nestedFinding.line === 7,
        'a project root below the repository root still sees its changed lines and reads its source',
        nestedEvidence.get('pkg/tests/test_t.py'),
      );
    });

    section('pull request scope of a report', () => {
      const multi = fs.readFileSync(path.join(fixturesRoot, 'reports', 'findings-multi-severity.md'), 'utf8');
      const spans = findingBlockSpans(multi, registryRowSeverities);
      const parsedMulti = parseReport(multi, { registryRowSeverities });
      assert(
        spans.length === parsedMulti.findings.length && spans.every((span) => multi.split('\n')[span.start].startsWith('### ')),
        'findingBlockSpans returns one span per finding, each starting at its heading',
        spans,
      );
      const drop = parsedMulti.findings.map((finding) => finding.row === 'H1' || finding.row === 'M3');
      const cut = (text, parsed, spansOf, dropped, violations, recommendation, scores) =>
        scopeReportToPullRequest(text, { spans: spansOf, findings: parsed.findings, drop: dropped, violations, recommendation, scores });
      const none = { critical: 0, high: 0, medium: 0, low: 0 };
      const scoped = cut(multi, parsedMulti, spans, drop, { critical: 1, high: 1, medium: 0, low: 1 }, 'Block');
      const reparsed = parseReport(scoped, { registryRowSeverities });
      assert(
        reparsed.findings.map((finding) => finding.row).join(',') === 'C1,H4,L1' &&
          reparsed.violations.high === 1 &&
          reparsed.violations.medium === 0 &&
          !scoped.includes('Hard wait orders two steps') &&
          scoped.includes('Naming notes'),
        'cutting findings leaves a report that parses to the remaining findings and counts, prose blocks untouched',
        { rows: reparsed.findings.map((finding) => finding.row), violations: reparsed.violations },
      );
      assert(
        scoped.includes('High Violations:         -1 × 5 = -5') && scoped.includes('Medium Violations:       -0 × 2 = -0'),
        'the score ledger lines restate the remaining counts',
        scoped,
      );
      assert(
        scoped.split('\n').filter((line) => line.trim() === '---').length ===
          multi.split('\n').filter((line) => line.trim() === '---').length,
        'the rules that close a cut block stay',
      );
      const everyFinding = cut(
        multi,
        parsedMulti,
        spans,
        parsedMulti.findings.map(() => true),
        none,
        'Approve',
      );
      const emptied = parseReport(everyFinding, { registryRowSeverities });
      assert(
        emptied.findings.length === 0 &&
          everyFinding.includes('No critical issues detected in the lines this pull request changed.') &&
          everyFinding.includes('**Recommendation**: Approve'),
        'cutting every finding leaves a report that says so under both finding headings',
        everyFinding,
      );
      assert(
        throwsUnparseable(() => cut(multi, parsedMulti, spans.slice(1), drop.slice(1), none, 'Approve')) &&
          throwsUnparseable(() => cut(multi, parsedMulti, spans, drop.slice(1), none, 'Approve')),
        'blocks and findings that do not line up are refused',
      );

      const twoSameRow = [
        '## Executive Summary',
        '',
        '### Key Weaknesses',
        '',
        '❌ [H3] Assertion sits in a branch',
        '',
        '## Quality Score Breakdown',
        '',
        '## Recommendations (Should Fix)',
        '',
        '### 1. Branch decides the assertion',
        '',
        '**Severity**: P1 (High)',
        '**Location**: `tests/a.py:5`',
        '**Row**: H3',
        '',
        '### 2. Branch decides the second assertion',
        '',
        '**Severity**: P1 (High)',
        '**Location**: `tests/a.py:9`',
        '**Row**: H3',
        '',
      ].join('\n');
      const twoSpans = findingBlockSpans(twoSameRow, registryRowSeverities);
      const twoFindings = [
        { row: 'H3', file: 'tests/a.py', line: 5, title: 'Branch decides the assertion' },
        { row: 'H3', file: 'tests/a.py', line: 9, title: 'Branch decides the second assertion' },
      ];
      const keptWeakness = scopeReportToPullRequest(twoSameRow, {
        spans: twoSpans,
        findings: twoFindings,
        drop: [false, true],
        violations: { critical: 0, high: 1, medium: 0, low: 0 },
        recommendation: 'Request Changes',
      });
      assert(
        keptWeakness.includes('❌ [H3] Assertion sits in a branch'),
        'a Key Weaknesses bullet stays while another finding of its row is kept',
      );
      const droppedWeakness = scopeReportToPullRequest(twoSameRow, {
        spans: twoSpans,
        findings: twoFindings,
        drop: [true, true],
        violations: none,
        recommendation: 'Approve',
      });
      assert(
        !droppedWeakness.includes('Assertion sits in a branch') && !droppedWeakness.includes('### Key Weaknesses'),
        'a Key Weaknesses bullet goes with its last finding, and an emptied heading goes with it',
      );

      const example = fs.readFileSync(path.join(skillRoot, 'resources', 'test-review.example.md'), 'utf8');
      const exampleParsed = parseReport(example, { registryRowSeverities });
      const exampleCut = cut(
        example,
        exampleParsed,
        findingBlockSpans(example, registryRowSeverities),
        exampleParsed.findings.map(() => true),
        none,
        'Approve',
      );
      const exampleReparsed = parseReport(exampleCut, { registryRowSeverities });
      const leftover = exampleCut
        .split('\n')
        .filter(
          (line) =>
            /^\s*(?:[-*+]\s|\d+[.)]\s|\|)/.test(line) &&
            exampleParsed.findings.some(
              (finding) => line.includes(`${finding.file}:${finding.line}`) || line.toLowerCase().includes(finding.title.toLowerCase()),
            ),
        );
      assert(
        exampleReparsed.findings.length === 0 && leftover.length === 0,
        'list items and table rows that name a cut finding go with it, in a report shaped like the template',
        leftover,
      );
      assert(
        !/\|\s*(?:37|58|81)\s*\|\s*P[123]/.test(exampleCut) && !/Re-Review Needed/.test(exampleCut),
        'the appendix rows and the re-review line of a cut finding go with it',
        exampleCut.slice(exampleCut.indexOf('## Next Steps')),
      );

      // The template's own ledger: the cut restates the raw score, the cap and the effective score, and the criteria rows that cite a cut line go.
      const templateCut = cut(
        example,
        exampleParsed,
        findingBlockSpans(example, registryRowSeverities),
        exampleParsed.findings.map(() => true),
        none,
        'Approve',
        {
          raw: 100,
          cap: 100,
          effective: 100,
        },
      );
      const ledger = templateCut.slice(templateCut.indexOf('## Quality Score Breakdown'), templateCut.indexOf('## Critical Issues'));
      assert(
        /^Raw Deduction Score:\s+100\/100$/m.test(ledger) &&
          /^Score Cap:\s+100\/100 \(none\)$/m.test(ledger) &&
          /^Effective Score:\s+100\/100$/m.test(ledger),
        'the fenced ledger of the template restates its raw score, cap and effective score after a cut',
        ledger,
      );
      assert(
        !/❌ FAIL/.test(
          templateCut.slice(templateCut.indexOf('## Quality Criteria Assessment'), templateCut.indexOf('**Total Violations**')),
        ),
        'criteria rows that cite a cut line go with it',
        templateCut.slice(templateCut.indexOf('## Quality Criteria Assessment'), templateCut.indexOf('**Total Violations**')),
      );

      const tableLedger = [
        '## Quality Score Breakdown',
        '',
        '| Starting Score | 100 |',
        '| Critical Violations | -0 × 10 = -0 |',
        '| High deductions (2 x 5) | -10 |',
        '',
        '## Recommendations (Should Fix)',
        '',
      ].join('\n');
      const restated = scopeReportToPullRequest(tableLedger, {
        spans: [],
        findings: [],
        drop: [],
        violations: { critical: 0, high: 1, medium: 0, low: 0 },
        recommendation: 'Request Changes',
      });
      assert(restated.includes('| High deductions (1 x 5) | -5 |'), 'a table-form ledger restates its deductions', restated);

      const crlf = multi.replaceAll('\n', '\r\n');
      const crlfCut = cut(
        crlf,
        parsedMulti,
        findingBlockSpans(crlf, registryRowSeverities),
        drop,
        { critical: 1, high: 1, medium: 0, low: 1 },
        'Block',
      );
      assert(
        crlfCut.split('\n').every((line, index, all) => index === all.length - 1 || line.endsWith('\r')) &&
          parseReport(crlfCut, { registryRowSeverities }).findings.length === 3,
        'a report with CRLF line endings keeps them on every line it writes',
      );

      // A cut block that ends in a rule keeps the rule, a CRLF report stays CRLF through a cut-all and a relocation, and a table ledger restates a changed count.
      const symptomReport = fs.readFileSync(path.join(fixturesRoot, 'reports', 'pr-scope-symptom.md'), 'utf8');
      const symptomSpans = findingBlockSpans(symptomReport, registryRowSeverities);
      const symptomParsed = parseReport(symptomReport, { registryRowSeverities });
      const cutCritical = scopeReportToPullRequest(symptomReport, {
        spans: symptomSpans,
        findings: symptomParsed.findings,
        drop: [true, false],
        violations: { critical: 0, high: 1, medium: 0, low: 0 },
        recommendation: 'Request Changes',
      });
      const rulesBefore = symptomReport.split('\n').filter((line) => line.trim() === '---').length;
      assert(
        cutCritical.split('\n').filter((line) => line.trim() === '---').length === rulesBefore &&
          cutCritical.includes('No critical issues detected in the lines this pull request changed.'),
        'cutting the only Critical finding keeps the rule that closed its block and says the section is empty',
        cutCritical,
      );
      const crlfSymptom = symptomReport.replaceAll('\n', '\r\n');
      const crlfEvery = scopeReportToPullRequest(crlfSymptom, {
        spans: findingBlockSpans(crlfSymptom, registryRowSeverities),
        findings: symptomParsed.findings,
        drop: [true, true],
        violations: none,
        recommendation: 'Approve',
      });
      assert(
        crlfEvery.split('\n').every((line, index, all) => index === all.length - 1 || line.endsWith('\r')) &&
          crlfEvery.includes('No critical issues detected in the lines this pull request changed. ✅\r'),
        'a CRLF report keeps CRLF on the placeholder lines a cut-all writes',
      );
      const crlfMoved = scopeReportToPullRequest(crlfSymptom, {
        spans: findingBlockSpans(crlfSymptom, registryRowSeverities),
        findings: symptomParsed.findings.map((finding, index) =>
          index === 0 ? { ...finding, line: 3, changed_line_evidence: { symptomLine: 4, symptomFile: finding.file } } : finding,
        ),
        drop: [false, false],
        violations: symptomParsed.violations,
        recommendation: 'Block',
      });
      assert(
        crlfMoved.split('\n').every((line, index, all) => index === all.length - 1 || line.endsWith('\r')) &&
          crlfMoved.includes('**Affects**: the unchanged assertion at tests/discount.spec.ts:4\r'),
        'a CRLF report keeps CRLF on the line a relocation adds',
      );
      const ledgerRow = scopeReportToPullRequest(
        ['## Quality Score Breakdown', '', '| High Violations | -2 × 5 = -10 |', '', '## Recommendations (Should Fix)', ''].join('\n'),
        { spans: [], findings: [], drop: [], violations: { critical: 0, high: 1, medium: 0, low: 0 }, recommendation: 'Request Changes' },
      );
      assert(
        ledgerRow.includes('| High Violations | -1 × 5 = -5 |'),
        'a ledger table row of the Violations form restates its count',
        ledgerRow,
      );
      const withRecommendationLine = scopeReportToPullRequest(
        symptomReport.replace('The assertion sits inside an `if`.', '**Recommendation**: Assert unconditionally.'),
        {
          spans: findingBlockSpans(
            symptomReport.replace('The assertion sits inside an `if`.', '**Recommendation**: Assert unconditionally.'),
            registryRowSeverities,
          ),
          findings: symptomParsed.findings,
          drop: [false, false],
          violations: symptomParsed.violations,
          recommendation: 'Block',
        },
      );
      assert(
        withRecommendationLine.includes('**Recommendation**: Assert unconditionally.'),
        "a finding's own Recommendation line is not overwritten by the verdict",
      );

      const h1Index = parsedMulti.findings.findIndex((finding) => finding.row === 'H1');
      const relocatedFindings = parsedMulti.findings.map((finding, index) =>
        index === h1Index ? { ...finding, line: 15, changed_line_evidence: { symptomLine: 16 } } : finding,
      );
      const relocated = scopeReportToPullRequest(multi, {
        spans,
        findings: relocatedFindings,
        drop: relocatedFindings.map(() => false),
        violations: parsedMulti.violations,
        recommendation: 'Block',
      });
      const relocatedFinding = parseReport(relocated, { registryRowSeverities }).findings[h1Index];
      assert(
        relocatedFinding.line === 15 && relocated.includes('**Affects**: the unchanged assertion at tests/checkout.spec.ts:16'),
        'a finding attributed to a changed line is cited there in the report, with the assertion it affects',
        relocated,
      );
    });

    section('resolved model', () => {
      assert(
        resolvedModelFromAnswer('claude', JSON.stringify({ result: 'x', modelUsage: { 'claude-sonnet-5-5': { outputTokens: 10 } } })) ===
          'claude-sonnet-5-5',
        'the model ID comes from the claude answer',
      );
      assert(
        resolvedModelFromAnswer(
          'claude',
          JSON.stringify({ modelUsage: { 'claude-haiku-5-5': { outputTokens: 5 }, 'claude-sonnet-5-5': { outputTokens: 50 } } }),
        ) === 'claude-sonnet-5-5, claude-haiku-5-5',
        'several models are listed, the one with the most output first',
      );
      assert(
        resolvedModelFromAnswer('claude', 'not json') === null &&
          resolvedModelFromAnswer('claude', '{"modelUsage":{}}') === null &&
          resolvedModelFromAnswer('claude', '{"modelUsage":[]}') === null &&
          resolvedModelFromAnswer('claude', 'null') === null &&
          resolvedModelFromAnswer('codex', '{"modelUsage":{"x":{}}}') === null,
        'an answer that names no model keeps the configured one',
      );
      assert(
        agentAnswerText('claude', JSON.stringify({ result: 'I could not write the report', modelUsage: {} })) ===
          'I could not write the report' &&
          agentAnswerText('claude', 'plain text') === 'plain text' &&
          agentAnswerText('codex', '{"result":"x"}') === '{"result":"x"}',
        "the agent's own words are what a missing-report diagnostic shows, and the JSON around them is not",
      );
    });

    section('prompt', () => {
      const common = { skillRoot, files: ['tests/a.spec.ts'], outputPath: path.join(tmpRoot, 'report.md') };
      const prPrompt = buildPrompt({
        ...common,
        reviewMode: 'pr',
        changedLines: { 'tests/a.spec.ts': ['7', '10-14', 'deleted-after:20'] },
      });
      assert(prPrompt.includes('review_mode=pr') && prPrompt.includes('"**Review Mode**: pr"'), 'a pull request prompt states the mode');
      assert(
        JSON.stringify(changedLinesIn(prPrompt)) === JSON.stringify({ 'tests/a.spec.ts': ['7', '10-14', 'deleted-after:20'] }),
        'the changed ranges, deletions included, travel as data between their delimiters',
      );
      assert(
        prPrompt.indexOf('---BEGIN CHANGED LINES---') < prPrompt.indexOf('---BEGIN FILES---\n['),
        'the changed ranges come before the review set',
      );
      const filePrompt = buildPrompt(common);
      assert(
        filePrompt.includes('review_mode=full-file') &&
          !filePrompt.includes('CHANGED LINES') &&
          filePrompt.includes('"**Review Mode**: full-file"'),
        'a full-file prompt states the mode and carries no changed ranges',
      );
    });

    section('CLI', () => {
      const repo = pullRequestRepo(tmpRoot, 'cli', { 'tests/discount.spec.ts': DISCOUNT_BASE }, { 'tests/discount.spec.ts': DISCOUNT_PR });
      const run = (name, extraArgs, env, project = repo) => {
        const outputDir = path.join(tmpRoot, `out-${name}`);
        const result = spawnSync(
          process.execPath,
          [
            cliPath,
            '--skill-root',
            skillRoot,
            '--project-root',
            project,
            '--output',
            path.join(outputDir, 'test-review.md'),
            '--agent-cmd',
            stubAgent,
            '--no-isolate',
            '--env-pass',
            'STUB_FIXTURE',
            '--env-pass',
            'STUB_MODEL_USAGE',
            '--env-pass',
            'STUB_PROMPT_OUT',
            ...extraArgs,
          ],
          { encoding: 'utf8', env: { ...process.env, ...env } },
        );
        let verdict = null;
        try {
          verdict = JSON.parse(result.stdout);
        } catch {
          // asserted below with the raw output
        }
        const reportPath = path.join(outputDir, 'test-review.md');
        return { ...result, verdict, report: fs.existsSync(reportPath) ? fs.readFileSync(reportPath, 'utf8') : '' };
      };

      const promptOut = path.join(tmpRoot, 'agent-prompt.txt');
      const pr = run('pr', ['--base', 'main'], { STUB_FIXTURE: 'pr-scope-symptom.md', STUB_PROMPT_OUT: promptOut });
      const finding = pr.verdict?.findings?.[0];
      assert(
        pr.status === 1 &&
          pr.verdict?.reviewMode === 'pr' &&
          pr.verdict?.recommendation === 'Block' &&
          pr.verdict?.findings?.length === 1 &&
          finding?.row === 'C3' &&
          finding?.line === 3 &&
          finding?.provenance === 'modified' &&
          finding?.verdict_impact === true &&
          finding?.changed_line_evidence?.symptomLine === 4,
        'a setup change that makes an unchanged assertion ineffective gates, located on the changed setup line',
        `status=${pr.status} verdict=${JSON.stringify(pr.verdict)} stderr=${pr.stderr}`,
      );
      assert(
        pr.verdict?.violations?.high === 0 &&
          pr.verdict?.gatingViolations?.high === 0 &&
          !('allFindingsRecommendation' in (pr.verdict ?? {})) &&
          pr.verdict?.findings?.every((entry) => entry.row !== 'H3'),
        'the old-line High finding is in neither the verdict findings nor its counts, and no all-findings recommendation rides along',
        pr.verdict,
      );
      assert(
        /^\*\*Review Mode\*\*: pr$/m.test(pr.report) &&
          !pr.report.includes('**Review Scope**') &&
          (pr.report.match(/\*\*Review (?:Scope|Mode)\*\*/g) ?? []).length === 1 &&
          !pr.report.includes('The second test asserts only when the total is positive') &&
          /^\*\*Total Violations\*\*: 1 Critical, 0 High, 0 Medium, 0 Low$/m.test(pr.report) &&
          pr.report.includes('1 finding on lines this pull request did not change was left out of this report.'),
        'the pull request report names its mode once and carries nothing from the untouched test',
        pr.report,
      );
      assert(
        pr.report.includes('**Location**: `tests/discount.spec.ts:3`') &&
          pr.report.includes('**Affects**: the unchanged assertion at tests/discount.spec.ts:4') &&
          !pr.report.includes('tests/discount.spec.ts:4`'),
        'the report cites the changed line the verdict cites, with the assertion it affects',
        pr.report,
      );
      assert(
        pr.verdict?.model === 'sonnet' && pr.verdict?.reviewProvenance?.modelIdentifier === 'sonnet',
        'an agent that reports no model leaves the configured one in the verdict',
        pr.verdict?.model,
      );

      const prompt = fs.existsSync(promptOut) ? fs.readFileSync(promptOut, 'utf8') : '';
      assert(
        /^review_mode=pr$/m.test(prompt) && JSON.stringify(changedLinesIn(prompt)) === JSON.stringify({ 'tests/discount.spec.ts': ['3'] }),
        'the prompt the agent run receives carries the mode and the changed ranges',
        prompt.slice(0, 300),
      );

      const full = run('full', ['--base', 'main', '--gate-on', 'all'], { STUB_FIXTURE: 'pr-scope-symptom.md' });
      assert(
        full.status === 1 &&
          full.verdict?.reviewMode === 'full-file' &&
          full.verdict?.findings?.length === 2 &&
          full.verdict?.findings?.[0]?.line === 4 &&
          /^\*\*Review Mode\*\*: full-file$/m.test(full.report) &&
          full.report.includes('The second test asserts only when the total is positive') &&
          full.report.includes('**Location**: `tests/discount.spec.ts:4`') &&
          !full.report.includes('PR Delta Gate'),
        'a full-file review keeps every finding at the line the agent gave and names its mode',
        `status=${full.status} verdict=${JSON.stringify(full.verdict)} stderr=${full.stderr}`,
      );

      const files = run('files', ['--files', 'tests/discount.spec.ts'], { STUB_FIXTURE: 'pr-scope-symptom.md' });
      assert(
        files.verdict?.reviewMode === 'full-file' && files.verdict?.findings?.length === 2,
        '--files is a full-file review',
        `status=${files.status} stderr=${files.stderr}`,
      );

      const modelRun = run('model', ['--base', 'main'], {
        STUB_FIXTURE: 'pr-scope-symptom.md',
        STUB_MODEL_USAGE: JSON.stringify({ 'claude-sonnet-5-5': { outputTokens: 900 }, 'claude-haiku-5-5': { outputTokens: 40 } }),
      });
      assert(
        modelRun.verdict?.model === 'claude-sonnet-5-5, claude-haiku-5-5' &&
          modelRun.verdict?.reviewProvenance?.modelIdentifier === 'claude-sonnet-5-5, claude-haiku-5-5' &&
          modelRun.verdict?.reviewProvenance?.sources?.modelIdentifier === 'model ID reported by the agent run',
        'the claude run is asked for the structured answer, and the verdict and its provenance record the model IDs that ran',
        modelRun.verdict?.model,
      );

      const twoLines = pullRequestRepo(
        tmpRoot,
        'cli-range',
        { 'tests/discount.spec.ts': DISCOUNT_BASE },
        {
          'tests/discount.spec.ts': DISCOUNT_BASE.replace('const cart = makeCart();', 'const cart = makeCart(1);').replace(
            'const expected = 18;',
            'const expected = 19;',
          ),
        },
      );
      const rangePromptOut = path.join(tmpRoot, 'range-prompt.txt');
      run('range', ['--base', 'main'], { STUB_FIXTURE: 'pr-scope-symptom.md', STUB_PROMPT_OUT: rangePromptOut }, twoLines);
      const rangePrompt = fs.existsSync(rangePromptOut) ? fs.readFileSync(rangePromptOut, 'utf8') : '';
      assert(
        JSON.stringify(changedLinesIn(rangePrompt)) === JSON.stringify({ 'tests/discount.spec.ts': ['2-3'] }),
        'adjacent changed lines reach the prompt as one range',
        changedLinesIn(rangePrompt),
      );

      // The attributed finding alone: nothing is cut, yet the report still has to cite the changed line and carry one mode line.
      const attributed = run('attributed', ['--base', 'main'], { STUB_FIXTURE: 'pr-scope-attributed-only.md' });
      assert(
        attributed.status === 1 &&
          attributed.verdict?.findings?.length === 1 &&
          attributed.verdict.findings[0].line === 3 &&
          attributed.verdict.findings[0].changed_line_evidence?.symptomLine === 4 &&
          attributed.report.includes('**Location**: `tests/discount.spec.ts:3`') &&
          attributed.report.includes('**Affects**: the unchanged assertion at tests/discount.spec.ts:4'),
        'an attributed finding is cited on the changed line in the report even when no finding is cut',
        attributed.report,
      );
      assert(
        (attributed.report.match(/\*\*Review (?:Scope|Mode)\*\*/g) ?? []).length === 1 &&
          /^\*\*Review Mode\*\*: pr$/m.test(attributed.report),
        'a report that carries both a Review Scope and a Review Mode line is left with one, restated',
        attributed.report,
      );
      assert(
        /^\*\*Overall Assessment\*\*: Critical Issues$/m.test(attributed.report) &&
          (attributed.report.match(/^\*\*Recommendation\*\*: Block$/gm) ?? []).length === 2 &&
          attributed.report.includes('**Recommendation**: Compare against the literal 18 again.'),
        "the Overall Assessment and the two verdict Recommendation lines are restated, and a finding's own advice is left alone",
        attributed.report,
      );
      assert(
        attributed.report.includes('// ### not a heading, a line of quoted code') && /^---$/m.test(attributed.report),
        'a heading-looking line inside a code fence and the rule that closes a block both survive',
        attributed.report,
      );

      const range = run('range', ['--base', 'main'], { STUB_FIXTURE: 'pr-scope-range.md' });
      assert(
        range.status === 1 &&
          range.verdict?.findings?.length === 1 &&
          range.verdict.findings[0].line === 2 &&
          range.verdict.findings[0].provenance === 'modified',
        'a Location range that covers a changed line reaches the classifier and stays PR-owned',
        `status=${range.status} verdict=${JSON.stringify(range.verdict?.findings)} stderr=${range.stderr}`,
      );

      const loneCr = path.join(tmpRoot, 'lone-cr.md');
      const symptomReport = fs.readFileSync(path.join(fixturesRoot, 'reports', 'pr-scope-symptom.md'), 'utf8');
      fs.writeFileSync(
        loneCr,
        symptomReport
          .replace(
            '**Row**: H3',
            '**Row**: H3\r### 2. A second block only a lone carriage return reveals\r**Severity**: P1 (High)\r**Location**: `tests/discount.spec.ts:9`\r**Row**: H3',
          )
          .replace('1 Critical, 1 High', '1 Critical, 2 High'),
      );
      const misaligned = run('lone-cr', ['--base', 'main'], { STUB_FIXTURE: loneCr });
      assert(
        misaligned.status === 3 && /finding blocks and the \d+ findings the parser read disagree/.test(misaligned.stderr),
        'finding blocks that do not line up with the parsed findings fail the review instead of cutting the wrong one',
        `status=${misaligned.status} stderr=${misaligned.stderr}`,
      );

      const constantRepo = pullRequestRepo(
        tmpRoot,
        'cli-constant',
        {
          'tests/constant.spec.ts': lines(
            'const EXPECTED = 18;',
            '',
            "test('a', () => {",
            '  expect(applyDiscount(20)).toBe(EXPECTED);',
            '});',
            '',
            "test('b', () => {",
            '  expect(applyDiscount(30)).toBe(EXPECTED);',
            '});',
          ),
        },
        {
          'tests/constant.spec.ts': lines(
            'const EXPECTED = applyDiscount(20);',
            '',
            "test('a', () => {",
            '  expect(applyDiscount(20)).toBe(EXPECTED);',
            '});',
            '',
            "test('b', () => {",
            '  expect(applyDiscount(30)).toBe(EXPECTED);',
            '});',
          ),
        },
      );
      const twoSymptoms = run('two-symptoms', ['--base', 'main'], { STUB_FIXTURE: 'pr-scope-two-symptoms.md' }, constantRepo);
      assert(
        twoSymptoms.verdict?.findings?.map((entry) => `${entry.line}<-${entry.changed_line_evidence?.symptomLine}`).join(',') ===
          '1<-4,1<-8' &&
          twoSymptoms.report.includes('at tests/constant.spec.ts:4') &&
          twoSymptoms.report.includes('at tests/constant.spec.ts:8'),
        'two assertions caused by one changed constant each keep their own symptom line, in the verdict and the report',
        `${JSON.stringify(twoSymptoms.verdict?.findings?.map((entry) => entry.changed_line_evidence))} ${twoSymptoms.report}`,
      );

      const supportRepo = pullRequestRepo(
        tmpRoot,
        'cli-support',
        {
          'tests/conftest.py': lines('import pytest', '', '', '@pytest.fixture', 'def expected_total():', '    return 18.0'),
          'tests/test_cart.py': lines(
            'def test_total(expected_total):',
            '    assert checkout(make_cart()) == expected_total',
            '',
            '',
            'def test_other():',
            '    assert True',
          ),
        },
        {
          'tests/conftest.py': lines(
            'import pytest',
            '',
            '',
            '@pytest.fixture',
            'def expected_total():',
            '    return checkout(make_cart())',
          ),
          'tests/test_cart.py': lines(
            'def test_total(expected_total):',
            '    assert checkout(make_cart()) == expected_total',
            '',
            '',
            'def test_other():',
            '    assert 1 == 1',
          ),
        },
      );
      const support = run('support', ['--base', 'main'], { STUB_FIXTURE: 'pr-scope-conftest.md' }, supportRepo);
      assert(
        support.status === 1 &&
          support.verdict?.findings?.length === 1 &&
          support.verdict.findings[0].file === 'tests/conftest.py' &&
          support.verdict.findings[0].line === 6 &&
          support.verdict.findings[0].changed_line_evidence?.symptomFile === 'tests/test_cart.py' &&
          support.report.includes('**Location**: `tests/conftest.py:6`') &&
          support.report.includes('**Affects**: the unchanged assertion at tests/test_cart.py:2'),
        'a fixture changed in a conftest that is in the review set gates, cited in the conftest',
        `status=${support.status} findings=${JSON.stringify(support.verdict?.findings)} stderr=${support.stderr}`,
      );

      const deletionRepo = pullRequestRepo(
        tmpRoot,
        'cli-deletion',
        { 'tests/discount.spec.ts': DISCOUNT_BASE },
        { 'tests/discount.spec.ts': DISCOUNT_BASE.replace("  expect(applyDiscount(cart, 'SAVE10')).toBe(expected);\n", '') },
      );
      const deletionPromptOut = path.join(tmpRoot, 'deletion-prompt.txt');
      run('deletion', ['--base', 'main'], { STUB_FIXTURE: 'pr-scope-symptom.md', STUB_PROMPT_OUT: deletionPromptOut }, deletionRepo);
      const deletionPrompt = fs.existsSync(deletionPromptOut) ? fs.readFileSync(deletionPromptOut, 'utf8') : '';
      assert(
        JSON.stringify(changedLinesIn(deletionPrompt)) === JSON.stringify({ 'tests/discount.spec.ts': ['deleted-after:3'] }),
        'a removed assertion reaches the prompt as a deleted-after marker',
        changedLinesIn(deletionPrompt),
      );
    });
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

if (process.env.TEA_PR_SCOPE_PROBE === '1') {
  // The hook-environment probe runs only the git helpers, to prove they stay in their own repositories.
  const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-pr-scope-probe-'));
  try {
    pullRequestRepo(probeRoot, 'probe', { 'a.txt': 'a\n' }, { 'a.txt': 'b\n' });
  } finally {
    fs.rmSync(probeRoot, { recursive: true, force: true });
  }
} else {
  main();
}
