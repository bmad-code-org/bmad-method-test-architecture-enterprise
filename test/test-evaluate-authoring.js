/** Deterministic replay of the two live Evaluate authoring proofs (Story 1.24). */
'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ENGINE = path.join(ROOT, 'node_modules/.bin/eval-quality');
const EVALUATE = path.join(ROOT, 'cli/evaluate.js');
const FIXTURES = path.join(__dirname, 'fixtures/evaluate-authoring');
const SECTIONS = ['representative', 'negative', 'malformed', 'gameability', 'held-out'];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function filesUnder(root) {
  const visit = (folder) =>
    fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) return visit(file);
      assert.ok(entry.isFile(), `${file} must be a regular file`);
      return [path.relative(root, file).split(path.sep).join('/')];
    });
  return visit(root).sort();
}

function checkFrozenInputs(fixture) {
  const lines = fs.readFileSync(path.join(fixture, 'authoring-inputs.sha256'), 'utf8').trim().split('\n');
  const listed = lines.map((line) => {
    const match = /^([a-f0-9]{64}) {2}(target\/.+)$/.exec(line);
    assert.ok(match, `invalid authoring input digest: ${line}`);
    assert.equal(sha256(path.join(fixture, match[2])), match[1], `${match[2]} changed after authoring`);
    return match[2];
  });
  assert.deepEqual(
    listed.sort(),
    filesUnder(path.join(fixture, 'target')).map((file) => `target/${file}`),
  );
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
  assert.equal(result.error, undefined, `${command} could not start: ${result.error}`);
  assert.equal(result.status, 0, `${command} ${args.join(' ')} exited ${result.status}\n${result.stdout}\n${result.stderr}`);
}

function sameBytes(actual, expected, label) {
  assert.ok(fs.readFileSync(actual).equals(fs.readFileSync(expected)), `${label} differs from committed evidence`);
}

