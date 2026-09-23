/**
 * The engine boundary of `tea-evaluate`, held over every file under `cli/`.
 *
 * Four rules (Story 1.4, AD-1, AD-5, AD-6):
 *
 * - `engine-import`: only `cli/lib/evaluate/engine.js` names `eval-quality` in
 *   an `import(`, `require(` or `require.resolve(` call, an `import ... from`
 *   or a bare `import '...'`, subpaths included. Every other file reaches the
 *   engine through that module.
 * - `dynamic-specifier`: under `cli/lib/evaluate/` and in `cli/evaluate.js`,
 *   every `require(`, `require.resolve(` and `import(` takes one string
 *   literal, so no computed specifier can reach the engine unseen.
 * - `engine-stage`: nothing reaches `runScore`, `preflightFromObservations`,
 *   `compile` or `seal`, the stages that decide enforced verdicts, which come
 *   only from the eval-quality CLI over persisted files.
 *   - `runScore`, `preflightFromObservations` and `seal` fail wherever they
 *     appear under `cli/` as an identifier, a member, a destructured key or a
 *     bracket string, `engine.js` included. Only comments and ordinary string
 *     text may name them.
 *   - `compile` is also Ajv's, so it fails only on a binding obtained from the
 *     engine: a `require` of `engine.js` or of any module that re-exports it
 *     (found to a fixed point across files), a loader destructured from one, an
 *     awaited or parenthesized-awaited loader result, a `.then` callback's plain
 *     or destructured parameter, a plain alias, and a member chain through a
 *     property the library was stored under (`context.engine.compile`). Inside
 *     `engine.js`, where every value comes from the engine, any `compile`
 *     access fails.
 * - `bmad-config`: the string `_bmad` appears nowhere under
 *   `cli/lib/evaluate/`, since the runtime reads no BMAD configuration.
 *
 * The scanner proves itself first: each form is planted in a temp copy of a
 * `cli/` tree and must be reported, and a planted file using the engine and Ajv
 * legitimately must not be, so the real scan cannot pass vacuously. Later
 * stories extend this test.
 *
 * Usage: node test/test-evaluate-boundaries.js
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PROJECT_ROOT = path.join(__dirname, '..');
const CLI_ROOT = path.join(PROJECT_ROOT, 'cli');
const ENGINE_MODULE = path.join('lib', 'evaluate', 'engine.js');
const RUNTIME_DIRECTORY = path.join('lib', 'evaluate');
const RUNTIME_BIN = 'evaluate.js';
const SOURCE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs']);
const ALWAYS_FORBIDDEN = ['runScore', 'preflightFromObservations', 'seal'];
const TRACKED_STAGE = 'compile';
const FORBIDDEN_CONFIG = '_bmad';

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };

const IDENTIFIER = String.raw`[A-Za-z_$][\w$]*`;
const QUOTE = `['"\u0060]`;
const NOT_QUOTE = `[^'"\u0060]`;
const ENGINE_IMPORT = new RegExp(
  String.raw`(?:\b(?:require(?:\s*\.\s*resolve)?|import)\s*\(\s*|\bfrom\s+|\bimport\s+)(${QUOTE})eval-quality(?:/${NOT_QUOTE}*)?\1`,
  'g',
);
const ANY_CALL_SPECIFIER = /\b(?:require(?:\s*\.\s*resolve)?|import)\s*\(/g;
const LITERAL_SPECIFIER = /^\s*(['"])[^'"\n]*\1\s*\)/;
const ALWAYS_IDENTIFIER = new RegExp(String.raw`(?<![\w$])(${ALWAYS_FORBIDDEN.join('|')})(?![\w$])`, 'g');
const ALWAYS_BRACKET = new RegExp(String.raw`\[\s*(${QUOTE})(${ALWAYS_FORBIDDEN.join('|')})\1\s*\]`, 'g');
const CALL = String.raw`(?:(${IDENTIFIER})\s*(?:\?\.|\.)\s*)?(${IDENTIFIER})\s*\(`;
const STAGE_ACCESS = String.raw`\s*(?:(?:\?\.|\.)\s*${TRACKED_STAGE}(?![\w$])|(?:\?\.)?\[\s*${QUOTE}${TRACKED_STAGE}${QUOTE}\s*\])`;
const REQUIRE_CALL = String.raw`require\s*\(\s*${QUOTE}(${NOT_QUOTE}+)${QUOTE}\s*\)`;

function escapeRegExp(text) {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/** One tokenizer for both views below: comments and, optionally, string contents blanked to spaces, newlines kept. */
function transform(source, blankStrings) {
  let out = '';
  let index = 0;
  let quote = null;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (quote !== null) {
      if (char === '\\') {
        out += blankStrings ? '  ' : `${char}${next ?? ''}`;
        index += 2;
        continue;
      }
      if (char === quote) {
        quote = null;
        out += char;
      } else {
        out += blankStrings && char !== '\n' ? ' ' : char;
      }
      index += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      out += char;
      index += 1;
      continue;
    }
    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') {
        out += ' ';
        index += 1;
      }
      continue;
    }
    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(index, stop).replaceAll(/[^\n]/g, ' ');
      index = stop;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

