/**
 * Digests and provenance: one digest function every caller uses, and the facts a
 * run records about where it ran.
 *
 * Two digest implementations produce two answers for the same bytes, and the
 * whole point of carrying a digest is that a later run can decide whether it
 * looked at the same input, so there is exactly one here. (eval-quality's own
 * `digestArtifact` and `digestBytes` stay the digests of engine artifacts and
 * evidence bytes; this one digests a harness's inputs, which stay outside the
 * engine.)
 *
 * Provenance is the commit a run measured and whether the tree was clean, the
 * version a tool printed, and the argv a run was given with anything
 * credential-shaped removed, since a record is meant to be uploaded from CI.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const { boundedProbe } = require('./bounded-probe');

// A passthrough argument can carry a credential. Flags whose name says "secret"
// get their value dropped, and any value shaped like a known token is dropped
// wherever it appears.
const SECRET_FLAG_PATTERN = /key|token|secret|password|credential|auth/i;
// The token prefix is searched for anywhere in the value, not only at its start:
// a start-anchored pattern read `--extra=https://example.test?token=ghp_x` and
// `Authorization: Bearer ghp_x` as ordinary text and published both.
//
// The boundary in front keeps the search from redacting real configuration. A
// prefix counts only where it is not preceded by a letter or a digit, which is
// where a credential sits: at the start of the value, or after `=`, `:`, `?`,
// `&`, `/` or a space. Without it, `sk-` alone would match inside "risk-based"
// and "task-runner". `-` and `_` are deliberately outside the boundary set, so
// `prefix_github_pat_x` is still caught.
const SECRET_TOKEN_PATTERN = /(^|[^A-Za-z0-9])(?:sk[-_]|gh[pousr]_|github_pat_|xox[abprs]-|AIza|AKIA|ya29\.)[A-Za-z0-9._~+/=-]*/g;
const SENSITIVE_VALUE_PATTERN =
  /((?:["']?)(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|credential|authorization|auth)(?:["']?)\s*[:=]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\[redacted\]|[^\s,;}&\]]+)/gi;
const REDACTED = '[redacted]';

/** Any credential-shaped substring of `value`, replaced by `[redacted]`. */
function redactSecrets(value) {
  return String(value)
    .replaceAll(/(\b(?:authorization|proxy-authorization)\b\s*[:=]\s*)(?:bearer|basic)\s+[^\s,;"'}]+/gi, `$1${REDACTED}`)
    .replaceAll(SENSITIVE_VALUE_PATTERN, `$1${REDACTED}`)
    .replaceAll(/([?&](?:api[_-]?key|access[_-]?token|token|secret|password|credential|auth)=)[^&\s]+/gi, `$1${REDACTED}`)
    .replaceAll(SECRET_TOKEN_PATTERN, `$1${REDACTED}`);
}

/**
 * sha256 over canonical bytes.
 *
 * Each part is length-prefixed before it is hashed, so ['ab', 'c'] and
 * ['a', 'bc'] cannot collide: callers hash lists of path and content pairs,
 * where a collision would claim two different inputs were the same. The length
 * and the bytes are separated by a NUL, spelled as a unicode escape so this
 * source stays text.
 *
 * Any typed-array view is hashed as the bytes it holds. A `Uint8Array` reaching
 * the string branch would be hashed as its decimal spelling ("1,2,3"), and every
 * digest taken that way would be wrong without looking wrong.
 *
 * @param {string|Buffer|Uint8Array|Array<string|Buffer|Uint8Array>} parts
 * @returns {string} `sha256:<hex>`
 */
function digest(parts) {
  const list = Array.isArray(parts) ? parts : [parts];
  const hash = createHash('sha256');
  for (const part of list) {
    const bytes = ArrayBuffer.isView(part) ? Buffer.from(part.buffer, part.byteOffset, part.byteLength) : Buffer.from(String(part), 'utf8');
    hash.update(`${bytes.length}\u0000`);
    hash.update(bytes);
  }
  return `sha256:${hash.digest('hex')}`;
}

/**
 * The default byte reader: a file's bytes, or absence as a value.
 *
 * @param {string} file
 * @returns {Promise<{present: true, bytes: Uint8Array}|{present: false}>}
 */
async function readBytesFromDisk(file) {
  try {
    return { present: true, bytes: await fs.promises.readFile(file) };
  } catch (error) {
    if (error.code === 'ENOENT') return { present: false };
    throw error;
  }
}

/**
 * Digest over a set of project files: sorted by path, each contributing its
 * relative path and then its bytes, so a rename changes the digest.
 *
 * A missing file contributes a marker. This is called on the
 * way out of a run that may already have failed because that file is missing,
 * and a reporting path that crashes on the condition it is reporting is worse
 * than a digest that says the file was not there. Every other read error (a
 * permission error, a directory in place of a file) reaches the caller.
 * `.present` is what is tested, because a zero-byte file is present and
 * contributes its own empty bytes.
 *
 * `readBytes` is how a file is read, so a caller that routes its reads through
 * a file-system port of its own passes that port's reader here.
 *
 * @param {string} projectRoot
 * @param {string[]} relativePaths
 * @param {object} [options]
 * @param {(file: string) => Promise<{present: boolean, bytes?: Uint8Array}>} [options.readBytes]
 * @returns {Promise<string>}
 */
async function digestFiles(projectRoot, relativePaths, { readBytes = readBytesFromDisk } = {}) {
  const parts = [];
  for (const relative of [...relativePaths].sort()) {
    const read = await readBytes(path.join(projectRoot, relative));
    parts.push(relative, read.present ? read.bytes : '<missing>');
  }
  return digest(parts);
}

/**
 * Digest over a suite's case prompts, keyed by case id so reordering the cases
 * does not change the answer.
 *
 * @param {Array<{id: string, prompt: string}>} cases
 * @returns {string}
 */
function digestPrompts(cases) {
  const parts = [];
  for (const item of [...cases].sort((left, right) => left.id.localeCompare(right.id))) {
    parts.push(item.id, item.prompt);
  }
  return digest(parts);
}

/**
 * The commit a run measured, and whether the tree was clean.
 *
 * A dirty tree is recorded and the run goes on: local runs are the normal case,
 * and the flag is what stops a later comparison from treating the result as a
 * property of the commit (AD-8: a dirty run cannot be accepted as a baseline).
 *
 * @param {string} projectRoot
 * @returns {{commit: string|null, dirty: boolean}}
 */
function repositoryState(projectRoot) {
  const rev = boundedProbe('git', ['rev-parse', 'HEAD'], { cwd: projectRoot });
  if (!rev.ok) return { commit: null, dirty: false };
  const status = boundedProbe('git', ['status', '--porcelain'], { cwd: projectRoot });
  return {
    commit: rev.stdout.trim(),
    dirty: status.ok && status.stdout.trim().length > 0,
  };
}

/**
 * What `<executable> --version` printed, or null when the probe failed.
 *
 * @param {string} executable
 * @returns {string|null}
 */
function probeVersion(executable) {
  if (!executable) return null;
  const probe = boundedProbe(executable, ['--version']);
  if (!probe.ok) return null;
  const line = String(probe.stdout || probe.stderr || '')
    .trim()
    .split('\n')[0];
  return line.length > 0 ? line : null;
}

/**
 * Passthrough argv with anything credential-shaped removed.
 *
 * @param {string[]} args
 * @returns {string[]}
 */
function redactArgs(args = []) {
  const redacted = [];
  let dropNextValue = false;
  for (const argument of args) {
    if (dropNextValue) {
      redacted.push(REDACTED);
      dropNextValue = false;
      continue;
    }
    const separator = argument.indexOf('=');
    if (argument.startsWith('-') && separator > 0) {
      const flag = argument.slice(0, separator);
      // The value half is tested too: `--extra=sk-live-abc` names nothing
      // credential-shaped, so the flag test alone would let a real token into a
      // file CI uploads.
      const value = argument.slice(separator + 1);
      const sanitized = redactSecrets(value);
      redacted.push(`${flag}=${SECRET_FLAG_PATTERN.test(flag) || sanitized !== value ? REDACTED : value}`);
      continue;
    }
    if (argument.startsWith('-') && SECRET_FLAG_PATTERN.test(argument)) {
      redacted.push(argument);
      dropNextValue = true;
      continue;
    }
    const sanitized = redactSecrets(argument);
    redacted.push(sanitized === argument ? argument : REDACTED);
  }
  return redacted;
}

module.exports = {
  REDACTED,
  digest,
  digestFiles,
  digestPrompts,
  probeVersion,
  redactArgs,
  redactSecrets,
  repositoryState,
};
