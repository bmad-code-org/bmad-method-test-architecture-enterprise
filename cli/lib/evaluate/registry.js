/**
 * The execution-target registry, and the environment-probe port over it.
 *
 * eval-quality's `createCommandLineAdapter` spawns a command with the decisions
 * stated: `shell: false` always, argv built options-then-positionals, the child
 * environment closed to PATH plus what the request declares, `maxElapsedMs` and
 * `maxOutputBytes` enforced with SIGKILL, and a non-zero exit treated as an
 * observation. What it deliberately leaves to its caller is
 * the mapping: `CommandTargetPolicy` denies by default and permits only what an
 * authorization names, and nothing in a contract says which real executable a
 * logical name resolves to. That mapping is the registry:
 *
 *   contract says                 registry says                    adapter spawns
 *   executable: "tea-test-review" -> target: cli/test-review.js    -> <root>/cli/test-review.js
 *
 * The seam keeps a machine-absolute path out of every contract, and it is the
 * only place a run's working directory, artifact map and budgets are decided, so
 * a caller cannot quietly widen any of them.
 *
 * Every entry has one shape, `RegistryEntry`, read from the runtime's own
 * `evaluation.json` schema: an adopter's `evaluation.json` declares its registry
 * in that shape and TeA's own harness declares its commands in the same shape,
 * so both run through this one builder. A logical name with no entry is denied
 * before a process starts.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const AjvModule = require('ajv/dist/2020');

const { loadAdapters } = require('./engine');

const Ajv = AjvModule.default ?? AjvModule;

const EVALUATION_SCHEMA_PATH = path.join(__dirname, 'schemas', 'evaluation.schema.json');
const REGISTRY_ENTRY_DEFINITION = 'RegistryEntry';

/**
 * Eight megabytes of captured output per stream and per artifact, the ceiling an
 * entry gets when it declares no `maxOutputBytes`.
 *
 * An order of magnitude above the largest artifact a TeA command has produced
 * (a full traceability matrix is under 100 KB), and small enough that a loop
 * printing forever is killed in seconds.
 */
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

let validateEntry;

/** Every registry `createRegistry` has built, so `isRegistry` can tell one from a look-alike object. */
const BUILT_REGISTRIES = new WeakSet();

/**
 * The `RegistryEntry` validator, compiled on first use from the runtime's own
 * `evaluation.json` schema, so loading this module reads nothing.
 */
function entryValidator() {
  if (validateEntry === undefined) {
    const evaluationSchema = JSON.parse(fs.readFileSync(EVALUATION_SCHEMA_PATH, 'utf8'));
    if (evaluationSchema.$defs?.[REGISTRY_ENTRY_DEFINITION] === undefined) {
      throw new Error(`the runtime's evaluation.json schema declares no $defs/${REGISTRY_ENTRY_DEFINITION}`);
    }
    const ajv = new Ajv({ strict: false, allErrors: true });
    ajv.addSchema(evaluationSchema);
    validateEntry = ajv.compile({ $ref: `${evaluationSchema.$id}#/$defs/${REGISTRY_ENTRY_DEFINITION}` });
  }
  return validateEntry;
}

/**
 * Everything wrong with a list of registry entries: each entry against the
 * `RegistryEntry` schema, and every `(interfaceId, executable)` pair that
 * repeats, since eval-quality would try two authorizations for one pair in
 * declaration order, and the first that allows wins.
 *
 * @param {unknown} entries
 * @returns {string[]} Empty when the registry is sound.
 */
function registryProblems(entries) {
  if (!Array.isArray(entries)) return ['the registry must be an array of RegistryEntry objects'];
  if (entries.length === 0) return ['the registry names no execution target, so every request would be denied'];
  const problems = [];
  const validate = entryValidator();
  for (const [index, entry] of entries.entries()) {
    if (validate(entry)) continue;
    for (const error of validate.errors ?? []) {
      const detail = error.params?.missingProperty ?? error.params?.additionalProperty;
      problems.push(
        `registry[${index}]${error.instancePath} ${error.message}${detail === undefined ? '' : ` (${JSON.stringify(detail)})`}`,
      );
    }
  }
  return [...problems, ...repeatedPairs(entries)];
}

/**
 * Every `(interfaceId, executable)` pair a registry declares more than once, as
 * one line each. The schema cannot say this, so `check` reports it beside its
 * schema findings.
 *
 * @param {unknown[]} entries
 * @returns {string[]}
 */
