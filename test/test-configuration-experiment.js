/**
 * `test/lib/configuration-experiment.js`, the offline reader for repeatability and
 * one-factor configuration experiments, held to the ten acceptance cases of its
 * specification.
 *
 * No live call and no subprocess except the reader's own command line. The synthetic
 * fixtures are built here; the repository-backed fixtures are the recorded Test
 * Design runs under `test/results/codex-test-design/raw/two-run-before-numeric/` and
 * `two-run-after-numeric/`, read first for what they actually contain.
 *
 * The statistics are held to a reference calculation written in this file. It uses
 * BigInt arithmetic for the generator and its own quantile, shares no helper with the
 * reader, and is pinned to values an independent Python implementation produced.
 *
 * Usage: node test/test-configuration-experiment.js
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const experiment = require('./lib/configuration-experiment');
const { loadGroundTruth, THRESHOLDS } = require('./eval-test-design');

const PROJECT_ROOT = path.join(__dirname, '..');
const READER = path.join(__dirname, 'lib', 'configuration-experiment.js');
const RAW = path.join(__dirname, 'results', 'codex-test-design', 'raw');
const EXAMPLES = path.join(__dirname, 'fixtures', 'configuration-experiment');
const DOC = path.join(PROJECT_ROOT, 'docs', 'how-to', 'evaluate', 'measure-repeatability-and-compare-a-configuration.md');

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };
const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function independentCanonical(value) {
  if (Array.isArray(value)) return `[${value.map((item) => independentCanonical(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${independentCanonical(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
const withoutFrozen = (value) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'frozen'));
const sha = (text) => `sha256:${crypto.createHash('sha256').update(text).digest('hex')}`;
const clone = (value) => structuredClone(value);
const canonicalJsonOf = (value) => experiment.canonicalJson(value);
const outcomeOf = (result) => result.report.contrast.decision?.outcome ?? result.report.contrast.status;
const reasonsOf = (result) => result.report.contrast.decision?.reasons ?? [];
const hasReason = (result, pattern) => reasonsOf(result).some((reason) => pattern.test(reason));

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

/* -------------------------------------------------------------------------- */
/* Reference calculation, independent of the reader                            */
/* -------------------------------------------------------------------------- */

function referenceGenerator(seed) {
  const MASK = 0xff_ff_ff_ffn;
  let a = BigInt(seed) & MASK;
  return () => {
    a = (a + 0x6d_2b_79_f5n) & MASK;
    let t = a;
    t = ((t ^ (t >> 15n)) * (t | 1n)) & MASK;
    t = (t ^ ((t + (((t ^ (t >> 7n)) * (t | 61n)) & MASK)) & MASK)) & MASK;
    return Number((t ^ (t >> 14n)) & MASK) / 4_294_967_296;
  };
}

function referenceLower(values, { B, seed, alpha, quantile = 'linear' }) {
  const next = referenceGenerator(seed);
  const n = values.length;
  const means = [];
  for (let resample = 0; resample < B; resample += 1) {
    let total = 0;
    for (let draw = 0; draw < n; draw += 1) total += values[Math.floor(next() * n)];
    means.push(total / n);
  }
  means.sort((x, y) => x - y);
  if (quantile === 'nearest-rank') return means[Math.max(0, Math.ceil(alpha * B) - 1)];
  const h = (B - 1) * alpha;
  const lo = Math.floor(h);
  return means[lo] + (h - lo) * (means[Math.ceil(h)] - means[lo]);
}

const referenceMean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

/* -------------------------------------------------------------------------- */
/* Synthetic world                                                              */
/* -------------------------------------------------------------------------- */

const FIXED = {
  suiteDigest: 'sha256:suite',
  fixtureDigest: 'sha256:fixture',
  groundTruthDigest: 'sha256:ground-truth',
  scorerDigest: 'sha256:scorer',
  thresholdsDigest: 'sha256:thresholds',
  rubricDigest: 'not-applicable',
  environment: { node: '24', cacheRegime: 'cold cache on every attempt' },
};
const ARM_A = {
  model: { requested: 'incumbent', resolved: 'incumbent-2026-10' },
  effort: { requested: 'high', applied: 'high' },
  decode: { temperature: 0 },
  promptDigest: 'sha256:prompt-1',
};
const ARM_B = { ...ARM_A, model: { requested: 'cheaper', resolved: 'cheaper-2026-10' } };
const SELECTION_CASES = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
const CONFIRMATION_CASES = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'];
const CANDIDATE = 'cheaper-v1';
const ARMS_AB = ['A', 'B'];

const FREEZE_CASES = ['d1', 'd2', 'v1'];
const freezePin = () => {
  const ledger = selectionLedger(FREEZE_CASES);
  return { head: ledger.at(-1).hash, length: ledger.length };
};

function declaration({ stage = 'selection', cases = SELECTION_CASES, objective = 'cost', mutate } = {}) {
  const weight = 1 / cases.length;
  const body = {
    schemaVersion: '1.0.0',
    experimentId: 'synthetic-cost-experiment',
    stage,
    scope: {
      workflow: 'bmad-tea-test-design',
      owner: 'tests',
      claim: 'fixed-suite',
      judge: 'none',
      objective,
      baseline: { id: 'incumbent', description: 'incumbent configuration' },
      candidate: { id: CANDIDATE, description: 'one cheaper model' },
      changedFactor: { kind: 'model', detail: 'incumbent to cheaper' },
      memberships: {
        development: stage === 'confirmation' ? ['d1', 'd2'] : cases.slice(0, Math.ceil(cases.length / 2)),
        validation: stage === 'confirmation' ? ['v1'] : cases.slice(Math.ceil(cases.length / 2)),
        confirmation: stage === 'confirmation' ? cases : CONFIRMATION_CASES,
      },
      clusters: cases.map((caseId) => ({ caseId, clusterId: caseId, weight })),
    },
    identity: { fixed: clone(FIXED), arms: { A: clone(ARM_A), B: clone(ARM_B) } },
    design: {
      repeats: 2,
      order: 'interleaved',
      isolation: 'fresh staged workspace per attempt',
      maxAttempts: 2,
      stoppingRule: 'fixed repeat schedule',
      failureRules: { timeout: 'incomplete' },
      analysis: { alpha: 0.05, B: 2000, seed: 424_242, prng: 'mulberry32', quantile: 'linear', simultaneous: false },
    },
    gates: {
      success: { metrics: { recall: 0.5, precision: 0.5 } },
      quality:
        objective === 'cost'
          ? { recall: { maxLoss: 0.1 }, precision: { maxLoss: 0.1 } }
          : { recall: { minImprovement: 0.01 }, precision: { maxLoss: 0.1 } },
      floors: { recall: 0.5 },
      saving: objective === 'cost' ? { minFraction: 0.2 } : undefined,
      critical: { tolerance: 0, rules: [{ id: 'top-severity-missed', count: 'topSeverityMissed' }] },
    },
    resources: { authorization: null, overhead: [] },
  };
  if (stage === 'confirmation') body.exposure = { ledgerHeadAtFreeze: freezePin() };
  if (mutate) mutate(body);
  if (stage === 'confirmation' && body.selection === undefined) body.selection = pinSelection(body);
  return freeze(body);
}

/**
 * The selection a confirmation follows: the confirmation's own declaration as a
 * selection stage over its development and validation cases, read on evidence that
 * clears every gate. Its declaration and report digests are what a confirmation pins.
 */
const SELECTIONS = new Map();
function pinSelection(confirmationBody, { diffs } = {}) {
  const body = clone(confirmationBody);
  body.stage = 'selection';
  delete body.exposure;
  delete body.selection;
  const cases = [...(body.scope?.memberships?.development ?? []), ...(body.scope?.memberships?.validation ?? [])];
  if (body.scope) body.scope.clusters = cases.map((caseId) => ({ caseId, clusterId: caseId, weight: 1 / cases.length }));
  const frozen = freeze(body);
  const selectionDiffs = diffs ?? cases.map((_, i) => 0.04 + 0.01 * i);
  const input = { declaration: frozen, attempts: sealAll(world({ cases, diffs: selectionDiffs })), ledger: selectionLedger(cases) };
  const { report } = read(input.declaration, input.attempts, { ledger: input.ledger });
  const pin = { declarationDigest: experiment.declarationDigest(frozen), reportDigest: experiment.digestOf(report) };
  SELECTIONS.set(pin.reportDigest, { input, report });
  return pin;
}

/** The selection input of a confirmation declaration, as `readExperiment` takes it. */
const selectionOf = (value) => SELECTIONS.get(value?.selection?.reportDigest)?.input ?? null;
/** The selection report a confirmation declaration pins. */
const selectionReportOf = (value) => SELECTIONS.get(value?.selection?.reportDigest)?.report ?? null;

/** Freeze a declaration the way an operator does: record the digest of the bytes. */
function freeze(body) {
  const copy = clone(body);
  delete copy.frozen;
  return { ...copy, frozen: { digest: experiment.declarationDigest(copy) } };
}

/**
 * The synthetic deterministic scorer. A synthetic document is the JSON of what its
 * scorer finds in it, so the scorer re-derives a row's metrics and counts from the
 * saved bytes the way the Test Design scorer does for a real document.
 */
function syntheticScorer(text) {
  try {
    const document = JSON.parse(text);
    return { metrics: document.metrics, counts: document.counts };
  } catch {
    return { unmeasurable: 'not-a-synthetic-document' };
  }
}
const documentOf = (row) => JSON.stringify({ attemptId: row.attemptId, metrics: row.metrics ?? {}, counts: row.counts ?? {} });

/**
 * Re-export a row the way a native exporter would after a test edits its numbers: the
 * saved document, its hash and the receipt's artifact hash follow the row. A row whose
 * text and hashes a test already set apart stays as the test left it.
 */
function seal(row) {
  if (row === null || typeof row !== 'object' || typeof row.outputText !== 'string') return row;
  const consistent = row.outputSha256 === sha(row.outputText) && (!row.receipt || row.receipt.artifactSha256 === row.outputSha256);
  if (!consistent || syntheticScorer(row.outputText).unmeasurable) return row;
  const copy = clone(row);
  copy.outputText = documentOf(copy);
  copy.outputSha256 = sha(copy.outputText);
  if (copy.receipt && typeof copy.receipt === 'object') copy.receipt.artifactSha256 = copy.outputSha256;
  return copy;
}
const sealAll = (attempts) => (Array.isArray(attempts) ? attempts.map((row) => seal(row)) : attempts);

let signatureCounter = 0;
const DISPATCH_START = Date.parse('2026-10-14T00:00:00.000Z');
function attempt({ arm, caseId, repetition, stage = 'selection', metrics, cost, mutate }) {
  signatureCounter += 1;
  const attemptId = `${arm}-${caseId}-${repetition}-1`;
  const text = JSON.stringify({ attemptId, metrics: metrics ?? {}, counts: { topSeverityMissed: 0 } });
  const startedAt = new Date(DISPATCH_START + signatureCounter * 60_000).toISOString();
  const endedAt = new Date(DISPATCH_START + signatureCounter * 60_000 + 30_000).toISOString();
  const row = {
    attemptId,
    runId: 'run-1',
    stage,
    arm,
    caseId,
    clusterId: caseId,
    blockId: `${caseId}-${repetition}`,
    repetition,
    attempt: 1,
    status: 'completed',
    receipt: {
      kind: 'fresh-workspace',
      workspaceId: `workspace-${attemptId}`,
      startedAt,
      endedAt,
      artifactSha256: sha(text),
    },
    inputSha256: sha('prompt'),
    outputSha256: sha(text),
    outputText: text,
    native: { ref: `native/${attemptId}`, signature: `sig-${signatureCounter}`, qualification: 'passed' },
    metrics,
    counts: { topSeverityMissed: 0 },
    cost: cost === undefined ? undefined : { currency: 'USD', components: { target: cost, tools: 0 } },
    latency: { taskMs: 1000 },
    observed: { fixed: clone(FIXED), arm: clone(arm === 'A' ? ARM_A : ARM_B) },
  };
  if (mutate) mutate(row);
  return row;
}

const DIFFS = [0.01, -0.01, 0.02, 0, 0.01, -0.02];

/** Quality and cost as functions of the case index; B is a bit different and much cheaper. */
function world({ cases = SELECTION_CASES, stage = 'selection', diffs = DIFFS, costB = (i) => 0.5 + 0.05 * i, mutateRow } = {}) {
  const rows = [];
  for (const [i, caseId] of cases.entries()) {
    for (const repetition of [1, 2]) {
      const base = 0.8 + 0.01 * i + 0.005 * repetition;
      const a = attempt({ arm: 'A', caseId, repetition, stage, metrics: { recall: base, precision: base - 0.1 }, cost: 1 + 0.1 * i });
      const b = attempt({
        arm: 'B',
        caseId,
        repetition,
        stage,
        metrics: { recall: base + diffs[i], precision: base - 0.1 + diffs[i] },
        cost: costB(i),
      });
      for (const row of [a, b]) mutateRow?.(row, i, repetition);
      rows.push(a, b);
    }
  }
  return rows;
}

function selectionLedger(cases = SELECTION_CASES, candidate = CANDIDATE) {
  let ledger = [];
  for (const caseId of cases) ledger = experiment.appendExposure(ledger, { kind: 'selection-exposure', caseId, candidateId: candidate });
  return ledger;
}

function confirmationLedger(cases = CONFIRMATION_CASES, candidate = CANDIDATE) {
  let ledger = selectionLedger(FREEZE_CASES);
  for (const caseId of cases) ledger = experiment.appendExposure(ledger, { kind: 'confirmation-exposure', caseId, candidateId: candidate });
  return ledger;
}

/**
 * Read the way an operator does: the deterministic scorer supplied, the rows exported
 * after any edit a test made to their numbers. `{ seal: false }` reads the rows as given.
 */
function read(declarationValue, attempts, { seal: sealRows = true, ...extra } = {}) {
  return experiment.readExperiment({
    declaration: declarationValue,
    attempts: sealRows ? sealAll(attempts) : attempts,
    ledger: selectionLedger(),
    replay: syntheticScorer,
    selection: selectionOf(declarationValue),
    ...extra,
  });
}

const CONFIRMATION = () => ({ stage: 'confirmation', cases: CONFIRMATION_CASES });
function readConfirmation(attempts, extra = {}) {
  return read(declaration(CONFIRMATION()), attempts, { ledger: confirmationLedger(), ...extra });
}
const confirmationWorld = (options = {}) => world({ cases: CONFIRMATION_CASES, stage: 'confirmation', ...options });

/* -------------------------------------------------------------------------- */
/* The bootstrap against the reference                                          */
/* -------------------------------------------------------------------------- */

function checkBootstrapAgainstReference() {
  const cases = [
    { values: [0.02, -0.01, 0.03, 0, 0.04, -0.02], B: 1000, seed: 20_261_014, alpha: 0.05, quantile: 'linear', pinned: -0.005 },
    { values: [-0.05, 0.01, 0.02, -0.03, 0.04, 0.06, -0.01, 0], B: 2000, seed: 7, alpha: 0.1, quantile: 'nearest-rank', pinned: -0.01 },
    { values: [0.3, 0.25, 0.4, 0.2, 0.35, 0.28], B: 1000, seed: 20_261_014, alpha: 0.05, quantile: 'linear', pinned: 0.255 },
    { values: [-0.4, -0.2, -0.3, -0.5, -0.1], B: 1500, seed: 99, alpha: 0.05, quantile: 'linear', pinned: undefined },
    {
      values: [0.013, -0.027, 0.041, 0.008, -0.012, 0.036, 0.022, -0.005, 0.017, -0.031, 0.029, 0.003],
      B: 1000,
      seed: 314_159,
      alpha: 0.037,
      quantile: 'linear',
      pinned: -0.003_851_833_333_333_332_5,
    },
    {
      values: [0.013, -0.027, 0.041, 0.008, -0.012, 0.036, 0.022, -0.005, 0.017, -0.031, 0.029, 0.003],
      B: 1000,
      seed: 314_159,
      alpha: 0.0435,
      quantile: 'nearest-rank',
      pinned: -0.003_416_666_666_666_667,
    },
  ];
  for (const entry of cases) {
    const result = experiment.pairedClusterBootstrap({
      contrasts: { m: entry.values },
      B: entry.B,
      seed: entry.seed,
      alpha: entry.alpha,
      quantile: entry.quantile,
    });
    const expected = referenceLower(entry.values, entry);
    check(Math.abs(result.m.lower - expected) < 1e-12, `bootstrap lower bound ${result.m.lower} matches the reference ${expected}`);
    check(Math.abs(result.m.estimate - referenceMean(entry.values)) < 1e-12, 'bootstrap estimate is the cluster mean');
    check(result.m.lower <= result.m.estimate + 1e-12, 'a lower bound sits at or below the estimate');
    if (entry.pinned !== undefined) {
      check(Math.abs(result.m.lower - entry.pinned) < 1e-12, `bootstrap lower bound matches the independent Python value ${entry.pinned}`);
    }
  }

  // Signs: a candidate that is worse everywhere has a negative bound; better everywhere, a positive one.
  const worse = experiment.pairedClusterBootstrap({
    contrasts: { m: [-0.4, -0.2, -0.3, -0.5, -0.1] },
    B: 1500,
    seed: 99,
    alpha: 0.05,
    quantile: 'linear',
  });
  check(worse.m.estimate < 0 && worse.m.lower < 0, 'candidate-minus-baseline keeps its sign for a worse candidate');
  const better = experiment.pairedClusterBootstrap({
    contrasts: { m: [0.4, 0.2, 0.3, 0.5, 0.1] },
    B: 1500,
    seed: 99,
    alpha: 0.05,
    quantile: 'linear',
  });
  check(better.m.estimate > 0 && better.m.lower > 0, 'candidate-minus-baseline keeps its sign for a better candidate');

  // The same draws feed every contrast, so two contrasts that are identical give identical bounds.
  const paired = experiment.pairedClusterBootstrap({
    contrasts: { x: [0.1, 0.2, 0.3, 0.4, 0.5], y: [0.1, 0.2, 0.3, 0.4, 0.5] },
    B: 1000,
    seed: 5,
    alpha: 0.05,
    quantile: 'linear',
  });
  check(paired.x.lower === paired.y.lower, 'one set of cluster draws serves every contrast');
  const again = experiment.pairedClusterBootstrap({
    contrasts: { x: [0.1, 0.2, 0.3, 0.4, 0.5] },
    B: 1000,
    seed: 5,
    alpha: 0.05,
    quantile: 'linear',
  });
  check(again.x.lower === paired.x.lower, 'a contrast gets the same bound alone as alongside another');

  check(experiment.runCalibration().passed, 'the shipped bootstrap reproduces its calibration fixtures');
  const broken = experiment.runCalibration((input) => {
    const result = experiment.pairedClusterBootstrap(input);
    for (const name of Object.keys(result)) result[name].lower += 0.01;
    return result;
  });
  check(!broken.passed && broken.failures.length > 0, 'a bootstrap that drifts fails its calibration fixtures');
  check(experiment.CALIBRATION_FIXTURES.length >= 2, 'calibration holds reference fixtures');
}

/* -------------------------------------------------------------------------- */
/* Acceptance case 1: identical stored A/A rows                                  */
/* -------------------------------------------------------------------------- */

function checkAcceptance1() {
  // The same stored rows presented as both arms.
  const stored = world();
  const asAA = stored.filter((row) => row.arm === 'A');
  const copiedAsB = asAA.map((row) => ({ ...clone(row), arm: 'B' }));
  const result = read(declaration(), [...asAA, ...copiedAsB]);
  check(outcomeOf(result) === 'blocked', `identical stored rows are blocked, got ${outcomeOf(result)}`);
  check(hasReason(result, /rows are shared between the arms/), 'identical stored rows are named as shared between the arms');
  check(
    result.report.exclusions.filter((entry) => entry.reason === 'duplicate-attempt-id').length === copiedAsB.length,
    'every copied row is excluded and none counts as an independent trial',
  );
  check(!['recommend', 'selection-cleared'].includes(outcomeOf(result)), 'identical stored rows are never an automatic win');
  const indexed = result.evidenceIndex.rows.filter((row) => row.counted === 'excluded:duplicate-attempt-id');
  check(indexed.length === copiedAsB.length, 'copied rows stay in the evidence index with the reason they were excluded');

  // The same fresh workspace claimed under a new attempt id is the same trial.
  const reclaimed = world();
  const first = reclaimed.find((row) => row.arm === 'A');
  const copy = { ...clone(first), attemptId: 'another-id', arm: 'B', caseId: first.caseId, repetition: first.repetition };
  const copied = read(declaration(), [...reclaimed, copy]);
  check(
    copied.report.exclusions.some((entry) => entry.attemptId === 'another-id' && entry.reason === 'copied-trial'),
    "a row that reuses another attempt's fresh workspace is a copied trial",
  );

  // A fresh A/A: both arms declared identically, generated in different workspaces, with real variation.
  const aaDeclaration = declaration({
    mutate: (body) => {
      body.identity.arms.B = clone(body.identity.arms.A);
    },
  });
  const aaRows = world({ diffs: [0.1, 0.13, 0.05, 0.11, 0.13, 0.08], costB: (i) => 0.2 + 0.05 * i }).map((row) => {
    if (row.arm === 'B') row.observed.arm = clone(ARM_A);
    return row;
  });
  const aa = read(aaDeclaration, aaRows);
  check(outcomeOf(aa) === 'aa-control', `a fresh A/A is an A/A control, got ${outcomeOf(aa)}`);
  check(aa.report.contrast.estimator.bounds !== null, 'a fresh A/A still reports its bounds, so measurement noise is visible');
  check(
    Object.values(aa.report.contrast.estimator.bounds).some((bound) => bound.estimate !== 0),
    'a fresh A/A exposes variation between generations of one configuration',
  );
  check(outcomeOf(aa) !== 'recommend' && outcomeOf(aa) !== 'selection-cleared', 'an A/A difference never becomes a win, however large');
}

/* -------------------------------------------------------------------------- */
/* Acceptance case 2: generation receipts and fixed-output replay                */
/* -------------------------------------------------------------------------- */

