/**
 * The CI samples of the Framework guide are pipelines a reader copies.
 *
 * On `docs/how-to/workflows/setup-test-framework.md`:
 *
 * - no code block runs `npx playwright test`: the scaffold keeps its config under `tests/`, so a pipeline goes
 *   through the `test:e2e` script, and every `playwright test` a `package.json` sample defines passes that config;
 * - every `npm run <script>` in a shell or YAML block names `test:e2e`, which the framework phase adds, or a script a
 *   `package.json` sample on the page defines;
 * - the GitHub Actions sample runs, per trigger, exactly the jobs the page's trigger table lists, and the GitLab
 *   sample places its jobs on the matching pipeline sources;
 * - the pull request check changes a spec under `tests/`, so a selective job has a test to select.
 *
 * Each rule has a revert case below: the page with that mistake put back fails here.
 *
 * Usage: node test/test-doc-ci-samples.js
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const PAGE = path.join(__dirname, '..', 'docs', 'how-to', 'workflows', 'setup-test-framework.md');
const CONFIG = '--config tests/playwright.config.ts';
const FRAMEWORK_SCRIPTS = new Set(['test:e2e']);
const GITLAB_SOURCE = { pull_request: 'merge_request_event', push: 'push', schedule: 'schedule' };

/** Every fenced block of a page: its language, its body and the nearest heading above it. */
function fencedBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  let heading = '';
  for (let index = 0; index < lines.length; index += 1) {
    if (/^#{1,6} /.test(lines[index])) heading = lines[index].replace(/^#+ /, '');
    const open = lines[index].match(/^(\s*)(`{3,})\s*([\w-]*)/);
    if (!open) continue;
    let end = index + 1;
    while (end < lines.length && !lines[end].trimStart().startsWith(open[2])) end += 1;
    const body = lines
      .slice(index + 1, end)
      .map((line) => (line.startsWith(open[1]) ? line.slice(open[1].length) : line))
      .join('\n');
    blocks.push({ language: open[3].toLowerCase(), body, heading });
    index = end;
  }
  return blocks;
}

/** Whether an `if:` of `github.event_name` comparisons joined by `||` and `&&` holds on one event. */
function conditionHolds(condition, event) {
  if (condition === undefined) return true;
  return String(condition)
    .split('||')
    .some((clause) =>
      clause.split('&&').every((atom) => {
        const match = atom.trim().match(/^github\.event_name\s*(==|!=)\s*'([\w-]+)'$/);
        assert.ok(match, `unsupported condition in the GitHub sample: ${atom.trim()}`);
        return match[1] === '==' ? match[2] === event : match[2] !== event;
      }),
    );
}

/** The jobs the GitHub workflow runs on one event, following `if:` and `needs`. */
function jobsOn(workflow, event) {
  const running = new Set();
  for (const [id, job] of Object.entries(workflow.jobs)) {
    const needs = [job.needs ?? []].flat();
    if (conditionHolds(job.if, event) && needs.every((need) => running.has(need))) running.add(id);
  }
  return [...running].sort();
}

/** The trigger table: event to the sorted job ids its row lists. */
function triggerTable(text) {
  const rows = text.split('\n').filter((line) => /^\| `(pull_request|push|schedule)`/.test(line));
  return Object.fromEntries(
    rows.map((row) => {
      const [trigger, jobs] = row.split('|').slice(1, 3);
      const ids = jobs.split(',').map((job) => job.trim().split(/\s/)[0].replaceAll('`', ''));
      return [trigger.match(/`([\w-]+)`/)[1], ids.sort()];
    }),
  );
}

