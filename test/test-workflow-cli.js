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
/** Create a disposable consuming project with two concrete input documents. */
function project(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-workflow-cli-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'epic.md'), '# Epic 7\n\nA sync job runs once per request.\n');
  fs.writeFileSync(path.join(dir, 'architecture.md'), '# Architecture\n\nOne local queue, one API endpoint.\n');
  return dir;
}
/** Exercise the public executable through a controlled custom agent process. */
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
let plan = '# Test Design\\n\\n## Risk Assessment\\n\\n### Low Risks: Score 1 to 2\\n\\n| Risk ID | Category | Description | Probability | Impact | Score |\\n| --- | --- | --- | --- | --- | --- |\\n| R-001 | DATA | Request handling loses queued input | 1 | 2 | '+(mode === 'bad-score' ? '9' : '2')+' |\\n\\n## Test Coverage Plan\\n\\n### P1\\n\\n| Test ID | Scenario | Test Level | Risk Link |\\n| --- | --- | --- | --- |\\n| T-001 | Keep queued input when sync fails | API | R-001 |\\n';
const sections = ['Executive Summary','Not in Scope','NFR Planning','Entry Criteria','Exit Criteria','Execution Strategy','Resource Estimates','Quality Gate Criteria','Mitigation Plans','Assumptions and Dependencies','Follow-on Workflows','Approval','Interworking & Regression','Appendix','Dependencies & Test Blockers','NFR Test Coverage Plan','QA Effort Estimate','Appendix A: Code Examples & Tagging','Appendix B: Knowledge Base References'];
if(mode !== 'incomplete-plan') plan += sections.filter(h => mode !== 'empty-execution' || h !== 'Execution Strategy').map(h => '\\n## '+h+'\\n\\nExplicit scope, owner, condition and supporting evidence.\\n').join('');
if(mode === 'empty-execution') plan += '\\n## Execution Strategy\\n\\n### Empty child\\n<!-- no content -->\\n';
if(mode === 'misband') plan = plan.replace('| 1 | 2 | 2 |', '| 3 | 3 | 9 |');
if(mode === 'no-priority') plan = plan.replace('### P1', '### Test Cases');
if(mode === 'no-band') plan = plan.replace('Low Risks: Score 1 to 2', 'Low Risks');
const architecture = '# Architecture\\n\\n'+['Executive Summary','Risk Assessment','NFR Testability Requirements','Testability Concerns and Architectural Gaps','Risk Mitigation Plans','Assumptions and Dependencies'].map(h => '## '+h+'\\n\\nExplicit design decision.\\n').join('\\n');
const handoff = '# Handoff\\n\\n'+['Purpose','TEA Artifacts Inventory','Epic-Level Integration Guidance','Story-Level Integration Guidance','Risk-to-Story Mapping','Recommended BMAD → TEA Workflow Sequence','Phase Transition Quality Gates'].map(h => '## '+h+'\\n\\nActionable integration guidance.\\n').join('\\n');
for (const file of files) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, /(?:epic-|qa\\.md$)/.test(file) ? plan : (mode === 'malformed-system' ? '# Incomplete\\n' : file.endsWith('architecture.md') ? architecture : handoff)); }
if (mode !== 'no-checkpoint') {
 const checkpoint = JSON.parse(prompt.match(/Save a completed progress checkpoint at (.*)\\./)[1]);
 fs.writeFileSync(checkpoint, '---\\nrunScope: '+(runKey === 'system' ? 'system' : 'epic')+'\\nrunKey: '+runKey+'\\nworkflowStatus: completed\\ntotalSteps: 5\\nstepsCompleted: [step-01-detect-mode, step-02-load-context, step-03-risk-and-testability, step-04-coverage-plan, step-05-generate-output]\\nlastStep: step-05-generate-output\\nnextStep: ""\\n---\\n# Finished\\n');
}
if(mode === 'wrong-key' || mode === 'wrong-scope') {
 const checkpoint = JSON.parse(prompt.match(/Save a completed progress checkpoint at (.*)\\./)[1]);
 let text = fs.readFileSync(checkpoint,'utf8');
 text = mode === 'wrong-key' ? text.replace('runKey: '+runKey, 'runKey: epic-999') : text.replace('runScope: epic', 'runScope: system');
 fs.writeFileSync(checkpoint,text);
}
if(mode === 'input-mutation') fs.writeFileSync(path.join(process.cwd(),'epic.md'),'# Mutated source input\\n');
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
  assert.throws(() => projectPath(root, '../outside'), /outside/);
  fs.symlinkSync(os.tmpdir(), path.join(root, 'escape'));
  assert.throws(() => projectPath(root, 'escape/output.md'), /outside/);
  fs.symlinkSync(path.join(root, 'missing'), path.join(root, 'dangling'));
  assert.throws(() => projectPath(root, 'dangling/output.md'), /dangling/);
  assert.throws(() => readInput(root, '.'), /regular file/);
});
test('absolute project paths through a filesystem alias resolve inside the canonical root', (t) => {
  const root = project(t);
  const parent = project(t);
  const alias = path.join(parent, 'project-alias');
  fs.symlinkSync(root, alias);
  assert.equal(readInput(root, path.join(alias, 'epic.md')), fs.realpathSync(path.join(root, 'epic.md')));
  assert.equal(projectPath(root, path.join(alias, 'new', 'report.md')), path.join(fs.realpathSync(root), 'new', 'report.md'));
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
  const groundTruth = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'test-design-eval', 'ground-truth.json'), 'utf8'));
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