function checkAcceptance2() {
  const noReceipts = world({
    mutateRow: (row) => {
      delete row.receipt;
    },
  });
  const result = read(declaration(), noReceipts);
  check(
    outcomeOf(result) === 'blocked' && hasReason(result, /no fresh generation receipt/),
    'attempts without fresh receipts block the contrast',
  );

  const mismatched = world({
    mutateRow: (row) => {
      row.receipt.artifactSha256 = sha('some other bytes');
    },
  });
  const mismatch = read(declaration(), mismatched);
  check(outcomeOf(mismatch) === 'blocked', 'a receipt whose artifact hash differs from the output hash is no receipt');
  check(
    mismatch.evidenceIndex.rows.every((row) => row.origin === 'imported-historical' && row.receiptProblem),
    'the index marks such rows imported and records the receipt problem',
  );

  const withReceipts = read(declaration(), world());
  check(
    withReceipts.evidenceIndex.rows.every((row) => row.origin === 'fresh'),
    'rows with a matching receipt are fresh',
  );

  // Fixed-output replay.
  const replayRows = [0, 1, 2].map((index) => ({ attemptId: `r${index}`, outputSha256: sha('same bytes'), outputText: 'same bytes' }));
  const scorer = (text) => ({ signature: `scored:${text}` });
  const replayed = experiment.replayFixedOutput(replayRows, scorer);
  check(replayed.ok && replayed.identical && replayed.runs === 3, 'identical bytes replay identically');
  const mixed = experiment.replayFixedOutput(
    [...replayRows, { attemptId: 'other', outputSha256: sha('different'), outputText: 'different' }],
    scorer,
  );
  check(
    !mixed.ok && /identical artifact hash/.test(mixed.reason),
    'rows with different artifact hashes are refused as a fixed-output replay',
  );
  const lying = experiment.replayFixedOutput([{ attemptId: 'x', outputSha256: sha('claimed'), outputText: 'actual' }], scorer);
  check(!lying.ok && /do not hash/.test(lying.reason), 'saved bytes that do not hash to the declared hash are refused');
  check(!experiment.replayFixedOutput([], scorer).ok, 'an empty replay is refused');

  // A scorer that is not deterministic is visible.
  let calls = 0;
  const drifting = read(declaration(), world(), { replay: () => ({ signature: `call-${(calls += 1)}` }) });
  check(
    drifting.report.descriptive.replay.results.every((entry) => entry.deterministic === false),
    'a scorer that answers differently on identical bytes is reported as not deterministic',
  );
  const refused = experiment.readExperiment({
    declaration: declaration(),
    attempts: world({
      mutateRow: (row) => {
        row.outputText = 'tampered';
      },
    }),
    ledger: selectionLedger(),
    replay: scorer,
  });
  check(
    refused.report.descriptive.replay.results.every((entry) => entry.status === 'refused'),
    'replay refuses saved bytes that do not match their recorded hash',
  );

  // Test Design has no rubric judge.
  const judge = result.report.descriptive.judge;
  check(judge.status === 'not-applicable', 'Test Design judge variance is not applicable');
}

/* -------------------------------------------------------------------------- */
/* Acceptance case 3: the stochastic judge                                      */
/* -------------------------------------------------------------------------- */

function judgeCall(callId, outputText, verdict, label, overrides = {}) {
  return {
    callId,
    outputSha256: sha(outputText),
    inputSha256: sha('input'),
    rubricSha256: sha('rubric'),
    judgeIdentity: 'judge-model@2026-10',
    verdict,
    rationale: `because ${verdict}`,
    label,
    receipt: { callId },
    ...overrides,
  };
}

function checkAcceptance3() {
  const unstable = experiment.analyzeJudgeCalls([
    judgeCall('g1', 'good output', 'pass', 'good'),
    judgeCall('g2', 'good output', 'pass', 'good'),
    judgeCall('g3', 'good output', 'pass', 'good'),
    judgeCall('b1', 'bad output', 'fail', 'bad'),
    judgeCall('b2', 'bad output', 'pass', 'bad'),
    judgeCall('b3', 'bad output', 'fail', 'bad'),
    judgeCall('u1', 'unlabeled output', 'pass'),
    judgeCall('u2', 'unlabeled output', 'fail'),
  ]);
  check(unstable.status === 'analyzed', 'repeated judgments of frozen output are analyzed');
  check(
    unstable.outputs.filter((output) => output.disagreement).length === 2,
    'the unstable judge disagrees with itself on identical output',
  );
  check(Math.abs(unstable.disagreementRate - 2 / 3) < 1e-12, 'the disagreement rate counts outputs, not calls');
  check(!unstable.valid, 'an unstable judge is not valid');
  check(
    unstable.outputs.every((output) => ['good output', 'bad output', 'unlabeled output'].some((text) => output.outputSha256 === sha(text))),
    'disagreement is measured per frozen output hash, so target variation cannot enter',
  );

  // A stable judge that is wrong on the bad control.
  const stableWrong = experiment.analyzeJudgeCalls([
    judgeCall('g1', 'good output', 'pass', 'good'),
    judgeCall('g2', 'good output', 'pass', 'good'),
    judgeCall('b1', 'bad output', 'pass', 'bad'),
    judgeCall('b2', 'bad output', 'pass', 'bad'),
  ]);
  check(stableWrong.disagreementRate === 0, 'a stable wrong judge shows no disagreement');
  check(!stableWrong.valid && /invalid/.test(stableWrong.validity), 'a stable wrong judge fails validity on the labeled bad control');

  const stableRight = experiment.analyzeJudgeCalls([
    judgeCall('g1', 'good output', 'pass', 'good'),
    judgeCall('g2', 'good output', 'pass', 'good'),
    judgeCall('b1', 'bad output', 'fail', 'bad'),
    judgeCall('b2', 'bad output', 'fail', 'bad'),
  ]);
  check(stableRight.valid, 'a stable judge that is right on both controls is valid');

  const onlyGood = experiment.analyzeJudgeCalls([
    judgeCall('g1', 'good output', 'pass', 'good'),
    judgeCall('g2', 'good output', 'pass', 'good'),
  ]);
  check(!onlyGood.valid, 'controls of one label cannot establish validity');

  const missing = experiment.analyzeJudgeCalls([
    judgeCall('g1', 'good output', 'pass', 'good'),
    judgeCall('g2', 'good output', null, 'good'),
    judgeCall('b1', 'bad output', 'fail', 'bad'),
    judgeCall('b2', 'bad output', 'fail', 'bad'),
  ]);
  check(missing.missingRate === 0.25 && !missing.valid, 'a missing verdict is counted and keeps the judge from validity');

  const duplicated = experiment.analyzeJudgeCalls([
    judgeCall('g1', 'good output', 'pass', 'good'),
    judgeCall('g1', 'good output', 'pass', 'good'),
    judgeCall('b1', 'bad output', 'fail', 'bad'),
    judgeCall('b1', 'bad output', 'fail', 'bad'),
  ]);
  check(duplicated.status === 'blocked' && !duplicated.valid, 'one judge call supplied twice is not two calls');
  const mislabeled = experiment.analyzeJudgeCalls([
    judgeCall('g1', 'good output', 'pass', 'good'),
    judgeCall('g2', 'good output', 'pass', 'good', { receipt: { callId: 'g1' } }),
  ]);
  check(mislabeled.status === 'blocked', 'a receipt that names a different call is not a receipt for this call');

  const incoherent = experiment.analyzeJudgeCalls([
    judgeCall('g1', 'good output', 'pass', 'good'),
    judgeCall('g2', 'good output', 'pass', 'good', { rubricSha256: sha('another rubric') }),
  ]);
  check(incoherent.status === 'blocked', 'judgments under different rubrics are not repeated judgments of one thing');
  const receiptless = experiment.analyzeJudgeCalls([
    judgeCall('g1', 'good output', 'pass', 'good'),
    judgeCall('g2', 'good output', 'pass', 'good', { receipt: null }),
  ]);
  check(receiptless.status === 'blocked', 'a judge call without a fresh-call receipt is not counted');

  // Through the reader.
  const rubric = declaration({
    mutate: (body) => {
      body.scope.judge = 'rubric';
    },
  });
  const analyzed = read(rubric, world(), {
    judgeCalls: [judgeCall('b1', 'bad output', 'pass', 'bad'), judgeCall('b2', 'bad output', 'pass', 'bad')],
  });
  check(analyzed.report.descriptive.judge.status === 'analyzed', 'the report carries the judge analysis separately from target variation');
  const absent = read(rubric, world());
  check(absent.report.descriptive.judge.status === 'not-provided', 'a declared rubric judge with no repeated judgments says so');
}

/* -------------------------------------------------------------------------- */
/* Acceptance case 4: one critical miss                                           */
/* -------------------------------------------------------------------------- */

function checkAcceptance4() {
  const clean = read(declaration(), world());
  check(outcomeOf(clean) === 'selection-cleared', `the improving world clears selection, got ${outcomeOf(clean)}: ${reasonsOf(clean)}`);

  const oneMiss = world({
    mutateRow: (row, i, repetition) => {
      if (row.arm === 'B' && i === 2 && repetition === 1) row.counts.topSeverityMissed = 1;
    },
  });
  const rejected = read(declaration(), oneMiss);
  check(outcomeOf(rejected) === 'rejected', `one candidate critical miss rejects adoption, got ${outcomeOf(rejected)}`);
  check(hasReason(rejected, /top-severity-missed.*c3 repetition 1/), 'the rejection names the rule, case and repetition');
  check(
    rejected.report.contrast.arms.B.quality.recall > rejected.report.contrast.arms.A.quality.recall - 0.1,
    'average quality did not drop',
  );
  check(rejected.report.contrast.cost.unknown === false, 'cost evidence was complete and favorable');

  const confirmed = readConfirmation(
    confirmationWorld({
      mutateRow: (row, i, repetition) => {
        if (row.arm === 'B' && i === 0 && repetition === 2) row.counts.topSeverityMissed = 2;
      },
    }),
  );
  check(outcomeOf(confirmed) === 'rejected', 'a critical miss rejects at the confirmation stage too');

  // Missing cost evidence cannot soften it.
  const noCost = world({
    mutateRow: (row, i, repetition) => {
      row.cost = null;
      if (row.arm === 'B' && i === 2 && repetition === 1) row.counts.topSeverityMissed = 1;
    },
  });
  check(outcomeOf(read(declaration(), noCost)) === 'rejected', 'a critical miss rejects regardless of missing cost evidence');

  // A miss in a superseded retry still counts.
  const withRetry = world();
  const target = withRetry.find((row) => row.arm === 'B' && row.caseId === 'c4' && row.repetition === 1);
  withRetry.push({
    ...clone(target),
    attemptId: 'B-c4-1-retry',
    attempt: 2,
    retryOf: target.attemptId,
    counts: { topSeverityMissed: 1 },
    receipt: { ...target.receipt, workspaceId: 'workspace-retry' },
  });
  check(outcomeOf(read(declaration(), withRetry)) === 'rejected', 'a critical miss in a retried attempt still rejects');

  // A miss with no fresh receipt cannot be verified or dismissed.
  const unverified = world({
    mutateRow: (row, i, repetition) => {
      if (row.arm === 'B' && i === 1 && repetition === 1) {
        row.counts.topSeverityMissed = 1;
        delete row.receipt;
      }
    },
  });
  const blocked = read(declaration(), unverified);
  check(
    outcomeOf(blocked) === 'blocked' && hasReason(blocked, /critical miss is not verified/),
    'an unreceipted candidate critical miss blocks',
  );

  // The baseline's own critical miss does not reject the candidate.
  const baselineMiss = world({
    mutateRow: (row, i, repetition) => {
      if (row.arm === 'A' && i === 0 && repetition === 1) row.counts.topSeverityMissed = 1;
    },
  });
  check(
    outcomeOf(read(declaration(), baselineMiss)) !== 'rejected',
    'a baseline critical miss is reported without rejecting the candidate',
  );

  // An unrecorded critical count is unknown, never zero.
  for (const unrecorded of [(row) => delete row.counts.topSeverityMissed, (row) => (row.counts.topSeverityMissed = null)]) {
    const missingCount = world({
      mutateRow: (row) => {
        if (row.arm === 'B') unrecorded(row);
      },
    });
    const unknownResult = read(declaration(), missingCount);
    check(
      outcomeOf(unknownResult) === 'blocked' && hasReason(unknownResult, /critical counts are not recorded/),
      'a missing critical count blocks',
    );
    check(
      outcomeOf(readConfirmation(confirmationWorld({ mutateRow: (row) => row.arm === 'B' && unrecorded(row) }))) === 'blocked',
      'a missing critical count never recommends',
    );
  }

  // A critical rule also reads an explicit critical list.
  const explicit = world({
    mutateRow: (row, i, repetition) => {
      if (row.arm === 'B' && i === 5 && repetition === 2) row.critical = ['manual-critical'];
    },
  });
  check(outcomeOf(read(declaration(), explicit)) === 'rejected', 'a critical flag recorded on a row rejects too');

  // Tolerance other than zero is not supported.
  const lax = declaration({
    mutate: (body) => {
      body.gates.critical.tolerance = 1;
    },
  });
  check(outcomeOf(read(lax, oneMiss)) === 'blocked', 'only a zero-tolerance critical gate is supported');
}

/* -------------------------------------------------------------------------- */
/* Acceptance case 5: noise and boundaries                                       */
/* -------------------------------------------------------------------------- */

function checkAcceptance5() {
  // Higher mean, wide spread: the bound misses the useful-effect threshold.
  const noisy = world({ diffs: [0.07, -0.04, 0.08, -0.03, 0.06, -0.02] });
  const objectiveQuality = declaration({ objective: 'quality' });
  const result = read(objectiveQuality, noisy);
  const recall = result.report.contrast.estimator.bounds['quality:recall'];
  check(recall.estimate > 0.01, 'the noisy candidate has a higher mean than the useful-effect threshold');
  check(recall.lower < 0.01, 'its lower bound misses the threshold');
  check(outcomeOf(result) === 'inconclusive', `a higher mean whose bound misses the threshold is inconclusive, got ${outcomeOf(result)}`);
  check(
    result.report.contrast.gates.some((gate) => gate.gate === 'quality:recall' && gate.passes === false),
    'the failing gate is reported',
  );

  // Failing to detect a loss is not noninferiority.
  const wide = world({ diffs: [-0.2, 0.13, -0.15, 0.12, -0.1, 0.1] });
  check(outcomeOf(read(declaration(), wide)) === 'inconclusive', 'an interval too wide for noninferiority is inconclusive');

  // Equality at a boundary does not pass.
  check(!experiment.lowerBoundClears(-0.1, -0.1), 'a lower bound equal to its threshold does not clear');
  check(experiment.lowerBoundClears(-0.1 + 1e-9, -0.1), 'a lower bound just above its threshold clears');
  check(!experiment.lowerBoundClears(Number.NaN, 0) && !experiment.lowerBoundClears(null, 0), 'a bound that is not a number never clears');
  const gates = declaration().gates;
  const bounds = {
    'quality:recall': { lower: -0.1 },
    'quality:precision': { lower: -0.05 },
    'floor:recall': { lower: 0 },
    saving: { lower: 0 },
  };
  const evaluated = experiment.evaluateGates({ gates, bounds, objective: 'cost' });
  check(evaluated.find((gate) => gate.gate === 'quality:recall').passes === false, 'noninferiority at exactly -delta fails');
  check(evaluated.find((gate) => gate.gate === 'quality:precision').passes === true, 'noninferiority above -delta passes');
  check(evaluated.find((gate) => gate.gate === 'floor:recall').passes === false, 'an absolute floor met with equality fails');
  check(evaluated.find((gate) => gate.gate === 'saving').passes === false, 'a saving bound of exactly zero fails');

  // End to end: pin the real bounds to the threshold with a wrapper that keeps calibration intact.
  const pin = (offset) => (input) => {
    const out = experiment.pairedClusterBootstrap(input);
    for (const name of Object.keys(out)) {
      if (name === 'quality:recall') out[name].lower = -0.1 + offset;
      if (name === 'quality:precision') out[name].lower = -0.1 + 0.05;
    }
    return out;
  };
  const atBoundary = read(declaration(), world(), { bootstrap: pin(0) });
  check(outcomeOf(atBoundary) === 'inconclusive', 'equality at the noninferiority boundary is not a pass end to end');
  const aboveBoundary = read(declaration(), world(), { bootstrap: pin(1e-9) });
  check(outcomeOf(aboveBoundary) === 'selection-cleared', 'just above the boundary passes end to end, so the pin is not what failed');

  // Simultaneous coverage splits alpha across every bound.
  const simultaneous = read(
    declaration({
      mutate: (body) => {
        body.design.analysis.simultaneous = true;
      },
    }),
    world(),
  );
  check(
    Math.abs(simultaneous.report.contrast.estimator.alphaPerBound - 0.05 / 4) < 1e-12,
    'simultaneous coverage divides alpha by the number of bounds (2 quality, 1 floor, 1 saving)',
  );

  // A conjunction: every gate has to clear.
  const lossyPrecision = world({ diffs: DIFFS, mutateRow: undefined });
  for (const row of lossyPrecision) if (row.arm === 'B') row.metrics.precision -= 0.3;
  const conjunction = read(declaration(), lossyPrecision);
  check(outcomeOf(conjunction) === 'inconclusive', 'one failing metric keeps the whole conjunction from passing');
  check(
    conjunction.report.contrast.gates.find((gate) => gate.gate === 'quality:recall').passes === true,
    'the passing metrics are still reported as passing',
  );
}

/* -------------------------------------------------------------------------- */
/* Acceptance case 6: identity                                                     */
/* -------------------------------------------------------------------------- */

function checkAcceptance6() {
  // Drift of the task, ground truth, rubric, scorer and thresholds on the evidence.
  for (const [key, value, klass] of [
    ['suiteDigest', 'sha256:other-suite', 'task'],
    ['groundTruthDigest', 'sha256:other-truth', 'ground-truth'],
    ['rubricDigest', 'sha256:other-rubric', 'rubric'],
    ['scorerDigest', 'sha256:other-scorer', 'scorer'],
    ['thresholdsDigest', 'sha256:other-thresholds', 'thresholds'],
  ]) {
    const drifted = world({
      mutateRow: (row, i) => {
        if (row.arm === 'B' && i === 0) row.observed.fixed[key] = value;
      },
    });
    const result = read(declaration(), drifted);
    check(outcomeOf(result) === 'new-baseline-required', `a changed ${klass} requires a new baseline, got ${outcomeOf(result)}`);
    check(hasReason(result, new RegExp(`${klass} changed: fixed\\.${key}`)), `the reason names the changed ${klass}`);
  }

  // A declared edit after freezing.
  const edited = declaration();
  edited.gates.quality.recall.maxLoss = 0.9;
  const frozenMismatch = read(edited, world());
  check(
    outcomeOf(frozenMismatch) === 'blocked' && hasReason(frozenMismatch, /frozen\.digest does not match/),
    'editing a threshold after freezing is detected',
  );

  const unfrozen = declaration();
  delete unfrozen.frozen;
  check(outcomeOf(read(unfrozen, world())) === 'blocked', 'a paired contrast needs a frozen declaration');

  // The arm that ran is not the arm that was declared.
  const wrongModel = world({
    mutateRow: (row) => {
      if (row.arm === 'B') row.observed.arm.model.resolved = 'a-substituted-model';
    },
  });
  check(
    outcomeOf(read(declaration(), wrongModel)) === 'new-baseline-required',
    'a provider substitution recorded on the evidence invalidates the arm',
  );

  // An undeclared second change.
  for (const [label, mutate] of [
    ['effort', (body) => (body.identity.arms.B.effort.applied = 'low')],
    ['prompt', (body) => (body.identity.arms.B.promptDigest = 'sha256:prompt-2')],
    ['decode', (body) => (body.identity.arms.B.decode.temperature = 1)],
  ]) {
    const bundled = declaration({ mutate });
    const result = read(
      bundled,
      world({
        mutateRow: (row) => {
          row.observed.arm = clone(bundled.identity.arms[row.arm]);
        },
      }),
    );
    check(
      outcomeOf(result) === 'revised-design-required',
      `a second change (${label}) alongside the declared model change fails, got ${outcomeOf(result)}`,
    );
  }
  const promptFactor = declaration({
    mutate: (body) => {
      body.scope.changedFactor = { kind: 'prompt', setting: 'promptRegions.examples' };
    },
  });
  check(outcomeOf(read(promptFactor, world())) === 'revised-design-required', 'a declared factor that does not differ fails');

  // A declared prompt change alone is fine.
  const promptOnly = declaration({
    mutate: (body) => {
      body.scope.changedFactor = { kind: 'prompt', setting: 'promptRegions.examples' };
      body.identity.arms.A.promptRegions = { examples: 'sha256:examples-1', rules: 'sha256:rules-1' };
      body.identity.arms.B.model = clone(body.identity.arms.A.model);
      body.identity.arms.B.promptDigest = 'sha256:prompt-2';
      body.identity.arms.B.promptRegions = { examples: 'sha256:examples-2', rules: 'sha256:rules-1' };
    },
  });
  const promptRows = world({
    mutateRow: (row) => {
      row.observed.arm = clone(promptOnly.identity.arms[row.arm]);
    },
  });
  check(outcomeOf(read(promptOnly, promptRows)) === 'selection-cleared', 'a one-factor prompt change passes the identity check');

  // Unknown applied settings block an attributable conclusion.
  const unknownEffort = declaration({
    mutate: (body) => {
      body.identity.arms.B.effort.applied = null;
    },
  });
  const unknown = read(unknownEffort, world());
  check(
    outcomeOf(unknown) === 'blocked' && hasReason(unknown, /unknown identity: identity\.arms\.B\.effort\.applied/),
    'an unknown applied effort blocks',
  );
  const unobserved = world({
    mutateRow: (row) => {
      if (row.arm === 'B') delete row.observed;
    },
  });
  check(outcomeOf(read(declaration(), unobserved)) === 'blocked', 'evidence that records no identity cannot be attributed');
}

/* -------------------------------------------------------------------------- */
/* Acceptance case 7: degenerate designs                                          */
/* -------------------------------------------------------------------------- */

