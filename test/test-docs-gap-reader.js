/**
 * The held-out reader command on `docs/how-to/evaluate/read-the-gaps-and-fix-them.md` prints one line per row of `gap-view.json`,
 * including a row whose `outcome` is `null`.
 *
 * `writePartitionViews` writes `outcome: null` for a probe with no evidence, so a reader that dereferences `r.outcome` unguarded
 * throws a TypeError on that row and prints nothing at all.
 * This test lifts the command out of the page, builds a `gap-view.json` through the real `writePartitionViews` with a caught row,
 * an uncaught row and a null row, runs the command with bash and holds its output.
 * The mutant check runs the unguarded command that once stood on the page against the same fixture and requires it to fail.
 *
 * Usage: node test/test-docs-gap-reader.js
 */

'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { writePartitionViews } = require('../cli/lib/evaluate/partition');

const PROJECT_ROOT = path.join(__dirname, '..');
const PAGE = path.join(PROJECT_ROOT, 'docs', 'how-to', 'evaluate', 'read-the-gaps-and-fix-them.md');
const ANCHOR = 'Read held-out results only from';
const RUN = 'gap-reader-run';
const RUN_DIRECTORY = path.join('evals', 'test-review-json-stdin', 'runs', RUN);

/** The reader command as the page printed it before the null guard: the mutant the check has to fail. */
const UNGUARDED_COMMAND = `(cd evals/test-review-json-stdin/runs/$RUN &&
  node -p "require('./gap-view.json')['held-out'].map((r) => r.probeId + ' ' + r.probeClass + ' caught=' + r.outcome.caught + ' ' + r.outcome.caughtCount + '/' + r.outcome.validCount).join('\\n')")`;

/** The first fenced `bash` block after the sentence that introduces the held-out reader. */
function readerCommand(pageText) {
  const at = pageText.indexOf(ANCHOR);
  assert.ok(at !== -1, `${path.relative(PROJECT_ROOT, PAGE)} no longer holds the sentence "${ANCHOR}"`);
  const block = /```bash\n([\s\S]*?)\n```/.exec(pageText.slice(at));
  assert.ok(block, `no fenced bash block follows "${ANCHOR}"`);
  assert.ok(block[1].includes('gap-view.json'), 'the bash block after the anchor sentence does not read gap-view.json');
  return block[1];
}

/** Writes a `gap-view.json` through `writePartitionViews`: one caught, one uncaught and one evidence-less held-out probe. */
function writeFixture(root) {
  const runDirectory = path.join(root, RUN_DIRECTORY);
  fs.mkdirSync(runDirectory, { recursive: true });
  const written = new Map();
  const writer = { replaceJson: (name, value) => written.set(name, value) };
  const probeIds = ['P-010', 'P-011', 'P-012'];
  const outcome = (probeId, caught, caughtCount) => ({ probeId, caught, caughtCount, validCount: 3 });
  const evidence = new Map([
    ['P-010', { reducedProbeOutcomes: [outcome('P-010', true, 3)] }],
    ['P-011', { reducedProbeOutcomes: [outcome('P-011', false, 0)] }],
  ]);
  writePartitionViews({
    writer,
    readInput: (relative) => ({ probeClass: 'defect', file: relative }),
    scoreInvocationId: 'invocation',
    trialSets: probeIds.map((probeId) => ({ probeId, probe: `probes/${probeId}.json` })),
    evidence,
    heldOutProbes: probeIds,
    strengthAggregate: { status: 'absent', reason: 'fixture' },
  });
  const view = written.get('gap-view.json');
  assert.equal(view['held-out'].length, 3, 'the fixture holds three held-out rows');
  assert.equal(view['held-out'][2].outcome, null, 'the evidence-less probe is written with a null outcome');
  fs.writeFileSync(path.join(runDirectory, 'gap-view.json'), JSON.stringify(view));
}

/** Runs `command` with bash from `root` with `RUN` set. */
function run(command, root) {
  return spawnSync('bash', ['-c', command], { cwd: root, env: { ...process.env, RUN }, encoding: 'utf8' });
}

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-gap-reader-'));
  try {
    writeFixture(root);

    const result = run(readerCommand(fs.readFileSync(PAGE, 'utf8')), root);
    assert.equal(result.status, 0, `the page's reader command exits ${result.status}\n${result.stderr}`);
    const lines = result.stdout.trimEnd().split('\n');
    assert.deepEqual(
      lines,
      ['P-010 defect caught=true 3/3', 'P-011 defect caught=false 0/3', 'P-012 defect outcome withheld'],
      `the reader prints one line per row:\n${result.stdout}`,
    );

    const mutant = run(UNGUARDED_COMMAND, root);
    assert.notEqual(mutant.status, 0, 'the unguarded reader must fail against a null outcome');
    assert.match(mutant.stderr, /TypeError/, 'the unguarded reader fails with a TypeError');
    assert.equal(mutant.stdout.trim(), '', 'the unguarded reader prints no row');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log(
    'docs-gap-reader: the held-out reader prints caught, uncaught and withheld rows, and the unguarded reader fails on the same fixture',
  );
}

if (require.main === module) main();

module.exports = { readerCommand, UNGUARDED_COMMAND };
