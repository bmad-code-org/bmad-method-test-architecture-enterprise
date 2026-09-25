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
 * (`conditionArm` is a label eval-quality never compares with anything).
 * Agreement on the contract and configuration digests is eval-quality's to
 * judge (AD-1). The records directory must resolve inside the evaluation
 * folder, through no link.
 *
 * Anything missing, unreadable or off its schema is an authoring defect:
 * `EvaluatorLayerError`, exit 10, before any `score` call.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { EvaluatorLayerError } = require('./evaluators');

const CONFIGURATION_NAME = 'evaluator-configuration.json';
const MANIFEST_NAME = 'isolation-manifest.json';
const RECORD_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;

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
 * @param {object} options.writer the run directory's writer
 * @returns {Promise<{ configuration: object, sets: Array<{ probeId: string, runId: string, conditionArm: string, records: string[], manifest: string|null }> }>}
 * @throws {EvaluatorLayerError}
 */
async function importRecords({ folder, evaluator, probes, sealedBriefDigest, validate, writer }) {
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
      await held('isolation-manifest', parsed(bytes, spell(probeId, MANIFEST_NAME)), spell(probeId, MANIFEST_NAME));
      copies.push([`trial-sets/${probeId}/${MANIFEST_NAME}`, bytes]);
      manifest = `trial-sets/${probeId}/${MANIFEST_NAME}`;
    }
    sets.push({ probeId, runId: first.runId, conditionArm, records, manifest });
  }
  // Nothing is written until every file has passed, so a refused directory leaves no partial copy.
  for (const [file, bytes] of copies) writer.write(file, bytes);
  return { configuration, sets };
}

module.exports = { importRecords };
