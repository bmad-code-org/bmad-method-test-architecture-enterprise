/**
 * The `records` evaluator (AD-21): an adopter harness that runs the system
 * and seals its own records, which the run takes as its trial sets.
 *
 * The run qualifies the probes and runs the preflight as for any kind; then,
 * in place of trials, it reads `evaluator.records` (a directory in the
 * evaluation folder):
 *
 *   <records>/evaluator-configuration.json      the harness's EvaluatorConfiguration
 *   <records>/<probeId>/<name>.json             one SealedRunRecord per trial, in name order
 *   <records>/<probeId>/isolation-manifest.json the set's IsolationManifest, when the harness wrote one
 *
 * Each file is validated against the schema eval-quality publishes for it and
 * copied into the run directory byte for byte, so `eval-quality score` reads
 * the adopter's own bytes; a set with no manifest reaches `score` with none,
 * which eval-quality reads as Invalid. Beyond the schemas, the run checks
 * what eval-quality does not and the run alone knows: every record's and the
 * configuration's `sealedBriefDigest` is the brief this run sealed (so the
 * harness evaluated this contract's brief), and every record of a set
 * carries one `runId` and the arm the run qualified the probe on
 * (`conditionArm` is a label eval-quality never compares with anything), and
 * the configuration is one eval-quality can digest.
 * Every record's and isolation manifest's `evaluatorConfigurationDigest` must
 * equal the digest of the imported configuration, bindings included, so a
 * harness that bound its calibration after sealing learns it at `run`;
 * agreement on the contract digest stays eval-quality's to judge (AD-1).
 * The records directory must resolve inside the evaluation
 * folder, through no link.
 *
 * Under a `partitionPlan` (Story 1.107) a record names only what the view declares. A record carries the oracles it disposes
 * (`oracleDispositions`, a finding's `oracleId`), the behavior a finding names, the rubric criteria it scores (`judgeResults`), the
 * plan steps its observations record and the observations its dispositions and findings cite. A harness names an observation
 * `<label>-<stepId>` or, for a call the agent chose, `<label>-call-<n>`, with `<label>` one of the run labels `records.js` lists
 * (`trial-<n>`, `attempt-<n>`, `baseline`, `degenerate`, `mutated`, `re-pass-<n>`); an observation carries the step's call inputs and
 * every response channel. eval-quality's `score` ignores an oracle its contract lacks, takes no position on a criterion its rubric
 * lacks and reads an observation for the citations that name it, so a record that carries any of these from the view's other
 * partition would reach the run directory unchallenged. Only an allowlist can hold the line, because a development run never
 * opens the plan and cannot know a held-out step ID: an observation is admitted when its ID is `<label>-<a step the view declares>`
 * or `<label>-call-<n>`, and every other ID is refused. A citation is admitted when the record holds the observation it names. A
 * refused record is exit 10 with nothing copied, naming where in the record the content sits and never what it names: the other
 * partition's ID is that partition's own text.
 *
 * When the contract declares a rubric, the harness also writes
 * `<records>/calibration-judgments.json`, its scorer's answers over the
 * labelled items. Once the configuration validates and before any record is
 * read, the run verifies those judgments and gates on their agreement
 * (`records-calibration.js`); a contract with no rubric never reads the file.
 *
 * Anything missing, unreadable or off its schema is an authoring defect:
 * `EvaluatorLayerError`, exit 10, before any `score` call.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { EvaluatorLayerError } = require('./evaluators');
const { CHOSEN_CALL, RUN_LABELS } = require('./records');
const { calibrateImported } = require('./records-calibration');

const CONFIGURATION_NAME = 'evaluator-configuration.json';
const MANIFEST_NAME = 'isolation-manifest.json';
const RUN_LABELLED = new RegExp(`^${RUN_LABELS}-(.+)$`);
const RECORD_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;

/**
 * What a view declares, for `foreignContent`: the oracle IDs, behavior IDs, step IDs and `rubricId/criterionId` pairs of a contract.
 *
 * @param {object} contract
 * @returns {{ oracles: Set<string>, behaviors: Set<string>, criteria: Set<string>, steps: Set<string> }}
 */
function declaredContent(contract) {
  const list = (value) => (Array.isArray(value) ? value : []);
  return {
    oracles: new Set(list(contract.oracles).map((oracle) => oracle?.id)),
    behaviors: new Set(list(contract.behaviors).map((behavior) => behavior?.id)),
    steps: new Set(list(contract.interactionPlan).map((step) => step?.stepId)),
    criteria: new Set(
      list(contract.rubrics).flatMap((rubric) => list(rubric?.criteria).map((criterion) => `${rubric?.id}/${criterion?.id}`)),
    ),
  };
}

