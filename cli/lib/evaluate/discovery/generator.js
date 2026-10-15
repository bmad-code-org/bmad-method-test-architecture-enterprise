/**
 * The offline prompt candidate generator: three narrow families of one-line prompt edits, each previewed as an
 * exploratory candidate whose edit is the native `replace-exact` shape.
 *
 * The generator is a function from the target file's bytes to a preview. It reads no file, starts no process, opens no
 * socket and calls no model, so a preview costs nothing and runs anywhere. The caller supplies the bytes and the digest
 * of the requirements statement and writes the records it keeps; `test/test-evaluate-generator.js` holds the module to
 * that by its source and by running it with the network and process entry points broken.
 *
 * Families (the catalog, versioned by `GENERATOR_VERSION`):
 *
 * - `modal-strength`: `must` and `shall` become `should`, so a required step turns optional.
 * - `negation`: `do not`, `must not`, `shall not`, `should not`, their contractions, `cannot` and `never` lose their
 *   negation, so a prohibition turns into an instruction.
 * - `numeric-threshold`: the integer after a recognized bound phrase (`at least`, `at most`, `up to`, `below`, `>=` and
 *   the rest) loosens in the direction the bound constrains: a lower bound halves, an upper bound doubles. A number with
 *   no bound phrase before it is never touched.
 *
 * One candidate is one site: one word or number changes. Its `find` is the whole line holding the site and its `replace`
 * is that line after the change, so a reviewer reads the edit in context and `find` holds the single-occurrence rule the
 * native checker applies: a line that occurs twice in the file, or inside a longer line, is rejected as a repeated span.
 * A site inside front matter, a code fence, inline code, a quotation, a heading, a block quote, an HTML comment, a link
 * target, a URL or a placeholder is rejected as protected. A site whose edit would read as something else (a noun
 * `must`, `never` in a statement of fact, a bound that is a date, a version, a decimal or a range, a percentage past
 * 100) is rejected with the reason. Nothing is dropped silently: every rejection is in the preview with its code.
 *
 * The seed orders the sites of a family for the per-family cap. Each site ranks by a digest of the seed and the site, the
 * lowest ranks are kept, and the rest are counted as omitted. The kept sites are numbered in catalog and document order.
 * Every candidate records the seed in its generator field, which its identity covers.
 */

'use strict';

const { digest } = require('../digest');
const { CANDIDATE_SCHEMA_VERSION, RECORD_KIND, bytesDigest, candidateIdentity, validateCandidate } = require('./candidate');

const GENERATOR_NAME = 'prompt-edit';
const GENERATOR_VERSION = '1.0.0';
const DEFAULT_PER_FAMILY_CAP = 5;
const REQUIREMENTS_PATH = 'requirements.md';
const MAX_SAFE_DIGITS = 15;

/** A generator input that cannot be used; the message names the option or the file property. */
class GeneratorError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GeneratorError';
  }
}

const NEGATION_WORDS = new Set(['not', 'no', 'never', 'neither', 'nor', 'without', 'nothing', 'none', 'nobody', 'cannot']);
const NOUN_DETERMINERS = new Set(['a', 'an', 'the', 'this', 'that', 'no', 'any', 'every', 'each', 'its', 'their', 'our', 'your', 'my']);
const DESCRIPTIVE_SUBJECTS = new Set([
  'we',
  'they',
  'i',
  'he',
  'she',
  'it',
  'which',
  'who',
  'that',
  'has',
  'have',
  'had',
  'was',
  'were',
  'is',
  'are',
  'am',
  'been',
]);

/** Words after a number that name no unit. */
const FILLER = new Set(['of', 'the', 'a', 'an', 'and', 'or', 'to', 'in', 'on', 'for', 'is', 'are', 'if', 'when']);
const LOWER_BOUNDS = [
  'at least',
  'no fewer than',
  'no less than',
  'minimum of',
  'minimum',
  'min',
  'more than',
  'greater than',
  'above',
  'over',
  'exceeds',
  'exceeding',
  '>=',
  '≥',
  '>',
];
const UPPER_BOUNDS = [
  'at most',
  'no more than',
  'up to',
  'maximum of',
  'maximum',
  'max',
  'fewer than',
  'less than',
  'under',
  'below',
  'within',
  '<=',
  '≤',
  '<',
];

