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
 */
const HOLDS_NAME = `tea-evaluate-test-holds-p${typeof process.getuid === 'function' ? process.getuid() : 'w'}`;
const holdsDirectory = (base = '/tmp') => path.join(base, HOLDS_NAME);
const holdsMade = new Set();

/** Whether `text`, the content of a hold file, names a positive process id that still runs (`kill(0)` and `kill(-1)` never say no). */
function liveHolder(text) {
  const pid = Number(text);
  return Number.isInteger(pid) && pid > 0 && alive(pid);
}

/** Holds every private parent named for the process `ownerPid` until this process releases it or ends. Call before the parent exists. */
function holdPrivateParents(ownerPid, base = '/tmp') {
  if (process.platform === 'win32') return;
  fs.mkdirSync(holdsDirectory(base), { recursive: true, mode: 0o700 });
  // Written whole and renamed into place: a reaper that read the file half written would see no holder and remove the hold.
  const file = path.join(holdsDirectory(base), String(ownerPid));
  const staged = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(staged, String(process.pid));
  fs.renameSync(staged, file);
  holdsMade.add(`${base}\0${ownerPid}`);
}

/** Releases the holds this process made. */
function releasePrivateParents() {
  for (const key of holdsMade) {
    const [base, ownerPid] = key.split('\0');
    const file = path.join(holdsDirectory(base), ownerPid);
    try {
      if (fs.readFileSync(file, 'utf8') === String(process.pid)) fs.rmSync(file, { force: true });
    } catch {
      // Already gone.
    }
  }
  holdsMade.clear();
}

/** Whether a running suite holds the parents named for `ownerPid`; a hold of a gone suite is removed. */
function held(ownerPid, base = '/tmp') {
  const file = path.join(holdsDirectory(base), String(ownerPid));
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return false;
  }
  // A process the holder started is the holder's own cycle, whose reaping is what the holding case waits for.
  if (liveHolder(text) && Number(text) !== process.ppid) return true;
  // Only a hold that names a gone process is removed: text that is not a process id may be a write in progress.
  const holder = Number(text);
  if (Number.isInteger(holder) && holder > 0 && !alive(holder)) {
    try {
      fs.rmSync(file, { force: true });
    } catch {
      // The next reaper tries again.
    }
  }
  return false;
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
  // A hold whose suite is gone is removed whether or not a parent is named for it.
  try {
    for (const name of fs.readdirSync(holdsDirectory(base))) if (/^\d+$/.test(name)) held(Number(name), base);
  } catch {
    // No holds yet.
  }
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
