/**
 * Resolves `--evaluation <path>` to an evaluation folder.
 *
 * The flag names either the folder or its `evaluation.json`. Nothing else is
 * consulted: no default folder and no project configuration, so an evaluation
 * that does not resolve is a wiring defect the caller fixes (exit 64), never a
 * guess this runtime makes.
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
  const absolute = path.resolve(cwd, value);
  const manifestPath = path.basename(absolute) === MANIFEST_NAME && isFile(absolute) ? absolute : path.join(absolute, MANIFEST_NAME);
  if (!isFile(manifestPath)) {
    return { ok: false, reason: `--evaluation ${value} does not resolve: no ${MANIFEST_NAME} at ${manifestPath}` };
  }
  return { ok: true, folder: path.dirname(manifestPath), manifestPath };
}

module.exports = { MANIFEST_NAME, resolveEvaluationFolder };
