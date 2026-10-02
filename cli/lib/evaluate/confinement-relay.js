/**
 * The runtime's half of the bridge to a Bubblewrap target's HTTP server
 * (Story 1.63, AD-8).
 *
 * A Bubblewrap target runs in a network namespace of its own, so a server it
 * starts listens where the runtime cannot connect, and the host's abstract Unix
 * sockets do not exist for it. The status shim (`confinement-status.cjs`,
 * which runs inside the namespace before the target) serves a Unix socket in a
 * private directory of the call, which both sides reach by path; this module
 * speaks the shim's protocol (a first line `<host> <port>\n`, answered `ok\n`
 * or `fail\n`, then bytes both ways) from the host:
 *
 *   `bridgeAccepts`   whether `host:port` inside the namespace accepts a
 *                     connection now, the readiness check of a bridged server;
 *   `startForwarder`  a listener on the address and port the server's caller
 *                     expects, which connects each connection through the
 *                     bridge to the server.
 *
 * No network path joins the namespaces: every byte crosses the socket file the
 * runtime made. A forwarder listens only once the server has bound, since the
 * runtime starts it after `bridgeAccepts` answered true; it is never mistaken
 * for a server that is ready.
 */

'use strict';

const net = require('node:net');

/**
 * The hosts the shim connects to inside the namespace: its own loopback. The shim (`confinement-status.cjs`) is a single file a
 * target's sandbox reads, so it keeps its own copy of this list and of `splice` below; `test:evaluate-confinement` holds the
 * two lists equal.
 */
const BRIDGE_HOSTS = Object.freeze(['127.0.0.1', '::1', 'localhost']);

/**
 * Copies bytes both ways between two sockets, each side's end passed to the other (a client that closes its sending side
 * still reads the answer), a side's failure ending the other at once and a side's close ending the other once what it was
 * handed is written.
 */
function splice(first, second) {
  first.pipe(second);
  second.pipe(first);
  for (const [from, to] of [
    [first, second],
    [second, first],
  ]) {
    from.on('error', () => to.destroy());
    from.on('close', () => to.destroySoon());
  }
}

/** How long one readiness question waits for the bridge's answer. */
const BRIDGE_ANSWER_MS = 2000;

/** How long a forwarded connection waits for the bridge's answer: longer than the shim's own wait to reach the port (5 s), so the shim's answer is the one read. */
const FORWARD_ANSWER_MS = 10_000;

/** The longest answer a bridge gives: `fail` and its newline. */
const BRIDGE_ANSWER_BYTES = 8;

/**
 * The host the bridge names for `address`, an address eval-quality's policy canonicalized (`::1` arrives as
 * `0000:0000:0000:0000:0000:0000:0000:0001`): `127.0.0.1` or `::1`, the namespace's own loopback; `null` for any
 * other address, which no bridge reaches (a server bound to `127.0.0.2` is not at the host the shim connects to).
 *
 * @param {string} address
 * @returns {string | null}
 */
function bridgeHostOf(address) {
  if (address === '127.0.0.1') return '127.0.0.1';
  if (net.isIPv6(address) && URL.canParse(`http://[${address}]/`) && new URL(`http://[${address}]/`).hostname === '[::1]') return '::1';
  return null;
}

/**
 * Opens a connection through the bridge at `socketPath` to `host:port` inside
 * the namespace. Resolves `{ socket }` once the bridge answered `ok` (the
 * socket paused, bytes that came after the answer put back at its head), and
 * `{ reason }` otherwise: the socket error's code (`ENOENT` while the shim has
 * not made its socket yet, `ECONNREFUSED` while it does not listen), the
 * bridge's `fail` as `ECONNREFUSED` (a valid request fails only to reach the
 * port it names), `timeout`, `closed` or `protocol`.
 *
 * @param {string} socketPath
 * @param {string} host
 * @param {number} port
 * @param {number} [timeoutMs]
 * @returns {Promise<{ socket: net.Socket } | { reason: string }>}
 */
