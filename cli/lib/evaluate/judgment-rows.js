/**
 * AD-21's import contract: judgment rows, and the one mapping that converts
 * them into what a Sealed Run Record carries.
 *
 * A `command` or `sealed-brief-agent` evaluator answers each trial with one
 * JSON object, `{ rows, recommendation? }` (`judgment-rows.schema.json`).
 * `evaluator/mapping.json` (`evaluator-mapping.schema.json`) binds each key a
 * row may carry to an oracle and the behavior it answers, or to a rubric
 * criterion and its anchored levels. Per evaluation, the row schema gains
 * that a row's key is one the mapping declares and appears at most once, so
 * an unmapped key or a repeated one fails the schema like any other shape
 * error.
 *
 * The conversion (`judgmentFromRows`) is the only place rows become record
 * fields:
 *
 * - a `fail` row bound to an oracle is that oracle's `violated` disposition
 *   and, for a probe one of whose behaviors declares the oracle, one
 *   `defect` finding: a `findingId` minted here (`F-NNN`, unique in the
 *   record), the oracle, the probe, the first of the probe's behaviors that
 *   declares the oracle and that behavior's severity (`judgeTrial`'s rule),
 *   the row's `comment` as `summary`, its `confidence`, its `observationIds`,
 *   `evidenceArtifacts: []`, and one `quotedEvidence` entry `{ quote,
 *   channel, artifactId }` (`artifactId` null off the `artifact` channel);
 *   a probe none of whose behaviors declares the oracle keeps the
 *   disposition and files no finding, as the deterministic evaluator does,
 *   since a finding names the probe it arose during and is scored against
 *   that probe's signature. The binding's `behaviorId` names the behavior the
 *   key is described under (a behavior that declares the oracle); an oracle
 *   two behaviors declare is answered by one key, and its finding follows
 *   the probe under trial;
 * - a `pass` row bound to an oracle is its `held` disposition;
 * - an oracle no row answers is `not-attempted`, citing nothing;
 * - a `score` row bound to a rubric criterion is that criterion's judge
 *   result, and a bound criterion no row scores is `score: null` with a note,
 *   which eval-quality reads as `judge-error`.
 *
 * What a row says reaches `eval-quality score` as the evaluator said it: the
 * runtime checks no quote against its observation and no citation against
 * the trial (AD-1), so eval-quality's own ingest decides both. What the
 * runtime does refuse is an answer outside the contract (a row shape the
 * schema refuses, a `score` row on an oracle key or a `pass` or `fail` row
 * on a rubric key, a score off the binding's levels, a string that is not
 * well-formed Unicode, and no row at all for a trial with a mapped oracle):
 * `EvaluatorError`, which yields no record and exits 12 (AD-10).
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const AjvModule = require('ajv/dist/2020');

const Ajv = AjvModule.default ?? AjvModule;

/** Where the mapping lives, relative to the evaluation folder. */
const MAPPING_PATH = 'evaluator/mapping.json';
const SCHEMA_ROOT = path.join(__dirname, 'schemas');
const ROWS_SCHEMA = JSON.parse(fs.readFileSync(path.join(SCHEMA_ROOT, 'judgment-rows.schema.json'), 'utf8'));
const MAPPING_SCHEMA = JSON.parse(fs.readFileSync(path.join(SCHEMA_ROOT, 'evaluator-mapping.schema.json'), 'utf8'));
/** How severe each recommendation is, for the one a trial set records. */
const RECOMMENDATION_ORDER = ['PASS', 'CONCERNS', 'FAIL'];

/**
 * An evaluator that answered outside the import contract, or could not
 * answer; the trial yields no record (exit 12). It carries what the evaluator
 * printed, as text and as the bytes it wrote.
 */
class EvaluatorError extends Error {
  constructor(message, { stdout = '', stderr = '', stdoutBytes = Buffer.from(stdout), stderrBytes = Buffer.from(stderr) } = {}) {
    super(message);
    this.name = 'EvaluatorError';
    this.stdout = stdout;
    this.stderr = stderr;
    this.stdoutBytes = stdoutBytes;
    this.stderrBytes = stderrBytes;
  }
}

/** Ajv's errors as one line each. */
function describe(errors) {
  return [
    ...new Set(
      (errors ?? []).map((error) => {
        const detail = error.params?.additionalProperty ?? error.params?.missingProperty ?? error.params?.allowedValues;
        return `${error.instancePath || '/'} ${error.message}${detail === undefined ? '' : ` (${JSON.stringify(detail)})`}`;
      }),
    ),
  ];
}

