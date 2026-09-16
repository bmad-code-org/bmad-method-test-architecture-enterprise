'use strict';

/**
 * The in-process half of tea-atdd-red-check's isolation, loaded into every node
 * process of a check through NODE_OPTIONS=--require.
 *
 * The OS half (a seatbelt profile on darwin, a network namespace on linux, see
 * cli/lib/atdd-isolation.js) is what confines a process that ignores this file.
 * This half exists for two reasons that the OS half cannot cover on its own:
 *
 * - A name lookup is not a connection. On darwin the resolver reaches
 *   mDNSResponder over a unix socket the profile has to allow, so a generated
 *   test can still resolve an external name before its connect is refused.
 *   NFR9 says no network beyond what the step declares, and the step declares
 *   loopback; a resolver round trip to the outside is network.
 * - A generated test runs inside a Playwright worker, and a worker has no reason
 *   to start a process. Playwright's own runner does (it forks the workers), so
 *   the refusal is scoped to processes that carry TEST_WORKER_INDEX, which is the
 *   documented marker of a worker.
 *
 * Everything here refuses rather than fails silently: the refusal is an error
 * whose message names the isolation, so a test that hit it fails with a reason a
 * reader can attribute, and the harness classifies that failure as a defect in
 * the generated test rather than as an assertion.
 *
 * Plain CommonJS with no dependency, because it is loaded before anything else
 * in the process, by the raw node binary, in a workspace that has no
 * node_modules of its own.
 */

const childProcess = require('node:child_process');
const dgram = require('node:dgram');
const dns = require('node:dns');
const net = require('node:net');

const LOOPBACK_NAMES = new Set(['localhost', 'localhost.', 'ip6-localhost', 'ip6-loopback']);

/** True for a host that names the loopback interface, and for no host at all, which node resolves to it. */
function isLoopback(host) {
  if (host === undefined || host === null || host === '') return true;
  const name = String(host).toLowerCase();
  if (LOOPBACK_NAMES.has(name)) return true;
  if (name === '::1' || name === '::' || name === '0.0.0.0') return true;
  if (name.startsWith('::ffff:127.')) return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(name);
}

function refusal(what) {
  const error = new Error(`tea-atdd-red-check isolation refused ${what}: this run may reach the loopback interface and nothing else`);
  error.code = 'EISOLATED';
  return error;
}

/**
 * The host a `Socket#connect` call names.
 *
 * `net.connect` and `http.request` normalise their arguments into an array
 * `[options, callback]` and hand that array to `Socket#connect` as its first
 * argument, so the options are one level down from a direct call's. Both shapes
 * are read; a call naming a unix socket path is loopback by construction.
 */
function connectTarget(args) {
  let first = args[0];
  if (Array.isArray(first)) first = first[0];
  if (first !== null && typeof first === 'object') {
    return { host: first.host, path: first.path };
  }
  return { host: typeof args[1] === 'string' ? args[1] : undefined, path: undefined };
}

const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guardedConnect(...args) {
  const target = connectTarget(args);
  if (target.path === undefined && !isLoopback(target.host)) {
    const error = refusal(`a connection to ${target.host}`);
    process.nextTick(() => this.destroy(error));
    return this;
  }
  return originalConnect.apply(this, args);
};

const originalLookup = dns.lookup;
dns.lookup = function guardedLookup(hostname, ...rest) {
  if (isLoopback(hostname)) return originalLookup.call(this, hostname, ...rest);
  const callback = rest.at(-1);
  const error = refusal(`resolving ${hostname}`);
  if (typeof callback === 'function') {
    process.nextTick(() => callback(error));
    return;
  }
  throw error;
};

// The reverse of dns.lookup: an address and a port in, a hostname and service
// name out. It resolves through the same OS-level path dns.lookup does (the
// reason either needs an in-process guard at all), so an address argument is
// checked the same way.
const originalLookupService = dns.lookupService;
dns.lookupService = function guardedLookupService(address, port, callback) {
  if (isLoopback(address)) return originalLookupService.call(this, address, port, callback);
  const error = refusal(`a reverse lookup of ${address}`);
  if (typeof callback === 'function') {
    process.nextTick(() => callback(error));
    return;
  }
  throw error;
};

const originalPromiseLookup = dns.promises.lookup;
dns.promises.lookup = function guardedPromiseLookup(hostname, ...rest) {
  if (isLoopback(hostname)) return originalPromiseLookup.call(this, hostname, ...rest);
  return Promise.reject(refusal(`resolving ${hostname}`));
};

// The c-ares resolvers do their own network I/O over UDP and never pass through
// `Socket#connect`, so each one is refused by name. `resolve` is the generic
// entry; the typed ones are what a test reaches for.
const RESOLVER_METHODS = [
  'resolve',
  'resolve4',
  'resolve6',
  'resolveAny',
  'resolveCname',
  'resolveCaa',
  'resolveMx',
  'resolveNaptr',
  'resolveNs',
  'resolvePtr',
  'resolveSoa',
  'resolveSrv',
  'resolveTxt',
  'reverse',
];
for (const method of RESOLVER_METHODS) {
  if (typeof dns[method] === 'function') {
    dns[method] = function refusedResolve(...args) {
      const callback = args.at(-1);
      const error = refusal(`a ${method} query`);
      if (typeof callback === 'function') {
        process.nextTick(() => callback(error));
        return;
      }
      throw error;
    };
  }
  if (typeof dns.promises[method] === 'function') {
    dns.promises[method] = () => Promise.reject(refusal(`a ${method} query`));
  }
  if (typeof dns.Resolver.prototype[method] === 'function') {
    dns.Resolver.prototype[method] = function refusedResolverMethod(...args) {
      const callback = args.at(-1);
      const error = refusal(`a ${method} query`);
      if (typeof callback === 'function') {
        process.nextTick(() => callback(error));
        return;
      }
      throw error;
    };
  }
}

// A UDP socket reaches a remote host two ways: an address named on the send
// call itself, or a target fixed earlier by connect() and then omitted from
// every send() after. Both are checked, because the second is not a
// hypothetical: connect() is the documented way to use a dgram socket for a
// whole session, and a send() with no address argument is exactly what a
// connected socket calls.
const originalDgramConnect = dgram.Socket.prototype.connect;
dgram.Socket.prototype.connect = function guardedDgramConnect(port, address, callback) {
  const target = typeof address === 'function' ? undefined : address;
  if (target !== undefined && !isLoopback(target)) {
    const done = typeof address === 'function' ? address : callback;
    const error = refusal(`connecting a datagram socket to ${target}`);
    if (typeof done === 'function') {
      process.nextTick(() => done(error));
      return;
    }
    throw error;
  }
  return Reflect.apply(originalDgramConnect, this, arguments);
};

const originalSend = dgram.Socket.prototype.send;
dgram.Socket.prototype.send = function guardedSend(...args) {
  const address = args.find((value, index) => index >= 1 && typeof value === 'string' && !/^\d+$/.test(value));
  if (address !== undefined && !isLoopback(address)) {
    const callback = args.at(-1);
    const error = refusal(`a datagram to ${address}`);
    if (typeof callback === 'function') {
      process.nextTick(() => callback(error));
      return;
    }
    throw error;
  }
  return originalSend.apply(this, args);
};

if (process.env.TEST_WORKER_INDEX !== undefined) {
  for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
    childProcess[name] = function refusedChildProcess() {
      throw refusal(`starting a process (${name}) from a test worker`);
    };
  }
}
