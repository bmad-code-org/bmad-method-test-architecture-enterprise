'use strict';

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const MarkdownIt = require('markdown-it');
const TOML = require('smol-toml');
const { readInput } = require('./workflow-cli');
const { liveAliasMap, liveReference, localId } = require('./trace-live');

const GATE_TYPES = ['story', 'epic', 'release', 'hotfix'];
const COLLECTION_MODES = [
  'contract_static',
  'inventory_only',
  'runtime_manifest',
  'deferred_shared',
  'waived',
  'restricted',
  'inaccessible',
];
const GATE_STATUSES = new Set(['PASS', 'CONCERNS', 'FAIL']);
const LEVELS = ['e2e', 'api', 'component', 'unit', 'live', 'other'];

function criterionText(value) {
  const content = value.replace(/\s*\(P[0-3]\)\s*$/, '');
  const children = new MarkdownIt().parseInline(content, {})[0]?.children ?? [];
  return children
    .map((token) =>
      ['softbreak', 'hardbreak'].includes(token.type) ? ' ' : ['text', 'code_inline'].includes(token.type) ? token.content : '',
    )
    .join('')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .replace(/\.$/, ''); // a trailing sentence period is presentation, not requirement text
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .slice(0, 64)
    .replace(/-$/, '');
}

function inputError(message) {
  return Object.assign(new Error(message), { code: 'TRACE_INPUT_INVALID' });
}

const ORACLE_ID = /^[A-Za-z0-9._-]+$/;
const LEAF_TYPES = new Set(['story', 'spike', 'bug']);

/** YAML frontmatter and the body with frontmatter lines blanked, so Markdown line maps stay file line numbers. */
function frontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) return { data: null, body: text };
  let data = null;
  try {
    data = yaml.load(match[1]);
  } catch {
    data = null;
  }
  return {
    data: data && typeof data === 'object' && !Array.isArray(data) ? data : null,
    body: `${'\n'.repeat(match[0].split('\n').length - 1)}${text.slice(match[0].length)}`,
  };
}

function readToml(file) {
  try {
    return TOML.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw inputError(`Cannot read ${file}: ${error.message}`);
  }
}

/** The epic id an initiative's `tickets/tickets.toml` gives the epic folder, or null when it does not number it. */
function epicNumber(tickets, folder) {
  const index = path.join(tickets, 'tickets.toml');
  if (!fs.existsSync(index)) return null;
  const epics = readToml(index).epic ?? [];
  if (!Array.isArray(epics)) throw inputError(`${index} must list epics as [[epic]] tables.`);
  const numbered = epics.filter((epic) => epic?.slug === folder);
  if (numbered.length > 1) throw inputError(`${index} lists ${folder} more than once.`);
  return numbered[0]?.id === undefined ? null : String(numbered[0].id);
}

/**
 * A v7 epic file is `initiative-<i>/tickets/<epic folder>/<epic folder>.md`. Its key follows the
 * story contract: `<i>--e<epic id>` when the initiative's tickets.toml numbers it, else `<i>--<epic folder>`.
 */
function nativeEpic(document) {
  const folder = path.basename(path.dirname(document));
  const tickets = path.dirname(path.dirname(document));
  const initiativeFolder = path.basename(path.dirname(tickets));
  if (
    path.basename(document) !== `${folder}.md` ||
    !folder.startsWith('epic-') ||
    path.basename(tickets) !== 'tickets' ||
    !initiativeFolder.startsWith('initiative-')
  )
    return null;
  const initiative = initiativeFolder.slice('initiative-'.length);
  const epicId = epicNumber(tickets, folder);
  const epicKey = epicId === null ? `${initiative}--${folder}` : `${initiative}--e${epicId}`;
  if (!initiative || initiative.includes('--') || folder.includes('--') || !ORACLE_ID.test(epicKey))
    throw inputError(
      `Cannot form a v7 epic key from ${document}; initiative and epic folders need letters, digits, ".", "_" or "-" and no "--".`,
    );
  return { initiative, epicId, epicFolder: folder, epicKey };
}

/**
 * A v7 story leaf, keyed by the story contract (section 4): `initiative-<i>/tickets/epic-<slug>/tickets/<leaf>.md`
 * is `<i>--e<epic id>-s<entry id>` (`<i>--<epic folder>-s<entry id>` for an unnumbered epic), a leaf in
 * `initiative-<i>/tickets/` is `<i>--s<entry id>`, and `backlog/<leaf>.md` is `backlog--<leaf stem>`.
 * The entry id is the leaf's frontmatter `id`; a leaf's frontmatter `type` is story, spike or bug.
 */
function nativeStory(projectRoot, document, text) {
  if (path.extname(document) !== '.md' || document.endsWith('-plan.md')) return null;
  const meta = frontmatter(text).data;
  if (!meta || !LEAF_TYPES.has(meta.type)) return null;
  const folder = path.dirname(document);
  let storyId;
  let storyKey;
  let container = folder;
  let parts;
  if (path.basename(folder) === 'backlog') {
    storyId = path.basename(document);
    storyKey = `backlog--${path.basename(document, '.md')}`;
    parts = [path.basename(document, '.md')];
  } else {
    if (path.basename(folder) !== 'tickets' || meta.id === undefined || meta.id === null || !String(meta.id).trim()) return null;
    const entry = String(meta.id).trim();
    container = path.dirname(folder);
    const owner = path.basename(container);
    if (owner.startsWith('initiative-')) {
      const initiative = owner.slice('initiative-'.length);
      [storyId, storyKey, parts] = [entry, `${initiative}--s${entry}`, [initiative, entry]];
    } else {
      const tickets = path.dirname(container);
      const initiativeFolder = path.basename(path.dirname(tickets));
      if (!owner.startsWith('epic-') || path.basename(tickets) !== 'tickets' || !initiativeFolder.startsWith('initiative-')) return null;
      const initiative = initiativeFolder.slice('initiative-'.length);
      const epicId = epicNumber(tickets, owner);
      storyId = epicId === null ? entry : `${epicId}.${entry}`;
      storyKey = epicId === null ? `${initiative}--${owner}-s${entry}` : `${initiative}--e${epicId}-s${entry}`;
      parts = [initiative, owner, entry];
    }
  }
  if (parts.some((part) => !part || part.includes('--')) || !ORACLE_ID.test(storyKey))
    throw inputError(
      `Cannot form a v7 story key from ${document}; initiative, epic folder, entry id and leaf name need letters, digits, ".", "_" or "-" and no "--".`,
    );
  return {
    storyId,
    storyKey,
    ticketRef: `${storyId} @ ${path.relative(path.resolve(projectRoot), container).split(path.sep).join('/')}`,
    storyFile: document,
  };
}

/** Resolve the scope once, before allocating outputs or invoking a vendor. */
function resolveTraceTarget({ projectRoot, target, targetId, gateType }) {
  let document = null;
  let text = '';
  if (target) {
    document = path.resolve(projectRoot, target);
    try {
      text = fs.readFileSync(document, 'utf8');
    } catch (error) {
      throw inputError(`Cannot read --target ${document}: ${error.message}`);
    }
    if (!text.trim()) throw inputError(`--target ${document} is empty.`);
  }
  const basename = document ? path.basename(document, path.extname(document)) : '';
  const tokens = new MarkdownIt().parse(frontmatter(text).body, {});
  const headingIndex = tokens.findIndex((token) => token.type === 'heading_open' && token.tag === 'h1');
  const heading = headingIndex === -1 ? '' : tokens[headingIndex + 1].content;
  // The native v7 shapes decide the type before any heading does: an epic titled "Story publishing" is still an epic.
  const native = document && (gateType === undefined || gateType === 'epic') ? nativeEpic(document) : null;
  const leaf = document && !native && (gateType === undefined || gateType === 'story') ? nativeStory(projectRoot, document, text) : null;
  const inferred = native
    ? 'epic'
    : leaf
      ? 'story'
      : /^story\b/i.test(heading) || /^\d+[.-]\d+[-.]/.test(basename) || /^story[-.]/i.test(basename)
        ? 'story'
        : /^epic\b/i.test(heading) || /^epic[-.]/i.test(basename)
          ? 'epic'
          : /^release\b/i.test(heading)
            ? 'release'
            : /^hotfix\b/i.test(heading)
              ? 'hotfix'
              : null;
  const type = gateType ?? inferred ?? 'story';
  if (!GATE_TYPES.includes(type)) throw inputError(`--gate-type must be one of ${GATE_TYPES.join(', ')}.`);

  let id = targetId?.trim();
  if (targetId !== undefined && !id) throw inputError('--target-id must be non-empty.');
  if (native) {
    // Keep `--`: slugging would merge two initiatives' epic 1 into one run key.
    if (id && id !== native.epicKey && id !== native.epicId)
      throw inputError(`--target-id ${id} does not name the v7 epic ${native.epicKey}.`);
    return {
      type,
      id: native.epicKey,
      label: heading || `Epic ${native.epicKey}`,
      runScope: type,
      runKey: `epic-${native.epicKey}`,
      document,
      ...native,
    };
  }
  if (leaf) {
    if (id && id !== leaf.storyId && id !== leaf.storyKey)
      throw inputError(`--target-id ${id} does not name the v7 story ${leaf.storyKey}.`);
    return {
      type,
      id: leaf.storyId,
      label: heading || `Story ${leaf.storyId}`,
      runScope: type,
      runKey: `story-${leaf.storyKey}`,
      document,
      ...leaf,
    };
  }
  if (!id && type === 'epic') {
    id = heading.match(/^Epic\s+(\d+)\b/i)?.[1] ?? basename.match(/^epic[-.](\d+)(?:[-.]|$)/i)?.[1];
    if (!id && document) id = slug(heading || basename);
  }
  if (!id && type === 'story') {
    id = heading.match(/^Story\s+(\d+[.-]\d+)\b/i)?.[1] ?? basename.match(/^(?:story[-.])?(\d+[.-]\d+)(?:[-.]|$)/i)?.[1];
  }
  if (!id && type === 'release') id = heading.match(/^Release\s+(\S+)/i)?.[1];
  if (!id && type === 'hotfix') id = heading.match(/^Hotfix\s+(\S+)/i)?.[1];
  if (document && !id) throw inputError(`Cannot resolve a ${type} id from --target. Supply --target-id and --gate-type.`);
  if (!id) return { type, id: '', label: '', runScope: 'system', runKey: 'system', document };

  const keyPart = type === 'story' && document ? basename : slug(id);
  if (!keyPart) throw inputError('--target-id must contain a letter or digit.');
  return {
    type,
    id,
    label: heading || `${type[0].toUpperCase()}${type.slice(1)} ${id}`,
    runScope: type,
    runKey: `${type}-${keyPart}`,
    document,
  };
}

