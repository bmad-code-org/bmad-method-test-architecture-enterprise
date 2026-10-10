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
if (mode === 'old-retry') { if (!fs.existsSync('old-retry.txt')) {fs.writeFileSync('old-retry.txt', 'first');process.exit(1);} console.log('old history');process.exit(0); }
if (mode === 'nothing') { console.log('done'); process.exit(0); }
fs.mkdirSync(path.dirname(journalPath), { recursive: true });
fs.mkdirSync('tests', { recursive: true });
fs.mkdirSync('.github/workflows', { recursive: true });
fs.writeFileSync('tests/README.md', '# Tests\n');
fs.writeFileSync('tests/smoke.test.cjs', "require('node:test')('smoke', () => require('node:assert/strict').equal(1 + 1, 2));\n");
fs.writeFileSync('.github/workflows/test.yml', 'name: Tests\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: node --test\n');
const failed = mode === 'retry' && !fs.existsSync('first-attempt.txt');
const operation = prompt.includes('headless validate request') ? 'validate' : prompt.includes('headless edit request') ? 'edit' : 'create';
const selected = prompt.match(/Exact input artifacts: (\[[^\n]*\])\./);
const inputs = selected ? JSON.parse(selected[1]).map(file=>path.relative(process.cwd(),file)) : [];
let text = '---\nrun_id: command-test-run\nworkflowStatus: '+(failed?'in-progress':'completed')+'\nsetup_scope: '+scope+'\nsetup_operation: '+operation+'\nhooks_started: []\nhooks_completed: []\nphase_status:\n  framework: completed\n  ci: completed\nphase_targets:\n  framework: [tests/smoke.test.cjs]\n  ci: [.github/workflows/test.yml]\ncontract:\n  test_commands: [node --test]\n  pipeline_target: .github/workflows/test.yml\n';
if (operation === 'validate') {
 const report = path.join(path.dirname(journalPath), 'validation.md');
 fs.writeFileSync(report, '---\nrun_id: command-test-run\nstatus: FAIL\nvalidated_artifacts: '+JSON.stringify(inputs)+'\n---\n# FAIL\nMissing assertions\n');
 text = text.replace('framework: [tests/smoke.test.cjs]', 'framework: '+JSON.stringify(inputs));
 text += 'validation_reports:\n  framework: '+JSON.stringify(report)+'\n';
}
if(operation==='edit') {
 text=text.replace('framework: [tests/smoke.test.cjs]', 'framework: '+JSON.stringify(inputs));
 const digests=JSON.parse(prompt.match(/input digests \(including permissions\): (\{[^\n]*\})\./)[1]);
 const outcomes=inputs.map(file=>{const absolute=path.resolve(file),before=digests[absolute];if(mode==='edit-applied')fs.appendFileSync(file,'\n// Requested edit applied.\n');const after=require('crypto').createHash('sha256').update(String(fs.statSync(file).mode)).update(fs.readFileSync(file)).digest('hex');return {path:file,status:mode==='edit-applied'?'applied':'noop',before_sha256:before,after_sha256:after,reason:'The selected artifact already satisfies the requested change.'};});
 text+='edit_applied:\n  framework: '+JSON.stringify(outcomes)+'\n';
}
if(mode==='empty-ci') fs.writeFileSync('.github/workflows/test.yml','name: Tests\non: push\njobs: {}\n');
if(mode==='ci-no-test') fs.writeFileSync('.github/workflows/test.yml','name: Tests\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo done\n');
if(mode==='multi-summary') {fs.writeFileSync('tests/failing.test.cjs',"require('node:test')('broken',()=>require('node:assert/strict').equal(1,2));\n");text=text.replace('test_commands: [node --test]', 'test_commands: '+JSON.stringify(['node --test tests/smoke.test.cjs; node --test tests/failing.test.cjs || true']));}
if(mode==='npm-prefix') {fs.mkdirSync('packages/api/tests',{recursive:true});fs.writeFileSync('packages/api/tests/pass.cjs',"require('node:test')('api',()=>{});\n");fs.writeFileSync('packages/api/package.json',JSON.stringify({scripts:{test:'node --test tests/pass.cjs'}}));text=text.replace('test_commands: [node --test]', 'test_commands: [npm --prefix packages/api test]');}
if(mode==='validate-dir') {fs.unlinkSync(path.join(path.dirname(journalPath),'validation.md'));fs.mkdirSync(path.join(path.dirname(journalPath),'validation.md'));}
if(mode==='validate-stale') fs.utimesSync(path.join(path.dirname(journalPath),'validation.md'),new Date(0),new Date(0));
if(mode==='validate-foreign') {const file=path.join(path.dirname(journalPath),'validation.md');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('command-test-run','foreign-run'));}
if(mode==='validate-scope') {const file=path.join(path.dirname(journalPath),'validation.md');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('validated_artifacts: '+JSON.stringify(inputs),'validated_artifacts: [tests/smoke.test.cjs]'));}
if(mode==='edit-unrelated') text=text.replace('framework: '+JSON.stringify(inputs),'framework: [tests/smoke.test.cjs]').replace(/edit_applied:[\s\S]*/,'');
if(mode==='edit-unrecorded') text=text.replace(/edit_applied:[\s\S]*/,'');
if(mode==='late-failure') {fs.linkSync('package.json','result.json');process.stderr.write('transport interruption');process.exit(1);}
if(mode.startsWith('python-')) {fs.writeFileSync('tests/test_demo.py',"import unittest\nclass Example(unittest.TestCase):\n def test_example(self):\n  self.assertEqual(1, "+(mode==='python-fail'?'2':'1')+")\n"+(mode==='python-skip'?"Example.test_example=unittest.skip('pending')(Example.test_example)\n":""));text=text.replace('test_commands: [node --test]', 'test_commands: '+JSON.stringify([process.argv[3]+' -B -m unittest discover -s tests -p test_demo.py']));text=text.replace('framework: [tests/smoke.test.cjs]','framework: [tests/test_demo.py]');}
if (mode === 'replace-target') {fs.writeFileSync('tests/new.test.cjs', "require('node:test')('new',()=>{});\n");text=text.replace('tests/smoke.test.cjs]', 'tests/new.test.cjs]');}
if (mode === 'fake-native') text = text.replace('test_commands: [node --test]', 'test_commands: '+JSON.stringify(["node -e \"console.log('x;pytest 1 passed')\""]));
if (mode === 'masked-failure') {fs.writeFileSync('tests/failing.test.cjs', "require('node:test')('broken',()=>require('node:assert/strict').equal(1,2));\n");text=text.replace('test_commands: [node --test]', 'test_commands: '+JSON.stringify(['node --test || echo masked']));}
if (mode === 'replace-id') text = text.replace('command-test-run', 'replacement-run');
if (mode === 'change-contract') text = text.replace('test_commands: [node --test]', 'test_commands: [node --test tests/smoke.test.cjs]');
if (mode === 'missing-config') text = text.replace('contract:\n', 'contract:\n  config_paths: [missing.config.json]\n');
if (mode === 'zero-tests') { fs.unlinkSync('tests/smoke.test.cjs');fs.writeFileSync('tests/helper.cjs', 'module.exports = {};\n');text=text.replace('framework: [tests/smoke.test.cjs]', 'framework: [tests/helper.cjs]'); }
if (mode === 'new-output' || mode === 'new-output-hardlink') {
 fs.writeFileSync('setup.config.json', '{"generated":true}\n');
 if (mode === 'new-output-hardlink') fs.linkSync('setup.config.json', 'result-alias.json');
 text = text.replace('contract:\n', 'contract:\n  config_paths: [setup.config.json]\n');
}
if (mode === 'hooks') {
 const hooks = JSON.parse(prompt.match(/stable ledger keys: (\{[^\n]+\})\./)[1]);
 text = text.replace('hooks_started: []', 'hooks_started: '+JSON.stringify(Object.keys(hooks)))
   .replace('hooks_completed: []', 'hooks_completed: '+JSON.stringify(Object.keys(hooks)));
 text += 'hook_instructions: '+JSON.stringify(hooks)+'\n';
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

test('result refuses package manifest and hard-linked instructions before generation', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'package.json'), '{"private":true}\n');
  const manifest = f.run([...f.agent(), '--json', 'package.json']);
  assert.equal(manifest.status, 2, manifest.stdout);
  assert.equal(fs.readFileSync(path.join(f.root, 'package.json'), 'utf8'), '{"private":true}\n');
  fs.writeFileSync(path.join(f.root, 'request.json'), 'Keep request bytes');
  fs.linkSync(path.join(f.root, 'request.json'), path.join(f.root, 'linked.json'));
  const linked = f.run([...f.agent(), '--instructions', 'request.json', '--json', 'linked.json']);
  assert.equal(linked.status, 2, linked.stdout);
  assert.equal(fs.readFileSync(path.join(f.root, 'request.json'), 'utf8'), 'Keep request bytes');
});

