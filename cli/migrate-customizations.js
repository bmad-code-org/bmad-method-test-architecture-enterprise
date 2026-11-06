#!/usr/bin/env node
/** Move pre-3.0 TEA customization files and menu references to canonical names. */
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const TOML = require('smol-toml');

const NAMES = ['automate', 'evaluate', 'framework', 'nfr', 'test-design', 'test-review', 'trace', 'atdd', 'ci'];
const PAIRS = [
  ...NAMES.map((suffix) => [`bmad-testarch-${suffix}`, `bmad-tea-${suffix}`]),
  ['bmad-teach-me-testing', 'bmad-tea-teach-me-testing'],
];
const MENU_NAMES = new Map(PAIRS);
MENU_NAMES.set('bmad-testarch-atdd', 'bmad-tea-automate');
MENU_NAMES.set('bmad-testarch-ci', 'bmad-tea-framework');

function isTable(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

function conflictAt(oldValue, newValue, key = '') {
  for (const [name, value] of Object.entries(oldValue)) {
    if (!Object.hasOwn(newValue, name)) continue;
    const location = key ? `${key}.${name}` : name;
    if (isTable(value) && isTable(newValue[name])) {
      const nested = conflictAt(value, newValue[name], location);
      if (nested) return nested;
    } else if (!isDeepStrictEqual(value, newValue[name])) return location;
  }
  return null;
}

function parse(file, source) {
  try {
    return TOML.parse(source);
  } catch (error) {
    throw new Error(`Cannot parse ${file}: ${error.message}`);
  }
}

/** Reject links and non-files before any content is read or changed. */
function readFile(file) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`Cannot inspect ${file}: ${error.message}`);
  }
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error(`Customization path must be a regular file, not a symlink or special file: ${file}`);
  return { file, stat, text: fs.readFileSync(file, 'utf8') };
}

