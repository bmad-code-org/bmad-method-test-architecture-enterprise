/**
 * The temp directories one test suite makes, so a run leaves nothing behind.
 *
 * Every directory lies under one parent, `<prefix>-<pid>-XXXXXX` in the
 * system temp directory, and `removeAll` removes it when the suite ends. A
 * suite stopped by a signal leaves a parent whose owner is gone, and the next
 * suite with the same prefix removes it when it starts. No signal handler
 * does this: the suites run their cases through `spawnSync`, so a handler
 * would run only once every case had finished, and the signal would no
 * longer stop the suite.
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { heldPrivateRoot } = require('../../cli/lib/evaluate/workspace');

/** Whether the process `pid` still runs. */
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/**
 * Holds on private parents, kept outside the private root. The reaper below removes the parent of every dead process under
 * the root every run of the user shares, so a case that plants a parent under a dead process id, or waits on the parent of a
 * process it is about to kill, loses it to the reaper of any suite running at the same time. A case holds the owner's process
 * id before the parent exists: `holdPrivateParents(pid)` writes the holder's own process id to a file named for `pid` in a
 * directory beside the root, and the reaper leaves every parent named `run-<pid>-*` while the holder runs. The hold sits
 * outside the parent because the runtime inspects what a parent holds, and a file of the test's inside it would change that. A
 * reaper the holder started itself (its parent process is the holder) ignores the hold, since that is the cycle the holding
 * case waits on.
 *
 * The directory gets the checks the private root gets (`heldPrivateRoot`: a real directory the user owns, no link), a hold is
 * read only when it is a regular file, and a hold is written whole into a staged file made exclusively and renamed into place,
 * so a reader never sees half a hold and a planted link is never written through.
 */
const HOLDS_NAME = `tea-evaluate-test-holds-p${typeof process.getuid === 'function' ? process.getuid() : 'w'}`;
const holdsDirectory = (base = '/tmp') => path.join(base, HOLDS_NAME);
const holdsMade = new Set();

/** Whether `text`, the content of a hold file, names a positive process id that still runs (`kill(0)` and `kill(-1)` never say no). */
function liveHolder(text) {
  const pid = Number(text);
  return Number.isInteger(pid) && pid > 0 && alive(pid);
}

