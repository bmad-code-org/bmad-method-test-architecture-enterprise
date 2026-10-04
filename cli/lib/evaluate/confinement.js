/**
 * File-system confinement of every process a run starts (Story 1.31, AD-7).
 *
 * A target runs in a disposable workspace that leaves the evaluation folder
 * out, and that alone does not keep it from the folder: a worktree names the
 * adopter's git directory, beside which the evaluation folder sits, so a
 * target that follows it can read the contract and rewrite the evidence in
 * `runs/`, during its trial or from a process it leaves running after it
 * exits, and can read the contract from the committed history. This module
 * holds the one decision per platform that closes that:
 *
 *   mechanism    macOS Seatbelt (`/usr/bin/sandbox-exec` with a generated
 *                profile) or Linux Bubblewrap (`bwrap` on PATH, an unprivileged
 *                user namespace with a read-only view of `/`), each probed with
 *                a trivial process before the run starts anything, since a host
 *                can carry the executable and still refuse to confine (a
 *                hardened kernel that forbids unprivileged user namespaces).
 *                Nothing else: a platform with neither refuses the run (exit 12)
 *                unless `evaluation.json` opts out with `"confinement": false`,
 *                and an opted-out run records `opt-out` in `run.json`.
 *                Seatbelt runs the command in place; Bubblewrap forks it and
 *                exits `128 + n` for a signal `n`, so under Bubblewrap a target
 *                starts through `confinement-status.cjs`, which records the
 *                signal that ended it, and the call keeps eval-quality's
 *                negated signal number, as a crash or a kill reads unconfined.
 *   target       every process a target starts, those it leaves running after
 *                it exits included (Seatbelt's sandbox and Bubblewrap's mount
 *                namespace pass to every descendant and outlive the process
 *                that made them, a `setsid` child included), may write its
 *                workspace and the private directories the runtime hands it
 *                (the file a started HTTP server reports its port in, its temp
 *                and home directories) and nothing else, and can neither read nor write
 *                the evaluation folder (`contract.json`, `probes/`, `runs/`,
 *                `evaluator/`, everything under it), nor read or write the
 *                project's git directory, the worktree's own entry in it
 *                excepted (the workspace's git reads a private repository
 *                beside the checkout, `workspace.js`'s `buildWithheldRepository`,
 *                whose history holds the evaluation folder as an empty tree),
 *                nor read, write or connect to anything under the user's
 *                private root directory (`workspace.js` `makePrivateParent`),
 *                beneath which every run's private parent holds the evaluation
 *                layer's bridge configuration, admission token file and socket
 *                and its evaluator, judge and command-evaluator working
 *                directories (AD-21). A sandbox built for one run therefore also
 *                covers a parent another run makes later or concurrently.
 *                Reads elsewhere are left to the audit: node, git and a
 *                target's own toolchain read from the system.
 *   layer        every process of the evaluation layer (the command evaluator,
 *                the HTTP port, the judge, the sealed-brief agent) keeps the
 *                host's file system and cannot write the evaluation folder,
 *                the project's common git directory (its refs, configuration,
 *                hooks and `info/`), the hooks directory `core.hooksPath`
 *                names outside it (an absent one included: Seatbelt denies the
 *                path it will have, and Bubblewrap, which cannot bind an absent
 *                path, leaves it to the run's reading of whether it exists) or
 *                the checkout's own `.git` file when the checkout is a linked
 *                worktree or a submodule (the file sits outside the common
 *                directory), so none of them plants a hook, changes the
 *                configuration, moves a ref or points the checkout at another
 *                repository the adopter's next git command reads (Story 1.112);
 *                a project in no git repository has no such path. That denial
 *                is what guards the git directory for a confined run: the
 *                target's profile withholds it and the layer's denies it, so
 *                the run's comparison of the adopter's tree reads the working
 *                tree, the checkout's own `HEAD` and where the checkout's git
 *                commands read their repository from (the resolved git
 *                directory, the `.git` file's content, the hooks directory's
 *                presence), and digests no other part of the git directory.
 *   login        a registry entry that declares `"login": "claude"` (Story 1.113) gives its processes the logins the Claude Code CLI
 *                documents and nothing else of the user's home: the variable `CLAUDE_CODE_OAUTH_TOKEN` when the host sets it (a token
 *                from `claude setup-token`), and the credentials file `<CLAUDE_CONFIG_DIR or ~/.claude>/.credentials.json` when the
 *                host has one (Linux and Windows keep the login there), as a link in the private home that names the real file,
 *                which the target may read, cannot write and the audit does not list.
 *                A login held in the macOS Keychain has no
 *                grant: the keychain answers over a mach service, which a Seatbelt rule allows or denies as a whole and no rule
 *                scopes to one item, and the CLI finds the keychain through `HOME`, which a confined target holds privately.
 *                A host
 *                with neither source refuses the run (exit 12), naming the token route and the opt-out.
 *                Every observation and fault of every request kind has the variable's value and each string of the file replaced by `[redacted]`, since the home is shared by every target the sandbox starts.
 *                The values under the keys the adapter's `publicFields` names (the scopes, the subscription type, the rate-limit tier) stay as written, since they are no secret and a run that rewrote them would change an answer's own words, and any field the adapter does not name is scrubbed.
 *   network      every process the runtime starts for a Bubblewrap target
 *                (`--unshare-net`) runs in a network namespace of its own, a
 *                loopback and nothing else, so the host's abstract Unix sockets
 *                (a desktop session's D-Bus is one) do not exist for it: they
 *                live in the network namespace. A started HTTP server stays
 *                reachable through a bridge the runtime owns and no network
 *                path joins (Story 1.63): the call's status shim serves a Unix
 *                socket in a private directory of the call and the runtime
 *                listens, on the host, where the server's caller expects it
 *                (`confinement-status.cjs`, `confinement-relay.js`,
 *                `http-target.js`). A command target and a tool server have no
 *                bridge. Seatbelt has no abstract sockets and is unchanged.
 *                An entry that authorizes hosts (`egress`, Story 1.83) gives each
 *                of its calls one route out, the mirror of the bridge: the
 *                runtime serves an HTTP `CONNECT` proxy on a Unix socket in a
 *                private directory of the call, the shim listens on a loopback
 *                port and connects each connection to it, and the proxy
 *                tunnels a request only for a host and port the entry lists,
 *                decided by eval-quality's `evaluateTarget`
 *                (`confinement-egress.js`). An entry that authorizes no host
 *                reaches none.
 *   sockets      a path-based Unix socket is a file, and the read-only view of
 *                `/` does not stop a `connect()` to it, so under Bubblewrap each
 *                call lists the sockets the kernel reports bound on the host
 *                (`host-sockets.js`) and mounts an empty device file over each
 *                one outside the call's own grants (Story 1.82): a target cannot
 *                ask the Docker daemon or the system bus to run a job outside
 *                the sandbox. The list is ranked by who can create a socket
 *                (the well-known service sockets, root and the system accounts,
 *                the runtime's own user, then every other user in turns) and cut to the
 *                mounts the call's own command leaves room for; a call whose
 *                room cannot hold the first three ranks is refused (exit 12),
 *                and what the room cut is recorded in `run.json`
 *                (`hostSocketTruncation`). A socket bound after the call
 *                started stays reachable for that call, and Seatbelt hides none.
 *   layer        every other process the run starts to run adopter or agent
 *                code (a `command` evaluator, a sealed-brief agent and the
 *                bridge relay it starts, the rubric judge, the evaluation's HTTP
 *                port) runs with the evaluation folder read-only, so no process
 *                of the run can swap a file of the evaluation layer under
 *                `evaluator/` between the runtime's re-read of it and the
 *                evaluator's launch, or rewrite the evidence under `runs/`
 *                (the runtime's own writes there are the only ones). The
 *                layer keeps the host's network, since its HTTP port reaches
 *                the forwarded server over the host's loopback. The whole
 *                folder is held, and not `evaluator/` alone, since a folder
 *                with no `evaluator/` has nothing Bubblewrap could bind in
 *                its place and a process could make one.
 *   audit        what a trial's processes opened outside what the trial was
 *                granted (its workspace, its temp and home directories, the
 *                system paths its registry entry declares in `systemPaths`, the
 *                Node installation and the operating system's own directories)
 *                is reported by the mechanism itself, for every process the
 *                target starts whatever its language or environment, and lists
 *                as the isolation manifest's `observedMounts`, which
 *                eval-quality holds against the allowed mounts and records as
 *                an isolation violation (Story 1.60). Seatbelt reports each
 *                read its profile allows outside the grants (`with report`) and
 *                tags every file rule with a token of the sandbox (`with
 *                message`), and a `/usr/bin/log stream` child the runtime owns
 *                writes the kernel's reports of that token to a file beneath
 *                the run's private parent; Bubblewrap runs under `strace -f
 *                --seccomp-bpf`, started outside the namespace, whose trace
 *                file sits beneath the same parent. Neither file is reachable
 *                from the target, and no code runs in the target's address
 *                space. A host that cannot observe refuses the run (exit 12).
 *                The audit sees opens, directory listings, link reads and the
 *                writes the mechanism refuses; not metadata probes, not the
 *                execution of a binary, not an `io_uring` request, and, under
 *                Seatbelt, not a read made after the trial's last read of the
 *                log. The enforcement is the mechanism above; the audit
 *                reports.
 *
 * `TEA_EVALUATE_CONFINEMENT_PLATFORM` names the platform the mechanism is
 * chosen for, in place of the host's, so a case can stand in for a platform
 * without one; it can only take a mechanism away, never add one the host
 * lacks, since each mechanism's executable is looked for on this host.
 */

'use strict';

const crypto = require('node:crypto');
const { startEgress } = require('./confinement-egress');
const { signedStatus } = require('./confinement-status.cjs');
const { loadEngine } = require('./engine');
const { BUBBLEWRAP_ARGUMENT_LIMIT, isSocketFile, listHostSockets, socketBudget } = require('./host-sockets');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  TRIVIAL_PROCESS,
  assertProfileSafePath,
  executableOnPath,
  isInside,
  isProfileSafePath,
  probeTrivialProcess,
  stderrTail,
} = require('../isolation-primitives');
const {
  DARWIN_SYSTEM_ROOTS,
  EXACT_GRANTS,
  LOG_EXECUTABLE,
  REQUESTED_ROOTS,
  ReportStream,
  SYSTEM_ROOTS,
  auditToken,
  nodeInstallRoot,
  probeReportStream,
  probeTrace,
  readTrace,
  straceCommand,
  traceDecision,
} = require('./confinement-audit');

/** Each mechanism as a sentence names it. */
const MECHANISM_NAMES = Object.freeze({ seatbelt: 'macOS Seatbelt (sandbox-exec)', bubblewrap: 'Linux Bubblewrap (bwrap)' });

const SANDBOX_EXEC = '/usr/bin/sandbox-exec';
const PLATFORM_ENV = 'TEA_EVALUATE_CONFINEMENT_PLATFORM';

/**
 * The login sources of the agent CLIs a registry entry's `login` names (Story 1.113): the environment variable that carries a
 * long-lived token, the variable that moves the CLI's configuration directory, that directory's default under the user's home,
 * and the credentials file inside it.
 * `homeFile` is where the CLI looks for the file under the private home, which a link names
 * the real file at.
 * `publicFields` are the keys of that file whose values are no secret (the plan, the scopes, the rate-limit
 * tier), which a record keeps as written while it replaces every other string of the file, a field this list does not know included.
 */
const LOGIN_ADAPTERS = Object.freeze({
  claude: Object.freeze({
    name: 'Claude Code',
    variable: 'CLAUDE_CODE_OAUTH_TOKEN',
    directoryVariable: 'CLAUDE_CONFIG_DIR',
    defaultDirectory: '.claude',
    file: '.credentials.json',
    homeFile: path.join('.claude', '.credentials.json'),
    publicFields: Object.freeze(['scopes', 'subscriptionType', 'rateLimitTier']),
  }),
});
/**
 * The `log` executable the macOS audit streams the kernel's reports through, which a case replaces with a stub that drops
 * reports (Story 1.81). It names an absolute path, and the runtime trusts it as it trusts the `strace` on `PATH`.
 */
