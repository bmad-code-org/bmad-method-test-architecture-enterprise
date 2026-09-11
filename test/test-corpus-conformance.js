/**
 * `eval-quality`'s corpus port conformance arm, run against the adapter the
 * package ships.
 *
 * TEA resolves corpus bytes in three places and each one reads files itself,
 * with its own idea of what a corpus is and no shared statement of what a
 * resolver may do. `createLocalCorpusAdapter` is that resolver written once,
 * with the decisions stated: a reference is opaque and lexical escape is
 * refused before any filesystem call, the real path is checked inside the root
 * after the read so an absent file still costs exactly one underlying call, an
 * abort is honored promptly, and a mechanism that answers in a shape the port
 * does not admit is a fault rather than a value.
 *
 * The arm landed before any TEA call site moved onto the adapter, in its own
 * commit and touching nothing else. Certifying after a cutover would mean a
 * failing arm and three changed harnesses arriving together, with nothing to say
 * which of them was wrong.
 *
 * The block at the end of this file arrived with the cutover rather than with
 * the arm, and it is about TEA's own reader rather than about the adapter: that
 * `test/lib/corpus-port.js` keeps the caller's order, refuses a member nobody
 * named, and refuses the two escapes only the port refuses. That last pair is
 * what holds TEA to the adapter, since every other assertion here passes against
 * any reader that returns bytes.
 *
 * The arm is the six shared assertions every port method answers, driven by a
 * scripted mechanism per scenario: one that resolves, one that rejects, one
 * that answers in a shape the response parser refuses, and one that never
 * settles. A real filesystem does none of the last three on demand, and the
 * `resolves` scenario runs against the real one so the counted call is a real
 * read.
 *
 * No model call, no credential, no network.
 *
 * Usage: node test/test-corpus-conformance.js
 *
 * Exit codes:
 *   0  every published assertion passed
 *   1  an assertion failed, or the arm produced a different number of them
 *   2  the package could not be imported, so nothing was measured
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { expectedOutcomeCount } = require('./lib/conformance-counts');
const { loadCorpus } = require('./lib/corpus-port');

const colors = {
  reset: '[0m',
  red: '[31m',
  green: '[32m',
  dim: '[2m',
};

/** The one corpus member every scenario resolves, and the bytes it holds. */
const MEMBER = 'corpus-member.json';
const MEMBER_BYTES = `${JSON.stringify({ corpus: 'tea', member: MEMBER }, null, 2)}\n`;

/** A mechanism that counts what it was asked to do, so the single-call assertions measure the filesystem and not the port. */
function countingMechanism() {
  let calls = 0;
  return {
    mechanism: async (resolvedPath, signal) => {
      calls += 1;
      return fs.promises.readFile(resolvedPath, { signal });
    },
    calls: () => calls,
  };
}

/** A mechanism whose read always rejects. One call, one rejection, no retry. */
function failingMechanism() {
  let calls = 0;
  return {
    mechanism: async () => {
      calls += 1;
      throw new Error('the corpus mechanism was told to fail');
    },
    calls: () => calls,
  };
}

/** A mechanism that never settles on its own: the adapter's own abort handling is what has to answer. */
function hangingMechanism() {
  let calls = 0;
  return {
    mechanism: (resolvedPath, signal) =>
      new Promise((resolve, reject) => {
        calls += 1;
        if (signal.aborted) reject(signal.reason);
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      }),
    calls: () => calls,
  };
}

/**
 * A mechanism that resolves with a shape the port contract does not admit.
 *
 * Text rather than bytes, which is the mistake a hand-rolled resolver actually
 * makes: `readFileSync(path, 'utf8')` is one argument away from the byte read
 * the port declares, and a digest taken over the wrong one is silently a
 * different digest.
 */
function inBandErrorMechanism() {
  let calls = 0;
  return {
    mechanism: async () => {
      calls += 1;
      return MEMBER_BYTES;
    },
    calls: () => calls,
  };
}

const MECHANISMS = {
  resolves: countingMechanism,
  fails: failingMechanism,
  hangs: hangingMechanism,
  'in-band-error': inBandErrorMechanism,
};

