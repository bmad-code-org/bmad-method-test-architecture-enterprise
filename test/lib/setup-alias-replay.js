/** Real CI alias captures and replay checks. Refresh with: node test/lib/setup-alias-replay.js --capture */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');

const ROOT = path.join(__dirname, '..', '..');
const FIXTURES = path.join(ROOT, 'test/fixtures/setup-alias-replay');
const SOURCE_FILES = [
  'skills/bmad-testarch-ci/SKILL.md',
  'skills/bmad-testarch-ci/customize.toml',
  'skills/bmad-testarch-ci/bmod.toml',
  'skills/bmad-testarch-ci/workflow.yaml',
  'skills/bmad-testarch-framework/SKILL.md',
  'skills/bmad-testarch-framework/customize.toml',
  'skills/bmad-testarch-framework/resources/setup-routing.md',
  'skills/bmad-testarch-framework/resources/setup-state.md',
  'skills/bmad-testarch-framework/resources/setup-phase-completion.md',
  'skills/bmad-testarch-framework/resources/setup-run-progress.example.md',
  'skills/bmad-testarch-framework/ci/instructions.md',
  'skills/bmad-testarch-framework/ci/checklist.md',
  'skills/bmad-testarch-framework/ci/github-actions-template.yaml',
  'skills/bmad-testarch-framework/ci/resources/ci-pipeline-progress.example.md',
  ...[
    'step-01-preflight',
    'step-02-generate-pipeline',
    'step-03-configure-quality-gates',
    'step-03b-render-evaluation-plans',
    'step-04-validate-and-summary',
  ].map((step) => `skills/bmad-testarch-framework/ci/steps-c/${step}.md`),
  'test/fixtures/setup-alias-replay/outdated-framework/SKILL.md',
  'test/lib/setup-alias-replay.js',
].sort();
const sha = (bytes) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
const sourceDigests = () => Object.fromEntries(SOURCE_FILES.map((file) => [file, sha(fs.readFileSync(path.join(ROOT, file)))]));

/** Replay observes emitted hook, route, and journal artifacts; the source pins require a fresh live run after instruction changes. */
function replayProblems(capture, currentSources = sourceDigests()) {
  const problems = [];
  if (JSON.stringify(capture.sourceDigests) !== JSON.stringify(currentSources))
    problems.push('alias replay is stale against current instructions');
  if (capture.runnerExit !== 0) problems.push('real alias runner did not complete');
  if (capture.runnerError || capture.runnerSignal) problems.push('real alias runner failed or was terminated');
  if (
    capture.command?.slice(0, 2).join(' ') !== 'node cli/skill-runner.js' ||
    capture.command?.slice(-2).join(' ') !== '--timeout-ms 600000' ||
    !capture.command?.includes('skills/bmad-testarch-ci')
  )
    problems.push('capture did not enter the real CI alias runner');
  if (!capture.prompt?.startsWith('/bmad-testarch-ci ')) problems.push('capture did not request the CI alias');
  const hooks = (capture.hookEvents ?? '').trim().split(/\r?\n/).filter(Boolean);
  if (capture.scenario === 'ci-only') {
    if (JSON.stringify(hooks) !== JSON.stringify(['CI-PREPEND', 'CI-APPEND', 'CI-COMPLETE']))
      problems.push('CI-only activation or completion ran the wrong hooks');
    if (
      JSON.stringify(capture.activationOrder?.trim().split(/\r?\n/)) !== JSON.stringify(['CI-PREPEND', 'GREET', 'CI-APPEND', 'CI-COMPLETE'])
    )
      problems.push('CI prepend did not precede the greeting');
    const route = capture.route ?? {};
    if (
      route.setup_scope !== 'ci' ||
      route.setup_entry !== 'bmad-testarch-ci' ||
      route.selected_step !== 'skills/bmad-testarch-framework/ci/steps-c/step-01-preflight.md'
    )
      problems.push('alias selected a framework route or lost CI scope');
    if (JSON.stringify(route.facts) !== JSON.stringify(['CI-FACT'])) problems.push('CI-only run loaded framework persistent facts');
    if (capture.frameworkCheckpoint !== null) problems.push('CI-only run wrote a framework Create checkpoint');
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(capture.journal ?? '')?.[1];
    const journal = frontmatter ? yaml.load(frontmatter) : {};
    if (journal.setup_scope !== 'ci' || journal.workflowStatus !== 'completed')
      problems.push('CI-only journal did not complete its selected scope');
    if ((journal.contract?.stack ?? journal.contract?.test_stack_type) !== 'frontend')
      problems.push('alias lost the existing frontend application stack');
    const completedHooks = Array.isArray(journal.hooks_completed) ? journal.hooks_completed : Object.keys(journal.hooks_completed ?? {});
    if (completedHooks.some((key) => key.startsWith('framework.'))) problems.push('CI-only ledger completed a framework hook');
    if (!completedHooks.includes('ci.on_complete')) problems.push('CI-only ledger did not record its completion hook');
    const pipeline = yaml.load(capture.pipeline ?? '') ?? {};
    const commands = Object.values(pipeline.jobs ?? {}).flatMap((job) => (job.steps ?? []).map((step) => step.run ?? ''));
    if (!commands.some((command) => /\b(?:npm test|node --test tests\/\*\.test\.cjs)\b/.test(command)))
      problems.push('alias did not generate CI for the existing test command');
    if (commands.some((command) => /(?:playwright|cypress) install/.test(command)))
      problems.push('alias added browser installation to a unit/component-only frontend suite');
  } else if (capture.scenario === 'outdated-framework') {
    if (hooks.length > 0 || capture.route !== null || capture.journal !== null || capture.pipeline !== null)
      problems.push('incompatible sibling activated or wrote outputs');
    if (!/older|outdated|upgrade/i.test(capture.stdout ?? '') || !capture.stdout?.includes('--skill bmad-testarch-framework'))
      problems.push('incompatible sibling did not report the canonical upgrade command');
  } else problems.push('unknown alias replay scenario');
  return problems;
}

