/**
 * The engine boundary of `tea-evaluate`, held over every file under `cli/`.
 *
 * Every `.js`, `.cjs` and `.mjs` file is parsed with acorn (`.mjs` as a module,
 * the others as a script with a module fallback), so comments, string text,
 * regular expression literals and template text are never mistaken for code,
 * and code inside a template `${...}` is always seen. A file that does not
 * parse is a `parse` violation, never a silent skip. A symbolic link under
 * `cli/` is a `symlink` violation, and any file other than `.js`, `.cjs`,
 * `.mjs` code or `.json`, `.md`, `.yml`, `.yaml` data (a `.ts` file Node runs
 * natively, an extensionless script) is an `unscanned` violation. The rules
 * are closed: none of them tracks where a value came from.
 *
 * Eight rules (Stories 1.4 to 1.7, AD-1, AD-4, AD-5, AD-6, AD-8):
 *
 * - `engine-import`: only `cli/lib/evaluate/engine.js` loads a specifier that
 *   is `eval-quality`, starts with `eval-quality/` or contains
 *   `node_modules/eval-quality`. A load is a `require(...)`,
 *   `require.resolve(...)`, `import.meta.resolve(...)`, `module.require(...)`,
 *   `import(...)`, a static `import`/`export ... from`, a bare `import '...'`,
 *   or a call (or `.resolve` call) through an alias of `require` or a binding
 *   obtained from `createRequire(...)` under any local name.
 * - `dynamic-specifier`: every load under `cli/` takes a string literal or a
 *   template literal with no `${...}` (Story 1.4 held the runtime to this;
 *   Story 1.5 widened it to all of `cli/`, which already met it, so a computed
 *   path into `test/` cannot slip past `test-import`).
 * - `engine-stage`: the stages that decide enforced verdicts come only from the
 *   eval-quality CLI over persisted files.
 *   - `runScore`, `preflightFromObservations`, `aggregateStrength` and `seal` fail anywhere under
 *     `cli/`, `engine.js` included, as an identifier, a member property (dot,
 *     or a bracket string or static template), an object-pattern key, or an
 *     import or export specifier. `Object.seal` is an exemption, and only
 *     in a file that binds no name `Object`. `runScore` is the other, and only
 *     as the callee of `const { artifact, ladder, qualification } = await
 *     this.#engine.runScore(...)` in `cli/lib/evaluate/score-inputs.js`, the
 *     in-process re-score that compares a call with the held inputs and never
 *     decides a verdict (Story 1.68, AD-6 amended 2026-10-01). That file reads
 *     the ladder's `exitCode`, `verdict` and `basis` and the qualification's
 *     `failures` and no other field of either, and names the result's `artifact`
 *     only to destructure it, test it against null and hand it to
 *     `this.#engine.serializeArtifact`. `aggregateStrength` (Story 1.45) is the
 *     other exemption: one call in the same file's `reproduceAggregate`, its
 *     result bound to `aggregate`, which is only serialized. The re-score is
 *     asked for once, in `held-refusal.js`'s `heldRefusal`, which `score.js` and
 *     `run.js` (an evaluator attempt's call, Story 1.69) both call, and the
 *     re-aggregation once, in `score.js`'s `heldAggregateRefusal`. A returned or aliased
 *     `runScore`, a rest element or a renamed key over the result, and a
 *     `ladder` anywhere else under `cli/` fail. `preflightFromObservations`
 *     and `seal` fail there too.
 *   - `compile` as a member property or an object-pattern key fails everywhere
 *     under `cli/` unless its receiver is an identifier every binding of which
 *     is a `new X(...)` of Ajv (`X` bound to `require('ajv')` or
 *     `require('ajv/dist/2020')`, or to `Y.default ?? Y` of one), or an alias of
 *     such an identifier. Importing a `compile` specifier fails too.
 * - `bmad-config`: the string `_bmad` appears nowhere under
 *   `cli/lib/evaluate/`, since the runtime reads no BMAD configuration.
 * - `test-import` (Story 1.5): no load under `cli/` takes a relative specifier
 *   that resolves into the repository's `test/` tree, or a self-reference
 *   through this package's own name into `test/`, which the published package
 *   does not carry.
 * - `asset-import` (Story 1.11, AD-4): no load under `cli/` resolves into the
 *   Evaluate skill's `assets/`, relatively or through this package's own name.
 *   The HTTP port templates there are adopter code: rendered into an
 *   evaluation folder's `adapter/`, they import eval-quality from that
 *   folder's own install (AD-20), and the runtime reaches a port only by
 *   starting its file as a process of its own (`http-target.js`), so this scan
 *   leaves `assets/` alone and this rule keeps the runtime from loading a
 *   template, whose eval-quality import would then bypass `engine-import`.
 *
 * - `install-probe` (Story 1.6, AD-4): `cli/skill-runner.js` takes its skill
 *   from `--skill-root` alone, so it names no home directory (`homedir`, a
 *   `HOME`, `USERPROFILE` or `XDG_CONFIG_HOME` read), no agent-specific or
 *   installed skill location (`.claude`, `.agents`, `.codex`, `.cursor`,
 *   `.gemini`, `_bmad` in a string), and does not load `lib/resolve-skill`,
 *   which probes install locations for `tea-test-review`.
 * - `vendor-name` (Story 1.6): `cli/skill-runner.js` names no vendor (an agent
 *   adapter key other than `custom`, or `anthropic`, `openai`, `gemini`) in an
 *   identifier or a string, since vendor knowledge lives in
 *   `cli/lib/agent-adapters.js`.
 * - `rollback-literal` (Story 1.7, AD-8): nothing under `cli/` writes
 *   `rollbackVerified: true` as a literal: an object property (a quoted or
 *   computed key included), an assignment (dot, bracket or a bare name), a
 *   binding a shorthand property could carry, a destructuring default, or
 *   `"rollbackVerified": true` in
 *   a JSON file, since the flag is the rollback cycle's own result; the
 *   twin-fixture pattern AD-8 rejects set it by hand.
 * - `framework-name` (Story 1.17, AD-21): no file under `cli/`, in any
 *   extension, names an evaluation framework or library from
 *   `FRAMEWORK_NAMES` anywhere in its text (code, a string, a dynamic path,
 *   a comment or data), compared without case. The binding guard is the
 *   `cli` layer's dependency-direction `allow` list, which names no
 *   framework, so an import of any framework fails `test:direction` whatever
 *   it is called (`test:evaluate-evaluators` plants one); this scan is the
 *   secondary check, which also catches a name no import carries.
 *
 * Stories 1.5 and 1.7 also hold the moves of harness code into the runtime
 * (AD-5, R1-06), by definition in named files, since a text scan for a call
 * site would hit the legal calls across `test/`:
 *
 * - `test/lib/probe-targets.js`, `test/lib/eval-quality-inputs.js` and
 *   `test/lib/eval-record.js` each `require` their runtime module
 *   (`cli/lib/evaluate/registry.js`, `records.js`, `digest.js`), and Story
 *   1.7's `test/eval-contract-strength.js` and
 *   `test/test-automate-eval-fixture.js` require `workspace.js` and
 *   `mutation.js`;
 * - the moved definitions (`function commandTargetPolicy`, the command target
 *   policy builder; `function sealedRunRecord`; `function repositoryState`;
 *   `function cachingPort` and `function stageDirectories`, the live
 *   harness's leg cache and per-leg staging; `function runMutationCycle`, the
 *   mutate, measure, restore cycle) are declared exactly once, in their
 *   runtime module, and defined in no other runtime module;
 * - no function a moved runtime module exports (`registry.js`, `records.js`,
 *   `digest.js`, `bounded-probe.js`, `workspace.js`, `mutation.js`) is defined
 *   again under `test/`: in any form in the five named files (a declaration,
 *   an arrow bound or assigned later, a method, or a local function exported
 *   under the name), and at the top level or in the exports of any other
 *   `test/lib/` file, so a partial move back or a copy of a runtime module
 *   fails; `digestFiles` in `eval-record.js`, which hands the runtime TEA's
 *   file-system port, is the one named wrapper; a function an exported factory
 *   builds and returns (`createRegistry`'s `targetProblems`,
 *   `createArtifactValidator`'s `validateArtifact`) counts as exported;
 * - every runtime function the five named files hand out is the runtime's own
 *   function object, checked by loading them in a child process, so a bound,
 *   aliased or member function fails; `probe-targets.js` exports its registry,
 *   which must be one `createRegistry` built, and frozen;
 * - `test/lib/eval-quality-schema-versions.js` is gone, `engine.js` declares
 *   `expectedSchemaVersion` and `schemaVersionProblems`, and the `purity` block
 *   of `eval-quality.config.json` names the exact layer over `engine.js`.
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
const { spawnSync } = require('node:child_process');

const acorn = require('acorn');

const PROJECT_ROOT = path.join(__dirname, '..');
const CLI_ROOT = path.join(PROJECT_ROOT, 'cli');
const ENGINE_MODULE = path.join('lib', 'evaluate', 'engine.js');
/**
 * The one file that may name `runScore`, and only as the callee of `const { artifact, ladder, qualification } = await
 * this.#engine.runScore(...)`: the in-process re-score that compares a call with the held inputs and never decides
 * (Story 1.68, AD-6). Of the ladder it reads `exitCode`, `verdict` and `basis`, of the qualification `failures`, and
 * nothing else; every other file under `cli/` may not read a `ladder` at all.
 */
const REPRODUCTION_MODULE = path.join('lib', 'evaluate', 'score-inputs.js');
const SCORE_MODULE = path.join('lib', 'evaluate', 'score.js');
/** The comparison of a call with its held inputs, shared by `score.js` and `run.js` (Story 1.69). */
const HELD_REFUSAL_MODULE = path.join('lib', 'evaluate', 'held-refusal.js');
const REPRODUCTION_STAGE = 'runScore';
const REPRODUCTION_METHOD = 'reproduce';
const AGGREGATION_STAGE = 'aggregateStrength';
const AGGREGATION_METHOD = 'reproduceAggregate';
/** Where each re-score is asked for: the module and the function in it, once. `run.js` asks for neither; it calls `heldRefusal`. */
const REPRODUCTION_CALLERS = {
  reproduce: { module: HELD_REFUSAL_MODULE, caller: 'heldRefusal' },
  reproduceAggregate: { module: SCORE_MODULE, caller: 'heldAggregateRefusal' },
};
const REPRODUCTION_RESULT = new Set(['artifact', 'ladder', 'qualification']);
// `artifact` is guarded as well (see the rule in `fileViolations`); only `ladder` and `qualification` have readable fields.
const REPRODUCTION_READS = new Map([
  ['ladder', new Set(['exitCode', 'verdict', 'basis'])],
  ['qualification', new Set(['failures'])],
]);
const RUNTIME_DIRECTORY = path.join('lib', 'evaluate');
const SOURCE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs']);
const DATA_EXTENSIONS = new Set(['.json', '.md', '.yml', '.yaml']);
const ALWAYS_FORBIDDEN = new Set(['runScore', 'preflightFromObservations', 'aggregateStrength', 'seal']);
const AJV_STAGE = 'compile';
const AJV_MODULES = new Set(['ajv', 'ajv/dist/2020']);
const CREATE_REQUIRE = 'createRequire';
const FORBIDDEN_CONFIG = '_bmad';
const ROLLBACK_FLAG = 'rollbackVerified';
const UNKNOWN = Symbol('unknown binding');
const AJV_IMPORT = Symbol('ajv import');
const CREATE_REQUIRE_FUNCTION = Symbol('createRequire');
const TEST_TREE = 'test';
/** The Evaluate skill's templates, adopter code the runtime never loads (Story 1.11). */
const ASSET_TREE = path.join('src', 'workflows', 'testarch', 'bmad-testarch-evaluate', 'assets');
const SKILL_RUNNER = 'skill-runner.js';
const INSTALL_IDENTIFIERS = new Set(['homedir', 'HOME', 'USERPROFILE', 'XDG_CONFIG_HOME']);
const INSTALL_PATH = /(?:^|[/\\])\.(?:claude|agents|codex|cursor|gemini)(?:[/\\]|$)|_bmad/;
const RESOLVE_SKILL = /(?:^|\/)resolve-skill(?:\.js)?$/;
const VENDOR_NAMES = [
  ...Object.keys(require('../cli/lib/agent-adapters').AGENT_ADAPTERS).filter((name) => name !== 'custom'),
  'anthropic',
  'openai',
  'gemini',
];
const VENDOR_WORDS = new Set(VENDOR_NAMES);
/**
 * Evaluation frameworks and libraries whose code belongs in an adopter's
 * `evaluator/` folder and never under `cli/` (AD-21). The list is secondary
 * and illustrative: the dependency-direction allow list refuses any
 * framework import whatever its name.
 */
const FRAMEWORK_NAMES = [
  'agentevals',
  'openevals',
  'promptfoo',
  'deepeval',
  'inspect_ai',
  'inspect-ai',
  'langsmith',
  'langfuse',
  'ragas',
  'trulens',
  'braintrust',
];

/**
 * Whether a name or string names a vendor: split into words at case changes,
 * digits and punctuation (`claudeArgs` is `claude args`, `OpenAIClient` is
 * `open ai client`), then compared word by word and as adjacent pairs, so a
 * vendor spelled as two words (`open` `ai`) is caught and a word that merely
 * contains a vendor's letters (`strategy`) is not.
 */
