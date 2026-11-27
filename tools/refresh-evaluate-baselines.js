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
 *
 * The run leaves nothing behind, whether it succeeds or fails: it stages each
 * evaluation in a temporary folder and holds the pending and retired baselines
 * and the new receipt in `.baseline-refresh/` at the repository root, on the
 * baselines' own file system so each swap is a rename, and outside every
 * evaluation folder so no suite that reads an evaluation's `runs/` meets them.
 * That folder is also the refresh's lock: a second refresh of the same checkout
 * refuses to start while it exists.
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

/** A failed rollback: the baselines it could not restore are still in the holding folder, which is kept for them. */
class HoldingKept extends Error {}

/** The receipt a refresh stages in its holding folder; it is moved onto the live receipt only once every baseline is published. */
const STAGED_RECEIPT = 'receipt.json';

/** The marker a refresh writes in its holding folder once its receipt is in place: the positive evidence that it published. */
const PUBLISHED = 'published';

/**
 * The holding folder's slot for `folder`: its path from the repository root, encoded as one name, so a retired baseline says
 * which evaluation it came from by its name alone, whatever the inventory holds by the time anyone reads it.
 */
function slotOf(holding, folder) {
  const relative = path.relative(path.dirname(holding), folder);
  assert.ok(relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative), `${folder} is outside ${path.dirname(holding)}`);
  return path.join(holding, encodeURIComponent(relative.split(path.sep).join('/')));
}

