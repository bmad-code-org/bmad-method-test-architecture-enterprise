/**
 * The offline prompt candidate generator: three narrow families of one-line prompt edits, each previewed as an
 * exploratory candidate whose edit is the native `replace-exact` shape.
 *
 * The generator is a function from the target file's bytes to a preview. It reads no file, starts no process, opens no
 * socket and calls no model, so a preview costs nothing and runs anywhere. The caller supplies the bytes and the digest
 * of the requirements statement and writes the records it keeps. The generator's test holds the module to that by its source and by running it with the
 * network and process entry points broken.
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
const { CANDIDATE_SCHEMA_VERSION, CandidateError, RECORD_KIND, bytesDigest, candidateIdentity, validateCandidate } = require('./candidate');

const GENERATOR_NAME = 'prompt-edit';
const GENERATOR_VERSION = '1.0.0';
const DEFAULT_PER_FAMILY_CAP = 5;
const REQUIREMENTS_PATH = 'requirements.md';
const MAX_SAFE_DIGITS = 15;
/**
 * The largest target a preview reads. A prompt is kilobytes. The repeated-span count scans the target once for each
 * line that holds a site, so the worst case is the number of such lines times the target size. The cap bounds it, and
 * the many-line cost cases of the generator test pin the bound to seconds.
 */
const MAX_TARGET_BYTES = 256 * 1024;

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
  String.raw`(?<![\w=-])(?<lower>${boundPattern(LOWER_BOUNDS)})(?<gap>${GAP})(?<number>\d+)(?<tail>[A-Za-z%]*)|(?<![\w=-])(?<upper>${boundPattern(UPPER_BOUNDS)})(?<gap2>${GAP})(?<number2>\d+)(?<tail2>[A-Za-z%]*)`,
  'giu',
);

