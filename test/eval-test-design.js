/**
 * Measure `bmad-testarch-test-design` against a corpus whose risks are known.
 *
 * WHAT THIS SUITE IS FOR
 *
 * Fragment selection already measures which knowledge the workflow loads, which is
 * a routing decision taken before the workflow produces anything. Nothing measured
 * the document. A risk register is the easiest artifact in this repository to fake:
 * six categories, a 1-3 scale each way, and a product. A list of nine plausible
 * risks fits any feature ever written, and read on its own it is indistinguishable
 * from an analysis of the feature that was actually supplied.
 *
 * So this suite asks four questions of the document, and each one is answered by a
 * parser rather than by a judge:
 *
 *   grounded      is every risk the epic supports reported, does a risk the epic
 *                 rules out in as many words score as the false positive it is, and
 *                 does the register stay under the ceiling its set declares. What is
 *                 not claimed: a reported row is never tested against the epic text,
 *                 so a risk this fixture did not anticipate is bounded by the
 *                 ceiling and is not otherwise detected
 *   consistent    is every probability and impact on the workflow's own 1-3 scale,
 *                 and is every score the product of the two
 *   ordered       where the fixture ranks one risk above another, do the assigned
 *                 priorities come out in that order
 *   covered       does every material risk reach the coverage plan at a test level
 *                 the fixture admits for it
 *
 * PRIORITY IS NOT SCORED AS A FUNCTION OF THE SCORE
 *
 * It would be easy, and wrong, to assert `score >= 6 implies P0`. The workflow says
 * the opposite in three places it owns: `resources/knowledge/test-priorities-matrix.md`
 * ("Priority is **not derived from** risk score"), `resources/knowledge/probability-impact.md`
 * ("Priority is a separate judgment, not a function of risk score"), and the
 * epic-level template's own per-priority criteria ("Risk score is supporting
 * evidence and is not a required condition"). A suite asserting the derivation
 * would fail a workflow that followed its own rule, which is the most expensive
 * kind of eval to own.
 *
 * What is checkable without taking that position is the ordering. The fixture
 * ranks its material risks by severity, every strictly ordered pair of ranks
 * becomes a constraint, and the constraint is that the more severe risk does not
 * end up with a weaker priority than the less severe one. Equal ranks constrain
 * nothing. A pair where either risk went unreported, or reached no priority
 * section, is not resolvable and leaves the denominator rather than passing for
 * free; a run that resolves no pair at all scores the metric unmeasurable, which
 * is a failure.
 *
 * TWO FIXTURE SETS, NEVER ONE RUN
 *
 * The seeded set is an epic with five material risks and four risks it explicitly
 * rules out. The clean set is an epic whose genuine risk set is small, and its
 * whole job is to stop recall from rewarding a run that reports everything: a
 * suite with only a seeded set is passed by a workflow that emits the same nine
 * risks whatever it is handed. Each set is one staged workspace and one agent
 * call, and the two are never combined, because combining them changes every
 * ratio.
 *
 * THE ANSWERS ARE NEVER IN THE WORKSPACE
 *
 * `ground-truth.json` carries the material risks, the ranks, the admitted coverage
 * and the exclusions. The staged workspace gets the epic and nothing else, and
 * `assertGroundTruthAbsent` checks that on every run and on `--validate-only`,
 * because a check that only runs when a model runs is a check nobody runs.
 *
 * THE RUNNER WRITES ONLY INTO ITS WORKSPACE
 *
 * The suite declares `scoped-artifact-writes`: the deliverable is one document
 * inside the staged workspace. The staged workspace is the authorization's working
 * directory, so the policy confines the run rather than a convention, and the
 * repository's own working tree is compared before and after. A run that reached
 * the repository is not scored.
 *
 * EVERY DECLARED REPETITION MUST COMPLETE
 *
 * Stability is a claim about repeated runs. A case that lost a run has fewer
 * observations than the gate declared, so it is unmeasurable and exits 2.
 *
 * Usage:
 *   node test/eval-test-design.js --validate-only
 *   node test/eval-test-design.js --preflight-only --agent codex
 *   node test/eval-test-design.js --agent claude --runs 2
 *   node test/eval-test-design.js --agent codex --set seeded-offline-order-capture
 *   node test/eval-test-design.js --agent custom --agent-cmd my-runner --agent-arg --headless
 *   node test/eval-test-design.js --agent claude --json results/test-design.json
 *
 * Exit codes:
 *   0  the corpus is valid (--validate-only), the runner is ready (--preflight-only),
 *      or every vendor met the thresholds
 *   1  a threshold was missed, or the corpus is inconsistent (a real result)
 *   2  the environment could not run the eval (nothing was measured): a missing
 *      credential or executable, a timeout, a transport error, a missing or
 *      unparseable document, a runner that wrote outside its workspace, or fewer
 *      completed runs than were declared
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { AGENT_ADAPTERS, resolveModel } = require('../cli/lib/agent-adapters');
const { failureClassForExit } = require('../cli/test-design-runner');
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
  suiteResultRecord,
  writeSuiteResult,
} = require('./lib/eval-record');
const { worstFailureClass, exitCodeForFailureClass } = require('./schema/eval-result');
const { workingTreeState, workingTreeChanges } = require('./lib/runner-capabilities');
const { PROBE_TIMEOUT_MS, boundedProbe } = require('./lib/bounded-probe');
const { createProbePort, hostEnvironment, observedText, probeCommand, probeRequest, targetProblems } = require('./lib/probe-targets');

const PROJECT_ROOT = path.join(__dirname, '..');
const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'test-design-eval');
const GROUND_TRUTH = path.join(FIXTURE_ROOT, 'ground-truth.json');
const SKILL_ROOT = path.join(PROJECT_ROOT, 'src', 'workflows', 'testarch', 'bmad-testarch-test-design');
const SUITE_ID = 'test-design';

// A test-design run reads five step files, the epic and several knowledge
// fragments, and writes one document plus a progress checkpoint. Twenty minutes
// bounds a hang without cutting off a slow but working run, and it is the same
// bound the trace suite settled on for a comparable workload.
const RUN_TIMEOUT_MINUTES = 20;
const RUN_TIMEOUT_MS = RUN_TIMEOUT_MINUTES * 60_000;

/**
 * What the runner is allowed to do, checked against the manifest's declaration by
 * tools/validate-eval-schemas.js the same way THRESHOLDS is. See THE RUNNER WRITES
 * ONLY INTO ITS WORKSPACE in the header.
 */
const RUNNER_CAPABILITIES = ['scoped-artifact-writes'];

/**
 * The command this harness probes, by the names test/lib/probe-targets.js and the
 * test-design contract share.
 */
const TEST_DESIGN_INTERFACE = 'tea-test-design-runner';
const TEST_DESIGN_OPERATION = 'design-fixture-set';

/**
/**
 * The four priorities, strongest first, so a pair's ordering constraint is a
 * numeric comparison.
 *
 * This one list is hardcoded because it is the priority vocabulary itself rather
 * than a fixture claim. The six risk categories and the coverage levels are read
 * off the ground truth, so the fixture and the scorer cannot hold two different
 * lists of either.
 */
const PRIORITY_RANK = { P0: 0, P1: 1, P2: 2, P3: 3 };

/** The lowest and highest value the workflow's probability and impact scales admit. */
const SCALE_MIN = 1;
const SCALE_MAX = 3;

/** A risk id as `checklist.md` declares it: flat, three digits, category-independent. */
const RISK_ID_PATTERN = /^R-\d{3}$/;

/** Every `R-NNN` mention inside a free-text cell, which is how a Risk Link names more than one. */
const RISK_REFERENCE_PATTERN = /R-\d{3}/g;

/**
 * Keys that appear only in the ground truth. A staged file or a prompt carrying one
 * is carrying the answers, whatever else it says.
 */
const GROUND_TRUTH_ONLY_TOKENS = [
  'materialRisks',
  'unsupportedRisks',
  'severityRank',
  'acceptableCoverage',
  'groundingQuote',
  'exclusionQuote',
  'maxRisks',
  // The two keys that carry the matcher vocabulary itself. Neither string occurs in
  // the staged skill tree or in either epic, so naming them costs nothing and closes
  // the one channel through which the matchers could reach the agent.
  'anyOf',
  'exampleDescription',
];

/**
 * The gate. Declared here and in test/evals/suite-manifest.json, and checked equal
 * by tools/validate-eval-schemas.js, so neither side can drift.
 *
 * The three at 1 are arithmetic and vocabulary rather than judgment: a score that
 * is not the product of its own two factors, a probability off a scale the
 * workflow states twice, and a category outside the six it names are defects with
 * no defensible reading. `riskIdWellFormedAccuracy` and `riskLinkResolutionAccuracy`
 * are at 1 for the same reason and because everything downstream keys on the id:
 * a coverage plan pointing at a risk the register does not carry maps nothing.
 *
 * `groundedRiskRecall` and `coverageMappingAccuracy` sit at 0.8 because both are
 * matched by tokens. A risk described in words the fixture did not anticipate is a
 * miss the fixture caused, and four of five is the honest bar for a token matcher
 * over prose. `riskPrecision` is 0.8 for the mirror reason.
 *
 * The three counters are 0 because none of them has a defensible non-zero reading.
 * A risk the epic rules out in as many words is invention whatever the precision
 * ratio comes to; the most severe risk in a set is reported or the analysis missed
 * the thing that mattered most, which a recall floor of 0.8 over five risks cannot
 * see; and a ceiling that tolerates one extra risk is not a ceiling.
 */
