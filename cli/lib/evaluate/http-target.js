/**
 * `api` targets (Story 1.11, AD-4): the evaluation's own HTTP port, the policy
 * the registry hands it, and the server the runtime starts for a call.
 *
 * TeA holds no HTTP port of its own (AD-4 rejects a shared one): an `api`
 * evaluation carries `adapter/http-probe-port.mjs`, rendered from the Evaluate
 * skill's template, whose default export builds eval-quality's
 * `EnvironmentProbePort` from configuration alone (where each interface is,
 * eval-quality's `ProbeTargetPolicy`, auth headers and a transport) and asks
 * eval-quality's `evaluateTarget` for every allow or deny decision.
 *
 * The runtime never loads that file into its own process. Each call starts it
 * as a Node process of its own (`TEA_EVALUATE_HTTP_PORT_HOST=1`), whose last
 * lines hand the port to TeA's host (`http-port-host.js`), and speaks one
 * message with it over file descriptor 3, a channel opened for the protocol
 * alone; what the port prints on its standard output and error is captured
 * and quoted when the call fails. The adopter's code then runs
 * apart from the run's state, a port that hangs is ended at its ceiling, and
 * every module the runtime itself loads stays one `test:direction` can name.
 * `probeHttpPort` asks the port, once before a run starts anything, for the
 * protocol it speaks, and each call first holds the file to the bytes that
 * answered then.
 *
 * For an entry that names a `server`, one call is:
 *
 *   1. the port the server listens on: with `portFileEnvironmentKey`, none
 *      yet, and a private directory on the run's scratch list for the file
 *      the server reports its port in; otherwise a free port, taken and
 *      released before anything runs;
 *   2. the policy and targets for that port (the scheme's default port while
 *      the server has reported none), handed to the port with the call;
 *   3. the port decides; once it has allowed the call's first hop, and before
 *      its elapsed cap starts, its `prepare` step asks the runtime to start
 *      the server (`send`, with the target the port allowed): the runtime asks
 *      eval-quality's `evaluateTarget` itself whether that target is allowed,
 *      starts the server from the workspace through eval-quality's
 *      `nodeCommandMechanism` (a process group of its own, killed if the
 *      runtime dies), and waits until the allowed address accepts a
 *      connection on the server's port. With `portFileEnvironmentKey`, the
 *      server gets `0` in `portEnvironmentKey` and the file's path in
 *      `portFileEnvironmentKey`, binds a port the system chooses and writes
 *      its number to the file; the runtime answers `ready` with the policy and
 *      targets at that port, and TeA's host probes the call again over them,
 *      so eval-quality decides at the port the server bound and the port sends
 *      there. Otherwise the server gets the chosen port in
 *      `portEnvironmentKey`, and `ready` alone lets the port send;
 *   4. an answer that arrives before the server was ready, or after it ended
 *      other than with exit code 0, came from no server of the run's, and is
 *      refused as a target that could not run. With the chosen port, another
 *      process can take the port between its release and the server's bind;
 *      a port another process listens on before the server starts is
 *      refused, and one taken after that answers unnoticed until the
 *      server's end is reported. A server that reports the port it bound
 *      leaves no such window;
 *   5. the server's group is ended once the call settles, however it settles,
 *      and the port file's directory is removed.
 *
 * A call therefore runs against the workspace's code as it stands, a mutation
 * included, as a command and a tool server do, and a denied call starts
 * nothing. A deployed target (an entry naming its `port`) is reached as it is.
 * An entry's `deployments` name other origins of its interface (Story 1.32):
 * on a historical probe's deployment arm, once `deploymentAccess` has asked
 * eval-quality's `evaluateTarget` which of the entry's candidates allows the
 * origin the probe names, every call of the interface goes to that origin,
 * starts no server, and is decided over that one authorization, a redirect
 * included; no other call's policy holds a deployment.
 * On a gameability arm the port answers from the degenerate response with a
 * transport that sends nothing (`degenerateApiPort`), so a call the policy does
 * not allow is denied as on a real arm. An answer is held to eval-quality's own
 * `ProbeObservation` parser (`probeParsers.response`) before the run records
 * it, so a port that answers with no observation breaks the port's contract
 * (exit 12) and is never judged as the target's behavior.
 */

'use strict';

const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const dns = require('node:dns');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { StringDecoder } = require('node:string_decoder');

const { quotedCapture } = require('./arm');
const { loadConformance, loadEngine } = require('./engine');
const { HOST_ENVIRONMENT_KEY, HTTP_PORT_PROTOCOL, PROTOCOL_FD, UnansweredRequest } = require('./http-port-host');

/** Where the evaluation's HTTP port lives, relative to the evaluation folder. */
const HTTP_PORT_MODULE = 'adapter/http-probe-port.mjs';

/** Extra time a started server's own ceiling gets beyond its start and one call, so the call's cap fires first. */
const SERVER_GRACE_MS = 5000;
/** How long the port's own process may take to start and load eval-quality, beyond a call's ceilings. */
const PORT_START_ALLOWANCE_MS = 15_000;
/** How often a starting server's port is tried. */
const READY_POLL_MS = 25;
/** How long a call that failed waits for its server's end to be reported, so the cause names it. */
const SERVER_SETTLE_MS = 250;
/** The most the port's own process may print on its standard output and error together before it is ended. */
const PORT_OUTPUT_BYTES = 1024 * 1024;
/** What the port's process may write on the protocol channel beyond six bytes per answer byte (an answer's JSON escaping). */
const PORT_CHANNEL_ALLOWANCE = 1024 * 1024;
/** The host's variables the port's process inherits beside PATH: the extra certificate authorities Node reads. */
const INHERITED_KEYS = ['NODE_EXTRA_CA_CERTS'];
/**
 * How the runtime opens a file a port or a server can replace while the run
 * goes on: read only, never through a link, and without waiting on a pipe or
 * device, so neither holds the runtime, its timers or its signal handlers.
 */
