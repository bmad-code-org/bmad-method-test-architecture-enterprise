/**
 * The host side of an `api` call (Story 1.11): TeA's code inside the process
 * `tea-evaluate` starts from the evaluation's own HTTP port,
 * `adapter/http-probe-port.mjs`.
 *
 * The runtime never imports the adopter's port: it starts the port file as a
 * Node process of its own with `TEA_EVALUATE_HTTP_PORT_HOST=1`, and the
 * template's last lines hand the port's factory and `nodeTransport` to
 * `serveHttpProbePort`, which answers the runtime over newline-delimited JSON
 * on standard input and output (`http-target.js` is the other side). The
 * protocol therefore ships with TeA and moves with it; the adopter's file
 * holds only the port.
 *
 * One process serves one message and ends:
 *
 *   hello              answered `{ type: "hello", protocol }`, so the runtime
 *                      holds the port to a protocol it speaks before a run
 *   call               `{ configuration, request, launched, degenerate? }`: the
 *                      port built over the configuration (policy, targets,
 *                      auth) and asked to probe the request. With `launched`,
 *                      the port's `prepare` step, once its policy has allowed
 *                      the call and before its elapsed cap starts, asks the
 *                      runtime to start the call's server (`send`, with the
 *                      target eval-quality allowed, where the runtime waits
 *                      for the server) and waits for `ready` or
 *                      `not-ready`; with `degenerate`, nothing is sent and
 *                      every allowed request is answered from that response.
 *                      Answered `{ type: "answer", observation }` or
 *                      `{ type: "fault", fault }`, the fault's `code`,
 *                      eval-quality's `reason`, its message and its cause.
 *   abort              the call's signal aborted
 *
 * The process ends when its standard input closes.
 */

'use strict';

/** The protocol version both sides speak; `http-target.js` refuses a port answering another. */
const HTTP_PORT_PROTOCOL = 1;

/** The environment key that tells a port file it was started by `tea-evaluate` to serve its calls. */
const HOST_ENVIRONMENT_KEY = 'TEA_EVALUATE_HTTP_PORT_HOST';

/** Thrown by a gameability call's transport when the degenerate response answers no HTTP request. */
class UnansweredRequest extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnansweredRequest';
  }
}

/** A thrown value as the runtime reads it: eval-quality's fault fields and its cause's name and message. */
function faultOf(error) {
  const cause = error?.cause;
  return {
    name: typeof error?.name === 'string' ? error.name : 'Error',
    code: typeof error?.code === 'string' ? error.code : null,
    ...(typeof error?.reason === 'string' ? { reason: error.reason } : {}),
    artifactPath: typeof error?.artifactPath === 'string' ? error.artifactPath : null,
    message: String(error?.message ?? error),
    ...(cause === undefined ? {} : { cause: { name: cause?.name ?? 'Error', message: String(cause?.message ?? cause) } }),
  };
}

/** A degenerate answer (`{ status, headers?, body? }`) as `nodeTransport.send` returns an answer. */
function degenerateExchange(answer) {
  if (answer === null || answer === undefined) throw new UnansweredRequest('the system answers no HTTP request');
  return {
    status: answer.status,
    headers: Object.fromEntries(Object.entries(answer.headers ?? {}).map(([name, value]) => [name.toLowerCase(), [value]])),
    body: Buffer.from(answer.body ?? '', 'utf8'),
  };
}

/**
 * Serves the runtime's one message, when the process was started to (its
 * `TEA_EVALUATE_HTTP_PORT_HOST` is `1`); otherwise does nothing, so the port
 * file imports cleanly into its conformance run or a test.
 *
 * @param {{ createHttpProbePort: Function, nodeTransport: { send: Function } }} port the port file's exports
 * @param {object} [streams] where the messages come from and go to; the process's own by default
 */
function serveHttpProbePort(port, { input = process.stdin, output = process.stdout, env = process.env } = {}) {
  if (env[HOST_ENVIRONMENT_KEY] !== '1') return;
  const write = (message) => output.write(`${JSON.stringify(message)}\n`);
  const controller = new AbortController();
  let waitingForServer = null;
  let calling = false;

  async function call(message) {
    calling = true;
    let serverReady = null;
    // Called by the port once its policy has allowed the call's first hop, before its elapsed cap starts: the runtime
    // starts the call's server where the port is about to send, and answers `ready` or `not-ready`.
    const startServer = (target) => {
      serverReady ??= new Promise((resolve, reject) => {
        waitingForServer = { resolve, reject };
        write({ type: 'send', target });
      });
      return serverReady;
    };
    const transport =
      message.degenerate === undefined
        ? { send: port.nodeTransport.send, ...(message.launched ? { prepare: startServer } : {}) }
        : {
            send: async () => degenerateExchange(message.degenerate),
            resolve: async (host) => message.degenerateAddresses?.[host.toLowerCase()] ?? host,
          };
    try {
      const probePort = port.createHttpProbePort({ ...message.configuration, transport });
      write({ type: 'answer', observation: await probePort.probe(message.request, controller.signal) });
    } catch (error) {
      write({ type: 'fault', fault: faultOf(error) });
    }
  }

  function receive(message) {
    if (message?.type === 'hello') {
      const valid = typeof port?.createHttpProbePort === 'function' && typeof port?.nodeTransport?.send === 'function';
      write({ type: 'hello', protocol: HTTP_PORT_PROTOCOL, valid });
    } else if (message?.type === 'call' && !calling) {
      call(message);
    } else if (message?.type === 'abort') {
      controller.abort();
    } else if (message?.type === 'ready' && waitingForServer !== null) {
      waitingForServer.resolve();
    } else if (message?.type === 'not-ready' && waitingForServer !== null) {
      waitingForServer.reject(new Error(String(message.message ?? 'the server did not start')));
    }
  }

  let pending = '';
  input.setEncoding('utf8');
  input.on('data', (chunk) => {
    pending += chunk;
    let newline;
    while ((newline = pending.indexOf('\n')) !== -1) {
      const line = pending.slice(0, newline);
      pending = pending.slice(newline + 1);
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      receive(message);
    }
  });
  input.on('end', () => {
    controller.abort();
    // Standard input closed: the runtime has what it needs, or has gone, so the process ends with nothing left running.
    if (input === process.stdin) process.exit(0);
  });
}

module.exports = { HOST_ENVIRONMENT_KEY, HTTP_PORT_PROTOCOL, UnansweredRequest, faultOf, serveHttpProbePort };
