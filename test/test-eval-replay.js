/**
 * Replay the stored eval outputs through the live parsers and scorers, with no
 * model call and no network.
 *
 * The two eval harnesses can only produce a number by spending a vendor run, so
 * every change to how they parse a reply or score it has shipped unverified. A
 * scorer is ordinary code and it can be regression-tested like ordinary code:
 * keep the outputs a run produced, keep the result scoring them produced, and
 * re-derive the second from the first on every commit.
 *
 * WHAT IS STORED
 *
 * One directory per case under test/replay/<suite>/<case>/:
 *
 *   test-review         verdict.json and the report it points at, scored by
 *                       scoreVerdict against the eval's real ground truth
 *   fragment-selection  stdout.txt, parsed by parseSelection and scored by
 *                       scoreCase against a frozen copy of one eval case
 *
 * Each expected.json carries the result, the arithmetic that produced it, and
 * whether the stored output is a real capture or was constructed. The numbers
 * were derived by hand from the ground truth before this harness existed. A
 * golden file generated from the code under test would prove only that the code
 * is deterministic, which nobody doubts.
 *
 * Each stored verdict is also re-derived from its own report through
 * cli/lib/parse-report.js and has to reproduce. Without that, a stored verdict
 * and the report beside it can disagree and nothing notices: scoreVerdict reads
 * qualityScore straight off the verdict and re-parses the markdown with two
 * regexes of its own, so editing a stored score and its expected result together
 * leaves the suite green around a verdict no run could have produced. The same
 * check settles whether the ledger arithmetic is real, since parse-report.js
 * derives the score and the recommendation rather than trusting what a report
 * claims about itself.
 *
 * WHAT A GREEN RUN PROVES, AND WHAT IT DOES NOT
 *
 * test/README.md says of the CLI parser fixtures: "A fixture report is shaped to
 * the parser, so a green run here proves nothing about what a live agent emits."
 * The same sentence applies here, and harder. This suite proves the scorers are
 * deterministic and that they reproduce recorded history. It proves nothing about
 * whether they handle real agent output correctly, because every case that
 * produces a number was written by hand to be parsed. Six of the eleven cases
 * produce a number and all six are constructed. Two carry real captured bytes,
 * both borrowed from the CLI parser fixtures, and both score as unmeasurable. No
 * live run of either eval has ever been recorded, so this repository holds no
 * captured output that this suite can turn into a number.
 *
 * Two more things sit outside what a green run covers:
 *
 *   Aggregation and thresholds. recall, criticalRecall, nonFalsePositiveRate,
 *   scoreStdev, requiredRecall and forbiddenRate are all computed inside main()
 *   in the two harnesses and none of them is exported. Pinning them here would
 *   pin this file's reimplementation of the formula rather than theirs, which is
 *   worse than not pinning them, so the per-case counts are versioned and the
 *   aggregation over them is not. Change the nonFalsePositiveRate formula to fold
 *   unattributed findings in and every case here stays green. THRESHOLDS is a
 *   smaller gap than it looks: tools/validate-eval-schemas.js already fails when
 *   a harness constant and test/evals/suite-manifest.json disagree, so a lowered
 *   threshold is caught by npm run test:eval-schemas rather than here.
 *
 *   admittedLinesFor's lineTolerance fallback. Every plant in ground-truth.json
 *   declares an admittedLines set, so the radius branch is unreachable from real
 *   data and no case exercises it. Covering it would need a second, synthetic
 *   ground truth, which is the thing the scoringInputsDigest guard exists to
 *   forbid, so the gap is declared rather than papered over.
 *
 * THE VERSION RULE
 *
 * SCORER_VERSION below names the version of the parsing and scoring behaviour the
 * corpus was recorded against. Every stored result carries the version it was
 * recorded at:
 *
 *   result reproduces         pass, whatever the stamp says. A stamp behind the
 *                             current version is reported as "version stamp only"
 *                             and the file is left alone, so a bump leaves exactly
 *                             the cases whose numbers moved in the diff.
 *   equal, result differs     a scorer or parser moved without saying so; failure
 *   stored below, differs     the change was declared; re-record with --accept
 *   stored above current      the corpus is newer than this harness; failure
 *
 * --accept is refused while the versions are equal. Rewriting a stored result at
 * an unchanged version is how a regression gets recorded as history, so accepting
 * one costs a deliberate edit to SCORER_VERSION on its own reviewable line.
 *
 * A case also records a digest of the scoring-relevant half of the ground truth.
 * A change there is a change to the input rather than to the scorer, and it fails
 * with its own message so the two are never confused. --accept refuses that one
 * outright: a moved plant needs its expected result re-derived by hand, which is
 * the same work that produced the corpus in the first place.
 *
 * Usage:
 *   node test/test-eval-replay.js
 *   node test/test-eval-replay.js --accept                     # every moved case
 *   node test/test-eval-replay.js --accept test-review/misses-two
 *
 * Exit codes:
 *   0  every case reproduced its stored result
 *   1  a case moved, its ground truth moved, or its verdict and report disagree
 *   2  the corpus could not be read, or --accept named a case that does not exist
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { parseReport } = require('../cli/lib/parse-report');
const { scoreVerdict } = require('./eval-test-review');
const { parseSelection, scoreCase } = require('./eval-fragment-selection');
const { digest } = require('./lib/eval-record');

const PROJECT_ROOT = path.join(__dirname, '..');
const REPLAY_ROOT = path.join(__dirname, 'replay');
const GROUND_TRUTH = path.join(__dirname, 'fixtures', 'test-review-eval', 'ground-truth.json');

/**
 * The version of the parsing and scoring behaviour this corpus was recorded
 * against. It covers findingsFromReport, admittedLinesFor and scoreVerdict in
 * eval-test-review.js, and parseSelection and scoreCase in
 * eval-fragment-selection.js. It does not cover the aggregation those feed or
 * the thresholds it is compared against; see the header for why.
 *
 * Bump it in the same commit as a deliberate change to any of those five, then
 * re-record with --accept. Leaving it alone is what makes an accidental change
 * fail.
 */
