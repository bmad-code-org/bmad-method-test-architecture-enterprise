/**
 * An HTTP environment-probe port for an `api` interface: eval-quality's
 * `EnvironmentProbePort`, which `tea-evaluate` drives for every leg, plan step
 * and evaluator call of an `api` interface this evaluation declares.
 *
 * This file is yours. It is rendered from the Evaluate skill's template into
 * your evaluation folder's `adapter/`, and it imports eval-quality from your
 * evaluation folder's own dependencies. `tea-evaluate` starts it as a Node
 * process of its own for each call, and its last lines hand the port to TeA's
 * host, which serves that call; keep them when you edit the port.
 *
 * The factory holds only configuration: where each logical interface is
 * (`targets`), what may be reached (`policy`, eval-quality's
 * `ProbeTargetPolicy`), the headers that carry your credentials (`auth`), and
 * how a request travels (`transport`). Every allow or deny decision is
 * eval-quality's `evaluateTarget`, called once per request and once per
 * redirect hop, so this file never classifies an address, and a fix to the
 * policy reaches you with the next eval-quality release.
 *
 * The four rules eval-quality's port documentation states, as this port
 * keeps them:
 *
 * 1. The policy decides before anything reaches the system, and again for
 *    every redirect.
 * 2. The request goes to the address the policy validated, with the original
 *    host in the `Host` header and TLS verified against that host; a host is
 *    resolved once per hop, to its first address, and never again after the
 *    decision.
 * 3. A denial throws `forbidden-target` with the policy's `reason`, a cap
 *    `budget-exhausted`, an abort `aborted`, and a request that reached nothing
 *    `port-failure`.
 * 4. Every answer is an observation, at any status.
 *
 * `http-probe-port.conformance.mjs` beside this file runs eval-quality's
 * conformance suite for this port against a loopback stub it starts itself.
 */

import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';

import { RuntimeFault, evaluateTarget as engineEvaluateTarget } from 'eval-quality';
import { probeParsers } from 'eval-quality/conformance';

/** The statuses that carry a `Location` this port follows. */
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/** Thrown by `send` when an answer passes `maxResponseBytes`. */
class ResponseTooLarge extends Error {}

/**
 * The transport a port uses unless you pass your own: the host's resolver and
 * Node's own HTTP client. Wrap it rather than replace it when you only need
 * to observe or delay a request, as the conformance file and `tea-evaluate`
 * do.
 */
export const nodeTransport = {
  /** The first address `host` resolves to, or `host` itself when it is an address. */
  async resolve(host) {
    if (isIP(host) !== 0) return host;
    const { address } = await lookup(host);
    return address;
  },

  /**
   * One HTTP exchange with `address`, never re-resolving `host`: its status,
   * its headers as Node reads them, and its body's bytes.
   */
  send({ scheme, host, port, address, method, path, headers, body, maxResponseBytes, tls = {} }, signal) {
    return new Promise((resolve, reject) => {
      const client = scheme === 'https' ? https : http;
      const request = client.request(
        {
          host: address,
          port,
          method,
          path,
          headers,
          signal,
          agent: false,
          ...(scheme === 'https' ? { ...tls, servername: isIP(host) === 0 ? host : undefined } : {}),
        },
        (response) => {
          const chunks = [];
          let size = 0;
          let tooLarge = false;
          response.on('data', (chunk) => {
            if (tooLarge) return;
            size += chunk.byteLength;
            if (size > maxResponseBytes) {
              // Settled here, before the rest arrives: an answer already whole would otherwise end as a success.
              tooLarge = true;
              reject(new ResponseTooLarge(`the answer passed maxResponseBytes (${maxResponseBytes})`));
              request.destroy();
              return;
            }
            chunks.push(chunk);
          });
          response.on('end', () => {
            if (!tooLarge) resolve({ status: response.statusCode, headers: response.headersDistinct, body: Buffer.concat(chunks) });
          });
          response.on('error', reject);
        },
      );
      request.on('error', reject);
      request.end(body);
    });
  },
};

/**
 * A path template with each `{name}` replaced by its path value, percent-encoded. A segment that reads as `.` or `..`
 * (`%2e` counts as a dot) is refused: a URL resolves it away, so the request would name another path than the one
 * the call records.
 */
function pathOf(pathTemplate, values) {
  const path = pathTemplate.replaceAll(/\{([A-Za-z0-9_-]+)\}/g, (_, name) => {
    if (!Object.hasOwn(values, name)) {
      throw new RuntimeFault(
        'schema-parse-failure',
        'ProbeRequest',
        `the path template names {${name}} and the request binds no path value for it`,
      );
    }
    const value = values[name];
    return encodeURIComponent(typeof value === 'string' ? value : JSON.stringify(value));
  });
  if (path.split('/').some((segment) => /^(?:\.|%2e){1,2}$/i.test(segment))) {
    throw new RuntimeFault('schema-parse-failure', 'ProbeRequest', `the path ${JSON.stringify(path)} holds a . or .. segment`);
  }
  return path;
}

