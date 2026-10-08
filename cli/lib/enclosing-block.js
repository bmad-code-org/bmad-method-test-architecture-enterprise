'use strict';

/**
 * Find the function-like block that encloses a line of a source file, and read
 * what a line defines and what it reads.
 *
 * diff-evidence.js uses this to tie a finding on an unchanged line (the symptom)
 * to the changed line that caused it. Neither helper parses a language: a test
 * body is delimited by indentation, which formatted Python, TypeScript, Java,
 * C#, PHP, Ruby and Go share, a header is recognized by shape, and a definition
 * is an assignment, a declaration or a function name. A file these helpers cannot
 * read yields null, and the caller keeps its conservative handling.
 */

const TAB_WIDTH = 4;

// A line that opens control flow.
const CONTROL_HEADER = /^(?:if|else|elif|for|while|do|try|except|catch|finally|with|switch|case|class|return)\b/;
const FUNCTION_HEADERS = [
  /^(?:async\s+)?def\s+\w+/,
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\b/,
  /^(?:it|test|specify|describe|context|suite|scenario|beforeEach|afterEach|beforeAll|afterAll|setup|teardown)(?:\.\w+)*\s*\(/,
  // RSpec: `it "applies the discount" do`, `before do |example|`
  /^(?:it|specify|scenario|example|before|after|around|describe|context)\b.*\bdo\s*(?:\|[^|]*\|)?\s*$/,
  /^func\s/,
  /^fn\s/,
  /^fun\s/,
  /^(?:public|private|protected|internal|static|final|override|async|abstract)\b[^=;]*\(/,
  // Method shorthand and typed-return members: `void shouldWork() {`, `name(args) {`.
  /^[\w<>[\],.? ]+\s+\w+\s*\([^)]*\)\s*(?:throws\s+[\w., ]+)?\s*\{\s*$/,
  /^\w+\s*\([^)]*\)\s*\{\s*$/,
  // Playwright `test.extend({ name: async ({}, use) => {` and other function-valued properties.
  /^\w+\s*:\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|\w+\s*=>)/,
];
const MEMBER_WITH_MODIFIER = /^(?:public|private|protected|internal|static|final|override|async|abstract)\b/;

const MOCK_LINE = /\b(?:patch|mock\w*|spyOn|stub|setattr|monkeypatch|doReturn|thenReturn|allow|double)\b/i;
const HOOK_HEADER =
  /^(?:beforeEach|afterEach|beforeAll|afterAll|setup|teardown|before|after|around)\b|^@(?:Before|BeforeEach|BeforeAll|BeforeClass|BeforeTest|After|AfterEach)\b|^\[(?:SetUp|TestInitialize|OneTimeSetUp|ClassInitialize|TestFixtureSetUp)\]|\bfunction\s+(?:setUp|setUpBeforeClass)\b|\bdef\s+(?:setUp|tearDown|setUpClass|tearDownClass|setup_method|setup_class|setup_module|setup_function|teardown_\w+)\b|@pytest\.fixture|\b(?:let|subject)!?\s*\(/;
// An import brings names in; it does not redefine what they do.
const IMPORT_LINE = /^\s*(?:from\s+\S+\s+import\b|import\b|using\b|use\b|(?:const|let|var)\s+[^=]*=\s*require\()/;
const CLOSER_LINE = /^\s*[)\]}]/;
const COMMENT_LINE = /^\s*(?:#|\/\/|\/\*|\*|--|;)/;

function indentOf(line) {
  let width = 0;
  for (const character of line) {
    if (character === ' ') width += 1;
    else if (character === '\t') width += TAB_WIDTH;
    else break;
  }
  return width;
}

function isBlank(line) {
  return line.trim() === '';
}

function isFunctionHeader(line) {
  const text = line.trim();
  if (text === '' || CONTROL_HEADER.test(text)) return false;
  return FUNCTION_HEADERS.some((pattern) => pattern.test(text));
}

/** A header whose brace or `throws` clause sits on the next line (C#, PHP, wrapped Java). */
function isHeaderAt(lines, index) {
  if (isFunctionHeader(lines[index])) return true;
  const text = lines[index].trim();
  if (text === '' || CONTROL_HEADER.test(text) || !/\)\s*$/.test(text) || !MEMBER_WITH_MODIFIER.test(text)) return false;
  for (let next = index + 1; next < lines.length; next += 1) {
    if (isBlank(lines[next])) continue;
    return /^\s*(?:\{|throws\b)/.test(lines[next]);
  }
  return false;
}

/** The index of the line whose opening bracket the closer line at `index` closes (the closer line itself when unmatched). */
function openerOf(lines, index) {
  let depth = 0;
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    for (const character of [...lines[cursor]].toReversed()) {
      if (')]}'.includes(character)) depth += 1;
      else if ('([{'.includes(character)) depth -= 1;
    }
    if (depth <= 0) return cursor;
  }
  return index;
}

