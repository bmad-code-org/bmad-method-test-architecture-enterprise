/**
 * The TEA skill list, read off the repository instead of typed out.
 *
 * A hand-maintained list is a coverage claim nobody re-checks. The next skill
 * would land with no eval and no deferred declaration, and the manifest gate
 * would keep reporting full accounting because the new name was never in the
 * list it compares against.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

// Every TEA skill, the bmad-tea agent included, is a folder under skills/. The
// bmod-* folders are module records (bmod-tea carries the shared knowledge base),
// not skills a user runs, so they are not counted.
const SKILL_ROOTS = ['skills'];
const MODULE_RECORD = /^bmod-/;

function directoryNames(absolute) {
  if (!fs.existsSync(absolute)) return [];
  return fs
    .readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/**
 * Every TEA skill name, sorted and de-duplicated.
 *
 * @param {string} [projectRoot] Repository root; defaults to this checkout.
 * @returns {string[]}
 */
function teaSkills(projectRoot = PROJECT_ROOT) {
  const names = new Set();
  for (const root of SKILL_ROOTS) {
    for (const name of directoryNames(path.join(projectRoot, root))) {
      if (!MODULE_RECORD.test(name)) names.add(name);
    }
  }
  return [...names].sort();
}

module.exports = { teaSkills, SKILL_ROOTS, PROJECT_ROOT };
