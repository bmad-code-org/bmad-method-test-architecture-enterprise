/**
 * The fenced shell blocks of the Evaluate pages are commands a reader can copy.
 *
 * Every `bash`, `sh`, `shell` or `zsh` block on these pages has to:
 *
 * - parse: `bash -n` accepts it;
 * - hold no synopsis notation (`[--flag]`, `[a|b]`, `<placeholder>`), which a shell reads as a glob, a pipe or a
 *   redirect, unless the paragraph before the block labels it a synopsis (`Synopsis...`);
 * - invoke `tea-evaluate` and `tea-skill-runner` through the private install the prerequisites set up,
 *   `npm exec --prefix evals -- <bin>`, since the bins live in `evals/node_modules/.bin` and a bare name does not
 *   resolve from the project root.
 *
 * A synopsis belongs in a `text` block, which this gate leaves alone.
 * Each rule has revert cases below: a block that breaks it fails here.
 *
 * The Test Review guide's CI gate is run, too: its one `tea-test-review` block executes against the real CLI with the
 * stub review agent, and has to fail on a missing report, a malformed report and a score below the threshold, and
 * pass on a passing review. A pseudo-gate that compares an unset `$SCORE` is the revert case: it exits 0 with no
 * report at all.
 *
 * Usage: node test/test-doc-shell-blocks.js
 */

'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DOCS_ROOT = path.join(__dirname, '..', 'docs');

/** The pages whose shell blocks run `tea-evaluate` or `tea-skill-runner`: the CLI reference and its companion pages, the Evaluate tutorial and every Evaluate how-to guide. */
const PAGES = [
  'reference/tea-evaluate-cli.md',
  'reference/tea-evaluate-manifest.md',
  'reference/tea-evaluate-confinement.md',
  'reference/tea-evaluate-evaluators.md',
  'reference/tea-evaluate-evidence.md',
  'tutorials/evaluate-your-first-skill.md',
  ...fs
    .readdirSync(path.join(DOCS_ROOT, 'how-to', 'evaluate'))
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => `how-to/evaluate/${name}`),
];

const SHELL_LANGUAGES = new Set(['bash', 'sh', 'shell', 'zsh']);
const PRIVATE_INSTALL = 'npm exec --prefix evals -- ';

/** Every fenced block of a page: its language, its body, its first line number and the paragraph before it. */
function fencedBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const open = lines[index].match(/^(\s*)(`{3,}|~{3,})\s*([\w-]*)/);
    if (!open) continue;
    const fence = open[2];
    let end = index + 1;
    while (end < lines.length && !lines[end].trimStart().startsWith(fence)) end += 1;
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

/** The block's text with each comment removed, so a comment may name a bin or a placeholder freely. */
function withoutComments(body) {
  return body
    .split('\n')
    .map((line) => line.replace(/(^|\s)#.*$/, ''))
    .join('\n');
}

/** What is wrong with one shell block, as messages; an empty list passes. A block the paragraph before it labels a synopsis is no command, so it passes. */
function problemsOf(block) {
  const problems = [];
  if (/^synopsis\b/i.test(block.label)) return problems;
  const parsed = spawnSync('bash', ['-n'], { input: `${block.body}\n`, encoding: 'utf8' });
  if (parsed.status !== 0) problems.push(`bash -n refuses it: ${parsed.stderr.trim()}`);
  const code = withoutComments(block.body).replaceAll(/\s*\\\n\s*/g, ' ');
  const notation = code.match(/(?<!\[)\[(?!\[)[^\]\n]*(--|\|)[^\]\n]*\]|(^|[\s="'])<[A-Za-z][\w.|-]*>/m);
  if (notation) problems.push(`synopsis notation in an executable block: ${notation[0].trim()}`);
  for (const match of code.matchAll(/\btea-(evaluate|skill-runner)\b/g)) {
    const preceding = code.slice(0, match.index);
    if (/[/.\w-]$/.test(preceding)) continue;
    if (!preceding.endsWith(PRIVATE_INSTALL))
      problems.push(`\`${match[0]}\` runs without the private install prefix \`${PRIVATE_INSTALL.trim()}\``);
  }
  return problems;
}

