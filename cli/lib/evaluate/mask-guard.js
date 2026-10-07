/**
 * The cleanup that follows an evaluation-layer process whose Bubblewrap vector hides host sockets (Story 1.88, AD-8).
 *
 * The layer's `/` is a writable bind of the host's, so a mount over a path that went away makes Bubblewrap create an empty file there.
 * Bubblewrap (v0.9.0) runs `realpath` on every bind source before any mount, so a socket that went away before the start stops the start and makes no file.
 * `setup_newroot` then handles each bind in turn.
 * It reads the source's type, makes the destination's parent directories (`mkdir_with_parents`), makes the destination as an empty file when it is gone (`ensure_file`, `creat` with mode 0444) and mounts.
 * A socket its owner removes after the `realpath` pass and before the mask's mount can therefore leave an empty file, and the directories above it, at its path on the host.
 * No Bubblewrap option skips the destination's creation, and none of its descriptors reports that the setup finished (`--info-fd` and `--json-status-fd` report the child's pid before `setup_newroot`, `--block-fd` holds the child after it).
 * So the guard acts when the process has ended.
 *
 * `startMaskGuard` records, right before the start, the state of each masked path and of each directory above it, in a file the runtime writes atomically beneath the user's private root.
 * `settle`, which every spawn site calls when the process has ended however it ended, removes what Bubblewrap made under `removePlaceholders`' rule and then deletes the record.
 * A runtime that was killed between the start and `settle` leaves the record, and `sweepMaskRecords` (run by `workspace.js` recovery) applies the same rule for the dead run.
 * The empty file can exist at the path for as long as the process runs; it is no route to anything, since it is a regular file with no content.
 *
 * The layer cannot write a record: the macOS layer profile denies every write to the private root and to each entry directly in it, and every Bubblewrap vector binds the root read-only with the run's own private parent writable, whatever the number of sockets it hides.
 * The rule trusts a record as little as it can, since a process of the same user that the layer does not confine could write one.
 * It reads a path, the state of that path before the start and the instant of the start from the record, and every other field with `lstat` at removal.
 * The sweep deletes a record whose instant of the start is more than `CLOCK_SLACK_MS` away from the record file's own `ctime` (a process cannot set a `ctime` back), a record another user owns, a record whose mode is not 0600 and a record whose pid differs from the pid in its name.
 * The removal needs a placeholder that a change at or after the start stamped and that was also born at or after the start.
 * A record that names the git directory with `launchedAt: 0` passes the birth test for every path, so the sweep's `ctime` check alone deletes that record and removes nothing.
 * For a record whose `launchedAt` matches its own change time, the birth rule keeps a path that stood before the start.
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

/** The name of a record: `mask-<pid of the runtime>-<random>.json`. */
const MASK_RECORD_NAME = /^mask-([1-9][0-9]*)-([0-9a-f]{16})\.json$/;

/** The record's `kind`. */
const MASK_RECORD_KIND = 'layer-mask';

/** File systems stamp a change with a coarse clock, so a placeholder's `ctime` may read this much before the instant the guard noted. */
const CLOCK_SLACK_MS = 2000;

/** What a path is, by `lstat`: `absent` when it is gone, otherwise its type with its device and inode. */
function observe(file, fileSystem) {
  let stat;
  try {
    stat = fileSystem.lstatSync(file);
  } catch {
    return { state: 'absent' };
  }
  const state = stat.isSocket() ? 'socket' : stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other';
  return { state, dev: stat.dev, ino: stat.ino };
}

/** The directories above `file`, nearest first, up to but not including the root. */
function ancestorsOf(file) {
  const found = [];
  for (let directory = path.dirname(file); directory !== path.dirname(directory); directory = path.dirname(directory))
    found.push(directory);
  return found;
}

/**
 * The state of each masked path and of every directory above one, as the record carries it.
 *
 * @param {string[]} sockets absolute paths the vector masks
 * @param {object} fileSystem
 * @returns {{ sockets: object[], directories: object[] }}
 */
function captureStates(sockets, fileSystem) {
  const directories = new Map();
  for (const socket of sockets) {
    for (const directory of ancestorsOf(socket)) {
      if (!directories.has(directory)) directories.set(directory, { path: directory, ...observe(directory, fileSystem) });
    }
  }
  return {
    sockets: sockets.map((socket) => ({ path: socket, ...observe(socket, fileSystem) })),
    directories: [...directories.values()],
  };
}

/** Whether a record's field holds a path the rule may act on. */
function isRecordedPath(value) {
  return typeof value === 'string' && path.isAbsolute(value) && path.normalize(value) === value && !value.includes('\0');
}

