/**
 * Release notes sizing: tools/release-notes.js fits a stable release's notes into a GitHub Release body.
 *
 * Verifies:
 * - notes at or under the budget come out byte for byte
 * - notes over GitHub's 125,000 character limit come out under it, with the pointer line first, the truncation line last, and the
 *   cut on a top-level bullet boundary so no entry (including its indented continuation lines) is split
 * - the link anchors the version heading the way GitHub slugs it
 * - notes with no bullets still fit
 * - the CLI reads stdin and writes stdout
 *
 * Usage: node test/test-release-notes.js
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { BODY_BUDGET, fitReleaseNotes, headingAnchor } = require('../tools/release-notes.js');

const GITHUB_LIMIT = 125_000;
const base = { version: '2.0.0', tag: 'v2.0.0', repo: 'owner/repo', heading: '## [2.0.0] - 2026-10-09' };
const link = 'https://github.com/owner/repo/blob/v2.0.0/CHANGELOG.md#200---2026-10-09';
const pointer = `These notes are longer than a GitHub Release allows, so this page shows the first part. The full notes for 2.0.0 are in [CHANGELOG.md](${link}).\n\n`;
const closing = `\n\n_Truncated here. Continue in [CHANGELOG.md](${link})._`;

// A bullet with an indented continuation line, as the CHANGELOG writes them.
const entry = (index) => `- Entry ${index} ${'word '.repeat(30)}\n  continuation of entry ${index} with \`code\` and a - dash`;
const section = (count) => `\n### Added\n\n${Array.from({ length: count }, (_, index) => entry(index)).join('\n')}`;

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('notes at the budget pass through byte for byte', () => {
  const notes = `\n${'x'.repeat(BODY_BUDGET - 1)}`;
  assert.equal(notes.length, BODY_BUDGET);
  assert.equal(fitReleaseNotes({ notes, ...base }), notes);
});

test('short notes with non-ASCII text pass through byte for byte', () => {
  const notes = '\n### Fixed\n\n- Reads `naïve` input and 日本語 and emoji ✅\n';
  assert.equal(fitReleaseNotes({ notes, ...base }), notes);
});

test('notes one character over the budget are cut', () => {
  const bullets = Array.from({ length: 3000 }, (_, index) => `- e${index} ${'y'.repeat(20)}`);
  let notes = `\n${bullets.join('\n')}`;
  notes += 'z'.repeat(BODY_BUDGET + 1 - notes.length);
  assert.equal(notes.length, BODY_BUDGET + 1);
  const fitted = fitReleaseNotes({ notes, ...base });
  assert.ok(fitted.length <= BODY_BUDGET);
  assert.ok(fitted.startsWith(pointer));
});

test('notes over the GitHub limit come out under it, cut at a bullet', () => {
  const notes = section(3000);
  assert.ok(notes.length > GITHUB_LIMIT);
  const fitted = fitReleaseNotes({ notes, ...base });
  assert.ok(fitted.length <= BODY_BUDGET, `${fitted.length} characters`);
  assert.ok(fitted.length < GITHUB_LIMIT);
  assert.ok(fitted.startsWith(pointer), 'starts with the pointer line');
  assert.ok(fitted.endsWith(closing), 'ends with the truncation line');
  const kept = fitted.slice(pointer.length, fitted.length - closing.length);
  assert.ok(!kept.startsWith('\n'), 'no blank line doubles the one after the pointer');
  assert.ok(notes.trimStart().startsWith(kept), 'the kept text is a prefix of the notes');
  assert.ok(notes.trimStart().slice(kept.length).startsWith('\n- '), 'the next character after the cut starts a top-level bullet');
  assert.ok(kept.endsWith('and a - dash'), 'the last kept entry keeps its continuation line');
  assert.ok(BODY_BUDGET - fitted.length < 1000, 'the cut keeps as many entries as fit');
});

test('a first line of the output is the pointer, followed by a blank line', () => {
  const fitted = fitReleaseNotes({ notes: section(3000), ...base });
  const [first, second] = fitted.split('\n');
  assert.equal(first, pointer.split('\n')[0]);
  assert.equal(second, '');
});

test('the anchor follows GitHub slugs of the version heading', () => {
  assert.equal(headingAnchor('## [2.0.0] - 2026-10-09'), '200---2026-10-09');
  assert.equal(headingAnchor('## [Unreleased]'), 'unreleased');
  assert.equal(headingAnchor('##[v1.2.3-rc.1] - 2026-01-02'), 'v123-rc1---2026-01-02');
  assert.equal(headingAnchor('## 2.0.0 (2026-10-09)'), '200-2026-10-09');
});

test('notes with no bullets are cut at a line break', () => {
  const notes = Array.from({ length: 5000 }, (_, index) => `Paragraph ${index} ${'p'.repeat(40)}`).join('\n');
  const fitted = fitReleaseNotes({ notes, ...base });
  assert.ok(fitted.length <= BODY_BUDGET);
  const kept = fitted.slice(pointer.length, fitted.length - closing.length);
  assert.ok(notes.slice(kept.length).startsWith('\n'));
});

test('one unbroken line is hard cut under the budget', () => {
  const fitted = fitReleaseNotes({ notes: 'q'.repeat(300_000), ...base });
  assert.ok(fitted.length <= BODY_BUDGET);
  assert.ok(fitted.startsWith(pointer) && fitted.endsWith(closing));
});

test('the CLI reads notes on stdin and writes the result on stdout', () => {
  const run = (notes) =>
    spawnSync(
      process.execPath,
      [
        path.join(__dirname, '..', 'tools', 'release-notes.js'),
        '--version',
        base.version,
        '--tag',
        base.tag,
        '--repo',
        base.repo,
        '--heading',
        base.heading,
      ],
      { input: notes, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
  const small = run('\n### Fixed\n\n- one\n');
  assert.equal(small.status, 0);
  assert.equal(small.stdout, '\n### Fixed\n\n- one\n');
  const notes = section(3000);
  const big = run(notes);
  assert.equal(big.status, 0);
  assert.equal(big.stdout, fitReleaseNotes({ notes, ...base }));
  const bad = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'release-notes.js')], { input: '', encoding: 'utf8' });
  assert.equal(bad.status, 2);
});

let failed = 0;
for (const { name, run } of tests) {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${name}\n${error.message}`);
  }
}
if (failed > 0) {
  console.error(`\n${failed} of ${tests.length} release notes tests failed.`);
  process.exit(1);
}
console.log(`\n${tests.length} release notes tests passed.`);