/**
 * Where a sealed run record carries an oracle, a behavior, a rubric criterion, a plan step or a citation that `declared` lacks, as the
 * record's own paths (`oracleDispositions[1]`, `findings[0].oracleId`, `findings[0].behaviorId`, `judgeResults[2]`, `observations[4]`,
 * `findings[1].observationIds[0]`), in the order the record lists them. A path names the place and never the ID, which would hand the
 * other partition's text to this run's output. An observation is admitted when its ID is a run label (`records.js`), a hyphen and a
 * step ID the view declares, or `<label>-call-<n>`, a call the agent chose; every other ID is refused, so a step the run cannot know
 * is refused whatever label it carries. A citation is admitted when the record holds the observation it names.
 *
 * @param {object} record a record that meets eval-quality's sealed-run-record schema
 * @param {{ oracles: Set<string>, behaviors: Set<string>, criteria: Set<string>, steps: Set<string> }} declared `declaredContent(contract)`
 * @returns {string[]}
 */
function foreignContent(record, declared) {
  const found = [];
  const held = new Set(record.observations.map((observation) => observation.observationId));
  const citations = (place, ids) => {
    for (const [position, id] of ids.entries()) if (!held.has(id)) found.push(`${place}.observationIds[${position}]`);
  };
  for (const [index, observation] of record.observations.entries()) {
    const step = RUN_LABELLED.exec(observation.observationId)?.[1];
    if (step === undefined || !(CHOSEN_CALL.test(step) || declared.steps.has(step))) found.push(`observations[${index}]`);
  }
  for (const [index, disposition] of record.oracleDispositions.entries()) {
    if (!declared.oracles.has(disposition.oracleId)) found.push(`oracleDispositions[${index}]`);
    citations(`oracleDispositions[${index}]`, disposition.observationIds);
  }
  for (const [index, finding] of record.findings.entries()) {
    if (finding.oracleId !== null && !declared.oracles.has(finding.oracleId)) found.push(`findings[${index}].oracleId`);
    if (finding.behaviorId !== null && !declared.behaviors.has(finding.behaviorId)) found.push(`findings[${index}].behaviorId`);
    citations(`findings[${index}]`, finding.observationIds);
  }
  for (const [index, result] of record.judgeResults.entries()) {
    if (!declared.criteria.has(`${result.rubricId}/${result.criterionId}`)) found.push(`judgeResults[${index}]`);
  }
  return found;
}

/** The bytes of a regular file the records directory holds, never through a link. */
function regularBytes(file, spelled) {
  let stats;
  try {
    stats = fs.lstatSync(file);
  } catch {
    throw new EvaluatorLayerError(`${spelled} is not there`);
  }
  if (!stats.isFile()) throw new EvaluatorLayerError(`${spelled} is not a regular file the evaluation folder holds`);
  return fs.readFileSync(file);
}

/**
 * Reads, validates and copies the harness's records for every probe the run
 * sealed.
 *
 * @param {object} options
 * @param {string} options.folder
 * @param {object} options.evaluator `evaluation.json`'s `evaluator`
 * @param {Array<{ probeId: string, conditionArm: string }>} options.probes the probes the run qualified, each needing a trial set, with the arm it runs on
 * @param {string} options.sealedBriefDigest the brief this run sealed
 * @param {Function} options.validate eval-quality's schema validator (`createArtifactValidator`)
 * @param {object} options.engine
 * @param {object} options.writer the run directory's writer
 * @param {{ labelled: object, evaluation: object, contract: object, engine: object, stop: Function }|null} [options.calibration] the labelled items and what the gate needs, when the contract declares a rubric
 * @param {{ contract: object, partition: string }|null} [options.view] the contract the run compiled and its partition, under a `partitionPlan`: a record that names an oracle, behavior or criterion the contract lacks is refused (Story 1.107); null for a folder with no plan
 * @returns {Promise<{ configuration: object, configurationDigest: string, sets: Array<{ probeId: string, runId: string, conditionArm: string, records: string[], manifest: string|null }> }>}
 * @throws {EvaluatorLayerError}
 */
