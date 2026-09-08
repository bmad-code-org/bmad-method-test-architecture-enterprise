/**
 * trace eval harness.
 *
 * `bmad-testarch-trace` reads a set of acceptance criteria, reads the tests that
 * claim to cover them, and derives a gate decision. This measures whether it does
 * that against a corpus whose true answers were written from the fixture design,
 * never from a run.
 *
 * WHY THIS ONE LOOKS LIKE eval-fragment-selection.js AND NOT LIKE eval-test-review.js
 *
 * `test-review` has a CLI. It assembles the prompt, parses a strict-schema report,
 * and writes a verdict, so its harness spawns the CLI and reads the verdict. `trace`
 * has no CLI. So this harness does what the fragment-selection one does: it stages
 * the input, assembles the prompt itself, spawns the runner through
 * `cli/lib/run-agent.js`, and parses the artifacts the workflow leaves behind.
 *
 * WHAT IS MEASURED
 *
 *   criterion status       per-criterion coverage against ground truth's trueCoverage,
 *                          which is the semantic judgment the corpus exists to measure
 *   discriminating status  the two criteria the ground truth flags isDiscriminatingCase,
 *                          scored on their own because a pooled accuracy hides them
 *   gate                   one bit per fixture set, carrying the same weight in the
 *                          summary as one per-criterion status
 *   coverage arithmetic    every count and percentage, recomputed from trueCoverage
 *   evidence citations     each cited file and line resolving to a recorded span
 *   rejected evidence      the AC-2 test named as considered and turned down
 *   waiver oracle          filed 2, valid 1, invalid 1, scored only where the gate matched
 *   live evidence          two records, no coverage, at the declared severities
 *   clean false positives  anything reported against the set that has no defects
 *   stability              the same scored answer on identical input
 *   fixture mutations      the run must not write tests into the corpus it was given
 *
 * THE GATE IS ONE BIT AND IT IS NOT THE HEADLINE
 *
 * Scoring the seeded AC-2 as covered moves P0 coverage from 50% to 100% and overall
 * from 70% to 80%, which is Rule 4 and a PASS. That single wrong judgment flips the
 * gate, and no other criterion in the set can flip it back. So the gate carries the
 * same weight as one criterion status here. A harness that leads with the gate would
 * leave six of the seeded set's ten judgments unmeasured.
 *
 * THE GROUND TRUTH IS NEVER IN THE AGENT'S CONTEXT
 *
 * Each case runs in a staged workspace holding one fixture set, a resolved TEA
 * config, and a copy of the skill. `ground-truth.json` is not copied, and the
 * pre-flight asserts it: no staged file carries its bytes, no staged path is named
 * for it, and the assembled prompt contains none of the tokens that appear only in
 * it. That is the whole validity of the measurement, so it is an assertion rather
 * than a convention.
 *
 * ONE FIXTURE SET PER RUN
 *
 * The corpus author warns that combining `seeded/` and `clean/` changes every
 * percentage. Each set is its own workspace, its own agent call, and its own case.
 *
 * WHERE test_artifacts POINTS
 *
 * The seeded workspace resolves it to that set's own `test-artifacts/`, which is how
 * the recorded live verification and the waiver register are read at all. The clean
 * set has no such directory in the corpus, so its workspace gets an empty one. A
 * clean run that inherited the seeded artifacts would gain a waiver register and a
 * live file it must not have, and its `mustNotReport` would fire against a correct
 * run.
 *
 * WHAT IS PARSED
 *
 * `test-artifacts/e2e-trace-summary.json` at schema_version 0.3.x is the contract and
 * carries every deterministic oracle. It carries no per-criterion matrix, so the
 * per-criterion statuses are read from `test-artifacts/traceability-matrix.md`, the
 * deliverable the summary itself links. An absent or unparseable artifact is an
 * environment failure and exits 2, never a low score.
 *
 * TWO MODES
 *
 *   --validate-only  Static. No vendor, no cost, no network. Asserts the corpus is
 *                    internally consistent, that every span in the ground truth
 *                    resolves in the fixture it names, and that staging keeps the
 *                    ground truth out of the agent's workspace and prompt.
 *   default          Spends a vendor run per fixture set per repetition. It needs a
 *                    logged-in claude or codex.
 *
 * EVERY DECLARED REPETITION MUST COMPLETE
 *
 * Stability is a claim about repeated runs. A case that lost a run has fewer
 * observations than the gate declared, so it is unmeasurable and exits 2.
 *
 * Usage:
 *   node test/eval-trace.js --validate-only
 *   node test/eval-trace.js --agent claude --runs 2
 *   node test/eval-trace.js --agent codex --set seeded-tenant-data-export
 *   node test/eval-trace.js --agent custom --agent-cmd my-runner --agent-arg --headless
 *   node test/eval-trace.js --agent claude --json results/trace.json
 *
 * Exit codes:
 *   0  the corpus is valid (--validate-only), or every vendor met the thresholds
 *   1  a threshold was missed, or the corpus is inconsistent (a real result)
 *   2  the environment could not run the eval (nothing was measured): a missing
 *      credential, a timeout, a transport error, a missing or unparseable artifact,
 *      or fewer completed runs than were declared
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { runAgent } = require('../cli/lib/run-agent');
const { AGENT_ADAPTERS, resolveModel } = require('../cli/lib/agent-adapters');
const { missingCredential } = require('./eval-test-review');
const { loadSuiteManifest, suiteById } = require('./lib/suite-manifest');
const {
  digest,
  digestFiles,
  digestPrompts,
  repositoryState,
  probeVersion,
  redactArgs,
  measured,
  classifyAgentError,
  suiteResultRecord,
  writeSuiteResult,
} = require('./lib/eval-record');
const { worstFailureClass, exitCodeForFailureClass } = require('./schema/eval-result');

const PROJECT_ROOT = path.join(__dirname, '..');
const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'trace-eval');
const GROUND_TRUTH = path.join(FIXTURE_ROOT, 'ground-truth.json');
const SKILL_ROOT = path.join(PROJECT_ROOT, 'src', 'workflows', 'testarch', 'bmad-testarch-trace');
const SUITE_ID = 'trace';

// A complete trace run reads five step files, the whole fixture set, and writes two
// artifacts, so it is a much longer call than a fragment selection. Twenty minutes
// bounds a hang without cutting off a slow but working run.
const RUN_TIMEOUT_MINUTES = 20;
const RUN_TIMEOUT_MS = RUN_TIMEOUT_MINUTES * 60_000;

// The summary contract this harness scores. The waivers block arrived in 0.3.0, so a
// 0.2.x file would be missing an oracle rather than merely older.
const SUMMARY_SCHEMA_MAJOR_MINOR = '0.3';

// The five statuses checklist.md's Coverage Classification section defines.
const COVERAGE_STATUSES = new Set(['FULL', 'PARTIAL', 'NONE', 'UNIT-ONLY', 'INTEGRATION-ONLY']);
// The four that count as coverage of some kind, which is what by_level counts.
const COVERAGE_ELIGIBLE = new Set(['FULL', 'PARTIAL', 'UNIT-ONLY', 'INTEGRATION-ONLY']);
const PRIORITIES = ['P0', 'P1', 'P2', 'P3'];
const LEVELS = ['e2e', 'api', 'component', 'unit', 'live', 'other'];

// Keys that appear only in ground-truth.json. Finding one in a staged file or in the
// prompt means the answers reached the agent, which invalidates the measurement.
const GROUND_TRUTH_ONLY_TOKENS = ['trueCoverage', 'isDiscriminatingCase', 'commonFalsePositives', 'mustNotReport', 'expectedGate'];

/**
 * The waiver check ids an invalid waiver must be reported as failing, keyed by waiver
 * id.
 *
 * The corpus records each violation as prose against a citation key rather than
 * against the check id step-05's WAIVER_CHECK_IDS list uses, so the mapping lives
 * here. validateCorpus asserts that every waiver the corpus expects to be invalid has
 * a row here and that the two counts agree, which is what stops a violation added to
 * the corpus from going unchecked.
 *
 * W-2 fails six of the seven checks. `fail_only` is the one it passes, because it
 * names a FAIL decision and the run under measurement derives FAIL.
 */
const EXPECTED_FAILED_WAIVER_CHECKS = {
  'W-2': ['business_justification', 'approver_authority', 'expiry_present', 'remediation_due_date', 'not_security', 'contract_complete'],
};

/**
 * Thresholds. Same reasoning the two sibling harnesses state: a bar nobody clears
 * teaches nothing and a bar everyone clears teaches nothing. The difference here is
 * that most of these oracles are deterministic functions of the per-criterion
 * statuses, so their bar is 1 and the judgment is what the loose bars measure.
 */
const THRESHOLDS = {
  // 15 criteria across the two sets. 0.9 admits one wrong judgment in the corpus and
  // no more, which is the width of a single defensible disagreement.
  criterionStatusAccuracy: 0.9,
  // The two criteria ground truth flags isDiscriminatingCase: the seeded AC-2 whose
  // test is named for it and tests something else, and the clean AC-4 whose tests
  // never name it. Both are the reason the corpus exists, and both clear 0.9 above
  // on their own, so they need a bar of their own.
  discriminatingCriterionAccuracy: 1,
  // One bit per fixture set, and a pure function of three numbers once the statuses
  // are right. Anything below 1 means the run derived a decision its own coverage
  // numbers do not support.
  gateAccuracy: 1,
  // The thresholds the run applied and the MET/NOT_MET statuses it derived from them.
  // A run reporting a different required minimum has changed the gate it claims to be.
  gateCriteriaAccuracy: 1,
  // Integer arithmetic over statuses the run itself reported, at the corpus's declared
  // tolerance of 0. A mismatch is a calculation defect with no defensible reading.
  coverageArithmeticAccuracy: 1,
  // collection_mode, collection_status, inventory_basis, and the oracle block. Both
  // epics state numbered criteria with priorities, so the formal-requirements branch
  // resolves first and nothing here is a judgment call.
  oracleResolutionAccuracy: 1,
  // The corpus records a full line span for every test, so a citation anywhere inside
  // one already resolves. 0.9 admits a single citation of a helper or a describe block
  // across the roughly sixteen the two sets invite, and no more.
  evidenceCitationPrecision: 0.9,
  // Exactly one entry naming the AC-2 test on the seeded set, none on the clean set.
  // Deterministic, and the most direct signal that the discriminator was read.
  rejectedEvidenceAccuracy: 1,
  // filed 2, valid 1, invalid 1, and the check ids W-2 fails. Deterministic field
  // reads, so 1. Scored only on runs whose gate decision matched; see scoreWaivers.
  waiverOracleAccuracy: 1,
  // Neither live record counts, both appear as blockers at the declared severity, and
  // the clean set has no live file at all.
  liveEvidenceAccuracy: 1,
  // The clean set has adequate evidence for every criterion, so any gap, blocker,
  // waiver, or live-evidence claim against it is invented.
  maxCleanFalsePositives: 0,
  // Identical input must produce the identical scored answer. A gate whose verdict
  // moves on re-run is not a gate.
  maxUnstableCases: 0,
  // The workflow's own template states it does not generate tests. A run that writes
  // one into the corpus has changed the benchmark, which the corpus names as a
  // negative control.
  maxFixtureMutations: 0,
};

