/**
 * The execution-target registry, and the environment-probe port over it.
 *
 * Three kinds of entry share one list. A command entry (`RegistryEntry`, `kind`
 * absent or `cli`) maps a logical executable to a file the command-line adapter
 * spawns; a tool-server entry (`McpRegistryEntry`, `kind: "mcp"`, Story 1.10)
 * maps a logical interface to a stdio MCP server eval-quality's
 * `createMcpAdapter` starts, one session per call; an HTTP entry
 * (`ApiRegistryEntry`, `kind: "api"`, Story 1.11) maps a logical interface to
 * an address the evaluation's own HTTP port reaches, and names the server the
 * runtime starts for each call when the target is not deployed
 * (`http-target.js`). For all three, eval-quality's default-deny policy decides
 * every call (AD-1): this file only builds the mapping, for the workspace a
 * call runs in.
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
 * Every entry has the shape its kind names in the runtime's own
 * `evaluation.json` schema (`RegistryEntry`, `McpRegistryEntry`,
 * `ApiRegistryEntry`): an adopter's `evaluation.json` declares its registry in
 * those shapes and TeA's own harness declares its commands as `RegistryEntry`s,
 * so both run through this one builder. A logical name with no entry is denied
 * before a process starts or a request is sent.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const AjvModule = require('ajv/dist/2020');

const { loadAdapters } = require('./engine');
const { createApiPort, degenerateApiPort, isApiEntry } = require('./http-target');

const Ajv = AjvModule.default ?? AjvModule;

const EVALUATION_SCHEMA_PATH = path.join(__dirname, 'schemas', 'evaluation.schema.json');
const REGISTRY_ENTRY_DEFINITION = 'RegistryEntry';
const MCP_REGISTRY_ENTRY_DEFINITION = 'McpRegistryEntry';
const API_REGISTRY_ENTRY_DEFINITION = 'ApiRegistryEntry';

/**
 * Eight megabytes of captured output per stream and per artifact, the ceiling an
 * entry gets when it declares no `maxOutputBytes`.
 *
 * An order of magnitude above the largest artifact a TeA command has produced
 * (a full traceability matrix is under 100 KB), and small enough that a loop
 * printing forever is killed in seconds.
 */
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

const validators = new Map();

/** Every registry `createRegistry` has built, so `isRegistry` can tell one from a look-alike object. */
const BUILT_REGISTRIES = new WeakSet();

/** Whether a registry entry is a tool-server entry, which its `kind` alone says. */
function isMcpEntry(entry) {
  return entry !== null && typeof entry === 'object' && entry.kind === 'mcp';
}

/** The entry definition an entry is held to, by its `kind`. */
function definitionOf(entry) {
  if (isMcpEntry(entry)) return MCP_REGISTRY_ENTRY_DEFINITION;
  if (isApiEntry(entry)) return API_REGISTRY_ENTRY_DEFINITION;
  return REGISTRY_ENTRY_DEFINITION;
}

/** An entry's kind: `mcp`, `api`, or `cli` for a command. */
function kindOf(entry) {
  if (isMcpEntry(entry)) return 'mcp';
  if (isApiEntry(entry)) return 'api';
  return 'cli';
}

/**
 * The validator of one entry definition (`RegistryEntry`,
 * `McpRegistryEntry` or `ApiRegistryEntry`), compiled on first use from the runtime's own
 * `evaluation.json` schema, so loading this module reads nothing.
 */
function entryValidator(definition) {
  if (!validators.has(definition)) {
    const evaluationSchema = JSON.parse(fs.readFileSync(EVALUATION_SCHEMA_PATH, 'utf8'));
    if (evaluationSchema.$defs?.[definition] === undefined) {
      throw new Error(`the runtime's evaluation.json schema declares no $defs/${definition}`);
    }
    const ajv = new Ajv({ strict: false, allErrors: true });
    ajv.addSchema(evaluationSchema);
    validators.set(definition, ajv.compile({ $ref: `${evaluationSchema.$id}#/$defs/${definition}` }));
  }
  return validators.get(definition);
}