const LOG_ENV = 'TEA_EVALUATE_AUDIT_LOG';

/** What Bubblewrap starts in a target's place, so a signal that ends the target is not read as an exit code. */
const STATUS_SHIM = path.join(__dirname, 'confinement-status.cjs');

/** What most often keeps a present mechanism from confining, named in the probe's refusal. */
const PROBE_HINTS = Object.freeze({
  seatbelt:
    'sandbox-exec cannot apply a profile inside a Seatbelt sandbox that restricts anything (sandbox_apply: Operation not permitted), so a tea-evaluate started from a sandboxed shell, an agent tool say, is refused',
  bubblewrap:
    'Bubblewrap needs unprivileged user namespaces, which a container, a hardened kernel or an AppArmor restriction (kernel.apparmor_restrict_unprivileged_userns) can forbid',
});

/**
 * Device files a confined process may still write: the null and zero
 * devices a child's closed standard streams are, its terminal, its own
 * standard streams named by path, and the tracing helper the system's
 * dynamic loader opens.
 */
const SEATBELT_DEVICE_WRITES = [
  '(literal "/dev/null")',
  '(literal "/dev/zero")',
  '(literal "/dev/tty")',
  '(literal "/dev/stdout")',
  '(literal "/dev/stderr")',
  '(literal "/dev/dtracehelper")',
  '(subpath "/dev/fd")',
];

/** Thrown for a path no profile or argument vector can carry, or a confinement asked of a port without a workspace. */
class ConfinementError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfinementError';
  }
}

/** A path as spelled and as the system resolves it, since `/var` and `/tmp` are links on macOS. */
function spellings(candidate) {
  const resolved = path.resolve(candidate);
  let real = resolved;
  try {
    real = fs.realpathSync.native(resolved);
  } catch {
    // A path made after the profile is built keeps its spelling.
  }
  return [...new Set([resolved, real])];
}

/** The refusal of a path no Seatbelt profile or Bubblewrap argument can carry (`assertProfileSafePath` in `isolation-primitives.js` decides which). */
function refuseUnsafePath(candidate) {
  return new ConfinementError(`the path ${JSON.stringify(candidate)} cannot be carried into a confinement profile`);
}

/**
 * The project's common git directory (its refs, configuration, hooks and `info/`, which every worktree of the repository
 * shares) by its real path, or null when `root` is in no git repository.
 */
function commonGitDirectory(root) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  try {
    const answer = execFileSync('git', ['-C', root, 'rev-parse', '--git-common-dir'], {
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 30_000,
      killSignal: 'SIGKILL',
    }).trim();
    return answer === '' ? null : fs.realpathSync.native(path.resolve(root, answer));
  } catch {
    return null;
  }
}

/**
 * A path by the real path of its nearest existing ancestor plus the components below it, so a path that does not exist yet
 * resolves to the spelling it will have once something creates it.
 */
function realPathOfNearestAncestor(candidate) {
  const absent = [];
  let current = candidate;
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(current), ...absent.toReversed());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return candidate;
      absent.push(path.basename(current));
      current = parent;
    }
  }
}

/**
 * The directory git runs the project's hooks from when it lies outside the common git directory (`core.hooksPath` names it;
 * this repository's own is `.husky/_`), by its real path, or null when hooks run from the git directory or `core.hooksPath` is
 * unset. A directory that does not exist yet (husky's `.husky/_` before `npm install`, a shared path configured and never
 * created) resolves to the real path of its nearest existing ancestor plus the components below it, since a layer process could
 * create it and plant a hook the adopter's next commit runs. A path that exists as anything but a directory is null.
 */
function hooksDirectory(root, gitDirectory) {
  if (gitDirectory === null || gitDirectory === undefined) return null;
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  try {
    const answer = execFileSync('git', ['-C', root, 'rev-parse', '--git-path', 'hooks'], {
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 30_000,
      killSignal: 'SIGKILL',
    }).trim();
    if (answer === '') return null;
    const resolved = realPathOfNearestAncestor(path.resolve(root, answer));
    if (isInside(gitDirectory, resolved)) return null;
    const stats = fs.statSync(resolved, { throwIfNoEntry: false });
    return stats === undefined || stats.isDirectory() ? resolved : null;
  } catch {
    return null;
  }
}

/**
 * The project checkout's `.git` file by its real path when the checkout is a linked worktree or a submodule (its `.git` is a
 * file that names the git directory), or null when `.git` is a directory or `root` is in no git repository. The file sits
 * outside the common git directory, so the denial of that directory does not cover it, and a layer process that rewrote it
 * would point the adopter's next git command at a copy it controls.
 */
function gitFileOf(root) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  try {
    const top = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 30_000,
      killSignal: 'SIGKILL',
    }).trim();
    if (top === '') return null;
    const file = path.join(fs.realpathSync.native(top), '.git');
    return fs.lstatSync(file).isFile() ? file : null;
  } catch {
    return null;
  }
}

/**
 * The profile a Seatbelt process of the evaluation layer runs under: everything allowed, and no write under the evaluation
 * folder, the project's common git directory or the hooks directory `core.hooksPath` names outside it (a `subpath` matches a
 * path that does not exist yet), or to the checkout's `.git` file, so a layer process cannot plant a hook, change the
 * configuration, move a ref or redirect the checkout to another git directory.
 */
function seatbeltLayerProfile(evaluationFolder, gitDirectory = null, hooksDirectoryPath = null, gitFile = null) {
  const present = (entries) => entries.filter((entry) => entry !== null && entry !== undefined);
  const denied = [...new Set(present([evaluationFolder, gitDirectory, hooksDirectoryPath]).flatMap(spellings))].map(
    (entry) => `(subpath "${assertProfileSafePath(entry, refuseUnsafePath)}")`,
  );
  const files = [...new Set(present([gitFile]).flatMap(spellings))].map(
    (entry) => `(literal "${assertProfileSafePath(entry, refuseUnsafePath)}")`,
  );
  return ['(version 1)', '(allow default)', `(deny file-write* ${[...denied, ...files].join(' ')})`, ''].join('\n');
}

/**
 * The profile a target runs under. Writes are denied outright and allowed
 * again under the workspace and the runtime's private directories; the
 * project's git directory is denied reads and writes except the worktree's own
 * metadata directory, which stays readable; the evaluation folder's denial of
 * reads and writes comes last, so no allowance above it can reach inside it.
 * The user's private root directory is denied reads and writes and a `connect()`
 * to a unix socket under it (a denied read does not stop a connection), after
 * every allowance.
 *
 * With `audit` (`{ token, exempt }`), the kernel reports what the profile
 * allows or refuses: every file rule that denies carries the sandbox's token
 * (`with message`), and one rule, placed before every rule that follows it so
 * that a later grant (the home, the git directory's own entry) overrides it,
 * reports each `file-read-data` the profile allows outside `exempt` (the paths
 * the sandbox may read, and the root directory itself) with the same token
 * (`with report`). Without `audit` the profile is the one every earlier story
 * generated, byte for byte.
 */
function seatbeltTargetProfile({ workspace, writable, evaluationFolder, git = null, privateRoot = null, rootHome = null, audit = null }) {
  const allowed = [workspace, ...writable]
    .flatMap(spellings)
    .map((entry) => `(subpath "${assertProfileSafePath(entry, refuseUnsafePath)}")`);
  const tagged = audit === null ? '' : ` (with message "${audit.token}")`;
  // Seatbelt decides an operation by the rules that name it before the rules that name its wildcard, so the report rule
  // (which names `file-read-data`) would override every later `file-read*` rule, whatever their order; an audited profile
  // therefore names `file-read-data` in each rule that governs reads, which keeps the textual order (the last matching rule
  // wins) the unaudited profile relies on.
  const reads = audit === null ? 'file-read*' : 'file-read-data file-read*';
  const subpaths = (candidate) => spellings(candidate).map((entry) => `(subpath "${assertProfileSafePath(entry, refuseUnsafePath)}")`);
  // A denial of reads and writes of `paths`; an audited profile names `file-read-data` and tags it (see `reads`).
  const denials = (paths) => [`(deny ${reads} file-write*\n  ${paths.join('\n  ')}${tagged})`];
  const withheld = subpaths(evaluationFolder);
  // Git resolves the path of the worktree's metadata directory component by component (`lstat`), so the git directory
  // and its `worktrees/` answer a metadata request, which tells nothing a path does not already say.
  const literals = (candidate) => spellings(candidate).map((entry) => `(literal "${assertProfileSafePath(entry, refuseUnsafePath)}")`);
  const gitRules =
    git === null
      ? []
      : [
          ...denials([...subpaths(git.directory), ...git.alternates.flatMap(subpaths)]),
          ...(git.metadata === null
            ? []
            : [
                `(allow ${reads}\n  ${subpaths(git.metadata).join('\n  ')})`,
                `(allow file-read-metadata\n  ${[...literals(git.directory), ...literals(path.dirname(git.metadata))].join('\n  ')})`,
              ]),
        ];
  const privateRules =
    privateRoot === null
      ? []
      : [
          ...denials(subpaths(privateRoot)),
          `(deny network-outbound\n  ${spellings(privateRoot)
            .map((entry) => `(remote unix-socket (subpath "${assertProfileSafePath(entry, refuseUnsafePath)}"))`)
            .join('\n  ')})`,
        ];
  // The target's own home sits beneath the private root, so it is allowed again after the root's denial (the last
  // matching rule wins); a sibling home, another run's parent and the root's listing stay denied.
  // Resolving the home's path asks the root and each directory down to the home's parent for their metadata (an `lstat`
  // while a module loads, `realpath`, `mkdir -p`, `cd`), so those directories answer a metadata request, which tells nothing
  // a path does not already say; listing them stays denied, since a directory's entries are file data.
  const homeAncestors = [];
  if (rootHome !== null) {
    for (
      let ancestor = path.dirname(rootHome);
      ancestor.length > 1 && ancestor !== path.dirname(ancestor);
      ancestor = path.dirname(ancestor)
    ) {
      if (spellings(privateRoot).some((held) => isInside(held, ancestor))) homeAncestors.push(ancestor);
      else break;
    }
  }
  const homeRules =
    rootHome === null
      ? []
      : [
          `(allow ${reads} file-write*\n  ${subpaths(rootHome).join('\n  ')})`,
          `(allow file-read-metadata\n  ${homeAncestors.flatMap(literals).join('\n  ')})`,
        ];
  // What the sandbox may read is not reported; every other read the profile allows is (macOS reports by real path, so both spellings are named).
  const reportRule =
    audit === null
      ? []
      : [
          `(allow file-read-data\n  (require-all\n    ${[
            ...EXACT_GRANTS.map((entry) => `(require-not (literal "${entry}"))`),
            ...audit.exempt
              .flatMap(spellings)
              .map((entry) => `(require-not (subpath "${assertProfileSafePath(entry, refuseUnsafePath)}"))`),
          ].join('\n    ')})\n  (with report)${tagged})`,
        ];
  // A target's git tries to write the worktree's own entry and the private repository (the index lock of a `git status`), which
  // the profile refuses and the target's git expects to fail; the refusal carries no token, so it is not an observed mount.
  const quiet =
    audit === null || (audit.quiet ?? []).length === 0 ? [] : [`(deny file-write*\n  ${audit.quiet.flatMap(subpaths).join('\n  ')})`];
  return [
    '(version 1)',
    '(allow default)',
    `(deny file-write*${tagged})`,
    `(allow file-write*\n  ${[...allowed, ...SEATBELT_DEVICE_WRITES].join('\n  ')})`,
    ...reportRule,
    ...gitRules,
    ...privateRules,
    ...homeRules,
    ...quiet,
    ...denials(withheld),
    '',
  ].join('\n');
}