function tracePaths(artifactRoot, runKey) {
  const directory = path.join(artifactRoot, 'trace');
  return {
    matrix: path.join(directory, `traceability-matrix-${runKey}.md`),
    summary: path.join(directory, `e2e-trace-summary-${runKey}.json`),
    gate: path.join(directory, `gate-decision-${runKey}.json`),
  };
}

function readJson(file) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${file} must contain a JSON object.`);
  return value;
}

/** Strip `*` and backtick formatting from a table cell, heading label, or identifier. */
const bare = (value) => value.replaceAll(/[*`]/g, '').trim();

/**
 * Split `<id><annotations>: <body>`. Emphasis and code markers are stripped only around the id and its
 * annotations; the body keeps every literal character, so `*.json`, `2 * 3` and `` `*` `` survive capture.
 */
function splitClaim(line, idPattern, annotationPattern) {
  const marks = '[*`]*';
  const match = new RegExp(`^(${marks})(${idPattern})(${marks})(${annotationPattern})(${marks})\\s*:`).exec(line);
  if (!match) return null;
  // Markers opened before the id and still open after the annotations close right after the colon.
  const open = match[1].length - match[3].length - match[5].length;
  let body = line.slice(match[0].length);
  if (open > 0) body = body.replace(new RegExp(`^[*\`]{0,${open}}`), '');
  body = body.trim();
  return body ? { id: match[2], annotations: match[4], body } : null;
}

/**
 * Capture a v7 epic's `R<n> (<parent or source>): <line>` Requirements lines as `<epic key>--R<n>`.
 * A priority is explicit only as a `P0`-`P3` annotation before the colon or a trailing `(P<n>)`.
 */
function epicRequirementLedger(text, source, epicKey) {
  const tokens = new MarkdownIt().parse(text, {});
  const ledger = new Map();
  let section = 0; // heading depth of the open Requirements section; 0 outside it
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type === 'heading_open') {
      const depth = Number(token.tag.slice(1));
      if (section && depth <= section) section = 0;
      if (/^requirements$/i.test(bare(tokens[index + 1].content))) section = depth;
      continue;
    }
    if (!section || token.type !== 'inline' || tokens[index - 1]?.type === 'heading_open') continue;
    let pending;
    const flush = () => {
      if (!pending) return;
      const existing = ledger.get(pending.id);
      if (existing)
        throw inputError(
          `Epic ${epicKey} defines ${localId(pending.id)} twice, at ${existing.source} and ${pending.source}; give each requirement its own id before tracing.`,
        );
      ledger.set(pending.id, pending);
    };
    for (const [offset, line] of token.content.split('\n').entries()) {
      const claim = splitClaim(line, String.raw`R\d+`, String.raw`(?:\s*\([^)]*\))*`);
      if (!claim) {
        if (pending) pending.requirement += `\n${line}`;
        continue;
      }
      flush();
      const annotated = [...claim.annotations.matchAll(/\(([^)]*)\)/g)]
        .flatMap((group) => group[1].split(','))
        .map((part) => bare(part))
        .filter((part) => /^P[0-3]$/.test(part));
      const trailing = /\((P[0-3])\)\s*$/.exec(claim.body)?.[1];
      const priorities = new Set([...annotated, trailing].filter(Boolean));
      if (priorities.size > 1) throw inputError(`Epic ${epicKey} gives ${claim.id} conflicting priorities.`);
      pending = {
        id: `${epicKey}--${claim.id}`,
        priority: [...priorities][0] ?? null,
        requirement: claim.body,
        source: `${source}:${(token.map?.[0] ?? 0) + offset + 1}`,
      };
    }
    flush();
  }
  return [...ledger.values()];
}

/** True when the frozen ledger holds a native v7 epic's Requirements lines (the requirement oracle). */
function requirementOracle(target, ledger) {
  const prefix = target?.epicKey ? `${target.epicKey}--` : null;
  return Boolean(prefix) && ledger.length > 0 && ledger.every((row) => row.id.startsWith(prefix) && /^R\d+$/.test(localId(row.id)));
}

/**
 * Capture explicitly identified requirements from the caller's source before execution. A native
 * v7 epic with `R<n>` Requirements lines yields those lines; every other source yields its AC/FR/NFR/REQ claims.
 */
function sourceOracleLedger(text, source, target) {
  if (target?.epicKey) {
    const requirements = epicRequirementLedger(text, source, target.epicKey);
    if (requirements.length > 0) return requirements;
  }
  const tokens = new MarkdownIt().parse(text, {});
  const ledger = new Map();
  const add = (id, priority, requirement, line) => {
    const existing = ledger.get(id);
    if (existing) {
      if (existing.priority && priority && existing.priority !== priority)
        throw inputError(`Source oracle gives criterion ${id} conflicting priorities.`);
      if (criterionText(existing.requirement) !== criterionText(requirement))
        throw inputError(`Source oracle gives criterion ${id} conflicting requirement text.`);
      existing.priority ||= priority || null;
      return;
    }
    ledger.set(id, { id, priority: priority || null, requirement, source: `${source}:${line}` });
  };
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type === 'table_open') {
      const rows = [];
      let row;
      let line;
      while (++index < tokens.length && tokens[index].type !== 'table_close') {
        if (tokens[index].type === 'tr_open') {
          row = [];
          line = (tokens[index].map?.[0] ?? token.map?.[0] ?? 0) + 1;
        } else if (tokens[index].type === 'inline' && row) row.push(tokens[index].content.trim());
        else if (tokens[index].type === 'tr_close') rows.push({ cells: row, line });
      }
      const header = (rows.shift()?.cells ?? []).map(bare);
      const idIndex = header.findIndex((cell) => /^(?:id|criterion|criterion id|requirement id)$/i.test(cell));
      const requirementIndex = header.findIndex((cell) => /^(?:requirement|criterion text)$/i.test(cell));
      const priorityIndex = header.findIndex((cell) => /^priority$/i.test(cell));
      if (idIndex === -1 || requirementIndex === -1) continue;
      for (const { cells, line } of rows) {
        const priority = priorityIndex === -1 ? '' : bare(cells[priorityIndex] ?? '');
        if (priority && !/^P[0-3]$/.test(priority)) throw inputError('Source oracle has invalid priority.');
        const id = bare(cells[idIndex] ?? '');
        if (!id || !cells[requirementIndex]) throw inputError('Source oracle has an incomplete criterion row.');
        add(id, priority, cells[requirementIndex], line);
      }
    } else if (token.type === 'inline' && !(tokens[index - 1]?.type === 'heading_open' && tokens[index - 1].tag === 'h1')) {
      let pending;
      const flush = () => {
        if (pending) add(pending.id, pending.priority, pending.requirement, pending.line);
      };
      for (const [offset, line] of token.content.split('\n').entries()) {
        const claim = splitClaim(line, String.raw`(?:AC|FR|NFR|REQ)[-_.]?\d+(?:[-_.]\d+)*`, String.raw`(?:\s*\(P[0-3]\))?`);
        if (claim) {
          flush();
          pending = {
            id: claim.id,
            priority:
              /\((P[0-3])\)/.exec(claim.annotations)?.[1] ??
              /\((P[0-3])\)\s*$/.exec(claim.body)?.[1] ??
              /\b(P[0-3])\b/.exec(claim.body)?.[1],
            requirement: claim.body,
            line: (token.map?.[0] ?? 0) + offset + 1,
          };
        } else if (pending) pending.requirement += `\n${line}`;
      }
      flush();
    }
  }
  return [...ledger.values()];
}

const sameSet = (list, expected) =>
  Array.isArray(list) && list.length === expected.size && new Set(list).size === list.length && list.every((item) => expected.has(item));

function validOracleRow(row) {
  return (
    row &&
    typeof row.id === 'string' &&
    Boolean(row.id.trim()) &&
    /^P[0-3]$/.test(row.priority) &&
    typeof row.requirement === 'string' &&
    Boolean(row.requirement.trim()) &&
    typeof row.source === 'string' &&
    Boolean(row.source.trim())
  );
}

const PRIORITY_RANK = { P0: 0, P1: 1, P2: 2, P3: 3 };
const COVERAGE = new Set(['FULL', 'PARTIAL', 'NONE', 'UNIT-ONLY', 'INTEGRATION-ONLY']);

/** A heading's section: every token until the next heading at the same or a higher level. */
function sections(tokens, title) {
  const found = [];
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index].type !== 'heading_open' || !title.test(bare(tokens[index + 1].content))) continue;
    const depth = Number(tokens[index].tag.slice(1));
    let end = index + 1;
    while (end < tokens.length && !(tokens[end].type === 'heading_open' && Number(tokens[end].tag.slice(1)) <= depth)) end++;
    found.push(tokens.slice(index + 3, end));
  }
  return found;
}