const colors = {
  reset: '[0m',
  red: '[31m',
  green: '[32m',
  yellow: '[33m',
  cyan: '[36m',
  dim: '[2m',
};

function fatal(code, message) {
  console.error(`${colors.red}eval: ${message}${colors.reset}`);
  process.exit(code);
}

function parseArgs(argv) {
  const agents = [];
  const sets = [];
  const agentArgs = [];
  const envPass = [];
  let runs = 2;
  let validateOnly = false;
  let agentCmd;
  let model;
  let jsonPath;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--agent': {
        const value = argv[index + 1];
        if (!value) fatal(2, '--agent requires a vendor name');
        agents.push(value);
        index += 1;
        break;
      }
      case '--set': {
        const value = argv[index + 1];
        if (!value) fatal(2, '--set requires a fixture set id');
        sets.push(value);
        index += 1;
        break;
      }
      case '--runs': {
        runs = Number.parseInt(argv[index + 1] ?? '', 10);
        if (!Number.isInteger(runs) || runs < 1) fatal(2, '--runs requires a positive integer');
        index += 1;
        break;
      }
      case '--agent-cmd': {
        agentCmd = argv[index + 1];
        if (!agentCmd) fatal(2, '--agent-cmd requires an executable path or name');
        index += 1;
        break;
      }
      case '--agent-arg': {
        const value = argv[index + 1];
        if (value === undefined) fatal(2, '--agent-arg requires a value');
        agentArgs.push(value);
        index += 1;
        break;
      }
      case '--env-pass': {
        const value = argv[index + 1];
        if (!value) fatal(2, '--env-pass requires an environment variable name');
        envPass.push(value);
        index += 1;
        break;
      }
      case '--model': {
        model = argv[index + 1];
        if (!model) fatal(2, '--model requires a model name');
        index += 1;
        break;
      }
      case '--json': {
        jsonPath = argv[index + 1];
        if (!jsonPath) fatal(2, '--json requires a file path');
        index += 1;
        break;
      }
      case '--validate-only': {
        validateOnly = true;
        break;
      }
      default: {
        fatal(2, `unknown argument: ${arg}`);
      }
    }
  }
  if (agents.length === 0) agents.push('claude');
  if (agents.includes('custom') && !agentCmd) fatal(2, '--agent custom requires --agent-cmd');
  if (agents.includes('custom') && model) {
    fatal(2, '--model is not supported by --agent custom; pass the runner model through --agent-arg');
  }
  if (agents.length > 1 && (agentCmd || agentArgs.length > 0 || envPass.length > 0 || model)) {
    fatal(2, 'runner overrides require exactly one --agent; run separate commands for different runner configurations');
  }
  // Stability across one run is not a measurement. Say so rather than printing stable.
  if (runs < 2 && !validateOnly) {
    console.error(`${colors.yellow}note${colors.reset}: --runs ${runs} cannot measure stability; use --runs 2 or more.`);
  }
  return { agents, sets, runs, validateOnly, agentCmd, agentArgs, envPass, model, jsonPath };
}

/* -------------------------------------------------------------------------- */
/* Ground truth                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Parse ground-truth.json.
 *
 * @returns {object|null} Null when the file is missing or unparseable, so the caller
 *   can report that as an environment failure rather than crash inside a reporter.
 */
function loadGroundTruth() {
  if (!fs.existsSync(GROUND_TRUTH)) return null;
  try {
    return JSON.parse(fs.readFileSync(GROUND_TRUTH, 'utf8'));
  } catch {
    return null;
  }
}

/** The fixture sets to run, filtered by --set when it was given. */
function selectSets(groundTruth, requested) {
  const all = groundTruth.fixtureSets ?? [];
  if (requested.length === 0) return all;
  return all.filter((set) => requested.includes(set.id));
}

/** Math.round(covered / total * 100), with an empty priority resolving to 100. */
const safePct = (covered, total) => (total > 0 ? Math.round((covered / total) * 100) : 100);

/**
 * The gate decision Rules 1 to 5 of step-05 produce for three percentages.
 *
 * Rule 6 is deliberately absent: WAIVED is never derived, so a harness that could
 * produce it would be scoring a decision the workflow cannot reach.
 *
 * @param {number} p0Pct
 * @param {number} overallPct
 * @param {number} p1Pct
 * @returns {{decision: string, producedBy: string}}
 */
function deriveGate(p0Pct, overallPct, p1Pct) {
  if (p0Pct < 100) return { decision: 'FAIL', producedBy: 'gateRule1P0' };
  if (overallPct < 80) return { decision: 'FAIL', producedBy: 'gateRule2Overall' };
  if (p1Pct < 80) return { decision: 'FAIL', producedBy: 'gateRule3P1Floor' };
  if (p1Pct >= 90) return { decision: 'PASS', producedBy: 'gateRule4Pass' };
  return { decision: 'CONCERNS', producedBy: 'gateRule5Concerns' };
}

/**
 * Every expected number for one fixture set, recomputed from criteria[].trueCoverage.
 *
 * Nothing here reads the numbers typed into coverageArithmetic. Those are compared
 * against this in --validate-only, so a typo in the corpus is caught rather than
 * scored against a run.
 *
 * @param {object} set One entry of groundTruth.fixtureSets.
 * @returns {object}
 */
function recomputeExpectations(set) {
  const criteria = set.criteria ?? [];
  const fullCriteria = criteria.filter((item) => item.trueCoverage === 'FULL');
  const overall = { covered: fullCriteria.length, total: criteria.length, pct: safePct(fullCriteria.length, criteria.length) };

  const priority = {};
  for (const name of PRIORITIES) {
    const members = criteria.filter((item) => item.priority === name);
    const covered = members.filter((item) => item.trueCoverage === 'FULL').length;
    priority[name] = { total: members.length, covered, pct: safePct(covered, members.length) };
  }

  const uncovered = criteria.filter((item) => item.trueCoverage === 'NONE');
  // CRITICAL is every P0 criterion below FULL and the other three buckets are scoped
  // to criteria with no coverage at all. That asymmetry is step-04 section 1's, and it
  // exists because Gate Rule 1 counts only FULL, so a P0 at PARTIAL fails the gate and
  // has to be named in the bucket the gate rationale points at.
  const gapBuckets = {
    criticalGaps: criteria.filter((item) => item.priority === 'P0' && item.trueCoverage !== 'FULL').map((item) => item.id),
    highGaps: uncovered.filter((item) => item.priority === 'P1').map((item) => item.id),
    mediumGaps: uncovered.filter((item) => item.priority === 'P2').map((item) => item.id),
    lowGaps: uncovered.filter((item) => item.priority === 'P3').map((item) => item.id),
    partialCoverageItems: criteria.filter((item) => item.trueCoverage === 'PARTIAL').map((item) => item.id),
    unitOnlyItems: criteria.filter((item) => item.trueCoverage === 'UNIT-ONLY').map((item) => item.id),
  };

  const riskSummary = {
    critical_open: gapBuckets.criticalGaps.length,
    high_open: gapBuckets.highGaps.length,
    medium_open: gapBuckets.mediumGaps.length,
    low_open: gapBuckets.lowGaps.length,
  };

  // One increment per level that carries evidence for a coverage-eligible criterion,
  // counted once per criterion per level, which is what by_level.criteria_covered means.
  const byLevel = Object.fromEntries(LEVELS.map((level) => [level, 0]));
  for (const item of criteria) {
    if (!COVERAGE_ELIGIBLE.has(item.trueCoverage)) continue;
    const levels = new Set((item.evidence ?? []).map((entry) => (LEVELS.includes(entry.level) ? entry.level : 'other')));
    for (const level of levels) byLevel[level] += 1;
  }

  return {
    overall,
    priority,
    gapBuckets,
    riskSummary,
    byLevel,
    gate: deriveGate(priority.P0.pct, overall.pct, priority.P1.pct),
  };
}

/**
 * The one rejected-evidence entry the seeded set owes, derived from falseEvidence.
 *
 * A live record is not rejected evidence. It is a live disposition and lands in
 * blockers, so only the file-and-line entries are counted here.
 *
 * @param {object} set
 * @returns {Array<{requirementId: string, file: string, line: number, lineEnd: number}>}
 */
function expectedRejectedEvidence(set) {
  const expected = [];
  for (const item of set.criteria ?? []) {
    for (const entry of item.falseEvidence ?? []) {
      if (entry.level === 'live') continue;
      expected.push({ requirementId: item.id, file: entry.file, line: entry.line, lineEnd: entry.lineEnd });
    }
  }
  return expected;
}

/* -------------------------------------------------------------------------- */
/* Corpus validation                                                           */
/* -------------------------------------------------------------------------- */

/** Line count of a corpus-relative fixture file, or null when it does not exist. */
function fixtureLineCount(relative) {
  const absolute = path.join(FIXTURE_ROOT, relative);
  if (!fs.existsSync(absolute)) return null;
  return fs.readFileSync(absolute, 'utf8').split('\n').length;
}

