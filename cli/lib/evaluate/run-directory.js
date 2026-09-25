/**
 * A run directory, `runs/<invocationId>/`, whose every write and read the runtime guards
 * (AD-7, AD-12).
 *
 * The runtime does not sandbox the target's file system, so a target can find
 * the run directory (a worktree names its repository's git directory, which
 * lies beside the evaluation folder) and plant an entry in it: a symbolic link
 * where the runtime is about to write, say, which would carry that write into
 * the adopter's tree, or a rewritten file the runtime would read back. Every
 * write and read here is therefore held to the directories and files this
 * object made, the way Story 1.7 holds its mutation writes:
 *
 *   - the run directory is created exclusively, and each directory in it is
 *     created exclusively by the runtime and recorded by device and inode;
 *   - a write runs with the process inside the recorded directory, confirmed
 *     before and after the write to be that very directory at its recorded
 *     place (its device and inode, and the path the system reports for the
 *     working directory, which names where a moved directory now lies), and
 *     creates its file by bare name, exclusively and without following a
 *     link, so a planted entry stops the write (exit 12), and so does a
 *     directory the target replaced, swapped for a link, or moved out and
 *     left a link in its place; a file written while its directory was being
 *     moved is removed again before the write is refused; `run.json`, the one
 *     file rewritten, is replaced through a new file renamed over it, which
 *     replaces a link without following it;
 *   - each file's digest is held in memory as it is written, and a read hands
 *     back only the bytes the runtime wrote, opened without blocking, so a
 *     FIFO a target swapped in is refused and never waited on;
 *   - `verify` walks the directory without following links and reports every
 *     entry the runtime did not write, every entry it wrote that is gone or
 *     changed kind, and every file whose bytes differ from the ones written.
 *
 * A problem is a `RunDirectoryError`, which the commands report as exit 12.
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const NO_FOLLOW = fs.constants.O_NOFOLLOW ?? 0;
const CREATE = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | NO_FOLLOW;
/** Non-blocking, so opening a FIFO a target swapped in returns at once and `fstat` refuses it. */
const READ = fs.constants.O_RDONLY | NO_FOLLOW | (fs.constants.O_NONBLOCK ?? 0);

/** Something in the run directory the runtime did not write or cannot trust; the commands exit 12. */
class RunDirectoryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RunDirectoryError';
  }
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/** `relative` in POSIX form. */
function posix(relative) {
  return relative.split(path.sep).join('/');
}

class RunDirectory {
  /**
   * Creates `runs/<invocationId>/` exclusively; `runs/` itself must be a real
   * directory, never a link.
   *
   * @param {string} runsDirectory
   * @param {string} invocationId
   * @returns {RunDirectory}
   */
  static create(runsDirectory, invocationId) {
    const runs = fs.lstatSync(runsDirectory);
    if (!runs.isDirectory()) throw new RunDirectoryError(`${runsDirectory} is not a directory the runtime can write runs into`);
    const root = path.join(runsDirectory, invocationId);
    try {
      fs.mkdirSync(root);
    } catch (error) {
      throw new RunDirectoryError(`the run directory ${root} cannot be created: ${error.message}`);
    }
    return new RunDirectory(root);
  }

  constructor(root) {
    this.root = root;
    this.realRoot = fs.realpathSync.native(root);
    const stats = fs.lstatSync(root);
    /** Each directory the runtime made, by its path relative to the root ('' for the root), with its identity. */
    this.directories = new Map([['', { dev: stats.dev, ino: stats.ino }]]);
    /** Each file the runtime wrote, by its relative path, with the SHA-256 of the bytes written. */
    this.files = new Map();
  }

  /** `file` (absolute under the root, or relative to it) as a POSIX path relative to the root; a path outside it throws. */
  relative(file) {
    const relative = posix(path.isAbsolute(file) ? path.relative(this.root, file) : path.normalize(file));
    if (relative === '' || relative === '.' || relative.startsWith('../') || relative === '..' || path.isAbsolute(relative)) {
      throw new RunDirectoryError(`${file} is not a file inside the run directory ${this.root}`);
    }
    return relative;
  }

  /** The spelled path of `relative`, for an argument or a message. */
  pathOf(file) {
    return path.join(this.root, ...this.relative(file).split('/'));
  }

  /** Whether the runtime wrote `file`. */
  has(file) {
    return this.files.has(this.relative(file));
  }