/**
 * What every Bubblewrap process shares, after `/` and `/dev` are bound:
 * a namespace of its own for process ids with its own procfs, so a process
 * cannot reach the runtime's mount namespace through `/proc/<pid>/root`, and
 * every process it leaves running ends with it; `--die-with-parent`, so
 * killing the Bubblewrap process the runtime started (a timed-out HTTP port)
 * ends what it forked; a session of its own; no `NODE_V8_COVERAGE`, since a
 * process that cannot write its coverage files says so on standard error; and
 * an empty `/run/user`, so no
 * process can ask the user's service manager to start an unconfined job.
 */
function bubblewrapIsolation() {
  const runUser = fs.existsSync('/run/user') ? ['--tmpfs', '/run/user'] : [];
  return ['--unshare-pid', '--proc', '/proc', '--die-with-parent', '--new-session', '--unsetenv', 'NODE_V8_COVERAGE', ...runUser];
}

/**
 * A network namespace of the process's own, with a loopback and nothing else
 * (Story 1.63): abstract Unix sockets belong to the network namespace, so a
 * process in it cannot connect to one the host serves. The target's vector and
 * both probes carry it, so a host that cannot create the namespace is refused
 * at selection as one that cannot start Bubblewrap is; the evaluation layer's
 * vector does not, since its HTTP port reaches the forwarded server over the
 * host's loopback.
 */
const BUBBLEWRAP_NETWORK = Object.freeze(['--unshare-net']);

/**
 * What hides a host socket from a target (Story 1.82): the empty device file is mounted over the socket's file, so a
 * `connect()` finds no socket there and answers `ECONNREFUSED`, as it does for a path nothing listens on.
 */
const SOCKET_MASK_SOURCE = '/dev/null';

/** The most distinct refused egress requests a sandbox keeps. */
const MAX_EGRESS_REFUSALS = 50;

/** The name of a call's egress proxy socket inside its private directory. */
const EGRESS_SOCKET_NAME = 's';

/** The longest Unix socket path every platform binds (macOS holds 103 bytes, Linux 107). */
const EGRESS_SOCKET_PATH_BYTES = 100;

/** The directories the vector replaces with mounts of its own (`--dev /dev`, `--proc /proc`), so a socket in them needs no mount and takes no budget. */
const SOCKET_REPLACED_DIRECTORIES = Object.freeze(['/dev', '/proc']);

/**
 * Where a call's socket mounts reach Bubblewrap (Story 1.82): a file of NUL-separated arguments the launcher opens as this
 * descriptor and `--args` reads, so the number of sockets a host holds cannot overflow the argument limit of the call's `exec`.
 */
const SOCKET_ARGUMENTS_FD = 3;

/**
 * The launcher of a call that hides sockets: it opens the arguments file named by its first argument as `SOCKET_ARGUMENTS_FD`
 * and executes the rest of its arguments in its own place, so the process Bubblewrap runs in is the one the runtime started.
 */
const SOCKET_LAUNCHER = Object.freeze(['/bin/sh', '-c', `exec ${SOCKET_ARGUMENTS_FD}<"$1" || exit 126; shift; exec "$@"`, 'sh']);

/**
 * What the launcher's shell leaves in the environment of the program it executes: dash exports the `PWD` it settled on and resets
 * `IFS`, `OPTIND` and `PPID` whenever the call's environment held them, and bash (the `sh` of some hosts) decrements `SHLVL` and sets
 * `_` and `OLDPWD`.
 * `env` restores each to what the call's environment held (an unset one stays unset), so a variable whose name is a valid shell
 * identifier and that the shell does not initialize reaches the target as the call gave it.
 * A name no shell can hold, an exported shell function and the variables bash initializes itself are the shell's to change (Story 1.89).
 */
const SHELL_VARIABLES = Object.freeze(['PWD', 'OLDPWD', 'SHLVL', '_', 'IFS', 'OPTIND', 'PPID']);

/** The program that restores `SHELL_VARIABLES` between the launcher's shell and the command. */
const ENVIRONMENT_PROGRAM = '/usr/bin/env';

/**
 * What the probes run a trivial process under: the target's isolation, whatever
 * binds the target gets, so what a probe confirms is what a target runs under.
 */
function bubblewrapProbeArguments(executable) {
  return [executable, '--unshare-user', ...BUBBLEWRAP_NETWORK, '--ro-bind', '/', '/', '--dev', '/dev', ...bubblewrapIsolation(), '--'];
}

/** The Bubblewrap arguments that mount an empty device file over each of `sockets`; a path no argument can carry is a `ConfinementError`. */
function socketMaskArguments(sockets) {
  return sockets.flatMap((socket) => {
    if (typeof socket !== 'string' || !path.isAbsolute(socket) || socket.includes('\0')) {
      throw new ConfinementError(`the host socket ${JSON.stringify(socket)} has no absolute path a mount can name`);
    }
    return ['--ro-bind', SOCKET_MASK_SOURCE, socket];
  });
}

/**
 * The command a call that hides sockets starts: the launcher, the arguments file, and `env` restoring the variables the launcher's
 * shell touches to what `environment` held (an unset one stays unset), then `argv`.
 * A first word with `=` in it would be read by `env` as an assignment, so it is refused.
 */
function launchedCommand(socketFile, environment, argv) {
  if (String(argv[0]).includes('=')) {
    throw new ConfinementError(
      `the executable ${JSON.stringify(argv[0])} holds "=", which the socket launcher's env would read as an assignment`,
    );
  }
  const held = (name) => typeof environment?.[name] === 'string';
  // The options come first: `env` reads an assignment as the end of them.
  const restore = [
    ...SHELL_VARIABLES.filter((name) => !held(name)).flatMap((name) => ['-u', name]),
    ...SHELL_VARIABLES.filter(held).map((name) => `${name}=${environment[name]}`),
  ];
  // Dash stops on an `OPTIND` that is no number (`Illegal number`), so the shell never sees one the call held.
  const shell = held('OPTIND') ? [ENVIRONMENT_PROGRAM, '-u', 'OPTIND', ...SOCKET_LAUNCHER] : SOCKET_LAUNCHER;
  return [...shell, socketFile, ENVIRONMENT_PROGRAM, ...restore, ...argv];
}

/**
 * The Bubblewrap argument vector a target runs under, before its own command:
 * an unprivileged user namespace, `/` read-only, a synthetic `/dev` (the real
 * one's device nodes cannot be opened from the namespace), the workspace and
 * the private directories writable, the project's git directory covered by an
 * empty file system with the worktree's own metadata directory bound back in
 * read-only, the user's private root directory covered the same way, and the evaluation
 * folder covered by an empty read-only file
 * system, so nothing under it can be read or written. A network namespace of
 * its own (`BUBBLEWRAP_NETWORK`) for every call: a started HTTP server listens in
 * it and the runtime reaches it through the bridge of `confinement-relay.js`, and
 * a target reaches the hosts its entry authorizes through the egress proxy. Each of `sockets` (real paths of the host's
 * path-based Unix sockets, `host-sockets.js`) is covered by an empty device file
 * (Story 1.82); the mounts come before the binds, so a grant bound over one wins.
 * A socket's path goes into the vector as it is, since an argument carries any
 * character and a socket another user bound must not be able to refuse every call.
 * With `socketsFd`, the mounts are read from that descriptor (`--args`) and not
 * carried inline, so the number of sockets cannot overflow the argument limit.
 * With `egress` (`{ directory, mount }`), the runtime's egress proxy directory
 * (Story 1.83) is bound read-only at `mount`, a path beneath the synthetic `/dev`
 * when the directory sits in the private root the sandbox empties, so the
 * call's shim reaches the proxy's socket from inside the namespace.
 */
function bubblewrapTargetArguments({
  executable,
  workspace,
  writable,
  evaluationFolder,
  git = null,
  privateRoot = null,
  rootHome = null,
  statusFile,
  statusMount,
  sockets = [],
  socketsFd = null,
  egress = null,
}) {
  const realOf = (candidate) => assertProfileSafePath(spellings(candidate).at(-1), refuseUnsafePath);
  const binds = [workspace, ...writable, ...(statusMount === statusFile ? [statusFile] : [])].flatMap((entry) => {
    const real = realOf(entry);
    return ['--bind', real, real];
  });
  // The git directory and each object directory it borrows from are covered by an empty file system; the worktree's own
  // entry is bound back in read-only before the git directory is remounted read-only.
  const gitArguments =
    git === null
      ? []
      : [
          ...git.alternates.flatMap((alternate) => ['--tmpfs', realOf(alternate), '--remount-ro', realOf(alternate)]),
          '--tmpfs',
          realOf(git.directory),
          ...(git.metadata === null ? [] : ['--ro-bind', realOf(git.metadata), realOf(git.metadata)]),
          '--remount-ro',
          realOf(git.directory),
        ];
  // The target's own home beneath the root is bound into the empty file system before it is remounted read-only; the
  // remount touches the root's mount alone, so the home stays writable and nothing else of the root is visible.
  const privateArguments =
    privateRoot === null
      ? []
      : [
          '--tmpfs',
          realOf(privateRoot),
          ...(rootHome === null ? [] : ['--bind', realOf(rootHome), realOf(rootHome)]),
          '--remount-ro',
          realOf(privateRoot),
        ];
  const withheld = realOf(evaluationFolder);
  const masks = socketMaskArguments(sockets);
  return [
    executable,
    '--unshare-user',
    ...BUBBLEWRAP_NETWORK,
    '--ro-bind',
    '/',
    '/',
    '--dev',
    '/dev',
    ...bubblewrapIsolation(),
    ...(socketsFd !== null && masks.length > 0 ? ['--args', String(socketsFd)] : masks),
    ...binds,
    ...gitArguments,
    ...privateArguments,
    ...(statusMount === statusFile ? [] : ['--bind', realOf(statusFile), statusMount]),
    // The egress proxy's directory is the runtime's: the target sees it read-only, and a `connect()` needs no write.
    ...(egress === null || egress.mount === egress.directory ? [] : ['--ro-bind', realOf(egress.directory), egress.mount]),
    '--tmpfs',
    withheld,
    '--remount-ro',
    withheld,
    '--',
  ];
}

/**
 * The Bubblewrap argument vector a process of the evaluation layer runs under: `/` writable, the evaluation folder, the
 * project's common git directory, the hooks directory `core.hooksPath` names outside it and the checkout's `.git` file
 * read-only. A hooks directory that does not exist yet cannot be bound (the run creates no directory in the adopter's tree),
 * so the adopter-tree reading digests it instead (`workspace.js` `adopterTreeState`).
 * It keeps the host's network, since the evaluation's HTTP port reaches a started server over the host's loopback.
 */
function bubblewrapLayerArguments({ executable, evaluationFolder, gitDirectory = null, hooksDirectory: hooks = null, gitFile = null }) {
  const hooksBound = hooks !== null && hooks !== undefined && fs.existsSync(hooks) ? hooks : null;
  const protectedPaths = [evaluationFolder, gitDirectory, hooksBound, gitFile]
    .filter((entry) => entry !== null && entry !== undefined)
    .map((entry) => assertProfileSafePath(spellings(entry).at(-1), refuseUnsafePath));
  return [
    executable,
    '--unshare-user',
    '--bind',
    '/',
    '/',
    '--dev',
    '/dev',
    ...bubblewrapIsolation(),
    ...protectedPaths.flatMap((entry) => ['--ro-bind', entry, entry]),
    '--',
  ];
}

/**
 * Whether the mechanism confines a trivial process here, or why not: selection
 * says the executable exists, this says the kernel lets it work.
 */
function probeMechanism({ mode, executable }) {
  const vector =
    mode === 'seatbelt' ? [executable, '-p', '(version 1)\n(allow default)\n(deny file-write*)\n'] : bubblewrapProbeArguments(executable);
  const probe = probeTrivialProcess({ vector: [...vector, ...TRIVIAL_PROCESS] });
  if (probe.ok) return null;
  if (probe.error) return `${probe.error.code ?? probe.error.message}`;
  return `a trivial process under it ended ${probe.status === null ? `by ${probe.signal}` : `with exit ${probe.status}`}${probe.tail ? ` (${probe.tail})` : ''}`;
}