function repeatedPairs(entries) {
  const problems = [];
  const seen = new Set();
  for (const [index, entry] of entries.entries()) {
    if (typeof entry?.interfaceId !== 'string' || typeof entry?.executable !== 'string') continue;
    const pair = `${entry.interfaceId}\u0000${entry.executable}`;
    if (seen.has(pair)) {
      problems.push(
        `registry[${index}] repeats interface ${JSON.stringify(entry.interfaceId)} with executable ${JSON.stringify(entry.executable)}`,
      );
    }
    seen.add(pair);
  }
  return problems;
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * The values this host has for a named list of keys.
 *
 * A name absent from `process.env` is absent from the result. An empty string is
 * a declared value and passes through, since some variables are meaningful when
 * set to nothing.
 *
 * @param {string[]} names
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Record<string, string>}
 */
function readEnvironment(names, env = process.env) {
  const environment = {};
  for (const name of names) {
    const value = env[name];
    if (typeof value === 'string') environment[name] = value;
  }
  return environment;
}

/**
 * A `ProbeRequest` for one `cli` operation, with every channel defaulted.
 *
 * The channels are total in eval-quality's schema, so a caller that omits one is
 * a parse failure at the boundary.
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
 * One tagged observation channel as text a diagnostic can print: `text` as its
 * value, `json` serialized, anything else (an `absent` channel) as the empty
 * string, so an error path can always print what it read.
 *
 * @param {{kind: string, value?: unknown}} channel
 * @returns {string}
 */
function observedText(channel) {
  if (channel?.kind === 'text') return String(channel.value ?? '');
  if (channel?.kind === 'json') return JSON.stringify(channel.value);
  return '';
}

/**
 * One observation, narrowed to the `cli` member of `ProbeObservation`.
 *
 * Every reader of a command observation goes on to read `exitCode`, `stdout` and
 * `artifacts`, which are the `cli` member's fields. An `api` or `mcp` member
 * would read as a run that exited nowhere, so it is a named error here instead.
 *
 * @param {{kind?: string}} observation
 * @returns {object} The same observation, when it is the `cli` member.
 */
function cliObservation(observation) {
  if (observation?.kind === 'cli') return observation;
  throw new Error(
    `the port answered a ${JSON.stringify(observation?.kind ?? null)} observation and this registry reads the cli member of ProbeObservation alone; ` +
      'every registry entry is a cli target, so a member outside it comes from a port the registry did not authorize',
  );
}

/** Whether a registry `target` is a bare command name the adapter resolves through PATH. */
function isBareCommand(target) {
  return !target.includes('/');
}

/**
 * A registry over validated entries, resolved against one root.
 *
 * @param {unknown} entries RegistryEntry objects.
 * @param {object} options
 * @param {string} options.root The directory each relative `target` resolves against; a relative one is resolved against the working directory once, here.
 * @returns {object}
 * @throws {Error} Naming every problem `registryProblems` finds.
 */
