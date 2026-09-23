/**
 * `corpus-index.json` and `corpusDigest` (AD-9).
 *
 * The index lists every file under `corpus/`, `probes/` and `mutations/` as
 * `{path, sha256}`: `path` relative to the evaluation folder in POSIX form,
 * `sha256` the 64 lowercase hex digits of the file's bytes, sorted by path.
 * `corpusDigest` is eval-quality's `digestArtifact` over that index, so it
 * moves when any indexed byte moves, fixtures included. The file is written
 * with eval-quality's `serializeArtifact`; staleness compares the digests of
 * the committed and the recomputed index, so the committed file's formatting
 * never matters.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { loadEngine } = require('./engine');

const INDEX_NAME = 'corpus-index.json';
const INDEXED_ROOTS = ['corpus', 'probes', 'mutations'];
const DIGEST_PREFIX = 'sha256:';

/** An indexed root holds something the index cannot digest; an authoring defect, reported by the file. */
class CorpusIndexError extends Error {
  constructor(file, message) {
    super(message);
    this.name = 'CorpusIndexError';
    this.file = file;
  }
}

/** Every regular file below `directory`, as absolute paths. A symbolic link is refused: the index digests bytes the folder owns. */
function filesUnder(directory, folder) {
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(absolute, folder));
    else if (entry.isFile()) files.push(absolute);
    else {
      const relative = path.relative(folder, absolute).split(path.sep).join('/');
      throw new CorpusIndexError(
        relative,
        `${relative} is not a regular file or directory; ${INDEX_NAME} indexes only bytes the evaluation folder holds, so replace a symbolic link with the file itself`,
      );
    }
  }
  return files;
}

/** Code-unit order, so the sort is the same on every machine and locale. */
function byPath(left, right) {
  if (left.path < right.path) return -1;
  if (left.path > right.path) return 1;
  return 0;
}

/**
 * Recomputes the index from the folder's bytes.
 *
 * @param {string} folder
 * @returns {Promise<Array<{ path: string, sha256: string }>>}
 */
async function buildCorpusIndex(folder) {
  const engine = await loadEngine();
  const entries = [];
  for (const root of INDEXED_ROOTS) {
    let stats;
    try {
      stats = fs.lstatSync(path.join(folder, root));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (!stats.isDirectory()) {
      throw new CorpusIndexError(
        root,
        `${root} is ${stats.isSymbolicLink() ? 'a symbolic link' : 'not a directory'}; ${INDEX_NAME} indexes only a directory the evaluation folder holds`,
      );
    }
    for (const absolute of filesUnder(path.join(folder, root), folder)) {
      const digest = engine.digestBytes(fs.readFileSync(absolute));
      entries.push({
        path: path.relative(folder, absolute).split(path.sep).join('/'),
        sha256: digest.slice(DIGEST_PREFIX.length),
      });
    }
  }
  return entries.sort(byPath);
}

/**
 * eval-quality's `digestArtifact` over an index.
 *
 * @param {unknown} index
 * @returns {Promise<string>}
 */
async function corpusDigestOf(index) {
  const engine = await loadEngine();
  return engine.digestArtifact(index, INDEX_NAME);
}

/** Whether a path is absent or a regular file (never a directory or a symbolic link). */
function isRegularOrAbsent(file) {
  try {
    return fs.lstatSync(file).isFile();
  } catch (error) {
    if (error.code === 'ENOENT') return true;
    throw error;
  }
}

/**
 * Writes the recomputed index into the folder and returns it with its digest.
 *
 * @param {string} folder
 * @returns {Promise<{ index: Array<{ path: string, sha256: string }>, corpusDigest: string, indexPath: string }>}
 */
async function writeCorpusIndex(folder) {
  const engine = await loadEngine();
  const index = await buildCorpusIndex(folder);
  const indexPath = path.join(folder, INDEX_NAME);
  if (!isRegularOrAbsent(indexPath)) {
    throw new CorpusIndexError(
      INDEX_NAME,
      `${INDEX_NAME} is a directory or a symbolic link; remove it so tea-evaluate digest can write the index`,
    );
  }
  fs.writeFileSync(indexPath, engine.serializeArtifact(index, INDEX_NAME));
  return { index, corpusDigest: await corpusDigestOf(index), indexPath };
}

/**
 * Why the committed index is stale, or null when it matches the folder.
 *
 * @param {string} folder
 * @returns {Promise<string|null>}
 */
async function corpusIndexProblem(folder) {
  const indexPath = path.join(folder, INDEX_NAME);
  if (!isRegularOrAbsent(indexPath)) return `${INDEX_NAME} is a directory or a symbolic link; remove it and run tea-evaluate digest`;
  let committed;
  try {
    committed = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  } catch (error) {
    return error.code === 'ENOENT'
      ? `${INDEX_NAME} is missing; run tea-evaluate digest`
      : `${INDEX_NAME} is not valid JSON (${error.message}); run tea-evaluate digest`;
  }
  const recomputed = await buildCorpusIndex(folder);
  let committedDigest;
  try {
    committedDigest = await corpusDigestOf(committed);
  } catch (error) {
    return `${INDEX_NAME} cannot be digested (${error.message}); run tea-evaluate digest`;
  }
  const recomputedDigest = await corpusDigestOf(recomputed);
  if (committedDigest === recomputedDigest) return null;
  const committedPaths = new Map(Array.isArray(committed) ? committed.map((entry) => [entry?.path, entry?.sha256]) : []);
  const changed = recomputed.filter((entry) => committedPaths.get(entry.path) !== entry.sha256).map((entry) => entry.path);
  const recomputedPaths = new Set(recomputed.map((entry) => entry.path));
  const removed = [...committedPaths.keys()].filter((entry) => !recomputedPaths.has(entry));
  const detail = [...changed.map((entry) => `${entry} changed or added`), ...removed.map((entry) => `${String(entry)} removed`)];
  return (
    `${INDEX_NAME} is stale: its digest ${committedDigest} does not match the folder's ${recomputedDigest}` +
    (detail.length > 0 ? ` (${detail.join('; ')})` : '') +
    '; run tea-evaluate digest'
  );
}

module.exports = { CorpusIndexError, INDEXED_ROOTS, INDEX_NAME, buildCorpusIndex, corpusDigestOf, corpusIndexProblem, writeCorpusIndex };
