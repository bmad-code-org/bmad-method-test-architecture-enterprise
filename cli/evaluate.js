#!/usr/bin/env node
/**
 * tea-evaluate: the single driver for an Evaluate evaluation folder (AD-5).
 *
 * Subcommands in this release:
 *   tea-evaluate check  --evaluation <path>   validate the folder; exit 10 on any authoring defect
 *   tea-evaluate digest --evaluation <path> [--calibration-inputs | --file <path>]
 *                                             write corpus-index.json and print corpusDigest; with
 *                                             --calibration-inputs write nothing and print, as JSON, the values a
 *                                             records harness copies into calibration-judgments.json: the labelled
 *                                             file's digest, the scorer configuration digest and each labelled
 *                                             item's label-free scorerInput; with --file write nothing and print
 *                                             eval-quality's digestBytes over the bytes of one file the folder
 *                                             holds, named relative to the folder (--file and --calibration-inputs cannot be combined)
 *   tea-evaluate preflight --evaluation <path> [--from-working-tree] [--partition <development|held-out>]
 *                                             qualify the seeded probes in a disposable workspace, drive the
 *                                             preflight legs and take the verdict from eval-quality
 *   tea-evaluate run --evaluation <path> [--from-working-tree] [--partition <development|held-out>]
 *                                             the preflight, then each arm (clean, mutated, historical,
 *                                             gameability) `trials` times in fresh workspaces, judged by the
 *                                             deterministic evaluator and any rubric judge, sealed as one
 *                                             trial set per probe under runs/<invocationId>/
 *                                             with --before-state, a clean control whose noKnownDefectStatement begins
 *                                             "Known defect at this revision:" may fail its baseline; the run records a
 *                                             before state that compare and compare --accept refuse
 *   tea-evaluate score --evaluation <path> [--run <invocationId>]
 *                                             eval-quality score once per probe over a completed run's trial sets
 *   tea-evaluate compare --evaluation <path> [--run <invocationId>] [--accept]
 *                                             compare a scored run's evidence with baseline/ through eval-quality's
 *                                             compareDominance (compared, first-run or refused, every one exit 0), or
 *                                             with --accept replace baseline/ with a byte-identical snapshot of the run
 *   tea-evaluate ci --evaluation <path> --tier <pr|merge|scheduled|release>
 *                                             run exactly the checks ci/evaluation-ci-plan.json places on the tier, in
 *                                             plan order, each one's exit, stdout and stderr kept under
 *                                             runs/<invocationId>/; the stage exits pass through verbatim and the final
 *                                             exit is the most severe blocking one (64, 12, 5, 4, 3, 13, 11, 10, 2, 1, 0)
 *
 * `--evaluation` names the folder or its evaluation.json. Nothing else locates
 * an evaluation: no default path and no project configuration.
 *
 * Exit codes (AD-10):
 *   0   success (ci: every check passed or warned)
 *   1   ci only: a gate check's own exit 1, a repository policy violation, and any gate exit AD-10's table does not
 *       name, passed through verbatim and ranked after every other blocking exit
 *   2-5 preflight, run and score: an eval-quality stage's own exit, passed through verbatim (2, FAIL, from
 *       score alone; score passes on the most severe of its per-probe exits); a sealed-brief agent
 *       qualification records its score exit 3 and stops the run with 12 on any exit other than 0, 2 or 3
 *   3   also preflight and run: a mount outside the isolation allowlist, the check score makes of a trial set's isolation
 *       manifest, found in the legs of the preflight's pristine workspace or in the manifests a run sealed (run seals them
 *       and stays scoreable); the message names the paths and the two setups that work
 *   2-5 also ci: the exit of each stage it runs (compile, seal, the replay's preflight and score, a live check's
 *       preflight, run and score), passed through the same way; 2 is also a probe class below its strength floor
 *       on the release tier
 *   10  authoring defect: every finding is printed, one per line (digest: an indexed entry it cannot digest, and with
 *       --calibration-inputs an evaluator that is not records, a contract with no rubric, an unusable labelled file
 *       or a harness configuration that is absent, a link, not JSON or not an EvaluatorConfiguration;
 *       preflight: a leg the registry does not authorize, or a mutation whose find text does not occur
 *       exactly once)
 *   10  also compare: a run whose scores or members cannot be read as files the run wrote, a baseline holding a link
 *       or an entry that is not a regular file, or a baseline artifact that does not meet its schema; compare
 *       --accept: a run whose run.json says dirty: true, a probe with no evidence artifact, or a member a replay
 *       through score needs that is missing, a link or not a regular file (nothing is written under baseline/);
 *       compare and compare --accept: a before state, a run.json that records beforeState or a sealed clean control
 *       that declares a known defect
 *   10  also ci: a plan that fails its schema or its placement rules (a check with no non-blank reason, a trigger its
 *       tier does not use, a <evaluation-folder> left in a command or an evidence path, a preflight-live default that
 *       disagrees with the registry, evaluation.json tiers that differ from the plan's, an api-conformance check over
 *       an evaluation with no HTTP target, a rubric with no judge-calibration on a live tier the plan uses, a gates
 *       list that is empty, repeats a name or holds a name that is no job id, a deterministic check that needs no
 *       secret placed off pr, a live check on pr, a command not led by its tool, a warn enforcement where AD-10
 *       gives no warn) or that sits in a ci/ directory that is a link; a baseline that
 *       fails its schema, holds anything in scores/ besides the accepted score invocation, or holds a probe or
 *       contract that is not JSON; a check's own exit 10 (a check finding, a conformance run that exits 1) passes through
 *   10  also run: a trial request the registry denies, no probe or no scoring policy, a clean control whose
 *       behavior declares no oracle, or a materialized probe eval-quality's checks refuse; score: a run
 *       artifact that does not meet its schema or does not agree with its run, before any engine call
 *   11  preflight and run: an evaluation weakness, a seeded probe whose baseline does not pass or whose mutated
 *       arm does not fail, a historical probe that does not fail before its fix or pass after it, a clean
 *       control whose baseline does not pass (with --before-state, one that does not declare a known defect or whose
 *       oracles cannot decide), or a gameability probe whose degenerate response the naive
 *       oracle rejects or the disciplined oracle accepts; run: a rubric judge whose calibration agreement is
 *       below judgeCalibration.minimumAgreement, or a sealed-brief agent whose agreement on an arm is below
 *       evaluatorQualification.minimumAgreement
 *   11  also ci: a stale baseline on the release tier (the current contract, corpus or policy digest, or the strength
 *       floors, differ from the baseline's), a baseline oracle outcome whose corroboration is disagrees, or
 *       not-evaluable or unreached for an oracle a behavior requires, and a judge below its calibration agreement
 *   12  infrastructure: the optional eval-quality peer is not installed; preflight: a workspace that cannot
 *       be made, a target that cannot launch, a qualification arm step that exits an infrastructure code,
 *       a restore that fails, a restored workspace that does not pass again, a leg that could not run, a
 *       change to the adopter's project during the run, or an engine stage that could not run; run: also a
 *       trial that cannot run, exits an infrastructure code or is stopped by a signal from outside, which yields no record,
 *       a mutated trial whose digest differs from the qualification's, a rubric judge that cannot answer, or
 *       a run whose every probe was refused, or a sealed-brief agent attempt eval-quality score cannot score (a call
 *       that cannot run, an exit other than 0, 2 or 3, no evidence artifact, or no single trial vote); preflight and run: a run directory holding an
 *       entry the runtime did not write or a file whose bytes differ from the ones it wrote; score: a score call that could not
 *       run or exited with a code the CLI does not document; compare --accept: a baseline that could not be staged or
 *       swapped in (the old baseline/ is untouched)
 *   12  also ci: an engine stage killed or exiting a code the CLI does not document (the replay's included), a gate
 *       that cannot start, runs past its timeoutMs or prints more than 64 MiB, a conformance run that cannot finish, a
 *       gameability arm score did not score, a stale-baseline check that cannot run, or a CI run directory that
 *       cannot be written
 *   13  evaluation evidence drift: ci's pr replay of the committed baseline through eval-quality preflight and score
 *       produced evidence that differs from the baseline's, or lacks or adds a file (the stage exits themselves pass
 *       through when they are not success or FAIL)
 *   64  also ci: no ci/evaluation-ci-plan.json, an unknown --tier, a check that needs a baseline/ that is absent, an
 *       api-conformance check over an evaluation whose evaluation.json names no registry, or a gate's own 64 passed
 *       through
 *   64  also preflight: no --partition over an evaluation whose evaluation.json declares a partitionPlan, since the
 *       command would derive the both view and launch the held-out request; the refusal names --partition and both
 *       values, and a folder with no partitionPlan preflights with no flag
 *   64  also run: --before-state over an evaluation, or a partition of it, with no clean control that declares a known defect
 *   64  also digest --file: a path outside the folder, through a symbolic link, to a directory, to a file the folder
 *       does not hold or to something that is not a regular file, and --file with --calibration-inputs
 *   64  wiring defect: no --evaluation resolves, or the command line is malformed (preflight, run and score: or
 *       eval-quality's own 64; score: no run to score, a --run naming no run or a preflight, or a run that did
 *       not complete; compare: the same, and a run with no score invocation; a sealed-brief agent qualification's score call that exits 64 stops the run with 12)
 */

