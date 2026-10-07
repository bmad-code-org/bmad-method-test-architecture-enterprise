'use strict';

/**
 * The parser and the checks behind `test/test-docs-tutorial.js`, which runs the commands of
 * `docs/tutorials/evaluate-your-first-skill.md` against the tutorial fixture.
 *
 * The page's markup is the contract between a reader and the check:
 *
 *  * A fenced block whose language is `bash` is a command block. The check runs it, in page order, in one shell session, so a
 *    variable one block exports is there for the next.
 *  * A fenced block whose language is `text`, placed right after a `bash` block with only prose between them, holds the key
 *    lines of that command's output. Every line must appear in the output. A `…` inside a line stands for any text, which
 *    lets a line leave out a path or an invocation id.
 *  * Any other language (`shell`, `markdown`) is shown to the reader and run only as text.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const TUTORIAL = path.join(ROOT, 'docs', 'tutorials', 'evaluate-your-first-skill.md');
const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'evaluate-tutorial');

/** The `tea-evaluate` invocations the tutorial walks through, in order. */
const REQUIRED_INVOCATIONS = Object.freeze(['check', 'digest', 'preflight', 'run', 'score', 'compare', 'compare --accept', 'ci --tier pr']);

const WILDCARD = '…';
const MARKER = '@@tea-docs-tutorial';

/**
 * Every fenced block of a page: its language, its body and the 1-based line of its opening fence. A heading line outside a
 * fence is recorded as a block of language `#heading`, so a pairing can tell that a section changed between two blocks.
 *
 * @param {string} markdown
 * @returns {{lang: string, body: string, line: number}[]}
 */
function fencedBlocks(markdown) {
  const blocks = [];
  const lines = markdown.split('\n');
  let open = null;
  for (const [index, text] of lines.entries()) {
    const fence = /^```(\S*)\s*$/.exec(text);
    if (open === null) {
      if (fence !== null) open = { lang: fence[1], body: [], line: index + 1 };
      else if (/^#{1,6}\s/.test(text)) blocks.push({ lang: '#heading', body: text, line: index + 1 });
    } else if (fence !== null && fence[1] === '') {
      blocks.push({ lang: open.lang, body: open.body.join('\n'), line: open.line });
      open = null;
    } else {
      open.body.push(text);
    }
  }
  return blocks;
}

/**
 * The runnable steps of a page: each `bash` block with the key lines of the `text` block that follows it, or `null` when no
 * `text` block follows before the next block or heading.
 *
 * @param {string} markdown
 * @returns {{command: string, expected: string[] | null, line: number}[]}
 */
function tutorialSteps(markdown) {
  const blocks = fencedBlocks(markdown);
  const steps = [];
  for (const [index, block] of blocks.entries()) {
    if (block.lang !== 'bash') continue;
    const next = blocks[index + 1];
    const expected =
      next !== undefined && next.lang === 'text'
        ? next.body
            .split('\n')
            .map((line) => line.trimEnd())
            .filter((line) => line !== '')
        : null;
    steps.push({ command: block.body, expected, line: block.line });
  }
  return steps;
}

/** Whether a command runs the evaluation command line, spelled as the page spells it or as the bare bin name. */
function runsEvaluate(command) {
  return /node cli\/evaluate\.js|\btea-evaluate\s/.test(command);
}

/** The text of a `tea-evaluate` invocation as a step spells it: `check`, `compare --accept`, `ci --tier pr`, or null. */
function invocationsOf(command) {
  const found = [];
  for (const match of command.matchAll(/node cli\/evaluate\.js ([a-z]+)([^\n]*)/g)) {
    const [, subcommand, flags] = match;
    let name = subcommand;
    if (subcommand === 'compare' && /\s--accept\b/.test(flags)) name = 'compare --accept';
    if (subcommand === 'ci' && /\s--tier pr\b/.test(flags)) name = 'ci --tier pr';
    found.push(name);
  }
  return found;
}

/**
 * The problems of a page's shape: it runs commands, each step's expected lines are non-empty where given, every
 * `tea-evaluate` invocation of the walkthrough appears in order, and each command runs through `node cli/evaluate.js`, the
 * real command line over the installed eval-quality.
 *
 * @param {{command: string, expected: string[] | null, line: number}[]} steps
 */
function pageProblems(steps) {
  const problems = [];
  if (steps.length === 0) return ['the page holds no `bash` block, so it runs no command'];
  const invoked = steps.flatMap((step) => invocationsOf(step.command));
  let from = 0;
  for (const name of REQUIRED_INVOCATIONS) {
    const at = invoked.indexOf(name, from);
    if (at === -1) problems.push(`the page runs no "node cli/evaluate.js ${name}" after the invocations before it`);
    else from = at + 1;
  }
  for (const step of steps) {
    if (step.expected !== null && step.expected.length === 0)
      problems.push(`line ${step.line}: the \`text\` block under the command holds no key line`);
    if (runsEvaluate(step.command) && (step.expected === null || step.expected.length === 0))
      problems.push(
        `line ${step.line}: the command runs the evaluation and shows no key lines; put them in a \`text\` block right under it`,
      );
  }
  for (const step of steps) {
    if (/\btea-evaluate\s+(check|digest|preflight|run|score|compare|ci)\b/.test(step.command))
      problems.push(`line ${step.line}: runs a bare tea-evaluate, which no checkout provides; the page runs node cli/evaluate.js`);
  }
  return problems;
}

