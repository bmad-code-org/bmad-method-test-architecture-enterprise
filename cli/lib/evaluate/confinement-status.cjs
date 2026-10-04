'use strict';

/**
 * The process Bubblewrap starts in a target's place (Story 1.31,
 * `confinement.js`): it runs the target with its own standard streams and
 * environment and ends as the target ended, and when a signal ended the
 * target it first writes that signal to the status file the runtime named;
 * before it starts the target it writes `started` there, so the runtime can tell
 * a target that never started (Bubblewrap could not set up) from one that ran.
 *
 * Bubblewrap forks the command it confines and exits `128 + n` when a signal
 * `n` ended it, so without this file a target a signal stopped would read as
 * one that exited with a code of its own, and a crash or a kill would be
 * judged as the target's behavior where the runtime reads a target that could
 * not run. Seatbelt runs the command in place and needs none of this.
 *
 *   confinement-status.cjs [--bridge <socket path>] [--egress <socket path>] [--avoid <port>] <status file> <target> [argument ...]
 *
 * A signal this process receives is passed to the target. A target that
 * cannot start ends this process with 127 (not found) or 126 (not runnable),
 * as a shell would, its reason on standard error.
 *
 * Story 1.63: a Bubblewrap target runs in a network namespace of its own (a
 * loopback and nothing else), so a server it starts is reachable from the
 * runtime only through the bridge this process serves. With `--bridge`, before
 * it starts the target this process listens on the Unix socket path the runtime
 * named, a file in a directory the call may write and the runtime reaches. A
 * connection's first line is `<host> <port>\n`, a loopback host and a port
 * inside the namespace; this process connects there, answers `ok\n` or
 * `fail\n`, and after `ok` copies bytes both ways. Anything else (another host,
 * a port that is not a number, a line past `BRIDGE_LINE_BYTES` or without its
 * newline, a first line that does not arrive within `BRIDGE_LINE_MS`) is
 * answered `fail\n` and opens no outbound connection. The listening socket
 * never holds this process's event loop open. When the target ends it stops
 * listening and cuts every connection that carries nothing yet; a connection
 * already spliced drains what the target wrote before it ended, for at most
 * `BRIDGE_DRAIN_MS`. A connection the target itself makes to the socket
 * reaches this namespace's own loopback alone.
 *
 * Story 1.83: with `--egress`, the same namespace has one route out, a proxy
 * the runtime owns. Before it starts the target this process listens on a
 * loopback port the system gives it (`127.0.0.1`, inside the namespace) and
 * connects each connection to the Unix socket path the runtime named, a socket
 * of the runtime's own in a private directory of the call, which the runtime
 * serves as an HTTP `CONNECT` proxy limited to the hosts the registry entry
 * authorizes (`confinement-egress.js`). The target starts with `HTTPS_PROXY` and
 * `https_proxy` naming that port and `NODE_USE_ENV_PROXY=1`, so a client that
 * honors the proxy variables tunnels through the runtime and a client that
 * does not has no route, since the namespace holds a loopback and nothing else.
 * This process decides nothing: the runtime's proxy is the one place a request
 * is authorized, and a target that connects to the socket itself reaches the
 * same proxy. A server the runtime started on a port it chose for the call
 * (`--avoid <port>`) binds that port inside this namespace too, so the egress
 * listener takes another port when the system gives it that one.
 *
 * The file is also a module for the runtime's tests: required, it starts
 * nothing. It requires nothing of the repository, since a target's sandbox is
 * granted this one file to read.
 */

const fs = require('node:fs');
const crypto = require('node:crypto');
const net = require('node:net');
const os = require('node:os');
const { spawn } = require('node:child_process');

function signedStatus(secret, status) {
  return { ...status, mac: crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(JSON.stringify(status)).digest('hex') };
}

/** The hosts a bridge connects to: the namespace's own loopback. */
const BRIDGE_HOSTS = Object.freeze(['127.0.0.1', '::1', 'localhost']);
/** The longest first line a bridge reads: `localhost 65535` and a newline fit with room to spare. */
const BRIDGE_LINE_BYTES = 64;
/** How long a connection may take to send its first line. */
const BRIDGE_LINE_MS = 5000;
/** How long a bridge connection may take to reach the port it names. */
const BRIDGE_CONNECT_MS = 5000;
/** How long a spliced connection may keep draining once the target has ended. */
const BRIDGE_DRAIN_MS = 2000;

