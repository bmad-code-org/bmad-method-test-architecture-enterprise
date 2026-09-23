/**
 * The `eval-quality` artifacts TEA hands to the scoring half, from the
 * `tea-evaluate` runtime.
 *
 * The builders (`evaluatorConfiguration`, `isolationManifest`,
 * `recordObservation`, `probeObservation`, `sealedRunRecord`) and the validator
 * over the published schemas live in `cli/lib/evaluate/records.js` since Story
 * 1.5, and the schema-version table they stamp from lives in
 * `cli/lib/evaluate/engine.js`, so TEA's harness and every adopter's
 * `tea-evaluate` run build one shape for each artifact (AD-5). What stays here
 * is TEA's: the path of its own scoring policy, and the wiring that routes every
 * file this module reads through `test/lib/file-system-port.js`.
 *
 * WHAT REACHES `fs` DIRECTLY, AND WHY
 *
 * Nothing. Both files this module reads, the published schema behind
 * `validateArtifact` and the scoring policy behind `scoringPolicy`, go through
 * `test/lib/file-system-port.js`: the runtime's validator takes the port's
 * `readJson` as its reader, which is why both functions are asynchronous. The
 * schema-version constants come from the runtime's engine module through
 * `require` alone, so they stay synchronous and the port plays no part in them;
 * `eval-quality.config.json` holds that module to a `dependency-direction`
 * `purity` ban on `await`, an async function, and `new Date`.
 *
 * `SCHEMA_VERSIONS` is the one table of the versions TEA writes or receives,
 * and `npm run test:schema-versions` holds every stamp TEA commits, in source
 * and on disk, to it.
 */

'use strict';

const path = require('node:path');

const { SCHEMA_VERSIONS, expectedSchemaVersion, loadEngine, schemaVersionProblems } = require('../../cli/lib/evaluate/engine');
const {
  FORBIDDEN_INPUTS,
  createArtifactValidator,
  evaluatorConfiguration,
  isolationManifest,
  probeObservation,
  recordObservation,
  sealedRunRecord,
} = require('../../cli/lib/evaluate/records');
const { readJson } = require('./file-system-port');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const POLICY_PATH = path.join(PROJECT_ROOT, 'test', 'probes', 'scoring-policy.json');

/**
 * One artifact against the schema `eval-quality` publishes for it, and, for a
 * kind `SCHEMA_VERSIONS` covers, against the `schemaVersion` the installed
 * package reads for it. Every schema read goes through the file-system port.
 */
const validateArtifact = createArtifactValidator({ readJson });

/**
 * TEA's scoring policy, the artifact whose digest enters every scoring version
 * this repository computes.
 *
 * Absence is named rather than left to surface as a null the caller dereferences:
 * a repository with no scoring policy cannot score anything, and the message says
 * which file is missing.
 *
 * @returns {Promise<object>}
 */
async function scoringPolicy() {
  const read = await readJson(POLICY_PATH);
  if (!read.present) throw new Error(`no scoring policy at ${path.relative(PROJECT_ROOT, POLICY_PATH)}`);
  return read.value;
}

module.exports = {
  FORBIDDEN_INPUTS,
  SCHEMA_VERSIONS,
  evaluatorConfiguration,
  expectedSchemaVersion,
  isolationManifest,
  loadEvalQuality: loadEngine,
  probeObservation,
  recordObservation,
  schemaVersionProblems,
  scoringPolicy,
  sealedRunRecord,
  validateArtifact,
};
