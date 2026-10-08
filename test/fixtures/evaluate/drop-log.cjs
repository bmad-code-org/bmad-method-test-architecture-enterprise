'use strict';

/**
 * A stand-in for `/usr/bin/log` that drops one kind of report and floods the report meter, for the case that a report the kernel's
 * log dropped between two canaries is not recorded as a complete audit: the kernel drops reports that arrive faster than its log
 * keeps them, without a trace and with every canary delivered, and no case can overload a shared host on demand. It runs the real
 * `log stream` the runtime asked for. The stream of the sandbox's own token loses every line that holds `<dropped text>`; the
 * runtime's report meter (the stream of every sandbox report on the host) first gets `<flood>` reports in the same microsecond, as
 * a host that logged them that fast would give.
 *
 *   drop-log.cjs <dropped text> <flood> <pid directory> <the arguments the runtime gives log stream>
 *
 * The runtime ends the stream with SIGKILL, which no handler can answer, so the real `log` it started would run on until its
 * timeout; the stub shortens the timeout to a minute and writes the real `log`'s process id into the pid directory, where the
 * case ends it.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const [dropped, flood, pidDirectory, ...given] = process.argv.slice(2);
const args = given.map((argument, index) => (given[index - 1] === '--timeout' ? '60s' : argument));
const meter = given.some((argument) => argument.includes('Sandbox: "'));
const child = spawn('/usr/bin/log', args, { stdio: ['ignore', 'pipe', 'inherit'] });
fs.writeFileSync(path.join(pidDirectory, `log-${child.pid}`), `${child.pid}\n`);

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
  for (const line of lines) if (meter || !line.includes(dropped)) process.stdout.write(`${line}\n`);
});
child.once('exit', (code, signal) => process.exit(code ?? (signal === null ? 1 : 128)));
process.once('SIGTERM', () => child.kill('SIGTERM'));
