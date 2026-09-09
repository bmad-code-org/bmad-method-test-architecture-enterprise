/**
 * TEA's command execution targets, and the eval-quality environment-probe port
 * over them.
 *
 * Every TEA harness used to spawn the command it measures itself: its own
 * `spawnSync`, its own argv assembly, its own timeout, its own
 * `existsSync` plus `JSON.parse` on whatever file the run wrote. Three copies,
 * none of them agreeing on what a command is allowed to do, and none of them
 * capping output at all. `eval-quality`'s `createCommandLineAdapter` is that
 * mechanism written once, with the decisions stated: `shell: false` always,
 * argv built options-then-positionals, the child environment closed to PATH plus
 * what the request declares, `maxElapsedMs` and `maxOutputBytes` enforced with
 * SIGKILL, an artifact capped before its bytes are read, and a non-zero exit
 * treated as an observation rather than a fault.
 *
 * What this module adds is the half `eval-quality` deliberately leaves to its
 * caller. `CommandTargetPolicy` denies by default and permits only what a
 * mapping names, and nothing in the contract says which real executable a
 * logical name resolves to. That mapping is TEA's, and it lives here:
 *
 *   contract says            policy says                    adapter spawns
 *   executable: "tea-test-review"  ->  target: <root>/cli/test-review.js  ->  that file
 *
 * The seam matters twice over. It keeps a machine-absolute path out of every
 * contract, and it is the only place a run's working directory, artifact map,
 * and budgets are decided, so a caller cannot quietly widen any of them.
 *
 * A logical name with no entry below is denied before a process starts. That is
 * the check `test/test-probe-targets.js` runs against the contracts: an
 * interface the contracts declare and this registry does not carry is an
 * executable nobody ships, and a contract naming one is fiction that compiles.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { AGENT_ADAPTERS } = require('../../cli/lib/agent-adapters');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

/**
 * The host environment variables a measured run is allowed to see.
 *
 * The adapter closes the child environment to `PATH` plus what the request
 * declares, which is the guarantee that makes one probe reproducible. A TEA
 * command still has to authenticate and still has to behave the way an operator
 * running it by hand would, so three groups of names are declared:
 *
 * - Every vendor variable the shipped adapters read, taken from `AGENT_ADAPTERS`
 *   rather than transcribed, so a new vendor's variable arrives here with it.
 * - `HOME` and `USER`, because both shipped vendors resolve a stored login
 *   through `HOME`, and `cli/test-review.js` reads `~/.claude/.credentials.json`
 *   and the macOS keychain through the same variable.
 * - `CI`, because `cli/test-review.js` turns filesystem isolation on when it is
 *   set. Dropping it would quietly change how a measured run executes rather
 *   than failing.
 *
 * A name absent from `process.env` is absent from the request. An empty string
 * is a declared value and passes through, since some variables are meaningful
 * when set to nothing.
 */
const HOST_ENVIRONMENT_NAMES = [
  ...new Set([...Object.values(AGENT_ADAPTERS).flatMap((adapter) => adapter.envNames), 'HOME', 'USER', 'CI']),
].sort();

/**
 * @param {string[]} [extraNames] Names the caller also passes through, typically an operator's own `--env-pass`.
 * @returns {Record<string, string>}
 */
function hostEnvironment(extraNames = []) {
  const environment = {};
  for (const name of [...HOST_ENVIRONMENT_NAMES, ...extraNames]) {
    const value = process.env[name];
    if (typeof value === 'string') environment[name] = value;
  }
  return environment;
}

/**
 * Eight megabytes of captured output per stream and per artifact.
 *
 * Nothing capped this before. `cli/lib/run-agent.js` sets a 64 MiB `maxBuffer`
 * on the vendor call one layer down, and the harnesses that spawned a TEA
 * command set nothing at all, so a runaway child was bounded only by the
 * harness's own memory. Eight megabytes is an order of magnitude above the
 * largest artifact this repository has produced (a full traceability matrix over
 * the seeded set is under 100 KB) and small enough that a loop printing forever
 * is killed in seconds.
 */
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

/**
 * The commands TEA ships, keyed the way `evaluateCommandTarget` keys them: by
 * interface and executable together.
 *
 * `maxElapsedMs` is the outer wall clock, and it is deliberately longer than the
 * inner one each command applies to its own vendor call. The inner bound reports
 * a timeout as an exit code the caller can classify; the outer one SIGKILLs and
 * reports `budget-exhausted`, which says a process was killed and not why. The
 * outer bound is the backstop for a command that hangs outside its own timed
 * region, so it must not fire first.
 */
