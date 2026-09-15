/**
 * Prove the file-system port is in the path every converted harness reads and
 * writes through.
 *
 * WHY THIS FILE EXISTS
 *
 * `test/test-file-system-conformance.js` certifies `createNodeFileSystemAdapter`
 * against the package's own twelve assertions. That is worth having and it
 * proves nothing about TEA: the conformance runner builds its own adapter and
 * never touches a TEA call site. A story that adopted the port, certified it,
 * and left every harness on `fs.readFileSync` would pass that check unchanged.
 *
 * That is not hypothetical. Story 3.2 shipped with its central claim held by
 * nothing, and a reviewer found it by replacing the port call with a plain read
 * and watching the whole gate stay green.
 *
 * So the question this file answers is the only one that distinguishes adoption
 * from decoration: if someone replaced a port call in a converted harness with
 * `fs.readFileSync`, what fails?
 *
 * The answer is this file, and the mechanism is a scripted filesystem.
 * `test/lib/file-system-port.js` reads `TEA_FILE_SYSTEM_FIXTURE` and, when it is
 * set, hands the adapter a mechanism that answers declared paths with declared
 * text and logs every call. A direct `fs` call ignores the variable entirely: it
 * reads the real bytes and appears in no log.
 *
 * WHAT EACH CASE PROVES
 *
 * One case per converted unit, each running a real harness as a child process
 * against its real corpus with no model call. A port that is in the path of a
 * helper called directly but not in the path of a run is decoration wearing a
 * smaller disguise, which is why nothing here calls a converted function in
 * process except the three wrapper decisions at the end, which no harness run
 * can reach.
 *
 *   test/eval-trace.js            The ground truth is scripted as text that is
 *                                 not JSON. Through the port `loadGroundTruth`
 *                                 answers null and the harness exits on an
 *                                 environment class; through `fs.readFileSync`
 *                                 the real corpus parses and the run validates a
 *                                 corpus that is fine, so the outcome differs by
 *                                 the whole verdict.
 *
 *   test/eval-trace.js            Nothing scripted, only logged. Staging a
 *                                 workspace writes `_bmad/tea/config.yaml`, and
 *                                 that write must appear in the log.
 *
 *   test/eval-test-review.js      The review corpus's own ground truth is
 *                                 scripted as text that is not JSON, and
 *                                 pre-flight must report it that way. A direct
 *                                 read parses the real corpus and reports
 *                                 nothing.
 *
 *   test/lib/suite-manifest.js    The suite manifest is scripted as text that is
 *                                 not JSON under the same harness. The record
 *                                 the run was asked for cannot be written
 *                                 without the suite identity, so the harness
 *                                 refuses with the manifest named.
 *
 *   test/lib/eval-record.js       Nothing scripted. Every fixture the manifest
 *                                 names must appear in the log as a read, which
 *                                 is `digestFiles`, and the `--json` path must
 *                                 appear as a write, which is `writeRecord`.
 *
 *   test/eval-fragment-selection.js
 *                                 One workflow's evals.json is scripted as text
 *                                 that is not JSON, and `--validate-only` must
 *                                 refuse it by name. A direct read validates
 *                                 eight suites and exits 0.
 *
 *   test/lib/probe-scoring.js     A stored verdict under test/replay is scripted
 *                                 as text that is not JSON, and the scoring run
 *                                 must fail. A direct read scores all 55 probes.
 *
 *   test/lib/eval-quality-inputs.js
 *                                 The scoring policy is scripted as text that is
 *                                 not JSON under the same run, which is the
 *                                 other file that module reads.
 *
 *   test/eval-nfr.js              Each of the three remaining behavioural
 *   test/eval-test-design.js      harnesses has its own corpus scripted as text
 *   test/eval-bmad-tea-routing.js that is not JSON, and `--validate-only` must
 *                                 refuse it. A direct read validates the real
 *                                 corpus and exits 0, so the outcome differs by
 *                                 the whole verdict. The routing harness gets a
 *                                 second case for the menu its prompts are built
 *                                 from, and the selection harness one for the
 *                                 step file its prompts quote, because a prompt
 *                                 reader is the half a corpus case cannot reach.
 *
 *   test/eval-all.js              Every suite pre-flights with `node` standing in
 *                                 for a runner, which spends nothing. Each child
 *                                 record must appear in the log as a read and the
 *                                 run summary as a write.
 *
 * No model call, no credential, no network.
 *
 * Usage: node test/test-file-system-port.js
 *
 * Exit codes:
 *   0  every read and write under assertion went through the port
 *   1  a call site bypassed it
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { readText, writeText } = require('./lib/file-system-port');
const { digest, digestFiles } = require('./lib/eval-record');

const PROJECT_ROOT = path.join(__dirname, '..');

/** The harnesses driven below, each a real entry point run as a child process. */
const TRACE_HARNESS = path.join(PROJECT_ROOT, 'test', 'eval-trace.js');
const REVIEW_HARNESS = path.join(PROJECT_ROOT, 'test', 'eval-test-review.js');
const SELECTION_HARNESS = path.join(PROJECT_ROOT, 'test', 'eval-fragment-selection.js');
const SCORING_HARNESS = path.join(PROJECT_ROOT, 'test', 'test-probe-corpus.js');

