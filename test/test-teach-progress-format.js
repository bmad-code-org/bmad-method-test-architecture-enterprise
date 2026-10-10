/** Reproduce the saved-progress YAML failure using the skill's actual initialization example. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const skill = path.join(__dirname, '..', 'skills', 'bmad-teach-me-testing');
const init = fs.readFileSync(path.join(skill, 'steps-c', 'step-01-init.md'), 'utf8');
const blocks = [...init.matchAll(/```yaml\n([\s\S]*?)\n```/g)];
const example = blocks.find((block) => block[1].includes('# TEA Academy Progress Tracking'))?.[1];
assert.ok(example, 'initialization must supply its progress example');
assert.ok(fs.readFileSync(path.join(skill, 'steps-c', 'step-01b-continue.md'), 'utf8').includes('preserve one YAML document'));
const substituted = example.replaceAll('{ user_name }', 'test-learner').replaceAll('{ current_date }', '2026-10-09');
const progress = yaml.load(substituted);
assert.equal(progress.user, 'test-learner');
assert.equal(progress.sessions.length, 7);
assert.equal(progress.sessions_completed, 0);
progress.experience_level = 'Beginner';
assert.equal(yaml.load(yaml.dump(progress)).experience_level, 'Beginner');
assert.throws(
  () => yaml.load(`${substituted}\n---\n`),
  /single document/,
  'the historical trailing delimiter must reproduce the unreadable progress',
);
const passing = yaml.load(fs.readFileSync(path.join(skill, 'data', 'curriculum.yaml'), 'utf8')).completion.passing_score;
assert.ok((2 / 3) * 100 < passing);
assert.ok((3 / 3) * 100 >= passing);
for (const step of ['step-04-session-01.md', 'step-04-session-02.md']) {
  const text = fs.readFileSync(path.join(skill, 'steps-c', step), 'utf8');
  assert.ok(text.includes(`≥${passing}% (3 of 3 correct`));
  assert.ok(text.includes('(3 of 3 correct; 2 of 3 is 66.67%)'), `${step}: quiz passing count must agree with arithmetic`);
}
console.log('Teaching progress example parses as one YAML document; quiz passing counts match curriculum.');

const evidence = path.join(__dirname, 'results', 'teach-codex-2026-10-09');
const manifest = JSON.parse(fs.readFileSync(path.join(evidence, 'before.manifest.json'), 'utf8'));
const archive = fs.readFileSync(path.join(evidence, manifest.archive));
assert.equal(createHash('sha256').update(archive).digest('hex'), manifest.archiveSha256);
const files = JSON.parse(gunzipSync(archive).toString('utf8')).files;
assert.equal(files.length, manifest.files.length);
for (const [index, file] of files.entries()) {
  const bytes = Buffer.from(file.base64, 'base64');
  const pin = manifest.files[index];
  assert.equal(file.path, pin.path);
  assert.equal(bytes.length, pin.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), pin.sha256);
  if (file.path.endsWith('tea-eval-harness-tea-progress.yaml')) {
    assert.throws(() => yaml.load(bytes.toString('utf8')), /single document/);
  }
}
const baseline = JSON.parse(fs.readFileSync(path.join(evidence, 'before.json'), 'utf8'));
assert.equal(baseline.exitCode, 1);
assert.equal(baseline.runners[0].measurements.placementAccuracy, 0);
assert.equal(baseline.runners[0].repetitions.completed, 1);
console.log('Original Codex baseline bytes and saved-progress parser failure verified.');

const afterManifest = JSON.parse(fs.readFileSync(path.join(evidence, 'after.manifest.json'), 'utf8'));
const afterArchive = fs.readFileSync(path.join(evidence, afterManifest.archive));
assert.equal(createHash('sha256').update(afterArchive).digest('hex'), afterManifest.archiveSha256);
const afterFiles = JSON.parse(gunzipSync(afterArchive).toString('utf8')).files;
assert.equal(afterFiles.length, afterManifest.files.length);
for (const [index, file] of afterFiles.entries()) {
  const bytes = Buffer.from(file.base64, 'base64');
  const pin = afterManifest.files[index];
  assert.equal(file.path, pin.path);
  assert.equal(bytes.length, pin.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), pin.sha256);
  if (file.path.endsWith('tea-eval-harness-tea-progress.yaml')) {
    assert.equal(yaml.load(bytes.toString('utf8')).user, 'tea-eval-harness');
  }
}
const afterBytes = fs.readFileSync(path.join(evidence, afterManifest.result));
assert.equal(createHash('sha256').update(afterBytes).digest('hex'), afterManifest.resultSha256);
const after = JSON.parse(afterBytes);
assert.equal(after.exitCode, 0);
assert.equal(after.repository.commit, afterManifest.sourceCommit);
assert.equal(after.repository.dirty, false);
assert.deepEqual(after.suite.caseIds, baseline.suite.caseIds);
assert.deepEqual(after.suite.thresholds, baseline.suite.thresholds);
assert.equal(after.runners[0].version, baseline.runners[0].version);
assert.equal(after.runners[0].model, baseline.runners[0].model);
assert.equal(after.runners[0].repetitions.completed, 1);
assert.deepEqual(after.runners[0].measurements, {
  placementAccuracy: 1,
  correctionRate: 1,
  reTeachingRate: 1,
  continuationRate: 1,
  maxUnearnedMastery: 0,
});
console.log('After Codex diagnostic bytes, comparable criteria and honest source provenance verified.');