const SCORER_VERSION = 1;

const colors = {
  reset: '[0m',
  red: '[31m',
  green: '[32m',
  yellow: '[33m',
  cyan: '[36m',
  dim: '[2m',
};

let passed = 0;
let failed = 0;

function assert(condition, testName, errorMessage = '') {
  if (condition) {
    console.log(`${colors.green}✓${colors.reset} ${testName}`);
    passed += 1;
  } else {
    console.log(`${colors.red}✗${colors.reset} ${testName}`);
    if (errorMessage) console.log(`  ${colors.dim}${errorMessage}${colors.reset}`);
    failed += 1;
  }
}

/** A corpus that cannot be read, or an invocation that names nothing, is exit 2. */
function unreadable(message) {
  console.error(`${colors.red}replay: ${message}${colors.reset}`);
  process.exit(2);
}

function readJson(absolute, label) {
  if (!fs.existsSync(absolute)) unreadable(`${label} not found at ${path.relative(PROJECT_ROOT, absolute)}`);
  try {
    return JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch (error) {
    unreadable(`${label} is not valid JSON (${path.relative(PROJECT_ROOT, absolute)}): ${error.message}`);
  }
}

/**
 * The scoring-relevant half of the ground truth, as canonical strings.
 *
 * Only the fields scoreVerdict reads are included: the fallback tolerance, the
 * file list, and each plant's row, line and admitted set. Prose in `$comment`,
 * `what` or `why` moves the file without moving any number, so it stays out and
 * an editorial pass over the ground truth does not fail every stored case.
 *
 * @param {object} groundTruth
 * @returns {string[]}
 */
function scoringInputs(groundTruth) {
  return [
    `lineTolerance=${groundTruth.lineTolerance ?? 0}`,
    ...(groundTruth.files ?? []).map((file) =>
      [file.path, ...(file.planted ?? []).map((plant) => `${plant.row}@${plant.line}[${(plant.admittedLines ?? []).join(' ')}]`)].join('|'),
    ),
  ];
}

/** Every case directory under test/replay, suite by suite, in a stable order. */
function findCases() {
  if (!fs.existsSync(REPLAY_ROOT)) unreadable(`no replay corpus at ${path.relative(PROJECT_ROOT, REPLAY_ROOT)}`);
  const found = [];
  const suites = fs
    .readdirSync(REPLAY_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const suite of suites) {
    const suiteDir = path.join(REPLAY_ROOT, suite.name);
    const directories = fs
      .readdirSync(suiteDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of directories) {
      found.push({ id: `${suite.name}/${entry.name}`, suite: suite.name, directory: path.join(suiteDir, entry.name) });
    }
  }
  if (found.length === 0) unreadable(`no cases under ${path.relative(PROJECT_ROOT, REPLAY_ROOT)}`);
  return found;
}

/**
 * scoreVerdict's return value reduced to what a stored result can hold.
 *
 * `misses` arrives as whole ground-truth plant objects. Only the identity of a
 * missed plant belongs in a stored result, so it collapses to "row path:line";
 * carrying the `what` and `why` prose would make an editorial pass over the
 * ground truth read as a moved score.
 *
 * @param {object|null} scored
 * @returns {object|null}
 */
function projectReviewResult(scored) {
  if (scored === null) return null;
  return {
    // A verdict with no qualityScore scores NaN, which JSON cannot hold. Null is
    // the same convention the result records use for an unmeasurable number.
    score: Number.isFinite(scored.score) ? scored.score : null,
    recommendation: scored.recommendation,
    planted: scored.planted,
    hits: scored.hits,
    misses: scored.misses.map((miss) => `${miss.row} ${miss.path}:${miss.line}`),
    criticalPlanted: scored.criticalPlanted,
    criticalHits: scored.criticalHits,
    reported: scored.reported,
    falsePositives: scored.falsePositives,
    unattributed: scored.unattributed,
  };
}

/** parseSelection plus scoreCase, in the shape a stored result holds. */
function projectSelectionResult(selection, item) {
  if (selection === null) return { selection: null, score: null };
  return { selection, score: scoreCase(item, selection) };
}

/** Object keys sorted at every depth, so a comparison does not depend on key order. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

const same = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * The field-by-field difference between two results.
 *
 * A moved case has to say which field moved rather than printing two objects and
 * leaving the reader to diff them. The null cases need that as much as the scored
 * ones: an unmeasurable case that starts scoring is the most important regression
 * this corpus can catch, so it says the case crossed from unmeasurable to scored
 * and then names every field of the result it grew, instead of dumping an object.
 *
 * @param {object|null} before
 * @param {object|null} after
 * @param {[string, string]} labels - How to name the two sides.
 * @returns {string[]} One line per field that differs.
 */
function differences(before, after, labels = ['recorded', 'now']) {
  const [left, right] = labels;
  if (isRecord(before) && isRecord(after)) {
    const lines = [];
    for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
      if (same(before[key], after[key])) continue;
      lines.push(`${key}: ${left} ${JSON.stringify(before[key])}, ${right} ${JSON.stringify(after[key])}`);
    }
    return lines;
  }
  if (before === null && isRecord(after)) {
    return [
      `result: ${left} null, meaning the run was unmeasurable, ${right} a scored result:`,
      ...Object.keys(after)
        .sort()
        .map((key) => `  ${key}: ${JSON.stringify(after[key])}`),
    ];
  }
  if (isRecord(before) && after === null) {
    return [
      `result: ${left} a scored result, ${right} null, meaning the run became unmeasurable. What it held:`,
      ...Object.keys(before)
        .sort()
        .map((key) => `  ${key}: ${JSON.stringify(before[key])}`),
    ];
  }
  return [`${left} ${JSON.stringify(before)}, ${right} ${JSON.stringify(after)}`];
}

