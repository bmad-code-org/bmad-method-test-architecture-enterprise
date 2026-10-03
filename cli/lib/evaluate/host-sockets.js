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
 * The last rank is taken in turns, the first socket of each owner, then the second of each, so a local user who makes sockets in bulk
 * cannot push out another user's socket while the budget left after those holds one socket for each owner.
 * When the pinned sockets and those of root, of the system accounts and of the runtime's own user exceed the budget alone,
 * the call is refused (`refused`), since a socket left reachable could be a service's.
 * No other user can make that happen.
 * The sockets the budget cut stay reachable and are counted (`left`), so the run can record them.
 * `/dev` and `/proc` take no budget: the vector replaces both (`--dev /dev`, `--proc /proc`), so the caller leaves them out.
 *
 * The socket files beside a moved path join the list in the same order of owners, so a directory holding a very large number of socket
 * files costs a bounded list. The directories are visited by who owns them (root and the system accounts, then the runtime's user,
 * then every other user in turns), each socket is charged to its own owner, and one other user's neighbors stop joining the list once
 * that user holds the whole room. The sockets of root, of a system account and of the runtime's user are never cut there, whatever
 * another user's directory holds and whichever directory the table names first. The one bound left: the socket files of one other
 * user beside a moved path past the room stay reachable and are counted as left (`left`).
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

/** The errors that mean a path is gone or one the runtime cannot reach, which names nothing to hide; any other error (`EMFILE`, `EIO`) fails the list so a scan that did not finish cannot leave a socket unmasked. */
const UNREACHABLE = new Set(['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM']);

/** The spellable entries of `directory` as `{ name, socket, directory }` in name order; none when it is gone or the runtime cannot reach it. */
function entriesOf(directory, fileSystem) {
  try {
    return fileSystem
      .readdirSync(directory, { withFileTypes: true, encoding: 'buffer' })
      .flatMap((entry) => {
        const name = spelled(Buffer.from(entry.name));
        return name === null ? [] : [{ name, socket: entry.isSocket(), directory: entry.isDirectory() }];
      })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  } catch (error) {
    if (UNREACHABLE.has(error?.code)) return [];
    throw error;
  }
}

/** The real directory `candidate` sat in, or `null` when it is gone or the runtime cannot reach it. */
function directoryBeside(candidate, fileSystem) {
  try {
    return fileSystem.realpathSync.native(path.dirname(candidate));
  } catch {
    return null;
  }
}

/** The owner's user ID of `directory`, or `null` when the runtime cannot tell. */
function directoryOwner(directory, fileSystem, uidOf) {
  try {
    return uidOf(directory, fileSystem.lstatSync(directory)) ?? null;
  } catch {
    return null;
  }
}

/** The names of the socket files in `directory` in name order, or none when it cannot be read. */
function socketNames(directory, fileSystem) {
  return entriesOf(directory, fileSystem).flatMap((entry) => (entry.socket ? [entry.name] : []));
}

