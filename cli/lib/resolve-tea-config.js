/**
 * Resolve the TEA module config keys that change which knowledge fragments the
 * review loads, so a headless run never leaves them to the agent's discretion.
 *
 * A baseRef reads every layer from that pinned Git tree. Without it, layers
 * come from the working tree. Missing base files use defaults; Git failures
 * and malformed base config fail closed.
 *
 * Precedence, highest first:
 *   1. An explicit CLI flag (--use-playwright-utils / --no-use-pactjs-utils / ...)
 *   2. The consuming project's `[modules.tea]` table, merged from
 *      _bmad/config.toml, _bmad/config.user.toml, _bmad/custom/config.toml and
 *      _bmad/custom/config.user.toml (later files win), as `bmad setup tea`
 *      writes it. Only when _bmad/config.toml does not exist is a v6
 *      _bmad/tea/config.yaml read instead, so older installs keep working in CI.
 *   3. The module default declared in skills/bmod-tea/bmod.toml
 *
 * Step 01 of the workflow branches on these keys (Playwright Utils loading
 * profile, the pactjs-utils fragment set, Pact MCP). When no config states them,
 * the agent picks per run and two runs over identical files can review against
 * different knowledge. Every run states all of them.
 *
 * MODULE_DEFAULTS mirrors skills/bmod-tea/bmod.toml. The test suite asserts they are
 * equal, so changing one side without the other fails the gate rather than drifting.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');
const TOML = require('smol-toml');
const { minimatch } = require('minimatch');
const { globSync } = require('glob');

/** The central config layers, lowest precedence first. Only the first is required. */
const CONFIG_LAYER_RELATIVE_PATHS = [
  path.join('_bmad', 'config.toml'),
  path.join('_bmad', 'config.user.toml'),
  path.join('_bmad', 'custom', 'config.toml'),
  path.join('_bmad', 'custom', 'config.user.toml'),
];
const CONFIG_RELATIVE_PATH = CONFIG_LAYER_RELATIVE_PATHS[0];
const LEGACY_CONFIG_RELATIVE_PATH = path.join('_bmad', 'tea', 'config.yaml');

const MODULE_DEFAULTS = {
  tea_use_playwright_utils: true,
  tea_use_pactjs_utils: true,
  tea_pact_mcp: 'mcp',
  tea_execution_mode: 'auto',
  tea_capability_probe: true,
  test_stack_type: 'auto',
};

const SNAPSHOT_DEFAULTS = {
  test_artifacts: '{project-root}/_bmad-output/test-artifacts',
  test_framework: 'auto',
};

const PACT_MCP_VALUES = ['mcp', 'none'];
// step-03-quality-evaluation.md's requestable modes. `auto` asks the capability
// probe to pick; the other three are honoured as stated.
const EXECUTION_MODE_VALUES = ['auto', 'agent-team', 'subagent', 'sequential'];

/** Maps a CLI option name to the config key it overrides. */
const FLAG_TO_KEY = {
  usePlaywrightUtils: 'tea_use_playwright_utils',
  usePactjsUtils: 'tea_use_pactjs_utils',
  pactMcp: 'tea_pact_mcp',
  executionMode: 'tea_execution_mode',
  capabilityProbe: 'tea_capability_probe',
};

/** Create a configuration error that the CLI publishes as an environment failure. */
function configError(message) {
  const error = new Error(message);
  error.code = 'TEA_CONFIG_INVALID';
  return error;
}

