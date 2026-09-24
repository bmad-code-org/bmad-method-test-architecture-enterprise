/**
 * The eval-quality artifacts a run hands to the scoring half, and the one place
 * their shapes are decided.
 *
 * `eval-quality score` takes a Sealed Run Record, a Probe, a Pre-flight Verdict,
 * a Scoring Policy, an Evaluator Configuration and an Isolation Manifest. The
 * record, the configuration and the manifest are pure description of a run the
 * runtime already performed, so they are assembled here from what a caller
 * already holds. Two callers producing two shapes for one artifact is the drift
 * this module exists to prevent, so TeA's own harness and every adopter run build
 * them here (AD-5, AD-7).
 *
 * Every builder is total. Each artifact's schema is strict, every field is
 * required, and an omitted key is a parse failure at the boundary, so each builder fills every key and states what it put there.
 * Every `schemaVersion` written here is the installed engine's own, read from the
 * constant it exports for that kind.
 *
 * `createArtifactValidator` checks a value against the schema eval-quality
 * publishes for it, which is the interchange guarantee (AD-7: every artifact is validated against the published
 * schemas before it reaches the CLI).
 */

'use strict';

const fs = require('node:fs');

const AjvModule = require('ajv/dist/2020');

const { SCHEMA_VERSIONS, engineSchemaPath, expectedSchemaVersion, schemaVersionProblems } = require('./engine');
const { addFormats } = require('./formats');

const Ajv = AjvModule.default ?? AjvModule;

/** The seven forbidden inputs an isolation manifest accounts for by name. */
const FORBIDDEN_INPUTS = [
  'original-spec',
  'source-code',
  'repository',
  'builder-transcript',
  'implementation-logs',
  'comparator-results',
  'human-labels',
];

/**
 * The default schema reader: the published file, read from disk.
 *
 * @param {string} file
 * @returns {Promise<{present: true, value: unknown}|{present: false}>}
 */
async function readJsonFromDisk(file) {
  let text;
  try {
    text = await fs.promises.readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { present: false };
    throw error;
  }
  return { present: true, value: JSON.parse(text) };
}

/**
 * A validator over eval-quality's published schemas.
 *
 * `readJson` is how a schema file is read, so a caller that routes its reads
 * through a file-system port of its own passes that port's reader here; the
 * runtime's default reads the file from disk.
 *
 * One Ajv instance per validator, with each published schema compiled once. The
 * promise is memoized, so two concurrent first
 * calls for one kind share one read and one compile; a second compile of the
 * same `$id` would throw.
 *
 * @param {object} [options]
 * @param {(file: string) => Promise<{present: boolean, value?: unknown}>} [options.readJson]
 * @returns {(kind: string, value: unknown) => Promise<string[]>}
 */
function createArtifactValidator({ readJson = readJsonFromDisk } = {}) {
  // `strict: false` because the published schemas use `propertyNames` and
  // keywords without a sibling `type`, which is no schema defect. The one
  // format they use, `date-time`, is registered so it is checked; unregistered,
  // Ajv would warn and accept any string. `allErrors` because a caller fixing a
  // hand-built artifact wants every field named at once.
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  const validators = new Map();

  async function compileValidator(kind) {
    const read = await readJson(engineSchemaPath(`${kind}.schema.json`));
    if (!read.present) throw new Error(`eval-quality publishes no schema named ${kind}.schema.json`);
    return ajv.compile({ ...read.value, $id: `urn:tea:${kind}` });
  }

  function validator(kind) {
    let pending = validators.get(kind);
    if (pending === undefined) {
      pending = compileValidator(kind);
      validators.set(kind, pending);
    }
    return pending;
  }

  /**
   * One artifact against the schema eval-quality publishes for it and, for a
   * kind the engine's schema-version table covers, against the `schemaVersion`
   * the installed engine reads for it.
   *
   * The two checks test different things: a stamp one off from the engine's
   * constant is a legal integer, so Ajv alone passes it, and Ajv catching a
   * missing field says nothing about the stamp. A version problem is reported
   * first, because a caller fixing a hand-built artifact reads the stamp first.
   *
   * @param {string} kind The schema basename, for example `probe` or `evidence-artifact`.
   * @param {unknown} value
   * @returns {Promise<string[]>} Empty when the value conforms.
   */
  async function validateArtifact(kind, value) {
    const versionProblems = Object.hasOwn(SCHEMA_VERSIONS, kind) ? schemaVersionProblems(kind, value) : [];
    const check = await validator(kind);
    const ajvProblems = check(value) ? [] : (check.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message}`);
    return [...versionProblems, ...ajvProblems];
  }

  return validateArtifact;
}

/**
 * The evaluator's configuration for one measured run.
 *
 * `evaluatorIdentity` names the harness that produced the record: an
 * opaque suite identifier, with no person or account in it. `modelSnapshot` is the resolved model where a model ran;
 * a run that uses none records the literal `none`.
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
 * An absent manifest makes a run Invalid, so one is always supplied. It declares
 * only what the probe port enforces: the run mounted the workspace it was given
 * and called the tools its authorization permits. Network access is not
 * sandboxed, so `networkAllowlist` and `observedNetworkTargets` are both empty
 * and the manifest claims nothing it cannot observe. Each forbidden input is
 * accounted for as withheld, with the caller's note saying where the boundary
 * is drawn.
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
 * The call-input channels are total in the schema, so a caller naming only what
 * it saw would fail to parse. A spawned command has no HTTP channels and makes
 * no tool call, so those are stated as null. `stdout`, `stderr` and each
 * artifact are the tagged bodies `createCommandLineAdapter` returns, so an
 * observation built here and one read off the port have one shape.
 *
 * `provenance` defaults to `evaluator-chosen`, because eval-quality's probe
 * witness matching only considers evaluator-chosen observations; a caller
 * recording an observation the runtime drove from the interaction plan states
 * `baseline`.
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
 * One command observation in the shape the pre-flight port returns: the
 * correlation identifiers the plan minted and what came back, nothing about
 * what was sent.
 */
function probeObservation({ legId, interfaceId, operationId, exitCode, stdout, stderr = { kind: 'text', value: '' }, artifacts = {} }) {
  return { probeId: legId, interfaceId, operationId, kind: 'cli', exitCode, stdout, stderr, artifacts };
}

/**
 * A sealed run record for one probe and one trial.
 *
 * One record per probe: `score` scores exactly one probe per call, and a defect
 * finding citing another probe is dangling, which invalidates the run. `mode` is
 * always `contract-scoring` (AD-7): the runtime measures the contract, and
 * `production` would promote the evaluator's own recommendation to a rung.
 * `evaluatorRecommendation` is held to eval-quality's vocabulary by the published
 * schema every record is validated against.
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
  createArtifactValidator,
  evaluatorConfiguration,
  isolationManifest,
  probeObservation,
  recordObservation,
  sealedRunRecord,
};
