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
 *      warning but never masks the run result. While the tree is locked, SIGINT,
 *      SIGTERM and SIGHUP cannot end the process before that restore, and a lock
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

function isolationError(message) {
  const error = new Error(message);
  error.code = 'ISOLATION_ERROR';
  return error;
}

/**
 * Pick the isolation backend for this platform.
 *
 * @param {object} [env] - Environment to read the override/PATH from.
 * @param {string} [platform] - Platform override for tests.
 * @returns {'sandbox-exec'|'bwrap'|'chmod'|null}
 */
function selectBackend(env = process.env, platform = process.platform) {
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
  if (platform !== 'win32') {
    return 'chmod';
  }
  return null;
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
 * visit every entry. Unreadable entries are skipped rather than aborting: a
 * partial snapshot still restores more than a blanket `chmod -R u+w`.
 */
function walkTree(root, visit) {
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    let stats;
    try {
      stats = fs.lstatSync(current);
    } catch {
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
      } catch {
        continue;
      }
      for (const name of names) {
        stack.push(path.join(current, name));
      }
    }
  }
}

/**
 * Record every entry's permission bits so the lock can be undone exactly.
 * `chmod -R u+w` is not an inverse of `chmod -R a-w`: it drops group/other write
 * bits permanently and makes deliberately read-only files writable, so a local
 * run would silently rewrite the permissions of the tree it was protecting.
 *
 * @returns {Map<string, number>|null} Path to mode, or null when the snapshot
 *   could not be taken (the caller then falls back to the blanket restore).
 */
function snapshotModes(projectRoot) {
  try {
    const modes = new Map();
    walkTree(path.resolve(projectRoot), (entry, stats) => modes.set(entry, stats.mode & 0o7777));
    return modes.size > 0 ? modes : null;
  } catch {
    return null;
  }
}

/**
 * Undo the lock. With a snapshot, every recorded entry goes back to its exact
 * mode; entries created during the run were never locked and are left alone.
 */
function restoreModes(projectRoot, modes) {
  if (modes === null) {
    runChmod(['-R', 'u+w', projectRoot]);
    return;
  }
  for (const [entry, mode] of modes) {
    try {
      fs.chmodSync(entry, mode);
    } catch {
      // entry was removed during the run; nothing to restore
    }
  }
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

/** Where the lock marker for projectRoot lives: outside the locked tree, one per project. */
function lockMarkerPath(projectRoot) {
  let root = path.resolve(projectRoot);
  try {
    root = fs.realpathSync(root);
  } catch {
    // the literal path still names one marker
  }
  const digest = crypto.createHash('sha256').update(root).digest('hex').slice(0, 16);
  return path.join(os.tmpdir(), `tea-test-review-lock-${digest}.json`);
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/**
 * Restore a tree an earlier chmod-isolated run left locked: it was killed in a way no handler could catch (SIGKILL,
 * a lost container). Its marker holds the permission snapshot. A marker of a process still running is left alone.
 *
 * @returns {boolean} Whether a lock was found and restored.
 */
function recoverInterruptedLock(projectRoot) {
  const marker = lockMarkerPath(projectRoot);
  let record;
  try {
    record = JSON.parse(fs.readFileSync(marker, 'utf8'));
  } catch {
    return false;
  }
  if (!record || record.projectRoot !== path.resolve(projectRoot) || processAlive(record.pid)) return false;
  try {
    restoreModes(projectRoot, Array.isArray(record.modes) ? new Map(record.modes) : null);
    fs.rmSync(marker, { force: true });
  } catch (error) {
    console.error(
      `tea-test-review WARNING: a previous run left ${projectRoot} read-only and restoring it failed: ${error.message}. ` +
        'Restore manually with: chmod -R u+w <path>',
    );
    return false;
  }
  console.error(`tea-test-review: restored the write permissions an interrupted run (pid ${record.pid}) left on ${projectRoot}.`);
  return true;
}

/**
 * Lock projectRoot (chmod -R a-w) while keeping the requested artifact paths
 * writable. Only paths inside the project root need unlocking; the root itself
 * stays locked so the agent cannot create new top-level entries.
 */
function prepareChmodLock(projectRoot, writablePaths, onSnapshot = () => {}) {
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
  // The marker is written before the lock, so no moment exists where the tree is locked and nothing records how to undo it.
  fs.writeFileSync(
    lockMarkerPath(projectRoot),
    JSON.stringify({ projectRoot: root, pid: process.pid, modes: modes === null ? null : [...modes] }),
    'utf8',
  );
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

  const root = path.resolve(projectRoot);
  let released = false;
  let locking = false;
  let modes = null;
  const release = () => {
    if (released) return;
    released = true;
    heldLocks.delete(root);
    if (!locking) return; // nothing was locked, so there is nothing to undo
    try {
      restoreModes(projectRoot, modes);
      fs.rmSync(lockMarkerPath(projectRoot), { force: true });
    } catch (error) {
      console.error(
        `tea-test-review WARNING: failed to restore write permissions under ${projectRoot}: ${error.message}. ` +
          'Restore manually with: chmod -R u+w <path>',
      );
    }
  };
  installStopHandlers();
  heldLocks.set(root, release);
  try {
    prepareChmodLock(projectRoot, writablePaths, (snapshot) => {
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
  selectBackend,
  buildSandboxProfile,
  buildBwrapPrefix,
};