/** A parenthesised group holding only `R` ids and priorities, such as `(R1, R3)`, `(P0)` or `(R2, P1)`. */
const ANNOTATION = /\(\s*(?:R\d+|P[0-3])(?:[\s,]+(?:R\d+|P[0-3]))*\s*\)/gi;
const VERIFY_LINE = /^\s*[*`]*Verify[*`]*\s*:[*`]*\s*(.+)$/i;

/**
 * Every top-level item of the lists in `tokens` (ordered lists only when `ordered`), as the inline
 * content of the whole item, nested lines included, and the file line where the item starts.
 */
function topListItems(tokens, ordered) {
  const items = [];
  let depth = 0;
  let accepted = false;
  let current = null;
  for (const token of tokens) {
    if (token.type === 'ordered_list_open' || token.type === 'bullet_list_open') {
      depth++;
      if (depth === 1) accepted = !ordered || token.type === 'ordered_list_open';
    } else if (token.type === 'ordered_list_close' || token.type === 'bullet_list_close') depth--;
    else if (token.type === 'list_item_open' && depth === 1 && accepted) current = { parts: [], line: (token.map?.[0] ?? 0) + 1 };
    else if (token.type === 'list_item_close' && depth === 1 && current) {
      items.push(current);
      current = null;
    } else if (token.type === 'inline' && current) current.parts.push(token.content);
    // Fenced and indented code inside an item is part of the criterion (a Gherkin scenario, an expected body).
    else if (token.type === 'fence' && current) current.parts.push(`${token.markup}${token.info}\n${token.content}${token.markup}`);
    else if (token.type === 'code_block' && current) current.parts.push(token.content);
  }
  return items.map(({ parts, line }) => ({ content: parts.join('\n'), line }));
}

/**
 * One criterion from a list item: its name (the leading bold label, else its first line), both without
 * the parenthesised `R` ids or priority; its full text; its declared `R` ids and explicit priority.
 */
function capturedCriterion(item, file) {
  const first = item.content.split('\n')[0].trim();
  const bold = /^\*\*(.+?)\*\*\s*(.*)$/.exec(first);
  const annotations = bold ? [...bold[2].matchAll(/\(([^)]*)\)/g)].map((group) => group[1]) : (first.match(ANNOTATION) ?? []);
  const parts = annotations.flatMap((group) =>
    group
      .replaceAll(/[()]/g, '')
      .split(/[\s,]+/)
      .map(bare),
  );
  const name = (bold ? bold[1] : first.replaceAll(ANNOTATION, '')).replaceAll(/\s+/g, ' ').trim().replace(/\s*:$/, '');
  return {
    name,
    text: item.content,
    links: [...new Set(parts.filter((part) => /^R\d+$/.test(part)))],
    priority: parts.find((part) => /^P[0-3]$/.test(part)) ?? null,
    file,
    line: item.line,
  };
}

/**
 * A pulled leaf's numbered criteria: a story's under `## Requirements`, a bug's or spike's under
 * `## Acceptance Criteria`; plus its `Verify:` line and that line's number.
 */
function leafCriteria(text, file) {
  const { body } = frontmatter(text);
  const tokens = new MarkdownIt().parse(body, {});
  const criteria = sections(tokens, /^(?:requirements|acceptance criteria)$/i)
    .flatMap((section) => topListItems(section, true))
    .map((item) => capturedCriterion(item, file));
  let verify = null;
  for (const section of sections(tokens, /^requirements$/i)) {
    let item = 0;
    for (const token of section) {
      if (token.type === 'list_item_open') item++;
      else if (token.type === 'list_item_close') item--;
      else if (token.type === 'inline' && item === 0 && verify === null) {
        for (const [offset, line] of token.content.split('\n').entries()) {
          const match = VERIFY_LINE.exec(line);
          if (match) {
            verify = { text: match[1].trim(), file, line: (token.map?.[0] ?? 0) + offset + 1 };
            break;
          }
        }
      }
    }
  }
  if (verify === null && criteria.length === 0) {
    const lines = body.split(/\r?\n/);
    const index = lines.findIndex((line) => VERIFY_LINE.test(line));
    if (index !== -1) verify = { text: VERIFY_LINE.exec(lines[index])[1].trim(), file, line: index + 1 };
  }
  return { criteria, verify };
}

/**
 * A build plan's acceptance criteria: the list under an Acceptance Criteria heading, or the list after
 * the bold `**Acceptance Criteria:**` label in `## Tasks & Acceptance`. `## Prior builds` is history.
 */
function planCriteria(text, file) {
  const parsed = new MarkdownIt().parse(frontmatter(text).body, {});
  const tokens = [];
  let history = 0; // heading depth of an open `## Prior builds` section; 0 outside it
  for (const [index, token] of parsed.entries()) {
    if (token.type === 'heading_open') {
      const depth = Number(token.tag.slice(1));
      if (history && depth <= history) history = 0;
      if (!history && /^prior builds$/i.test(bare(parsed[index + 1].content))) history = depth;
    }
    if (!history) tokens.push(token);
  }
  const items = sections(tokens, /^acceptance criteria$/i).flatMap((section) => topListItems(section, false));
  for (const section of sections(tokens, /^tasks\s*(?:&|and)\s*acceptance$/i)) {
    for (let index = 0; index < section.length; index++) {
      const label = section[index].type === 'inline' && /^\*\*Acceptance Criteria:?\*\*:?$/i.test(section[index].content.trim());
      if (!label) continue;
      let start = index + 1;
      while (start < section.length && section[start].type === 'paragraph_close') start++;
      if (!['bullet_list_open', 'ordered_list_open'].includes(section[start]?.type)) continue;
      let end = start;
      for (let depth = 0; end < section.length; end++) {
        if (section[end].type.endsWith('_list_open')) depth++;
        else if (section[end].type.endsWith('_list_close') && --depth === 0) break;
      }
      items.push(...topListItems(section.slice(start, end + 1), false));
    }
  }
  return items.toSorted((left, right) => left.line - right.line).map((item) => capturedCriterion(item, file));
}

/** The line of each `[[entry]]` table's `verify` key in a tickets.toml, in entry order; null when absent. */
function tomlVerifyLines(text) {
  const lines = [];
  let current = -1;
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (/^\s*\[\[\s*entry\s*\]\]/.test(line)) {
      lines.push(null);
      current = lines.length - 1;
    } else if (/^\s*\[/.test(line)) current = -1;
    else if (current !== -1 && lines[current] === null && /^\s*verify\s*=/.test(line)) lines[current] = index + 1;
  }
  return lines;
}

/**
 * Independently capture the epic's tickets before the agent runs: every `[[entry]]` of the epic's
 * `tickets/tickets.toml` and the criteria the story contract selects for it (section 2): the pulled
 * leaf's numbered criteria; else, when the ticket has only a verify line, its plan's acceptance criteria;
 * else its verify line. `files` holds every file read, so the CLI can protect them as inputs.
 */
function epicTicketSources(projectRoot, target) {
  const epicDir = path.dirname(target.document);
  const ticketsDir = path.join(epicDir, 'tickets');
  const index = path.join(ticketsDir, 'tickets.toml');
  const files = new Map();
  const read = (file) => {
    const text = fs.readFileSync(file, 'utf8');
    files.set(file, text);
    return text;
  };
  read(target.document);
  let entries = [];
  let verifyLines = [];
  if (fs.existsSync(index)) {
    verifyLines = tomlVerifyLines(read(index));
    entries = readToml(index).entry ?? [];
    if (!Array.isArray(entries)) throw inputError(`${index} must list stories as [[entry]] tables.`);
  }
  const leaves = new Map();
  const plans = new Map();
  if (fs.existsSync(ticketsDir) && fs.statSync(ticketsDir).isDirectory()) {
    for (const name of fs.readdirSync(ticketsDir).toSorted()) {
      const file = path.join(ticketsDir, name);
      if (!name.endsWith('.md') || !fs.statSync(file).isFile()) continue;
      const meta = frontmatter(read(file)).data;
      const [owners, key] = name.endsWith('-plan.md') ? [plans, meta?.ticket] : [leaves, meta?.id];
      if (key === undefined || key === null) continue;
      if (owners.has(String(key))) throw inputError(`${ticketsDir} holds two ${owners === plans ? 'plans' : 'leaves'} for entry ${key}.`);
      owners.set(String(key), file);
    }
  }
  const seen = new Set();
  return {
    root: path.resolve(projectRoot),
    epicDir,
    index,
    files,
    entries: entries.map((entry, position) => {
      const id = entry?.id === undefined || entry?.id === null ? '' : String(entry.id).trim();
      const storyKey = `${target.epicKey}-s${id}`;
      if (!id || id.includes('--') || !ORACLE_ID.test(storyKey) || seen.has(id))
        throw inputError(`${index} has an entry with a missing, malformed or repeated id.`);
      seen.add(id);
      // Once pulled, the leaf is the ticket: its `covers` and `Verify:` replace the index entry's.
      const leaf = leaves.get(id) ?? null;
      const leafMeta = leaf ? frontmatter(files.get(leaf)).data : null;
      const [covers, coversFrom] =
        leafMeta && leafMeta.covers !== undefined ? [leafMeta.covers ?? [], leaf] : [entry.covers ?? [], `${index} entry ${id}`];
      if (!Array.isArray(covers) || covers.some((link) => typeof link !== 'string'))
        throw inputError(`${coversFrom} must list covers as strings.`);
      const captured = leaf ? leafCriteria(files.get(leaf), leaf) : { criteria: [], verify: null };
      const plan = plans.get(id) ?? null;
      const planned = captured.criteria.length === 0 && plan ? planCriteria(files.get(plan), plan) : [];
      const verify = [];
      if (leaf) {
        if (captured.verify) verify.push(captured.verify);
      } else if (typeof entry.verify === 'string' && entry.verify.trim() && verifyLines[position])
        verify.push({ text: entry.verify, file: index, line: verifyLines[position] });
      const [selection, criteria] =
        captured.criteria.length > 0 ? ['numbered', captured.criteria] : planned.length > 0 ? ['plan', planned] : ['verify', []];
      if (selection === 'verify' && verify.length === 0)
        throw inputError(
          `${leaf ?? `${index} entry ${id}`} states no numbered criteria, plan acceptance criteria, or verify line; give the ticket a criterion before tracing the epic.`,
        );
      return { id, storyKey, covers, leaf, plan, selection, criteria, verify };
    }),
  };
}

const declaredLinks = (criterion) => new Set([...criterion.validLinks, ...criterion.invalidLinks]);
const storyOf = (id) => id.slice(0, id.lastIndexOf('--'));
const loose = (text) => criterionText(text).toLowerCase();
/** Frozen criterion text for comparison: Markdown and whitespace normalized, `R` id and priority groups dropped. */
const frozen = (text) =>
  loose(text)
    .replaceAll(ANNOTATION, ' ')
    .replaceAll(/\s+/g, ' ')
    .replaceAll(/\s+([:.,;])/g, '$1')
    .trim()
    .replace(/\.$/, '');
const cited = (captured) => `${captured.file}:${captured.line}`;

/** A criterion's `source` must be a `path:line` inside the epic folder; returns it resolved, or throws. */
function citationOf(tickets, criterion) {
  const match = /^(.+):(\d+)$/.exec(criterion.source);
  const file = match ? path.resolve(tickets.root, match[1]) : null;
  const relative = file ? path.relative(tickets.epicDir, file) : '..';
  if (!match || relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error(
      `Trace criterion ${criterion.id} source ${criterion.source} is not a path:line inside the epic folder ${tickets.epicDir}.`,
    );
  return `${file}:${Number(match[2])}`;
}

/**
 * Compare `criterionLedger` with the independently captured tickets. Each entry lists exactly the
 * criteria the story contract selects: the same members, each with the captured name, full text,
 * declared links and explicit priority, and a `source` at the exact file and line where it starts.
 * A verify-only entry's single criterion is its verify line, carrying its covers.
 */
function reconcileTickets(tickets, criteria) {
  const byStory = new Map(tickets.entries.map((entry) => [entry.storyKey, []]));
  for (const criterion of criteria.values()) {
    const story = storyOf(criterion.id);
    if (!byStory.has(story)) throw new Error(`Trace criterion ${criterion.id} names no entry of ${tickets.index}.`);
    if (criterion.story !== undefined && criterion.story !== story)
      throw new Error(`Trace criterion ${criterion.id} must record story ${story}.`);
    byStory.get(story).push(criterion);
  }
  for (const entry of tickets.entries) {
    const listed = byStory.get(entry.storyKey);
    if (listed.length === 0) throw new Error(`Trace criterionLedger omits ${entry.storyKey}, entry ${entry.id} of ${tickets.index}.`);
    if (entry.selection === 'verify') {
      const [criterion] = listed;
      const matches = entry.verify.filter(
        (verify) =>
          criterionText(verify.text) === criterionText(criterion.text) && criterionText(verify.text) === criterionText(criterion.name),
      );
      if (listed.length !== 1 || matches.length === 0 || !sameSet([...declaredLinks(criterion)], new Set(entry.covers)))
        throw new Error(
          `Trace criterionLedger must give verify-only entry ${entry.storyKey} one criterion: its verify line as name and text, linked to its covers.`,
        );
      const source = citationOf(tickets, criterion);
      if (!matches.some((verify) => cited(verify) === source))
        throw new Error(`Trace criterion ${criterion.id} source ${criterion.source} must be ${cited(matches[0])}, its verify line.`);
      const stated = (criterion.text.match(ANNOTATION) ?? [])
        .join(' ')
        .match(/\bP[0-3]\b/i)?.[0]
        .toUpperCase();
      if (stated ? criterion.priority !== stated || criterion.priorityBasis !== 'explicit' : criterion.priorityBasis !== 'inferred')
        throw new Error(
          `Trace criterion ${criterion.id} must record ${stated ? `the explicit priority ${stated} its verify line states` : 'priorityBasis inferred; its verify line states no priority'}.`,
        );
      continue;
    }
    const from = entry.selection === 'plan' ? entry.plan : entry.leaf;
    if (listed.length !== entry.criteria.length)
      throw new Error(
        `Trace criterionLedger lists ${listed.length} criteria for ${entry.storyKey}; the story contract selects ${entry.criteria.length} from ${from}.`,
      );
    const unused = [...listed];
    for (const captured of entry.criteria) {
      const index = unused.findIndex(
        (criterion) => sameSet([...declaredLinks(criterion)], new Set(captured.links)) && loose(criterion.name) === loose(captured.name),
      );
      if (index === -1)
        throw new Error(
          `Trace criterionLedger has no ${entry.storyKey} criterion named "${captured.name}" (${captured.links.join(', ') || 'no links'}) from ${cited(captured)}; it was omitted or its name or links changed.`,
        );
      const [criterion] = unused.splice(index, 1);
      if (frozen(criterion.text) !== frozen(captured.text))
        throw new Error(
          `Trace criterion ${criterion.id} text differs from the criterion at ${cited(captured)}; freeze its name line and every line beneath it as the source states them.`,
        );
      if (captured.priority && (criterion.priority !== captured.priority || criterion.priorityBasis !== 'explicit'))
        throw new Error(`Trace criterion ${criterion.id} must keep the explicit priority ${captured.priority} its source states.`);
      if (!captured.priority && criterion.priorityBasis !== 'inferred')
        throw new Error(`Trace criterion ${criterion.id} must record priorityBasis inferred; ${cited(captured)} states no priority.`);
      if (citationOf(tickets, criterion) !== cited(captured))
        throw new Error(
          `Trace criterion ${criterion.id} source ${criterion.source} must be ${cited(captured)}, where "${captured.name}" starts.`,
        );
    }
  }
}

/**
 * Reconcile a requirement-oracle run: every frozen `R<n>` line is a gate row with its source text,
 * explicit priority and line; every other gate row is a link exception from `criterionLedger`, which
 * itself matches the independently captured tickets. Priorities follow Step 1 section E.
 */
function requirementReference(progress, sourceLedger, tickets) {
  const recorded = progress.oracleLedger;
  if (!Array.isArray(recorded) || recorded.length === 0) throw new Error('Trace Step 1 oracleLedger must be a nonempty array.');
  if (!Array.isArray(progress.criterionLedger)) throw new Error('Trace requirement oracle must persist the Step 1 criterionLedger.');
  if (!tickets) throw new Error("Trace requirement oracle needs the epic's independently captured tickets.");
  const requirementIds = sourceLedger.map((row) => row.id);
  const requirementSet = new Set(requirementIds);
  const definedLinks = new Set(requirementIds.map(localId));
  const criteria = new Map();
  for (const criterion of progress.criterionLedger) {
    const links = (field) => Array.isArray(criterion?.[field]) && criterion[field].every((link) => typeof link === 'string');
    if (
      !criterion ||
      typeof criterion.id !== 'string' ||
      !ORACLE_ID.test(criterion.id) ||
      !criterion.id.includes('--') ||
      typeof criterion.name !== 'string' ||
      !criterion.name.trim() ||
      typeof criterion.text !== 'string' ||
      !criterion.text.trim() ||
      typeof criterion.source !== 'string' ||
      !criterion.source.trim() ||
      !/^P[0-3]$/.test(criterion.priority) ||
      !['explicit', 'inferred'].includes(criterion.priorityBasis) ||
      !links('validLinks') ||
      !links('invalidLinks') ||
      criteria.has(criterion.id)
    )
      throw new Error('Trace Step 1 criterionLedger has an invalid or duplicate criterion.');
    if (!loose(criterion.text).includes(loose(criterion.name)))
      throw new Error(`Trace criterion ${criterion.id} text must contain its name "${criterion.name}".`);
    const declared = declaredLinks(criterion);
    if (
      criterion.validLinks.some((link) => !definedLinks.has(link)) ||
      criterion.invalidLinks.some((link) => definedLinks.has(link)) ||
      (criterion.declaredLinks !== undefined && !sameSet(criterion.declaredLinks, declared))
    )
      throw new Error(`Trace criterion ${criterion.id} sorts its links differently from the epic's Requirements lines.`);
    const exception = criterion.invalidLinks.length > 0 ? 'invalid-link' : criterion.validLinks.length > 0 ? 'none' : 'unlinked';
    if (criterion.exception !== exception) throw new Error(`Trace criterion ${criterion.id} must record exception ${exception}.`);
    criteria.set(criterion.id, criterion);
  }
  const reference = new Map();
  for (const row of recorded) {
    if (!validOracleRow(row) || !ORACLE_ID.test(row.id) || reference.has(row.id))
      throw new Error('Trace Step 1 oracleLedger has an invalid or duplicate criterion.');
    reference.set(row.id, row);
  }
  for (const row of sourceLedger) {
    const saved = reference.get(row.id);
    if (!saved) throw new Error(`Trace Step 1 oracleLedger omits epic requirement ${row.id}.`);
    if (saved.kind !== 'requirement') throw new Error(`Trace requirement ${row.id} must record kind requirement.`);
    if (saved.parent !== null && typeof saved.parent !== 'string')
      throw new Error(`Trace requirement ${row.id} must record its parent link, or null.`);
    // Contributors decide FULL; a dropped one could hide a NONE criterion.
    const contributors = [...criteria.values()].filter((criterion) => criterion.validLinks.includes(localId(row.id)));
    if (!Array.isArray(saved.contributors) || saved.contributors.join('\n') !== contributors.map(({ id }) => id).join('\n'))
      throw new Error(
        `Trace requirement ${row.id} must list exactly the criteria whose validLinks name it as contributors, in criterionLedger order.`,
      );
    if (criterionText(saved.requirement) !== criterionText(row.requirement) || saved.source !== row.source)
      throw new Error(`Trace Step 1 requirement ${row.id} changed its frozen requirement text or source binding.`);
    if (row.priority && saved.priority !== row.priority)
      throw new Error(`Trace Step 1 requirement ${row.id} changed its explicit source priority.`);
    const highest = contributors.map(({ priority }) => priority).toSorted((left, right) => PRIORITY_RANK[left] - PRIORITY_RANK[right])[0];
    const basis = row.priority ? 'explicit' : highest ? 'contributors' : 'inferred';
    if (saved.priorityBasis !== basis)
      throw new Error(
        `Trace requirement ${row.id} must record priorityBasis ${basis}: ${row.priority ? 'its R line states a priority' : highest ? 'it has contributors' : 'no criterion contributes to it'}.`,
      );
    if (basis === 'contributors' && saved.priority !== highest)
      throw new Error(`Trace requirement ${row.id} priority must be ${highest}, the highest priority among its contributors.`);
  }
  for (const [id, row] of reference) {
    if (requirementSet.has(id)) continue;
    const criterion = criteria.get(id);
    if (!criterion || criterion.exception === 'none')
      throw new Error(`Trace oracleLedger row ${id} is neither an epic requirement nor a criterionLedger link exception.`);
    if (row.kind !== 'exception' || row.exception !== criterion.exception)
      throw new Error(`Trace exception row ${id} must record kind exception and its criterion's exception ${criterion.exception}.`);
    // A gate row names its criterion: the bold name of a numbered criterion, the verify text of a verify-only one.
    if (criterionText(criterion.name) !== criterionText(row.requirement) || criterion.source !== row.source)
      throw new Error(
        `Trace exception row ${id} requirement must be its criterion's name "${criterion.name}" with the criterion's source binding.`,
      );
    if (criterion.priority !== row.priority || criterion.priorityBasis !== row.priorityBasis)
      throw new Error(`Trace exception row ${id} changed its criterion's priority or priorityBasis.`);
  }
  for (const criterion of criteria.values())
    if (criterion.exception !== 'none' && !reference.has(criterion.id))
      throw new Error(`Trace criterion ${criterion.id} has link exception ${criterion.exception} but no gate row.`);
  reconcileTickets(tickets, criteria);
  return { reference, criteria, requirementIds };
}

/**
 * Contributor tables (`| Contributor | Story | Status | Tests |`) under each gate row's detail heading.
 * A requirement with no contributors needs no table; a placeholder row (`| none | none | none | none |`)
 * lists no contributor, because a criterion id always holds `--`.
 */
function matrixContributors(matrix, reference) {
  const tables = new Map();
  const tokens = new MarkdownIt().parse(matrix.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, ''), {});
  let current = null;
  let depth = 0;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type === 'heading_open') {
      const nextDepth = Number(token.tag.slice(1));
      if (nextDepth <= depth) current = null;
      const id = /^\*{0,2}([A-Za-z0-9][A-Za-z0-9_.-]*)\*{0,2}(?:\s*\(P[0-3]\))?\s*:\s/.exec(tokens[index + 1].content)?.[1];
      if (id && reference.has(id)) [current, depth] = [id, nextDepth];
      continue;
    }
    if (token.type !== 'table_open' || !current) continue;
    const rows = [];
    let row = null;
    while (++index < tokens.length && tokens[index].type !== 'table_close') {
      if (tokens[index].type === 'tr_open') row = [];
      else if (tokens[index].type === 'inline' && row) row.push(bare(tokens[index].content));
      else if (tokens[index].type === 'tr_close') rows.push(row);
    }
    const header = (rows.shift() ?? []).map((cell) => cell.toLowerCase());
    const [contributor, story, status] = ['contributor', 'story', 'status'].map((name) => header.indexOf(name));
    if (contributor === -1) continue;
    if (tables.has(current)) throw new Error(`Trace matrix lists contributors for ${current} more than once.`);
    tables.set(
      current,
      rows
        .filter((cells) => !cells.every((cell) => /^(?:none|n\/a|-|—|)$/i.test(cell)))
        .map((cells) => ({
          id: cells[contributor],
          story: cells[story],
          coverage: /^(FULL|PARTIAL|NONE|UNIT-ONLY|INTEGRATION-ONLY)\b/.exec(cells[status] ?? '')?.[1],
        })),
    );
  }
  return tables;
}