/** What most often keeps a present observer from confirming itself, named in the refusal. */
const OBSERVER_HINTS = Object.freeze({
  seatbelt:
    "the audit reads the kernel's sandbox reports through /usr/bin/log stream, which needs a login session that may read the unified log",
  bubblewrap:
    'the audit runs the target under strace -f --seccomp-bpf --decode-pids=pidns (apt-get install strace, version 6.1 or later: the version the audit was verified against), which needs ptrace: a container whose seccomp profile forbids it or kernel.yama.ptrace_scope=3 refuses it',
});

/** The observers a selection has confirmed in this process, so a case that selects often probes once. */
const confirmedObservers = new Map();

/**
 * The observer the audit reads this host's mechanism through, and whether it
 * works here: `{ observer }` when a trivial read by a confined process came
 * back through it, `{ failure }` with the reason otherwise (Story 1.60).
 */
function probeObserver(mechanism, env) {
  // The probes make a directory in the temp directory; one that is missing or unwritable is the workspace step's to name, as
  // for the mechanism's own probe, and the observer is then confirmed by the first call that runs (the trial's start on macOS,
  // the start of the target in each call's trace on Linux), which a run that cannot make a workspace never reaches.
  let tempUsable = true;
  try {
    fs.accessSync(os.tmpdir(), fs.constants.W_OK);
  } catch {
    tempUsable = false;
  }
  if (mechanism.mode === 'seatbelt') {
    const logExecutable = env?.[LOG_ENV] || LOG_EXECUTABLE;
    if (!path.isAbsolute(logExecutable))
      return { failure: `${LOG_ENV} names ${JSON.stringify(logExecutable)}, which is not an absolute path` };
    const key = `${mechanism.executable}|${logExecutable}`;
    if (!tempUsable) return { observer: { executable: logExecutable } };
    if (confirmedObservers.has(key)) return confirmedObservers.get(key);
    const failure = probeReportStream({ sandboxExec: mechanism.executable, logExecutable });
    if (failure !== null) return { failure };
    return confirmedObservers.set(key, { observer: { executable: logExecutable } }).get(key);
  }
  const strace = executableOnPath('strace', env);
  if (strace === null) return { failure: 'strace is not on PATH' };
  if (!tempUsable) return { observer: { executable: strace } };
  const key = `${mechanism.executable}|${strace}`;
  if (confirmedObservers.has(key)) return confirmedObservers.get(key);
  const failure = probeTrace({
    strace,
    vector: bubblewrapProbeArguments(mechanism.executable),
  });
  if (failure !== null) return { failure };
  return confirmedObservers.set(key, { observer: { executable: strace } }).get(key);
}

/** A string environment value that is not empty. */
function setValue(value) {
  return typeof value === 'string' && value !== '';
}

/**
 * The credentials file the host holds for `adapter`, by its real path, or null: `<directory>/<file>` where `directory` is the
 * variable's value when the host sets it and the default beneath the user's home otherwise.
 * A link is followed; a path that is
 * not a regular file is no login.
 */
function hostLoginFile(adapter, env) {
  const home = setValue(env.HOME) ? env.HOME : os.homedir();
  const directory = setValue(env[adapter.directoryVariable])
    ? path.resolve(env[adapter.directoryVariable])
    : path.join(home, adapter.defaultDirectory);
  try {
    const candidate = path.join(directory, adapter.file);
    return fs.statSync(candidate).isFile() ? fs.realpathSync.native(candidate) : null;
  } catch {
    return null;
  }
}

/**
 * The logins the registry's entries declare (`"login": "claude"`, Story 1.113), one record per entry that declares one: the
 * interface and executable, the adapter, the variable's name when the host sets it (its value is read where a request is made and
 * is in no record) and, for a run that confines, the credentials file's real path.
 * A run that opted out takes no file, since its
 * target runs with the host's own home.
 *
 * @param {object} evaluation the parsed `evaluation.json`
 * @param {NodeJS.ProcessEnv} env
 * @param {{ file: boolean }} options whether the credentials file is a source (a confined run)
 * @returns {Array<{ interfaceId: string, executable: string, login: string, variable: string|null, file: string|null }>}
 */
function loginsOf(evaluation, env, { file }) {
  const entries = Array.isArray(evaluation?.registry) ? evaluation.registry : [];
  return entries
    .filter((entry) => entry !== null && typeof entry === 'object' && (entry.kind === undefined || entry.kind === 'cli'))
    .filter((entry) => Object.hasOwn(LOGIN_ADAPTERS, entry.login))
    .map((entry) => {
      const adapter = LOGIN_ADAPTERS[entry.login];
      return {
        interfaceId: entry.interfaceId,
        executable: entry.executable,
        login: entry.login,
        variable: setValue(env[adapter.variable]) ? adapter.variable : null,
        file: file ? hostLoginFile(adapter, env) : null,
      };
    });
}

/**
 * The run's confinement: `{ mode: 'opt-out' }` for an evaluation that opts
 * out, the mechanism this host confines with, or `{ refusal }` saying why
 * none can (exit 12).
 *
 * @param {object} options
 * @param {object} options.evaluation the parsed `evaluation.json`
 * @param {string} options.folder the resolved evaluation folder
 * @param {string} options.root the project root (`launch.root`), whose repository's common git directory and hooks directory the evaluation layer may not write
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {string} [options.platform]
 * @returns {{ mode: string, executable?: string, evaluationFolder: string, gitDirectory?: string|null, hooksDirectory?: string|null, gitFile?: string|null, logins: object[] } | { refusal: string }}
 */
function selectConfinement({ evaluation, folder, root, env = process.env, platform = process.platform }) {
  if (typeof root !== 'string' || root === '') throw new TypeError('selectConfinement needs the project root (launch.root)');
  const evaluationFolder = path.resolve(folder);
  if (evaluation?.confinement === false) return { mode: 'opt-out', evaluationFolder, logins: loginsOf(evaluation, env, { file: false }) };
  const optOut = 'or set "confinement": false in evaluation.json to run the targets unconfined, which run.json records as "opt-out"';
  const named = env[PLATFORM_ENV] || platform;
  let mechanism = null;
  if (named === 'darwin') {
    const sandboxExec = executableOnPath(path.basename(SANDBOX_EXEC), { PATH: path.dirname(SANDBOX_EXEC) });
    if (sandboxExec !== null) mechanism = { mode: 'seatbelt', executable: sandboxExec };
  } else if (named === 'linux') {
    const bwrap = executableOnPath('bwrap', env);
    if (bwrap !== null) mechanism = { mode: 'bubblewrap', executable: bwrap };
  }
  if (mechanism === null) {
    return {
      refusal: `file-system confinement has no mechanism on ${named}: tea-evaluate confines every target with ${MECHANISM_NAMES.seatbelt} or ${MECHANISM_NAMES.bubblewrap}, and found neither; install Bubblewrap on Linux (apt-get install bubblewrap), ${optOut}`,
    };
  }
  const failure = probeMechanism(mechanism);
  if (failure !== null) {
    return {
      refusal: `${MECHANISM_NAMES[mechanism.mode]} cannot confine a process on this host: ${failure}; ${PROBE_HINTS[mechanism.mode]}; run tea-evaluate where the mechanism works, ${optOut}`,
    };
  }
  let temp = os.tmpdir();
  try {
    temp = fs.realpathSync.native(temp);
  } catch {
    // The workspace step names an unusable temp directory itself.
  }
  if (spellings(evaluationFolder).some((entry) => isInside(entry, temp))) {
    return {
      refusal: `the temp directory ${temp} is inside the evaluation folder, where the confinement denies every target read and write, so no workspace there could run; point TMPDIR outside the evaluation folder`,
    };
  }
  const unsafe = spellings(evaluationFolder).find((entry) => !isProfileSafePath(entry));
  if (unsafe !== undefined) {
    return {
      refusal: `the evaluation folder's path ${JSON.stringify(unsafe)} holds a quote, a backslash or a line break (or another control character), which no confinement profile can carry; move the folder, ${optOut}`,
    };
  }
  // Every workspace and private directory a target is granted is made under the temp directory.
  const unsafeTemp = spellings(temp).find((entry) => !isProfileSafePath(entry));
  if (unsafeTemp !== undefined) {
    return {
      refusal: `the temp directory ${JSON.stringify(unsafeTemp)} holds a quote, a backslash or a line break (or another control character), which no confinement profile can carry, and every workspace is made under it; point TMPDIR elsewhere, ${optOut}`,
    };
  }
  // The audit observes through the mechanism, so a host that cannot observe cannot run: an empty list of observed
  // mounts would then be what a broken observer returns, and not evidence.
  const observed = probeObserver(mechanism, env);
  if (observed.failure !== undefined) {
    return {
      refusal: `the audit of ${MECHANISM_NAMES[mechanism.mode]} cannot observe a confined process on this host: ${observed.failure}; ${OBSERVER_HINTS[mechanism.mode]}; run tea-evaluate where it works, ${optOut}`,
    };
  }
  mechanism = { ...mechanism, observer: observed.observer };
  // The project's common git directory, and the hooks directory `core.hooksPath` names outside it, are read-only to the
  // evaluation layer, so its processes cannot plant a hook, change the configuration or move a ref the adopter's next git
  // command reads (Story 1.112); null outside a git repository.
  const gitDirectory = commonGitDirectory(root);
  const hooks = hooksDirectory(root, gitDirectory);
  const gitFile = gitFileOf(root);
  for (const [what, directory] of [
    ['git directory', gitDirectory],
    ['hooks directory', hooks],
    ['git file', gitFile],
  ]) {
    const unsafeGit = directory === null ? undefined : spellings(directory).find((entry) => !isProfileSafePath(entry));
    if (unsafeGit !== undefined) {
      return {
        refusal: `the project's ${what} ${JSON.stringify(unsafeGit)} holds a quote, a backslash or a line break (or another control character), which no confinement profile can carry; move the project, ${optOut}`,
      };
    }
  }
  // The logins the entries declare (Story 1.113): an entry with a source the host cannot give a confined target is refused here,
  // since every call of it would exit 4 and read as the target's own transport failure.
  const logins = [];
  for (const found of loginsOf(evaluation, env, { file: true })) {
    let login = found;
    const adapter = LOGIN_ADAPTERS[login.login];
    const unsafeLogin = login.file === null ? undefined : spellings(login.file).find((entry) => !isProfileSafePath(entry));
    // A file no profile can carry is left out when the token can authenticate, and refuses the run when it cannot.
    if (unsafeLogin !== undefined && login.variable !== null) login = { ...login, file: null };
    else if (unsafeLogin !== undefined) {
      return {
        refusal: `the ${adapter.name} credentials file ${JSON.stringify(unsafeLogin)} holds a quote, a backslash or a line break (or another control character), which no confinement profile can carry; move it, set ${adapter.variable} to a token from "claude setup-token", ${optOut}`,
      };
    }
    if (login.variable === null && login.file === null) {
      return {
        refusal: `the registry entry ${JSON.stringify(login.interfaceId)} declares "login": ${JSON.stringify(login.login)} and this host has no ${adapter.name} login a confined target can use: ${adapter.variable} is not set and there is no ${adapter.file} in ${setValue(env[adapter.directoryVariable]) ? `${adapter.directoryVariable} (${env[adapter.directoryVariable]})` : `${path.join(setValue(env.HOME) ? env.HOME : os.homedir(), adapter.defaultDirectory)} (set ${adapter.directoryVariable} to name another directory)`}; a login held in the macOS Keychain cannot reach a confined process, since no Seatbelt rule scopes the keychain to one item; run "claude setup-token" and export the token it prints as ${adapter.variable}, ${optOut}`,
      };
    }
    logins.push(login);
  }
  return { ...mechanism, evaluationFolder, gitDirectory, hooksDirectory: hooks, gitFile, logins };
}

/**
 * The one file of the user's own home every macOS process reads whatever `HOME` says: CoreFoundation reads the user's text
 * encoding preference from the account's home directory (`getpwuid`), so a process under a private `HOME` still opens it.
 */
function darwinUserFiles() {
  try {
    return [path.join(os.userInfo().homedir, '.CFUserTextEncoding')];
  } catch {
    return [];
  }
}

