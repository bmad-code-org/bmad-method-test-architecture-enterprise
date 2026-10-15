/**
 * Offline reader for repeatability and one-factor configuration experiments.
 *
 * WHAT IT DOES
 *
 * It reads a frozen declaration and saved evidence (recorded Test Design runs, or
 * evidence rows another tool wrote) and returns an advisory report: a JSON object,
 * a Markdown rendering, and an evidence index with one row per attempt. It runs no
 * subprocess, calls no model, replaces no grader, and writes nothing unless
 * `writeOutputs` is called with an output directory the operator names.
 *
 * TWO MODES
 *
 * Descriptive repeatability works on whatever artifacts exist: per-case success
 * fractions, metric spread, the native stability signature of each repetition, and a
 * replay of the deterministic scorer over the saved bytes of each document. Replay
 * is a control on the scorer. It is a separate result and never replaces what the
 * native run recorded.
 *
 * The paired contrast compares one baseline with one candidate that differs in
 * exactly one declared setting. It needs a frozen declaration, verified attempts
 * (receipt, saved bytes, native record and a scorer that reproduces the row's
 * numbers), complete pairs in recorded pairing blocks, and all-in cost evidence where
 * the objective is cost. A confirmation also needs the pinned selection-cleared
 * report it follows. Anything
 * missing yields an explicit `blocked`, `new-baseline-required`, `descriptive-only` or
 * `inconclusive` outcome, never an invented value.
 *
 * DECISION ORDER (one place, `decide`)
 *
 *   1. an unusable declaration, or a confirmation without its pinned selection-cleared
 *      report, blocks
 *   2. changed task, ground truth, rubric, scorer, thresholds or arm identity
 *      requires a new baseline; a second changed setting, or a setting whose requested
 *      and resolved or applied identities do not change together, requires a revised design
 *   3. a verified candidate critical miss rejects, whatever the averages or costs say
 *   4. a binding native gate that is red rejects
 *   5. claimed evidence the reader cannot verify, an unverified critical miss, an
 *      unrecorded critical count, incomplete pairs, missing pairing blocks, a dispatch
 *      order off the declared schedule, unknown or unclassified required cost, unknown
 *      latency under a latency gate, non-finite data or an unusable exposure ledger blocks
 *   6. an unsupported design stays descriptive-only
 *   7. too few clusters, a degenerate interval or a bootstrap that fails its
 *      reference fixtures is inconclusive
 *   8. every required lower bound must strictly exceed its threshold; equality does
 *      not pass. A failed bound is inconclusive. Failing to show noninferiority
 *      proves nothing about inferiority.
 *
 * The outcome is an advisory analysis. It carries no native EQ verdict, accepts no
 * baseline and applies no patch. A pass during selection is `selection-cleared`;
 * only a confirmation stage on untouched cases can recommend.
 *
 * STATISTICS
 *
 * The estimator is the equal-weight paired case-cluster percentile bootstrap. Each
 * case is a cluster. Within a cluster each arm's complete planned repetitions are
 * averaged first, then the paired difference (candidate minus baseline) is taken.
 * Each of B resamples draws n whole clusters with replacement, with the same draws
 * for every contrast, and averages them. The one-sided lower bound is the alpha
 * quantile of the B resampled means. Alpha, B, the seed, the PRNG (`mulberry32`) and the
 * quantile convention are declared and frozen. Before any bound can support a
 * decision the bootstrap is run against reference fixtures (`CALIBRATION_FIXTURES`)
 * whose expected values come from an independent implementation.
 *
 * Usage:
 *   node test/lib/configuration-experiment.js freeze <declaration.json>
 *   node test/lib/configuration-experiment.js digest <experiment-report.json>
 *   node test/lib/configuration-experiment.js analyze <evidence.json> --out <directory>
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { projectTestDesignResult } = require('./test-design-result');
const { readDesign, scoreRun, signatureOf, loadGroundTruth, testDesignDiagnosticProjection } = require('../eval-test-design');
const { numericContributions } = require('./eval-record');

const SCHEMA_VERSION = '1.0.0';
const MAX_REPEATS = 1000;
const MAX_BOOTSTRAP_RESAMPLES = 1_000_000;
const ANALYSIS_VERSION = '1.0.0';
const ARMS = Object.freeze(['A', 'B']);
const STAGES = Object.freeze(['baseline', 'selection', 'confirmation']);
const STATUSES = Object.freeze(['completed', 'failed', 'canceled', 'invalid', 'timeout']);
const FACTOR_KINDS = Object.freeze(['model', 'effort', 'prompt']);
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const TOKEN_CATEGORIES = Object.freeze(['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens']);
const QUANTILES = Object.freeze(['linear', 'nearest-rank']);
const REQUIRED_TASK_COMPONENTS = Object.freeze(['target', 'tools']);
const DEFAULT_COST_SCOPE = Object.freeze({ taskExecution: REQUIRED_TASK_COMPONENTS, judge: ['judge'] });
const SIGNATURE_COMPONENTS = Object.freeze([
  'set',
  'mentions',
  'shape',
  'shapeFailures',
  'links',
  'grounding',
  'ungrounded',
  'ceiling',
  'coverageChecks',
  'orderingChecks',
  'flattenedPriorities',
  'unscoredRiskTables',
  'mutations',
]);
const IDENTITY_KEY_CLASS = Object.freeze({
  suiteDigest: 'task',
  caseDigests: 'task',
  fixtureDigest: 'task',
  promptDigest: 'task',
  groundTruthDigest: 'ground-truth',
  rubricDigest: 'rubric',
  scorerDigest: 'scorer',
  thresholdsDigest: 'thresholds',
});
const OUTCOMES = Object.freeze({
  blocked: 'blocked',
  newBaseline: 'new-baseline-required',
  revisedDesign: 'revised-design-required',
  rejected: 'rejected',
  descriptiveOnly: 'descriptive-only',
  inconclusive: 'inconclusive',
  aaControl: 'aa-control',
  selectionCleared: 'selection-cleared',
  recommend: 'recommend',
});

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;
const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (isObject(value)) {
    const keys = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function digestOf(value) {
  return `sha256:${sha256Hex(canonicalJson(value))}`;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

const clone = (value) => (value === undefined ? undefined : structuredClone(value));

/** A key as one segment of a leaf path: a backslash or dot inside it is escaped. */
const escapeKey = (key) => key.replaceAll('\\', '\\\\').replaceAll('.', String.raw`\.`);

/** The last key of a leaf path, unescaped. */
function lastKey(leaf) {
  let key = '';
  for (let index = 0; index < leaf.length; index += 1) {
    if (leaf[index] === '\\') {
      index += 1;
      key += leaf[index] ?? '';
    } else if (leaf[index] === '.') {
      key = '';
    } else {
      key += leaf[index];
    }
  }
  return key;
}

/**
 * Leaf paths of a nested object. Arrays are leaves. A dot or backslash inside a key is
 * escaped, so a key named `a.b` never collides with the path of `{ a: { b } }`.
 */
function flatten(value, prefix = '', out = Object.create(null)) {
  if (isObject(value)) {
    for (const key of Object.keys(value).sort()) {
      const name = escapeKey(key);
      flatten(value[key], prefix ? `${prefix}.${name}` : name, out);
    }
    if (Object.keys(value).length === 0 && prefix) out[prefix] = {};
  } else if (prefix) {
    out[prefix] = value;
  }
  return out;
}

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

/** Sum that stays unknown: any null/undefined/non-finite term makes the sum null. */
function knownSum(values) {
  let sum = 0;
  for (const value of values) {
    if (!isFiniteNumber(value)) return null;
    sum += value;
  }
  return sum;
}

// ---------------------------------------------------------------------------
// declaration
// ---------------------------------------------------------------------------

/** The text the declaration digest covers: the declaration without its `frozen` block. */
function declarationDigest(declaration) {
  const { frozen, ...rest } = isObject(declaration) ? declaration : {};
  void frozen;
  return digestOf(rest);
}

/** The cases a declaration's stage runs, in declared order. */
function stageCases(declaration) {
  const memberships = declaration?.scope?.memberships ?? {};
  const list = (key) => (Array.isArray(memberships[key]) ? memberships[key] : []);
  if (declaration?.stage === 'confirmation') return [...list('confirmation')];
  if (declaration?.stage === 'selection') return [...list('development'), ...list('validation')];
  return [...list('development')];
}

/**
 * The one setting a contrast changes. `leaves` are the identity leaves it may change;
 * `together` are the leaves that all have to change: a requested model or effort with
 * the one the provider resolved or applied, a prompt region with the digest of the
 * whole prompt. Null when the declaration names no setting its kind allows.
 */
function changedSetting(changedFactor) {
  const kind = changedFactor?.kind;
  const setting = changedFactor?.setting;
  if (kind === 'model' && (setting === undefined || setting === 'model')) {
    return { setting: 'model', leaves: ['model.requested', 'model.resolved'], together: ['model.requested', 'model.resolved'] };
  }
  if (kind === 'effort' && setting === 'effort') {
    return { setting, leaves: ['effort.requested', 'effort.applied'], together: ['effort.requested', 'effort.applied'] };
  }
  // The name after `decode.` or `promptRegions.` is one key, escaped like any leaf path.
  const named = (group) => {
    const name = isNonEmptyString(setting) && setting.startsWith(`${group}.`) ? setting.slice(group.length + 1) : '';
    return name.length > 0 && !name.includes('.') ? `${group}.${escapeKey(name)}` : null;
  };
  if (kind === 'effort' && named('decode')) return { setting, leaves: [named('decode')], together: [named('decode')] };
  if (kind === 'prompt' && named('promptRegions')) {
    return { setting, leaves: [named('promptRegions'), 'promptDigest'], together: [named('promptRegions'), 'promptDigest'] };
  }
  return null;
}

function clusterPlan(declaration) {
  const cases = stageCases(declaration);
  const declared = Array.isArray(declaration?.scope?.clusters) ? declaration.scope.clusters : null;
  if (!declared) return cases.map((caseId) => ({ caseId, clusterId: caseId, weight: 1 / cases.length }));
  return declared.filter(isObject).map((entry) => ({ caseId: entry.caseId, clusterId: entry.clusterId, weight: entry.weight }));
}

/**
 * Validate a declaration. `problems` make it unusable for any mode; `pairedProblems`
 * only block the paired contrast, so a baseline-only declaration stays readable.
 *
 * @param {object} declaration
 * @returns {{problems: Array, pairedProblems: Array, digest: string, frozen: {declared: boolean, matches: boolean|null}}}
 */
