/**
 * The baseline's file digests: `baseline/baseline.json` lists every other file of
 * `baseline/` with its `digestBytes`, and this file is the one place that reads
 * the bytes back and compares them (AD-12).
 *
 * `tea-evaluate check` and `tea-evaluate compare` both call it, so a baseline
 * edited by hand cannot pass as the one `compare --accept` wrote. It reports
 * `baseline-digest` findings, one per defect and each naming its file:
 *
 * - a file whose bytes digest to something other than the map's entry;
 * - a map entry whose file is missing, or is not a regular file;
 * - a file of `baseline/` other than `baseline.json` with no entry in the map;
 * - a map entry that is not a path inside `baseline/`;
 * - a manifest that cannot be read as a regular JSON file holding a `files` map,
 *   so nothing could be verified.
 *
 * A `baseline/` with no `baseline.json` is authored qualification evidence only
 * when every file in it is what authored evidence holds: files under `probes/`
 * and `qualification/` and a placeholder `README.md`. No manifest describes
 * those, so the rule has nothing to verify there. Any other file without a
 * manifest (`run.json`, `scores/`, `trials/`, `trial-sets.json` and the rest of
 * an accepted snapshot) is reported as the missing manifest, so deleting the
 * manifest cannot switch the rule off.
 *
 * Only real directories are entered and every file is opened without following a
 * link, so a link anywhere under `baseline/` is never read. An entry that is
 * neither a directory nor a regular file is the `baseline-file` rule's finding
 * (`check`, `compare`), and is skipped here unless the map lists it.
 *
 * This module requires nothing of the run's pipeline, so `check.js` (which
 * `preflight.js`, and through it `score.js` and `compare.js`, requires) and
 * `compare.js` can both load it.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { regularFileBytes } = require('./score-inputs');

const BASELINE = 'baseline';
const MANIFEST = 'baseline.json';
/** What an authored qualification baseline holds, with no manifest: files under these directories and a placeholder README. */
const AUTHORED_DIRECTORIES = ['probes/', 'qualification/'];
const AUTHORED_FILES = ['README.md'];
const RULE = 'baseline-digest';

/** One finding as `check` and `compare` print it; `relative` is below `baseline/`, or empty for the directory itself. */
function finding(relative, message) {
  return { file: relative === '' ? BASELINE : `${BASELINE}/${relative}`, rule: RULE, message };
}

function problemOf(error) {
  return error?.code === undefined ? error.message : `${error.code}: ${error.message}`;
}

