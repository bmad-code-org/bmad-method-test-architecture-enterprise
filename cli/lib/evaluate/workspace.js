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
 * and its objects. `adopterTreeState` reads those as well as the working tree,
 * so a run can tell when a target wrote any of them.
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
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const { digest } = require('./digest');
const { cliObservation } = require('./registry');

/** How long one `git worktree add` may take: a checkout of a large repository is slow, and a hang still ends. */
const GIT_CHECKOUT_TIMEOUT_MS = 10 * 60_000;

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

/**
 * Gives the owner full access to `directory` and every directory under it, so
 * it can be removed: each directory is opened up before it is read, and one
 * that still cannot be read is skipped, so a single unreadable directory a leg
 * left behind cannot keep the rest locked.
 */
function unlockDirectories(directory) {
  try {
    fs.chmodSync(directory, (fs.lstatSync(directory).mode & 0o7777) | 0o700);
  } catch {
    return;
  }
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) unlockDirectories(path.join(directory, entry.name));
  }
}

/**
 * A private temporary directory registered in `scratch`, the run's list of
 * directories it removes however it ends (`preflight.js` `pipeline`), an
 * interrupting signal included.
 *
 * @param {string[]} scratch
 * @param {string} prefix the directory's name prefix
 * @returns {string}
 */
