#!/usr/bin/env node
/**
 * tea-skill-runner: the generic runner Evaluate registers for a skill target (AD-4).
 *
 * Every other `cli/*-runner.js` wraps one TEA workflow, and each is the same
 * turn: a prompt on standard input, one `runAgent` call in the working
 * directory, the classes of `cli/lib/runner-exit-codes.js` as exit codes. This
 * command is that turn with the workflow taken out of the file. The skill is
 * named on the command line by `--skill-root`, a directory holding `SKILL.md`,
 * and the runner tells the agent where it is:
 *
 *   --skill-root <dir> + prompt on stdin -> the agent runs the skill in the working directory
 *
 * The skill root is explicit and resolved against the working directory, and it
 * must sit inside that directory. Evaluate runs a skill in a copy of the
 * evaluated project, so a root outside the copy would evaluate a skill the run
 * did not stage. The runner never looks for a skill anywhere else: no home
 * directory, no agent-specific skills folder, no installed module layout.
 *
 * Vendor knowledge stays in `cli/lib/agent-adapters.js`, which `runAgent`
 * reads. `--agent` is required and has no default, so this file names no
 * vendor. `npm run test:evaluate-boundaries` holds both rules over this file.
 *
 * The prompt belongs to the evaluation: this command prepends only the lines
 * that say where the skill is, and prints what the agent printed. A caller behind
 * eval-quality's command-line adapter reads the agent's stdout and any artifact
 * the prompt asked for, declared in the registry entry's artifact map.
 *
 * Usage:
 *   tea-skill-runner --skill-root skills/my-skill --agent <adapter> < prompt.txt
 *   tea-skill-runner --skill-root skills/my-skill --agent custom --agent-cmd ./my-runner < prompt.txt
 *
 * Exit codes: 0 the agent ran to completion; 2 a usage error (a missing or
 * malformed option, an empty prompt or one that is not UTF-8, a skill root
 * outside the working directory); 3 to 6 the infrastructure classes of
 * `cli/lib/runner-exit-codes.js` (configuration, transport, timeout, parser).
 * An unexpected error, and a standard output closed before the agent's reply
 * was written, are reported as transport (4), so no failure reaches the
 * caller as Node's own exit 1. A
 * registry entry for this runner declares `infrastructureExitCodes` 3 to 6
 * (`INFRASTRUCTURE_EXIT_CODES`), so exit 2 reaches CI as a wiring defect.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Command } = require('commander');

const { AGENT_ADAPTERS, DEFAULT_CAPABILITIES, RUNNER_CAPABILITIES } = require('./lib/agent-adapters');
const { runAgent } = require('./lib/run-agent');
const { EXIT_CODES, classOfAgentError } = require('./lib/runner-exit-codes');

const NAME = 'tea-skill-runner';
const SKILL_ENTRY = 'SKILL.md';

/** Twenty minutes, the wall clock TEA's own skill runners default to. */
const DEFAULT_TIMEOUT_MS = 20 * 60_000;

/** The exit codes by which this runner reports that it could not run: every class of the shared table except success and usage. */
const INFRASTRUCTURE_EXIT_CODES = Object.freeze(
  Object.entries(EXIT_CODES)
    .filter(([name]) => name !== 'none' && name !== 'usage')
    .map(([, code]) => code)
    .sort((a, b) => a - b),
);

class RunnerExit extends Error {
  constructor(failureClass, message) {
    super(message);
    this.failureClass = failureClass;
  }
}

function collect(value, previous) {
  return [...previous, value];
}

/**
 * The prompt, decoded strictly: bytes that are not UTF-8 are a usage error,
 * since a lossy decode would hand the agent replacement characters in place of
 * what the caller sent. A byte order mark is kept, so the agent receives the
 * caller's bytes unchanged.
 */
function readPrompt() {
  let bytes;
  try {
    bytes = fs.readFileSync(0);
  } catch (error) {
    throw new RunnerExit('usage', `could not read the prompt from standard input: ${error.message}`);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new RunnerExit('usage', 'the prompt on standard input is not valid UTF-8');
  }
}

