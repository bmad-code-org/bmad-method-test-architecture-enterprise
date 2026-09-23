/**
 * The engine boundary of `tea-evaluate`, held over every file under `cli/`.
 *
 * Three rules (Story 1.4, AD-1, AD-5, AD-6):
 *
 * - `engine-import`: only `cli/lib/evaluate/engine.js` names `eval-quality` in
 *   an `import(`, `require(` or `require.resolve(` call or an `import ... from`,
 *   subpaths included. Every other file reaches the engine through that module.
 * - `engine-stage`: no binding obtained from the engine reaches `runScore`,
 *   `preflightFromObservations`, `compile` or `seal`, whether by member access,
 *   bracket access or destructuring. Those stages decide enforced verdicts,
 *   which come only from the eval-quality CLI over persisted files. Bindings are
 *   tracked from `require(...)` of `engine.js`, from awaited results of its
 *   loader, and through plain aliases, so `ajv.compile` stays legal. Inside
 *   `engine.js`, where every value comes from the engine, any such access fails.
 * - `bmad-config`: the string `_bmad` appears nowhere under
 *   `cli/lib/evaluate/`, since the runtime reads no BMAD configuration.
 *
 * The scanner proves itself first: each rule is planted alone in a temp copy
 * of a `cli/` tree and must be reported, and a planted file using the engine
 * and Ajv legitimately must not be, so the real scan cannot pass vacuously.
 * Later stories extend this test.
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
const SOURCE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs']);
const FORBIDDEN_STAGES = ['runScore', 'preflightFromObservations', 'compile', 'seal'];
const FORBIDDEN_CONFIG = '_bmad';

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };

const IDENTIFIER = String.raw`[A-Za-z_$][\w$]*`;
const STAGE = `(?:${FORBIDDEN_STAGES.join('|')})`;
const ENGINE_IMPORT = new RegExp(
  String.raw`(?:\b(?:require(?:\s*\.\s*resolve)?|import)\s*\(\s*|\bfrom\s+)(['"\x60])eval-quality(?:/[^'"\x60]*)?\1`,
  'g',
);

function escapeRegExp(text) {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * The source with every comment blanked to spaces, newlines kept, so a comment
 * that mentions a pattern is not a call, and match offsets still map to lines.
 */