/** Read configuration from one pinned base commit, or from the working tree. */
function configSource(projectRoot, baseRef) {
  if (baseRef === undefined || baseRef === null) {
    return {
      label: (relativePath) => path.join(projectRoot, relativePath),
      list(pattern) {
        try {
          return globSync(pattern, { cwd: projectRoot, dot: true, nodir: true, follow: false });
        } catch (error) {
          throw configError(`Failed to list policy files in ${projectRoot}: ${error.message}`);
        }
      },
      read(relativePath) {
        try {
          return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
        } catch (error) {
          if (error.code === 'ENOENT') return null;
          throw configError(`Failed to read ${path.join(projectRoot, relativePath)}: ${error.message}`);
        }
      },
    };
  }
  if (typeof baseRef !== 'string' || baseRef.trim() === '' || baseRef.startsWith('-') || baseRef.includes('\0')) {
    throw configError(`Invalid git base ref for config ${JSON.stringify(baseRef)}`);
  }
  const git = (args, cwd = projectRoot) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
    if (result.error || result.status !== 0) {
      throw configError(`Cannot read config from base ref ${JSON.stringify(baseRef)}: ${result.error?.message ?? result.stderr.trim()}`);
    }
    return result.stdout.replace(/\r?\n$/, '');
  };
  const commit = git(['rev-parse', '--verify', '--end-of-options', `${baseRef}^{commit}`]);
  const repositoryRoot = git(['rev-parse', '--show-toplevel']);
  const prefix = git(['rev-parse', '--show-prefix']);
  const treePath = (relativePath) => prefix + relativePath.split(path.sep).join('/');
  const cache = new Map();
  const entries = new Map();
  const entryAt = (file) => {
    if (!entries.has(file)) {
      entries.set(file, git(['--literal-pathspecs', 'ls-tree', '-z', '--full-tree', commit, '--', file], repositoryRoot));
    }
    return entries.get(file);
  };
  let listedPaths;
  return {
    commit,
    list() {
      if (!listedPaths) {
        const args = ['--literal-pathspecs', 'ls-tree', '-r', '-z', '--name-only', '--full-tree', commit];
        if (prefix) args.push('--', prefix);
        listedPaths = git(args, repositoryRoot)
          .split('\0')
          .filter(Boolean)
          .map((file) => file.slice(prefix.length));
      }
      return listedPaths;
    },
    label: (relativePath) => `${commit}:${treePath(relativePath)}`,
    read(relativePath) {
      if (cache.has(relativePath)) return cache.get(relativePath);
      const file = treePath(relativePath);
      const segments = file.split('/');
      for (let i = 1; i < segments.length; i++) {
        const parent = segments.slice(0, i).join('/');
        const ancestor = entryAt(parent);
        if (ancestor === '') break;
        if (!/^040000 tree [a-f0-9]+\t/.test(ancestor)) {
          throw configError(`Config parent at ${commit}:${parent} must be a directory tree`);
        }
      }
      const entry = entryAt(file);
      if (entry === '') {
        cache.set(relativePath, null);
        return null;
      }
      if (!/^100(?:644|755) blob [a-f0-9]+\t/.test(entry)) {
        throw configError(`Config at ${commit}:${treePath(relativePath)} must be a regular file`);
      }
      // Keep the blob's trailing newline intact for YAML block scalars.
      const blob = spawnSync('git', ['show', `${commit}:${treePath(relativePath)}`], {
        cwd: repositoryRoot,
        encoding: 'utf8',
        timeout: 30_000,
        maxBuffer: 4 * 1024 * 1024,
      });
      if (blob.error || blob.status !== 0) {
        throw configError(`Failed to read ${commit}:${treePath(relativePath)}: ${blob.error?.message ?? blob.stderr.trim()}`);
      }
      cache.set(relativePath, blob.stdout);
      return blob.stdout;
    },
  };
}

/**
 * Coerce a config boolean. `bmad setup` writes the strings "true"/"false", a v6
 * config.yaml or a hand-edited TOML file may carry real booleans. Accept both
 * spellings, reject anything else.
 *
 * @param {unknown} value - Raw config value.
 * @param {string} key - Config key name, for the error message.
 * @param {string} source - Where the value came from, for the error message.
 * @returns {boolean}
 */
function coerceBoolean(value, key, source = CONFIG_RELATIVE_PATH) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }
  throw configError(`${key} in ${source} must be true or false, got ${JSON.stringify(value)}`);
}

/**
 * Coerce the tea_execution_mode string enum.
 *
 * @param {unknown} value - Raw config value.
 * @returns {string}
 */
function coerceExecutionMode(value, source = CONFIG_RELATIVE_PATH) {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (EXECUTION_MODE_VALUES.includes(normalized)) {
      return normalized;
    }
  }
  throw configError(`tea_execution_mode from ${source} must be one of ${EXECUTION_MODE_VALUES.join(' | ')}, got ${JSON.stringify(value)}`);
}

/**
 * Coerce the tea_pact_mcp string enum.
 *
 * @param {unknown} value - Raw config value.
 * @returns {string}
 */
function coercePactMcp(value, source = CONFIG_RELATIVE_PATH) {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (PACT_MCP_VALUES.includes(normalized)) {
      return normalized;
    }
  }
  throw configError(`tea_pact_mcp from ${source} must be one of ${PACT_MCP_VALUES.join(' | ')}, got ${JSON.stringify(value)}`);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

