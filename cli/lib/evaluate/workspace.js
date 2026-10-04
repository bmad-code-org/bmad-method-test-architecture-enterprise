/**
 * The disposable workspaces a `tea-evaluate` run happens in (AD-8), and the
 * resumable per-leg port TeA's own live harness stages them for.
 *
 * A workspace is where a target runs and where a mutation is planted, so no
 * mutation is written into the adopter's tree:
 *
 * - a git target (`workspace.kind: git`, with `launch.root` inside a git
 *   repository that has a commit) is a detached worktree at the evaluated
 *   commit, `HEAD`, made with `git worktree add --detach` and hooks disabled
 *   (or, for a historical probe's revisions, at the commit the caller names);
 * - a `copy` workspace, or a target outside any git repository, is a temp copy
 *   of `launch.root`, identified by its tree digest;
 * - `--from-working-tree` makes a temp copy of the working tree whatever the
 *   kind, and is the one workspace recorded as `dirty: true`, since it holds
 *   bytes no commit names.
 *
 * Every directory `workspace.provision` lists is copied into the workspace (a
 * copy-on-write clone where the file system offers one) and its write bits are
 * removed, so a write under it fails unless the writer restores them first;
 * the adopter's own directory is never reachable from the workspace. Every
 * symbolic link under the workspace's `launch.root` resolves inside the
 * workspace: a link that leads into the source tree is re-pointed at the same
 * place in the workspace, and a link that leads anywhere else is refused. The
 * evaluation folder, which holds the contract, the probes and the mutations,
 * is left out of every workspace, so a target cannot read which defect was
 * planted.
 *
 * A worktree shares the repository it came from: its refs, its configuration
 * and its objects. A run that opted out of confinement has targets that can
 * write them, so `adopterTreeState` reads them as well as the working tree and
 * the run can tell when a write changed any of them. Every process of a
 * confined run is denied a write to the project's git directory and the
 * checkout's `.git` file, so a confined run reads the working tree, the
 * checkout's own `HEAD` and where its git commands read their repository from: a commit,
 * fetch, push or rebase another session makes in any other checkout of the same
 * repository meanwhile does not stop it.
 *
 * A workspace that cannot be made is a `WorkspaceRefusal` (exit 12), and one
 * that fails part way is removed before the refusal leaves `createWorkspace`.
 * `removeWorkspace` removes a worktree's entry in the adopter's repository as
 * well as its files.
 *
 * The rest of this module is the generic half of TeA's live preflight
 * harness: a directory staged per leg, and a port that caches every
 * observation under a digest of the request that produced it, so a run cut
 * short by a quota costs one leg and not the set.
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const { killLiveStreams } = require('./confinement-audit');
const { hooksDirectory, unlockDirectories } = require('./confinement');
const { digest } = require('./digest');
const { cliObservation } = require('./registry');
const { RunDirectory } = require('./run-directory');

/** How long one `git worktree add` may take: a checkout of a large repository is slow, and a hang still ends. */
const GIT_CHECKOUT_TIMEOUT_MS = 10 * 60_000;
/** How long one pack of a withheld repository may take: it holds the project's whole history. */
const GIT_HISTORY_TIMEOUT_MS = 10 * 60_000;
const WITHHELD_REPOSITORY = 'git-view';
/** The streaming reader of a git answer that can exceed any buffer (Story 1.80). */
const GIT_LINES = path.join(__dirname, 'git-lines.js');
const OWNER_MARKER = '.tea-evaluate-owner.json';
const JOURNAL_DIRECTORY = '.workspace-journal';
const PRIVATE_PARENT_MARKER = '.tea-evaluate-private-owner.json';
const PRIVATE_RECORD_READ = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0);

/** Read the regular file that was inspected, without following a swapped link or blocking on a FIFO. */
function readPrivateRecord(file, inspected) {
  const descriptor = fs.openSync(file, PRIVATE_RECORD_READ);
  try {
    const opened = fs.fstatSync(descriptor);
    const current = fs.lstatSync(file);
    if (
      !opened.isFile() ||
      !current.isFile() ||
      !privateToUser(opened) ||
      !privateToUser(current) ||
      opened.dev !== inspected.dev ||
      opened.ino !== inspected.ino ||
      current.dev !== inspected.dev ||
      current.ino !== inspected.ino
    )
      return null;
    return fs.readFileSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

/** Kept beside the workspace while its contents are removed, so an interrupted cleanup still has ownership proof. */
function ownerSidecarOf(workspace) {
  return `${workspace.directory}${OWNER_MARKER}`;
}

/** POSIX ownership and mode bits are unavailable for a Windows ACL. */
function privateToUser(stat) {
  return !process.getuid || (stat.uid === process.getuid() && (stat.mode & 0o077) === 0);
}

/** A private record survives a killed process and a later change to TMPDIR. */
function journalDirectory(runsDirectory) {
  const directory = path.join(runsDirectory, JOURNAL_DIRECTORY);
  const runs = new RunDirectory(runsDirectory);
  let stat;
  try {
    const expectedRuns = path.join(fs.realpathSync.native(path.dirname(runsDirectory)), path.basename(runsDirectory));
    if (runs.realRoot !== expectedRuns) throw new WorkspaceRefusal(`workspace journal parent ${runsDirectory} moved or became a link`);
    runs.inDirectory('', () => {
      try {
        fs.mkdirSync(JOURNAL_DIRECTORY, { mode: 0o700 });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
      stat = fs.lstatSync(JOURNAL_DIRECTORY);
      if (!stat.isDirectory() || stat.isSymbolicLink() || !privateToUser(stat)) {
        throw new WorkspaceRefusal(`workspace journal ${directory} is not a private directory`);
      }
    });
    const journal = new RunDirectory(directory);
    const held = journal.directories.get('');
    if (journal.realRoot !== path.join(runs.realRoot, JOURNAL_DIRECTORY) || held.dev !== stat.dev || held.ino !== stat.ino) {
      journal.close();
      throw new WorkspaceRefusal(`workspace journal ${directory} moved before it could be held`);
    }
    return journal;
  } finally {
    runs.close();
  }
}

function writeWorkspaceJournal(workspace, ownership, temp) {
  const folder = fs.realpathSync.native(ownership.folder);
  const root = fs.realpathSync.native(ownership.root);
  const repository = workspace.repository === null ? null : fs.realpathSync.native(workspace.repository);
  const gitDirectory = workspace.gitDirectory === null ? null : fs.realpathSync.native(workspace.gitDirectory);
  const entry = {
    version: 1,
    folder,
    root,
    runId: ownership.runId,
    ownerPid: process.pid,
    temp,
    directory: workspace.directory,
    kind: workspace.kind,
    repository,
    gitDirectory,
    top: workspace.top,
  };
  const name = `${randomUUID()}.json`;
  ownership.journal.inDirectory(
    '',
    () => {
      const descriptor = fs.openSync(
        name,
        fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0),
        0o600,
      );
      let complete = false;
      try {
        fs.writeSync(descriptor, `${JSON.stringify(entry)}\n`);
        fs.fsyncSync(descriptor);
        complete = true;
      } finally {
        fs.closeSync(descriptor);
        if (!complete) fs.rmSync(name, { force: true });
      }
    },
    { undo: () => fs.rmSync(name, { force: true }) },
  );
  return { name, directory: ownership.journal, entry };
}

function retireWorkspaceJournal(workspace) {
  if (workspace.journal) workspace.journal.directory.inDirectory('', () => fs.rmSync(workspace.journal.name, { force: true }));
}

/** Reclaim only scratch corroborated by this evaluation's journal and its own marker. */
function reclaimDeadWorkspaces({ folder, root, journal, log = () => {} }) {
  let files;
  try {
    files = journal.inDirectory('', () => fs.readdirSync('.'));
  } catch (error) {
    throw new WorkspaceRefusal(`workspace journal ${journal.root} cannot be read: ${error.message}`);
  }
  const projectFolder = fs.realpathSync.native(folder);
  const projectRoot = fs.realpathSync.native(root);
  const projectRepository = repositoryOf(root);
  for (const name of files) {
    if (!/^[0-9a-f-]{36}\.json$/.test(name)) continue;
    const file = path.join(journal.root, name);
    let entry;
    try {
      const journalStat = journal.inDirectory('', () => fs.lstatSync(name));
      if (!journalStat.isFile() || !privateToUser(journalStat)) continue;
      entry = JSON.parse(journal.inDirectory('', () => fs.readFileSync(name, 'utf8')));
      if (
        entry.version !== 1 ||
        entry.folder !== projectFolder ||
        entry.root !== projectRoot ||
        !Number.isSafeInteger(entry.ownerPid) ||
        entry.ownerPid <= 0 ||
        typeof entry.runId !== 'string' ||
        !/^[a-zA-Z0-9_-]+$/.test(entry.runId) ||
        !['copy', 'git-worktree'].includes(entry.kind) ||
        typeof entry.temp !== 'string' ||
        typeof entry.directory !== 'string' ||
        path.dirname(entry.directory) !== entry.temp ||
        !path.basename(entry.directory).startsWith('tea-evaluate-') ||
        entry.top !== path.join(entry.directory, entry.kind === 'copy' ? 'target' : 'worktree') ||
        entry.repository !== (projectRepository?.top ?? null) ||
        entry.gitDirectory !== (projectRepository ? fs.realpathSync.native(projectRepository.gitDirectory) : null)
      )
        continue;
      // A reused PID is treated as live. Uncertain liveness retains the scratch.
      try {
        process.kill(entry.ownerPid, 0);
        continue;
      } catch (error) {
        if (error.code !== 'ESRCH') continue;
      }
      const sidecar = ownerSidecarOf(entry);
      let sidecarStat = null;
      try {
        sidecarStat = fs.lstatSync(sidecar);
      } catch (error) {
        if (error.code !== 'ENOENT') continue;
      }
      if (
        sidecarStat !== null &&
        (!sidecarStat.isFile() ||
          !privateToUser(sidecarStat) ||
          JSON.stringify(JSON.parse(fs.readFileSync(sidecar, 'utf8'))) !== JSON.stringify(entry))
      )
        continue;
      let stat;
      try {
        stat = fs.lstatSync(entry.directory);
      } catch (error) {
        if (error.code === 'ENOENT') {
          if (entry.kind === 'git-worktree') {
            const metadata = worktreeMetadataOf(entry, { requireReadable: true });
            if (metadata !== null) {
              if (fs.readFileSync(path.join(metadata, 'gitdir'), 'utf8').trim() !== path.join(entry.top, '.git')) continue;
              fs.rmSync(metadata, { recursive: true, force: true });
              log(`reclaimed Git worktree registration from killed run ${entry.runId}: ${metadata}`);
            }
          }
          fs.rmSync(sidecar, { force: true });
          journal.inDirectory('', () => fs.rmSync(name));
          continue;
        }
        continue;
      }
      if (!stat.isDirectory() || stat.isSymbolicLink() || !privateToUser(stat)) continue;
      if (fs.realpathSync.native(path.dirname(entry.directory)) !== entry.temp) continue;
      const marker = path.join(entry.directory, OWNER_MARKER);
      let markerStat = null;
      try {
        markerStat = fs.lstatSync(marker);
      } catch (error) {
        if (error.code !== 'ENOENT') continue;
      }
      if (markerStat === null) {
        // The kill may have landed between mkdir and the marker. Only an empty directory is safe here.
        // During teardown the sibling marker remains after this one is removed.
        if (sidecarStat === null && fs.readdirSync(entry.directory).length > 0) continue;
      } else {
        if (!markerStat.isFile() || !privateToUser(markerStat)) continue;
        const contents = fs.readFileSync(marker);
        let matches = false;
        try {
          matches = JSON.stringify(JSON.parse(contents.toString('utf8'))) === JSON.stringify(entry);
        } catch {
          // SIGKILL may have interrupted the marker write after its exclusive create.
        }
        if (!matches) {
          const expected = Buffer.from(`${JSON.stringify(entry)}\n`);
          const interruptedWrite =
            contents.length < expected.length &&
            expected.subarray(0, contents.length).equals(contents) &&
            fs.readdirSync(entry.directory).length === 1;
          if (!interruptedWrite) continue;
        }
      }
      const workspace = { ...entry, metadata: null, journal: { name, directory: journal, entry } };
      if (entry.kind === 'git-worktree') {
        workspace.metadata = worktreeMetadataOf(workspace, { requireReadable: true });
        if (
          workspace.metadata !== null &&
          fs.readFileSync(path.join(workspace.metadata, 'gitdir'), 'utf8').trim() !== path.join(entry.top, '.git')
        )
          continue;
        const gitFile = path.join(entry.top, '.git');
        if (fs.existsSync(gitFile)) {
          if (workspace.metadata === null || !fs.lstatSync(gitFile).isFile()) continue;
          const pointer = fs
            .readFileSync(gitFile, 'utf8')
            .trim()
            .replace(/^gitdir:\s*/, '');
          if (path.resolve(entry.top, pointer) !== workspace.metadata) continue;
        }
      }
      removeWorkspace(workspace);
      log(`reclaimed workspace from killed run ${entry.runId}: ${entry.directory}`);
    } catch (error) {
      log(`could not verify or reclaim workspace journal ${file}: ${error.message}`);
    }
  }
}

/** A workspace the run cannot make faithfully and contained; `tea-evaluate` refuses it with exit 12. */
class WorkspaceRefusal extends Error {
  /**
   * @param {string} message
   * @param {object} [options]
   * @param {boolean} [options.atRevision] the commit checked out cannot hold the target (no `launch.root`, or
   *   submodules under it), a property of that revision rather than of the machine
   */
  constructor(message, { atRevision = false } = {}) {
    super(message);
    this.name = 'WorkspaceRefusal';
    this.atRevision = atRevision;
  }
}

/** `relative` in POSIX form, as every message and record spells a path. */
function posix(relative) {
  return relative.split(path.sep).join('/');
}

/** Whether `candidate` is `root` or a path inside it. */
function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/**
 * The real path of `candidate`, whose missing tail (a dangling link's target)
 * is joined to the real path of the part that exists. `candidate` is taken as
 * spelled: a `..` after a symbolic link climbs from the link's target, as the
 * system resolves it, so the caller must not normalize it first.
 */
function realPathLoosely(candidate) {
  const missing = [];
  let existing = candidate;
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(existing), ...missing);
    } catch {
      const parent = path.dirname(existing);
      if (parent === existing) return candidate;
      missing.unshift(path.basename(existing));
      existing = parent;
    }
  }
}

