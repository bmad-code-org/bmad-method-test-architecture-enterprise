/**
 * TEA write-time enforcement hook.
 *
 * TEA has advisory knowledge fragments and a post-hoc reviewer (`test-review`).
 * Nothing occupied the write-time control point, so a violation could land, ship,
 * and only surface at review. This is that control point: a hook that blocks the
 * write and hands the reason back to the agent.
 *
 * WHAT IT ENFORCES, AND WHAT IT DELIBERATELY DOES NOT
 *
 * Every rule here is a row from `bmad-tea-test-review/steps-c/criteria-registry.md`,
 * gated `Absolute` there, and mechanically decidable by pattern. That is a small
 * subset on purpose. The registry's Absolute rows that need a judgment a regex
 * cannot make (C5 mock-asserted-against-itself, C6 unreachable assertion, H3
 * conditional assertion, H4 unreset shared state, M3, M4, M6, M7, L6) stay with
 * `test-review`, and are listed in DEFERRED below with the reason. Severity is
 * read from the registry and never chosen here; a dev-only check in this
 * repository's own test suite asserts that this file and the registry still
 * agree, and fails when the registry grows an Absolute row nobody has
 * classified.
 *
 * THREE PASSES, BECAUSE ONE IS NOT ENOUGH
 *
 * A PreToolUse hook that only inspects `tool_input` has three blind spots, all of
 * them reachable by accident:
 *
 *   1. Anything written through Bash (`cat > x.spec.ts <<EOF`, `sed -i`, a codegen
 *      script) never passes through Write/Edit and is invisible to it.
 *   2. On an Edit it sees the new fragment only, so a violation split across two
 *      edits passes, and a violation already sitting in the untouched part of the
 *      file is never looked at.
 *   3. A whole-file rule (H5's 1000-line ceiling, C4's "this flow asserts nothing
 *      anywhere") cannot be decided from a fragment at all.
 *
 * So: `--pre` is the fast block on the write about to land. For an Edit or
 * MultiEdit it applies the edit to the file on disk and scans the result whole,
 * reporting only what the edit introduced, so a fragment inside an existing
 * comment is read as a comment and a violation spanning the fragment's edge is
 * seen; it scans the bare fragment only when the file cannot be read. `--post`
 * re-reads the affected file(s) from disk in full and applies the same rules,
 * which is what catches Bash writes; `--stop` sweeps recently modified test files
 * at the end of a turn, which is what catches a codegen script that wrote files it
 * never named. File-scope rules (H5, C4) skip only that bare-fragment fallback.
 *
 * FALSE POSITIVES
 *
 * Comments and string literals are stripped, per language, before any pattern runs.
 * A doc example that writes `await page.waitForTimeout(500)` inside a fenced block
 * in a `.md` is not a violation and this hook does not claim it is. Line numbers
 * survive stripping because stripped characters are replaced by spaces. Rules
 * whose construct a formatter splits across lines (C2, C3) match the whole
 * stripped source and map each match back to the line it starts on.
 *
 * GATES
 *
 * A rule fires only when its gate is open, which here means: the file matches one
 * of the project's configured test globs, and the rule declares the file's
 * language kind. `.tea/enforce-config.json` is written by the `framework` workflow
 * from the stack it actually detected, so a repo with no Maestro flows has no
 * Maestro glob and the Maestro rows cannot fire, and a repo with no pact config
 * has no pact glob and H6/H8 cannot fire. A closed gate is not a violation. This
 * is the same discipline the criteria registry applies, and the defect that
 * unconditional rules produce is documented in DESIGN-CRITERIA-REGISTRY.md.
 *
 * FAIL OPEN
 *
 * Any failure of the hook itself — unreadable payload, malformed config, missing
 * file, unexpected shape — exits 0. A broken enforcement hook must never become an
 * agent that cannot write files.
 *
 * Usage (registered in .claude/settings.json by the framework workflow):
 *   node .claude/hooks/tea-enforce.cjs --pre     # PreToolUse:  Write|Edit|MultiEdit
 *   node .claude/hooks/tea-enforce.cjs --post    # PostToolUse: Write|Edit|MultiEdit|Bash
 *   node .claude/hooks/tea-enforce.cjs --stop    # Stop
 *
 * Exit codes:
 *   0  nothing blocking (warnings, if any, went to stderr)
 *   2  at least one blocking violation; stderr is fed back to the agent
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const REGISTRY_PATH = 'bmad-tea-test-review/steps-c/criteria-registry.md';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Used when `.tea/enforce-config.json` is absent. Deliberately broad: a project
 * that never ran the framework workflow still gets the Absolute rows, and the
 * globs below are the conventional locations for each supported stack. A project
 * that DID run the workflow gets a narrower, detected list, which is what closes
 * the gate on stacks it does not have.
 */
const DEFAULT_CONFIG = {
  testGlobs: [
    '**/*.spec.{ts,tsx,js,jsx,mjs,cjs}',
    '**/*.test.{ts,tsx,js,jsx,mjs,cjs}',
    '**/*.cy.{ts,tsx,js,jsx}',
    '**/*.pacttest.{ts,js}',
    '**/test_*.py',
    '**/*_test.py',
    '**/*_test.go',
    '**/*Test.java',
    '**/*Tests.java',
    '**/*IT.java',
    '.maestro/**/*.{yaml,yml}',
    'maestro/**/*.{yaml,yml}',
  ],
  pactConfigGlobs: ['**/vitest.config.pact.{ts,js,mts,mjs,cts,cjs}', '**/vitest.pact.config.{ts,js,mts,mjs,cts,cjs}'],
  /**
   * Files that match a test glob but must not be enforced. k6 is the case this
   * exists for: a k6 script is a `.js` file whose `sleep(1)` is the correct way to
   * model think-time between iterations, so H1 firing on it would be the hook
   * being confidently wrong about the one language where the pattern is right.
   * The framework workflow writes the project's k6 paths here when it detects k6.
   */
  excludeGlobs: [],
  disabledRules: [],
  maxFileLines: 1000,
  stopScanWindowSeconds: 900,
  maxScannedFiles: 5000,
  /**
   * sha256 of the hook script as the framework workflow copied it in. The scaffold
   * step says to copy the file byte for byte and points at a test in the TEA repo
   * as the guarantee, but that guarantee stops at the TEA repo boundary: nothing in
   * the target project would ever notice a locally edited copy, and a locally
   * edited copy is silently opted out of the registry-agreement test. This closes
   * that. Null means the check is off, which is what an install predating it gets.
   */
  hookSha256: null,
};

