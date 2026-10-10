'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { publishArtifacts, protectSources } = require('../cli/lib/workflow-publication');
const cli = path.join(__dirname, '..', 'cli', 'nfr.js');
const { readNativeArchive, stageNativeCase, sha256Hex } = require('./lib/nfr-native-archive');
/** A consuming project supplies requirements, implementation and actual measured evidence. */
function project(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-nfr-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.mkdirSync(path.join(dir, 'evidence'));
  fs.writeFileSync(
    path.join(dir, 'requirements.md'),
    '# Requirements\nSecurity target: TLS 1.3.\nPerformance target: p95 below 300 ms.\nReliability target: uptime 99.9%.\nMaintainability target: coverage 80%.\nDeployability target: deployment under 5 minutes.\n',
  );
  fs.writeFileSync(path.join(dir, 'src', 'service.js'), 'module.exports = { implemented: true };\n');
  fs.writeFileSync(path.join(dir, 'evidence', 'measured.txt'), 'TLS 1.3\np95 200 ms\nuptime 99.99%\ncoverage 90%\n');
  return fs.realpathSync(dir);
}
/** Invoke the public binary with a separate custom-agent process. */
function execute(root, mode = 'pass', args = []) {
  const agent = path.join(root, 'agent.cjs');
  fs.writeFileSync(
    agent,
    `const fs=require('node:fs'),path=require('node:path');const prompt=fs.readFileSync(0,'utf8');const mode=process.argv[2];if(mode==='transport'){process.stdout.write('partial raw');process.stderr.write('vendor failed');process.exit(1);}if(mode==='timeout'){setTimeout(()=>{},5000);return;}if(mode==='missing'){process.stdout.write('done');process.exit(0);}const audit=require(${JSON.stringify(path.join(__dirname, 'lib', 'nfr-cli-fixture'))}).buildAudit(prompt,mode);fs.mkdirSync(path.dirname(audit.reportPath),{recursive:true});fs.writeFileSync(audit.reportPath,audit.report);fs.writeFileSync(audit.contextPath,JSON.stringify(audit.context));if(mode==='input-mutation')fs.writeFileSync('requirements.md','mutated');if(mode==='directory-mutation')fs.writeFileSync('src/new.js','added');if(mode==='source-chmod')fs.chmodSync('src/service.js',0o755);if(mode==='directory-chmod')fs.chmodSync('src',0o700);if(mode==='hardlink-report'){fs.unlinkSync(audit.reportPath);fs.linkSync('requirements.md',audit.reportPath);}process.stdout.write('raw vendor output');process.stderr.write('raw diagnostic');`,
  );
  return spawnSync(
    process.execPath,
    [
      cli,
      '--project-root',
      root,
      '--input',
      'requirements.md',
      '--implementation',
      'src',
      '--evidence',
      'evidence',
      '--output-dir',
      'published',
      ...(mode === 'none'
        ? ['--agent', 'none']
        : ['--agent', 'custom', '--agent-cmd', process.execPath, '--agent-arg', agent, '--agent-arg', mode]),
      ...args,
    ],
    { encoding: 'utf8', timeout: 15_000 },
  );
}
test('public CLI publishes a completed actual-shaped report and context with raw streams', (t) => {
  const root = project(t),
    run = execute(root);
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.status, 'PASS');
  assert.equal(result.mode, 'live');
  assert.equal(fs.existsSync(result.report), true);
  assert.equal(fs.existsSync(result.context), true);
  assert.equal(fs.readFileSync(path.join(result.evidence, 'attempt-1', 'stdout.txt'), 'utf8'), 'raw vendor output');
  assert.equal(fs.readFileSync(path.join(result.evidence, 'attempt-1', 'stderr.txt'), 'utf8'), 'raw diagnostic');
});
test('native worker checkpoint entries and bullet fields preserve a legitimate completed audit', (t) => {
  const run = execute(project(t), 'native-checkpoint');
  assert.equal(run.status, 0, run.stderr);
});
test('recorded-only declarations remain visible outside the four-domain gate', (t) => {
  const run = execute(project(t), 'recorded');
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).status, 'PASS');
});
for (const [mode, args, expected] of [
  ['fail', [], 1],
  ['fail', ['--fail-on', 'none'], 0],
  ['unknown', [], 1],
  ['unknown', ['--fail-on', 'fail'], 0],
  ['na', [], 0],
]) {
  test(`public gate ${mode} with ${args.join(' ')} returns ${expected}`, (t) => {
    const run = execute(project(t), mode, args);
    assert.equal(run.status, expected, run.stderr);
    assert.equal(fs.existsSync(JSON.parse(run.stdout).report), true);
  });
}
for (const mode of [
  'wrong-key',
  'wrong-scope',
  'wrong-request',
  'missing-criterion',
  'extra-criterion',
  'wrong-rollup',
  'wrong-threshold',
  'invented-support',
  'requirements-evidence',
  'missing-progress',
  'duplicate-domain',
  'missing-section',
  'unknown-pass',
  'input-mutation',
  'directory-mutation',
  'hardlink-report',
  'missing',
  'recorded-status',
  'recorded-gate',
]) {
  test(`public CLI refuses ${mode} and preserves previous publication`, (t) => {
    const root = project(t);
    fs.mkdirSync(path.join(root, 'published', 'nfr'), { recursive: true });
    const previous = path.join(root, 'published', 'nfr', 'nfr-assessment-system.md');
    fs.writeFileSync(previous, 'previous reviewed report');
    const run = execute(root, mode);
    assert.equal(run.status, 3, run.stderr);
    assert.equal(fs.readFileSync(previous, 'utf8'), 'previous reviewed report');
    assert.match(run.stderr, /evidence:/);
  });
}
test('source collisions include full path, symlink, hardlink and protected directory descendants', (t) => {
  for (const mode of ['direct', 'symlink', 'hardlink', 'directory']) {
    const root = project(t);
    const output = path.join(root, 'published', 'nfr');
    fs.mkdirSync(output, { recursive: true });
    const target = path.join(output, 'nfr-assessment-system.md');
    if (mode === 'symlink') fs.symlinkSync(path.join(root, 'requirements.md'), target);
    if (mode === 'hardlink') fs.linkSync(path.join(root, 'requirements.md'), target);
    if (mode === 'direct') fs.copyFileSync(path.join(root, 'requirements.md'), target);
    const args = mode === 'directory' ? ['--output-dir', 'src'] : mode === 'direct' ? ['--input', target] : [];
    const run = execute(root, 'pass', args);
    assert.equal(run.status, 2, `${mode}: ${run.stderr}`);
    assert.equal(fs.readFileSync(path.join(root, 'requirements.md'), 'utf8').startsWith('# Requirements'), true);
    assert.equal(fs.existsSync(path.join(root, '.tea-runs')), false);
  }
});
test('evidence run directory may not overlap supplied sources', (t) => {
  const root = project(t),
    run = execute(root, 'none', ['--evidence-dir', 'evidence']);
  assert.equal(run.status, 2, run.stderr);
});
test('non-string configured artifact root fails clearly before invoking an agent', (t) => {
  const root = project(t);
  fs.mkdirSync(path.join(root, '_bmad'));
  fs.writeFileSync(path.join(root, '_bmad', 'config.toml'), '[modules.tea]\ntest_artifacts = 42\n');
  const before = fs.readFileSync(path.join(root, 'requirements.md'), 'utf8');
  const marker = path.join(root, 'invoked');
  const agent = path.join(root, 'marker.cjs');
  fs.writeFileSync(agent, `require('node:fs').writeFileSync(${JSON.stringify(marker)},'invoked');`);
  const run = spawnSync(
    process.execPath,
    [
      cli,
      '--project-root',
      root,
      '--input',
      'requirements.md',
      '--implementation',
      'src',
      '--evidence',
      'evidence',
      '--agent',
      'custom',
      '--agent-cmd',
      process.execPath,
      '--agent-arg',
      agent,
    ],
    { encoding: 'utf8', timeout: 15_000 },
  );
  assert.equal(run.status, 2, run.stderr);
  assert.match(run.stderr, /test_artifacts must be a nonempty string/);
  assert.equal(fs.existsSync(marker), false);
  assert.equal(fs.existsSync(path.join(root, '.tea-runs')), false);
  assert.equal(fs.readFileSync(path.join(root, 'requirements.md'), 'utf8'), before);
});
test('prompt-only mode activates NFR namespace with exact input roles and scope', (t) => {
  const root = project(t);
  fs.mkdirSync(path.join(root, '_bmad', 'custom'), { recursive: true });
  fs.writeFileSync(path.join(root, '_bmad', 'custom', 'bmad-testarch-nfr.toml'), '[workflow]\npersistent_facts=["NFR policy"]\n');
  const run = execute(root, 'none', ['--scope', 'story', '--scope-id', '12-3']);
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout),
    prompt = fs.readFileSync(result.prompt, 'utf8');
  assert.equal(result.mode, 'prompt-only');
  assert.match(prompt, /NFR policy/);
  assert.match(prompt, /run_key=story-12-3/);
  assert.match(prompt, /Existing implementation evidence is exactly/);
  assert.equal(fs.existsSync(path.join(root, 'published')), false);
});
test('default vendor failure retains one attempt with no implicit retry', (t) => {
  const root = project(t),
    run = execute(root, 'transport');
  assert.equal(run.status, 3, run.stderr);
  const runDir = path.join(root, '.tea-runs', fs.readdirSync(path.join(root, '.tea-runs'))[0]);
  const record = JSON.parse(fs.readFileSync(path.join(runDir, 'run.json')));
  assert.equal(record.attempts.length, 1);
  assert.equal(fs.readFileSync(path.join(runDir, 'attempt-1', 'stdout.txt'), 'utf8'), 'partial raw');
});
test('explicit retry retains each failed attempt and timeout retains evidence', (t) => {
  const root = project(t),
    run = execute(root, 'transport', ['--retries', '1']);
  assert.equal(run.status, 3);
  const runDir = path.join(root, '.tea-runs', fs.readdirSync(path.join(root, '.tea-runs'))[0]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(runDir, 'run.json'))).attempts.length, 2);
  assert.equal(fs.readFileSync(path.join(runDir, 'attempt-2', 'stderr.txt'), 'utf8'), 'vendor failed');
  const timeout = execute(project(t), 'timeout', ['--timeout-ms', '100']);
  assert.equal(timeout.status, 3, timeout.stderr);
  assert.match(timeout.stderr, /timeout|timed out/i);
});
test('later publication failure restores both previous files', (t) => {
  const root = project(t),
    protection = protectSources(root, ['requirements.md']);
  const artifacts = ['a', 'b'].map((name) => {
    const file = path.join(root, name + '.new'),
      destination = path.join(root, name + '.md');
    fs.writeFileSync(file, 'new ' + name);
    fs.writeFileSync(destination, 'old ' + name);
    return { path: file, destination };
  });
  let installs = 0;
  const io = {
    ...fs,
    renameSync(from, to) {
      if (from.endsWith('/next') && ++installs === 2) throw new Error('disk failure');
      return fs.renameSync(from, to);
    },
  };
  assert.throws(
    () => publishArtifacts(artifacts, { projectRoot: root, runDir: 'retained-run', protection }, io),
    /previous artifacts restored/,
  );
  for (const artifact of artifacts) assert.match(fs.readFileSync(artifact.destination, 'utf8'), /^old /);
});
test('single live harness repetition remains unrepeated and retains exact observations', (t) => {
  const root = project(t),
    agent = path.join(root, 'replay-agent.cjs'),
    harness = path.join(__dirname, 'eval-nfr.js');
  const replayRoot = path.join(__dirname, 'replay', 'nfr');
  fs.writeFileSync(
    agent,
    `const fs=require('node:fs'),path=require('node:path');fs.readFileSync(0,'utf8');const projects=fs.readdirSync('.').filter(p=>fs.statSync(p).isDirectory()&&p!=='skill'&&p!=='tea');const project=projects.find(p=>fs.existsSync(path.join(p,'docs','tech-spec.md')));if(!project)throw new Error('project absent');const type=project.startsWith('atlas')?'clean-correct-audit':'gapped-correct-audit';const destination=path.join(project,'test-artifacts','nfr','nfr-assessment-system.md');fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(path.join(${JSON.stringify(replayRoot)},type,'test-artifacts','nfr','nfr-assessment-system.md'),destination);process.stdout.write('raw replay agent output');`,
  );
  const resultPath = path.join(root, 'result.json'),
    artifacts = path.join(root, 'retained');
  const run = spawnSync(
    process.execPath,
    [
      harness,
      '--agent',
      'custom',
      '--agent-cmd',
      process.execPath,
      '--agent-arg',
      agent,
      '--runs',
      '1',
      '--json',
      resultPath,
      '--artifacts-dir',
      artifacts,
    ],
    { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 30_000 },
  );
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /unrepeated/);
  assert.doesNotMatch(run.stdout, /(?:, |\s)stable(?:\s|$)/);
  const result = JSON.parse(fs.readFileSync(resultPath));
  assert.equal(result.runners[0].measurements.unstableCases, null);
  const captured = fs.readdirSync(artifacts);
  assert.equal(captured.length, 2);
  for (const dir of captured) {
    const observation = fs.readFileSync(path.join(artifacts, dir, 'observation.json'), 'utf8');
    assert.match(observation, /raw replay agent output/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(artifacts, dir, 'provenance.json'))).attempt, 1);
  }
});
test('clean corpus transport evidence matches its declared TLS requirement', () => {
  const requirements = fs.readFileSync(path.join(__dirname, 'fixtures', 'nfr-eval', 'clean', 'docs', 'tech-spec.md'), 'utf8');
  const evidence = fs.readFileSync(
    path.join(__dirname, 'fixtures', 'nfr-eval', 'clean', 'evidence', 'security-review-2026-09-01.md'),
    'utf8',
  );
  assert.match(requirements, /TLS 1\.3/);
  assert.match(evidence, /TLS 1\.3[^\n]*outbound|outbound[^\n]*TLS 1\.3/);
  assert.doesNotMatch(evidence, /TLS 1\.2/);
});

