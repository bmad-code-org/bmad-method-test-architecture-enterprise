/**
 * The sandbox primitives TeA's three isolation modules share (Story 1.62,
 * AD-5, AD-7): `cli/lib/isolate.js` (the review CLI's write isolation),
 * `cli/lib/atdd-isolation.js` (the atdd red-phase sandbox) and
 * `cli/lib/evaluate/confinement.js` (the confinement of a tea-evaluate run).
 * Each selects a Seatbelt or Bubblewrap mechanism, and each needs the same four
 * things from the host, so a defect in one is fixed once, here:
 *
 *   lookup       the executable `name` resolves to on a PATH
 *   path check   whether a path can be carried into a Seatbelt profile or a
 *                Bubblewrap argument vector
 *   containment  whether a path is a root or inside it
 *   probe        whether a mechanism confines a trivial process on this host
 *                (`TRIVIAL_PROCESS` is what each caller starts under it)
 *
 * It also holds the step every spawn of the evaluation layer takes (Story 1.88).
 * `freshPrefix` asks a prefix that carries a `refresh` for the prefix as it is at the spawn.
 * `launchPrefix` adds the guard's `settle`, the cleanup a spawn site calls when the process it started has ended.
 *
 * Every caller keeps its own error class and message text: the checks here
 * answer, and the caller builds the error it has always thrown.
 * The `test:isolation-primitives` script fails when a caller defines one of these
 * again.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

/** How long the probe of a mechanism may take. */
const PROBE_TIMEOUT_MS = 20_000;

/** The process a probe runs under a mechanism: it starts, does nothing and exits 0. */
const TRIVIAL_PROCESS = Object.freeze([process.execPath, '-e', '']);

/**
 * Every character a Seatbelt string literal or a shell-quoted argument cannot
 * carry as itself: the quote that ends a literal, the backslash that escapes
 * inside one, and the line breaks and other control characters.
 */
// eslint-disable-next-line no-control-regex
const UNSAFE_PATH_CHARACTER = /["\\\u0000-\u001F\u007F]/;

/** The executable `name` resolves to on `env`'s PATH (a regular file the user may execute), or `null`. */
function executableOnPath(name, env = process.env) {
  for (const directory of String(env.PATH ?? '').split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // not in this PATH entry; keep looking
    }
  }
  return null;
}

/**
 * Whether `candidate` is a path a sandbox profile or argument vector can carry:
 * a string, absolute, holding no double quote, backslash, line break or other
 * control character.
 */
function isProfileSafePath(candidate) {
  return typeof candidate === 'string' && path.isAbsolute(candidate) && !UNSAFE_PATH_CHARACTER.test(candidate);
}

/**
 * `candidate` when a profile or argument vector can carry it; otherwise throws
 * what `fail(candidate)` builds, so each caller refuses with its own error.
 *
 * @param {unknown} candidate
 * @param {(candidate: unknown) => Error} fail
 * @returns {string}
 */
function assertProfileSafePath(candidate, fail) {
  if (isProfileSafePath(candidate)) return candidate;
  throw fail(candidate);
}

/** Whether `candidate` is `root` or a path inside it. */
function isInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/** The last two lines of a process's standard error joined with ` | `: what a refusal quotes of what a mechanism said. */
function stderrTail(text) {
  return String(text ?? '')
    .trim()
    .split('\n')
    .slice(-2)
    .join(' | ');
}

/**
 * Starts `vector` (a mechanism's command and arguments, ending with
 * `TRIVIAL_PROCESS`) and says whether the process ran.
 *
 * @param {object} options
 * @param {string[]} options.vector
 * @param {object} [options.spawn] extra `spawnSync` options (`cwd`, `env`)
 * @returns {{ ok: true } | { ok: false, error: Error | null, status: number | null, signal: string | null, tail: string }}
 *   `tail` is the last two lines of standard error joined with ` | `
 */
function probeTrivialProcess({ vector, spawn = {} }) {
  const result = spawnSync(vector[0], vector.slice(1), {
    encoding: 'utf8',
    timeout: PROBE_TIMEOUT_MS,
    killSignal: 'SIGKILL',
    stdio: ['ignore', 'ignore', 'pipe'],
    ...spawn,
  });
  if (result.error) return { ok: false, error: result.error, status: null, signal: null, tail: '' };
  if (result.status !== 0) {
    const tail = stderrTail(result.stderr);
    return { ok: false, error: null, status: result.status, signal: result.signal, tail };
  }
  return { ok: true };
}

/**
 * The spawn prefix a process starts through, as it is when the process starts.
 * A prefix that carries a `refresh` function (the evaluation layer's under Bubblewrap, whose list of hidden sockets goes stale) is asked for a new one.
 * Every other prefix is returned as it is.
 * A spawn site calls this just before it starts the process, so the vector it hands the mechanism is as old as the spawn.
 *
 * @param {string[]|undefined} spawnPrefix
 * @returns {string[]}
 */
function freshPrefix(spawnPrefix) {
  return typeof spawnPrefix?.refresh === 'function' ? spawnPrefix.refresh() : (spawnPrefix ?? []);
}

/**
 * The spawn prefix a process starts through and the step that closes its start (Story 1.88).
 * `prefix` is `freshPrefix`'s answer.
 * A prefix that carries a `guard` function (the evaluation layer's under Bubblewrap, whose masks can leave an empty file on the host) has it called now, right before the spawn, and `settle` is what it returned.
 * A spawn site calls `settle` in a `finally` once the process has ended however it ended, so no site can start a process and skip the cleanup.
 * `settle` does nothing for a prefix with no guard, and a second call does nothing.
 *
 * @param {string[]|undefined} spawnPrefix
 * @returns {{ prefix: string[], settle: () => void }}
 */
function launchPrefix(spawnPrefix) {
  const prefix = freshPrefix(spawnPrefix);
  return { prefix, settle: typeof prefix.guard === 'function' ? prefix.guard().settle : () => {} };
}

module.exports = {
  PROBE_TIMEOUT_MS,
  TRIVIAL_PROCESS,
  assertProfileSafePath,
  executableOnPath,
  freshPrefix,
  isInside,
  isProfileSafePath,
  launchPrefix,
  probeTrivialProcess,
  stderrTail,
};
