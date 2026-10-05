/**
 * Evaluation partitions (AD-22): the contract each partition runs (`contractView`, Story 1.51) and the authoring-safe
 * views of its scored outcomes.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { strengthAggregatePointer } = require('./interpret');
const { isOracleBinding, mappingContractProblems } = require('./judgment-rows');
const { CHOSEN_CALL } = require('./records');

const PROBE_FILE = /\.probe\.json$/;
const PARTITIONS = ['development', 'held-out'];
/** The held-out plan's format version, which `schemas/held-out-plan.schema.json` holds the same. */
const HELD_OUT_PLAN_VERSION = 1;
const STEP_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROBE_ID = /^P-[0-9]{3,}$/;
/**
 * The folder the held-out plan and the held-out answers sit in, sealed from a development run: the held-out plan is a file
 * directly under it, and `corpus-index.js` leaves everything below it out of a development run's staleness comparison.
 */
const HELD_OUT_DIRECTORY = 'corpus/held-out/';
/**
 * Where a gameability probe's answers to the held-out plan's steps are committed (Story 1.109), one `<probeId>.json` per probe in
 * the shape of `corpus/gameability/<probeId>.json`. It sits beside the held-out plan under `HELD_OUT_DIRECTORY`: a development run
 * opens none of it.
 */
const HELD_OUT_ANSWERS_DIRECTORY = `${HELD_OUT_DIRECTORY}gameability/`;
const ORACLE_ID = /^O-[0-9]{3,}$/;
const BEHAVIOR_ID = /^B-[0-9]{3,}$/;
const RUBRIC_ID = /^R-[0-9]{3,}$/;
const CRITERION_ID = /^RC-[0-9]{3,}$/;
const WAIVER_ID = /^W-[0-9]{3,}$/;
/** The step an interaction-rooted pointer reads, as eval-quality's pointers and a captured binding spell it. */
const POINTER_STEP = /^\/interactions\/([a-z0-9]+(?:-[a-z0-9]+)*)\//;
/**
 * Every step a waiver's free-text `condition` names (Story 1.106). A step ID has the shape `[a-z0-9]+(?:-[a-z0-9]+)*`, so a
 * reference is `/interactions/<stepId>` wherever it sits in the sentence. The ID is whole when the next character is not an ASCII
 * letter, a digit or `_`, and is not a hyphen followed by an ASCII letter or digit: `_` continues a word, so
 * `/interactions/held-out-run_x` reads no step, and a non-ASCII letter ends a reference. Every pointer is read, the first and each
 * later one, and a pointer with no path after the step (`/interactions/held-out-run is absent`) still names its step. A position
 * before the pointer is not constrained, and the scan is a zero-width lookahead, so one reference does not consume the next:
 * `/interactions/interactions/held-out-run` reads `interactions` and `held-out-run`, and text that wraps a pointer cannot hide it.
 */
const CONDITION_STEPS = /(?=\/interactions\/([a-z0-9]+(?:-[a-z0-9]+)*)(?![A-Za-z0-9_]|-[A-Za-z0-9]))/g;
/**
 * The structured fields that name a step through a pointer that starts the string: an operand's `pointer`, a binding's `captured`
 * and a rubric criterion's `evidence`. A waiver's `condition` is a sentence and is read by `CONDITION_STEPS` instead. A step's
 * `after` names a step directly. Nothing else is read: a `literal`, a `commentary` or a `scope` is the adopter's text, and a
 * string in it that looks like a pointer is not a reference.
 */
const POINTER_FIELDS = new Set(['pointer', 'captured', 'evidence']);
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