/**
 * The expected lines the output does not hold. A line holds when some output line contains each `…`-separated segment, in
 * order. The order of lines among themselves is free, since a command that scores several probes may print them in any order.
 *
 * @param {string} output
 * @param {string[]} expected
 * @returns {string[]}
 */
function missingLines(output, expected) {
  const lines = output.split('\n').map((line) => line.trimEnd());
  return expected.filter((want) => {
    const segments = want.split(WILDCARD).filter((segment) => segment !== '');
    return !lines.some((line) => {
      let from = 0;
      for (const segment of segments) {
        const at = line.indexOf(segment, from);
        if (at === -1) return false;
        from = at + segment.length;
      }
      return true;
    });
  });
}

/**
 * Runs the steps in one shell session from the repository root: `set -e`, one stream for stdout and stderr, and a marker line
 * ahead of each step so its output can be told apart. A command that exits non-zero ends the session, and the step it
 * belongs to does not finish.
 *
 * @param {{command: string}[]} steps
 * @param {{env: NodeJS.ProcessEnv, timeoutMs?: number}} options
 * @returns {{outputs: {output: string, finished: boolean}[], status: number | null, error?: Error}}
 */
function runSteps(steps, { env, timeoutMs = 900_000 }) {
  const script = [
    'exec 2>&1',
    'set -e',
    ...steps.flatMap((step, index) => [`printf '\\n${MARKER} ${index} start\\n'`, step.command, `printf '\\n${MARKER} ${index} end\\n'`]),
  ].join('\n');
  const run = spawnSync('bash', ['--noprofile', '--norc', '-c', script], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });
  const text = `${run.stdout ?? ''}`;
  const outputs = steps.map((_, index) => {
    const start = text.indexOf(`${MARKER} ${index} start\n`);
    if (start === -1) return { output: '', finished: false };
    const from = start + `${MARKER} ${index} start\n`.length;
    const end = text.indexOf(`\n${MARKER} ${index} end\n`, from);
    return end === -1 ? { output: text.slice(from), finished: false } : { output: text.slice(from, end), finished: true };
  });
  return { outputs, status: run.status, ...(run.error ? { error: run.error } : {}) };
}

/**
 * The problems of one run: a step that did not finish (its command exited non-zero, or the session ended before it) and each
 * key line a finished step's output lacks.
 *
 * @param {{command: string, expected: string[] | null, line: number}[]} steps
 * @param {{output: string, finished: boolean}[]} outputs
 */
function runProblems(steps, outputs) {
  const problems = [];
  for (const [index, step] of steps.entries()) {
    const { output, finished } = outputs[index];
    if (!finished) {
      problems.push(`line ${step.line}: the command did not finish with exit 0; its output was:\n${output.trim().slice(-1500)}`);
      continue;
    }
    for (const line of missingLines(output, step.expected ?? []))
      problems.push(`line ${step.line}: the output lacks the key line ${JSON.stringify(line)}`);
  }
  return problems;
}

/** The problems of the files the page quotes: each quoted fixture file must hold the bytes the page shows. */
function quotedFileProblems(markdown) {
  const problems = [];
  for (const file of ['skill/SKILL.md', 'evaluation/requirements.md']) {
    const text = fs.readFileSync(path.join(FIXTURE, file), 'utf8').trimEnd();
    if (!markdown.includes(`\`\`\`markdown\n${text}\n\`\`\``)) problems.push(`the page does not quote ${file} as the fixture holds it`);
  }
  const registry = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'evaluation', 'evaluation.json'), 'utf8')).registry[0];
  const quoted = fencedBlocks(markdown).find((block) => block.lang === 'json' && block.body.includes('"interfaceId": "refund-skill"'));
  let parsed;
  try {
    parsed = quoted === undefined ? undefined : JSON.parse(quoted.body);
  } catch {
    parsed = undefined;
  }
  if (JSON.stringify(parsed) !== JSON.stringify(registry))
    problems.push('the page does not quote the fixture registry entry of evaluation.json as the fixture holds it');
  return problems;
}

module.exports = {
  FIXTURE,
  REQUIRED_INVOCATIONS,
  ROOT,
  TUTORIAL,
  fencedBlocks,
  invocationsOf,
  missingLines,
  pageProblems,
  quotedFileProblems,
  runProblems,
  runSteps,
  tutorialSteps,
};