const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.venv',
  'venv',
  '__pycache__',
  'vendor',
  'target',
  '.next',
  '.nuxt',
  '.gradle',
  'bin',
  'obj',
  '.tea',
]);

// ---------------------------------------------------------------------------
// Glob matching (no dependencies on purpose: the generated hook must run in a
// target project that has installed nothing)
// ---------------------------------------------------------------------------

function expandBraces(glob) {
  const open = glob.indexOf('{');
  if (open === -1) return [glob];
  let depth = 0;
  let close = -1;
  for (let index = open; index < glob.length; index += 1) {
    if (glob[index] === '{') depth += 1;
    else if (glob[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        close = index;
        break;
      }
    }
  }
  if (close === -1) return [glob];

  const head = glob.slice(0, open);
  const tail = glob.slice(close + 1);
  const body = glob.slice(open + 1, close);

  const alternatives = [];
  let current = '';
  let nested = 0;
  for (const character of body) {
    if (character === '{') nested += 1;
    if (character === '}') nested -= 1;
    if (character === ',' && nested === 0) {
      alternatives.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  alternatives.push(current);

  return alternatives.flatMap((alternative) => expandBraces(`${head}${alternative}${tail}`));
}

function globToRegExp(glob) {
  let source = '^';
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    if (character === '*') {
      if (glob[index + 1] === '*') {
        if (glob[index + 2] === '/') {
          source += '(?:[^/]*/)*';
          index += 2;
        } else {
          source += '.*';
          index += 1;
        }
      } else {
        source += '[^/]*';
      }
    } else if (character === '?') {
      source += '[^/]';
    } else {
      source += character.replaceAll(/[.+^${}()|[\]\\]/g, String.raw`\$&`);
    }
  }
  return new RegExp(`${source}$`);
}

const globCache = new Map();

function matchesAnyGlob(relativePath, globs) {
  const normalized = relativePath.split(path.sep).join('/').replace(/^\.\//, '');
  for (const glob of globs || []) {
    let patterns = globCache.get(glob);
    if (!patterns) {
      patterns = expandBraces(glob).map((expanded) => globToRegExp(expanded));
      globCache.set(glob, patterns);
    }
    for (const pattern of patterns) {
      if (pattern.test(normalized)) return true;
      // A glob without a leading `**/` should still match a nested file when the
      // author wrote `tests/**/*.spec.ts` and the path arrives as an absolute-ish
      // relative path. Anchoring both ways is friendlier than being clever.
      if (!glob.startsWith('**/') && pattern.test(`${normalized}`.replace(/^(?:[^/]+\/)+/, ''))) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Language kinds
// ---------------------------------------------------------------------------

const EXTENSION_KIND = {
  '.ts': 'js',
  '.tsx': 'js',
  '.js': 'js',
  '.jsx': 'js',
  '.mjs': 'js',
  '.cjs': 'js',
  '.mts': 'js',
  '.cts': 'js',
  '.py': 'py',
  '.java': 'java',
  '.kt': 'java',
  '.go': 'go',
  '.yaml': 'maestro',
  '.yml': 'maestro',
};

function kindForPath(relativePath, config) {
  const settings = config || DEFAULT_CONFIG;
  if (matchesAnyGlob(relativePath, settings.pactConfigGlobs)) return 'pactconfig';
  return EXTENSION_KIND[path.extname(relativePath).toLowerCase()] || null;
}

// ---------------------------------------------------------------------------
// Comment and string stripping
//
// A naive implementation greps `waitForTimeout(` in any `.ts` and then claims zero
// false-positive risk, which is how a documentation example becomes a blocked
// write. Stripping first is what makes that claim true. The output is the same
// length as the input, with stripped characters replaced by spaces, so every
// reported line number is the real one.
// ---------------------------------------------------------------------------

function blank(length) {
  return ' '.repeat(length);
}

/**
 * A string or regex literal, rendered for the requested view: blanked (the
 * default, for matching), kept (for reading operands), or masked with `x` (for
 * knowing which characters of a kept operand are inside a literal; see
 * `codeInMask` for everything else in that view). Every view
 * is the same length, so offsets line up across all three. The blanked view keeps
 * newlines so line numbers survive; the mask marks them too, because a newline
 * inside a literal is part of its value.
 */
function literal(source, start, end, mode) {
  const text = source.slice(start, end);
  if (mode === 'keep') return text;
  if (mode === 'mask') return 'x'.repeat(text.length);
  return text.replaceAll(/[^\n]/g, ' ');
}

/**
 * Code outside a literal, in the masked view: blank, newlines kept. The mask must
 * hold nothing but `x` for literal positions, or an identifier ending in `x`
 * would merge with the literal after it (a template tagged `x` would read as a
 * literal opening with `x`, not with a backtick).
 */
const codeInMask = (character) => (character === '\n' ? '\n' : ' ');

function stripCLike(source, literals) {
  let out = '';
  let index = 0;
  // Whether a `/` at this position could open a regex literal rather than divide.
  let regexAllowed = true;

  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];

    if (character === '/' && next === '/') {
      const end = source.indexOf('\n', index);
      const stop = end === -1 ? source.length : end;
      out += blank(stop - index);
      index = stop;
      continue;
    }

    if (character === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      const stop = end === -1 ? source.length : end + 2;
      for (let scan = index; scan < stop; scan += 1) out += source[scan] === '\n' ? '\n' : ' ';
      index = stop;
      continue;
    }

    if (character === '/' && regexAllowed) {
      // Regex literal. Consume to the closing slash so a quote inside it (`/it's/`)
      // cannot open a phantom string and swallow the rest of the file.
      let scan = index + 1;
      let closed = false;
      while (scan < source.length && source[scan] !== '\n') {
        if (source[scan] === '\\') {
          scan += 2;
          continue;
        }
        if (source[scan] === '[') {
          while (scan < source.length && source[scan] !== ']' && source[scan] !== '\n') scan += 1;
        }
        if (source[scan] === '/') {
          closed = true;
          scan += 1;
          break;
        }
        scan += 1;
      }
      if (closed) {
        out += literal(source, index, scan, literals);
        index = scan;
        regexAllowed = false;
        continue;
      }
    }

    if (character === '"' || character === "'" || character === '`') {
      const quote = character;
      let scan = index + 1;
      while (scan < source.length) {
        if (source[scan] === '\\') {
          scan += 2;
          continue;
        }
        if (source[scan] === quote) {
          scan += 1;
          break;
        }
        if (quote !== '`' && source[scan] === '\n') break;
        scan += 1;
      }
      out += literal(source, index, scan, literals);
      index = scan;
      regexAllowed = true;
      continue;
    }

    out += literals === 'mask' ? codeInMask(character) : character;
    if (!/\s/.test(character)) regexAllowed = /[(,=:[!&|?{};+\-*%<>~^]/.test(character);
    index += 1;
  }
  return out;
}

function stripPython(source, literals) {
  let out = '';
  let index = 0;
  while (index < source.length) {
    const character = source[index];

    if (character === '#') {
      const end = source.indexOf('\n', index);
      const stop = end === -1 ? source.length : end;
      out += blank(stop - index);
      index = stop;
      continue;
    }

    const triple = source.slice(index, index + 3);
    if (triple === '"""' || triple === "'''") {
      const end = source.indexOf(triple, index + 3);
      const stop = end === -1 ? source.length : end + 3;
      out += literal(source, index, stop, literals);
      index = stop;
      continue;
    }

    if (character === '"' || character === "'") {
      const quote = character;
      let scan = index + 1;
      while (scan < source.length && source[scan] !== '\n') {
        if (source[scan] === '\\') {
          scan += 2;
          continue;
        }
        if (source[scan] === quote) {
          scan += 1;
          break;
        }
        scan += 1;
      }
      out += literal(source, index, scan, literals);
      index = scan;
      continue;
    }

    out += literals === 'mask' ? codeInMask(character) : character;
    index += 1;
  }
  return out;
}

function stripYaml(source) {
  return source
    .split('\n')
    .map((line) => {
      let out = '';
      let quote = null;
      for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (quote) {
          out += ' ';
          if (character === quote) quote = null;
          continue;
        }
        if (character === '"' || character === "'") {
          quote = character;
          out += ' ';
          continue;
        }
        if (character === '#' && (index === 0 || /\s/.test(line[index - 1]))) {
          out += blank(line.length - index);
          break;
        }
        out += character;
      }
      return out;
    })
    .join('\n');
}

function stripNoise(source, kind) {
  switch (kind) {
    case 'js':
    case 'java':
    case 'go':
    case 'pactconfig': {
      return stripCLike(source);
    }
    case 'py': {
      return stripPython(source);
    }
    case 'maestro': {
      return stripYaml(source);
    }
    default: {
      return source;
    }
  }
}

/**
 * Comments blanked, string and regex literals kept (`mode: 'keep'`) or masked
 * (`mode: 'mask'`), same length as the input.
 *
 * `stripNoise` is right for deciding WHERE a pattern matches, and wrong for
 * deciding what an operand IS: once literal contents are blanked,
 * `result['actual']` and `result['expected']` are both `result[          ]`.
 * C3 finds its match on the stripped text and reads the operands from the kept
 * view, at the same offsets; the masked view says which of those characters sit
 * inside a literal, where whitespace is part of the value.
 */
function stripComments(source, kind, mode) {
  switch (kind) {
    case 'js':
    case 'java':
    case 'go':
    case 'pactconfig': {
      return stripCLike(source, mode);
    }
    case 'py': {
      return stripPython(source, mode);
    }
    default: {
      // Maestro YAML has no C3 and no kept view; callers use the stripped text.
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers shared by the rule predicates
// ---------------------------------------------------------------------------

/**
 * An operand with the whitespace outside its literals removed.
 *
 * Whitespace inside a string or regex literal is part of the value: `'a b'` and
 * `'ab'` differ, as do `/a b/` and `/ab/`, and collapsing them would turn a
 * comparison that can fail into a reported tautology. `mask` is the same slice of
 * the masked view, `x` wherever the character is inside a literal.
 */
function normalizeOperand(value, mask) {
  return value.replaceAll(/\s/g, (character, offset) => (mask[offset] === 'x' ? character : '')).replace(/;$/, '');
}

/**
 * Whether a JavaScript operand contains a template literal that interpolates.
 * Stripping blanks the whole template, `${...}` included, so the operand pattern
 * cannot see a call or an `i++` inside it, and two textually equal templates can
 * still evaluate to different values. Such operands are never reported.
 *
 * Only a literal that OPENS with a backtick is a template. A backtick inside a
 * quoted string is data, and Go's backtick raw strings never interpolate, so
 * `${` in either is a constant.
 */
function interpolates(text, mask, kind) {
  if (kind !== 'js') return false;
  for (const run of mask.matchAll(/x+/g)) {
    const body = text.slice(run.index, run.index + run[0].length);
    if (body.startsWith('`') && body.includes('${')) return true;
  }
  return false;
}

/**
 * `[start, end]` of every match whose two operands are the same expression: the
 * mechanical core of C3.
 *
 * The pattern runs on the stripped source, so a quote or comment cannot fake a
 * match. The operands are read from the kept view (comments blanked, literals
 * intact) at the match's group offsets, so two operands that differ only inside
 * a literal still compare different. Each operand group must span everything
 * between its delimiters, surrounding whitespace included: a group that stops at
 * the last non-blank stripped character would cut `x + 'a'` down to `x +`.
 */
function selfComparisons(stripped, views, pattern) {
  const spans = [];
  for (const match of stripped.matchAll(pattern)) {
    const operands = [1, 2].map((group) => {
      const [start, end] = match.indices[group] ?? [0, 0];
      return { text: views.code.slice(start, end), mask: views.mask.slice(start, end) };
    });
    if (operands.some(({ text, mask }) => interpolates(text, mask, views.kind))) continue;
    const [left, right] = operands.map(({ text, mask }) => normalizeOperand(text, mask));
    if (left.length > 0 && left === right) spans.push([match.index, match.index + match[0].length]);
  }
  return spans;
}

/** `[start, end]` of every match of `pattern` (which must carry the `g` flag). */
function matchSpans(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => [match.index, match.index + match[0].length]);
}

const SKIP_TOKEN = /\.skip|xit|xdescribe|test\.todo|@Ignore|@Disabled|pytest\.mark\.skip/;

/**
 * Where this line's comment starts, or -1.
 *
 * String-aware, and the marker set is scoped by language. Both halves matter: a
 * `#` is a comment in Python and YAML and is an ordinary character in JavaScript,
 * and a marker inside a string literal is not a comment in any of them. Reading a
 * raw line for `#` treats `test.skip("renders # hashtag", ...)` as documented and
 * silences the row, which is the raw-versus-stripped defect this whole file was
 * written to avoid.
 *
 * `stripNoise` cannot answer this question: it blanks comments along with strings,
 * so by the time it has run there is nothing left to find.
 */
function commentIndex(line, kind) {
  const markers = kind === 'py' || kind === 'maestro' ? ['#'] : ['//', '/*'];
  let quote = null;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote) {
      if (character === '\\') {
        index += 1;
        continue;
      }
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    for (const marker of markers) {
      if (line.startsWith(marker, index)) return index;
    }
  }
  return -1;
}

/** C1's escape hatch: a comment on the line or the line above documents the skip. */
function hasAdjacentComment(rawLines, lineIndex, kind) {
  const current = rawLines[lineIndex] || '';
  const above = (rawLines[lineIndex - 1] || '').trim();

  // A whole comment line directly above.
  if (commentIndex(above, kind) === 0) return true;

  // An annotation carrying its own reason string: `@pytest.mark.skip(reason="...")`
  // and `@Disabled("...")` are the documented forms in their languages, and the
  // reason sits in a different argument position in each. An annotation call with
  // any string literal in it is the honest predicate; pinning the position would
  // pass one language and fail the other. JavaScript has no such form, so this
  // branch is scoped rather than applied everywhere.
  if ((kind === 'py' || kind === 'java') && /@[\w.]+\s*\(/.test(current) && /["']/.test(current)) return true;

  // A trailing comment AFTER the token. One before it documents something else.
  const tokenIndex = current.search(SKIP_TOKEN);
  const comment = commentIndex(current, kind);
  return comment !== -1 && tokenIndex !== -1 && comment > tokenIndex;
}

// ---------------------------------------------------------------------------
// The rules
//
// `severity` is the registry's, never chosen here. `action` is this hook's own
// decision about whether the row is safe to block on, and every `warn` carries
// the reason it is not a block.
// ---------------------------------------------------------------------------

const RULES = [
  {
    id: 'C1',
    title: 'Disabled test',
    severity: 'CRITICAL',
    gate: 'Absolute',
    action: 'warn',
    // The row requires "without a documented, still-true reason", and no regex can
    // decide "still-true". TEA's own API guidance sanctions `test.skip` plus a
    // FIXME for a documented behaviour mismatch, so a blocking rule here would
    // fight TEA's doctrine and train users to disable the hook.
    actionReason: 'the row is conditioned on a documented, still-true reason, which is not mechanically decidable',
    scope: 'line',
    kinds: ['js', 'py', 'java'],
    fix: 'Delete the test, or document why it is skipped on the line or the line above and keep that reason true.',
    match(line, context) {
      const patterns = {
        js: /(?:^|[^\w.])(?:x(?:it|describe|test)\s*\(|\w+\.skip\s*[(.]|\w+\.todo\s*\()/,
        py: /@pytest\.mark\.skip/,
        java: /@(?:Ignore|Disabled)\b/,
      };
      const pattern = patterns[context.kind];
      if (!pattern || !pattern.test(line)) return false;
      return !hasAdjacentComment(context.rawLines, context.lineIndex, context.kind);
    },
  },
  {
    id: 'C2',
    title: 'Focused test',
    severity: 'CRITICAL',
    gate: 'Absolute',
    action: 'block',
    // Source scope because formatters split chains: `test.only\n("x", ...)` is as
    // focused as the one-line form, and a per-line scan never sees it.
    scope: 'source',
    kinds: ['js'],
    fix: 'Remove `.only` / `fdescribe` / `fit`. A committed focus silently disables every sibling test in the file.',
    matchSource(stripped) {
      return [...matchSpans(stripped, /(?<![\w.])(?:fdescribe|fit|ftest)\s*\(/g), ...matchSpans(stripped, /\.only\s*[(.]/g)];
    },
  },
  {
    id: 'C3',
    title: 'Tautological assertion',
    severity: 'CRITICAL',
    gate: 'Absolute',
    action: 'block',
    // Source scope because formatters split chains: `expect(actual)\n  .toBe(actual)`
    // is the same tautology as the one-line form.
    scope: 'source',
    kinds: ['js', 'py', 'java', 'go'],
    fix: 'Assert the value the system under test produced against an expectation that could differ from it.',
    matchSource(stripped, context) {
      if (context.kind === 'js') {
        // `.not.` is excluded on purpose: `expect(x).not.toBe(x)` is a defect too,
        // but it always FAILS, so it is not the "test cannot fail" failure this row
        // is about, and blocking it would be this hook overreaching its row.
        return selfComparisons(
          stripped,
          context,
          /expect\s*\(([^(),]+?)\)\s*\.\s*(?:to\s*\.\s*)?(?:toBe|toEqual|toStrictEqual|toBeCloseTo|equal|equals|eql|deep\s*\.\s*equal)\s*\(([^(),]+?)\)/dg,
        );
      }
      if (context.kind === 'py') {
        // Horizontal whitespace only: a Python statement does not continue onto the
        // next line without a bracket or a backslash, so `\s` here would pair an
        // `assert` with a `==` on a later, unrelated line.
        return selfComparisons(stripped, context, /assert[ \t]+([^=<>!\s]+)[ \t]*==[ \t]*([^=<>!\s#]+)/dg);
      }
      if (context.kind === 'java') {
        return [
          ...matchSpans(stripped, /assertTrue\s*\(\s*true\s*\)/g),
          ...matchSpans(stripped, /assertFalse\s*\(\s*false\s*\)/g),
          ...selfComparisons(stripped, context, /assertEquals\s*\(([^,()]+?),([^,()]+?)\)/dg),
        ];
      }
      if (context.kind === 'go') {
        return selfComparisons(stripped, context, /assert\.(?:Equal|EqualValues)\s*\(\s*t\s*,([^,()]+?),([^,()]+?)\)/dg);
      }
      return [];
    },
  },
  {
    id: 'C4',
    title: 'Flow asserts nothing',
    severity: 'CRITICAL',
    gate: 'Absolute',
    action: 'block',
    // Only the Maestro half of C4 is mechanical. In a JS/Python/Java suite an
    // assertion can live behind a helper, a custom matcher, or a page object, and
    // "this body contains zero assertions" is exactly the judgment `test-review`
    // exists to make. A Maestro flow has a closed vocabulary, so the absence of
    // every assertion verb in the whole file is decidable by reading it.
    partial: 'Maestro flows only; the general "test body has no assertion" case stays with test-review.',
    scope: 'file',
    kinds: ['maestro'],
    fix: 'Add `assertVisible`, `assertNotVisible`, `assertTrue`, or `extendedWaitUntil` on the destination state. A flow that only taps passes as long as the taps land.',
    matchFile(strippedSource) {
      if (!/^\s*(?:-\s*)?(?:appId|tags)\s*:/m.test(strippedSource) && !/^\s*-\s*(?:launchApp|tapOn|inputText)\b/m.test(strippedSource)) {
        // Not a Maestro flow, just a YAML file that happened to match a glob.
        return false;
      }
      return !/\b(?:assertVisible|assertNotVisible|assertTrue|extendedWaitUntil)\b/.test(strippedSource);
    },
  },
  {
    id: 'H1',
    title: 'Hard wait',
    severity: 'HIGH',
    gate: 'Absolute',
    action: 'block',
    scope: 'line',
    kinds: ['js', 'py', 'java', 'go', 'maestro'],
    fix: 'Wait on the condition, not the clock: a web-first assertion, an explicit readiness signal, `cy.wait("@alias")`, or `extendedWaitUntil` in a Maestro flow.',
    match(line, context) {
      const patterns = {
        js: /(?:\bwaitForTimeout\s*\(|\bcy\.wait\s*\(\s*\d|(?:^|[^\w.])sleep\s*\(|\bdelay\s*\(\s*\d)/,
        py: /(?:\btime\.sleep\s*\(|(?:^|[^\w.])sleep\s*\()/,
        java: /\bThread\.sleep\s*\(/,
        // The row's own catch-all — "or any bare timer used to order steps" — is
        // what carries Go here; `time.Sleep` is the language's only spelling of it.
        go: /\btime\.Sleep\s*\(/,
        maestro: /^\s*-\s*sleep\s*:/,
      };
      const pattern = patterns[context.kind];
      return Boolean(pattern && pattern.test(line));
    },
  },
  {
    id: 'H5',
    title: 'Oversize test file',
    severity: 'HIGH',
    gate: 'Absolute',
    action: 'block',
    scope: 'file',
    kinds: ['js', 'py', 'java', 'go', 'maestro'],
    fix: 'Split the file along its subjects. Past 1000 lines nobody reads the whole thing before adding to it.',
    matchFile(strippedSource, context) {
      const limit = context.config.maxFileLines || DEFAULT_CONFIG.maxFileLines;
      return context.lineCount > limit;
    },
    describe(context) {
      return `${context.lineCount} lines, limit ${context.config.maxFileLines || DEFAULT_CONFIG.maxFileLines}`;
    },
  },
  {
    id: 'H6',
    title: 'Pact worker parallelism',
    severity: 'HIGH',
    gate: 'Absolute',
    action: 'block',
    scope: 'file',
    kinds: ['pactconfig'],
    fix: 'Set `fileParallelism: false`. Parallel workers race on the shared pact JSON and the mock server port.',
    matchFile(strippedSource) {
      return !/fileParallelism\s*:\s*false/.test(strippedSource);
    },
  },
  {
    id: 'H8',
    title: 'Pact serialization defeated',
    severity: 'HIGH',
    gate: 'Absolute',
    action: 'block',
    scope: 'line',
    kinds: ['pactconfig'],
    fix: 'Remove the setting. Pact runs must stay serialized: no concurrent sequence, one worker, isolation on.',
    match(line) {
      if (/concurrent\s*:\s*true/.test(line)) return true;
      if (/isolate\s*:\s*false/.test(line)) return true;
      const concurrency = /(?:maxConcurrency|maxWorkers|minWorkers)\s*:\s*(\d+)/.exec(line);
      return Boolean(concurrency && Number(concurrency[1]) > 1);
    },
  },
];

/**
 * Registry rows gated `Absolute` that this hook deliberately does not implement.
 * Each needs a judgment a pattern cannot make, so blocking on a pattern would
 * either miss the real cases or block correct code. `test-review` scores them.
 *
 * This map is not documentation. A dev-only check in this repository's own
 * test suite asserts that every Absolute row in the registry appears either in
 * RULES or here, so a new Absolute row fails the build until somebody decides
 * which side it belongs on.
 */
const DEFERRED = {
  C5: 'Deciding that no call reached the system under test between configuring a mock and asserting on it requires following data flow.',
  C6: 'Reachability of an assertion depends on control flow and on whether a callback is ever awaited.',
  H3: 'Distinguishing a conditional assertion from a legitimately guarded one requires knowing whether the guarded UI is genuinely optional.',
  H4: 'Whether module-level state is reset depends on what the hooks actually do, not on their presence.',
  H10: 'Deciding that no assertion in a test constrains a value requires reading every assertion in the test together, and the three exemptions turn on whether the value is predictable at all.',
  M3: 'Counting subjects rather than expect calls is a semantic judgment.',
  M4: 'Requires counting tests and recognizing grouping constructs across frameworks and custom wrappers.',
  M6: 'A promise-returning call is only a defect when it is not awaited AND its effect is asserted; both need type information.',
  M7: 'Nesting depth needs a parser, and the interesting cases are helper-generated blocks a regex miscounts.',
  L6: 'Whether a literal carries domain meaning is the whole question, and it is not in the token.',
};

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

function activeRules(config) {
  const disabled = new Set(config.disabledRules || []);
  return RULES.filter((rule) => !disabled.has(rule.id));
}

function lineStartOffsets(source) {
  const starts = [0];
  for (let index = source.indexOf('\n'); index !== -1; index = source.indexOf('\n', index + 1)) starts.push(index + 1);
  return starts;
}

/** Zero-based line holding `offset`, by binary search over line starts. */
function lineAt(lineStarts, offset) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (lineStarts[middle] <= offset) low = middle;
    else high = middle - 1;
  }
  return low;
}

/**
 * Apply every open-gated rule to one file's content.
 *
 * `fragmentOnly` is true when the content is an Edit's new string rather than the
 * whole file. File-scope rules are skipped there: a fragment cannot answer "does
 * this file exceed 1000 lines" or "does this flow assert anywhere", and answering
 * it from a fragment is how a hook produces confident nonsense.
 */
function scanContent(relativePath, source, config, options) {
  const settings = { ...DEFAULT_CONFIG, ...config };
  const fragmentOnly = Boolean(options && options.fragmentOnly);
  const kind = kindForPath(relativePath, settings);
  if (!kind) return [];
  if (matchesAnyGlob(relativePath, settings.excludeGlobs)) return [];

  const isPactConfig = kind === 'pactconfig';
  const gateOpen = isPactConfig ? matchesAnyGlob(relativePath, settings.pactConfigGlobs) : matchesAnyGlob(relativePath, settings.testGlobs);
  if (!gateOpen) return [];

  const stripped = stripNoise(source, kind);
  const strippedLines = stripped.split('\n');
  const rawLines = source.split('\n');
  const lineCount = source.replace(/\n$/, '').split('\n').length;
  const lineStarts = lineStartOffsets(stripped);
  let views = null;
  const findings = [];

  for (const rule of activeRules(settings)) {
    if (!rule.kinds.includes(kind)) continue;

    if (rule.scope === 'file') {
      if (fragmentOnly) continue;
      const context = { kind, config: settings, lineCount, relativePath };
      if (rule.matchFile(stripped, context)) {
        findings.push({
          rule,
          line: 1,
          detail: rule.describe ? rule.describe(context) : '',
          text: '',
          occurrences: [''],
        });
      }
      continue;
    }

    views ??= { code: stripComments(source, kind, 'keep') ?? stripped, mask: stripComments(source, kind, 'mask') ?? '' };
    // What a violation IS, independent of where it sits and of the comments and
    // layout around it: the code it spans, literals intact, whitespace outside
    // literals dropped. `introducedFindings` compares these.
    const identity = (start, end) => normalizeOperand(views.code.slice(start, end), views.mask.slice(start, end));

    if (rule.scope === 'source') {
      // Every match maps back to the line it starts on. Stripping preserves
      // newlines, so offsets into the stripped text are offsets into the source.
      // One finding per line, as the line rules report, carrying every match on it.
      const byLine = new Map();
      for (const [start, end] of rule.matchSource(stripped, { kind, config: settings, ...views, relativePath })) {
        const index = lineAt(lineStarts, start);
        byLine.set(index, [...(byLine.get(index) || []), identity(start, end)]);
      }
      for (const index of [...byLine.keys()].sort((a, b) => a - b)) {
        findings.push({
          rule,
          line: index + 1,
          detail: '',
          text: (rawLines[index] || '').trim().slice(0, 120),
          occurrences: byLine.get(index),
        });
      }
      continue;
    }

    for (const [index, line] of strippedLines.entries()) {
      const context = { kind, config: settings, rawLines, lineIndex: index, relativePath };
      if (rule.match(line, context)) {
        findings.push({
          rule,
          line: index + 1,
          detail: '',
          text: (rawLines[index] || '').trim().slice(0, 120),
          occurrences: [identity(lineStarts[index], lineStarts[index] + line.length)],
        });
      }
    }
  }

  return findings;
}

function scanFile(absolutePath, config, projectRoot) {
  try {
    const stat = fs.statSync(absolutePath);
    if (!stat.isFile()) return [];
    const source = fs.readFileSync(absolutePath, 'utf8');
    const relative = path.relative(projectRoot, absolutePath) || path.basename(absolutePath);
    return scanContent(relative, source, config, { fragmentOnly: false }).map((finding) => ({ ...finding, file: relative }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Payload handling
// ---------------------------------------------------------------------------

function readStdin() {
  // A hook is always fed its payload on a pipe. When stdin is a terminal there is
  // no payload coming, and reading fd 0 would hang the agent forever waiting for
  // one, so treat it as an empty payload and fail open.
  if (process.stdin.isTTY) return '';
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function loadConfig(projectRoot) {
  const configPath = path.join(projectRoot, '.tea', 'enforce-config.json');
  if (!fs.existsSync(configPath)) return { ...DEFAULT_CONFIG };
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (error) {
    process.stderr.write(`tea-enforce: ${configPath} is not valid JSON (${error.message}); enforcement is off for this call.\n`);
    return null;
  }
}

/** Every path a Write/Edit/MultiEdit/Bash payload names, best effort. */
function targetsFromPayload(payload, config, projectRoot) {
  const input = payload.tool_input || {};
  const named = [];

  if (typeof input.file_path === 'string') named.push(input.file_path);
  if (typeof input.notebook_path === 'string') named.push(input.notebook_path);
  if (Array.isArray(input.file_paths)) named.push(...input.file_paths.filter((value) => typeof value === 'string'));

  if (typeof input.command === 'string') {
    // A Bash write names its target somewhere in the command line far more often
    // than not: `cat > x.spec.ts`, `sed -i '' s/a/b/ x.spec.ts`, `tee x.spec.ts`,
    // `cp fixture.ts x.spec.ts`. Take every token that looks like a path into a
    // gated file. Existence is not checked here on purpose: `scanFile` stats the
    // path and returns nothing for a path that is not a readable file, so a second
    // check would only be a slower way to reach the same answer. A codegen script that writes files it never
    // names is NOT caught here; --stop is what covers that.
    for (const rawToken of input.command.split(/[\s;|&()<>"']+/)) {
      const token = rawToken.replaceAll(/^['"]|['"]$/g, '');
      if (!token || token.startsWith('-')) continue;
      if (!/\.[A-Za-z]+$/.test(token)) continue;
      named.push(token);
    }
  }

  const resolved = new Set();
  for (const candidate of named) {
    const absolute = path.isAbsolute(candidate) ? candidate : path.resolve(projectRoot, candidate);
    const relative = path.relative(projectRoot, absolute);
    if (relative.startsWith('..')) continue;
    if (!matchesAnyGlob(relative, config.testGlobs) && !matchesAnyGlob(relative, config.pactConfigGlobs)) continue;
    resolved.add(absolute);
  }
  return [...resolved];
}

/** The content a PreToolUse payload is about to write, per tool. */
function fragmentsFromPayload(payload) {
  const input = payload.tool_input || {};
  const tool = payload.tool_name;

  if (tool === 'Write' && typeof input.content === 'string') {
    return [{ text: input.content, fragmentOnly: false }];
  }
  if (tool === 'Edit' && typeof input.new_string === 'string') {
    return [{ text: input.new_string, fragmentOnly: true }];
  }
  if (tool === 'MultiEdit' && Array.isArray(input.edits)) {
    return input.edits
      .filter((edit) => edit && typeof edit.new_string === 'string')
      .map((edit) => ({ text: edit.new_string, fragmentOnly: true }));
  }
  return [];
}

/**
 * One Edit step applied to `content` the way the Edit tool applies it, or null
 * when it cannot be (the tool would reject it too).
 *
 * Index splicing on purpose: `String.prototype.replace` reads `$&` and `$1` in the
 * replacement as patterns, and test code is full of template literals.
 */
function applyEdit(content, edit) {
  if (!edit || typeof edit.old_string !== 'string' || typeof edit.new_string !== 'string') return null;
  if (edit.old_string === '') return content === '' ? edit.new_string : null;
  if (edit.replace_all === true) {
    return content.includes(edit.old_string) ? content.split(edit.old_string).join(edit.new_string) : null;
  }
  const at = content.indexOf(edit.old_string);
  if (at === -1) return null;
  return content.slice(0, at) + edit.new_string + content.slice(at + edit.old_string.length);
}

/**
 * The file as it is now and as it will be once this Edit or MultiEdit lands, or
 * null when that cannot be built.
 *
 * An Edit's `new_string` scanned on its own is scanned out of context: a fragment
 * that sits inside an existing block comment or template literal looks like code,
 * and a rule that spans the fragment's boundary is invisible. Building the
 * proposed file gives `--pre` the same view `--post` will have, and lets the
 * file-scope rules run on edits too. A missing file is an empty one, which is how
 * the Edit tool creates a file from an empty `old_string`.
 */
function proposedEdit(payload, absolutePath) {
  const input = payload.tool_input || {};
  let edits = null;
  if (payload.tool_name === 'Edit') edits = [input];
  if (payload.tool_name === 'MultiEdit' && Array.isArray(input.edits)) edits = input.edits;
  if (!edits) return null;

  let before = '';
  try {
    before = fs.readFileSync(absolutePath, 'utf8');
  } catch (error) {
    if (!error || error.code !== 'ENOENT') return null;
  }

  let after = before;
  for (const edit of edits) {
    after = applyEdit(after, edit);
    if (after === null) return null;
  }
  return { before, after };
}

/**
 * Findings in `after` that `before` does not already have.
 *
 * `--pre` judges the write in front of it. A violation already sitting in the
 * untouched part of the file is `--post`'s to report, and blocking an unrelated
 * edit on it would stop the agent fixing a file one edit at a time. Line numbers
 * move under an edit, so each occurrence is matched by rule and identity (the
 * code it spans, comments out, literals in), as a multiset: rewording a comment
 * beside a violation adds nothing, and a second copy of an existing violation on
 * the same line still adds one. The one trade this makes is an edit that removes
 * a violation and writes an identical one elsewhere, which `--post` reports.
 */
function introducedFindings(before, after) {
  const key = (finding, occurrence) => `${finding.rule.id}\u0000${occurrence}`;
  const existing = new Map();
  for (const finding of before) {
    for (const occurrence of finding.occurrences) existing.set(key(finding, occurrence), (existing.get(key(finding, occurrence)) || 0) + 1);
  }
  return after.filter((finding) => {
    let introduced = false;
    for (const occurrence of finding.occurrences) {
      const remaining = existing.get(key(finding, occurrence)) || 0;
      if (remaining === 0) introduced = true;
      else existing.set(key(finding, occurrence), remaining - 1);
    }
    return introduced;
  });
}

function scanRoots(globs) {
  const roots = new Set();
  for (const glob of globs || []) {
    for (const expanded of expandBraces(glob)) {
      const wildcard = expanded.search(/[*?{[]/);
      const prefix = wildcard === -1 ? path.dirname(expanded) : expanded.slice(0, wildcard);
      const directory = prefix.includes('/') ? prefix.slice(0, prefix.lastIndexOf('/')) : '';
      roots.add(directory || '.');
    }
  }
  // A root that contains another root makes the inner one redundant. `.` contains
  // everything, so when it is present it is the only root worth walking. Keeping
  // the others alongside it would walk `.maestro` and `maestro` a second time and
  // report every finding in them twice, since `'.maestro'.startsWith('./')` is
  // false and a prefix test alone never catches this case.
  const list = [...roots];
  if (list.includes('.')) return ['.'];
  return list.filter((root) => !list.some((other) => other !== root && root.startsWith(`${other}/`)));
}

function walkRecentFiles(projectRoot, config) {
  const cutoff = Date.now() - (config.stopScanWindowSeconds || DEFAULT_CONFIG.stopScanWindowSeconds) * 1000;
  const limit = config.maxScannedFiles || DEFAULT_CONFIG.maxScannedFiles;
  const found = [];
  let visited = 0;

  const walk = (directory) => {
    if (found.length >= limit || visited >= limit * 4) return;
    let entries = [];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= limit) return;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue;
        walk(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      visited += 1;
      const relative = path.relative(projectRoot, absolute);
      if (!matchesAnyGlob(relative, config.testGlobs) && !matchesAnyGlob(relative, config.pactConfigGlobs)) continue;
      try {
        if (fs.statSync(absolute).mtimeMs < cutoff) continue;
      } catch {
        continue;
      }
      found.push(absolute);
    }
  };

  for (const root of scanRoots([...(config.testGlobs || []), ...(config.pactConfigGlobs || [])])) {
    walk(path.resolve(projectRoot, root));
  }
  return found;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/**
 * Whether this file still matches the hash the scaffold recorded.
 *
 * Warn-only, and only on `--stop`. A drifted copy is a governance problem, not a
 * defect in the write in front of it, so blocking on it would punish the wrong
 * action; and running it on `--pre` would hash the file on every edit for a signal
 * that changes at most once per install.
 */
function integrityWarning(config) {
  if (!config.hookSha256) return null;
  try {
    const actual = crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
    if (actual === config.hookSha256) return null;
    return (
      'tea-enforce: this hook no longer matches the copy the framework workflow installed.\n' +
      `  expected ${config.hookSha256}\n  actual   ${actual}\n` +
      '  A locally edited hook is not covered by the test that keeps its rules agreeing with\n' +
      `  ${REGISTRY_PATH}. Re-copy it from the workflow, or update hookSha256 in\n` +
      '  .tea/enforce-config.json and say in the commit what you changed and why.\n'
    );
  } catch {
    return null;
  }
}

function render(findings, heading) {
  const lines = [heading, ''];
  for (const finding of findings) {
    const location = finding.file ? `${finding.file}:${finding.line}` : `line ${finding.line}`;
    const detail = finding.detail ? ` (${finding.detail})` : '';
    lines.push(`${location}  [${finding.rule.id} ${finding.rule.severity}] ${finding.rule.title}${detail}`);
    if (finding.text) lines.push(`    ${finding.text}`);
    lines.push(`    Fix: ${finding.rule.fix}`, '');
  }
  lines.push(
    `Rules are rows in ${REGISTRY_PATH}. Severity is the registry's, not this hook's.`,
    'To exempt a rule for this project, add its id to `disabledRules` in .tea/enforce-config.json and say why in the commit.',
  );
  return `${lines.join('\n')}\n`;
}

function report(findings, blockHeading) {
  const blocking = findings.filter((finding) => finding.rule.action === 'block');
  const warnings = findings.filter((finding) => finding.rule.action !== 'block');

  if (warnings.length > 0) {
    process.stderr.write(render(warnings, 'TEA enforcement warnings (advisory, nothing was blocked):'));
  }
  if (blocking.length === 0) return 0;
  process.stderr.write(render(blocking, blockHeading));
  return 2;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main(argv) {
  const mode = argv.find((argument) => ['--pre', '--post', '--stop'].includes(argument)) || '--pre';
  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  const config = loadConfig(projectRoot);
  if (!config) return 0;

  const raw = readStdin();
  let payload = {};
  if (raw.trim()) {
    try {
      payload = JSON.parse(raw);
    } catch {
      // Fail open. An unparseable payload is a hook problem, not a test-quality
      // problem, and a hook that blocks on its own bugs is worse than no hook.
      return 0;
    }
  }

  if (mode === '--stop') {
    if (payload.stop_hook_active === true) return 0;
    const drift = integrityWarning(config);
    if (drift) process.stderr.write(drift);
    const findings = walkRecentFiles(projectRoot, config).flatMap((absolute) => scanFile(absolute, config, projectRoot));
    return report(findings, 'TEA enforcement found violations in test files written during this turn:');
  }

  if (mode === '--post') {
    const findings = targetsFromPayload(payload, config, projectRoot).flatMap((absolute) => scanFile(absolute, config, projectRoot));
    return report(findings, 'TEA enforcement re-read the file after the write and found violations:');
  }

  const input = payload.tool_input || {};
  const filePath = typeof input.file_path === 'string' ? input.file_path : null;
  if (!filePath) return 0;
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);
  const relative = path.relative(projectRoot, absolute);
  if (relative.startsWith('..')) return 0;

  const proposed = proposedEdit(payload, absolute);
  if (proposed) {
    const scan = (source) => scanContent(relative, source, config, { fragmentOnly: false });
    const findings = introducedFindings(scan(proposed.before), scan(proposed.after)).map((finding) => ({ ...finding, file: relative }));
    return report(findings, 'TEA enforcement blocked this write:');
  }

  // The proposed file could not be built (unreadable file, or an old_string the
  // Edit tool will reject anyway), so fall back to the fragments on their own.
  const findings = fragmentsFromPayload(payload).flatMap((fragment) =>
    scanContent(relative, fragment.text, config, { fragmentOnly: fragment.fragmentOnly }).map((finding) => ({
      ...finding,
      file: fragment.fragmentOnly ? `${relative} (in the edited fragment)` : relative,
    })),
  );

  return report(findings, 'TEA enforcement blocked this write:');
}

if (require.main === module) {
  let code = 0;
  try {
    code = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`tea-enforce: internal error, allowing the write (${error && error.message}).\n`);
    code = 0;
  }
  process.exit(code);
}

module.exports = {
  RULES,
  DEFERRED,
  DEFAULT_CONFIG,
  REGISTRY_PATH,
  expandBraces,
  globToRegExp,
  matchesAnyGlob,
  kindForPath,
  stripNoise,
  stripComments,
  commentIndex,
  integrityWarning,
  scanContent,
  scanFile,
  targetsFromPayload,
  fragmentsFromPayload,
  proposedEdit,
  introducedFindings,
  main,
};
