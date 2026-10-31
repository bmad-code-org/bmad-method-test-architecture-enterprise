const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const TOML = require('smol-toml');
const { migrate } = require('../cli/migrate-customizations');

const CLI = path.join(__dirname, '..', 'cli', 'migrate-customizations.js');

function withProject(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-migration-'));
  try {
    const custom = path.join(root, '_bmad', 'custom');
    fs.mkdirSync(custom, { recursive: true });
    run({ root, custom });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function write(file, text, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, mode === undefined ? undefined : { mode });
  if (mode !== undefined) fs.chmodSync(file, mode);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function backupCustom(root, folder) {
  return path.join(root, folder, '_bmad', 'custom');
}

/** Every file under the project with its bytes, so a test can prove nothing moved. */
function tree(root) {
  const files = {};
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else files[path.relative(root, full)] = entry.isSymbolicLink() ? `-> ${fs.readlinkSync(full)}` : read(full);
    }
  };
  walk(root);
  return files;
}

function cli(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
}

test('moves every pre-3.0 customization namespace and preserves values', () => {
  withProject(({ root, custom }) => {
    const names = ['automate', 'evaluate', 'framework', 'nfr', 'test-design', 'test-review', 'trace'];
    for (const name of [...names.map((suffix) => `bmad-testarch-${suffix}`), 'bmad-teach-me-testing']) {
      write(path.join(custom, `${name}.toml`), '[workflow]\non_complete = "retain me"\n');
      write(path.join(custom, `${name}.user.toml`), '[workflow]\npersistent_facts = ["my fact"]\n');
    }
    assert.equal(migrate(root, { check: true }).length, 16);
    assert.equal(migrate(root).length, 16);
    assert.equal(migrate(root).length, 0);
    for (const name of [...names, 'teach-me-testing']) {
      const prefix = `bmad-tea-${name}`;
      assert.equal(TOML.parse(read(path.join(custom, `${prefix}.toml`))).workflow.on_complete, 'retain me');
      assert.deepEqual(TOML.parse(read(path.join(custom, `${prefix}.user.toml`))).workflow.persistent_facts, ['my fact']);
    }
    for (const retired of ['bmad-tea-atdd', 'bmad-tea-ci']) {
      assert.equal(fs.existsSync(path.join(custom, `${retired}.toml`)), false);
    }
  });
});

test('moves red-mode settings into [workflow.red], keeping team and user layers apart', () => {
  withProject(({ root, custom }) => {
    const team = '# team red settings\n[workflow]\non_complete = "team done" # inline note\npersistent_facts = [\n  "team fact",\n]\n';
    const user = "[workflow]\nactivation_steps_append = ['my step']\n";
    write(path.join(custom, 'bmad-tea-atdd.toml'), team, 0o640);
    write(path.join(custom, 'bmad-tea-atdd.user.toml'), user, 0o600);
    const actions = migrate(root);
    assert.deepEqual(
      actions.map((action) => action.kind),
      ['create', 'remove', 'create', 'remove'],
    );
    const teamTarget = path.join(custom, 'bmad-tea-automate.toml');
    const userTarget = path.join(custom, 'bmad-tea-automate.user.toml');
    assert.equal(read(teamTarget), team.replace('[workflow]', '[workflow.red]'));
    assert.equal(read(userTarget), user.replace('[workflow]', '[workflow.red]'));
    assert.equal(fs.statSync(teamTarget).mode & 0o777, 0o640);
    assert.equal(fs.statSync(userTarget).mode & 0o777, 0o600);
    assert.equal(TOML.parse(read(userTarget)).workflow.red.on_complete, undefined);
    assert.equal(fs.existsSync(path.join(custom, 'bmad-tea-atdd.toml')), false);
    assert.equal(fs.existsSync(path.join(custom, 'bmad-tea-atdd.user.toml')), false);
    assert.equal(migrate(root).length, 0);
  });
});

test('appends [workflow.ci] from a pre-3.0 CI file to a framework file without touching its bytes', () => {
  withProject(({ root, custom }) => {
    const target = path.join(custom, 'bmad-tea-framework.toml');
    const targetText = '# framework overrides\n[workflow]\non_complete = "framework done"   # spacing kept\n';
    const ciText = "[workflow]\n# platform note\nci_platform = 'gitlab-ci'\n\n[workflow.extra]\nflag = true\n";
    write(target, targetText);
    write(path.join(custom, 'bmad-testarch-ci.toml'), ciText);
    migrate(root);
    assert.equal(
      read(target),
      `${targetText}\n[workflow.ci]\n# platform note\nci_platform = 'gitlab-ci'\n\n[workflow.ci.extra]\nflag = true\n`,
    );
    assert.deepEqual(TOML.parse(read(target)).workflow, {
      on_complete: 'framework done',
      ci: { ci_platform: 'gitlab-ci', extra: { flag: true } },
    });
    assert.equal(fs.existsSync(path.join(custom, 'bmad-testarch-ci.toml')), false);
  });
});

test('adds only the missing keys inside an existing [workflow.red] table', () => {
  withProject(({ root, custom }) => {
    const target = path.join(custom, 'bmad-tea-automate.toml');
    const before =
      '[workflow]\non_complete = "expand"\n\n[workflow.red]\n# red note\non_complete = "same"\n\n# next table note\n[workflow.other]\nx = 1\n';
    write(target, before);
    write(path.join(custom, 'bmad-tea-atdd.toml'), '[workflow]\non_complete = "same"\npersistent_facts = ["added"]\n');
    migrate(root);
    assert.equal(read(target), before.replace('on_complete = "same"\n', 'on_complete = "same"\npersistent_facts = [ "added" ]\n'));
    assert.equal(fs.existsSync(path.join(custom, 'bmad-tea-atdd.toml')), false);
  });
});

