/**
 * The audit half of a trial's file-system confinement (Story 1.60, AD-7,
 * AD-8): what a confined target's processes opened outside what the trial
 * granted, as the mechanism itself reports it, so a process of any language,
 * started with any environment, is seen, and no target can write what the
 * runtime reads. `confinement.js` holds the boundary and decides what each
 * sandbox grants; this module only observes.
 *
 *   Seatbelt     the target's profile reports every `file-read-data` it allows
 *                outside the grants (`with report`) and tags each file rule it
 *                holds with a random token of the sandbox (`with message`).
 *                The kernel logs a report as `Sandbox: <name>(<pid>) allow|
 *                deny(1) <operation> <real path>` with the token on the next
 *                line. A `/usr/bin/log stream` child the runtime owns writes
 *                the lines holding the token, as ndjson, straight to a file in
 *                a directory the target cannot reach (a pipe lost 850 of 3,000
 *                events while the runtime's loop was blocked; the file lost
 *                none). A barrier reads the file only after a read the runtime
 *                itself made under the same token has come back through the
 *                stream, since the stream delivers events in order. Attribution
 *                is by token alone, so other sandboxes, runs and processes
 *                never mix in. The log loses reports without a trace when the
 *                host is saturated, so a canary read of a file no target can
 *                reach is made through the same token every 50 ms while the
 *                trial runs, and the count of canaries the log delivered
 *                against the count sent says how complete the trial's
 *                reports were (Story 1.81).
 *
 *   Bubblewrap   the command runs as the child of `strace -f --seccomp-bpf`,
 *                started outside the namespace, so no target process can
 *                signal the tracer or write its trace file. The trace is read
 *                once the call ends, which ends every process the call left
 *                running (their process-id namespace goes with it).
 *                The trace holds the file syscalls, the calls that name a Unix socket file (`connect`, `sendto`, `sendmsg`, `sendmmsg`) and the bind mounts that could carry one, so a connection to a socket outside the grants is listed (Story 1.86).
 *
 * An audit that cannot confirm itself is a failure the run reports (exit 12):
 * an empty list of observed mounts is never what a broken observer returns.
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { StringDecoder } = require('node:string_decoder');
const { spawn, spawnSync } = require('node:child_process');

const { assertProfileSafePath, isInside, stderrTail } = require('../isolation-primitives');

const LOG_EXECUTABLE = '/usr/bin/log';
const TOKEN_PREFIX = 'tea-evaluate-audit-';

/** How long one sentinel read may take before it is killed. */
const SENTINEL_MS = 3000;

/** How long a `log stream` lives at most, which bounds one a killed runtime leaves behind (a trial that outlasts it exits 12). */
const LOG_TIMEOUT = '4h';

/** How often a canary read is made while a trial runs, and how many may be running at once on a host too busy to start them promptly. */
const CANARY_MS = 50;
const CANARY_IN_FLIGHT = 8;
/** The longest the runtime may go without attempting a canary before the trial counts as having missed some: a freeze, a starved host or a refused spawn all show as a gap. */
const CANARY_GAP_MS = 4 * CANARY_MS;

/** How long the barrier waits for the stream to return a read the runtime made, and how often it makes another. */
const BARRIER_MS = 10_000;
const BARRIER_STEP_MS = 200;
/** How long the probe at selection waits for the same. */
const PROBE_MS = 5000;

/** The operating system's own directories, which every process reads from. */
const SYSTEM_ROOTS = Object.freeze([
  '/System',
  '/usr',
  '/bin',
  '/sbin',
  '/dev',
  '/etc',
  '/private/etc',
  '/lib',
  '/lib32',
  '/lib64',
  '/libx32',
  '/proc',
  '/sys',
]);

/**
 * What macOS's own processes read besides `SYSTEM_ROOTS`: the zone data the C
 * library loads, the logging filter every process reads, and the library
 * directories of the interpreters the system ships.
 */
const DARWIN_SYSTEM_ROOTS = Object.freeze([
  '/private/var/db/timezone',
  '/Library/Preferences/Logging',
  '/Library/Perl',
  '/Library/Python',
  '/Library/Ruby',
]);

/**
 * The system directories a read is judged by the path the process asked for, not by where a link leads: the operating system
 * links its own files elsewhere (a stub resolver's resolv.conf, the local time zone) and no target can change them. The
 * process, kernel and device directories are not here, since a path under them leads anywhere.
 */
const REQUESTED_ROOTS = Object.freeze(['/System', '/usr', '/bin', '/sbin', '/etc', '/private/etc', '/lib', '/lib32', '/lib64', '/libx32']);

/** Paths granted exactly, never as a root: every process reads the root directory itself. */
const EXACT_GRANTS = Object.freeze(['/']);

/**
 * The directory the Node installation running `execPath` sits in: the
 * directory above its `bin/`, or the executable's own directory when that
 * would be the file system's root (a node at `/bin/node`), which would grant
 * every path, or one that holds the user's home directory (a node at
 * `~/bin/node`).
 */
function nodeInstallRoot(execPath) {
  const directory = path.dirname(path.resolve(execPath));
  const prefix = path.dirname(directory);
  if (prefix === path.parse(prefix).root) return directory;
  // A node in the user's own `bin` would grant the whole home directory, so only its directory is granted then.
  return isInside(prefix, os.homedir()) ? directory : prefix;
}

/** The monotonic clock in milliseconds, which keeps counting while the runtime is stopped. */
function monotonicMs() {
  return Number(process.hrtime.bigint()) / 1e6;
}

/** A random token no other sandbox, run or process holds. */
function auditToken() {
  return `${TOKEN_PREFIX}${crypto.randomBytes(8).toString('hex')}`;
}

// -- Seatbelt ---------------------------------------------------------------------------------------------------------

/** One Seatbelt report line: the operation it names and the path, after the process name and id. */
const REPORT_LINE =
  /^(?:\d+ duplicate reports? for )?Sandbox: .*?\((\d+)\) (allow|deny\(\d+\)) (file-read-data|file-write[a-z-]*|forbidden-link-priv<file-write\*>) ([^]*)$/;

/**
 * The reports of `token` in one ndjson line of the log, or `null` for a line
 * that is none (the stream's own header, a report of another token, a message
 * that did not come from the kernel).
 *
 * @param {string} line
 * @param {string} token
 * @returns {{ lost: true } | { operation: string, denied: boolean, path: string } | null}
 */
function parseReportLine(line, token) {
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    return null;
  }
  if (event?.eventType === 'lossEvent') return { lost: true };
  if (typeof event?.eventMessage !== 'string' || event.processImagePath !== '/kernel') return null;
  const suffix = `\n${token}`;
  if (!event.eventMessage.endsWith(suffix)) return null;
  const matched = REPORT_LINE.exec(event.eventMessage.slice(0, -suffix.length));
  if (matched === null) return null;
  // A refused hard link names its source and its target; the source is the file the target reached for.
  const named = matched[3].startsWith('forbidden-link-priv') ? /^(\S+)/.exec(matched[4])?.[1] : matched[4];
  if (named === undefined || !path.isAbsolute(named)) return null;
  return { operation: matched[3], denied: matched[2] !== 'allow', path: named };
}

/** The profile a sentinel read runs under: the one read it reports, with the sandbox's token. */
function sentinelProfile(sentinel, token) {
  return `(version 1)\n(allow default)\n(allow file-read-data (literal "${sentinel}") (with report) (with message "${token}"))\n`;
}

/**
 * Kills `child` with SIGKILL when it is a live process. A child whose spawn failed still holds a handle with process id 0
 * until the next tick, and `kill` through it would signal this process's own group.
 */
function killChild(child) {
  if (child === null || !Number.isInteger(child.pid) || child.pid <= 0) return;
  try {
    child.kill('SIGKILL');
  } catch {
    // Already gone.
  }
}

/** The live `log stream` children, killed when the process exits. */
const liveStreams = new Set();
let exitHookInstalled = false;

/** Kills every `log stream` this process started: at its exit, and from the handler of a signal that ends it (no `exit` event runs then). */
function killLiveStreams() {
  for (const stream of liveStreams) killChild(stream);
}

function trackStream(child) {
  liveStreams.add(child);
  child.once('exit', () => liveStreams.delete(child));
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.once('exit', killLiveStreams);
}

/**
 * One sandbox's reports on macOS: the `log stream` child, the file it writes
 * and what has been read from it.
 */
class ReportStream {
  /**
   * @param {object} options
   * @param {string} options.directory the runtime-private directory the files live in
   * @param {string} options.token the sandbox's token
   * @param {string} options.sandboxExec the Seatbelt executable
   * @param {(message: string) => Error} options.fail builds the error an audit failure throws
   * @param {string} [options.logExecutable]
   */
  constructor({ directory, token, sandboxExec, fail, logExecutable = LOG_EXECUTABLE }) {
    this.directory = fs.realpathSync.native(directory);
    this.token = token;
    this.sandboxExec = sandboxExec;
    this.fail = fail;
    this.logExecutable = logExecutable;
    this.file = path.join(this.directory, 'reports.ndjson');
    this.errorFile = path.join(this.directory, 'log.stderr');
    this.paths = new Set();
    this.sentinels = new Set();
    this.offset = 0;
    this.carry = '';
    this.decoder = new StringDecoder('utf8');
    this.sentinelCount = 0;
    this.canarySent = new Set();
    this.canaryReported = new Set();
    this.canaryCount = 0;
    this.canaryTimer = null;
    this.canaryRunning = new Set();
    this.canaryLast = null;
    this.canaryMissed = 0;
    this.lost = false;
    this.ended = null;
    this.child = null;
  }