const READ_REGULAR = fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0) | (fs.constants.O_NOFOLLOW ?? 0);

/** The evaluation's HTTP port cannot be used: exit 10 for an authoring defect, 12 for a port that could not run. */
class HttpPortError extends Error {
  constructor(message, exitCode = 10) {
    super(message);
    this.name = 'HttpPortError';
    this.exitCode = exitCode;
  }
}

/**
 * A failure of the port's own process (it could not start, ended early, broke
 * the protocol or outlived a ceiling), carrying what the process printed whole
 * as `captured`, which the run scrubs before it quotes the end of it.
 */
class PortProcessError extends Error {
  constructor(message, { exitCode = 10, captured = '' } = {}) {
    super(message);
    this.name = 'PortProcessError';
    this.exitCode = exitCode;
    this.captured = captured;
  }
}

/** Whether a registry entry is an HTTP target, which its `kind` alone says. */
function isApiEntry(entry) {
  return entry !== null && typeof entry === 'object' && entry.kind === 'api';
}

/**
 * The environment the port's own process starts with: the host's PATH, the
 * extra certificate authorities Node reads (so a port can reach an https
 * target a private authority signed), and the key that starts its host.
 */
function portEnvironment() {
  const environment = {};
  for (const key of ['PATH', ...INHERITED_KEYS]) {
    if (process.env[key] !== undefined) environment[key] = process.env[key];
  }
  return { ...environment, [HOST_ENVIRONMENT_KEY]: '1' };
}

/**
 * The digest of a file's bytes, or `null` when the file is absent, a link or
 * not a regular file, read as `READ_REGULAR` opens it.
 */
function fileDigest(file) {
  let descriptor;
  try {
    descriptor = fs.openSync(file, READ_REGULAR);
  } catch (error) {
    if (['ENOENT', 'ELOOP', 'EMLINK'].includes(error.code)) return null;
    throw error;
  }
  try {
    if (!fs.fstatSync(descriptor).isFile()) return null;
    return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(descriptor)).digest('hex')}`;
  } finally {
    fs.closeSync(descriptor);
  }
}

/**
 * The evaluation's HTTP port file, held to a regular file in a real
 * `adapter/` directory, and the digest of its bytes.
 *
 * @param {string} folder the evaluation folder
 * @returns {{ file: string, folder: string, digest: string }}
 * @throws {HttpPortError}
 */
function httpPortFile(folder) {
  const directory = path.join(folder, 'adapter');
  const file = path.join(folder, ...HTTP_PORT_MODULE.split('/'));
  for (const [where, expected] of [
    [directory, 'directory'],
    [file, 'file'],
  ]) {
    let stats;
    try {
      stats = fs.lstatSync(where);
    } catch {
      throw new HttpPortError(
        `the registry declares an api target and ${HTTP_PORT_MODULE} is absent; render it from the Evaluate skill's template`,
      );
    }
    if (expected === 'directory' ? !stats.isDirectory() : !stats.isFile()) {
      throw new HttpPortError(
        `${expected === 'directory' ? 'adapter' : HTTP_PORT_MODULE} is not a regular ${expected}, so the runtime does not start the port through it`,
      );
    }
  }
  const digest = fileDigest(file);
  if (digest === null)
    throw new HttpPortError(`${HTTP_PORT_MODULE} is not a regular file, so the runtime does not start the port through it`);
  return { file, folder, digest };
}

/**
 * One exchange with the port's own process: `message` sent on the protocol
 * channel (file descriptor 3), and every line it answers there handed to
 * `onMessage` until it returns a value other than `undefined`, which the
 * exchange resolves with. What the process prints on its standard output and
 * error is the adopter's, captured and quoted in a failure. The process is
 * ended however the exchange ends. One that cannot start or outlives
 * `timeoutMs` rejects with a `PortProcessError` whose exit code is 12, a
 * target that could not run; one that exits first, writes a line outside the
 * protocol or passes a ceiling rejects with exit code 10, a port that does
 * not serve.
 */