function makeScratchDirectory(scratch, prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
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
  const parts = [];
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
 *
 * @returns {{ok: true, stdout: string}|{ok: false, status?: number, detail: string}}
 */
function runGit(args, { timeoutMs = GIT_QUESTION_TIMEOUT_MS } = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  const result = spawnSync('git', args, { encoding: 'utf8', env, timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: GIT_OUTPUT_BYTES });
  if (result.error) return { ok: false, detail: `git ${args.join(' ')} could not run: ${result.error.code ?? result.error.message}` };
  if (result.signal !== null) return { ok: false, detail: `git ${args.join(' ')} was killed by ${result.signal}` };
  if (result.status !== 0) {
    return { ok: false, status: result.status, detail: `git ${args.join(' ')} exited ${result.status}: ${String(result.stderr).trim()}` };
  }
  return { ok: true, stdout: result.stdout };
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
 * the adopter's behalf.
 */
function sharedStateDigest(gitDirectory) {
  let entries;
  try {
    entries = fs.readdirSync(gitDirectory, { withFileTypes: true });
  } catch (error) {
    throw new WorkspaceRefusal(`could not read the git directory ${gitDirectory}: ${error.message}`);
  }
  const exclude = entries
    .filter((entry) => GIT_BOOKKEEPING.has(entry.name) || entry.name.endsWith('.lock'))
    .map((entry) => path.join(gitDirectory, entry.name));
  return treeDigest(gitDirectory, { exclude });
}

/**
 * A reading of the adopter's project that compares equal to an earlier one
 * only when nothing a run could have written changed between them (AD-8).
 *
 * Inside a git repository: `git status` (tracked and untracked paths), a
 * digest over the content of every path it names (one already modified
 * included), every ref (branches, tags, the stash), and the repository's
 * common git directory without its bookkeeping (`sharedStateDigest`:
 * configuration, hooks, `info/`, `description`, refs), since a detached
 * worktree shares all of it with the repository it came from. `--no-optional-locks` keeps
 * `git status` from rewriting the index. Gitignored paths are not read.
 * Outside a repository: the tree digest of `directory`, the paths in
 * `exclude` left out.
 *
 * @param {string} directory `launch.root`
 * @param {object} [options]
 * @param {string[]} [options.exclude] absolute paths a run itself writes (the evaluation's `runs/`)
 * @returns {object}
 * @throws {WorkspaceRefusal} when git cannot answer
 */
function adopterTreeState(directory, { exclude = [] } = {}) {
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
  const status = runGit(['--no-optional-locks', '-C', repository.top, 'status', '--porcelain=v1', '-z', '--untracked-files=all']);
  if (!status.ok) failed(status);
  const refs = runGit(['-C', repository.top, 'for-each-ref', '--format=%(refname) %(objectname)']);
  if (!refs.ok) failed(refs);
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
  return {
    repository: repository.top,
    status: status.stdout,
    changes: digest(parts),
    refs: refs.stdout,
    shared: sharedStateDigest(repository.gitDirectory),
  };
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
 * @returns {object} the workspace: `root` is where `launch.root` lies in it
 * @throws {WorkspaceRefusal}
 */
function createWorkspace({ root, kind, provision = [], exclude = [], fromWorkingTree = false, label, basis = null, commit = null }) {
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
    const tree = runGit(['-C', repository.top, 'rev-parse', '--verify', '--quiet', '--end-of-options', `${commit}^{tree}`]);
    if (!tree.ok)
      throw new WorkspaceRefusal(`the ${label} workspace names commit ${commit}, which the repository at ${repository.top} does not hold`);
    revision = { commit, tree: tree.stdout.trim() };
  }
  let temp;
  try {
    temp = fs.realpathSync(os.tmpdir());
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
  let directory;
  try {
    directory = fs.mkdtempSync(path.join(temp, `tea-evaluate-${label}-`));
  } catch (error) {
    throw new WorkspaceRefusal(`could not create a workspace under the temp directory ${temp}: ${error.message}`);
  }
  const workspace = {
    label,
    kind: worktree ? 'git-worktree' : 'copy',
    directory,
    top: path.join(directory, worktree ? 'worktree' : 'target'),
    root: null,
    repository: repositoryTop,
    gitDirectory: basis === null ? (repository?.gitDirectory ?? null) : basis.gitDirectory,
    metadata: null,
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
    const excluded = exclude.filter((entry) => entry !== root && isInside(root, entry));
    if (worktree) {
      const hooks = path.join(directory, 'no-hooks');
      fs.mkdirSync(hooks);
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
        { timeoutMs: GIT_CHECKOUT_TIMEOUT_MS },
      );
      workspace.metadata = worktreeMetadataOf(workspace);
      if (!added.ok) throw new WorkspaceRefusal(`git worktree add could not check out ${workspace.commit}: ${added.detail}`);
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
      for (const entry of excluded) fs.rmSync(path.join(workspace.root, path.relative(root, entry)), { recursive: true, force: true });
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
      removeWorkspace(workspace);
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
function worktreeMetadataOf(workspace) {
  if (workspace.gitDirectory === null) return null;
  const worktrees = path.join(workspace.gitDirectory, 'worktrees');
  let names;
  try {
    names = fs.readdirSync(worktrees);
  } catch {
    return null;
  }
  const expected = path.join(workspace.top, '.git');
  for (const name of names) {
    try {
      const pointer = fs.readFileSync(path.join(worktrees, name, 'gitdir'), 'utf8').trim();
      if (pointer === expected || realPathLoosely(pointer) === realPathLoosely(expected)) return path.join(worktrees, name);
    } catch {
      // An entry with no gitdir file is not this worktree's.
    }
  }
  return null;
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
  if (workspace.kind === 'git-worktree' && workspace.repository !== null && !topIsLink && fs.existsSync(workspace.top)) {
    runGit(['-C', workspace.repository, 'worktree', 'remove', '--force', '--force', workspace.top]);
  }
  fs.rmSync(workspace.directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  const metadata = workspace.metadata ?? (workspace.kind === 'git-worktree' ? worktreeMetadataOf(workspace) : null);
  if (metadata !== null && fs.existsSync(metadata)) fs.rmSync(metadata, { recursive: true, force: true });
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
  isDirectory,
  isInside,
  joinAsSpelled,
  makeReadOnly,
  makeScratchDirectory,
  realPathLoosely,
  releaseScratchDirectory,
  removeScratchDirectory,
  removeWorkspace,
  repositoryOf,
  requestKey,
  runGit,
  stageDirectories,
  trackedTreeDigest,
  treeDigest,
};
