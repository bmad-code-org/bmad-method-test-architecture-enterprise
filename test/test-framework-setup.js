'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const yaml = require('js-yaml');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
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
  fs.writeFileSync(
    path.join(root, '.github', 'workflows', 'test.yaml'),
    'name: tests\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: node --test\n',
  );
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
    if (state.setup_operation === 'create' && state.contract?.test_commands)
      fs.writeFileSync(
        path.join(root, '.github/workflows/test.yaml'),
        yaml.dump({
          name: 'tests',
          on: 'push',
          jobs: { test: { 'runs-on': 'ubuntu-latest', steps: state.contract.test_commands.map((command) => ({ run: command })) } },
        }),
      );
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
  const target = 'tests/smoke.test.cjs';
  const digest = createHash('sha256')
    .update(String(fs.statSync(path.join(f.root, target)).mode))
    .update(fs.readFileSync(path.join(f.root, target)))
    .digest('hex');
  const pipeline = '.github/workflows/test.yaml';
  const pipelineDigest = createHash('sha256')
    .update(String(fs.statSync(path.join(f.root, pipeline)).mode))
    .update(fs.readFileSync(path.join(f.root, pipeline)))
    .digest('hex');
  f.journal({
    setup_operation: 'edit',
    phase_targets: { framework: [target], ci: [pipeline] },
    edit_applied: {
      framework: [{ path: target, status: 'noop', before_sha256: digest, after_sha256: digest, reason: 'Already satisfies the request.' }],
      ci: [
        {
          path: pipeline,
          status: 'noop',
          before_sha256: pipelineDigest,
          after_sha256: pipelineDigest,
          reason: 'Already satisfies the request.',
        },
      ],
    },
  });
  const request = f.prepare({ operation: 'resume', scope: 'ci' });
  assert.equal(request.scope, 'both');
  assert.equal(request.savedOperation, 'edit');
  assert.equal(inspectCompletion(request).completed, true);
  assert.match(setupPrompt(request), /Preserve the original operation and ledger/);
});