/** Whether the run confines its processes, as opposed to having opted out. */
function confines(confinement) {
  return confinement !== null && confinement !== undefined && (confinement.mode === 'seatbelt' || confinement.mode === 'bubblewrap');
}

/**
 * The argument vector a process of the evaluation layer is started through,
 * before its own command; empty for a run that opted out.
 *
 * @param {object|null} confinement `selectConfinement`'s answer
 * @returns {string[]}
 */
function layerPrefix(confinement) {
  if (!confines(confinement)) return [];
  if (confinement.mode === 'seatbelt')
    return [
      confinement.executable,
      '-p',
      seatbeltLayerProfile(confinement.evaluationFolder, confinement.gitDirectory, confinement.hooksDirectory, confinement.gitFile),
    ];
  return bubblewrapLayerArguments(confinement);
}

/**
 * What one workspace's target processes run under: `wrap` turns a target and
 * its arguments into the mechanism's command, and the audit (`confinement-audit.js`)
 * says which paths those processes opened outside what the trial was granted
 * (`observedMounts`).
 *
 * @param {object} options
 * @param {object} options.confinement `selectConfinement`'s answer for a run that confines
 * @param {string} options.workspace the workspace's checkout, the one tree the target may write
 * @param {{ directory: string, metadata?: string|null, view?: string|null, alternates?: string[] }|null} [options.git] the
 *   project's git directory and the object directories it borrows from (`alternates`), which the target can neither read
 *   nor write, the worktree's own metadata directory inside the first, which it may read, and the private repository
 *   (`view`) its git reads; `null` for a workspace in no repository
 * @param {string|null} [options.privateRoot] the user's private root directory, the one every run's private parent sits beneath (`workspace.js` `makePrivateParent`),
 *   which the target can neither read, write nor connect a socket under; `null` where the run made none
 * @param {string|null} [options.home] the sandbox's private home directory (`makeTargetHome` makes it beneath the run's private
 *   parent, which is beneath `privateRoot`), which every call may read and write and which `HOME` and the XDG base directories
 *   name (`withTemporary`); beneath `privateRoot` it is the one directory of the root the target reaches (re-allowed after the
 *   root's denial in Seatbelt, bound into the root's empty file system in Bubblewrap, excepted from the audit's withholding),
 *   so no other home is reachable; refused inside the workspace or the evaluation folder; `null` where the run made none
 * @param {string[]} [options.linked] the real paths of the host's login files that the home links to (`makeTargetHome`'s `links`,
 *   Story 1.113): files the target may read and the audit does not list, whether it opens them by the real path or by the link in
 *   its home; each stays unwritable
 * @param {{ directory: string, barrierMs?: number }|null} [options.audit] the runtime-private directory (`makeAuditDirectory`) the audit keeps
 *   its files in, which a target cannot reach; `null` for a port that does not audit. The confinement must carry the
 *   `observer` its selection probed.
 * @param {string|null} [options.status] under Bubblewrap, a private directory where the status of a target a signal
 *   ended is written (`confinement-status.cjs`)
 * @param {(options: { except: string[], limit: number }) => (string[]|{ sockets: string[], left?: number, refused?: string|null })} [options.hostSockets]
 *   under Bubblewrap, the host's path-based Unix sockets a call must not reach (`host-sockets.js` reads the kernel's table), asked for
 *   each call with the real paths its grants and the sandbox's own mounts already cover, and the number of mounts the call's command
 *   leaves room for (`limit`); a case replaces it with a fixed list
 */