const THRESHOLDS = {
  groundedRiskRecall: 0.8,
  riskPrecision: 0.8,
  scaleComplianceAccuracy: 1,
  scoreArithmeticAccuracy: 1,
  categoryValidityAccuracy: 1,
  bandPlacementAccuracy: 1,
  riskIdWellFormedAccuracy: 1,
  riskLinkResolutionAccuracy: 1,
  priorityOrderingAccuracy: 1,
  coverageMappingAccuracy: 0.8,
  maxUnscoredRiskTables: 0,
  maxUngroundedRisks: 0,
  maxTopSeverityMissed: 0,
  maxRiskCeilingExcess: 0,
  maxUnstableCases: 0,
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

/* -------------------------------------------------------------------------- */
/* Arguments                                                                   */
/* -------------------------------------------------------------------------- */

function parseArgs(argv) {
  const agents = [];
  const sets = [];
  const agentArgs = [];
  const envPass = [];
  let runs = 2;
  let validateOnly = false;
  let preflightOnly = false;
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
        const value = argv[index + 1];
        if (!value) fatal(2, '--agent-cmd requires an executable path or name');
        // A path is resolved here, against the operator's working directory. The
        // runner executes in a staged workspace, so a relative path handed through
        // unchanged would resolve against that workspace and fail every run after
        // passing the pre-flight, which probes it from here. A bare name stays a
        // PATH lookup, which is the same everywhere.
        agentCmd = value.includes('/') || value.includes(path.sep) ? path.resolve(value) : value;
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
      case '--preflight-only': {
        preflightOnly = true;
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
  if (validateOnly && preflightOnly) fatal(2, '--validate-only and --preflight-only name different modes; pass one');
  // Stability across one run is not a measurement. Say so rather than printing stable.
  if (runs < 2 && !validateOnly && !preflightOnly) {
    console.error(`${colors.yellow}note${colors.reset}: --runs ${runs} cannot measure stability; use --runs 2 or more.`);
  }
  return { agents, sets, runs, validateOnly, preflightOnly, agentCmd, agentArgs, envPass, model, jsonPath };
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

/**
 * The fixture sets a run covers.
 *
 * @param {object} groundTruth
 * @param {string[]} requested Ids from --set; every set when empty.
 * @returns {object[]}
 */
function selectSets(groundTruth, requested) {
  const sets = groundTruth.fixtureSets ?? [];
  if (requested.length === 0) return sets;
  // An id that matches nothing is refused rather than dropped. A typo in the clean
  // control's id used to skip the control silently, and the run then reported a
  // ceiling excess of zero, which is true and means nothing.
  const known = new Set(sets.map((set) => set.id));
  const unmatched = requested.filter((id) => !known.has(id));
  if (unmatched.length > 0) {
    fatal(2, `--set names no fixture set: ${unmatched.join(', ')}; the corpus holds ${[...known].join(', ')}`);
  }
  return sets.filter((set) => requested.includes(set.id));
}

/** The directory one fixture set is staged under, inside the workspace. */
function projectRootOf(set) {
  return set.projectRoot;
}

/**
 * Where the workflow's epic-level deliverable lands for one set, relative to the
 * workspace root.
 *
 * `steps-c/step-05-generate-output.md` writes `{test_artifacts}/test-design-epic-{epic_num}.md`,
 * and the prompt resolves both placeholders against this set's staged project root.
 * Two sets therefore declare two paths, which is what lets one authorization serve
 * either without the artifact map naming a file the other run wrote.
 */
function designArtifactPaths(set) {
  return { design: path.posix.join(projectRootOf(set), 'test-artifacts', `test-design-epic-${set.epicNum}.md`) };
}

/** Whitespace-collapsed, lowercased text, which is what every token and quote test reads. */
function normalizeText(value) {
  return String(value ?? '')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Does this text satisfy a declared matcher?
 *
 * `anyOf` is a list of groups and every group must contribute at least one token,
 * so the matcher is an AND of ORs. One distinctive word in a risk description is a
 * coincidence; two independent ones are a claim about what the description says.
 *
 * @param {string[][]} groups
 * @param {string} normalized Already through normalizeText.
 * @returns {boolean}
 */
function matchesGroups(groups, normalized) {
  if (!Array.isArray(groups) || groups.length === 0) return false;
  return groups.every((group) => group.some((token) => normalized.includes(String(token).toLowerCase())));
}

/**
 * Every strictly ordered pair of material risks in one set, derived from
 * `severityRank` rather than listed.
 *
 * Derived because a hand-written pair list and a rank table are two statements of
 * one fact, and the pair list is the one nobody updates. Equal ranks produce no
 * pair, which is how the fixture says two risks are not ordered with respect to
 * each other.
 *
 * @param {object} set
 * @returns {Array<{higher: string, lower: string}>} `higher` is the more severe id.
 */
function orderedPairsFor(set) {
  const risks = set.materialRisks ?? [];
  const pairs = [];
  for (const first of risks) {
    for (const second of risks) {
      if (first.severityRank < second.severityRank) pairs.push({ higher: first.id, lower: second.id });
    }
  }
  return pairs;
}

/* -------------------------------------------------------------------------- */
/* Corpus validation                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Check every claim the ground truth makes against the fixtures it names.
 *
 * This is the half of the suite that runs with no credential and no model, and it
 * is where a fixture that claims the epic supports a risk the epic never mentions
 * is caught. Each material risk names the sentence that grounds it and each
 * unsupported risk names the sentence that rules it out; both are checked as
 * substrings with whitespace collapsed, so a quote spanning a wrapped line still
 * resolves and a quote that has drifted does not.
 *
 * The disjointness check is the other half: a matcher that fires on both a
 * grounding quote and an exclusion quote cannot tell a real risk from an invented
 * one, and the whole precision measurement would be noise. It is a floor rather
 * than a proof, because a real risk description is longer than the sentence that
 * grounds it, but a fixture that fails it is definitely broken.
 *
 * @param {object} groundTruth
 * @returns {{problems: string[]}}
 */
function validateCorpus(groundTruth) {
  const problems = [];
  const categories = new Set(groundTruth.riskCategories ?? []);
  const levels = new Set(groundTruth.testLevels ?? []);
  const sets = groundTruth.fixtureSets ?? [];

  if (categories.size === 0) problems.push('ground truth declares no riskCategories');
  if (levels.size === 0) problems.push('ground truth declares no testLevels');
  if (sets.length < 2)
    problems.push(`ground truth declares ${sets.length} fixture set(s); a seeded set and a clean control are both required`);

  const seenIds = new Set();
  const seenProjectRoots = new Set();
  let seededSets = 0;
  let cleanSets = 0;

  for (const set of sets) {
    const where = `${set.id}`;
    if (seenIds.has(set.id)) problems.push(`${where}: duplicate fixture set id`);
    seenIds.add(set.id);
    // Two sets sharing a staged project root send byte-identical prompts, and then
    // no contract leg can ask for the set it means. This is the lesson the trace
    // corpus learned the expensive way; it is checked here rather than assumed.
    if (seenProjectRoots.has(set.projectRoot)) problems.push(`${where}: projectRoot "${set.projectRoot}" is already used by another set`);
    seenProjectRoots.add(set.projectRoot);

    const epicPath = path.join(FIXTURE_ROOT, set.root, set.epicFile);
    if (!fs.existsSync(epicPath)) {
      problems.push(`${where}: epic ${set.root}/${set.epicFile} does not exist`);
      continue;
    }
    const epic = normalizeText(fs.readFileSync(epicPath, 'utf8'));

    const material = set.materialRisks ?? [];
    const unsupported = set.unsupportedRisks ?? [];
    if (material.length > 0) seededSets += 1;
    if (typeof set.maxRisks === 'number') cleanSets += 1;
    // Every set declares a ceiling, so over-reporting is bounded on both. A set
    // with no material risk is the clean control; the seeded corpus is the one that
    // declares them.
    if (typeof set.maxRisks !== 'number' || set.maxRisks < 1) {
      problems.push(`${where}: declares no maxRisks, so the number of risks a run may report is unbounded`);
    } else if (set.maxRisks < material.length) {
      problems.push(
        `${where}: maxRisks is ${set.maxRisks} and the set declares ${material.length} material risk(s), so a correct run exceeds its own ceiling`,
      );
    }
    if (unsupported.length === 0) {
      problems.push(`${where}: declares no unsupportedRisks, so no reported risk on it can ever score as a false positive`);
    }

    const riskIds = new Set();
    for (const risk of material) {
      const label = `${where}/${risk.id}`;
      if (riskIds.has(risk.id)) problems.push(`${label}: duplicate material risk id`);
      riskIds.add(risk.id);
      if (!epic.includes(normalizeText(risk.groundingQuote))) {
        problems.push(`${label}: groundingQuote is not present in ${set.root}/${set.epicFile}`);
      }
      for (const category of risk.categories ?? []) {
        if (!categories.has(category)) problems.push(`${label}: admits category "${category}", which is not one the workflow declares`);
      }
      if ((risk.categories ?? []).length === 0) problems.push(`${label}: admits no category`);
      if (!Number.isInteger(risk.severityRank) || risk.severityRank < 1) {
        problems.push(`${label}: severityRank must be a positive integer, got ${JSON.stringify(risk.severityRank)}`);
      }
      for (const level of risk.acceptableCoverage ?? []) {
        if (!levels.has(level)) problems.push(`${label}: admits coverage level "${level}", which is not one the workflow declares`);
      }
      if ((risk.acceptableCoverage ?? []).length === 0) problems.push(`${label}: admits no coverage level, so it can never be mapped`);
      if (!matchesGroups(risk.anyOf, normalizeText(risk.groundingQuote))) {
        problems.push(`${label}: its own matcher does not fire on its own groundingQuote`);
      }
    }

    for (const risk of unsupported) {
      const label = `${where}/${risk.id}`;
      if (riskIds.has(risk.id)) problems.push(`${label}: id collides with a material risk`);
      riskIds.add(risk.id);
      if (!epic.includes(normalizeText(risk.exclusionQuote))) {
        problems.push(`${label}: exclusionQuote is not present in ${set.root}/${set.epicFile}`);
      }
    }

    // An exclusion sentence says a risk does not apply, so it carries the subject and
    // not the alarm: "charges the stored card reference on its own nightly schedule"
    // grounds no vocabulary a run would use to report a gateway outage. Asking an
    // unsupported matcher to fire on its own exclusion would therefore fail every
    // correctly written entry. What each matcher is held to instead is
    // `exampleDescription`, a risk description a run might plausibly write, which is
    // also what makes the matchers checkably disjoint: every matcher fires on its own
    // example and on nobody else's.
    for (const risk of [...material, ...unsupported]) {
      const label = `${where}/${risk.id}`;
      const example = normalizeText(risk.exampleDescription);
      if (example === '') {
        problems.push(`${label}: declares no exampleDescription, so its matcher is held to nothing`);
        continue;
      }
      if (!matchesGroups(risk.anyOf, example)) problems.push(`${label}: its own matcher does not fire on its own exampleDescription`);
      // An empty group holds against nothing and an empty token holds against
      // everything, so either one makes the matcher's verdict meaningless while the
      // case still scores. Both are refused here rather than left to be noticed by a
      // full-marks run that measured nothing.
      if (!Array.isArray(risk.anyOf) || risk.anyOf.length === 0)
        problems.push(`${label}: declares no token group, so its matcher decides nothing`);
      for (const [groupIndex, group] of (risk.anyOf ?? []).entries()) {
        if (!Array.isArray(group) || group.length === 0) {
          problems.push(`${label}: token group ${groupIndex} is empty, so no row can ever satisfy it`);
          continue;
        }
        for (const token of group) {
          if (typeof token !== 'string' || token.trim().length === 0) {
            problems.push(`${label}: token group ${groupIndex} holds an empty token, which matches every description`);
          }
        }
      }
      for (const other of [...material, ...unsupported]) {
        if (other.id === risk.id) continue;
        if (matchesGroups(other.anyOf, example)) {
          problems.push(`${where}: the matcher for ${other.id} also fires on the exampleDescription of ${risk.id}`);
        }
      }
    }

    if (material.length > 0 && orderedPairsFor(set).length === 0) {
      problems.push(`${where}: every material risk shares one severityRank, so no pairwise ordering constraint exists`);
    }
  }

  if (seededSets === 0) problems.push('no fixture set declares materialRisks, so grounding and coverage cannot be measured');
  if (cleanSets === 0) problems.push('no fixture set is a clean control, so over-reporting cannot be measured');

  return { problems };
}

/* -------------------------------------------------------------------------- */
/* Staging                                                                     */
/* -------------------------------------------------------------------------- */

/** Every file under a root, as workspace-relative paths, in a stable order. */
function filesUnder(root) {
  const found = [];
  const walk = (directory, prefix) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      const relative = prefix ? path.join(prefix, entry.name) : entry.name;
      if (entry.isDirectory()) walk(absolute, relative);
      else if (entry.isFile()) found.push(relative);
    }
  };
  if (fs.existsSync(root)) walk(root, '');
  return found;
}

/** One digest over a named set of files, so a later run can say whether the corpus moved. */
function digestTree(root, relativePaths) {
  return digest(relativePaths.map((relative) => `${relative}\0${fs.readFileSync(path.join(root, relative), 'utf8')}`).join('\u0001'));
}

/**
 * The resolved TEA config one staged set gets.
 *
 * `test_artifacts` points at this workspace only, so the document the workflow
 * writes lands where the authorization's artifact map expects it and nowhere the
 * next case could read it.
 */
function configYaml() {
  return [
    '# Written by test/eval-test-design.js for one staged fixture set.',
    'user_name: tea-eval-harness',
    'project_name: field-service-platform',
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
 *   <projectRoot>/   the fixture set, plus a resolved _bmad/tea/config.yaml
 *   skill/           the bmad-testarch-test-design workflow, copied verbatim
 *
 * The skill sits outside the project root on purpose. Three of its files carry worked
 * risk registers with their own R-001 rows and their own scores, and a fourth carries
 * one numbered from R-002: test-design-template.md, checklist.md,
 * resources/test-design-epic-3.example.md and
 * resources/knowledge/adr-quality-readiness-checklist.md. A project tree containing
 * them would let a run lift its register from the worked example and still read as an
 * analysis of the epic.
 *
 * @param {object} set
 * @returns {{dir: string, projectDir: string, corpusFiles: string[], corpusDigest: string}}
 */
function stageWorkspace(set) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-test-design-eval-'));
  const projectDir = path.join(dir, projectRootOf(set));
  const setRoot = path.join(FIXTURE_ROOT, set.root);

  for (const relative of filesUnder(setRoot)) {
    const target = path.join(projectDir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(setRoot, relative), target);
  }
  // The workflow writes its document and its progress checkpoint here. Neither set
  // brings anything into this directory, so a run cannot inherit a checkpoint.
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
 * This is the measurement's validity, so it is checked rather than assumed: no
 * staged path is named for the ground truth, no staged file carries its bytes, and
 * no staged file carries a key that appears only in it.
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
 * It states the run's configuration and nothing about the answers: no risk is
 * named, no category is suggested, no count is given, and the epic is left to be
 * read the way step-02 reads one.
 *
 * Three values are pinned because leaving them unpinned makes the workflow ask a
 * question, and a headless run that halts on a question is an environment failure
 * rather than a measurement. `step-01-detect-mode.md` halts when the mode is
 * ambiguous and again when `epic_num` is, and its file-based fallback keys on a
 * `sprint-status.yaml` no staged workspace has.
 *
 * `designLevel` is the one configuration value a caller may flip. The harness never
 * does; the test-design contract's sensitivity witness does, because the template
 * renders it into the document's Scope line, so two prompts differing in that one
 * value are the differential that proves the command reads its standard input at
 * all. A differential between the two fixture sets would not do: their documents
 * differ because their staged epics differ, which attributes to the prompt an
 * effect the workspace produced.
 *
 * @param {object} set
 * @param {{designLevel?: string}} [options]
 * @returns {string}
 */
function buildPrompt(set, { designLevel = 'full' } = {}) {
  const root = projectRootOf(set);
  return [
    `You are running the TEA workflow \`bmad-testarch-test-design\` against the project in \`${root}/\`.`,
    '',
    'The workflow is in `skill/`. Read `skill/instructions.md` first, then execute every step file it',
    'names in order, in full, without skipping or reordering. The step files are under `skill/steps-c/`.',
    '',
    '----- run configuration -----',
    'Take mode C (Create). Resolve the workflow placeholders to these values:',
    '',
    `- \`{project-root}\`: \`${root}\``,
    `- \`{config_source}\`: \`${root}/_bmad/tea/config.yaml\``,
    `- \`{test_artifacts}\`: \`${root}/test-artifacts\``,
    '- `{skill-root}`: `skill`',
    '- `mode`: `epic-level`',
    '- `run_scope`: `epic-level`',
    `- \`epic_num\`: \`${set.epicNum}\``,
    `- \`run_key\`: \`epic-${set.epicNum}\``,
    `- \`design_level\`: \`${designLevel}\``,
    '- `tea_execution_mode`: `sequential`',
    '- `tea_capability_probe`: `false`',
    '',
    `The epic is the one document under \`${root}/docs/epics/\`. It is the only requirements source for this`,
    'run; there is no PRD, no architecture document and no sprint status file, and none is missing.',
    '',
    '----- what to produce -----',
    'Write the one deliverable epic-level mode declares:',
    '',
    `- \`${root}/test-artifacts/test-design-epic-${set.epicNum}.md\`, from \`skill/test-design-template.md\`, carrying`,
    '  the risk assessment and the test coverage plan the template lays out, with each risk row stating its',
    '  category, probability, impact and score, and each coverage row naming its test level and the risk it',
    '  covers.',
    '',
    `Do not add, edit, or delete any file under \`${root}/docs/\`. This workflow does not change its inputs,`,
    'and it does not generate tests.',
    '',
    'Do not stop to ask a question. Every value the workflow would otherwise ask for is stated above.',
    '',
    'When you are done, print one line naming the file you wrote. Nothing else you print is read.',
  ].join('\n');
}

/** Every case with the exact prompt it is sent. */
function caseIndex(sets) {
  return sets.map((set) => ({ id: set.id, prompt: buildPrompt(set) }));
}

/**
 * The ids of the cases this suite scores: one per fixture set, which is one staged
 * workspace and one agent call.
 *
 * Read by tools/validate-eval-schemas.js and compared with the manifest's
 * `caseCount`, so a set added to the corpus and not to the manifest fails `npm test`.
 */
function caseIds() {
  return (loadGroundTruth()?.fixtureSets ?? []).map((set) => set.id);
}

/* -------------------------------------------------------------------------- */
/* Document parsing                                                            */
/* -------------------------------------------------------------------------- */

/** One markdown table cell, with the emphasis and code fencing a template seeds stripped off. */
function cellText(value) {
  return String(value ?? '')
    .replaceAll('`', '')
    .replaceAll('**', '')
    .replace(/^\s*\|/, '')
    .trim();
}

/** Split one `| a | b |` line into its cells. */
function tableCells(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cellText(cell));
}

/** Is this the `| --- | --- |` line that separates a header from its rows? */
function isSeparatorRow(line) {
  return /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-');
}

/**
 * Every markdown table in the document, with the headings it sits under.
 *
 * Headings are tracked rather than the table located by index, because the
 * template seeds three risk tables and four coverage tables and a run may merge,
 * split or rename any of them. What a table is, is decided by its own column
 * names; where it sits decides which priority its rows carry.
 *
 * @param {string} text
 * @returns {Array<{headings: string[], header: string[], rows: string[][]}>}
 */
function parseTables(text) {
  const lines = text.split(/\r?\n/);
  const tables = [];
  const headings = [];
  let fenced = false;
  for (let index = 0; index < lines.length; index += 1) {
    // A fenced block is illustration, never the register. The workflow's own
    // knowledge fragments and its worked example are full of them, and
    // resources/test-design-epic-3.example.md is a register the agent is invited
    // to imitate, so a run that quoted one into its own document scored the
    // example's rows as its own and hard-failed three checks for quoting.
    if (/^\s*(?:```|~~~)/.test(lines[index])) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const heading = /^(#{1,6})\s+(.*)$/.exec(lines[index]);
    if (heading) {
      const level = heading[1].length;
      headings.length = Math.min(headings.length, level - 1);
      headings[level - 1] = cellText(heading[2]);
      continue;
    }
    if (!lines[index].trim().startsWith('|')) continue;
    if (index + 1 >= lines.length || !isSeparatorRow(lines[index + 1])) continue;
    const header = tableCells(lines[index]);
    const rows = [];
    let cursor = index + 2;
    while (cursor < lines.length && lines[cursor].trim().startsWith('|')) {
      rows.push(tableCells(lines[cursor]));
      cursor += 1;
    }
    tables.push({ headings: headings.filter(Boolean), header, rows });
    index = cursor - 1;
  }
  return tables;
}

/** The index of the first header cell whose text contains one of these names, or -1. */
function columnIndex(header, names) {
  const exact = header.findIndex((cell) => names.some((name) => cell.toLowerCase() === name.toLowerCase()));
  if (exact !== -1) return exact;
  // Exact equality alone lost a whole register to a decorated header: `| Score (P×I) |`
  // matched neither `Score` nor `Risk Score`, readRisks skipped the table, and the run
  // was reported as an environment failure rather than scored.
  //
  // The fallback is restricted to names of two words or more. A bare `ID` matched the
  // substring inside Validation, Evidence and Guidance, and a bare `Level` matched
  // `Tool / Level` on the QA template's NFR table, so a document with a Score column
  // and no exact `Risk ID` header would have had an arbitrary column read as its ids
  // and every value fail a check that gates at 1.
  const distinctive = names.filter((name) => name.trim().includes(' ') || /[A-Z].*[A-Z]/.test(name));
  return header.findIndex((cell) => distinctive.some((name) => cell.toLowerCase().includes(name.toLowerCase())));
}

/**
 * The score range a section heading declares, or null when it declares none.
 *
 * The epic template bands its three risk tables as `High-Priority Risks (Score ≥6)`,
 * `Medium-Priority Risks (Score 3-4)` and `Low-Priority Risks (Score 1-2)`, and the
 * shipped example spells the same three as `Score 6 or Greater`, `Score 3 to 4` and
 * `Score 1 to 2`. Both forms are read here, because the band a row is filed under is
 * the workflow's own statement about that row's score and a scorer that only read
 * the cells would never notice a score-9 risk sitting under `Score 1-2`.
 *
 * The range is read out of the heading rather than hardcoded, so a run that bands its
 * register differently is held to what it said rather than to what the template says.
 *
 * @param {string} heading
 * @returns {{min: number, max: number}|null}
 */
function scoreBandOf(heading) {
  const text = String(heading ?? '').toLowerCase();
  // A heading that opens with a risk identifier is that risk's own detail section,
  // which the template spells `### R-001: {Risk Description} (Score: 6)`. The exact
  // fallback below would read it as a one-value band and pin every row of any table
  // beneath it to that single score, and band placement gates at 1.
  if (/^\s*\**r-\d{3}\b/.test(text)) return null;
  const after = text.indexOf('score');
  if (after === -1) return null;
  // Only the run of text immediately after the word `score` is read. Scanning the
  // whole heading let any later pair of numbers outrank the declared bound, so
  // "High-Priority Risks (Score >=6) - Sprint 3-4" parsed as the range 3 to 4 and
  // reported three correctly filed risks as misfiled on a threshold of 1.
  const window = text.slice(after + 'score'.length, after + 'score'.length + 28);
  const range = /^[^0-9]{0,6}(\d+)\s*(?:-|–|—|to|through)\s*(\d+)/.exec(window);
  if (range) return { min: Number.parseInt(range[1], 10), max: Number.parseInt(range[2], 10) };
  const atLeast = /^[^0-9]{0,12}(?:>=|≥|at least|of|greater than or equal to)\s*(\d+)/.exec(window);
  if (atLeast) return { min: Number.parseInt(atLeast[1], 10), max: Number.POSITIVE_INFINITY };
  const above = /^[^0-9]{0,6}(\d+)\s*(?:\+|or\s*(?:greater|more|above|higher)|and\s*(?:above|higher|up))/.exec(window);
  if (above) return { min: Number.parseInt(above[1], 10), max: Number.POSITIVE_INFINITY };
  const strictlyAbove = /^[^0-9]{0,6}>\s*(\d+)/.exec(window);
  if (strictlyAbove) return { min: Number.parseInt(strictlyAbove[1], 10) + 1, max: Number.POSITIVE_INFINITY };
  const atMost = /^[^0-9]{0,12}(?:<=|≤|at most|or\s*(?:less|lower|fewer)|and\s*below)\s*(\d+)/.exec(window);
  if (atMost) return { min: 1, max: Number.parseInt(atMost[1], 10) };
  // A bare number after the word is an exact band, which is how "Critical (Score 9)"
  // states one. Without it that heading declared no range and every row under it
  // left the denominator instead of being checked.
  const exact = /^[^0-9]{0,6}(\d+)/.exec(window);
  if (exact) return { min: Number.parseInt(exact[1], 10), max: Number.parseInt(exact[1], 10) };
  return null;
}

/** The innermost score band any of a row's enclosing headings declares. */
function bandFor(headings) {
  for (const heading of headings.toReversed()) {
    const band = scoreBandOf(heading);
    if (band) return { band, heading };
  }
  return null;
}

/** A cell as an integer, or null when it is not one. A range or a word is not a number. */
function integerCell(value) {
  const text = String(value ?? '').trim();
  return /^-?\d+$/.test(text) ? Number.parseInt(text, 10) : null;
}

/**
 * Every risk row the document states, from every table that carries a risk register's
 * columns.
 *
 * A table qualifies when it names a risk id column and a score column. Probability
 * and impact are read when present and recorded as null when they are not, because
 * a register that dropped them is a defect the scale and arithmetic checks should
 * report rather than a table this parser should skip.
 */
function readRisks(tables) {
  const risks = [];
  // A table that names risks and states no score is a register this parser cannot
  // score, and skipping it silently loses the rows in it: a run that put its
  // high-priority risks in a scored table and its low-priority ones in an unscored
  // one had the second half vanish with nothing reported. They are counted so the
  // caller can fail on them.
  const unscored = [];
  for (const table of tables) {
    const idColumn = columnIndex(table.header, ['Risk ID', 'RiskID', 'ID']);
    const scoreColumn = columnIndex(table.header, ['Score', 'Risk Score']);
    if (
      idColumn !== -1 &&
      scoreColumn === -1 &&
      table.rows.some((row) => RISK_ID_PATTERN.test(String(row[idColumn] ?? '').toUpperCase()))
    ) {
      unscored.push({ headings: table.headings, rows: table.rows.length });
    }
    if (idColumn === -1 || scoreColumn === -1) continue;
    const categoryColumn = columnIndex(table.header, ['Category', 'Risk Category']);
    const descriptionColumn = columnIndex(table.header, ['Description', 'Risk', 'Summary']);
    const probabilityColumn = columnIndex(table.header, ['Probability']);
    const impactColumn = columnIndex(table.header, ['Impact']);
    for (const row of table.rows) {
      const rawId = row[idColumn] ?? '';
      // A template row still carrying its own placeholder describes nothing, and
      // counting it would make an unfilled template score as a register.
      if (rawId === '' || /^\{.*\}$/.test(rawId)) continue;
      const id = rawId.toUpperCase();
      risks.push({
        id,
        rawId,
        category: (row[categoryColumn] ?? '').toUpperCase(),
        description: row[descriptionColumn] ?? '',
        probability: integerCell(row[probabilityColumn]),
        impact: integerCell(row[impactColumn]),
        score: integerCell(row[scoreColumn]),
        headings: table.headings,
      });
    }
  }
  risks.unscoredTables = unscored;
  return risks;
}

/**
 * Every coverage row the document states, with the priority of the section it sits in.
 *
 * The priority comes from the nearest heading that opens with P0 through P3, which
 * is how both the template and the shipped example spell a priority section
 * (`### P0 (Critical)` and `### P0: Critical` respectively). A coverage table
 * outside any such section carries no priority, which is itself scored: a risk
 * covered only from there has no priority to order.
 */
function readCoverage(tables) {
  const rows = [];
  for (const table of tables) {
    const levelColumn = columnIndex(table.header, ['Test Level', 'Level']);
    if (levelColumn === -1) continue;
    const linkColumn = columnIndex(table.header, ['Risk Link', 'Risk', 'Risk ID']);
    const priorityHeading = table.headings.toReversed().find((heading) => /^\**P[0-3]\b/.test(heading));
    const priority = priorityHeading ? `P${/^\**P([0-3])\b/.exec(priorityHeading)[1]}` : null;
    for (const row of table.rows) {
      const level = row[levelColumn] ?? '';
      if (level === '' || /^\{.*\}$/.test(level)) continue;
      const linkCell = linkColumn === -1 ? '' : (row[linkColumn] ?? '');
      rows.push({
        level,
        priority,
        riskIds: [...String(linkCell).toUpperCase().matchAll(RISK_REFERENCE_PATTERN)].map((match) => match[0]),
        linkCell,
      });
    }
  }
  return rows;
}

/**
 * One produced document as the two collections the scorer reads.
 *
 * @param {object} artifact The tagged artifact off the observation.
 * @returns {{ok: true, design: object}|{ok: false, failureClass: string, reason: string}}
 */
function readDesign(artifact) {
  if (!artifact || artifact.kind === 'absent') {
    return { ok: false, failureClass: 'environment-missing-artifact', reason: 'no test design document was written' };
  }
  // The adapter tags a stream or file that JSON.parse accepts as `json`. A test
  // design is markdown, so a `json` tag here is a file that is not a design.
  if (artifact.kind !== 'text') {
    return { ok: false, failureClass: 'environment-parser', reason: `the design artifact is tagged ${artifact.kind}, not markdown text` };
  }
  const tables = parseTables(artifact.value);
  const risks = readRisks(tables);
  if (risks.length === 0) {
    return {
      ok: false,
      failureClass: 'environment-parser',
      reason: 'the test design document carries no table with a risk id column and a score column',
    };
  }
  return { ok: true, design: { risks, unscoredTables: risks.unscoredTables ?? [], coverage: readCoverage(tables), text: artifact.value } };
}

/* -------------------------------------------------------------------------- */
/* Scoring                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Whether the document as a whole carries each declared risk's vocabulary.
 *
 * This is deliberately the weaker, document-global reading of the row-scoped
 * grounding the scorer does below, and it exists for one reason: the eval contract
 * can only address this artifact as a whole document, because the workflow declares
 * no machine-readable output beside it. An oracle cannot tell which row a token sits
 * in and cannot do arithmetic at all.
 *
 * So the contract's oracles are paired with exactly this predicate rather than with
 * the row-scoped one, and test/test-contract-oracles.js compares the two on the same
 * evidence. Pairing an oracle with the row-scoped result instead would make the two
 * agree by coincidence on whatever the replay corpus happens to hold, which reads as
 * coverage and holds nothing.
 *
 * @param {object} set
 * @param {string} text The document as written.
 * @returns {Record<string, boolean>} One entry per declared risk, material and unsupported.
 */
function documentMentions(set, text) {
  const normalized = normalizeText(text);
  const mentions = {};
  for (const risk of [...(set.materialRisks ?? []), ...(set.unsupportedRisks ?? [])]) {
    mentions[risk.id] = matchesGroups(risk.anyOf, normalized);
  }
  return mentions;
}

/**
 * How many of a set's most severe material risks went unreported.
 *
 * Severity rank is an ordering, so the most severe risks are the ones sharing the
 * lowest rank. A set with no material risk has none to miss.
 *
 * @param {object} set
 * @param {string[]} missed Ids the run did not report.
 * @returns {number}
 */
function topSeverityMissed(set, missed) {
  const material = set.materialRisks ?? [];
  if (material.length === 0) return 0;
  const top = Math.min(...material.map((risk) => risk.severityRank));
  return material.filter((risk) => risk.severityRank === top && missed.includes(risk.id)).length;
}

/**
 * Score one produced document against one fixture set.
 *
 * The result is the scored object reduced to what a reader can check by hand, which
 * is what the replay corpus stores: per-group counts, and the identity of every
 * check that did not pass. Nothing here reads the clock, the filesystem or the
 * agent, so the same document always scores the same way.
 *
 * @param {object} set
 * @param {object} design From readDesign.
 * @param {Set<string>} categories The six the workflow declares.
 * @returns {object}
 */
function scoreRun(set, design, categories) {
  const { risks, coverage } = design;

  // -- shape: the checks that need no fixture at all ------------------------
  const seenIds = new Set();
  const shape = { rows: risks.length, wellFormedIds: 0, validCategories: 0, inScale: 0, arithmeticOk: 0, banded: 0, bandOk: 0 };
  const shapeFailures = [];
  for (const risk of risks) {
    if (RISK_ID_PATTERN.test(risk.id) && !seenIds.has(risk.id)) shape.wellFormedIds += 1;
    else shapeFailures.push({ id: risk.rawId, check: seenIds.has(risk.id) ? 'duplicate-risk-id' : 'risk-id-format' });
    seenIds.add(risk.id);

    if (categories.has(risk.category)) shape.validCategories += 1;
    else shapeFailures.push({ id: risk.rawId, check: 'category', actual: risk.category });

    const inScale = [risk.probability, risk.impact].every((value) => Number.isInteger(value) && value >= SCALE_MIN && value <= SCALE_MAX);
    if (inScale) shape.inScale += 1;
    else shapeFailures.push({ id: risk.rawId, check: 'scale', probability: risk.probability, impact: risk.impact });

    // Arithmetic is only a question once both factors are on the scale. A row
    // whose probability is missing has already been counted as a scale defect,
    // and counting it twice would report one wrong row as two.
    if (inScale) {
      if (risk.score === risk.probability * risk.impact) shape.arithmeticOk += 1;
      else shapeFailures.push({ id: risk.rawId, check: 'arithmetic', expected: risk.probability * risk.impact, actual: risk.score });
    }

    // The band the row is filed under is the document's own second statement about
    // that row's score, and the two have to agree. A register that bands nothing
    // leaves this denominator empty, which reports as unmeasurable rather than as a
    // pass: the template declares three bands and a document that dropped them has
    // dropped the structure the check reads.
    // Every row is checked, and a row under a heading that declares no range is a
    // band failure. Counting only the rows that sat under a declared range let a
    // single rangeless heading exempt them: `### Medium/Low-Priority Risks`, the
    // literal heading test-design-qa-template.md ships, took the denominator to
    // zero and a score-9 risk filed beneath it scored a clean 100%. `banded` is
    // therefore `rows` and the question is how many of them were placed correctly.
    shape.banded += 1;
    const placed = bandFor(risk.headings);
    if (placed && Number.isInteger(risk.score) && risk.score >= placed.band.min && risk.score <= placed.band.max) shape.bandOk += 1;
    else {
      shapeFailures.push({
        id: risk.rawId,
        check: 'band',
        score: risk.score,
        heading: placed ? placed.heading : null,
        reason: placed ? 'the score falls outside the range its heading declares' : 'no enclosing heading declares a score range',
      });
    }
  }
  // Rows the scale rejected are outside the arithmetic denominator, for the reason
  // above: one wrong row is one failure.
  const arithmeticTotal = shape.inScale;

  // -- risk links resolve ---------------------------------------------------
  const declaredIds = new Set(risks.map((risk) => risk.id));
  const links = { total: 0, resolved: 0, dangling: [] };
  for (const row of coverage) {
    for (const id of row.riskIds) {
      links.total += 1;
      if (declaredIds.has(id)) links.resolved += 1;
      else links.dangling.push(id);
    }
  }

  // -- grounding ------------------------------------------------------------
  // Material risks are matched first and a matched row is consumed, so a row that
  // names a real risk in words an exclusion also uses is never counted twice.
  const material = set.materialRisks ?? [];
  // Maximum matching over the eligible pairs, by augmenting path, rather than
  // first-come assignment in declaration order. One prose row can satisfy two
  // declared risks: "uncapped retry storms during a large backlog sync blow the 30
  // second budget" is eligible for both the retry risk and the backlog risk. Taking
  // the first row per risk let the earlier declaration claim it and left the later
  // one unmatched, so a run that reported both risks correctly scored one of them.
  const eligible = material.map((declared) => {
    const admitted = new Set(declared.categories ?? []);
    return risks
      .map((risk, index) => ({ risk, index }))
      .filter(({ risk }) => admitted.has(risk.category) && matchesGroups(declared.anyOf, normalizeText(risk.description)))
      .map(({ index }) => index);
  });
  const rowToRisk = new Map();
  const augment = (declaredIndex, seen) => {
    for (const rowIndex of eligible[declaredIndex]) {
      if (seen.has(rowIndex)) continue;
      seen.add(rowIndex);
      const held = rowToRisk.get(rowIndex);
      if (held === undefined || augment(held, seen)) {
        rowToRisk.set(rowIndex, declaredIndex);
        return true;
      }
    }
    return false;
  };
  for (const [declaredIndex] of material.entries()) augment(declaredIndex, new Set());

  const riskToRow = new Map([...rowToRisk].map(([rowIndex, declaredIndex]) => [declaredIndex, rowIndex]));
  const matches = [];
  const missed = [];
  for (const [declaredIndex, declared] of material.entries()) {
    const rowIndex = riskToRow.get(declaredIndex);
    if (rowIndex === undefined) missed.push(declared.id);
    else matches.push({ riskId: declared.id, rowId: risks[rowIndex].id });
  }

  // Every row is tested against the exclusions, including a row that matched a
  // material risk. Skipping matched rows rewarded compounding: one row asserting
  // the unencrypted queue and a cross-tenant leak in the same sentence was consumed
  // by the material pass and never tested for the risk the epic rules out, while
  // the same content split across two rows was caught.
  const ungrounded = [];
  for (const risk of risks) {
    const invented = (set.unsupportedRisks ?? []).find((entry) => matchesGroups(entry.anyOf, normalizeText(risk.description)));
    if (invented) ungrounded.push({ unsupportedId: invented.id, rowId: risk.rawId });
  }

  // -- the risk ceiling -----------------------------------------------------
  // Every set declares one, and the threshold on the excess is zero. It was on the
  // clean control alone, which left over-reporting on the seeded set unbounded:
  // four risks the fixture never anticipated could be appended to a correct run and
  // every threshold still passed, because precision counts only the rows matching a
  // risk the epic rules out in as many words and says nothing about invention the
  // fixture did not foresee.
  const ceiling = typeof set.maxRisks === 'number' ? { maxRisks: set.maxRisks, excess: Math.max(0, risks.length - set.maxRisks) } : null;

  // -- coverage mapping -----------------------------------------------------
  // Evaluated over the material risks that were actually reported. A risk the run
  // never named is already a recall miss, and failing its coverage as well would
  // score one omission twice.
  const rowIdFor = new Map(matches.map((entry) => [entry.riskId, entry.rowId]));
  const coverageChecks = [];
  for (const declared of material) {
    const rowId = rowIdFor.get(declared.id);
    if (rowId === undefined) continue;
    const levels = coverage.filter((row) => row.riskIds.includes(rowId)).map((row) => row.level);
    const admitted = new Set((declared.acceptableCoverage ?? []).map((level) => level.toLowerCase()));
    const ok = levels.some((level) => admitted.has(level.toLowerCase()));
    coverageChecks.push({
      riskId: declared.id,
      rowId,
      ok,
      levels,
      reason: ok ? null : levels.length === 0 ? 'no coverage row links this risk' : 'no linked row uses an admitted level',
    });
  }

  // -- priority ordering ----------------------------------------------------
  // The strongest priority any coverage row gives a risk. A risk covered at both P0
  // and P2 is being treated as P0 work, and reading the weakest instead would fail
  // a run for a thorough coverage plan.
  const priorityFor = (rowId) => {
    const ranks = coverage.filter((row) => row.riskIds.includes(rowId) && row.priority !== null).map((row) => PRIORITY_RANK[row.priority]);
    return ranks.length === 0 ? null : Math.min(...ranks);
  };
  // A plan that files every risk at one priority satisfies `higher <= lower` on every
  // pair without ordering anything, so the constraint set is trivially met. Two or
  // more risks reaching a priority, all of them the same one, is an answer the metric
  // cannot read, and it is reported unmeasurable rather than as a perfect score.
  const orderingChecks = [];
  for (const pair of orderedPairsFor(set)) {
    const higherRow = rowIdFor.get(pair.higher);
    const lowerRow = rowIdFor.get(pair.lower);
    const higher = higherRow === undefined ? null : priorityFor(higherRow);
    const lower = lowerRow === undefined ? null : priorityFor(lowerRow);
    if (higher === null || lower === null) {
      // Unresolvable, so it leaves the denominator rather than passing for free.
      orderingChecks.push({ higher: pair.higher, lower: pair.lower, resolvable: false, ok: null });
      continue;
    }
    orderingChecks.push({
      higher: pair.higher,
      lower: pair.lower,
      resolvable: true,
      ok: higher <= lower,
      higherPriority: `P${higher}`,
      lowerPriority: `P${lower}`,
    });
  }

  const resolvedPriorities = new Set(
    material
      .map((declared) => rowIdFor.get(declared.id))
      .filter((rowId) => rowId !== undefined)
      .map((rowId) => priorityFor(rowId))
      .filter((rank) => rank !== null),
  );
  const flattened = resolvedPriorities.size === 1 && orderingChecks.some((check) => check.resolvable);

  return {
    set: set.id,
    mentions: documentMentions(set, design.text),
    shape: { ...shape, arithmeticTotal },
    shapeFailures,
    links,
    grounding: {
      declared: material.length,
      matched: matches.length,
      matches,
      missed,
      // The recall floor is 0.8 and the seeded set declares five material risks, so
      // "four of five" clears it and nothing distinguished a miss of the least
      // severe risk from a miss of the most severe one. The highest-ranked risk in
      // a set is reported or the run fails, whatever recall comes to.
      topSeverityMissed: topSeverityMissed(set, missed),
    },
    ungrounded,
    ceiling,
    coverageChecks,
    orderingChecks,
    flattenedPriorities: flattened,
    unscoredRiskTables: design.unscoredTables ?? [],
  };
}

/**
 * The string main() compares across repetitions to call a case stable.
 *
 * Its contract is that nothing scored is left out and nothing environmental is let
 * in. Two runs of one set sign identically exactly when their results are identical,
 * and a counted fixture mutation always changes the signature.
 */
function signatureOf(scored, mutations) {
  return JSON.stringify([
    scored.set,
    scored.mentions,
    scored.shape,
    scored.shapeFailures,
    scored.links,
    scored.grounding,
    scored.ungrounded,
    scored.ceiling,
    scored.coverageChecks,
    scored.orderingChecks,
    scored.flattenedPriorities,
    scored.unscoredRiskTables,
    mutations,
  ]);
}

/* -------------------------------------------------------------------------- */
/* Running                                                                     */
/* -------------------------------------------------------------------------- */

function runnerOptions(options) {
  const option = { 'timeout-ms': String(RUN_TIMEOUT_MS) };
  if (options.agentCmd) option['agent-cmd'] = options.agentCmd;
  if (options.model) option.model = options.model;
  if (options.agentArgs.length > 0) option['agent-arg'] = [...options.agentArgs];
  if (options.envPass.length > 0) option['env-pass'] = [...options.envPass];
  return option;
}

/**
 * One complete test-design run of one fixture set in a fresh workspace, through
 * eval-quality's command-line adapter.
 *
 * The staged workspace is the authorization's working directory, so the policy is
 * what confines the run rather than a convention, and the document is read off the
 * observation rather than by path. Three outcomes are told apart on the way back,
 * and none of them is a score: a thrown fault carries the class the port's own code
 * derives, a non-zero exit carries the class the runner spelled it as, and a
 * document the run never wrote is `absent` and a missing artifact.
 *
 * @returns {Promise<{ok: true, scored: object, mutations: number}|{ok: false, failureClass: string, reason: string}>}
 */
async function runCase(set, options, agent, runIndex, categories) {
  const workspace = stageWorkspace(set);
  try {
    const leaked = assertGroundTruthAbsent(workspace.dir);
    if (leaked.length > 0) {
      return { ok: false, failureClass: 'environment-configuration', reason: leaked.join('; ') };
    }

    const treeBefore = workingTreeState(PROJECT_ROOT);
    const { port } = await createProbePort({
      cwd: workspace.dir,
      interfaceIds: [TEST_DESIGN_INTERFACE],
      artifacts: { [TEST_DESIGN_INTERFACE]: designArtifactPaths(set) },
      // The operator's own --env-pass, which widens this one authorization by the
      // names it asks for and nothing else. The adapter refuses a request key the
      // authorization does not permit, so the two lists are built from one source.
      environmentKeys: { [TEST_DESIGN_INTERFACE]: options.envPass },
    });
    const result = await probeCommand(
      port,
      probeRequest({
        probeId: `${set.id}-run-${runIndex + 1}`,
        interfaceId: TEST_DESIGN_INTERFACE,
        operationId: TEST_DESIGN_OPERATION,
        option: { ...runnerOptions(options), agent },
        environment: hostEnvironment(TEST_DESIGN_INTERFACE, options.envPass),
        stdin: { kind: 'text', value: buildPrompt(set) },
      }),
      new AbortController().signal,
    );
    // The declared scope is the workspace. A run that reached the repository
    // instead is outside it, and its document is not read. Checked before the
    // result is, because a killed run may have written before it was killed.
    const treeChanges = workingTreeChanges(treeBefore, workingTreeState(PROJECT_ROOT));
    if (treeChanges.length > 0) {
      return {
        ok: false,
        failureClass: 'environment-configuration',
        reason: `the runner changed the repository under a scoped-artifact-writes declaration: ${treeChanges.join(', ')}`,
      };
    }
    // A thrown fault means the probe itself lost the run: a denial, a cap, an
    // abort, or a process that never started.
    if (!result.ok) return { ok: false, failureClass: result.failureClass, reason: result.reason };

    // A non-zero exit is an observation. The runner spells its failure classes as
    // exit codes for exactly this reason, so the class here is the one it derived
    // from the thrown error, with no second table.
    const { observation } = result;
    if (observation.exitCode !== 0) {
      const tail = observedText(observation.stderr).trim().split('\n').filter(Boolean).slice(-3).join(' | ');
      return {
        ok: false,
        failureClass: failureClassForExit(observation.exitCode),
        reason: tail || `tea-test-design-runner exited ${observation.exitCode}`,
      };
    }

    const design = readDesign(observation.artifacts.design);
    if (!design.ok) return design;

    // The workflow states that it does not change its inputs. A run that edited the
    // epic has moved the benchmark, and the next run would be measured against a
    // corpus this one rewrote.
    const mutations = digestTree(workspace.projectDir, workspace.corpusFiles) === workspace.corpusDigest ? 0 : 1;
    const added = filesUnder(workspace.projectDir).filter(
      (relative) =>
        !relative.startsWith(`test-artifacts${path.sep}`) &&
        !relative.startsWith(`_bmad${path.sep}`) &&
        !workspace.corpusFiles.includes(relative),
    );

    return { ok: true, scored: scoreRun(set, design.design, categories), mutations: mutations + added.length };
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
  if (!fs.existsSync(SKILL_ROOT)) report('environment-missing-artifact', `test-design workflow not found at ${SKILL_ROOT}`);
  // The command every run goes through. The adapter spawns the file itself, so a
  // missing executable bit fails the spawn before argv matters, and that is a
  // configuration problem to name here rather than a lost run to classify later.
  for (const problem of targetProblems(PROJECT_ROOT, [TEST_DESIGN_INTERFACE])) report('environment-configuration', problem);

  for (const agent of agents) {
    // The name is checked against the adapter registry before anything is spawned.
    if (!Object.prototype.hasOwnProperty.call(AGENT_ADAPTERS, agent)) {
      report('environment-configuration', `unknown agent "${agent}"; expected one of ${Object.keys(AGENT_ADAPTERS).join(', ')}`);
      continue;
    }
    const executable = agent === 'custom' ? agentCmd : agent;
    const probe = boundedProbe(executable, ['--version']);
    if (probe.ok) {
      versions[agent] =
        String(probe.stdout || '')
          .trim()
          .split('\n')[0] || null;
    } else if (probe.reason === 'failed') {
      report('environment-transport', `agent CLI "${executable}" failed its --version probe (exit ${probe.status})`);
    } else if (probe.reason === 'timeout') {
      report('environment-transport', `agent CLI "${executable}" did not answer --version within ${PROBE_TIMEOUT_MS}ms and was killed`);
    } else {
      report('environment-transport', `agent CLI "${executable}" is not on PATH (${probe.detail})`);
    }
    const credential = agent === 'custom' ? null : missingCredential(agent);
    if (credential) report('environment-authentication', credential);
  }
  return { problems, versions };
}

/* -------------------------------------------------------------------------- */
/* Reporting                                                                   */
/* -------------------------------------------------------------------------- */

const ratio = (numerator, denominator) => (denominator === 0 ? Number.NaN : numerator / denominator);
const mean = (values) => (values.length === 0 ? Number.NaN : values.reduce((sum, value) => sum + value, 0) / values.length);
const pct = (value) => (Number.isNaN(value) ? '  n/a' : `${(value * 100).toFixed(0).padStart(3)}%`);

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

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

async function main() {
  const startedAt = Date.now();
  const options = parseArgs(process.argv.slice(2));
  const { agents, runs, validateOnly, preflightOnly } = options;
  const staticMode = validateOnly ? 'validate-only' : preflightOnly ? 'preflight-only' : 'live';

  console.log(`${colors.cyan}========================================`);
  console.log('tea test-design eval harness');
  console.log(`========================================${colors.reset}\n`);

  const groundTruth = loadGroundTruth();
  if (!groundTruth) {
    console.error(`${colors.red}eval: ground truth at ${GROUND_TRUTH} is missing or not valid JSON${colors.reset}`);
    finish({ options, startedAt, mode: staticMode, sets: [], runners: [], suiteFailureClasses: ['environment-missing-artifact'] });
  }

  const sets = selectSets(groundTruth, options.sets);
  if (sets.length === 0) {
    console.error(`${colors.red}eval: no fixture set matched ${options.sets.join(', ')}${colors.reset}`);
    finish({ options, startedAt, mode: staticMode, sets: [], runners: [], suiteFailureClasses: ['environment-configuration'] });
  }

  const { problems } = validateCorpus(groundTruth);
  if (problems.length > 0) {
    console.error(`${colors.red}the corpus is inconsistent:${colors.reset}`);
    for (const problem of problems) console.error(`  ${colors.red}✗${colors.reset} ${problem}`);
    console.error('');
    // An inconsistent corpus is a real finding about the repository, measured without
    // a model call, so it keeps the exit 1 the sibling harnesses give the same case.
    finish({ options, startedAt, mode: staticMode, sets: [], runners: [], suiteFailureClasses: ['quality'] });
  }

  const materialCount = sets.reduce((sum, set) => sum + (set.materialRisks ?? []).length, 0);
  const unsupportedCount = sets.reduce((sum, set) => sum + (set.unsupportedRisks ?? []).length, 0);
  const pairCount = sets.reduce((sum, set) => sum + orderedPairsFor(set).length, 0);
  console.log(
    `${colors.green}✓${colors.reset} ${sets.length} fixture set(s), ${materialCount} material risk(s), ` +
      `${unsupportedCount} ruled out, ${pairCount} ordering constraint(s); every quote resolves and no matcher overlaps`,
  );

  if (validateOnly || preflightOnly) {
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
          finish({ options, startedAt, mode: staticMode, sets: [], runners: [], suiteFailureClasses: ['environment-configuration'] });
        }
        const artifacts = fs.readdirSync(path.join(workspace.projectDir, 'test-artifacts'));
        if (artifacts.length > 0) {
          console.error(`${colors.red}eval: ${set.id} staged test-artifacts is not empty: ${artifacts.join(', ')}${colors.reset}`);
          finish({ options, startedAt, mode: staticMode, sets: [], runners: [], suiteFailureClasses: ['environment-configuration'] });
        }
        console.log(`  ${colors.green}✓${colors.reset} ${set.id}: staged workspace carries no ground truth and no inherited artifact`);
      } finally {
        fs.rmSync(workspace.dir, { recursive: true, force: true });
      }
    }
    if (validateOnly) {
      console.log(`\n${colors.green}corpus valid; nothing measured (--validate-only).${colors.reset}\n`);
      finish({ options, startedAt, mode: 'validate-only', sets, runners: [] });
    }
  }

  const { problems: readiness, versions } = preflight(options);
  if (readiness.length > 0) {
    console.error(`${colors.red}eval pre-flight failed; nothing was measured:${colors.reset}`);
    for (const problem of readiness) console.error(`  - ${problem.message}`);
    console.error(`\n${colors.dim}A failed pre-flight is exit 2, never a 0% score.${colors.reset}`);
    finish({
      options,
      startedAt,
      mode: staticMode,
      sets,
      runners: [],
      suiteFailureClasses: readiness.map((problem) => problem.failureClass),
    });
  }
  if (preflightOnly) {
    console.log(`${colors.green}✓${colors.reset} runner executable(s) answer --version; built-in credentials checked`);
    console.log(`\n${colors.green}pre-flight only; nothing measured.${colors.reset}\n`);
    finish({ options, startedAt, mode: 'preflight-only', sets, runners: [] });
  }
  console.log(`${colors.dim}${runs} run(s) per fixture set per agent${colors.reset}\n`);

  const categories = new Set(groundTruth.riskCategories);
  const runners = [];

  for (const agent of agents) {
    console.log(`${colors.cyan}${agent}${colors.reset}`);
    const agentStartedAt = Date.now();
    const totals = {
      rows: 0,
      wellFormedIds: 0,
      validCategories: 0,
      inScale: 0,
      banded: 0,
      bandOk: 0,
      arithmeticTotal: 0,
      arithmeticOk: 0,
      linkTotal: 0,
      linkResolved: 0,
      ungrounded: 0,
      ceilingExcess: 0,
      topSeverityMissed: 0,
      unscoredTables: 0,
      mutations: 0,
    };
    const recallRatios = [];
    const precisionRatios = [];
    const coverageRatios = [];
    const orderingRatios = [];
    const repeatedRuns = runs >= 2;
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
        // A throw out of staging, the port or the scorer is one lost run rather than
        // a lost invocation. It used to reach main().catch, which exits 2 with a
        // stack trace, writes no result record even when --json asked for one, and
        // skips every remaining set and agent.
        let outcome;
        try {
          outcome = await runCase(set, options, agent, runIndex, categories);
        } catch (error) {
          outcome = { ok: false, failureClass: 'environment-configuration', reason: `the run threw: ${error?.message ?? error}` };
        }
        if (!outcome.ok) {
          console.error(`  ${colors.red}${set.id} run ${runIndex + 1}: ${outcome.reason}${colors.reset}`);
          lostRunClasses.push(outcome.failureClass);
          continue;
        }
        caseScores.push(outcome.scored);
        totals.mutations += outcome.mutations;
        signatures.add(signatureOf(outcome.scored, outcome.mutations));
      }

      completedRuns += caseScores.length;
      if (caseScores.length === 0) {
        console.log(`  ${colors.red}${set.id}: no measurable run${colors.reset}`);
        incompleteCases += 1;
        continue;
      }

      for (const scored of caseScores) {
        totals.rows += scored.shape.rows;
        totals.wellFormedIds += scored.shape.wellFormedIds;
        totals.validCategories += scored.shape.validCategories;
        totals.inScale += scored.shape.inScale;
        totals.banded += scored.shape.banded;
        totals.bandOk += scored.shape.bandOk;
        totals.arithmeticTotal += scored.shape.arithmeticTotal;
        totals.arithmeticOk += scored.shape.arithmeticOk;
        totals.linkTotal += scored.links.total;
        totals.linkResolved += scored.links.resolved;
        totals.ungrounded += scored.ungrounded.length;
        if (scored.ceiling) totals.ceilingExcess += scored.ceiling.excess;
        totals.topSeverityMissed += scored.grounding.topSeverityMissed;
        totals.unscoredTables += scored.unscoredRiskTables.length;

        // Recall, coverage and ordering are meaned over the runs that can answer
        // them. A set declaring no material risk has no opinion on any of the three,
        // and folding a zero in for it would report the clean control as a failure
        // of the seeded set's measurement.
        if (scored.grounding.declared > 0) recallRatios.push(ratio(scored.grounding.matched, scored.grounding.declared));
        precisionRatios.push(ratio(scored.shape.rows - scored.ungrounded.length, scored.shape.rows));
        if (scored.coverageChecks.length > 0) {
          coverageRatios.push(ratio(scored.coverageChecks.filter((check) => check.ok).length, scored.coverageChecks.length));
        }
        const resolvable = scored.orderingChecks.filter((check) => check.resolvable);
        if (resolvable.length > 0 && !scored.flattenedPriorities) {
          orderingRatios.push(ratio(resolvable.filter((check) => check.ok).length, resolvable.length));
        }
      }

      const first = caseScores[0];
      const complete = caseScores.length === runs;
      // One run cannot be stable or unstable. parseArgs already warns on stderr and
      // the per-case line used to print `stable` anyway, because one signature and a
      // complete set both hold at a single repetition.
      const repeated = runs >= 2;
      const stable = repeated && signatures.size === 1 && complete;
      const clean = first.ungrounded.length === 0 && (first.ceiling?.excess ?? 0) === 0 && first.grounding.missed.length === 0;
      const status = clean ? `${colors.green}✓${colors.reset}` : `${colors.yellow}•${colors.reset}`;
      console.log(
        `  ${status} ${set.id}: ${first.shape.rows} risk(s), ` +
          `${first.grounding.matched}/${first.grounding.declared} grounded, ${first.ungrounded.length} ungrounded, ` +
          `${stable ? 'stable' : repeated ? (complete ? `${colors.red}${signatures.size} different answers on identical input${colors.reset}` : `${colors.red}only ${caseScores.length}/${runs} runs measured${colors.reset}`) : `${colors.yellow}unrepeated${colors.reset}`}`,
      );
      for (const id of first.grounding.missed) console.log(`        ${colors.yellow}missed:${colors.reset} ${id}`);
      for (const entry of first.ungrounded) {
        console.log(`        ${colors.red}ungrounded:${colors.reset} ${entry.rowId} reads as ${entry.unsupportedId}`);
      }
      for (const check of first.coverageChecks.filter((entry) => !entry.ok)) {
        console.log(
          `        ${colors.red}uncovered:${colors.reset} ${check.riskId} (${check.reason}; levels ${check.levels.join(', ') || 'none'})`,
        );
      }
      for (const check of first.orderingChecks.filter((entry) => entry.resolvable && !entry.ok)) {
        console.log(
          `        ${colors.red}out of order:${colors.reset} ${check.higher} at ${check.higherPriority} below ${check.lower} at ${check.lowerPriority}`,
        );
      }
      for (const failure of first.shapeFailures) console.log(`        ${colors.red}${failure.check}:${colors.reset} ${failure.id}`);
      if (first.ceiling && first.ceiling.excess > 0) {
        console.log(
          `        ${colors.red}over-reported:${colors.reset} ${first.shape.rows} risks against a ceiling of ${first.ceiling.maxRisks}`,
        );
      }
      // An unstable answer on complete runs is a measured quality failure. A case short
      // of its runs is an environment failure, and the two must not report through the
      // same channel.
      if (!complete) incompleteCases += 1;
      else if (repeated && !stable) unstableCases += 1;
    }

    const measurements = {
      groundedRiskRecall: measured(mean(recallRatios)),
      riskPrecision: measured(mean(precisionRatios)),
      scaleComplianceAccuracy: measured(ratio(totals.inScale, totals.rows)),
      scoreArithmeticAccuracy: measured(ratio(totals.arithmeticOk, totals.arithmeticTotal)),
      categoryValidityAccuracy: measured(ratio(totals.validCategories, totals.rows)),
      bandPlacementAccuracy: measured(ratio(totals.bandOk, totals.banded)),
      riskIdWellFormedAccuracy: measured(ratio(totals.wellFormedIds, totals.rows)),
      riskLinkResolutionAccuracy: measured(ratio(totals.linkResolved, totals.linkTotal)),
      priorityOrderingAccuracy: measured(mean(orderingRatios)),
      coverageMappingAccuracy: measured(mean(coverageRatios)),
      ungroundedRisks: totals.ungrounded,
      unscoredRiskTables: totals.unscoredTables,
      topSeverityMissed: totals.topSeverityMissed,
      riskCeilingExcess: totals.ceilingExcess,
      // Null rather than 0 on a single repetition: a count of zero reads as measured
      // and nothing was measured.
      unstableCases: repeatedRuns ? unstableCases : null,
      incompleteCases,
      fixtureMutations: totals.mutations,
    };

    console.log(`  ${colors.dim}────────${colors.reset}`);
    for (const [label, key] of [
      ['grounded recall    ', 'groundedRiskRecall'],
      ['risk precision     ', 'riskPrecision'],
      ['scale compliance   ', 'scaleComplianceAccuracy'],
      ['score arithmetic   ', 'scoreArithmeticAccuracy'],
      ['category validity  ', 'categoryValidityAccuracy'],
      ['band placement     ', 'bandPlacementAccuracy'],
      ['risk id well formed', 'riskIdWellFormedAccuracy'],
      ['risk link resolves ', 'riskLinkResolutionAccuracy'],
      ['priority ordering  ', 'priorityOrderingAccuracy'],
      ['coverage mapping   ', 'coverageMappingAccuracy'],
    ]) {
      const value = measurements[key] === null ? Number.NaN : measurements[key];
      console.log(`  ${label} ${pct(value)}   (threshold ${pct(THRESHOLDS[key])})`);
    }
    console.log(`  ungrounded risks     ${String(totals.ungrounded).padStart(3)}   (max ${THRESHOLDS.maxUngroundedRisks})`);
    console.log(`  unscored registers   ${String(totals.unscoredTables).padStart(3)}   (max ${THRESHOLDS.maxUnscoredRiskTables})`);
    console.log(`  top-severity missed  ${String(totals.topSeverityMissed).padStart(3)}   (max ${THRESHOLDS.maxTopSeverityMissed})`);
    console.log(`  over the ceiling     ${String(totals.ceilingExcess).padStart(3)}   (max ${THRESHOLDS.maxRiskCeilingExcess})`);
    console.log(`  fixture mutations    ${String(totals.mutations).padStart(3)}   (max ${THRESHOLDS.maxFixtureMutations})`);

    const failures = [];
    for (const key of [
      'groundedRiskRecall',
      'riskPrecision',
      'scaleComplianceAccuracy',
      'scoreArithmeticAccuracy',
      'categoryValidityAccuracy',
      'bandPlacementAccuracy',
      'riskIdWellFormedAccuracy',
      'riskLinkResolutionAccuracy',
      'priorityOrderingAccuracy',
      'coverageMappingAccuracy',
    ]) {
      const value = measurements[key];
      // NaN fails every comparison, so an unmeasurable metric would otherwise clear a
      // bar it never met. Unmeasurable is a failure, and it says which metric.
      if (value === null) failures.push(`${key} (unmeasurable)`);
      else if (value < THRESHOLDS[key]) failures.push(key);
    }
    if (totals.unscoredTables > THRESHOLDS.maxUnscoredRiskTables) {
      failures.push(`${totals.unscoredTables} risk table(s) state no score, so their rows were never scored`);
    }
    if (totals.ungrounded > THRESHOLDS.maxUngroundedRisks) {
      failures.push(`${totals.ungrounded} risk(s) the epic rules out in as many words`);
    }
    if (totals.topSeverityMissed > THRESHOLDS.maxTopSeverityMissed) {
      failures.push(`${totals.topSeverityMissed} of the most severe risk(s) went unreported`);
    }
    if (totals.ceilingExcess > THRESHOLDS.maxRiskCeilingExcess) failures.push(`${totals.ceilingExcess} risk(s) over the declared ceiling`);
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
//
// A rejected promise is exit 2 with the reason printed. `main` is asynchronous
// because every entry point through eval-quality is, and an unhandled rejection
// would otherwise end the process with no failure class and no record.
if (require.main === module) {
  main().catch((error) => {
    console.error(`${colors.red}eval: ${error?.stack ?? error}${colors.reset}`);
    process.exit(2);
  });
}

module.exports = {
  parseArgs,
  loadGroundTruth,
  selectSets,
  validateCorpus,
  orderedPairsFor,
  matchesGroups,
  normalizeText,
  stageWorkspace,
  assertGroundTruthAbsent,
  designArtifactPaths,
  buildPrompt,
  caseIndex,
  caseIds,
  parseTables,
  scoreBandOf,
  bandFor,
  readRisks,
  readCoverage,
  readDesign,
  scoreRun,
  documentMentions,
  signatureOf,
  PRIORITY_RANK,
  RISK_ID_PATTERN,
  RUNNER_CAPABILITIES,
  THRESHOLDS,
  SUITE_ID,
  TEST_DESIGN_INTERFACE,
  TEST_DESIGN_OPERATION,
};
