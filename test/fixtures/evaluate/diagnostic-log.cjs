'use strict';

/**
 * A stand-in for `/usr/bin/log` that adds a diagnostic that always arrives, for the case that holds a confined run's refusal of the
 * bridge's private directories (exit 3) to the audit: macOS logs only some of the sandbox's refusals, so the case cannot wait on
 * the kernel's own reports, and the target's own answers (`refused EPERM`) show the kernel's boundary apart from any diagnostic.
 * It runs the real `log stream` the runtime asked for and passes every line on. On the sandbox's own stream (the one whose
 * predicate names the sandbox's token) it also listens on 127.0.0.1, writing its port to the port file: a target that attempted
 * an ungranted read sends the path, and the stand-in writes the kernel's report of that refused read under the token, as the
 * kernel writes one when it logs the refusal, before it answers `ok`. The report is in the stream before the target goes on, so
 * the trial's closing barrier finds it.
 *
 *   diagnostic-log.cjs <port file> <the arguments the runtime gives log stream>
 *
 * The runtime starts this process under its stream guard, in the guard's process group, so the real `log` ends with it.
 */

const fs = require('node:fs');
const net = require('node:net');
const { spawn } = require('node:child_process');

const [portFile, ...given] = process.argv.slice(2);
const token = /eventMessage CONTAINS "(tea-evaluate-audit-[0-9a-f]+)"/.exec(given.join(' '))?.[1] ?? null;
const child = spawn('/usr/bin/log', given, { stdio: ['ignore', 'pipe', 'inherit'] });

/** The log's own timestamp form, in local time to the microsecond. */
function timestamp(now = new Date()) {
  const two = (value) => String(value).padStart(2, '0');
  const offset = -now.getTimezoneOffset();
  const zone = `${offset >= 0 ? '+' : '-'}${two(Math.floor(Math.abs(offset) / 60))}${two(Math.abs(offset) % 60)}`;
  const date = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
  const time = `${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}.${String(now.getMilliseconds()).padStart(3, '0')}000`;
  return `${date} ${time}${zone}`;
}

let carry = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  const lines = (carry + chunk).split('\n');
  carry = lines.pop();
  for (const line of lines) process.stdout.write(`${line}\n`);
});

if (token !== null) {
  const server = net.createServer((socket) => {
    let text = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      text += chunk;
      if (!text.includes('\n')) return;
      const attempted = text.split('\n')[0];
      const event = {
        eventType: 'logEvent',
        processImagePath: '/kernel',
        timestamp: timestamp(),
        eventMessage: `Sandbox: node(1) deny(1) file-read-data ${attempted}\n${token}`,
      };
      process.stdout.write(`${JSON.stringify(event)}\n`);
      socket.end('ok\n');
    });
    socket.on('error', () => {});
  });
  server.listen(0, '127.0.0.1', () => {
    // Renamed into place, so a reader that sees the file sees the whole port.
    fs.writeFileSync(`${portFile}.part`, String(server.address().port));
    fs.renameSync(`${portFile}.part`, portFile);
  });
  server.unref();
}

child.once('exit', (code, signal) => process.exit(code ?? (signal === null ? 1 : 128)));
process.once('SIGTERM', () => child.kill('SIGTERM'));
