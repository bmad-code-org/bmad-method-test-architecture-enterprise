/**
 * The runtime's egress proxy for a Bubblewrap target (Story 1.83, AD-8).
 *
 * A Bubblewrap target runs in a network namespace of its own with a loopback and nothing else, so it has no route to the host's
 * abstract Unix sockets and none to a model provider either. An entry that must reach a host declares the hosts it authorizes
 * (`egress` in `evaluation.json`), and each of its calls gets one route out: a Unix socket in a private directory of the call, which
 * the runtime serves here and the call's status shim reaches from inside the namespace through a loopback port
 * (`confinement-status.cjs`, `--egress`). It is the mirror of the bridge a started service is reached through (`confinement-relay.js`):
 * the bridge carries the runtime's connections in, this carries the target's connections out, and no network path joins the namespaces.
 *
 * The proxy speaks the one request an HTTPS client makes of a proxy, `CONNECT <host>:<port>`, and tunnels the bytes after it. It decides
 * each request with eval-quality's `evaluateTarget`, as the evaluation's HTTP port decides each of its own (`http-target.js`):
 *
 *   1. the request is asked with no address. A host and port no authorization names is refused here, before any name is resolved, so
 *      a target cannot use the runtime's resolver to look up names of its choosing;
 *   2. the host is resolved, and the addresses `evaluateTarget` allows are the ones connected to, in the order they resolved and the
 *      next when one cannot be reached, so the address the decision was about is the address the connection goes to and a name that
 *      resolves differently a moment later reaches nothing new;
 *   3. a refusal answers `403` naming the reason and is recorded with the host, the port and the registry entries (`interfaceId`) whose
 *      authorization was asked, which `run.json` carries (`egressRefusals`).
 *
 * An entry that authorizes no host gets no proxy and no route. The authorization is held in this process's memory for the life of
 * the call; no file carries it, and the socket's directory goes with the call (`confinement.js`).
 */

'use strict';

const dns = require('node:dns');
const net = require('node:net');

const { splice } = require('./confinement-status.cjs');

/** The method every egress authorization names: eval-quality's decision needs one, and a tunnel carries none the runtime can see. */
const EGRESS_METHOD = 'GET';
/** The scheme every egress authorization names: a `CONNECT` tunnel is what an HTTPS client asks of a proxy. */
const EGRESS_SCHEME = 'https';
/** The most bytes a request's head may hold. */
const HEAD_BYTES = 8192;
/** How long a connection may take to send its head. */
const HEAD_MS = 5000;
/** How long a host may take to resolve. */
const LOOKUP_MS = 5000;
/** How long a tunnel may take to connect. */
const CONNECT_MS = 10_000;
/** The most tunnels one call may hold open. */
const MAX_TUNNELS = 128;
/** The most distinct refusals a call's record keeps; the rest are counted. */
const MAX_REFUSALS = 50;
/** The most bytes a host may hold: a DNS name's limit. A longer host is no request the proxy reads (`400`). */
const MAX_HOST_BYTES = 253;
/** The most characters of a refusal's detail the record keeps; a longer one ends in `...`. */
const MAX_DETAIL_CHARS = 500;
/**
 * The host grammar of a `CONNECT` target, as a regular expression source: a name of letters, digits, `.`, `-` and `_` (at most
 * `MAX_HOST_BYTES`) or a bracketed IPv6 address. The registry's `check` holds an `egress` item to the same source (`isEgressHost`),
 * so an item no request can match is refused before a run.
 */
const HOST_SOURCE = `\\[[0-9A-Fa-f:.]{2,45}\\]|[A-Za-z0-9._-]{1,${MAX_HOST_BYTES}}`;
const AUTHORITY = new RegExp(`^(${HOST_SOURCE}):([1-9][0-9]{0,4})$`);
const HOST = new RegExp(`^(?:${HOST_SOURCE})$`);

/**
 * Whether the proxy can read `host`, an `egress` item's host as a URL spells it (an IPv6 address unbracketed), out of a `CONNECT`
 * request: the one grammar `parseConnectLine` applies.
 *
 * @param {string} host
 * @returns {boolean}
 */