/** `lstat`, or null when the entry is absent, or a file stands where a directory above it should. Any other error is thrown. */
function lstatOrNull(file) {
  try {
    return fs.lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
}

/** True when `key` is a relative POSIX path inside a directory: no empty, `.` or `..` segment, no backslash or NUL. */
function isInsidePath(key) {
  return (
    key.length > 0 &&
    !key.includes('\\') &&
    !key.includes('\0') &&
    key.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
  );
}

/** Every regular file below `directory`, as a path relative to it, sorted. Only real directories are entered. */
function regularFilesUnder(directory, relative, found, findings) {
  const names = fs.readdirSync(path.join(directory, ...(relative === '' ? [] : relative.split('/')))).sort();
  for (const name of names) {
    const child = relative === '' ? name : `${relative}/${name}`;
    let stats;
    try {
      stats = fs.lstatSync(path.join(directory, ...child.split('/')));
    } catch (error) {
      findings.push(finding(child, `cannot be examined: ${problemOf(error)}`));
      continue;
    }
    if (stats.isDirectory()) regularFilesUnder(directory, child, found, findings);
    else if (stats.isFile()) found.add(child);
  }
}

/** The manifest's `files` map and nothing else, or a finding that says why none could be read. */
function readFilesMap(baselinePath) {
  let manifest;
  try {
    manifest = JSON.parse(regularFileBytes(path.join(baselinePath, MANIFEST)).toString('utf8'));
  } catch (error) {
    return {
      problem: finding(
        MANIFEST,
        `cannot be read as a regular JSON file (${problemOf(error)}); the digests of ${BASELINE}/ cannot be verified`,
      ),
    };
  }
  const files = manifest?.files;
  if (files === null || typeof files !== 'object' || Array.isArray(files)) {
    return { problem: finding(MANIFEST, `holds no files map of path to digestBytes; the digests of ${BASELINE}/ cannot be verified`) };
  }
  return { files };
}

/**
 * The `baseline-digest` findings over `folder`'s `baseline/`, empty when it matches its manifest, is absent, or is
 * authored qualification evidence (see the header) with no manifest.
 *
 * @param {object} options
 * @param {string} options.folder the evaluation folder
 * @param {(bytes: Buffer) => string} options.digestBytes eval-quality's `digestBytes`
 * @returns {Array<{ file: string, rule: string, message: string }>}
 */
function baselineDigestFindings({ folder, digestBytes }) {
  const baselinePath = path.join(folder, BASELINE);
  let stats;
  try {
    stats = lstatOrNull(baselinePath);
  } catch (error) {
    return [finding('', `cannot be examined: ${problemOf(error)}`)];
  }
  // An absent baseline and a link or file in its place are the callers' own findings (`first-run`, `baseline-file`).
  if (stats === null || !stats.isDirectory()) return [];

  const present = new Set();
  const findings = [];
  try {
    regularFilesUnder(baselinePath, '', present, findings);
  } catch (error) {
    return [...findings, finding('', `cannot be listed: ${problemOf(error)}`)];
  }
  if (!present.has(MANIFEST)) {
    const foreign = [...present]
      .filter((key) => !AUTHORED_FILES.includes(key) && !AUTHORED_DIRECTORIES.some((directory) => key.startsWith(directory)))
      .sort();
    if (foreign.length === 0) return findings;
    const more = foreign.length > 1 ? ` and ${foreign.length - 1} more` : '';
    return [
      ...findings,
      finding(
        MANIFEST,
        `is absent while ${BASELINE}/ holds ${foreign[0]}${more}, which authored qualification evidence (${[...AUTHORED_DIRECTORIES, ...AUTHORED_FILES].join(', ')}) does not hold; the digests of ${BASELINE}/ cannot be verified`,
      ),
    ];
  }
  const { files, problem } = readFilesMap(baselinePath);
  if (problem !== undefined) return [...findings, problem];

  for (const key of Object.keys(files).sort()) {
    if (!isInsidePath(key)) {
      findings.push(finding(MANIFEST, `lists ${JSON.stringify(key)}, which is not a path inside ${BASELINE}/`));
      continue;
    }
    if (!present.has(key)) {
      let state;
      try {
        state = lstatOrNull(path.join(baselinePath, ...key.split('/'))) === null ? 'missing' : 'not-regular';
      } catch (error) {
        // A segment past the file system's name limit, a link loop and any other failure of the probe is a finding on that key.
        findings.push(finding(key, `cannot be examined: ${error.code ?? problemOf(error)}`));
        continue;
      }
      findings.push(
        finding(
          key,
          state === 'not-regular'
            ? `${MANIFEST} lists this file and it is not a regular file inside ${BASELINE}/`
            : `${MANIFEST} lists this file and it is missing from ${BASELINE}/`,
        ),
      );
      continue;
    }
    let actual;
    try {
      actual = digestBytes(regularFileBytes(path.join(baselinePath, ...key.split('/'))));
    } catch (error) {
      findings.push(finding(key, `cannot be read as a regular file: ${problemOf(error)}`));
      continue;
    }
    const recorded = files[key];
    if (actual !== recorded) {
      findings.push(
        finding(
          key,
          `digests to ${actual}; ${MANIFEST} records ${typeof recorded === 'string' ? recorded : JSON.stringify(recorded)}, so the file is not the one that was accepted`,
        ),
      );
    }
  }
  for (const key of [...present].sort()) {
    if (key !== MANIFEST && !Object.hasOwn(files, key)) {
      findings.push(
        finding(key, `is in ${BASELINE}/ and the files map of ${MANIFEST} does not list it, so it is not part of the accepted baseline`),
      );
    }
  }
  return findings;
}

module.exports = { baselineDigestFindings };