function exchangeWithPort({ httpPort, message, onMessage, timeoutMs, maxChannelBytes = PORT_CHANNEL_ALLOWANCE, signal }) {
  return new Promise((resolve, reject) => {
    const stdio = ['ignore', 'pipe', 'pipe'];
    stdio[PROTOCOL_FD] = 'pipe';
    const child = spawn(process.execPath, [httpPort.file], {
      cwd: httpPort.folder,
      env: portEnvironment(),
      stdio,
    });
    const channel = child.stdio[PROTOCOL_FD];
    const decoder = new StringDecoder('utf8');
    let settled = false;
    let printed = '';
    let pending = '';
    let channelBytes = 0;
    const finish = (action) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      channel.end();
      // The process ends on its own once its channel closes; one that does not is killed.
      const killer = setTimeout(() => child.kill('SIGKILL'), 2000);
      killer.unref();
      child.once('exit', () => clearTimeout(killer));
      action();
    };
    // What the process printed goes on the error whole: the run scrubs it before it cuts the end a failure quotes.
    const failed = (detail, exitCode = 10) =>
      new PortProcessError(`the evaluation's HTTP port ${HTTP_PORT_MODULE} ${detail}`, { exitCode, captured: printed });
    const stop = (detail, exitCode) => {
      child.kill('SIGKILL');
      finish(() => reject(failed(detail, exitCode)));
    };
    const timer = setTimeout(() => stop(`did not answer within ${timeoutMs}ms and was ended`, 12), timeoutMs);
    const onAbort = () => {
      if (!settled) channel.write(`${JSON.stringify({ type: 'abort' })}\n`);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    // A port's own logging (a console.log, a warning) goes to its standard output or error, which never reach the
    // protocol: both are kept, in the order they arrive, for the failure to quote.
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => {
        printed += chunk;
        if (printed.length > PORT_OUTPUT_BYTES) stop(`printed past its output ceiling (${PORT_OUTPUT_BYTES} characters) and was ended`);
      });
    }
    // Each line is handled after the one before it, since answering `send` waits for a server to start.
    let handled = Promise.resolve();
    const handle = async (line) => {
      if (settled) return;
      let answer;
      try {
        answer = JSON.parse(line);
      } catch {
        // The line is quoted cut at its end, JSON-escaped first, so the run's scrub finds a secret's leading part there.
        stop(`wrote a line that is not the runtime's protocol: ${JSON.stringify(line).slice(0, 200)}`);
        return;
      }
      try {
        const outcome = await onMessage(answer, (reply) => {
          if (!settled) channel.write(`${JSON.stringify(reply)}\n`);
        });
        if (outcome !== undefined) finish(() => resolve(outcome));
      } catch (error) {
        finish(() => reject(error));
      }
    };
    channel.on('data', (chunk) => {
      channelBytes += chunk.byteLength;
      if (channelBytes > maxChannelBytes) {
        stop(`wrote past its protocol channel ceiling (${maxChannelBytes} bytes) and was ended`);
        return;
      }
      // One decoder over the whole stream: a character whose bytes arrive in two chunks is read whole.
      pending += decoder.write(chunk);
      let newline;
      while ((newline = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        handled = handled.then(() => handle(line));
      }
    });
    channel.on('error', () => {});
    child.once('error', (error) => finish(() => reject(failed(`could not start: ${error.message}`, 12))));
    child.once('close', (code, signalName) => {
      // A line already read is handled before the process's end is.
      handled = handled.then(() => finish(() => reject(failed(`ended (${signalName ?? `exit ${code}`}) before it answered`))));
    });
    if (signal?.aborted) onAbort();
    channel.write(`${JSON.stringify(message)}\n`);
  });
}

/**
 * Asks the evaluation's HTTP port, started once as its own process, which
 * protocol it speaks, before a run starts anything.
 *
 * @param {string} folder the evaluation folder
 * @returns {Promise<{ file: string, folder: string, digest: string }>}
 * @throws {HttpPortError} exit 10 for a port file that is absent, does not start TeA's host or speaks another
 *   protocol; exit 12 for one whose process cannot start or does not answer in time
 */
async function probeHttpPort(folder) {
  const httpPort = httpPortFile(folder);
  let hello;
  try {
    hello = await exchangeWithPort({
      httpPort,
      message: { type: 'hello' },
      onMessage: (answer) => (answer?.type === 'hello' ? answer : undefined),
      timeoutMs: PORT_START_ALLOWANCE_MS,
    });
  } catch (error) {
    // Asked for its protocol, the port holds no configuration and no auth value, so what it printed carries no secret.
    const quoted = quotedCapture(error.captured);
    throw new HttpPortError(
      error.exitCode === 12
        ? `${error.message}${quoted}`
        : `${error.message}${quoted}; its last lines hand the port to TeA's host, as the Evaluate skill's template does`,
      error.exitCode ?? 10,
    );
  }
  if (hello.protocol !== HTTP_PORT_PROTOCOL || hello.valid !== true) {
    throw new HttpPortError(
      hello.protocol === HTTP_PORT_PROTOCOL
        ? `${HTTP_PORT_MODULE} hands TeA's host no createHttpProbePort factory and nodeTransport`
        : `${HTTP_PORT_MODULE} speaks protocol ${JSON.stringify(hello.protocol ?? null)} and this runtime speaks ${HTTP_PORT_PROTOCOL}; render it again from the Evaluate skill's template`,
    );
  }
  return httpPort;
}

/**
 * Every HTTP entry whose `auth` names a key this host has no value for, as one
 * line each: a call would go out with no credential and read its refusal as the
 * target's behavior.
 *
 * @param {object[]} entries the registry's entries
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
function missingCredentials(entries, env = process.env) {
  return entries
    .filter((entry) => isApiEntry(entry) && entry.auth !== undefined && typeof env[entry.auth.environmentKey] !== 'string')
    .map(
      (entry) =>
        `registry entry ${JSON.stringify(entry.interfaceId)} sends its ${entry.auth.header} header from ${entry.auth.environmentKey}, which this host does not set`,
    );
}

/** One entry's authorization of eval-quality's `ProbeTargetPolicy`, at `port`. */
function authorizationOf(entry, port) {
  return {
    interfaceId: entry.interfaceId,
    scheme: entry.scheme,
    host: entry.host,
    port,
    addresses: [...entry.addresses],
    methods: [...entry.methods],
    safeMethods: [...entry.safeMethods],
    maxRedirects: entry.maxRedirects,
    maxElapsedMs: entry.maxElapsedMs,
    maxRequestBytes: entry.maxRequestBytes,
    maxResponseBytes: entry.maxResponseBytes,
  };
}

/**
 * The authorizations of eval-quality's `ProbeTargetPolicy` that may admit a
 * deployment of one entry's interface: the entry's own, when it names a
 * deployed `port`, then one per origin its `deployments` list, each with the
 * entry's methods, redirects and ceilings.
 */