for (const mode of ['source-chmod', 'directory-chmod', 'tilde-example']) {
  test(`second cold review regression refuses ${mode}`, (t) => {
    const root = project(t);
    const previous = path.join(root, 'published', 'nfr', 'nfr-assessment-system.md');
    fs.mkdirSync(path.dirname(previous), { recursive: true });
    fs.writeFileSync(previous, 'previous accepted report');
    const run = execute(root, mode);
    assert.equal(run.status, 3, run.stderr);
    assert.equal(fs.readFileSync(previous, 'utf8'), 'previous accepted report');
  });
}
test('native approved PASS decoration remains the canonical enum', (t) => {
  const run = execute(project(t), 'decorated-pass');
  assert.equal(run.status, 0, run.stderr);
});
for (const [mode, status] of [
  ['decorated-concerns', 1],
  ['decorated-fail', 1],
  ['decorated-na', 0],
  ['recorded-display-case', 0],
  ['tilde-yaml', 0],
  ['inline-actual', 0],
  ['fenced-actual', 0],
  ['multiple-fenced-actual', 0],
  ['unknown-gap-display', 1],
]) {
  test(`approved native display ${mode} preserves its gate`, (t) => {
    const run = execute(project(t), mode);
    assert.equal(run.status, status, run.stderr);
  });
}
for (const mode of [
  'ambiguous-status',
  'wrong-status-glyph',
  'extra-status-decoration',
  'prefix-status',
  'recorded-wrong-category',
  'long-tilde-example',
  'long-backtick-example',
  'invented-second-actual',
  'empty-fenced-actual',
  'literal-status',
  'unknown-gap-invalid',
]) {
  test(`ambiguous display or literal example ${mode} remains rejected`, (t) => {
    const run = execute(project(t), mode);
    assert.equal(run.status, 3, run.stderr);
  });
}