/** `path.join` without the normalization that would collapse a `..` after a symbolic link. */
function joinAsSpelled(base, spelled) {
  return path.isAbsolute(spelled) ? spelled : `${base}${path.sep}${spelled}`;
}

/** Where the symbolic link `link` leads, resolved by the system; a dangling or looping link through the loose walk. */
function realTargetOf(link) {
  try {
    return fs.realpathSync.native(link);
  } catch {
    return realPathLoosely(joinAsSpelled(path.dirname(link), fs.readlinkSync(link)));
  }
}

/** Every symbolic link under `directory`, without following one. */
function symbolicLinksUnder(directory) {
  const links = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) links.push(full);
    else if (entry.isDirectory()) links.push(...symbolicLinksUnder(full));
  }
  return links;
}

function isDirectory(candidate) {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Points every symbolic link under `scan` inside the workspace.
 *
 * Each link is resolved where it lies, as the system resolves it. A link that
 * resolves inside the workspace (`copyTop`) stays as it is; one that resolves
 * inside `sourceTop`, the tree the workspace was made from, is rewritten as a
 * relative link to the same place in the workspace, so a write through it
 * lands in the workspace; one that resolves anywhere else is refused, since a
 * leg writing through it would write outside the workspace. The refusal names
 * where the link leads in the source when the link is there too.
 */
function containLinks({ sourceTop, copyTop, scan }) {
  for (const link of symbolicLinksUnder(scan)) {
    const target = realTargetOf(link);
    if (isInside(copyTop, target)) continue;
    if (!isInside(sourceTop, target)) {
      const original = path.join(sourceTop, path.relative(copyTop, link));
      let named = target;
      try {
        if (fs.lstatSync(original).isSymbolicLink()) named = realTargetOf(original);
      } catch {
        // The link exists in the workspace alone (a worktree's commit holds it); its own target is named.
      }
      throw new WorkspaceRefusal(
        `${posix(path.relative(scan, link))} in launch.root is a symbolic link to ${named}, outside the project; a leg writing through it would write outside the disposable workspace, so remove the link or point it inside the project`,
      );
    }
    const contained = path.relative(path.dirname(link), path.join(copyTop, path.relative(sourceTop, target))) || '.';
    if (fs.readlinkSync(link) === contained) continue;
    const kind = isDirectory(target) ? 'dir' : 'file';
    fs.unlinkSync(link);
    fs.symlinkSync(contained, link, kind);
  }
}

/**
 * Copies `from` to `to`: files, directories and symbolic links (verbatim), as
 * copy-on-write clones where the file system offers them, leaving out every
 * path `skip` answers true for. An entry that is neither a file, a directory
 * nor a link is refused, named relative to `root`.
 */
function copyTreeInto(from, to, { skip = () => false, root = from } = {}) {
  fs.cpSync(from, to, {
    recursive: true,
    verbatimSymlinks: true,
    mode: fs.constants.COPYFILE_FICLONE,
    filter: (source) => {
      if (skip(source)) return false;
      const stats = fs.lstatSync(source);
      if (!stats.isFile() && !stats.isDirectory() && !stats.isSymbolicLink()) {
        throw new WorkspaceRefusal(
          `${posix(path.relative(root, source))} in launch.root is neither a file, a directory nor a symbolic link (a FIFO, a socket or a device), which the disposable workspace cannot hold; remove it or move it out of the project`,
        );
      }
      return true;
    },
  });
}

/** Every directory and file under `directory` (itself included), without following a link. */
function entriesUnder(directory) {
  const found = [{ file: directory, directory: true }];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) found.push(...entriesUnder(full));
    else found.push({ file: full, directory: false });
  }
  return found;
}

/**
 * Removes every write bit under `directory`, so a write, a new file, a rename
 * or a removal under it fails for a process that does not restore the bits
 * first (the owner can, and root ignores them).
 */
function makeReadOnly(directory) {
  for (const entry of entriesUnder(directory)) {
    const mode = fs.lstatSync(entry.file).mode & 0o7777;
    fs.chmodSync(entry.file, mode & ~0o222);
  }
}

/** The name prefix of the run's private parent, and of the per-user root every run's parent sits beneath. */
const PRIVATE_PARENT_PREFIX = 'run-';
const PRIVATE_ROOT_PREFIX = 'tea-evaluate-p';

/** The per-user root's name: `tea-evaluate-p<uid>`, the one root of every run of the user. */
function privateRootName() {
  return `${PRIVATE_ROOT_PREFIX}${typeof process.getuid === 'function' ? process.getuid() : 'w'}`;
}

/**
 * Where the user's private root sits: `/tmp` on POSIX, whatever each run's `TMPDIR` is, so every run of the user, with any
 * temp directory, shares one root path that one sandbox can withhold (`/tmp/tea-evaluate-p<uid>`, which is also always
 * within the bridge's 100 byte socket path budget); Windows has no confinement and keeps the system temp directory.
 */
function privateRootBase() {
  return process.platform === 'win32' ? os.tmpdir() : '/tmp';
}

/**
 * The user's private root, made when absent (mode 0700) and held to be a real directory (no link) the user owns, with no
 * access for anyone else; `null` when it is not, so a planted link or a directory another user made is never used.
 */
function privateRootIn(base) {
  const root = path.join(base, privateRootName());
  try {
    fs.mkdirSync(root, { mode: 0o700 });
  } catch (error) {
    if (error.code !== 'EEXIST') return null;
  }
  return heldPrivateRoot(root);
}

/**
 * `root` when it is a real directory (no link) the user owns, its mode closed to 0700; `null` otherwise. It makes
 * nothing, so a tool that only reads the root (a test suite reaping what killed runs left) shares the check.
 */
function heldPrivateRoot(root) {
  try {
    const stat = fs.lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return null;
    if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) return null;
    if ((stat.mode & 0o077) !== 0) fs.chmodSync(root, 0o700);
  } catch {
    return null;
  }
  return root;
}

/**
 * The run's private parent directory, beneath the user's one private root.
 *
 * Every run of the user makes its parent beneath the same root,
 * `/tmp/tea-evaluate-p<uid>` (mode 0700; no run removes it, since another run
 * may be using it), whatever the run's `TMPDIR` is, and the target
 * confinement (`confinement.js`) withholds the root. A sandbox built for one
 * run therefore also covers the parent of a run that starts later, of a run
 * another process is making now and of a run with another temp directory, so
 * a process left running by an earlier run or a target of a concurrent run
 * cannot reach this run's bridge token or socket. The parent is registered in
 * `scratch` (listed first, so the run's end removes it with every directory
 * beneath it) and recorded as `scratch.privateParent`, its root as
 * `scratch.privateRoot`; its name carries the run's process id (`run-<pid>-<random>`), so a parent a killed run leaves is
 * known to be dead. Every private directory the evaluation layer makes
 * for the run (the engine's, the qualification's, an evaluator's, a judge's,
 * the bridge's configuration, token and socket, the score's) is made beneath
 * the parent by `makeScratchDirectory`. A directory the target is deliberately
 * granted (its temp directory, the status and port
 * directories, the workspace) stays in the run's temp directory.
 *
 * @param {string[]} scratch
 * @returns {string} the parent
 */