/** `phrase` as a case-insensitive pattern source: spaces match any run of whitespace, symbols are escaped. */
function phraseSource(phrase) {
  return phrase.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`).replaceAll(' ', String.raw`\s+`);
}

/** Longest phrase first, so `no more than` is read whole before `more than` is tried. */
function boundPattern(phrases) {
  const sorted = [...phrases].sort((a, b) => b.length - a.length);
  return sorted.map(phraseSource).join('|');
}

/** A word phrase needs a space before its number (`over3` is no bound); a symbol phrase may touch it (`>=3`). */
const GAP = String.raw`\s+|(?<=[^\p{L}])\s*`;
const BOUND_SITE = new RegExp(
  String.raw`(?<![\w-])(?<lower>${boundPattern(LOWER_BOUNDS)})(?<gap>${GAP})(?<number>\d+)(?<tail>[A-Za-z%]*)|(?<![\w-])(?<upper>${boundPattern(UPPER_BOUNDS)})(?<gap2>${GAP})(?<number2>\d+)(?<tail2>[A-Za-z%]*)`,
  'giu',
);

/** The letter case of `word` applied to `replacement`: all capitals, a leading capital or lower case. */
function matchCase(word, replacement) {
  if (word.length > 1 && word === word.toUpperCase()) return replacement.toUpperCase();
  if (word[0] !== word[0].toLowerCase()) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

/** The word before `index` in `line`, lower-cased, or an empty string. */
function wordBefore(line, index) {
  return /([\p{L}']+)\W*$/u.exec(line.slice(0, index))?.[1].toLowerCase() ?? '';
}

/** The word after `index` in `line`, lower-cased, or an empty string. */
function wordAfter(line, index) {
  return /^\W*([\p{L}']+)/u.exec(line.slice(index))?.[1].toLowerCase() ?? '';
}

/** A site the family recognized but cannot edit safely. */
function refuse(start, end, code, message) {
  return { start, end, code, message };
}

/** A site with its edit: `line.slice(start, end)` becomes `replacement`. */
function edit(start, end, replacement, hypothesis) {
  return { start, end, replacement, hypothesis };
}

/**
 * The modal-strength sites of a line.
 *
 * @param {string} line
 * @returns {Array<object>}
 */
function modalSites(line) {
  const sites = [];
  for (const match of line.matchAll(/(?<![\w-])(must|shall)(?![\w-])/giu)) {
    const [word] = match;
    const start = match.index;
    const end = start + word.length;
    if (/\?\s*$/.test(line)) {
      sites.push(refuse(start, end, 'question', `"${word}" sits in a question, which asks and does not instruct`));
    } else if (NOUN_DETERMINERS.has(wordBefore(line, start))) {
      sites.push(
        refuse(
          start,
          end,
          'not-a-directive',
          `"${word}" follows "${wordBefore(line, start)}", which makes it a noun, and "should" would corrupt the grammar`,
        ),
      );
    } else {
      const replacement = matchCase(word, 'should');
      sites.push(
        edit(start, end, replacement, `Softens "${word}" to "${replacement}", so a step the instruction requires becomes optional`),
      );
    }
  }
  return sites;
}

/**
 * The negation sites of a line.
 *
 * @param {string} line
 * @returns {Array<object>}
 */
function negationSites(line) {
  const sites = [];
  const patterns = [
    { pattern: /(?<![\w-])(do|must|shall|should)(\s+)not(?![\w-])/giu, keep: (m) => m[1] },
    { pattern: /(?<![\w-])(do|must|shall|should)n['’]t(?![\w-])/giu, keep: (m) => m[1] },
    { pattern: /(?<![\w-])can(?:not|\s+not|['’]t)(?![\w-])/giu, keep: (m) => matchCase(m[0], 'can') },
    { pattern: /(?<![\w-])never(?![\w-])/giu, keep: (m) => matchCase(m[0], 'always') },
  ];
  for (const { pattern, keep } of patterns) {
    for (const match of line.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      const before = wordBefore(line, start);
      const after = wordAfter(line, end);
      if (/\?\s*$/.test(line)) {
        sites.push(refuse(start, end, 'question', `"${match[0]}" sits in a question, which asks and does not instruct`));
      } else if (NEGATION_WORDS.has(after) || /^\W*\p{L}*n['’]t\b/iu.test(line.slice(end))) {
        sites.push(
          refuse(
            start,
            end,
            'double-negation',
            `"${match[0]}" is followed by "${after}", so removing it would leave a negation reading as the opposite of both`,
          ),
        );
      } else if (DESCRIPTIVE_SUBJECTS.has(before)) {
        sites.push(
          refuse(start, end, 'descriptive', `"${match[0]}" follows "${before}", which reads as a statement of fact and not an instruction`),
        );
      } else {
        const replacement = keep(match);
        sites.push(
          edit(
            start,
            end,
            replacement,
            `Removes the prohibition in "${match[0]}", so the instruction reads "${replacement}" and asks for the behavior it forbade`,
          ),
        );
      }
    }
  }
  return sites;
}

/**
 * The numeric-threshold sites of a line.
 *
 * @param {string} line
 * @returns {Array<object>}
 */
function numericSites(line) {
  const sites = [];
  for (const match of line.matchAll(BOUND_SITE)) {
    const { groups } = match;
    const lower = groups.lower !== undefined;
    const phrase = lower ? groups.lower : groups.upper;
    const number = lower ? groups.number : groups.number2;
    const gap = lower ? groups.gap : groups.gap2;
    const tail = lower ? groups.tail : groups.tail2;
    const start = match.index + phrase.length + gap.length;
    const end = start + number.length;
    const after = line.slice(end + tail.length);
    const bound = `${phrase}${gap}${number}${tail}`;
    const percent = tail.startsWith('%');
    // Attached letters are the unit (`500ms`); a spaced word is the unit too (`3 retries`).
    const next = /^\s+(\p{L}+)/u.exec(after)?.[1];
    const unit = percent ? '%' : tail === '' ? (next === undefined || FILLER.has(next.toLowerCase()) ? 'none' : next) : tail;
    if (/^[-.,:/][0-9]/.test(after)) {
      sites.push(
        refuse(
          start,
          end,
          'not-a-threshold',
          `"${bound}" continues as a decimal, a version, a date, a time or a range, and a part of it is not a bound`,
        ),
      );
    } else if (number.length > MAX_SAFE_DIGITS) {
      sites.push(refuse(start, end, 'not-a-threshold', `"${bound}" is too large to loosen exactly`));
    } else {
      const value = Number(number);
      const loosened = lower ? Math.floor(value / 2) : value * 2;
      if (loosened === value) {
        sites.push(refuse(start, end, 'no-change', `"${bound}" is already as loose as the rule loosens it`));
      } else if (tail === '' && unit !== 'none' && (value === 1) !== (loosened === 1)) {
        sites.push(
          refuse(
            start,
            end,
            'number-agreement',
            `"${bound}" would become ${loosened} ${unit}, which breaks the singular or plural of "${unit}"`,
          ),
        );
      } else if (percent && loosened > 100) {
        sites.push(refuse(start, end, 'beyond-range', `"${bound}" would become ${loosened}%, which no percentage can reach`));
      } else {
        const direction = lower ? 'lower' : 'upper';
        sites.push(
          edit(
            start,
            end,
            String(loosened),
            `Loosens the ${direction} bound "${phrase} ${number}" (unit ${unit}) to ${loosened}, so a ${lower ? 'smaller' : 'larger'} value than the requirement allows still meets the instruction`,
          ),
        );
      }
    }
  }
  return sites;
}

/** The catalog, in the order candidates are numbered. */
const FAMILIES = Object.freeze([
  Object.freeze({ name: 'modal-strength', sites: modalSites }),
  Object.freeze({ name: 'negation', sites: negationSites }),
  Object.freeze({ name: 'numeric-threshold', sites: numericSites }),
]);
const FAMILY_NAMES = Object.freeze(FAMILIES.map((family) => family.name));

/** Marks `[from, to)` of `reasons` as protected for `reason`, keeping a reason already set. */
function protect(reasons, from, to, reason) {
  for (let at = from; at < Math.min(to, reasons.length); at += 1) reasons[at] ??= reason;
}

/**
 * The reason each character of `text` is protected from an edit, or `undefined`: front matter, fenced code, headings,
 * block quotes, HTML comments, inline code, quotations, link targets, URLs and placeholders.
 *
 * @param {string} text
 * @returns {Array<string|undefined>}
 */
function protectedSpans(text) {
  const reasons = Array.from({ length: text.length });
  const front = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (front) protect(reasons, 0, front[0].length, 'front-matter');
  for (const comment of text.matchAll(/<!--[\s\S]*?(?:-->|$)/g))
    protect(reasons, comment.index, comment.index + comment[0].length, 'html-comment');

  let fence = null;
  let at = 0;
  for (const rawLine of text.split('\n')) {
    const lineEnd = at + rawLine.length;
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(rawLine);
    if (fence !== null) {
      protect(reasons, at, lineEnd, 'code-fence');
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && /^ {0,3}[`~]+\s*$/.test(rawLine)) fence = null;
    } else if (marker) {
      fence = marker[1];
      protect(reasons, at, lineEnd, 'code-fence');
    } else {
      if (/^ {0,3}#{1,6}(\s|$)/.test(rawLine)) protect(reasons, at, lineEnd, 'heading');
      if (/^ {0,3}>/.test(rawLine)) protect(reasons, at, lineEnd, 'block-quote');
      for (const code of rawLine.matchAll(/(`+)(?:(?!\1).)+?\1/g))
        protect(reasons, at + code.index, at + code.index + code[0].length, 'inline-code');
      // Straight quotes pair up left to right; an unpaired last one quotes the rest of the line.
      const quotes = [...rawLine.matchAll(/"/g)].map((quote) => quote.index);
      for (let pair = 0; pair < quotes.length; pair += 2) {
        protect(reasons, at + quotes[pair], quotes[pair + 1] === undefined ? lineEnd : at + quotes[pair + 1] + 1, 'quotation');
      }
      for (const quote of rawLine.matchAll(/“[^”]*(?:”|$)/g))
        protect(reasons, at + quote.index, at + quote.index + quote[0].length, 'quotation');
      for (const link of rawLine.matchAll(/\]\([^)]*\)/g))
        protect(reasons, at + link.index, at + link.index + link[0].length, 'link-target');
      for (const url of rawLine.matchAll(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi))
        protect(reasons, at + url.index, at + url.index + url[0].length, 'url');
      const placeholder =
        /\{\{[^}]*\}\}|\$\{[^}]*\}|\{[A-Za-z_][\w.-]*\}|<[A-Za-z_][\w.:-]*>|\[\[[^\]]*\]\]|%\([^)]*\)[sd]|%[sd]|\$[A-Za-z_]\w*|\$\d+/g;
      for (const found of rawLine.matchAll(placeholder))
        protect(reasons, at + found.index, at + found.index + found[0].length, 'placeholder');
    }
    at = lineEnd + 1;
  }
  return reasons;
}

/** How often `find` occurs in `text`, overlapping occurrences included, as the native `replace-exact` operator counts them. */
function countOccurrences(text, find) {
  let count = 0;
  for (let at = text.indexOf(find); at !== -1; at = text.indexOf(find, at + 1)) count += 1;
  return count;
}

/** The text of the bytes, which must be well-formed UTF-8 without a NUL. */
function decodeTarget(bytes) {
  if (!ArrayBuffer.isView(bytes)) throw new GeneratorError('target.bytes must be a Buffer or Uint8Array holding the target file');
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new GeneratorError('target.bytes is not UTF-8 text');
  }
  if (text.includes('\u0000')) throw new GeneratorError('target.bytes holds a NUL, so it is not a prompt');
  return text;
}

/** The families a run uses, in catalog order, from the caller's names. */
function chooseFamilies(names) {
  if (names === undefined) return FAMILIES;
  if (!Array.isArray(names) || names.length === 0)
    throw new GeneratorError('families must name at least one of ' + FAMILY_NAMES.join(', '));
  const unknown = names.filter((name) => !FAMILY_NAMES.includes(name));
  if (unknown.length > 0)
    throw new GeneratorError(
      `unknown famil${unknown.length === 1 ? 'y' : 'ies'} ${unknown.map((name) => JSON.stringify(name)).join(', ')}; the catalog is ${FAMILY_NAMES.join(', ')}`,
    );
  return FAMILIES.filter((family) => names.includes(family.name));
}

/** The position of the seed-ordered site, a digest that only the same seed and the same site reproduce. */
function rank(seed, site) {
  return digest([
    `tea-evaluate-generator/${GENERATOR_VERSION}`,
    seed,
    site.family,
    String(site.line),
    String(site.column),
    site.find,
    site.replace,
  ]);
}

/** Every site of the text per family, each as an edit or a refusal, with where it sits and why. */
function scan(text, families) {
  const reasons = protectedSpans(text);
  const found = [];
  const rejected = [];
  let lineStart = 0;
  for (const [index, raw] of text.split('\n').entries()) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    for (const family of families) {
      for (const site of family.sites(line)) {
        const where = { family: family.name, line: index + 1, column: site.start + 1 };
        const covered = Array.from({ length: site.end - site.start }, (_, offset) => reasons[lineStart + site.start + offset]).find(
          Boolean,
        );
        const refusal =
          site.code === undefined
            ? covered === undefined
              ? null
              : { code: 'protected-span', message: `the site sits in ${covered.replace('-', ' ')}, which an edit leaves alone` }
            : { code: site.code, message: site.message };
        if (refusal === null) {
          const replace = line.slice(0, site.start) + site.replacement + line.slice(site.end);
          const repeats = countOccurrences(text, line);
          if (repeats === 1)
            found.push({
              ...where,
              find: line,
              replace,
              original: line.slice(site.start, site.end),
              replacement: site.replacement,
              hypothesis: site.hypothesis,
            });
          else
            rejected.push({
              ...where,
              text: line,
              code: 'repeated-span',
              message: `the line occurs ${repeats} times in the target, so an exact edit of it is ambiguous`,
            });
        } else {
          rejected.push({ ...where, text: line, ...refusal });
        }
      }
    }
    lineStart += raw.length + 1;
  }
  return { found, rejected };
}

/**
 * Previews the candidates the catalog proposes for one prompt file. Nothing is read or written.
 *
 * @param {object} options
 * @param {{artifact: string, bytes: Uint8Array}} options.target the file as a mutation's `targetArtifact` spells it, and its bytes
 * @param {string} options.requirementDigest `requirements.digest` as `evaluation.json` records it
 * @param {string} options.campaignId
 * @param {string} options.seed any non-empty string; it orders the sites a cap has to choose among
 * @param {string[]} [options.families] a subset of the catalog; all by default
 * @param {number} [options.perFamilyCap] the most candidates one family contributes, 5 by default
 * @returns {{generator: object, config: object, target: object, counts: object, candidates: object[], rejected: object[]}}
 * @throws {GeneratorError} for an input the generator cannot use
 * @throws {import('./candidate').CandidateError} when a built candidate is not a valid record
 */
function previewCandidates({ target, requirementDigest, campaignId, seed, families, perFamilyCap = DEFAULT_PER_FAMILY_CAP } = {}) {
  if (typeof seed !== 'string' || seed.length === 0) throw new GeneratorError('seed must be a non-empty string');
  if (!Number.isInteger(perFamilyCap) || perFamilyCap < 1) throw new GeneratorError('perFamilyCap must be a positive integer');
  if (typeof target?.artifact !== 'string') throw new GeneratorError('target.artifact must name the file');
  const chosen = chooseFamilies(families);
  const text = decodeTarget(target.bytes);
  const targetDigest = bytesDigest(target.bytes);
  const { found, rejected } = scan(text, chosen);

  const counts = {};
  const selected = [];
  for (const family of chosen) {
    const sites = found.filter((site) => site.family === family.name);
    const kept = sites
      .map((site) => ({ site, rank: rank(seed, site) }))
      .sort((a, b) => (a.rank < b.rank ? -1 : 1))
      .slice(0, perFamilyCap)
      .map(({ site }) => site);
    selected.push(...kept);
    counts[family.name] = {
      found: sites.length,
      selected: kept.length,
      omitted: sites.length - kept.length,
      rejected: rejected.filter((site) => site.family === family.name).length,
    };
  }
  selected.sort((a, b) => FAMILY_NAMES.indexOf(a.family) - FAMILY_NAMES.indexOf(b.family) || a.line - b.line || a.column - b.column);

  const candidates = selected.map((site, index) => {
    const record = {
      schemaVersion: CANDIDATE_SCHEMA_VERSION,
      recordKind: RECORD_KIND,
      candidateId: `C-${String(index + 1).padStart(3, '0')}`,
      campaignId,
      partition: 'development',
      identity: '',
      generator: { name: GENERATOR_NAME, version: GENERATOR_VERSION, seed },
      intent: 'regression',
      hypothesis: `${site.family}, line ${site.line}: ${site.hypothesis}.`,
      requirement: { path: REQUIREMENTS_PATH, digest: requirementDigest },
      target: { artifact: target.artifact, artifactDigest: targetDigest },
      edit: { find: site.find, replace: site.replace, occurrences: 1 },
      state: 'generated',
      disposition: null,
      observations: [],
      independentEvidence: [],
      review: null,
      acceptedRisk: null,
      promotion: null,
    };
    record.identity = candidateIdentity(record);
    return {
      family: site.family,
      line: site.line,
      column: site.column,
      original: site.original,
      replacement: site.replacement,
      record: validateCandidate(record),
    };
  });

  const total = (key) => Object.values(counts).reduce((sum, family) => sum + family[key], 0);
  return {
    generator: { name: GENERATOR_NAME, version: GENERATOR_VERSION, seed },
    config: { families: chosen.map((family) => family.name), perFamilyCap },
    target: { artifact: target.artifact, artifactDigest: targetDigest },
    counts: { families: counts, found: total('found'), selected: total('selected'), omitted: total('omitted'), rejected: rejected.length },
    candidates,
    rejected: rejected.sort(
      (a, b) => a.line - b.line || a.column - b.column || FAMILY_NAMES.indexOf(a.family) - FAMILY_NAMES.indexOf(b.family),
    ),
  };
}

/**
 * The preview as text a person reads before keeping anything: the counts per family, each candidate as the line before
 * and after, and each rejection with its reason.
 *
 * @param {ReturnType<typeof previewCandidates>} preview
 * @returns {string}
 */
function renderPreview(preview) {
  const lines = [
    `${preview.generator.name} ${preview.generator.version}, seed ${preview.generator.seed}, per-family cap ${preview.config.perFamilyCap}`,
    `target ${preview.target.artifact} ${preview.target.artifactDigest}`,
  ];
  for (const [name, count] of Object.entries(preview.counts.families)) {
    lines.push(`${name}: ${count.found} found, ${count.selected} selected, ${count.omitted} omitted, ${count.rejected} rejected`);
  }
  for (const { record, family, line, column } of preview.candidates) {
    lines.push(
      '',
      `${record.candidateId} ${family} line ${line} column ${column}`,
      `  - ${record.edit.find}`,
      `  + ${record.edit.replace}`,
    );
  }
  if (preview.rejected.length > 0) lines.push('', 'rejected:');
  for (const site of preview.rejected) lines.push(`  line ${site.line} column ${site.column} ${site.family} ${site.code}: ${site.message}`);
  return `${lines.join('\n')}\n`;
}

module.exports = {
  DEFAULT_PER_FAMILY_CAP,
  FAMILY_NAMES,
  GENERATOR_NAME,
  GENERATOR_VERSION,
  GeneratorError,
  previewCandidates,
  renderPreview,
};
