'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { HEALING_DEFAULTS, defaultsAgree } = require('../cli/lib/automate-prompt');
const { AGENT_ADAPTERS } = require('../cli/lib/agent-adapters');
const { selectMode } = require('../cli/automate');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'cli/automate.js');
const STUB = path.join(__dirname, 'fixtures/automate-runner/stub-agent.js');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-automate-cli-'));
let checks = 0;

function check(condition, message) {
  assert.ok(condition, message);
  checks++;
  console.log(`✓ ${message}`);
}

function invoke(args, scenario = 'success', input = '') {
  return spawnSync(process.execPath, [CLI, '--project-root', scratch, ...args], {
    input,
    encoding: 'utf8',
    timeout: 20_000,
    env: { ...process.env, TEA_AUTOMATE_STUB_CASE: scenario },
  });
}
const agent = ['--agent', 'custom', '--agent-cmd', STUB, '--env-pass', 'TEA_AUTOMATE_STUB_CASE'];
fs.chmodSync(STUB, 0o755);
fs.writeFileSync(path.join(scratch, 'story.md'), '# Story\n\nAC-1: promised behavior\n');
fs.mkdirSync(path.join(scratch, '_bmad/custom'), { recursive: true });
fs.writeFileSync(
  path.join(scratch, '_bmad/custom/bmad-testarch-automate.toml'),
  '[workflow]\npersistent_facts = ["EXPAND ONLY"]\non_complete = "expand hook"\n',
);
fs.writeFileSync(
  path.join(scratch, '_bmad/custom/bmad-testarch-atdd.toml'),
  '[workflow]\npersistent_facts = ["RED ONLY"]\non_complete = "red hook"\n',
);
try {
  assert.deepEqual(selectMode(undefined, 'write acceptance tests'), { mode: 'red', selection: 'request' });
  assert.deepEqual(selectMode(undefined, 'red mode and expand mode'), { mode: 'expand', selection: 'entry-default' });
  assert.deepEqual(selectMode(undefined, 'continue', 'red'), { mode: 'red', selection: 'checkpoint' });
  assert.throws(() => selectMode('expand', 'continue', 'red'), /checkpoint belongs to red/);
  check(true, 'task signals, headless conflicts and saved mode follow canonical routing');
  for (const method of ['buildArgv', 'buildUsageArgv']) {
    const commands = AGENT_ADAPTERS.codex[method]([], 'gpt-5.6-sol', ['command-execution']);
    check(
      commands.includes('sandbox_workspace_write.network_access=true') && commands[commands.indexOf('--sandbox') + 1] === 'workspace-write',
      `${method} permits command-execution networking inside workspace-write`,
    );
    for (const capability of ['read-only', 'scoped-artifact-writes'])
      check(
        !AGENT_ADAPTERS.codex[method]([], 'gpt-5.6-sol', [capability]).includes('sandbox_workspace_write.network_access=true'),
        `${method} keeps ${capability} network policy unchanged`,
      );
    const override = AGENT_ADAPTERS.codex[method](['-c', 'sandbox_workspace_write.network_access=false'], 'gpt-5.6-sol', [
      'command-execution',
    ]);
    check(
      override.indexOf('sandbox_workspace_write.network_access=false') > override.indexOf('sandbox_workspace_write.network_access=true'),
      `${method} preserves explicit network opt-out precedence`,
    );
  }
  assert.deepEqual(
    defaultsAgree(path.join(ROOT, 'skills/bmod-tea')),
    Object.fromEntries(Object.entries(HEALING_DEFAULTS).map(([key, value]) => [key, String(value)])),
  );
  checks++;
  const dry = invoke(['--agent', 'none', '--target', '.', 'cover the service']);
  check(
    dry.status === 0 && dry.stdout.includes('EXPAND ONLY') && !dry.stdout.includes('RED ONLY'),
    'dry expand uses only expand customization',
  );
  check(
    dry.stdout.includes('"auto_validate":true') &&
      dry.stdout.includes('"auto_heal_failures":true') &&
      dry.stdout.includes('"max_healing_iterations":3'),
    'dry prompt retains default run-and-heal settings',
  );
  check(!fs.existsSync(path.join(scratch, '_bmad-output')), 'dry run writes no generated artifacts');
  const redDry = invoke(['--agent', 'none', '--mode', 'red', '--story', 'story.md']);
  check(
    redDry.status === 0 && redDry.stdout.includes('RED ONLY') && !redDry.stdout.includes('EXPAND ONLY'),
    'red selects the ATDD customization namespace',
  );
  for (const args of [
    ['--agent', 'none', '--mode', 'invalid'],
    ['--agent', 'none', '--retries', '1', 'coverage'],
    ['--agent', 'none', '--mode', 'red', 'acceptance'],
    ['--agent', 'none', '--operation', 'resume'],
    ['--agent', 'none', '--timeout-ms', '1e9', 'coverage'],
    ['--agent', 'custom', 'coverage'],
    ['--agent', 'none', '--target', '..'],
    ['--agent', 'none', '--operation', 'edit', '--checkpoint', 'story.md'],
    ['--agent', 'none', '--evidence-dir', '/tmp/outside-project', 'coverage'],
  ]) {
    check(invoke(args).status === 2, `invalid input exits 2: ${args.join(' ')}`);
  }
  fs.writeFileSync(path.join(scratch, 'target.json'), '{"input":true}');
  check(
    invoke([...agent, '--target', 'target.json', '--json', 'target.json']).status === 2,
    'JSON output cannot overwrite a supplied file target',
  );
  check(fs.readFileSync(path.join(scratch, 'target.json'), 'utf8') === '{"input":true}', 'target collision preserves input bytes');
  check(
    invoke([...agent, '--json', '_bmad-output/test-artifacts/automate/runner.json', 'coverage']).status === 3,
    'JSON output cannot overwrite execution evidence',
  );
  const expand = invoke([...agent, '--json', 'result.json', '--target', '.', 'cover behavior']);
  check(expand.status === 0, `expand successful execution exits 0: ${expand.stderr}`);
  const result = JSON.parse(expand.stdout);
  check(
    result.mode === 'expand' && result.executionStatus === 'passed' && fs.existsSync(path.join(scratch, 'result.json')),
    'expand publishes validated machine-readable output',
  );
  check(
    fs.existsSync(path.join(result.evidenceDir, 'attempt-1/prompt.txt')) &&
      fs.existsSync(path.join(result.evidenceDir, 'attempt-1/stdout.txt')),
    'successful run retains prompt and agent streams',
  );
  const red = invoke([...agent, '--mode', 'red', '--story', 'story.md']);
  check(red.status === 0 && JSON.parse(red.stdout).executionStatus === 'verified red', 'verified red exits 0 with intended failure counts');
  check(
    fs.readFileSync(path.join(scratch, 'tests/api/generated.spec.ts'), 'utf8').startsWith('test.skip'),
    'red deliverable preserves its scaffold skip',
  );
  for (const scenario of ['failed', 'blocked'])
    check(invoke([...agent, 'coverage'], scenario).status === 1, `${scenario} execution exits 1`);
  for (const scenario of [
    'missing',
    'wrong-mode',
    'skipped',
    'missing-file',
    'rounds',
    'forged-pass',
    'load-error',
    'stale-report',
    'mixed-report',
  ])
    check(invoke([...agent, 'coverage'], scenario).status === 3, `${scenario} manifest exits 3`);
  fs.writeFileSync(path.join(scratch, '_bmad/config.toml'), '[modules.tea]\nauto_validate = false\n');
  const disabled = invoke([...agent, 'coverage']);
  check(disabled.status === 0 && JSON.parse(disabled.stdout).executionStatus === 'disabled', 'explicit validation opt-out remains visible');
  fs.writeFileSync(path.join(scratch, '_bmad/config.toml'), '[modules.tea]\nmax_healing_iterations = "99"\n');
  check(invoke(['--agent', 'none', 'coverage']).status === 2, 'invalid repair budget fails before agent execution');
  console.log(`\n${checks} AUTOMATE CLI checks passed.`);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