/**
 * @param {string[]} lines - The file, one entry per line.
 * @param {number} line - 1-based line inside the block.
 * @returns {{start: number, header: number, end: number} | null} 1-based inclusive
 *   range of the enclosing function-like block (decorators from `start`, the
 *   header line at `header`), or null.
 */
function enclosingFunction(lines, line) {
  if (!Number.isInteger(line) || line < 1 || line > lines.length || isBlank(lines[line - 1])) return null;

  let header = isHeaderAt(lines, line - 1) ? line - 1 : -1;
  if (header === -1) {
    let ceiling = indentOf(lines[line - 1]);
    for (let index = line - 2; index >= 0 && ceiling > 0; index -= 1) {
      if (isBlank(lines[index])) continue;
      const indent = indentOf(lines[index]);
      if (indent >= ceiling) continue;
      // A wrapped signature ends on a closer line; its header is the line that opened it.
      if (CLOSER_LINE.test(lines[index])) index = openerOf(lines, index);
      // A brace on its own line belongs to the header above it.
      if (/^\s*\{\s*$/.test(lines[index])) {
        let above = index - 1;
        while (above > 0 && isBlank(lines[above])) above -= 1;
        if (above >= 0) index = above;
      }
      if (isHeaderAt(lines, index)) {
        header = index;
        break;
      }
      ceiling = indent;
    }
  }
  if (header === -1) return null;

  const headerIndent = indentOf(lines[header]);
  let start = header;
  while (start > 0) {
    const previous = start - 1;
    if (isBlank(lines[previous]) || indentOf(lines[previous]) !== headerIndent) break;
    if (CLOSER_LINE.test(lines[previous])) {
      const opener = openerOf(lines, previous);
      if (!/^\s*@/.test(lines[opener])) break;
      start = opener;
    } else if (/^\s*(?:@|\[\w[^\]]*\]\s*$)/.test(lines[previous])) {
      start = previous;
    } else {
      break;
    }
  }
  let end = header;
  for (let index = header + 1; index < lines.length; index += 1) {
    if (isBlank(lines[index])) continue;
    // A closer at the header's indent (`):` of a wrapped signature, `});` of a
    // callback test) or a brace on its own line belongs to the block.
    if (indentOf(lines[index]) <= headerIndent && !/^\s*[)\]}{]/.test(lines[index])) break;
    end = index;
  }
  return { start: start + 1, header: header + 1, end: end + 1 };
}

// Words that appear in nearly every line of a test and tie nothing together.
const COMMON_WORDS = new Set([
  'assert',
  'await',
  'async',
  'self',
  'this',
  'true',
  'false',
  'none',
  'null',
  'undefined',
  'return',
  'expect',
  'const',
  'let',
  'var',
  'val',
  'final',
  'def',
  'new',
  'and',
  'not',
  'for',
  'the',
  'with',
  'import',
  'from',
  'int',
  'str',
  'len',
  'print',
]);

function wordsOf(text) {
  const words = text.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  return new Set(words.map((word) => word.toLowerCase()).filter((word) => word.length >= 3 && !COMMON_WORDS.has(word)));
}

function withoutStrings(line) {
  return line.replaceAll(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, ' ');
}

/** Identifier-like words of a line, lowercased, without string literals or trivial words. */
function identifiersOf(line) {
  return wordsOf(withoutStrings(line));
}

/** Whether a line holds nothing but a comment. */
function isCommentLine(line) {
  return COMMENT_LINE.test(line);
}

/**
 * The identifiers a line defines: the left side of an assignment or declaration,
 * a Ruby `let(:name)`, and the name a `def`/`function` line declares.
 */
