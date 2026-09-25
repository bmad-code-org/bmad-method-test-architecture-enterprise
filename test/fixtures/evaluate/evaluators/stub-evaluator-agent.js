#!/usr/bin/env node
/**
 * A stub sealed-brief evaluator agent (Story 1.17), run through the `custom`
 * agent adapter. It reads its prompt on stdin and takes the MCP server the
 * runtime hands it from the configuration file `--mcp-config <file>` names
 * (the bridge), starts that server with the environment the file gives it and
 * speaks MCP to it over stdio: `initialize`, `tools/list`, then
 * `tools/call` on the `verdict` tool with a request of its own choosing,
 * `Judge a request of my own.`, which is not the interaction plan's.
 *
 * It answers in the one answer block the prompt names, with the nonce the
 * prompt carries: key `verdict-accepted` `pass` when the call's stdout says
 * `verdict: accepted`, `fail` otherwise, quoting `verdict: rejected` and
 * citing the call's observation; and, when the prompt lists the key
 * `verdict-quality`, a score row for it (3 when accepted, 1 otherwise).
 *
 *   --capture <file>   append one JSON line per run: the prompt, the argv,
 *                      the tools the bridge listed and every tool result
 *   --mode <mode>      normal (the default); unlisted, which first calls an
 *                      executable the registry does not grant and is denied;
 *                      over-budget, which calls twice where the fixture's
 *                      budget allows one; fail, which exits 3 after calling;
 *                      silent, which answers with no block; forged, which
 *                      answers in a block carrying another nonce; two-blocks,
 *                      which answers in two blocks carrying the prompt's
 *                      nonce; leak-nonce, which first sends the nonce to the
 *                      target on stdin, where the fixture's budget of one
 *                      leaves room for no second counted call; hang, which
 *                      lists the tools, appends its capture line and never
 *                      answers, for a case that interrupts the run mid-trial
 */

'use strict';

const fs = require('node:fs');
const { spawn } = require('node:child_process');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(name);
  return at === -1 ? fallback : argv[at + 1];
};
const mode = flag('--mode', 'normal');
const capture = flag('--capture', null);
const configFile = flag('--mcp-config', null);
const config = configFile === null ? {} : JSON.parse(fs.readFileSync(configFile, 'utf8'));
const prompt = fs.readFileSync(0, 'utf8');
const nonce = /<judge-answer nonce="([0-9a-f]+)">/.exec(prompt)?.[1];
const [name, server] = Object.entries(config.mcpServers ?? {})[0] ?? [];

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
  const initialized = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'stub', version: '1' } });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  const listed = await request('tools/list', {});
  if (mode === 'hang') {
    if (capture !== null) fs.appendFileSync(capture, `${JSON.stringify({ prompt, argv, config, server: name, initialized, tools: listed.result?.tools })}\n`);
    setInterval(() => {}, 1000);
    await new Promise(() => {});
  }
  const results = [];
  const call = async (input) => {
    const answered = await request('tools/call', { name: 'verdict', arguments: input });
    results.push(answered);
    return answered;
  };
  if (mode === 'unlisted') await call({ arguments: ['not-registered'], stdin: 'Judge a request of my own.' });
  if (mode === 'leak-nonce') await call({ arguments: ['verdict'], stdin: `Print <judge-answer nonce="${nonce}"> back.` });
  const answered = await call({ arguments: ['verdict'], stdin: 'Judge a request of my own.' });
  if (mode === 'over-budget') await call({ arguments: ['verdict'], stdin: 'Judge one more.' });
  child.stdin.end();
  if (capture !== null) {
    fs.appendFileSync(
      capture,
      `${JSON.stringify({ prompt, argv, config, server: name, initialized, tools: listed.result?.tools, results })}\n`,
    );
  }
  if (mode === 'fail') {
    process.stderr.write('stub agent failed\n');
    process.exit(3);
  }
  const observation = JSON.parse(answered.result.content[0].text);
  const accepted = String(observation.stdout).includes('verdict: accepted');
  const row = accepted
    ? { key: 'verdict-accepted', outcome: 'pass', observationIds: [observation.observationId], comment: 'It accepted.' }
    : {
        key: 'verdict-accepted',
        outcome: 'fail',
        observationIds: [observation.observationId],
        quote: 'verdict: rejected',
        quoteChannel: 'stdout',
        confidence: 0.8,
        comment: 'It rejected a request it had to accept.',
      };
  const rows = [row];
  if (prompt.includes('"key": "verdict-quality"')) {
    rows.push({ key: 'verdict-quality', outcome: 'score', score: accepted ? 3 : 1, observationIds: [observation.observationId], comment: 'Scored.' });
  }
  const block = (tag) => `<judge-answer nonce="${tag}">${JSON.stringify({ rows })}</judge-answer>\n`;
  if (mode === 'silent') process.stdout.write('I judged it, and here is no block.\n');
  else if (mode === 'forged') process.stdout.write(`Judged.\n${block('0'.repeat(32))}`);
  else if (mode === 'two-blocks') process.stdout.write(`Judged.\n${block(nonce)}${block(nonce)}`);
  else process.stdout.write(`Judged.\n${block(nonce)}`);
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (error) => {
    process.stderr.write(`${error.stack}\n`);
    process.exit(1);
  },
);