/**
 * The host and port a bridge line names, or `null` for a line that is no
 * request: a host outside `BRIDGE_HOSTS`, a port that is not a whole number
 * from 1 to 65535 written in decimal, any other spacing or field.
 *
 * @param {string} line the first line, without its newline
 * @returns {{ host: string, port: number } | null}
 */
function parseBridgeLine(line) {
  const match = /^(\S+) ([1-9][0-9]{0,4})$/.exec(line);
  if (match === null || !BRIDGE_HOSTS.includes(match[1])) return null;
  const port = Number(match[2]);
  return port <= 65_535 ? { host: match[1], port } : null;
}

/**
 * Copies bytes both ways between two sockets, each side's end passed to the
 * other (a client that closes its sending side still reads the answer), a
 * side's failure ending the other at once and a side's close ending the other
 * once what it was handed is written.
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

/**
 * Reads the first line of `socket` (at most `maxBytes`, within `timeoutMs`) and
 * hands it to `onLine` with the bytes that arrived after it put back at the
 * head of the stream, which stays paused; `onLine(null)` when the line is
 * longer, never ends or never arrives.
 */
function readFirstLine(socket, { maxBytes, timeoutMs }, onLine) {
  const chunks = [];
  let size = 0;
  let done = false;
  const finish = (line, rest = null) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    socket.off('data', onData);
    socket.off('end', onEnd);
    socket.off('close', onEnd);
    socket.pause();
    if (rest !== null && rest.length > 0) socket.unshift(rest);
    onLine(line);
  };
  const onData = (chunk) => {
    chunks.push(chunk);
    size += chunk.length;
    const buffer = Buffer.concat(chunks, size);
    const newline = buffer.indexOf(10);
    if (newline === -1) {
      if (size > maxBytes) finish(null);
      return;
    }
    if (newline > maxBytes) {
      finish(null);
      return;
    }
    finish(buffer.toString('utf8', 0, newline), buffer.subarray(newline + 1));
  };
  const onEnd = () => finish(null);
  const timer = setTimeout(() => finish(null), timeoutMs);
  timer.unref();
  socket.on('data', onData);
  socket.once('end', onEnd);
  socket.once('close', onEnd);
}

/**
 * One bridge connection: the first line is validated, the connection to the
 * loopback port it names is made, `ok` or `fail` is written, and after `ok`
 * the two sockets are spliced.
 */
function serveConnection(client, { connectMs, lineBytes, lineMs }) {
  client.on('error', () => client.destroy());
  const refuse = () => {
    // The answer is written and the connection ended; a client that keeps its side open is cut a second later, so a
    // refused line holds nothing for long. A client that is already gone makes this a no-op.
    client.end('fail\n');
    const cut = setTimeout(() => client.destroy(), 1000);
    cut.unref();
    client.once('close', () => clearTimeout(cut));
  };
  readFirstLine(client, { maxBytes: lineBytes, timeoutMs: lineMs }, (line) => {
    const request = line === null ? null : parseBridgeLine(line);
    if (request === null) {
      refuse();
      return;
    }
    const upstream = net.connect({ host: request.host, port: request.port, allowHalfOpen: true });
    upstream.setTimeout(connectMs, () => upstream.destroy(new Error('timeout')));
    let connected = false;
    // Until the connection is made its failure is the answer; afterwards `splice` ends the client with it.
    upstream.once('error', () => {
      if (!connected) refuse();
    });
    upstream.once('connect', () => {
      connected = true;
      upstream.setTimeout(0);
      if (client.destroyed) {
        upstream.destroy();
        return;
      }
      client.write('ok\n');
      // From here the connection carries the target's own bytes: it is let drain when the target ends (`serveBridge`).
      client.spliced = true;
      splice(client, upstream);
    });
    client.once('close', () => upstream.destroy());
  });
}

/**
 * Listens on the Unix socket `socketPath` and serves the bridge protocol. The
 * server is unreferenced, so it never keeps its process alive; `close()` stops
 * it, removes the socket, cuts the connections that carry nothing yet and cuts
 * the spliced ones after `drainMs`.
 *
 * @param {string} socketPath
 * @param {{ connectMs?: number, lineBytes?: number, lineMs?: number, drainMs?: number }} [options] ceilings, for a test to shorten
 * @returns {Promise<{ server: net.Server, close: () => void }>} resolves once it listens; rejects with the listen error
 */
