/**
 * The isolation tea-atdd-red-check executes generated tests under.
 *
 * NFR9 in the upgrade plan names the properties: a disposable non-privileged
 * workspace, no credential in the environment, no network beyond what the step
 * declares, bounded CPU and wall clock, and removal of the workspace on both the
 * passing and the throwing path. This module owns the parts that are decided
 * once per platform, so the command and the harness that proves the isolation
 * read one decision rather than two:
 *
 *   backend      seatbelt on darwin (`sandbox-exec` with a generated profile
 *                denying network and filesystem writes outside the workspace,
 *                loopback and the workspace re-allowed), bubblewrap on linux
 *                (`bwrap --unshare-net` with a read-only bind of `/` and a
 *                writable bind of the workspace alone). Nothing else. A
 *                platform with neither is refused rather than run unconfined,
 *                because a gate that executes generated content unconfined is
 *                the thing NFR9 forbids.
 *
 *                The two backends were chosen for parity, not for convenience:
 *                a raw `unshare --net` was tried first and rejected, because it
 *                isolates the network alone and leaves every filesystem write
 *                outside the workspace unconfined, which is not what seatbelt
 *                does on the other platform. bubblewrap denies both the way
 *                seatbelt does, verified live in a plain `ubuntu:24.04`
 *                container matching the CI image: outbound connect refused,
 *                loopback bind and connect still work, a write outside the
 *                workspace refused with `Read-only file system`, a write inside
 *                it succeeds. `.github/workflows/quality.yaml` installs it;
 *                nothing here assumes it is already on the image.
 *   environment  PATH plus what the caller names, and a HOME inside the
 *                workspace. The real HOME never reaches a child, so a stored
 *                vendor login is not on any path a test can read from
 *                `os.homedir()`, and no vendor key is in the environment at all.
 *   node         the preload guard in cli/lib/atdd-net-guard.cjs, loaded through
 *                NODE_OPTIONS on every sandboxed process. It is defense in
 *                depth rather than the enforcement: a Playwright request
 *                context does not always route through `net.Socket#connect`
 *                (verified live: a plain HTTP GET to a real host completed
 *                before the guard's DNS check ever fired), so the OS backend
 *                above is what actually holds the boundary, and this is what
 *                gives a clear "isolation refused" message when the DNS path
 *                does catch it and refuses a stray child-process spawn inside
 *                a Playwright worker, which the sandbox alone does not forbid.
 *   cpu          `ulimit -t` in the shell that execs the sandboxed process, so
 *                every process of the run gets its own CPU budget and a busy
 *                loop dies with SIGKILL instead of waiting out the wall clock.
 *                Verified live inside bubblewrap too: a 15-second busy loop
 *                under a 2-second budget was killed at 2 seconds.
 *
 * The wall clock is the caller's: cli/atdd-red-check.js bounds each spec file's
 * run and the whole check, and the adapter that spawns the command backstops it
 * once more with SIGKILL.
 *
 * `TEA_ATDD_ISOLATION` selects a backend explicitly. It accepts the two backend
 * names and nothing else; there is no `none`, for the reason above.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const BACKEND_OVERRIDE_ENV = 'TEA_ATDD_ISOLATION';

/** The two backends, by platform. */
const ISOLATION_BACKENDS = ['seatbelt', 'bubblewrap'];

/** The preload every node process of a check loads; see that file for what it refuses. */
const NET_GUARD_PATH = path.join(__dirname, 'atdd-net-guard.cjs');

/** A generous CPU budget per process; the wall clock is the tighter bound on a well-behaved run. */
const DEFAULT_CPU_SECONDS = 60;

function isolationError(message) {
  const error = new Error(message);
  error.code = 'ISOLATION_UNAVAILABLE';
  return error;
}

function executableOnPath(name, env = process.env) {
  for (const directory of String(env.PATH || '').split(path.delimiter)) {
    if (!directory) continue;
    try {
      fs.accessSync(path.join(directory, name), fs.constants.X_OK);
      return true;
    } catch {
      // keep looking
    }
  }
  return false;
}

/**
 * The backend this platform runs generated tests under.
 *
 * @param {{env?: object, platform?: string}} [options]
 * @returns {'seatbelt'|'bubblewrap'}
 * @throws {Error} ISOLATION_UNAVAILABLE when no backend can run here, or when the
 *   override names a backend this platform does not have.
 */