'use strict';

const { Command } = require('commander');

const { readFolderFile, resolveEvaluationFolder } = require('./lib/evaluate/folder');
const { checkEvaluation } = require('./lib/evaluate/check');
const { CorpusIndexError, writeCorpusIndex } = require('./lib/evaluate/corpus-index');
const { EngineUnavailableError, loadEngine } = require('./lib/evaluate/engine');
const { EngineStageError } = require('./lib/evaluate/engine-cli');
const { runPreflightCommand } = require('./lib/evaluate/preflight');
const { runRunCommand } = require('./lib/evaluate/run');
const { runCompareCommand } = require('./lib/evaluate/compare');
const { runScoreCommand } = require('./lib/evaluate/score');
const { runCiCommand } = require('./lib/evaluate/ci');
const { TIERS } = require('./lib/evaluate/ci-plan');
const { escapeUnprintable, findingLine } = require('./lib/evaluate/finding-lines');
const { calibrationInputsOf } = require('./lib/evaluate/records-calibration');

const EXIT_CODES = {
  ok: 0,
  authoring: 10,
  weakness: 11,
  infrastructure: 12,
  drift: 13,
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
  for (const finding of findings) process.stdout.write(findingLine(finding.file, finding.rule, finding.message));
  process.stdout.write(`${NAME} check: ${findings.length} authoring defect(s) in ${folder}\n`);
  return EXIT_CODES.authoring;
}