function definedIdentifiers(line) {
  if (isCommentLine(line) || IMPORT_LINE.test(line)) return new Set();
  const text = withoutStrings(line);
  const defined = new Set();
  const declaration = /\b(?:def|function|func|fn|fun)\s+(\w+)/.exec(text);
  if (declaration) for (const word of wordsOf(declaration[1])) defined.add(word);
  const ruby = /\b(?:let!?|subject)\s*\(\s*:(\w+)/.exec(line);
  if (ruby) for (const word of wordsOf(ruby[1])) defined.add(word);
  for (const binding of text.matchAll(/\bas\s+(\w+)/g)) for (const word of wordsOf(binding[1])) defined.add(word);
  // A mock, patch, spy or stub redefines what the named code does, so everything it names is defined.
  if (MOCK_LINE.test(text)) for (const word of wordsOf(line.replaceAll(/[."'`]/g, ' '))) defined.add(word);
  const assignment = /^([^=]*?[^=!<>:+\-*/%&|^])?\s*(?::=|\+=|-=|\*=|\/=|=)(?![=>])/.exec(text);
  if (assignment?.[1] && !/\(/.test(assignment[1].replaceAll(/\[[^\]]*\]/g, ''))) {
    for (const word of wordsOf(assignment[1])) defined.add(word);
  }
  return defined;
}

/** The name a function header declares, lowercased, or null. */
function functionName(headerLine) {
  const declared = /\b(?:def|function|func|fn|fun)\s+(\w+)/.exec(headerLine);
  if (declared) return declared[1].toLowerCase();
  // Java, C# and PHP members: `private double expectedFor(` or `void setUp(`.
  const member =
    /^\s*(?:(?:public|private|protected|internal|static|final|override|async|abstract|virtual)\s+)*[\w<>[\],.?]+\s+(\w+)\s*\(/.exec(
      headerLine,
    );
  if (member) return member[1].toLowerCase();
  // A function-valued property: `expected: async ({}, use) => {`.
  const property = /^\s*(\w+)\s*:\s*(?:async\s*)?(?:function\b|\(|\w+\s*=>)/.exec(headerLine);
  return property ? property[1].toLowerCase() : null;
}

/** The identifiers two lines have in common, sorted. */
function sharedIdentifiers(left, right) {
  const rightSet = identifiersOf(right);
  return [...identifiersOf(left)].filter((word) => rightSet.has(word)).sort();
}

/** Whether a function header (with its decorators) is a fixture or a setup hook, whose body sets up what tests read. */
function isSetupBlock(lines, block) {
  for (let line = block.start; line <= block.header; line += 1) {
    if (HOOK_HEADER.test(lines[line - 1].trim())) return true;
  }
  return false;
}

/** Whether a block only groups tests (describe, context, suite, feature, class) and has no body of its own. */
function isContainerBlock(lines, block) {
  return /^(?:\w+\.)?(?:describe|context|suite|feature|class)\b/.test((lines[block.header - 1] ?? '').trim());
}

/**
 * The first line of the statement a line belongs to: a continuation line (deeper
 * than the line above that left a bracket open) resolves to the line that opened it.
 */
function statementHead(lines, line) {
  let current = line;
  for (;;) {
    const indent = indentOf(lines[current - 1] ?? '');
    let above = current - 2;
    while (above >= 0 && (isBlank(lines[above]) || indentOf(lines[above]) >= indent)) above -= 1;
    if (above < 0 || line - above > 60) return current;
    // The body of a function or of a control block is a run of statements, not a continuation of its opener.
    if (isHeaderAt(lines, above) || CONTROL_HEADER.test(lines[above].trim()) || /^\{\s*$/.test(lines[above].trim())) return current;
    let balance = 0;
    for (let cursor = above; cursor < current - 1; cursor += 1) {
      for (const character of withoutStrings(lines[cursor])) {
        if ('([{'.includes(character)) balance += 1;
        else if (')]}'.includes(character)) balance -= 1;
      }
    }
    if (balance <= 0) return current;
    current = above + 1;
  }
}

module.exports = {
  enclosingFunction,
  sharedIdentifiers,
  identifiersOf,
  definedIdentifiers,
  functionName,
  isCommentLine,
  isFunctionHeader,
  isSetupBlock,
  isContainerBlock,
  statementHead,
  wordsOf,
  withoutStrings,
};