  /**
   * Runs `work` with the process inside the recorded directory `directory`
   * (relative to the root), confirmed before and after `work` by `confirm`,
   * and restores the working directory afterwards. When the confirmation
   * after `work` fails, `undo` (still inside the directory, wherever it now
   * lies) takes back what `work` wrote before the refusal is thrown.
   *
   * @param {string} directory
   * @param {() => any} work
   * @param {{ undo?: (() => void) | null }} [options]
   */
  inDirectory(directory, work, { undo = null } = {}) {
    const real = path.join(this.realRoot, ...(directory === '' ? [] : directory.split('/')));
    const previous = process.cwd();
    try {
      process.chdir(real);
    } catch (error) {
      throw new RunDirectoryError(`the run directory's ${directory || 'root'} cannot be entered: ${error.message}`);
    }
    try {
      this.confirm(directory, real);
      const result = work();
      try {
        this.confirm(directory, real);
      } catch (error) {
        if (undo === null) throw error;
        try {
          undo();
        } catch (undoError) {
          throw new RunDirectoryError(
            `${error.message}; what the runtime had just written there could not be removed: ${undoError.message}`,
          );
        }
        throw new RunDirectoryError(`${error.message}; what the runtime had just written there was removed`);
      }
      return result;
    } finally {
      process.chdir(previous);
    }
  }

  /**
   * Throws unless the working directory is the recorded directory
   * `directory` at its recorded place `real`: the same device and inode (a
   * directory replaced, or swapped for a link, has others) and the path the
   * system reports for it (a directory moved elsewhere keeps its inode, and a
   * link left in its place would lead the runtime to it).
   */
  confirm(directory, real) {
    const identity = this.directories.get(directory);
    const here = fs.statSync('.');
    if (here.dev !== identity.dev || here.ino !== identity.ino) {
      throw new RunDirectoryError(
        `${real} is no longer the directory the runtime made, so the runtime will not write or read through it (the target may have replaced it)`,
      );
    }
    let reported;
    try {
      // Node keeps the working directory's path from the last chdir; entering
      // '.' again makes it ask the system where the directory lies now.
      process.chdir('.');
      reported = process.cwd();
    } catch (error) {
      throw new RunDirectoryError(`${real} cannot be located any more, so the runtime will not write or read through it: ${error.message}`);
    }
    if (reported !== real) {
      throw new RunDirectoryError(
        `${real} now lies at ${reported}, so the runtime will not write or read through it (the target may have moved it and left a link in its place)`,
      );
    }
  }

  /** Creates every directory on the way to `directory` that the runtime has not made yet, each exclusively. */
  ensureDirectory(directory) {
    if (this.directories.has(directory)) return;
    const parent = path.posix.dirname(directory) === '.' ? '' : path.posix.dirname(directory);
    this.ensureDirectory(parent);
    const name = path.posix.basename(directory);
    const stats = this.inDirectory(
      parent,
      () => {
        try {
          fs.mkdirSync(name);
        } catch (error) {
          throw new RunDirectoryError(
            error.code === 'EEXIST'
              ? `the run directory already holds ${directory}, which the runtime did not make (the target may have planted it)`
              : `${directory} cannot be created in the run directory: ${error.message}`,
          );
        }
        return fs.lstatSync(name);
      },
      { undo: () => fs.rmdirSync(name) },
    );
    this.directories.set(directory, { dev: stats.dev, ino: stats.ino });
  }

  /**
   * Writes `bytes` to a new file, exclusively and without following a link;
   * an entry already there stops the write.
   *
   * @returns {string} the file's spelled path
   */
  write(file, bytes) {
    const relative = this.relative(file);
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    const directory = path.posix.dirname(relative) === '.' ? '' : path.posix.dirname(relative);
    this.ensureDirectory(directory);
    const name = path.posix.basename(relative);
    this.inDirectory(
      directory,
      () => {
        let descriptor;
        try {
          descriptor = fs.openSync(name, CREATE, 0o644);
        } catch (error) {
          throw new RunDirectoryError(
            error.code === 'EEXIST' || error.code === 'ELOOP'
              ? `the run directory already holds ${relative}, which the runtime did not write (the target may have planted it)`
              : `${relative} cannot be written in the run directory: ${error.message}`,
          );
        }
        try {
          fs.writeSync(descriptor, buffer);
        } finally {
          fs.closeSync(descriptor);
        }
      },
      { undo: () => fs.unlinkSync(name) },
    );
    this.files.set(relative, sha256(buffer));
    return this.pathOf(relative);
  }

  /** Writes `value` as indented JSON with a closing newline. */
  writeJson(file, value) {
    return this.write(file, `${JSON.stringify(value, null, 2)}\n`);
  }

