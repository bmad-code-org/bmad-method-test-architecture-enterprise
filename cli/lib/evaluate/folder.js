/**
 * Resolves `--evaluation <path>` to an evaluation folder.
 *
 * The flag names either the folder or its `evaluation.json`. Nothing else is
 * consulted: no default folder and no project configuration, so an evaluation
 * that does not resolve is a wiring defect the caller fixes (exit 64). The
 * folder is returned by its real path, so a link to it resolves the folder's
 * own relative paths the same way as the folder.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MANIFEST_NAME = 'evaluation.json';

function isFile(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/**
 * @param {unknown} value the raw `--evaluation` value
 * @param {string} [cwd]
 * @returns {{ ok: true, folder: string, manifestPath: string } | { ok: false, reason: string }}
 */
function resolveEvaluationFolder(value, cwd = process.cwd()) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false, reason: '--evaluation <path> is required: name an evaluation folder or its evaluation.json' };
  }
  // Joined as spelled: normalizing would collapse a `..` after a symbolic link, which the system climbs from the link's target.
  const absolute = path.isAbsolute(value) ? value : `${cwd}${path.sep}${value}`;
  const manifestPath = path.basename(absolute) === MANIFEST_NAME && isFile(absolute) ? absolute : `${absolute}${path.sep}${MANIFEST_NAME}`;
  if (!isFile(manifestPath)) {
    return { ok: false, reason: `--evaluation ${value} does not resolve: no ${MANIFEST_NAME} at ${manifestPath}` };
  }
  // The folder by its real path: every path relative to the folder resolves
  // against the folder's real location, symbolic links included.
  const folder = fs.realpathSync.native(path.dirname(manifestPath));
  return { ok: true, folder, manifestPath: path.join(folder, MANIFEST_NAME) };
}

module.exports = { MANIFEST_NAME, resolveEvaluationFolder };
