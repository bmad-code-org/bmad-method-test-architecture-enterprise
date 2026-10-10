/** Load the immutable actual Codex observations and verify every retained byte. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const root = path.join(__dirname, '..', 'results', 'codex-nfr', 'public-cli-original');
const sha256Hex = (value) => crypto.createHash('sha256').update(value).digest('hex');
/** Keep original failures immutable while exposing their exact source files to controlled replay. */
function readNativeArchive() {
  const manifestBytes = fs.readFileSync(path.join(root, 'public-native.manifest.json'));
  assert.equal(sha256Hex(manifestBytes), '46b3e73e2c32d7db91b55a5cb249a599e66acc98030cee282de1a3095eadb4d2');
  const manifest = JSON.parse(manifestBytes);
  const archiveBytes = fs.readFileSync(path.join(root, manifest.archive));
  assert.equal(sha256Hex(archiveBytes), manifest.archiveSha256);
  const archive = JSON.parse(zlib.gunzipSync(archiveBytes));
  assert.equal(archive.sourceCommit, 'a8225395571b026f194aefc696ca0a18922bf919');
  assert.equal(manifest.sourceCommit, archive.sourceCommit);
  assert.equal(archive.agent, 'codex');
  assert.equal(archive.requestedModel, 'gpt-5.6-sol');
  assert.deepEqual(manifest.nativeExits, [3, 3]);
  assert.equal(manifest.stability, 'unmeasured');
  assert.equal(archive.files.length, 36);
  assert.equal(manifest.files.length, archive.files.length);
  const files = new Map();
  for (const [index, file] of archive.files.entries()) {
    const bytes = Buffer.from(file.base64, 'base64');
    assert.deepEqual(manifest.files[index], { path: file.path, bytes: bytes.length, sha256: sha256Hex(bytes) });
    assert.equal(files.has(file.path), false);
    files.set(file.path, bytes);
  }
  return { manifest, files };
}
/** Stage only the original supplied inputs and native report/context into a fresh project. */
function stageNativeCase(root, type) {
  const { files } = readNativeArchive();
  for (const [name, bytes] of files) {
    if (!name.startsWith(type + '/')) continue;
    const relative = name.slice(type.length + 1);
    let destination;
    if (/^(?:docs|config|evidence)\//.test(relative)) destination = path.join(root, relative);
    else if (/\/artifacts\/nfr\/nfr-(?:assessment-system\.md|context-system\.json)$/.test(relative))
      destination = path.join(root, 'original-native', path.basename(relative));
    else continue;
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes);
  }
}
module.exports = { readNativeArchive, stageNativeCase, sha256Hex };