const EXECUTION_TARGETS = [
  {
    interfaceId: 'tea-test-review',
    executable: 'tea-test-review',
    script: path.join('cli', 'test-review.js'),
    subcommandPaths: [[]],
    // The names are the contract's artifact ids; the paths are what the
    // interaction plan passes on --json and --output, resolved against the run
    // directory the caller supplies as `cwd`.
    artifacts: { verdict: 'verdict.json', report: 'test-review.md' },
    maxElapsedMs: 16 * 60_000,
  },
  {
    interfaceId: 'tea-fragment-selection-runner',
    executable: 'tea-fragment-selection-runner',
    script: path.join('cli', 'fragment-selection-runner.js'),
    subcommandPaths: [[]],
    // The selection is a stdout payload. The operation declares no artifact, so
    // authorizing one would let a run be scored off a file the contract never
    // said it would read.
    artifacts: {},
    maxElapsedMs: 6 * 60_000,
  },
];

/** @returns {object|undefined} */
function targetFor(interfaceId, executable) {
  return EXECUTION_TARGETS.find((target) => target.interfaceId === interfaceId && target.executable === executable);
}

/**
 * The absolute path the adapter spawns for one target.
 *
 * Spawned directly rather than through `process.execPath`, because the executable
 * a contract names has to be one thing and `subcommandPath` is the contract's,
 * not the policy's. Each script carries a `#!/usr/bin/env node` line and is mode
 * 755 in the tree for exactly this reason.
 */
function scriptPath(target, projectRoot = PROJECT_ROOT) {
  return path.join(projectRoot, target.script);
}

/**
 * A `CommandTargetPolicy` over the requested targets.
 *
 * @param {object} options
 * @param {string} options.cwd - Working directory every authorized command runs in, and the root every relative artifact path resolves against.
 * @param {string[]} [options.interfaceIds] - Which targets to authorize; every one by default.
 * @param {object} [options.artifacts] - Per-interface artifact path overrides, merged over the registry's own names.
 * @param {object} [options.budgets] - Per-interface `{maxElapsedMs, maxOutputBytes}` overrides. A caller with a shorter deadline than the registry's backstop may lower either; nothing here raises one for it.
 * @param {string} [options.projectRoot]
 * @returns {{authorizations: object[]}}
 */
function commandTargetPolicy({ cwd, interfaceIds, artifacts = {}, budgets = {}, projectRoot = PROJECT_ROOT }) {
  if (typeof cwd !== 'string' || cwd.length === 0) {
    throw new Error(
      'commandTargetPolicy requires a cwd; an authorization with no working directory resolves every relative path somewhere else',
    );
  }
  const selected =
    interfaceIds === undefined ? EXECUTION_TARGETS : EXECUTION_TARGETS.filter((target) => interfaceIds.includes(target.interfaceId));
  const missing = (interfaceIds ?? []).filter((id) => !EXECUTION_TARGETS.some((target) => target.interfaceId === id));
  if (missing.length > 0) {
    throw new Error(`no execution target is registered for interface(s) ${missing.join(', ')}; TEA ships no such command`);
  }
  return {
    authorizations: selected.map((target) => {
      const budget = budgets[target.interfaceId] ?? {};
      return {
        interfaceId: target.interfaceId,
        executable: target.executable,
        target: scriptPath(target, projectRoot),
        permittedSubcommandPaths: target.subcommandPaths,
        cwd,
        artifacts: { ...target.artifacts, ...artifacts[target.interfaceId] },
        maxElapsedMs: Math.min(target.maxElapsedMs, budget.maxElapsedMs ?? target.maxElapsedMs),
        maxOutputBytes: Math.min(MAX_OUTPUT_BYTES, budget.maxOutputBytes ?? MAX_OUTPUT_BYTES),
      };
    }),
  };
}

/** `eval-quality` is ESM and this repository is CommonJS, so every entry point through it is asynchronous. */
async function loadAdapters() {
  return import('eval-quality/adapters');
}

/**
 * The environment-probe port over TEA's commands.
 *
 * @returns {Promise<{port: object, policy: object}>}
 */
async function createProbePort(options) {
  const policy = commandTargetPolicy(options);
  const { createCommandLineAdapter } = await loadAdapters();
  return { port: createCommandLineAdapter(policy), policy };
}

