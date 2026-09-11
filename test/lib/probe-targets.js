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

const { vendorEnvironmentNames } = require('../../cli/lib/runner-exit-codes');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

/**
 * Every environment key one target's authorization permits, including the names
 * a caller passes through on top of the target's own.
 *
 * `CommandTargetPolicy.permittedEnvironmentKeys` is required on 3.0.0 with no
 * default, and the adapter refuses any key a request declares that the
 * authorization does not name, before a process starts. So this is the
 * operator's half of the environment channel, and it is stated per target rather
 * than once for every command TEA ships: a key a command never reads has no
 * business reaching it.
 *
 * Each target's own list is the one its contract declares, read from the same
 * source the contract generator reads rather than transcribed:
 *
 * - `vendorEnvironmentNames()` carries every variable a shipped vendor adapter
 *   consumes, plus `HOME` and `USER`, because both shipped vendors resolve a
 *   stored login through `HOME` and the adapter passes the child nothing else
 *   that could reach one.
 * `CI` is deliberately on no list, and its absence is the decision that makes a
 * measured review reproducible. `cli/test-review.js:864` reads it to decide
 * filesystem isolation when `--isolate` is not stated, and no contract declares
 * it, so permitting it would let the host decide how the measured run executes:
 * isolation on in GitHub Actions, off on a laptop, with the two sealed records
 * indistinguishable afterwards. The adapter closes the child environment to
 * `PATH` plus what the request declares, so a command run through the port sees
 * no `CI` at all and isolates the same way on every host. `test/eval-test-review.js`
 * states `--isolate` explicitly and does not depend on the variable.
 *
 * The extra names are an operator's `--env-pass`, and a test harness's stub
 * variables. They widen one authorization deliberately and one call at a time,
 * which is what keeps the default deny.
 *
 * `PATH` appears on no list, and this function refuses one rather than leaving
 * it to be caught later: the schema refuses it by refine, the adapter refuses it
 * again at the request parse, and TEA parses no policy, so an operator's
 * `--env-pass PATH` would otherwise reach a built authorization before anything
 * objected. `target` may name a bare command and the child environment is what
 * resolves it, so a permitted `PATH` would choose which binary runs. The adapter
 * supplies its own.
 *
 * @param {string} interfaceId
 * @param {string[]} [extraNames]
 * @returns {string[]}
 */
function permittedEnvironmentKeys(interfaceId, extraNames = []) {
  const target = EXECUTION_TARGETS.find((entry) => entry.interfaceId === interfaceId);
  if (target === undefined) {
    throw new Error(`no execution target is registered for interface ${interfaceId}; TEA ships no such command`);
  }
  const keys = [...new Set([...target.environmentKeys, ...extraNames])].sort();
  // Refused here rather than left to the request parse. The widening is the one
  // way an operator can introduce `PATH`, through `--env-pass PATH`, and a
  // policy that carries it is already wrong whether or not a request later
  // declares it. The schema refuses it too, and TEA parses no policy.
  const path = keys.find((key) => key.toUpperCase() === 'PATH');
  if (path !== undefined) {
    throw new Error(
      `${interfaceId} cannot permit the environment key ${JSON.stringify(path)}: target may name a bare command, so a declared PATH would choose which binary runs`,
    );
  }
  return keys;
}

/**
 * The values this host has for the keys one target's authorization permits.
 *
 * A request built from this can never carry a key the policy denies, which is
 * the pairing that keeps the adapter's refusal a real check on an operator's
 * mistake rather than a routine occurrence.
 *
 * A name absent from `process.env` is absent from the request. An empty string
 * is a declared value and passes through, since some variables are meaningful
 * when set to nothing.
 *
 * @param {string} interfaceId
 * @param {string[]} [extraNames] Names the caller also passes through, typically an operator's own `--env-pass`.
 * @returns {Record<string, string>}
 */