/** The source with every comment blanked, so offsets still map to lines. */
function stripComments(source) {
  return transform(source, false);
}

/** The source with comments and string contents blanked: what is left is code. */
function codeOnly(source) {
  return transform(source, true);
}

function lineAt(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

function filesUnder(directory) {
  const found = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(absolute));
    else if (entry.isFile()) found.push(absolute);
  }
  return found;
}

/** Whether a literal `require` specifier written in `file` names one of `modules`. */
function namesModule(file, specifier, modules) {
  if (!specifier.startsWith('.')) return false;
  const resolved = path.resolve(path.dirname(file), specifier);
  return modules.has(resolved) || modules.has(`${resolved}.js`);
}

/** Keys a destructuring pattern `{ a, b: c, ...rest }` reads. */
function destructuredKeys(pattern) {
  return pattern
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !part.startsWith('...'))
    .map((part) =>
      part
        .split(/[:=]/)[0]
        .trim()
        .replaceAll(/^\[?\s*['"\u0060]?|['"\u0060]?\s*\]?$/g, ''),
    );
}

function destructuredLocals(pattern) {
  return pattern
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !part.startsWith('...'))
    .map((part) => (part.includes(':') ? part.split(':')[1] : part).split('=')[0].trim());
}

/**
 * Every binding in one file holding the engine module, one of its loaders, a
 * promise of the library, or the library itself, plus the object properties
 * the library was stored under, tracked to a fixed point.
 */
function trackBindings(file, code, engineModules) {
  const modules = new Set();
  const loaders = new Set();
  const promises = new Set();
  const library = new Set();
  const properties = new Set();
  const destructuredStages = [];

  for (const match of code.matchAll(
    new RegExp(String.raw`\b(?:const|let|var)\s+(${IDENTIFIER})\s*=\s*${REQUIRE_CALL}(?:\s*\.\s*(${IDENTIFIER}))?`, 'g'),
  )) {
    if (!namesModule(file, match[2], engineModules)) continue;
    if (match[3] === undefined) modules.add(match[1]);
    else loaders.add(match[1]);
  }
  for (const match of code.matchAll(new RegExp(String.raw`\b(?:const|let|var)\s*\{([^{}]*)\}\s*=\s*${REQUIRE_CALL}`, 'g'))) {
    if (!namesModule(file, match[2], engineModules)) continue;
    if (destructuredKeys(match[1]).includes(TRACKED_STAGE)) destructuredStages.push({ offset: match.index, source: 'the engine module' });
    for (const local of destructuredLocals(match[1])) loaders.add(local);
  }

  const isLoader = (receiver, callee) => (receiver === undefined ? loaders.has(callee) : modules.has(receiver));
  const sets = [modules, loaders, promises, library];
  const total = () => sets.reduce((sum, set) => sum + set.size, 0) + properties.size;
  const thenCallback = String.raw`\.then\s*\(\s*(?:async\s+)?(?:\(\s*(${IDENTIFIER})\s*\)\s*=>|(${IDENTIFIER})\s*=>|function\s*[\w$]*\s*\(\s*(${IDENTIFIER})\s*\)|\(\s*\{([^{}]*)\}\s*\)\s*=>|function\s*[\w$]*\s*\(\s*\{([^{}]*)\}\s*\))`;
  const takeCallback = (match, first) => {
    const parameter = match[first] ?? match[first + 1] ?? match[first + 2];
    if (parameter !== undefined) library.add(parameter);
    if (destructuredKeys(match[first + 3] ?? match[first + 4] ?? '').includes(TRACKED_STAGE)) {
      destructuredStages.push({ offset: match.index, source: 'a .then callback' });
    }
  };

  let size = -1;
  while (size !== total()) {
    size = total();
    // `x = await load()`, `x = (await load())`, `x = await engine.load()`.
    for (const match of code.matchAll(new RegExp(String.raw`\b(${IDENTIFIER})\s*=\s*\(?\s*await\s+${CALL}`, 'g'))) {
      if (isLoader(match[2], match[3])) library.add(match[1]);
    }
    // `x = load()` without await: a promise of the library.
    for (const match of code.matchAll(new RegExp(String.raw`\b(${IDENTIFIER})\s*=\s*(?!await\b)${CALL}`, 'g'))) {
      if (isLoader(match[2], match[3])) promises.add(match[1]);
    }
    // `x = await pending`.
    for (const match of code.matchAll(new RegExp(String.raw`\b(${IDENTIFIER})\s*=\s*\(?\s*await\s+(${IDENTIFIER})\s*\)?\s*[;\n]`, 'g'))) {
      if (promises.has(match[2])) library.add(match[1]);
    }
    // `const load = engine.loadEngine`.
    for (const match of code.matchAll(
      new RegExp(String.raw`\b(${IDENTIFIER})\s*=\s*(${IDENTIFIER})\s*\.\s*(${IDENTIFIER})\s*[;\n]`, 'g'),
    )) {
      if (modules.has(match[2])) loaders.add(match[1]);
    }
    // Plain aliases of any tracked binding.
    for (const match of code.matchAll(new RegExp(String.raw`\b(${IDENTIFIER})\s*=\s*\(?\s*(${IDENTIFIER})\s*\)?\s*[;\n,]`, 'g'))) {
      for (const set of sets) if (set.has(match[2])) set.add(match[1]);
    }
    // `.then` callbacks on a loader call or on a tracked promise.
    for (const match of code.matchAll(new RegExp(String.raw`${CALL}[^()]*\)\s*${thenCallback}`, 'g'))) {
      if (isLoader(match[1], match[2])) takeCallback(match, 3);
    }
    for (const match of code.matchAll(new RegExp(String.raw`(?<![\w$.])(${IDENTIFIER})\s*${thenCallback}`, 'g'))) {
      if (promises.has(match[1])) takeCallback(match, 2);
    }
    // Properties the library is stored under: `{ engine }`, `{ key: engine }`, `obj.key = engine`.
    for (const binding of library) {
      const name = escapeRegExp(binding);
      for (const match of code.matchAll(new RegExp(String.raw`(${IDENTIFIER})\s*:\s*${name}(?![\w$])`, 'g'))) properties.add(match[1]);
      for (const match of code.matchAll(new RegExp(String.raw`\.\s*(${IDENTIFIER})\s*=\s*${name}(?![\w$])`, 'g'))) properties.add(match[1]);
      if (new RegExp(String.raw`[{,]\s*${name}\s*(?=[,}])`).test(code)) properties.add(binding);
    }
  }
  return { modules, loaders, promises, library, properties, destructuredStages };
}

/** Whether a file hands a tracked engine binding onward, so requiring it is requiring the engine. */
function reexportsEngine(file, code, engineModules) {
  for (const match of code.matchAll(
    new RegExp(String.raw`\b(?:module\.)?exports(?:\s*\.\s*${IDENTIFIER})?\s*=\s*(?:\{\s*\.\.\.\s*)?${REQUIRE_CALL}`, 'g'),
  )) {
    if (namesModule(file, match[1], engineModules)) return true;
  }
  const { modules, loaders, promises, library } = trackBindings(file, code, engineModules);
  const tracked = new Set([...modules, ...loaders, ...promises, ...library]);
  for (const match of code.matchAll(new RegExp(String.raw`\b(?:module\.)?exports(?:\s*\.\s*${IDENTIFIER})?\s*=\s*(${IDENTIFIER})`, 'g'))) {
    if (tracked.has(match[1])) return true;
  }
  for (const match of code.matchAll(/\bmodule\.exports\s*=\s*\{([^{}]*)\}/g)) {
    for (const part of match[1].split(',')) {
      const value = (part.includes(':') ? part.split(':')[1] : part).replace('...', '').trim();
      if (tracked.has(value)) return true;
    }
  }
  return false;
}

/** Every `compile` reached through a tracked binding in one file. */
function compileViolations(file, code, engineModules) {
  const violations = [];
  const report = (offset, message) => violations.push({ line: lineAt(code, offset), rule: 'engine-stage', message });
  const tracked = trackBindings(file, code, engineModules);
  for (const { offset, source } of tracked.destructuredStages) report(offset, `destructures "${TRACKED_STAGE}" from ${source}`);

  for (const binding of [...tracked.modules, ...tracked.library]) {
    const name = escapeRegExp(binding);
    for (const match of code.matchAll(new RegExp(String.raw`(?<![\w$.])${name}${STAGE_ACCESS}`, 'g'))) {
      report(match.index, `reaches "${TRACKED_STAGE}" through engine binding "${binding}"`);
    }
    for (const match of code.matchAll(new RegExp(String.raw`\{([^{}]*)\}\s*=\s*\(?\s*${name}(?![\w$])`, 'g'))) {
      if (destructuredKeys(match[1]).includes(TRACKED_STAGE)) {
        report(match.index, `destructures "${TRACKED_STAGE}" from engine binding "${binding}"`);
      }
    }
  }
  for (const property of tracked.properties) {
    for (const match of code.matchAll(new RegExp(String.raw`\.\s*${escapeRegExp(property)}${STAGE_ACCESS}`, 'g'))) {
      report(match.index, `reaches "${TRACKED_STAGE}" through property "${property}", which holds the engine library`);
    }
  }
  for (const match of code.matchAll(new RegExp(String.raw`\(\s*await\s+${CALL}[^()]*\)\s*\)${STAGE_ACCESS}`, 'g'))) {
    const isLoader = match[1] === undefined ? tracked.loaders.has(match[2]) : tracked.modules.has(match[1]);
    if (isLoader) report(match.index, `reaches "${TRACKED_STAGE}" on an awaited engine load`);
  }
  return violations;
}

/**
 * Every boundary violation under a `cli/` tree.
 *
 * @param {string} cliRoot
 * @returns {{ violations: Array<{ file: string, line: number, rule: string, message: string }>, engineImports: string[] }}
 */
function scanCli(cliRoot) {
  const engineFile = path.join(cliRoot, ENGINE_MODULE);
  const runtimeDirectory = path.join(cliRoot, RUNTIME_DIRECTORY) + path.sep;
  const runtimeBin = path.join(cliRoot, RUNTIME_BIN);
  const violations = [];
  const engineImports = [];
  const sources = new Map();

  for (const file of filesUnder(cliRoot)) {
    const relative = path.relative(path.dirname(cliRoot), file).split(path.sep).join('/');
    const raw = fs.readFileSync(file, 'utf8');
    if (file.startsWith(runtimeDirectory)) {
      let offset = raw.indexOf(FORBIDDEN_CONFIG);
      while (offset !== -1) {
        violations.push({ file: relative, line: lineAt(raw, offset), rule: 'bmad-config', message: `names "${FORBIDDEN_CONFIG}"` });
        offset = raw.indexOf(FORBIDDEN_CONFIG, offset + 1);
      }
    }
    if (!SOURCE_EXTENSIONS.has(path.extname(file))) continue;
    sources.set(file, { relative, code: stripComments(raw), bare: codeOnly(raw) });
  }

  // Modules that hand the engine onward, to a fixed point across files.
  const engineModules = new Set([engineFile]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [file, { code }] of sources) {
      if (!engineModules.has(file) && reexportsEngine(file, code, engineModules)) {
        engineModules.add(file);
        grew = true;
      }
    }
  }

  for (const [file, { relative, code, bare }] of sources) {
    const add = (offset, rule, message, text = code) => violations.push({ file: relative, line: lineAt(text, offset), rule, message });

    for (const match of code.matchAll(ENGINE_IMPORT)) {
      if (file === engineFile) engineImports.push(relative);
      else add(match.index, 'engine-import', `names eval-quality in "${match[0]}"; only cli/lib/evaluate/engine.js may`);
    }

    if (file.startsWith(runtimeDirectory) || file === runtimeBin) {
      for (const match of code.matchAll(ANY_CALL_SPECIFIER)) {
        if (!LITERAL_SPECIFIER.test(code.slice(match.index + match[0].length))) {
          add(
            match.index,
            'dynamic-specifier',
            `"${match[0]}" takes a computed specifier; the runtime names every module it loads as a string literal`,
          );
        }
      }
    }

    for (const match of bare.matchAll(ALWAYS_IDENTIFIER)) add(match.index, 'engine-stage', `names "${match[1]}"`, bare);
    for (const match of code.matchAll(ALWAYS_BRACKET)) add(match.index, 'engine-stage', `reaches "${match[2]}" by bracket access`);

    if (file === engineFile) {
      const inside = new RegExp(
        String.raw`(?:\?\.|\.)\s*${TRACKED_STAGE}(?![\w$])|\[\s*${QUOTE}${TRACKED_STAGE}${QUOTE}\s*\]|\{[^{}]*(?<![\w$])${TRACKED_STAGE}(?![\w$])[^{}]*\}\s*=`,
        'g',
      );
      for (const match of code.matchAll(inside)) add(match.index, 'engine-stage', `the engine module reaches "${TRACKED_STAGE}"`);
    } else {
      for (const violation of compileViolations(file, code, engineModules)) violations.push({ file: relative, ...violation });
    }
  }
  return { violations, engineImports };
}

