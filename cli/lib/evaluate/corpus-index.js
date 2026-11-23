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

/** `error`'s code as the index reports it, for a file the process cannot open or list. */
const unreadable = (relative, error) =>
  new CorpusIndexError(
    relative,
    `${relative} cannot be read (${error.code ?? 'error'}); ${INDEX_NAME} indexes only bytes the evaluation folder holds and this process can open`,
  );

/**
 * Every regular file below `directory`, as absolute paths, except what `skipped` names. A skipped entry is decided by its path
 * alone, before any lstat, listing or type check, so a development comparison neither lists nor refuses what a sealed path holds.
 * A symbolic link and an entry that is neither a file nor a directory are refused: the index digests bytes the folder owns.
 */
function filesUnder(directory, folder, skipped) {
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw unreadable(path.relative(folder, directory).split(path.sep).join('/'), error);
  }
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(folder, absolute).split(path.sep).join('/');
    if (skipped.has(relative)) continue;
    if (entry.isDirectory()) files.push(...filesUnder(absolute, folder, skipped));
    else if (entry.isFile()) files.push(absolute);
    else {
      throw new CorpusIndexError(
        relative,
        `${relative} is not a regular file or directory; ${INDEX_NAME} indexes only bytes the evaluation folder holds, so replace a symbolic link with the file itself`,
      );
    }
  }
  return files;
}

/**
 * The paths a comparison leaves unread: each file named, and everything below a directory named with a trailing `/`. Spelling is
 * compared in lower case, so a case-variant spelling of a sealed path that a case-insensitive file system resolves to the same
 * place stays unread too.
 */
function unreadPaths(unread) {
  const entries = [...unread].map((entry) => entry.toLowerCase());
  return {
    size: entries.length,
    has: (relative) => {
      if (typeof relative !== 'string') return false;
      const folded = relative.toLowerCase();
      return entries.some((entry) => (entry.endsWith('/') ? `${folded}/`.startsWith(entry) : folded === entry));
    },
  };
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
 * @param {object} [options]
 * @param {Iterable<string>} [options.unread] paths relative to the folder that are left out, neither listed nor opened (the held-out
 *   folder `corpus/held-out/`, for a development run's staleness check); a path that ends in `/` leaves out every file
 *   below that directory. The index `tea-evaluate digest` writes never leaves one out
 * @returns {Promise<Array<{ path: string, sha256: string }>>}
 */
async function buildCorpusIndex(folder, { unread = [] } = {}) {
  const skipped = unreadPaths(unread);
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
    for (const absolute of filesUnder(path.join(folder, root), folder, skipped)) {
      const relative = path.relative(folder, absolute).split(path.sep).join('/');
      let bytes;
      try {
        bytes = fs.readFileSync(absolute);
      } catch (error) {
        throw unreadable(relative, error);
      }
      const digest = engine.digestBytes(bytes);
      entries.push({ path: relative, sha256: digest.slice(DIGEST_PREFIX.length) });
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

/** The name `heldOutDigestOf` digests its value under. */
const HELD_OUT_CONTENT = 'held-out-content';

/**
 * The index entries that hold held-out material: every file under `corpus/held-out/`, and for each probe `heldOutProbes` lists, its
 * probe file, its degenerate response under `corpus/gameability/` and the mutation file its qualification names.
 *
 * @param {Array<{ path: string, sha256: string }>} index
 * @param {Array<object>} probes the committed probes, parsed
 * @param {Iterable<string>} heldOutProbes
 * @returns {Array<{ path: string, sha256: string }>}
 */
function heldOutEntries(index, probes, heldOutProbes) {
  const held = new Set(heldOutProbes);
  const owned = new Set();
  for (const probe of probes) {
    if (probe === null || typeof probe !== 'object' || !held.has(probe.probeId)) continue;
    owned.add(`probes/${probe.probeId}.probe.json`);
    owned.add(`corpus/gameability/${probe.probeId}.json`);
    const mutation = probe.qualification?.mutation;
    if (typeof mutation === 'string') owned.add(`mutations/${mutation}.mutation.json`);
  }
  return index
    .filter((entry) => entry !== null && typeof entry === 'object' && typeof entry.path === 'string')
    .filter((entry) => entry.path.startsWith('corpus/held-out/') || owned.has(entry.path))
    .map((entry) => ({ path: entry.path, sha256: entry.sha256 }))
    .sort(byPath);
}

/**
 * eval-quality's `digestArtifact` over the held-out material a run measured: the sorted `heldOutProbes`, the index entries
 * `heldOutEntries` keeps, and the contract a held-out run executes (the held-out view under a `partitionPlan`: the shared steps, the
 * held-out plan's steps and the oracles that view keeps). It reads digests from the index and opens no held-out file itself. It moves
 * when a held-out probe, its seed, its degenerate response, a file under `corpus/held-out/`, the held-out list, a shared step or an
 * oracle the held-out view keeps moves, and stays put when only development material does (a development probe, or a
 * development-only step and the oracles that read it).
 *
 * @param {object} options
 * @param {Array<{ path: string, sha256: string }>} options.index the corpus index
 * @param {Array<object>} options.probes the committed probes, parsed
 * @param {Iterable<string>} options.heldOutProbes
 * @param {object} options.contract the contract a held-out run executes (`loadContractView` with `partition: 'held-out'`)
 * @returns {Promise<string>}
 */
async function heldOutDigestOf({ index, probes, heldOutProbes, contract }) {
  const engine = await loadEngine();
  const ids = [...new Set(heldOutProbes)].sort();
  return engine.digestArtifact({ heldOutProbes: ids, files: heldOutEntries(index, probes, ids), contract }, HELD_OUT_CONTENT);
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
 * @param {object} [options]
 * @param {Iterable<string>} [options.unread] paths relative to the folder that this comparison neither opens nor compares, so a
 *   development run never reads the held-out plan (Story 1.51) or anything else under `corpus/held-out/` (Story 1.109); a path that ends
 *   in `/` stands for every file below that directory. The full comparison is `check`'s and a held-out run's
 * @returns {Promise<string|null>}
 */
async function corpusIndexProblem(folder, { unread = [] } = {}) {
  const left = [...unread];
  const skipped = unreadPaths(left);
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
  const recomputed = await buildCorpusIndex(folder, { unread: left });
  if (skipped.size > 0 && Array.isArray(committed)) committed = committed.filter((entry) => !skipped.has(entry?.path));
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

module.exports = {
  CorpusIndexError,
  INDEXED_ROOTS,
  INDEX_NAME,
  buildCorpusIndex,
  corpusDigestOf,
  corpusIndexProblem,
  heldOutDigestOf,
  heldOutEntries,
  unreadPaths,
  writeCorpusIndex,
};