function checkAcceptance7() {
  // Reference calculation through the whole reader, for a world the reader scores clearly.
  const rows = world();
  const result = read(declaration(), rows);
  const clusterDiff = (metric) =>
    SELECTION_CASES.map((caseId) => {
      const own = (arm) => rows.filter((row) => row.arm === arm && row.caseId === caseId).map((row) => row.metrics[metric]);
      return referenceMean(own('B')) - referenceMean(own('A'));
    });
  const clusterSaving = SELECTION_CASES.map((caseId) => {
    const own = (arm) => rows.filter((row) => row.arm === arm && row.caseId === caseId).map((row) => row.cost.components.target);
    return (1 - 0.2) * referenceMean(own('A')) - referenceMean(own('B'));
  });
  const bounds = result.report.contrast.estimator.bounds;
  const settings = { B: 2000, seed: 424_242, alpha: 0.05 };
  check(
    Math.abs(bounds['quality:recall'].lower - referenceLower(clusterDiff('recall'), settings)) < 1e-12,
    'the recall bound matches the reference',
  );
  check(
    Math.abs(bounds['quality:precision'].lower - referenceLower(clusterDiff('precision'), settings)) < 1e-12,
    'the precision bound matches the reference',
  );
  check(Math.abs(bounds.saving.lower - referenceLower(clusterSaving, settings)) < 1e-12, 'the saving bound matches the reference');
  check(
    Math.abs(bounds['quality:recall'].estimate - referenceMean(clusterDiff('recall'))) < 1e-12,
    'the recall estimate matches the reference',
  );
  check(bounds.saving.estimate > 0 && bounds.saving.lower > 0, 'a cheaper candidate has a positive saving contrast');
  const floorValues = SELECTION_CASES.map(
    (caseId) => referenceMean(rows.filter((row) => row.arm === 'B' && row.caseId === caseId).map((row) => row.metrics.recall)) - 0.5,
  );
  check(
    Math.abs(bounds['floor:recall'].lower - referenceLower(floorValues, settings)) < 1e-12,
    'the absolute floor bound matches the reference',
  );

  // A candidate that costs more has a negative saving bound.
  const dearer = read(declaration(), world({ costB: (i) => 1.4 + 0.1 * i }));
  check(dearer.report.contrast.estimator.bounds.saving.estimate < 0, 'a dearer candidate has a negative saving estimate');
  check(outcomeOf(dearer) === 'inconclusive', 'a dearer candidate does not clear the saving gate');

  // Repetitions do not become clusters.
  const threeRepeats = declaration({
    mutate: (body) => {
      body.design.repeats = 3;
    },
  });
  const thin = read(threeRepeats, world());
  check(thin.report.contrast.pairs.problems.missing.length === 12, 'planned repetitions that are missing are counted as missing pairs');
  check(outcomeOf(thin) === 'blocked', 'missing repetitions block the conclusion');
  check(thin.report.contrast.estimator.clusters === 6, 'repetitions never raise the cluster count');

  // Duplicate and missing pairs.
  const duplicate = world();
  const original = duplicate.find((row) => row.arm === 'B' && row.caseId === 'c2' && row.repetition === 1);
  duplicate.push({
    ...clone(original),
    attemptId: 'dup',
    receipt: { ...original.receipt, workspaceId: 'workspace-dup', artifactSha256: sha('dup') },
    outputSha256: sha('dup'),
    outputText: 'dup',
  });
  const dup = read(declaration(), duplicate);
  check(outcomeOf(dup) === 'blocked' && hasReason(dup, /duplicate scoring attempts: B\/c2\/1/), 'two completed attempts in one slot block');
  const missing = world().filter((row) => !(row.arm === 'B' && row.caseId === 'c5' && row.repetition === 2));
  const gap = read(declaration(), missing);
  check(outcomeOf(gap) === 'blocked' && hasReason(gap, /missing pairs: B\/c5\/2/), 'a missing pair blocks and is named');
  check(gap.report.denominators.arms.B.missingSlots === 1, 'the denominators record the missing slot');
  const failedSlot = world().map((row) =>
    row.arm === 'A' && row.caseId === 'c1' && row.repetition === 1 ? { ...row, status: 'failed', error: 'crash' } : row,
  );
  const failed = read(declaration(), failedSlot);
  check(outcomeOf(failed) === 'blocked', 'a failed attempt leaves its slot incomplete');
  check(
    failed.evidenceIndex.rows.some((row) => row.status === 'failed' && row.error === 'crash'),
    'the failed attempt stays in the evidence index',
  );

  // Blocks that do not match.
  const blockMismatch = world({
    mutateRow: (row, i, repetition) => {
      if (row.arm === 'B' && i === 0 && repetition === 1) row.blockId = 'another-block';
    },
  });
  check(outcomeOf(read(declaration(), blockMismatch)) === 'blocked', 'arms from different pairing blocks do not pair');

  // Rows of another stage are not read as this stage.
  const relabeled = (stage, arm) =>
    world({ stage })
      .filter((row) => row.arm === arm)
      .map((row) => ({
        ...row,
        attemptId: `x-${row.attemptId}`,
        receipt: { ...row.receipt, workspaceId: `x-${row.receipt.workspaceId}` },
      }));
  const wrongStage = read(declaration(), [...world(), ...relabeled('baseline', 'A')]);
  check(
    wrongStage.report.exclusions.filter((entry) => entry.reason === 'wrong-stage').length === 12,
    'rows labeled for another stage are excluded',
  );
  check(outcomeOf(wrongStage) === 'selection-cleared', 'baseline history on the same cases does not disturb the reading');
  const mislabeled = read(declaration(), [
    ...world(),
    ...relabeled('confirmation', 'B').map((row, index) => (index === 0 ? { ...row, counts: { topSeverityMissed: 2 } } : row)),
  ]);
  check(
    outcomeOf(mislabeled) === 'blocked' && hasReason(mislabeled, /candidate attempts belong to no stage this declaration plans/),
    'a candidate attempt that hides under another stage label blocks',
  );

  // Two rows that share an attempt id but disagree cannot be dropped silently.
  const conflicting = world();
  const victim = conflicting.find((row) => row.arm === 'B' && row.caseId === 'c1' && row.repetition === 1);
  conflicting.push({ ...clone(victim), counts: { topSeverityMissed: 1 } });
  const conflict = read(declaration(), conflicting);
  check(
    outcomeOf(conflict) === 'blocked' && hasReason(conflict, /disagree with the first/),
    'two rows that share an attempt id and disagree block',
  );
  check(hasReason(conflict, /critical miss is not verified/), 'a critical miss on a dropped copy is not lost');
  const sameWorkspace = world();
  const twin = clone(sameWorkspace.find((row) => row.arm === 'B' && row.caseId === 'c2' && row.repetition === 2));
  sameWorkspace.push({ ...twin, attemptId: 'twin', metrics: { recall: 0.1, precision: 0.1 } });
  check(outcomeOf(read(declaration(), sameWorkspace)) === 'blocked', 'two attempts that claim one workspace but disagree block');

  // A second completed attempt for one repetition is not another trial.
  const noRows = read(exampleBaseline(), []);
  check(noRows.report.descriptive.groups.length === 0, 'no rows, no groups');
  const twice = experiment.loadRecordedTestDesignRun({ dir: path.join(RAW, 'two-run-before-numeric') }).rows;
  const repeated = [...twice, { ...clone(twice[0]), attemptId: 'repeat-of-first', attempt: 2 }];
  const counted = experiment.readExperiment({ declaration: exampleBaseline(), attempts: repeated });
  const seeded = counted.report.descriptive.groups[0].cases.find((entry) => entry.caseId === twice[0].caseId);
  check(
    seeded.completed === 2 && seeded.extraCompleted.length === 1,
    'a second completed attempt for one repetition is listed as extra and not counted as a trial',
  );

  // Copies change nothing: not the estimates, not the weights.
  const clean = read(declaration(), world());
  const copied = world();
  const extra = [];
  for (const row of copied.filter((entry) => entry.caseId === 'c1')) extra.push({ ...clone(row), attemptId: `${row.attemptId}-copy` });
  const withCopies = read(declaration(), [...copied, ...extra]);
  check(
    JSON.stringify(withCopies.report.contrast.estimator.bounds) === JSON.stringify(clean.report.contrast.estimator.bounds),
    'copied trials do not alter the estimates',
  );
  check(withCopies.report.exclusions.length === extra.length, 'every copy is excluded');

  // All-equal outcomes.
  const equal = read(declaration(), world({ diffs: [0, 0, 0, 0, 0, 0], costB: () => 0.5 }));
  check(outcomeOf(equal) === 'inconclusive', `all-equal contrasts are inconclusive, got ${outcomeOf(equal)}`);
  check(hasReason(equal, /degenerate interval/), 'the reason names the degenerate interval');
  check(equal.report.contrast.estimator.degenerate.length > 0, 'the degenerate contrasts are listed as diagnostic only');

  // One cluster.
  const oneCase = ['c1'];
  const single = read(declaration({ cases: oneCase }), world({ cases: oneCase }), { ledger: selectionLedger(oneCase) });
  check(outcomeOf(single) === 'inconclusive' && hasReason(single, /1 cluster\(s\)/), 'one cluster cannot support a decision');

  // Zero clusters.
  const none = experiment.validateDeclaration(declaration({ cases: [] }));
  check(none.problems.length > 0, 'a declaration with no cases is unusable');

  // Non-finite data.
  const nan = read(
    declaration(),
    world({
      mutateRow: (row, i, repetition) => {
        if (row.arm === 'B' && i === 3 && repetition === 1) row.metrics.recall = Number.NaN;
      },
    }),
  );
  check(outcomeOf(nan) === 'blocked' && hasReason(nan, /non-finite/), 'non-finite data blocks');
  const infinite = read(
    declaration(),
    world({
      mutateRow: (row) => {
        if (row.arm === 'A' && row.caseId === 'c1' && row.repetition === 1) row.cost.components.target = Number.POSITIVE_INFINITY;
      },
    }),
  );
  check(outcomeOf(infinite) !== 'selection-cleared', 'an infinite cost never clears');

  // Unsupported designs stay descriptive.
  const unequal = declaration({
    mutate: (body) => {
      body.scope.clusters[0].weight = 0.5;
      for (const entry of body.scope.clusters.slice(1)) entry.weight = 0.1;
    },
  });
  const weighted = read(unequal, world());
  check(
    outcomeOf(weighted) === 'descriptive-only' && hasReason(weighted, /unequal or stratified/),
    'unequal weights stay descriptive-only',
  );
  check(weighted.report.contrast.estimator.bounds === null, 'no interval is produced for an unsupported design');
  const sharedBuild = read(declaration(), world({ mutateRow: (row, i) => (row.buildId = `build-${Math.floor(i / 2)}`) }));
  check(
    outcomeOf(sharedBuild) === 'descriptive-only' && hasReason(sharedBuild, /share a generated build/),
    'clusters that share a build stay descriptive-only',
  );
  const sharedFlag = declaration({
    mutate: (body) => {
      body.design.sharedBuilds = true;
    },
  });
  check(outcomeOf(read(sharedFlag, world())) === 'descriptive-only', 'a declared shared build stays descriptive-only');

  // Two cases that share a source form one independent cluster.
  const sharedCluster = declaration({
    mutate: (body) => {
      body.scope.clusters[1].clusterId = 'c1';
      for (const entry of body.scope.clusters) entry.weight = entry.clusterId === 'c1' ? 0.1 : 0.2;
    },
  });
  const grouped = read(sharedCluster, world());
  check(grouped.report.contrast.estimator.clusters === 5, 'two cases sharing a source count as one independent cluster');
  check(
    outcomeOf(grouped) === 'selection-cleared',
    `a shared cluster with equal cluster weights is supported, got ${outcomeOf(grouped)}: ${reasonsOf(grouped)}`,
  );
  const clusterContrast = ['c1', 'c3', 'c4', 'c5', 'c6'].map((id) => {
    const members = id === 'c1' ? ['c1', 'c2'] : [id];
    const perCase = members.map((caseId) => {
      const own = (arm) =>
        world()
          .filter((row) => row.arm === arm && row.caseId === caseId)
          .map((row) => row.metrics.recall);
      return referenceMean(own('B')) - referenceMean(own('A'));
    });
    return referenceMean(perCase);
  });
  check(
    Math.abs(
      grouped.report.contrast.estimator.bounds['quality:recall'].lower -
        referenceLower(clusterContrast, { B: 2000, seed: 424_242, alpha: 0.05 }),
    ) < 1e-12,
    'a shared cluster is averaged within itself before it is resampled',
  );
  const perCaseWeights = declaration({
    mutate: (body) => {
      body.scope.clusters[1].clusterId = 'c1';
    },
  });
  const perCase = read(perCaseWeights, world());
  check(
    outcomeOf(perCase) === 'descriptive-only',
    'a shared cluster that carries two cases of weight against one is an unequal weighting and stays descriptive',
  );
  const lopsided = declaration({
    mutate: (body) => {
      body.scope.clusters[1].clusterId = 'c1';
      body.scope.clusters[0].weight = 0.15;
      body.scope.clusters[1].weight = 0.05;
      for (const entry of body.scope.clusters.slice(2)) entry.weight = 0.2;
    },
  });
  check(
    hasReason(read(lopsided, world()), /unequal case weights inside a cluster/),
    'unequal case weights inside one cluster stay descriptive',
  );

  // A bootstrap that fails its reference fixtures cannot support a decision.
  const uncalibrated = read(declaration(), world(), {
    bootstrap: (input) => {
      const out = experiment.pairedClusterBootstrap(input);
      for (const name of Object.keys(out)) out[name].lower += 100;
      return out;
    },
  });
  check(outcomeOf(uncalibrated) === 'inconclusive', 'a bootstrap that fails calibration leaves adoption inconclusive');
  check(hasReason(uncalibrated, /reference fixtures/), 'the reason says calibration failed');
  check(uncalibrated.report.contrast.estimator.calibration.passed === false, 'the report records the failed calibration');

  // Invalid analysis settings.
  const badSeed = declaration({
    mutate: (body) => {
      body.design.analysis.seed = -1;
    },
  });
  check(outcomeOf(read(badSeed, world())) === 'blocked', 'an unfrozen analysis setting blocks');
}

/* -------------------------------------------------------------------------- */
/* Acceptance case 8: usage and cost                                              */
/* -------------------------------------------------------------------------- */