/** Whether an entry of a record is well formed: a path, a state and, for any state but `absent`, a device and an inode. */
function isRecordedEntry(entry) {
  if (entry === null || typeof entry !== 'object' || !isRecordedPath(entry.path)) return false;
  if (entry.state === 'absent') return true;
  return ['socket', 'directory', 'file', 'other'].includes(entry.state) && Number.isFinite(entry.dev) && Number.isFinite(entry.ino);
}

/** Whether `value` is a record this module wrote: `version`, `kind`, the runtime's pid, the instant of the start and the states. */
function isMaskRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    value.version === 1 &&
    value.kind === MASK_RECORD_KIND &&
    Number.isSafeInteger(value.ownerPid) &&
    value.ownerPid > 0 &&
    Number.isFinite(value.launchedAt) &&
    Array.isArray(value.sockets) &&
    value.sockets.every(isRecordedEntry) &&
    Array.isArray(value.directories) &&
    value.directories.every(isRecordedEntry)
  );
}

/**
 * Removes what Bubblewrap made at the masked paths of `record`, and nothing else; teardown and recovery both call it, so they cannot drift.
 * A masked path is removed only when it was a socket or absent before the start and is now an empty regular file with no write bit that the runtime's user owns, a change at or after the start stamped and a birth at or after the start.
 * A regular file that stood before the start, a socket the owner made again and a file with content stay.
 * A path whose birth time reads 0 or is unavailable stays too, since the rule cannot tell when it was made.
 * Then each directory above one, deepest first, is removed only when it was absent before the start or is another device or inode than it was, and is now an empty directory that the runtime's user owns, a change at or after the start stamped and a birth at or after the start.
 * `mkdir_with_parents` made such a directory again, and `rmdir` never removes a directory with an entry.
 *
 * @param {object} record
 * @param {object} [options]
 * @param {object} [options.fileSystem]
 * @param {number|null} [options.uid] the runtime's user
 * @returns {{ files: string[], directories: string[], failed: string[] }} what was removed, and the paths that could not be
 */
function removePlaceholders(record, { fileSystem = fs, uid = process.getuid?.() ?? null } = {}) {
  const removed = { files: [], directories: [], failed: [] };
  if (uid === null) return removed;
  const since = record.launchedAt - CLOCK_SLACK_MS;
  const stampedSince = (stat) => stat.ctimeMs >= since;
  // A birth time of 0 (or none) says nothing about when the path was made, so the path stays.
  const bornSince = (stat) => Number.isFinite(stat.birthtimeMs) && stat.birthtimeMs > 0 && stat.birthtimeMs >= since;
  for (const entry of record.sockets) {
    if (entry.state !== 'absent' && entry.state !== 'socket') continue;
    let stat;
    try {
      stat = fileSystem.lstatSync(entry.path);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.size > 0 || stat.uid !== uid || (stat.mode & 0o222) !== 0 || !stampedSince(stat) || !bornSince(stat))
      continue;
    try {
      fileSystem.unlinkSync(entry.path);
      removed.files.push(entry.path);
    } catch (error) {
      if (error?.code !== 'ENOENT') removed.failed.push(entry.path);
    }
  }
  const depth = (directory) => directory.split(path.sep).length;
  for (const entry of [...record.directories].sort((a, b) => depth(b.path) - depth(a.path) || (a.path < b.path ? -1 : 1))) {
    if (entry.state !== 'absent' && entry.state !== 'directory') continue;
    let stat;
    try {
      stat = fileSystem.lstatSync(entry.path);
    } catch {
      continue;
    }
    const sameDirectory = entry.state === 'directory' && stat.dev === entry.dev && stat.ino === entry.ino;
    if (!stat.isDirectory() || sameDirectory || stat.uid !== uid || !stampedSince(stat) || !bornSince(stat)) continue;
    try {
      if (fileSystem.readdirSync(entry.path).length > 0) continue;
      fileSystem.rmdirSync(entry.path);
      removed.directories.push(entry.path);
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.code !== 'ENOTEMPTY') removed.failed.push(entry.path);
    }
  }
  return removed;
}