test('external framework journal symlink fails before prompt or evidence writes', (t) => {
  const f = fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-framework-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.mkdirSync(path.join(f.root, 'artifacts'));
  fs.symlinkSync(outside, path.join(f.root, 'artifacts/framework'), 'dir');
  const result = f.run([...f.agent(), '--output', 'safe-evidence']);
  assert.equal(result.status, 2, result.stdout);
  assert.deepEqual(fs.readdirSync(outside), []);
  assert.equal(fs.existsSync(path.join(f.root, 'safe-evidence')), false);
});

test('configured completion hook cannot be omitted from a completed journal', (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.root, '_bmad/custom'));
  fs.writeFileSync(path.join(f.root, '_bmad/custom/bmad-testarch-framework.toml'), '[workflow]\non_complete="Write hook marker."\n');
  const result = f.run(f.agent());
  assert.equal(result.status, 1, result.stdout);
  assert.match(JSON.parse(result.stdout).issues.join('\n'), /framework.on_complete/);
});

test('Resume rejects replaced identity, changed contract and discarded saved hook records', (t) => {
  const f = fixture(t);
  assert.equal(f.run(f.agent()).status, 0);
  const journal = path.join(f.root, 'artifacts/framework/setup-run-progress.md');
  const original = fs.readFileSync(journal, 'utf8').replace('workflowStatus: completed', 'workflowStatus: in-progress');
  for (const mode of ['replace-id', 'change-contract', 'replace-target']) {
    fs.writeFileSync(journal, original);
    const result = f.run([...f.agent(mode), '--operation', 'resume']);
    assert.equal(result.status, 1, result.stdout);
    assert.match(JSON.parse(result.stdout).issues.join('\n'), /frozen|phase_targets/);
  }
  fs.writeFileSync(
    journal,
    original
      .replace('hooks_started: []', 'hooks_started: [framework.on_complete]')
      .replace('hooks_completed: []', 'hooks_completed: [framework.on_complete]')
      .replace('phase_status:', 'hook_instructions: {framework.on_complete: "Saved hook"}\nphase_status:'),
  );
  const discarded = f.run([...f.agent(), '--operation', 'resume']);
  assert.equal(discarded.status, 1, discarded.stdout);
  assert.match(JSON.parse(discarded.stdout).issues.join('\n'), /saved hook/);
});