test('merges into the file a pre-3.0 automate rename produces, in one run', () => {
  withProject(({ root, custom }) => {
    write(path.join(custom, 'bmad-testarch-automate.toml'), '# automate note\n[workflow]\non_complete = "expand"\n');
    write(path.join(custom, 'bmad-testarch-atdd.toml'), '[workflow]\non_complete = "red"\n');
    const actions = migrate(root);
    assert.deepEqual(
      actions.map((action) => action.kind),
      ['move', 'update', 'remove'],
    );
    assert.equal(
      read(path.join(custom, 'bmad-tea-automate.toml')),
      '# automate note\n[workflow]\non_complete = "expand"\n\n[workflow.red]\non_complete = "red"\n',
    );
    assert.deepEqual(fs.readdirSync(custom), ['bmad-tea-automate.toml']);
  });
});

test('merges both retired stems of one layer when their values agree', () => {
  withProject(({ root, custom }) => {
    write(path.join(custom, 'bmad-tea-atdd.toml'), '[workflow]\non_complete = "red"\n');
    write(path.join(custom, 'bmad-testarch-atdd.toml'), '[workflow]\non_complete = "red"\npersistent_facts = ["older"]\n');
    migrate(root);
    assert.deepEqual(TOML.parse(read(path.join(custom, 'bmad-tea-automate.toml'))).workflow.red, {
      on_complete: 'red',
      persistent_facts: ['older'],
    });
    assert.deepEqual(fs.readdirSync(custom), ['bmad-tea-automate.toml']);
  });
});

test('restores from the newest backup that holds the file, after live files, and leaves backups alone', () => {
  withProject(({ root, custom }) => {
    write(path.join(backupCustom(root, '.v6-v7-migration-backup-2026-10-03'), 'bmad-tea.toml'), '[agent]\n');
    write(path.join(backupCustom(root, '.v6-v7-migration-backup-2026-10-01'), 'bmad-tea-atdd.toml'), '[workflow]\non_complete = "older"\n');
    write(
      path.join(backupCustom(root, '.v6-v7-migration-backup-2026-09-01'), 'bmad-tea-atdd.toml'),
      '[workflow]\non_complete = "oldest"\n',
    );
    write(
      path.join(backupCustom(root, '.v6-v7-migration-backup-2026-09-01'), 'bmad-tea-atdd.user.toml'),
      '[workflow]\non_complete = "backup"\n',
    );
    write(path.join(custom, 'bmad-tea-atdd.user.toml'), '[workflow]\non_complete = "live"\n');
    const backups = tree(path.join(root, '.v6-v7-migration-backup-2026-09-01'));
    const preview = cli(['--project-root', root, '--check'], root);
    assert.equal(preview.status, 0, preview.stderr);
    assert.match(
      preview.stdout,
      /^Would move bmad-tea-atdd\.toml \[workflow\] -> bmad-tea-automate\.toml \[workflow\.red\] \(from \.v6-v7-migration-backup-2026-10-01\)$/m,
    );
    assert.match(preview.stdout, /^Would move bmad-tea-atdd\.user\.toml \[workflow\] -> bmad-tea-automate\.user\.toml \[workflow\.red\]$/m);
    assert.equal(fs.existsSync(path.join(custom, 'bmad-tea-automate.toml')), false);
    const result = cli(['--project-root', root], root);
    assert.equal(result.status, 0, result.stderr);
    const teamTarget = path.join(custom, 'bmad-tea-automate.toml');
    assert.equal(read(teamTarget), '[workflow.red]\non_complete = "older"\n');
    assert.equal(fs.statSync(teamTarget).mode & 0o777, 0o644);
    assert.equal(TOML.parse(read(path.join(custom, 'bmad-tea-automate.user.toml'))).workflow.red.on_complete, 'live');
    assert.deepEqual(tree(path.join(root, '.v6-v7-migration-backup-2026-09-01')), backups);
    assert.equal(
      read(path.join(backupCustom(root, '.v6-v7-migration-backup-2026-10-01'), 'bmad-tea-atdd.toml')),
      '[workflow]\non_complete = "older"\n',
    );
    assert.deepEqual(JSON.parse(read(path.join(custom, '.tea-customization-migration.json'))), {
      version: 1,
      restored: {
        'bmad-tea-atdd.toml': '.v6-v7-migration-backup-2026-10-01',
        'bmad-tea-atdd.user.toml': 'live',
        'bmad-tea-automate.toml|red|on_complete': '.v6-v7-migration-backup-2026-10-01',
      },
      kept: {},
    });
    const rerun = cli(['--project-root', root], root);
    assert.equal(rerun.status, 0, rerun.stderr);
    assert.equal(rerun.stdout, 'No legacy TEA customizations found.\n', 'the backup copy of a migrated live file never resurfaces');
    assert.deepEqual(tree(path.join(root, '.v6-v7-migration-backup-2026-09-01')), backups);
  });
});

