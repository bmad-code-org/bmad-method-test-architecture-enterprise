/**
 * Prove the file-system port is in the path the trace harness reads and writes
 * through.
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
 * from decoration: if someone replaced a port call in `test/eval-trace.js` with
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
 * The read case scripts the ground truth as text that is not JSON. Through the
 * port, `loadGroundTruth` answers null and the harness reports a missing or
 * invalid ground truth and exits on an environment class. Through
 * `fs.readFileSync`, the real corpus parses and the run proceeds to validate a
 * corpus that is fine, so the outcome differs by the whole verdict rather than
 * by a detail.
 *
 * The write case scripts nothing and only logs. Staging a workspace writes one
 * file, `_bmad/tea/config.yaml`, and that write must appear in the log. A
 * `fs.writeFileSync` at that call site produces the same file on disk and no log
 * line, which is exactly the substitution this check exists to catch.
 *
 * Both cases run the harness as a child process against its real corpus with no
 * model call, because a port that is in the path of a helper called directly but
 * not in the path of a run is the same decoration wearing a smaller disguise.
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

const PROJECT_ROOT = path.join(__dirname, '..');
const HARNESS = path.join(PROJECT_ROOT, 'test', 'eval-trace.js');
const GROUND_TRUTH = path.join(PROJECT_ROOT, 'test', 'fixtures', 'trace-eval', 'ground-truth.json');

const colors = {
  reset: '[0m',
  red: '[31m',
  green: '[32m',
  dim: '[2m',
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

/** Run the trace harness under one scripted filesystem, and return what it printed and logged. */
function runUnderFixture(workspace, { reads }) {
  const log = path.join(workspace, 'port-calls.log');
  const fixture = path.join(workspace, 'fixture.json');
  fs.writeFileSync(fixture, JSON.stringify({ reads, log }));
  fs.writeFileSync(log, '');
  const result = spawnSync(process.execPath, [HARNESS, '--validate-only'], {
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

/** A file the process cannot read, for the permission half of the absence decision. */
function unreadable(directory) {
  const target = path.join(directory, 'unreadable.txt');
  fs.writeFileSync(target, 'secret');
  fs.chmodSync(target, 0o000);
  return target;
}

async function main() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-file-system-port-'));
  try {
    console.log('\nthe trace harness reads the ground truth through the port\n');

    // Scripted as text that is not JSON, which no real corpus is. A fixture the
    // real file could also produce would make this pass by luck.
    const scripted = runUnderFixture(workspace, { reads: { [GROUND_TRUTH]: 'this is not the ground truth, and it is not JSON' } });
    assert(
      scripted.status !== 0,
      'a scripted ground truth that is not JSON fails the run',
      `exit ${scripted.status}; a direct fs.readFileSync would have read the real corpus and validated it`,
    );
    assert(
      /ground truth at .* is missing or not valid JSON/.test(scripted.output),
      'the harness reports the scripted bytes rather than the file on disk',
      scripted.output.split('\n').slice(-4).join(' | ').slice(0, 240),
    );
    assert(
      scripted.calls.includes(`read ${GROUND_TRUTH}`),
      'the ground-truth read is logged as a port call',
      `${scripted.calls.length} call(s) logged`,
    );

    console.log('\nthe trace harness writes a staged workspace through the port\n');

    // Nothing scripted: the corpus is real, the run validates, and staging
    // writes one file per fixture set.
    const staged = runUnderFixture(workspace, { reads: {} });
    assert(staged.status === 0, 'the harness validates its real corpus under the scripted filesystem', `exit ${staged.status}`);
    const writes = staged.calls.filter((line) => line.startsWith('write '));
    assert(
      writes.some((line) => line.endsWith(path.join('_bmad', 'tea', 'config.yaml'))),
      "the staged workspace's config write is logged as a port call",
      `${writes.length} write(s) logged: ${writes.slice(0, 3).join(', ')}`,
    );
    const reads = staged.calls.filter((line) => line.startsWith('read '));
    assert(reads.length > 0, 'the run reads through the port at all', 'no read was logged, so every read in the run bypassed the port');
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }

  console.log("\nTEA's own wrapper decides absence, and nothing else decides it\n");

  // The arm certifies the adapter and builds its own; it never imports this
  // module. So the three decisions the wrapper makes on top of the adapter are
  // held here or by nothing: which fault is absence, which propagate, and what
  // an empty path does.
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

  if (failures > 0) {
    console.error(`\n${colors.red}${failures} call site(s) did not go through the file-system port.${colors.reset}`);
    return 1;
  }
  console.log(`\n${colors.green}the trace harness reads and writes through the file-system port${colors.reset}\n`);
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