test('Resume with an uncertain started hook halts before agent writes', (t) => {
  const f = fixture(t);
  assert.equal(f.run(f.agent()).status, 0);
  const journal = path.join(f.root, 'artifacts/framework/setup-run-progress.md');
  const prior = fs
    .readFileSync(journal, 'utf8')
    .replace('workflowStatus: completed', 'workflowStatus: in-progress')
    .replace('hooks_started: []', 'hooks_started: [ci.on_complete]');
  fs.writeFileSync(journal, prior);
  const result = f.run([...f.agent(), '--operation', 'resume']);
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stderr, /uncertain started hook/);
  assert.equal(fs.readFileSync(journal, 'utf8'), prior);
});

test('all frozen configuration outputs are required despite populated phase targets', (t) => {
  const f = fixture(t);
  const result = f.run(f.agent('missing-config'));
  assert.equal(result.status, 1, result.stdout);
  assert.match(JSON.parse(result.stdout).issues.join('\n'), /missing.config.json/);
});

test('helper source and zero registered tests cannot complete Create', (t) => {
  const f = fixture(t);
  const result = f.run(f.agent('zero-tests'));
  assert.equal(result.status, 1, result.stdout);
  assert.match(JSON.parse(result.stdout).issues.join('\n'), /positive supported test execution/);
});