/** The heading text of one markdown line, or null when the line is not a heading. */
function headingText(line) {
  const match = /^#{1,6}\s+(.*?)\s*$/.exec(line);
  return match ? match[1].replaceAll(/[#*`]/g, '').trim() : null;
}

/** Every markdown heading text in a file, for checking a citation's named section. */
function headingsOf(absolute) {
  const headings = new Set();
  for (const line of fs.readFileSync(absolute, 'utf8').split('\n')) {
    const text = headingText(line);
    if (text) headings.add(text);
  }
  return headings;
}

/**
 * The one-based line range a named section occupies, from its heading to the line
 * before the next heading of the same depth or shallower.
 *
 * @param {string[]} lines
 * @param {string} section
 * @returns {{start: number, end: number}|null}
 */
function sectionRange(lines, section) {
  const index = lines.findIndex((line) => headingText(line) === section);
  if (index === -1) return null;
  const depth = /^(#{1,6})\s/.exec(lines[index])[1].length;
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const next = /^(#{1,6})\s/.exec(lines[cursor]);
    if (next && next[1].length <= depth) return { start: index + 1, end: cursor };
  }
  return { start: index + 1, end: lines.length };
}

/**
 * Static validation of the corpus. This is what a pull request runs, and it is what
 * stops the ground truth from rotting into assertions about spans that moved.
 *
 * Problems are hard failures. Notices are recorded and printed without failing, which
 * is reserved for the skill citations: those are pinned to a commit by design and the
 * ground truth itself says to prefer the section name when the lines drift.
 *
 * @param {object} groundTruth
 * @returns {{problems: string[], notices: string[]}}
 */
function validateCorpus(groundTruth) {
  const problems = [];
  const notices = [];
  const tolerance = groundTruth.evidenceLineTolerance;
  const pctTolerance = groundTruth.coveragePercentTolerance;

  if (!Number.isInteger(tolerance) || tolerance < 0) problems.push('evidenceLineTolerance must be a non-negative integer');
  if (!Number.isInteger(pctTolerance) || pctTolerance < 0) problems.push('coveragePercentTolerance must be a non-negative integer');
  if (!Array.isArray(groundTruth.fixtureSets) || groundTruth.fixtureSets.length === 0) {
    problems.push('fixtureSets is missing or empty');
    return { problems, notices };
  }

  // Every skill rule the corpus cites must still exist under the section it names.
  // The section name is the stable anchor; the line span is pinned to commit 7ba2130
  // and drifts whenever a step file is edited, which is a notice rather than a failure.
  for (const [key, citation] of Object.entries(groundTruth.skillRuleCitations ?? {})) {
    const absolute = path.join(PROJECT_ROOT, citation.file);
    if (!fs.existsSync(absolute)) {
      problems.push(`skillRuleCitations.${key}: ${citation.file} does not exist`);
      continue;
    }
    const lines = fs.readFileSync(absolute, 'utf8').split('\n');
    if (citation.section && !headingsOf(absolute).has(citation.section)) {
      problems.push(`skillRuleCitations.${key}: ${citation.file} has no section titled "${citation.section}"`);
      continue;
    }
    const [start, end] = String(citation.lines).split('-').map(Number);
    const last = Number.isFinite(end) ? end : start;
    if (!Number.isFinite(start) || last > lines.length) {
      notices.push(`skillRuleCitations.${key}: cites lines ${citation.lines}, ${citation.file} has ${lines.length}`);
      continue;
    }
    // The span has to fall inside the section it names. That is the containment the
    // reader relies on: a citation that has drifted out of its section sends them to
    // a different rule, while one that moved a few lines inside it still lands on the
    // right block. The section lookup above already proved the rule itself is there.
    const section = sectionRange(lines, citation.section);
    if (section && (start < section.start || last > section.end)) {
      notices.push(
        `skillRuleCitations.${key}: cites ${citation.file}:${citation.lines}, section "${citation.section}" now spans ${section.start}-${section.end}`,
      );
    }
  }

  const seenSetIds = new Set();
  for (const set of groundTruth.fixtureSets) {
    const label = `fixtureSets[${set.id || '(no id)'}]`;
    if (!set.id) problems.push(`${label}: no id`);
    if (seenSetIds.has(set.id)) problems.push(`${label}: duplicate id`);
    seenSetIds.add(set.id);

    // The oracle document, the test root, and the source root have to be there, and
    // the two optional inputs have to be present exactly when the set declares them.
    for (const [field, relative] of [
      ['oracle.document', set.oracle?.document],
      ['testRoot', set.testRoot],
      ['sourceRoot', set.sourceRoot],
    ]) {
      if (!relative) {
        problems.push(`${label}: ${field} is not declared`);
        continue;
      }
      if (!fs.existsSync(path.join(FIXTURE_ROOT, relative))) problems.push(`${label}: ${field} ${relative} does not exist`);
    }
    for (const [field, relative] of [
      ['liveResultsFile', set.liveResultsFile],
      ['waiverRegister', set.waiverRegister],
    ]) {
      const absolute = relative ? path.join(FIXTURE_ROOT, relative) : null;
      if (relative && !fs.existsSync(absolute)) problems.push(`${label}: ${field} ${relative} does not exist`);
    }

    // A clean set that grew a test-artifacts directory would hand the control run a
    // waiver register and a live file, which is the failure the two-workspace design
    // exists to prevent. Catch it in the corpus rather than in a live run.
    if (!set.liveResultsFile && !set.waiverRegister && fs.existsSync(path.join(FIXTURE_ROOT, set.root, 'test-artifacts'))) {
      problems.push(`${label}: declares no live results and no waiver register, but ${set.root}/test-artifacts/ exists`);
    }

    const seenCriterionIds = new Set();
    const spansByFile = new Map();
    for (const item of set.criteria ?? []) {
      const criterionLabel = `${label} ${item.id || '(no id)'}`;
      if (!item.id) problems.push(`${criterionLabel}: no id`);
      if (seenCriterionIds.has(item.id)) problems.push(`${criterionLabel}: duplicate id`);
      seenCriterionIds.add(item.id);
      if (!PRIORITIES.includes(item.priority)) problems.push(`${criterionLabel}: priority "${item.priority}" is outside P0 to P3`);
      if (!COVERAGE_STATUSES.has(item.trueCoverage)) {
        problems.push(`${criterionLabel}: trueCoverage "${item.trueCoverage}" is outside the five-value enum`);
      }
      if (item.trueCoverage === 'NONE' && (item.evidence ?? []).length > 0) {
        problems.push(`${criterionLabel}: is NONE and still records evidence`);
      }
      if (COVERAGE_ELIGIBLE.has(item.trueCoverage) && (item.evidence ?? []).length === 0) {
        problems.push(`${criterionLabel}: is ${item.trueCoverage} and records no evidence`);
      }

      for (const entry of [...(item.evidence ?? []), ...(item.falseEvidence ?? [])]) {
        if (entry.level === 'live') {
          // A live entry names a record id instead of a span, so it is checked against
          // the results file the set declares.
          const liveFile = set.liveResultsFile ? path.join(FIXTURE_ROOT, set.liveResultsFile) : null;
          if (!liveFile || !fs.existsSync(liveFile)) {
            problems.push(`${criterionLabel}: names live record ${entry.recordId} but the set declares no readable live results file`);
            continue;
          }
          const parsed = JSON.parse(fs.readFileSync(liveFile, 'utf8'));
          if (!(parsed.results ?? []).some((record) => record.id === entry.recordId)) {
            problems.push(`${criterionLabel}: live record ${entry.recordId} is not in ${set.liveResultsFile}`);
          }
          continue;
        }
        const lineCount = fixtureLineCount(entry.file);
        if (lineCount === null) {
          problems.push(`${criterionLabel}: cites ${entry.file}, which does not exist`);
          continue;
        }
        if (!Number.isInteger(entry.line) || entry.line < 1 || entry.line > lineCount) {
          problems.push(`${criterionLabel}: cites ${entry.file}:${entry.line}, the file has ${lineCount} lines`);
          continue;
        }
        if (!Number.isInteger(entry.lineEnd) || entry.lineEnd < entry.line || entry.lineEnd > lineCount) {
          problems.push(`${criterionLabel}: span ${entry.file}:${entry.line}-${entry.lineEnd} does not close inside the file`);
          continue;
        }
        const spans = spansByFile.get(entry.file) ?? [];
        spans.push({ criterion: item.id, line: entry.line, lineEnd: entry.lineEnd });
        spansByFile.set(entry.file, spans);
      }
    }

    // The tolerance exists to admit the blank line above a test declaration. If it can
    // reach into the previous test's span, a citation of the wrong test would score as
    // a hit, which is the ground truth's own stated reason for choosing 1 over 2.
    for (const [file, spans] of spansByFile) {
      for (const span of spans) {
        for (const other of spans) {
          if (other === span) continue;
          if (span.line - tolerance <= other.lineEnd && span.line - tolerance >= other.line) {
            problems.push(
              `${label}: evidenceLineTolerance ${tolerance} lets a citation of ${file}:${span.line - tolerance} match both ${span.criterion} and ${other.criterion}`,
            );
          }
        }
      }
    }

    // The typed numbers exist so a mistake in the corpus is caught here rather than
    // propagated into a score. The harness scores against the recomputed values.
    const expected = recomputeExpectations(set);
    const typed = set.coverageArithmetic ?? {};
    const compare = (field, actual, declared) => {
      if (declared === undefined) {
        problems.push(`${label}: coverageArithmetic.${field} is not declared`);
        return;
      }
      if (JSON.stringify(actual) !== JSON.stringify(declared)) {
        problems.push(
          `${label}: coverageArithmetic.${field} says ${JSON.stringify(declared)}, trueCoverage gives ${JSON.stringify(actual)}`,
        );
      }
    };
    compare(
      'fullCriteria',
      (set.criteria ?? []).filter((item) => item.trueCoverage === 'FULL').map((item) => item.id),
      typed.fullCriteria,
    );
    compare('partialCriteria', expected.gapBuckets.partialCoverageItems, typed.partialCriteria);
    compare(
      'noneCriteria',
      (set.criteria ?? []).filter((item) => item.trueCoverage === 'NONE').map((item) => item.id),
      typed.noneCriteria,
    );
    compare('overall.full', expected.overall.covered, typed.overall?.full);
    compare('overall.total', expected.overall.total, typed.overall?.total);
    compare('overall.expectedPct', expected.overall.pct, typed.overall?.expectedPct);
    for (const name of PRIORITIES) {
      compare(`priority.${name}.full`, expected.priority[name].covered, typed.priority?.[name]?.full);
      compare(`priority.${name}.total`, expected.priority[name].total, typed.priority?.[name]?.total);
      compare(`priority.${name}.expectedPct`, expected.priority[name].pct, typed.priority?.[name]?.expectedPct);
    }
    for (const bucket of ['criticalGaps', 'highGaps', 'mediumGaps', 'lowGaps', 'partialCoverageItems', 'unitOnlyItems']) {
      compare(`gapBuckets.${bucket}`, expected.gapBuckets[bucket], typed.gapBuckets?.[bucket]);
    }
    for (const key of Object.keys(expected.riskSummary)) {
      compare(`riskSummary.${key}`, expected.riskSummary[key], typed.riskSummary?.[key]);
    }
    for (const level of LEVELS) {
      compare(`byLevelCriteriaCovered.${level}`, expected.byLevel[level], typed.byLevelCriteriaCovered?.[level]);
    }

    // The gate is the rules applied to the recomputed percentages, so a declared
    // decision that disagrees with them means one of the two was written by hand.
    if (set.expectedGate?.decision !== expected.gate.decision) {
      problems.push(`${label}: expectedGate.decision is ${set.expectedGate?.decision}, the rules give ${expected.gate.decision}`);
    }
    if (set.expectedGate?.producedBy !== expected.gate.producedBy) {
      problems.push(`${label}: expectedGate.producedBy is ${set.expectedGate?.producedBy}, the rules give ${expected.gate.producedBy}`);
    }
    // The live overlay caps a PASS at CONCERNS, so a set expecting PASS while owning a
    // live-only requirement would be declaring an unreachable decision.
    if (expected.gate.decision === 'PASS' && (set.expectedLiveEvidence?.requirements_live_only ?? 0) > 0) {
      problems.push(`${label}: expects PASS while declaring a live-only requirement, which the live overlay caps at CONCERNS`);
    }

    // Waiver expectations are field reads against the register the set declares.
    if (set.waiverRegister) {
      const register = fs.readFileSync(path.join(FIXTURE_ROOT, set.waiverRegister), 'utf8');
      for (const waiver of [...(set.expectedWaiverHandling?.valid ?? []), ...(set.expectedWaiverHandling?.invalid ?? [])]) {
        if (!new RegExp(`^##\\s+${waiver.id}:`, 'm').test(register)) {
          problems.push(`${label}: expectedWaiverHandling names ${waiver.id}, which is not a heading in ${set.waiverRegister}`);
        }
        if (!(set.criteria ?? []).some((item) => item.id === waiver.waives)) {
          problems.push(`${label}: waiver ${waiver.id} waives ${waiver.waives}, which is not a criterion in this set`);
        }
      }
      // Each invalid waiver needs a row in EXPECTED_FAILED_WAIVER_CHECKS, and the row
      // has to name one check id per violation the corpus records. Without this, a
      // violation added to the corpus would be scored by nothing.
      for (const waiver of set.expectedWaiverHandling?.invalid ?? []) {
        const ids = EXPECTED_FAILED_WAIVER_CHECKS[waiver.id];
        if (!ids) {
          problems.push(`${label}: waiver ${waiver.id} is expected invalid and has no row in EXPECTED_FAILED_WAIVER_CHECKS`);
          continue;
        }
        if (ids.length !== (waiver.violations ?? []).length) {
          problems.push(
            `${label}: waiver ${waiver.id} records ${(waiver.violations ?? []).length} violation(s) and EXPECTED_FAILED_WAIVER_CHECKS names ${ids.length} check id(s)`,
          );
        }
      }
    } else if ((set.expectedWaiverHandling?.valid ?? []).length + (set.expectedWaiverHandling?.invalid ?? []).length > 0) {
      problems.push(`${label}: declares waiver expectations with no waiver register`);
    }

    // Live expectations are counts over the records the results file carries.
    if (set.liveResultsFile) {
      const parsed = JSON.parse(fs.readFileSync(path.join(FIXTURE_ROOT, set.liveResultsFile), 'utf8'));
      const declaredBlockers = set.expectedLiveEvidence?.expectedBlockers ?? [];
      if (declaredBlockers.length !== (parsed.results ?? []).length) {
        problems.push(
          `${label}: expects ${declaredBlockers.length} live blocker(s) from a file carrying ${(parsed.results ?? []).length} record(s)`,
        );
      }
      for (const blocker of declaredBlockers) {
        if (!(parsed.results ?? []).some((record) => record.id === blocker.id)) {
          problems.push(`${label}: expects a blocker for live record ${blocker.id}, which the results file does not carry`);
        }
      }
    } else if (set.expectedLiveEvidence?.present !== false) {
      problems.push(`${label}: declares no live results file while expectedLiveEvidence.present is not false`);
    }
  }

  return { problems, notices };
}

/* -------------------------------------------------------------------------- */
/* Workspace staging                                                           */
/* -------------------------------------------------------------------------- */

/** Every file under a directory, as paths relative to it, sorted. */
function filesUnder(root) {
  const found = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) found.push(path.relative(root, absolute));
    }
  };
  if (fs.existsSync(root)) walk(root);
  return found;
}

