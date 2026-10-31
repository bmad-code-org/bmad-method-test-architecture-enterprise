#!/usr/bin/env node
/**
 * Move legacy TEA customizations to their current homes: pre-3.0 files to canonical names, the retired red-mode and CI
 * stems into [workflow.red] and [workflow.ci] of their owning skills, and agent menu references to current skill ids.
 */
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const TOML = require('smol-toml');

const NAMES = ['automate', 'evaluate', 'framework', 'nfr', 'test-design', 'test-review', 'trace'];
const PAIRS = [
  ...NAMES.map((suffix) => [`bmad-testarch-${suffix}`, `bmad-tea-${suffix}`]),
  ['bmad-teach-me-testing', 'bmad-tea-teach-me-testing'],
];
const MENU_NAMES = new Map(PAIRS);
MENU_NAMES.set('bmad-testarch-atdd', 'bmad-tea-automate');
MENU_NAMES.set('bmad-testarch-ci', 'bmad-tea-framework');
/** Retired customization stems whose [workflow] table now lives as a sub-table of the owning skill. */
const SURFACES = [
  { target: 'bmad-tea-automate', table: 'red', sources: ['bmad-tea-atdd', 'bmad-testarch-atdd'] },
  { target: 'bmad-tea-framework', table: 'ci', sources: ['bmad-tea-ci', 'bmad-testarch-ci'], moveCiPlatform: true },
];
const LAYERS = ['.toml', '.user.toml'];
const BACKUP_PREFIX = '.v6-v7-migration-backup-';
const HEADER = /^\s*(\[\[?)\s*([^[\]]*?)\s*(\]\]?)\s*(?:#.*)?$/;
const CI_PLATFORM_LINE = /^\s*(?:ci_platform|"ci_platform"|'ci_platform')\s*=/;

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

function tryParse(source) {
  try {
    return TOML.parse(source);
  } catch {
    return null;
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

/** Split text into lines that each keep their own line ending, so joining them restores every byte. */
function toLines(text) {
  const parts = text.split(/(\r?\n)/);
  const lines = [];
  for (let index = 0; index < parts.length; index += 2) lines.push({ text: parts[index], eol: parts[index + 1] ?? '' });
  return lines;
}

function joinLines(lines) {
  return lines.map((line) => line.text + line.eol).join('');
}

function lineEnding(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function headerPath(line) {
  const match = HEADER.exec(line);
  if (!match || match[1].length !== match[3].length) return null;
  return { array: match[1] === '[[', path: match[2].split('.').map((part) => part.trim()) };
}

/** Locate a `[a.b]` table header and the lines up to the next header. */
function findSection(lines, tablePath) {
  for (let start = 0; start < lines.length; start++) {
    const header = headerPath(lines[start].text);
    if (!header || header.array || header.path.join('.') !== tablePath) continue;
    let end = start + 1;
    while (end < lines.length && headerPath(lines[end].text) === null) end++;
    return { start, end };
  }
  return null;
}

/** Edit only the files whose structure is provably understood; anything else needs a person. */
function manualEdit(file, reason, table) {
  return new Error(`Cannot safely edit ${file}: ${reason}. Add the settings under ${table} by hand, then rerun.`);
}

/** Add lines at the end of a table section, before any trailing comments that introduce the next table. */
function insertIntoSection(file, text, tablePath, newLines) {
  const lines = toLines(text);
  const section = findSection(lines, tablePath);
  if (!section) throw manualEdit(file, `no [${tablePath}] header to add keys under`, `[${tablePath}]`);
  let at = section.start;
  for (let index = section.start + 1; index < section.end; index++) {
    const trimmed = lines[index].text.trim();
    if (trimmed !== '' && !trimmed.startsWith('#')) at = index;
  }
  const eol = lineEnding(text);
  const inserted = newLines.map((line) => ({ text: line, eol }));
  if (lines[at].eol === '') {
    lines[at].eol = eol;
    inserted.at(-1).eol = '';
  }
  lines.splice(at + 1, 0, ...inserted);
  return joinLines(lines);
}

/** Append a block after existing content, separated by one blank line, leaving every existing byte in place. */
function appendBlock(text, block) {
  if (text === '') return block;
  const eol = lineEnding(text);
  let result = text.endsWith('\n') ? text : text + eol;
  if (result.trim() !== '' && !/\r?\n\r?\n$/.test(result)) result += eol;
  return result + block;
}

/** Turn a legacy file's [workflow] table into [workflow.<table>], keeping its comments and layout when that is provably exact. */
function nestedSource(candidate, table) {
  const lines = toLines(candidate.text);
  for (const line of lines) {
    const match = /^(\s*\[\[?\s*workflow)(\s*(?:\.[^\]]*)?\]\]?\s*(?:#.*)?)$/.exec(line.text);
    if (match) line.text = `${match[1]}.${table}${match[2]}`;
  }
  const rewritten = joinLines(lines);
  const expected = { workflow: { [table]: candidate.table } };
  if (isDeepStrictEqual(tryParse(rewritten), expected)) return rewritten;
  return TOML.stringify(expected);
}

function renderKey(file, key, value, table) {
  const rendered = TOML.stringify({ [key]: value }).trimEnd();
  if (/^\s*\[/m.test(rendered)) throw manualEdit(file, `${key} is a table and cannot be inserted inside ${table}`, table);
  return rendered.split(/\r?\n/);
}

function provenance(candidate) {
  if (candidate.topLevel) return `${candidate.file} [workflow] (live)`;
  return candidate.live ? `${candidate.file} (live)` : `${candidate.file} (from ${candidate.provenance})`;
}

/** Folders a v6 to v7 upgrade left behind, newest first by name. */
function listBackups(root) {
  return fs
    .readdirSync(root)
    .filter((name) => name.startsWith(BACKUP_PREFIX))
    .toSorted()
    .toReversed();
}

/** The newest backup that actually holds the file wins; a newer backup without it never hides an older one. */
function findInBackups(root, backups, name) {
  for (const folder of backups) {
    const directory = path.join(root, folder);
    if (!checkDirectory(directory)) continue;
    const bmad = path.join(directory, '_bmad');
    const custom = path.join(bmad, 'custom');
    if (!checkDirectory(bmad) || !checkDirectory(custom)) continue;
    const found = readFile(path.join(custom, name));
    if (found) return { ...found, provenance: folder };
  }
  return null;
}

function collectCandidates(context, surface, suffix, targetName) {
  const candidates = [];
  for (const stem of surface.sources) {
    const name = stem + suffix;
    const live = readFile(path.join(context.customRoot, name));
    const found = live ? { ...live, provenance: 'live' } : findInBackups(context.root, context.backups, name);
    if (!found) continue;
    const value = parse(found.file, found.text);
    for (const key of Object.keys(value)) {
      if (key !== 'workflow')
        throw new Error(`${found.file} has ${key} outside [workflow]; move it manually into ${targetName}, then rerun.`);
    }
    if (value.workflow !== undefined && !isTable(value.workflow))
      throw new Error(`Expected a [workflow] table in ${found.file}; move its settings manually into ${targetName}, then rerun.`);
    candidates.push({ name, ...found, live: found.provenance === 'live', table: value.workflow ?? {} });
  }
  return candidates;
}

/** Find value conflicts and kept backup values against the target as it stands before this run. */
function analyse(candidates, targetTable, targetFile, tableLabel) {
  const conflicts = [];
  const kept = [];
  const keys = [...new Set(candidates.flatMap((candidate) => Object.keys(candidate.table)))];
  for (const key of keys) {
    const holders = candidates.filter((candidate) => Object.hasOwn(candidate.table, key));
    if (Object.hasOwn(targetTable, key)) {
      for (const candidate of holders) {
        if (isDeepStrictEqual(candidate.table[key], targetTable[key])) continue;
        if (candidate.live) {
          conflicts.push(
            `Conflicting ${key}: ${JSON.stringify(candidate.table[key])} in ${provenance(candidate)} and ${JSON.stringify(targetTable[key])} in ${targetFile} ${tableLabel}. Make them agree, then rerun.`,
          );
        } else kept.push({ key, candidate, value: targetTable[key] });
      }
      continue;
    }
    const [first, ...rest] = holders;
    for (const candidate of rest) {
      if (isDeepStrictEqual(candidate.table[key], first.table[key])) continue;
      conflicts.push(
        `Conflicting ${key}: ${JSON.stringify(first.table[key])} in ${provenance(first)} and ${JSON.stringify(candidate.table[key])} in ${provenance(candidate)}. Make them agree, or set ${key} under ${tableLabel} in ${targetFile} to the value you want, then rerun.`,
      );
    }
  }
  return { conflicts, kept };
}

/** Move `ci_platform` from [workflow] into [workflow.ci] of the same file, line and all. */
function moveCiPlatform(file, text, current) {
  const lines = toLines(text);
  const section = findSection(lines, 'workflow');
  const hits = [];
  for (let index = (section?.start ?? 0) + 1; section && index < section.end; index++) {
    if (CI_PLATFORM_LINE.test(lines[index].text)) hits.push(index);
  }
  if (hits.length !== 1) throw manualEdit(file, 'ci_platform is not a single line under a [workflow] header', '[workflow.ci]');
  const [moved] = lines.splice(hits[0], 1);
  const removed = joinLines(lines);
  const expected = parse(file, text);
  delete expected.workflow.ci_platform;
  if (!isDeepStrictEqual(tryParse(removed), expected))
    throw manualEdit(file, 'ci_platform could not be removed from [workflow] exactly', '[workflow.ci]');
  const ci = current.workflow?.ci;
  if (ci && Object.hasOwn(ci, 'ci_platform')) return removed;
  const line = moved.text.trim();
  if (ci) return insertIntoSection(file, removed, 'workflow.ci', [line]);
  return appendBlock(removed, `[workflow.ci]${lineEnding(text)}${line}${lineEnding(text)}`);
}

/** Plan the merge of one retired surface into one layer of its owning skill. */
function planSurface(context, surface, suffix) {
  const targetName = surface.target + suffix;
  const targetFile = path.join(context.customRoot, targetName);
  const tableLabel = `[workflow.${surface.table}]`;
  const base = context.staged.get(targetFile) ?? readFile(targetFile);
  const baseLabel = base?.source ?? targetFile;
  const baseValue = base ? parse(baseLabel, base.text) : {};
  if (baseValue.workflow !== undefined && !isTable(baseValue.workflow))
    throw manualEdit(baseLabel, '[workflow] is not a table', tableLabel);
  const existing = baseValue.workflow?.[surface.table];
  if (existing !== undefined && !isTable(existing)) throw manualEdit(baseLabel, `${tableLabel} is not a table`, tableLabel);
  const candidates = collectCandidates(context, surface, suffix, targetName);
  if (surface.moveCiPlatform && baseValue.workflow && Object.hasOwn(baseValue.workflow, 'ci_platform')) {
    candidates.push({
      name: targetName,
      file: targetFile,
      provenance: 'live',
      live: true,
      topLevel: true,
      table: { ci_platform: baseValue.workflow.ci_platform },
    });
  }
  if (candidates.length === 0) return;
  const { conflicts, kept } = analyse(candidates, existing ?? {}, targetFile, tableLabel);
  if (conflicts.length > 0) {
    context.conflicts.push(...conflicts);
    return;
  }

  const baseText = base?.text ?? null;
  let text = baseText;
  let mode;
  const messages = [];
  const expected = parse(baseLabel, baseText ?? '');
  for (const candidate of candidates) {
    const current = text === null ? {} : parse(targetFile, text);
    const have = current.workflow?.[surface.table];
    const missing = Object.keys(candidate.table).filter((key) => !have || !Object.hasOwn(have, key));
    const from = candidate.live ? '' : ` (from ${candidate.provenance})`;
    if (candidate.topLevel) {
      text = moveCiPlatform(targetFile, text, current);
      delete expected.workflow.ci_platform;
      expected.workflow.ci ??= {};
      expected.workflow.ci.ci_platform ??= candidate.table.ci_platform;
      const move = `${targetName} [workflow].ci_platform -> ${targetName} ${tableLabel}`;
      messages.push({ done: move, check: `Would move ${move}` });
      continue;
    }
    if (missing.length > 0) {
      mode ??= candidate.live ? candidate.stat.mode & 0o777 : 0o644;
      const additions = Object.fromEntries(missing.map((key) => [key, candidate.table[key]]));
      expected.workflow ??= {};
      expected.workflow[surface.table] = { ...expected.workflow[surface.table], ...additions };
      const next = have
        ? insertIntoSection(
            targetFile,
            text,
            `workflow.${surface.table}`,
            missing.flatMap((key) => renderKey(targetFile, key, candidate.table[key], tableLabel)),
          )
        : appendBlock(text ?? '', nestedSource(candidate, surface.table));
      if (!isDeepStrictEqual(tryParse(next), expected))
        throw manualEdit(targetFile, `the merged ${tableLabel} could not be verified`, tableLabel);
      text = next;
    }
    if (missing.length > 0 || candidate.live) {
      const move = `${candidate.name} [workflow] -> ${targetName} ${tableLabel}${from}${missing.length === 0 ? ' (values already present)' : ''}`;
      messages.push({ done: move, check: `Would move ${move}` });
    }
  }
  for (const { key, candidate, value } of kept) {
    const notice = `${key} = ${JSON.stringify(value)} in ${targetName} ${tableLabel}; ignoring ${JSON.stringify(candidate.table[key])} from ${candidate.name} (from ${candidate.provenance})`;
    messages.push({ done: `Kept ${notice}`, check: `Would keep ${notice}` });
  }

  const group = [];
  if (text !== baseText) {
    if (!isDeepStrictEqual(tryParse(text), expected))
      throw manualEdit(targetFile, `the merged ${tableLabel} could not be verified`, tableLabel);
    group.push(
      base
        ? { kind: 'update', oldFile: targetFile, newFile: targetFile, old: base, text, expected }
        : { kind: 'create', oldFile: null, newFile: targetFile, text, mode: mode ?? 0o644, expected },
    );
  }
  for (const candidate of candidates) {
    if (!candidate.live || candidate.topLevel) continue;
    const old = { file: candidate.file, stat: candidate.stat, text: candidate.text };
    group.push({ kind: 'remove', oldFile: candidate.file, newFile: targetFile, old, requires: text });
  }
  if (group.length === 0) return;
  group[0].messages = messages;
  context.actions.push(...group);
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

/** Read every input, stage every change and surface every conflict before anything is written. */
function preflight(root, customRoot) {
  const actions = [];
  const staged = new Map();
  for (const [oldName, newName] of PAIRS) {
    for (const suffix of LAYERS) {
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
      staged.set(newFile, { file: newFile, stat: old.stat, text: old.text, source: oldFile });
    }
  }
  const context = { root, customRoot, backups: listBackups(root), staged, actions, conflicts: [] };
  for (const surface of SURFACES) for (const suffix of LAYERS) planSurface(context, surface, suffix);
  if (context.conflicts.length > 0) {
    throw new Error(`Customization conflicts found; nothing was changed.\n${context.conflicts.map((line) => `- ${line}`).join('\n')}`);
  }
  for (const suffix of LAYERS) {
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

/** Re-read a written customization and confirm both its bytes and its parsed values. */
function verifyWrite(action) {
  const current = readFile(action.newFile);
  if (current?.text !== action.text || !isDeepStrictEqual(tryParse(current.text), action.expected)) {
    throw new Error(`Could not verify ${action.newFile} after writing it`);
  }
}

/** Perform one staged action; `completed` records it as soon as there is something to undo. */
function applyAction(action, index, customRoot, completed) {
  const backup = path.join(customRoot, `.tea-migration-${process.pid}-${index}.bak`);
  switch (action.kind) {
    case 'move': {
      if (readFile(action.newFile) !== null) throw new Error(`Customization appeared during migration: ${action.newFile}`);
      fs.linkSync(action.oldFile, action.newFile);
      completed.push(action);
      fs.unlinkSync(action.oldFile);
      break;
    }
    case 'create': {
      if (readFile(action.newFile) !== null) throw new Error(`Customization appeared during migration: ${action.newFile}`);
      fs.linkSync(action.temp, action.newFile);
      completed.push(action);
      verifyWrite(action);
      break;
    }
    case 'remove': {
      if ((readFile(action.newFile)?.text ?? null) !== action.requires)
        throw new Error(`Customization changed during migration: ${action.newFile}`);
      fs.linkSync(action.oldFile, backup);
      action.backup = backup;
      completed.push(action);
      fs.unlinkSync(action.oldFile);
      break;
    }
    default: {
      fs.linkSync(action.oldFile, backup);
      action.backup = backup;
      completed.push(action);
      fs.renameSync(action.temp, action.oldFile);
      if (action.kind === 'update') verifyWrite(action);
    }
  }
}

function rollbackAction(action) {
  switch (action.kind) {
    case 'move': {
      if (!fs.existsSync(action.oldFile)) fs.linkSync(action.newFile, action.oldFile);
      fs.unlinkSync(action.newFile);
      break;
    }
    case 'create': {
      if (fs.existsSync(action.newFile)) fs.unlinkSync(action.newFile);
      break;
    }
    case 'remove': {
      if (!fs.existsSync(action.oldFile)) fs.linkSync(action.backup, action.oldFile);
      fs.unlinkSync(action.backup);
      break;
    }
    default: {
      if (fs.existsSync(action.oldFile)) fs.unlinkSync(action.oldFile);
      fs.linkSync(action.backup, action.oldFile);
      fs.unlinkSync(action.backup);
    }
  }
}

/** Apply staged changes under one exclusive lock and undo completed actions on failure. */
function applyActions(actions, customRoot, beforeAction) {
  const completed = [];
  const temporary = [];
  let rollbackSafe = true;
  try {
    for (const [index, action] of actions.entries()) {
      if (!['rewrite', 'update', 'create'].includes(action.kind)) continue;
      const mode = action.kind === 'create' ? action.mode : action.old.stat.mode & 0o777;
      const temp = path.join(customRoot, `.tea-migration-${process.pid}-${index}.tmp`);
      fs.writeFileSync(temp, action.text, { flag: 'wx', mode });
      fs.chmodSync(temp, mode);
      action.temp = temp;
      temporary.push(temp);
    }
    for (const [index, action] of actions.entries()) {
      beforeAction?.(action, index);
      if (action.old && !unchanged(action.old)) throw new Error(`Customization changed during migration: ${action.oldFile}`);
      applyAction(action, index, customRoot, completed);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const action of completed.toReversed()) {
      try {
        rollbackAction(action);
      } catch (rollbackError) {
        rollbackErrors.push(`${action.oldFile ?? action.newFile}: ${rollbackError.message}`);
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
  if (check) return preflight(root, customRoot);
  if (!checkDirectory(customRoot)) {
    // A cleanup may have removed the whole folder while a backup still holds settings to restore.
    if (preflight(root, customRoot).length === 0) return [];
    fs.mkdirSync(customRoot);
  }
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
    const actions = preflight(root, customRoot);
    applyActions(actions, customRoot, beforeAction);
    return actions;
  } finally {
    fs.rmdirSync(lock);
  }
}

function describe(action, check) {
  const lines = (action.messages ?? []).map((message) => (check ? message.check : message.done));
  if (action.kind === 'rewrite') lines.push(`${check ? 'Would update' : 'Updated'} menu references in ${action.oldFile}`);
  if (action.kind === 'move') lines.push(`${check ? 'Would move ' : ''}${action.oldFile} -> ${action.newFile}`);
  return lines;
}

function main(argv = process.argv.slice(2)) {
  const usage = 'Usage: tea-migrate-customizations [--project-root PATH] [--check]';
  const rootIndex = argv.indexOf('--project-root');
  if (rootIndex !== -1 && (!argv[rootIndex + 1] || argv[rootIndex + 1].startsWith('--'))) throw new Error('--project-root requires a path');
  if (argv.some((arg, index) => arg !== '--check' && arg !== '--project-root' && index !== rootIndex + 1)) throw new Error(usage);
  const projectRoot = rootIndex < 0 ? process.cwd() : path.resolve(argv[rootIndex + 1]);
  const check = argv.includes('--check');
  const actions = migrate(projectRoot, { check });
  for (const action of actions) for (const line of describe(action, check)) process.stdout.write(`${line}\n`);
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