function checkAcceptance8() {
  const pricing = { currency: 'USD', perMillionTokens: { inputTokens: 3, outputTokens: 15, cacheReadTokens: 0.3, cacheWriteTokens: 3.75 } };
  const usage = { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const priced = experiment.priceUsage(usage, pricing);
  check(
    priced && Math.abs(priced.amount - (1000 * 3 + 500 * 15) / 1e6) < 1e-15,
    'complete usage over a complete price sheet becomes money',
  );
  check(experiment.priceUsage({ ...usage, cacheReadTokens: null }, pricing) === null, 'a null token count never becomes zero dollars');
  check(
    experiment.priceUsage({ inputTokens: 1000, outputTokens: 500 }, pricing) === null,
    'absent token categories never become zero dollars',
  );
  check(
    experiment.priceUsage(usage, { currency: 'USD', perMillionTokens: { inputTokens: 3, outputTokens: 15 } }) === null,
    'an incomplete price sheet prices nothing',
  );
  check(experiment.priceUsage(null, pricing) === null, 'null usage prices nothing');
  check(experiment.priceUsage({ ...usage, outputTokens: Number.NaN }, pricing) === null, 'a non-finite token count prices nothing');
  check(experiment.priceUsage({ ...usage, inputTokens: 0, outputTokens: 0 }, pricing)?.amount === 0, 'a recorded zero is a known zero');

  // Unknown cost stays unknown in the totals.
  const unknownCost = world({
    mutateRow: (row, i, repetition) => {
      if (row.arm === 'B' && i === 0 && repetition === 1) row.cost = null;
    },
  });
  const result = read(declaration(), unknownCost);
  check(result.report.cost.taskExecution.total === null, 'one unknown cost makes the task-execution total unknown');
  check(result.report.cost.experimentTotal.total === null, 'one unknown cost makes the experiment total unknown');
  check(result.report.cost.taskExecution.unknownComponents > 0, 'the report counts the unknown components');
  check(
    outcomeOf(result) === 'blocked' && hasReason(result, /required cost is unknown/),
    'a cost objective with an unknown cost is blocked, not completed from an average',
  );

  // Missing component is unknown, not zero.
  const noTools = world({
    mutateRow: (row) => {
      delete row.cost.components.tools;
    },
  });
  check(read(declaration(), noTools).report.cost.taskExecution.total === null, 'a component that is not recorded is not a zero');
  const zeroTools = read(declaration(), world());
  check(zeroTools.report.cost.taskExecution.total !== null, 'a recorded zero component is a known zero');

  // Tokens alone: no money.
  const tokensOnly = world({
    mutateRow: (row) => {
      row.cost = { currency: 'USD', components: { tools: 0 } };
      row.usage = clone(usage);
    },
  });
  const tokens = read(declaration(), tokensOnly);
  check(
    tokens.report.cost.taskExecution.total === null && outcomeOf(tokens) === 'blocked',
    'tokens without a price sheet never become dollars',
  );
  const priceSheet = declaration({
    mutate: (body) => {
      body.resources.pricing = pricing;
    },
  });
  const sameTokens = read(priceSheet, tokensOnly);
  check(sameTokens.report.cost.taskExecution.total !== null, 'the same tokens become money through a complete price sheet');
  check(sameTokens.report.cost.derivedFromUsage.length > 0, 'a derived cost says it was derived');
  check(
    outcomeOf(sameTokens) === 'inconclusive' ||
      outcomeOf(sameTokens) === 'selection-cleared' ||
      outcomeOf(sameTokens) === 'descriptive-only',
    'priced usage can reach a verdict but is not itself one',
  );
  const incompleteUsage = world({
    mutateRow: (row) => {
      row.cost = null;
      row.usage = { ...clone(usage), cacheWriteTokens: null };
    },
  });
  check(
    read(priceSheet, incompleteUsage).report.cost.taskExecution.total === null,
    'usage with a null category prices nothing even with a price sheet',
  );

  // Retries and cancellations stay in the totals.
  const retried = world();
  const base = retried.find((row) => row.arm === 'B' && row.caseId === 'c1' && row.repetition === 1);
  retried.push(
    {
      ...clone(base),
      attemptId: 'canceled',
      attempt: 2,
      status: 'canceled',
      receipt: { ...base.receipt, workspaceId: 'ws-canceled', artifactSha256: sha('canceled') },
      outputSha256: sha('canceled'),
      outputText: 'canceled',
      cost: { currency: 'USD', components: { target: 7, tools: 0 } },
    },
    {
      ...clone(base),
      attemptId: 'failed',
      attempt: 3,
      status: 'failed',
      error: 'timeout upstream',
      receipt: { ...base.receipt, workspaceId: 'ws-failed', artifactSha256: sha('failed') },
      outputSha256: sha('failed'),
      outputText: 'failed',
      cost: { currency: 'USD', components: { target: 11, tools: 0 } },
    },
  );
  const withBase = read(declaration(), world());
  const withRetries = read(
    declaration({
      mutate: (body) => {
        body.design.maxAttempts = 3;
      },
    }),
    retried,
  );
  check(
    Math.abs(withRetries.report.cost.taskExecution.total - (withBase.report.cost.taskExecution.total + 18)) < 1e-9,
    'canceled and failed attempts stay in the task-execution total',
  );
  check(
    withRetries.evidenceIndex.rows.some((row) => row.status === 'canceled') &&
      withRetries.evidenceIndex.rows.some((row) => row.status === 'failed'),
    'they stay in the evidence index',
  );
  check(
    withRetries.report.denominators.arms.B.canceled === 1 && withRetries.report.denominators.arms.B.failed === 1,
    'the denominators count them',
  );
  check(
    withRetries.report.contrast.estimator.bounds.saving.estimate < withBase.report.contrast.estimator.bounds.saving.estimate,
    'retry and cancellation charges lower the saving contrast',
  );
  const perCluster = withRetries.report.contrast.arms.B.taskExecutionCost.total;
  check(
    Math.abs(perCluster - withBase.report.contrast.arms.B.taskExecutionCost.total - 18) < 1e-9,
    'the arm cost includes the retry charges',
  );
  const unknownRetry = world();
  unknownRetry.push({
    ...clone(unknownRetry.find((row) => row.arm === 'B')),
    attemptId: 'unknown-cancel',
    attempt: 2,
    status: 'canceled',
    receipt: null,
    cost: null,
  });
  const retryUnknown = read(
    declaration({
      mutate: (body) => {
        body.design.maxAttempts = 3;
      },
    }),
    unknownRetry,
  );
  check(retryUnknown.report.cost.experimentTotal.total === null, 'a canceled attempt with unknown cost makes the experiment total unknown');

  // Experiment overhead has to be declared.
  const overheadUndeclared = declaration({
    mutate: (body) => {
      delete body.resources.overhead;
    },
  });
  check(
    read(overheadUndeclared, world()).report.cost.experimentTotal.total === null,
    'an undeclared overhead leaves the experiment total unknown',
  );
  const overheadDeclared = declaration({
    mutate: (body) => {
      body.resources.overhead = [{ name: 'preflight', amount: 2.5, currency: 'USD' }];
    },
  });
  const plain = read(declaration(), world()).report.cost.experimentTotal.total;
  check(
    Math.abs(read(overheadDeclared, world()).report.cost.experimentTotal.total - (plain + 2.5)) < 1e-9,
    'declared overhead enters the experiment total',
  );
  const unknownOverhead = declaration({
    mutate: (body) => {
      body.resources.overhead = [{ name: 'calibration', amount: null, currency: 'USD' }];
    },
  });
  check(read(unknownOverhead, world()).report.cost.experimentTotal.total === null, 'an overhead of unknown amount keeps the total unknown');

  // A cost with no currency is not a cost in the other arm's currency.
  const noCurrency = world({
    mutateRow: (row) => {
      if (row.arm === 'B') delete row.cost.currency;
    },
  });
  const currencyless = read(declaration(), noCurrency);
  check(
    outcomeOf(currencyless) === 'blocked' && currencyless.report.cost.taskExecution.total === null,
    'a cost without a currency stays unknown',
  );

  // Charges for a repetition the schedule does not plan stay in view.
  const unplanned = world();
  unplanned.push(attempt({ arm: 'B', caseId: 'c1', repetition: 3, metrics: { recall: 0.9, precision: 0.8 }, cost: 100 }));
  const extraRepetition = read(declaration(), unplanned);
  check(
    outcomeOf(extraRepetition) === 'blocked' && hasReason(extraRepetition, /repetitions the schedule does not plan: B\/c1\/3/),
    'an unplanned repetition blocks',
  );
  check(
    extraRepetition.report.cost.taskExecution.total > withBase.report.cost.taskExecution.total + 99,
    'its charge is in the cost totals',
  );

  // Mixed currency.
  const mixed = world({
    mutateRow: (row, i, repetition) => {
      if (row.arm === 'B' && i === 0 && repetition === 1) row.cost.currency = 'EUR';
    },
  });
  const mixedResult = read(declaration(), mixed);
  check(outcomeOf(mixedResult) === 'blocked' && hasReason(mixedResult, /more than one currency/), 'mixed currencies block rather than add');

  // A cost objective without any cost at all is unavailable.
  const none = world({
    mutateRow: (row) => {
      row.cost = null;
    },
  });
  check(outcomeOf(read(declaration(), none)) === 'blocked', 'monetary adoption is unavailable without cost measurement');
  // A quality objective that declares no saving gate does not need cost.
  const quality = declaration({ objective: 'quality' });
  check(
    outcomeOf(read(quality, world({ diffs: [0.12, 0.13, 0.1, 0.11, 0.12, 0.13], mutateRow: (row) => (row.cost = null) }))) !== 'blocked',
    'a quality objective does not need cost to be read',
  );
}

/* -------------------------------------------------------------------------- */
/* Acceptance case 9: immutability, provenance, native verdicts                   */
/* -------------------------------------------------------------------------- */

async function checkAcceptance9() {
  // Frozen inputs: the reader never writes to what it is given.
  const rows = deepFreeze(world());
  const frozenDeclaration = deepFreeze(declaration());
  const before = JSON.stringify([frozenDeclaration, rows]);
  let threw = null;
  let result;
  try {
    result = read(frozenDeclaration, rows);
  } catch (error) {
    threw = error;
  }
  check(threw === null, `the reader accepts deeply frozen input, ${threw?.message ?? ''}`);
  check(JSON.stringify([frozenDeclaration, rows]) === before, 'the reader leaves its input unchanged');

  // Every recorded field of every attempt survives verbatim into the index.
  const rich = deepFreeze(
    world({
      mutateRow: (row, i) => {
        row.provenance = { capturedAt: '2026-10-14T00:00:00.000Z', originalWorkspace: `/tmp/ws-${row.attemptId}`, note: `case ${i}` };
        row.usage = { inputTokens: 10 + i, outputTokens: 20 + i, cacheReadTokens: 0, cacheWriteTokens: null };
        row.error = null;
        row.retryOf = null;
        row.critical = [];
      },
    }),
  );
  const richResult = read(frozenDeclaration, rich);
  const indexed = new Map(richResult.evidenceIndex.rows.map((row) => [row.attemptId, row]));
  const FIELDS = [
    'stage',
    'arm',
    'caseId',
    'clusterId',
    'blockId',
    'repetition',
    'runId',
    'attemptId',
    'retryOf',
    'receipt',
    'inputSha256',
    'outputSha256',
    'native',
    'status',
    'error',
    'metrics',
    'counts',
    'usage',
    'cost',
    'latency',
    'provenance',
  ];
  const mismatches = [];
  for (const input of rich) {
    const out = indexed.get(input.attemptId);
    for (const field of FIELDS) {
      if (independentCanonical(out?.[field] ?? null) !== independentCanonical(input[field] ?? null))
        mismatches.push(`${input.attemptId}.${field}`);
    }
    if (out && (out.attempt !== input.attempt || independentCanonical(out.criticalMisses) !== independentCanonical(input.critical))) {
      mismatches.push(`${input.attemptId}.attempt or critical`);
    }
  }
  check(mismatches.length === 0, `every recorded field survives into the index: ${mismatches.slice(0, 5).join(', ')}`);
  check(
    rich.every((input) => indexed.get(input.attemptId)?.origin === 'fresh' && !('outputText' in indexed.get(input.attemptId))),
    'the index carries hashes, never the saved document text',
  );
  const byId = new Map(result.evidenceIndex.rows.map((row) => [row.attemptId, row]));
  check(
    rows.every((input) => independentCanonical(byId.get(input.attemptId)?.native) === independentCanonical(input.native)),
    'native references stay as recorded',
  );
  check(result.evidenceIndex.rows.length === rows.length, 'the index holds one row per attempt');
  check(result.evidenceIndex.declarationDigest === result.report.declaration.digest, 'the index names the declaration it was read under');
  check(result.report.nativeVerdict === null && result.report.advisory === true, 'the report is advisory and carries no native verdict');
  check(result.report.schemaVersion && result.report.analysisVersion, 'the report carries schema and analysis versions');
  check(result.report.denominators.reconciles, 'the denominators reconcile with the index');
  check(result.report.evidenceIndex.digest.startsWith('sha256:'), 'the report links to the evidence index by digest');

  // Aggregates link to original records.
  const groups = result.report.descriptive.groups;
  check(
    groups.every((group) => group.cases.every((entry) => entry.sources.length > 0)),
    'every per-case aggregate lists the attempts it came from',
  );

  // A corrected scorer produces a separate replay; the native record is untouched.
  const nativeSignatures = rows.filter((row) => row.arm === 'A').map((row) => row.native.signature);
  const corrected = read(frozenDeclaration, rows, { replay: (text) => ({ signature: `corrected:${text}` }) });
  const replay = corrected.report.descriptive.replay.results;
  check(
    replay.length === nativeSignatures.length && replay.every((entry) => entry.nativeAgreement === 'differs'),
    'a corrected scorer differs from the native record',
  );
  check(
    corrected.evidenceIndex.rows.filter((row) => row.arm === 'A').every((row) => nativeSignatures.includes(row.native.signature)),
    'the native signatures in the index are the recorded ones, not the replayed ones',
  );
  check(
    replay.every((entry) => /separate/.test(entry.note)),
    'a replay result says it is separate from the native record',
  );
  const fresh = read(frozenDeclaration, rows, { replay: (text) => ({ signature: `corrected:${text}` }) });
  check(JSON.stringify(fresh.report) === JSON.stringify(corrected.report), 'the same input reads to the same report');

  // A declared native gate stays binding, and an undeclared one does not appear from nowhere.
  const stable = declaration({
    mutate: (body) => {
      body.gates.native = { requireStableSignatures: true };
    },
  });
  const unstableRows = world();
  const unstableResult = read(stable, unstableRows);
  check(
    outcomeOf(unstableResult) === 'rejected' && hasReason(unstableResult, /native gate is red: native stability signatures differ/),
    'a declared stability gate that is red rejects',
  );
  check(unstableResult.report.contrast.nativeRed.length === SELECTION_CASES.length, 'every unstable case is listed');
  const steady = world({
    mutateRow: (row) => {
      row.native.signature = `steady-${row.arm}-${row.caseId}`;
    },
  });
  check(outcomeOf(read(stable, steady)) === 'selection-cleared', 'identical signatures across repetitions satisfy the stability gate');
  check(outcomeOf(read(declaration(), unstableRows)) === 'selection-cleared', 'without the declaration, unstable signatures do not reject');
  const qualified = declaration({
    mutate: (body) => {
      body.gates.native = { requireQualification: true };
    },
  });
  const failedQualification = world({
    mutateRow: (row, i, repetition) => {
      if (row.arm === 'B' && i === 4 && repetition === 1) row.native.qualification = 'failed';
    },
  });
  check(outcomeOf(read(qualified, failedQualification)) === 'rejected', 'a declared qualification gate that failed rejects');
  check(outcomeOf(read(qualified, world())) === 'selection-cleared', 'a passed qualification satisfies the gate');
  const missingQualification = world({
    mutateRow: (row) => {
      delete row.native.qualification;
    },
  });
  check(
    outcomeOf(read(qualified, missingQualification)) === 'rejected',
    'a qualification that was never recorded does not satisfy the gate',
  );

  // The repository-backed capture.
  await checkRecordedRuns();
}

/* -------------------------------------------------------------------------- */
/* Repository-backed fixtures                                                     */
/* -------------------------------------------------------------------------- */

function exampleBaseline() {
  return JSON.parse(fs.readFileSync(path.join(EXAMPLES, 'example-baseline-experiment.json'), 'utf8'));
}

async function checkRecordedRuns() {
  const groundTruth = await loadGroundTruth();
  const replay = experiment.testDesignReplay({ groundTruth });
  const baseline = exampleBaseline();
  const loaded = {};
  for (const name of ['two-run-before-numeric', 'two-run-after-numeric']) {
    loaded[name] = experiment.loadRecordedTestDesignRun({ dir: path.join(RAW, name) });
  }
  const before = loaded['two-run-before-numeric'];
  const after = loaded['two-run-after-numeric'];

  // What the captures actually contain.
  for (const [name, run] of Object.entries(loaded)) {
    check(run.integrity.problems.length === 0 && run.integrity.checked >= 19, `${name}: the manifest hashes match the bytes on disk`);
    check(run.rows.length === 4, `${name}: two cases at two repetitions each`);
    check(run.source.repetitions.expected === 4 && run.source.repetitions.completed === 4, `${name}: every declared repetition completed`);
    check(
      run.source.usage === null && run.rows.every((row) => row.usage === null && row.cost === null),
      `${name}: no usage or cost telemetry was recorded`,
    );
    check(
      run.rows.every((row) => row.provenance.mode === 'live' && row.receipt === null),
      `${name}: live captures with a recorded workspace but no receipt`,
    );
    check(
      run.rows.every((row) => row.observed.arm.model.requested === 'gpt-6.1-sol' && row.observed.arm.model.resolved === null),
      `${name}: the requested model is recorded and the resolved one is not`,
    );
    check(run.source.failureClass === 'quality', `${name}: the native run failed on quality`);
    check(run.source.failures.includes('2 unstable case(s)'), `${name}: the native run reports two unstable cases`);
  }
  check(before.source.repository.commit.startsWith('2a90c6ba'), 'the earlier capture is pinned to 2a90c6ba');
  check(after.source.repository.commit.startsWith('c631fcec'), 'the later capture is pinned to c631fcec');
  check(
    before.source.repository.commit !== after.source.repository.commit,
    'the two captures come from different source revisions, so they are historical captures of different code',
  );

  // The rows carry the saved document bytes, and they are the documents the manifest hashes.
  for (const row of before.rows) {
    const folder = path.join(RAW, 'two-run-before-numeric', 'cases', `${row.caseId}-run-${row.repetition}`);
    const file = fs.readdirSync(folder).find((name) => /^test-design-epic-\d+\.md$/.test(name));
    check(
      fs.readFileSync(path.join(folder, file), 'utf8') === row.outputText,
      `${row.attemptId}: the observation holds the same bytes as the saved document`,
    );
  }

  // The example contrast gates only on metrics that every recorded case defines.
  const contrastExample = JSON.parse(fs.readFileSync(path.join(EXAMPLES, 'example-contrast-experiment.json'), 'utf8'));
  for (const [name, run] of Object.entries(loaded)) {
    for (const metric of [...Object.keys(contrastExample.gates.quality), ...Object.keys(contrastExample.gates.floors)]) {
      check(
        run.rows.every((row) => Number.isFinite(row.metrics[metric])),
        `${name}: ${metric}, which the example contrast gates on, is defined for every recorded attempt`,
      );
    }
  }

  // Descriptive repeatability of each capture.
  const readings = {};
  for (const [name, run] of Object.entries(loaded)) {
    const result = experiment.readExperiment({ declaration: baseline, attempts: run.rows, replay });
    readings[name] = result;
    const descriptive = result.report.descriptive;
    check(
      descriptive.freshIndependentTrials === 0 && descriptive.importedHistoricalTrials === 4,
      `${name}: four imported historical trials and no fresh ones`,
    );
    check(descriptive.mixedIdentity === false && descriptive.groups.length === 1, `${name}: one observed identity`);
    const cases = descriptive.groups[0].cases;
    check(
      cases.length === 2 && cases.every((entry) => entry.completed === 2 && entry.planned === 2),
      `${name}: two completed repetitions for each case`,
    );
    check(
      cases.every((entry) => entry.stability.stable === false && entry.stability.distinct === 2),
      `${name}: both cases are unstable under the native signature`,
    );
    check(
      cases.every((entry) => entry.stability.differingComponents.length > 0),
      `${name}: the differing signature components are named`,
    );
    check(
      cases.every((entry) => entry.criticalMisses.length === 0 && entry.importedHistorical === 2 && entry.freshReceipted === 0),
      `${name}: the recorded attempts carry no critical miss and no receipt`,
    );
    check(result.report.contrast.status === 'not-requested', `${name}: no candidate, so only the descriptive reading`);
    check(result.report.cost.experimentTotal.total === null, `${name}: the experiment cost is unknown`);
    check(
      result.report.sourceLimitations.some((line) => /imported historical captures/.test(line)) &&
        result.report.sourceLimitations.some((line) => /no usage or cost telemetry/.test(line)),
      `${name}: the limits of the evidence are stated`,
    );
    check(descriptive.judge.status === 'not-applicable', `${name}: judge variance is not applicable to a deterministic scorer`);
    const replays = descriptive.replay.results;
    check(
      replays.length === 4 && replays.every((entry) => entry.status === 'replayed' && entry.deterministic),
      `${name}: the scorer replays every saved document identically twice`,
    );
    check(
      result.evidenceIndex.rows.every((row) => row.origin === 'imported-historical' && row.native.ref.startsWith(name)),
      `${name}: every index row is imported historical evidence with a native reference`,
    );
    check(result.report.denominators.reconciles, `${name}: the denominators reconcile`);
  }

  // Two runs of one identity are two sets of trials, even though both number their repetitions from one.
  const second = before.rows.map((row, index) => ({
    ...row,
    runId: 'second-run',
    attemptId: `second-${row.attemptId}`,
    native: { ...row.native, signature: index === 0 ? `${row.native.signature} changed` : row.native.signature },
  }));
  const twoRuns = experiment.readExperiment({ declaration: baseline, attempts: [...before.rows, ...second] });
  const seededCase = twoRuns.report.descriptive.groups[0].cases.find((entry) => entry.caseId === before.rows[0].caseId);
  check(seededCase.completed === 4 && seededCase.extraCompleted.length === 0, 'repetitions of two runs are all counted');
  check(seededCase.stability.distinct === 3, 'a signature that differs in the second run is seen');

  // The unstable seeded case differs in the number of scored risks between its two repetitions.
  const rowsOf = (run, caseId) => run.rows.filter((row) => row.caseId === caseId).map((row) => JSON.parse(row.native.signature)[2].rows);
  check(
    new Set(rowsOf(before, 'seeded-offline-order-capture')).size === 2,
    'before: the seeded case registers a different number of risks on each repetition',
  );
  check(
    new Set(rowsOf(after, 'seeded-offline-order-capture')).size === 2,
    'after: the seeded case still registers a different number of risks on each repetition',
  );

  // What the recordings contain, value by value.
  const seededId = 'seeded-offline-order-capture';
  const cleanId = 'clean-last-sync-indicator';
  const caseOf = (name, id) => readings[name].report.descriptive.groups[0].cases.find((entry) => entry.caseId === id);
  const beforeSeeded = caseOf('two-run-before-numeric', seededId);
  const beforeClean = caseOf('two-run-before-numeric', cleanId);
  const afterSeeded = caseOf('two-run-after-numeric', seededId);
  const afterClean = caseOf('two-run-after-numeric', cleanId);
  check(beforeSeeded.successes === 2 && beforeSeeded.successFraction === 1, 'before: both seeded repetitions meet the success rule');
  check(beforeClean.successes === 1 && beforeClean.successFraction === 0.5, 'before: one of two clean repetitions meets the success rule');
  check(
    JSON.stringify(beforeClean.metrics.scaleComplianceAccuracy) ===
      JSON.stringify({ n: 2, unmeasurable: 0, min: 0, max: 1, range: 1, mean: 0.5 }),
    'before: the clean case scale compliance is 0 on one repetition and 1 on the other',
  );
  check(
    beforeSeeded.metrics.groundedRiskRecall.mean === 1 && beforeSeeded.metrics.riskPrecision.range === 0,
    'before: the seeded case recalls every material risk with full precision on both repetitions',
  );
  check(
    beforeSeeded.stability.differingComponents.join('+') === 'shape+links+coverageChecks',
    'before: the seeded signatures differ in shape, links and coverage',
  );
  check(
    beforeClean.stability.differingComponents.join('+') === 'shape+shapeFailures',
    'before: the clean signatures differ in shape and shape failures',
  );
  check(
    afterSeeded.successes === 2 && afterSeeded.successFraction === 1,
    'after: both seeded repetitions meet the success rule at the recall floor',
  );
  check(
    afterSeeded.metrics.groundedRiskRecall.min === 0.8 && afterSeeded.metrics.groundedRiskRecall.max === 0.8,
    'after: the seeded case recalls 0.8 of its material risks on both repetitions, exactly at the floor',
  );
  check(
    afterClean.successes === 2 && afterClean.metrics.scaleComplianceAccuracy.mean === 1,
    'after: both clean repetitions meet the success rule',
  );
  check(
    afterSeeded.stability.differingComponents.join('+') === 'shape+links+grounding+coverageChecks+orderingChecks',
    'after: the seeded signatures differ in shape, links, grounding, coverage and ordering',
  );
  check(afterClean.stability.differingComponents.join('+') === 'shape+links', 'after: the clean signatures differ in shape and links');
  const naOf = (run, id) => run.rows.filter((row) => row.caseId === id).map((row) => row.notApplicable.join('|'));
  check(
    naOf(before, seededId).every((list) => list === ''),
    'before: no seeded metric is undefined',
  );
  check(
    naOf(before, cleanId).join(',') ===
      'groundedRiskRecall|priorityOrderingAccuracy|coverageMappingAccuracy,groundedRiskRecall|scoreArithmeticAccuracy|priorityOrderingAccuracy|coverageMappingAccuracy',
    'before: the clean case leaves recall, coverage and ordering undefined, and arithmetic on its second repetition',
  );
  check(
    naOf(after, cleanId).every((list) => list === 'groundedRiskRecall|priorityOrderingAccuracy|coverageMappingAccuracy'),
    'after: the clean case leaves recall, coverage and ordering undefined on both repetitions',
  );
  check(
    before.rows.every((row) => Object.values(row.counts).every((count) => count === 0)) &&
      after.rows.every((row) => Object.values(row.counts).every((count) => count === 0)),
    'every recorded count of critical findings is zero',
  );
  for (const [run, capturedAt, workspace] of [
    [before, '2026-10-14T00:11:42.240Z', 'tea-test-design-eval-w17Dsb'],
    [after, '2026-10-14T00:41:46.951Z', 'tea-test-design-eval-iWMFbG'],
  ]) {
    const provenance = run.rows[0].provenance;
    check(
      provenance.capturedAt === capturedAt &&
        provenance.originalWorkspace.endsWith(workspace) &&
        provenance.agent === 'codex' &&
        provenance.mode === 'live',
      'the first attempt keeps its recorded capture time, workspace and agent',
    );
  }

  // Replay under the current scorer, kept apart from the native record.
  const afterReplay = readings['two-run-after-numeric'].report.descriptive.replay.results;
  const beforeReplay = readings['two-run-before-numeric'].report.descriptive.replay.results;
  check(
    beforeReplay.every((entry) => entry.nativeAgreement === 'match'),
    'before: the current scorer reproduces the recorded signatures',
  );
  check(
    afterReplay.filter((entry) => entry.caseId === seededId).every((entry) => entry.nativeAgreement === 'differs') &&
      afterReplay.filter((entry) => entry.caseId === cleanId).every((entry) => entry.nativeAgreement === 'match'),
    'after: the current scorer differs from the recorded signature on both seeded documents and matches on both clean ones, which is reported as a separate replay',
  );
  check(
    readings['two-run-after-numeric'].evidenceIndex.rows.every(
      (row) => row.native.signature === after.rows.find((source) => source.attemptId === row.attemptId).native.signature,
    ),
    'after: the recorded native signatures are unchanged by the replay',
  );

  // The strict stability gate stays red: nothing here relaxes maxUnstableCases.
  check(THRESHOLDS.maxUnstableCases === 0, 'the strict stability threshold is unchanged');
  for (const name of Object.keys(loaded)) {
    check(
      loaded[name].source.failures.some((failure) => /unstable case/.test(failure)),
      `${name}: the unstable-case failure stays on the record`,
    );
  }

  // Mixing two captures keeps their identities apart.
  const mixed = experiment.readExperiment({ declaration: baseline, attempts: [...before.rows, ...after.rows], replay });
  check(
    mixed.report.descriptive.mixedIdentity === true && mixed.report.descriptive.groups.length === 2,
    'rows from two source revisions are never pooled',
  );

  // The captures cannot serve as a paired contrast.
  const contrast = declaration({
    mutate: (body) => {
      body.scope.memberships = {
        development: ['seeded-offline-order-capture', 'clean-last-sync-indicator'],
        validation: [],
        confirmation: [],
      };
      body.scope.clusters = [
        { caseId: 'seeded-offline-order-capture', clusterId: 'seeded-offline-order-capture', weight: 0.5 },
        { caseId: 'clean-last-sync-indicator', clusterId: 'clean-last-sync-indicator', weight: 0.5 },
      ];
      body.gates.quality = { groundedRiskRecall: { maxLoss: 0.1 } };
      body.gates.floors = {};
    },
  });
  const selectionRows = (name) => experiment.loadRecordedTestDesignRun({ dir: path.join(RAW, name), stage: 'selection' }).rows;
  const asB = selectionRows('two-run-after-numeric').map((row) => ({ ...row, arm: 'B', attemptId: `B-${row.attemptId}` }));
  const recorded = experiment.readExperiment({
    declaration: contrast,
    attempts: [...selectionRows('two-run-before-numeric'), ...asB],
    ledger: [],
    replay,
  });
  check(
    !['recommend', 'selection-cleared'].includes(outcomeOf(recorded)),
    `historical captures never support adoption, got ${outcomeOf(recorded)}`,
  );
  check(outcomeOf(recorded) === 'new-baseline-required', 'historical captures from different source revisions require a new baseline');

  // Tampering with a saved document is caught by the manifest check.
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-experiment-'));
  try {
    fs.cpSync(path.join(RAW, 'two-run-before-numeric'), copy, { recursive: true });
    const target = path.join(copy, 'cases', 'clean-last-sync-indicator-run-1', 'test-design-epic-9.md');
    fs.appendFileSync(target, '\nan edit\n');
    const tampered = experiment.loadRecordedTestDesignRun({ dir: copy });
    check(
      tampered.integrity.problems.some((problem) => problem.includes('clean-last-sync-indicator-run-1/test-design-epic-9.md')),
      'an edited saved document fails the manifest check',
    );
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
  }
}

/* -------------------------------------------------------------------------- */
/* Acceptance case 10: exposure and no application                                  */
/* -------------------------------------------------------------------------- */

function checkAcceptance10() {
  // The chain detects edits.
  const ledger = selectionLedger();
  check(experiment.verifyLedger(ledger).ok, 'an untouched ledger verifies');
  const removed = ledger.filter((_, index) => index !== 2);
  check(!experiment.verifyLedger(removed).ok, 'removing an exposure entry breaks the chain');
  const edited = ledger.map((entry, index) => (index === 1 ? { ...entry, caseId: 'other' } : entry));
  check(!experiment.verifyLedger(edited).ok, 'editing an exposure entry breaks the chain');
  const reordered = [ledger[1], ledger[0], ...ledger.slice(2)];
  check(!experiment.verifyLedger(reordered).ok, 'reordering entries breaks the chain');
  check(
    !experiment.verifyLedger(ledger.slice(0, 3), [{ head: ledger[5].hash, length: 6 }]).ok,
    'a ledger shorter than a pinned head is refused',
  );
  check(experiment.verifyLedger(ledger, [{ head: ledger[2].hash, length: 3 }]).ok, 'a pinned earlier head is still in the longer ledger');
  check(!experiment.verifyLedger(ledger, [{ head: sha('forged'), length: 3 }]).ok, 'a forged pinned head is refused');

  // Selection: every case's exposure must be recorded; tampering blocks.
  check(outcomeOf(read(declaration(), world(), { ledger: removed })) === 'blocked', 'a selection ledger with a removed entry blocks');
  check(outcomeOf(read(declaration(), world(), { ledger: null })) === 'blocked', 'selection without a ledger blocks');
  check(
    outcomeOf(read(declaration(), world(), { ledger: selectionLedger(['c1']) })) === 'blocked',
    'a selection case whose exposure is unrecorded blocks',
  );

  // Resume cannot shorten the record.
  const head = { ledger: { head: ledger.at(-1).hash, length: ledger.length } };
  check(
    outcomeOf(read(declaration(), world(), { resume: head })) === 'selection-cleared',
    'a resume that presents the whole ledger continues',
  );
  const shortened = selectionLedger(SELECTION_CASES.slice(0, 3));
  const resumed = read(declaration(), world(), { ledger: shortened, resume: head });
  check(
    outcomeOf(resumed) === 'blocked' && hasReason(resumed, /pinned head/),
    'a resumed run cannot clear exposure by presenting a shorter ledger',
  );
  const frozenPin = declaration({
    mutate: (body) => {
      body.exposure = { ledgerHeadAtFreeze: { head: ledger[3].hash, length: 4 } };
    },
  });
  check(outcomeOf(read(frozenPin, world())) === 'selection-cleared', 'a ledger that extends the head pinned in the declaration continues');
  check(
    outcomeOf(read(frozenPin, world(), { ledger: ledger.slice(0, 2) })) === 'blocked',
    'a ledger cut below the head pinned in the declaration blocks',
  );

  // Confirmation.
  const confirm = readConfirmation(confirmationWorld());
  check(outcomeOf(confirm) === 'recommend', `a clean confirmation recommends, got ${outcomeOf(confirm)}: ${reasonsOf(confirm)}`);
  check(
    confirm.report.contrast.decision.advisory && confirm.report.contrast.decision.nativeVerdict === null,
    'the recommendation is advisory with no native verdict',
  );
  check(selectionOnly(read(declaration(), world())) === 'selection-cleared', 'the same evidence during selection only clears selection');

  // A confirmation case that was exposed during selection is not untouched.
  let exposed = confirmationLedger(CONFIRMATION_CASES.slice(1));
  exposed = experiment.appendExposure(exposed, { kind: 'selection-exposure', caseId: 'k1', candidateId: CANDIDATE });
  exposed = experiment.appendExposure(exposed, { kind: 'confirmation-exposure', caseId: 'k1', candidateId: CANDIDATE });
  const burned = readConfirmation(confirmationWorld(), { ledger: exposed });
  check(
    outcomeOf(burned) === 'blocked' && hasReason(burned, /k1 was exposed during selection/),
    'a confirmation case exposed during selection is refused',
  );

  // Confirmation exposure cannot be reused to pick another candidate.
  const other = experiment.appendExposure(confirmationLedger(), {
    kind: 'confirmation-exposure',
    caseId: 'k2',
    candidateId: 'a-different-candidate',
  });
  const reused = readConfirmation(confirmationWorld(), { ledger: other });
  check(
    outcomeOf(reused) === 'blocked' && hasReason(reused, /k2 was already used to confirm a-different-candidate/),
    'a confirmation case already used for another candidate is refused',
  );
  const forCandidateTwo = experiment.readExperiment({
    declaration: declaration({
      ...CONFIRMATION(),
      mutate: (body) => {
        body.scope.candidate.id = 'second-candidate';
      },
    }),
    attempts: confirmationWorld(),
    ledger: confirmationLedger(CONFIRMATION_CASES, CANDIDATE),
  });
  check(outcomeOf(forCandidateTwo) === 'blocked', 'a second candidate cannot confirm on cases the first candidate already used');
  check(outcomeOf(readConfirmation(confirmationWorld(), { ledger: null })) === 'blocked', 'confirmation without a ledger blocks');
  const unrecorded = readConfirmation(confirmationWorld(), { ledger: confirmationLedger(CONFIRMATION_CASES.slice(1)) });
  check(
    outcomeOf(unrecorded) === 'blocked' && hasReason(unrecorded, /exposure of k1 .* is not recorded/),
    'confirmation exposure has to be recorded before the analysis',
  );

  // The selection history is pinned at freeze, so it cannot be left out of a confirmation.
  const unpinned = declaration({
    ...CONFIRMATION(),
    mutate: (body) => {
      delete body.exposure;
    },
  });
  check(
    experiment.validateDeclaration(unpinned).pairedProblems.some((problem) => problem.where === 'exposure.ledgerHeadAtFreeze'),
    'a confirmation that pins no ledger head is refused',
  );
  const noHistory = readConfirmation(confirmationWorld(), { ledger: confirmationLedger().slice(FREEZE_CASES.length) });
  check(outcomeOf(noHistory) === 'blocked', 'a confirmation ledger that omits the selection history it was frozen against blocks');

  // Selection is refused on a case another candidate already confirmed on.
  const usedForConfirmation = experiment.appendExposure(selectionLedger(), {
    kind: 'confirmation-exposure',
    caseId: 'c1',
    candidateId: 'other',
  });
  const reusedForSelection = read(declaration(), world(), { ledger: usedForConfirmation });
  check(
    outcomeOf(reusedForSelection) === 'blocked' && hasReason(reusedForSelection, /c1 was used to confirm other/),
    'a case that already served as confirmation cannot be used to select',
  );

  // Disjoint memberships.
  const overlapping = declaration({
    ...CONFIRMATION(),
    mutate: (body) => {
      body.scope.memberships.development = ['k1'];
    },
  });
  const overlap = experiment.validateDeclaration(overlapping);
  check(
    overlap.problems.some((problem) => /also in/.test(problem.message)),
    'a case in two memberships is refused',
  );

  // Rows from outside the stage are excluded, not scored.
  const stray = [...world(), attempt({ arm: 'B', caseId: 'k1', repetition: 1, metrics: { recall: 1, precision: 1 }, cost: 0.1 })];
  const strayResult = read(declaration(), stray);
  check(
    strayResult.report.exclusions.some((entry) => entry.reason === 'outside-stage-membership'),
    'a row for a case outside the stage is excluded',
  );
  const strayIds = strayResult.evidenceIndex.rows.map((row) => row.attemptId);
  check(new Set(strayIds).size === strayIds.length, 'an excluded row appears in the evidence index once');
  check(
    strayResult.evidenceIndex.rows.find((row) => row.caseId === 'k1').counted === 'excluded:outside-stage-membership',
    'the index says why the row was excluded',
  );
  check(strayResult.report.denominators.reconciles, 'the denominators reconcile with an excluded row');
  check(
    strayResult.report.cost.taskExecution.total === read(declaration(), world()).report.cost.taskExecution.total,
    'an excluded row adds nothing to the cost totals',
  );

  // No analysis path applies a patch or accepts a baseline.
  const outcomes = new Set();
  const scenarios = [
    read(declaration(), world()),
    read(declaration(), world({ diffs: [0, 0, 0, 0, 0, 0] })),
    read(declaration(), world({ mutateRow: (row, i) => i === 0 && row.arm === 'B' && (row.counts.topSeverityMissed = 1) })),
    readConfirmation(confirmationWorld()),
    read(declaration(), []),
    read({}, []),
    read(exampleBaseline(), []),
  ];
  for (const result of scenarios) {
    outcomes.add(outcomeOf(result));
    const decision = result.report.contrast.decision;
    if (decision) {
      check(
        decision.appliesPatch === false &&
          decision.acceptsBaseline === false &&
          decision.nativeVerdict === null &&
          decision.advisory === true,
        `${outcomeOf(result)}: the decision applies nothing and accepts nothing`,
      );
    }
    check(
      result.report.nativeVerdict === null && result.report.advisory === true,
      `${outcomeOf(result)}: the report carries no native verdict`,
    );
  }
  check(outcomes.size >= 4, `the scenarios cover several outcomes (${[...outcomes].join(', ')})`);

  // The reader writes nothing while it reads.
  const snapshot = () => treeDigest(path.join(__dirname, 'results'));
  const beforeTree = snapshot();
  read(declaration(), world());
  readConfirmation(confirmationWorld());
  check(snapshot() === beforeTree, 'reading changes nothing under test/results');

  // Static guards on the module.
  const source = fs.readFileSync(READER, 'utf8');
  check(
    !/node:(child_process|net|http|https|dns|tls|worker_threads|cluster)/.test(source),
    'the reader requires no subprocess or network module',
  );
  check(!/\bfetch\s*\(|XMLHttpRequest|\bspawn|\bexec(?:Sync|File)?\s*\(/.test(source), 'the reader calls no subprocess or network API');
  const writers =
    source.match(/\b(?:writeFile|writeFileSync|appendFile|appendFileSync|mkdirSync|rmSync|unlinkSync|renameSync|copyFileSync|cpSync)\b/g) ??
    [];
  const writeBody = source.slice(source.indexOf('function writeOutputs'), source.indexOf('// command line'));
  const writersInOutputs =
    writeBody.match(
      /\b(?:writeFile|writeFileSync|appendFile|appendFileSync|mkdirSync|rmSync|unlinkSync|renameSync|copyFileSync|cpSync)\b/g,
    ) ?? [];
  check(
    writers.length === writersInOutputs.length && writers.length > 0,
    'files are written only by writeOutputs, into the directory the operator names',
  );
  check(
    !/anthropic|openai|apiKey|API_KEY/i.test(source.replaceAll(/model|codex/gi, '')),
    'the reader names no model provider or credential',
  );
  const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
  check(!JSON.stringify(pkg.bin ?? {}).includes('experiment'), 'no new public command is registered');
  check(
    !fs.existsSync(path.join(PROJECT_ROOT, 'cli', 'lib', 'configuration-experiment.js')),
    'the reader lives under test/, not in the shipped CLI',
  );
}

const selectionOnly = (result) => outcomeOf(result);

function treeDigest(directory) {
  const hash = crypto.createHash('sha256');
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else hash.update(`${path.relative(directory, full)}\n`).update(fs.readFileSync(full));
    }
  };
  walk(directory);
  return hash.digest('hex');
}

/* -------------------------------------------------------------------------- */
/* Behavior held one rule at a time                                                */
/* -------------------------------------------------------------------------- */

function checkRuleByRule() {
  // Receipts: each field of a fresh-workspace receipt is required.
  for (const [label, mutate] of [
    ['kind', (row) => (row.receipt.kind = 'copied-from-elsewhere')],
    ['workspace id', (row) => (row.receipt.workspaceId = '')],
    ['start time', (row) => delete row.receipt.startedAt],
    ['end time', (row) => delete row.receipt.endedAt],
  ]) {
    const broken = read(declaration(), world({ mutateRow: (row) => mutate(row) }));
    check(
      outcomeOf(broken) === 'blocked' &&
        broken.evidenceIndex.rows.every((row) => row.origin === 'imported-historical' && row.receiptProblem),
      `a receipt without a valid ${label} is no receipt`,
    );
  }
  const onlyBaselineStripped = world({
    mutateRow: (row) => {
      if (row.arm === 'A') delete row.receipt;
    },
  });
  check(outcomeOf(read(declaration(), onlyBaselineStripped)) === 'blocked', 'baseline attempts without receipts block too');
  let flip = 0;
  const wobbly = experiment.replayFixedOutput(
    [0, 1].map((index) => ({ attemptId: `w${index}`, outputSha256: sha('x'), outputText: 'x' })),
    () => ({ signature: `call-${(flip += 1)}` }),
  );
  check(wobbly.ok && wobbly.identical === false, 'a scorer that answers differently on identical bytes is not reported as identical');

  // The useful-effect threshold, end to end.
  const improvement = declaration({ objective: 'quality' });
  const pinRecall = (value) => (input) => {
    const out = experiment.pairedClusterBootstrap(input);
    if (out['quality:recall']) out['quality:recall'].lower = value;
    if (out['quality:precision']) out['quality:precision'].lower = -0.05;
    return out;
  };
  const improved = world({ diffs: [0.07, 0.04, 0.08, 0.03, 0.06, 0.05] });
  check(
    outcomeOf(read(improvement, improved, { bootstrap: pinRecall(0.01) })) === 'inconclusive',
    'a bound equal to the smallest worthwhile improvement is inconclusive',
  );
  check(
    outcomeOf(read(improvement, improved, { bootstrap: pinRecall(0.005) })) === 'inconclusive',
    'a bound between zero and the useful effect is inconclusive',
  );
  check(
    outcomeOf(read(improvement, improved, { bootstrap: pinRecall(-0.02) })) === 'inconclusive',
    'a negative bound does not meet an improvement gate',
  );
  check(
    outcomeOf(read(improvement, improved, { bootstrap: pinRecall(0.02) })) === 'selection-cleared',
    'a bound above the useful effect clears an improvement gate',
  );
  check(improvement.gates.saving === undefined, 'the improvement objective declares no saving gate');

  // The frozen ledger head is a pin of its own.
  const honest = selectionLedger();
  const reversed = selectionLedger(SELECTION_CASES.toReversed());
  const pinned = declaration({
    mutate: (body) => {
      body.exposure = { ledgerHeadAtFreeze: { head: honest[3].hash, length: 4 } };
    },
  });
  const rewritten = read(pinned, world(), { ledger: reversed });
  check(
    outcomeOf(rewritten) === 'blocked' && hasReason(rewritten, /pinned head at length 4/),
    'a ledger with every exposure recorded but a different history fails the frozen pin',
  );
  check(outcomeOf(read(pinned, world(), { ledger: honest })) === 'selection-cleared', 'the honest ledger satisfies the same pin');
  const otherCandidate = read(declaration(), world(), { ledger: selectionLedger(SELECTION_CASES, 'someone-else') });
  check(
    outcomeOf(otherCandidate) === 'blocked' && hasReason(otherCandidate, /exposure of c1 to cheaper-v1 is not recorded/),
    "an exposure recorded for another candidate is not this candidate's",
  );
  check(
    experiment.appendExposure([], { kind: 'selection-exposure', caseId: 'c1', candidateId: 'cheaper-v1' })[0].hash ===
      'sha256:68e9e1f1dd32b62ad18d8a4bd7e85c39104932a545b0a90af6040b3e34af5d9b',
    'the first ledger entry hashes to the value an independent implementation computes',
  );

  // Cost arithmetic.
  const negative = world({
    mutateRow: (row, i, repetition) => {
      if (row.arm === 'B' && i === 0 && repetition === 1) row.cost.components.target = -5;
    },
  });
  check(read(declaration(), negative).report.cost.taskExecution.total === null, 'a negative charge is unknown, not a credit');
  const pricing = { currency: 'USD', perMillionTokens: { inputTokens: 3, outputTokens: 15, cacheReadTokens: 0.3, cacheWriteTokens: 3.75 } };
  const withUsage = world({
    mutateRow: (row) => {
      row.usage = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0 };
    },
  });
  const recorded = read(declaration({ mutate: (body) => (body.resources.pricing = pricing) }), withUsage);
  check(
    Math.abs(recorded.report.cost.taskExecution.total - read(declaration(), world()).report.cost.taskExecution.total) < 1e-9,
    'a recorded charge is kept over a price derived from usage',
  );
  const negativeOverhead = declaration({ mutate: (body) => (body.resources.overhead = [{ name: 'refund', amount: -3, currency: 'USD' }]) });
  check(read(negativeOverhead, world()).report.cost.experimentTotal.total === null, 'a negative overhead is unknown');
  const euroOverhead = declaration({ mutate: (body) => (body.resources.overhead = [{ name: 'setup', amount: 3, currency: 'EUR' }]) });
  check(read(euroOverhead, world()).report.cost.experimentTotal.total === null, 'an overhead in another currency is not added');
  check(read(declaration(), []).report.cost.experimentTotal.total === null, 'an experiment with no attempts has no known total');

  // Latency.
  const latency = declaration({ mutate: (body) => (body.gates.latency = { maxIncreaseFraction: 0.5 }) });
  const baseMs = (i) => 1000 + 100 * i;
  const withLatency = (factor) =>
    world({
      mutateRow: (row, i) => {
        row.latency = row.arm === 'A' ? { taskMs: baseMs(i) } : factor === null ? null : { taskMs: baseMs(i) * factor };
      },
    });
  const fast = read(latency, withLatency(1.2));
  check(
    outcomeOf(fast) === 'selection-cleared' && fast.report.contrast.gates.some((gate) => gate.gate === 'latency' && gate.passes),
    'a candidate within the latency limit passes',
  );
  const slow = read(latency, withLatency(3));
  check(
    outcomeOf(slow) === 'inconclusive' && slow.report.contrast.gates.some((gate) => gate.gate === 'latency' && !gate.passes),
    'a candidate beyond the latency limit does not',
  );
  const pinLatency = (value) => (input) => {
    const out = experiment.pairedClusterBootstrap(input);
    if (out.latency) out.latency.lower = value;
    return out;
  };
  check(
    outcomeOf(read(latency, withLatency(1.2), { bootstrap: pinLatency(0) })) === 'inconclusive',
    'a latency bound of exactly zero does not pass',
  );
  const unknownLatency = read(latency, withLatency(null));
  check(
    outcomeOf(unknownLatency) === 'blocked' && hasReason(unknownLatency, /task latency is unknown/),
    'unknown latency under a latency gate blocks',
  );
  const negativeLatency = read(
    latency,
    world({
      mutateRow: (row, i) => {
        row.latency = { taskMs: row.arm === 'A' ? baseMs(i) : -baseMs(i) };
      },
    }),
  );
  check(
    outcomeOf(negativeLatency) === 'blocked' && hasReason(negativeLatency, /task latency is unknown/),
    'a negative task latency is unknown, never a speed-up',
  );
  const totalA = SELECTION_CASES.reduce((sum, _, i) => sum + 2 * baseMs(i), 0);
  check(
    slow.report.contrast.arms.A.taskLatencyMs === totalA && slow.report.contrast.arms.B.taskLatencyMs === 3 * totalA,
    'arm latency is the sum over attempts',
  );

  // Timeouts, attempt budget and unmeasured metrics.
  const timedOut = world({
    mutateRow: (row, i, repetition) => {
      if (row.arm === 'B' && i === 0 && repetition === 1) {
        row.status = 'timeout';
        row.metrics = {};
      }
    },
  });
  check(outcomeOf(read(declaration(), timedOut)) === 'blocked', 'a timeout is incomplete evidence under the incomplete rule');
  const scoredAsFailure = declaration({ mutate: (body) => (body.design.failureRules = { timeout: 'failure', failureMetricValue: 0 }) });
  const failureResult = read(scoredAsFailure, timedOut);
  check(outcomeOf(failureResult) !== 'blocked', `a timeout scores as a failure under the declared rule, got ${outcomeOf(failureResult)}`);
  const normal = read(scoredAsFailure, world());
  check(
    failureResult.report.contrast.arms.B.quality.recall < normal.report.contrast.arms.B.quality.recall - 0.05,
    "the failure value enters the candidate's quality",
  );
  const timeoutMiss = world({
    mutateRow: (row, i, repetition) => {
      if (row.arm === 'B' && i === 1 && repetition === 2) {
        row.status = 'timeout';
        row.counts.topSeverityMissed = 1;
      }
    },
  });
  check(outcomeOf(read(scoredAsFailure, timeoutMiss)) === 'rejected', 'a critical miss on a timed-out candidate attempt rejects');
  const extraAttempt = (attemptNumber) => {
    const rows = world();
    const first = rows.find((row) => row.arm === 'B' && row.caseId === 'c1' && row.repetition === 1);
    const extra = {
      ...clone(first),
      attemptId: `extra-${attemptNumber}`,
      attempt: attemptNumber,
      status: 'failed',
      metrics: {},
      counts: {},
      receipt: { ...first.receipt, workspaceId: `ws-extra-${attemptNumber}`, artifactSha256: null },
      outputSha256: null,
    };
    delete extra.outputText;
    rows.push(extra);
    return rows;
  };
  const oneAttempt = declaration({ mutate: (body) => (body.design.maxAttempts = 1) });
  const budget = read(oneAttempt, extraAttempt(2));
  check(
    outcomeOf(budget) === 'blocked' && hasReason(budget, /exceed design\.maxAttempts: B\/c1\/1/),
    'attempts beyond the declared budget block',
  );
  check(outcomeOf(read(declaration(), extraAttempt(2))) === 'selection-cleared', 'attempts exactly at the budget do not');
  const nullMetric = world({
    mutateRow: (row, i, repetition) => row.arm === 'B' && i === 2 && repetition === 1 && (row.metrics.recall = null),
  });
  const unmeasured = read(declaration(), nullMetric);
  check(
    outcomeOf(unmeasured) === 'blocked' && hasReason(unmeasured, /required metric unmeasured: B\/c3\/1\/recall \(unmeasured\)/),
    'a null required metric blocks',
  );
  const notApplicable = world({
    mutateRow: (row, i, repetition) => {
      if (row.arm === 'B' && i === 2 && repetition === 1) {
        delete row.metrics.recall;
        row.notApplicable = ['recall'];
      }
    },
  });
  check(
    hasReason(read(declaration(), notApplicable), /\(not applicable to this case\)/),
    'a required metric that does not apply to a case says so',
  );

  // A one-factor effort change is a valid contrast.
  const effort = declaration({
    mutate: (body) => {
      body.scope.changedFactor = { kind: 'effort', setting: 'effort' };
      body.identity.arms.B.model = clone(body.identity.arms.A.model);
      body.identity.arms.B.effort = { requested: 'low', applied: 'low' };
    },
  });
  const effortRows = world({
    mutateRow: (row) => {
      if (row.arm === 'B') {
        row.observed.arm.model = clone(ARM_A.model);
        row.observed.arm.effort = { requested: 'low', applied: 'low' };
      }
    },
  });
  check(outcomeOf(read(effort, effortRows)) === 'selection-cleared', 'a one-factor effort change passes the identity check');
  const effortMismatch = declaration({ mutate: (body) => (body.scope.changedFactor = { kind: 'effort', setting: 'effort' }) });
  check(
    outcomeOf(read(effortMismatch, world())) === 'revised-design-required',
    'a model difference under a declared effort factor is a second change',
  );

  // Identity leaves.
  for (const [label, mutate, pattern] of [
    ['a null fixed leaf', (body) => (body.identity.fixed.scorerDigest = null), /unknown identity: identity\.fixed\.scorerDigest/],
    ['an empty fixed leaf', (body) => (body.identity.fixed.environment.node = ''), /unknown identity: identity\.fixed\.environment\.node/],
    [
      'a null baseline leaf',
      (body) => (body.identity.arms.A.model.resolved = null),
      /unknown identity: identity\.arms\.A\.model\.resolved/,
    ],
  ]) {
    const unknown = read(declaration({ mutate }), world());
    check(outcomeOf(unknown) === 'blocked' && hasReason(unknown, pattern), `${label} blocks`);
  }
  const fixtureDrift = read(
    declaration(),
    world({
      mutateRow: (row, i) => {
        if (row.arm === 'A' && i === 0) row.observed.fixed.fixtureDigest = 'sha256:other-fixture';
      },
    }),
  );
  check(hasReason(fixtureDrift, /task changed: fixed\.fixtureDigest/), 'a changed fixture digest is a changed task');
  const environmentDrift = read(
    declaration(),
    world({
      mutateRow: (row, i) => {
        if (row.arm === 'A' && i === 0) row.observed.fixed.environment = { node: '25' };
      },
    }),
  );
  check(hasReason(environmentDrift, /environment changed: fixed\.environment\.node/), 'a changed environment is named');

  // The judge needs repeated calls under one identity.
  const single = experiment.analyzeJudgeCalls([
    judgeCall('g1', 'good output', 'pass', 'good'),
    judgeCall('b1', 'bad output', 'fail', 'bad'),
  ]);
  check(single.status === 'blocked' && !single.valid, 'one judgment per output is not a repeatability measurement');
  for (const [label, override] of [
    ['judge identity', { judgeIdentity: 'another-judge' }],
    ['input', { inputSha256: sha('another input') }],
  ]) {
    const mixed = experiment.analyzeJudgeCalls([
      judgeCall('g1', 'good output', 'pass', 'good'),
      judgeCall('g2', 'good output', 'pass', 'good', override),
      judgeCall('b1', 'bad output', 'fail', 'bad'),
      judgeCall('b2', 'bad output', 'fail', 'bad'),
    ]);
    check(mixed.status === 'blocked' && !mixed.valid, `calls under a different ${label} are not repeated judgments`);
  }

  // The calibration gate is tight and covers every field.
  const drifted = (field, amount) => (input) => {
    const out = experiment.pairedClusterBootstrap(input);
    for (const name of Object.keys(out)) out[name][field] += amount;
    return out;
  };
  check(!experiment.runCalibration(drifted('lower', 1e-6)).passed, 'a lower bound that drifts by a millionth fails calibration');
  check(!experiment.runCalibration(drifted('estimate', 1e-6)).passed, 'an estimate that drifts by a millionth fails calibration');
  const throwing = experiment.runCalibration(() => {
    throw new Error('boom');
  });
  check(
    !throwing.passed && throwing.failures.some((failure) => /threw boom/.test(failure.problem)),
    'a bootstrap that throws fails calibration and says so',
  );
  const brokenRead = read(declaration(), world(), {
    bootstrap: () => {
      throw new Error('boom');
    },
  });
  check(outcomeOf(brokenRead) === 'blocked', 'a bootstrap that throws during a read is reported, not thrown');
}

