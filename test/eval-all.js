/**
 * Run every live TEA eval with one explicit agent configuration.
 *
 * The suite list comes from test/evals/suite-manifest.json, never from this
 * file. That is what makes the accounting check below possible: before anything
 * runs, every TEA skill in the repository must have either a behavioral suite or
 * an explicit deferred declaration, and a skill in neither is exit 2 with
 * nothing measured. A runner that quietly skips the skill it has no eval for
 * reports a green run that means less than the reader thinks, and that is the
 * single most expensive way to be wrong about your own quality gate.
 *
 * Each suite keeps its declared repetition count from the manifest. Fragment
 * selection, test design and trace default to two runs, test review to three. The
 * focused harnesses remain available when one workflow or metric needs debugging.
 *
 * REPETITION_OVERRIDES below names a command-line flag per suite and now covers two
 * of the four. A suite it does not name still runs at its manifest count, which is
 * why adding the trace and test-design suites needed no change here.
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { loadSuiteManifest, unaccountedSkills } = require('./lib/suite-manifest');
const { teaSkills } = require('./lib/tea-skills');
const { digestFiles, repositoryState, suiteResultRecord, runSummaryRecord, writeRunSummary } = require('./lib/eval-record');
const { exitCodeForFailureClass, worstFailureClass } = require('./schema/eval-result');

const PROJECT_ROOT = path.join(__dirname, '..');

// The two repetition overrides are named after the suites they belong to and
// keep working, so an existing command line does not change meaning.
const REPETITION_OVERRIDES = { fragmentRuns: 'fragment-selection', reviewRuns: 'test-review' };

const USAGE = `Usage: npm run eval:all -- --agent <agy|claude|codex|custom> [options]

Runs every suite registered in test/evals/suite-manifest.json, and refuses to run
when a TEA skill has neither a behavioral suite nor a deferred declaration.

Options:
  --agent <name>         Runner to use. Repeat for multiple built-in runners.
  --workflow <name>      Limit fragment selection to one workflow. Repeatable.
  --fragment-runs <n>    Repetitions per fragment case. Default: the manifest's.
  --review-runs <n>      Complete review repetitions. Default: the manifest's.
  --json <path>          Write the machine-readable run summary to this path.
  --preflight-only       Validate eval data and runner readiness without model calls.
  --agent-cmd <path>     Executable required by --agent custom.
  --agent-arg <arg>      Argument passed to the custom runner. Repeatable.
  --env-pass <NAME>      Credential variable passed to the runner. Repeatable.
  --model <model>        Model override for a built-in adapter.
  --help                 Show this help.`;

function usageError(message) {
  const error = new Error(message);
  error.code = 'EVAL_USAGE';
  return error;
}

function takeValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value === undefined || value === '') throw usageError(`${flag} requires a value`);
  return value;
}

function positiveInteger(value, flag) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) throw usageError(`${flag} requires a positive integer`);
  return parsed;
}

function parseArgs(argv) {
  const options = {
    agents: [],
    workflows: [],
    agentArgs: [],
    envPass: [],
    preflightOnly: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--agent': {
        options.agents.push(takeValue(argv, index, arg));
        index += 1;
        break;
      }
      case '--workflow': {
        options.workflows.push(takeValue(argv, index, arg));
        index += 1;
        break;
      }
      case '--agent-cmd': {
        options.agentCmd = takeValue(argv, index, arg);
        index += 1;
        break;
      }
      case '--agent-arg': {
        options.agentArgs.push(takeValue(argv, index, arg));
        index += 1;
        break;
      }
      case '--env-pass': {
        options.envPass.push(takeValue(argv, index, arg));
        index += 1;
        break;
      }
      case '--model': {
        options.model = takeValue(argv, index, arg);
        index += 1;
        break;
      }
      case '--json': {
        options.jsonPath = takeValue(argv, index, arg);
        index += 1;
        break;
      }
      case '--fragment-runs': {
        options.fragmentRuns = positiveInteger(takeValue(argv, index, arg), arg);
        index += 1;
        break;
      }
      case '--review-runs': {
        options.reviewRuns = positiveInteger(takeValue(argv, index, arg), arg);
        index += 1;
        break;
      }
      case '--preflight-only': {
        options.preflightOnly = true;
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

  if (options.help) return options;
  if (options.agents.length === 0) throw usageError('--agent is required; choose agy, claude, codex, or custom');
  if (options.agents.includes('custom') && !options.agentCmd) throw usageError('--agent custom requires --agent-cmd');
  if (options.agents.includes('custom') && options.model) {
    throw usageError('--model is not supported by --agent custom; pass the runner model through --agent-arg');
  }
  if (options.agents.length > 1 && (options.agentCmd || options.agentArgs.length > 0 || options.envPass.length > 0 || options.model)) {
    throw usageError('runner overrides require exactly one --agent; run separate commands for different runner configurations');
  }
  return options;
}

function sharedRunnerArgs(options) {
  const args = [];
  for (const agent of options.agents) args.push('--agent', agent);
  if (options.agentCmd) args.push('--agent-cmd', options.agentCmd);
  if (options.model) args.push('--model', options.model);
  for (const value of options.agentArgs) args.push('--agent-arg', value);
  for (const name of options.envPass) args.push('--env-pass', name);
  return args;
}

/** The repetition count for one suite: the command line's, else the manifest's. */
function repetitionsFor(suite, options) {
  for (const [flag, suiteId] of Object.entries(REPETITION_OVERRIDES)) {
    if (suiteId === suite.id && options[flag]) return options[flag];
  }
  return suite.repetitions;
}