  /** Spawns the stream; reports are read from `file` as it fills. */
  spawnStream() {
    const out = fs.openSync(this.file, 'w', 0o600);
    const err = fs.openSync(this.errorFile, 'w', 0o600);
    try {
      this.child = spawn(
        this.logExecutable,
        [
          'stream',
          '--style',
          'ndjson',
          '--timeout',
          LOG_TIMEOUT,
          '--predicate',
          `process == "kernel" AND eventMessage CONTAINS "${this.token}"`,
        ],
        { stdio: ['ignore', out, err] },
      );
    } finally {
      fs.closeSync(out);
      fs.closeSync(err);
    }
    this.child.once('error', (error) => {
      this.ended = { error };
    });
    this.child.once('exit', (code, signal) => {
      this.ended = { code, signal };
    });
    this.child.unref();
    trackStream(this.child);
  }

  /** What the stream said on standard error, for a refusal to quote. */
  said() {
    try {
      return stderrTail(fs.readFileSync(this.errorFile, 'utf8'));
    } catch {
      return '';
    }
  }

  /** Why the stream is no longer running, or `null` while it is. */
  endedBecause() {
    if (this.ended === null) return null;
    if (this.ended.error) return `${this.logExecutable} could not start: ${this.ended.error.message}`;
    const how =
      this.ended.signal === null || this.ended.signal === undefined ? `exited ${this.ended.code}` : `ended by ${this.ended.signal}`;
    const said = this.said();
    return `${this.logExecutable} stream ${how}${said ? ` (${said})` : ''}`;
  }

  /** Reads what the stream has written since the last read; the paths it names join `paths`, sentinels `sentinels`. */
  read() {
    let descriptor;
    try {
      descriptor = fs.openSync(this.file, 'r');
    } catch {
      return;
    }
    try {
      const chunk = Buffer.alloc(1 << 20);
      for (;;) {
        const count = fs.readSync(descriptor, chunk, 0, chunk.length, this.offset);
        if (count === 0) break;
        this.offset += count;
        const text = this.carry + this.decoder.write(chunk.subarray(0, count));
        const lines = text.split('\n');
        this.carry = lines.pop();
        for (const line of lines) this.take(line);
      }
    } finally {
      fs.closeSync(descriptor);
    }
  }

  take(line) {
    const report = parseReportLine(line, this.token);
    if (report === null) return;
    if (report.lost === true) {
      this.lost = true;
      return;
    }
    if (report.path.startsWith(`${this.directory}/sentinel-`) && !report.denied) this.sentinels.add(report.path);
    else if (report.path.startsWith(`${this.directory}/canary-`) && !report.denied) this.canaryReported.add(report.path);
    else this.paths.add(report.path);
  }

  /**
   * One read of the file `name` (a fresh file beneath the audit directory, which no target can reach) under the sandbox's
   * token, which the stream should report: its path, whether the read process started and whether it ran to a clean end.
   */
  async tokenRead(name) {
    const file = path.join(this.directory, name);
    fs.writeFileSync(file, `${name}\n`, { mode: 0o600 });
    const safe = assertProfileSafePath(file, (value) =>
      this.fail(`the audit path ${JSON.stringify(value)} cannot be carried into a profile`),
    );
    const outcome = await new Promise((resolve) => {
      const child = spawn(this.sandboxExec, ['-p', sentinelProfile(safe, this.token), '/bin/cat', file], { stdio: 'ignore' });
      let started = false;
      child.once('spawn', () => {
        started = true;
      });
      // A read process a target stopped or starved ends here, so the barrier ends at its deadline.
      const timer = setTimeout(() => killChild(child), SENTINEL_MS);
      child.once('error', () => {
        clearTimeout(timer);
        resolve({ started, ok: false });
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        resolve({ started, ok: code === 0 });
      });
    });
    return { file, ...outcome };
  }

  /** One read of a fresh sentinel under the sandbox's token, which the stream should report; its path. */
  async sentinelRead() {
    return (await this.tokenRead(`sentinel-${this.sentinelCount++}`)).file;
  }

  /**
   * One canary read: a file read through the sandbox's token that the log should report. A canary counts as sent when it is
   * attempted, before its file is written or its process started, so one a target killed or stopped, one a starved host or a
   * full process table could not start and one whose file could not be written all count as canaries the log did not deliver
   * and can only make the trial lossy; no target can hide a loss by ending or preventing its canaries. Returns whether the
   * process started.
   */
  async canaryRead() {
    const name = `canary-${this.canaryCount++}`;
    const file = path.join(this.directory, name);
    this.canarySent.add(file);
    try {
      return (await this.tokenRead(name)).started;
    } finally {
      fs.rmSync(file, { force: true });
    }
  }

  /**
   * Notes that the runtime is attempting a canary (or the trial is ending) now. A gap since the last attempt of more than
   * `CANARY_GAP_MS` means the cadence stopped (the runtime was frozen, its timers starved), so the canaries it called for in
   * that time count as sent and undelivered.
   */
  noteCanaryAttempt() {
    const now = monotonicMs();
    if (this.canaryLast !== null && now - this.canaryLast > CANARY_GAP_MS) {
      this.canaryMissed += Math.floor((now - this.canaryLast) / CANARY_MS) - 1;
    }
    this.canaryLast = now;
  }

  /** Starts the canary reads, one every `CANARY_MS`; a tick that finds `CANARY_IN_FLIGHT` running counts as a canary sent and undelivered. */
  startCanaries() {
    if (this.canaryTimer !== null) return;
    this.canaryLast = monotonicMs();
    const tick = () => {
      this.noteCanaryAttempt();
      if (this.canaryRunning.size < CANARY_IN_FLIGHT) {
        // A canary the runtime could not make is sent and undelivered; the final canary still accounts for the trial.
        const read = this.canaryRead()
          .catch(() => {})
          .finally(() => this.canaryRunning.delete(read));
        this.canaryRunning.add(read);
      } else {
        this.canarySent.add(path.join(this.directory, `canary-${this.canaryCount++}`));
      }
      this.canaryTimer = setTimeout(tick, CANARY_MS);
      this.canaryTimer.unref();
    };
    tick();
  }

  /**
   * Ends the canary reads and waits for the ones running; with `final`, makes one more, so a trial that lasted less than a tick
   * still has a canary. A final canary whose process cannot start leaves the trial with nothing measured, so it is a failure.
   */
  async stopCanaries({ final = false } = {}) {
    clearTimeout(this.canaryTimer);
    this.canaryTimer = null;
    if (this.canaryLast !== null) this.noteCanaryAttempt();
    this.canaryLast = null;
    await Promise.all(this.canaryRunning);
    const started = final ? await this.canaryRead().catch(() => false) : true;
    if (!started) throw this.fail("the audit's final canary read could not start, so how complete the log's reports were is unmeasured");
  }

  /** The canaries sent and the ones the log delivered, as read so far; a trial's are final once `stopCanaries` and the barrier are done. */
  canaries() {
    let delivered = 0;
    for (const file of this.canarySent) if (this.canaryReported.has(file)) delivered += 1;
    return { sent: this.canarySent.size + this.canaryMissed, delivered, lostEvents: this.lost };
  }