function deploymentCandidates(entry) {
  return [
    ...(entry.server === undefined ? [authorizationOf(entry, entry.port)] : []),
    ...(entry.deployments ?? []).map((deployment) => ({
      ...authorizationOf(entry, deployment.port),
      scheme: deployment.scheme,
      host: deployment.host,
      addresses: [...deployment.addresses],
    })),
  ];
}

/**
 * The target an origin names (`scheme://host[:port]`), as the port hands it
 * to eval-quality: the scheme without its colon, the URL's hostname unbracketed
 * (the spelling the port reads a URL's host in), and the port, or the scheme's
 * default; null when `origin` is no http or https origin (a path, a query, a
 * fragment or credentials included), which `check` refuses under `historical`.
 *
 * @param {string} origin
 * @returns {{ scheme: string, host: string, port: number } | null}
 */
function originTarget(origin) {
  if (typeof origin !== 'string' || !URL.canParse(origin)) return null;
  const url = new URL(origin);
  const scheme = url.protocol.slice(0, -1);
  if (
    !['http', 'https'].includes(scheme) ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== '' ||
    /[?#]/.test(origin)
  ) {
    return null;
  }
  const host = url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname;
  return { scheme, host, port: url.port === '' ? defaultPortOf({ scheme }) : Number(url.port) };
}

/**
 * What the port takes for one call: the policy and the targets over every
 * entry at the port `portOf` gives it (a deployed entry's own; a started one
 * only for the call that starts it), and the auth header of the call's own
 * interface, `interfaceId`, from the host's value for its key. Another
 * interface's credential never reaches the call's port, since the run scrubs
 * a call's answer and faults of its own interface's secrets alone.
 *
 * On a historical probe's deployment arm, `deployment` (`deploymentAccess`'s
 * answer) names where each HTTP interface answers and the one authorization
 * eval-quality allowed there: the targets name those origins, and that
 * authorization stands in the policy in place of the entry's own, so every
 * hop of every request, a redirect included, is decided over the arm's origin
 * alone. An entry's `deployments` join no other call's policy.
 */
function portConfiguration({ entries, portOf, readEnvironment, interfaceId, deployment = null }) {
  const reached = entries.map((entry) => ({ entry, port: portOf(entry) })).filter(({ port }) => port !== null);
  const auth = {};
  for (const entry of entries) {
    if (entry.auth === undefined || entry.interfaceId !== interfaceId) continue;
    const value = readEnvironment([entry.auth.environmentKey])[entry.auth.environmentKey];
    if (value !== undefined) auth[entry.interfaceId] = { [entry.auth.header]: `${entry.auth.prefix ?? ''}${value}` };
  }
  const deployed = deployment?.authorizations ?? {};
  const own = reached.filter(({ entry }) => deployed[entry.interfaceId] === undefined);
  const targets = Object.fromEntries(own.map(({ entry, port }) => [entry.interfaceId, { scheme: entry.scheme, host: entry.host, port }]));
  for (const id of Object.keys(deployed)) targets[id] = originTarget(deployment.origins[id]);
  return {
    policy: { authorizations: [...own.map(({ entry, port }) => authorizationOf(entry, port)), ...Object.values(deployed)] },
    targets,
    auth,
  };
}

/** A deployment's host cannot be resolved in time: the deployment is unreachable, which is infrastructure (exit 12). */
class DeploymentUnreachable extends Error {
  constructor(message) {
    super(message);
    this.name = 'DeploymentUnreachable';
  }
}

/** The first address `host` resolves to, as the port's own transport resolves it, within `timeoutMs` and `signal`. */
function resolveFirst(host, { lookup, timeoutMs, signal }) {
  if (net.isIP(host) !== 0) return Promise.resolve(host);
  return new Promise((resolve, reject) => {
    const fail = (reason) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new DeploymentUnreachable(reason));
    };
    const onAbort = () => fail(`resolving ${host} was aborted`);
    const timer = setTimeout(() => fail(`${host} did not resolve within ${timeoutMs} ms`), timeoutMs);
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
    lookup(host).then(
      ({ address }) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        resolve(address);
      },
      (error) => fail(`${host} does not resolve (${error?.code ?? error?.message ?? error})`),
    );
  });
}

/**
 * What a deployment arm may reach, or why the registry does not authorize
 * the deployment: for each HTTP interface `origins` names, the origin's host
 * resolved once, to its first address, as the port resolves it (within the
 * entry's `maxElapsedMs`), and eval-quality's `evaluateTarget` asked over the
 * entry's deployment candidates (`deploymentCandidates`) at the first method
 * the entry authorizes, so the decision is about where the deployment is. The
 * authorization eval-quality allowed is the one the arm's policy holds; a
 * denial names each candidate's reason, in eval-quality's words. An origin no
 * candidate admits at any address (its scheme, host or port denied) is refused
 * before its host is resolved, as the port denies an unresolved host; a host
 * some candidate would admit and that does not resolve throws
 * `DeploymentUnreachable`. The port asks again for every request it sends.
 *
 * @param {object} options
 * @param {object[]} options.entries the registry's `api` entries
 * @param {Record<string, string>} options.origins interface ID to origin
 * @param {AbortSignal} [options.signal]
 * @param {(host: string) => Promise<{ address: string }>} [options.lookup] how a host resolves, for a test to answer
 * @returns {Promise<{ origins: Record<string, string>, authorizations: Record<string, object> } | { refused: string }>}
 */
