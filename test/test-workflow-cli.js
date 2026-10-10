'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { runWithEvidence, WorkflowError, integer, projectPath, readInput } = require('../cli/lib/workflow-cli');
const { resolveTeaConfig } = require('../cli/lib/resolve-tea-config');
const cli = path.join(__dirname, '..', 'cli', 'test-design.js');
const skillRoot = path.join(__dirname, '..', 'skills', 'bmad-testarch-test-design');
function project(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-workflow-cli-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'epic.md'), '# Epic 7\n\nA sync job runs once per request.\n');
  fs.writeFileSync(path.join(dir, 'architecture.md'), '# Architecture\n\nOne local queue, one API endpoint.\n');
  return dir;
}
function execute(root, args = [], stubMode) {
  const stub = path.join(root, 'agent.cjs');
  fs.writeFileSync(
    stub,
    `
const fs = require('node:fs'), path = require('node:path');
const prompt = fs.readFileSync(0, 'utf8');
fs.writeFileSync(path.join(process.cwd(), 'captured-prompt.txt'), prompt);
const mode = process.argv[2];
if (mode === 'missing') { process.stdout.write('done'); process.exit(0); }
const files = JSON.parse(prompt.match(/Produce these deliverables: (.*)/)[1]);
const runKey = prompt.match(/run_key=([^;\\n]+)/)[1];
const plan = '# Test Design\\n\\n## Risk Assessment\\n\\n### Low Risks: Score 1 to 2\\n\\n| Risk ID | Category | Description | Probability | Impact | Score |\\n| --- | --- | --- | --- | --- | --- |\\n| R-001 | DATA | Request handling loses queued input | 1 | 2 | '+(mode === 'bad-score' ? '9' : '2')+' |\\n\\n## Test Coverage Plan\\n\\n### P1\\n\\n| Test ID | Scenario | Test Level | Risk Link |\\n| --- | --- | --- | --- |\\n| T-001 | Keep queued input when sync fails | API | R-001 |\\n';
for (const file of files) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, /(?:epic-|qa\\.md$)/.test(file) ? plan : '# Completed architecture or handoff\\n'); }
if (mode !== 'no-checkpoint') {
 const checkpoint = JSON.parse(prompt.match(/Save a completed progress checkpoint at (.*)\\./)[1]);
 fs.writeFileSync(checkpoint, '---\\nrunScope: '+(runKey === 'system' ? 'system' : 'epic')+'\\nrunKey: '+runKey+'\\nworkflowStatus: completed\\ntotalSteps: 5\\nstepsCompleted: [step-01-detect-mode, step-02-load-context, step-03-risk-and-testability, step-04-coverage-plan, step-05-generate-output]\\nlastStep: step-05-generate-output\\nnextStep: ""\\n---\\n# Finished\\n');
}
process.stdout.write('raw reply from the agent');
`,
  );
  const common = ['--project-root', root, '--skill-root', skillRoot, '--input', 'epic.md', '--output-dir', 'published'];
  const vendor =
    stubMode === undefined
      ? ['--agent', 'none']
      : ['--agent', 'custom', '--agent-cmd', process.execPath, '--agent-arg', stub, '--agent-arg', stubMode];
  return spawnSync(process.execPath, [cli, ...common, ...vendor, ...args], { encoding: 'utf8', timeout: 20_000 });
}
test('integer validation refuses partial parses and overflow', () => {
  for (const value of ['1e9', '25abc', '9007199254740992', '-1', '0']) assert.throws(() => integer(value, 'timeout'), WorkflowError);
  assert.equal(integer('20', 'timeout'), 20);
});
test('paths reject outside destinations and escaping or dangling symlinks', (t) => {
  const root = project(t);
  assert.throws(() => projectPath(root, '../outside'), /inside/);
  fs.symlinkSync(os.tmpdir(), path.join(root, 'escape'));
  assert.throws(() => projectPath(root, 'escape/output.md'), /outside/);
  fs.symlinkSync(path.join(root, 'missing'), path.join(root, 'dangling'));
  assert.throws(() => projectPath(root, 'dangling/output.md'), /dangling/);
  assert.throws(() => readInput(root, '.'), /regular file/);
});
test('configuration reads overrides for the selected skill and keeps review defaults isolated', (t) => {
  const root = project(t);
  const custom = path.join(root, '_bmad', 'custom');
  fs.mkdirSync(custom, { recursive: true });
  fs.writeFileSync(path.join(custom, 'bmad-testarch-test-design.toml'), '[workflow]\npersistent_facts=["design policy"]\n');
  fs.writeFileSync(path.join(custom, 'bmad-testarch-test-review.toml'), '[workflow]\npersistent_facts=["review policy"]\n');
  const resolved = resolveTeaConfig({ projectRoot: root, skillRoot, skillName: 'bmad-testarch-test-design' });
  assert.deepEqual(resolved.workflowCustomization.persistent_facts, ['design policy']);
});
test('helper keeps raw output and arbitrary validation result', (t) => {
  const root = project(t);
  const stub = path.join(root, 'success.cjs');
  fs.writeFileSync(stub, "require('fs').readFileSync(0,'utf8'); process.stdout.write('raw stdout'); process.stderr.write('raw stderr');");
  const result = runWithEvidence({
    name: 'test',
    projectRoot: root,
    options: { agent: 'custom', agentCmd: process.execPath, agentArg: [stub], retries: '0' },
    prepare: ({ attemptDir }) => ({ prompt: 'complete request', custom: attemptDir }),
    validate: (context) => ({ summary: context.custom }),
  });
  assert.equal(result.value.summary, result.attemptDir);
  assert.equal(fs.readFileSync(path.join(result.attemptDir, 'stdout.txt'), 'utf8'), 'raw stdout');
  assert.equal(fs.readFileSync(path.join(result.attemptDir, 'stderr.txt'), 'utf8'), 'raw stderr');
  assert.equal(JSON.parse(fs.readFileSync(path.join(result.runDir, 'run.json'))).mode, 'live');
});
test('retry preserves failure streams and creates fresh attempt workspace', (t) => {
  const root = project(t);
  const stub = path.join(root, 'flaky.cjs');
  fs.writeFileSync(
    stub,
    "const fs=require('fs'),path=require('path');const p=fs.readFileSync(0,'utf8');const count=path.join(process.cwd(),'count');if(!fs.existsSync(count)){fs.writeFileSync(count,'1');fs.writeFileSync(p,'old output');process.stdout.write('partial');process.stderr.write('transport failed');process.exit(1);}process.stdout.write('new output');",
  );
  const result = runWithEvidence({
    name: 'retry',
    projectRoot: root,
    options: { agent: 'custom', agentCmd: process.execPath, agentArg: [stub], retries: '1' },
    prepare: ({ attemptDir }) => ({ prompt: path.join(attemptDir, 'artifact.txt') }),
    validate: (context) => {
      assert.equal(fs.existsSync(context.prompt), false);
      return context.stdout;
    },
  });
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0].failureClass, 'environment-transport');
  assert.equal(result.value, 'new output');
  assert.equal(fs.readFileSync(path.join(result.runDir, 'attempt-1', 'stdout.txt'), 'utf8'), 'partial');
  assert.equal(fs.readFileSync(path.join(result.runDir, 'attempt-1', 'artifact.txt'), 'utf8'), 'old output');
});
test('validation failure preserves evidence and does not retry', (t) => {
  const root = project(t);
  const stub = path.join(root, 'success.cjs');
  fs.writeFileSync(stub, "require('fs').readFileSync(0,'utf8');process.stdout.write('finished without report');");
  let failure;
  try {
    runWithEvidence({
      name: 'bad',
      projectRoot: root,
      options: { agent: 'custom', agentCmd: process.execPath, agentArg: [stub], retries: '3' },
      prepare: () => ({ prompt: 'request' }),
      validate: () => {
        throw new Error('missing report');
      },
    });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure.failureClass, 'environment-parser');
  const record = JSON.parse(fs.readFileSync(path.join(failure.runDir, 'run.json')));
  assert.equal(record.attempts.length, 1);
  assert.equal(record.failureClass, 'environment-parser');
});
test('epic CLI invokes a custom vendor and publishes only complete, validated artifacts', (t) => {
  const root = project(t);
  const result = execute(root, ['--epic', '7'], 'success');
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.mode, 'live');
  assert.equal(output.runKey, 'epic-7');
  assert.equal(output.riskCount, 1);
  assert.equal(output.coverageCount, 1);
  assert.equal(output.artifacts.length, 2);
  assert.match(fs.readFileSync(path.join(root, 'captured-prompt.txt'), 'utf8'), /Read .*SKILL\.md.* first/);
  assert.equal(fs.readFileSync(path.join(output.evidence, 'attempt-1', 'stdout.txt'), 'utf8'), 'raw reply from the agent');
});
test('system CLI requires distinct PRD and architecture documents and publishes its complete artifact set', (t) => {
  const root = project(t);
  assert.equal(execute(root, ['--scope', 'system']).status, 2);
  assert.equal(execute(root, ['--scope', 'system', '--input', 'epic.md']).status, 2);
  const result = execute(root, ['--scope', 'system', '--input', 'architecture.md'], 'success');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).artifacts.length, 4);
});
test('prompt-only mode saves an actual skill invocation without vendor execution', (t) => {
  const root = project(t);
  const result = execute(root, ['--epic', '7']);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.mode, 'prompt-only');
  assert.equal(fs.existsSync(path.join(root, 'published')), false);
  assert.match(fs.readFileSync(output.prompt, 'utf8'), /Resolved configuration:/);
});
test('missing output, incomplete checkpoint and wrong arithmetic fail without publishing', (t) => {
  for (const mode of ['missing', 'no-checkpoint', 'bad-score']) {
    const root = project(t);
    const result = execute(root, ['--epic', '7'], mode);
    assert.equal(result.status, 3, result.stderr);
    assert.match(result.stderr, /evidence:/);
    assert.equal(fs.existsSync(path.join(root, 'published')), false);
  }
});