/**
 * The three remaining behavioural harnesses, each with the corpus file it reads
 * first and the message it must print when that file is not what it asked for.
 *
 * One table rather than three copies of one case, because what distinguishes
 * them is the harness and its corpus and nothing else.
 */
const CORPUS_HARNESSES = [
  {
    harness: path.join(PROJECT_ROOT, 'test', 'eval-nfr.js'),
    label: 'the nfr harness',
    scripted: path.join(PROJECT_ROOT, 'test', 'fixtures', 'nfr-eval', 'ground-truth.json'),
    reports: /ground truth at .* is missing or not valid JSON/,
  },
  {
    harness: path.join(PROJECT_ROOT, 'test', 'eval-test-design.js'),
    label: 'the test-design harness',
    scripted: path.join(PROJECT_ROOT, 'test', 'fixtures', 'test-design-eval', 'ground-truth.json'),
    reports: /ground truth at .* is missing or not valid JSON/,
  },
  {
    harness: path.join(PROJECT_ROOT, 'test', 'eval-bmad-tea-routing.js'),
    label: 'the routing harness',
    scripted: path.join(PROJECT_ROOT, 'test', 'fixtures', 'tea-routing-eval', 'intents.json'),
    reports: /intents\.json is not valid JSON/,
  },
];

/** The files scripted below, each one a file a converted call site reads. */
const GROUND_TRUTH = path.join(PROJECT_ROOT, 'test', 'fixtures', 'trace-eval', 'ground-truth.json');
const REVIEW_GROUND_TRUTH = path.join(PROJECT_ROOT, 'test', 'fixtures', 'test-review-eval', 'ground-truth.json');
const SUITE_MANIFEST = path.join(PROJECT_ROOT, 'test', 'evals', 'suite-manifest.json');
const SELECTION_EVALS = path.join(PROJECT_ROOT, 'test', 'evals', 'bmad-testarch-atdd', 'evals.json');
const STORED_VERDICT = path.join(PROJECT_ROOT, 'test', 'replay', 'test-review', 'full-recall', 'verdict.json');
const SCORING_POLICY = path.join(PROJECT_ROOT, 'test', 'probes', 'scoring-policy.json');
const SELECTION_CONTEXT = path.join(
  PROJECT_ROOT,
  'src',
  'workflows',
  'testarch',
  'bmad-testarch-atdd',
  'steps-c',
  'step-01-preflight-and-context.md',
);
const TEA_MENU = path.join(PROJECT_ROOT, 'src', 'agents', 'bmad-tea', 'customize.toml');

/**
 * The bytes every scripted case hands back.
 *
 * Text that no real corpus file in this repository is, so a case cannot pass by
 * luck: every path scripted below is read as JSON by the call site under
 * assertion, and this parses as none.
 */
const NOT_JSON = 'this is not what the harness asked for, and it is not JSON';

