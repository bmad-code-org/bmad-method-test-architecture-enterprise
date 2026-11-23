/**
 * Filesystem isolation for the agent run (owner-approved). The agent may read
 * the whole project but must only write the report/verdict artifacts; nothing
 * else in the tree may be created or modified.
 *
 * Backend preference order:
 *   1. sandbox-exec (darwin): a generated seatbelt profile allows everything
 *      EXCEPT writes outside the writable paths + os.tmpdir(); the agent spawn
 *      is prefixed with `sandbox-exec -f <profile>`.
 *   2. bwrap (linux, when on PATH): binds the project root read-only and a
 *      fresh tmpdir writable.
 *   3. chmod fallback: locks the project root with `chmod -R a-w`, re-enables
 *      writes on the writable paths and their parents, and ALWAYS restores in a
 *      finally from a permission-bit snapshot taken before the lock, so the tree
 *      comes back with its exact original modes. A restore failure prints a loud
 *      warning but never masks the run result. Root ignores permission bits, so
 *      the fallback is never chosen for uid 0: there it would isolate nothing.
 *      While locked, SIGINT, SIGTERM and SIGHUP cannot end the process before
 *      that restore, and a lock
 *      marker in the temp directory lets the next isolated run restore a tree
 *      that a SIGKILL left locked.
 *
 * TEA_TEST_REVIEW_ISOLATION (sandbox-exec|bwrap|chmod|none) overrides backend
 * selection; it exists so tests can force the chmod fallback on any platform.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { assertProfileSafePath, executableOnPath, isInside } = require('./isolation-primitives');

const BACKEND_OVERRIDE_ENV = 'TEA_TEST_REVIEW_ISOLATION';
const CHMOD_SNAPSHOT_VERSION = 1;
const PERMISSION_BITS = 0o7777n;
// Node does not export these platform-specific flags.
const DARWIN_NOFOLLOW_ANY = 0x20_00_00_00;
const LINUX_PATH_ONLY = 0o1000_0000;

function isolationError(message) {
  const error = new Error(message);
  error.code = 'ISOLATION_ERROR';
  return error;
}

/** The effective uid, or null where the platform has none (win32). */
function currentUid() {
  return typeof process.getuid === 'function' ? process.getuid() : null;
}

/** Why chmod cannot isolate a run as root, for the messages that would otherwise name it as an option. */
const CHMOD_ROOT_REASON =
  'chmod cannot isolate a run as root, because root ignores permission bits; install bubblewrap (bwrap) or run as a non-root user';

/**
 * Pick the isolation backend for this platform.
 *
 * @param {object} [env] - Environment to read the override/PATH from.
 * @param {string} [platform] - Platform override for tests.
 * @param {number|null} [uid] - Effective uid override for tests; root (0) never gets the chmod fallback.
 * @returns {'sandbox-exec'|'bwrap'|'chmod'|null}
 */
function selectBackend(env = process.env, platform = process.platform, uid = currentUid()) {
  const override = env[BACKEND_OVERRIDE_ENV];
  if (override) {
    if (override === 'none') {
      return null;
    }
    if (override === 'sandbox-exec' && platform === 'darwin') {
      return 'sandbox-exec';
    }
    if (override === 'bwrap' && platform === 'linux') {
      return 'bwrap';
    }
    if (override === 'chmod' && platform !== 'win32') {
      if (uid === 0) {
        // Forcing a backend that cannot hold must fail, like a wrong platform, not run the agent unrestricted.
        throw isolationError(`${BACKEND_OVERRIDE_ENV}=chmod: ${CHMOD_ROOT_REASON}.`);
      }
      return 'chmod';
    }
    // A typo (e.g. "chmodd") or a backend name that is real but wrong for this
    // platform (e.g. "bwrap" on darwin) must not silently degrade to "no
    // isolation": that would run the agent unsandboxed while looking, from the
    // log, exactly like a deliberate "none". Only the literal "none" opts out.
    throw isolationError(
      `${BACKEND_OVERRIDE_ENV}="${override}" is not a valid isolation backend for ${platform} ` +
        '(sandbox-exec on darwin, bwrap on linux, chmod on darwin/linux, or none).',
    );
  }
  if (platform === 'darwin' && executableOnPath('sandbox-exec', env) !== null) {
    return 'sandbox-exec';
  }
  if (platform === 'linux' && executableOnPath('bwrap', env) !== null) {
    return 'bwrap';
  }
  if (platform !== 'win32' && uid !== 0) {
    return 'chmod';
  }
  return null;
}

