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
 * A file a suite puts in a private parent it plants or waits on, holding the process id of the suite. The reaper below leaves
 * such a parent alone while that process runs: a case that checks what the next `ci` removes of a dead run's parent would
 * otherwise lose the parent to the reaper of a suite running at the same time.
 */
const HOLD_NAME = '.held-by-test';

/** Whether a suite that is still running holds the private parent `directory`. */
function held(directory) {
  try {
    return alive(Number(fs.readFileSync(path.join(directory, HOLD_NAME), 'utf8')));
  } catch {
    return false;
  }
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
  for (const name of names) {
    const match = /^run-(\d+)-/.exec(name);
    if (match === null || alive(Number(match[1])) || held(path.join(root, name))) continue;
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
      removeDeadPrivateParents();
    },
  };
}

module.exports = { HOLD_NAME, removeDeadPrivateParents, scratchDirectories };
