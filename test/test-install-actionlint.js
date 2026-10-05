/**
 * `tools/install-actionlint.sh` against a stub server on 127.0.0.1.
 *
 * Both workflows install actionlint through that script.
 * A GitHub outage answers the release download with an error page.
 * The pinned download script hands that page to `tar` (it has no `-f` and no retry), so one 503 window failed a whole shard before any test ran.
 * These cases run the script the workflows run, with its base URLs pointed at a stub.
 * They hold each way the download can go wrong: a 5xx status, an HTML body, a truncated body, a cut connection, a wrong checksum, a missing checksum file, the latest-version resolution and the pinned script's own digest.
 *
 * The stub serves a stand-in for the pinned download script.
 * The stand-in keeps the real script's contract for the part the installer wraps.
 * It downloads with `curl -L "$url" | tar xvz -C "$target_dir" actionlint` under `set -e -o pipefail` and then runs `"$exe" -version`.
 * Its `tar` is the real one, so a page that reached it would show as `gzip: stdin: not in gzip format`.
 * It also makes one other `curl` call, which the installer's curl has to pass to the real one.
 *
 * Skipped with the reason named when bash, curl, gzip or tar is missing.
 * A flaky case gets one rerun, and the first run's failures are printed as a warning.
 *
 * Usage: node test/test-install-actionlint.js
 */

'use strict';