/** AC5: NONE with no contributor or only NONE contributors; FULL only when every contributor is FULL and nothing is missing. */
function requirementCoverage(contributorStatuses, missingBehaviors) {
  if (contributorStatuses.every((status) => status === 'NONE')) return 'NONE';
  return contributorStatuses.every((status) => status === 'FULL') && missingBehaviors.length === 0 ? 'FULL' : 'PARTIAL';
}

const behaviors = (list) => list.map((behavior) => criterionText(behavior).toLowerCase()).toSorted();

/**
 * Step 3's persisted mapping: the fenced json block under the `Requirement Aggregation` heading, holding
 * `criterionMatrix` (one row per `criterionLedger` record) and `traceabilityMatrix` (one row per
 * `oracleLedger` row, in ledger order). Checked against both ledgers and against AC5, so it can serve as
 * the reference the final renderings must match. Returns each criterion's and each gate row's status.
 */
function requirementAggregation(matrix, ledger, criteria) {
  const tokens = new MarkdownIt().parse(matrix.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, ''), {});
  const found = sections(tokens, /^requirement aggregation\b/i);
  const fences = found.flatMap((section) => section.filter((token) => token.type === 'fence' && /^json\b/i.test(token.info.trim())));
  if (fences.length !== 1)
    throw new Error(
      "Trace requirement run must keep Step 3's Requirement Aggregation block, one fenced json block under that heading, in the final matrix.",
    );
  let aggregation;
  try {
    aggregation = JSON.parse(fences[0].content);
  } catch (error) {
    throw new Error(`Trace Step 3 Requirement Aggregation block is not valid JSON: ${error.message}`, { cause: error });
  }
  const { criterionMatrix, traceabilityMatrix } = aggregation ?? {};
  if (!Array.isArray(criterionMatrix) || !Array.isArray(traceabilityMatrix))
    throw new Error('Trace Step 3 Requirement Aggregation block must hold criterionMatrix and traceabilityMatrix arrays.');
  const criterionStatus = new Map();
  for (const row of criterionMatrix) {
    if (!row || typeof row.id !== 'string' || !criteria.has(row.id) || criterionStatus.has(row.id))
      throw new Error(`Trace Step 3 criterionMatrix row ${row?.id} is not a criterionLedger record, or repeats one.`);
    if (!COVERAGE.has(row.coverage)) throw new Error(`Trace Step 3 criterionMatrix row ${row.id} has invalid coverage.`);
    criterionStatus.set(row.id, row.coverage);
  }
  for (const id of criteria.keys()) if (!criterionStatus.has(id)) throw new Error(`Trace Step 3 criterionMatrix omits criterion ${id}.`);
  if (traceabilityMatrix.length !== ledger.length)
    throw new Error('Trace Step 3 traceabilityMatrix must hold one gate row per oracleLedger row, in ledger order.');
  const rows = new Map();
  for (const [index, saved] of ledger.entries()) {
    const row = traceabilityMatrix[index];
    if (!row || row.id !== saved.id || row.kind !== saved.kind)
      throw new Error(`Trace Step 3 traceabilityMatrix[${index}] must be ${saved.kind} row ${saved.id}, in oracleLedger order.`);
    if (saved.kind === 'exception') {
      if (row.coverage !== criterionStatus.get(saved.id))
        throw new Error(
          `Trace Step 3 exception row ${saved.id} is ${row.coverage}, but its criterionMatrix row is ${criterionStatus.get(saved.id)}.`,
        );
      rows.set(saved.id, { coverage: row.coverage });
      continue;
    }
    if (
      !Array.isArray(row.contributors) ||
      row.contributors.map((contributor) => contributor?.id).join('\n') !== saved.contributors.join('\n')
    )
      throw new Error(`Trace Step 3 requirement ${saved.id} contributors must be the oracleLedger contributors, in order.`);
    for (const contributor of row.contributors)
      if (contributor.coverage !== criterionStatus.get(contributor.id))
        throw new Error(
          `Trace Step 3 requirement ${saved.id} gives contributor ${contributor.id} ${contributor.coverage}, but its criterionMatrix row is ${criterionStatus.get(contributor.id)}.`,
        );
    const missing = row.missingBehaviors;
    if (!Array.isArray(missing) || missing.some((behavior) => typeof behavior !== 'string' || !behavior.trim()))
      throw new Error(`Trace Step 3 requirement ${saved.id} must list missingBehaviors as strings.`);
    const expected = requirementCoverage(
      row.contributors.map((contributor) => contributor.coverage),
      missing,
    );
    if (row.coverage !== expected)
      throw new Error(
        `Trace Step 3 requirement ${saved.id} is ${row.coverage}, but its contributors and missingBehaviors make it ${expected}.`,
      );
    rows.set(saved.id, { coverage: expected, missing });
  }
  return { criterionStatus, rows };
}