function createRegistry(entries, { root } = {}) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new Error('createRegistry requires a root: every relative target resolves against it');
  }
  // A relative root would resolve against whatever the process's working
  // directory is when a target is spawned, so it is fixed to an absolute path
  // once, here.
  const registryRoot = path.resolve(root);
  const problems = registryProblems(entries);
  if (problems.length > 0) throw new Error(`the execution-target registry is not valid:\n  ${problems.join('\n  ')}`);
  const registered = deepFreeze(structuredClone(entries));

  /** An entry's own keys plus the caller's extra names, sorted, with PATH refused. */
  function keysWithExtras(interfaceId, own, extraNames = []) {
    const keys = [...new Set([...own, ...extraNames])].sort();
    const pathKey = keys.find((key) => key.toUpperCase() === 'PATH');
    if (pathKey !== undefined) {
      throw new Error(
        `${interfaceId} cannot permit the environment key ${JSON.stringify(pathKey)}: target may name a bare command, so a declared PATH would choose which binary runs`,
      );
    }
    return keys;
  }

  function entryFor(interfaceId) {
    return registered.find((entry) => entry.interfaceId === interfaceId);
  }

  /** @returns {object|undefined} */
  function targetFor(interfaceId, executable) {
    return registered.find((entry) => entry.interfaceId === interfaceId && entry.executable === executable);
  }

  /**
   * What the adapter spawns for one entry: a relative target joined to the root,
   * or a bare command name as written. A joined target that lands outside the
   * root is refused here as well as by the schema's pattern, so containment does
   * not rest on one regular expression. A relative `projectRoot` override is
   * resolved to an absolute path, as the registry's own root is.
   */
  function targetPath(entry, projectRootOverride = registryRoot) {
    if (isBareCommand(entry.target)) return entry.target;
    const projectRoot = path.resolve(projectRootOverride);
    const resolved = path.join(projectRoot, ...entry.target.split('/'));
    const inside = path.relative(projectRoot, resolved);
    if (inside === '' || inside === '..' || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) {
      throw new Error(`${entry.executable}: target ${JSON.stringify(entry.target)} resolves outside ${projectRoot}`);
    }
    return resolved;
  }

  /**
   * Every environment key the entries under one interface permit, including
   * names a caller passes through on top of their own (an operator's
   * `--env-pass`, a test's stub variables). `commandTargetPolicy` gives each
   * authorization its own entry's keys; this union answers the question a
   * contract asks per interface.
   *
   * `PATH` is refused here, ahead of eval-quality's own refusals:
   * the widening is the one way a caller can introduce it, and a target may name
   * a bare command, so a permitted `PATH` would choose which binary runs.
   *
   * @param {string} interfaceId
   * @param {string[]} [extraNames]
   * @returns {string[]}
   */
  function permittedEnvironmentKeys(interfaceId, extraNames = []) {
    const entries = registered.filter((entry) => entry.interfaceId === interfaceId);
    if (entries.length === 0) throw new Error(`no execution target is registered for interface ${interfaceId}`);
    return keysWithExtras(
      interfaceId,
      entries.flatMap((entry) => entry.environmentKeys),
      extraNames,
    );
  }

  /**
   * The values this host has for the keys one entry's authorization permits, so
   * every key a request built from it carries is one the policy permits. When
   * several entries share the interface, `executable` names the one; a
   * union would carry one entry's keys into another's request, which its
   * authorization refuses.
   *
   * @param {string} interfaceId
   * @param {string[]} [extraNames]
   * @param {string} [executable]
   * @returns {Record<string, string>}
   */
  function hostEnvironment(interfaceId, extraNames = [], executable) {
    const entries = registered.filter((entry) => entry.interfaceId === interfaceId);
    if (entries.length === 0) throw new Error(`no execution target is registered for interface ${interfaceId}`);
    const chosen = executable === undefined ? entries : entries.filter((entry) => entry.executable === executable);
    if (chosen.length !== 1) {
      throw new Error(
        executable === undefined
          ? `interface ${interfaceId} has ${entries.length} registered executables; name the one the request targets`
          : `no execution target is registered for interface ${interfaceId} and executable ${executable}`,
      );
    }
    return readEnvironment(keysWithExtras(interfaceId, chosen[0].environmentKeys, extraNames));
  }

  /**
   * eval-quality's `CommandTargetPolicy` over the requested entries.
   *
   * The three per-interface overrides are keyed by interface id, and a key the
   * policy does not carry widens nothing, so one is refused:
   * a misspelled `environmentKeys` key would leave every request carrying names
   * the authorization never permitted, and the first signal would be a live run
   * that measured nothing. A budget override may only lower an entry's ceiling.
   *
   * @param {object} options
   * @param {string} options.cwd Working directory every authorized command runs in, and the root every relative artifact path resolves against.
   * @param {string[]} [options.interfaceIds] Which entries to authorize; every one by default.
   * @param {object} [options.artifacts] Per-interface artifact path overrides, merged over the entry's own.
   * @param {object} [options.budgets] Per-interface `{maxElapsedMs, maxOutputBytes}` overrides, which may only lower a ceiling.
   * @param {object} [options.environmentKeys] Per-interface environment names permitted on top of the entry's own.
   * @param {string} [options.projectRoot] The root relative targets resolve against; the registry's own by default.
   * @returns {{authorizations: object[]}}
   */
  function commandTargetPolicy({ cwd, interfaceIds, artifacts = {}, budgets = {}, environmentKeys = {}, projectRoot = registryRoot }) {
    if (typeof cwd !== 'string' || cwd.length === 0) {
      throw new Error(
        'commandTargetPolicy requires a cwd; an authorization with no working directory resolves every relative path somewhere else',
      );
    }
    const selected = interfaceIds === undefined ? registered : registered.filter((entry) => interfaceIds.includes(entry.interfaceId));
    const missing = (interfaceIds ?? []).filter((id) => entryFor(id) === undefined);
    if (missing.length > 0) {
      throw new Error(`no execution target is registered for interface(s) ${missing.join(', ')}`);
    }
    const selectedIds = new Set(selected.map((entry) => entry.interfaceId));
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
      authorizations: selected.map((entry) => {
        const budget = budgets[entry.interfaceId] ?? {};
        const maxOutputBytes = entry.maxOutputBytes ?? MAX_OUTPUT_BYTES;
        return {
          interfaceId: entry.interfaceId,
          executable: entry.executable,
          target: targetPath(entry, projectRoot),
          permittedSubcommandPaths: entry.subcommandPaths.map((subcommandPath) => [...subcommandPath]),
          permittedEnvironmentKeys: keysWithExtras(entry.interfaceId, entry.environmentKeys, environmentKeys[entry.interfaceId]),
          cwd,
          artifacts: { ...entry.artifacts, ...artifacts[entry.interfaceId] },
          maxElapsedMs: Math.min(entry.maxElapsedMs, budget.maxElapsedMs ?? entry.maxElapsedMs),
          maxOutputBytes: Math.min(maxOutputBytes, budget.maxOutputBytes ?? maxOutputBytes),
        };
      }),
    };
  }

  /**
   * eval-quality's command-line adapter over `commandTargetPolicy(options)`.
   *
   * @returns {Promise<{port: object, policy: object}>}
   */
  async function createProbePort(options) {
    const policy = commandTargetPolicy(options);
    const { createCommandLineAdapter } = await loadAdapters();
    return { port: createCommandLineAdapter(policy), policy };
  }

  /**
   * Every requested entry whose target is missing, is not a regular file, or
   * lacks its executable bit, as one line each. The adapter spawns the file
   * itself, so the mode is load-bearing: without the bit the spawn fails EACCES
   * before argv matters, and a directory carries the bit yet cannot be spawned.
   * A bare command name resolves through PATH at spawn time and is not checked
   * here.
   *
   * @param {string} [projectRoot]
   * @param {string[]} [interfaceIds]
   * @returns {string[]}
   */
  function targetProblems(projectRoot = registryRoot, interfaceIds) {
    const problems = [];
    const selected = interfaceIds === undefined ? registered : registered.filter((entry) => interfaceIds.includes(entry.interfaceId));
    for (const id of interfaceIds ?? []) {
      if (entryFor(id) === undefined) problems.push(`${id}: no execution target is registered for this interface`);
    }
    for (const entry of selected) {
      if (isBareCommand(entry.target)) continue;
      const absolute = targetPath(entry, projectRoot);
      if (!fs.existsSync(absolute)) {
        problems.push(`${entry.executable}: ${entry.target} does not exist`);
        continue;
      }
      const stat = fs.statSync(absolute);
      if (!stat.isFile()) {
        problems.push(`${entry.executable}: ${entry.target} is not a file`);
        continue;
      }
      const { mode } = stat;
      if ((mode & 0o111) === 0) {
        problems.push(`${entry.executable}: ${entry.target} is not executable (mode ${(mode & 0o777).toString(8)})`);
      }
    }
    return problems;
  }

  const registry = Object.freeze({
    entries: registered,
    root: registryRoot,
    commandTargetPolicy,
    createProbePort,
    hostEnvironment,
    permittedEnvironmentKeys,
    targetFor,
    targetPath,
    targetProblems,
  });
  BUILT_REGISTRIES.add(registry);
  return registry;
}

/**
 * Whether `value` is a registry that `createRegistry` built.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isRegistry(value) {
  return value !== null && typeof value === 'object' && BUILT_REGISTRIES.has(value);
}

/**
 * The registry an `evaluation.json` declares, resolved against `root`.
 *
 * @param {{registry?: unknown}} evaluation The parsed manifest.
 * @param {{root: string}} options
 * @returns {object}
 */
function registryFromEvaluation(evaluation, options) {
  return createRegistry(evaluation?.registry, options);
}

module.exports = {
  MAX_OUTPUT_BYTES,
  REGISTRY_ENTRY_DEFINITION,
  cliObservation,
  createRegistry,
  isRegistry,
  observedText,
  probeRequest,
  readEnvironment,
  registryFromEvaluation,
  registryProblems,
  repeatedPairs,
};
