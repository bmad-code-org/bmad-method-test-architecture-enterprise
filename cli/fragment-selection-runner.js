#!/usr/bin/env node
/**
 * tea-fragment-selection-runner — the command the eight fragment-selection
 * contracts declare.
 *
 * Those contracts named `tea-fragment-selection-runner` before anything by that
 * name existed. A contract that names an executable nobody ships compiles, is
 * scheduled by pre-flight, and then cannot be run, which is a worse failure than
 * a declared gap because the gate stays green. This file is that executable.
 *
 * The whole surface is one turn:
 *
 *   prompt on standard input -> {"fragments": ["a.md", "b.md"]} on standard output
 *
 * which is exactly what each contract's operation declares: `stdin` carries the
 * one required key, `descriptorChannel` is the stdout stream, and the response
 * descriptor requires `fragments` and permits nothing else. The prompt itself
 * stays the harness's to assemble, because it is built from workflow step files
 * and per-case repository facts that belong to the eval corpus rather than to
 * this command.
 *
 * The agent call is TEA's own (cli/lib/run-agent.js), so vendor argv, the
 * minimal child environment, the model pin, and the credential shape are all
 * decided in the one place that already decides them for tea-test-review. This
 * file adds no vendor knowledge. It does declare the one capability the
 * operation needs, `read-only`: the reply is a JSON object on standard output
 * and nothing about it requires a file, so claude runs with no write tool and
 * codex under its read-only sandbox, which is what the fragment-selection suite
 * declares in test/evals/suite-manifest.json.
 *
 * Two nested wall clocks are in play when this runs behind eval-quality's
 * command-line adapter, and the inner one has to be the shorter of the two:
 * --timeout-ms bounds the vendor call and reports a timeout as exit 5, while the
 * adapter's own maxElapsedMs SIGKILLs this process and reports `budget-exhausted`
 * with no exit code at all. A run that hits the outer bound first loses the
 * classification the inner one would have produced.
 *
 * Usage:
 *   tea-fragment-selection-runner --agent codex < prompt.txt
 *   tea-fragment-selection-runner --agent custom --agent-cmd ./my-runner < prompt.txt
 *
 * Exit codes: 0 a selection was produced, and the classes in
 * cli/lib/runner-exit-codes.js otherwise. They are the exit codes because the
 * caller is a probe: the adapter records an exit code as an observation and never
 * as a fault, so the code is the only channel that survives the boundary intact.
 * The table is shared with tea-trace-runner so both commands spell one class with
 * one number.
 */

'use strict';

const fs = require('node:fs');
const { Command } = require('commander');

const { AGENT_ADAPTERS } = require('./lib/agent-adapters');
const { parseSelection } = require('./lib/parse-selection');
const { runAgent } = require('./lib/run-agent');
const { EXIT_CODES, classOfAgentError, failureClassForExit, vendorEnvironmentNames } = require('./lib/runner-exit-codes');

/** The same default `test/eval-fragment-selection.js` applies and `cli/test-review.js` declares, so this command changes no run that omits `--agent`. */
const DEFAULT_AGENT = 'claude';

/** Five minutes, matching RUN_TIMEOUT_MS in test/eval-fragment-selection.js, which is the only caller that measures. */
const DEFAULT_TIMEOUT_MS = 5 * 60_000;

/** A selection is a reply, so the runner needs to write nothing; see the header. */
const RUNNER_CAPABILITIES = ['read-only'];

/**
 * The request shape this command accepts, as the contract generator needs to
 * declare it.
 *
 * Read by tools/generate-contracts.js rather than transcribed there, which is
 * the rule test/contracts/README.md already records for `tea-test-review`'s
 * verdict descriptor: the transcribed version had drifted by seven keys before
 * anybody measured it.
 *
 * The permitted environment names are the vendor variables plus HOME and USER;
 * cli/lib/runner-exit-codes.js states why those two are load-bearing.
 */
const SELECTION_REQUEST_KEYS = {
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

/** Everything this process prints on stderr is diagnostic; stdout carries the selection alone. */
function fail(failureClass, message) {
  process.stderr.write(`tea-fragment-selection-runner: ${message}\n`);
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
    .name('tea-fragment-selection-runner')
    .description('Ask a headless agent which TEA knowledge fragments a run must load, and print the answer as JSON.')
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
  // `--timeout-ms 20abc` became 20 and every run then timed out at twenty
  // milliseconds, and `--timeout-ms 1e9` became 1.
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

  const fragments = parseSelection(stdout);
  if (fragments === null) {
    fail('environment-parser', 'the agent reply carries no fragment list');
  }

  // Exactly the response descriptor's key set, and nothing beside it: the
  // descriptor permits `fragments` alone, so a diagnostic field added here would
  // fail the contract it exists to satisfy.
  process.stdout.write(`${JSON.stringify({ fragments })}\n`);
}

// Guarded so tools/generate-contracts.js can read the declarations above without
// running a command, the same way it reads VERDICT_KEYS out of cli/test-review.js.
if (require.main === module) {
  main(process.argv);
}

module.exports = {
  DEFAULT_AGENT,
  DEFAULT_TIMEOUT_MS,
  EXIT_CODES,
  RUNNER_CAPABILITIES,
  SELECTION_REQUEST_KEYS,
  classOfAgentError,
  failureClassForExit,
};
