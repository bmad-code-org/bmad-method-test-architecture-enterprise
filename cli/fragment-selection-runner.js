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
 * file adds no vendor knowledge.
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
 * Exit codes: 0 a selection was produced, and the classes below otherwise. They
 * are the exit codes because the caller is a probe: the adapter records an exit
 * code as an observation and never as a fault, so the code is the only channel
 * that survives the boundary intact.
 */

'use strict';

const fs = require('node:fs');
const { Command } = require('commander');

const { AGENT_ADAPTERS } = require('./lib/agent-adapters');
const { parseSelection } = require('./lib/parse-selection');
const { runAgent } = require('./lib/run-agent');

/** The same default `test/eval-fragment-selection.js` applies and `cli/test-review.js` declares, so this command changes no run that omits `--agent`. */
const DEFAULT_AGENT = 'claude';

/** Five minutes, matching RUN_TIMEOUT_MS in test/eval-fragment-selection.js, which is the only caller that measures. */
const DEFAULT_TIMEOUT_MS = 5 * 60_000;

/**
 * Exit code per outcome, and the single source of truth for it.
 *
 * The names are TEA's own failure classes (test/schema/eval-result.js), so a
 * caller reading an exit code back off a probe observation lands on the class it
 * would have derived from a thrown error, with no second table to keep in step.
 * `usage` has no failure class: a malformed invocation is the caller's defect,
 * not the environment's, and it is spelled 2 because every TEA harness already
 * spells a usage error 2.
 */
const EXIT_CODES = {
  none: 0,
  usage: 2,
  'environment-configuration': 3,
  'environment-transport': 4,
  'environment-timeout': 5,
  'environment-parser': 6,
};

/** The reverse of EXIT_CODES, for a caller holding an observation's exitCode. */
function failureClassForExit(code) {
  const entry = Object.entries(EXIT_CODES).find(([, value]) => value === code);
  return entry === undefined ? 'environment-transport' : entry[0];
}

/**
 * The request shape this command accepts, as the contract generator needs to
 * declare it.
 *
 * Read by tools/generate-contracts.js rather than transcribed there, which is
 * the rule test/contracts/README.md already records for `tea-test-review`'s
 * verdict descriptor: the transcribed version had drifted by seven keys before
 * anybody measured it.
 *
 * The permitted environment names are the union of every adapter's own
 * `envNames`, because those are the variables a vendor call can actually
 * consume, plus HOME and USER. Those two are not decoration: eval-quality's
 * command-line adapter passes the child nothing but PATH and the names the
 * request declares, and both shipped vendors resolve a stored login through
 * HOME. A leg that declares neither can only authenticate from an API key.
 */
const SELECTION_REQUEST_KEYS = {
  argument: { required: [], permitted: [] },
  option: {
    required: ['agent'],
    permitted: ['agent', 'agent-cmd', 'agent-arg', 'env-pass', 'model', 'timeout-ms'],
  },
  environment: {
    required: [],
    permitted: [...new Set([...Object.values(AGENT_ADAPTERS).flatMap((adapter) => adapter.envNames), 'HOME', 'USER'])].sort(),
  },
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

/**
 * A thrown runAgent error, as one of this command's classes.
 *
 * The mapping is test/lib/eval-record.js's `classifyAgentError`, restated here
 * rather than imported: this file ships in the package and that one lives under
 * test/, so importing it would put the eval harness on the published dependency
 * path. Restating it is only safe while the two agree, so it is exported and
 * test/test-probe-targets.js runs both over the same nine error shapes and
 * compares the answers.
 */
function classOfAgentError(error) {
  if (error.code === 'AGENT_UNKNOWN' || error.code === 'AGENT_COMMAND_REQUIRED' || String(error.code).startsWith('MODEL_')) {
    return 'environment-configuration';
  }
  if (error.code === 'AGENT_NOT_FOUND') return 'environment-transport';
  if (/timed out/i.test(error.message)) return 'environment-timeout';
  return 'environment-transport';
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

module.exports = { DEFAULT_AGENT, DEFAULT_TIMEOUT_MS, EXIT_CODES, SELECTION_REQUEST_KEYS, classOfAgentError, failureClassForExit };
