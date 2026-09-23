/**
 * The engine boundary of `tea-evaluate`, held over every file under `cli/`.
 *
 * Every `.js`, `.cjs` and `.mjs` file is parsed with acorn (`.mjs` as a module,
 * the others as a script with a module fallback), so comments, string text,
 * regular expression literals and template text are never mistaken for code,
 * and code inside a template `${...}` is always seen. A file that does not
 * parse is a `parse` violation, never a silent skip. The rules are closed:
 * none of them tracks where a value came from.
 *
 * Five rules (Story 1.4, AD-1, AD-5, AD-6):
 *
 * - `engine-import`: only `cli/lib/evaluate/engine.js` loads a specifier that
 *   is `eval-quality`, starts with `eval-quality/` or contains
 *   `node_modules/eval-quality`. A load is a `require(...)`,
 *   `require.resolve(...)`, `module.require(...)`, `import(...)`, a static
 *   `import`/`export ... from`, a bare `import '...'`, or a call (or
 *   `.resolve` call) through a binding obtained from `createRequire(...)`.
 * - `dynamic-specifier`: under `cli/lib/evaluate/` and in `cli/evaluate.js`,
 *   every load takes a string literal or a template literal with no `${...}`.
 * - `engine-stage`: the stages that decide enforced verdicts come only from the
 *   eval-quality CLI over persisted files.
 *   - `runScore`, `preflightFromObservations` and `seal` fail anywhere under
 *     `cli/`, `engine.js` included, as an identifier, a member property (dot,
 *     or a bracket string or static template), an object-pattern key, or an
 *     import or export specifier. `Object.seal` is the one exemption.
 *   - `compile` as a member property or an object-pattern key fails everywhere
 *     under `cli/` unless its receiver is an identifier every binding of which
 *     is a `new X(...)` of Ajv (`X` bound to `require('ajv')` or
 *     `require('ajv/dist/2020')`, or to `Y.default ?? Y` of one), or an alias of
 *     such an identifier. Importing a `compile` specifier fails too.
 * - `bmad-config`: the string `_bmad` appears nowhere under
 *   `cli/lib/evaluate/`, since the runtime reads no BMAD configuration.
 *
 * The scanner proves itself first: each violating form, including every
 * evasion a review found, is planted in a temp copy of a `cli/` tree and must
 * be reported, and each legitimate form is planted and must scan clean, so the
 * real scan cannot pass vacuously. Later stories extend this test.
 *
 * Usage: node test/test-evaluate-boundaries.js
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const acorn = require('acorn');

const PROJECT_ROOT = path.join(__dirname, '..');
const CLI_ROOT = path.join(PROJECT_ROOT, 'cli');
const ENGINE_MODULE = path.join('lib', 'evaluate', 'engine.js');
const RUNTIME_DIRECTORY = path.join('lib', 'evaluate');
const RUNTIME_BIN = 'evaluate.js';
const SOURCE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs']);
const ALWAYS_FORBIDDEN = new Set(['runScore', 'preflightFromObservations', 'seal']);
const AJV_STAGE = 'compile';
const AJV_MODULES = new Set(['ajv', 'ajv/dist/2020']);
const CREATE_REQUIRE = 'createRequire';
const FORBIDDEN_CONFIG = '_bmad';
const UNKNOWN = Symbol('unknown binding');
const AJV_IMPORT = Symbol('ajv import');

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };

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

/** The file's syntax tree: `.mjs` as a module, anything else as a script and then as a module. Throws when neither parses. */
function parseSource(file, source) {
  const options = { ecmaVersion: 'latest', locations: true, allowHashBang: true };
  if (path.extname(file) === '.mjs') return acorn.parse(source, { ...options, sourceType: 'module' });
  try {
    return acorn.parse(source, { ...options, sourceType: 'script' });
  } catch (scriptError) {
    try {
      return acorn.parse(source, { ...options, sourceType: 'module' });
    } catch {
      throw scriptError;
    }
  }
}