/** Match BMad structural merging: recursive tables, keyed table arrays, and appended arrays. */
function mergeTables(base, override) {
  if (isPlainObject(base) && isPlainObject(override)) {
    const result = { ...base };
    for (const [key, value] of Object.entries(override)) {
      result[key] = Object.hasOwn(result, key) ? mergeTables(result[key], value) : value;
    }
    return result;
  }
  if (Array.isArray(base) && Array.isArray(override)) {
    const items = [...base, ...override];
    const keyedField =
      items.length > 0 && items.every(isPlainObject)
        ? ['code', 'id'].find((field) => items.every((item) => Object.hasOwn(item, field)))
        : undefined;
    if (!keyedField) return items;
    for (const item of items) {
      if (typeof item[keyedField] !== 'string' || item[keyedField] === '') {
        throw configError(`Keyed array identifier ${keyedField} must be a nonempty string`);
      }
    }
    const result = [...base];
    const indices = new Map(base.map((item, index) => [item[keyedField], index]));
    for (const item of override) {
      const key = item[keyedField];
      if (indices.has(key)) result[indices.get(key)] = item;
      else {
        indices.set(key, result.length);
        result.push(item);
      }
    }
    return result;
  }
  return override;
}

/** Parse a TOML layer with a consistent fail-closed diagnostic. */
function parseToml(content, label) {
  try {
    return TOML.parse(content);
  } catch (error) {
    throw configError(`Failed to parse ${label}: ${error.message}`);
  }
}

