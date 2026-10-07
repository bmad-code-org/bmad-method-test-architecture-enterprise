/**
 * The llms-full.txt bundle keeps its headroom.
 *
 * `tools/build-docs.js` fails the docs build when llms-full.txt passes `LLM_MAX_CHARS`, and AI agents that consume
 * the bundle break past that size. A bundle that sits a few thousand characters under the cap passes that build
 * and fails the next pull request that adds a page, so the failure lands on whoever happened to add the page.
 * This test fails one step earlier: the bundle the build would write has to stay `LLM_MIN_HEADROOM_CHARS` under the cap.
 *
 * When it fails, move bulky lookup material out of the bundle with an entry in `LLM_EXCLUDE_PATTERNS`
 * and link the page from llms.txt. Do not raise the cap.
 *
 * The check runs against the real `docs/` tree, and against a copy of it with one bulky page added, which must fail,
 * so the check cannot pass by measuring the wrong thing.
 *
 * Usage: node test/test-llms-headroom.js
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { LLM_MAX_CHARS, LLM_MIN_HEADROOM_CHARS, buildLlmsFullText } = require('../tools/build-docs');

const DOCS_ROOT = path.join(__dirname, '..', 'docs');

/** The characters left under the cap, or the reason the bundle has too few. */
function headroomProblem(text) {
  const headroom = LLM_MAX_CHARS - text.length;
  if (headroom >= LLM_MIN_HEADROOM_CHARS) return null;
  return `llms-full.txt is ${text.length.toLocaleString()} of ${LLM_MAX_CHARS.toLocaleString()} characters: ${headroom.toLocaleString()} left, and at least ${LLM_MIN_HEADROOM_CHARS.toLocaleString()} must stay free`;
}

/** The pages in the bundle, largest first, so a failure names where the budget went. */
function largestPages(text, count = 5) {
  const sizes = [...text.matchAll(/<document path="([^"]+)">\n([\s\S]*?)\n<\/document>/g)].map((match) => ({
    page: match[1],
    chars: match[2].length,
  }));
  return sizes
    .sort((a, b) => b.chars - a.chars)
    .slice(0, count)
    .map(({ page, chars }) => `${page} (${chars.toLocaleString()})`)
    .join(', ');
}

function main() {
  assert.ok(LLM_MIN_HEADROOM_CHARS >= 50_000, 'the required headroom is at least 50,000 characters');

  const { text, deadPatterns, fileCount } = buildLlmsFullText(DOCS_ROOT);
  assert.deepEqual(deadPatterns, [], `exclusion patterns match no page: ${deadPatterns.join(', ')}`);
  assert.ok(fileCount > 0, 'the bundle carries pages');

  const problem = headroomProblem(text);
  assert.equal(problem, null, `${problem}. Largest pages: ${largestPages(text)}`);
  console.log(
    `llms-full.txt: ${text.length.toLocaleString()} of ${LLM_MAX_CHARS.toLocaleString()} characters, ${(LLM_MAX_CHARS - text.length).toLocaleString()} free`,
  );

  // Revert case: one bulky page added to a copy of docs/ takes the headroom, and the check says so.
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'llms-headroom-'));
  try {
    fs.cpSync(DOCS_ROOT, copy, { recursive: true });
    const filler = `${'A bulky page keeps its words in the bundle. '.repeat(25)}\n`.repeat(Math.ceil(LLM_MAX_CHARS / 1100));
    fs.writeFileSync(path.join(copy, 'reference', 'bulky-new-page.md'), `---\ntitle: Bulky\n---\n\n# Bulky\n\n${filler}`);
    const grown = buildLlmsFullText(copy);
    assert.match(headroomProblem(grown.text) ?? '', /must stay free/, 'a bulky new page must fail the headroom check');
    assert.ok(largestPages(grown.text, 1).startsWith('reference/bulky-new-page.md'), 'the failure names the bulky page first');
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
  }

  // The edge: exactly the required headroom passes, one character fewer fails.
  assert.equal(headroomProblem('x'.repeat(LLM_MAX_CHARS - LLM_MIN_HEADROOM_CHARS)), null);
  assert.notEqual(headroomProblem('x'.repeat(LLM_MAX_CHARS - LLM_MIN_HEADROOM_CHARS + 1)), null);

  console.log('test-llms-headroom: ok');
}

main();