function makePrivateParent(scratch, ownership = null) {
  if (typeof scratch.privateParent === 'string') return scratch.privateParent;
  const root = privateRootIn(privateRootBase());
  if (root === null) {
    throw new WorkspaceRefusal(
      `no private directory for the run can be made: ${path.join(privateRootBase(), privateRootName())} must be a directory you own that is not a link; remove what is there`,
    );
  }
  let directory;
  let pendingOwnership = null;
  if (ownership === null) {
    directory = fs.mkdtempSync(path.join(root, `${PRIVATE_PARENT_PREFIX}${process.pid}-`));
  } else {
    const nonce = randomUUID();
    directory = path.join(root, `${PRIVATE_PARENT_PREFIX}${process.pid}-${nonce}`);
    const entry = {
      version: 1,
      kind: 'private-parent',
      folder: fs.realpathSync.native(ownership.folder),
      root: fs.realpathSync.native(ownership.root),
      runId: ownership.runId,
      ownerPid: process.pid,
      privateRoot: root,
      directory,
    };
    const name = `aux-${nonce}.json`;
    const contents = `${JSON.stringify(entry)}\n`;
    ownership.journal.inDirectory(
      '',
      () => {
        const descriptor = fs.openSync(
          name,
          fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0),
          0o600,
        );
        try {
          fs.writeFileSync(descriptor, contents);
          fs.fsyncSync(descriptor);
        } catch (error) {
          fs.closeSync(descriptor);
          fs.rmSync(name, { force: true });
          throw error;
        }
        fs.closeSync(descriptor);
      },
      { undo: () => fs.rmSync(name, { force: true }) },
    );
    // The journal precedes the directory. A kill in this window leaves a record with no parent to retire.
    fs.mkdirSync(directory, { mode: 0o700 });
    pendingOwnership = { name, journal: ownership.journal, entry, contents };
  }
  scratch.unshift(directory);
  Object.defineProperty(scratch, 'privateParent', { value: directory, enumerable: false, configurable: true, writable: true });
  const parentStat = fs.lstatSync(directory);
  Object.defineProperty(scratch, 'privateParentIdentity', {
    value: { dev: parentStat.dev, ino: parentStat.ino },
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(scratch, 'privateRoot', { value: root, enumerable: false, configurable: true, writable: true });
  if (pendingOwnership !== null) {
    const { name, journal, entry, contents } = pendingOwnership;
    Object.defineProperty(scratch, 'privateOwnership', {
      value: { name, journal, entry },
      enumerable: false,
      configurable: true,
    });
    const marker = fs.openSync(
      path.join(directory, PRIVATE_PARENT_MARKER),
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    try {
      fs.writeFileSync(marker, contents);
      fs.fsyncSync(marker);
    } finally {
      fs.closeSync(marker);
    }
  }
  return directory;
}

/** Retire a normal run's record only after its parent has gone. A failed cleanup remains recoverable. */
function retirePrivateParentOwnership(scratch) {
  const ownership = scratch.privateOwnership;
  if (!ownership) return;
  try {
    fs.lstatSync(ownership.entry.directory);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    ownership.journal.inDirectory('', () => fs.rmSync(ownership.name, { force: true }));
  }
}

/** A recorded root may be from an earlier Windows temp directory; POSIX always uses its fixed root. */
function recordedPrivateRoot(entry, platform) {
  const root = entry.privateRoot;
  if (
    typeof root !== 'string' ||
    !path.isAbsolute(root) ||
    path.normalize(root) !== root ||
    path.basename(root) !== privateRootName() ||
    (platform !== 'win32' && root !== path.join(privateRootBase(), privateRootName()))
  )
    return null;
  return root;
}

/** Reclaim a dead invocation's private parent only when its journal and in-parent marker agree. */
function reclaimDeadPrivateParents({ folder, root, journal, log = () => {}, platform = process.platform }) {
  const projectFolder = fs.realpathSync.native(folder);
  const projectRoot = fs.realpathSync.native(root);
  const names = journal.inDirectory('', () => fs.readdirSync('.').filter((name) => /^aux-[0-9a-f-]{36}\.json$/.test(name)));
  for (const name of names) {
    try {
      const stat = journal.inDirectory('', () => fs.lstatSync(name));
      if (!stat.isFile() || !privateToUser(stat)) continue;
      const journalBytes = journal.inDirectory('', () => readPrivateRecord(name, stat));
      if (journalBytes === null) continue;
      const entry = JSON.parse(journalBytes.toString('utf8'));
      const privateRoot = recordedPrivateRoot(entry, platform);
      if (
        entry.version !== 1 ||
        entry.kind !== 'private-parent' ||
        entry.folder !== projectFolder ||
        entry.root !== projectRoot ||
        !Number.isSafeInteger(entry.ownerPid) ||
        entry.ownerPid <= 0 ||
        typeof entry.runId !== 'string' ||
        !/^[a-zA-Z0-9_-]+$/.test(entry.runId) ||
        privateRoot === null ||
        entry.directory !== path.join(privateRoot, `${PRIVATE_PARENT_PREFIX}${entry.ownerPid}-${name.slice(4, -5)}`)
      )
        continue;
      // A reused PID, an inaccessible process and any uncertain liveness all preserve the parent.
      try {
        process.kill(entry.ownerPid, 0);
        continue;
      } catch (error) {
        if (error.code !== 'ESRCH') continue;
      }
      // The old root may no longer exist. Retain an unverifiable record for inspection.
      const rootStat = fs.lstatSync(privateRoot);
      if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || !privateToUser(rootStat)) continue;
      const heldRoot = new RunDirectory(privateRoot);
      try {
        const expectedRoot = path.join(fs.realpathSync.native(path.dirname(privateRoot)), path.basename(privateRoot));
        const held = heldRoot.directories.get('');
        if (heldRoot.realRoot !== expectedRoot || held.dev !== rootStat.dev || held.ino !== rootStat.ino) continue;
        const parentName = path.basename(entry.directory);
        const parentStat = heldRoot.inDirectory('', () => {
          try {
            return fs.lstatSync(parentName);
          } catch (error) {
            if (error.code === 'ENOENT') return null;
            throw error;
          }
        });
        if (parentStat === null) {
          journal.inDirectory('', () => fs.rmSync(name));
          continue;
        }
        if (!parentStat.isDirectory() || parentStat.isSymbolicLink() || !privateToUser(parentStat)) continue;
        const marker = path.join(entry.directory, PRIVATE_PARENT_MARKER);
        let markerStat;
        try {
          markerStat = fs.lstatSync(marker);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          markerStat = null;
        }
        if (markerStat === null) {
          // A kill between mkdir and marker is safe to reclaim only while the directory is empty.
          if (fs.readdirSync(entry.directory).length > 0) continue;
        } else {
          if (!markerStat.isFile() || !privateToUser(markerStat)) continue;
          const contents = readPrivateRecord(marker, markerStat);
          if (contents === null) continue;
          const expected = Buffer.from(`${JSON.stringify(entry)}\n`);
          if (!contents.equals(expected)) {
            // An interrupted exclusive marker write is safe only when its bytes are the exact prefix and nothing else exists.
            const partial =
              contents.length < expected.length &&
              expected.subarray(0, contents.length).equals(contents) &&
              fs.readdirSync(entry.directory).length === 1;
            if (!partial) continue;
          }
        }
        const auxiliary = fs
          .readdirSync(entry.directory)
          .filter((item) => item !== PRIVATE_PARENT_MARKER)
          .sort();
        heldRoot.inDirectory('', () => {
          const current = fs.lstatSync(parentName);
          if (current.dev !== parentStat.dev || current.ino !== parentStat.ino || !current.isDirectory()) {
            throw new WorkspaceRefusal(`private parent ${entry.directory} changed during recovery`);
          }
          for (const item of auxiliary) {
            removeScratchDirectory(path.join(parentName, item));
            log(`reclaimed auxiliary scratch from killed run ${entry.runId}: ${path.join(entry.directory, item)}`);
          }
          const remaining = fs.readdirSync(parentName);
          if (markerStat === null) {
            if (remaining.length > 0) throw new WorkspaceRefusal(`private parent ${entry.directory} gained an entry during recovery`);
          } else {
            const currentMarker = fs.lstatSync(path.join(parentName, PRIVATE_PARENT_MARKER));
            if (
              remaining.length !== 1 ||
              remaining[0] !== PRIVATE_PARENT_MARKER ||
              !currentMarker.isFile() ||
              currentMarker.dev !== markerStat.dev ||
              currentMarker.ino !== markerStat.ino
            )
              throw new WorkspaceRefusal(`private parent ${entry.directory} changed its marker during recovery`);
            fs.rmSync(path.join(parentName, PRIVATE_PARENT_MARKER));
          }
          fs.rmdirSync(parentName);
        });
        journal.inDirectory('', () => fs.rmSync(name));
        log(`reclaimed private parent from killed run ${entry.runId}: ${entry.directory}`);
      } finally {
        heldRoot.close();
      }
    } catch (error) {
      log(`could not verify or reclaim private parent journal ${path.join(journal.root, name)}: ${error.message}`);
    }
  }
}

/**
 * A private temporary directory registered in `scratch`, the run's list of
 * directories it removes however it ends (`preflight.js` `pipeline`), an
 * interrupting signal included. It is made beneath the run's private parent
 * (`makePrivateParent`) when the list has one, and in the system temp
 * directory otherwise.
 *
 * @param {string[]} scratch
 * @param {string} prefix the directory's name prefix
 * @param {string} [root] the directory it is made in; the system's temporary directory when absent
 * @returns {string}
 */
function makeScratchDirectory(scratch, prefix, root = scratch.privateParent ?? os.tmpdir()) {
  const directory = fs.mkdtempSync(path.join(root, prefix));
  scratch.push(directory);
  return directory;
}

/**
 * Removes a scratch directory, its write bits restored first
 * (`unlockDirectories`), so a read-only directory a process left in it cannot
 * keep it; throws when it still cannot be removed.
 */
function removeScratchDirectory(directory) {
  unlockDirectories(directory);
  fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

/** Remove a private parent's direct children while its ownership marker remains available for recovery. */
function removePrivateParentDirectory(directory, expected) {
  const verify = () => {
    const current = fs.lstatSync(directory);
    if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== expected?.dev || current.ino !== expected?.ino)
      throw new WorkspaceRefusal(`private parent ${directory} changed before cleanup`);
  };
  verify();
  for (const name of fs.readdirSync(directory)) {
    verify();
    if (name !== PRIVATE_PARENT_MARKER) removeScratchDirectory(path.join(directory, name));
  }
  verify();
  fs.rmSync(path.join(directory, PRIVATE_PARENT_MARKER), { force: true });
  verify();
  fs.rmdirSync(directory);
}

/**
 * Removes `directory` and takes it off `scratch` once it is gone; one that
 * cannot be removed stays listed, so the run's end tries it again and reports
 * it, and the caller goes on.
 */
function releaseScratchDirectory(scratch, directory) {
  try {
    removeScratchDirectory(directory);
  } catch {
    return;
  }
  const at = scratch.indexOf(directory);
  if (at !== -1) scratch.splice(at, 1);
}

/** A file's SHA-256 in hex, read in chunks so a file of any size fits. */
function fileDigest(file) {
  const hash = createHash('sha256');
  const descriptor = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    for (let read = fs.readSync(descriptor, buffer); read > 0; read = fs.readSync(descriptor, buffer)) {
      hash.update(buffer.subarray(0, read));
    }
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest('hex');
}

/**
 * A digest over every directory, file and symbolic link under `root`, sorted
 * by path: each contributes its POSIX path and kind; directories and files
 * also contribute their mode, a file its SHA-256 bytes and a link its target.
 * A path in `exclude` (absolute) is left out with everything under it.
 *
 * @param {string} root
 * @param {object} [options]
 * @param {string[]} [options.exclude]
 * @returns {string} `sha256:<hex>`
 */
function treeDigest(root, { exclude = [] } = {}) {
  const excluded = new Set(exclude);
  const parts = ['.', 'directory', fs.lstatSync(root).mode & 0o7777];
  const visit = (directory) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      if (excluded.has(full)) continue;
      const relative = posix(path.relative(root, full));
      if (entry.isSymbolicLink()) parts.push(relative, 'link', fs.readlinkSync(full));
      else if (entry.isDirectory()) {
        parts.push(relative, 'directory', fs.lstatSync(full).mode & 0o7777);
        visit(full);
      } else if (entry.isFile()) parts.push(relative, 'file', fs.lstatSync(full).mode & 0o7777, fileDigest(full));
    }
  };
  visit(root);
  return digest(parts);
}

/**
 * The digest AD-7 names as a worktree probe's `implementationDigest`: the
 * tracked tree of `directory` at `commit`, which git itself lists. It is the
 * SHA-256 of `git ls-tree -r -z <commit>:<directory>` (each entry's mode,
 * type, object and path relative to `directory`, NUL-terminated), with every
 * entry under an excluded directory left out, since the evaluation folder
 * describes the implementation and is not part of it. Paths are relative to
 * `directory`, so the same files digest alike wherever the project sits in
 * its repository.
 *
 * @param {object} options
 * @param {string} options.repository the repository top, by its real path
 * @param {string} options.commit
 * @param {string} options.directory the implementation root in the repository (the skill root or `launch.root`)
 * @param {string[]} [options.exclude] absolute directories in the repository whose entries are left out
 * @returns {string} `sha256:<hex>`
 * @throws {WorkspaceRefusal} when git cannot list the tree
 */
function trackedTreeDigest({ repository, commit, directory, exclude = [] }) {
  const scope = posix(path.relative(repository, directory));
  const listed = runGit(['-C', repository, 'ls-tree', '-r', '-z', scope === '' ? `${commit}^{tree}` : `${commit}:${scope}`]);
  if (!listed.ok) throw new WorkspaceRefusal(`could not list the tracked tree of ${scope || '.'} at commit ${commit}: ${listed.detail}`);
  const prefixes = exclude
    .filter((entry) => entry !== directory && isInside(directory, entry))
    .map((entry) => `${posix(path.relative(directory, entry))}/`);
  const kept = listed.stdout
    .split('\u0000')
    .filter((record) => record.length > 0)
    .filter((record) => {
      const relative = record.slice(record.indexOf('\t') + 1);
      return !prefixes.some((prefix) => relative.startsWith(prefix));
    });
  return `sha256:${createHash('sha256')
    .update(kept.map((record) => `${record}\u0000`).join(''), 'utf8')
    .digest('hex')}`;
}

/** How long one git question may take; a checkout has its own, longer bound. */
const GIT_QUESTION_TIMEOUT_MS = 60_000;
/** A generous ceiling on what one git command may print: a status of a large, busy tree. */
const GIT_OUTPUT_BYTES = 256 * 1024 * 1024;