function captureScenario(scenario, { run = spawnSync, agent = 'codex' } = {}) {
  if (!['codex', 'claude'].includes(agent)) throw new Error('Alias capture agent must be codex or claude');
  const capturedSources = sourceDigests();
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-setup-alias-'));
  for (const name of ['bmad-testarch-ci', 'bmod-tea'])
    fs.cpSync(path.join(ROOT, 'skills', name), path.join(scratch, 'skills', name), { recursive: true });
  const framework = path.join(scratch, 'skills/bmad-testarch-framework');
  fs.cpSync(
    scenario === 'outdated-framework' ? path.join(FIXTURES, 'outdated-framework') : path.join(ROOT, 'skills/bmad-testarch-framework'),
    framework,
    { recursive: true },
  );
  fs.mkdirSync(path.join(scratch, '_bmad/custom'), { recursive: true });
  fs.writeFileSync(
    path.join(scratch, '_bmad/config.toml'),
    '[core]\nuser_name = "Alias evaluator"\ncommunication_language = "English"\ndocument_output_language = "English"\n[modules.tea]\ntest_artifacts = "{project-root}/test-artifacts"\ntest_stack_type = "frontend"\ntest_framework = "auto"\ntea_use_playwright_utils = "false"\ntea_use_pactjs_utils = "false"\ntea_pact_mcp = "none"\ntea_browser_automation = "none"\ntea_execution_mode = "sequential"\n',
  );
  for (const [name, marker] of [
    ['framework', 'FRAMEWORK'],
    ['ci', 'CI'],
  ]) {
    fs.writeFileSync(
      path.join(scratch, `_bmad/custom/bmad-testarch-${name}.toml`),
      `[workflow]\nactivation_steps_prepend = ["Append the literal line ${marker}-PREPEND to hook-events.txt and activation-order.txt in the project root."]\nactivation_steps_append = ["Append the literal line ${marker}-APPEND to hook-events.txt and activation-order.txt in the project root."]\npersistent_facts = ["When writing route-evidence.json, include ${marker}-FACT in its facts array."]\non_complete = "Append the literal line ${marker}-COMPLETE to hook-events.txt and activation-order.txt in the project root."\n${name === 'ci' ? 'ci_platform = "github-actions"\n' : ''}`,
    );
  }
  fs.mkdirSync(path.join(scratch, 'tests'));
  fs.mkdirSync(path.join(scratch, 'src/components'), { recursive: true });
  fs.writeFileSync(path.join(scratch, 'src/components/add.cjs'), 'exports.add = (a, b) => a + b;\n');
  fs.writeFileSync(
    path.join(scratch, 'package.json'),
    '{"name":"alias-evaluation","version":"1.0.0","scripts":{"test":"node --test tests/*.test.cjs"}}\n',
  );
  fs.writeFileSync(
    path.join(scratch, 'tests/add.test.cjs'),
    "const test=require('node:test'); const assert=require('node:assert/strict'); const {add}=require('../src/components/add.cjs'); test('add component',()=>assert.equal(add(1,1),2));\n",
  );
  for (const args of [
    ['init', '-q'],
    ['remote', 'add', 'origin', 'https://github.com/example/alias-evaluation.git'],
  ]) {
    const git = spawnSync('git', args, { cwd: scratch, encoding: 'utf8' });
    if (git.status !== 0) throw new Error(git.stderr);
  }
  const prompt =
    '/bmad-testarch-ci Create CI only for this existing frontend application with a Node built-in unit/component test runner, using GitHub Actions. The application has no browser suite. Follow the real alias instructions and customization resolution. This disposable project permits pipeline/checkpoint/hook outputs and running its actual test command. Preserve its existing tests and package command. Keep every helper script and temporary file inside this scratch project or a fresh private mkdtemp directory; shared /tmp basenames are forbidden. For observable routing evidence: at the standard greeting append GREET to activation-order.txt; after loading the first selected operation step write route-evidence.json with setup_scope, setup_entry, selected_step (full relative path), and loaded persistent fact markers in facts. Continue the operation normally through completion. If the alias cannot activate, report why and stop without installing anything or writing routing evidence. Do not edit skill files or _bmad inputs, commit, or push.';
  const command = [
    'node',
    'cli/skill-runner.js',
    '--skill-root',
    'skills/bmad-testarch-ci',
    '--agent',
    agent,
    '--capability',
    'command-execution',
    '--timeout-ms',
    '600000',
  ];
  fs.writeFileSync(path.join(scratch, 'prompt.txt'), prompt + '\n');
  const result = run(process.execPath, [path.join(ROOT, 'cli/skill-runner.js'), ...command.slice(2)], {
    cwd: scratch,
    input: prompt,
    encoding: 'utf8',
    timeout: 630_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const read = (file) => (fs.existsSync(path.join(scratch, file)) ? fs.readFileSync(path.join(scratch, file), 'utf8') : null);
  const capture = {
    scenario,
    command,
    prompt,
    sourceDigests: capturedSources,
    runnerExit: result.status,
    runnerError: result.error ? { message: result.error.message, code: result.error.code ?? null } : null,
    runnerSignal: result.signal ?? null,
    stdout: result.stdout,
    stderr: result.stderr,
    hookEvents: read('hook-events.txt'),
    activationOrder: read('activation-order.txt'),
    route: read('route-evidence.json') ? JSON.parse(read('route-evidence.json')) : null,
    journal: read('test-artifacts/framework/setup-run-progress.md'),
    frameworkCheckpoint: read('test-artifacts/framework/framework-setup-progress.md'),
    pipeline: read('.github/workflows/test.yml'),
  };
  fs.writeFileSync(path.join(scratch, 'capture.json'), JSON.stringify(capture, null, 2) + '\n');
  if (result.error) {
    throw new Error(
      `${scenario} runner failed (${result.error.code ?? 'unknown code'}): ${result.error.message}; evidence retained at ${scratch}`,
      { cause: result.error },
    );
  }
  const problems = replayProblems(capture);
  if (problems.length > 0) throw new Error(`${scenario} failed; evidence retained at ${scratch}: ${problems.join('; ')}`);
  fs.writeFileSync(path.join(FIXTURES, `${scenario}.capture.json`), JSON.stringify(capture, null, 2) + '\n');
  console.log(`${scenario}: current alias capture passed; evidence retained at ${scratch}`);
}

module.exports = { sourceDigests, replayProblems, captureScenario };
if (require.main === module) {
  if (process.argv[2] !== '--capture') throw new Error('Use --capture to refresh the two real alias cases.');
  for (const scenario of ['ci-only', 'outdated-framework']) captureScenario(scenario);
}
