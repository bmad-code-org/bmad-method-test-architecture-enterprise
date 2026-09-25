/**
 * `tea-evaluate check`: every authoring defect in an evaluation folder, found
 * before anything runs.
 *
 * A finding names the file (relative to the evaluation folder), the rule it
 * breaks and why. Every finding is collected; none stops the others, except an
 * unknown `evaluation.json` `schemaVersion`, which makes every later rule
 * meaningless and is reported alone.
 *
 * The rules (AD-8, AD-9, AD-19):
 *
 * - `stale-index`: `corpus-index.json` does not match the folder's bytes.
 * - `schema-version`: `evaluation.json` carries a version this runtime does not know.
 * - `runtime-owned-field`: a committed probe carries a field the runtime writes.
 * - `mutation-operator`: a mutation is not `replace-exact` with exactly one occurrence.
 * - `provisioned-target`: a mutation's `targetArtifact` sits inside a provisioned directory, which every
 *   workspace holds read-only.
 * - `web-interface`: the contract declares an interface of kind `web`.
 * - `written-file-signature`: a defect signature addresses a file the target wrote.
 * - `oracle-count`: a behavior a defect or gameability probe discharges does not declare exactly one oracle.
 * - `id-pattern`: a probe, defect, behavior, oracle or mutation ID is off its pattern.
 * - `qualification-digest`: a `baseline/qualification/` reference's digest does not match the file.
 * - `clean-control`: a clean control is not `zero-action` with `expectedClean: true` and no defects.
 * - `infrastructure-exit-code`: a defect signature holds on an observation that carries only one of the
 *   `infrastructureExitCodes` its executable's registry entry declares, so a target that could not run
 *   would read as a caught defect (AD-7).
 * - `unregistered-executable`: a `cli` defect signature names an executable no registry entry declares,
 *   so no infrastructure code could be checked against it and no run could authorize it.
 * - `skill-root`: a mutation's `targetArtifact` is not inside `launch.skillRoot`, a contract leg or plan
 *   step hands the skill runner a `skill-root` other than `launch.skillRoot`, or the skill root sits inside
 *   a provisioned directory, so a mutation would change a file the runner never reads (AD-4).
 * - `trials`: `evaluation.json`'s `trials` is below the scoring policy's `minimumTrialCount`, so every trial
 *   set a run seals would fall short of the minimum the scores read (AD-7).
 * - `arms`: a probe needs an arm `evaluation.json`'s `arms` does not declare (a clean control the `clean`
 *   arm, a probe on the `controlled-mutation` route the `mutated` arm, one on the `historical` route the
 *   `historical` arm, a gameability probe the `gameability` arm), or `arms` declares one no probe runs on.
 * - `mutation-route`: a probe on the `controlled-mutation` route seeds no defect.
 * - `evaluator-conditions`: a registry entry runs `tea-skill-runner`, which always runs an agent, and the
 *   folder has no `policy/evaluator-conditions.json`, or one that declares `modelSnapshot` `none` (NFR8); or
 *   the file declares `modelSnapshot` `none` with a `systemPromptDigest` other than the empty byte string's.
 * - `skill-runner`: a registry entry for `tea-skill-runner` does not declare the runner's infrastructure
 *   exit codes, or a leg or plan step for it carries no literal `timeout-ms` below the entry's
 *   `maxElapsedMs`: under the ceiling the runner reports its own timeout as exit 5, while at the
 *   ceiling the adapter kills the runner's process group, records a fault, and `preflight` exits 12.
 * - `gameability` (Story 1.9): a probe on the `gameability` route is not a `gameability`-class probe
 *   with `expectedClean: false` and no defects (it launches nothing, so nothing can witness a defect),
 *   its `naiveOracle` is an oracle of its own behavior (the naive oracle belongs to another behavior),
 *   or its degenerate response, `corpus/gameability/<probeId>.json`, is absent, fails its schema
 *   (`schema`), answers a plan step the contract does not declare or leaves one unanswered, answers a
 *   command step with a tool call's response or a tool-call step with a command's, or exits a code the
 *   step's registry entry declares as infrastructure.
 * - `historical` (Story 1.9): a probe on the `historical` route does not carry `expectedClean: false`, seeds
 *   no defect, or seeds one whose `source` is not `natural`, the only source eval-quality admits there.
 * - `judge` (Story 1.9): the contract declares a rubric and `evaluation.json` has no `judge`, or
 *   `policy/evaluator-conditions.json` names no `judge.modelSnapshot`; the contract declares no rubric and
 *   either file carries a `judge` block, which nothing would use; or `judge` names an agent adapter TeA
 *   does not have, one that cannot run read-only, the `custom` adapter with no `agentCommand`, or a `model`
 *   its adapter refuses. Story 1.17 narrows it to the `deterministic` evaluator: under any other kind the
 *   evaluator scores the rubric, so neither file may carry a `judge` block.
 * - `evaluator` (Story 1.17, AD-21): a `command` or `sealed-brief-agent` evaluator has no
 *   `evaluator/mapping.json`, or one binding an oracle, behavior or rubric criterion the contract does not
 *   declare, an oracle to a behavior that does not declare it, levels other than the criterion's anchored
 *   scale levels, an oracle or criterion under two keys, or leaving a rubric criterion unbound; `evaluator/`
 *   holds a link or special file; a `command` evaluator's executable is not a regular executable file; a
 *   `sealed-brief-agent` names an adapter TeA lacks or one with no bridged run, the `custom` adapter
 *   with no `agentCommand`, a `model` its adapter refuses, passthrough `agentArgs` that reopen what the
 *   bridged run closes, or no `evaluator.modelSnapshot` in `policy/evaluator-conditions.json`, where an
 *   `evaluator` block beside the `deterministic` or `records` kind is refused as unused; a `records`
 *   evaluator's directory is absent or reached through a link. An unknown kind, and a `command` or
 *   `sealed-brief-agent` evaluator with no `timeoutMs`, fail the `evaluation.json` schema (`schema`).
 *
 * Beside them, `contract.json` must exist (`missing-file`), as must
 * `policy/scoring-policy.json` when a probe takes the `controlled-mutation`,
 * `historical` or `gameability` route, since its `reExecutionCap` bounds the rollback proof and its
 * `regexMatchStepBudget` bounds the evaluator (a policy present is always
 * held to eval-quality's scoring-policy schema, `engine-schema`), a
 * `policy/evaluator-conditions.json` that is present must meet the runtime's
 * evaluator-conditions schema (`schema`), every indexed
 * root and entry must be a real directory or regular file (`corpus-file`), as
 * must everything under `baseline/` (`baseline-file`), no ID may repeat within
 * its file (`duplicate-id`), no registry entry may repeat an interface and
 * executable pair, name an interface another kind of entry names, serve an
 * interface as a kind other than the one the contract declares for it, or be
 * a tool server eval-quality's `parseMcpTargetPolicy` refuses (two for one
 * interface among them) (`registry`, Story 1.10), `interface` must be a kind
 * the contract declares (`reference`), and a file must
 * parse (`json`), match its schema (`schema` for the runtime's own schemas,
 * `engine-schema` for eval-quality's), be named for its ID (`file-name`), and
 * name only behaviors and mutations that exist (`reference`).
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const AjvModule = require('ajv/dist/2020');

const { engineSchemaPath, loadEngine, schemaVersionProblems } = require('./engine');
const { MANIFEST_NAME } = require('./folder');
const { addFormats } = require('./formats');
const { isMcpEntry, mcpRegistryProblems, repeatedPairs, sharedInterfaces } = require('./registry');
const { AGENT_ADAPTERS, bridgedArgsRefused, resolveModel } = require('../agent-adapters');
const { EVALUATOR_DIRECTORY, EvaluatorLayerError, evaluatorFiles, evaluatorOf, isKnownEvaluator } = require('./evaluators');
const { degenerateResponsePath } = require('./gameability');
const { MAPPING_PATH, mappingContractProblems, mappingSchemaProblems } = require('./judgment-rows');

/** The skill runner's infrastructure exit codes (`cli/skill-runner.js`), which a registry entry for it must declare. */
const SKILL_RUNNER_INFRASTRUCTURE_CODES = [3, 4, 5, 6];
const SKILL_RUNNER_BIN = 'tea-skill-runner';
const SKILL_RUNNER_SCRIPT = 'skill-runner.js';
const { CorpusIndexError, INDEX_NAME, corpusIndexProblem } = require('./corpus-index');

const Ajv = AjvModule.default ?? AjvModule;