/** Every step a waiver's `condition` names, in the order the sentence names them, with repeats. */
const conditionSteps = (text) => (typeof text === 'string' ? [...text.matchAll(CONDITION_STEPS)].map((match) => match[1]) : []);

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
      case 'condition': {
        yield* conditionSteps(item);
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
 * What a finding calls a criterion of the held-out plan: `rubricId/criterionId` when both IDs have the schema's shape, otherwise
 * where the criterion sits in the plan's `rubrics`. A free-text ID is the adopter's own text and never reaches a finding.
 */
function planCriterionName(rubric, rubricIndex, criterion, criterionIndex) {
  const shaped =
    typeof rubric?.id === 'string' && RUBRIC_ID.test(rubric.id) && typeof criterion?.id === 'string' && CRITERION_ID.test(criterion.id);
  return shaped ? `${rubric.id}/${criterion.id}` : `rubrics[${rubricIndex}]/criteria[${criterionIndex}]`;
}

/**
 * The held-out plan file's parsed content: its steps, their oracles and the oracles each behavior gains in the held-out view.
 * Only the held-out and both views read it, so a development run never opens it.
 *
 * @param {string} folder
 * @param {object} evaluation
 * @param {object} [options]
 * @param {boolean} [options.shaped] refuse a file that lacks the plan's four top-level fields; `check` passes false and validates the
 *   file against its schema instead, to name each defect
 * @returns {{ schemaVersion: number, interactionPlan: object[], oracles: object[], rubrics?: object[], waivers?: object[], mappings?: object[], behaviorOracles: Record<string, string[]> }}
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
    if (fs.realpathSync.native(path.dirname(file)) !== path.join(fs.realpathSync.native(folder), 'corpus', 'held-out')) {
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

/** Where one gameability probe's answers to the held-out plan's steps are committed, relative to the evaluation folder. */
const heldOutResponsePath = (probeId) => `${HELD_OUT_ANSWERS_DIRECTORY}${probeId}.json`;

/**
 * One gameability probe's answers to the held-out plan's steps (Story 1.109): the file's bytes, which a run digests, and its parsed
 * content, whose `steps` answer the held-out plan's steps. Only the held-out and both views read it, so a development run never
 * opens it. The file is a regular file directly under `corpus/held-out/gameability/` of the evaluation folder, reached through no
 * link, and a refusal names the path and never a byte of the file.
 *
 * @param {string} folder
 * @param {string} probeId a probe ID of the form `P-NNN`
 * @returns {{ path: string, bytes: Buffer, response: object }}
 * @throws {PartitionPlanError} `absent` is true when the file does not exist
 */
function readHeldOutResponse(folder, probeId) {
  if (typeof probeId !== 'string' || !PROBE_ID.test(probeId)) {
    throw new PartitionPlanError('a gameability probe answers the held-out plan from a file named by its probe ID, of the form P-NNN');
  }
  const relative = heldOutResponsePath(probeId);
  const file = path.join(folder, ...relative.split('/'));
  let bytes;
  try {
    // The native real path spells the directory as the disk does, on a case-insensitive file system too, so a case-variant
    // `corpus/held-out/Gameability/` is refused here and no other spelling than the sealed one is read.
    if (
      fs.realpathSync.native(path.dirname(file)) !==
      path.join(fs.realpathSync.native(folder), ...HELD_OUT_ANSWERS_DIRECTORY.split('/').filter(Boolean))
    ) {
      throw new PartitionPlanError(`${relative} is not directly under ${HELD_OUT_ANSWERS_DIRECTORY} of the evaluation folder`);
    }
    if (!fs.lstatSync(file).isFile()) throw new PartitionPlanError(`${relative} is not a regular file`);
    bytes = fs.readFileSync(file);
  } catch (error) {
    if (error instanceof PartitionPlanError) throw error;
    const refusal = new PartitionPlanError(`${relative} cannot be read (${error.code ?? 'error'})`);
    refusal.absent = error.code === 'ENOENT';
    throw refusal;
  }
  try {
    return { path: relative, bytes, response: JSON.parse(bytes.toString('utf8')) };
  } catch {
    // The parser's own message quotes the bytes, which stay out of every finding.
    throw new PartitionPlanError(`${relative} does not parse as JSON`);
  }
}

/**
 * A rubric of `contract.json` as the held-out view holds it (Story 1.105): without the criteria whose evidence reads a
 * development-only step, and not at all when that leaves it none. A rubric that loses nothing, and one that never had a
 * criterion, is returned as it is.
 *
 * @returns {object[]} the rubric, a copy that holds its remaining criteria, or nothing
 */
function reachableRubric(rubric, developmentOnly) {
  if (!isObject(rubric) || !Array.isArray(rubric.criteria)) return [rubric];
  const criteria = rubric.criteria.filter((criterion) => !stepsReadBy(criterion).some((id) => developmentOnly.has(id)));
  if (criteria.length === rubric.criteria.length) return [rubric];
  return criteria.length === 0 ? [] : [{ ...rubric, criteria }];
}

/**
 * Whether the held-out view keeps a waiver of `contract.json` (Story 1.106). A waiver names a discipline rule and no oracle, so
 * the one thing that places it is its `condition`, the only field of a waiver that reads a step: the waiver leaves with a
 * development-only step its condition reads. A waiver whose condition reads no step is shared.
 */
const reachableWaiver = (waiver, developmentOnly) => !stepsReadBy(waiver).some((id) => developmentOnly.has(id));

/**
 * The contract one partition runs (Story 1.51, AD-9, AD-22), derived from `contract.json` and, for the held-out and both
 * views, the held-out plan.
 *
 * - No `partitionPlan`, or the development partition: the source bytes, untouched. The development-only steps stay in
 *   `contract.json`, so the development view is the file itself.
 * - `held-out`: the plan without the development-only steps and with the held-out steps appended; every oracle that reads
 *   a development-only step leaves with it (the engine fails `unreachable-check-evidence` on an oracle whose step is gone),
 *   each behavior gains the oracles the held-out plan lists for it, and the held-out oracles join `oracles`. A rubric
 *   criterion leaves with the step its evidence reads (Story 1.105): `contract.json`'s criteria that read a development-only
 *   step go, a rubric left with none goes, and the held-out plan's rubrics join `rubrics`. A waiver leaves with the
 *   development-only step its `condition` reads (Story 1.106), and the held-out plan's waivers join `waivers`.
 * - `both`: the whole plan with the held-out steps appended, every oracle, criterion and waiver kept and the held-out oracles,
 *   rubrics and waivers added.
 *
 * A derived view is serialized as `JSON.stringify(view, null, 2)` and a newline.
 *
 * The result carries the parsed `source`, the `heldOutPlan` the view was derived from (null when none was read) and the
 * `partition`, which `mappingView` derives the evaluator's mapping from (Story 1.107).
 *
 * @param {object} options
 * @param {Buffer} options.contractBytes the folder's `contract.json`
 * @param {object} options.evaluation parsed `evaluation.json`
 * @param {object|null} [options.heldOutPlan] the parsed held-out plan; never read for the development partition
 * @param {'development'|'held-out'|'both'} options.partition
 * @returns {{ bytes: Buffer, contract: object, source: object, heldOutPlan: object|null, partition: string }}
 * @throws {PartitionPlanError}
 */
function contractView({ contractBytes, evaluation, heldOutPlan = null, partition }) {
  const source = JSON.parse(contractBytes.toString('utf8'));
  if (evaluation.partitionPlan === undefined || partition === 'development') {
    return { bytes: contractBytes, contract: source, source, heldOutPlan: null, partition };
  }
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
    if (Array.isArray(source.rubrics)) view.rubrics = source.rubrics.flatMap((rubric) => reachableRubric(rubric, developmentOnly));
    if (Array.isArray(source.waivers)) view.waivers = source.waivers.filter((waiver) => reachableWaiver(waiver, developmentOnly));
  }
  view.interactionPlan = [...(view.interactionPlan ?? []), ...heldOutPlan.interactionPlan];
  view.oracles = [...(view.oracles ?? []), ...heldOutPlan.oracles];
  // A plan that declares no `rubrics` appends nothing; the held-out view still drops the criteria the held-out partition cannot reach.
  if ((heldOutPlan.rubrics ?? []).length > 0) view.rubrics = [...(view.rubrics ?? []), ...heldOutPlan.rubrics];
  // Likewise for `waivers`: a plan that declares none appends nothing, and the held-out view still drops the waivers that read a
  // development-only step.
  if ((heldOutPlan.waivers ?? []).length > 0) view.waivers = [...(view.waivers ?? []), ...heldOutPlan.waivers];
  for (const behavior of view.behaviors ?? []) {
    behavior.oracles = [
      ...(behavior.oracles ?? []).filter((id) => !owned.has(id)),
      ...(Object.hasOwn(heldOutPlan.behaviorOracles, behavior.id) ? heldOutPlan.behaviorOracles[behavior.id] : []),
    ];
  }
  return { bytes: Buffer.from(`${JSON.stringify(view, null, 2)}\n`), contract: view, source, heldOutPlan, partition };
}

