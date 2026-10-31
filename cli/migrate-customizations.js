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
/** Which backup values this command already restored or deliberately kept, so reruns never repeat or question them. */
const RECORD_NAME = '.tea-customization-migration.json';
const RECORD_VERSION = 1;
/** The pre-v7 personal config layer BMad core no longer merges, and the layers TEA reads `[modules.tea]` from. */
const LEGACY_USER_CONFIG = ['_bmad', 'config.user.toml'];
const CONFIG_LAYERS = [
  ['_bmad', 'config.toml'],
  ['_bmad', 'custom', 'config.toml'],
  ['_bmad', 'custom', 'config.user.toml'],
];
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
  const unquote = (part) => part.trim().replace(/^"(.*)"$|^'(.*)'$/, '$1$2');
  return { array: match[1] === '[[', path: match[2].split('.').map((part) => unquote(part)) };
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

/** Comment lines of a legacy file, which no parsed value carries. */
function commentLines(text) {
  return toLines(text)
    .map((line) => line.text.trim())
    .filter((line) => line.startsWith('#'));
}

/** Keep a legacy file's comments (notes and commented-out settings) when its values merge into an existing table. */
function withComments(text, candidate) {
  const comments = commentLines(candidate.text);
  if (comments.length === 0) return text;
  const eol = lineEnding(text === '' ? candidate.text : text);
  return appendBlock(text, [`# Comments from ${candidate.name}`, ...comments].join(eol) + eol);
}

/**
 * Turn a legacy file's [workflow] table into [workflow.<table>], keeping its comments and layout when that is provably exact.
 * Bare and quoted spellings of `workflow` are rewritten; anything else falls back to a fresh rendering plus the file's comments.
 */