  /**
   * Whether the stream has returned a read made now: reads of fresh sentinels
   * until one is in the file or `ms` pass. Everything the target read before
   * the sentinel is in the file by then.
   */
  async confirm(ms = BARRIER_MS) {
    const deadline = Date.now() + ms;
    for (;;) {
      const gone = this.endedBecause();
      if (gone !== null) throw this.fail(`the audit's log stream ended before the trial's reads were confirmed: ${gone}`);
      const sentinel = await this.sentinelRead();
      for (let waited = 0; waited < BARRIER_STEP_MS; waited += 10) {
        this.read();
        if (this.sentinels.has(sentinel)) return true;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      if (Date.now() >= deadline) return false;
    }
  }

  close() {
    clearTimeout(this.canaryTimer);
    this.canaryTimer = null;
    killChild(this.child);
  }
}

/**
 * Whether the unified log reports a read this host's Seatbelt allowed, before
 * the run starts: `null` when it does, the reason when it does not. A host
 * whose log is unreadable (no privilege, a sandboxed shell) cannot audit.
 * One shell runs the whole probe (the stream in the background, a sandboxed
 * read of a fresh sentinel every 200 ms, a look at the stream's file after
 * each), since the selection is synchronous.
 */
function probeReportStream({ sandboxExec, logExecutable = LOG_EXECUTABLE }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-evaluate-observer-probe-'));
  try {
    const token = auditToken();
    const out = path.join(directory, 'reports.ndjson');
    const err = path.join(directory, 'log.stderr');
    const sentinel = path.join(fs.realpathSync.native(directory), `sentinel-${crypto.randomBytes(6).toString('hex')}`);
    fs.writeFileSync(sentinel, 'sentinel\n');
    const script = [
      String.raw`"$LOG" stream --style ndjson --timeout $LOG_TIMEOUT --predicate "process == \"kernel\" AND eventMessage CONTAINS \"$TOKEN\"" >"$OUT" 2>"$ERR" &`,
      'pid=$!',
      `deadline=$(($(date +%s) + ${PROBE_MS / 1000}))`,
      'while [ "$(date +%s)" -lt "$deadline" ]; do',
      '  "$SANDBOX_EXEC" -p "$PROFILE" /bin/cat "$SENTINEL" >/dev/null 2>&1',
      '  sleep 0.2',
      '  if grep -qF "$(basename "$SENTINEL")" "$OUT" 2>/dev/null; then kill $pid 2>/dev/null; exit 0; fi',
      '  if ! kill -0 $pid 2>/dev/null; then exit 3; fi',
      'done',
      'kill $pid 2>/dev/null',
      'exit 1',
    ].join('\n');
    const run = spawnSync('/bin/sh', ['-c', script], {
      env: {
        PATH: '/usr/bin:/bin',
        LOG: logExecutable,
        LOG_TIMEOUT,
        TOKEN: token,
        OUT: out,
        ERR: err,
        SANDBOX_EXEC: sandboxExec,
        SENTINEL: sentinel,
        PROFILE: sentinelProfile(sentinel, token),
      },
      timeout: PROBE_MS + 10_000,
      killSignal: 'SIGKILL',
      stdio: 'ignore',
    });
    if (run.error) return run.error.message;
    if (run.status === 0) return null;
    let said = '';
    try {
      said = stderrTail(fs.readFileSync(err, 'utf8'));
    } catch {
      // The stream wrote nothing.
    }
    if (run.status === 3) return `${logExecutable} stream ended before it reported a read the sandbox allowed${said ? ` (${said})` : ''}`;
    return `${logExecutable} stream did not report a read the sandbox allowed within ${PROBE_MS / 1000} s${said ? ` (${said})` : ''}`;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

// -- Bubblewrap -------------------------------------------------------------------------------------------------------

/**
 * The syscalls `strace` reports: the ones that take a path to open, write or read a link, `execve` for the start of the target.
 * Story 1.86 adds the ones that name the address of a socket (`connect`, and the sends that carry an address), since a connection to a Unix socket file is no file syscall.
 * It adds `bind` (the sockets the call made itself), `mount`, `open_tree` and `move_mount` (a bind mount of a socket file into a place the grants cover) and `io_uring_setup` (denied by `straceCommand`).
 */
const TRACE_SYSCALLS = Object.freeze([
  'execve',
  'execveat',
  'open',
  'openat',
  'openat2',
  'creat',
  'readlink',
  'readlinkat',
  'mkdir',
  'mkdirat',
  'rmdir',
  'unlink',
  'unlinkat',
  'rename',
  'renameat',
  'renameat2',
  'link',
  'linkat',
  'symlink',
  'symlinkat',
  'truncate',
  'chmod',
  'fchmodat',
  'fchmodat2',
  'chown',
  'lchown',
  'fchownat',
  'utimes',
  'utimensat',
  'futimesat',
  'mknod',
  'mknodat',
  'chdir',
  'fchdir',
  'clone',
  'clone3',
  'fork',
  'vfork',
  'connect',
  'sendto',
  'sendmsg',
  'sendmmsg',
  'bind',
  'mount',
  'open_tree',
  'move_mount',
  'io_uring_setup',
]);

/** The qualifier that makes the kernel's answer to a request for an `io_uring` ring `ENOSYS`, the answer of a kernel without one (the `?` prefix is the one the `trace=` list uses). */
const IO_URING_DENIAL = 'inject=?io_uring_setup:error=ENOSYS';

/**
 * The `strace` arguments before the command it traces: follow every process,
 * stop only at the traced syscalls (named with the optional `?` prefix, since
 * the names a strace knows depend on its version and the architecture;
 * `--seccomp-bpf`, which makes a syscall-heavy process cost about what it does
 * untraced; without it one ran 100 times slower), name each fd's path (`-y`),
 * name a child's pid as strace sees it (`--decode-pids=pidns`: a namespace's
 * `clone` returns the namespace's number), keep full paths and write the trace
 * to `output`.
 * The `inject` qualifier fails `io_uring_setup` with `ENOSYS` (Story 1.86), so no target holds a ring through which `IORING_OP_CONNECT` could reach a socket file the trace cannot see.
 * `--seccomp-bpf` stops only the syscalls `trace=` names, so `io_uring_setup` is in that list as well.
 *
 * @param {string} executable
 * @param {string} output
 * @returns {string[]}
 */
function straceCommand(executable, output) {
  return [
    executable,
    '-f',
    '--seccomp-bpf',
    '--decode-pids=pidns',
    '-y',
    '-qq',
    '-s',
    '4096',
    '-e',
    `trace=${TRACE_SYSCALLS.map((name) => `?${name}`).join(',')}`,
    '-e',
    IO_URING_DENIAL,
    '-o',
    output,
    '--',
  ];
}

/** The syscalls that create a process. */
const CLONES = new Set(['clone', 'clone3', 'fork', 'vfork']);

/** The error name of a socket call the trace shows begun and never finished: the process waited on a listener and the call ended it. */
const UNFINISHED = 'UNFINISHED';

const OPEN_WRITE = /\bO_(?:WRONLY|RDWR|CREAT|TRUNC|APPEND|TMPFILE)\b/;

/** Each traced syscall: the path arguments (by position, with the directory descriptor they are relative to) and how each is used. */
const WRITE_ONE = { kind: 'write', paths: [{ path: 0 }] };
const WRITE_AT = { kind: 'write', paths: [{ dir: 0, path: 1 }] };
const SYSCALLS = {
  execve: { kind: 'read', paths: [{ path: 0 }] },
  execveat: { kind: 'read', paths: [{ dir: 0, path: 1 }] },
  open: { kind: 'open', paths: [{ path: 0 }], flags: 1 },
  openat: { kind: 'open', paths: [{ dir: 0, path: 1 }], flags: 2 },
  openat2: { kind: 'open', paths: [{ dir: 0, path: 1 }], flags: 2 },
  creat: WRITE_ONE,
  readlink: { kind: 'read', paths: [{ path: 0 }] },
  readlinkat: { kind: 'read', paths: [{ dir: 0, path: 1 }] },
  mkdir: WRITE_ONE,
  mkdirat: WRITE_AT,
  rmdir: WRITE_ONE,
  unlink: WRITE_ONE,
  unlinkat: WRITE_AT,
  rename: { kind: 'write', paths: [{ path: 0 }, { path: 1 }] },
  renameat: {
    kind: 'write',
    paths: [
      { dir: 0, path: 1 },
      { dir: 2, path: 3 },
    ],
  },
  renameat2: {
    kind: 'write',
    paths: [
      { dir: 0, path: 1 },
      { dir: 2, path: 3 },
    ],
  },
  link: { kind: 'write', paths: [{ path: 0, kind: 'read' }, { path: 1 }] },
  linkat: {
    kind: 'write',
    paths: [
      { dir: 0, path: 1, kind: 'read' },
      { dir: 2, path: 3 },
    ],
  },
  symlink: { kind: 'write', paths: [{ path: 1 }] },
  symlinkat: { kind: 'write', paths: [{ dir: 1, path: 2 }] },
  truncate: WRITE_ONE,
  chmod: WRITE_ONE,
  fchmodat: WRITE_AT,
  fchmodat2: WRITE_AT,
  chown: WRITE_ONE,
  lchown: WRITE_ONE,
  fchownat: WRITE_AT,
  utimes: WRITE_ONE,
  utimensat: WRITE_AT,
  futimesat: WRITE_AT,
  mknod: WRITE_ONE,
  mknodat: WRITE_AT,
};

/**
 * Splits the text after `name(` into its top-level arguments, quotes, braces,
 * brackets and a descriptor's `<path>` annotation kept whole, and returns what
 * follows the closing parenthesis.
 *
 * @param {string} text
 * @returns {{ args: string[], rest: string }}
 */
function splitArguments(text) {
  const args = [];
  let current = '';
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      let end = index + 1;
      while (end < text.length && text[end] !== '"') end += text[end] === '\\' ? 2 : 1;
      current += text.slice(index, end + 1);
      index = end;
    } else if (character === '<' && /(?:AT_FDCWD|\d+)$/.test(current)) {
      let end = index + 1;
      while (end < text.length && !(text[end] === '>' && (text[end + 1] === ',' || text[end + 1] === ')'))) end += 1;
      current += text.slice(index, end + 1);
      index = end;
    } else if (character === '{' || character === '[' || character === '(') {
      depth += 1;
      current += character;
    } else if ((character === '}' || character === ']' || character === ')') && depth > 0) {
      depth -= 1;
      current += character;
    } else if (character === ')') {
      args.push(current.trim());
      return { args, rest: text.slice(index + 1) };
    } else if (character === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  return { args, rest: '' };
}

/** The string a quoted strace argument holds (its C escapes decoded as bytes), or `null` for anything else. */
function decodeString(token) {
  if (typeof token !== 'string' || token[0] !== '"') return null;
  const end = token.lastIndexOf('"');
  if (end <= 0 || token.slice(end + 1) !== '') return null;
  const body = token.slice(1, end);
  const bytes = [];
  const simple = { n: 10, t: 9, r: 13, f: 12, v: 11, a: 7, b: 8, '"': 34, '\\': 92 };
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] !== '\\') {
      bytes.push(...Buffer.from(body[index], 'utf8'));
      continue;
    }
    const next = body[index + 1];
    if (/[0-7]/.test(next ?? '')) {
      const octal = /^[0-7]{1,3}/.exec(body.slice(index + 1))[0];
      bytes.push(Number.parseInt(octal, 8) & 0xff);
      index += octal.length;
    } else if (next === 'x' && /^[0-9a-fA-F]{2}/.test(body.slice(index + 2))) {
      bytes.push(Number.parseInt(body.slice(index + 2, index + 4), 16));
      index += 3;
    } else if (next in simple) {
      bytes.push(simple[next]);
      index += 1;
    } else {
      bytes.push(92);
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

/** The path inside a `<...>` annotation, whose non-printable bytes strace escapes as it does a quoted string's. */
function decodeAnnotation(text) {
  return decodeString(`"${text}"`)?.replace(/ \(deleted\)$/, '') ?? text;
}

/** The path a descriptor argument carries (`AT_FDCWD</dir>` or `3</dir>`), `undefined` for a bare descriptor. */
function annotatedPath(token) {
  const matched = /^(?:AT_FDCWD|\d+)<([^]*)>$/.exec(token ?? '');
  return matched === null ? undefined : decodeAnnotation(matched[1]);
}

/**
 * The calls that make, copy, remove or move a name, with the arguments that name the paths: what a connect through a link led to must outlive the link.
 * A hard link to a link (`link`, and `linkat` without `AT_SYMLINK_FOLLOW`) is another name for the link, and a rename moves everything beneath the old name or swaps two subtrees (`RENAME_EXCHANGE`).
 */
const LINK_CHANGES = Object.freeze({
  symlink: { op: 'set', target: 0, to: { path: 1 } },
  symlinkat: { op: 'set', target: 0, to: { dir: 1, path: 2 } },
  link: { op: 'copy', from: { path: 0 }, to: { path: 1 } },
  linkat: { op: 'copy', from: { dir: 0, path: 1 }, to: { dir: 2, path: 3 }, flags: 4 },
  unlink: { op: 'remove', from: { path: 0 } },
  unlinkat: { op: 'remove', from: { dir: 0, path: 1 } },
  rename: { op: 'move', from: { path: 0 }, to: { path: 1 } },
  renameat: { op: 'move', from: { dir: 0, path: 1 }, to: { dir: 2, path: 3 } },
  renameat2: { op: 'move', from: { dir: 0, path: 1 }, to: { dir: 2, path: 3 }, flags: 4 },
});

/**
 * The calls that can put a socket file a bind mount reaches under a name the grants cover (`unshare(CLONE_NEWUSER|CLONE_NEWNS)` lets a target mount in its own namespace where the host allows it), with the place of the source, the place of the destination and the flag that makes the call a bind.
 * `mount` binds with `MS_BIND` (and does not remount), `open_tree` clones a mount with `OPEN_TREE_CLONE` and has no destination, and `move_mount` moves a mount from the path it names (or the descriptor an `open_tree` returned) to its destination.
 * `fsmount` attaches a file system built from a context and names no host path, so no bind comes from it.
 */
const MOUNT_SOURCES = Object.freeze({
  mount: { from: { path: 0 }, to: { path: 1 }, flags: 3, bind: /\bMS_BIND\b/, without: /\bMS_REMOUNT\b/ },
  open_tree: { from: { dir: 0, path: 1 }, flags: 2, bind: /\bOPEN_TREE_CLONE\b/ },
  move_mount: { from: { dir: 0, path: 1 }, to: { dir: 2, path: 3 }, flags: 4 },
});

/** The syscalls that name the address of a socket: a connection and the sends that carry an address (a datagram socket needs none to connect). */
const SOCKET_CALLS = new Set(['connect', 'sendto', 'sendmsg', 'sendmmsg']);

/**
 * How a socket call ended, read from the end of its line: the return value and the error name (`= -1 ECONNREFUSED (Connection refused)`, `= ? ERESTARTSYS (To be restarted if SA_RESTART is set)`, `= 0`).
 * The tail alone is read, so nothing the call's own data holds can stand in for it.
 */
const SOCKET_RESULT = /\)\s+=\s+(-?\d+|\?)(?:\s+([A-Z][A-Z0-9_]*))?(?:\s+\([^)]*\))?\s*$/;

/**
 * The Unix socket path addresses a socket call's text names (`sun_path="/run/x.sock"`), in the order they appear.
 * Each comes with the message it belongs to (`sendmmsg` carries several, one `msg_name=` each) and whether it is abstract (`sun_path=@"name"`, or a leading NUL in the older spelling).
 * A quoted string is read whole and skipped, so a payload that holds the text of an address names none.
 * A backslash outside a string (an escape in a descriptor's annotation) skips the character after it.
 *
 * @param {string} text the call's text up to its return value
 * @returns {Array<{ message: number, abstract: boolean, name: string }>}
 */
function socketAddresses(text) {
  const found = [];
  let message = 0;
  let named = false;
  for (let at = 0; at < text.length; at += 1) {
    const character = text[at];
    if (character === '\\') {
      at += 1;
    } else if (character === '"') {
      let end = at + 1;
      while (end < text.length && text[end] !== '"') end += text[end] === '\\' ? 2 : 1;
      const path = /\bsun_path=(@?)$/.exec(text.slice(Math.max(0, at - 14), at));
      const value = path === null ? null : decodeString(text.slice(at, end + 1));
      if (value !== null) found.push({ message, abstract: path[1] === '@' || value.startsWith('\0'), name: value });
      at = end;
    } else if (text.startsWith('msg_name=', at)) {
      // The first `msg_name=` is message 0 and each later one starts the next message.
      if (named) message += 1;
      named = true;
      at += 'msg_name='.length - 1;
    }
  }
  return found;
}

/**
 * Reads the trace `strace -f -y --decode-pids=pidns` writes, a line at a time,
 * and reports each path access of the traced command: `onAccess({ kind:
 * 'read'|'write', path, real, ok, errno })`, `real` being the path an opened
 * file resolved to. Lines before the `execve` that matches `marker` are
 * Bubblewrap's own setup and are dropped; with no marker every line counts. A
 * line split by another process's output (`<unfinished ...>`, `<... resumed>`)
 * is joined per pid. A process's working directory starts as the one the
 * target starts in, follows its `chdir` calls and passes to a child through the
 * child's pid, which a namespace's `clone` returns as the namespace's number
 * and `--decode-pids=pidns` names as strace sees it; a relative path of a
 * syscall with no directory argument waits for its process's directory when the
 * process is a child whose creating call has not returned yet (a vforked child
 * runs first) and `finish()` resolves what still waits against the start.
 */
/** The real path of `raw` on this host, or `null` when it names nothing here. */
function hostRealPath(raw) {
  try {
    return fs.realpathSync.native(raw);
  } catch {
    return null;
  }
}

/**
 * A process's own links to a directory or file: its root, its working directory, a descriptor, a mapped file, the same per
 * thread, and the standard descriptors. A path through one leads to any file of the namespace whatever the system's grants say.
 */
const PROCESS_LINK =
  /^\/(?:proc\/(?:self|thread-self|\d+)(?:\/task\/\d+)?\/(?:root|cwd|fd\/\d+|map_files\/[^/]+)|dev\/(?:fd\/\d+|stdin|stdout|stderr))$/;

/** Whether a path lies in the kernel's own file systems, whose paths lead anywhere a process can reach. */
const kernelFs = (candidate) => /^\/(?:proc|dev)(?:\/|$)/.test(candidate);

/**
 * Reads a path the way the kernel's own lexical part does, component by component: `..` pops, `.` and empty parts vanish.
 * `crossed` says a process link was passed with components still to follow (so the path leaves the file system the grants see),
 * `atLink` that the path ends at one, and `collapsed` is the path with every `..` applied. A link is no directory the grants
 * can judge by name, and a `..` before or after one must not hide it.
 */
function walkLinks(raw) {
  const stack = [];
  let crossed = false;
  const parts = raw.split('/');
  for (const [index, part] of parts.entries()) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      stack.pop();
      continue;
    }
    stack.push(part);
    if (PROCESS_LINK.test(`/${stack.join('/')}`) && parts.slice(index + 1).some((rest) => rest !== '' && rest !== '.')) crossed = true;
  }
  const collapsed = `/${stack.join('/')}`;
  return { collapsed, crossed, atLink: PROCESS_LINK.test(collapsed) };
}