const colors = {
  reset: '[0m',
  red: '[31m',
  green: '[32m',
  dim: '[2m',
};

let failures = 0;

function assert(condition, label, detail = '') {
  if (condition) {
    console.log(`${colors.green}✓${colors.reset} ${label}`);
    return;
  }
  failures += 1;
  console.log(`${colors.red}✗ ${label}${colors.reset}`);
  if (detail) console.log(`  ${colors.dim}${detail}${colors.reset}`);
}

/**
 * Run one harness under one scripted filesystem, and return what it printed and
 * logged.
 *
 * Parameterized by harness and argv rather than pinned to one file, because a
 * scripted case that can only be written for `test/eval-trace.js` leaves every
 * other converted call site held by nothing, which is the failure this whole
 * file exists to catch.
 *
 * @param {string} workspace A disposable directory for the fixture, the log and any record the run writes.
 * @param {{harness: string, argv?: string[], reads?: Record<string, string>}} invocation
 */
function runUnderFixture(workspace, { harness, argv = [], reads = {} }) {
  const log = path.join(workspace, 'port-calls.log');
  const fixture = path.join(workspace, 'fixture.json');
  fs.writeFileSync(fixture, JSON.stringify({ reads, log }));
  fs.writeFileSync(log, '');
  const result = spawnSync(process.execPath, [harness, ...argv], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    env: { ...process.env, TEA_FILE_SYSTEM_FIXTURE: fixture },
  });
  return {
    status: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    calls: fs
      .readFileSync(log, 'utf8')
      .split('\n')
      .filter((line) => line.length > 0),
  };
}

/** The last few lines of a run, for a failing assertion's detail. */
const tail = (output) => output.split('\n').slice(-4).join(' | ').slice(0, 240);

/** A file the process cannot read, for the permission half of the absence decision. */
function unreadable(directory) {
  const target = path.join(directory, 'unreadable.txt');
  fs.writeFileSync(target, 'secret');
  fs.chmodSync(target, 0o000);
  return target;
}

/** One disposable workspace per case, removed on both the passing and the throwing path. */
async function inWorkspace(prefix, body) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    await body(workspace);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

async function traceHarnessCases() {
  await inWorkspace('tea-file-system-trace-', (workspace) => {
    console.log('\nthe trace harness reads the ground truth through the port\n');

    // Scripted as text that is not JSON, which no real corpus is. A fixture the
    // real file could also produce would make this pass by luck.
    const scripted = runUnderFixture(workspace, { harness: TRACE_HARNESS, argv: ['--validate-only'], reads: { [GROUND_TRUTH]: NOT_JSON } });
    assert(
      scripted.status !== 0,
      'a scripted ground truth that is not JSON fails the run',
      `exit ${scripted.status}; a direct fs.readFileSync would have read the real corpus and validated it`,
    );
    assert(
      /ground truth at .* is missing or not valid JSON/.test(scripted.output),
      'the harness reports the scripted bytes rather than the file on disk',
      tail(scripted.output),
    );
    assert(
      scripted.calls.includes(`read ${GROUND_TRUTH}`),
      'the ground-truth read is logged as a port call',
      `${scripted.calls.length} call(s) logged`,
    );

    console.log('\nthe trace harness writes a staged workspace through the port\n');

    // Nothing scripted: the corpus is real, the run validates, and staging
    // writes one file per fixture set.
    const staged = runUnderFixture(workspace, { harness: TRACE_HARNESS, argv: ['--validate-only'] });
    assert(staged.status === 0, 'the harness validates its real corpus under the scripted filesystem', `exit ${staged.status}`);
    const writes = staged.calls.filter((line) => line.startsWith('write '));
    assert(
      writes.some((line) => line.endsWith(path.join('_bmad', 'tea', 'config.yaml'))),
      "the staged workspace's config write is logged as a port call",
      `${writes.length} write(s) logged: ${writes.slice(0, 3).join(', ')}`,
    );
    const reads = staged.calls.filter((line) => line.startsWith('read '));
    assert(reads.length > 0, 'the run reads through the port at all', 'no read was logged, so every read in the run bypassed the port');
  });
}