/* -------------------------------------------------------------------------- */
/* Adversarial inputs                                                              */
/* -------------------------------------------------------------------------- */

function checkAdversarialInputs() {
  // No critical rule, or a rule that names a count nothing records, is no gate.
  const noRules = declaration({
    mutate: (body) => {
      body.gates.critical.rules = [];
    },
  });
  check(outcomeOf(read(noRules, world())) === 'blocked', 'a contrast with no critical rule is blocked');
  const mistyped = declaration({
    mutate: (body) => {
      body.gates.critical.rules[0].count = 'topSeverityMised';
    },
  });
  check(outcomeOf(read(mistyped, world())) === 'blocked', 'a critical rule that names a count nothing records blocks');

  // Rows the reader cannot read hide nothing.
  const unreadable = world();
  const template = unreadable.find((row) => row.arm === 'B');
  unreadable.push({
    ...clone(template),
    attemptId: 'retry-x',
    status: 'cancelled',
    counts: { topSeverityMissed: 3 },
    cost: { currency: 'USD', components: { target: 100 } },
  });
  const unreadableResult = read(declaration(), unreadable);
  check(
    outcomeOf(unreadableResult) === 'blocked' && hasReason(unreadableResult, /could not be read/),
    'an unreadable row blocks the contrast',
  );

  // A failed attempt that recorded a critical miss still counts against the candidate.
  const failedMiss = world();
  const failedTemplate = failedMiss.find((row) => row.arm === 'B' && row.caseId === 'c2' && row.repetition === 1);
  failedMiss.push({
    ...clone(failedTemplate),
    attemptId: 'failed-retry',
    attempt: 2,
    status: 'failed',
    counts: { topSeverityMissed: 3 },
    receipt: { ...failedTemplate.receipt, workspaceId: 'ws-failed-retry' },
  });
  check(outcomeOf(read(declaration(), failedMiss)) === 'rejected', 'a failed candidate attempt with a recorded critical miss rejects');

  // Identity has to be declared, not merely consistent.
  for (const [label, mutate] of [
    ['groundTruthDigest', (body) => delete body.identity.fixed.groundTruthDigest],
    ['scorerDigest', (body) => delete body.identity.fixed.scorerDigest],
    ['arms.B.model.resolved', (body) => delete body.identity.arms.B.model.resolved],
    ['arms.A.effort.applied', (body) => delete body.identity.arms.A.effort.applied],
  ]) {
    const bare = declaration({ mutate });
    check(
      experiment.validateDeclaration(bare).pairedProblems.some((problem) => problem.where.includes(label)),
      `a declaration without ${label} cannot run a contrast`,
    );
  }
  const emptyIdentity = declaration({
    ...CONFIRMATION(),
    mutate: (body) => {
      body.identity = { fixed: {}, arms: { A: { model: { requested: 'a' } }, B: { model: { requested: 'b' } } } };
    },
  });
  check(
    outcomeOf(experiment.readExperiment({ declaration: emptyIdentity, attempts: confirmationWorld(), ledger: confirmationLedger() })) ===
      'blocked',
    'an identity with no pins cannot reach a recommendation',
  );

  // Keys named like object internals are keys.
  const hidden = (value) => JSON.parse(`{"__proto__":"${value}"}`);
  const protoDeclaration = declaration({
    mutate: (body) => {
      Object.defineProperty(body.identity.arms.A, '__proto__', { value: 'v1', enumerable: true, configurable: true, writable: true });
      Object.defineProperty(body.identity.arms.B, '__proto__', { value: 'v2', enumerable: true, configurable: true, writable: true });
    },
  });
  const protoRows = world({
    mutateRow: (row) => {
      Object.defineProperty(row.observed.arm, '__proto__', {
        value: row.arm === 'A' ? 'v1' : 'v2',
        enumerable: true,
        configurable: true,
        writable: true,
      });
    },
  });
  check(hidden('x').__proto__ === undefined || Object.keys(hidden('x')).includes('__proto__'), 'JSON.parse keeps a __proto__ key as data');
  check(
    outcomeOf(read(protoDeclaration, protoRows)) === 'revised-design-required',
    'a second change under a key named __proto__ is still a second change',
  );

  // Rounding noise is not an excess.
  check(!experiment.lowerBoundClears(0.100_000_000_000_000_02, 0.1), 'a bound above its threshold by rounding alone does not clear');
  check(!experiment.lowerBoundClears((0.1 + 0.1 + 0.1) / 3, 0.1), 'the mean of three equal values does not clear its own value');
  check(experiment.lowerBoundClears(0.1 + 1e-9, 0.1), 'a real excess clears');
  const rounding = read(declaration(), world(), {
    bootstrap: (input) => {
      const out = experiment.pairedClusterBootstrap(input);
      for (const name of Object.keys(out)) if (name === 'quality:recall') out[name].lower = -0.1 + 2.2e-17;
      return out;
    },
  });
  check(outcomeOf(rounding) === 'inconclusive', 'a bound that exceeds its threshold only by rounding is inconclusive end to end');

  // Inputs that used to throw are reported.
  const shapes = [
    ['clusters hold a null', (body) => (body.scope.clusters = [null])],
    ['critical rules hold a null', (body) => (body.gates.critical.rules = [null])],
    ['critical rules are an object', (body) => (body.gates.critical.rules = {})],
    ['critical rules are a number', (body) => (body.gates.critical.rules = 7)],
  ];
  for (const [label, mutate] of shapes) {
    const body = clone(declaration());
    delete body.frozen;
    mutate(body);
    let outcome;
    let threw = null;
    try {
      outcome = experiment.readExperiment({ declaration: freeze(body), attempts: world(), ledger: selectionLedger() });
    } catch (error) {
      threw = error;
    }
    check(threw === null && outcome.report.contrast.status === 'blocked', `${label}: reported, not thrown`);
  }
  let ledgerThrew = null;
  let ledgerResult;
  try {
    ledgerResult = read(declaration(), world(), { ledger: [null] });
  } catch (error) {
    ledgerThrew = error;
  }
  check(ledgerThrew === null && outcomeOf(ledgerResult) === 'blocked', 'a ledger that holds a null is reported, not thrown');
  const rubric = declaration({
    mutate: (body) => {
      body.scope.judge = 'rubric';
    },
  });
  let judgeThrew = null;
  let judgeResult;
  try {
    judgeResult = read(rubric, world(), { judgeCalls: [null] });
  } catch (error) {
    judgeThrew = error;
  }
  check(
    judgeThrew === null && judgeResult.report.descriptive.judge.status === 'blocked',
    'a judge call that is null is reported, not thrown',
  );
  let rowThrew = null;
  let rowResult;
  try {
    rowResult = read(declaration(), [...world(), { ...clone(world()[0]), attemptId: -1 }, { ...clone(world()[0]), attemptId: { x: 1 } }]);
  } catch (error) {
    rowThrew = error;
  }
  check(
    rowThrew === null && rowResult.report.exclusions.some((entry) => entry.reason === 'malformed-row'),
    'rows with non-string ids are excluded, not thrown',
  );

  // Sizes that would exhaust memory are refused by the declaration.
  const huge = declaration({
    mutate: (body) => {
      body.design.repeats = 20_000_000;
    },
  });
  const started = Date.now();
  check(outcomeOf(read(huge, world())) === 'blocked' && Date.now() - started < 5000, 'an unreasonable repeat count is refused quickly');
  const manyResamples = declaration({
    mutate: (body) => {
      body.design.analysis.B = 2_000_000;
    },
  });
  check(outcomeOf(read(manyResamples, world())) === 'blocked', 'an unreasonable resample count is refused');
}