/**
 * Runs `git` with every `GIT_` variable removed from its environment, so a
 * caller running inside a git hook (where `GIT_DIR` and `GIT_INDEX_FILE` name
 * the hook's own repository) cannot redirect a command meant for `-C <dir>`.
 * `input`, when a string, is the command's standard input; otherwise it reads nothing.
 *
 * @returns {{ok: true, stdout: string}|{ok: false, status?: number, detail: string}}
 */
function runGit(args, { timeoutMs = GIT_QUESTION_TIMEOUT_MS, supervised = false, input = null, env: extra = {} } = {}) {
  return runCommand('git', args, { label: `git ${args.join(' ')}`, timeoutMs, supervised, input, extra });
}

/**
 * Runs `command` as `runGit` runs git: supervised, `command` is the one the supervisor starts, so a timeout, a signal or
 * the runtime's death stops every process it started.
 */
function runCommand(command, args, { label, timeoutMs, supervised, input, extra }) {
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))), ...extra };
  const result = supervised
    ? spawnSync(
        process.execPath,
        [path.join(__dirname, '..', 'agent-supervisor.js'), String(process.pid), String(timeoutMs), command, ...args],
        {
          encoding: 'utf8',
          env,
          maxBuffer: GIT_OUTPUT_BYTES,
          ...(input === null ? {} : { input }),
          stdio: [input === null ? 'ignore' : 'pipe', 'pipe', 'pipe', 'pipe'],
        },
      )
    : spawnSync(command, args, {
        encoding: 'utf8',
        env,
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
        maxBuffer: GIT_OUTPUT_BYTES,
        ...(input === null ? {} : { input }),
      });
  if (result.error) return { ok: false, detail: `${label} could not run: ${result.error.code ?? result.error.message}` };
  if (supervised) {
    let report;
    try {
      report = JSON.parse(result.output?.[3] ?? '');
    } catch {
      return { ok: false, detail: `${label} supervisor gave no report` };
    }
    if (report.timedOut || report.failure || report.spawnError || report.signal || report.status !== 0) {
      return {
        ok: false,
        status: report.status ?? undefined,
        detail: `${label} ${report.failure ?? report.spawnError?.message ?? (report.timedOut ? 'timed out' : `ended ${report.signal ?? report.status}: ${String(result.stderr).trim()}`)}`,
      };
    }
    return { ok: true, stdout: result.stdout };
  }
  if (result.signal !== null) return { ok: false, detail: `${label} was killed by ${result.signal}` };
  if (result.status !== 0) {
    return { ok: false, status: result.status, detail: `${label} exited ${result.status}: ${String(result.stderr).trim()}` };
  }
  return { ok: true, stdout: result.stdout };
}

/**
 * Runs one of `git-lines.js`'s jobs (a walk or a pipeline of git commands whose output can exceed any buffer) under the
 * supervisor and returns the lines it kept; see that script for the jobs.
 *
 * @returns {{ok: true, lines: string[]}|{ok: false, status?: number, detail: string}}
 */
function runGitLines(job, { timeoutMs = GIT_HISTORY_TIMEOUT_MS, env = {} } = {}) {
  // A job that pipes two commands names both, so a failure reads as the stage that failed.
  const stages = job.stages ?? (job.git === undefined ? [job.list, job.ask] : [job.git]);
  const label = stages.map((stage) => `git ${stage.join(' ')}`).join(' | ');
  const result = runCommand(process.execPath, [GIT_LINES], {
    label,
    timeoutMs,
    supervised: true,
    input: JSON.stringify(job),
    extra: env,
  });
  return result.ok ? { ok: true, lines: result.stdout.split('\n').filter((line) => line.length > 0) } : result;
}

/**
 * The git repository `directory` sits in: its top level, its common git
 * directory, the commit `HEAD` names and that commit's tree, or null when
 * `directory` is in no repository. `commit` is null in a repository with no
 * commit yet.
 */
function repositoryOf(directory) {
  const top = runGit(['-C', directory, 'rev-parse', '--show-toplevel']);
  if (!top.ok) return null;
  const resolvedTop = fs.realpathSync.native(top.stdout.trim());
  const common = runGit(['-C', resolvedTop, 'rev-parse', '--git-common-dir']);
  const gitDirectory = common.ok ? path.resolve(resolvedTop, common.stdout.trim()) : path.join(resolvedTop, '.git');
  const commit = runGit(['-C', resolvedTop, 'rev-parse', '--verify', '--quiet', 'HEAD^{commit}']);
  if (!commit.ok) return { top: resolvedTop, gitDirectory, commit: null, tree: null };
  const id = commit.stdout.trim();
  const tree = runGit(['-C', resolvedTop, 'rev-parse', `${id}^{tree}`]);
  return { top: resolvedTop, gitDirectory, commit: id, tree: tree.ok ? tree.stdout.trim() : null };
}

/** What a path in the tree holds, for a digest: a file's SHA-256, a link's target, or a marker for anything else or nothing. */
function contentOf(file) {
  let stats;
  try {
    stats = fs.lstatSync(file);
  } catch {
    return '<absent>';
  }
  if (stats.isSymbolicLink()) return `<link>${fs.readlinkSync(file)}`;
  if (stats.isFile()) return `<file>${fileDigest(file)}`;
  return '<not a file>';
}

/**
 * What in a repository's common git directory is git's own bookkeeping for a
 * run, and so left out of `sharedStateDigest`: the object store (a worktree's
 * checkout adds nothing a target could use to change the adopter's files, and
 * it is the bulk of the directory), reflogs, the per-worktree records a
 * worktree add and remove write, the index, a submodule's or LFS's own store,
 * and lock files.
 */
const GIT_BOOKKEEPING = new Set(['objects', 'logs', 'worktrees', 'index', 'modules', 'lfs']);

/**
 * A digest over a repository's common git directory, bookkeeping left out:
 * its configuration, hooks, `info/` (`exclude`, `attributes`), `description`,
 * refs and anything else a target running git in a worktree could change on
 * the adopter's behalf. A hooks directory `core.hooksPath` names outside the
 * git directory (`hooksDirectory`) is read with it.
 */
function sharedStateDigest(gitDirectory, hooks = null) {
  let entries;
  try {
    entries = fs.readdirSync(gitDirectory, { withFileTypes: true });
  } catch (error) {
    throw new WorkspaceRefusal(`could not read the git directory ${gitDirectory}: ${error.message}`);
  }
  const exclude = entries
    .filter((entry) => GIT_BOOKKEEPING.has(entry.name) || entry.name.endsWith('.lock'))
    .map((entry) => path.join(gitDirectory, entry.name));
  const git = treeDigest(gitDirectory, { exclude });
  return hooks === null ? git : digest([git, hooks, fs.existsSync(hooks) ? treeDigest(hooks) : '<absent>']);
}

/**
 * Where the checkout's git commands read their repository from: the git directory the checkout resolves to (a real path), the
 * content of the checkout's `.git` file when it is a file (a linked worktree or a submodule; null for a directory), and the
 * hooks directory `core.hooksPath` names outside the common git directory, with `<absent>` or `<present>` after it. A layer
 * process that rewrote the gitfile to point into a copy it controls, or created a hooks directory that did not exist when the
 * run started (a Bubblewrap bind cannot cover an absent path), moves this reading, so the run ends with exit 12 whatever write
 * path the confinement missed.
 */
function repositoryRedirects(repository) {
  const absolute = runGit(['-C', repository.top, 'rev-parse', '--absolute-git-dir']);
  if (!absolute.ok) throw new WorkspaceRefusal(`could not read the state of the adopter's tree at ${repository.top}: ${absolute.detail}`);
  const gitFile = path.join(repository.top, '.git');
  let content = null;
  try {
    if (fs.lstatSync(gitFile).isFile()) content = fs.readFileSync(gitFile, 'utf8');
  } catch {
    // A checkout whose `.git` cannot be read is read through git alone.
  }
  const hooks = hooksDirectory(repository.top, repository.gitDirectory);
  return {
    gitDirectory: fs.realpathSync.native(absolute.stdout.trim()),
    gitFile: content,
    hooks: hooks === null ? null : `${hooks} ${fs.existsSync(hooks) ? '<present>' : '<absent>'}`,
  };
}

/**
 * A reading of the adopter's project that compares equal to an earlier one
 * only when nothing a run could have written changed between them (AD-8).
 *
 * Inside a git repository: `git status` (tracked and untracked paths), a
 * digest over the content of every path it names (one already modified
 * included), the commit the checkout's own `HEAD` names (another worktree's
 * commit cannot move it), and where the checkout's git commands read their
 * repository from (`repositoryRedirects`: the git directory it resolves to, its
 * `.git` file and the hooks directory `core.hooksPath` names), which a layer
 * process that redirects the checkout moves. With `sharedState` (the default) also the
 * repository's common git directory without its bookkeeping
 * (`sharedStateDigest`), since a detached worktree shares it with the
 * repository it came from, the hooks directory `core.hooksPath` names outside
 * it, and every ref (branches, tags, the stash). Without it, which is how a
 * confined run reads, the git directory is left to the confinement: every
 * process of a confined run is denied a write to it, so a digest of it would
 * fire on other sessions only (a push, a rebase, a worktree add or a gc in
 * another worktree or the main checkout all write it).
 * `--no-optional-locks` keeps `git status` from rewriting the index.
 * Gitignored paths are not read.
 * Outside a repository: the tree digest of `directory`, the paths in
 * `exclude` left out.
 *
 * @param {string} directory `launch.root`
 * @param {object} [options]
 * @param {string[]} [options.exclude] absolute paths a run itself writes (the evaluation's `runs/`)
 * @param {boolean} [options.sharedState] whether to read the shared git state (Story 1.112): `true` for a run whose targets can write it, `false` for a confined run, whose processes the layer denial keeps out of it
 * @returns {object}
 * @throws {WorkspaceRefusal} when git cannot answer
 */
function adopterTreeState(directory, { exclude = [], sharedState = true } = {}) {
  const repository = repositoryOf(directory);
  if (repository === null) {
    try {
      return { repository: null, treeDigest: treeDigest(directory, { exclude }) };
    } catch (error) {
      throw new WorkspaceRefusal(`could not read the state of the adopter's project at ${directory}: ${error.message}`);
    }
  }
  const failed = (answer) => {
    throw new WorkspaceRefusal(`could not read the state of the adopter's tree at ${repository.top}: ${answer.detail}`);
  };
  // The redirects are read first, and `core.fsmonitor` is switched off for the status, since a checkout redirected to a
  // repository a layer process controls would run that repository's fsmonitor command from the runtime's own unconfined read.
  const redirects = repositoryRedirects(repository);
  const status = runGit([
    '-c',
    'core.fsmonitor=false',
    '--no-optional-locks',
    '-C',
    repository.top,
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
  ]);
  if (!status.ok) failed(status);
  const parts = [];
  const records = status.stdout.split('\u0000').filter((record) => record.length > 0);
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const paths = [record.slice(3)];
    // A rename or copy names its source in the record after it.
    if (/^[RC]/.test(record) && index + 1 < records.length) {
      index += 1;
      paths.push(records[index]);
    }
    for (const relative of paths) parts.push(relative, contentOf(path.join(repository.top, relative)));
  }
  const state = {
    repository: repository.top,
    head: repository.commit,
    ...redirects,
    status: status.stdout,
    changes: digest(parts),
  };
  if (!sharedState) return state;
  const refs = runGit(['-C', repository.top, 'for-each-ref', '--format=%(refname) %(objectname)']);
  if (!refs.ok) failed(refs);
  return {
    ...state,
    refs: refs.stdout,
    shared: sharedStateDigest(repository.gitDirectory, hooksDirectory(repository.top, repository.gitDirectory)),
  };
}

/**
 * Local configuration a withheld repository takes from the adopter's: how git
 * reads the tree it checks out. These `core.` keys are carried, and so are the
 * `filter.<name>.clean`, `.smudge`, `.process` and `.required` of a tracked
 * filter driver. Remotes, URLs, credentials and hooks are never carried.
 */
const CARRIED_CONFIGURATION = [
  'core.autocrlf',
  'core.eol',
  'core.safecrlf',
  'core.filemode',
  'core.ignorecase',
  'core.symlinks',
  'core.precomposeunicode',
  'core.trustctime',
  'core.checkstat',
];