const { execFileSync, spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const PROJECT_ROOT = path.join(__dirname, '..');
const INSTALLER = path.join(PROJECT_ROOT, 'tools', 'install-actionlint.sh');

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m', dim: '\u001B[2m' };

const VERSION = '9.9.9';

/** The real download script's contract for the call the installer wraps; the URL comes from the stub's base. */
const STAND_IN = `#!/bin/bash
set -e -o pipefail
version="$1"
target_dir="$2"
case "$OSTYPE" in
    linux-*) os=linux ;;
    darwin*) os=darwin ;;
    *) echo "unsupported OS" >&2; exit 1 ;;
esac
case "$(uname -m)" in
    x86_64) arch=amd64 ;;
    aarch64|arm64) arch=arm64 ;;
    *) echo "unsupported arch" >&2; exit 1 ;;
esac
file="actionlint_\${version}_\${os}_\${arch}.tar.gz"
url="\${INSTALL_ACTIONLINT_RELEASES_BASE}/download/v\${version}/\${file}"
echo "Start downloading actionlint v\${version} to \${target_dir}"
echo "Downloading \${url} with curl"
curl -sS "\${INSTALL_ACTIONLINT_RELEASES_BASE}/ping" >/dev/null
curl -L "\${url}" | tar xvz -C "$target_dir" actionlint
exe="$target_dir/actionlint"
echo "Done: $("\${exe}" -version)"
`;

function digest(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function missingTool() {
  for (const tool of ['bash', 'curl', 'gzip', 'tar']) {
    try {
      execFileSync('sh', ['-c', `command -v ${tool}`], { stdio: 'ignore' });
    } catch {
      return tool;
    }
  }
  return null;
}

/** A gzip tarball holding an executable `actionlint` that prints the version, padded so a cut leaves a gzip header. */
function makeTarball(scratch, version) {
  const source = path.join(scratch, `tarball-${version}`);
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'actionlint'), `#!/bin/sh\necho ${version}\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(source, 'padding.bin'), crypto.randomBytes(8192));
  const file = path.join(scratch, `tarball-${version}.tar.gz`);
  execFileSync('tar', ['-czf', file, '-C', source, 'actionlint', 'padding.bin']);
  return fs.readFileSync(file);
}

const HTML_PAGE = Buffer.from('<html><body><h1>503 Service Unavailable</h1></body></html>');

/**
 * A stub of the raw script host and the releases host. `plan` decides each answer; every request is
 * logged by kind, so a case can count the attempts the installer made.
 */
function startStub(plan) {
  const requests = [];
  const server = http.createServer((request, response) => {
    const url = request.url;
    let kind = 'other';
    let count = 0;
    if (url.endsWith('/scripts/download-actionlint.bash')) kind = 'script';
    else if (url === '/rhysd/actionlint/releases/latest') kind = 'latest';
    else if (url.endsWith('/ping')) kind = 'ping';
    else if (/\/download\/v[\d.]+\/actionlint_[\d.]+_checksums\.txt$/.test(url)) kind = 'checksums';
    else if (/\/download\/v[\d.]+\/actionlint_[\d.]+_\w+_\w+\.tar\.gz$/.test(url)) kind = 'tarball';
    count = requests.filter((entry) => entry.kind === kind).length + 1;
    requests.push({ kind, url });
    const answer = plan(kind, count, url) ?? { status: 404, body: 'not found' };
    if (answer.cut) {
      // Announce the whole body, send half and drop the connection: curl reports exit 18.
      response.writeHead(answer.status, { 'content-length': answer.body.length });
      response.write(answer.body.subarray(0, Math.floor(answer.body.length / 2)), () => response.socket.destroy());
      return;
    }
    response.writeHead(answer.status, answer.headers ?? {});
    response.end(answer.body ?? '');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        base: `http://127.0.0.1:${server.address().port}`,
        requests,
        count: (kind) => requests.filter((entry) => entry.kind === kind).length,
        stop: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

/** The environment without proxy variables, which would route the stub's 127.0.0.1 through a proxy. */
function withoutProxies(env) {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !/^(?:https?|all)_proxy$/i.test(name)));
}

function runInstaller(stub, scratch, env = {}) {
  const target = fs.mkdtempSync(path.join(scratch, 'target-'));
  return new Promise((resolve) => {
    const child = spawn('bash', [INSTALLER, target], {
      cwd: scratch,
      env: {
        ...withoutProxies(process.env),
        INSTALL_ACTIONLINT_RAW_BASE: `${stub.base}/rhysd/actionlint`,
        INSTALL_ACTIONLINT_RELEASES_BASE: `${stub.base}/rhysd/actionlint/releases`,
        INSTALL_ACTIONLINT_RETRY_BASE: '0',
        ...env,
      },
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('close', (status) => resolve({ status, output, target, installed: fs.existsSync(path.join(target, 'actionlint')) }));
  });
}

const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function describe(result) {
  return `exit ${result.status}; output:\n${result.output}`;
}

/**
 * A stub over a healthy release: the script, the redirect, the tarball and its checksums.
 * An override answers for one kind of request, receives the attempt count and the shared state
 * (the stub's base URL, the name the installer asked the tarball by), and returns undefined to
 * leave the healthy answer in place.
 */
async function withStub(scratch, overrides, run) {
  const tarball = makeTarball(scratch, VERSION);
  const standIn = Buffer.from(STAND_IN);
  const state = { base: '', tarballName: '', tarball };
  const stub = await startStub((kind, count, url) => {
    if (kind === 'tarball') state.tarballName = path.basename(url);
    const override = overrides[kind]?.(count, state);
    if (override !== undefined) return override;
    switch (kind) {
      case 'script': {
        return { status: 200, body: standIn };
      }
      case 'latest': {
        return { status: 302, headers: { location: `${state.base}/rhysd/actionlint/releases/tag/v${VERSION}` } };
      }
      case 'ping': {
        return { status: 200, body: 'pong' };
      }
      case 'tarball': {
        return { status: 200, body: tarball };
      }
      case 'checksums': {
        return { status: 200, body: `${digest(tarball)}  ${state.tarballName}\n` };
      }
      default: {
        return null;
      }
    }
  });
  state.base = stub.base;
  try {
    return await run(stub, { standInDigest: digest(standIn) });
  } finally {
    await stub.stop();
  }
}

const sandboxes = [];

function sandbox() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-install-actionlint-'));
  sandboxes.push(directory);
  return directory;
}

async function caseTransientStatusThenTarball() {
  const scratch = sandbox();
  await withStub(
    scratch,
    { tarball: (count, { tarball }) => (count <= 2 ? { status: 503, body: HTML_PAGE } : { status: 200, body: tarball }) },
    async (stub, model) => {
      const result = await runInstaller(stub, scratch, { INSTALL_ACTIONLINT_SCRIPT_SHA256: model.standInDigest });
      check(result.status === 0, `a 503 twice and then a tarball did not install: ${describe(result)}`);
      check(stub.count('tarball') === 3, `the tarball was requested ${stub.count('tarball')} times, expected 3`);
      check(result.installed, 'no actionlint file landed after a 503 twice and then a tarball');
      check(result.output.includes(`Done: ${VERSION}`), `the installed actionlint did not report ${VERSION}: ${describe(result)}`);
      check(stub.count('script') === 1 && stub.count('latest') === 1, 'the script and the latest tag are resolved once each');
      check(
        stub.count('ping') === 1,
        `the stand-in's other curl call reached the stub ${stub.count('ping')} times, expected 1 (the installer's curl passes it through)`,
      );
    },
  );
}

async function caseHtmlBodyNeverReachesTar() {
  for (const status of [200, 503]) {
    const scratch = sandbox();
    await withStub(scratch, { tarball: () => ({ status, body: HTML_PAGE }) }, async (stub, model) => {
      const result = await runInstaller(stub, scratch, { INSTALL_ACTIONLINT_SCRIPT_SHA256: model.standInDigest });
      const label = `an HTML body with status ${status}`;
      check(result.status !== 0, `${label} did not fail the install: ${describe(result)}`);
      check(stub.count('tarball') === 7, `${label}: the tarball was requested ${stub.count('tarball')} times, expected 7`);
      check(!result.installed, `${label}: an actionlint file exists`);
      check(!result.output.includes('not in gzip format'), `${label} reached tar: ${describe(result)}`);
      check(!/Unrecognized archive format/.test(result.output), `${label} reached tar: ${describe(result)}`);
      const final = result.output.trim().split('\n').at(-1);
      check(
        /failed after 7 attempts/.test(final) &&
          final.includes(`last HTTP status ${status}`) &&
          final.includes('the body was not a gzip file'),
        `${label}: the last line does not name the attempts, the status and the gzip cause: ${JSON.stringify(final)}`,
      );
    });
  }
}

async function caseTruncatedTarballIsRetried() {
  const scratch = sandbox();
  await withStub(
    scratch,
    {
      tarball: (count, { tarball }) => ({ status: 200, body: count <= 2 ? tarball.subarray(0, Math.floor(tarball.length / 2)) : tarball }),
    },
    async (stub, model) => {
      const result = await runInstaller(stub, scratch, { INSTALL_ACTIONLINT_SCRIPT_SHA256: model.standInDigest });
      check(result.status === 0, `a truncated tarball twice and then a whole one did not install: ${describe(result)}`);
      check(stub.count('tarball') === 3, `a truncated tarball: ${stub.count('tarball')} requests, expected 3`);
      check(result.installed, 'a truncated tarball twice and then a whole one installed nothing');
    },
  );
  const dropped = sandbox();
  await withStub(
    dropped,
    { tarball: (count, { tarball }) => (count <= 2 ? { status: 200, body: tarball, cut: true } : { status: 200, body: tarball }) },
    async (stub, model) => {
      const result = await runInstaller(stub, dropped, { INSTALL_ACTIONLINT_SCRIPT_SHA256: model.standInDigest });
      check(
        result.status === 0 && result.installed,
        `a connection cut twice and then a whole tarball did not install: ${describe(result)}`,
      );
      check(stub.count('tarball') === 3, `a cut connection: ${stub.count('tarball')} requests, expected 3`);
      check(result.output.includes('curl exit 18'), `a cut connection does not name the curl exit: ${describe(result)}`);
    },
  );
  const always = sandbox();
  await withStub(
    always,
    { tarball: (_count, { tarball }) => ({ status: 200, body: tarball.subarray(0, Math.floor(tarball.length / 2)) }) },
    async (stub, model) => {
      const result = await runInstaller(stub, always, { INSTALL_ACTIONLINT_SCRIPT_SHA256: model.standInDigest });
      check(result.status !== 0 && !result.installed, `a tarball cut on every attempt installed: ${describe(result)}`);
      check(stub.count('tarball') === 7, `a cut tarball: ${stub.count('tarball')} requests, expected 7`);
      check(result.output.includes('the body was a truncated or corrupt gzip file'), `a cut tarball is not named: ${describe(result)}`);
    },
  );
}

async function caseChecksumMismatch() {
  const scratch = sandbox();
  await withStub(
    scratch,
    { checksums: (_count, state) => ({ status: 200, body: `${'0'.repeat(64)}  ${state.tarballName}\n` }) },
    async (stub, model) => {
      const result = await runInstaller(stub, scratch, { INSTALL_ACTIONLINT_SCRIPT_SHA256: model.standInDigest });
      check(result.status !== 0 && !result.installed, `a checksum mismatch installed: ${describe(result)}`);
      check(stub.count('tarball') === 7, `a checksum mismatch: ${stub.count('tarball')} tarball requests, expected 7`);
      check(stub.count('checksums') === 1, `the checksum file was fetched ${stub.count('checksums')} times, expected 1`);
      const final = result.output.trim().split('\n').at(-1);
      check(final.includes('differs from the checksum file'), `a checksum mismatch is not named: ${JSON.stringify(final)}`);
    },
  );
  const recovers = sandbox();
  await withStub(
    recovers,
    {
      tarball: (count, { tarball }) => {
        if (count > 1) return { status: 200, body: tarball };
        const other = makeTarball(recovers, '1.0.0');
        return { status: 200, body: other };
      },
    },
    async (stub, model) => {
      const result = await runInstaller(stub, recovers, { INSTALL_ACTIONLINT_SCRIPT_SHA256: model.standInDigest });
      check(result.status === 0 && result.installed, `a wrong first tarball and a right second one did not install: ${describe(result)}`);
      check(stub.count('tarball') === 2, `a wrong first tarball: ${stub.count('tarball')} requests, expected 2`);
    },
  );
}

async function caseChecksumFileMissingSkipsOnlyTheChecksum() {
  const scratch = sandbox();
  await withStub(scratch, { checksums: () => ({ status: 404, body: 'Not Found' }) }, async (stub, model) => {
    const result = await runInstaller(stub, scratch, { INSTALL_ACTIONLINT_SCRIPT_SHA256: model.standInDigest });
    check(result.status === 0 && result.installed, `a release with no checksum file did not install: ${describe(result)}`);
  });
  const page = sandbox();
  await withStub(
    page,
    { checksums: () => ({ status: 404, body: 'Not Found' }), tarball: () => ({ status: 200, body: HTML_PAGE }) },
    async (stub, model) => {
      const result = await runInstaller(stub, page, { INSTALL_ACTIONLINT_SCRIPT_SHA256: model.standInDigest });
      check(result.status !== 0 && !result.installed, `a missing checksum file let an HTML body through: ${describe(result)}`);
      check(
        result.output.includes('the body was not a gzip file'),
        `the gzip check did not hold with no checksum file: ${describe(result)}`,
      );
    },
  );
  const down = sandbox();
  await withStub(down, { checksums: () => ({ status: 503, body: HTML_PAGE }) }, async (stub, model) => {
    const result = await runInstaller(stub, down, { INSTALL_ACTIONLINT_SCRIPT_SHA256: model.standInDigest });
    check(result.status !== 0 && !result.installed, `a checksum file answering 503 on every attempt was skipped: ${describe(result)}`);
    check(stub.count('checksums') === 7, `a failing checksum file: ${stub.count('checksums')} requests, expected 7`);
    check(result.output.includes('checksums.txt failed after 7 attempts'), `the checksum file is not named: ${describe(result)}`);
  });
  const nameless = sandbox();
  await withStub(
    nameless,
    { checksums: () => ({ status: 200, body: `${'a'.repeat(64)}  actionlint_${VERSION}_plan9_mips.tar.gz\n` }) },
    async (stub, model) => {
      const result = await runInstaller(stub, nameless, { INSTALL_ACTIONLINT_SCRIPT_SHA256: model.standInDigest });
      check(result.status !== 0 && !result.installed, `a checksum file with no line for the tarball installed: ${describe(result)}`);
      check(result.output.includes('has no line for'), `a missing checksum line is not named: ${describe(result)}`);
      check(
        stub.count('tarball') === 1,
        `a checksum file with no line for the tarball: ${stub.count('tarball')} tarball requests, expected 1 (another download cannot repair it)`,
      );
    },
  );
}

async function caseLatestVersionResolution() {
  const scratch = sandbox();
  await withStub(scratch, {}, async (stub, model) => {
    const result = await runInstaller(stub, scratch, { INSTALL_ACTIONLINT_SCRIPT_SHA256: model.standInDigest });
    check(result.status === 0, `the latest version did not install: ${describe(result)}`);
    check(
      stub.requests.some((entry) => entry.kind === 'tarball' && entry.url.includes(`/download/v${VERSION}/actionlint_${VERSION}_`)),
      `the tarball was not asked for ${VERSION}: ${JSON.stringify(stub.requests)}`,
    );
  });
  const flaky = sandbox();
  await withStub(flaky, { latest: (count) => (count <= 2 ? { status: 503, body: HTML_PAGE } : undefined) }, async (stub, model) => {
    const result = await runInstaller(stub, flaky, { INSTALL_ACTIONLINT_SCRIPT_SHA256: model.standInDigest });
    check(result.status === 0 && result.installed, `the latest version did not survive two 503s: ${describe(result)}`);
    check(stub.count('latest') === 3, `the latest tag was requested ${stub.count('latest')} times, expected 3`);
  });
  const never = sandbox();
  await withStub(never, { latest: () => ({ status: 200, body: 'no redirect here' }) }, async (stub, model) => {
    const result = await runInstaller(stub, never, { INSTALL_ACTIONLINT_SCRIPT_SHA256: model.standInDigest });
    check(result.status !== 0 && !result.installed, `an answer with no release tag installed: ${describe(result)}`);
    check(
      stub.count('latest') === 7 && stub.count('tarball') === 0,
      `no tag: ${stub.count('latest')} latest and ${stub.count('tarball')} tarball requests`,
    );
    check(
      result.output.includes('failed after 7 attempts') && result.output.includes('named no release tag'),
      `no tag is not named: ${describe(result)}`,
    );
  });
}

async function casePinnedScriptDigest() {
  const wrong = sandbox();
  await withStub(wrong, {}, async (stub) => {
    const result = await runInstaller(stub, wrong, { INSTALL_ACTIONLINT_SCRIPT_SHA256: 'f'.repeat(64) });
    check(result.status !== 0 && !result.installed, `a script with the wrong digest ran: ${describe(result)}`);
    check(
      stub.count('script') === 7 && stub.count('latest') === 0,
      `a wrong script digest: ${stub.count('script')} script and ${stub.count('latest')} latest requests`,
    );
    check(result.output.includes('sha256 mismatch'), `a script digest mismatch is not named: ${describe(result)}`);
    check(!result.output.includes('Start downloading'), `the script with the wrong digest ran: ${describe(result)}`);
  });
  const flaky = sandbox();
  await withStub(flaky, { script: (count) => (count <= 2 ? { status: 503, body: HTML_PAGE } : undefined) }, async (stub, model) => {
    const result = await runInstaller(stub, flaky, { INSTALL_ACTIONLINT_SCRIPT_SHA256: model.standInDigest });
    check(result.status === 0 && result.installed, `the script download did not survive two 503s: ${describe(result)}`);
    check(stub.count('script') === 3, `the script was requested ${stub.count('script')} times, expected 3`);
  });
}

async function caseWaitGrowsWithinTheBudget() {
  const scratch = sandbox();
  const log = path.join(scratch, 'waits.log');
  const recorder = path.join(scratch, 'record-wait.sh');
  fs.writeFileSync(recorder, `#!/bin/sh\necho "$1" >> '${log}'\n`, { mode: 0o755 });
  await withStub(scratch, { tarball: () => ({ status: 503, body: HTML_PAGE }) }, async (stub, model) => {
    const result = await runInstaller(stub, scratch, {
      INSTALL_ACTIONLINT_SCRIPT_SHA256: model.standInDigest,
      INSTALL_ACTIONLINT_RETRY_BASE: undefined,
      INSTALL_ACTIONLINT_SLEEP: recorder,
    });
    const waits = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map(Number) : [];
    check(result.status !== 0, `a tarball that answers 503 on every attempt installed: ${describe(result)}`);
    check(
      JSON.stringify(waits) === '[2,4,8,16,32,64]',
      `the waits were ${JSON.stringify(waits)}, expected [2,4,8,16,32,64] (the production default base, since the case removes the override)`,
    );
  });
  const slow = sandbox();
  const slowLog = path.join(slow, 'waits.log');
  const slowRecorder = path.join(slow, 'record-wait.sh');
  fs.writeFileSync(slowRecorder, `#!/bin/sh\necho "$1" >> '${slowLog}'\n`, { mode: 0o755 });
  await withStub(
    slow,
    {
      script: (count) => (count <= 4 ? { status: 503, body: HTML_PAGE } : undefined),
      latest: (count) => (count <= 4 ? { status: 503, body: HTML_PAGE } : undefined),
      tarball: () => ({ status: 503, body: HTML_PAGE }),
    },
    async (stub, model) => {
      const result = await runInstaller(stub, slow, {
        INSTALL_ACTIONLINT_SCRIPT_SHA256: model.standInDigest,
        INSTALL_ACTIONLINT_RETRY_BASE: undefined,
        INSTALL_ACTIONLINT_SLEEP: slowRecorder,
      });
      const waits = fs.existsSync(slowLog) ? fs.readFileSync(slowLog, 'utf8').trim().split('\n').map(Number) : [];
      const total = waits.reduce((sum, wait) => sum + wait, 0);
      check(
        total === 126,
        `the waits of one run total ${total} seconds, expected the 126 second budget spent exactly: ${JSON.stringify(waits)}`,
      );
      check(
        JSON.stringify(waits) === '[2,4,8,16,2,4,8,16,2,4,8,16,32,4]',
        `the waits were ${JSON.stringify(waits)}, expected the script's and the tag's 30 seconds each, then the tarball's 2, 4, 8, 16, 32 and the 4 seconds the budget has left`,
      );
      check(
        stub.count('tarball') === 7,
        `with the budget spent the tarball was requested ${stub.count('tarball')} times, expected 7: ${describe(result)}`,
      );
    },
  );
}

/**
 * The story's So-that: an outage of about two minutes cannot fail a shard.
 * The release answers 503 for the first six tarball requests, which the production schedule
 * (2, 4, 8, 16, 32, 64 seconds, 126 in all) waits through; the sleep seam records the waits.
 * An installer that gives up after the first 30 seconds of waits (five attempts) fails here.
 */
async function caseOutageOfTwoMinutesIsSurvived() {
  const scratch = sandbox();
  const log = path.join(scratch, 'waits.log');
  const recorder = path.join(scratch, 'record-wait.sh');
  fs.writeFileSync(recorder, `#!/bin/sh\necho "$1" >> '${log}'\n`, { mode: 0o755 });
  await withStub(
    scratch,
    { tarball: (count, { tarball }) => (count <= 6 ? { status: 503, body: HTML_PAGE } : { status: 200, body: tarball }) },
    async (stub, model) => {
      const result = await runInstaller(stub, scratch, {
        INSTALL_ACTIONLINT_SCRIPT_SHA256: model.standInDigest,
        INSTALL_ACTIONLINT_RETRY_BASE: undefined,
        INSTALL_ACTIONLINT_SLEEP: recorder,
      });
      const waits = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map(Number) : [];
      const total = waits.reduce((sum, wait) => sum + wait, 0);
      check(result.status === 0 && result.installed, `an outage of six 503s and then a tarball did not install: ${describe(result)}`);
      check(stub.count('tarball') === 7, `the tarball was requested ${stub.count('tarball')} times, expected 7`);
      check(total > 30, `the waits cover ${total} seconds, no more than the 30 seconds of five attempts: ${JSON.stringify(waits)}`);
      check(JSON.stringify(waits) === '[2,4,8,16,32,64]', `the waits were ${JSON.stringify(waits)}, expected [2,4,8,16,32,64]`);
    },
  );
}

async function caseDeadlineEndsTheRetries() {
  const scratch = sandbox();
  await withStub(scratch, { tarball: () => ({ status: 503, body: HTML_PAGE }) }, async (stub, model) => {
    const result = await runInstaller(stub, scratch, {
      INSTALL_ACTIONLINT_SCRIPT_SHA256: model.standInDigest,
      INSTALL_ACTIONLINT_DEADLINE: '0',
    });
    check(result.status !== 0 && !result.installed, `a run past its deadline installed: ${describe(result)}`);
    check(stub.count('tarball') === 1, `a run past its deadline requested the tarball ${stub.count('tarball')} times, expected 1`);
    check(
      result.output.trim().split('\n').at(-1).includes('failed after 1 attempt;'),
      `the deadline is not named by its attempts: ${describe(result)}`,
    );
  });
}

const CASES = [
  ['a 503 twice and then a tarball installs after three attempts', caseTransientStatusThenTarball],
  ['an HTML body never reaches tar and the failure names its cause', caseHtmlBodyNeverReachesTar],
  ['a truncated tarball is retried', caseTruncatedTarballIsRetried],
  ['a checksum mismatch is retried and then fails', caseChecksumMismatch],
  ['a missing checksum file skips only the checksum', caseChecksumFileMissingSkipsOnlyTheChecksum],
  ['the latest version is resolved and its resolution retried', caseLatestVersionResolution],
  ['the pinned script is held to its digest', casePinnedScriptDigest],
  ['the wait grows 2, 4, 8, 16, 32, 64 within a 126 second budget', caseWaitGrowsWithinTheBudget],
  ['an outage of about two minutes is survived', caseOutageOfTwoMinutesIsSurvived],
  ['a run past its deadline stops retrying', caseDeadlineEndsTheRetries],
];

async function main() {
  const missing = missingTool();
  if (missing) {
    console.log(`${colors.dim}skipped: ${missing} is not on PATH, and the installer needs bash, curl, gzip and tar${colors.reset}`);
    return 0;
  }
  let failedCases = 0;
  for (const [name, run] of CASES) {
    const before = failures.length;
    await run();
    if (failures.length > before) {
      // One rerun for a flaky case: the verdict is the second run's.
      const first = failures.splice(before);
      await run();
      if (failures.length === before)
        console.error(`${colors.dim}warning: ${name} failed once and passed on its rerun; first run: ${first.join(' | ')}${colors.reset}`);
      else {
        failedCases += 1;
        failures.splice(before, 0, `${name} failed twice; first run: ${first.join(' | ')}`);
      }
    }
  }
  if (failures.length > 0) {
    console.error(
      `${colors.red}${failedCases} of ${CASES.length} install-actionlint case(s) failed (${failures.length} of ${checks} check(s)):${colors.reset}`,
    );
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log(`${colors.green}ok${colors.reset} all ${checks} install-actionlint check(s) passed`);
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .finally(() => {
    for (const directory of sandboxes) fs.rmSync(directory, { recursive: true, force: true });
  });