/**
 * One thrown probe fault, as a TEA failure class.
 *
 * The four codes the port may throw are a policy denial, a cap, an abort, and a
 * transport failure, and none of them is a measured quality result. That is the
 * distinction every harness here already draws: a failed call must never report
 * as a low score. `budget-exhausted` splits on its own detail because the same
 * code covers a wall clock and an output cap, and a run killed for printing too
 * much is not a slow run.
 */
function failureClassForFault(error) {
  const code = error?.code;
  const detail = String(error?.detail ?? error?.message ?? '');
  if (code === 'forbidden-target') return 'environment-configuration';
  if (code === 'aborted') return 'environment-timeout';
  if (code === 'budget-exhausted') return /maxElapsedMs/.test(detail) ? 'environment-timeout' : 'environment-transport';
  if (code === 'schema-parse-failure' || code === 'port-contract-violation') return 'environment-parser';
  return 'environment-transport';
}

/**
 * A `ProbeRequest` for one operation, with every channel defaulted.
 *
 * The channels are total in the schema, so a caller that omits one is a parse
 * failure at the boundary rather than an empty channel. Defaulting them here is
 * what lets a caller name only the inputs it actually sets.
 */
function probeRequest({
  probeId,
  interfaceId,
  operationId,
  executable,
  subcommandPath = [],
  argument = {},
  option = {},
  environment = {},
  stdin,
}) {
  return {
    probeId,
    interfaceId,
    operationId,
    kind: 'cli',
    executable: executable ?? interfaceId,
    subcommandPath,
    channels: { argument, option, environment, stdin: stdin ?? { kind: 'absent' } },
  };
}

/**
 * Run one command through the port and return the observation, or the failure
 * class that says why nothing was observed.
 *
 * The two-armed return is the shape every harness here already uses for a lost
 * run, so this drops in where a `spawnSync` block stood. A non-zero exit comes
 * back as `ok: true` with the code on the observation, because the adapter
 * treats it as an observation and so must anything reading one: a review that
 * exits 1 on a blocking verdict has measured something.
 *
 * @returns {Promise<{ok: true, observation: object}|{ok: false, failureClass: string, reason: string}>}
 */
async function probeCommand(port, request, signal) {
  try {
    return { ok: true, observation: await port.probe(request, signal) };
  } catch (error) {
    return {
      ok: false,
      failureClass: failureClassForFault(error),
      reason: `${error?.code ?? 'error'}: ${error?.detail ?? error?.message ?? String(error)}`,
    };
  }
}

/**
 * Every registered target's script is present and executable, or the reason it
 * is not. `interfaceIds` narrows the question to the targets a caller actually
 * spawns, which is how a harness's pre-flight asks about its own command and
 * not about every command TEA ships.
 *
 * @param {string} [projectRoot]
 * @param {string[]} [interfaceIds]
 * @returns {string[]}
 */
function targetProblems(projectRoot = PROJECT_ROOT, interfaceIds) {
  const problems = [];
  const selected =
    interfaceIds === undefined ? EXECUTION_TARGETS : EXECUTION_TARGETS.filter((target) => interfaceIds.includes(target.interfaceId));
  for (const id of interfaceIds ?? []) {
    if (!EXECUTION_TARGETS.some((target) => target.interfaceId === id))
      problems.push(`${id}: no execution target is registered for this interface`);
  }
  for (const target of selected) {
    const absolute = scriptPath(target, projectRoot);
    if (!fs.existsSync(absolute)) {
      problems.push(`${target.executable}: ${target.script} does not exist`);
      continue;
    }
    // The adapter spawns the file itself, so the mode is load-bearing rather
    // than cosmetic: without the bit the spawn fails EACCES before argv matters.
    if ((fs.statSync(absolute).mode & 0o111) === 0) {
      problems.push(`${target.executable}: ${target.script} is not executable (mode ${(fs.statSync(absolute).mode & 0o777).toString(8)})`);
    }
  }
  return problems;
}

module.exports = {
  EXECUTION_TARGETS,
  HOST_ENVIRONMENT_NAMES,
  MAX_OUTPUT_BYTES,
  commandTargetPolicy,
  createProbePort,
  failureClassForFault,
  hostEnvironment,
  probeCommand,
  probeRequest,
  targetFor,
  targetProblems,
};