/**
 * One child invocation per registered suite, built from what the manifest says
 * the suite's harness accepts.
 *
 * @param {object} options Parsed command line.
 * @param {object} manifest Validated suite manifest.
 * @param {string|null} [jsonDirectory] Where child result records are collected.
 * @returns {Array<{suite: object, label: string, script: string, args: string[], jsonPath: string|null}>}
 */
function buildInvocations(options, manifest, jsonDirectory = null) {
  const workflows = options.workflows.flatMap((workflow) => ['--workflow', workflow]);
  return manifest.suites.map((suite) => {
    const jsonPath = jsonDirectory ? path.join(jsonDirectory, `${suite.id}.json`) : null;
    const args = [...sharedRunnerArgs(options)];
    if (suite.harnessOptions.acceptsWorkflowFilter) args.push(...workflows);
    if (options.preflightOnly) {
      args.push(...suite.harnessOptions.preflightArgs);
    } else {
      args.push(suite.harnessOptions.repetitionFlag, String(repetitionsFor(suite, options)));
    }
    if (jsonPath) args.push('--json', jsonPath);
    return {
      suite,
      label: `${suite.id} ${options.preflightOnly ? 'preflight' : 'live eval'}`,
      script: path.join(PROJECT_ROOT, suite.harness),
      args,
      jsonPath,
    };
  });
}

/** The failure class that matches an exit code, for a child that recorded none. */
function failureClassForExitCode(code) {
  if (code === 0) return 'none';
  if (code === 1) return 'quality';
  return 'environment-configuration';
}

/**
 * The failure class one child carries.
 *
 * Its own record is the more specific answer and stands whenever it lands on the code
 * the child actually exited with. The exit code takes over only when the record cannot
 * account for it, which is a defect in that harness: a suite that exits 0 while
 * recording a quality failure, or one that exits 2 having recorded nothing worse than
 * a threshold miss.
 *
 * @param {{failureClass: string}|null} record The child's result record, null when --json was not asked for.
 * @param {number|null} exitCode What the child process exited with.
 * @returns {string}
 */
function childFailureClass(record, exitCode) {
  const recorded = record ? record.failureClass : failureClassForExitCode(exitCode);
  if (exitCodeForFailureClass(recorded) === exitCode) return recorded;
  return worstFailureClass([recorded, failureClassForExitCode(exitCode)]);
}

/**
 * The failure class a whole run carries: the worst of its children's.
 *
 * @param {Array<{record?: object|null, exitCode: number|null}>} children One entry per child, in the order they ran.
 * @returns {string}
 */
function runFailureClass(children) {
  return worstFailureClass(children.map((child) => childFailureClass(child.record ?? null, child.exitCode)));
}

/**
 * The exit code a set of child exit codes implies on its own.
 *
 * main() does not call this: the code it exits with is read off the run summary, which
 * is what keeps the artifact and the process exit from disagreeing. It stays as the
 * statement of the exit-code half of that policy.
 */
function aggregateExitCodes(codes) {
  return exitCodeForFailureClass(runFailureClass(codes.map((exitCode) => ({ exitCode }))));
}

/**
 * A stand-in record for a suite whose harness wrote none. A child that crashed
 * before writing still has to appear in the summary, otherwise the run reads as
 * though that suite was never part of it.
 */
function placeholderRecord(suite, options, exitStatus, durationMs) {
  return suiteResultRecord({
    mode: options.preflightOnly ? 'preflight-only' : 'live',
    suite,
    repository: repositoryState(PROJECT_ROOT),
    fixtureDigest: digestFiles(PROJECT_ROOT, suite.fixtures),
    promptDigest: null,
    cases: [],
    runners: [],
    durationMs,
    suiteFailureClasses: [failureClassForExitCode(exitStatus)],
  });
}