function namesVendor(text) {
  const words = (text.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+/g) ?? []).map((word) => word.toLowerCase());
  return words.some((word, index) => VENDOR_WORDS.has(word) || VENDOR_WORDS.has(`${word}${words[index + 1] ?? ''}`));
}
const PACKAGE_NAME = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).name;

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };

function lineAt(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

/** Every regular file and every symbolic link under `directory`; links are listed apart and never followed. */
function filesUnder(directory, links = []) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) links.push(absolute);
    else if (entry.isDirectory()) files.push(...filesUnder(absolute, links).files);
    else files.push(absolute);
  }
  return { files, links };
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
        } else {
          unknown(node.id);
          if (node.id.type === 'ObjectPattern') {
            for (const property of node.id.properties) {
              if (property.type === 'Property' && propertyKey(property) === CREATE_REQUIRE) {
                for (const name of patternNames(property.value)) add(name, CREATE_REQUIRE_FUNCTION);
              }
            }
          }
        }
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
          if (specifier.type === 'ImportSpecifier' && specifierName(specifier.imported) === CREATE_REQUIRE) {
            add(specifier.local.name, CREATE_REQUIRE_FUNCTION);
          }
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

function isNode(value) {
  return value !== UNKNOWN && value !== AJV_IMPORT && value !== CREATE_REQUIRE_FUNCTION && value !== null && value !== undefined;
}

/** Whether an expression is `createRequire` itself, under any local name in `functions` or as a member. */
function isCreateRequireFunction(node, functions) {
  if (node === CREATE_REQUIRE_FUNCTION) return true;
  if (!isNode(node)) return false;
  if (node.type === 'Identifier') return node.name === CREATE_REQUIRE || functions.has(node.name);
  return node.type === 'MemberExpression' && memberKey(node) === CREATE_REQUIRE;
}

function isCreateRequireCall(node, functions) {
  return isNode(node) && node.type === 'CallExpression' && isCreateRequireFunction(node.callee, functions);
}

/** The least set of names any value of which `accepts`, grown to a fixed point. */
function namesWhereAny(values, accepts) {
  const names = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    for (const [name, list] of values) {
      if (!names.has(name) && list.some((value) => accepts(value, names))) {
        names.add(name);
        grew = true;
      }
    }
  }
  return names;
}

/**
 * The local names of `createRequire`, and the names that any binding makes a
 * require: `require` itself or an alias of it, or a `createRequire(...)`
 * result or an alias of one.
 */
function requireBindings(values) {
  const functions = namesWhereAny(values, (value, names) => isCreateRequireFunction(value, names));
  const requires = namesWhereAny(
    values,
    (value, names) =>
      isCreateRequireCall(value, functions) ||
      (isNode(value) && value.type === 'Identifier' && (value.name === 'require' || names.has(value.name))),
  );
  return { functions, requires };
}

