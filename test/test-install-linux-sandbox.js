/**
 * `tools/install-linux-sandbox.sh` and the three workflow steps that run it.
 *
 * The install of `bubblewrap` and `strace` was one unbounded `apt-get update && apt-get install`, so a mirror that went silent held
 * a CI shard for the job's whole 20 minutes (three cancelled attempts of `chain (14/21)`). The script bounds every try and retries.
 * The cases run the real script against a stub `sudo`, `apt-get` and `timeout` (a Node program that ends a command at its limit, as
 * GNU `timeout` does, so the case runs on a host that has none):
 *  - a first-try install makes one `update` and one `install`, each given apt's retry, network and lock options, and `update` is not quiet;
 *  - a failed first try is retried and the second installs;
 *  - a try that stalls past its limit is ended and the next try installs;
 *  - three failed tries exit 1 with the `::error` line that names the step;
 *  - a failed try drops the preferred mirror of the runner's mirror list while another remains, so the next try asks the next
 *    mirror (a stalled azure.archive.ubuntu.com timed out all three tries of a shard in its downloads), and a list of one mirror,
 *    or no list, is left alone;
 *  - a restored package cache installs its packages through `dpkg -i`, with no apt call and so no network; cached packages that do not install fall
 *    back to the mirrors; a miss leaves its downloads in the cache, tidied for actions/cache to save;
 *  - an install that exits 0 with bwrap or strace missing from PATH is a failed try;
 *  - each workflow restores the package cache, keyed by the runner image, before the install step, and runs the script in a step that has its own `timeout-minutes` above the worst case of the tries, and no workflow
 *    keeps a bare `apt-get`.
 *
 * Usage: node test/test-install-linux-sandbox.js
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(PROJECT_ROOT, 'tools', 'install-linux-sandbox.sh');
const WORKFLOWS = path.join(PROJECT_ROOT, '.github', 'workflows');
const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };

const failures = [];
let checks = 0;
function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

const TIMEOUT_STUB = `#!/usr/bin/env node
// GNU timeout's contract for the calls the script makes: [--kill-after=N] SECONDS command...; 124 when the limit ended the command.
const { spawn } = require('node:child_process');
const args = process.argv.slice(2);
while (args[0].startsWith('--')) args.shift();
const seconds = Number(args.shift());
const child = spawn(args[0], args.slice(1), { stdio: 'inherit', detached: true });
let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
}, seconds * 1000);
child.on('exit', (code, signal) => {
  clearTimeout(timer);
  process.exit(timedOut ? 124 : (code ?? 128 + (signal ? 9 : 0)));
});
`;

/** `apt-get` and `dpkg` answer each call, counted across both, from the scenario's list for that call's number: `ok`, `fail` or `stall`. */
const APT_STUB = `#!/usr/bin/env bash
count_file="$STUB_DIR/calls"
n=$(( $(cat "$count_file" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$count_file"
echo "$(basename "$0") $*" >> "$STUB_DIR/log"
verb=ok
IFS=, read -r -a plan <<< "$STUB_PLAN"
[ "$n" -le "\${#plan[@]}" ] && verb="\${plan[$((n - 1))]}"
case "$verb" in
  fail) echo "E: Failed to fetch http://mirror/ (stub)" >&2; exit 100 ;;
  stall) exec sleep 60 ;;
esac
exit 0
`;

const MIRRORS = [
  'http://azure.archive.ubuntu.com/ubuntu/\tpriority:1',
  'https://archive.ubuntu.com/ubuntu/\tpriority:2',
  'https://security.ubuntu.com/ubuntu/\tpriority:3',
];

/**
 * Runs the script against the stubs. `mirrors` is the mirror list's lines, or `null` for a host with none; the list always lives in
 * the case's own directory, so a case on a hosted runner never touches its `/etc/apt/apt-mirrors.txt`.
 */
/** The commands the script checks for, stubbed by name so a host that has the real bwrap or strace cannot answer for them. */
const SANDBOX_COMMANDS = ['tea-stub-bwrap', 'tea-stub-strace'];