/** Digest of a file list, keyed by relative path so a rename shows up. */
function digestTree(root, relativePaths) {
  const parts = [];
  for (const relative of [...relativePaths].sort()) {
    parts.push(relative, fs.readFileSync(path.join(root, relative)));
  }
  return digest(parts);
}

/** The resolved TEA config the staged run reads its placeholders from. */
function configYaml() {
  return [
    '# Written by test/eval-trace.js for one staged fixture set.',
    '# test_artifacts points at this workspace only, so the seeded set reads its own',
    '# live verification file and waiver register and the clean set reads neither.',
    'user_name: tea-eval-harness',
    'project_name: tidewater-support-desk',
    'communication_language: English',
    'document_output_language: English',
    'output_folder: docs',
    'test_artifacts: test-artifacts',
    '',
  ].join('\n');
}

/**
 * Stage one fixture set into a disposable workspace.
 *
 * Layout, with the workspace itself as the agent's working directory:
 *
 *   project/   the fixture set, plus a resolved _bmad/tea/config.yaml
 *   skill/     the bmad-testarch-trace workflow, copied verbatim
 *
 * The skill sits outside `project/` on purpose. Its step files and knowledge
 * fragments carry example test snippets, and a source tree that contained them would
 * feed the discovery pass tests that are not part of the corpus.
 *
 * @param {object} set
 * @returns {{dir: string, projectDir: string, corpusFiles: string[], corpusDigest: string}}
 */
function stageWorkspace(set) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-trace-eval-'));
  const projectDir = path.join(dir, 'project');
  const setRoot = path.join(FIXTURE_ROOT, set.root);

  for (const relative of filesUnder(setRoot)) {
    const target = path.join(projectDir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(setRoot, relative), target);
  }
  // The workflow writes its two artifacts here. The seeded set brought its own inputs
  // with it; the clean set gets the directory empty, which is what it must have.
  fs.mkdirSync(path.join(projectDir, 'test-artifacts'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, '_bmad', 'tea'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, '_bmad', 'tea', 'config.yaml'), configYaml(), 'utf8');

  for (const relative of filesUnder(SKILL_ROOT)) {
    const target = path.join(dir, 'skill', relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(SKILL_ROOT, relative), target);
  }

  // The corpus files the run must leave alone. test-artifacts and _bmad are excluded
  // because the run legitimately writes into the first and the harness wrote the second.
  const corpusFiles = filesUnder(projectDir).filter(
    (relative) => !relative.startsWith(`test-artifacts${path.sep}`) && !relative.startsWith(`_bmad${path.sep}`),
  );
  return { dir, projectDir, corpusFiles, corpusDigest: digestTree(projectDir, corpusFiles) };
}

/**
 * Assert the staged workspace holds no part of the ground truth.
 *
 * This is the measurement's validity, so it is checked rather than assumed: no staged
 * path is named for the ground truth, no staged file carries its bytes, and no staged
 * file carries a key that appears only in it.
 *
 * @param {string} dir Workspace root.
 * @returns {string[]} Problems, empty when the workspace is clean.
 */
function assertGroundTruthAbsent(dir) {
  const problems = [];
  const groundTruthBytes = fs.existsSync(GROUND_TRUTH) ? fs.readFileSync(GROUND_TRUTH, 'utf8') : null;
  for (const relative of filesUnder(dir)) {
    if (path.basename(relative) === 'ground-truth.json') {
      problems.push(`staged workspace contains ${relative}`);
      continue;
    }
    const text = fs.readFileSync(path.join(dir, relative), 'utf8');
    if (groundTruthBytes && text === groundTruthBytes) {
      problems.push(`staged file ${relative} carries the ground truth verbatim`);
      continue;
    }
    for (const token of GROUND_TRUTH_ONLY_TOKENS) {
      if (text.includes(token)) problems.push(`staged file ${relative} carries the ground-truth-only key "${token}"`);
    }
  }
  return problems;
}

/* -------------------------------------------------------------------------- */
/* Prompt                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The prompt one fixture set gets.
 *
 * Every path is relative to the workspace, which keeps the text identical across
 * runs and machines and makes its digest something a later run can compare with.
 *
 * It states the run's configuration and nothing about the answers: no criterion is
 * named, no coverage status is suggested, and the oracle document is left to be
 * discovered the way step-01 discovers one.
 *
 * @param {object} set
 * @returns {string}
 */
