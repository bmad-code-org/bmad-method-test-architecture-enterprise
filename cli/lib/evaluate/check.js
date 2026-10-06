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
 * - `requirements`: `evaluation.json` declares no requirements statement, the statement is absent, is not a
 *   regular file held by the evaluation folder, its committed bytes disagree with the recorded digest, or
 *   they digest to something other than the contract's `sourceSpecDigest` (contract-source freshness, Story
 *   2.2: a requirements change the contract has not absorbed blocks the pull request).
 * - `runtime-owned-field`: a committed probe carries a field the runtime writes.
 * - `mutation-operator`: a mutation is not `replace-exact` with exactly one occurrence.
 * - `provisioned-target`: a mutation's `targetArtifact` sits inside a provisioned directory, which every
 *   workspace holds read-only.
 * - `web-interface`: the contract declares an interface of kind `web`.
 * - `written-file-signature`: a defect signature addresses a file the target wrote.
 * - `oracle-count`: a behavior a defect or gameability probe discharges does not declare exactly one oracle.
 * - `id-pattern`: a probe, defect, behavior, oracle or mutation ID is off its pattern.
 * - `qualification-digest`: a `baseline/qualification/` reference's digest does not match the file.
 * - `baseline-digest` (Story 1.90, AD-12): a file of `baseline/` digests to something other than the entry of the
 *   `files` map in `baseline/baseline.json`, a map entry's file is missing or is not a regular file, a file other than
 *   `baseline.json` has no entry, or the manifest cannot be read, so a baseline edited by hand cannot pass as the one
 *   `compare --accept` wrote (`baseline-digests.js`, which `compare` calls too). Without a manifest, a `baseline/` holding
 *   only files under `probes/` and `qualification/` and a placeholder `README.md` is authored qualification evidence and is left
 *   alone; any other file without a manifest is reported as the missing manifest.
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
 *   exit codes, or a leg or plan step for it leaves insufficient `maxElapsedMs` beyond its literal
 *   `timeout-ms`. POSIX reserves 40 s for watchdog setup and completion; Windows reserves 120 s
 *   for bounded Job Object setup and completion.
 *   If the adapter's ceiling fires first, it records a fault and `preflight` exits 12.
 * - `gameability` (Story 1.9): a probe on the `gameability` route is not a `gameability`-class probe
 *   with `expectedClean: false` and no defects (it launches nothing, so nothing can witness a defect),
 *   its `naiveOracle` is an oracle of its own behavior (the naive oracle belongs to another behavior),
 *   or its degenerate response, `corpus/gameability/<probeId>.json`, is absent, fails its schema
 *   (`schema`), answers a plan step the contract does not declare or leaves one unanswered, answers a
 *   step with the response of another kind of call (a command's, a tool call's or an HTTP request's), or
 *   exits a code the step's registry entry declares as infrastructure. Under a `partitionPlan` (Story 1.109)
 *   the file answers the steps of `contract.json`, the held-out probe's naive oracle is one the held-out view
 *   keeps, and a check that opens the held-out plan holds `corpus/held-out/gameability/<probeId>.json` to the
 *   same rules over the plan's steps (required when the plan declares a step), naming a step by an ID only when
 *   it has the schema's shape.
 * - `historical` (Story 1.9): a probe on the `historical` route does not carry `expectedClean: false`, seeds
 *   no defect, or seeds one whose `source` is not `natural`, the only source eval-quality admits there;
 *   Story 1.32: it names neither or both of `fixCommit` and `deployments`, one deployment without the
 *   other, one release for both, a deployment beside a registry entry that is not an HTTP entry, or origins
 *   that are not an http or https origin for each HTTP interface of the registry and no other.
 *   Story 1.38: a deployment's report names an operation the contract does not declare on an `api` interface
 *   the registry serves, one it marks as changing state, one that needs an input (a path parameter or a
 *   required key in any channel), or a pointer that is no RFC 6901 JSON pointer.
 *   Story 1.65: a deployment's `reports` leaves an HTTP interface of the registry without a report, names an
 *   interface the registry does not serve over HTTP, or keys a report by an interface other than the one its
 *   operation belongs to.
 * - `judge` (Story 1.9): the contract declares a rubric and `evaluation.json` has no `judge`, or
 *   `policy/evaluator-conditions.json` names no `judge.modelSnapshot`; the contract declares no rubric and
 *   either file carries a `judge` block, which nothing would use; or `judge` names an agent adapter TeA
 *   does not have, one that cannot run read-only, the `custom` adapter with no `agentCommand`, or a `model`
 *   its adapter refuses. Story 1.17 narrows it to the `deterministic` evaluator: under any other kind the
 *   evaluator scores the rubric, so neither file may carry a `judge` block.
 * - `evaluator` (Story 1.34): a `sealed-brief-agent` evaluator whose `evaluation.json` has no
 *   `evaluatorQualification` (`attempts`, `minimumAgreement`), which `run` needs to qualify the agent
 *   before its verdicts count; and an `evaluatorQualification` beside any other kind, where nothing would use it.
 * - `evaluator` (Story 1.44, AD-21): a `command` evaluator has no tracked `evaluator/frameworks.json` (its declared
 *   installed frameworks, an empty list for none), one whose version probe is not a tracked regular executable under
 *   `evaluator/`, or an `evaluator/LEARNED.md` whose `package@version` records disagree with a declaration; a declaration
 *   that fails its shape is reported under `schema` (or `json`). `check` runs no probe (`run` does, `frameworks.js`).
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
 * - `adapter` (Story 1.11, AD-4): the registry declares an HTTP target and the evaluation folder's
 *   `adapter/http-probe-port.mjs`, the port every `api` call goes through, is absent or is not a regular
 *   file in a real `adapter/` directory.
 *
 * - `ci-plan` family (Story 2.2): when `ci/evaluation-ci-plan.json` exists it must parse (`json`), meet the
 *   runtime-owned plan schema, an unknown `evaluate` check id included (`schema`), and keep the placement rules
 *   `tea-evaluate ci` enforces (`tier`, `duplicate`, `command`, `trigger`, `placeholder`, `placement-default`,
 *   `placement-reason`, `deterministic-off-pr`, `live-on-pr`; Story 1.96 added `trigger`, `placeholder`, `tiers`
 *   and `applicability`, read against `evaluation.json` and `contract.json`; Story 1.97 added `gates`, a violation
 *   of the optional list of jobs a check's tier gates; `ci-plan.js`). An absent plan is no defect
 *   here; `tea-evaluate ci` exits 64.
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
 * interface as a kind other than the one the contract declares for it, be
 * a tool server eval-quality's `parseMcpTargetPolicy` refuses (two for one
 * interface among them) (`registry`, Story 1.10), be a second HTTP target
 * for one interface, name a `host` otherwise than a URL spells it (letter
 * case aside, for its own origin or a deployment origin it lists), or send
 * an `auth` header over `http` to an address eval-quality's `staysOnHost`
 * says leaves the host (`registry`, Story 1.11), `interface` must be a kind
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
const { CALIBRATION_PATH, calibrationProblems, readCalibration } = require('./calibration');
const { readConfiguration, recordsDirectory, verifyRecordsCalibration } = require('./records-calibration');
const { baselineDigestFindings } = require('./baseline-digests');
const { readPlan } = require('./ci-plan');
const { MANIFEST_NAME } = require('./folder');
const { addFormats } = require('./formats');
const { HTTP_PORT_MODULE, originTarget, sharedOrigin } = require('./http-target');
const { compileRefusals, lineNamesOperation, reportedOperations, reportsProblems } = require('./release-report');
const {
  SKILL_RUNNER_BIN,
  apiRegistryProblems,
  egressRegistryProblems,
  isSkillRunnerEntry,
  kindOf,
  mcpRegistryProblems,
  removedNetworkProblem,
  principalMappingProblems,
  repeatedPairs,
  sharedInterfaces,
  sharedTargetSystemPaths,
} = require('./registry');
const { AGENT_ADAPTERS, bridgedArgsRefused, resolveModel } = require('../agent-adapters');
const { supervisedAgentCeilingMs } = require('../agent-supervisor-bounds');
const { EVALUATOR_DIRECTORY, EvaluatorLayerError, convertsRows, evaluatorFiles, evaluatorOf, isKnownEvaluator } = require('./evaluators');
const { FRAMEWORKS_PATH, LEARNED_PATH, declarationProblems, declaredFrameworks, learnedProblems } = require('./frameworks');
const { answeredKind, degenerateResponsePath } = require('./gameability');

/** How a finding names a call of each interface kind. */
const KIND_NAMES = { cli: 'a command', mcp: 'a tool call', api: 'an HTTP request' };
const { MAPPING_PATH, mappingContractProblems, mappingSchemaProblems } = require('./judgment-rows');
const {
  HELD_OUT_DIRECTORY,
  PROBE_ID,
  PartitionPlanError,
  STEP_ID,
  contractView,
  heldOutResponsePath,
  mappingViewProblems,
  named,
  partitionPlanProblems,
  readHeldOutPlan,
  readHeldOutResponse,
  stepsReadBy,
} = require('./partition');

/** The skill runner's infrastructure exit codes (`cli/skill-runner.js`), which a registry entry for it must declare. */
const SKILL_RUNNER_INFRASTRUCTURE_CODES = [3, 4, 5, 6];
const { CorpusIndexError, INDEX_NAME, corpusIndexProblem } = require('./corpus-index');

const Ajv = AjvModule.default ?? AjvModule;

const KNOWN_EVALUATION_SCHEMA_VERSIONS = [2];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

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
function describeErrors(errors, value) {
  const retiredEntry = (error) => {
    const retired = /^\/registry\/(\d+)$/.exec(error.instancePath);
    return retired !== null && value?.registry?.[retired[1]] !== undefined ? retired[1] : null;
  };
  // A registry entry that declares the retired `network` field gets the finding that names the entry and its replacement; the
  // entry's tool-server and HTTP definitions also report the `if`, `then` and `else` they sit in, which would only repeat it.
  const retiredEntries = new Set(
    (errors ?? [])
      .filter((error) => error.params?.additionalProperty === 'network')
      .map(retiredEntry)
      .filter((index) => index !== null),
  );
  const repeated = (error) => ['if', 'then', 'else'].includes(error.keyword) && retiredEntries.has(retiredEntry(error));
  return (errors ?? [])
    .filter((error) => !repeated(error))
    .map((error) => {
      const retired = retiredEntry(error);
      if (retired !== null && error.params?.additionalProperty === 'network') {
        return removedNetworkProblem(Number(retired), value.registry[retired]);
      }
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
      heldOutPlan: runtimeSchema('held-out-plan.schema.json'),
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
  const lines = [...new Set(describeErrors(validator.errors, value))];
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
        if (step?.interfaceId !== iface?.logicalId || step?.operationId !== operation?.operationId) continue;
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
function checkSkillRunner(report, evaluation, contract, provision, platform = process.platform) {
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
    const allowanceMs = supervisedAgentCeilingMs(0, platform) + 10_000;
    if (!(milliseconds > 0 && milliseconds + allowanceMs < entry.maxElapsedMs)) {
      const detail =
        platform === 'win32'
          ? `the literal plus 120000 ms reserved for Windows Job Object setup, supervisor completion and runner overhead must be below the entry's maxElapsedMs (${entry.maxElapsedMs})`
          : `the literal plus ${allowanceMs} ms reserved for POSIX watchdog setup, supervisor completion and runner overhead must be below the entry's maxElapsedMs (${entry.maxElapsedMs})`;
      report.add(
        CONTRACT_NAME,
        'skill-runner',
        `${set.where} hands ${SKILL_RUNNER_BIN} --timeout-ms ${JSON.stringify(timeout ?? null)}; ${detail}`,
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
      bodyEncoding: null,
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

/**
 * What is wrong with the fix boundary a historical probe names (Story 1.32):
 * it names exactly one of `fixCommit` (the worktree route) and `deployments`
 * (the deployment route); deployments come as a pair, a pre-fix and a
 * post-fix one, of two releases, with no pre-fix origin reaching a post-fix
 * one (`sharedOrigin`); a deployment-routed probe reaches its target over
 * HTTP alone, so every registry entry is an HTTP entry; and each
 * deployment names an http or https origin for every HTTP interface of the
 * registry and no other; and each deployment's `reports` (Stories 1.38 and 1.65)
 * holds one report for every HTTP interface of the registry and for no other,
 * each naming an operation of that `api` interface of the contract that needs
 * no input, with a JSON pointer (`reportsProblems`). Whether an origin is one
 * the registry's policy authorizes is eval-quality's to decide at run time.
 * Whether a report operation collides with another operation of the contract
 * on a method and path is eval-quality's compile to say (`checkReportCollision`,
 * Stories 1.75 and 1.77).
 */
function historicalBoundaryProblems(qualification, registry, contract) {
  const { fixCommit, deployments } = qualification ?? {};
  if (fixCommit === undefined && deployments === undefined) {
    return [
      'a probe on the historical route names its fix boundary: a fixCommit (the worktree route) or deployments (the deployment route)',
    ];
  }
  if (deployments === undefined || deployments === null || typeof deployments !== 'object') return [];
  const problems = [];
  if (fixCommit !== undefined) {
    problems.push(
      'names both a fixCommit and deployments; a historical probe crosses one fix boundary, a commit and its parent or a pre-fix and a post-fix deployment, so name one',
    );
  }
  const named = ['preFix', 'fix'].filter((side) => deployments[side] !== undefined);
  if (named.length === 0) {
    problems.push(
      'names deployments and neither a preFix nor a fix deployment; the fail-before arm runs against the pre-fix deployment and the pass-after arm against the post-fix one, so name both',
    );
  }
  if (named.length === 1) {
    const [present] = named;
    const absent = present === 'preFix' ? 'fix' : 'preFix';
    problems.push(
      `names the ${present} deployment and no ${absent} deployment; the fail-before arm runs against the pre-fix deployment and the pass-after arm against the post-fix one, so name both`,
    );
  }
  const releases = named.map((side) => deployments[side]?.release);
  if (named.length === 2 && typeof releases[0] === 'string' && releases[0] === releases[1]) {
    problems.push(
      `names release ${JSON.stringify(releases[0])} for both deployments; the probe records the pre-fix release's digest as its artifactDigest and the post-fix release's as its fixCommitDigest, so two deployments of one release cross no fix boundary`,
    );
  }
  const shared = named.length === 2 ? sharedOrigin(deployments.preFix?.origins, deployments.fix?.origins) : null;
  if (shared !== null) {
    problems.push(
      `deployments.preFix.origins.${shared.preFix} and deployments.fix.origins.${shared.fix} both reach ${shared.origin}; the fail-before arm, the witness leg and the trials would reach the post-fix deployment and record a fix boundary the run never crossed, so give each deployment origins of its own`,
    );
  }
  const httpInterfaces = Array.isArray(registry)
    ? registry.filter((entry) => kindOf(entry) === 'api').map((entry) => entry.interfaceId)
    : null;
  for (const side of named) {
    problems.push(
      ...reportsProblems({ reports: deployments[side]?.reports, contract, interfaces: httpInterfaces, where: `deployments.${side}` }),
    );
  }
  if (!Array.isArray(registry)) return problems;
  const other = registry.filter((entry) => kindOf(entry) !== 'api');
  if (other.length > 0) {
    problems.push(
      `names deployments, which a run reaches over HTTP alone, and the registry declares ${other.length} entr${other.length === 1 ? 'y' : 'ies'} of another kind (${other.map((entry) => JSON.stringify(entry?.interfaceId)).join(', ')}); a deployment-routed probe belongs to an evaluation whose every interface is api`,
    );
  }
  const interfaces = registry.filter((entry) => kindOf(entry) === 'api').map((entry) => entry.interfaceId);
  for (const side of named) {
    const origins = deployments[side]?.origins;
    if (origins === null || typeof origins !== 'object' || Array.isArray(origins)) continue;
    const missing = interfaces.filter((id) => !Object.hasOwn(origins, id));
    const extra = Object.keys(origins).filter((id) => !interfaces.includes(id));
    if (missing.length > 0 || extra.length > 0) {
      problems.push(
        `deployments.${side}.origins names ${JSON.stringify(Object.keys(origins))}, where the registry's HTTP interfaces are ${JSON.stringify(interfaces)}; a deployment answers every HTTP interface of the registry, so name each once and no other`,
      );
    }
    for (const [id, origin] of Object.entries(origins)) {
      if (originTarget(origin) === null) {
        problems.push(
          `deployments.${side}.origins.${id} is ${JSON.stringify(origin)}, which is no http or https origin (scheme://host[:port], its authority written as a URL keeps it, letter case aside, with no path, query, fragment or credentials)`,
        );
      }
    }
  }
  return problems;
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
    for (const message of historicalBoundaryProblems(probe.qualification, registry, context.contract))
      report.add(relative, 'historical', message);
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

/** The operation a plan step calls, with its interface, from the contract's interfaces; undefined when the contract holds none. */
function operationOfStep(contract, step) {
  return (Array.isArray(contract?.permittedInterfaces) ? contract.permittedInterfaces : [])
    .flatMap((iface) => (Array.isArray(iface?.operations) ? iface.operations.map((candidate) => ({ iface, operation: candidate })) : []))
    .find((candidate) => candidate.iface?.logicalId === step?.interfaceId && candidate.operation?.operationId === step?.operationId);
}

/**
 * One degenerate-response file's answers against the plan steps it answers (the steps of `contract.json`, or the held-out plan's):
 * one answer for every plan step and no other, each of its step's kind, and an exit code no registry entry of the step's command
 * reads as a target that could not run. `wording` and `name` make the findings fit the file: a finding about the held-out plan's
 * answers names a step by an ID only when it has the schema's shape (`named`), and otherwise by where it sits.
 */
function checkAnswers(report, { file, answers, plan, contract, registry, wording, name }) {
  const planned = new Set(plan.map((step) => step?.stepId).filter((stepId) => typeof stepId === 'string'));
  for (const [position, step] of plan.entries()) {
    if (typeof step?.stepId === 'string' && !Object.hasOwn(answers, step.stepId)) {
      report.add(file, 'gameability', wording.unanswered(name(step.stepId, `interactionPlan[${position}]`)));
    }
  }
  for (const [position, stepId] of Object.keys(answers).entries()) {
    const label = name(stepId, `steps entry ${position}`);
    if (!planned.has(stepId)) {
      report.add(file, 'gameability', wording.undeclared(label));
      continue;
    }
    const step = plan.find((candidate) => candidate?.stepId === stepId);
    const operation = operationOfStep(contract, step);
    const answer = answers[stepId];
    const stepKind = operation?.iface?.kind;
    const answerKind = answeredKind(answer);
    if (operation !== undefined && stepKind !== answerKind) {
      report.add(
        file,
        'gameability',
        `answers step ${label}, ${KIND_NAMES[stepKind] ?? stepKind}, with ${KIND_NAMES[answerKind]}'s response, so the gameability arm cannot answer it`,
      );
      continue;
    }
    if (answerKind !== 'cli') continue;
    const entries = (registry ?? []).filter(
      (entry) => entry?.interfaceId === operation?.iface?.logicalId && entry?.executable === operation?.operation?.invocation?.executable,
    );
    const { exitCode } = answer;
    if (infrastructureCodesOf(entries).includes(exitCode)) {
      report.add(
        file,
        'gameability',
        `step ${label} exits ${exitCode}, which its registry entry declares as an infrastructure exit code, so the arm would read the degenerate response as a target that could not run`,
      );
    }
  }
}

/**
 * A gameability probe's naive oracle and its committed degenerate response
 * (`corpus/gameability/<probeId>.json`): the oracle is one the contract
 * declares for another behavior, and the response answers every plan step of
 * `contract.json`, and only those, with an exit code no registry entry of the
 * step's command reads as a target that could not run.
 *
 * Under a `partitionPlan` (Story 1.109) the answers to the held-out plan's steps live beside the plan, which a development check
 * never opens (`checkHeldOutAnswers`), so this file answers the steps of `contract.json` in every partition, and a held-out
 * probe's naive oracle is one the held-out view keeps: an oracle that reads a development-only step leaves that view, and the
 * probe's arm in it has nothing to resolve.
 */
function checkGameability(report, folder, relative, probe, context, behaviors, registry, evaluation) {
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
    } else if (
      Array.isArray(evaluation?.heldOutProbes) &&
      evaluation.heldOutProbes.includes(probe.probeId) &&
      Array.isArray(evaluation.partitionPlan?.developmentOnlySteps)
    ) {
      const oracle = context.contract.oracles.find((candidate) => candidate?.id === naive);
      const developmentOnly = new Set(evaluation.partitionPlan.developmentOnlySteps);
      if (stepsReadBy(oracle).some((stepId) => developmentOnly.has(stepId))) {
        report.add(
          relative,
          'gameability',
          `qualification.naiveOracle ${naive} reads a development-only step, so the held-out view this held-out probe runs in drops it; name an oracle the held-out view keeps`,
        );
      }
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
  checkAnswers(report, {
    file: responseFile,
    answers: response.steps,
    plan: Array.isArray(context.contract?.interactionPlan) ? context.contract.interactionPlan : [],
    contract: context.contract,
    registry,
    wording: {
      unanswered: (stepId) => `answers no response for interaction plan step ${stepId}, so the gameability arm cannot run the plan`,
      undeclared: (stepId) => `answers step ${stepId}, which the contract's interaction plan does not declare`,
    },
    name: (stepId) => stepId,
  });
}

/**
 * The answers a gameability probe gives the held-out plan's steps (Story 1.109), `corpus/held-out/gameability/<probeId>.json`, for
 * the held-out and both views, which a check that opens a sound plan reads for every gameability probe: a probe runs the whole
 * plan in the both view whichever partition it belongs to. The file is required when the plan declares a step, answers every step
 * of the plan and no other, and meets the same rules as the answers of `contract.json`. Every finding names the file by the
 * probe's ID and a step by its ID only when it has the schema's shape (otherwise by where it sits), and the file's own text, a
 * parser's message and a schema error's key among it, never reaches a line.
 */
function checkHeldOutAnswers(report, folder, context, registry, heldOutPlan) {
  const plan = heldOutPlan.interactionPlan;
  for (const entry of listDirectory(folder, 'probes') ?? []) {
    if (!entry.isFile || !PROBE_FILE.test(entry.name)) continue;
    let probe;
    try {
      probe = readJsonFile(path.join(folder, 'probes', entry.name));
    } catch {
      continue;
    }
    if (probe?.qualification?.route !== 'gameability' || typeof probe.probeId !== 'string' || !PROBE_ID.test(probe.probeId)) continue;
    const file = heldOutResponsePath(probe.probeId);
    let answered;
    try {
      answered = readHeldOutResponse(folder, probe.probeId);
    } catch (error) {
      if (!(error instanceof PartitionPlanError)) throw error;
      if (error.absent !== true) report.add(file, 'gameability', error.message);
      else if (plan.length > 0) {
        report.add(
          file,
          'gameability',
          `probes/${entry.name} takes the gameability route under a partitionPlan whose held-out plan declares ${plan.length === 1 ? 'a step' : 'steps'}, and ${file} is absent; it holds the answers to the held-out plan's steps, which the gameability arm answers the held-out and both views from`,
        );
      }
      continue;
    }
    if (!context.validate.degenerateResponse(answered.response)) {
      plainSchemaFindings(report, file, context.validate.degenerateResponse, undefined, 'gameability');
      continue;
    }
    checkAnswers(report, {
      file,
      answers: answered.response.steps,
      plan,
      contract: context.contract,
      registry,
      wording: {
        unanswered: (stepId) =>
          `answers no response for held-out plan step ${stepId}, so the gameability arm cannot run the held-out and both views`,
        undeclared: (stepId) => `answers step ${stepId}, which the held-out plan does not declare`,
      },
      name: (stepId, fallback) => named(stepId, STEP_ID, fallback),
    });
  }
}

/**
 * `evaluation.json`'s `judge` and the judge's model snapshot in
 * `policy/evaluator-conditions.json`: both required when the contract
 * (under a partition plan, `contract.json` and the held-out plan together) declares a rubric, and the judge's
 * adapter, command and model ones TeA's agent adapters can run.
 */
function checkJudge(report, evaluation, contract, conditions, { partial = false } = {}) {
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
  // A judge block beside a contract with no rubric is never used, so it is refused rather than ignored. `partial` is a
  // partition plan whose held-out plan `check` has not read, which may declare the rubric the judge serves (Story 1.105).
  if (contract !== undefined && rubrics.length === 0 && !partial) {
    const unused = `${CONTRACT_NAME} declares no rubric, so no judge runs and this block is never used; remove it`;
    if (judge !== undefined) report.add(MANIFEST_NAME, 'judge', `declares judge: ${unused}`);
    if (conditions !== null && typeof conditions === 'object' && Object.hasOwn(conditions, 'judge')) {
      report.add(CONDITIONS_NAME, 'judge', `declares judge: ${unused}`);
    }
  }
  if (rubrics.length > 0) {
    // Over the both view the count is the contract's and the plan's together, so it is neither printed nor put on `contract.json`.
    const declares =
      !partial && evaluation.partitionPlan !== undefined
        ? 'the contract and its held-out plan declare a rubric'
        : `${CONTRACT_NAME} declares ${rubrics.length} rubric(s)`;
    if (judge === undefined) {
      report.add(
        MANIFEST_NAME,
        'judge',
        `${declares}, and evaluation.json declares no judge to score them; declare judge with its agent adapter and timeoutMs`,
      );
    }
    if (typeof conditions?.judge?.modelSnapshot !== 'string' || conditions.judge.modelSnapshot.length === 0) {
      report.add(
        CONDITIONS_NAME,
        'judge',
        `${declares}, and ${CONDITIONS_NAME} names no judge.modelSnapshot, the model every judge call runs and every run records as a fixed condition`,
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

/**
 * A records evaluator's rubric scores carry the harness's calibration
 * judgments, verified by the one function `run` uses (`records-calibration.js`).
 * A labelled file `checkCalibration` already faults is left to it.
 */
function checkRecordsCalibration(report, folder, evaluator, evaluation, contract, root, engine) {
  const configurationFile = `${evaluator.records}/evaluator-configuration.json`;
  let labelled;
  try {
    labelled = readCalibration(folder);
  } catch {
    return;
  }
  if (calibrationProblems(evaluation, contract, labelled?.value, engine).length > 0) return;
  let configuration;
  try {
    configuration = readConfiguration(root);
  } catch (error) {
    report.add(
      configurationFile,
      'judge-calibration',
      `${configurationFile} cannot be read as JSON, so the imported rubric scores cannot be verified: ${error.message}`,
    );
    return;
  }
  const { problems } = verifyRecordsCalibration({
    records: evaluator.records,
    root,
    configuration,
    evaluation,
    contract,
    labelled,
    engine,
  });
  for (const problem of problems) report.add(problem.file, 'judge-calibration', problem.message);
}

/** The mode bits that let anyone execute a file. */
const EXECUTE_BITS = 0o111;

/**
 * A `command` evaluator's declared framework dependencies (Story 1.44):
 * `evaluator/frameworks.json` must be there, tracked, and meet its shape (an
 * empty list for an evaluator with no installed framework), every version
 * probe must be a tracked regular executable of the layer, and
 * `evaluator/LEARNED.md` must record the version each nonempty declaration
 * names. `run` observes what is installed; `check` runs no probe.
 */
function checkFrameworks(report, folder, layer, untracked) {
  if (untracked(FRAMEWORKS_PATH)) {
    report.add(
      FRAMEWORKS_PATH,
      'evaluator',
      `${FRAMEWORKS_PATH} is not tracked by git, and a run reads only the files git tracks under evaluator/; git add it`,
    );
    return;
  }
  if (!fs.existsSync(path.join(folder, ...FRAMEWORKS_PATH.split('/')))) {
    report.add(
      FRAMEWORKS_PATH,
      'evaluator',
      `evaluation.json's evaluator is command, which declares the installed frameworks it depends on in ${FRAMEWORKS_PATH}, and the folder has none; declare each dependency, or an empty list for an evaluator with none`,
    );
    return;
  }
  const declaration = parseInto(report, folder, FRAMEWORKS_PATH);
  if (declaration === undefined) return;
  const shape = declarationProblems(declaration);
  for (const problem of shape)
    report.add(
      FRAMEWORKS_PATH,
      /^frameworks\[\d+\]\.(?:probe\.probeTimeoutMs|installState) must be /.test(problem) ? 'evaluator' : 'schema',
      problem,
    );
  if (shape.length > 0) return;
  const frameworks = declaredFrameworks(declaration);
  for (const { package: name, probe } of frameworks) {
    if (untracked(probe.command)) {
      report.add(
        FRAMEWORKS_PATH,
        'evaluator',
        `the version probe of ${name} names ${probe.command}, which git does not track, and a run reads only the files git tracks under evaluator/; git add it`,
      );
      continue;
    }
    let stats;
    try {
      stats = fs.lstatSync(path.join(folder, ...probe.command.split('/')));
    } catch {
      stats = null;
    }
    if (stats === null || !stats.isFile()) {
      report.add(
        FRAMEWORKS_PATH,
        'evaluator',
        `the version probe of ${name} names ${probe.command}, which is not a regular file the evaluation folder holds`,
      );
    } else if (process.platform !== 'win32' && (stats.mode & EXECUTE_BITS) === 0) {
      report.add(
        FRAMEWORKS_PATH,
        'evaluator',
        `the version probe of ${name} names ${probe.command}, which is not executable; set its execute bit`,
      );
    }
  }
  // Where the layer could not be read, the layer's own finding already says so.
  if (layer === null) return;
  if (untracked(LEARNED_PATH)) {
    report.add(
      LEARNED_PATH,
      'evaluator',
      `${LEARNED_PATH} is not tracked by git, and a run reads only the files git tracks under evaluator/; git add it`,
    );
    return;
  }
  const learned = layer.files.find((file) => file.path === LEARNED_PATH);
  for (const problem of learnedProblems(frameworks, learned === undefined ? null : learned.bytes.toString('utf8'))) {
    report.add(LEARNED_PATH, 'evaluator', problem);
  }
}

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
 * exist, and when the contract declares a rubric its judgments and
 * configuration must verify (`records-calibration.js`). An evaluator block in the conditions beside any other kind is
 * never used, so it is refused.
 */
function checkEvaluator(report, folder, evaluation, contract, conditions, engine) {
  const evaluator = evaluatorOf(evaluation);
  if (!isKnownEvaluator(evaluator)) return;
  const { kind } = evaluator;
  // Only an agent that chooses its own calls varies between attempts, so only it is qualified (Story 1.34).
  if (kind === 'sealed-brief-agent' && evaluation.evaluatorQualification === undefined) {
    report.add(
      MANIFEST_NAME,
      'evaluator',
      "evaluation.json's evaluator is a sealed-brief agent, which chooses its own calls, and the file declares no evaluatorQualification (attempts and minimumAgreement); run qualifies the agent on each arm before its verdicts count",
    );
  }
  if (kind !== 'sealed-brief-agent' && evaluation.evaluatorQualification !== undefined) {
    report.add(
      MANIFEST_NAME,
      'evaluator',
      `declares evaluatorQualification: evaluation.json's evaluator is ${kind}, and only a sealed-brief agent is qualified before its verdicts count; remove it`,
    );
  }
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
    const real = recordsDirectory(folder, evaluator.records);
    if (real === null) {
      report.add(
        MANIFEST_NAME,
        'evaluator',
        `evaluator.records names ${evaluator.records}, which is not a directory the evaluation folder holds, reached through no link; the records evaluator reads the harness's sealed records there`,
      );
    } else if ((contract?.rubrics ?? []).length > 0) checkRecordsCalibration(report, folder, evaluator, evaluation, contract, real, engine);
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
        // Under a partition plan a held-out oracle or criterion binds in the held-out plan's mappings, never in this file, which the
        // development partition reads (Story 1.107).
        const hint =
          evaluation.partitionPlan === undefined
            ? ''
            : "; under a partitionPlan a held-out oracle or criterion binds in the held-out plan's mappings, and this file holds only what contract.json declares";
        for (const problem of mappingContractProblems(mapping, contract, { hint })) report.add(MAPPING_PATH, 'evaluator', problem);
      }
    }
  } else {
    report.add(
      MAPPING_PATH,
      'evaluator',
      `evaluation.json's evaluator is ${kind}, whose judgment rows convert through ${MAPPING_PATH}, and the folder has none`,
    );
  }
  if (kind === 'command') checkFrameworks(report, folder, layer, untracked);
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

/**
 * Stories 1.75 and 1.77: when a deployment-routed probe names a report operation, eval-quality's compile says whether the
 * contract keeps it apart from every other operation. It refuses `duplicate-operation-signature` across the whole
 * contract (a method and an erased path template is unique among all `api` operations of all interfaces, AD-40), which
 * `run` meets at exit 4. The refusal can name two report operations or a report operation and an ordinary one, and
 * TeA compares no template (AD-1): the one `historical` finding quotes the engine's own line, which names both
 * interfaces, both operation IDs and the shared method and path, and words itself around those operations. The rule
 * keeps only a refusal whose line names an operation a probe's report names (by interface and operation ID, no
 * template), so a collision between other operations, of any shape, stays the CI plan's `compile` check and `run`'s,
 * as does every other outcome of compile.
 */
function checkReportCollision(report, line, reportingProbes) {
  if (line === null) return;
  // The finding sits on the first probe whose own report the line names. A collision the line shows between operations no
  // report names is not this rule's: it stays the CI plan's `compile` check and `run`'s.
  const probe = reportingProbes.find(({ operations }) => lineNamesOperation(line, operations));
  if (probe === undefined) return;
  report.add(
    probe.relative,
    'historical',
    `a deployment's report operation shares an identity with another operation of the contract, and eval-quality's compile refuses the contract (${line}); change one of the two operations the line names (a method and path template is unique among the api operations of the contract)`,
  );
}

/**
 * Story 1.102: two interfaces of the contract share a `logicalId`. An operation is the pair of its interface and its
 * operation ID, so a repeat merges two interfaces' operations into one namespace, and eval-quality's compile refuses the
 * contract with `duplicate-interface-identifier`, which `seal` and `run` would otherwise meet later. The refusal covers the
 * whole contract and needs no probe: the one finding quotes the engine's own line, which names the identifier and both
 * interface positions. TeA compares no identifier (AD-1).
 */
function checkInterfaceRepeat(report, line) {
  if (line === null) return;
  report.add(
    CONTRACT_NAME,
    'interface-identifier',
    `two interfaces of the contract share an identifier, and eval-quality's compile refuses the contract (${line}); give each entry of permittedInterfaces its own logicalId`,
  );
}

/** Checks every committed probe; returns the qualification routes they take. */
async function checkProbes(report, folder, context, behaviors, mutations, registry, compiled, evaluation) {
  const routes = new Set();
  const reportingProbes = [];
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
    if (probe.qualification?.route === 'gameability')
      checkGameability(report, folder, relative, probe, context, behaviors, registry, evaluation);
    if (probe.qualification?.route === 'historical') {
      const named = reportedOperations(probe.qualification.deployments);
      if (named.length > 0) reportingProbes.push({ relative, operations: named });
    }
  }
  // The refusal is contract-wide, so one compile and one finding cover every probe; it sits on the first probe whose report the engine's line names.
  if (reportingProbes.length > 0) checkReportCollision(report, (await compiled()).signatureCollision, reportingProbes);
  return routes;
}

function checkHeldOut(report, folder, evaluation) {
  const selected = evaluation.heldOutProbes ?? [];
  if (!Array.isArray(selected)) return;
  const defectsOf = (probe) =>
    Array.isArray(probe?.defects) ? probe.defects.filter((defect) => defect !== null && typeof defect === 'object') : [];
  const probes = new Map();
  for (const entry of listDirectory(folder, 'probes') ?? []) {
    if (!entry.isFile || !PROBE_FILE.test(entry.name)) continue;
    const probe = parseInto(report, folder, `probes/${entry.name}`);
    if (typeof probe?.probeId === 'string') probes.set(probe.probeId, probe);
  }
  for (const id of selected) {
    const probe = probes.get(id);
    if (probe === undefined) {
      report.add(MANIFEST_NAME, 'held-out', `heldOutProbes names ${id}, which is not a committed probe`);
      continue;
    }
    if (probe.qualification?.route === 'clean-control' || probe.expectedClean === true)
      report.add(MANIFEST_NAME, 'held-out', `heldOutProbes names clean control ${id}`);
    const affected = new Set([probe.behaviorId, ...defectsOf(probe).map((defect) => defect.behaviorId)]);
    for (const behaviorId of affected) {
      if (typeof behaviorId !== 'string') continue;
      const development = [...probes.values()].some(
        (candidate) =>
          !selected.includes(candidate.probeId) &&
          (candidate.behaviorId === behaviorId || defectsOf(candidate).some((defect) => defect.behaviorId === behaviorId)),
      );
      if (!development) report.add(MANIFEST_NAME, 'held-out', `${id} leaves behavior ${behaviorId} without a development probe`);
    }
  }
}

/** Every property name a schema declares, at any depth: the public vocabulary of the format, as against the adopter's own keys. */
function declaredNames(schema) {
  const names = new Set();
  const visit = (node) => {
    if (Array.isArray(node)) for (const item of node) visit(item);
    else if (isPlainObject(node)) {
      for (const [key, value] of Object.entries(node)) {
        if (key === 'properties' && isPlainObject(value)) for (const name of Object.keys(value)) names.add(name);
        visit(value);
      }
    }
  };
  visit(schema);
  return names;
}

/**
 * An instance path as a finding may print it: array indices and the schema's declared property names stay, and every other
 * segment is `*`, because it is a key the adopter chose (a binding name, a key of a JSON value, a behavior ID) and the held-out
 * plan's keys never reach a line.
 */
function declaredPath(instancePath, declared) {
  return instancePath
    .split('/')
    .slice(1)
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
    .map((segment) => (/^\d+$/.test(segment) || declared.has(segment) ? segment : '*'))
    .map((segment) => `/${segment}`)
    .join('');
}

/**
 * One finding per distinct schema error, from a path and the schema's own wording only: a key or a value the held-out plan holds
 * never reaches a line, which is what `describeErrors` would add for an unexpected property, and `declaredPath` keeps the path to
 * the schema's own names. `locate` maps that path to where the author edits it.
 */
function plainSchemaFindings(report, file, validate, locate = (instancePath) => instancePath || '(root)', rule = 'partition-plan') {
  const declared = declaredNames(validate.schema);
  const lines = [
    ...new Set((validate.errors ?? []).map((error) => `${locate(declaredPath(error.instancePath, declared))} ${error.message}`)),
  ];
  for (const line of lines.slice(0, SCHEMA_ERROR_LIMIT)) report.add(file, rule, line);
  if (lines.length > SCHEMA_ERROR_LIMIT) {
    report.add(file, rule, `${lines.length - SCHEMA_ERROR_LIMIT} more schema error(s) not shown; fix the ones above and run check again`);
  }
}

/**
 * The rows a held-out plan's `mappings` add to `evaluator/mapping.json` in the held-out and both views (Story 1.107), held to the
 * held-out view: each names a key no other row has, an oracle or criterion the view declares and no other key binds. A row is
 * named by its place in `mappings`, never by its key. `evaluator/mapping.json` itself is read only when it parses and meets its
 * schema; `checkEvaluator` reports it otherwise, and its own rows are checked there against `contract.json`.
 */
function checkPlanMappings(report, folder, planFile, contract, view, heldOutPlan) {
  let mapping;
  try {
    mapping = readJsonFile(path.join(folder, ...MAPPING_PATH.split('/')));
  } catch {
    return;
  }
  if (mappingSchemaProblems(mapping).length > 0) return;
  for (const message of mappingViewProblems({ mapping, source: contract, view, heldOutPlan }))
    report.add(planFile, 'partition-plan', message);
}

/**
 * `partitionPlan` (Story 1.51): the development-only steps exist, the held-out plan is a valid file of its own, and the held-out
 * view it makes keeps every behavior an oracle. Every finding names a path or an ID and none quotes held-out plan bytes, so the
 * authoring loop that reads `check` output learns nothing it must not. The engine's compile over the held-out view is not
 * run here (`check` compiles nothing); a compile defect surfaces at a held-out or both preflight.
 *
 * Returns the held-out plan only when it is sound: the file reads, passes its schema and `partitionPlanProblems`, `contract.json`
 * passes the engine's contract schema, and the held-out view it makes passes it too. Those are the findings that block the return.
 * An evaluator kind and an empty `heldOutProbes` are findings of their own and do not: nothing in them
 * reaches the plan's bytes, and a plan criterion is named by its label either way. Whatever else reads the plan (the both view
 * the rubric rules run over) then runs over a plan that is known to fit.
 */
function checkPartitionPlan(report, folder, evaluation, context, { openPlan = true } = {}) {
  const plan = evaluation.partitionPlan;
  const contract = context.contract;
  if (!isPlainObject(plan) || typeof plan.heldOutPlan !== 'string' || contract === undefined) return;
  const kind = evaluatorOf(evaluation).kind;
  const selected = Array.isArray(evaluation.heldOutProbes) ? evaluation.heldOutProbes : [];
  if (selected.length === 0) {
    report.add(MANIFEST_NAME, 'partition-plan', 'partitionPlan declares a held-out plan and heldOutProbes names no probe that runs it');
  }
  const heldOutBehaviors = new Set();
  for (const entry of listDirectory(folder, 'probes') ?? []) {
    if (!entry.isFile || !PROBE_FILE.test(entry.name)) continue;
    let probe;
    try {
      probe = readJsonFile(path.join(folder, 'probes', entry.name));
    } catch {
      continue;
    }
    if (!selected.includes(probe?.probeId) || (probe.probeClass !== 'defect' && probe.probeClass !== 'gameability')) continue;
    const defects = Array.isArray(probe.defects) ? probe.defects : [];
    for (const behaviorId of [probe.behaviorId, ...defects.map((defect) => defect?.behaviorId)]) {
      if (typeof behaviorId === 'string') heldOutBehaviors.add(behaviorId);
    }
  }
  let heldOutPlan;
  try {
    if (openPlan) heldOutPlan = readHeldOutPlan(folder, evaluation, { shaped: false });
  } catch (error) {
    if (!(error instanceof PartitionPlanError)) throw error;
    report.add(plan.heldOutPlan, 'partition-plan', error.message);
  }
  if (heldOutPlan !== undefined && !context.validate.heldOutPlan(heldOutPlan)) {
    plainSchemaFindings(report, plan.heldOutPlan, context.validate.heldOutPlan);
    heldOutPlan = undefined;
  }
  const problems = partitionPlanProblems({ contract, evaluation, heldOutPlan, heldOutBehaviors });
  for (const problem of problems) report.add(problem.file, problem.rule, problem.message);
  // A records harness answers with its own sealed records, and its calibration judgments answer one labelled file for one
  // contract, so no partition derives them (Story 1.107): a records evaluator beside a rubric of either file is refused. A
  // development check never opens the plan, so the rubric of `contract.json` refuses on its own, and the plan's rubrics join it
  // when the plan was read.
  if (kind === 'records' && (contract.rubrics?.length > 0 || heldOutPlan?.rubrics?.length > 0)) {
    report.add(
      MANIFEST_NAME,
      'partition-plan',
      "partitionPlan beside a records evaluator and a rubric: the harness's calibration judgments answer one labelled file for one contract, which no partition derives; use a command or sealed-brief-agent evaluator, or declare no rubric",
    );
  }
  if (heldOutPlan !== undefined && !convertsRows(kind) && (heldOutPlan.mappings?.length ?? 0) > 0) {
    report.add(
      plan.heldOutPlan,
      'partition-plan',
      `declares mappings, which only a command or sealed-brief-agent evaluator reads; evaluation.json's evaluator is ${kind}, so remove them`,
    );
  }
  if (heldOutPlan === undefined || problems.length > 0 || !context.validate.contract(contract)) return;
  const sourceBytes = Buffer.from(JSON.stringify(contract));
  const { contract: view } = contractView({ contractBytes: sourceBytes, evaluation, heldOutPlan, partition: 'held-out' });
  if (context.validate.contract(view)) {
    // The rows the held-out plan adds to the evaluator's mapping are checked over a view that is itself sound, so a contract
    // defect elsewhere is never blamed on a mapping row (Story 1.107).
    if (convertsRows(kind)) checkPlanMappings(report, folder, plan.heldOutPlan, contract, view, heldOutPlan);
    return heldOutPlan;
  }
  const developmentOnly = new Set(plan.developmentOnlySteps);
  const sharedSteps = (contract.interactionPlan ?? []).filter((step) => !developmentOnly.has(step?.stepId)).length;
  const retainedOracles = view.oracles.length - heldOutPlan.oracles.length;
  const retainedRubrics = (view.rubrics ?? []).length - (heldOutPlan.rubrics ?? []).length;
  const retainedWaivers = (view.waivers ?? []).length - (heldOutPlan.waivers ?? []).length;
  const bases = { interactionPlan: sharedSteps, oracles: retainedOracles, rubrics: retainedRubrics, waivers: retainedWaivers };
  // A step, oracle, rubric or waiver of the held-out view that is past the shared ones is the held-out plan's, named by its index there.
  const locate = (instancePath) => {
    const [, collection, index, rest = ''] = /^\/(interactionPlan|oracles|rubrics|waivers)\/(\d+)(.*)$/.exec(instancePath) ?? [];
    const base = bases[collection];
    return collection !== undefined && Number(index) >= base
      ? `${collection}[${Number(index) - base}]${rest}`
      : `held-out view ${instancePath || '(root)'}`;
  };
  plainSchemaFindings(report, plan.heldOutPlan, context.validate.contract, locate);
}

function checkCalibration(report, folder, evaluation, contract, engine, { partial = false, label } = {}) {
  let calibration;
  try {
    calibration = readCalibration(folder);
  } catch (error) {
    report.add(CALIBRATION_PATH, 'judge-calibration', error.message);
    return;
  }
  for (const problem of calibrationProblems(evaluation, contract, calibration?.value, engine, { partial, label }))
    report.add(CALIBRATION_PATH, 'judge-calibration', problem);
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

/** `baseline/` holds the bytes `baseline/baseline.json` lists (`baseline-digest`). */
function checkBaselineDigests(report, folder, context) {
  for (const { file, rule, message } of baselineDigestFindings({ folder, digestBytes: context.engine.digestBytes })) {
    report.add(file, rule, message);
  }
}

/**
 * `evaluation.json`'s `interface` is a kind the contract declares (`reference`),
 * and each registry entry serves its interface as the kind the contract declares
 * for it: a command entry a `cli` interface, a tool-server entry an `mcp` one
 * and an HTTP entry an `api` one. An entry of another kind would leave the interface's calls denied at
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
    const kind = kindOf(entry);
    if (declared.kind !== kind) {
      report.add(
        MANIFEST_NAME,
        'registry',
        `registry[${index}] serves interface ${JSON.stringify(entry.interfaceId)} as ${kind}, and ${CONTRACT_NAME} declares it ${JSON.stringify(declared.kind)}; ${{ mcp: 'a tool-server', api: 'an HTTP', cli: 'a command' }[kind]} entry serves ${kind} calls only`,
      );
    }
  }
}

/** Principal bindings must resolve to declared contract principals and the operation's registry interface. */
function checkPrincipalMappings(report, evaluation, registry, contract) {
  const mappings = evaluation?.principalMappings;
  for (const problem of principalMappingProblems(mappings, registry)) report.add(MANIFEST_NAME, 'principal-mapping', problem);
  if (!contract || typeof contract !== 'object') return;
  const declaredPrincipals =
    contract.testData?.principals !== null &&
    typeof contract.testData?.principals === 'object' &&
    !Array.isArray(contract.testData.principals)
      ? new Set(Object.keys(contract.testData.principals))
      : new Set();
  for (const principal of Object.keys(mappings ?? {})) {
    if (!declaredPrincipals.has(principal)) {
      report.add(
        MANIFEST_NAME,
        'principal-mapping',
        `principalMappings.${principal} names a principal the contract's testData.principals does not declare`,
      );
    }
  }
  const interfaces = Array.isArray(contract.permittedInterfaces) ? contract.permittedInterfaces : [];
  const operations = new Map(
    interfaces.flatMap((iface) =>
      Array.isArray(iface?.operations)
        ? iface.operations.map((operation) => [JSON.stringify([iface.logicalId, operation.operationId]), iface])
        : [],
    ),
  );
  for (const [stepIndex, step] of Array.isArray(contract.interactionPlan) ? contract.interactionPlan.entries() : []) {
    const iface = operations.get(JSON.stringify([step?.interfaceId, step?.operationId]));
    if (iface === undefined) continue;
    for (const [channel, values] of Object.entries(step?.inputBinding ?? {})) {
      if (values === null || typeof values !== 'object') continue;
      for (const [key, binding] of Object.entries(values)) {
        if (typeof binding?.principal !== 'string') continue;
        const mapping = mappings?.[binding.principal];
        if (mapping === undefined) {
          report.add(
            MANIFEST_NAME,
            'principal-mapping',
            `interactionPlan[${stepIndex}].inputBinding.${channel}.${key} names principal ${JSON.stringify(binding.principal)} with no principalMappings rule`,
          );
        } else if (mapping.interfaceId !== iface.logicalId) {
          report.add(
            MANIFEST_NAME,
            'principal-mapping',
            `interactionPlan[${stepIndex}].inputBinding.${channel}.${key} maps principal ${JSON.stringify(binding.principal)} to interface ${JSON.stringify(mapping.interfaceId)}, while operation ${JSON.stringify(step.operationId)} uses ${JSON.stringify(iface.logicalId)}`,
          );
        }
        if (!declaredPrincipals.has(binding.principal)) {
          report.add(
            MANIFEST_NAME,
            'principal-mapping',
            `interactionPlan[${stepIndex}].inputBinding.${channel}.${key} names principal ${JSON.stringify(binding.principal)}, which testData.principals does not declare`,
          );
        }
      }
    }
  }
}

/**
 * The evaluation's own HTTP port, which every `api` call goes through (AD-4):
 * when the registry declares an HTTP target, `adapter/http-probe-port.mjs`
 * must be a regular file in a real `adapter/` directory, so the runtime starts
 * the file the evaluation holds and never one a link names. Whether the file
 * hands the port to TeA's host is the runtime's to hold when it starts it
 * (`preflight` and `run` exit 10), since starting it runs the adopter's code.
 */
function checkHttpPort(report, folder, registry) {
  if (!Array.isArray(registry) || !registry.some((entry) => kindOf(entry) === 'api')) return;
  const stat = (relative) => {
    try {
      return fs.lstatSync(path.join(folder, ...relative.split('/')));
    } catch {
      return null;
    }
  };
  const directory = stat('adapter');
  const file = stat(HTTP_PORT_MODULE);
  if (directory === null || file === null) {
    report.add(
      HTTP_PORT_MODULE,
      'adapter',
      `the registry declares an HTTP target and ${HTTP_PORT_MODULE} is absent; render it from the Evaluate skill's template`,
    );
  } else if (!directory.isDirectory() || !file.isFile()) {
    report.add(
      HTTP_PORT_MODULE,
      'adapter',
      `${directory.isDirectory() ? HTTP_PORT_MODULE : 'adapter'} is not a regular ${directory.isDirectory() ? 'file' : 'directory'}, so the runtime does not start the port through it`,
    );
  }
}

/** `ci/evaluation-ci-plan.json`, when the evaluation has one, held to the plan schema and its placement rules (Story 2.2). */
function checkCiPlan(report, folder, options) {
  const read = readPlan(folder, options);
  if (read.absent) return;
  for (const found of read.findings) report.add(found.file, found.rule, found.message);
}

function schemaVersionMessage(version) {
  return (
    `evaluation.json schemaVersion ${JSON.stringify(version ?? null)} is not known to the installed TeA ` +
    `(${TEA_MANIFEST.name} ${TEA_MANIFEST.version}), which knows schemaVersion ${KNOWN_EVALUATION_SCHEMA_VERSIONS.join(', ')}; ` +
    (Number.isInteger(version) && version < Math.min(...KNOWN_EVALUATION_SCHEMA_VERSIONS)
      ? 'migrate the file: nest operationPhases by interface and then operation ({ interfaceId: { operationId: phase } }) and set schemaVersion 2'
      : 'install the TeA release that introduced this version, or later')
  );
}

/**
 * The declared statement must be the committed file whose exact bytes the manifest digests, and the contract's
 * `sourceSpecDigest` (stamped by the contract stage) must be that same digest: contract-source freshness
 * (Story 2.2). Every evaluation carries a statement, so a missing declaration is a finding too.
 */
function checkRequirements(report, folder, evaluation, contract, engine) {
  const statement = evaluation.requirements;
  if (statement === undefined) {
    report.add(
      MANIFEST_NAME,
      'requirements',
      "evaluation.json declares no requirements statement; commit requirements.md and record it as requirements: { path, digest }, so the contract's sourceSpecDigest has a statement to be held to",
    );
    return;
  }
  // The schema reports malformed values. Never resolve a path it has not accepted.
  if (statement?.path !== 'requirements.md' || typeof statement.digest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(statement.digest))
    return;
  const file = path.join(folder, statement.path);
  let bytes;
  let descriptor;
  try {
    if (!fs.lstatSync(file).isFile()) {
      report.add(statement.path, 'requirements', `${statement.path} is not a regular file held by the evaluation folder`);
      return;
    }
    // Nonblocking open keeps a FIFO swapped in after lstat from hanging check.
    descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0) | (fs.constants.O_NOFOLLOW ?? 0));
    if (!fs.fstatSync(descriptor).isFile()) {
      report.add(statement.path, 'requirements', `${statement.path} is not a regular file held by the evaluation folder`);
      return;
    }
    bytes = fs.readFileSync(descriptor);
  } catch (error) {
    report.add(
      statement.path,
      'requirements',
      `${statement.path} cannot be read from the evaluation folder (${error.code ?? error.message})`,
    );
    return;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  const actual = engine.digestBytes(bytes);
  if (actual !== statement.digest) {
    report.add(
      statement.path,
      'requirements',
      `evaluation.json records digest ${statement.digest}; ${statement.path} digests to ${actual}`,
    );
  }
  // A contract that failed to parse is reported where the contract is checked; one that parses and carries no
  // `sourceSpecDigest`, or a null one, is held to the statement like any other value.
  if (contract !== undefined && contract.sourceSpecDigest !== actual) {
    report.add(
      CONTRACT_NAME,
      'requirements',
      `sourceSpecDigest ${JSON.stringify(contract.sourceSpecDigest ?? null)} is not the digest of ${statement.path}, ${actual}: the requirements changed after the contract was authored, so author the contract against the committed statement again`,
    );
  }
}

/**
 * An operation ID is scoped to its interface, so `operationPhases` classifies each interface-operation pair as
 * `{ interfaceId: { operationId: phase } }`. The map covers exactly the pairs the contract declares.
 */
function checkOperationPhases(report, evaluation, contract) {
  if (!contract || !Array.isArray(contract.permittedInterfaces)) return;
  const phases = evaluation.operationPhases === undefined ? {} : evaluation.operationPhases;
  if (!phases || typeof phases !== 'object' || Array.isArray(phases)) return;
  const declared = new Map();
  for (const iface of contract.permittedInterfaces) {
    if (!iface || !Array.isArray(iface.operations) || typeof iface.logicalId !== 'string') continue;
    const operations = declared.get(iface.logicalId) ?? new Set();
    declared.set(iface.logicalId, operations);
    for (const operation of iface.operations) {
      const id = operation?.operationId;
      if (typeof id !== 'string') continue;
      operations.add(id);
      if (!Object.hasOwn(phases, iface.logicalId) || !isPlainObject(phases[iface.logicalId]) || !Object.hasOwn(phases[iface.logicalId], id))
        report.add(MANIFEST_NAME, 'operation-phases', `contract operation ${id} of interface ${iface.logicalId} has no phase`);
    }
  }
  for (const [interfaceId, byOperation] of Object.entries(phases)) {
    if (!isPlainObject(byOperation)) {
      report.add(MANIFEST_NAME, 'operation-phases', `phase map entry ${interfaceId} must be an object of operation phases`);
      continue;
    }
    for (const [id, phase] of Object.entries(byOperation)) {
      if (!declared.get(interfaceId)?.has(id))
        report.add(
          MANIFEST_NAME,
          'operation-phases',
          `phase names operation ${id} of interface ${interfaceId}, which the contract does not declare`,
        );
      if (phase !== 'process' && phase !== 'outcome')
        report.add(
          MANIFEST_NAME,
          'operation-phases',
          `operation ${id} of interface ${interfaceId} has unknown phase ${JSON.stringify(phase)}`,
        );
    }
  }
}

/**
 * Every finding in the evaluation folder.
 *
 * @param {string} folder
 * @param {object} [options]
 * @param {NodeJS.Platform} [options.platform] the platform the evaluation is held to
 * @param {NodeJS.ProcessEnv} [options.env] the environment the engine stage runs in, so `check` uses the engine the caller's own compile uses
 * @param {string} [options.partition] the partition a run is about to execute. A `development` run neither opens the held-out plan
 *   nor hashes it for the corpus index (Story 1.51), so the plan's own findings are those of `check` and of a held-out or both run.
 * @param {string[]} [options.scratch] the caller's list of directories it removes however it ends, a signal included, which holds the directory the engine's compile stage works in
 * @returns {Promise<Array<{ file: string, rule: string, message: string }>>}
 */
async function checkEvaluation(folder, { platform = process.platform, env = process.env, partition, scratch } = {}) {
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
  for (const problem of registry === undefined
    ? []
    : [...repeatedPairs(registry), ...sharedInterfaces(registry), ...sharedTargetSystemPaths(registry)]) {
    report.add(MANIFEST_NAME, 'registry', problem);
  }
  for (const problem of await mcpRegistryProblems(registry)) report.add(MANIFEST_NAME, 'registry', problem);
  for (const problem of await apiRegistryProblems(registry)) report.add(MANIFEST_NAME, 'registry', problem);
  for (const problem of await egressRegistryProblems(registry)) report.add(MANIFEST_NAME, 'registry', problem);
  const provision = Array.isArray(evaluation.workspace?.provision)
    ? evaluation.workspace.provision.filter((entry) => typeof entry === 'string' && entry.length > 0)
    : [];

  const skillRoot =
    typeof evaluation.launch?.skillRoot === 'string' && evaluation.launch.skillRoot.length > 0 ? evaluation.launch.skillRoot : undefined;

  const behaviors = checkContract(report, folder, context);
  context.contract = contractFor(folder);
  // One compile serves both refusals `check` quotes: a repeated interface identifier (Story 1.102) and a report operation's collision (Stories 1.75, 1.77). It runs only when a refusal is possible and at most once: a contract of two or more interfaces can repeat an identifier, and a probe that names a report can collide.
  let refusals;
  const compiled = () => (refusals ??= compileRefusals(path.join(folder, CONTRACT_NAME), env, scratch));
  if (Array.isArray(context.contract?.permittedInterfaces) && context.contract.permittedInterfaces.length >= 2) {
    checkInterfaceRepeat(report, (await compiled()).interfaceRepeat);
  }
  checkRequirements(report, folder, evaluation, context.contract, context.engine);
  checkOperationPhases(report, evaluation, context.contract);
  checkRegistryKinds(report, evaluation, registry, context.contract);
  checkPrincipalMappings(report, evaluation, registry, context.contract);
  checkHttpPort(report, folder, registry);
  const mutations = checkMutations(report, folder, context, provision, skillRoot);
  checkSkillRunner(report, evaluation, context.contract, provision, platform);
  const routes = await checkProbes(report, folder, context, behaviors, mutations, registry, compiled, evaluation);
  checkHeldOut(report, folder, evaluation);
  const openPlan = partition !== 'development';
  const heldOutPlan = checkPartitionPlan(report, folder, evaluation, context, { openPlan });
  // The answers a gameability probe gives the held-out plan's steps sit beside the plan, so a check that opens a sound plan reads them
  // and a development check never does (Story 1.109).
  if (heldOutPlan !== undefined) checkHeldOutAnswers(report, folder, context, registry, heldOutPlan);
  // The rubrics the evaluation judges are those of every partition (Story 1.105): `contract.json`'s and the held-out plan's. The
  // plan is known only when `checkPartitionPlan` returned it (a development run does not open it, and one that is unreadable or
  // has a finding is not returned), and then the both view is built over it. Without it `check` holds the rubrics it can see
  // and leaves the rest to the partition that owns them, which is also what a contract that fails its own schema gets.
  const rubricContract =
    heldOutPlan === undefined
      ? context.contract
      : contractView({ contractBytes: Buffer.from(JSON.stringify(context.contract)), evaluation, heldOutPlan, partition: 'both' }).contract;
  const partial = evaluation.partitionPlan !== undefined && rubricContract === context.contract;
  // The both view lists `contract.json`'s rubrics first, so a rubric past them is the plan's, and the plan's text stays out of a
  // finding. A plan reaches the both view only after its own schema accepted every rubric and criterion ID, so a plan criterion is
  // named by those IDs and no position in the plan is needed.
  const sourceRubrics = Array.isArray(context.contract?.rubrics) ? context.contract.rubrics.length : 0;
  const label = (rubric, rubricIndex, criterion) => (rubricIndex < sourceRubrics ? undefined : `${rubric.id}/${criterion.id}`);
  checkCalibration(report, folder, evaluation, rubricContract, context.engine, { partial, label });
  const policy = checkScoringPolicy(report, folder, context, routes);
  checkArmsAndTrials(report, evaluation, routes, policy);
  checkEvaluatorConditions(report, folder, context, registry);
  let conditions;
  try {
    conditions = readJsonFile(path.join(folder, ...CONDITIONS_NAME.split('/')));
  } catch {
    conditions = undefined;
  }
  checkJudge(report, evaluation, rubricContract, conditions, { partial });
  checkEvaluator(report, folder, evaluation, context.contract, conditions, context.engine);
  checkQualificationEvidence(report, folder, context);
  checkBaselineDigests(report, folder, context);
  // The rubric rule reads the contract `check` already derived, so a development run leaves the held-out plan unopened.
  checkCiPlan(report, folder, {
    declaresRubric: () => Array.isArray(rubricContract?.rubrics) && rubricContract.rubrics.length > 0,
  });

  try {
    const planFile = evaluation.partitionPlan?.heldOutPlan;
    const stale = await corpusIndexProblem(folder, {
      unread: openPlan || typeof planFile !== 'string' ? [] : [HELD_OUT_DIRECTORY],
    });
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
