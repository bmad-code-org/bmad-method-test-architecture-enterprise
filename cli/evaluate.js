#!/usr/bin/env node
/**
 * tea-evaluate: the single driver for an Evaluate evaluation folder (AD-5).
 *
 * Subcommands in this release:
 *   tea-evaluate check  --evaluation <path>   validate the folder; exit 10 on any authoring defect
 *   tea-evaluate digest --evaluation <path>   write corpus-index.json and print corpusDigest
 *   tea-evaluate preflight --evaluation <path> [--from-working-tree]
 *                                             qualify the seeded probes in a disposable workspace, drive the
 *                                             preflight legs and take the verdict from eval-quality
 *   tea-evaluate run --evaluation <path> [--from-working-tree]
 *                                             the preflight, then each arm (clean, mutated, historical,
 *                                             gameability) `trials` times in fresh workspaces, judged by the
 *                                             deterministic evaluator and any rubric judge, sealed as one
 *                                             trial set per probe under runs/<invocationId>/
 *   tea-evaluate score --evaluation <path> [--run <invocationId>]
 *                                             eval-quality score once per probe over a completed run's trial sets
 *
 * `--evaluation` names the folder or its evaluation.json. Nothing else locates
 * an evaluation: no default path and no project configuration.
 *
 * Exit codes (AD-10):
 *   0   success
 *   2-5 preflight, run and score: an eval-quality stage's own exit, passed through verbatim (2, FAIL, from
 *       score alone; score passes on the most severe of its per-probe exits)
 *   10  authoring defect: every finding is printed, one per line (digest: an indexed entry it cannot digest;
 *       preflight: a leg the registry does not authorize, or a mutation whose find text does not occur
 *       exactly once)
 *   10  also run: a trial request the registry denies, no probe or no scoring policy, a clean control whose
 *       behavior declares no oracle, or a materialized probe eval-quality's checks refuse; score: a run
 *       artifact that does not meet its schema or does not agree with its run, before any engine call
 *   11  preflight and run: an evaluation weakness, a seeded probe whose baseline does not pass or whose mutated
 *       arm does not fail, a historical probe that does not fail before its fix or pass after it, a clean
 *       control whose baseline does not pass, or a gameability probe whose degenerate response the naive
 *       oracle rejects or the disciplined oracle accepts
 *   12  infrastructure: the optional eval-quality peer is not installed; preflight: a workspace that cannot
 *       be made, a target that cannot launch, a qualification arm step that exits an infrastructure code,
 *       a restore that fails, a restored workspace that does not pass again, a leg that could not run, a
 *       change to the adopter's project during the run, or an engine stage that could not run; run: also a
 *       trial that cannot run, exits an infrastructure code or is stopped by a signal from outside, which yields no record,
 *       a mutated trial whose digest differs from the qualification's, a rubric judge that cannot answer, or
 *       a run whose every probe was refused; preflight and run: a run directory holding an
 *       entry the runtime did not write or a file whose bytes differ from the ones it wrote; score: a score call that could not
 *       run or exited with a code the CLI does not document
 *   64  wiring defect: no --evaluation resolves, or the command line is malformed (preflight, run and score: or
 *       eval-quality's own 64; score: no run to score, a --run naming no run or a preflight, or a run that did
 *       not complete)
 */

'use strict';

const { Command } = require('commander');

const { resolveEvaluationFolder } = require('./lib/evaluate/folder');
const { checkEvaluation } = require('./lib/evaluate/check');
const { CorpusIndexError, writeCorpusIndex } = require('./lib/evaluate/corpus-index');
const { EngineUnavailableError } = require('./lib/evaluate/engine');
const { EngineStageError } = require('./lib/evaluate/engine-cli');
const { runPreflightCommand } = require('./lib/evaluate/preflight');
const { runRunCommand } = require('./lib/evaluate/run');
const { runScoreCommand } = require('./lib/evaluate/score');

const EXIT_CODES = {
  ok: 0,
  authoring: 10,
  weakness: 11,
  infrastructure: 12,
  usage: 64,
};

