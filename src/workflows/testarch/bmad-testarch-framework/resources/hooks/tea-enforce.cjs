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
 * Every rule here is a row from `bmad-testarch-test-review/steps-c/criteria-registry.md`,
 * gated `Absolute` there, and mechanically decidable by pattern. That is a small
 * subset on purpose. The registry's Absolute rows that need a judgment a regex
 * cannot make (C5 mock-asserted-against-itself, C6 unreachable assertion, H3
 * conditional assertion, H4 unreset shared state, M3, M4, M6, M7, L6) stay with
 * `test-review`, and are listed in DEFERRED below with the reason. Severity is
 * read from the registry and never chosen here; `test/test-enforce-hook.js`
 * asserts that this file and the registry still agree, and fails when the
 * registry grows an Absolute row nobody has classified.
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
 * So: `--pre` is the fast block on the fragment about to be written; `--post`
 * re-reads the affected file(s) from disk in full and applies the same rules,
 * which is what catches Bash writes and split edits; `--stop` sweeps recently
 * modified test files at the end of a turn, which is what catches a codegen script
 * that wrote files it never named. File-scope rules (H5, C4) run in `--pre` only
 * for `Write`, where the whole content is genuinely present.
 *
 * FALSE POSITIVES
 *
 * Comments and string literals are stripped, per language, before any pattern runs.
 * A doc example that writes `await page.waitForTimeout(500)` inside a fenced block
 * in a `.md` is not a violation and this hook does not claim it is. Line numbers
 * survive stripping because stripped characters are replaced by spaces.
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

const REGISTRY_PATH = 'bmad-testarch-test-review/steps-c/criteria-registry.md';

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

function stripCLike(source) {
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
        out += blank(scan - index);
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
      for (let position = index; position < scan; position += 1) out += source[position] === '\n' ? '\n' : ' ';
      index = scan;
      regexAllowed = true;
      continue;
    }

    out += character;
    if (!/\s/.test(character)) regexAllowed = /[(,=:[!&|?{};+\-*%<>~^]/.test(character);
    index += 1;
  }
  return out;
}

function stripPython(source) {
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
      for (let scan = index; scan < stop; scan += 1) out += source[scan] === '\n' ? '\n' : ' ';
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
      out += blank(scan - index);
      index = scan;
      continue;
    }

    out += character;
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

// ---------------------------------------------------------------------------
// Helpers shared by the rule predicates
// ---------------------------------------------------------------------------

const normalizeOperand = (value) => String(value).replaceAll(/\s+/g, '').replace(/;$/, '');

/** A pair of equal operands is the mechanical core of C3. */
function selfComparison(line, pattern) {
  const matches = [...line.matchAll(pattern)];
  return matches.some((match) => {
    const left = normalizeOperand(match[1] ?? '');
    const right = normalizeOperand(match[2] ?? '');
    return left.length > 0 && left === right;
  });
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
    scope: 'line',
    kinds: ['js'],
    fix: 'Remove `.only` / `fdescribe` / `fit`. A committed focus silently disables every sibling test in the file.',
    match(line) {
      return /(?:^|[^\w.])(?:fdescribe|fit|ftest)\s*\(/.test(line) || /\.only\s*[(.]/.test(line);
    },
  },
  {
    id: 'C3',
    title: 'Tautological assertion',
    severity: 'CRITICAL',
    gate: 'Absolute',
    action: 'block',
    scope: 'line',
    kinds: ['js', 'py', 'java', 'go'],
    fix: 'Assert the value the system under test produced against an expectation that could differ from it.',
    match(line, context) {
      if (context.kind === 'js') {
        // `.not.` is excluded on purpose: `expect(x).not.toBe(x)` is a defect too,
        // but it always FAILS, so it is not the "test cannot fail" failure this row
        // is about, and blocking it would be this hook overreaching its row.
        return selfComparison(
          line,
          /expect\s*\(\s*([^(),]+?)\s*\)\s*\.\s*(?:to\s*\.\s*)?(?:toBe|toEqual|toStrictEqual|toBeCloseTo|equal|equals|eql|deep\s*\.\s*equal)\s*\(\s*([^(),]+?)\s*\)/g,
        );
      }
      if (context.kind === 'py') {
        return selfComparison(line, /assert\s+([^=<>!\s]+)\s*==\s*([^=<>!\s#]+)/g);
      }
      if (context.kind === 'java') {
        return (
          /assertTrue\s*\(\s*true\s*\)/.test(line) ||
          /assertFalse\s*\(\s*false\s*\)/.test(line) ||
          selfComparison(line, /assertEquals\s*\(\s*([^,()]+?)\s*,\s*([^,()]+?)\s*\)/g)
        );
      }
      if (context.kind === 'go') {
        return selfComparison(line, /assert\.(?:Equal|EqualValues)\s*\(\s*t\s*,\s*([^,()]+?)\s*,\s*([^,()]+?)\s*\)/g);
      }
      return false;
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
 * This map is not documentation. `test/test-enforce-hook.js` asserts that every
 * Absolute row in the registry appears either in RULES or here, so a new Absolute
 * row fails the build until somebody decides which side it belongs on.
 */
const DEFERRED = {
  C5: 'Deciding that no call reached the system under test between configuring a mock and asserting on it requires following data flow.',
  C6: 'Reachability of an assertion depends on control flow and on whether a callback is ever awaited.',
  H3: 'Distinguishing a conditional assertion from a legitimately guarded one requires knowing whether the guarded UI is genuinely optional.',
  H4: 'Whether module-level state is reset depends on what the hooks actually do, not on their presence.',
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
  commentIndex,
  integrityWarning,
  scanContent,
  scanFile,
  targetsFromPayload,
  fragmentsFromPayload,
  main,
};
