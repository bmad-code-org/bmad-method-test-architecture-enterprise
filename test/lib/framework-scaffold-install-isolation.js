'use strict';

/**
 * The one new host-check surface Story 6.9's real `npm install` needs.
 *
 * `cli/lib/atdd-isolation.js`'s sandboxed backends (seatbelt, bubblewrap) deny
 * every outbound network reach except loopback -- unmodified, exactly as they
 * do for tea-atdd-red-check. That is what blocks npm's own attempt to reach
 * the real internet directly. It is also what makes a real `npm install`
 * impossible from inside the sandbox on its own: the registry is not
 * loopback.
 *
 * This module is the bridge: a loopback-bound, CONNECT-only HTTP(S) forward
 * proxy that runs UNSANDBOXED, on the host, with real egress of its own. The
 * sandboxed `npm install` is pointed at it through `HTTPS_PROXY`, so from the
 * sandboxed child's point of view every registry request is a plain loopback
 * connection (already allowed), and this proxy is the one place that decides
 * whether the loopback-forwarded request is allowed to leave the host at
 * all. It allows exactly one CONNECT target -- `registry.npmjs.org:443` --
 * and refuses every other host and every non-CONNECT request outright.
 *
 * Deliberately dumb: no TLS termination, no request inspection past the
 * CONNECT line. Once a CONNECT to the allowed target is accepted, the proxy
 * only pipes bytes between the client socket and the upstream socket; it
 * never decrypts the TLS session npm negotiates with the real registry, so
 * it cannot see or alter anything past the hostname:port it already checked.
 *
 * Always run as its own OS process (`node
 * test/lib/framework-scaffold-install-isolation.js`, `PORT=<n>` in the
 * environment), for the same reason
 * test/lib/framework-scaffold-stub-server.js gives: the harness that starts
 * this also runs the sandboxed `npm install` synchronously in the same
 * process, and an in-process proxy sharing that event loop would stop
 * servicing CONNECT requests for exactly as long as the synchronous spawn
 * blocks it.
 *
 * Usage: PORT=<port> node test/lib/framework-scaffold-install-isolation.js
 */

const http = require('node:http');
const net = require('node:net');

const HOST = '127.0.0.1';
const ALLOWED_HOST = 'registry.npmjs.org';
const ALLOWED_PORT = 443;

/**
 * @param {{allowedHost?: string, allowedPort?: number}} [options]
 * @returns {import('node:http').Server}
 */
function createAllowlistingProxy({ allowedHost = ALLOWED_HOST, allowedPort = ALLOWED_PORT } = {}) {
  const server = http.createServer((req, res) => {
    // npm's registry traffic is HTTPS, which always arrives as a CONNECT
    // tunnel request (handled below, not here). A plain HTTP method reaching
    // this handler at all is not legitimate npm-install traffic through this
    // proxy, so it is refused rather than forwarded.
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('this proxy forwards CONNECT tunnels to the allowlisted host only\n');
  });

  server.on('connect', (req, clientSocket, head) => {
    // Attached before either branch below, and before `upstream` exists: a
    // socket error arriving right after the deny branch's clientSocket.end()
    // (the client resetting the connection, for instance) is otherwise
    // unhandled, and Node's default behavior for an unhandled 'error' on a
    // stream is to throw, which would crash this whole proxy process rather
    // than just refuse the one CONNECT. `upstream` is only ever destroyed
    // once it exists, which the allow branch below assigns.
    let upstream;
    clientSocket.on('error', () => {
      clientSocket.destroy();
      if (upstream) upstream.destroy();
    });

    const separator = req.url.lastIndexOf(':');
    const requestedHost = separator === -1 ? req.url : req.url.slice(0, separator);
    const requestedPort = separator === -1 ? 443 : Number(req.url.slice(separator + 1));

    if (requestedHost !== allowedHost || requestedPort !== allowedPort) {
      clientSocket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }

    upstream = net.connect(requestedPort, requestedHost, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on('error', () => clientSocket.destroy());
  });

  return server;
}

/**
 * Start the proxy, bound to loopback on the given port (0 for an OS-assigned one).
 *
 * @param {{port?: number, allowedHost?: string, allowedPort?: number}} [options]
 * @returns {Promise<{server: import('node:http').Server, port: number, host: string, url: string}>}
 */
function startAllowlistingProxy({ port = 0, allowedHost = ALLOWED_HOST, allowedPort = ALLOWED_PORT } = {}) {
  const server = createAllowlistingProxy({ allowedHost, allowedPort });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, () => {
      const bound = server.address().port;
      resolve({ server, port: bound, host: HOST, url: `http://${HOST}:${bound}` });
    });
  });
}

module.exports = { createAllowlistingProxy, startAllowlistingProxy, ALLOWED_HOST, ALLOWED_PORT, HOST };

if (require.main === module) {
  const port = Number(process.env.PORT ?? 0);
  // Overrides used only by test/test-framework-scaffold-install-isolation.js's
  // own positive-control check, to substitute a loopback target for the real
  // registry so that proof needs no external network. Unset in every real
  // invocation (the live harness's startProxyProcess() never sets these), so
  // production behavior always allows exactly registry.npmjs.org:443.
  const allowedHost = process.env.ALLOWED_HOST || ALLOWED_HOST;
  const allowedPort = process.env.ALLOWED_PORT ? Number(process.env.ALLOWED_PORT) : ALLOWED_PORT;

  startAllowlistingProxy({ port, allowedHost, allowedPort })
    .then(({ server, port: boundPort }) => {
      process.stdout.write(
        `framework-scaffold-install-isolation proxy listening on http://${HOST}:${boundPort}, allowing CONNECT to ${allowedHost}:${allowedPort} only\n`,
      );
      for (const signal of ['SIGINT', 'SIGTERM']) {
        process.on(signal, () => {
          server.closeAllConnections();
          server.close(() => process.exit(0));
        });
      }
    })
    .catch((error) => {
      console.error(`framework-scaffold-install-isolation proxy failed to start: ${error.message}`);
      process.exit(1);
    });
}
