/**
 * The bridge a `sealed-brief-agent` evaluator acts on the target through
 * (AD-21): a vendor-neutral stdio MCP server exposing one tool per interface
 * the sealed brief carries.
 *
 * The brief names each interface as `{ logicalId, kind }` and withholds the
 * operation list, so each tool takes a call shaped only by its kind:
 *
 *   cli  { arguments: [command, ...words], stdin? }   the whole command line
 *   api  { method, path, body? }
 *   mcp  { tool, arguments? }
 *
 * Nothing about the contract reaches the agent through a tool: its name is
 * the interface's logical ID and its description says how a call of that
 * kind is spelled. What a call does is the runtime's `handle` (the router in
 * `sealed-brief-agent.js`), which authorizes it through the registry, maps it
 * to the contract operation it matches and records the observation.
 *
 * Two halves keep the contract, the registry and the recording in the
 * runtime's own process:
 *
 * - `openBridge`, in the runtime, serves the MCP protocol over a socket in a
 *   private temporary directory (a named pipe on Windows), admitting one
 *   connection, the first that presents the bridge's random token; any other
 *   connection, and a later one presenting the token, is closed unanswered;
 * - this file run as a program (`node bridge.js --socket <path>`, the token in
 *   the environment variable `TEA_EVALUATE_BRIDGE_TOKEN`, so no process
 *   listing shows it), which is the MCP server command the agent's adapter
 *   starts from the configuration file the runtime writes, relays its standard
 *   input to that socket and the socket to its standard output, and knows
 *   nothing else.
 *
 * The target runs as the same user as the runtime, with no sandbox until
 * Story 1.31 confines it, so a target that reads the agent's environment or
 * files could learn the token; the one-connection rule is what keeps it out
 * once the agent's relay has connected, which it does before its first call.
 *
 * The runtime runs the agent asynchronously (`runAgentAsync`), so its event
 * loop serves the socket while the agent works. Calls are answered one at a
 * time, in arrival order, so the observations' sequence is the order the
 * agent's calls were made.
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

/** The server name an agent's MCP configuration carries, and so the prefix its tools take. */
const BRIDGE_NAME = 'tea-evaluate';
const SERVER_INFO = { name: 'tea-evaluate-bridge', version: '1' };
/** The protocol version the bridge answers with when a client names none. */
const DEFAULT_PROTOCOL_VERSION = '2025-06-18';
/** The longest socket path the platforms Node supports all accept (macOS's `sun_path` holds 104 bytes). */
const MAX_SOCKET_PATH = 100;
/** The environment variable the relay reads the admission token from. */
const TOKEN_VARIABLE = 'TEA_EVALUATE_BRIDGE_TOKEN';
/** The most a connection may send before it has presented the token. */
const MAX_UNADMITTED_BYTES = 4096;

/** How each kind's call is spelled, as the tool's input schema and description. */
const CALL_SHAPES = {
  cli: {
    description:
      'The whole command line as a list of words (arguments): the command name first, then its subcommands, options and positional arguments, each its own word. Write an option as --name=value, or --name alone for a flag; a word after -- is positional. stdin, when given, is sent as the standard input.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['arguments'],
      properties: {
        arguments: { type: 'array', minItems: 1, items: { type: 'string' } },
        stdin: { type: 'string' },
      },
    },
  },
  api: {
    description: 'One HTTP request: its method, its path (with any query string) and, when the method takes one, a JSON body.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['method', 'path'],
      properties: {
        method: { type: 'string' },
        path: { type: 'string' },
        body: {},
      },
    },
  },
  mcp: {
    description: "One call of a tool the interface's server publishes: the tool's name and its arguments object.",
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['tool'],
      properties: {
        tool: { type: 'string' },
        arguments: { type: 'object' },
      },
    },
  },
};

/**
 * One MCP tool per interface the brief carries, in the brief's order: named
 * by the interface's logical ID, described and shaped by its kind alone.
 *
 * @param {Array<{ logicalId: string, kind: string }>} interfaces the sealed brief's `permittedInterfaces`
 * @returns {Array<{ name: string, kind: string, description: string, inputSchema: object }>}
 */
function bridgeTools(interfaces) {
  return interfaces
    .filter((iface) => Object.hasOwn(CALL_SHAPES, iface.kind))
    .map((iface) => ({
      name: iface.logicalId,
      kind: iface.kind,
      description: `Call the ${iface.kind} interface ${iface.logicalId} of the system under evaluation. ${CALL_SHAPES[iface.kind].description} The result says what was sent and what came back, and carries the observationId a judgment row cites when the evaluation recorded the call.`,
      inputSchema: CALL_SHAPES[iface.kind].inputSchema,
    }));
}

/** Where the socket goes: a private directory, under the system temp directory unless that path is too long for a socket. */
function socketPlace() {
  if (process.platform === 'win32') {
    return { directory: null, socketPath: `\\\\.\\pipe\\tea-evaluate-bridge-${crypto.randomBytes(12).toString('hex')}` };
  }
  for (const base of [os.tmpdir(), '/tmp']) {
    const directory = fs.mkdtempSync(path.join(base, 'tea-evaluate-bridge-'));
    const socketPath = path.join(directory, 'bridge.sock');
    if (Buffer.byteLength(socketPath) <= MAX_SOCKET_PATH) return { directory, socketPath };
    fs.rmSync(directory, { recursive: true, force: true });
  }
  throw new Error(`no temporary directory gives a socket path within ${MAX_SOCKET_PATH} bytes`);
}

