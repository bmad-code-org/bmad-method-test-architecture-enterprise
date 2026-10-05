/**
 * eval-quality's environment-probe conformance suite over the HTTP port
 * beside this file (`http-probe-port.mjs`), run against a loopback stub
 * server this file starts and closes itself, so it needs no deployed target
 * and no secret.
 *
 * Run it with `node adapter/http-probe-port.conformance.mjs` from your
 * evaluation folder. It prints eval-quality's report, one line per assertion,
 * and exits 0 when every assertion passes and 1 otherwise.
 *
 * Each scenario builds a fresh port over a stub of its own: `resolves` serves
 * the routes the suite's requests name, `fails` drops every connection,
 * `hangs` never answers, and `in-band-error` answers a status no observation
 * can carry. The requests for the four denied address classes name hosts the
 * stub's resolver maps to one sample address of each class; the policy names
 * none of them, so eval-quality denies each before a packet leaves.
 */

import http from 'node:http';

import { formatConformanceReport, runEnvironmentProbePortConformance } from 'eval-quality/conformance';

import createHttpProbePort, { nodeTransport } from './http-probe-port.mjs';

/** The stub's interface, and the ceilings its authorization sets for the cap scenarios. */
const STUB = 'stub';
const MAX_REDIRECTS = 2;
const MAX_ELAPSED_MS = 1000;
const MAX_RESPONSE_BYTES = 4096;

/** One host per denied address class, resolved by the stub's resolver to one sample address of that class. */
const DENIED_HOSTS = {
  loopback: { interfaceId: 'unlisted-loopback', host: 'loopback.conformance.test', address: '127.0.0.2' },
  private: { interfaceId: 'private-range', host: 'private.conformance.test', address: '10.0.0.1' },
  linkLocal: { interfaceId: 'link-local', host: 'link-local.conformance.test', address: '169.254.0.1' },
  metadata: { interfaceId: 'cloud-metadata', host: 'metadata.conformance.test', address: '169.254.169.254' },
};
const LOOPBACK = '127.0.0.1';

/** Every server this file started and has not closed, closed again on the way out. */
const open = new Set();

/** A stub for one scenario on a free loopback port. */
async function startStub(scenario) {
  const server = http.createServer((request, response) => {
    if (scenario === 'fails') {
      request.socket.destroy();
      return;
    }
    if (scenario === 'hangs') return;
    if (scenario === 'in-band-error') {
      response.writeHead(600).end();
      return;
    }
    const { pathname } = new URL(request.url, 'http://stub');
    const port = server.address().port;
    switch (pathname.startsWith('/redirect-chain/') ? '/redirect-chain/' : pathname) {
      case '/ok': {
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true }));
        break;
      }
      case '/raw': {
        const chunks = [];
        request.on('data', (chunk) => chunks.push(chunk));
        request.on('end', () => {
          response.writeHead(200, { 'content-type': 'application/json' }).end(
            JSON.stringify({
              base64: Buffer.concat(chunks).toString('base64'),
              contentType: request.headers['content-type'] ?? null,
              contentLength: request.headers['content-length'] ?? null,
              transferEncoding: request.headers['transfer-encoding'] ?? null,
            }),
          );
        });
        break;
      }
      case '/fault': {
        response.writeHead(500, { 'content-type': 'text/plain' }).end('fault');
        break;
      }
      case '/redirect-denied': {
        response.writeHead(302, { location: `http://${DENIED_HOSTS.metadata.host}:${port}/ok` }).end();
        break;
      }
      case '/redirect-chain/': {
        const next = Number(pathname.slice('/redirect-chain/'.length)) + 1;
        response.writeHead(302, { location: `/redirect-chain/${next}` }).end();
        break;
      }
      case '/oversize': {
        response.writeHead(200, { 'content-type': 'text/plain' }).end('x'.repeat(MAX_RESPONSE_BYTES * 2));
        break;
      }
      case '/slow': {
        setTimeout(() => {
          if (!response.destroyed) response.writeHead(200).end();
        }, MAX_ELAPSED_MS * 2).unref();
        break;
      }
      default: {
        response.writeHead(404).end();
      }
    }
  });
  await new Promise((resolve) => server.listen(0, LOOPBACK, resolve));
  open.add(server);
  const close = async () => {
    if (!open.delete(server)) return;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  };
  return { port: server.address().port, close };
}