/**
 * Whether a path names a file through a process link: it crossed one, or it starts in (or collapses into) the kernel's file
 * systems and holds a `..` (the link may sit anywhere the `..` reaches), or an exec names a link itself (an exec through a
 * descriptor or a mapped file runs the file it leads to).
 */
function throughProcessLink(raw, { exec = false } = {}) {
  const walked = walkLinks(raw);
  const dotdot = raw.split('/').includes('..');
  const kernel = kernelFs(raw) || kernelFs(walked.collapsed);
  return { walked, reentry: walked.crossed || (kernel && dotdot) || (exec && walked.atLink), kernel };
}

/** Whether a socket address names a file: a path address that is neither abstract nor empty. */
const namesFile = (address) => !address.abstract && address.name !== '';

/** Each directory above an absolute path, the nearest first and the root last. */
function* directoriesAbove(name) {
  let current = name;
  for (;;) {
    const parent = path.dirname(current);
    if (parent === current) return;
    yield parent;
    current = parent;
  }
}

/** The place a call's path argument names: the text and the directory it is relative to (the descriptor's annotation), `null` for an empty path or a descriptor strace could not name. */
function placeOf(args, reference) {
  const text = decodeString(args[reference.path]);
  if (text === null || text === '') return null;
  if (reference.dir === undefined || args[reference.dir] === 'AT_FDCWD') return { path: text };
  const base = annotatedPath(args[reference.dir]);
  return base === undefined ? null : { path: text, base };
}