/**
 * Why no backend is available, for the warning or the exit 2 that follows: the root case names its own fix.
 *
 * @param {string} [platform] - Platform override for tests.
 * @param {number|null} [uid] - Effective uid override for tests.
 * @returns {string}
 */
function noBackendReason(platform = process.platform, uid = currentUid()) {
  if (platform !== 'win32' && uid === 0) {
    return `no isolation backend is available: ${CHMOD_ROOT_REASON}`;
  }
  return 'no isolation backend (sandbox-exec, bwrap, chmod) is available on this platform';
}

/**
 * Whether any isolation backend can run on this machine. Propagates
 * selectBackend's ISOLATION_ERROR for an invalid override rather than
 * swallowing it to a plain `false` — a typo is a config bug, not "unavailable".
 */
function isolationAvailable() {
  return selectBackend() !== null;
}

function refuseUnsafePath(filePath) {
  return isolationError(`Path cannot be embedded in a sandbox profile: ${JSON.stringify(filePath)}`);
}

// The skill's own step contract hard-codes /tmp: steps-c/step-03a..03e each
// declare `outputFile: /tmp/tea-test-review-<dimension>-<run_key>-<timestamp>.json`, and
// step-03 section 5 aborts the workflow when any of them is missing. On darwin
// os.tmpdir() is /var/folders/.../T, so /tmp needs its own entry or every
// isolated run fails inside the skill rather than at the gate.
const SKILL_TMP_DIR = '/tmp';

/**
 * Build the seatbelt profile: allow everything by default, deny all writes,
 * then re-allow writes under os.tmpdir(), /tmp (the skill's subagent output
 * directory), and the writable paths (each with its realpath, since /var
 * symlinks to /private/var on darwin).
 *
 * @param {string[]} writablePaths - Absolute paths the agent may write.
 * @param {string} [tmpDir] - Temp directory root (defaults to os.tmpdir()).
 * @returns {string} Profile source.
 */
function buildSandboxProfile(writablePaths, tmpDir = os.tmpdir()) {
  const allowed = new Set();
  for (const candidate of [tmpDir, SKILL_TMP_DIR, ...writablePaths]) {
    const resolved = path.resolve(candidate);
    allowed.add(resolved);
    try {
      allowed.add(fs.realpathSync(resolved));
    } catch {
      // path may not exist yet; the literal entry still covers it
    }
  }
  // A link can name a path no profile carries, so every spelling is checked, the real one included.
  const subpaths = [...allowed].map((entry) => `    (subpath "${assertProfileSafePath(entry, refuseUnsafePath)}")`).join('\n');
  return ['(version 1)', '(allow default)', '(deny file-write*)', `(allow file-write*\n${subpaths})`, ''].join('\n');
}

/**
 * Build the bwrap spawn prefix: the real filesystem with the project root
 * rebound read-only and a fresh tmpdir bound writable.
 *
 * @param {string} projectRoot - Absolute project root.
 * @param {string} writableTmp - Fresh writable temp directory.
 * @returns {string[]}
 */
function buildBwrapPrefix(projectRoot, writableTmp) {
  assertProfileSafePath(projectRoot, refuseUnsafePath);
  assertProfileSafePath(writableTmp, refuseUnsafePath);
  return [
    'bwrap',
    '--dev-bind',
    '/',
    '/',
    '--ro-bind',
    projectRoot,
    projectRoot,
    '--bind',
    writableTmp,
    writableTmp,
    '--chdir',
    projectRoot,
  ];
}