test('restores a backup into a project whose custom folder was removed', () => {
  withProject(({ root, custom }) => {
    fs.rmdirSync(custom);
    write(
      path.join(backupCustom(root, '.v6-v7-migration-backup-1'), 'bmad-testarch-ci.toml'),
      '[workflow]\nci_platform = "github-actions"\n',
    );
    assert.equal(fs.existsSync(custom), false);
    assert.equal(migrate(root, { check: true }).length, 1);
    assert.equal(fs.existsSync(custom), false);
    assert.equal(migrate(root).length, 1);
    assert.equal(read(path.join(custom, 'bmad-tea-framework.toml')), '[workflow.ci]\nci_platform = "github-actions"\n');
    assert.equal(migrate(root).length, 0);
  });
});

test('a backup value that differs from the target is a conflict until --keep-existing records the kept value', () => {
  withProject(({ root, custom }) => {
    const target = path.join(custom, 'bmad-tea-automate.toml');
    const record = path.join(custom, '.tea-customization-migration.json');
    const backup = path.join(backupCustom(root, '.v6-v7-migration-backup-a'), 'bmad-tea-atdd.toml');
    write(target, '[workflow.red]\non_complete = "mine"\n');
    write(backup, '[workflow]\non_complete = "backup"\npersistent_facts = ["restored"]\n');
    const before = tree(root);
    for (const args of [['--check'], []]) {
      const refused = cli(['--project-root', root, ...args], root);
      assert.equal(refused.status, 2);
      assert.ok(
        refused.stderr.includes(
          `Conflicting on_complete: "backup" in ${backup} (from .v6-v7-migration-backup-a) and "mine" in ${target} [workflow.red]. Make them agree, or rerun with --keep-existing to keep the existing value.`,
        ),
        refused.stderr,
      );
      assert.deepEqual(tree(root), before);
    }
    const preview = cli(['--project-root', root, '--check', '--keep-existing'], root);
    assert.equal(preview.status, 0, preview.stderr);
    assert.match(preview.stdout, /^Would keep on_complete = "mine" in bmad-tea-automate\.toml \[workflow\.red\]; ignoring "backup" /m);
    assert.deepEqual(tree(root), before);
    const result = cli(['--project-root', root, '--keep-existing'], root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout,
      /^Kept on_complete = "mine" in bmad-tea-automate\.toml \[workflow\.red\]; ignoring "backup" from bmad-tea-atdd\.toml \(from \.v6-v7-migration-backup-a\)$/m,
    );
    assert.deepEqual(TOML.parse(read(target)).workflow.red, { on_complete: 'mine', persistent_facts: ['restored'] });
    const recordText = read(record);
    assert.deepEqual(JSON.parse(recordText), {
      version: 1,
      restored: {
        'bmad-tea-atdd.toml': '.v6-v7-migration-backup-a',
        'bmad-tea-automate.toml|red|persistent_facts': '.v6-v7-migration-backup-a',
      },
      kept: { 'bmad-tea-automate.toml|red|on_complete': '.v6-v7-migration-backup-a' },
    });
    for (const value of ['"mine"', '"backup"', '["restored"]']) assert.ok(!recordText.includes(value), 'the record holds no values');
    for (const folder of Object.values({ ...JSON.parse(recordText).restored, ...JSON.parse(recordText).kept })) {
      assert.equal(folder, '.v6-v7-migration-backup-a');
    }
    const rerun = cli(['--project-root', root], root);
    assert.equal(rerun.status, 0, rerun.stderr);
    assert.equal(rerun.stdout, 'No legacy TEA customizations found.\n');
    write(target, read(target).replace('"restored"', '"edited later"').replace('"mine"', '"mine again"'));
    const afterEdit = cli(['--project-root', root], root);
    assert.equal(afterEdit.status, 0, afterEdit.stderr);
    assert.equal(afterEdit.stdout, 'No legacy TEA customizations found.\n');
    assert.deepEqual(TOML.parse(read(target)).workflow.red, { on_complete: 'mine again', persistent_facts: ['edited later'] });
    assert.equal(read(record), recordText);
  });
});

test('backup keys the record lists are never restored or questioned again', () => {
  withProject(({ root, custom }) => {
    const target = path.join(custom, 'bmad-tea-automate.toml');
    write(target, '[workflow.red]\non_complete = "edited after restore"\n');
    write(
      path.join(backupCustom(root, '.v6-v7-migration-backup-a'), 'bmad-tea-atdd.toml'),
      '[workflow]\non_complete = "backup"\npersistent_facts = ["deleted by user"]\n',
    );
    write(
      path.join(custom, '.tea-customization-migration.json'),
      JSON.stringify({
        version: 1,
        restored: { 'bmad-tea-automate.toml|red|on_complete': '.v6-v7-migration-backup-a' },
        kept: { 'bmad-tea-automate.toml|red|persistent_facts': '.v6-v7-migration-backup-a' },
      }),
    );
    const result = cli(['--project-root', root], root);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'No legacy TEA customizations found.\n');
    assert.equal(read(target), '[workflow.red]\non_complete = "edited after restore"\n');
  });
});

test('a damaged migration record stops the run and names the file', () => {
  withProject(({ root, custom }) => {
    const record = path.join(custom, '.tea-customization-migration.json');
    write(path.join(custom, 'bmad-testarch-nfr.toml'), '[workflow]\non_complete = "nfr"\n');
    for (const text of [
      '{not json',
      JSON.stringify({ version: 2, restored: {}, kept: {} }),
      JSON.stringify({ version: 1, restored: { a: 1 }, kept: {} }),
    ]) {
      write(record, text);
      const before = tree(root);
      const result = cli(['--project-root', root], root);
      assert.equal(result.status, 2);
      assert.ok(result.stderr.includes(`Cannot read migration record ${record}`), result.stderr);
      assert.deepEqual(tree(root), before);
    }
  });
});

