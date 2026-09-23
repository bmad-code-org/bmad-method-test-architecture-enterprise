/**
 * Proof that cli/lib/atdd-net-guard.cjs, the in-process half of
 * tea-atdd-red-check's isolation, actually refuses what it claims to.
 *
 * `test/test-atdd-isolation.js` proves the OS backend (seatbelt or bubblewrap)
 * denies network at the process level; nothing before this file ever loaded
 * this preload guard and exercised it directly. `cli/atdd-red-check.js` wires
 * it in through `NODE_OPTIONS=--require=<path>` and that wiring, plus the
 * `TEST_WORKER_INDEX`-gated child-process refusal, had no test at all: this
 * module's own header names two properties the OS backend cannot cover by
 * itself (a resolver round trip over a unix socket on darwin, and a spawn from
 * inside a Playwright worker), and until now nothing proved either held.
 *
 * Each check spawns a fresh `node -e` process with `NODE_OPTIONS` pointed at
 * the guard, because the guard monkey-patches `net`, `dns`, `dgram` and
 * `child_process` at load time: running it in this process would corrupt
 * every later test's own use of those modules.
 *
 * Usage: node test/test-atdd-net-guard.js
 * Exit codes: 0 every property held, 1 a property did not hold
 */

'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const NET_GUARD_PATH = path.join(__dirname, '..', 'cli', 'lib', 'atdd-net-guard.cjs');

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m', dim: '\u001B[2m' };
let failures = 0;

function assert(condition, label, detail) {
  if (condition) {
    console.log(`  ${colors.green}✓${colors.reset} ${label}`);
    return;
  }
  failures += 1;
  console.log(`  ${colors.red}✗ ${label}${colors.reset}`);
  if (detail) console.log(`    ${colors.dim}${detail}${colors.reset}`);
}

/** One script run under the guard, as a fresh process. */
function runGuarded(script, { env = {}, timeoutMs = 10_000 } = {}) {
  return spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    timeout: timeoutMs,
    env: { ...process.env, NODE_OPTIONS: `--require=${NET_GUARD_PATH}`, ...env },
  });
}

