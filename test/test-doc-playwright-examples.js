/**
 * The Playwright examples on the docs pages follow two conventions a reader would otherwise copy wrong.
 *
 * Network first: every TypeScript or JavaScript block on any docs page registers `page.waitForResponse` or
 * `page.waitForRequest` before the action that triggers the call. A block that awaits the action and only then awaits the
 * waiter misses a response that returns at once. A block labelled as the bad example (`❌` or `Bad` before it) is exempt.
 *
 * One fixture entry point: a Playwright Utils spec on the workflow pages imports `test` from the project's one shared
 * fixture module.
 *
 * The `playwright-utils-mandate` knowledge fragment allows exactly one fixture entry point, `{test_dir}/support/merged-fixtures.ts`.
 * A page that shows a spec composing its own fixtures teaches a second entry point, which is the outcome the mandate exists to prevent.
 * Every `typescript` or `ts` block on these pages that is a Playwright Utils spec (it imports the package, uses one of its fixtures,
 * or the paragraph before it says "With Playwright Utils") and declares a test has to:
 *
 * - import `test` from a `support/merged-fixtures` path;
 * - leave composition to the module: no `mergeTests(` and no `.extend(` in the spec;
 * - not import `test` from `@playwright/test` or from a playwright-utils `/fixtures` subpath;
 * - carry the `skipNetworkMonitoring` annotation when it stubs a 4xx or 5xx status, since the module merges
 *   `network-error-monitor` and an expected error response would otherwise fail the test in teardown.
 *
 * A block whose first line names a file under `support/` (`// tests/support/merged-fixtures.ts`, `// tests/support/auth-fixture.ts`)
 * is the module or a fixture it merges, so composition belongs there and the gate leaves it alone.
 * Each rule has revert cases below: a block that breaks it fails here.
 *
 * Usage: node test/test-doc-playwright-examples.js
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { closesFence } = require('./lib/docs-pages');

const DOCS_ROOT = path.join(__dirname, '..', 'docs');

/** The pages whose Playwright Utils examples follow the shared-module convention. */
const PAGES = [
  'how-to/brownfield/use-tea-for-enterprise.md',
  'how-to/brownfield/use-tea-with-existing-tests.md',
  'how-to/customization/integrate-playwright-utils.md',
  'how-to/workflows/run-automate.md',
  'how-to/workflows/run-test-review.md',
  'how-to/workflows/run-trace.md',
];

const TS_LANGUAGES = new Set(['typescript', 'ts']);
const SCRIPT_LANGUAGES = new Set(['typescript', 'ts', 'javascript', 'js']);
const TRIGGER = /\bawait\s+[\w.]+\.(click|fill|press|goto|check|selectOption|submit)\(/;
const LATE_WAITER = /\bawait\s+page\.waitFor(Response|Request)\(/;

/** Every Markdown page under docs/, relative to it. */
function allPages() {
  return fs
    .readdirSync(DOCS_ROOT, { recursive: true })
    .filter((name) => name.endsWith('.md'))
    .sort();
}
const UTILS_FIXTURES = /\{[^}]*\b(apiRequest|interceptNetworkCall|recurse|networkRecorder)\b[^}]*\}/;

