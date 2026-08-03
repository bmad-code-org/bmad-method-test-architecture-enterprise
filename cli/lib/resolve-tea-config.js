/**
 * Resolve the TEA module config keys that change which knowledge fragments the
 * review loads, so a headless run never leaves them to the agent's discretion.
 *
 * Precedence, highest first:
 *   1. An explicit CLI flag (--use-playwright-utils / --no-use-pactjs-utils / ...)
 *   2. The consuming project's _bmad/tea/config.yaml, written by the installer
 *   3. The module default declared in src/module.yaml
 *
 * Step 01 of the workflow branches on these keys (Playwright Utils loading
 * profile, the pactjs-utils fragment set, Pact MCP). When the file is absent and
 * nothing states them, the agent picks per run and two runs over identical files
 * can review against different knowledge. Every run states all three.
 *
 * MODULE_DEFAULTS mirrors src/module.yaml. The test suite asserts they are equal,
 * so changing one side without the other fails the gate rather than drifting.
 */

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const CONFIG_RELATIVE_PATH = path.join('_bmad', 'tea', 'config.yaml');

const MODULE_DEFAULTS = {
  tea_use_playwright_utils: true,
  tea_use_pactjs_utils: false,
  tea_pact_mcp: 'none',
};

const PACT_MCP_VALUES = ['mcp', 'none'];

/** Maps a CLI option name to the config key it overrides. */
const FLAG_TO_KEY = {
  usePlaywrightUtils: 'tea_use_playwright_utils',
  usePactjsUtils: 'tea_use_pactjs_utils',
  pactMcp: 'tea_pact_mcp',
};

function configError(message) {
  const error = new Error(message);
  error.code = 'TEA_CONFIG_INVALID';
  return error;
}

/**
 * Coerce a config-file boolean. The installer writes real booleans, but
 * hand-edited files often carry the quoted form, and module.yaml calls the
 * boolean type out as CRITICAL. Accept both spellings, reject anything else.
 *
 * @param {unknown} value - Raw value from config.yaml.
 * @param {string} key - Config key name, for the error message.
 * @returns {boolean}
 */
function coerceBoolean(value, key) {
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
  throw configError(`${key} in ${CONFIG_RELATIVE_PATH} must be true or false, got ${JSON.stringify(value)}`);
}

/**
 * Coerce the tea_pact_mcp string enum.
 *
 * @param {unknown} value - Raw value from config.yaml.
 * @returns {string}
 */
function coercePactMcp(value) {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (PACT_MCP_VALUES.includes(normalized)) {
      return normalized;
    }
  }
  throw configError(`tea_pact_mcp in ${CONFIG_RELATIVE_PATH} must be one of ${PACT_MCP_VALUES.join(' | ')}, got ${JSON.stringify(value)}`);
}

/**
 * Read the three keys this CLI cares about out of the project's TEA config.
 * A missing file is normal (CI installs the skill without running the
 * installer); unreadable or unparseable content is a configuration error.
 *
 * @param {string} projectRoot - Consuming project root.
 * @returns {{present: boolean, path: string, values: object}}
 */
function readTeaConfigFile(projectRoot) {
  const configPath = path.join(projectRoot, CONFIG_RELATIVE_PATH);
  if (!fs.existsSync(configPath)) {
    return { present: false, path: configPath, values: {} };
  }

  let parsed;
  try {
    parsed = yaml.load(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    throw configError(`Failed to parse ${configPath}: ${error.message}`);
  }

  if (parsed === null || parsed === undefined) {
    return { present: true, path: configPath, values: {} };
  }
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw configError(`${configPath} must contain a YAML mapping of config keys`);
  }

  const values = {};
  if ('tea_use_playwright_utils' in parsed) {
    values.tea_use_playwright_utils = coerceBoolean(parsed.tea_use_playwright_utils, 'tea_use_playwright_utils');
  }
  if ('tea_use_pactjs_utils' in parsed) {
    values.tea_use_pactjs_utils = coerceBoolean(parsed.tea_use_pactjs_utils, 'tea_use_pactjs_utils');
  }
  if ('tea_pact_mcp' in parsed) {
    values.tea_pact_mcp = coercePactMcp(parsed.tea_pact_mcp);
  }

  return { present: true, path: configPath, values };
}

/**
 * Resolve every key through the precedence chain.
 *
 * @param {object} options
 * @param {string} options.projectRoot - Consuming project root.
 * @param {object} [options.flags] - Parsed CLI options; only the keys in
 *   FLAG_TO_KEY are read, and only when not undefined.
 * @returns {{values: object, sources: object, configPath: string, configPresent: boolean}}
 * @throws {Error} With code TEA_CONFIG_INVALID on unusable config content.
 */
function resolveTeaConfig({ projectRoot, flags = {} }) {
  const file = readTeaConfigFile(projectRoot);

  const values = {};
  const sources = {};

  for (const [flagName, key] of Object.entries(FLAG_TO_KEY)) {
    const flagValue = flags[flagName];
    if (flagValue !== undefined) {
      values[key] = key === 'tea_pact_mcp' ? coercePactMcp(flagValue) : flagValue;
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

  return { values, sources, configPath: file.path, configPresent: file.present };
}

module.exports = {
  resolveTeaConfig,
  readTeaConfigFile,
  MODULE_DEFAULTS,
  PACT_MCP_VALUES,
  CONFIG_RELATIVE_PATH,
  FLAG_TO_KEY,
};
