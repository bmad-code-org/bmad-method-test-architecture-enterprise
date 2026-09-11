/**
 * Replay the stored eval outputs through the live parsers and scorers, with no
 * model call and no network.
 *
 * The four eval harnesses can only produce a number by spending a vendor run, so
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
 *   test-design         design.md, the document a test-design run leaves on disk,
 *                       read by readDesign and scored by scoreRun against one
 *                       fixture set of the eval's real ground truth
 *   trace               test-artifacts/e2e-trace-summary.json and
 *                       test-artifacts/traceability-matrix.md, the two files a
 *                       trace run leaves in a staged workspace, read by
 *                       readSummary and readMatrix and scored by scoreRun against
 *                       one fixture set of the eval's real ground truth
 *
 * Each expected.json carries the result, the arithmetic that produced it, and
 * whether the stored output is a real capture or was constructed. The numbers
 * were derived by hand from the ground truth before this harness existed. A
 * golden file generated from the code under test would prove only that the code
 * is deterministic, which nobody doubts.
 *
 * A trace case is one fixture set's artifacts, so its expected.json names the set
 * and digests that set's scoring inputs. An edit to the clean set fails no seeded
 * case. Its result is the scored object reduced to
 * what a reader can check by hand: the reported status per criterion, the gate,
 * the citation tally, and for each check group the count, the count that passed,
 * and the field, expected value, and actual value of every check that did not. A
 * field the summary lacked appears with no `actual` key at all. A summary
 * readSummary refuses, or a matrix readMatrix reads no criterion section out of,
 * records `{ "unmeasurable": <failure class> }`, the class runCase reports for that
 * environment failure.
 *
 * The trace cases also pin signatureOf, the string main() compares across
 * repetitions to call a case stable. Its contract is that nothing scored is left
 * out and nothing environmental is let in, and the corpus is what makes that
 * checkable: two cases scored against the same set must sign identically exactly
 * when their results are identical, and every case must sign differently once a
 * fixture mutation is counted against it. A run whose live records land as
 * unverifiable sits in the corpus beside its stale twin for this reason, and so
 * does a run whose matrix carries lines the parser must ignore.
 *
 * Each stored verdict is also re-derived from its own report through
 * cli/lib/parse-report.js and has to reproduce. Without that, a stored verdict
 * and the report beside it can disagree and nothing notices: scoreVerdict reads
 * the verdict's own qualityScore and findings, so editing a stored verdict and
 * its expected result together leaves the suite green around a verdict no run
 * could have produced. The same check settles whether the ledger arithmetic is
 * real, since parse-report.js derives the score and the recommendation rather
 * than trusting what a report claims about itself.
 *
 * WHAT A GREEN RUN PROVES, AND WHAT IT DOES NOT
 *
 * test/README.md says of the CLI parser fixtures: "A fixture report is shaped to
 * the parser, so a green run here proves nothing about what a live agent emits."
 * The same sentence applies here, and harder. This suite proves the scorers are
 * deterministic and that they reproduce recorded history. It proves nothing about
 * whether they handle real agent output correctly, because every case that
 * produces a number was written by hand to be parsed. Fifty-two of the
 * fifty-five cases produce a number and all but two of those are constructed. Two
 * carry real captured bytes borrowed from the CLI parser fixtures, and both now
 * score as a measured miss rather than as unmeasurable: their reports document
 * no finding at all, and a verdict whose findings array is empty is a reviewer
 * that named nothing. The live runs of 2026-09-08 measured the three suites that existed then and
 * none of their output was committed, so this repository still holds no captured
 * output that this suite can turn into a number a vendor actually earned, and
 * the trace suite in particular has no real capture at all.
 *
 * Two more things sit outside what a green run covers:
 *
 *   Aggregation and thresholds. recall, criticalRecall, nonFalsePositiveRate,
 *   scoreStdev, requiredRecall, forbiddenRate and the trace ratios are all
 *   computed inside main() in the harnesses and none of them is exported.
 *   Pinning them here would pin this file's reimplementation of the formula
 *   rather than theirs, which is worse than not pinning them, so the per-case
 *   counts are versioned and the aggregation over them is not. Change the
 *   nonFalsePositiveRate formula to fold unattributed findings in and every case
 *   here stays green. THRESHOLDS is a smaller gap than it looks:
 *   tools/validate-eval-schemas.js already fails when a harness constant and
 *   test/evals/suite-manifest.json disagree, so a lowered threshold is caught by
 *   npm run test:eval-schemas rather than here.
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
 * outright: a moved plant or a moved evidence span needs its expected result
 * re-derived by hand, which is the same work that produced the corpus in the
 * first place.
 *
 * It also carries the checks on test/lib/eval-record.js that need no corpus. That
 * module writes the result file the harnesses upload, and this is the only entry
 * point in the pull-request gate that executes any of it; see checkRecordHygiene.
 *
 * Usage:
 *   node test/test-eval-replay.js
 *   node test/test-eval-replay.js --accept                     # every moved case
 *   node test/test-eval-replay.js --accept test-review/misses-two
 *
 * Exit codes:
 *   0  every case reproduced its stored result
 *   1  a case moved, its ground truth moved, its verdict and report disagree, or
 *      a trace signature disagrees with the results it is supposed to summarize
 *   2  the corpus could not be read, or --accept named a case that does not exist
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { parseReport } = require('../cli/lib/parse-report');
const { scoreVerdict } = require('./eval-test-review');
const { parseSelection, scoreCase } = require('./eval-fragment-selection');
const { readSummary, readMatrix, scoreRun, signatureOf } = require('./eval-trace');
const { parseRouting } = require('../cli/lib/parse-routing');
const { scoreCase: scoreRoutingCase, signatureOf: routingSignatureOf } = require('./eval-bmad-tea-routing');
const {
  readDesign: readTestDesign,
  scoreRun: scoreTestDesignRun,
  signatureOf: testDesignSignatureOf,
  loadGroundTruth: loadTestDesignGroundTruth,
} = require('./eval-test-design');
const { digest, redactArgs } = require('./lib/eval-record');

const PROJECT_ROOT = path.join(__dirname, '..');
const REPLAY_ROOT = path.join(__dirname, 'replay');
const GROUND_TRUTH = path.join(__dirname, 'fixtures', 'test-review-eval', 'ground-truth.json');
const TRACE_GROUND_TRUTH = path.join(__dirname, 'fixtures', 'trace-eval', 'ground-truth.json');
const TEST_DESIGN_GROUND_TRUTH = path.join(__dirname, 'fixtures', 'test-design-eval', 'ground-truth.json');

/**
 * The version of the parsing and scoring behaviour this corpus was recorded
 * against. It covers admittedLinesFor and scoreVerdict in eval-test-review.js,
 * parseSelection and scoreCase in eval-fragment-selection.js, readSummary,
 * readMatrix, scoreRun with the eight scorers it calls, and signatureOf in
 * eval-trace.js, and readDesign with scoreRun in eval-test-design.js. It does not
 * cover the aggregation those feed or the thresholds it is compared against; see
 * the header for why.
 *
 * Bump it in the same commit as a deliberate change to any of those, then
 * re-record with --accept. Leaving it alone is what makes an accidental change
 * fail.
 *
 * 2 is scoreVerdict reading the verdict's own `findings` array. Until then it
 * re-parsed the report with two regexes of its own, which counted a finding
 * quoted inside a fenced example as real and refused to score a run whose report
 * counted a violation it summarized in prose. Four cases moved with it: two that
 * had scored unmeasurable now score a measured miss, and two that had scored
 * unmeasurable now score real hits. Every result also grew an `unlocated` count,
 * because a finding naming no file is one no scorer can adjudicate and dropping
 * it silently is the defect this version exists to close.
 *
 * 3 is scoreVerdict counting a finding against a file outside the review set as
 * a definite false positive, carried as `outOfScope` beside the total. The ground
 * truth had declared that rule under negativeControls since the corpus was
 * written and nothing scored it: such a finding landed in `unattributed`, which
 * is the bucket for findings a human has yet to rule on, and this one needs no
 * ruling. Every stored result grew the field at 0, and one new case,
 * out-of-scope-finding, carries the one finding that makes it 1. File matching
 * also became boundary-aware at the same version: a path ends in `/name` or is
 * `name`, where a bare suffix match had admitted `notcheckout.spec.ts`. No stored
 * case carries such a path, so no other number moved.
 *
 * 4 also carries the bmad-tea routing scorers, which entered the corpus without
 * moving a number: `scoreCase` and `signatureOf` from test/eval-bmad-tea-routing.js
 * are new code with new cases, and no test-review, fragment-selection or trace
 * case moved when they landed, so there was nothing for a bump to record.
 *
 * 4 is the trace scorers entering the corpus, with two changes made while the
 * first cases were being derived by hand. readMatrix closes a criterion section
 * at any heading of the same depth or shallower, where it had kept the last
 * section open through `### Gap Analysis` and attributed every test cited there
 * to the last criterion as an unresolved citation. scoreArithmetic scores
 * tests.files, tests.cases, by_level.*.tests and the requirement ids the gap
 * recommendations name, all recomputed from the accepted evidence. No
 * test-review or fragment-selection case moved.
 */