function buildPrompt(set) {
  return [
    'You are running the TEA workflow `bmad-testarch-trace` against the project in `project/`.',
    '',
    'The workflow is in `skill/`. Read `skill/instructions.md` first, then execute every step file it',
    'names in order, in full, without skipping or reordering. The step files are under `skill/steps-c/`.',
    '',
    '----- run configuration -----',
    'Resolve the workflow placeholders to these values:',
    '',
    '- `{project-root}`: `project`',
    '- `{config_source}`: `project/_bmad/tea/config.yaml`',
    '- `{test_artifacts}`: `project/test-artifacts`',
    '- `{test_dir}`: `project/tests`',
    '- `{source_dir}`: `project/src`',
    '- `{skill-root}`: `skill`',
    '- `gate_type`: `epic`',
    '- `decision_mode`: `deterministic`',
    '- `collection_mode`: `contract_static`',
    '- `allow_gate`: `true`',
    '- `coverage_basis`: `auto`',
    '- `summary_confidence`: `auto`',
    '- `coverage_levels`: `e2e,api,component,unit,live`',
    '',
    'The trace target is the epic under `project/docs/epics/`. Resolve the coverage oracle from it the',
    'way step-01 says to.',
    '',
    '----- what to produce -----',
    'Write both deliverables the workflow declares:',
    '',
    '- `project/test-artifacts/traceability-matrix.md`, from `skill/trace-template.md`, carrying the',
    '  detailed mapping with one section per criterion, each stating its coverage status and the tests',
    '  that establish it as `file:line`.',
    '- `project/test-artifacts/e2e-trace-summary.json` at schema_version 0.3.0, exactly as',
    '  `skill/steps-c/step-05-gate-decision.md` section 3b defines it.',
    '',
    'Do not add, edit, or delete any file under `project/docs/`, `project/src/`, or `project/tests/`.',
    'This workflow does not generate tests.',
    '',
    'When you are done, print one line naming the two files you wrote. Nothing else you print is read.',
  ].join('\n');
}

/** Every case with the exact prompt it is sent. */
function caseIndex(sets) {
  return sets.map((set) => ({ id: set.id, prompt: buildPrompt(set) }));
}

/* -------------------------------------------------------------------------- */
/* Artifact parsing                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The machine-readable summary the run wrote.
 *
 * @param {string} projectDir
 * @returns {{ok: true, summary: object}|{ok: false, failureClass: string, reason: string}}
 */
function readSummary(projectDir) {
  const summaryPath = path.join(projectDir, 'test-artifacts', 'e2e-trace-summary.json');
  if (!fs.existsSync(summaryPath)) {
    return { ok: false, failureClass: 'environment-missing-artifact', reason: 'no e2e-trace-summary.json was written' };
  }
  let summary;
  try {
    summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  } catch (error) {
    return { ok: false, failureClass: 'environment-parser', reason: `e2e-trace-summary.json is not valid JSON: ${error.message}` };
  }
  const version = String(summary.schema_version ?? '');
  if (version.split('.').slice(0, 2).join('.') !== SUMMARY_SCHEMA_MAJOR_MINOR) {
    // A different version is a changed contract, not a bad answer. Scoring it would
    // report a contract migration as a quality regression.
    return {
      ok: false,
      failureClass: 'environment-parser',
      reason: `e2e-trace-summary.json declares schema_version "${version || '(missing)'}", this harness scores ${SUMMARY_SCHEMA_MAJOR_MINOR}.x`,
    };
  }
  return { ok: true, summary };
}

/**
 * The per-criterion coverage statuses and evidence citations, read out of the
 * traceability matrix.
 *
 * The summary is the contract for everything else, and it carries no per-criterion
 * matrix at any version. The matrix markdown is where that judgment is recorded, so
 * it is read here and reported as a gap the summary owes.
 *
 * Returns null when the document declares no section for any criterion the oracle
 * names, so a template change surfaces as unmeasurable instead of as a run that
 * classified every criterion wrong.
 *
 * @param {string} projectDir
 * @param {object} set
 * @returns {{byCriterion: Map<string, {status: string|null, citations: Array<{file: string, line: number}>}>, duplicates: string[]}|null}
 */
function readMatrix(projectDir, set) {
  const matrixPath = path.join(projectDir, 'test-artifacts', 'traceability-matrix.md');
  if (!fs.existsSync(matrixPath)) return null;
  const ids = new Set((set.criteria ?? []).map((item) => item.id));
  const lines = fs.readFileSync(matrixPath, 'utf8').split('\n');

  const byCriterion = new Map();
  const duplicates = [];
  let current = null;
  // A criterion section lists the tests that establish it and, under its own label,
  // the tests it considered and turned down. Citations under the second label are the
  // run doing the right thing, so they are not read as evidence it offered.
  let inRejectedBlock = false;
  for (const line of lines) {
    const heading = /^#{2,6}\s+\**([A-Za-z]+-\d+)\**\s*[:.)-]/.exec(line.trim());
    if (heading) {
      const id = heading[1].toUpperCase();
      inRejectedBlock = false;
      current = ids.has(id) ? id : null;
      if (current && byCriterion.has(current)) {
        duplicates.push(current);
        current = null;
        continue;
      }
      if (current) byCriterion.set(current, { status: null, citations: [] });
      continue;
    }
    if (!current) continue;
    const entry = byCriterion.get(current);
    const label = /^\s*[-*]\s*\*\*\s*(.+?)\s*:?\s*\*\*/.exec(line);
    if (label) inRejectedBlock = /considered and rejected/i.test(label[1]);
    if (entry.status === null && label && /^coverage$/i.test(label[1])) {
      const status = /\b(UNIT-ONLY|INTEGRATION-ONLY|FULL|PARTIAL|NONE)\b/.exec(line.toUpperCase());
      entry.status = status ? status[1] : null;
    }
    if (inRejectedBlock) continue;
    for (const match of line.matchAll(/([\w./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|rb|go|java|kt|cs)):(\d+)/g)) {
      entry.citations.push({ file: match[1], line: Number.parseInt(match[2], 10) });
    }
  }

  if (byCriterion.size === 0) return null;
  return { byCriterion, duplicates };
}

/* -------------------------------------------------------------------------- */
/* Scoring                                                                     */
/* -------------------------------------------------------------------------- */

/** One check outcome, carrying what was expected so a miss can be printed. */
function check(field, expected, actual) {
  return { field, expected, actual, ok: JSON.stringify(expected) === JSON.stringify(actual) };
}

/** Percentage comparison at the corpus's declared tolerance. */
function pctCheck(field, expected, actual, tolerance) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
  return { field, expected, actual, ok };
}

/**
 * Coverage counts and percentages, recomputed from trueCoverage and compared with the
 * numbers the run reported.
 *
 * The last group checks the report against itself: every percentage it prints must be
 * the rounding of the counts it prints beside them. A run whose counts are right and
 * whose percentage is not has a calculation defect the ground truth cannot see.
 */
function scoreArithmetic(summary, expected, tolerance) {
  const checks = [];
  const inventory = summary.coverage?.inventory ?? {};
  checks.push(
    check('coverage.inventory.covered', expected.overall.covered, inventory.covered),
    check('coverage.inventory.total', expected.overall.total, inventory.total),
    pctCheck('coverage.inventory.pct', expected.overall.pct, inventory.pct, tolerance),
  );
  for (const name of PRIORITIES) {
    const reported = summary.coverage?.priority_breakdown?.[name] ?? {};
    checks.push(
      check(`priority_breakdown.${name}.total`, expected.priority[name].total, reported.total),
      check(`priority_breakdown.${name}.covered`, expected.priority[name].covered, reported.covered),
      pctCheck(`priority_breakdown.${name}.pct`, expected.priority[name].pct, reported.pct, tolerance),
    );
  }
  for (const key of Object.keys(expected.riskSummary)) {
    checks.push(check(`risk_summary.${key}`, expected.riskSummary[key], summary.risk_summary?.[key]));
  }
  for (const level of LEVELS) {
    checks.push(
      check(`by_level.${level}.criteria_covered`, expected.byLevel[level], summary.coverage?.by_level?.[level]?.criteria_covered),
    );
  }
  const internal = [
    ['coverage.inventory', inventory],
    ...PRIORITIES.map((name) => [`priority_breakdown.${name}`, summary.coverage?.priority_breakdown?.[name] ?? {}]),
  ];
  for (const [label, block] of internal) {
    checks.push(check(`${label}.pct is round(covered/total*100)`, safePct(block.covered ?? 0, block.total ?? 0), block.pct));
  }
  return checks;
}

/** The nine gate_criteria fields, plus the two that say the gate was evaluated at all. */
function scoreGateCriteria(summary, set) {
  const declared = set.expectedGate?.gateCriteria ?? {};
  const reported = summary.gate_criteria ?? {};
  const checks = Object.keys(declared).map((field) => check(`gate_criteria.${field}`, declared[field], reported[field]));
  checks.push(
    check('collection_status', set.collection?.collectionStatus ?? 'COLLECTED', summary.collection_status),
    check('gate_basis', 'priority_thresholds', summary.gate_basis),
  );
  return checks;
}

/** How the oracle was resolved, which both epics make a formal-requirements answer. */
function scoreOracleResolution(summary, set) {
  return [
    check('collection_mode', set.collection?.collectionMode, summary.collection_mode),
    check('inventory_basis', set.oracle?.coverageBasis, summary.inventory_basis),
    check('oracle.resolution_mode', set.oracle?.oracleResolutionMode, summary.oracle?.resolution_mode),
    check('oracle.external_pointer_status', set.oracle?.externalPointerStatus, summary.oracle?.external_pointer_status),
    check('oracle.synthetic', false, summary.oracle?.synthetic),
  ];
}

/**
 * rejected_evidence: the tests whose names claim a criterion their assertions do not
 * establish.
 *
 * The seeded set owes exactly one, naming the AC-2 test. The clean set owes none. It
 * is the most direct signal in the corpus that the discriminator was read rather than
 * matched on a title.
 */
function scoreRejectedEvidence(summary, set, tolerance) {
  const expected = expectedRejectedEvidence(set);
  const reported = Array.isArray(summary.rejected_evidence) ? summary.rejected_evidence : null;
  const checks = [
    check('rejected_evidence is an array', true, reported !== null),
    check('rejected_evidence.length', expected.length, reported?.length),
  ];
  for (const item of expected) {
    const match = (reported ?? []).find(
      (entry) =>
        String(entry.requirement_id ?? '').toUpperCase() === item.requirementId &&
        String(entry.file ?? '').endsWith(path.basename(item.file)) &&
        Number(entry.line) >= item.line - tolerance &&
        Number(entry.line) <= item.lineEnd + tolerance,
    );
    checks.push(
      check(
        `rejected_evidence names ${item.requirementId} at ${path.basename(item.file)}:${item.line}-${item.lineEnd}`,
        true,
        Boolean(match),
      ),
    );
  }
  return checks;
}

/**
 * The waiver block.
 *
 * `fail_only` is evaluated against the decision the run itself derived, so a run that
 * scores AC-2 as covered derives PASS and then reports the well formed W-1 as invalid
 * too. One wrong judgment would score as three failures. The caller passes
 * `gateMatched`, and a run whose gate was wrong contributes no waiver checks at all.
 */
