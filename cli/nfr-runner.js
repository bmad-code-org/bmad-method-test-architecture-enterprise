#!/usr/bin/env node
/**
 * tea-nfr-runner — the command the NFR behavioral contract names.
 *
 * `bmad-testarch-nfr` audits the evidence a team already holds and writes one
 * deliverable, `{test_artifacts}/nfr-assessment.md`. Measuring that needs a
 * command to point at, and TEA shipped none: `tea-test-review`,
 * `tea-fragment-selection-runner`, and `tea-trace-runner` all exist and an NFR
 * runner did not. This file is that command, and its whole surface is one turn:
 *
 *   prompt on standard input -> the agent runs in the working directory
 *                            -> the workflow's report is left on disk
 *
 * It is `cli/trace-runner.js` with one artifact instead of two, deliberately:
 * the two commands wrap the same `runAgent` call, declare the same option
 * surface, and share one exit-code table, so a caller holding an observation
 * reads both the same way. The difference between them is which workflow the
 * prompt drives and what the run leaves behind, and neither of those is this
 * file's to know.
 *
 * The prompt belongs to the eval corpus, so this command builds none: it states
 * where the evidence bundle and the skill are, which placeholders to resolve,
 * and which file to write, and only the harness knows those things. The vendor
 * call is TEA's own (cli/lib/run-agent.js), so vendor argv, the minimal child
 * environment, the model pin, and the credential shape are decided in the one
 * place that already decides them for every other TEA command. This file adds
 * no vendor knowledge.
 *
 * The report is the workflow's, written where the prompt says to write it, and
 * this command neither names nor reads it. A caller behind eval-quality's
 * command-line adapter declares it in the authorization's artifact map and gets
 * it back tagged `json`, `text`, or `absent`; a file the run never wrote is
 * `absent` there, which the harness classifies as a missing artifact. Reading
 * the file here as well would be a second parser with its own opinion.
 *
 * It declares the one capability the workflow needs, `scoped-artifact-writes`:
 * the deliverable is a file inside the working directory, so claude runs with
 * its write tools and no shell, and codex under its workspace-write sandbox,
 * which is what the nfr suite declares in test/evals/suite-manifest.json.
 *
 * Two nested wall clocks are in play when this runs behind the adapter, and the
 * inner one has to be the shorter of the two: --timeout-ms bounds the vendor
 * call and reports a timeout as exit 5, while the adapter's own maxElapsedMs
 * SIGKILLs this process and reports `budget-exhausted` with no exit code at all.
 * A run that hits the outer bound first loses the classification the inner one
 * would have produced. test/lib/probe-targets.js sets the outer bound a minute
 * above the harness's own for exactly this reason.
 *
 * Usage:
 *   tea-nfr-runner --agent codex < prompt.txt
 *   tea-nfr-runner --agent custom --agent-cmd ./my-runner < prompt.txt
 *
 * Exit codes: 0 the agent ran to completion, and the classes in
 * cli/lib/runner-exit-codes.js otherwise. They are the exit codes because the
 * caller is a probe: the adapter records an exit code as an observation and
 * never as a fault, so the code is the only channel that survives the boundary
 * intact. The table is shared with every other TEA runner command, so all of
 * them spell one class with one number.
 */

'use strict';

const fs = require('node:fs');
const { Command } = require('commander');

const { AGENT_ADAPTERS } = require('./lib/agent-adapters');
const { runAgent } = require('./lib/run-agent');
const { EXIT_CODES, classOfAgentError, failureClassForExit, vendorEnvironmentNames } = require('./lib/runner-exit-codes');

/** The same default the other runner commands declare, so this command changes no run that omits `--agent`. */
const DEFAULT_AGENT = 'claude';

/** Twenty minutes, matching RUN_TIMEOUT_MS in test/eval-nfr.js, which is the only caller that measures. */
const DEFAULT_TIMEOUT_MS = 20 * 60_000;

/** An NFR run writes its one deliverable into the working directory; see the header. */
const RUNNER_CAPABILITIES = ['scoped-artifact-writes'];

/**
 * The request shape this command accepts, as the contract generator needs to
 * declare it.
 *
 * Read by tools/generate-contracts.js rather than transcribed there, which is
 * the rule test/contracts/README.md records for every declaration a command
 * owns: the transcribed versions had drifted before anybody measured them. The
 * option surface is tea-trace-runner's, because both commands wrap one
 * `runAgent` call and differ only in what the run leaves behind.
 */
const NFR_REQUEST_KEYS = {
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
  process.stderr.write(`tea-nfr-runner: ${message}\n`);
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
    .name('tea-nfr-runner')
    .description('Run a headless agent through the TEA NFR evidence audit in the working directory, leaving its report on disk.')
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
// running a command, the same way it reads TRACE_REQUEST_KEYS out of
// cli/trace-runner.js.
if (require.main === module) {
  main(process.argv);
}

module.exports = {
  DEFAULT_AGENT,
  DEFAULT_TIMEOUT_MS,
  EXIT_CODES,
  NFR_REQUEST_KEYS,
  RUNNER_CAPABILITIES,
  classOfAgentError,
  failureClassForExit,
};