/** One JSON-RPC response line. */
function responseLine(id, outcome) {
  return `${JSON.stringify({ jsonrpc: '2.0', id, ...outcome })}\n`;
}

/**
 * Serves the MCP protocol for `tools` over a private socket until closed.
 *
 * @param {object} options
 * @param {Array<{ name: string, kind: string, description: string, inputSchema: object }>} options.tools `bridgeTools(...)`
 * @param {(tool: { name: string, kind: string }, input: object) => Promise<{ text: string, isError: boolean }>} options.handle
 *   what one call does, answered as the call's text result
 * @returns {Promise<{ server: { name: string, command: string, args: string[] }, close: () => Promise<void> }>}
 *   `server` is the MCP server configuration the agent's adapter starts
 */
async function openBridge({ tools, handle }) {
  const { directory, socketPath } = socketPlace();
  const token = crypto.randomBytes(24).toString('hex');
  const connections = new Set();
  // One call at a time, in arrival order.
  let queue = Promise.resolve();
  let admittedOnce = false;

  const answer = async (message) => {
    const { id, method, params } = message;
    switch (method) {
      case 'initialize': {
        return {
          result: {
            protocolVersion: typeof params?.protocolVersion === 'string' ? params.protocolVersion : DEFAULT_PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: SERVER_INFO,
          },
        };
      }
      case 'ping': {
        return { result: {} };
      }
      case 'tools/list': {
        return { result: { tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) } };
      }
      case 'tools/call': {
        const tool = tools.find((candidate) => candidate.name === params?.name);
        if (tool === undefined) return { error: { code: -32_602, message: `no tool is named ${JSON.stringify(params?.name ?? null)}` } };
        const input = params?.arguments !== null && typeof params?.arguments === 'object' ? params.arguments : {};
        const done = queue.then(() => handle(tool, input));
        queue = done.catch(() => {});
        const { text, isError } = await done;
        return { result: { content: [{ type: 'text', text }], isError } };
      }
      default: {
        return id === undefined ? null : { error: { code: -32_601, message: `the bridge does not serve ${JSON.stringify(method)}` } };
      }
    }
  };

  const serve = (socket) => {
    connections.add(socket);
    socket.on('close', () => connections.delete(socket));
    socket.on('error', () => socket.destroy());
    let admitted = false;
    let pending = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      pending += chunk;
      if (!admitted && pending.length > MAX_UNADMITTED_BYTES) {
        socket.destroy();
        return;
      }
      let newline;
      while ((newline = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, newline).trim();
        pending = pending.slice(newline + 1);
        if (line.length === 0) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          if (admitted) socket.write(responseLine(null, { error: { code: -32_700, message: 'a line that is not JSON' } }));
          else socket.destroy();
          continue;
        }
        if (!admitted) {
          // The relay's first line presents the token; any other first line, and any connection after the
          // first admitted one, ends the connection.
          if (message?.token !== token || admittedOnce) {
            socket.destroy();
            return;
          }
          admitted = true;
          admittedOnce = true;
          continue;
        }
        for (const one of Array.isArray(message) ? message : [message]) {
          // A notification (`notifications/initialized` and the like) and a response take no answer.
          if (one === null || typeof one !== 'object' || one.id === undefined || typeof one.method !== 'string') continue;
          answer(one)
            .then((outcome) => {
              if (outcome !== null && !socket.destroyed) socket.write(responseLine(one.id ?? null, outcome));
            })
            .catch((error) => {
              if (!socket.destroyed)
                socket.write(responseLine(one.id ?? null, { error: { code: -32_603, message: String(error?.message ?? error) } }));
            });
        }
      }
    });
  };

  const server = net.createServer(serve);
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(socketPath, resolve);
    });
  } catch (error) {
    if (directory !== null) fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  return {
    server: { name: BRIDGE_NAME, command: process.execPath, args: [__filename, '--socket', socketPath], env: { [TOKEN_VARIABLE]: token } },
    async close() {
      for (const socket of connections) socket.destroy();
      await new Promise((resolve) => server.close(() => resolve()));
      // Whatever call was in flight has settled before the caller reads what the bridge recorded.
      await queue;
      if (directory !== null) fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

/**
 * The MCP server process the agent starts: stdin to the runtime's socket and
 * the socket to stdout, after presenting the token. It ends when either side
 * does.
 */
function relay(argv) {
  const value = (flag) => {
    const at = argv.indexOf(flag);
    return at === -1 ? undefined : argv[at + 1];
  };
  const socketPath = value('--socket');
  const token = process.env[TOKEN_VARIABLE];
  if (socketPath === undefined || typeof token !== 'string' || token.length === 0) {
    process.stderr.write(`usage: ${TOKEN_VARIABLE}=<token> bridge.js --socket <path>\n`);
    process.exit(64);
  }
  const socket = net.connect(socketPath);
  socket.on('error', (error) => {
    process.stderr.write(`tea-evaluate bridge: ${error.message}\n`);
    process.exit(1);
  });
  socket.on('connect', () => {
    socket.write(`${JSON.stringify({ token })}\n`);
    process.stdin.pipe(socket);
    socket.pipe(process.stdout);
  });
  // What the socket delivered last is written out before the relay ends.
  socket.on('close', () => process.stdout.write('', () => process.exit(0)));
  process.stdin.on('end', () => socket.end());
}

if (require.main === module) relay(process.argv.slice(2));

module.exports = { BRIDGE_NAME, CALL_SHAPES, TOKEN_VARIABLE, bridgeTools, openBridge };