/**
 * The withheld repositories this process built, by repository, commit and
 * withheld paths: a later workspace for the same key links the objects of one
 * that still exists in place of packing the history again.
 */
const BUILT_REPOSITORIES = new Map();

/**
 * The object directories `gitDirectory` borrows objects from
 * (`objects/info/alternates`, and theirs in turn), as real paths. A target that
 * could read one would read the history the project's git directory holds.
 */
function alternatesOf(gitDirectory) {
  const found = [];
  const visit = (objects) => {
    let text;
    try {
      text = fs.readFileSync(path.join(objects, 'info', 'alternates'), 'utf8');
    } catch {
      return;
    }
    for (const line of text.split('\n')) {
      const entry = line.trim();
      if (entry === '' || entry.startsWith('#')) continue;
      let resolved;
      try {
        resolved = fs.realpathSync.native(path.resolve(objects, entry));
      } catch {
        continue;
      }
      if (found.includes(resolved)) continue;
      found.push(resolved);
      visit(resolved);
    }
  };
  visit(path.join(gitDirectory, 'objects'));
  return found;
}

/**
 * What a withheld repository takes from the adopter's repository, asked once per
 * git directory in this process (a run builds many workspaces over one
 * repository): whether it is a partial clone, its object and ref formats, and
 * the local configuration that is carried.
 */
const ADOPTER_FACTS = new Map();

/**
 * Asked of every git call that reads the adopter's repository during a build: a partial clone's objects that are not on
 * disk are never fetched, so the build holds what the project holds (Story 1.80).
 */
const NO_LAZY_FETCH = { GIT_NO_LAZY_FETCH: '1' };

function adopterFacts(repository, gitDirectory) {
  const known = ADOPTER_FACTS.get(gitDirectory);
  if (known !== undefined) return known;
  const facts = { partial: partialCloneCause(repository), objectFormat: null, refFormat: null, carried: [], filters: [] };
  // Git before 2.45 does not know `--show-ref-format` and echoes the flag with exit 0, and before 2.38 not
  // `--show-object-format`: an answer that is not a known format means the format is unknown and is not passed on.
  const objectFormat = runGit(['-C', repository, 'rev-parse', '--show-object-format']);
  if (objectFormat.ok && /^(sha1|sha256)$/.test(objectFormat.stdout.trim())) facts.objectFormat = objectFormat.stdout.trim();
  const refFormat = runGit(['-C', repository, 'rev-parse', '--show-ref-format']);
  if (refFormat.ok && /^(files|reftable)$/.test(refFormat.stdout.trim())) facts.refFormat = refFormat.stdout.trim();
  // One question for the `core.` and `filter.` sections. With `-z` each answer is `<key>\n<value>` and a boolean written
  // with no value is the key alone, so a driver's name may hold a space and a `required` may stand bare. Git prints the
  // section and variable names in lower case and a filter's own name as written.
  const local = runGit(['--git-dir', gitDirectory, 'config', '--local', '-z', '--get-regexp', String.raw`^(core|filter)\.`]);
  if (local.ok) {
    const wanted = new Set(CARRIED_CONFIGURATION.map((key) => key.toLowerCase()));
    const values = new Map();
    const filters = new Map();
    for (const entry of local.stdout.split('\0')) {
      if (entry === '') continue;
      const newline = entry.indexOf('\n');
      const key = newline === -1 ? entry : entry.slice(0, newline);
      const value = newline === -1 ? null : entry.slice(newline + 1);
      if (wanted.has(key)) {
        if (value === null) values.set(key, 'true');
        else if (/^[A-Za-z0-9_.-]+$/.test(value)) values.set(key, value);
      } else if (/^filter\..+\.(clean|smudge|process|required)$/i.test(key)) {
        // A clean or smudge filter a `.gitattributes` names: without it every file it filters reads as modified.
        if (value === null) {
          if (/\.required$/i.test(key)) filters.set(key, 'true');
        } else if (value !== '') filters.set(key, value);
      }
    }
    facts.carried = [...values];
    facts.filters = [...filters];
  }
  ADOPTER_FACTS.set(gitDirectory, facts);
  return facts;
}

/** The `git --version` text and its `[major, minor]` numbers (null when unreadable); one process, asked only for a partial clone. */
function gitVersionOf() {
  const asked = runGit(['--version']);
  const match = asked.ok ? /(\d+)\.(\d+)/.exec(asked.stdout) : null;
  return { text: asked.ok ? asked.stdout.trim() : 'unknown', numbers: match === null ? null : [Number(match[1]), Number(match[2])] };
}

/** Whether this git honors `GIT_NO_LAZY_FETCH` (2.44 and later): without it a partial clone's build fetches one object at a time. */
function skipsLazyFetch({ numbers }) {
  return numbers !== null && (numbers[0] > 2 || (numbers[0] === 2 && numbers[1] >= 44));
}

/**
 * Refuses a partial-clone project under a git that cannot be told not to fetch (before 2.44), before any git call of a
 * confined workspace could fetch from the promisor remote.
 */
function assertSkipsLazyFetch(repository, gitDirectory) {
  const facts = adopterFacts(repository, gitDirectory);
  if (facts.partial === null) return;
  const version = gitVersionOf();
  if (skipsLazyFetch(version)) return;
  throw new WorkspaceRefusal(
    `the project is a partial clone (${facts.partial}) and this git (${version.text}) cannot be told not to fetch missing objects, which git 2.44 and later can; upgrade git, fetch the full history, or set "confinement": false in evaluation.json to run the targets unconfined`,
  );
}

/** The refusal for a revision a partial clone does not hold on disk: the confined run will not fetch it. */
function partialCheckoutRefusal(partial, commit, detail = '') {
  return `the project is a partial clone (${partial}) and does not hold the objects of commit ${commit} on disk, so checking it out would fetch them from the remote, which a confined run does not do; fetch them first (check the revision out once in your clone), or set "confinement": false in evaluation.json to run the targets unconfined${detail === '' ? '' : `: ${detail}`}`;
}

/** Why `repository` is a partial clone, or null: part of its history is not on disk, and a git command that needs it would fetch it. */
function partialCloneCause(repository) {
  const extension = runGit(['-C', repository, 'config', '--get', 'extensions.partialclone']);
  if (extension.ok && extension.stdout.trim() !== '') return `extensions.partialClone names the remote ${extension.stdout.trim()}`;
  // `--type=bool` reads every spelling git accepts (`true`, `yes`, `on`, `1` and a key written with no value) as `true`.
  const promisor = runGit(['-C', repository, 'config', '--type=bool', '--get-regexp', String.raw`^remote\..*\.promisor$`]);
  if (promisor.ok) {
    const line = promisor.stdout.split('\n').find((entry) => /\s+true$/.test(entry.trim()));
    if (line !== undefined) return `${line.trim().split(/\s+/)[0]} is true`;
  }
  return null;
}

/**
 * The object ids of `path` (a repository-relative path in POSIX form) at every
 * commit `commit` reaches that holds a tree there, once each, read from the
 * repository's own graph (its replace refs ignored). The commits and the answers
 * stream through `git-lines.js`, so a history of millions of commits is not held
 * in memory.
 */
function treesAtPath(repository, commit, withheldPath) {
  const read = ['--no-replace-objects', '-C', repository];
  const found = runGitLines(
    { mode: 'trees', list: [...read, 'rev-list', commit], ask: [...read, 'cat-file', '--batch-check'], path: withheldPath },
    { env: NO_LAZY_FETCH },
  );
  return found.ok ? { trees: found.lines } : { failure: found.detail };
}

/**
 * The tags of `repository` whose commit `commit` reaches, as `[id, ref]` pairs (an annotated tag's id is its tag
 * object's): the ones a target's `git tag -l` and `git describe` can name over the evaluated history. A tag on a commit
 * outside that history, or on a tree or a blob, is left out, so no tag names an object the withheld repository lacks.
 */
function tagsWithin(repository, commit) {
  const listed = runGit(
    ['--no-replace-objects', '-C', repository, 'for-each-ref', '--merged', commit, '--format=%(objectname) %(refname)', 'refs/tags'],
    { timeoutMs: GIT_HISTORY_TIMEOUT_MS, env: NO_LAZY_FETCH },
  );
  if (!listed.ok) return { failure: listed.detail };
  const tags = [];
  for (const line of listed.stdout.split('\n')) {
    const match = /^([0-9a-f]+) (refs\/tags\/.+)$/.exec(line);
    if (match !== null) tags.push([match[1], match[2]]);
  }
  return { tags };
}

/** Hard-links every file under `from` to the same place under `to`, which is made as needed. */
function linkTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.isDirectory()) linkTree(path.join(from, entry.name), path.join(to, entry.name));
    else if (!fs.existsSync(path.join(to, entry.name))) fs.linkSync(path.join(from, entry.name), path.join(to, entry.name));
  }
}

/**
 * The sparse-checkout settings a worktree reads, as `[key, value]` pairs for a private repository to carry, or null when
 * the worktree is not sparse (Story 1.85). A worktree made inside a sparse project inherits its cone: `core.sparseCheckout`
 * (and `core.sparseCheckoutCone`, and `index.sparse` when the project keeps a sparse index) sit in the project's
 * configuration or the worktree's own, and the patterns in the worktree's metadata directory. The question is asked of the
 * worktree, so a git that did not copy the cone into it, and a project that is not sparse, both give null and leave the index
 * as `read-tree` builds it; `index.sparse` is carried only when the worktree reads it as true, and a git without sparse index
 * support ignores the key.
 */
function sparseSettingsOf(workspace) {
  const ask = (key) =>
    runGit(['--git-dir', workspace.metadata, '--work-tree', workspace.top, 'config', '--type=bool', '--get', key], {
      timeoutMs: GIT_HISTORY_TIMEOUT_MS,
    });
  const enabled = ask('core.sparseCheckout');
  if (!enabled.ok || enabled.stdout.trim() !== 'true') return null;
  const settings = [['core.sparseCheckout', 'true']];
  const cone = ask('core.sparseCheckoutCone');
  if (cone.ok) settings.push(['core.sparseCheckoutCone', cone.stdout.trim()]);
  const index = ask('index.sparse');
  if (index.ok && index.stdout.trim() === 'true') settings.push(['index.sparse', 'true']);
  return settings;
}

/**
 * Builds the repository a confined target's git sees in place of the
 * adopter's (Story 1.57, AD-7, AD-8), and points the worktree at it.
 *
 * It is a bare store under the workspace directory, outside the checkout, so
 * the target cannot write it. It holds every commit, tree and blob reachable
 * from the workspace's commit except what is reachable only through the
 * withheld paths' subtrees at some commit. Each such subtree is replaced by
 * the empty tree through a `refs/replace/<tree>` entry, so no id changes and
 * git never reads an object of the folder; `git --no-replace-objects` asks for
 * the folder's tree itself, which the store does not hold. The worktree's
 * metadata `commondir` names the store, and the index is rebuilt from the
 * replaced tree, so `git status` and `git diff` see the folder as an empty
 * tree and list no deletions. Nothing is written into the adopter's
 * repository: its objects are only read, and the worktree's metadata
 * directory is the one the worktree add already made.
 *
 * The tags of the repository whose commits the history reaches are carried with
 * their annotations, and no branch, remote, URL, credential or hook is. A
 * partial clone's store holds the objects the project holds on disk: nothing
 * fetches from the promisor remote, and an object the project lacks is absent
 * from the store as it is from the project.
 *
 * A second workspace for the same commit, paths and tags links the first one's
 * objects when that store still exists, and packs the history only when it
 * does not.
 *
 * @param {object} workspace a git worktree whose checkout `git worktree add` just made
 * @param {string[]} withheld real paths inside the repository whose committed content is withheld
 * @throws {WorkspaceRefusal}
 */
