#!/usr/bin/env node
/**
 * tea-ci-runner: the command the CI behavioral contract names.
 *
 * `bmad-testarch-ci` scaffolds a pipeline for the project it is run in and
 * writes one deliverable a linter can hold to account, the platform's own
 * workflow file, which for GitHub Actions is `.github/workflows/test.yml`.
 * Measuring that needs a command to point at, and this file is that command.
 * Its whole surface is one turn:
 *
 *   prompt on standard input -> the agent runs in the working directory
 *                            -> the workflow file is left on disk
 *
 * It is `cli/nfr-runner.js` under another name, deliberately: the two commands
 * wrap the same `runAgent` call, declare the same option surface, and share one
 * exit-code table, so a caller holding an observation reads both the same way.
 * The difference between them is which workflow the prompt drives and what the
 * run leaves behind, and neither of those is this file's to know.
 *
 * The prompt belongs to the eval corpus, so this command builds none: it states
 * where the project and the skill are, which placeholders to resolve, and which
 * file to write, and only the harness knows those things. The vendor call is
 * TEA's own (cli/lib/run-agent.js), so vendor argv, the minimal child
 * environment, the model pin, and the credential shape are decided in the one
 * place that already decides them for every other TEA command.
 *
 * The workflow file is written where the prompt says to write it, and this
 * command neither names nor reads it. A caller behind eval-quality's
 * command-line adapter declares it in the authorization's artifact map and gets
 * it back tagged `json`, `text`, or `absent`; a file the run never wrote is
 * `absent` there, which the harness classifies as a missing artifact. Parsing
 * and linting it are the harness's job, because a run that wrote an unparseable
 * file has produced a measurable result and not a lost run.
 *
 * It declares the one capability the workflow needs, `scoped-artifact-writes`:
 * the deliverable is a file inside the working directory, so claude runs with
 * its write tools and no shell, and codex under its workspace-write sandbox,
 * which is what the ci suite declares in the eval suite manifest. No
 * shell means the workflow's own "run the tests locally" pre-flight cannot
 * execute here; the harness's prompt says so and tells the run to record it
 * as not run rather than halt.
 *
 * Two nested wall clocks are in play when this runs behind the adapter, and the
 * inner one has to be the shorter of the two: --timeout-ms bounds the vendor
 * call and reports a timeout as exit 5, while the adapter's own maxElapsedMs
 * SIGKILLs this process and reports `budget-exhausted` with no exit code at all.
 * the probe-targets check sets the outer bound a minute above the harness's
 * own for exactly this reason.
 *
 * Usage:
 *   tea-ci-runner --agent codex < prompt.txt
 *   tea-ci-runner --agent custom --agent-cmd ./my-runner < prompt.txt
 *
 * Exit codes: 0 the agent ran to completion, and the classes in
 * cli/lib/runner-exit-codes.js otherwise. The table is shared with every other
 * TEA runner command, so all of them spell one class with one number.
 */

'use strict';

const fs = require('node:fs');
const { Command } = require('commander');

const { AGENT_ADAPTERS } = require('./lib/agent-adapters');
const { runAgent } = require('./lib/run-agent');
const { EXIT_CODES, classOfAgentError, failureClassForExit, vendorEnvironmentNames } = require('./lib/runner-exit-codes');

/** The same default the other runner commands declare, so this command changes no run that omits `--agent`. */
const DEFAULT_AGENT = 'claude';

/** Twenty minutes, matching RUN_TIMEOUT_MS in the ci eval harness, which is the only caller that measures. */
const DEFAULT_TIMEOUT_MS = 20 * 60_000;

/** A CI run writes its deliverable into the working directory; see the header. */
const RUNNER_CAPABILITIES = ['scoped-artifact-writes'];

/**
 * The request shape this command accepts, as the contract generator needs to
 * declare it.
 *
 * Read by tools/generate-contracts.js rather than transcribed there, which is
 * the rule test/contracts/README.md records for every declaration a command
 * owns. The option surface is tea-nfr-runner's, because both commands wrap one
 * `runAgent` call and differ only in what the run leaves behind.
 */
