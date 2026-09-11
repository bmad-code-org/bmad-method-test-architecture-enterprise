/**
 * `eval-quality`'s published file-system port conformance suite, run against the
 * shipped `createNodeFileSystemAdapter`.
 *
 * TEA reads and writes files directly in every harness it has. FR19 moves that
 * onto `FileSystemPort` and certifies the adapter first, which is why this file
 * lands on its own: the arm has to be green before a single call site is cut
 * over, so a conversion that breaks something has a certified baseline to be
 * measured against rather than a simultaneous claim.
 *
 * WHAT THE ARM ASSERTS
 *
 * Twelve outcomes, six per method, over four scenarios each. Read them as the
 * boundary contract every port method owes:
 *
 *   typed-fault                        a failing mechanism becomes a declared
 *                                      AD-28 fault with a non-empty artifactPath,
 *                                      not a bare Error
 *   single-underlying-call-on-success  no hidden retry
 *   single-underlying-call-on-failure  no retry on the way out either
 *   prompt-abort                       an aborted signal settles the call rather
 *                                      than leaving it pending
 *   no-in-band-error                   a mechanism that RETURNS an error-shaped
 *                                      value has that value thrown rather than
 *                                      handed back as a result
 *   schema-valid-return                what resolves parses against the
 *                                      published response schema
 *
 * WHAT IS AND IS NOT CERTIFIED HERE
 *
 * The adapter's boundary is. Its default mechanism is not, and the distinction
 * matters enough to state rather than imply. `runSharedAssertions` needs an
 * `underlyingCalls()` counter, which means the mechanism has to be one this file
 * supplies, and the package exports no `nodeFileSystemMechanism` to wrap the way
 * `test/test-probe-conformance.js` wraps `nodeCommandMechanism`. So the
 * `resolves` scenario runs the real `node:fs/promises` calls the adapter's own
 * default makes, written here and counted, over a real file in a real temporary
 * directory; the other three script the mechanism, which is the only way to make
 * a filesystem fail, hang and lie on demand.
 *
 * What that leaves uncertified is one line of the package: whether its default
 * mechanism is the pair of calls this file believes it is. That is the package's
 * to hold, and the alternative is worse, since a mechanism nobody can count
 * turns six of the twelve assertions into a claim nothing checks.
 *
 * Usage: node test/test-file-system-conformance.js
 * Exit codes: 0 = every published assertion passed, 1 = an assertion failed,
 *             2 = the suite could not run
 */

'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

// The expected count comes from the package through the one accessor, which is
// what turns an arm the package stopped publishing into a failure naming that
// arm rather than a count comparison against `undefined`.
const { expectedOutcomeCount } = require('./lib/conformance-counts');

const colors = {
  reset: '[0m',
  red: '[31m',
  green: '[32m',
  dim: '[2m',
};

const FIXTURE_TEXT = 'the file-system conformance fixture\n';
const FIXTURE_BYTES = new TextEncoder().encode(FIXTURE_TEXT);

/**
 * The real `node:fs/promises` pair the adapter's own default makes, written here
 * so the calls can be counted.
 *
 * `writeFile` returns the byte count itself because `fs.writeFile` resolves to
 * `undefined`, and the adapter assembles `FileWriteResponse.byteLength` from
 * whatever the mechanism returned. Returning the length from the request instead
 * would make the parse unfalsifiable for that method, which is the package's own
 * note on the same line.
 */
function realMechanism() {
  let calls = 0;
  return {
    mechanism: {
      readFile: (filePath, signal) => {
        calls += 1;
        return fsp.readFile(filePath, { signal });
      },
      writeFile: async (filePath, bytes, signal) => {
        calls += 1;
        await fsp.writeFile(filePath, bytes, { signal });
        return bytes.length;
      },
    },
    calls: () => calls,
  };
}

/** A mechanism whose every method rejects, for the `fails` scenario. One call, one rejection, no retry. */
function failingMechanism() {
  let calls = 0;
  const fail = async () => {
    calls += 1;
    throw new Error('the fixture mechanism was told to fail');
  };
  return { mechanism: { readFile: fail, writeFile: fail }, calls: () => calls };
}