async function deploymentAccess({ entries, origins, signal, lookup = (host) => dns.promises.lookup(host) }) {
  const engine = await loadEngine();
  const authorizations = {};
  for (const [interfaceId, origin] of Object.entries(origins)) {
    const entry = entries.find((candidate) => candidate.interfaceId === interfaceId);
    const target = originTarget(origin);
    if (entry === undefined || target === null) {
      return { refused: `${JSON.stringify(origin)} is no origin of an HTTP interface the registry declares (${interfaceId})` };
    }
    const candidates = deploymentCandidates(entry);
    const method = entry.methods[0];
    const refusal = (asked) => {
      const reasons = candidates.map((candidate) => {
        const denial = engine.evaluateTarget({ authorizations: [candidate] }, asked);
        return `${candidate.scheme}://${candidate.host}:${candidate.port} ${denial.reason}: ${denial.detail}`;
      });
      return { refused: `eval-quality's policy does not authorize ${origin} for ${interfaceId} (${reasons.join('; ')})` };
    };
    // Asked first with no address, as the port asks for a host that does not resolve: a candidate that denies only the
    // unparseable address admits the origin's scheme, host and port, and only such an origin is worth resolving. Any
    // other origin is refused whether or not its host resolves.
    const unresolved = { interfaceId, ...target, address: '', method };
    const denials = candidates.map((candidate) => engine.evaluateTarget({ authorizations: [candidate] }, unresolved));
    if (!denials.some((denial) => denial.reason === 'address-unparseable')) {
      if (candidates.length === 0) {
        const denial = engine.evaluateTarget({ authorizations: [] }, unresolved);
        return { refused: `eval-quality's policy does not authorize ${origin} for ${interfaceId} (${denial.reason}: ${denial.detail})` };
      }
      return refusal(unresolved);
    }
    const address = await resolveFirst(target.host, { lookup, timeoutMs: entry.maxElapsedMs, signal });
    const asked = { ...unresolved, address };
    const decision = engine.evaluateTarget({ authorizations: candidates }, asked);
    if (!decision.allowed) return refusal(asked);
    authorizations[interfaceId] = decision.authorization;
  }
  return { origins, authorizations };
}

/** A port the system gives out now, free on every address, released for the server to take. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/**
 * Whether `address:port` accepts a connection now: `true`, or why the attempt
 * failed (the socket error's code, `ECONNREFUSED` while nothing listens, or
 * `timeout`), so a server that never becomes ready is reported with the last
 * reason, which tells a closed port from a host out of ports
 * (`EADDRNOTAVAIL`).
 */
function accepts(address, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: address, port });
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(READY_POLL_MS * 10, () => done('timeout'));
    socket.once('connect', () => done(true));
    socket.once('error', (error) => done(error.code ?? error.message));
  });
}

function delay(ms, signal) {
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** The name of the file a server reports its port in, inside the call's private directory. */
const PORT_FILE_NAME = 'port';
/** The most bytes a port file holds: a port number with a line ending and a little whitespace around it. */
const PORT_FILE_MAX_BYTES = 16;
/** What `readIfWritten` gives for a port file that names no port whatever it holds: a link, a file that is not regular, a long one. */
const NOT_A_PORT_FILE = Symbol('not a port file');

/**
 * The port a server's port file names: a whole number from 1 to 65535, written
 * in decimal with surrounding whitespace allowed; `null` while the file is
 * absent or holds only whitespace (the server has not written it yet), and
 * `NaN` for anything else, `NOT_A_PORT_FILE` among them. A number read while
 * the server is still writing it is a prefix of the whole, so it is still a
 * number; the runtime reads the file again once the port accepts a connection
 * and goes on when it changed.
 */
function reportedPort(text) {
  if (text === NOT_A_PORT_FILE) return Number.NaN;
  if (text === null || text.trim() === '') return null;
  const trimmed = text.trim();
  if (!/^[1-9][0-9]{0,4}$/.test(trimmed)) return Number.NaN;
  const port = Number(trimmed);
  return port <= 65_535 ? port : Number.NaN;
}

/**
 * A port file's text, `null` when it does not exist yet, and
 * `NOT_A_PORT_FILE` when it is a link, is not a regular file, or holds more
 * bytes than `PORT_FILE_MAX_BYTES`. It is opened as
 * `READ_REGULAR` opens a file and read up to that bound, so a server that
 * makes the path a pipe it never opens or a link to a device that never ends
 * cannot hold the runtime.
 */
function readIfWritten(file) {
  let descriptor;
  try {
    descriptor = fs.openSync(file, READ_REGULAR);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error.code === 'ELOOP' || error.code === 'EMLINK') return NOT_A_PORT_FILE;
    throw error;
  }
  try {
    if (!fs.fstatSync(descriptor).isFile()) return NOT_A_PORT_FILE;
    const buffer = Buffer.alloc(PORT_FILE_MAX_BYTES + 1);
    let length = 0;
    let read;
    do {
      read = fs.readSync(descriptor, buffer, length, buffer.length - length, null);
      length += read;
    } while (read > 0 && length < buffer.length);
    return length > PORT_FILE_MAX_BYTES ? NOT_A_PORT_FILE : buffer.toString('utf8', 0, length);
  } finally {
    fs.closeSync(descriptor);
  }
}

/**
 * One call's server: started on first use, through eval-quality's
 * `nodeCommandMechanism`, and ready once the address the port is about to
 * send to accepts a connection on the server's port. An entry naming
 * `portFileEnvironmentKey` reports that port in `portFile`, a path in a
 * private directory the caller made; any other listens on `port`, which the
 * caller chose. `start` resolves with the port the server is ready on.
 */
