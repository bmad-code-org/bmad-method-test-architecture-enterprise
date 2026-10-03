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
   * One canary read: a file read through the sandbox's token that the log should report. A canary counts as sent once its
   * process has started, so one that a target killed or stopped, or a starved host could not finish, counts as a canary the log
   * did not deliver and can only make the trial lossy; no target can hide a loss by ending its canaries. Returns whether
   * the process started.
   */
  async canaryRead() {
    const { file, started } = await this.tokenRead(`canary-${this.canaryCount++}`);
    if (started) this.canarySent.add(file);
    fs.rmSync(file, { force: true });
    return started;
  }

  /** Starts the canary reads, one every `CANARY_MS` while fewer than `CANARY_IN_FLIGHT` run. */
  startCanaries() {
    if (this.canaryTimer !== null) return;
    const tick = () => {
      if (this.canaryRunning.size < CANARY_IN_FLIGHT) {
        // A canary the runtime could not make is one fewer sent; the final canary still accounts for the trial.
        const read = this.canaryRead()
          .catch(() => {})
          .finally(() => this.canaryRunning.delete(read));
        this.canaryRunning.add(read);
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
    await Promise.all(this.canaryRunning);
    if (final && !(await this.canaryRead()))
      throw this.fail("the audit's final canary read could not start, so how complete the log's reports were is unmeasured");
  }

  /** The canaries sent and the ones the log delivered, as read so far; a trial's are final once `stopCanaries` and the barrier are done. */
  canaries() {
    let delivered = 0;
    for (const file of this.canarySent) if (this.canaryReported.has(file)) delivered += 1;
    return { sent: this.canarySent.size, delivered, lostEvents: this.lost };
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

/** The syscalls `strace` reports: the ones that take a path to open, write or read a link, and `execve` for the start of the target. */
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
]);

/**
 * The `strace` arguments before the command it traces: follow every process,
 * stop only at the traced syscalls (named with the optional `?` prefix, since
 * the names a strace knows depend on its version and the architecture;
 * `--seccomp-bpf`, which makes a syscall-heavy process cost about what it does
 * untraced; without it one ran 100 times slower), name each fd's path (`-y`),
 * name a child's pid as strace sees it (`--decode-pids=pidns`: a namespace's
 * `clone` returns the namespace's number), keep full paths and write the trace
 * to `output`.
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
    '-o',
    output,
    '--',
  ];
}

/** The syscalls that create a process. */
const CLONES = new Set(['clone', 'clone3', 'fork', 'vfork']);

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
    } else if (text.endsWith(' <unfinished ...>')) {
      const name = /^(\w+)\(/.exec(text)?.[1];
      if (name !== undefined) this.pending.set(pid, text.slice(0, -' <unfinished ...>'.length));
      if (CLONES.has(name) && this.started) this.timeline.push(this.cloneEvent(pid, text));
      return;
    }
    const call = /^(\w+)\(([^]*)$/.exec(text);
    if (call === null) return;
    const name = call[1];
    if (name === 'execve' && this.noteExecve(text)) return;
    if (!this.started) return;
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
   * Replays the timeline: a process starts in the directory the target started in, a `chdir` changes its own (a thread's too, when
   * they share it), a forked child copies its parent's at the call and a thread shares it; each access that waited for a
   * directory resolves against its process's at that point.
   */
  finish() {
    const cells = new Map();
    const cellOf = (pid) => {
      if (!cells.has(pid)) cells.set(pid, { cwd: this.cwd, crossed: false });
      return cells.get(pid);
    };
    for (const event of this.timeline) {
      if (event.kind === 'chdir') {
        const cell = cellOf(event.pid);
        const absolute = path.isAbsolute(event.target);
        const raw = absolute ? event.target : `${cell.cwd}/${event.target}`;
        const through = throughProcessLink(raw);
        // A directory reached through a process link (`/proc/self/cwd/..`) is no directory the grants can judge by name: what is
        // read relative to it afterwards is listed, until a `chdir` to an absolute path leaves it.
        cell.crossed = (absolute ? false : cell.crossed) || through.reentry;
        cell.cwd = through.walked.collapsed;
      } else if (event.kind === 'clone') {
        if (event.child !== null) {
          const parent = cellOf(event.pid);
          cells.set(event.child, event.shares ? parent : { cwd: parent.cwd, crossed: parent.crossed });
        }
      } else {
        const cell = cellOf(event.pid);
        event.emit(cell.cwd, cell.crossed);
      }
    }
    this.timeline = [];
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
 * Whether an access is an observed mount, and the path to list for it, or
 * `null` (the same decision for every access of a Bubblewrap call).
 *
 * A read is reported when its path is withheld (the evaluation folder, the
 * project's git directory, the private root, each apart from what the sandbox
 * is excepted) whatever the answer was, or when it reached a path no grant
 * covers (a read of a path that does not exist reached nothing). A write the
 * mechanism did not refuse landed in a place the sandbox may write; a refused
 * one is reported when its path is withheld or outside what the sandbox may write.
 *
 * @param {object} access `TraceReader`'s access
 * @param {{ read: string[], write: string[], withheld: string[], withheldExcept: string[] }} grants
 * @returns {string|null}
 */
function traceDecision(access, grants) {
  const { kind, path: absolute, real, ok, errno, dotdot = false, reentry = false } = access;
  const except = grants.withheldExcept.some((root) => isInside(root, absolute) && isInside(root, real));
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
  splitArguments,
  straceCommand,
  traceDecision,
};