async function reviewHarnessCases() {
  await inWorkspace('tea-file-system-review-', (workspace) => {
    // `--preflight-only` spends no model call, and `--json` is what makes the
    // record path part of the run rather than a function nothing calls.
    const argv = ['--preflight-only', '--json', path.join(workspace, 'review.json')];

    console.log('\nthe review harness reads its ground truth through the port\n');

    const scripted = runUnderFixture(workspace, { harness: REVIEW_HARNESS, argv, reads: { [REVIEW_GROUND_TRUTH]: NOT_JSON } });
    assert(
      /ground truth is not valid JSON/.test(scripted.output),
      'pre-flight reports the scripted ground truth rather than the file on disk',
      tail(scripted.output),
    );
    assert(
      scripted.status === 2,
      'a ground truth that cannot be parsed is an environment failure',
      `exit ${scripted.status}; a direct fs.readFileSync would have read the real corpus and reported nothing`,
    );
    assert(
      scripted.calls.includes(`read ${REVIEW_GROUND_TRUTH}`),
      "the review corpus's ground-truth read is logged as a port call",
      `${scripted.calls.length} call(s) logged`,
    );

    console.log('\nthe suite manifest is read through the port\n');

    const manifest = runUnderFixture(workspace, { harness: REVIEW_HARNESS, argv, reads: { [SUITE_MANIFEST]: NOT_JSON } });
    assert(
      /suite-manifest\.json is not valid JSON/.test(manifest.output),
      'the harness reports the scripted manifest rather than the file on disk',
      tail(manifest.output),
    );
    assert(
      manifest.status === 2,
      'a manifest that cannot be read means the record cannot be written',
      `exit ${manifest.status}; a direct fs.readFileSync would have read the real manifest and written the record`,
    );
    assert(
      manifest.calls.includes(`read ${SUITE_MANIFEST}`),
      'the manifest read is logged as a port call',
      `${manifest.calls.length} call(s) logged`,
    );

    console.log('\nthe record the run writes goes through the port, and so does the corpus it digests\n');

    // Nothing scripted. The exit code is deliberately not asserted: whether the
    // vendor CLIs are installed on this host decides it, and neither answer says
    // anything about the port.
    const recorded = runUnderFixture(workspace, { harness: REVIEW_HARNESS, argv });
    const recordWrite = recorded.calls.indexOf(`write ${path.join(workspace, 'review.json')}`);
    assert(
      recordWrite !== -1,
      'the eval result record is written through the port',
      `${recorded.calls.filter((line) => line.startsWith('write ')).length} write(s) logged`,
    );
    // `digestFiles` reads every fixture the manifest names, and pre-flight has
    // already read the same three files to count their lines, so the fixture
    // paths alone prove nothing: they are in the log either way. What locates the
    // digest is where its reads fall. `finish` reads the manifest, then digests
    // the fixtures, then writes the record, so the digest's reads are the ones
    // between the manifest read and the write. With `fs.readFileSync` in
    // `digestFiles` that window holds no read at all.
    const manifestRead = recorded.calls.indexOf(`read ${SUITE_MANIFEST}`);
    const betweenManifestAndWrite = recorded.calls.slice(manifestRead + 1, recordWrite).filter((line) => line.startsWith('read '));
    assert(
      manifestRead !== -1 && recordWrite > manifestRead && betweenManifestAndWrite.length === 3,
      "the fixture digest's three reads are logged as port calls, between the manifest read and the record write",
      `manifest at ${manifestRead}, write at ${recordWrite}, ${betweenManifestAndWrite.length} read(s) between them`,
    );
  });
}

