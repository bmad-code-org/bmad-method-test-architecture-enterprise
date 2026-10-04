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
 *                      lists the tools, appends its capture line, writes
 *                      <capture>.hung and never answers, for a case that interrupts the run mid-trial;
 *                      always-pass, which answers `pass` for the verdict key whatever the
 *                      call's stdout says (Story 1.34), so a run of it on a mutated arm reads as a defect
 *                      the agent missed
 *   --counter <file> --mode-from <n>
 *                      numbers the runs that judge a trial from 1 (Story 1.34)
 *                      and behaves as `normal` before run <n>, so a fault mode
 *                      can start after the evaluator's qualification attempts
 *                      (two arms of two attempts are runs 1 to 4)
 *   --mode alternating-stdin --counter <file>
 *                      numbers the runs that judge a trial and omits the
 *                      request on standard input on every even one (Story
 *                      1.34): the first such run sends it, the second sends
 *                      none, and so on, so a defect signature that selects on
 *                      standard input matches the odd runs only. <file> is a
 *                      path outside the project, since every run starts in a
 *                      scratch directory of its own; a calibration call does
 *                      not advance it
 *   --announce <file>  append one JSON line per run that judges a trial, before it calls the target: the configuration
 *                      file's path, its working directory, the bridge's socket path and the path of its token file
 *                      (never the token), and leave a working file in that directory, so a stub target can look for
 *                      what Story 1.58 withholds from it; then wait while a `verdict-private-leftover.js` process
 *                      runs, so what it probes still exists
 *   --plant <file> --plant-log <log>
 *                      first try to append a line to <file>, a path under the
 *                      evaluation folder, and append `{ calibration, outcome }`
 *                      to <log>: whether the prompt is a calibration call, and
 *                      `allowed` or `refused <code>` (Story 1.31: a confined
 *                      run's agent holds the evaluation folder read-only)
 *   --quote-observed-verdict
 *                      a failing `verdict-accepted` row quotes the `verdict: <word>` line the call's stdout holds, where
 *                      it otherwise quotes `verdict: rejected` (Story 1.79): a gameability arm's degenerate response
 *                      prints `verdict: pending`, so the quotation is witnessed there and the arm is judged a failure
 *   --version-file <file> --version-read-counter <file> --version-flip-at-read <n>
 *                      report the file's version under --version as {"agentVersion":"<v>"} (a file value of
 *                      malformed, plain-dependency, dependency-only, bad-json, multi-line, invalid-version or
 *                      stderr-only answers with that refused shape instead); optionally
 *                      change it on the numbered version read
 *   --flip-version-on-agent <n>
 *                      change the version file after numbered agent run <n>
 *   --require-version-env <name>
 *                      fail a version read unless the named variable is allowed through
 *   --version-delay-at-read <n> --version-delay-ms <ms>
 *                      slow one numbered version read to exercise resource accounting
 */

'use strict';

const fs = require('node:fs');
const { spawn, spawnSync } = require('node:child_process');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(name);
  return at === -1 ? fallback : argv[at + 1];
};
if (argv.includes('--version')) {
  const file = flag('--version-file', null);
  const reads = flag('--version-read-counter', null);
  const flipAt = Number(flag('--version-flip-at-read', '0'));
  const requiredEnvironment = flag('--require-version-env', null);
  if (requiredEnvironment !== null && process.env[requiredEnvironment] !== 'allowed') process.exit(4);
  if (reads !== null) {
    const count = (fs.existsSync(reads) ? Number(fs.readFileSync(reads, 'utf8')) : 0) + 1;
    fs.writeFileSync(reads, String(count));
    if (count === flipAt) fs.writeFileSync(file, '1.0.1\n');
    if (count === Number(flag('--version-delay-at-read', '0')))
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(flag('--version-delay-ms', '0')));
  }
  const reported = file === null ? '1.0.0' : fs.readFileSync(file, 'utf8').trim();
  if (reported === 'hang') while (true) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  else if (reported === 'fail') process.exit(3);
  else {
    // The custom adapter's contract is one line of JSON naming `agentVersion`; these modes break it
    // in the ways Story 1.76 refuses. `plain-dependency` keeps an incidental dependency version in free text.
    const answers = {
      malformed: 'unknown\n',
      'plain-dependency': 'stub-evaluator-agent 1.0.1\n',
      'dependency-only': '{"dependencyVersion":"2.3.4"}\n',
      'bad-json': '{"agentVersion":\n',
      'multi-line': '{"agentVersion":"1.0.0"}\n{"agentVersion":"1.0.0"}\n',
      'invalid-version': '{"agentVersion":"latest"}\n',
    };
    // stderr is the command's own log: it carries a dependency version on every read and must never bind.
    process.stderr.write('stub-evaluator-agent loaded dependency 9.9.9\n');
    if (reported === 'stderr-only') process.stderr.write('{"agentVersion":"1.0.0"}\n');
    else process.stdout.write(answers[reported] ?? `${JSON.stringify({ agentVersion: reported })}\n`);
    process.exit(0);
  }
}
const requestedMode = flag('--mode', 'normal');
const modeFrom = Number(flag('--mode-from', '1'));
let mode = requestedMode;
const capture = flag('--capture', null);
const counter = flag('--counter', null);
const versionFile = flag('--version-file', null);
const flipVersionOnAgent = Number(flag('--flip-version-on-agent', '0'));
const configFile = flag('--mcp-config', null);
const config = configFile === null ? {} : JSON.parse(fs.readFileSync(configFile, 'utf8'));
const prompt = fs.readFileSync(0, 'utf8');
const nonce = /<judge-answer nonce="([0-9a-f]+)">/.exec(prompt)?.[1];
const [name, server] = Object.entries(config.mcpServers ?? {})[0] ?? [];
const announce = flag('--announce', null);
const plant = flag('--plant', null);
const plantLog = flag('--plant-log', null);
if (plant !== null && plantLog !== null) {
  let outcome = 'allowed';
  try {
    fs.appendFileSync(plant, 'planted by the sealed-brief agent\n');
  } catch (error) {
    outcome = `refused ${error.code ?? error.message}`;
  }
  fs.appendFileSync(plantLog, `${JSON.stringify({ calibration: prompt.includes('calibration example at level'), outcome })}\n`);
}

