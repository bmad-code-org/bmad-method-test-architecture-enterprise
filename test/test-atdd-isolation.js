/**
 * Proof that tea-atdd-red-check's isolation actually holds, before the atdd
 * suite is allowed to count. NFR9 states the rule this file exists to satisfy:
 * "the isolation is proven before the gate is enabled, not after."
 *
 * Every check here spawns a real process through cli/lib/atdd-isolation.js's
 * sandboxedCommand and observes what a hostile attempt actually does on this
 * machine, never what the code says it should do. No credential, no network
 * call that reaches outside the loopback interface, no model call.
 *
 * WHAT IS PROVEN
 *
 *   network deny     a connection to a real external host is refused, at the
 *                    process level, whether attempted directly or from a
 *                    spawned child. Loopback still works both ways, because the
 *                    fixture server the red-check starts binds to it and the
 *                    generated tests call it.
 *   filesystem deny  a write outside the workspace is refused, directly and
 *                    from a spawned child; a write inside the workspace still
 *                    succeeds.
 *   cpu bound        a process that spins forever is killed inside the
 *                    declared budget rather than running to the wall-clock
 *                    backstop.
 *   credential seal  the workspace HOME carries none of the parent's files, so
 *                    a stored login is not on any path a child derives from
 *                    home.
 *   privilege        the check does not run this file, or anything it spawns,
 *                    as the root user; NFR9 says non-privileged.
 *
 * A backend that cannot run at all on this machine is a hard failure here, not
 * a skip: the executor has no unconfined mode, so a machine that cannot prove
 * isolation cannot run the suite, and reporting that as a pass would be the
 * exact defect NFR9 exists to prevent.
 *
 * Usage: node test/test-atdd-isolation.js
 * Exit codes: 0 every property held, 1 a property did not hold, 2 no backend runs here
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  BACKEND_OVERRIDE_ENV,
  DEFAULT_CPU_SECONDS,
  buildSeatbeltProfile,
  childEnvironment,
  probeBackend,
  sandboxedCommand,
  selectBackend,
} = require('../cli/lib/atdd-isolation');

const colors = { reset: '[0m', red: '[31m', green: '[32m', dim: '[2m' };
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

/** One node -e probe run through the sandbox, with a fresh workspace and profile per call. */
function runSandboxed(workspace, backend, script, { cpuSeconds = DEFAULT_CPU_SECONDS, timeoutMs = 20_000 } = {}) {
  let profilePath;
  if (backend === 'seatbelt') {
    profilePath = path.join(workspace, `profile-${Math.random().toString(36).slice(2)}.sb`);
    fs.writeFileSync(profilePath, buildSeatbeltProfile({ workspace }), 'utf8');
  }
  const vector = sandboxedCommand({ backend, profilePath, workspace, cpuSeconds, command: process.execPath, args: ['-e', script] });
  return spawnSync(vector.command, vector.args, {
    cwd: workspace,
    env: childEnvironment({ path: process.env.PATH, home: workspace }),
    encoding: 'utf8',
    timeout: timeoutMs,
  });
}