function runChmod(args) {
  const result = spawnSync('chmod', args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    const detail = ((result.stderr || '').trim() || (result.error && result.error.message) || 'unknown chmod error').trim();
    throw isolationError(`chmod ${args.join(' ')} failed: ${detail}`);
  }
}

/** Parent directories of a path that sit strictly below projectRoot. */
function lockedParents(writablePath, projectRoot) {
  const chain = [];
  let current = path.dirname(path.resolve(writablePath));
  const stop = path.resolve(projectRoot);
  while (current !== stop && current !== path.dirname(current)) {
    chain.push(current);
    current = path.dirname(current);
  }
  return chain;
}

/**
 * Walk a tree depth-first without following symlinks (matching `chmod -R`), and
 * visit every entry that still exists. A tree we cannot read cannot be locked
 * with a complete permission snapshot.
 */
function walkTree(root, visit) {
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    let stats;
    try {
      stats = fs.lstatSync(current, { bigint: true });
    } catch (error) {
      if (error.code !== 'ENOENT') throw isolationError(`cannot snapshot permissions for ${current}: ${error.message}`);
      continue;
    }
    if (stats.isSymbolicLink()) {
      continue;
    }
    visit(current, stats);
    if (stats.isDirectory()) {
      let names;
      try {
        names = fs.readdirSync(current);
      } catch (error) {
        if (error.code !== 'ENOENT') throw isolationError(`cannot snapshot permissions under ${current}: ${error.message}`);
        continue;
      }
      for (const name of names) {
        stack.push(path.join(current, name));
      }
    }
  }
}

/** Record the permission bits and identity of each entry before locking it. */
function snapshotModes(projectRoot) {
  const modes = new Map();
  walkTree(projectRoot, (entry, stats) => {
    const saved = {
      mode: Number(stats.mode & PERMISSION_BITS),
      dev: stats.dev.toString(),
      ino: stats.ino.toString(),
      birth: stats.birthtimeNs.toString(),
    };
    // Check procfs before locking on Linux. On macOS, make sure every writable entry can still be opened after the lock.
    if ((process.platform === 'linux' && entry === projectRoot) || (process.platform === 'darwin' && (saved.mode & 0o222) !== 0)) {
      try {
        fs.closeSync(openChmodEntry(entry, saved));
      } catch (error) {
        throw isolationError(`cannot safely recover permissions for ${entry}: ${error.message}`);
      }
    }
    modes.set(entry, saved);
  });
  if (modes.size === 0) throw isolationError(`cannot take a permission snapshot of ${projectRoot}`);
  return modes;
}

function matchesSnapshot(stats, saved) {
  return (
    !stats.isSymbolicLink() &&
    stats.dev.toString() === saved.dev &&
    stats.ino.toString() === saved.ino &&
    stats.birthtimeNs.toString() === saved.birth
  );
}

function changedEntry(entry) {
  return new Error(`${entry} no longer names the recorded file or directory`);
}

/** Pin the object before changing its permissions. On Linux O_PATH also covers unreadable files and special entries. */
function openChmodEntry(entry, saved) {
  const flags =
    process.platform === 'linux'
      ? LINUX_PATH_ONLY | fs.constants.O_NOFOLLOW
      : fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | (process.platform === 'darwin' ? DARWIN_NOFOLLOW_ANY : fs.constants.O_NOFOLLOW);
  const descriptor = fs.openSync(entry, flags);
  try {
    if (!matchesSnapshot(fs.fstatSync(descriptor, { bigint: true }), saved)) throw changedEntry(entry);
    // Linux's leaf-only no-follow flag allows intermediate symlinks. Verify the kernel's path for the pinned object.
    if (process.platform === 'linux' && fs.readlinkSync(`/proc/self/fd/${descriptor}`) !== entry) throw changedEntry(entry);
    return descriptor;
  } catch (error) {
    fs.closeSync(descriptor);
    throw error;
  }
}