/**
 * Check the published requirement rows (`summary.oracle.rows`) against the gate ledger, the matrix
 * statuses and contributor tables, and AC5's aggregation: a requirement is NONE with no contributor or
 * only NONE contributors, FULL only when every contributor is FULL and no behavior is missing, else PARTIAL.
 * Then hold every final status to Step 3's persisted mapping: each criterion keeps the status Step 3
 * assessed, and each requirement the status and missing behaviors AC5 derives from it.
 */
function reconcileRequirementRows(summary, ledger, criteria, statuses, tables, aggregation) {
  const rows = summary.oracle.rows;
  if (!Array.isArray(rows) || rows.length !== ledger.length)
    throw new Error('Trace summary oracle.rows must list every oracleLedger row, in ledger order.');
  const coverage = new Map();
  const record = (id, status, where) => {
    if (!COVERAGE.has(status)) throw new Error(`Trace criterion ${id} has invalid coverage in ${where}.`);
    if (coverage.has(id) && coverage.get(id) !== status)
      throw new Error(`Trace criterion ${id} is ${coverage.get(id)} in one gate row and ${status} in ${where}.`);
    coverage.set(id, status);
  };
  const pairs = ledger.map((saved, index) => [saved, rows[index]]);
  for (const [index, [saved, row]] of pairs.entries()) {
    if (!row || typeof row !== 'object' || row.id !== saved.id)
      throw new Error(`Trace summary oracle.rows[${index}] must be ${saved.id}, in oracleLedger order.`);
    if (row.kind !== saved.kind || row.priority !== saved.priority || row.priority_basis !== saved.priorityBasis)
      throw new Error(`Trace summary row ${saved.id} kind, priority or priority_basis differs from the oracleLedger.`);
    if (row.coverage !== statuses.get(saved.id)) throw new Error(`Trace summary row ${saved.id} coverage differs from the matrix.`);
    if (saved.kind === 'exception') {
      if (row.exception !== saved.exception) throw new Error(`Trace summary row ${saved.id} must record exception ${saved.exception}.`);
      record(saved.id, row.coverage, `its exception row`);
    }
  }
  for (const [saved, row] of pairs) {
    if (saved.kind !== 'requirement') continue;
    if (row.parent !== saved.parent) throw new Error(`Trace summary row ${saved.id} parent differs from the oracleLedger.`);
    if (!Array.isArray(row.missing_behaviors) || row.missing_behaviors.some((behavior) => typeof behavior !== 'string' || !behavior.trim()))
      throw new Error(`Trace summary row ${saved.id} must list missing_behaviors as strings.`);
    if (
      !Array.isArray(row.contributors) ||
      row.contributors.map((contributor) => contributor?.id).join('\n') !== saved.contributors.join('\n')
    )
      throw new Error(`Trace summary row ${saved.id} contributors must be the oracleLedger contributors, in order.`);
    for (const contributor of row.contributors) {
      if (contributor.story !== storyOf(contributor.id))
        throw new Error(`Trace summary row ${saved.id} gives contributor ${contributor.id} a different story.`);
      record(contributor.id, contributor.coverage, `${saved.id}'s contributors`);
    }
    const table = tables.get(saved.id) ?? [];
    const listed = new Map(row.contributors.map((contributor) => [contributor.id, contributor]));
    if (
      table.length !== listed.size ||
      table.some(
        (cell) => listed.get(cell.id)?.story !== cell.story || listed.get(cell.id)?.coverage !== cell.coverage || !listed.delete(cell.id),
      )
    )
      throw new Error(`Trace matrix contributors table for ${saved.id} disagrees with its summary row.`);
    const below = row.contributors.find((contributor) => contributor.coverage !== 'FULL');
    const covered = row.contributors.find((contributor) => contributor.coverage !== 'NONE');
    if (row.coverage === 'FULL' && row.contributors.length === 0)
      throw new Error(`Trace requirement ${saved.id} is FULL, but no criterion contributes to it.`);
    if (row.coverage === 'FULL' && below)
      throw new Error(`Trace requirement ${saved.id} is FULL, but contributor ${below.id} is ${below.coverage}.`);
    if (row.coverage === 'FULL' && row.missing_behaviors.length > 0)
      throw new Error(`Trace requirement ${saved.id} is FULL, but it lists missing behaviors.`);
    if (row.coverage === 'NONE' && covered)
      throw new Error(`Trace requirement ${saved.id} is NONE, but contributor ${covered.id} is ${covered.coverage}.`);
    const expected = requirementCoverage(
      row.contributors.map((contributor) => contributor.coverage),
      row.missing_behaviors,
    );
    if (row.coverage !== expected)
      throw new Error(`Trace requirement ${saved.id} is ${row.coverage}, but its contributors and missing behaviors make it ${expected}.`);
  }
  for (const id of coverage.keys())
    if (!criteria.has(id)) throw new Error(`Trace summary names criterion ${id} absent from criterionLedger.`);
  for (const [id, status] of coverage)
    if (status !== aggregation.criterionStatus.get(id))
      throw new Error(
        `Trace final coverage gives criterion ${id} ${status}, but Step 3's Requirement Aggregation assessed it ${aggregation.criterionStatus.get(id)}.`,
      );
  for (const [saved, row] of pairs) {
    const step3 = aggregation.rows.get(saved.id);
    if (row.coverage !== step3.coverage)
      throw new Error(`Trace gate row ${saved.id} is ${row.coverage}, but Step 3's Requirement Aggregation makes it ${step3.coverage}.`);
    if (saved.kind === 'requirement' && behaviors(row.missing_behaviors).join('\n') !== behaviors(step3.missing).join('\n'))
      throw new Error(`Trace requirement ${saved.id} missing_behaviors differ from Step 3's persisted missingBehaviors.`);
  }
}

