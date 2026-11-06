'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { engineVersion } = require('../../cli/lib/evaluate/engine');

const ROOT = path.resolve(__dirname, '../..');
const MANIFEST = path.join(ROOT, 'test/fixtures/evaluate-engine-seals/manifest.json');
const digest = (file) => `sha256:${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;

/** Current-engine expectation bound to the unchanged historical capture and contract. */
function refreshedSeal(original) {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  assert.equal(manifest.engineVersion, engineVersion(), 're-record current-engine seals with tools/refresh-evaluate-seals.js');
  const relative = path.relative(ROOT, original).split(path.sep).join('/');
  const entry = manifest.files[relative];
  assert.ok(entry, `${relative}: no current-engine seal expectation`);
  assert.equal(digest(original), entry.sourceDigest, `${relative}: historical seal changed`);
  assert.equal(digest(path.join(ROOT, entry.contract)), entry.contractDigest, `${relative}: historical contract changed`);
  const expected = path.join(ROOT, entry.generated);
  assert.equal(digest(expected), entry.generatedDigest, `${relative}: generated expectation changed`);
  return expected;
}

module.exports = { refreshedSeal };
