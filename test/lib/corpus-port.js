/**
 * Corpus resolution through `eval-quality`'s shipped corpus port.
 *
 * The three corpus digests this module owns, and only those three. A fourth
 * reader remains: `digestFiles` in `test/lib/eval-record.js` takes the
 * `fixtureDigest` four live harnesses record, and it substitutes a `<missing>`
 * marker for an absent file precisely so a reporting path does not crash on the
 * condition it is reporting. FR18 names the three sites below; moving the
 * fourth means deciding what the port's fault becomes in a reporting path, and
 * that is its own change rather than a side effect of this one.
 *
 * TEA digested corpora in three places and each one read the files itself:
 * `tools/generate-probes.js` walked repository paths, `test/eval-trace.js`
 * walked a staged workspace, and `test/lib/probe-scoring.js` digested a parsed
 * value rather than bytes at all. Three readers, three ideas of what a corpus
 * is, and no statement anywhere of what a resolver may do.
 *
 * `createLocalCorpusAdapter` is that resolver written once and certified:
 * `npm run test:corpus-conformance` runs the package's own six assertions
 * against it. A reference is opaque and a lexical escape is refused before any
 * filesystem call, the real path is checked inside the root after the read so a
 * symlink pointing out of the corpus is caught, an abort is honored promptly,
 * and a mechanism answering in a shape the port does not admit is a fault
 * rather than a value. None of that was true of the three helpers this replaces,
 * and the last one matters most: a hand-rolled reader one argument away from
 * `readFileSync(path, 'utf8')` digests text where the port declares bytes, and
 * nothing says so.
 *
 * WHY LOAD, THEN DIGEST
 *
 * The port is asynchronous and two of the three callers digest from deep inside
 * synchronous builders. So resolution is a separate step: a caller names the
 * members it will digest, this resolves all of them through the port, and the
 * returned corpus answers synchronously from what was resolved. A reference
 * nobody named is a named error rather than a silent read, which is stricter
 * than the code it replaces: `digestOf` would digest any file in the
 * repository, and a corpus that cannot say what it is made of is not a corpus.
 *
 * WHAT IS NOT DELEGATED
 *
 * The digest itself. `digest` in `test/lib/eval-record.js` is the length-prefixed
 * hash TEA already attests with, and every value it has produced is recorded in
 * a committed probe corpus. Moving the bytes onto the port without moving the
 * hash keeps every attested digest identical, which is what makes this an
 * adoption rather than a re-attestation. `digestDirectory` is the package's own
 * composite protocol and adopting it is a separate decision with a corpus-wide
 * digest move behind it.
 */

'use strict';

const path = require('node:path');

const { digest } = require('./eval-record');

/** The code a caller narrows on to tell "this member is gone" from any other failure. */
const UNRESOLVABLE_MEMBER = 'corpus-member-unresolvable';

/** `eval-quality` is ESM and this repository is CommonJS, so every entry point through it is asynchronous. */
async function loadAdapters() {
  return import('eval-quality/adapters');
}

/** A repository-relative or workspace-relative path in the spelling the port takes: forward slashes, no leading separator. */
function asReference(relativePath) {
  return relativePath.split(path.sep).join('/');
}

/**
 * Resolve every named member through the corpus port and return a corpus that
 * answers from what was resolved.
 *
 * @param {string} root Absolute path the references resolve against. The port refuses anything outside it.
 * @param {string[]} members References relative to `root`.
 * @param {AbortSignal} [signal]
 * @returns {Promise<{root: string, bytes: (reference: string) => Buffer, digest: (references: string[]) => string}>}
 */
async function loadCorpus(root, members, signal = new AbortController().signal) {
  const { createLocalCorpusAdapter } = await loadAdapters();
  const port = createLocalCorpusAdapter({ root });
  const resolved = new Map();
  for (const member of members) {
    const reference = asReference(member);
    if (resolved.has(reference)) continue;
    // Sequential on purpose. These corpora are small, the failure this reports
    // is a missing member, and a rejected promise inside a parallel batch
    // reports whichever one lost the race rather than the one a caller asked
    // about first.
    let response;
    try {
      response = await port.resolve({ privateRef: reference }, signal);
    } catch (error) {
      // An aborted signal is not a missing member. Labelling it one would let a
      // cancelled run read as a corpus file somebody deleted, which is the same
      // "a null standing for every cause" this code exists to avoid one level
      // down.
      if (signal.aborted) throw error;
      // The port's fault carries the artifact path and puts the cause
      // underneath, so an absent member arrives as "the underlying mechanism
      // threw" with no path in the message. The helper this replaces named the
      // file, and a caller reading a generator failure needs the name more than
      // it needs the fault's own vocabulary.
      const unresolvable = new Error(
        `${reference} could not be resolved from the corpus at ${root}: ${error?.cause?.message ?? error?.message ?? String(error)}`,
        { cause: error },
      );
      // TEA's own code rather than the port's. A caller narrowing on this is
      // asking whether a member is gone, which is a question about this function
      // rather than about whichever fault the adapter happened to raise.
      unresolvable.code = UNRESOLVABLE_MEMBER;
      throw unresolvable;
    }
    resolved.set(reference, Buffer.from(response.bytes));
  }

  const bytes = (reference) => {
    const key = asReference(reference);
    const found = resolved.get(key);
    if (found === undefined) {
      throw new Error(
        `${key} is not a member of the corpus loaded from ${root}; name it when the corpus is loaded, or digest something that is in it`,
      );
    }
    return found;
  };

  return {
    root,
    bytes,
    /**
     * A digest over a set of members, each contributing its reference and then
     * its bytes, so a rename changes the digest. This is the hash TEA has always
     * attested with, over bytes the port resolved.
     *
     * The order is the caller's, and it is load-bearing rather than incidental:
     * every digest already recorded in a committed probe corpus was taken in the
     * order its caller passed, and sorting here would move all of them. A caller
     * whose set has no natural order sorts before calling, which is what
     * `test/eval-trace.js` does with a directory listing.
     */
    digest(references) {
      const parts = [];
      for (const reference of references.map(asReference)) {
        parts.push(reference, bytes(reference));
      }
      return digest(parts);
    },
  };
}

module.exports = { UNRESOLVABLE_MEMBER, loadCorpus };