function nestedSource(candidate, table) {
  const lines = toLines(candidate.text);
  for (const line of lines) {
    const match = /^(\s*\[\[?\s*(?:workflow|"workflow"|'workflow'))(\s*(?:\.[^\]]*)?\]\]?\s*(?:#.*)?)$/.exec(line.text);
    if (match) line.text = `${match[1]}.${table}${match[2]}`;
  }
  const rewritten = joinLines(lines);
  const expected = { workflow: { [table]: candidate.table } };
  if (isDeepStrictEqual(tryParse(rewritten), expected)) return rewritten;
  return withComments(TOML.stringify(expected), candidate);
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
function findInBackups(root, backups, segments) {
  search: for (const folder of backups) {
    let directory = path.join(root, folder);
    if (!checkDirectory(directory)) continue;
    for (const segment of segments.slice(0, -1)) {
      directory = path.join(directory, segment);
      if (!checkDirectory(directory)) continue search;
    }
    const found = readFile(path.join(directory, segments.at(-1)));
    if (found) return { ...found, provenance: folder };
  }
  return null;
}

function emptyRecord() {
  return { version: RECORD_VERSION, restored: {}, kept: {} };
}

/** Read the migration record; a damaged record stops the run so no decision recorded in it is lost. */
function readRecord(customRoot) {
  const file = path.join(customRoot, RECORD_NAME);
  const found = readFile(file);
  if (!found) return emptyRecord();
  let value;
  try {
    value = JSON.parse(found.text);
  } catch (error) {
    throw new Error(`Cannot read migration record ${file}: ${error.message}. Fix or remove it, then rerun.`);
  }
  const isNameMap = (map) => isTable(map) && Object.values(map).every((folder) => typeof folder === 'string');
  if (!isTable(value) || value.version !== RECORD_VERSION || !isNameMap(value.restored) || !isNameMap(value.kept)) {
    throw new Error(
      `Cannot read migration record ${file}: expected {"version": ${RECORD_VERSION}, "restored": {...}, "kept": {...}}. Fix or remove it, then rerun.`,
    );
  }
  return { version: RECORD_VERSION, restored: { ...value.restored }, kept: { ...value.kept } };
}

function sortedNames(map) {
  return Object.fromEntries(Object.entries(map).toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** Replace the record in one rename; a failure here is reported but never undoes the finished migration. */
function writeRecord(customRoot, record) {
  const file = path.join(customRoot, RECORD_NAME);
  const temp = path.join(customRoot, `${RECORD_NAME}.${process.pid}.tmp`);
  const text = `${JSON.stringify({ version: RECORD_VERSION, restored: sortedNames(record.restored), kept: sortedNames(record.kept) }, null, 2)}\n`;
  try {
    readFile(file);
    fs.writeFileSync(temp, text, { flag: 'wx', mode: 0o644 });
    fs.renameSync(temp, file);
  } catch (error) {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
    throw new Error(
      `The customizations were migrated, but the migration record ${file} could not be written: ${error.message}. Fix the cause and rerun; a rerun may ask about backup values again.`,
    );
  }
}

function recordKey(targetName, table, key) {
  return `${targetName}|${table}|${key}`;
}

function readOptional(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`Cannot read ${file}: ${error.message}`);
  }
}

/** Name `[modules.tea]` keys a pre-v7 personal config holds that TEA no longer reads; this command leaves that file alone. */
function legacyConfigNotice(root, backups) {
  const liveFile = path.join(root, ...LEGACY_USER_CONFIG);
  const liveText = readOptional(liveFile);
  const legacy = liveText === null ? findInBackups(root, backups, LEGACY_USER_CONFIG) : { file: liveFile, text: liveText };
  if (!legacy) return null;
  const tea = tryParse(legacy.text)?.modules?.tea;
  if (!isTable(tea)) return null;
  const held = new Set();
  for (const segments of CONFIG_LAYERS) {
    const file = path.join(root, ...segments);
    const text = readOptional(file);
    if (text === null) continue;
    const layer = parse(file, text).modules?.tea;
    if (isTable(layer)) for (const key of Object.keys(layer)) held.add(key);
  }
  const ignored = Object.keys(tea).filter((key) => !held.has(key));
  if (ignored.length === 0) return null;
  const line = `Not migrated by this command: ${legacy.file} [modules.tea] keys ${ignored.join(', ')} are ignored by TEA. Run \`bmad migrate tea\` to move them.`;
  return { kind: 'notice', messages: [{ done: line, check: line }] };
}

function collectCandidates(context, surface, suffix, targetName) {
  const candidates = [];
  for (const stem of surface.sources) {
    const name = stem + suffix;
    const live = readFile(path.join(context.customRoot, name));
    const backupSegments = ['_bmad', 'custom', name];
    let found = null;
    if (live) {
      // A backup copy of a file migrated from the live tree must never resurface on a later run.
      found = { ...live, provenance: 'live', shadowed: findInBackups(context.root, context.backups, backupSegments) !== null };
    } else if (!Object.hasOwn(context.record.restored, name)) {
      found = findInBackups(context.root, context.backups, backupSegments);
    }
    if (!found) continue;
    const value = parse(found.file, found.text);
    for (const key of Object.keys(value)) {
      if (key !== 'workflow')
        throw new Error(`${found.file} has ${key} outside [workflow]; move it manually into ${targetName}, then rerun.`);
    }
    if (value.workflow !== undefined && !isTable(value.workflow))
      throw new Error(`Expected a [workflow] table in ${found.file}; move its settings manually into ${targetName}, then rerun.`);
    const isLive = found.provenance === 'live';
    const table = { ...value.workflow };
    if (!isLive) {
      for (const key of Object.keys(table)) {
        const recorded = recordKey(targetName, surface.table, key);
        if (Object.hasOwn(context.record.restored, recorded) || Object.hasOwn(context.record.kept, recorded)) delete table[key];
      }
    }
    candidates.push({ name, ...found, live: isLive, table });
  }
  return candidates;
}

/** Find value conflicts and kept backup values against the target as it stands before this run. */
function analyse(candidates, targetTable, targetFile, tableLabel, keepExisting) {
  const conflicts = [];
  const kept = [];
  const keys = [...new Set(candidates.flatMap((candidate) => Object.keys(candidate.table)))];
  for (const key of keys) {
    const holders = candidates.filter((candidate) => Object.hasOwn(candidate.table, key));
    if (Object.hasOwn(targetTable, key)) {
      for (const candidate of holders) {
        if (isDeepStrictEqual(candidate.table[key], targetTable[key])) continue;
        const both = `${JSON.stringify(candidate.table[key])} in ${provenance(candidate)} and ${JSON.stringify(targetTable[key])} in ${targetFile} ${tableLabel}`;
        if (candidate.live) conflicts.push(`Conflicting ${key}: ${both}. Make them agree, then rerun.`);
        else if (keepExisting) kept.push({ key, candidate, value: targetTable[key] });
        else conflicts.push(`Conflicting ${key}: ${both}. Make them agree, or rerun with --keep-existing to keep the existing value.`);
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
  const { conflicts, kept } = analyse(candidates, existing ?? {}, targetFile, tableLabel, context.keepExisting);
  if (conflicts.length > 0) {
    context.conflicts.push(...conflicts);
    return;
  }

  const record = context.nextRecord;
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
    if (!candidate.live || candidate.shadowed) record.restored[candidate.name] = candidate.provenance;
    if (missing.length > 0) {
      mode ??= candidate.stat.mode & 0o777;
      const additions = Object.fromEntries(missing.map((key) => [key, candidate.table[key]]));
      expected.workflow ??= {};
      expected.workflow[surface.table] = { ...expected.workflow[surface.table], ...additions };
      let next = have
        ? insertIntoSection(
            targetFile,
            text,
            `workflow.${surface.table}`,
            missing.flatMap((key) => renderKey(targetFile, key, candidate.table[key], tableLabel)),
          )
        : appendBlock(text ?? '', nestedSource(candidate, surface.table));
      if (have) next = withComments(next, candidate);
      if (!isDeepStrictEqual(tryParse(next), expected))
        throw manualEdit(targetFile, `the merged ${tableLabel} could not be verified`, tableLabel);
      text = next;
      if (!candidate.live) for (const key of missing) record.restored[recordKey(targetName, surface.table, key)] = candidate.provenance;
    }
    if (missing.length === 0 && candidate.live) {
      const withNote = withComments(text ?? '', candidate);
      if (withNote !== text) text = withNote;
    }
    if (missing.length > 0 || candidate.live) {
      const move = `${candidate.name} [workflow] -> ${targetName} ${tableLabel}${from}${missing.length === 0 ? ' (values already present)' : ''}`;
      messages.push({ done: move, check: `Would move ${move}` });
    }
  }
  for (const { key, candidate, value } of kept) {
    record.kept[recordKey(targetName, surface.table, key)] = candidate.provenance;
    const notice = `${key} = ${JSON.stringify(value)} in ${targetName} ${tableLabel}; ignoring ${JSON.stringify(candidate.table[key])} from ${candidate.name} (from ${candidate.provenance})`;
    messages.push({ done: `Kept ${notice}`, check: `Would keep ${notice}` });
  }

  const group = [];
  let writer = null;
  if (text !== baseText) {
    if (!isDeepStrictEqual(tryParse(text), expected))
      throw manualEdit(targetFile, `the merged ${tableLabel} could not be verified`, tableLabel);
    if (base?.pending) {
      // The file is itself being restored from a backup in this run: fold the merge into that creation.
      writer = base.pending;
      writer.text = text;
      writer.expected = expected;
    } else {
      writer = base
        ? { kind: 'update', oldFile: targetFile, newFile: targetFile, old: base, text, expected }
        : { kind: 'create', oldFile: null, newFile: targetFile, text, mode: mode ?? 0o644, expected };
      group.push(writer);
    }
  }
  for (const candidate of candidates) {
    if (!candidate.live || candidate.topLevel) continue;
    const old = { file: candidate.file, stat: candidate.stat, text: candidate.text };
    group.push({ kind: 'remove', oldFile: candidate.file, newFile: targetFile, old, requires: text });
  }
  const carrier = writer ?? group[0];
  if (carrier) carrier.messages = [...(carrier.messages ?? []), ...messages];
  else if (messages.length > 0) context.actions.push({ kind: 'notice', messages });
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

/**
 * Stage a pre-3.0 rename, or the restore of an owning-skill file a v6 to v7 cleanup removed, so later merges land on the
 * file that will exist after this run.
 */
function planRename(context, oldName, newName, suffix) {
  const { customRoot, staged, actions } = context;
  const oldFile = path.join(customRoot, oldName + suffix);
  const newFile = path.join(customRoot, newName + suffix);
  const old = readFile(oldFile);
  const current = readFile(newFile);
  if (old) {
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
    return;
  }
  if (current || Object.hasOwn(context.record.restored, newName + suffix)) return;
  const found =
    findInBackups(context.root, context.backups, ['_bmad', 'custom', oldName + suffix]) ??
    findInBackups(context.root, context.backups, ['_bmad', 'custom', newName + suffix]);
  if (!found) return;
  const move = `${path.basename(found.file)} -> ${newName + suffix} (from ${found.provenance})`;
  const pending = {
    kind: 'create',
    oldFile: null,
    newFile,
    text: found.text,
    mode: found.stat.mode & 0o777,
    expected: parse(found.file, found.text),
    messages: [{ done: move, check: `Would move ${move}` }],
  };
  actions.push(pending);
  staged.set(newFile, { file: newFile, text: found.text, source: found.file, pending });
  context.nextRecord.restored[newName + suffix] = found.provenance;
}

/** Read every input, stage every change and surface every conflict before anything is written. */
function preflight(root, customRoot, { keepExisting = false } = {}) {
  const record = readRecord(customRoot);
  const context = {
    root,
    customRoot,
    backups: listBackups(root),
    staged: new Map(),
    actions: [],
    conflicts: [],
    keepExisting,
    record,
    nextRecord: structuredClone(record),
  };
  for (const [oldName, newName] of PAIRS) for (const suffix of LAYERS) planRename(context, oldName, newName, suffix);
  for (const surface of SURFACES) for (const suffix of LAYERS) planSurface(context, surface, suffix);
  if (context.conflicts.length > 0) {
    throw new Error(`Customization conflicts found; nothing was changed.\n${context.conflicts.map((line) => `- ${line}`).join('\n')}`);
  }
  for (const suffix of LAYERS) {
    const file = path.join(customRoot, 'bmad-tea' + suffix);
    const old = readFile(file);
    if (!old) continue;
    const rewritten = rewriteMenu(file, old.text);
    if (rewritten !== null) context.actions.push({ kind: 'rewrite', oldFile: file, newFile: file, old, text: rewritten });
  }
  const notice = legacyConfigNotice(root, context.backups);
  if (notice) context.actions.push(notice);
  return { actions: context.actions, record, nextRecord: context.nextRecord };
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

function currentText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * Undo one completed action unless someone changed the file since this run touched it; then the newer content stays,
 * the recovery copy stays, and the returned line says where it is.
 */
function rollbackAction(action) {
  switch (action.kind) {
    case 'move': {
      if (fs.existsSync(action.oldFile))
        return `rollback skipped for ${action.newFile}: ${action.oldFile} reappeared after the migration moved it`;
      fs.linkSync(action.newFile, action.oldFile);
      fs.unlinkSync(action.newFile);
      return null;
    }
    case 'create': {
      const current = currentText(action.newFile);
      if (current === null) return null;
      if (current !== action.text)
        return `rollback skipped for ${action.newFile}: it changed after the migration wrote it; it did not exist before the migration`;
      fs.unlinkSync(action.newFile);
      return null;
    }
    case 'remove': {
      const current = currentText(action.oldFile);
      if (current === null) fs.linkSync(action.backup, action.oldFile);
      else if (current !== action.old.text) {
        action.keepBackup = true;
        return `rollback skipped for ${action.oldFile}: it changed after the migration removed it; the previous content is in ${action.backup}`;
      }
      fs.unlinkSync(action.backup);
      return null;
    }
    default: {
      const current = currentText(action.oldFile);
      if (current === action.old.text) {
        fs.unlinkSync(action.backup);
        return null;
      }
      if (current !== null && current !== action.text) {
        action.keepBackup = true;
        return `rollback skipped for ${action.oldFile}: it changed after the migration wrote it; the previous content is in ${action.backup}`;
      }
      if (current !== null) fs.unlinkSync(action.oldFile);
      fs.linkSync(action.backup, action.oldFile);
      fs.unlinkSync(action.backup);
      return null;
    }
  }
}

/** Apply staged changes under one exclusive lock and undo completed actions on failure. */
function applyActions(allActions, customRoot, beforeAction) {
  const actions = allActions.filter((action) => action.kind !== 'notice');
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
    const skipped = [];
    for (const action of completed.toReversed()) {
      try {
        const skip = rollbackAction(action);
        if (skip) skipped.push(skip);
      } catch (rollbackError) {
        rollbackErrors.push(`${action.oldFile ?? action.newFile}: ${rollbackError.message}`);
      }
    }
    rollbackSafe = rollbackErrors.length === 0;
    const notes = [...skipped, ...(rollbackErrors.length > 0 ? [`rollback needs manual repair: ${rollbackErrors.join('; ')}`] : [])];
    throw new Error([error.message, ...notes].join('; '));
  } finally {
    if (rollbackSafe) {
      for (const action of actions) if (action.backup && !action.keepBackup && fs.existsSync(action.backup)) fs.unlinkSync(action.backup);
    }
    for (const temp of temporary) if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

function migrate(projectRoot, { check = false, keepExisting = false, beforeAction } = {}) {
  const root = path.resolve(projectRoot);
  checkDirectory(root, true);
  const bmadRoot = path.join(root, '_bmad');
  if (!checkDirectory(bmadRoot)) return [];
  const customRoot = path.join(bmadRoot, 'custom');
  if (check) return preflight(root, customRoot, { keepExisting }).actions;
  if (!checkDirectory(customRoot)) {
    // A cleanup may have removed the whole folder while a backup still holds settings to restore.
    const planned = preflight(root, customRoot, { keepExisting }).actions;
    if (planned.every((action) => action.kind === 'notice')) return planned;
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
    const plan = preflight(root, customRoot, { keepExisting });
    applyActions(plan.actions, customRoot, beforeAction);
    if (!isDeepStrictEqual(plan.nextRecord, plan.record)) writeRecord(customRoot, plan.nextRecord);
    return plan.actions;
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
  const usage = 'Usage: tea-migrate-customizations [--project-root PATH] [--check] [--keep-existing]';
  const flags = new Set(['--check', '--keep-existing', '--project-root']);
  const rootIndex = argv.indexOf('--project-root');
  if (rootIndex !== -1 && (!argv[rootIndex + 1] || argv[rootIndex + 1].startsWith('--'))) throw new Error('--project-root requires a path');
  if (argv.some((arg, index) => !flags.has(arg) && (rootIndex === -1 || index !== rootIndex + 1))) throw new Error(usage);
  const projectRoot = rootIndex < 0 ? process.cwd() : path.resolve(argv[rootIndex + 1]);
  const check = argv.includes('--check');
  const actions = migrate(projectRoot, { check, keepExisting: argv.includes('--keep-existing') });
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