/** Every problem on one page's text, each naming the page and the block's line. */
function pageProblems(page, text) {
  return fencedBlocks(text)
    .filter((block) => SHELL_LANGUAGES.has(block.language))
    .flatMap((block) => problemsOf(block).map((problem) => `${page}:${block.line}: ${problem}`));
}

function checkPages() {
  const problems = PAGES.flatMap((page) => pageProblems(page, fs.readFileSync(path.join(DOCS_ROOT, page), 'utf8')));
  assert.deepEqual(problems, [], `shell blocks a reader cannot copy:\n${problems.join('\n')}`);
  const counted = PAGES.flatMap((page) => fencedBlocks(fs.readFileSync(path.join(DOCS_ROOT, page), 'utf8'))).filter((block) =>
    SHELL_LANGUAGES.has(block.language),
  );
  assert.ok(counted.length > 20, `the pages hold only ${counted.length} shell blocks; the scan misses them`);
  return counted.length;
}

/** Revert cases: each block breaks one rule and has to fail; the passing cases must pass. */
function checkRules() {
  const fenced = (body, language = 'bash', label = 'Example:') => `${label}\n\n\`\`\`${language}\n${body}\n\`\`\`\n`;
  const failing = [
    ['optional flag in brackets', fenced('npm exec --prefix evals -- tea-evaluate run --evaluation evals/e [--before-state]')],
    [
      'alternatives in brackets',
      fenced('npm exec --prefix evals -- tea-evaluate run --evaluation evals/e --partition [development|held-out]'),
    ],
    ['angle placeholder', fenced('npm exec --prefix evals -- tea-evaluate score --evaluation evals/e --run <invocationId>')],
    ['bare tea-evaluate', fenced('tea-evaluate check --evaluation evals/e')],
    [
      'bare tea-skill-runner after a pipe',
      fenced(String.raw`printf 'x\n' | tea-skill-runner --skill-root skill --agent custom --agent-cmd cat`),
    ],
    ['npx tea-evaluate', fenced('npx tea-evaluate check --evaluation evals/e')],
    ['prefix without evals', fenced('npm exec -- tea-evaluate check --evaluation evals/e')],
    ['a syntax error', fenced('npm exec --prefix evals -- tea-evaluate check --evaluation "evals/e')],
    ['quoted angle placeholder', fenced('npm exec --prefix evals -- tea-evaluate score --evaluation evals/e --run "<invocationId>"')],
    ['a sh block', fenced('tea-evaluate check --evaluation evals/e', 'sh')],
  ];
  for (const [name, text] of failing) assert.notDeepEqual(pageProblems('fixture.md', text), [], `the gate passes ${name}`);
  const passing = [
    ['a concrete invocation', fenced('npm exec --prefix evals -- tea-evaluate check --evaluation evals/e')],
    [
      'a variable',
      fenced(
        'RUN_ID=20261007T112710219Z-50f0b256 # the ID <run> printed\nnpm exec --prefix evals -- tea-evaluate score --evaluation evals/e --run "$RUN_ID"',
      ),
    ],
    [
      'a labelled synopsis',
      fenced('tea-evaluate run --evaluation <path> [--before-state]', 'bash', 'Synopsis, with optional arguments in brackets:'),
    ],
    ['a text block', fenced('tea-evaluate run --evaluation <path> [--before-state]', 'text')],
    ['a runner path', fenced('ls evals/node_modules/.bin/tea-skill-runner')],
    ['a bash test with alternatives', fenced('[[ -n "$RUN_ID" || -n "$SCORE_ID" ]] && echo set')],
    ['a continued line', fenced('npm exec --prefix evals -- \\\n  tea-evaluate check --evaluation evals/e')],
    ['a stdin redirect', fenced('npm exec --prefix evals -- tea-skill-runner --skill-root skills/s --agent claude < prompt.txt')],
  ];
  for (const [name, text] of passing) assert.deepEqual(pageProblems('fixture.md', text), [], `the gate refuses ${name}`);
  return failing.length + passing.length;
}

const REVIEW_GUIDE = 'how-to/workflows/run-test-review.md';
const REVIEW_CLI = path.join(__dirname, '..', 'cli', 'test-review.js');
const STUB_AGENT = path.join(__dirname, 'fixtures', 'test-review-cli', 'stub-agent.js');