/** Whether `candidate` is `root` or a path inside it. */
function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

// C0 and C1 controls, DEL, a backtick, the line and paragraph separators and
// the bidirectional formatting characters: the skill root is written into the
// agent's prompt between backticks, so any of them could end the path early or
// hide what follows it.
// eslint-disable-next-line no-control-regex
const UNQUOTABLE = /[\u0000-\u001F\u007F-\u009F`\u061C\u200E\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069]/u;

/**
 * The skill root as a path relative to the working directory, after checking
 * that it is inside it and holds `SKILL.md`. Symbolic links are resolved first,
 * for the directory and for `SKILL.md` alike, so a link cannot place the skill
 * outside the working directory.
 */
function resolveSkillRoot(value, cwd) {
  const realCwd = fs.realpathSync(cwd);
  // A relative value is held inside the working directory before anything is
  // resolved. An absolute one is compared after symbolic links are resolved
  // below, since the working directory itself may sit under a link (`/tmp` on
  // macOS) that an absolute value spells either way.
  if (!path.isAbsolute(value) && !isInside(realCwd, path.resolve(realCwd, value))) {
    throw new RunnerExit('usage', `--skill-root ${JSON.stringify(value)} is outside the working directory ${realCwd}`);
  }
  const lexical = path.resolve(realCwd, value);
  let real;
  try {
    real = fs.realpathSync(lexical);
  } catch (error) {
    throw new RunnerExit('environment-configuration', `--skill-root ${JSON.stringify(value)} does not exist: ${error.message}`);
  }
  if (!isInside(realCwd, real)) {
    throw new RunnerExit('usage', `--skill-root ${JSON.stringify(value)} resolves to ${real}, outside the working directory ${realCwd}`);
  }
  if (!fs.statSync(real).isDirectory()) {
    throw new RunnerExit('environment-configuration', `--skill-root ${JSON.stringify(value)} is not a directory`);
  }
  const entry = path.join(real, SKILL_ENTRY);
  if (!fs.existsSync(entry) || !fs.statSync(entry).isFile()) {
    throw new RunnerExit('environment-configuration', `--skill-root ${JSON.stringify(value)} holds no ${SKILL_ENTRY}`);
  }
  const realEntry = fs.realpathSync(entry);
  if (!isInside(realCwd, realEntry)) {
    throw new RunnerExit(
      'usage',
      `${SKILL_ENTRY} under --skill-root ${JSON.stringify(value)} resolves to ${realEntry}, outside the working directory`,
    );
  }
  const relative = path.relative(realCwd, real).split(path.sep).join('/');
  if (UNQUOTABLE.test(relative)) {
    throw new RunnerExit('usage', `--skill-root ${JSON.stringify(value)} holds a character the agent's prompt cannot quote`);
  }
  return relative === '' ? '.' : relative;
}

/** The prompt the agent receives: where the skill is, then the evaluation's own prompt unchanged. */
function skillPrompt(skillRoot, prompt) {
  return [
    `The skill to run is in \`${skillRoot}\`. Read \`${skillRoot}/${SKILL_ENTRY}\` first and follow it for the request below.`,
    'Resolve every path the skill names against that directory; resolve every other path against the working directory.',
    '',
    '----- request -----',
    prompt,
  ].join('\n');
}

function parseOptions(argv) {
  const program = new Command();
  program
    .name(NAME)
    .description('Run a headless agent through the skill at --skill-root, with the prompt on standard input.')
    .requiredOption('--skill-root <dir>', `the skill directory, holding ${SKILL_ENTRY}, inside the working directory`)
    .requiredOption('--agent <name>', `agent adapter (${Object.keys(AGENT_ADAPTERS).join('|')})`)
    .option('--agent-cmd <path>', 'executable override for the selected adapter')
    .option('--agent-arg <arg>', 'extra argument appended to the agent CLI argv (repeatable)', collect, [])
    .option('--env-pass <NAME>', 'environment variable name allowed through to the agent (repeatable)', collect, [])
    .option('--model <name>', 'model to pin for this run; defaults to the adapter default')
    .option('--timeout-ms <n>', 'agent wall-clock timeout in milliseconds', String(DEFAULT_TIMEOUT_MS))
    .option('--capability <tier>', `what the run may do to the filesystem (${RUNNER_CAPABILITIES.join('|')}; repeatable)`, collect, [])
    .exitOverride()
    // commander's own error line is dropped: `main` prints the one usage line.
    .configureOutput({ writeErr: () => {} });
  try {
    program.parse(argv);
  } catch (error) {
    // commander's own --help and --version exits are not usage errors.
    if (error.exitCode === 0) return null;
    throw new RunnerExit('usage', error.message);
  }
  return program.opts();
}