/**
 * Reconcile the saved Step 1 ledger with the caller's frozen source claims. Returns the gate rows
 * and the live alias map: identity over gate rows for the criterion oracle, Step 3's shared map otherwise.
 */
function oracleReference(progress, sourceLedger, required, allowLegacyExplicitOracle, requirements = false, tickets) {
  const granularity = progress.oracleGranularity ?? 'criteria';
  if (!['criteria', 'requirements'].includes(granularity)) throw new Error('Trace oracleGranularity must be criteria or requirements.');
  if (requirements && granularity !== 'requirements')
    throw new Error('Trace of a v7 epic with Requirements lines must record oracleGranularity: requirements.');
  if (!requirements && granularity === 'requirements')
    throw new Error("Trace oracleGranularity requirements needs a native v7 epic's frozen Requirements lines.");
  if (requirements) {
    const { reference, criteria, requirementIds } = requirementReference(progress, sourceLedger, tickets);
    const criterionIds = [...criteria.keys()];
    return { reference, criteria, criterionIds, aliases: liveAliasMap(criterionIds, requirementIds) };
  }
  const recorded = progress.oracleLedger;
  if (
    recorded === undefined &&
    required &&
    (!allowLegacyExplicitOracle || sourceLedger.length === 0 || sourceLedger.some((row) => !row.priority))
  )
    throw new Error('Trace progress must preserve the Step 1 oracleLedger.');
  const reference = new Map();
  if (recorded !== undefined) {
    if (!Array.isArray(recorded) || recorded.length === 0) throw new Error('Trace Step 1 oracleLedger must be a nonempty array.');
    for (const row of recorded) {
      if (!validOracleRow(row) || reference.has(row.id))
        throw new Error('Trace Step 1 oracleLedger has an invalid or duplicate criterion.');
      reference.set(row.id, row);
    }
  }
  if (sourceLedger.length > 0) {
    if (recorded !== undefined && (reference.size !== sourceLedger.length || sourceLedger.some((row) => !reference.has(row.id))))
      throw new Error('Trace Step 1 oracleLedger differs from the frozen source criterion identities.');
    for (const row of sourceLedger) {
      const saved = reference.get(row.id);
      if (row.priority && saved && saved.priority !== row.priority)
        throw new Error(`Trace Step 1 criterion ${row.id} changed its explicit source priority.`);
      if (saved && (criterionText(saved.requirement) !== criterionText(row.requirement) || saved.source !== row.source))
        throw new Error(`Trace Step 1 criterion ${row.id} changed its frozen requirement text or source binding.`);
      reference.set(row.id, { ...row, priority: row.priority ?? saved?.priority, compareText: Boolean(saved) });
    }
  }
  return { reference, criteria: null, criterionIds: null, aliases: new Map([...reference.keys()].map((id) => [id, { id }])) };
}

/** Read criterion claims from Markdown headings and their coverage labels. */
function matrixInventory(matrix, reference) {
  const criteria = new Map();
  const tableClaims = new Map();
  const ledgerPriorities = new Map();
  let current = null;
  let depth = 0;
  const body = matrix.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
  const tokens = new MarkdownIt().parse(body, {});
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index].type !== 'table_open') continue;
    const rows = [];
    let row = null;
    while (++index < tokens.length && tokens[index].type !== 'table_close') {
      if (tokens[index].type === 'tr_open') row = [];
      else if (tokens[index].type === 'inline' && row) row.push(tokens[index].content.trim());
      else if (tokens[index].type === 'tr_close') {
        rows.push(row);
        row = null;
      }
    }
    const header = (rows.shift() ?? []).map(bare);
    const idIndex = header.findIndex((cell) => /^(?:id|criterion|criterion id)$/i.test(cell));
    const requirementIndex = header.findIndex((cell) => /^requirement$/i.test(cell));
    const priorityIndex = header.findIndex((cell) => /^priority$/i.test(cell));
    const coverageIndex = header.findIndex((cell) => /^coverage$/i.test(cell));
    if (idIndex === -1 || priorityIndex === -1) continue;
    if (coverageIndex === -1 && !header.some((cell) => /^requirement$/i.test(cell))) continue;
    for (const cells of rows) {
      const id = bare(cells[idIndex] ?? '');
      const priority = bare(cells[priorityIndex] ?? '');
      if (!id || !/^P[0-3]$/.test(priority)) throw new Error('Trace criterion table has missing identity or priority.');
      if (ledgerPriorities.has(id) && ledgerPriorities.get(id) !== priority)
        throw new Error(`Trace criterion ${id} has conflicting priorities.`);
      ledgerPriorities.set(id, priority);
      if (coverageIndex === -1) continue;
      if (tableClaims.has(id)) throw new Error(`Trace criterion ${id} is duplicated in the matrix table.`);
      const status = /^(FULL|PARTIAL|NONE|UNIT-ONLY|INTEGRATION-ONLY)\b/.exec(bare(cells[coverageIndex] ?? ''))?.[1];
      if (!status) throw new Error(`Trace criterion ${id} has invalid table coverage.`);
      tableClaims.set(id, { priority, status, requirement: requirementIndex === -1 ? undefined : cells[requirementIndex] });
    }
  }
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type === 'heading_open') {
      const heading = tokens[index + 1].content;
      const nextDepth = Number(token.tag.slice(1));
      if (nextDepth <= depth) current = null;
      const claim = /^\*{0,2}([A-Za-z0-9][A-Za-z0-9_.-]*)\*{0,2}(?:\s*\((P[0-3])\))?\s*:\s/.exec(heading);
      if (claim && reference.size > 0 && !reference.has(claim[1]) && !ledgerPriorities.has(claim[1])) continue;
      const priority =
        claim?.[2] ??
        /\((P[0-3])\)\s*$/.exec(heading)?.[1] ??
        (claim ? ledgerPriorities.get(claim[1]) : null) ??
        /\b(P[0-3])\b/.exec(heading)?.[1];
      if (!claim || (!priority && !/^[A-Za-z]+-\d+$/.test(claim[1]))) continue;
      if (!priority) throw new Error(`Trace criterion ${claim[1]} has no priority.`);
      if (ledgerPriorities.has(claim[1]) && ledgerPriorities.get(claim[1]) !== priority)
        throw new Error(`Trace criterion ${claim[1]} detail contradicts its oracle priority.`);
      if (criteria.has(claim[1])) throw new Error(`Trace criterion ${claim[1]} is duplicated.`);
      current = { priority, status: null, requirement: heading.slice(claim[0].length) };
      depth = nextDepth;
      criteria.set(claim[1], current);
    } else if (current && token.type === 'inline') {
      const coverage = /\*\*Coverage:?\*\*\s*:?\s*([A-Z-]+)/i.exec(token.content);
      if (!coverage) continue;
      if (current.status !== null) throw new Error('Trace criterion declares coverage more than once.');
      current.status = coverage[1].toUpperCase();
    }
  }
  for (const [id, criterion] of tableClaims) {
    if (criteria.has(id)) {
      const detail = criteria.get(id);
      if (detail.priority !== criterion.priority || detail.status !== criterion.status)
        throw new Error(`Trace criterion ${id} table and detail disagree.`);
      if (criterion.requirement !== undefined && criterionText(detail.requirement) !== criterionText(criterion.requirement))
        throw new Error(`Trace criterion ${id} table and detail requirement text disagree.`);
    } else criteria.set(id, criterion);
  }
  for (const id of ledgerPriorities.keys()) {
    if (!criteria.has(id)) throw new Error(`Trace oracle criterion ${id} is missing from the matrix.`);
  }
  for (const [id, expected] of reference) {
    if (!criteria.has(id) || criteria.get(id).priority !== expected.priority)
      throw new Error(`Trace criterion ${id} differs from its frozen oracle priority or is missing.`);
    if (
      expected.compareText !== false &&
      (typeof criteria.get(id).requirement !== 'string' ||
        criterionText(criteria.get(id).requirement) !== criterionText(expected.requirement))
    )
      throw new Error(`Trace criterion ${id} changed its frozen requirement text in the matrix.`);
  }
  if (reference.size > 0 && [...criteria.keys()].some((id) => !reference.has(id)))
    throw new Error('Trace matrix has criteria absent from the Step 1 oracle ledger.');
  const inventory = Object.fromEntries(['P0', 'P1', 'P2', 'P3'].map((priority) => [priority, { total: 0, covered: 0 }]));
  const statuses = new Map();
  for (const [id, criterion] of criteria) {
    if (!COVERAGE.has(criterion.status)) throw new Error(`Trace criterion ${id} has missing or invalid coverage.`);
    inventory[criterion.priority].total++;
    if (criterion.status === 'FULL') inventory[criterion.priority].covered++;
    statuses.set(id, criterion.status);
  }
  return { inventory, statuses };
}