test('newly generated configuration and its hard link are protected before result publication', (t) => {
  for (const mode of ['new-output', 'new-output-hardlink']) {
    const f = fixture(t);
    const result = f.run([...f.agent(mode), '--json', mode === 'new-output' ? 'setup.config.json' : 'result-alias.json']);
    assert.equal(result.status, 2, result.stdout);
    assert.equal(fs.readFileSync(path.join(f.root, 'setup.config.json'), 'utf8'), '{"generated":true}\n');
    assert.match(result.stderr, /protected setup/);
  }
});

test('configured framework and CI hook identities require exact completed lifecycles', (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.root, '_bmad/custom'));
  for (const skill of ['framework', 'ci'])
    fs.writeFileSync(
      path.join(f.root, `_bmad/custom/bmad-testarch-${skill}.toml`),
      '[workflow]\nactivation_steps_prepend=["Record activation."]\non_complete="Record completion."\n',
    );
  const result = f.run([...f.agent('hooks'), '--scope', 'both']);
  assert.equal(result.status, 0, result.stderr + result.stdout);
});

test('retry cannot adopt unchanged completed history after transport failure', (t) => {
  const f = fixture(t);
  assert.equal(f.run(f.agent()).status, 0);
  const journal = path.join(f.root, 'artifacts/framework/setup-run-progress.md');
  const prior = fs.readFileSync(journal, 'utf8');
  const result = f.run([...f.agent('old-retry'), '--retries', '1']);
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stderr, /no recoverable progress/);
  assert.equal(fs.readFileSync(journal, 'utf8'), prior);
});

test('saved checkpoint paths are confined even without a JSON publication flag', (t) => {
  const f = fixture(t);
  assert.equal(f.run(f.agent()).status, 0);
  const journal = path.join(f.root, 'artifacts/framework/setup-run-progress.md');
  const prior = fs
    .readFileSync(journal, 'utf8')
    .replace('workflowStatus: completed', 'workflowStatus: in-progress')
    .replace('phase_status:', 'phase_checkpoints: {framework: "../foreign-checkpoint.md"}\nphase_status:');
  fs.writeFileSync(journal, prior);
  const result = f.run([...f.agent(), '--operation', 'resume']);
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stderr, /outside project root/);
  assert.equal(fs.readFileSync(journal, 'utf8'), prior);
});

test('quoted command separators and runner text cannot fabricate native execution', (t) => {
  const f = fixture(t);
  const result = f.run(f.agent('fake-native'));
  assert.equal(result.status, 1, result.stdout);
  const value = JSON.parse(result.stdout);
  assert.equal(value.verification[0].runner, null);
  assert.match(value.issues.join('\n'), /positive supported test execution/);
});

test('shell masking cannot turn native assertion failures into completed setup', (t) => {
  const f = fixture(t);
  const result = f.run(f.agent('masked-failure'));
  assert.equal(result.status, 1, result.stdout);
  const value = JSON.parse(result.stdout);
  assert.equal(value.verification[0].exitCode, 0);
  assert.equal(value.verification[0].passedTests, 1);
  assert.equal(value.verification[0].failedTests, 1);
  assert.match(value.issues.join('\n'), /native runner reports failed/);
});

test('CI completion requires runnable pipeline jobs that execute the frozen test command', (t) => {
  for (const mode of ['empty-ci', 'ci-no-test']) {
    const f = fixture(t);
    const result = f.run([...f.agent(mode), '--scope', 'both']);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(JSON.parse(result.stdout).issues.join('\n'), /Pipeline has no runnable/);
  }
});

