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

/** Whether the process `pid` still runs. */
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
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
  const parent = fs.mkdtempSync(path.join(temp, `${prefix}-${process.pid}-`));
  return {
    make: (label) => fs.mkdtempSync(path.join(parent, `${label}-`)),
    removeAll: () => removeTree(parent),
  };
}

module.exports = { scratchDirectories };