test('retry asks Resume with existing journal and retains original request', (t) => {
  const f = fixture(t);
  const request = f.prepare();
  assert.throws(() => setupPrompt(request, { retry: true }), /no recoverable progress/);
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
  const request = f.prepare({ operation: 'validate', scope: 'framework', input: ['tests'] });
  f.journal({
    setup_scope: 'framework',
    setup_operation: 'validate',
    validation_reports: { framework: 'test-artifacts/framework/validation.md' },
  });
  fs.writeFileSync(
    path.join(f.root, 'test-artifacts/framework/validation.md'),
    '---\nrun_id: run-1\nstatus: FAIL\nvalidated_artifacts: [tests]\n---\n# FAIL\nObserved missing tests.\n',
  );
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
  fs.writeFileSync(
    path.join(f.root, 'tests/environment.test.cjs'),
    "require('node:test')('environment',()=>require('node:assert/strict').equal(process.env.TEA_FRAMEWORK_PROJECT_SETTING,'kept'));\n",
  );
  f.journal({
    contract: {
      test_commands: ['node --test tests/environment.test.cjs'],
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

test('unsupported successful commands cannot establish native test execution', (t) => {
  const f = fixture(t);
  const request = f.prepare();
  f.journal({
    contract: { test_commands: ['node -e "console.log(\'x;pytest 1 passed\')"'], pipeline_target: '.github/workflows/test.yaml' },
  });
  const result = inspectCompletion(request);
  assert.equal(result.completed, false);
  assert.equal(result.executions[0].runner, null);
  assert.match(result.issues.join('\n'), /positive supported test execution/);
});

test('skip-only Node tests do not establish passing assertion execution', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'tests/smoke.test.cjs'), "require('node:test').skip('placeholder',()=>{});\n");
  const request = f.prepare();
  f.journal();
  const result = inspectCompletion(request);
  assert.equal(result.completed, false);
  assert.equal(result.executions[0].passedTests, 0);
});

test('retained live evaluation preserves original capture bytes and declared outcomes', () => {
  const dir = path.join(__dirname, 'results/framework-codex-2026-10-09');
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  const bytes = fs.readFileSync(path.join(dir, index.archive));
  const sha = (value) => createHash('sha256').update(value).digest('hex');
  assert.equal(sha(bytes), index.sha256);
  const capture = JSON.parse(gunzipSync(bytes));
  assert.equal(Object.keys(capture.files).length, index.fileCount);
  assert.deepEqual(capture.manifest, index.manifest);
  for (const [name, file] of Object.entries(capture.files)) {
    assert.equal(sha(Buffer.from(file.base64, 'base64')), file.sha256, name);
  }
  const read = (name) => JSON.parse(Buffer.from(capture.files[name].base64, 'base64').toString('utf8'));
  for (const name of ['before', 'after']) {
    const score = read(`${name}/score.json`);
    assert.equal(score.passed, 9);
    assert.equal(score.total, 9);
  }
  assert.equal(read('browser-before/score.json').passed, 6);
  assert.equal(read('browser-after/resume-result.stdout.json').completed, false);
  assert.equal(read('browser-after/confirmation-result.stdout.json').completed, true);
  assert.equal(read('browser-after/score.json').passed, 7);
  const native = read('browser-after/post-capture-final-parser/result.json');
  assert.equal(native.kind, 'controlled-post-capture-native-verification');
  assert.equal(native.completed, true);
  assert.equal(native.executions[0].runner, 'playwright');
  assert.equal(native.executions[0].passedTests, 1);
  for (const [file, digest] of Object.entries(native.criticalSourceSha256))
    assert.equal(capture.files[`browser-after/post-capture-final-parser/source/${file}`].sha256, digest);
  const counts = read('browser-after/post-capture-final-parser-counts/result.json');
  assert.equal(counts.completed, true);
  assert.equal(counts.executions[0].summaryComplete, true);
  assert.equal(counts.executions[0].failedTests, 0);
  assert.equal(counts.executions[0].errors, 0);
  for (const [file, digest] of Object.entries(counts.criticalSourceSha256))
    assert.equal(capture.files[`browser-after/post-capture-final-parser-counts/source/${file}`].sha256, digest);
  assert.equal(capture.manifest.model, 'gpt-5.6-sol');
  assert.ok(capture.manifest.limitations.length >= 4);
});

test('retained Codex unittest suite executes and detects both application regressions', (t) => {
  const archive = path.join(__dirname, 'results/framework-codex-2026-10-09/evidence.json.gz');
  const { files } = JSON.parse(gunzipSync(fs.readFileSync(archive)));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-framework-native-replay-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'tests'));
  const source = Buffer.from(files['after/project/service.py'].base64, 'base64').toString('utf8');
  fs.writeFileSync(path.join(root, 'tests/test_service.py'), Buffer.from(files['after/project/tests/test_service.py'].base64, 'base64'));
  const python = ['python3', 'python'].find((candidate) => spawnSync(candidate, ['--version'], { timeout: 5000 }).status === 0);
  assert.ok(python, 'Native replay requires a Python interpreter');
  const run = (contents) => {
    fs.writeFileSync(path.join(root, 'service.py'), contents);
    return spawnSync(python, ['-B', '-m', 'unittest', 'discover', '-s', 'tests', '-v'], { cwd: root, encoding: 'utf8', timeout: 10_000 });
  };
  const baseline = run(source);
  assert.equal(baseline.status, 0, baseline.stderr);
  assert.match(baseline.stderr, /Ran 2 tests/);
  for (const mutation of [
    source.replace('return sum(items)', 'return 0'),
    source.replace('if any(item < 0 for item in items):', 'if False:'),
  ]) {
    assert.notEqual(mutation, source);
    const result = run(mutation);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /AssertionError/);
  }
});