/** Calls `visit(node, parent)` for every node under `root`. */
function walk(root, visit) {
  const stack = [[root, null]];
  while (stack.length > 0) {
    const [node, parent] = stack.pop();
    visit(node, parent);
    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc') continue;
      const children = Array.isArray(value) ? value : [value];
      for (const child of children) {
        if (child !== null && typeof child === 'object' && typeof child.type === 'string') stack.push([child, node]);
      }
    }
  }
}

/** The value of a string literal or of a template literal with no `${...}`; otherwise undefined. */
function staticString(node) {
  if (node === null || node === undefined) return;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked ?? undefined;
  return;
}

/** The property a member expression names, when it is fixed in the source. */
function memberKey(node) {
  if (node.computed) return staticString(node.property);
  return node.property.type === 'Identifier' || node.property.type === 'PrivateIdentifier' ? node.property.name : undefined;
}

/** The key a property (of an object literal or pattern) names, when it is fixed in the source. */
function propertyKey(node) {
  if (node.computed) return staticString(node.key);
  if (node.key.type === 'Identifier') return node.key.name;
  if (node.key.type === 'Literal') return String(node.key.value);
  return;
}

/** The name an import or export specifier's side names. */
function specifierName(node) {
  if (node === null || node === undefined) return;
  return node.type === 'Identifier' ? node.name : staticString(node);
}

function isIdentifier(node, name) {
  return node !== null && node !== undefined && node.type === 'Identifier' && node.name === name;
}

/** Every identifier a binding pattern declares. */
function patternNames(pattern) {
  if (pattern === null || pattern === undefined) return [];
  switch (pattern.type) {
    case 'Identifier': {
      return [pattern.name];
    }
    case 'ObjectPattern': {
      return pattern.properties.flatMap((property) => patternNames(property.type === 'RestElement' ? property.argument : property.value));
    }
    case 'ArrayPattern': {
      return pattern.elements.flatMap((element) => patternNames(element));
    }
    case 'AssignmentPattern': {
      return patternNames(pattern.left);
    }
    case 'RestElement': {
      return patternNames(pattern.argument);
    }
    default: {
      return [];
    }
  }
}

/**
 * Every value each name in one file is ever bound or assigned to, by name and
 * across scopes, so a shadowing parameter or a second assignment counts
 * against the name. `UNKNOWN` stands for a value the source does not show.
 */
function bindingValues(ast) {
  const values = new Map();
  const add = (name, value) => {
    if (!values.has(name)) values.set(name, []);
    values.get(name).push(value);
  };
  const unknown = (pattern) => {
    for (const name of patternNames(pattern)) add(name, UNKNOWN);
  };
  walk(ast, (node) => {
    switch (node.type) {
      case 'VariableDeclarator': {
        if (node.id.type === 'Identifier') {
          if (node.init !== null) add(node.id.name, node.init);
        } else unknown(node.id);
        break;
      }
      case 'AssignmentExpression': {
        if (node.left.type === 'Identifier') add(node.left.name, node.operator === '=' ? node.right : UNKNOWN);
        else unknown(node.left);
        break;
      }
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression': {
        if (node.id) unknown(node.id);
        for (const parameter of node.params) unknown(parameter);
        break;
      }
      case 'ClassDeclaration':
      case 'ClassExpression': {
        if (node.id) unknown(node.id);
        break;
      }
      case 'CatchClause': {
        unknown(node.param);
        break;
      }
      case 'ForInStatement':
      case 'ForOfStatement': {
        if (node.left.type === 'VariableDeclaration') for (const declaration of node.left.declarations) unknown(declaration.id);
        else unknown(node.left);
        break;
      }
      case 'UpdateExpression': {
        unknown(node.argument);
        break;
      }
      case 'ImportDeclaration': {
        const fromAjv = AJV_MODULES.has(node.source.value);
        for (const specifier of node.specifiers) {
          add(specifier.local.name, fromAjv && specifier.type === 'ImportDefaultSpecifier' ? AJV_IMPORT : UNKNOWN);
        }
        break;
      }
      default: {
        break;
      }
    }
  });
  return values;
}

/** The least set of names every value of which `accepts`, grown to a fixed point. */
function namesWhereEvery(values, accepts) {
  const names = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    for (const [name, list] of values) {
      if (!names.has(name) && list.length > 0 && list.every((value) => accepts(value, names))) {
        names.add(name);
        grew = true;
      }
    }
  }
  return names;
}

