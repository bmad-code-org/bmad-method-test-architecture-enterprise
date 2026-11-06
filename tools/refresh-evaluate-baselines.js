/**
 * Remeasure the positive CI baselines with the installed engine, retaining their
 * original target observations. No target or model runs. The source Git commit
 * and original record digests remain in evaluate-baseline-refresh.json.
 *
 * Usage: node tools/refresh-evaluate-baselines.js --source <commit>
 *
 * Every candidate must score zero with identical per-probe evidence and strength
 * decisions before any baseline is replaced through compare --accept. Negative
 * controls are outside this explicit admission-baseline list.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { baselineDigestFindings } = require('../cli/lib/evaluate/baseline-digests');
const { baselineTreeFindings, runCompareCommand } = require('../cli/lib/evaluate/compare');
const { runScoreCommand } = require('../cli/lib/evaluate/score');
const { EVALUATIONS } = require('../test/lib/evaluate-pr-tier');

const ROOT = path.resolve(__dirname, '..');
const FOLDERS = [
  ...EVALUATIONS.map((entry) => entry.folder),
  'test/fixtures/evaluate-ci-repos/nightly-deploy/evals/answer-grade',
  'test/fixtures/evaluate-ci-repos/tagged-release/evals/answer-grade',
  'test/fixtures/evaluate/mutation/evals/verdict-ci',
].sort();
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const git = (...args) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 });

async function main() {
  assert.equal(process.argv.length, 4, 'Usage: node tools/refresh-evaluate-baselines.js --source <commit>');
  assert.equal(process.argv[2], '--source');
  const sourceCommit = git('rev-parse', '--verify', `${process.argv[3]}^{commit}`).toString().trim();
  const engine = await import('eval-quality');
  const version = engine.VERSION;
  assert.equal(typeof version, 'string');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-baseline-refresh-'));
  const candidates = [];
  for (const relative of FOLDERS) {
    const folder = path.join(ROOT, relative);
    const baseline = path.join(folder, 'baseline');
    assert.deepEqual(baselineTreeFindings(folder), [], relative);
    assert.deepEqual(baselineDigestFindings({ folder, digestBytes: engine.digestBytes }), [], relative);
    const sourceManifestBytes = git('show', `${sourceCommit}:${relative}/baseline/baseline.json`);
    assert.deepEqual(fs.readFileSync(path.join(baseline, 'baseline.json')), sourceManifestBytes, `${relative}: source changed`);
    const manifest = JSON.parse(sourceManifestBytes);
    const originalRunBytes = fs.readFileSync(path.join(baseline, 'run.json'));
    const originalRun = JSON.parse(originalRunBytes);
    assert.equal(originalRun.completed, true);
    assert.equal(originalRun.dirty, false);
    assert.equal(originalRun.evalQualityVersion, manifest.evalQualityVersion);
    assert.equal(originalRun.invocationId, manifest.acceptedRun);
    assert.notEqual(manifest.evalQualityVersion, version, `${relative}: already measured on installed engine`);
    const oldScores = path.join(baseline, 'scores', manifest.scoreInvocationId);
    const originalScore = read(path.join(oldScores, 'score.json'));
    assert.equal(originalScore.exitCode, 0);
    assert.equal(originalScore.strengthAggregate.status, 'copied');
    const originalAggregate = read(path.join(oldScores, 'strength-aggregate.json'));
    const evaluation = read(path.join(folder, 'evaluation.json'));
    for (const [className, decision] of Object.entries(originalAggregate.floorDecisions))
      assert.equal(evaluation.strengthFloor[className] ?? null, decision.floor, `${relative}: floors changed`);

    const stagedFolder = path.join(scratch, String(candidates.length), 'evaluation');
    fs.cpSync(folder, stagedFolder, {
      recursive: true,
      filter: (file) => !['baseline', 'runs', 'node_modules', '.git'].includes(path.relative(folder, file).split(path.sep)[0]),
    });
    const runDirectory = path.join(stagedFolder, 'runs', manifest.acceptedRun);
    fs.cpSync(baseline, runDirectory, { recursive: true, filter: (file) => file !== path.join(baseline, 'baseline.json') });
    // This generated record identifies the scoring engine of the remeasurement.
    // All execution facts and sealed input digests retain their source values.
    write(path.join(runDirectory, 'run.json'), { ...originalRun, evalQualityVersion: version });
    const designations = new Map();
    for (const row of originalScore.scores) {
      const call = read(path.join(oldScores, row.probeId, 'score.json'));
      const at = call.argv.indexOf('--designated-oracle');
      if (at !== -1) designations.set(row.probeId, call.argv[at + 1]);
    }
    console.log(`remeasuring ${relative}: ${manifest.evalQualityVersion} -> ${version}`);
    const scored = await runScoreCommand(stagedFolder, { run: manifest.acceptedRun, designations });
    assert.equal(scored.exitCode, 0, `${relative}: ${scored.message}`);
    const scoreId = fs.readdirSync(path.join(runDirectory, 'scores')).filter((id) => id !== manifest.scoreInvocationId);
    assert.equal(scoreId.length, 1);
    const newScores = path.join(runDirectory, 'scores', scoreId[0]);
    const measured = read(path.join(newScores, 'score.json'));
    assert.equal(measured.strengthAggregate.status, 'copied');
    assert.deepEqual(
      measured.scores.map(({ probeId, exitCode }) => ({ probeId, exitCode })),
      originalScore.scores.map(({ probeId, exitCode }) => ({ probeId, exitCode })),
      `${relative}: probe scores moved`,
    );
    for (const row of originalScore.scores)
      assert.deepEqual(
        read(path.join(newScores, row.probeId, 'evidence-artifact.json')),
        read(path.join(oldScores, row.probeId, 'evidence-artifact.json')),
        `${relative}/${row.probeId}: evidence moved`,
      );
    const aggregate = read(path.join(newScores, 'strength-aggregate.json'));
    assert.equal(aggregate.engineVersion, version);
    assert.deepEqual(
      { ...aggregate, engineVersion: originalAggregate.engineVersion },
      originalAggregate,
      `${relative}: strength aggregate moved beyond engine identity`,
    );
    for (const [name, digest] of Object.entries(manifest.files)) {
      if (name === 'run.json' || name.startsWith('scores/')) continue;
      assert.equal(engine.digestBytes(fs.readFileSync(path.join(runDirectory, name))), digest, `${relative}/${name}: input moved`);
    }
    candidates.push({
      folder,
      stagedFolder,
      manifest,
      runDirectory,
      receipt: {
        evaluation: relative,
        sourceCommit,
        sourceManifestDigest: engine.digestBytes(sourceManifestBytes),
        originalRunDigest: engine.digestBytes(originalRunBytes),
        originalExecutionCommit: originalRun.commit,
        acceptedRun: manifest.acceptedRun,
        originalScoringEngine: manifest.evalQualityVersion,
        scoringEngine: version,
        originalScoreInvocation: manifest.scoreInvocationId,
        scoreInvocation: scoreId[0],
        scoreExit: scored.exitCode,
        evidenceUnchanged: true,
        strengthUnchangedExceptEngineIdentity: true,
        executionAndInputMetadataUnchangedExceptScoringEngine: true,
      },
    });
  }
  // Validate the whole batch before publishing any candidate. The owning accept
  // command alone builds and seals each replacement baseline.
  for (const candidate of candidates) {
    const { stagedFolder, manifest, receipt } = candidate;
    const accepted = await runCompareCommand(stagedFolder, { run: manifest.acceptedRun, accept: true });
    assert.equal(accepted.exitCode, 0, `${receipt.evaluation}: ${accepted.message}`);
    const acceptedBaseline = path.join(stagedFolder, 'baseline');
    assert.deepEqual(baselineDigestFindings({ folder: stagedFolder, digestBytes: engine.digestBytes }), []);
    receipt.acceptedManifestDigest = engine.digestBytes(fs.readFileSync(path.join(acceptedBaseline, 'baseline.json')));
    const pending = path.join(candidate.folder, 'runs', `engine-refresh-pending-${process.pid}`);
    fs.mkdirSync(path.dirname(pending), { recursive: true });
    fs.cpSync(acceptedBaseline, pending, { recursive: true, errorOnExist: true, force: false });
    assert.deepEqual(fs.readFileSync(path.join(pending, 'baseline.json')), fs.readFileSync(path.join(acceptedBaseline, 'baseline.json')));
    const stagedManifest = read(path.join(pending, 'baseline.json'));
    for (const [name, digest] of Object.entries(stagedManifest.files))
      assert.equal(engine.digestBytes(fs.readFileSync(path.join(pending, name))), digest);
    candidate.pending = pending;
  }
  const receiptFile = path.join(ROOT, 'test', 'evaluate-baseline-refresh.json');
  const oldReceipt = fs.existsSync(receiptFile) ? fs.readFileSync(receiptFile) : null;
  const receipt = {
    command: `node tools/refresh-evaluate-baselines.js --source ${sourceCommit}`,
    kind: 'recorded-evidence-remeasurement',
    targetExecution: 'original sealed observations; no new target or model calls',
    baselines: candidates.map(({ receipt }) => receipt),
  };
  const swapped = [];
  try {
    for (const candidate of candidates) {
      const target = path.join(candidate.folder, 'baseline');
      const retired = path.join(candidate.folder, 'runs', `engine-refresh-${process.pid}`);
      fs.renameSync(target, retired);
      try {
        fs.renameSync(candidate.pending, target);
      } catch (error) {
        fs.renameSync(retired, target);
        throw error;
      }
      swapped.push({ target, retired, pending: candidate.pending });
      assert.deepEqual(baselineDigestFindings({ folder: candidate.folder, digestBytes: engine.digestBytes }), []);
    }
    write(`${receiptFile}.pending`, receipt);
    fs.renameSync(`${receiptFile}.pending`, receiptFile);
  } catch (error) {
    for (const { target, retired, pending } of swapped.toReversed()) {
      fs.renameSync(target, pending);
      fs.renameSync(retired, target);
    }
    if (oldReceipt !== null) fs.writeFileSync(receiptFile, oldReceipt);
    throw error;
  }
  for (const candidate of candidates) console.log(`accepted ${candidate.receipt.evaluation}: score 0; evidence and strength unchanged`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