/** Check the public artifact contract and Step 5's deterministic gate invariants. */
function validateTraceOutputs({
  paths,
  target,
  collectionMode,
  allowGate,
  oracleLedger = [],
  requireOracleLedger = false,
  allowLegacyExplicitOracle = false,
  liveCapture,
  requireLiveManifest = false,
  tickets,
}) {
  const attemptRoot = path.dirname(path.dirname(paths.matrix));
  for (const [name, file] of Object.entries(paths)) {
    if (name === 'gate' && !fs.existsSync(file)) continue;
    try {
      readInput(attemptRoot, file, `current attempt ${name}`);
    } catch (error) {
      throw new Error(error.message, { cause: error });
    }
    if (fs.statSync(file).nlink !== 1) throw new Error(`Current attempt ${name} must be an independent regular artifact.`);
  }
  const matrix = fs.readFileSync(paths.matrix, 'utf8');
  const match = matrix.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error('Trace matrix is missing progress frontmatter.');
  const progress = yaml.load(match[1]);
  if (progress?.runKey !== target.runKey || progress?.runScope !== target.runScope)
    throw new Error('Trace matrix has a different run identity.');
  if (progress.workflowStatus !== 'completed' || progress.lastStep !== 'step-05-gate-decision')
    throw new Error('Trace workflow has not completed its final step.');
  const requiredSteps = [
    'step-01-load-context',
    'step-02-discover-tests',
    'step-03-map-criteria',
    'step-04-analyze-gaps',
    'step-05-gate-decision',
  ];
  if (!Array.isArray(progress.stepsCompleted) || requiredSteps.some((step) => !progress.stepsCompleted.includes(step)))
    throw new Error('Trace matrix has incomplete workflow steps.');

  const summary = readJson(paths.summary);
  if (!/^0\.3\.\d+$/.test(summary.schema_version ?? '')) throw new Error('Trace summary must declare schema_version 0.3.x.');
  if (summary.collection_mode !== collectionMode || summary.decision_mode !== 'deterministic')
    throw new Error('Trace summary has different collection or decision settings.');
  if (!['COLLECTED', 'WAIVED', 'RESTRICTED', 'INACCESSIBLE', 'DEFERRED_SHARED'].includes(summary.collection_status))
    throw new Error('Trace summary has an unknown collection status.');
  const fixedStatus = { waived: 'WAIVED', restricted: 'RESTRICTED', inaccessible: 'INACCESSIBLE', deferred_shared: 'DEFERRED_SHARED' }[
    collectionMode
  ];
  if (fixedStatus && summary.collection_status !== fixedStatus) throw new Error('Trace summary collection status contradicts its mode.');
  if (collectionMode === 'contract_static' && summary.collection_status !== 'COLLECTED')
    throw new Error('Trace summary collection status contradicts contract_static collection.');
  if (requireLiveManifest && collectionMode === 'runtime_manifest') {
    const expectedStatus = liveCapture?.manifest ? 'COLLECTED' : 'INACCESSIBLE';
    if (summary.collection_status !== expectedStatus)
      throw new Error('Trace runtime-manifest collection status contradicts the frozen supplied evidence.');
  }
  if (summary.target?.type !== target.type || String(summary.target?.id ?? '') !== target.id)
    throw new Error('Trace summary has a different target.');
  if (!Number.isFinite(Date.parse(summary.snapshot_at))) throw new Error('Trace summary has no valid snapshot_at timestamp.');
  for (const field of ['repo', 'source_sha', 'evaluator'])
    if (typeof summary[field] !== 'string') throw new Error(`Trace summary has no ${field} string.`);
  if (!['high', 'medium', 'low'].includes(summary.confidence) || summary.oracle?.confidence !== summary.confidence)
    throw new Error('Trace summary has inconsistent oracle confidence.');
  if (
    !['formal_requirements', 'spec_artifact', 'external_pointer', 'synthetic_source'].includes(summary.oracle?.resolution_mode) ||
    !Array.isArray(summary.oracle?.sources) ||
    typeof summary.oracle.synthetic !== 'boolean'
  )
    throw new Error('Trace summary has incomplete oracle metadata.');
  if (!['acceptance_criteria', 'synthetic_requirements', 'openapi_endpoints', 'user_journeys'].includes(summary.inventory_basis))
    throw new Error('Trace summary has no concrete inventory basis.');
  for (const [name, bucket] of [
    ['inventory', summary.coverage?.inventory],
    ...['P0', 'P1', 'P2', 'P3'].map((key) => [key, summary.coverage?.priority_breakdown?.[key]]),
  ]) {
    if (
      !bucket ||
      !Number.isInteger(bucket.total) ||
      !Number.isInteger(bucket.covered) ||
      bucket.total < 0 ||
      bucket.covered < 0 ||
      bucket.covered > bucket.total
    ) {
      throw new Error(`Trace coverage ${name} has invalid counts.`);
    }
    const expected = bucket.total === 0 ? 100 : Math.round((bucket.covered / bucket.total) * 100);
    if (bucket.pct !== expected) throw new Error(`Trace coverage ${name} percentage does not match its counts.`);
  }
  const priorities = ['P0', 'P1', 'P2', 'P3'].map((key) => summary.coverage.priority_breakdown[key]);
  const requirements = requirementOracle(target, oracleLedger);
  const { reference, criteria, criterionIds, aliases } = oracleReference(
    progress,
    oracleLedger,
    requireOracleLedger,
    allowLegacyExplicitOracle,
    requirements,
    tickets,
  );
  // Legacy criterion summaries may omit the field; a requirement run must label its inventory.
  const granularity = requirements ? 'requirements' : 'criteria';
  if ((summary.oracle.granularity ?? (requirements ? null : 'criteria')) !== granularity)
    throw new Error(`Trace summary oracle.granularity must be ${granularity}, matching the progress oracleGranularity.`);
  const { inventory: declared, statuses } = matrixInventory(matrix, reference);
  if (requirements)
    reconcileRequirementRows(
      summary,
      progress.oracleLedger,
      criteria,
      statuses,
      matrixContributors(matrix, reference),
      requirementAggregation(matrix, progress.oracleLedger, criteria),
    );
  for (const [priority, counts] of Object.entries(declared)) {
    const reported = summary.coverage.priority_breakdown[priority];
    if (reported.total !== counts.total || reported.covered !== counts.covered)
      throw new Error(`Trace matrix ${priority} coverage contradicts its summary.`);
  }
  if (
    priorities.reduce((total, bucket) => total + bucket.total, 0) !== summary.coverage.inventory.total ||
    priorities.reduce((total, bucket) => total + bucket.covered, 0) !== summary.coverage.inventory.covered
  )
    throw new Error('Trace priority counts disagree with overall coverage.');
  for (const level of LEVELS) {
    const bucket = summary.coverage.by_level?.[level];
    if (
      !bucket ||
      !Number.isInteger(bucket.tests) ||
      bucket.tests < 0 ||
      !Number.isInteger(bucket.criteria_covered) ||
      bucket.criteria_covered < 0
    )
      throw new Error(`Trace summary has invalid ${level} inventory.`);
    // Requirement rows share criteria; per-level counts come from criterionLedger, each criterion once.
    if (criterionIds && bucket.criteria_covered > criterionIds.length)
      throw new Error(`Trace ${level} criteria_covered exceeds the Step 1 criterionLedger.`);
  }
  for (const field of ['files', 'cases', 'skipped_cases', 'fixme_cases', 'pending_cases']) {
    if (!Number.isInteger(summary.tests?.[field]) || summary.tests[field] < 0) throw new Error(`Trace summary has invalid tests.${field}.`);
  }
  if (LEVELS.reduce((total, level) => total + summary.coverage.by_level[level].tests, 0) !== summary.tests.cases)
    throw new Error('Trace test totals disagree with level inventory.');
  for (const field of ['blockers', 'recommendations', 'rejected_evidence'])
    if (!Array.isArray(summary[field])) throw new Error(`Trace summary has no ${field} array.`);
  for (const field of ['critical_open', 'high_open', 'medium_open', 'low_open'])
    if (!Number.isInteger(summary.risk_summary?.[field]) || summary.risk_summary[field] < 0)
      throw new Error(`Trace summary has invalid risk_summary.${field}.`);
  if (!summary.live_evidence || typeof summary.live_evidence !== 'object' || Array.isArray(summary.live_evidence))
    throw new Error('Trace summary has no live_evidence metadata.');
  const frozenLive = liveReference(liveCapture, aliases);
  if (frozenLive) {
    for (const field of ['present', 'freshness', 'failed'])
      if (summary.live_evidence[field] !== frozenLive[field])
        throw new Error(`Trace live evidence ${field} differs from the frozen supplied manifest.`);
    const reportedSha = summary.live_evidence.current_source_sha;
    if (reportedSha !== frozenLive.current_source_sha && !(frozenLive.current_source_sha === '' && reportedSha === 'unknown'))
      throw new Error('Trace live evidence current_source_sha differs from the frozen consuming revision.');
    if ('fresh_failed' in summary.live_evidence && summary.live_evidence.fresh_failed !== frozenLive.freshFailed)
      throw new Error('Trace live evidence fresh_failed differs from the frozen supplied manifest.');
  }
  // Step 4 counts every non-FULL P0 item as critical; P1-P3 gap buckets count NONE only.
  for (const [index, field] of ['critical_open', 'high_open', 'medium_open', 'low_open'].entries()) {
    const uncovered = priorities[index].total - priorities[index].covered;
    if (index === 0 ? summary.risk_summary[field] !== uncovered : summary.risk_summary[field] > uncovered)
      throw new Error(`Trace ${field} contradicts its uncovered priority inventory.`);
  }
  if (summary.links?.trace_report_path !== paths.matrix) throw new Error('Trace summary links to a different matrix.');

  const eligible = allowGate && summary.collection_status === 'COLLECTED';
  let gate = null;
  if (eligible) {
    if (!GATE_STATUSES.has(summary.gate_status) || summary.gate_basis !== 'priority_thresholds')
      throw new Error('Eligible trace summary has no valid gate decision.');
    const criteria = summary.gate_criteria;
    for (const field of [
      'p0_coverage_required',
      'p0_coverage_actual',
      'p1_coverage_target',
      'p1_coverage_minimum',
      'p1_coverage_actual',
      'overall_coverage_minimum',
      'overall_coverage_actual',
    ])
      if (typeof criteria?.[field] !== 'string' || !/^\d+%$/.test(criteria[field])) throw new Error(`Trace gate has invalid ${field}.`);
    for (const field of ['p0_status', 'p1_status', 'overall_status'])
      if (!['MET', 'PARTIAL', 'NOT_MET'].includes(criteria?.[field])) throw new Error(`Trace gate has invalid ${field}.`);
    // Step 5 defines these public gate fields. Validate their consistency with
    // the inventory; criterion classification remains the skill's assessment.
    const p0 = summary.coverage.priority_breakdown.P0.pct;
    const p1 = summary.coverage.priority_breakdown.P1.pct;
    const overall = summary.coverage.inventory.pct;
    const expectedCriteria = {
      p0_coverage_required: '100%',
      p0_coverage_actual: `${p0}%`,
      p0_status: p0 === 100 ? 'MET' : 'NOT_MET',
      p1_coverage_target: '90%',
      p1_coverage_minimum: '80%',
      p1_coverage_actual: `${p1}%`,
      p1_status: p1 >= 90 ? 'MET' : p1 >= 80 ? 'PARTIAL' : 'NOT_MET',
      overall_coverage_minimum: '80%',
      overall_coverage_actual: `${overall}%`,
      overall_status: overall >= 80 ? 'MET' : 'NOT_MET',
    };
    for (const [field, expected] of Object.entries(expectedCriteria))
      if (criteria[field] !== expected) throw new Error(`Trace gate ${field} contradicts the coverage inventory or Step 5 thresholds.`);
    let expectedStatus = p0 < 100 || overall < 80 || p1 < 80 ? 'FAIL' : p1 < 90 ? 'CONCERNS' : 'PASS';
    const liveOnly = summary.live_evidence.requirements_live_only;
    if (!Number.isInteger(liveOnly) || liveOnly < 0) throw new Error('Trace summary has invalid live-only coverage metadata.');
    const synthetic = summary.oracle.synthetic || ['synthetic_requirements', 'user_journeys'].includes(summary.inventory_basis);
    const liveFailed = summary.live_evidence.failed;
    if (summary.live_evidence.freshness === 'fresh' && (!Number.isInteger(liveFailed) || liveFailed < 0))
      throw new Error('Trace fresh live evidence has invalid failed count.');
    const freshFailed =
      frozenLive?.freshFailed ?? summary.live_evidence.fresh_failed ?? (summary.live_evidence.freshness === 'fresh' ? liveFailed : 0);
    if (freshFailed !== undefined && (!Number.isInteger(freshFailed) || freshFailed < 0))
      throw new Error('Trace live evidence has invalid fresh_failed count.');
    const freshFailure = freshFailed > 0;
    if (expectedStatus === 'PASS' && ((synthetic && summary.confidence !== 'high') || liveOnly > 0 || freshFailure))
      expectedStatus = 'CONCERNS';
    if (summary.gate_status !== expectedStatus) throw new Error('Trace gate decision contradicts its coverage and confidence evidence.');
    gate = readJson(paths.gate);
    if (
      gate.schema_version !== '0.1.0' ||
      gate.gate_status !== summary.gate_status ||
      gate.evaluated_at !== summary.snapshot_at ||
      gate.target?.type !== summary.target.type ||
      String(gate.target?.id ?? '') !== target.id
    )
      throw new Error('Trace gate artifact disagrees with its summary.');
    if (
      gate.collection_status !== summary.collection_status ||
      gate.gate_basis !== summary.gate_basis ||
      typeof gate.rationale !== 'string' ||
      !gate.rationale.trim() ||
      gate.critical_open !== summary.risk_summary.critical_open
    )
      throw new Error('Trace gate artifact has incomplete or inconsistent decision evidence.');
    for (const field of ['p0_status', 'p1_status', 'overall_status'])
      if (gate[field] !== criteria[field]) throw new Error(`Trace gate artifact disagrees with ${field}.`);
  } else if ('gate_status' in summary || 'gate_criteria' in summary || fs.existsSync(paths.gate) || summary.gate_basis !== 'none') {
    throw new Error('Trace collected no eligible gate, but emitted a gate signal.');
  }
  return { matrix, summary, gate };
}