const KNOWN_EVALUATION_SCHEMA_VERSIONS = [1];
const CONTRACT_NAME = 'contract.json';
const POLICY_NAME = 'policy/scoring-policy.json';
const CONDITIONS_NAME = 'policy/evaluator-conditions.json';
/** The arm each scored route runs on. */
const ARM_OF_ROUTE = { 'clean-control': 'clean', 'controlled-mutation': 'mutated', historical: 'historical', gameability: 'gameability' };
/** What makes each arm used: the route whose probes run on it, and how a finding names that route's probes. */
const USES_OF_ARM = {
  clean: { route: 'clean-control', probes: 'is a clean control' },
  mutated: { route: 'controlled-mutation', probes: 'takes the controlled-mutation route' },
  historical: { route: 'historical', probes: 'takes the historical route' },
  gameability: { route: 'gameability', probes: 'is a gameability probe' },
};
const QUALIFICATION_PREFIX = 'baseline/qualification/';
const MUTATION_ID_PATTERN = '^M-[0-9]{3,}$';
const PROBE_FILE = /^(.+)\.probe\.json$/;
const MUTATION_FILE = /^(.+)\.mutation\.json$/;
const WRITTEN_FILE_POINTER = /^\/interactions\/[^/]+\/artifact(?:\/|$)/;
const INTERACTION_POINTER = /^\/interactions\/([^/]+)(?:\/|$)/;
/** The step budget a signature's regular-expression operators get while `check` resolves them. */
const REGEX_STEP_BUDGET = 100_000;

/** Fields the runtime writes into a qualified probe; a committed probe carrying one is refused. */
const RUNTIME_OWNED_PROBE_FIELDS = [
  'schemaVersion',
  'parentDigest',
  'revisionCount',
  'systemId',
  'implementationDigest',
  'artifactDigest',
  'commitDigest',
];
const RUNTIME_OWNED_QUALIFICATION_FIELDS = [
  'failBeforeEvidence',
  'passAfterEvidence',
  'fixCommitDigest',
  'oracleStableAcrossRevisions',
  'mutationSource',
  'mutationOperator',
  'targetArtifact',
  'expectedObservableFailure',
  'baselinePassEvidence',
  'mutatedFailEvidence',
  'rollbackVerified',
  'naiveOracleSatisfiedEvidence',
  'disciplinedOracleRejectedEvidence',
  'nonDetectionEvidence',
  'revisionCommitDigest',
];
const RUNTIME_OWNED_DEFECT_FIELDS = ['oracleEvidence'];

const RUNTIME_SCHEMA_ROOT = path.join(__dirname, 'schemas');
const TEA_MANIFEST = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'package.json'), 'utf8'));