async function selectionHarnessCases() {
  await inWorkspace('tea-file-system-selection-', (workspace) => {
    console.log('\nthe fragment-selection harness reads its eval data through the port\n');

    const scripted = runUnderFixture(workspace, {
      harness: SELECTION_HARNESS,
      argv: ['--validate-only'],
      reads: { [SELECTION_EVALS]: NOT_JSON },
    });
    assert(
      /bmad-testarch-atdd\/evals\.json is not valid JSON/.test(scripted.output),
      'the harness reports the scripted eval data rather than the file on disk',
      tail(scripted.output),
    );
    assert(
      scripted.status === 2,
      'eval data that cannot be parsed is an environment failure',
      `exit ${scripted.status}; a direct fs.readFileSync would have read the real data and validated eight suites`,
    );
    assert(
      scripted.calls.includes(`read ${SELECTION_EVALS}`),
      "the eval suite's read is logged as a port call",
      `${scripted.calls.length} call(s) logged`,
    );

    console.log('\nthe prompt a selection case is sent is assembled through the port\n');

    // The step file a prompt quotes is read by nothing else in the run:
    // validation asks whether it exists and never opens it. So the proof is the
    // digest of the prompts the record carries, which is a function of those
    // bytes. Two runs, one scripted and one not, must disagree on it; through
    // `fs.readFileSync` both read the real step file and agree.
    const promptDigest = (argv, reads) => {
      const jsonPath = path.join(workspace, `${reads ? 'scripted' : 'real'}.json`);
      const run = runUnderFixture(workspace, { harness: SELECTION_HARNESS, argv: [...argv, '--json', jsonPath], reads });
      const record = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      return { digest: record.suite.promptDigest, run };
    };
    const real = promptDigest(['--validate-only']);
    const rewritten = promptDigest(['--validate-only'], { [SELECTION_CONTEXT]: '# scripted routing rules no step file carries' });
    assert(
      real.digest !== rewritten.digest,
      "a scripted step file moves the record's prompt digest",
      `${real.digest} against ${rewritten.digest}; a direct fs.readFileSync would read the real step file in both runs`,
    );
    assert(
      rewritten.run.calls.includes(`read ${SELECTION_CONTEXT}`),
      'the step file a prompt quotes is logged as a port call',
      `${rewritten.run.calls.filter((line) => line.startsWith('read ')).length} read(s) logged`,
    );
  });
}

async function corpusHarnessCases() {
  for (const { harness, label, scripted, reports } of CORPUS_HARNESSES) {
    await inWorkspace('tea-file-system-corpus-', (workspace) => {
      console.log(`\n${label} reads its corpus through the port\n`);

      const run = runUnderFixture(workspace, { harness, argv: ['--validate-only'], reads: { [scripted]: NOT_JSON } });
      assert(reports.test(run.output), `${label} reports the scripted corpus rather than the file on disk`, tail(run.output));
      assert(
        run.status === 2,
        'a corpus that cannot be parsed is an environment failure',
        `exit ${run.status}; a direct fs.readFileSync would have read the real corpus and validated it`,
      );
      assert(run.calls.includes(`read ${scripted}`), `${label} logs its corpus read as a port call`, `${run.calls.length} call(s) logged`);
    });
  }

  await inWorkspace('tea-file-system-menu-', (workspace) => {
    console.log('\nthe routing harness reads the skill and its menu through the port\n');

    // The menu is the other half of what a routing prompt is assembled from, and
    // it is read through the same function the skill is. Scripted as a TOML file
    // with no `[[agent.menu]]` block, the corpus has nothing to route to and the
    // run reports it; through `fs.readFileSync` the real ten-item menu comes back
    // and the corpus validates.
    const run = runUnderFixture(workspace, {
      harness: CORPUS_HARNESSES[2].harness,
      argv: ['--validate-only'],
      reads: { [TEA_MENU]: '# scripted, and it declares no menu\n' },
    });
    assert(
      /declares no \[\[agent\.menu\]\] item/.test(run.output),
      'the routing harness reports the scripted menu rather than the file on disk',
      tail(run.output),
    );
    assert(
      run.status === 1,
      'a corpus with nothing to route to is a measured inconsistency',
      `exit ${run.status}; a direct fs.readFileSync would have read the real menu and validated the corpus`,
    );
    assert(run.calls.includes(`read ${TEA_MENU}`), "the menu's read is logged as a port call", `${run.calls.length} call(s) logged`);
  });
}

