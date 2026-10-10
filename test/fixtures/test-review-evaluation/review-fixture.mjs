#!/usr/bin/env node
// Adopter-owned target of the bmad-testarch-test-review evaluation
// (test/evaluations/bmad-testarch-test-review). It reads one JSON request on
// stdin, builds a disposable git repository from a committed fixture under
// repos/, and runs this checkout's tea-test-review CLI against it with the
// skill under test. The CLI's stdout (the verdict JSON) and exit code pass
// through unchanged; the CLI's stderr passes through as well.
//
// Request: {"fixture": "<repos/ directory>", "review": "head" | "merge", "mode": "pr" | "files"}
//   head  - review the pull request branch tip against main
//   merge - review a merge commit of the pull request into main (after main
//           advanced with repos/<fixture>/main/, when that tree exists), the
//           way a pull_request workflow checks out the merge ref
//   files - review every test file of the fixture with --files, no git diff
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const reposRoot = join(here, 'repos');
const REVIEWS = new Set(['head', 'merge']);
const MODES = new Set(['pr', 'files']);

function refuse(message) {
  process.stdout.write(`${JSON.stringify({ error: message })}\n`);
  process.exit(2);
}

let input = '';
for await (const chunk of process.stdin) input += chunk;

let request;
try {
  request = JSON.parse(input);
} catch {
  refuse('the request is not JSON');
}
if (request === null || typeof request !== 'object' || Array.isArray(request)) refuse('the request is not a JSON object');
const { fixture, review, mode } = request;
if (typeof fixture !== 'string' || !/^[a-z0-9-]+$/.test(fixture) || fixture === '_common') refuse('fixture must name a fixture directory');
if (!REVIEWS.has(review)) refuse('review must be "head" or "merge"');
if (!MODES.has(mode)) refuse('mode must be "pr" or "files"');
const fixtureRoot = join(reposRoot, fixture);
if (!existsSync(join(fixtureRoot, 'base'))) refuse(`no fixture named ${fixture}`);

// Fixed identity and dates, so every trial builds byte-identical commits.
const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Fixture Author',
  GIT_AUTHOR_EMAIL: 'author@example.test',
  GIT_COMMITTER_NAME: 'Fixture Author',
  GIT_COMMITTER_EMAIL: 'author@example.test',
  GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
  GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
};

const project = mkdtempSync(join(tmpdir(), 'tea-review-fixture-'));
const cleanup = () => {
  if (!process.env.REVIEW_FIXTURE_KEEP) rmSync(project, { recursive: true, force: true });
};

function git(...args) {
  const result = spawnSync('git', args, { cwd: project, env: gitEnv, encoding: 'utf8' });
  if (result.status !== 0) {
    cleanup();
    process.stderr.write(`review-fixture: git ${args.join(' ')} failed: ${result.stderr}`);
    process.exit(3);
  }
  return result.stdout;
}

function overlay(tree) {
  cpSync(tree, project, { recursive: true });
}

function testFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) files.push(...testFiles(full));
    else if (/^test_.*\.py$/.test(entry)) files.push(relative(project, full));
  }
  return files.sort();
}

git('init', '--quiet', '--initial-branch=main');
overlay(join(reposRoot, '_common'));
overlay(join(fixtureRoot, 'base'));
git('add', '--all');
git('commit', '--quiet', '--message', 'base');

if (existsSync(join(fixtureRoot, 'pr'))) {
  git('checkout', '--quiet', '-b', 'pull-request');
  overlay(join(fixtureRoot, 'pr'));
  git('add', '--all');
  git('commit', '--quiet', '--message', 'pull request');
}

if (review === 'merge') {
  git('checkout', '--quiet', 'main');
  if (existsSync(join(fixtureRoot, 'main'))) {
    overlay(join(fixtureRoot, 'main'));
    git('add', '--all');
    git('commit', '--quiet', '--message', 'main advances');
  }
  git('checkout', '--quiet', '-b', 'merge-ref');
  git('merge', '--quiet', '--no-ff', '--message', 'merge pull request', 'pull-request');
}

const cliArgs = [
  join(repoRoot, 'cli', 'test-review.js'),
  '--agent',
  'codex',
  '--model',
  'gpt-5.6-sol',
  '--skill-root',
  join(repoRoot, 'skills', 'bmad-testarch-test-review'),
  '--project-root',
  project,
  '--output',
  join(project, 'test-review.md'),
];
if (mode === 'files') {
  for (const file of testFiles(join(project, 'tests'))) cliArgs.push('--files', file);
} else {
  cliArgs.push('--base', 'main');
}

const review_ = spawnSync(process.execPath, cliArgs, {
  cwd: project,
  env: process.env,
  stdio: ['ignore', 'pipe', 'inherit'],
  maxBuffer: 64 * 1024 * 1024,
});
cleanup();
if (review_.error) {
  process.stderr.write(`review-fixture: could not start tea-test-review: ${review_.error.message}\n`);
  process.exit(3);
}
process.stdout.write(review_.stdout);
process.exit(review_.status ?? 3);