/** Writes `contents` to `file` atomically: a temporary name in the same directory, then a rename. */
function writeAtomically(file, contents, fileSystem) {
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${crypto.randomBytes(4).toString('hex')}.tmp`);
  try {
    const descriptor = fileSystem.openSync(
      temporary,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    try {
      // A restrictive umask could clear the owner's bits, and the sweep reads exactly 0600.
      fileSystem.fchmodSync?.(descriptor, 0o600);
      fileSystem.writeFileSync(descriptor, contents);
      fileSystem.fsyncSync(descriptor);
    } finally {
      fileSystem.closeSync(descriptor);
    }
    fileSystem.renameSync(temporary, file);
  } catch (error) {
    fileSystem.rmSync(temporary, { force: true });
    throw error;
  }
}

/**
 * Notes the state of each path in `sockets` and of the directories above them in a record, right before a process starts through a vector that masks them.
 *
 * @param {object} options
 * @param {string[]} options.sockets absolute paths the vector masks
 * @param {string|null} options.recordDirectory the directory the record is written in (the user's private root), or `null` where there is none
 * @param {object} [options.fileSystem]
 * @param {() => number} [options.now]
 * @param {number|null} [options.uid]
 * @returns {{ settle: () => void }} `settle` removes the placeholders and the record; it is safe to call again and never throws
 * @throws {Error} with `code` `EMASKRECORD` when the record cannot be written, since a start the guard could not cover must not begin
 */
function startMaskGuard({ sockets, recordDirectory, fileSystem = fs, now = Date.now, uid = process.getuid?.() ?? null }) {
  if (sockets.length === 0 || uid === null) return { settle() {} };
  const record = {
    version: 1,
    kind: MASK_RECORD_KIND,
    ownerPid: process.pid,
    launchedAt: now(),
    ...captureStates(sockets, fileSystem),
  };
  let recordFile = null;
  if (recordDirectory !== null) {
    recordFile = path.join(recordDirectory, `mask-${process.pid}-${crypto.randomBytes(8).toString('hex')}.json`);
    try {
      writeAtomically(recordFile, `${JSON.stringify(record)}\n`, fileSystem);
    } catch (error) {
      throw Object.assign(new Error(`the record of the hidden sockets cannot be written in ${recordDirectory}: ${error.message}`), {
        code: 'EMASKRECORD',
      });
    }
  }
  let settled = false;
  return {
    settle() {
      if (settled) return;
      settled = true;
      // A spawn site calls this in a `finally`, so it never throws: a failure leaves the record, and the recovery of a dead run tries again.
      try {
        const { failed } = removePlaceholders(record, { fileSystem, uid });
        // A path that could not be removed keeps its record too.
        if (recordFile !== null && failed.length === 0) fileSystem.rmSync(recordFile, { force: true });
      } catch {
        // The record stays for the next preflight.
      }
    },
  };
}

/** Whether the process `pid` may be running: one that cannot be signalled for any reason but its absence counts as alive. */
function processMayRun(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
}

/**
 * Applies the removal rule for each record of a dead run in `recordDirectory`, then deletes the record (`workspace.js` recovery calls it with the user's private root).
 * A record of a live run is left.
 * A record of a dead run that does not read as one this module wrote is deleted, since it names no path to remove.
 * So is a record that another user owns, whose mode is not 0600, whose pid differs from the pid in its name, or whose `launchedAt` is more than `CLOCK_SLACK_MS` away from the record file's own `ctime`, since a process cannot set a `ctime` back and this module writes the record right after it notes the instant.
 *
 * @param {object} options
 * @param {string} options.recordDirectory
 * @param {(message: string) => void} [options.log]
 * @param {(pid: number) => boolean} [options.alive]
 * @param {object} [options.fileSystem]
 * @param {number|null} [options.uid]
 * @returns {string[]} the records that were applied and deleted
 */
function sweepMaskRecords({ recordDirectory, log = () => {}, alive = processMayRun, fileSystem = fs, uid = process.getuid?.() ?? null }) {
  const swept = [];
  if (uid === null) return swept;
  let names;
  try {
    names = fileSystem.readdirSync(recordDirectory).filter((name) => MASK_RECORD_NAME.test(name));
  } catch {
    return swept;
  }
  for (const name of names) {
    const file = path.join(recordDirectory, name);
    try {
      const stat = fileSystem.lstatSync(file);
      if (!stat.isFile()) continue;
      const ownerPid = Number(MASK_RECORD_NAME.exec(name)[1]);
      if (alive(ownerPid)) continue;
      let record = null;
      if (stat.uid === uid && (stat.mode & 0o777) === 0o600) {
        try {
          record = JSON.parse(fileSystem.readFileSync(file, 'utf8'));
        } catch {
          record = null;
        }
      }
      if (!isMaskRecord(record) || record.ownerPid !== ownerPid || Math.abs(record.launchedAt - stat.ctimeMs) > CLOCK_SLACK_MS) {
        // A record of a dead run that does not read as one this module wrote names nothing to remove.
        fileSystem.rmSync(file, { force: true });
        log(`removed the unreadable or forged hidden-socket record ${file}`);
        continue;
      }
      const { failed } = removePlaceholders(record, { fileSystem, uid });
      if (failed.length > 0) continue;
      fileSystem.rmSync(file, { force: true });
      swept.push(file);
      log(`removed the placeholders a killed run's hidden sockets left, and the record ${file}`);
    } catch (error) {
      log(`could not read or apply the hidden-socket record ${file}: ${error.message}`);
    }
  }
  return swept;
}

module.exports = {
  CLOCK_SLACK_MS,
  MASK_RECORD_NAME,
  isMaskRecord,
  removePlaceholders,
  startMaskGuard,
  sweepMaskRecords,
};