function readJsonFile(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Ajv's errors as one line each, naming the instance location and what it broke. */
function describeErrors(errors) {
  return (errors ?? []).map((error) => {
    const where = error.instancePath === '' ? '(root)' : error.instancePath;
    const detail =
      error.params?.additionalProperty === undefined
        ? error.params?.allowedValues === undefined
          ? ''
          : ` (${error.params.allowedValues.map((value) => JSON.stringify(value)).join(', ')})`
        : ` (${JSON.stringify(error.params.additionalProperty)})`;
    return `${where} ${error.message}${detail}`;
  });
}

/** The first `pattern` found by walking `keys` into a published schema, or a thrown error naming what moved. */
function patternAt(schema, keys, label) {
  let node = schema;
  for (const key of keys) node = node?.[key];
  if (typeof node?.pattern !== 'string')
    throw new Error(`eval-quality's published schema no longer carries the ${label} pattern this runtime reads`);
  return node.pattern;
}

/** Everything check needs from the engine and the schemas, built once per run. */
async function buildContext() {
  const engine = await loadEngine();
  // `strict: false` because eval-quality's published schemas use keywords such
  // as `minProperties` without a sibling `type`, which Ajv's strict mode warns
  // about and which is no schema defect. The one format they use is declared
  // here so it is checked, not warned about and ignored.
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  const probeSchema = readJsonFile(engineSchemaPath('probe.schema.json'));
  const contractSchema = readJsonFile(engineSchemaPath('eval-contract.schema.json'));
  ajv.addSchema(probeSchema);
  const branch = probeSchema.oneOf?.findIndex((candidate) => candidate?.properties?.defectSignature !== undefined);
  if (branch === undefined || branch < 0)
    throw new Error("eval-quality's published probe schema no longer carries a defectSignature branch");
  const branchPointer = `${probeSchema.$id}#/oneOf/${branch}/properties`;
  const branchProperties = probeSchema.oneOf[branch].properties;
  const runtimeSchema = (name) => ajv.compile(readJsonFile(path.join(RUNTIME_SCHEMA_ROOT, name)));
  return {
    engine,
    validate: {
      evaluation: runtimeSchema('evaluation.schema.json'),
      probe: runtimeSchema('committed-probe.schema.json'),
      mutation: runtimeSchema('mutation.schema.json'),
      evaluatorConditions: runtimeSchema('evaluator-conditions.schema.json'),
      degenerateResponse: runtimeSchema('degenerate-response.schema.json'),
      contract: ajv.compile(contractSchema),
      scoringPolicy: ajv.compile(readJsonFile(engineSchemaPath('scoring-policy.schema.json'))),
      defectSignature: ajv.compile({ $ref: `${branchPointer}/defectSignature` }),
      manifestationWitness: ajv.compile({ $ref: `${branchPointer}/defects/items/properties/manifestationWitness` }),
    },
    patterns: {
      probe: new RegExp(patternAt(branchProperties, ['probeId'], 'probeId')),
      behavior: new RegExp(patternAt(branchProperties, ['behaviorId'], 'behaviorId')),
      defect: new RegExp(patternAt(branchProperties, ['defects', 'items', 'properties', 'defectId'], 'defectId')),
      oracle: new RegExp(patternAt(contractSchema, ['properties', 'oracles', 'items', 'properties', 'id'], 'oracle id')),
      mutation: new RegExp(MUTATION_ID_PATTERN),
    },
  };
}

function createFindings() {
  const findings = [];
  return {
    findings,
    add(file, rule, message) {
      findings.push({ file, rule, message });
    },
  };
}

/** Parses one JSON file, recording a `json` finding and returning undefined when it does not parse. */
function parseInto(report, folder, relative) {
  try {
    return readJsonFile(path.join(folder, relative));
  } catch (error) {
    report.add(relative, 'json', `does not parse as JSON: ${error.message}`);
    return;
  }
}

/** How many distinct schema errors one validation reports before summarizing the rest. */
const SCHEMA_ERROR_LIMIT = 10;

/**
 * Validates `value`, recording one finding per distinct schema error.
 *
 * A `oneOf` failure makes Ajv report every branch's errors, many of them
 * repeated, so the lines are de-duplicated and capped: the first ones name the
 * problem, and the count says how much more a fix may surface.
 */
function validateInto(report, relative, rule, validator, value, prefix = '') {
  if (validator(value)) return true;
  const lines = [...new Set(describeErrors(validator.errors))];
  for (const line of lines.slice(0, SCHEMA_ERROR_LIMIT)) report.add(relative, rule, `${prefix}${line}`);
  if (lines.length > SCHEMA_ERROR_LIMIT) {
    report.add(
      relative,
      rule,
      `${prefix}${lines.length - SCHEMA_ERROR_LIMIT} more schema error(s) not shown; fix the ones above and run check again`,
    );
  }
  return false;
}

function checkId(report, relative, pattern, value, label) {
  if (typeof value === 'string' && !pattern.test(value)) {
    report.add(relative, 'id-pattern', `${label} ${JSON.stringify(value)} does not match ${pattern.source}`);
  }
}

/**
 * The entries of a folder subdirectory, sorted, typed without following links.
 * An absent directory is empty; one that is a symbolic link or a file is not
 * listed at all (`null`), since what it points at is not the folder's.
 */
function listDirectory(folder, name) {
  let stats;
  try {
    stats = fs.lstatSync(path.join(folder, name));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  if (!stats.isDirectory()) return null;
  return fs
    .readdirSync(path.join(folder, name), { withFileTypes: true })
    .map((entry) => ({ name: entry.name, isFile: entry.isFile(), isDirectory: entry.isDirectory() }))
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}

/** Records a `duplicate-id` finding for every ID `ids` holds more than once. */
function checkDuplicates(report, relative, ids, label) {
  const seen = new Set();
  const reported = new Set();
  for (const id of ids) {
    if (typeof id !== 'string') continue;
    if (seen.has(id) && !reported.has(id)) {
      report.add(relative, 'duplicate-id', `${label} ${JSON.stringify(id)} is declared more than once`);
      reported.add(id);
    }
    seen.add(id);
  }
}

/** The parsed `contract.json` when it parses to an object, for the rules that resolve expressions against it. */
function contractFor(folder) {
  try {
    const contract = readJsonFile(path.join(folder, CONTRACT_NAME));
    return contract !== null && typeof contract === 'object' && !Array.isArray(contract) ? contract : undefined;
  } catch {
    return;
  }
}

function checkContract(report, folder, context) {
  if (!fs.existsSync(path.join(folder, CONTRACT_NAME))) {
    report.add(CONTRACT_NAME, 'missing-file', `the evaluation folder has no ${CONTRACT_NAME}`);
    return;
  }
  const contract = parseInto(report, folder, CONTRACT_NAME);
  if (contract === undefined) return;
  validateInto(report, CONTRACT_NAME, 'engine-schema', context.validate.contract, contract);
  const interfaces = Array.isArray(contract?.permittedInterfaces) ? contract.permittedInterfaces : [];
  for (const [index, declared] of interfaces.entries()) {
    if (declared?.kind === 'web') {
      report.add(
        CONTRACT_NAME,
        'web-interface',
        `permittedInterfaces[${index}] (${JSON.stringify(declared.logicalId)}) declares kind "web"; a web application is evaluated through kind "api"`,
      );
    }
  }
  const behaviors = Array.isArray(contract?.behaviors) ? contract.behaviors : [];
  for (const behavior of behaviors) {
    checkId(report, CONTRACT_NAME, context.patterns.behavior, behavior?.id, 'behavior ID');
    for (const oracleId of Array.isArray(behavior?.oracles) ? behavior.oracles : []) {
      checkId(report, CONTRACT_NAME, context.patterns.oracle, oracleId, `behavior ${JSON.stringify(behavior?.id)} oracle ID`);
    }
  }
  const oracles = Array.isArray(contract?.oracles) ? contract.oracles : [];
  for (const oracle of oracles) {
    checkId(report, CONTRACT_NAME, context.patterns.oracle, oracle?.id, 'oracle ID');
  }
  checkDuplicates(
    report,
    CONTRACT_NAME,
    behaviors.map((behavior) => behavior?.id),
    'behavior ID',
  );
  checkDuplicates(
    report,
    CONTRACT_NAME,
    oracles.map((oracle) => oracle?.id),
    'oracle ID',
  );
  return new Map(behaviors.filter((behavior) => typeof behavior?.id === 'string').map((behavior) => [behavior.id, behavior]));
}

/** Whether a registry entry launches the skill runner, by its bin name or its script. */
function isSkillRunnerEntry(entry) {
  const name = typeof entry?.target === 'string' ? entry.target.split('/').at(-1) : '';
  return name === SKILL_RUNNER_BIN || name === SKILL_RUNNER_SCRIPT;
}

/**
 * Every option set a contract hands one operation: each sensitivity-witness
 * leg's options, and each plan step's option binding, as `{ where, option }`
 * where a plan binding's values are its binding objects.
 */
function optionSetsByOperation(contract) {
  const sets = [];
  const interfaces = Array.isArray(contract?.permittedInterfaces) ? contract.permittedInterfaces : [];
  for (const [interfaceIndex, iface] of interfaces.entries()) {
    for (const [operationIndex, operation] of (Array.isArray(iface?.operations) ? iface.operations : []).entries()) {
      const key = { interfaceId: iface?.logicalId, executable: operation?.invocation?.executable };
      const legs = Array.isArray(operation?.sensitivityWitness?.legs) ? operation.sensitivityWitness.legs : [];
      for (const [legIndex, leg] of legs.entries()) {
        sets.push({
          ...key,
          where: `permittedInterfaces[${interfaceIndex}].operations[${operationIndex}].sensitivityWitness.legs[${legIndex}]`,
          option: Object.fromEntries(Object.entries(leg?.inputs?.option ?? {}).map(([name, value]) => [name, { literal: value }])),
        });
      }
      const steps = Array.isArray(contract.interactionPlan) ? contract.interactionPlan : [];
      for (const [stepIndex, step] of steps.entries()) {
        if (step?.operationId !== operation?.operationId) continue;
        sets.push({ ...key, where: `interactionPlan[${stepIndex}]`, option: step?.inputBinding?.option ?? {} });
      }
    }
  }
  return sets;
}

/**
 * The `skill-root` and `skill-runner` rules over the registry, the launch and
 * the contract (AD-4): the runner must run the skill the launch names, declare
 * its own infrastructure codes, and time its agent out before the adapter kills
 * the runner's process group.
 */
function checkSkillRunner(report, evaluation, contract, provision) {
  const skillRoot = typeof evaluation.launch?.skillRoot === 'string' ? evaluation.launch.skillRoot : undefined;
  if (skillRoot !== undefined) {
    for (const directory of provision) {
      const provisioned = path.posix.normalize(directory).replace(/\/+$/, '');
      if (skillRoot === provisioned || skillRoot.startsWith(`${provisioned}/`)) {
        report.add(
          MANIFEST_NAME,
          'skill-root',
          `launch.skillRoot ${JSON.stringify(skillRoot)} is inside the provisioned directory ${JSON.stringify(directory)}, which every workspace holds as a read-only copy, so no mutation of the skill could be planted`,
        );
      }
    }
  }
  const entries = (Array.isArray(evaluation.registry) ? evaluation.registry : []).filter((entry) => isSkillRunnerEntry(entry));
  for (const entry of entries) {
    const codes = Array.isArray(entry.infrastructureExitCodes) ? entry.infrastructureExitCodes : [];
    const missing = SKILL_RUNNER_INFRASTRUCTURE_CODES.filter((code) => !codes.includes(code));
    if (missing.length > 0) {
      report.add(
        MANIFEST_NAME,
        'skill-runner',
        `the ${SKILL_RUNNER_BIN} entry ${JSON.stringify(entry.interfaceId)} does not declare infrastructure exit code(s) ${missing.join(', ')}, so a runner that could not run would read as target behavior`,
      );
    }
  }
  for (const set of optionSetsByOperation(contract)) {
    const entry = entries.find((candidate) => candidate.interfaceId === set.interfaceId && candidate.executable === set.executable);
    if (entry === undefined) continue;
    const root = set.option['skill-root'];
    if (skillRoot !== undefined && root?.literal !== skillRoot) {
      report.add(
        CONTRACT_NAME,
        'skill-root',
        `${set.where} hands ${SKILL_RUNNER_BIN} --skill-root ${JSON.stringify(root?.literal ?? root ?? null)}, which is not launch.skillRoot ${JSON.stringify(skillRoot)}`,
      );
    }
    const timeout = set.option['timeout-ms']?.literal;
    const milliseconds = typeof timeout === 'string' && /^[0-9]+$/.test(timeout) ? Number(timeout) : Number.NaN;
    if (!(milliseconds > 0 && milliseconds < entry.maxElapsedMs)) {
      report.add(
        CONTRACT_NAME,
        'skill-runner',
        `${set.where} hands ${SKILL_RUNNER_BIN} --timeout-ms ${JSON.stringify(timeout ?? null)}; a literal below the entry's maxElapsedMs (${entry.maxElapsedMs}) makes the runner stop its agent before the adapter kills the runner`,
      );
    }
  }
}

function checkMutations(report, folder, context, provision, skillRoot) {
  const known = new Set();
  for (const entry of listDirectory(folder, 'mutations') ?? []) {
    const relative = `mutations/${entry.name}`;
    const match = MUTATION_FILE.exec(entry.name);
    if (!entry.isFile || match === null) {
      report.add(relative, 'file-name', 'mutations/ holds only M-NNN.mutation.json files');
      continue;
    }
    const mutation = parseInto(report, folder, relative);
    if (mutation === undefined) continue;
    validateInto(report, relative, 'schema', context.validate.mutation, mutation);
    checkId(report, relative, context.patterns.mutation, mutation?.mutationId, 'mutation ID');
    if (typeof mutation?.mutationId === 'string') {
      known.add(mutation.mutationId);
      if (mutation.mutationId !== match[1]) {
        report.add(relative, 'file-name', `mutation ID ${JSON.stringify(mutation.mutationId)} does not match its file name`);
      }
    }
    const operator = mutation?.operator;
    if (operator?.kind !== 'replace-exact') {
      report.add(
        relative,
        'mutation-operator',
        `operator kind is ${JSON.stringify(operator?.kind ?? null)}; the only operator is "replace-exact"`,
      );
    } else if (typeof operator.find !== 'string' || typeof operator.replace !== 'string' || operator.occurrences !== 1) {
      report.add(
        relative,
        'mutation-operator',
        `a replace-exact operator needs string "find" and "replace" and "occurrences": 1; got occurrences ${JSON.stringify(operator.occurrences ?? null)}`,
      );
    }
    if (typeof mutation?.targetArtifact === 'string') {
      const target = path.posix.normalize(mutation.targetArtifact);
      if (skillRoot !== undefined && !target.startsWith(`${path.posix.normalize(skillRoot)}/`)) {
        report.add(
          relative,
          'skill-root',
          `targetArtifact ${JSON.stringify(mutation.targetArtifact)} is outside the skill root ${JSON.stringify(skillRoot)}, so the skill runner would never read the mutated file`,
        );
      }
      for (const directory of provision) {
        const provisioned = path.posix.normalize(directory).replace(/\/+$/, '');
        if (target === provisioned || target.startsWith(`${provisioned}/`)) {
          report.add(
            relative,
            'provisioned-target',
            `targetArtifact ${JSON.stringify(mutation.targetArtifact)} is inside the provisioned directory ${JSON.stringify(directory)}, which every workspace holds as a read-only copy, so the mutation could not be planted there`,
          );
        }
      }
    }
  }
  return known;
}

function pointersIn(expression, found = []) {
  if (Array.isArray(expression)) {
    for (const item of expression) pointersIn(item, found);
  } else if (expression !== null && typeof expression === 'object') {
    if (typeof expression.pointer === 'string') found.push(expression.pointer);
    for (const value of Object.values(expression)) pointersIn(value, found);
  }
  return found;
}

function checkRuntimeOwned(report, relative, probe) {
  const stripped = { ...probe };
  for (const field of RUNTIME_OWNED_PROBE_FIELDS) {
    if (Object.hasOwn(probe, field)) {
      report.add(relative, 'runtime-owned-field', `carries runtime-owned field "${field}"; the runtime writes it into the qualified probe`);
      delete stripped[field];
    }
  }
  if (probe.qualification !== null && typeof probe.qualification === 'object' && !Array.isArray(probe.qualification)) {
    stripped.qualification = { ...probe.qualification };
    for (const field of RUNTIME_OWNED_QUALIFICATION_FIELDS) {
      if (Object.hasOwn(probe.qualification, field)) {
        report.add(
          relative,
          'runtime-owned-field',
          `carries runtime-owned field "qualification.${field}"; the runtime or the mutation file supplies it`,
        );
        delete stripped.qualification[field];
      }
    }
  }
  if (Array.isArray(probe.defects)) {
    stripped.defects = probe.defects.map((defect, index) => {
      if (defect === null || typeof defect !== 'object') return defect;
      const copy = { ...defect };
      for (const field of RUNTIME_OWNED_DEFECT_FIELDS) {
        if (Object.hasOwn(defect, field)) {
          report.add(relative, 'runtime-owned-field', `carries runtime-owned field "defects[${index}].${field}"; the runtime writes it`);
          delete copy[field];
        }
      }
      return copy;
    });
  }
  return stripped;
}

/**
 * A synthetic command observation of a target that could not run: its exit
 * code and no output. The command-line adapter tags an empty capture as empty
 * text, so that is how both streams read.
 */
function infrastructureObservation(stepId, exitCode, callInputs = {}) {
  return {
    observationId: `${stepId}-infrastructure`,
    sequence: 1,
    operationId: stepId,
    provenance: 'baseline',
    principal: null,
    callInputs: {
      path: null,
      query: null,
      header: null,
      body: null,
      argument: callInputs.argument ?? null,
      option: callInputs.option ?? null,
      environment: callInputs.environment ?? null,
      stdin: callInputs.stdin ?? null,
      arguments: null,
    },
    responseBody: null,
    responseHeaders: null,
    responseStatus: null,
    stdout: { kind: 'text', value: '' },
    stderr: { kind: 'text', value: '' },
    exitCode,
    artifacts: {},
  };
}

const CONNECTIVES = new Set(['all', 'any', 'not']);
const CALL_INPUTS_POINTER = /^\/interactions\/[^/]+\/call-inputs(?:\/|$)/;
/** More call-input clauses than this and the expression is reported unresolved. */
const MAX_CALL_INPUT_CLAUSES = 8;
const ALWAYS = { op: 'equality', operands: [{ literal: 0 }, { literal: 0 }] };
const NEVER = { op: 'equality', operands: [{ literal: 0 }, { literal: 1 }] };

/**
 * The expression with each clause that reads only call inputs replaced by a
 * constant, once per assignment of true and false to those clauses. A run that
 * could not start was still invoked with whatever inputs the defect needs, so a
 * call-input clause can go either way. Returns `{ unresolved }` instead, naming
 * the reason, when a clause mixes call inputs with other evidence or when more
 * than `MAX_CALL_INPUT_CLAUSES` clauses read them.
 *
 * @returns {{variants: object[]}|{unresolved: string}}
 */
function callInputVariants(expression) {
  const clauses = [];
  let mixed = false;
  const collect = (node) => {
    if (node === null || typeof node !== 'object') return;
    if (CONNECTIVES.has(node.op)) {
      for (const operand of node.operands ?? []) collect(operand);
      return;
    }
    const pointers = pointersIn(node);
    const reading = pointers.filter((pointer) => CALL_INPUTS_POINTER.test(pointer));
    if (reading.length === 0) return;
    if (reading.length === pointers.length) clauses.push(node);
    else mixed = true;
  };
  collect(expression);
  if (mixed) return { unresolved: 'a clause reads call inputs together with other evidence, so it cannot be tried each way' };
  if (clauses.length > MAX_CALL_INPUT_CLAUSES) {
    return {
      unresolved: `too many clauses read call inputs (${clauses.length}; the limit is ${MAX_CALL_INPUT_CLAUSES}) to try each way`,
    };
  }
  const variants = [];
  for (let mask = 0; mask < 2 ** clauses.length; mask += 1) {
    const substitute = (node) => {
      const index = clauses.indexOf(node);
      if (index !== -1) return (mask >> index) & 1 ? ALWAYS : NEVER;
      if (node !== null && typeof node === 'object' && CONNECTIVES.has(node.op)) {
        return { ...node, operands: (node.operands ?? []).map(substitute) };
      }
      return node;
    };
    variants.push(substitute(expression));
  }
  return { variants };
}

/**
 * The infrastructure exit codes under which an expression (a defect
 * signature's predicate, or a manifestation witness's relation) could hold,
 * resolved by the engine's own `resolveCheck` over an observation that carries
 * that code and no output, with the contract's reference sets in scope. A
 * resolution other than `false` counts: `insufficient-evidence` means the
 * expression cannot be shown to exclude the code. A witness's call inputs are
 * the ones it declares; a signature's call-input clauses are tried both ways.
 * An expression the engine cannot resolve at all is reported as `unresolved`,
 * so the rule fails closed.
 *
 * @returns {{ satisfying: number[], unresolved: string|undefined }}
 */
function satisfyingInfrastructureCodes(context, expression, codes, callInputs) {
  const { engine, contract } = context;
  const stepIds = [
    ...new Set(
      pointersIn(expression)
        .map((pointer) => INTERACTION_POINTER.exec(pointer)?.[1])
        .filter((stepId) => stepId !== undefined),
    ),
  ];
  if (stepIds.length === 0) stepIds.push('observed');
  const referenceSets = Object.fromEntries(
    Object.entries(contract?.referenceSets ?? {}).map(([id, set]) => [id, Array.isArray(set?.members) ? set.members : []]),
  );
  const enumerated = callInputs === undefined ? callInputVariants(expression) : { variants: [expression] };
  if (enumerated.variants === undefined) return { satisfying: [], unresolved: enumerated.unresolved };
  const { variants } = enumerated;
  const satisfying = [];
  let unresolved;
  for (const code of codes) {
    const observations = Object.fromEntries(stepIds.map((stepId) => [stepId, infrastructureObservation(stepId, code, callInputs)]));
    for (const variant of variants) {
      try {
        const { resolution } = engine.resolveCheck(
          variant,
          engine.makeResolveOperand(observations, referenceSets),
          () => false,
          contract === undefined ? {} : engine.referenceSetKeysOf(contract),
          REGEX_STEP_BUDGET,
          'infrastructure-exit-code',
        );
        if (resolution !== 'false') {
          satisfying.push(code);
          break;
        }
      } catch (error) {
        unresolved ??= error.message;
      }
    }
  }
  return { satisfying, unresolved };
}

/** The infrastructure exit codes the given registry entries declare, sorted and unique. */
function infrastructureCodesOf(entries) {
  return [...new Set(entries.flatMap((entry) => (Array.isArray(entry.infrastructureExitCodes) ? entry.infrastructureExitCodes : [])))]
    .filter((code) => Number.isInteger(code))
    .sort((left, right) => left - right);
}

/** Records an `infrastructure-exit-code` finding when `expression` could hold on one of `codes`. */
function checkExpressionAgainstCodes(report, relative, context, { label, target, expression, codes, callInputs }) {
  if (expression === null || typeof expression !== 'object') return;
  const { satisfying, unresolved } = satisfyingInfrastructureCodes(context, expression, codes, callInputs);
  if (satisfying.length > 0) {
    report.add(
      relative,
      'infrastructure-exit-code',
      `${label} could hold when ${target} exits ${satisfying.join(', ')}, which its registry entry declares as infrastructure exit codes; a target that could not run would read as the defect. Address an exit code, stream or body only the defect produces, or record the probe as refused`,
    );
  } else if (unresolved !== undefined) {
    report.add(
      relative,
      'infrastructure-exit-code',
      `${label} could not be resolved against ${target}'s infrastructure exit codes (${unresolved}), so it cannot be shown to exclude them`,
    );
  }
}

/**
 * The defect signature and each manifestation witness, held against the
 * infrastructure exit codes of the registry entries they name: the signature
 * by its executable (a `cli` signature names no interface), each witness by
 * its interface.
 */
function checkProbeAgainstRegistry(report, relative, probe, context, registry) {
  if (!Array.isArray(registry)) return;
  const signature = probe.defectSignature;
  if (signature?.interfaceKind === 'cli' && typeof signature.invocation?.executable === 'string') {
    const { executable } = signature.invocation;
    const entries = registry.filter((entry) => entry?.executable === executable);
    if (entries.length === 0) {
      report.add(
        relative,
        'unregistered-executable',
        `defectSignature names executable ${JSON.stringify(executable)}, which no ${MANIFEST_NAME} registry entry declares`,
      );
    } else {
      checkExpressionAgainstCodes(report, relative, context, {
        label: 'defectSignature',
        target: executable,
        expression: signature.condition?.predicate,
        codes: infrastructureCodesOf(entries),
      });
    }
  }
  for (const [index, defect] of (Array.isArray(probe.defects) ? probe.defects : []).entries()) {
    const witness = defect?.manifestationWitness;
    if (witness === null || typeof witness !== 'object' || typeof witness.interfaceId !== 'string') continue;
    const declared = (Array.isArray(context.contract?.permittedInterfaces) ? context.contract.permittedInterfaces : []).find(
      (candidate) => candidate?.logicalId === witness.interfaceId,
    );
    if (declared !== undefined && declared.kind !== 'cli') continue;
    const entries = registry.filter((entry) => entry?.interfaceId === witness.interfaceId);
    if (entries.length === 0) {
      report.add(
        relative,
        'unregistered-executable',
        `defects[${index}].manifestationWitness names interface ${JSON.stringify(witness.interfaceId)}, which no ${MANIFEST_NAME} registry entry declares`,
      );
      continue;
    }
    checkExpressionAgainstCodes(report, relative, context, {
      label: `defects[${index}].manifestationWitness.relation`,
      target: witness.interfaceId,
      expression: witness.relation,
      codes: infrastructureCodesOf(entries),
      callInputs: witness.inputs ?? {},
    });
  }
}

function checkProbe(report, relative, probe, context, behaviors, mutations, registry) {
  const stripped = checkRuntimeOwned(report, relative, probe);
  const shaped = validateInto(report, relative, 'schema', context.validate.probe, stripped);
  const defects = Array.isArray(probe.defects) ? probe.defects : [];

  if (probe.defectSignature !== undefined) {
    validateInto(report, relative, 'engine-schema', context.validate.defectSignature, probe.defectSignature, 'defectSignature');
  }
  for (const [index, defect] of defects.entries()) {
    if (defect?.manifestationWitness !== undefined) {
      validateInto(
        report,
        relative,
        'engine-schema',
        context.validate.manifestationWitness,
        defect.manifestationWitness,
        `defects[${index}].manifestationWitness`,
      );
    }
  }

  checkId(report, relative, context.patterns.probe, probe.probeId, 'probe ID');
  checkId(report, relative, context.patterns.behavior, probe.behaviorId, 'behavior ID');
  checkDuplicates(
    report,
    relative,
    defects.map((defect) => defect?.defectId),
    'defect ID',
  );
  for (const defect of defects) {
    checkId(report, relative, context.patterns.defect, defect?.defectId, 'defect ID');
    checkId(report, relative, context.patterns.behavior, defect?.behaviorId, `defect ${JSON.stringify(defect?.defectId)} behavior ID`);
  }

  const signature = probe.defectSignature;
  if (signature !== null && typeof signature === 'object') {
    const written = pointersIn(signature.condition?.predicate).filter((pointer) => WRITTEN_FILE_POINTER.test(pointer));
    if (signature.observableChannel === 'artifact' || written.length > 0) {
      report.add(
        relative,
        'written-file-signature',
        `defectSignature addresses a file the target wrote (${signature.observableChannel === 'artifact' ? 'observableChannel "artifact"' : written.join(', ')}); address an exit code or a descriptor-nominated stream or response body, or record the probe as refused`,
      );
    }
  }
  checkProbeAgainstRegistry(report, relative, probe, context, registry);

  const route = probe.qualification?.route;
  if (
    (route === 'clean-control' || probe.expectedClean === true) &&
    (probe.probeClass !== 'zero-action' || probe.expectedClean !== true || defects.length > 0)
  ) {
    report.add(
      relative,
      'clean-control',
      `a clean control must be probeClass "zero-action" with expectedClean true and no defects; got probeClass ${JSON.stringify(probe.probeClass)}, expectedClean ${JSON.stringify(probe.expectedClean)}, ${defects.length} defect(s)`,
    );
  }

  if (
    (route === 'gameability' || probe.probeClass === 'gameability') &&
    (route !== 'gameability' || probe.probeClass !== 'gameability' || probe.expectedClean !== false || defects.length > 0)
  ) {
    report.add(
      relative,
      'gameability',
      `a gameability probe is probeClass "gameability" on the gameability route with expectedClean false and no defects, since its arm launches nothing that could witness one; got probeClass ${JSON.stringify(probe.probeClass)}, route ${JSON.stringify(route ?? null)}, expectedClean ${JSON.stringify(probe.expectedClean)}, ${defects.length} defect(s)`,
    );
  }

  if (route === 'historical') {
    const unnatural = defects.filter((defect) => defect?.source !== 'natural');
    if (defects.length === 0 || unnatural.length > 0 || probe.expectedClean !== false) {
      report.add(
        relative,
        'historical',
        `a probe on the historical route seeds the natural defect its fix commit removed, so it carries expectedClean false and at least one defect, each with source "natural"; got expectedClean ${JSON.stringify(probe.expectedClean)}, ${defects.length} defect(s), ${unnatural.length} not natural`,
      );
    }
  }

  if (route === 'controlled-mutation' && (defects.length === 0 || probe.expectedClean !== false)) {
    report.add(
      relative,
      'mutation-route',
      `a probe on the controlled-mutation route seeds the defect its mutation plants, so it carries expectedClean false and at least one defect; got expectedClean ${JSON.stringify(probe.expectedClean)} and ${defects.length} defect(s)`,
    );
  }

  if (behaviors !== undefined && (probe.probeClass === 'defect' || probe.probeClass === 'gameability')) {
    const discharged = [probe.behaviorId, ...defects.map((defect) => defect?.behaviorId)].filter((id) => typeof id === 'string');
    for (const behaviorId of new Set(discharged)) {
      const behavior = behaviors.get(behaviorId);
      if (behavior === undefined) {
        report.add(relative, 'reference', `names behavior ${behaviorId}, which ${CONTRACT_NAME} does not declare`);
        continue;
      }
      const count = Array.isArray(behavior.oracles) ? behavior.oracles.length : 0;
      if (count !== 1) {
        report.add(
          relative,
          'oracle-count',
          `behavior ${behaviorId}, discharged by this ${probe.probeClass} probe, declares ${count} oracles in ${CONTRACT_NAME}; it must declare exactly 1`,
        );
      }
    }
  }

  if (route === 'controlled-mutation' && shaped) {
    const mutationId = probe.qualification.mutation;
    checkId(report, relative, context.patterns.mutation, mutationId, 'qualification.mutation');
    if (context.patterns.mutation.test(mutationId) && !mutations.has(mutationId)) {
      report.add(
        relative,
        'reference',
        `qualification.mutation names ${mutationId}, which mutations/${mutationId}.mutation.json does not define`,
      );
    }
  }
}

/**
 * A gameability probe's naive oracle and its committed degenerate response
 * (`corpus/gameability/<probeId>.json`): the oracle is one the contract
 * declares for another behavior, and the response answers every plan step,
 * and only those, with an exit code no registry entry of the step's command
 * reads as a target that could not run.
 */
function checkGameability(report, folder, relative, probe, context, behaviors, registry) {
  const naive = probe.qualification?.naiveOracle;
  if (typeof naive === 'string' && context.contract !== undefined) {
    const declared = (Array.isArray(context.contract.oracles) ? context.contract.oracles : []).some((oracle) => oracle?.id === naive);
    if (!declared) {
      report.add(relative, 'reference', `qualification.naiveOracle names ${naive}, which ${CONTRACT_NAME} does not declare`);
    } else if ((behaviors?.get(probe.behaviorId)?.oracles ?? []).includes(naive)) {
      report.add(
        relative,
        'gameability',
        `qualification.naiveOracle ${naive} is an oracle of the probe's own behavior ${probe.behaviorId}; the naive oracle belongs to another behavior, and ${probe.behaviorId}'s own oracle is the disciplined one that must reject the degenerate response`,
      );
    }
  }
  if (typeof probe.probeId !== 'string') return;
  const responseFile = degenerateResponsePath(probe.probeId);
  let stats;
  try {
    stats = fs.lstatSync(path.join(folder, ...responseFile.split('/')));
  } catch {
    stats = null;
  }
  if (stats === null || !stats.isFile()) {
    report.add(
      responseFile,
      'gameability',
      `${relative} takes the gameability route and ${responseFile} is ${stats === null ? 'absent' : 'not a regular file'}; it holds the degenerate response's bytes, which the gameability arm answers the plan from`,
    );
    return;
  }
  const response = parseInto(report, folder, responseFile);
  if (response === undefined || !validateInto(report, responseFile, 'schema', context.validate.degenerateResponse, response)) return;
  const plan = Array.isArray(context.contract?.interactionPlan) ? context.contract.interactionPlan : [];
  const planned = new Set(plan.map((step) => step?.stepId).filter((stepId) => typeof stepId === 'string'));
  for (const stepId of planned) {
    if (!Object.hasOwn(response.steps, stepId)) {
      report.add(
        responseFile,
        'gameability',
        `answers no response for interaction plan step ${stepId}, so the gameability arm cannot run the plan`,
      );
    }
  }
  for (const stepId of Object.keys(response.steps)) {
    if (!planned.has(stepId)) {
      report.add(responseFile, 'gameability', `answers step ${stepId}, which the contract's interaction plan does not declare`);
      continue;
    }
    const step = plan.find((candidate) => candidate?.stepId === stepId);
    const operation = (Array.isArray(context.contract?.permittedInterfaces) ? context.contract.permittedInterfaces : [])
      .flatMap((iface) => (Array.isArray(iface?.operations) ? iface.operations.map((candidate) => ({ iface, operation: candidate })) : []))
      .find((candidate) => candidate.operation?.operationId === step?.operationId);
    const answer = response.steps[stepId];
    const toolCallStep = operation?.iface?.kind === 'mcp';
    const toolCallAnswer = typeof answer.isError === 'boolean';
    if (operation !== undefined && toolCallStep !== toolCallAnswer) {
      report.add(
        responseFile,
        'gameability',
        `answers step ${stepId}, a ${toolCallStep ? 'tool call' : 'command'}, with a ${toolCallAnswer ? "tool call's" : "command's"} response, so the gameability arm cannot answer it`,
      );
      continue;
    }
    if (toolCallAnswer) continue;
    const entries = (registry ?? []).filter(
      (entry) => entry?.interfaceId === operation?.iface?.logicalId && entry?.executable === operation?.operation?.invocation?.executable,
    );
    const { exitCode } = answer;
    if (infrastructureCodesOf(entries).includes(exitCode)) {
      report.add(
        responseFile,
        'gameability',
        `step ${stepId} exits ${exitCode}, which its registry entry declares as an infrastructure exit code, so the arm would read the degenerate response as a target that could not run`,
      );
    }
  }
}

/**
 * `evaluation.json`'s `judge` and the judge's model snapshot in
 * `policy/evaluator-conditions.json`: both required when the contract
 * declares a rubric, and the judge's adapter, command and model ones TeA's
 * agent adapters can run.
 */
function checkJudge(report, evaluation, contract, conditions) {
  const rubrics = Array.isArray(contract?.rubrics) ? contract.rubrics : [];
  const judge = evaluation.judge;
  // TeA's judge serves the deterministic evaluator alone; any other kind scores the rubric itself (AD-21). An
  // evaluator of no known kind is the schema's to refuse, so the judge rule reads it as the default.
  const evaluator = evaluatorOf(evaluation);
  const kind = isKnownEvaluator(evaluator) ? evaluator.kind : 'deterministic';
  if (kind !== 'deterministic') {
    const unused = `evaluation.json's evaluator is ${kind}, which scores the contract's rubrics itself, so TeA's judge never runs and this block is never used; remove it`;
    if (judge !== undefined) report.add(MANIFEST_NAME, 'judge', `declares judge: ${unused}`);
    if (conditions !== null && typeof conditions === 'object' && Object.hasOwn(conditions, 'judge')) {
      report.add(CONDITIONS_NAME, 'judge', `declares judge: ${unused}`);
    }
    return;
  }
  // A judge block beside a contract with no rubric is never used, so it is refused rather than ignored.
  if (contract !== undefined && rubrics.length === 0) {
    const unused = `${CONTRACT_NAME} declares no rubric, so no judge runs and this block is never used; remove it`;
    if (judge !== undefined) report.add(MANIFEST_NAME, 'judge', `declares judge: ${unused}`);
    if (conditions !== null && typeof conditions === 'object' && Object.hasOwn(conditions, 'judge')) {
      report.add(CONDITIONS_NAME, 'judge', `declares judge: ${unused}`);
    }
  }
  if (rubrics.length > 0) {
    if (judge === undefined) {
      report.add(
        MANIFEST_NAME,
        'judge',
        `${CONTRACT_NAME} declares ${rubrics.length} rubric(s), and evaluation.json declares no judge to score them; declare judge with its agent adapter and timeoutMs`,
      );
    }
    if (typeof conditions?.judge?.modelSnapshot !== 'string' || conditions.judge.modelSnapshot.length === 0) {
      report.add(
        CONDITIONS_NAME,
        'judge',
        `${CONTRACT_NAME} declares ${rubrics.length} rubric(s), and ${CONDITIONS_NAME} names no judge.modelSnapshot, the model every judge call runs and every run records as a fixed condition`,
      );
    }
  }
  if (judge === null || typeof judge !== 'object' || typeof judge.agent !== 'string') return;
  if (!Object.hasOwn(AGENT_ADAPTERS, judge.agent)) {
    report.add(
      MANIFEST_NAME,
      'judge',
      `judge.agent ${JSON.stringify(judge.agent)} is not an agent adapter TeA has (${Object.keys(AGENT_ADAPTERS).join(', ')})`,
    );
    return;
  }
  if (AGENT_ADAPTERS[judge.agent].runsReadOnly === false) {
    report.add(
      MANIFEST_NAME,
      'judge',
      `judge.agent ${judge.agent} always runs with full permissions, and the rubric judge runs read-only; choose an adapter that can`,
    );
  }
  if (AGENT_ADAPTERS[judge.agent].command === null && typeof judge.agentCommand !== 'string') {
    report.add(MANIFEST_NAME, 'judge', `judge.agent ${judge.agent} runs no command of its own, so judge.agentCommand must name one`);
  }
  try {
    resolveModel(judge.agent, judge.model, Array.isArray(judge.agentArgs) ? judge.agentArgs : []);
  } catch (error) {
    report.add(MANIFEST_NAME, 'judge', `judge's model cannot run: ${error.message}`);
  }
}

/** The mode bits that let anyone execute a file. */
const EXECUTE_BITS = 0o111;

/**
 * `evaluation.json`'s `evaluator` (AD-21) held to the folder and the
 * contract: a `command` or `sealed-brief-agent` evaluator needs
 * `evaluator/mapping.json`, meeting its schema and binding only oracles,
 * behaviors and rubric criteria the contract declares as bound (and every
 * rubric criterion), and an `evaluator/` holding only regular files; a
 * `command` evaluator's executable must be a regular, executable file there;
 * a `sealed-brief-agent` needs an adapter that can run with the bridge as its
 * only tools, its command and model, and its model snapshot in
 * `policy/evaluator-conditions.json`; a `records` evaluator's directory must
 * exist. An evaluator block in the conditions beside any other kind is
 * never used, so it is refused.
 */
function checkEvaluator(report, folder, evaluation, contract, conditions) {
  const evaluator = evaluatorOf(evaluation);
  if (!isKnownEvaluator(evaluator)) return;
  const { kind } = evaluator;
  if (
    (kind === 'deterministic' || kind === 'records') &&
    conditions !== null &&
    typeof conditions === 'object' &&
    Object.hasOwn(conditions, 'evaluator')
  ) {
    report.add(
      CONDITIONS_NAME,
      'evaluator',
      `declares evaluator: evaluation.json's evaluator is ${kind}, and only a command or sealed-brief-agent evaluator runs a model this block names; remove it`,
    );
  }
  if (kind === 'records') {
    if (typeof evaluator.records !== 'string') return;
    // Only a directory inside the folder, reached through no link, is the folder's own.
    const spelled = path.join(fs.realpathSync(folder), ...evaluator.records.split('/'));
    let real;
    try {
      real = fs.realpathSync(path.join(folder, ...evaluator.records.split('/')));
    } catch {
      real = null;
    }
    if (real !== spelled || !fs.statSync(real).isDirectory()) {
      report.add(
        MANIFEST_NAME,
        'evaluator',
        `evaluator.records names ${evaluator.records}, which is not a directory the evaluation folder holds, reached through no link; the records evaluator reads the harness's sealed records there`,
      );
    }
    return;
  }
  if (kind !== 'command' && kind !== 'sealed-brief-agent') return;
  // The files `run` reads and digests: in a git repository the ones git tracks under evaluator/ (`evaluatorFiles`).
  let layer = null;
  try {
    layer = evaluatorFiles(folder);
  } catch (error) {
    if (!(error instanceof EvaluatorLayerError)) throw error;
    report.add(EVALUATOR_DIRECTORY, 'evaluator', error.message);
  }
  const untracked = (relative) =>
    layer !== null &&
    layer.tracked &&
    !layer.files.some((file) => file.path === relative) &&
    fs.existsSync(path.join(folder, ...relative.split('/')));
  if (untracked(MAPPING_PATH)) {
    report.add(
      MAPPING_PATH,
      'evaluator',
      `${MAPPING_PATH} is not tracked by git, and a run reads only the files git tracks under evaluator/; git add it`,
    );
  } else if (fs.existsSync(path.join(folder, ...MAPPING_PATH.split('/')))) {
    const mapping = parseInto(report, folder, MAPPING_PATH);
    if (mapping !== undefined) {
      const shape = mappingSchemaProblems(mapping);
      for (const problem of shape) report.add(MAPPING_PATH, 'schema', problem);
      if (shape.length === 0 && contract !== undefined) {
        for (const problem of mappingContractProblems(mapping, contract)) report.add(MAPPING_PATH, 'evaluator', problem);
      }
    }
  } else {
    report.add(
      MAPPING_PATH,
      'evaluator',
      `evaluation.json's evaluator is ${kind}, whose judgment rows convert through ${MAPPING_PATH}, and the folder has none`,
    );
  }
  if (kind === 'command') {
    if (typeof evaluator.command !== 'string') return;
    if (untracked(evaluator.command)) {
      report.add(
        MANIFEST_NAME,
        'evaluator',
        `evaluator.command names ${evaluator.command}, which git does not track, and a run reads only the files git tracks under evaluator/; git add it`,
      );
      return;
    }
    const executable = path.join(folder, ...evaluator.command.split('/'));
    let stats;
    try {
      stats = fs.lstatSync(executable);
    } catch {
      stats = null;
    }
    if (stats === null || !stats.isFile()) {
      report.add(
        MANIFEST_NAME,
        'evaluator',
        `evaluator.command names ${evaluator.command}, which is not a regular file the evaluation folder holds`,
      );
    } else if (process.platform !== 'win32' && (stats.mode & EXECUTE_BITS) === 0) {
      report.add(MANIFEST_NAME, 'evaluator', `evaluator.command names ${evaluator.command}, which is not executable; set its execute bit`);
    }
    return;
  }
  if (typeof evaluator.agent !== 'string') return;
  const adapter = Object.hasOwn(AGENT_ADAPTERS, evaluator.agent) ? AGENT_ADAPTERS[evaluator.agent] : undefined;
  if (adapter === undefined) {
    report.add(
      MANIFEST_NAME,
      'evaluator',
      `evaluator.agent ${JSON.stringify(evaluator.agent)} is not an agent adapter TeA has (${Object.keys(AGENT_ADAPTERS).join(', ')})`,
    );
  } else {
    if (typeof adapter.buildBridgedArgv !== 'function') {
      const bridged = Object.keys(AGENT_ADAPTERS).filter((key) => typeof AGENT_ADAPTERS[key].buildBridgedArgv === 'function');
      report.add(
        MANIFEST_NAME,
        'evaluator',
        `evaluator.agent ${evaluator.agent} has no bridged run, one whose only tools are the bridge's; choose one of ${bridged.join(', ')}`,
      );
    }
    const locked = bridgedArgsRefused(evaluator.agent, Array.isArray(evaluator.agentArgs) ? evaluator.agentArgs : []);
    if (locked.length > 0) {
      report.add(
        MANIFEST_NAME,
        'evaluator',
        `evaluator.agentArgs carries ${locked.join(', ')}, which would reopen what the bridged run closes (built-in tools, other MCP servers, settings or a saved session); remove it`,
      );
    }
    if (adapter.command === null && typeof evaluator.agentCommand !== 'string') {
      report.add(
        MANIFEST_NAME,
        'evaluator',
        `evaluator.agent ${evaluator.agent} runs no command of its own, so evaluator.agentCommand must name one`,
      );
    }
    try {
      resolveModel(evaluator.agent, evaluator.model, Array.isArray(evaluator.agentArgs) ? evaluator.agentArgs : []);
    } catch (error) {
      report.add(MANIFEST_NAME, 'evaluator', `the evaluator's model cannot run: ${error.message}`);
    }
  }
  if (typeof conditions?.evaluator?.modelSnapshot !== 'string' || conditions.evaluator.modelSnapshot.length === 0) {
    report.add(
      CONDITIONS_NAME,
      'evaluator',
      `evaluation.json's evaluator is a sealed-brief agent, and ${CONDITIONS_NAME} names no evaluator.modelSnapshot, the model every evaluator call runs and every run records as a fixed condition`,
    );
  }
}

/** Checks every committed probe; returns the qualification routes they take. */
function checkProbes(report, folder, context, behaviors, mutations, registry) {
  const routes = new Set();
  for (const entry of listDirectory(folder, 'probes') ?? []) {
    const relative = `probes/${entry.name}`;
    const match = PROBE_FILE.exec(entry.name);
    if (!entry.isFile || match === null) {
      report.add(relative, 'file-name', 'probes/ holds only P-NNN.probe.json files');
      continue;
    }
    const probe = parseInto(report, folder, relative);
    if (probe === undefined) continue;
    if (probe === null || typeof probe !== 'object' || Array.isArray(probe)) {
      report.add(relative, 'schema', '(root) must be object');
      continue;
    }
    if (typeof probe.probeId === 'string' && probe.probeId !== match[1]) {
      report.add(relative, 'file-name', `probe ID ${JSON.stringify(probe.probeId)} does not match its file name`);
    }
    if (typeof probe.qualification?.route === 'string') routes.add(probe.qualification.route);
    checkProbe(report, relative, probe, context, behaviors, mutations, registry);
    if (probe.qualification?.route === 'gameability') checkGameability(report, folder, relative, probe, context, behaviors, registry);
  }
  return routes;
}

/**
 * `policy/scoring-policy.json`: required when a probe takes the
 * `controlled-mutation` route, whose rollback proof re-runs the baseline within
 * the policy's `reExecutionCap`, or the `historical` or `gameability` route,
 * whose qualification arms the evaluator judges within its `regexMatchStepBudget`, and held to
 * eval-quality's published schema and schema version whenever it is present.
 */
function checkScoringPolicy(report, folder, context, routes) {
  const file = path.join(folder, ...POLICY_NAME.split('/'));
  if (!fs.existsSync(file)) {
    if (routes.has('controlled-mutation')) {
      report.add(
        POLICY_NAME,
        'missing-file',
        `a probe takes the controlled-mutation route, whose rollback proof re-runs the baseline within the scoring policy's reExecutionCap, and the evaluation folder has no ${POLICY_NAME}`,
      );
    } else if (routes.has('historical') || routes.has('gameability')) {
      report.add(
        POLICY_NAME,
        'missing-file',
        `a probe takes the ${routes.has('historical') ? 'historical' : 'gameability'} route, whose qualification arms are judged within the scoring policy's regexMatchStepBudget, and the evaluation folder has no ${POLICY_NAME}`,
      );
    }
    return;
  }
  const policy = parseInto(report, folder, POLICY_NAME);
  if (policy === undefined) return;
  const versionProblems = schemaVersionProblems('scoring-policy', policy);
  for (const problem of versionProblems) report.add(POLICY_NAME, 'engine-schema', problem);
  const valid = validateInto(report, POLICY_NAME, 'engine-schema', context.validate.scoringPolicy, policy);
  return valid && versionProblems.length === 0 ? policy : undefined;
}

/**
 * `trials` against the policy's `minimumTrialCount`, and every scored route's
 * arm declared in `arms`, so a run neither seals a trial set below the
 * minimum nor skips a probe whose arm it was not told to run.
 */
function checkArmsAndTrials(report, evaluation, routes, policy) {
  if (policy !== undefined && Number.isInteger(evaluation.trials) && evaluation.trials < policy.minimumTrialCount) {
    report.add(
      MANIFEST_NAME,
      'trials',
      `trials is ${evaluation.trials}, below the scoring policy's minimumTrialCount ${policy.minimumTrialCount}; every trial set run seals would fall short of the minimum`,
    );
  }
  const arms = Array.isArray(evaluation.arms) ? evaluation.arms : [];
  for (const [route, arm] of Object.entries(ARM_OF_ROUTE)) {
    if (routes.has(route) && !arms.includes(arm)) {
      report.add(MANIFEST_NAME, 'arms', `a probe takes the ${route} route, which runs on the ${arm} arm, and arms does not declare ${arm}`);
    }
    if (!routes.has(USES_OF_ARM[arm].route) && arms.includes(arm)) {
      report.add(
        MANIFEST_NAME,
        'arms',
        `arms declares ${arm}, and no probe ${USES_OF_ARM[arm].probes} to run on it, so a run would run no ${arm} arm`,
      );
    }
  }
}

/**
 * `policy/evaluator-conditions.json`, the committed fixed conditions of a run
 * (AD-7), held to the runtime's schema when present, and required when a
 * registry entry runs `tea-skill-runner`, which always runs an agent, so its
 * model is never recorded as `none`.
 */
function checkEvaluatorConditions(report, folder, context, registry) {
  const runner = (registry ?? []).find(isSkillRunnerEntry);
  if (!fs.existsSync(path.join(folder, ...CONDITIONS_NAME.split('/')))) {
    if (runner !== undefined) {
      report.add(
        CONDITIONS_NAME,
        'evaluator-conditions',
        `the registry runs ${SKILL_RUNNER_BIN} (${runner.interfaceId}), which always runs an agent, and the folder has no ${CONDITIONS_NAME} naming the model the run uses; a run would record the model as none`,
      );
    }
    return;
  }
  const conditions = parseInto(report, folder, CONDITIONS_NAME);
  if (conditions === undefined) return;
  validateInto(report, CONDITIONS_NAME, 'schema', context.validate.evaluatorConditions, conditions);
  // A run that uses no model records the digest of the empty byte string, since no system prompt ran.
  const emptyDigest = context.engine.digestBytes(new Uint8Array(0));
  if (
    conditions?.modelSnapshot === 'none' &&
    typeof conditions.systemPromptDigest === 'string' &&
    conditions.systemPromptDigest !== emptyDigest
  ) {
    report.add(
      CONDITIONS_NAME,
      'evaluator-conditions',
      `declares modelSnapshot none with systemPromptDigest ${conditions.systemPromptDigest}; with no model there is no system prompt, so it must be ${emptyDigest}, the digest of the empty byte string`,
    );
  }
  if (runner !== undefined && conditions?.modelSnapshot === 'none') {
    report.add(
      CONDITIONS_NAME,
      'evaluator-conditions',
      `declares modelSnapshot none while the registry runs ${SKILL_RUNNER_BIN} (${runner.interfaceId}), which always runs an agent; name the model the run uses`,
    );
  }
}

/**
 * Every JSON file below a folder subdirectory. Only real directories are
 * entered, so a symbolic link (a loop included) is never followed; each
 * non-regular entry is a `baseline-file` finding.
 */
function jsonFilesUnder(report, folder, relativeDirectory) {
  const entries = listDirectory(folder, relativeDirectory);
  if (entries === null) {
    report.add(
      relativeDirectory,
      'baseline-file',
      `${relativeDirectory} is a symbolic link or a file; it must be a directory the folder holds`,
    );
    return [];
  }
  const found = [];
  for (const entry of entries) {
    const relative = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory) found.push(...jsonFilesUnder(report, folder, relative));
    else if (!entry.isFile)
      report.add(relative, 'baseline-file', `${relative} is not a regular file or directory; baseline/ holds only files the folder owns`);
    else if (entry.name.endsWith('.json')) found.push(relative);
  }
  return found;
}

function publicQualificationReferences(value, found = []) {
  if (Array.isArray(value)) {
    for (const item of value) publicQualificationReferences(item, found);
  } else if (value !== null && typeof value === 'object') {
    if (value.storage === 'public' && typeof value.path === 'string' && value.path.startsWith(QUALIFICATION_PREFIX)) found.push(value);
    for (const child of Object.values(value)) publicQualificationReferences(child, found);
  }
  return found;
}

function checkQualificationEvidence(report, folder, context) {
  const root = path.join(folder, QUALIFICATION_PREFIX);
  const realRoot = `${path.join(fs.realpathSync(folder), QUALIFICATION_PREFIX)}`;
  for (const relative of jsonFilesUnder(report, folder, 'baseline')) {
    const document = parseInto(report, folder, relative);
    if (document === undefined) continue;
    for (const reference of publicQualificationReferences(document)) {
      const target = path.join(folder, reference.path);
      if (!target.startsWith(root)) {
        report.add(relative, 'qualification-digest', `reference ${JSON.stringify(reference.path)} escapes ${QUALIFICATION_PREFIX}`);
        continue;
      }
      let bytes;
      try {
        // A symbolic link, at the file or at any directory above it, would let
        // bytes outside the folder stand in for committed evidence.
        if (!fs.lstatSync(target).isFile() || !fs.realpathSync(target).startsWith(realRoot)) {
          report.add(
            relative,
            'qualification-digest',
            `reference ${reference.path} is a symbolic link or not a regular file; evidence must be bytes the folder holds`,
          );
          continue;
        }
        bytes = fs.readFileSync(target);
      } catch {
        report.add(relative, 'qualification-digest', `reference ${reference.path} names a file the folder does not hold`);
        continue;
      }
      const actual = context.engine.digestBytes(bytes);
      if (actual !== reference.digest) {
        report.add(
          relative,
          'qualification-digest',
          `reference ${reference.path} records digest ${reference.digest}; the file digests to ${actual}`,
        );
      }
    }
  }
}

/**
 * `evaluation.json`'s `interface` is a kind the contract declares (`reference`),
 * and each registry entry serves its interface as the kind the contract declares
 * for it: a command entry a `cli` interface and a tool-server entry an `mcp`
 * one. An entry of the other kind would leave the interface's calls denied at
 * the interface by eval-quality, the first signal a run that measured nothing.
 * An interface the contract does not declare is left alone, as a command entry
 * for one always was.
 */
function checkRegistryKinds(report, evaluation, registry, contract) {
  if (!Array.isArray(contract?.permittedInterfaces)) return;
  // `interface` names the kind the contract declares, so a run drives the kind it says it does.
  const declaredKinds = [...new Set(contract.permittedInterfaces.map((iface) => iface?.kind).filter((kind) => typeof kind === 'string'))];
  if (typeof evaluation.interface === 'string' && declaredKinds.length > 0 && !declaredKinds.includes(evaluation.interface)) {
    report.add(
      MANIFEST_NAME,
      'reference',
      `interface ${JSON.stringify(evaluation.interface)} names a kind no interface of ${CONTRACT_NAME} declares (it declares ${declaredKinds.join(', ')})`,
    );
  }
  if (!Array.isArray(registry)) return;
  for (const [index, entry] of registry.entries()) {
    const declared = contract.permittedInterfaces.find((candidate) => candidate?.logicalId === entry?.interfaceId);
    if (declared === undefined) continue;
    const kind = isMcpEntry(entry) ? 'mcp' : 'cli';
    if (declared.kind !== kind) {
      report.add(
        MANIFEST_NAME,
        'registry',
        `registry[${index}] serves interface ${JSON.stringify(entry.interfaceId)} as ${kind}, and ${CONTRACT_NAME} declares it ${JSON.stringify(declared.kind)}; a ${kind === 'mcp' ? 'tool-server' : 'command'} entry serves ${kind} calls only`,
      );
    }
  }
}

function schemaVersionMessage(version) {
  return (
    `evaluation.json schemaVersion ${JSON.stringify(version ?? null)} is not known to the installed TeA ` +
    `(${TEA_MANIFEST.name} ${TEA_MANIFEST.version}), which knows schemaVersion ${KNOWN_EVALUATION_SCHEMA_VERSIONS.join(', ')}; ` +
    'install the TeA release that introduced this version, or later'
  );
}

/**
 * Every finding in the evaluation folder.
 *
 * @param {string} folder
 * @returns {Promise<Array<{ file: string, rule: string, message: string }>>}
 */
async function checkEvaluation(folder) {
  const report = createFindings();
  const evaluation = parseInto(report, folder, MANIFEST_NAME);
  if (evaluation === undefined) return report.findings;
  if (evaluation === null || typeof evaluation !== 'object' || Array.isArray(evaluation)) {
    report.add(MANIFEST_NAME, 'schema', '(root) must be object');
    return report.findings;
  }
  if (!KNOWN_EVALUATION_SCHEMA_VERSIONS.includes(evaluation?.schemaVersion)) {
    report.add(MANIFEST_NAME, 'schema-version', schemaVersionMessage(evaluation?.schemaVersion));
    return report.findings;
  }

  const context = await buildContext();
  validateInto(report, MANIFEST_NAME, 'schema', context.validate.evaluation, evaluation);
  const registry = Array.isArray(evaluation.registry) ? evaluation.registry : undefined;
  for (const problem of registry === undefined ? [] : [...repeatedPairs(registry), ...sharedInterfaces(registry)]) {
    report.add(MANIFEST_NAME, 'registry', problem);
  }
  for (const problem of await mcpRegistryProblems(registry)) report.add(MANIFEST_NAME, 'registry', problem);
  const provision = Array.isArray(evaluation.workspace?.provision)
    ? evaluation.workspace.provision.filter((entry) => typeof entry === 'string' && entry.length > 0)
    : [];

  const skillRoot =
    typeof evaluation.launch?.skillRoot === 'string' && evaluation.launch.skillRoot.length > 0 ? evaluation.launch.skillRoot : undefined;

  const behaviors = checkContract(report, folder, context);
  context.contract = contractFor(folder);
  checkRegistryKinds(report, evaluation, registry, context.contract);
  const mutations = checkMutations(report, folder, context, provision, skillRoot);
  checkSkillRunner(report, evaluation, context.contract, provision);
  const routes = checkProbes(report, folder, context, behaviors, mutations, registry);
  const policy = checkScoringPolicy(report, folder, context, routes);
  checkArmsAndTrials(report, evaluation, routes, policy);
  checkEvaluatorConditions(report, folder, context, registry);
  let conditions;
  try {
    conditions = readJsonFile(path.join(folder, ...CONDITIONS_NAME.split('/')));
  } catch {
    conditions = undefined;
  }
  checkJudge(report, evaluation, context.contract, conditions);
  checkEvaluator(report, folder, evaluation, context.contract, conditions);
  checkQualificationEvidence(report, folder, context);

  try {
    const stale = await corpusIndexProblem(folder);
    if (stale !== null) report.add(INDEX_NAME, 'stale-index', stale);
  } catch (error) {
    if (!(error instanceof CorpusIndexError)) throw error;
    report.add(error.file, 'corpus-file', error.message);
  }
  return report.findings;
}

module.exports = {
  KNOWN_EVALUATION_SCHEMA_VERSIONS,
  RUNTIME_OWNED_DEFECT_FIELDS,
  RUNTIME_OWNED_PROBE_FIELDS,
  RUNTIME_OWNED_QUALIFICATION_FIELDS,
  TEA_MANIFEST,
  checkEvaluation,
};
