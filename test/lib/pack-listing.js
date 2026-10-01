/**
 * The files `npm pack --dry-run --json` lists, read from either shape npm prints.
 *
 * npm 11 and earlier print an array with one entry per package; npm 12 prints one
 * object keyed by the package name. The Publish workflow installs the latest npm,
 * so a harness that destructures the array fails there while it passes on a
 * runner that carries an older npm. Both shapes name the same entry: an object
 * with a `files` array of `{ path }`.
 */

/**
 * @param {string} stdout The JSON `npm pack --dry-run --json` printed.
 * @returns {string[]} The packed file paths.
 */
function packedPaths(stdout) {
  const parsed = JSON.parse(stdout);
  const entry = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
  if (!Array.isArray(entry?.files)) {
    throw new TypeError('npm pack --json named no `files` array for the package');
  }
  return entry.files.map((file) => file.path);
}

module.exports = { packedPaths };
