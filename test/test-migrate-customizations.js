const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const TOML = require('smol-toml');
const { migrate } = require('../cli/migrate-customizations');

test('moves every pre-3.0 customization namespace and preserves values', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-migration-'));
  try {
    const custom = path.join(root, '_bmad', 'custom');
    fs.mkdirSync(custom, { recursive: true });
    for (const name of [
      'bmad-testarch-automate',
      'bmad-testarch-evaluate',
      'bmad-testarch-framework',
      'bmad-testarch-nfr',
      'bmad-testarch-test-design',
      'bmad-testarch-test-review',
      'bmad-testarch-trace',
      'bmad-testarch-atdd',
      'bmad-testarch-ci',
      'bmad-teach-me-testing',
    ]) {
      fs.writeFileSync(path.join(custom, `${name}.toml`), '[workflow]\non_complete = "retain me"\n');
      fs.writeFileSync(path.join(custom, `${name}.user.toml`), '[workflow]\npersistent_facts = ["my fact"]\n');
    }
    assert.equal(migrate(root, { check: true }).length, 20);
    assert.equal(migrate(root).length, 20);
    assert.equal(migrate(root).length, 0);
    for (const name of [
      'automate',
      'evaluate',
      'framework',
      'nfr',
      'test-design',
      'test-review',
      'trace',
      'atdd',
      'ci',
      'teach-me-testing',
    ]) {
      const prefix = `bmad-tea-${name}`;
      assert.equal(TOML.parse(fs.readFileSync(path.join(custom, `${prefix}.toml`), 'utf8')).workflow.on_complete, 'retain me');
      assert.deepEqual(TOML.parse(fs.readFileSync(path.join(custom, `${prefix}.user.toml`), 'utf8')).workflow.persistent_facts, [
        'my fact',
      ]);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('reports conflicts before changing any file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-migration-'));
  try {
    const custom = path.join(root, '_bmad', 'custom');
    fs.mkdirSync(custom, { recursive: true });
    const oldFile = path.join(custom, 'bmad-testarch-ci.toml');
    const newFile = path.join(custom, 'bmad-tea-ci.toml');
    fs.writeFileSync(oldFile, '[workflow]\nci_platform = "github-actions"\n');
    fs.writeFileSync(newFile, '[workflow]\nci_platform = "gitlab-ci"\n');
    assert.throws(
      () => migrate(root),
      (error) => error.message.includes(oldFile) && error.message.includes(newFile),
    );
    assert.equal(fs.readFileSync(oldFile, 'utf8'), '[workflow]\nci_platform = "github-actions"\n');
    assert.equal(fs.readFileSync(newFile, 'utf8'), '[workflow]\nci_platform = "gitlab-ci"\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('requires a manual merge when old and new files coexist, preserving their comments', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-migration-'));
  try {
    const custom = path.join(root, '_bmad', 'custom');
    fs.mkdirSync(custom, { recursive: true });
    const oldFile = path.join(custom, 'bmad-testarch-evaluate.user.toml');
    const newFile = path.join(custom, 'bmad-tea-evaluate.user.toml');
    const oldText = '# team note\n[workflow]\nevaluations_folder = "my-evals"\n';
    const newText = '# new note\n[workflow]\non_complete = "report result"\n';
    fs.writeFileSync(oldFile, oldText);
    fs.writeFileSync(newFile, newText);
    assert.throws(
      () => migrate(root),
      (error) =>
        error.message.includes('Merge their values and comments manually') &&
        error.message.includes(oldFile) &&
        error.message.includes(newFile),
    );
    assert.equal(fs.readFileSync(oldFile, 'utf8'), oldText);
    assert.equal(fs.readFileSync(newFile, 'utf8'), newText);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('updates agent menu references while preserving comments, formatting and private mode', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-migration-'));
  try {
    const custom = path.join(root, '_bmad', 'custom');
    fs.mkdirSync(custom, { recursive: true });
    const menu = path.join(custom, 'bmad-tea.user.toml');
    const old = path.join(custom, 'bmad-testarch-evaluate.user.toml');
    const menuText =
      '# keep this comment\n[[agent.menu]]\ncode = "EV"\nskill = "bmad-testarch-evaluate" # preserve this\n\n[[agent.menu]]\ncode = "TMT"\nskill = \'bmad-teach-me-testing\'\n\n[[agent.menu]]\ncode = "AT"\nskill = "bmad-testarch-atdd"\n\n[[agent.menu]]\ncode = "CI"\nskill = "bmad-testarch-ci"\n';
    fs.writeFileSync(menu, menuText, { mode: 0o600 });
    fs.writeFileSync(old, '# keep this workflow note\n[workflow]\non_complete = "done"\n', { mode: 0o600 });
    const actions = migrate(root);
    assert.equal(actions.length, 2);
    const updated = fs.readFileSync(menu, 'utf8');
    assert.equal(
      updated,
      menuText
        .replace('bmad-testarch-evaluate', 'bmad-tea-evaluate')
        .replace('bmad-teach-me-testing', 'bmad-tea-teach-me-testing')
        .replace('bmad-testarch-atdd', 'bmad-tea-automate')
        .replace('bmad-testarch-ci', 'bmad-tea-framework'),
    );
    assert.equal(fs.statSync(menu).mode & 0o777, 0o600);
    const moved = path.join(custom, 'bmad-tea-evaluate.user.toml');
    assert.equal(fs.readFileSync(moved, 'utf8'), '# keep this workflow note\n[workflow]\non_complete = "done"\n');
    assert.equal(fs.statSync(moved).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects symlinks and malformed TOML with the source path before moving any file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-migration-'));
  try {
    const custom = path.join(root, '_bmad', 'custom');
    fs.mkdirSync(custom, { recursive: true });
    const first = path.join(custom, 'bmad-testarch-automate.toml');
    const second = path.join(custom, 'bmad-testarch-evaluate.toml');
    fs.writeFileSync(first, '[workflow]\non_complete = "safe"\n');
    fs.writeFileSync(second, '[workflow\n');
    assert.throws(
      () => migrate(root),
      (error) => error.message.includes(second),
    );
    assert.equal(fs.existsSync(first), true);
    fs.unlinkSync(second);
    fs.symlinkSync(first, second);
    assert.throws(
      () => migrate(root),
      (error) => error.message.includes(second) && error.message.includes('symlink'),
    );
    assert.equal(fs.existsSync(first), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CLI migrates a project from another working directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-migration-'));
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-migration-cwd-'));
  try {
    const custom = path.join(root, '_bmad', 'custom');
    fs.mkdirSync(custom, { recursive: true });
    fs.writeFileSync(path.join(custom, 'bmad-teach-me-testing.toml'), '[workflow]\non_complete = "from elsewhere"\n');
    const cli = path.join(__dirname, '..', 'cli', 'migrate-customizations.js');
    const preview = spawnSync(process.execPath, [cli, '--project-root', root, '--check'], { cwd: elsewhere, encoding: 'utf8' });
    assert.equal(preview.status, 0, preview.stderr);
    assert.match(preview.stdout, /Would move .*bmad-teach-me-testing\.toml -> .*bmad-tea-teach-me-testing\.toml/);
    assert.equal(fs.existsSync(path.join(custom, 'bmad-tea-teach-me-testing.toml')), false);
    const result = spawnSync(process.execPath, [cli, '--project-root', root], { cwd: elsewhere, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      TOML.parse(fs.readFileSync(path.join(custom, 'bmad-tea-teach-me-testing.toml'), 'utf8')).workflow.on_complete,
      'from elsewhere',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(elsewhere, { recursive: true, force: true });
  }
});

test('concurrent destination creation stops migration without overwriting it and rolls back earlier moves', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-migration-'));
  try {
    const custom = path.join(root, '_bmad', 'custom');
    fs.mkdirSync(custom, { recursive: true });
    const first = path.join(custom, 'bmad-testarch-automate.toml');
    const second = path.join(custom, 'bmad-testarch-evaluate.toml');
    const firstNew = path.join(custom, 'bmad-tea-automate.toml');
    const secondNew = path.join(custom, 'bmad-tea-evaluate.toml');
    fs.writeFileSync(first, '[workflow]\non_complete="first"\n');
    fs.writeFileSync(second, '[workflow]\non_complete="second"\n');
    assert.throws(
      () =>
        migrate(root, {
          beforeAction: (action, index) => {
            if (index === 1) fs.writeFileSync(action.newFile, '[workflow]\non_complete="concurrent"\n');
          },
        }),
      (error) => error.message.includes(secondNew) && error.message.includes('appeared'),
    );
    assert.equal(fs.readFileSync(first, 'utf8'), '[workflow]\non_complete="first"\n');
    assert.equal(fs.existsSync(firstNew), false);
    assert.equal(fs.readFileSync(second, 'utf8'), '[workflow]\non_complete="second"\n');
    assert.equal(fs.readFileSync(secondNew, 'utf8'), '[workflow]\non_complete="concurrent"\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a stale lock names its path and recovery without deleting it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-migration-'));
  try {
    const custom = path.join(root, '_bmad', 'custom');
    const lock = path.join(custom, '.tea-migration.lock');
    fs.mkdirSync(lock, { recursive: true });
    fs.writeFileSync(path.join(custom, 'bmad-testarch-nfr.toml'), '[workflow]\non_complete="keep"\n');
    assert.throws(
      () => migrate(root),
      (error) => error.message.includes(lock) && error.message.includes('remove the stale lock'),
    );
    assert.equal(fs.existsSync(lock), true);
    assert.equal(fs.existsSync(path.join(custom, 'bmad-testarch-nfr.toml')), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

for (const [args, status] of [
  [['--help'], 0],
  [['-h'], 0],
  [['--chek'], 2],
  [['unexpected'], 2],
  [['--check', '--chek'], 2],
  [['--project-root'], 2],
  [['--project-root', '--check'], 2],
  [['--project-root', '.', '--project-root', '.'], 2],
  [['--help', '--chek'], 2],
]) {
  test(`CLI argument validation preserves legacy customizations: ${args.join(' ')}`, (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-migration-args-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const custom = path.join(root, '_bmad/custom');
    fs.mkdirSync(custom, { recursive: true });
    const original = '# preserve comments\nfoo = 1\n';
    fs.writeFileSync(path.join(custom, 'bmad-testarch-trace.toml'), original);
    const result = spawnSync(process.execPath, [path.resolve(__dirname, '../cli/migrate-customizations.js'), ...args], {
      cwd: root,
      encoding: 'utf8',
      timeout: 10_000,
    });
    assert.equal(result.status, status, result.stderr);
    assert.match(result.stdout + result.stderr, /Usage:|requires a path/);
    assert.deepEqual(fs.readdirSync(custom), ['bmad-testarch-trace.toml']);
    assert.equal(fs.readFileSync(path.join(custom, 'bmad-testarch-trace.toml'), 'utf8'), original);
  });
}