/** Resolve trusted skill defaults and project workflow overrides from the same configuration source. */
function readWorkflowCustomization(source, skillRoot, projectRoot, skillName = 'bmad-testarch-test-review') {
  if (!skillRoot) return {};
  const defaultsPath = path.join(skillRoot, 'customize.toml');
  let merged = {};
  try {
    merged = parseToml(fs.readFileSync(defaultsPath, 'utf8'), defaultsPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw configError(`Failed to load ${defaultsPath}: ${error.message}`);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(skillName)) throw configError('Workflow skill name must be a lowercase kebab-case name');
  const workflowPaths = ['.toml', '.user.toml'].map((suffix) => path.join('_bmad', 'custom', skillName + suffix));
  for (const relativePath of workflowPaths) {
    const content = source.read(relativePath);
    if (content !== null) merged = mergeTables(merged, parseToml(content, source.label(relativePath)));
  }
  if (merged.workflow !== undefined && !isPlainObject(merged.workflow)) {
    throw configError('Workflow customization must contain a [workflow] table');
  }
  const workflow = merged.workflow || {};
  if (workflow.persistent_facts !== undefined) {
    if (!Array.isArray(workflow.persistent_facts) || !workflow.persistent_facts.every((fact) => typeof fact === 'string')) {
      throw configError('Workflow persistent_facts must be an array of strings');
    }
    workflow.persistent_facts = workflow.persistent_facts.flatMap((fact) => {
      if (!fact.startsWith('file:')) return [fact];
      const rawPath = fact.slice('file:'.length).replaceAll('{project-root}', projectRoot);
      const pattern = path.relative(projectRoot, path.resolve(projectRoot, rawPath)).split(path.sep).join('/');
      if (pattern === '' || pattern === '..' || pattern.startsWith('../') || path.isAbsolute(pattern)) {
        throw configError(`Persistent fact must refer to a file inside the project: ${fact}`);
      }
      const matching = source
        .list(pattern)
        .filter((file) => minimatch(file, pattern, { dot: true, nonegate: true, nocomment: true }))
        .sort();
      if (matching.length === 0) throw configError(`Persistent fact has no files in the configuration source: ${fact}`);
      return matching.map((file) => `Resolved policy ${source.label(file)}:\n${source.read(file)}`);
    });
  }
  return workflow;
}

/** Coerce the keys this CLI cares about out of a raw TEA config table. */
function pickTeaValues(table, source) {
  const values = {};
  if ('tea_use_playwright_utils' in table) {
    values.tea_use_playwright_utils = coerceBoolean(table.tea_use_playwright_utils, 'tea_use_playwright_utils', source);
  }
  if ('tea_use_pactjs_utils' in table) {
    values.tea_use_pactjs_utils = coerceBoolean(table.tea_use_pactjs_utils, 'tea_use_pactjs_utils', source);
  }
  if ('tea_pact_mcp' in table) {
    values.tea_pact_mcp = coercePactMcp(table.tea_pact_mcp, source);
  }
  if ('tea_execution_mode' in table) {
    values.tea_execution_mode = coerceExecutionMode(table.tea_execution_mode, source);
  }
  if ('tea_capability_probe' in table) {
    values.tea_capability_probe = coerceBoolean(table.tea_capability_probe, 'tea_capability_probe', source);
  }
  if ('test_stack_type' in table) {
    const stack = typeof table.test_stack_type === 'string' ? table.test_stack_type.trim().toLowerCase() : '';
    if (!['auto', 'frontend', 'backend', 'fullstack', 'mobile'].includes(stack)) {
      throw configError(`test_stack_type in ${source} must be auto, frontend, backend, fullstack or mobile`);
    }
    values.test_stack_type = stack;
  }
  return values;
}

/**
 * Merge the central TOML layers and return their core and TEA tables.
 *
 * @param {object} source - Working-tree or pinned-base configuration reader.
 * @returns {{core: object, tea: object}}
 */
function readCentralConfig(source) {
  let merged = {};
  for (const relativePath of CONFIG_LAYER_RELATIVE_PATHS) {
    const content = source.read(relativePath);
    if (content === null) continue;
    const parsed = parseToml(content, source.label(relativePath));
    merged = mergeTables(merged, parsed);
  }
  const modules = merged.modules;
  if (modules !== undefined && (!isPlainObject(modules) || (modules.tea !== undefined && !isPlainObject(modules.tea)))) {
    throw configError(`[modules.tea] in ${source.label(CONFIG_RELATIVE_PATH)} must be a table of config keys`);
  }
  if (merged.core !== undefined && !isPlainObject(merged.core)) {
    throw configError(`[core] in ${source.label(CONFIG_RELATIVE_PATH)} must be a table of config keys`);
  }
  return { core: merged.core || {}, tea: modules?.tea || {} };
}

/**
 * Read a v6 _bmad/tea/config.yaml, used only when _bmad/config.toml is absent.
 *
 * @param {string} configPath
 * @param {string} content
 * @returns {object}
 */
function readLegacyTeaTable(configPath, content) {
  let parsed;
  try {
    parsed = yaml.load(content);
  } catch (error) {
    throw configError(`Failed to parse ${configPath}: ${error.message}`);
  }
  if (parsed === null || parsed === undefined) {
    return {};
  }
  if (!isPlainObject(parsed)) {
    throw configError(`${configPath} must contain a YAML mapping of config keys`);
  }
  return parsed;
}

/**
 * Read the keys this CLI cares about out of the project's TEA config.
 * A missing config is normal (CI installs the skill without running setup);
 * unreadable or unparseable content is a configuration error.
 *
 * @param {string} projectRoot - Consuming project root.
 * @param {string} [baseRef] - Base commit or ref; omitted for working-tree config.
 * @returns {{present: boolean, path: string, format: 'toml'|'yaml'|null, values: object}}
 */
function readTeaConfigFile(projectRoot, baseRef, source = configSource(projectRoot, baseRef)) {
  const centralPath = source.label(CONFIG_RELATIVE_PATH);
  if (source.read(CONFIG_RELATIVE_PATH) !== null) {
    const config = readCentralConfig(source);
    return {
      present: true,
      path: centralPath,
      format: 'toml',
      values: pickTeaValues(config.tea, centralPath),
      core: config.core,
      tea: config.tea,
    };
  }
  const legacyPath = source.label(LEGACY_CONFIG_RELATIVE_PATH);
  const legacy = source.read(LEGACY_CONFIG_RELATIVE_PATH);
  if (legacy !== null) {
    const table = readLegacyTeaTable(legacyPath, legacy);
    const core = Object.fromEntries(
      ['user_name', 'communication_language', 'document_output_language', 'output_folder']
        .filter((key) => key in table)
        .map((key) => [key, table[key]]),
    );
    return { present: true, path: legacyPath, format: 'yaml', values: pickTeaValues(table, legacyPath), core, tea: table };
  }
  return { present: false, path: centralPath, format: null, values: {}, core: {}, tea: {} };
}

/**
 * Whether a package appears in the consuming project's dependency manifest.
 *
 * Half of a library mandate's gate is the flag, resolved above. The other half is
 * whether the package is actually installed, and leaving that to the agent means a
 * headless run decides it by reading package.json — an unlisted extra read the
 * prompt otherwise discourages, and a judgment call where a lookup will do. Both
 * halves resolve here so the gate closes the same way on every run.
 *
 * Absent, unreadable, or unparseable manifest reads as "not installed": the
 * conservative answer, since the consequence is that a mandate row does not fire.
 *
 * @param {string} projectRoot
 * @param {string} packageName
 * @returns {boolean}
 */
function isPackageInstalled(projectRoot, packageName) {
  const manifestPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(manifestPath)) {
    return false;
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return false;
  }
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return false;
  }
  return ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].some((section) => {
    const deps = manifest[section];
    return Boolean(deps) && typeof deps === 'object' && !Array.isArray(deps) && packageName in deps;
  });
}

