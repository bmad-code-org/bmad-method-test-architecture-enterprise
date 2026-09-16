/**
 * Record an already-produced `eval:all` run summary, and report how it compares
 * to the last one this repository recorded.
 *
 * This tool never runs `eval:all` itself and spends no live call: it consumes
 * the JSON `eval:all --json <path>` already wrote. Stage two of Story 5.2 is
 * the two commands chained:
 *
 *   npm run eval:all -- --agent <runner> --json /tmp/run.json
 *   node tools/record-eval-run.js --from /tmp/run.json
 *
 * WHAT THIS DOES
 *
 * Loads the run named by `--from`, loads `test/results/eval-all/latest.json` if
 * one is already stored, compares the two through `test/lib/compare-eval-runs.js`,
 * prints the comparison, and then writes the new run to `latest.json` and to a
 * timestamped `test/results/eval-all/history/<instant>.json`. The write happens
 * after the report is printed but is not conditioned on what the report says: a
 * refused or drifted comparison is itself the finding this tool exists to
 * surface, not a reason to withhold the record that produced it.
 *
 * Both destinations are written through `writeRunSummary`
 * (`test/lib/eval-record.js`), the same function `eval-all.js` itself uses, so a
 * record that fails its own schema is refused here exactly as it would be there,
 * and a run taken under a scripted clock (`TEA_CLOCK_FIXTURE`) is refused for
 * the same reason: a committed evidence file carrying a fabricated duration is
 * the worst artifact this repository can produce.
 *
 * Exit codes:
 *   0  the run was recorded — whatever the comparison found, including a refusal
 *   2  usage error, `--from` could not be read as a valid run-summary record, or
 *      the record could not be written
 */

'use strict';

const path = require('node:path');

const { readJson } = require('../test/lib/file-system-port');
const { writeRunSummary } = require('../test/lib/eval-record');
const { validateEvalRun } = require('../test/schema/eval-result');
const { compareEvalRuns } = require('../test/lib/compare-eval-runs');

const PROJECT_ROOT = path.join(__dirname, '..');
const RESULTS_ROOT = path.join(PROJECT_ROOT, 'test', 'results', 'eval-all');
const LATEST_PATH = path.join(RESULTS_ROOT, 'latest.json');
const HISTORY_ROOT = path.join(RESULTS_ROOT, 'history');

const USAGE = `Usage: node tools/record-eval-run.js --from <path>

Records an eval:all run summary already written by "eval:all --json <path>",
comparing it against the previously recorded test/results/eval-all/latest.json
(if any) and printing the comparison, then writing the run to latest.json and
to a timestamped file under test/results/eval-all/history/.

Options:
  --from <path>   The run-summary JSON eval:all already wrote. Required.
  --help          Show this help.`;

function usageError(message) {
  const error = new Error(message);
  error.code = 'RECORD_USAGE';
  return error;
}

function parseArgs(argv) {
  const options = { help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--from': {
        const value = argv[index + 1];
        if (value === undefined || value === '') throw usageError('--from requires a value');
        options.fromPath = value;
        index += 1;
        break;
      }
      case '--help':
      case '-h': {
        options.help = true;
        break;
      }
      default: {
        throw usageError(`unknown argument: ${arg}`);
      }
    }
  }
  if (!options.help && !options.fromPath) throw usageError('--from is required');
  return options;
}

function schemaIssues(result) {
  return result.error.issues.map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n');
}

/**
 * The run-summary record `--from` names, validated against the same schema
 * `eval-all.js` writes to. A record that does not validate is refused here
 * rather than compared or stored: a comparison against, or a storage of, a
 * record this repository cannot vouch for would produce a stored "evidence"
 * file that is not.
 *
 * @param {string} fromPath
 * @returns {Promise<object>}
 */
async function loadProducedRun(fromPath) {
  const read = await readJson(fromPath);
  if (!read.present) throw new Error(`--from ${fromPath} does not exist`);
  const result = validateEvalRun(read.value);
  if (!result.success) throw new Error(`--from ${fromPath} is not a valid run-summary record:\n${schemaIssues(result)}`);
  return result.data;
}

/**
 * `test/results/eval-all/latest.json`, validated, or `null` when nothing is
 * stored yet.
 *
 * @returns {Promise<object|null>}
 */
async function loadStoredRun() {
  const read = await readJson(LATEST_PATH);
  if (!read.present) return null;
  const result = validateEvalRun(read.value);
  if (!result.success) {
    throw new Error(
      `${path.relative(PROJECT_ROOT, LATEST_PATH)} does not match its own schema, so it cannot be compared against:\n${schemaIssues(result)}`,
    );
  }
  return result.data;
}

/** A run-summary's own `generatedAt`, made safe for a filename. */
function historyFileName(record) {
  return `${record.generatedAt.replaceAll(/[:.]/g, '-')}.json`;
}

function printComparison(comparison, storedPresent) {
  console.log(`\ncomparing against ${storedPresent ? path.relative(PROJECT_ROOT, LATEST_PATH) : 'no prior run'}\n`);

  if (comparison.status === 'first-run') {
    console.log(comparison.message);
    return;
  }
  if (comparison.status === 'refused') {
    console.log(`comparison refused: ${comparison.reason}`);
    return;
  }

  if (!comparison.drift) {
    console.log('no drift: every suite common to both runs agrees, and the suite set is unchanged');
    return;
  }

  for (const id of comparison.addedSuites) console.log(`  + ${id}: present in this run and not in the earlier one`);
  for (const id of comparison.removedSuites) console.log(`  - ${id}: present in the earlier run and not in this one`);
  for (const change of comparison.suiteChanges) {
    if (change.failureClass) console.log(`  ~ ${change.id}: failureClass ${change.failureClass.from} -> ${change.failureClass.to}`);
    for (const measurement of change.measurementChanges) {
      console.log(`  ~ ${change.id}: ${measurement.metric} ${measurement.from ?? 'n/a'} -> ${measurement.to ?? 'n/a'}`);
    }
    if (change.dominance) {
      console.log(
        change.dominance.ok
          ? `  ~ ${change.id}: dominance moved to "${change.dominance.relation}"`
          : `  ~ ${change.id}: dominance comparison refused: ${change.dominance.reason}`,
      );
    }
  }
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    if (error.code === 'RECORD_USAGE') {
      console.error(`record-eval-run: ${error.message}\n\n${USAGE}`);
      process.exit(2);
    }
    throw error;
  }
  if (options.help) {
    console.log(USAGE);
    process.exit(0);
  }

  let produced;
  let stored;
  try {
    produced = await loadProducedRun(options.fromPath);
    stored = await loadStoredRun();
  } catch (error) {
    console.error(`record-eval-run: ${error.message}`);
    process.exit(2);
  }

  const comparison = await compareEvalRuns(stored, produced);
  printComparison(comparison, stored !== null);

  const historyPath = path.join(HISTORY_ROOT, historyFileName(produced));
  try {
    await writeRunSummary(LATEST_PATH, produced);
    await writeRunSummary(historyPath, produced);
  } catch (error) {
    console.error(`record-eval-run: could not write the recorded run: ${error.message}`);
    process.exit(2);
  }

  console.log(`\nrecorded ${path.relative(PROJECT_ROOT, LATEST_PATH)} and ${path.relative(PROJECT_ROOT, historyPath)}`);
  process.exit(0);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`record-eval-run: ${error?.stack ?? error}`);
    process.exit(2);
  });
}

module.exports = { parseArgs, historyFileName, loadProducedRun, loadStoredRun, printComparison, USAGE };
