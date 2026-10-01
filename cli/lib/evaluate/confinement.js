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
 *                (the file a started HTTP server reports its port in, the audit
 *                report below) and nothing else, and can neither read nor write
 *                the evaluation folder (`contract.json`, `probes/`, `runs/`,
 *                `evaluator/`, everything under it), nor read or write the
 *                project's git directory, the worktree's own entry in it
 *                excepted (the workspace's git reads a private repository
 *                beside the checkout, `workspace.js`'s `buildWithheldRepository`,
 *                whose history holds the evaluation folder as an empty tree),
 *                nor read, write or connect to anything under the run's
 *                private parent directory (`workspace.js` `makePrivateParent`),
 *                where the evaluation layer keeps the bridge's configuration
 *                and admission token and its socket and the evaluator, judge
 *                and command-evaluator working directories (AD-21).
 *                Reads elsewhere are left to the audit: node, git and a
 *                target's own toolchain read from the system.
 *   layer        every other process the run starts to run adopter or agent
 *                code (a `command` evaluator, a sealed-brief agent and the
 *                bridge relay it starts, the rubric judge, the evaluation's HTTP
 *                port) runs with the evaluation folder read-only, so no process
 *                of the run can swap a file of the evaluation layer under
 *                `evaluator/` between the runtime's re-read of it and the
 *                evaluator's launch, or rewrite the evidence under `runs/`
 *                (the runtime's own writes there are the only ones). The whole
 *                folder is held, and not `evaluator/` alone, since a folder
 *                with no `evaluator/` has nothing Bubblewrap could bind in
 *                its place and a process could make one.
 *   audit        each trial's Node processes load `confinement-guard.cjs`
 *                through NODE_OPTIONS, which appends every path they open
 *                outside what the trial was granted (its workspace, the system
 *                paths its registry entry declares in `systemPaths`, the Node
 *                installation and the operating system's own directories) to a
 *                report in a private directory. The trial's isolation manifest
 *                lists those paths as `observedMounts`, which eval-quality holds
 *                against the allowed mounts and records as an isolation
 *                violation. The report is written by the target's own processes,
 *                so it is an audit of what they did, and only Node processes
 *                write it; the enforcement is the mechanism above.
 *
 * `TEA_EVALUATE_CONFINEMENT_PLATFORM` names the platform the mechanism is
 * chosen for, in place of the host's, so a case can stand in for a platform
 * without one; it can only take a mechanism away, never add one the host
 * lacks, since each mechanism's executable is looked for on this host.
 */

'use strict';

const crypto = require('node:crypto');
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

/** Each mechanism as a sentence names it. */
const MECHANISM_NAMES = Object.freeze({ seatbelt: 'macOS Seatbelt (sandbox-exec)', bubblewrap: 'Linux Bubblewrap (bwrap)' });

const SANDBOX_EXEC = '/usr/bin/sandbox-exec';
const PLATFORM_ENV = 'TEA_EVALUATE_CONFINEMENT_PLATFORM';

/** The preload every Node process of a trial loads, and the variable carrying its report path and grants. */
const GUARD_PATH = path.join(__dirname, 'confinement-guard.cjs');
/** What Bubblewrap starts in a target's place, so a signal that ends the target is not read as an exit code. */
const STATUS_SHIM = path.join(__dirname, 'confinement-status.cjs');
const AUDIT_ENV = 'TEA_EVALUATE_CONFINEMENT_AUDIT';

/** What most often keeps a present mechanism from confining, named in the probe's refusal. */
const PROBE_HINTS = Object.freeze({
  seatbelt:
    'sandbox-exec cannot apply a profile inside a Seatbelt sandbox that restricts anything (sandbox_apply: Operation not permitted), so a tea-evaluate started from a sandboxed shell, an agent tool say, is refused',
  bubblewrap:
    'Bubblewrap needs unprivileged user namespaces, which a container, a hardened kernel or an AppArmor restriction (kernel.apparmor_restrict_unprivileged_userns) can forbid',
});

/** How much of a report the runtime reads. */
const REPORT_READ_BYTES = 4 * 1024 * 1024;

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

/** The profile a Seatbelt process of the evaluation layer runs under: everything allowed, and no write under the evaluation folder. */
function seatbeltLayerProfile(evaluationFolder) {
  const denied = spellings(evaluationFolder).map((entry) => `(subpath "${assertProfileSafePath(entry, refuseUnsafePath)}")`);
  return ['(version 1)', '(allow default)', `(deny file-write* ${denied.join(' ')})`, ''].join('\n');
}

/**
 * The profile a target runs under. Writes are denied outright and allowed
 * again under the workspace and the runtime's private directories; the
 * project's git directory is denied reads and writes except the worktree's own
 * metadata directory, which stays readable; the evaluation folder's denial of
 * reads and writes comes last, so no allowance above it can reach inside it.
 * The run's private parent directory is denied reads and writes and a `connect()`
 * to a unix socket under it (a denied read does not stop a connection), after
 * every allowance.
 */
function seatbeltTargetProfile({ workspace, writable, evaluationFolder, git = null, privateParent = null }) {
  const allowed = [workspace, ...writable]
    .flatMap(spellings)
    .map((entry) => `(subpath "${assertProfileSafePath(entry, refuseUnsafePath)}")`);
  const subpaths = (candidate) => spellings(candidate).map((entry) => `(subpath "${assertProfileSafePath(entry, refuseUnsafePath)}")`);
  const withheld = subpaths(evaluationFolder);
  // Git resolves the path of the worktree's metadata directory component by component (`lstat`), so the git directory
  // and its `worktrees/` answer a metadata request, which tells nothing a path does not already say.
  const literals = (candidate) => spellings(candidate).map((entry) => `(literal "${assertProfileSafePath(entry, refuseUnsafePath)}")`);
  const gitRules =
    git === null
      ? []
      : [
          `(deny file-read* file-write*\n  ${[...subpaths(git.directory), ...git.alternates.flatMap(subpaths)].join('\n  ')})`,
          ...(git.metadata === null
            ? []
            : [
                `(allow file-read*\n  ${subpaths(git.metadata).join('\n  ')})`,
                `(allow file-read-metadata\n  ${[...literals(git.directory), ...literals(path.dirname(git.metadata))].join('\n  ')})`,
              ]),
        ];
  const privateRules =
    privateParent === null
      ? []
      : [
          `(deny file-read* file-write*\n  ${subpaths(privateParent).join('\n  ')})`,
          `(deny network-outbound\n  ${spellings(privateParent)
            .map((entry) => `(remote unix-socket (subpath "${assertProfileSafePath(entry, refuseUnsafePath)}"))`)
            .join('\n  ')})`,
        ];
  return [
    '(version 1)',
    '(allow default)',
    '(deny file-write*)',
    `(allow file-write*\n  ${[...allowed, ...SEATBELT_DEVICE_WRITES].join('\n  ')})`,
    ...gitRules,
    ...privateRules,
    `(deny file-read* file-write*\n  ${withheld.join('\n  ')})`,
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
 * The Bubblewrap argument vector a target runs under, before its own command:
 * an unprivileged user namespace, `/` read-only, a synthetic `/dev` (the real
 * one's device nodes cannot be opened from the namespace), the workspace and
 * the private directories writable, the project's git directory covered by an
 * empty file system with the worktree's own metadata directory bound back in
 * read-only, the run's private parent directory covered the same way, and the evaluation
 * folder covered by an empty read-only file
 * system, so nothing under it can be read or written. No new network
 * namespace: a started HTTP server listens where the runtime reaches it.
 */
function bubblewrapTargetArguments({ executable, workspace, writable, evaluationFolder, git = null, privateParent = null }) {
  const binds = [workspace, ...writable].flatMap((entry) => {
    const real = assertProfileSafePath(spellings(entry).at(-1), refuseUnsafePath);
    return ['--bind', real, real];
  });
  const realOf = (candidate) => assertProfileSafePath(spellings(candidate).at(-1), refuseUnsafePath);
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
  const privateArguments = privateParent === null ? [] : ['--tmpfs', realOf(privateParent), '--remount-ro', realOf(privateParent)];
  const withheld = realOf(evaluationFolder);
  return [
    executable,
    '--unshare-user',
    '--ro-bind',
    '/',
    '/',
    '--dev',
    '/dev',
    ...bubblewrapIsolation(),
    ...binds,
    ...gitArguments,
    ...privateArguments,
    '--tmpfs',
    withheld,
    '--remount-ro',
    withheld,
    '--',
  ];
}

/** The Bubblewrap argument vector a process of the evaluation layer runs under: `/` writable, the evaluation folder read-only. */
function bubblewrapLayerArguments({ executable, evaluationFolder }) {
  const protectedDirectory = assertProfileSafePath(spellings(evaluationFolder).at(-1), refuseUnsafePath);
  return [
    executable,
    '--unshare-user',
    '--bind',
    '/',
    '/',
    '--dev',
    '/dev',
    ...bubblewrapIsolation(),
    '--ro-bind',
    protectedDirectory,
    protectedDirectory,
    '--',
  ];
}

/**
 * Whether the mechanism confines a trivial process here, or why not: selection
 * says the executable exists, this says the kernel lets it work.
 */
function probeMechanism({ mode, executable }) {
  const vector =
    mode === 'seatbelt'
      ? [executable, '-p', '(version 1)\n(allow default)\n(deny file-write*)\n']
      : [executable, '--unshare-user', '--ro-bind', '/', '/', '--dev', '/dev', ...bubblewrapIsolation(), '--'];
  const probe = probeTrivialProcess({ vector: [...vector, ...TRIVIAL_PROCESS] });
  if (probe.ok) return null;
  if (probe.error) return `${probe.error.code ?? probe.error.message}`;
  return `a trivial process under it ended ${probe.status === null ? `by ${probe.signal}` : `with exit ${probe.status}`}${probe.tail ? ` (${probe.tail})` : ''}`;
}

/**
 * The run's confinement: `{ mode: 'opt-out' }` for an evaluation that opts
 * out, the mechanism this host confines with, or `{ refusal }` saying why
 * none can (exit 12).
 *
 * @param {object} options
 * @param {object} options.evaluation the parsed `evaluation.json`
 * @param {string} options.folder the resolved evaluation folder
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {string} [options.platform]
 * @returns {{ mode: string, executable?: string, evaluationFolder: string } | { refusal: string }}
 */
function selectConfinement({ evaluation, folder, env = process.env, platform = process.platform }) {
  const evaluationFolder = path.resolve(folder);
  if (evaluation?.confinement === false) return { mode: 'opt-out', evaluationFolder };
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
  // Every workspace, audit report and private directory a target is granted is made under the temp directory.
  const unsafeTemp = spellings(temp).find((entry) => !isProfileSafePath(entry));
  if (unsafeTemp !== undefined) {
    return {
      refusal: `the temp directory ${JSON.stringify(unsafeTemp)} holds a quote, a backslash or a line break (or another control character), which no confinement profile can carry, and every workspace is made under it; point TMPDIR elsewhere, ${optOut}`,
    };
  }
  return { ...mechanism, evaluationFolder };
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
  if (confinement.mode === 'seatbelt') return [confinement.executable, '-p', seatbeltLayerProfile(confinement.evaluationFolder)];
  return bubblewrapLayerArguments(confinement);
}

/**
 * What one workspace's target processes run under: `wrap` turns a target and
 * its arguments into the mechanism's command, `environment` adds the audit's
 * preload to a Node process's environment when the port audits, and
 * `observedMounts` reads the paths the audit reported.
 *
 * @param {object} options
 * @param {object} options.confinement `selectConfinement`'s answer for a run that confines
 * @param {string} options.workspace the workspace's checkout, the one tree the target may write
 * @param {{ directory: string, metadata?: string|null, view?: string|null, alternates?: string[] }|null} [options.git] the
 *   project's git directory and the object directories it borrows from (`alternates`), which the target can neither read
 *   nor write, the worktree's own metadata directory inside the first, which it may read, and the private repository
 *   (`view`) its git reads; `null` for a workspace in no repository
 * @param {string|null} [options.privateParent] the run's private parent directory (`workspace.js` `makePrivateParent`),
 *   which the target can neither read, write nor connect a socket under; `null` where the run made none
 * @param {string|null} [options.report] the audit report's path, `null` for a port that does not audit
 * @param {string|null} [options.status] under Bubblewrap, a private directory where the status of a target a signal
 *   ended is written (`confinement-status.cjs`)
 */
function targetSandbox({ confinement, workspace, git: gitAccess = null, privateParent = null, report = null, status = null }) {
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
  if (privateParent !== null) {
    if (typeof privateParent !== 'string' || privateParent.length === 0) {
      throw new ConfinementError("the run's private parent directory must be a path");
    }
    if (spellings(workspace).some((entry) => spellings(privateParent).some((withheld) => isInside(withheld, entry)))) {
      throw new ConfinementError(`the workspace ${workspace} is inside ${privateParent}, which the confinement withholds from the target`);
    }
  }
  if (confinement.mode === 'bubblewrap' && (typeof status !== 'string' || status.length === 0)) {
    throw new ConfinementError('a target confined by Bubblewrap needs a status directory');
  }
  let calls = 0;
  let reportSize = 0;
  let tampered = false;
  return {
    mode: confinement.mode,
    /**
     * The command that runs `target args` confined, `writable` naming the
     * private directories this call's processes may write besides the
     * workspace; under Bubblewrap, with the file the status shim writes a
     * signal to, which `recordedStatus` reads.
     */
    wrap(target, args, writable = []) {
      const grants = [...writable, ...(report === null ? [] : [report])];
      if (confinement.mode === 'seatbelt') {
        const profile = seatbeltTargetProfile({ workspace, writable: grants, evaluationFolder, git, privateParent });
        return { target: confinement.executable, args: ['-p', profile, target, ...args], statusFile: null };
      }
      calls += 1;
      // A name the target cannot guess, made here and the only status file it may write, so no process can plant the
      // status of a call it is not part of.
      const statusFile = path.join(status, `status-${calls}-${crypto.randomBytes(8).toString('hex')}.json`);
      fs.writeFileSync(statusFile, '', { mode: 0o600 });
      const vector = bubblewrapTargetArguments({
        executable: confinement.executable,
        workspace,
        writable: [...grants, statusFile],
        evaluationFolder,
        git,
        privateParent,
      });
      return { target: vector[0], args: [...vector.slice(1), process.execPath, STATUS_SHIM, statusFile, target, ...args], statusFile };
    },
    /**
     * `env` with the audit's preload and its grants added, for a port that
     * audits; `env` itself otherwise. `granted` names what this call's
     * processes may reach besides the workspace and the report: the system
     * paths its registry entry declares and the private directories it may
     * write.
     */
    environment(env, granted = []) {
      if (report === null) return env;
      // The worktree's own entry in the git directory and the private repository it reads are the target's to open.
      const own = git === null ? [] : [git.metadata, git.view].filter((entry) => typeof entry === 'string');
      const grants = [workspace, ...(report === null ? [] : [report]), ...granted, ...own].flatMap(spellings);
      return {
        ...env,
        NODE_OPTIONS: [env?.NODE_OPTIONS, `--require ${JSON.stringify(GUARD_PATH)}`].filter(Boolean).join(' '),
        [AUDIT_ENV]: JSON.stringify({
          report,
          granted: grants,
          withheld: [
            ...spellings(evaluationFolder),
            ...(git === null ? [] : [git.directory, ...git.alternates].flatMap(spellings)),
            ...(privateParent === null ? [] : spellings(privateParent)),
          ],
          ...(git?.metadata ? { withheldExcept: spellings(git.metadata) } : {}),
        }),
      };
    },
    /** The absolute paths the audit reported, each once, sorted; empty for a port that does not audit. */
    /**
     * Reads the report once a confined call has ended, so a report cut back
     * during that call is seen against what an earlier call left, and not
     * only against the read `observedMounts` makes at the trial's end.
     */
    settle() {
      if (report === null) return;
      const read = readConfinementReport(report, reportSize);
      if (read.paths.includes(path.resolve(report))) tampered = true;
      reportSize = Math.max(reportSize, read.size);
    },
    observedMounts() {
      if (report === null) return [];
      const read = readConfinementReport(report, reportSize);
      reportSize = Math.max(reportSize, read.size);
      const paths = tampered && !read.paths.includes(path.resolve(report)) ? [...read.paths, path.resolve(report)].sort() : read.paths;
      return paths;
    },
  };
}

/**
 * The paths an audit report names: one JSON object `{ path }` per line, each
 * path absolute. The report is the target's own processes' writing, so a
 * line that is not one is skipped, and only its first `REPORT_READ_BYTES`
 * are read.
 *
 * @param {string} report
 * @param {number} [previousSize] how long an earlier read found the report
 * @returns {{ paths: string[], size: number }}
 */
function readConfinementReport(report, previousSize = 0) {
  let text;
  let size = 0;
  try {
    const descriptor = fs.openSync(report, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    try {
      size = fs.fstatSync(descriptor).size;
      const buffer = Buffer.alloc(REPORT_READ_BYTES);
      const read = fs.readSync(descriptor, buffer, 0, REPORT_READ_BYTES, 0);
      text = buffer.subarray(0, read).toString('utf8');
    } finally {
      fs.closeSync(descriptor);
    }
  } catch {
    // The runtime made the report before any process ran; one it cannot open now was replaced or removed.
    return { paths: [path.resolve(report)], size: previousSize };
  }
  const observed = new Set();
  // A report the target's own processes made longer than the runtime reads, or shorter than a read already showed,
  // was flooded or cut back; its own path is then the mount the trial is held to.
  if (size > REPORT_READ_BYTES || size < previousSize) observed.add(path.resolve(report));
  for (const line of text.split('\n')) {
    if (line.length === 0) continue;
    try {
      const entry = JSON.parse(line);
      if (typeof entry?.path === 'string' && path.isAbsolute(entry.path) && entry.path.length > 0) observed.add(path.normalize(entry.path));
    } catch {
      // A line cut off at the read limit, or written by the target itself.
    }
  }
  return { paths: [...observed].sort(), size };
}

/**
 * What the status shim recorded for a call's target, the file removed once
 * read: whether the shim started the target at all (a Bubblewrap that could
 * not set up its namespace ran nothing) and the signal that ended it, if a
 * signal did. A call with no status file (Seatbelt) counts as started.
 */
function recordedStatus(statusFile) {
  if (statusFile === null) return { started: true, signal: null };
  let text;
  try {
    text = fs.readFileSync(statusFile, 'utf8');
  } catch {
    return { started: false, signal: null };
  }
  fs.rmSync(statusFile, { force: true });
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

/** Removes a call's temp directory; one a process left unremovable stays in `scratch` for the run's own cleanup. */
function releaseTemporary(scratch, directory) {
  try {
    fs.rmSync(directory, { recursive: true, force: true });
  } catch {
    return;
  }
  const at = scratch.indexOf(directory);
  if (at !== -1) scratch.splice(at, 1);
}

/** The call's own status file, which the shim writes and the audit therefore grants; nothing under Seatbelt. */
function statusGrant(wrapped) {
  return wrapped?.statusFile ? [wrapped.statusFile] : [];
}

/** `env` with the temp-directory variables naming the call's own directory. */
function withTemporary(env, directory) {
  return { ...env, TMPDIR: directory, TMP: directory, TEMP: directory };
}

/**
 * eval-quality's command mechanism with every process started confined: the
 * request's target and arguments become the mechanism's command, and a
 * request naming `portFile` (a started HTTP server's) may also write the
 * private directory that file sits in. Each call gets a private temp
 * directory (`callTemporary`), removed once the call ends. A target a signal
 * ended keeps the exit eval-quality gives one, the signal's number negated,
 * under Bubblewrap too.
 */
function confinedCommandMechanism(base, sandbox, systemPathsOf = () => [], scratch = []) {
  return {
    async run(request, signal) {
      const writable = typeof request.portFile === 'string' ? [path.dirname(request.portFile)] : [];
      const temporary = callTemporary(scratch);
      try {
        const wrapped = sandbox.wrap(request.target, [...request.subcommandPath, ...request.argv], [...writable, temporary]);
        const result = await base.run(
          {
            ...request,
            target: wrapped.target,
            subcommandPath: [],
            argv: wrapped.args,
            env: sandbox.environment(withTemporary(request.env, temporary), [
              ...systemPathsOf(request.target),
              ...writable,
              temporary,
              ...statusGrant(wrapped),
            ]),
          },
          signal,
        );
        const status = recordedStatus(wrapped.statusFile);
        sandbox.settle();
        if (!status.started) {
          // Bubblewrap exited before its shim ran: the exit code is its own, not a behavior of the target.
          const said = stderrTail(result?.stderr?.value ?? result?.stderr);
          throw new ConfinementError(
            `${MECHANISM_NAMES.bubblewrap} could not start the target ${JSON.stringify(request.target)}${said ? `: ${said}` : ''}`,
          );
        }
        return status.signal === null ? result : { ...result, exitCode: -os.constants.signals[status.signal] };
      } finally {
        releaseTemporary(scratch, temporary);
      }
    },
    readArtifact(absolute, maxOutputBytes) {
      return base.readArtifact(absolute, maxOutputBytes);
    },
  };
}

/**
 * eval-quality's stdio MCP mechanism with the tool server started confined,
 * with a private temp directory as a command's. A session the server's process
 * ended before it answered reports that process's exit, which under Bubblewrap
 * is `128 + n` for a signal `n`, so it is read from the status file the shim
 * left and recorded as the signal's number negated, as a command's is; an
 * answered call has no exit, and the status a signal left is only removed.
 */
function confinedMcpMechanism(base, sandbox, systemPathsOf = () => [], scratch = []) {
  return {
    async callTool(request, signal) {
      const temporary = callTemporary(scratch);
      let wrapped = null;
      let status = null;
      try {
        wrapped = sandbox.wrap(request.target, request.targetArgs, [temporary]);
        const result = await base.callTool(
          {
            ...request,
            target: wrapped.target,
            targetArgs: wrapped.args,
            env: sandbox.environment(withTemporary(request.env, temporary), [
              ...systemPathsOf(request.target),
              temporary,
              ...statusGrant(wrapped),
            ]),
          },
          signal,
        );
        status = recordedStatus(wrapped.statusFile);
        if (typeof result.exitCode !== 'number') return result;
        if (!status.started) {
          // With no start mark the exit code may be Bubblewrap's own, so it says nothing about the tool server.
          throw new ConfinementError(
            `the status file of the confined tool server ${JSON.stringify(request.target)} holds no start mark, so its exit code ${result.exitCode} cannot be told from ${MECHANISM_NAMES.bubblewrap}'s own`,
          );
        }
        return status.signal === null ? result : { ...result, exitCode: -os.constants.signals[status.signal] };
      } finally {
        if (wrapped !== null && status === null) recordedStatus(wrapped.statusFile);
        sandbox.settle();
        releaseTemporary(scratch, temporary);
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
 * @returns {string}
 */
function forbiddenInputNote(confinement) {
  const handed =
    "Withheld from what the runtime hands the target: each trial runs in a disposable workspace that leaves out the evaluation folder, and every request carries only the interaction plan's literal bindings and the values its captured bindings read from the target's own earlier observations in the same trial.";
  if (!confines(confinement)) {
    return `${handed} The evaluation opted out of file-system confinement ("confinement": false), so the runtime does not sandbox the target's file system and a target that searches for the evaluation folder can reach it.`;
  }
  return `${handed} Withheld as well by ${MECHANISM_NAMES[confinement.mode]} file-system confinement: every process the target starts, those left running after it exits included, is denied each read and write of the evaluation folder and of the project's git directory (its worktree's own entry excepted) and each write outside its workspace.`;
}

module.exports = {
  MECHANISM_NAMES,
  PLATFORM_ENV,
  confinedCommandMechanism,
  confinedMcpMechanism,
  confines,
  forbiddenInputNote,
  layerPrefix,
  selectConfinement,
  targetSandbox,
};