function run(plan, env = {}, mirrors = null, { cached = [], commands = SANDBOX_COMMANDS } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-install-sandbox-'));
  const mirrorList = path.join(dir, 'apt-mirrors.txt');
  if (mirrors !== null) fs.writeFileSync(mirrorList, `${mirrors.join('\n')}\n`);
  const debCache = path.join(dir, 'debs');
  if (cached.length > 0) {
    fs.mkdirSync(debCache);
    for (const name of cached) fs.writeFileSync(path.join(debCache, name), 'a cached package\n');
  }
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'timeout'), TIMEOUT_STUB, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'apt-get'), APT_STUB, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'dpkg'), APT_STUB, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'sudo'), '#!/usr/bin/env bash\nexec "$@"\n', { mode: 0o755 });
  for (const command of commands) fs.writeFileSync(path.join(bin, command), '#!/usr/bin/env bash\n', { mode: 0o755 });
  try {
    const result = spawnSync('bash', [SCRIPT], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        STUB_DIR: dir,
        STUB_PLAN: plan,
        WAIT_SECONDS: '0',
        MIRROR_LIST: mirrorList,
        DEB_CACHE: debCache,
        SANDBOX_COMMANDS: SANDBOX_COMMANDS.join(' '),
        ...env,
      },
      timeout: 60_000,
    });
    const log = fs.existsSync(path.join(dir, 'log')) ? fs.readFileSync(path.join(dir, 'log'), 'utf8').trim().split('\n') : [];
    const left = fs.existsSync(mirrorList) ? fs.readFileSync(mirrorList, 'utf8').split('\n').filter(Boolean) : null;
    const partial = fs.existsSync(path.join(debCache, 'partial'));
    return { status: result.status, output: `${result.stdout}${result.stderr}`, log, mirrors: left, debCache, partial };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const OPTIONS = ['Acquire::Retries=3', 'Acquire::http::Timeout=30', 'Acquire::https::Timeout=30', 'DPkg::Lock::Timeout=120'];
const hasOptions = (line) => OPTIONS.every((option) => line.includes(`-o ${option}`));

function checkScript() {
  const first = run('ok,ok');
  check(first.status === 0, `a first-try install exited ${first.status}\n${first.output}`);
  check(
    first.log.length === 2 && first.log[0].includes(' update') && first.log[1].includes(' install ') && first.log.every(hasOptions),
    `a first-try install made the calls ${JSON.stringify(first.log)}; expected one update and one install, each with apt's retry, timeout and lock options`,
  );
  check(!first.log[0].includes('-qq'), `update is quiet: ${first.log[0]}; the log must name the source that stalls`);
  check(first.log[1].includes('bubblewrap') && first.log[1].includes('strace'), `install does not name both packages: ${first.log[1]}`);
  check(
    !first.log[1].includes('-qq') && first.log[1].includes('--no-install-recommends'),
    `install is quiet or pulls recommends: ${first.log[1]}; the log must name the download that stalls`,
  );

  check(
    first.log[1].includes(`-o Dir::Cache::Archives=${first.debCache}`) &&
      first.log[1].includes('-o APT::Sandbox::User=root') &&
      !first.partial,
    `a mirror install did not download into the package cache or left apt's partial directory: ${first.log[1]}`,
  );

  const hit = run('ok', {}, null, { cached: ['bubblewrap_0.9.0_amd64.deb'] });
  check(
    hit.status === 0 &&
      hit.log.length === 1 &&
      hit.log[0] === `dpkg -i ${path.join(hit.debCache, 'bubblewrap_0.9.0_amd64.deb')}` &&
      hit.output.includes('installed from the package cache'),
    `a restored cache did not install its packages through dpkg alone, with no apt call (exit ${hit.status}, calls ${JSON.stringify(hit.log)})\n${hit.output}`,
  );
  const stale = run('fail,ok,ok', {}, null, { cached: ['bubblewrap_0.9.0_amd64.deb'] });
  check(
    stale.status === 0 &&
      stale.log.length === 3 &&
      stale.log[1].includes(' update') &&
      stale.output.includes('the cached packages did not install') &&
      stale.output.includes('installed on try 1'),
    `cached packages that did not install did not fall back to the mirrors (exit ${stale.status}, calls ${JSON.stringify(stale.log)})\n${stale.output}`,
  );
  const missing = run('ok,ok,ok,ok,ok,ok', { TRIES: '3' }, null, { commands: ['tea-stub-strace'] });
  check(
    missing.status === 1 && missing.output.includes('one of tea-stub-bwrap tea-stub-strace is not on PATH'),
    `an install that left bwrap off PATH exited ${missing.status}\n${missing.output}`,
  );

  const listed = run('ok,ok', {}, MIRRORS);
  check(
    JSON.stringify(listed.mirrors) === JSON.stringify(MIRRORS),
    `a first-try install changed the mirror list to ${JSON.stringify(listed.mirrors)}`,
  );
  const dropped = run('ok,fail,ok,ok', {}, MIRRORS);
  check(
    dropped.status === 0 &&
      JSON.stringify(dropped.mirrors) === JSON.stringify(MIRRORS.slice(1)) &&
      dropped.output.includes(
        'dropping the mirror http://azure.archive.ubuntu.com/ubuntu/ for the next try; next is https://archive.ubuntu.com/ubuntu/',
      ),
    `a failed install did not drop the preferred mirror before the next try (exit ${dropped.status}, list ${JSON.stringify(dropped.mirrors)})\n${dropped.output}`,
  );
  const exhausted = run('fail,fail,fail', { TRIES: '3' }, MIRRORS.slice(0, 2));
  check(
    exhausted.status === 1 && JSON.stringify(exhausted.mirrors) === JSON.stringify(MIRRORS.slice(1, 2)),
    `three failed tries over two mirrors left the list ${JSON.stringify(exhausted.mirrors)}; expected the last mirror kept`,
  );
  const unlisted = run('fail,ok,ok');
  check(
    unlisted.status === 0 && unlisted.mirrors === null && !unlisted.output.includes('dropping the mirror'),
    `a host with no mirror list did not retry as before (exit ${unlisted.status})\n${unlisted.output}`,
  );

  const retried = run('fail,ok,ok');
  check(
    retried.status === 0 && retried.output.includes('try 1 ended with status') && retried.output.includes('installed on try 2'),
    `a failed first try was not retried to success (exit ${retried.status})\n${retried.output}`,
  );

  const stalled = run('stall,ok,ok', { TRY_SECONDS: '1' });
  check(
    stalled.status === 0 && stalled.output.includes('(timed out)') && stalled.output.includes('installed on try 2'),
    `a stalled try was not ended and retried (exit ${stalled.status})\n${stalled.output}`,
  );

  const failed = run('fail,fail,fail', { TRIES: '3' });
  check(
    failed.status === 1 &&
      failed.output.includes('::error title=Install bubblewrap and strace::') &&
      failed.log.length === 3 &&
      failed.output.includes('try 3 of 3'),
    `three failed tries exited ${failed.status} with ${failed.log.length} call(s)\n${failed.output}`,
  );
  const stalledAlways = run('stall,stall,stall', { TRY_SECONDS: '1' });
  check(
    stalledAlways.status === 1 && stalledAlways.output.includes('::error title=Install bubblewrap and strace::'),
    `three stalled tries exited ${stalledAlways.status}\n${stalledAlways.output}`,
  );
}

