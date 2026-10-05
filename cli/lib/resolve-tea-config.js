/**
 * Resolve the TEA module config keys that change which knowledge fragments the
 * review loads, so a headless run never leaves them to the agent's discretion.
 *
 * Precedence, highest first:
 *   1. An explicit CLI flag (--use-playwright-utils / --no-use-pactjs-utils / ...)
 *   2. The consuming project's `[modules.tea]` table, merged from
 *      _bmad/config.toml, _bmad/custom/config.toml and
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
const yaml = require('js-yaml');
const TOML = require('smol-toml');

/** The central config layers, lowest precedence first. Only the first is required. */
const CONFIG_LAYER_RELATIVE_PATHS = [
  path.join('_bmad', 'config.toml'),
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

function configError(message) {
  const error = new Error(message);
  error.code = 'TEA_CONFIG_INVALID';
  return error;
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

/** Merge tables recursively; any other value from the later layer replaces the earlier one. */
function mergeTables(base, override) {
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = isPlainObject(result[key]) && isPlainObject(value) ? mergeTables(result[key], value) : value;
  }
  return result;
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
  return values;
}

/**
 * Merge the central TOML layers and return the `[modules.tea]` table.
 *
 * @param {string} projectRoot
 * @returns {object}
 */
function readCentralTeaTable(projectRoot) {
  let merged = {};
  for (const relativePath of CONFIG_LAYER_RELATIVE_PATHS) {
    const layerPath = path.join(projectRoot, relativePath);
    if (!fs.existsSync(layerPath)) {
      continue;
    }
    let parsed;
    try {
      parsed = TOML.parse(fs.readFileSync(layerPath, 'utf8'));
    } catch (error) {
      throw configError(`Failed to parse ${layerPath}: ${error.message}`);
    }
    merged = mergeTables(merged, parsed);
  }
  const modules = merged.modules;
  if (modules === undefined) {
    return {};
  }
  if (!isPlainObject(modules) || (modules.tea !== undefined && !isPlainObject(modules.tea))) {
    throw configError(`[modules.tea] in ${path.join(projectRoot, CONFIG_RELATIVE_PATH)} must be a table of config keys`);
  }
  return modules.tea || {};
}

/**
 * Read a v6 _bmad/tea/config.yaml, used only when _bmad/config.toml is absent.
 *
 * @param {string} configPath
 * @returns {object}
 */
function readLegacyTeaTable(configPath) {
  let parsed;
  try {
    parsed = yaml.load(fs.readFileSync(configPath, 'utf8'));
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
 * @returns {{present: boolean, path: string, format: 'toml'|'yaml'|null, values: object}}
 */
function readTeaConfigFile(projectRoot) {
  const centralPath = path.join(projectRoot, CONFIG_RELATIVE_PATH);
  if (fs.existsSync(centralPath)) {
    return {
      present: true,
      path: centralPath,
      format: 'toml',
      values: pickTeaValues(readCentralTeaTable(projectRoot), CONFIG_RELATIVE_PATH),
    };
  }

  const legacyPath = path.join(projectRoot, LEGACY_CONFIG_RELATIVE_PATH);
  if (fs.existsSync(legacyPath)) {
    return {
      present: true,
      path: legacyPath,
      format: 'yaml',
      values: pickTeaValues(readLegacyTeaTable(legacyPath), LEGACY_CONFIG_RELATIVE_PATH),
    };
  }

  return { present: false, path: centralPath, format: null, values: {} };
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
 * @param {object} [options.flags] - Parsed CLI options; only the keys in
 *   FLAG_TO_KEY are read, and only when not undefined.
 * @returns {{values: object, sources: object, installed: object, configPath: string, configPresent: boolean, configFormat: string|null}}
 *   `installed` carries one boolean per library gate, read from the project
 *   manifest rather than left to the agent.
 * @throws {Error} With code TEA_CONFIG_INVALID on unusable config content.
 */
function resolveTeaConfig({ projectRoot, flags = {} }) {
  const file = readTeaConfigFile(projectRoot);

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

  const installed = {};
  for (const [key, packageName] of Object.entries(KEY_TO_PACKAGE)) {
    installed[KEY_TO_INSTALLED_FIELD[key]] = isPackageInstalled(projectRoot, packageName);
  }

  return { values, sources, installed, configPath: file.path, configPresent: file.present, configFormat: file.format };
}

module.exports = {
  resolveTeaConfig,
  readTeaConfigFile,
  isPackageInstalled,
  KEY_TO_PACKAGE,
  KEY_TO_INSTALLED_FIELD,
  MODULE_DEFAULTS,
  EXECUTION_MODE_VALUES,
  PACT_MCP_VALUES,
  CONFIG_RELATIVE_PATH,
  CONFIG_LAYER_RELATIVE_PATHS,
  LEGACY_CONFIG_RELATIVE_PATH,
  FLAG_TO_KEY,
};