function selectBackend({ env = process.env, platform = process.platform } = {}) {
  const override = env[BACKEND_OVERRIDE_ENV];
  if (override !== undefined && override !== '') {
    if (!ISOLATION_BACKENDS.includes(override)) {
      throw isolationError(
        `${BACKEND_OVERRIDE_ENV}="${override}" is not an isolation backend; expected one of ${ISOLATION_BACKENDS.join(', ')}. ` +
          'There is no unconfined mode: a gate that executes generated tests runs isolated or does not run.',
      );
    }
    if (override === 'seatbelt' && platform !== 'darwin') {
      throw isolationError(`${BACKEND_OVERRIDE_ENV}=seatbelt needs darwin; this is ${platform}`);
    }
    if (override === 'bubblewrap' && platform !== 'linux') {
      throw isolationError(`${BACKEND_OVERRIDE_ENV}=bubblewrap needs linux; this is ${platform}`);
    }
    return override;
  }
  if (platform === 'darwin' && executableOnPath('sandbox-exec', env)) return 'seatbelt';
  if (platform === 'linux' && executableOnPath('bwrap', env)) return 'bubblewrap';
  throw isolationError(
    `no isolation backend is available on ${platform}: seatbelt needs sandbox-exec on darwin and bubblewrap needs bwrap on linux ` +
      '(apt-get install bubblewrap). Generated tests are not executed unconfined.',
  );
}