// ---------------------------------------------------------------------------

const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

const ENGINE_STUB = `'use strict';\nfunction loadEngine() { return import('eval-quality'); }\nmodule.exports = { loadEngine };\n`;
const LOADER = "const { loadEngine } = require('./engine');\n";

/** Each plant is written beside the engine stub (with any `extra` files) and must be reported under its rule, at its file, and nowhere else. */
const PLANTS = [
  {
    name: 'a second synchronous require',
    rule: 'engine-import',
    file: 'lib/evaluate/other.js',
    source: "const eq = require('eval-quality');\n",
  },
  {
    name: 'a dynamic import of a subpath',
    rule: 'engine-import',
    file: 'other-runner.js',
    source: "async function f() { return import('eval-quality/adapters'); }\nmodule.exports = { f };\n",
  },
  {
    name: 'require.resolve of the engine',
    rule: 'engine-import',
    file: 'lib/other.js',
    source: "const where = require.resolve('eval-quality/package.json');\n",
  },
  {
    name: 'a static import in an ES module',
    rule: 'engine-import',
    file: 'lib/other.mjs',
    source: "import { digestArtifact } from 'eval-quality';\n",
  },
  { name: 'a bare side-effect import', rule: 'engine-import', file: 'lib/side.mjs', source: "import 'eval-quality';\n" },
  {
    name: 'a computed require specifier under the runtime',
    rule: 'dynamic-specifier',
    file: 'lib/evaluate/computed.js',
    source: "const name = 'engine';\nconst engine = require('./' + name);\n",
  },
  {
    name: 'a computed import specifier in the bin',
    rule: 'dynamic-specifier',
    file: 'evaluate.js',
    source: "const which = 'eval' + '-quality';\nasync function f() { return import(which); }\nmodule.exports = { f };\n",
  },
  {
    name: 'runScore on the engine module',
    rule: 'engine-stage',
    file: 'lib/evaluate/score.js',
    source: "const engine = require('./engine');\nengine.runScore({});\n",
  },
  {
    name: 'seal destructured from the engine module',
    rule: 'engine-stage',
    file: 'lib/evaluate/seal.js',
    source: "const { seal } = require('./engine');\n",
  },
  {
    name: 'runScore through a member chain (the check.js shape)',
    rule: 'engine-stage',
    file: 'lib/evaluate/chain.js',
    source: `${LOADER}async function f() {\n  const engine = await loadEngine();\n  const context = { engine };\n  return context.engine.runScore({});\n}\nmodule.exports = { f };\n`,
  },
  {
    name: 'runScore in a .then callback',
    rule: 'engine-stage',
    file: 'lib/evaluate/then.js',
    source: `${LOADER}function f() {\n  return loadEngine().then((m) => m.runScore());\n}\nmodule.exports = { f };\n`,
  },
  {
    name: 'preflightFromObservations on a library passed as an argument',
    rule: 'engine-stage',
    file: 'lib/evaluate/argument.js',
    source: `${LOADER}function helper(library) {\n  return library.preflightFromObservations({});\n}\nasync function f() {\n  return helper(await loadEngine());\n}\nmodule.exports = { f };\n`,
  },
  {
    name: 'seal by bracket string',
    rule: 'engine-stage',
    file: 'lib/evaluate/bracket.js',
    source: `${LOADER}async function f() {\n  const eq = await loadEngine();\n  return eq['seal']({});\n}\nmodule.exports = { f };\n`,
  },
  {
    name: 'runScore named in engine.js itself',
    rule: 'engine-stage',
    file: 'lib/evaluate/engine.js',
    source: `${ENGINE_STUB}async function score() { return (await loadEngine()).runScore({}); }\nmodule.exports.score = score;\n`,
  },
  {
    name: 'compile named in engine.js itself',
    rule: 'engine-stage',
    file: 'lib/evaluate/engine.js',
    source: `${ENGINE_STUB}async function build(contract) { return (await loadEngine()).compile(contract); }\nmodule.exports.build = build;\n`,
  },
  {
    name: 'compile through a member chain (the check.js shape)',
    rule: 'engine-stage',
    file: 'lib/evaluate/chain-compile.js',
    source: `${LOADER}async function build() {\n  const engine = await loadEngine();\n  return { engine, other: 1 };\n}\nasync function f() {\n  const context = await build();\n  return context.engine.compile({});\n}\nmodule.exports = { f };\n`,
  },
  {
    name: 'compile on a .then callback parameter',
    rule: 'engine-stage',
    file: 'lib/evaluate/then-compile.js',
    source: `${LOADER}function f() {\n  return loadEngine().then((m) => m.compile({}));\n}\nmodule.exports = { f };\n`,
  },
  {
    name: 'compile destructured in a .then callback',
    rule: 'engine-stage',
    file: 'lib/evaluate/then-destructure.js',
    source: `${LOADER}function f() {\n  return loadEngine().then(({ compile }) => compile({}));\n}\nmodule.exports = { f };\n`,
  },
  {
    name: 'compile on a .then of a stored promise',
    rule: 'engine-stage',
    file: 'lib/evaluate/promise.js',
    source: `${LOADER}const pending = loadEngine();\nfunction f() {\n  return pending.then(function (m) { return m.compile({}); });\n}\nmodule.exports = { f };\n`,
  },
  {
    name: 'compile on a parenthesized await',
    rule: 'engine-stage',
    file: 'lib/evaluate/paren.js',
    source:
      "const e = require('./engine');\nasync function f() {\n  const m = (await e.loadEngine());\n  return m.compile({});\n}\nmodule.exports = { f };\n",
  },
  {
    name: 'compile on a parenthesized awaited load',
    rule: 'engine-stage',
    file: 'lib/evaluate/chained.js',
    source: `${LOADER}async function f() {\n  return (await loadEngine()).compile({});\n}\nmodule.exports = { f };\n`,
  },
  {
    name: 'compile by bracket through an alias',
    rule: 'engine-stage',
    file: 'lib/evaluate/alias.js',
    source: `${LOADER}async function f() {\n  const eq = await loadEngine();\n  const again = eq;\n  return again['compile']({});\n}\nmodule.exports = { f };\n`,
  },
  {
    name: 'compile destructured from the engine module',
    rule: 'engine-stage',
    file: 'lib/evaluate/destructure.js',
    source: "const { compile } = require('./engine');\n",
  },
  {
    name: 'compile through a re-export module',
    rule: 'engine-stage',
    file: 'lib/evaluate/consumer.js',
    extra: { 'lib/evaluate/reexport.js': "module.exports = require('./engine');\n" },
    source:
      "const eng = require('./reexport');\nasync function f() {\n  const eq = await eng.loadEngine();\n  return eq.compile({});\n}\nmodule.exports = { f };\n",
  },
  {
    name: 'compile through a re-exported loader, two modules deep',
    rule: 'engine-stage',
    file: 'consumer.js',
    extra: {
      'lib/evaluate/first.js': `${LOADER}module.exports = { loadEngine };\n`,
      'lib/second.js': "module.exports = { ...require('./evaluate/first') };\n",
    },
    source:
      "const { loadEngine } = require('./lib/second');\nasync function f() {\n  const eq = await loadEngine();\n  return eq.compile({});\n}\nmodule.exports = { f };\n",
  },
  {
    name: 'a _bmad path under the runtime',
    rule: 'bmad-config',
    file: 'lib/evaluate/config.js',
    source: "const CONFIG = '_bmad/tea/config.yaml';\nmodule.exports = { CONFIG };\n",
  },
];

