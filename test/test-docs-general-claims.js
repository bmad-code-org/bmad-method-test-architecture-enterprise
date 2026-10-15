/**
 * Regression gates for the mistakes repaired in the explanation, general-reference and navigation pages.
 *
 * Each rule reads the published page and holds one repaired claim against the artifact that owns it:
 *
 * - risk: no page says a score of 9 makes the Trace gate FAIL, because `trace` decides from coverage;
 * - env: the `.gitignore` fence on the configuration page excludes every credential-bearing file the page names,
 *   keeps `.env.example` trackable, and the `cypress.env.json` example parses as JSON;
 * - commands: no explanation promises a count of command entries or an `atdd` or `ci` skill command;
 * - registry: the first install-hang diagnosis changes no npm setting and deletes no cache;
 * - skills: the troubleshooting skill listing names every `bmad-tea-*` skill folder;
 * - lifecycle: the overview diagram orders architecture, system test design, then epics.
 *
 * Each rule has a revert case below: the original mistake fails it.
 *
 * Usage: node test/test-docs-general-claims.js
 */

'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PROJECT_ROOT = path.join(__dirname, '..');
const DOCS_ROOT = path.join(PROJECT_ROOT, 'docs');

const read = (page) => fs.readFileSync(path.join(DOCS_ROOT, page), 'utf8');

/** The fenced blocks of a language, in order. */
function fences(text, language) {
  return [...text.matchAll(new RegExp('```' + language + '\\n([\\s\\S]*?)```', 'g'))].map((match) => match[1]);
}

/** The text of the section that starts at `heading`, up to the next heading of the same or a higher level outside a fence. */
function section(text, heading) {
  const lines = text.split('\n');
  const level = heading.match(/^#+/)[0].length;
  const start = lines.findIndex((line) => line.startsWith(heading));
  assert.ok(start !== -1, `no heading ${heading}`);
  let fenced = false;
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('```')) fenced = !fenced;
    if (!fenced && new RegExp(`^#{1,${level}} `).test(line)) break;
    body.push(line);
  }
  return body.join('\n');
}

/** Pages that tie a risk score of 9 to a FAIL gate result. */
function riskGateProblems(pages) {
  const problems = [];
  for (const [page, text] of pages) {
    for (const line of text.split('\n')) {
      if (
        /\b(?:score(?:s)?|risk)\b[^.\n]*\b9\b[^.\n]*\bFAIL\b|\b9\b[^.\n]*\bmandat\w*[^.\n]*gate fail|FAIL until resolved|leaves the gate at FAIL/i.test(
          line,
        )
      ) {
        problems.push(`${page}: "${line.trim().slice(0, 80)}" ties a score of 9 to a FAIL gate`);
      }
    }
  }
  return problems;
}

/** The names of the env files the configuration page tells the reader to split per environment, plus the Cypress JSON file. */
const SECRET_FILES = ['.env', '.env.local', '.env.development', '.env.staging', '.env.production', 'cypress.env.json'];