/**
 * `contractView` over a folder: reads `contract.json` and, only for a partition that needs it, the held-out plan.
 *
 * @param {object} options
 * @param {string} options.folder
 * @param {object} options.evaluation
 * @param {'development'|'held-out'|'both'} options.partition
 * @returns {{ bytes: Buffer, contract: object, source: object, heldOutPlan: object|null, partition: string }}
 * @throws {PartitionPlanError}
 */
function loadContractView({ folder, evaluation, partition }) {
  const contractBytes = fs.readFileSync(path.join(folder, 'contract.json'));
  const needsPlan = evaluation.partitionPlan !== undefined && partition !== 'development';
  return contractView({ contractBytes, evaluation, heldOutPlan: needsPlan ? readHeldOutPlan(folder, evaluation) : null, partition });
}

/** The oracle IDs and `rubricId/criterionId` pairs a contract declares, read defensively: `check` reports a contract off its schema on its own. */
function declaredBindings(contract) {
  const list = (value) => (Array.isArray(value) ? value : []);
  return {
    oracles: new Set(list(contract?.oracles).map((oracle) => oracle?.id)),
    criteria: new Set(
      list(contract?.rubrics).flatMap((rubric) => list(rubric?.criteria).map((criterion) => `${rubric?.id}/${criterion?.id}`)),
    ),
  };
}