/** Publish only the validated current attempt, updating the moved report link. */
function publishTraceOutputs(value, destinations, io = fs) {
  const links = { ...value.summary.links, trace_report_path: destinations.matrix };
  const summary = { ...value.summary, links };
  const gate = value.gate ? { ...value.gate, links } : null;
  const contents = {
    matrix: value.matrix,
    summary: `${JSON.stringify(summary, null, 2)}\n`,
    gate: gate ? `${JSON.stringify(gate, null, 2)}\n` : null,
  };
  const staged = [];
  let keepBackups = false;
  try {
    for (const [name, destination] of Object.entries(destinations)) {
      io.mkdirSync(path.dirname(destination), { recursive: true });
      const directory = io.mkdtempSync(path.join(path.dirname(destination), '.tea-trace-publish-'));
      const item = {
        destination,
        directory,
        previous: path.join(directory, 'previous'),
        next: path.join(directory, 'next'),
        existed: io.existsSync(destination),
        installed: false,
        remove: contents[name] === null,
      };
      staged.push(item);
      if (item.existed) {
        if (!io.statSync(destination).isFile()) throw new Error(`Trace destination is not a regular file: ${destination}`);
        io.copyFileSync(destination, item.previous);
      }
      if (!item.remove) {
        io.writeFileSync(item.next, contents[name], 'utf8');
        if (item.existed) io.chmodSync(item.next, io.statSync(destination).mode);
      }
    }
    for (const item of staged) {
      if (item.remove) {
        if (item.existed) io.unlinkSync(item.destination);
      } else io.renameSync(item.next, item.destination);
      item.installed = true;
    }
  } catch (error) {
    const failures = [];
    for (const item of staged.filter((entry) => entry.installed).toReversed()) {
      try {
        if (item.existed) io.renameSync(item.previous, item.destination);
        else if (!item.remove) io.unlinkSync(item.destination);
      } catch (error) {
        failures.push(`${item.destination}: ${error.message}`);
      }
    }
    keepBackups = failures.length > 0;
    throw new Error(
      `Trace publication failed: ${error.message}; ${keepBackups ? `recovery backups retained at ${staged.map((item) => item.directory).join(', ')}; rollback failures: ${failures.join('; ')}` : 'previous reports restored'}`,
      { cause: error },
    );
  } finally {
    if (!keepBackups) {
      for (const item of staged) {
        try {
          io.rmSync(item.directory, { recursive: true, force: true });
        } catch (error) {
          process.stderr.write(`Trace publication staging cleanup failed at ${item.directory}: ${error.message}\n`);
        }
      }
    }
  }
  return summary;
}

module.exports = {
  sourceOracleLedger,
  epicTicketSources,
  requirementOracle,
  COLLECTION_MODES,
  GATE_TYPES,
  resolveTraceTarget,
  tracePaths,
  validateTraceOutputs,
  publishTraceOutputs,
};