/** One problem per credential-bearing file the page's `.gitignore` fence leaves trackable, and per parse or example failure. */
function envProblems(configurationText) {
  const problems = [];
  const section_ = section(configurationText, '## Environment Variables');
  const ignore = fences(section_, 'gitignore')[0];
  if (!ignore) return ['the Environment Variables section has no gitignore fence'];
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-docs-env-'));
  try {
    fs.writeFileSync(path.join(directory, '.gitignore'), ignore);
    spawnSync('git', ['init', '-q'], { cwd: directory });
    for (const file of [...SECRET_FILES, '.env.example']) fs.writeFileSync(path.join(directory, file), 'PLACEHOLDER=1\n');
    for (const file of SECRET_FILES) {
      const ignored = spawnSync('git', ['check-ignore', '-q', file], { cwd: directory }).status === 0;
      if (!ignored) problems.push(`${file} holds credentials and the gitignore fence does not exclude it`);
    }
    if (spawnSync('git', ['check-ignore', '-q', '.env.example'], { cwd: directory }).status === 0) {
      problems.push('.env.example is ignored, so a sanitized example cannot be committed');
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  for (const block of fences(section_, 'json')) {
    try {
      JSON.parse(block);
    } catch (error) {
      problems.push(`a json example does not parse: ${error.message}`);
    }
  }
  for (const block of fences(section_, 'bash')) {
    if (/^#\s*cypress\.env\.json/m.test(block)) problems.push('shell assignments are labelled cypress.env.json');
  }
  return problems;
}

/** Explanations that promise a command-entry count or direct `atdd` and `ci` skills. */
function commandProblems(pages) {
  const problems = [];
  for (const [page, text] of pages) {
    if (/\bten command entries\b/i.test(text)) problems.push(`${page} promises ten command entries`);
    if (/\/bmad-tea-(?:atdd|ci)\b|\$bmad-tea-(?:atdd|ci)\b/.test(text)) problems.push(`${page} names a direct atdd or ci skill command`);
  }
  return problems;
}

/** The first install-hang diagnosis runs reads and checks only. */
function registryProblems(troubleshootingText) {
  const diagnosis = fences(section(troubleshootingText, '### Install Hangs or Cannot Reach GitHub'), 'bash')[0];
  if (!diagnosis) return ['the install-hang section has no first command block'];
  const problems = [];
  if (/npm config set/.test(diagnosis)) problems.push('the first install-hang block rewrites the npm registry');
  if (/cache clean/.test(diagnosis)) problems.push('the first install-hang block deletes the npm cache');
  return problems;
}

/** Every skill folder named `bmad-tea-*` appears in the troubleshooting listing. */
function skillListingProblems(troubleshootingText) {
  const listing = fences(section(troubleshootingText, '### TEA Loads But Commands Don'), 'bash')[0] || '';
  const folders = fs
    .readdirSync(path.join(PROJECT_ROOT, 'skills'))
    .filter((name) => name.startsWith('bmad-tea-'))
    .sort();
  return folders.filter((name) => !new RegExp(`${name}(?![\\w-])`).test(listing)).map((name) => `the skill listing omits ${name}`);
}

/** The overview diagram orders architecture, then system-level test design, then epics. */
function lifecycleProblems(overviewText) {
  const diagram = fences(overviewText, 'mermaid').find((block) => block.includes('Phase3')) || '';
  const problems = [];
  if (!/Architecture\s*-->\s*TestDesignSys/.test(diagram))
    problems.push('the diagram does not send architecture to system-level test design');
  if (!/TestDesignSys\s*-->\s*EpicsStories/.test(diagram))
    problems.push('the diagram does not send system-level test design to epics and stories');
  if (/Architecture\s*-->\s*EpicsStories/.test(diagram)) problems.push('the diagram sends architecture straight to epics and stories');
  return problems;
}

function explanationPages() {
  const dir = path.join(DOCS_ROOT, 'explanation');
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => [`explanation/${name}`, read(`explanation/${name}`)]);
}

function main() {
  const failures = [];
  const configuration = read('reference/configuration.md');
  const troubleshooting = read('reference/troubleshooting.md');
  const overview = read('explanation/tea-overview.md');
  const pages = [...explanationPages(), ['reference/configuration.md', configuration], ['reference/troubleshooting.md', troubleshooting]];

  failures.push(
    ...riskGateProblems(pages),
    ...envProblems(configuration),
    ...commandProblems(explanationPages()),
    ...registryProblems(troubleshooting),
    ...skillListingProblems(troubleshooting),
    ...lifecycleProblems(overview),
  );

  const revert = (name, problems) => {
    if (problems.length === 0) failures.push(`revert case passed: ${name}`);
  };
  revert('a score of 9 tied to a FAIL gate', riskGateProblems([['x', 'An open score-9 risk leaves the gate at FAIL.\n']]));
  revert('a score-9 table row', riskGateProblems([['x', '| **9** | Critical | Mandatory | FAIL until resolved |\n']]));
  const brokenEnv = configuration.replace(/```gitignore\n[\s\S]*?```/, '```gitignore\n.env\n.env.local\n```');
  revert('a gitignore fence that skips per-environment files', envProblems(brokenEnv));
  revert('an example ignore rule that hides .env.example', envProblems(configuration.replace('!.env.example\n', '')));
  revert('a non-JSON json example', envProblems(configuration.replace(/```json\n\{/, '```json\n{ cypress: ')));
  revert('ten command entries', commandProblems([['x', 'All ten command entries remain available.\n']]));
  revert('a direct atdd command', commandProblems([['x', 'Run `/bmad-tea-atdd` first.\n']]));
  revert(
    'a registry rewrite as the first response',
    registryProblems(
      '### Install Hangs or Cannot Reach GitHub\n\n```bash\nnpm config set registry https://registry.npmjs.org/\n```\n\n### Next\n',
    ),
  );
  revert(
    'a skill listing that omits teach-me-testing',
    skillListingProblems("### TEA Loads But Commands Don't Work\n\n```bash\nls | grep bmad-tea-\n# bmad-tea-trace\n```\n"),
  );
  revert(
    'a diagram that sends architecture straight to epics',
    lifecycleProblems('```mermaid\ngraph TB\nsubgraph Phase3\nArchitecture --> EpicsStories\nArchitecture --> TestDesignSys\nend\n```\n'),
  );

  if (failures.length > 0) {
    console.error(`docs-general-claims: ${failures.length} problem(s)`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(
    'docs-general-claims: the repaired explanation, reference and navigation claims hold, and each rule fails on its revert case',
  );
}

if (require.main === module) main();

module.exports = { riskGateProblems, envProblems, commandProblems, registryProblems, skillListingProblems, lifecycleProblems };