const SCORER_VERSION = 7;

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

/**
 * The scoring-relevant half of one trace fixture set, as canonical strings.
 *
 * Only what scoreRun and the scorers it calls read: the two tolerances, the
 * oracle and collection fields, whether the set declares a live file and a
 * register, each criterion's priority, true coverage, discriminating flag and the
 * spans of its evidence and false evidence, the declared gate criteria, the ids
 * of the expected valid and invalid waivers, and the live expectations down to
 * the blocker severities. The typed coverageArithmetic and expectedTestInventory
 * blocks stay out because validateCorpus already holds them equal to what the
 * criteria recompute to, and every `why`, `text`, `title` and `establishes`
 * string stays out so an editorial pass moves no digest.
 *
 * @param {object} groundTruth
 * @param {object} set One entry of groundTruth.fixtureSets.
 * @returns {string[]}
 */
function traceScoringInputs(groundTruth, set) {
  const span = (entry) =>
    entry.level === 'live' ? `live:${entry.recordId}` : `${entry.file}:${entry.line}-${entry.lineEnd}@${entry.level}`;
  const live = set.expectedLiveEvidence ?? {};
  const pair = live.environmentDependentPair?.whenCurrentShaResolves ?? {};
  const ids = (waivers) => (waivers ?? []).map((waiver) => waiver.id).join(' ');
  return [
    `evidenceLineTolerance=${groundTruth.evidenceLineTolerance ?? 0}`,
    `coveragePercentTolerance=${groundTruth.coveragePercentTolerance ?? 0}`,
    `set=${set.id}`,
    `oracle=${[
      set.oracle?.document,
      set.oracle?.coverageBasis,
      set.oracle?.oracleResolutionMode,
      set.oracle?.oracleConfidence,
      set.oracle?.externalPointerStatus,
    ].join('|')}`,
    `collection=${set.collection?.collectionMode}|${set.collection?.collectionStatus}`,
    `declares=live:${Boolean(set.liveResultsFile)}|register:${Boolean(set.waiverRegister)}`,
    ...(set.criteria ?? []).map((item) =>
      [
        item.id,
        item.priority,
        item.trueCoverage,
        item.isDiscriminatingCase === true,
        (item.evidence ?? []).map(span).join(' '),
        (item.falseEvidence ?? []).map(span).join(' '),
      ].join('|'),
    ),
    `gateCriteria=${JSON.stringify(canonical(set.expectedGate?.gateCriteria ?? {}))}`,
    `waivers=valid:${ids(set.expectedWaiverHandling?.valid)}|invalid:${ids(set.expectedWaiverHandling?.invalid)}`,
    `live=${JSON.stringify(
      canonical({
        present: live.present,
        freshness: live.freshness,
        counted: live.counted,
        requirements_live_only: live.requirements_live_only,
        failed: live.failed,
        contradicted: live.contradicted,
        blocked: live.blocked,
        skipped: live.skipped,
        unmatched: live.unmatched,
        invalid: live.invalid,
        stale: pair.stale,
        unverifiable: pair.unverifiable,
        blockers: (live.expectedBlockers ?? []).map((blocker) => `${blocker.id}@${blocker.severity}`),
      }),
    )}`,
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
    outOfScope: scored.outOfScope,
    unattributed: scored.unattributed,
    unlocated: scored.unlocated,
  };
}