function validateDeclaration(declaration) {
  const problems = [];
  const pairedProblems = [];
  const decl = isObject(declaration) ? declaration : {};
  const need = (list, ok, where, message) => {
    if (!ok) list.push({ where, message });
  };

  need(problems, isObject(declaration), 'declaration', 'must be a JSON object');
  need(problems, decl.schemaVersion === SCHEMA_VERSION, 'schemaVersion', `must be ${SCHEMA_VERSION}`);
  need(problems, isNonEmptyString(decl.experimentId), 'experimentId', 'is required');
  need(problems, STAGES.includes(decl.stage), 'stage', `must be one of ${STAGES.join(', ')}`);

  const scope = isObject(decl.scope) ? decl.scope : {};
  need(problems, isNonEmptyString(scope.workflow), 'scope.workflow', 'is required');
  need(problems, isNonEmptyString(scope.owner), 'scope.owner', 'is required');
  need(problems, ['fixed-suite', 'population'].includes(scope.claim), 'scope.claim', 'must be fixed-suite or population');
  need(problems, isNonEmptyString(scope.baseline?.id), 'scope.baseline.id', 'is required');
  need(problems, isObject(scope.memberships), 'scope.memberships', 'is required');
  need(problems, isObject(decl.identity?.fixed), 'identity.fixed', 'is required');
  need(problems, ['none', 'rubric'].includes(scope.judge), 'scope.judge', 'must be none (deterministic scorer) or rubric');
  need(
    problems,
    isPositiveInteger(decl.design?.repeats) && decl.design.repeats <= MAX_REPEATS,
    'design.repeats',
    `must be a positive integer of at most ${MAX_REPEATS}`,
  );
  need(
    problems,
    scope.clusters === undefined || (Array.isArray(scope.clusters) && scope.clusters.every((entry) => isObject(entry))),
    'scope.clusters',
    'must be a list of objects',
  );
  need(
    problems,
    decl.gates?.critical === undefined ||
      (isObject(decl.gates.critical) &&
        Array.isArray(decl.gates.critical.rules) &&
        decl.gates.critical.rules.every((rule) => isObject(rule))),
    'gates.critical.rules',
    'must be a list of objects',
  );
  need(problems, isObject(decl.gates?.success?.metrics), 'gates.success.metrics', 'is required');
  need(
    problems,
    Object.values(decl.gates?.success?.metrics ?? {}).every((value) => isFiniteNumber(value)),
    'gates.success.metrics',
    'every minimum must be a finite number',
  );

  const memberships = isObject(scope.memberships) ? scope.memberships : {};
  const seen = new Map();
  for (const key of ['development', 'validation', 'confirmation']) {
    const list = memberships[key];
    need(problems, list === undefined || Array.isArray(list), `scope.memberships.${key}`, 'must be a list of case ids');
    for (const caseId of Array.isArray(list) ? list : []) {
      if (seen.has(caseId)) problems.push({ where: `scope.memberships.${key}`, message: `${caseId} is also in ${seen.get(caseId)}` });
      else seen.set(caseId, key);
    }
  }
  need(problems, stageCases(decl).length > 0, 'scope.memberships', 'the stage has no cases');

  // -- paired contrast -------------------------------------------------------
  const pairs = pairedProblems;
  need(pairs, ['selection', 'confirmation'].includes(decl.stage), 'stage', 'a paired contrast runs in the selection or confirmation stage');
  need(pairs, isNonEmptyString(scope.candidate?.id), 'scope.candidate.id', 'is required for a paired contrast');
  need(pairs, FACTOR_KINDS.includes(scope.changedFactor?.kind), 'scope.changedFactor.kind', `must be one of ${FACTOR_KINDS.join(', ')}`);
  need(
    pairs,
    !FACTOR_KINDS.includes(scope.changedFactor?.kind) || changedSetting(scope.changedFactor) !== null,
    'scope.changedFactor.setting',
    'must name the one setting that changes: model for a model; effort or decode.<name> for effort; promptRegions.<name> for a prompt',
  );
  need(pairs, ['cost', 'quality'].includes(scope.objective), 'scope.objective', 'must be cost or quality');
  need(pairs, isObject(decl.identity?.arms?.A) && isObject(decl.identity?.arms?.B), 'identity.arms', 'needs an A and a B arm');
  for (const key of ['suiteDigest', 'groundTruthDigest', 'scorerDigest', 'thresholdsDigest', 'rubricDigest']) {
    need(
      pairs,
      decl.identity?.fixed?.[key] !== undefined,
      `identity.fixed.${key}`,
      'is required (use "not-applicable" where nothing applies)',
    );
  }
  need(
    pairs,
    Object.keys(flatten(decl.identity?.fixed ?? {})).some((leaf) => lastKey(leaf) === 'cacheRegime'),
    'identity.fixed',
    'needs a cacheRegime: both arms run under one recorded cache policy',
  );
  for (const arm of ARMS) {
    for (const key of ['model.requested', 'model.resolved', 'effort.requested', 'effort.applied']) {
      const [group, leaf] = key.split('.');
      need(pairs, decl.identity?.arms?.[arm]?.[group]?.[leaf] !== undefined, `identity.arms.${arm}.${key}`, 'is required');
    }
  }

  const plan = Array.isArray(scope.clusters) ? scope.clusters : null;
  need(pairs, plan !== null, 'scope.clusters', 'is required: independent cluster ids and weights per case');
  if (plan) {
    const cases = stageCases(decl);
    const planned = plan.map((entry) => entry?.caseId);
    need(
      pairs,
      cases.every((caseId) => planned.includes(caseId)),
      'scope.clusters',
      'must cover every case of the stage',
    );
    need(
      pairs,
      planned.every((caseId) => cases.includes(caseId)),
      'scope.clusters',
      'names a case outside the stage',
    );
    need(pairs, new Set(planned).size === planned.length, 'scope.clusters', 'names a case twice');
    need(
      pairs,
      plan.every((entry) => isNonEmptyString(entry?.clusterId) && isFiniteNumber(entry?.weight) && entry.weight >= 0),
      'scope.clusters',
      'every entry needs a clusterId and a nonnegative weight',
    );
    const total = plan.reduce((sum, entry) => sum + (isFiniteNumber(entry?.weight) ? entry.weight : 0), 0);
    need(pairs, Math.abs(total - 1) < 1e-9, 'scope.clusters', 'weights must sum to one');
  }

  const design = isObject(decl.design) ? decl.design : {};
  need(pairs, ['interleaved', 'randomized'].includes(design.order), 'design.order', 'must be interleaved or randomized');
  need(pairs, isNonEmptyString(design.isolation), 'design.isolation', 'is required');
  need(pairs, isPositiveInteger(design.maxAttempts), 'design.maxAttempts', 'must be a positive integer');
  need(pairs, isNonEmptyString(design.stoppingRule), 'design.stoppingRule', 'is required');
  need(
    pairs,
    ['incomplete', 'failure'].includes(design.failureRules?.timeout),
    'design.failureRules.timeout',
    'must be incomplete or failure',
  );
  if (design.failureRules?.timeout === 'failure') {
    need(pairs, isFiniteNumber(design.failureRules.failureMetricValue), 'design.failureRules.failureMetricValue', 'is required');
    need(
      pairs,
      design.failureRules.failureMetricValue === 0,
      'design.failureRules.failureMetricValue',
      'must be 0, the bottom of the [0, 1] scale of a required metric: a timeout scored as a failure scores the worst outcome',
    );
    need(
      pairs,
      Object.keys(decl.gates?.success?.metrics ?? {}).length > 0 &&
        Object.values(decl.gates.success.metrics).every((minimum) => minimum > 0),
      'gates.success.metrics',
      'needs a minimum above 0 on every metric under a failure rule, so a failure never counts as a success',
    );
  }
  const analysis = isObject(design.analysis) ? design.analysis : {};
  need(pairs, isFiniteNumber(analysis.alpha) && analysis.alpha > 0 && analysis.alpha < 0.5, 'design.analysis.alpha', 'must be in (0, 0.5)');
  need(
    pairs,
    isPositiveInteger(analysis.B) && analysis.B >= 1000 && analysis.B <= MAX_BOOTSTRAP_RESAMPLES,
    'design.analysis.B',
    `must be an integer from 1000 to ${MAX_BOOTSTRAP_RESAMPLES}`,
  );
  need(
    pairs,
    Number.isInteger(analysis.seed) && analysis.seed >= 0 && analysis.seed <= 0xff_ff_ff_ff,
    'design.analysis.seed',
    'must be a uint32',
  );
  need(pairs, analysis.prng === 'mulberry32', 'design.analysis.prng', 'must be mulberry32');
  need(pairs, QUANTILES.includes(analysis.quantile), 'design.analysis.quantile', `must be one of ${QUANTILES.join(', ')}`);
  need(pairs, typeof analysis.simultaneous === 'boolean', 'design.analysis.simultaneous', 'must be true or false');

  const gates = isObject(decl.gates) ? decl.gates : {};
  const quality = isObject(gates.quality) ? gates.quality : {};
  need(pairs, Object.keys(quality).length > 0, 'gates.quality', 'needs at least one required metric');
  for (const [metric, rule] of Object.entries(quality)) {
    const loss = isFiniteNumber(rule?.maxLoss) && rule.maxLoss >= 0 && rule.maxLoss < 1;
    const gain = isFiniteNumber(rule?.minImprovement) && rule.minImprovement > 0;
    const keys = isObject(rule) ? ['maxLoss', 'minImprovement'].filter((key) => key in rule) : [];
    need(
      pairs,
      keys.length === 1 && (loss || gain),
      `gates.quality.${metric}`,
      'needs exactly one of maxLoss in [0, 1) or minImprovement (> 0)',
    );
  }
  if (scope.objective === 'cost') {
    need(
      pairs,
      Object.values(quality).every((rule) => isFiniteNumber(rule?.maxLoss)),
      'gates.quality',
      'a cost objective allows quality loss only',
    );
  }
  if (scope.objective === 'cost' || gates.saving !== undefined) {
    need(
      pairs,
      isFiniteNumber(gates.saving?.minFraction) && gates.saving.minFraction > 0 && gates.saving.minFraction < 1,
      'gates.saving.minFraction',
      'must be in (0, 1) for a cost objective or a declared saving gate',
    );
  }
  if (scope.objective === 'quality') {
    need(
      pairs,
      Object.values(quality).some((rule) => isFiniteNumber(rule?.minImprovement)),
      'gates.quality',
      'a quality objective needs a minImprovement metric',
    );
  }
  const floors = isObject(gates.floors) ? gates.floors : {};
  for (const [metric, floor] of Object.entries(floors)) {
    need(pairs, isFiniteNumber(floor) && metric in quality, `gates.floors.${metric}`, 'needs a finite floor on a required quality metric');
  }
  if (gates.latency !== undefined) {
    need(
      pairs,
      isFiniteNumber(gates.latency?.maxIncreaseFraction) && gates.latency.maxIncreaseFraction >= 0,
      'gates.latency.maxIncreaseFraction',
      'must be >= 0',
    );
  }
  need(
    pairs,
    gates.critical?.tolerance === 0 && Array.isArray(gates.critical?.rules) && gates.critical.rules.length > 0,
    'gates.critical',
    'needs tolerance 0 and at least one rule',
  );
  for (const [index, rule] of (Array.isArray(gates.critical?.rules) ? gates.critical.rules : []).entries()) {
    need(
      pairs,
      isNonEmptyString(rule?.id) && isNonEmptyString(rule?.count),
      `gates.critical.rules[${index}]`,
      'needs an id and a count name',
    );
  }
  need(
    pairs,
    isObject(decl.resources) && 'authorization' in decl.resources,
    'resources.authorization',
    'is required (null means no live execution)',
  );
  const costScope = decl.resources?.costScope;
  if (costScope !== undefined) {
    const names = (list) => Array.isArray(list) && list.every((name) => isNonEmptyString(name));
    need(
      pairs,
      isObject(costScope) && (costScope.taskExecution === undefined || names(costScope.taskExecution)),
      'resources.costScope.taskExecution',
      'must be a list of component names',
    );
    need(
      pairs,
      REQUIRED_TASK_COMPONENTS.every((name) => (costScope?.taskExecution ?? REQUIRED_TASK_COMPONENTS).includes(name)),
      'resources.costScope.taskExecution',
      `must include ${REQUIRED_TASK_COMPONENTS.join(' and ')}: task execution cost is all-in, retries included`,
    );
    need(
      pairs,
      isObject(costScope) && (costScope.judge === undefined || names(costScope.judge)),
      'resources.costScope.judge',
      'must be a list of component names',
    );
    need(
      pairs,
      !(
        Array.isArray(costScope?.judge) &&
        costScope.judge.some((name) => (costScope?.taskExecution ?? REQUIRED_TASK_COMPONENTS).includes(name))
      ),
      'resources.costScope.judge',
      'must name no task execution component',
    );
  }
  need(pairs, isNonEmptyString(decl.frozen?.digest), 'frozen.digest', 'a paired contrast needs a frozen declaration');
  if (decl.stage === 'confirmation') {
    const pin = decl.exposure?.ledgerHeadAtFreeze;
    need(
      pairs,
      isNonEmptyString(pin?.head) && isPositiveInteger(pin?.length),
      'exposure.ledgerHeadAtFreeze',
      'a confirmation pins the selection ledger it was frozen against',
    );
    need(
      pairs,
      isNonEmptyString(decl.selection?.declarationDigest) && isNonEmptyString(decl.selection?.reportDigest),
      'selection',
      'a confirmation pins the digests of the selection declaration and of its selection-cleared report',
    );
  }

  const digest = declarationDigest(decl);
  const declared = isNonEmptyString(decl.frozen?.digest);
  return { problems, pairedProblems, digest, frozen: { declared, matches: declared ? decl.frozen.digest === digest : null } };
}

// ---------------------------------------------------------------------------
// evidence rows
// ---------------------------------------------------------------------------