/** The stored verdict for a test-review case, with the report it names on disk. */
function loadReviewVerdict(item) {
  const verdict = readJson(path.join(item.directory, 'verdict.json'), `${item.id} verdict`);
  const reportPath = path.resolve(PROJECT_ROOT, String(verdict.report ?? ''));
  // findingsFromReport answers null for a report it cannot open, which is the same
  // answer it gives for a report that attributes no findings. A missing stored
  // report would therefore reproduce the unmeasurable cases exactly, so it is
  // caught here instead of scoring as one.
  if (!verdict.report || !fs.existsSync(reportPath)) {
    unreadable(`${item.id}: verdict.report points at ${verdict.report ?? '(nothing)'}, which does not exist`);
  }
  return { verdict, reportPath };
}

/**
 * Where a stored verdict disagrees with the report it points at.
 *
 * The CLI derives all three of these from the report rather than trusting it, so
 * re-deriving them is what keeps a stored verdict honest: a hand-edited score, a
 * recommendation that its own violation counts do not support, or a Total
 * Violations line that drifted away from the findings under it all surface here.
 *
 * @returns {string[]} Empty when the verdict is exactly what the report produces.
 */
function verdictDriftFromReport(verdict, reportPath) {
  let derived;
  try {
    derived = parseReport(fs.readFileSync(reportPath, 'utf8'));
  } catch (error) {
    return [`the stored report no longer parses through cli/lib/parse-report.js: ${error.message}`];
  }
  const stored = { recommendation: verdict.recommendation, qualityScore: verdict.qualityScore, violations: verdict.violations };
  const fresh = { recommendation: derived.recommendation, qualityScore: derived.qualityScore, violations: derived.violations };
  return differences(stored, fresh, ['the verdict says', 'the report derives']);
}