/** parseSelection plus scoreCase, in the shape a stored result holds. */
function projectSelectionResult(selection, item) {
  if (selection === null) return { selection: null, score: null };
  return { selection, score: scoreCase(item, selection) };
}

/**
 * scoreRun's return value reduced to what a stored result can hold and a reader
 * can derive by hand.
 *
 * Each check group becomes its size, the number that passed, and the field,
 * expected value and actual value of each check that did not. Passing checks
 * carry no information a reader could not reconstruct, because a passing check's
 * actual value is its expected value and the expected values are fixed by the
 * fixture set. `failed` keeps the scorer's own order, since two results are
 * compared as JSON and that order is part of the answer. A check whose actual
 * value was undefined, because the summary lacked the field, is stored with no
 * `actual` key, which is how JSON spells undefined.
 *
 * @param {object} scored One return value of scoreRun.
 * @returns {object}
 */
function projectTraceResult(scored) {
  const group = (checks) => ({
    checks: checks.length,
    passed: checks.filter((item) => item.ok).length,
    failed: checks.filter((item) => !item.ok).map(({ field, expected, actual }) => ({ field, expected, actual })),
  });
  return {
    isCleanSet: scored.isCleanSet,
    statuses: Object.fromEntries(scored.statusResults.map((item) => [item.id, item.reported])),
    statusMisses: scored.statusResults
      .filter((item) => !item.ok)
      .map(
        (item) =>
          `${item.id} reported ${item.reported ?? 'nothing'}, expected ${item.expected}${item.discriminating ? ' (discriminating)' : ''}`,
      ),
    invented: scored.invented,
    duplicates: scored.duplicates,
    gate: scored.gate,
    citations: scored.citations,
    arithmetic: group(scored.arithmetic),
    gateCriteria: group(scored.gateCriteria),
    oracleResolution: group(scored.oracleResolution),
    runMetadata: group(scored.runMetadata),
    rejectedEvidence: group(scored.rejectedEvidence),
    waivers: { scored: scored.waivers.scored, ...group(scored.waivers.checks) },
    live: group(scored.live),
    cleanFalsePositives: scored.cleanFalsePositives,
  };
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
  // The report is no longer what scoreVerdict reads, and it is still what proves
  // the verdict beside it is one a run could have produced. A stored report that
  // is not on disk would skip that check silently, so it is an unreadable corpus
  // rather than a case.
  if (!verdict.report || !fs.existsSync(reportPath)) {
    unreadable(`${item.id}: verdict.report points at ${verdict.report ?? '(nothing)'}, which does not exist`);
  }
  return { verdict, reportPath };
}