const NAME = 'tea-evaluate';

class UsageError extends Error {}

// C0 and C1 controls, DEL, the line and paragraph separators and the
// bidirectional formatting characters: any of them in a printed finding could
// start a forged finding line or reorder what a reader sees.
// eslint-disable-next-line no-control-regex
const UNPRINTABLE = /[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069]/gu;
const SHORT_ESCAPES = { '\n': String.raw`\n`, '\r': String.raw`\r`, '\t': String.raw`\t` };

/** `text` with every unprintable character written as an escape (`\n`, `\u202E`). */
function escapeUnprintable(text) {
  return String(text).replaceAll(
    UNPRINTABLE,
    (character) => SHORT_ESCAPES[character] ?? String.raw`\u` + character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'),
  );
}

/**
 * One finding as exactly one printed line. A file name holding an unprintable
 * character is quoted as well as escaped, so the reader can tell the name from
 * the text after it; a message is escaped in place.
 */
function findingLine(file, rule, message) {
  const name = String(file);
  const escaped = escapeUnprintable(name);
  const printedName = escaped === name ? name : JSON.stringify(name).replaceAll(UNPRINTABLE, (character) => escapeUnprintable(character));
  return `${printedName}: [${rule}] ${escapeUnprintable(message)}\n`;
}

function folderFrom(options) {
  const resolved = resolveEvaluationFolder(options.evaluation);
  if (!resolved.ok) throw new UsageError(resolved.reason);
  return resolved.folder;
}

async function runCheck(options) {
  const folder = folderFrom(options);
  const findings = await checkEvaluation(folder);
  if (findings.length === 0) {
    process.stdout.write(`${NAME} check: ${folder} has no authoring defects\n`);
    return EXIT_CODES.ok;
  }
  for (const finding of findings) process.stdout.write(findingLine(finding.file, finding.rule, finding.message));
  process.stdout.write(`${NAME} check: ${findings.length} authoring defect(s) in ${folder}\n`);
  return EXIT_CODES.authoring;
}

async function runDigest(options) {
  const folder = folderFrom(options);
  const { index, corpusDigest, indexPath } = await writeCorpusIndex(folder);
  process.stderr.write(`${NAME} digest: wrote ${indexPath} (${index.length} file(s))\n`);
  process.stdout.write(`${corpusDigest}\n`);
  return EXIT_CODES.ok;
}

/**
 * Runs one of the commands that drive the engine and prints its outcome.
 * Anything unexpected that stops one (an unwritable run directory, a
 * workspace that fails part way) is infrastructure, and exit 1 means nothing
 * in AD-10's table for tea-evaluate.
 */
async function runDriven(name, command, options, extra) {
  const folder = folderFrom(options);
  let outcome;
  try {
    outcome = await command(folder, { ...extra, log: (line) => process.stderr.write(`${NAME} ${name}: ${escapeUnprintable(line)}\n`) });
  } catch (error) {
    if (error instanceof EngineUnavailableError || error instanceof EngineStageError) throw error;
    process.stderr.write(`${NAME} ${name}: ${escapeUnprintable(error?.stack ?? error)}\n`);
    return EXIT_CODES.infrastructure;
  }
  for (const finding of outcome.findings) process.stdout.write(findingLine(finding.file, finding.rule, finding.message));
  for (const entry of outcome.scores ?? []) {
    const how = entry.exitCode === null ? 'could not run' : `exited ${entry.exitCode}`;
    process.stdout.write(
      `${escapeUnprintable(entry.probeId)}: eval-quality score ${how}; ${escapeUnprintable(entry.evidence ?? 'no evidence artifact')}\n`,
    );
  }
  const where = outcome.runDirectory === null ? folder : outcome.runDirectory;
  // The first line of the message is the outcome; any further lines (an
  // engine stage's own stderr) go to stderr, one escaped line each.
  const [summary, ...detail] = outcome.message.trimEnd().split('\n');
  for (const line of detail) process.stderr.write(`${NAME} ${name}: ${escapeUnprintable(line)}\n`);
  process.stdout.write(`${NAME} ${name}: ${escapeUnprintable(summary)} (exit ${outcome.exitCode}, ${escapeUnprintable(where)})\n`);
  return outcome.exitCode;
}

