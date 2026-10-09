'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');

const ROOT = path.join(__dirname, '..', 'results', 'test-generation-healing');
let files;

function load() {
  if (files) return files;
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'index.json'), 'utf8'));
  const archive = fs.readFileSync(path.join(ROOT, 'evidence.json.gz'));
  assert.equal(createHash('sha256').update(archive).digest('hex'), index.sha256, 'generation evidence archive digest');
  const payload = JSON.parse(gunzipSync(archive));
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.encoding, 'base64');
  assert.equal(Object.keys(payload.files).length, index.fileCount);
  files = payload.files;
  return files;
}

function readEvidence(relative) {
  const stored = load()[relative];
  assert.equal(typeof stored, 'string', `missing generation evidence: ${relative}`);
  return Buffer.from(stored, 'base64');
}

function extract(destination) {
  const root = path.resolve(destination);
  assert.ok(!fs.existsSync(root), 'extraction destination must be new');
  const entries = Object.keys(load()).map((relative) => {
    assert.ok(!relative.includes('\\') && !relative.includes('\0'), 'unsafe evidence path');
    const target = path.resolve(root, relative);
    const resolved = path.relative(root, target);
    assert.ok(
      resolved !== '' && resolved !== '..' && !resolved.startsWith(`..${path.sep}`) && !path.isAbsolute(resolved),
      'evidence path escapes extraction directory',
    );
    return { relative, target };
  });
  for (const { relative, target } of entries) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, readEvidence(relative), { flag: 'wx' });
  }
  return entries.length;
}

module.exports = { readEvidence, extract };

if (require.main === module) {
  try {
    assert.ok(
      process.argv.length === 4 && process.argv[2] === '--extract',
      'Usage: node test/lib/generation-evidence.js --extract <new-directory>',
    );
    console.log(`Extracted ${extract(process.argv[3])} immutable evidence files.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