function openBridge(socketPath, host, port, timeoutMs = BRIDGE_ANSWER_MS) {
  return new Promise((resolve) => {
    const socket = net.connect({ path: socketPath, allowHalfOpen: true });
    let received = Buffer.alloc(0);
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.off('data', onData);
      resolve(value);
    };
    const fail = (reason) => {
      socket.destroy();
      settle({ reason });
    };
    const onData = (chunk) => {
      received = Buffer.concat([received, chunk]);
      const newline = received.indexOf(10);
      if (newline === -1) {
        if (received.length > BRIDGE_ANSWER_BYTES) fail('protocol');
        return;
      }
      const answer = received.toString('utf8', 0, newline);
      if (answer !== 'ok') {
        fail(answer === 'fail' ? 'ECONNREFUSED' : 'protocol');
        return;
      }
      socket.pause();
      const rest = received.subarray(newline + 1);
      if (rest.length > 0) socket.unshift(rest);
      settle({ socket });
    };
    const timer = setTimeout(() => fail('timeout'), timeoutMs);
    socket.once('connect', () => socket.write(`${host} ${port}\n`));
    socket.once('error', (error) => fail(error.code ?? error.message));
    socket.once('close', () => fail('closed'));
    socket.on('data', onData);
  });
}

/**
 * Whether `host:port` inside the namespace accepts a connection now: `true`, or
 * why the attempt failed (as `openBridge` names it), so a server that never
 * becomes ready is reported with the last reason.
 *
 * @param {string} socketPath
 * @param {string} host
 * @param {number} port
 * @param {number} [timeoutMs]
 * @returns {Promise<true | string>}
 */
async function bridgeAccepts(socketPath, host, port, timeoutMs = BRIDGE_ANSWER_MS) {
  const opened = await openBridge(socketPath, host, port, timeoutMs);
  if (opened.socket === undefined) return opened.reason;
  opened.socket.destroy();
  return true;
}

/**
 * Listens on `address` at `port` and connects every connection through the
 * bridge at `socketPath` to `address:targetPort` inside the namespace. With a
 * `port` another process holds, a forwarder that may not insist (`strict`
 * false) listens on a port the system gives instead; a strict one rejects with
 * the listen error.
 *
 * @param {object} options
 * @param {string} options.socketPath the bridge's Unix socket
 * @param {string} options.address a host `bridgeHostOf` names, where the runtime listens and where the server listens
 * @param {number} options.targetPort the port the server bound inside the namespace
 * @param {number} options.port the port to listen on, 0 for one the system gives
 * @param {boolean} [options.strict] insist on `port`
 * @returns {Promise<{ port: number, close: () => Promise<void> }>}
 */
async function startForwarder({ socketPath, address, targetPort, port, strict = false }) {
  const sockets = new Set();
  const hold = (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  };
  const listenOn = (wanted) =>
    new Promise((resolve, reject) => {
      const server = net.createServer({ allowHalfOpen: true }, async (client) => {
        hold(client);
        client.on('error', () => client.destroy());
        const opened = await openBridge(socketPath, address, targetPort, FORWARD_ANSWER_MS);
        if (opened.socket === undefined || client.destroyed) {
          opened.socket?.destroy();
          client.destroy();
          return;
        }
        hold(opened.socket);
        splice(client, opened.socket);
      });
      server.once('error', reject);
      server.listen({ host: address, port: wanted }, () => {
        server.off('error', reject);
        server.on('error', () => {});
        resolve(server);
      });
    });
  let server;
  try {
    server = await listenOn(port);
  } catch (error) {
    if (strict || error.code !== 'EADDRINUSE') throw error;
    server = await listenOn(0);
  }
  return {
    port: server.address().port,
    close() {
      return new Promise((resolve) => {
        server.close(() => resolve());
        for (const socket of sockets) socket.destroy();
      });
    },
  };
}

module.exports = { BRIDGE_ANSWER_MS, BRIDGE_HOSTS, bridgeAccepts, bridgeHostOf, openBridge, startForwarder };
