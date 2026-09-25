#!/usr/bin/env node
/**
 * A loopback stdio MCP tool server, the system under test of Story 1.10's
 * fixture: newline-delimited JSON-RPC on stdin and stdout, protocol
 * `2025-06-18`, with no SDK.
 *
 * It publishes three tools:
 *
 *   grade_answer     { answer: string } -> { ok, answer, verdict }: the verdict
 *                    is accepted under `mode: strict` in rules/policy.txt (read
 *                    from its working directory) and rejected under
 *                    `mode: lenient`, the mutation M-001 plants; an answer
 *                    that is not a string is refused with isError
 *   describe_policy  {} -> { ok, mode }
 *   reset_ledger     {} -> { ok }: a tool the fixture's registry does not
 *                    list, so eval-quality denies it before the server starts
 *
 * The handshake is stateful: a `tools/call` before `initialize` is refused, so
 * a client that skipped it fails here instead of appearing to work.
 *
 * When GRADER_LOG names a file, every session appends one JSON line at its
 * handshake (`event: initialize`, the protocol version the client announced,
 * the workspace label of its working directory) and one per tool call
 * (`event: call`, the tool and its arguments), so a test reads from the
 * server's own log which calls started it and where: `workspace` is the
 * runtime label of its working directory and `scriptWorkspace` that of the
 * directory it was started from, which the registry resolves into the same
 * workspace. When GRADER_SECRET is
 * set, `grade_answer` echoes it as `secret`, for a test that the runtime
 * scrubs a server's environment from what it records.
 *
 * It runs through its `#!/usr/bin/env node` line, so the host's PATH must
 * resolve `node`, as eval-quality starts a target with the host's PATH.
 *
 * Policy lines drive the failure cases:
 *
 *   handshake: refuse   answer `initialize` with a JSON-RPC error, a server
 *                       that could not open its session
 *   verdict: accept     answer accepted whatever the mode says
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const PROTOCOL_VERSION = '2025-06-18';
const TOOLS = [
  {
    name: 'grade_answer',
    description: 'Grade one answer under the committed policy.',
    inputSchema: { type: 'object', required: ['answer'], properties: { answer: { type: 'string' } } },
  },
  { name: 'describe_policy', description: 'Name the policy mode in force.', inputSchema: { type: 'object', properties: {} } },
  { name: 'reset_ledger', description: 'Reset the grading ledger.', inputSchema: { type: 'object', properties: {} } },
];

const policy = fs.existsSync(path.join('rules', 'policy.txt')) ? fs.readFileSync(path.join('rules', 'policy.txt'), 'utf8') : '';
const mode = /mode: (\w+)/.exec(policy)?.[1] ?? 'unknown';
/** The runtime label of the workspace a directory lies in (`trial-clean-2` for tea-evaluate-trial-clean-2-XXXXXX/target), or null. */
const labelOf = (directory) => /^tea-evaluate-(.+)-[A-Za-z0-9]{6}$/.exec(path.basename(path.dirname(directory)))?.[1] ?? null;
const workspace = labelOf(process.cwd());
/** The workspace this script was started from, which the registry resolves its target into. */
const scriptWorkspace = labelOf(path.dirname(__dirname));

function log(entry) {
  if (process.env.GRADER_LOG) {
    fs.appendFileSync(process.env.GRADER_LOG, `${JSON.stringify({ ...entry, workspace, scriptWorkspace, pid: process.pid })}\n`);
  }
}

function send(message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
}

function result(structuredContent, isError = false) {
  return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent, isError };
}

function callTool(name, args) {
  if (name === 'grade_answer') {
    if (typeof args.answer !== 'string') return result({ ok: false, error: 'answer must be a string' }, true);
    let verdict = mode === 'strict' ? 'accepted' : mode === 'lenient' ? 'rejected' : 'unknown';
    if (policy.includes('verdict: accept')) verdict = 'accepted';
    return result({
      ok: true,
      answer: args.answer,
      verdict,
      ...(process.env.GRADER_SECRET ? { secret: process.env.GRADER_SECRET } : {}),
    });
  }
  if (name === 'describe_policy') return result({ ok: true, mode });
  if (name === 'reset_ledger') return result({ ok: true });
  return null;
}

let initialized = false;
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (line.trim() === '') return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  // A notification carries no id and wants no answer.
  if (message.id === undefined) return;
  const { id, method, params } = message;
  if (method === 'initialize') {
    log({ event: 'initialize', protocolVersion: params?.protocolVersion ?? null });
    if (policy.includes('handshake: refuse')) {
      send({ id, error: { code: -32_603, message: 'the grader refuses to open a session' } });
      return;
    }
    initialized = true;
    send({ id, result: { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: 'grader', version: '1' } } });
    return;
  }
  if (!initialized) {
    send({ id, error: { code: -32_002, message: 'server not initialized' } });
    return;
  }
  if (method === 'tools/list') {
    send({ id, result: { tools: TOOLS } });
    return;
  }
  if (method === 'tools/call') {
    const args = params?.arguments ?? {};
    log({ event: 'call', tool: params?.name ?? null, arguments: args });
    const answered = callTool(params?.name, args);
    if (answered === null) send({ id, error: { code: -32_602, message: `unknown tool ${params?.name}` } });
    else send({ id, result: answered });
    return;
  }
  send({ id, error: { code: -32_601, message: `unknown method ${method}` } });
});
