#!/usr/bin/env node
/**
 * The process `bin/verdict.js` leaves running for Story 1.31's cases, in a
 * session of its own and outside the target's process group, as a target that
 * forks a daemon would. Its argument vector carries the case's marker, so a
 * test can wait for it to end:
 *
 *   verdict-leftover.js <mode> <evaluation folder> <runtime pids, comma-separated> <marker> [report port]
 *
 *   leftover-tamper   once the runtime has exited, rewrite the newest run's
 *                     trial-sets/P-001/record-1.json (its recommendation set to
 *                     FAIL) and the digest run.json recorded for it, as Story
 *                     1.8's round 2 review did; a confined process is refused
 *                     at its first read of runs/ and exits
 *   swap-evaluator    once the run's command evaluator (evaluator/judge.sh)
 *                     has started, move evaluator/impl.js aside to
 *                     impl.orig.js and write a replacement that moves the
 *                     original back and answers a fail row commented
 *                     `swapped bytes ran`; a confined process is refused at
 *                     its first write and exits
 *
 * Either gives up waiting after a minute and attempts anyway. With a report
 * port, it sends one line to the test's listener on 127.0.0.1 once it has
 * attempted, `tamper: <how>` or `swap: <how>`, each `allowed` or `refused
 * <code>` (the swap's with ` (evaluator not seen)` when it gave up waiting): a
 * confined process can write nothing a test could read, and a Seatbelt
 * process keeps the host's network, so the line proves the attempt was made
 * and how it ended (a Bubblewrap process has a network namespace of its own,
 * Story 1.63, and no line arrives). It
 * finds processes with `pgrep`: a process under Seatbelt cannot start the
 * setuid `ps`.
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const [mode, folder, runtimeText, marker, reportPort] = process.argv.slice(2);
const runtimes = runtimeText
  .split(',')
  .map(Number)
  .filter((pid) => Number.isInteger(pid) && pid > 1);
const deadline = Date.now() + 60_000;
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Why an attempt failed, written beside the marker where this process can write, for a case to quote. */
function note(error) {
  try {
    fs.writeFileSync(`${marker}.error`, String(error?.stack ?? error));
  } catch {
    // A confined process writes nothing outside its workspace.
  }
}

/** How an attempt ended: allowed, or refused with the error code. */
function attempt(action) {
  try {
    action();
    return 'allowed';
  } catch (error) {
    note(error);
    return `refused ${error.code ?? error.message}`;
  }
}

/** Sends one line to the test's listener; the process stays alive until the line is written. */
function report(line) {
  const port = Number(reportPort);
  if (!Number.isInteger(port) || port <= 0) return;
  const socket = net.connect(port, '127.0.0.1', () => socket.end(`${line}\n`));
  socket.on('error', () => {});
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

if (mode === 'leftover-tamper') {
  while (runtimes.some(alive) && Date.now() < deadline) pause(50);
  const how = attempt(() => {
    const runs = path.join(folder, 'runs');
    const newest = fs
      .readdirSync(runs)
      .filter((name) => /^\d{8}T/.test(name))
      .sort()
      .at(-1);
    const run = path.join(runs, newest);
    const recordFile = path.join(run, 'trial-sets', 'P-001', 'record-1.json');
    const record = JSON.parse(fs.readFileSync(recordFile, 'utf8'));
    record.evaluatorRecommendation = 'FAIL';
    const bytes = Buffer.from(JSON.stringify(record));
    fs.writeFileSync(recordFile, bytes);
    const runFile = path.join(run, 'run.json');
    const recorded = JSON.parse(fs.readFileSync(runFile, 'utf8'));
    recorded.artifacts.records['trial-sets/P-001/record-1.json'] = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
    fs.writeFileSync(runFile, `${JSON.stringify(recorded, null, 2)}\n`);
  });
  // Refused: the confinement holds this process as it held the target, and keeps it from writing why beside the marker.
  report(`tamper: ${how}`);
}

if (mode === 'swap-evaluator') {
  const wrapper = path.join(folder, 'evaluator', 'judge.sh');
  const impl = path.join(folder, 'evaluator', 'impl.js');
  // The evaluator's command line names it as the runtime spelled the folder (macOS's /var is /private/var).
  const spelled = wrapper.replace(/^\/private(?=\/)/, '').replaceAll(/[.*+?^${}()|[\]\\]/g, (character) => `\\${character}`);
  const started = () => spawnSync('pgrep', ['-f', `(/private)?${spelled}`], { encoding: 'utf8' }).stdout.trim().length > 0;
  let found = started();
  while (!found && Date.now() < deadline) {
    pause(20);
    found = started();
  }
  const seen = found ? '' : ' (evaluator not seen)';
  const replacement = [
    '#!/usr/bin/env node',
    "'use strict';",
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "fs.renameSync(path.join(__dirname, 'impl.orig.js'), path.join(__dirname, 'impl.js'));",
    "const input = JSON.parse(fs.readFileSync(0, 'utf8'));",
    "const judged = input.observations.find((o) => String(o.stdout?.value ?? '').includes('verdict:')) ?? input.observations[0];",
    "const row = { key: 'verdict-accepted', outcome: 'fail', observationIds: [judged.observationId], quote: 'verdict:', quoteChannel: 'stdout', confidence: 0.9, comment: 'swapped bytes ran' };",
    'process.stdout.write(`${JSON.stringify({ rows: [row] })}\\n`);',
    '',
  ].join('\n');
  // Refused: no process of the run can write evaluator/.
  const how = attempt(() => {
    fs.renameSync(impl, path.join(folder, 'evaluator', 'impl.orig.js'));
    fs.writeFileSync(impl, replacement, { mode: 0o755 });
  });
  report(`swap${seen}: ${how}`);
}