/** Parse and score one stored fragment-selection case. */
function replaySelectionCase(item, expected) {
  const stdoutPath = path.join(item.directory, 'stdout.txt');
  if (!fs.existsSync(stdoutPath)) unreadable(`${item.id}: no stdout.txt beside expected.json`);
  const expect = expected.inputs?.expect;
  if (!expect) unreadable(`${item.id}: expected.json has no inputs.expect to score against`);
  const stdout = fs.readFileSync(stdoutPath, 'utf8');
  return projectSelectionResult(parseSelection(stdout), { id: expected.id, expect });
}

/**
 * Rewrite one stored result and stamp it at the current scorer version.
 *
 * Only `result` and `scorerVersion` move. The prose that explains the case is
 * left alone on purpose: a re-record makes the recorded arithmetic stale, and a
 * human has to rewrite it. Erasing it here would hide that debt.
 *
 * A case whose result already reproduces is never written. Stamping one would put
 * it in the diff of a version bump beside the cases whose numbers actually moved,
 * and a reviewer would then have to open every file to find the one that matters.
 * The caller passes such a case only if it stops filtering them out first, so the
 * guard is here as well as there.
 *
 * @returns {boolean} Whether anything was written.
 */
function acceptCase(item, expected, observed) {
  if (same(expected.result, observed)) return false;
  const rewritten = { ...expected, scorerVersion: SCORER_VERSION, result: observed };
  fs.writeFileSync(path.join(item.directory, 'expected.json'), `${JSON.stringify(rewritten, null, 2)}\n`, 'utf8');
  return true;
}

