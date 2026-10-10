'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const yaml = require('js-yaml');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');
const { prepareSetup, setupPrompt, inspectCompletion, projectPath } = require('../cli/lib/framework-setup');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-framework-cli-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(spawnSync('git', ['init', '-q', root]).status, 0);
  fs.mkdirSync(path.join(root, 'test-artifacts', 'framework'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tests'));
  fs.writeFileSync(
    path.join(root, 'tests/smoke.test.cjs'),
    "require('node:test')('smoke', () => require('node:assert/strict').equal(1 + 1, 2));\n",
  );
  fs.mkdirSync(path.join(root, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(root, '.github', 'workflows', 'test.yaml'), 'name: tests\n');
  const config = { configSnapshot: { modules: { tea: { test_artifacts: '{project-root}/test-artifacts' } } } };
  const journalPath = path.join(root, 'test-artifacts', 'framework', 'setup-run-progress.md');
  function journal(overrides = {}) {
    const state = {
      run_id: 'run-1',
      workflowStatus: 'completed',
      setup_scope: 'both',
      setup_operation: 'create',
      hooks_started: [],
      hooks_completed: [],
      phase_status: { framework: 'completed', ci: 'completed' },
      phase_targets: { framework: ['tests'], ci: ['.github/workflows/test.yaml'] },
      contract: { test_commands: ['node --test'], pipeline_target: '.github/workflows/test.yaml' },
      ...overrides,
    };
    fs.writeFileSync(journalPath, `---\n${yaml.dump(state)}---\n# Setup\n`);
  }
  const prepare = (options = {}) =>
    prepareSetup({
      projectRoot: root,
      skillRoot: '/packaged/skills/bmad-testarch-framework',
      config,
      options: { scope: 'both', operation: 'create', ...options },
    });
  return { root, prepare, journal, journalPath };
}

test('fresh completed both run checks actual journal and pipeline artifacts', (t) => {
  const f = fixture(t);
  const request = f.prepare();
  f.journal();
  assert.equal(inspectCompletion(request).completed, true);
  fs.unlinkSync(path.join(f.root, '.github/workflows/test.yaml'));
  const incomplete = inspectCompletion(request);
  assert.equal(incomplete.completed, false);
  assert.ok(incomplete.issues.some((issue) => issue.includes('Missing pipeline')));
});

test('agent success without a new journal cannot reuse previous Create completion', (t) => {
  const f = fixture(t);
  f.journal();
  const request = f.prepare();
  assert.ok(inspectCompletion(request).issues.some((issue) => issue.includes('preceding run_id')));
});

test('Resume restores saved both scope and original Edit operation', (t) => {
  const f = fixture(t);
  assert.throws(() => f.prepare({ operation: 'resume' }), /Resume requires/);
  f.journal({ setup_operation: 'edit' });
  const request = f.prepare({ operation: 'resume', scope: 'ci' });
  assert.equal(request.scope, 'both');
  assert.equal(request.savedOperation, 'edit');
  assert.equal(inspectCompletion(request).completed, true);
  assert.match(setupPrompt(request), /Preserve the original operation and ledger/);
});

test('retry asks Resume with existing journal and retains original request', (t) => {
  const f = fixture(t);
  const request = f.prepare();
  assert.match(setupPrompt(request, { retry: true }), /headless create request/);
  f.journal({ workflowStatus: 'in-progress' });
  assert.match(setupPrompt(request, { retry: true }), /headless resume request/);
  assert.equal(inspectCompletion(request).completed, false);
});

test('unfinished hook, mismatched scope and missing targets prevent completion', (t) => {
  const f = fixture(t);
  const request = f.prepare();
  f.journal({ setup_scope: 'ci', hooks_started: ['ci.on_complete'], phase_targets: {} });
  const issues = inspectCompletion(request).issues.join('\n');
  assert.match(issues, /does not match both/);
  assert.match(issues, /unfinished hooks/);
  assert.match(issues, /names no target/);
});

test('Validate completes with a failing quality report while requiring that report', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'test-artifacts/framework/validation.md'), '# FAIL\nObserved missing tests.\n');
  const request = f.prepare({ operation: 'validate', scope: 'framework', input: ['tests'] });
  f.journal({
    setup_scope: 'framework',
    setup_operation: 'validate',
    validation_reports: { framework: 'test-artifacts/framework/validation.md' },
  });
  assert.equal(inspectCompletion(request).completed, true);
  fs.unlinkSync(path.join(f.root, 'test-artifacts/framework/validation.md'));
  assert.equal(inspectCompletion(request).completed, false);
});

