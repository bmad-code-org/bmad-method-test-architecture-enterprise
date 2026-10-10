'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const CLI = path.resolve(__dirname, '../cli/framework.js');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-framework-command-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(spawnSync('git', ['init', '-q', root]).status, 0);
  fs.mkdirSync(path.join(root, '_bmad'));
  fs.writeFileSync(
    path.join(root, '_bmad/config.toml'),
    '[modules.tea]\ntest_artifacts="{project-root}/artifacts"\ntea_use_playwright_utils=false\ntea_use_pactjs_utils=false\n',
  );
  const stub = path.join(root, 'agent.cjs');
  fs.writeFileSync(
    stub,
    String.raw`
const fs = require('node:fs');
const path = require('node:path');
const prompt = fs.readFileSync(0, 'utf8');
const mode = process.argv[2];
const journalPath = JSON.parse(prompt.match(/Persist the shared journal at ("[^"\n]+")./)[1]);
const scope = prompt.match(/Explicit setup_scope: (\w+)\./)[1];
if (mode === 'nothing') { console.log('done'); process.exit(0); }
fs.mkdirSync(path.dirname(journalPath), { recursive: true });
fs.mkdirSync('tests', { recursive: true });
fs.mkdirSync('.github/workflows', { recursive: true });
fs.writeFileSync('tests/README.md', '# Tests\n');
fs.writeFileSync('tests/smoke.test.cjs', "require('node:test')('smoke', () => require('node:assert/strict').equal(1 + 1, 2));\n");
fs.writeFileSync('.github/workflows/test.yml', 'name: Tests\non: push\njobs: {}\n');
const failed = mode === 'retry' && !fs.existsSync('first-attempt.txt');
const operation = prompt.includes('headless validate request') ? 'validate' : 'create';
let text = '---\nrun_id: command-test-run\nworkflowStatus: '+(failed?'in-progress':'completed')+'\nsetup_scope: '+scope+'\nsetup_operation: '+operation+'\nhooks_started: []\nhooks_completed: []\nphase_status:\n  framework: completed\n  ci: completed\nphase_targets:\n  framework: [tests/smoke.test.cjs]\n  ci: [.github/workflows/test.yml]\ncontract:\n  test_commands: [node --test]\n  pipeline_target: .github/workflows/test.yml\n';
if (operation === 'validate') {
 const report = path.join(path.dirname(journalPath), 'validation.md');
 fs.writeFileSync(report, '# FAIL\nMissing assertions\n');
 text += 'validation_reports:\n  framework: '+JSON.stringify(report)+'\n';
}
fs.writeFileSync(journalPath, text+'---\n# Setup\n');
if (failed) { fs.writeFileSync('first-attempt.txt', prompt); console.error('transient failure'); process.exit(1); }
if (mode === 'retry' && !prompt.includes('headless resume request')) { console.error('retry did not Resume'); process.exit(1); }
console.log('finished actual stub setup');
`,
  );
  const run = (args) => spawnSync(process.execPath, [CLI, '--project-root', root, ...args], { encoding: 'utf8', timeout: 30_000 });
  const agent = (mode = 'normal') => ['--agent', 'custom', '--agent-cmd', process.execPath, '--agent-arg', stub, '--agent-arg', mode];
  return { root, run, agent };
}

test('packaged preview resolves config and writes no files to the project', (t) => {
  const f = fixture(t);
  const before = fs.readdirSync(f.root);
  const result = f.run(['--agent', 'none', '--scope', 'both']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /skills\/bmad-testarch-framework/);
  assert.match(result.stdout, /tea_use_playwright_utils": false/);
  assert.deepEqual(fs.readdirSync(f.root), before);
});

test('custom agent produces JSON, Markdown and raw evidence after verified both completion', (t) => {
  const f = fixture(t);
  const result = f.run([...f.agent(), '--scope', 'both', '--json', 'reports/setup.json']);
  assert.equal(result.status, 0, result.stderr);
  const value = JSON.parse(result.stdout);
  assert.equal(value.completed, true);
  assert.equal(value.scope, 'both');
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.root, 'reports/setup.json'))).completed, true);
  assert.ok(fs.existsSync(path.join(value.runDirectory, 'report.md')));
  assert.match(fs.readFileSync(path.join(value.runDirectory, 'attempt-1/stdout.txt'), 'utf8'), /finished actual/);
});

test('zero agent exit without journal reports incomplete setup as exit 1', (t) => {
  const f = fixture(t);
  const result = f.run(f.agent('nothing'));
  assert.equal(result.status, 1, result.stderr);
  const value = JSON.parse(result.stdout);
  assert.equal(value.completed, false);
  assert.match(value.issues[0], /journal was not written/);
});

test('fresh Create cannot report a stale prior journal as completion', (t) => {
  const f = fixture(t);
  assert.equal(f.run(f.agent()).status, 0);
  const result = f.run(f.agent('nothing'));
  assert.equal(result.status, 1, result.stderr);
  assert.match(JSON.parse(result.stdout).issues.join('\n'), /preceding run_id/);
});

test('transport retry retains both attempts and resumes durable setup state', (t) => {
  const f = fixture(t);
  const result = f.run([...f.agent('retry'), '--scope', 'both', '--retries', '1']);
  assert.equal(result.status, 0, result.stderr);
  const value = JSON.parse(result.stdout);
  const record = JSON.parse(fs.readFileSync(path.join(value.runDirectory, 'run.json')));
  assert.equal(record.attempts.length, 2);
  assert.match(fs.readFileSync(path.join(value.runDirectory, 'attempt-1/stderr.txt'), 'utf8'), /transient failure/);
  assert.match(fs.readFileSync(path.join(value.runDirectory, 'attempt-2/prompt.txt'), 'utf8'), /headless resume request/);
});

test('invalid CLI and malformed config fail with exit 2 before execution', (t) => {
  const f = fixture(t);
  for (const args of [
    ['--agent', 'none', '--scope', 'unknown'],
    ['--agent', 'none', '--operation', 'validate'],
    ['--agent', 'none', '--timeout-ms', '4oops'],
    ['--agent', 'none', '--json', '../escaped.json'],
  ]) {
    assert.equal(f.run(args).status, 2);
  }
  fs.writeFileSync(path.join(f.root, '_bmad/config.toml'), '[modules.tea\n');
  assert.equal(f.run(f.agent()).status, 2);
  assert.equal(fs.existsSync(path.join(f.root, 'artifacts')), false);
});

test('result path cannot overwrite the request file through a symlink alias', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'request.json'), 'Preserve this request.');
  fs.symlinkSync('request.json', path.join(f.root, 'alias.json'));
  const result = f.run([...f.agent(), '--instructions', 'request.json', '--json', 'alias.json']);
  assert.equal(result.status, 2, result.stderr);
  assert.equal(fs.readFileSync(path.join(f.root, 'request.json'), 'utf8'), 'Preserve this request.');
  assert.equal(fs.existsSync(path.join(f.root, 'artifacts')), false);
});

test('CI Create without a Git worktree fails before evidence or generation writes', (t) => {
  const f = fixture(t);
  fs.rmSync(path.join(f.root, '.git'), { recursive: true, force: true });
  const before = fs.readdirSync(f.root);
  const result = f.run([...f.agent(), '--scope', 'both']);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /Git repository required/);
  assert.deepEqual(fs.readdirSync(f.root), before);
});