function main(argv) {
  const acceptIndex = argv.indexOf('--accept');
  const accepting = acceptIndex !== -1;
  const acceptTargets = accepting ? argv.slice(acceptIndex + 1).filter((value) => !value.startsWith('--')) : [];

  console.log(`${colors.cyan}========================================`);
  console.log('eval replay: stored outputs, no model call');
  console.log(`========================================${colors.reset}\n`);

  const groundTruth = readJson(GROUND_TRUTH, 'ground truth');
  const groundTruthDigest = digest(scoringInputs(groundTruth));
  const cases = findCases();

  // A mistyped case id used to be a silent no-op that exited 0, which reads as
  // "the change was accepted" when nothing was written.
  const known = new Set(cases.map((item) => item.id));
  for (const target of acceptTargets) {
    if (!known.has(target)) {
      unreadable(`--accept names "${target}", which is not a case. Known cases:\n  ${[...known].join('\n  ')}`);
    }
  }

  const accepted = [];

  for (const item of cases) {
    const expected = readJson(path.join(item.directory, 'expected.json'), `${item.id} expected result`);
    const wanted = accepting && (acceptTargets.length === 0 || acceptTargets.includes(item.id));

    if (!Number.isInteger(expected.scorerVersion)) {
      assert(false, item.id, 'expected.json has no integer scorerVersion; every stored result must name the version it was recorded at');
      continue;
    }
    if (expected.scorerVersion > SCORER_VERSION) {
      assert(
        false,
        item.id,
        `recorded at scorerVersion ${expected.scorerVersion}, ahead of this harness's SCORER_VERSION ${SCORER_VERSION}. ` +
          'The corpus is newer than the code reading it; update the harness rather than the corpus.',
      );
      continue;
    }

    let observed;
    if (item.suite === 'test-review') {
      const recordedDigest = expected.inputs?.scoringInputsDigest;
      if (recordedDigest !== groundTruthDigest) {
        assert(
          false,
          item.id,
          `the ground truth moved. This result was derived against ${recordedDigest ?? '(nothing recorded)'} and ` +
            `${path.relative(PROJECT_ROOT, GROUND_TRUTH)} now digests to ${groundTruthDigest}. A plant, a line, an admitted set ` +
            'or the file list changed, so the expected numbers have to be re-derived by hand and the digest updated with them. ' +
            '--accept will not do this one.',
        );
        continue;
      }
      const { verdict, reportPath } = loadReviewVerdict(item);
      const drift = verdictDriftFromReport(verdict, reportPath);
      if (drift.length > 0) {
        assert(
          false,
          item.id,
          [
            `the stored verdict is not what its report produces (${path.relative(PROJECT_ROOT, reportPath)}):`,
            ...drift.map((line) => `  ${line}`),
            'A verdict no run could have produced makes every number scored from it meaningless, so fix the pair before',
            'touching the expected result. --accept will not do this one either.',
          ].join('\n  '),
        );
        continue;
      }
      observed = projectReviewResult(scoreVerdict(verdict, groundTruth));
    } else if (item.suite === 'fragment-selection') {
      observed = replaySelectionCase(item, expected);
    } else {
      assert(false, item.id, `unknown suite directory "${item.suite}"; expected test-review or fragment-selection`);
      continue;
    }

    const reproduced = same(expected.result, observed);
    const current = expected.scorerVersion === SCORER_VERSION;

    // A result that still reproduces is a pass whatever its stamp says, and its
    // file is left untouched. That is what keeps a version bump from rewriting
    // every case in the corpus to record that one of them moved.
    if (reproduced) {
      const note = current
        ? `scorer v${SCORER_VERSION}`
        : `version stamp only: recorded at v${expected.scorerVersion}, unchanged at v${SCORER_VERSION}`;
      assert(true, `${item.id} ${colors.dim}(${note})${colors.reset}`);
      continue;
    }

    if (current) {
      const detail = [
        `the scored result moved at an unchanged scorerVersion ${SCORER_VERSION}:`,
        ...differences(expected.result, observed).map((line) => `  ${line}`),
        `To accept this, bump SCORER_VERSION in ${path.relative(PROJECT_ROOT, __filename)} to ${SCORER_VERSION + 1} on its own line,`,
        `then run: node ${path.relative(PROJECT_ROOT, __filename)} --accept ${item.id}`,
      ].join('\n  ');
      assert(false, item.id, detail);
      continue;
    }

    // Below the current version and the numbers moved, so a change to the scorer
    // was declared and this is one of the cases it actually touched. The stored
    // numbers stay the old ones until somebody writes the new ones down, which is
    // the reviewable half of "declare the change".
    if (wanted) {
      acceptCase(item, expected, observed);
      accepted.push(item.id);
      console.log(`${colors.yellow}↻${colors.reset} ${item.id} ${colors.dim}(re-recorded at scorer v${SCORER_VERSION})${colors.reset}`);
      for (const line of differences(expected.result, observed)) console.log(`  ${colors.dim}${line}${colors.reset}`);
      continue;
    }
    const detail = [
      `recorded at scorerVersion ${expected.scorerVersion}, this harness is at ${SCORER_VERSION}, so a scorer change was declared,`,
      'and this is one of the cases it moved:',
      ...differences(expected.result, observed).map((line) => `  ${line}`),
      `Run: node ${path.relative(PROJECT_ROOT, __filename)} --accept ${item.id}`,
      'then rewrite the case derivation by hand, because the arithmetic it records is now stale.',
    ].join('\n  ');
    assert(false, item.id, detail);
  }

  console.log(`\n${colors.cyan}========================================${colors.reset}`);
  if (accepted.length > 0) {
    console.log(
      `${colors.yellow}re-recorded ${accepted.length} case(s) at scorer v${SCORER_VERSION}.${colors.reset} ` +
        'Their "derivation" text is now stale; rewrite it before committing.',
    );
  }
  console.log(`${colors.green}${passed} reproduced${colors.reset}, ${failed > 0 ? colors.red : ''}${failed} moved${colors.reset}`);
  return failed > 0 ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  SCORER_VERSION,
  scoringInputs,
  projectReviewResult,
  projectSelectionResult,
  differences,
  verdictDriftFromReport,
  findCases,
};
