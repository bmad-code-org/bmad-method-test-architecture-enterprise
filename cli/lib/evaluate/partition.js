/**
 * Evaluation partitions (AD-22): the contract each partition runs (`contractView`, Story 1.51) and the authoring-safe
 * views of its scored outcomes.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { strengthAggregatePointer } = require('./interpret');

const PROBE_FILE = /\.probe\.json$/;
const PARTITIONS = ['development', 'held-out'];
/** The held-out plan's format version, which `schemas/held-out-plan.schema.json` holds the same. */
const HELD_OUT_PLAN_VERSION = 1;
const STEP_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ORACLE_ID = /^O-[0-9]{3,}$/;
const BEHAVIOR_ID = /^B-[0-9]{3,}$/;
/** The step an interaction-rooted pointer reads, as eval-quality's pointers and a captured binding spell it. */
const POINTER_STEP = /^\/interactions\/([a-z0-9]+(?:-[a-z0-9]+)*)\//;
/**
 * The structured fields that name a step through a pointer: an operand's `pointer`, a binding's `captured`, a rubric
 * criterion's `evidence` and a waiver's `condition`, the one machine-checkable field a waiver has. A step's `after` names
 * a step directly. Nothing else is read: a `literal`, a `commentary` or a `scope` is the adopter's text, and a string in
 * it that looks like a pointer is not a reference.
 */
const POINTER_FIELDS = new Set(['pointer', 'captured', 'evidence', 'condition']);
const HELD_OUT_PLAN_PATH = new RegExp(
  JSON.parse(fs.readFileSync(path.join(__dirname, 'schemas', 'evaluation.schema.json'), 'utf8')).properties.partitionPlan.properties
    .heldOutPlan.pattern,
);

