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
const rawManifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'evals', 'suite-manifest.json'), 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
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

/**
 * The `atdd` suite's call count (README.md:424 and the roadmap sentence).
 * Added after the roadmap, adoption-guide and `ci` sentences were written, for
 * the same reason `CI_CALLS` is: held only where a sentence actually names it.
 */
exports.ATDD_CALLS = caseCountOf('atdd') * repetitionsOf('atdd');

/** The teaching suite makes one agent call per turn for every repetition. */
exports.TEACH_ME_TESTING_CALLS =
  caseCountOf('teach-me-testing') * repetitionsOf('teach-me-testing') * require('../eval-teach-me-testing').TURN_COUNT;

/** One `eval:all` run's total model calls, for one runner, across every suite. */
exports.TOTAL_CALLS =
  exports.FRAGMENT_SELECTION_CALLS +
  exports.ROUTING_INTENT_CALLS +
  exports.TEST_DESIGN_CALLS +
  exports.TEST_REVIEW_CALLS +
  exports.NFR_CALLS +
  exports.TRACE_CALLS +
  exports.CI_CALLS +
  exports.ATDD_CALLS +
  exports.TEACH_ME_TESTING_CALLS;

/** All three built-in runners (`claude`, `codex`, `agy`) making one `eval:all` run each. */
exports.TOTAL_CALLS_THREE_RUNNERS = exports.TOTAL_CALLS * 3;

/** The fragment-selection case count, held in README.md. */
exports.FRAGMENT_SELECTION_CASES = caseCountOf('fragment-selection');

/**
 * How many suites `eval:all --preflight-only` preflights, and how many of those
 * get a real agent-preflight check (an executable on `PATH`, `--version`, a
 * credential) rather than the corpus-and-tooling check `automate` gets,
 * because it invokes no agent at all (README.md's preflight-output sentence).
 * An `evaluate-authored` suite is left out: `eval:all` skips it, since
 * `tea-evaluate` runs it, and it declares no harness or runner capabilities.
 * The split is read off `runnerCapabilities` rather than the suite's name, so
 * a future suite in `automate`'s own shape is counted the same way without an
 * edit here: `["command-execution"]` alone is what a suite with no agent to
 * confine declares, since every agent-invoking suite needs a wider capability
 * (`read-only` at least) for its runner.
 */
const harnessSuites = manifest.suites.filter((suite) => suite.evalType !== 'evaluate-authored');
exports.TOTAL_SUITE_COUNT = harnessSuites.length;
exports.NO_AGENT_SUITE_COUNT = harnessSuites.filter(
  (suite) => JSON.stringify([...suite.runnerCapabilities].sort()) === JSON.stringify(['command-execution']),
).length;
exports.AGENT_PREFLIGHTED_SUITE_COUNT = exports.TOTAL_SUITE_COUNT - exports.NO_AGENT_SUITE_COUNT;

/**
 * The npm test chain length, reusing the exact function `test:ci-coverage`
 * prints so the README sentence and the printed count can never state two
 * different numbers.
 */
exports.NPM_TEST_CHAIN_LENGTH = chainedScripts(packageJson).length;

/**
 * The cap on Advisory Observations pulled into a review verdict's
 * `advisoryObservations` field, held in docs/reference/tea-test-review-cli.md.
 * Re-exported from cli/lib/parse-report.js's own named constant rather than
 * re-typed, so a change to the real default cannot drift silently out from
 * under this page's claim.
 */
exports.ADVISORY_OBSERVATIONS_MAX_ITEMS = require('../../cli/lib/parse-report.js').ADVISORY_OBSERVATIONS_MAX_ITEMS;

/**
 * The knowledge-fragment tier breakdown (README.md:215), read off the one
 * `tea-index.csv` every workflow loads as `{tea-knowledge}/tea-index.csv`.
 *
 * The path has an environment-variable override so
 * `test/test-doc-count-sources.js` can point this module at a scratch copy
 * rather than mutating the real file to prove the guards below fire.
 */
const TEA_INDEX_CSV =
  process.env.DOC_COUNT_SOURCES_TEA_INDEX_CSV || path.join(__dirname, '..', '..', 'skills', 'bmod-tea', 'knowledge', 'tea-index.csv');

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

const duplicateIds = fragments.map((fragment) => fragment.id).filter((id, index, ids) => ids.indexOf(id) !== index);
if (duplicateIds.length > 0) {
  refuse(`${TEA_INDEX_CSV} lists ${[...new Set(duplicateIds)].join(', ')} more than once; a fragment id must appear exactly once`);
}

/**
 * The replay corpus's own counts (docs/explanation/eval-quality-adoption-guide.md, the
 * Replay corpus row and the replay section, and docs/explanation/eval-quality-roadmap.md),
 * read from `test/replay/<suite>/<case>/expected.json` so that a new stored case cannot
 * leave a sentence stale.
 *
 * Every case directory has to carry an `expected.json` that names one known origin;
 * anything else throws, because a count that skipped a case would be a wrong number.
 */
