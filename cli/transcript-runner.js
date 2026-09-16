#!/usr/bin/env node
/**
 * tea-transcript-runner — one turn of a multi-turn agent session.
 *
 * `test/lib/transcript-harness.js` drives a whole session by calling this
 * command once per turn, in one persistent workspace, so the workflow it
 * exercises can read what an earlier turn left on disk even though each turn
 * is a fresh process with no memory of its own. This file is one turn's whole
 * surface, and it is `cli/nfr-runner.js` unchanged in shape:
 *
 *   prompt on standard input -> the agent runs in the working directory
 *                            -> whatever it wrote stays in the workspace
 *                            -> its final reply is printed on standard output
 *
 * It carries no notion of "turn one" or "turn three": the harness assembles
 * each turn's prompt through its own `buildTurnPrompt` callback, and whatever
 * state a session needs across turns is whatever the agent (or, in a scripted
 * proof, the stand-in for one) chooses to leave in the workspace. That is what
 * keeps this command reusable for a story this one does not know about:
 * Story 6.11 measures `bmad-teach-me-testing`, a real multi-turn teaching
 * session, through the same engine and the same runner.
 *
 * The prompt belongs to whichever caller is driving the session — the
 * transcript harness's registered suite, or a caller like Story 6.11's own —
 * so this command builds none: it just carries the turn's prompt in and the
 * turn's reply out. The vendor call is TEA's own (cli/lib/run-agent.js), so
 * vendor argv, the minimal child environment, the model pin, and the
 * credential shape are decided in the one place that already decides them for
 * every other TEA command. This file adds no vendor knowledge.
 *
 * It declares `scoped-artifact-writes`: a turn may need to leave something in
 * the workspace for a later turn to read (a teaching session's own progress
 * note, a scripted stub's turn counter), so the agent runs with its write
 * tools and no shell, and codex under its workspace-write sandbox.
 *
 * Usage:
 *   tea-transcript-runner --agent codex < turn-prompt.txt
 *   tea-transcript-runner --agent custom --agent-cmd ./my-runner < turn-prompt.txt
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

/**
 * Ten minutes. A single conversational turn is lighter than a whole workflow
 * read, so this sits below RUN_TIMEOUT_MS in test/eval-nfr.js and
 * test/eval-trace.js rather than matching it; a caller whose own turn is
 * heavier, the way Story 6.11's teaching turns may be, raises it with
 * `--timeout-ms`.
 */
const DEFAULT_TIMEOUT_MS = 10 * 60_000;

/** A turn may leave state in the workspace for a later turn to read; see the header. */
const RUNNER_CAPABILITIES = ['scoped-artifact-writes'];

/**
 * The request shape this command accepts, as the contract generator needs to
 * declare it. This suite carries no eval-quality contract (see
 * test/contracts/README.md's boundary for why a harness-proof suite does not),
 * so nothing reads this today; it is declared anyway, in the same shape every
 * other TEA runner carries it, so a future contract can read it rather than
 * transcribe it. The option surface is tea-nfr-runner's, because both commands
 * wrap one `runAgent` call and differ only in what the run leaves behind.
 */
const TRANSCRIPT_REQUEST_KEYS = {
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
  process.stderr.write(`tea-transcript-runner: ${message}\n`);
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
    .name('tea-transcript-runner')
    .description('Run one turn of a headless agent session in the working directory, printing the reply on standard output.')
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
    fail('usage', 'the prompt is empty; this command reads the complete turn prompt from standard input');
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

  // What the agent printed, unchanged. This is the turn's reply: the caller
  // (test/lib/transcript-harness.js) reads it off the observation's stdout and
  // hands it to the next turn's buildTurnPrompt as prior-turn context.
  if (stdout.length > 0) process.stdout.write(stdout.endsWith('\n') ? stdout : `${stdout}\n`);
}

// Guarded so a future contract generator can read the declarations above
// without running a command, the same way tools/generate-contracts.js reads
// NFR_REQUEST_KEYS out of cli/nfr-runner.js.
if (require.main === module) {
  main(process.argv);
}

module.exports = {
  DEFAULT_AGENT,
  DEFAULT_TIMEOUT_MS,
  EXIT_CODES,
  TRANSCRIPT_REQUEST_KEYS,
  RUNNER_CAPABILITIES,
  classOfAgentError,
  failureClassForExit,
};
