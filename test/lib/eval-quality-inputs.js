/**
 * The `eval-quality` artifacts TEA hands to the scoring half, and the one place
 * their shapes are decided.
 *
 * TEA reached `eval-quality` through `compile` and through the environment-probe
 * port, and stopped there. `runScore` is the package's headline claim, and it
 * takes six inputs TEA had never built: a Sealed Run Record, a Probe, a
 * Pre-flight Verdict, a Scoring Policy, an Evaluator Configuration, and an
 * Isolation Manifest. Five of the six are pure description of a run this
 * repository already performs, so they are assembled here from what a harness
 * already holds rather than authored per caller. Two callers build them, and two
 * callers producing two shapes for one artifact is the drift `test/contracts/`
 * spent a whole section on.
 *
 * Everything here is deliberately total. Each artifact's schema is strict, every
 * field is required, and an omitted key is a parse failure at the boundary rather
 * than a defaulted value, so each builder fills every key and states what it put
 * there.
 *
 * `validateArtifact` checks a value against the schema `eval-quality` publishes
 * for it, which is the interchange guarantee rather than the package's own
 * internal parse. Both run: the package parses on the way in and on the way out,
 * and this is the independent reading of the same shape.
 *
 * WHAT REACHES `fs` DIRECTLY, AND WHY
 *
 * Nothing. Both files this module reads, the published schema behind `validator`
 * and the scoring policy behind `scoringPolicy`, go through
 * `test/lib/file-system-port.js`, which is why both and `validateArtifact` above
 * them are asynchronous. The six schema-version constants below are the one
 * exception: they come from the installed npm package through `require`, never
 * from a file this module reads itself, so they stay synchronous and the port
 * plays no part in them.
 *
 * Every `schemaVersion` written here is the installed package's own, read from
 * the constant it exports for that kind. `SCHEMA_VERSIONS` is the one table of
 * the versions TEA writes, and `npm run test:schema-versions` holds every stamp
 * TEA commits, in source and on disk, to it.
 */

'use strict';

const path = require('node:path');

const AjvModule = require('ajv/dist/2020');

const { readJson } = require('./file-system-port');

// The version constants come in through `require`. `require(esm)` is stable on
// every Node the engines field admits (>= 22.20.0), and the loader hands back the
// same module instance `loadEvalQuality` imports, so the two readings cannot
// disagree. This is a synchronous read of the installed package, never of a file
// this module owns, so it takes no part in the file-system port above.
//
// The require is wrapped rather than left to throw, because this module is
// required by callers that do not touch a schema version at all, among them
// `test/test-contracts.js`, which resolves `eval-quality` itself and prints a
// named skip for a tree installed with `--omit=dev`. An unguarded require here
// reached `eval-quality` before that skip ever ran, turning a documented,
// exit-0 skip into an uncaught `MODULE_NOT_FOUND` crash; reproduced by removing
// `node_modules/eval-quality` and running `node test/test-contracts.js`. A
// missing or broken package is instead reported the moment a caller actually
// asks `expectedSchemaVersion` for a number, in `packageVersions` below.
let packageVersions;
try {
  packageVersions = require('eval-quality');
} catch {
  packageVersions = null;
}

const Ajv = AjvModule.default ?? AjvModule;

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const SCHEMA_ROOT = path.join(PROJECT_ROOT, 'node_modules', 'eval-quality', 'schemas');
const POLICY_PATH = path.join(PROJECT_ROOT, 'test', 'probes', 'scoring-policy.json');