/** Every fenced block of a page: its language, its body, its first line number and the paragraph before it. */
function fencedBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const open = lines[index].match(/^(\s*)(`{3,}|~{3,})\s*([\w-]*)/);
    if (!open) continue;
    const fence = open[2];
    let end = index + 1;
    while (end < lines.length && !closesFence(lines[end], fence, open[1])) end += 1;
    let before = index - 1;
    while (before >= 0 && lines[before].trim() === '') before -= 1;
    blocks.push({
      language: open[3].toLowerCase(),
      body: lines.slice(index + 1, end).join('\n'),
      line: index + 1,
      label: before >= 0 ? lines[before].trim() : '',
    });
    index = end;
  }
  return blocks;
}

/** What is wrong with one TypeScript block, as messages; an empty list passes. */
function problemsOf(block) {
  const firstLine = block.body.split('\n').find((line) => line.trim() !== '') || '';
  if (/^\s*\/\/\s*\S*\/support\/\S+\.ts\b/.test(firstLine)) return [];
  const usesUtils =
    /@seontechnologies\/playwright-utils/.test(block.body) || UTILS_FIXTURES.test(block.body) || /with playwright utils/i.test(block.label);
  const declaresTest = /\btest(\.skip|\.only|\.describe)?\(/.test(block.body);
  if (!usesUtils || !declaresTest) return [];
  const problems = [];
  if (!/import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*['"][./]*\S*support\/merged-fixtures['"]/.test(block.body))
    problems.push("the spec does not import `test` from '../support/merged-fixtures'");
  if (/\bmergeTests\(|\.extend\s*[<(]/.test(block.body)) problems.push('the spec composes fixtures itself');
  if (
    /import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*['"](@playwright\/test|@seontechnologies\/playwright-utils\/[\w-]+\/fixtures)['"]/.test(
      block.body,
    )
  )
    problems.push('the spec imports `test` from a second entry point');
  if (/\bstatus:\s*[45]\d\d\b/.test(block.body) && !/skipNetworkMonitoring/.test(block.body))
    problems.push("the spec stubs an error status without the 'skipNetworkMonitoring' annotation the merged network-error-monitor needs");
  return problems;
}

/** A network waiter awaited after the action that triggers it, as messages; an empty list passes. */
function listenerProblems(block) {
  if (/❌|\bbad\b/i.test(block.label)) return [];
  let triggered = false;
  const problems = [];
  for (const line of block.body.split('\n')) {
    if (TRIGGER.test(line)) triggered = true;
    else if (triggered && LATE_WAITER.test(line)) problems.push('the block awaits a network waiter after the action that triggers it');
  }
  return problems;
}

/** Every network-first problem on one page's text, each naming the page and the block's line. */
function listenerPageProblems(page, text) {
  return fencedBlocks(text)
    .filter((block) => SCRIPT_LANGUAGES.has(block.language))
    .flatMap((block) => listenerProblems(block).map((problem) => `${page}:${block.line}: ${problem}`));
}

/** Every problem on one page's text, each naming the page and the block's line. */
function pageProblems(page, text) {
  return fencedBlocks(text)
    .filter((block) => TS_LANGUAGES.has(block.language))
    .flatMap((block) => problemsOf(block).map((problem) => `${page}:${block.line}: ${problem}`));
}

function checkListeners() {
  const pages = allPages();
  const problems = pages.flatMap((page) => listenerPageProblems(page, fs.readFileSync(path.join(DOCS_ROOT, page), 'utf8')));
  assert.deepEqual(problems, [], `network waiters registered after their trigger:\n${problems.join('\n')}`);
  const fenced = (body, label = 'Fix:') => `${label}\n\n\`\`\`typescript\n${body}\n\`\`\`\n`;
  const late =
    "await page.click('button[type=\"submit\"]');\nawait page.waitForResponse((resp) => resp.url().includes('/api/checkout') && resp.ok());";
  assert.notDeepEqual(listenerPageProblems('fixture.md', fenced(late)), [], 'the gate passes a waiter awaited after its click');
  assert.deepEqual(listenerPageProblems('fixture.md', fenced(late, '**❌ Bad:**')), [], 'the gate refuses a labelled bad example');
  const early =
    "const checkoutResponse = page.waitForResponse((response) => response.url().includes('/api/checkout') && response.ok());\nawait page.click('button[type=\"submit\"]');\nawait checkoutResponse;";
  assert.deepEqual(listenerPageProblems('fixture.md', fenced(early)), [], 'the gate refuses a waiter registered before its click');
  return pages.length;
}

function checkPages() {
  const problems = PAGES.flatMap((page) => pageProblems(page, fs.readFileSync(path.join(DOCS_ROOT, page), 'utf8')));
  assert.deepEqual(problems, [], `Playwright Utils specs that break the shared-module rules:\n${problems.join('\n')}`);
  const specs = PAGES.flatMap((page) => fencedBlocks(fs.readFileSync(path.join(DOCS_ROOT, page), 'utf8'))).filter(
    (block) => TS_LANGUAGES.has(block.language) && /support\/merged-fixtures['"]/.test(block.body),
  );
  assert.ok(specs.length >= 15, `the pages hold only ${specs.length} merged-fixtures specs; the scan misses them`);
  return specs.length;
}

/** Revert cases: each block breaks one rule and has to fail; the passing cases must pass. */
function checkRules() {
  const fenced = (body, label = 'Example:') => `${label}\n\n\`\`\`typescript\n${body}\n\`\`\`\n`;
  const failing = [
    [
      'a spec merging fixtures inline',
      fenced(
        "import { expect, mergeTests } from '@playwright/test';\nimport { test as apiRequestFixture } from '@seontechnologies/playwright-utils/api-request/fixtures';\n\nconst test = mergeTests(apiRequestFixture);\n\ntest('api test', async ({ apiRequest }) => {});",
      ),
    ],
    [
      'a spec importing a utility fixture directly',
      fenced(
        "import { test } from '@seontechnologies/playwright-utils/api-request/fixtures';\n\ntest('should fetch profile', async ({ apiRequest }) => {});",
      ),
    ],
    [
      'a spec extending the auth fixture',
      fenced(
        "import { test as base, expect } from '@playwright/test';\nimport { createAuthFixtures } from '@seontechnologies/playwright-utils/auth-session';\n\nconst test = base.extend(createAuthFixtures());\n\ntest('x', async ({ page }) => {});",
      ),
    ],
    [
      'a labelled spec importing a project module other than merged-fixtures',
      fenced(
        "import { test } from '../support/fixtures';\n\ntest('should edit bio field', async ({ page, authToken }) => {});",
        '**With Playwright Utils:**',
      ),
    ],
    [
      'a spec importing merged fixtures and @playwright/test test',
      fenced(
        "import { expect } from '../support/merged-fixtures';\nimport { test } from '@playwright/test';\n\ntest('x', async ({ apiRequest }) => {});",
      ),
    ],
    [
      'a spec stubbing a 500 under the merged network-error-monitor',
      fenced(
        "import { test, expect } from '../support/merged-fixtures';\n\ntest('x', async ({ page, interceptNetworkCall }) => {\n  interceptNetworkCall({ url: '**/api/profile', fulfillResponse: { status: 500 } });\n});",
      ),
    ],
  ];
  for (const [name, text] of failing) assert.notDeepEqual(pageProblems('fixture.md', text), [], `the gate passes ${name}`);
  const passing = [
    [
      'a spec importing the module',
      fenced("import { test, expect } from '../support/merged-fixtures';\n\ntest('x', async ({ apiRequest }) => {});"),
    ],
    [
      'the module itself',
      fenced(
        "// tests/support/merged-fixtures.ts\nimport { mergeTests } from '@playwright/test';\nimport { test as apiRequestFixture } from '@seontechnologies/playwright-utils/api-request/fixtures';\n\nexport const test = mergeTests(apiRequestFixture);",
      ),
    ],
    [
      'a fixture file the module merges',
      fenced(
        "// tests/support/auth-fixture.ts\nimport { test as base } from '@playwright/test';\nimport { createAuthFixtures } from '@seontechnologies/playwright-utils/auth-session';\n\nexport const test = base.extend(createAuthFixtures());",
      ),
    ],
    [
      'a vanilla Playwright spec',
      fenced("import { test, expect } from '@playwright/test';\n\ntest('x', async ({ request }) => {});", '**Vanilla Playwright:**'),
    ],
    [
      'a utility function import beside the module',
      fenced(
        "import { test, expect } from '../support/merged-fixtures';\nimport { readCSV } from '@seontechnologies/playwright-utils/file-utils';\n\ntest('x', async ({ page }) => {});",
      ),
    ],
    [
      'an error stub that opts out of network monitoring',
      fenced(
        "import { test, expect } from '../support/merged-fixtures';\n\ntest('x', { annotation: [{ type: 'skipNetworkMonitoring' }] }, async ({ page, interceptNetworkCall }) => {\n  interceptNetworkCall({ url: '**/api/profile', fulfillResponse: { status: 500 } });\n});",
      ),
    ],
  ];
  for (const [name, text] of passing) assert.deepEqual(pageProblems('fixture.md', text), [], `the gate refuses ${name}`);
  return failing.length + passing.length;
}

/** A marker line with an info string inside a block is content: the block runs to the bare closing fence. */
function checkFenceClosing() {
  const [block, ...rest] = fencedBlocks('```markdown\n```bash\nnpm test\n```\n');
  assert.equal(block?.body, '```bash\nnpm test', 'a marker line with an info string closed the block');
  assert.equal(rest.length, 0, 'the scanner opened a second block at the bare closing fence');
}

try {
  checkFenceClosing();
  const rules = checkRules();
  const specs = checkPages();
  const scanned = checkListeners();
  console.log(
    `Doc Playwright examples: ${specs} Playwright Utils specs on ${PAGES.length} pages import the shared module; ${rules} rule cases hold; no network waiter follows its trigger across ${scanned} pages.`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