async function importRecords({ folder, evaluator, probes, sealedBriefDigest, validate, engine, writer, calibration = null, view = null }) {
  const root = path.join(folder, ...evaluator.records.split('/'));
  let real;
  try {
    real = fs.realpathSync(root);
  } catch {
    real = null;
  }
  if (real === null || real !== path.join(fs.realpathSync(folder), ...evaluator.records.split('/')) || !fs.statSync(real).isDirectory()) {
    throw new EvaluatorLayerError(`${evaluator.records} is not a directory the evaluation folder holds, reached through no link`);
  }
  const spell = (...parts) => [evaluator.records, ...parts].join('/');
  const parsed = (bytes, spelled) => {
    try {
      return JSON.parse(bytes.toString('utf8'));
    } catch (error) {
      throw new EvaluatorLayerError(`${spelled} is not JSON: ${error.message}`);
    }
  };
  const held = async (kind, value, spelled) => {
    const problems = await validate(kind, value);
    if (problems.length > 0)
      throw new EvaluatorLayerError(`${spelled} does not meet eval-quality's ${kind} schema: ${problems.slice(0, 10).join('; ')}`);
  };

  const configurationBytes = regularBytes(path.join(root, CONFIGURATION_NAME), spell(CONFIGURATION_NAME));
  const configuration = parsed(configurationBytes, spell(CONFIGURATION_NAME));
  await held('evaluator-configuration', configuration, spell(CONFIGURATION_NAME));
  if (configuration.sealedBriefDigest !== sealedBriefDigest) {
    throw new EvaluatorLayerError(
      `${spell(CONFIGURATION_NAME)} carries sealedBriefDigest ${configuration.sealedBriefDigest}, not the ${sealedBriefDigest} of the brief this run sealed`,
    );
  }

  // Each record and manifest names the digest of this configuration, bindings included, and `score` holds them to it.
  let configurationDigest;
  try {
    configurationDigest = engine.digestArtifact(configuration, 'EvaluatorConfiguration');
  } catch (error) {
    throw new EvaluatorLayerError(`${spell(CONFIGURATION_NAME)} cannot be digested as an EvaluatorConfiguration: ${error.message}`);
  }
  const sealedAgainst = (value, spelled) => {
    if (value.evaluatorConfigurationDigest !== configurationDigest) {
      throw new EvaluatorLayerError(
        `${spelled} carries evaluatorConfigurationDigest ${value.evaluatorConfigurationDigest}; ${spell(CONFIGURATION_NAME)} digests to ${configurationDigest}, so it was sealed against another configuration`,
      );
    }
  };

  // The imported rubric scores count only once their calibration holds, so no record is read before it does.
  if (calibration !== null) await calibrateImported({ ...calibration, records: evaluator.records, root, configuration, writer });

  const declared = view === null ? null : declaredContent(view.contract);
  const sets = [];
  const copies = [[CONFIGURATION_NAME, configurationBytes]];
  for (const { probeId, conditionArm } of probes) {
    const directory = path.join(root, probeId);
    let names;
    try {
      if (!fs.lstatSync(directory).isDirectory()) throw new Error('not a directory');
      names = fs.readdirSync(directory).sort();
    } catch {
      throw new EvaluatorLayerError(
        `${spell(probeId)} is not a directory, and the run sealed probe ${probeId}, whose trial set the harness must supply`,
      );
    }
    const recordNames = names.filter((name) => name !== MANIFEST_NAME);
    const stray = recordNames.filter((name) => !RECORD_FILE.test(name));
    if (stray.length > 0)
      throw new EvaluatorLayerError(`${spell(probeId)} holds ${stray.join(', ')}, which is not a record file (<name>.json)`);
    if (recordNames.length === 0) throw new EvaluatorLayerError(`${spell(probeId)} holds no record`);
    const records = [];
    let first = null;
    for (const name of recordNames) {
      const bytes = regularBytes(path.join(directory, name), spell(probeId, name));
      const record = parsed(bytes, spell(probeId, name));
      await held('sealed-run-record', record, spell(probeId, name));
      const foreign = declared === null ? [] : foreignContent(record, declared);
      if (foreign.length > 0) {
        throw new EvaluatorLayerError(
          `${spell(probeId, name)} carries ${foreign.join(', ')}, which name${foreign.length === 1 ? 's' : ''} an oracle, behavior, rubric criterion, plan step or cited observation the ${view.partition} view does not declare, so the record was not produced for this partition's contract`,
        );
      }
      sealedAgainst(record, spell(probeId, name));
      if (record.sealedBriefDigest !== sealedBriefDigest) {
        throw new EvaluatorLayerError(
          `${spell(probeId, name)} carries sealedBriefDigest ${record.sealedBriefDigest}, not the ${sealedBriefDigest} of the brief this run sealed, so it was not produced from this contract's brief`,
        );
      }
      first ??= record;
      if (record.runId !== first.runId || record.conditionArm !== conditionArm) {
        throw new EvaluatorLayerError(
          `${spell(probeId, name)} carries runId ${record.runId} and arm ${record.conditionArm}; every record of the set carries its first record's runId ${first.runId} and the arm ${conditionArm} the run qualified ${probeId} on`,
        );
      }
      copies.push([`trial-sets/${probeId}/${name}`, bytes]);
      records.push(`trial-sets/${probeId}/${name}`);
    }
    let manifest = null;
    if (names.includes(MANIFEST_NAME)) {
      const bytes = regularBytes(path.join(directory, MANIFEST_NAME), spell(probeId, MANIFEST_NAME));
      const manifestValue = parsed(bytes, spell(probeId, MANIFEST_NAME));
      await held('isolation-manifest', manifestValue, spell(probeId, MANIFEST_NAME));
      sealedAgainst(manifestValue, spell(probeId, MANIFEST_NAME));
      copies.push([`trial-sets/${probeId}/${MANIFEST_NAME}`, bytes]);
      manifest = `trial-sets/${probeId}/${MANIFEST_NAME}`;
    }
    sets.push({ probeId, runId: first.runId, conditionArm, records, manifest });
  }
  // Nothing is written until every file has passed, so a refused directory leaves no partial copy.
  for (const [file, bytes] of copies) writer.write(file, bytes);
  return { configuration, configurationDigest, sets };
}

module.exports = { declaredContent, foreignContent, importRecords };