test('Resume preserves reserved Validate report and confirmed Edit request scope', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'reserved.md'), '# Reserved report\n');
  fs.writeFileSync(path.join(f.root, 'replacement.md'), '# Replacement report\n');
  f.journal({ setup_scope: 'framework', setup_operation: 'validate', validation_reports: { framework: 'reserved.md' } });
  const validate = f.prepare({ operation: 'resume' });
  f.journal({ setup_scope: 'framework', setup_operation: 'validate', validation_reports: { framework: 'replacement.md' } });
  assert.match(inspectCompletion(validate).issues.join('\n'), /validation_reports.framework/);
  f.journal({ setup_scope: 'framework', setup_operation: 'edit', edit_requests: { framework: 'Change only the test timeout' } });
  const edit = f.prepare({ operation: 'resume' });
  f.journal({ setup_scope: 'framework', setup_operation: 'edit', edit_requests: { framework: 'Replace every test' } });
  assert.match(inspectCompletion(edit).issues.join('\n'), /edit_requests.framework/);
});

test('supported CI platforms require an executable job wired to the frozen test command', (t) => {
  const command = 'node --test tests/smoke.test.cjs';
  for (const [platform, file, pipeline] of [
    [
      'github-actions',
      '.github/workflows/test.yml',
      { name: 'Tests', on: 'push', jobs: { test: { 'runs-on': 'ubuntu-latest', steps: [{ run: command }] } } },
    ],
    ['gitlab-ci', '.gitlab-ci.yml', { test: { script: [command] } }],
    [
      'circle-ci',
      '.circleci/config.yml',
      {
        version: 2.1,
        jobs: { test: { docker: [{ image: 'node:24' }], steps: [{ run: command }] } },
        workflows: { tests: { jobs: ['test'] } },
      },
    ],
    ['azure-devops', 'azure-pipelines.yml', { trigger: ['main'], pool: { vmImage: 'ubuntu-latest' }, steps: [{ script: command }] }],
    [
      'harness',
      '.harness/test.yaml',
      {
        pipeline: {
          name: 'Tests',
          identifier: 'tests',
          stages: [{ stage: { type: 'CI', spec: { execution: { steps: [{ step: { type: 'Run', spec: { command } } }] } } } }],
        },
      },
    ],
    ['jenkins', 'Jenkinsfile', "pipeline { agent any; stages { stage('Tests') { steps { sh '" + command + "' } } } }"],
  ]) {
    const f = fixture(t);
    const request = f.prepare();
    fs.mkdirSync(path.dirname(path.join(f.root, file)), { recursive: true });
    fs.writeFileSync(path.join(f.root, file), typeof pipeline === 'string' ? pipeline : yaml.dump(pipeline));
    f.journal({
      phase_targets: { framework: ['tests'], ci: [file] },
      contract: { ci_platform: platform, pipeline_target: file, test_commands: [command] },
    });
    const result = inspectCompletion(request);
    assert.equal(result.completed, true, platform + ': ' + result.issues.join('\n'));
    fs.writeFileSync(
      path.join(f.root, file),
      typeof pipeline === 'string'
        ? pipeline.replace(command, 'echo done')
        : yaml.dump(JSON.parse(JSON.stringify(pipeline).replaceAll(command, 'echo done'))),
    );
    assert.match(inspectCompletion(request).issues.join('\n'), /no runnable step for a frozen test command/, platform);
  }
});

test('Resume preserves completed Edit outcomes and their original artifact digests', (t) => {
  const f = fixture(t);
  const file = 'tests/smoke.test.cjs';
  const digest = () =>
    createHash('sha256')
      .update(String(fs.statSync(path.join(f.root, file)).mode))
      .update(fs.readFileSync(path.join(f.root, file)))
      .digest('hex');
  const before = digest();
  const outcome = {
    path: file,
    status: 'noop',
    before_sha256: before,
    after_sha256: before,
    reason: 'Already satisfies the selected edit.',
  };
  const state = {
    setup_scope: 'framework',
    setup_operation: 'edit',
    phase_targets: { framework: [file] },
    edit_applied: { framework: [outcome] },
  };
  f.journal(state);
  const request = f.prepare({ operation: 'resume' });
  assert.equal(inspectCompletion(request).completed, true);
  fs.appendFileSync(path.join(f.root, file), '\n// An unrelated change during Resume.\n');
  f.journal({ ...state, edit_applied: { framework: [{ ...outcome, status: 'applied', after_sha256: digest() }] } });
  assert.match(inspectCompletion(request).issues.join('\n'), /changed a completed Edit outcome/);
});