const mappingAjv = new Ajv({ strict: false, allErrors: true });
const mappingSchema = mappingAjv.compile(MAPPING_SCHEMA);

/**
 * Everything wrong with a mapping's shape, against the runtime's schema.
 *
 * @param {unknown} mapping
 * @returns {string[]}
 */
function mappingSchemaProblems(mapping) {
  return mappingSchema(mapping) ? [] : describe(mappingSchema.errors);
}

/** Whether a binding names an oracle (else a rubric criterion). */
function isOracleBinding(binding) {
  return typeof binding?.oracleId === 'string';
}

/**
 * Everything a mapping binds that the contract does not declare as bound: an
 * oracle, behavior or rubric criterion the contract lacks, an oracle its
 * behavior does not declare, levels other than the criterion's anchored
 * scale levels, an oracle or criterion two keys bind, and a rubric criterion
 * no key binds (under an evaluator that scores the rubric, nothing else
 * would).
 *
 * @param {object} mapping a mapping that meets its schema
 * @param {object} contract
 * @returns {string[]}
 */
function mappingContractProblems(mapping, contract) {
  const problems = [];
  // The contract may be off its schema here (check reports that on its own), so every list is read defensively.
  const list = (value) => (Array.isArray(value) ? value : []);
  const oracles = new Set(list(contract.oracles).map((oracle) => oracle?.id));
  const behaviors = new Map(list(contract.behaviors).map((behavior) => [behavior?.id, behavior]));
  const rubrics = new Map(list(contract.rubrics).map((rubric) => [rubric?.id, rubric]));
  const boundOracles = new Map();
  const boundCriteria = new Map();
  for (const [key, binding] of Object.entries(mapping.keys)) {
    if (isOracleBinding(binding)) {
      if (!oracles.has(binding.oracleId)) problems.push(`key ${key} binds oracle ${binding.oracleId}, which the contract does not declare`);
      const behavior = behaviors.get(binding.behaviorId);
      if (behavior === undefined) problems.push(`key ${key} binds behavior ${binding.behaviorId}, which the contract does not declare`);
      else if (oracles.has(binding.oracleId) && !list(behavior.oracles).includes(binding.oracleId)) {
        problems.push(`key ${key} binds oracle ${binding.oracleId} to behavior ${binding.behaviorId}, which does not declare that oracle`);
      }
      if (boundOracles.has(binding.oracleId)) {
        problems.push(`keys ${boundOracles.get(binding.oracleId)} and ${key} both bind oracle ${binding.oracleId}`);
      } else boundOracles.set(binding.oracleId, key);
      continue;
    }
    const rubric = rubrics.get(binding.rubricId);
    const criterion = list(rubric?.criteria).find((candidate) => candidate?.id === binding.criterionId);
    if (rubric === undefined) problems.push(`key ${key} binds rubric ${binding.rubricId}, which the contract does not declare`);
    else if (criterion === undefined) {
      problems.push(`key ${key} binds criterion ${binding.criterionId}, which rubric ${binding.rubricId} does not declare`);
    } else {
      const anchored = list(rubric.scaleLevels).map((level) => level?.level);
      const sorted = (levels) => JSON.stringify([...levels].sort((a, b) => a - b));
      if (sorted(anchored) !== sorted(binding.levels)) {
        problems.push(
          `key ${key} restates levels ${JSON.stringify(binding.levels)} for ${binding.rubricId}/${binding.criterionId}, whose anchored scale levels are ${JSON.stringify(anchored)}`,
        );
      }
    }
    const pair = `${binding.rubricId}/${binding.criterionId}`;
    if (boundCriteria.has(pair)) problems.push(`keys ${boundCriteria.get(pair)} and ${key} both bind criterion ${pair}`);
    else boundCriteria.set(pair, key);
  }
  for (const rubric of list(contract.rubrics)) {
    for (const criterion of list(rubric?.criteria)) {
      const pair = `${rubric.id}/${criterion.id}`;
      if (!boundCriteria.has(pair)) {
        problems.push(`no key binds rubric criterion ${pair}, so nothing would score it; bind it to a key the evaluator prints`);
      }
    }
  }
  return problems;
}

/**
 * The per-evaluation row schema: the runtime's `judgment-rows` schema with
 * every row's key one the mapping declares and no key twice.
 *
 * @param {object} mapping
 * @returns {(value: unknown) => string[]}
 */
