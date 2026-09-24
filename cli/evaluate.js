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
 *
 * `--evaluation` names the folder or its evaluation.json. Nothing else locates
 * an evaluation: no default path and no project configuration.
 *
 * Exit codes (AD-10):
 *   0   success
 *   3-5 preflight only: an eval-quality stage's own exit, passed through verbatim
 *   10  authoring defect: every finding is printed, one per line (digest: an indexed entry it cannot digest;
 *       preflight: a leg the registry does not authorize, or a mutation whose find text does not occur
 *       exactly once)
 *   11  preflight only: an evaluation weakness, a seeded probe whose baseline does not pass or whose mutated
 *       arm does not fail
 *   12  infrastructure: the optional eval-quality peer is not installed; preflight: a workspace that cannot
 *       be made, a target that cannot launch or exits an infrastructure code, a restore that fails, a
 *       restored workspace that does not pass again, a leg that could not run, a change to the adopter's
 *       project during the run, or an engine stage that could not run
 *   64  wiring defect: no --evaluation resolves, or the command line is malformed (preflight: or eval-quality's own 64)
 */

'use strict';

const { Command } = require('commander');

const { resolveEvaluationFolder } = require('./lib/evaluate/folder');
const { checkEvaluation } = require('./lib/evaluate/check');
const { CorpusIndexError, writeCorpusIndex } = require('./lib/evaluate/corpus-index');
const { EngineUnavailableError } = require('./lib/evaluate/engine');
const { EngineStageError } = require('./lib/evaluate/engine-cli');
const { runPreflightCommand } = require('./lib/evaluate/preflight');

const EXIT_CODES = {
  ok: 0,
  authoring: 10,
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

async function runPreflight(options) {
  const folder = folderFrom(options);
  let outcome;
  try {
    outcome = await runPreflightCommand(folder, {
      fromWorkingTree: options.fromWorkingTree === true,
      log: (line) => process.stderr.write(`${NAME} preflight: ${escapeUnprintable(line)}\n`),
    });
  } catch (error) {
    if (error instanceof EngineUnavailableError || error instanceof EngineStageError) throw error;
    // Anything else that stops a preflight (an unwritable run directory, a
    // workspace that fails part way) is infrastructure, and exit 1 means
    // nothing in AD-10's table for tea-evaluate.
    process.stderr.write(`${NAME} preflight: ${escapeUnprintable(error?.stack ?? error)}\n`);
    return EXIT_CODES.infrastructure;
  }
  for (const finding of outcome.findings) process.stdout.write(findingLine(finding.file, finding.rule, finding.message));
  const where = outcome.runDirectory === null ? folder : outcome.runDirectory;
  process.stdout.write(
    `${NAME} preflight: ${escapeUnprintable(outcome.message.trimEnd())} (exit ${outcome.exitCode}, ${escapeUnprintable(where)})\n`,
  );
  return outcome.exitCode;
}

function buildProgram(run) {
  const program = new Command();
  program
    .name(NAME)
    .description('Validate, digest and preflight an Evaluate evaluation folder.')
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
    .action((options) => run(runPreflight, options));
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
      process.stderr.write(`${NAME}: ${error.message}\nUsage: ${NAME} <check|digest|preflight> --evaluation <path>\n`);
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