function buildWithheldRepository(workspace, withheld) {
  const store = path.join(workspace.directory, WITHHELD_REPOSITORY);
  const hooks = path.join(workspace.directory, 'no-hooks');
  const top = realPathLoosely(workspace.repository);
  const refuse = (detail) =>
    new WorkspaceRefusal(
      `could not withhold the committed evaluation folder from the ${workspace.label} workspace's git history: ${detail}`,
    );
  const must = (result) => {
    if (!result.ok) throw refuse(result.detail);
    return result.stdout;
  };
  if (workspace.metadata === null) throw refuse('the worktree has no metadata directory in the repository');
  const relatives = withheld.map((entry) => posix(path.relative(top, entry)));
  const facts = adopterFacts(workspace.repository, workspace.gitDirectory);
  const inStore = (args, options) => runGit([`--git-dir=${store}`, '-c', `core.hooksPath=${hooks}`, ...args], options);
  // A partial clone does not hold every object the walk reaches: what is missing is left out, as the project leaves it out.
  // `pack-objects --revs` stops at a tree the project does not hold, so a partial clone's objects are walked by `rev-list`
  // and piped into `pack-objects`, which `git-lines.js` runs without holding them.
  const partial = facts.partial !== null;
  // The adopter's own graph: its replace refs, if it has any, are not applied to what the store is built from.
  const readAdopter = ['--no-replace-objects', '-C', workspace.repository, '-c', `core.hooksPath=${hooks}`];
  // The store packs on its own device: the adopter's object store is only read.
  // `pack-objects` run there with a file as its output writes its temporary pack into the adopter's `objects/pack` and renames it
  // into the store, which fails across filesystems and writes into the adopter's repository for a moment.
  // So it prints the pack (`--stdout`) into the store's `index-pack`.
  const intoStore = [`--git-dir=${store}`, 'index-pack', '--stdin'];
  const packInto = (revs) => {
    const packed = runGitLines(
      {
        mode: 'pack',
        stages: partial
          ? [
              [...readAdopter, 'rev-list', '--objects', '--missing=allow-any', '--stdin'],
              [...readAdopter, 'pack-objects', '--quiet', '--stdout'],
              intoStore,
            ]
          : [[...readAdopter, 'pack-objects', '--quiet', '--revs', '--stdout'], intoStore],
        revs,
      },
      { env: NO_LAZY_FETCH },
    );
    if (!packed.ok) throw refuse(packed.detail);
  };
  const tagged = tagsWithin(workspace.repository, workspace.commit);
  if (tagged.failure !== undefined) throw refuse(tagged.failure);
  const key = JSON.stringify([
    workspace.repository,
    workspace.commit,
    [...relatives].sort(),
    tagged.tags.map(([id, ref]) => `${id} ${ref}`).sort(),
  ]);
  // (1) The folder's tree at each commit of the history, when no store for this commit and these paths exists to link
  // from. A path that is tracked at the commit and yields no tree there is spelled differently from the repository's
  // (case, Unicode form), and nothing would be replaced.
  const folderTrees = new Set();
  const findFolderTrees = () => {
    for (const relative of relatives) {
      const found = treesAtPath(workspace.repository, workspace.commit, relative);
      if (found.failure !== undefined) throw refuse(found.failure);
      const tracked = runGit(['--no-replace-objects', '-C', workspace.repository, 'ls-tree', workspace.commit, '--', relative], {
        env: NO_LAZY_FETCH,
      });
      if (!tracked.ok) throw refuse(tracked.detail);
      for (const line of tracked.stdout.split('\n')) {
        const match = /^\d+ tree ([0-9a-f]+)\t/.exec(line);
        if (match !== null && !found.trees.includes(match[1])) {
          throw refuse(`${relative} is tracked at commit ${workspace.commit} but no tree was found there under that spelling`);
        }
      }
      for (const tree of found.trees) folderTrees.add(tree);
    }
  };
  // (2) A store in the adopter's object and ref formats. `core.bare=false` lets git treat it as the common directory of a
  // worktree, and the local settings git reads the tree by are appended to its configuration in one write.
  const initStore = () => {
    must(
      runGit([
        '-c',
        `core.hooksPath=${hooks}`,
        'init',
        '--quiet',
        '--bare',
        '--template=',
        ...(facts.objectFormat === null ? [] : [`--object-format=${facts.objectFormat}`]),
        ...(facts.refFormat === null ? [] : [`--ref-format=${facts.refFormat}`]),
        store,
      ]),
    );
    const settings = ['bare = false', ...facts.carried.map(([name, value]) => `${name.slice('core.'.length)} = ${value}`)];
    fs.appendFileSync(path.join(store, 'config'), `[core]\n${settings.map((line) => `\t${line}\n`).join('')}`);
    for (const [name, value] of facts.filters) must(inStore(['config', name, value]));
    fs.mkdirSync(path.join(store, 'info'), { recursive: true });
    for (const name of ['exclude', 'attributes']) {
      const source = path.join(workspace.gitDirectory, 'info', name);
      if (fs.existsSync(source)) fs.copyFileSync(source, path.join(store, 'info', name));
    }
    // The same history boundary as the adopter's, before anything walks the store.
    const shallow = path.join(workspace.gitDirectory, 'shallow');
    if (fs.existsSync(shallow)) fs.copyFileSync(shallow, path.join(store, 'shallow'));
  };
  initStore();
  const cached = BUILT_REPOSITORIES.get(key);
  let linked = false;
  // An unknown ref format is a git before 2.45, which has only the `files` format, so its stores link too.
  if (cached !== undefined && facts.refFormat !== 'reftable' && fs.existsSync(path.join(cached, 'objects'))) {
    try {
      linkTree(path.join(cached, 'objects'), path.join(store, 'objects'));
      const replacements = path.join(cached, 'refs', 'replace');
      if (fs.existsSync(replacements)) fs.cpSync(replacements, path.join(store, 'refs', 'replace'), { recursive: true });
      linked = true;
    } catch {
      // The store it came from is gone or on another volume: this one is built in full.
      fs.rmSync(store, { recursive: true, force: true });
      initStore();
    }
  }
  if (!linked) {
    findFolderTrees();
    // (3) Everything reachable from the commit and the tags (the tag objects, which name commits the history holds) except
    // what only the folder's trees reach.
    packInto([workspace.commit, ...tagged.tags.map(([id]) => id), ...[...folderTrees].map((tree) => `^${tree}`)]);
    // (4) The empty tree, and one replacement per folder tree (a folder tree that is the empty tree replaces itself).
    const empty = must(inStore(['hash-object', '-t', 'tree', '-w', '--stdin'], { input: '' })).trim();
    folderTrees.delete(empty);
    if (folderTrees.size > 0) {
      must(
        inStore(['update-ref', '--stdin'], {
          input: `${[...folderTrees].map((tree) => `update refs/replace/${tree} ${empty}`).join('\n')}\n`,
        }),
      );
    }
    // (5) What the walk still misses, other than the folder's trees, is content the folder shares with the rest of the
    // tree (a blob, or a subtree, that sits in both): the pack above left it out, and it comes from the adopter's
    // repository with everything under it. The walk then runs again, and a pass that misses what the last one missed
    // has made no progress. The walk's output is read as a stream (a history of millions of objects prints more than any
    // buffer holds) and only the missing ids are kept. A partial clone's store also misses every object the project does
    // not hold, and those are not restored, so its walk keeps only the objects the folder's trees reach (the only ones the
    // pack can have left out of the store that the project holds).
    let shared = null;
    if (partial) {
      if (folderTrees.size === 0) shared = [];
      else {
        const reachedByFolder = runGitLines(
          {
            mode: 'reached',
            git: [...readAdopter, 'rev-list', '--objects', '--no-object-names', '--missing=print', '--stdin'],
            revs: [...folderTrees],
          },
          { env: NO_LAZY_FETCH },
        );
        if (!reachedByFolder.ok) throw refuse(reachedByFolder.detail);
        shared = reachedByFolder.lines;
      }
    }
    let previous = null;
    for (;;) {
      const walked = runGitLines(
        {
          mode: 'missing',
          git: [
            `--git-dir=${store}`,
            '-c',
            `core.hooksPath=${hooks}`,
            'rev-list',
            '--objects',
            '--no-object-names',
            '--missing=print',
            workspace.commit,
          ],
          keep: shared,
        },
        { env: NO_LAZY_FETCH },
      );
      if (!walked.ok) throw refuse(walked.detail);
      const missing = walked.lines.filter((id) => !folderTrees.has(id)).sort();
      if (missing.length === 0) break;
      if (previous !== null && previous === missing.join('\n')) {
        throw refuse(`${missing.length} object(s) shared with the folder could not be restored from the repository`);
      }
      previous = missing.join('\n');
      packInto(missing);
    }
  }
  // (5b) The tags the history reaches: each names an object the pack holds or the linked objects carry.
  if (tagged.tags.length > 0) {
    must(inStore(['update-ref', '--stdin'], { input: `${tagged.tags.map(([id, ref]) => `update ${ref} ${id}`).join('\n')}\n` }));
  }
  if (!BUILT_REPOSITORIES.has(key) || !fs.existsSync(path.join(BUILT_REPOSITORIES.get(key), 'objects'))) BUILT_REPOSITORIES.set(key, store);
  // (6) The worktree reads the store, and its index matches the replaced tree. A worktree that is sparse (it inherited the
  // project's cone) is asked while its common directory is still the adopter's, since the settings that make it sparse are
  // the ones that repository and the worktree's own configuration give it.
  const sparse = sparseSettingsOf(workspace);
  // `git worktree add` copies the project worktree's `config.worktree` into the new metadata directory, with any remote, URL,
  // credential helper or hook the project set for its worktree. The private repository never reads it (it has no
  // `extensions.worktreeConfig`), and the target may read the metadata directory, so it is removed once its sparse settings are read.
  fs.rmSync(path.join(workspace.metadata, 'config.worktree'), { force: true });
  fs.writeFileSync(path.join(workspace.metadata, 'commondir'), `${store}\n`);
  const view = ['--git-dir', workspace.metadata, '--work-tree', workspace.top, '-c', `core.hooksPath=${hooks}`];
  must(runGit([...view, 'read-tree', 'HEAD'], { timeoutMs: GIT_HISTORY_TIMEOUT_MS }));
  if (sparse !== null) {
    // The patterns file stays the worktree's own (`info/sparse-checkout` in its metadata directory). `read-tree HEAD` sets no
    // skip-worktree bit, so every tracked file outside the cone would read as deleted; `read-tree -m -u` applies the patterns to
    // that index and touches no file, since a file outside the cone is already absent and one inside it is already there.
    for (const [name, value] of sparse) must(inStore(['config', name, value]));
    must(runGit([...view, 'read-tree', '-m', '-u', 'HEAD'], { timeoutMs: GIT_HISTORY_TIMEOUT_MS }));
  }
  // The index read-tree wrote carries no file stamps, so every `git status` would read every file, and the target cannot
  // write the index to keep the stamps. Best effort: an index left unrefreshed is still correct.
  runGit([...view, 'update-index', '-q', '--refresh'], { timeoutMs: GIT_HISTORY_TIMEOUT_MS });
  workspace.gitView = store;
}

/**
 * Makes the workspace a run happens in.
 *
 * A workspace made with a `basis` holds what the basis held when it was made:
 * a worktree of the basis's commit, or a copy of the basis's own tree, with
 * the basis's provisioned copies. So every workspace of one run evaluates the
 * same bytes, whatever changes in the project meanwhile.
 *
 * @param {object} options
 * @param {string} options.root `launch.root`, by its real path
 * @param {'git'|'copy'} options.kind `workspace.kind`
 * @param {string[]} [options.provision] `workspace.provision`
 * @param {string[]} [options.exclude] absolute paths inside the project a workspace leaves out (the evaluation folder)
 * @param {boolean} [options.fromWorkingTree] copy the working tree, uncommitted work included
 * @param {string} options.label a name for the temp directory (`pristine`, `mutated-M-001`)
 * @param {object} [options.basis] a workspace this one reproduces
 * @param {string} [options.commit] the full id of a commit to check out in place of `HEAD` (a historical
 *   probe's revisions); only on a worktree made with no basis
 * @param {boolean} [options.withholdHistory] a worktree's git sees a private repository (`buildWithheldRepository`) in
 *   which the committed content of every `exclude` path inside the repository is an empty tree, as a confined run needs
 * @returns {object} the workspace: `root` is where `launch.root` lies in it
 * @throws {WorkspaceRefusal}
 */
