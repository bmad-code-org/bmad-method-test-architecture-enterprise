/**
 * Trial-set scoring, driven through the `eval-quality score` CLI the way a
 * caller outside this repository drives it.
 *
 * Evaluate reduces repeated trials of one probe to one vote per probe, which
 * needs `EvidenceArtifact` schema version 4: a repeatable `--record` on
 * `score`, a `trials` block that counts completed attempts, and the per-probe
 * `reducedProbeOutcomes` the dominance comparator recomputes before it
 * compares. `npm run test:probe-corpus` scores one record per probe in
 * process, so it passes on an engine without any of that. This check is the
 * one that fails there, and every failure it reports names trial-set scoring.
 *
 * The inputs are the ones `npm run test:probe-corpus` already builds for
 * test-review's P-001, a defect probe the stored replay catches, so the
 * reduction has a contributing vote to carry. The sealed brief is held to its
 * published schema; the CLI scores against the contract itself, since the
 * `score` command has no brief input. The policy is TeA's own with
 * `minimumTrialCount` raised to 3. Every input is held to its published schema
 * before the CLI sees it.
 *
 * Three scores run:
 *
 *   - three records that differ only in `trialIndex`, handed over out of
 *     order since the engine sorts them itself: a comparable CONCERNS whose
 *     reduction carries three caught votes;
 *   - the same three with trial 2 rebuilt from the same inputs so the
 *     evaluator reports no finding and holds O-001: the reduction has to carry
 *     that trial's own `missed` vote and still reduce to a catch at 2 of 3
 *     against `catchThreshold` 0.5, which a copied vote cannot produce. A
 *     missed material defect resolves the ladder to FAIL, so this score exits
 *     2 with its artifact;
 *   - one record alone, below the minimum, which has to read as
 *     non-comparable: that is what proves the minimum is enforced.
 *
 * No model call, no credential, no network. Inputs are written to a temporary
 * directory that is removed afterwards.
 *
 * Usage: node test/test-trial-set-scoring.js
 */

'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scoringPolicy, validateArtifact } = require('./lib/eval-quality-inputs');
const { corpusDigestOf, preflightSuite, scoreProbe, sealContract, storedProbePort, suites } = require('./lib/probe-scoring');

const CLI = path.join(path.dirname(require.resolve('eval-quality/package.json')), require('eval-quality/package.json').bin['eval-quality']);
const SUITE_ID = 'test-review';
const PROBE_ID = 'P-001';
const CATCHING_ORACLE = 'O-001';
const TRIAL_COUNT = 3;
const MINIMUM_SCHEMA_VERSION = 4;
/** `eval-quality`'s CLI exit for a FAIL rung. */
const EXIT_FAIL = 2;

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };

const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(`trial-set scoring: ${message}`);
}

/** One `eval-quality score` invocation over the given record files, with the artifact parsed off stdout when there is one. */
function runScoreCli(dir, recordFiles, corpusDigest) {
  const args = [CLI, 'score'];
  for (const file of recordFiles) args.push('--record', file);
  args.push(
    '--isolation-manifest',
    path.join(dir, 'manifest.json'),
    '--evaluator-configuration',
    path.join(dir, 'configuration.json'),
    '--contract',
    path.join(dir, 'contract.json'),
    '--probe',
    path.join(dir, 'probe.json'),
    '--preflight-verdict',
    path.join(dir, 'preflight.json'),
    '--policy',
    path.join(dir, 'policy.json'),
    '--corpus-digest',
    corpusDigest,
  );
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 120_000, killSignal: 'SIGKILL' });
  const stdout = result.stdout ?? '';
  let artifact = null;
  if (stdout.trim() !== '') {
    try {
      artifact = JSON.parse(stdout);
    } catch {
      artifact = null;
    }
  }
  const notes = [];
  if (result.error) notes.push(`spawn error: ${result.error.message}`);
  if (result.signal) notes.push(`killed by ${result.signal}`);
  const stderr = (result.stderr ?? '').trim();
  if (stderr !== '') notes.push(`stderr: ${stderr}`);
  if (artifact === null && stdout.trim() !== '') notes.push(`stdout: ${stdout.slice(0, 300)}`);
  return { status: result.status, artifact, stderr, detail: notes.length === 0 ? '' : ` (${notes.join('; ')})` };
}

function writeJson(dir, name, value) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return file;
}