/** One query value as text: a string as written, anything else as JSON. */
function queryText(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** `scheme://host:port` with an IPv6 host in brackets. */
function originOf({ scheme, host, port }) {
  return `${scheme}://${host.includes(':') ? `[${host}]` : host}:${port}`;
}

/** The port a URL names, or its scheme's default. */
function portOfUrl(url) {
  if (url.port !== '') return Number(url.port);
  return url.protocol === 'https:' ? 443 : 80;
}

/** A URL's host as the policy reads it: unbracketed. */
function hostOfUrl(url) {
  return url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname;
}

/** Node's distinct headers as the observation carries them: lower-case names, repeats joined with ", ", `set-cookie` left out. */
function observedHeaders(distinct) {
  const headers = {};
  for (const [name, values] of Object.entries(distinct ?? {})) {
    if (name === 'set-cookie') continue;
    headers[name] = values.join(', ');
  }
  return headers;
}

/** A body's bytes as the observation carries them: absent when empty, JSON when the type says so and it parses, text otherwise. */
function observedBody(bytes, contentType) {
  if (bytes.byteLength === 0) return { kind: 'absent' };
  const text = bytes.toString('utf8');
  if (/^application\/(?:[\w.+-]+\+)?json\b/i.test(contentType ?? '')) {
    try {
      return { kind: 'json', value: JSON.parse(text) };
    } catch {
      return { kind: 'text', value: text };
    }
  }
  return { kind: 'text', value: text };
}

/** An answer as eval-quality's `ProbeObservation`, or `port-contract-violation` when it cannot be one (a status past 599). */
function observationOf(request, answer) {
  const observation = {
    probeId: request.probeId,
    interfaceId: request.interfaceId,
    operationId: request.operationId,
    kind: 'api',
    status: answer.status,
    headers: observedHeaders(answer.headers),
    body: observedBody(answer.body, answer.headers?.['content-type']?.[0]),
  };
  const valid = probeParsers.response.safeParse(observation);
  if (!valid.success) {
    throw new RuntimeFault(
      'port-contract-violation',
      'ProbeObservation',
      `the answer cannot be recorded as a ProbeObservation: ${valid.error.message}`,
    );
  }
  return valid.data;
}

/** Whether a redirect turns the request into a GET with no body, as browsers and fetch do. */
function becomesGet(status, method) {
  return (status === 303 && method !== 'HEAD') || ((status === 301 || status === 302) && method === 'POST');
}

/**
 * The port.
 *
 * @param {object} options
 * @param {{ authorizations: object[] }} options.policy eval-quality's `ProbeTargetPolicy`
 * @param {Record<string, { scheme: string, host: string, port: number }>} options.targets where each interface is
 * @param {Record<string, Record<string, string>>} [options.auth] headers each interface's requests carry, by interface
 * @param {{ resolve?: Function, prepare?: Function, send?: Function, tls?: object }} [options.transport] how a request
 *   travels: `prepare`, when given, runs once the policy has allowed a request's first hop and before its elapsed cap
 *   starts, with the target it allowed (`tea-evaluate` starts a service there)
 * @param {Function} [options.evaluateTarget] eval-quality's decision, injectable so a test can count its calls
 * @returns {{ probe: (request: unknown, signal: AbortSignal) => Promise<object> }}
 */
export default function createHttpProbePort({ policy, targets, auth = {}, transport = {}, evaluateTarget = engineEvaluateTarget }) {
  const resolve = transport.resolve ?? nodeTransport.resolve;
  const prepare = transport.prepare;
  const send = transport.send ?? nodeTransport.send;
  const tls = transport.tls ?? {};

  async function probe(input, signal) {
    const parsed = probeParsers.request.safeParse(input);
    if (!parsed.success) {
      throw new RuntimeFault('schema-parse-failure', 'ProbeRequest', `the request is not a ProbeRequest: ${parsed.error.message}`);
    }
    const request = parsed.data;
    if (request.kind !== 'api') {
      throw new RuntimeFault('forbidden-target', 'ProbeRequest', `this port sends api requests only, and the request is ${request.kind}`, {
        reason: 'interface-not-authorized',
      });
    }
    if (signal?.aborted) throw new RuntimeFault('aborted', 'ProbeRequest', 'the request was aborted before it was sent');

    const target = targets[request.interfaceId];
    if (target === undefined) {
      // No target is configured for the interface: the policy still decides, over a target that names nothing.
      const decision = evaluateTarget(policy, {
        interfaceId: request.interfaceId,
        scheme: '',
        host: '',
        port: 0,
        address: '',
        method: request.method,
      });
      throw decision.allowed
        ? new RuntimeFault('port-contract-violation', 'ProbeRequest', `no target is configured for interface ${request.interfaceId}`)
        : new RuntimeFault('forbidden-target', 'ProbeRequest', decision.detail, { reason: decision.reason });
    }
    let url = new URL(originOf(target));
    url.pathname = pathOf(request.pathTemplate, request.channels.path);
    for (const [name, value] of Object.entries(request.channels.query)) {
      for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(name, queryText(item));
    }
    let method = request.method;
    let body = request.channels.body.kind === 'json' ? Buffer.from(JSON.stringify(request.channels.body.value)) : undefined;
    const declaredHeaders = { ...request.channels.header };
    if (body !== undefined && !Object.keys(declaredHeaders).some((name) => name.toLowerCase() === 'content-type')) {
      declaredHeaders['content-type'] = 'application/json';
    }
    const credentials = auth[request.interfaceId] ?? {};
    const originalOrigin = url.origin;

    // One deadline over every hop; an abort of the caller's signal is told apart from the cap.
    const cap = new AbortController();
    const exchange = signal === undefined ? cap.signal : AbortSignal.any([signal, cap.signal]);
    let timer;
    let deadline = null;
    const capped = (detail) => new RuntimeFault('budget-exhausted', 'ProbeObservation', detail);
    try {
      for (let hop = 0; ; hop += 1) {
        const host = hostOfUrl(url);
        const scheme = url.protocol.slice(0, -1);
        const port = portOfUrl(url);
        const hopTarget = { interfaceId: request.interfaceId, scheme, host, port, method };
        let address;
        try {
          address = await resolve(host, exchange);
        } catch (error) {
          if (signal?.aborted) throw new RuntimeFault('aborted', 'ProbeRequest', 'the request was aborted');
          // A host that does not resolve is still the policy's to deny when its scheme, host or port is not allowed;
          // only a target the policy would reach at some address is one this port could not reach. eval-quality
          // reports the first denial among an interface's authorizations, so with one authorization per interface, as
          // `tea-evaluate`'s registry holds, that denial names this target.
          const unresolved = evaluateTarget(policy, { ...hopTarget, address: '' });
          if (!unresolved.allowed && unresolved.reason !== 'address-unparseable') {
            throw new RuntimeFault('forbidden-target', 'ProbeRequest', unresolved.detail, { reason: unresolved.reason });
          }
          throw new RuntimeFault('port-failure', 'ProbeObservation', `the host ${JSON.stringify(host)} could not be resolved`, {
            cause: error,
          });
        }
        const decision = evaluateTarget(policy, { ...hopTarget, address });
        if (!decision.allowed) {
          throw new RuntimeFault('forbidden-target', 'ProbeRequest', decision.detail, { reason: decision.reason });
        }
        const { authorization } = decision;
        if (body !== undefined && body.byteLength > authorization.maxRequestBytes) {
          throw capped(`the request body of ${body.byteLength} bytes passes maxRequestBytes (${authorization.maxRequestBytes})`);
        }
        if (deadline === null) {
          if (prepare !== undefined) {
            try {
              await prepare({ scheme, host, port, address: decision.canonicalAddress, method }, signal);
            } catch (error) {
              if (signal?.aborted) throw new RuntimeFault('aborted', 'ProbeRequest', 'the request was aborted');
              throw new RuntimeFault('port-failure', 'ProbeObservation', 'the target could not be prepared', { cause: error });
            }
          }
          deadline = authorization.maxElapsedMs;
          timer = setTimeout(() => cap.abort(), deadline);
        }
        // Credentials go to the origin they were configured for and to no origin a redirect names.
        const headers = { ...declaredHeaders, ...(url.origin === originalOrigin ? credentials : {}), host: url.host };
        let answer;
        try {
          answer = await send(
            {
              scheme,
              host,
              port,
              address: decision.canonicalAddress,
              method,
              path: `${url.pathname}${url.search}`,
              headers,
              body,
              maxResponseBytes: authorization.maxResponseBytes,
              tls,
            },
            exchange,
          );
        } catch (error) {
          if (signal?.aborted) throw new RuntimeFault('aborted', 'ProbeRequest', 'the request was aborted');
          if (cap.signal.aborted) throw capped(`the exchange passed maxElapsedMs (${authorization.maxElapsedMs}ms)`);
          if (error instanceof ResponseTooLarge) throw capped(error.message);
          throw new RuntimeFault('port-failure', 'ProbeObservation', 'the request reached no answer', { cause: error });
        }
        const location = answer.headers?.location?.[0];
        if (REDIRECTS.has(answer.status) && typeof location === 'string') {
          if (hop + 1 > authorization.maxRedirects) {
            throw capped(`the target redirected more than maxRedirects (${authorization.maxRedirects}) times`);
          }
          // A Location no URL can be read from is the target's answer, recorded as it came.
          if (!URL.canParse(location, url)) {
            return observationOf(request, answer);
          }
          url = new URL(location, url);
          if (becomesGet(answer.status, method)) {
            method = 'GET';
            body = undefined;
            delete declaredHeaders['content-type'];
          }
          continue;
        }
        return observationOf(request, answer);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  return { probe };
}

// When `tea-evaluate` starts this file to serve one call, it hands the port to TeA's host, which speaks the runtime's
// protocol on standard input and output. The import happens only then, so the port needs TeA for nothing else.
if (process.env.TEA_EVALUATE_HTTP_PORT_HOST === '1') {
  const { serveHttpProbePort } = await import('bmad-method-test-architecture-enterprise/cli/lib/evaluate/http-port-host.js');
  serveHttpProbePort({ createHttpProbePort, nodeTransport });
}
