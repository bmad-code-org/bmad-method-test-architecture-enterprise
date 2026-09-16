#!/usr/bin/env node
/**
 * tea-atdd-runner — the command the ATDD behavioral contract names for
 * generation.
 *
 * `bmad-testarch-atdd` reads a story's acceptance criteria and writes red-phase
 * test scaffolds under the project's `tests/` directory, one deliverable this
 * eval measures by executing rather than reading. Generation and execution are
 * two separate commands: this one drives the workflow and leaves the scaffolds
 * on disk, and `cli/atdd-red-check.js` is the deterministic, no-vendor tool that
 * activates and executes what this command wrote, under isolation. Splitting
 * them is what lets the execution half run with no credential and the
 * generation half be measured by the eval-quality contract that names it.
 *
 * Its whole surface is one turn:
 *
 *   prompt on standard input -> the agent runs in the working directory
 *                            -> the workflow's test files are left on disk
 *
 * It is `cli/nfr-runner.js` with a different capability comment and nothing
 * else structurally new: the two commands wrap the same `runAgent` call,
 * declare the same option surface, and share one exit-code table.
 *
 * The prompt belongs to the eval corpus, so this command builds none: it
 * states the story, the fixture project, which placeholders to resolve, and
 * that tests belong under `tests/`, and only the harness knows those things.
 * The vendor call is TEA's own (cli/lib/run-agent.js).
 *
 * It declares the one capability the workflow needs, `scoped-artifact-writes`:
 * the deliverable is a set of files inside the working directory, so claude
 * runs with its write tools and no shell, and codex under its workspace-write
 * sandbox, which is what the atdd suite declares in
 * test/evals/suite-manifest.json.
 *
 * Usage:
 *   tea-atdd-runner --agent codex < prompt.txt
 *   tea-atdd-runner --agent custom --agent-cmd ./my-runner < prompt.txt
 *
 * Exit codes: 0 the agent ran to completion, and the classes in
 * cli/lib/runner-exit-codes.js otherwise.
 */

'use strict';

const fs = require('node:fs');
const { Command } = require('commander');

const { AGENT_ADAPTERS } = require('./lib/agent-adapters');
const { runAgent } = require('./lib/run-agent');
const { EXIT_CODES, classOfAgentError, failureClassForExit, vendorEnvironmentNames } = require('./lib/runner-exit-codes');

/** The same default the other runner commands declare, so this command changes no run that omits `--agent`. */
const DEFAULT_AGENT = 'claude';

/** Twenty minutes, matching RUN_TIMEOUT_MS in test/eval-atdd.js, the only caller that measures. */
const DEFAULT_TIMEOUT_MS = 20 * 60_000;

/** An ATDD generation run writes test files into the working directory; see the header. */
const RUNNER_CAPABILITIES = ['scoped-artifact-writes'];

/**
 * The request shape this command accepts, as the contract generator needs to
 * declare it. Read by tools/generate-contracts.js rather than transcribed
 * there; the option surface is tea-nfr-runner's and tea-trace-runner's, because
 * all three commands wrap one `runAgent` call and differ only in what the run
 * leaves behind.
 */
const ATDD_REQUEST_KEYS = {
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
  process.stderr.write(`tea-atdd-runner: ${message}\n`);
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
    .name('tea-atdd-runner')
    .description(
      'Run a headless agent through the TEA ATDD red-phase generation workflow in the working directory, leaving its test files on disk.',
    )
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
    if (error.exitCode === 0) return;
    fail('usage', error.message);
  }

  const options = program.opts();
  if (!Object.hasOwn(AGENT_ADAPTERS, options.agent)) {
    fail('environment-configuration', `unknown agent "${options.agent}"; expected one of ${Object.keys(AGENT_ADAPTERS).join(', ')}`);
  }
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

  if (stdout.length > 0) process.stdout.write(stdout.endsWith('\n') ? stdout : `${stdout}\n`);
}

if (require.main === module) {
  main(process.argv);
}

module.exports = {
  DEFAULT_AGENT,
  DEFAULT_TIMEOUT_MS,
  EXIT_CODES,
  ATDD_REQUEST_KEYS,
  RUNNER_CAPABILITIES,
  classOfAgentError,
  failureClassForExit,
};