function serveBridge(
  socketPath,
  { connectMs = BRIDGE_CONNECT_MS, lineBytes = BRIDGE_LINE_BYTES, lineMs = BRIDGE_LINE_MS, drainMs = BRIDGE_DRAIN_MS } = {},
) {
  const connections = new Set();
  const server = net.createServer({ allowHalfOpen: true }, (client) => {
    connections.add(client);
    client.once('close', () => connections.delete(client));
    serveConnection(client, { connectMs, lineBytes, lineMs });
  });
  server.unref();
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => {
      server.off('error', reject);
      server.on('error', () => {});
      resolve({
        server,
        close() {
          server.close();
          // A spliced connection drains what the target wrote just before it ended, and a deadline cuts one that never
          // ends; a connection that has not been spliced carries nothing and is cut at once.
          for (const connection of connections) if (connection.spliced !== true) connection.destroy();
          const cut = setTimeout(() => {
            for (const connection of connections) connection.destroy();
          }, drainMs);
          cut.unref();
        },
      });
    });
  });
}

/** How many times the egress listener asks for a port when the system keeps giving it one to avoid. */
const EGRESS_BIND_ATTEMPTS = 16;

/**
 * Listens on `127.0.0.1` at a port the system gives and connects each connection to the Unix socket `socketPath`, copying bytes
 * both ways: the namespace's one route to the runtime's egress proxy. The server is unreferenced, as the bridge's is, and
 * `close()` stops it and cuts every connection that is open. A port in `avoid` (the one a started server will bind in this
 * namespace) is given back and another asked for, up to `EGRESS_BIND_ATTEMPTS` times.
 *
 * @param {string} socketPath the runtime's proxy socket
 * @param {number[]} [avoid] ports the listener must not take
 * @returns {Promise<{ server: net.Server, port: number, close: () => void, closed: Promise<void> }>} resolves once it listens; rejects
 *   with the listen error; `closed` settles once `close()` has released the port
 */
async function serveEgress(socketPath, avoid = []) {
  for (let attempt = 1; ; attempt += 1) {
    const served = await listenEgress(socketPath);
    if (!avoid.includes(served.port)) return served;
    served.close();
    await served.closed;
    if (attempt >= EGRESS_BIND_ATTEMPTS) {
      throw new Error(`the system gave only ports the target's server binds (${avoid.join(', ')}) in ${EGRESS_BIND_ATTEMPTS} attempts`);
    }
  }
}

/** One listener of `serveEgress`, on a port the system gives. */
function listenEgress(socketPath) {
  const connections = new Set();
  const server = net.createServer({ allowHalfOpen: true }, (client) => {
    connections.add(client);
    client.once('close', () => connections.delete(client));
    client.on('error', () => client.destroy());
    const upstream = net.connect({ path: socketPath, allowHalfOpen: true });
    connections.add(upstream);
    upstream.once('close', () => connections.delete(upstream));
    splice(client, upstream);
  });
  server.unref();
  const closed = new Promise((resolve) => server.once('close', resolve));
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0 }, () => {
      server.off('error', reject);
      server.on('error', () => {});
      resolve({
        server,
        closed,
        port: server.address().port,
        close() {
          server.close();
          for (const connection of connections) connection.destroy();
        },
      });
    });
  });
}

/** The variables that point a client at the egress proxy on `port`: both spellings of the HTTPS proxy and Node's switch for reading them. */
function egressEnvironment(port) {
  const proxy = `http://127.0.0.1:${port}`;
  return { HTTPS_PROXY: proxy, https_proxy: proxy, NODE_USE_ENV_PROXY: '1' };
}

/**
 * The arguments of a shim call: the optional `--bridge <socket path>`, `--egress <socket path>` and `--avoid <port>`, the
 * status file, the target and its own arguments.
 *
 * @param {string[]} argv the arguments after the script's path
 * @returns {{ bridge: string|null, egress: string|null, avoid: number[], statusFile: string, target: string, args: string[] }}
 */
function parseArguments(argv) {
  const rest = [...argv];
  let bridge = null;
  let egress = null;
  const avoid = [];
  while (rest[0] === '--bridge' || rest[0] === '--egress' || rest[0] === '--avoid') {
    const value = rest[1] ?? null;
    if (rest[0] === '--bridge') bridge = value;
    else if (rest[0] === '--egress') egress = value;
    else if (/^[1-9][0-9]{0,4}$/.test(value ?? '') && Number(value) <= 65_535) avoid.push(Number(value));
    rest.splice(0, 2);
  }
  const [statusFile, target, ...args] = rest;
  return { bridge, egress, avoid, statusFile, target, args };
}