function rowsValidator(mapping) {
  const keys = Object.keys(mapping.keys);
  const ajv = new Ajv({ strict: false, allErrors: true });
  const validate = ajv.compile({
    ...ROWS_SCHEMA,
    $id: `${ROWS_SCHEMA.$id}:mapped`,
    properties: {
      ...ROWS_SCHEMA.properties,
      rows: {
        ...ROWS_SCHEMA.properties.rows,
        items: { allOf: [{ $ref: '#/$defs/Row' }, { properties: { key: { enum: keys } } }] },
        allOf: keys.map((key) => ({
          contains: { properties: { key: { const: key } }, required: ['key'] },
          minContains: 0,
          maxContains: 1,
        })),
      },
    },
  });
  return (value) => (validate(value) ? [] : describe(validate.errors));
}

/**
 * Where in a parsed answer a string (a value or a key) is not well-formed
 * Unicode, as a JSON pointer, or null when every string is. JSON's `\ud800`
 * escape parses to a lone surrogate, which no record can be serialized with.
 */
function illFormedString(value, pointer = '') {
  if (typeof value === 'string') return value.isWellFormed() ? null : pointer || '/';
  if (value === null || typeof value !== 'object') return null;
  for (const [key, item] of Object.entries(value)) {
    const at = `${pointer}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`;
    if (!key.isWellFormed()) return at;
    const found = illFormedString(item, at);
    if (found !== null) return found;
  }
  return null;
}

/**
 * One trial's answer read against the import contract: the JSON object the
 * evaluator printed, held to the per-evaluation row schema and to the rule
 * that a trial with a mapped oracle is answered by at least one row. A string
 * holding a lone surrogate is refused as well, since the record it would
 * reach cannot be serialized.
 *
 * @param {object} options
 * @param {string} options.text what the evaluator printed
 * @param {object} options.mapping
 * @param {(value: unknown) => string[]} options.validate `rowsValidator(mapping)`
 * @returns {{ rows: object[], recommendation?: string }}
 * @throws {EvaluatorError}
 */
function readAnswer({ text, mapping, validate }) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new EvaluatorError(`the evaluator's answer is not JSON: ${error.message}`);
  }
  const illFormed = illFormedString(value);
  if (illFormed !== null) {
    throw new EvaluatorError(`the evaluator's answer carries a string at ${illFormed} that is not well-formed Unicode (a lone surrogate)`);
  }
  const problems = validate(value);
  if (problems.length > 0) {
    throw new EvaluatorError(`the evaluator's answer fails the judgment-rows schema: ${problems.slice(0, 10).join('; ')}`);
  }
  const mapsAnOracle = Object.values(mapping.keys).some(isOracleBinding);
  if (mapsAnOracle && value.rows.length === 0) {
    throw new EvaluatorError('the evaluator answered no judgment row, and the mapping binds at least one oracle it had to judge');
  }
  return value;
}

/**
 * One probe's judgment in one trial, converted from that trial's rows: a
 * disposition for every contract oracle, a finding per `fail` row whose
 * oracle a behavior the probe discharges declares, and a judge result per
 * bound rubric criterion.
 *
 * @param {object} options
 * @param {object} options.contract
 * @param {object} options.mapping
 * @param {{ rows: object[] }} options.answer `readAnswer`'s result
 * @param {string} options.probeId the probe the record is scored against
 * @param {string[]} options.behaviorIds the behaviors that probe discharges
 * @returns {{ oracleDispositions: object[], findings: object[], judgeResults: object[] }}
 * @throws {EvaluatorError} a row on a key of the other kind, or a score off its binding's levels
 */