/** Legitimate use: the engine's digests, Ajv's own compile, a `.then` on the library, and the stage names in comments and messages. */
const CLEAN_PLANT = {
  file: 'lib/evaluate/legit.js',
  source: [
    "// require('eval-quality') is what engine.js does, and runScore is the CLI's; this comment is not a call.",
    "const Ajv = require('ajv/dist/2020');",
    "const engine = require('./engine');",
    'async function f(schema) {',
    '  const ajv = new Ajv();',
    '  const validate = ajv.compile(schema);',
    '  const eq = await engine.loadEngine();',
    '  const context = { eq, validate };',
    '  const digest = await engine.loadEngine().then((m) => m.digestArtifact([], "x"));',
    "  const message = 'run eval-quality seal and runScore through the CLI';",
    '  return [context.validate, eq.digestArtifact([], "x"), digest, message, engine.engineCliPath(), ajv.compile(schema)];',
    '}',
    'module.exports = { f };',
    '',
  ].join('\n'),
};

function plantedTree(plant) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-evaluate-boundaries-'));
  const cliRoot = path.join(root, 'cli');
  fs.mkdirSync(path.join(cliRoot, RUNTIME_DIRECTORY), { recursive: true });
  fs.writeFileSync(path.join(cliRoot, ENGINE_MODULE), ENGINE_STUB);
  for (const [file, source] of Object.entries({ ...plant.extra, [plant.file]: plant.source })) {
    const target = path.join(cliRoot, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, source);
  }
  return { root, cliRoot };
}

