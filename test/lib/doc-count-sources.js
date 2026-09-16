/**
 * TEA's own answers for the `doc-counts` gate: the numbers its published pages
 * state, each derived from the artifact that owns it rather than transcribed
 * from the sentence that states it.
 *
 * The gate carries none of this; it holds a sentence against a value and says
 * where the value came from. Which values TEA has is this file's job, so it can
 * be read and tested, and `eval-quality.config.json` names these exports the
 * way any other consumer names its own. Shape copied from eval-quality's own
 * scripts/doc-count-sources.ts.
 *
 * Every guard here throws rather than returning a wrong number: the manifest
 * has to pass its own schema, the fragment CSV has to parse and carry at least
 * one row, the knowledge-fragment tiers have to sum to the total row count, and
 * every other workflow's own copy of that CSV has to agree with the one this
 * module reads on every fragment's tier.
 */

'use strict';

const path = require('node:path');
const fs = require('node:fs');

const { parse } = require('csv-parse/sync');

const { validateSuiteManifest } = require('../schema/suite-manifest');
const { suiteById, MANIFEST_RELATIVE_PATH } = require('./suite-manifest');
const rawManifest = require('../evals/suite-manifest.json');
const packageJson = require('../../package.json');
const { chainedScripts } = require('../../tools/validate-ci-coverage');

function refuse(message) {
  throw new Error(`doc-count-sources: ${message}`);
}

// Validated the same way every other consumer of the manifest is required to,
// via test/lib/suite-manifest.js's own schema, rather than trusting the raw
// JSON's shape.
const validated = validateSuiteManifest(rawManifest);
if (!validated.success) {
  const issues = validated.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ');
  refuse(`${MANIFEST_RELATIVE_PATH} does not match its schema: ${issues}`);
}
const manifest = validated.data;

function caseCountOf(suiteId) {
  return suiteById(manifest, suiteId).caseCount;
}

function repetitionsOf(suiteId) {
  return suiteById(manifest, suiteId).repetitions;
}

/**
 * The roadmap sentence's six numbers (docs/explanation/eval-quality-roadmap.md:30).
 *
 * The repetition count is the manifest's `repetitions` field, not a harness's own
 * internal default: `test/eval-all.js`'s `repetitionsFor()` always passes
 * `--runs <manifest repetitions>` to the child harness (unless overridden on the
 * command line), which overrides whatever default the harness would otherwise
 * fall back to. The manifest field is therefore what one real `eval:all` run
 * actually spends, which is exactly what this sentence describes.
 *
 * Five suites loop per-case-then-per-run inside their harness's own `main()`, so
 * the published call count is `caseCount` times `repetitions`. `test-review`
 * differs: its harness calls `runReview()` once per repetition over the whole
 * three-file corpus, with no per-case loop, so its count is `repetitions` alone.
 * A sentence with several numbers in a row is not guaranteed to share one
 * formula, and this one does not.
 */
exports.FRAGMENT_SELECTION_CALLS = caseCountOf('fragment-selection') * repetitionsOf('fragment-selection');
exports.ROUTING_INTENT_CALLS = caseCountOf('bmad-tea-routing') * repetitionsOf('bmad-tea-routing');
exports.TEST_DESIGN_CALLS = caseCountOf('test-design') * repetitionsOf('test-design');
exports.TEST_REVIEW_CALLS = repetitionsOf('test-review');
exports.NFR_CALLS = caseCountOf('nfr') * repetitionsOf('nfr');
exports.TRACE_CALLS = caseCountOf('trace') * repetitionsOf('trace');

/**
 * The `ci` suite's call count (README.md:424). Added after the roadmap and
 * adoption-guide sentences were written, so it is held only where a sentence
 * actually names it; the six-suite sentences above describe exactly the six
 * suites they name and are not thereby incomplete.
 */
exports.CI_CALLS = caseCountOf('ci') * repetitionsOf('ci');

/** One `eval:all` run's total model calls, for one runner, across every suite. */
exports.TOTAL_CALLS =
  exports.FRAGMENT_SELECTION_CALLS +
  exports.ROUTING_INTENT_CALLS +
  exports.TEST_DESIGN_CALLS +
  exports.TEST_REVIEW_CALLS +
  exports.NFR_CALLS +
  exports.TRACE_CALLS +
  exports.CI_CALLS;

/** All three built-in runners (`claude`, `codex`, `agy`) making one `eval:all` run each. */
exports.TOTAL_CALLS_THREE_RUNNERS = exports.TOTAL_CALLS * 3;

/** The fragment-selection case count, held in README.md. */
exports.FRAGMENT_SELECTION_CASES = caseCountOf('fragment-selection');

/**
 * The npm test chain length, reusing the exact function `test:ci-coverage`
 * prints so the README sentence and the printed count can never state two
 * different numbers.
 */
exports.NPM_TEST_CHAIN_LENGTH = chainedScripts(packageJson).length;

/**
 * The knowledge-fragment tier breakdown (README.md:215). Every workflow under
 * `src/workflows/testarch/` ships its own copy of `tea-index.csv`;
 * bmad-testarch-test-review's is as good as any other to read the totals off,
 * and the guard below holds every other copy's `tier` column against it so
 * picking one is safe.
 *
 * The path has an environment-variable override so
 * `test/test-doc-count-sources.js` can point this module at a scratch copy
 * rather than mutating the real file to prove the guards below fire.
 */