async function evalAllCase() {
  await inWorkspace('tea-file-system-all-', (workspace) => {
    console.log('\neval:all reads each child record and writes the run summary through the port\n');

    // `--preflight-only` with `node` standing in for a runner is what
    // `tools/validate-eval-schemas.js` already drives per suite: every child
    // validates its corpus, probes its runner, and writes a record, with no model
    // call. The parent then reads each record back and folds it into the summary,
    // which is the one read this file performs.
    const summary = path.join(workspace, 'summary.json');
    const run = runUnderFixture(workspace, {
      harness: path.join(PROJECT_ROOT, 'test', 'eval-all.js'),
      argv: ['--preflight-only', '--agent', 'custom', '--agent-cmd', 'node', '--json', summary],
    });
    assert(run.status === 0, 'every suite pre-flights under the scripted filesystem', `exit ${run.status}; ${tail(run.output)}`);
    // Counted off the log rather than against a number here, so a suite added to
    // the manifest does not have to be added twice. Each child writes its record
    // into the collecting directory and the parent reads that same path back, so
    // every write into it must have a read of its own beside it.
    const collected = (kind) =>
      run.calls.filter((line) => line.startsWith(`${kind} `) && /tea-eval-all-/.test(line)).map((line) => line.slice(kind.length + 1));
    const written = collected('write');
    const readBack = new Set(collected('read'));
    assert(
      written.length > 0 && written.every((file) => readBack.has(file)),
      "each child's result record is read back through the port",
      `${written.length} child record(s) written, ${readBack.size} read back`,
    );
    assert(
      run.calls.includes(`write ${summary}`),
      'the run summary is written through the port',
      `${run.calls.filter((line) => line.startsWith('write ')).length} write(s) logged`,
    );
  });
}

async function scoringCases() {
  await inWorkspace('tea-file-system-scoring-', (workspace) => {
    console.log('\nthe probe scorer reads its stored evidence through the port\n');

    const verdict = runUnderFixture(workspace, { harness: SCORING_HARNESS, reads: { [STORED_VERDICT]: NOT_JSON } });
    assert(
      verdict.status !== 0,
      'a scripted stored verdict that is not JSON fails the scoring run',
      `exit ${verdict.status}; a direct fs.readFileSync would have read the real verdict and scored every probe`,
    );
    assert(
      verdict.calls.includes(`read ${STORED_VERDICT}`),
      "the stored verdict's read is logged as a port call",
      `${verdict.calls.length} call(s) logged`,
    );
    // The contract read is probe-scoring's own, one per suite, and it happens
    // before any evidence is assembled.
    assert(
      verdict.calls.includes(`read ${path.join(PROJECT_ROOT, 'test', 'contracts', 'test-review.contract.json')}`),
      'the contract the suite scores against is read through the port',
      `${verdict.calls.filter((line) => line.startsWith('read ')).length} read(s) logged`,
    );

    console.log('\nthe scoring policy is read through the port\n');

    const policy = runUnderFixture(workspace, { harness: SCORING_HARNESS, reads: { [SCORING_POLICY]: NOT_JSON } });
    assert(
      policy.status !== 0,
      'a scripted scoring policy that is not JSON fails the scoring run',
      `exit ${policy.status}; a direct fs.readFileSync would have read the real policy and scored every probe`,
    );
    assert(
      policy.calls.includes(`read ${SCORING_POLICY}`),
      "the scoring policy's read is logged as a port call",
      `${policy.calls.length} call(s) logged`,
    );
  });
}

/**
 * The absence decision `digestFiles` depends on, checked directly.
 *
 * No harness run can reach it: every fixture the suite manifest names is in the
 * repository, so a child process scores the present case and nothing else. The
 * marker exists for the run that already failed because a fixture is gone, and a
 * reporting path that crashes on the condition it is reporting is the defect this
 * holds shut.
 */
