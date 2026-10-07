'use strict';

/**
 * The launcher of a Bubblewrap call that hides host sockets (Story 1.89, which replaced the shell launcher of Story 1.82):
 * the program the runtime starts first, outside the sandbox, which gives Bubblewrap its arguments file as descriptor 3 and
 * starts the command with the environment the call was given.
 *
 *   confinement-launcher.cjs <arguments file> <environment file> <command> [argument ...]
 *
 * The runtime's `eval-quality` engine spawns the call's command, so the runtime cannot hand `bwrap --args 3` a descriptor
 * itself, and a call whose mounts ride in the argument list would overflow the 9,000 arguments Bubblewrap accepts.
 * Node cannot replace its own process image with an inherited descriptor, since it opens every file close-on-exec, so this
 * process stays as the command's parent: it opens the arguments file, starts the command with that file as its descriptor 3 and
 * its own standard streams, passes the signals it receives on, and ends as the command ended.
 * No shell stands between the runtime and the command, so no name a shell treats specially can change.
 *
 * The call's environment travels in the environment file (JSON, one object of strings, mode 0600), which this process reads
 * and removes before anything else runs.
 * This process is started with the loader variables the engine's own watchdog carries and nothing else: Node reads
 * `NODE_OPTIONS` and its kin, which could name a script this process would run outside the sandbox, and Node's `process.env`
 * cannot read a variable whose name is a decimal integer.
 * The command starts with the environment object from the file and nothing else, as the engine's own spawn starts a command.
 *
 * The command runs in this process's group, so the engine's group kill reaches it and Bubblewrap's `--die-with-parent`
 * ties the sandbox to this process.
 * A signal this process receives is passed to the command; a command a signal ended ends this process by the same signal.
 * A command that cannot start ends this process with 127 (not found) or 126 (not runnable), as a shell would, its reason on
 * standard error, and so does an arguments file this process cannot open.
 * A command whose arguments and environment the operating system refuses (`E2BIG`) ends this process with
 * `EXIT_LAUNCH_TOO_LARGE` and `LAUNCH_TOO_LARGE_TOKEN` on standard error, which the runtime reads as the engine's own refusal of a
 * launch for its size.
 *
 * The file is also a module for the runtime's tests: required, it starts nothing.
 * It requires nothing of the repository: the runtime starts it before any sandbox exists, with the runtime's own privileges,
 * so what it reads is the two files and the command's own text.
 */

const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');

/** The signals this process passes to the command. */
const FORWARDED = Object.freeze(['SIGTERM', 'SIGINT', 'SIGHUP', 'SIGQUIT', 'SIGUSR1', 'SIGUSR2']);

/** The exit code of a launcher whose command the operating system refused for the size of its arguments and environment. */
const EXIT_LAUNCH_TOO_LARGE = 125;

/** What the launcher writes to standard error before it ends with `EXIT_LAUNCH_TOO_LARGE`. */
const LAUNCH_TOO_LARGE_TOKEN = 'confinement-launcher: E2BIG';

/** The position of the arguments file among the command's descriptors: Bubblewrap reads it with `--args 3`. */
const ARGUMENTS_DESCRIPTOR = 3;

/** Writes to standard error through the descriptor, which leaves its flags as the runtime set them (Node's stream would make a pipe non-blocking for the command too). */
function say(text) {
  try {
    fs.writeSync(2, `${text}\n`);
  } catch {
    // A closed standard error has no reader to tell.
  }
}

/**
 * The environment the file holds, removed once read: an object whose every value is a string, or a reason it is not.
 *
 * @param {string} file
 * @returns {{ environment: Record<string, string> } | { failure: string }}
 */
function readEnvironment(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    return { failure: `cannot read the environment file: ${error.message}` };
  } finally {
    fs.rmSync(file, { force: true });
  }
  let environment;
  try {
    environment = JSON.parse(text);
  } catch (error) {
    return { failure: `the environment file is no JSON: ${error.message}` };
  }
  if (
    environment === null ||
    typeof environment !== 'object' ||
    Array.isArray(environment) ||
    Object.values(environment).some((value) => typeof value !== 'string')
  ) {
    return { failure: 'the environment file does not hold one object of strings' };
  }
  return { environment };
}

/**
 * The arguments of a launcher call.
 *
 * @param {string[]} argv the arguments after the script's path
 * @returns {{ argumentsFile: string, environmentFile: string, command: string, args: string[] } | null} `null` for a call with too few arguments
 */
function parseArguments(argv) {
  const [argumentsFile, environmentFile, command, ...args] = argv;
  if (typeof argumentsFile !== 'string' || typeof environmentFile !== 'string' || typeof command !== 'string') return null;
  return { argumentsFile, environmentFile, command, args };
}

/** Says why the command did not start and returns the exit code that tells it: 127 not found, 125 too large, 126 anything else. */
function failedStart(command, error) {
  if (error.code === 'E2BIG') {
    say(`${LAUNCH_TOO_LARGE_TOKEN}: ${command}: ${error.message}`);
    return EXIT_LAUNCH_TOO_LARGE;
  }
  say(`${command}: ${error.message}`);
  return error.code === 'ENOENT' ? 127 : 126;
}

function main() {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed === null) {
    say('usage: confinement-launcher.cjs <arguments file> <environment file> <command> [argument ...]');
    process.exitCode = 126;
    return;
  }
  const { argumentsFile, environmentFile, command, args } = parsed;
  const read = readEnvironment(environmentFile);
  if ('failure' in read) {
    say(`${read.failure}`);
    process.exitCode = 126;
    return;
  }
  let descriptor;
  try {
    descriptor = fs.openSync(argumentsFile, 'r');
  } catch (error) {
    say(`${argumentsFile}: ${error.message}`);
    process.exitCode = 126;
    return;
  }
  const stdio = ['inherit', 'inherit', 'inherit'];
  stdio[ARGUMENTS_DESCRIPTOR] = descriptor;
  let child;
  try {
    child = spawn(command, args, { stdio, env: read.environment });
  } catch (error) {
    fs.closeSync(descriptor);
    process.exitCode = failedStart(command, error);
    return;
  }
  // The command's copy is its own: this process needs none once the command has started or failed to.
  const release = () => {
    try {
      fs.closeSync(descriptor);
    } catch {
      // Closed already.
    }
  };
  child.once('spawn', release);
  for (const name of FORWARDED) process.on(name, () => child.kill(name));
  child.once('error', (error) => {
    release();
    process.exitCode = failedStart(command, error);
  });
  // Nothing else holds the event loop, so this process ends once the command has, with the exit code set here.
  child.once('exit', (code, signal) => {
    release();
    if (signal === null) {
      process.exitCode = code ?? 1;
      return;
    }
    for (const name of FORWARDED) process.removeAllListeners(name);
    // A signal this process ignores (SIGPIPE) leaves it running, so it then ends as a shell reports a signalled child: 128 plus
    // the signal's number.
    process.exitCode = 128 + (os.constants.signals[signal] ?? 0);
    process.kill(process.pid, signal);
  });
}

if (require.main === module) main();

module.exports = { ARGUMENTS_DESCRIPTOR, EXIT_LAUNCH_TOO_LARGE, FORWARDED, LAUNCH_TOO_LARGE_TOKEN, parseArguments, readEnvironment };