/**
 * Where a stored verdict disagrees with the report it points at.
 *
 * The CLI derives every one of these from the report rather than trusting it, so
 * re-deriving them is what keeps a stored verdict honest: a hand-edited score, a
 * recommendation that its own violation counts do not support, or a Total
 * Violations line that drifted away from the findings under it all surface here.
 *
 * `findings` is checked because scoreVerdict reads it. While the scorer re-parsed
 * the markdown, emptying a stored findings array changed no number and this check
 * saw nothing, and the array was still what test-review.contract.json asserted
 * against. Now the scorer reads it, so an edit to it moves every count in the
 * stored result, and this is the check that says the report never supported it.
 *
 * A verdict carrying no findings array at all is exempt, because that is a real
 * shape the corpus stores: a verdict written before the CLI published the field.
 * It scores null, so there is no number for a coordinated edit to launder.
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
  if (Array.isArray(verdict.findings)) {
    stored.findings = verdict.findings;
    fresh.findings = derived.findings;
  }
  return differences(stored, fresh, ['the verdict says', 'the report derives']);
}

/**
 * Read and score one stored trace case, the way runCase does after the agent
 * returns.
 *
 * Both artifacts have to be on disk, because a case missing one would record an
 * environment failure that says nothing about the scorers. A summary that is
 * there and that readSummary refuses, or a matrix that readMatrix reads no
 * criterion section out of, is a real result: runCase reports each as an
 * environment failure with a class, and the stored result names that class.
 *
 * @returns {{result: object, scored?: object}}
 */
function replayTraceCase(item, set, groundTruth) {
  for (const name of ['e2e-trace-summary.json', 'traceability-matrix.md']) {
    if (!fs.existsSync(path.join(item.directory, 'test-artifacts', name)))
      unreadable(`${item.id}: no test-artifacts/${name} beside expected.json`);
  }
  const summary = readSummary(item.directory);
  if (!summary.ok) return { result: { unmeasurable: summary.failureClass } };
  const matrix = readMatrix(item.directory, set);
  if (matrix === null) return { result: { unmeasurable: 'environment-missing-artifact' } };
  const scored = scoreRun(set, summary.summary, matrix, groundTruth.evidenceLineTolerance, groundTruth.coveragePercentTolerance);
  return { result: projectTraceResult(scored), scored };
}

/**
 * Parse and score one stored bmad-tea routing case.
 *
 * The oracle entry, the menu and the user's message are all frozen into the
 * stored case rather than read live, for the reason the selection corpus freezes its `expect` block: a
 * replay has to keep scoring the scenario it was derived against after the live
 * corpus moves on, and `npm run test:eval-routing-data` already holds the live
 * corpus against the shipped menu. The menu is frozen because it decides the
 * spellings a clarifying question may name a candidate by, so an edit to a menu
 * label would otherwise move a stored number for a reason that has nothing to do
 * with the scorer.
 */