/** The checks every trial-set artifact answers the same way, whatever its votes. */
async function checkTrialSetShape(label, run, expectedExit) {
  const { artifact, status, stderr, detail } = run;
  check(status === expectedExit, `the ${label} score exited ${status}, expected ${expectedExit}${detail}`);
  check(artifact !== null, `the ${label} score emitted no EvidenceArtifact${detail}`);
  check(stderr === '', `the ${label} score wrote to stderr on an otherwise-expected run: ${stderr}`);
  if (artifact === null) return null;

  check(
    typeof artifact.schemaVersion === 'number' && artifact.schemaVersion >= MINIMUM_SCHEMA_VERSION,
    `the ${label} EvidenceArtifact is schema version ${JSON.stringify(artifact.schemaVersion)}, and trial-set scoring needs ${MINIMUM_SCHEMA_VERSION} or later`,
  );
  for (const message of await validateArtifact('evidence-artifact', artifact)) {
    check(false, `the ${label} EvidenceArtifact does not match its published schema: ${message}`);
  }
  check(
    artifact.trials?.completed === TRIAL_COUNT,
    `the ${label} trials.completed is ${JSON.stringify(artifact.trials?.completed)}, expected ${TRIAL_COUNT}`,
  );
  check(
    JSON.stringify(artifact.trials?.completedAttempts) === JSON.stringify([1, 2, 3]),
    `the ${label} trials.completedAttempts is ${JSON.stringify(artifact.trials?.completedAttempts)}, expected [1,2,3]`,
  );
  check(
    artifact.scoredProbeId === PROBE_ID,
    `the ${label} scoredProbeId is ${JSON.stringify(artifact.scoredProbeId)}, expected "${PROBE_ID}"`,
  );
  const outcomes = artifact.outcomes ?? [];
  const countByTrial = new Map();
  for (const outcome of outcomes) countByTrial.set(outcome.trialIndex, (countByTrial.get(outcome.trialIndex) ?? 0) + 1);
  const covered = [...countByTrial.keys()].sort((a, b) => a - b);
  check(
    JSON.stringify(covered) === JSON.stringify([1, 2, 3]),
    `the ${label} detailed outcomes cover trials ${JSON.stringify(covered)}, expected [1,2,3]`,
  );
  const counts = [...countByTrial.values()];
  check(
    counts.length > 0 && counts.every((count) => count === counts[0]),
    `the ${label} detailed outcomes are not evenly distributed across trials: ${JSON.stringify(Object.fromEntries(countByTrial))}`,
  );
  check(
    artifact.strength?.comparable === true,
    `the ${label} strength.comparable is ${JSON.stringify(artifact.strength?.comparable)} over three trials`,
  );

  const reduced = Array.isArray(artifact.reducedProbeOutcomes) ? artifact.reducedProbeOutcomes : null;
  check(reduced !== null, `the ${label} artifact carries no reducedProbeOutcomes, so the engine reduced no trial set`);
  if (reduced === null) return null;
  check(
    reduced.length === 1 && reduced[0].probeId === PROBE_ID,
    `the ${label} reducedProbeOutcomes holds ${JSON.stringify(reduced.map((entry) => entry.probeId))}, expected exactly ["${PROBE_ID}"]`,
  );
  return reduced.find((entry) => entry.probeId === PROBE_ID) ?? null;
}

/** One reduced outcome against the votes and counts the trials handed to it must produce. */
function checkReduction(label, own, expectedStates, expectedCatchThreshold) {
  if (own === null) return;
  const votes = [...(own.trialVotes ?? [])].sort((a, b) => a.trialIndex - b.trialIndex);
  const states = votes.map((vote) => `${vote.trialIndex}:${vote.state}`);
  const expected = expectedStates.map((state, index) => `${index + 1}:${state}`);
  check(
    JSON.stringify(states) === JSON.stringify(expected),
    `the ${label} reduction votes ${JSON.stringify(states)}, expected ${JSON.stringify(expected)}`,
  );
  const caughtCount = expectedStates.filter((state) => state === 'caught').length;
  check(own.validCount === TRIAL_COUNT, `the ${label} reduction's validCount is ${own.validCount}, expected ${TRIAL_COUNT}`);
  check(own.caughtCount === caughtCount, `the ${label} reduction's caughtCount is ${own.caughtCount}, expected ${caughtCount}`);
  check(
    own.catchThreshold === expectedCatchThreshold,
    `the ${label} reduction's catchThreshold is ${own.catchThreshold}, expected ${expectedCatchThreshold} (the test's own scoring policy)`,
  );
  check(
    own.exercised === true && own.caught === true,
    `the ${label} reduction of ${PROBE_ID} is not an exercised catch at ${caughtCount} of ${TRIAL_COUNT}: ${JSON.stringify(own)}`,
  );
}

async function checkBelowMinimum(run) {
  const { artifact, status, stderr, detail } = run;
  check(status === 0, `the single-record score exited ${status}, expected 0${detail}`);
  check(artifact !== null, `the single-record score emitted no EvidenceArtifact${detail}`);
  check(stderr === '', `the single-record score wrote to stderr on an otherwise-expected run: ${stderr}`);
  if (artifact === null) return;
  check(
    typeof artifact.schemaVersion === 'number' && artifact.schemaVersion >= MINIMUM_SCHEMA_VERSION,
    `the single-record EvidenceArtifact is schema version ${JSON.stringify(artifact.schemaVersion)}, and trial-set scoring needs ${MINIMUM_SCHEMA_VERSION} or later`,
  );
  for (const message of await validateArtifact('evidence-artifact', artifact)) {
    check(false, `the single-record EvidenceArtifact does not match its published schema: ${message}`);
  }
  check(
    artifact.trials?.completed === 1,
    `the single-record trials.completed is ${JSON.stringify(artifact.trials?.completed)}, expected 1`,
  );
  check(
    artifact.strength?.comparable === false,
    `one record under minimumTrialCount ${TRIAL_COUNT} reads strength.comparable ${JSON.stringify(artifact.strength?.comparable)}, expected false`,
  );
}