test('publication refuses direct and symlink input collisions before invoking an agent', (t) => {
  const root = project(t);
  const output = path.join(root, 'published', 'test-design');
  fs.mkdirSync(output, { recursive: true });
  const input = path.join(output, 'test-design-epic-7.md');
  fs.writeFileSync(input, '# Protected requirements\n');
  const direct = execute(root, ['--epic', '7', '--input', input], 'success');
  assert.equal(direct.status, 2, direct.stderr);
  assert.equal(fs.readFileSync(input, 'utf8'), '# Protected requirements\n');
  assert.equal(fs.existsSync(path.join(root, 'captured-prompt.txt')), false);
  fs.unlinkSync(input);
  fs.symlinkSync(path.join(root, 'epic.md'), input);
  const alias = execute(root, ['--epic', '7'], 'success');
  assert.equal(alias.status, 2, alias.stderr);
  assert.equal(fs.existsSync(path.join(root, 'captured-prompt.txt')), false);
});

test('system generation requires populated architecture and handoff sections', (t) => {
  const root = project(t);
  const result = execute(root, ['--scope', 'system', '--input', 'architecture.md'], 'malformed-system');
  assert.equal(result.status, 3, result.stderr);
  assert.equal(fs.existsSync(path.join(root, 'published')), false);
});

test('each probe attempt records its own raw observation or fault before retry', async () => {
  const { captureProbe } = require('./lib/retain-skill-artifacts');
  const recorded = [];
  const fault = Object.assign(new Error('lost first attempt'), { code: 'port-failure', detail: 'raw transport detail' });
  const failed = captureProbe(
    {
      probe: async () => {
        throw fault;
      },
    },
    (value) => recorded.push(value),
  );
  await assert.rejects(failed.probe({}, new AbortController().signal), (error) => error === fault);
  const raw = { kind: 'cli', stdout: 'second exact output', stderr: 'second stderr', exitCode: 0 };
  const success = captureProbe({ probe: async () => raw }, (value) => recorded.push(value));
  assert.equal(await success.probe({}, new AbortController().signal), raw);
  assert.equal(recorded[0].fault.detail, 'raw transport detail');
  assert.equal(recorded[1], raw);
});

test('the observed residual-risk reference table preserves the canonical scored register', () => {
  const { readDesign } = require('../cli/lib/test-design-parser');
  const generated = fs.readFileSync(
    path.join(
      __dirname,
      'results',
      'codex-test-design',
      'raw',
      'public-cli-attempt-1',
      'evidence',
      'attempt-1',
      'artifacts',
      'test-design',
      'test-design-epic-7.md',
    ),
    'utf8',
  );
  const parsed = readDesign({ kind: 'text', value: generated });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.design.risks.length, 6);
  assert.equal(parsed.design.unscoredTables.length, 0);
  const index = generated.indexOf('### Residual Risk');
  assert.ok(index > 0);
  const unknown = generated.slice(0, index) + generated.slice(index).replace('R-006', 'R-999');
  assert.equal(readDesign({ kind: 'text', value: unknown }).design.unscoredTables.length, 1);
});

test('observed empty-band markers describe absence while scored or incomplete rows remain invalid', () => {
  const { readDesign } = require('../cli/lib/test-design-parser');
  const { validateDesign } = require('../cli/test-design');
  const attemptDir = path.join(__dirname, 'results', 'codex-test-design', 'raw', 'public-cli-attempt-2', 'evidence', 'attempt-1');
  const planFile = path.join('artifacts', 'test-design', 'test-design-epic-7.md');
  const checkpointFile = path.join('artifacts', 'test-design', 'test-design-progress-epic-7.md');
  const generated = fs.readFileSync(path.join(attemptDir, planFile), 'utf8');
  assert.equal(readDesign({ kind: 'text', value: generated }).design.risks.length, 6);
  const validated = validateDesign({
    attemptDir,
    artifactFiles: [planFile],
    planFile,
    checkpointFile,
    runKey: 'epic-7',
    runScope: 'epic',
    inputDigests: [],
  });
  assert.equal(validated.riskCount, 6);
  assert.ok(validated.coverageCount > 0);
  const invalidLevel = readDesign({ kind: 'text', value: generated.replace('E2E performance', 'BrowserUnknown') });
  assert.ok(invalidLevel.design.coverage.some((row) => row.level === 'BrowserUnknown'));
  for (const row of [
    '| None | N/A | No evidence-supported risk scored in this band. | 1 | 1 | 1 |',
    '| None | N/A | No evidence-supported risk scored in this band. | 1 |  |  |',
    '| None | DATA | No evidence-supported risk scored in this band. |  |  |  |',
    '| None | N/A | Queued input can be lost. |  |  |  |',
  ]) {
    const changed = generated.replace('| None | N/A | No evidence-supported risk scored in this band. |  |  |  |', row);
    assert.equal(readDesign({ kind: 'text', value: changed }).design.risks.length, 7);
  }
});