/** The real paths of the socket files under `root`, in it and in its directories and theirs, reading at most `directories` directories. */
function socketsUnder(root, directories, fileSystem) {
  let top;
  try {
    top = fileSystem.realpathSync.native(root);
  } catch (error) {
    if (UNREACHABLE.has(error?.code)) return [];
    throw error;
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
  // How many sockets each other user holds so far.
  const held = new Map();
  let group = 0;
  // Only a path `lstat` confirms as a socket file goes in: a name the scan could not spell and a file in a directory the runtime
  // cannot search are the target's to miss as well, and a mount over a path that is no socket file stops every call.
  // A path in `charged` counts against its owner: once another user holds the whole room, the owner's next socket is `cut`.
  const add = (real, { pin = false, charged = false } = {}) => {
    if (found.has(real) || except.some((root) => isInside(root, real))) return 'skipped';
    const uid = socketOwner(real, fileSystem, uidOf);
    if (uid === null) return 'skipped';
    const rank = pin ? PINNED : rankOf(uid);
    if (rank === OTHER) {
      if (charged && (held.get(uid) ?? 0) >= limit) return 'cut';
      held.set(uid, (held.get(uid) ?? 0) + 1);
    }
    found.set(real, { rank, group, uid });
    return 'added';
  };
  for (const pin of pinned) {
    try {
      add(fileSystem.realpathSync.native(pin), { pin: true });
    } catch {
      // A host without that service has no such socket.
    }
  }
  group += 1;
  // A socket a process moved after it bound is listed under a path that no longer exists; one row of the table stands for each
  // directory, however many rows name a path in it.
  const moved = new Map();
  for (const candidate of candidates) {
    try {
      add(fileSystem.realpathSync.native(candidate));
    } catch (error) {
      // A socket another mount namespace bound, one whose file is gone or one the runtime cannot reach names nothing to hide.
      if (error?.code === 'ENOENT' && !moved.has(path.dirname(candidate))) moved.set(path.dirname(candidate), candidate);
    }
  }
  group += 1;
  // The socket files beside a moved path join the list once for each directory. The directories are visited by who owns them (root and
  // the system accounts, then the runtime's user, then every other user in turns), and each socket is charged to its own owner: a
  // user who holds the whole room has no more neighbors added, and root's, a system account's and the runtime's user's are never cut
  // here, so one user's directory of socket files cannot push out another owner's. Every name is read once and no list grows with a
  // directory. What the loop cut is counted so the record shows it.
  const places = new Map();
  for (const candidate of moved.values()) {
    const directory = directoryBeside(candidate, fileSystem);
    if (directory === null || places.has(directory)) continue;
    const uid = directoryOwner(directory, fileSystem, uidOf);
    places.set(directory, { directory, uid, rank: uid === null ? OTHER : rankOf(uid), round: 0 });
  }
  const visits = [...places.values()].sort((a, b) => (a.directory < b.directory ? -1 : a.directory > b.directory ? 1 : 0));
  const visited = new Map();
  for (const place of visits.filter((visit) => visit.rank === OTHER)) {
    place.round = visited.get(place.uid) ?? 0;
    visited.set(place.uid, place.round + 1);
  }
  visits.sort((a, b) => a.rank - b.rank || a.round - b.round);
  let neighborsCut = 0;
  for (const { directory } of visits) {
    for (const name of socketNames(directory, fileSystem)) {
      if (add(path.join(directory, name), { charged: true }) === 'cut') neighborsCut += 1;
    }
  }
  for (const root of roots) {
    group += 1;
    for (const socket of socketsUnder(root, directories, fileSystem)) add(socket);
  }
  // Every user above the system accounts but the runtime's own shares one rank, taken in turns: the first socket of each owner, then
  // the second of each, so one user's bulk cannot crowd another user's sockets out until the room is smaller than the owners.
  const entries = [...found.entries()].map(([real, held]) => ({ real, ...held, round: 0 }));
  const taken = new Map();
  for (const entry of entries
    .filter((held) => held.rank === OTHER)
    .sort((a, b) => a.group - b.group || (a.real < b.real ? -1 : a.real > b.real ? 1 : 0))) {
    entry.round = taken.get(entry.uid) ?? 0;
    taken.set(entry.uid, entry.round + 1);
  }
  const ranked = entries.sort(
    (a, b) => a.rank - b.rank || a.round - b.round || a.group - b.group || (a.real < b.real ? -1 : a.real > b.real ? 1 : 0),
  );
  const owned = ranked.filter((socket) => socket.rank <= SELF).length;
  if (owned > limit) {
    return {
      sockets: [],
      left: ranked.length + neighborsCut,
      refused: `the host holds ${owned} Unix sockets that only root, a system account or the user running the call can create, and the call has room to hide ${limit}`,
    };
  }
  return {
    sockets: ranked.slice(0, limit).map((socket) => socket.real),
    left: Math.max(0, ranked.length - limit) + neighborsCut,
    refused: null,
  };
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
