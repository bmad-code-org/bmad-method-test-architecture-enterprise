'use strict';

/**
 * The audit half of a trial's file-system confinement (Story 1.31), loaded
 * into every Node process of a trial's target through NODE_OPTIONS=--require
 * (`confinement.js` `targetSandbox`).
 *
 * The mechanism (macOS Seatbelt or Linux Bubblewrap) is what holds the
 * boundary: it denies the target every read and write of the evaluation
 * folder and every write outside its workspace, whether or not this file is
 * loaded. This file records what the target reached for, so the trial's
 * isolation manifest can list it as `observedMounts` and eval-quality can
 * record the violation: each path a process passes to one of the `fs`
 * functions named in OPERATIONS and STREAMS below (their callback, `Sync` and
 * promise forms) outside what the trial was granted is appended to the report
 * once, as one JSON line `{ "path": <absolute path> }`, denied or not.
 *
 * Not seen: the module loader's own lookups (`require` and `import` resolve
 * and stat paths through Node's internal bindings; only the file a CommonJS
 * `require` then reads passes through `fs.readFileSync`), `fs.watchFile` (a
 * metadata poll), a native addon's own file access, and every process that is
 * not Node or does not load this file (Story 1.60).
 *
 * Granted, and never reported: the paths the runtime names in
 * TEA_EVALUATE_CONFINEMENT_AUDIT (the workspace, the report file itself and
 * the system paths the target's registry entry declares), the
 * Node installation this process runs from, the operating system's own
 * directories, and this file and the status shim beside it. A path is granted
 * when its real path lies under a grant, and is reported by its real path, so
 * a link inside the workspace that leads outside it is reported as the path it
 * leads to. Anything under the
 * evaluation folder is reported whatever grant covers it. A read of a path
 * that does not exist is not reported, since it reached nothing (a search for
 * a configuration file up the directory tree, say), unless it lies under the
 * evaluation folder, which Bubblewrap answers as empty; every write outside
 * the grants is. A metadata probe (`stat`, `access`, `exists`) opens nothing
 * and is not reported.
 *
 * It never changes what a call does: every wrapped function runs the
 * original with the original arguments and returns or throws what it does,
 * and a failure of the audit itself is swallowed. It writes nothing to the
 * process's standard streams.
 *
 * Plain CommonJS with no dependency, since it loads before anything else in
 * the process, from whatever directory the target runs in.
 */

const fs = require('node:fs');
const path = require('node:path');

const AUDIT_ENV = 'TEA_EVALUATE_CONFINEMENT_AUDIT';

/** The operating system's own directories, which every process reads from. */
const SYSTEM_ROOTS = [
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
];

/** Each wrapped function and what it does with its path arguments, by position: open (by its flags), read or write. */
const OPERATIONS = {
  open: ['open'],
  readFile: ['read'],
  readdir: ['read'],
  opendir: ['read'],
  readlink: ['read'],
  writeFile: ['write'],
  appendFile: ['write'],
  mkdir: ['write'],
  mkdtemp: ['write'],
  rm: ['write'],
  rmdir: ['write'],
  unlink: ['write'],
  rename: ['write', 'write'],
  copyFile: ['read', 'write'],
  cp: ['read', 'write'],
  symlink: [null, 'write'],
  link: ['read', 'write'],
  truncate: ['write'],
  chmod: ['write'],
  chown: ['write'],
  utimes: ['write'],
  lchmod: ['write'],
  lchown: ['write'],
  lutimes: ['write'],
  watch: ['read'],
};
const STREAMS = { createReadStream: ['read'], createWriteStream: ['write'] };