function isRequireOf(node, modules) {
  return node.type === 'CallExpression' && isIdentifier(node.callee, 'require') && modules.has(staticString(node.arguments[0]));
}

/** Whether an expression is Ajv's class, given the names already known to hold it. */
function isAjvClass(node, classes) {
  if (node === AJV_IMPORT) return true;
  if (node === UNKNOWN) return false;
  if (node.type === 'Identifier') return classes.has(node.name);
  if (isRequireOf(node, AJV_MODULES)) return true;
  if (node.type === 'MemberExpression') return memberKey(node) === 'default' && isAjvClass(node.object, classes);
  if (node.type === 'LogicalExpression' && (node.operator === '??' || node.operator === '||')) {
    return isAjvClass(node.left, classes) && isAjvClass(node.right, classes);
  }
  return false;
}

/** The names in one file that only ever hold an Ajv instance. */
function ajvInstances(values) {
  const classes = namesWhereEvery(values, isAjvClass);
  return namesWhereEvery(values, (node, instances) => {
    if (node === UNKNOWN || node === AJV_IMPORT) return false;
    if (node.type === 'Identifier') return instances.has(node.name);
    return node.type === 'NewExpression' && isAjvClass(node.callee, classes);
  });
}

function isCreateRequireCall(node) {
  if (node === UNKNOWN || node === AJV_IMPORT || node.type !== 'CallExpression') return false;
  const { callee } = node;
  return isIdentifier(callee, CREATE_REQUIRE) || (callee.type === 'MemberExpression' && memberKey(callee) === CREATE_REQUIRE);
}

/** Names that any binding makes a `createRequire(...)` result, or an alias of one. */
function createdRequires(values) {
  const names = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    for (const [name, list] of values) {
      if (names.has(name)) continue;
      if (
        list.some((value) => isCreateRequireCall(value) || (value !== UNKNOWN && value?.type === 'Identifier' && names.has(value.name)))
      ) {
        names.add(name);
        grew = true;
      }
    }
  }
  return names;
}