function runReplay(folder, runName, out, expectedProbeIds) {
  const replay = path.join(folder, 'replay', runName);
  const runRecord = readJson(path.join(replay, 'run.json'));
  const verdict = path.join(out, `${runName}-preflight.json`);
  run(ENGINE, [
    'preflight',
    '--contract',
    path.join(replay, 'contract.json'),
    '--probes',
    path.join(replay, 'probes.json'),
    '--observations',
    path.join(replay, 'observations.json'),
    '--run-id',
    runRecord.invocationId,
    '--out',
    verdict,
  ]);
  sameBytes(verdict, path.join(replay, 'preflight-verdict.json'), `${runName} preflight`);

  const index = readJson(path.join(replay, 'trial-sets.json'));
  const scores = path.join(replay, 'scores');
  const scoreId = fs.readdirSync(scores).sort().at(-1);
  assert.ok(scoreId, `${runName} has no committed score`);
  assert.equal(index.trialSets.length > 0, true, `${runName} has no sealed trial sets`);
  assert.deepEqual(
    index.trialSets.map((set) => set.probeId).sort(),
    expectedProbeIds,
    `${runName} trial sets differ from the authored ${runName} probe inventory`,
  );
  for (const set of index.trialSets) {
    assert.equal(set.records.length, readJson(path.join(folder, 'policy/scoring-policy.json')).minimumTrialCount);
    const artifact = path.join(out, `${runName}-${set.probeId}-evidence.json`);
    const args = ['score'];
    for (const record of set.records) args.push('--record', path.join(replay, record));
    args.push(
      '--contract',
      path.join(replay, index.contract),
      '--probe',
      path.join(replay, set.probe),
      '--preflight-verdict',
      path.join(replay, index.preflightVerdict),
      '--policy',
      path.join(replay, index.policy),
      '--corpus-digest',
      index.corpusDigest,
      '--isolation-manifest',
      path.join(replay, set.isolationManifest),
      '--evaluator-configuration',
      path.join(replay, index.evaluatorConfiguration),
      '--out',
      artifact,
    );
    run(ENGINE, args);
    sameBytes(artifact, path.join(scores, scoreId, set.probeId, 'evidence-artifact.json'), `${runName} ${set.probeId} score`);
    const evidence = readJson(artifact);
    const probe = readJson(path.join(folder, set.probe.replace(/^probes\//, 'probes/')));
    assert.equal(evidence.contractVerdict, 'PASS', `${runName} ${set.probeId} verdict`);
    assert.equal(evidence.exitCode, 0, `${runName} ${set.probeId} exit`);
    assert.ok(
      evidence.coverageGaps.every((gap) => gap.satisfied),
      `${runName} ${set.probeId} has an uncovered rule`,
    );
    assert.ok(evidence.reducedProbeOutcomes.some((outcome) => outcome.probeId === set.probeId));
    const outcome = evidence.reducedProbeOutcomes.find((entry) => entry.probeId === set.probeId);
    const expected = probe.expectedClean ? 'passed-clean-control' : 'caught';
    assert.deepEqual(
      outcome.trialVotes.map((vote) => vote.state),
      Array.from({ length: set.records.length }, () => expected),
      `${runName} ${set.probeId} votes`,
    );
    const classRate = evidence.strength.vector[probe.probeClass];
    if (!probe.expectedClean) assert.equal(classRate?.rate, 1, `${runName} ${set.probeId} class rate`);
  }
}

function checkSuite(kind, out) {
  const fixture = path.join(FIXTURES, kind);
  const folder = path.join(fixture, 'evaluation');
  for (const file of [
    'target/DESCRIPTION.md',
    'target/intake-answers.md',
    'inspection-record.md',
    'requirements-statement.md',
    'session-transcript.md',
  ]) {
    assert.ok(fs.statSync(path.join(fixture, file)).isFile(), `${kind} lacks ${file}`);
  }
  checkFrozenInputs(fixture);
  const manifest = readJson(path.join(folder, 'replay/manifest.json'));
  assert.deepEqual([...manifest.runs].sort(), ['development', 'held-out']);
  assert.deepEqual(
    Object.keys(manifest.hashes).sort(),
    filesUnder(path.join(folder, 'replay'))
      .filter((file) => file !== 'manifest.json')
      .map((file) => `replay/${file}`),
    `${kind} replay manifest omits or invents a file`,
  );
  for (const [relative, digest] of Object.entries(manifest.hashes)) {
    assert.equal(sha256(path.join(folder, relative)), digest, `${kind} ${relative} changed`);
  }
  const evaluation = readJson(path.join(folder, 'evaluation.json'));
  assert.equal(evaluation.targetKind, kind === 'ai-feature' ? 'ai-feature' : 'test-review-mechanism');
  assert.equal(evaluation.interface, kind === 'ai-feature' ? 'api' : 'cli');
  assert.ok(evaluation.heldOutProbes.length > 0, `${kind} has no held-out probe`);
  const probes = fs.readdirSync(path.join(folder, 'probes')).filter((name) => name.endsWith('.probe.json'));
  const authoredProbeIds = probes.map((name) => readJson(path.join(folder, 'probes', name)).probeId).sort();
  const heldOut = [...evaluation.heldOutProbes].sort();
  assert.ok(
    heldOut.every((id) => authoredProbeIds.includes(id)),
    `${kind} names a missing held-out probe`,
  );
  const sections = new Set(probes.map((name) => /^\[([^\]]+)\]/.exec(readJson(path.join(folder, 'probes', name)).rationale)?.[1]));
  for (const section of SECTIONS) assert.ok(sections.has(section), `${kind} lacks ${section} corpus coverage`);
  assert.ok(fs.readdirSync(path.join(folder, 'mutations')).some((name) => name.endsWith('.mutation.json')));
  assert.ok(fs.existsSync(path.join(folder, 'evaluator/selection.md')), `${kind} lacks an evaluator selection reason`);

  run(process.execPath, [EVALUATE, 'check', '--evaluation', folder]);
  const compiled = path.join(out, `${kind}-compiled.json`);
  const sealed = path.join(out, `${kind}-sealed.json`);
  run(ENGINE, ['compile', '--in', path.join(folder, 'contract.json'), '--out', compiled]);
  run(ENGINE, ['seal', '--in', path.join(folder, 'contract.json'), '--out', sealed]);
  for (const runName of manifest.runs) {
    const replay = path.join(folder, 'replay', runName);
    sameBytes(path.join(folder, 'contract.json'), path.join(replay, 'contract.json'), `${kind} ${runName} contract`);
    sameBytes(compiled, path.join(replay, 'eval-contract.json'), `${kind} ${runName} compile`);
    sameBytes(sealed, path.join(replay, 'sealed-evaluator-brief.json'), `${kind} ${runName} seal`);
    const expectedProbeIds = runName === 'held-out' ? heldOut : authoredProbeIds.filter((id) => !heldOut.includes(id));
    runReplay(folder, runName, out, expectedProbeIds);
  }
  if (kind === 'ai-feature') {
    const notes = fs.readFileSync(path.join(fixture, 'completion-notes.md'), 'utf8');
    const transcript = fs.readFileSync(path.join(fixture, 'session-transcript.md'), 'utf8');
    assert.match(notes, /vendor model/i);
    assert.match(notes, /adopter/i);
    assert.match(transcript, /vendor model/i);
    assert.match(transcript, /adopter/i);
    for (const name of fs.readdirSync(path.join(folder, 'mutations'))) {
      if (!name.endsWith('.mutation.json')) continue;
      const mutation = readJson(path.join(folder, 'mutations', name));
      assert.doesNotMatch(JSON.stringify(mutation).toLowerCase(), /vendor|model/);
    }
  }
}

function main() {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-evaluate-authoring-'));
  try {
    for (const kind of ['ai-feature', 'test-review']) checkSuite(kind, out);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
  console.log('ok both Evaluate authoring suites replayed byte for byte');
}

main();
