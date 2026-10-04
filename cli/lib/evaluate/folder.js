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
/** Opens without following a link at the file itself and without blocking on a FIFO. */
const READ_REGULAR = fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0) | (fs.constants.O_NOFOLLOW ?? 0);
const LINK_REASON = 'passes through a symbolic link; name the file itself';
/** A path argument is spelled with the platform's separators; on POSIX a backslash is an ordinary file name character. */
const SEPARATOR = path.sep === '\\' ? /[/\\]/ : /\//;

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

/** Why a path cannot name a file the folder holds, or null when its spelling stays inside the folder. */
function spellingProblem(relative) {
  if (typeof relative !== 'string' || relative.length === 0) return 'names no file';
  if (relative.includes('\0')) return 'holds a NUL byte';
  if (path.isAbsolute(relative)) return 'is absolute; name a path relative to the evaluation folder';
  if (relative.split(SEPARATOR).includes('..')) return 'leaves the evaluation folder through ..';
  return null;
}

/**
 * Reads one file the evaluation folder holds, by a path relative to the folder.
 *
 * The path is walked one component at a time without following a link, so a symbolic link at any component, a directory where
 * the file belongs, a missing component and an entry that is not a regular file are each refused with the reason.
 * The open then follows no link at the file itself, and the descriptor must be the very file the walk vetted (same device and
 * inode), so a directory above the file swapped for a link after the walk is refused too. Nothing is created or written.
 *
 * @param {string} folder the evaluation folder by its real path (what `resolveEvaluationFolder` returns)
 * @param {unknown} relative
 * @returns {{ ok: true, bytes: Buffer } | { ok: false, reason: string }} `reason` completes a sentence that starts with the spelled path
 */
function readFolderFile(folder, relative) {
  const problem = spellingProblem(relative);
  if (problem !== null) return { ok: false, reason: problem };
  const segments = relative.split(SEPARATOR).filter((segment) => segment !== '' && segment !== '.');
  if (segments.length === 0) return { ok: false, reason: 'is the evaluation folder, a directory' };
  let current = folder;
  let walked;
  for (const [position, segment] of segments.entries()) {
    current = path.join(current, segment);
    const last = position === segments.length - 1;
    let stats;
    try {
      stats = fs.lstatSync(current);
    } catch (error) {
      if (error.code === 'ENOENT') return { ok: false, reason: 'does not exist in the evaluation folder' };
      return { ok: false, reason: `cannot be read (${error.code ?? 'unreadable'})` };
    }
    if (stats.isSymbolicLink()) return { ok: false, reason: LINK_REASON };
    if (!last && !stats.isDirectory()) return { ok: false, reason: 'passes through something that is not a directory' };
    if (last && stats.isDirectory()) return { ok: false, reason: 'is a directory; name a file' };
    if (last && !stats.isFile()) return { ok: false, reason: 'is not a regular file' };
    walked = stats;
  }
  let descriptor;
  try {
    descriptor = fs.openSync(current, READ_REGULAR);
  } catch (error) {
    if (error.code === 'ELOOP' || error.code === 'EMLINK') return { ok: false, reason: LINK_REASON };
    return { ok: false, reason: `cannot be read as a regular file (${error.code ?? error.message})` };
  }
  let bytes;
  try {
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile()) return { ok: false, reason: 'is not a regular file' };
    if (opened.dev !== walked.dev || opened.ino !== walked.ino)
      return { ok: false, reason: 'changed while it was read; run the command again' };
    bytes = fs.readFileSync(descriptor);
  } catch (error) {
    return { ok: false, reason: `cannot be read as a regular file (${error.code ?? error.message})` };
  } finally {
    fs.closeSync(descriptor);
  }
  return { ok: true, bytes };
}

module.exports = { MANIFEST_NAME, readFolderFile, resolveEvaluationFolder };
