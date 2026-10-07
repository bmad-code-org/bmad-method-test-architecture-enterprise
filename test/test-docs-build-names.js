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
 * A second rule keeps the docs copyable: an executable command block (a fenced `bash`, `sh`, `shell` or `zsh` block)
 * holds no timestamped run or score ID, which `newInvocationId` in `cli/lib/evaluate/preflight.js` writes as
 * `YYYYMMDDTHHMMSSmmmZ-<8 hex digits>` and which names a `runs/<id>` directory.
 * A reader's own run has another ID, so a command that names one copied from the page reads a directory the reader does not have.
 * The reader captures the ID from the command's own output into a variable instead.
 * Illustrative output in a `text` block may show an ID.
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

/** The fence languages whose blocks a reader runs. */
const COMMAND_FENCES = new Set(['bash', 'sh', 'shell', 'zsh']);

/** The shape of a run or score ID. */
const INVOCATION_ID = /\b\d{8}T\d{9}Z-[0-9a-f]{8}\b/;

/** One problem line per timestamped ID inside an executable command block of one page. */
function commandIdProblems(page, text) {
  const problems = [];
  let open = null;
  for (const [index, line] of text.split('\n').entries()) {
    const fence = /^\s*(`{3,}|~{3,})\s*([\w-]*)/.exec(line);
    if (open === null) {
      if (fence) open = { marker: fence[1], language: fence[2].toLowerCase() };
    } else if (fence && fence[1][0] === open.marker[0] && fence[1].length >= open.marker.length && fence[2] === '') {
      open = null;
    } else if (COMMAND_FENCES.has(open.language)) {
      const match = INVOCATION_ID.exec(line);
      if (match) problems.push(`${page}:${index + 1}: invocation id in a ${open.language} block: ${JSON.stringify(match[0])}`);
    }
  }
  return problems;
}

function scanDocs(root = DOCS_ROOT) {
  const pages = pagesUnder(root);
  const problems = pages.flatMap((page) => {
    const text = fs.readFileSync(path.join(root, page), 'utf8');
    return [...buildNameProblems(page, text), ...commandIdProblems(page, text)];
  });
  return { pages, problems };
}

/** The revert cases of the command-block rule: an ID fails in each executable fence and in a runs/ path, and passes in other fences and in prose. */
function commandIdRevertCaseProblems() {
  const failures = [];
  const id = '20261007T091256520Z-703c4c1e';
  const block = (language, body) => `# Page\n\n\`\`\`${language}\n${body}\n\`\`\`\n`;
  for (const language of COMMAND_FENCES) {
    if (commandIdProblems('x.md', block(language, `node cli/evaluate.js score --run ${id}`)).length === 0) {
      failures.push(`an invocation id in a ${language} block passed`);
    }
  }
  if (commandIdProblems('x.md', block('bash', `ls evals/runs/${id}/scores`)).length === 0) {
    failures.push('a runs/<id> path in a bash block passed');
  }
  if (commandIdProblems('x.md', `# Page\n\n  \`\`\`bash\n  cd runs/${id}\n  \`\`\`\n`).length === 0) {
    failures.push('an invocation id in an indented bash block passed');
  }
  for (const language of ['text', 'json', '']) {
    if (commandIdProblems('x.md', block(language, `sealed under runs/${id}`)).length > 0) {
      failures.push(`an invocation id in a ${language || 'plain'} block failed`);
    }
  }
  if (commandIdProblems('x.md', `The run ${id} is yours.\n\n${block('bash', 'echo "$RUN"')}`).length > 0) {
    failures.push('an invocation id in prose, with a clean bash block, failed');
  }
  const closed = `${block('text', 'output')}\n${block('bash', 'echo "$RUN"')}${id}\n`;
  if (commandIdProblems('x.md', closed).length > 0) failures.push('an invocation id after the last fence closed failed');
  return failures;
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
  failures.push(...revertCaseProblems(pages), ...commandIdRevertCaseProblems(), ...problems);
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

module.exports = { BUILD_NAME_PATTERNS, buildNameProblems, commandIdProblems, pagesUnder, scanDocs, revertCaseProblems };
