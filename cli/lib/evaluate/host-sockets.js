/**
 * The host's path-based Unix sockets, listed for the Bubblewrap confinement to
 * hide (Story 1.82, AD-8).
 *
 * A path-based socket is a file, and `connect()` to it needs no write access, so
 * the read-only view of `/` a Bubblewrap target gets still lets it reach
 * `/var/run/docker.sock`, the system bus or an agent's socket and ask the host
 * service behind it to run a job outside the sandbox. Abstract sockets are the
 * network namespace's (Story 1.63); the sockets listed here are the files.
 *
 * Two sources name them. The kernel lists every Unix socket bound in the
 * reader's network namespace in `/proc/net/unix`, whatever directory its file
 * sits in. Each one whose file the runtime can resolve is returned by its real
 * path, since a mount over a path that goes through a link fails in Bubblewrap
 * and a mount over the real file covers every spelling of it. A socket a process
 * moved after it bound (OpenSSH's control master binds a temporary name and
 * links it to the final one) is listed under a path that no longer exists, so
 * every socket file beside that path is returned too. The directories where
 * services and sessions keep their sockets (`SCANNED_ROOTS`) are walked for
 * socket files as well, in the directory and in its own directories, which finds a socket the table
 * does not hold: one a daemon bound in another network namespace and shared
 * into this one by a bind mount (the Docker socket of a container job), and one
 * bound by a relative path.
 *
 * What the list cannot hold: a socket bound after it was read, one bound in
 * another network namespace outside the scanned directories, one whose path
 * holds a line break or bytes that are no UTF-8, and a second path to the same
 * socket file through another mount. The confinement hides what the list names
 * for the call it was read for, and the CLI reference says so.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { isInside } = require('../isolation-primitives');

/** Where the kernel lists the sockets of the reader's network namespace. */
const UNIX_SOCKET_TABLE = '/proc/net/unix';

/** The directories sockets are kept in by convention: services (`/run`), and sessions and agents (`/tmp`). */
const SCANNED_ROOTS = Object.freeze(['/run', '/var/run', '/tmp', '/var/tmp']);

/** How many directories of one root a scan reads at most, so a temp directory holding a very large number of them costs a bounded time. */
const SCAN_DIRECTORIES = 2000;

/** One row: the slot, six counters and the inode, then the path or abstract name (`@name`), which may hold spaces. */
const ROW = /^\S+:(?:\s+\S+){6}\s+(\/.*)$/;

/**
 * The absolute socket paths a socket table names, in the order it lists them.
 * An abstract socket, an unnamed one, a path that is not absolute and a header
 * line name none.
 *
 * @param {string} text the table's text
 * @returns {string[]}
 */
function socketTablePaths(text) {
  const paths = [];
  for (const line of String(text).split('\n')) {
    const match = ROW.exec(line);
    if (match !== null) paths.push(match[1]);
  }
  return paths;
}

/** The entries of `directory` as `{ name, socket, directory }`; none when it cannot be read. */
function entriesOf(directory) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      socket: entry.isSocket(),
      directory: entry.isDirectory(),
    }));
  } catch {
    return [];
  }
}

/** The real paths of the socket files in the directory `candidate` sat in, or none when the directory is gone or unreadable. */
function socketsBeside(candidate) {
  try {
    const directory = fs.realpathSync.native(path.dirname(candidate));
    return entriesOf(directory)
      .filter((entry) => entry.socket)
      .map((entry) => path.join(directory, entry.name));
  } catch {
    return [];
  }
}

/** The real paths of the socket files under `root`, in it and in its directories and theirs, reading at most `SCAN_DIRECTORIES` directories. */
function socketsUnder(root) {
  let top;
  try {
    top = fs.realpathSync.native(root);
  } catch {
    return [];
  }
  const found = [];
  let budget = SCAN_DIRECTORIES;
  const scan = (directory, depth) => {
    for (const entry of entriesOf(directory)) {
      const entryPath = path.join(directory, entry.name);
      if (entry.socket) found.push(entryPath);
      else if (entry.directory && depth < 2 && budget > 0) {
        budget -= 1;
        scan(entryPath, depth + 1);
      }
    }
  };
  scan(top, 1);
  return found;
}

/**
 * The real paths of the host's path-based Unix sockets that exist as socket files, sorted, each once, except those inside
 * `except` (the call's own grants and what the sandbox hides already). A host with no socket table (no Unix sockets in the
 * kernel, or a stand-in for Linux on another system) has none from the table; a table the runtime cannot read is an error,
 * since an unlisted socket would stay reachable. The table is read twice and the paths of both reads are used, since the
 * kernel serves it in pieces and a socket closed between them can drop another's row from one read.
 *
 * @param {object} [options]
 * @param {string[]} [options.except] absolute real paths; a socket inside one is left out
 * @param {string} [options.table] the table's path
 * @param {readonly string[]} [options.roots] the directories scanned for socket files the table does not name
 * @returns {string[]}
 */
function hostPathSockets({ except = [], table = UNIX_SOCKET_TABLE, roots = SCANNED_ROOTS } = {}) {
  const candidates = new Set();
  for (let read = 0; read < 2; read += 1) {
    try {
      for (const candidate of socketTablePaths(fs.readFileSync(table, 'utf8'))) candidates.add(candidate);
    } catch (error) {
      if (error?.code === 'ENOENT') break;
      throw error;
    }
  }
  const found = new Set();
  const add = (real) => {
    if (!except.some((root) => isInside(root, real))) found.add(real);
  };
  for (const candidate of candidates) {
    try {
      const real = fs.realpathSync.native(candidate);
      if (fs.lstatSync(real).isSocket()) add(real);
    } catch (error) {
      // A socket another mount namespace bound, one whose file is gone or one the runtime cannot reach names nothing to hide.
      // A socket a process moved after it bound is listed under a path that no longer exists.
      if (error?.code === 'ENOENT') for (const neighbor of socketsBeside(candidate)) add(neighbor);
    }
  }
  for (const root of roots) for (const socket of socketsUnder(root)) add(socket);
  return [...found].sort();
}

module.exports = { SCANNED_ROOTS, UNIX_SOCKET_TABLE, hostPathSockets, socketTablePaths };
