/**
 * Proof that the install-time isolation Story 6.9's suite runs under actually
 * holds, before the suite is registered as covering `bmad-testarch-framework`.
 * House style of `test/test-atdd-isolation.js`: every check spawns a real
 * process and observes what a hostile attempt actually does on this machine,
 * never what the code says it should do.
 *
 * THREE PROPERTIES THE SPEC NAMES, EACH PROVEN DIRECTLY AND THROUGH A SPAWNED CHILD
 *
 *   sandbox denies direct   a real connection attempt to a non-allowlisted
 *                            host, made straight from inside the sandboxed
 *                            process with no proxy involved at all, is
 *                            refused by cli/lib/atdd-isolation.js's own
 *                            network-deny -- the same property
 *                            test/test-atdd-isolation.js already proves for
 *                            tea-atdd-red-check, reproven here because this
 *                            suite registers its own coverage independently.
 *   proxy refuses non-npm   a CONNECT sent through
 *                            test/lib/framework-scaffold-install-isolation.js
 *                            for a host other than registry.npmjs.org is
 *                            refused by the proxy itself (403), even though
 *                            the sandbox happily lets the sandboxed process
 *                            reach the proxy at all, because the proxy is on
 *                            loopback.
 *   loopback still works     the stub server
 *                            (test/lib/framework-scaffold-stub-server.js),
 *                            bound to loopback, is still reachable from
 *                            inside the sandbox with no proxy involved.
 *
 * PLUS ONE POSITIVE CONTROL, ADDED HERE SO THE DENIAL ABOVE MEANS SOMETHING
 *
 * A proxy that refuses every CONNECT it ever receives would pass the
 * "proxy refuses non-npm" check above vacuously. A real allow decision is
 * proven with a second proxy instance, started through the exact same
 * startProxyProcess() the live harness uses, with its allowlist target
 * substituted to the stub server's own loopback address instead of the real
 * registry (`ALLOWED_HOST`/`ALLOWED_PORT` env overrides
 * test/lib/framework-scaffold-install-isolation.js reads only for this
 * reason; the live harness never sets them, so production always allows
 * exactly `registry.npmjs.org:443`). A static assertion right beside it
 * checks that real default directly. Substituting the target is what keeps
 * this whole file reachable with no external network at all, so it can run
 * in `npm test`'s local, offline-safe chain the same way
 * test/test-atdd-isolation.js does.
 *
 * A backend that cannot run at all on this machine is a hard failure here,
 * not a skip, matching test/test-atdd-isolation.js's own rule: a machine
 * that cannot prove isolation cannot run the suite.
 *
 * Usage: node test/test-framework-scaffold-install-isolation.js
 * Exit codes: 0 every property held, 1 a property did not hold, 2 no backend runs here
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  buildSeatbeltProfile,
  childEnvironment,
  ensureLoopbackOnlyEgress,
  prepareWorkspaceOwnership,
  probeBackend,
  restoreWorkspaceOwnership,
  sandboxedCommand,
  selectBackend,
  DEFAULT_CPU_SECONDS,
} = require('../cli/lib/atdd-isolation');
const { startProxyProcess, startStubServerProcess } = require('./eval-framework-scaffold');
const { ALLOWED_HOST, ALLOWED_PORT } = require('./lib/framework-scaffold-install-isolation');

const colors = { reset: '[0m', red: '[31m', green: '[32m', dim: '[2m' };
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

/**
 * One `node -e` probe run through the sandbox, with a fresh profile per call.
 * `allowHostLoopback: true` matches the live harness exactly: every property
 * below is about reaching a host-side loopback process, which is the one
 * capability `--unshare-net` alone does not give bubblewrap. Ownership is
 * toggled around exactly this call and given back before it returns, the same
 * discipline `test/eval-framework-scaffold.js`'s own `runSandboxed` holds to.
 */
function runSandboxed(workspace, backend, script, { timeoutMs = 20_000 } = {}) {
  let profilePath;
  if (backend === 'seatbelt') {
    profilePath = path.join(workspace, `profile-${Math.random().toString(36).slice(2)}.sb`);
    fs.writeFileSync(profilePath, buildSeatbeltProfile({ workspace }), 'utf8');
  }
  const env = childEnvironment({ path: process.env.PATH, home: workspace });
  const vector = sandboxedCommand({
    backend,
    profilePath,
    workspace,
    cpuSeconds: DEFAULT_CPU_SECONDS,
    command: process.execPath,
    args: ['-e', script],
    allowHostLoopback: true,
    env,
  });
  prepareWorkspaceOwnership(workspace);
  try {
    // Bubblewrap's own `--chdir` (baked into `vector.args`) does this for the
    // bwrap case, after setpriv already owns `workspace`; this call's own uid
    // cannot chdir into it once ownership is handed away. See the matching
    // comment in test/eval-framework-scaffold.js's own `runSandboxed`.
    return spawnSync(vector.command, vector.args, {
      cwd: backend === 'seatbelt' ? workspace : undefined,
      env,
      encoding: 'utf8',
      timeout: timeoutMs,
    });
  } finally {
    restoreWorkspaceOwnership(workspace);
  }
}

