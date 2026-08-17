/**
 * Resolve the installed bmad-testarch-test-review skill root inside a consuming project.
 *
 * Probe order mirrors BMAD installer outputs: BMAD core layout, Claude Code, Codex.
 * The skill remains the source of truth for review logic; the CLI only locates it.
 */

const fs = require('node:fs');
const path = require('node:path');

const SKILL_NAME = 'bmad-testarch-test-review';

const SKILL_CANDIDATES = [
  path.join('_bmad', 'tea', 'workflows', 'testarch', SKILL_NAME),
  path.join('.claude', 'skills', SKILL_NAME),
  path.join('.agents', 'skills', SKILL_NAME),
  path.join('src', 'workflows', 'testarch', SKILL_NAME),
];

const INSTALL_REMEDIATION =
  'Install the TEA module with: npx bmad-method install (select the Test Architect module), then re-run tea-test-review.';

/**
 * Find the skill root directory (the folder containing SKILL.md).
 *
 * @param {string} projectRoot - Consuming project root to probe.
 * @returns {string} Absolute skill root path.
 * @throws {Error} With code SKILL_MISSING when no candidate exists.
 */
function resolveSkill(projectRoot) {
  for (const candidate of SKILL_CANDIDATES) {
    const skillRoot = path.join(projectRoot, candidate);
    if (fs.existsSync(path.join(skillRoot, 'SKILL.md'))) {
      return skillRoot;
    }
  }

  const probed = SKILL_CANDIDATES.map((candidate) => `  - ${path.join(projectRoot, candidate)}`).join('\n');
  const error = new Error(`${SKILL_NAME} skill not found in this project.\n${INSTALL_REMEDIATION}\nProbed:\n${probed}`);
  error.code = 'SKILL_MISSING';
  throw error;
}

module.exports = { resolveSkill, SKILL_CANDIDATES, SKILL_NAME };