function callServer({ entry, port: chosenPort = null, portFile = null, cwd, target, environment, mechanism, maxOutputBytes }) {
  const reports = entry.server.portFileEnvironmentKey !== undefined;
  if (reports && typeof portFile !== 'string')
    throw new Error(`the server ${entry.server.target} reports its port and no port file was given`);
  const controller = new AbortController();
  let running = null;
  let ended = null;
  let ready = false;
  let starting = null;
  let address = null;
  let port = reports ? null : chosenPort;

  /** Where the server was to listen, as a sentence names it. */
  function where() {
    return port === null ? `on ${address}, before it reported a port` : `on ${address} port ${port}`;
  }

  /**
   * Why the server is gone, as a sentence naming whether it had accepted a
   * connection, with what it printed on standard error whole as `captured`,
   * which the run scrubs before it quotes the end of it.
   */
  function account() {
    const when = ready ? 'after it accepted a connection' : 'before it accepted a connection';
    if (ended.error !== undefined) {
      return new Error(`the server ${entry.server.target} stopped ${when} ${where()}: ${ended.error?.message ?? ended.error}`, {
        cause: ended.error,
      });
    }
    const { exitCode, stderr } = ended.result;
    return Object.assign(new Error(`the server ${entry.server.target} exited ${exitCode} ${when} ${where()}`), {
      captured: String(stderr ?? ''),
    });
  }

  /**
   * The port the server's file names now, `null` while it names none yet;
   * throws when the file holds something other than a port number.
   */
  function readReport() {
    const text = readIfWritten(portFile);
    const reported = reportedPort(text);
    if (Number.isNaN(reported)) {
      throw new TypeError(
        `the server ${entry.server.target} wrote something other than a port number (a whole number from 1 to 65535) to the file ${entry.server.portFileEnvironmentKey} names`,
      );
    }
    return { text, reported };
  }

  function start(signal, sendingTo) {
    starting ??= (async () => {
      address = sendingTo;
      if (typeof address !== 'string' || address.length === 0) throw new Error('the port named no address it sends to');
      // A chosen port that already accepts a connection belongs to another process, which took it after the runtime
      // released it. A server that reports its port binds one the system gives it alone.
      if (!reports && (await accepts(address, port)) === true) {
        throw new Error(`another process listens on ${address} port ${port}, which was chosen for the server ${entry.server.target}`);
      }
      const env = {
        ...(process.env.PATH === undefined ? {} : { PATH: process.env.PATH }),
        ...environment,
        ...(reports
          ? { [entry.server.portEnvironmentKey]: '0', [entry.server.portFileEnvironmentKey]: portFile }
          : { [entry.server.portEnvironmentKey]: String(port) }),
      };
      running = mechanism.run(
        {
          target,
          subcommandPath: [],
          argv: [...entry.server.targetArgs],
          env,
          stdin: { kind: 'absent' },
          cwd,
          maxElapsedMs: entry.server.readyTimeoutMs + entry.maxElapsedMs + SERVER_GRACE_MS,
          maxOutputBytes: entry.server.maxOutputBytes ?? maxOutputBytes,
        },
        controller.signal,
      );
      running.then(
        (result) => {
          ended = { result };
        },
        (error) => {
          ended = { error };
        },
      );
      const deadline = Date.now() + entry.server.readyTimeoutMs;
      let accepted = null;
      for (;;) {
        if (ended !== null) throw account();
        const report = reports ? readReport() : null;
        const candidate = reports ? report.reported : port;
        if (candidate !== null) {
          accepted = await accepts(address, candidate);
          if (accepted === true) {
            if (ended !== null) throw account();
            // A number read while the server was writing it is a prefix of the port: once the file stops changing, the
            // port it names is the one the server bound.
            if (!reports || readIfWritten(portFile) === report.text) {
              port = candidate;
              ready = true;
              return port;
            }
            continue;
          }
        }
        if (signal?.aborted) throw new Error('the call was aborted while its server started');
        if (Date.now() >= deadline) {
          throw new Error(
            candidate === null
              ? `the server ${entry.server.target} wrote no port to the file ${entry.server.portFileEnvironmentKey} names within readyTimeoutMs (${entry.server.readyTimeoutMs}ms)`
              : `the server ${entry.server.target} did not accept a connection on ${address} port ${candidate} within readyTimeoutMs (${entry.server.readyTimeoutMs}ms); the last attempt failed with ${accepted}`,
          );
        }
        await delay(READY_POLL_MS, signal);
      }
    })();
    return starting;
  }

  /** Why the server ended, once its end has been reported within `settleMs`, or null while it runs or when it never started. */
  async function endedWithin(settleMs) {
    if (running === null) return null;
    if (ended === null && settleMs > 0) await Promise.race([running.catch(() => {}), delay(settleMs)]);
    return ended === null ? null : account();
  }

  /** Whether the server has ended other than with exit code 0: an answer after that is no answer of its. */
  function endedAbnormally() {
    return ended !== null && (ended.error !== undefined || ended.result.exitCode !== 0);
  }

  async function stop() {
    controller.abort();
    if (running !== null) await running.catch(() => {});
  }

  return {
    reports,
    start,
    stop,
    endedWithin,
    endedAbnormally,
    isReady: () => ready,
    account: () => (ended === null ? null : account()),
  };
}

/**
 * A thrown value rebuilt from the fault the port's process reported: the
 * code (eval-quality's, or `port-failure` for one it does not define), its
 * `reason` and artifact path, and its cause, a gameability request the
 * degenerate response answers none of as `UnansweredRequest`.
 */
function faultError(fault, faultCodes) {
  const error = new Error(String(fault?.message ?? 'the HTTP port failed'));
  error.name = typeof fault?.name === 'string' ? fault.name : 'Error';
  error.code = faultCodes.includes(fault?.code) ? fault.code : 'port-failure';
  if (typeof fault?.reason === 'string') error.reason = fault.reason;
  if (typeof fault?.artifactPath === 'string') error.artifactPath = fault.artifactPath;
  if (fault?.cause !== undefined) {
    error.cause =
      fault.cause.name === 'UnansweredRequest'
        ? new UnansweredRequest(fault.cause.message)
        : Object.assign(new Error(String(fault.cause.message)), { name: fault.cause.name });
  }
  return error;
}