test('Edit and Validate require exact readable artifacts; Edit requires requested changes', (t) => {
  const f = fixture(t);
  assert.throws(() => f.prepare({ operation: 'validate' }), /requires --input/);
  assert.throws(() => f.prepare({ operation: 'edit', input: ['tests'] }), /requires --instructions/);
  assert.throws(() => f.prepare({ operation: 'validate', input: ['absent.md'] }), /does not exist/);
});

test('symlinked artifact parents and relative escapes fail before project writes', (t) => {
  const f = fixture(t);
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-framework-outside-'));
  t.after(() => fs.rmSync(elsewhere, { recursive: true, force: true }));
  fs.symlinkSync(elsewhere, path.join(f.root, 'outside'));
  assert.throws(() => projectPath(f.root, '../escaped.json'), /outside project/);
  assert.throws(() => projectPath(f.root, 'outside/new/result.md'), /outside project/);
});

test('Create verifies frozen commands and retains failing execution evidence', (t) => {
  const f = fixture(t);
  const request = f.prepare();
  f.journal({ contract: { test_commands: ['node -e "process.exit(1)"'], pipeline_target: '.github/workflows/test.yaml' } });
  const outcome = inspectCompletion(request, { evidenceDir: path.dirname(f.journalPath) });
  assert.equal(outcome.completed, false);
  assert.match(outcome.issues.join('\n'), /Frozen test command failed/);
  assert.equal(outcome.executions[0].exitCode, 1);
  assert.ok(fs.existsSync(path.join(path.dirname(f.journalPath), 'verification.json')));
});

test('dangling artifact links are rejected before they become writable', (t) => {
  const f = fixture(t);
  fs.symlinkSync(path.join(os.tmpdir(), 'outside-framework-absent', 'new.json'), path.join(f.root, 'result.json'));
  assert.throws(() => projectPath(f.root, 'result.json'), /dangling symbolic link/);
});

test('native verification preserves project environment and records the caller timeout', (t) => {
  const f = fixture(t);
  const key = 'TEA_FRAMEWORK_PROJECT_SETTING';
  const previous = process.env[key];
  process.env[key] = 'kept';
  t.after(() => {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  });
  const request = f.prepare();
  f.journal({
    contract: {
      test_commands: ['node -e "if(process.env.TEA_FRAMEWORK_PROJECT_SETTING !== \'kept\')process.exit(7)"'],
      pipeline_target: '.github/workflows/test.yaml',
    },
  });
  const outcome = inspectCompletion(request, { timeoutMs: 150_000 });
  assert.equal(outcome.completed, true, outcome.issues.join('\n'));
  assert.equal(outcome.executions[0].timeoutMs, 150_000);
});

test('native verification timeout stops shell descendants before returning', (t) => {
  const f = fixture(t);
  fs.writeFileSync(
    path.join(f.root, 'hold.cjs'),
    "const {spawn}=require('node:child_process');const fs=require('node:fs');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync('child.pid',String(child.pid));setInterval(()=>{},1000);\n",
  );
  const request = f.prepare();
  f.journal({ contract: { test_commands: ['node hold.cjs'], pipeline_target: '.github/workflows/test.yaml' } });
  const outcome = inspectCompletion(request, { timeoutMs: 400 });
  assert.equal(outcome.completed, false);
  assert.match(outcome.issues.join('\n'), /timed out/);
  const pid = Number(fs.readFileSync(path.join(f.root, 'child.pid'), 'utf8'));
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

test('empty framework directory cannot establish Create completion', (t) => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.root, 'tests/smoke.test.cjs'));
  const request = f.prepare();
  f.journal();
  const outcome = inspectCompletion(request);
  assert.equal(outcome.completed, false);
  assert.match(outcome.issues.join('\n'), /no nonempty test source/);
  assert.equal(outcome.executions.length, 0);
});