test('a kept backup value is reported once even when nothing else changes', () => {
  withProject(({ root, custom }) => {
    write(path.join(custom, 'bmad-tea-framework.toml'), '[workflow.ci]\nci_platform = "github-actions"\n');
    write(path.join(backupCustom(root, '.v6-v7-migration-backup-a'), 'bmad-tea-ci.toml'), '[workflow]\nci_platform = "gitlab-ci"\n');
    assert.equal(cli(['--project-root', root], root).status, 2);
    const result = cli(['--project-root', root, '--keep-existing'], root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Kept ci_platform = "github-actions" in bmad-tea-framework\.toml \[workflow\.ci\]; ignoring "gitlab-ci"/);
    assert.doesNotMatch(result.stdout, /No legacy TEA customizations found/);
    assert.equal(read(path.join(custom, 'bmad-tea-framework.toml')), '[workflow.ci]\nci_platform = "github-actions"\n');
    assert.equal(cli(['--project-root', root], root).stdout, 'No legacy TEA customizations found.\n');
  });
});

test('comments of a legacy file survive when its values are already present in the target', () => {
  withProject(({ root, custom }) => {
    write(path.join(custom, 'bmad-tea-automate.toml'), '[workflow.red]\non_complete = "same"\n');
    write(path.join(custom, 'bmad-tea-atdd.toml'), '# keep this note\n[workflow]\n# persistent_facts = ["x"]\non_complete = "same"\n');
    const result = cli(['--project-root', root], root);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(path.join(custom, 'bmad-tea-atdd.toml')), false);
    const text = read(path.join(custom, 'bmad-tea-automate.toml'));
    assert.match(text, /# keep this note/);
    assert.match(text, /# persistent_facts = \["x"\]/);
    assert.deepEqual(TOML.parse(text).workflow.red, { on_complete: 'same' });
  });
});

test('a file restored from a backup keeps the backup file mode', () => {
  withProject(({ root, custom }) => {
    const backup = path.join(backupCustom(root, '.v6-v7-migration-backup-a'), 'bmad-tea-atdd.user.toml');
    write(backup, '[workflow]\non_complete = "private"\n');
    fs.chmodSync(backup, 0o600);
    const result = cli(['--project-root', root], root);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.statSync(path.join(custom, 'bmad-tea-automate.user.toml')).mode & 0o777, 0o600);
  });
});

test('reports every conflict with values and provenance, exits 2 and changes nothing', () => {
  withProject(({ root, custom }) => {
    write(path.join(custom, 'bmad-tea-atdd.toml'), '[workflow]\non_complete = "live red"\n');
    write(path.join(custom, 'bmad-tea-automate.toml'), '[workflow.red]\non_complete = "target red"\n');
    write(path.join(custom, 'bmad-tea-ci.user.toml'), '[workflow]\nci_platform = "github-actions"\n');
    write(
      path.join(backupCustom(root, '.v6-v7-migration-backup-z'), 'bmad-testarch-ci.user.toml'),
      '[workflow]\nci_platform = "gitlab-ci"\n',
    );
    write(path.join(custom, 'bmad-testarch-nfr.toml'), '[workflow]\non_complete = "nfr"\n');
    const before = tree(root);
    for (const args of [['--check'], []]) {
      const result = cli(['--project-root', root, ...args], root);
      assert.equal(result.status, 2);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /nothing was changed/);
      assert.ok(
        result.stderr.includes(
          `Conflicting on_complete: "live red" in ${path.join(custom, 'bmad-tea-atdd.toml')} (live) and "target red" in ${path.join(custom, 'bmad-tea-automate.toml')} [workflow.red]`,
        ),
        result.stderr,
      );
      assert.ok(
        result.stderr.includes(
          `Conflicting ci_platform: "github-actions" in ${path.join(custom, 'bmad-tea-ci.user.toml')} (live) and "gitlab-ci" in ${path.join(backupCustom(root, '.v6-v7-migration-backup-z'), 'bmad-testarch-ci.user.toml')} (from .v6-v7-migration-backup-z)`,
        ),
        result.stderr,
      );
      assert.deepEqual(tree(root), before);
    }
  });
});

test('a rerun after an interrupted run removes a source whose values the target already holds', () => {
  withProject(({ root, custom }) => {
    const target = path.join(custom, 'bmad-tea-framework.user.toml');
    const targetText = '[workflow.ci]\nci_platform = "github-actions"\n';
    write(target, targetText);
    write(path.join(custom, 'bmad-tea-ci.user.toml'), '[workflow]\nci_platform = "github-actions"\n');
    const actions = migrate(root);
    assert.deepEqual(
      actions.map((action) => action.kind),
      ['remove'],
    );
    assert.equal(read(target), targetText);
    assert.deepEqual(fs.readdirSync(custom), ['bmad-tea-framework.user.toml']);
  });
});