/** Milliseconds of an ISO 8601 timestamp with a zone, or null. */
function timestampMs(value) {
  if (typeof value !== 'string' || !TIMESTAMP.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** A row's receipt when its shape holds: kind, workspace, ordered ISO times and the artifact hash it claims. */
function validReceipt(raw) {
  const receipt = raw.receipt;
  if (!isObject(receipt)) return { receipt: null, problem: null };
  if (receipt.kind !== 'fresh-workspace') return { receipt: null, problem: 'receipt kind is not fresh-workspace' };
  if (!isNonEmptyString(receipt.workspaceId)) return { receipt: null, problem: 'receipt has no workspaceId' };
  if (!isNonEmptyString(receipt.startedAt) || !isNonEmptyString(receipt.endedAt))
    return { receipt: null, problem: 'receipt has no start and end time' };
  const started = timestampMs(receipt.startedAt);
  const ended = timestampMs(receipt.endedAt);
  if (started === null || ended === null) return { receipt: null, problem: 'receipt start and end are not ISO 8601 timestamps' };
  if (ended < started) return { receipt: null, problem: 'receipt ends before it starts' };
  const savedNothing =
    raw.status !== 'completed' &&
    (raw.outputSha256 ?? null) === null &&
    (receipt.artifactSha256 ?? null) === null &&
    (raw.outputText ?? null) === null;
  if (!savedNothing && (!isNonEmptyString(receipt.artifactSha256) || receipt.artifactSha256 !== raw.outputSha256)) {
    return { receipt: null, problem: 'receipt artifactSha256 does not match outputSha256' };
  }
  return { receipt: clone(receipt), problem: null };
}

/** A copy of a row's metrics or counts with missing values as null. */
function numberMap(value) {
  const out = Object.create(null);
  for (const [key, entry] of Object.entries(isObject(value) ? value : {})) out[key] = entry === null || entry === undefined ? null : entry;
  return out;
}

/** One raw evidence row into the normalized form the analysis reads. Never throws. */
function normalizeRow(raw, inputIndex) {
  const problems = [];
  const source = isObject(raw) ? raw : {};
  if (!isObject(raw)) problems.push('row is not an object');
  if (!isNonEmptyString(source.attemptId)) problems.push('no attemptId');
  if (!ARMS.includes(source.arm)) problems.push('arm must be A or B');
  if (!isNonEmptyString(source.caseId)) problems.push('no caseId');
  if (!isPositiveInteger(source.repetition)) problems.push('repetition must be a positive integer');
  if (!STATUSES.includes(source.status)) problems.push(`status must be one of ${STATUSES.join(', ')}`);

  const { receipt, problem: receiptProblem } = validReceipt(source);
  const metrics = numberMap(source.metrics);
  const counts = numberMap(source.counts);
  const nonFinite = [...Object.entries(metrics), ...Object.entries(counts)].some(([, value]) => value !== null && !isFiniteNumber(value));
  const text = typeof source.outputText === 'string' ? source.outputText : null;
  const hashMismatch = text !== null && isNonEmptyString(source.outputSha256) && `sha256:${sha256Hex(text)}` !== source.outputSha256;

  return {
    inputIndex,
    attemptId: isNonEmptyString(source.attemptId) ? source.attemptId : null,
    runId: source.runId ?? null,
    stage: source.stage ?? null,
    arm: ARMS.includes(source.arm) ? source.arm : null,
    caseId: isNonEmptyString(source.caseId) ? source.caseId : null,
    clusterId: isNonEmptyString(source.clusterId) ? source.clusterId : isNonEmptyString(source.caseId) ? source.caseId : null,
    blockId: source.blockId ?? null,
    buildId: source.buildId ?? null,
    repetition: isPositiveInteger(source.repetition) ? source.repetition : null,
    attemptNumber: isPositiveInteger(source.attempt) ? source.attempt : null,
    status: source.status ?? null,
    error: source.error ?? null,
    retryOf: source.retryOf ?? null,
    receipt,
    receiptProblem: receiptProblem ?? (source.receipt && !receipt ? 'receipt is not an object' : null),
    inputSha256: source.inputSha256 ?? null,
    outputSha256: source.outputSha256 ?? null,
    outputText: text,
    hashMismatch,
    native: clone(source.native ?? null),
    metrics,
    counts,
    notApplicable: Array.isArray(source.notApplicable) ? [...source.notApplicable].sort() : [],
    nonFinite,
    critical: Array.isArray(source.critical) ? [...source.critical] : [],
    usage: isObject(source.usage) ? numberMap(source.usage) : null,
    cost: isObject(source.cost) ? { currency: source.cost.currency ?? null, components: numberMap(source.cost.components) } : null,
    latency: isObject(source.latency) ? numberMap(source.latency) : null,
    observed: clone(source.observed ?? null),
    provenance: clone(source.provenance ?? null),
    problems,
  };
}

/** Price token usage. Null unless every rate and every token count is present and finite. */
function priceUsage(usage, pricing) {
  if (!isObject(usage) || !isObject(pricing?.perMillionTokens) || !isNonEmptyString(pricing?.currency)) return null;
  let total = 0;
  for (const category of TOKEN_CATEGORIES) {
    const tokens = usage[category];
    const rate = pricing.perMillionTokens[category];
    if (!isFiniteNumber(tokens) || tokens < 0 || !isFiniteNumber(rate) || rate < 0) return null;
    total += (tokens * rate) / 1e6;
  }
  return { currency: pricing.currency, amount: total };
}

/**
 * The cost components of one attempt. A missing component is unknown, never zero.
 * `target` can be derived from complete usage and a complete price sheet; the
 * derivation is recorded.
 */
function attemptCostComponents(row, pricing) {
  const components = { ...row.cost?.components };
  const derived = [];
  const currency = row.cost?.currency ?? null;
  if (!isFiniteNumber(components.target)) {
    const priced = priceUsage(row.usage, pricing);
    if (priced && (currency === null || currency === priced.currency)) {
      components.target = priced.amount;
      derived.push('target');
      return { components, currency: priced.currency, derived };
    }
  }
  return { components, currency, derived };
}

function scopedCost(rows, names, pricing) {
  const parts = [];
  const unknown = [];
  const currencies = new Set();
  for (const row of rows) {
    const { components, currency } = attemptCostComponents(row, pricing);
    for (const name of names) {
      if (isFiniteNumber(components[name]) && components[name] >= 0 && currency !== null) {
        parts.push(components[name]);
        currencies.add(currency);
      } else {
        parts.push(null);
        unknown.push({ attemptId: row.attemptId, component: name });
      }
    }
  }
  const mixed = currencies.size > 1;
  const total = mixed || rows.length === 0 ? null : knownSum(parts);
  return { total, unknown, currency: currencies.size === 1 ? [...currencies][0] : null, mixedCurrency: mixed };
}

/**
 * Drop copies. Two rows with one attemptId are one trial; two attempts that claim one
 * fresh workspace are one trial. The later row is excluded and says why. A copy that
 * differs from the first in anything but its attempt id and input position conflicts.
 */
function rowContent(row) {
  const { inputIndex, attemptId, problems, ...content } = row;
  void [inputIndex, attemptId, problems];
  return canonicalJson(content);
}

/** Kept rows and excluded copies, malformed rows and shared workspaces, each exclusion with its reason. */
function classifyRows(rows) {
  const byAttempt = new Map();
  const byWorkspace = new Map();
  const kept = [];
  const excluded = [];
  for (const row of rows) {
    if (row.problems.length > 0) {
      excluded.push({ row, reason: 'malformed-row', detail: row.problems.join('; ') });
      continue;
    }
    if (byAttempt.has(row.attemptId)) {
      const first = byAttempt.get(row.attemptId);
      excluded.push({
        row,
        reason: 'duplicate-attempt-id',
        detail: `attemptId already used by ${first.arm}/${first.caseId}`,
        sharedAcrossArms: first.arm !== row.arm,
        conflicting: rowContent(row) !== rowContent(first),
      });
      continue;
    }
    byAttempt.set(row.attemptId, row);
    if (row.receipt) {
      const owner = byWorkspace.get(row.receipt.workspaceId);
      if (owner) {
        excluded.push({
          row,
          reason: 'copied-trial',
          detail: `shares fresh workspace ${row.receipt.workspaceId} with ${owner.attemptId}`,
          sharedAcrossArms: owner.arm !== row.arm,
          conflicting: rowContent(row) !== rowContent(owner),
        });
        continue;
      }
      byWorkspace.set(row.receipt.workspaceId, row);
    }
    kept.push(row);
  }
  return { kept, excluded };
}

// ---------------------------------------------------------------------------
// statistics
// ---------------------------------------------------------------------------

/** mulberry32: a 32-bit seeded generator. Returns floats in [0, 1). */
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function quantileOf(sortedAscending, probability, convention) {
  const count = sortedAscending.length;
  if (convention === 'nearest-rank') return sortedAscending[Math.max(0, Math.ceil(probability * count) - 1)];
  const position = (count - 1) * probability;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sortedAscending[low] + (position - low) * (sortedAscending[high] - sortedAscending[low]);
}

/**
 * Equal-weight paired case-cluster percentile bootstrap.
 *
 * @param {object} input
 * @param {Object<string, number[]>} input.contrasts Per contrast, one finite number per cluster.
 * @param {number} input.B Resample count.
 * @param {number} input.seed uint32 seed of mulberry32.
 * @param {number} input.alpha Level of the one-sided lower bound.
 * @param {'linear'|'nearest-rank'} input.quantile Interpolation convention.
 * @returns {Object<string, {estimate: number, lower: number, clusters: number, degenerate: boolean}>}
 */
function pairedClusterBootstrap({ contrasts, B, seed, alpha, quantile }) {
  const names = Object.keys(contrasts);
  const out = {};
  if (names.length === 0) return out;
  const n = contrasts[names[0]].length;
  const random = mulberry32(seed);
  const resampled = Object.fromEntries(names.map((name) => [name, Array.from({ length: B })]));
  for (let b = 0; b < B; b += 1) {
    const sums = Object.fromEntries(names.map((name) => [name, 0]));
    for (let draw = 0; draw < n; draw += 1) {
      const index = Math.floor(random() * n);
      for (const name of names) sums[name] += contrasts[name][index];
    }
    for (const name of names) resampled[name][b] = sums[name] / n;
  }
  for (const name of names) {
    const values = contrasts[name];
    const sorted = [...resampled[name]].sort((left, right) => left - right);
    out[name] = {
      estimate: mean(values),
      lower: quantileOf(sorted, alpha, quantile),
      clusters: n,
      degenerate: Math.min(...values) === Math.max(...values),
    };
  }
  return out;
}

/**
 * Reference fixtures for the bootstrap. The expected values were produced by an
 * independent implementation (Python, written separately from this file) and are
 * held to 1e-12. A bootstrap that does not reproduce them cannot support a decision.
 */
const CALIBRATION_FIXTURES = deepFreeze([
  {
    name: 'six clusters, linear quantile',
    contrasts: { quality: [0.02, -0.01, 0.03, 0, 0.04, -0.02], cost: [0.3, 0.25, 0.4, 0.2, 0.35, 0.28] },
    B: 1000,
    seed: 20_261_014,
    alpha: 0.05,
    quantile: 'linear',
    expected: {
      quality: { estimate: 0.01, lower: -0.005 },
      cost: { estimate: 0.296_666_666_666_666_7, lower: 0.255 },
    },
  },
  {
    name: 'eight clusters, nearest-rank quantile',
    contrasts: { quality: [-0.05, 0.01, 0.02, -0.03, 0.04, 0.06, -0.01, 0] },
    B: 2000,
    seed: 7,
    alpha: 0.1,
    quantile: 'nearest-rank',
    expected: { quality: { estimate: 0.005, lower: -0.01 } },
  },
  {
    name: 'twelve distinct clusters, linear quantile between two distinct order statistics',
    contrasts: { m: [0.013, -0.027, 0.041, 0.008, -0.012, 0.036, 0.022, -0.005, 0.017, -0.031, 0.029, 0.003] },
    B: 1000,
    seed: 314_159,
    alpha: 0.037,
    quantile: 'linear',
    expected: { m: { estimate: 0.007_833_333_333_333_333, lower: -0.003_851_833_333_333_332_5 } },
  },
  {
    name: 'twelve distinct clusters, nearest-rank quantile beside a distinct lower neighbour',
    contrasts: { m: [0.013, -0.027, 0.041, 0.008, -0.012, 0.036, 0.022, -0.005, 0.017, -0.031, 0.029, 0.003] },
    B: 1000,
    seed: 314_159,
    alpha: 0.0435,
    quantile: 'nearest-rank',
    expected: { m: { estimate: 0.007_833_333_333_333_333, lower: -0.003_416_666_666_666_667 } },
  },
]);

/** Run a bootstrap implementation against the reference fixtures. */
function runCalibration(bootstrap = pairedClusterBootstrap) {
  const failures = [];
  for (const fixture of CALIBRATION_FIXTURES) {
    let result;
    try {
      result = bootstrap({
        contrasts: clone(fixture.contrasts),
        B: fixture.B,
        seed: fixture.seed,
        alpha: fixture.alpha,
        quantile: fixture.quantile,
      });
    } catch (error) {
      failures.push({ fixture: fixture.name, problem: `threw ${error.message}` });
      continue;
    }
    for (const [name, expected] of Object.entries(fixture.expected)) {
      for (const field of ['estimate', 'lower']) {
        const actual = result?.[name]?.[field];
        if (!isFiniteNumber(actual) || Math.abs(actual - expected[field]) > 1e-12) {
          failures.push({ fixture: fixture.name, problem: `${name}.${field} is ${actual}, expected ${expected[field]}` });
        }
      }
    }
  }
  return { passed: failures.length === 0, fixtures: CALIBRATION_FIXTURES.length, failures };
}

/**
 * One gate: the lower bound has to strictly exceed the threshold, by more than floating-point rounding. Equality does not pass.
 *
 * @param {number} lower
 * @param {number} threshold
 * @returns {boolean}
 */
function lowerBoundClears(lower, threshold) {
  if (!isFiniteNumber(lower) || !isFiniteNumber(threshold)) return false;
  // An excess of floating-point rounding size is equality, and equality does not pass.
  const rounding = 1e-12 * Math.max(1, Math.abs(lower), Math.abs(threshold));
  return lower - threshold > rounding;
}

// ---------------------------------------------------------------------------
// exposure ledger
// ---------------------------------------------------------------------------

const LEDGER_GENESIS = 'sha256:genesis';

function ledgerEntryHash(entry, previous) {
  const { hash, ...rest } = entry;
  void hash;
  return `sha256:${sha256Hex(`${previous}\n${canonicalJson(rest)}`)}`;
}

/** Build a ledger entry that extends `previous` (the head hash of the ledger so far). */
function appendExposure(ledger, entry) {
  const previous = ledger.length === 0 ? LEDGER_GENESIS : ledger.at(-1).hash;
  const next = { seq: ledger.length + 1, ...entry };
  return [...ledger, { ...next, hash: ledgerEntryHash(next, previous) }];
}

/**
 * Verify the ledger chain. Removing, reordering or editing an entry changes a hash.
 * `pins` carry heads recorded earlier (the frozen declaration, a prior report); each
 * pinned head must still be in the chain at its recorded length.
 */
function verifyLedger(ledger, pins = []) {
  const problems = [];
  let previous = LEDGER_GENESIS;
  for (const [index, entry] of ledger.entries()) {
    if (!isObject(entry)) {
      problems.push(`entry ${index + 1} is not an object`);
      previous = null;
      continue;
    }
    if (entry.seq !== index + 1) problems.push(`entry ${index + 1} has seq ${entry.seq}`);
    if (entry.hash !== ledgerEntryHash(entry, previous)) problems.push(`entry ${index + 1} does not extend the chain`);
    previous = entry.hash;
  }
  for (const pin of pins) {
    if (!isObject(pin) || !isNonEmptyString(pin.head) || !isPositiveInteger(pin.length)) {
      problems.push('a pinned ledger head needs a head and a length');
      continue;
    }
    if (ledger.length < pin.length || ledger[pin.length - 1].hash !== pin.head) {
      problems.push(`pinned head at length ${pin.length} is no longer in the ledger`);
    }
  }
  return { ok: problems.length === 0, problems, head: ledger.length === 0 ? null : ledger.at(-1).hash, length: ledger.length };
}

/** The exposure ledger checked against its pins and against what this stage's cases may have seen. */
function exposureProblems(declaration, ledger, resume, extraPins = []) {
  if (!Array.isArray(ledger)) return { blockers: ['exposure ledger is missing'], burned: [], ledger: null };
  const pins = [...extraPins];
  if (isObject(declaration?.exposure?.ledgerHeadAtFreeze)) pins.push(declaration.exposure.ledgerHeadAtFreeze);
  if (isObject(resume?.ledger)) pins.push(resume.ledger);
  const verified = verifyLedger(ledger, pins);
  const blockers = verified.problems.map((problem) => `exposure ledger: ${problem}`);
  const candidate = declaration?.scope?.candidate?.id;
  const memberships = declaration?.scope?.memberships ?? {};
  const burned = [];
  const confirmation = declaration?.stage === 'confirmation';
  for (const caseId of stageCases(declaration)) {
    const entries = ledger.filter((entry) => entry.caseId === caseId);
    const recorded = entries.some(
      (entry) =>
        (confirmation ? entry.kind === 'confirmation-exposure' : entry.kind === 'selection-exposure') && entry.candidateId === candidate,
    );
    if (!recorded) blockers.push(`exposure of ${caseId} to ${candidate} is not recorded in the ledger`);
    if (!confirmation) {
      for (const entry of entries) {
        if (entry.kind === 'confirmation-exposure') burned.push({ caseId, reason: `was used to confirm ${entry.candidateId}` });
      }
      continue;
    }
    for (const entry of entries) {
      if (entry.kind === 'selection-exposure') burned.push({ caseId, reason: 'was exposed during selection' });
      else if (entry.kind === 'confirmation-exposure' && entry.candidateId !== candidate) {
        burned.push({ caseId, reason: `was already used to confirm ${entry.candidateId}` });
      }
    }
  }
  void memberships;
  return { blockers, burned, ledger: verified };
}

/** What a confirmation keeps from its selection declaration, as leaf paths. */
function frozenAcrossStages(declaration) {
  const copy = clone(declaration);
  for (const key of ['stage', 'frozen', 'exposure', 'selection']) delete copy[key];
  if (isObject(copy.scope)) {
    delete copy.scope.clusters;
    if (isObject(copy.scope.memberships)) delete copy.scope.memberships.confirmation;
  }
  return flatten(copy);
}

/**
 * A confirmation runs only for a candidate that cleared selection. The confirmation
 * declaration pins the selection declaration and its report by digest. The reader reads
 * the selection again from its own evidence, with the same scorer and bootstrap, and
 * the report it gets has to be the pinned one, with a selection-cleared outcome. A
 * report that was edited after the fact therefore never matches. The confirmation may
 * change only its stage, its confirmation cases and their clusters, its ledger pin and
 * these pins. Candidate, baseline, identities, gates, design, analysis and cost rules
 * stay as selection froze them. The selection report's ledger head is pinned too.
 */
function selectionChainProblems(declaration, selection, { replay, bootstrap }) {
  if (declaration.stage !== 'confirmation') return { problems: [], pin: null };
  const selected = isObject(selection?.declaration) ? selection.declaration : null;
  if (!selected) return { problems: ['the frozen selection declaration and its evidence are not supplied'], pin: null };
  const { report } = readExperimentChecked({ ...selection, selection: null, replay, bootstrap });
  const problems = [];
  const selectedDigest = declarationDigest(selected);
  if (selectedDigest !== declaration.selection.declarationDigest)
    problems.push('the selection declaration does not match selection.declarationDigest');
  if (selected.frozen?.digest !== selectedDigest) problems.push('the selection declaration is not frozen at its own digest');
  if (selected.stage !== 'selection')
    problems.push(`the pinned declaration is a ${selected.stage} stage; a confirmation follows a selection`);
  if (digestOf(report) !== declaration.selection.reportDigest) {
    problems.push('the selection evidence does not reproduce the report pinned in selection.reportDigest');
  }
  const outcome = report.contrast?.decision?.outcome ?? 'missing';
  if (outcome !== OUTCOMES.selectionCleared) problems.push(`the selection outcome is ${outcome}; a confirmation needs selection-cleared`);
  const before = frozenAcrossStages(selected);
  const after = frozenAcrossStages(declaration);
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => canonicalJson(before[key]) !== canonicalJson(after[key]))
    .sort();
  if (changed.length > 0) problems.push(`the confirmation changes what selection froze: ${changed.join(', ')}`);
  const head = report.contrast?.exposure;
  const pin = isNonEmptyString(head?.head) && isPositiveInteger(head?.length) ? { head: head.head, length: head.length } : null;
  if (!pin) problems.push('the selection report records no exposure ledger head');
  return { problems, pin };
}

// ---------------------------------------------------------------------------
// descriptive repeatability
// ---------------------------------------------------------------------------

/** Whether a completed row meets every success minimum with no critical miss and no unknown count. */
function rowSuccess(row, declaration) {
  if (row.status !== 'completed') return false;
  if (criticalMisses(row, declaration).length > 0 || unknownCriticalCounts(row, declaration).length > 0) return false;
  const floors = declaration.gates.success.metrics;
  return Object.entries(floors).every(
    ([metric, minimum]) => row.notApplicable.includes(metric) || (isFiniteNumber(row.metrics[metric]) && row.metrics[metric] >= minimum),
  );
}

/** The declared zero-tolerance rules that name a count. */
function criticalRules(declaration) {
  const rules = declaration?.gates?.critical?.rules;
  return Array.isArray(rules) ? rules.filter((rule) => isObject(rule) && isNonEmptyString(rule.count)) : [];
}

const isCount = (value) => Number.isInteger(value) && value >= 0;

/**
 * Critical rules whose count the row does not record as a nonnegative integer. An
 * unrecorded count is unknown, never zero, and a row's `notApplicable` tag cannot
 * excuse a zero-tolerance rule.
 */
function unknownCriticalCounts(row, declaration) {
  return criticalRules(declaration)
    .filter((rule) => !isCount(row.counts[rule.count]))
    .map((rule) => rule.id)
    .sort();
}

/** Critical rules a row's counts show as recorded but not as a nonnegative integer. */
function invalidCriticalCounts(row, declaration) {
  return criticalRules(declaration)
    .filter((rule) => row.counts[rule.count] !== null && row.counts[rule.count] !== undefined && !isCount(row.counts[rule.count]))
    .map((rule) => rule.id)
    .sort();
}

/** The critical rules a row reports as missed, from its own list and its positive counts. */
function criticalMisses(row, declaration) {
  const hits = new Set(row.critical);
  for (const rule of criticalRules(declaration)) {
    if (isCount(row.counts[rule.count]) && row.counts[rule.count] > 0) hits.add(rule.id);
  }
  return [...hits].sort();
}

function spreadOf(values) {
  const known = values.filter((value) => isFiniteNumber(value));
  if (known.length === 0) return { n: 0, unmeasurable: values.length, min: null, max: null, range: null, mean: null };
  return {
    n: known.length,
    unmeasurable: values.length - known.length,
    min: Math.min(...known),
    max: Math.max(...known),
    range: Math.max(...known) - Math.min(...known),
    mean: mean(known),
  };
}

function signatureDifferences(signatures) {
  const parsed = [];
  for (const signature of signatures) {
    try {
      const value = JSON.parse(signature);
      if (!Array.isArray(value) || value.length !== SIGNATURE_COMPONENTS.length) return null;
      parsed.push(value);
    } catch {
      return null;
    }
  }
  return SIGNATURE_COMPONENTS.filter((_, index) => new Set(parsed.map((value) => canonicalJson(value[index]))).size > 1);
}

function identityGroupOf(row) {
  return row.observed ? digestOf(row.observed) : 'unobserved';
}

function describeCases(declaration, rows, plan, nativeSignature) {
  const cases = [];
  for (const entry of plan) {
    const own = rows.filter((row) => row.caseId === entry.caseId);
    const byRepetition = new Map();
    const extraCompleted = [];
    const ordered = own
      .filter((row) => row.status === 'completed')
      .sort((left, right) => (left.attemptNumber ?? 0) - (right.attemptNumber ?? 0) || left.inputIndex - right.inputIndex);
    for (const row of ordered) {
      const key = `${row.runId ?? ''}\u0000${row.repetition}`;
      if (byRepetition.has(key)) extraCompleted.push(row.attemptId);
      else byRepetition.set(key, row);
    }
    const completed = [...byRepetition.values()].sort((left, right) => left.inputIndex - right.inputIndex);
    const successes = completed.filter((row) => rowSuccess(row, declaration));
    const metricNames = [...new Set(completed.flatMap((row) => Object.keys(row.metrics)))].sort();
    const signatures = completed.map((row) => nativeSignature(row)).filter((signature) => typeof signature === 'string');
    const distinct = new Set(signatures);
    cases.push({
      caseId: entry.caseId,
      clusterId: entry.clusterId,
      planned: declaration.design.repeats,
      attempts: own.length,
      completed: completed.length,
      extraCompleted,
      distinctOutputs: new Set(completed.map((row) => row.outputSha256)).size,
      freshReceipted: completed.filter((row) => row.receipt).length,
      importedHistorical: completed.filter((row) => !row.receipt).length,
      incomplete: Math.max(0, declaration.design.repeats - completed.length),
      successes: successes.length,
      successFraction: completed.length === 0 ? null : successes.length / completed.length,
      metrics: Object.fromEntries(
        metricNames.map((name) => [name, spreadOf(completed.filter((row) => name in row.metrics).map((row) => row.metrics[name]))]),
      ),
      criticalMisses: completed
        .map((row) => ({ attemptId: row.attemptId, rules: criticalMisses(row, declaration) }))
        .filter((hit) => hit.rules.length > 0),
      stability: {
        signed: signatures.length,
        distinct: distinct.size,
        stable: signatures.length >= 2 && signatures.length === completed.length ? distinct.size === 1 : null,
        differingComponents: signatures.length >= 2 ? signatureDifferences(signatures) : null,
      },
      sources: own.map((row) => row.attemptId),
    });
  }
  return cases;
}

/**
 * Replay the deterministic scorer over the saved bytes of each document, twice.
 * Rows are grouped by output hash, so a replay only ever compares identical bytes.
 */
function replayControl(rows, replay, nativeSignatureOf) {
  if (typeof replay !== 'function') return { status: 'not-provided', reason: 'no deterministic scorer was supplied', results: [] };
  const results = [];
  for (const row of rows) {
    if (row.status !== 'completed') continue;
    if (row.outputText === null) {
      results.push({ attemptId: row.attemptId, status: 'no-bytes', reason: 'the saved document is not part of the evidence' });
      continue;
    }
    if (row.hashMismatch) {
      results.push({ attemptId: row.attemptId, status: 'refused', reason: 'saved bytes do not match outputSha256' });
      continue;
    }
    let first;
    let second;
    try {
      first = replay(row.outputText, row);
      second = replay(row.outputText, row);
    } catch (error) {
      results.push({ attemptId: row.attemptId, status: 'refused', reason: `the scorer threw: ${error.message}` });
      continue;
    }
    const deterministic = canonicalJson(first) === canonicalJson(second);
    const nativeSignature = nativeSignatureOf(row);
    let nativeAgreement = 'not-comparable';
    if (typeof first?.signature === 'string' && typeof nativeSignature === 'string') {
      nativeAgreement = first.signature === nativeSignature ? 'match' : 'differs';
    }
    results.push({
      attemptId: row.attemptId,
      caseId: row.caseId,
      repetition: row.repetition,
      outputSha256: row.outputSha256,
      status: 'replayed',
      deterministic,
      signature: first?.signature ?? null,
      unmeasurable: first?.unmeasurable ?? null,
      nativeAgreement,
      note: 'separate from the native record; a parser correction produces a new replay, never a new native outcome',
    });
  }
  return { status: 'replayed', results };
}

/**
 * Replay saved bytes as one fixed output. Refuses unless every row names the same
 * artifact hash and every saved text hashes to it.
 */
function replayFixedOutput(rows, replay) {
  const hashes = new Set(rows.map((row) => row.outputSha256));
  if (rows.length === 0 || hashes.size !== 1 || hashes.has(null) || hashes.has(undefined)) {
    return { ok: false, reason: 'a fixed-output replay needs one identical artifact hash on every row' };
  }
  const [expected] = hashes;
  for (const row of rows) {
    if (typeof row.outputText !== 'string' || `sha256:${sha256Hex(row.outputText)}` !== expected) {
      return { ok: false, reason: `the saved bytes of ${row.attemptId} do not hash to ${expected}` };
    }
  }
  const outputs = rows.map((row) => canonicalJson(replay(row.outputText, row)));
  return { ok: true, outputSha256: expected, runs: rows.length, identical: new Set(outputs).size === 1 };
}

function describeJudge(declaration, judgeCalls) {
  if (declaration.scope?.judge === 'none') {
    return {
      status: 'not-applicable',
      reason: 'the measured path scores with a deterministic parser; there is no rubric judge to disagree',
    };
  }
  if (!Array.isArray(judgeCalls)) {
    return { status: 'not-provided', reason: 'a rubric judge is declared but no repeated judgments of identical output were supplied' };
  }
  return analyzeJudgeCalls(judgeCalls);
}

/**
 * Disagreement of a stochastic judge on identical, frozen output, kept apart from
 * target variation. Controls labeled good or bad test validity: a judge that is
 * stable and wrong is still invalid.
 *
 * @param {Array<{callId: string, outputSha256: string, inputSha256: string, rubricSha256: string, judgeIdentity: string, verdict: 'pass'|'fail'|null, rationale?: string, label?: 'good'|'bad', receipt?: object}>} calls
 */
function analyzeJudgeCalls(calls) {
  const groups = new Map();
  const malformed = calls.filter((call) => !isObject(call));
  for (const call of calls.filter((entry) => isObject(entry))) {
    const key = call.outputSha256;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(call);
  }
  const outputs = [];
  for (const [outputSha256, members] of groups) {
    const coherent = new Set(members.map((call) => canonicalJson([call.inputSha256, call.rubricSha256, call.judgeIdentity]))).size === 1;
    const receipted =
      members.every((call) => isObject(call.receipt) && isNonEmptyString(call.receipt.callId) && call.receipt.callId === call.callId) &&
      new Set(members.map((call) => call.callId)).size === members.length;
    const verdicts = members.map((call) => call.verdict ?? null);
    const known = verdicts.filter((verdict) => verdict !== null);
    const labels = new Set(members.map((call) => call.label ?? null));
    const label = labels.size === 1 ? [...labels][0] : null;
    const disagreement = new Set(known).size > 1;
    outputs.push({
      outputSha256,
      calls: members.length,
      missing: verdicts.length - known.length,
      coherentIdentity: coherent,
      freshReceipts: receipted,
      verdicts: known,
      disagreement,
      label,
      correct: label === null ? null : known.length > 0 && known.every((verdict) => verdict === (label === 'good' ? 'pass' : 'fail')),
      sources: members.map((call) => call.callId),
    });
  }
  const controls = outputs.filter((output) => output.label === 'good' || output.label === 'bad');
  const controlsPresent = controls.some((output) => output.label === 'good') && controls.some((output) => output.label === 'bad');
  const usable = malformed.length === 0 && outputs.every((output) => output.coherentIdentity && output.freshReceipts && output.calls >= 2);
  const valid =
    usable && controlsPresent && controls.every((output) => output.correct === true && output.missing === 0 && !output.disagreement);
  return {
    status: usable ? 'analyzed' : 'blocked',
    reason: usable
      ? null
      : 'every call has to be an object, and every output needs at least two receipted judge calls on one input, rubric and judge identity',
    outputs,
    disagreementRate: outputs.length === 0 ? null : outputs.filter((output) => output.disagreement).length / outputs.length,
    missingRate:
      calls.length === 0 ? null : calls.filter((call) => !isObject(call) || (call.verdict ?? null) === null).length / calls.length,
    controls: { present: controlsPresent, correct: controls.filter((output) => output.correct === true).length, total: controls.length },
    valid,
    validity: valid ? 'valid' : 'invalid: the judge is not shown to be stable and correct on labeled good and bad controls',
    note: 'computed on identical frozen output, so target variation does not enter',
  };
}

function describeRepeatability({ declaration, rows, excluded, replay, judgeCalls, nativeRecords }) {
  const baselineRows = rows.filter((row) => row.arm === 'A');
  // Stability is what the native runs signed; a row without a loaded record has no known signature.
  const nativeSignature = (row) => {
    const signature = nativeRecordOf(row, nativeRecords)?.signature;
    return typeof signature === 'string' ? signature : null;
  };
  const groups = new Map();
  for (const row of baselineRows) {
    const key = identityGroupOf(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const plan = clusterPlan(declaration).filter((entry) => stageCases(declaration).includes(entry.caseId));
  const identityGroups = [...groups.entries()].map(([identity, members]) => ({
    identity,
    observed: members[0].observed,
    cases: describeCases(declaration, members, plan, nativeSignature),
  }));
  return {
    mixedIdentity: identityGroups.length > 1,
    note:
      identityGroups.length > 1
        ? 'rows carry more than one observed identity, so statistics are kept per identity and never pooled'
        : 'total target variability across repetitions; none of it is attributed to a judge',
    freshIndependentTrials: baselineRows.filter((row) => row.status === 'completed' && row.receipt).length,
    importedHistoricalTrials: baselineRows.filter((row) => row.status === 'completed' && !row.receipt).length,
    excludedCopies: excluded.filter((entry) => entry.row.arm === 'A').length,
    groups: identityGroups,
    replay: replayControl(baselineRows, replay, nativeSignature),
    judge: describeJudge(declaration, judgeCalls),
  };
}

// ---------------------------------------------------------------------------
// paired contrast
// ---------------------------------------------------------------------------

const sameNumber = (left, right) =>
  (left ?? null) === (right ?? null) ||
  (isFiniteNumber(left) && isFiniteNumber(right) && Math.abs(left - right) <= 1e-12 * Math.max(1, Math.abs(left), Math.abs(right)));

/** The scorer's reading of a row's saved bytes, or null when there are no checkable bytes or no scorer. */
function replayRow(replay, row) {
  if (typeof replay !== 'function' || row.outputText === null || row.hashMismatch) return null;
  try {
    return replay(row.outputText, row) ?? null;
  } catch (error) {
    return { unmeasurable: `the scorer threw: ${error.message}` };
  }
}

/**
 * Native records the reader accepts, by where they came from. `loadRecordedTestDesignRun`
 * adds each record it builds from a manifest-checked run; `trustNativeRecords` adds
 * records a test adapter builds, and says so in the evidence index. An object built any
 * other way is not a native record, whatever it holds.
 */
const NATIVE_SOURCES = new WeakMap();

function brandNativeRecord(record, source) {
  const frozen = deepFreeze(clone(record));
  NATIVE_SOURCES.set(frozen, source);
  return frozen;
}

/**
 * Mark records as native records of a trusted test adapter. For synthetic fixtures only:
 * the evidence index names them `trusted-adapter`, apart from manifest-checked records.
 *
 * @param {Object<string, object>} records Records by reference.
 * @returns {Object<string, object>} The marked records, frozen.
 */
function trustNativeRecords(records) {
  return Object.fromEntries(Object.entries(records).map(([ref, record]) => [ref, brandNativeRecord(record, 'trusted-adapter')]));
}

/** The native record a row references, when it is one the reader accepts. */
function nativeRecordOf(row, nativeRecords) {
  const ref = row.native?.ref;
  if (!isNonEmptyString(ref) || !isObject(nativeRecords) || !Object.hasOwn(nativeRecords, ref)) return null;
  const record = nativeRecords[ref];
  return NATIVE_SOURCES.has(record) && record.ref === ref ? record : null;
}

/** The record fields a row has to repeat exactly. */
const NATIVE_BINDING = Object.freeze([
  ['caseId', (row) => row.caseId],
  ['repetition', (row) => row.repetition],
  ['attempt', (row) => row.attemptNumber],
  ['status', (row) => row.status],
  ['inputSha256', (row) => row.inputSha256],
  ['outputSha256', (row) => row.outputSha256],
  ['receipt', (row) => row.receipt],
  ['observed', (row) => row.observed],
  ['blockId', (row) => row.blockId],
  ['usage', (row) => row.usage],
  ['cost', (row) => row.cost],
  ['latency', (row) => row.latency],
]);

/**
 * Why a row does not match the native record it names. The record comes from a run
 * whose manifest was checked against its bytes; the row pins that manifest's digest
 * and repeats the record's attempt identity, hashes, receipt, observed identity,
 * pairing block, usage, cost and latency.
 * A signature or qualification the row states has to be the record's own: the native
 * gates read the record, never the row.
 */
function nativeRecordProblems(row, record) {
  if (!record) return [`the native record ${row.native.ref} is not among the records of a manifest-checked run`];
  const problems = [];
  if (!isNonEmptyString(record.manifestSha256) || record.manifestSha256 !== row.native.manifestSha256) {
    problems.push(`the row does not pin the manifest of its native record ${row.native.ref}`);
  }
  for (const [field, valueOf] of NATIVE_BINDING) {
    if (canonicalJson(valueOf(row) ?? null) !== canonicalJson(record[field] ?? null))
      problems.push(`${field} differs from the native record`);
  }
  for (const field of ['signature', 'qualification']) {
    if (field in row.native && canonicalJson(row.native[field]) !== canonicalJson(record[field] ?? null)) {
      problems.push(`native ${field} differs from the native record`);
    }
  }
  return problems;
}

/**
 * Why an attempt's evidence is only claimed. A receipt and a row's numbers are
 * claims; the reader checks what it can recompute offline. Every attempt, whatever
 * its status, has to carry a receipt, name its stage and its input, and match the
 * native record it references (`nativeRecordProblems`). An attempt that completed or claims an artifact also has to carry the saved
 * bytes, they have to hash to the output and receipt hashes, and the deterministic
 * scorer, run again over them, has to reproduce every required metric and every
 * critical count the row reports. An empty list means verified.
 */
function verificationProblems(row, declaration, replayed, nativeRecords) {
  const problems = [];
  if (!row.receipt) problems.push(row.receiptProblem ?? 'no fresh generation receipt');
  if (row.stage !== declaration.stage) problems.push('the row does not record its stage');
  if (!isNonEmptyString(row.inputSha256)) problems.push('no input hash');
  if (isNonEmptyString(row.native?.ref)) problems.push(...nativeRecordProblems(row, nativeRecordOf(row, nativeRecords)));
  else problems.push('no native record reference');
  const claimsArtifact = row.status === 'completed' || row.outputText !== null || row.outputSha256 !== null || row.receipt?.artifactSha256;
  if (!claimsArtifact) return problems;
  if (row.outputText === null) {
    problems.push('the artifact bytes are not part of the evidence');
    return problems;
  }
  if (row.hashMismatch || `sha256:${sha256Hex(row.outputText)}` !== row.outputSha256) {
    problems.push('the artifact bytes do not hash to outputSha256');
    return problems;
  }
  if (replayed === null) {
    problems.push('no deterministic scorer was supplied to re-derive the metrics and counts');
    return problems;
  }
  if (!isObject(replayed.metrics) || !isObject(replayed.counts)) {
    problems.push(`the scorer could not score the artifact${replayed.unmeasurable ? ` (${replayed.unmeasurable})` : ''}`);
    return problems;
  }
  for (const metric of Object.keys(declaration.gates.quality)) {
    if (!sameNumber(row.metrics[metric], replayed.metrics[metric])) {
      problems.push(`metric ${metric} is ${row.metrics[metric]}, the scorer gives ${replayed.metrics[metric]}`);
    }
  }
  for (const rule of criticalRules(declaration)) {
    if (!sameNumber(row.counts[rule.count], replayed.counts[rule.count])) {
      problems.push(`count ${rule.count} is ${row.counts[rule.count]}, the scorer gives ${replayed.counts[rule.count]}`);
    }
  }
  return problems;
}

/** The declared arms against the one changed setting: unknown leaves, differing leaves, and what differs outside it. */
function checkIdentity(declaration) {
  const arms = declaration.identity?.arms ?? {};
  const flatA = flatten(arms.A ?? {});
  const flatB = flatten(arms.B ?? {});
  const fixed = flatten(declaration.identity?.fixed ?? {});
  const unknown = [];
  for (const [scopeName, flat] of [
    ['identity.fixed', fixed],
    ['identity.arms.A', flatA],
    ['identity.arms.B', flatB],
  ]) {
    for (const [leaf, value] of Object.entries(flat)) {
      if (value === null || value === undefined || value === '') unknown.push(`${scopeName}.${leaf}`);
    }
  }
  const paths = [...new Set([...Object.keys(flatA), ...Object.keys(flatB)])].sort();
  const differing = paths.filter((leaf) => canonicalJson(flatA[leaf]) !== canonicalJson(flatB[leaf]));
  const kind = declaration.scope?.changedFactor?.kind;
  const changed = changedSetting(declaration.scope?.changedFactor);
  const outside = differing.filter((leaf) => !(changed?.leaves ?? []).includes(leaf));
  const unchanged = (changed?.together ?? []).filter((leaf) => !differing.includes(leaf));
  return {
    unknown,
    differing,
    outside,
    kind,
    setting: changed?.setting ?? null,
    unchanged,
    aa: differing.length === 0,
    bundled: outside.length > 0,
    factorUnchanged: differing.length > 0 && unchanged.length > 0,
  };
}

function classifyIdentityKey(key) {
  const head = key.split('.')[0];
  return IDENTITY_KEY_CLASS[head] ?? 'environment';
}

function observedIdentityProblems(declaration, rows) {
  const fixed = flatten(declaration.identity?.fixed ?? {});
  const arms = declaration.identity?.arms ?? {};
  const unobserved = [];
  const drift = new Map();
  for (const row of rows) {
    if (!row.observed || !isObject(row.observed.fixed) || !isObject(row.observed.arm)) {
      unobserved.push(row.attemptId);
      continue;
    }
    const seen = flatten(row.observed.fixed);
    for (const key of new Set([...Object.keys(fixed), ...Object.keys(seen)])) {
      if (canonicalJson(fixed[key]) !== canonicalJson(seen[key])) drift.set(`fixed.${key}`, classifyIdentityKey(key));
    }
    const declaredArm = flatten(arms[row.arm] ?? {});
    const seenArm = flatten(row.observed.arm);
    for (const key of new Set([...Object.keys(declaredArm), ...Object.keys(seenArm)])) {
      if (canonicalJson(declaredArm[key]) !== canonicalJson(seenArm[key])) drift.set(`arm.${row.arm}.${key}`, 'arm-configuration');
    }
  }
  return { unobserved, drift: [...drift.entries()].map(([key, kind]) => ({ key, kind })).sort((a, b) => a.key.localeCompare(b.key)) };
}

/** Group kept rows by planned slot and arm, and pick the scoring attempt of each. */
function resolveSlots(declaration, rows, plan) {
  const repeats = declaration.design.repeats;
  const required = Object.keys(declaration.gates.quality);
  const failureRule = declaration.design.failureRules.timeout;
  const failureValue = declaration.design.failureRules.failureMetricValue;
  const slots = [];
  const stageRows = rows;
  const problems = {
    missing: [],
    duplicate: [],
    overBudget: [],
    missingBlock: [],
    blockMismatch: [],
    nonFinite: [],
    missingMetric: [],
    unplanned: [],
    outOfRange: [],
    attemptGap: [],
  };
  for (const row of stageRows) {
    if (plan.some((entry) => entry.caseId === row.caseId) && row.repetition > repeats) {
      problems.unplanned.push(`${row.arm}/${row.caseId}/${row.repetition}`);
    }
  }
  for (const entry of plan) {
    for (let repetition = 1; repetition <= repeats; repetition += 1) {
      const slot = { caseId: entry.caseId, clusterId: entry.clusterId, repetition, arms: {} };
      for (const arm of ARMS) {
        const attempts = stageRows
          .filter((row) => row.arm === arm && row.caseId === entry.caseId && row.repetition === repetition)
          .sort((left, right) => (left.attemptNumber ?? 0) - (right.attemptNumber ?? 0) || left.inputIndex - right.inputIndex);
        const completed = attempts.filter((row) => row.status === 'completed');
        const timeouts = attempts.filter((row) => row.status === 'timeout');
        let scoring = null;
        let failureScored = false;
        if (completed.length === 1) [scoring] = completed;
        else if (completed.length > 1) problems.duplicate.push(`${arm}/${entry.caseId}/${repetition}`);
        else if (timeouts.length > 0 && failureRule === 'failure') {
          failureScored = true;
          scoring = timeouts.at(-1);
        }
        if (attempts.length > declaration.design.maxAttempts) problems.overBudget.push(`${arm}/${entry.caseId}/${repetition}`);
        if (attempts.some((row, index) => row.attemptNumber !== index + 1))
          problems.attemptGap.push(`${arm}/${entry.caseId}/${repetition}`);
        if (scoring === null && completed.length === 0) problems.missing.push(`${arm}/${entry.caseId}/${repetition}`);
        let values = null;
        if (scoring !== null) {
          values = {};
          for (const metric of required) {
            const value = failureScored ? failureValue : scoring.metrics[metric];
            if (isFiniteNumber(value) && (value < 0 || value > 1))
              problems.outOfRange.push(`${arm}/${entry.caseId}/${repetition}/${metric}`);
            else if (isFiniteNumber(value)) values[metric] = value;
            else if (value === null || value === undefined) {
              const reason = scoring.notApplicable.includes(metric) ? 'not applicable to this case' : 'unmeasured';
              problems.missingMetric.push(`${arm}/${entry.caseId}/${repetition}/${metric} (${reason})`);
            } else problems.nonFinite.push(`${arm}/${entry.caseId}/${repetition}/${metric}`);
          }
          if (scoring.nonFinite) problems.nonFinite.push(`${arm}/${entry.caseId}/${repetition}`);
        }
        slot.arms[arm] = { attempts, scoring, failureScored, values };
      }
      if (ARMS.every((arm) => slot.arms[arm].scoring !== null)) {
        const blocks = ARMS.map((arm) => slot.arms[arm].scoring.blockId);
        if (!blocks.every((block) => isNonEmptyString(block))) problems.missingBlock.push(`${entry.caseId}/${repetition}`);
        else if (blocks[0] !== blocks[1]) problems.blockMismatch.push(`${entry.caseId}/${repetition}`);
      }
      slots.push(slot);
    }
  }
  return { slots, problems };
}

/**
 * The recorded dispatch order against the declared schedule, from the receipts' start
 * times. A pairing block holds one pair: one case and repetition on both arms. Every
 * attempt of the pair, retries included, belongs to its block and has to record when
 * it started. Pairing blocks run one after another:
 * every attempt of a block starts strictly before the first attempt of the next block,
 * since equal times show no order. Inside a block an interleaved schedule never starts
 * one arm's scoring attempt twice in a row, and two scoring attempts that start at the
 * same time show no alternation.
 */
function scheduleProblems(slots, order) {
  const byBlock = new Map();
  const problems = [];
  for (const slot of slots) {
    const blockId = slot.arms.A.scoring?.blockId;
    if (!isNonEmptyString(blockId) || blockId !== slot.arms.B.scoring?.blockId) continue;
    for (const arm of ARMS) {
      for (const row of slot.arms[arm].attempts) {
        if (row.blockId !== blockId) problems.push(`${row.attemptId} is not in the block ${blockId} of its pair`);
        const start = timestampMs(row.receipt?.startedAt);
        if (start === null) {
          problems.push(`${row.attemptId} records no start time`);
          continue;
        }
        if (!byBlock.has(blockId)) byBlock.set(blockId, []);
        byBlock.get(blockId).push({ arm, start, scoring: row === slot.arms[arm].scoring, inputIndex: row.inputIndex });
      }
    }
  }
  const blockSlots = new Map();
  for (const slot of slots) {
    const blockId = slot.arms.A.scoring?.blockId;
    if (!isNonEmptyString(blockId) || blockId !== slot.arms.B.scoring?.blockId) continue;
    blockSlots.set(blockId, [...(blockSlots.get(blockId) ?? []), `${slot.caseId}/${slot.repetition}`]);
  }
  for (const [blockId, members] of blockSlots) {
    if (members.length > 1) problems.push(`block ${blockId} holds more than one pair (${members.join(', ')})`);
  }
  const blocks = [...byBlock.entries()]
    .map(([blockId, runs]) => {
      const sorted = runs.sort((left, right) => left.start - right.start || left.inputIndex - right.inputIndex);
      return { blockId, runs: sorted, first: sorted[0].start, last: sorted.at(-1).start };
    })
    .sort((left, right) => left.first - right.first || left.last - right.last);
  let latest = null;
  for (const block of blocks) {
    if (latest !== null && latest.last >= block.first) {
      problems.push(`block ${latest.blockId} does not finish starting attempts before block ${block.blockId} begins`);
    }
    if (latest === null || block.last > latest.last) latest = block;
  }
  if (order === 'interleaved') {
    for (const block of blocks) {
      const scoring = block.runs.filter((run) => run.scoring);
      if (scoring.some((run, index) => index > 0 && (run.arm === scoring[index - 1].arm || run.start === scoring[index - 1].start))) {
        problems.push(`block ${block.blockId} does not alternate the arms`);
      }
    }
  }
  return problems;
}

/** Build ids that more than one cluster used. */
function sharedBuilds(rows) {
  const owners = new Map();
  const shared = new Set();
  for (const row of rows) {
    if (!row.buildId) continue;
    const owner = owners.get(row.buildId);
    if (owner !== undefined && owner !== row.clusterId) shared.add(row.buildId);
    owners.set(row.buildId, row.clusterId);
  }
  return [...shared].sort();
}

/** Cluster-level arm values: cases averaged equally within a cluster, repetitions first. */
function clusterValues(declaration, slots, plan, valueOf) {
  const clusters = [...new Set(plan.map((entry) => entry.clusterId))];
  const out = [];
  for (const clusterId of clusters) {
    const caseIds = plan.filter((entry) => entry.clusterId === clusterId).map((entry) => entry.caseId);
    const perArm = {};
    for (const arm of ARMS) {
      const caseMeans = [];
      for (const caseId of caseIds) {
        const values = slots.filter((slot) => slot.caseId === caseId).map((slot) => valueOf(slot.arms[arm], slot));
        if (values.length === 0 || values.some((value) => !isFiniteNumber(value))) {
          caseMeans.push(null);
        } else {
          caseMeans.push(mean(values));
        }
      }
      perArm[arm] = caseMeans.includes(null) ? null : mean(caseMeans);
    }
    out.push({ clusterId, caseIds, ...perArm });
  }
  return out;
}

/**
 * Evaluate every required gate against its bound. Each lower bound has to strictly
 * exceed its threshold.
 */
function evaluateGates({ gates, bounds, objective }) {
  const results = [];
  for (const [metric, rule] of Object.entries(gates.quality)) {
    const bound = bounds[`quality:${metric}`];
    const threshold = isFiniteNumber(rule.maxLoss) ? -rule.maxLoss : rule.minImprovement;
    results.push({
      gate: `quality:${metric}`,
      kind: isFiniteNumber(rule.maxLoss) ? 'noninferiority' : 'improvement',
      threshold,
      lower: bound?.lower ?? null,
      passes: lowerBoundClears(bound?.lower, threshold),
    });
  }
  for (const metric of Object.keys(gates.floors ?? {})) {
    const bound = bounds[`floor:${metric}`];
    results.push({
      gate: `floor:${metric}`,
      kind: 'absolute-floor',
      threshold: 0,
      lower: bound?.lower ?? null,
      passes: lowerBoundClears(bound?.lower, 0),
    });
  }
  if (objective === 'cost' || isObject(gates.saving)) {
    const bound = bounds.saving;
    results.push({ gate: 'saving', kind: 'saving', threshold: 0, lower: bound?.lower ?? null, passes: lowerBoundClears(bound?.lower, 0) });
  }
  if (isObject(gates.latency)) {
    const bound = bounds.latency;
    results.push({
      gate: 'latency',
      kind: 'latency',
      threshold: 0,
      lower: bound?.lower ?? null,
      passes: lowerBoundClears(bound?.lower, 0),
    });
  }
  return results;
}

function describeArms(declaration, slots, plan, pricing) {
  const out = {};
  const metrics = Object.keys(declaration.gates.quality);
  for (const arm of ARMS) {
    const armRows = slots.flatMap((slot) => slot.arms[arm].attempts);
    const quality = {};
    for (const metric of metrics) {
      const clusters = clusterValues(declaration, slots, plan, (side) => side.values?.[metric] ?? null);
      const values = clusters.map((cluster) => cluster[arm]);
      quality[metric] = values.every((value) => isFiniteNumber(value)) ? mean(values) : null;
    }
    const task = scopedCost(armRows, declaration.resources?.costScope?.taskExecution ?? DEFAULT_COST_SCOPE.taskExecution, pricing);
    out[arm] = {
      quality,
      attempts: armRows.length,
      sources: armRows.map((row) => row.attemptId),
      completed: armRows.filter((row) => row.status === 'completed').length,
      errors: armRows.filter((row) => ['failed', 'invalid', 'timeout'].includes(row.status)).length,
      canceled: armRows.filter((row) => row.status === 'canceled').length,
      taskExecutionCost: { total: task.total, currency: task.currency, unknown: task.unknown.length },
      taskLatencyMs: armRows.length === 0 ? null : knownSum(armRows.map((row) => row.latency?.taskMs ?? null)),
    };
  }
  return out;
}

/** The paired contrast: verification, identity, pairs, schedule, cost, the bootstrap bounds and the decision. */
function analyzeContrast({ declaration, validation, rows, excluded, ledger, resume, bootstrap, replay, selection, nativeRecords }) {
  const facts = { rows: rows.length };
  const pricing = declaration.resources?.pricing ?? null;
  const plan = clusterPlan(declaration);
  const identity = checkIdentity(declaration);
  facts.identity = identity;

  const contrastRows = rows.filter((row) => ARMS.includes(row.arm));
  const observed = observedIdentityProblems(declaration, contrastRows);
  facts.observedIdentity = observed;

  const chain = selectionChainProblems(declaration, selection, { replay, bootstrap });
  facts.selectionChain = chain.problems;
  const exposure = exposureProblems(declaration, ledger, resume, chain.pin ? [chain.pin] : []);
  facts.exposure = exposure;

  const sharedAcrossArms = excluded.filter((entry) => entry.sharedAcrossArms).map((entry) => entry.row.attemptId);
  facts.sharedAcrossArms = sharedAcrossArms;
  // A candidate row left out of this stage has to belong to another paired stage, on
  // that stage's own cases. Anything else hides candidate evidence from the decision.
  const otherStage = (row) =>
    ['selection', 'confirmation'].includes(row.stage) &&
    row.stage !== declaration.stage &&
    stageCases({ ...declaration, stage: row.stage }).includes(row.caseId);
  facts.mislabeled = excluded
    .filter((entry) => ['wrong-stage', 'outside-stage-membership'].includes(entry.reason) && entry.row.arm === 'B')
    .filter((entry) => !otherStage(entry.row))
    .map((entry) => entry.row.attemptId);

  const resolved = resolveSlots(declaration, contrastRows, plan);
  facts.slots = resolved.problems;
  const { slots } = resolved;
  facts.schedule = scheduleProblems(slots, declaration.design.order);

  // -- verification: a completed attempt's receipt, bytes and numbers -------------
  const verification = new Map();
  for (const row of contrastRows) {
    verification.set(row.attemptId, verificationProblems(row, declaration, replayRow(replay, row), nativeRecords));
  }
  const unverified = contrastRows
    .filter((row) => verification.get(row.attemptId).length > 0)
    .map((row) => ({ attemptId: row.attemptId, problems: verification.get(row.attemptId) }));
  facts.unverified = unverified;

  // -- critical misses: every candidate attempt counts, retries included ----------
  const candidateRows = contrastRows.filter((row) => row.arm === 'B');
  const critical = { verified: [], unverified: [] };
  for (const row of candidateRows) {
    const rules = criticalMisses(row, declaration);
    if (rules.length === 0) continue;
    (verification.get(row.attemptId)?.length === 0 ? critical.verified : critical.unverified).push({
      attemptId: row.attemptId,
      caseId: row.caseId,
      repetition: row.repetition,
      rules,
    });
  }
  for (const entry of excluded) {
    if (!['duplicate-attempt-id', 'copied-trial'].includes(entry.reason) || entry.row.arm !== 'B' || entry.row.status !== 'completed')
      continue;
    const rules = criticalMisses(entry.row, declaration);
    if (rules.length > 0) {
      critical.unverified.push({ attemptId: entry.row.attemptId, caseId: entry.row.caseId, repetition: entry.row.repetition, rules });
    }
  }
  critical.unrecorded = candidateRows
    .map((row) => ({
      attemptId: row.attemptId,
      rules: row.status === 'completed' ? unknownCriticalCounts(row, declaration) : invalidCriticalCounts(row, declaration),
    }))
    .filter((entry) => entry.rules.length > 0);
  facts.critical = critical;
  facts.malformedRows = excluded.filter((entry) => entry.reason === 'malformed-row').length;
  facts.conflictingCopies = excluded.filter((entry) => entry.conflicting).map((entry) => entry.row.attemptId);

  // -- native binding gates: read from the native record of a verified attempt -------
  const nativeRed = [];
  const bound = candidateRows.filter((row) => row.status === 'completed' && verification.get(row.attemptId).length === 0);
  const recordOf = (row) => nativeRecordOf(row, nativeRecords);
  const unsigned = [];
  const unjudged = [];
  if (declaration.gates?.native?.requireStableSignatures) {
    for (const entry of plan) {
      const signed = bound.filter((row) => row.caseId === entry.caseId).map((row) => [row.attemptId, recordOf(row).signature]);
      for (const [attemptId, signature] of signed) if (!isNonEmptyString(signature)) unsigned.push(attemptId);
      const signatures = signed.map(([, signature]) => signature).filter((signature) => isNonEmptyString(signature));
      if (new Set(signatures).size > 1)
        nativeRed.push({ caseId: entry.caseId, reason: 'native stability signatures differ between repetitions' });
    }
  }
  if (declaration.gates?.native?.requireQualification) {
    for (const row of bound) {
      if (recordOf(row).qualification === null || recordOf(row).qualification === undefined) unjudged.push(row.attemptId);
      else if (recordOf(row).qualification !== 'passed')
        nativeRed.push({ attemptId: row.attemptId, reason: 'native qualification is not passed' });
    }
  }
  facts.nativeRed = nativeRed;
  facts.nativeUnknown = [
    ...unsigned.map((attemptId) => `${attemptId} has no native signature for the stability gate`),
    ...unjudged.map((attemptId) => `${attemptId} has no native qualification verdict for the qualification gate`),
  ];

  // -- design support ---------------------------------------------------------------
  const unsupported = [];
  const clusterCount = new Set(plan.map((entry) => entry.clusterId)).size;
  const weightOf = new Map();
  for (const entry of plan) weightOf.set(entry.clusterId, (weightOf.get(entry.clusterId) ?? 0) + entry.weight);
  const clusterWeightsEqual = [...weightOf.values()].every((weight) => Math.abs(weight - 1 / clusterCount) < 1e-9);
  const caseWeightsEqualWithinClusters = [...weightOf.keys()].every((clusterId) => {
    const weights = plan.filter((entry) => entry.clusterId === clusterId).map((entry) => entry.weight);
    return weights.every((weight) => Math.abs(weight - weights[0]) < 1e-9);
  });
  if (!clusterWeightsEqual) unsupported.push('unequal or stratified cluster weights');
  if (!caseWeightsEqualWithinClusters) unsupported.push('unequal case weights inside a cluster');
  const shared = sharedBuilds(contrastRows);
  if (shared.length > 0 || declaration.design.sharedBuilds === true) unsupported.push('clusters share a generated build');
  facts.unsupported = unsupported;

  // -- cost -------------------------------------------------------------------------
  const costScope = declaration.resources?.costScope ?? DEFAULT_COST_SCOPE;
  const taskNames = costScope.taskExecution ?? DEFAULT_COST_SCOPE.taskExecution;
  const slotCost = (side) => {
    const cost = scopedCost(side.attempts, taskNames, pricing);
    return cost.total;
  };
  const slotLatency = (side) =>
    side.attempts.length === 0
      ? null
      : knownSum(side.attempts.map((row) => (isFiniteNumber(row.latency?.taskMs) && row.latency.taskMs >= 0 ? row.latency.taskMs : null)));
  const needsCost = declaration.scope.objective === 'cost' || isObject(declaration.gates.saving);
  const judgeNames = declaration.scope.judge === 'rubric' ? (costScope.judge ?? DEFAULT_COST_SCOPE.judge) : [];
  const classified = new Set([...taskNames, ...judgeNames]);
  const unclassified = needsCost
    ? contrastRows.flatMap((row) =>
        Object.keys(row.cost?.components ?? {})
          .filter((name) => !classified.has(name))
          .map((name) => `${row.attemptId}/${name}`),
      )
    : [];
  facts.unclassifiedCost = unclassified;
  facts.outOfRange = contrastRows.flatMap((row) =>
    Object.keys(declaration.gates.quality)
      .filter((metric) => isFiniteNumber(row.metrics[metric]) && (row.metrics[metric] < 0 || row.metrics[metric] > 1))
      .map((metric) => `${row.attemptId}/${metric}`),
  );
  facts.nothingCompleted = !contrastRows.some((row) => row.arm === 'B' && row.status === 'completed');
  facts.latencyUnknown =
    isObject(declaration.gates.latency) &&
    clusterValues(declaration, slots, plan, (side) => slotLatency(side)).some((cluster) => cluster.A === null || cluster.B === null);
  const costClusters = clusterValues(declaration, slots, plan, (side) => slotCost(side));
  const costUnknown = needsCost && costClusters.some((cluster) => cluster.A === null || cluster.B === null);
  facts.costUnknown = costUnknown;
  const currencies = new Set();
  for (const row of contrastRows) {
    const { currency } = attemptCostComponents(row, pricing);
    if (currency) currencies.add(currency);
  }
  const mixedCurrency = currencies.size > 1;
  facts.mixedCurrency = mixedCurrency;

  // -- estimates ---------------------------------------------------------------------
  const completePairs =
    resolved.problems.missing.length === 0 && resolved.problems.duplicate.length === 0 && resolved.problems.missingMetric.length === 0;
  const finite = resolved.problems.nonFinite.length === 0 && contrastRows.every((row) => !row.nonFinite);
  const arms = describeArms(declaration, slots, plan, pricing);
  const gates = declaration.gates;
  const analysis = declaration.design.analysis;
  const calibration = runCalibration(bootstrap);
  let estimates = null;
  let gateResults = [];
  let diagnostics = [];
  const canEstimate = completePairs && finite && !costUnknown && !mixedCurrency && unsupported.length === 0 && clusterCount >= 1;
  if (canEstimate) {
    const contrasts = {};
    for (const metric of Object.keys(gates.quality)) {
      const clusters = clusterValues(declaration, slots, plan, (side) => side.values?.[metric] ?? null);
      contrasts[`quality:${metric}`] = clusters.map((cluster) => cluster.B - cluster.A);
    }
    for (const [metric, floor] of Object.entries(gates.floors ?? {})) {
      const clusters = clusterValues(declaration, slots, plan, (side) => side.values?.[metric] ?? null);
      contrasts[`floor:${metric}`] = clusters.map((cluster) => cluster.B - floor);
    }
    if (needsCost) {
      const s = gates.saving?.minFraction ?? 0;
      contrasts.saving = costClusters.map((cluster) => (1 - s) * cluster.A - cluster.B);
    }
    if (isObject(gates.latency)) {
      const clusters = clusterValues(declaration, slots, plan, (side) => slotLatency(side));
      if (clusters.some((cluster) => cluster.A === null || cluster.B === null)) {
        contrasts.latency = null;
      } else {
        contrasts.latency = clusters.map((cluster) => (1 + gates.latency.maxIncreaseFraction) * cluster.A - cluster.B);
      }
    }
    const usable = Object.fromEntries(Object.entries(contrasts).filter(([, values]) => values !== null));
    const all = Object.values(usable).flat();
    if (all.every((value) => isFiniteNumber(value)) && Object.keys(usable).length > 0) {
      const bounds = Object.keys(usable).length;
      const alpha = analysis.simultaneous ? analysis.alpha / bounds : analysis.alpha;
      estimates = bootstrap({ contrasts: usable, B: analysis.B, seed: analysis.seed, alpha, quantile: analysis.quantile });
      estimates = { alphaPerBound: alpha, bounds: estimates };
      gateResults = evaluateGates({ gates, bounds: estimates.bounds, objective: declaration.scope.objective });
      if (needsCost) {
        const meanA = mean(costClusters.map((cluster) => cluster.A));
        facts.baselineMeanCost = meanA;
        if (!(meanA > 0)) diagnostics.push('baseline mean cost is not positive');
      }
    } else {
      diagnostics.push('a contrast was not finite');
    }
    if (contrasts.latency === null) {
      gateResults.push({ gate: 'latency', kind: 'latency', threshold: 0, lower: null, passes: false });
    }
  }
  facts.clusterCount = clusterCount;
  facts.diagnostics = diagnostics;
  facts.calibration = calibration;
  const degenerate = estimates
    ? Object.entries(estimates.bounds)
        .filter(([, bound]) => bound.degenerate)
        .map(([name]) => name)
    : [];
  facts.degenerate = degenerate;

  const decision = decide({
    declaration,
    validation,
    facts,
    gateResults,
    estimates,
    identity,
    observed,
    exposure,
    critical,
    nativeRed,
    unverified,
    resolved,
  });
  return {
    plannedClusters: clusterCount,
    arms,
    identity: {
      oneFactor: {
        kind: identity.kind,
        setting: identity.setting,
        differing: identity.differing,
        outsideFactor: identity.outside,
        unchanged: identity.unchanged,
        unknown: identity.unknown,
      },
      observed,
    },
    pairs: { slots: slots.length * 2, problems: resolved.problems, unverified, schedule: facts.schedule },
    selection: { problems: facts.selectionChain },
    verification: Object.fromEntries(verification),
    critical,
    nativeRed,
    cost: {
      needed: needsCost,
      unknown: costUnknown,
      unclassified,
      mixedCurrency,
      taskExecutionScope: taskNames,
      baselineMeanCost: facts.baselineMeanCost ?? null,
    },
    exposure: {
      blockers: exposure.blockers,
      burned: exposure.burned,
      head: exposure.ledger?.head ?? null,
      length: exposure.ledger?.length ?? 0,
    },
    estimator: {
      method: 'equal-weight paired case-cluster percentile bootstrap',
      alpha: analysis.alpha,
      alphaPerBound: estimates?.alphaPerBound ?? null,
      B: analysis.B,
      seed: analysis.seed,
      prng: analysis.prng,
      quantile: analysis.quantile,
      simultaneous: analysis.simultaneous,
      clusters: clusterCount,
      calibration,
      bounds: estimates?.bounds ?? null,
      degenerate,
      diagnostics,
    },
    gates: gateResults,
    decision,
  };
}

/** The decision, in the order the module header lists; the first rule that applies decides. */
function decide({
  declaration,
  validation,
  facts,
  gateResults,
  estimates,
  identity,
  observed,
  exposure,
  critical,
  nativeRed,
  unverified,
  resolved,
}) {
  const stage = declaration.stage;
  const result = (outcome, reasons) => ({
    outcome,
    reasons,
    advisory: true,
    nativeVerdict: null,
    acceptsBaseline: false,
    appliesPatch: false,
    adoptionRequires: 'explicit human approval of the exact configuration bytes and destination',
  });
  const blocked = [];

  // 1. declaration
  for (const problem of [...validation.problems, ...validation.pairedProblems])
    blocked.push(`declaration: ${problem.where} ${problem.message}`);
  if (validation.frozen.declared && validation.frozen.matches === false)
    blocked.push('declaration: frozen.digest does not match the declaration bytes');
  for (const problem of facts.selectionChain) blocked.push(`selection: ${problem}`);
  if (blocked.length > 0) return result(OUTCOMES.blocked, blocked);

  // 2. identity
  if (identity.unknown.length > 0)
    return result(
      OUTCOMES.blocked,
      identity.unknown.map((key) => `unknown identity: ${key}`),
    );
  if (observed.unobserved.length > 0) {
    return result(OUTCOMES.blocked, [
      `identity was not recorded on ${observed.unobserved.length} attempt(s), so the comparison is not attributable`,
    ]);
  }
  if (observed.drift.length > 0) {
    return result(
      OUTCOMES.newBaseline,
      observed.drift.map((entry) => `${entry.kind} changed: ${entry.key}`),
    );
  }
  if (identity.bundled) {
    return result(OUTCOMES.revisedDesign, [`more than the declared ${identity.setting} setting differs: ${identity.outside.join(', ')}`]);
  }
  if (identity.factorUnchanged) {
    return result(OUTCOMES.revisedDesign, [
      `the declared ${identity.setting} setting does not change on every identity it has to: ${identity.unchanged.join(', ')} stays the same`,
    ]);
  }

  // 3. critical miss, whatever else is true
  if (critical.verified.length > 0) {
    return result(
      OUTCOMES.rejected,
      critical.verified.map((hit) => `candidate critical miss (${hit.rules.join(', ')}) on ${hit.caseId} repetition ${hit.repetition}`),
    );
  }

  // 4. binding native gates
  if (nativeRed.length > 0)
    return result(
      OUTCOMES.rejected,
      nativeRed.map((entry) => `native gate is red: ${entry.reason}`),
    );

  // 5. blocks
  const blocks = [];
  if (critical.unverified.length > 0)
    blocks.push(
      'a candidate critical miss is not verified against its receipt, bytes and scorer, so it can be neither dismissed nor confirmed',
    );
  if (facts.sharedAcrossArms.length > 0) blocks.push(`rows are shared between the arms: ${facts.sharedAcrossArms.join(', ')}`);
  if (facts.nativeUnknown.length > 0) blocks.push(`native gate evidence is missing: ${facts.nativeUnknown.join('; ')}`);
  if (facts.mislabeled.length > 0) {
    blocks.push(`candidate attempts belong to no stage this declaration plans: ${facts.mislabeled.join(', ')}`);
  }
  if (critical.unrecorded.length > 0) {
    blocks.push(
      `critical counts are not recorded as nonnegative integers on ${critical.unrecorded.length} candidate attempt(s): ${critical.unrecorded.map((entry) => `${entry.attemptId} (${entry.rules.join(', ')})`).join(', ')}`,
    );
  }
  if (facts.conflictingCopies.length > 0) {
    blocks.push(`rows that share an attempt id or a workspace disagree with the first: ${facts.conflictingCopies.join(', ')}`);
  }
  if (unverified.length > 0) {
    blocks.push(
      `${unverified.length} attempt(s) carry claimed evidence the reader could not verify: ${unverified
        .map((entry) => `${entry.attemptId} (${entry.problems.join('; ')})`)
        .join(', ')}`,
    );
  }
  const { problems } = resolved;
  if (problems.missing.length > 0) blocks.push(`missing pairs: ${problems.missing.join(', ')}`);
  if (problems.duplicate.length > 0) blocks.push(`duplicate scoring attempts: ${problems.duplicate.join(', ')}`);
  if (facts.malformedRows > 0)
    blocks.push(`${facts.malformedRows} evidence row(s) could not be read, so their charges and results are unknown`);
  if (problems.unplanned.length > 0) blocks.push(`attempts for repetitions the schedule does not plan: ${problems.unplanned.join(', ')}`);
  if (problems.overBudget.length > 0) blocks.push(`attempts exceed design.maxAttempts: ${problems.overBudget.join(', ')}`);
  if (problems.attemptGap.length > 0) {
    blocks.push(`attempt numbers do not run 1, 2, ... without a gap or a repeat: ${problems.attemptGap.join(', ')}`);
  }
  if (problems.outOfRange.length > 0 || facts.outOfRange.length > 0) {
    blocks.push(`required metric outside [0, 1]: ${[...problems.outOfRange, ...facts.outOfRange].join(', ')}`);
  }
  if (facts.nothingCompleted) blocks.push('the candidate completed no attempt, so nothing it produced was measured');
  if (problems.missingBlock.length > 0) blocks.push(`pairing block not recorded on both arms: ${problems.missingBlock.join(', ')}`);
  if (problems.blockMismatch.length > 0) blocks.push(`pairing blocks differ: ${problems.blockMismatch.join(', ')}`);
  if (facts.schedule.length > 0) {
    blocks.push(
      `the recorded dispatch order does not follow the declared ${declaration.design.order} schedule: ${facts.schedule.join('; ')}`,
    );
  }
  if (problems.missingMetric.length > 0) blocks.push(`required metric unmeasured: ${problems.missingMetric.join(', ')}`);
  if (problems.nonFinite.length > 0 || facts.diagnostics.includes('a contrast was not finite')) blocks.push('non-finite data');
  if (facts.costUnknown) blocks.push('required cost is unknown for at least one cluster');
  if (facts.unclassifiedCost.length > 0) {
    blocks.push(`charged cost components are in neither the task execution nor the judge scope: ${facts.unclassifiedCost.join(', ')}`);
  }
  if (facts.latencyUnknown) blocks.push('the latency gate is declared and task latency is unknown for at least one cluster');
  if (facts.mixedCurrency) blocks.push('attempts carry more than one currency');
  blocks.push(...exposure.blockers, ...exposure.burned.map((entry) => `case ${entry.caseId} ${entry.reason}`));
  if (identity.aa) blocks.push('the arms have identical configuration: this is an A/A control');
  if (blocks.length > 0) {
    if (identity.aa && blocks.length === 1) return result(OUTCOMES.aaControl, blocks);
    return result(OUTCOMES.blocked, blocks);
  }

  // 6. unsupported designs
  if (facts.unsupported.length > 0) {
    return result(
      OUTCOMES.descriptiveOnly,
      facts.unsupported.map((reason) => `unsupported design: ${reason}; no interval supports a decision`),
    );
  }

  // 7. validity of the interval
  const inconclusive = [];
  if (!facts.calibration.passed) inconclusive.push('the bootstrap does not reproduce its reference fixtures; intervals are descriptive');
  if (facts.clusterCount < 2) inconclusive.push(`${facts.clusterCount} cluster(s): no uncertainty can be estimated`);
  if (facts.degenerate.length > 0) {
    inconclusive.push(
      `degenerate interval (all cluster contrasts equal) for ${facts.degenerate.join(', ')}: diagnostic only, not proof of zero uncertainty`,
    );
  }
  if (facts.diagnostics.includes('baseline mean cost is not positive')) inconclusive.push('baseline mean cost is not positive');
  if (!estimates) inconclusive.push('no estimate could be formed');
  if (inconclusive.length > 0) return result(OUTCOMES.inconclusive, inconclusive);

  // 8. gates
  const failed = gateResults.filter((gate) => !gate.passes);
  if (failed.length > 0) {
    return result(
      OUTCOMES.inconclusive,
      failed.map((gate) => `${gate.gate}: lower bound ${gate.lower} does not exceed ${gate.threshold}`),
    );
  }
  if (stage !== 'confirmation') {
    return result(OUTCOMES.selectionCleared, [
      'every required gate clears on selection data; a fresh confirmation on untouched cases is still required',
    ]);
  }
  return result(OUTCOMES.recommend, ['every required gate clears on confirmation cases that were never exposed to selection']);
}

// ---------------------------------------------------------------------------
// the reader
// ---------------------------------------------------------------------------

function evidenceIndexRow(row, status, detail, verification, nativeSource) {
  return {
    stage: row.stage,
    arm: row.arm,
    caseId: row.caseId,
    clusterId: row.clusterId,
    blockId: row.blockId,
    repetition: row.repetition,
    runId: row.runId,
    attemptId: row.attemptId,
    attempt: row.attemptNumber,
    retryOf: row.retryOf,
    origin: row.receipt ? 'fresh' : 'imported-historical',
    receipt: row.receipt,
    receiptProblem: row.receiptProblem,
    verification: verification === undefined ? 'not-checked' : verification.length === 0 ? 'verified' : 'claimed',
    nativeSource: nativeSource ?? null,
    verificationProblems: verification ?? [],
    inputSha256: row.inputSha256,
    outputSha256: row.outputSha256,
    native: row.native,
    status: row.status,
    error: row.error,
    metrics: row.metrics,
    counts: row.counts,
    notApplicable: row.notApplicable,
    criticalMisses: row.critical,
    usage: row.usage,
    cost: row.cost,
    latency: row.latency,
    provenance: row.provenance,
    counted: status,
    detail: detail ?? null,
  };
}

/**
 * Read an experiment.
 *
 * @param {object} input
 * @param {object} input.declaration The experiment declaration.
 * @param {Array<object>} input.attempts Evidence rows.
 * @param {Array<object>} [input.ledger] The exposure ledger.
 * @param {object} [input.resume] Heads recorded by an earlier report: `{ ledger: {head, length} }`.
 * @param {object} [input.selection] For a confirmation: the selection stage's own input
 *   (`declaration`, `attempts`, `ledger`, ...). The reader reads it again and holds the
 *   result to the selection-cleared report the confirmation pins.
 * @param {Object<string, object>} [input.nativeRecords] Native records by reference, as
 *   `loadRecordedTestDesignRun` returns them from a manifest-checked run directory.
 * @param {Array<object>} [input.judgeCalls] Repeated judgments of identical output.
 * @param {(text: string, row: object) => object} [input.replay] Deterministic scorer over saved bytes.
 *   It returns `{ metrics, counts }` for a document; attempts are verified against it.
 * @param {Function} [input.bootstrap] The bootstrap implementation (calibrated before use).
 * @returns {{report: object, evidenceIndex: object}}
 */
function readExperimentChecked({
  declaration,
  attempts = [],
  ledger = null,
  resume = null,
  selection = null,
  nativeRecords = null,
  judgeCalls = null,
  replay = null,
  bootstrap = pairedClusterBootstrap,
}) {
  const validation = validateDeclaration(declaration);
  const usable = validation.problems.length === 0;
  const declarationCopy = clone(declaration);
  const normalized = (Array.isArray(attempts) ? attempts : []).map((raw, index) => normalizeRow(raw, index));
  const { kept: unique, excluded } = classifyRows(normalized);

  let kept = unique;
  if (usable) {
    const cases = stageCases(declarationCopy);
    kept = [];
    for (const row of unique) {
      if (!cases.includes(row.caseId)) {
        excluded.push({
          row,
          reason: 'outside-stage-membership',
          detail: `${row.caseId} is not a case of the ${declarationCopy.stage} stage`,
        });
      } else if (row.stage !== null && row.stage !== declarationCopy.stage) {
        excluded.push({
          row,
          reason: 'wrong-stage',
          detail: `the row belongs to the ${row.stage} stage, this declaration reads the ${declarationCopy.stage} stage`,
        });
      } else {
        kept.push(row);
      }
    }
  }

  const limitations = [];
  const report = {
    kind: 'configuration-experiment-report',
    schemaVersion: SCHEMA_VERSION,
    analysisVersion: ANALYSIS_VERSION,
    advisory: true,
    nativeVerdict: null,
    declaration: {
      experimentId: declarationCopy?.experimentId ?? null,
      stage: declarationCopy?.stage ?? null,
      digest: validation.digest,
      frozen: validation.frozen,
      problems: validation.problems,
    },
    identities: usable ? { fixed: declarationCopy.identity.fixed, arms: declarationCopy.identity.arms ?? null } : null,
    descriptive: null,
    contrast: null,
    cost: null,
    denominators: null,
    exclusions: excluded.map((entry) => ({ attemptId: entry.row.attemptId, reason: entry.reason, detail: entry.detail })),
    sourceLimitations: limitations,
  };

  if (!usable) {
    report.contrast = { status: 'blocked', decision: blockedDecision(validation) };
    return finish({ report, kept, excluded, inputCount: normalized.length });
  }

  report.descriptive = describeRepeatability({ declaration: declarationCopy, rows: kept, excluded, replay, judgeCalls, nativeRecords });
  if (report.descriptive.importedHistoricalTrials > 0) {
    limitations.push(
      `${report.descriptive.importedHistoricalTrials} baseline attempt(s) are imported historical captures without a fresh generation receipt: they describe what was recorded and are not fresh executions`,
    );
  }
  if (kept.every((row) => !row.usage && !row.cost)) {
    limitations.push('no usage or cost telemetry is recorded, so no saving can be measured from this evidence');
  }
  const extras = report.descriptive.groups.flatMap((group) => group.cases.flatMap((entry) => entry.extraCompleted));
  if (extras.length > 0) {
    limitations.push(
      `${extras.length} completed attempt(s) repeat a run and repetition already counted and are listed under extraCompleted: ${extras.join(', ')}`,
    );
  }
  limitations.push('hashes identify bytes; they do not prove that generation happened. Only a fresh-workspace receipt does');

  let analyzedContrast = null;
  if (isNonEmptyString(declarationCopy.scope.candidate?.id)) {
    if (validation.pairedProblems.length > 0) {
      report.contrast = { status: 'blocked', decision: blockedDecision(validation) };
    } else {
      analyzedContrast = analyzeContrast({
        declaration: declarationCopy,
        validation,
        rows: kept,
        excluded,
        ledger,
        resume,
        bootstrap,
        replay,
        selection,
        nativeRecords,
      });
      report.contrast = { status: 'analyzed', ...analyzedContrast };
    }
  } else {
    report.contrast = {
      status: 'not-requested',
      reason: 'the declaration names no candidate; this is a descriptive repeatability reading',
    };
  }

  report.cost = costSection(declarationCopy, kept);
  if (report.cost.experimentTotal.total === null)
    limitations.push('total experiment cost is unknown: at least one cost component is not recorded');
  return finish({ report, kept, excluded, inputCount: normalized.length, declaration: declarationCopy, analyzedContrast, nativeRecords });
}

/**
 * Read an experiment. A fault inside the reader is reported as a blocked contrast
 * naming the fault, never thrown at the caller.
 *
 * @param {object} input See `readExperimentChecked`.
 * @returns {{report: object, evidenceIndex: object}}
 */
function readExperiment(input) {
  try {
    return readExperimentChecked(input);
  } catch (error) {
    const validation = {
      problems: [{ where: 'reader', message: `could not read this input: ${error.message}` }],
      pairedProblems: [],
      frozen: {},
    };
    const report = {
      kind: 'configuration-experiment-report',
      schemaVersion: SCHEMA_VERSION,
      analysisVersion: ANALYSIS_VERSION,
      advisory: true,
      nativeVerdict: null,
      declaration: {
        experimentId: null,
        stage: null,
        digest: null,
        frozen: { declared: false, matches: null },
        problems: validation.problems,
      },
      identities: null,
      descriptive: null,
      contrast: { status: 'blocked', decision: blockedDecision(validation) },
      cost: null,
      denominators: null,
      exclusions: [],
      sourceLimitations: ['the reader failed on this input; nothing was analyzed'],
      evidenceIndex: { rows: 0, digest: digestOf([]) },
    };
    return {
      report,
      evidenceIndex: { kind: 'configuration-experiment-evidence-index', schemaVersion: SCHEMA_VERSION, declarationDigest: null, rows: [] },
    };
  }
}

/** Task, judge and experiment cost over every kept attempt, retries and failures included. */
function costSection(declaration, rows) {
  const pricing = declaration.resources?.pricing ?? null;
  const scope = declaration.resources?.costScope ?? DEFAULT_COST_SCOPE;
  const taskNames = scope.taskExecution ?? DEFAULT_COST_SCOPE.taskExecution;
  const judgeNames = declaration.scope?.judge === 'rubric' ? (scope.judge ?? DEFAULT_COST_SCOPE.judge) : [];
  const everyName = [...new Set([...taskNames, ...judgeNames, ...rows.flatMap((row) => Object.keys(row.cost?.components ?? {}))])];
  const everything = scopedCost(rows, everyName, pricing);
  const overhead = declaration.resources?.overhead;
  const overheadDeclared = Array.isArray(overhead);
  const overheadTotal = overheadDeclared
    ? knownSum(overhead.map((entry) => (isFiniteNumber(entry?.amount) && entry.amount >= 0 ? entry.amount : null)))
    : null;
  let total = null;
  if (everything.total !== null && overheadTotal !== null) {
    const overheadCurrencies = new Set(overhead.map((entry) => entry.currency));
    const currenciesAgree =
      overheadCurrencies.size <= 1 &&
      (overheadCurrencies.size === 0 || everything.currency === null || overheadCurrencies.has(everything.currency));
    total = currenciesAgree ? everything.total + overheadTotal : null;
  }
  return {
    includes: 'every attempt: retries, canceled, failed and invalid work stay in the totals',
    attempts: rows.length,
    sources: rows.map((row) => row.attemptId),
    taskExecution: summarizeCost(scopedCost(rows, taskNames, pricing)),
    judge:
      judgeNames.length === 0
        ? { total: 0, currency: null, unknownComponents: 0, mixedCurrency: false, notApplicable: true }
        : summarizeCost(scopedCost(rows, judgeNames, pricing)),
    experimentTotal: {
      ...summarizeCost(everything),
      total,
      overheadDeclared,
      overheadTotal,
      note: 'preflight, calibration, diagnostics and canceled work outside the attempts are declared in resources.overhead; an undeclared overhead leaves the total unknown',
    },
    derivedFromUsage: rows.flatMap((row) =>
      attemptCostComponents(row, pricing).derived.map((name) => ({ attemptId: row.attemptId, component: name })),
    ),
    note: 'unknown stays unknown: a missing component never counts as zero, and tokens become money only through a complete price sheet over complete usage',
  };
}

function summarizeCost(cost) {
  return {
    total: cost.total,
    currency: cost.currency,
    unknownComponents: cost.unknown.length,
    mixedCurrency: cost.mixedCurrency,
  };
}

/** The blocked decision for a declaration that cannot run the contrast. */
function blockedDecision(validation) {
  const reasons = [...validation.problems, ...validation.pairedProblems].map(
    (problem) => `declaration: ${problem.where} ${problem.message}`,
  );
  if (validation.frozen.declared && validation.frozen.matches === false)
    reasons.push('declaration: frozen.digest does not match the declaration bytes');
  return {
    outcome: OUTCOMES.blocked,
    reasons,
    advisory: true,
    nativeVerdict: null,
    acceptsBaseline: false,
    appliesPatch: false,
    adoptionRequires: 'explicit human approval of the exact configuration bytes and destination',
  };
}

/** The evidence index, the denominators and their reconciliation, added to the report. */
function finish({ report, kept, excluded, inputCount, declaration = null, analyzedContrast = null, nativeRecords = null }) {
  const countedAs = new Map();
  if (declaration && analyzedContrast) {
    const contrastRows = kept.filter((row) => ARMS.includes(row.arm));
    for (const slot of resolveSlots(declaration, contrastRows, clusterPlan(declaration)).slots) {
      for (const arm of ARMS) {
        const side = slot.arms[arm];
        for (const row of side.attempts) countedAs.set(row.attemptId, side.scoring === row ? 'scored' : 'superseded');
      }
    }
  }
  const evidenceRows = [
    ...kept.map((row) =>
      evidenceIndexRow(
        row,
        countedAs.get(row.attemptId) ?? (row.status === 'completed' ? 'described' : 'unscored'),
        null,
        analyzedContrast?.verification[row.attemptId],
        NATIVE_SOURCES.get(nativeRecordOf(row, nativeRecords)),
      ),
    ),
    ...excluded.map((entry) => evidenceIndexRow(entry.row, `excluded:${entry.reason}`, entry.detail)),
  ].sort(
    (left, right) => String(left.attemptId ?? '').localeCompare(String(right.attemptId ?? '')) || left.counted.localeCompare(right.counted),
  );

  if (declaration) {
    const plannedSlotsPerArm = clusterPlan(declaration).length * declaration.design.repeats;
    const arms = {};
    for (const arm of ARMS) {
      const armRows = kept.filter((row) => row.arm === arm);
      arms[arm] = {
        rows: armRows.length,
        completed: armRows.filter((row) => row.status === 'completed').length,
        failed: armRows.filter((row) => row.status === 'failed').length,
        canceled: armRows.filter((row) => row.status === 'canceled').length,
        invalid: armRows.filter((row) => row.status === 'invalid').length,
        timeout: armRows.filter((row) => row.status === 'timeout').length,
        scoredSlots: armRows.filter((row) => countedAs.get(row.attemptId) === 'scored').length,
        missingSlots: analyzedContrast
          ? analyzedContrast.pairs.problems.missing.filter((entry) => entry.startsWith(`${arm}/`)).length
          : null,
      };
    }
    report.denominators = {
      plannedSlotsPerArm,
      arms,
      keptAttempts: kept.length,
      excludedAttempts: excluded.length,
      attemptsInIndex: evidenceRows.length,
      reconciles:
        evidenceRows.length === inputCount &&
        kept.length + excluded.length === inputCount &&
        (!analyzedContrast ||
          ARMS.every(
            (arm) =>
              arms[arm].scoredSlots +
                arms[arm].missingSlots +
                analyzedContrast.pairs.problems.duplicate.filter((entry) => entry.startsWith(`${arm}/`)).length ===
              plannedSlotsPerArm,
          )),
    };
  }
  const evidenceIndex = {
    kind: 'configuration-experiment-evidence-index',
    schemaVersion: SCHEMA_VERSION,
    declarationDigest: report.declaration.digest,
    rows: evidenceRows,
  };
  report.evidenceIndex = { rows: evidenceRows.length, digest: digestOf(evidenceRows) };
  return { report, evidenceIndex };
}

// ---------------------------------------------------------------------------
// recorded Test Design runs
// ---------------------------------------------------------------------------

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function ratio(numerator, denominator) {
  return isFiniteNumber(numerator) && isFiniteNumber(denominator) && denominator > 0 ? numerator / denominator : null;
}

function metricsFromContributions(contributions) {
  const metrics = {};
  const counts = {};
  const notApplicable = [];
  const names = new Set(
    Object.keys(contributions)
      .filter((key) => key.endsWith('.numerator'))
      .map((key) => key.slice(0, -'.numerator'.length)),
  );
  for (const name of names) {
    if (contributions[`${name}.denominator`] === 0) notApplicable.push(name);
    else metrics[name] = ratio(contributions[`${name}.numerator`], contributions[`${name}.denominator`]);
  }
  for (const [key, value] of Object.entries(contributions)) {
    if (key.includes('.') || key.startsWith('max') || !isFiniteNumber(value)) continue;
    counts[key] = value;
  }
  return { metrics, counts, notApplicable };
}

/**
 * Evidence rows and native records for a recorded Test Design run directory
 * (`manifest.json`, `result.json`, `cases/<case>-run-<n>/`). The manifest's hashes
 * are checked against the bytes on disk first, and every file the loader reads has
 * to be listed in it. Each attempt's native record holds what the run itself wrote:
 * its identity, input and output hashes, signature, the run's qualification (failure
 * class `none`), and what the runner recorded in `provenance.json`: the observed
 * identity, generation receipt, pairing block, usage, cost and latency. Without a
 * recorded identity the record holds what `result.json` shows (suite, prompt, source,
 * requested model and runner), and without the others they are null, so such an
 * attempt cannot back a decision. The records are frozen under the digest of the manifest. A run without a recorded receipt is
 * imported historical evidence: a recorded workspace path is provenance, not a receipt.
 *
 * @param {object} options
 * @param {string} options.dir The recorded run directory.
 * @param {'A'|'B'} [options.arm]
 * @param {string} [options.stage]
 * @param {string} [options.runId]
 * @returns {{rows: Array<object>, records: Object<string, object>, integrity: {checked: number, problems: string[]}, source: object}}
 */
function loadRecordedTestDesignRun({ dir, arm = 'A', stage = 'baseline', runId = path.basename(dir) }) {
  const manifestBytes = fs.readFileSync(path.join(dir, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const manifestSha256 = `sha256:${sha256Hex(manifestBytes)}`;
  const problems = [];
  const listed = new Set();
  for (const entry of manifest.files) {
    listed.add(entry.path);
    const bytes = fs.readFileSync(path.join(dir, entry.path));
    if (bytes.length !== entry.bytes) problems.push(`${entry.path}: ${bytes.length} bytes, manifest says ${entry.bytes}`);
    if (sha256Hex(bytes) !== entry.sha256) problems.push(`${entry.path}: sha256 differs from the manifest`);
  }
  const read = (relative) => {
    if (!listed.has(relative)) problems.push(`${relative}: not listed in the manifest`);
    return fs.readFileSync(path.join(dir, relative));
  };
  const result = JSON.parse(read('result.json').toString('utf8'));
  const [runner] = result.runners;
  // The run's own verdict: failure class `none` passed, any other class failed, none recorded unknown.
  const qualification = typeof result.failureClass === 'string' ? (result.failureClass === 'none' ? 'passed' : 'failed') : null;
  const rows = [];
  const records = {};
  for (const [index, diagnostic] of (runner.diagnostics ?? []).entries()) {
    const caseDirectory = `cases/${diagnostic.caseId}-run-${diagnostic.repetition}`;
    const provenance = JSON.parse(read(`${caseDirectory}/provenance.json`).toString('utf8'));
    const observation = JSON.parse(read(`${caseDirectory}/observation.json`).toString('utf8'));
    const prompt = fs.existsSync(path.join(dir, caseDirectory, 'prompt.txt')) ? read(`${caseDirectory}/prompt.txt`) : null;
    const text = observation.artifacts?.design?.value ?? null;
    const { metrics, counts, notApplicable } = metricsFromContributions(diagnostic.metricContributions ?? {});
    const ref = `${path.basename(dir)}/result.json#/runners/0/diagnostics/${index}`;
    const recorded = {
      fixed: { suiteDigest: result.suite.fixtureDigest, promptDigest: result.suite.promptDigest, sourceCommit: result.repository.commit },
      arm: { model: { requested: provenance.requestedModel, resolved: null }, runner: runner.version },
    };
    // An identity the runner recorded has to agree with what the run itself shows: the
    // suite and the requested model always, the prompt, source and runner where it names them.
    if (isObject(provenance.observed)) {
      const stated = flatten(provenance.observed);
      const shown = flatten(recorded);
      for (const leaf of ['fixed.suiteDigest', 'arm.model.requested', 'fixed.promptDigest', 'fixed.sourceCommit', 'arm.runner']) {
        const required = leaf === 'fixed.suiteDigest' || leaf === 'arm.model.requested';
        if ((required || leaf in stated) && canonicalJson(stated[leaf] ?? null) !== canonicalJson(shown[leaf] ?? null)) {
          problems.push(`${caseDirectory}/provenance.json: observed ${leaf} differs from what the run recorded`);
        }
      }
    }
    const observed = isObject(provenance.observed) ? clone(provenance.observed) : recorded;
    const record = {
      ref,
      manifestSha256,
      caseId: diagnostic.caseId,
      repetition: diagnostic.repetition,
      attempt: provenance.attempt ?? 1,
      status: diagnostic.completionState === 'completed' ? 'completed' : 'invalid',
      inputSha256: prompt === null ? null : `sha256:${sha256Hex(prompt)}`,
      outputSha256: text === null ? null : `sha256:${sha256Hex(text)}`,
      receipt: isObject(provenance.receipt) ? clone(provenance.receipt) : null,
      observed,
      blockId: provenance.blockId ?? null,
      usage: isObject(provenance.usage) ? numberMap(provenance.usage) : null,
      cost: isObject(provenance.cost)
        ? { currency: provenance.cost.currency ?? null, components: numberMap(provenance.cost.components) }
        : null,
      latency: isObject(provenance.latency) ? numberMap(provenance.latency) : null,
      signature: diagnostic.signature,
      qualification,
    };
    records[ref] = record;
    rows.push({
      attemptId: `${runId}/${diagnostic.caseId}/${diagnostic.repetition}/${provenance.attempt ?? 1}`,
      runId,
      stage,
      arm,
      caseId: diagnostic.caseId,
      clusterId: diagnostic.caseId,
      blockId: record.blockId,
      repetition: diagnostic.repetition,
      attempt: record.attempt,
      status: record.status,
      error: null,
      receipt: clone(record.receipt),
      inputSha256: record.inputSha256,
      outputSha256: record.outputSha256,
      outputText: text,
      native: {
        ref,
        manifestSha256,
        signature: diagnostic.signature,
        qualification,
        failureClass: diagnostic.failureClass ?? null,
        rootCause: diagnostic.rootCause ?? null,
        reason: diagnostic.reason ?? null,
        runnerFailureClass: runner.failureClass ?? null,
        runnerFailures: runner.failures ?? [],
      },
      metrics,
      counts,
      notApplicable,
      usage: clone(record.usage),
      cost: clone(record.cost),
      latency: clone(record.latency),
      observed: clone(observed),
      provenance: {
        mode: provenance.mode,
        capturedAt: provenance.capturedAt,
        originalWorkspace: provenance.originalWorkspace,
        agent: provenance.agent,
      },
    });
  }
  // Records are native records only when the whole run matched its manifest.
  const checked = problems.length === 0;
  return {
    rows,
    records: Object.fromEntries(
      Object.entries(records).map(([ref, record]) => [ref, checked ? brandNativeRecord(record, 'manifest-checked') : deepFreeze(record)]),
    ),
    integrity: { checked: manifest.files.length, problems },
    source: {
      dir,
      repository: result.repository,
      model: runner.model,
      runner: runner.version,
      repetitions: runner.repetitions,
      usage: runner.usage ?? null,
      failureClass: runner.failureClass ?? null,
      failures: runner.failures ?? [],
    },
  };
}

/**
 * The deterministic Test Design scorer as a replay function. Scores saved bytes
 * against the case's fixture set; the result is the signature `eval-test-design.js`
 * would have signed, the projection `test/lib/test-design-result.js` reduces it to,
 * and the metrics and counts the native diagnostics record. Fixture mutations happen
 * in the workspace, so the bytes cannot show them: the replay signs them as zero and
 * reports no `fixtureMutations` count, and a row's claimed count stays unverified.
 *
 * @param {{groundTruth: object}} options
 * @returns {(text: string, row: object) => object}
 */
function testDesignReplay({ groundTruth }) {
  const categories = new Set(groundTruth.riskCategories ?? []);
  return (text, row) => {
    const set = groundTruth.fixtureSets.find((entry) => entry.id === row.caseId);
    if (!set) return { unmeasurable: 'unknown-case' };
    const read = readDesign({ kind: 'text', value: text });
    if (!read.ok) return { unmeasurable: read.failureClass };
    const scored = scoreRun(set, read.design, categories);
    const { metrics, counts, notApplicable } = metricsFromContributions(numericContributions(testDesignDiagnosticProjection(scored, 0)));
    delete counts.fixtureMutations;
    return {
      signature: signatureOf(scored, 0),
      projection: projectTestDesignResult(text, set, categories),
      metrics,
      counts,
      notApplicable,
    };
  };
}

// ---------------------------------------------------------------------------
// rendering and files
// ---------------------------------------------------------------------------

const pct = (value) => (value === null || value === undefined ? 'unknown' : `${(value * 100).toFixed(1)}%`);
const num = (value) => (value === null || value === undefined ? 'unknown' : String(Number(value.toFixed(6))));

/** A readable rendering of the report. */
function renderReport(report) {
  const lines = [];
  lines.push(
    `# Experiment report: ${report.declaration.experimentId ?? 'unnamed'}`,
    '',
    `Advisory analysis. It carries no native EQ verdict, accepts no baseline and applies no patch.`,
    '',
    `- Stage: ${report.declaration.stage ?? 'unknown'}`,
    `- Declaration digest: \`${report.declaration.digest}\` (${describeFrozen(report.declaration.frozen)})`,
    `- Schema ${report.schemaVersion}, analysis ${report.analysisVersion}`,
    '',
  );
  if (report.declaration.problems.length > 0) {
    lines.push('## Declaration problems', '');
    for (const problem of report.declaration.problems) lines.push(`- ${problem.where}: ${problem.message}`);
    lines.push('');
  }

  const descriptive = report.descriptive;
  if (descriptive) {
    lines.push(
      '## Repeatability (descriptive)',
      '',
      `${descriptive.note}.`,
      '',
      `- Fresh receipted baseline trials: ${descriptive.freshIndependentTrials}`,
      `- Imported historical baseline trials: ${descriptive.importedHistoricalTrials}`,
      `- Copies excluded: ${descriptive.excludedCopies}`,
      '',
    );
    for (const group of descriptive.groups) {
      lines.push(
        `### Identity ${group.identity === 'unobserved' ? 'not recorded' : group.identity}`,
        '',
        '| Case | Completed / planned | Success | Native signature | Differing components |',
        '| --- | --- | --- | --- | --- |',
      );
      for (const entry of group.cases) {
        const stable =
          entry.stability.stable === null
            ? 'unknown'
            : entry.stability.stable
              ? 'stable'
              : `unstable (${entry.stability.distinct} distinct)`;
        lines.push(
          `| ${entry.caseId} | ${entry.completed} / ${entry.planned} | ${entry.successes} of ${entry.completed} (${pct(entry.successFraction)}) | ${stable} | ${(entry.stability.differingComponents ?? []).join(', ') || 'none or unknown'} |`,
        );
      }
      lines.push('', '| Case | Metric | n | Min | Max | Range | Mean |', '| --- | --- | --- | --- | --- | --- | --- |');
      for (const entry of group.cases) {
        for (const [name, spread] of Object.entries(entry.metrics)) {
          lines.push(
            `| ${entry.caseId} | ${name} | ${spread.n} | ${num(spread.min)} | ${num(spread.max)} | ${num(spread.range)} | ${num(spread.mean)} |`,
          );
        }
      }
      lines.push('');
    }
    const replay = descriptive.replay;
    lines.push('### Scorer replay on saved bytes', '');
    if (replay.status === 'replayed') {
      const replayed = replay.results.filter((entry) => entry.status === 'replayed');
      const deterministic = replayed.filter((entry) => entry.deterministic).length;
      lines.push(`- Replayed ${replayed.length} document(s); ${deterministic} replayed identically twice.`);
      const tally = (value) => replayed.filter((entry) => entry.nativeAgreement === value).length;
      lines.push(
        `- Against the recorded native signature: ${tally('match')} match, ${tally('differs')} differ, ${tally('not-comparable')} not comparable.`,
        '- A difference is a separate replay result. The native outcome stays as recorded.',
      );
    } else {
      lines.push(`- ${replay.reason}`);
    }
    lines.push(
      '',
      '### Judge',
      '',
      descriptive.judge.status === 'analyzed'
        ? `- Disagreement rate ${pct(descriptive.judge.disagreementRate)}, missing ${pct(descriptive.judge.missingRate)}, ${descriptive.judge.validity}.`
        : `- ${descriptive.judge.status}: ${descriptive.judge.reason}`,
      '',
    );
  }

  lines.push('## Paired contrast', '');
  const contrast = report.contrast;
  if (contrast?.status === 'analyzed') {
    lines.push(...renderContrast(contrast));
  } else if (contrast?.status === 'blocked') {
    lines.push(`Blocked.`, '', ...contrast.decision.reasons.map((reason) => `- ${reason}`), '');
  } else {
    lines.push(`${contrast?.reason ?? 'not requested'}`, '');
  }

  if (report.cost) {
    lines.push('## Cost', '');
    const line = (name, cost) =>
      `- ${name}: ${cost.total === null ? 'unknown' : `${num(cost.total)} ${cost.currency ?? ''}`.trim()}${cost.unknownComponents > 0 ? ` (${cost.unknownComponents} component(s) not recorded)` : ''}`;
    lines.push(
      line('Task execution', report.cost.taskExecution),
      line('Judge', report.cost.judge),
      line('Experiment total', report.cost.experimentTotal),
      '',
      report.cost.note,
      '',
    );
  }

  if (report.denominators) {
    lines.push('## Denominators', '', `- Planned slots per arm: ${report.denominators.plannedSlotsPerArm}`);
    for (const arm of ARMS) {
      const counts = report.denominators.arms[arm];
      lines.push(
        `- Arm ${arm}: ${counts.rows} rows, ${counts.completed} completed, ${counts.failed} failed, ${counts.canceled} canceled, ${counts.invalid} invalid, ${counts.timeout} timed out`,
      );
    }
    lines.push(
      `- Excluded rows: ${report.denominators.excludedAttempts}; index rows: ${report.denominators.attemptsInIndex}; reconciles: ${report.denominators.reconciles}`,
      '',
    );
  }
  if (report.exclusions.length > 0) {
    lines.push('## Exclusions', '');
    for (const entry of report.exclusions)
      lines.push(`- ${entry.attemptId ?? '(no id)'}: ${entry.reason}${entry.detail ? ` (${entry.detail})` : ''}`);
    lines.push('');
  }
  lines.push('## Source limitations', '');
  for (const limitation of report.sourceLimitations) lines.push(`- ${limitation}`);
  lines.push('');
  return `${lines.join('\n')}\n`.replaceAll(/\n{3,}/g, '\n\n');
}

function describeFrozen(frozen) {
  if (!frozen.declared) return 'not frozen';
  return frozen.matches ? 'frozen and matching' : 'frozen digest does not match';
}

function renderContrast(contrast) {
  const lines = [];
  lines.push(`Decision: **${contrast.decision.outcome}**`, '');
  for (const reason of contrast.decision.reasons) lines.push(`- ${reason}`);
  lines.push('', `Adoption would require ${contrast.decision.adoptionRequires}.`, '');
  const arms = contrast.arms;
  lines.push(
    '| Arm | Attempts | Completed | Errors | Canceled | Task cost | Task latency (ms) |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const arm of ARMS) {
    const side = arms[arm];
    const cost =
      side.taskExecutionCost.total === null
        ? 'unknown'
        : `${num(side.taskExecutionCost.total)} ${side.taskExecutionCost.currency ?? ''}`.trim();
    lines.push(
      `| ${arm} | ${side.attempts} | ${side.completed} | ${side.errors} | ${side.canceled} | ${cost} | ${num(side.taskLatencyMs)} |`,
    );
  }
  lines.push('');
  if (contrast.gates.length > 0) {
    lines.push('| Gate | Threshold | Lower bound | Result |', '| --- | --- | --- | --- |');
    for (const gate of contrast.gates)
      lines.push(`| ${gate.gate} | ${num(gate.threshold)} | ${num(gate.lower)} | ${gate.passes ? 'clears' : 'does not clear'} |`);
    lines.push('');
  }
  const { estimator } = contrast;
  lines.push(
    `Estimator: ${estimator.method}; alpha ${estimator.alpha}${estimator.simultaneous ? ` split to ${num(estimator.alphaPerBound)} per bound` : ''}, B ${estimator.B}, seed ${estimator.seed}, ${estimator.prng}, ${estimator.quantile} quantile, ${estimator.clusters} cluster(s). Calibration against reference fixtures: ${estimator.calibration.passed ? 'passed' : 'failed'}.`,
    '',
  );
  return lines;
}

/**
 * Write the three outputs into a new directory. Existing files are never overwritten.
 *
 * @param {{report: object, evidenceIndex: object}} result
 * @param {string} directory
 * @returns {string[]} The files written.
 */
function writeOutputs(result, directory) {
  fs.mkdirSync(directory, { recursive: true });
  const files = {
    'experiment-report.json': `${JSON.stringify(result.report, null, 2)}\n`,
    'experiment-report.md': renderReport(result.report),
    'evidence-index.json': `${JSON.stringify(result.evidenceIndex, null, 2)}\n`,
  };
  for (const name of Object.keys(files)) {
    if (fs.existsSync(path.join(directory, name)))
      throw new Error(`${path.join(directory, name)} already exists; outputs are never overwritten`);
  }
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(directory, name), content, { flag: 'wx' });
  return Object.keys(files).map((name) => path.join(directory, name));
}

// ---------------------------------------------------------------------------
// command line
// ---------------------------------------------------------------------------

/**
 * `analyze` reads an evidence file that points at saved material:
 * `{ declaration, recordedRuns: [{kind: "test-design", dir, arm, stage}], nativeRuns: [dir], attempts, ledger, resume, selection, judgeCalls }`,
 * where `nativeRuns` are run directories whose native records back the `attempts`, and
 * a confirmation's `selection` is the path of the selection stage's evidence file.
 * Relative paths resolve against the evidence file. `digest` prints the digest a
 * confirmation pins for a selection report.
 */
/** The `readExperiment` input an evidence file describes; manifest problems go into `integrity`. */
function loadEvidence(file, integrity) {
  const base = path.dirname(file);
  const evidence = readJson(file);
  const attempts = [...(evidence.attempts ?? [])];
  const references = evidence.recordedRuns ?? [];
  const nativeRecords = {};
  const addRecords = (records) => {
    for (const [ref, record] of Object.entries(records)) {
      if (Object.hasOwn(nativeRecords, ref) && canonicalJson(nativeRecords[ref]) !== canonicalJson(record)) {
        integrity.push(`${ref}: two native runs hold different records under one reference`);
      }
      nativeRecords[ref] = record;
    }
  };
  for (const reference of references) {
    const loaded = loadRecordedTestDesignRun({ dir: path.resolve(base, reference.dir), arm: reference.arm, stage: reference.stage });
    attempts.push(...loaded.rows);
    addRecords(loaded.records);
    integrity.push(...loaded.integrity.problems);
  }
  for (const dir of evidence.nativeRuns ?? []) {
    const loaded = loadRecordedTestDesignRun({ dir: path.resolve(base, dir) });
    addRecords(loaded.records);
    integrity.push(...loaded.integrity.problems);
  }
  return {
    declaration: readJson(path.resolve(base, evidence.declaration)),
    attempts,
    nativeRecords,
    ledger: evidence.ledger ?? null,
    resume: evidence.resume ?? null,
    judgeCalls: evidence.judgeCalls ?? null,
    recordedRuns: references.length,
  };
}

async function main(argv) {
  const [command, file, ...rest] = argv;
  if (command === 'freeze' && file) {
    const declaration = readJson(file);
    console.log(declarationDigest(declaration));
    return 0;
  }
  if (command === 'digest' && file) {
    console.log(digestOf(readJson(file)));
    return 0;
  }
  if (command === 'analyze' && file) {
    const outIndex = rest.indexOf('--out');
    const out = outIndex === -1 ? null : rest[outIndex + 1];
    if (!out) {
      console.error('analyze needs --out <directory>');
      return 2;
    }
    const integrity = [];
    const input = loadEvidence(path.resolve(file), integrity);
    const base = path.dirname(path.resolve(file));
    const selectionFile = readJson(path.resolve(file)).selection;
    if (selectionFile !== undefined && selectionFile !== null) {
      if (!isNonEmptyString(selectionFile)) {
        console.error('selection names the evidence file of the selection stage');
        return 2;
      }
      input.selection = loadEvidence(path.resolve(base, selectionFile), integrity);
    }
    if (integrity.length > 0) {
      console.error(`recorded evidence does not match its manifest:\n${integrity.join('\n')}`);
      return 1;
    }
    const testDesign = [input, input.selection].some(
      (entry) => entry?.recordedRuns > 0 || entry?.declaration?.scope?.workflow === 'bmad-tea-test-design',
    );
    const replay = testDesign ? testDesignReplay({ groundTruth: await loadGroundTruth() }) : null;
    const strip = ({ recordedRuns, ...rest }) => (void recordedRuns, rest);
    const result = readExperiment({ ...strip(input), selection: input.selection ? strip(input.selection) : null, replay });
    for (const file of writeOutputs(result, path.resolve(out))) console.log(file);
    return 0;
  }
  console.error(
    'usage: configuration-experiment.js freeze <declaration.json> | digest <experiment-report.json> | analyze <evidence.json> --out <directory>',
  );
  return 2;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error.message);
      process.exit(1);
    },
  );
}

module.exports = {
  SCHEMA_VERSION,
  ANALYSIS_VERSION,
  OUTCOMES,
  SIGNATURE_COMPONENTS,
  CALIBRATION_FIXTURES,
  canonicalJson,
  digestOf,
  declarationDigest,
  validateDeclaration,
  normalizeRow,
  classifyRows,
  priceUsage,
  pairedClusterBootstrap,
  runCalibration,
  lowerBoundClears,
  evaluateGates,
  appendExposure,
  verifyLedger,
  replayFixedOutput,
  analyzeJudgeCalls,
  readExperiment,
  renderReport,
  writeOutputs,
  loadRecordedTestDesignRun,
  trustNativeRecords,
  testDesignReplay,
};