function preflightCommand(options) {
  return runDriven('preflight', runPreflightCommand, options, { fromWorkingTree: options.fromWorkingTree === true });
}

function runCommand(options) {
  return runDriven('run', runRunCommand, options, { fromWorkingTree: options.fromWorkingTree === true });
}

function scoreCommand(options) {
  return runDriven('score', runScoreCommand, options, { run: options.run });
}

function buildProgram(run) {
  const program = new Command();
  program
    .name(NAME)
    .description('Validate, digest, preflight, run and score an Evaluate evaluation folder.')
    .showHelpAfterError()
    .exitOverride()
    .configureOutput({ writeErr: (text) => process.stderr.write(text) });
  program
    .command('check')
    .description('Validate the evaluation folder; exit 10 listing every authoring defect.')
    .option('--evaluation <path>', 'the evaluation folder, or its evaluation.json')
    .action((options) => run(runCheck, options));
  program
    .command('digest')
    .description('Write corpus-index.json over corpus/, probes/ and mutations/, and print corpusDigest.')
    .option('--evaluation <path>', 'the evaluation folder, or its evaluation.json')
    .action((options) => run(runDigest, options));
  program
    .command('preflight')
    .description(
      'Qualify the seeded probes in a disposable workspace, drive the preflight legs and take the verdict from eval-quality preflight.',
    )
    .option('--evaluation <path>', 'the evaluation folder, or its evaluation.json')
    .option('--from-working-tree', 'evaluate the working tree, uncommitted work included, in a temp copy recorded as dirty')
    .action((options) => run(preflightCommand, options));
  program
    .command('run')
    .description('Run the preflight, then each arm the probes need as a trial set in fresh workspaces, sealed under runs/<invocationId>/.')
    .option('--evaluation <path>', 'the evaluation folder, or its evaluation.json')
    .option('--from-working-tree', 'evaluate the working tree, uncommitted work included, in a temp copy recorded as dirty')
    .action((options) => run(runCommand, options));
  program
    .command('score')
    .description('Score every trial set of a completed run through eval-quality score, once per probe.')
    .option('--evaluation <path>', 'the evaluation folder, or its evaluation.json')
    .option('--run <invocationId>', 'the run to score; the most recent run when omitted')
    .action((options) => run(scoreCommand, options));
  return program;
}

/**
 * Runs the command line and resolves to the exit code.
 *
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
async function main(argv) {
  let pending = Promise.resolve(EXIT_CODES.usage);
  let dispatched = false;
  const program = buildProgram((handler, options) => {
    dispatched = true;
    pending = handler(options);
  });
  try {
    program.parse(argv);
  } catch (error) {
    // commander's own --help and --version exits are not usage errors.
    if (error.exitCode === 0) return EXIT_CODES.ok;
    return EXIT_CODES.usage;
  }
  if (!dispatched) {
    process.stderr.write(`${NAME}: name a subcommand\n${program.helpInformation()}`);
    return EXIT_CODES.usage;
  }
  try {
    return await pending;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${NAME}: ${error.message}\nUsage: ${NAME} <check|digest|preflight|run|score> --evaluation <path>\n`);
      return EXIT_CODES.usage;
    }
    if (error instanceof CorpusIndexError) {
      process.stdout.write(findingLine(error.file, 'corpus-file', error.message));
      return EXIT_CODES.authoring;
    }
    if (error instanceof EngineUnavailableError || error instanceof EngineStageError) {
      process.stderr.write(`${NAME}: ${error.message}\n`);
      return EXIT_CODES.infrastructure;
    }
    throw error;
  }
}

if (require.main === module) {
  main(process.argv).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`${NAME}: ${error.stack ?? error.message}\n`);
      process.exitCode = 1;
    },
  );
}

module.exports = { EXIT_CODES, main };