/** Restore only the recorded objects. A missing entry needs no restoration. */
function restoreModes(modes) {
  let firstError;
  for (const [entry, saved] of modes) {
    try {
      const current = fs.lstatSync(entry, { bigint: true });
      if (!matchesSnapshot(current, saved)) throw changedEntry(entry);
      if (Number(current.mode & PERMISSION_BITS) === saved.mode) continue;
      const descriptor = openChmodEntry(entry, saved);
      try {
        if (process.platform === 'linux') fs.chmodSync(`/proc/self/fd/${descriptor}`, saved.mode);
        else fs.fchmodSync(descriptor, saved.mode);
      } finally {
        fs.closeSync(descriptor);
      }
    } catch (error) {
      // A missing procfs descriptor or a failed chmod is an incomplete restore, not a removed project entry.
      if (error.code !== 'ENOENT' || error.path !== entry) firstError ??= error;
    }
  }
  if (firstError) throw firstError;
}

// Signals that end a run from outside (Ctrl-C, a cancelled CI job, a closed terminal). Node's default for each is
// to exit at once, which would skip the restore and leave the whole tree, .git included, read-only.
const STOP_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];

/** The locks this process holds now: project root to restore function. */
const heldLocks = new Map();
let stopHandlersInstalled = false;

/**
 * Keep a stop signal from killing the process while a tree is locked. The agent runs under spawnSync, so a handler
 * runs only once that returns: by then the supervisor, which gets the same signal, has stopped the agent and
 * withIsolation's finally has restored the tree. If a lock is still held when the handler runs, it restores it.
 * Either way it then re-raises the signal with Node's default action, so the process ends as the signal asked.
 */
function installStopHandlers() {
  if (stopHandlersInstalled) return;
  stopHandlersInstalled = true;
  const onStop = (signal) => {
    for (const restore of heldLocks.values()) restore();
    for (const name of STOP_SIGNALS) process.removeListener(name, onStop);
    stopHandlersInstalled = false;
    process.kill(process.pid, signal);
  };
  for (const name of STOP_SIGNALS) process.on(name, onStop);
}

/** The real path of projectRoot, so a project reached through a symlink has one identity and one marker. */
function canonicalRoot(projectRoot) {
  const resolved = path.resolve(projectRoot);
  try {
    return fs.realpathSync(resolved);
  } catch {
    return resolved;
  }
}

/** The per-user directory the lock markers live in: in the temp directory, but only this user can enter it. */
function markerDirectory() {
  const uid = currentUid();
  return path.join(os.tmpdir(), `tea-test-review-${uid === null ? 'user' : uid}`);
}

/**
 * Whether the marker directory is one this user owns and nobody else can write: a directory (not a link), owned by
 * this uid, with no group or other permission bits. Anything else in its place may have been planted.
 */
function markerDirectoryTrusted(directory) {
  let stats;
  try {
    stats = fs.lstatSync(directory);
  } catch {
    return false;
  }
  const uid = currentUid();
  return stats.isDirectory() && !stats.isSymbolicLink() && (uid === null || stats.uid === uid) && (stats.mode & 0o077) === 0;
}

