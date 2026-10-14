/**
 * Exploratory candidates: the reader, the canonical writer, the identity and the draft promotion of a record under
 * `discovery/<campaignId>/C-NNN.candidate.json`.
 *
 * A candidate is an edit a person or a generator proposes before any native oracle can demonstrate the behavior it
 * changes. It is evidence for a review. The record sits in `discovery/`, a directory of the evaluation folder that no
 * scored artifact reads: `evaluation.json` and the mutation and probe schemas are closed to it, `tea-evaluate check`
 * refuses a `*.candidate.json` file anywhere else in the folder, the corpus digest covers `corpus/`, `probes/` and
 * `mutations/` only, and no state here is an eval-quality outcome. Promotion produces a draft mutation that goes
 * through check, compile, seal, qualification and scoring like any authored one.
 *
 * Reading trusts nothing the file says about itself. `identity` is recomputed from the fields that define the
 * candidate, with the length-prefixed digest every other harness input uses. A review or an accepted risk names the
 * identity, the determination (disposition and independent evidence) and the observations it rested on, and the reader
 * refuses it once any of them differs from the record. The text is read as strict UTF-8, a repeated key or a lone
 * surrogate is refused, and a file is read only from its own path, `discovery/<campaignId>/<candidateId>.candidate.json`,
 * through no link.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const AjvModule = require('ajv/dist/2020');

const { digest } = require('../digest');
const { addFormats } = require('../formats');

const Ajv = AjvModule.default ?? AjvModule;

const SCHEMA = JSON.parse(fs.readFileSync(path.join(__dirname, 'candidate.schema.json'), 'utf8'));
const MUTATION_SCHEMA_VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schemas', 'mutation.schema.json'), 'utf8'))
  .properties.schemaVersion.const;
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validateSchema = ajv.compile(SCHEMA);

/** The record's format version, read from its schema so the two cannot disagree. */
const CANDIDATE_SCHEMA_VERSION = SCHEMA.properties.schemaVersion.const;
const RECORD_KIND = SCHEMA.properties.recordKind.const;
/** Where candidates sit in the evaluation folder, outside every directory the scored path reads. */
const DISCOVERY_DIRECTORY = 'discovery';
const CANDIDATE_PATH = /^discovery\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(C-[0-9]{3,})\.candidate\.json$/;
const STATES = Object.freeze([...SCHEMA.properties.state.enum]);
const DISPOSITIONS = Object.freeze([...SCHEMA.$defs.disposition.enum]);
const REVIEW_DISPOSITIONS = Object.freeze([...SCHEMA.$defs.reviewDisposition.enum]);

/** A candidate that cannot be read; `problems` lists every reason, each naming the field it found it in. */
class CandidateError extends Error {
  constructor(problems) {
    super(`not a valid exploratory candidate: ${problems.join('; ')}`);
    this.name = 'CandidateError';
    this.problems = problems;
  }
}

/** `value` with every object's keys in code-point order, so equal records serialize to equal bytes. */
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys(value[key])]),
  );
}

