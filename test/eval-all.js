/**
 * Run every live TEA eval with one explicit agent configuration.
 *
 * Fragment selection keeps its two-run stability default. Test review keeps
 * its three-run variance default. The focused harnesses remain available when
 * one workflow or metric needs debugging.
 */

'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const FRAGMENT_EVAL = path.join(__dirname, 'eval-fragment-selection.js');
const REVIEW_EVAL = path.join(__dirname, 'eval-test-review.js');
const USAGE = `Usage: npm run eval:all -- --agent <agy|claude|codex|custom> [options]

Runs fragment selection for every covered skill, then the test-review behavioral eval.

Options:
  --agent <name>         Runner to use. Repeat for both built-in runners.
  --workflow <name>      Limit fragment selection to one workflow. Repeatable.
  --fragment-runs <n>    Repetitions per fragment case. Default: 2.
  --review-runs <n>      Complete review repetitions. Default: 3.
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
    fragmentRuns: 2,
    reviewRuns: 3,
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

function buildInvocations(options) {
  const workflows = options.workflows.flatMap((workflow) => ['--workflow', workflow]);
  if (options.preflightOnly) {
    return [
      { label: 'fragment-selection data validation', script: FRAGMENT_EVAL, args: [...workflows, '--validate-only'] },
      {
        label: 'test-review runner preflight',
        script: REVIEW_EVAL,
        args: [...sharedRunnerArgs(options), '--preflight-only'],
      },
    ];
  }
  return [
    {
      label: 'fragment-selection live eval',
      script: FRAGMENT_EVAL,
      args: [...sharedRunnerArgs(options), ...workflows, '--runs', String(options.fragmentRuns)],
    },
    {
      label: 'test-review live eval',
      script: REVIEW_EVAL,
      args: [...sharedRunnerArgs(options), '--runs', String(options.reviewRuns)],
    },
  ];
}

function aggregateExitCodes(codes) {
  if (codes.some((code) => code === null || code === 2 || code > 2)) return 2;
  return codes.includes(1) ? 1 : 0;
}

function main() {
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

  const exitCodes = [];
  for (const invocation of buildInvocations(options)) {
    console.log(`\n========================================`);
    console.log(invocation.label);
    console.log(`========================================\n`);
    const result = spawnSync(process.execPath, [invocation.script, ...invocation.args], {
      cwd: PROJECT_ROOT,
      env: process.env,
      stdio: 'inherit',
    });
    if (result.error) {
      console.error(`eval:all: ${invocation.label} could not start: ${result.error.message}`);
      exitCodes.push(2);
    } else {
      exitCodes.push(result.status);
    }
  }

  process.exit(aggregateExitCodes(exitCodes));
}

if (require.main === module) main();

module.exports = { parseArgs, sharedRunnerArgs, buildInvocations, aggregateExitCodes, USAGE };
