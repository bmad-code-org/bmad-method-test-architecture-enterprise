#!/usr/bin/env node
/**
 * tea-evaluate: the single driver for an Evaluate evaluation folder (AD-5).
 *
 * Subcommands in this release:
 *   tea-evaluate check  --evaluation <path>   validate the folder; exit 10 on any authoring defect
 *   tea-evaluate digest --evaluation <path>   write corpus-index.json and print corpusDigest
 *
 * `--evaluation` names the folder or its evaluation.json. Nothing else locates
 * an evaluation: no default path and no project configuration.
 *
 * Exit codes (AD-10):
 *   0   success
 *   10  authoring defect: every finding is printed, one per line (digest: an indexed entry it cannot digest)
 *   12  infrastructure: the optional eval-quality peer is not installed
 *   64  wiring defect: no --evaluation resolves, or the command line is malformed
 */

'use strict';

const { Command } = require('commander');

const { resolveEvaluationFolder } = require('./lib/evaluate/folder');
const { checkEvaluation } = require('./lib/evaluate/check');
const { CorpusIndexError, writeCorpusIndex } = require('./lib/evaluate/corpus-index');
const { EngineUnavailableError } = require('./lib/evaluate/engine');

const EXIT_CODES = {
  ok: 0,
  authoring: 10,
  infrastructure: 12,
  usage: 64,
};

const NAME = 'tea-evaluate';

class UsageError extends Error {}

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
  for (const finding of findings) process.stdout.write(`${finding.file}: [${finding.rule}] ${finding.message}\n`);
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

function buildProgram(run) {
  const program = new Command();
  program
    .name(NAME)
    .description('Validate and digest an Evaluate evaluation folder.')
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
      process.stderr.write(`${NAME}: ${error.message}\nUsage: ${NAME} <check|digest> --evaluation <path>\n`);
      return EXIT_CODES.usage;
    }
    if (error instanceof CorpusIndexError) {
      process.stdout.write(`${error.file}: [corpus-file] ${error.message}\n`);
      return EXIT_CODES.authoring;
    }
    if (error instanceof EngineUnavailableError) {
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
