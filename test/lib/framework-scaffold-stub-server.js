'use strict';

/**
 * The in-memory reservation backend Story 6.9's smoke test runs the installed
 * `bmad-testarch-framework` scaffold's `tests/e2e/api-sample.spec.ts` against.
 *
 * Three routes, matching what that spec calls through the scaffold's own
 * `apiRequest` fixture:
 *
 *   POST   /api/reservations       -> 201 { id, item }
 *   GET    /api/reservations/{id}  -> 200 { id, item } | 404
 *   DELETE /api/reservations/{id}  -> 200 { ok: true } | 404
 *   GET    /health                 -> 200 { ok: true }, no auth required
 *
 * Every route except /health requires `Authorization: Bearer <token>`, where
 * `<token>` is `DEFAULT_TOKEN` unless the caller overrides it; a missing or
 * wrong bearer is refused with 401 before the method/path is even looked at.
 * The token is fixed and known rather than issued by a real auth endpoint,
 * because there is no real auth endpoint here: `manageAuthToken` is patched
 * in the disposable workspace's own copy of `auth-fixture.ts` to hand back
 * exactly this token (see test/eval-framework-scaffold.js).
 *
 * `createStatus` is the one deliberate-break knob this module exposes: set
 * it away from 201 to seed the "backend returns the wrong status" defect the
 * story's own I/O matrix names, so the proof does not require hand-editing
 * this file's source between runs. Every other path and method answers 404.
 *
 * Loopback-bound only (127.0.0.1), and always run as its own OS process (via
 * `node test/lib/framework-scaffold-stub-server.js`, `PORT=<n>` in the
 * environment), never as an in-process http.Server living in the same event
 * loop as a `spawnSync` call: the harness that starts this also runs the
 * sandboxed `npm install` and smoke test synchronously, and an in-process
 * server sharing that event loop would stop answering requests for exactly
 * as long as the synchronous spawn blocks it. A separate process has no such
 * dependency on the caller's own event loop.
 *
 * Usage: PORT=<port> [STUB_TOKEN=<token>] [STUB_CREATE_STATUS=<code>] node test/lib/framework-scaffold-stub-server.js
 */

const http = require('node:http');
const crypto = require('node:crypto');

const HOST = '127.0.0.1';
const DEFAULT_TOKEN = 'eval-harness-token';
const DEFAULT_CREATE_STATUS = 201;

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

/**
 * @param {{token?: string, createStatus?: number}} [options]
 * @returns {import('node:http').Server}
 */
function createStubServer({ token = DEFAULT_TOKEN, createStatus = DEFAULT_CREATE_STATUS } = {}) {
  const reservations = new Map();

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${HOST}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      send(res, 200, { ok: true });
      return;
    }

    if (req.headers.authorization !== `Bearer ${token}`) {
      req.resume();
      req.on('end', () => send(res, 401, { error: 'unauthorized' }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/reservations') {
      let body;
      try {
        body = await readJsonBody(req);
      } catch {
        send(res, 400, { error: 'invalid-json' });
        return;
      }
      const id = crypto.randomUUID();
      const record = { id, item: body.item };
      reservations.set(id, record);
      send(res, createStatus, record);
      return;
    }

    const match = /^\/api\/reservations\/([^/]+)$/.exec(url.pathname);
    if (match) {
      let id;
      try {
        id = decodeURIComponent(match[1]);
      } catch {
        send(res, 400, { error: 'invalid-reservation-id' });
        return;
      }
      if (req.method === 'GET') {
        const record = reservations.get(id);
        if (!record) {
          send(res, 404, { error: 'reservation-not-found' });
          return;
        }
        send(res, 200, record);
        return;
      }
      if (req.method === 'DELETE') {
        if (!reservations.delete(id)) {
          send(res, 404, { error: 'reservation-not-found' });
          return;
        }
        send(res, 200, { ok: true });
        return;
      }
    }

    req.resume();
    req.on('end', () => send(res, 404, { error: 'not-found' }));
  });
}

/**
 * Start the stub, bound to loopback on the given port (0 for an OS-assigned one).
 *
 * @param {{port?: number, token?: string, createStatus?: number}} [options]
 * @returns {Promise<{server: import('node:http').Server, port: number, host: string, token: string, url: string}>}
 */
function startStubServer({ port = 0, token = DEFAULT_TOKEN, createStatus = DEFAULT_CREATE_STATUS } = {}) {
  const server = createStubServer({ token, createStatus });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, () => {
      const bound = server.address().port;
      resolve({ server, port: bound, host: HOST, token, url: `http://${HOST}:${bound}` });
    });
  });
}

module.exports = { createStubServer, startStubServer, DEFAULT_TOKEN, DEFAULT_CREATE_STATUS, HOST };

if (require.main === module) {
  const port = Number(process.env.PORT ?? 0);
  const token = process.env.STUB_TOKEN ?? DEFAULT_TOKEN;
  const createStatus = Number(process.env.STUB_CREATE_STATUS ?? DEFAULT_CREATE_STATUS);

  startStubServer({ port, token, createStatus })
    .then(({ server, port: boundPort }) => {
      process.stdout.write(`framework-scaffold-stub-server listening on http://${HOST}:${boundPort}\n`);
      for (const signal of ['SIGINT', 'SIGTERM']) {
        process.on(signal, () => {
          // closeAllConnections rather than a bare close(): a client holding a
          // keep-alive socket open (Playwright's own api-request client pool)
          // would otherwise leave this process alive past the harness's own
          // teardown patience, the same reasoning the reservations fixture
          // server documents for the same call.
          server.closeAllConnections();
          server.close(() => process.exit(0));
        });
      }
    })
    .catch((error) => {
      console.error(`framework-scaffold-stub-server failed to start: ${error.message}`);
      process.exit(1);
    });
}