test('publication refuses a hardlink onto an input before invoking the agent', (t) => {
  const root = project(t);
  const destination = path.join(root, 'published', 'test-design', 'test-design-epic-7.md');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.linkSync(path.join(root, 'epic.md'), destination);
  const result = execute(root, ['--epic', '7'], 'success');
  assert.equal(result.status, 2, result.stderr);
  assert.equal(fs.existsSync(path.join(root, 'captured-prompt.txt')), false);
  assert.equal(fs.readFileSync(destination, 'utf8'), '# Epic 7\n\nA sync job runs once per request.\n');
});

test('a replacement failure restores old reports and removes newly published files', (t) => {
  const { publishDesign } = require('../cli/test-design');
  for (const preexisting of [true, false]) {
    const root = project(t);
    const outputDir = path.join(root, 'published');
    const destinations = ['one.md', 'two.md'].map((name) => path.join(outputDir, 'test-design', name));
    fs.mkdirSync(path.dirname(destinations[0]), { recursive: true });
    if (preexisting) for (const destination of destinations) fs.writeFileSync(destination, `old ${path.basename(destination)}`);
    const artifacts = destinations.map((destination) => {
      const source = path.join(root, path.basename(destination));
      fs.writeFileSync(source, `new ${path.basename(destination)}`);
      return { path: source };
    });
    const io = Object.create(fs);
    let replacements = 0;
    io.renameSync = (source, target) => {
      if (path.basename(source) === 'next' && ++replacements === 2) throw new Error('simulated second replacement failure');
      fs.renameSync(source, target);
    };
    assert.throws(
      () => publishDesign(artifacts, { projectRoot: root, outputDir, runDir: '/retained/evidence' }, io),
      (error) => error.runDir === '/retained/evidence' && /previous reports restored/.test(error.message),
    );
    for (const destination of destinations) {
      if (preexisting) assert.equal(fs.readFileSync(destination, 'utf8'), `old ${path.basename(destination)}`);
      else assert.equal(fs.existsSync(destination), false);
    }
    assert.deepEqual(
      fs.readdirSync(path.dirname(destinations[0])).filter((name) => name.startsWith('.tea-publish-')),
      [],
    );
  }
});

test('retention failure always cleans the workspace and preserves a preceding run exception', async (t) => {
  const { finishSkillAttempt } = require('./lib/retain-skill-artifacts');
  const original = new Error('original runner failure');
  const retention = new Error('retention disk failure');
  for (const runError of [original, undefined]) {
    const root = project(t);
    const workspace = { dir: path.join(root, 'attempt') };
    fs.mkdirSync(workspace.dir);
    const finish = () =>
      finishSkillAttempt({
        workspace,
        runError,
        retain: async () => {
          throw retention;
        },
      });
    if (runError) {
      await assert.rejects(
        async () => {
          try {
            throw original;
          } finally {
            await finish();
          }
        },
        (error) => error === original,
      );
    } else await assert.rejects(finish, (error) => error === retention);
    assert.equal(fs.existsSync(workspace.dir), false);
  }
});

test('clean-only evaluation preserves absent rates without failing undeclared expectations', () => {
  const { measurementFailures } = require('./eval-test-design');
  const truth = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/test-design-eval/ground-truth.json'), 'utf8'));
  const clean = truth.fixtureSets.find((set) => set.id === 'clean-last-sync-indicator');
  const seeded = truth.fixtureSets.find((set) => set.id === 'seeded-offline-order-capture');
  const original = JSON.parse(fs.readFileSync(path.join(__dirname, 'results/codex-test-design/raw/clean-attempt-3/result.json'), 'utf8'));
  const measurements = original.runners[0].measurements;
  assert.equal(measurements.groundedRiskRecall, null);
  assert.equal(measurements.priorityOrderingAccuracy, null);
  assert.deepEqual(measurementFailures([clean], measurements), []);
  assert.deepEqual(measurementFailures([seeded], measurements), [
    'groundedRiskRecall (unmeasurable)',
    'priorityOrderingAccuracy (unmeasurable)',
    'coverageMappingAccuracy (unmeasurable)',
  ]);
  assert.deepEqual(measurementFailures([clean], { ...measurements, riskPrecision: 0 }), ['riskPrecision']);
});