function configuration() {
  try {
    const parsed = JSON.parse(process.env[AUDIT_ENV] ?? '');
    if (typeof parsed?.report !== 'string' || !Array.isArray(parsed.granted)) return null;
    const absolute = (list) => (Array.isArray(list) ? list : []).filter((entry) => typeof entry === 'string' && path.isAbsolute(entry));
    return {
      report: parsed.report,
      granted: absolute(parsed.granted),
      withheld: absolute(parsed.withheld),
      withheldExcept: absolute(parsed.withheldExcept),
    };
  } catch {
    return null;
  }
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/**
 * The directory the Node installation running `execPath` sits in: the
 * directory above its `bin/`, or the executable's own directory when that
 * would be the file system's root (a node at `/bin/node`), which would grant
 * every path.
 */
function nodeInstallRoot(execPath) {
  const directory = path.dirname(path.resolve(execPath));
  const prefix = path.dirname(directory);
  return prefix === path.parse(prefix).root ? directory : prefix;
}

const config = configuration();

if (config !== null) {
  const originalLstat = fs.lstatSync;
  const originalRealpath = fs.realpathSync.native;
  const originalAppend = fs.appendFileSync;
  const nodePrefix = nodeInstallRoot(process.execPath);
  // This file and the status shim Bubblewrap starts in a target's place, which a process loads before its target runs.
  const own = [__filename, path.join(__dirname, 'confinement-status.cjs')];
  const roots = [...config.granted, ...SYSTEM_ROOTS, nodePrefix, ...own];
  // Each grant as the system resolves it too, since a path is granted by its real path (`/etc` is `/private/etc` on macOS).
  for (const root of [nodePrefix, ...own, ...SYSTEM_ROOTS]) {
    try {
      roots.push(originalRealpath(root));
    } catch {
      // A grant as spelled stays granted.
    }
  }
  const reported = new Set();

  /** The real path of `candidate`, the part that does not exist joined to the real path of the part that does. */
  const realLoosely = (candidate) => {
    const missing = [];
    let existing = candidate;
    for (;;) {
      try {
        return path.join(originalRealpath(existing), ...missing);
      } catch {
        const parent = path.dirname(existing);
        if (parent === existing) return candidate;
        missing.unshift(path.basename(existing));
        existing = parent;
      }
    }
  };

  const absoluteOf = (target) => {
    if (typeof target === 'string') return path.resolve(target);
    if (Buffer.isBuffer(target)) return path.resolve(target.toString('utf8'));
    if (target instanceof URL && target.protocol === 'file:') return path.resolve(decodeURIComponent(target.pathname));
    return null;
  };

  // By the real path alone: a link inside a grant that leads outside it reaches what it names.
  const granted = (real) => roots.some((root) => isInside(root, real));

  const missing = (absolute) => {
    try {
      originalLstat(absolute);
      return false;
    } catch (error) {
      return error?.code === 'ENOENT' || error?.code === 'ENOTDIR';
    }
  };

  const writes = (flags) => {
    if (typeof flags === 'string') return /[wa+]/.test(flags);
    if (typeof flags === 'number') {
      const { O_WRONLY = 1, O_RDWR = 2, O_APPEND = 8, O_CREAT = 512, O_TRUNC = 1024 } = fs.constants;
      return (flags & (O_WRONLY | O_RDWR | O_APPEND | O_CREAT | O_TRUNC)) !== 0;
    }
    return false;
  };

  const audit = (kinds, args) => {
    for (const [index, kind] of kinds.entries()) {
      if (kind === null) continue;
      const absolute = absoluteOf(args[index]);
      if (absolute === null || reported.has(absolute)) continue;
      const real = realLoosely(absolute);
      // The evaluation folder, and the project's git directory with its worktree's own entry excepted, are reported
      // whatever grant covers them (a system path declared over the project, say) and whatever the answer, since
      // Bubblewrap hides them behind an empty file system.
      const except = config.withheldExcept.some((root) => isInside(root, absolute) && isInside(root, real));
      const withheld = !except && config.withheld.some((root) => isInside(root, absolute) || isInside(root, real));
      if (!withheld && granted(real)) continue;
      const writing = kind === 'write' || (kind === 'open' && writes(typeof args[1] === 'function' ? undefined : args[1]));
      if (!writing && !withheld && missing(absolute)) continue;
      if (reported.has(real)) continue;
      reported.add(absolute);
      reported.add(real);
      originalAppend(config.report, `${JSON.stringify({ path: real })}\n`);
    }
  };

  const wrap = (holder, name, kinds) => {
    const original = holder?.[name];
    if (typeof original !== 'function') return;
    const wrapped = function (...args) {
      try {
        audit(kinds, args);
      } catch {
        // The audit never changes what the call does.
      }
      return Reflect.apply(original, this, args);
    };
    for (const key of Reflect.ownKeys(original)) {
      if (['length', 'name', 'prototype'].includes(key)) continue;
      try {
        Object.defineProperty(wrapped, key, Object.getOwnPropertyDescriptor(original, key));
      } catch {
        // A property that cannot be copied stays on the original only.
      }
    }
    holder[name] = wrapped;
  };

  for (const [name, kinds] of Object.entries(OPERATIONS)) {
    wrap(fs, name, kinds);
    wrap(fs, `${name}Sync`, kinds);
    wrap(fs.promises, name, kinds);
  }
  for (const [name, kinds] of Object.entries(STREAMS)) wrap(fs, name, kinds);
}

module.exports = { nodeInstallRoot };