function isEgressHost(host) {
  return HOST.test(host.includes(':') && !host.startsWith('[') ? `[${host}]` : host);
}

/** `text` cut to `max` characters, with `...` after a cut. */
function clip(text, max) {
  const value = String(text);
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

/**
 * The eval-quality authorization one `egress` item of a registry entry becomes: the tunnel's scheme and method, and the caps a
 * tunnel does not use at their smallest, since the runtime cannot count the bytes of an opaque stream.
 *
 * @param {{ interfaceId: string, maxElapsedMs: number }} entry the registry entry
 * @param {{ host: string, port: number, addresses: string[] }} item
 * @returns {object}
 */
function egressAuthorization(entry, item) {
  return {
    interfaceId: entry.interfaceId,
    scheme: EGRESS_SCHEME,
    host: item.host,
    port: item.port,
    addresses: [...item.addresses],
    methods: [EGRESS_METHOD],
    safeMethods: [],
    maxRedirects: 0,
    maxElapsedMs: entry.maxElapsedMs,
    maxRequestBytes: 1,
    maxResponseBytes: 1,
  };
}

/**
 * The host and port a `CONNECT` request line names, the host as a URL spells it (lower case, an IPv6 address compressed and
 * unbracketed), or `null` for any other request: another method, a target that is no `host:port`, a port outside 1 to 65535 or with a
 * sign or a leading zero, a host holding anything but letters, digits, `.`, `-` and `_` (or a bracketed IPv6 address), or a host
 * longer than `MAX_HOST_BYTES`.
 *
 * @param {string} line
 * @returns {{ host: string, port: number } | null}
 */
function parseConnectLine(line) {
  const match = /^CONNECT (\S+) HTTP\/1\.[01]$/.exec(line);
  if (match === null) return null;
  const authority = AUTHORITY.exec(match[1]);
  if (authority === null) return null;
  const port = Number(authority[2]);
  if (port > 65_535 || !URL.canParse(`http://${authority[1]}/`)) return null;
  const { hostname } = new URL(`http://${authority[1]}/`);
  return { host: hostname.startsWith('[') ? hostname.slice(1, -1) : hostname, port };
}

/** An answer with a short text body, then the connection's end. */
function answer(socket, status, text, headers = {}) {
  const body = `${text}\n`;
  const lines = [`HTTP/1.1 ${status}`, 'Content-Type: text/plain', `Content-Length: ${Buffer.byteLength(body)}`, 'Connection: close'];
  for (const [name, value] of Object.entries(headers)) lines.push(`${name}: ${value}`);
  socket.end(`${lines.join('\r\n')}\r\n\r\n${body}`);
  // A client that keeps its side open is cut a second later, so an answered request holds nothing for long.
  socket.resume();
  const cut = setTimeout(() => socket.destroy(), 1000);
  cut.unref();
  socket.once('close', () => clearTimeout(cut));
}

/**
 * Reads a request head (up to the blank line, at most `HEAD_BYTES`, within `HEAD_MS`) and hands its first line and the bytes that
 * arrived after it, put back at the head of the stream, which stays paused; `onHead(null)` when the head is too long, never ends
 * or never arrives.
 */
function readHead(socket, onHead) {
  const chunks = [];
  let size = 0;
  let done = false;
  const finish = (value) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    socket.off('data', onData);
    socket.off('end', onEnd);
    socket.off('close', onEnd);
    socket.pause();
    if (value !== null && value.rest.length > 0) socket.unshift(value.rest);
    onHead(value === null ? null : value.line);
  };
  const onData = (chunk) => {
    chunks.push(chunk);
    size += chunk.length;
    const buffer = Buffer.concat(chunks, size);
    const end = buffer.indexOf('\r\n\r\n');
    if (end === -1) {
      if (size > HEAD_BYTES) finish(null);
      return;
    }
    if (end > HEAD_BYTES) {
      finish(null);
      return;
    }
    const head = buffer.toString('latin1', 0, end);
    finish({ line: head.split('\r\n')[0], rest: buffer.subarray(end + 4) });
  };
  const onEnd = () => finish(null);
  const timer = setTimeout(() => finish(null), HEAD_MS);
  timer.unref();
  socket.on('data', onData);
  socket.once('end', onEnd);
  socket.once('close', onEnd);
}