/* -------------------------------------------------------------------------- */
/* Declaration, example files, outputs and command line                          */
/* -------------------------------------------------------------------------- */

function checkDeclarations() {
  const good = experiment.validateDeclaration(declaration());
  check(
    good.problems.length === 0 && good.pairedProblems.length === 0 && good.frozen.matches === true,
    'the synthetic declaration is valid and frozen',
  );
  const required = [
    ['experimentId', (body) => delete body.experimentId],
    ['scope.workflow', (body) => delete body.scope.workflow],
    ['scope.owner', (body) => delete body.scope.owner],
    ['scope.claim', (body) => (body.scope.claim = 'everything')],
    ['scope.memberships', (body) => delete body.scope.memberships],
    ['identity.fixed', (body) => delete body.identity.fixed],
    ['design.repeats', (body) => (body.design.repeats = 0)],
    ['gates.success.metrics', (body) => delete body.gates.success],
    ['scope.judge', (body) => delete body.scope.judge],
    ['stage', (body) => (body.stage = 'whenever')],
  ];
  for (const [where, mutate] of required) {
    const body = clone(declaration());
    mutate(body);
    check(
      experiment.validateDeclaration(body).problems.some((problem) => problem.where === where || problem.where.startsWith(where)),
      `a declaration without ${where} is unusable`,
    );
  }
  const pairedRequired = [
    ['scope.candidate.id', (body) => (body.scope.candidate = null)],
    ['scope.changedFactor.kind', (body) => (body.scope.changedFactor = { kind: 'everything' })],
    ['scope.objective', (body) => delete body.scope.objective],
    ['scope.clusters', (body) => delete body.scope.clusters],
    ['design.analysis.B', (body) => (body.design.analysis.B = 10)],
    ['design.analysis.alpha', (body) => (body.design.analysis.alpha = 0.7)],
    ['design.analysis.quantile', (body) => (body.design.analysis.quantile = 'whatever')],
    ['design.analysis.prng', (body) => (body.design.analysis.prng = 'math-random')],
    ['gates.quality', (body) => (body.gates.quality = {})],
    ['gates.saving.minFraction', (body) => delete body.gates.saving],
    ['gates.critical', (body) => delete body.gates.critical],
    ['resources.authorization', (body) => delete body.resources.authorization],
    ['design.failureRules.timeout', (body) => delete body.design.failureRules],
    ['identity.arms', (body) => delete body.identity.arms],
    ['gates.quality.recall', (body) => (body.gates.quality.recall = { maxLoss: 0.1, minImprovement: 0.1 })],
    ['gates.floors.nothing', (body) => (body.gates.floors = { nothing: 0.5 })],
  ];
  for (const [where, mutate] of pairedRequired) {
    const body = clone(declaration());
    delete body.frozen;
    mutate(body);
    const validation = experiment.validateDeclaration(freeze(body));
    check(
      validation.pairedProblems.some((problem) => problem.where.startsWith(where)),
      `a declaration without ${where} cannot run a contrast`,
    );
    check(
      validation.problems.length === 0 || where.startsWith('scope') || where.startsWith('identity'),
      `${where}: only the contrast is blocked, not the descriptive reading`,
    );
  }
  const weights = clone(declaration());
  delete weights.frozen;
  weights.scope.clusters[0].weight = 0.9;
  check(
    experiment.validateDeclaration(freeze(weights)).pairedProblems.some((problem) => /sum to one/.test(problem.message)),
    'weights that do not sum to one are refused',
  );
  const costWithGain = clone(declaration());
  delete costWithGain.frozen;
  costWithGain.gates.quality.recall = { minImprovement: 0.1 };
  check(experiment.validateDeclaration(freeze(costWithGain)).pairedProblems.length > 0, 'a cost objective allows quality loss only');
  check(
    declaration().frozen.digest === sha(independentCanonical(withoutFrozen(declaration()))),
    'the digest covers the declaration without its frozen block',
  );
  const changed = clone(declaration());
  changed.design.repeats = 3;
  check(experiment.declarationDigest(changed) !== declaration().frozen.digest, 'any edit changes the digest');
  check(experiment.canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] }) === '{"a":[2,{"c":2,"d":1}],"b":1}', 'canonical JSON sorts keys');

  // The shipped examples.
  const baseline = exampleBaseline();
  const validation = experiment.validateDeclaration(baseline);
  check(validation.problems.length === 0, `the example baseline declaration is valid: ${JSON.stringify(validation.problems)}`);
  const successMetrics = Object.keys(baseline.gates.success.metrics);
  check(
    successMetrics.every((name) => name in THRESHOLDS && THRESHOLDS[name] === baseline.gates.success.metrics[name]),
    "the example success rule uses the suite's own thresholds",
  );
  check(
    baseline.design.repeats === 2 && baseline.scope.memberships.development.length === 2,
    'the example baseline matches the recorded two-case, two-repetition runs',
  );
  const contrastExample = JSON.parse(fs.readFileSync(path.join(EXAMPLES, 'example-contrast-experiment.json'), 'utf8'));
  const contrastValidation = experiment.validateDeclaration(contrastExample);
  check(
    contrastValidation.problems.length === 0 && contrastValidation.pairedProblems.length === 0,
    `the example contrast declaration is complete: ${JSON.stringify([...contrastValidation.problems, ...contrastValidation.pairedProblems])}`,
  );
  check(contrastValidation.frozen.matches === true, 'the example contrast declaration carries the digest of its own bytes');
  check(contrastExample.resources.authorization === null, 'the example authorizes no live execution');
  const exampleRead = experiment.readExperiment({ declaration: contrastExample, attempts: [] });
  check(['blocked', 'new-baseline-required'].includes(outcomeOf(exampleRead)), 'the example declaration alone decides nothing');
  const docText = fs.existsSync(DOC) ? fs.readFileSync(DOC, 'utf8') : '';
  const shown = new Set(
    [...docText.matchAll(/```json\n([\s\S]*?)\n```/g)].flatMap((match) => {
      try {
        return [canonicalJsonOf(JSON.parse(match[1]))];
      } catch {
        return [];
      }
    }),
  );
  check(shown.has(canonicalJsonOf(contrastExample)), 'the operator page shows the example contrast declaration');
  check(shown.has(canonicalJsonOf(baseline)), 'the operator page shows the example baseline declaration');
  for (const heading of [
    '## What the Reader Does',
    '## 1. Read What You Already Have',
    '## 3. Compare One Configuration',
    '### The decision',
  ]) {
    check(docText.includes(heading), `the operator page has "${heading}"`);
  }
  check(!/story|_bmad-output|pull request|PR #/i.test(docText), 'the operator page names no story, planning path or review process');
}

function checkOutputsAndCommandLine() {
  const result = read(declaration(), world(), { replay: (text) => ({ ...syntheticScorer(text), signature: text }) });
  const markdown = experiment.renderReport(result.report);
  for (const heading of [
    '# Experiment report',
    '## Repeatability (descriptive)',
    '## Paired contrast',
    '## Cost',
    '## Denominators',
    '## Source limitations',
  ]) {
    check(markdown.includes(heading), `the Markdown report has "${heading}"`);
  }
  check(markdown.includes('Decision: **selection-cleared**'), 'the Markdown report states the decision');
  check(markdown.includes(result.report.declaration.digest), 'the Markdown report names the declaration digest');
  check(!/NaN|undefined|\[object Object\]/.test(markdown), 'the Markdown report has no unrendered values');

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-experiment-out-'));
  try {
    const files = experiment.writeOutputs(result, path.join(directory, 'out'));
    check(
      files
        .map((file) => path.basename(file))
        .sort()
        .join(',') === 'evidence-index.json,experiment-report.json,experiment-report.md',
      'the three outputs are written',
    );
    const report = JSON.parse(fs.readFileSync(path.join(directory, 'out', 'experiment-report.json'), 'utf8'));
    check(report.declaration.digest === result.report.declaration.digest, 'the written report parses back');
    let refused = false;
    try {
      experiment.writeOutputs(result, path.join(directory, 'out'));
    } catch (error) {
      refused = /never overwritten/.test(error.message);
    }
    check(refused, 'outputs are never overwritten');

    // The command line, end to end, over the recorded runs.
    const evidence = path.join(directory, 'evidence.json');
    fs.writeFileSync(
      evidence,
      JSON.stringify({
        declaration: path.join(EXAMPLES, 'example-baseline-experiment.json'),
        recordedRuns: [{ kind: 'test-design', dir: path.join(RAW, 'two-run-before-numeric'), arm: 'A', stage: 'baseline' }],
      }),
    );
    const run = spawnSync(process.execPath, [READER, 'analyze', evidence, '--out', path.join(directory, 'cli-out')], {
      encoding: 'utf8',
      cwd: PROJECT_ROOT,
    });
    check(run.status === 0, `the analyze command succeeds, got ${run.status}: ${run.stderr}`);
    const cliReport = JSON.parse(fs.readFileSync(path.join(directory, 'cli-out', 'experiment-report.json'), 'utf8'));
    check(
      cliReport.descriptive.importedHistoricalTrials === 4 && cliReport.descriptive.replay.status === 'replayed',
      'the command line reads the recorded run and replays the scorer',
    );
    const again = spawnSync(process.execPath, [READER, 'analyze', evidence, '--out', path.join(directory, 'cli-out')], {
      encoding: 'utf8',
      cwd: PROJECT_ROOT,
    });
    check(again.status !== 0, 'the command line refuses to overwrite earlier outputs');
    const digest = spawnSync(process.execPath, [READER, 'freeze', path.join(EXAMPLES, 'example-baseline-experiment.json')], {
      encoding: 'utf8',
      cwd: PROJECT_ROOT,
    });
    check(digest.stdout.trim() === experiment.declarationDigest(exampleBaseline()), 'the freeze command prints the declaration digest');

    // A confirmation through the command line: the selection is analyzed first, its
    // report digest pinned, and the confirmation reads the selection evidence again. A
    // Test Design declaration gets the Test Design scorer even without recorded runs.
    const write = (name, value) => {
      fs.writeFileSync(path.join(directory, name), JSON.stringify(value));
      return name;
    };
    const pinned = selectionOf(declaration(CONFIRMATION()));
    const selectionEvidence = write('selection-evidence.json', {
      declaration: write('selection.json', pinned.declaration),
      attempts: pinned.attempts,
      ledger: pinned.ledger,
    });
    const selectionRun = spawnSync(
      process.execPath,
      [READER, 'analyze', path.join(directory, selectionEvidence), '--out', path.join(directory, 'selection-out')],
      { encoding: 'utf8', cwd: PROJECT_ROOT },
    );
    const savedSelection = path.join(directory, 'selection-out', 'experiment-report.json');
    const digestRun = spawnSync(process.execPath, [READER, 'digest', savedSelection], { encoding: 'utf8', cwd: PROJECT_ROOT });
    check(
      selectionRun.status === 0 &&
        digestRun.status === 0 &&
        digestRun.stdout.trim() === experiment.digestOf(JSON.parse(fs.readFileSync(savedSelection, 'utf8'))),
      'the digest command prints the digest a confirmation pins for a saved report',
    );
    const confirmationDeclaration = declaration({
      ...CONFIRMATION(),
      mutate: (body) => {
        body.selection = { declarationDigest: experiment.declarationDigest(pinned.declaration), reportDigest: digestRun.stdout.trim() };
      },
    });
    const confirmationEvidence = path.join(directory, 'confirmation-evidence.json');
    fs.writeFileSync(
      confirmationEvidence,
      JSON.stringify({
        declaration: write('confirmation.json', confirmationDeclaration),
        attempts: sealAll(confirmationWorld()),
        ledger: confirmationLedger(),
        selection: selectionEvidence,
      }),
    );
    const confirmationRun = spawnSync(
      process.execPath,
      [READER, 'analyze', confirmationEvidence, '--out', path.join(directory, 'confirmation-out')],
      {
        encoding: 'utf8',
        cwd: PROJECT_ROOT,
      },
    );
    const confirmationReport = JSON.parse(fs.readFileSync(path.join(directory, 'confirmation-out', 'experiment-report.json'), 'utf8'));
    const selectionProblems = confirmationReport.contrast.selection.problems;
    check(
      confirmationRun.status === 0 &&
        selectionProblems.length > 0 &&
        !selectionProblems.some((problem) => /not supplied|does not reproduce|does not match/.test(problem)),
      `the command line reads the selection evidence again and reproduces its pinned report: ${selectionProblems.join(' | ')}`,
    );
    check(
      Object.values(confirmationReport.contrast.verification).some((problems) =>
        problems.some((problem) => /the scorer could not score the artifact \(unknown-case\)/.test(problem)),
      ),
      'the command line scores a Test Design declaration with the Test Design scorer',
    );
    const usage = spawnSync(process.execPath, [READER], { encoding: 'utf8', cwd: PROJECT_ROOT });
    check(usage.status === 2 && /usage/.test(usage.stderr), 'the command line prints its usage');

    // A tampered recorded run stops the command line.
    const copy = path.join(directory, 'tampered');
    fs.cpSync(path.join(RAW, 'two-run-before-numeric'), copy, { recursive: true });
    fs.appendFileSync(path.join(copy, 'cases', 'clean-last-sync-indicator-run-1', 'test-design-epic-9.md'), 'edit');
    const evidence2 = path.join(directory, 'evidence-tampered.json');
    fs.writeFileSync(
      evidence2,
      JSON.stringify({
        declaration: path.join(EXAMPLES, 'example-baseline-experiment.json'),
        recordedRuns: [{ kind: 'test-design', dir: copy, arm: 'A', stage: 'baseline' }],
      }),
    );
    const tampered = spawnSync(process.execPath, [READER, 'analyze', evidence2, '--out', path.join(directory, 'tampered-out')], {
      encoding: 'utf8',
      cwd: PROJECT_ROOT,
    });
    check(
      tampered.status === 1 && /does not match its manifest/.test(tampered.stderr),
      'the command line refuses a recorded run that fails its manifest',
    );
    check(!fs.existsSync(path.join(directory, 'tampered-out')), 'nothing is written for a refused run');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }

  // Unusable declarations are reported, not thrown.
  for (const bad of [null, [], 'text', {}]) {
    const outcome = experiment.readExperiment({ declaration: bad, attempts: [{ nonsense: true }] });
    check(outcome.report.contrast.status === 'blocked', `a declaration of ${JSON.stringify(bad)} is blocked and the reader does not throw`);
  }
  const malformed = experiment.readExperiment({ declaration: declaration(), attempts: [null, 7, { attemptId: 'x' }] });
  check(
    malformed.report.exclusions.filter((entry) => entry.reason === 'malformed-row').length === 3,
    'malformed rows are excluded with a reason',
  );
}