async function digestMarkerCase() {
  console.log('\na fixture that is not there digests as the marker, and every other fault propagates\n');

  await inWorkspace('tea-file-system-digest-', async (corpus) => {
    fs.writeFileSync(path.join(corpus, 'present.txt'), 'bytes');

    const withMissing = await digestFiles(corpus, ['present.txt', 'absent.txt']);
    const expected = digest(['absent.txt', '<missing>', 'present.txt', Buffer.from('bytes', 'utf8')]);
    assert(
      withMissing === expected,
      'an absent file contributes the <missing> marker rather than throwing',
      `${withMissing} vs ${expected}`,
    );

    let thrown;
    try {
      await digestFiles(corpus, [path.basename(unreadable(corpus))]);
    } catch (error) {
      thrown = error;
    }
    assert(
      thrown !== undefined,
      'a file the process cannot read throws rather than digesting as the marker',
      thrown === undefined ? 'it returned a digest' : '',
    );
    fs.chmodSync(corpus, 0o700);
  });
}

/**
 * The three decisions TEA's wrapper makes on top of the adapter.
 *
 * The conformance arm certifies the adapter and builds its own; it never imports
 * this module. So which fault is absence, which propagate, and what an empty path
 * does are held here or by nothing.
 */
async function wrapperCases() {
  console.log("\nTEA's own wrapper decides absence, and nothing else decides it\n");

  const wrapper = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-file-system-wrapper-'));
  try {
    const present = path.join(wrapper, 'present.txt');
    const empty = path.join(wrapper, 'empty.txt');
    fs.writeFileSync(present, 'bytes');
    fs.writeFileSync(empty, '');

    const read = await readText(present);
    assert(read.present && read.text === 'bytes', 'a file that is there reads back as present with its text', JSON.stringify(read));

    // A 0-byte file is present and empty, which is a different answer from
    // absent. Every caller converted in this change tests `.present` rather
    // than truthiness, and this is what makes that distinction real.
    const emptyRead = await readText(empty);
    assert(emptyRead.present && emptyRead.text === '', 'an empty file reads as present with empty text', JSON.stringify(emptyRead));

    const absent = await readText(path.join(wrapper, 'no-such-file.txt'));
    assert(absent.present === false && absent.text === null, 'an absent file reads as not present', JSON.stringify(absent));

    // The decision the module exists for. A directory and a permission error are
    // not absence, and a caller told "absent" about either records a clean
    // reading of a file it never read.
    for (const [target, what] of [
      [wrapper, 'a directory where a file was expected'],
      [unreadable(wrapper), 'a file the process cannot read'],
    ]) {
      let thrown;
      try {
        await readText(target);
      } catch (error) {
        thrown = error;
      }
      assert(thrown !== undefined, `${what} throws rather than reading as absent`, thrown === undefined ? 'it returned a value' : '');
    }

    for (const [call, what] of [
      [() => readText(''), 'reading'],
      [() => writeText('', 'anything'), 'writing'],
    ]) {
      let refused = false;
      try {
        await call();
      } catch (error) {
        refused = /empty path/.test(error.message);
      }
      assert(refused, `an empty path is refused before the port sees it, when ${what}`);
    }

    const wrote = await writeText(path.join(wrapper, 'written.txt'), 'four');
    assert(wrote === 4, 'a write reports the byte length the port wrote', String(wrote));
  } finally {
    fs.chmodSync(wrapper, 0o700);
    fs.rmSync(wrapper, { recursive: true, force: true });
  }
}

async function main() {
  await traceHarnessCases();
  await reviewHarnessCases();
  await selectionHarnessCases();
  await corpusHarnessCases();
  await evalAllCase();
  await scoringCases();
  await digestMarkerCase();
  await wrapperCases();

  if (failures > 0) {
    console.error(`\n${colors.red}${failures} call site(s) did not go through the file-system port.${colors.reset}`);
    return 1;
  }
  console.log(`\n${colors.green}every converted harness reads and writes through the file-system port${colors.reset}\n`);
  return 0;
}

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(error?.stack ?? error);
      process.exit(1);
    },
  );
}

module.exports = { runUnderFixture };
