/**
 * File reads and writes through `eval-quality`'s shipped file-system port.
 *
 * `test/test-file-system-conformance.js` certifies `createNodeFileSystemAdapter`
 * against the package's own twelve assertions, and this is the seam TEA's
 * harnesses reach it through.
 *
 * WHAT THE PORT IS, AND WHAT IT IS NOT
 *
 * Two methods and no others: `readFile` and `writeFile`, each a byte-level
 * operation at a caller-owned path. There is no `exists`, no `mkdir`, no
 * `readdir`, no copy, no remove, and no cap: `FileReadRequest` is `{path}` and
 * `FileReadResponse` is `{path, bytes}`.
 *
 * That shape decides the conversion rather than being an obstacle to it. An
 * existence check that guards a read is not converted, it is deleted: the read
 * itself answers, because an absent file is a declared fault rather than an
 * exception a caller interprets. An existence check that guards a directory walk
 * or a copy has no port to move to and stays on `fs`, and the harness says so
 * where it does. A cap is the command-line adapter's concept, governed by
 * `maxOutputBytes` over an artifact read back from a spawned run, and that path
 * already goes through that port.
 *
 * WHAT THIS ADDS TO THE ADAPTER
 *
 * One decision and two guards.
 *
 * `readText` answers `{ present: false }` for a file that is not there, because
 * every TEA caller that used to write `existsSync(p) ? readFileSync(p) : null`
 * wants that question answered rather than a fault to catch. Any other fault
 * propagates: a permission error, a directory where a file was expected and an
 * aborted signal are not "the file is absent", and collapsing them into absence
 * is how a broken tree reads as an empty one.
 *
 * An empty path is refused before the port sees it. `''` satisfies every
 * truthiness check a caller is likely to write and then resolves to the process
 * working directory, so a read of it is `EISDIR` on the repository root and a
 * write to it is worse. The port declares `path` as a non-empty string, so this
 * is the package's rule enforced one layer earlier, where the caller's own
 * variable is still in scope and the message can name it.
 *
 * Bytes in, bytes out. `readText` decodes UTF-8 for the callers that want text,
 * and `readBytes` hands back what the port returned, because a digest over
 * decoded text is a digest over something the file does not contain.
 */

'use strict';

const fs = require('node:fs');

/** `eval-quality` is ESM and this repository is CommonJS, so every entry point through it is asynchronous. */
async function loadAdapters() {
  return import('eval-quality/adapters');
}

/**
 * The scripted mechanism, when `TEA_FILE_SYSTEM_FIXTURE` names a readable file
 * of one.
 *
 * A port adopted but never scripted is a port nobody can tell from the thing it
 * replaced. `test/test-probe-conformance.js` and the file-system arm certify the
 * adapter, and neither touches a TEA call site, so a story that adopted the port
 * and left every harness on `fs.readFileSync` would pass both unchanged.
 *
 * So this is the seam `test/test-file-system-port.js` drives. The fixture
 * declares `reads`, a map of path to the text the port must answer with, and
 * `log`, a file every call appends to. A path outside `reads` falls through to
 * the real filesystem, because a harness run reads a great deal this is not
 * scripting and refusing all of it would prove nothing about the one path under
 * assertion.
 *
 * Replace a port call with `fs.readFileSync` and the variable is ignored: the
 * real bytes come back, the scripted ones do not, and the call is missing from
 * the log.
 *
 * Read once at module load, so a run cannot be handed a different filesystem
 * halfway through.
 */
function scriptedFixture() {
  const declared = process.env.TEA_FILE_SYSTEM_FIXTURE;
  if (!declared) return null;
  const parsed = JSON.parse(fs.readFileSync(declared, 'utf8'));
  return { reads: parsed.reads ?? {}, log: parsed.log ?? null };
}

const fixture = scriptedFixture();

function record(line) {
  if (fixture?.log) fs.appendFileSync(fixture.log, `${line}\n`);
}

