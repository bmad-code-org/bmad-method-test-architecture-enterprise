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
 *
 * A registry built for a confined run (`confinement.js`, Story 1.31) starts
 * every target through the run's mechanism: each port's command, tool-server
 * and HTTP-server processes, and every process they start, write only the
 * workspace the port was made for and can neither read nor write the
 * evaluation folder; a port that audits also loads the confinement's audit
 * into their Node processes and reads the paths it reported.
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const AjvModule = require('ajv/dist/2020');

const {
  LOGIN_ADAPTERS,
  loginLinksOf,
  confinedCommandMechanism,
  confinedMcpMechanism,
  confines,
  makeAuditDirectory,
  makeTargetHome,
  releaseTargetHome,
  targetSandbox,
} = require('./confinement');
const { MAX_HOST_BYTES, egressAuthorization, isEgressHost } = require('./confinement-egress');
const { loadAdapters, loadEngine } = require('./engine');
const {
  authorizationOf,
  createApiPort,
  defaultPortOf,
  degenerateApiPort,
  deploymentAccess,
  deploymentAuthorizations,
  isApiEntry,
} = require('./http-target');

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
 * The finding for an entry that still declares `"network"` (Story 1.83 removed the field): the entry named, the field that took its
 * place and where the reference teaches it. `"network": "host"` gave a target the host's whole network and with it a route to the
 * host's abstract Unix sockets; a confined Linux target now runs in a network namespace of its own and an entry lists the hosts it
 * may reach in `egress`.
 */
function removedNetworkProblem(index, entry) {
  const named = typeof entry.interfaceId === 'string' ? ` (the interface ${JSON.stringify(entry.interfaceId)})` : '';
  return `registry[${index}]${named} declares "network": ${JSON.stringify(entry.network)}, a field Story 1.83 removed; remove it and list the hosts the entry's processes may reach in "egress" (each { "host", "port", "addresses" }), the authorization the runtime's egress proxy holds a confined Linux target to; the reference teaches it under "File-system confinement" (https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/docs/reference/tea-evaluate-cli.md#file-system-confinement)`;
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
    const retired = entry !== null && typeof entry === 'object' && Object.hasOwn(entry, 'network');
    if (retired) problems.push(removedNetworkProblem(index, entry));
    if (validate(entry)) continue;
    for (const error of validate.errors ?? []) {
      // The retired field has its own finding, which names the entry and the field that replaces it.
      if (retired && error.instancePath === '' && error.params?.additionalProperty === 'network') continue;
      const detail = error.params?.missingProperty ?? error.params?.additionalProperty;
      problems.push(
        `registry[${index}]${error.instancePath} ${error.message}${detail === undefined ? '' : ` (${JSON.stringify(detail)})`}`,
      );
    }
  }
  return [...problems, ...repeatedPairs(entries), ...sharedInterfaces(entries), ...sharedTargetSystemPaths(entries)];
}

/**
 * Every entry that starts the same target as an earlier one with other
 * `systemPaths` or another `egress`, as one line each. A confined run's audit grants a started
 * process the system paths of the target it runs (`createProbePort`), since
 * the request eval-quality hands the mechanism names the target and not the
 * interface, so two entries over one target must declare the same paths or
 * one would be granted the other's.
 *
 * @param {unknown[]} entries
 * @returns {string[]}
 */
function sharedTargetSystemPaths(entries) {
  const problems = [];
  const declared = new Map();
  for (const [index, entry] of entries.entries()) {
    if (entry === null || typeof entry !== 'object') continue;
    const target = kindOf(entry) === 'api' ? entry?.server?.target : entry?.target;
    if (typeof target !== 'string' || target.length === 0) continue;
    const key = path.posix.normalize(target);
    const paths = JSON.stringify([...new Set(Array.isArray(entry.systemPaths) ? entry.systemPaths : [])].sort());
    const egress = JSON.stringify(
      egressItemsOf(entry).map((item) => [
        item.host.toLowerCase(),
        item.port,
        [...(Array.isArray(item.addresses) ? item.addresses : [])].sort(),
      ]),
    );
    const earlier = declared.get(key);
    if (earlier === undefined) declared.set(key, { index, paths, egress });
    else {
      if (earlier.paths !== paths) {
        problems.push(
          `registry[${index}] starts the target ${JSON.stringify(target)} registry[${earlier.index}] starts with other systemPaths; a confined run grants a target's system paths to every entry that starts it, so declare the same paths on both`,
        );
      }
      if (earlier.egress !== egress) {
        problems.push(
          `registry[${index}] starts the target ${JSON.stringify(target)} registry[${earlier.index}] starts with another egress; a confined run gives a target the hosts of every entry that starts it, so declare the same egress on both`,
        );
      }
    }
  }
  return problems;
}