test('the observed evidence header preserves baseline risk meaning without changing scoring rules', () => {
  const { readDesign } = require('../cli/lib/test-design-parser');
  const { scoreRun } = require('./eval-test-design');
  const groundTruth = require('./fixtures/test-design-eval/ground-truth.json');
  const generated = fs.readFileSync(
    path.join(__dirname, 'results', 'codex-test-design', 'raw', 'before', 'seeded-offline-order-capture', 'test-design-epic-7.md'),
    'utf8',
  );
  assert.match(generated, /Description and source evidence/);
  const parsed = readDesign({ kind: 'text', value: generated });
  assert.equal(parsed.ok, true);
  assert.ok(parsed.design.risks.every((risk) => risk.description.length > 0));
  const scored = scoreRun(groundTruth.fixtureSets[0], parsed.design, new Set(groundTruth.riskCategories));
  assert.equal(scored.grounding.matched, 5);
  assert.ok(scored.coverageChecks.every((check) => check.ok));
  assert.equal(scored.flattenedPriorities, true);
  assert.equal(scored.ceiling.excess, 0);
});
test('existing published reports cannot satisfy a fresh incomplete attempt', (t) => {
  const root = project(t);
  const previous = path.join(root, 'published', 'test-design', 'test-design-epic-7.md');
  fs.mkdirSync(path.dirname(previous), { recursive: true });
  fs.writeFileSync(previous, 'previous report');
  const result = execute(root, ['--epic', '7'], 'missing');
  assert.equal(result.status, 3, result.stderr);
  assert.equal(fs.readFileSync(previous, 'utf8'), 'previous report');
});
test('a missing agent is refused before preparing a workflow or allocating evidence', (t) => {
  const root = project(t);
  let prepared = false;
  assert.throws(
    () =>
      runWithEvidence({
        name: 'missing',
        projectRoot: root,
        options: { agent: 'custom', agentCmd: path.join(root, 'absent'), retries: '3' },
        prepare: () => {
          prepared = true;
          return { prompt: 'request' };
        },
        validate: () => {},
      }),
    (error) => error.failureClass === 'environment-configuration',
  );
  assert.equal(prepared, false);
  assert.equal(fs.existsSync(path.join(root, '.tea-runs')), false);
});
test('a supervised timeout keeps partial streams and reports its own failure class', (t) => {
  const root = project(t);
  const stub = path.join(root, 'slow.cjs');
  fs.writeFileSync(stub, "require('fs').readFileSync(0,'utf8');process.stdout.write('partial reply');setInterval(()=>{},1000);");
  let failure;
  try {
    runWithEvidence({
      name: 'timeout',
      projectRoot: root,
      options: { agent: 'custom', agentCmd: process.execPath, agentArg: [stub], retries: '0', timeoutMs: '100' },
      prepare: () => ({ prompt: 'request' }),
      validate: () => {},
    });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure.failureClass, 'environment-timeout');
  assert.equal(fs.readFileSync(path.join(failure.runDir, 'attempt-1', 'stdout.txt'), 'utf8'), 'partial reply');
  const record = JSON.parse(fs.readFileSync(path.join(failure.runDir, 'run.json')));
  assert.equal(record.attempts[0].failureClass, 'environment-timeout');
});

