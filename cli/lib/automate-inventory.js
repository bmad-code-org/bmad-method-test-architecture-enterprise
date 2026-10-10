'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { parse } = require('@babel/parser');
const { minimatch } = require('minimatch');

const slash = (value) => value.split(path.sep).join('/');
const literal = (node) =>
  node?.type === 'StringLiteral'
    ? node.value
    : node?.type === 'TemplateLiteral' && node.expressions.length === 0
      ? node.quasis[0].value.cooked
      : null;

// Enumerate registrations without executing adopter code. Runtime enumeration is
// deliberately unmeasured: a numerical report cannot prove its missing leaves.
function generatedInventory(projectRoot, files) {
  const inventory = { schemaVersion: 1, basis: 'post-generation source syntax', files: [], tests: [] };
  for (const file of files) {
    const bytes = fs.readFileSync(path.join(projectRoot, file));
    inventory.files.push({ file, sha256: createHash('sha256').update(bytes).digest('hex') });
    if (!/\.(?:[cm]?[jt]sx?)$/.test(file)) continue;
    const ast = parse(bytes.toString('utf8'), { sourceType: 'unambiguous', plugins: ['typescript', 'jsx'] });
    const aliases = new Set(['test']);
    const members = (node) => {
      if (node?.type === 'Identifier') return [node.name];
      if (node?.type === 'MemberExpression') return [...members(node.object), node.computed ? literal(node.property) : node.property.name];
      return [];
    };
    const rememberAlias = (node) => {
      if (node.type === 'ImportSpecifier' && node.imported?.name === 'test') aliases.add(node.local.name);
      if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && aliases.has(node.init?.name)) aliases.add(node.id.name);
      if (node.type === 'VariableDeclarator' && node.id.type === 'ObjectPattern')
        for (const binding of node.id.properties)
          if (binding.key?.name === 'test' && binding.value?.type === 'Identifier') aliases.add(binding.value.name);
      if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init?.type === 'CallExpression') {
        const chain = members(node.init.callee);
        if (aliases.has(chain[0]) && ['extend', 'mergeTests'].includes(chain[1])) aliases.add(node.id.name);
      }
    };
    const collectAliases = (node) => {
      if (!node || typeof node !== 'object') return;
      rememberAlias(node);
      for (const [key, value] of Object.entries(node)) {
        if (['loc', 'start', 'end'].includes(key)) continue;
        if (Array.isArray(value)) for (const child of value) collectAliases(child);
        else if (value && typeof value === 'object') collectAliases(value);
      }
    };
    let aliasCount;
    do {
      aliasCount = aliases.size;
      collectAliases(ast.program);
    } while (aliases.size !== aliasCount);
    const walk = (node, titles = [], dynamic = false) => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'CallExpression') {
        const chain = members(node.callee);
        if (aliases.has(chain[0])) {
          if (chain.includes(null)) throw new Error(`generated test inventory has computed registration: ${file}`);
          if (chain[1] === 'each') throw new Error(`generated test inventory has unresolved table registration: ${file}`);
          if (chain[1] === 'describe' && ['describe', 'only', 'skip', 'serial', 'parallel'].includes(chain.at(-1))) {
            const title = literal(node.arguments[0]);
            const callback = node.arguments.find((arg) => ['ArrowFunctionExpression', 'FunctionExpression'].includes(arg.type));
            if (title === null || !callback || dynamic) throw new Error(`generated test inventory has dynamic suite registration: ${file}`);
            walk(callback.body, [...titles, title], false);
            return;
          }
          if (chain.length === 1 || (chain.length === 2 && ['only', 'skip', 'fixme', 'fail'].includes(chain[1]))) {
            // test.skip(condition, reason) inside a test is metadata, never a leaf.
            const callback = node.arguments.find((arg) => ['ArrowFunctionExpression', 'FunctionExpression'].includes(arg.type));
            if (callback) {
              const title = literal(node.arguments[0]);
              if (title === null || dynamic) throw new Error(`generated test inventory has dynamic test registration: ${file}`);
              inventory.tests.push({
                file,
                titlePath: [...titles, title],
                // Playwright's import wrapper maps its stack location to the end
                // of the callee. Red activation removes the .skip member.
                line: node.callee.loc.end.line,
                column: node.callee.loc.end.column + 1,
                ...(chain[1] === 'skip'
                  ? { activationLine: node.callee.object.loc.end.line, activationColumn: node.callee.object.loc.end.column + 1 }
                  : {}),
              });
              return;
            }
            if (chain.length === 1 || literal(node.arguments[0]) !== null)
              throw new Error(`generated test inventory has unresolved callback registration: ${file}`);
          }
          if (
            node.arguments.some((arg) => ['ArrowFunctionExpression', 'FunctionExpression'].includes(arg.type)) &&
            !['beforeEach', 'beforeAll', 'afterEach', 'afterAll', 'step', 'extend'].includes(chain[1])
          )
            throw new Error(`generated test inventory has unsupported registration: ${file}`);
          if (
            chain.length > 1 &&
            ![
              'describe',
              'only',
              'skip',
              'fixme',
              'fail',
              'beforeEach',
              'beforeAll',
              'afterEach',
              'afterAll',
              'step',
              'extend',
              'use',
              'info',
              'setTimeout',
              'slow',
              'expect',
            ].includes(chain[1])
          )
            throw new Error(`generated test inventory has unresolved registration: ${file}`);
        }
      }
      const nestedDynamic = dynamic || /(?:Function|Method|For|While|If|Conditional|Switch)/.test(node.type);
      for (const [key, value] of Object.entries(node)) {
        if (['loc', 'start', 'end'].includes(key)) continue;
        if (Array.isArray(value)) for (const child of value) walk(child, titles, nestedDynamic);
        else if (value && typeof value === 'object') walk(value, titles, nestedDynamic);
      }
    };
    walk(ast.program);
  }
  if (inventory.tests.length === 0) throw new Error('generated test inventory contains no measurable test leaves');
  return inventory;
}