/**
 * A mechanism that never settles on its own, for the `hangs` scenario.
 *
 * The adapter's own abort handling is what has to answer, so this rejects only
 * when the signal says to, and checks `aborted` first in case the signal was
 * already aborted before the listener was attached.
 */
function hangingMechanism() {
  let calls = 0;
  const hang = (...args) => {
    const signal = args.at(-1);
    return new Promise((resolve, reject) => {
      calls += 1;
      if (signal.aborted) reject(signal.reason);
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  };
  return { mechanism: { readFile: hang, writeFile: hang }, calls: () => calls };
}

/**
 * A mechanism that resolves with a shape the port contract does not admit, for
 * the `in-band-error` scenario.
 *
 * A filesystem that answers with an error object rather than throwing is the
 * shape this assertion exists for, and both methods can be made to do it: the
 * adapter assembles the response from what the mechanism returned, so a read
 * that hands back anything but bytes and a write that hands back anything but a
 * byte count both fail the published response parse, which is the port throwing
 * rather than returning the lie.
 */
function inBandErrorMechanism() {
  let calls = 0;
  const lie = async () => {
    calls += 1;
    return { errno: -2, code: 'ENOENT', message: 'no such file or directory' };
  };
  return { mechanism: { readFile: lie, writeFile: lie }, calls: () => calls };
}

const MECHANISMS = {
  resolves: realMechanism,
  fails: failingMechanism,
  hangs: hangingMechanism,
  'in-band-error': inBandErrorMechanism,
};

async function main() {
  const { createNodeFileSystemAdapter } = await import('eval-quality/adapters');
  const { runFileSystemPortConformance, formatConformanceReport, CONFORMANCE_OUTCOME_COUNTS } = await import('eval-quality/conformance');

  // Resolved before anything is staged: it throws when the package's registry
  // has moved, and a throw above the `finally` below leaves a directory behind.
  const expected = expectedOutcomeCount(CONFORMANCE_OUTCOME_COUNTS, 'file-system');

  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-file-system-conformance-'));
  const readPath = path.join(workspace, 'fixture.txt');
  const writePath = path.join(workspace, 'written.txt');
  fs.writeFileSync(readPath, FIXTURE_TEXT);

  /** One subject per method, differing only in the request each sends. */
  const subjectFor = (name, sampleRequest) => ({
    name,
    sampleRequest,
    // A fresh mechanism per scenario, because `underlyingCalls()` is read as an
    // absolute count and a shared counter would carry the previous scenario's
    // calls into the next one's assertion.
    async build(scenario) {
      const scripted = MECHANISMS[scenario]();
      const port = createNodeFileSystemAdapter(scripted.mechanism);
      return {
        port: (request, signal) => (name.endsWith('write') ? port.writeFile(request, signal) : port.readFile(request, signal)),
        underlyingCalls: scripted.calls,
      };
    },
  });

  const problems = [];
  // In a `finally`, so a throw out of the suite or the renderer does not leave
  // one temporary directory behind per failed invocation.
  try {
    const report = await runFileSystemPortConformance(
      subjectFor('tea file-system adapter read', { path: readPath }),
      subjectFor('tea file-system adapter write', { path: writePath, bytes: FIXTURE_BYTES }),
    );
    console.log(formatConformanceReport(report));

    // Both halves of the verdict, because either alone reads as a pass it is not.
    // A suite handed a subject it cannot build still produces the full count, so
    // the count agreeing proves only that the runner ran; and every outcome
    // passing over a short list proves only that what ran passed.
    if (report.outcomes.length !== expected) {
      problems.push(`the suite produced ${report.outcomes.length} outcome(s) and a complete file-system run is ${expected}`);
    }
    for (const outcome of report.outcomes) {
      if (!outcome.passed) problems.push(`${outcome.id}: ${outcome.detail}`);
    }
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }

  if (problems.length > 0) {
    console.error(`\n${colors.red}${problems.length} conformance problem(s):${colors.reset}`);
    for (const problem of problems) console.error(`   ${problem}`);
    return 1;
  }

  console.log(`\n${colors.green}all ${expected} published file-system conformance assertions passed${colors.reset}\n`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`${colors.red}file-system conformance could not run:${colors.reset} ${error.stack ?? error}`);
    process.exit(2);
  });