/** The canonical bytes of a record's JSON: sorted keys, two-space indent, one trailing newline. */
function canonicalJson(value) {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

/** eval-quality's `digestBytes`: sha256 over the bytes, spelled `sha256:<hex>`. */
function bytesDigest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/**
 * The digest of every field that defines a candidate: what it edits, where, why, against which requirement and from
 * which generator. The state, observations, review and promotion are left out, since they describe what happened to the
 * candidate and change as it moves. Each part is length-prefixed by `digest`, so moving text between two neighbouring
 * fields cannot produce the same identity.
 *
 * @param {object} record a candidate with the fields below
 * @returns {string} `sha256:<hex>`
 */
function candidateIdentity(record) {
  return digest([
    `tea-evaluate-candidate/${CANDIDATE_SCHEMA_VERSION}`,
    record.candidateId,
    record.campaignId,
    record.partition,
    record.generator.name,
    record.generator.version,
    record.generator.seed,
    record.intent,
    record.hypothesis,
    record.requirement.path,
    record.requirement.digest,
    record.target.artifact,
    record.target.artifactDigest,
    record.edit.find,
    record.edit.replace,
    String(record.edit.occurrences),
  ]);
}

/** The digest of one observation as recorded: its arm, evidence and trial counts. */
function observationDigest(observation) {
  return digest(canonicalJson(observation));
}

/** The digest of what a reviewer concluded and rested the conclusion on: the disposition and the independent evidence. */
function determinationDigest(record) {
  return digest(canonicalJson({ disposition: record.disposition, independentEvidence: record.independentEvidence }));
}

/**
 * The scope a decision on `record` binds to as it stands: its identity, its determination and every observation it
 * holds. A reviewer or a tool writing a review or an accepted risk copies this.
 *
 * @param {object} record
 * @returns {{identity: string, determination: string, observations: Array<{observationId: string, evidence: string}>}}
 */
function decisionScope(record) {
  return {
    identity: candidateIdentity(record),
    determination: determinationDigest(record),
    observations: record.observations.map((observation) => ({
      observationId: observation.observationId,
      digest: observationDigest(observation),
    })),
  };
}

/** The positions of every string in `value` that is not well-formed UTF-16 (a lone surrogate). */
function illFormedStrings(value, at = '(root)') {
  if (typeof value === 'string') return value.isWellFormed() ? [] : [at];
  if (Array.isArray(value)) return value.flatMap((item, index) => illFormedStrings(item, `${at}/${index}`));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => [
      ...illFormedStrings(key, `${at}/(key)`),
      ...illFormedStrings(child, `${at}/${key}`),
    ]);
  }
  return [];
}

/**
 * Every key that a JSON object of `text` states twice. `JSON.parse` keeps the last, so a reader of the raw file and the
 * record the reader holds would disagree. The text has already parsed, so the scan only has to follow strings and the
 * container brackets.
 */
function repeatedKeys(text) {
  const repeated = [];
  const stack = [];
  for (let at = 0; at < text.length; at += 1) {
    const character = text[at];
    switch (character) {
      case '"': {
        let end = at + 1;
        while (text[end] !== '"') end += text[end] === '\\' ? 2 : 1;
        const frame = stack.at(-1);
        if (frame?.keys !== undefined && frame.expectKey) {
          const key = JSON.parse(text.slice(at, end + 1));
          if (frame.keys.has(key)) repeated.push(key);
          frame.keys.add(key);
          frame.expectKey = false;
        }
        at = end;

        break;
      }
      case '{': {
        stack.push({ keys: new Set(), expectKey: true });
        break;
      }
      case '[': {
        stack.push({});
        break;
      }
      case '}':
      case ']': {
        stack.pop();
        break;
      }
      default: {
        if (character === ',' && stack.at(-1)?.keys !== undefined) stack.at(-1).expectKey = true;
      }
    }
  }
  return repeated;
}