/** Config key to the npm package whose presence completes its gate. */
const KEY_TO_PACKAGE = {
  tea_use_playwright_utils: '@seontechnologies/playwright-utils',
  tea_use_pactjs_utils: '@seontechnologies/pactjs-utils',
};

/** The `installed` field each gate reports under. */
const KEY_TO_INSTALLED_FIELD = {
  tea_use_playwright_utils: 'playwright_utils_installed',
  tea_use_pactjs_utils: 'pactjs_utils_installed',
};

/**
 * Resolve every key through the precedence chain.
 *
 * @param {object} options
 * @param {string} options.projectRoot - Consuming project root.
 * @param {string} [options.baseRef] - Configuration source ref, pinned before any file read.
 * @param {string} [options.skillRoot] - Trusted skill defaults for workflow customization.
 * @param {object} [options.flags] - Parsed CLI options; only the keys in
 *   FLAG_TO_KEY are read, and only when not undefined.
 * @returns {{values: object, sources: object, installed: object, configSnapshot: object, workflowCustomization: object, configCommit: string|null, configPath: string, configPresent: boolean, configFormat: string|null}}
 *   `installed` carries one boolean per library gate, read from the project
 *   manifest rather than left to the agent.
 * @throws {Error} With code TEA_CONFIG_INVALID on unusable config content.
 */
function resolveTeaConfig({ projectRoot, flags = {}, baseRef, skillRoot, skillName }) {
  const source = configSource(projectRoot, baseRef);
  const file = readTeaConfigFile(projectRoot, baseRef, source);
  const workflowCustomization = readWorkflowCustomization(source, skillRoot, projectRoot, skillName);

  const values = {};
  const sources = {};

  for (const [flagName, key] of Object.entries(FLAG_TO_KEY)) {
    const flagValue = flags[flagName];
    if (flagValue !== undefined) {
      if (key === 'tea_pact_mcp') {
        values[key] = coercePactMcp(flagValue, '--pact-mcp');
      } else if (key === 'tea_execution_mode') {
        values[key] = coerceExecutionMode(flagValue, '--execution-mode');
      } else {
        values[key] = flagValue;
      }
      sources[key] = 'flag';
      continue;
    }
    if (key in file.values) {
      values[key] = file.values[key];
      sources[key] = 'config';
      continue;
    }
    values[key] = MODULE_DEFAULTS[key];
    sources[key] = 'default';
  }

  values.test_stack_type = file.values.test_stack_type ?? MODULE_DEFAULTS.test_stack_type;
  sources.test_stack_type = 'test_stack_type' in file.values ? 'config' : 'default';

  const installed = {};
  for (const [key, packageName] of Object.entries(KEY_TO_PACKAGE)) {
    installed[KEY_TO_INSTALLED_FIELD[key]] = isPackageInstalled(projectRoot, packageName);
  }

  const configSnapshot = {
    core: { user_name: 'User', communication_language: 'English', document_output_language: 'English', ...file.core },
    modules: { tea: { ...SNAPSHOT_DEFAULTS, ...file.tea, ...values, tea_browser_automation: 'none' } },
  };
  return {
    values,
    sources,
    installed,
    configSnapshot,
    workflowCustomization,
    configCommit: source.commit ?? null,
    configPath: file.path,
    configPresent: file.present,
    configFormat: file.format,
  };
}

module.exports = {
  resolveTeaConfig,
  readTeaConfigFile,
  readWorkflowCustomization,
  configSource,
  isPackageInstalled,
  KEY_TO_PACKAGE,
  KEY_TO_INSTALLED_FIELD,
  MODULE_DEFAULTS,
  SNAPSHOT_DEFAULTS,
  EXECUTION_MODE_VALUES,
  PACT_MCP_VALUES,
  CONFIG_RELATIVE_PATH,
  CONFIG_LAYER_RELATIVE_PATHS,
  LEGACY_CONFIG_RELATIVE_PATH,
  FLAG_TO_KEY,
};