/** The specifier node a module load takes, or undefined when `node` loads nothing. `null` stands for a load with no argument. */
function loadedSpecifier(node, { functions, requires }) {
  if (node.type === 'ImportExpression' || node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration') return node.source;
  if (node.type === 'ExportNamedDeclaration') return node.source ?? undefined;
  if (node.type !== 'CallExpression') return;
  const { callee } = node;
  const isRequire = (target) => target.type === 'Identifier' && (target.name === 'require' || requires.has(target.name));
  const isImportMeta = (target) => target.type === 'MetaProperty' && target.meta.name === 'import' && target.property.name === 'meta';
  const loads =
    isRequire(callee) ||
    isCreateRequireCall(callee, functions) ||
    (callee.type === 'MemberExpression' &&
      ((memberKey(callee) === 'resolve' &&
        (isRequire(callee.object) || isCreateRequireCall(callee.object, functions) || isImportMeta(callee.object))) ||
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

/**
 * The lines of a JSON file under `cli/` that hold `"rollbackVerified": true`:
 * a template a module spreads into a record would carry the flag as data. A
 * file that does not parse is read as text, so it cannot hide one either.
 */
function jsonRollbackLiterals(source) {
  const pattern = new RegExp(`"${ROLLBACK_FLAG}"\\s*:\\s*true\\b`, 'g');
  const lines = [];
  for (const match of source.matchAll(pattern)) lines.push(lineAt(source, match.index));
  return lines;
}

/** Whether `node` is the literal `true`. */
function isTrueLiteral(node) {
  return node?.type === 'Literal' && node.value === true;
}

/** The text of a string literal or a template's static part, or undefined for any other node. */
function stringText(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  return node.type === 'TemplateElement' ? (node.value.cooked ?? node.value.raw) : undefined;
}

/** The `install-probe` and `vendor-name` rules over one node of `cli/skill-runner.js`. */
function skillRunnerViolations(node, value, report) {
  const text = stringText(node);
  if (node.type === 'Identifier' && INSTALL_IDENTIFIERS.has(node.name)) {
    report(node, 'install-probe', `names "${node.name}"; the skill runner reads its skill from --skill-root alone`);
  }
  if (text !== undefined && (INSTALL_IDENTIFIERS.has(text) || INSTALL_PATH.test(text))) {
    report(node, 'install-probe', `names ${JSON.stringify(text)}; the skill runner probes no install location`);
  }
  if (value !== undefined && RESOLVE_SKILL.test(value)) {
    report(node, 'install-probe', `loads ${value}, which probes install locations`);
  }
  const name = node.type === 'Identifier' ? node.name : text;
  if (name !== undefined && namesVendor(name)) {
    report(node, 'vendor-name', `names a vendor in ${JSON.stringify(name)}; vendor knowledge lives in cli/lib/agent-adapters.js`);
  }
}

/** Every boundary violation in one parsed file. */
function fileViolations({ source, ast, isEngine, isReproduction, callerModule = null, isSkillRunner, file, projectRoot }) {
  const found = [];
  const report = (node, rule, message) => found.push({ line: node.loc.start.line, rule, message });
  const excerpt = (node) => {
    const text = source.slice(node.start, node.end).replaceAll(/\s+/g, ' ');
    return text.length > 80 ? `${text.slice(0, 77)}...` : text;
  };
  const values = bindingValues(ast);
  const instances = ajvInstances(values);
  const requires = requireBindings(values);
  const objectRebound = values.has('Object');
  const isGlobalObject = (node) => !objectRebound && isIdentifier(node, 'Object');
  const parentOf = new Map();
  let exemptCalls = 0;
  let exemptAggregations = 0;
  const reproductionCalls = { reproduce: 0, reproduceAggregate: 0 };
  /**
   * The name of the class method whose own function `node` sits in, or null: an arrow, an inner function or a function
   * declaration between the two (a closure that could be published) gives null.
   */
  const enclosingMethod = (node) => {
    for (let at = parentOf.get(node); at !== undefined; at = parentOf.get(at)) {
      if (at.type === 'FunctionExpression' || at.type === 'ArrowFunctionExpression' || at.type === 'FunctionDeclaration') {
        const method = parentOf.get(at);
        return at.type === 'FunctionExpression' && method?.type === 'MethodDefinition' && method.value === at
          ? (method.key.name ?? null)
          : null;
      }
    }
    return null;
  };
  /** The nearest enclosing function declaration's name, or null. */
  const enclosingFunctionName = (node) => {
    for (let at = parentOf.get(node); at !== undefined; at = parentOf.get(at)) {
      if (at.type === 'FunctionDeclaration') return at.id?.name ?? null;
      if (at.type === 'FunctionExpression' || at.type === 'ArrowFunctionExpression') return null;
    }
    return null;
  };
  /**
   * Whether the `serializeArtifact(...)` call is the direct argument of `Buffer.from`, which is (or is the alternative of a
   * conditional that is) the `artifact` or `aggregate` value of an object the method returns: the bytes leave as bytes,
   * and a parse of the serialization cannot be built.
   */
  const returnedAsBytes = (call) => {
    const buffer = parentOf.get(call);
    if (
      buffer?.type !== 'CallExpression' ||
      buffer.arguments[0] !== call ||
      buffer.callee.type !== 'MemberExpression' ||
      buffer.callee.computed ||
      buffer.callee.object.name !== 'Buffer' ||
      buffer.callee.property.name !== 'from'
    ) {
      return false;
    }
    const conditional = parentOf.get(buffer);
    const value = conditional?.type === 'ConditionalExpression' && conditional.alternate === buffer ? conditional : buffer;
    const property = parentOf.get(value);
    return (
      property?.type === 'Property' &&
      property.value === value &&
      !property.computed &&
      (property.key.name === 'artifact' || property.key.name === 'aggregate') &&
      parentOf.get(property)?.type === 'ObjectExpression' &&
      parentOf.get(parentOf.get(property))?.type === 'ReturnStatement'
    );
  };
  /**
   * `this.#engine.runScore(...)` awaited into a declaration that destructures exactly the result's `artifact`,
   * `ladder` and `qualification` by their own names, the one spelling the re-score module may use.
   */
  const isReproductionCall = (node, parent) => {
    if (
      !isReproduction ||
      (node.name !== REPRODUCTION_STAGE && node.name !== AGGREGATION_STAGE) ||
      parent?.type !== 'MemberExpression' ||
      parent.property !== node ||
      parent.computed ||
      parent.object.type !== 'MemberExpression' ||
      parent.object.object.type !== 'ThisExpression' ||
      parent.object.computed ||
      parent.object.property.type !== 'PrivateIdentifier' ||
      parent.object.property.name !== 'engine'
    ) {
      return false;
    }
    const call = parentOf.get(parent);
    if (node.name === AGGREGATION_STAGE) {
      // The aggregate (Story 1.45): one call site, inside `reproduceAggregate`, its result bound to `aggregate`, which is
      // only serialized.
      const declaration = call?.type === 'CallExpression' && call.callee === parent ? parentOf.get(call) : undefined;
      const aggregateExempt =
        enclosingMethod(node) === AGGREGATION_METHOD &&
        exemptAggregations === 0 &&
        declaration?.type === 'VariableDeclarator' &&
        declaration.init === call &&
        declaration.id.type === 'Identifier' &&
        declaration.id.name === 'aggregate';
      if (aggregateExempt) exemptAggregations += 1;
      return aggregateExempt;
    }
    // One call site, inside the module's `reproduce` method, so the result has one place to go.
    if (enclosingMethod(node) !== REPRODUCTION_METHOD || exemptCalls > 0) return false;
    const awaited = call?.type === 'CallExpression' && call.callee === parent ? parentOf.get(call) : undefined;
    const declarator = awaited?.type === 'AwaitExpression' ? parentOf.get(awaited) : undefined;
    const exempt =
      declarator?.type === 'VariableDeclarator' &&
      declarator.init === awaited &&
      declarator.id.type === 'ObjectPattern' &&
      declarator.id.properties.every(
        (property) =>
          property.type === 'Property' &&
          property.shorthand &&
          !property.computed &&
          property.key.type === 'Identifier' &&
          REPRODUCTION_RESULT.has(property.key.name),
      );
    if (exempt) exemptCalls += 1;
    return exempt;
  };
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
      if (value !== undefined) {
        const normalized = value.replaceAll('\\', '/');
        const selfReference = normalized === `${PACKAGE_NAME}/${TEST_TREE}` || normalized.startsWith(`${PACKAGE_NAME}/${TEST_TREE}/`);
        const reached = value.startsWith('.') ? path.relative(projectRoot, path.resolve(path.dirname(file), value)) : '';
        if (selfReference || reached === TEST_TREE || reached.startsWith(`${TEST_TREE}${path.sep}`)) {
          report(node, 'test-import', `loads ${value}, which resolves into test/; the published package does not carry test/`);
        }
        const assetTree = ASSET_TREE.split(path.sep).join('/');
        const assetReference = normalized === `${PACKAGE_NAME}/${assetTree}` || normalized.startsWith(`${PACKAGE_NAME}/${assetTree}/`);
        if (assetReference || reached === ASSET_TREE || reached.startsWith(`${ASSET_TREE}${path.sep}`)) {
          report(
            node,
            'asset-import',
            `loads ${value}, which resolves into the Evaluate skill's assets/; an adopter's HTTP port runs as a process of its own`,
          );
        }
      }
      if (value === undefined) {
        report(node, 'dynamic-specifier', `"${excerpt(node)}" takes a computed specifier; cli/ names every module it loads as a literal`);
      }
    }

    if (isSkillRunner) {
      const loaded = specifier === undefined ? undefined : staticString(specifier);
      skillRunnerViolations(node, loaded, report);
    }

    // engine-stage: the always-forbidden names.
    if (
      (node.type === 'Identifier' || node.type === 'PrivateIdentifier') &&
      ALWAYS_FORBIDDEN.has(node.name) &&
      !isReproductionCall(node, parent)
    ) {
      const onObject = parent?.type === 'MemberExpression' && parent.property === node && isGlobalObject(parent.object);
      if (!onObject) report(node, 'engine-stage', `names "${node.name}"`);
    }
    if (node.type === 'MemberExpression' && node.computed && ALWAYS_FORBIDDEN.has(memberKey(node)) && !isGlobalObject(node.object)) {
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

    // engine-stage: the re-score and the re-aggregation are asked for from one place each, `held-refusal.js`'s `heldRefusal`
    // (which `score.js` and `run.js` both call, Story 1.69) and `score.js`'s `heldAggregateRefusal`, and the answer's artifact
    // or aggregate is only compared there.
    if (
      !isReproduction &&
      node.type === 'CallExpression' &&
      node.callee.type === 'MemberExpression' &&
      !node.callee.computed &&
      Object.hasOwn(REPRODUCTION_CALLERS, node.callee.property.name)
    ) {
      const name = node.callee.property.name;
      const { module, caller } = REPRODUCTION_CALLERS[name];
      const allowed = callerModule === module && enclosingFunctionName(node) === caller && reproductionCalls[name] === 0;
      if (allowed) reproductionCalls[name] += 1;
      else report(node, 'engine-stage', `calls ${name} outside the one place that asks for it (${caller} in ${path.basename(module)})`);
    }
    if (
      callerModule !== null &&
      node.type === 'Identifier' &&
      node.name === 'expected' &&
      ['heldRefusal', 'heldAggregateRefusal'].includes(enclosingFunctionName(node))
    ) {
      const declared = parent?.type === 'VariableDeclarator' && parent.id === node;
      const field = parent?.type === 'MemberExpression' && parent.object === node && !parent.computed ? parent.property.name : null;
      const use = field === null ? null : parentOf.get(parent);
      const compared =
        use?.type === 'BinaryExpression' &&
        use.operator === '===' &&
        (use.left === parent ? use.right : use.left).type === 'Literal' &&
        (use.left === parent ? use.right : use.left).value === null;
      const equalsCall =
        use?.type === 'MemberExpression' &&
        use.object === parent &&
        !use.computed &&
        use.property.name === 'equals' &&
        parentOf.get(use)?.type === 'CallExpression';
      const fine =
        field === 'exitCode' || field === 'lines' || ((field === 'artifact' || field === 'aggregate') && (compared || equalsCall));
      if (!declared && !fine) {
        report(node, 'engine-stage', 'uses the answer of the re-score beyond its exit, its lines, a null test and a byte comparison');
      }
    }

    // engine-stage: the aggregate the library returns carries its floor decisions, so the re-score module names it only
    // to declare it and to hand it to `this.#engine.serializeArtifact`.
    if (isReproduction && node.type === 'Identifier' && node.name === 'aggregate') {
      const declared = parent?.type === 'VariableDeclarator' && parent.id === node;
      const key = parent?.type === 'Property' && parent.key === node && !parent.shorthand && !parent.computed;
      const otherObjectsField = parent?.type === 'MemberExpression' && parent.property === node && !parent.computed;
      const serialized =
        parent?.type === 'CallExpression' &&
        parent.arguments[0] === node &&
        parent.callee.type === 'MemberExpression' &&
        !parent.callee.computed &&
        parent.callee.property.name === 'serializeArtifact' &&
        parent.callee.object.type === 'MemberExpression' &&
        parent.callee.object.object.type === 'ThisExpression' &&
        parent.callee.object.property.type === 'PrivateIdentifier' &&
        parent.callee.object.property.name === 'engine' &&
        returnedAsBytes(parent);
      if (!declared && !key && !otherObjectsField && !serialized) {
        report(
          node,
          'engine-stage',
          "uses the aggregate the library returns beyond serializing it; its floor decisions are the library's to make",
        );
      }
    }

    // engine-stage: the artifact of a score result already carries the library's verdict, exit and basis, so the
    // re-score module names it only to destructure it, to test it against null, and to serialize it.
    if (isReproduction && node.type === 'Identifier' && node.name === 'artifact') {
      const declared = parent?.type === 'Property' && parentOf.get(parent)?.type === 'ObjectPattern';
      const key = parent?.type === 'Property' && parent.key === node && !parent.shorthand && !parent.computed;
      const otherObjectsField = parent?.type === 'MemberExpression' && parent.property === node && !parent.computed;
      const nullTest =
        parent?.type === 'BinaryExpression' &&
        parent.operator === '===' &&
        (parent.left === node ? parent.right : parent.left).type === 'Literal' &&
        (parent.left === node ? parent.right : parent.left).value === null;
      const serialized =
        parent?.type === 'CallExpression' &&
        parent.arguments[0] === node &&
        parent.callee.type === 'MemberExpression' &&
        !parent.callee.computed &&
        parent.callee.property.name === 'serializeArtifact' &&
        parent.callee.object.type === 'MemberExpression' &&
        parent.callee.object.object.type === 'ThisExpression' &&
        parent.callee.object.property.type === 'PrivateIdentifier' &&
        parent.callee.object.property.name === 'engine' &&
        returnedAsBytes(parent);
      if (!declared && !key && !otherObjectsField && !nullTest && !serialized) {
        report(
          node,
          'engine-stage',
          "uses the artifact of a score result beyond testing it against null and serializing it; its verdict, exit and basis are the library's to decide",
        );
      }
    }

    // engine-stage: the re-score module reads a score result through the three names it destructures and, of the
    // ladder and the qualification, only the fields it compares; no other file reads a ladder.
    if (isReproduction && node.type === 'Identifier' && REPRODUCTION_READS.has(node.name)) {
      const reads = REPRODUCTION_READS.get(node.name);
      const declared = parent?.type === 'Property' && parentOf.get(parent)?.type === 'ObjectPattern';
      const readField =
        parent?.type === 'MemberExpression' && parent.object === node && !parent.computed && reads.has(parent.property.name);
      if (!declared && !readField) {
        report(
          node,
          'engine-stage',
          `uses "${node.name}" of a score result beyond ${[...reads].join(', ')}; the re-score module compares and never decides`,
        );
      }
      // The verdict only as an operand of `=== null` (is there an Invalid result), the exit only as a value of the object
      // `reproduce` returns: neither is handed anywhere else.
      if (readField) {
        const field = parent.property.name;
        const comparison = parentOf.get(parent);
        const verdictTest =
          comparison?.type === 'BinaryExpression' &&
          comparison.operator === '===' &&
          (comparison.left === parent ? comparison.right : comparison.left).type === 'Literal' &&
          (comparison.left === parent ? comparison.right : comparison.left).value === null;
        const returned =
          comparison?.type === 'Property' && comparison.value === parent && parentOf.get(comparison)?.type === 'ObjectExpression';
        const handedBack =
          returned && parentOf.get(parentOf.get(comparison))?.type === 'ReturnStatement' && enclosingMethod(parent) === REPRODUCTION_METHOD;
        if ((field === 'verdict' && !verdictTest) || (field === 'exitCode' && !handedBack)) {
          report(
            parent,
            'engine-stage',
            field === 'verdict'
              ? 'uses the ladder verdict beyond comparing it with null'
              : 'hands the ladder exit anywhere but a value of the object reproduce returns',
          );
        }
      }
    }
    if (!isReproduction && node.type === 'MemberExpression' && memberKey(node) === 'ladder') {
      report(node, 'engine-stage', 'reads "ladder" of a score result; only the re-score module reads one');
    }
    if (!isReproduction && node.type === 'Property' && parent?.type === 'ObjectPattern' && propertyKey(node) === 'ladder') {
      report(node, 'engine-stage', 'destructures "ladder" of a score result; only the re-score module reads one');
    }

    // rollback-literal: `rollbackVerified` is computed, never written true.
    if (node.type === 'Property' && propertyKey(node) === ROLLBACK_FLAG && isTrueLiteral(node.value)) {
      report(node, 'rollback-literal', `writes ${ROLLBACK_FLAG}: true as a literal; the flag is the rollback cycle's own result`);
    }
    if (
      node.type === 'AssignmentExpression' &&
      ((node.left.type === 'MemberExpression' && memberKey(node.left) === ROLLBACK_FLAG) || isIdentifier(node.left, ROLLBACK_FLAG)) &&
      isTrueLiteral(node.right)
    ) {
      report(node, 'rollback-literal', `assigns ${ROLLBACK_FLAG} = true; the flag is the rollback cycle's own result`);
    }
    if (
      node.type === 'AssignmentPattern' &&
      (isIdentifier(node.left, ROLLBACK_FLAG) || (parent?.type === 'Property' && propertyKey(parent) === ROLLBACK_FLAG)) &&
      isTrueLiteral(node.right)
    ) {
      report(node, 'rollback-literal', `defaults ${ROLLBACK_FLAG} to true; the flag is the rollback cycle's own result`);
    }
    if (node.type === 'VariableDeclarator' && isIdentifier(node.id, ROLLBACK_FLAG) && isTrueLiteral(node.init)) {
      report(
        node,
        'rollback-literal',
        `binds ${ROLLBACK_FLAG} to true, which a shorthand property would carry; the flag is the rollback cycle's own result`,
      );
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
  const violations = [];
  let engineImports = 0;

  const toRelative = (file) => path.relative(path.dirname(cliRoot), file).split(path.sep).join('/');
  const { files, links } = filesUnder(cliRoot);
  for (const link of links) {
    violations.push({
      file: toRelative(link),
      line: 1,
      rule: 'symlink',
      message: 'is a symbolic link; cli/ holds only real files, so every file is scanned where it lives',
    });
  }
  for (const file of files) {
    const relative = toRelative(file);
    const source = fs.readFileSync(file, 'utf8');
    const lowered = source.toLowerCase();
    for (const name of FRAMEWORK_NAMES) {
      let offset = lowered.indexOf(name);
      while (offset !== -1) {
        violations.push({
          file: relative,
          line: lineAt(source, offset),
          rule: 'framework-name',
          message: `names the evaluation framework "${name}"; framework code lives in an adopter's evaluator/ folder, never in the runtime (AD-21)`,
        });
        offset = lowered.indexOf(name, offset + 1);
      }
    }
    if (file.startsWith(runtimeDirectory)) {
      let offset = source.indexOf(FORBIDDEN_CONFIG);
      while (offset !== -1) {
        violations.push({ file: relative, line: lineAt(source, offset), rule: 'bmad-config', message: `names "${FORBIDDEN_CONFIG}"` });
        offset = source.indexOf(FORBIDDEN_CONFIG, offset + 1);
      }
    }
    const extension = path.extname(file);
    if (extension === '.json') {
      for (const line of jsonRollbackLiterals(source)) {
        violations.push({
          file: relative,
          line,
          rule: 'rollback-literal',
          message: `holds "${ROLLBACK_FLAG}": true as data; the flag is the rollback cycle's own result`,
        });
      }
    }
    if (DATA_EXTENSIONS.has(extension)) continue;
    if (!SOURCE_EXTENSIONS.has(extension)) {
      violations.push({
        file: relative,
        line: 1,
        rule: 'unscanned',
        message: `has extension "${extension}", which the scanner does not parse; cli/ holds .js, .cjs and .mjs code and ${[...DATA_EXTENSIONS].join(', ')} data only`,
      });
      continue;
    }

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
    const { found, engineImports: imports } = fileViolations({
      source,
      ast,
      isEngine: file === engineFile,
      isReproduction: file === path.join(cliRoot, REPRODUCTION_MODULE),
      callerModule: [SCORE_MODULE, HELD_REFUSAL_MODULE].find((module) => file === path.join(cliRoot, module)) ?? null,
      isSkillRunner: file === path.join(cliRoot, SKILL_RUNNER),
      file,
      projectRoot: path.dirname(cliRoot),
    });
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
  // framework-name (Story 1.17)
  {
    name: 'an import of an evaluation framework',
    file: 'lib/evaluate/judge-with-framework.js',
    rule: 'framework-name',
    source: "'use strict';\nmodule.exports = require('agentevals');\n",
  },
  {
    name: 'an evaluation framework named in a dynamic path',
    file: 'lib/evaluate/framework-path.js',
    rule: 'framework-name',
    source: "'use strict';\nconst where = ['node_modules', 'PromptFoo', 'dist'].join('/');\nmodule.exports = { where };\n",
  },
  {
    name: 'an evaluation framework named in data',
    file: 'lib/evaluate/frameworks.json',
    rule: 'framework-name',
    source: '{ "evaluator": "langsmith" }\n',
  },
  // test-import
  {
    name: 'a runtime module requiring a test/lib file',
    rule: 'test-import',
    file: 'lib/evaluate/other.js',
    source: "const { EXECUTION_TARGETS } = require('../../../test/lib/probe-targets');\nmodule.exports = { EXECUTION_TARGETS };\n",
  },
  {
    name: 'a runner reaching test/ through the package name',
    rule: 'test-import',
    file: 'other-runner.js',
    source: `const helpers = require('${PACKAGE_NAME}/test/lib/probe-targets');\nmodule.exports = { helpers };\n`,
  },
  {
    name: 'a runner building a path into test/',
    rule: 'dynamic-specifier',
    file: 'other-runner.js',
    source:
      "const path = require('node:path');\nconst helpers = require(path.join(__dirname, '..', 'test', 'lib', 'x'));\nmodule.exports = { helpers };\n",
  },
  {
    name: 'a runner requiring the test tree root',
    rule: 'test-import',
    file: 'other-runner.js',
    source: "const helpers = require('../test');\nmodule.exports = { helpers };\n",
  },
  // asset-import
  {
    name: "a runtime module importing the skill's HTTP port template",
    rule: 'asset-import',
    file: 'lib/evaluate/other.js',
    source:
      "module.exports = { load: () => import('../../../src/workflows/testarch/bmad-testarch-evaluate/assets/http-probe-port.mjs') };\n",
  },
  {
    name: 'a runner reaching the templates through the package name',
    rule: 'asset-import',
    file: 'other-runner.js',
    source: `const port = require('${PACKAGE_NAME}/src/workflows/testarch/bmad-testarch-evaluate/assets/http-probe-port.mjs');\nmodule.exports = { port };\n`,
  },
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
    name: 'preflightFromObservations in the re-score module',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source: "const engine = require('./engine');\nengine.preflightFromObservations({});\n",
  },
  {
    name: 'runScore through a local alias in the re-score module',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      "const engine = require('./engine');\nasync function f(options) {\n  const library = await engine.loadEngine();\n  return library.runScore(options);\n}\nmodule.exports = { f };\n",
  },
  {
    name: 'runScore through a public engine property in the re-score module',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  constructor(engine) {\n    this.engine = engine;\n  }\n\n  score(options) {\n    return this.engine.runScore(options);\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'runScore destructured in the re-score module',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  reproduce(options) {\n    const { runScore } = this.#engine;\n    return runScore(options);\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'a verdict read from a score result in the re-score module',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  async reproduce(options) {\n    const result = await this.#engine.runScore(options);\n    return result.ladder.exitCode;\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'a verdict destructured from a score result in the re-score module',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  async reproduce(options) {\n    const { ladder } = await this.#engine.runScore(options);\n    return ladder;\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'the exact re-score spelling in a file of the same base name elsewhere',
    rule: 'engine-stage',
    file: 'lib/other/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  async reproduce(options) {\n    return (await this.#engine.runScore(options)).artifact;\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'a runScore reference returned from the re-score module',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source: 'class Held {\n  #engine;\n\n  scorer() {\n    return this.#engine.runScore;\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'a rest element over a score result in the re-score module',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  async reproduce(options) {\n    const { artifact, ...rest } = await this.#engine.runScore(options);\n    return rest;\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'a renamed key over a score result in the re-score module',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  async reproduce(options) {\n    const { ladder: l } = await this.#engine.runScore(options);\n    return l.exitCode;\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'a ladder field the re-score module does not compare',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  async reproduce(options) {\n    const { ladder } = await this.#engine.runScore(options);\n    return ladder.strictPromotable;\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'a qualification field the re-score module does not compare',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  async reproduce(options) {\n    const { qualification } = await this.#engine.runScore(options);\n    return qualification.qualified;\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'a runScore call that is not awaited into a destructuring',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  async reproduce(options) {\n    const { artifact } = this.#engine.runScore(options);\n    return artifact;\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'a ladder read through member access in another file',
    rule: 'engine-stage',
    file: 'lib/evaluate/leak-user.js',
    source: 'module.exports = { exitOf: (scored) => scored.ladder.exitCode };\n',
  },
  {
    name: 'a ladder destructured in another file',
    rule: 'engine-stage',
    file: 'lib/evaluate/leak-pattern.js',
    source: 'module.exports = { basisOf: ({ ladder }) => ladder.basis };\n',
  },
  {
    name: 'a verdict handed out by a second method of the re-score module',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  async verdictOf(options) {\n    const { artifact, ladder, qualification } = await this.#engine.runScore(options);\n    return ladder.verdict;\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'an exit handed out by a second method of the re-score module',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  async exitOf(options) {\n    const { ladder } = await this.#engine.runScore(options);\n    return ladder.exitCode;\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'a second runScore call site inside reproduce',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  async reproduce(options) {\n    const { artifact, ladder, qualification } = await this.#engine.runScore(options);\n    const again = await this.#engine.runScore(options);\n    return { artifact, exitCode: ladder.exitCode, lines: [] };\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'a second destructured runScore call inside reproduce',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  async reproduce(options) {\n    const { artifact } = await this.#engine.runScore(options);\n    const { ladder } = await this.#engine.runScore(options);\n    return { artifact, exitCode: ladder.exitCode, lines: [] };\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'the ladder verdict used beyond a null test in reproduce',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  async reproduce(options) {\n    const { artifact, ladder } = await this.#engine.runScore(options);\n    return { artifact, exitCode: ladder.exitCode, verdict: ladder.verdict };\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'the ladder exit stored outside the returned object in reproduce',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  async reproduce(options) {\n    const { artifact, ladder } = await this.#engine.runScore(options);\n    this.last = ladder.exitCode;\n    return { artifact };\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'the ladder exit returned bare from reproduce',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  async reproduce(options) {\n    const { ladder } = await this.#engine.runScore(options);\n    return ladder.exitCode;\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'a lone runScore call in a method other than reproduce',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  async other(options) {\n    const { artifact } = await this.#engine.runScore(options);\n    return artifact;\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'the production verdict returned from reproduce',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  async reproduce(options) {\n    const { artifact, ladder } = await this.#engine.runScore(options);\n    return { artifact, exitCode: ladder.exitCode, verdict: artifact === null ? null : artifact.productionVerdict };\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'the contract verdict returned from reproduce',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  async reproduce(options) {\n    const { artifact, ladder } = await this.#engine.runScore(options);\n    return { artifact, exitCode: ladder.exitCode, verdict: artifact === null ? null : artifact.contractVerdict };\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'the artifact exit returned from reproduce',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  async reproduce(options) {\n    const { artifact, ladder } = await this.#engine.runScore(options);\n    return { artifact, exitCode: ladder.exitCode, engineExit: artifact === null ? null : artifact.exitCode };\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'the artifact destructured into another variable that is read',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  async reproduce(options) {\n    const { artifact, ladder } = await this.#engine.runScore(options);\n    const { exitCode: engineExit } = artifact;\n    return { artifact: null, exitCode: engineExit };\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'the artifact handed to another call',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  async reproduce(options) {\n    const { artifact, ladder } = await this.#engine.runScore(options);\n    this.note(artifact);\n    return { artifact: null, exitCode: ladder.exitCode };\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'aggregateStrength called outside reproduceAggregate',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  reproduce(bytes) {\n    const aggregate = this.#engine.aggregateStrength(bytes);\n    return this.#engine.serializeArtifact(aggregate, "StrengthAggregate");\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'a second aggregateStrength call site in reproduceAggregate',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  reproduceAggregate(bytes) {\n    const aggregate = this.#engine.aggregateStrength(bytes);\n    const again = this.#engine.aggregateStrength(bytes);\n    return this.#engine.serializeArtifact(aggregate, "StrengthAggregate");\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'the aggregate result not bound to aggregate',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  reproduceAggregate(bytes) {\n    const result = this.#engine.aggregateStrength(bytes);\n    return this.#engine.serializeArtifact(result, "StrengthAggregate");\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'a floor decision read from the aggregate',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  reproduceAggregate(bytes) {\n    const aggregate = this.#engine.aggregateStrength(bytes);\n    return { aggregate: this.#engine.serializeArtifact(aggregate, "StrengthAggregate"), decisions: aggregate.floorDecisions };\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'the aggregate returned bare',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  reproduceAggregate(bytes) {\n    const aggregate = this.#engine.aggregateStrength(bytes);\n    return aggregate;\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'aggregateStrength reached through a local alias',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  reproduceAggregate(bytes) {\n    const library = this.#engine;\n    const aggregate = library.aggregateStrength(bytes);\n    return this.#engine.serializeArtifact(aggregate, "StrengthAggregate");\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'a second aggregateStrength call bound to aggregate in reproduceAggregate',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  reproduceAggregate(bytes) {\n    {\n      const aggregate = this.#engine.aggregateStrength(bytes);\n      this.#engine.serializeArtifact(aggregate, "StrengthAggregate");\n    }\n    {\n      const aggregate = this.#engine.aggregateStrength(bytes);\n      return this.#engine.serializeArtifact(aggregate, "StrengthAggregate");\n    }\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'a floor decision parsed from the serialized aggregate in reproduceAggregate',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  reproduceAggregate(bytes) {\n    const aggregate = this.#engine.aggregateStrength(bytes);\n    const text = this.#engine.serializeArtifact(aggregate, "StrengthAggregate");\n    return { aggregate: Buffer.from(text, "utf8"), exitCode: 0, floorDecisions: JSON.parse(text).floorDecisions };\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'a verdict parsed from the serialized artifact in reproduce',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  async reproduce(options) {\n    const { artifact, ladder } = await this.#engine.runScore(options);\n    return { artifact: null, exitCode: ladder.exitCode, verdict: JSON.parse(this.#engine.serializeArtifact(artifact, "EvidenceArtifact")).productionVerdict };\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'the serialization returned as text, not bytes, from reproduceAggregate',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  reproduceAggregate(bytes) {\n    const aggregate = this.#engine.aggregateStrength(bytes);\n    return { aggregate: this.#engine.serializeArtifact(aggregate, "StrengthAggregate"), exitCode: 0 };\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'a published closure holding the aggregateStrength call',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  reproduceAggregate(bytes) {\n    this.aggregateWith = (inputs) => {\n      const aggregate = this.#engine.aggregateStrength(inputs);\n      return { aggregate: Buffer.from(this.#engine.serializeArtifact(aggregate, "StrengthAggregate"), "utf8"), exitCode: 0 };\n    };\n    return { aggregate: null, exitCode: 0 };\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'a published closure holding the runScore call',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  async reproduce(options) {\n    this.scoreWith = async (inputs) => {\n      const { artifact, ladder } = await this.#engine.runScore(inputs);\n      return { artifact: Buffer.from(this.#engine.serializeArtifact(artifact, "EvidenceArtifact"), "utf8"), exitCode: ladder.exitCode };\n    };\n    return { artifact: null, exitCode: 0 };\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'an inner function expression holding the runScore call',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source:
      'class Held {\n  #engine;\n\n  async reproduce(options) {\n    const inner = async function (inputs) {\n      const { artifact, ladder } = await this.#engine.runScore(inputs);\n      return { artifact: Buffer.from(this.#engine.serializeArtifact(artifact, "EvidenceArtifact"), "utf8"), exitCode: ladder.exitCode };\n    };\n    return { artifact: null, exitCode: 0 };\n  }\n}\nmodule.exports = { Held };\n',
  },
  {
    name: 'reproduceAggregate asked for from another module',
    rule: 'engine-stage',
    file: 'lib/evaluate/other.js',
    source: 'function other(held, bytes) {\n  return held.reproduceAggregate(bytes);\n}\nmodule.exports = { other };\n',
  },
  {
    name: 'reproduce asked for outside heldRefusal in held-refusal.js',
    rule: 'engine-stage',
    file: 'lib/evaluate/held-refusal.js',
    source: 'async function elsewhere(held, set) {\n  return held.reproduce(set);\n}\nmodule.exports = { elsewhere };\n',
  },
  {
    name: 'reproduce asked for twice in heldRefusal',
    rule: 'engine-stage',
    file: 'lib/evaluate/held-refusal.js',
    source:
      'async function heldRefusal(held, set) {\n  const expected = await held.reproduce(set);\n  const again = await held.reproduce(set);\n  return expected.exitCode + again.exitCode;\n}\nmodule.exports = { heldRefusal };\n',
  },
  {
    name: 'reproduce asked for in score.js, in a function named heldRefusal',
    rule: 'engine-stage',
    file: 'lib/evaluate/score.js',
    source:
      'async function heldRefusal(held, set) {\n  const expected = await held.reproduce(set);\n  return expected.exitCode;\n}\nmodule.exports = { heldRefusal };\n',
  },
  {
    name: 'reproduce asked for in score.js, elsewhere',
    rule: 'engine-stage',
    file: 'lib/evaluate/score.js',
    source: 'async function scoreProbe(held, set) {\n  return held.reproduce(set);\n}\nmodule.exports = { scoreProbe };\n',
  },
  {
    name: 'reproduce asked for in run.js, in a function named heldRefusal',
    rule: 'engine-stage',
    file: 'lib/evaluate/run.js',
    source:
      'async function heldRefusal(held, set) {\n  const expected = await held.reproduce(set);\n  return expected.exitCode;\n}\nmodule.exports = { heldRefusal };\n',
  },
  {
    name: 'reproduce asked for in scoreAttempt of run.js',
    rule: 'engine-stage',
    file: 'lib/evaluate/run.js',
    source: 'async function scoreAttempt(held, set) {\n  return held.reproduce(set);\n}\nmodule.exports = { scoreAttempt };\n',
  },
  {
    name: 'reproduceAggregate asked for in held-refusal.js, in a function named heldAggregateRefusal',
    rule: 'engine-stage',
    file: 'lib/evaluate/held-refusal.js',
    source:
      'function heldAggregateRefusal(held, bytes) {\n  const expected = held.reproduceAggregate(bytes);\n  return expected.exitCode;\n}\nmodule.exports = { heldAggregateRefusal };\n',
  },
  {
    name: 'the aggregate answer parsed in heldAggregateRefusal',
    rule: 'engine-stage',
    file: 'lib/evaluate/score.js',
    source:
      'function heldAggregateRefusal(held, bytes) {\n  const expected = held.reproduceAggregate(bytes);\n  return JSON.parse(expected.aggregate).floorDecisions;\n}\nmodule.exports = { heldAggregateRefusal };\n',
  },
  {
    name: 'the whole answer returned from heldRefusal',
    rule: 'engine-stage',
    file: 'lib/evaluate/held-refusal.js',
    source:
      'async function heldRefusal(held, set) {\n  const expected = await held.reproduce(set);\n  return expected;\n}\nmodule.exports = { heldRefusal };\n',
  },
  {
    name: 'seal in the re-score module',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs.js',
    source: "const engine = require('./engine');\nconst { seal } = engine;\nseal({});\n",
  },
  {
    name: 'runScore in a sibling of the re-score module',
    rule: 'engine-stage',
    file: 'lib/evaluate/score-inputs-2.js',
    source: "const engine = require('./engine');\nengine.runScore({});\n",
  },
  {
    name: 'aggregateStrength on the engine module (the library import in place of the CLI stage, Story 1.45)',
    rule: 'engine-stage',
    file: 'lib/evaluate/score.js',
    source: "const engine = require('./engine');\nengine.aggregateStrength({});\n",
  },
  {
    name: 'aggregateStrength destructured from the engine module',
    rule: 'engine-stage',
    file: 'lib/evaluate/aggregate.js',
    source: `${LOADER}async function f() {\n  const { aggregateStrength } = await loadEngine();\n  return aggregateStrength;\n}\nmodule.exports = { f };\n`,
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

  // Review round 3
  {
    name: 'a createRequire imported under another name',
    rule: 'engine-import',
    file: 'lib/created-renamed.mjs',
    source:
      "import { createRequire as cr } from 'node:module';\nconst load = cr(import.meta.url);\nexport const eq = load('eval-quality');\n",
  },
  {
    name: 'a createRequire destructured under another name',
    rule: 'engine-import',
    file: 'lib/created-destructured.js',
    source: "const { createRequire: cr } = require('node:module');\nconst load = cr(__filename);\nconst eq = load('eval-quality');\n",
  },
  {
    name: 'an alias of require',
    rule: 'engine-import',
    file: 'lib/require-alias.js',
    source: "const r = require;\nconst eq = r('eval-quality');\n",
  },
  {
    name: 'a computed specifier through an alias of require under the runtime',
    rule: 'dynamic-specifier',
    file: 'lib/evaluate/require-alias.js',
    source: "const r = require;\nconst name = './engine';\nconst engine = r(name);\n",
  },
  {
    name: 'a symbolic link under cli/',
    rule: 'symlink',
    file: 'lib/linked.js',
    links: { 'lib/linked.js': 'evaluate/engine.js' },
  },
  {
    name: 'a TypeScript file Node runs natively',
    rule: 'unscanned',
    file: 'lib/evaluate/stage.ts',
    source: "const engine = require('./engine');\nengine.runScore({});\n",
  },
  {
    name: 'an extensionless script',
    rule: 'unscanned',
    file: 'run-engine',
    source: "#!/usr/bin/env node\nrequire('eval-quality');\n",
  },
  {
    name: 'seal on a rebound Object',
    rule: 'engine-stage',
    file: 'lib/evaluate/object-rebound.js',
    source: "const Object = require('./engine');\nObject.seal({});\n",
  },
  {
    name: 'seal by bracket on an Object parameter',
    rule: 'engine-stage',
    file: 'lib/evaluate/object-parameter.js',
    source: "function f(Object) {\n  return Object['seal']();\n}\nmodule.exports = { f };\n",
  },
  {
    name: 'import.meta.resolve of the engine',
    rule: 'engine-import',
    file: 'lib/meta-resolve.mjs',
    source: "export const where = import.meta.resolve('eval-quality');\n",
  },

  // bmad-config and parse
  {
    name: 'a _bmad path under the runtime',
    rule: 'bmad-config',
    file: 'lib/evaluate/config.js',
    source: "const CONFIG = '_bmad/tea/config.yaml';\nmodule.exports = { CONFIG };\n",
  },
  // install-probe and vendor-name (Story 1.6)
  {
    name: 'the skill runner reading the home directory',
    rule: 'install-probe',
    file: SKILL_RUNNER,
    source: "const os = require('node:os');\nconst root = os.homedir();\nmodule.exports = { root };\n",
  },
  {
    name: 'the skill runner reading HOME from the environment',
    rule: 'install-probe',
    file: SKILL_RUNNER,
    source: "const home = process.env['HOME'];\nmodule.exports = { home };\n",
  },
  {
    name: 'the skill runner looking in an agent skills folder',
    rule: 'install-probe',
    file: SKILL_RUNNER,
    source:
      "const path = require('node:path');\nconst candidate = path.join(process.cwd(), '.claude/skills');\nmodule.exports = { candidate };\n",
  },
  {
    name: 'the skill runner looking in an installed module layout by template',
    rule: 'install-probe',
    file: SKILL_RUNNER,
    source: 'const candidate = `${process.cwd()}/_bmad/tea/workflows`;\nmodule.exports = { candidate };\n',
  },
  {
    name: 'the skill runner loading the install-location resolver',
    rule: 'install-probe',
    file: SKILL_RUNNER,
    source: "const { resolveSkill } = require('./lib/resolve-skill');\nmodule.exports = { resolveSkill };\n",
  },
  {
    name: 'the skill runner defaulting to a vendor',
    rule: 'vendor-name',
    file: SKILL_RUNNER,
    source: `const DEFAULT_AGENT = '${VENDOR_NAMES[0]}';\nmodule.exports = { DEFAULT_AGENT };\n`,
  },
  {
    name: 'the skill runner naming a vendor inside a camelCase identifier',
    rule: 'vendor-name',
    file: SKILL_RUNNER,
    source: `const ${VENDOR_NAMES[0]}Args = [];\nmodule.exports = { ${VENDOR_NAMES[0]}Args };\n`,
  },
  {
    name: 'the skill runner naming a vendor as two words',
    rule: 'vendor-name',
    file: SKILL_RUNNER,
    source: 'class OpenAIClient {}\nmodule.exports = { OpenAIClient };\n',
  },
  {
    name: 'the skill runner naming a vendor credential',
    rule: 'vendor-name',
    file: SKILL_RUNNER,
    source: "const KEY = 'ANTHROPIC_API_KEY';\nmodule.exports = { KEY };\n",
  },
  // rollback-literal
  {
    name: 'a rollbackVerified: true property',
    rule: 'rollback-literal',
    file: 'lib/evaluate/qualified.js',
    source: "const qualification = { route: 'controlled-mutation', rollbackVerified: true };\nmodule.exports = { qualification };\n",
  },
  {
    name: 'a quoted rollbackVerified key set to true',
    rule: 'rollback-literal',
    file: 'lib/evaluate/qualified.js',
    source: "module.exports = { 'rollbackVerified': true };\n",
  },
  {
    name: 'rollbackVerified assigned true',
    rule: 'rollback-literal',
    file: 'lib/evaluate/qualified.js',
    source: 'function mark(evidence) {\n  evidence.rollbackVerified = true;\n}\nmodule.exports = { mark };\n',
  },
  {
    name: 'a computed rollbackVerified key set to true',
    rule: 'rollback-literal',
    file: 'lib/evaluate/qualified.js',
    source: "module.exports = { ['rollbackVerified']: true };\n",
  },
  {
    name: 'rollbackVerified bound to true and handed out in shorthand',
    rule: 'rollback-literal',
    file: 'lib/evaluate/qualified.js',
    source: 'function qualify() {\n  const rollbackVerified = true;\n  return { rollbackVerified };\n}\nmodule.exports = { qualify };\n',
  },
  {
    name: 'rollbackVerified defaulted to true in a destructured parameter',
    rule: 'rollback-literal',
    file: 'lib/evaluate/qualified.js',
    source: 'function qualify({ rollbackVerified = true }) {\n  return { rollbackVerified };\n}\nmodule.exports = { qualify };\n',
  },
  {
    name: 'rollbackVerified defaulted to true under another name',
    rule: 'rollback-literal',
    file: 'lib/evaluate/qualified.js',
    source: 'function qualify({ rollbackVerified: verified = true }) {\n  return verified;\n}\nmodule.exports = { qualify };\n',
  },
  {
    name: 'rollbackVerified reassigned true',
    rule: 'rollback-literal',
    file: 'lib/evaluate/qualified.js',
    source:
      'let rollbackVerified = false;\nfunction mark() {\n  rollbackVerified = true;\n}\nmodule.exports = { mark, get: () => rollbackVerified };\n',
  },
  {
    name: 'a JSON template under cli/ holding rollbackVerified true',
    rule: 'rollback-literal',
    file: 'lib/evaluate/qualification-template.json',
    source: '{\n  "route": "controlled-mutation",\n  "rollbackVerified": true\n}\n',
  },
  {
    name: 'rollbackVerified assigned true by bracket access, outside the runtime',
    rule: 'rollback-literal',
    file: 'lib/other.js',
    source: "function mark(evidence) {\n  evidence['rollbackVerified'] = true;\n}\nmodule.exports = { mark };\n",
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
    name: 'a runner other than the skill runner defaulting to a vendor and reading the home directory',
    file: 'trace-runner.js',
    source: "const os = require('node:os');\nconst DEFAULT_AGENT = 'claude';\nmodule.exports = { DEFAULT_AGENT, home: os.homedir() };\n",
  },
  {
    name: "the skill runner naming vendors and install locations only in comments, and a word holding a vendor's letters",
    file: SKILL_RUNNER,
    source:
      "// No ~/.claude/skills lookup, no os.homedir(), no default of claude or codex.\nconst adapters = require('./lib/agent-adapters');\nconst strategy = 'legacy';\nmodule.exports = { adapters, strategy };\n",
  },
  {
    name: 'runScore awaited into artifact, ladder and qualification in the re-score module, comparing the fields it may',
    file: 'lib/evaluate/score-inputs.js',
    source: [
      'class Held {',
      '  #engine;',
      '',
      '  constructor(engine) {',
      '    this.#engine = engine;',
      '  }',
      '',
      '  async reproduce(options) {',
      '    const { artifact, ladder, qualification } = await this.#engine.runScore(options);',
      '    const lines = qualification.failures.map((failure) => failure.detail);',
      '    if (ladder.verdict === null) lines.push(...ladder.basis);',
      '    return { artifact: artifact === null ? null : Buffer.from(this.#engine.serializeArtifact(artifact, "EvidenceArtifact"), "utf8"), exitCode: ladder.exitCode, lines };',
      '  }',
      '}',
      'module.exports = { Held };',
      '',
    ].join('\n'),
  },
  {
    name: 'aggregateStrength bound to aggregate and serialized in reproduceAggregate',
    file: 'lib/evaluate/score-inputs.js',
    source: [
      'class Held {',
      '  #engine;',
      '',
      '  constructor(engine) {',
      '    this.#engine = engine;',
      '  }',
      '',
      '  reproduceAggregate(bytes) {',
      '    const aggregate = this.#engine.aggregateStrength(bytes);',
      '    return { aggregate: Buffer.from(this.#engine.serializeArtifact(aggregate, "StrengthAggregate"), "utf8"), exitCode: 0 };',
      '  }',
      '}',
      'module.exports = { Held };',
      '',
    ].join('\n'),
  },
  {
    name: 'held-refusal.js asking for the re-score once and comparing it',
    file: 'lib/evaluate/held-refusal.js',
    source: [
      'async function heldRefusal(held, set, staged) {',
      '  const expected = await held.reproduce(set);',
      '  if (expected.artifact === null) return staged === null ? null : "none";',
      '  return expected.artifact.equals(staged) && expected.exitCode === 0 ? expected.lines : "differs";',
      '}',
      'module.exports = { heldRefusal };',
      '',
    ].join('\n'),
  },
  {
    name: 'score.js asking for the re-aggregation once and comparing it, and run.js calling the shared comparison',
    file: 'lib/evaluate/score.js',
    source: [
      "const { heldRefusal } = require('./held-refusal');",
      'function heldAggregateRefusal(held, bytes, staged) {',
      '  const expected = held.reproduceAggregate(bytes);',
      '  return expected.aggregate === null ? expected.exitCode : expected.aggregate.equals(staged);',
      '}',
      'async function scoreProbe(held, set, staged) {',
      '  return heldRefusal({ held, set, staged });',
      '}',
      'module.exports = { heldAggregateRefusal, scoreProbe };',
      '',
    ].join('\n'),
  },
  {
    name: 'run.js calling the shared comparison and asking for no re-score of its own',
    file: 'lib/evaluate/run.js',
    source: [
      "const { heldRefusal } = require('./held-refusal');",
      'async function scoreAttempt(held, set, staged) {',
      '  return heldRefusal({ held, set: held.index.trialSets[0], staged });',
      '}',
      'module.exports = { scoreAttempt };',
      '',
    ].join('\n'),
  },
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
    name: 'rollbackVerified computed, in shorthand, and set false',
    file: 'lib/evaluate/rollback.js',
    source: [
      'function verify(evidence, rePassed) {',
      '  evidence.rollbackVerified = evidence.restoredDigest === evidence.preDigest && rePassed;',
      '  const rollbackVerified = evidence.rollbackVerified;',
      '  // A rollbackVerified: true literal is what this rule refuses; this comment is not one.',
      '  return { rollbackVerified, reset: { rollbackVerified: false } };',
      '}',
      'module.exports = { verify };',
      '',
    ].join('\n'),
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
  const written = plant.source === undefined ? { ...plant.extra } : { ...plant.extra, [plant.file]: plant.source };
  for (const [file, source] of Object.entries(written)) {
    const target = path.join(cliRoot, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, source);
  }
  for (const [link, target] of Object.entries(plant.links ?? {})) {
    fs.mkdirSync(path.dirname(path.join(cliRoot, link)), { recursive: true });
    fs.symlinkSync(target, path.join(cliRoot, link));
  }
  return { root, cliRoot };
}

/**
 * The `rollback-literal` violations of one file outside `cli/`, found by the same walker `scanCli` runs.
 * Story 1.49: the test-design qualification module reaches the flag through the runtime's cycle, so it holds no literal either.
 */
function rollbackLiteralsIn(file) {
  const source = fs.readFileSync(file, 'utf8');
  const { found } = fileViolations({
    source,
    ast: parseSource(file, source),
    isEngine: false,
    isReproduction: false,
    callerModule: null,
    isSkillRunner: false,
    file,
    projectRoot: PROJECT_ROOT,
  });
  return found.filter((violation) => violation.rule === 'rollback-literal');
}

/** Files outside `cli/` that state the rollback flag from a cycle's result and never write it true. */
const ROLLBACK_CHECKED_FILES = ['test/lib/test-design-qualification.js'];

function checkRollbackLiteralOutsideCli() {
  const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-boundaries-rollback-'));
  try {
    const planted = path.join(scratchRoot, 'planted.js');
    fs.writeFileSync(planted, 'module.exports = { rollbackVerified: true };\n');
    check(rollbackLiteralsIn(planted).length === 1, 'the rollback-literal walker missed a planted literal outside cli/');
  } finally {
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  }
  for (const relative of ROLLBACK_CHECKED_FILES) {
    for (const violation of rollbackLiteralsIn(path.join(PROJECT_ROOT, relative))) {
      check(false, `${relative}:${violation.line} [rollback-literal] ${violation.message}`);
    }
  }
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
  // The install-probe and vendor-name rules key on this path, so a renamed or
  // moved runner would leave them scanning nothing.
  const manifest = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
  check(fs.existsSync(path.join(CLI_ROOT, SKILL_RUNNER)), `cli/${SKILL_RUNNER} is missing, so the skill runner's rules scan nothing`);
  check(
    manifest.bin?.['tea-skill-runner'] === `cli/${SKILL_RUNNER}`,
    `package.json's tea-skill-runner bin is ${JSON.stringify(manifest.bin?.['tea-skill-runner'])}, not the file the skill runner's rules scan`,
  );
  const { violations, engineImports } = scanCli(CLI_ROOT);
  for (const violation of violations) {
    check(false, `${violation.file}:${violation.line} [${violation.rule}] ${violation.message}`);
  }
  check(engineImports > 0, 'cli/lib/evaluate/engine.js names eval-quality nowhere; the runtime has no door to the engine');
}

// ---------------------------------------------------------------------------
// The moved definitions (Story 1.5, R1-06)

/** Each `test/lib/` file AD-5 generalizes, the runtime module it now requires, and the definitions that moved there. */
const MOVES = [
  {
    testFile: 'test/lib/probe-targets.js',
    runtimeModule: 'cli/lib/evaluate/registry.js',
    specifier: '../../cli/lib/evaluate/registry',
    definitions: ['commandTargetPolicy'],
    // The file hands out the functions of one registry it builds, exported as
    // `registry`, so its re-exports are compared with that registry's own.
    exportsRegistry: true,
  },
  {
    testFile: 'test/lib/eval-quality-inputs.js',
    runtimeModule: 'cli/lib/evaluate/records.js',
    specifier: '../../cli/lib/evaluate/records',
    definitions: ['sealedRunRecord'],
  },
  {
    testFile: 'test/lib/eval-record.js',
    runtimeModule: 'cli/lib/evaluate/digest.js',
    specifier: '../../cli/lib/evaluate/digest',
    definitions: ['repositoryState'],
  },
  // Story 1.7 (AD-5, AD-8): the live harness's per-leg staging and leg cache,
  // and the mutate, measure, restore cycle, keep only TeA data.
  {
    testFile: 'test/eval-contract-strength.js',
    runtimeModule: 'cli/lib/evaluate/workspace.js',
    specifier: '../cli/lib/evaluate/workspace',
    definitions: ['cachingPort', 'stageDirectories'],
  },
  {
    testFile: 'test/test-automate-eval-fixture.js',
    runtimeModule: 'cli/lib/evaluate/mutation.js',
    specifier: '../cli/lib/evaluate/mutation',
    definitions: ['runMutationCycle'],
  },
  // Story 2.1 (AD-12): the comparison logic of the two test helpers is the
  // runtime's `compare.js`; the helpers keep TeA's own data and import it.
  {
    testFile: 'test/lib/compare-dominance.js',
    runtimeModule: 'cli/lib/evaluate/compare.js',
    specifier: '../../cli/lib/evaluate/compare',
    definitions: ['compareStoredResults'],
  },
  {
    testFile: 'test/lib/compare-eval-runs.js',
    runtimeModule: 'cli/lib/evaluate/compare.js',
    specifier: '../../cli/lib/evaluate/compare',
    definitions: ['isComparableShaped'],
  },
];
/**
 * Wrappers a `test/lib/` file may define under a runtime function's name, each
 * with the reason. `digestFiles` hands the runtime digest TEA's own
 * file-system port as its byte reader. `refusalReason` in `compare-eval-runs.js`
 * is the run-summary refusal: the runtime's version refusal plus TeA's own
 * suite-manifest rules (declared repetitions and thresholds), which share a name
 * with the runtime's comparability-key refusal and are another function.
 */
const WRAPPER_EXEMPTIONS = {
  'test/lib/eval-record.js': new Set(['digestFiles']),
  'test/lib/compare-eval-runs.js': new Set(['refusalReason']),
};
const TEST_LIB = 'test/lib';
/** The runtime modules Story 1.5 moved code into; every function each declares is guarded. */
const GUARDED_MODULES = [...new Set(MOVES.map((move) => move.runtimeModule)), 'cli/lib/evaluate/bounded-probe.js'];
const SCHEMA_VERSIONS_FILE = 'test/lib/eval-quality-schema-versions.js';
const SCHEMA_VERSION_DEFINITIONS = ['expectedSchemaVersion', 'schemaVersionProblems'];
const ENGINE_FILE = 'cli/lib/evaluate/engine.js';
const CONFIG_FILE = 'eval-quality.config.json';

function isFunctionNode(node) {
  return node?.type === 'FunctionExpression' || node?.type === 'ArrowFunctionExpression';
}

/**
 * Every name a file defines as a function, with how often: a function
 * declaration, a variable bound or assigned a function expression or arrow, an
 * object property or method, a class method, a function assigned to a member
 * (`exports.name = function () {}`), or a local function handed out under
 * another name (`module.exports.name = local`, `{ name: local }`).
 */
function definedFunctions(ast) {
  const defined = new Map();
  const add = (name) => {
    if (typeof name === 'string') defined.set(name, (defined.get(name) ?? 0) + 1);
  };
  const local = new Set();
  const aliases = [];
  walk(ast, (node, parent) => {
    if (node.type === 'FunctionDeclaration' && node.id) {
      add(node.id.name);
      local.add(node.id.name);
    }
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && isFunctionNode(node.init)) {
      add(node.id.name);
      local.add(node.id.name);
    }
    if (node.type === 'AssignmentExpression' && node.left.type === 'Identifier' && isFunctionNode(node.right)) {
      add(node.left.name);
      local.add(node.left.name);
    }
    if (node.type === 'Property' && parent?.type !== 'ObjectPattern' && (node.method || isFunctionNode(node.value))) add(propertyKey(node));
    if (node.type === 'MethodDefinition') add(propertyKey(node));
    if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression' && isFunctionNode(node.right))
      add(memberKey(node.left));
    if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression' && node.right.type === 'Identifier') {
      aliases.push([memberKey(node.left), node.right.name]);
    }
    if (node.type === 'Property' && parent?.type === 'ObjectExpression' && node.value.type === 'Identifier') {
      aliases.push([propertyKey(node), node.value.name]);
    }
  });
  for (const [name, target] of aliases) {
    if (local.has(target) && name !== target) add(name);
  }
  return defined;
}

/** Whether `node` is `module.exports` or `exports`. */
function isExportsObject(node) {
  return (
    isIdentifier(node, 'exports') ||
    (node?.type === 'MemberExpression' && isIdentifier(node.object, 'module') && memberKey(node) === 'exports')
  );
}

/**
 * The functions a file defines at its top level or hands out through its
 * exports: a top-level function declaration or variable bound to a function,
 * a function or local function assigned to `module.exports.name`, and each
 * function, method or local function in an object assigned to
 * `module.exports`. Methods of other objects are the file's own business.
 */
function topLevelFunctions(ast) {
  const defined = new Map();
  const add = (name) => {
    if (typeof name === 'string') defined.set(name, (defined.get(name) ?? 0) + 1);
  };
  const local = new Set();
  for (const statement of ast.body) {
    if (statement.type === 'FunctionDeclaration' && statement.id) local.add(statement.id.name);
    if (statement.type === 'VariableDeclaration') {
      for (const declarator of statement.declarations) {
        if (declarator.id.type === 'Identifier' && isFunctionNode(declarator.init)) local.add(declarator.id.name);
      }
    }
  }
  for (const name of local) add(name);
  const handsOut = (value) => isFunctionNode(value) || (value?.type === 'Identifier' && local.has(value.name));
  for (const statement of ast.body) {
    if (statement.type !== 'ExpressionStatement' || statement.expression.type !== 'AssignmentExpression') continue;
    const { left, right } = statement.expression;
    if (left.type === 'MemberExpression' && isExportsObject(left.object) && handsOut(right)) add(memberKey(left));
    if (isExportsObject(left) && right.type === 'ObjectExpression') {
      for (const property of right.properties) {
        if (
          property.type === 'Property' &&
          (property.method || handsOut(property.value)) &&
          propertyKey(property) !== property.value?.name
        ) {
          add(propertyKey(property));
        }
      }
    }
  }
  return defined;
}

/**
 * The functions a factory declares in its own body and hands out from a
 * top-level `return`: the function itself (`return validateArtifact`), or each
 * one named in a returned object literal, frozen or not
 * (`return Object.freeze({ targetFor, targetProblems })`). A function a factory
 * builds and returns is as much the module's export as a top-level one, so it
 * is guarded the same way.
 */
function factoryProducts(factory) {
  const body = factory.body?.type === 'BlockStatement' ? factory.body.body : [];
  const inner = new Set();
  const objects = new Map();
  for (const statement of body) {
    if (statement.type === 'FunctionDeclaration' && statement.id) inner.add(statement.id.name);
    if (statement.type !== 'VariableDeclaration') continue;
    for (const declarator of statement.declarations) {
      if (declarator.id.type !== 'Identifier') continue;
      if (isFunctionNode(declarator.init)) inner.add(declarator.id.name);
      else objects.set(declarator.id.name, declarator.init);
    }
  }
  const unwrap = (node) => {
    let value = node;
    if (value?.type === 'Identifier' && objects.has(value.name)) value = objects.get(value.name);
    if (
      value?.type === 'CallExpression' &&
      value.callee.type === 'MemberExpression' &&
      isIdentifier(value.callee.object, 'Object') &&
      memberKey(value.callee) === 'freeze'
    ) {
      value = value.arguments[0];
    }
    return value;
  };
  const products = new Set();
  for (const statement of body) {
    if (statement.type !== 'ReturnStatement' || statement.argument === null) continue;
    if (statement.argument.type === 'Identifier' && inner.has(statement.argument.name)) {
      products.add(statement.argument.name);
      continue;
    }
    const returned = unwrap(statement.argument);
    if (returned?.type !== 'ObjectExpression') continue;
    for (const property of returned.properties) {
      if (property.type !== 'Property') continue;
      if (property.method || isFunctionNode(property.value) || (property.value.type === 'Identifier' && inner.has(property.value.name))) {
        products.add(propertyKey(property));
      }
    }
  }
  return products;
}

/**
 * The names a module exports as functions: each key of the object assigned to
 * `module.exports` whose value is a function the module declares at its top
 * level, and every function such an exported factory declares and returns
 * (`createRegistry`'s `targetProblems`, `createArtifactValidator`'s
 * `validateArtifact`). Nested helpers a factory keeps to itself stay private
 * names any file may reuse.
 */
function exportedFunctions(ast) {
  const topLevel = new Map();
  for (const statement of ast.body) {
    if (statement.type === 'FunctionDeclaration' && statement.id) topLevel.set(statement.id.name, statement);
  }
  const exported = new Set();
  walk(ast, (node) => {
    if (node.type !== 'AssignmentExpression' || !isExportsObject(node.left) || node.right.type !== 'ObjectExpression') return;
    for (const property of node.right.properties) {
      if (property.type === 'Property' && property.value.type === 'Identifier' && topLevel.has(property.value.name)) {
        exported.add(propertyKey(property));
        for (const product of factoryProducts(topLevel.get(property.value.name))) exported.add(product);
      }
    }
  });
  return exported;
}

/** Every `function <name>` declaration in a file, with how often. */
function declaredFunctions(ast) {
  const declared = new Map();
  walk(ast, (node) => {
    if (node.type === 'FunctionDeclaration' && node.id) declared.set(node.id.name, (declared.get(node.id.name) ?? 0) + 1);
  });
  return declared;
}

/** Every literal specifier a file passes to `require(...)`. */
function requiredSpecifiers(ast) {
  const specifiers = new Set();
  walk(ast, (node) => {
    if (node.type === 'CallExpression' && isIdentifier(node.callee, 'require')) {
      const value = staticString(node.arguments[0] ?? {});
      if (value !== undefined) specifiers.add(value.replace(/\.js$/, ''));
    }
  });
  return specifiers;
}

/**
 * The identity half of the move check, run in a child Node process over
 * `root`: every function a named `test/` file exports under a name its
 * runtime module also exports must be the runtime's own function object, and
 * each named definition must be exported at all. For `probe-targets.js` the
 * runtime's functions include those of the registry the file exports, which
 * must be one `createRegistry` built (`isRegistry`) and frozen.
 *
 * The syntax scan recognises a definition by its form; a move back written as
 * `gitState.bind(null)`, `require('./git-state').gitState`, a member of a local
 * object, or `const repositoryState = gitState` defines nothing it can see, and
 * each of those is a different function object, which this half reports.
 */
const IDENTITY_SCRIPT = `
'use strict';
const path = require('node:path');
const [moves, exemptions] = JSON.parse(process.argv[1]);
const problems = [];
for (const move of moves) {
  let testModule;
  let runtimeModule;
  try {
    testModule = require(path.resolve(move.testFile));
    runtimeModule = require(path.resolve(move.runtimeModule));
  } catch (error) {
    problems.push(move.testFile + ' could not be loaded beside ' + move.runtimeModule + ' to compare what it exports: ' + error.message.split('\\n')[0]);
    continue;
  }
  const own = new Map();
  for (const [name, value] of Object.entries(runtimeModule)) {
    if (typeof value === 'function') own.set(name, [value, move.runtimeModule]);
  }
  if (move.exportsRegistry) {
    const { registry } = testModule;
    if (!runtimeModule.isRegistry(registry)) {
      problems.push(move.testFile + ' exports a registry that ' + move.runtimeModule + "'s createRegistry did not build");
    } else {
      if (!Object.isFrozen(registry)) problems.push(move.testFile + ' exports a registry that is not frozen');
      for (const [name, value] of Object.entries(registry)) {
        if (typeof value === 'function') own.set(name, [value, move.runtimeModule + "'s createRegistry"]);
      }
    }
  }
  for (const name of move.definitions) {
    if (!Object.hasOwn(testModule, name)) problems.push(move.testFile + ' does not export ' + name);
  }
  for (const [name, value] of Object.entries(testModule)) {
    if (!own.has(name) || (exemptions[move.testFile] ?? []).includes(name)) continue;
    const [expected, source] = own.get(name);
    if (value !== expected) problems.push(move.testFile + ' exports ' + name + ", which is not " + source + "'s own " + name);
  }
}
process.stdout.write(JSON.stringify(problems));
`;

function identityViolations(root) {
  const exemptions = Object.fromEntries(Object.entries(WRAPPER_EXEMPTIONS).map(([file, names]) => [file, [...names]]));
  const result = spawnSync(process.execPath, ['-e', IDENTITY_SCRIPT, JSON.stringify([MOVES, exemptions])], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) return [`the export identity check could not run under ${root} (exit ${result.status}): ${result.stderr}`];
  return JSON.parse(result.stdout);
}

/**
 * Every way the move of the registry, the record builders and the digest and
 * provenance into the runtime has been undone under `root`.
 *
 * @param {string} root A repository root.
 * @returns {string[]}
 */
function moveViolations(root) {
  const problems = [];
  const parsed = new Map();
  const parse = (relative) => {
    if (!parsed.has(relative)) {
      const file = path.join(root, relative);
      let ast = null;
      if (fs.existsSync(file)) {
        try {
          ast = parseSource(file, fs.readFileSync(file, 'utf8'));
        } catch (error) {
          problems.push(`${relative} does not parse, so its definitions cannot be checked: ${error.message}`);
        }
      }
      parsed.set(relative, ast);
    }
    return parsed.get(relative);
  };
  const runtimeModules = filesUnder(path.join(root, 'cli', 'lib', 'evaluate'))
    .files.filter((file) => SOURCE_EXTENSIONS.has(path.extname(file)))
    .map((file) => path.relative(root, file).split(path.sep).join('/'));

  for (const move of MOVES) {
    const testAst = parse(move.testFile);
    const runtimeAst = parse(move.runtimeModule);
    if (testAst === null) problems.push(`${move.testFile} is missing or does not parse`);
    if (runtimeAst === null) problems.push(`${move.runtimeModule} is missing or does not parse`);
    if (testAst === null || runtimeAst === null) continue;
    if (!requiredSpecifiers(testAst).has(move.specifier)) {
      problems.push(`${move.testFile} does not require ${move.specifier}; it must import the runtime module that holds its logic`);
    }
    for (const name of move.definitions) {
      const declared = declaredFunctions(runtimeAst).get(name) ?? 0;
      if (declared !== 1)
        problems.push(`${move.runtimeModule} declares function ${name} ${declared} time(s); it must declare it exactly once`);
    }
  }

  // Every function a moved module declares lives only there: no other runtime
  // module defines a named marker, the five named test/ files define none of
  // them in any form, and no other test/lib/ file defines one at its top
  // level or in what it exports. So a partial move back, or a copy of a runtime
  // module into test/lib/, fails too.
  const owners = new Map();
  const own = (name, module) => {
    if (!owners.has(name)) owners.set(name, new Set());
    owners.get(name).add(module);
  };
  for (const module of GUARDED_MODULES) {
    const ast = parse(module);
    if (ast === null) continue;
    for (const name of exportedFunctions(ast)) own(name, module);
  }
  for (const name of SCHEMA_VERSION_DEFINITIONS) own(name, ENGINE_FILE);
  for (const move of MOVES) for (const name of move.definitions) owners.set(name, new Set([move.runtimeModule]));

  const testLibFiles = fs.existsSync(path.join(root, TEST_LIB))
    ? filesUnder(path.join(root, TEST_LIB))
        .files.filter((file) => SOURCE_EXTENSIONS.has(path.extname(file)))
        .map((file) => path.relative(root, file).split(path.sep).join('/'))
    : [];
  const namedTestFiles = new Set(MOVES.map((move) => move.testFile));
  const markers = new Set(MOVES.flatMap((move) => move.definitions));
  for (const relative of new Set([...testLibFiles, ...namedTestFiles, ...runtimeModules])) {
    const ast = parse(relative);
    if (ast === null) continue;
    const isTestFile = relative.startsWith(`${TEST_TREE}/`);
    const defined = isTestFile && !namedTestFiles.has(relative) ? topLevelFunctions(ast) : definedFunctions(ast);
    for (const name of defined.keys()) {
      const owning = owners.get(name);
      if (owning === undefined || owning.has(relative) || WRAPPER_EXEMPTIONS[relative]?.has(name)) continue;
      if (isTestFile || markers.has(name)) problems.push(`${relative} defines ${name}, which lives only in ${[...owning].join(', ')}`);
    }
  }

  if (fs.existsSync(path.join(root, SCHEMA_VERSIONS_FILE))) {
    problems.push(`${SCHEMA_VERSIONS_FILE} exists; the schema-version reader lives in ${ENGINE_FILE}`);
  }
  const engineAst = parse(ENGINE_FILE);
  for (const name of SCHEMA_VERSION_DEFINITIONS) {
    if (engineAst === null || (declaredFunctions(engineAst).get(name) ?? 0) !== 1) {
      problems.push(`${ENGINE_FILE} does not declare function ${name} exactly once`);
    }
  }
  const config = JSON.parse(fs.readFileSync(path.join(root, CONFIG_FILE), 'utf8'))['dependency-direction'];
  const pureLayers = new Set(config?.purity?.layers ?? []);
  const engineLayer = (config?.layers ?? []).find((layer) => layer.match === 'exact' && layer.path === ENGINE_FILE);
  if (engineLayer === undefined || !pureLayers.has(engineLayer.name)) {
    problems.push(`${CONFIG_FILE}'s dependency-direction purity block names no exact layer over ${ENGINE_FILE}`);
  }
  for (const layer of config?.layers ?? []) {
    if (layer.path === SCHEMA_VERSIONS_FILE) problems.push(`${CONFIG_FILE} still declares a layer over ${SCHEMA_VERSIONS_FILE}`);
  }
  problems.push(...identityViolations(root));
  return problems;
}

/**
 * What a move plant's temp root holds: the runtime, top-level test modules,
 * their local support modules, the config, and a link to this repository's
 * `node_modules`. Fixture and replay trees are outside the move check.
 */
const MOVE_TREES = ['cli', 'test', 'tools', 'package.json', CONFIG_FILE];
const MOVE_TEST_SUBTREES = new Set(['test/lib', 'test/schema']);

function moveCopyFilter(from) {
  const relative = path.relative(PROJECT_ROOT, from).split(path.sep).join('/');
  if (relative === 'test' || !relative.startsWith('test/')) return true;
  const parts = relative.split('/');
  if (parts.length === 2) return !fs.lstatSync(from).isDirectory() || MOVE_TEST_SUBTREES.has(relative);
  return MOVE_TEST_SUBTREES.has(`test/${parts[1]}`);
}

/** Each plant undoes one part of the move in a temp copy and must be reported. */
const MOVE_PLANTS = [
  {
    name: 'eval-contract-strength.js no longer requiring the workspace module',
    edit: {
      'test/eval-contract-strength.js': (text) => text.replace("require('../cli/lib/evaluate/workspace')", "require('./workspace-copy')"),
    },
    expect: 'does not require ../cli/lib/evaluate/workspace',
  },
  {
    name: 'cachingPort moved back into eval-contract-strength.js',
    edit: {
      'test/eval-contract-strength.js': (text) =>
        `${text.replace('const { cacheOnlyPort, cachingPort, requestKey,', 'const { cacheOnlyPort, requestKey,')}\nfunction cachingPort() {\n  return {};\n}\n`,
    },
    expect: 'test/eval-contract-strength.js defines cachingPort',
  },
  {
    name: 'requestKey defined again in eval-contract-strength.js as an arrow',
    edit: {
      'test/eval-contract-strength.js': (text) =>
        `${text.replace('cachingPort, requestKey, stageDirectories', 'cachingPort, stageDirectories')}\nconst requestKey = (request) => JSON.stringify(request);\n`,
    },
    expect: 'test/eval-contract-strength.js defines requestKey',
  },
  {
    name: 'test-automate-eval-fixture.js no longer requiring the mutation module',
    edit: {
      'test/test-automate-eval-fixture.js': (text) => text.replace("require('../cli/lib/evaluate/mutation')", "require('./mutation-copy')"),
    },
    expect: 'does not require ../cli/lib/evaluate/mutation',
  },
  {
    name: 'runMutationCycle moved back into test-automate-eval-fixture.js',
    edit: {
      'test/test-automate-eval-fixture.js': (text) =>
        `${text.replace('const { QualificationError, runMutationCycle } = require(', 'const { QualificationError } = require(')}\nasync function runMutationCycle() {\n  return { rollbackVerified: false };\n}\n`,
    },
    expect: 'test/test-automate-eval-fixture.js defines runMutationCycle',
  },
  {
    name: 'runMutationCycle removed from the mutation module',
    edit: {
      'cli/lib/evaluate/mutation.js': (text) => text.replace('async function runMutationCycle(', 'async function runCycleElsewhere('),
    },
    expect: 'cli/lib/evaluate/mutation.js declares function runMutationCycle 0 time(s)',
  },
  {
    name: 'a second cachingPort in another runtime module',
    edit: { 'cli/lib/evaluate/preflight.js': (text) => `${text}\nfunction cachingPort() {}\n` },
    expect: 'cli/lib/evaluate/preflight.js defines cachingPort',
  },
  {
    name: 'probe-targets.js no longer requiring the registry',
    edit: {
      'test/lib/probe-targets.js': (text) => text.replace("require('../../cli/lib/evaluate/registry')", "require('./registry-copy')"),
    },
    expect: 'does not require ../../cli/lib/evaluate/registry',
  },
  {
    name: 'eval-quality-inputs.js no longer requiring the records module',
    edit: {
      'test/lib/eval-quality-inputs.js': (text) => text.replace("require('../../cli/lib/evaluate/records')", "require('./records-copy')"),
    },
    expect: 'does not require ../../cli/lib/evaluate/records',
  },
  {
    name: 'eval-record.js no longer requiring the digest module',
    edit: { 'test/lib/eval-record.js': (text) => text.replace("require('../../cli/lib/evaluate/digest')", "require('./digest-copy')") },
    expect: 'does not require ../../cli/lib/evaluate/digest',
  },
  {
    name: 'sealedRunRecord moved back into eval-quality-inputs.js',
    edit: {
      'test/lib/eval-quality-inputs.js': (text) =>
        `${text.replace('  sealedRunRecord,\n} = require(', '} = require(')}\nfunction sealedRunRecord() {\n  return {};\n}\n`,
    },
    expect: 'test/lib/eval-quality-inputs.js defines sealedRunRecord',
  },
  {
    name: 'repositoryState moved back into eval-record.js as an arrow',
    edit: {
      'test/lib/eval-record.js': (text) =>
        `${text.replace('  repositoryState,\n} = require(', '} = require(')}\nconst repositoryState = () => ({ commit: null, dirty: false });\n`,
    },
    expect: 'test/lib/eval-record.js defines repositoryState',
  },
  {
    name: 'commandTargetPolicy moved back into probe-targets.js as an exported method',
    edit: { 'test/lib/probe-targets.js': (text) => `${text}\nmodule.exports.commandTargetPolicy = function commandTargetPolicy() {};\n` },
    expect: 'test/lib/probe-targets.js defines commandTargetPolicy',
  },
  {
    name: 'repositoryState removed from the digest module',
    edit: { 'cli/lib/evaluate/digest.js': (text) => text.replace('function repositoryState(', 'function repositoryStateElsewhere(') },
    expect: 'cli/lib/evaluate/digest.js declares function repositoryState 0 time(s)',
  },
  {
    name: 'a second commandTargetPolicy in another runtime module',
    edit: { 'cli/lib/evaluate/records.js': (text) => `${text}\nfunction commandTargetPolicy() {}\n` },
    expect: 'cli/lib/evaluate/records.js defines commandTargetPolicy',
  },
  {
    name: 'digest moved back into eval-record.js beside the runtime import',
    edit: {
      'test/lib/eval-record.js': (text) => `${text.replace('  digest,\n', '')}\nfunction digest(parts) {\n  return String(parts);\n}\n`,
    },
    expect: 'test/lib/eval-record.js defines digest',
  },
  {
    name: 'repositoryState assigned back into eval-record.js after its declaration',
    edit: {
      'test/lib/eval-record.js': (text) =>
        `${text.replace('  repositoryState,\n} = require(', '} = require(')}\nlet repositoryState;\nrepositoryState = () => ({ commit: null, dirty: false });\n`,
    },
    expect: 'test/lib/eval-record.js defines repositoryState',
  },
  {
    name: 'the policy builder handed out under its name from a local function in probe-targets.js',
    edit: {
      'test/lib/probe-targets.js': (text) =>
        `${text}\nfunction buildPolicy() {\n  return { authorizations: [] };\n}\nmodule.exports.commandTargetPolicy = buildPolicy;\n`,
    },
    expect: 'test/lib/probe-targets.js defines commandTargetPolicy',
  },
  {
    name: 'targetProblems moved back into probe-targets.js',
    edit: {
      'test/lib/probe-targets.js': (text) =>
        `${text.replace('  targetProblems: registry.targetProblems,\n', '  targetProblems,\n')}\nfunction targetProblems() {\n  return [];\n}\n`,
    },
    expect: 'test/lib/probe-targets.js defines targetProblems, which lives only in cli/lib/evaluate/registry.js',
  },
  {
    name: 'validateArtifact moved back into eval-quality-inputs.js',
    edit: {
      'test/lib/eval-quality-inputs.js': (text) =>
        text.replace(
          'const validateArtifact = createArtifactValidator({ readJson });',
          'async function validateArtifact() {\n  return [];\n}\nvoid createArtifactValidator;',
        ),
    },
    expect: 'test/lib/eval-quality-inputs.js defines validateArtifact, which lives only in cli/lib/evaluate/records.js',
  },
  {
    name: 'repositoryState handed out as a bound local function in eval-record.js',
    edit: {
      'test/lib/eval-record.js': (text) =>
        `${text
          .replace('  repositoryState,\n} = require(', '} = require(')
          .replace(
            '  repositoryState,\n  probeVersion,',
            '  repositoryState: gitState.bind(null),\n  probeVersion,',
          )}\nfunction gitState() {\n  return { commit: null, dirty: false };\n}\n`,
    },
    expect: "test/lib/eval-record.js exports repositoryState, which is not cli/lib/evaluate/digest.js's own repositoryState",
  },
  {
    name: 'repositoryState handed out as a member of another test/lib module',
    edit: {
      'test/lib/eval-record.js': (text) =>
        text
          .replace('  repositoryState,\n} = require(', '} = require(')
          .replace('  repositoryState,\n  probeVersion,', "  repositoryState: require('./git-state').gitState,\n  probeVersion,"),
      'test/lib/git-state.js': () => "'use strict';\nmodule.exports.gitState = () => ({ commit: null, dirty: false });\n",
    },
    expect: "test/lib/eval-record.js exports repositoryState, which is not cli/lib/evaluate/digest.js's own repositoryState",
  },
  {
    name: 'repositoryState aliased to a local function in eval-record.js',
    edit: {
      'test/lib/eval-record.js': (text) =>
        text
          .replace('  repositoryState,\n} = require(', '} = require(')
          .replace(
            "const { readBytes, writeText } = require('./file-system-port');\n",
            "const { readBytes, writeText } = require('./file-system-port');\n\nfunction gitState() {\n  return { commit: null, dirty: false };\n}\nconst repositoryState = gitState;\n",
          ),
    },
    expect: "test/lib/eval-record.js exports repositoryState, which is not cli/lib/evaluate/digest.js's own repositoryState",
  },
  {
    name: 'sealedRunRecord aliased to a local function in eval-quality-inputs.js',
    edit: {
      'test/lib/eval-quality-inputs.js': (text) =>
        text
          .replace('  sealedRunRecord,\n} = require(', '} = require(')
          .replace(
            "const { readJson } = require('./file-system-port');\n",
            "const { readJson } = require('./file-system-port');\n\nfunction buildRecord() {\n  return {};\n}\nconst sealedRunRecord = buildRecord;\n",
          ),
    },
    expect: "test/lib/eval-quality-inputs.js exports sealedRunRecord, which is not cli/lib/evaluate/records.js's own sealedRunRecord",
  },
  {
    name: 'the policy builder handed out bound in probe-targets.js',
    edit: {
      'test/lib/probe-targets.js': (text) =>
        `${text.replace(
          '  commandTargetPolicy: registry.commandTargetPolicy,\n',
          '  commandTargetPolicy: buildPolicy.bind(null),\n',
        )}\nfunction buildPolicy() {\n  return { authorizations: [] };\n}\n`,
    },
    expect:
      "test/lib/probe-targets.js exports commandTargetPolicy, which is not cli/lib/evaluate/registry.js's createRegistry's own commandTargetPolicy",
  },
  {
    name: 'the policy builder handed out as a member of a local object in probe-targets.js',
    edit: {
      'test/lib/probe-targets.js': (text) =>
        text
          .replace('  commandTargetPolicy: registry.commandTargetPolicy,\n', '  commandTargetPolicy: policies.build,\n')
          .replace(
            '\nmodule.exports = {\n',
            '\nconst policies = {\n  build() {\n    return { authorizations: [] };\n  },\n};\n\nmodule.exports = {\n',
          ),
    },
    expect:
      "test/lib/probe-targets.js exports commandTargetPolicy, which is not cli/lib/evaluate/registry.js's createRegistry's own commandTargetPolicy",
  },
  {
    name: 'a look-alike registry exported from probe-targets.js',
    edit: {
      'test/lib/probe-targets.js': (text) =>
        text.replace(
          '  registry,\n  targetFor:',
          '  registry: Object.freeze({ ...registry, commandTargetPolicy: () => ({ authorizations: [] }) }),\n  targetFor:',
        ),
    },
    expect: "test/lib/probe-targets.js exports a registry that cli/lib/evaluate/registry.js's createRegistry did not build",
  },
  {
    name: 'compare-dominance.js no longer requiring the compare module',
    edit: {
      'test/lib/compare-dominance.js': (text) => text.replace("require('../../cli/lib/evaluate/compare')", "require('./compare-copy')"),
    },
    expect: 'does not require ../../cli/lib/evaluate/compare',
  },
  {
    name: 'compareStoredResults moved back into compare-dominance.js',
    edit: {
      'test/lib/compare-dominance.js': (text) =>
        `${text.replace('const { compareStoredResults, refusalReason }', 'const { refusalReason }')}\nasync function compareStoredResults() {\n  return { ok: true, relation: "equivalent" };\n}\n`,
    },
    expect: 'test/lib/compare-dominance.js defines compareStoredResults, which lives only in cli/lib/evaluate/compare.js',
  },
  {
    name: 'compare-eval-runs.js no longer requiring the compare module',
    edit: {
      'test/lib/compare-eval-runs.js': (text) => text.replace("require('../../cli/lib/evaluate/compare')", "require('./compare-copy')"),
    },
    expect: 'does not require ../../cli/lib/evaluate/compare',
  },
  {
    name: 'isComparableShaped moved back into compare-eval-runs.js',
    edit: {
      'test/lib/compare-eval-runs.js': (text) =>
        `${text.replace('const { dominanceBetween, isComparableShaped, versionRefusalReason }', 'const { dominanceBetween, versionRefusalReason }')}\nfunction isComparableShaped() {\n  return false;\n}\n`,
    },
    expect: 'test/lib/compare-eval-runs.js defines isComparableShaped, which lives only in cli/lib/evaluate/compare.js',
  },
  {
    name: 'versionRefusalReason defined again in compare-eval-runs.js (the refusalReason exemption stays narrow)',
    edit: {
      'test/lib/compare-eval-runs.js': (text) =>
        `${text.replace('const { dominanceBetween, isComparableShaped, versionRefusalReason }', 'const { dominanceBetween, isComparableShaped }')}\nfunction versionRefusalReason() {\n  return null;\n}\n`,
    },
    expect: 'test/lib/compare-eval-runs.js defines versionRefusalReason, which lives only in cli/lib/evaluate/compare.js',
  },
  {
    name: 'a copy of the registry module under test/lib',
    edit: { 'test/lib/registry-copy.js': () => fs.readFileSync(path.join(PROJECT_ROOT, 'cli', 'lib', 'evaluate', 'registry.js'), 'utf8') },
    expect: 'test/lib/registry-copy.js defines createRegistry',
  },
  {
    name: 'boundedProbe copied into another test/lib file',
    edit: {
      'test/lib/probe-helper.js': () =>
        "'use strict';\nfunction boundedProbe() {\n  return { ok: false };\n}\nmodule.exports = { boundedProbe };\n",
    },
    expect: 'test/lib/probe-helper.js defines boundedProbe',
  },
  {
    name: 'a test/lib helper reusing a private helper name of a runtime module (must stay clean)',
    edit: {
      'test/lib/fixture-helpers.js': () =>
        "'use strict';\nfunction deepFreeze(value) {\n  return value;\n}\nmodule.exports = { deepFreeze };\n",
    },
    expect: null,
  },
  {
    name: 'engine.js no longer declaring schemaVersionProblems',
    edit: { [ENGINE_FILE]: (text) => text.replace('function schemaVersionProblems(', 'function schemaVersionFindings(') },
    expect: `${ENGINE_FILE} does not declare function schemaVersionProblems exactly once`,
  },
  {
    name: 'the config still declaring a layer over the old schema-version file',
    edit: {
      [CONFIG_FILE]: (text) =>
        text.replace(
          '"layers": [\n',
          `"layers": [\n      { "name": "old", "match": "exact", "path": "${SCHEMA_VERSIONS_FILE}", "label": "old", "imports": [] },\n`,
        ),
    },
    expect: `still declares a layer over ${SCHEMA_VERSIONS_FILE}`,
  },
  {
    name: 'the schema-version reader restored under test/lib',
    edit: { [SCHEMA_VERSIONS_FILE]: () => "'use strict';\nmodule.exports = {};\n" },
    expect: `${SCHEMA_VERSIONS_FILE} exists`,
  },
  {
    name: 'the purity block pointed away from engine.js',
    edit: { [CONFIG_FILE]: (text) => text.replace('"layers": ["evaluate-engine"]', '"layers": []') },
    expect: 'purity block names no exact layer',
  },
];

function proveMoveCheck() {
  for (const plant of MOVE_PLANTS) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-evaluate-moves-'));
    try {
      for (const relative of MOVE_TREES) {
        fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
        fs.cpSync(path.join(PROJECT_ROOT, relative), path.join(root, relative), {
          recursive: true,
          filter: moveCopyFilter,
        });
      }
      fs.symlinkSync(path.join(PROJECT_ROOT, 'node_modules'), path.join(root, 'node_modules'), 'dir');
      for (const [relative, edit] of Object.entries(plant.edit)) {
        const file = path.join(root, relative);
        const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
        const after = edit(before);
        check(after !== before, `the ${plant.name} plant changed nothing; its edit no longer matches the file`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, after);
      }
      const problems = moveViolations(root);
      check(
        !problems.some((problem) => problem.includes('does not parse')),
        `the ${plant.name} plant left a file that does not parse: ${JSON.stringify(problems)}`,
      );
      check(
        plant.expect === null ? problems.length === 0 : problems.some((problem) => problem.includes(plant.expect)),
        `the move check missed ${plant.name}; it reported ${JSON.stringify(problems)}`,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
}

function checkRepositoryMoves() {
  for (const problem of moveViolations(PROJECT_ROOT)) check(false, problem);
}

function main() {
  proveScanner();
  scanRepository();
  checkRollbackLiteralOutsideCli();
  proveMoveCheck();
  checkRepositoryMoves();
  if (failures.length > 0) {
    console.error(`${colors.red}${failures.length} of ${checks} tea-evaluate boundary check(s) failed:${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log(`${colors.green}ok${colors.reset} all ${checks} tea-evaluate boundary check(s) passed`);
  return 0;
}

if (require.main === module) process.exitCode = main();

module.exports = { moveViolations, scanCli };