/** What the schema cannot say: stored digests that must equal recomputed ones, decisions that must still fit, counts that add up. */
function semanticProblems(record) {
  const problems = [];
  const identity = candidateIdentity(record);
  if (record.identity !== identity) problems.push(`identity is ${record.identity}; the candidate's fields digest to ${identity}`);

  const seen = new Map();
  for (const [index, observation] of record.observations.entries()) {
    if (seen.has(observation.observationId)) problems.push(`observations[${index}].observationId ${observation.observationId} repeats`);
    seen.set(observation.observationId, observationDigest(observation));
    const { planned, completed, errors, missing } = observation.trials;
    if (completed + errors + missing > planned) {
      problems.push(`observations[${index}].trials accounts for ${completed + errors + missing} trials of ${planned} planned`);
    }
  }

  const determination = determinationDigest(record);
  const staleScope = (label, scope) => {
    if (scope.identity !== identity) problems.push(`${label}.scope.identity ${scope.identity} is stale; the candidate is now ${identity}`);
    if (scope.determination !== determination) {
      problems.push(
        `${label}.scope.determination ${scope.determination} is stale; the disposition and independent evidence now digest to ${determination}`,
      );
    }
    for (const reviewed of scope.observations) {
      if (seen.get(reviewed.observationId) !== reviewed.digest) {
        problems.push(
          `${label}.scope.observations names ${reviewed.observationId} as ${reviewed.digest}, which the record no longer holds`,
        );
      }
    }
  };
  if (record.review !== null) staleScope('review', record.review.scope);
  if (record.acceptedRisk !== null) staleScope('acceptedRisk', record.acceptedRisk.scope);

  if (String(record.disposition).startsWith('confirmed-undesirable')) {
    for (const arm of ['baseline', 'candidate']) {
      if (!record.observations.some((observation) => observation.arm === arm && observation.trials.completed >= 1)) {
        problems.push(`disposition ${record.disposition} needs a ${arm} observation with at least one completed trial`);
      }
    }
  }
  const observed = new Set(record.observations.map((observation) => observation.evidence));
  for (const [index, evidence] of record.independentEvidence.entries()) {
    if (evidence.digest === record.requirement.digest) {
      problems.push(`independentEvidence[${index}].digest is the requirement's digest, which the candidate is judged against`);
    }
    if (observed.has(evidence.digest))
      problems.push(`independentEvidence[${index}].digest is an observation's evidence, which the evaluated system produced`);
  }
  if (record.edit.find === record.edit.replace) problems.push('edit.find equals edit.replace, so the edit changes nothing');
  return problems;
}

function schemaProblems(errors) {
  return errors.map(
    (error) =>
      `${error.instancePath || '(root)'} ${error.message}${error.params?.additionalProperty ? ` (${JSON.stringify(error.params.additionalProperty)})` : ''}`,
  );
}

/**
 * Validates a parsed candidate.
 *
 * @param {unknown} value
 * @returns {object} the same value, once it is a candidate
 * @throws {CandidateError}
 */
function validateCandidate(value) {
  const illFormed = illFormedStrings(value);
  if (illFormed.length > 0) throw new CandidateError(illFormed.map((at) => `${at} holds a lone surrogate, which no UTF-8 file can state`));
  if (!validateSchema(value)) throw new CandidateError(schemaProblems(validateSchema.errors));
  const problems = semanticProblems(value);
  if (problems.length > 0) throw new CandidateError(problems);
  return value;
}

/**
 * Reads a candidate from its JSON text.
 *
 * @param {string} text
 * @returns {object}
 * @throws {CandidateError}
 */
function parseCandidate(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new CandidateError([`is not JSON: ${error.message}`]);
  }
  const repeated = repeatedKeys(text);
  if (repeated.length > 0) throw new CandidateError(repeated.map((key) => `key ${JSON.stringify(key)} appears twice in one object`));
  return validateCandidate(value);
}

/**
 * The canonical bytes of a valid candidate. Parsing them returns an equal record, and serializing that record returns
 * the same bytes.
 *
 * @param {object} record
 * @returns {string}
 * @throws {CandidateError} when the record is not a valid candidate
 */
function serializeCandidate(record) {
  return canonicalJson(validateCandidate(record));
}

/** The relative path a candidate is stored at. */
function candidatePath(campaignId, candidateId) {
  return `${DISCOVERY_DIRECTORY}/${campaignId}/${candidateId}.candidate.json`;
}