function createWorkspace({
  root,
  kind,
  provision = [],
  exclude = [],
  fromWorkingTree = false,
  label,
  basis = null,
  commit = null,
  ownership = null,
  withholdHistory = false,
}) {
  if (!isDirectory(root)) throw new WorkspaceRefusal(`launch.root ${root} is not a directory`);
  const repository = basis === null ? repositoryOf(root) : null;
  const worktree = basis === null ? kind === 'git' && !fromWorkingTree && repository !== null : basis.kind === 'git-worktree';
  if (basis === null && worktree && repository.commit === null) {
    throw new WorkspaceRefusal(
      `the git repository at ${repository.top} has no commit, so there is no commit to evaluate; commit the project or pass --from-working-tree`,
    );
  }
  let revision = null;
  if (commit !== null) {
    if (basis !== null || !worktree) {
      throw new WorkspaceRefusal(`the ${label} workspace names commit ${commit}, which only a worktree made with no basis can check out`);
    }
    if (withholdHistory) assertSkipsLazyFetch(repository.top, repository.gitDirectory);
    const tree = runGit(['-C', repository.top, 'rev-parse', '--verify', '--quiet', '--end-of-options', `${commit}^{tree}`], {
      env: withholdHistory ? NO_LAZY_FETCH : {},
    });
    if (!tree.ok) {
      const partial = withholdHistory ? adopterFacts(repository.top, repository.gitDirectory).partial : null;
      throw new WorkspaceRefusal(
        partial === null
          ? `the ${label} workspace names commit ${commit}, which the repository at ${repository.top} does not hold`
          : partialCheckoutRefusal(partial, commit),
      );
    }
    revision = { commit, tree: tree.stdout.trim() };
  }
  let temp;
  try {
    temp = fs.realpathSync(os.tmpdir());
    fs.readdirSync(temp);
  } catch (error) {
    throw new WorkspaceRefusal(`the temp directory ${os.tmpdir()} cannot be used: ${error.message}; point TMPDIR at an existing directory`);
  }
  const repositoryTop = basis === null ? (repository?.top ?? null) : basis.repository;
  // Inside launch.root, a copy would copy itself. Inside the repository, a
  // workspace would show in its own git status and the run would read its own
  // files as a change to the adopter's tree, unless the repository ignores
  // the temp directory, whose contents git status then never reports.
  if (!worktree && isInside(root, temp)) {
    throw new WorkspaceRefusal(
      `the temp directory ${temp} is inside launch.root ${root}, so the workspace would sit in the project it evaluates; point TMPDIR outside the evaluated project`,
    );
  }
  if (repositoryTop !== null && isInside(repositoryTop, temp) && !runGit(['-C', repositoryTop, 'check-ignore', '-q', temp]).ok) {
    throw new WorkspaceRefusal(
      `the temp directory ${temp} is inside the repository ${repositoryTop} and not ignored by it, so the workspace would read as a change to the project it evaluates; point TMPDIR outside the evaluated project or at a directory the repository ignores`,
    );
  }
  const directory = path.join(temp, `tea-evaluate-${label}-${randomUUID()}`);
  const workspace = {
    label,
    kind: worktree ? 'git-worktree' : 'copy',
    directory,
    top: path.join(directory, worktree ? 'worktree' : 'target'),
    root: null,
    repository: repositoryTop,
    gitDirectory: basis === null ? (repository?.gitDirectory ?? null) : basis.gitDirectory,
    metadata: null,
    gitView: null,
    commit: worktree ? (revision?.commit ?? basis?.commit ?? repository.commit) : null,
    tree: worktree ? (revision?.tree ?? basis?.tree ?? repository.tree) : null,
    treeDigest: null,
    // A copy made with no basis keeps what it held when it was made, which a reproduction copies.
    snapshot: null,
    dirty: basis?.dirty ?? fromWorkingTree,
    provisioned: [],
    provisionedDigests: {},
  };
  try {
    if (ownership !== null) {
      workspace.journal = writeWorkspaceJournal(workspace, ownership, temp);
    }
    try {
      fs.mkdirSync(directory, { mode: 0o700 });
      workspace.created = true;
    } catch (error) {
      throw new WorkspaceRefusal(`could not create a workspace under the temp directory ${temp}: ${error.message}`);
    }
    if (workspace.journal) {
      const marker = path.join(directory, OWNER_MARKER);
      fs.writeFileSync(marker, `${JSON.stringify(workspace.journal.entry)}\n`, { flag: 'wx', mode: 0o600 });
      fs.linkSync(marker, ownerSidecarOf(workspace));
    }
    const excluded = exclude.filter((entry) => entry !== root && isInside(root, entry));
    if (worktree) {
      const hooks = path.join(directory, 'no-hooks');
      fs.mkdirSync(hooks);
      // A confined run fetches nothing from a promisor remote: the checkout of a revision whose objects a partial clone
      // lacks fails, and says which revision.
      if (withholdHistory) assertSkipsLazyFetch(workspace.repository, workspace.gitDirectory);
      const added = runGit(
        [
          '-C',
          workspace.repository,
          '-c',
          `core.hooksPath=${hooks}`,
          '-c',
          'advice.detachedHead=false',
          'worktree',
          'add',
          '--detach',
          '--quiet',
          workspace.top,
          workspace.commit,
        ],
        { timeoutMs: GIT_CHECKOUT_TIMEOUT_MS, supervised: true, env: withholdHistory ? NO_LAZY_FETCH : {} },
      );
      workspace.metadata = worktreeMetadataOf(workspace);
      if (!added.ok) {
        const partial = withholdHistory ? adopterFacts(workspace.repository, workspace.gitDirectory).partial : null;
        throw new WorkspaceRefusal(
          partial === null
            ? `git worktree add could not check out ${workspace.commit}: ${added.detail}`
            : partialCheckoutRefusal(partial, workspace.commit, added.detail),
        );
      }
      workspace.root = path.join(workspace.top, path.relative(workspace.repository, root));
      const submodules = gitlinksUnder(workspace, root);
      if (submodules.length > 0) {
        throw new WorkspaceRefusal(
          `launch.root holds git submodule(s) ${submodules.join(', ')} at commit ${workspace.commit}, which a worktree checks out empty, so the run would evaluate a project missing their files; evaluate the submodule's own repository, or pass --from-working-tree to copy the checked-out tree`,
          { atRevision: true },
        );
      }
      if (!isDirectory(workspace.root)) {
        throw new WorkspaceRefusal(
          `launch.root ${posix(path.relative(workspace.repository, root)) || '.'} is not tracked at commit ${workspace.commit}, so the worktree does not hold it; commit it or pass --from-working-tree`,
          { atRevision: true },
        );
      }
      // The paths inside the repository, the evaluation folder outside `launch.root` included, whose committed content is
      // withheld: git sees an empty tree there, so their files leave the checkout too.
      const repositoryReal = realPathLoosely(workspace.repository);
      const withheld = withholdHistory
        ? exclude.map(realPathLoosely).filter((entry) => entry !== repositoryReal && isInside(repositoryReal, entry))
        : [];
      if (withholdHistory) buildWithheldRepository(workspace, withheld);
      for (const entry of excluded) fs.rmSync(path.join(workspace.root, path.relative(root, entry)), { recursive: true, force: true });
      for (const entry of withheld)
        fs.rmSync(path.join(workspace.top, path.relative(repositoryReal, entry)), { recursive: true, force: true });
    } else if (basis === null) {
      workspace.root = workspace.top;
      copyTreeInto(root, workspace.top, {
        skip: (source) => source === path.join(root, '.git') || excluded.includes(source),
      });
    } else {
      workspace.root = workspace.top;
      copyTreeInto(basis.snapshot, workspace.top);
    }
    for (const entry of provision) {
      const relative = entry.replace(/\/+$/, '').split('/');
      const inWorkspace = path.join(workspace.root, ...relative);
      const inSource = basis === null ? path.join(root, ...relative) : path.join(basis.root, ...relative);
      if (!worktree && basis !== null) {
        // A copy reproduces only the directories its basis provisioned when it was made, from the basis's read-only
        // copies; one a target made there afterwards is not provisioned. The snapshot holds no provisioned directory,
        // so one already here was planted in it, and a basis copy that is gone was moved by a target: either way the
        // reproduction would not hold what the basis held.
        if (!basis.provisioned.includes(inSource)) continue;
        if (fs.existsSync(inWorkspace) || !fs.existsSync(inSource)) {
          throw new WorkspaceRefusal(
            `the ${label} workspace cannot reproduce the provisioned directory ${entry}: ${fs.existsSync(inWorkspace) ? 'a copy of it was planted in the snapshot it copies' : 'the copy it reproduces no longer holds it'}`,
          );
        }
      }
      const linkIn = (candidate) => {
        try {
          return fs.lstatSync(candidate).isSymbolicLink();
        } catch {
          return false;
        }
      };
      // A link, in the project or in the checkout, would make its target read-only.
      if (linkIn(inSource) || linkIn(inWorkspace)) {
        throw new WorkspaceRefusal(
          `the provisioned directory ${entry} is a symbolic link; provision the directory it leads to, since making a link read-only would lock its target`,
        );
      }
      if (basis !== null && basis.provisioned.includes(inSource)) {
        const expected = basis.provisionedDigests[path.relative(basis.root, inSource)];
        if (expected === undefined || treeDigest(inSource) !== expected) {
          throw new WorkspaceRefusal(
            `the ${label} workspace cannot reproduce the provisioned directory ${entry}: the copy it reproduces changed after it was made`,
          );
        }
      }
      if (!fs.existsSync(inWorkspace)) {
        if (!fs.existsSync(inSource)) continue;
        fs.mkdirSync(path.dirname(inWorkspace), { recursive: true });
        copyTreeInto(inSource, inWorkspace, { root });
      }
      workspace.provisioned.push(inWorkspace);
    }
    containLinks({
      sourceTop: worktree ? workspace.repository : basis === null ? root : basis.root,
      copyTop: workspace.top,
      scan: workspace.root,
    });
    if (!worktree && basis === null) {
      // What the copy holds as it is made, its links contained and its provisioned directories left out, kept beside
      // it: a target run in the copy (a preflight leg whose operation writes a record, say) changes the copy, and a
      // workspace reproducing it copies this instead. Everything the snapshot holds is under the tree digest, so a
      // snapshot changed afterwards no longer digests to the copy's, which the reproduction refuses.
      workspace.snapshot = path.join(directory, 'snapshot');
      copyTreeInto(workspace.top, workspace.snapshot, { skip: (source) => workspace.provisioned.includes(source) });
    }
    for (const provisioned of workspace.provisioned) makeReadOnly(provisioned);
    for (const provisioned of workspace.provisioned) {
      workspace.provisionedDigests[path.relative(workspace.root, provisioned)] = treeDigest(provisioned);
    }
    if (!worktree) {
      workspace.treeDigest = treeDigest(workspace.root, { exclude: workspace.provisioned });
      if (basis !== null && workspace.treeDigest !== basis.treeDigest) {
        throw new WorkspaceRefusal(
          `the ${label} workspace digests to ${workspace.treeDigest}, not the ${basis.treeDigest} of the workspace it reproduces`,
        );
      }
    }
    return workspace;
  } catch (error) {
    try {
      if (workspace.created) removeWorkspace(workspace);
      else retireWorkspaceJournal(workspace);
    } catch {
      // The refusal below is the outcome; a workspace left behind is in the temp directory.
    }
    if (error instanceof WorkspaceRefusal) throw error;
    throw new WorkspaceRefusal(`the ${label} workspace could not be made: ${error.message}`);
  }
}

/** The submodules (gitlinks, mode 160000) the evaluated commit holds under `launch.root`, as repository paths. */
function gitlinksUnder(workspace, root) {
  const scope = posix(path.relative(workspace.repository, root)) || '.';
  const listed = runGit(['-C', workspace.repository, 'ls-tree', '-r', '-z', workspace.commit, '--', scope]);
  if (!listed.ok) throw new WorkspaceRefusal(`could not list the tree of commit ${workspace.commit}: ${listed.detail}`);
  return listed.stdout
    .split('\u0000')
    .filter((record) => record.startsWith('160000 '))
    .map((record) => record.slice(record.indexOf('\t') + 1));
}