/** The components of an absolute path. */
const componentsOf = (name) => name.split('/').filter((part) => part !== '');

/**
 * The names the trace made (links and bind mount destinations) as a tree of directory nodes, each with its children by name and an optional target.
 * A rename detaches the node at the old name and attaches it at the new one, so it costs the depth of the two names whatever lies beneath them.
 */
class LinkTable {
  constructor() {
    this.root = { target: undefined, children: new Map() };
  }

  /** The target of the link at `name`, `undefined` when there is none. */
  get(name) {
    let node = this.root;
    for (const part of componentsOf(name)) {
      node = node.children.get(part);
      if (node === undefined) break;
    }
    return node?.target;
  }

  /** Makes `name` a link to `target`, keeping the names beneath it. */
  set(name, target) {
    let node = this.root;
    for (const part of componentsOf(name)) {
      if (!node.children.has(part)) node.children.set(part, { target: undefined, children: new Map() });
      node = node.children.get(part);
    }
    node.target = target;
  }

  /** Removes the link at `name`, keeping the names beneath it. */
  delete(name) {
    const parts = componentsOf(name);
    const nodes = this.trail(parts);
    if (nodes === null) return;
    nodes.at(-1).target = undefined;
    this.prune(parts, nodes);
  }

  /** The nodes from the root down the components, `null` when one is missing. */
  trail(parts) {
    const nodes = [this.root];
    for (const part of parts) {
      const child = nodes.at(-1).children.get(part);
      if (child === undefined) return null;
      nodes.push(child);
    }
    return nodes;
  }

  /** Drops the nodes the components lead through that hold neither a link nor a child, the deepest first. */
  prune(parts, nodes) {
    for (let depth = parts.length; depth > 0; depth -= 1) {
      const node = nodes[depth];
      if (node.target !== undefined || node.children.size > 0) return;
      nodes[depth - 1].children.delete(parts[depth - 1]);
    }
  }

  /** Takes the node at the components out of the tree with everything beneath it, `null` when there is none. */
  detach(parts) {
    const nodes = this.trail(parts);
    if (nodes === null || parts.length === 0) return null;
    nodes[parts.length - 1].children.delete(parts.at(-1));
    this.prune(parts.slice(0, -1), nodes);
    return nodes[parts.length];
  }

  /** Puts a node at the components, replacing what lay there. */
  attach(parts, node) {
    let parent = this.root;
    for (const part of parts.slice(0, -1)) {
      if (!parent.children.has(part)) parent.children.set(part, { target: undefined, children: new Map() });
      parent = parent.children.get(part);
    }
    parent.children.set(parts.at(-1), node);
  }

  /**
   * Moves the link at `from` and every name beneath it to `to`, replacing what lay at or beneath `to`, or swaps the two subtrees (`RENAME_EXCHANGE`).
   * A name moved into its own subtree, or a subtree into its name, is a call the kernel refuses, so it changes nothing.
   */
  move(from, to, exchange) {
    const source = componentsOf(from);
    const destination = componentsOf(to);
    const shared = Math.min(source.length, destination.length);
    if (source.slice(0, shared).join('/') === destination.slice(0, shared).join('/')) return;
    const moved = this.detach(source);
    const replaced = this.detach(destination);
    if (moved !== null) this.attach(destination, moved);
    if (exchange && replaced !== null) this.attach(source, replaced);
  }
}

class TraceReader {
  /**
   * @param {object} options
   * @param {{ program: string, text: string }|null} options.marker the program and argument text only the target's own `execve` holds
   * @param {string} options.cwd the directory a process starts in
   * @param {(access: object) => void} options.onAccess
   * @param {(raw: string) => string|null} [options.resolveReal] the real path of a path on the host, `null` when it has none
   */
  constructor({ marker, cwd, onAccess, resolveReal = hostRealPath }) {
    this.resolveReal = resolveReal;
    this.marker = marker;
    this.cwd = cwd;
    this.onAccess = onAccess;
    this.started = marker === null;
    this.pending = new Map();
    // What a relative path resolves against, in the order the target made it: the `chdir` calls, the `clone` calls (the pid of
    // the child is learned when the call returns, which a vforked child's own lines can precede) and the accesses that need a
    // working directory. `finish()` replays them, so a thread's directory follows its parent's wherever they interleave.
    this.timeline = [];
    this.pendingClones = new Map();
    // The socket calls still in flight when their process's line was split, by pid.
    // The call's outcome is settled when it resumes, and one that never does (the call ended while the process waited on a listener's full queue) stays unfinished.
    this.hung = new Map();
    // The symbolic links the target made or removed and the bind mounts it made, by the physical path of the directory that holds them and their name, in the order the trace replays them.
    // A connect is resolved through the links it found, so a link removed after the connection cannot hide the file it led to.
    this.links = new LinkTable();
    // What the replay of `finish()` learns: the latest step at which each name (in both spellings) was removed, renamed or replaced, and the step at which the call bound each socket it made itself.
    this.removedAt = new Map();
    this.standing = new Map();
    this.canonicals = new Map();
  }

  /** Whether the line of the target's own start has been read. */
  get begun() {
    return this.started;
  }