/**
 * A script that attempts a raw CONNECT for `targetHost:targetPort` through the
 * proxy at `proxyPort`, printing PROXY_ALLOWED_200 / PROXY_REFUSED_403 / ERROR.
 * Neither success token is a substring of the other's failure text (unlike an
 * earlier version of this file, which printed bare "REFUSED" -- a string
 * `ECONNREFUSED` also contains, so a connection that never reached the proxy
 * at all satisfied the same regex a real 403 would have. Caught live: every
 * property below silently passed that way on bubblewrap before this file's
 * own `allowHostLoopback` fix, reporting success for the wrong reason).
 */
function connectThroughProxyScript({ proxyPort, targetHost, targetPort }) {
  return (
    'const net=require("node:net");' +
    `const s=net.connect(${JSON.stringify(proxyPort)},"127.0.0.1",()=>{` +
    `s.write("CONNECT ${targetHost}:${targetPort} HTTP/1.1\\r\\nHost: ${targetHost}:${targetPort}\\r\\n\\r\\n")});` +
    's.setTimeout(8000,()=>{console.log("TIMEOUT");s.destroy();process.exit(1)});' +
    'let buf="";' +
    's.on("data",(d)=>{buf+=d.toString();' +
    'if(buf.includes("200 Connection Established")){console.log("PROXY_ALLOWED_200");s.destroy();process.exit(0)}' +
    'if(buf.includes("403")){console.log("PROXY_REFUSED_403");s.destroy();process.exit(0)}});' +
    's.on("error",(e)=>{console.log("ERROR",e.code);process.exit(0)});' +
    's.on("close",()=>{if(!buf)console.log("CLOSED_NO_RESPONSE")})'
  );
}

/** A script that spawns a grandchild running the same probe, printing the grandchild's stdout prefixed with CHILD_. */
function viaSpawnedChild(script) {
  return (
    'const cp=require("node:child_process");' +
    `const r=cp.spawnSync(process.execPath,["-e",${JSON.stringify(script)}],{encoding:"utf8",timeout:15000});` +
    'process.stdout.write("CHILD_STDOUT:"+ (r.stdout||"") + " CHILD_STATUS:"+r.status)'
  );
}