function targetSandbox({
  confinement,
  workspace,
  git: gitAccess = null,
  privateRoot = null,
  home: initialHome = null,
  linked = [],
  audit = null,
  status = null,
  hostSockets = listHostSockets,
}) {
  const git = gitAccess === null ? null : { metadata: null, view: null, alternates: [], ...gitAccess };
  if (typeof workspace !== 'string' || workspace.length === 0) {
    throw new ConfinementError('a confined target needs the workspace it may write');
  }
  const { evaluationFolder } = confinement;
  if (spellings(workspace).some((entry) => spellings(evaluationFolder).some((withheld) => isInside(withheld, entry)))) {
    throw new ConfinementError(
      `the workspace ${workspace} is inside the evaluation folder, which the confinement withholds from the target`,
    );
  }
  for (const held of git === null ? [] : [git.directory, ...git.alternates]) {
    if (spellings(workspace).some((entry) => spellings(held).some((withheld) => isInside(withheld, entry)))) {
      throw new ConfinementError(`the workspace ${workspace} is inside ${held}, which the confinement withholds from the target`);
    }
  }
  if (privateRoot !== null) {
    if (typeof privateRoot !== 'string' || privateRoot.length === 0) {
      throw new ConfinementError('the private root directory must be a path');
    }
    if (spellings(workspace).some((entry) => spellings(privateRoot).some((withheld) => isInside(withheld, entry)))) {
      throw new ConfinementError(`the workspace ${workspace} is inside ${privateRoot}, which the confinement withholds from the target`);
    }
  }
  // The sandbox's current home: `setHome` replaces it, and every wrap reads it when it is called.
  let home = null;
  // A home beneath the private root (the run's own parent holds it) is the one directory of the root the target may reach.
  let rootHome = null;
  const adoptHome = (candidate) => {
    if (typeof candidate !== 'string' || candidate.length === 0) {
      throw new ConfinementError('the private home directory must be a path');
    }
    const inside = (container) => spellings(candidate).some((entry) => spellings(container).some((held) => isInside(held, entry)));
    for (const [name, container] of [
      ['the evaluation folder', evaluationFolder],
      ['the workspace', workspace],
    ]) {
      if (inside(container)) {
        throw new ConfinementError(`the private home ${candidate} is inside ${name}, which a target cannot be granted write access to`);
      }
    }
    home = candidate;
    rootHome = privateRoot !== null && inside(privateRoot) ? candidate : null;
  };
  if (initialHome !== null) adoptHome(initialHome);
  if (confinement.mode === 'bubblewrap' && (typeof status !== 'string' || status.length === 0)) {
    throw new ConfinementError('a target confined by Bubblewrap needs a status directory');
  }
  if (audit !== null && (typeof audit?.directory !== 'string' || typeof confinement.observer?.executable !== 'string')) {
    throw new ConfinementError('an audited target needs the private directory of its audit and the observer its confinement probed');
  }
  const observer = audit === null ? null : makeObserver({ confinement, audit, cwd: workspace });
  let calls = 0;
  // What the calls' lists of host sockets left reachable (Story 1.82): the calls that listed, those whose budget cut the list
  // (sockets of other users stayed reachable) and the most sockets one call left.
  let socketCalls = 0;
  let socketCallsCut = 0;
  let socketsLeftMost = 0;
  // What the egress proxies of the calls refused (Story 1.83): each distinct request once with its count, and the number past the cap.
  const egressRefused = new Map();
  let egressOmitted = 0;
  // What the sandbox may read, besides the system's own directories, for one call: the paths the call may write, its
  // declared system paths, the private home and the worktree's own entry in the git directory and the private repository.
  const readRoots = (granted) =>
    [
      workspace,
      ...granted,
      ...(home === null ? [] : [home]),
      ...(git === null ? [] : [git.metadata, git.view].filter((entry) => typeof entry === 'string')),
      ...linked,
      nodeInstallRoot(process.execPath),
      ...(confinement.mode === 'bubblewrap' ? [STATUS_SHIM] : []),
      ...SYSTEM_ROOTS,
      ...(confinement.mode === 'seatbelt' ? [...DARWIN_SYSTEM_ROOTS, ...darwinUserFiles()] : []),
    ].flatMap(spellings);
  // The worktree's own entry in the git directory and the private repository its git reads: a refused write there is git's own and is not audited.
  const ownGitEntries = () => (git === null ? [] : [git.metadata, git.view].filter((entry) => typeof entry === 'string'));
  // What the sandbox withholds and what it re-grants inside the withheld paths.
  const withheldRoots = () => [
    ...spellings(evaluationFolder),
    ...(git === null ? [] : [git.directory, ...git.alternates].flatMap(spellings)),
    ...(privateRoot === null ? [] : spellings(privateRoot)),
  ];
  const withheldExcept = () => [...(git?.metadata ? spellings(git.metadata) : []), ...(rootHome === null ? [] : spellings(rootHome))];
  return {
    mode: confinement.mode,
    /** Whether this sandbox audits what its processes open. */
    audited: observer !== null,
    /** The sandbox's current private home directory, which `HOME` and the XDG base directories name; `null` where there is none. */
    get home() {
      return home;
    },
    /** Points the sandbox at another home (after a reset made a new one); the calls made after it are confined to that one. */
    setHome: adoptHome,
    /**
     * The command that runs `target args` confined. `writable` names the
     * private directories this call's processes may write besides the
     * workspace and `readable` the system paths its registry entry declares;
     * under Bubblewrap the command also carries the file the status shim
     * writes a signal to, which `recordedStatus` reads, and, for an audited
     * sandbox, `strace` and the trace file `collect` reads. `bridge` (Bubblewrap
     * alone, a started HTTP server's call) is the Unix socket the shim serves
     * as the runtime's way into the target's network namespace; it lies in a
     * directory `writable` names, which is the call's grant and the audit's.
     * `egress` (Bubblewrap alone) is the Unix socket of the runtime's egress proxy for the call (`openEgress`), in a directory of the
     * runtime's own that the call sees read-only: the shim listens on a loopback port of the namespace, connects each connection to
     * it and names the port in the target's proxy variables (Story 1.83). A call whose entries authorize no host has none.
     * `listenPort` is the port a started server was told to bind in the namespace; the shim keeps its egress listener off it.
     * `sockets` (Bubblewrap alone) is the list of host sockets to hide, for a call made again after a socket it hid went away:
     * the call's own earlier list without the vanished ones, so no socket another process creates meanwhile joins it. Without
     * it the call asks `hostSockets` for a list, with room for the mounts its own command leaves (`socketBudget`).
     * A call that hides sockets carries them in a file the launcher hands Bubblewrap (`SOCKET_LAUNCHER`), which `socketFile`
     * names and the call's end removes. `environment` is the environment the call's process starts with; the launcher gives
     * the target's the variables its shell touches as they were.
     */
    wrap(
      target,
      args,
      writable = [],
      readable = [],
      { bridge = null, sockets: own = null, environment = {}, egress: egressSocket = null, listenPort = null } = {},
    ) {
      const grants = [...writable, ...(home === null || rootHome !== null ? [] : [home])];
      if (confinement.mode === 'seatbelt') {
        const profile = seatbeltTargetProfile({
          workspace,
          writable: grants,
          evaluationFolder,
          git,
          privateRoot,
          rootHome,
          audit:
            observer === null
              ? null
              : { token: observer.token, exempt: readRoots([...grants, ...readable]), quiet: [...ownGitEntries(), ...linked] },
        });
        return { target: confinement.executable, args: ['-p', profile, target, ...args], statusFile: null };
      }
      if (bridge !== null) {
        const granted =
          typeof bridge === 'string' &&
          path.isAbsolute(bridge) &&
          writable.some((held) => spellings(held).some((entry) => spellings(bridge).some((socket) => isInside(entry, socket))));
        if (!granted) throw new ConfinementError('the bridge socket must be a path inside a directory the call may write');
      }
      // The egress proxy's directory is the runtime's own and the target sees it read-only: a directory of the private root is
      // bound at a path beneath the synthetic `/dev`, which keeps it out of the target's otherwise empty private root.
      let egress = null;
      if (egressSocket !== null) {
        if (typeof egressSocket !== 'string' || !path.isAbsolute(egressSocket)) {
          throw new ConfinementError("the egress socket must be an absolute path in a directory of the runtime's own");
        }
        const directory = spellings(path.dirname(egressSocket)).at(-1);
        if (
          spellings(directory).some((entry) =>
            [workspace, ...grants].some((granted) => spellings(granted).some((held) => isInside(held, entry))),
          )
        ) {
          throw new ConfinementError("the egress socket must lie outside the call's own grants, since the target could replace it");
        }
        egress = {
          directory,
          mount:
            privateRoot !== null && spellings(privateRoot).some((held) => isInside(held, directory))
              ? path.join('/dev', path.basename(directory))
              : directory,
        };
      }
      calls += 1;
      // A name the target cannot guess, made here and the only status file it may write, so no process can plant the
      // status of a call it is not part of.
      const statusFile = path.join(status, `status-${calls}-${crypto.randomBytes(8).toString('hex')}.json`);
      const statusKey = crypto.randomBytes(32).toString('hex');
      fs.writeFileSync(statusFile, `${JSON.stringify({ secret: statusKey })}\n`, { mode: 0o600 });
      // The source stays under the owned parent for killed-run recovery. A synthetic /dev mount keeps its directory
      // out of the target's otherwise empty private root and out of the target home's parent listing.
      const statusMount =
        privateRoot !== null && isInside(privateRoot, statusFile) ? path.join('/dev', path.basename(statusFile)) : statusFile;
      const targetVector = (hidden, socketsFd) =>
        bubblewrapTargetArguments({
          executable: confinement.executable,
          workspace,
          writable: grants,
          evaluationFolder,
          git,
          privateRoot,
          rootHome,
          statusFile,
          statusMount,
          sockets: hidden,
          socketsFd,
          egress,
        });
      const tail = [
        process.execPath,
        STATUS_SHIM,
        ...(bridge === null ? [] : ['--bridge', bridge]),
        ...(egress === null ? [] : ['--egress', path.join(egress.mount, path.basename(egressSocket))]),
        // A server told to bind a port of the namespace's loopback keeps it: the egress listener asks the system for another.
        ...(egress === null || listenPort === null ? [] : ['--avoid', String(listenPort)]),
        statusMount,
        target,
        ...args,
      ];
      // Bubblewrap counts the whole command line and what `--args` reads toward one bound, the target's own arguments included, so
      // the room for mounts is what the command leaves: the vector, the shim and the target's arguments, and `--args <descriptor>`.
      const commandLength = targetVector([], null).length + tail.length + 2;
      const room = socketBudget(commandLength);
      let sockets = own;
      if (own === null) {
        // Every socket the host serves that the call does not own: the call's grants and what the sandbox covers or replaces
        // (`/dev` and `/proc`, which the vector mounts of its own) stay out.
        let listed;
        try {
          listed = hostSockets({
            except: [
              workspace,
              ...grants,
              ...withheldRoots(),
              ...(fs.existsSync('/run/user') ? ['/run/user'] : []),
              ...SOCKET_REPLACED_DIRECTORIES,
              ...(egress === null ? [] : [egress.directory]),
            ].flatMap(spellings),
            limit: room,
          });
        } catch (error) {
          fs.rmSync(statusFile, { force: true });
          throw error;
        }
        const { sockets: listedSockets, left = 0, refused = null } = Array.isArray(listed) ? { sockets: listed } : listed;
        if (refused !== null) {
          fs.rmSync(statusFile, { force: true });
          throw new ConfinementError(
            `${refused}; the call's own command takes ${commandLength} of the ${BUBBLEWRAP_ARGUMENT_LIMIT} arguments Bubblewrap accepts, and a socket left reachable could be a host service's`,
          );
        }
        sockets = listedSockets;
        socketCalls += 1;
        if (left > 0) {
          socketCallsCut += 1;
          socketsLeftMost = Math.max(socketsLeftMost, left);
        }
      }
      if (sockets.length > room) {
        fs.rmSync(statusFile, { force: true });
        throw new ConfinementError(`the call hides ${sockets.length} sockets and its command leaves room for ${room}`);
      }
      // The mounts of the hidden sockets reach Bubblewrap through a file, so a host with very many sockets cannot overflow the
      // argument limit of the call's `exec`; the file is the runtime's, and the status directory is the target's to read at most.
      const socketFile = sockets.length === 0 ? null : path.join(status, `sockets-${calls}-${crypto.randomBytes(8).toString('hex')}.args`);
      if (socketFile !== null) {
        fs.writeFileSync(
          socketFile,
          socketMaskArguments(sockets)
            .map((argument) => `${argument}\0`)
            .join(''),
          { mode: 0o600 },
        );
      }
      const vector = targetVector(sockets, socketFile === null ? null : SOCKET_ARGUMENTS_FD);
      const command = [...vector, ...tail];
      // The key, the sockets the call hides and the file that carries their mounts stay out of what a caller copies: a call whose
      // Bubblewrap failed to start with sockets hidden may have lost the race with a socket that went away, and is made again.
      const holdKey = (wrapped) =>
        Object.defineProperties(wrapped, {
          statusKey: { value: statusKey },
          hiddenSockets: { value: sockets },
          socketFile: { value: socketFile },
        });
      // The launcher goes outermost, before `strace`, so the audit traces Bubblewrap alone, as it does for a call hiding nothing.
      const launched = (argv) => (socketFile === null ? argv : launchedCommand(socketFile, environment, argv));
      if (observer === null) {
        const [first, ...rest] = launched(command);
        return holdKey({ target: first, args: rest, statusFile });
      }
      const file = path.join(audit.directory, `trace-${calls}-${crypto.randomBytes(6).toString('hex')}.txt`);
      const [first, ...rest] = launched([...straceCommand(confinement.observer.executable, file), ...command]);
      return holdKey({
        target: first,
        args: rest,
        statusFile,
        trace: {
          file,
          marker: { program: process.execPath, text: path.basename(statusFile) },
          grants: {
            // The egress proxy's directory is no grant: the shim's `connect()` to its socket opens no path the trace holds.
            read: readRoots([...grants, ...readable, statusMount]),
            requested: REQUESTED_ROOTS.flatMap(spellings),
            // The home is written whether it sits beneath the private root (bound into the vector on its own) or outside it.
            write: [workspace, ...grants, ...(home === null ? [] : [home]), statusMount, ...ownGitEntries()].flatMap(spellings),
            withheld: withheldRoots(),
            withheldExcept: withheldExcept(),
            // Only a run with a login grant carries the key, so every other run's grants are what they were.
            ...(linked.length === 0 ? {} : { linked: linked.flatMap(spellings) }),
          },
        },
      });
    },
    /**
     * Reads what a call's processes opened, once the call has ended: under
     * Bubblewrap the call's trace, whose paths join the sandbox's; nothing to
     * read under Seatbelt, whose reports `observedMounts` collects. `started`
     * says whether the status shim ran; a call whose shim ran must have left
     * its start in the trace, or the audit failed.
     */
    async collect(wrapped, { started = true } = {}) {
      if (observer === null || wrapped?.trace === null || wrapped?.trace === undefined) return;
      await observer.collect(wrapped.trace, started);
    },
    /** Starts the audit's observer (Seatbelt's log stream), which must be reading before a target process runs. */
    async start() {
      if (observer !== null) await observer.start();
    },
    /**
     * The absolute paths the audit reported, each once, sorted; empty for a
     * port that does not audit. Under Seatbelt the read first waits until
     * the stream has returned a read the runtime made after the trial's own
     * (`confirm`), and an audit that cannot confirm itself throws.
     */
    async observedMounts() {
      return observer === null ? [] : observer.observedMounts();
    },
    /**
     * How complete the reports behind `observedMounts` were, once it has been read: `{ canariesSent, canariesDelivered,
     * logReportedLoss }`, the reads of a file no target can reach that the audit attempted through the sandbox's own token (one the host could not start,
     * one a cap skipped and one a frozen runtime missed count as sent), the ones the kernel's log delivered and whether the log itself reported lost events (Story 1.81); `null` for a port that does not
     * audit. Linux's trace loses nothing and sends no canary.
     */
    auditChannel() {
      return observer === null ? null : observer.channel();
    },
    /**
     * What the calls' lists of host sockets left reachable because the call's budget of mounts ran out: `{ calls, truncatedCalls,
     * socketsLeftReachable }`, the calls that listed, how many of them left sockets of other users reachable, and the most sockets
     * one call left (the retry of a call keeps the list of its first start and counts once). `null` where the sandbox hides no
     * socket (Seatbelt). A call whose budget could not hold the sockets of root, of the system accounts and of the user running
     * it is refused and counts nowhere.
     */
    socketReport() {
      return confinement.mode === 'bubblewrap'
        ? { calls: socketCalls, truncatedCalls: socketCallsCut, socketsLeftReachable: socketsLeftMost }
        : null;
    },
    /**
     * Notes a request an egress proxy refused (Story 1.83): `{ interfaceIds, host, port, address, reason, detail }`. Each distinct
     * request is kept once with its count, at most `MAX_EGRESS_REFUSALS` of them, and the rest are counted.
     */
    noteEgressRefusal(refusal) {
      const key = JSON.stringify([refusal.interfaceIds, refusal.host, refusal.port, refusal.address, refusal.reason]);
      if (egressRefused.has(key)) egressRefused.get(key).count += 1;
      else if (egressRefused.size < MAX_EGRESS_REFUSALS) egressRefused.set(key, { ...refusal, count: 1 });
      else egressOmitted += 1;
    },
    /**
     * What the calls' egress proxies refused: `{ refusals, omitted }`, each refusal naming the host, the port, the registry entries
     * whose authorization was asked, the denial's reason and detail, the address when the host resolved and how many times the
     * request was made, and the count of distinct requests past the cap; `null` where there is no proxy (Seatbelt).
     */
    egressReport() {
      return confinement.mode === 'bubblewrap' ? { refusals: [...egressRefused.values()], omitted: egressOmitted } : null;
    },
    /** Ends the audit's observer. */
    release() {
      observer?.release();
    },
  };
}

/**
 * The observer of one audited sandbox: the mechanism-specific half of
 * `confinement-audit.js`, holding what it has reported so far.
 */
function makeObserver({ confinement, audit, cwd }) {
  const paths = new Set();
  if (confinement.mode === 'seatbelt') {
    const stream = new ReportStream({
      directory: audit.directory,
      token: auditToken(),
      sandboxExec: confinement.executable,
      fail: (message) => new ConfinementError(message),
      logExecutable: confinement.observer.executable,
    });
    return {
      token: stream.token,
      async start() {
        stream.spawnStream();
        if (!(await stream.confirm())) {
          throw new ConfinementError(
            `the audit's log stream did not report the runtime's first read within the barrier${stream.said() ? ` (${stream.said()})` : ''}`,
          );
        }
        stream.startCanaries();
      },
      collect: async () => {},
      async observedMounts() {
        // The canaries end with the trial's calls; the final one and the barrier's sentinel then come back through the stream after every report of the trial.
        await stream.stopCanaries({ final: true });
        const confirmed = await stream.confirm(audit.barrierMs);
        stream.read();
        const gone = stream.endedBecause();
        if (gone !== null) throw new ConfinementError(`the audit's log stream ended during the trial: ${gone}`);
        if (!confirmed && stream.paths.size === 0) {
          throw new ConfinementError(
            "the audit's log stream did not return a read the runtime made after the trial's own, so what the trial read is unconfirmed",
          );
        }
        if (stream.lost && stream.paths.size === 0) {
          throw new ConfinementError(
            "the audit's log stream reported lost events and no read of the trial, so what the trial read is unconfirmed",
          );
        }
        return [...stream.paths].sort();
      },
      channel() {
        const { sent, delivered, lostEvents } = stream.canaries();
        return { canariesSent: sent, canariesDelivered: delivered, logReportedLoss: lostEvents };
      },
      release: () => stream.close(),
    };
  }
  // A call whose trace cannot be trusted fails the audit for the rest of the sandbox's life: the mounts of the trial are then unknown.
  let failure = null;
  return {
    token: null,
    start: async () => {},
    async collect(trace, started) {
      try {
        const reader = await readTrace(trace.file, {
          marker: trace.marker,
          cwd,
          onAccess: (access) => {
            const listed = traceDecision(access, trace.grants);
            if (listed !== null) paths.add(listed);
          },
        });
        fs.rmSync(trace.file, { force: true });
        if (started && !reader.begun) {
          throw new ConfinementError(
            `the trace of a confined call holds no start of its target, so what its processes opened is unknown; strace reported nothing for ${trace.marker.text}`,
          );
        }
      } catch (error) {
        // Any trace the runtime cannot read or parse fails the audit, whoever awaits this call (a server's is not awaited).
        failure = error;
        throw error;
      }
    },
    observedMounts: async () => {
      if (failure !== null) throw failure;
      return [...paths].sort();
    },
    // `strace` reports every traced syscall of the call, so the trace has no canaries to count (Story 1.81).
    channel: () => ({ canariesSent: 0, canariesDelivered: 0, logReportedLoss: false }),
    release: () => {},
  };
}

