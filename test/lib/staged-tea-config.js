/**
 * What a staged eval workspace carries besides the skill itself.
 *
 * The central config, in the shape `bmad setup tea` writes: `_bmad/config.toml`
 * with a `[core]` table and a `[modules.tea]` table. Every value is a string, as
 * setup writes them ("true"/"false" for booleans).
 *
 * The knowledge base: a staged skill sits at `skill/` and reads fragments from
 * `{tea-knowledge}` = `{skill-root}/../bmod-tea/knowledge`, so the bmod-tea skill
 * is staged beside it as `bmod-tea/`.
 */

const fs = require('node:fs');
const path = require('node:path');

const TEA_CONFIG_RELATIVE_PATH = path.join('_bmad', 'config.toml');
const BMOD_TEA_SOURCE = path.join(__dirname, '..', '..', 'skills', 'bmod-tea');
const STAGED_KNOWLEDGE_RELATIVE_PATH = 'bmod-tea/knowledge';
/** The prompt's run-configuration line for the knowledge placeholder. */
const TEA_KNOWLEDGE_PROMPT_LINE = `- \`{tea-knowledge}\`: \`${STAGED_KNOWLEDGE_RELATIVE_PATH}\``;

/**
 * Copy skills/bmod-tea into `<workspaceDir>/bmod-tea`, beside the staged `skill/`.
 *
 * @param {string} workspaceDir
 */
function stageTeaKnowledge(workspaceDir) {
  fs.cpSync(BMOD_TEA_SOURCE, path.join(workspaceDir, 'bmod-tea'), { recursive: true });
}

/**
 * Render one table body. Each entry is either a `# comment` line or a
 * `[key, value]` pair; values are written as TOML strings.
 *
 * @param {Array<string | [string, string | boolean]>} entries
 * @returns {string[]}
 */
function tableLines(entries) {
  return entries.map((entry) => (typeof entry === 'string' ? entry : `${entry[0]} = ${JSON.stringify(String(entry[1]))}`));
}

/**
 * @param {object} options
 * @param {string[]} [options.header] - Comment lines above the first table.
 * @param {Array<string | [string, string | boolean]>} options.core
 * @param {Array<string | [string, string | boolean]>} options.tea
 * @returns {string} The TOML text.
 */
function teaConfigToml({ header = [], core, tea }) {
  return [...header, '[core]', ...tableLines(core), '', '[modules.tea]', ...tableLines(tea), ''].join('\n');
}

module.exports = {
  TEA_CONFIG_RELATIVE_PATH,
  STAGED_KNOWLEDGE_RELATIVE_PATH,
  TEA_KNOWLEDGE_PROMPT_LINE,
  stageTeaKnowledge,
  teaConfigToml,
};
