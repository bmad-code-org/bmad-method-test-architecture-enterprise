'use strict';

/**
 * A stand-in for `/usr/bin/log` that loses reports, for Story 1.81's cases: the kernel's log loses reports without a trace
 * when the host is saturated, and no case can saturate a shared host on demand. It runs the real `log stream` the runtime asked
 * for and passes on every line but each Nth, so the file the runtime reads is short of the reports the kernel made, as it is
 * on a saturated host. With `canaries` for `<N>`, it passes on every line but the audit's own allowed canary reads: every trial
 * report and every sentinel arrives, so the audit confirms itself and misses no read of the trial, and every canary is lost.
 *
 *   lossy-log.cjs <N | canaries> <pid directory> <the arguments the runtime gives log stream>
 *
 * The runtime ends the stream by killing its guard's process group, which holds this stub and the real `log` it starts. A case
 * killed outright before then would leave the real `log` running to its timeout, so the stub shortens the timeout to a minute and
 * writes the real `log`'s process id into the pid directory, where the case ends it.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const [every, pidDirectory, ...given] = process.argv.slice(2);
if (every !== 'canaries' && !(Number(every) >= 2)) throw new Error(`lossy-log.cjs: <N> is canaries or a number of at least 2, not ${JSON.stringify(every)}`);
/** An allowed read of an audit canary, as the kernel reports it under the sandbox's token. */
const CANARY = /\) allow file-read-data \S*\/canary-\d+\\n/;
// The argument after `--timeout`, whatever the runtime sets it to, becomes a minute.
const args = given.map((argument, index) => (given[index - 1] === '--timeout' ? '60s' : argument));
const child = spawn('/usr/bin/log', args, { stdio: ['ignore', 'pipe', 'inherit'] });
try {
  fs.writeFileSync(path.join(pidDirectory, `log-${child.pid}`), `${child.pid}\n`);
} catch (error) {
  child.kill('SIGKILL');
  throw error;
}

// The runtime's report meter streams every sandbox report on the host, not the sandbox's own token; it loses nothing here, since
// a pattern of losses that other traffic on a shared host can keep in step with the sandbox's own reads is no loss of the kernel's.
const meter = given.some((argument) => argument.includes('Sandbox: "'));
let carry = '';
let seen = 0;
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  const lines = (carry + chunk).split('\n');
  carry = lines.pop();
  for (const line of lines) {
    seen += 1;
    const lose = every === 'canaries' ? CANARY.test(line) : seen % Number(every) === 0;
    if (meter || !lose) process.stdout.write(`${line}\n`);
  }
});
child.once('exit', (code, signal) => process.exit(code ?? (signal === null ? 1 : 128)));
process.once('SIGTERM', () => child.kill('SIGTERM'));