/** The authorization the stub's interface gets, and the one each other interface gets, at `port`. */
function policyFor(port) {
  const authorization = (interfaceId, host) => ({
    interfaceId,
    scheme: 'http',
    host,
    port,
    addresses: [LOOPBACK],
    methods: ['GET', 'POST'],
    safeMethods: ['GET'],
    maxRedirects: MAX_REDIRECTS,
    maxElapsedMs: MAX_ELAPSED_MS,
    maxRequestBytes: 4096,
    maxResponseBytes: MAX_RESPONSE_BYTES,
  });
  return {
    authorizations: [
      authorization(STUB, LOOPBACK),
      authorization('plain-http', LOOPBACK),
      ...Object.values(DENIED_HOSTS).map(({ interfaceId, host }) => authorization(interfaceId, host)),
    ],
  };
}

/** Where each interface is: the stub, the same stub over https (which the policy authorizes over http only), and each denied host. */
function targetsFor(port) {
  return {
    [STUB]: { scheme: 'http', host: LOOPBACK, port },
    'plain-http': { scheme: 'https', host: LOOPBACK, port },
    ...Object.fromEntries(Object.values(DENIED_HOSTS).map(({ interfaceId, host }) => [interfaceId, { scheme: 'http', host, port }])),
  };
}

/** The stub's resolver: each denied host to its sample address, anything else as the host's own resolver says. */
function resolveHost(host, signal) {
  const denied = Object.values(DENIED_HOSTS).find((entry) => entry.host === host);
  return denied === undefined ? nodeTransport.resolve(host, signal) : denied.address;
}

const request = (interfaceId, method, pathTemplate) => ({
  probeId: `conformance-${interfaceId}`,
  interfaceId,
  operationId: 'conformance-call',
  kind: 'api',
  method,
  pathTemplate,
  channels: { path: {}, query: {}, header: {}, body: { kind: 'absent' } },
});

/** An external watchdog keeps a broken adapter check finite even when a transport hook never settles. */
async function boundedFault(call) {
  let watchdog;
  try {
    return await Promise.race([
      call().then(
        () => 'unexpected observation',
        (error) => error.code,
      ),
      new Promise((resolve) => {
        watchdog = setTimeout(() => resolve('watchdog expired'), 1000);
      }),
    ]);
  } finally {
    clearTimeout(watchdog);
  }
}

/** An adapter-local check alongside eval-quality's portable conformance assertions. */
async function checkAdapter(name, port, expected, signal) {
  const actual = await boundedFault(() => port.probe(request(STUB, 'GET', '/ok'), signal));
  if (actual === expected) {
    console.log(`pass adapter/${name}`);
  } else {
    console.error(`fail adapter/${name}: expected ${expected}, got ${actual}`);
    process.exitCode = 1;
  }
}