test('--check writes nothing', () => {
  withProject(({ root, custom }) => {
    write(path.join(custom, 'bmad-tea-atdd.toml'), '[workflow]\non_complete = "red"\n');
    write(path.join(custom, 'bmad-tea-framework.toml'), '[workflow]\nci_platform = "github-actions"\n');
    write(path.join(custom, 'bmad-testarch-trace.toml'), '[workflow]\non_complete = "trace"\n');
    const before = tree(root);
    const result = cli(['--project-root', root, '--check'], root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout,
      /^Would move bmad-tea-framework\.toml \[workflow\]\.ci_platform -> bmad-tea-framework\.toml \[workflow\.ci\]$/m,
    );
    assert.match(result.stdout, /^Would move bmad-tea-atdd\.toml \[workflow\] -> bmad-tea-automate\.toml \[workflow\.red\]$/m);
    assert.match(result.stdout, /^Would move .*bmad-testarch-trace\.toml -> .*bmad-tea-trace\.toml$/m);
    assert.deepEqual(tree(root), before);
  });
});

test('moves a top-level framework ci_platform into [workflow.ci] of the same file', () => {
  withProject(({ root, custom }) => {
    const team = path.join(custom, 'bmad-tea-framework.toml');
    const user = path.join(custom, 'bmad-tea-framework.user.toml');
    write(team, '# head\n[workflow]\nci_platform = "github-actions" # keep me\non_complete = "done"\n');
    write(user, '[workflow]\nci_platform = "gitlab-ci"\n\n[workflow.ci]\nci_platform = "gitlab-ci"\npersistent_facts = ["x"]\n');
    const result = cli(['--project-root', root], root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^bmad-tea-framework\.toml \[workflow\]\.ci_platform -> bmad-tea-framework\.toml \[workflow\.ci\]$/m);
    assert.equal(read(team), '# head\n[workflow]\non_complete = "done"\n\n[workflow.ci]\nci_platform = "github-actions" # keep me\n');
    assert.equal(read(user), '[workflow]\n\n[workflow.ci]\nci_platform = "gitlab-ci"\npersistent_facts = ["x"]\n');
    assert.equal(cli(['--project-root', root], root).stdout, 'No legacy TEA customizations found.\n');
    write(user, '[workflow]\nci_platform = "gitlab-ci"\n\n[workflow.ci]\nactivation_steps_prepend = ["y"]\n');
    migrate(root);
    assert.equal(read(user), '[workflow]\n\n[workflow.ci]\nactivation_steps_prepend = ["y"]\nci_platform = "gitlab-ci"\n');
  });
});

test('a top-level ci_platform that differs from [workflow.ci] is a conflict', () => {
  withProject(({ root, custom }) => {
    const team = path.join(custom, 'bmad-tea-framework.toml');
    const text = '[workflow]\nci_platform = "github-actions"\n\n[workflow.ci]\nci_platform = "gitlab-ci"\n';
    write(team, text);
    assert.throws(
      () => migrate(root),
      (error) =>
        error.message.includes(
          `Conflicting ci_platform: "github-actions" in ${team} [workflow] (live) and "gitlab-ci" in ${team} [workflow.ci]`,
        ),
    );
    assert.equal(read(team), text);
  });
});

test('moves a pre-3.0 framework file and its top-level ci_platform together', () => {
  withProject(({ root, custom }) => {
    write(path.join(custom, 'bmad-testarch-framework.user.toml'), '[workflow]\nci_platform = "circle-ci"\n');
    migrate(root);
    assert.deepEqual(fs.readdirSync(custom), ['bmad-tea-framework.user.toml']);
    assert.equal(read(path.join(custom, 'bmad-tea-framework.user.toml')), '[workflow]\n\n[workflow.ci]\nci_platform = "circle-ci"\n');
  });
});

test('rolls back target writes, creations and source removals when a later step fails', () => {
  withProject(({ root, custom }) => {
    const files = {
      'bmad-tea-atdd.toml': '[workflow]\non_complete = "red"\n',
      'bmad-tea-ci.toml': '[workflow]\nci_platform = "github-actions"\n',
      'bmad-tea-framework.toml': '# framework\n[workflow]\non_complete = "framework"\n',
      'bmad-testarch-nfr.toml': '[workflow]\non_complete = "nfr"\n',
    };
    for (const [name, text] of Object.entries(files)) write(path.join(custom, name), text);
    const before = tree(root);
    const seen = [];
    assert.throws(
      () =>
        migrate(root, {
          beforeAction: (action, index) => {
            seen.push(action.kind);
            if (index === 4) throw new Error('injected failure');
          },
        }),
      /injected failure/,
    );
    assert.deepEqual(seen, ['move', 'create', 'remove', 'update', 'remove']);
    assert.deepEqual(tree(root), before);
    assert.equal(migrate(root).length, 5);
  });
});

test('a target edited during migration stops the run without undoing the edit and keeps the recovery file', () => {
  withProject(({ root, custom }) => {
    const source = path.join(custom, 'bmad-tea-atdd.toml');
    const target = path.join(custom, 'bmad-tea-automate.toml');
    write(source, '[workflow]\non_complete = "red"\n');
    write(target, '[workflow]\non_complete = "expand"\n');
    let message = '';
    try {
      migrate(root, {
        beforeAction: (action) => {
          if (action.kind === 'remove') fs.appendFileSync(target, '# concurrent\n');
        },
      });
    } catch (error) {
      message = error.message;
    }
    assert.match(message, /changed during migration/);
    const recovery = /rollback skipped for (\S+): it changed after the migration wrote it; the previous content is in (\S+)$/.exec(message);
    assert.ok(recovery, message);
    assert.equal(recovery[1], target);
    assert.equal(read(recovery[2]), '[workflow]\non_complete = "expand"\n');
    assert.equal(read(target), '[workflow]\non_complete = "expand"\n\n[workflow.red]\non_complete = "red"\n# concurrent\n');
    assert.equal(read(source), '[workflow]\non_complete = "red"\n');
  });
});