async function main() {
  console.log("framework-scaffold's own install-time isolation, proven before the suite is enabled\n");

  let backend;
  try {
    backend = selectBackend();
  } catch (error) {
    console.error(`${colors.red}no isolation backend runs here: ${error.message}${colors.reset}`);
    process.exit(2);
  }
  console.log(`backend: ${colors.dim}${backend}${colors.reset}\n`);

  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-framework-scaffold-isolation-'));
  let proxy;
  let stub;
  try {
    // Idempotent and a no-op on darwin; must run before the first allowHostLoopback call below.
    ensureLoopbackOnlyEgress();
    const preflight = probeBackend({ backend, workspace });
    assert(preflight.ok, 'a trivial process runs under the backend', preflight.ok ? '' : preflight.reason);
    if (!preflight.ok) {
      console.error(
        `\n${colors.red}the backend does not actually run a process on this machine; nothing else can be proven${colors.reset}`,
      );
      process.exit(2);
    }

    proxy = await startProxyProcess();
    stub = await startStubServerProcess();
    console.log(`${colors.dim}proxy on 127.0.0.1:${proxy.port}, stub on 127.0.0.1:${stub.port}${colors.reset}\n`);

    // The real target the live harness's proxy allows, checked statically:
    // this is what makes the positive control below (which substitutes the
    // stub's own loopback address so the whole file stays network-free) a
    // proof about the same code the live default actually runs, not a
    // proof about some other configuration entirely.
    assert(
      ALLOWED_HOST === 'registry.npmjs.org' && ALLOWED_PORT === 443,
      "the proxy's default allowlist target is registry.npmjs.org:443, the one host npm install needs",
      `ALLOWED_HOST=${ALLOWED_HOST}, ALLOWED_PORT=${ALLOWED_PORT}`,
    );

    // Property 1: the sandbox itself denies a direct, non-proxied attempt to
    // reach a non-loopback host. RFC 5737's documentation-only address, the
    // same target test/test-atdd-isolation.js uses, so this proves the
    // sandbox refuses the attempt itself rather than depending on a real
    // third party staying up.
    const directDenyScript =
      'const s=require("node:net").connect({host:"192.0.2.1",port:443});' +
      's.setTimeout(5000,()=>{console.log("TIMEOUT");s.destroy();process.exit(1)});' +
      's.on("error",(e)=>{console.log("ERROR",e.code);process.exit(0)});' +
      's.on("connect",()=>{console.log("CONNECTED");s.destroy();process.exit(1)})';
    const directDeny = runSandboxed(workspace, backend, directDenyScript);
    assert(
      directDeny.status === 0 && /ERROR/.test(directDeny.stdout),
      'a non-allowlisted host is refused directly from inside the sandbox, no proxy involved',
      `status ${directDeny.status}, stdout ${JSON.stringify(directDeny.stdout)}`,
    );
    const directDenyChild = runSandboxed(workspace, backend, viaSpawnedChild(directDenyScript));
    assert(
      directDenyChild.status === 0 && /CHILD_STDOUT:ERROR/.test(directDenyChild.stdout) && /CHILD_STATUS:0/.test(directDenyChild.stdout),
      'a spawned child inside the sandbox is refused the same way',
      `stdout ${JSON.stringify(directDenyChild.stdout)}`,
    );

    // Property 2: the proxy itself refuses a CONNECT for a host other than
    // registry.npmjs.org, even though the sandbox lets the sandboxed process
    // reach the proxy at all (loopback is always allowed).
    const proxyDenyScript = connectThroughProxyScript({ proxyPort: proxy.port, targetHost: 'example.com', targetPort: 443 });
    const proxyDeny = runSandboxed(workspace, backend, proxyDenyScript);
    assert(
      proxyDeny.status === 0 && /PROXY_REFUSED_403/.test(proxyDeny.stdout),
      'a CONNECT for a non-allowlisted host is refused by the proxy',
      `status ${proxyDeny.status}, stdout ${JSON.stringify(proxyDeny.stdout)}`,
    );
    const proxyDenyChild = runSandboxed(workspace, backend, viaSpawnedChild(proxyDenyScript));
    assert(
      proxyDenyChild.status === 0 && /CHILD_STDOUT:PROXY_REFUSED_403/.test(proxyDenyChild.stdout),
      'a spawned child going through the proxy is refused the same way',
      `stdout ${JSON.stringify(proxyDenyChild.stdout)}`,
    );

    // Property 2b (positive control): the proxy allows the one host it is
    // configured to allow, so property 2's refusal is a real allowlist
    // decision and not the proxy refusing everything indiscriminately. This
    // runs against a second proxy instance, configured (through the same
    // constructor the live harness uses, with its allowlist target
    // substituted) to allow the stub server's own loopback address rather
    // than the real registry, so the whole isolation proof stays reachable
    // with no external network at all and can run in `npm test`'s local,
    // offline-safe chain the same way test/test-atdd-isolation.js does. The
    // assertion just above is what ties this back to the real default.
    const controlProxy = await startProxyProcess({ allowedHost: '127.0.0.1', allowedPort: stub.port });
    try {
      const proxyAllowScript = connectThroughProxyScript({ proxyPort: controlProxy.port, targetHost: '127.0.0.1', targetPort: stub.port });
      const proxyAllow = runSandboxed(workspace, backend, proxyAllowScript, { timeoutMs: 20_000 });
      assert(
        proxyAllow.status === 0 && /PROXY_ALLOWED_200/.test(proxyAllow.stdout),
        "a CONNECT for the proxy's own configured allow-target succeeds (positive control, run against a loopback substitute so this file needs no external network)",
        `status ${proxyAllow.status}, stdout ${JSON.stringify(proxyAllow.stdout)}, stderr ${JSON.stringify(proxyAllow.stderr)}`,
      );
    } finally {
      await controlProxy.stop();
    }

    // Property 3: loopback -- the stub server -- still works, with no proxy involved.
    const loopbackScript =
      'const http=require("node:http");' +
      `http.get({host:"127.0.0.1",port:${stub.port},path:"/health"},(r)=>{console.log("LOOPBACK",r.statusCode);r.resume()})` +
      '.on("error",(e)=>{console.log("LOOPBACK_ERROR",e.code);process.exitCode=1})';
    const loopback = runSandboxed(workspace, backend, loopbackScript);
    assert(
      loopback.status === 0 && /LOOPBACK 200/.test(loopback.stdout),
      'the stub server on loopback is still reachable from inside the sandbox',
      `status ${loopback.status}, stdout ${JSON.stringify(loopback.stdout)}, stderr ${JSON.stringify(loopback.stderr)}`,
    );
    const loopbackChild = runSandboxed(workspace, backend, viaSpawnedChild(loopbackScript));
    assert(
      loopbackChild.status === 0 && /CHILD_STDOUT:LOOPBACK 200/.test(loopbackChild.stdout),
      'a spawned child inside the sandbox can reach loopback the same way',
      `stdout ${JSON.stringify(loopbackChild.stdout)}`,
    );
  } finally {
    if (proxy) await proxy.stop();
    if (stub) await stub.stop();
    fs.rmSync(workspace, { recursive: true, force: true });
  }

  console.log('');
  if (failures > 0) {
    console.log(`${colors.red}${failures} isolation propert${failures === 1 ? 'y' : 'ies'} did not hold.${colors.reset}\n`);
    process.exit(1);
  }
  console.log(`${colors.green}every install-time isolation property held on this machine.${colors.reset}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`${colors.red}${error?.stack ?? error}${colors.reset}`);
    process.exit(1);
  });
}

module.exports = { runSandboxed };