/** The text of a hold file, or `null` when it is not there or is not a regular file (a FIFO would block the read, a link would be followed). */
function readHold(file) {
  let descriptor;
  try {
    descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | (fs.constants.O_NOFOLLOW ?? 0));
    return fs.fstatSync(descriptor).isFile() ? fs.readFileSync(descriptor, 'utf8') : null;
  } catch {
    return null;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

/** Holds every private parent named for the process `ownerPid` until this process releases it or ends. Call before the parent exists. */
function holdPrivateParents(ownerPid, base = '/tmp') {
  if (process.platform === 'win32') return;
  const directory = holdsDirectory(base);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (heldPrivateRoot(directory) === null)
    throw new Error(`${directory} must be a directory you own that is not a link; remove what is there`);
  const file = path.join(directory, String(ownerPid));
  const staged = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(staged, String(process.pid), { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    // Left by an earlier process of this id.
    fs.rmSync(staged, { force: true });
    fs.writeFileSync(staged, String(process.pid), { flag: 'wx' });
  }
  fs.renameSync(staged, file);
  holdsMade.add(`${base}\0${ownerPid}`);
}

/** Releases the holds this process made, each only while it still names this process. */
function releasePrivateParents() {
  for (const key of holdsMade) {
    const [base, ownerPid] = key.split('\0');
    const file = path.join(holdsDirectory(base), ownerPid);
    try {
      if (readHold(file) === String(process.pid)) fs.rmSync(file, { force: true });
    } catch {
      // Already gone.
    }
  }
  holdsMade.clear();
}

/**
 * Whether the holds directory can be trusted: `'absent'` when no suite has held anything, `'held'` when it passes the private
 * root's checks, `'refused'` when something else is there (a link, a directory of another user).
 */
function holdsState(base) {
  try {
    fs.lstatSync(holdsDirectory(base));
  } catch {
    return 'absent';
  }
  return heldPrivateRoot(holdsDirectory(base)) === null ? 'refused' : 'held';
}

/**
 * Removes every regular file of the holds directory that is neither a hold of a running suite nor the staged file of one. A hold
 * is written whole, so a file that names no running process is not a write in progress. Anything that is not a regular file is
 * left as it is.
 */
function sweepHolds(base) {
  const directory = holdsDirectory(base);
  let names;
  try {
    names = fs.readdirSync(directory);
  } catch {
    return;
  }
  for (const name of names) {
    const file = path.join(directory, name);
    try {
      if (!fs.lstatSync(file).isFile()) continue;
      const staged = /^\d+\.(\d+)\.tmp$/.exec(name);
      const live = staged === null ? /^\d+$/.test(name) && liveHolder(readHold(file)) : alive(Number(staged[1]));
      if (!live) fs.rmSync(file, { force: true });
    } catch {
      // The next reaper tries again.
    }
  }
}

/** Whether a running suite holds the parents named for `ownerPid`. */
function held(ownerPid, base = '/tmp') {
  const text = readHold(path.join(holdsDirectory(base), String(ownerPid)));
  // A process the holder started is the holder's own cycle, whose reaping is what the holding case waits for.
  return text !== null && liveHolder(text) && Number(text) !== process.ppid;
}

/**
 * Removes the private parents (`/tmp/tea-evaluate-p<uid>/run-<pid>-<random>`, `workspace.js`) of runtimes that are gone: a
 * run killed with SIGKILL leaves its parent until Story 1.54 reclaims it, and the root is shared by every run of the user, so
 * a suite reaps by the process id in the name and leaves a live run's parent, and one a live suite holds, alone.
 */
function removeDeadPrivateParents(base = '/tmp') {
  if (process.platform === 'win32') return;
  // The root must be a real directory the user owns (the production check, `workspace.js` `heldPrivateRoot`): a link planted
  // in a shared temp directory is never followed into its target.
  const root = heldPrivateRoot(path.join(base, `tea-evaluate-p${process.getuid()}`));
  if (root === null) return;
  let names = [];
  try {
    names = fs.readdirSync(root);
  } catch {
    return;
  }
  // Holds are read only from a directory that passes the private root's checks; with one that does not, nothing is reaped.
  const holds = holdsState(base);
  if (holds === 'refused') return;
  if (holds === 'held') sweepHolds(base);
  for (const name of names) {
    const match = /^run-(\d+)-/.exec(name);
    if (match === null || alive(Number(match[1])) || held(Number(match[1]), base)) continue;
    try {
      removeTree(path.join(root, name));
    } catch {
      // The next suite tries again.
    }
  }
}

/** Removes `directory` and everything in it, write permission restored first where a test took it away. */
function removeTree(directory) {
  const unlock = (current) => {
    fs.chmodSync(current, 0o755);
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) unlock(path.join(current, entry.name));
    }
  };
  try {
    if (fs.lstatSync(directory).isDirectory()) unlock(directory);
  } catch {
    // Gone already, or not unlockable; the removal below reports what matters.
  }
  fs.rmSync(directory, { recursive: true, force: true });
}

/**
 * @param {string} prefix the suite's name prefix, `tea-evaluate-run` say
 * @returns {{ make: (label: string) => string, removeAll: () => void }}
 */
function scratchDirectories(prefix) {
  const temp = fs.realpathSync(os.tmpdir());
  if (!/^[a-z][a-z-]*$/.test(prefix))
    throw new Error(`the scratch prefix ${JSON.stringify(prefix)} must be lowercase words joined by hyphens`);
  const owned = new RegExp(String.raw`^${prefix}-(\d+)-[A-Za-z0-9]{6}$`);
  for (const name of fs.readdirSync(temp)) {
    const match = owned.exec(name);
    if (match !== null && Number(match[1]) !== process.pid && !alive(Number(match[1]))) {
      try {
        removeTree(path.join(temp, name));
      } catch {
        // Another suite's leftovers; the next start tries again.
      }
    }
  }
  removeDeadPrivateParents();
  const parent = fs.mkdtempSync(path.join(temp, `${prefix}-${process.pid}-`));
  return {
    make: (label) => fs.mkdtempSync(path.join(parent, `${label}-`)),
    removeAll: () => {
      removeTree(parent);
      releasePrivateParents();
      removeDeadPrivateParents();
    },
  };
}

module.exports = { holdPrivateParents, liveHolder, releasePrivateParents, removeDeadPrivateParents, scratchDirectories };
