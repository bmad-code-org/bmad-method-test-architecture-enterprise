#!/usr/bin/env node
'use strict';

/**
 * voucher-redemption-service: the HTTP surface over vouchers.js's redemption
 * rules.
 *
 * Two routes today:
 *
 *   GET  /health    200 { "ok": true }
 *   POST /redeem    200 { "accepted": true, "discount" } or { "accepted": false, "reason" }
 *                   400 { "error": "invalid-json" } when the body doesn't parse
 *                   400 { "error": "invalid-body" } when the body isn't an object with a numeric cartTotal and a string redeemedOn
 *                   404 { "error": "unknown-voucher-code" } when `code` isn't in the catalog
 *
 * Every other path and method answers 404 with { "error": "not-found" }. The
 * body is JSON on every request and response.
 *
 * The server binds the loopback interface only, on PORT (default 4320).
 */

const http = require('node:http');

const { redeem } = require('./vouchers');

const PORT = Number(process.env.PORT ?? 4320);
const HOST = '127.0.0.1';

// A small fixed catalog. One voucher per rule in docs/stories/6-6-voucher-redemption.md:
// a percentage voucher with a cap, a fixed-amount voucher, and an expired voucher.
const VOUCHERS = new Map([
  ['SAVE10', { code: 'SAVE10', type: 'percentage', percentOff: 10, maxDiscount: 20, minimumSpend: 50, expiresOn: '2099-01-01' }],
  ['FLAT5', { code: 'FLAT5', type: 'fixed', amountOff: 5, minimumSpend: 20, expiresOn: '2099-01-01' }],
  ['EXPIRED10', { code: 'EXPIRED10', type: 'percentage', percentOff: 10, maxDiscount: 20, minimumSpend: 10, expiresOn: '2000-01-01' }],
]);

function send(response, status, body) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

async function handle(request, response) {
  const url = new URL(request.url, `http://${HOST}:${PORT}`);
  const path = url.pathname;

  if (request.method === 'GET' && path === '/health') {
    send(response, 200, { ok: true });
    return;
  }

  if (request.method === 'POST' && path === '/redeem') {
    const raw = await readBody(request);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      send(response, 400, { error: 'invalid-json' });
      return;
    }
    if (body === null || typeof body !== 'object' || typeof body.cartTotal !== 'number' || typeof body.redeemedOn !== 'string') {
      send(response, 400, { error: 'invalid-body' });
      return;
    }
    const voucher = VOUCHERS.get(body.code);
    if (!voucher) {
      send(response, 404, { error: 'unknown-voucher-code' });
      return;
    }
    send(response, 200, redeem(voucher, body.cartTotal, body.redeemedOn));
    return;
  }

  // Drain the body so a client that sent one is not left waiting on the pipe.
  // The 'error' listener matches readBody()'s: with none attached, Node's
  // default behavior for an unlistened 'error' event on a request that aborts
  // mid-stream is to throw, which crashes the whole process.
  request.resume();
  request.on('error', () => {});
  request.on('end', () => send(response, 404, { error: 'not-found' }));
}

const server = http.createServer((request, response) => {
  handle(request, response).catch((error) => {
    send(response, 500, { error: 'internal-error', message: error.message });
  });
});
server.listen(PORT, HOST, () => {
  process.stdout.write(`voucher-redemption-service listening on http://${HOST}:${PORT}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    // closeAllConnections runs before close(): close() alone waits for every
    // open connection to end on its own, and a client holding one open (an
    // API-testing client's connection pool, reusing a socket between a
    // suite's requests) can outlive Playwright's own webServer teardown
    // patience otherwise.
    server.closeAllConnections();
    server.close(() => process.exit(0));
  });
}