function stripComments(source) {
  let out = '';
  let index = 0;
  let quote = null;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (quote !== null) {
      out += char;
      if (char === '\\') {
        out += next ?? '';
        index += 2;
        continue;
      }
      if (char === quote) quote = null;
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

/** Whether a `require` specifier written in `file` names the engine module. */
function namesEngineModule(file, specifier, engineFile) {
  if (!specifier.startsWith('.')) return false;
  const resolved = path.resolve(path.dirname(file), specifier);
  return resolved === engineFile || `${resolved}.js` === engineFile;
}

/** Keys a destructuring pattern `{ a, b: c, ...rest }` reads. */
function destructuredKeys(pattern) {
  return pattern
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !part.startsWith('...'))
    .map((part) => {
      const key = part.split(/[:=]/)[0].trim();
      return key.replaceAll(/^\[?\s*['"\u0060]?|['"\u0060]?\s*\]?$/g, '');
    });
}

function destructuredLocals(pattern) {
  return pattern
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !part.startsWith('...'))
    .map((part) => (part.includes(':') ? part.split(':')[1] : part).split('=')[0].trim());
}

/**
 * Tracks engine bindings in one file and returns every access that reaches a
 * forbidden stage.
 */
function stageViolations(file, code, engineFile) {
  const violations = [];
  const report = (offset, message) => violations.push({ line: lineAt(code, offset), rule: 'engine-stage', message });
  const moduleBindings = new Set();
  const loaders = new Set();
  const libraryBindings = new Set();

  const requireCall = String.raw`require\s*\(\s*(['"\x60])([^'"\x60]+)\2\s*\)`;
  for (const match of code.matchAll(new RegExp(String.raw`\b(?:const|let|var)\s+(${IDENTIFIER})\s*=\s*${requireCall}`, 'g'))) {
    if (namesEngineModule(file, match[3], engineFile)) moduleBindings.add(match[1]);
  }
  for (const match of code.matchAll(new RegExp(String.raw`\b(?:const|let|var)\s*\{([^{}]*)\}\s*=\s*${requireCall}`, 'g'))) {
    if (!namesEngineModule(file, match[3], engineFile)) continue;
    for (const key of destructuredKeys(match[1])) {
      if (FORBIDDEN_STAGES.includes(key)) report(match.index, `destructures "${key}" from the engine module`);
    }
    for (const local of destructuredLocals(match[1])) loaders.add(local);
  }

  const awaitedCall = String.raw`await\s+(?:(${IDENTIFIER})\s*(?:\?\.|\.)\s*)?(${IDENTIFIER})\s*\(`;
  const isLoaderCall = (receiver, callee) => (receiver === undefined ? loaders.has(callee) : moduleBindings.has(receiver));

  // Awaited loader results, and plain aliases of any tracked binding, to a fixed point.
  let size = -1;
  while (size !== moduleBindings.size + libraryBindings.size) {
    size = moduleBindings.size + libraryBindings.size;
    for (const match of code.matchAll(new RegExp(String.raw`\b(${IDENTIFIER})\s*=\s*${awaitedCall}`, 'g'))) {
      if (isLoaderCall(match[2], match[3])) libraryBindings.add(match[1]);
    }
    for (const match of code.matchAll(new RegExp(String.raw`\b(?:const|let|var)?\s*(${IDENTIFIER})\s*=\s*(${IDENTIFIER})\s*[;\n]`, 'g'))) {
      if (moduleBindings.has(match[2])) moduleBindings.add(match[1]);
      if (libraryBindings.has(match[2])) libraryBindings.add(match[1]);
    }
  }

  for (const match of code.matchAll(new RegExp(String.raw`\{([^{}]*)\}\s*=\s*${awaitedCall}`, 'g'))) {
    if (!isLoaderCall(match[2], match[3])) continue;
    for (const key of destructuredKeys(match[1])) {
      if (FORBIDDEN_STAGES.includes(key)) report(match.index, `destructures "${key}" from the engine library`);
    }
  }
  for (const match of code.matchAll(
    new RegExp(
      String.raw`\(\s*${awaitedCall}[^()]*\)\s*\)\s*(?:(?:\?\.|\.)\s*(${STAGE})\b|(?:\?\.)?\[\s*(['"\x60])(${STAGE})\5\s*\])`,
      'g',
    ),
  )) {
    if (isLoaderCall(match[1], match[2])) report(match.index, `reaches "${match[3] ?? match[6]}" on an awaited engine load`);
  }

  for (const binding of [...moduleBindings, ...libraryBindings]) {
    const name = escapeRegExp(binding);
    const access = new RegExp(
      String.raw`(?<![\w$.])${name}\s*(?:(?:\?\.|\.)\s*(${STAGE})\b|(?:\?\.)?\[\s*(['"\x60])(${STAGE})\2\s*\])`,
      'g',
    );
    for (const match of code.matchAll(access)) report(match.index, `reaches "${match[1] ?? match[3]}" through engine binding "${binding}"`);
    const destructure = new RegExp(String.raw`\{([^{}]*)\}\s*=\s*${name}\b`, 'g');
    for (const match of code.matchAll(destructure)) {
      for (const key of destructuredKeys(match[1])) {
        if (FORBIDDEN_STAGES.includes(key)) report(match.index, `destructures "${key}" from engine binding "${binding}"`);
      }
    }
  }
  return violations;
}

/** Inside engine.js every value comes from the engine, so any reach for a stage fails. */
function engineModuleViolations(code) {
  const violations = [];
  const pattern = new RegExp(String.raw`(?:\?\.|\.)\s*(${STAGE})\b|\[\s*(['"\x60])(${STAGE})\2\s*\]|\{[^}]*\b(${STAGE})\b[^}]*\}\s*=`, 'g');
  for (const match of code.matchAll(pattern)) {
    violations.push({
      line: lineAt(code, match.index),
      rule: 'engine-stage',
      message: `the engine module reaches "${match[1] ?? match[3] ?? match[4]}"`,
    });
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
  const violations = [];
  const engineImports = [];
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
    const code = stripComments(raw);
    for (const match of code.matchAll(ENGINE_IMPORT)) {
      if (file === engineFile) {
        engineImports.push(relative);
        continue;
      }
      violations.push({
        file: relative,
        line: lineAt(code, match.index),
        rule: 'engine-import',
        message: `names eval-quality in "${match[0]}"; only cli/${ENGINE_MODULE.split(path.sep).join('/')} may`,
      });
    }
    const found = file === engineFile ? engineModuleViolations(code) : stageViolations(file, code, engineFile);
    for (const violation of found) violations.push({ file: relative, ...violation });
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

/** One planted file per rule; each must be reported under its own rule, at its own file. */
const PLANTS = [
  {
    name: 'a second synchronous require',
    file: 'lib/evaluate/other.js',
    rule: 'engine-import',
    source: "const eq = require('eval-quality');\n",
  },
  {
    name: 'a dynamic import of a subpath',
    file: 'other-runner.js',
    rule: 'engine-import',
    source: "async function f() { return import('eval-quality/adapters'); }\nmodule.exports = { f };\n",
  },
  {
    name: 'require.resolve of the engine',
    file: 'lib/other.js',
    rule: 'engine-import',
    source: "const where = require.resolve('eval-quality/package.json');\n",
  },
  {
    name: 'a static import in an ES module',
    file: 'lib/other.mjs',
    rule: 'engine-import',
    source: "import { digestArtifact } from 'eval-quality';\n",
  },
  {
    name: 'member access on the engine module',
    file: 'lib/evaluate/score.js',
    rule: 'engine-stage',
    source: "const engine = require('./engine');\nengine.runScore({});\n",
  },
  {
    name: 'destructuring a stage from the engine module',
    file: 'lib/evaluate/seal.js',
    rule: 'engine-stage',
    source: "const { seal } = require('./engine');\n",
  },
  {
    name: 'bracket access on the engine module',
    file: 'lib/evaluate/compile.js',
    rule: 'engine-stage',
    source: "const engine = require('./engine.js');\nengine['compile']({});\n",
  },
  {
    name: 'member access on an awaited loader result',
    file: 'lib/evaluate/preflight.js',
    rule: 'engine-stage',
    source:
      "const { loadEngine } = require('./engine');\nasync function f() {\n  const eq = await loadEngine();\n  return eq.preflightFromObservations({});\n}\nmodule.exports = { f };\n",
  },
  {
    name: 'destructuring from an awaited loader result through the module',
    file: 'evaluate-extra.js',
    rule: 'engine-stage',
    source:
      "const engine = require('./lib/evaluate/engine');\nasync function f() {\n  const { runScore } = await engine.loadEngine();\n  return runScore;\n}\nmodule.exports = { f };\n",
  },
  {
    name: 'a stage on a parenthesized awaited load',
    file: 'lib/evaluate/chained.js',
    rule: 'engine-stage',
    source:
      "const { loadEngine } = require('./engine');\nasync function f() {\n  return (await loadEngine()).seal({});\n}\nmodule.exports = { f };\n",
  },
  {
    name: 'a stage through an alias of the library',
    file: 'lib/evaluate/alias.js',
    rule: 'engine-stage',
    source:
      "const { loadEngine } = require('./engine');\nasync function f() {\n  const eq = await loadEngine();\n  const again = eq;\n  return again['compile']({});\n}\nmodule.exports = { f };\n",
  },
  {
    name: 'the engine module itself reaching a stage',
    file: 'lib/evaluate/engine.js',
    rule: 'engine-stage',
    source: `${ENGINE_STUB}async function score() { return (await loadEngine()).runScore({}); }\nmodule.exports.score = score;\n`,
  },
  {
    name: 'a _bmad path under the runtime',
    file: 'lib/evaluate/config.js',
    rule: 'bmad-config',
    source: "const CONFIG = '_bmad/tea/config.yaml';\nmodule.exports = { CONFIG };\n",
  },
];

/** Legitimate use: the engine's digests, Ajv's own compile, and a comment naming the engine. */
const CLEAN_PLANT = {
  file: 'lib/evaluate/legit.js',
  source: [
    "// require('eval-quality') is what engine.js does; this comment is not a call.",
    "const Ajv = require('ajv/dist/2020');",
    "const engine = require('./engine');",
    'async function f(schema) {',
    '  const ajv = new Ajv();',
    '  const validate = ajv.compile(schema);',
    '  const eq = await engine.loadEngine();',
    '  const sealed = { seal: true };',
    '  return [validate, eq.digestArtifact([], "x"), sealed.seal, engine.engineCliPath()];',
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
  const target = path.join(cliRoot, plant.file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, plant.source);
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

module.exports = { scanCli, stripComments };