function judgmentFromRows({ contract, mapping, answer, probeId, behaviorIds }) {
  const rowOf = new Map(answer.rows.map((row) => [row.key, row]));
  for (const row of answer.rows) {
    const binding = mapping.keys[row.key];
    if (isOracleBinding(binding) && row.outcome === 'score') {
      throw new EvaluatorError(`row ${row.key} is a score row, and its key binds oracle ${binding.oracleId}, which takes pass or fail`);
    }
    if (!isOracleBinding(binding) && row.outcome !== 'score') {
      throw new EvaluatorError(
        `row ${row.key} is a ${row.outcome} row, and its key binds criterion ${binding.rubricId}/${binding.criterionId}, which takes a score`,
      );
    }
    if (!isOracleBinding(binding) && !binding.levels.includes(row.score)) {
      throw new EvaluatorError(
        `row ${row.key} scores ${row.score}, which is not one of ${binding.rubricId}/${binding.criterionId}'s levels (${binding.levels.join(', ')})`,
      );
    }
  }
  const keyOfOracle = new Map(
    Object.entries(mapping.keys)
      .filter(([, binding]) => isOracleBinding(binding))
      .map(([key, binding]) => [binding.oracleId, key]),
  );
  // The probe's behaviors in the order `behaviorIds` gives them: its own first, then its defects'.
  const discharged = behaviorIds
    .map((behaviorId) => (contract.behaviors ?? []).find((candidate) => candidate.id === behaviorId))
    .filter((behavior) => behavior !== undefined);
  const oracleDispositions = [];
  const findings = [];
  for (const oracle of contract.oracles ?? []) {
    const key = keyOfOracle.get(oracle.id);
    const row = key === undefined ? undefined : rowOf.get(key);
    if (row === undefined) {
      oracleDispositions.push({
        oracleId: oracle.id,
        disposition: 'not-attempted',
        observationIds: [],
        note: key === undefined ? 'no mapping key binds this oracle' : `the evaluator returned no row for key ${key}`,
      });
      continue;
    }
    oracleDispositions.push({
      oracleId: oracle.id,
      disposition: row.outcome === 'fail' ? 'violated' : 'held',
      observationIds: row.observationIds,
      note: row.comment ?? null,
    });
    if (row.outcome !== 'fail') continue;
    // The finding answers the first of the probe's behaviors that declares the oracle, as `judgeTrial`'s does.
    const behavior = discharged.find((candidate) => (candidate.oracles ?? []).includes(oracle.id));
    if (behavior === undefined) continue;
    findings.push({
      findingType: 'defect',
      findingId: `F-${String(findings.length + 1).padStart(3, '0')}`,
      oracleId: oracle.id,
      probeId,
      behaviorId: behavior.id,
      severity: behavior.severity,
      summary: row.comment,
      confidence: row.confidence,
      observationIds: row.observationIds,
      evidenceArtifacts: [],
      quotedEvidence: [
        { quote: row.quote, channel: row.quoteChannel, artifactId: row.quoteChannel === 'artifact' ? row.artifactId : null },
      ],
    });
  }
  const judgeResults = [];
  for (const [key, binding] of Object.entries(mapping.keys)) {
    if (isOracleBinding(binding)) continue;
    const row = rowOf.get(key);
    judgeResults.push(
      row === undefined
        ? {
            rubricId: binding.rubricId,
            criterionId: binding.criterionId,
            score: null,
            note: `the evaluator returned no score row for key ${key}`,
          }
        : { rubricId: binding.rubricId, criterionId: binding.criterionId, score: row.score, note: row.comment ?? null },
    );
  }
  return { oracleDispositions, findings, judgeResults };
}

/**
 * One probe's recommendation in one trial: the evaluator's own, else FAIL
 * when the trial's rows filed a finding against the probe and PASS
 * otherwise. A fail row on an oracle no behavior of the probe declares files
 * no finding against it, so it does not make the probe's record recommend
 * FAIL, as the deterministic evaluator's recommendation does not.
 *
 * @param {{ recommendation?: string }} answer
 * @param {{ findings: object[] }} judgment the probe's `judgmentFromRows` in that trial
 * @returns {'PASS'|'CONCERNS'|'FAIL'}
 */
function trialRecommendation(answer, judgment) {
  if (typeof answer.recommendation === 'string') return answer.recommendation;
  return judgment.findings.length > 0 ? 'FAIL' : 'PASS';
}

/**
 * A trial set's recommendation: the most severe of its trials', since
 * eval-quality holds the recommendation equal across a set.
 *
 * @param {string[]} recommendations
 * @returns {'PASS'|'CONCERNS'|'FAIL'}
 */
function setRecommendationOf(recommendations) {
  return recommendations.reduce(
    (worst, next) => (RECOMMENDATION_ORDER.indexOf(next) > RECOMMENDATION_ORDER.indexOf(worst) ? next : worst),
    'PASS',
  );
}

module.exports = {
  EvaluatorError,
  MAPPING_PATH,
  isOracleBinding,
  judgmentFromRows,
  mappingContractProblems,
  mappingSchemaProblems,
  readAnswer,
  rowsValidator,
  setRecommendationOf,
  trialRecommendation,
};