test('clean fixture selection passes the executable gate with the retained actual report', (t) => {
  const root = project(t);
  const stub = path.join(root, 'replay-agent.cjs');
  const report = path.join(__dirname, 'results/codex-test-design/raw/clean-attempt-3/clean-last-sync-indicator/test-design-epic-9.md');
  fs.writeFileSync(
    stub,
    `
const fs = require('node:fs'), path = require('node:path');
if (process.argv.includes('--version')) { console.log('controlled report replay'); process.exit(0); }
fs.readFileSync(0, 'utf8');
const out = path.join(process.cwd(), 'field-sync-indicator/test-artifacts/test-design/test-design-epic-9.md');
fs.mkdirSync(path.dirname(out), {recursive: true});
fs.copyFileSync(${JSON.stringify(report)}, out);
console.log('retained report replay');
`,
  );
  const resultPath = path.join(root, 'result.json');
  const result = spawnSync(
    process.execPath,
    [
      path.join(__dirname, 'eval-test-design.js'),
      '--agent',
      'custom',
      '--agent-cmd',
      process.execPath,
      '--agent-arg',
      stub,
      '--set',
      'clean-last-sync-indicator',
      '--runs',
      '1',
      '--json',
      resultPath,
    ],
    { encoding: 'utf8', timeout: 30_000 },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const payload = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  assert.equal(payload.runners[0].measurements.groundedRiskRecall, null);
  assert.deepEqual(payload.runners[0].failures, []);
  const { validateEvalResult } = require('./schema/eval-result');
  assert.equal(validateEvalResult(payload).success, true);
  for (const mutation of ['positive-expectation', 'missing-expectation', 'nonzero-numerator']) {
    const changed = structuredClone(payload);
    const contribution = changed.runners[0].diagnostics[0].metricContributions;
    if (mutation === 'positive-expectation') contribution['groundedRiskRecall.expected'] = 1;
    if (mutation === 'missing-expectation') delete contribution['groundedRiskRecall.expected'];
    if (mutation === 'nonzero-numerator') contribution['groundedRiskRecall.numerator'] = 1;
    assert.equal(validateEvalResult(changed).success, false, mutation);
  }
});

test('full plan publication rejects incomplete sections, contradictory bands and unprioritized coverage', (t) => {
  for (const mode of ['incomplete-plan', 'empty-execution', 'misband', 'no-band', 'no-priority']) {
    const root = project(t);
    const result = execute(root, ['--epic', '7'], mode);
    assert.equal(result.status, 3, mode + result.stderr);
    assert.equal(fs.existsSync(path.join(root, 'published')), false, mode);
  }
});

test('the final actual public CLI plan satisfies full section, band and priority guards unchanged', () => {
  const { validateDesign } = require('../cli/test-design');
  const attemptDir = path.join(__dirname, 'results/codex-test-design/raw/public-cli-attempt-3/evidence/attempt-1');
  const planFile = 'artifacts/test-design/test-design-epic-7.md';
  const result = validateDesign({
    attemptDir,
    artifactFiles: [planFile],
    planFile,
    checkpointFile: 'artifacts/test-design/test-design-progress-epic-7.md',
    runKey: 'epic-7',
    runScope: 'epic',
    inputDigests: [],
  });
  assert.equal(result.riskCount, 5);
  assert.equal(result.coverageCount, 26);
});

for (const mode of ['wrong-key', 'wrong-scope', 'input-mutation']) {
  test(`public CLI rejects ${mode} and retains previous reports and fresh failure evidence`, (t) => {
    const root = project(t);
    const output = path.join(root, 'published/test-design');
    fs.mkdirSync(output, { recursive: true });
    const names = ['test-design-epic-7.md', 'test-design-progress-epic-7.md'];
    for (const name of names) fs.writeFileSync(path.join(output, name), `preserved ${name}`);
    const result = execute(root, ['--epic', '7'], mode);
    assert.equal(result.status, 3, mode + result.stderr);
    const evidence = result.stderr.match(/; evidence: (.+)/)?.[1];
    assert.ok(evidence, result.stderr);
    assert.ok(fs.existsSync(path.join(evidence, 'attempt-1/stdout.txt')));
    assert.ok(fs.existsSync(path.join(evidence, 'attempt-1/artifacts/test-design/test-design-epic-7.md')));
    for (const name of names) assert.equal(fs.readFileSync(path.join(output, name), 'utf8'), `preserved ${name}`);
    assert.match(result.stderr, mode === 'input-mutation' ? /changed an input/ : /does not confirm completion/);
  });
}