/* -------------------------------------------------------------------------- */
/* Decision gates that cannot be bypassed by accepted input                     */
/* -------------------------------------------------------------------------- */

const candidateRow = (rows, caseId, repetition) =>
  rows.find((row) => row.arm === 'B' && row.caseId === caseId && row.repetition === repetition);
const verificationOf = (result) => result.evidenceIndex.rows.map((row) => row.verification);

function checkClaimedEvidence() {
  // Rows that only claim a receipt, bytes and numbers decide nothing.
  const cases = SELECTION_CASES;
  const claimed = cases.flatMap((caseId, i) =>
    ARMS_AB.map((arm) => ({
      attemptId: `${arm}-${caseId}`,
      arm,
      caseId,
      stage: 'selection',
      blockId: caseId,
      repetition: 1,
      status: 'completed',
      receipt: {
        kind: 'fresh-workspace',
        workspaceId: `ws-${arm}-${caseId}`,
        startedAt: 'any',
        endedAt: 'any',
        artifactSha256: 'arbitrary',
      },
      outputSha256: 'arbitrary',
      metrics: { recall: arm === 'A' ? 0.8 : 0.81 + i * 0.01, precision: arm === 'A' ? 0.8 : 0.81 + i * 0.01 },
      counts: { topSeverityMissed: 0 },
      cost: { currency: 'USD', components: { target: arm === 'A' ? 1 + 0.1 * i : 0.5 + 0.03 * i, tools: 0 } },
      observed: { fixed: clone(FIXED), arm: clone(arm === 'A' ? ARM_A : ARM_B) },
    })),
  );
  const oneRepeat = declaration({ mutate: (body) => (body.design.repeats = 1) });
  const freeForm = read(oneRepeat, claimed, { seal: false });
  check(
    outcomeOf(freeForm) === 'blocked' && hasReason(freeForm, /receipt start and end are not ISO 8601 timestamps/),
    `rows with no saved bytes, no native record and an arbitrary hash do not clear, got ${outcomeOf(freeForm)}`,
  );

  const clean = read(declaration(), world());
  check(
    outcomeOf(clean) === 'selection-cleared' && verificationOf(clean).every((value) => value === 'verified'),
    'rows the scorer re-derives from their saved bytes are verified and clear',
  );

  const tamper = (label, mutateRow, pattern, extra = {}) => {
    const rows = world();
    mutateRow(candidateRow(rows, 'c2', 1), rows);
    const result = read(declaration(), rows, { seal: false, ...extra });
    check(
      outcomeOf(result) === 'blocked' && hasReason(result, pattern),
      `${label} leaves the evidence claimed and blocks, got ${outcomeOf(result)}: ${reasonsOf(result).join(' | ')}`,
    );
    const indexed = result.evidenceIndex.rows.find((row) => row.attemptId === 'B-c2-1-1');
    check(
      indexed.verification === 'claimed' && indexed.verificationProblems.some((problem) => pattern.test(problem)),
      `${label}: the index marks the attempt claimed`,
    );
  };
  tamper('absent artifact bytes', (row) => delete row.outputText, /artifact bytes are not part of the evidence/);
  tamper('an absent native record', (row) => delete row.native.ref, /no native record reference/);
  tamper('an absent input hash', (row) => delete row.inputSha256, /no input hash/);
  tamper('an absent stage', (row) => delete row.stage, /does not record its stage/);
  tamper(
    'an arbitrary hash on both the row and its receipt',
    (row) => {
      row.outputSha256 = 'arbitrary';
      row.receipt.artifactSha256 = 'arbitrary';
    },
    /do not hash to outputSha256/,
  );
  tamper('an altered metric', (row) => (row.metrics.recall += 0.1), /metric recall is .* the scorer gives/);
  tamper('a receipt that ends before it starts', (row) => (row.receipt.endedAt = '2026-10-13T00:00:00.000Z'), /ends before it starts/);
  tamper('a receipt with an unparseable time', (row) => (row.receipt.startedAt = '2026-10-14 noon'), /not ISO 8601/);
  const noScorer = read(declaration(), world(), { replay: null });
  check(
    outcomeOf(noScorer) === 'blocked' && hasReason(noScorer, /no deterministic scorer was supplied/),
    'without a scorer to re-derive the numbers, no row is verified',
  );
  const throwing = read(declaration(), world(), {
    replay: () => {
      throw new Error('scorer fault');
    },
  });
  check(
    outcomeOf(throwing) === 'blocked' && hasReason(throwing, /the scorer threw: scorer fault/),
    'a scorer that throws verifies nothing',
  );

  // A hidden critical miss: the saved document shows one, the row reports zero.
  const laundered = world();
  const hidden = seal({ ...candidateRow(laundered, 'c3', 2), counts: { topSeverityMissed: 1 } });
  hidden.counts.topSeverityMissed = 0;
  laundered.splice(laundered.indexOf(candidateRow(laundered, 'c3', 2)), 1, hidden);
  const launderedResult = read(declaration(), laundered, { seal: false });
  check(
    outcomeOf(launderedResult) === 'blocked' && hasReason(launderedResult, /count topSeverityMissed is 0, the scorer gives 1/),
    'a count altered away from what the saved document shows blocks',
  );
}

async function checkRecordedEvidenceVerification() {
  // The scorer the command line supplies reproduces the recorded native numbers.
  const replay = experiment.testDesignReplay({ groundTruth: await loadGroundTruth() });
  const before = experiment.loadRecordedTestDesignRun({ dir: path.join(RAW, 'two-run-before-numeric') });
  for (const row of before.rows) {
    const scored = replay(row.outputText, row);
    const { fixtureMutations, ...byteCounts } = row.counts;
    check(
      canonicalJsonOf(scored.metrics) === canonicalJsonOf(row.metrics) && canonicalJsonOf(scored.counts) === canonicalJsonOf(byteCounts),
      `the Test Design scorer re-derives the recorded metrics and counts of ${row.attemptId}`,
    );
    check(
      fixtureMutations === 0 && !('fixtureMutations' in scored.counts),
      `the bytes of ${row.attemptId} cannot show fixture mutations, so the scorer reports no count for them`,
    );
  }

  const caseIds = [...new Set(before.rows.map((row) => row.caseId))];
  const recordedDeclaration = declaration({
    cases: caseIds,
    mutate: (body) => {
      body.gates.success.metrics = { riskPrecision: 0.5 };
      body.gates.quality = { riskPrecision: { maxLoss: 0.1 }, scaleComplianceAccuracy: { maxLoss: 0.1 } };
      body.gates.floors = {};
      body.gates.critical.rules = [
        { id: 'top-severity-missed', count: 'topSeverityMissed' },
        { id: 'ungrounded-risk-reported', count: 'ungroundedRisks' },
      ];
    },
  });
  let clock = Date.parse('2026-10-15T00:00:00.000Z');
  const receipted = (dir, arm, runId) =>
    experiment.loadRecordedTestDesignRun({ dir: path.join(RAW, dir), arm, stage: 'selection', runId }).rows.map((row) => ({
      ...row,
      blockId: `${row.caseId}-${row.repetition}`,
      inputSha256: sha(`prompt ${row.caseId}`),
      cost: { currency: 'USD', components: { target: arm === 'A' ? 1 : 0.5, tools: 0 } },
      observed: { fixed: clone(FIXED), arm: clone(arm === 'A' ? ARM_A : ARM_B) },
    }));
  const interleave = (rowsA, rowsB) =>
    rowsA.flatMap((row, index) =>
      [row, rowsB[index]].map((entry) => {
        clock += 60_000;
        const startedAt = new Date(clock).toISOString();
        return {
          ...entry,
          receipt: {
            kind: 'fresh-workspace',
            workspaceId: `ws-${entry.attemptId}`,
            startedAt,
            endedAt: new Date(clock + 30_000).toISOString(),
            artifactSha256: entry.outputSha256,
          },
        };
      }),
    );
  const sameDocuments = interleave(
    receipted('two-run-before-numeric', 'A', 'before-a'),
    receipted('two-run-before-numeric', 'B', 'before-b'),
  );
  const verified = experiment.readExperiment({
    declaration: recordedDeclaration,
    attempts: sameDocuments,
    ledger: selectionLedger(caseIds),
    replay,
  });
  check(
    verificationOf(verified).every((value) => value === 'verified') && outcomeOf(verified) !== 'blocked',
    `recorded documents with receipts and a reproducing scorer are verified, got ${outcomeOf(verified)}: ${reasonsOf(verified).join(' | ')}`,
  );
  const mutationRule = freeze({
    ...clone(recordedDeclaration),
    gates: {
      ...clone(recordedDeclaration.gates),
      critical: {
        tolerance: 0,
        rules: [...recordedDeclaration.gates.critical.rules, { id: 'fixture-mutated', count: 'fixtureMutations' }],
      },
    },
  });
  const mutationResult = experiment.readExperiment({
    declaration: mutationRule,
    attempts: sameDocuments,
    ledger: selectionLedger(caseIds),
    replay,
  });
  check(
    outcomeOf(mutationResult) === 'blocked' && hasReason(mutationResult, /count fixtureMutations is 0, the scorer gives undefined/),
    'a fixture mutation count the saved bytes cannot show stays claimed',
  );
  const rescored = interleave(receipted('two-run-before-numeric', 'A', 'before-a'), receipted('two-run-after-numeric', 'B', 'after-b'));
  const recallDeclaration = freeze({
    ...clone(recordedDeclaration),
    gates: {
      ...clone(recordedDeclaration.gates),
      quality: { ...clone(recordedDeclaration.gates.quality), groundedRiskRecall: { maxLoss: 0.1 } },
    },
  });
  const stale = experiment.readExperiment({ declaration: recallDeclaration, attempts: rescored, ledger: selectionLedger(caseIds), replay });
  check(
    outcomeOf(stale) === 'blocked' && hasReason(stale, /metric groundedRiskRecall is .* the scorer gives/),
    'a recorded number the current scorer does not reproduce stays claimed and blocks',
  );
}

function checkCriticalCountsCannotBeExcused() {
  const excused = world({
    mutateRow: (row) => {
      if (row.arm === 'B') {
        delete row.counts.topSeverityMissed;
        row.notApplicable = ['topSeverityMissed'];
      }
    },
  });
  const excusedResult = read(declaration(), excused);
  check(
    outcomeOf(excusedResult) === 'blocked' && hasReason(excusedResult, /critical counts are not recorded as nonnegative integers/),
    `a notApplicable tag does not excuse a missing critical count, got ${outcomeOf(excusedResult)}`,
  );
  for (const [label, value] of [
    ['a negative', -1],
    ['a fractional', 0.5],
  ]) {
    const rows = world({ mutateRow: (row, i) => row.arm === 'B' && i === 0 && (row.counts.topSeverityMissed = value) });
    const result = read(declaration(), rows);
    check(
      outcomeOf(result) === 'blocked' && hasReason(result, /critical counts are not recorded as nonnegative integers .*B-c1-1-1/),
      `${label} critical count is unknown and blocks, got ${outcomeOf(result)}`,
    );
  }
  const negativeRetry = world();
  negativeRetry.push({
    ...clone(candidateRow(negativeRetry, 'c5', 1)),
    attemptId: 'B-c5-1-retry',
    attempt: 2,
    status: 'failed',
    counts: { topSeverityMissed: -2 },
    receipt: { ...candidateRow(negativeRetry, 'c5', 1).receipt, workspaceId: 'ws-negative-retry' },
  });
  const negativeRetryResult = read(declaration(), negativeRetry);
  check(
    outcomeOf(negativeRetryResult) === 'blocked' && hasReason(negativeRetryResult, /B-c5-1-retry \(top-severity-missed\)/),
    'a negative count on a failed retry blocks',
  );
  const positiveRetry = world();
  positiveRetry.push({
    ...clone(candidateRow(positiveRetry, 'c5', 1)),
    attemptId: 'B-c5-1-retry',
    attempt: 2,
    status: 'failed',
    counts: { topSeverityMissed: 1 },
    receipt: { ...candidateRow(positiveRetry, 'c5', 1).receipt, workspaceId: 'ws-positive-retry' },
  });
  check(outcomeOf(read(declaration(), positiveRetry)) === 'rejected', 'a verified positive count on a failed retry rejects');
  const zeroOnly = read(declaration(), world());
  check(outcomeOf(zeroOnly) === 'selection-cleared', 'only a verified zero on every candidate attempt satisfies the critical gate');
}

function checkAllInCostScope() {
  const targetOnly = declaration({ mutate: (body) => (body.resources.costScope = { taskExecution: ['target'] }) });
  check(
    experiment
      .validateDeclaration(targetOnly)
      .pairedProblems.some((problem) => problem.where === 'resources.costScope.taskExecution' && /target and tools/.test(problem.message)),
    'a task execution scope that leaves out tools is refused',
  );
  const toolCharges = world({ mutateRow: (row) => row.arm === 'B' && (row.cost.components.tools = 10) });
  const narrowed = read(targetOnly, toolCharges);
  check(outcomeOf(narrowed) === 'blocked', `a narrowed cost scope cannot hide candidate tool charges, got ${outcomeOf(narrowed)}`);
  const allIn = read(declaration(), toolCharges);
  check(
    outcomeOf(allIn) === 'inconclusive' && allIn.report.contrast.gates.some((gate) => gate.gate === 'saving' && !gate.passes),
    `candidate tool charges reverse the saving gate, got ${outcomeOf(allIn)}`,
  );
  const extended = declaration({ mutate: (body) => (body.resources.costScope = { taskExecution: ['target', 'tools', 'retrieval'] }) });
  check(experiment.validateDeclaration(extended).pairedProblems.length === 0, 'a task execution scope may add components');

  const unclassified = world({ mutateRow: (row) => (row.cost.components.retrieval = row.arm === 'B' ? 5 : 0) });
  const unclassifiedResult = read(declaration(), unclassified);
  check(
    outcomeOf(unclassifiedResult) === 'blocked' &&
      hasReason(unclassifiedResult, /neither the task execution nor the judge scope: .*retrieval/),
    'a charged component the scopes do not classify blocks',
  );
  const classifiedResult = read(extended, unclassified);
  check(
    outcomeOf(classifiedResult) === 'inconclusive' &&
      classifiedResult.report.contrast.gates.some((gate) => gate.gate === 'saving' && !gate.passes),
    'a declared extra component enters the saving gate',
  );

  // The arm subtotals reconcile with the report's task execution and experiment totals.
  const overhead = declaration({ mutate: (body) => (body.resources.overhead = [{ name: 'preflight', amount: 2, currency: 'USD' }]) });
  const reconciled = read(overhead, world());
  const { A, B } = reconciled.report.contrast.arms;
  const close = (left, right) => Math.abs(left - right) < 1e-9;
  check(
    close(A.taskExecutionCost.total + B.taskExecutionCost.total, reconciled.report.cost.taskExecution.total),
    'the arm subtotals add up to the task execution total',
  );
  check(
    close(reconciled.report.cost.taskExecution.total + 2, reconciled.report.cost.experimentTotal.total),
    'the experiment total is task execution plus declared overhead',
  );
  const indexed = reconciled.evidenceIndex.rows.reduce((sum, row) => sum + row.cost.components.target + row.cost.components.tools, 0);
  check(close(indexed, reconciled.report.cost.taskExecution.total), 'the task execution total reconciles with the evidence index');
}

function checkConfirmationFollowsSelection() {
  const confirmationDeclaration = declaration(CONFIRMATION());
  const withoutSelection = experiment.readExperiment({
    declaration: confirmationDeclaration,
    attempts: sealAll(confirmationWorld()),
    ledger: confirmationLedger(),
    replay: syntheticScorer,
  });
  check(
    outcomeOf(withoutSelection) === 'blocked' &&
      hasReason(withoutSelection, /selection: the frozen selection declaration and its evidence are not supplied/),
    'a confirmation with an exposure-only history and no selection result does not recommend',
  );
  const unpinned = declaration({ ...CONFIRMATION(), mutate: (body) => (body.selection = null) });
  check(
    experiment.validateDeclaration(unpinned).pairedProblems.some((problem) => problem.where === 'selection'),
    'a confirmation declaration that pins no selection is refused',
  );

  const failedSelection = declaration({
    ...CONFIRMATION(),
    mutate: (body) => (body.selection = pinSelection(body, { diffs: [-0.3, -0.3, -0.3] })),
  });
  const failed = readConfirmation(confirmationWorld(), { declaration: failedSelection, selection: selectionOf(failedSelection) });
  check(
    outcomeOf(failed) === 'blocked' && hasReason(failed, /selection outcome is inconclusive; a confirmation needs selection-cleared/),
    `a confirmation after an inconclusive selection is blocked, got ${outcomeOf(failed)}`,
  );

  for (const [label, change, pattern] of [
    [
      'a changed margin',
      (body) => (body.gates.quality.recall.maxLoss = 0.2),
      /changes what selection froze: gates\.quality\.recall\.maxLoss/,
    ],
    [
      'a changed candidate',
      (body) => (body.scope.candidate.id = 'another-candidate'),
      /changes what selection froze: .*scope\.candidate\.id/,
    ],
    ['a changed analysis', (body) => (body.design.analysis.seed = 7), /changes what selection froze: design\.analysis\.seed/],
    ['a changed cost rule', (body) => (body.gates.saving.minFraction = 0.1), /changes what selection froze: gates\.saving\.minFraction/],
    [
      'a changed candidate identity',
      (body) => (body.identity.arms.B.model.resolved = 'cheaper-2026-11'),
      /identity\.arms\.B\.model\.resolved/,
    ],
  ]) {
    const changed = declaration({
      ...CONFIRMATION(),
      mutate: (body) => {
        body.selection = pinSelection(body);
        change(body);
      },
    });
    const result = readConfirmation(confirmationWorld(), { declaration: changed, selection: selectionOf(changed) });
    check(
      outcomeOf(result) === 'blocked' && hasReason(result, pattern),
      `${label} after selection blocks the confirmation, got ${outcomeOf(result)}`,
    );
  }

  // An inconclusive selection report edited to read selection-cleared, then pinned.
  const forged = clone(selectionReportOf(failedSelection));
  forged.contrast.decision.outcome = 'selection-cleared';
  forged.contrast.decision.reasons = ['forged'];
  const forgedPin = declaration({
    ...CONFIRMATION(),
    mutate: (body) => {
      body.selection = { declarationDigest: failedSelection.selection.declarationDigest, reportDigest: experiment.digestOf(forged) };
    },
  });
  const forgedResult = readConfirmation(confirmationWorld(), { declaration: forgedPin, selection: selectionOf(failedSelection) });
  check(
    outcomeOf(forgedResult) === 'blocked' &&
      hasReason(forgedResult, /selection evidence does not reproduce the report pinned/) &&
      hasReason(forgedResult, /selection outcome is inconclusive/),
    `a pinned selection report edited after the fact is refused, got ${outcomeOf(forgedResult)}`,
  );
  const pinned = selectionOf(confirmationDeclaration);
  const tampered = clone(pinned);
  tampered.attempts = sealAll(
    tampered.attempts.map((row, index) => (index === 1 ? { ...row, metrics: { ...row.metrics, recall: 0.99 } } : row)),
  );
  const tamperedResult = readConfirmation(confirmationWorld(), { selection: tampered });
  check(
    outcomeOf(tamperedResult) === 'blocked' && hasReason(tamperedResult, /does not reproduce the report pinned/),
    'selection evidence other than the evidence behind the pinned report is refused',
  );
  const otherDeclaration = freeze({ ...clone(pinned.declaration), experimentId: 'another-experiment' });
  const otherResult = readConfirmation(confirmationWorld(), { selection: { ...pinned, declaration: otherDeclaration } });
  check(
    outcomeOf(otherResult) === 'blocked' && hasReason(otherResult, /does not match selection\.declarationDigest/),
    'a selection declaration other than the pinned one is refused',
  );
  const intact = readConfirmation(confirmationWorld());
  check(outcomeOf(intact) === 'recommend', `an intact selection-to-confirmation chain recommends, got ${outcomeOf(intact)}`);

  // The selection report's own ledger head stays pinned, even under an earlier freeze pin.
  const earlyHead = selectionLedger(['d1', 'd2']);
  const earlyPin = declaration({
    ...CONFIRMATION(),
    mutate: (body) => (body.exposure.ledgerHeadAtFreeze = { head: earlyHead.at(-1).hash, length: earlyHead.length }),
  });
  let rewritten = experiment.appendExposure(earlyHead, {
    kind: 'selection-exposure',
    caseId: 'v1',
    candidateId: CANDIDATE,
    note: 'rewritten',
  });
  for (const caseId of CONFIRMATION_CASES) {
    rewritten = experiment.appendExposure(rewritten, { kind: 'confirmation-exposure', caseId, candidateId: CANDIDATE });
  }
  const rewrittenResult = readConfirmation(confirmationWorld(), {
    declaration: earlyPin,
    selection: selectionOf(earlyPin),
    ledger: rewritten,
  });
  check(
    outcomeOf(rewrittenResult) === 'blocked' && hasReason(rewrittenResult, /pinned head at length 3 is no longer in the ledger/),
    'a ledger that rewrote history the selection report recorded is refused',
  );
  const savedReport = JSON.parse(`${JSON.stringify(selectionReportOf(confirmationDeclaration), null, 2)}\n`);
  check(
    experiment.digestOf(savedReport) === confirmationDeclaration.selection.reportDigest,
    'the pinned digest survives writing the report to disk and reading it back',
  );
}

