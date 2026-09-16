#!/usr/bin/env node
'use strict';

/**
 * quay-locker-service: the HTTP surface over the locker inventory.
 *
 * Two routes today:
 *
 *   GET /health          200 { "ok": true }
 *   GET /lockers         200 [ { id, location, size }, ... ]
 *   GET /lockers/{id}    200 { id, location, size }, or 404 when the id is unknown
 *
 * Every other path and method answers 404 with { "error": "not-found" }. The
 * body is JSON on every response.
 *
 * The server binds the loopback interface only, on PORT (default 4310).
 */

const http = require('node:http');

const { findLocker, listLockers } = require('./lockers');

const PORT = Number(process.env.PORT ?? 4310);
const HOST = '127.0.0.1';

function send(response, status, body) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

function handle(request, response) {
  const url = new URL(request.url, `http://${HOST}:${PORT}`);
  const path = url.pathname;

  if (request.method === 'GET' && path === '/health') {
    send(response, 200, { ok: true });
    return;
  }
  if (request.method === 'GET' && path === '/lockers') {
    send(response, 200, listLockers());
    return;
  }
  const locker = /^\/lockers\/([^/]+)$/.exec(path);
  if (request.method === 'GET' && locker) {
    const found = findLocker(decodeURIComponent(locker[1]));
    if (found) send(response, 200, found);
    else send(response, 404, { error: 'locker-not-found' });
    return;
  }
  // Drain the body so a client that sent one is not left waiting on the pipe.
  request.resume();
  request.on('end', () => send(response, 404, { error: 'not-found' }));
}

const server = http.createServer(handle);
server.listen(PORT, HOST, () => {
  process.stdout.write(`quay-locker-service listening on http://${HOST}:${PORT}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    // closeAllConnections is what makes this exit immediately rather than
    // waiting out a keep-alive socket. `server.close()` alone waits for every
    // open connection to end on its own, and a client holding one open (an
    // API-testing client's connection pool, reusing a socket between the
    // suite's requests) left this process alive well past Playwright's own
    // webServer teardown patience under one isolation backend, measured live.
    server.closeAllConnections();
    server.close(() => process.exit(0));
  });
}