function main() {
  console.log('tea-atdd-red-check isolation, proven before the suite is enabled\n');

  let backend;
  try {
    backend = selectBackend();
  } catch (error) {
    console.error(`${colors.red}no isolation backend runs here: ${error.message}${colors.reset}`);
    console.error(
      `${colors.dim}there is no unconfined mode; override with ${BACKEND_OVERRIDE_ENV} only to force a specific backend on a platform that has it${colors.reset}`,
    );
    process.exit(2);
  }
  console.log(`backend: ${colors.dim}${backend}${colors.reset}\n`);

  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-atdd-isolation-'));
  try {
    const preflight = probeBackend({ backend, workspace });
    assert(preflight.ok, 'a trivial process runs under the backend', preflight.ok ? '' : preflight.reason);
    if (!preflight.ok) {
      console.error(
        `\n${colors.red}the backend does not actually run a process on this machine; nothing else can be proven${colors.reset}`,
      );
      process.exit(2);
    }

    assert(process.getuid ? process.getuid() !== 0 : true, 'this check does not run as root', 'NFR9 requires a non-privileged workspace');

    // Network: a real external host, denied.
    const externalConnect = runSandboxed(
      workspace,
      backend,
      'const s=require("node:net").connect({host:"93.184.216.34",port:80});' +
        's.setTimeout(5000,()=>{console.log("TIMEOUT");s.destroy();process.exit(1)});' +
        's.on("error",(e)=>{console.log("ERROR",e.code);process.exit(0)});' +
        's.on("connect",()=>{console.log("CONNECTED");s.destroy();process.exit(1)})',
    );
    assert(
      externalConnect.status === 0 && /ERROR/.test(externalConnect.stdout),
      'a connection to a real external host is refused',
      `status ${externalConnect.status}, stdout ${JSON.stringify(externalConnect.stdout)}, stderr ${JSON.stringify(externalConnect.stderr)}`,
    );

    // Network: a spawned child's connection attempt, denied the same way.
    const childConnect = runSandboxed(
      workspace,
      backend,
      'const cp=require("node:child_process");' +
        String.raw`const r=cp.spawnSync(process.execPath,["-e","require(\"node:net\").connect({host:\"93.184.216.34\",port:80}).on(\"error\",()=>process.exit(9)).on(\"connect\",()=>process.exit(0))"]);` +
        'console.log("CHILD_STATUS",r.status)',
    );
    assert(
      childConnect.status === 0 && /CHILD_STATUS 9/.test(childConnect.stdout),
      'a spawned child cannot reach an external host either',
      `status ${childConnect.status}, stdout ${JSON.stringify(childConnect.stdout)}`,
    );

    // Network: loopback still works, both binding and connecting, because the
    // fixture server the executor starts needs exactly this.
    const loopback = runSandboxed(
      workspace,
      backend,
      'const http=require("node:http");' +
        'const srv=http.createServer((q,r)=>r.end("ok")).listen(0,"127.0.0.1",()=>{' +
        'http.get("http://127.0.0.1:"+srv.address().port+"/",(r)=>{console.log("LOOPBACK",r.statusCode);srv.close()})' +
        '.on("error",(e)=>{console.log("LOOPBACK_ERROR",e.code);srv.close();process.exitCode=1})})',
    );
    assert(
      loopback.status === 0 && /LOOPBACK 200/.test(loopback.stdout),
      'loopback bind and connect still work',
      `status ${loopback.status}, stdout ${JSON.stringify(loopback.stdout)}, stderr ${JSON.stringify(loopback.stderr)}`,
    );

    // Filesystem: a write outside the workspace, denied.
    const outsideWrite = runSandboxed(
      workspace,
      backend,
      `try{require("node:fs").writeFileSync(${JSON.stringify(path.join(os.tmpdir(), 'tea-atdd-isolation-escape.txt'))},"x");console.log("WROTE")}catch(e){console.log("BLOCKED",e.code)}`,
    );
    const escapePath = path.join(os.tmpdir(), 'tea-atdd-isolation-escape.txt');
    const escapeLeaked = fs.existsSync(escapePath);
    if (escapeLeaked) fs.rmSync(escapePath, { force: true });
    assert(
      /BLOCKED/.test(outsideWrite.stdout) && !escapeLeaked,
      'a write outside the workspace is refused',
      `stdout ${JSON.stringify(outsideWrite.stdout)}, leaked file present: ${escapeLeaked}`,
    );

    // Filesystem: a spawned child's write outside the workspace, denied the same way.
    const childOutsidePath = path.join(os.tmpdir(), 'tea-atdd-isolation-escape-child.txt');
    const childWrite = runSandboxed(
      workspace,
      backend,
      `const cp=require("node:child_process");` +
        `const r=cp.spawnSync("sh",["-c","echo x > ${childOutsidePath}"]);` +
        `console.log("CHILD_WRITE_STATUS",r.status)`,
    );
    const childEscapeLeaked = fs.existsSync(childOutsidePath);
    if (childEscapeLeaked) fs.rmSync(childOutsidePath, { force: true });
    assert(
      childWrite.status === 0 && !/CHILD_WRITE_STATUS 0/.test(childWrite.stdout) && !childEscapeLeaked,
      'a spawned child cannot write outside the workspace either',
      `stdout ${JSON.stringify(childWrite.stdout)}, leaked file present: ${childEscapeLeaked}`,
    );

    // Filesystem: a write inside the workspace still works, because the
    // executor's own report and the activated test files have to land there.
    const insideWrite = runSandboxed(
      workspace,
      backend,
      'require("node:fs").writeFileSync("inside-ok.txt","x");console.log("WROTE_INSIDE")',
    );
    assert(
      insideWrite.status === 0 && /WROTE_INSIDE/.test(insideWrite.stdout) && fs.existsSync(path.join(workspace, 'inside-ok.txt')),
      'a write inside the workspace still succeeds',
      `status ${insideWrite.status}, stdout ${JSON.stringify(insideWrite.stdout)}`,
    );

    // CPU: a busy loop dies inside its declared budget rather than running out
    // the wall clock. Two seconds is the budget; thirty is what an unbounded
    // loop would otherwise spend, and the check fails if the process is still
    // running anywhere near that.
    const busyStarted = Date.now();
    const busy = runSandboxed(workspace, backend, 'const until=Date.now()+30000; while(Date.now()<until){} console.log("FINISHED")', {
      cpuSeconds: 2,
      timeoutMs: 20_000,
    });
    const busyElapsed = Date.now() - busyStarted;
    assert(
      !/FINISHED/.test(busy.stdout ?? '') && busyElapsed < 15_000,
      'a busy loop is killed inside its CPU budget, not waited out',
      `elapsed ${busyElapsed}ms, status ${busy.status}, signal ${busy.signal}, stdout ${JSON.stringify(busy.stdout)}`,
    );

    // Credential seal: the sandboxed HOME carries none of the real one's files.
    const realHomeMarker = path.join(os.homedir(), '.tea-atdd-isolation-marker-should-not-be-visible');
    fs.writeFileSync(realHomeMarker, 'if a sandboxed run can read this, HOME leaked');
    try {
      const homeProbe = runSandboxed(
        workspace,
        backend,
        `console.log("HOME_IS",process.env.HOME);console.log("SEES_MARKER",require("node:fs").existsSync(require("node:path").join(process.env.HOME,".tea-atdd-isolation-marker-should-not-be-visible")))`,
      );
      assert(
        homeProbe.status === 0 &&
          /HOME_IS/.test(homeProbe.stdout) &&
          !homeProbe.stdout.includes(os.homedir()) &&
          /SEES_MARKER\s*false/.test(homeProbe.stdout),
        'the sandboxed HOME is the workspace, not the real one, and carries none of its files',
        `stdout ${JSON.stringify(homeProbe.stdout)}`,
      );
    } finally {
      fs.rmSync(realHomeMarker, { force: true });
    }
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }

  console.log('');
  if (failures > 0) {
    console.log(`${colors.red}${failures} isolation propert${failures === 1 ? 'y' : 'ies'} did not hold.${colors.reset}\n`);
    process.exit(1);
  }
  console.log(`${colors.green}every isolation property held on this machine.${colors.reset}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { runSandboxed };
