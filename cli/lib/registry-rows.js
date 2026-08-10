/**
 * Load the criteria-registry.md row → severity map from the skill itself, so the
 * CLI can check a report's "**Row**: <id>" citations against real rows instead of
 * trusting them.
 *
 * Why this exists: criteria-registry.md's own rule 1 is "Severity is read from this
 * table, never chosen. ... Inventing a severity is a defect in the review." Nothing
 * enforced that rule downstream: a report could cite a nonexistent row, or declare a
 * Severity that disagrees with the row it names, and parse-report.js never checked.
 * Same class of defect as the convention-baseline fabrication this module's sibling
 * (convention-baseline.js) fixes, and the same fix: stop trusting the agent to get a
 * checkable fact right, check it.
 *
 * The registry is the source of truth (per docs/explanation/test-review-cli-architecture.md's
 * "Governing rule: the skill is the source of truth"), so this reads the real file
 * shipped with the skill rather than a hardcoded copy that could drift from it —
 * no sync test needed, because there is nothing to sync.
 */

const fs = require('node:fs');
const path = require('node:path');

const SEVERITY_ENUM = ['Critical', 'High', 'Medium', 'Low'];

// Matches a criteria-registry.md row table line: | <ID> | <Criterion> | <Fires when> | <SEVERITY> | <Gate> |
// The two `[^|]*\|` groups skip the Criterion and Fires-when cells, whatever their
// content (both may be long free text, but never contain a literal pipe: an
// unescaped `|` would itself break the source table's own rendering).
const ROW_TABLE_LINE_PATTERN = /^\|\s*([CHML]\d+)\s*\|[^|]*\|[^|]*\|\s*(CRITICAL|HIGH|MEDIUM|LOW)\s*\|/gm;

function titleCase(word) {
  return word[0] + word.slice(1).toLowerCase();
}

/**
 * Parse every row ID and its severity out of the skill's criteria-registry.md.
 *
 * @param {string} skillRoot - Resolved skill directory (contains steps-c/).
 * @returns {object|null} `{ C1: 'Critical', H1: 'High', ... }`, or `null` when the
 *   registry file is missing/unreadable/empty of rows (e.g. a bare-bones test
 *   fixture skill root with no steps-c/ directory) — callers treat this as "no
 *   grounding available" and skip the row/severity cross-check rather than fail
 *   closed, since production skill installs always carry the real file.
 */
function loadRegistryRowSeverities(skillRoot) {
  const registryPath = path.join(skillRoot, 'steps-c', 'criteria-registry.md');
  let text;
  try {
    text = fs.readFileSync(registryPath, 'utf8');
  } catch {
    return null;
  }
  const severities = {};
  for (const match of text.matchAll(ROW_TABLE_LINE_PATTERN)) {
    severities[match[1]] = titleCase(match[2]);
  }
  return Object.keys(severities).length > 0 ? severities : null;
}

module.exports = { loadRegistryRowSeverities, SEVERITY_ENUM };
