'use strict';

/**
 * The evidence artifact the installed eval-quality writes for the records of a historical capture.
 *
 * A capture keeps the bytes its run wrote, so an evidence schema the engine has since moved past is carried forward here
 * and never in the capture (`evaluate-refreshed-seal.js` holds seals to the same rule). Each step is the edit eval-quality
 * itself made to its published evidence and nothing else, and the result is serialized by the engine:
 *
 * - 4 to 5 (eval-quality 10.0.0): every coverage gap gains `waiverId`, `null` when no contract waiver covers it. That is
 *   the engine's answer for a contract that declares no waiver, so a capture whose contract declares one is refused here
 *   and has to be re-recorded.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');

const { loadEngine } = require('../../cli/lib/evaluate/engine');

const MIGRATIONS = new Map([
  [
    4,
    (artifact, contract) => {
      assert.deepEqual(contract.waivers, [], 'a capture whose contract declares a waiver cannot be migrated to evidence schema 5');
      for (const gap of artifact.coverageGaps) {
        assert.ok(!('waiverId' in gap), 'a schema-4 coverage gap already carries waiverId');
        gap.waiverId = null;
      }
    },
  ],
]);

/**
 * @param {string} capture a historical `evidence-artifact.json`
 * @param {string} contractFile the compiled contract its run scored against
 * @returns {Promise<Buffer>} the bytes the installed engine writes for the same records
 */
async function currentEvidence(capture, contractFile) {
  const engine = await loadEngine();
  const artifact = JSON.parse(fs.readFileSync(capture, 'utf8'));
  const contract = JSON.parse(fs.readFileSync(contractFile, 'utf8'));
  while (artifact.schemaVersion !== engine.EVIDENCE_ARTIFACT_SCHEMA_VERSION) {
    const migrate = MIGRATIONS.get(artifact.schemaVersion);
    assert.ok(migrate, `${capture}: no migration from evidence schema ${artifact.schemaVersion}`);
    migrate(artifact, contract);
    artifact.schemaVersion += 1;
  }
  return Buffer.from(engine.serializeArtifact(artifact, 'EvidenceArtifact'), 'utf8');
}

module.exports = { currentEvidence };