/**
 * Everything wrong with a list of registry entries: each entry against the
 * schema of its kind, every `(interfaceId, executable)` pair that repeats,
 * since eval-quality would try two authorizations for one pair in declaration
 * order, and the first that allows wins, and every interface two kinds or two
 * tool servers share (`sharedInterfaces`).
 *
 * @param {unknown} entries
 * @returns {string[]} Empty when the registry is sound.
 */
function registryProblems(entries) {
  if (!Array.isArray(entries)) return ['the registry must be an array of RegistryEntry objects'];
  if (entries.length === 0) return ['the registry names no execution target, so every request would be denied'];
  const problems = [];
  for (const [index, entry] of entries.entries()) {
    const validate = entryValidator(definitionOf(entry));
    if (validate(entry)) continue;
    for (const error of validate.errors ?? []) {
      const detail = error.params?.missingProperty ?? error.params?.additionalProperty;
      problems.push(
        `registry[${index}]${error.instancePath} ${error.message}${detail === undefined ? '' : ` (${JSON.stringify(detail)})`}`,
      );
    }
  }
  return [...problems, ...repeatedPairs(entries), ...sharedInterfaces(entries)];
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

/**
 * Every interface entries of two kinds name, and every interface two HTTP
 * entries name, as one line each. An interface is one kind in a contract, so
 * an entry of another kind would leave its calls denied at the interface; and
 * the runtime reaches one HTTP target per interface (its server, its auth), so
 * a second entry would be one no call reaches. The schema cannot say either,
 * so `check` reports them beside its schema findings. Two tool servers for
 * one interface are eval-quality's to refuse: its `McpTargetPolicy` admits one
 * authorization per interface (`mcpRegistryProblems`).
 *
 * @param {unknown[]} entries
 * @returns {string[]}
 */
function sharedInterfaces(entries) {
  const problems = [];
  const kinds = new Map();
  for (const [index, entry] of entries.entries()) {
    if (typeof entry?.interfaceId !== 'string') continue;
    const kind = kindOf(entry);
    const seen = kinds.get(entry.interfaceId);
    if (seen === undefined) kinds.set(entry.interfaceId, kind);
    else if (seen !== kind) {
      problems.push(
        `registry[${index}] names interface ${JSON.stringify(entry.interfaceId)} as ${kind}, which an earlier entry names as ${seen}`,
      );
    } else if (kind === 'api') {
      problems.push(
        `registry[${index}] repeats interface ${JSON.stringify(entry.interfaceId)} as an HTTP target; the runtime reaches one HTTP target per interface`,
      );
    }
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
    `the port answered a ${JSON.stringify(observation?.kind ?? null)} observation where a command's cli member of ProbeObservation was read; ` +
      'a command request is answered in that member alone, so any other comes from a port that did not run the command',
  );
}

/** Whether a registry `target` is a bare command name the adapter resolves through PATH. */
function isBareCommand(target) {
  return !target.includes('/');
}

/**
 * A registry over validated entries, resolved against one root.
 *
 * @param {unknown} entries RegistryEntry, McpRegistryEntry and ApiRegistryEntry objects.
 * @param {object} options
 * @param {string} options.root The directory each relative `target` resolves against; a relative one is resolved against the working directory once, here.
 * @param {object} [options.httpPort] the evaluation's HTTP port (`http-target.js` `probeHttpPort`), which an `api` call goes through
 * @returns {object}
 * @throws {Error} Naming every problem `registryProblems` finds.
 */
function createRegistry(entries, { root, httpPort } = {}) {
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
  const commandEntries = registered.filter((entry) => kindOf(entry) === 'cli');
  const serverEntries = registered.filter(isMcpEntry);
  const apiEntries = registered.filter(isApiEntry);

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

  /** The command entry for one `(interfaceId, executable)` pair. @returns {object|undefined} */
  function targetFor(interfaceId, executable) {
    return commandEntries.find((entry) => entry.interfaceId === interfaceId && entry.executable === executable);
  }

  /** The tool-server entry for one interface. @returns {object|undefined} */
  function serverFor(interfaceId) {
    return serverEntries.find((entry) => entry.interfaceId === interfaceId);
  }

  /** The HTTP entry for one interface. @returns {object|undefined} */
  function apiFor(interfaceId) {
    return apiEntries.find((entry) => entry.interfaceId === interfaceId);
  }

  /** How one entry is named in a problem: its executable, or a tool server's or HTTP server's interface. */
  function labelOf(entry) {
    if (isMcpEntry(entry)) return `${entry.interfaceId} (tool server)`;
    if (isApiEntry(entry)) return `${entry.interfaceId} (HTTP server)`;
    return entry.executable;
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
      throw new Error(`${labelOf(entry)}: target ${JSON.stringify(entry.target)} resolves outside ${projectRoot}`);
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
    const entries = commandEntries.filter((entry) => entry.interfaceId === interfaceId);
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
    const entries = commandEntries.filter((entry) => entry.interfaceId === interfaceId);
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
   * The environment one tool server starts with: the host's values for the
   * keys its entry names (`serverEnvironment` in its authorization). A tool
   * call carries only its arguments, so this is where a server's credential
   * reaches it, and every value is scrubbed from what comes back.
   *
   * @param {string} interfaceId
   * @returns {Record<string, string>}
   */
  function serverEnvironment(interfaceId) {
    const entry = serverFor(interfaceId);
    if (entry === undefined) throw new Error(`no tool server is registered for interface ${interfaceId}`);
    return readEnvironment(keysWithExtras(interfaceId, entry.environmentKeys));
  }

  /**
   * The values an `api` call carries that its answer must not show: the host's
   * values for its server's environment keys and for its auth header's key.
   *
   * @param {string} interfaceId
   * @returns {string[]}
   */
  function apiSecrets(interfaceId) {
    const entry = apiFor(interfaceId);
    if (entry === undefined) return [];
    const keys = [...(entry.server?.environmentKeys ?? []), ...(entry.auth === undefined ? [] : [entry.auth.environmentKey])];
    return Object.values(readEnvironment(keysWithExtras(interfaceId, keys)));
  }

  /**
   * eval-quality's `CommandTargetPolicy` over the requested command entries.
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
    const selected =
      interfaceIds === undefined ? commandEntries : commandEntries.filter((entry) => interfaceIds.includes(entry.interfaceId));
    const missing = (interfaceIds ?? []).filter((id) => !commandEntries.some((entry) => entry.interfaceId === id));
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
   * eval-quality's `McpTargetPolicy` over every tool-server entry: each an
   * `McpTargetAuthorization` whose server starts in `cwd` (the workspace the
   * call runs in) from its target resolved against `projectRoot`, with the
   * host's values for its environment keys. An empty list is eval-quality's
   * legal deny-all.
   *
   * @param {object} options
   * @param {string} options.cwd the working directory every server starts in
   * @param {string} [options.projectRoot] the root relative targets resolve against; the registry's own by default
   * @returns {{authorizations: object[]}}
   */
  function mcpTargetPolicy({ cwd, projectRoot = registryRoot }) {
    if (typeof cwd !== 'string' || cwd.length === 0) {
      throw new Error(
        'mcpTargetPolicy requires a cwd; a tool server with no working directory resolves every relative path somewhere else',
      );
    }
    return {
      authorizations: serverEntries.map((entry) => ({
        interfaceId: entry.interfaceId,
        target: targetPath(entry, projectRoot),
        targetArgs: [...entry.targetArgs],
        tools: [...entry.tools],
        cwd,
        serverEnvironment: serverEnvironment(entry.interfaceId),
        maxElapsedMs: entry.maxElapsedMs,
        maxOutputBytes: entry.maxOutputBytes ?? MAX_OUTPUT_BYTES,
      })),
    };
  }

  /** The evaluation's HTTP port, which an `api` call needs; an error naming the gap when none was loaded. */
  function loadedHttpPort() {
    if (httpPort === undefined) {
      throw new Error('the registry declares an api target and no HTTP port was probed for it (http-target.js probeHttpPort)');
    }
    return httpPort;
  }

  /**
   * The workspace's one port: eval-quality's command-line adapter over
   * `commandTargetPolicy(options)` for a `cli` request, its MCP adapter over
   * `mcpTargetPolicy(options)`, validated by its own `parseMcpTargetPolicy`,
   * for an `mcp` one, and, when the registry declares HTTP targets, the
   * evaluation's own HTTP port for an `api` one (`http-target.js`), whose
   * servers start in `cwd` from targets resolved against `projectRoot`. Each
   * denies whatever its policy does not grant; with no HTTP target declared,
   * an `api` request goes to the command-line adapter, which denies it.
   *
   * @returns {Promise<{port: {probe: Function}, policy: object, mcpPolicy: object}>}
   */
  async function createProbePort(options) {
    const policy = commandTargetPolicy(options);
    const adapters = await loadAdapters();
    const mcpPolicy = adapters.parseMcpTargetPolicy(mcpTargetPolicy(options));
    const commandAdapter = adapters.createCommandLineAdapter(policy);
    const mcpAdapter = adapters.createMcpAdapter(mcpPolicy);
    const apiPort =
      apiEntries.length === 0
        ? commandAdapter
        : createApiPort({
            entries: apiEntries,
            httpPort: loadedHttpPort(),
            cwd: options.cwd,
            targetOf: (entry) =>
              targetPath({ ...entry.server, interfaceId: entry.interfaceId, kind: 'api' }, options.projectRoot ?? registryRoot),
            readEnvironment: (names) => readEnvironment(names),
            mechanism: adapters.nodeCommandMechanism,
            maxOutputBytes: MAX_OUTPUT_BYTES,
          });
    const port = {
      probe: (request, signal) => {
        if (request?.kind === 'mcp') return mcpAdapter.probe(request, signal);
        if (request?.kind === 'api') return apiPort.probe(request, signal);
        return commandAdapter.probe(request, signal);
      },
    };
    return { port, policy, mcpPolicy };
  }

  /**
   * The evaluation's HTTP port on a gameability arm: every allowed request
   * answered from `answer` with nothing sent (`http-target.js`
   * `degenerateApiPort`), so the registry's policy denies what it does not
   * grant as on a real arm.
   *
   * @param {{ status: number, headers?: object, body?: string }|undefined} answer
   * @returns {{ probe: Function }}
   */
  function degenerateHttpPort(answer) {
    if (apiEntries.length === 0) {
      // No HTTP target is declared: eval-quality's command-line adapter over no authorization denies the request, as a
      // real arm's port does.
      return {
        probe: async (request, signal) => (await loadAdapters()).createCommandLineAdapter({ authorizations: [] }).probe(request, signal),
      };
    }
    return degenerateApiPort({
      entries: apiEntries,
      httpPort: loadedHttpPort(),
      answer,
      readEnvironment: (names) => readEnvironment(names),
    });
  }

  /**
   * The ceiling one call of `operation`, declared under `interfaceId`, runs
   * under: its tool server's `maxElapsedMs`, or its command's; 0 when the
   * registry serves neither.
   *
   * @param {string} interfaceId
   * @param {object} [operation] the contract operation
   * @returns {number}
   */
  function ceilingMs(interfaceId, operation) {
    if (typeof operation?.pathTemplate === 'string') {
      const entry = apiFor(interfaceId);
      return entry === undefined ? 0 : entry.maxElapsedMs + (entry.server?.readyTimeoutMs ?? 0);
    }
    const entry =
      typeof operation?.toolName === 'string' ? serverFor(interfaceId) : targetFor(interfaceId, operation?.invocation?.executable);
    return entry?.maxElapsedMs ?? 0;
  }

  /**
   * Every tool the registry grants, as the isolation manifest's allow list
   * names it: `<interfaceId>/<executable>` for a command and
   * `<interfaceId>/<tool>` for each tool of a server and
   * `<interfaceId>/<method>` for each method of an HTTP target, sorted.
   *
   * @returns {string[]}
   */
  function toolInventory() {
    return [
      ...commandEntries.map((entry) => `${entry.interfaceId}/${entry.executable}`),
      ...serverEntries.flatMap((entry) => entry.tools.map((tool) => `${entry.interfaceId}/${tool}`)),
      ...apiEntries.flatMap((entry) => entry.methods.map((method) => `${entry.interfaceId}/${method}`)),
    ].sort();
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
    for (const selectedEntry of selected) {
      // A deployed HTTP target starts nothing; a started one is held to its server's target.
      if (isApiEntry(selectedEntry) && selectedEntry.server === undefined) continue;
      const entry = isApiEntry(selectedEntry)
        ? { ...selectedEntry.server, interfaceId: selectedEntry.interfaceId, kind: 'api' }
        : selectedEntry;
      if (isBareCommand(entry.target)) continue;
      const absolute = targetPath(entry, projectRoot);
      if (!fs.existsSync(absolute)) {
        problems.push(`${labelOf(entry)}: ${entry.target} does not exist`);
        continue;
      }
      const stat = fs.statSync(absolute);
      if (!stat.isFile()) {
        problems.push(`${labelOf(entry)}: ${entry.target} is not a file`);
        continue;
      }
      const { mode } = stat;
      if ((mode & 0o111) === 0) {
        problems.push(`${labelOf(entry)}: ${entry.target} is not executable (mode ${(mode & 0o777).toString(8)})`);
      }
    }
    return problems;
  }

  const registry = Object.freeze({
    entries: registered,
    root: registryRoot,
    httpPort,
    apiFor,
    apiSecrets,
    ceilingMs,
    degenerateHttpPort,
    commandTargetPolicy,
    createProbePort,
    hostEnvironment,
    mcpTargetPolicy,
    permittedEnvironmentKeys,
    serverEnvironment,
    serverFor,
    targetFor,
    targetPath,
    targetProblems,
    toolInventory,
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
 * Every tool-server entry eval-quality's own `parseMcpTargetPolicy` refuses,
 * as one line: the policy the entries would become, with a placeholder
 * working directory and each environment key standing for a value, handed to
 * the parser before any run builds it. Each entry is first held to its schema
 * (`registryProblems`); an entry off it is left to that finding.
 *
 * @param {unknown} entries
 * @returns {Promise<string[]>}
 */
async function mcpRegistryProblems(entries) {
  if (!Array.isArray(entries)) return [];
  const servers = entries.filter((entry) => isMcpEntry(entry) && entryValidator(MCP_REGISTRY_ENTRY_DEFINITION)(entry));
  if (servers.length === 0) return [];
  const { parseMcpTargetPolicy } = await loadAdapters();
  try {
    parseMcpTargetPolicy({
      authorizations: servers.map((entry) => ({
        interfaceId: entry.interfaceId,
        target: entry.target,
        targetArgs: entry.targetArgs,
        tools: entry.tools,
        cwd: '.',
        serverEnvironment: Object.fromEntries(entry.environmentKeys.map((key) => [key, ''])),
        maxElapsedMs: entry.maxElapsedMs,
        maxOutputBytes: entry.maxOutputBytes ?? MAX_OUTPUT_BYTES,
      })),
    });
  } catch (error) {
    if (error?.name !== 'RuntimeFault') throw error;
    return [`eval-quality's parseMcpTargetPolicy refuses the tool-server entries: ${error.message}`];
  }
  return [];
}

/**
 * The registry an `evaluation.json` declares, resolved against `root`, with
 * the evaluation's HTTP port when one was loaded.
 *
 * @param {{registry?: unknown}} evaluation The parsed manifest.
 * @param {{root: string, httpPort?: object}} options
 * @returns {object}
 */
function registryFromEvaluation(evaluation, options) {
  return createRegistry(evaluation?.registry, options);
}

module.exports = {
  API_REGISTRY_ENTRY_DEFINITION,
  MAX_OUTPUT_BYTES,
  MCP_REGISTRY_ENTRY_DEFINITION,
  REGISTRY_ENTRY_DEFINITION,
  cliObservation,
  createRegistry,
  isApiEntry,
  isMcpEntry,
  isRegistry,
  kindOf,
  mcpRegistryProblems,
  observedText,
  probeRequest,
  readEnvironment,
  registryFromEvaluation,
  registryProblems,
  repeatedPairs,
  sharedInterfaces,
};
