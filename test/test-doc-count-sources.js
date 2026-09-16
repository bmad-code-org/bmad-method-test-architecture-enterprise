/**
 * The doc-counts gate's own source module computes what it claims to, its
 * guards that are not borrowed from an already-tested module actually fire,
 * and the configuration's capture-group ordering matches the sources it names.
 *
 * WHY THIS FILE EXISTS
 *
 * `test/lib/doc-count-sources.js` is what `eval-quality.config.json`'s
 * `doc-counts` section reads. `npm run test:doc-counts` proves the module's
 * numbers agree with the published pages today; it proves nothing about whether
 * the module would still refuse loudly if its own inputs went bad, and a
 * `module-value` source that returns a wrong number silently is worse than the
 * literal it replaced. The manifest-schema and suite-lookup refusals it relies
 * on are `test/lib/suite-manifest.js`'s own, already load-bearing everywhere
 * else that module is used; this file does not re-prove those. It proves the
 * things unique to this module: the arithmetic, recomputed independently of the
 * module under test; the tier-sum and cross-copy guards over `tea-index.csv`;
 * and that each `doc-counts` entry's `counts` array names its sources in the
 * order its pattern's capture groups actually carry them, position by
 * position, since the gate itself only compares digits and cannot notice two
 * entries whose figures happen to coincide (`TEST_DESIGN_CALLS`, `NFR_CALLS`
 * and `TRACE_CALLS` are all `4` today) being transposed against each other.
 *
 * The tier-sum guard proof runs the module against a scratch copy of
 * `tea-index.csv` under `DOC_COUNT_SOURCES_TEA_INDEX_CSV`, never against the
 * real file: a process killed between corrupting and restoring a live copy
 * would leave the tree broken for whoever reads it next.
 *
 * Usage: node test/test-doc-count-sources.js
 */

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parse } = require('csv-parse/sync');

const PROJECT_ROOT = path.join(__dirname, '..');
const MODULE_PATH = path.join(__dirname, 'lib', 'doc-count-sources.js');
const TEA_INDEX_CSV = path.join(PROJECT_ROOT, 'src', 'workflows', 'testarch', 'bmad-testarch-test-review', 'resources', 'tea-index.csv');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'eval-quality.config.json');

const failures = [];

function check(name, fn) {
  try {
    fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.error(`  FAIL  ${name}`);
  }
}

const source = require('./lib/doc-count-sources.js');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'evals', 'suite-manifest.json'), 'utf8'));

function suite(id) {
  const entry = manifest.suites.find((candidate) => candidate.id === id);
  assert.ok(entry, `suite-manifest.json registers no suite with id "${id}"`);
  return entry;
}

check('per-suite call counts are caseCount times repetitions, independently recomputed from the manifest', () => {
  assert.strictEqual(source.FRAGMENT_SELECTION_CALLS, suite('fragment-selection').caseCount * suite('fragment-selection').repetitions);
  assert.strictEqual(source.ROUTING_INTENT_CALLS, suite('bmad-tea-routing').caseCount * suite('bmad-tea-routing').repetitions);
  assert.strictEqual(source.TEST_DESIGN_CALLS, suite('test-design').caseCount * suite('test-design').repetitions);
  assert.strictEqual(source.NFR_CALLS, suite('nfr').caseCount * suite('nfr').repetitions);
  assert.strictEqual(source.TRACE_CALLS, suite('trace').caseCount * suite('trace').repetitions);
  assert.strictEqual(source.CI_CALLS, suite('ci').caseCount * suite('ci').repetitions);
  assert.strictEqual(source.ATDD_CALLS, suite('atdd').caseCount * suite('atdd').repetitions);
});

check("test-review's call count is repetitions alone, since its harness reviews the whole corpus once per repetition", () => {
  assert.strictEqual(source.TEST_REVIEW_CALLS, suite('test-review').repetitions);
  assert.notStrictEqual(
    source.TEST_REVIEW_CALLS,
    suite('test-review').caseCount * suite('test-review').repetitions,
    'this assertion only distinguishes the two formulas while caseCount and repetitions are not both 1; if that ever changes, replace it with a real formula check',
  );
});

check('TOTAL_CALLS is the sum of all eight per-suite call counts', () => {
  assert.strictEqual(
    source.TOTAL_CALLS,
    source.FRAGMENT_SELECTION_CALLS +
      source.ROUTING_INTENT_CALLS +
      source.TEST_DESIGN_CALLS +
      source.TEST_REVIEW_CALLS +
      source.NFR_CALLS +
      source.TRACE_CALLS +
      source.CI_CALLS +
      source.ATDD_CALLS,
  );
});