function scoreWaivers(summary, set, gateMatched) {
  if (!gateMatched) return { scored: false, checks: [] };
  const expectedValid = set.expectedWaiverHandling?.valid ?? [];
  const expectedInvalid = set.expectedWaiverHandling?.invalid ?? [];
  if (!set.waiverRegister) {
    return { scored: true, checks: [check('waivers block absent when no register exists', undefined, summary.waivers)] };
  }
  const waivers = summary.waivers ?? {};
  const entries = Array.isArray(waivers.entries) ? waivers.entries : [];
  const checks = [
    check('waivers.filed', expectedValid.length + expectedInvalid.length, waivers.filed),
    check('waivers.valid', expectedValid.length, waivers.valid),
    check('waivers.invalid', expectedInvalid.length, waivers.invalid),
  ];
  for (const waiver of expectedValid) {
    const entry = entries.find((item) => String(item.id ?? '').toUpperCase() === waiver.id.toUpperCase());
    checks.push(check(`waiver ${waiver.id} reported valid`, true, entry?.valid === true));
  }
  for (const waiver of expectedInvalid) {
    const entry = entries.find((item) => String(item.id ?? '').toUpperCase() === waiver.id.toUpperCase());
    checks.push(check(`waiver ${waiver.id} reported invalid`, true, entry?.valid === false));
    // Every check the corpus records a violation against has to be named. A waiver
    // turned down for one reason out of six is turned down for the wrong reason.
    const failed = new Set((entry?.failed_checks ?? []).map(String));
    for (const id of EXPECTED_FAILED_WAIVER_CHECKS[waiver.id] ?? []) {
      checks.push(check(`waiver ${waiver.id} names failed check ${id}`, true, failed.has(id)));
    }
    // The coupling, stated as a check. This waiver names FAIL and the run derived
    // FAIL, so fail_only holds. It is only reachable here because the gate matched.
    checks.push(check(`waiver ${waiver.id} does not fail fail_only`, false, failed.has('fail_only')));
  }
  return { scored: true, checks };
}

/**
 * The live evidence block and the blockers it produces.
 *
 * Whether record 4-LIVE-001 lands as stale or as unverifiable depends on the
 * workspace resolving a current commit sha, which the fixture cannot carry. Both
 * outcomes mean the same thing, so the pair is scored as a sum rather than
 * individually, exactly as the ground truth's environmentDependentPair says.
 */
function scoreLiveEvidence(summary, set) {
  const expected = set.expectedLiveEvidence ?? {};
  const live = summary.live_evidence ?? {};
  const checks = [check('live_evidence.present', expected.present, live.present)];
  if (!expected.present) {
    checks.push(
      check('live_evidence.freshness', expected.freshness, live.freshness),
      check('blockers is empty', 0, (summary.blockers ?? []).length),
    );
    return checks;
  }
  for (const key of ['counted', 'requirements_live_only', 'failed', 'contradicted', 'blocked', 'skipped', 'unmatched', 'invalid']) {
    if (expected[key] === undefined) continue;
    checks.push(check(`live_evidence.${key}`, expected[key], live[key]));
  }
  const pair = expected.environmentDependentPair;
  if (pair) {
    const total = (pair.whenCurrentShaResolves?.stale ?? 0) + (pair.whenCurrentShaResolves?.unverifiable ?? 0);
    checks.push(
      check('live_evidence.stale + live_evidence.unverifiable', total, (Number(live.stale) || 0) + (Number(live.unverifiable) || 0)),
    );
  }
  const blockers = summary.blockers ?? [];
  for (const blocker of expected.expectedBlockers ?? []) {
    const reported = blockers.find((item) => String(item.id ?? '') === blocker.id);
    checks.push(check(`blocker ${blocker.id} at severity ${blocker.severity}`, blocker.severity, reported?.severity));
  }
  // Nothing in either set is skipped, pending, or fixme, so a blocker beyond the live
  // records is a finding the corpus does not support.
  checks.push(check('blockers count', (expected.expectedBlockers ?? []).length, blockers.length));
  return checks;
}

/**
 * Score one completed run of one fixture set.
 *
 * @returns {object|null} Null when the artifacts could not be read, which the caller
 *   reports as an environment failure rather than as a run that scored badly.
 */
function scoreRun(set, summary, matrix, tolerance, pctTolerance) {
  const expected = recomputeExpectations(set);
  const criteria = set.criteria ?? [];

  const statusResults = criteria.map((item) => {
    const reported = matrix.byCriterion.get(item.id);
    return {
      id: item.id,
      expected: item.trueCoverage,
      reported: reported?.status ?? null,
      discriminating: item.isDiscriminatingCase === true,
      ok: reported?.status === item.trueCoverage,
    };
  });

  // A section for an id the epic never states is a criterion the run invented, and
  // the corpus names that as something it must not report.
  const invented = [...matrix.byCriterion.keys()].filter((id) => !criteria.some((item) => item.id === id));

  // Every citation the run made, resolved against the spans recorded for the criterion
  // it made them under. A citation landing on a falseEvidence span is counted apart:
  // it is the AC-2 discriminator seen from the evidence side.
  const citations = { total: 0, resolved: 0, misattributed: [], unresolved: [] };
  for (const item of criteria) {
    const reported = matrix.byCriterion.get(item.id);
    if (!reported) continue;
    for (const citation of reported.citations) {
      citations.total += 1;
      const inSpan = (entry) =>
        String(entry.file ?? '').endsWith(path.basename(citation.file)) &&
        citation.line >= entry.line - tolerance &&
        citation.line <= entry.lineEnd + tolerance;
      if ((item.evidence ?? []).some((entry) => inSpan(entry))) {
        citations.resolved += 1;
        continue;
      }
      if ((item.falseEvidence ?? []).filter((entry) => entry.level !== 'live').some((entry) => inSpan(entry))) {
        citations.misattributed.push(`${item.id} -> ${citation.file}:${citation.line}`);
        continue;
      }
      citations.unresolved.push(`${item.id} -> ${citation.file}:${citation.line}`);
    }
  }

  const gateReported = summary.gate_status ?? null;
  const gateOk = gateReported === expected.gate.decision;
  const waivers = scoreWaivers(summary, set, gateOk);

  // The clean set has adequate evidence for every criterion and no artifacts of any
  // kind, so each of these is a definite false positive rather than an unattributed
  // finding a human still has to judge.
  const isCleanSet = (set.criteria ?? []).every((item) => item.trueCoverage === 'FULL') && !set.liveResultsFile && !set.waiverRegister;
  let cleanFalsePositives = 0;
  if (isCleanSet) {
    cleanFalsePositives += statusResults.filter((item) => item.reported !== 'FULL').length;
    cleanFalsePositives += (summary.blockers ?? []).length;
    cleanFalsePositives += (summary.rejected_evidence ?? []).length;
    cleanFalsePositives += summary.waivers ? 1 : 0;
    cleanFalsePositives += summary.live_evidence?.present ? 1 : 0;
    cleanFalsePositives += Object.values(summary.risk_summary ?? {}).filter((value) => Number(value) > 0).length;
    cleanFalsePositives += invented.length;
  }

  return {
    caseId: set.id,
    isCleanSet,
    statusResults,
    invented,
    duplicates: matrix.duplicates,
    citations,
    gate: { expected: expected.gate.decision, reported: gateReported, ok: gateOk },
    arithmetic: scoreArithmetic(summary, expected, pctTolerance),
    gateCriteria: scoreGateCriteria(summary, set),
    oracleResolution: scoreOracleResolution(summary, set),
    rejectedEvidence: scoreRejectedEvidence(summary, set, tolerance),
    waivers,
    live: scoreLiveEvidence(summary, set),
    cleanFalsePositives,
  };
}

/**
 * The scored answer as one string, for stability.
 *
 * It carries the judgments and nothing that moves for environmental reasons: the
 * stale-versus-unverifiable pair and every timestamp are left out, because a run that
 * differs only there gave the same answer.
 */
function signatureOf(scored) {
  return JSON.stringify([
    scored.caseId,
    scored.statusResults.map((item) => `${item.id}=${item.reported}`),
    scored.gate.reported,
    scored.arithmetic.map((item) => `${item.field}=${JSON.stringify(item.actual)}`),
    scored.rejectedEvidence.map((item) => `${item.field}=${JSON.stringify(item.actual)}`),
    scored.waivers.checks.map((item) => `${item.field}=${JSON.stringify(item.actual)}`),
    scored.cleanFalsePositives,
  ]);
}

/* -------------------------------------------------------------------------- */
/* Running                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * One complete trace run of one fixture set in a fresh workspace.
 *
 * @returns {{ok: true, scored: object, mutations: number}|{ok: false, failureClass: string, reason: string}}
 */
function runCase(set, options, agent, tolerance, pctTolerance) {
  const workspace = stageWorkspace(set);
  try {
    const leaked = assertGroundTruthAbsent(workspace.dir);
    if (leaked.length > 0) {
      return { ok: false, failureClass: 'environment-configuration', reason: leaked.join('; ') };
    }

    try {
      runAgent(buildPrompt(set), {
        agent,
        agentCommand: options.agentCmd,
        agentArgs: options.agentArgs,
        envPass: options.envPass,
        model: options.model,
        timeout: RUN_TIMEOUT_MS,
        cwd: workspace.dir,
      });
    } catch (error) {
      return { ok: false, failureClass: classifyAgentError(error), reason: error.message };
    }

    const summary = readSummary(workspace.projectDir);
    if (!summary.ok) return summary;

    const matrix = readMatrix(workspace.projectDir, set);
    if (matrix === null) {
      return {
        ok: false,
        failureClass: 'environment-missing-artifact',
        reason: 'traceability-matrix.md is missing or declares no section for any criterion the oracle names',
      };
    }

    // The workflow states that it does not generate tests. A run that wrote one has
    // moved the benchmark, and the next run would be measured against a corpus this
    // one edited.
    const mutations = digestTree(workspace.projectDir, workspace.corpusFiles) === workspace.corpusDigest ? 0 : 1;
    const added = filesUnder(workspace.projectDir).filter(
      (relative) =>
        !relative.startsWith(`test-artifacts${path.sep}`) &&
        !relative.startsWith(`_bmad${path.sep}`) &&
        !workspace.corpusFiles.includes(relative),
    );

    return { ok: true, scored: scoreRun(set, summary.summary, matrix, tolerance, pctTolerance), mutations: mutations + added.length };
  } finally {
    fs.rmSync(workspace.dir, { recursive: true, force: true });
  }
}