test('a removed source recreated during migration survives the rollback', () => {
  withProject(({ root, custom }) => {
    const source = path.join(custom, 'bmad-tea-atdd.toml');
    write(source, '[workflow]\non_complete = "red"\n');
    write(path.join(custom, 'bmad-tea-ci.toml'), '[workflow]\nci_platform = "github-actions"\n');
    let message = '';
    try {
      migrate(root, {
        beforeAction: (action, index) => {
          if (index !== 2) return;
          fs.writeFileSync(source, '# recreated by the user\n');
          throw new Error('injected failure');
        },
      });
    } catch (error) {
      message = error.message;
    }
    const recovery = /rollback skipped for (\S+): it changed after the migration removed it; the previous content is in (\S+)$/.exec(
      message,
    );
    assert.ok(recovery, message);
    assert.equal(recovery[1], source);
    assert.equal(read(source), '# recreated by the user\n');
    assert.equal(read(recovery[2]), '[workflow]\non_complete = "red"\n');
    assert.equal(fs.existsSync(path.join(custom, 'bmad-tea-automate.toml')), false, 'unchanged writes are still undone');
    assert.equal(fs.existsSync(path.join(custom, 'bmad-tea-framework.toml')), false);
  });
});

test('restores a pre-3.0 owning-skill file from a backup and moves its ci_platform in the same run', () => {
  withProject(({ root, custom }) => {
    const folder = '.v6-v7-migration-backup-2026-10-01';
    const backup = path.join(backupCustom(root, folder), 'bmad-testarch-framework.toml');
    write(backup, '# framework note\n[workflow]\nci_platform = "gitlab-ci"\non_complete = "x"\n', 0o600);
    write(
      path.join(backupCustom(root, '.v6-v7-migration-backup-2026-10-02'), 'bmad-tea-framework.toml'),
      '[workflow]\non_complete = "newer name"\n',
    );
    const before = tree(path.join(root, folder));
    const result = cli(['--project-root', root], root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout,
      /^bmad-testarch-framework\.toml -> bmad-tea-framework\.toml \(from \.v6-v7-migration-backup-2026-10-01\)$/m,
    );
    assert.match(result.stdout, /^bmad-tea-framework\.toml \[workflow\]\.ci_platform -> bmad-tea-framework\.toml \[workflow\.ci\]$/m);
    const target = path.join(custom, 'bmad-tea-framework.toml');
    assert.deepEqual(TOML.parse(read(target)), { workflow: { on_complete: 'x', ci: { ci_platform: 'gitlab-ci' } } });
    assert.match(read(target), /^# framework note\n/);
    assert.equal(fs.statSync(target).mode & 0o777, 0o600);
    assert.deepEqual(tree(path.join(root, folder)), before);
    assert.equal(JSON.parse(read(path.join(custom, '.tea-customization-migration.json'))).restored['bmad-tea-framework.toml'], folder);
    assert.equal(cli(['--project-root', root], root).stdout, 'No legacy TEA customizations found.\n');
    fs.unlinkSync(target);
    assert.equal(
      cli(['--project-root', root], root).stdout,
      'No legacy TEA customizations found.\n',
      'a file the user deleted stays deleted',
    );
    assert.equal(fs.existsSync(target), false);
  });
});

test('folds retired red-mode settings into an owning-skill file restored in the same run', () => {
  withProject(({ root, custom }) => {
    const folder = '.v6-v7-migration-backup-a';
    write(path.join(backupCustom(root, folder), 'bmad-tea-automate.user.toml'), '[workflow]\non_complete = "expand"\n');
    write(path.join(backupCustom(root, folder), 'bmad-tea-atdd.user.toml'), '[workflow]\non_complete = "red"\n');
    const actions = migrate(root);
    assert.deepEqual(
      actions.map((action) => action.kind),
      ['create'],
    );
    assert.equal(
      read(path.join(custom, 'bmad-tea-automate.user.toml')),
      '[workflow]\non_complete = "expand"\n\n[workflow.red]\non_complete = "red"\n',
    );
    assert.equal(migrate(root).length, 0);
  });
});

test('rewrites quoted [workflow] headers and keeps comments when only a fresh rendering verifies', () => {
  withProject(({ root, custom }) => {
    write(path.join(custom, 'bmad-tea-atdd.toml'), '["workflow"]\n# quoted note\non_complete = "q"\n\n[workflow."sub"]\nx = 1\n');
    write(path.join(custom, 'bmad-tea-atdd.user.toml'), '# top comment\nworkflow.on_complete = "dotted" # inline\n');
    migrate(root);
    assert.equal(
      read(path.join(custom, 'bmad-tea-automate.toml')),
      '["workflow".red]\n# quoted note\non_complete = "q"\n\n[workflow.red."sub"]\nx = 1\n',
    );
    const user = read(path.join(custom, 'bmad-tea-automate.user.toml'));
    assert.deepEqual(TOML.parse(user), { workflow: { red: { on_complete: 'dotted' } } });
    assert.match(user, /# Comments from bmad-tea-atdd\.user\.toml\n# top comment\n$/);
  });
});

test('names [modules.tea] keys of a legacy personal config that TEA ignores, without touching it', () => {
  withProject(({ root, custom }) => {
    const legacy = path.join(root, '_bmad', 'config.user.toml');
    const legacyText = '[modules.tea]\ntest_artifacts = "x"\ntea_use_mcp_enhancements = true\nrisk_threshold = "p1"\n';
    write(legacy, legacyText);
    write(path.join(root, '_bmad', 'config.toml'), '[modules.tea]\ntea_use_mcp_enhancements = false\n');
    write(path.join(custom, 'config.user.toml'), '[modules.tea]\nrisk_threshold = "p2"\n');
    const expected = `Not migrated by this command: ${legacy} [modules.tea] keys test_artifacts are ignored by TEA. Run \`bmad migrate tea\` to move them.\n`;
    for (const args of [['--check'], []]) {
      const result = cli(['--project-root', root, ...args], root);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, expected);
    }
    assert.equal(read(legacy), legacyText);
    write(path.join(custom, 'config.toml'), '[modules.tea]\ntest_artifacts = "y"\n');
    assert.equal(cli(['--project-root', root], root).stdout, 'No legacy TEA customizations found.\n');
  });
});

test('reads the legacy personal config from the newest backup that holds it', () => {
  withProject(({ root, custom }) => {
    write(path.join(root, '.v6-v7-migration-backup-2', '_bmad', 'config.toml'), '[core]\n');
    const backup = path.join(root, '.v6-v7-migration-backup-1', '_bmad', 'config.user.toml');
    write(backup, '[modules.tea]\ntest_artifacts = "x"\n');
    write(path.join(custom, 'bmad-testarch-nfr.toml'), '[workflow]\non_complete = "nfr"\n');
    const result = cli(['--project-root', root], root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /bmad-testarch-nfr\.toml -> /);
    assert.ok(
      result.stdout.includes(`Not migrated by this command: ${backup} [modules.tea] keys test_artifacts are ignored by TEA.`),
      result.stdout,
    );
  });
});

test('rejects symlinked retired stems, backup folders and backup files before changing anything', () => {
  withProject(({ root, custom }) => {
    const elsewhere = path.join(root, 'elsewhere.toml');
    write(elsewhere, '[workflow]\non_complete = "linked"\n');
    write(path.join(custom, 'bmad-testarch-nfr.toml'), '[workflow]\non_complete = "nfr"\n');
    const link = path.join(custom, 'bmad-tea-atdd.toml');
    fs.symlinkSync(elsewhere, link);
    assert.throws(
      () => migrate(root),
      (error) => error.message.includes(link) && error.message.includes('symlink'),
    );
    fs.unlinkSync(link);
    const realBackup = path.join(root, 'real-backup');
    write(path.join(realBackup, '_bmad', 'custom', 'bmad-tea-atdd.toml'), '[workflow]\non_complete = "linked"\n');
    const folder = path.join(root, '.v6-v7-migration-backup-link');
    fs.symlinkSync(realBackup, folder);
    assert.throws(
      () => migrate(root),
      (error) => error.message.includes(folder) && error.message.includes('real directory'),
    );
    fs.unlinkSync(folder);
    const backupFile = path.join(backupCustom(root, '.v6-v7-migration-backup-file'), 'bmad-tea-ci.user.toml');
    fs.mkdirSync(path.dirname(backupFile), { recursive: true });
    fs.symlinkSync(elsewhere, backupFile);
    assert.throws(
      () => migrate(root),
      (error) => error.message.includes(backupFile) && error.message.includes('symlink'),
    );
    assert.equal(fs.existsSync(path.join(custom, 'bmad-testarch-nfr.toml')), true);
    assert.equal(fs.existsSync(path.join(custom, 'bmad-tea-nfr.toml')), false);
  });
});

test('asks for a manual move when a retired file holds tables outside [workflow]', () => {
  withProject(({ root, custom }) => {
    const source = path.join(custom, 'bmad-tea-atdd.toml');
    write(source, '[workflow]\non_complete = "red"\n\n[agent]\nname = "x"\n');
    assert.throws(
      () => migrate(root),
      (error) => error.message.includes(source) && error.message.includes('agent outside [workflow]') && error.message.includes('manually'),
    );
    assert.equal(fs.existsSync(source), true);
    assert.equal(fs.existsSync(path.join(custom, 'bmad-tea-automate.toml')), false);
  });
});

test('asks for a manual edit when [workflow.red] is an inline table', () => {
  withProject(({ root, custom }) => {
    const target = path.join(custom, 'bmad-tea-automate.toml');
    write(target, '[workflow]\nred = { on_complete = "red" }\n');
    write(path.join(custom, 'bmad-tea-atdd.toml'), '[workflow]\npersistent_facts = ["x"]\n');
    assert.throws(
      () => migrate(root),
      (error) => error.message.includes(`Cannot safely edit ${target}`) && error.message.includes('[workflow.red]'),
    );
    assert.equal(read(target), '[workflow]\nred = { on_complete = "red" }\n');
  });
});

test('requires a manual merge when old and new files coexist, preserving their comments', () => {
  withProject(({ root, custom }) => {
    const oldFile = path.join(custom, 'bmad-testarch-evaluate.user.toml');
    const newFile = path.join(custom, 'bmad-tea-evaluate.user.toml');
    const oldText = '# team note\n[workflow]\nevaluations_folder = "my-evals"\n';
    const newText = '# new note\n[workflow]\non_complete = "report result"\n';
    write(oldFile, oldText);
    write(newFile, newText);
    assert.throws(
      () => migrate(root),
      (error) =>
        error.message.includes('Merge their values and comments manually') &&
        error.message.includes(oldFile) &&
        error.message.includes(newFile),
    );
    assert.equal(read(oldFile), oldText);
    assert.equal(read(newFile), newText);
  });
});

test('updates agent menu references while preserving comments, formatting and private mode', () => {
  withProject(({ root, custom }) => {
    const menu = path.join(custom, 'bmad-tea.user.toml');
    const old = path.join(custom, 'bmad-testarch-evaluate.user.toml');
    const menuText =
      '# keep this comment\n[[agent.menu]]\ncode = "EV"\nskill = "bmad-testarch-evaluate" # preserve this\n\n[[agent.menu]]\ncode = "TMT"\nskill = \'bmad-teach-me-testing\'\n\n[[agent.menu]]\ncode = "AT"\nskill = "bmad-testarch-atdd"\n\n[[agent.menu]]\ncode = "CI"\nskill = "bmad-testarch-ci"\n';
    write(menu, menuText, 0o600);
    write(old, '# keep this workflow note\n[workflow]\non_complete = "done"\n', 0o600);
    const actions = migrate(root);
    assert.equal(actions.length, 2);
    assert.equal(
      read(menu),
      menuText
        .replace('bmad-testarch-evaluate', 'bmad-tea-evaluate')
        .replace('bmad-teach-me-testing', 'bmad-tea-teach-me-testing')
        .replace('bmad-testarch-atdd', 'bmad-tea-automate')
        .replace('bmad-testarch-ci', 'bmad-tea-framework'),
    );
    assert.equal(fs.statSync(menu).mode & 0o777, 0o600);
    const moved = path.join(custom, 'bmad-tea-evaluate.user.toml');
    assert.equal(read(moved), '# keep this workflow note\n[workflow]\non_complete = "done"\n');
    assert.equal(fs.statSync(moved).mode & 0o777, 0o600);
  });
});

test('rejects symlinks and malformed TOML with the source path before moving any file', () => {
  withProject(({ root, custom }) => {
    const first = path.join(custom, 'bmad-testarch-automate.toml');
    const second = path.join(custom, 'bmad-testarch-evaluate.toml');
    write(first, '[workflow]\non_complete = "safe"\n');
    write(second, '[workflow\n');
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
  });
});

test('CLI migrates a project from another working directory', () => {
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-migration-cwd-'));
  try {
    withProject(({ root, custom }) => {
      write(path.join(custom, 'bmad-teach-me-testing.toml'), '[workflow]\non_complete = "from elsewhere"\n');
      const preview = cli(['--project-root', root, '--check'], elsewhere);
      assert.equal(preview.status, 0, preview.stderr);
      assert.match(preview.stdout, /Would move .*bmad-teach-me-testing\.toml -> .*bmad-tea-teach-me-testing\.toml/);
      assert.equal(fs.existsSync(path.join(custom, 'bmad-tea-teach-me-testing.toml')), false);
      const result = cli(['--project-root', root], elsewhere);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(TOML.parse(read(path.join(custom, 'bmad-tea-teach-me-testing.toml'))).workflow.on_complete, 'from elsewhere');
    });
  } finally {
    fs.rmSync(elsewhere, { recursive: true, force: true });
  }
});

test('CLI rejects unknown arguments before reading any project', () => {
  withProject(({ root, custom }) => {
    write(path.join(custom, 'bmad-testarch-nfr.toml'), '[workflow]\non_complete = "nfr"\n');
    for (const args of [['--bogus'], ['--project-root', root, '--bogus'], ['--bogus', '--project-root', root]]) {
      const result = cli(args, root);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /Usage: tea-migrate-customizations \[--project-root PATH\] \[--check\] \[--keep-existing\]/);
    }
    assert.equal(fs.existsSync(path.join(custom, 'bmad-testarch-nfr.toml')), true);
  });
});

