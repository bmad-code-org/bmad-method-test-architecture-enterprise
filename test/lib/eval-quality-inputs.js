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
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const AjvModule = require('ajv/dist/2020');

const Ajv = AjvModule.default ?? AjvModule;

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const SCHEMA_ROOT = path.join(PROJECT_ROOT, 'node_modules', 'eval-quality', 'schemas');
const POLICY_PATH = path.join(PROJECT_ROOT, 'test', 'probes', 'scoring-policy.json');

/**
 * The `schemaVersion` each artifact carries.
 *
 * Stated rather than derived, because the published JSON Schemas declare
 * `schemaVersion` as a plain integer and name no accepted value; the package's
 * own readers throw `schema-version-mismatch` on a number they do not read. A
 * bump therefore arrives as a loud fault on the first run after an upgrade, which
 * is where a table like this is supposed to fail.
 */
const SCHEMA_VERSIONS = {
  probe: 3,
  sealedRunRecord: 3,
  scoringPolicy: 2,
  isolationManifest: 1,
  evaluatorConfiguration: 1,
};

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

/** One Ajv instance, built on first use, with each published schema compiled once. */
function validator(kind) {
  if (ajv === undefined) {
    // `strict: false` because the published schemas use `propertyNames` and a
    // `date-time` format Ajv does not carry by default, and neither is a defect
    // in the schema. `allErrors` because a caller fixing a hand-built artifact
    // wants every field named at once.
    ajv = new Ajv({ strict: false, allErrors: true });
  }
  const key = `urn:tea:${kind}`;
  const existing = ajv.getSchema(key);
  if (existing) return existing;
  const file = path.join(SCHEMA_ROOT, `${kind}.schema.json`);
  if (!fs.existsSync(file)) throw new Error(`eval-quality publishes no schema named ${kind}.schema.json`);
  return ajv.compile({ ...JSON.parse(fs.readFileSync(file, 'utf8')), $id: key });
}

/**
 * One artifact against the schema `eval-quality` publishes for it.
 *
 * @param {string} kind The schema basename, for example `probe` or `evidence-artifact`.
 * @param {unknown} value
 * @returns {string[]} Empty when the value conforms.
 */
function validateArtifact(kind, value) {
  const check = validator(kind);
  if (check(value)) return [];
  return (check.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message}`);
}

/** TEA's scoring policy, the artifact whose digest enters every scoring version this repository computes. */
function scoringPolicy() {
  return JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
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
    schemaVersion: SCHEMA_VERSIONS.evaluatorConfiguration,
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
    schemaVersion: SCHEMA_VERSIONS.isolationManifest,
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
 * The ten channels are total in the schema, so a caller naming only what it saw
 * would fail to parse. `stdout`, `stderr` and each artifact are tagged bodies,
 * the same three tags `createCommandLineAdapter` returns, so an observation built
 * here and one read off the port have one shape.
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
  invalidReason = null,
}) {
  return {
    schemaVersion: SCHEMA_VERSIONS.sealedRunRecord,
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
    invalidReason,
  };
}

module.exports = {
  FORBIDDEN_INPUTS,
  SCHEMA_VERSIONS,
  evaluatorConfiguration,
  isolationManifest,
  loadEvalQuality,
  probeObservation,
  recordObservation,
  scoringPolicy,
  sealedRunRecord,
  validateArtifact,
};
