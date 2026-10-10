'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const { tracePaths, validateTraceOutputs, publishTraceOutputs } = require('../cli/lib/trace-command');

const cli = path.join(__dirname, '..', 'cli', 'trace.js');
const agent = path.join(__dirname, 'fixtures', 'trace-cli-agent.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-trace-cli-'));
let checks = 0;

function run(mode, extra = [], project = root) {
  const result = spawnSync(
    process.execPath,
    [
      cli,
      '--project-root',
      project,
      '--target',
      'docs/epic-4-export.md',
      '--agent',
      'custom',
      '--agent-cmd',
      process.execPath,
      '--agent-arg',
      agent,
      '--env-pass',
      'TEA_TRACE_TEST_STUB_MODE',
      '--retries',
      '0',
      ...extra,
    ],
    {
      encoding: 'utf8',
      timeout: 30_000,
      env: { ...process.env, TEA_TRACE_TEST_STUB_MODE: mode },
    },
  );
  assert.equal(result.signal, null, result.stderr);
  return { ...result, payload: JSON.parse(result.stdout) };
}

function check(name, action) {
  action();
  checks++;
  process.stdout.write(`✓ ${name}\n`);
}

try {
  fs.mkdirSync(path.join(root, 'docs'));
  fs.mkdirSync(path.join(root, 'tests'));
  fs.mkdirSync(path.join(root, '_bmad', 'custom'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'epic-4-export.md'), '# Epic 4: Export\n\nAC-1: Admin may export.\n');
  fs.writeFileSync(
    path.join(root, '_bmad', 'config.toml'),
    '[core]\nuser_name = "CLI tester"\n[modules.tea]\ntest_artifacts = "artifacts"\n',
  );
  fs.writeFileSync(
    path.join(root, '_bmad', 'custom', 'bmad-testarch-trace.toml'),
    '[workflow]\npersistent_facts = ["trace policy applies"]\n',
  );

  check('packaged skill, resolved config, scope-specific artifacts, raw evidence', () => {
    const result = run('pass', ['--json', 'result.json']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.payload.gate_status, 'PASS');
    assert.equal(result.payload.run_key, 'epic-4');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'result.json'), 'utf8')), result.payload);
    const prompt = fs.readFileSync(path.join(result.payload.evidence, 'attempt-1', 'prompt.txt'), 'utf8');
    assert.match(prompt, /bmad-testarch-trace\/SKILL.md/);
    assert.match(prompt, /CLI tester/);
    assert.match(prompt, /trace policy applies/);
    assert.match(prompt, /artifacts\/live-verification-results.json/);
    assert.match(prompt, /artifacts\/gate-waivers.md/);
    assert.match(fs.readFileSync(path.join(result.payload.evidence, 'attempt-1', 'stdout.txt'), 'utf8'), /trace fixture agent completed/);
    const summary = JSON.parse(fs.readFileSync(result.payload.artifacts.summary, 'utf8'));
    assert.equal(summary.links.trace_report_path, result.payload.artifacts.matrix);
  });
  check('computed FAIL exits 1 and remains reviewable', () => {
    const result = run('gap');
    assert.equal(result.status, 1);
    assert.equal(result.payload.gate_status, 'FAIL');
    assert.ok(fs.existsSync(result.payload.artifacts.gate));
  });
  check('CONCERNS enforcement is explicit', () => {
    assert.equal(run('concerns').status, 0);
    assert.equal(run('concerns', ['--fail-on', 'concerns']).status, 1);
  });
  check('no-gate removes the previous scope gate and omits its signal', () => {
    const result = run('pass', ['--no-gate']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.payload.gate_status, null);
    assert.equal(result.payload.artifacts.gate, null);
    assert.ok(!fs.existsSync(path.join(root, 'artifacts', 'trace', 'gate-decision-epic-4.json')));
  });
  check('inventory-only emits coverage without a computed gate', () => {
    const result = run('pass', ['--collection-mode', 'inventory_only']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.payload.collection_status, 'COLLECTED');
    assert.equal(result.payload.gate_status, null);
  });
  check('runtime-manifest accepts a project with no static tests', () => {
    const result = run('pass', ['--test-dir', 'missing-tests', '--collection-mode', 'runtime_manifest']);
    assert.equal(result.status, 0, result.stderr);
  });
  check('story, release, hotfix, and system identities match the skill contract', () => {
    const documents = [
      ['1-2-user auth.md', '# Story 1.2: User auth\n', 'story-1-2-user auth', '1.2'],
      ['release.md', '# Release 2.4.0\n', 'release-2-4-0', '2.4.0'],
      ['hotfix.md', '# Hotfix HF-7\n', 'hotfix-hf-7', 'HF-7'],
      ['requirements.md', '```markdown\n# Story 99.1: Example\n```\n\n# Epic 4: Actual scope\n', 'epic-4', '4'],
    ];
    for (const [file, content, key, id] of documents) {
      fs.writeFileSync(path.join(root, 'docs', file), content);
      const result = run('pass', ['--target', `docs/${file}`]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.payload.run_key, key);
      const summary = JSON.parse(fs.readFileSync(result.payload.artifacts.summary, 'utf8'));
      assert.equal(summary.target.id, id);
    }
    const system = run('pass', ['--target', '']);
    assert.equal(system.status, 0, system.stderr);
    assert.equal(system.payload.run_key, 'system');
  });
  check('non-collecting modes preserve their status and omit gate signals', () => {
    for (const [mode, status] of Object.entries({
      waived: 'WAIVED',
      restricted: 'RESTRICTED',
      inaccessible: 'INACCESSIBLE',
      deferred_shared: 'DEFERRED_SHARED',
    })) {
      const result = run('pass', ['--collection-mode', mode]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.payload.collection_status, status);
      assert.equal(result.payload.gate_status, null);
    }
  });
  check('malformed, missing, incomplete, wrong-target, and contradictory artifacts fail', () => {
    for (const mode of [
      'bad-arithmetic',
      'missing-summary',
      'missing-gate',
      'incomplete',
      'wrong-target',
      'contradictory-gate',
      'bad-confidence',
      'bad-collection',
      'automated-waiver',
      'missing-criteria',
      'contradictory-percent',
      'wrong-priority-total',
      'wrong-priority-covered',
      'wrong-verdict',
      'wrong-threshold',
      'ignored-confidence',
      'ignored-live-only',
      'missing-live-only',
      'ignored-synthetic-basis',
      'contradictory-critical-gaps',
      'matrix-contradiction',
      'matrix-missing-priority',
      'matrix-duplicate',
    ]) {
      const result = run(mode);
      assert.equal(result.status, 3, `${mode}: ${result.stderr}`);
      assert.equal(result.payload.status, 'failed');
      assert.ok(result.payload.evidence);
      assert.ok(!fs.existsSync(path.join(root, 'artifacts', 'trace', 'e2e-trace-summary-epic-4.json')), mode);
    }
  });
  check('attempt artifacts cannot import stale symlinks or hardlinked evidence', () => {
    for (const mode of ['attempt-outside-link', 'attempt-stale-link', 'attempt-hardlink']) {
      const result = run(mode);
      assert.equal(result.status, 3, `${mode}: ${result.stderr}`);
      assert.ok(result.payload.evidence);
      assert.ok(!fs.existsSync(path.join(root, 'artifacts', 'trace', 'traceability-matrix-epic-4.md')));
    }
    fs.unlinkSync(`${root}-old-matrix.md`);
  });
  check('late destination directories preserve current failure evidence without partial publication', () => {
    const result = run('partial-publication');
    assert.equal(result.status, 2, result.stderr);
    assert.ok(result.payload.evidence);
    assert.ok(!fs.existsSync(path.join(root, 'artifacts', 'trace', 'traceability-matrix-epic-4.md')));
    fs.rmdirSync(path.join(root, 'artifacts', 'trace', 'e2e-trace-summary-epic-4.json'));
  });
  check('publication rolls back a failed second installation and retains recovery copies if rollback fails', () => {
    const directory = path.join(root, 'transaction');
    fs.mkdirSync(directory);
    const destinations = tracePaths(directory, 'epic-4');
    fs.mkdirSync(path.dirname(destinations.matrix));
    const value = { matrix: 'new matrix', summary: { links: {} }, gate: null };
    const old = new Map(Object.values(destinations).map((file) => [file, `original ${path.basename(file)}`]));
    for (const [file, bytes] of old) fs.writeFileSync(file, bytes);
    const io = {
      ...fs,
      renameSync(source, target) {
        if (target === destinations.summary && path.basename(source) === 'next') throw new Error('simulated second installation failure');
        return fs.renameSync(source, target);
      },
    };
    assert.throws(() => publishTraceOutputs(value, destinations, io), /previous reports restored/);
    for (const [file, bytes] of old) assert.equal(fs.readFileSync(file, 'utf8'), bytes);
    assert.ok(!fs.readdirSync(path.dirname(destinations.matrix)).some((name) => name.startsWith('.tea-trace-publish-')));
    const brokenRollback = {
      ...io,
      renameSync(source, target) {
        if (path.basename(source) === 'previous') throw new Error('simulated rollback failure');
        return io.renameSync(source, target);
      },
    };
    assert.throws(() => publishTraceOutputs(value, destinations, brokenRollback), /recovery backups retained.*rollback failures/);
    const retained = fs.readdirSync(path.dirname(destinations.matrix)).filter((name) => name.startsWith('.tea-trace-publish-'));
    assert.ok(retained.some((name) => fs.existsSync(path.join(path.dirname(destinations.matrix), name, 'previous'))));
  });
  check('transport retry uses a fresh directory and preserves the failed attempt', () => {
    fs.unlinkSync(path.join(root, 'agent-attempts.json'));
    const result = run('retry', ['--retries', '1']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.payload.attempts, 2);
    const first = path.join(result.payload.evidence, 'attempt-1', 'trace', 'e2e-trace-summary-epic-4.json');
    assert.deepEqual(JSON.parse(fs.readFileSync(first, 'utf8')), { stale: true });
    assert.equal(JSON.parse(fs.readFileSync(result.payload.artifacts.summary, 'utf8')).gate_status, 'PASS');
  });
  check('failed agent cannot publish a previous success', () => {
    assert.equal(run('pass').status, 0);
    const result = run('fail-agent', ['--json', 'result.json']);
    assert.equal(result.status, 3);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'result.json'), 'utf8')).status, 'failed');
    assert.ok(!fs.existsSync(path.join(root, 'artifacts', 'trace', 'e2e-trace-summary-epic-4.json')));
  });
  check('invalid config and target fail before an agent call', () => {
    const before = fs.readFileSync(path.join(root, 'agent-attempts.json'), 'utf8');
    for (const args of [
      ['--target', 'missing.md'],
      ['--collection-mode', 'guess'],
      ['--gate-type', 'guess'],
      ['--retries', '-1'],
      ['--output-dir', '../outside'],
    ])
      assert.equal(run('pass', args).status, 2);
    assert.equal(fs.readFileSync(path.join(root, 'agent-attempts.json'), 'utf8'), before);
  });
  check('absolute temporary-project inputs resolve through their canonical ancestors', () => {
    const target = path.join(root, 'docs', 'epic-4-export.md');
    const result = run('pass', ['--target', target]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.payload.run_key, 'epic-4');
  });
  check('artifact descendants and aliased inputs remain intact before agent execution', () => {
    const beforeCalls = fs.readFileSync(path.join(root, 'agent-attempts.json'), 'utf8');
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-trace-external-'));
    const artifactRoot = path.join(root, 'aliased-artifacts');
    fs.mkdirSync(artifactRoot);
    const externalSummary = path.join(outside, 'e2e-trace-summary-epic-4.json');
    fs.writeFileSync(externalSummary, 'keep external evidence');
    fs.symlinkSync(outside, path.join(artifactRoot, 'trace'), process.platform === 'win32' ? 'junction' : 'dir');
    try {
      const result = run('pass', ['--output-dir', 'aliased-artifacts']);
      assert.equal(result.status, 2, result.stderr);
      assert.equal(fs.readFileSync(externalSummary, 'utf8'), 'keep external evidence');
      assert.equal(fs.readFileSync(path.join(root, 'agent-attempts.json'), 'utf8'), beforeCalls);
    } finally {
      fs.rmSync(artifactRoot, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
    const directory = path.join(root, 'input-artifacts', 'trace');
    fs.mkdirSync(directory, { recursive: true });
    for (const [flag, file, contents] of [
      ['--target', 'traceability-matrix-epic-4.md', '# Epic 4: Original requirements\n\nAC-1: Preserve this source.\n'],
      ['--live-results', 'e2e-trace-summary-epic-4.json', '{"original":"live input"}'],
      ['--waiver-register', 'gate-decision-epic-4.json', 'Original waiver input'],
    ]) {
      const relative = path.join('input-artifacts', 'trace', file);
      fs.writeFileSync(path.join(root, relative), contents);
      assert.equal(run('pass', ['--output-dir', 'input-artifacts', flag, relative]).status, 2);
      assert.equal(fs.readFileSync(path.join(root, relative), 'utf8'), contents);
      assert.equal(fs.readFileSync(path.join(root, 'agent-attempts.json'), 'utf8'), beforeCalls);
    }
    const original = path.join(root, 'docs', 'epic-4-export.md');
    const matrix = path.join(directory, 'traceability-matrix-epic-4.md');
    fs.unlinkSync(matrix);
    fs.linkSync(original, matrix);
    const contents = fs.readFileSync(original, 'utf8');
    assert.equal(run('pass', ['--output-dir', 'input-artifacts']).status, 2);
    assert.equal(fs.readFileSync(original, 'utf8'), contents);
  });
  check('diagnostic retention rejects repository-owned paths before invoking a runner', () => {
    const result = spawnSync(process.execPath, [path.join(__dirname, 'eval-trace.js'), '--validate-only', '--artifacts-dir', __dirname], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /outside the evaluation repository/);
  });
  check('result paths preserve inputs and trace artifacts, and create parent folders', () => {
    const target = path.join(root, 'docs', 'epic-4-export.md');
    const original = fs.readFileSync(target, 'utf8');
    assert.equal(run('pass', ['--json', 'docs/epic-4-export.md']).status, 2);
    fs.symlinkSync(target, path.join(root, 'target-alias.json'));
    assert.equal(run('pass', ['--json', 'target-alias.json']).status, 2);
    fs.linkSync(target, path.join(root, 'target-hardlink.json'));
    assert.equal(run('pass', ['--json', 'target-hardlink.json']).status, 2);
    assert.equal(fs.readFileSync(target, 'utf8'), original);
    assert.equal(run('pass', ['--json', 'artifacts/trace/e2e-trace-summary-epic-4.json']).status, 2);
    const result = run('pass', ['--json', 'result/nested/verdict.json']);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'result/nested/verdict.json'), 'utf8')), result.payload);
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-trace-outside-'));
    try {
      fs.symlinkSync(path.join(outside, 'uncreated'), path.join(root, 'dangling-output'));
      assert.equal(run('pass', ['--output-dir', 'dangling-output']).status, 2);
      assert.deepEqual(fs.readdirSync(outside), []);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
  check('diagnostic evaluations retain source, prompt, observation, and streams', () => {
    const evidence = path.join(root, 'evaluation-evidence');
    const result = spawnSync(
      process.execPath,
      [
        path.join(__dirname, 'eval-trace.js'),
        '--agent',
        'custom',
        '--agent-cmd',
        path.join(__dirname, 'fixtures', 'trace-runner', 'stub-agent.js'),
        '--env-pass',
        'STUB_MODE',
        '--runs',
        '1',
        '--set',
        'seeded-tenant-data-export',
        '--artifacts-dir',
        evidence,
      ],
      {
        encoding: 'utf8',
        timeout: 60_000,
        env: { ...process.env, STUB_MODE: 'wrong-key' },
      },
    );
    assert.equal(result.status, 1, result.stderr);
    const retained = fs.readdirSync(evidence);
    assert.equal(retained.length, 1);
    const directory = path.join(evidence, retained[0]);
    for (const file of ['prompt.txt', 'stdout.txt', 'stderr.txt', 'observation.json'])
      assert.ok(fs.existsSync(path.join(directory, file)), file);
    assert.ok(
      fs.existsSync(path.join(directory, 'workspace', 'tenant-data-export', 'docs', 'epics', 'epic-4-tenant-data-export-and-erasure.md')),
    );
    assert.ok(!fs.existsSync(path.join(directory, 'workspace', 'ground-truth.json')));
  });
  check('actual Codex public captures retain exact bytes and pass the current artifact validator', () => {
    const evidence = path.join(__dirname, 'results', 'live-eval-remediation', 'trace-codex-2026-10-09');
    for (const [name, id, expected] of [
      ['seeded-tenant-data-export', '4', 'FAIL'],
      ['clean-api-token-lifecycle', '5', 'PASS'],
    ]) {
      const manifest = JSON.parse(fs.readFileSync(path.join(evidence, `public-${name}-manifest.json`), 'utf8'));
      const archive = fs.readFileSync(path.join(evidence, manifest.archive));
      assert.equal(createHash('sha256').update(archive).digest('hex'), manifest.archiveSha256);
      assert.equal(manifest.groundTruthAbsent, true);
      const captured = JSON.parse(gunzipSync(archive).toString('utf8'));
      assert.equal(captured.files.length, manifest.files.length);
      const files = new Map();
      for (const [index, entry] of captured.files.entries()) {
        const bytes = Buffer.from(entry.base64, 'base64');
        const pin = manifest.files[index];
        assert.equal(entry.path, pin.path);
        assert.equal(bytes.length, pin.bytes);
        assert.equal(createHash('sha256').update(bytes).digest('hex'), pin.sha256);
        files.set(entry.path, bytes);
      }
      const result = JSON.parse(files.get('invocation/result.json'));
      assert.equal(result.exitCode, expected === 'FAIL' ? 1 : 0);
      assert.equal(result.fixtureMutated, false);
      const directory = path.join(root, 'capture-validation', name);
      const target = { type: 'epic', id, runKey: `epic-${id}`, runScope: 'epic' };
      const paths = tracePaths(directory, target.runKey);
      fs.mkdirSync(path.dirname(paths.matrix), { recursive: true });
      for (const [kind, destination] of Object.entries(paths)) {
        const original = [...files.entries()].find(
          ([name]) => name.includes('/test-artifacts/trace/') && name.endsWith(path.basename(destination)),
        );
        assert.ok(original, `missing captured ${kind}`);
        if (kind === 'matrix') fs.writeFileSync(destination, original[1]);
        else {
          // Relocate only the published link in this temporary validation copy.
          // The archive and its byte pins retain the original absolute link.
          const value = JSON.parse(original[1]);
          value.links.trace_report_path = paths.matrix;
          fs.writeFileSync(destination, JSON.stringify(value));
        }
      }
      assert.equal(
        validateTraceOutputs({ paths, target, collectionMode: 'contract_static', allowGate: true }).summary.gate_status,
        expected,
      );
    }
  });

  check('agent-created output aliases are rejected before publication and failure-result writes', () => {
    const target = path.join(root, 'docs', 'epic-4-export.md');
    const before = fs.readFileSync(target);
    const outside = `${root}-outside`;
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'sentinel.md'), 'external sentinel');
    try {
      for (const mode of ['late-json-success', 'late-json-failure', 'late-artifact-alias', 'late-artifact-escape', 'late-artifact-pair']) {
        const json = path.join(root, 'late-result.json');
        if (fs.existsSync(json)) fs.unlinkSync(json);
        const matrix = path.join(root, 'artifacts', 'trace', 'traceability-matrix-epic-4.md');
        if (fs.existsSync(matrix)) fs.unlinkSync(matrix);
        const result = run(mode, ['--json', 'late-result.json']);
        assert.equal(result.status, 2, `${mode}: ${result.stderr}`);
        assert.equal(result.payload.status, 'failed');
        assert.deepEqual(fs.readFileSync(target), before);
        assert.equal(fs.readFileSync(path.join(outside, 'sentinel.md'), 'utf8'), 'external sentinel');
        if (mode === 'late-artifact-pair') assert.equal(fs.readFileSync(matrix, 'utf8'), '# Agent-created matrix sentinel');
      }
      for (const file of [path.join(root, 'late-result.json'), path.join(root, 'artifacts', 'trace', 'traceability-matrix-epic-4.md')])
        if (fs.existsSync(file)) fs.unlinkSync(file);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  check('prompt inspection requires no agent and does not replace reports', () => {
    assert.equal(run('pass').status, 0);
    const file = path.join(root, 'artifacts', 'trace', 'e2e-trace-summary-epic-4.json');
    const before = fs.readFileSync(file, 'utf8');
    const result = spawnSync(process.execPath, [cli, '--project-root', root, '--target', 'docs/epic-4-export.md', '--agent', 'none'], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Resolved identity:.*epic-4/);
    assert.equal(fs.readFileSync(file, 'utf8'), before);
  });
  process.stdout.write(`${checks} trace CLI checks passed.\n`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