function replayRoutingCase(item, expected) {
  const stdoutPath = path.join(item.directory, 'stdout.txt');
  if (!fs.existsSync(stdoutPath)) unreadable(`${item.id}: no stdout.txt beside expected.json`);
  const oracle = expected.inputs?.expected;
  if (!oracle) unreadable(`${item.id}: expected.json has no inputs.expected to score against`);
  const menu = expected.inputs?.menu;
  if (!Array.isArray(menu)) unreadable(`${item.id}: expected.json has no inputs.menu, so candidate spellings cannot be resolved`);
  const intent = expected.inputs?.intent;
  if (typeof intent !== 'string') unreadable(`${item.id}: expected.json has no inputs.intent, so the scope bound cannot be applied`);
  const answer = parseRouting(fs.readFileSync(stdoutPath, 'utf8'));
  return { answer, score: scoreRoutingCase(oracle, answer, menu, intent) };
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

/**
 * The result-record checks that need no stored case.
 *
 * redactArgs decides what of a passthrough argv reaches a result file, and a
 * result file is an artifact CI uploads, so anything it lets through is a
 * published credential. It let four shapes through. The token pattern was applied
 * to bare arguments and to a flag NAME and never to the value half of
 * `--flag=value`, and it was start-anchored on top of that, so a token anywhere
 * past the first character of a value was invisible as well.
 *
 * The last assertion is the other half of all four: a flag whose name and value
 * are both innocuous has to survive. Redaction that erases the runner
 * configuration destroys the reason the record carries argv at all, and `sk-`
 * searched with no boundary in front of it sits inside "risk-based" and
 * "task-runner".
 */
function checkRecordHygiene() {
  const leaks = [
    [
      ['--api-key', 'sk-secret123', '--model=gpt', '--extra=sk-live-abc', 'sk-bare-xyz', '--auth', 'tok'],
      ['--api-key', '[redacted]', '--model=gpt', '--extra=[redacted]', '[redacted]', '--auth', '[redacted]'],
      'a token-shaped value in --flag=value form',
    ],
    [['--header=ghp_exampleSecret'], ['--header=[redacted]'], 'a token under a flag whose name says nothing about credentials'],
    [
      ['--header', 'Authorization: Bearer ghp_exampleSecret'],
      ['--header', '[redacted]'],
      'a token in the middle of a separate value argument',
    ],
    [['--extra=https://example.test?token=ghp_exampleSecret'], ['--extra=[redacted]'], 'a token in a query string inside a value'],
  ];
  for (const [argv, wanted, what] of leaks) {
    const redacted = redactArgs(argv);
    assert(same(redacted, wanted), `redactArgs drops ${what}`, `got ${JSON.stringify(redacted)}`);
  }

  const innocuous = ['--model=risk-based-v2', '--profile=task-runner', '--tag=disk-cache', '--agent-arg=--dangerously-skip-permissions'];
  const kept = redactArgs(innocuous);
  assert(same(kept, innocuous), 'redactArgs keeps a value that merely contains a token prefix inside a word', JSON.stringify(kept));
}

/**
 * signatureOf held to its own contract over every scored trace case.
 *
 * main() in eval-trace.js calls a case stable when every repetition signs the
 * same, so the signature has to cover everything scored and nothing
 * environmental. Both halves are checkable here without a model. Two cases scored
 * against the same fixture set have identical stored results exactly when they
 * sign identically: a pair that differs in a scored field and still signs the
 * same is a field the signature dropped, which is the defect that let citation
 * resolution flip between repetitions while the run reported itself stable, and a
 * pair with identical results that signs differently is the signature reading
 * something the scorer does not, which is the stale-versus-unverifiable pair
 * scoreLiveEvidence collapses on purpose. The mutation count is the one input the
 * signature takes from outside the scored object, and it has to move it.
 *
 * @param {Array<{id: string, set: string, result: object, scored: object}>} replayed
 */
/**
 * Hold the test-design signature to its contract on the stored corpus.
 *
 * `maxUnstableCases` cannot be breached by a stored case, because instability is a
 * property of a pair of repetitions and a stored case is one document. What can be
 * pinned is the function the gate is built on, and the useful question is not
 * whether it signs correctly. It is which two genuinely different documents sign
 * the same.
 *
 * Two answers are required and they pull against each other. Every distinction the
 * scorer makes has to move the signature, or a case that wobbled between two
 * different scored answers would be called stable. And a change to something the
 * suite does not score has to leave it alone, or every repetition of a design task
 * would be called unstable, since an agent rewords a mitigation, an owner and a
 * requirement on every run.
 *
 * The second half is why the collisions this check tolerates are deliberate. A
 * mitigation, an owner, a requirement's wording and a test count all sign
 * identically, because none of them is scored. A coverage level does not, because
 * it is.
 *
 * @param {Array<{id: string, scored: object}>} replayed
 */
function checkTestDesignSignatures(replayed) {
  if (replayed.length === 0) return;
  const mutationBlind = replayed
    .filter((item) => testDesignSignatureOf(item.scored, 0) === testDesignSignatureOf(item.scored, 1))
    .map((item) => item.id);
  assert(
    mutationBlind.length === 0,
    'test-design signatures move when a fixture mutation is counted',
    `unchanged for ${mutationBlind.join(', ')}`,
  );

  const disagreements = [];
  for (const [index, left] of replayed.entries()) {
    for (const right of replayed.slice(index + 1)) {
      const sameSignature = testDesignSignatureOf(left.scored, 0) === testDesignSignatureOf(right.scored, 0);
      const sameResult = JSON.stringify(left.result) === JSON.stringify(right.result);
      if (sameSignature !== sameResult) {
        disagreements.push(
          `${left.id} and ${right.id} ${sameSignature ? 'sign alike and score differently' : 'score alike and sign differently'}`,
        );
      }
    }
  }
  assert(
    disagreements.length === 0,
    'two stored test designs sign identically exactly when their scored results agree',
    disagreements.join('; '),
  );
}

function checkTraceSignatures(replayed) {
  if (replayed.length === 0) return;
  const mutationBlind = replayed.filter((item) => signatureOf(item.scored, 0) === signatureOf(item.scored, 1)).map((item) => item.id);
  assert(
    mutationBlind.length === 0,
    'trace signatures move when a fixture mutation is counted',
    `unchanged for ${mutationBlind.join(', ')}`,
  );

  const disagreements = [];
  for (const [index, left] of replayed.entries()) {
    for (const right of replayed.slice(index + 1)) {
      if (left.set !== right.set) continue;
      const sameResult = same(left.result, right.result);
      const sameSignature = signatureOf(left.scored, 0) === signatureOf(right.scored, 0);
      if (sameResult === sameSignature) continue;
      disagreements.push(
        sameResult
          ? `${left.id} and ${right.id} score identically and sign differently, so the signature reads something the scorer does not`
          : `${left.id} and ${right.id} score differently and sign identically, so a scored field is outside the signature`,
      );
    }
  }
  assert(disagreements.length === 0, 'trace signatures agree exactly when the scored results agree', disagreements.join('\n  '));
}

/**
 * What `maxUnstableCases` is actually computed from, held to its contract.
 *
 * Stability is the one threshold no single stored reply can fail, because it is a
 * property of a pair of repetitions and a replay case is one reply. What can be
 * pinned here is the function the live run measures it with: two replies to the
 * same intent sign identically exactly when they decided the same thing. Without
 * this the signature could quietly stop reading a field and every stability
 * number would go on looking fine.
 *
 * The clarify pair is the one that matters. A clarify answer carries a null menu
 * code and a null workflow, so a signature built from those alone would sign
 * every clarification the same however different the question it asked.
 */
function checkRoutingSignatures(replayed) {
  if (replayed.length === 0) return;
  const disagreements = [];
  for (const [index, left] of replayed.entries()) {
    for (const right of replayed.slice(index + 1)) {
      if (left.source !== right.source) continue;
      const decidedTheSame =
        left.score !== null &&
        right.score !== null &&
        left.score.action === right.score.action &&
        left.score.menuCode === right.score.menuCode &&
        left.score.workflow === right.score.workflow &&
        JSON.stringify([...left.score.candidateCodesNamed].sort()) === JSON.stringify([...right.score.candidateCodesNamed].sort());
      const sameSignature = routingSignatureOf(left.score) === routingSignatureOf(right.score);
      if (decidedTheSame === sameSignature) continue;
      disagreements.push(
        decidedTheSame
          ? `${left.id} and ${right.id} decided the same thing and sign differently`
          : `${left.id} and ${right.id} decided different things and sign identically, so a decision the run makes is outside the signature`,
      );
    }
  }
  assert(
    disagreements.length === 0,
    'routing signatures agree exactly when two replies to one intent decided the same thing',
    disagreements.join('\n  '),
  );
}

/**
 * The scoring inputs of one test-design fixture set, as a string a digest is taken
 * over.
 *
 * Everything here changes an expected result if it moves: the admitted categories
 * and levels the scorer validates against, and per declared risk its matcher, the
 * categories it admits, its severity rank and its admitted coverage. A case stores
 * this digest, so an edit to the seeded set fails no clean case and the reverse.
 *
 * @param {object} groundTruth
 * @param {object} set
 * @returns {string}
 */
function testDesignScoringInputs(groundTruth, set) {
  const matcher = (risk) => risk.anyOf.map((group) => group.join('|')).join(' & ');
  return [
    `categories=${(groundTruth.riskCategories ?? []).join(',')}`,
    `levels=${(groundTruth.testLevels ?? []).join(',')}`,
    `set=${set.id}`,
    `maxRisks=${set.maxRisks ?? 'none'}`,
    ...(set.materialRisks ?? []).map(
      (risk) =>
        `material:${risk.id} categories=${risk.categories.join(',')} rank=${risk.severityRank} ` +
        `coverage=${risk.acceptableCoverage.join(',')} match=${matcher(risk)}`,
    ),
    ...(set.unsupportedRisks ?? []).map((risk) => `unsupported:${risk.id} match=${matcher(risk)}`),
  ].join('\n');
}

/**
 * One stored test-design document, scored the way the harness scores it.
 *
 * The result is the scored object reduced to what a reader can check by hand: the
 * document-global mentions the contract's oracles are paired with, the per-group
 * shape counts, and the identity of every check that did not pass. A document
 * readDesign refuses records `{ "unmeasurable": <failure class> }`, the class runCase
 * reports for that environment failure.
 *
 * @param {{directory: string}} item
 * @param {object} expected The case's expected.json.
 * @param {object} set The fixture set it is scored against.
 * @param {Set<string>} categories
 * @returns {object}
 */
function replayTestDesignCase(item, expected, set, categories) {
  const designPath = path.join(item.directory, expected.storedOutput?.design ?? 'design.md');
  if (!fs.existsSync(designPath)) unreadable(`${item.id}: no stored document at ${path.relative(PROJECT_ROOT, designPath)}`);
  const read = readTestDesign({ kind: 'text', value: fs.readFileSync(designPath, 'utf8') });
  if (!read.ok) return { unmeasurable: read.failureClass };

  const scored = scoreTestDesignRun(set, read.design, categories);
  const resolvable = scored.orderingChecks.filter((check) => check.resolvable);
  return {
    mentions: scored.mentions,
    shape: scored.shape,
    shapeFailures: scored.shapeFailures,
    links: { total: scored.links.total, resolved: scored.links.resolved, dangling: scored.links.dangling },
    grounding: {
      declared: scored.grounding.declared,
      matched: scored.grounding.matched,
      missed: scored.grounding.missed,
      topSeverityMissed: scored.grounding.topSeverityMissed,
    },
    ungrounded: scored.ungrounded,
    ceiling: scored.ceiling,
    unscoredRiskTables: scored.unscoredRiskTables,
    coverage: {
      evaluated: scored.coverageChecks.length,
      satisfied: scored.coverageChecks.filter((check) => check.ok).length,
      failures: scored.coverageChecks
        .filter((check) => !check.ok)
        .map((check) => ({ riskId: check.riskId, reason: check.reason, levels: check.levels })),
    },
    ordering: {
      pairs: scored.orderingChecks.length,
      resolvable: resolvable.length,
      satisfied: resolvable.filter((check) => check.ok).length,
      flattened: scored.flattenedPriorities,
      failures: resolvable
        .filter((check) => !check.ok)
        .map((check) => ({
          higher: check.higher,
          lower: check.lower,
          higherPriority: check.higherPriority,
          lowerPriority: check.lowerPriority,
        })),
    },
  };
}

/**
 * Score one stored case the way its suite scores it.
 *
 * A failure here is a reason the case cannot be compared at all, as opposed to a
 * result that moved: its ground truth digests differently from when it was
 * derived, or its stored verdict is not what its own report produces. Both are
 * reported against the case and neither is something --accept may rewrite.
 *
 * @param {{id: string, suite: string, directory: string}} item
 * @param {object} expected The case's expected.json.
 * @param {object} context The loaded ground truths, their digests, and the list a
 *   scored trace case is appended to for checkTraceSignatures.
 * @returns {{observed: object|null}|{failure: string}}
 */
function replayCase(item, expected, context) {
  switch (item.suite) {
    case 'test-review': {
      const recordedDigest = expected.inputs?.scoringInputsDigest;
      if (recordedDigest !== context.groundTruthDigest) {
        return {
          failure:
            `the ground truth moved. This result was derived against ${recordedDigest ?? '(nothing recorded)'} and ` +
            `${path.relative(PROJECT_ROOT, GROUND_TRUTH)} now digests to ${context.groundTruthDigest}. A plant, a line, an admitted set ` +
            'or the file list changed, so the expected numbers have to be re-derived by hand and the digest updated with them. ' +
            '--accept will not do this one.',
        };
      }
      const { verdict, reportPath } = loadReviewVerdict(item);
      const drift = verdictDriftFromReport(verdict, reportPath);
      if (drift.length > 0) {
        return {
          failure: [
            `the stored verdict is not what its report produces (${path.relative(PROJECT_ROOT, reportPath)}):`,
            ...drift.map((line) => `  ${line}`),
            'A verdict no run could have produced makes every number scored from it meaningless, so fix the pair before',
            'touching the expected result. --accept will not do this one either.',
          ].join('\n  '),
        };
      }
      return { observed: projectReviewResult(scoreVerdict(verdict, context.groundTruth)) };
    }
    case 'bmad-tea-routing': {
      const replayed = replayRoutingCase(item, expected);
      context.routingReplayed.push({
        id: item.id,
        source: String(expected.inputs?.sourceCase ?? ''),
        score: replayed.score,
      });
      return { observed: replayed };
    }
    case 'fragment-selection': {
      return { observed: replaySelectionCase(item, expected) };
    }
    case 'trace': {
      const setId = expected.inputs?.fixtureSet;
      const set = context.traceSets.get(setId);
      if (!set) {
        unreadable(
          `${item.id}: inputs.fixtureSet names "${setId ?? '(nothing)'}", which is not a set in ${path.relative(PROJECT_ROOT, TRACE_GROUND_TRUTH)}`,
        );
      }
      const recordedDigest = expected.inputs?.scoringInputsDigest;
      const setDigest = digest(traceScoringInputs(context.traceGroundTruth, set));
      if (recordedDigest !== setDigest) {
        return {
          failure:
            `the ground truth moved. This result was derived against ${recordedDigest ?? '(nothing recorded)'} and fixture set ${setId} in ` +
            `${path.relative(PROJECT_ROOT, TRACE_GROUND_TRUTH)} now digests to ${setDigest}. A criterion, an evidence span, a gate criterion, ` +
            'a waiver or live expectation, or a tolerance changed, so the expected result has to be re-derived by hand and the digest ' +
            'updated with it. --accept will not do this one.',
        };
      }
      const replayed = replayTraceCase(item, set, context.traceGroundTruth);
      if (replayed.scored) context.traceReplayed.push({ id: item.id, set: setId, result: replayed.result, scored: replayed.scored });
      return { observed: replayed.result };
    }
    case 'test-design': {
      const setId = expected.inputs?.fixtureSet;
      const set = context.testDesignSets.get(setId);
      if (!set) {
        unreadable(
          `${item.id}: inputs.fixtureSet names "${setId ?? '(nothing)'}", which is not a set in ${path.relative(PROJECT_ROOT, TEST_DESIGN_GROUND_TRUTH)}`,
        );
      }
      const recordedDigest = expected.inputs?.scoringInputsDigest;
      const setDigest = digest(testDesignScoringInputs(context.testDesignGroundTruth, set));
      if (recordedDigest !== setDigest) {
        return {
          failure:
            `the ground truth moved. This result was derived against ${recordedDigest ?? '(nothing recorded)'} and fixture set ${setId} in ` +
            `${path.relative(PROJECT_ROOT, TEST_DESIGN_GROUND_TRUTH)} now digests to ${setDigest}. A matcher, an admitted category, a severity ` +
            'rank, an admitted coverage level or the clean ceiling changed, so the expected result has to be re-derived by hand and the digest ' +
            'updated with it. --accept will not do this one.',
        };
      }
      const observed = replayTestDesignCase(item, expected, set, context.testDesignCategories);
      if (!observed.unmeasurable) {
        const read = readTestDesign({
          kind: 'text',
          value: fs.readFileSync(path.join(item.directory, expected.storedOutput?.design ?? 'design.md'), 'utf8'),
        });
        context.testDesignReplayed.push({
          id: item.id,
          result: observed,
          scored: scoreTestDesignRun(set, read.design, context.testDesignCategories),
        });
      }
      return { observed };
    }
    default: {
      return { failure: `unknown suite directory "${item.suite}"; expected bmad-tea-routing, test-review, fragment-selection or trace` };
      return { failure: `unknown suite directory "${item.suite}"; expected test-review, fragment-selection, test-design or trace` };
    }
  }
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
  const traceGroundTruth = readJson(TRACE_GROUND_TRUTH, 'trace ground truth');
  const traceSets = new Map((traceGroundTruth.fixtureSets ?? []).map((set) => [set.id, set]));
  const traceReplayed = [];
  const routingReplayed = [];
  const testDesignGroundTruth = readJson(TEST_DESIGN_GROUND_TRUTH, 'test-design ground truth');
  const testDesignSets = new Map((testDesignGroundTruth.fixtureSets ?? []).map((set) => [set.id, set]));
  const testDesignCategories = new Set(testDesignGroundTruth.riskCategories ?? []);
  const testDesignReplayed = [];
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

    const replayed = replayCase(item, expected, {
      groundTruth,
      groundTruthDigest,
      traceGroundTruth,
      traceSets,
      traceReplayed,
      routingReplayed,
      testDesignGroundTruth,
      testDesignSets,
      testDesignCategories,
      testDesignReplayed,
    });
    if ('failure' in replayed) {
      assert(false, item.id, replayed.failure);
      continue;
    }
    const { observed } = replayed;

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

  checkTestDesignSignatures(testDesignReplayed);
  checkTraceSignatures(traceReplayed);
  checkRoutingSignatures(routingReplayed);
  checkRecordHygiene();

  console.log(`\n${colors.cyan}========================================${colors.reset}`);
  if (accepted.length > 0) {
    console.log(
      `${colors.yellow}re-recorded ${accepted.length} case(s) at scorer v${SCORER_VERSION}.${colors.reset} ` +
        'Their "derivation" text is now stale; rewrite it before committing.',
    );
  }
  console.log(`${colors.green}${passed} passed${colors.reset}, ${failed > 0 ? colors.red : ''}${failed} moved${colors.reset}`);
  return failed > 0 ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  SCORER_VERSION,
  scoringInputs,
  traceScoringInputs,
  projectReviewResult,
  projectSelectionResult,
  projectTraceResult,
  differences,
  verdictDriftFromReport,
  findCases,
};