/**
 * Principal mappings are evaluated-level wiring. They may name only a registry
 * interface and an environment key that interface already authorizes, so a
 * principal cannot widen the target's environment policy.
 *
 * @param {unknown} mappings
 * @param {unknown[]} entries
 * @returns {string[]}
 */
function principalMappingProblems(mappings, entries) {
  if (mappings === undefined) return [];
  if (mappings === null || typeof mappings !== 'object' || Array.isArray(mappings)) return ['principalMappings must be an object'];
  if (!Array.isArray(entries)) return [];
  const problems = [];
  for (const [principal, mapping] of Object.entries(mappings)) {
    const matches = entries.filter((entry) => entry?.interfaceId === mapping?.interfaceId);
    if (matches.length !== 1) {
      problems.push(
        `principalMappings.${principal}.interfaceId ${JSON.stringify(mapping?.interfaceId)} does not select one registry entry`,
      );
      continue;
    }
    const [entry] = matches;
    const permitted =
      kindOf(entry) === 'api'
        ? [...(entry.server?.environmentKeys ?? []), ...(entry.auth === undefined ? [] : [entry.auth.environmentKey])]
        : (entry.environmentKeys ?? []);
    if (!permitted.includes(mapping?.environmentKey)) {
      problems.push(
        `principalMappings.${principal}.environmentKey ${JSON.stringify(mapping?.environmentKey)} is not authorized by registry interface ${JSON.stringify(entry.interfaceId)}`,
      );
    }
  }
  return problems;
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
 * @param {string[]} [options.scratch] the run's private directories, which the directory a started HTTP server reports its
 *   port in joins while its call runs, as does each audit report's
 * @param {object|null} [options.confinement] the run's confinement (`confinement.js` `selectConfinement`); a registry
 *   built without one, or for a run that opted out, starts its targets unconfined
 * @returns {object}
 * @throws {Error} Naming every problem `registryProblems` finds.
 */
function createRegistry(entries, { root, httpPort, scratch = [], principalMappings = {}, confinement = null } = {}) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new Error('createRegistry requires a root: every relative target resolves against it');
  }
  // A relative root would resolve against whatever the process's working
  // directory is when a target is spawned, so it is fixed to an absolute path
  // once, here.
  const registryRoot = path.resolve(root);
  const problems = [...registryProblems(entries), ...principalMappingProblems(principalMappings, entries)];
  if (problems.length > 0) throw new Error(`the execution-target registry is not valid:\n  ${problems.join('\n  ')}`);
  const registered = deepFreeze(structuredClone(entries));
  const commandEntries = registered.filter((entry) => kindOf(entry) === 'cli');
  const serverEntries = registered.filter(isMcpEntry);
  const apiEntries = registered.filter(isApiEntry);
  const loginsGranted = Object.freeze((confinement?.logins ?? []).map((login) => Object.freeze({ ...login })));

  /**
   * The environment keys a command entry's requests may carry: its own, the host system directory the Windows runner needs to
   * launch its Job Object helper, and the variable that carries the login its `login` names (Story 1.113), the one variable of
   * the host's environment a login hands the target.
   */
  const commandEnvironmentKeys = (entry) => [
    ...entry.environmentKeys,
    ...(process.platform === 'win32' && entry.executable === 'tea-skill-runner' ? ['SystemRoot'] : []),
    ...(Object.hasOwn(LOGIN_ADAPTERS, entry.login) ? [LOGIN_ADAPTERS[entry.login].variable] : []),
  ];

  /** An entry's own keys plus the caller's extra names, sorted, with PATH refused. */
  function keysWithExtras(interfaceId, own, extraNames = []) {
    const keys = [...new Set([...own, ...extraNames])].sort();
    const pathKey = keys.find((key) => key.toUpperCase() === 'PATH');
    if (pathKey !== undefined) {
      throw new TypeError(
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

  /**
   * Resolve a principal to a host credential for one authorized interface.
   * The returned value is held in memory for the request only. The environment
   * key must already be permitted by the selected registry entry, and the host
   * environment may omit it when a live secret is unavailable.
   */
  function principalValue(principal, interfaceId) {
    const mapping = principalMappings?.[principal];
    if (mapping === undefined || mapping.interfaceId !== interfaceId) {
      throw new Error(`principal ${JSON.stringify(principal)} has no mapping for registry interface ${JSON.stringify(interfaceId)}`);
    }
    const value = process.env[mapping.environmentKey];
    if (typeof value !== 'string') {
      throw new TypeError(
        `principal ${JSON.stringify(principal)} maps to environment key ${JSON.stringify(mapping.environmentKey)}, which is not set on the host`,
      );
    }
    return `${mapping.prefix ?? ''}${value}`;
  }

  /**
   * The strings a granted login hands a target (Story 1.113), which must be scrubbed from target answers and faults as an injected
   * environment value is: the host's value of each granted login's variable, and every string value of each granted file (or the
   * whole text of a file that is not JSON) except the values under the keys its adapter declares public, since a plan name or a
   * scope is no secret and scrubbing it would rewrite an answer's own words before the verdict is computed.
   * A command target can write the token into the private home that a server target then prints, so the set covers every request kind.
   */
  function loginSecrets() {
    const strings = [];
    const files = new Map();
    for (const login of loginsGranted) {
      const adapter = Object.hasOwn(LOGIN_ADAPTERS, login.login) ? LOGIN_ADAPTERS[login.login] : undefined;
      if (login.variable !== null && login.variable !== undefined && adapter !== undefined) {
        const value = process.env[adapter.variable];
        if (typeof value === 'string' && value !== '') strings.push(value);
      }
      if (login.file === null || login.file === undefined) continue;
      files.set(login.file, new Set([...(files.get(login.file) ?? []), ...(adapter?.publicFields ?? [])]));
    }
    for (const [file, publicFields] of files) {
      const collect = (value) => {
        if (typeof value === 'string') strings.push(value);
        else if (value !== null && typeof value === 'object') {
          for (const [key, inner] of Object.entries(value)) {
            if (!publicFields.has(key)) collect(inner);
          }
        }
      };
      let text;
      try {
        text = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      try {
        collect(JSON.parse(text));
      } catch {
        strings.push(text.trim());
      }
    }
    return strings;
  }

  /** The mapped host values that must be scrubbed from target answers and faults. */
  function principalSecrets() {
    return Object.values(principalMappings ?? {}).flatMap((mapping) => {
      const value = process.env[mapping.environmentKey];
      if (typeof value !== 'string') return [];
      return mapping.prefix ? [`${mapping.prefix}${value}`, value] : [value];
    });
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
    return keysWithExtras(interfaceId, entries.flatMap(commandEnvironmentKeys), extraNames);
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
    const environment = readEnvironment(keysWithExtras(interfaceId, commandEnvironmentKeys(chosen[0]), extraNames));
    // An empty login variable is no login (`loginsOf` records none), so the target is not handed one that could outrank the file.
    const loginVariable = Object.hasOwn(LOGIN_ADAPTERS, chosen[0].login) ? LOGIN_ADAPTERS[chosen[0].login].variable : null;
    if (loginVariable !== null && environment[loginVariable] === '' && !chosen[0].environmentKeys.includes(loginVariable)) {
      delete environment[loginVariable];
    }
    return environment;
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
          permittedEnvironmentKeys: keysWithExtras(entry.interfaceId, commandEnvironmentKeys(entry), environmentKeys[entry.interfaceId]),
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
   * an `api` request goes to the command-line adapter, which denies it. On a
   * historical probe's deployment arm, `options.deployment` (`deploymentAccess`'s
   * answer) names the origin each HTTP interface answers at, where every `api`
   * call goes with no server started, decided over the authorization
   * eval-quality allowed there.
   *
   * In a confined run every process the port starts runs through the run's
   * mechanism, writing only `options.workspace` (the workspace's checkout,
   * which a confined run requires) and reading none of `options.git.directory`
   * (the project's git directory) but `options.git.metadata` (the worktree's
   * own entry in it), and reading, writing or connecting to nothing under
   * `options.privateRoot` (the user's private root directory, beneath which
   * the run's private parent holds the evaluation layer's bridge token and
   * socket and its working directories; `registry.privateRoot`) apart from
   * the one private home directory the port makes beneath that parent, which
   * `HOME` and the XDG base directories name, which the target may read and
   * write and which the run removes; `resetHome()` empties it for an
   * independent arm or leg; with `options.audit` the mechanism reports the
   * paths every process of the port opens outside what was granted
   * (`confinement-audit.js`), which `observedMounts()` reads (async) and which
   * is empty otherwise; `releaseHome()` ends the audit and removes the home.
   *
   * @returns {Promise<{port: {probe: Function}, policy: object, mcpPolicy: object, observedMounts: () => Promise<string[]>, auditChannel: () => ({ canariesSent: number, canariesDelivered: number, logReportedLoss: boolean }|null), hostSocketReport: () => ({ calls: number, truncatedCalls: number, socketsLeftReachable: number }|null), releaseHome: () => void, resetHome: () => void}>}
   */
  async function createProbePort(options) {
    const policy = commandTargetPolicy(options);
    const adapters = await loadAdapters();
    const mcpPolicy = adapters.parseMcpTargetPolicy(mcpTargetPolicy(options));
    const serverTarget = (entry) =>
      targetPath({ ...entry.server, interfaceId: entry.interfaceId, kind: 'api' }, options.projectRoot ?? registryRoot);
    let commandMechanism = adapters.nodeCommandMechanism;
    let mcpMechanism = adapters.nodeStdioMcpMechanism;
    let sandbox = null;
    let home = null;
    // The login files the run grants (Story 1.113), linked into every private home this port makes.
    const loginLinks = loginLinksOf(loginsGranted);
    if (confines(confinement)) {
      // An audited port's observer keeps its files in a private directory no target can reach (`makeAuditDirectory`).
      const audit = options.audit === true ? { directory: makeAuditDirectory(scratch) } : null;
      // Bubblewrap forks the command it confines, so a private directory carries the signal that ended a target.
      let status = null;
      if (confinement.mode === 'bubblewrap') {
        status = fs.mkdtempSync(path.join(scratch.privateParent ?? os.tmpdir(), 'tea-evaluate-status-'));
        scratch.push(status);
      }
      sandbox = targetSandbox({
        confinement,
        workspace: options.workspace,
        git: options.git ?? null,
        privateRoot: options.privateRoot ?? null,
        // One private home per sandbox, beneath the run's private parent, holding a link to each login file an entry's `login`
        // grants; an opt-out run makes none and keeps the host's environment.
        home: (home = makeTargetHome(scratch, loginLinks)),
        linked: loginLinks.map(({ target }) => target),
        audit,
        status,
      });
      try {
        await sandbox.start();
      } catch (error) {
        sandbox.release();
        throw error;
      }
      // Each started target's own declared system paths, which its audit grants.
      const declared = new Map();
      const declare = (target, entry) => {
        const systemPaths = entry.systemPaths ?? [];
        declared.set(target, [...(declared.get(target) ?? []), ...systemPaths]);
      };
      for (const entry of commandEntries) declare(targetPath(entry, options.projectRoot ?? registryRoot), entry);
      for (const entry of serverEntries) declare(targetPath(entry, options.projectRoot ?? registryRoot), entry);
      for (const entry of apiEntries) if (entry.server !== undefined) declare(serverTarget(entry), entry);
      const systemPathsOf = (target) => declared.get(target) ?? [];
      const egressOf = egressResolver(registered, (entry) =>
        isApiEntry(entry) ? serverTarget(entry) : targetPath(entry, options.projectRoot ?? registryRoot),
      );
      commandMechanism = confinedCommandMechanism(commandMechanism, sandbox, systemPathsOf, scratch, egressOf);
      mcpMechanism = confinedMcpMechanism(mcpMechanism, sandbox, systemPathsOf, scratch, egressOf);
    }
    const commandAdapter = adapters.createCommandLineAdapter(policy, commandMechanism);
    const mcpAdapter = adapters.createMcpAdapter(mcpPolicy, mcpMechanism);
    const apiPort =
      apiEntries.length === 0
        ? commandAdapter
        : createApiPort({
            entries: apiEntries,
            httpPort: loadedHttpPort(),
            cwd: options.cwd,
            targetOf: serverTarget,
            readEnvironment: (names) => readEnvironment(names),
            mechanism: commandMechanism,
            maxOutputBytes: MAX_OUTPUT_BYTES,
            scratch,
            deployment: options.deployment ?? null,
          });
    // An independent arm or leg that shares this port starts with an empty home (one call): a new home replaces the old one,
    // which is removed, so a process an earlier arm left running holds a profile that cannot reach the next arm's home.
    let used = false;
    const resetHome = () => {
      if (home === null || !used) return;
      used = false;
      const previous = home;
      home = makeTargetHome(scratch, loginLinks);
      sandbox.setHome(home);
      releaseTargetHome(scratch, previous);
    };
    const port = {
      probe: (request, signal) => {
        used = true;
        if (request?.kind === 'mcp') return mcpAdapter.probe(request, signal);
        if (request?.kind === 'api') return apiPort.probe(request, signal);
        return commandAdapter.probe(request, signal);
      },
      resetHome,
    };
    // The trial's private home goes when its trial ends; one that cannot be removed stays in `scratch` for the run's end.
    const releaseHome = () => {
      sandbox?.release();
      if (home !== null) releaseTargetHome(scratch, home);
    };
    return {
      port,
      policy,
      mcpPolicy,
      observedMounts: async () => (sandbox === null ? [] : await sandbox.observedMounts()),
      // How complete the audit's reports were, read after `observedMounts`; `null` where nothing audits (Story 1.81).
      auditChannel: () => (sandbox === null ? null : sandbox.auditChannel()),
      // What the calls' lists of host sockets left reachable once their budget ran out; `null` where nothing hides sockets (Story 1.82).
      hostSocketReport: () => (sandbox === null ? null : sandbox.socketReport()),
      // What the calls' egress proxies refused, `{ refusals, omitted }`; `null` where nothing proxies (Story 1.83).
      egressReport: () => (sandbox === null ? null : sandbox.egressReport()),
      releaseHome,
      resetHome,
    };
  }

  /**
   * What a historical probe's deployment arm may reach (the origins and the
   * authorization eval-quality's `evaluateTarget` allowed for each), or why the
   * registry's HTTP policy does not authorize the deployment
   * (`http-target.js` `deploymentAccess`).
   *
   * @param {Record<string, string>} origins interface ID to origin
   * @param {{ signal?: AbortSignal }} [options]
   * @returns {Promise<{ origins: object, authorizations: object } | { refused: string }>}
   */
  function deploymentAccessOf(origins, { signal } = {}) {
    return deploymentAccess({ entries: apiEntries, origins, signal });
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
    confinement,
    /** Each entry that lists `egress`, by interface ID, with its `host:port` items sorted: what a confined run records as authorized to reach (Story 1.83). */
    egressEntries: Object.freeze(
      registered
        .filter((entry) => egressItemsOf(entry).length > 0)
        .map((entry) => ({ interfaceId: entry.interfaceId, hosts: egressItemsOf(entry).map((item) => `${item.host}:${item.port}`) }))
        .sort((a, b) => (a.interfaceId < b.interfaceId ? -1 : a.interfaceId > b.interfaceId ? 1 : 0)),
    ),
    /** What each entry that declares a `login` was given: its interface, executable, adapter, the variable's name and the file's path, with no value (Story 1.113). */
    logins: loginsGranted,
    /** The user's private root directory the run's parent sits beneath (`workspace.js` `makePrivateParent`), or `null` where none was made. */
    get privateRoot() {
      return scratch.privateRoot ?? null;
    },
    apiFor,
    apiSecrets,
    ceilingMs,
    degenerateHttpPort,
    commandTargetPolicy,
    createProbePort,
    deploymentAccess: deploymentAccessOf,
    hostEnvironment,
    loginSecrets,
    mcpTargetPolicy,
    permittedEnvironmentKeys,
    principalSecrets,
    principalValue,
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
 * The spelling of `host` the evaluation's HTTP port hands eval-quality's
 * policy: the hostname of a URL naming it, unbracketed (lower case, an IPv4
 * address in dotted decimal, an IPv6 address compressed, a name in punycode),
 * as the template's `originOf` and `hostOfUrl` read it; null when no URL can
 * name it. The policy reads both hosts in lower case with one trailing dot
 * dropped, so an entry whose `host` lowercases to this spelling is allowed as
 * written, and any other spelling (`127.1`, an expanded IPv6 address, an IDN)
 * is denied on every request. eval-quality exports no host normalization
 * (`normalizeHost` is module-private in 4.3.0, and `parseAddress` canonicalizes
 * an address in a form no URL carries), so the URL's hostname is the spelling
 * `check` holds an entry to.
 *
 * @param {string} host
 * @returns {string|null}
 */
function canonicalHost(host) {
  const literal = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  if (!URL.canParse(`http://${literal}/`)) return null;
  const { hostname } = new URL(`http://${literal}/`);
  return hostname.startsWith('[') ? hostname.slice(1, -1) : hostname;
}

/**
 * A started server's port keys that the runtime could not set as written:
 * `portFileEnvironmentKey` equal to `portEnvironmentKey`, which would carry
 * two values, and either key named in `environmentKeys` as well, whose host
 * value the runtime would silently replace.
 */
function portKeyProblems(index, server) {
  const problems = [];
  if (server.portFileEnvironmentKey !== undefined && server.portFileEnvironmentKey === server.portEnvironmentKey) {
    problems.push(
      `registry[${index}] names ${JSON.stringify(server.portEnvironmentKey)} as both its server's portEnvironmentKey and its portFileEnvironmentKey; the runtime passes 0 in one and the port file's path in the other, so name two keys`,
    );
  }
  for (const field of ['portEnvironmentKey', 'portFileEnvironmentKey']) {
    if (server[field] !== undefined && server.environmentKeys.includes(server[field])) {
      problems.push(
        `registry[${index}] names ${JSON.stringify(server[field])} as its server's ${field} and in its environmentKeys; the runtime sets that key, so the host's value would never reach the server; leave it out of environmentKeys`,
      );
    }
  }
  return problems;
}

/**
 * Every HTTP entry that cannot reach its target as written, as one line each:
 * a `host` spelled otherwise than a URL spells it, letter case aside, which
 * eval-quality's policy denies on every request (`host-not-authorized`), since
 * the port hands it the URL's hostname; and an `auth` header sent over `http` to an address
 * where eval-quality's `staysOnHost` says a connection leaves the host, which would put the
 * credential on the network in clear text; such a target is served over
 * https, with `NODE_EXTRA_CA_CERTS` for a private authority; and a started
 * server's port keys the runtime could not set as written (`portKeyProblems`); and an authorization
 * eval-quality's own `parseProbeTargetPolicy` refuses, read over what the entry becomes: the entry's own
 * authorization (a started server's at the port the runtime first names for it, the scheme's default) and one
 * per `deployments` origin, each exactly as the runtime builds it (`authorizationOf`, `deploymentAuthorizations`)
 * and each alone, so a finding names the entry or the deployment it refuses and carries the parser's reason. `staysOnHost` is
 * narrower than `classifyAddress(address) === 'loopback'`: the NAT64
 * (`64:ff9b::7f00:1`) and IPv4-compatible (`::127.0.0.1`) spellings of a
 * loopback address class `loopback` and still leave the host.
 * Each entry is first held to
 * its schema (`registryProblems`); an entry off it is left to that finding.
 *
 * @param {unknown} entries
 * @returns {Promise<string[]>}
 */
async function apiRegistryProblems(entries) {
  if (!Array.isArray(entries)) return [];
  const problems = [];
  let staysOnHost;
  let parseProbeTargetPolicy;
  for (const [index, entry] of entries.entries()) {
    if (!isApiEntry(entry) || !entryValidator(API_REGISTRY_ENTRY_DEFINITION)(entry)) continue;
    parseProbeTargetPolicy ??= (await loadAdapters()).parseProbeTargetPolicy;
    const authorizations = [
      { where: `registry[${index}]`, authorization: authorizationOf(entry, entry.port ?? defaultPortOf(entry)) },
      ...deploymentAuthorizations(entry).map((authorization, at) => ({ where: `registry[${index}].deployments[${at}]`, authorization })),
    ];
    for (const { where, authorization } of authorizations) {
      try {
        parseProbeTargetPolicy({ authorizations: [authorization] });
      } catch (error) {
        if (error?.name !== 'RuntimeFault') throw error;
        problems.push(
          `${where} becomes an authorization eval-quality's parseProbeTargetPolicy refuses (read as a policy of that authorization alone, so a pointer starts at /authorizations/0): ${error.message}`,
        );
      }
    }
    // The entry's own origin and each deployment origin it authorizes meet the same two rules.
    const origins = [
      { where: `registry[${index}]`, scheme: entry.scheme, host: entry.host, addresses: entry.addresses },
      ...(entry.deployments ?? []).map((deployment, at) => ({ where: `registry[${index}].deployments[${at}]`, ...deployment })),
    ];
    for (const { where, scheme, host, addresses } of origins) {
      const canonical = canonicalHost(host);
      if (canonical === null) {
        problems.push(`${where} names host ${JSON.stringify(host)}, which no URL can name`);
      } else if (canonical !== host.toLowerCase()) {
        problems.push(
          `${where} names host ${JSON.stringify(host)}, which a URL spells ${JSON.stringify(canonical)}; the port hands eval-quality's policy the URL's hostname, so write ${JSON.stringify(canonical)}`,
        );
      }
      if (entry.auth !== undefined && scheme === 'http') {
        staysOnHost ??= (await loadEngine()).staysOnHost;
        const exposed = addresses.filter((address) => !staysOnHost(address));
        if (exposed.length > 0) {
          problems.push(
            `${where} sends its ${entry.auth.header} header over plain http to ${exposed.map((address) => JSON.stringify(address)).join(', ')}, where eval-quality's staysOnHost says a connection leaves this host, so the credential would cross the network in clear text; serve the target over https with scheme "https" (setting NODE_EXTRA_CA_CERTS to the PEM file of a private certificate authority that signed its certificate), or keep every address on this host`,
          );
        }
      }
    }
    if (entry.server !== undefined) problems.push(...portKeyProblems(index, entry.server));
  }
  return problems;
}

/**
 * The registry an `evaluation.json` declares, resolved against `root`, with
 * the evaluation's HTTP port when one was loaded.
 *
 * @param {{registry?: unknown}} evaluation The parsed manifest.
 * @param {{root: string, httpPort?: object, scratch?: string[], confinement?: object|null}} options
 * @returns {object}
 */
function registryFromEvaluation(evaluation, options) {
  return createRegistry(evaluation?.registry, { ...options, principalMappings: evaluation?.principalMappings });
}

/** The `egress` items an entry lists, `[]` for an entry that lists none or starts no process (an HTTP entry that names no server). */
function egressItemsOf(entry) {
  if (entry === null || typeof entry !== 'object' || !Array.isArray(entry.egress)) return [];
  if (isApiEntry(entry) && entry.server === undefined) return [];
  const listed = entry.egress.filter(
    (item) => item !== null && typeof item === 'object' && typeof item.host === 'string' && Number.isInteger(item.port),
  );
  return listed.sort((a, b) => (a.host === b.host ? a.port - b.port : a.host < b.host ? -1 : 1));
}

/**
 * The egress authorizations each started target's calls hold under Bubblewrap (Story 1.83): one for each host and port an entry lists,
 * for the target of a command entry, a tool-server entry or an HTTP entry's started service, every entry that starts a target
 * contributing its own. A target no entry authorizes a host for has none, and its calls get no route out. A call finds its entries by
 * its target, as `systemPathsOf` does.
 *
 * @param {object[]} entries the registry's entries
 * @param {(entry: object) => string} targetOf the target a call of the entry starts (an HTTP entry's server)
 * @returns {(target: string) => object[]} the authorizations of `egressAuthorization`
 */
function egressResolver(entries, targetOf) {
  const authorized = new Map();
  for (const entry of entries) {
    const items = egressItemsOf(entry);
    if (items.length === 0) continue;
    const target = targetOf(entry);
    authorized.set(target, [...(authorized.get(target) ?? []), ...items.map((item) => egressAuthorization(entry, item))]);
  }
  return (target) => authorized.get(target) ?? [];
}

/**
 * Every `egress` item that cannot hold as written, as one line each: an item on an HTTP entry that names no server (nothing starts, so
 * nothing reaches out); a host spelled otherwise than a URL spells it, letter case aside, which eval-quality's policy would deny on
 * every request; a wildcard host, and a host the proxy's request grammar cannot carry (`isEgressHost`), which no request can match; a
 * host and port listed twice; and an authorization eval-quality's own `parseProbeTargetPolicy` refuses (an address that is no literal,
 * say), read over what the item becomes (`egressAuthorization`) and alone, so a finding names the item and carries the parser's reason. Each entry is first held to its schema (`registryProblems`); an entry off it is left to that finding.
 *
 * @param {unknown} entries
 * @returns {Promise<string[]>}
 */
async function egressRegistryProblems(entries) {
  if (!Array.isArray(entries)) return [];
  const problems = [];
  let parseProbeTargetPolicy;
  for (const [index, entry] of entries.entries()) {
    if (entry === null || typeof entry !== 'object' || !Array.isArray(entry.egress) || entry.egress.length === 0) continue;
    if (!entryValidator(definitionOf(entry))(entry)) continue;
    if (isApiEntry(entry) && entry.server === undefined) {
      problems.push(
        `registry[${index}] lists egress and names no server, so no process of the entry starts and nothing reaches out; an HTTP entry that names its port is reached as it is, so remove the egress`,
      );
      continue;
    }
    parseProbeTargetPolicy ??= (await loadAdapters()).parseProbeTargetPolicy;
    const seen = new Set();
    for (const [at, item] of entry.egress.entries()) {
      const where = `registry[${index}].egress[${at}]`;
      const canonical = canonicalHost(item.host);
      if (item.host.includes('*')) {
        problems.push(
          `${where} names host ${JSON.stringify(item.host)}, a wildcard, which the proxy does not support; list each host the entry reaches, since eval-quality's policy compares the host exactly`,
        );
      } else if (canonical === null) {
        problems.push(`${where} names host ${JSON.stringify(item.host)}, which no URL can name`);
      } else if (canonical !== item.host.toLowerCase()) {
        problems.push(
          `${where} names host ${JSON.stringify(item.host)}, which a URL spells ${JSON.stringify(canonical)}; the proxy hands eval-quality's policy the request's hostname as a URL spells it, so write ${JSON.stringify(canonical)}`,
        );
      } else if (!isEgressHost(item.host)) {
        problems.push(
          `${where} names host ${JSON.stringify(item.host)}, which the proxy cannot read out of a CONNECT request (a host holds letters, digits, ".", "-" and "_" and at most ${MAX_HOST_BYTES} bytes, or is an IPv6 address), so no request can match it`,
        );
      }
      const key = `${item.host.toLowerCase()}:${item.port}`;
      if (seen.has(key)) problems.push(`${where} lists ${key} a second time`);
      seen.add(key);
      try {
        parseProbeTargetPolicy({ authorizations: [egressAuthorization(entry, item)] });
      } catch (error) {
        if (error?.name !== 'RuntimeFault') throw error;
        problems.push(
          `${where} becomes an authorization eval-quality's parseProbeTargetPolicy refuses (read as a policy of that authorization alone, so a pointer starts at /authorizations/0): ${error.message}`,
        );
      }
    }
  }
  return problems;
}

module.exports = {
  API_REGISTRY_ENTRY_DEFINITION,
  MAX_OUTPUT_BYTES,
  MCP_REGISTRY_ENTRY_DEFINITION,
  principalMappingProblems,
  REGISTRY_ENTRY_DEFINITION,
  cliObservation,
  createRegistry,
  isApiEntry,
  isMcpEntry,
  isRegistry,
  kindOf,
  egressRegistryProblems,
  egressResolver,
  apiRegistryProblems,
  mcpRegistryProblems,
  observedText,
  probeRequest,
  readEnvironment,
  registryFromEvaluation,
  registryProblems,
  removedNetworkProblem,
  repeatedPairs,
  sharedInterfaces,
  sharedTargetSystemPaths,
};