/** A path a sandbox profile or argv may carry: no quote and no line break, which the profile syntax and shell quoting both rely on. */
function assertProfileSafePath(candidate) {
  if (/["\n\r]/.test(candidate)) {
    throw isolationError(`a path cannot be embedded in a sandbox profile: ${JSON.stringify(candidate)}`);
  }
  return candidate;
}

/**
 * The seatbelt profile for one check.
 *
 * Everything is allowed except what NFR9 names. Network is denied outright and
 * then re-allowed on loopback in all three directions a server and its client
 * need, and nothing else: an earlier draft also re-allowed outbound unix-socket
 * connections for the system resolver, which a generated test never needs (the
 * fixture is addressed by loopback IP, not by hostname) and which is reachable
 * local IPC rather than network in name only — it would have reached a live
 * `ssh-agent` or Docker daemon socket exactly as easily as a resolver socket.
 * Verified live: `cli/atdd-red-check.js` still runs a full spec file to
 * completion against the fixture server with that allowance removed. File
 * writes are denied outright and re-allowed under
 * the workspace, by its path and by its real path because `/var` is a symlink to
 * `/private/var` on darwin, plus `/dev/null`, which a child's closed stdio is.
 *
 * Nothing under the real HOME is writable, and the environment the command
 * builds never names it, so a stored login is neither on a path a test derives
 * from `os.homedir()` nor in any variable. Reads are not denied: node and
 * Playwright read from the repository and the system, and NFR9's clause is about
 * the environment the run carries.
 *
 * @param {{workspace: string}} options
 * @returns {string} Profile source.
 */
function buildSeatbeltProfile({ workspace }) {
  const writable = new Set([path.resolve(workspace)]);
  try {
    writable.add(fs.realpathSync(workspace));
  } catch {
    // the workspace is created before the profile is used; the literal entry covers it
  }
  const subpaths = [...writable].map((entry) => `    (subpath "${assertProfileSafePath(entry)}")`).join('\n');
  return [
    '(version 1)',
    '(allow default)',
    '(deny network*)',
    '(allow network-bind (local ip "localhost:*"))',
    '(allow network-inbound (local ip "localhost:*"))',
    '(allow network-outbound (remote ip "localhost:*"))',
    '(deny file-write*)',
    `(allow file-write*\n${subpaths}\n    (literal "/dev/null"))`,
    '',
  ].join('\n');
}

/**
 * The spawn vector that runs `command args` inside the backend with a CPU limit.
 *
 * Both backends go through `sh` so that `ulimit -t` applies to the process and
 * everything it forks, each with its own budget. `$0` carries the budget and
 * `"$@"` the command, so no argument is ever interpolated into shell text.
 *
 * bubblewrap's flags, in the order verified live:
 *   --unshare-user     an unprivileged user namespace, the same mechanism a bare
 *                      `unshare --user` uses, and what lets an ordinary account
 *                      create the namespaces below with no setuid helper
 *   --unshare-net      a fresh network namespace with only loopback, brought up
 *                      already: unlike a bare `unshare --net`, bubblewrap starts
 *                      `lo` itself, so no separate `ip link set lo up` step exists
 *                      to forget
 *   --unshare-pid      a fresh PID namespace, so a generated test cannot see, and
 *                      is not counted among, host or sibling-run process trees
 *   --unshare-ipc      a fresh IPC namespace, so no generated test can reach a
 *                      SysV or POSIX IPC object another process on the host holds
 *   --die-with-parent  the sandboxed process tree is killed if the process that
 *                      started bubblewrap dies first, so an OOM-killed harness
 *                      cannot orphan a still-running sandboxed child
 *   --ro-bind / /      the real filesystem, read-only, so node, Playwright and
 *                      the fixture's own dependencies resolve exactly as they do
 *                      outside the sandbox
 *   --bind ws ws       the one path writable inside that read-only view
 *
 * @param {{backend: string, profilePath?: string, workspace?: string, cpuSeconds: number, command: string, args: string[]}} options
 * @returns {{command: string, args: string[]}}
 */
function sandboxedCommand({ backend, profilePath, workspace, cpuSeconds, command, args }) {
  if (!Number.isInteger(cpuSeconds) || cpuSeconds <= 0) throw isolationError(`cpuSeconds must be a positive integer; got ${cpuSeconds}`);
  if (backend === 'seatbelt') {
    if (!profilePath) throw isolationError('seatbelt needs a profile path');
    return {
      command: 'sh',
      args: ['-c', 'ulimit -t "$0" && exec "$@"', String(cpuSeconds), 'sandbox-exec', '-f', profilePath, command, ...args],
    };
  }
  if (backend === 'bubblewrap') {
    if (!workspace) throw isolationError('bubblewrap needs a workspace path');
    const resolved = assertProfileSafePath(path.resolve(workspace));
    return {
      command: 'sh',
      args: [
        '-c',
        'ulimit -t "$0" && exec "$@"',
        String(cpuSeconds),
        'bwrap',
        '--unshare-user',
        '--unshare-net',
        '--unshare-pid',
        '--unshare-ipc',
        '--die-with-parent',
        '--ro-bind',
        '/',
        '/',
        // A synthetic /dev, not the `--ro-bind / /` view of the real one.
        // Without it, opening /dev/null under this user namespace — which is
        // exactly what stdio: 'ignore' does for a spawned child — fails exec
        // with EACCES: measured live, tea-atdd-red-check's own server spawn
        // threw that error until this flag was added, and every other stdio
        // configuration worked, which is what pointed at /dev rather than at
        // the spawn call.
        '--dev',
        '/dev',
        '--bind',
        resolved,
        resolved,
        '--',
        command,
        ...args,
      ],
    };
  }
  throw isolationError(`unknown isolation backend "${backend}"`);
}

/**
 * The closed environment a sandboxed child gets: PATH, a HOME inside the
 * workspace, and exactly the names the caller adds. Nothing is inherited.
 *
 * @param {{path: string, home: string, extra?: Record<string, string>}} options
 * @returns {Record<string, string>}
 */
function childEnvironment({ path: pathValue, home, extra = {} }) {
  if (typeof pathValue !== 'string' || pathValue.length === 0) throw isolationError('a sandboxed child needs a PATH');
  if (typeof home !== 'string' || home.length === 0) throw isolationError('a sandboxed child needs a HOME inside the workspace');
  return { PATH: pathValue, HOME: home, ...extra };
}

/**
 * Whether the backend actually runs a process here, or the reason it does not.
 *
 * Selection says the executable exists; this says the kernel lets it work. A
 * linux host can carry `bwrap` and still refuse an unprivileged user namespace,
 * which is the state some hardened distributions ship in, and a pre-flight that
 * only checked PATH would schedule a check that dies at its first spawn.
 *
 * @param {{backend: string, workspace: string, cpuSeconds?: number}} options
 * @returns {{ok: true}|{ok: false, reason: string}}
 */
function probeBackend({ backend, workspace, cpuSeconds = DEFAULT_CPU_SECONDS }) {
  let profilePath;
  if (backend === 'seatbelt') {
    profilePath = path.join(workspace, 'probe.sb');
    fs.writeFileSync(profilePath, buildSeatbeltProfile({ workspace }), 'utf8');
  }
  const vector = sandboxedCommand({
    backend,
    profilePath,
    workspace,
    cpuSeconds,
    command: process.execPath,
    args: ['-e', 'process.exit(0)'],
  });
  const result = spawnSync(vector.command, vector.args, {
    cwd: workspace,
    env: childEnvironment({ path: process.env.PATH, home: workspace }),
    encoding: 'utf8',
    timeout: 20_000,
  });
  if (result.error) return { ok: false, reason: `${backend}: ${result.error.message}` };
  if (result.status !== 0) {
    const tail = String(result.stderr || '')
      .trim()
      .split('\n')
      .slice(-2)
      .join(' | ');
    return {
      ok: false,
      reason: `${backend}: a trivial process exited ${result.status ?? `by ${result.signal}`}${tail ? ` (${tail})` : ''}`,
    };
  }
  return { ok: true };
}

module.exports = {
  BACKEND_OVERRIDE_ENV,
  DEFAULT_CPU_SECONDS,
  ISOLATION_BACKENDS,
  NET_GUARD_PATH,
  buildSeatbeltProfile,
  childEnvironment,
  probeBackend,
  sandboxedCommand,
  selectBackend,
};