test('eval artifact retention preserves exact bytes and identifies live observation provenance', async (t) => {
  const root = project(t);
  const { retainSkillArtifacts } = require('./lib/retain-skill-artifacts');
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace);
  const raw = Buffer.from([0, 255, 10, 13, 35]);
  fs.writeFileSync(path.join(workspace, 'generated.bin'), raw);
  const destination = await retainSkillArtifacts({
    artifactsDir: path.join(root, 'retained'),
    workspace: { dir: workspace },
    caseId: 'seeded-example',
    agent: 'codex',
    model: 'gpt-5.6-sol',
    repetition: 1,
    attempt: 1,
    prompt: 'Execute the actual skill',
    observation: { stdout: 'raw generated response', stderr: '', exitCode: 0 },
  });
  fs.rmSync(workspace, { recursive: true });
  assert.deepEqual(fs.readFileSync(path.join(destination, 'workspace', 'generated.bin')), raw);
  assert.equal(fs.readFileSync(path.join(destination, 'prompt.txt'), 'utf8'), 'Execute the actual skill');
  assert.equal(JSON.parse(fs.readFileSync(path.join(destination, 'observation.json'), 'utf8')).stdout, 'raw generated response');
  const provenance = JSON.parse(fs.readFileSync(path.join(destination, 'provenance.json'), 'utf8'));
  assert.equal(provenance.mode, 'live');
  assert.equal(provenance.requestedModel, 'gpt-5.6-sol');
  assert.equal(provenance.originalWorkspace, workspace);
});
