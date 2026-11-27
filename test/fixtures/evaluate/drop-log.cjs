'use strict';

/**
 * A stand-in for `/usr/bin/log` that drops one kind of report and floods the report meter, for the case that a report the kernel's
 * log dropped between two canaries is not recorded as a complete audit: the kernel drops reports that arrive faster than its log
 * keeps them, without a trace and with every canary delivered, and no case can overload a shared host on demand. It runs the real
 * `log stream` the runtime asked for. With `<reader>` `sandbox`, the stream of the sandbox's own token loses every line that holds
 * `<dropped text>` and the runtime's report meter (the stream of every sandbox report on the host) keeps it, as one reader losing a
 * report the log kept would give; with `every`, both streams lose it, as a report the kernel dropped at its source would give. The
 * report meter first gets `<flood>` reports in the same microsecond, as a host that logged them that fast would give.
 *
 *   drop-log.cjs <dropped text> <flood> <reader> <pid directory> <the arguments the runtime gives log stream>
 *
 * The runtime ends the stream by killing its guard's process group, which holds this stub and the real `log` it starts. A case
 * killed outright before then would leave the real `log` running to its timeout, so the stub shortens the timeout to a minute and
 * writes the real `log`'s process id into the pid directory, where the case ends it.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const [dropped, flood, reader, pidDirectory, ...given] = process.argv.slice(2);
if (reader !== 'sandbox' && reader !== 'every') throw new Error(`drop-log.cjs: <reader> is sandbox or every, not ${JSON.stringify(reader)}`);
const args = given.map((argument, index) => (given[index - 1] === '--timeout' ? '60s' : argument));
const meter = given.some((argument) => argument.includes('Sandbox: "'));
const child = spawn('/usr/bin/log', args, { stdio: ['ignore', 'pipe', 'inherit'] });
try {
  fs.writeFileSync(path.join(pidDirectory, `log-${child.pid}`), `${child.pid}\n`);
} catch (error) {
  child.kill('SIGKILL');
  throw error;
}

if (meter) {
  const line = JSON.stringify({
    eventType: 'logEvent',
    timestamp: '2026-10-07 12:00:00.000500-0500',
    eventMessage: 'Sandbox: flood(1) allow file-read-data /flood\nflood',
  });
  for (let count = 0; count < Number(flood); count += 1) process.stdout.write(`${line}\n`);
}

let carry = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  const lines = (carry + chunk).split('\n');
  carry = lines.pop();
  for (const line of lines) if ((meter && reader === 'sandbox') || !line.includes(dropped)) process.stdout.write(`${line}\n`);
});
child.once('exit', (code, signal) => process.exit(code ?? (signal === null ? 1 : 128)));
process.once('SIGTERM', () => child.kill('SIGTERM'));