const CI_REQUEST_KEYS = {
  argument: { required: [], permitted: [] },
  option: {
    required: ['agent'],
    permitted: ['agent', 'agent-cmd', 'agent-arg', 'env-pass', 'model', 'timeout-ms'],
  },
  environment: { required: [], permitted: vendorEnvironmentNames() },
  stdin: { required: ['prompt'], permitted: ['prompt'] },
};

function collect(value, previous) {
  return [...previous, value];
}

/** Everything this process prints on stderr is diagnostic; stdout carries only what the agent printed. */
function fail(failureClass, message) {
  process.stderr.write(`tea-ci-runner: ${message}\n`);
  process.exit(EXIT_CODES[failureClass]);
}

function readPrompt() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (error) {
    fail('usage', `could not read the prompt from standard input: ${error.message}`);
    return '';
  }
}

function main(argv) {
  const program = new Command();
  program
    .name('tea-ci-runner')
    .description('Run a headless agent through the TEA CI pipeline workflow in the working directory, leaving the workflow file on disk.')
    .option('--agent <name>', `agent adapter (${Object.keys(AGENT_ADAPTERS).join('|')})`, DEFAULT_AGENT)
    .option('--agent-cmd <path>', 'executable override for the selected adapter')
    .option('--agent-arg <arg>', 'extra argument appended to the agent CLI argv (repeatable)', collect, [])
    .option('--env-pass <NAME>', 'environment variable name allowed through to the agent (repeatable)', collect, [])
    .option('--model <name>', 'model to pin for this run; defaults to the adapter default')
    .option('--timeout-ms <n>', 'agent wall-clock timeout in milliseconds', String(DEFAULT_TIMEOUT_MS));

  program.exitOverride();
  try {
    program.parse(argv);
  } catch (error) {
    // commander's own --help and --version exits are not usage errors.
    if (error.exitCode === 0) return;
    fail('usage', error.message);
  }

  const options = program.opts();
  if (!Object.hasOwn(AGENT_ADAPTERS, options.agent)) {
    fail('environment-configuration', `unknown agent "${options.agent}"; expected one of ${Object.keys(AGENT_ADAPTERS).join(', ')}`);
  }
  // Tested on the raw string before the parse. Number.parseInt truncates, so
  // values such as `20abc` and `1e9` otherwise become valid small timeouts.
  if (!/^[0-9]+$/.test(String(options.timeoutMs).trim())) {
    fail('usage', `--timeout-ms must be a positive integer; got ${JSON.stringify(options.timeoutMs)}`);
  }
  const timeout = Number.parseInt(options.timeoutMs, 10);
  if (!Number.isInteger(timeout) || timeout <= 0) {
    fail('usage', `--timeout-ms must be a positive integer; got ${JSON.stringify(options.timeoutMs)}`);
  }

  const prompt = readPrompt();
  if (prompt.trim().length === 0) {
    fail('usage', 'the prompt is empty; this command reads the complete prompt from standard input');
  }

  let stdout = '';
  try {
    ({ stdout } = runAgent(prompt, {
      agent: options.agent,
      agentCommand: options.agentCmd,
      agentArgs: options.agentArg,
      envPass: options.envPass,
      model: options.model,
      timeout,
      cwd: process.cwd(),
      capabilities: RUNNER_CAPABILITIES,
    }));
  } catch (error) {
    fail(classOfAgentError(error), error.message);
  }

  // What the agent printed, unchanged. The deliverable is the file it wrote, and
  // the prompt tells it nothing it prints is read, so this is diagnostic output
  // for an operator watching the run rather than a channel a caller scores.
  if (stdout.length > 0) process.stdout.write(stdout.endsWith('\n') ? stdout : `${stdout}\n`);
}

// Guarded so tools/generate-contracts.js can read the declarations above without
// running a command, the same way it reads NFR_REQUEST_KEYS out of
// cli/nfr-runner.js.
if (require.main === module) {
  main(process.argv);
}

module.exports = {
  DEFAULT_AGENT,
  DEFAULT_TIMEOUT_MS,
  EXIT_CODES,
  CI_REQUEST_KEYS,
  RUNNER_CAPABILITIES,
  classOfAgentError,
  failureClassForExit,
};
