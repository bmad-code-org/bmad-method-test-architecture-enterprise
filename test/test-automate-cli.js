'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { HEALING_DEFAULTS, defaultsAgree } = require('../cli/lib/automate-prompt');
const { AGENT_ADAPTERS } = require('../cli/lib/agent-adapters');
const { selectMode } = require('../cli/automate');
const { reportCounts, artifactPath } = require('../cli/lib/automate-result');

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
    invoke(['--agent', 'none', '--target', path.join(scratch, 'story.md'), 'coverage']).status === 0 &&
      artifactPath(scratch, path.join(scratch, 'story.md'), 'story') === 'story.md',
    'absolute input aliases resolve inside the canonical project root',
  );
  const capturedRed = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'test/results/automate-codex-2026-10-09/red/workflow-artifacts/red-report-initial.json'), 'utf8'),
  );
  check(reportCounts(capturedRed).assertionFailures === 5, 'actual retained ATDD failures satisfy the native assertion classifier');
  check(
    result.mode === 'expand' && result.executionStatus === 'passed' && fs.existsSync(path.join(scratch, 'result.json')),
    'expand publishes validated machine-readable output',
  );
  check(
    fs.existsSync(path.join(result.evidenceDir, 'attempt-1/prompt.txt')) &&
      fs.existsSync(path.join(result.evidenceDir, 'attempt-1/stdout.txt')),
    'successful run retains prompt and agent streams',
  );
  const inventory = JSON.parse(fs.readFileSync(path.join(result.evidenceDir, 'attempt-1/generated-test-inventory.json'), 'utf8'));
  check(
    inventory.tests.length === 1 && inventory.tests[0].file === 'tests/api/generated.spec.ts' && inventory.files[0].sha256.length === 64,
    'completion retains independently derived generated file, leaf and source identity',
  );
  for (const scenario of [
    'second-file',
    'second-leaf',
    'wrong-title',
    'wrong-line',
    'wrong-column',
    'missing-project',
    'anonymous-report',
    'dynamic-test',
    'table-test',
    'callback-test',
    'repeat-missing',
    'computed-test',
    'declared-alias',
  ]) {
    const missingScope = invoke([...agent, 'coverage'], scenario);
    check(
      missingScope.status === 3 && /inventory|generated test|unrelated project/.test(missingScope.stderr),
      `${scenario} cannot conceal unexecuted or unrelated generated scope`,
    );
  }
  for (const scenario of ['repeat-complete', 'projects-complete', 'alias-suite'])
    check(invoke([...agent, 'coverage'], scenario).status === 0, `${scenario} reconciles all actual generated identities`);
  for (const mode of ['expand', 'red'])
    for (const scenario of ['incomplete-steps', 'wrong-terminal', 'wrong-step-mode']) {
      const incomplete = invoke([...agent, '--mode', mode, ...(mode === 'red' ? ['--story', 'story.md'] : []), 'coverage'], scenario);
      check(
        incomplete.status === 3 && /completed mode-specific/.test(incomplete.stderr),
        `${mode} ${scenario} cannot claim terminal generation`,
      );
    }
  const red = invoke([...agent, '--mode', 'red', '--story', 'story.md']);
  check(red.status === 0 && JSON.parse(red.stdout).executionStatus === 'verified red', 'verified red exits 0 with intended failure counts');
  check(
    invoke([...agent, '--mode', 'red', '--story', 'story.md'], 'activated-red').status === 0,
    'native red locations retain identity when the disposable activation removes skip',
  );
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
  for (const scenario of ['opaque', 'invalid-json', 'mixed-pass', 'wrong-request', 'wrong-scope', 'duplicate-report-hardlink'])
    check(
      invoke([...agent, 'coverage'], scenario).status === 3,
      `${scenario} cannot establish successful native execution or request scope`,
    );
  for (const scenario of ['opaque', 'timed-out-red', 'interrupted-red', 'nonassertion-red'])
    check(
      invoke([...agent, '--mode', 'red', '--story', 'story.md'], scenario).status === 3,
      `${scenario} cannot establish an intended red assertion`,
    );
  const fresh = invoke([...agent, 'coverage']);
  check(fresh.status === 0, 'fresh Create seeds a valid scope before the stale-artifact reproduction');
  const summaryPath = JSON.parse(fresh.stdout).summaryPath;
  const beforeSummary = fs.readFileSync(path.join(scratch, summaryPath));
  const beforeGenerated = fs.readFileSync(path.join(scratch, 'tests/api/generated.spec.ts'));
  const stale = invoke([...agent, 'coverage'], 'stale-artifacts');
  check(
    stale.status === 3 && /does not identify this request/.test(stale.stderr),
    'unchanged prior Create cannot pass with a fresh report',
  );
  check(
    fs.readFileSync(path.join(scratch, summaryPath)).equals(beforeSummary) &&
      fs.readFileSync(path.join(scratch, 'tests/api/generated.spec.ts')).equals(beforeGenerated),
    'stale reproduction retains the previous artifact bytes',
  );
  check(invoke([...agent, 'coverage'], 'stale-generated').status === 3, 'a new summary cannot claim an untouched old generated file');
  const checkpoint = 'selected-checkpoint.md';
  fs.copyFileSync(path.join(scratch, summaryPath), path.join(scratch, checkpoint));
  const originalCheckpoint = fs.readFileSync(path.join(scratch, checkpoint));
  for (const operation of ['edit', 'validate']) {
    const unrelated = invoke(
      [...agent, '--operation', operation, '--checkpoint', checkpoint, 'apply the selected change'],
      `${operation}-unrelated`,
    );
    check(unrelated.status === 3 && /selected checkpoint/.test(unrelated.stderr), `${operation} refuses another artifact as completion`);
    check(
      fs.readFileSync(path.join(scratch, checkpoint)).equals(originalCheckpoint),
      `${operation} unrelated-artifact reproduction leaves the selected checkpoint untouched`,
    );
  }
  const validated = invoke([...agent, '--operation', 'validate', '--checkpoint', checkpoint]);
  check(
    validated.status === 0 &&
      JSON.parse(validated.stdout).validationReportPath &&
      fs.readFileSync(path.join(scratch, checkpoint)).equals(originalCheckpoint),
    'Validate saves a fresh selected-artifact report and preserves its checkpoint',
  );
  check(
    invoke([...agent, '--operation', 'validate', '--checkpoint', checkpoint], 'validation-incomplete').status === 3,
    'Validate rejects an IN_PROGRESS report',
  );
  check(
    invoke([...agent, '--operation', 'validate', '--checkpoint', checkpoint], 'validate-mutates').status === 3,
    'Validate detects checkpoint modification',
  );
  fs.writeFileSync(path.join(scratch, checkpoint), originalCheckpoint);
  check(
    invoke([...agent, '--operation', 'edit', '--checkpoint', checkpoint, 'apply change'], 'edit-unchanged').status === 3,
    'Edit requires an actual selected checkpoint update',
  );
  const edited = invoke([...agent, '--operation', 'edit', '--checkpoint', checkpoint, 'apply change']);
  check(
    edited.status === 0 && !fs.readFileSync(path.join(scratch, checkpoint)).equals(originalCheckpoint),
    'Edit updates the exact selected checkpoint with preserved progress',
  );
  fs.linkSync(path.join(scratch, 'target.json'), path.join(scratch, 'hardlink-result.json'));
  const protectedBytes = fs.readFileSync(path.join(scratch, 'target.json'));
  check(
    invoke([...agent, '--target', 'target.json', '--json', 'hardlink-result.json', 'coverage']).status === 2,
    'JSON preflight rejects a hardlink alias of a protected target',
  );
  check(fs.readFileSync(path.join(scratch, 'target.json')).equals(protectedBytes), 'hardlink rejection preserves protected input bytes');
  fs.mkdirSync(path.join(scratch, 'src'), { recursive: true });
  const directoryInput = path.join(scratch, 'src/schema.json');
  fs.writeFileSync(directoryInput, '{"criticalSource":"preserve"}\n');
  fs.linkSync(directoryInput, path.join(scratch, 'directory-alias.json'));
  fs.symlinkSync(directoryInput, path.join(scratch, 'directory-symlink.json'));
  const directoryBytes = fs.readFileSync(directoryInput);
  for (const output of ['src/schema.json', 'directory-alias.json', 'directory-symlink.json']) {
    check(
      invoke([...agent, '--target', 'src', '--json', output, 'coverage']).status === 2,
      `directory input protection rejects existing descendant or alias ${output}`,
    );
    check(fs.readFileSync(directoryInput).equals(directoryBytes), `directory collision preserves source bytes for ${output}`);
  }
  check(
    invoke([...agent, '--target', 'src', '--json', 'late-directory-result.json', 'coverage'], 'late-directory-hardlink').status === 3,
    'directory input protection survives a hardlink created during execution',
  );
  check(fs.readFileSync(directoryInput).equals(directoryBytes), 'late directory alias rejection preserves original source bytes');
  check(
    invoke([...agent, '--target', 'src', '--json', 'src/new-result.json', 'coverage']).status === 0,
    'directory target permits a new output path while protecting existing descendants',
  );
  check(
    invoke([...agent, '--json', 'late-result.json', 'coverage'], 'late-hardlink').status === 3,
    'JSON postflight rejects a newly created hardlink to generated evidence',
  );
  check(
    fs.readFileSync(path.join(scratch, 'tests/api/generated.spec.ts'), 'utf8').startsWith("test('AC-1"),
    'postflight hardlink rejection preserves generated test bytes',
  );
  const yaml = require('js-yaml');
  const resumeState = {
    workflowStatus: 'in-progress',
    test_mode: 'expand',
    test_operation: 'create',
    runScope: 'story',
    runKey: 'saved-scope',
    cli_story: 'story.md',
    cli_targets: ['target.json'],
    auto_validate: false,
    auto_heal_failures: false,
    max_healing_iterations: 1,
    use_mcp_healing: false,
    healing_rounds_used: 1,
  };
  fs.writeFileSync(path.join(scratch, checkpoint), `---\n${yaml.dump(resumeState)}---\n# Saved run\n`);
  fs.writeFileSync(
    path.join(scratch, '_bmad/config.toml'),
    '[modules.tea]\nauto_validate = true\nauto_heal_failures = true\nmax_healing_iterations = 3\nuse_mcp_healing = true\n',
  );
  check(
    invoke([...agent, '--operation', 'resume', '--checkpoint', checkpoint, '--target', 'story.md']).status === 2,
    'Resume rejects caller targets outside the saved scope before execution',
  );
  fs.writeFileSync(path.join(scratch, 'other-story.md'), '# Another story\n');
  check(
    invoke([...agent, '--operation', 'resume', '--checkpoint', checkpoint, '--story', 'other-story.md']).status === 2,
    'Resume rejects a caller story outside the saved scope before execution',
  );
  const resumed = invoke([...agent, '--operation', 'resume', '--checkpoint', checkpoint]);
  check(
    resumed.status === 0 && JSON.parse(resumed.stdout).executionStatus === 'disabled' && JSON.parse(resumed.stdout).healingRoundsUsed === 1,
    'public Resume restores validation opt-out and spent repair count',
  );
  const saved = yaml.load(fs.readFileSync(path.join(scratch, checkpoint), 'utf8').match(/^---\n([\s\S]*?)\n---/)[1]);
  for (const key of ['auto_validate', 'auto_heal_failures', 'max_healing_iterations', 'use_mcp_healing'])
    check(saved[key] === resumeState[key], `Resume preserves checkpoint ${key} against conflicting project defaults`);
  check(
    invoke([...agent, '--operation', 'resume', '--checkpoint', checkpoint], 'reset-rounds').status === 3,
    'Resume rejects a reset of its spent repair budget',
  );
  const resumeProgress = invoke([...agent, '--operation', 'resume', '--checkpoint', checkpoint], 'incomplete-steps');
  check(
    resumeProgress.status === 3 && /completed mode-specific/.test(resumeProgress.stderr),
    'Resume requires complete owning mode progress',
  );
  const preservedResume = fs.readFileSync(path.join(scratch, checkpoint));
  check(
    invoke([...agent, '--operation', 'resume', '--checkpoint', checkpoint], 'increment-round').status === 3,
    'disabled Resume cannot increment the retained repair count',
  );
  fs.writeFileSync(path.join(scratch, checkpoint), preservedResume);
  check(
    invoke([...agent, '--operation', 'resume', '--checkpoint', checkpoint, '--json', 'target.json']).status === 2,
    'Resume protects its saved target scope without requiring repeated caller targets',
  );
  for (const setting of ['auto_validate', 'auto_heal_failures']) {
    fs.writeFileSync(path.join(scratch, '_bmad/config.toml'), `[modules.tea]\n${setting} = false\n`);
    const forbiddenRound = invoke([...agent, 'coverage'], 'disabled-round');
    check(
      forbiddenRound.status === 3 && /disabled healing/.test(forbiddenRound.stderr),
      `fresh Create cannot spend a repair round when ${setting} is false`,
    );
    const zero = invoke([...agent, 'coverage']);
    check(
      zero.status === 0 && JSON.parse(zero.stdout).healingRoundsUsed === 0,
      `fresh Create retains zero repair rounds when ${setting} is false`,
    );
  }
  fs.writeFileSync(path.join(scratch, '_bmad/config.toml'), '[modules.tea]\nauto_validate = false\n');
  const disabled = invoke([...agent, 'coverage']);
  check(disabled.status === 0 && JSON.parse(disabled.stdout).executionStatus === 'disabled', 'explicit validation opt-out remains visible');
  fs.writeFileSync(path.join(scratch, '_bmad/config.toml'), '[modules.tea]\nmax_healing_iterations = "99"\n');
  check(invoke(['--agent', 'none', 'coverage']).status === 2, 'invalid repair budget fails before agent execution');
  checks += require('./automate-native-checks').runNativeChecks();
  console.log(`\n${checks} AUTOMATE CLI checks passed.`);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
