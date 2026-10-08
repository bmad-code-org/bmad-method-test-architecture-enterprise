/**
 * Resolve the installed bmad-testarch-test-review skill root inside a consuming project.
 *
 * Probe order mirrors BMAD installer outputs: BMAD core layout, Claude Code, Codex.
 * The skill remains the source of truth for review logic; the CLI only locates it.
 */

const fs = require('node:fs');
const path = require('node:path');

const SKILL_NAME = 'bmad-testarch-test-review';

// The classic installer's location comes last: a project upgraded from v6 can still hold that copy, and it must not shadow the skill the v7 install added.
const SKILL_CANDIDATES = [
  path.join('.claude', 'skills', SKILL_NAME),
  path.join('.agents', 'skills', SKILL_NAME),
  path.join('skills', SKILL_NAME),
  path.join('_bmad', 'tea', 'workflows', 'testarch', SKILL_NAME),
];

const INSTALL_REMEDIATION =
  'Install TEA with: npx skills add bmad-code-org/bmad-method-test-architecture-enterprise, then re-run tea-test-review.';

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

/** The skill this CLI ships with, one folder up from cli/ in the published package. */
const PACKAGED_SKILLS_DIR = path.join(__dirname, '..', '..', 'skills');

/**
 * Find the skill root shipped in the CLI's own package.
 *
 * The CLI and the skill it drives come from one published version, and the skill sits outside any
 * checkout under review, so a pull request cannot edit the reviewer that judges it.
 *
 * @param {string} [skillsDir] - Directory holding the packaged skills (test seam).
 * @returns {string} Absolute skill root path.
 * @throws {Error} With code SKILL_MISSING when the package carries no skill.
 */
function resolvePackagedSkill(skillsDir = PACKAGED_SKILLS_DIR) {
  const skillRoot = path.join(skillsDir, SKILL_NAME);
  if (fs.existsSync(path.join(skillRoot, 'SKILL.md'))) {
    return skillRoot;
  }
  const error = new Error(
    `${SKILL_NAME} skill not found in the tea-test-review package (expected ${skillRoot}).\nReinstall bmad-method-test-architecture-enterprise, or pass --skill-root <path>.`,
  );
  error.code = 'SKILL_MISSING';
  throw error;
}

module.exports = { resolveSkill, resolvePackagedSkill, SKILL_CANDIDATES, SKILL_NAME };