check('TOTAL_CALLS_THREE_RUNNERS is TOTAL_CALLS times three', () => {
  assert.strictEqual(source.TOTAL_CALLS_THREE_RUNNERS, source.TOTAL_CALLS * 3);
});

check("FRAGMENT_SELECTION_CASES is the manifest's own caseCount for that suite", () => {
  assert.strictEqual(source.FRAGMENT_SELECTION_CASES, suite('fragment-selection').caseCount);
});

check('the knowledge-fragment tier breakdown matches an independent parse of tea-index.csv', () => {
  const rows = parse(fs.readFileSync(TEA_INDEX_CSV, 'utf8'), { columns: true, skip_empty_lines: true });
  assert.strictEqual(source.KNOWLEDGE_FRAGMENT_TOTAL, rows.length);
  assert.strictEqual(source.KNOWLEDGE_FRAGMENT_CORE, rows.filter((row) => row.tier === 'core').length);
  assert.strictEqual(source.KNOWLEDGE_FRAGMENT_EXTENDED, rows.filter((row) => row.tier === 'extended').length);
  assert.strictEqual(source.KNOWLEDGE_FRAGMENT_SPECIALIZED, rows.filter((row) => row.tier === 'specialized').length);
});

/**
 * Runs `doc-count-sources.js` in a subprocess against a scratch copy of
 * `tea-index.csv`, so a crash mid-test never touches the real file.
 * `mutate` receives the parsed rows and the raw lines and edits `lines` in
 * place; a row's line is its index plus one (the header). That assumes no
 * field in this CSV carries an embedded newline, true of the file today (one
 * data line per parsed row); a description that grew a real line break would
 * need this helper to locate lines a different way.
 */
function runAgainstScratchCsv(mutate) {
  const original = fs.readFileSync(TEA_INDEX_CSV, 'utf8');
  const rows = parse(original, { columns: true, skip_empty_lines: true });
  const lines = original.split('\n');
  mutate(rows, lines);
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-count-sources-'));
  const scratchCsv = path.join(scratchDir, 'tea-index.csv');
  fs.writeFileSync(scratchCsv, lines.join('\n'));
  try {
    return spawnSync(process.execPath, ['-e', `require(${JSON.stringify(MODULE_PATH)})`], {
      encoding: 'utf8',
      env: { ...process.env, DOC_COUNT_SOURCES_TEA_INDEX_CSV: scratchCsv },
    });
  } finally {
    fs.rmSync(scratchDir, { recursive: true, force: true });
  }
}

check('the tier-sum guard refuses when a fragment carries a tier none of the three sentences knows about', () => {
  const result = runAgainstScratchCsv((rows, lines) => {
    const coreIndex = rows.findIndex((row) => row.tier === 'core');
    assert.ok(coreIndex !== -1, 'fixture setup: expected at least one core-tier row to corrupt');
    // Row 0 is the line after the header, so line index is the row index plus one.
    lines[coreIndex + 1] = lines[coreIndex + 1].replace(',core,', ',unrecognized-tier,');
  });
  assert.notStrictEqual(result.status, 0, 'expected the module to throw on a broken tier column');
  assert.match(result.stderr, /tiers sum to \d+ and the file carries \d+ rows/);
});

const ATDD_CSV = path.join(PROJECT_ROOT, 'src', 'workflows', 'testarch', 'bmad-testarch-atdd', 'resources', 'tea-index.csv');

/**
 * Corrupts `bmad-testarch-atdd`'s real tea-index.csv (there is no scratch
 * seam for the cross-copy guard the way there is for the tier-sum guard,
 * since the whole point is comparing against a sibling on disk), runs the
 * module in a subprocess, and restores the file whatever the outcome —
 * `remove: true` deletes it instead of mutating it, to prove the missing-copy
 * case.
 */
function runAgainstMutatedSibling({ remove = false, mutate } = {}) {
  const original = fs.readFileSync(ATDD_CSV, 'utf8');
  try {
    if (remove) {
      fs.rmSync(ATDD_CSV);
    } else {
      const rows = parse(original, { columns: true, skip_empty_lines: true });
      const lines = original.split('\n');
      mutate(rows, lines);
      fs.writeFileSync(ATDD_CSV, lines.join('\n'));
    }
    return spawnSync(process.execPath, ['-e', `require(${JSON.stringify(MODULE_PATH)})`], { encoding: 'utf8' });
  } finally {
    fs.writeFileSync(ATDD_CSV, original);
  }
}