function hostEnvironment(interfaceId, extraNames = []) {
  return readEnvironment(permittedEnvironmentKeys(interfaceId, extraNames));
}

/**
 * The values this host has for a named list of keys.
 *
 * The list is the caller's, so a caller reading an authority of its own, such as
 * a contract's declared `permittedKeys`, reads the host through this rather than
 * intersecting two lists and hoping they agree.
 *
 * @param {string[]} names
 * @returns {Record<string, string>}
 */
function readEnvironment(names) {
  const environment = {};
  for (const name of names) {
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
    environmentKeys: vendorEnvironmentNames(),
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
    environmentKeys: vendorEnvironmentNames(),
    maxElapsedMs: 6 * 60_000,
  },
  {
    interfaceId: 'tea-routing-runner',
    executable: 'tea-routing-runner',
    script: path.join('cli', 'routing-runner.js'),
    subcommandPaths: [[]],
    // The routing answer is a stdout payload, the same as a selection. The
    // operation declares no artifact, so authorizing one would let a run be
    // scored off a file the contract never said it would read.
    artifacts: {},
    // The vendor variables and nothing else, which is the list
    // cli/routing-runner.js declares through ROUTING_REQUEST_KEYS and the list
    // the two routing contracts carry. A routing decision reads no file and
    // needs no other key.
    environmentKeys: vendorEnvironmentNames(),
    maxElapsedMs: 6 * 60_000,
  },
  {
    interfaceId: 'tea-trace-runner',
    executable: 'tea-trace-runner',
    script: path.join('cli', 'trace-runner.js'),
    subcommandPaths: [[]],
    // The two deliverables the trace workflow writes, at the workflow's own
    // default location relative to the project root. A caller whose project
    // root is not the run directory, which is every staged eval workspace,
    // supplies its own paths through `commandTargetPolicy`'s artifact override;
    // these are what a run gets when it supplies none.
    artifacts: { summary: 'test-artifacts/e2e-trace-summary.json', matrix: 'test-artifacts/traceability-matrix.md' },
    environmentKeys: vendorEnvironmentNames(),
    // One minute above RUN_TIMEOUT_MS in test/eval-trace.js, for the reason the
    // comment above EXECUTION_TARGETS gives: the inner clock classifies, and this
    // one only backstops.
    maxElapsedMs: 21 * 60_000,
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
 * @param {object} [options.environmentKeys] - Per-interface environment names permitted on top of the target's own, typically an operator's `--env-pass`.
 * @param {string} [options.projectRoot]
 * @returns {{authorizations: object[]}}
 */
function commandTargetPolicy({ cwd, interfaceIds, artifacts = {}, budgets = {}, environmentKeys = {}, projectRoot = PROJECT_ROOT }) {
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
  // The three per-interface overrides are keyed by interface id, and a key this
  // policy does not carry widens nothing. Silently ignoring one is expensive in
  // the only place it happens: a misspelled `environmentKeys` key leaves every
  // request carrying names the authorization never permitted, and the first
  // signal is a live run that measures nothing.
  const selectedIds = new Set(selected.map((target) => target.interfaceId));
  for (const [label, override] of [
    ['artifacts', artifacts],
    ['budgets', budgets],
    ['environmentKeys', environmentKeys],
  ]) {
    const unknown = Object.keys(override).filter((id) => !selectedIds.has(id));
    if (unknown.length > 0) {
      throw new Error(
        `${label} names interface(s) ${unknown.join(', ')}, which this policy does not authorize; an override for an interface outside the policy applies to nothing`,
      );
    }
  }
  return {
    authorizations: selected.map((target) => {
      const budget = budgets[target.interfaceId] ?? {};
      return {
        interfaceId: target.interfaceId,
        executable: target.executable,
        target: scriptPath(target, projectRoot),
        permittedSubcommandPaths: target.subcommandPaths,
        permittedEnvironmentKeys: permittedEnvironmentKeys(target.interfaceId, environmentKeys[target.interfaceId]),
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
 * The codes branched on here are a policy denial, a cap, an abort, and the two
 * that mean the port itself was handed or produced something it could not read;
 * every other code in the package's registry, and every fault carrying none,
 * falls to a transport failure. None of them is a measured quality result, which
 * is the distinction every harness here already draws: a failed call must never
 * report as a low score. `budget-exhausted` splits on its own detail because the same
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
 * One tagged observation channel as text a diagnostic can print.
 *
 * `stdout` and `stderr` come back as `{kind}`-tagged bodies, and the tag is
 * total: `text`, `json`, or `absent`. Reading `.value` without checking the tag
 * gives `undefined` on an absent channel, and the two things a caller then does
 * with it both fail. `JSON.stringify(undefined)` is the value `undefined` rather
 * than a string, so `.trim()` on it throws, in the error path, which is the
 * worst place to put a crash because it fires only when something else has
 * already gone wrong. Falling back to an empty string instead loses the exit
 * code's only diagnostic.
 *
 * `createCommandLineAdapter` never produces an absent stream today, because it
 * tags an empty capture as empty text. The port's own contract permits one, so
 * a caller that reads the tag keeps working when a different mechanism does.
 *
 * @param {{kind: string, value?: unknown}} channel
 * @returns {string} Empty when the channel carries nothing printable.
 */
function observedText(channel) {
  if (channel?.kind === 'text') return String(channel.value ?? '');
  if (channel?.kind === 'json') return JSON.stringify(channel.value);
  return '';
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
 * @throws {Error} When the port answers a member of `ProbeObservation` other
 * than `cli`. That is a defect in TEA rather than a lost run, so it is the one
 * outcome this function does not report as a failure class.
 * @returns {Promise<{ok: true, observation: object}|{ok: false, failureClass: string, reason: string}>}
 */
async function probeCommand(port, request, signal) {
  let observation;
  try {
    observation = await port.probe(request, signal);
  } catch (error) {
    return {
      ok: false,
      failureClass: failureClassForFault(error),
      reason: `${error?.code ?? 'error'}: ${error?.detail ?? error?.message ?? String(error)}`,
    };
  }
  // Outside the catch on purpose. A member TEA cannot read is a defect in TEA,
  // and classifying it as an environment failure would file that defect as a
  // lost run.
  return { ok: true, observation: cliObservation(observation) };
}

/**
 * One observation, narrowed to the member TEA reads.
 *
 * `ProbeObservation` is a three-member union tagged by `kind`, and every reader
 * in this repository goes on to read `exitCode`, `stdout` and `artifacts`, which
 * are the `cli` member's fields. On an `api` or `mcp` observation each of those
 * reads is `undefined`, so a harness would report a run that exited nowhere
 * rather than a port answering in a shape it does not read.
 *
 * TEA declares the `cli` interface kind in every contract it ships, so the other
 * two members are unreachable today. This is what keeps that true rather than
 * assumed, and what turns a fourth member added upstream into a named error at
 * the one place every harness gets an observation.
 * `test/test-port-totality.js` holds this function against the union the
 * installed package declares.
 *
 * @param {{kind?: string}} observation
 * @returns {object} The same observation, when it is the `cli` member.
 */
function cliObservation(observation) {
  if (observation?.kind === 'cli') return observation;
  throw new Error(
    `the port answered a ${JSON.stringify(observation?.kind ?? null)} observation and TEA reads the cli member of ProbeObservation alone; ` +
      'every TEA contract declares the cli interface kind, so a member outside it is a port TEA never authorized',
  );
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
  MAX_OUTPUT_BYTES,
  cliObservation,
  commandTargetPolicy,
  createProbePort,
  failureClassForFault,
  hostEnvironment,
  observedText,
  permittedEnvironmentKeys,
  probeCommand,
  probeRequest,
  readEnvironment,
  targetFor,
  targetProblems,
};