/** Resolves `host` to its addresses, or rejects when it does not resolve within `ms`. */
function resolveAll(lookup, host, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    timer.unref();
    lookup(host).then(
      (found) => {
        clearTimeout(timer);
        resolve(found.map((entry) => (typeof entry === 'string' ? entry : entry.address)));
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Serves the egress proxy on the Unix socket `socketPath` for one call.
 *
 * @param {object} options
 * @param {string} options.socketPath where the proxy listens; the shim connects to it from inside the call's namespace
 * @param {object[]} options.authorizations the call's `egressAuthorization`s, one for each host and port its entries authorize
 * @param {Function} options.evaluateTarget eval-quality's `evaluateTarget`
 * @param {(host: string) => Promise<Array<string | { address: string }>>} [options.lookup] how a host resolves, for a case to answer
 * @param {(refusal: { interfaceIds: string[], host: string, port: number, address: string | null, reason: string, detail: string }) => void} [options.onRefusal]
 * @returns {Promise<{ close: () => Promise<void>, refusals: () => { refusals: object[], omitted: number } }>} resolves once it listens
 */
async function startEgress({
  socketPath,
  authorizations,
  evaluateTarget,
  lookup = (host) => dns.promises.lookup(host, { all: true }),
  onRefusal = () => {},
}) {
  const interfaceIds = [...new Set(authorizations.map((authorization) => authorization.interfaceId))];
  const open = new Set();
  let tunnels = 0;
  let clients = 0;
  const refusals = new Map();
  let omitted = 0;
  // What a refusal records is bounded: the host by the request grammar (`MAX_HOST_BYTES`), the detail here, so a call's record holds
  // at most `MAX_REFUSALS` refusals of a known size however a target asks.
  const refuse = (refusal) => {
    const bounded = { ...refusal, detail: clip(refusal.detail, MAX_DETAIL_CHARS) };
    const key = JSON.stringify([bounded.host, bounded.port, bounded.address, bounded.reason]);
    if (refusals.has(key)) refusals.get(key).count += 1;
    else if (refusals.size < MAX_REFUSALS) refusals.set(key, { ...bounded, count: 1 });
    else omitted += 1;
    onRefusal(bounded);
    return bounded;
  };

  /**
   * The decision for `host:port`: the addresses to connect to, in the order they resolved, or the refusal. Each authorization is
   * asked alone, since eval-quality reports the first authorization's denial when none allows, which would hide an item that
   * lists the host and port behind one that lists another.
   */
  async function decide(host, port) {
    const asked = (address) => ({ scheme: EGRESS_SCHEME, host, port, address, method: EGRESS_METHOD });
    const ask = (authorization, address) =>
      evaluateTarget({ authorizations: [authorization] }, { interfaceId: authorization.interfaceId, ...asked(address) });
    // A host and port no authorization names are refused before the host is resolved: the denial of an unresolved address
    // means the scheme, host and port were admitted and only the address is open.
    const unresolved = authorizations.map((authorization) => ({ authorization, decision: ask(authorization, '') }));
    const matching = unresolved
      .filter(({ decision }) => decision.reason === 'address-unparseable')
      .map(({ authorization }) => authorization);
    if (matching.length === 0) {
      const denial = unresolved[0]?.decision ?? { reason: 'interface-not-authorized', detail: 'no registry entry authorizes any host' };
      return { refusal: { interfaceIds, host, port, address: null, reason: denial.reason, detail: denial.detail } };
    }
    let addresses;
    try {
      addresses = net.isIP(host) === 0 ? await resolveAll(lookup, host, LOOKUP_MS) : [host];
    } catch (error) {
      return { failure: `${host} does not resolve (${error?.code ?? error?.message ?? error})` };
    }
    const allowed = [];
    let firstDenial = null;
    for (const address of addresses) {
      const answers = matching.map((authorization) => ask(authorization, address));
      if (answers.some((decision) => decision.allowed)) allowed.push(address);
      else firstDenial ??= { address, ...answers[0] };
    }
    if (allowed.length > 0) return { addresses: allowed };
    if (firstDenial === null) return { failure: `${host} resolved to no address` };
    return { refusal: { interfaceIds, host, port, address: firstDenial.address, reason: firstDenial.reason, detail: firstDenial.detail } };
  }

  const server = net.createServer({ allowHalfOpen: true }, (client) => {
    // A connection that is still sending its head or waiting on its decision holds a descriptor and a lookup too.
    if (clients >= 2 * MAX_TUNNELS) {
      client.destroy();
      return;
    }
    clients += 1;
    open.add(client);
    client.once('close', () => {
      clients -= 1;
      open.delete(client);
    });
    client.on('error', () => client.destroy());
    readHead(client, async (line) => {
      if (line === null) {
        client.destroy();
        return;
      }
      const request = parseConnectLine(line);
      if (request === null) {
        if (/^[A-Z]+ /.test(line) && !line.startsWith('CONNECT ')) {
          answer(client, '405 Method Not Allowed', 'the egress proxy tunnels CONNECT requests only', { Allow: 'CONNECT' });
        } else {
          answer(client, '400 Bad Request', 'the egress proxy reads CONNECT host:port only');
        }
        return;
      }
      const { host, port } = request;
      let decision;
      try {
        decision = await decide(host, port);
      } catch (error) {
        decision = { failure: `the decision failed: ${error?.message ?? error}` };
      }
      if (client.destroyed) return;
      if (decision.refusal !== undefined) {
        const refusal = refuse(decision.refusal);
        answer(
          client,
          '403 Forbidden',
          `the egress proxy refused ${host}:${port} for ${interfaceIds.map((id) => JSON.stringify(id)).join(', ')}: ${refusal.reason}: ${refusal.detail}`,
        );
        return;
      }
      if (decision.failure !== undefined) {
        answer(client, '502 Bad Gateway', `the egress proxy could not reach ${host}:${port}: ${decision.failure}`);
        return;
      }
      if (tunnels >= MAX_TUNNELS) {
        answer(client, '503 Service Unavailable', `the egress proxy holds ${MAX_TUNNELS} tunnels already`);
        return;
      }
      tunnels += 1;
      let counted = true;
      const release = () => {
        if (counted) {
          counted = false;
          tunnels -= 1;
        }
      };
      let current = null;
      client.once('close', () => current?.destroy());
      // The connection goes to an address the decision was about; one that cannot be reached lets the next allowed address try,
      // and the last failure is the answer.
      const attempt = (at) => {
        const upstream = net.connect({ host: decision.addresses[at], port, allowHalfOpen: true });
        current = upstream;
        open.add(upstream);
        let connected = false;
        upstream.once('close', () => {
          open.delete(upstream);
          if (connected || at === decision.addresses.length - 1 || client.destroyed) release();
        });
        upstream.setTimeout(CONNECT_MS, () => upstream.destroy(new Error('timeout')));
        upstream.on('error', (error) => {
          if (connected || client.destroyed) return;
          if (at < decision.addresses.length - 1) attempt(at + 1);
          else answer(client, '502 Bad Gateway', `the egress proxy could not reach ${host}:${port}: ${error.code ?? error.message}`);
        });
        upstream.once('connect', () => {
          connected = true;
          upstream.setTimeout(0);
          if (client.destroyed) {
            upstream.destroy();
            return;
          }
          client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          splice(client, upstream);
        });
      };
      attempt(0);
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => {
      server.off('error', reject);
      server.on('error', () => {});
      resolve();
    });
  });
  return {
    refusals: () => ({ refusals: [...refusals.values()], omitted }),
    close() {
      return new Promise((resolve) => {
        server.close(() => resolve());
        for (const socket of open) socket.destroy();
      });
    },
  };
}

module.exports = {
  EGRESS_METHOD,
  EGRESS_SCHEME,
  MAX_DETAIL_CHARS,
  MAX_HOST_BYTES,
  MAX_REFUSALS,
  MAX_TUNNELS,
  egressAuthorization,
  isEgressHost,
  parseConnectLine,
  startEgress,
};