/**
 * The directory under the repository's common git directory that records a
 * worktree at `workspace.top`, found by its `gitdir` file, or null. Read from
 * the repository, so an entry `git worktree add` wrote before failing is
 * found too.
 */
function worktreeMetadataOf(workspace, { requireReadable = false } = {}) {
  if (workspace.gitDirectory === null) return null;
  const worktrees = path.join(workspace.gitDirectory, 'worktrees');
  let names;
  try {
    names = fs.readdirSync(worktrees);
  } catch (error) {
    if (requireReadable && error.code !== 'ENOENT')
      throw new WorkspaceRefusal(`cannot inspect Git worktree metadata ${worktrees}: ${error.message}`);
    return null;
  }
  const expected = path.join(workspace.top, '.git');
  for (const name of names) {
    try {
      const pointer = fs.readFileSync(path.join(worktrees, name, 'gitdir'), 'utf8').trim();
      if (pointer === expected || realPathLoosely(pointer) === realPathLoosely(expected)) return path.join(worktrees, name);
    } catch (error) {
      if (requireReadable && error.code !== 'ENOENT')
        throw new WorkspaceRefusal(`cannot inspect Git worktree metadata ${path.join(worktrees, name)}: ${error.message}`);
      // An entry with no gitdir file is not this worktree's.
    }
  }
  return null;
}

/**
 * What a confined target must not read of the adopter's git, and what of it
 * it may: the repository's git directory, withheld from the target, and the
 * worktree's own metadata directory inside it, which the target's `.git` file
 * names, with the private repository the worktree reads (readable) and the
 * object directories the git directory borrows from (`alternates`, withheld
 * as it is). `null` for a workspace in no repository.
 */
function gitAccessOf(workspace) {
  if (workspace.gitDirectory === null || workspace.gitDirectory === undefined) return null;
  return {
    directory: workspace.gitDirectory,
    metadata: workspace.metadata ?? null,
    view: workspace.gitView ?? null,
    alternates: alternatesOf(workspace.gitDirectory),
  };
}

/**
 * Removes a workspace: its files, and a worktree's entry in the adopter's
 * repository, so `git worktree list` no longer names it. Safe to call twice
 * and from a signal handler; throws when something could not be removed.
 */
function removeWorkspace(workspace) {
  unlockDirectories(workspace.directory);
  // A target may have swapped the worktree for a link (to the adopter's own
  // tree, say); git is never asked to remove a worktree at a path that is a link.
  let topIsLink = false;
  try {
    topIsLink = fs.lstatSync(workspace.top).isSymbolicLink();
  } catch {
    // Gone already.
  }
  if (workspace.kind === 'git-worktree' && workspace.repository !== null && !topIsLink && fs.existsSync(path.join(workspace.top, '.git'))) {
    const removed = runGit(['-C', workspace.repository, 'worktree', 'remove', '--force', '--force', workspace.top], {
      supervised: true,
    });
    if (!removed.ok) throw new WorkspaceRefusal(`could not remove Git worktree ${workspace.top}: ${removed.detail}`);
  }
  fs.rmSync(workspace.directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  const metadata = workspace.metadata ?? (workspace.kind === 'git-worktree' ? worktreeMetadataOf(workspace) : null);
  if (metadata !== null && fs.existsSync(metadata)) fs.rmSync(metadata, { recursive: true, force: true });
  if (workspace.journal) fs.rmSync(ownerSidecarOf(workspace), { force: true });
  retireWorkspaceJournal(workspace);
}

/**
 * Removes every workspace `workspaces` holds when the process is interrupted,
 * since a signal ends the process before any `finally` runs: aborts the
 * in-flight leg (the adapter kills its runner's process group, and the
 * runner's supervisor, dying with it, closes the lifeline that stops the
 * agent's process group), lets the caller record the interruption and
 * retract what it must (`onSignal`), removes the workspaces, and raises the
 * same signal again with the default action, so the caller sees the process
 * end by that signal.
 *
 * @param {object[]} workspaces a live list: a workspace pushed later is removed too
 * @param {AbortController} controller
 * @param {object} [options]
 * @param {(signal: string) => void} [options.onSignal] runs first, with the signal's name; it must not throw
 * @returns {() => void} removes the handlers
 */
function cleanUpOnSignal(workspaces, controller, { onSignal = () => {} } = {}) {
  const signals = process.platform === 'win32' ? ['SIGINT', 'SIGTERM', 'SIGHUP'] : ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT'];
  const handlers = new Map();
  const release = () => {
    for (const [name, handler] of handlers) process.removeListener(name, handler);
  };
  for (const name of signals) {
    const handler = () => {
      release();
      controller.abort();
      onSignal(name);
      // A signal ends the process before its `exit` event, so the audit's log streams are ended here.
      killLiveStreams();
      for (const workspace of workspaces) {
        try {
          removeWorkspace(workspace);
        } catch {
          // The signal still ends the process; a workspace left behind is in the temp directory.
        }
      }
      process.kill(process.pid, name);
    };
    handlers.set(name, handler);
    process.on(name, handler);
  }
  return release;
}

// ---------------------------------------------------------------------------
// The live harness's per-leg staging and cache

/**
 * A temp directory holding a copy of each of `directories` (relative to
 * `from`) at the same relative path, links followed: the generic half of
 * staging a directory per leg.
 *
 * @param {object} options
 * @param {string} options.from
 * @param {string[]} [options.directories]
 * @param {string} [options.prefix] the temp directory's name prefix
 * @returns {{ root: string, cwd: string }}
 */
function stageDirectories({ from, directories = [], prefix = 'tea-evaluate-stage-' }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    for (const relative of directories) {
      fs.cpSync(path.join(from, relative), path.join(root, relative), { recursive: true, dereference: true });
    }
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
  return { root, cwd: root };
}

/** The cache key for one probe request: everything about it except which leg asked. */
function requestKey(request) {
  const { probeId, ...rest } = request;
  return digest([JSON.stringify(rest)])
    .replace('sha256:', '')
    .slice(0, 32);
}

async function readJsonFromDisk(file) {
  try {
    return { present: true, value: JSON.parse(await fs.promises.readFile(file, 'utf8')) };
  } catch (error) {
    if (error.code === 'ENOENT') return { present: false };
    throw error;
  }
}

async function writeTextToDisk(file, text) {
  await fs.promises.writeFile(file, text);
}

const SYSTEM_CLOCK = {
  nowMs: async () => Date.now(),
  nowIso: async () => new Date().toISOString(),
  elapsedMsSince: async (startedAt) => Date.now() - startedAt,
};

/**
 * A port that answers each leg from a cache keyed by its request, and runs a
 * leg with no cached answer live in a fresh workspace of its own.
 *
 * A cached leg is returned with this leg's own correlation identifiers written
 * back on, because a reducer indexes observations by `probeId` and the cached
 * one carries whichever leg happened to run first. The key is taken before
 * `augment` adds what the live request carries beyond the planned one (an
 * agent option, the host's environment), so credentials never reach a path.
 * Each live leg gets a workspace of its own, removed after the leg, since two
 * legs sharing one directory read each other's artifacts back.
 *
 * @param {object} options
 * @param {(request: object) => Promise<{port: object, workspace: {root: string}}>} options.makePort
 * @param {string} options.cacheDir
 * @param {(request: object) => object} [options.augment] the live request built from the planned one
 * @param {object} [options.recordFields] extra fields written into each cached observation after its key (an agent's name)
 * @param {boolean} [options.force] ignore what an earlier run cached and run each request live once
 * @param {Array<{spawns: number, hits: number, elapsedMs: number, legs: object[]}>} [options.counters]
 * @param {(event: object) => void} [options.log] `{ event: 'cached'|'running'|'wrote', ... }`
 * @param {(file: string) => Promise<{present: boolean, value?: unknown}>} [options.readJson]
 * @param {(file: string, text: string) => Promise<void>} [options.writeText]
 * @param {{nowMs: Function, nowIso: Function, elapsedMsSince: Function}} [options.clock]
 * @returns {{ probe: (request: object, signal?: AbortSignal) => Promise<object> }}
 */
function cachingPort({
  makePort,
  cacheDir,
  augment = (request) => request,
  recordFields = {},
  force = false,
  counters = [],
  log = () => {},
  readJson = readJsonFromDisk,
  writeText = writeTextToDisk,
  clock = SYSTEM_CLOCK,
}) {
  fs.mkdirSync(cacheDir, { recursive: true });
  // Under `force`, a request this port has already run is answered from what
  // it wrote: two legs sending one request share one observation, and a
  // second live run would overwrite the evidence the first leg was scored on.
  const written = new Set();
  return {
    async probe(request, signal) {
      const key = requestKey(request);
      const file = path.join(cacheDir, `${key}.json`);
      const cached = force && !written.has(key) ? { present: false } : await readJson(file);
      if (cached.present) {
        for (const counter of counters) counter.hits += 1;
        log({ event: 'cached', legId: request.probeId, key });
        // Narrowed like a live one: a cache written by an older build, or by a
        // port that answered in another member, is a shape no reader here can use.
        return cliObservation({
          ...cached.value.observation,
          probeId: request.probeId,
          interfaceId: request.interfaceId,
          operationId: request.operationId,
        });
      }
      const augmented = augment(request);
      log({ event: 'running', legId: request.probeId, key });
      const { port, workspace } = await makePort(augmented);
      const startedAt = await clock.nowMs();
      let observation;
      try {
        observation = cliObservation(await port.probe(augmented, signal));
      } finally {
        fs.rmSync(workspace.root, { recursive: true, force: true });
      }
      const elapsedMs = await clock.elapsedMsSince(startedAt);
      const leg = { key, legId: request.probeId, operationId: request.operationId, elapsedMs, exitCode: observation.exitCode };
      for (const counter of counters) {
        counter.spawns += 1;
        counter.elapsedMs += elapsedMs;
        counter.legs.push(leg);
      }
      const persisted = {
        ...augmented,
        channels: { ...augmented.channels, environment: Object.keys(augmented.channels?.environment ?? {}) },
      };
      await writeText(
        file,
        `${JSON.stringify({ key, ...recordFields, at: await clock.nowIso(), elapsedMs, request: persisted, observation }, null, 2)}\n`,
      );
      written.add(key);
      log({ event: 'wrote', legId: request.probeId, key, file, elapsedMs, exitCode: observation.exitCode });
      return observation;
    },
  };
}

/**
 * A port that answers only from `cachingPort`'s cache and refuses to spend a call.
 *
 * @param {object} options
 * @param {string} options.cacheDir
 * @param {Array<{hits: number}>} [options.counters]
 * @param {(file: string) => Promise<{present: boolean, value?: unknown}>} [options.readJson]
 * @param {string} [options.hint] what a miss tells the operator to do, appended to the error
 */
function cacheOnlyPort({ cacheDir, counters = [], readJson = readJsonFromDisk, hint = '' }) {
  return {
    async probe(request) {
      const key = requestKey(request);
      const cached = await readJson(path.join(cacheDir, `${key}.json`));
      if (!cached.present) {
        throw new Error(`leg ${request.probeId} (${key}) has no cached observation and this port answers from the cache alone${hint}`);
      }
      for (const counter of counters) counter.hits += 1;
      return { ...cached.value.observation, probeId: request.probeId, interfaceId: request.interfaceId, operationId: request.operationId };
    },
  };
}

module.exports = {
  WorkspaceRefusal,
  adopterTreeState,
  cacheOnlyPort,
  cachingPort,
  cleanUpOnSignal,
  containLinks,
  createWorkspace,
  gitAccessOf,
  isDirectory,
  isInside,
  journalDirectory,
  joinAsSpelled,
  makeReadOnly,
  makePrivateParent,
  makeScratchDirectory,
  heldPrivateRoot,
  privateRootBase,
  privateRootIn,
  privateRootName,
  realPathLoosely,
  releaseScratchDirectory,
  retirePrivateParentOwnership,
  removePrivateParentDirectory,
  removeScratchDirectory,
  removeWorkspace,
  reclaimDeadPrivateParents,
  reclaimDeadWorkspaces,
  repositoryOf,
  requestKey,
  runGit,
  stageDirectories,
  trackedTreeDigest,
  treeDigest,
};