/** The bytes of a regular file under `folder`, reached through no link and read through one descriptor. */
function readHeldFile(folder, relative, label) {
  let at = folder;
  const segments = relative.split('/');
  for (const [index, segment] of segments.entries()) {
    at = path.join(at, segment);
    let stats;
    try {
      stats = fs.lstatSync(at);
    } catch {
      throw new CandidateError([`${label} ${relative} does not exist in the evaluation folder`]);
    }
    if (stats.isSymbolicLink()) throw new CandidateError([`${label} ${relative} is reached through a link`]);
    if (index < segments.length - 1 && !stats.isDirectory())
      throw new CandidateError([`${label} ${relative} is under something that is not a directory`]);
  }
  let descriptor;
  try {
    descriptor = fs.openSync(at, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    throw new CandidateError([`${label} ${relative} cannot be opened: ${error.code ?? error.message}`]);
  }
  try {
    if (!fs.fstatSync(descriptor).isFile()) throw new CandidateError([`${label} ${relative} is not a regular file`]);
    return fs.readFileSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

/**
 * Reads the candidate an evaluation folder holds at `relative`, which must be `discovery/<campaignId>/C-NNN.candidate.json`,
 * and holds it to the folder: the record names that campaign and that candidate, the requirements file digests to the
 * record's `requirement.digest`, and a linked qualification receipt is a file of the folder with the recorded digest.
 *
 * @param {string} folder the evaluation folder
 * @param {string} relative
 * @returns {object}
 * @throws {CandidateError}
 */
function readCandidate(folder, relative) {
  const match = CANDIDATE_PATH.exec(relative);
  if (match === null) throw new CandidateError([`${relative} is not discovery/<campaignId>/C-NNN.candidate.json`]);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(readHeldFile(folder, relative, 'candidate'));
  } catch (error) {
    if (error instanceof CandidateError) throw error;
    throw new CandidateError([`${relative} is not UTF-8 text`]);
  }
  const record = parseCandidate(text);
  const problems = [];
  if (record.campaignId !== match[1]) problems.push(`campaignId ${record.campaignId} differs from the directory ${match[1]}`);
  if (record.candidateId !== match[2]) problems.push(`candidateId ${record.candidateId} differs from the file name ${match[2]}`);
  const held = (label, file, expected) => {
    try {
      const actual = bytesDigest(readHeldFile(folder, file, label));
      if (actual !== expected) problems.push(`${file} digests to ${actual}; the record names ${expected}`);
    } catch (error) {
      problems.push(...error.problems);
    }
  };
  held('requirement', record.requirement.path, record.requirement.digest);
  const receipt = record.promotion?.qualificationReceipt;
  if (receipt) held('qualification receipt', receipt.path, receipt.digest);
  if (problems.length > 0) throw new CandidateError(problems);
  return record;
}

/**
 * The draft mutation a promoted candidate stands for: the native `replace-exact` shape, ready for `tea-evaluate check`.
 * It is a file to review and qualify, and carries no claim that the candidate is a qualified probe.
 *
 * @param {object} record a promoted candidate
 * @returns {object} the content of `mutations/<draftMutationId>.mutation.json`
 * @throws {CandidateError} when the candidate is invalid or not promoted
 */
function draftMutation(record) {
  validateCandidate(record);
  if (record.promotion === null)
    throw new CandidateError([`candidate ${record.candidateId} is ${record.state}; only a promoted candidate has a draft`]);
  return {
    schemaVersion: MUTATION_SCHEMA_VERSION,
    mutationId: record.promotion.draftMutationId,
    mutationSource: record.target.artifact,
    targetArtifact: record.target.artifact,
    operator: { kind: 'replace-exact', find: record.edit.find, replace: record.edit.replace, occurrences: record.edit.occurrences },
    expectedObservableFailure: record.hypothesis,
  };
}

module.exports = {
  CANDIDATE_PATH,
  CANDIDATE_SCHEMA_VERSION,
  CandidateError,
  DISCOVERY_DIRECTORY,
  DISPOSITIONS,
  RECORD_KIND,
  REVIEW_DISPOSITIONS,
  STATES,
  bytesDigest,
  candidateIdentity,
  candidatePath,
  canonicalJson,
  decisionScope,
  determinationDigest,
  draftMutation,
  parseCandidate,
  readCandidate,
  serializeCandidate,
  validateCandidate,
};