function main() {
  console.log('cli/lib/atdd-net-guard.cjs, the in-process half of isolation\n');

  // net.Socket#connect: a non-loopback host is refused, and loopback still works.
  const externalSocket = runGuarded(
    'const s=require("node:net").connect({host:"192.0.2.1",port:80});' +
      's.on("error",(e)=>{console.log("REFUSED",e.code);process.exit(0)});' +
      's.on("connect",()=>{console.log("CONNECTED");process.exit(1)});' +
      's.setTimeout(5000,()=>{console.log("TIMEOUT");process.exit(1)})',
  );
  assert(
    externalSocket.status === 0 && /REFUSED EISOLATED/.test(externalSocket.stdout),
    'net.Socket#connect to a non-loopback host is refused synchronously, not left to the OS layer',
    `stdout ${JSON.stringify(externalSocket.stdout)}`,
  );

  const loopbackSocket = runGuarded(
    'const http=require("node:http");' +
      'const srv=http.createServer((q,r)=>r.end("ok")).listen(0,"127.0.0.1",()=>{' +
      'http.get("http://127.0.0.1:"+srv.address().port+"/",(r)=>{console.log("OK",r.statusCode);srv.close()})' +
      '.on("error",(e)=>{console.log("UNEXPECTED_ERROR",e.code);srv.close();process.exitCode=1})})',
  );
  assert(
    loopbackSocket.status === 0 && /OK 200/.test(loopbackSocket.stdout),
    'net.Socket#connect to loopback still works with the guard loaded',
    `stdout ${JSON.stringify(loopbackSocket.stdout)}`,
  );

  // dns.lookup: refused for a real hostname, allowed for loopback names.
  const externalLookup = runGuarded(
    'require("node:dns").lookup("example.com",(err)=>{console.log(err?("REFUSED "+err.code):"UNEXPECTED_SUCCESS")})',
  );
  assert(
    /REFUSED EISOLATED/.test(externalLookup.stdout),
    'dns.lookup on a non-loopback hostname is refused',
    `stdout ${JSON.stringify(externalLookup.stdout)}`,
  );
  const loopbackLookup = runGuarded(
    'require("node:dns").lookup("localhost",(err,address)=>{console.log(err?("UNEXPECTED_ERROR "+err.message):("OK "+address))})',
  );
  assert(
    loopbackLookup.stdout.trim().startsWith('OK '),
    'dns.lookup on "localhost" still resolves with the guard loaded',
    `stdout ${JSON.stringify(loopbackLookup.stdout)}`,
  );

  // dns.promises.lookup: the promise rejects for a non-loopback hostname.
  const promiseLookup = runGuarded(
    'require("node:dns").promises.lookup("example.com").then(()=>console.log("UNEXPECTED_SUCCESS"),(err)=>console.log("REFUSED",err.code))',
  );
  assert(
    /REFUSED EISOLATED/.test(promiseLookup.stdout),
    'dns.promises.lookup on a non-loopback hostname rejects',
    `stdout ${JSON.stringify(promiseLookup.stdout)}`,
  );

  // One resolver method, refused outright regardless of what it is asked to resolve.
  const resolve4 = runGuarded(
    'require("node:dns").resolve4("localhost",(err)=>{console.log(err?("REFUSED "+err.code):"UNEXPECTED_SUCCESS")})',
  );
  assert(
    /REFUSED EISOLATED/.test(resolve4.stdout),
    'dns.resolve4 is refused unconditionally, even against a loopback name',
    `stdout ${JSON.stringify(resolve4.stdout)}`,
  );

  // dns.lookupService: the reverse of dns.lookup, refused and allowed the same way.
  const externalLookupService = runGuarded(
    'require("node:dns").lookupService("8.8.8.8",80,(err)=>{console.log(err?("REFUSED "+err.code):"UNEXPECTED_SUCCESS")})',
  );
  assert(
    /REFUSED EISOLATED/.test(externalLookupService.stdout),
    'dns.lookupService on a non-loopback address is refused',
    `stdout ${JSON.stringify(externalLookupService.stdout)}`,
  );
  const loopbackLookupService = runGuarded(
    'require("node:dns").lookupService("127.0.0.1",80,(err,hostname)=>{console.log(err?("UNEXPECTED_ERROR "+err.message):("OK "+hostname))})',
  );
  assert(
    loopbackLookupService.stdout.trim().startsWith('OK '),
    'dns.lookupService on a loopback address still resolves with the guard loaded',
    `stdout ${JSON.stringify(loopbackLookupService.stdout)}`,
  );

  // dgram: an explicit non-loopback address on send() is refused.
  const dgramSend = runGuarded(
    'require("node:dgram").createSocket("udp4").send("x",53,"8.8.8.8",(err)=>{console.log(err?("REFUSED "+err.code):"UNEXPECTED_SUCCESS")})',
  );
  assert(
    dgramSend.status === 0 && /REFUSED EISOLATED/.test(dgramSend.stdout),
    'dgram send() naming a non-loopback address is refused',
    `status ${dgramSend.status}, stdout ${JSON.stringify(dgramSend.stdout)}`,
  );

  // dgram: connect() to a non-loopback target is refused before any send.
  const dgramConnect = runGuarded(
    'require("node:dgram").createSocket("udp4").connect(53,"8.8.8.8",(err)=>{console.log(err?("REFUSED "+err.code):"UNEXPECTED_SUCCESS")})',
  );
  assert(
    dgramConnect.status === 0 && /REFUSED EISOLATED/.test(dgramConnect.stdout),
    'dgram connect() to a non-loopback host is refused, closing the send()-with-no-address bypass',
    `status ${dgramConnect.status}, stdout ${JSON.stringify(dgramConnect.stdout)}`,
  );

  // dgram: connect() then send() with no address argument still works on loopback.
  const dgramLoopback = runGuarded(
    'const dgram=require("node:dgram");' +
      'const server=dgram.createSocket("udp4");' +
      'server.on("message",(msg)=>{console.log("OK",msg.toString());server.close()});' +
      'server.bind(0,"127.0.0.1",()=>{' +
      'const port=server.address().port;' +
      'const client=dgram.createSocket("udp4");' +
      'client.connect(port,"127.0.0.1",(err)=>{' +
      'if(err){console.log("UNEXPECTED_CONNECT_ERROR",err.message);return}' +
      'client.send("hi",(err2)=>{if(err2)console.log("UNEXPECTED_SEND_ERROR",err2.message);client.close()})' +
      '})})',
  );
  assert(
    /^OK hi$/m.test(dgramLoopback.stdout),
    'dgram connect() and send() to loopback still deliver the datagram',
    `stdout ${JSON.stringify(dgramLoopback.stdout)}`,
  );

  // child_process: refused only when TEST_WORKER_INDEX marks this as a Playwright worker.
  const spawnInWorker = runGuarded(
    'try{require("node:child_process").spawnSync("true");console.log("UNEXPECTED_SUCCESS")}catch(e){console.log("REFUSED",e.code)}',
    {
      env: { TEST_WORKER_INDEX: '0' },
    },
  );
  assert(
    /REFUSED EISOLATED/.test(spawnInWorker.stdout),
    'spawning a process from what looks like a Playwright worker is refused',
    `stdout ${JSON.stringify(spawnInWorker.stdout)}`,
  );

  const spawnOutsideWorker = runGuarded(
    'const r=require("node:child_process").spawnSync("true");console.log(r.status===0?"OK":"UNEXPECTED_"+r.status)',
  );
  assert(
    /^OK$/m.test(spawnOutsideWorker.stdout),
    'spawning a process outside a Playwright worker is unaffected by the guard',
    `stdout ${JSON.stringify(spawnOutsideWorker.stdout)}`,
  );

  console.log('');
  if (failures > 0) {
    console.log(`${colors.red}${failures} guard propert${failures === 1 ? 'y' : 'ies'} did not hold.${colors.reset}\n`);
    process.exit(1);
  }
  console.log(`${colors.green}every in-process isolation property held.${colors.reset}\n`);
}

main();