/**
 * The `schemaVersion` of each artifact TEA writes, keyed by the basename of the
 * schema `eval-quality` publishes for it, which is the key `validateArtifact`
 * takes. Every value is the constant the installed package exports for that
 * kind. Nothing here is stated.
 *
 * Six kinds eval-quality publishes a schema for and TEA writes, and each has a
 * reader. The three this file builds stamp through `expectedSchemaVersion`.
 * `tools/generate-probes.js` and `tools/generate-contracts.js` read the probe
 * and contract versions the same way, so the bytes they commit carry the
 * package's number. The scoring policy at `test/probes/scoring-policy.json` is
 * hand-authored, so `schemaVersionProblems` is what holds it. A kind TEA only
 * receives has no entry until something reads one, which is Story 2.7's wiring
 * beside the Ajv pass; an entry with no reader is a number nothing holds. TEA
 * also stamps `suite-result` and `run-summary`, against its own
 * `test/schema/eval-result.schema.json`; those are not eval-quality's to
 * publish and carry no entry here.
 *
 * It was a literal table, and it drifted the way a copied number does: on the
 * upgrade to 3.0.0 its record entry read 3 against a parser that reads 6, and
 * nothing said so until a `schema-version-mismatch` fault surfaced inside a
 * scoring stage. `npm run test:schema-versions` now holds every stamp TEA
 * writes to this table, and this table to the package.
 *
 * A value is `undefined` when `packageVersions` is `null` (the package could
 * not be loaded) or when the installed package renamed the constant; either
 * way `expectedSchemaVersion` refuses to hand the value back uninspected.
 */
const SCHEMA_VERSIONS = Object.freeze({
  'sealed-run-record': packageVersions?.SEALED_RUN_RECORD_SCHEMA_VERSION,
  'isolation-manifest': packageVersions?.ISOLATION_MANIFEST_SCHEMA_VERSION,
  'evaluator-configuration': packageVersions?.EVALUATOR_CONFIGURATION_SCHEMA_VERSION,
  probe: packageVersions?.PROBE_SCHEMA_VERSION,
  'eval-contract': packageVersions?.EVAL_CONTRACT_SCHEMA_VERSION,
  'scoring-policy': packageVersions?.SCORING_POLICY_SCHEMA_VERSION,
});

/**
 * The published kinds that carry no `schemaVersion` by design, each with the
 * reason, so a caller asking for one is told why there is none.
 */
const UNSTAMPED_KINDS = Object.freeze({
  'artifact-reference':
    'it is a reference shape embedded inside other artifacts and never crosses the package boundary alone, so the package publishes it with no schemaVersion and no lineage',
});

/**
 * The `schemaVersion` the installed package reads for one kind TEA writes.
 *
 * Throws on a kind with no stamp by design and on a kind TEA does not write,
 * because both are caller bugs: the first would stamp a field the schema
 * rejects, and the second would read `undefined` and stamp that. Also throws
 * when the package could not be loaded or renamed the constant, rather than
 * handing back `undefined`: a caller stamping with `undefined` writes valid
 * JSON with the field missing, since `JSON.stringify` drops an `undefined`
 * value, which is a worse failure than this one and a silent one.
 *
 * @param {string} kind The published schema basename, for example `probe`.
 * @returns {number}
 */