function checkDirectory(directory, required = false) {
  let stat;
  try {
    stat = fs.lstatSync(directory);
  } catch (error) {
    if (error.code === 'ENOENT' && !required) return false;
    if (error.code === 'ENOENT') throw new Error(`Project root does not exist: ${directory}`);
    throw new Error(`Cannot inspect ${directory}: ${error.message}`);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Customization path must be a real directory: ${directory}`);
  return true;
}

/** Edit only skill assignments inside agent menu entries, retaining every other byte. */
function rewriteMenu(file, source) {
  const original = parse(file, source);
  const menus = original.agent?.menu;
  if (menus !== undefined && !Array.isArray(menus)) throw new Error(`Expected [[agent.menu]] entries in ${file}`);
  const expected = structuredClone(original);
  let expectedChanges = 0;
  for (const menu of expected.agent?.menu ?? []) {
    if (typeof menu.skill !== 'string' || !(menu.skill.startsWith('bmad-testarch-') || menu.skill === 'bmad-teach-me-testing')) continue;
    const replacement = MENU_NAMES.get(menu.skill);
    if (!replacement) throw new Error(`Unknown legacy menu skill ${JSON.stringify(menu.skill)} in ${file}; update it manually`);
    menu.skill = replacement;
    expectedChanges++;
  }
  if (expectedChanges === 0) return null;
  let inMenu = false;
  let actualChanges = 0;
  const lines = source.split(/(\r?\n)/);
  for (let index = 0; index < lines.length; index += 2) {
    const line = lines[index];
    if (/^\s*\[/.test(line)) inMenu = /^\s*\[\[agent\.menu\]\]\s*(?:#.*)?$/.test(line);
    if (!inMenu) continue;
    const match = /^(\s*skill\s*=\s*)(["'])([^"']+)\2(\s*(?:#.*)?)$/.exec(line);
    if (!match || !MENU_NAMES.has(match[3])) continue;
    lines[index] = `${match[1]}${match[2]}${MENU_NAMES.get(match[3])}${match[2]}${match[4]}`;
    actualChanges++;
  }
  const rewritten = lines.join('');
  if (actualChanges !== expectedChanges || !isDeepStrictEqual(parse(file, rewritten), expected)) {
    throw new Error(`Cannot safely rewrite legacy menu skill references in ${file}; update them manually`);
  }
  return rewritten;
}

function preflight(customRoot) {
  const actions = [];
  for (const [oldName, newName] of PAIRS) {
    for (const suffix of ['.toml', '.user.toml']) {
      const oldFile = path.join(customRoot, oldName + suffix);
      const newFile = path.join(customRoot, newName + suffix);
      const old = readFile(oldFile);
      const current = readFile(newFile);
      if (!old) continue;
      const oldValue = parse(oldFile, old.text);
      if (current) {
        const newValue = parse(newFile, current.text);
        const conflict = conflictAt(oldValue, newValue);
        if (conflict) throw new Error(`Conflicting ${conflict} in ${oldFile} and ${newFile}`);
        throw new Error(
          `Both ${oldFile} and ${newFile} exist. Merge their values and comments manually into ${newFile}, then remove ${oldFile} and rerun.`,
        );
      }
      actions.push({ kind: 'move', oldFile, newFile, old });
    }
  }
  for (const suffix of ['.toml', '.user.toml']) {
    const file = path.join(customRoot, 'bmad-tea' + suffix);
    const old = readFile(file);
    if (!old) continue;
    const rewritten = rewriteMenu(file, old.text);
    if (rewritten !== null) actions.push({ kind: 'rewrite', oldFile: file, newFile: file, old, text: rewritten });
  }
  return actions;
}

function unchanged(snapshot) {
  const current = readFile(snapshot.file);
  return (
    current !== null &&
    current.stat.dev === snapshot.stat.dev &&
    current.stat.ino === snapshot.stat.ino &&
    current.stat.mode === snapshot.stat.mode &&
    current.text === snapshot.text
  );
}

/** Apply staged changes under one exclusive lock and undo completed actions on failure. */
function applyActions(actions, customRoot, beforeAction) {
  const completed = [];
  const temporary = [];
  let rollbackSafe = true;
  try {
    for (const [index, action] of actions.entries()) {
      if (action.kind !== 'rewrite') continue;
      const temp = path.join(customRoot, `.tea-migration-${process.pid}-${index}.tmp`);
      fs.writeFileSync(temp, action.text, { flag: 'wx', mode: action.old.stat.mode & 0o777 });
      fs.chmodSync(temp, action.old.stat.mode & 0o777);
      action.temp = temp;
      temporary.push(temp);
    }
    for (const [index, action] of actions.entries()) {
      beforeAction?.(action, index);
      if (!unchanged(action.old)) throw new Error(`Customization changed during migration: ${action.oldFile}`);
      if (action.kind === 'move') {
        if (readFile(action.newFile) !== null) throw new Error(`Customization appeared during migration: ${action.newFile}`);
        fs.linkSync(action.oldFile, action.newFile);
        completed.push(action);
        fs.unlinkSync(action.oldFile);
      } else {
        const backup = path.join(customRoot, `.tea-migration-${process.pid}-${index}.bak`);
        fs.linkSync(action.oldFile, backup);
        action.backup = backup;
        completed.push(action);
        fs.renameSync(action.temp, action.oldFile);
      }
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const action of completed.toReversed()) {
      try {
        if (action.kind === 'move') {
          if (!fs.existsSync(action.oldFile)) fs.linkSync(action.newFile, action.oldFile);
          fs.unlinkSync(action.newFile);
        } else {
          if (fs.existsSync(action.oldFile)) fs.unlinkSync(action.oldFile);
          fs.linkSync(action.backup, action.oldFile);
          fs.unlinkSync(action.backup);
        }
      } catch (rollbackError) {
        rollbackErrors.push(`${action.oldFile}: ${rollbackError.message}`);
      }
    }
    rollbackSafe = rollbackErrors.length === 0;
    throw new Error(`${error.message}${rollbackErrors.length > 0 ? `; rollback needs manual repair: ${rollbackErrors.join('; ')}` : ''}`);
  } finally {
    if (rollbackSafe) for (const action of actions) if (action.backup && fs.existsSync(action.backup)) fs.unlinkSync(action.backup);
    for (const temp of temporary) if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

function migrate(projectRoot, { check = false, beforeAction } = {}) {
  const root = path.resolve(projectRoot);
  checkDirectory(root, true);
  const bmadRoot = path.join(root, '_bmad');
  if (!checkDirectory(bmadRoot)) return [];
  const customRoot = path.join(bmadRoot, 'custom');
  if (!checkDirectory(customRoot)) return [];
  if (check) return preflight(customRoot);
  const lock = path.join(customRoot, '.tea-migration.lock');
  try {
    fs.mkdirSync(lock, { mode: 0o700 });
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(
        `Migration lock exists at ${lock}. Check for a running migration; if none is running, inspect and remove the stale lock directory, then retry.`,
      );
    }
    throw new Error(`Cannot lock ${customRoot} for migration: ${error.message}`);
  }
  try {
    const actions = preflight(customRoot);
    applyActions(actions, customRoot, beforeAction);
    return actions;
  } finally {
    fs.rmdirSync(lock);
  }
}

function main(argv = process.argv.slice(2)) {
  const usage =
    'Usage: tea-migrate-customizations [--project-root PATH] [--check] [--help]\nFor a directory beginning with a dash, use --project-root ./-name.';
  let projectRoot = process.cwd();
  let check = false;
  let help = false;
  const seen = new Set();
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--check' && !seen.has(arg)) {
      check = true;
    } else if (arg === '--project-root' && !seen.has(arg)) {
      const value = argv[++index];
      if (!value || value.startsWith('-')) throw new Error('--project-root requires a path');
      projectRoot = path.resolve(value);
    } else {
      throw new Error(usage);
    }
    seen.add(arg);
  }
  if (help) {
    process.stdout.write(`${usage}\n`);
    return 0;
  }
  const actions = migrate(projectRoot, { check });
  for (const action of actions) {
    process.stdout.write(
      action.kind === 'rewrite'
        ? `${check ? 'Would update' : 'Updated'} menu references in ${action.oldFile}\n`
        : `${check ? 'Would move ' : ''}${action.oldFile} -> ${action.newFile}\n`,
    );
  }
  if (actions.length === 0) process.stdout.write('No legacy TEA customizations found.\n');
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}

module.exports = { migrate, main };