/** Trial 2 as an evaluator that saw the same output and reported nothing: no finding, and the catching oracle held. */
function missedTrial(record) {
  const findings = record.findings.filter((finding) => finding.probeId !== PROBE_ID);
  if (findings.length === record.findings.length) {
    throw new Error(`missedTrial: no finding for probe ${PROBE_ID} in the stored record to remove`);
  }
  let oracleFound = false;
  const oracleDispositions = record.oracleDispositions.map((entry) => {
    if (entry.oracleId !== CATCHING_ORACLE) return entry;
    oracleFound = true;
    return { ...entry, disposition: 'held' };
  });
  if (!oracleFound) {
    throw new Error(`missedTrial: no oracle disposition for ${CATCHING_ORACLE} in the stored record to flip`);
  }
  return { ...record, trialIndex: 2, findings, oracleDispositions };
}

async function main() {
  const all = await suites();
  const suite = all.find((entry) => entry.id === SUITE_ID);
  const probe = suite?.probes.find((entry) => entry.probeId === PROBE_ID);
  if (probe === undefined) throw new Error(`no probe ${PROBE_ID} in suite ${SUITE_ID}`);

  const sealed = await sealContract(suite.contract);
  for (const message of sealed.schemaProblems) check(false, `the sealed brief does not match its published schema: ${message}`);

  const signal = AbortSignal.timeout(120_000);
  const corpusDigest = corpusDigestOf(suite);
  const runId = 'trial-set';
  const preflightVerdict = await preflightSuite({ ...suite, probes: [probe] }, { port: storedProbePort(suite), runId, signal });
  if (preflightVerdict.passed !== true) {
    const failed = preflightVerdict.checks.filter((entry) => entry.outcome === 'failed').map((entry) => entry.kind);
    console.error(
      `${colors.red}trial-set scoring: ${SUITE_ID} ${PROBE_ID} no longer pre-flights (${[...new Set(failed)].join(', ')}), so it cannot anchor a trial set${colors.reset}`,
    );
    return 1;
  }
  const { record, manifest, configuration, schemaProblems } = await scoreProbe(suite, probe, {
    preflightVerdict,
    runId,
    modelSnapshot: 'stored-replay',
    signal,
    corpusDigest,
  });
  for (const message of schemaProblems) check(false, `an input scoreProbe built does not match its published schema: ${message}`);
  const policy = { ...(await scoringPolicy()), minimumTrialCount: TRIAL_COUNT };
  for (const message of await validateArtifact('scoring-policy', policy)) {
    check(false, `the policy with minimumTrialCount ${TRIAL_COUNT} does not match its published schema: ${message}`);
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-trial-set-'));
  try {
    writeJson(dir, 'manifest.json', manifest);
    writeJson(dir, 'configuration.json', configuration);
    writeJson(dir, 'contract.json', suite.contract);
    writeJson(dir, 'probe.json', probe);
    writeJson(dir, 'preflight.json', preflightVerdict);
    writeJson(dir, 'policy.json', policy);
    const trials = {
      'record-1.json': { ...record, trialIndex: 1 },
      'record-2.json': { ...record, trialIndex: 2 },
      'record-3.json': { ...record, trialIndex: 3 },
      'record-2-missed.json': missedTrial(record),
    };
    const files = {};
    for (const [name, value] of Object.entries(trials)) {
      for (const message of await validateArtifact('sealed-run-record', value)) {
        check(false, `${name} does not match the published SealedRunRecord schema: ${message}`);
      }
      files[name] = writeJson(dir, name, value);
    }

    const agreeing = runScoreCli(dir, [files['record-3.json'], files['record-1.json'], files['record-2.json']], corpusDigest);
    checkReduction('agreeing', await checkTrialSetShape('agreeing', agreeing, 0), ['caught', 'caught', 'caught'], policy.catchThreshold);

    const disagreeing = runScoreCli(dir, [files['record-3.json'], files['record-2-missed.json'], files['record-1.json']], corpusDigest);
    checkReduction(
      'disagreeing',
      await checkTrialSetShape('disagreeing', disagreeing, EXIT_FAIL),
      ['caught', 'missed', 'caught'],
      policy.catchThreshold,
    );

    await checkBelowMinimum(runScoreCli(dir, [files['record-1.json']], corpusDigest));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  if (failures.length > 0) {
    console.error(`${colors.red}${failures.length} of ${checks} trial-set scoring check(s) failed:${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log(
    `${colors.green}ok${colors.reset} all ${checks} trial-set scoring check(s) passed: ${TRIAL_COUNT} trials of ${SUITE_ID} ${PROBE_ID} reduced through the eval-quality score CLI`,
  );
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(`${colors.red}trial-set scoring could not run:${colors.reset} ${error.stack ?? error}`);
    process.exitCode = 1;
  });