/** Each workflow's install step: its own bounded timeout, the script as the whole command, and no bare apt-get anywhere. */
function checkWorkflows() {
  const tries = 3;
  const worstCaseMinutes = (tries * (180 + 10)) / 60;
  for (const file of ['quality.yaml', 'failing-pack-loop.yaml']) {
    const text = fs.readFileSync(path.join(WORKFLOWS, file), 'utf8');
    const cache = /^ {6}- name: Restore the bubblewrap and strace packages\n((?: {8}[^\n]*\n)+)/m.exec(text);
    check(
      cache !== null &&
        /^ {8}uses: actions\/cache@v\d+$/m.test(cache[1]) &&
        /^ {10}path: ~\/\.cache\/tea-linux-sandbox-debs$/m.test(cache[1]) &&
        /^ {10}key: linux-sandbox-debs-\$\{\{ runner\.os \}\}-\$\{\{ runner\.arch \}\}-\$\{\{ steps\.sandbox-image\.outputs\.image \}\}$/m.test(
          cache[1],
        ) &&
        text.indexOf(cache[0]) < text.indexOf('- name: Install bubblewrap and strace'),
      `${file}: no package cache step keyed by the runner image before the install step`,
    );
    check(/^ {8}id: sandbox-image$/m.test(text), `${file}: no step names the runner image for the package cache key`);
    const step = /^ {6}- name: Install bubblewrap and strace[^\n]*\n((?: {8}[^\n]*\n)+)/m.exec(text);
    check(step !== null, `${file}: no Install bubblewrap and strace step`);
    if (step !== null) {
      const minutes = Number(/^ {8}timeout-minutes: (\d+)$/m.exec(step[1])?.[1]);
      check(
        minutes > worstCaseMinutes && minutes <= 15,
        `${file}: the install step's timeout-minutes is ${minutes}; expected above the ${worstCaseMinutes.toFixed(1)} minutes of ${tries} tries and at most 15`,
      );
      check(
        /^ {8}run: bash tools\/install-linux-sandbox\.sh$/m.test(step[1]) && !/continue-on-error|\bif:/.test(step[1]),
        `${file}: the install step does not run the script alone and unconditionally:\n${step[1]}`,
      );
    }
    check(!/\bapt-get\b/.test(text), `${file}: an unbounded apt-get is back in the workflow`);
  }
}

try {
  checkScript();
  checkWorkflows();
} finally {
  if (failures.length > 0) {
    console.error(`${colors.red}${failures.length} of ${checks} install-linux-sandbox check(s) failed:${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(`${colors.green}ok${colors.reset} all ${checks} install-linux-sandbox check(s) passed`);
  }
}