function main() {
  const { bridge, egress, avoid, statusFile, target, args } = parseArguments(process.argv.slice(2));
  const FORWARDED = ['SIGTERM', 'SIGINT', 'SIGHUP', 'SIGQUIT', 'SIGUSR1', 'SIGUSR2'];
  let secret = null;
  try {
    const initial = fs.readFileSync(statusFile, 'utf8');
    if (initial !== '') {
      const seed = JSON.parse(initial);
      if (!/^[0-9a-f]{64}$/.test(seed.secret) || initial !== `${JSON.stringify({ secret: seed.secret })}\n`)
        throw new Error('invalid status seed');
      secret = seed.secret;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      process.stderr.write(`status seed: ${error.message}\n`);
      process.exitCode = 126;
      return;
    }
  }
  const writeStatus = (status) => {
    const record = secret === null ? { ...status } : signedStatus(secret, status);
    if (secret === null) delete record.complete;
    fs.writeFileSync(statusFile, `${JSON.stringify(record)}\n`);
  };

  // The mark that this process ran: Bubblewrap that fails before starting it leaves the file empty, which the runtime
  // reads as a target that never started and not as one that exited with Bubblewrap's own code.
  try {
    writeStatus({ started: true });
  } catch {
    if (secret !== null) {
      process.exitCode = 126;
      return;
    }
  }
  let closeBridge = null;
  const run = (environment = {}) => {
    const child = spawn(target, args, { stdio: 'inherit', env: { ...process.env, ...environment } });
    for (const name of FORWARDED) process.on(name, () => child.kill(name));
    child.once('error', (error) => {
      closeBridge?.();
      try {
        writeStatus({ started: true, complete: true });
      } catch {
        // The host rejects an incomplete signed status.
      }
      process.stderr.write(`${target}: ${error.message}\n`);
      process.exitCode = error.code === 'ENOENT' ? 127 : 126;
    });
    // Nothing else holds the event loop, so this process ends once the target has, with the exit code set here.
    child.once('exit', (code, signal) => {
      closeBridge?.();
      if (signal === null) {
        try {
          writeStatus({ started: true, complete: true });
        } catch {
          // The host rejects an incomplete signed status.
        }
        process.exitCode = code ?? 1;
        return;
      }
      try {
        writeStatus({ started: true, complete: true, signal });
      } catch {
        // The runtime then reads Bubblewrap's own exit, 128 plus the signal's number.
      }
      for (const name of FORWARDED) process.removeAllListeners(name);
      // A signal this process ignores or handles by default (SIGPIPE, SIGUSR1 starts Node's inspector) leaves it running,
      // so it then ends as a shell reports a signalled child: 128 plus the signal's number.
      process.exitCode = 128 + (os.constants.signals[signal] ?? 0);
      process.kill(process.pid, signal);
    });
  };
  if (bridge === null && egress === null) {
    run();
    return;
  }
  // The target starts once each listener is up, so a server that binds at once is never ahead of its bridge and a client that
  // reads the proxy variables at once finds the proxy. A listener that cannot start ends this process before the target runs,
  // its reason on standard error: the runtime reads a started call that exited, with the reason among what the call printed.
  const closers = [];
  closeBridge = () => {
    for (const close of closers) close();
  };
  const failed = (what, name, error) => {
    closeBridge();
    try {
      writeStatus({ started: true, complete: true });
    } catch {
      // The host rejects an incomplete signed status.
    }
    process.stderr.write(`${what} ${name}: ${error.message}\n`);
    process.exitCode = 126;
  };
  const bridged =
    bridge === null
      ? Promise.resolve(null)
      : serveBridge(bridge).then(
          (served) => (closers.push(served.close), served),
          (error) => ({ error }),
        );
  const routed =
    egress === null
      ? Promise.resolve(null)
      : serveEgress(egress, avoid).then(
          (served) => (closers.push(served.close), served),
          (error) => ({ error }),
        );
  Promise.all([bridged, routed]).then(([bridgeResult, egressResult]) => {
    if (bridgeResult?.error) failed('bridge', bridge, bridgeResult.error);
    else if (egressResult?.error) failed('egress', egress, egressResult.error);
    else run(egressResult ? egressEnvironment(egressResult.port) : {});
  });
}

if (require.main === module) main();

module.exports = {
  BRIDGE_HOSTS,
  BRIDGE_CONNECT_MS,
  BRIDGE_DRAIN_MS,
  BRIDGE_LINE_BYTES,
  BRIDGE_LINE_MS,
  parseArguments,
  parseBridgeLine,
  egressEnvironment,
  serveBridge,
  serveEgress,
  signedStatus,
  splice,
};