test('concurrent destination creation stops migration without overwriting it and rolls back earlier moves', () => {
  withProject(({ root, custom }) => {
    const first = path.join(custom, 'bmad-testarch-automate.toml');
    const second = path.join(custom, 'bmad-testarch-evaluate.toml');
    const firstNew = path.join(custom, 'bmad-tea-automate.toml');
    const secondNew = path.join(custom, 'bmad-tea-evaluate.toml');
    write(first, '[workflow]\non_complete="first"\n');
    write(second, '[workflow]\non_complete="second"\n');
    assert.throws(
      () =>
        migrate(root, {
          beforeAction: (action, index) => {
            if (index === 1) fs.writeFileSync(action.newFile, '[workflow]\non_complete="concurrent"\n');
          },
        }),
      (error) => error.message.includes(secondNew) && error.message.includes('appeared'),
    );
    assert.equal(read(first), '[workflow]\non_complete="first"\n');
    assert.equal(fs.existsSync(firstNew), false);
    assert.equal(read(second), '[workflow]\non_complete="second"\n');
    assert.equal(read(secondNew), '[workflow]\non_complete="concurrent"\n');
  });
});

test('a stale lock names its path and recovery without deleting it', () => {
  withProject(({ root, custom }) => {
    const lock = path.join(custom, '.tea-migration.lock');
    fs.mkdirSync(lock, { recursive: true });
    write(path.join(custom, 'bmad-testarch-nfr.toml'), '[workflow]\non_complete="keep"\n');
    assert.throws(
      () => migrate(root),
      (error) => error.message.includes(lock) && error.message.includes('remove the stale lock'),
    );
    assert.equal(fs.existsSync(lock), true);
    assert.equal(fs.existsSync(path.join(custom, 'bmad-testarch-nfr.toml')), true);
  });
});
