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
 * - `provisioned-target`: a mutation's `targetArtifact` sits inside a provisioned directory.
 * - `web-interface`: the contract declares an interface of kind `web`.
 * - `written-file-signature`: a defect signature addresses a file the target wrote.
 * - `oracle-count`: a behavior a defect or gameability probe discharges does not declare exactly one oracle.
 * - `id-pattern`: a probe, defect, behavior, oracle or mutation ID is off its pattern.
 * - `qualification-digest`: a `baseline/qualification/` reference's digest does not match the file.
 * - `clean-control`: a clean control is not `zero-action` with `expectedClean: true` and no defects.
 *
 * Beside them, `contract.json` must exist (`missing-file`), every indexed
 * entry must be a regular file or directory (`corpus-file`), and a file must
 * parse (`json`), match its schema (`schema` for the runtime's own schemas,
 * `engine-schema` for eval-quality's), be named for its ID (`file-name`), and
 * name only behaviors and mutations that exist (`reference`).
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const AjvModule = require('ajv/dist/2020');

const { loadEngine, engineSchemaPath } = require('./engine');
const { MANIFEST_NAME } = require('./folder');
const { CorpusIndexError, INDEX_NAME, corpusIndexProblem } = require('./corpus-index');

const Ajv = AjvModule.default ?? AjvModule;

const KNOWN_EVALUATION_SCHEMA_VERSIONS = [1];
const CONTRACT_NAME = 'contract.json';
const QUALIFICATION_PREFIX = 'baseline/qualification/';
const MUTATION_ID_PATTERN = '^M-[0-9]{3,}$';
const PROBE_FILE = /^(.+)\.probe\.json$/;
const MUTATION_FILE = /^(.+)\.mutation\.json$/;
const WRITTEN_FILE_POINTER = /^\/interactions\/[^/]+\/artifact(?:\/|$)/;
const RFC3339_DATE_TIME = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/;

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
  ajv.addFormat('date-time', { type: 'string', validate: (value) => RFC3339_DATE_TIME.test(value) && !Number.isNaN(Date.parse(value)) });
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
      contract: ajv.compile(contractSchema),
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

function listDirectory(folder, name) {
  try {
    return fs
      .readdirSync(path.join(folder, name), { withFileTypes: true })
      .map((entry) => ({ name: entry.name, isFile: entry.isFile() }))
      .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
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
  for (const oracle of Array.isArray(contract?.oracles) ? contract.oracles : []) {
    checkId(report, CONTRACT_NAME, context.patterns.oracle, oracle?.id, 'oracle ID');
  }
  return new Map(behaviors.filter((behavior) => typeof behavior?.id === 'string').map((behavior) => [behavior.id, behavior]));
}

function checkMutations(report, folder, context, provision) {
  const known = new Set();
  for (const entry of listDirectory(folder, 'mutations')) {
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
      for (const directory of provision) {
        const provisioned = path.posix.normalize(directory).replace(/\/+$/, '');
        if (target === provisioned || target.startsWith(`${provisioned}/`)) {
          report.add(
            relative,
            'provisioned-target',
            `targetArtifact ${JSON.stringify(mutation.targetArtifact)} is inside the provisioned directory ${JSON.stringify(directory)}, which the disposable copy links read-only`,
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

function checkProbe(report, relative, probe, context, behaviors, mutations) {
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

function checkProbes(report, folder, context, behaviors, mutations) {
  for (const entry of listDirectory(folder, 'probes')) {
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
    checkProbe(report, relative, probe, context, behaviors, mutations);
  }
}

function jsonFilesUnder(folder, relativeDirectory) {
  const found = [];
  for (const entry of listDirectory(folder, relativeDirectory)) {
    const relative = `${relativeDirectory}/${entry.name}`;
    if (entry.isFile) {
      if (entry.name.endsWith('.json')) found.push(relative);
    } else if (fs.statSync(path.join(folder, relative)).isDirectory()) {
      found.push(...jsonFilesUnder(folder, relative));
    }
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
  for (const relative of jsonFilesUnder(folder, 'baseline')) {
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
  if (!KNOWN_EVALUATION_SCHEMA_VERSIONS.includes(evaluation?.schemaVersion)) {
    report.add(MANIFEST_NAME, 'schema-version', schemaVersionMessage(evaluation?.schemaVersion));
    return report.findings;
  }

  const context = await buildContext();
  validateInto(report, MANIFEST_NAME, 'schema', context.validate.evaluation, evaluation);
  const provision = Array.isArray(evaluation.workspace?.provision)
    ? evaluation.workspace.provision.filter((entry) => typeof entry === 'string' && entry.length > 0)
    : [];

  const behaviors = checkContract(report, folder, context);
  const mutations = checkMutations(report, folder, context, provision);
  checkProbes(report, folder, context, behaviors, mutations);
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