/** A bounded wire check over the copied port, including bytes outside UTF-8 text. */
async function checkRawAdapter() {
  const stub = await startStub('resolves');
  const bytes = Buffer.from([0, 128, 255]);
  const contentType = 'application/octet-stream';
  const port = createHttpProbePort({
    policy: policyFor(stub.port),
    targets: targetsFor(stub.port),
  });
  const rawRequest = request(STUB, 'POST', '/raw');
  rawRequest.channels.body = { kind: 'raw', base64: bytes.toString('base64'), contentType };
  let watchdog;
  try {
    const observed = await Promise.race([
      port.probe(rawRequest),
      new Promise((_, reject) => {
        watchdog = setTimeout(() => reject(new Error('raw request timed out')), 2000);
      }),
    ]);
    const received = observed.body?.value;
    if (
      observed.status === 200 &&
      received?.base64 === bytes.toString('base64') &&
      received?.contentType === contentType &&
      received?.contentLength === String(bytes.byteLength) &&
      received?.transferEncoding === null
    ) {
      console.log('pass adapter/raw-bytes');
    } else {
      console.error(`fail adapter/raw-bytes: ${JSON.stringify(received)}`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`fail adapter/raw-bytes: ${error.message}`);
    process.exitCode = 1;
  } finally {
    clearTimeout(watchdog);
    await stub.close();
  }
}

/** The same authorized target with a short cap for transport phase checks. */
function cappedPort(transport) {
  return createHttpProbePort({
    policy: { authorizations: [{ ...policyFor(80).authorizations[0], maxElapsedMs: 80 }] },
    targets: { [STUB]: { scheme: 'http', host: LOOPBACK, port: 80 } },
    transport,
  });
}

const subject = {
  name: 'http-probe-port',
  sampleRequest: request(STUB, 'GET', '/ok'),
  // The suite reads only the stub's maxRedirects off this policy; each scenario builds its own at its stub's port.
  policy: policyFor(1),
  authorizedRequest: request(STUB, 'GET', '/ok'),
  unmappedRequest: request('not-mapped', 'GET', '/ok'),
  deniedAddressRequests: {
    loopback: request(DENIED_HOSTS.loopback.interfaceId, 'GET', '/ok'),
    private: request(DENIED_HOSTS.private.interfaceId, 'GET', '/ok'),
    linkLocal: request(DENIED_HOSTS.linkLocal.interfaceId, 'GET', '/ok'),
    metadata: request(DENIED_HOSTS.metadata.interfaceId, 'GET', '/ok'),
  },
  unauthorizedMethodRequest: request(STUB, 'DELETE', '/ok'),
  unauthorizedSchemeRequest: request('plain-http', 'GET', '/ok'),
  redirectingRequest: request(STUB, 'GET', '/redirect-denied'),
  overRedirectRequest: request(STUB, 'GET', '/redirect-chain/0'),
  oversizeResponseRequest: request(STUB, 'GET', '/oversize'),
  slowRequest: request(STUB, 'GET', '/slow'),
  faultingRequest: request(STUB, 'GET', '/fault'),
  async build(scenario) {
    const stub = await startStub(scenario);
    let calls = 0;
    const port = createHttpProbePort({
      policy: policyFor(stub.port),
      targets: targetsFor(stub.port),
      transport: {
        resolve: resolveHost,
        // The suite counts HTTP requests sent, never port invocations.
        send: (exchange, signal) => {
          calls += 1;
          return nodeTransport.send(exchange, signal);
        },
      },
    });
    return { port: (probeRequest, signal) => port.probe(probeRequest, signal), underlyingCalls: () => calls, dispose: stub.close };
  },
};

try {
  const report = await runEnvironmentProbePortConformance(subject);
  console.log(formatConformanceReport(report));
  process.exitCode = report.passed ? 0 : 1;
  await checkRawAdapter();

  // Custom transport hooks can ignore AbortSignal. Each phase must still settle at the declared cap.
  await checkAdapter('resolve-cap', cappedPort({ resolve: () => new Promise(() => {}) }), 'budget-exhausted');
  await checkAdapter('prepare-cap', cappedPort({ resolve: resolveHost, prepare: () => new Promise(() => {}) }), 'budget-exhausted');
  await checkAdapter('send-cap', cappedPort({ resolve: resolveHost, send: () => new Promise(() => {}) }), 'budget-exhausted');
  let redirectsResolved = 0;
  const redirect = cappedPort({
    resolve: () => (++redirectsResolved === 1 ? LOOPBACK : new Promise(() => {})),
    send: async () => ({ status: 302, headers: { location: ['/ok'] }, body: Buffer.alloc(0) }),
  });
  await checkAdapter('redirect-cap', redirect, 'budget-exhausted');
  const caller = new AbortController();
  const aborting = cappedPort({ resolve: resolveHost, prepare: () => new Promise(() => {}) });
  setTimeout(() => caller.abort(), 10);
  await checkAdapter('prepare-abort', aborting, 'aborted', caller.signal);

  // ProbeTargetPolicy has no upper bound on maxElapsedMs. A large cap must not overflow Node's one-timer limit.
  const largeCap = createHttpProbePort({
    policy: { authorizations: [{ ...policyFor(80).authorizations[0], maxElapsedMs: Number.MAX_SAFE_INTEGER }] },
    targets: { [STUB]: { scheme: 'http', host: LOOPBACK, port: 80 } },
    transport: {
      resolve: resolveHost,
      send: async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return { status: 200, headers: {}, body: Buffer.alloc(0) };
      },
    },
  });
  let watchdog;
  const largeCapResult = await Promise.race([
    largeCap.probe(request(STUB, 'GET', '/ok')).then(
      (observation) => observation.status,
      (error) => error.code,
    ),
    new Promise((resolve) => {
      watchdog = setTimeout(() => resolve('watchdog expired'), 1000);
    }),
  ]);
  clearTimeout(watchdog);
  if (largeCapResult === 200) console.log('pass adapter/large-elapsed-cap');
  else {
    console.error(`fail adapter/large-elapsed-cap: expected status 200, got ${largeCapResult}`);
    process.exitCode = 1;
  }
} finally {
  for (const server of open) {
    server.closeAllConnections();
    server.close();
  }
}