if (announce !== null && !prompt.includes('calibration example at level')) {
  fs.appendFileSync(
    announce,
    `${JSON.stringify({ config: configFile, cwd: process.cwd(), socket: server.args.at(-1), tokenFile: server.env?.TEA_EVALUATE_BRIDGE_TOKEN_FILE })}\n`,
  );
  // A working file, so a listing of this directory shows something to withhold.
  fs.writeFileSync('working-notes.txt', "the agent's working file\n");
  // A process the stub target left running (`verdict-private-leftover.js`) probes these paths now; the stub holds the
  // directories until it has reported, so each probe reaches a path that exists.
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline && spawnSync('pgrep', ['-f', 'verdict-private-leftover.js'], { stdio: 'ignore' }).status === 0) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
}

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
  const material = JSON.parse(prompt.slice(prompt.indexOf('Sealed brief and keys to judge (JSON):') + 'Sealed brief and keys to judge (JSON):'.length));
  const observed = material.observation?.stdout?.value ?? material.observation?.stderr?.value ?? material.observation?.responseBody;
  const response = typeof observed === 'string' ? observed : observed?.example;
  const calibration = /calibration example at level ([123])/.exec(response ?? '');
  if (calibration !== null) {
    child.stdin.end();
    if (capture !== null) fs.appendFileSync(capture, `${JSON.stringify({ prompt, argv, config, server: name, initialized, tools: listed.result?.tools, results: [] })}\n`);
    const rows = [
      { key: 'verdict-accepted', outcome: 'pass', observationIds: ['calibration'] },
      { key: 'verdict-quality', outcome: 'score', score: Number(calibration[1]), observationIds: ['calibration'] },
    ];
    process.stdout.write(`<judge-answer nonce="${nonce}">${JSON.stringify({ rows })}</judge-answer>\n`);
    return;
  }
  let omitStdin = false;
  if (counter !== null) {
    // Runs are strictly serial, so the count needs no lock; a run is numbered from 1 in the order the runtime starts them.
    const number = (fs.existsSync(counter) ? Number(fs.readFileSync(counter, 'utf8')) : 0) + 1;
    fs.writeFileSync(counter, String(number));
    if (requestedMode === 'alternating-stdin') omitStdin = number % 2 === 0;
    // Before run --mode-from the agent behaves normally.
    mode = number >= modeFrom ? requestedMode : 'normal';
  } else if (requestedMode === 'alternating-stdin' || modeFrom !== 1) {
    throw new Error('--mode alternating-stdin and --mode-from need --counter <file>');
  }
  if (mode === 'hang') {
    if (capture !== null) fs.writeFileSync(`${capture}.hung`, 'hanging\n');
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
  const answered = await call(omitStdin ? { arguments: ['verdict'] } : { arguments: ['verdict'], stdin: 'Judge a request of my own.' });
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
  const accepted = mode === 'always-pass' || String(observation.stdout).includes('verdict: accepted');
  // Story 1.79: with --quote-observed-verdict a failing row quotes the `verdict:` line the observation holds, which a
  // gameability arm's degenerate response prints (`verdict: pending`), so the quotation is witnessed on that arm too.
  const quoted = argv.includes('--quote-observed-verdict') ? /verdict: \S+/.exec(String(observation.stdout))?.[0] : undefined;
  const row = accepted
    ? { key: 'verdict-accepted', outcome: 'pass', observationIds: [observation.observationId], comment: 'It accepted.' }
    : {
        key: 'verdict-accepted',
        outcome: 'fail',
        observationIds: [observation.observationId],
        quote: quoted ?? 'verdict: rejected',
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
  if (versionFile !== null && flipVersionOnAgent > 0 && counter !== null && Number(fs.readFileSync(counter, 'utf8')) === flipVersionOnAgent)
    fs.writeFileSync(versionFile, '1.0.1\n');
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (error) => {
    process.stderr.write(`${error.stack}\n`);
    process.exit(1);
  },
);