/** The binding a held-out plan's mapping row holds, which is the row without its key. */
function rowBinding(row) {
  return Object.fromEntries(Object.entries(row).filter(([name]) => name !== 'key'));
}

/** The mapping rows a held-out plan declares, as an array of objects only (`check` holds the plan to its schema). */
const planMappingRows = (heldOutPlan) => (Array.isArray(heldOutPlan?.mappings) ? heldOutPlan.mappings : []);

/** Whether a `mapping.json` row binds an oracle or a rubric criterion that `source` declares and `view` does not. */
function leavesView(binding, inSource, inView) {
  if (isOracleBinding(binding)) return inSource.oracles.has(binding.oracleId) && !inView.oracles.has(binding.oracleId);
  const pair = `${binding?.rubricId}/${binding?.criterionId}`;
  return inSource.criteria.has(pair) && !inView.criteria.has(pair);
}

/**
 * The evaluator mapping one partition's run reads (Story 1.107, AD-21, AD-22): the rows of `evaluator/mapping.json` that bind
 * what the view declares, and for the held-out and both views the rows the held-out plan's `mappings` add. An evaluator other
 * than the deterministic one binds oracles and rubric criteria through this mapping, so the mapping follows the contract view
 * the run compiles, seals and records, and a run's evaluator layer (its tree digest, its row validator, the keys a sealed-brief
 * agent is shown, the rows the runtime converts) never names an oracle or criterion its view dropped.
 *
 * - No `partitionPlan`, or the development partition: the source bytes, untouched. `contract.json` holds every oracle and
 *   criterion the development view declares, and a row for one it lacks stays in the mapping for `check` and the run to refuse.
 * - `held-out`: the source rows without those that bind an oracle or a criterion of `contract.json` the held-out view dropped
 *   (an oracle that reads a development-only step, a criterion that does), then the plan's rows.
 * - `both`: every source row, then the plan's rows.
 *
 * The held-out view is always serialized as `JSON.stringify(mapping, null, 2)` and a newline, so its bytes (the evaluator tree
 * digest and the evaluator configuration digest of a held-out run) move only with the rows it holds and never with a
 * development-only row that came or went. The both view of a plan with no `mappings` is the source bytes, and with rows it is
 * serialized the same way.
 *
 * @param {object} options
 * @param {Buffer} options.mappingBytes the folder's `evaluator/mapping.json`, which meets its schema
 * @param {object} options.source the parsed `contract.json`
 * @param {object} options.view the contract the run compiles (`contractView(...).contract`)
 * @param {object} options.evaluation parsed `evaluation.json`
 * @param {object|null} [options.heldOutPlan] the parsed held-out plan; never read for the development partition
 * @param {'development'|'held-out'|'both'} options.partition
 * @returns {{ bytes: Buffer, mapping: object }}
 * @throws {PartitionPlanError}
 */
