'use strict';

/**
 * A stand-in for `/usr/bin/log` that drops one kind of report and floods the report meter, for the case that a report the kernel's
 * log dropped between two canaries is not recorded as a complete audit: the kernel drops reports that arrive faster than its log
 * keeps them, without a trace and with every canary delivered, and no case can overload a shared host on demand. It runs the real
 * `log stream` the runtime asked for. With `<reader>` `sandbox`, the stream of the sandbox's own token loses every line that holds
 * `<dropped text>` and the runtime's report meter (the stream of every sandbox report on the host) keeps it, as one reader losing a
 * report the log kept would give. macOS logs only some refusals, so a trial's own may never reach the log; the meter then also
 * gets one it is sure to hold: after each allowed read of an audit token it delivers (macOS logs allowed reads reliably, the
 * audit's final sentinel among them), a refused read of `KNOWN_DENIAL` with that token and timestamp, a read of the trial the
 * sandbox's stream never delivers. With `every`, both streams lose the lines, as a report the kernel dropped at its source would
 * give, and nothing is added. The report meter first gets `<flood>` reports in the same microsecond, as a host that logged them
 * that fast would give.
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

const READERS = ['sandbox', 'every'];
/** The path of the refused read only the meter delivers under `sandbox`; outside every audit directory, so a read of the trial. */
const KNOWN_DENIAL = '/drop-log/meter-only-denial';
const AUDIT_TOKEN = /\n(tea-evaluate-audit-[0-9a-f]+)$/;

const [dropped, flood, reader, pidDirectory, ...given] = process.argv.slice(2);
if (!READERS.includes(reader)) throw new Error(`drop-log.cjs: <reader> is one of ${READERS.join(', ')}, not ${JSON.stringify(reader)}`);
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
  for (const line of lines) {
    if ((meter && reader === 'sandbox') || !line.includes(dropped)) process.stdout.write(`${line}\n`);
    if (meter && reader === 'sandbox') {
      const known = knownDenial(line);
      if (known !== null) process.stdout.write(`${known}\n`);
    }
  }
});

/** The refused read of `KNOWN_DENIAL` that follows `line`, an allowed read of an audit token, or `null` for any other line. */
function knownDenial(line) {
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    return null;
  }
  const token = typeof event?.eventMessage === 'string' ? AUDIT_TOKEN.exec(event.eventMessage)?.[1] : undefined;
  if (token === undefined || !/\) allow file-read-data /.test(event.eventMessage)) return null;
  return JSON.stringify({ ...event, eventMessage: `Sandbox: drop-log(1) deny(1) file-read-data ${KNOWN_DENIAL}\n${token}` });
}

child.once('exit', (code, signal) => process.exit(code ?? (signal === null ? 1 : 128)));
process.once('SIGTERM', () => child.kill('SIGTERM'));