/**
 * What the status shim recorded for a call's target, the file removed once
 * read: whether the shim started the target at all (a Bubblewrap that could
 * not set up its namespace ran nothing) and the signal that ended it, if a
 * signal did. A call with no status file (Seatbelt) counts as started.
 */
function recordedStatus(statusFile, statusKey = null) {
  if (statusFile === null) return { started: true, signal: null };
  let text;
  try {
    text = fs.readFileSync(statusFile, 'utf8');
  } catch {
    return { started: false, signal: null };
  }
  fs.rmSync(statusFile, { force: true });
  if (statusKey !== null) {
    if (text === `${JSON.stringify({ secret: statusKey })}\n`) return { started: false, signal: null, valid: true };
    try {
      const { mac, ...status } = JSON.parse(text);
      const expected = signedStatus(statusKey, status).mac;
      if (
        status.started === true &&
        (status.complete === undefined || status.complete === true) &&
        (status.signal === undefined || os.constants.signals[status.signal] !== undefined) &&
        typeof mac === 'string' &&
        /^[0-9a-f]{64}$/.test(mac) &&
        crypto.timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(expected, 'hex'))
      )
        return { started: true, signal: status.signal ?? null, valid: true, complete: status.complete === true };
    } catch {
      // An invalid or unfinished status has no authority over the target's outcome.
    }
    return { started: true, signal: null, valid: false };
  }
  try {
    const { started, signal } = JSON.parse(text);
    return { started: started === true, signal: typeof signal === 'string' && os.constants.signals[signal] !== undefined ? signal : null };
  } catch {
    return { started: false, signal: null };
  }
}

/**
 * A private temp directory for one confined call, joined to the run's
 * `scratch` while it exists: a confined target writes nothing outside its
 * workspace, so the system's temp directory is closed to it (read-only under
 * Bubblewrap, denied under Seatbelt), and this is where TMPDIR, TMP and TEMP
 * point it instead. Its real path, so both mechanisms name it one way.
 */
function callTemporary(scratch) {
  const directory = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'tea-evaluate-target-tmp-')));
  scratch.push(directory);
  return directory;
}

/** The XDG base directories of a private home, relative to it, each made with the home. */
const HOME_XDG_DIRECTORIES = { XDG_CONFIG_HOME: '.config', XDG_CACHE_HOME: '.cache', XDG_DATA_HOME: path.join('.local', 'share') };

/**
 * Sets a real directory's mode to exactly 700 without following a link, for a directory whose own mode bits leave the owner
 * no way to open it. A link swapped in for the directory is never followed: `chmod -h` on macOS, and on Linux a `chmod`
 * through the descriptor of an `O_PATH | O_NOFOLLOW` open whose identity is the one `lstat` saw. The mode is never copied
 * from the entry, since what an agent left there names what a path `chmod` would give an outside directory.
 */
function chmodDirectoryNoFollow(directory, before) {
  if (process.platform === 'darwin') {
    execFileSync('/bin/chmod', ['-h', '700', directory], { stdio: 'ignore' });
    return;
  }
  const O_PATH = 0o1000_0000;
  const descriptor = fs.openSync(directory, O_PATH | fs.constants.O_NOFOLLOW | fs.constants.O_DIRECTORY);
  try {
    const opened = fs.fstatSync(descriptor);
    if (opened.dev !== before.dev || opened.ino !== before.ino) throw new Error('replaced');
    fs.chmodSync(`/proc/self/fd/${descriptor}`, 0o700);
  } finally {
    fs.closeSync(descriptor);
  }
}

/**
 * Gives the owner full access to `directory` and every directory under it, so
 * it can be removed: each directory is opened up before it is read, and one
 * that still cannot be read is skipped, so a single unreadable directory a
 * process left behind cannot keep the rest locked. It follows no link: an
 * entry is opened up only when it is a real directory (`O_NOFOLLOW`, and the
 * descriptor's identity is the one `lstat` saw), the mode is set through the
 * descriptor, and the directory is read only while its path still names that
 * directory, so a process that swaps an entry for a link to a directory outside
 * cannot have the outside directory's mode changed or its tree walked.
 */
function unlockDirectories(directory) {
  let descriptor;
  try {
    const before = fs.lstatSync(directory);
    if (!before.isDirectory()) return;
    const open = () => fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    try {
      descriptor = open();
    } catch (error) {
      if (error.code !== 'EACCES') throw error;
      // A directory with no read bit cannot be opened, so it is opened up to exactly 700 without following a link and
      // opened again; the descriptor's identity is checked below.
      chmodDirectoryNoFollow(directory, before);
      descriptor = open();
    }
    const opened = fs.fstatSync(descriptor);
    if (opened.dev !== before.dev || opened.ino !== before.ino) throw new Error('replaced');
    fs.fchmodSync(descriptor, (opened.mode & 0o7777) | 0o700);
  } catch {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    return;
  }
  try {
    const opened = fs.fstatSync(descriptor);
    const same = () => {
      try {
        const now = fs.lstatSync(directory);
        return now.isDirectory() && now.dev === opened.dev && now.ino === opened.ino;
      } catch {
        return false;
      }
    };
    if (!same()) return;
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    // The listing came from the path, so it counts only while the path still names the directory that was opened.
    if (!same()) return;
    for (const entry of entries) {
      if (entry.isDirectory() && same()) unlockDirectories(path.join(directory, entry.name));
    }
  } finally {
    fs.closeSync(descriptor);
  }
}

/** The XDG base directories of a home, made inside it. */
function makeHomeLayout(home) {
  for (const relative of Object.values(HOME_XDG_DIRECTORIES)) fs.mkdirSync(path.join(home, relative), { recursive: true });
}

/**
 * The links a home carries for the logins a run grants (Story 1.113): one for each distinct login file and the location the agent
 * looks for it, so two entries that declare one login share one link.
 *
 * @param {Array<{ login: string, file: string|null }>} logins `selectConfinement`'s `logins`
 * @returns {Array<{ relative: string, target: string }>}
 */
function loginLinksOf(logins) {
  const links = new Map();
  for (const { login, file } of logins) {
    if (file === null) continue;
    const relative = LOGIN_ADAPTERS[login].homeFile;
    links.set(JSON.stringify([relative, file]), { relative, target: file });
  }
  return [...links.values()];
}

/**
 * The private home of one confined sandbox, joined to the run's `scratch` so
 * the run removes it however it ends: an agent CLI keeps its session and
 * settings state under `HOME` and the XDG base directories, which the confined
 * target could otherwise not write. It sits beneath the run's private parent
 * (`scratch.privateParent`, which `workspace.js` `makePrivateParent` makes and
 * the run removes), where the sandbox withholds everything but its own home,
 * so no other home (a stage's, another trial's, another run's) is reachable
 * from it; a list with no parent keeps the home in the system temp directory.
 * Its real path, so both mechanisms name it one way, with the XDG base
 * directories made inside it.
 * `links` (`{ relative, target }`) plants a link at `relative` in the home to the host's login file `target`.
 */
function makeTargetHome(scratch, links = []) {
  const directory = fs.realpathSync.native(fs.mkdtempSync(path.join(scratch.privateParent ?? os.tmpdir(), 'tea-evaluate-target-home-')));
  scratch.push(directory);
  makeHomeLayout(directory);
  // Each login file a registry entry's `login` grants (Story 1.113) is a link in the home that names the host's real file, where
  // the agent CLI looks for it; the target reads the real file through the link and cannot write it.
  for (const { relative, target } of links) {
    fs.mkdirSync(path.dirname(path.join(directory, relative)), { recursive: true });
    fs.symlinkSync(target, path.join(directory, relative));
  }
  return directory;
}

/**
 * The private directory one audited sandbox keeps its files in (the log
 * stream's output and the sentinels it reads under Seatbelt, each call's trace
 * under Bubblewrap), joined to the run's `scratch`, beneath the run's private
 * parent, which every target withholds, so no target can read, write or
 * replace what the runtime reads of the audit. Its real path, so the paths
 * the kernel reports match the paths the runtime wrote.
 */
function makeAuditDirectory(scratch) {
  // Outside the private parent no target would be kept from reading it, so there is none to fall back to.
  if (typeof scratch.privateParent !== 'string')
    throw new ConfinementError("the audit needs the run's private parent directory, which the run has not made");
  const directory = fs.realpathSync.native(fs.mkdtempSync(path.join(scratch.privateParent, 'tea-evaluate-audit-')));
  scratch.push(directory);
  return directory;
}

/**
 * Removes a private home the sandbox no longer uses (after a reset made a new
 * one, or when its trial ended). The home is renamed out of the way first, to a
 * name no sandbox grants, so a process an earlier arm left running, whose
 * profile names the old path, cannot reach the directory while it is opened up
 * and removed; where the rename fails the home is removed in place.
 */
function releaseTargetHome(scratch, home) {
  let retired = home;
  try {
    retired = path.join(path.dirname(home), `tea-evaluate-target-retired-${crypto.randomBytes(6).toString('hex')}`);
    fs.renameSync(home, retired);
    const at = scratch.indexOf(home);
    if (at !== -1) scratch[at] = retired;
  } catch {
    retired = home;
  }
  releaseTemporary(scratch, retired);
}

/** Removes a call's temp directory or a private home, write bits restored first; one a process left unremovable stays in `scratch` for the run's own cleanup. */
function releaseTemporary(scratch, directory) {
  try {
    unlockDirectories(directory);
    fs.rmSync(directory, { recursive: true, force: true });
  } catch {
    return;
  }
  const at = scratch.indexOf(directory);
  if (at !== -1) scratch.splice(at, 1);
}

/**
 * `env` with the temp-directory variables naming the call's own directory and,
 * for a sandbox with a private home, `HOME` naming it and the XDG base
 * directories naming their directories inside it, whatever the host or the registry entry's `environmentKeys` hold.
 */
function withTemporary(env, directory, home = null) {
  const confined = { ...env, TMPDIR: directory, TMP: directory, TEMP: directory };
  if (home === null) return confined;
  const xdg = Object.fromEntries(Object.entries(HOME_XDG_DIRECTORIES).map(([name, relative]) => [name, path.join(home, relative)]));
  return { ...confined, HOME: home, ...xdg };
}

/**
 * A call's egress proxy (Story 1.83), or `null` when the call gets none: only a Bubblewrap call whose entries authorize at least one
 * host has a route out. The proxy's socket sits in a private directory of the call beneath the run's private parent (the system's temp
 * directory when the list has none, or `/tmp` when that leaves no room for a socket path), on the run's scratch list, so a signal that
 * ends the run removes it with the rest of the scratch and a run killed outright leaves it to the recovery of a dead run's private
 * parent. The authorization stays in this process's memory and no file carries it.
 *
 * @param {object} sandbox the call's `targetSandbox`
 * @param {string[]} scratch the run's scratch list
 * @param {object[]} authorizations the call's egress authorizations (`confinement-egress.js` `egressAuthorization`)
 * @returns {Promise<{ socket: string, close: () => Promise<void> } | null>}
 */