function run(argv) {
  const options = parseOptions(argv);
  if (options === null) return;
  // Tested on the raw string before the parse, because Number.parseInt reads
  // `20abc` as 20 and `1e9` as 1.
  if (!/^[0-9]+$/.test(String(options.timeoutMs).trim()) || Number.parseInt(options.timeoutMs, 10) <= 0) {
    throw new RunnerExit('usage', `--timeout-ms must be a positive integer; got ${JSON.stringify(options.timeoutMs)}`);
  }
  const unknown = options.capability.filter((tier) => !RUNNER_CAPABILITIES.includes(tier));
  if (unknown.length > 0) {
    throw new RunnerExit('usage', `--capability ${JSON.stringify(unknown[0])} is not one of ${RUNNER_CAPABILITIES.join(', ')}`);
  }
  if (String(options.skillRoot).trim().length === 0) throw new RunnerExit('usage', '--skill-root is empty');
  // After every usage check, so a malformed command line is reported as one
  // whatever else is wrong with it.
  if (!Object.hasOwn(AGENT_ADAPTERS, options.agent)) {
    throw new RunnerExit(
      'environment-configuration',
      `unknown agent ${JSON.stringify(options.agent)}; expected one of ${Object.keys(AGENT_ADAPTERS).join(', ')}`,
    );
  }

  const cwd = process.cwd();
  const skillRoot = resolveSkillRoot(options.skillRoot, cwd);
  const prompt = readPrompt();
  if (prompt.trim().length === 0) {
    throw new RunnerExit('usage', 'the prompt is empty; this command reads the complete prompt from standard input');
  }

  let stdout;
  try {
    ({ stdout } = runAgent(skillPrompt(skillRoot, prompt), {
      agent: options.agent,
      agentCommand: options.agentCmd,
      agentArgs: options.agentArg,
      envPass: options.envPass,
      model: options.model,
      timeout: Number.parseInt(options.timeoutMs, 10),
      cwd,
      capabilities: options.capability.length > 0 ? options.capability : DEFAULT_CAPABILITIES,
    }));
  } catch (error) {
    throw new RunnerExit(classOfAgentError(error), error.message);
  }
  if (stdout.length > 0) process.stdout.write(stdout.endsWith('\n') ? stdout : `${stdout}\n`);
}

/**
 * Runs the command line and returns the exit code.
 *
 * @param {string[]} argv
 * @returns {number}
 */
function main(argv) {
  try {
    run(argv);
    return EXIT_CODES.none;
  } catch (error) {
    if (error instanceof RunnerExit) {
      process.stderr.write(`${NAME}: ${error.message}\n`);
      return EXIT_CODES[error.failureClass];
    }
    process.stderr.write(`${NAME}: unexpected error: ${error?.stack ?? error}\n`);
    return EXIT_CODES['environment-transport'];
  }
}

/**
 * A standard output the reader closed early (`| head`) raises EPIPE after
 * `main` has returned. The agent's reply did not reach the caller, which is
 * transport (4); left unhandled it would crash the runner with Node's exit 1.
 */
function onStdoutError(error) {
  process.stderr.write(`${NAME}: could not write the agent's output: ${error.message}\n`);
  process.exitCode = EXIT_CODES['environment-transport'];
}

if (require.main === module) {
  process.stdout.on('error', onStdoutError);
  process.exitCode = main(process.argv);
}

module.exports = { DEFAULT_TIMEOUT_MS, INFRASTRUCTURE_EXIT_CODES, main, skillPrompt };