/** The mechanism the adapter runs on: the real filesystem, or the scripted one over it. */
function mechanism() {
  return {
    readFile: async (filePath) => {
      record(`read ${filePath}`);
      if (Object.hasOwn(fixture.reads, filePath)) return Buffer.from(fixture.reads[filePath], 'utf8');
      return fs.promises.readFile(filePath);
    },
    writeFile: async (filePath, bytes) => {
      record(`write ${filePath}`);
      await fs.promises.writeFile(filePath, bytes);
      return bytes.byteLength;
    },
  };
}

let port;

/** One adapter for the process. It holds no state and the import is the only cost worth avoiding twice. */
async function filePort() {
  if (port === undefined) {
    const { createNodeFileSystemAdapter } = await loadAdapters();
    port = fixture === null ? createNodeFileSystemAdapter() : createNodeFileSystemAdapter(mechanism());
  }
  return port;
}

/**
 * The path a caller passed, refused when it is empty.
 *
 * @param {string} filePath
 * @param {string} what The caller's own name for it, so the message says which path was empty.
 */
function requirePath(filePath, what) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error(`${what} is ${JSON.stringify(filePath)}, and an empty path resolves to a directory rather than to a file`);
  }
  return filePath;
}

/**
 * One file's bytes, or absence.
 *
 * @param {string} filePath
 * @param {AbortSignal} [signal]
 * @returns {Promise<{present: true, bytes: Buffer}|{present: false, bytes: null}>}
 */
async function readBytes(filePath, signal = new AbortController().signal) {
  requirePath(filePath, 'the path to read');
  const resolved = await filePort();
  try {
    const response = await resolved.readFile({ path: filePath }, signal);
    return { present: true, bytes: Buffer.from(response.bytes) };
  } catch (error) {
    // Absence is ENOENT and nothing else.
    //
    // A permission error, a directory where a file was expected and an aborted
    // signal all reach here, and every one of them is a tree that could not
    // answer rather than a file that is not there. The rule is worth stating
    // because the collapse is invisible once it happens: a caller told "absent"
    // about a permission error records a clean reading of a file it never read,
    // and nothing downstream can tell that reading from a real one.
    //
    // The corpus wrapper met the same shape from the other side and got it
    // wrong first: it labelled every rejection "member unresolvable", so a
    // cancelled run reported as a corpus file somebody had deleted.
    if (error?.cause?.code === 'ENOENT') return { present: false, bytes: null };
    throw error;
  }
}

/**
 * One file's text, or absence.
 *
 * @param {string} filePath
 * @param {AbortSignal} [signal]
 * @returns {Promise<{present: true, text: string}|{present: false, text: null}>}
 */
async function readText(filePath, signal) {
  const result = await readBytes(filePath, signal);
  return result.present ? { present: true, text: result.bytes.toString('utf8') } : { present: false, text: null };
}

/**
 * One file's parsed JSON, or absence.
 *
 * A parse failure propagates rather than reading as absence, for the same reason
 * a permission error does: a file that is there and malformed is a different
 * finding from a file that is not there, and the callers converted here treat
 * them differently.
 *
 * @param {string} filePath
 * @param {AbortSignal} [signal]
 * @returns {Promise<{present: true, value: unknown}|{present: false, value: null}>}
 */
async function readJson(filePath, signal) {
  const result = await readText(filePath, signal);
  return result.present ? { present: true, value: JSON.parse(result.text) } : { present: false, value: null };
}

/**
 * Write text to a path the caller has already made a directory for.
 *
 * The port writes bytes at a path and creates no directories, which is the
 * package's boundary rather than an omission: a port that made directories would
 * be deciding where a caller's tree lives.
 *
 * @param {string} filePath
 * @param {string} text
 * @param {AbortSignal} [signal]
 * @returns {Promise<number>} The byte length the port reports it wrote.
 */
async function writeText(filePath, text, signal = new AbortController().signal) {
  requirePath(filePath, 'the path to write');
  const resolved = await filePort();
  const response = await resolved.writeFile({ path: filePath, bytes: Buffer.from(text, 'utf8') }, signal);
  return response.byteLength;
}

module.exports = { readBytes, readJson, readText, requirePath, writeText };