check("the cross-copy guard refuses when another workflow's tea-index.csv disagrees on a fragment's tier", () => {
  const original = fs.readFileSync(ATDD_CSV, 'utf8');
  const result = runAgainstMutatedSibling({
    mutate: (rows, lines) => {
      const coreIndex = rows.findIndex((row) => row.tier === 'core');
      assert.ok(coreIndex !== -1, "fixture setup: expected at least one core-tier row in bmad-testarch-atdd's copy");
      lines[coreIndex + 1] = lines[coreIndex + 1].replace(',core,', ',extended,');
    },
  });
  assert.notStrictEqual(result.status, 0, 'expected the module to throw on a cross-copy tier disagreement');
  assert.match(result.stderr, /tags .* as tier .* and .* tags it/);
  assert.strictEqual(fs.readFileSync(ATDD_CSV, 'utf8'), original, "bmad-testarch-atdd's tea-index.csv must be restored exactly");
});

check('the cross-copy guard refuses when a sibling workflow ships no tea-index.csv at all', () => {
  const original = fs.readFileSync(ATDD_CSV, 'utf8');
  const result = runAgainstMutatedSibling({ remove: true });
  assert.notStrictEqual(result.status, 0, 'expected the module to throw when a sibling copy is missing');
  assert.match(result.stderr, /could not be read/);
  assert.strictEqual(fs.readFileSync(ATDD_CSV, 'utf8'), original, "bmad-testarch-atdd's tea-index.csv must be restored exactly");
});

check('the cross-copy guard refuses when a sibling tea-index.csv is missing a row the canonical copy carries', () => {
  const original = fs.readFileSync(ATDD_CSV, 'utf8');
  const result = runAgainstMutatedSibling({
    mutate: (rows, lines) => {
      lines.splice(1, 1);
    },
  });
  assert.notStrictEqual(result.status, 0, 'expected the module to throw on a missing row');
  assert.match(result.stderr, /is missing .*, which .* carries/);
  assert.strictEqual(fs.readFileSync(ATDD_CSV, 'utf8'), original, "bmad-testarch-atdd's tea-index.csv must be restored exactly");
});

check('the cross-copy guard refuses when a sibling tea-index.csv lists a row the canonical copy does not carry', () => {
  const original = fs.readFileSync(ATDD_CSV, 'utf8');
  const result = runAgainstMutatedSibling({
    mutate: (rows, lines) => {
      lines.push('fake-extra-fragment,Fake,Fake description,tag,core,knowledge/fake.md');
    },
  });
  assert.notStrictEqual(result.status, 0, 'expected the module to throw on an extra row');
  assert.match(result.stderr, /lists .*, which .* does not carry/);
  assert.strictEqual(fs.readFileSync(ATDD_CSV, 'utf8'), original, "bmad-testarch-atdd's tea-index.csv must be restored exactly");
});

check("every doc-counts entry's counts array names its sources in the order its pattern's capture groups carry them", () => {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const entries = config['doc-counts'].entries;

  const roadmap = entries.find((entry) => entry.file === 'docs/explanation/eval-quality-roadmap.md');
  assert.deepStrictEqual(roadmap.counts, [
    'fragmentSelectionCalls',
    'routingIntentCalls',
    'testDesignCalls',
    'testReviewCalls',
    'nfrCalls',
    'ciCalls',
    'traceCalls',
    'atddCalls',
  ]);

  const adoptionGuide = entries.find((entry) => entry.file === 'docs/explanation/eval-quality-adoption-guide.md');
  assert.deepStrictEqual(adoptionGuide.counts, [
    'totalCalls',
    'fragmentSelectionCalls',
    'routingIntentCalls',
    'testDesignCalls',
    'testReviewCalls',
    'nfrCalls',
    'ciCalls',
    'traceCalls',
    'atddCalls',
  ]);

  const readmeTotals = entries.find((entry) => entry.file === 'README.md' && entry.counts.includes('totalCallsThreeRunners'));
  assert.deepStrictEqual(readmeTotals.counts, [
    'totalCalls',
    'fragmentSelectionCalls',
    'routingIntentCalls',
    'testReviewCalls',
    'nfrCalls',
    'ciCalls',
    'testDesignCalls',
    'traceCalls',
    'atddCalls',
    'totalCallsThreeRunners',
  ]);
});

if (failures.length > 0) {
  console.error('\ndoc-count-sources validation failed:\n');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('doc-count-sources computes its numbers correctly and refuses a broken tier column.');