async function openEgress(sandbox, scratch, authorizations) {
  if (sandbox.mode !== 'bubblewrap' || authorizations.length === 0) return null;
  const { evaluateTarget } = await loadEngine();
  const fits = (base) => Buffer.byteLength(path.join(base, 'tea-egress-XXXXXX', EGRESS_SOCKET_NAME)) <= EGRESS_SOCKET_PATH_BYTES;
  const temp = fs.realpathSync.native(os.tmpdir());
  const base = typeof scratch.privateParent === 'string' ? scratch.privateParent : fits(temp) ? temp : '/tmp';
  const made = fs.mkdtempSync(path.join(base, 'tea-egress-'));
  scratch.push(made);
  const directory = fs.realpathSync.native(made);
  scratch[scratch.indexOf(made)] = directory;
  const socket = path.join(directory, EGRESS_SOCKET_NAME);
  let proxy = null;
  const release = async () => {
    await proxy?.close();
    releaseTemporary(scratch, directory);
  };
  try {
    if (Buffer.byteLength(socket) > EGRESS_SOCKET_PATH_BYTES) {
      throw new ConfinementError(
        `the egress socket's path ${JSON.stringify(socket)} is longer than ${EGRESS_SOCKET_PATH_BYTES} bytes, which a Unix socket cannot bind`,
      );
    }
    proxy = await startEgress({
      socketPath: socket,
      authorizations,
      evaluateTarget,
      onRefusal: (refusal) => sandbox.noteEgressRefusal(refusal),
    });
  } catch (error) {
    await release();
    throw error;
  }
  return { socket, close: release };
}

/**
 * eval-quality's command mechanism with every process started confined: the
 * request's target and arguments become the mechanism's command, and a
 * request naming `portFile` (a started HTTP server's) may also write the
 * private directory that file sits in. Each call gets a private temp
 * directory (`callTemporary`), removed once the call ends. A target a signal
 * ended keeps the exit eval-quality gives one, the signal's number negated,
 * under Bubblewrap too.
 *
 * Under Bubblewrap a target has a network namespace of its own, so the
 * mechanism `bridges`: a call that names `bridge` (the Unix socket a started
 * HTTP server's shim serves, in a private directory the caller made, which
 * the call may write) is the only one whose server the runtime can reach, and
 * the server call asks `bridges` before it makes one (`http-target.js`).
 */
function confinedCommandMechanism(base, sandbox, systemPathsOf = () => [], scratch = [], egressOf = () => []) {
  /** One call's attempts: the call is made again over its own list of sockets when Bubblewrap could not start over one that went away. */
  const attempts = async (request, signal, egress) => {
    const bridge = typeof request.bridge === 'string' ? request.bridge : null;
    const writable = [
      ...(typeof request.portFile === 'string' ? [path.dirname(request.portFile)] : []),
      ...(bridge === null ? [] : [path.dirname(bridge)]),
    ];
    // The list of sockets a call is made again over: the first start asks for one, a later start keeps its own.
    let sockets = null;
    for (;;) {
      const temporary = callTemporary(scratch);
      let wrapped = null;
      let started = false;
      let read = false;
      try {
        const environment = withTemporary(request.env, temporary, sandbox.home ?? null);
        wrapped = sandbox.wrap(
          request.target,
          [...request.subcommandPath, ...request.argv],
          [...writable, temporary],
          systemPathsOf(request.target),
          { bridge, sockets, environment, egress, listenPort: Number.isInteger(request.listenPort) ? request.listenPort : null },
        );
        const result = await base.run(
          {
            ...request,
            target: wrapped.target,
            subcommandPath: [],
            argv: wrapped.args,
            env: environment,
          },
          signal,
        );
        const status = recordedStatus(wrapped.statusFile, wrapped.statusKey);
        read = true;
        started = status.started;
        if (status.valid === false) throw new ConfinementError('the confined target status failed integrity verification');
        if (!status.started) {
          const again = socketsToRetry(wrapped, signal, status);
          if (again !== null) {
            sockets = again;
            continue;
          }
          // Bubblewrap exited before its shim ran: the exit code is its own, not a behavior of the target.
          const said = stderrTail(result?.stderr?.value ?? result?.stderr);
          throw new ConfinementError(
            `${MECHANISM_NAMES.bubblewrap} could not start the target ${JSON.stringify(request.target)}${said ? `: ${said}` : ''}`,
          );
        }
        if (status.valid === true && status.complete !== true)
          throw new ConfinementError('the confined target status failed integrity verification');
        return status.signal === null ? result : { ...result, exitCode: -os.constants.signals[status.signal] };
      } finally {
        // What the call's processes opened is read however the call ended; a call that never started has nothing to read.
        if (wrapped !== null && !read) started = recordedStatus(wrapped.statusFile, wrapped.statusKey).started;
        await sandbox.collect?.(wrapped, { started });
        releaseSocketFile(wrapped);
        releaseTemporary(scratch, temporary);
      }
    }
  };
  return {
    bridges: sandbox.mode === 'bubblewrap',
    async run(request, signal) {
      // The call's route out, if its entries authorize any host: one proxy for every attempt, closed however the call ends.
      const egress = await openEgress(sandbox, scratch, egressOf(request.target));
      try {
        return await attempts(request, signal, egress?.socket ?? null);
      } finally {
        await egress?.close();
      }
    },
    readArtifact(absolute, maxOutputBytes) {
      return base.readArtifact(absolute, maxOutputBytes);
    },
  };
}

/**
 * The sockets a call whose Bubblewrap never started its shim is made again over, or `null` when it is not made again (Story
 * 1.82). A socket it hid went away between the list and the mount, and Bubblewrap cannot make a mount point of a file that is
 * gone on a read-only `/`, so it refuses to start. The call is made again over its own list without the sockets that are no
 * longer socket files, so a socket another process creates meanwhile cannot join it and each
 * start has fewer than the one before: the starts are bounded by the list. Only a status file that still holds the runtime's own
 * untouched line (`started === false`) is a call that never started, so a target that ran, and one that damaged its status file,
 * is never run again, and neither is a run that was aborted or a call with no hidden socket that went away.
 */
function socketsToRetry(wrapped, signal, status) {
  if (status?.started !== false || status.valid !== true || signal?.aborted === true) return null;
  const hidden = wrapped.hiddenSockets ?? [];
  const remaining = hidden.filter((socket) => isSocketFile(socket));
  return remaining.length < hidden.length ? remaining : null;
}

/** Removes the file that carried a call's socket mounts, once the call has ended. */
function releaseSocketFile(wrapped) {
  if (typeof wrapped?.socketFile === 'string') fs.rmSync(wrapped.socketFile, { force: true });
}

/**
 * eval-quality's stdio MCP mechanism with the tool server started confined,
 * with a private temp directory as a command's. A session the server's process
 * ended before it answered reports that process's exit, which under Bubblewrap
 * is `128 + n` for a signal `n`, so it is read from the status file the shim
 * left and recorded as the signal's number negated, as a command's is; an
 * answered call has no exit, and the status a signal left is only removed.
 */
function confinedMcpMechanism(base, sandbox, systemPathsOf = () => [], scratch = [], egressOf = () => []) {
  const attempts = async (request, signal, egress) => {
    let sockets = null;
    for (;;) {
      const temporary = callTemporary(scratch);
      let wrapped = null;
      let status = null;
      try {
        const environment = withTemporary(request.env, temporary, sandbox.home ?? null);
        wrapped = sandbox.wrap(request.target, request.targetArgs, [temporary], systemPathsOf(request.target), {
          sockets,
          environment,
          egress,
        });
        let result;
        try {
          result = await base.callTool(
            {
              ...request,
              target: wrapped.target,
              targetArgs: wrapped.args,
              env: environment,
            },
            signal,
          );
        } catch (error) {
          // A server whose Bubblewrap never started ends the session before it answers, which the adapter throws.
          status = recordedStatus(wrapped.statusFile, wrapped.statusKey);
          const again = socketsToRetry(wrapped, signal, status);
          if (again !== null) {
            sockets = again;
            continue;
          }
          throw error;
        }
        status = recordedStatus(wrapped.statusFile, wrapped.statusKey);
        if (status.valid === false) throw new ConfinementError('the confined tool server status failed integrity verification');
        if (typeof result.exitCode !== 'number') return result;
        if (!status.started) {
          const again = socketsToRetry(wrapped, signal, status);
          if (again !== null) {
            sockets = again;
            continue;
          }
          // With no start mark the exit code may be Bubblewrap's own, so it says nothing about the tool server.
          throw new ConfinementError(
            `the status file of the confined tool server ${JSON.stringify(request.target)} holds no start mark, so its exit code ${result.exitCode} cannot be told from ${MECHANISM_NAMES.bubblewrap}'s own`,
          );
        }
        if (status.valid === true && status.complete !== true)
          throw new ConfinementError('the confined tool server status failed integrity verification');
        return status.signal === null ? result : { ...result, exitCode: -os.constants.signals[status.signal] };
      } finally {
        // A call that threw before its status was read left the file behind: read it now, so a started target is still held to its trace.
        if (wrapped !== null && status === null) status = recordedStatus(wrapped.statusFile, wrapped.statusKey);
        await sandbox.collect?.(wrapped, { started: status?.started === true });
        releaseSocketFile(wrapped);
        releaseTemporary(scratch, temporary);
      }
    }
  };
  return {
    async callTool(request, signal) {
      const egress = await openEgress(sandbox, scratch, egressOf(request.target));
      try {
        return await attempts(request, signal, egress?.socket ?? null);
      } finally {
        await egress?.close();
      }
    },
  };
}

/**
 * The forbidden-input note of a run's isolation manifests: what the runtime
 * hands the target, and the confinement that withheld the rest, or, for a run
 * that opted out, that none did.
 *
 * @param {object|null} confinement
 * @param {Array<{ interfaceId: string, hosts: string[] }>} [egress] the registry entries that authorize hosts, with their `host:port` items (Story 1.83)
 * @param {Array<{ interfaceId: string, login: string, variable: string|null, file: string|null }>} [logins] the entries that declare a login and what each was given, by the variable's name and the file's path (Story 1.113)
 * @returns {string}
 */
function forbiddenInputNote(confinement, egress = [], logins = []) {
  const handed =
    "Withheld from what the runtime hands the target: each trial runs in a disposable workspace that leaves out the evaluation folder, and every request carries only the interaction plan's literal bindings and the values its captured bindings read from the target's own earlier observations in the same trial.";
  // What each entry's `login` hands its processes, named by the variable and the path, with no value (Story 1.113).
  const given = logins
    .map((login) => {
      const sources = [
        ...(login.variable === null ? [] : [`the environment variable ${login.variable}`]),
        ...(login.file === null ? [] : [`the file ${login.file}, read-only`]),
      ];
      return sources.length === 0
        ? ''
        : ` The registry entry ${JSON.stringify(login.interfaceId)} declares "login": ${JSON.stringify(login.login)} and hands its processes ${sources.join(' and ')}; no record holds the variable's value or a string of the file.`;
    })
    .join('');
  if (!confines(confinement)) {
    return `${handed} The evaluation opted out of file-system confinement ("confinement": false), so the runtime does not sandbox the target's file system and a target that searches for the evaluation folder can reach it.${given}`;
  }
  const shared =
    confinement.mode === 'bubblewrap' && egress.length > 0
      ? ` The registry entries ${egress.map((entry) => `${JSON.stringify(entry.interfaceId)} (${entry.hosts.join(', ')})`).join(', ')} authorize the hosts named, which their processes reach through the runtime's egress proxy and no other way; every target runs in a network namespace of its own with a loopback only, so none has a route to the host's abstract Unix sockets.`
      : '';
  return `${handed} Withheld as well by ${MECHANISM_NAMES[confinement.mode]} file-system confinement: every process the target starts, those left running after it exits included, is denied each read and write of the evaluation folder and of the project's git directory (its worktree's own entry excepted) and each write outside its workspace.${shared}${given}`;
}

module.exports = {
  LOGIN_ADAPTERS,
  MECHANISM_NAMES,
  LOG_ENV,
  PLATFORM_ENV,
  confinedCommandMechanism,
  confinedMcpMechanism,
  confines,
  forbiddenInputNote,
  hooksDirectory,
  layerPrefix,
  loginLinksOf,
  loginsOf,
  chmodDirectoryNoFollow,
  makeAuditDirectory,
  makeTargetHome,
  nodeInstallRoot,
  probeObserver,
  releaseTargetHome,
  releaseTemporary,
  unlockDirectories,
  selectConfinement,
  seatbeltTargetProfile,
  targetSandbox,
};