async function main() {
  let createLocalCorpusAdapter;
  let runCorpusPortConformance;
  let formatConformanceReport;
  let CONFORMANCE_OUTCOME_COUNTS;
  try {
    ({ createLocalCorpusAdapter } = await import('eval-quality/adapters'));
    ({ runCorpusPortConformance, formatConformanceReport, CONFORMANCE_OUTCOME_COUNTS } = await import('eval-quality/conformance'));
  } catch (error) {
    // Exit 2: a package that cannot be imported certified nothing, and reading
    // that as a failed assertion would file an environment fault as a defect in
    // the adapter.
    console.error(`${colors.red}eval-quality could not be imported: ${error.message}${colors.reset}`);
    console.error(`${colors.dim}Run npm ci. Nothing about the corpus port was measured.${colors.reset}`);
    return 2;
  }

  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-corpus-conformance-'));

  const subject = {
    name: 'tea local corpus adapter',
    sampleRequest: { privateRef: MEMBER },
    async build(scenario) {
      const scripted = MECHANISMS[scenario]();
      const port = createLocalCorpusAdapter({ root: workspace, mechanism: scripted.mechanism });
      return { port: (request, signal) => port.resolve(request, signal), underlyingCalls: scripted.calls };
    },
  };

  const expected = expectedOutcomeCount(CONFORMANCE_OUTCOME_COUNTS, 'corpus');
  const problems = [];
  // In a `finally`, because a throw out of the suite or the renderer would
  // otherwise leave one temporary directory behind per failed invocation.
  try {
    fs.writeFileSync(path.join(workspace, MEMBER), MEMBER_BYTES);
    const report = await runCorpusPortConformance(subject);
    console.log(formatConformanceReport(report));
    if (report.outcomes.length !== expected) {
      problems.push(`the suite produced ${report.outcomes.length} outcome(s) and a complete corpus run is ${expected}`);
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

  // TEA's own wrapper, whose two properties are what keep the cutover an
  // adoption rather than a re-attestation. The escape and fault behavior above
  // is the adapter's and is certified by the arm; these two are this
  // repository's and nothing else executes them.
  const workspaceFor = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-corpus-wrapper-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-corpus-outside-'));
  const wrapperProblems = [];
  try {
    fs.writeFileSync(path.join(workspaceFor, 'a.txt'), 'a');
    fs.writeFileSync(path.join(workspaceFor, 'b.txt'), 'b');
    // One file outside the corpus, reachable two ways: by climbing out of the
    // root lexically, and by a symlink inside it.
    fs.writeFileSync(path.join(outside, 'outside.txt'), 'outside the corpus');
    fs.symlinkSync(path.join(outside, 'outside.txt'), path.join(workspaceFor, 'escape.txt'));
    const corpus = await loadCorpus(workspaceFor, ['a.txt', 'b.txt']);

    // The order is the caller's. Every digest recorded in a committed probe
    // corpus was taken in the order its caller passed, so a corpus that sorted
    // for itself would move all of them.
    if (corpus.digest(['a.txt', 'b.txt']) === corpus.digest(['b.txt', 'a.txt'])) {
      wrapperProblems.push(
        'the corpus digests two orders of the same members to one value, so the caller order it promises is not honored',
      );
    }

    // The two refusals only the port makes, which is what holds TEA's reader to
    // the adapter rather than to any reader that happens to return bytes. A
    // `readFileSync` written back into `loadCorpus` passes every other
    // assertion in this file, including the two above; it resolves both of
    // these happily.
    // The climbing reference names the real file outside the root, so a reader
    // that resolves it succeeds rather than failing on a path that happens not
    // to exist, which would pass this assertion for the wrong reason.
    const climbing = path.relative(workspaceFor, path.join(outside, 'outside.txt')).split(path.sep).join('/');
    for (const [reference, what] of [
      [climbing, 'a reference climbing out of the root'],
      ['escape.txt', 'a symlink inside the root pointing out of it'],
    ]) {
      let refusedEscape = false;
      try {
        await loadCorpus(workspaceFor, [reference]);
      } catch {
        refusedEscape = true;
      }
      if (!refusedEscape) wrapperProblems.push(`${what} was resolved instead of refused, so TEA is not reading through the corpus port`);
    }

    // A member nobody named is a named error. The helper this replaces would
    // read any file in the repository, so a corpus could not say what it was
    // made of.
    let refused = false;
    try {
      corpus.digest(['c.txt']);
    } catch (error) {
      refused = /not a member of the corpus/.test(error.message);
    }
    if (!refused) wrapperProblems.push('a reference outside the loaded corpus was digested instead of refused');
  } finally {
    fs.rmSync(workspaceFor, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }

  if (wrapperProblems.length > 0) {
    console.error(`\n${colors.red}${wrapperProblems.length} problem(s) in TEA's corpus wrapper:${colors.reset}`);
    for (const problem of wrapperProblems) console.error(`   ${problem}`);
    return 1;
  }

  console.log(
    `\n${colors.green}all ${expected} published corpus-port conformance assertions passed, and TEA's corpus keeps caller order and refuses an unloaded member${colors.reset}\n`,
  );
  return 0;
}

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(`${colors.red}${error?.stack ?? error}${colors.reset}`);
      process.exit(1);
    },
  );
}