function preflight({ agents, agentCmd }) {
  const problems = [];
  const versions = {};
  // Each problem carries its failure class so a missing credential and a missing
  // fixture stay apart in the result record.
  const report = (failureClass, message) => problems.push({ failureClass, message });

  if (!fs.existsSync(GROUND_TRUTH)) report('environment-missing-artifact', `ground truth not found at ${GROUND_TRUTH}`);
  if (!fs.existsSync(SKILL_ROOT)) report('environment-missing-artifact', `trace workflow not found at ${SKILL_ROOT}`);

  for (const agent of agents) {
    // The name is checked against the adapter registry before anything is spawned.
    // runAgent would reject an unknown vendor too, but only after the string had
    // already been handed to spawnSync as a command.
    if (!Object.prototype.hasOwnProperty.call(AGENT_ADAPTERS, agent)) {
      report('environment-configuration', `unknown agent "${agent}"; expected one of ${Object.keys(AGENT_ADAPTERS).join(', ')}`);
      continue;
    }
    const executable = agent === 'custom' ? agentCmd : agent;
    const probe = spawnSync(executable, ['--version'], { encoding: 'utf8' });
    if (probe.error) report('environment-transport', `agent CLI "${executable}" is not on PATH (${probe.error.code})`);
    else if (probe.status === 0)
      versions[agent] =
        String(probe.stdout || '')
          .trim()
          .split('\n')[0] || null;
    else report('environment-transport', `agent CLI "${executable}" failed its --version probe (exit ${probe.status})`);
    const credential = agent === 'custom' ? null : missingCredential(agent);
    if (credential) report('environment-authentication', credential);
  }
  return { problems, versions };
}

/* -------------------------------------------------------------------------- */
/* Reporting                                                                   */
/* -------------------------------------------------------------------------- */

const ratio = (numerator, denominator) => (denominator === 0 ? Number.NaN : numerator / denominator);
const pct = (value) => (Number.isNaN(value) ? '  n/a' : `${(value * 100).toFixed(0).padStart(3)}%`);
const passed = (checks) => checks.filter((item) => item.ok).length;

/**
 * Write the machine-readable record when --json asked for one, then exit with the
 * code the failure class carries.
 */
function finish({ options, startedAt, mode, sets, runners, suiteFailureClasses = [] }) {
  const failureClass = worstFailureClass([...runners.map((runner) => runner.failureClass), ...suiteFailureClasses]);
  const exitCode = exitCodeForFailureClass(failureClass);

  if (options.jsonPath) {
    let suite;
    try {
      suite = suiteById(loadSuiteManifest(PROJECT_ROOT).manifest, SUITE_ID);
    } catch (error) {
      console.error(`${colors.red}eval: ${error.message}${colors.reset}`);
      process.exit(2);
    }
    const cases = caseIndex(sets).map((item) => ({ id: item.id, promptDigest: digest(item.prompt) }));
    writeSuiteResult(
      options.jsonPath,
      suiteResultRecord({
        mode,
        suite,
        repository: repositoryState(PROJECT_ROOT),
        fixtureDigest: digestFiles(PROJECT_ROOT, suite.fixtures),
        promptDigest: digestPrompts(caseIndex(sets)),
        cases,
        runners,
        durationMs: Date.now() - startedAt,
        suiteFailureClasses,
      }),
    );
    console.log(`${colors.dim}result written to ${options.jsonPath}${colors.reset}`);
  }

  process.exit(exitCode);
}

/** The per-runner half of the result record. */
function runnerRecord(agent, options, versions, { expected, completed, measurements, durationMs, failureClass, failures }) {
  const executable = agent === 'custom' ? options.agentCmd : agent;
  return {
    agent,
    executable,
    version: versions[agent] ?? probeVersion(executable),
    model: resolveModel(agent, options.model, options.agentArgs),
    parameters: {
      agentArgs: redactArgs(options.agentArgs),
      envPassNames: [...options.envPass],
      timeoutMs: RUN_TIMEOUT_MS,
      promptTransport: AGENT_ADAPTERS[agent]?.promptViaArgv ? 'argv' : 'stdin',
    },
    repetitions: { expected, completed },
    measurements,
    durationMs,
    usage: null, // No built-in adapter reports tokens or cost yet; a zero would be a claim.
    failureClass,
    failures,
  };
}