function reconcileInventory(inventory, reports, { mode } = {}) {
  const covered = new Map();
  const projectsByFile = new Map();
  if (reports.some((report) => Array.isArray(report.suites)) && reports.some((report) => Array.isArray(report.files)))
    throw new Error('final execution mixes incompatible runner scope identities');
  const identity = (leaf, project) => JSON.stringify([leaf.file, leaf.titlePath, leaf.line, leaf.column, project]);
  const playwrightLeaves = new Map();
  const atddLeaves = new Map();
  const sourceKey = (file, titles, line, column) => JSON.stringify([file, titles, line, column]);
  const index = (map, key, leaf) => map.set(key, [...(map.get(key) ?? []), leaf]);
  for (const leaf of inventory.tests) {
    index(playwrightLeaves, sourceKey(leaf.file, leaf.titlePath, leaf.line, leaf.column), leaf);
    if (mode === 'red' && leaf.activationLine !== undefined)
      index(playwrightLeaves, sourceKey(leaf.file, leaf.titlePath, leaf.activationLine, leaf.activationColumn), leaf);
    index(atddLeaves, JSON.stringify([leaf.file, leaf.titlePath.at(-1)]), leaf);
  }
  for (const report of reports) {
    if (Array.isArray(report.suites)) {
      if (
        !report.config?.configFile ||
        !report.config.rootDir ||
        !Array.isArray(report.config.projects) ||
        report.config.projects.length === 0
      )
        throw new Error('native Playwright evidence lacks file and project identity configuration');
      const base = path.dirname(report.config.configFile);
      const reportedFile = (file) => slash(path.relative(base, path.isAbsolute(file) ? file : path.resolve(report.config.rootDir, file)));
      const projectIds = report.config.projects.map((project) => project.id ?? project.name);
      if (projectIds.some((id) => typeof id !== 'string') || new Set(projectIds).size !== projectIds.length)
        throw new Error('native Playwright project identities are missing or duplicated');
      // Every configured matching project is part of the generated execution scope.
      for (const leaf of inventory.tests) {
        const projects = projectsByFile.get(leaf.file) ?? new Map();
        for (const project of report.config.projects) {
          const relative = slash(path.relative(project.testDir ?? report.config.rootDir, path.resolve(base, leaf.file)));
          if (relative.startsWith('../') || path.isAbsolute(relative)) continue;
          const matches = (patterns) =>
            patterns.some(
              (pattern) =>
                typeof pattern === 'string' &&
                (minimatch(relative, pattern, { dot: true }) || minimatch(path.resolve(base, leaf.file), pattern, { dot: true })),
            );
          if ((project.testMatch?.length && !matches(project.testMatch)) || (project.testIgnore?.length && matches(project.testIgnore)))
            continue;
          const repeatEach = project.repeatEach ?? 1;
          if (!Number.isSafeInteger(repeatEach) || repeatEach < 1) throw new Error('native Playwright repeatEach must be positive');
          const id = project.id ?? project.name;
          if (projects.has(id) && projects.get(id) !== repeatEach) throw new Error('final reports disagree on project repetition scope');
          projects.set(id, repeatEach);
        }
        projectsByFile.set(leaf.file, projects);
      }
      const scopesInReport = new Map();
      const walk = (suite, titles) => {
        const nextTitles = suite.line > 0 && suite.title ? [...titles, suite.title] : titles;
        for (const spec of suite.specs ?? []) {
          const file = reportedFile(spec.file ?? suite.file ?? '');
          const titlePath = [...nextTitles, spec.title];
          const leaves = playwrightLeaves.get(sourceKey(file, titlePath, spec.line, spec.column)) ?? [];
          if (leaves.length !== 1) throw new Error(`runner result does not identify one generated test leaf: ${file} ${spec.title ?? ''}`);
          for (const test of spec.tests ?? []) {
            const project = test.projectId ?? test.projectName;
            if (!projectIds.includes(project) || !projectsByFile.get(file)?.has(project))
              throw new Error(`runner result has an unrelated project: ${file}`);
            if (!test.results?.length) throw new Error(`runner result has no attempts: ${file} ${spec.title}`);
            const key = identity(leaves[0], project);
            scopesInReport.set(key, (scopesInReport.get(key) ?? 0) + 1);
          }
        }
        for (const child of suite.suites ?? []) walk(child, nextTitles);
      };
      for (const suite of report.suites) walk(suite, []);
      for (const [key, count] of scopesInReport) {
        if (covered.has(key)) throw new Error('final runner reports repeat a generated test/project scope');
        covered.set(key, count);
      }
    } else if (report.schemaVersion === 1 && Array.isArray(report.files)) {
      for (const leaf of inventory.tests) projectsByFile.set(leaf.file, new Map([['native-atdd', 1]]));
      for (const file of report.files)
        for (const test of file.tests ?? []) {
          const leaves = atddLeaves.get(JSON.stringify([slash(file.file ?? ''), test.title])) ?? [];
          if (leaves.length !== 1)
            throw new Error(`native ATDD result does not identify one generated test leaf: ${file.file ?? ''} ${test.title ?? ''}`);
          const key = identity(leaves[0], 'native-atdd');
          if (covered.has(key)) throw new Error('final runner reports repeat a generated test scope');
          covered.set(key, 1);
        }
    }
  }
  for (const leaf of inventory.tests) {
    const projects = projectsByFile.get(leaf.file);
    if (!projects?.size) throw new Error(`generated test file has no selected runner project: ${leaf.file}`);
    for (const [project, repetitions] of projects)
      if (covered.get(identity(leaf, project)) !== repetitions)
        throw new Error(`final execution omits generated test/project scope: ${leaf.file} ${leaf.titlePath.join(' > ')} [${project}]`);
  }
  return { ...inventory, executionScopes: [...covered].map(([key, repetitions]) => ({ identity: JSON.parse(key), repetitions })) };
}

module.exports = { generatedInventory, reconcileInventory };