/** Prints the values a records harness copies into its judgments file; writes nothing under the folder. */
async function runCalibrationInputs(folder) {
  const { problems, inputs } = await calibrationInputsOf(folder);
  if (inputs === null) {
    for (const problem of problems) process.stdout.write(findingLine(problem.file, 'judge-calibration', problem.message));
    process.stderr.write(`${NAME} digest --calibration-inputs: ${problems.length} authoring defect(s) in ${folder}\n`);
    return EXIT_CODES.authoring;
  }
  process.stdout.write(`${JSON.stringify(inputs, null, 2)}\n`);
  return EXIT_CODES.ok;
}

/** Prints eval-quality's `digestBytes` over one file the folder holds; writes nothing under the folder. */
async function runFileDigest(folder, file) {
  const read = readFolderFile(folder, file);
  if (!read.ok) {
    process.stderr.write(`${NAME} digest: --file ${escapeUnprintable(JSON.stringify(file))} ${escapeUnprintable(read.reason)}\n`);
    return EXIT_CODES.usage;
  }
  const engine = await loadEngine();
  process.stdout.write(`${engine.digestBytes(read.bytes)}\n`);
  return EXIT_CODES.ok;
}

async function runDigest(options) {
  if (options.file !== undefined && options.calibrationInputs === true) {
    throw new UsageError('--file and --calibration-inputs cannot be combined');
  }
  const folder = folderFrom(options);
  if (options.file !== undefined) return runFileDigest(folder, options.file);
  if (options.calibrationInputs === true) return runCalibrationInputs(folder);
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
    // A layer process that cannot start because the host's sockets cannot all be hidden (Story 1.88) is a host condition: its message is the whole report.
    if (error?.name === 'ConfinementError') {
      process.stderr.write(`${NAME} ${name}: ${escapeUnprintable(error.message)}\n`);
      return EXIT_CODES.infrastructure;
    }
    process.stderr.write(`${NAME} ${name}: ${escapeUnprintable(error?.stack ?? error)}\n`);
    return EXIT_CODES.infrastructure;
  }
  for (const finding of outcome.findings) process.stdout.write(findingLine(finding.file, finding.rule, finding.message));
  for (const line of outcome.report ?? []) process.stdout.write(`${escapeUnprintable(line)}\n`);
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
  return runDriven('preflight', runPreflightCommand, options, {
    fromWorkingTree: options.fromWorkingTree === true,
    partition: options.partition,
    requirePartition: true,
  });
}