function mappingView({ mappingBytes, source, view, evaluation, heldOutPlan = null, partition }) {
  const mapping = JSON.parse(mappingBytes.toString('utf8'));
  if (evaluation.partitionPlan === undefined || partition === 'development') return { bytes: mappingBytes, mapping };
  if (heldOutPlan === null) throw new PartitionPlanError(`the ${partition} mapping needs ${evaluation.partitionPlan.heldOutPlan}`);
  const inSource = declaredBindings(source);
  const inView = declaredBindings(view);
  const entries = Object.entries(mapping.keys);
  const kept = entries.filter(([, binding]) => !leavesView(binding, inSource, inView));
  const rows = planMappingRows(heldOutPlan);
  if (partition === 'both' && rows.length === 0) return { bytes: mappingBytes, mapping };
  const keys = Object.fromEntries(kept);
  for (const [index, row] of rows.entries()) {
    // The plan's text never reaches a message, so a row is named by where it sits.
    // A key the file declares collides whether or not the view kept its row, so a plan never reuses a dropped row's key.
    if (!isObject(row) || Object.hasOwn(mapping.keys, row.key) || Object.hasOwn(keys, row.key)) {
      throw new PartitionPlanError(
        `${evaluation.partitionPlan.heldOutPlan} mappings[${index}] has a key that evaluator/mapping.json or an earlier row declares`,
      );
    }
    keys[row.key] = rowBinding(row);
  }
  const derived = { ...mapping, keys };
  return { bytes: Buffer.from(`${JSON.stringify(derived, null, 2)}\n`), mapping: derived };
}

/**
 * What is wrong with the rows a held-out plan's `mappings` add to the held-out view (Story 1.107), as messages that name a row
 * by where it sits (`mappings[2]`) and never by its key, which is the plan's own text: a key `evaluator/mapping.json` declares or
 * an earlier row declares, an oracle, behavior or criterion the held-out view does not declare, an oracle its behavior does not
 * declare in that view, levels other than the criterion's anchored scale levels, an oracle or criterion another key binds, and a
 * plan rubric criterion no key binds. Rows of `contract.json` are `check`'s own business (`mappingContractProblems` over
 * `contract.json`), so none of them is reported here.
 *
 * @param {object} options
 * @param {object} options.mapping the parsed `evaluator/mapping.json`, which meets its schema
 * @param {object} options.source the parsed `contract.json`
 * @param {object} options.view the held-out view's contract
 * @param {object} options.heldOutPlan the held-out plan, which meets its schema
 * @returns {string[]}
 */
