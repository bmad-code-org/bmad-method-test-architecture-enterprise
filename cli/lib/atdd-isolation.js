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
 *
 * ALLOWHOSTLOOPBACK: THE ONE HOLE THIS MODULE ADMITS
 *
 * Every property above assumes the sandboxed content needs nothing beyond its
 * own workspace and its own loopback -- true for every caller until Story 6.9,
 * whose `npm install` must reach a real, host-side, unsandboxed process (a
 * CONNECT-allowlisting proxy) over loopback, to relay to the real npm
 * registry. `--unshare-net` cannot serve that caller: bubblewrap's own manual
 * is explicit that it is all-or-nothing, a fresh network namespace with only
 * its OWN loopback, never the host's -- discovered live on this story's own
 * pull request, the same way `--unshare-pid`/`--unshare-ipc` were discovered
 * live on an earlier one. seatbelt never had this problem: its profile denies
 * network and re-allows loopback while the process still shares the host's
 * real network stack, so a host-side loopback service was always reachable
 * there. `sandboxedCommand`'s `allowHostLoopback: true` gives bubblewrap that
 * same property, by a different mechanism, because bubblewrap has no
 * seatbelt-style "allow just this" filter of its own:
 *
 *   - Skip `--unshare-net` (share the real network namespace, so loopback is
 *     the host's loopback), and run the whole sandboxed command as a fixed,
 *     unprivileged, non-root identity (`LOOPBACK_ONLY_UID`/`_GID`, the
 *     standard `nobody`/`nogroup`) via `sudo setpriv --reuid --regid
 *     --clear-groups`, never the caller's own uid.
 *   - `ensureLoopbackOnlyEgress()` installs one `iptables` OWNER-match rule
 *     pair, once, before that identity is ever used: outbound to
 *     `127.0.0.0/8` accepted, everything else from that uid rejected. This is
 *     the kernel enforcing "loopback and nothing else" for that one identity;
 *     `--unshare-net`'s own network-namespace primitive cannot express "allow
 *     one destination", so this is a different mechanism reaching the same
 *     NFR9 property, not a relaxation of it.
 *   - The sandboxed environment is baked into argv as `env -i KEY=value ...`,
 *     never left to spawnSync's own `env` option: `sudo` resets the
 *     environment by default, and relying on a runner's own sudoers
 *     `env_keep`/`SETENV` policy to carry it through would make this silently
 *     depend on configuration this module does not own.
 *   - The workspace must be owned by `LOOPBACK_ONLY_UID`/`_GID` before this
 *     mode's first use (`prepareWorkspaceOwnership`) and given back to the
 *     caller's own uid before the caller deletes it (`restoreWorkspaceOwnership`):
 *     a directory another uid owns cannot be written into, or recursively
 *     unlinked by anyone but its owner or root, regardless of what the
 *     sandbox itself permits.
 *   - `bwrap`'s own `--chdir` sets the working directory, never the caller's
 *     `cwd` option to `spawnSync`. A first version of this used `spawnSync`'s
 *     `cwd`, which passed every check run as root and failed everywhere else:
 *     `cwd` is applied by the calling process, before `sudo`/`setpriv` have
 *     dropped to `LOOPBACK_ONLY_UID`, against a directory `prepareWorkspaceOwnership`
 *     has already handed away -- `EACCES`, which Node reports as a failure to
 *     spawn `sudo` itself rather than naming the `chdir` that actually failed.
 *     `--chdir` runs after the identity switch, as the identity that owns the
 *     directory, so it always succeeds. Root never exercises this path at
 *     all (root can `chdir` into anything), which is exactly why testing this
 *     mode as root first passed for the wrong reason and only testing as a
 *     genuinely unprivileged sudoer -- the shape every real caller is in --
 *     caught it.
 *
 * Verified live in a `ubuntu:24.04` container matching the CI image, as an
 * unprivileged user granted passwordless `sudo` the way the GitHub Actions
 * runner grants it (not as root, which would never exercise the identity
 * switch that is the whole point), both ways: a direct attempt from the
 * loopback-only identity to the real registry fails closed (`ECONNREFUSED`/DNS
 * failure, before any TLS handshake), and a real `npm install` through the
 * CONNECT-allowlisting proxy, over loopback, succeeds end to end. All four
 * other bubblewrap properties this module already proves -- filesystem write
 * scoping, the CPU budget, a spawned child's isolation matching its parent's
 * -- hold identically under this mode, since none of them are what
 * `--unshare-net` was providing. This is Linux only: `allowHostLoopback` is
 * accepted and ignored on seatbelt, which never needed it.
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

/**
 * The fixed, unprivileged, non-root identity `allowHostLoopback` runs under on
 * bubblewrap: the standard `nobody`/`nogroup` present on essentially every
 * Linux distribution without provisioning an account, chosen so this needs no
 * `useradd` step of its own. Never the caller's own uid: the whole point is an
 * identity `ensureLoopbackOnlyEgress`'s rule can name specifically.
 */
const LOOPBACK_ONLY_UID = 65_534;
const LOOPBACK_ONLY_GID = 65_534;

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
 *   --unshare-user   an unprivileged user namespace, the same mechanism a bare
 *                    `unshare --user` uses, and what lets an ordinary account
 *                    create the namespaces below with no setuid helper
 *   --unshare-net    a fresh network namespace with only loopback, brought up
 *                    already: unlike a bare `unshare --net`, bubblewrap starts
 *                    `lo` itself, so no separate `ip link set lo up` step exists
 *                    to forget
 *   --ro-bind / /    the real filesystem, read-only, so node, Playwright and
 *                    the fixture's own dependencies resolve exactly as they do
 *                    outside the sandbox
 *   --bind ws ws     the one path writable inside that read-only view
 *
 * `--unshare-pid`, `--unshare-ipc` and `--die-with-parent` were tried and
 * reverted: verified live in a plain `ubuntu:24.04` Docker container, but the
 * actual `ubuntu-latest` GitHub Actions runner refused to bring up loopback
 * with them added (`bwrap: loopback: Failed RTM_NEWADDR: Operation not
 * permitted`), a kernel or AppArmor restriction a generic container did not
 * reproduce. Discovered by CI itself on this story's own pull request, which
 * is the story's whole point: a change here that looks right in every local
 * and containerized test can still be wrong on the one machine, this
 * runner image, where the suite actually has to run.
 *
 * @param {{backend: string, profilePath?: string, workspace?: string, cpuSeconds: number, command: string, args: string[], allowHostLoopback?: boolean, env?: Record<string, string>}} options
 * @returns {{command: string, args: string[]}}
 */
function sandboxedCommand({ backend, profilePath, workspace, cpuSeconds, command, args, allowHostLoopback = false, env }) {
  if (!Number.isInteger(cpuSeconds) || cpuSeconds <= 0) throw isolationError(`cpuSeconds must be a positive integer; got ${cpuSeconds}`);
  if (backend === 'seatbelt') {
    if (!profilePath) throw isolationError('seatbelt needs a profile path');
    // allowHostLoopback is a no-op here: the profile above already allows
    // loopback in all three directions while the process shares the host's
    // real network stack, so a host-side loopback service was always reachable.
    return {
      command: 'sh',
      args: ['-c', 'ulimit -t "$0" && exec "$@"', String(cpuSeconds), 'sandbox-exec', '-f', profilePath, command, ...args],
    };
  }
  if (backend === 'bubblewrap') {
    if (!workspace) throw isolationError('bubblewrap needs a workspace path');
    const resolved = assertProfileSafePath(path.resolve(workspace));
    const bwrapArgs = [
      'bwrap',
      '--unshare-user',
      ...(allowHostLoopback ? [] : ['--unshare-net']),
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
      // allowHostLoopback only: bwrap's own --chdir, run after setpriv has
      // already dropped to LOOPBACK_ONLY_UID, which by then owns `resolved`
      // (prepareWorkspaceOwnership). The caller must NOT pass `cwd: workspace`
      // to spawnSync for this mode: that chdir would run as the CALLING
      // process's own uid, before setpriv, against a directory that uid no
      // longer has permission to enter -- measured live: EACCES, misreported
      // by Node as a failure to spawn `sudo` itself rather than naming the
      // real chdir it failed on.
      ...(allowHostLoopback ? ['--chdir', resolved] : []),
      '--',
      command,
      ...args,
    ];
    if (!allowHostLoopback) {
      return { command: 'sh', args: ['-c', 'ulimit -t "$0" && exec "$@"', String(cpuSeconds), ...bwrapArgs] };
    }
    // See the module header, ALLOWHOSTLOOPBACK. `env -i KEY=value ...` bakes
    // the environment into argv rather than relying on spawnSync's own `env`
    // option, which `sudo` resets by default.
    if (!env || typeof env !== 'object') throw isolationError('allowHostLoopback needs the resolved environment to bake into argv');
    const envArgs = Object.entries(env).map(([key, value]) => `${key}=${value}`);
    return {
      command: 'sudo',
      args: [
        'setpriv',
        `--reuid=${LOOPBACK_ONLY_UID}`,
        `--regid=${LOOPBACK_ONLY_GID}`,
        '--clear-groups',
        '--',
        'env',
        '-i',
        ...envArgs,
        'sh',
        '-c',
        'ulimit -t "$0" && exec "$@"',
        String(cpuSeconds),
        ...bwrapArgs,
      ],
    };
  }
  throw isolationError(`unknown isolation backend "${backend}"`);
}

/**
 * Installs the one iptables rule pair `allowHostLoopback` needs, once: outbound
 * to `127.0.0.0/8` accepted for `LOOPBACK_ONLY_UID`, everything else from that
 * uid rejected. Idempotent (`-C` checks before `-A` adds), so a caller running
 * this ahead of every sandboxed call pays nothing on the second and later
 * calls. A no-op on darwin, where seatbelt's own profile already provides this.
 *
 * @param {{platform?: string}} [options]
 * @throws {Error} ISOLATION_UNAVAILABLE when the rule cannot be installed (no sudo, no iptables).
 */
function ensureLoopbackOnlyEgress({ platform = process.platform } = {}) {
  if (platform !== 'linux') return;
  const rules = [
    ['-d', '127.0.0.0/8', '-j', 'ACCEPT'],
    ['-j', 'REJECT', '--reject-with', 'icmp-port-unreachable'],
  ];
  for (const rule of rules) {
    const args = ['iptables', '-C', 'OUTPUT', '-m', 'owner', '--uid-owner', String(LOOPBACK_ONLY_UID), ...rule];
    const check = spawnSync('sudo', args, { encoding: 'utf8' });
    if (check.status === 0) continue;
    const add = spawnSync('sudo', ['iptables', '-A', 'OUTPUT', '-m', 'owner', '--uid-owner', String(LOOPBACK_ONLY_UID), ...rule], {
      encoding: 'utf8',
    });
    if (add.status !== 0) {
      throw isolationError(`could not install the loopback-only egress rule (${rule.join(' ')}): ${(add.stderr || '').trim()}`);
    }
  }
}

/**
 * Gives `workspace` to `allowHostLoopback`'s fixed identity, recursively: that
 * identity cannot write into (or, for `restoreWorkspaceOwnership`, be
 * recursively unlinked out of) a directory it does not own, regardless of what
 * the sandbox itself permits. A no-op on darwin.
 *
 * @param {string} workspace
 * @param {{platform?: string}} [options]
 * @throws {Error} ISOLATION_UNAVAILABLE when the chown fails.
 */
function prepareWorkspaceOwnership(workspace, { platform = process.platform } = {}) {
  if (platform !== 'linux') return;
  const result = spawnSync('sudo', ['chown', '-R', `${LOOPBACK_ONLY_UID}:${LOOPBACK_ONLY_GID}`, workspace], { encoding: 'utf8' });
  if (result.status !== 0)
    throw isolationError(`could not chown ${workspace} to the loopback-only identity: ${(result.stderr || '').trim()}`);
}

/**
 * Gives `workspace` back to the calling process's own uid/gid, so it can
 * delete it: the inverse of `prepareWorkspaceOwnership`, run before the
 * caller's own `fs.rmSync`. A no-op on darwin. Best-effort: a failure here
 * surfaces anyway, loudly, as the `fs.rmSync` that follows it failing.
 *
 * @param {string} workspace
 * @param {{platform?: string}} [options]
 */
function restoreWorkspaceOwnership(workspace, { platform = process.platform } = {}) {
  if (platform !== 'linux') return;
  spawnSync('sudo', ['chown', '-R', `${process.getuid()}:${process.getgid()}`, workspace], { encoding: 'utf8' });
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
  LOOPBACK_ONLY_UID,
  LOOPBACK_ONLY_GID,
  NET_GUARD_PATH,
  buildSeatbeltProfile,
  childEnvironment,
  ensureLoopbackOnlyEgress,
  prepareWorkspaceOwnership,
  probeBackend,
  restoreWorkspaceOwnership,
  sandboxedCommand,
  selectBackend,
};