function readChildRecord(invocation, options, exitStatus, durationMs) {
  if (invocation.jsonPath && fs.existsSync(invocation.jsonPath)) {
    try {
      return JSON.parse(fs.readFileSync(invocation.jsonPath, 'utf8'));
    } catch (error) {
      console.error(`eval:all: ${invocation.label} wrote an unreadable result record: ${error.message}`);
    }
  }
  return placeholderRecord(invocation.suite, options, exitStatus, durationMs);
}

function main() {
  const startedAt = Date.now();
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    if (error.code === 'EVAL_USAGE') {
      console.error(`eval:all: ${error.message}`);
      process.exit(2);
    }
    throw error;
  }
  if (options.help) {
    console.log(USAGE);
    process.exit(0);
  }

  let manifest;
  try {
    ({ manifest } = loadSuiteManifest(PROJECT_ROOT));
  } catch (error) {
    console.error(`eval:all: ${error.message}`);
    process.exit(2);
  }

  const skills = teaSkills(PROJECT_ROOT);
  const unaccounted = unaccountedSkills(manifest, skills);
  if (unaccounted.length > 0) {
    console.error('eval:all: the suite manifest does not account for every TEA skill; nothing was measured.');
    for (const skill of unaccounted) {
      console.error(`  - ${skill}: no behavioral suite and no deferred declaration in test/evals/suite-manifest.json`);
    }
    console.error('\nAdd a behavioral suite, or a deferred entry naming its owner, missing evidence, and exit condition.');
    if (options.jsonPath) {
      writeRunSummary(
        options.jsonPath,
        runSummaryRecord({
          repository: repositoryState(PROJECT_ROOT),
          suites: [],
          unaccountedSkills: unaccounted,
          durationMs: Date.now() - startedAt,
          runFailureClasses: ['environment-configuration'],
        }),
      );
    }
    process.exit(2);
  }

  // Child records are collected out of the way and folded into the summary, so
  // one --json path produces one file rather than a directory of fragments.
  const jsonDirectory = options.jsonPath ? fs.mkdtempSync(path.join(os.tmpdir(), 'tea-eval-all-')) : null;

  // One entry per child: what it exited with, and the record it wrote when --json
  // asked for one. Keeping the pair together is what lets each child's class be
  // settled from its own two halves.
  const children = [];
  // process.exit does not run a finally block, so the temp directory is removed
  // before the exit rather than around it.
  let aggregate = 2;
  try {
    for (const invocation of buildInvocations(options, manifest, jsonDirectory)) {
      console.log(`\n========================================`);
      console.log(invocation.label);
      console.log(`========================================\n`);
      const invocationStartedAt = Date.now();
      const result = spawnSync(process.execPath, [invocation.script, ...invocation.args], {
        cwd: PROJECT_ROOT,
        env: process.env,
        stdio: 'inherit',
      });
      const durationMs = Date.now() - invocationStartedAt;
      let status = result.status;
      if (result.error) {
        console.error(`eval:all: ${invocation.label} could not start: ${result.error.message}`);
        status = 2;
      }
      children.push({ exitCode: status, record: options.jsonPath ? readChildRecord(invocation, options, status, durationMs) : null });
    }

    // The summary is built whether or not one was asked for, and the process exits
    // with the code that summary carries. The two cannot disagree because there is
    // only one decision: each child's class is settled from its record and its exit
    // code, the run takes the worst of those, and the exit code is derived from that
    // class. The earlier shape decided the exit code first and then reconciled the
    // record against it, and a child that exited 0 while recording a quality failure
    // came out of it as exit 0 beside an artifact reading exitCode 1.
    const summary = runSummaryRecord({
      repository: repositoryState(PROJECT_ROOT),
      suites: children.map((child) => child.record).filter(Boolean),
      unaccountedSkills: [],
      durationMs: Date.now() - startedAt,
      runFailureClasses: children.map((child) => childFailureClass(child.record, child.exitCode)),
    });
    aggregate = summary.exitCode;

    if (options.jsonPath) {
      writeRunSummary(options.jsonPath, summary);
      console.log(`\nrun summary written to ${options.jsonPath}`);
    }
  } finally {
    if (jsonDirectory) fs.rmSync(jsonDirectory, { recursive: true, force: true });
  }

  process.exit(aggregate);
}

if (require.main === module) main();

module.exports = { parseArgs, sharedRunnerArgs, buildInvocations, aggregateExitCodes, runFailureClass, repetitionsFor, USAGE };