/** What is wrong with the page, as messages; an empty list passes. */
function pageProblems(text) {
  const problems = [];
  const blocks = fencedBlocks(text);
  const defined = new Set(FRAMEWORK_SCRIPTS);
  for (const block of blocks.filter((candidate) => candidate.language === 'json')) {
    const scripts = JSON.parse(block.body).scripts ?? {};
    for (const [name, command] of Object.entries(scripts)) {
      defined.add(name);
      if (/\bplaywright test\b/.test(command) && !command.includes(CONFIG))
        problems.push(`script ${name} runs playwright test without ${CONFIG}`);
    }
  }
  for (const block of blocks.filter((candidate) => ['bash', 'yaml', 'typescript'].includes(candidate.language))) {
    if (/\bnpx playwright test\b/.test(block.body))
      problems.push(`a ${block.language} block under "${block.heading}" runs npx playwright test without the config`);
    if (block.language === 'typescript') continue;
    for (const match of block.body.matchAll(/\bnpm run ([\w:-]+)/g))
      if (!defined.has(match[1])) problems.push(`"${block.heading}" runs npm run ${match[1]}, which no sample defines`);
  }

  const table = triggerTable(text);
  const github = blocks.find((block) => block.language === 'yaml' && block.heading.startsWith('GitHub Actions'));
  const workflow = yaml.load(github.body);
  const events = Object.keys(workflow.on).sort();
  if (JSON.stringify(Object.keys(table).sort()) !== JSON.stringify(events))
    problems.push(`the trigger table lists ${Object.keys(table)} but the GitHub sample triggers on ${events}`);
  for (const event of events) {
    const actual = jobsOn(workflow, event);
    if (JSON.stringify(actual) !== JSON.stringify(table[event] ?? []))
      problems.push(`on ${event} the GitHub sample runs ${actual} but the table lists ${table[event]}`);
  }

  const gitlab = yaml.load(blocks.find((block) => block.language === 'yaml' && block.heading.startsWith('GitLab CI')).body);
  for (const [id, job] of Object.entries(gitlab).filter(([, value]) => value?.script)) {
    const sources = (job.rules ?? []).flatMap((rule) => [...rule.if.matchAll(/\$CI_PIPELINE_SOURCE == "(\w+)"/g)].map((m) => m[1]));
    const expected = events
      .filter((event) => table[event]?.includes(id))
      .map((event) => GITLAB_SOURCE[event])
      .sort();
    if (JSON.stringify([...new Set(sources)].sort()) !== JSON.stringify(expected))
      problems.push(`GitLab job ${id} runs on ${sources} but the table places it on ${expected}`);
  }

  const pullRequest = blocks.find((block) => block.language === 'bash' && block.heading === 'Test on Pull Request');
  const added = [...pullRequest.body.matchAll(/^git add (.+)$/gm)].flatMap((match) => match[1].split(/\s+/));
  if (added.length === 0 || added.some((file) => !file.startsWith('tests/')))
    problems.push(`the pull request check adds ${added}, which changes no spec`);
  return problems;
}

/** Revert cases: each puts one original mistake back into the page and has to fail. */
function checkReverts(text) {
  const reverts = [
    [
      'a bare npx playwright test pipeline',
      'npm run test:e2e -- --shard=${{ matrix.shard }}/4',
      'npx playwright test --shard=${{ matrix.shard }}/4',
    ],
    ['an undefined smoke script', 'npm run test:e2e -- --grep @smoke', 'npm run test:smoke'],
    ['an undefined selective script', '"test:changed": "playwright', '"test:selected": "playwright'],
    ['a script without the config', `"test:burn-in": "playwright test ${CONFIG} `, '"test:burn-in": "playwright test '],
    [
      'burn-in on push the table does not list',
      "if: github.event_name == 'schedule'",
      "if: github.event_name == 'push' || github.event_name == 'schedule'",
    ],
    [
      'a PR job left out of the table',
      '| `pull_request` to main or develop | `test` (4 shards)          |',
      '| `pull_request` to main or develop | burn-in |',
    ],
    [
      'GitLab burn-in on merge requests',
      '  rules:\n    - if: $CI_PIPELINE_SOURCE == "schedule"\n```',
      '  rules:\n    - if: $CI_PIPELINE_SOURCE == "schedule"\n    - if: $CI_PIPELINE_SOURCE == "merge_request_event"\n```',
    ],
    ['a docs-only pull request check', 'git add tests/e2e/example.spec.ts', 'git add test.md'],
  ];
  for (const [name, original, mistake] of reverts) {
    assert.ok(text.includes(original), `revert case "${name}" no longer matches the page: ${original}`);
    assert.notDeepEqual(pageProblems(text.replace(original, mistake)), [], `the gate passes ${name}`);
  }
  return reverts.length;
}

try {
  const text = fs.readFileSync(PAGE, 'utf8');
  const problems = pageProblems(text);
  assert.deepEqual(problems, [], `Framework guide CI samples a reader cannot copy:\n${problems.join('\n')}`);
  const reverts = checkReverts(text);
  console.log(
    `Doc CI samples: the Framework guide's pipelines agree with its command contract and trigger table; ${reverts} revert cases fail.`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