/** Create the marker directory owner-only, or refuse one that is not; a planted directory must never hold a marker. */
function ensureMarkerDirectory() {
  const directory = markerDirectory();
  try {
    fs.mkdirSync(directory, { mode: 0o700 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw isolationError(`cannot create the chmod lock directory ${directory}: ${error.message}`);
  }
  if (!markerDirectoryTrusted(directory)) {
    throw isolationError(
      `the chmod lock directory ${directory} is not a directory owned by this user with mode 0700; remove it and rerun.`,
    );
  }
  return directory;
}

/** Where the lock marker for projectRoot lives: outside the locked tree, one per project, in the per-user directory. */
function lockMarkerPath(projectRoot) {
  const digest = crypto.createHash('sha256').update(canonicalRoot(projectRoot)).digest('hex').slice(0, 16);
  return path.join(markerDirectory(), `lock-${digest}.json`);
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/**
 * Read a marker-format file, or null: only a regular file this user owns (never through a link), holding a complete
 * record for this project. A marker is only ever published whole, so anything unparseable is not ours to act on.
 */
function readMarkerFile(file, root) {
  let text;
  try {
    const stats = fs.lstatSync(file);
    const uid = currentUid();
    if (!stats.isFile() || (uid !== null && stats.uid !== uid)) return null;
    const descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    try {
      text = fs.readFileSync(descriptor, 'utf8');
    } finally {
      fs.closeSync(descriptor);
    }
    const record = JSON.parse(text);
    return record && typeof record === 'object' && record.projectRoot === root ? record : null;
  } catch {
    return null;
  }
}

/** Read the lock marker at markerPath, or null; it is read only from a trusted marker directory. */
function readMarker(markerPath, root) {
  if (!markerDirectoryTrusted(path.dirname(markerPath))) return null;
  return readMarkerFile(markerPath, root);
}

/** A private name beside the marker, unique to this call: a file there is this process's alone. */
function privateName(marker, kind) {
  return `${marker}.${kind}.${process.pid}.${crypto.randomBytes(6).toString('hex')}`;
}

/** Write a complete marker record to a new private file (never an existing one), flushed to disk. */
function writeRecordFile(file, root, record) {
  const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0);
  const descriptor = fs.openSync(file, flags, 0o600);
  try {
    fs.writeFileSync(descriptor, JSON.stringify({ projectRoot: root, pid: process.pid, ...record }), 'utf8');
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

/** Decode a snapshot only when every entry has an identity and names a path inside the project. */
function markerSnapshot(record, root) {
  if (!Array.isArray(record.modes) || record.modes.length === 0) return false;
  const modes = new Map();
  for (const item of record.modes) {
    if (!Array.isArray(item) || item.length !== 2) return false;
    const [entry, saved] = item;
    if (typeof entry !== 'string' || !path.isAbsolute(entry) || path.resolve(entry) !== entry || !isInside(root, entry)) return false;
    if (saved === null || typeof saved !== 'object' || !Number.isInteger(saved.mode) || saved.mode < 0 || saved.mode > 0o7777) return false;
    if (![saved.dev, saved.ino, saved.birth].every((id) => typeof id === 'string' && /^-?\d+$/.test(id))) return false;
    modes.set(entry, saved);
  }
  return modes;
}

/**
 * Restore a tree an earlier chmod-isolated run left locked: it was killed in a way no handler could catch (SIGKILL,
 * a lost container). Its marker holds the permission snapshot. A marker of a process still running is left alone,
 * and one that names a path outside the project is refused rather than applied.
 *
 * @returns {boolean} Whether a lock was found and restored.
 */
function recoverInterruptedLock(projectRoot) {
  const root = canonicalRoot(projectRoot);
  const marker = lockMarkerPath(root);
  const record = readMarker(marker, root);
  if (record === null || processAlive(record.pid)) return false;
  // Serialize stale recovery separately while leaving the original marker at
  // its canonical name. Acquirers must keep seeing it until restoration is done.
  const claim = `${marker}.recover`;
  try {
    fs.mkdirSync(claim, { mode: 0o700 });
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw isolationError(`cannot claim chmod lock recovery for ${root}: ${error.message}`);
  }
  try {
    // The lock may have been recovered or acquired by another process since
    // the first read. Never restore based on a record read before the claim.
    const claimed = readMarker(marker, root);
    if (claimed === null || processAlive(claimed.pid)) return false;
    if (claimed.locked !== true) {
      fs.rmSync(marker, { force: true });
      return false;
    }
    if (claimed.snapshotVersion !== CHMOD_SNAPSHOT_VERSION) {
      console.error(
        `tea-test-review WARNING: cannot automatically restore ${root} from the older chmod lock marker ${marker}: it lacks file identities. ` +
          'Review the recorded paths and restore their permissions manually before removing the marker.',
      );
      return false;
    }
    const snapshot = markerSnapshot(claimed, root);
    if (snapshot === false) {
      console.error(
        `tea-test-review WARNING: ignoring the chmod lock marker ${marker}: it names a path outside ${root} or has an invalid permission snapshot. ` +
          'Review the recorded paths and restore their permissions manually before removing the marker.',
      );
      return false;
    }
    try {
      restoreModes(snapshot);
    } catch (error) {
      console.error(
        `tea-test-review WARNING: a previous run left ${root} read-only and restoring it failed: ${error.message}. ` +
          'Review the recorded paths and restore their permissions manually before removing the marker.',
      );
      return false;
    }
    fs.rmSync(marker, { force: true });
    console.error(`tea-test-review: restored the write permissions an interrupted run (pid ${claimed.pid}) left on ${root}.`);
    return true;
  } finally {
    fs.rmdirSync(claim);
  }
}

/**
 * Take the lock marker for root before anything is snapshotted or locked. The record is written whole to a private
 * file and published with an exclusive hard link, so the marker either does not exist or is complete: no run ever
 * sees an empty one, and a second run on the same project cannot record the first run's locked modes as its own.
 * A live holder fails this run; a dead holder's lock is recovered first.
 *
 * @returns {{ write: (record: object) => void, remove: () => void }}
 */
function acquireLockMarker(root) {
  ensureMarkerDirectory();
  const marker = lockMarkerPath(root);
  const initial = privateName(marker, 'new');
  writeRecordFile(initial, root, { locked: false, modes: null });
  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        fs.linkSync(initial, marker);
        break;
      } catch (error) {
        if (error.code !== 'EEXIST') throw isolationError(`cannot take the chmod lock for ${root}: ${error.message}`);
        const holder = readMarker(marker, root);
        if (holder !== null && processAlive(holder.pid)) {
          throw isolationError(
            `another tea-test-review run (pid ${holder.pid}) holds the chmod lock on ${root}; wait for it to finish and rerun.`,
          );
        }
        if (attempt > 0) {
          const claim = `${marker}.recover`;
          if (fs.existsSync(claim)) {
            throw isolationError(
              `chmod lock recovery for ${root} is already claimed at ${claim}; wait for it to finish. ` +
                'If the recovering process was killed, make sure no recovery is running, then remove only the empty .recover directory and retry.',
            );
          }
          throw isolationError(`a chmod lock marker ${marker} could not be recovered; check ${root} and remove the marker.`);
        }
        recoverInterruptedLock(root);
      }
    }
  } finally {
    fs.rmSync(initial, { force: true });
  }
  // Each update is written whole beside the marker and renamed over it, so a run killed mid-write leaves the previous
  // complete record, never a torn one.
  const write = (record) => {
    const temporary = privateName(marker, 'tmp');
    try {
      writeRecordFile(temporary, root, record);
      fs.renameSync(temporary, marker);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  };
  const remove = () => fs.rmSync(marker, { force: true });
  return { write, remove };
}

/**
 * Lock projectRoot (chmod -R a-w) while keeping the requested artifact paths
 * writable. Only paths inside the project root need unlocking; the root itself
 * stays locked so the agent cannot create new top-level entries.
 */
function prepareChmodLock(projectRoot, writablePaths, marker, onSnapshot = () => {}) {
  const root = path.resolve(projectRoot);
  const insidePaths = writablePaths.map((entry) => path.resolve(entry)).filter((entry) => entry !== root && isInside(root, entry));
  // Snapshot phase: the artifact parent directories must exist before the tree
  // is locked, because they cannot be created afterwards. The artifact files
  // themselves are pre-created empty for the same reason: an artifact that sits
  // directly in the project root has no unlockable parent (the root stays
  // locked so the agent cannot add top-level entries), and writing it later
  // would need a directory it is not allowed to modify. Truncating an existing
  // file only needs permission on the file, which the unlock phase grants.
  // This never widens the stale-report window: under isolation the agent writes
  // into the redirect tmpdir, and the freshness check runs against that path.
  for (const entry of insidePaths) {
    fs.mkdirSync(path.dirname(entry), { recursive: true });
    if (!fs.existsSync(entry)) {
      fs.writeFileSync(entry, '');
    }
  }
  const modes = snapshotModes(projectRoot);
  // The snapshot is in the marker before the lock, so no moment exists where the tree is locked and nothing records
  // how to undo it.
  marker.write({ locked: true, snapshotVersion: CHMOD_SNAPSHOT_VERSION, modes: [...modes] });
  onSnapshot(modes);
  runChmod(['-R', 'a-w', projectRoot]);
  for (const entry of insidePaths) {
    if (fs.existsSync(entry)) {
      runChmod(['u+w', entry]);
    }
    for (const parent of lockedParents(entry, projectRoot)) {
      runChmod(['u+w', parent]);
    }
  }
  return modes;
}

/**
 * Run fn under filesystem isolation. fn receives { agentCwd, spawnPrefix };
 * spawnPrefix is prepended to the agent command (sandbox-exec/bwrap) or empty
 * (chmod, where the restriction is filesystem state rather than a wrapper).
 *
 * @param {string} projectRoot - Absolute project root (the tree to protect).
 * @param {string[]} writablePaths - Artifact paths that must stay writable.
 * @param {(context: {agentCwd: string, spawnPrefix: string[]}) => any} fn
 * @returns {any} fn's return value.
 */
function withIsolation(projectRoot, writablePaths, fn) {
  recoverInterruptedLock(projectRoot);
  const backend = selectBackend();
  if (backend === null) {
    return fn({ agentCwd: projectRoot, spawnPrefix: [] });
  }

  if (backend === 'sandbox-exec') {
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-test-review-profile-'));
    const profilePath = path.join(profileDir, 'tea-test-review.sb');
    fs.writeFileSync(profilePath, buildSandboxProfile(writablePaths), 'utf8');
    try {
      return fn({ agentCwd: projectRoot, spawnPrefix: ['sandbox-exec', '-f', profilePath] });
    } finally {
      fs.rmSync(profileDir, { recursive: true, force: true });
    }
  }

  if (backend === 'bwrap') {
    const writableTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-test-review-bwrap-'));
    try {
      return fn({ agentCwd: projectRoot, spawnPrefix: buildBwrapPrefix(path.resolve(projectRoot), writableTmp) });
    } finally {
      fs.rmSync(writableTmp, { recursive: true, force: true });
    }
  }

  // The lock works on the project's real path, so the marker, the snapshot and the restore agree on one identity.
  const root = canonicalRoot(projectRoot);
  const resolved = path.resolve(projectRoot);
  const lockedWritable = writablePaths.map((entry) => {
    const absolute = path.resolve(entry);
    return isInside(resolved, absolute) ? path.join(root, path.relative(resolved, absolute)) : absolute;
  });
  let released = false;
  let marker = null;
  let locking = false;
  let modes = null;
  const release = () => {
    if (released) return;
    released = true;
    heldLocks.delete(root);
    if (marker === null) return; // the lock was never taken
    if (!locking) {
      marker.remove(); // nothing was locked, so there is nothing to undo
      return;
    }
    try {
      restoreModes(modes);
      marker.remove();
    } catch (error) {
      console.error(
        `tea-test-review WARNING: failed to restore write permissions under ${root}: ${error.message}. ` +
          'Review the recorded paths and restore their permissions manually before removing the marker.',
      );
    }
  };
  installStopHandlers();
  heldLocks.set(root, release);
  try {
    marker = acquireLockMarker(root);
    prepareChmodLock(root, lockedWritable, marker, (snapshot) => {
      modes = snapshot;
      locking = true;
    });
    return fn({ agentCwd: projectRoot, spawnPrefix: [] });
  } finally {
    release();
  }
}

module.exports = {
  withIsolation,
  lockMarkerPath,
  recoverInterruptedLock,
  isolationAvailable,
  noBackendReason,
  selectBackend,
  buildSandboxProfile,
  buildBwrapPrefix,
};