/** The specifier node a module load takes, or undefined when `node` loads nothing. `null` stands for a load with no argument. */
function loadedSpecifier(node, requires) {
  if (node.type === 'ImportExpression' || node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration') return node.source;
  if (node.type === 'ExportNamedDeclaration') return node.source ?? undefined;
  if (node.type !== 'CallExpression') return;
  const { callee } = node;
  const isRequire = (target) => target.type === 'Identifier' && (target.name === 'require' || requires.has(target.name));
  const loads =
    isRequire(callee) ||
    isCreateRequireCall(callee) ||
    (callee.type === 'MemberExpression' &&
      ((memberKey(callee) === 'resolve' && (isRequire(callee.object) || isCreateRequireCall(callee.object))) ||
        (memberKey(callee) === 'require' && isIdentifier(callee.object, 'module'))));
  return loads ? (node.arguments[0] ?? null) : undefined;
}

function namesEngine(specifier) {
  const normalized = specifier.replaceAll('\\', '/');
  return normalized === 'eval-quality' || normalized.startsWith('eval-quality/') || normalized.includes('node_modules/eval-quality');
}

/** The expression an object pattern destructures, when the pattern is the whole target of a declaration or assignment. */
function destructuredFrom(pattern, parentOf) {
  const parent = parentOf.get(pattern);
  if (parent?.type === 'VariableDeclarator' && parent.id === pattern) return parent.init;
  if (parent?.type === 'AssignmentExpression' && parent.left === pattern) return parent.right;
  return;
}

/** Every boundary violation in one parsed file. */
function fileViolations({ source, ast, isEngine, isRuntime }) {
  const found = [];
  const report = (node, rule, message) => found.push({ line: node.loc.start.line, rule, message });
  const excerpt = (node) => {
    const text = source.slice(node.start, node.end).replaceAll(/\s+/g, ' ');
    return text.length > 80 ? `${text.slice(0, 77)}...` : text;
  };
  const values = bindingValues(ast);
  const instances = ajvInstances(values);
  const requires = createdRequires(values);
  const parentOf = new Map();
  let engineImports = 0;
  const isAjvReceiver = (node) => node !== null && node !== undefined && node.type === 'Identifier' && instances.has(node.name);

  walk(ast, (node, parent) => {
    parentOf.set(node, parent);

    // engine-import and dynamic-specifier.
    const specifier = loadedSpecifier(node, requires);
    if (specifier !== undefined) {
      const value = staticString(specifier);
      if (value !== undefined && namesEngine(value)) {
        if (isEngine) engineImports += 1;
        else report(node, 'engine-import', `loads eval-quality in "${excerpt(node)}"; only cli/lib/evaluate/engine.js may`);
      }
      if (isRuntime && value === undefined) {
        report(
          node,
          'dynamic-specifier',
          `"${excerpt(node)}" takes a computed specifier; the runtime names every module it loads as a literal`,
        );
      }
    }

    // engine-stage: the always-forbidden names.
    if ((node.type === 'Identifier' || node.type === 'PrivateIdentifier') && ALWAYS_FORBIDDEN.has(node.name)) {
      const onObject = parent?.type === 'MemberExpression' && parent.property === node && isIdentifier(parent.object, 'Object');
      if (!onObject) report(node, 'engine-stage', `names "${node.name}"`);
    }
    if (
      node.type === 'MemberExpression' &&
      node.computed &&
      ALWAYS_FORBIDDEN.has(memberKey(node)) &&
      !isIdentifier(node.object, 'Object')
    ) {
      report(node, 'engine-stage', `reaches "${memberKey(node)}" by bracket access`);
    }
    if (
      node.type === 'Property' &&
      parent?.type === 'ObjectPattern' &&
      node.key.type !== 'Identifier' &&
      ALWAYS_FORBIDDEN.has(propertyKey(node))
    ) {
      report(node, 'engine-stage', `destructures "${propertyKey(node)}"`);
    }
    if (node.type === 'ImportSpecifier' || node.type === 'ExportSpecifier') {
      for (const side of [node.imported, node.local, node.exported]) {
        if (side?.type === 'Literal' && ALWAYS_FORBIDDEN.has(specifierName(side))) report(node, 'engine-stage', `names "${side.value}"`);
      }
    }

    // engine-stage: compile, allowed only on an Ajv instance.
    if (node.type === 'MemberExpression' && memberKey(node) === AJV_STAGE && !isAjvReceiver(node.object)) {
      report(node, 'engine-stage', `reaches "${AJV_STAGE}" on "${excerpt(node.object)}", which is not an Ajv instance`);
    }
    if (
      node.type === 'Property' &&
      parent?.type === 'ObjectPattern' &&
      propertyKey(node) === AJV_STAGE &&
      !isAjvReceiver(destructuredFrom(parent, parentOf))
    ) {
      report(node, 'engine-stage', `destructures "${AJV_STAGE}" from something other than an Ajv instance`);
    }
    if (node.type === 'ImportSpecifier' && specifierName(node.imported) === AJV_STAGE) {
      report(node, 'engine-stage', `imports "${AJV_STAGE}"`);
    }
  });
  return { found, engineImports };
}

/**
 * Every boundary violation under a `cli/` tree.
 *
 * @param {string} cliRoot
 * @returns {{ violations: Array<{ file: string, line: number, rule: string, message: string }>, engineImports: number }}
 */
function scanCli(cliRoot) {
  const engineFile = path.join(cliRoot, ENGINE_MODULE);
  const runtimeDirectory = path.join(cliRoot, RUNTIME_DIRECTORY) + path.sep;
  const runtimeBin = path.join(cliRoot, RUNTIME_BIN);
  const violations = [];
  let engineImports = 0;

  for (const file of filesUnder(cliRoot)) {
    const relative = path.relative(path.dirname(cliRoot), file).split(path.sep).join('/');
    const source = fs.readFileSync(file, 'utf8');
    const isRuntime = file.startsWith(runtimeDirectory) || file === runtimeBin;
    if (file.startsWith(runtimeDirectory)) {
      let offset = source.indexOf(FORBIDDEN_CONFIG);
      while (offset !== -1) {
        violations.push({ file: relative, line: lineAt(source, offset), rule: 'bmad-config', message: `names "${FORBIDDEN_CONFIG}"` });
        offset = source.indexOf(FORBIDDEN_CONFIG, offset + 1);
      }
    }
    if (!SOURCE_EXTENSIONS.has(path.extname(file))) continue;

    let ast;
    try {
      ast = parseSource(file, source);
    } catch (error) {
      violations.push({
        file: relative,
        line: error.loc?.line ?? 1,
        rule: 'parse',
        message: `does not parse, so it cannot be scanned: ${error.message}`,
      });
      continue;
    }
    const { found, engineImports: imports } = fileViolations({ source, ast, isEngine: file === engineFile, isRuntime });
    engineImports += imports;
    const seen = new Set();
    for (const violation of found) {
      const key = `${violation.line}\u0000${violation.rule}\u0000${violation.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      violations.push({ file: relative, ...violation });
    }
  }
  violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
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
  // engine-import
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
    name: 'a re-export from the engine package',
    rule: 'engine-import',
    file: 'lib/forward.mjs',
    source: "export { digestArtifact } from 'eval-quality';\n",
  },
  {
    name: 'a require through node_modules',
    rule: 'engine-import',
    file: 'lib/deep.js',
    source: "const eq = require('../../node_modules/eval-quality');\n",
  },
  {
    name: 'a require by static template literal',
    rule: 'engine-import',
    file: 'lib/template-require.js',
    source: 'const eq = require(`eval-quality`);\n',
  },
  {
    name: 'a require obtained from createRequire',
    rule: 'engine-import',
    file: 'lib/created.js',
    source:
      "const { createRequire } = require('node:module');\nconst load = createRequire(__filename);\nconst eq = load('eval-quality');\n",
  },
  {
    name: 'resolve on a require obtained from module.createRequire',
    rule: 'engine-import',
    file: 'lib/created-resolve.js',
    source:
      "const nodeModule = require('module');\nconst load = nodeModule.createRequire(__filename);\nconst where = load.resolve('eval-quality/package.json');\n",
  },
  {
    name: 'a createRequire result called in place',
    rule: 'engine-import',
    file: 'lib/created-inline.js',
    source: "const { createRequire } = require('node:module');\nconst eq = createRequire(__filename)('eval-quality');\n",
  },
  {
    name: 'module.require of the engine',
    rule: 'engine-import',
    file: 'lib/module-require.js',
    source: "const eq = module.require('eval-quality');\n",
  },

  // dynamic-specifier
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
    name: 'a template specifier with an interpolation under the runtime',
    rule: 'dynamic-specifier',
    file: 'lib/evaluate/interpolated.js',
    source: "const name = 'engine';\nconst engine = require(`./${name}`);\n",
  },
  {
    name: 'a computed specifier through createRequire under the runtime',
    rule: 'dynamic-specifier',
    file: 'lib/evaluate/created.js',
    source: "const { createRequire } = require('node:module');\nconst load = createRequire(__filename);\nconst name = 'x';\nload(name);\n",
  },

  // engine-stage: always-forbidden names
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
    name: 'seal destructured by a string key',
    rule: 'engine-stage',
    file: 'lib/evaluate/seal-key.js',
    source: `${LOADER}async function f() {\n  const { 'seal': s } = await loadEngine();\n  return s;\n}\nmodule.exports = { f };\n`,
  },
  {
    name: 'seal imported by a string specifier',
    rule: 'engine-stage',
    file: 'lib/evaluate/seal-import.mjs',
    source: "import { 'seal' as s } from './engine.js';\nexport default s;\n",
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
    name: 'seal by static template bracket',
    rule: 'engine-stage',
    file: 'lib/evaluate/bracket-template.js',
    source: `${LOADER}async function f() {\n  const eq = await loadEngine();\n  return eq[\`seal\`]({});\n}\nmodule.exports = { f };\n`,
  },
  {
    name: 'runScore named in engine.js itself',
    rule: 'engine-stage',
    file: 'lib/evaluate/engine.js',
    source: `${ENGINE_STUB}async function score() { return (await loadEngine()).runScore({}); }\nmodule.exports.score = score;\n`,
  },
  {
    name: 'runScore after a regular expression literal holding quotes (the isolate.js shape)',
    rule: 'engine-stage',
    file: 'lib/isolate.js',
    source:
      "const UNSAFE = /[\"\\n\\r]/;\nconst TICK = /`/;\nconst engine = require('./evaluate/engine');\nfunction f() {\n  return engine.runScore({});\n}\nmodule.exports = { UNSAFE, TICK, f };\n",
  },
  {
    name: 'runScore inside a template interpolation',
    rule: 'engine-stage',
    file: 'lib/evaluate/template.js',
    source: "const engine = require('./engine');\nconst text = `score: ${engine.runScore({})}`;\nmodule.exports = { text };\n",
  },

  // engine-stage: compile
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
    name: 'compile on the result of an async wrapper around the loader',
    rule: 'engine-stage',
    file: 'lib/evaluate/wrapper.js',
    source: `${LOADER}async function library() {\n  return loadEngine();\n}\nasync function f() {\n  const e = await library();\n  return e.compile({});\n}\nmodule.exports = { f };\n`,
  },
  {
    name: 'compile in a helper handed the library',
    rule: 'engine-stage',
    file: 'lib/evaluate/helper.js',
    source: `${LOADER}function helper(l) {\n  return l.compile({});\n}\nasync function f() {\n  return helper(await loadEngine());\n}\nmodule.exports = { f };\n`,
  },
  {
    name: 'compile on an awaited inline require of the loader',
    rule: 'engine-stage',
    file: 'lib/evaluate/inline.js',
    source:
      "async function f() {\n  const e = await require('./engine').loadEngine();\n  return e.compile({});\n}\nmodule.exports = { f };\n",
  },
  {
    name: 'compile on a loader called by bracket',
    rule: 'engine-stage',
    file: 'lib/evaluate/bracket-loader.js',
    source:
      "const e = require('./engine');\nasync function f() {\n  const eq = await e['loadEngine']();\n  return eq.compile({});\n}\nmodule.exports = { f };\n",
  },
  {
    name: 'compile on a library destructured from Promise.all',
    rule: 'engine-stage',
    file: 'lib/evaluate/all.js',
    source: `${LOADER}async function f() {\n  const [eq] = await Promise.all([loadEngine()]);\n  return eq.compile({});\n}\nmodule.exports = { f };\n`,
  },
  {
    name: 'compile on a library destructured from a context under another name',
    rule: 'engine-stage',
    file: 'lib/evaluate/renamed.js',
    source: 'function f(context) {\n  const { engine: e2 } = context;\n  return e2.compile({});\n}\nmodule.exports = { f };\n',
  },
  {
    name: 'compile through an object-literal re-export of the loader',
    rule: 'engine-stage',
    file: 'lib/evaluate/use-facade.js',
    extra: { 'lib/evaluate/facade.js': "module.exports = { loadEngine: require('./engine').loadEngine };\n" },
    source:
      "const { loadEngine } = require('./facade');\nasync function f() {\n  const eq = await loadEngine();\n  return eq.compile({});\n}\nmodule.exports = { f };\n",
  },
  {
    name: 'compile through an Object.assign re-export',
    rule: 'engine-stage',
    file: 'lib/evaluate/use-assign.js',
    extra: { 'lib/evaluate/assign.js': "Object.assign(module.exports, require('./engine'));\n" },
    source:
      "const assigned = require('./assign');\nasync function f() {\n  const eq = await assigned.loadEngine();\n  return eq.compile({});\n}\nmodule.exports = { f };\n",
  },
  {
    name: 'compile through a default import in an ES module',
    rule: 'engine-stage',
    file: 'lib/evaluate/esm.mjs',
    source:
      "import engine from './engine.js';\nexport async function f() {\n  const eq = await engine.loadEngine();\n  return eq.compile({});\n}\n",
  },
  {
    name: 'compile imported by name',
    rule: 'engine-stage',
    file: 'lib/evaluate/named.mjs',
    source: "import { compile } from './engine.js';\nexport default compile;\n",
  },
  {
    name: 'compile on a property of an unrelated object (not an Ajv instance, so outside the allowlist)',
    rule: 'engine-stage',
    file: 'lib/unrelated.js',
    source: 'function f(other) {\n  return other.engine.compile({});\n}\nmodule.exports = { f };\n',
  },
  {
    name: 'compile on a name bound to Ajv once and to something else once',
    rule: 'engine-stage',
    file: 'lib/evaluate/rebound.js',
    source: `const Ajv = require('ajv');\n${LOADER}async function f() {\n  let ajv = new Ajv();\n  ajv = await loadEngine();\n  return ajv.compile({});\n}\nmodule.exports = { f };\n`,
  },
  {
    name: 'compile on a parameter that shadows an Ajv instance name',
    rule: 'engine-stage',
    file: 'lib/evaluate/shadow.js',
    source:
      "const Ajv = require('ajv');\nconst ajv = new Ajv();\nfunction f(ajv) {\n  return ajv.compile({});\n}\nmodule.exports = { f, ajv };\n",
  },

  // bmad-config and parse
  {
    name: 'a _bmad path under the runtime',
    rule: 'bmad-config',
    file: 'lib/evaluate/config.js',
    source: "const CONFIG = '_bmad/tea/config.yaml';\nmodule.exports = { CONFIG };\n",
  },
  {
    name: 'a file that does not parse',
    rule: 'parse',
    file: 'lib/broken.js',
    source: 'const = ;\n',
  },
];

/** Legitimate forms: each must scan clean, and the engine stub's own import must still be seen. */
const CLEAN_PLANTS = [
  {
    name: 'engine digests, Ajv compile, and stage names in comments and messages',
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
  },
  {
    name: 'the check.js Ajv shape, a module-level instance assigned later, an alias, and bare ajv',
    file: 'lib/evaluate/ajv-shapes.js',
    source: [
      "const AjvModule = require('ajv/dist/2020');",
      "const Plain = require('ajv');",
      'const Ajv = AjvModule.default ?? AjvModule;',
      'let shared;',
      'function init() {',
      '  shared = new Ajv({ strict: false });',
      '}',
      'function f(schema) {',
      '  const validator = shared;',
      '  const plain = new Plain();',
      '  const { compile } = plain;',
      "  return [shared.compile(schema), validator['compile'](schema), plain.compile(schema), compile];",
      '}',
      'module.exports = { init, f };',
      '',
    ].join('\n'),
  },
  {
    name: 'Object.seal',
    file: 'lib/freeze.js',
    source: "const frozen = Object.seal({});\nconst again = Object['seal']({});\nmodule.exports = { frozen, again };\n",
  },
  {
    name: 'a static template literal specifier under the runtime',
    file: 'lib/evaluate/static-template.js',
    source:
      "const path = require(`node:path`);\nconst { createRequire } = require('node:module');\nconst load = createRequire(__filename);\nconst yaml = load('js-yaml');\nmodule.exports = { path, yaml };\n",
  },
  {
    name: 'regular expression literals and template text that name the stages',
    file: 'lib/evaluate/text.js',
    source:
      "const QUOTE = /[\"'`\\n\\r]/;\nconst NAMES = /runScore|seal|compile/;\nconst hint = `${QUOTE.source} runScore and seal run through the CLI; require('eval-quality') lives in engine.js`;\nmodule.exports = { NAMES, hint };\n",
  },
];

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
  for (const plant of CLEAN_PLANTS) {
    const { root, cliRoot } = plantedTree(plant);
    try {
      const { violations, engineImports } = scanCli(cliRoot);
      check(violations.length === 0, `the scanner reported a legitimate form (${plant.name}): ${JSON.stringify(violations)}`);
      check(engineImports === 1, `the scanner did not see the engine module's own import beside ${plant.name}: ${engineImports}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
}

function scanRepository() {
  const { violations, engineImports } = scanCli(CLI_ROOT);
  for (const violation of violations) {
    check(false, `${violation.file}:${violation.line} [${violation.rule}] ${violation.message}`);
  }
  check(engineImports > 0, 'cli/lib/evaluate/engine.js names eval-quality nowhere; the runtime has no door to the engine');
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

module.exports = { scanCli };