function proveScanner() {
  for (const plant of PLANTS) {
    const { root, cliRoot } = plantedTree(plant);
    try {
      const { violations } = scanCli(cliRoot);
      const expectedFile = `cli/${plant.file}`;
      check(
        violations.some((violation) => violation.rule === plant.rule && violation.file === expectedFile),
        `the scanner missed ${plant.name} (${plant.rule} in ${expectedFile}); it reported ${JSON.stringify(violations)}`,
      );
      check(
        violations.every((violation) => violation.file === expectedFile),
        `the scanner reported a file other than the planted one for ${plant.name}: ${JSON.stringify(violations)}`,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
  const { root, cliRoot } = plantedTree(CLEAN_PLANT);
  try {
    const { violations, engineImports } = scanCli(cliRoot);
    check(violations.length === 0, `the scanner reported legitimate engine and Ajv use: ${JSON.stringify(violations)}`);
    check(engineImports.length === 1, `the scanner did not see the engine module's own import: ${JSON.stringify(engineImports)}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function scanRepository() {
  const { violations, engineImports } = scanCli(CLI_ROOT);
  for (const violation of violations) {
    check(false, `${violation.file}:${violation.line} [${violation.rule}] ${violation.message}`);
  }
  check(engineImports.length > 0, 'cli/lib/evaluate/engine.js names eval-quality nowhere; the runtime has no door to the engine');
}

function main() {
  proveScanner();
  scanRepository();
  if (failures.length > 0) {
    console.error(`${colors.red}${failures.length} of ${checks} tea-evaluate boundary check(s) failed:${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log(`${colors.green}ok${colors.reset} all ${checks} tea-evaluate boundary check(s) passed`);
  return 0;
}

if (require.main === module) process.exitCode = main();

module.exports = { codeOnly, scanCli, stripComments };
