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
 * Three sources name them.
 * A fixed list of well-known service sockets (`PINNED_SOCKETS`) comes first.
 * The kernel lists every Unix socket bound in the reader's network namespace in `/proc/net/unix`, whatever directory its file sits in.
 * Each one whose file the runtime can resolve is returned by its real path, since a mount over a path that goes through a link fails
 * in Bubblewrap and a mount over the real file covers every spelling of it.
 * A socket a process moved after it bound (OpenSSH's control master binds a temporary name and links it to the final one)
 * is listed under a path that no longer exists, so every socket file beside that path is returned too.
 * The directories where services and sessions keep their sockets (`SCANNED_ROOTS`) are walked for socket files as well,
 * in the directory and in its own directories.
 * That finds a socket the table does not hold: one a daemon bound in another network namespace and shared into this one
 * by a bind mount (the Docker socket of a container job), and one bound by a relative path.
 *
 * A path goes into the list only after `lstat` on that exact path confirms a socket file, so a name the runtime cannot spell,
 * a file another user removed or a file in a directory the runtime cannot search never reaches a mount.
 * The target cannot reach what the runtime cannot, and one such entry would stop every call.
 * Names are read as bytes and a name that does not round-trip through UTF-8 is skipped, since the path a mount would carry is another file.
 *
 * A call has room for a bounded number of mounts (`socketBudget`), so the list is ranked by who can create a socket before it is cut.
 * The pinned sockets come first, then the sockets of root and of the system accounts, then the runtime's own user's, then every other user's.
 * Another local user can fill the budget with sockets of their own and push out only the sockets they could create themselves.
 * When the pinned sockets and those of root, of the system accounts and of the runtime's own user exceed the budget alone,
 * the call is refused (`refused`), since a socket left reachable could be a service's.
 * No other user can make that happen.
 * The sockets the budget cut stay reachable and are counted (`left`), so the run can record them.
 * `/dev` and `/proc` take no budget: the vector replaces both (`--dev /dev`, `--proc /proc`), so the caller leaves them out.
 *
 * What the list cannot hold: a socket bound after it was read, one bound in another network namespace outside the scanned directories,
 * one whose path holds a line break in a directory the scan does not walk (the table's rows end at a line break),
 * one whose name is no UTF-8, one of another user's beyond the budget or beyond the bound of directories (`SCAN_DIRECTORIES`),
 * and a second path to the same socket file through another mount or a hard link.
 * The confinement hides what the list names for the call it was read for, and the CLI reference says so.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { isInside } = require('../isolation-primitives');

/** Where the kernel lists the sockets of the reader's network namespace. */
const UNIX_SOCKET_TABLE = '/proc/net/unix';

/** The directories sockets are kept in by convention: services (`/run`), and sessions and agents (`/tmp`). */
const SCANNED_ROOTS = Object.freeze(['/run', '/var/run', '/tmp', '/var/tmp']);

/** The service sockets every host knows by name; each is hidden before any count of other sockets can push it out of the list. */
const PINNED_SOCKETS = Object.freeze([
  '/run/docker.sock',
  '/var/run/docker.sock',
  '/run/containerd/containerd.sock',
  '/run/podman/podman.sock',
  '/run/dbus/system_bus_socket',
  '/var/run/dbus/system_bus_socket',
  '/run/systemd/private',
]);

/** The highest user ID of a system account on Linux: root and the accounts up to this are the host's own and no local user's. */
const SYSTEM_UID_MAX = 999;

/** How many directories of one root a scan reads at most (name order), so a temp directory holding a very large number of them costs a bounded time. */
const SCAN_DIRECTORIES = 2000;

/** How many sockets a call hides at most, whatever room its command leaves. */
const MAX_HIDDEN_SOCKETS = 2000;

/** Bubblewrap's bound on the arguments of one start: it counts the whole command line and what `--args` reads (0.8.0 starts 8,999 and refuses 9,002). */
const BUBBLEWRAP_ARGUMENT_LIMIT = 9000;

/** Arguments held back from the bound for Bubblewrap's own count. */
const ARGUMENT_MARGIN = 8;

/** The arguments of one mount: `--ro-bind`, the source and the socket's path. */
const ARGUMENTS_PER_MOUNT = 3;

/** One row: the slot, six counters and the inode, then the path or abstract name (`@name`), which may hold spaces. */
const ROW = /^\S+:(?:\s+\S+){6}\s+(\/.*)$/;

/** The ranks of who can create a socket, most trusted first. */
const PINNED = 0;
const TRUSTED = 1;
const SELF = 2;
const OTHER = 3;

/**
 * How many sockets one call can hide.
 * Bubblewrap takes `BUBBLEWRAP_ARGUMENT_LIMIT` arguments for the command line and the mounts together.
 * A call whose command (the vector, the status shim and the target's own arguments, `--args <descriptor>` included)
 * has `commandLength` arguments has room for the rest at three a mount, and for at most `MAX_HIDDEN_SOCKETS`.
 *
 * @param {number} commandLength the arguments of the call's Bubblewrap command, `--args <descriptor>` included
 * @returns {number}
 */
function socketBudget(commandLength) {
  const room = Math.floor((BUBBLEWRAP_ARGUMENT_LIMIT - commandLength - ARGUMENT_MARGIN) / ARGUMENTS_PER_MOUNT);
  return Math.max(0, Math.min(MAX_HIDDEN_SOCKETS, room));
}

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

/** The text of a name read as bytes, or `null` when it does not round-trip through UTF-8 and so names another file as a string. */
function spelled(name) {
  const text = name.toString('utf8');
  return Buffer.from(text, 'utf8').equals(name) ? text : null;
}

/** Whether `file`, by that exact path, is a socket file: a path the runtime cannot reach (gone, or in a directory it cannot search) is none. */
function isSocketFile(file, fileSystem = fs) {
  try {
    return fileSystem.lstatSync(file).isSocket();
  } catch {
    return false;
  }
}

/** The owner's user ID of `file` when it is a socket file by that exact path, and `null` when it is none or the runtime cannot reach it. */
function socketOwner(file, fileSystem, uidOf) {
  try {
    const stat = fileSystem.lstatSync(file);
    return stat.isSocket() ? uidOf(file, stat) : null;
  } catch {
    return null;
  }
}

/** The spellable entries of `directory` as `{ name, socket, directory }` in name order; none when it cannot be read. */
function entriesOf(directory, fileSystem) {
  try {
    return fileSystem
      .readdirSync(directory, { withFileTypes: true, encoding: 'buffer' })
      .flatMap((entry) => {
        const name = spelled(Buffer.from(entry.name));
        return name === null ? [] : [{ name, socket: entry.isSocket(), directory: entry.isDirectory() }];
      })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  } catch {
    return [];
  }
}

/** The real paths of the socket files in the directory `candidate` sat in, or none when the directory is gone or unreadable. */
function socketsBeside(candidate, fileSystem) {
  try {
    const directory = fileSystem.realpathSync.native(path.dirname(candidate));
    return entriesOf(directory, fileSystem)
      .filter((entry) => entry.socket)
      .map((entry) => path.join(directory, entry.name));
  } catch {
    return [];
  }
}

/** The real paths of the socket files under `root`, in it and in its directories and theirs, reading at most `directories` directories. */
function socketsUnder(root, directories, fileSystem) {
  let top;
  try {
    top = fileSystem.realpathSync.native(root);
  } catch {
    return [];
  }
  const found = [];
  let budget = directories;
  const scan = (directory, depth) => {
    for (const entry of entriesOf(directory, fileSystem)) {
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
 * The host's path-based Unix sockets that exist as socket files, each once by real path, except those inside `except` (the call's
 * own grants and what the sandbox hides or replaces already), ranked and cut to `limit`.
 * The rank is who can create the socket (pinned, then root and system accounts, then the runtime's own user, then every other user).
 * Inside a rank the order is how sure the runtime is that a socket is a host's service: the sockets the kernel's table names,
 * then the neighbors of a moved socket, then each scanned root in turn, each group sorted.
 * A host with no socket table (no Unix sockets in the kernel, or a stand-in for Linux on another system) has none from the table.
 * A table the runtime cannot read is an error, since an unlisted socket would stay reachable.
 * The table is read twice and the paths of both reads are used, since the kernel serves it in pieces and a socket closed between
 * them can drop another's row from one read.
 *
 * @param {object} [options]
 * @param {string[]} [options.except] absolute real paths; a socket inside one is left out
 * @param {string} [options.table] the table's path
 * @param {readonly string[]} [options.roots] the directories scanned for socket files the table does not name
 * @param {readonly string[]} [options.pinned] the well-known sockets listed first
 * @param {number} [options.directories] how many directories of one root the scan reads at most, in name order
 * @param {number} [options.limit] how many sockets the list holds at most
 * @param {number|null} [options.ownUid] the user ID the runtime and its targets run as
 * @param {(file: string, stat: object) => number} [options.uidOf] the owner of a socket file; a case replaces it, since a unit cannot chown
 * @param {object} [options.fileSystem] the `fs` functions the list reads through (`readFileSync`, `readdirSync`, `realpathSync`, `lstatSync`); a case replaces it
 * @returns {{ sockets: string[], left: number, refused: string|null }} the sockets to hide, how many more sockets the budget cut
 *   (they stay reachable), and the reason the call is refused when the sockets that only root, the system accounts and the
 *   runtime's own user can create exceed the budget alone (`sockets` is then empty)
 */
function listHostSockets({
  except = [],
  table = UNIX_SOCKET_TABLE,
  roots = SCANNED_ROOTS,
  pinned = PINNED_SOCKETS,
  directories = SCAN_DIRECTORIES,
  limit = MAX_HIDDEN_SOCKETS,
  ownUid = process.getuid?.() ?? null,
  uidOf = (_file, stat) => stat.uid,
  fileSystem = fs,
} = {}) {
  const candidates = new Set();
  for (let read = 0; read < 2; read += 1) {
    try {
      for (const candidate of socketTablePaths(fileSystem.readFileSync(table).toString('utf8'))) candidates.add(candidate);
    } catch (error) {
      if (error?.code === 'ENOENT') break;
      throw error;
    }
  }
  const rankOf = (uid) => (uid <= SYSTEM_UID_MAX ? TRUSTED : uid === ownUid ? SELF : OTHER);
  // One group per source, in the order of the list; the first group to name a socket keeps it.
  const found = new Map();
  let group = 0;
  // Only a path `lstat` confirms as a socket file goes in: a name the scan could not spell and a file in a directory the runtime
  // cannot search are the target's to miss as well, and a mount over a path that is no socket file stops every call.
  const add = (real, pin = false) => {
    if (found.has(real) || except.some((root) => isInside(root, real))) return;
    const uid = socketOwner(real, fileSystem, uidOf);
    if (uid !== null) found.set(real, { rank: pin ? PINNED : rankOf(uid), group });
  };
  for (const pin of pinned) {
    try {
      add(fileSystem.realpathSync.native(pin), true);
    } catch {
      // A host without that service has no such socket.
    }
  }
  group += 1;
  // The sockets beside a path are read once for each directory, however many rows of the table name a path in it.
  const beside = new Map();
  const neighbors = [];
  for (const candidate of candidates) {
    try {
      add(fileSystem.realpathSync.native(candidate));
    } catch (error) {
      // A socket another mount namespace bound, one whose file is gone or one the runtime cannot reach names nothing to hide.
      // A socket a process moved after it bound is listed under a path that no longer exists.
      if (error?.code === 'ENOENT') {
        const directory = path.dirname(candidate);
        if (!beside.has(directory)) beside.set(directory, socketsBeside(candidate, fileSystem));
        neighbors.push(...beside.get(directory));
      }
    }
  }
  group += 1;
  for (const neighbor of neighbors) add(neighbor);
  for (const root of roots) {
    group += 1;
    for (const socket of socketsUnder(root, directories, fileSystem)) add(socket);
  }
  const ranked = [...found.entries()]
    .sort(([a, left], [b, right]) => left.rank - right.rank || left.group - right.group || (a < b ? -1 : a > b ? 1 : 0))
    .map(([real, held]) => ({ real, rank: held.rank }));
  const owned = ranked.filter((socket) => socket.rank <= SELF).length;
  if (owned > limit) {
    return {
      sockets: [],
      left: ranked.length,
      refused: `the host holds ${owned} Unix sockets that only root, a system account or the user running the call can create, and the call has room to hide ${limit}`,
    };
  }
  return { sockets: ranked.slice(0, limit).map((socket) => socket.real), left: Math.max(0, ranked.length - limit), refused: null };
}

/**
 * The real paths `listHostSockets` names, for a caller that wants no more than the list; a call the list refuses throws.
 *
 * @param {object} [options] the options of `listHostSockets`
 * @returns {string[]}
 */
function hostPathSockets(options = {}) {
  const { sockets, refused } = listHostSockets(options);
  if (refused !== null) throw Object.assign(new Error(refused), { code: 'EHOSTSOCKETBUDGET' });
  return sockets;
}

module.exports = {
  ARGUMENTS_PER_MOUNT,
  BUBBLEWRAP_ARGUMENT_LIMIT,
  MAX_HIDDEN_SOCKETS,
  PINNED_SOCKETS,
  SCANNED_ROOTS,
  SCAN_DIRECTORIES,
  SYSTEM_UID_MAX,
  UNIX_SOCKET_TABLE,
  hostPathSockets,
  isSocketFile,
  listHostSockets,
  socketBudget,
  socketTablePaths,
};