const TESTARCH_ROOT = path.join(__dirname, '..', '..', 'src', 'workflows', 'testarch');
const TEA_INDEX_CSV =
  process.env.DOC_COUNT_SOURCES_TEA_INDEX_CSV || path.join(TESTARCH_ROOT, 'bmad-testarch-test-review', 'resources', 'tea-index.csv');

function readTeaIndex(csvPath) {
  let text;
  try {
    text = fs.readFileSync(csvPath, 'utf8');
  } catch (error) {
    refuse(`${csvPath} could not be read: ${error.message}`);
  }
  let rows;
  try {
    rows = parse(text, { columns: true, skip_empty_lines: true });
  } catch (error) {
    refuse(`${csvPath} could not be read as CSV: ${error.message}`);
  }
  if (rows.length === 0) refuse(`${csvPath} parsed to zero fragment rows`);
  return rows;
}

const fragments = readTeaIndex(TEA_INDEX_CSV);

function tierCount(tier) {
  return fragments.filter((fragment) => fragment.tier === tier).length;
}

exports.KNOWLEDGE_FRAGMENT_TOTAL = fragments.length;
exports.KNOWLEDGE_FRAGMENT_CORE = tierCount('core');
exports.KNOWLEDGE_FRAGMENT_EXTENDED = tierCount('extended');
exports.KNOWLEDGE_FRAGMENT_SPECIALIZED = tierCount('specialized');

const tierSum = exports.KNOWLEDGE_FRAGMENT_CORE + exports.KNOWLEDGE_FRAGMENT_EXTENDED + exports.KNOWLEDGE_FRAGMENT_SPECIALIZED;
if (tierSum !== exports.KNOWLEDGE_FRAGMENT_TOTAL) {
  refuse(
    `tea-index.csv's core/extended/specialized tiers sum to ${tierSum} and the file carries ${exports.KNOWLEDGE_FRAGMENT_TOTAL} rows; ` +
      'a fragment is tagged with a tier none of the three sentences accounts for',
  );
}

// Every other workflow's own copy has to be the exact same set of ids, each
// tagged with the exact same tier, or the total and breakdown above describe
// whichever copy this module happened to read rather than a fact the whole
// knowledge base shares. Skipped when an override is set, since the override
// exists to point at a scratch copy that has no siblings to compare against.
if (!process.env.DOC_COUNT_SOURCES_TEA_INDEX_CSV) {
  const tierById = new Map(fragments.map((fragment) => [fragment.id, fragment.tier]));
  // A workflow that ships no `resources/knowledge` directory ships no
  // tea-index.csv either, by design (bmad-teach-me-testing, per its own
  // "no suite of any kind" entry in test/evals/suite-manifest.json's
  // `deferred` list). test/test-knowledge-base.js discovers workflows the
  // same way, off the knowledge directory's presence, not a hardcoded name.
  const otherWorkflows = fs
    .readdirSync(TESTARCH_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'bmad-testarch-test-review')
    .map((entry) => ({
      knowledgeDir: path.join(TESTARCH_ROOT, entry.name, 'resources', 'knowledge'),
      csvPath: path.join(TESTARCH_ROOT, entry.name, 'resources', 'tea-index.csv'),
    }))
    .filter(({ knowledgeDir }) => fs.existsSync(knowledgeDir))
    .map(({ csvPath }) => csvPath);

  for (const csvPath of otherWorkflows) {
    // No existence filter beyond the knowledge-directory check above: every
    // workflow that ships a knowledge directory is expected to ship a
    // tea-index.csv beside it, the same assumption test/test-knowledge-base.js
    // makes, so a missing one here is a real gap, not a sibling with nothing
    // to compare.
    const otherRows = readTeaIndex(csvPath);
    const otherTierById = new Map();
    const duplicates = new Set();
    for (const row of otherRows) {
      if (otherTierById.has(row.id)) duplicates.add(row.id);
      otherTierById.set(row.id, row.tier);
    }
    if (duplicates.size > 0) {
      refuse(`${csvPath} lists ${[...duplicates].join(', ')} more than once; a fragment id must appear exactly once`);
    }
    const missing = [...tierById.keys()].filter((id) => !otherTierById.has(id));
    if (missing.length > 0) {
      refuse(`${csvPath} is missing ${missing.join(', ')}, which ${TEA_INDEX_CSV} carries; the two copies must list the same ids`);
    }
    const extra = [...otherTierById.keys()].filter((id) => !tierById.has(id));
    if (extra.length > 0) {
      refuse(`${csvPath} lists ${extra.join(', ')}, which ${TEA_INDEX_CSV} does not carry; the two copies must list the same ids`);
    }
    for (const [id, tier] of otherTierById) {
      const expectedTier = tierById.get(id);
      if (expectedTier !== tier) {
        refuse(
          `${csvPath} tags "${id}" as tier "${tier}" and ${TEA_INDEX_CSV} tags it "${expectedTier}"; ` +
            'the knowledge-fragment tier breakdown assumes every copy agrees',
        );
      }
    }
  }
}