function runCommand(options) {
  return runDriven('run', runRunCommand, options, {
    fromWorkingTree: options.fromWorkingTree === true,
    partition: options.partition,
    seed: options.seed,
    beforeState: options.beforeState === true,
  });
}

function scoreCommand(options) {
  return runDriven('score', runScoreCommand, options, { run: options.run });
}

function compareCommand(options) {
  return runDriven('compare', runCompareCommand, options, { run: options.run, accept: options.accept === true });
}

async function ciCommand(options) {
  if (!TIERS.includes(options.tier)) {
    throw new UsageError(
      `--tier ${options.tier === undefined ? 'is required' : `${JSON.stringify(options.tier)} is not a tier`}: choose ${TIERS.join(', ')}`,
    );
  }
  return runDriven('ci', runCiCommand, options, { tier: options.tier });
}

function buildProgram(run) {
  const program = new Command();
  program
    .name(NAME)
    .description('Validate, digest, preflight, run, score, compare and run the CI tiers of an Evaluate evaluation folder.')
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
    .description(
      'Write corpus-index.json over corpus/, probes/ and mutations/, and print corpusDigest; with --calibration-inputs, print the values a records harness copies instead; with --file, print the digest of one file the folder holds.',
    )
    .option('--evaluation <path>', 'the evaluation folder, or its evaluation.json')
    .option(
      '--calibration-inputs',
      "print, and write nothing: the labelled file's digest, the scorer configuration digest and each item's scorerInput",
    )
    .option('--file <path>', "print, and write nothing: eval-quality's digestBytes over this file, named relative to the evaluation folder")
    .action((options) => run(runDigest, options));
  program
    .command('preflight')
    .description(
      'Qualify the seeded probes in a disposable workspace, drive the preflight legs and take the verdict from eval-quality preflight.',
    )
    .option('--evaluation <path>', 'the evaluation folder, or its evaluation.json')
    .option('--from-working-tree', 'evaluate the working tree, uncommitted work included, in a temp copy recorded as dirty')
    .option(
      '--partition <name>',
      'development or held-out; required when evaluation.json declares a partitionPlan, otherwise omitted qualifies every probe',
    )
    .action((options) => run(preflightCommand, options));
  program
    .command('run')
    .description('Run the preflight, then each arm the probes need as a trial set in fresh workspaces, sealed under runs/<invocationId>/.')
    .option('--evaluation <path>', 'the evaluation folder, or its evaluation.json')
    .option('--from-working-tree', 'evaluate the working tree, uncommitted work included, in a temp copy recorded as dirty')
    .option('--partition <name>', 'development or held-out; omitted runs both')
    .option('--seed <value>', 'seed matcher bindings and record it in run.json')
    .option(
      '--before-state',
      'record a before state: a clean control whose noKnownDefectStatement begins "Known defect at this revision:" may fail its baseline; the run is never accepted as a baseline',
    )
    .action((options) => run(runCommand, options));
  program
    .command('score')
    .description('Score every trial set of a completed run through eval-quality score, once per probe.')
    .option('--evaluation <path>', 'the evaluation folder, or its evaluation.json')
    .option('--run <invocationId>', 'the run to score; the most recent run when omitted')
    .action((options) => run(scoreCommand, options));
  program
    .command('compare')
    .description(
      'Compare a scored run with baseline/ through eval-quality compareDominance; with --accept, replace baseline/ with a snapshot of the run.',
    )
    .option('--evaluation <path>', 'the evaluation folder, or its evaluation.json')
    .option('--run <invocationId>', 'the run to compare or accept; the most recent run when omitted')
    .option('--accept', 'replace baseline/ with a byte-identical snapshot of the run; refused for a dirty run')
    .action((options) => run(compareCommand, options));
  program
    .command('ci')
    .description(
      'Run the checks ci/evaluation-ci-plan.json places on a tier, passing every stage exit through; the final exit is the most severe blocking one.',
    )
    .option('--evaluation <path>', 'the evaluation folder, or its evaluation.json')
    .option('--tier <tier>', 'pr, merge, scheduled or release')
    .action((options) => run(ciCommand, options));
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
      process.stderr.write(`${NAME}: ${error.message}\nUsage: ${NAME} <check|digest|preflight|run|score|compare|ci> --evaluation <path>\n`);
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