/**
 * The fault a call records when the port's own process failed: eval-quality's
 * `port-failure` code, and the process's account, which carries what it
 * printed whole, kept as the cause, which the run scrubs and then quotes the
 * end of.
 */
function portFailure(cause, message = "the evaluation's HTTP port could not serve the call") {
  return Object.assign(new Error(`port-failure: ${message}`), { code: 'port-failure', cause });
}

/** A port's answer that breaks the port's contract: eval-quality's `port-contract-violation`, which stops the run (exit 12). */
function contractViolation(detail) {
  return Object.assign(new Error(`port-contract-violation: ${detail}`), { code: 'port-contract-violation' });
}

/**
 * The port's answer as the observation the run records: read by eval-quality's
 * own `ProbeObservation` parser (`probeParsers.response`), and correlated with
 * `request` by its identifiers and kind. Anything else breaks the port's
 * contract and is never judged as the target's behavior.
 */
function observationFor(answer, request, parsers) {
  const parsed = parsers.response.safeParse(answer);
  if (!parsed.success) {
    throw contractViolation(`the port answered with no ProbeObservation eval-quality reads: ${parsed.error.message}`);
  }
  const observation = parsed.data;
  if (
    observation.kind !== 'api' ||
    observation.probeId !== request.probeId ||
    observation.interfaceId !== request.interfaceId ||
    observation.operationId !== request.operationId
  ) {
    throw contractViolation('the port answered with no api observation of this request');
  }
  return observation;
}

/**
 * One call through the port's own process, answering its `send` by starting
 * `server` once eval-quality's own `evaluateTarget` allows the target it names;
 * the observation, or its fault thrown.
 */
async function callPort({ httpPort, message, server, configurationAt = null, signal, timeoutMs, maxChannelBytes }) {
  const engine = await loadEngine();
  const { probeParsers } = await loadConformance();
  if (fileDigest(httpPort.file) !== httpPort.digest) {
    throw portFailure(new Error(`${HTTP_PORT_MODULE} changed after the run started, so the port that answered it is gone`));
  }
  const { request, configuration } = message;
  return exchangeWithPort({
    httpPort,
    message: { type: 'call', ...message },
    timeoutMs,
    maxChannelBytes,
    signal,
    onMessage: async (answer, reply) => {
      if (answer?.type === 'send') {
        try {
          if (server === null) throw new Error('the call starts no server');
          // The port prepares on the request's first hop, so the target is the configured one, at the request's method:
          // only the address is the port's to name, and eval-quality holds it to the entry's addresses.
          const configured = configuration.targets[request.interfaceId] ?? { scheme: '', host: '', port: 0 };
          const decision = engine.evaluateTarget(configuration.policy, {
            interfaceId: request.interfaceId,
            scheme: configured.scheme,
            host: configured.host,
            port: configured.port,
            address: String(answer.target?.address ?? ''),
            method: request.method,
          });
          if (!decision.allowed) throw new Error(`eval-quality's policy does not allow the target the port named: ${decision.detail}`);
          const bound = await server.start(signal, decision.canonicalAddress);
          // A server that reported the port it bound is reached there: the port probes the call again over the policy
          // and targets at that port, so eval-quality decides where the request goes.
          reply(server.reports ? { type: 'ready', configuration: configurationAt(bound) } : { type: 'ready' });
        } catch (error) {
          reply({ type: 'not-ready', message: error.message });
        }
        return;
      }
      if (answer?.type === 'answer') {
        const observation = observationFor(answer.observation, request, probeParsers);
        if (server !== null && server !== undefined && !server.isReady()) {
          throw portFailure(
            new Error(`the port answered for ${request.interfaceId} before the call's server was ready, so no server of the run gave it`),
            'the answer came before the call started its server',
          );
        }
        if (server?.endedAbnormally()) {
          throw portFailure(server.account(), "the answer came after the call's server had ended, so no server of the run gave it");
        }
        return { observation };
      }
      if (answer?.type === 'fault') {
        const error = faultError(answer.fault, engine.RUNTIME_FAULT_CODES);
        // A server that stopped during the call explains a call that reached no answer better than the socket's error does.
        const stopped = error.code === 'port-failure' ? await server?.endedWithin(SERVER_SETTLE_MS) : null;
        if (stopped !== null && stopped !== undefined) {
          error.cause = Object.assign(new Error(`the server stopped during the call: ${stopped.message}`), { captured: stopped.captured });
        }
        throw error;
      }
    },
  });
}

/** An error from `callPort` as the call records it: a port-process failure becomes `port-failure`, anything else as it came. */
function asCallFault(error) {
  return error instanceof PortProcessError ? portFailure(error) : error;
}

/** What one call's port process may write on the protocol channel: six bytes per answer byte (JSON's worst escaping), and an allowance. */
function channelCeiling(entry) {
  return (entry?.maxResponseBytes ?? 0) * 6 + PORT_CHANNEL_ALLOWANCE;
}

