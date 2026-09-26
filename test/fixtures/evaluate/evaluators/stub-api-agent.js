#!/usr/bin/env node
/**
 * A stub sealed-brief evaluator agent for the HTTP fixture (Story 1.11), run
 * through the `custom` agent adapter. It reads its prompt on stdin, starts the
 * bridge the configuration file `--mcp-config <file>` names, and calls the
 * bridge's `grader` tool four times:
 *
 *   GET /grade?answer=an answer of my own   declared by the contract's
 *                                           grade-answer operation and
 *                                           allowed, so the runtime records it
 *   GET /policy                             allowed and declared by no
 *                                           operation, so it runs and stays
 *                                           out of the record; the stub reads
 *                                           the mode from its answer and exits
 *                                           1 when the answer is not the
 *                                           call's JSON (a call that could not
 *                                           run)
 *   DELETE /grade                           a method the registry does not
 *                                           list, so eval-quality denies it
 *                                           before any server starts
 *   GET /grade                              declared, and answered 400 by the
 *                                           service, since it names no answer,
 *                                           so the runtime records it with
 *                                           response status 400
 *
 * It answers key `grade-accepted` in the one answer block the prompt names:
 * `pass` when the grade call's answer says `accepted`, `fail` otherwise,
 * quoting `rejected` from the answer and citing the call's observation.
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
  const graded = await call({ method: 'GET', path: '/grade?answer=an%20answer%20of%20my%20own' });
  const described = await call({ method: 'GET', path: '/policy' });
  const { mode } = JSON.parse(described.result.content[0].text).body ?? {};
  const deleted = await call({ method: 'DELETE', path: '/grade' });
  const unanswered = await call({ method: 'GET', path: '/grade' });
  child.stdin.end();
  if (capture !== null) {
    fs.appendFileSync(capture, `${JSON.stringify({ prompt, tools: listed.result?.tools, results: [graded, described, deleted, unanswered] })}\n`);
  }
  const answer = JSON.parse(graded.result.content[0].text);
  const accepted = answer.body?.verdict === 'accepted';
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