function checkOneNamedSetting() {
  const effortAndTemperature = declaration({
    mutate: (body) => {
      body.scope.changedFactor = { kind: 'effort', setting: 'effort' };
      body.identity.arms.B = clone(ARM_A);
      body.identity.arms.B.effort = { requested: 'low', applied: 'low' };
      body.identity.arms.B.decode = { temperature: 1 };
    },
  });
  const observedAs = (value) => world({ mutateRow: (row) => (row.observed.arm = clone(value.identity.arms[row.arm])) });
  const bundled = read(effortAndTemperature, observedAs(effortAndTemperature));
  check(
    outcomeOf(bundled) === 'revised-design-required' &&
      hasReason(bundled, /more than the declared effort setting differs: decode\.temperature/),
    `an effort change plus a temperature change is two settings, got ${outcomeOf(bundled)}`,
  );
  const temperatureOnly = declaration({
    mutate: (body) => {
      body.scope.changedFactor = { kind: 'effort', setting: 'decode.temperature' };
      body.identity.arms.B = clone(ARM_A);
      body.identity.arms.B.decode = { temperature: 1 };
    },
  });
  check(
    outcomeOf(read(temperatureOnly, observedAs(temperatureOnly))) === 'selection-cleared',
    'one decode setting alone is a valid contrast',
  );
  const effortOnly = declaration({
    mutate: (body) => {
      body.scope.changedFactor = { kind: 'effort', setting: 'effort' };
      body.identity.arms.B = clone(ARM_A);
      body.identity.arms.B.effort = { requested: 'low', applied: 'low' };
    },
  });
  check(
    outcomeOf(read(effortOnly, observedAs(effortOnly))) === 'selection-cleared',
    'one effort setting with consistent requested and applied evidence passes',
  );
  const notApplied = declaration({
    mutate: (body) => {
      body.scope.changedFactor = { kind: 'effort', setting: 'effort' };
      body.identity.arms.B = clone(ARM_A);
      body.identity.arms.B.effort = { requested: 'low', applied: 'high' };
    },
  });
  const notAppliedResult = read(notApplied, observedAs(notApplied));
  check(
    outcomeOf(notAppliedResult) === 'revised-design-required' && hasReason(notAppliedResult, /effort\.applied stays the same/),
    'a requested effort the provider did not apply is no effort change',
  );
  const notResolved = declaration({ mutate: (body) => (body.identity.arms.B.model.resolved = ARM_A.model.resolved) });
  const notResolvedResult = read(notResolved, observedAs(notResolved));
  check(
    outcomeOf(notResolvedResult) === 'revised-design-required' && hasReason(notResolvedResult, /model\.resolved stays the same/),
    'a requested model the provider resolved to the incumbent is no model change',
  );
  const twoRegions = declaration({
    mutate: (body) => {
      body.scope.changedFactor = { kind: 'prompt', setting: 'promptRegions.examples' };
      body.identity.arms.A.promptRegions = { examples: 'sha256:examples-1', rules: 'sha256:rules-1' };
      body.identity.arms.B = clone(body.identity.arms.A);
      body.identity.arms.B.promptDigest = 'sha256:prompt-2';
      body.identity.arms.B.promptRegions = { examples: 'sha256:examples-2', rules: 'sha256:rules-2' };
    },
  });
  const twoRegionsResult = read(twoRegions, observedAs(twoRegions));
  check(
    outcomeOf(twoRegionsResult) === 'revised-design-required' && hasReason(twoRegionsResult, /promptRegions\.rules/),
    'two changed prompt regions are two settings',
  );
  for (const changedFactor of [
    { kind: 'effort' },
    { kind: 'prompt' },
    { kind: 'effort', setting: 'decode' },
    { kind: 'model', setting: 'effort' },
  ]) {
    const unnamed = declaration({ mutate: (body) => (body.scope.changedFactor = changedFactor) });
    check(
      experiment.validateDeclaration(unnamed).pairedProblems.some((problem) => problem.where === 'scope.changedFactor.setting'),
      `a changed factor of ${JSON.stringify(changedFactor)} names no setting its kind allows`,
    );
  }
}

function checkObservedPairingAndOrder() {
  const missingOne = world({ mutateRow: (row, i, repetition) => row.arm === 'B' && i === 1 && repetition === 2 && delete row.blockId });
  const missingOneResult = read(declaration(), missingOne);
  check(
    outcomeOf(missingOneResult) === 'blocked' && hasReason(missingOneResult, /pairing block not recorded on both arms: c2\/2/),
    'a pair with no block on one arm blocks',
  );
  const missingAll = read(declaration(), world({ mutateRow: (row) => delete row.blockId }));
  check(outcomeOf(missingAll) === 'blocked' && hasReason(missingAll, /pairing block not recorded/), 'pairs with no blocks at all block');

  // A declared interleaved schedule whose receipts show every A before any B.
  const retime = (rows, order) => {
    for (const [index, row] of order(rows).entries()) {
      const start = DISPATCH_START + (index + 1) * 60_000;
      row.receipt.startedAt = new Date(start).toISOString();
      row.receipt.endedAt = new Date(start + 30_000).toISOString();
    }
    return rows;
  };
  const allAFirst = retime(world(), (rows) => [...rows.filter((row) => row.arm === 'A'), ...rows.filter((row) => row.arm === 'B')]);
  const allAFirstResult = read(declaration(), allAFirst);
  check(
    outcomeOf(allAFirstResult) === 'blocked' &&
      hasReason(allAFirstResult, /does not follow the declared interleaved schedule: block c1-1 does not finish starting attempts before/),
    `all A before all B is no interleaved schedule, got ${outcomeOf(allAFirstResult)}`,
  );
  const oneBlock = world({ mutateRow: (row) => (row.blockId = 'everything') });
  retime(oneBlock, (rows) => [...rows.filter((row) => row.arm === 'A'), ...rows.filter((row) => row.arm === 'B')]);
  const oneBlockResult = read(declaration(), oneBlock);
  check(
    outcomeOf(oneBlockResult) === 'blocked' && hasReason(oneBlockResult, /block everything does not alternate the arms/),
    'one block holding every A before every B is no interleaved schedule',
  );
  const bFirst = retime(world(), (rows) => rows.map((_, index) => rows[index % 2 === 0 ? index + 1 : index - 1]));
  check(outcomeOf(read(declaration(), bFirst)) === 'selection-cleared', 'an interleaved schedule may start a block with either arm');
  const randomized = declaration({ mutate: (body) => (body.design.order = 'randomized') });
  const randomOrder = retime(world(), (rows) =>
    rows.map((_, index) => rows[index % 4 === 0 ? index + 1 : index % 4 === 1 ? index - 1 : index]),
  );
  check(outcomeOf(read(randomized, randomOrder)) === 'selection-cleared', 'a randomized schedule may start each pair with either arm');
  const wholeRun = world({ mutateRow: (row) => (row.blockId = 'whole-run') });
  retime(wholeRun, (rows) => [...rows.filter((row) => row.arm === 'A'), ...rows.filter((row) => row.arm === 'B')]);
  const wholeRunResult = read(randomized, wholeRun);
  check(
    outcomeOf(wholeRunResult) === 'blocked' && hasReason(wholeRunResult, /block whole-run holds more than one pair/),
    'a randomized schedule cannot hide every A before every B in one block',
  );
  const overlapping = retime(world(), (rows) => [...rows.filter((row) => row.arm === 'A'), ...rows.filter((row) => row.arm === 'B')]);
  check(outcomeOf(read(randomized, overlapping)) === 'blocked', 'a randomized schedule still runs its blocks one after another');

  // Both arms run under one recorded cache policy.
  const noCachePolicy = declaration({ mutate: (body) => delete body.identity.fixed.environment.cacheRegime });
  check(
    experiment
      .validateDeclaration(noCachePolicy)
      .pairedProblems.some((problem) => problem.where === 'identity.fixed' && /cacheRegime/.test(problem.message)),
    'a contrast that records no cache regime is refused',
  );
  const cacheDrift = read(
    declaration(),
    world({ mutateRow: (row) => row.arm === 'B' && (row.observed.fixed.environment.cacheRegime = 'warm') }),
  );
  check(
    outcomeOf(cacheDrift) === 'new-baseline-required' && hasReason(cacheDrift, /fixed\.environment\.cacheRegime/),
    'an arm that ran under another cache regime is no comparable pair',
  );
}

function checkEveryAttemptIsAccountedFor() {
  // A failed retry whose saved document shows a critical miss the row leaves out.
  for (const [label, claimed] of [
    ['omits', undefined],
    ['claims zero for', 0],
  ]) {
    const rows = world();
    const first = candidateRow(rows, 'c1', 1);
    const retry = seal({
      ...clone(first),
      attemptId: 'B-c1-1-failed',
      attempt: 2,
      status: 'failed',
      counts: { topSeverityMissed: 3 },
      receipt: { ...first.receipt, workspaceId: 'ws-failed' },
    });
    retry.counts = claimed === undefined ? {} : { topSeverityMissed: claimed };
    rows.push(retry);
    const result = read(declaration(), rows, { seal: false });
    check(
      outcomeOf(result) === 'blocked' && hasReason(result, /B-c1-1-failed \(count topSeverityMissed is .*, the scorer gives 3/),
      `a failed retry that ${label} the miss its saved document shows blocks, got ${outcomeOf(result)}`,
    );
  }

  // Attempts that name no receipt, stage, input or native record do not enter the decision.
  const bare = (row, status) => ({
    attemptId: `${row.attemptId}-bare`,
    arm: row.arm,
    caseId: row.caseId,
    repetition: row.repetition,
    blockId: row.blockId,
    attempt: 2,
    status,
    cost: { currency: 'USD', components: { target: 5, tools: 0 } },
    observed: clone(row.observed),
  });
  const padded = world();
  padded.push(...padded.filter((row) => row.arm === 'A').map((row) => bare(row, 'canceled')));
  const paddedResult = read(declaration(), padded);
  check(
    outcomeOf(paddedResult) === 'blocked' &&
      hasReason(
        paddedResult,
        /-bare \(no fresh generation receipt; the row does not record its stage; no input hash; no native record reference\)/,
      ),
    `bare canceled baseline rows cannot inflate the baseline cost, got ${outcomeOf(paddedResult)}`,
  );
  const scoredAsFailure = declaration({ mutate: (body) => (body.design.failureRules = { timeout: 'failure', failureMetricValue: 0 }) });
  const claimedTimeout = world({
    mutateRow: (row, i, repetition) => {
      if (row.arm === 'A' && i < 3 && repetition === 1) {
        row.status = 'timeout';
        row.metrics = {};
        delete row.stage;
        delete row.outputText;
        row.outputSha256 = 'x';
        row.receipt.artifactSha256 = 'x';
      }
    },
  });
  const claimedTimeoutResult = read(scoredAsFailure, claimedTimeout, { seal: false });
  check(
    outcomeOf(claimedTimeoutResult) === 'blocked' && hasReason(claimedTimeoutResult, /does not record its stage/),
    'a timeout scored as a failure still has to identify itself',
  );
  const honestTimeout = world({
    mutateRow: (row, i, repetition) => {
      if (row.arm === 'B' && i === 0 && repetition === 1) {
        row.status = 'timeout';
        row.metrics = {};
        row.counts = {};
        delete row.outputText;
        row.outputSha256 = null;
        row.receipt.artifactSha256 = null;
      }
    },
  });
  const honestResult = read(scoredAsFailure, honestTimeout, { seal: false });
  check(
    outcomeOf(honestResult) !== 'blocked' &&
      honestResult.evidenceIndex.rows.find((row) => row.attemptId === 'B-c1-1-1').verification === 'verified',
    `a timeout that saved nothing carries a receipt without an artifact hash and scores as a failure, got ${outcomeOf(honestResult)}: ${reasonsOf(honestResult).join(' | ')}`,
  );
  const successfulFailure = declaration({ mutate: (body) => (body.design.failureRules = { timeout: 'failure', failureMetricValue: 1 }) });
  check(
    experiment
      .validateDeclaration(successfulFailure)
      .pairedProblems.some((problem) => problem.where === 'design.failureRules.failureMetricValue'),
    'a failure value that would count as a success is refused',
  );

  // The dispatch order covers retries, and equal start times show no order.
  const lateRetry = world();
  const lateFirst = candidateRow(lateRetry, 'c2', 1);
  const late = seal({
    ...clone(lateFirst),
    attemptId: 'B-c2-1-late',
    attempt: 2,
    status: 'failed',
    receipt: { ...lateFirst.receipt, workspaceId: 'ws-late', startedAt: '2026-10-20T00:00:00.000Z', endedAt: '2026-10-20T00:01:00.000Z' },
  });
  lateRetry.push(late);
  const lateResult = read(declaration(), lateRetry);
  check(
    outcomeOf(lateResult) === 'blocked' && hasReason(lateResult, /block c2-1 does not finish starting attempts before/),
    `a retry dispatched after every other block breaks its block, got ${outcomeOf(lateResult)}`,
  );
  const sameInstant = world({
    mutateRow: (row) => {
      row.receipt.startedAt = '2026-10-14T00:00:00.000Z';
      row.receipt.endedAt = '2026-10-14T00:01:00.000Z';
    },
  });
  const sameInstantResult = read(declaration(), sameInstant);
  check(
    outcomeOf(sameInstantResult) === 'blocked' && hasReason(sameInstantResult, /does not finish starting attempts before/),
    'attempts that all start at one instant show no dispatch order',
  );

  // A timeout scored as a failure scores the bottom of the scale.
  for (const [label, failureRules, success] of [
    ['just under the success minimums', { timeout: 'failure', failureMetricValue: 0.98 }, { recall: 0.99, precision: 0.99 }],
    ['with no success minimums at all', { timeout: 'failure', failureMetricValue: 1 }, {}],
  ]) {
    const generous = declaration({
      mutate: (body) => {
        body.design.failureRules = failureRules;
        body.gates.success.metrics = success;
      },
    });
    check(
      experiment.validateDeclaration(generous).pairedProblems.some((problem) => problem.where === 'design.failureRules.failureMetricValue'),
      `a failure value ${label} is refused`,
    );
  }
  const allTimeouts = world({
    mutateRow: (row) => {
      if (row.arm !== 'B') return;
      row.status = 'timeout';
      row.metrics = {};
      row.counts = {};
      delete row.outputText;
      row.outputSha256 = null;
      row.receipt.artifactSha256 = null;
    },
  });
  const allTimeoutsResult = read(scoredAsFailure, allTimeouts, { seal: false });
  check(
    outcomeOf(allTimeoutsResult) === 'inconclusive',
    `a candidate that only times out does not clear, got ${outcomeOf(allTimeoutsResult)}`,
  );
  const overRange = read(declaration(), world({ mutateRow: (row, i) => row.arm === 'B' && i === 0 && (row.metrics.recall = 1.2) }));
  check(
    outcomeOf(overRange) === 'blocked' && hasReason(overRange, /required metric outside \[0, 1\]: B\/c1\/1\/recall/),
    'a required metric outside [0, 1] blocks',
  );

  // A candidate attempt relabeled out of the stage, or a retry with no first attempt.
  const relabel = (change) => {
    const rows = world();
    const missed = seal({
      ...clone(candidateRow(rows, 'c1', 1)),
      attemptId: 'B-c1-1-missed',
      attempt: 2,
      counts: { topSeverityMissed: 2 },
    });
    missed.receipt.workspaceId = 'ws-missed';
    change(missed);
    rows.push(missed);
    return read(declaration(), rows);
  };
  for (const [label, change] of [
    ['a confirmation case', (row) => (row.caseId = 'k1')],
    ['a case nobody planned', (row) => (row.caseId = 'c1-retry')],
    ['no stage a contrast plans', (row) => (row.stage = 'baseline')],
  ]) {
    const result = relabel(change);
    check(
      outcomeOf(result) === 'blocked' && hasReason(result, /candidate attempts belong to no stage this declaration plans: B-c1-1-missed/),
      `a candidate attempt relabeled to ${label} blocks, got ${outcomeOf(result)}`,
    );
  }
  const confirmationRow = relabel((row) => {
    row.caseId = 'k1';
    row.stage = 'confirmation';
    row.attempt = 1;
  });
  check(
    !hasReason(confirmationRow, /belong to no stage/) &&
      confirmationRow.report.exclusions.some((entry) => entry.attemptId === 'B-c1-1-missed' && entry.reason === 'outside-stage-membership'),
    "a confirmation row on a confirmation case is another stage's evidence and is left out",
  );
  for (const [label, change] of [
    ['a retry with no first attempt', (rows) => (candidateRow(rows, 'c2', 1).attempt = 2)],
    [
      'two first attempts',
      (rows) => {
        const second = seal({ ...clone(candidateRow(rows, 'c2', 1)), attemptId: 'B-c2-1-again', status: 'failed' });
        second.receipt.workspaceId = 'ws-again';
        rows.push(second);
      },
    ],
  ]) {
    const rows = world();
    change(rows);
    const result = read(declaration(), rows);
    check(
      outcomeOf(result) === 'blocked' && hasReason(result, /attempt numbers do not run 1, 2, ... without a gap or a repeat: B\/c2\/1/),
      `${label} blocks, got ${outcomeOf(result)}`,
    );
  }

  // A retry outside its pair's block, and a copy that disagrees on anything.
  for (const [label, blockId] of [
    ['with no block', undefined],
    ["in another pair's block", 'c3-2'],
  ]) {
    const rows = world();
    const pairFirst = candidateRow(rows, 'c2', 1);
    const retry = seal({ ...clone(pairFirst), attemptId: 'B-c2-1-retry', attempt: 2, status: 'failed', blockId });
    retry.receipt.workspaceId = 'ws-c2-retry';
    rows.push(retry);
    const result = read(declaration(), rows);
    check(
      outcomeOf(result) === 'blocked' && hasReason(result, /B-c2-1-retry is not in the block c2-1 of its pair/),
      `a retry ${label} blocks, got ${outcomeOf(result)}`,
    );
  }
  for (const [field, change] of [
    ['input hash', (row) => (row.inputSha256 = sha('another prompt'))],
    ['observed identity', (row) => (row.observed.arm.model.resolved = 'cheaper-2026-11')],
    ['stage', (row) => (row.stage = 'baseline')],
  ]) {
    const rows = world();
    const copy = clone(candidateRow(rows, 'c1', 1));
    change(copy);
    rows.push(copy);
    const result = read(declaration(), rows);
    check(
      outcomeOf(result) === 'blocked' && hasReason(result, /disagree with the first: B-c1-1-1/),
      `a copy that differs in its ${field} conflicts and blocks, got ${outcomeOf(result)}`,
    );
  }

  // Judge cost exists only with a rubric judge, and never names a task component.
  const judgeEscape = declaration({
    mutate: (body) => (body.resources.costScope = { taskExecution: ['target', 'tools'], judge: ['judge', 'retrieval'] }),
  });
  const judgeRows = world({ mutateRow: (row) => (row.cost.components.retrieval = row.arm === 'B' ? 5 : 0) });
  const judgeResult = read(judgeEscape, judgeRows);
  check(
    outcomeOf(judgeResult) === 'blocked' && hasReason(judgeResult, /neither the task execution nor the judge scope: .*retrieval/),
    'without a rubric judge, a component named as judge cost still has to be classified as task cost',
  );
  const overlap = declaration({ mutate: (body) => (body.resources.costScope = { taskExecution: ['target', 'tools'], judge: ['tools'] }) });
  check(
    experiment.validateDeclaration(overlap).pairedProblems.some((problem) => problem.where === 'resources.costScope.judge'),
    'a judge scope that names a task component is refused',
  );
  const looseSaving = declaration({ objective: 'quality', mutate: (body) => (body.gates.saving = { minFraction: -0.5 }) });
  check(
    experiment.validateDeclaration(looseSaving).pairedProblems.some((problem) => problem.where === 'gates.saving.minFraction'),
    'a declared saving gate needs a fraction in (0, 1) under any objective',
  );

  // Unknown latency blocks before an unsupported design is read descriptively.
  const latencyGate = declaration({
    mutate: (body) => {
      body.gates.latency = { maxIncreaseFraction: 0.5 };
      body.design.sharedBuilds = true;
    },
  });
  const latencyResult = read(latencyGate, world({ mutateRow: (row) => row.arm === 'B' && (row.latency = null) }));
  check(
    outcomeOf(latencyResult) === 'blocked' && hasReason(latencyResult, /task latency is unknown/),
    `unknown latency blocks whatever the design support, got ${outcomeOf(latencyResult)}`,
  );

  // A prompt region change has to change the whole prompt digest too.
  const regionOnly = declaration({
    mutate: (body) => {
      body.scope.changedFactor = { kind: 'prompt', setting: 'promptRegions.examples' };
      body.identity.arms.A.promptRegions = { examples: 'sha256:examples-1' };
      body.identity.arms.B = clone(body.identity.arms.A);
      body.identity.arms.B.promptRegions = { examples: 'sha256:examples-2' };
    },
  });
  const regionOnlyResult = read(regionOnly, world({ mutateRow: (row) => (row.observed.arm = clone(regionOnly.identity.arms[row.arm])) }));
  check(
    outcomeOf(regionOnlyResult) === 'revised-design-required' && hasReason(regionOnlyResult, /promptDigest stays the same/),
    'a prompt region change whose prompt digest stays the same is refused',
  );

  // A descriptive reading checks no attempt and says so.
  const descriptive = read(
    declaration({ mutate: (body) => delete body.scope.candidate }),
    world().filter((row) => row.arm === 'A'),
  );
  check(
    descriptive.evidenceIndex.rows.length > 0 && descriptive.evidenceIndex.rows.every((row) => row.verification === 'not-checked'),
    'rows of a descriptive reading are marked not-checked',
  );
}

/* -------------------------------------------------------------------------- */

async function main() {
  checkBootstrapAgainstReference();
  checkDeclarations();
  checkAcceptance1();
  checkAcceptance2();
  checkAcceptance3();
  checkAcceptance4();
  checkAcceptance5();
  checkAcceptance6();
  checkAcceptance7();
  checkAcceptance8();
  await checkAcceptance9();
  checkAcceptance10();
  checkClaimedEvidence();
  await checkRecordedEvidenceVerification();
  checkCriticalCountsCannotBeExcused();
  checkAllInCostScope();
  checkConfirmationFollowsSelection();
  checkOneNamedSetting();
  checkObservedPairingAndOrder();
  checkEveryAttemptIsAccountedFor();
  checkAdversarialInputs();
  checkRuleByRule();
  checkOutputsAndCommandLine();

  if (failures.length > 0) {
    console.error(`${colors.red}configuration experiment: ${failures.length} failure(s) across ${checks} checks${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`${colors.green}configuration experiment: ${checks} checks passed${colors.reset}`);
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exit(1);
});