function mappingViewProblems({ mapping, source, view, heldOutPlan }) {
  const problems = [];
  const inSource = declaredBindings(source);
  const inView = declaredBindings(view);
  const labelled = {};
  for (const [key, binding] of Object.entries(mapping.keys)) if (!leavesView(binding, inSource, inView)) labelled[key] = binding;
  const planLabels = new Set();
  const seen = new Set();
  for (const [index, row] of planMappingRows(heldOutPlan).entries()) {
    if (!isObject(row)) continue;
    const label = `mappings[${index}]`;
    if (Object.hasOwn(mapping.keys, row.key)) problems.push(`${label} has the key of a row evaluator/mapping.json declares`);
    else if (seen.has(row.key)) problems.push(`${label} has the key of an earlier row`);
    else {
      labelled[label] = rowBinding(row);
      planLabels.add(label);
    }
    seen.add(row.key);
  }
  problems.push(
    ...mappingContractProblems({ ...mapping, keys: labelled }, view, {
      subject: 'the held-out view',
      levels: false,
      reportKey: (key) => planLabels.has(key),
      reportCriterion: (pair) => !inSource.criteria.has(pair),
    }),
  );
  return problems;
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
  // `<label>-call-<n>` is how an observation of a call the agent chose is named, so a step named `call-<n>` would make its own
  // observation look like an agent's call, and a records harness's observation of it would pass for one (Story 1.107). The ID is
  // `contract.json`'s own text, so it is named.
  for (const step of sourcePlan) {
    if (typeof step.stepId === 'string' && CHOSEN_CALL.test(step.stepId)) {
      add('contract.json', `step ${step.stepId} has an ID of the form call-<n>, which names a call the agent chose; rename the step`);
    }
  }
  // A waiver of contract.json is in the development view, and in the held-out view unless its condition reads a development-only
  // step, so the development view must declare every step the condition reads (Story 1.106). The IDs are named only when they
  // have the schema's shape: a free-text one is the adopter's own text.
  for (const [index, waiver] of (Array.isArray(contract.waivers) ? contract.waivers : []).entries()) {
    if (!isObject(waiver)) continue;
    const waiverLabel = named(waiver.id, WAIVER_ID, `waivers[${index}]`);
    for (const id of stepsReadBy(waiver)) {
      if (!sourceSteps.has(id)) {
        add(
          'contract.json',
          `waiver ${waiverLabel} reads step ${id}, which the development view does not declare; a waiver that reads a held-out step belongs in the held-out plan's waivers`,
        );
      }
    }
  }
  // A criterion of contract.json is in the development view, and in the held-out view unless it reads a development-only
  // step, so the development view must declare the step it reads (Story 1.105).
  // The IDs are named only when they have the schema's shape: a free-text one is the adopter's own text.
  for (const [index, rubric] of (Array.isArray(contract.rubrics) ? contract.rubrics : []).entries()) {
    if (!isObject(rubric)) continue;
    const rubricLabel = named(rubric.id, RUBRIC_ID, `rubrics[${index}]`);
    for (const [position, criterion] of (Array.isArray(rubric.criteria) ? rubric.criteria : []).entries()) {
      if (!isObject(criterion)) continue;
      const criterionLabel = named(criterion.id, CRITERION_ID, `criteria[${position}]`);
      for (const id of stepsReadBy(criterion)) {
        if (!sourceSteps.has(id)) {
          add(
            'contract.json',
            `criterion ${criterionLabel} of rubric ${rubricLabel} reads step ${id}, which the development view does not declare; a criterion that reads a held-out step belongs in the held-out plan's rubrics`,
          );
        }
      }
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
    if (typeof step.stepId === 'string' && CHOSEN_CALL.test(step.stepId)) {
      add(file, `step ${label} has an ID of the form call-<n>, which names a call the agent chose; rename the step`);
    }
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
  const sourceRubrics = new Set((Array.isArray(contract.rubrics) ? contract.rubrics : []).filter(isObject).map((rubric) => rubric.id));
  const seenRubrics = new Set();
  for (const [index, rubric] of (heldOutPlan.rubrics ?? []).entries()) {
    if (!isObject(rubric)) continue;
    const rubricLabel = named(rubric.id, RUBRIC_ID, `rubrics[${index}]`);
    if (sourceRubrics.has(rubric.id)) add(file, `rubric ${rubricLabel} has the ID of a rubric contract.json declares`);
    else if (seenRubrics.has(rubric.id)) add(file, `rubric ${rubricLabel} is declared more than once`);
    seenRubrics.add(rubric.id);
    for (const [position, criterion] of (Array.isArray(rubric.criteria) ? rubric.criteria : []).entries()) {
      if (!isObject(criterion)) continue;
      const criterionLabel = named(criterion.id, CRITERION_ID, `criteria[${position}]`);
      for (const id of stepsReadBy(criterion)) {
        if (!visible.has(id)) {
          add(file, `criterion ${criterionLabel} of rubric ${rubricLabel} reads step ${id}, which the held-out view does not declare`);
        }
      }
    }
  }
  const sourceWaivers = new Set((Array.isArray(contract.waivers) ? contract.waivers : []).filter(isObject).map((waiver) => waiver.id));
  const seenWaivers = new Set();
  for (const [index, waiver] of (heldOutPlan.waivers ?? []).entries()) {
    if (!isObject(waiver)) continue;
    const waiverLabel = named(waiver.id, WAIVER_ID, `waivers[${index}]`);
    if (sourceWaivers.has(waiver.id)) add(file, `waiver ${waiverLabel} has the ID of a waiver contract.json declares`);
    else if (seenWaivers.has(waiver.id)) add(file, `waiver ${waiverLabel} is declared more than once`);
    seenWaivers.add(waiver.id);
    // A waiver's condition is free text that may hold a pointer, so a step is named only when the development partition already
    // knows it (a development-only step); any other step is the plan's own text.
    for (const id of stepsReadBy(waiver)) {
      if (!visible.has(id)) {
        add(
          file,
          developmentOnly.has(id)
            ? `waiver ${waiverLabel} reads development-only step ${id}, which the held-out view does not declare`
            : `waiver ${waiverLabel} reads a step the held-out view does not declare`,
        );
      }
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
  HELD_OUT_DIRECTORY,
  HELD_OUT_PLAN_VERSION,
  PARTITIONS,
  PROBE_ID,
  PartitionPlanError,
  STEP_ID,
  committedProbes,
  contractView,
  heldOutResponsePath,
  loadContractView,
  mappingView,
  mappingViewProblems,
  named,
  partitionPlanProblems,
  planCriterionName,
  readHeldOutPlan,
  readHeldOutResponse,
  selectPartition,
  stepsReadBy,
  unknownPartition,
  writePartitionViews,
};
