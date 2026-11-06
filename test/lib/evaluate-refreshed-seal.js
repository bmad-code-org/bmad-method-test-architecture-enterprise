'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadEngine } = require('../../cli/lib/evaluate/engine');

const ROOT = path.resolve(__dirname, '../..');
const MANIFEST = path.join(ROOT, 'test/fixtures/evaluate-engine-seals/manifest.json');

/** Current-engine expectation bound to the unchanged historical capture and contract. */
async function refreshedSeal(original) {
  const engine = await loadEngine();
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  assert.equal(manifest.engineVersion, engine.VERSION, 're-record current-engine seals with tools/refresh-evaluate-seals.js');
  const relative = path.relative(ROOT, original).split(path.sep).join('/');
  const entry = manifest.files[relative];
  assert.ok(entry, `${relative}: no current-engine seal expectation`);
  assert.equal(engine.digestBytes(fs.readFileSync(original)), entry.sourceDigest, `${relative}: historical seal changed`);
  assert.equal(
    engine.digestBytes(fs.readFileSync(path.join(ROOT, entry.contract))),
    entry.contractDigest,
    `${relative}: historical contract changed`,
  );
  const expected = path.join(ROOT, entry.generated);
  assert.equal(engine.digestBytes(fs.readFileSync(expected)), entry.generatedDigest, `${relative}: generated expectation changed`);
  return expected;
}

module.exports = { refreshedSeal };