  /**
   * Replaces a file the runtime rewrites (`run.json`): the bytes go to a new
   * file, created exclusively, which is renamed over the old entry, so a link
   * planted in its place is replaced and never followed.
   */
  replace(file, bytes) {
    const relative = this.relative(file);
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    const directory = path.posix.dirname(relative) === '.' ? '' : path.posix.dirname(relative);
    this.ensureDirectory(directory);
    const name = path.posix.basename(relative);
    const staged = `.${name}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    this.inDirectory(
      directory,
      () => {
        let descriptor;
        try {
          descriptor = fs.openSync(staged, CREATE, 0o644);
        } catch (error) {
          throw new RunDirectoryError(`${relative} cannot be rewritten in the run directory: ${error.message}`);
        }
        try {
          fs.writeSync(descriptor, buffer);
        } finally {
          fs.closeSync(descriptor);
        }
        try {
          fs.renameSync(staged, name);
        } catch (error) {
          fs.rmSync(staged, { force: true });
          throw new RunDirectoryError(`${relative} cannot be rewritten in the run directory: ${error.message}`);
        }
      },
      { undo: () => fs.unlinkSync(name) },
    );
    this.files.set(relative, sha256(buffer));
    return this.pathOf(relative);
  }

  /** Replaces a file with `value` as indented JSON. */
  replaceJson(file, value) {
    return this.replace(file, `${JSON.stringify(value, null, 2)}\n`);
  }

  /** Copies a file from outside the run directory (an engine stage's private output) in as a new file; returns its bytes. */
  copyIn(file, source) {
    const bytes = fs.readFileSync(source);
    this.write(file, bytes);
    return bytes;
  }

  /**
   * The bytes the runtime wrote to `file`, read without following a link and
   * held to the digest taken when they were written.
   *
   * @returns {Buffer}
   */
  read(file) {
    const relative = this.relative(file);
    const expected = this.files.get(relative);
    if (expected === undefined) throw new RunDirectoryError(`${relative} is not a file the runtime wrote in the run directory`);
    const directory = path.posix.dirname(relative) === '.' ? '' : path.posix.dirname(relative);
    const bytes = this.inDirectory(directory, () => {
      try {
        const descriptor = fs.openSync(path.posix.basename(relative), READ);
        try {
          if (!fs.fstatSync(descriptor).isFile()) throw new RunDirectoryError(`${relative} is no longer a file`);
          return fs.readFileSync(descriptor);
        } finally {
          fs.closeSync(descriptor);
        }
      } catch (error) {
        if (error instanceof RunDirectoryError) throw error;
        throw new RunDirectoryError(`${relative} cannot be read back from the run directory: ${error.message}`);
      }
    });
    if (sha256(bytes) !== expected) {
      throw new RunDirectoryError(`${relative} no longer holds the bytes the runtime wrote (the target may have rewritten it)`);
    }
    return bytes;
  }

  /** `read`, parsed as JSON. */
  readJson(file) {
    return JSON.parse(this.read(file).toString('utf8'));
  }

  /** Removes a file the runtime wrote, by its bare name inside its recorded directory, never through a link. */
  remove(file) {
    const relative = this.relative(file);
    if (!this.files.has(relative)) return;
    const directory = path.posix.dirname(relative) === '.' ? '' : path.posix.dirname(relative);
    this.inDirectory(directory, () => fs.rmSync(path.posix.basename(relative), { force: true }));
    this.files.delete(relative);
  }

  /**
   * Every way the run directory differs from what the runtime wrote: an entry
   * it did not write (a planted file, directory or link), one it wrote that is
   * gone or is no longer a file or directory of its own, and a file whose
   * bytes differ from the ones written. Nothing is followed.
   *
   * @returns {string[]}
   */
  problems() {
    const problems = [];
    const seen = new Set();
    let rootStats;
    try {
      rootStats = fs.lstatSync(this.root);
    } catch (error) {
      return [`the run directory cannot be read: ${error.message}`];
    }
    const root = this.directories.get('');
    if (!rootStats.isDirectory() || rootStats.dev !== root.dev || rootStats.ino !== root.ino) {
      return [`${this.root} is no longer the run directory the runtime made`];
    }
    const walk = (directory) => {
      let entries;
      try {
        entries = this.inDirectory(directory, () => fs.readdirSync('.', { withFileTypes: true }));
      } catch (error) {
        problems.push(error.message);
        return;
      }
      for (const entry of entries) {
        const relative = directory === '' ? entry.name : `${directory}/${entry.name}`;
        seen.add(relative);
        if (this.directories.has(relative)) {
          const identity = this.directories.get(relative);
          const stats = this.inDirectory(directory, () => fs.lstatSync(entry.name));
          if (!stats.isDirectory() || stats.dev !== identity.dev || stats.ino !== identity.ino) {
            problems.push(`${relative} is no longer the directory the runtime made`);
          } else {
            walk(relative);
          }
        } else if (this.files.has(relative)) {
          if (!entry.isFile()) {
            problems.push(`${relative} is no longer the file the runtime wrote`);
            continue;
          }
          try {
            this.read(relative);
          } catch (error) {
            problems.push(error.message);
          }
        } else {
          problems.push(`${relative} is ${entry.isSymbolicLink() ? 'a symbolic link' : 'an entry'} the runtime did not write`);
        }
      }
    };
    walk('');
    for (const relative of [...this.directories.keys(), ...this.files.keys()]) {
      if (relative !== '' && !seen.has(relative)) problems.push(`${relative}, which the runtime wrote, is gone`);
    }
    return problems;
  }

  /** Throws a `RunDirectoryError` naming every problem `problems` finds. */
  verify(when) {
    const problems = this.problems();
    if (problems.length > 0) {
      throw new RunDirectoryError(`the run directory is not what the runtime wrote ${when}: ${problems.join('; ')}`);
    }
  }
}

module.exports = { RunDirectory, RunDirectoryError };