  push(line) {
    const matched = /^(\d+)\s+([^]*)$/.exec(line);
    if (matched === null) return;
    const pid = Number(matched[1]);
    let text = matched[2];
    if (text.startsWith('---') || text.startsWith('+++')) return;
    const resumed = /^<\.\.\. \w+ resumed>([^]*)$/.exec(text);
    if (resumed !== null) {
      const stored = this.pending.get(pid);
      if (stored === undefined) return;
      this.pending.delete(pid);
      text = `${stored}${resumed[1]}`;
      const waiting = this.hung.get(pid);
      if (waiting !== undefined) {
        this.hung.delete(pid);
        const result = this.settleSocketCall(waiting, text);
        // A `sendmmsg` prints its messages only when it returns, so the entry of a split call may hold none: the joined text names them.
        if (result !== null) waiting.addresses = socketAddresses(text.slice(text.indexOf('(') + 1, result.index));
        return;
      }
    } else if (text.endsWith(' <unfinished ...>')) {
      const name = /^(\w+)\(/.exec(text)?.[1];
      if (name !== undefined) this.pending.set(pid, text.slice(0, -' <unfinished ...>'.length));
      if (CLONES.has(name) && this.started) this.timeline.push(this.cloneEvent(pid, text));
      if (SOCKET_CALLS.has(name) && this.started) {
        const outcome = { name, ok: false, errno: UNFINISHED, limit: 1 };
        this.hung.set(pid, outcome);
        // A split `connect`, `sendto` or `sendmsg` printed its address at entry, so it stays only when the entry names a socket file; a `sendmmsg` prints its messages on the resumed line, so it always stays.
        this.noteSocketCall(pid, text.slice(text.indexOf('(') + 1, -' <unfinished ...>'.length), outcome, name === 'sendmmsg');
      }
      return;
    }
    const call = /^(\w+)\(([^]*)$/.exec(text);
    if (call === null) return;
    const name = call[1];
    if (name === 'execve' && this.noteExecve(text)) return;
    if (!this.started) return;
    if (SOCKET_CALLS.has(name) || name === 'bind') {
      const outcome = { name, ok: false, errno: UNFINISHED, limit: 1 };
      const result = this.settleSocketCall(outcome, call[2]);
      if (result === null) return;
      const addressed = call[2].slice(0, result.index);
      // A socket the call bound itself is its own, whatever happens to the file after.
      if (name === 'bind') {
        if (outcome.ok) this.noteBind(pid, addressed);
      } else this.noteSocketCall(pid, addressed, outcome, false);
      return;
    }
    const { args, rest } = splitArguments(call[2]);
    const result = /^\s*=\s*(-?\d+|\?)(?:<([^]*?)>)?(?=\s|$)(?:\s+([A-Z][A-Z0-9_]*))?(?:[^]*?\/\* (\d+) in strace's PID NS \*\/)?/.exec(
      rest,
    );
    if (result === null) return;
    const returned = result[1] === '?' ? Number.NaN : Number(result[1]);
    const ok = Number.isFinite(returned) && returned >= 0;
    if (name === 'chdir') {
      const target = decodeString(args[0]);
      if (ok && target !== null) this.timeline.push({ kind: 'chdir', pid, target });
      return;
    }
    if (name === 'fchdir') {
      // The descriptor's annotation names the directory the process moved to.
      const target = annotatedPath(args[0]);
      if (ok && target !== undefined && path.isAbsolute(target)) this.timeline.push({ kind: 'chdir', pid, target });
      return;
    }
    if (CLONES.has(name)) {
      const event = this.pendingClones.get(pid) ?? this.timeline[this.timeline.push(this.cloneEvent(pid, text)) - 1];
      this.pendingClones.delete(pid);
      const child = result[4] === undefined ? returned : Number(result[4]);
      if (ok && child > 0) event.child = child;
      return;
    }
    if (ok && LINK_CHANGES[name] !== undefined) this.noteLinkChange(pid, name, args);
    if (ok && MOUNT_SOURCES[name] !== undefined) this.noteMount(pid, name, args);
    const syscall = SYSCALLS[name];
    if (syscall === undefined) return;
    const flags = syscall.flags === undefined ? '' : (args[syscall.flags] ?? '');
    let kind = syscall.kind;
    if (kind === 'open') {
      if (/\bO_PATH\b/.test(flags)) return;
      kind = OPEN_WRITE.test(flags) ? 'write' : 'read';
    }
    const opened = syscall.kind === 'open' && ok && result[2] !== undefined ? decodeAnnotation(result[2]) : null;
    for (const spec of syscall.paths) {
      const argument = decodeString(args[spec.path]);
      if (argument === '' && name === 'execveat') {
        // An exec of a descriptor (`AT_EMPTY_PATH`) runs the file the descriptor's annotation names, which an `O_PATH` open left no record of.
        const file = annotatedPath(args[spec.dir]);
        if (ok && file !== undefined && path.isAbsolute(file)) {
          this.onAccess({ kind: 'read', path: file, real: file, ok, errno: null, annotated: true, dotdot: false, reentry: false });
        }
        continue;
      }
      if (argument === null || argument === '') continue;
      const emit = (base, crossedBase = false) => {
        const raw = path.isAbsolute(argument) ? argument : `${base}/${argument}`;
        const absolute = path.resolve(raw);
        // A `..` after a link leaves the lexical path, which collapses it, naming another file than the kernel opened: an opened
        // file names itself, and any other access (an exec, a link read) is resolved on the host, whose view of the system
        // directories and the workspace is the target's (`/` is bound read-only into the namespace).
        const dotdot = raw.split('/').includes('..');
        const annotated = opened !== null && path.isAbsolute(opened);
        const through = throughProcessLink(raw, { exec: name === 'execve' || name === 'execveat' });
        // A path through a process link is not the evaluator's to resolve: it is listed, never resolved here, and neither is one
        // that starts in the kernel's file systems.
        const reentry = !annotated && (through.reentry || crossedBase);
        let real = annotated ? opened : absolute;
        if (!annotated && dotdot && !reentry && !through.kernel) real = this.resolveReal(raw) ?? absolute;
        this.onAccess({
          kind: spec.kind ?? kind,
          path: absolute,
          real,
          ok,
          errno: ok ? null : (result[3] ?? null),
          annotated,
          dotdot,
          reentry,
        });
      };
      if (path.isAbsolute(argument)) emit('/');
      else if (spec.dir === undefined || args[spec.dir] === 'AT_FDCWD') this.timeline.push({ kind: 'access', pid, emit });
      else {
        const base = annotatedPath(args[spec.dir]);
        // A directory descriptor strace cannot name leaves a relative path unresolvable; an opened file still names itself.
        if (base !== undefined) emit(base);
        else if (opened !== null && path.isAbsolute(opened))
          this.onAccess({
            kind: spec.kind ?? kind,
            path: opened,
            real: opened,
            ok,
            errno: null,
            annotated: true,
            dotdot: false,
            reentry: false,
          });
      }
    }
  }

  /** A `clone` call as the timeline holds it, its child's pid not yet known; the `CLONE_FS` flag says the child shares its parent's directory. */
  cloneEvent(pid, text) {
    const event = { kind: 'clone', pid, child: null, shares: /\bCLONE_FS\b/.test(text) };
    this.pendingClones.set(pid, event);
    return event;
  }

  /**
   * Reads how a socket call ended from the end of its text into `outcome` (`ok`, the error name, and how many of a `sendmmsg`'s messages were sent).
   * Returns the match, and `null` when the text ends in no return value.
   */
  settleSocketCall(outcome, text) {
    const result = SOCKET_RESULT.exec(text);
    if (result === null) return null;
    const returned = result[1] === '?' ? Number.NaN : Number(result[1]);
    outcome.ok = Number.isFinite(returned) && returned >= 0;
    // A return value strace could not print (`= ?`) belongs to a call the process never left, which the end of the call cut short.
    outcome.errno = outcome.ok ? null : (result[2] ?? (result[1] === '?' ? UNFINISHED : null));
    outcome.limit = outcome.name === 'sendmmsg' && outcome.ok ? returned : 1;
    return result;
  }

  /**
   * Keeps a socket call that names a Unix socket file for the replay of `finish()`, where its directory is known.
   * A call that names none (every `send` of a datagram client, a TCP connection) holds nothing, whether it finished or was split by another process.
   * A split `sendmmsg` stays whatever its text holds, since its addresses arrive on the resumed line.
   */
  noteSocketCall(pid, text, outcome, split) {
    const addresses = socketAddresses(text);
    if (!split && !addresses.some(namesFile)) return;
    outcome.addresses = addresses;
    this.timeline.push({ kind: 'socket', pid, outcome });
  }

  /** Keeps the Unix socket files a successful `bind` named: the sockets the target made itself, whose files it may remove when it is done. */
  noteBind(pid, text) {
    const addresses = socketAddresses(text).filter(namesFile);
    if (addresses.length > 0) this.timeline.push({ kind: 'bind', pid, addresses });
  }

  /**
   * Keeps a successful bind mount for the replay of `finish()`: its source is judged as a connection is, and its destination becomes a name that leads to the source.
   * A socket file bound into a place the grants cover is reached by a path the trace cannot judge, so the source is listed when it lies outside the grants and the destination is followed to it afterwards.
   * A `move_mount` from the descriptor an `open_tree` returned (`MOVE_MOUNT_F_EMPTY_PATH`) takes its source from the descriptor's annotation and lists nothing of its own, since the `open_tree` listed it.
   */
  noteMount(pid, name, args) {
    const spec = MOUNT_SOURCES[name];
    const flags = args[spec.flags] ?? '';
    if (spec.bind !== undefined && !spec.bind.test(flags)) return;
    if (spec.without?.test(flags)) return;
    const source = decodeString(args[spec.from.path]);
    if (source === null) return;
    let base;
    if (spec.from.dir !== undefined && args[spec.from.dir] !== 'AT_FDCWD') {
      base = annotatedPath(args[spec.from.dir]);
      if (base === undefined || !path.isAbsolute(base)) return;
    }
    // A mount cloned or moved from a descriptor (`AT_EMPTY_PATH` for `open_tree`, `MOVE_MOUNT_F_EMPTY_PATH` for `move_mount`) names no path of its own: the descriptor's annotation is the file or directory it was opened on.
    if (source === '' && base === undefined) return;
    const named = base === undefined ? source : path.resolve(base, source);
    const listed = !(name === 'move_mount' && source === '');
    const to = spec.to === undefined ? null : placeOf(args, spec.to);
    if (!listed && to === null) return;
    const outcome = { name, ok: true, errno: null, limit: 1, addresses: [{ message: 0, abstract: false, name: named }] };
    this.timeline.push({ kind: 'mount', pid, source: named, to, outcome: listed ? outcome : null });
  }

  /**
   * The accesses a socket call makes once the directory of its process is known.
   * `path` is the path as given, resolved, and `real` is the file the kernel connected to: the path followed through the links the trace shows the target made (a link removed or retargeted since the connection still led where it led then), then resolved on the host, where a socket file that has gone by the time the trace is read keeps its directory's real path.
   * A path through a process's own links is listed as it stands, and an abstract address, an unnamed one and every other family name no file.
   * `subject` is the path the call reached by the trace's own account, which `finish()` checks against the names the target removed later, and `passed` the paths a `..` was resolved against on the host, which it checks the same way.
   */
  socketAccesses(outcome, cell) {
    const accesses = [];
    for (const address of outcome.addresses) {
      if (!namesFile(address) || address.message >= outcome.limit) continue;
      const raw = path.isAbsolute(address.name) ? address.name : `${cell.cwd}/${address.name}`;
      const absolute = path.resolve(raw);
      // The paths a `..` was resolved against on the host, which the target may remove or retarget after the call.
      const passed = [];
      const followed = this.followTraceLinks(raw, passed);
      const subject = path.resolve(followed ?? raw);
      const given = throughProcessLink(raw);
      const through = throughProcessLink(followed ?? raw);
      // A path that ends at a process link (`/dev/fd/5` for a descriptor on a socket file) leads anywhere the process can reach too.
      const reentry = given.reentry || given.walked.atLink || through.reentry || through.walked.atLink || cell.crossed;
      accesses.push({
        subject,
        passed,
        access: {
          kind: 'connect',
          path: absolute,
          real: reentry ? absolute : through.kernel ? subject : this.socketRealPath(subject),
          ok: outcome.ok,
          errno: outcome.errno,
          annotated: false,
          dotdot: raw.split('/').includes('..'),
          reentry,
        },
      });
    }
    return accesses;
  }

  /** The file a path reached on the host: a socket file that has gone by the time the trace is read keeps its directory's real path, and a path whose directory is gone too stays as it is. */
  socketRealPath(start) {
    const resolved = this.resolveReal(start);
    if (resolved !== null) return resolved;
    const parent = this.resolveReal(path.dirname(start));
    return parent === null ? start : path.join(parent, path.basename(start));
  }

  /** `candidate` with its directory resolved on the host (a link in the directory leads where it leads now), or `candidate` when the directory has gone. */
  canonical(candidate) {
    const directory = path.dirname(candidate);
    if (!this.canonicals.has(directory)) this.canonicals.set(directory, this.resolveReal(directory));
    const real = this.canonicals.get(directory);
    return real === null ? candidate : path.join(real, path.basename(candidate));
  }

  /** The step at which the name, or a directory above it, was last removed, renamed or replaced in the replay so far, `0` when it was not. */
  latestRemoval(name) {
    let latest = this.removedAt.get(name) ?? 0;
    for (const directory of directoriesAbove(name)) latest = Math.max(latest, this.removedAt.get(directory) ?? 0);
    return latest;
  }

  /** Whether the call bound the socket at `subject` and no removal, rename or replacement of its name, in either spelling, or a directory above it came since. */
  standsBound(subject) {
    const forms = [subject, this.canonical(subject)];
    const latest = Math.max(...forms.map((form) => this.latestRemoval(form)));
    return forms.some((form) => (this.standing.get(form) ?? 0) > latest);
  }

  /**
   * Whether the target removed, renamed or replaced the name a call reached, or a directory above it, after the call, and did not bind the socket itself (`own`, settled when the call was made).
   * The file the kernel reached may then have been a link the trace did not make (one the project holds, which the target removed after the connection), and the host can no longer say where it led.
   * A path a `..` was resolved against (`passed`) counts as the name does, since the parent the kernel went to was the parent of what that path led to then.
   */
  vanished(subject, at, own, passed = []) {
    if (own) return false;
    return [subject, this.canonical(subject), ...passed].some((form) => this.latestRemoval(form) > at);
  }

  /**
   * `raw` with each link the trace made replaced by its target, or `null` when it passes none and no `..` changed it.
   * A relative target resolves against the directory of the link, an absolute one from the root, and `..` pops the path so far.
   * A `..` first replaces the path so far with its real path on the host, since the kernel goes to the parent of the directory a link the trace did not make leads to, and that path is added to `passed`.
   */
  followTraceLinks(raw, passed = []) {
    let queue = raw.split('/').filter((part) => part !== '' && part !== '.');
    let resolved = [];
    let follows = 0;
    let changed = false;
    while (queue.length > 0) {
      const [part, ...rest] = queue;
      queue = rest;
      if (part === '..') {
        const prefix = `/${resolved.join('/')}`;
        const real = kernelFs(prefix) ? null : this.resolveReal(prefix);
        if (!kernelFs(prefix)) passed.push(prefix);
        if (real !== null && real !== prefix) {
          resolved = real.split('/').filter((piece) => piece !== '');
          changed = true;
        }
        resolved.pop();
        continue;
      }
      const target = this.links.get(`/${[...resolved, part].join('/')}`);
      if (target === undefined) {
        resolved.push(part);
        continue;
      }
      follows += 1;
      // A cycle of links ends where the kernel's limit does: the path is left as it stands.
      if (follows > 40) return null;
      if (path.isAbsolute(target)) resolved.length = 0;
      queue = [...target.split('/').filter((piece) => piece !== '' && piece !== '.'), ...queue];
    }
    return follows === 0 && !changed ? null : `/${resolved.join('/')}`;
  }

  /** Keeps the effect of a successful call that makes, copies, removes or moves a name, in the timeline's order. */
  noteLinkChange(pid, name, args) {
    const spec = LINK_CHANGES[name];
    const place = (reference) => placeOf(args, reference);
    const event = {
      kind: 'link',
      pid,
      op: spec.op,
      target: spec.target === undefined ? null : decodeString(args[spec.target]),
      from: spec.from === undefined ? null : place(spec.from),
      to: spec.to === undefined ? null : place(spec.to),
      flags: spec.flags === undefined ? '' : (args[spec.flags] ?? ''),
    };
    if (event.from !== null || event.to !== null) this.timeline.push(event);
  }

  /**
   * The physical name a reference gives a link: the directory above it followed through the links the trace made (a link made through a directory link is made in the directory it leads to), and the last component as given.
   * A name that ends in `.` or `..` is a directory and holds no link.
   */
  linkKey(reference, cwd) {
    const raw = path.isAbsolute(reference.path) ? reference.path : `${reference.base ?? cwd}/${reference.path}`;
    const trimmed = raw.replace(/\/+$/, '');
    const name = path.basename(trimmed);
    if (name === '' || name === '.' || name === '..') return null;
    const directory = path.dirname(trimmed);
    return path.join(this.followTraceLinks(directory) ?? path.resolve(directory), name);
  }

  /**
   * Applies a name change to `links` against the directory its process had at the call, and notes the names it removed or replaced once a socket call or a bind came before.
   * A rename moves the node of the old name with every link beneath it, replaces whatever lay at or beneath the new one, and swaps the two subtrees for `RENAME_EXCHANGE`.
   */
  applyLinkChange(event, cwd, at, track) {
    const from = event.from === null ? null : this.linkKey(event.from, cwd);
    const to = event.to === null ? null : this.linkKey(event.to, cwd);
    const removed = (...names) => {
      if (!track && this.standing.size === 0) return;
      for (const name of names) if (name !== null) for (const form of [name, this.canonical(name)]) this.removedAt.set(form, at);
    };
    switch (event.op) {
      case 'set': {
        if (to !== null && event.target !== null) this.links.set(to, event.target);
        break;
      }
      case 'copy': {
        // A hard link to a link is another name for the link, unless `linkat` followed the link to the file it leads to.
        const linked = from === null ? undefined : this.links.get(from);
        if (to !== null && !/\bAT_SYMLINK_FOLLOW\b/.test(event.flags) && linked !== undefined) this.links.set(to, linked);
        break;
      }
      case 'remove': {
        if (from !== null) this.links.delete(from);
        removed(from);
        break;
      }
      default: {
        if (from === null || to === null || from === to) break;
        this.links.move(from, to, /\bRENAME_EXCHANGE\b/.test(event.flags));
        removed(from, to);
      }
    }
  }

  /**
   * Replays the timeline: a process starts in the directory the target started in, a `chdir` changes its own (a thread's too, when
   * they share it), a forked child copies its parent's at the call and a thread shares it; each access that waited for a
   * directory resolves against its process's at that point.
   * The links the trace made, the bind mounts it made and the names it removed are replayed in the same order, and a connection is reported once the whole trace is read, since the names removed after it decide whether the host can still say what it reached.
   */
  finish() {
    const cells = new Map();
    const cellOf = (pid) => {
      if (!cells.has(pid)) cells.set(pid, { cwd: this.cwd, crossed: false });
      return cells.get(pid);
    };
    const connections = [];
    let at = 0;
    for (const event of this.timeline) {
      at += 1;
      switch (event.kind) {
        case 'chdir': {
          const cell = cellOf(event.pid);
          const absolute = path.isAbsolute(event.target);
          const raw = absolute ? event.target : `${cell.cwd}/${event.target}`;
          const through = throughProcessLink(raw);
          // A directory reached through a process link (`/proc/self/cwd/..`) is no directory the grants can judge by name.
          // What is read relative to it afterwards is listed, until a `chdir` to an absolute path leaves it.
          cell.crossed = (absolute ? false : cell.crossed) || through.reentry;
          cell.cwd = through.walked.collapsed;
          break;
        }
        case 'link': {
          this.applyLinkChange(event, cellOf(event.pid).cwd, at, connections.length > 0);
          break;
        }
        case 'socket': {
          for (const connection of this.socketAccesses(event.outcome, cellOf(event.pid))) {
            connections.push({ ...connection, at, own: this.standsBound(connection.subject) });
          }
          break;
        }
        case 'mount': {
          const cell = cellOf(event.pid);
          if (event.outcome !== null) {
            for (const connection of this.socketAccesses(event.outcome, cell)) connections.push({ ...connection, at, own: false });
          }
          // The destination now leads to the source as the trace follows it at this step, so a name made beneath either reaches the other.
          const raw = path.isAbsolute(event.source) ? event.source : `${cell.cwd}/${event.source}`;
          const source = path.resolve(this.followTraceLinks(raw) ?? raw);
          const destination = event.to === null ? null : this.linkKey(event.to, cell.cwd);
          // The kernel follows a link the project holds to the directory above the destination, which the trace cannot see, so the name leads to the source in both spellings.
          if (destination !== null) {
            for (const form of new Set([destination, this.canonical(destination)])) if (form !== source) this.links.set(form, source);
          }
          break;
        }
        case 'bind': {
          const cell = cellOf(event.pid);
          for (const address of event.addresses) {
            const raw = path.isAbsolute(address.name) ? address.name : `${cell.cwd}/${address.name}`;
            const bound = path.resolve(this.followTraceLinks(raw) ?? raw);
            this.standing.set(bound, at);
            this.standing.set(this.canonical(bound), at);
          }
          break;
        }
        case 'clone': {
          if (event.child !== null) {
            const parent = cellOf(event.pid);
            cells.set(event.child, event.shares ? parent : { cwd: parent.cwd, crossed: parent.crossed });
          }
          break;
        }
        default: {
          const cell = cellOf(event.pid);
          event.emit(cell.cwd, cell.crossed);
        }
      }
    }
    for (const { access, subject, own, passed, at: calledAt } of connections) {
      this.onAccess(access.reentry ? access : { ...access, vanished: this.vanished(subject, calledAt, own, passed) });
    }
    this.timeline = [];
    this.removedAt = new Map();
    this.standing = new Map();
  }

  /**
   * The target's own start: the `execve` of the marker's program whose line
   * holds the marker's text. Bubblewrap's own `execve` names the whole command
   * in its arguments, so the program is what tells the two apart.
   */
  noteExecve(text) {
    if (this.started || this.marker === null) return false;
    const { args } = splitArguments(text.slice(text.indexOf('(') + 1));
    if (decodeString(args[0]) !== this.marker.program || !text.includes(this.marker.text)) return false;
    this.started = true;
    return true;
  }
}

/**
 * Streams a trace file through a `TraceReader`.
 *
 * @param {string} file
 * @param {ConstructorParameters<typeof TraceReader>[0]} options
 * @returns {Promise<TraceReader>}
 */
async function readTrace(file, options) {
  const reader = new TraceReader(options);
  const decoder = new StringDecoder('utf8');
  let carry = '';
  try {
    for await (const chunk of fs.createReadStream(file)) {
      const lines = (carry + decoder.write(chunk)).split('\n');
      carry = lines.pop();
      for (const line of lines) reader.push(line);
    }
    reader.push(carry + decoder.end());
    reader.finish();
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return reader;
}

/**
 * The error names that leave a connection (or a datagram sent to an address) not refused by the kernel.
 * The socket file was a listener, whose queue was full (`EAGAIN`) or whose wait a signal ended (`EINTR` and the restart codes), or the call began and never finished.
 * Every other error refused it: a path that does not exist, a file that is no socket (`ECONNREFUSED`, which is also what the empty device file of a mount answers), a socket nothing listens on, a socket of another type and a socket file the process may not open.
 */
const SOCKET_NOT_REFUSED = Object.freeze([
  'EAGAIN',
  'EINTR',
  'ERESTARTSYS',
  'ERESTARTNOINTR',
  'ERESTARTNOHAND',
  'ERESTART_RESTARTBLOCK',
  UNFINISHED,
]);

/**
 * The decision for a socket call (Story 1.86): the socket file is listed, by its real path, when the kernel did not refuse the call and the file lies outside the places a connection is no access.
 * Those places are `grants.connect`: the workspace, the private directories of the call (the bridge's directory among them), the sandbox's own `/dev` and `/run/user` and the egress proxy's directory.
 * A path through a process's own links is listed, since it leads anywhere the process can reach.
 * A path the target removed, renamed or replaced after the call is listed as it was given unless the call bound that socket itself or the trace's own links lead it, since a link the project held and the target removed leaves the host no way to say where it led.
 */
function connectDecision({ path: absolute, real, ok, errno, reentry = false, vanished = false }, grants) {
  if (!ok && !SOCKET_NOT_REFUSED.includes(errno)) return null;
  if (reentry) return absolute;
  if (!(grants.connect ?? []).some((root) => isInside(root, real))) return real;
  return vanished ? absolute : null;
}

/**
 * Whether an access is an observed mount, and the path to list for it, or
 * `null` (the same decision for every access of a Bubblewrap call).
 *
 * A read is reported when its path is withheld (the evaluation folder, the
 * project's git directory, the private root, each apart from what the sandbox
 * is excepted) whatever the answer was, or when it reached a path no grant
 * covers (a read of a path that does not exist reached nothing). A write the
 * mechanism did not refuse landed in a place the sandbox may write; a refused
 * one is reported when its path is withheld or outside what the sandbox may write.
 * A connection (or a datagram sent to an address) the kernel did not refuse is reported when the socket file lies outside `grants.connect`.
 *
 * @param {object} access `TraceReader`'s access
 * @param {{ read: string[], write: string[], withheld: string[], withheldExcept: string[], linked?: string[], connect?: string[] }} grants
 * @returns {string|null}
 */
function traceDecision(access, grants) {
  if (access.kind === 'connect') return connectDecision(access, grants);
  const { kind, path: absolute, real, ok, errno, dotdot = false, reentry = false } = access;
  // A login file the home links to (Story 1.113) is opened by its path in the home and resolves outside it, and it is the one file that may.
  const linked = (grants.linked ?? []).includes(real);
  const except = grants.withheldExcept.some((root) => isInside(root, absolute) && (isInside(root, real) || linked));
  const withheld = !except && grants.withheld.some((root) => isInside(root, absolute) || isInside(root, real));
  if (withheld) {
    // Node resolves a module by looking for a `package.json` in every directory above it, so one asked for above the sandbox's
    // own home, in a directory the sandbox withholds and hides, is the loader's and not the target's.
    const loader =
      kind === 'read' &&
      !ok &&
      (errno === 'ENOENT' || errno === 'ENOTDIR') &&
      path.basename(absolute) === 'package.json' &&
      grants.withheldExcept.some((root) => isInside(path.dirname(absolute), root) && root !== absolute);
    return loader ? null : real;
  }
  // A path an exec or a link read names through a process's own root or directory link is a path of the namespace, whatever the
  // process directories' grant says; the kernel's annotation of an opened file already names the file it opened.
  if (reentry && kind === 'read' && ok) return absolute;
  if (kind === 'read') {
    if (EXACT_GRANTS.includes(real) || grants.read.some((root) => isInside(root, real))) return null;
    if (ok && !dotdot && (grants.requested ?? []).some((root) => isInside(root, absolute))) return null;
    if (!ok && (errno === 'ENOENT' || errno === 'ENOTDIR')) return null;
    return real;
  }
  if (ok) return null;
  if (errno !== 'EROFS' && errno !== 'EACCES' && errno !== 'EPERM') return null;
  return grants.write.some((root) => isInside(root, absolute)) ? null : absolute;
}

/**
 * Whether `strace` traces a Bubblewrap run of a trivial reader here and
 * reports the file it read, before the run starts: `null` when it does, the
 * reason when it does not.
 *
 * @param {object} options
 * @param {string} options.strace the `strace` executable
 * @param {string[]} options.vector the Bubblewrap command (executable first) that ends before the process it runs
 * @returns {string|null}
 */
function probeTrace({ strace, vector }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-evaluate-observer-probe-'));
  try {
    const target = path.join(directory, 'probe.txt');
    const output = path.join(directory, 'trace.txt');
    fs.writeFileSync(target, 'probe\n');
    const reader = process.execPath;
    const run = spawnSync(
      strace,
      [...straceCommand(strace, output).slice(1), ...vector, reader, '-e', 'require("node:fs").readFileSync(process.argv[1])', target],
      { encoding: 'utf8', timeout: 20_000, killSignal: 'SIGKILL', stdio: ['ignore', 'ignore', 'pipe'] },
    );
    if (run.error) return `${run.error.code ?? run.error.message}`;
    if (run.status !== 0) {
      const tail = stderrTail(run.stderr);
      return `a traced Bubblewrap run of a trivial reader ended ${run.status === null ? `by ${run.signal}` : `with exit ${run.status}`}${tail ? ` (${tail})` : ''}`;
    }
    let seen = false;
    const real = fs.realpathSync.native(target);
    const traced = new TraceReader({
      marker: null,
      cwd: directory,
      onAccess: (access) => {
        if (access.kind === 'read' && (access.path === target || access.real === real)) seen = true;
      },
    });
    for (const line of (fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '').split('\n')) traced.push(line);
    traced.finish();
    return seen ? null : 'strace ran the process and its trace holds no read of the probe file';
  } catch (error) {
    return error?.message ?? String(error);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

module.exports = {
  BARRIER_MS,
  DARWIN_SYSTEM_ROOTS,
  EXACT_GRANTS,
  REQUESTED_ROOTS,
  LOG_EXECUTABLE,
  ReportStream,
  SYSTEM_ROOTS,
  TRACE_CLONES: CLONES,
  TRACE_PATH_SYSCALLS: SYSCALLS,
  TRACE_SOCKET_CALLS: SOCKET_CALLS,
  TRACE_SYSCALLS,
  TraceReader,
  auditToken,
  decodeString,
  killLiveStreams,
  nodeInstallRoot,
  parseReportLine,
  probeReportStream,
  probeTrace,
  readTrace,
  sentinelProfile,
  socketAddresses,
  splitArguments,
  straceCommand,
  traceDecision,
};