/**
 * The port one workspace's `api` calls go through: for each call, the
 * evaluation's port started as its own process over the registry's `api`
 * entries, and the call's server started from `cwd` once the port has allowed
 * the call.
 *
 * @param {object} options
 * @param {object[]} options.entries the registry's `api` entries
 * @param {{ file: string, folder: string, digest: string }} options.httpPort `probeHttpPort`'s result
 * @param {string} options.cwd the workspace a server starts in
 * @param {(entry: object) => string} options.targetOf what starts an entry's server
 * @param {(names: string[]) => Record<string, string>} options.readEnvironment the host's values for keys
 * @param {{ run: Function }} options.mechanism eval-quality's `nodeCommandMechanism`
 * @param {number} options.maxOutputBytes a server's default output ceiling
 * @param {string[]} [options.scratch] the run's private directories, which a call's port-file directory joins while it runs
 * @param {{ origins: object, authorizations: object }|null} [options.deployment] on a historical probe's deployment arm,
 *   `deploymentAccess`'s answer: the origin each HTTP interface answers at, where every call goes and no server starts,
 *   and the one authorization eval-quality allowed there
 * @returns {{ probe: (request: object, signal?: AbortSignal) => Promise<object> }}
 */
function createApiPort({ entries, httpPort, cwd, targetOf, readEnvironment, mechanism, maxOutputBytes, scratch = [], deployment = null }) {
  return {
    async probe(request, signal) {
      const entry = entries.find((candidate) => candidate.interfaceId === request?.interfaceId);
      // On a deployment arm every HTTP interface answers at the deployment's origin, so no call starts a server.
      const launched = entry?.server === undefined || deployment !== null ? null : entry;
      const reports = launched?.server.portFileEnvironmentKey !== undefined;
      // The file a server reports its port in lives in a private directory of the call's, on the run's scratch list, so
      // a signal that ends the run removes it too.
      const portDirectory = reports ? fs.mkdtempSync(path.join(os.tmpdir(), 'tea-evaluate-port-')) : null;
      if (portDirectory !== null) scratch.push(portDirectory);
      let server = null;
      try {
        const launchedPort = launched === null || reports ? null : await freePort();
        const configurationAt = (port) =>
          portConfiguration({
            entries,
            portOf: (candidate) => (candidate.server === undefined ? candidate.port : candidate === launched ? port : null),
            readEnvironment,
            interfaceId: request?.interfaceId,
            deployment,
          });
        // Until the server reports the port it bound, the policy and targets name the scheme's default port; the call
        // is probed again at the reported port before anything is sent.
        const configuration = configurationAt(reports ? defaultPortOf(launched) : launchedPort);
        server =
          launched === null
            ? null
            : callServer({
                entry: launched,
                port: launchedPort,
                portFile: portDirectory === null ? null : path.join(portDirectory, PORT_FILE_NAME),
                cwd,
                target: targetOf(launched),
                environment: readEnvironment(launched.server.environmentKeys),
                mechanism,
                maxOutputBytes,
              });
        const { observation } = await callPort({
          httpPort,
          message: { configuration, request, launched: launched !== null },
          server,
          configurationAt,
          signal,
          timeoutMs: (entry?.maxElapsedMs ?? 0) + (launched?.server.readyTimeoutMs ?? 0) + PORT_START_ALLOWANCE_MS,
          maxChannelBytes: channelCeiling(entry),
        });
        return observation;
      } catch (error) {
        throw asCallFault(error);
      } finally {
        await server?.stop();
        if (portDirectory !== null) releasePortDirectory(scratch, portDirectory);
      }
    },
  };
}

/** The default port of an entry's scheme, which the policy names for a started server before it reports its own. */
function defaultPortOf(entry) {
  return entry.scheme === 'https' ? 443 : 80;
}

/**
 * Removes a call's port-file directory and takes it off the run's scratch
 * list once it is gone; one that cannot be removed stays listed, so the run's
 * end tries it again and reports it.
 */
function releasePortDirectory(scratch, directory) {
  try {
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    return;
  }
  const at = scratch.indexOf(directory);
  if (at !== -1) scratch.splice(at, 1);
}

/**
 * The evaluation's port on a gameability arm: the same policy and targets
 * (a started server's at its scheme's default port, since nothing starts),
 * every host of a request resolving to the first address of its interface's
 * entry, so eval-quality's own host check decides each spelling of a host as
 * on a real arm (eval-quality exports no host normalization for TeA to key a
 * table by), and every allowed request
 * answered from `answer` (`{ status, headers?, body? }`) with nothing sent, or
 * failing with `UnansweredRequest` as its cause when the degenerate response
 * answers none.
 */
function degenerateApiPort({ entries, httpPort, answer, readEnvironment }) {
  const degenerateAddresses = Object.fromEntries(entries.map((entry) => [entry.interfaceId, entry.addresses[0]]));
  return {
    async probe(request, signal) {
      const entry = entries.find((candidate) => candidate.interfaceId === request?.interfaceId);
      const configuration = portConfiguration({
        entries,
        portOf: (candidate) => candidate.port ?? defaultPortOf(candidate),
        readEnvironment,
        interfaceId: request?.interfaceId,
      });
      try {
        const { observation } = await callPort({
          httpPort,
          message: { configuration, request, launched: false, degenerate: answer ?? null, degenerateAddresses },
          server: null,
          signal,
          timeoutMs: (entry?.maxElapsedMs ?? 0) + PORT_START_ALLOWANCE_MS,
          maxChannelBytes: channelCeiling(entry),
        });
        return observation;
      } catch (error) {
        throw asCallFault(error);
      }
    },
  };
}

module.exports = {
  HTTP_PORT_MODULE,
  HttpPortError,
  UnansweredRequest,
  authorizationOf,
  callServer,
  createApiPort,
  degenerateApiPort,
  DeploymentUnreachable,
  deploymentAccess,
  httpPortFile,
  isApiEntry,
  missingCredentials,
  originTarget,
  portConfiguration,
  probeHttpPort,
};
