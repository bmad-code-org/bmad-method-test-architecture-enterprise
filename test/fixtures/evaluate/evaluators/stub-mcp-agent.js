#!/usr/bin/env node
/**
 * A stub sealed-brief evaluator agent for the MCP fixture (Story 1.10), run
 * through the `custom` agent adapter. It reads its prompt on stdin, starts the
 * bridge the configuration file `--mcp-config <file>` names, and calls the
 * bridge's `grader` tool four times:
 *
 *   grade_answer     { answer: "an answer of my own" }: listed in the registry
 *                    and declared by the contract's grade-answer operation, so
 *                    the runtime records it
 *   describe_policy  {}: listed in the registry and declared by no operation,
 *                    so it runs and stays out of the record; the stub reads
 *                    the mode from its result and exits 1 when the result is
 *                    not the call's JSON (a call that could not run)
 *   reset_ledger     {}: published by the server and absent from the
 *                    registry's tools, so eval-quality denies it before the
 *                    server starts
 *   grade_answer     { answer: 42 }: declared, and answered by the server with
 *                    its error flag set, since the answer is not a string, so
 *                    the runtime records it with response status 1
 *
 * It answers key `grade-accepted` in the one answer block the prompt names:
 * `pass` when the grade call's result says `accepted`, `fail` otherwise,
 * quoting `rejected` from the result and citing the call's observation.
 *
 *   --capture <file>   append one JSON line per run: the prompt, the tools the
 *                      bridge listed and every tool result
 */

'use strict';

const fs = require('node:fs');
const { spawn } = require('node:child_process');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(name);
  return at === -1 ? fallback : argv[at + 1];
};
const capture = flag('--capture', null);
const config = JSON.parse(fs.readFileSync(flag('--mcp-config', null), 'utf8'));
const prompt = fs.readFileSync(0, 'utf8');
const nonce = /<judge-answer nonce="([0-9a-f]+)">/.exec(prompt)?.[1];
const [, server] = Object.entries(config.mcpServers ?? {})[0] ?? [];

const child = spawn(server.command, server.args, { stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, ...server.env } });
const waiting = new Map();
let pending = '';
let nextId = 1;
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  pending += chunk;
  let newline;
  while ((newline = pending.indexOf('\n')) !== -1) {
    const message = JSON.parse(pending.slice(0, newline));
    pending = pending.slice(newline + 1);
    waiting.get(message.id)?.(message);
  }
});
const request = (method, params) =>
  new Promise((resolve) => {
    const id = nextId++;
    waiting.set(id, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });

async function main() {
  await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'stub', version: '1' } });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  const listed = await request('tools/list', {});
  const call = (input) => request('tools/call', { name: 'grader', arguments: input });
  const graded = await call({ tool: 'grade_answer', arguments: { answer: 'an answer of my own' } });
  const described = await call({ tool: 'describe_policy', arguments: {} });
  const { mode } = JSON.parse(described.result.content[0].text).result ?? {};
  const reset = await call({ tool: 'reset_ledger' });
  const refused = await call({ tool: 'grade_answer', arguments: { answer: 42 } });
  child.stdin.end();
  if (capture !== null) {
    fs.appendFileSync(capture, `${JSON.stringify({ prompt, tools: listed.result?.tools, results: [graded, described, reset, refused] })}\n`);
  }
  const answer = JSON.parse(graded.result.content[0].text);
  const accepted = answer.result?.verdict === 'accepted';
  const row = accepted
    ? { key: 'grade-accepted', outcome: 'pass', observationIds: [answer.observationId], comment: `It accepted under ${mode}.` }
    : {
        key: 'grade-accepted',
        outcome: 'fail',
        observationIds: [answer.observationId],
        quote: 'rejected',
        quoteChannel: 'response-body',
        confidence: 0.8,
        comment: `It rejected an answer it had to accept under ${mode}.`,
      };
  process.stdout.write(`Judged.\n<judge-answer nonce="${nonce}">${JSON.stringify({ rows: [row] })}</judge-answer>\n`);
}

main().then(
  () => process.exit(0),
  (error) => {
    process.stderr.write(`${error.stack}\n`);
    process.exit(1);
  },
);