test('actual Codex public failures retain their original byte pins and exit codes', () => {
  const { manifest, files } = readNativeArchive();
  assert.equal(manifest.completedCalls, 2);
  for (const type of ['clean', 'gapped']) {
    const result = JSON.parse(files.get(type + '-result.json'));
    assert.equal(result.status, 3);
    assert.deepEqual(result.changedInputs, []);
    assert.match(files.get(type + '-stderr.txt').toString(), /tea-nfr:/);
  }
});
test('retained parser replay bytes distinguish original failures from controlled repair observations', () => {
  const directory = path.join(__dirname, 'results', 'codex-nfr', 'parser-replay');
  const manifestBytes = fs.readFileSync(path.join(directory, 'manifest.json'));
  assert.equal(sha256Hex(manifestBytes), '8e15f65de609c3a2ed16a5a7467a0f386e5fc1efd85c77df293bb4d9fc65419b');
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.generatedByModel, false);
  assert.equal(manifest.sourceCommit, '1debdc1112ef51a7adf4ba7c956e3bfe0c3db9da');
  assert.deepEqual(manifest.originalNativeExits, [3, 3]);
  assert.deepEqual(manifest.originalParserReplayExits, [3, 3]);
  assert.deepEqual(manifest.repairedParserReplayExits, [0, 1]);
  assert.equal(manifest.stability, 'unmeasured');
  assert.equal(manifest.files.length, 40);
  for (const entry of manifest.files) {
    const bytes = fs.readFileSync(path.join(directory, entry.path));
    assert.equal(bytes.length, entry.bytes);
    assert.equal(sha256Hex(bytes), entry.sha256);
  }
  const { files } = readNativeArchive();
  for (const type of ['clean', 'gapped']) {
    const nativeReport = [...files.entries()].find(
      ([name]) => name.startsWith(type + '/') && name.endsWith('/nfr-assessment-system.md'),
    )[1];
    for (const phase of ['original-parser', 'repaired-parser']) {
      const root = path.join(directory, `${phase}-${type}`);
      const proof = JSON.parse(fs.readFileSync(path.join(root, 'provenance.json')));
      assert.equal(proof.kind, 'controlled-parser-replay');
      assert.equal(proof.generatedByModel, false);
      assert.equal(proof.originalNativeExit, 3);
      assert.equal(proof.exitCode, phase === 'original-parser' ? 3 : type === 'clean' ? 0 : 1);
      assert.deepEqual(proof.changedInputs, []);
      assert.deepEqual(proof.adaptedContextFields, ['requestId', 'supplied_project_root']);
      assert.equal(sha256Hex(fs.readFileSync(path.join(root, 'nfr-assessment-system.md'))), sha256Hex(nativeReport));
    }
  }
});
for (const [type, expectedExit, expectedStatus] of [
  ['clean', 0, 'PASS'],
  ['gapped', 1, 'FAIL'],
]) {
  test(`unchanged actual ${type} report passes controlled parser replay with gate ${expectedStatus}`, (t) => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tea-nfr-native-replay-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    stageNativeCase(root, type);
    const source = path.join(root, 'original-native');
    const originalReport = fs.readFileSync(path.join(source, 'nfr-assessment-system.md'));
    const run = spawnSync(
      process.execPath,
      [
        cli,
        '--project-root',
        root,
        '--input',
        'docs/tech-spec.md',
        '--implementation',
        'config/logging.json',
        '--evidence',
        'evidence',
        '--evidence',
        'config/logging.json',
        '--output-dir',
        'published',
        '--agent',
        'custom',
        '--agent-cmd',
        process.execPath,
        '--agent-arg',
        path.join(__dirname, 'lib', 'nfr-native-replay-agent.js'),
        '--agent-arg',
        source,
      ],
      { encoding: 'utf8', timeout: 15_000 },
    );
    assert.equal(run.status, expectedExit, run.stderr);
    const result = JSON.parse(run.stdout);
    assert.equal(result.status, expectedStatus);
    assert.equal(sha256Hex(fs.readFileSync(result.report)), sha256Hex(originalReport));
    const originalContext = JSON.parse(fs.readFileSync(path.join(source, 'nfr-context-system.json')));
    const context = JSON.parse(fs.readFileSync(result.context));
    for (const field of ['requestId', 'supplied_project_root']) {
      delete context[field];
      delete originalContext[field];
    }
    assert.deepEqual(context, originalContext);
    assert.match(fs.readFileSync(path.join(result.evidence, 'attempt-1', 'stdout.txt'), 'utf8'), /Controlled parser replay/);
  });
}