test('every native Node summary contributes failures even when a later suite is shell-masked', (t) => {
  const f = fixture(t);
  const result = f.run(f.agent('multi-summary'));
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const value = JSON.parse(result.stdout);
  assert.equal(value.verification[0].passedTests, 1);
  assert.equal(value.verification[0].failedTests, 1);
  assert.equal(value.verification[0].summaryComplete, true);
  assert.match(value.issues.join('\n'), /native runner reports failed/);
});

test('npm prefix resolves a passing subproject native runner through the public CLI', (t) => {
  const f = fixture(t);
  const result = f.run(f.agent('npm-prefix'));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const value = JSON.parse(result.stdout);
  assert.equal(value.completed, true);
  assert.equal(value.verification[0].runner, 'node-test');
  assert.equal(value.verification[0].passedTests, 1);
});

test('Validate rejects directories, stale reports, foreign run ownership and unrelated scope', (t) => {
  for (const mode of ['validate-dir', 'validate-stale', 'validate-foreign', 'validate-scope']) {
    const f = fixture(t);
    const result = f.run([...f.agent(mode), '--operation', 'validate', '--input', 'agent.cjs']);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(JSON.parse(result.stdout).completed, false);
    assert.match(JSON.parse(result.stdout).issues.join('\n'), /Validation report/);
  }
});

test('selected Edit targets require an actual recorded change or an explicit no-op', (t) => {
  for (const mode of ['edit-applied', 'edit-noop', 'edit-unrelated', 'edit-unrecorded']) {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.root, 'selected.config.cjs'), 'module.exports = {};\n');
    fs.writeFileSync(path.join(f.root, 'instructions.md'), 'Add the requested config comment.\n');
    const result = f.run([...f.agent(mode), '--operation', 'edit', '--input', 'selected.config.cjs', '--instructions', 'instructions.md']);
    assert.equal(result.status, ['edit-applied', 'edit-noop'].includes(mode) ? 0 : 1, result.stdout + result.stderr);
    const value = JSON.parse(result.stdout);
    if (mode === 'edit-applied') assert.match(fs.readFileSync(path.join(f.root, 'selected.config.cjs'), 'utf8'), /Requested edit applied/);
    if (mode === 'edit-unrelated') assert.match(value.issues.join('\n'), /exact selected artifacts/);
    if (mode === 'edit-unrecorded') assert.match(value.issues.join('\n'), /no verified applied change/);
  }
});

test('transport failure result publication preserves a late hard-linked package manifest with zero default retries', (t) => {
  const f = fixture(t);
  const original = '{"name":"preserve-package","private":true}\n';
  fs.writeFileSync(path.join(f.root, 'package.json'), original);
  const result = f.run([...f.agent('late-failure'), '--json', 'result.json']);
  assert.equal(result.status, 3, result.stdout + result.stderr);
  assert.equal(fs.readFileSync(path.join(f.root, 'package.json'), 'utf8'), original);
  assert.match(result.stderr, /result publication refused/);
  const value = JSON.parse(result.stdout);
  const run = JSON.parse(fs.readFileSync(path.join(value.runDirectory, 'run.json')));
  assert.equal(run.attempts.length, 1);
  assert.equal(fs.existsSync(path.join(value.runDirectory, 'attempt-2')), false);
});

test('current public completion recognizer executes real unittest successes, failures and skipped-only results', (t) => {
  const python = ['python3', 'python'].find((candidate) => spawnSync(candidate, ['--version'], { timeout: 5000 }).status === 0);
  assert.ok(python, 'Native completion requires a Python interpreter');
  for (const mode of ['python-pass', 'python-fail', 'python-skip']) {
    const f = fixture(t);
    const result = f.run([...f.agent(mode), '--agent-arg', python]);
    assert.equal(result.status, mode === 'python-pass' ? 0 : 1, result.stdout + result.stderr);
    const value = JSON.parse(result.stdout);
    assert.equal(value.completed, mode === 'python-pass');
    assert.equal(value.verification[0].runner, 'unittest');
    assert.equal(value.verification[0].passedTests, mode === 'python-pass' ? 1 : 0);
    assert.equal(value.verification[0].failedTests, mode === 'python-fail' ? 1 : 0);
    assert.match(fs.readFileSync(value.verification[0].stderr, 'utf8'), /Ran 1 test/);
  }
});
