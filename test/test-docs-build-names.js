/**
 * No page under `docs/` names how TEA was built.
 *
 * `docs/` is for people who use TEA. A reader who wants to evaluate an AI
 * feature has not followed the build, so a story number, a decision id, a
 * pull request number, a planning path or a word from the review process
 * means nothing to them and dates the page the day it ships.
 *
 * `BUILD_NAME_PATTERNS` is the one list of what counts. Every entry carries an
 * `example` that must fail when added to a copy of a page, and a copy of every
 * real page is scanned too, so the check cannot pass by reading nothing.
 *
 * The patterns name the build's own forms. TEA's user documentation uses the
 * words epic, story, sprint and relay for what they mean to a team that runs
 * the BMad Method (epic-level test design, a story's acceptance tests, the
 * `sprint-status.yaml` file) and for a component of Evaluate (the relay a
 * sealed-brief agent talks to), so the bare words are not scanned. Their
 * build forms are: a dotted story id, an `AD-` decision id, a requirement id such as `NFR9` or `CAP-11`, a line of the
 * epic narrative, the build's planning folders, a pull request number and
 * the review rounds. The word lane has no user meaning, so it is scanned bare.
 *
 * Usage: node test/test-docs-build-names.js
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DOCS_ROOT = path.join(__dirname, '..', 'docs');

const BUILD_NAME_PATTERNS = [
  { name: 'story id', pattern: /\bStor(?:y|ies) \d+\.\d+/i, example: 'Evaluate authored its own suite in Story 1.42.' },
  { name: 'requirement id', pattern: /\b(?:CAP|N?FR)-?\d+\b/, example: 'The run happens under NFR9 isolation, as CAP-11 requires.' },
  { name: 'decision id', pattern: /\bAD-\d+/, example: 'The adapter follows AD-10.' },
  {
    name: 'epic narrative',
    pattern: /\bEpic \d+ (?:closed|shipped|delivered|landed|added|introduced)\b/,
    example: 'Epic 6 closed this gap.',
  },
  { name: 'epics file', pattern: /\bepics\.md\b/, example: 'The plan lives in epics.md.' },
  { name: 'sprint tracking', pattern: /\bparallel_lanes\b|\bsprint row\b/i, example: 'Flip the sprint row to done.' },
  { name: 'lane', pattern: /\blanes?\b/i, example: 'Lane 3 owns the documentation.' },
  {
    name: 'relay',
    pattern: /\b(?:evaluate|build) relay\b|\brelay (?:run|coordinator|worker|protocol|lane)s?\b/i,
    example: 'The relay coordinator opens the page.',
  },
  {
    name: 'planning path',
    pattern: /_bmad-output\/(?:implementation|planning)-artifacts\/evaluate\b/,
    example: 'See _bmad-output/implementation-artifacts/evaluate/sprint-status.yaml.',
  },
  { name: 'pull request number', pattern: /\bpull request #\d+|\bPR #?\d+/i, example: 'Shipped in PR #367.' },
  {
    name: 'review process',
    pattern: /\breview rounds?\b|\bOpus review|\breview lens(?:es)?\b|\bowner[- ]review(?:ed)?\b|\badversarial review\b/i,
    example: 'The owner reviewed it in a second review round.',
  },
];

/** The relative paths of every Markdown page under `root`, sorted. */
function pagesUnder(root) {
  const found = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.name.endsWith('.md')) found.push(path.relative(root, full));
    }
  };
  visit(root);
  return found.sort();
}

/** One problem line per build name in one page's text: `page:line: <pattern name>: <the match>`. */
function buildNameProblems(page, text, patterns = BUILD_NAME_PATTERNS) {
  const problems = [];
  for (const [index, line] of text.split('\n').entries()) {
    for (const { name, pattern } of patterns) {
      const match = pattern.exec(line);
      if (match) problems.push(`${page}:${index + 1}: ${name}: ${JSON.stringify(match[0])}`);
    }
  }
  return problems;
}

function scanDocs(root = DOCS_ROOT) {
  const pages = pagesUnder(root);
  const problems = pages.flatMap((page) => buildNameProblems(page, fs.readFileSync(path.join(root, page), 'utf8')));
  return { pages, problems };
}

/** The revert cases: each pattern fires on its own example appended to a copy of a real page. */
function revertCaseProblems(pages, root = DOCS_ROOT) {
  const failures = [];
  const page = pages.find((candidate) => candidate === path.join('explanation', 'tea-overview.md')) ?? pages[0];
  const clean = fs.readFileSync(path.join(root, page), 'utf8');
  for (const { name, example } of BUILD_NAME_PATTERNS) {
    const mutated = `${clean}\n${example}\n`;
    const caught = buildNameProblems(page, mutated)
      .filter((problem) => problem.includes(`: ${name}: `))
      .filter((problem) => !buildNameProblems(page, clean).includes(problem));
    if (caught.length === 0) failures.push(`the ${name} pattern did not fail on ${JSON.stringify(example)} added to ${page}`);
  }
  const names = BUILD_NAME_PATTERNS.map(({ name }) => name);
  if (new Set(names).size !== names.length) failures.push('two patterns share a name');
  return failures;
}

function main() {
  const { pages, problems } = scanDocs();
  const failures = [];
  try {
    assert.ok(pages.length >= 20, `the scan found only ${pages.length} pages under docs/`);
  } catch (error) {
    failures.push(error.message);
  }
  failures.push(...revertCaseProblems(pages), ...problems);
  if (failures.length > 0) {
    console.error(`docs-build-names: ${failures.length} problem(s)`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(
    `docs-build-names: ${pages.length} pages name no build, and each of ${BUILD_NAME_PATTERNS.length} patterns fails on its own example`,
  );
}

if (require.main === module) main();

module.exports = { BUILD_NAME_PATTERNS, buildNameProblems, pagesUnder, scanDocs, revertCaseProblems };