const REPLAY_ROOT = path.join(__dirname, '..', 'replay');
const REPLAY_ORIGINS = new Set(['constructed', 'captured', 'real-capture']);

/**
 * Whether a stored result is a number the scorers produced.
 * A run the harness could not measure stores `null` or `{ "unmeasurable": <failure class> }` (test/test-eval-replay.js, `differences`).
 * Any other object is a scored result.
 * A result of another shape throws, because a count that guessed would be a wrong number.
 */
function producesNumber(where, result) {
  if (result === null) return false;
  if (typeof result !== 'object' || Array.isArray(result)) {
    refuse(
      `${where} stores a result of another shape (it has to be null or an object), so the replay counts cannot say whether it produces a number`,
    );
  }
  return !Object.hasOwn(result, 'unmeasurable');
}

function replayCases() {
  const cases = [];
  for (const suiteEntry of fs.readdirSync(REPLAY_ROOT, { withFileTypes: true })) {
    if (!suiteEntry.isDirectory()) continue;
    const suiteRoot = path.join(REPLAY_ROOT, suiteEntry.name);
    for (const caseEntry of fs.readdirSync(suiteRoot, { withFileTypes: true })) {
      if (!caseEntry.isDirectory()) continue;
      const expectedPath = path.join(suiteRoot, caseEntry.name, 'expected.json');
      if (!fs.existsSync(expectedPath))
        refuse(`${path.relative(REPLAY_ROOT, expectedPath)} does not exist, so the replay case count would skip a case`);
      const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
      const origin = expected.storedOutput?.origin;
      if (!REPLAY_ORIGINS.has(origin)) {
        refuse(
          `${path.relative(REPLAY_ROOT, expectedPath)} names the origin ${JSON.stringify(origin)}; the replay counts know ${[...REPLAY_ORIGINS].join(', ')}`,
        );
      }
      cases.push({
        suite: suiteEntry.name,
        origin,
        scored: producesNumber(path.relative(REPLAY_ROOT, expectedPath), expected.result),
        fixtureSet: expected.inputs?.fixtureSet,
      });
    }
  }
  return cases;
}

const replay = replayCases();
const replaySuite = (suite) => replay.filter((entry) => entry.suite === suite).length;
const replayOrigin = (origin) => replay.filter((entry) => entry.origin === origin).length;

exports.REPLAY_TOTAL = replay.length;
exports.REPLAY_FRAGMENT_SELECTION = replaySuite('fragment-selection');
exports.REPLAY_ATDD = replaySuite('atdd');
exports.REPLAY_TEST_REVIEW = replaySuite('test-review');
exports.REPLAY_TEST_DESIGN = replaySuite('test-design');
exports.REPLAY_TRACE = replaySuite('trace');
exports.REPLAY_ROUTING = replaySuite('bmad-tea-routing');
exports.REPLAY_NFR = replaySuite('nfr');
exports.REPLAY_CI = replaySuite('ci');
exports.REPLAY_REAL_CAPTURES = replayOrigin('real-capture');
exports.REPLAY_CAPTURED = replayOrigin('captured');
exports.REPLAY_CONSTRUCTED = replayOrigin('constructed');

/**
 * The counts test/README.md and the header of test/test-eval-replay.js state about what the corpus can and cannot prove.
 * They are the cases whose stored result is a number, the constructed ones among them, and the cases that carry captured bytes (an origin of `captured` or `real-capture`), in all and per suite.
 */
const CAPTURED_ORIGINS = new Set(['captured', 'real-capture']);
const replayCarriesBytes = (entry) => CAPTURED_ORIGINS.has(entry.origin);

exports.REPLAY_SCORED = replay.filter((entry) => entry.scored).length;
exports.REPLAY_SCORED_CONSTRUCTED = replay.filter((entry) => entry.scored && entry.origin === 'constructed').length;
exports.REPLAY_CAPTURED_BYTES = replay.filter(replayCarriesBytes).length;
exports.REPLAY_ATDD_CAPTURED_BYTES = replay.filter((entry) => entry.suite === 'atdd' && replayCarriesBytes(entry)).length;
exports.REPLAY_TEST_REVIEW_CAPTURED_BYTES = replay.filter((entry) => entry.suite === 'test-review' && replayCarriesBytes(entry)).length;
exports.REPLAY_CI_CAPTURED_BYTES = replay.filter((entry) => entry.suite === 'ci' && replayCarriesBytes(entry)).length;

/** The `ci` cases over the `full` and `minimal` projects, whose fixture sets are named `full-...` and `minimal-...`. */
exports.REPLAY_CI_FULL_AND_MINIMAL = replay.filter(
  (entry) => entry.suite === 'ci' && /^(?:full|minimal)-/.test(entry.fixtureSet ?? ''),
).length;
