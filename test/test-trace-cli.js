'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const { sourceOracleLedger, tracePaths, validateTraceOutputs, publishTraceOutputs } = require('../cli/lib/trace-command');

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
  check('source oracle ignores unrelated labels and merges matching table and detail claims', () => {
    const source = [
      '# Epic-4: Export',
      '',
      '| ID | Description |',
      '| --- | --- |',
      '| RISK-1 | Cache expiry |',
      '',
      'Phase-1: Setup',
      'S3: bucket policy',
      'OAuth2: required',
      '',
      '| ID | Requirement | Priority |',
      '| --- | --- | --- |',
      '| AC-1 | Admin may export. | P0 |',
      '',
      '### AC-1 (P0): Admin may export.',
      'FR-2: Member access is denied.',
    ].join('\n');
    const ledger = sourceOracleLedger(source, 'requirements.md');
    assert.deepEqual(
      ledger.map((row) => [row.id, row.priority]),
      [
        ['AC-1', 'P0'],
        ['FR-2', null],
      ],
    );
    assert.throws(() => sourceOracleLedger(`${source}\nAC-1 (P1): Admin may export.`, 'requirements.md'), /conflicting priorities/);
  });
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
  check('CLI accepts a criterion repeated in a source table and detail heading', () => {
    const file = path.join(root, 'docs', 'epic-4-export.md');
    const original = fs.readFileSync(file);
    try {
      fs.writeFileSync(
        file,
        '# Epic 4: Export\n\n| ID | Requirement | Priority |\n| --- | --- | --- |\n| AC-1 | Admin may export. | P0 |\n\n### AC-1 (P0): Admin may export.\n',
      );
      const result = run('pass');
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.payload.coverage.total, 1);
    } finally {
      fs.writeFileSync(file, original);
    }
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
  check('fresh live failures cap a passing automated gate and preserve stale evidence semantics', () => {
    assert.equal(run('fresh-failure').status, 3);
    assert.equal(run('fresh-invalid-count').status, 3);
    const concerns = run('fresh-failure-concerns');
    assert.equal(concerns.status, 0, concerns.stderr);
    assert.equal(concerns.payload.gate_status, 'CONCERNS');
    assert.equal(run('fresh-failure-concerns', ['--fail-on', 'concerns']).status, 1);
    assert.equal(run('stale-failure').payload.gate_status, 'PASS');
  });
  check('Step 5 executable rules cap fresh failures without lifting existing FAIL decisions', () => {
    const step = fs.readFileSync(
      path.join(__dirname, '..', 'skills', 'bmad-testarch-trace', 'steps-c', 'step-05-gate-decision.md'),
      'utf8',
    );
    const script = step.slice(step.indexOf("let gateDecision = 'NOT_EVALUATED'")).split('\n```')[0];
    for (const [freshness, failed, p0Coverage, expected, freshFailed] of [
      ['fresh', 1, 100, 'CONCERNS'],
      ['fresh', 1, 50, 'FAIL'],
      ['stale', 1, 100, 'PASS'],
      ['not_present', 0, 100, 'PASS'],
      ['mixed', 1, 100, 'CONCERNS', 1],
      ['stale', 1, 100, 'CONCERNS', 1],
      ['fresh', 1, 100, 'PASS', 0],
    ]) {
      const actual = require('node:vm').runInNewContext(`${script}\ngateDecision`, {
        gateEligible: true,
        allowGate: true,
        collectionStatus: 'COLLECTED',
        p0Coverage,
        overallCoverage: 100,
        effectiveP1Coverage: 100,
        hasP1Requirements: false,
        criticalGaps: p0Coverage === 100 ? 0 : 1,
        syntheticOracle: false,
        effectiveOracleConfidence: 'high',
        liveOnlyCoveredRequirements: 0,
        liveEvidence: { freshness, failed, fresh_failed: freshFailed },
      });
      assert.equal(actual, expected);
    }
  });
  check('frozen oracle priorities reject consistent report reprioritization', () => {
    const file = path.join(root, 'docs', 'epic-4-export.md');
    const original = fs.readFileSync(file, 'utf8');
    try {
      for (const source of [
        '### AC-1 (P0): Admin may export.\n',
        '| ID | Requirement | Priority |\n| --- | --- | --- |\n| AC-1 | Admin may export. | P0 |\n',
      ]) {
        fs.writeFileSync(file, `# Epic 4: Export\n\n${source}`);
        const result = run('source-priority-drift');
        assert.equal(result.status, 3, result.stderr);
        assert.match(result.payload.reason, /explicit source priority/);
        assert.equal(fs.readFileSync(file, 'utf8'), `# Epic 4: Export\n\n${source}`);
      }
      fs.writeFileSync(file, original);
      for (const mode of ['missing-oracle-ledger', 'oracle-ledger-drift', 'mutated-source']) {
        const result = run(mode);
        assert.equal(result.status, 3, `${mode}: ${result.stderr}`);
        fs.writeFileSync(file, original);
      }
    } finally {
      fs.writeFileSync(file, original);
    }
  });
  check('non-string artifact configuration preserves inputs and invokes no agent', () => {
    const config = path.join(root, '_bmad', 'config.toml');
    const original = fs.readFileSync(config, 'utf8');
    const before = fs.readFileSync(path.join(root, 'agent-attempts.json'), 'utf8');
    try {
      for (const value of ['42', 'true', '["artifacts"]', '""']) {
        const text = `[modules.tea]\ntest_artifacts = ${value}\n`;
        fs.writeFileSync(config, text);
        const result = run('pass');
        assert.equal(result.status, 2);
        assert.match(result.payload.reason, /test_artifacts.*nonempty string/);
        assert.equal(fs.readFileSync(config, 'utf8'), text);
        assert.equal(fs.readFileSync(path.join(root, 'agent-attempts.json'), 'utf8'), before);
      }
    } finally {
      fs.writeFileSync(config, original);
    }
  });
  check('frozen requirement text and source bindings survive ledger and matrix publication', () => {
    const file = path.join(root, 'docs', 'epic-4-export.md');
    const original = fs.readFileSync(file, 'utf8');
    try {
      fs.writeFileSync(file, '# Epic 4: Export\n\n### AC-1 (P0): **Admin may export.**\n');
      assert.equal(run('pass').status, 0);
      const gate = path.join(root, 'artifacts', 'trace', 'gate-decision-epic-4.json');
      const previousGate = fs.readFileSync(gate);
      for (const mode of ['source-text-drift', 'source-binding-drift', 'matrix-text-drift', 'missing-oracle-ledger']) {
        const result = run(mode);
        assert.equal(result.status, 3, `${mode}: ${result.stderr}`);
        assert.match(result.payload.reason, /frozen requirement|source binding|oracleLedger/);
        assert.equal(fs.readFileSync(file, 'utf8'), '# Epic 4: Export\n\n### AC-1 (P0): **Admin may export.**\n');
        assert.deepEqual(fs.readFileSync(gate), previousGate);
      }
    } finally {
      fs.writeFileSync(file, original);
    }
  });
  check('consecutive colon criteria and wrapped titles preserve every source row', () => {
    const file = path.join(root, 'docs', 'epic-4-export.md');
    const original = fs.readFileSync(file, 'utf8');
    try {
      const text = '# Epic 4: Export\n\nAC-1 (P0): Admin may\nexport.\nAC-2 (P0): Deny member export.\n';
      fs.writeFileSync(file, text);
      const accepted = run('pass');
      assert.equal(accepted.status, 0, accepted.stderr);
      assert.equal(accepted.payload.coverage.total, 2);
      const ledger = sourceOracleLedger(text, file);
      assert.deepEqual(
        ledger.map((row) => [row.id, row.source]),
        [
          ['AC-1', `${file}:3`],
          ['AC-2', `${file}:5`],
        ],
      );
      const dropped = run('missing-source-criterion');
      assert.equal(dropped.status, 3, dropped.stderr);
      assert.match(dropped.payload.reason, /frozen source criterion identities/);
    } finally {
      fs.writeFileSync(file, original);
    }
  });
  check('supplied native live failures remain authoritative with missing, stale, or mixed summary metadata', () => {
    for (const args of [
      ['init', '-q'],
      ['add', 'docs', '_bmad/config.toml'],
      ['-c', 'user.name=Trace fixture', '-c', 'user.email=trace@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture'],
    ]) {
      const git = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
      assert.equal(git.status, 0, git.stderr);
    }
    const current = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
    const stale = current[0] === 'a' ? 'b'.repeat(40) : 'a'.repeat(40);
    const live = path.join(root, 'live.json');
    const write = (results) => fs.writeFileSync(live, JSON.stringify({ schema_version: '0.1.0', source_sha: current, results }));
    const failure = { id: '1.1-LIVE-001', requirement_id: 'AC-1', status: 'fail' };
    try {
      write([failure]);
      for (const mode of ['manifest-omitted', 'manifest-stale-cap', 'manifest-ignored-cap']) {
        const result = run(mode, ['--live-results', 'live.json']);
        assert.equal(result.status, 3, `${mode}: ${result.stderr}`);
        assert.match(result.payload.reason, /frozen supplied manifest|gate decision/);
      }
      assert.equal(run('manifest-concerns', ['--live-results', 'live.json']).payload.gate_status, 'CONCERNS');
      write([failure, { id: '1.1-LIVE-002', requirement_id: 'AC-1', status: 'pass', source_sha: stale }]);
      const mixed = run('manifest-concerns', ['--live-results', 'live.json']);
      assert.equal(mixed.status, 0, mixed.stderr);
      assert.equal(mixed.payload.gate_status, 'CONCERNS');
      write([{ ...failure, source_sha: stale }]);
      const old = run('manifest-pass', ['--live-results', 'live.json']);
      assert.equal(old.status, 0, old.stderr);
      assert.equal(old.payload.gate_status, 'PASS');
      write([failure]);
      const mutation = run('manifest-input-mutation', ['--live-results', 'live.json']);
      assert.equal(mutation.status, 3, mutation.stderr);
      assert.match(mutation.payload.reason, /changed a supplied input/);
      write([{ id: '1.1-LIVE-003', status: 'fail' }]);
      const ignoredInvalidFailure = run('manifest-invalid-failure-ignored', ['--live-results', 'live.json']);
      assert.equal(ignoredInvalidFailure.status, 3, ignoredInvalidFailure.stderr);
      assert.match(ignoredInvalidFailure.payload.reason, /frozen supplied manifest/);
    } finally {
      fs.unlinkSync(live);
    }
  });
  check('a HEAD change during live verification leaves the previous report intact', () => {
    const current = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
    const live = path.join(root, 'live.json');
    const files = Object.values(tracePaths(path.join(root, 'artifacts'), 'epic-4'));
    const previous = files.map((file) => fs.readFileSync(file));
    fs.writeFileSync(
      live,
      JSON.stringify({
        schema_version: '0.1.0',
        source_sha: current,
        results: [{ id: '1.1-LIVE-001', requirement_id: 'AC-1', status: 'pass' }],
      }),
    );
    try {
      const result = run('manifest-advance-head', ['--live-results', 'live.json']);
      assert.equal(result.status, 3, result.stderr);
      assert.match(result.payload.reason, /source revision changed/);
      const next = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
      assert.notEqual(next, current);
      for (const [index, file] of files.entries()) assert.deepEqual(fs.readFileSync(file), previous[index]);
    } finally {
      fs.unlinkSync(live);
    }
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
  check('runtime-manifest with missing evidence reports inaccessible and publishes no gate', () => {
    const args = ['--test-dir', 'missing-tests', '--collection-mode', 'runtime_manifest'];
    const falseSuccess = run('pass', args);
    assert.equal(falseSuccess.status, 3, falseSuccess.stderr);
    assert.match(falseSuccess.payload.reason, /runtime-manifest collection status/);
    const result = run('runtime-inaccessible', args);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.payload.collection_status, 'INACCESSIBLE');
    assert.equal(result.payload.gate_status, null);
    const file = path.join(root, 'unreadable-live.json');
    fs.writeFileSync(file, '{malformed');
    try {
      const invalid = run('pass', [...args, '--live-results', 'unreadable-live.json']);
      assert.equal(invalid.status, 3, invalid.stderr);
      const inaccessible = run('runtime-inaccessible', [...args, '--live-results', 'unreadable-live.json']);
      assert.equal(inaccessible.status, 0, inaccessible.stderr);
      assert.equal(inaccessible.payload.gate_status, null);
      assert.equal(fs.readFileSync(file, 'utf8'), '{malformed');
    } finally {
      fs.unlinkSync(file);
    }
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
    const summary = path.join(root, 'artifacts', 'trace', 'e2e-trace-summary-epic-4.json');
    const previous = fs.readFileSync(summary);
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
      assert.deepEqual(fs.readFileSync(summary), previous, mode);
    }
  });
  check('attempt artifacts cannot import stale symlinks or hardlinked evidence', () => {
    const matrix = path.join(root, 'artifacts', 'trace', 'traceability-matrix-epic-4.md');
    const previous = fs.readFileSync(matrix);
    for (const mode of ['attempt-outside-link', 'attempt-stale-link', 'attempt-hardlink']) {
      const result = run(mode);
      assert.equal(result.status, 3, `${mode}: ${result.stderr}`);
      assert.ok(result.payload.evidence);
      assert.deepEqual(fs.readFileSync(matrix), previous);
    }
    fs.unlinkSync(`${root}-old-matrix.md`);
  });
  check('late destination directories preserve current failure evidence without partial publication', () => {
    for (const file of Object.values(tracePaths(path.join(root, 'artifacts'), 'epic-4'))) if (fs.existsSync(file)) fs.unlinkSync(file);
    const json = path.join(root, 'result.json');
    fs.writeFileSync(json, '{"status":"completed","gate_status":"PASS"}');
    const result = run('partial-publication', ['--json', 'result.json']);
    assert.equal(result.status, 2, result.stderr);
    assert.ok(result.payload.evidence);
    assert.ok(!fs.existsSync(json));
    assert.ok(!fs.existsSync(path.join(root, 'artifacts', 'trace', 'traceability-matrix-epic-4.md')));
    fs.rmdirSync(path.join(root, 'artifacts', 'trace', 'e2e-trace-summary-epic-4.json'));
  });
  check('publication failures replace the command JSON with the failed result', () => {
    const json = path.join(root, 'result.json');
    const directory = path.join(root, 'locked-artifacts', 'trace');
    fs.mkdirSync(directory, { recursive: true });
    fs.chmodSync(directory, 0o555);
    try {
      let writable = false;
      try {
        const probe = fs.mkdtempSync(path.join(directory, 'probe-'));
        fs.rmdirSync(probe);
        writable = true;
      } catch {
        writable = false;
      }
      if (writable) return;
      fs.writeFileSync(json, '{"status":"completed","gate_status":"PASS"}');
      const result = run('pass', ['--output-dir', 'locked-artifacts', '--json', 'result.json']);
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.payload.reason, /Trace publication failed/);
      assert.deepEqual(JSON.parse(fs.readFileSync(json, 'utf8')), result.payload);
    } finally {
      fs.chmodSync(directory, 0o755);
    }
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
  check('failed reruns preserve published reports until a valid replacement is ready', () => {
    assert.equal(run('pass').status, 0);
    const files = Object.values(tracePaths(path.join(root, 'artifacts'), 'epic-4'));
    const previous = files.map((file) => fs.readFileSync(file));
    for (const mode of ['fail-agent', 'bad-arithmetic']) {
      const result = run(mode, ['--json', 'result.json']);
      assert.equal(result.status, 3, result.stderr);
      assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'result.json'), 'utf8')).status, 'failed');
      for (const [index, file] of files.entries()) assert.deepEqual(fs.readFileSync(file), previous[index]);
    }
    const result = run('gap');
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.payload.gate_status, 'FAIL');
    for (const [index, file] of files.entries()) assert.notDeepEqual(fs.readFileSync(file), previous[index]);
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
      assert.ok(manifest.files.every((file) => !file.path.endsWith('/stderr.txt') && file.bytes > 0));
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
        validateTraceOutputs({
          paths,
          target,
          collectionMode: 'contract_static',
          allowGate: true,
          oracleLedger: sourceOracleLedger(
            fs.readFileSync(
              path.join(
                __dirname,
                'fixtures',
                'trace-eval',
                id === '4' ? 'seeded' : 'clean',
                'docs',
                'epics',
                id === '4' ? 'epic-4-tenant-data-export-and-erasure.md' : 'epic-5-api-token-lifecycle.md',
              ),
              'utf8',
            ),
            'captured source',
          ),
          requireOracleLedger: true,
          // Original captures predate the typed Step 1 ledger. This offline replay
          // checks their frozen identity/priority contract; the public CLI requires it.
          allowLegacyExplicitOracle: true,
        }).summary.gate_status,
        expected,
      );
    }
  });

  check('repeated diagnostic after archive preserves all four actual measurements and byte pins', () => {
    const directory = path.join(__dirname, 'results', 'live-eval-remediation', 'trace-codex-2026-10-09');
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'after-attempt-2-manifest.json'), 'utf8'));
    assert.ok(manifest.files.every((file) => !file.path.endsWith('/stderr.txt') && file.bytes > 0));
    const archive = fs.readFileSync(path.join(directory, manifest.archive));
    assert.equal(createHash('sha256').update(archive).digest('hex'), manifest.archiveSha256);
    const capture = JSON.parse(gunzipSync(archive));
    assert.equal(capture.sourceCommit, 'f4045e99d8440adfba3789db9a9b438727a5324f');
    assert.equal(capture.files.length, manifest.files.length);
    for (const [index, file] of capture.files.entries()) {
      const bytes = Buffer.from(file.base64, 'base64');
      assert.equal(file.path, manifest.files[index].path);
      assert.equal(bytes.length, manifest.files[index].bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.files[index].sha256);
    }
    const result = capture.files.find((file) => file.path === 'invocation/result.json');
    const bytes = Buffer.from(result.base64, 'base64');
    assert.deepEqual(bytes, fs.readFileSync(path.join(directory, 'after-attempt-2.json')));
    const value = JSON.parse(bytes);
    assert.equal(value.exitCode, 0);
    assert.equal(value.repository.dirty, false);
    assert.deepEqual(value.runners[0].repetitions, { expected: 4, completed: 4 });
    assert.equal(value.runners[0].measurements.unstableCases, 0);
    assert.equal(value.runners[0].measurements.fixtureMutations, 0);
  });
  check('later actual public Codex captures preserve original exits and frozen source ledgers', () => {
    const directory = path.join(__dirname, 'results', 'live-eval-remediation', 'trace-codex-2026-10-09');
    for (const [capture, commit, legacy] of [
      ['public-before-cr', '8ee3aa5cd8af16dbabe4b8a8d0df09c931b68cc4', true],
      ['public-after-cr', '7eabcf927a1400b5599c6027da71efdf2aa64dea', false],
    ]) {
      const manifest = JSON.parse(fs.readFileSync(path.join(directory, capture, 'public-native.manifest.json')));
      assert.ok(manifest.files.every((file) => !file.path.endsWith('/stderr.txt') && file.bytes > 0));
      const compressed = fs.readFileSync(path.join(directory, capture, manifest.archive));
      assert.equal(createHash('sha256').update(compressed).digest('hex'), manifest.archiveSha256);
      assert.equal(manifest.sourceCommit, commit);
      assert.deepEqual(manifest.nativeExits, [1, 0]);
      const archived = JSON.parse(gunzipSync(compressed));
      const files = new Map(archived.files.map((file) => [file.path, Buffer.from(file.base64, 'base64')]));
      assert.equal(files.size, manifest.files.length);
      for (const pin of manifest.files) {
        assert.equal(files.get(pin.path).length, pin.bytes);
        assert.equal(createHash('sha256').update(files.get(pin.path)).digest('hex'), pin.sha256);
      }
      for (const [name, id, expected] of [
        ['seeded', '4', 'FAIL'],
        ['clean', '5', 'PASS'],
      ]) {
        const invocation = JSON.parse(files.get(`${name}-invocation.json`));
        assert.match(invocation.sourceCommit, /^[0-9a-f]{7,40}$/);
        assert.ok(commit.startsWith(invocation.sourceCommit));
        assert.deepEqual(JSON.parse(files.get(`${name}-result.json`)).changedInputs, []);
        const prompt = [...files.entries()]
          .find(([file]) => file.startsWith(`${name}/.tea-runs/`) && file.endsWith('/prompt.txt'))[1]
          .toString();
        const frozen = prompt.match(/Frozen source oracle ledger: (\[.*\])\. Preserve/);
        const targetDocument = invocation.args[invocation.args.indexOf('--target') + 1];
        const ledger = frozen
          ? JSON.parse(frozen[1])
          : sourceOracleLedger(files.get(`${name}/${targetDocument}`).toString(), 'captured source');
        const target = { type: 'epic', id, runKey: `epic-${id}`, runScope: 'epic' };
        const paths = tracePaths(path.join(root, 'later-capture-validation', capture, name), target.runKey);
        fs.mkdirSync(path.dirname(paths.matrix), { recursive: true });
        for (const [kind, destination] of Object.entries(paths)) {
          const original = [...files.entries()].find(
            ([file]) => file.startsWith(`${name}/.tea-runs/`) && file.endsWith(path.basename(destination)),
          )[1];
          if (kind === 'matrix') fs.writeFileSync(destination, original);
          else {
            const value = JSON.parse(original);
            value.links.trace_report_path = paths.matrix;
            fs.writeFileSync(destination, JSON.stringify(value));
          }
        }
        const liveFile = files.get(`${name}/test-artifacts/live-verification-results.json`);
        assert.equal(
          validateTraceOutputs({
            paths,
            target,
            collectionMode: 'contract_static',
            allowGate: true,
            oracleLedger: ledger,
            requireOracleLedger: true,
            allowLegacyExplicitOracle: legacy,
            liveCapture: liveFile ? { manifest: JSON.parse(liveFile), currentSha: '' } : undefined,
          }).summary.gate_status,
          expected,
        );
      }
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
        fs.writeFileSync(json, '{"status":"completed","gate_status":"PASS"}');
        const matrix = path.join(root, 'artifacts', 'trace', 'traceability-matrix-epic-4.md');
        if (fs.existsSync(matrix)) fs.unlinkSync(matrix);
        if (mode === 'late-artifact-pair') {
          const summary = path.join(root, 'artifacts', 'trace', 'e2e-trace-summary-epic-4.json');
          if (fs.existsSync(summary)) fs.unlinkSync(summary);
        }
        const result = run(mode, ['--json', 'late-result.json']);
        assert.equal(result.status, 2, `${mode}: ${result.stderr}`);
        assert.equal(result.payload.status, 'failed');
        if (!mode.startsWith('late-json-')) assert.ok(!fs.existsSync(json));
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
