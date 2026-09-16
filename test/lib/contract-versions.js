/**
 * The `schemaVersion` each of a suite's declared contract files carries today.
 *
 * `suiteResultRecord` in `test/lib/eval-record.js` accepts a `contractVersions`
 * map and has since `contracts[].version` first existed, but nothing populated
 * it: every harness passed the default `{}`, so every result ever recorded
 * `version: null` for every contract by omission rather than because a contract
 * genuinely carried none. This is the one shared reader nine call sites use
 * instead of nine hand-written lookups, so a suite's contract paths and its
 * result record can never name a different version for the same file.
 */

'use strict';

const path = require('node:path');

const { readJson } = require('./file-system-port');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

/**
 * One contract file's `schemaVersion`, read off disk, or `null` when the file
 * is absent or does not parse as JSON.
 *
 * Both read the same as `null` rather than throwing: this runs on the way to
 * writing a suite's own result record, and a helper that throws over the
 * condition it exists to report would stop that record from ever naming the
 * gap. `schemaVersion` is read back as a string because that is what
 * `suiteContractSchema.version` in `test/schema/eval-result.js` declares, the
 * same way a runner's own probed version is a string rather than the integer
 * a contract's `schemaVersion` actually is on disk.
 *
 * @param {string} absolutePath
 * @returns {Promise<string|null>}
 */
async function oneContractVersion(absolutePath) {
  let read;
  try {
    read = await readJson(absolutePath);
  } catch {
    return null;
  }
  if (!read.present) return null;
  const version = read.value?.schemaVersion;
  return version === undefined || version === null ? null : String(version);
}

/**
 * Every contract a suite declares, each resolved to its own `schemaVersion`.
 *
 * @param {{contracts?: string[]}} suite The manifest entry; `contracts` are paths relative to `projectRoot`.
 * @param {string} [projectRoot]
 * @returns {Promise<Record<string, string|null>>} Keyed by the manifest's own path string, unchanged, so a
 *   caller can look a path back up in the record it is building.
 */
async function contractVersionsFor(suite, projectRoot = PROJECT_ROOT) {
  const versions = {};
  for (const contractPath of suite.contracts ?? []) {
    versions[contractPath] = await oneContractVersion(path.join(projectRoot, contractPath));
  }
  return versions;
}

module.exports = { contractVersionsFor };