/** `file`'s own entry, never what a link names; `null` only when there is none, and any other failure is thrown. */
function entryOf(file) {
  try {
    return fs.lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * What a holding folder holds, read from entries alone (no link followed, no file read), so a folder left in an untrusted
 * checkout cannot steer what the refresh opens: whether its refresh marked itself published, whether the staged receipt is
 * still there, and each retired baseline with the evaluation its slot names, when that is one of `folders`. `null` when the
 * folder is not a plain directory of this account's, or holds anything a refresh does not make there.
 */
function holdingState(holding, folders) {
  const folder = entryOf(holding);
  if (folder === null || !folder.isDirectory() || (process.getuid && folder.uid !== process.getuid())) return null;
  const root = path.dirname(holding);
  const state = { published: false, staged: false, retired: [] };
  for (const name of fs.readdirSync(holding)) {
    const entry = entryOf(path.join(holding, name));
    if ((name === PUBLISHED || name === STAGED_RECEIPT) && entry?.isFile()) {
      state[name === PUBLISHED ? 'published' : 'staged'] = true;
      continue;
    }
    if (!entry?.isDirectory()) return null;
    let evaluation;
    try {
      evaluation = path.join(root, ...decodeURIComponent(name).split('/'));
    } catch {
      return null;
    }
    if (!folders.includes(evaluation) || slotOf(holding, evaluation) !== path.join(holding, name)) return null;
    for (const inner of fs.readdirSync(path.join(holding, name))) {
      if (!['pending', 'retired'].includes(inner) || !entryOf(path.join(holding, name, inner))?.isDirectory()) return null;
    }
    if (entryOf(path.join(holding, name, 'retired')) !== null) {
      state.retired.push({ at: path.join(holding, name, 'retired'), evaluation });
    }
  }
  return state;
}

/**
 * Whether the holding folder can go: when its refresh marked itself published, or when it holds no retired baseline. Anything
 * else, an inspection that fails included, may be the only copy of a baseline, so the folder stays.
 */
function removable(holding, folders) {
  try {
    const state = holdingState(holding, folders);
    return state !== null && (state.published || state.retired.length === 0);
  } catch {
    return false;
  }
}

/**
 * What a holding folder left by an earlier refresh still holds, and what to do with it. `folders` is the refresh's inventory,
 * the only destinations a retired baseline may name. While the staged receipt is there and no published marker, the refresh
 * never finished publishing, so the live receipt still describes the retired baselines and they go back; with the marker they
 * are the replaced ones. It never throws: what it cannot inspect or tell, it leaves to a person.
 */
function recoveryNote(holding, folders) {
  try {
    const state = holdingState(holding, folders);
    if (state === null) return `it holds entries no refresh makes, so inspect ${holding} by hand before you remove it`;
    if (state.published) {
      return `its refresh published every baseline and the receipt, so the ${state.retired.length} retired baseline(s) in it are the replaced ones; if no refresh is running, remove ${holding}`;
    }
    if (state.retired.length === 0) return `it holds no retired baseline; if no refresh is running, remove ${holding}`;
    const named = state.retired.map(
      ({ at, evaluation }) => `${at} is the baseline ${path.join(evaluation, 'baseline')} held before the refresh`,
    );
    if (!state.staged) {
      return `it cannot tell whether its refresh published, so inspect ${holding} by hand: ${named.join('; ')}`;
    }
    return `its refresh never finished publishing, so the live receipt still describes the baselines it retired: ${named.join('; ')}. If no refresh is running, move each back in place of the one there, keep the live receipt, then remove ${holding}`;
  } catch (error) {
    return `it could not be inspected (${error.message}), so inspect ${holding} by hand before you remove it`;
  }
}

/**
 * Runs `work` with a scratch folder for the staged evaluations and the holding folder `<root>/.baseline-refresh` for the
 * pending and retired baselines and the new receipt, and removes both whether `work` succeeds, fails or is interrupted by
 * SIGINT or SIGTERM, except a holding folder that may still hold the only copy of a baseline (`removable`, `HoldingKept`). The holding
 * folder is made before anything is read and refused when it exists, so it is the lock that keeps two refreshes of one
 * checkout apart; `folders`, the refresh's inventory, names what a refused one holds. The swap is synchronous, so a signal is
 * handled before it starts or after it ends, never midway.
 */
async function withWorkspace(root, work, { folders = [] } = {}) {
  let kept = false;
  const holding = path.join(root, '.baseline-refresh');
  try {
    fs.mkdirSync(holding, { mode: 0o700 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw new Error(`another refresh holds ${holding}, or an earlier one left it: ${recoveryNote(holding, folders)}`);
  }
  let scratch = null;
  // Each folder is removed on its own, and a removal that fails is reported beside the work's own outcome, never in its place.
  const clean = () => {
    for (const folder of [scratch, kept || !removable(holding, folders) ? null : holding]) {
      if (folder === null) continue;
      try {
        fs.rmSync(folder, { recursive: true, force: true });
      } catch (error) {
        console.error(`refresh-evaluate-baselines: could not remove ${folder}: ${error.message}`);
        process.exitCode = 1;
      }
    }
  };
  const interrupted = (signal) => {
    clean();
    // The default action then ends the process as the signal would have, with its exit status.
    process.removeListener('SIGINT', interrupted);
    process.removeListener('SIGTERM', interrupted);
    process.kill(process.pid, signal);
  };
  process.once('SIGINT', interrupted);
  process.once('SIGTERM', interrupted);
  try {
    // Only this account may write what the refresh stages; the mode is set again, since the umask applies to `mkdir`.
    fs.chmodSync(holding, 0o700);
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-baseline-refresh-'));
    return await work({ scratch, holding });
  } catch (error) {
    kept = error instanceof HoldingKept;
    throw error;
  } finally {
    process.removeListener('SIGINT', interrupted);
    process.removeListener('SIGTERM', interrupted);
    clean();
  }
}

/**
 * Swaps each candidate's pending baseline (`candidate.pending`, in `holding`) into `<candidate.folder>/baseline`, retiring the
 * old one into `holding`, checks each swapped folder with `verify`, and then moves `receipt`, staged in `holding`, onto
 * `receiptFile` as the last step. Any failure restores every baseline it can before it is thrown and leaves `receiptFile` as
 * it was; a baseline it cannot restore makes the error a `HoldingKept`.
 */
function publishBaselines({ candidates, holding, receiptFile, receipt, verify }) {
  const stagedReceipt = path.join(holding, STAGED_RECEIPT);
  const receiptBytes = `${JSON.stringify(receipt, null, 2)}\n`;
  fs.writeFileSync(stagedReceipt, receiptBytes, { flag: 'wx', mode: 0o600 });
  const retiredOnes = [];
  try {
    for (const candidate of candidates) {
      const target = path.join(candidate.folder, 'baseline');
      const retired = path.join(slotOf(holding, candidate.folder), 'retired');
      fs.mkdirSync(path.dirname(retired), { recursive: true });
      fs.renameSync(target, retired);
      retiredOnes.push({ target, retired, pending: candidate.pending });
      fs.renameSync(candidate.pending, target);
      verify(candidate.folder);
    }
    assert.equal(fs.readFileSync(stagedReceipt, 'utf8'), receiptBytes, `${stagedReceipt} changed after the refresh staged it`);
    fs.renameSync(stagedReceipt, receiptFile);
    fs.writeFileSync(path.join(holding, PUBLISHED), '', { flag: 'wx', mode: 0o600 });
  } catch (error) {
    const stuck = [];
    for (const { target, retired, pending } of retiredOnes.toReversed()) {
      try {
        if (fs.existsSync(target)) fs.renameSync(target, pending);
        fs.renameSync(retired, target);
      } catch (restoreError) {
        stuck.push(restoreError.message);
      }
    }
    if (stuck.length > 0) {
      throw new HoldingKept(
        `the refresh failed (${error.message}) and its rollback failed too (${stuck.join('; ')}); the baselines it could not restore remain in ${holding}: ${recoveryNote(
          holding,
          candidates.map(({ folder }) => folder),
        )}`,
        { cause: error },
      );
    }
    throw error;
  }
}

async function main() {
  assert.equal(process.argv.length, 4, 'Usage: node tools/refresh-evaluate-baselines.js --source <commit>');
  assert.equal(process.argv[2], '--source');
  const sourceCommit = git('rev-parse', '--verify', `${process.argv[3]}^{commit}`).toString().trim();
  const engine = await import('eval-quality');
  const version = engine.VERSION;
  assert.equal(typeof version, 'string');
  const folders = FOLDERS.map((relative) => path.join(ROOT, relative));
  await withWorkspace(ROOT, ({ scratch, holding }) => refresh({ sourceCommit, engine, version, scratch, holding }), { folders });
}

async function refresh({ sourceCommit, engine, version, scratch, holding }) {
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
    const pending = path.join(slotOf(holding, candidate.folder), 'pending');
    fs.mkdirSync(path.dirname(pending), { recursive: true });
    fs.cpSync(acceptedBaseline, pending, { recursive: true, errorOnExist: true, force: false });
    assert.deepEqual(fs.readFileSync(path.join(pending, 'baseline.json')), fs.readFileSync(path.join(acceptedBaseline, 'baseline.json')));
    const stagedManifest = read(path.join(pending, 'baseline.json'));
    for (const [name, digest] of Object.entries(stagedManifest.files))
      assert.equal(engine.digestBytes(fs.readFileSync(path.join(pending, name))), digest);
    candidate.pending = pending;
  }
  const receipt = {
    command: `node tools/refresh-evaluate-baselines.js --source ${sourceCommit}`,
    kind: 'recorded-evidence-remeasurement',
    targetExecution: 'original sealed observations; no new target or model calls',
    baselines: candidates.map(({ receipt }) => receipt),
  };
  publishBaselines({
    candidates,
    holding,
    receiptFile: path.join(ROOT, 'test', 'evaluate-baseline-refresh.json'),
    receipt,
    verify: (folder) => assert.deepEqual(baselineDigestFindings({ folder, digestBytes: engine.digestBytes }), []),
  });
  for (const candidate of candidates) console.log(`accepted ${candidate.receipt.evaluation}: score 0; evidence and strength unchanged`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { HoldingKept, publishBaselines, slotOf, withWorkspace };