/** Each stub review agent mode, what it leaves behind, and whether a quality gate at 80 has to pass it. */
const GATE_CASES = [
  ['nothing', 'no report', false],
  ['partial', 'a malformed report', false],
  ['approve-low', 'a report scoring 70', false],
  ['approve', 'a report scoring 93', true],
];

/** The environment without the GIT_* variables a git hook exports, so nested git commands find their own repository. */
function cleanEnv(extra) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  return { ...env, ...extra };
}

/**
 * A branch that adds one test file over `origin/main`, and a `tea-test-review` on PATH that runs this checkout's CLI
 * with the stub agent in place of the vendor CLI.
 */
function gateSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-review-gate-'));
  const bin = path.join(root, 'bin');
  const repo = path.join(root, 'repo');
  fs.mkdirSync(bin);
  fs.mkdirSync(path.join(repo, 'tests'), { recursive: true });
  fs.writeFileSync(
    path.join(bin, 'tea-test-review'),
    `#!/bin/sh\nexec "${process.execPath}" "${REVIEW_CLI}" "$@" --agent-cmd "${STUB_AGENT}" --no-isolate --env-pass STUB_MODE\n`,
    { mode: 0o755 },
  );
  const git = (...args) => {
    const result = spawnSync('git', ['-c', 'user.name=docs', '-c', 'user.email=docs@example.com', ...args], {
      cwd: repo,
      encoding: 'utf8',
      env: cleanEnv(),
    });
    assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  };
  git('init', '-q', '-b', 'main');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  git('update-ref', 'refs/remotes/origin/main', 'main');
  fs.writeFileSync(path.join(repo, 'tests', 'checkout.spec.ts'), "test('checkout', () => {});\n");
  git('add', '.');
  git('commit', '-q', '-m', 'add a test');
  return { root, bin, repo };
}

/** What is wrong with a gate block, as messages: every case it lets through that it has to stop, and every passing review it stops. */
function gateProblems(body, sandbox) {
  return GATE_CASES.flatMap(([mode, leaves, shouldPass]) => {
    fs.rmSync(path.join(sandbox.repo, 'test-review.md'), { force: true });
    fs.rmSync(path.join(sandbox.repo, 'test-review.json'), { force: true });
    const run = spawnSync('bash', ['-c', body], {
      cwd: sandbox.repo,
      encoding: 'utf8',
      env: cleanEnv({ PATH: `${sandbox.bin}${path.delimiter}${process.env.PATH}`, STUB_MODE: mode }),
    });
    if ((run.status === 0) === shouldPass) return [];
    return [`exits ${run.status} on ${leaves}; a quality gate has to ${shouldPass ? 'pass' : 'fail'} it`];
  });
}

function checkReviewGate() {
  const gates = fencedBlocks(fs.readFileSync(path.join(DOCS_ROOT, REVIEW_GUIDE), 'utf8')).filter(
    (block) => SHELL_LANGUAGES.has(block.language) && /\btea-test-review\b/.test(block.body),
  );
  assert.equal(gates.length, 1, `${REVIEW_GUIDE} holds ${gates.length} shell blocks running tea-test-review; its CI gate is the one`);
  const sandbox = gateSandbox();
  try {
    const problems = gateProblems(gates[0].body, sandbox).map((problem) => `${REVIEW_GUIDE}:${gates[0].line}: ${problem}`);
    assert.deepEqual(problems, [], `the documented quality gate does not fail closed:\n${problems.join('\n')}`);
    const pseudoGate = 'if [ $SCORE -lt 80 ]; then\n  echo "Test-review quality gate below threshold"\n  exit 1\nfi';
    assert.notDeepEqual(gateProblems(pseudoGate, sandbox), [], 'the gate check passes a pseudo-gate that never reads a report');
  } finally {
    fs.rmSync(sandbox.root, { recursive: true, force: true });
  }
  return GATE_CASES.length;
}

try {
  const rules = checkRules();
  const blocks = checkPages();
  const gateCases = checkReviewGate();
  console.log(
    `Doc shell blocks: ${blocks} blocks on ${PAGES.length} pages copy cleanly; ${rules} rule cases hold; the Test Review gate fails closed on ${gateCases} cases.`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