function main() {
  const startedAt = Date.now();
  const options = parseArgs(process.argv.slice(2));
  const { agents, runs, validateOnly } = options;

  console.log(`${colors.cyan}========================================`);
  console.log('tea trace eval harness');
  console.log(`========================================${colors.reset}\n`);

  const groundTruth = loadGroundTruth();
  if (!groundTruth) {
    console.error(`${colors.red}eval: ground truth at ${GROUND_TRUTH} is missing or not valid JSON${colors.reset}`);
    finish({
      options,
      startedAt,
      mode: validateOnly ? 'validate-only' : 'live',
      sets: [],
      runners: [],
      suiteFailureClasses: ['environment-missing-artifact'],
    });
  }

  const sets = selectSets(groundTruth, options.sets);
  if (sets.length === 0) {
    console.error(`${colors.red}eval: no fixture set matched ${options.sets.join(', ')}${colors.reset}`);
    finish({ options, startedAt, mode: 'live', sets: [], runners: [], suiteFailureClasses: ['environment-configuration'] });
  }

  const { problems, notices } = validateCorpus(groundTruth);
  for (const notice of notices) console.log(`  ${colors.yellow}drift${colors.reset} ${notice}`);
  if (problems.length > 0) {
    console.error(`${colors.red}the corpus is inconsistent:${colors.reset}`);
    for (const problem of problems) console.error(`  ${colors.red}✗${colors.reset} ${problem}`);
    console.error('');
    // An inconsistent corpus is a real finding about the repository, measured without
    // a model call, so it keeps the exit 1 the sibling harnesses give the same case.
    // No sets are handed to the record: building prompts out of data that just failed
    // validation is how a reporting path turns into a second crash.
    finish({ options, startedAt, mode: validateOnly ? 'validate-only' : 'live', sets: [], runners: [], suiteFailureClasses: ['quality'] });
  }

  const criteriaCount = sets.reduce((sum, set) => sum + (set.criteria ?? []).length, 0);
  console.log(
    `${colors.green}✓${colors.reset} ${sets.length} fixture set(s), ${criteriaCount} criteria; every span resolves and every number recomputes`,
  );

  if (validateOnly) {
    // Staging is exercised here because the ground truth staying out of the agent's
    // workspace is the measurement's validity, and a check that only runs when a model
    // runs is a check nobody runs.
    for (const set of sets) {
      const workspace = stageWorkspace(set);
      try {
        const leaked = [
          ...assertGroundTruthAbsent(workspace.dir),
          ...GROUND_TRUTH_ONLY_TOKENS.filter((token) => buildPrompt(set).includes(token)).map(
            (token) => `prompt carries the ground-truth-only key "${token}"`,
          ),
        ];
        if (leaked.length > 0) {
          console.error(`${colors.red}eval: ${set.id} would hand the agent the answers:${colors.reset}`);
          for (const problem of leaked) console.error(`  ${colors.red}✗${colors.reset} ${problem}`);
          finish({ options, startedAt, mode: 'validate-only', sets: [], runners: [], suiteFailureClasses: ['environment-configuration'] });
        }
        const artifacts = path.join(workspace.projectDir, 'test-artifacts');
        const inherited = ['live-verification-results.json', 'gate-waivers.md'].filter(
          (name) => fs.existsSync(path.join(artifacts, name)) !== Boolean(set.liveResultsFile || set.waiverRegister),
        );
        if (inherited.length > 0) {
          console.error(
            `${colors.red}eval: ${set.id} staged test-artifacts holds the wrong inputs: ${inherited.join(', ')}${colors.reset}`,
          );
          finish({ options, startedAt, mode: 'validate-only', sets: [], runners: [], suiteFailureClasses: ['environment-configuration'] });
        }
        console.log(`  ${colors.green}✓${colors.reset} ${set.id}: staged workspace carries no ground truth and the right test-artifacts`);
      } finally {
        fs.rmSync(workspace.dir, { recursive: true, force: true });
      }
    }
    console.log(`\n${colors.green}corpus valid; nothing measured (--validate-only).${colors.reset}\n`);
    finish({ options, startedAt, mode: 'validate-only', sets, runners: [] });
  }

  const { problems: readiness, versions } = preflight(options);
  if (readiness.length > 0) {
    console.error(`${colors.red}eval pre-flight failed; nothing was measured:${colors.reset}`);
    for (const problem of readiness) console.error(`  - ${problem.message}`);
    console.error(`\n${colors.dim}A failed pre-flight is exit 2, never a 0% score.${colors.reset}`);
    finish({ options, startedAt, mode: 'live', sets, runners: [], suiteFailureClasses: readiness.map((problem) => problem.failureClass) });
  }
  console.log(`${colors.dim}${runs} run(s) per fixture set per agent${colors.reset}\n`);

  const tolerance = groundTruth.evidenceLineTolerance;
  const pctTolerance = groundTruth.coveragePercentTolerance;
  const runners = [];

  for (const agent of agents) {
    console.log(`${colors.cyan}${agent}${colors.reset}`);
    const agentStartedAt = Date.now();
    const totals = {
      statusTotal: 0,
      statusHits: 0,
      discriminatingTotal: 0,
      discriminatingHits: 0,
      gateTotal: 0,
      gateHits: 0,
      arithmeticTotal: 0,
      arithmeticHits: 0,
      gateCriteriaTotal: 0,
      gateCriteriaHits: 0,
      oracleTotal: 0,
      oracleHits: 0,
      citationTotal: 0,
      citationHits: 0,
      rejectedTotal: 0,
      rejectedHits: 0,
      waiverTotal: 0,
      waiverHits: 0,
      waiverSkippedRuns: 0,
      liveTotal: 0,
      liveHits: 0,
      cleanFalsePositives: 0,
      mutations: 0,
    };
    let completedRuns = 0;
    let unstableCases = 0;
    let incompleteCases = 0;
    // Every environment failure across every case, so the runner's class is the worst
    // of them rather than the last one printed.
    const lostRunClasses = [];

    for (const set of sets) {
      const signatures = new Set();
      const caseScores = [];
      for (let runIndex = 0; runIndex < runs; runIndex += 1) {
        const outcome = runCase(set, options, agent, tolerance, pctTolerance);
        if (!outcome.ok) {
          console.error(`  ${colors.red}${set.id} run ${runIndex + 1}: ${outcome.reason}${colors.reset}`);
          lostRunClasses.push(outcome.failureClass);
          continue;
        }
        caseScores.push(outcome.scored);
        totals.mutations += outcome.mutations;
        signatures.add(signatureOf(outcome.scored));
      }

      completedRuns += caseScores.length;
      if (caseScores.length === 0) {
        console.log(`  ${colors.red}${set.id}: no measurable run${colors.reset}`);
        incompleteCases += 1;
        continue;
      }

      for (const scored of caseScores) {
        totals.statusTotal += scored.statusResults.length;
        totals.statusHits += scored.statusResults.filter((item) => item.ok).length;
        const discriminating = scored.statusResults.filter((item) => item.discriminating);
        totals.discriminatingTotal += discriminating.length;
        totals.discriminatingHits += discriminating.filter((item) => item.ok).length;
        totals.gateTotal += 1;
        totals.gateHits += scored.gate.ok ? 1 : 0;
        totals.arithmeticTotal += scored.arithmetic.length;
        totals.arithmeticHits += passed(scored.arithmetic);
        totals.gateCriteriaTotal += scored.gateCriteria.length;
        totals.gateCriteriaHits += passed(scored.gateCriteria);
        totals.oracleTotal += scored.oracleResolution.length;
        totals.oracleHits += passed(scored.oracleResolution);
        totals.citationTotal += scored.citations.total;
        totals.citationHits += scored.citations.resolved;
        totals.rejectedTotal += scored.rejectedEvidence.length;
        totals.rejectedHits += passed(scored.rejectedEvidence);
        if (scored.waivers.scored) {
          totals.waiverTotal += scored.waivers.checks.length;
          totals.waiverHits += passed(scored.waivers.checks);
        } else {
          totals.waiverSkippedRuns += 1;
        }
        totals.liveTotal += scored.live.length;
        totals.liveHits += passed(scored.live);
        totals.cleanFalsePositives += scored.cleanFalsePositives;
      }

      const first = caseScores[0];
      const complete = caseScores.length === runs;
      const stable = signatures.size === 1 && complete;
      const status =
        first.statusResults.every((item) => item.ok) && first.gate.ok
          ? `${colors.green}✓${colors.reset}`
          : `${colors.yellow}•${colors.reset}`;
      console.log(
        `  ${status} ${set.id}: ${first.statusResults.filter((item) => item.ok).length}/${first.statusResults.length} criteria, ` +
          `gate ${first.gate.reported ?? 'none'} (expected ${first.gate.expected}), ` +
          `${stable ? 'stable' : complete ? `${colors.red}${signatures.size} different answers on identical input${colors.reset}` : `${colors.red}only ${caseScores.length}/${runs} runs measured${colors.reset}`}`,
      );
      for (const item of first.statusResults.filter((entry) => !entry.ok)) {
        const flag = item.discriminating ? `${colors.red} (discriminating)${colors.reset}` : '';
        console.log(
          `        ${colors.yellow}${item.id}:${colors.reset} reported ${item.reported ?? 'nothing'}, expected ${item.expected}${flag}`,
        );
      }
      for (const entry of first.invented) console.log(`        ${colors.red}invented criterion:${colors.reset} ${entry}`);
      for (const entry of first.citations.misattributed)
        console.log(`        ${colors.red}cited rejected evidence:${colors.reset} ${entry}`);
      if (!first.waivers.scored) {
        console.log(
          `        ${colors.dim}waiver oracle not scored: fail_only is evaluated against the gate this run derived${colors.reset}`,
        );
      }
      // An unstable answer on complete runs is a measured quality failure. A case short
      // of its runs is an environment failure, and the two must not report through the
      // same channel.
      if (!complete) incompleteCases += 1;
      else if (!stable) unstableCases += 1;
    }

    const measurements = {
      criterionStatusAccuracy: measured(ratio(totals.statusHits, totals.statusTotal)),
      discriminatingCriterionAccuracy: measured(ratio(totals.discriminatingHits, totals.discriminatingTotal)),
      gateAccuracy: measured(ratio(totals.gateHits, totals.gateTotal)),
      gateCriteriaAccuracy: measured(ratio(totals.gateCriteriaHits, totals.gateCriteriaTotal)),
      coverageArithmeticAccuracy: measured(ratio(totals.arithmeticHits, totals.arithmeticTotal)),
      oracleResolutionAccuracy: measured(ratio(totals.oracleHits, totals.oracleTotal)),
      evidenceCitationPrecision: measured(ratio(totals.citationHits, totals.citationTotal)),
      rejectedEvidenceAccuracy: measured(ratio(totals.rejectedHits, totals.rejectedTotal)),
      waiverOracleAccuracy: measured(ratio(totals.waiverHits, totals.waiverTotal)),
      liveEvidenceAccuracy: measured(ratio(totals.liveHits, totals.liveTotal)),
      cleanFalsePositives: totals.cleanFalsePositives,
      unstableCases,
      incompleteCases,
      fixtureMutations: totals.mutations,
      waiverRunsNotScored: totals.waiverSkippedRuns,
    };

    console.log(`  ${colors.dim}────────${colors.reset}`);
    for (const [label, key] of [
      ['criterion status   ', 'criterionStatusAccuracy'],
      ['discriminating     ', 'discriminatingCriterionAccuracy'],
      ['gate decision      ', 'gateAccuracy'],
      ['gate criteria      ', 'gateCriteriaAccuracy'],
      ['coverage arithmetic', 'coverageArithmeticAccuracy'],
      ['oracle resolution  ', 'oracleResolutionAccuracy'],
      ['evidence citations ', 'evidenceCitationPrecision'],
      ['rejected evidence  ', 'rejectedEvidenceAccuracy'],
      ['waiver oracle      ', 'waiverOracleAccuracy'],
      ['live evidence      ', 'liveEvidenceAccuracy'],
    ]) {
      const value = measurements[key] === null ? Number.NaN : measurements[key];
      console.log(`  ${label} ${pct(value)}   (threshold ${pct(THRESHOLDS[key])})`);
    }
    console.log(`  clean false pos.    ${String(totals.cleanFalsePositives).padStart(4)}   (max ${THRESHOLDS.maxCleanFalsePositives})`);
    console.log(`  fixture mutations   ${String(totals.mutations).padStart(4)}   (max ${THRESHOLDS.maxFixtureMutations})`);
    if (totals.waiverSkippedRuns > 0) {
      console.log(
        `  ${colors.yellow}${totals.waiverSkippedRuns} run(s) left the waiver oracle unscored because the gate did not match${colors.reset}`,
      );
    }

    const failures = [];
    for (const key of [
      'criterionStatusAccuracy',
      'discriminatingCriterionAccuracy',
      'gateAccuracy',
      'gateCriteriaAccuracy',
      'coverageArithmeticAccuracy',
      'oracleResolutionAccuracy',
      'evidenceCitationPrecision',
      'rejectedEvidenceAccuracy',
      'liveEvidenceAccuracy',
    ]) {
      const value = measurements[key];
      // NaN fails every comparison, so an unmeasurable metric would otherwise clear a
      // bar it never met. Unmeasurable is a failure, and it says which metric.
      if (value === null) failures.push(`${key} (unmeasurable)`);
      else if (value < THRESHOLDS[key]) failures.push(key);
    }
    // The waiver oracle is the one metric an unmeasurable value does not fail. It is
    // skipped only when the gate did not match, which gateAccuracy has already
    // reported, and failing it again would score one wrong judgment three times.
    if (measurements.waiverOracleAccuracy !== null && measurements.waiverOracleAccuracy < THRESHOLDS.waiverOracleAccuracy) {
      failures.push('waiverOracleAccuracy');
    }
    if (totals.cleanFalsePositives > THRESHOLDS.maxCleanFalsePositives) failures.push('clean false positives');
    if (totals.mutations > THRESHOLDS.maxFixtureMutations) failures.push('fixture mutations');
    if (unstableCases > THRESHOLDS.maxUnstableCases) failures.push(`${unstableCases} unstable case(s)`);

    const expectedRuns = sets.length * runs;
    if (incompleteCases > 0) {
      const failureClass = worstFailureClass([...lostRunClasses, 'environment-incomplete-repetitions']);
      console.log(
        `  ${colors.red}${incompleteCases} case(s) completed fewer than ${runs} declared repetitions; stability is unmeasurable${colors.reset}\n`,
      );
      runners.push(
        runnerRecord(agent, options, versions, {
          expected: expectedRuns,
          completed: completedRuns,
          measurements,
          durationMs: Date.now() - agentStartedAt,
          failureClass,
          failures: [...failures, `${incompleteCases} case(s) short of ${runs} repetitions`],
        }),
      );
      continue;
    }

    if (failures.length > 0) {
      console.log(`  ${colors.red}below threshold: ${failures.join(', ')}${colors.reset}\n`);
    } else {
      console.log(`  ${colors.green}all thresholds met${colors.reset}\n`);
    }

    runners.push(
      runnerRecord(agent, options, versions, {
        expected: expectedRuns,
        completed: completedRuns,
        measurements,
        durationMs: Date.now() - agentStartedAt,
        failureClass: failures.length > 0 ? 'quality' : 'none',
        failures,
      }),
    );
  }

  finish({ options, startedAt, mode: 'live', sets, runners });
}

// Only when invoked directly, so the scoring internals can be exercised and the
// manifest can read THRESHOLDS without spending a vendor run.
if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  loadGroundTruth,
  validateCorpus,
  recomputeExpectations,
  deriveGate,
  expectedRejectedEvidence,
  stageWorkspace,
  assertGroundTruthAbsent,
  buildPrompt,
  caseIndex,
  readSummary,
  readMatrix,
  scoreRun,
  signatureOf,
  THRESHOLDS,
  SUITE_ID,
};
