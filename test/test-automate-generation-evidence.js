/** Replay the captured live-generated suite without invoking a model. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { scoreGeneratedProject } = require('./eval-automate-generation');
const CAPTURES = path.join(__dirname, 'results/automate-codex-2026-10-09');
const digest = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function main() {
  for (const phase of ['before', 'after', 'red', 'final']) {
    const capture = path.join(CAPTURES, phase);
    const provenance = JSON.parse(fs.readFileSync(path.join(capture, 'provenance.json'), 'utf8'));
    assert.equal(provenance.schemaVersion, 1);
    assert.equal(provenance.model, 'gpt-5.6-sol');
    for (const [file, expected] of Object.entries(provenance.artifacts))
      assert.equal(digest(path.join(capture, file)), expected, `${phase} preserves ${file}`);
    const sessions = JSON.parse(fs.readFileSync(path.join(capture, 'tool-session-index.json'), 'utf8'));
    assert.ok(sessions.sessions.length > 0, `${phase} retains tool evidence`);
    for (const session of sessions.sessions) {
      assert.equal(digest(path.join(capture, session.file)), session.sha256);
      assert.ok(session.records > 0);
    }
  }
  const red = JSON.parse(fs.readFileSync(path.join(CAPTURES, 'red/stdout.txt'), 'utf8'));
  assert.equal(red.executionStatus, 'verified red');
  assert.equal(red.counts.final.failed, 5);
  assert.equal(red.counts.final.intendedFailures, 5);
  assert.equal(red.counts.final.skipped, 0);
  const scaffold = fs.readFileSync(path.join(CAPTURES, 'red/generated/tests/api/locker-reservations.spec.ts'), 'utf8');
  assert.match(scaffold, /test\.skip/);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-generated-evidence-'));
  try {
    const project = path.join(scratch, 'project');
    fs.cpSync(path.join(__dirname, 'fixtures/automate-eval/voucher-service'), project, { recursive: true });
    fs.cpSync(path.join(CAPTURES, 'final/generated/tests'), path.join(project, 'tests'), { recursive: true });
    const score = await scoreGeneratedProject(project, path.join(scratch, 'execution'));
    assert.equal(score.pass, true, 'captured generation must pass the real HTTP fixture and detect its inclusive-boundary regression');
    assert.equal(score.generationWasInvoked, false, 'replay must disclose that it executes a previously generated suite');
    assert.ok(score.runs.fixed.tests.length >= 7);
    assert.equal(score.protectedSourcePreserved, true);
    const blocked = path.join(scratch, 'timeout');
    await assert.rejects(() => scoreGeneratedProject(project, blocked, { timeoutMs: 1 }), /timed out/);
    for (const stream of ['stdout', 'stderr']) assert.ok(fs.existsSync(path.join(blocked, `fixed-${stream}.txt`)));
    const failure = JSON.parse(fs.readFileSync(path.join(blocked, 'fixed-execution.json'), 'utf8'));
    assert.equal(failure.exitCode, null);
    assert.match(failure.error, /timed out/);
    const retained = fs.readFileSync(path.join(blocked, 'fixed-execution.json'));
    await assert.rejects(() => scoreGeneratedProject(project, blocked), /fresh and empty/);
    assert.deepEqual(fs.readFileSync(path.join(blocked, 'fixed-execution.json')), retained);
    console.log(`Immutable live captures verified; ${score.runs.fixed.tests.length} generated HTTP tests pass and detect the regression.`);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