function expectedSchemaVersion(kind) {
  if (Object.hasOwn(UNSTAMPED_KINDS, kind)) throw new TypeError(`${kind} carries no schemaVersion by design: ${UNSTAMPED_KINDS[kind]}`);
  if (!Object.hasOwn(SCHEMA_VERSIONS, kind)) {
    throw new TypeError(`no schemaVersion is recorded for ${kind}; TEA writes ${Object.keys(SCHEMA_VERSIONS).join(', ')}`);
  }
  const value = SCHEMA_VERSIONS[kind];
  if (!Number.isInteger(value) || value <= 0) {
    if (packageVersions === null) throw new TypeError(`eval-quality could not be loaded, so no schemaVersion is available for ${kind}`);
    throw new TypeError(`eval-quality exports no positive integer schemaVersion constant for ${kind}; read ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * One artifact's stamp against the version the installed package reads for its
 * kind.
 *
 * The message mirrors the package's own `schema-version-mismatch` fault, which
 * reads `carries "schemaVersion" X where this build reads Y`, so a reader who has
 * seen one has seen both. A wrong stamp is reported, because it is a finding
 * about the artifact and the caller decides what a finding costs. A kind the
 * table does not cover still throws, because that is a bug in the caller.
 *
 * @param {string} kind The published schema basename.
 * @param {unknown} value
 * @returns {string[]} Empty when the stamp agrees.
 */
function schemaVersionProblems(kind, value) {
  const expected = expectedSchemaVersion(kind);
  const found = value !== null && typeof value === 'object' ? value.schemaVersion : undefined;
  if (found === expected) return [];
  if (found === undefined) return [`${kind} carries no "schemaVersion" where this build reads ${expected}`];
  return [`${kind} carries "schemaVersion" ${JSON.stringify(found)} where this build reads ${expected}`];
}

/** The seven forbidden inputs AD-16 makes an isolation manifest account for by name. */
const FORBIDDEN_INPUTS = [
  'original-spec',
  'source-code',
  'repository',
  'builder-transcript',
  'implementation-logs',
  'comparator-results',
  'human-labels',
];

/** `eval-quality` is ESM and this repository is CommonJS, so every entry point through it is asynchronous. */
async function loadEvalQuality() {
  return import('eval-quality');
}

let ajv;
const validators = new Map();

/** One compiled check per schema, read and compiled once. */
async function compileValidator(kind) {
  if (ajv === undefined) {
    // `strict: false` because the published schemas use `propertyNames` and a
    // `date-time` format Ajv does not carry by default, and neither is a defect
    // in the schema. `allErrors` because a caller fixing a hand-built artifact
    // wants every field named at once.
    ajv = new Ajv({ strict: false, allErrors: true });
  }
  // The existence check that used to guard this read is gone: the read answers
  // absence itself, and the message it raises is the same one.
  const read = await readJson(path.join(SCHEMA_ROOT, `${kind}.schema.json`));
  if (!read.present) throw new Error(`eval-quality publishes no schema named ${kind}.schema.json`);
  return ajv.compile({ ...read.value, $id: `urn:tea:${kind}` });
}

/**
 * One Ajv instance, built on first use, with each published schema compiled once.
 *
 * The promise is memoized rather than the compiled check, for the reason
 * `test/lib/file-system-port.js` memoizes the adapter's: `ajv.getSchema` used to
 * be the memo, and once a read sits between that lookup and the `compile`, two
 * concurrent first calls for one kind both miss it and the second `compile`
 * throws on a `$id` that already exists.
 *
 * @param {string} kind
 * @returns {Promise<(value: unknown) => boolean>}
 */
function validator(kind) {
  let pending = validators.get(kind);
  if (pending === undefined) {
    pending = compileValidator(kind);
    validators.set(kind, pending);
  }
  return pending;
}

/**
 * One artifact against the schema `eval-quality` publishes for it.
 *
 * @param {string} kind The schema basename, for example `probe` or `evidence-artifact`.
 * @param {unknown} value
 * @returns {Promise<string[]>} Empty when the value conforms.
 */
async function validateArtifact(kind, value) {
  const check = await validator(kind);
  if (check(value)) return [];
  return (check.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message}`);
}

/**
 * TEA's scoring policy, the artifact whose digest enters every scoring version
 * this repository computes.
 *
 * Absence is named rather than left to surface as a null the caller dereferences:
 * a repository with no scoring policy cannot score anything, and the message says
 * which file is missing.
 *
 * @returns {Promise<object>}
 */
async function scoringPolicy() {
  const read = await readJson(POLICY_PATH);
  if (!read.present) throw new Error(`no scoring policy at ${path.relative(PROJECT_ROOT, POLICY_PATH)}`);
  return read.value;
}

/**
 * The evaluator's configuration for one measured run.
 *
 * `evaluatorIdentity` is the harness that produced the record and never a person
 * or an account: AD-18 excludes credentials, real names, and account identifiers
 * from every artifact, and an opaque suite identifier is the strongest thing TEA
 * can honestly put here.
 *
 * `modelSnapshot` is the resolved model where a model ran, and the stored-output
 * label where the evidence is a replay. Those are different runs and a reader
 * comparing two scores has to be able to tell them apart, which is what this
 * field is for.
 */
function evaluatorConfiguration({
  evaluatorIdentity,
  modelSnapshot,
  sealedBriefDigest,
  systemPromptDigest,
  permissionInventory = [],
  toolInventory = [],
  decodingParameters = {},
  budgets,
  seed = null,
}) {
  return {
    schemaVersion: expectedSchemaVersion('evaluator-configuration'),
    parentDigest: null,
    revisionCount: 0,
    sealedBriefDigest,
    evaluatorIdentity,
    modelSnapshot,
    systemPromptDigest,
    decodingParameters,
    toolInventory,
    permissionInventory,
    budgets,
    seed,
    judgeConfiguration: null,
  };
}

/**
 * The isolation manifest for one measured run.
 *
 * An absent manifest is an isolation violation `ingest` records and the verdict
 * ladder invalidates on, so one is always supplied. What it declares is what the
 * probe port actually enforces: the run mounted the workspace it was given,
 * reached whatever the vendor call reached, and called the tools its capability
 * tier permits. TEA does not sandbox network access, so `networkAllowlist` and
 * `observedNetworkTargets` are both empty and the manifest says nothing it cannot
 * observe.
 *
 * `forbiddenInputAccounting` is the one field with a real claim behind it. A
 * fragment-selection or trace run is handed a prompt and a workspace, and the
 * answer key stays in the harness, so each of AD-16's seven inputs is withheld
 * and the note says where the boundary is drawn.
 */
function isolationManifest({
  runId,
  contractId,
  conditionArm,
  modelSnapshot,
  systemPromptDigest,
  contractDigest,
  evaluatorConfigurationDigest,
  workspaceIdentity,
  toolAllowlist = [],
  observedToolCalls = [],
  resourceCeilings,
  actualResourceUse,
  forbiddenInputNote,
  violation = null,
}) {
  return {
    schemaVersion: expectedSchemaVersion('isolation-manifest'),
    parentDigest: null,
    revisionCount: 0,
    runId,
    contractId,
    conditionArm,
    modelSnapshot,
    systemPromptDigest,
    contractDigest,
    evaluatorConfigurationDigest,
    workspaceIdentity,
    allowedMounts: [workspaceIdentity],
    observedMounts: [workspaceIdentity],
    networkAllowlist: [],
    observedNetworkTargets: [],
    toolAllowlist,
    observedToolCalls,
    resourceCeilings,
    actualResourceUse,
    forbiddenInputAccounting: Object.fromEntries(FORBIDDEN_INPUTS.map((input) => [input, { withheld: true, note: forbiddenInputNote }])),
    violation,
  };
}

/**
 * One observation inside a sealed run record.
 *
 * The eleven channels are total in the schema, so a caller naming only what it
 * saw would fail to parse. `arguments` is the ninth call-input channel, added by
 * the record's version 5 bump so what a tool call supplied has somewhere to
 * live. TEA observes spawned commands and never a tool call, so it is stated as
 * null the way the four HTTP channels are.
 *
 * `stdout`, `stderr` and each artifact are tagged bodies, the same three tags
 * `createCommandLineAdapter` returns, so an observation built here and one read
 * off the port have one shape.
 *
 * `provenance` defaults to `evaluator-chosen` because that is what every run this
 * repository measures is: the harness chose the invocation. `matchProbeWitness`
 * reads the field and only considers evaluator-chosen observations, so a
 * `baseline` default would silently make every probe unexercised.
 */
function recordObservation({
  observationId,
  sequence,
  operationId,
  callInputs,
  stdout = { kind: 'absent' },
  stderr = { kind: 'absent' },
  exitCode = null,
  artifacts = {},
  provenance = 'evaluator-chosen',
  principal = null,
}) {
  return {
    observationId,
    sequence,
    operationId,
    provenance,
    principal,
    callInputs: {
      path: null,
      query: null,
      header: null,
      body: null,
      argument: callInputs.argument ?? null,
      option: callInputs.option ?? null,
      environment: callInputs.environment ?? null,
      stdin: callInputs.stdin ?? null,
      arguments: callInputs.arguments ?? null,
    },
    responseBody: null,
    responseHeaders: null,
    responseStatus: null,
    stdout,
    stderr,
    exitCode,
    artifacts,
  };
}

/**
 * One command observation in the shape the pre-flight port returns.
 *
 * `preflightFromObservations` reduces over `ProbeObservation`s, which is a
 * different and thinner shape than the record's own observation: it carries the
 * correlation identifiers the plan minted and what came back, and nothing about
 * what was sent. A caller that has already probed by some other means builds
 * these; a caller driving `runPreflight` gets them from the port.
 */
function probeObservation({ legId, interfaceId, operationId, exitCode, stdout, stderr = { kind: 'text', value: '' }, artifacts = {} }) {
  return { probeId: legId, interfaceId, operationId, kind: 'cli', exitCode, stdout, stderr, artifacts };
}

/**
 * A sealed run record for one probe.
 *
 * One record per probe, and that is forced rather than chosen. `runScore` scores
 * exactly one probe per call, and `mapFindings` buckets any defect finding citing
 * a different probe as `dangling`, which resolves the oracle it cites to
 * `infrastructure-error` and invalidates the run. So a record paired with a probe
 * carries the findings attributed to that probe, and the observations it carries
 * are the ones the contract's oracles read.
 *
 * `evaluatorRecommendation` is a member of the package's own
 * `EVALUATOR_RECOMMENDATIONS`, and it is deliberately not routed through
 * `test/lib/vocabularies.js` the way the verdicts and the qualification codes
 * are. `sealed-run-record.schema.json` declares the field as
 * `$defs/EvaluatorRecommendation`, an enum of PASS, CONCERNS and FAIL, and
 * `validateArtifact('sealed-run-record', ...)` runs over every record this
 * repository builds on every `npm run test:probe-corpus`. The value is already
 * held against the package's own published statement of the vocabulary, by the
 * package's own schema, so a second membership check over it would report
 * nothing the first does not. `test/test-port-totality.js` records the same
 * decision beside the registry it belongs to.
 */
function sealedRunRecord({
  runId,
  conditionArm,
  trialIndex = 1,
  contractDigest,
  sealedBriefDigest,
  evaluatorConfigurationDigest,
  evaluatorRecommendation,
  oracleDispositions,
  findings,
  observations,
  actionsArtifact,
  isolationManifestArtifact,
  resourceUse,
  truncationBound = null,
  reportedIncomplete = false,
}) {
  return {
    schemaVersion: expectedSchemaVersion('sealed-run-record'),
    parentDigest: null,
    revisionCount: 0,
    runId,
    conditionArm,
    // Contract scoring, always. `production` promotes the evaluator's own
    // recommendation to a rung, and TEA is measuring the contract rather than
    // shipping its verdict.
    mode: 'contract-scoring',
    trialIndex,
    contractDigest,
    sealedBriefDigest,
    evaluatorConfigurationDigest,
    evaluatorRecommendation,
    oracleDispositions,
    findings,
    observations,
    judgeResults: [],
    actionsArtifact,
    isolationManifestArtifact,
    resourceUse,
    evidenceDisclosure: { truncationBound, reportedIncomplete },
  };
}

module.exports = {
  FORBIDDEN_INPUTS,
  SCHEMA_VERSIONS,
  evaluatorConfiguration,
  expectedSchemaVersion,
  isolationManifest,
  loadEvalQuality,
  probeObservation,
  recordObservation,
  schemaVersionProblems,
  scoringPolicy,
  sealedRunRecord,
  validateArtifact,
};