/** The letter case of `word` applied to `replacement`: all capitals, a leading capital or lower case. */
function matchCase(word, replacement) {
  if (word.length > 1 && word === word.toUpperCase()) return replacement.toUpperCase();
  if (word[0] !== word[0].toLowerCase()) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

/** How far a rule looks around a site, so the cost of a line stays linear in its length. */
const WINDOW = 64;
/** The words that negate what follows them. */
const NEGATED = /\b(?:not|no|never|nor|without|cannot)\b|n['’]t\b/i;

/** The word before `index` in `line`, lower-cased, or an empty string. */
function wordBefore(line, index) {
  return /([\p{L}']+)\W*$/u.exec(line.slice(Math.max(0, index - WINDOW), index))?.[1].toLowerCase() ?? '';
}

/** The word after `index` in `line`, lower-cased, or an empty string. */
function wordAfter(line, index) {
  return /^\W*([\p{L}']+)/u.exec(line.slice(index, index + WINDOW))?.[1].toLowerCase() ?? '';
}

const SENTENCE_START = /[\s)\]"'”’]*(?:$|\p{Lu})/uy;

/** Whether the line ends at `at`, or a sentence starts there, past the closing marks of a quotation. */
function endsSentence(line, at) {
  SENTENCE_START.lastIndex = at;
  return SENTENCE_START.test(line);
}

/**
 * `line` with every protected character blanked, so punctuation and words inside a quotation, inline code, a placeholder, a
 * link target, a URL or a path read as part of that token and not as the sentence around it. The punctuation that closes a
 * sentence after a URL or a path stays, and so does the text of a link only as blanks.
 *
 * @param {string} line
 * @param {Array<string|undefined>} reasons the reason each character of the line is protected, or `undefined`
 * @returns {string} a string of the same length
 */
function maskProtected(line, reasons) {
  const masked = Array.from({ length: line.length }, (_, at) => line[at]);
  for (let from = 0; from < masked.length; ) {
    const reason = reasons[from];
    let to = from + 1;
    if (reason !== undefined) {
      while (to < masked.length && reasons[to] === reason) to += 1;
      if (reason === 'url' || reason === 'path') {
        // The punctuation that closes a sentence after a URL or a path belongs to the sentence, except a `?` right after a `/`.
        let kept = to;
        while (kept > from && '.,;:!?'.includes(masked[kept - 1])) kept -= 1;
        if (kept > from && masked[kept - 1] === '/' && masked[kept] === '?') kept += 1;
        masked.fill(' ', from, kept);
      } else if (
        reason === 'quotation' &&
        to - from > 2 &&
        '.!?'.includes(masked[to - 2]) &&
        /["”’']/.test(masked[to - 1]) &&
        endsSentence(line, to)
      ) {
        // A quotation that ends in a mark closes its sentence when the line ends after it or a new sentence starts there.
        masked.fill(' ', from, to - 2);
        masked[to - 1] = ' ';
      } else {
        masked.fill(' ', from, to);
      }
    }
    from = to;
  }
  // The text of a link is not the sentence around it: from the nearest `[` to a `]` that a `(` follows.
  let open = -1;
  for (let at = 0; at < line.length; at += 1) {
    if (line[at] === '[') open = at;
    else if (line[at] === ']') {
      if (open !== -1 && line[at + 1] === '(') masked.fill(' ', open, at + 1);
      open = -1;
    }
  }
  return masked.join('');
}

/**
 * The question test of one line: `(index) => boolean`, whether the sentence holding `index` ends in a question mark. A full
 * stop between digits ends nothing, and a mark inside any protected span (a quotation, inline code, a placeholder, a link
 * target, a URL or a path) ends nothing either; `reasons` says which characters of the line are protected. The terminators are
 * found once per line, so each test is a search over them and a line of many sites costs time in proportion to its length.
 */
function questionTest(line, reasons) {
  const ends = [...maskProtected(line, reasons).matchAll(/[!?]|\.(?!\d)/g)].map((match) => ({
    at: match.index,
    question: match[0] === '?',
  }));
  return (index) => {
    let low = 0;
    let high = ends.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (ends[middle].at < index) low = middle + 1;
      else high = middle;
    }
    return ends[low]?.question ?? false;
  };
}

/** A site the family recognized but cannot edit safely. */
function refuse(start, end, code, message) {
  return { start, end, code, message };
}

/** A site with its edit: `line.slice(start, end)` becomes `replacement`. */
function edit(start, end, replacement, hypothesis) {
  return { start, end, replacement, hypothesis };
}

/** Participles that follow `have` without ending in -ed or -en. */
const IRREGULAR_PARTICIPLES = new Set(
  'been had done gone made seen got gotten left kept held run come become given found said thought meant built sent set put read won lost paid sold told heard begun written chosen broken spoken fallen eaten hidden driven risen worn torn drawn grown thrown flown sung stolen frozen forgotten known shown taken bought brought caught felt fed sat spent stood understood slept led met lent lain hung dug dealt'.split(
    ' ',
  ),
);
/** Words that take -ing or -ed and still name a thing, so `be nothing but` states a requirement. */

/** Nouns, numbers and adjectives that look like a participle (`have ten items`, `be nothing but JSON`), so they state a requirement. */
const NOT_A_PARTICIPLE = new Set(
  'ten eleven seven green children men women token tokens screen open even seed seeds need needs speed feed embed kitchen golden wooden hundred nothing something anything everything string strings thing things'.split(
    ' ',
  ),
);
/** Adverbs that may stand between the modal and the verb of an inference (`must already have used`). */
const ADVERBS = new Set([
  'already',
  'still',
  'also',
  'just',
  'surely',
  'always',
  'currently',
  'probably',
  'definitely',
  'clearly',
  'simply',
  'actually',
]);

/**
 * Whether the modal ending at `end` reads as an inference about a past event or a state (`must have used`, `must have
 * been`, `must be running`), which a requirement never states. A requirement such as `must have a test` is not one;
 * a participle that a noun shares (`have read access`) is refused too, since the line cannot tell the two apart.
 */
function isEpistemic(line, end) {
  const words = [...line.slice(end, end + WINDOW).matchAll(/[\p{L}\p{N}_'’]+/gu)].map((word) => word[0].toLowerCase());
  while (ADVERBS.has(words[0])) words.shift();
  const [next, following = ''] = words;
  if (next === undefined) return false;
  if (/^['’]ve$/.test(next)) return true;
  if (next === 'have') {
    const participle = ADVERBS.has(following) ? (words[2] ?? '') : following;
    return !NOT_A_PARTICIPLE.has(participle) && (/(?:ed|en)$/.test(participle) || IRREGULAR_PARTICIPLES.has(participle));
  }
  return next === 'be' && following.endsWith('ing') && !NOT_A_PARTICIPLE.has(following);
}

/**
 * The modal-strength sites of a line.
 *
 * @param {string} line
 * @param {Array<string|undefined>} reasons the reason each character of the line is protected, or `undefined`
 * @returns {Array<object>}
 */
function modalSites(line, reasons) {
  const sites = [];
  const asks = questionTest(line, reasons);
  for (const match of line.matchAll(/(?<![\w-])(must|shall)(?![\w-])/giu)) {
    const [word] = match;
    const start = match.index;
    const end = start + word.length;
    if (asks(end)) {
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
    } else if (isEpistemic(line, end)) {
      sites.push(
        refuse(
          start,
          end,
          'epistemic',
          `"${word}" is followed by "${line
            .slice(end, end + WINDOW)
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .join(' ')}", which can infer a past event or a state and not require a step`,
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
 * @param {Array<string|undefined>} reasons the reason each character of the line is protected, or `undefined`
 * @returns {Array<object>}
 */
function negationSites(line, reasons) {
  const sites = [];
  const asks = questionTest(line, reasons);
  const patterns = [
    { pattern: /(?<![\w-])(do|must|shall|should)(\s+)not(?![\w-])/giu, keep: (m) => m[1] },
    { pattern: /(?<![\w-])(do|must|should)n['’]t(?![\w-])/giu, keep: (m) => m[1] },
    { pattern: /(?<![\w-])can(?:not|\s+not|['’]t)(?![\w-])/giu, keep: (m) => matchCase(m[0], 'can') },
    { pattern: /(?<![\w-])never(?![\w-])/giu, keep: (m) => matchCase(m[0], 'always') },
  ];
  for (const { pattern, keep } of patterns) {
    for (const match of line.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      const before = wordBefore(line, start);
      const after = wordAfter(line, end);
      if (asks(end)) {
        sites.push(refuse(start, end, 'question', `"${match[0]}" sits in a question, which asks and does not instruct`));
      } else if (NEGATION_WORDS.has(after) || NEGATION_WORDS.has(before) || /^\W*\p{L}*n['’]t\b/iu.test(line.slice(end, end + WINDOW))) {
        sites.push(
          refuse(
            start,
            end,
            'double-negation',
            `"${match[0]}" sits beside another negation ("${NEGATION_WORDS.has(before) ? before : after}"), so removing it would leave a negation reading as the opposite of both`,
          ),
        );
      } else if (match[0].toLowerCase() === 'never' && ['ever', 'again'].includes(after)) {
        sites.push(refuse(start, end, 'grammar', `"${match[0]} ${after}" has no form with "always" that is English`));
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
 * @param {Array<string|undefined>} reasons the reason each character of the line is protected, or `undefined`
 * @returns {Array<object>}
 */
function numericSites(line, reasons) {
  const sites = [];
  const asks = questionTest(line, reasons);
  const masked = maskProtected(line, reasons);
  for (const match of line.matchAll(BOUND_SITE)) {
    const { groups } = match;
    const lower = groups.lower !== undefined;
    const phrase = lower ? groups.lower : groups.upper;
    const number = lower ? groups.number : groups.number2;
    const gap = lower ? groups.gap : groups.gap2;
    const tail = lower ? groups.tail : groups.tail2;
    const start = match.index + phrase.length + gap.length;
    const end = start + number.length;
    const after = line.slice(end + tail.length, end + tail.length + WINDOW);
    const bound = `${phrase}${gap}${number}${tail}`;
    const percent = tail.startsWith('%') || tail.toLowerCase() === 'percent' || /^\s*(?:%|percent\b|per cent\b)/i.test(after);
    // Attached letters are the unit (`500ms`); a spaced word is the unit too (`3 retries`).
    const next = /^\s+(\p{L}+)/u.exec(after)?.[1];
    const unit = percent ? '%' : tail === '' ? (next === undefined || FILLER.has(next.toLowerCase()) ? 'none' : next) : tail;
    const clause = /[^.;:!?,]*$/.exec(masked.slice(Math.max(0, match.index - 200), match.index))[0];
    if (asks(end)) {
      sites.push(refuse(start, end, 'question', `"${bound}" sits in a question, which asks and does not instruct`));
    } else if (NEGATED.test(clause)) {
      sites.push(
        refuse(start, end, 'negated-bound', `"${bound}" follows a negation, which turns the direction the bound constrains around`),
      );
    } else if (/^(?:[.,:/-]|\s*[–—-]\s*|\s+(?:to|or|and)\s+)[0-9]/i.test(after)) {
      sites.push(
        refuse(
          start,
          end,
          'not-a-threshold',
          `"${bound}" continues as a decimal, a version, a date, a time, a range or an alternative, and a part of it is not a bound`,
        ),
      );
    } else if (/^(?:st|nd|rd|th)$/i.test(tail)) {
      sites.push(refuse(start, end, 'not-a-threshold', `"${bound}" is an ordinal, not a quantity`));
    } else if (number.length > MAX_SAFE_DIGITS) {
      sites.push(refuse(start, end, 'not-a-threshold', `"${bound}" is too large to loosen exactly`));
    } else {
      const value = Number(number);
      const loosened = lower ? Math.floor(value / 2) : value * 2;
      if (loosened === value) {
        sites.push(refuse(start, end, 'no-change', `"${bound}" is already as loose as the rule loosens it`));
      } else if (!percent && tail === '' && unit !== 'none' && (value === 1) !== (loosened === 1)) {
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
            `Loosens the ${direction} bound "${bound}" (unit ${unit}) to "${phrase}${gap}${loosened}${tail}", so a ${lower ? 'smaller' : 'larger'} value than the requirement allows still meets the instruction`,
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

/** The width of the whitespace that opens `line`, a tab reaching the next multiple of four. */
function indentOf(line) {
  let width = 0;
  for (const character of line) {
    if (character === ' ') width += 1;
    else if (character === '\t') width += 4 - (width % 4);
    else break;
  }
  return width;
}

/** The column where the content of a list item starts, given its match; a tab after the marker reaches the next tab stop. */
function contentColumn(item) {
  const width = gapWidth(item);
  return indentOf(item[1]) + item[2].length + (width >= 5 ? 1 : width);
}

/** The columns between a list marker and its text, a tab reaching the next tab stop; five or more make the text indented code. */
function gapWidth([, indentText, marker, gap]) {
  const markerEnd = indentOf(indentText) + marker.length;
  let column = markerEnd;
  for (const character of gap) column += character === '\t' ? 4 - (column % 4) : 1;
  return column - markerEnd;
}

/** Marks `[from, to)` of `reasons` as protected for `reason`, keeping a reason already set. */
function protect(reasons, from, to, reason) {
  for (let at = from; at < Math.min(to, reasons.length); at += 1) reasons[at] ??= reason;
}

/**
 * Marks the inline code spans of the paragraph `text.slice(from, to)`: a run of backticks opens a span that the next run of
 * the same length closes, and a run with no such partner is literal. The scan visits each run once.
 */
function protectCodeSpans(reasons, text, from, to) {
  const runs = [...text.slice(from, to).matchAll(/`+/g)];
  const byLength = new Map();
  for (const [position, run] of runs.entries()) {
    if (!byLength.has(run[0].length)) byLength.set(run[0].length, []);
    byLength.get(run[0].length).push(position);
  }
  const cursor = new Map();
  for (let position = 0; position < runs.length; ) {
    const length = runs[position][0].length;
    const same = byLength.get(length);
    let next = cursor.get(length) ?? 0;
    while (same[next] <= position) next += 1;
    cursor.set(length, next);
    const closer = same[next];
    if (closer === undefined) {
      position += 1;
    } else {
      protect(reasons, from + runs[position].index, from + runs[closer].index + length, 'inline-code');
      position = closer + 1;
    }
  }
}

/**
 * The reason each character of `text` is protected from an edit, or `undefined`: front matter, fenced and indented
 * code, headings, block quotes, HTML comments, inline code, quotations, link targets, URLs, paths and placeholders.
 * A leading byte order mark is skipped, so the first line is read as a first line.
 *
 * @param {string} text
 * @returns {Array<string|undefined>}
 */
function protectedSpans(text) {
  if (text.startsWith('﻿')) return [undefined, ...protectedSpans(text.slice(1))];
  const reasons = Array.from({ length: text.length });
  const front = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (front) protect(reasons, 0, front[0].length, 'front-matter');
  for (const comment of text.matchAll(/<!--[\s\S]*?(?:-->|$)/g))
    protect(reasons, comment.index, comment.index + comment[0].length, 'html-comment');

  const lines = text.split('\n');
  let fence = null;
  let at = 0;
  let blankBefore = true;
  let indentedCode = false;
  let quotedBefore = false;
  // The content column of the list item the lines are in, so a fence inside an item is read against it.
  let container = 0;
  // The paragraph being read: an inline code span may run over its lines, and over nothing else.
  let paragraph = null;
  const endParagraph = () => {
    if (paragraph !== null) protectCodeSpans(reasons, text, paragraph.from, paragraph.to);
    paragraph = null;
  };
  for (const [index, rawLine] of lines.entries()) {
    const lineEnd = at + rawLine.length;
    if (reasons[at] === 'front-matter') {
      endParagraph();
      at = lineEnd + 1;
      continue;
    }
    const blank = rawLine.trim() === '';
    const indent = indentOf(rawLine);
    // A fence ends with the list item that holds it, when a line falls back left of the item's content column.
    if (fence !== null && !blank && indent < fence.container) fence = null;
    if (fence !== null) {
      protect(reasons, at, lineEnd, 'code-fence');
      const closing = /^[ \t]*(`{3,}|~{3,})[ \t\r]*$/.exec(rawLine);
      if (closing && closing[1][0] === fence.marker[0] && closing[1].length >= fence.marker.length && indent - fence.container <= 3) {
        fence = null;
      }
      blankBefore = blank;
      quotedBefore = false;
      at = lineEnd + 1;
      continue;
    }
    // Only a bullet or `1.` interrupts a paragraph.
    const item = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)\S/.exec(rawLine);
    const listItem = item !== null && (paragraph === null || /^(?:[-*+]|1[.)])$/.test(item[2])) ? item : null;
    if (!blank && listItem === null && indent < container) container = 0;
    // A fence opens at most three columns past the container's content column, or on the line of a list marker.
    const opening =
      listItem === null
        ? indent >= container && indent - container <= 3
          ? /^[ \t]*(`{3,}|~{3,})([^\n]*)$/.exec(rawLine)
          : null
        : gapWidth(listItem) >= 5
          ? null
          : /^(`{3,}|~{3,})([^\n]*)$/.exec(rawLine.slice(listItem[0].length - 1));
    let quotedNow = false;
    if (opening !== null && !(opening[1][0] === '`' && opening[2].includes('`'))) {
      endParagraph();
      if (listItem !== null) container = contentColumn(listItem);
      fence = { marker: opening[1], container };
      protect(reasons, at, lineEnd, 'code-fence');
    } else {
      // A line indented four columns or a tab after a blank line, or after such a line, is an indented code block.
      indentedCode = !blank && indent - container >= 4 && (blankBefore || indentedCode);
      const heading = /^ {0,3}#{1,6}(\s|$)/.test(rawLine) || (!blank && /^ {0,3}(?:=+|-+)[ \t]*\r?$/.test(lines[index + 1] ?? ''));
      // A line after a quoted one that starts no other block continues the quote, as a lazy continuation.
      const thematic = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t\r]*$/.test(rawLine);
      const quoted = /^ {0,3}>/.test(rawLine) || (quotedBefore && !blank && !heading && !thematic && listItem === null);
      quotedNow = quoted;
      if (indentedCode) protect(reasons, at, lineEnd, 'indented-code');
      if (heading) protect(reasons, at, lineEnd, 'heading');
      if (quoted) protect(reasons, at, lineEnd, 'block-quote');
      if (blank || indentedCode || heading || quoted || thematic || listItem !== null) endParagraph();
      if (!blank && !indentedCode && !heading && !quoted && !thematic) {
        paragraph ??= { from: at, to: lineEnd };
        paragraph.to = lineEnd;
      }
      if (listItem !== null) container = contentColumn(listItem);
      // Straight quotes pair up left to right; an unpaired last one quotes the rest of the line.
      const quotes = [...rawLine.matchAll(/"/g)].map((quote) => quote.index);
      for (let pair = 0; pair < quotes.length; pair += 2) {
        protect(reasons, at + quotes[pair], quotes[pair + 1] === undefined ? lineEnd : at + quotes[pair + 1] + 1, 'quotation');
      }
      for (const quote of rawLine.matchAll(/“[^”]*(?:”|$)|‘[^’]*(?:’|$)|(?<![\p{L}\p{N}])'[^'\n]+'(?![\p{L}\p{N}])/gu))
        protect(reasons, at + quote.index, at + quote.index + quote[0].length, 'quotation');
      for (const link of rawLine.matchAll(/\]\([^)]*\)/g))
        protect(reasons, at + link.index, at + link.index + link[0].length, 'link-target');
      for (const token of rawLine.matchAll(/\S+/g)) {
        const scheme = token[0].indexOf('://');
        const start = scheme === -1 ? -1 : token[0].slice(0, scheme).search(/[a-z][a-z0-9+.-]*$/i);
        if (start !== -1) protect(reasons, at + token.index + start, at + token.index + token[0].length, 'url');
        else if (/(?:^|[^\p{L}\p{N}])(?:www\.|mailto:)/iu.test(token[0].slice(0, 12)))
          protect(reasons, at + token.index, at + token.index + token[0].length, 'url');
        else if (/[/\\]/.test(token[0])) protect(reasons, at + token.index, at + token.index + token[0].length, 'path');
      }
      const placeholder =
        /\{\{[^}]*\}\}|\$\{[^}]*\}|\{[A-Za-z_][\w.-]*\}|<[A-Za-z_][\w.:-]*>|\[\[[^\]]*\]\]|%\([^)]*\)[sd]|\$[A-Za-z_]\w*/g;
      for (const found of rawLine.matchAll(placeholder))
        protect(reasons, at + found.index, at + found.index + found[0].length, 'placeholder');
    }
    blankBefore = blank;
    quotedBefore = quotedNow;
    at = lineEnd + 1;
  }
  endParagraph();
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
  if (bytes.byteLength > MAX_TARGET_BYTES) {
    throw new GeneratorError(`target.bytes is ${bytes.byteLength} bytes; a prompt past ${MAX_TARGET_BYTES} bytes is not a prompt`);
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new GeneratorError('target.bytes is not UTF-8 text');
  }
  if (text.includes('\u0000')) throw new GeneratorError('target.bytes holds a NUL, so it is not a prompt');
  return text;
}

/**
 * Refuses a campaign ID, requirement digest or target path the candidate schema would refuse, before any scanning, so a
 * bad input fails the same way whatever the prompt holds. The inputs are held to the schema by validating a stand-in
 * record that carries them.
 */
function checkRecordInputs({ campaignId, requirementDigest, artifact, seed }) {
  for (const [name, value] of [
    ['campaignId', campaignId],
    ['requirementDigest', requirementDigest],
    ['target.artifact', artifact],
  ]) {
    if (typeof value !== 'string') throw new GeneratorError(`${name} must be a string`);
  }
  const standIn = {
    schemaVersion: CANDIDATE_SCHEMA_VERSION,
    recordKind: RECORD_KIND,
    candidateId: 'C-001',
    campaignId,
    partition: 'development',
    identity: '',
    generator: { name: GENERATOR_NAME, version: GENERATOR_VERSION, seed },
    intent: 'regression',
    hypothesis: 'input check',
    requirement: { path: REQUIREMENTS_PATH, digest: requirementDigest },
    target: { artifact, artifactDigest: bytesDigest(new Uint8Array()) },
    edit: { find: 'input check', replace: 'input check edited', occurrences: 1 },
    state: 'generated',
    disposition: null,
    observations: [],
    independentEvidence: [],
    review: null,
    acceptedRisk: null,
    promotion: null,
  };
  standIn.identity = candidateIdentity(standIn);
  try {
    validateCandidate(standIn);
  } catch (error) {
    if (error instanceof CandidateError)
      throw new GeneratorError(`${error.message} (campaignId, requirementDigest, target.artifact and seed are held to it)`);
    throw error;
  }
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
    site.original,
    site.replacement,
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
    const lineReasons = reasons.slice(lineStart, lineStart + line.length);
    let repeats;
    for (const family of families) {
      for (const site of family.sites(line, lineReasons)) {
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
          repeats ??= countOccurrences(text, line);
          if (repeats === 1)
            found.push({
              ...where,
              find: line,
              start: site.start,
              end: site.end,
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
  checkRecordInputs({ campaignId, requirementDigest, artifact: target.artifact, seed });
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
      edit: { find: site.find, replace: site.find.slice(0, site.start) + site.replacement + site.find.slice(site.end), occurrences: 1 },
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