/** Every committed probe, sorted by file name, parsed. */
function committedProbes(folder) {
  const directory = path.join(folder, 'probes');
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((name) => PROBE_FILE.test(name))
    .sort()
    .map((name) => ({ file: `probes/${name}`, probe: JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')) }));
}

/** The usage refusal (exit 64) for a partition other than `development` or `held-out`, or null. */
function unknownPartition(partition) {
  if (partition === undefined || PARTITIONS.includes(partition)) return null;
  return { exitCode: 64, message: `unknown partition ${JSON.stringify(partition)}; choose development or held-out` };
}

/**
 * The probes one partition selects, or why the request is refused.
 *
 * @param {object} options
 * @param {string|undefined} options.partition `development` or `held-out`; everything when undefined
 * @param {Iterable<string>} options.heldOutProbes `evaluation.json`'s `heldOutProbes`
 * @param {Array<{ probe: { probeId: string } }>} options.probes every committed probe
 * @returns {{ selectedProbeIds: Set<string>|null, refusal?: undefined } | { refusal: { exitCode: number, message: string } }}
 *   `selectedProbeIds` is null when every probe is selected
 */
function selectPartition({ partition, heldOutProbes, probes }) {
  if (partition === undefined) return { selectedProbeIds: null };
  const unknown = unknownPartition(partition);
  if (unknown !== null) return { refusal: unknown };
  const heldOut = new Set(heldOutProbes);
  const selectedProbeIds = new Set(
    probes.filter(({ probe }) => (partition === 'held-out') === heldOut.has(probe.probeId)).map(({ probe }) => probe.probeId),
  );
  if (partition === 'held-out' && selectedProbeIds.size === 0) {
    return { refusal: { exitCode: 10, message: 'held-out partition has no selected probes' } };
  }
  return { selectedProbeIds };
}

/** A partition plan that cannot yield a view; the message names paths and IDs, never a byte of the held-out plan. */
class PartitionPlanError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PartitionPlanError';
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** The step a pointer string reads, or undefined when it is no interaction-rooted pointer. */
const pointerStep = (text) => (typeof text === 'string' ? POINTER_STEP.exec(text)?.[1] : undefined);

/** Every step `value` names through a structured reference field, with repeats. */
function* referencedSteps(value) {
  if (Array.isArray(value)) {
    for (const item of value) yield* referencedSteps(item);
    return;
  }
  if (!isObject(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (key === 'literal') continue;
    switch (key) {
      case 'after': {
        if (typeof item === 'string' && STEP_ID.test(item)) yield item;
        break;
      }
      case 'evidenceTargets': {
        for (const target of Array.isArray(item) ? item : []) yield pointerStep(target);
        break;
      }
      case 'inputBinding': {
        // The channels and their binding names are the adopter's keys; only a binding's `captured` pointer is read.
        for (const channel of isObject(item) ? Object.values(item) : []) {
          for (const binding of isObject(channel) ? Object.values(channel) : []) {
            if (isObject(binding)) yield pointerStep(binding.captured);
          }
        }
        break;
      }
      default: {
        if (POINTER_FIELDS.has(key) && typeof item === 'string') yield pointerStep(item);
        else yield* referencedSteps(item);
      }
    }
  }
}

/** The plan steps `value` reads through a pointer, a captured binding, `evidenceTargets` or `after`, without repeats. */
function stepsReadBy(value) {
  return [...new Set([...referencedSteps(value)].filter((id) => id !== undefined))];
}

/** `value` when it has the shape an ID of that kind must have, otherwise where it sits: a held-out plan's own text is never echoed. */
const named = (value, pattern, fallback) => (typeof value === 'string' && pattern.test(value) ? value : fallback);

/**
 * The held-out plan file's parsed content: its steps, their oracles and the oracles each behavior gains in the held-out view.
 * Only the held-out and both views read it, so a development run never opens it.
 *
 * @param {string} folder
 * @param {object} evaluation
 * @param {object} [options]
 * @param {boolean} [options.shaped] refuse a file that lacks the plan's four top-level fields; `check` passes false and validates the
 *   file against its schema instead, to name each defect
 * @returns {{ schemaVersion: number, interactionPlan: object[], oracles: object[], behaviorOracles: Record<string, string[]> }}
 * @throws {PartitionPlanError}
 */
function readHeldOutPlan(folder, evaluation, { shaped = true } = {}) {
  const relative = evaluation.partitionPlan?.heldOutPlan;
  if (typeof relative !== 'string') throw new PartitionPlanError('evaluation.json declares no partitionPlan.heldOutPlan');
  // The schema pattern is the path's only shape rule, so the reader holds it too: a path outside corpus/held-out/, or one
  // that reaches it through a link, opens nothing.
  if (!HELD_OUT_PLAN_PATH.test(relative)) {
    throw new PartitionPlanError(`partitionPlan.heldOutPlan ${JSON.stringify(relative)} is not a file directly under corpus/held-out/`);
  }
  const file = path.join(folder, ...relative.split('/'));
  let bytes;
  try {
    if (fs.realpathSync(path.dirname(file)) !== path.join(fs.realpathSync(folder), 'corpus', 'held-out')) {
      throw new PartitionPlanError(`${relative} is not directly under corpus/held-out/ of the evaluation folder`);
    }
    if (!fs.lstatSync(file).isFile()) throw new PartitionPlanError(`${relative} is not a regular file`);
    bytes = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error instanceof PartitionPlanError) throw error;
    throw new PartitionPlanError(`${relative} cannot be read (${error.code ?? 'error'})`);
  }
  let plan;
  try {
    plan = JSON.parse(bytes);
  } catch {
    // The parser's own message quotes the bytes, which stay out of every finding.
    throw new PartitionPlanError(`${relative} does not parse as JSON`);
  }
  if (
    shaped &&
    (!isObject(plan) ||
      plan.schemaVersion !== HELD_OUT_PLAN_VERSION ||
      !Array.isArray(plan.interactionPlan) ||
      !Array.isArray(plan.oracles) ||
      !isObject(plan.behaviorOracles))
  ) {
    throw new PartitionPlanError(
      `${relative} is not a held-out plan (schemaVersion ${HELD_OUT_PLAN_VERSION}, interactionPlan, oracles, behaviorOracles)`,
    );
  }
  return plan;
}

/**
 * The contract one partition runs (Story 1.51, AD-9, AD-22), derived from `contract.json` and, for the held-out and both
 * views, the held-out plan.
 *
 * - No `partitionPlan`, or the development partition: the source bytes, untouched. The development-only steps stay in
 *   `contract.json`, so the development view is the file itself.
 * - `held-out`: the plan without the development-only steps and with the held-out steps appended; every oracle that reads
 *   a development-only step leaves with it (the engine fails `unreachable-check-evidence` on an oracle whose step is gone),
 *   each behavior gains the oracles the held-out plan lists for it, and the held-out oracles join `oracles`.
 * - `both`: the whole plan with the held-out steps appended, every oracle kept and the held-out oracles added.
 *
 * A derived view is serialized as `JSON.stringify(view, null, 2)` and a newline.
 *
 * @param {object} options
 * @param {Buffer} options.contractBytes the folder's `contract.json`
 * @param {object} options.evaluation parsed `evaluation.json`
 * @param {object|null} [options.heldOutPlan] the parsed held-out plan; never read for the development partition
 * @param {'development'|'held-out'|'both'} options.partition
 * @returns {{ bytes: Buffer, contract: object }}
 * @throws {PartitionPlanError}
 */
function contractView({ contractBytes, evaluation, heldOutPlan = null, partition }) {
  const source = JSON.parse(contractBytes.toString('utf8'));
  if (evaluation.partitionPlan === undefined || partition === 'development') return { bytes: contractBytes, contract: source };
  if (heldOutPlan === null) throw new PartitionPlanError(`the ${partition} view needs ${evaluation.partitionPlan.heldOutPlan}`);
  const developmentOnly = new Set(evaluation.partitionPlan.developmentOnlySteps ?? []);
  const view = structuredClone(source);
  const owned = new Set();
  if (partition === 'held-out') {
    view.interactionPlan = (source.interactionPlan ?? []).filter((step) => !developmentOnly.has(step.stepId));
    for (const oracle of source.oracles ?? []) {
      if (stepsReadBy(oracle).some((id) => developmentOnly.has(id))) owned.add(oracle.id);
    }
    view.oracles = (source.oracles ?? []).filter((oracle) => !owned.has(oracle.id));
  }
  view.interactionPlan = [...(view.interactionPlan ?? []), ...heldOutPlan.interactionPlan];
  view.oracles = [...(view.oracles ?? []), ...heldOutPlan.oracles];
  for (const behavior of view.behaviors ?? []) {
    behavior.oracles = [
      ...(behavior.oracles ?? []).filter((id) => !owned.has(id)),
      ...(Object.hasOwn(heldOutPlan.behaviorOracles, behavior.id) ? heldOutPlan.behaviorOracles[behavior.id] : []),
    ];
  }
  return { bytes: Buffer.from(`${JSON.stringify(view, null, 2)}\n`), contract: view };
}

/**
 * `contractView` over a folder: reads `contract.json` and, only for a partition that needs it, the held-out plan.
 *
 * @param {object} options
 * @param {string} options.folder
 * @param {object} options.evaluation
 * @param {'development'|'held-out'|'both'} options.partition
 * @returns {{ bytes: Buffer, contract: object }}
 * @throws {PartitionPlanError}
 */
function loadContractView({ folder, evaluation, partition }) {
  const contractBytes = fs.readFileSync(path.join(folder, 'contract.json'));
  const needsPlan = evaluation.partitionPlan !== undefined && partition !== 'development';
  return contractView({ contractBytes, evaluation, heldOutPlan: needsPlan ? readHeldOutPlan(folder, evaluation) : null, partition });
}

/**
 * Writes `partitions.json` and `gap-view.json` into the run directory through its held writer (`run-directory.js`).
 * `partitions.json` carries the pointer to the run's strength aggregate (Story 1.45); the counts, rates and decisions stay in `strength-aggregate.json`.
 * `evidence` maps each scored probe to the parsed evidence artifact the writer read back from the score directory
 * (`score.js`); a probe with none has `outcome: null`.
 * `readInput(relative)` returns a run file parsed from the bytes `score` held at its input check (`score-inputs.js`),
 * so a probe file rewritten while `score` ran cannot reach a view.
 */
function writePartitionViews({ writer, readInput, scoreInvocationId, trialSets, evidence, heldOutProbes, strengthAggregate }) {
  const heldOut = new Set(heldOutProbes ?? []);
  const partitions = { scoreInvocationId, strengthAggregate: strengthAggregatePointer(strengthAggregate), development: [], 'held-out': [] };
  const gapView = { scoreInvocationId, development: [], 'held-out': [] };
  for (const set of trialSets) {
    const probe = readInput(set.probe);
    const outcome = evidence.get(set.probeId)?.reducedProbeOutcomes?.find((entry) => entry.probeId === set.probeId) ?? null;
    const partition = heldOut.has(set.probeId) ? 'held-out' : 'development';
    const summary = { probeId: set.probeId, probeClass: probe.probeClass, outcome };
    partitions[partition].push(summary);
    gapView[partition].push(partition === 'held-out' ? summary : { ...summary, probe });
  }
  for (const [name, value] of [
    ['partitions.json', partitions],
    ['gap-view.json', gapView],
  ])
    writer.replaceJson(name, value);
}

const stepLabel = (step, index) => named(step?.stepId, STEP_ID, `interactionPlan[${index}]`);
const oracleLabel = (oracle, index) => named(oracle?.id, ORACLE_ID, `oracles[${index}]`);

/** `check`'s findings for the partition plan: paths and IDs only, never a byte of the held-out plan. */
const PLAN_RULE = 'partition-plan';

/**
 * What is wrong with a partition plan, as `{ file, rule, message }` findings (Story 1.51). Every message names a file, a
 * path or an ID and none quotes a value of the held-out plan, because the findings reach the authoring loop.
 *
 * @param {object} options
 * @param {object} options.contract the parsed `contract.json`
 * @param {object} options.evaluation the parsed `evaluation.json`, holding a `partitionPlan`
 * @param {object|undefined} options.heldOutPlan the parsed held-out plan, when it could be read
 * @param {Set<string>} options.heldOutBehaviors the behaviors a held-out probe discharges
 * @returns {Array<{ file: string, rule: string, message: string }>}
 */
function partitionPlanProblems({ contract, evaluation, heldOutPlan, heldOutBehaviors }) {
  const problems = [];
  const add = (file, message) => problems.push({ file, rule: PLAN_RULE, message });
  const plan = evaluation.partitionPlan;
  const file = plan.heldOutPlan;
  const sourcePlan = (Array.isArray(contract.interactionPlan) ? contract.interactionPlan : []).filter(isObject);
  const sourceSteps = new Set(sourcePlan.map((step) => step.stepId));
  const developmentOnly = new Set(plan.developmentOnlySteps ?? []);
  for (const id of developmentOnly) {
    if (!sourceSteps.has(id))
      add('evaluation.json', `partitionPlan.developmentOnlySteps names step ${id}, which contract.json does not declare`);
  }
  for (const [where, value] of [
    ['rubrics', contract.rubrics],
    ['waivers', contract.waivers],
  ]) {
    for (const id of stepsReadBy(value)) {
      if (developmentOnly.has(id))
        add('contract.json', `${where} read development-only step ${id}; a partition plan does not partition ${where} yet`);
    }
  }
  for (const step of sourcePlan) {
    if (developmentOnly.has(step.stepId)) continue;
    for (const id of stepsReadBy(step)) {
      if (developmentOnly.has(id)) {
        add(
          'contract.json',
          `step ${step.stepId} reads development-only step ${id}, which the held-out view removes; only a development-only step may read it`,
        );
      }
    }
  }
  if (heldOutPlan === undefined) return problems;
  // The held-out plan's steps and oracles are named by ID only when the ID has the shape the schema gives it, and otherwise
  // by index, so a free-text ID never reaches a finding.
  const heldSteps = heldOutPlan.interactionPlan
    .map((step, index) => ({ step, label: stepLabel(step, index) }))
    .filter(({ step }) => isObject(step));
  const heldOracles = heldOutPlan.oracles
    .map((oracle, index) => ({ oracle, label: oracleLabel(oracle, index) }))
    .filter(({ oracle }) => isObject(oracle));
  const seenSteps = new Set();
  for (const { step, label } of heldSteps) {
    if (sourceSteps.has(step.stepId)) add(file, `step ${label} has the ID of a step contract.json declares`);
    else if (seenSteps.has(step.stepId)) add(file, `step ${label} is declared more than once`);
    seenSteps.add(step.stepId);
  }
  const sourceOracles = new Set((Array.isArray(contract.oracles) ? contract.oracles : []).filter(isObject).map((oracle) => oracle.id));
  const seenOracles = new Set();
  for (const { oracle, label } of heldOracles) {
    if (sourceOracles.has(oracle.id)) add(file, `oracle ${label} has the ID of an oracle contract.json declares`);
    else if (seenOracles.has(oracle.id)) add(file, `oracle ${label} is declared more than once`);
    seenOracles.add(oracle.id);
  }
  const visible = new Set([...sourceSteps].filter((id) => !developmentOnly.has(id)));
  for (const id of seenSteps) visible.add(id);
  for (const { step, label } of heldSteps) {
    for (const id of stepsReadBy(step)) {
      if (!visible.has(id)) add(file, `step ${label} reads step ${id}, which the held-out view does not declare`);
    }
  }
  for (const { oracle, label } of heldOracles) {
    for (const id of stepsReadBy(oracle)) {
      if (!visible.has(id)) add(file, `oracle ${label} reads step ${id}, which the held-out view does not declare`);
    }
  }
  const behaviors = new Set((Array.isArray(contract.behaviors) ? contract.behaviors : []).filter(isObject).map((behavior) => behavior.id));
  const entries = Object.entries(heldOutPlan.behaviorOracles);
  for (const [position, [behaviorId, ids]] of entries.entries()) {
    const behavior = named(behaviorId, BEHAVIOR_ID, `behaviorOracles entry ${position}`);
    if (!behaviors.has(behaviorId)) add(file, `behaviorOracles names behavior ${behavior}, which contract.json does not declare`);
    for (const id of Array.isArray(ids) ? ids : []) {
      if (!seenOracles.has(id))
        add(
          file,
          `behaviorOracles lists oracle ${named(id, ORACLE_ID, 'an ID of no oracle shape')} for behavior ${behavior}, which the held-out plan does not declare`,
        );
    }
  }
  if (problems.length > 0) return problems;
  const view = contractView({
    contractBytes: Buffer.from(JSON.stringify(contract)),
    evaluation,
    heldOutPlan,
    partition: 'held-out',
  }).contract;
  const hadOracle = new Set(
    (Array.isArray(contract.behaviors) ? contract.behaviors : [])
      .filter((behavior) => isObject(behavior) && Array.isArray(behavior.oracles) && behavior.oracles.length > 0)
      .map((behavior) => behavior.id),
  );
  for (const behavior of view.behaviors ?? []) {
    const count = (behavior.oracles ?? []).length;
    // A behavior the source declares with no oracle is legal and stays so; only a view that takes the last oracle away is a defect.
    if (count === 0 && hadOracle.has(behavior.id)) {
      add(file, `behavior ${behavior.id} keeps no oracle in the held-out view; list an oracle for it under behaviorOracles`);
    } else if (count !== 1 && heldOutBehaviors.has(behavior.id)) {
      add(
        file,
        `behavior ${behavior.id}, discharged by a held-out probe, declares ${count} oracles in the held-out view; it must declare exactly 1`,
      );
    }
  }
  return problems;
}

module.exports = {
  HELD_OUT_PLAN_VERSION,
  PARTITIONS,
  PartitionPlanError,
  committedProbes,
  contractView,
  loadContractView,
  partitionPlanProblems,
  readHeldOutPlan,
  selectPartition,
  stepsReadBy,
  unknownPartition,
  writePartitionViews,
};
