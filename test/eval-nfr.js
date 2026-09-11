/**
 * nfr eval harness.
 *
 * `bmad-testarch-nfr` reads an evidence bundle, reads the thresholds a project
 * states for itself, and assigns PASS, CONCERNS, or FAIL to four domains. This
 * measures whether it grounds each of those statuses in the evidence it was
 * handed, against a corpus whose true answers were written from the fixture
 * design and from the workflow's own rules, never from a run.
 *
 * WHY THIS SUITE EXISTS
 *
 * The manifest carried `bmad-testarch-nfr` under `deferred` with one sentence of
 * missing evidence: no fixture with known gaps existed, so an unsupported PASS
 * could not be told from a grounded one. That is the sentence this corpus
 * answers. The headline metric counts unsupported PASS results and its ceiling
 * is zero.
 *
 * HOW A RUN IS DRIVEN
 *
 * `tea-nfr-runner` (cli/nfr-runner.js) is the command, and its whole surface is
 * a prompt on standard input and an agent run in the working directory, so this
 * harness stages the input, assembles the prompt itself, and probes that command
 * through eval-quality's command-line adapter with the staged workspace as the
 * authorization's working directory. The one artifact the workflow leaves behind
 * comes back on the observation as tagged `json`, `text`, or `absent`, which is
 * what lets a file the run never wrote be classified as a missing artifact
 * rather than read through an `existsSync` race. The registry in
 * test/lib/probe-targets.js authorizes the run before a process starts, caps its
 * output, and SIGKILLs it a minute after RUN_TIMEOUT_MS as a backstop; the
 * runner's own --timeout-ms is the clock that classifies.
 *
 * WHAT IS MEASURED
 *
 *   domain status        the four domain statuses against the ground truth, which is the
 *                        semantic judgment the corpus exists to measure
 *   undecidable domains  the two domains the ground truth flags isUndecidable, scored on
 *                        their own because a pooled accuracy hides them
 *   unsupported PASS     a PASS on a domain the corpus marks undecidable, ceiling zero
 *   threshold fidelity   the Threshold line of each domain section, plus whether the run
 *                        recorded any threshold as UNKNOWN at all
 *   overall status       the Gate YAML's own overall_status, one bit per run
 *   domain coverage      a stated status for each of the four domains Step 4 dispatches
 *   duplicate sections   a second, contradictory section for one domain
 *   fabricated evidence  a citation naming a file the bundle does not contain
 *   clean false positives anything reported against the bundle that has no gaps
 *   stability            the same scored answer on identical input, over everything above
 *   fixture mutations    the run must not write into the bundle it was given
 *
 * WHERE A DOMAIN STATUS COMES FROM
 *
 * The workflow's Gate YAML snippet carries `overall_status` and the eight ADR
 * checklist categories. It carries no per-domain block for the four domains Step
 * 4 actually evaluates, so a domain's status is read from its
 * `## <Domain> Assessment` section in `nfr-assessment.md`: the worst status the
 * section records, which is the rollup step-04e already performs over a domain's
 * findings (`skillRuleCitations.domainStatusIsWorstFinding`). This is the same
 * split test/eval-trace.js records. Inventing a JSON artifact for this harness's
 * convenience would score a contract the workflow does not declare, so the gap
 * is recorded rather than papered over.
 *
 * THE GROUND TRUTH IS NEVER IN THE AGENT'S CONTEXT
 *
 * Each case runs in a staged workspace holding one evidence bundle, a resolved
 * TEA config, and a copy of the skill. `ground-truth.json` is not copied, and the
 * pre-flight asserts it: no staged file carries its bytes, no staged path is
 * named for it, and the assembled prompt contains none of the tokens that appear
 * only in it. That is the whole validity of the measurement, so it is an
 * assertion rather than a convention.
 *
 * ONE BUNDLE PER RUN
 *
 * The two bundles are two services with two sets of thresholds. Combining them
 * would put one service's target against another's measurement, so each set is
 * its own workspace, its own agent call, and its own case.
 *
 * THREE MODES
 *
 *   --validate-only   Static. No vendor, no cost, no network. Asserts the corpus is
 *                     internally consistent, that every rule it cites still exists
 *                     under the section it names, that every declared evidence file
 *                     is on disk and nothing else is, and that staging keeps the
 *                     ground truth out of the agent's workspace and prompt.
 *   --preflight-only  The static checks, then the runner: is the agent executable
 *                     on PATH, does it answer --version, does a built-in vendor
 *                     have a credential. Exits before any model call. This is what
 *                     `eval:all --preflight-only` runs, and the argv the suite
 *                     manifest declares as preflightArgs.
 *   default           Spends a vendor run per bundle per repetition. It needs a
 *                     logged-in claude or codex.
 *
 * THE RUNNER WRITES ONLY INTO ITS WORKSPACE
 *
 * The suite manifest declares `scoped-artifact-writes`, and RUNNER_CAPABILITIES
 * below is what the harness applies: the agent runs in a staged, disposable
 * workspace with write tools and no shell, codex under its workspace-write
 * sandbox, and every run is followed by a check that the repository this harness
 * lives in did not change. A run that wrote into the repository is an environment
 * failure and is never scored. The report inside the workspace is the run's
 * deliverable, and a write that touches the bundle is scored by
 * maxFixtureMutations.
 *
 * EVERY DECLARED REPETITION MUST COMPLETE
 *
 * Stability is a claim about repeated runs. A case that lost a run has fewer
 * observations than the gate declared, so it is unmeasurable and exits 2.
 *
 * Usage:
 *   node test/eval-nfr.js --validate-only
 *   node test/eval-nfr.js --preflight-only --agent codex
 *   node test/eval-nfr.js --agent claude --runs 2
 *   node test/eval-nfr.js --agent codex --set clean-atlas-notification-relay
 *   node test/eval-nfr.js --agent custom --agent-cmd my-runner --agent-arg --headless
 *   node test/eval-nfr.js --agent claude --json results/nfr.json
 *
 * Exit codes:
 *   0  the corpus is valid (--validate-only), the runner is ready (--preflight-only),
 *      or every vendor met the thresholds
 *   1  a threshold was missed, or the corpus is inconsistent (a real result)
 *   2  the environment could not run the eval (nothing was measured): a missing
 *      credential or executable, a timeout, a transport error, a missing or
 *      unreadable artifact, a runner that wrote outside its workspace, or fewer
 *      completed runs than were declared
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { AGENT_ADAPTERS, resolveModel } = require('../cli/lib/agent-adapters');
const { fenceDepths, stripFencedCodeBlocks } = require('../cli/lib/parse-report');
const { failureClassForExit } = require('../cli/nfr-runner');
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
const { nowMs, nowIso, elapsedMsSince } = require('./lib/clock');
const { createProbePort, hostEnvironment, observedText, probeCommand, probeRequest, targetProblems } = require('./lib/probe-targets');

const PROJECT_ROOT = path.join(__dirname, '..');
const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'nfr-eval');
const GROUND_TRUTH = path.join(FIXTURE_ROOT, 'ground-truth.json');
const SKILL_ROOT = path.join(PROJECT_ROOT, 'src', 'workflows', 'testarch', 'bmad-testarch-nfr');
const SUITE_ID = 'nfr';

// A complete NFR run reads six step files, the whole evidence bundle, and writes
// one long report, so it is a much longer call than a fragment selection. Twenty
// minutes bounds a hang without cutting off a slow but working run, which is the
// same clock test/eval-trace.js applies to a comparable workflow.
const RUN_TIMEOUT_MINUTES = 20;
const RUN_TIMEOUT_MS = RUN_TIMEOUT_MINUTES * 60_000;

/**
 * What the runner is allowed to do, checked against the manifest's declaration by
 * tools/validate-eval-schemas.js the same way THRESHOLDS is. See THE RUNNER
 * WRITES ONLY INTO ITS WORKSPACE in the header.
 */
const RUNNER_CAPABILITIES = ['scoped-artifact-writes'];

/**
 * The command this harness probes, by the names test/lib/probe-targets.js and the
 * nfr contract share.
 */
const NFR_INTERFACE = 'tea-nfr-runner';
const NFR_OPERATION = 'audit-evidence-bundle';

/** The four domains step-04 dispatches a worker for, in the order the report template lists them. */
const DOMAINS = ['performance', 'security', 'reliability', 'maintainability'];

/** The four statuses nfr-status-definitions.md defines, worst first. */
const STATUS_ORDER = ['FAIL', 'CONCERNS', 'PASS', 'N/A'];
const STATUSES = new Set(STATUS_ORDER);

/**
 * The two rules that make a domain undecidable, which is the property the
 * unsupported-PASS ceiling is defined over.
 *
 * A domain is undecidable when the workflow's own text says the run cannot reach
 * a PASS on the evidence it has: the threshold was never stated, or the evidence
 * for a stated threshold is not in the bundle. Both rules name CONCERNS in as
 * many words, which is why the corpus can demand that exact status rather than
 * merely demand "not PASS". validateCorpus holds `isUndecidable` to this table in
 * both directions, so a domain cannot be flagged undecidable under a rule that
 * does not make it so, and a domain resting on one of these rules cannot quietly
 * drop the flag.
 */
const UNDECIDABLE_RULES = new Set(['undefinedThresholdIsConcerns', 'missingEvidenceIsConcerns']);

/**
 * The threshold each negative control in the corpus reaches a verdict through,
 * keyed by the control's id.
 *
 * ground-truth.json declares what an NFR run must not do and, for each, how a
 * harness would catch it. A control with no row here would be a sentence nothing
 * acts on, so validateCorpus fails when a control has no row, when a row names a
 * control the corpus no longer declares, and when a row names a threshold
 * THRESHOLDS does not carry.
 */
const NEGATIVE_CONTROL_ENFORCEMENT = {
  'prose-claim-is-not-evidence': 'maxUnsupportedPass',
  'no-threshold-invention': 'thresholdFidelityAccuracy',
  'no-evidence-invention': 'maxFabricatedEvidence',
  'no-finding-against-a-clean-bundle': 'maxCleanFalsePositives',
  'evidence-bundle-is-read-only': 'maxFixtureMutations',
};

/**
 * The exclusion each rejected case in the corpus states, as a predicate every
 * fixture set has to satisfy, keyed by the case's id.
 *
 * A later edit that adds a rejected case back contradicts a recorded decision,
 * and validateCorpus is what notices. The same two-way check trace applies: a
 * rejected case with no predicate fails, and a predicate naming no rejected case
 * fails too.
 */
const REJECTED_CASE_EXCLUSIONS = {
  'absent-evidence-bundle': (set) => (set.evidenceFiles ?? []).length >= 3,
  'domain-marked-not-applicable': (set) => Object.values(set.domains ?? {}).every((domain) => domain.expectedStatus !== 'N/A'),
};

/**
 * Keys that appear only in ground-truth.json. Finding one in a staged file or in
 * the prompt means the answers reached the agent, which invalidates the
 * measurement.
 */
//
// `expectedStatus` is deliberately absent from this list and it is the key a
// reader would reach for first. Two Playwright knowledge fragments the workflow
// ships carry `expectedStatus` as an API option, so the token appears in the
// staged skill for a reason that has nothing to do with this corpus and the check
// would fire on every run. The four below appear nowhere in the repository except
// ground-truth.json.
const GROUND_TRUTH_ONLY_TOKENS = ['isUndecidable', 'thresholdTokens', 'expectedOverallStatus', 'mustNotReport'];

/**
 * The words that say what an evidence bundle is for. None of them may appear in a
 * project root, because the root is a directory the agent works in and a run that
 * reads `gapped` in its own path has been told the answer.
 */
const ROLE_WORDS = ['gapped', 'clean', 'control', 'seeded', 'planted', 'undecidable'];

/**
 * The token the workflow spells an absent threshold with, in step-02 ("mark it
 * **UNKNOWN**") and again in nfr-status-definitions.md. It is compared
 * case-sensitively and as a plain substring, which is the one spelling the
 * contract's own oracle can address with `containment`, so the harness and the
 * contract make the identical claim rather than two similar ones.
 */
const UNKNOWN_TOKEN = 'UNKNOWN';

/** File extensions a citation may name. A token with none of these is prose, not a file reference. */
const EVIDENCE_EXTENSIONS = 'json|md|markdown|csv|tsv|yaml|yml|log|txt|html|htm|xml|ts|tsx|js|jsx|png|svg|toml|ini|conf|sarif|lcov|pdf';

/**
 * Thresholds. The same reasoning the three sibling harnesses state: a bar nobody
 * clears teaches nothing and a bar everyone clears teaches nothing. The
 * difference here is that the two ceilings are the point of the suite, so they
 * are zero and the accuracies carry the judgment.
 */
const THRESHOLDS = {
  // Eight domain judgments across the two bundles. 0.875 admits one wrong
  // judgment in the corpus and no more, which is the width of a single
  // defensible disagreement.
  domainStatusAccuracy: 0.875,
  // The two domains the ground truth flags isUndecidable: the gapped bundle's
  // performance, whose threshold is nowhere, and its maintainability, whose
  // evidence is nowhere. Both are the reason the corpus exists, both clear 0.875
  // above on their own, and both rest on a rule the workflow states in as many
  // words, so the bar is 1.
  undecidableDomainAccuracy: 1,
  // Four domain sections per bundle plus one document-level check per bundle: ten
  // checks, and 0.9 admits one. A threshold the bundle states has to be the one
  // the report states, and a threshold the bundle does not state has to be
  // recorded as UNKNOWN rather than supplied.
  thresholdFidelityAccuracy: 0.9,
  // The Gate YAML's own overall_status, one bit per bundle, and a pure function
  // of the four domain statuses once those are right. Anything below 1 means the
  // run published a headline its own sections do not support.
  overallStatusAccuracy: 1,
  // A stated status for each of the four domains Step 4 dispatches a worker for.
  // A report missing a section has left a dispatched domain unreported, and no
  // reading of the workflow admits three; a heading carrying no status the four-
  // value enum recognises leaves it just as unreported, which is why the count is
  // over stated statuses rather than over headings.
  domainCoverage: 1,
  // A PASS on a domain the corpus marks undecidable. This is the headline, and
  // the ceiling is zero because the workflow's own text forbids the judgment
  // outright rather than discouraging it.
  maxUnsupportedPass: 0,
  // A citation naming a file the bundle does not contain. An invented citation is
  // worse than no citation, because it reads as grounding.
  maxFabricatedEvidence: 0,
  // The clean bundle states every threshold and meets every one, so any domain
  // below PASS, any listed evidence gap, and any threshold recorded as UNKNOWN is
  // invented.
  maxCleanFalsePositives: 0,
  // A second section for a domain that already has one. The two state the domain's
  // answer twice and the deliverable no longer says which answer the overall status
  // came from, which is a defect in the artifact rather than a disagreement about a
  // judgment. step-05-generate-report.md names a duplicated section as a thing to
  // consolidate, so the bar is 0 and there is nothing to admit.
  maxDuplicateDomainSections: 0,
  // Identical input must produce the identical scored answer. An audit whose
  // verdict moves on re-run is not an audit.
  //
  // No stored replay case can breach this one and none should be written. A case
  // is unstable when signatureOf differs across the repetitions of one bundle, so
  // breaching it takes two runs of the same workspace; a replay case holds one
  // report. What exercises it is the repetition loop in main(), at --runs 2 or
  // more, and test/test-eval-replay.js's checkNfrSignatures, which holds
  // signatureOf to covering everything scored and nothing environmental.
  maxUnstableCases: 0,
  // The workflow audits evidence and produces none. A run that writes into the
  // bundle has changed the benchmark, which the corpus names as a negative
  // control.
  //
  // No stored replay case can breach this one either. A mutation is a difference
  // between the digest of the staged bundle before the run and after it, and a
  // replay corpus has no workspace to stage. What exercises it is runCase's
  // digestTree comparison plus its scan for added files, over a real run.
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
        // runner executes in a staged workspace, so a relative path handed
        // through unchanged would resolve against that workspace and fail every
        // run after passing the pre-flight, which probes it from here. A bare
        // name stays a PATH lookup, which is the same everywhere.
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

/** The fixture sets to run, filtered by --set when it was given. */
function selectSets(groundTruth, requested) {
  const all = groundTruth.fixtureSets ?? [];
  if (requested.length === 0) return all;
  return all.filter((set) => requested.includes(set.id));
}

/**
 * The worst of a list of statuses, which is how step-04e aggregates a set of
 * findings into one status: FAIL when any is FAIL, CONCERNS when any is CONCERNS,
 * PASS otherwise. N/A is the absence of a judgment and never wins, so a section
 * whose every finding is N/A resolves to N/A and anything else ignores it.
 *
 * @param {string[]} statuses
 * @returns {string|null} Null for an empty list, which is a section that recorded no status at all.
 */
function rollupStatus(statuses) {
  const known = statuses.filter((status) => STATUSES.has(status));
  if (known.length === 0) return null;
  for (const candidate of STATUS_ORDER) {
    if (known.includes(candidate)) return candidate;
  }
  return null;
}

/**
 * The overall status the four domain statuses produce, by the checklist's own
 * gate rules: a FAIL domain is a release blocker, a CONCERNS domain is a warning,
 * and PASS requires every domain to pass.
 *
 * @param {string[]} statuses
 * @returns {string|null}
 */
function deriveOverallStatus(statuses) {
  return rollupStatus(statuses);
}

/** The domain statuses one fixture set expects, in DOMAINS order. */
function expectedDomainStatuses(set) {
  return DOMAINS.map((domain) => set.domains?.[domain]?.expectedStatus ?? null);
}

/* -------------------------------------------------------------------------- */
/* Corpus validation                                                           */
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
 * Static validation of the corpus. This is what a pull request runs, and it is
 * what stops the ground truth from rotting into assertions about rules that moved
 * out of the files they were quoted from.
 *
 * Problems are hard failures. Notices are recorded and printed without failing,
 * and they are reserved for a citation's line span: the section name is the stable
 * anchor and the line numbers drift whenever a step file is edited.
 *
 * @param {object} groundTruth
 * @returns {{problems: string[], notices: string[]}}
 */
function validateCorpus(groundTruth) {
  const problems = [];
  const notices = [];

  const declaredDomains = groundTruth.domains ?? [];
  if (JSON.stringify([...declaredDomains].sort()) !== JSON.stringify([...DOMAINS].sort())) {
    problems.push(`domains declares [${declaredDomains.join(', ')}], this harness scores [${DOMAINS.join(', ')}]`);
  }

  const citations = groundTruth.skillRuleCitations ?? {};
  // Every rule the corpus rests a status on has to still exist under the section
  // it names. A status whose rule has moved out of the file is an opinion, and
  // the whole discipline of this corpus is that no status is an opinion.
  for (const [key, citation] of Object.entries(citations)) {
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
    // The heading existing is not the rule existing. A section gutted to its
    // title passed every check above, because the line span is a notice by
    // design and a heading is cheap to keep. `requiredPhrase` is a short
    // verbatim fragment of the rule itself, so deleting what the rule says fails
    // here rather than drifting past. That is the question this corpus has to be
    // able to answer: if the behaviour a status rests on is reverted, something
    // in the tree goes red without a model call.
    if (typeof citation.requiredPhrase !== 'string' || citation.requiredPhrase.trim().length === 0) {
      problems.push(`skillRuleCitations.${key}: declares no requiredPhrase, so nothing holds the cited section to still stating the rule`);
    } else {
      const phraseSection = sectionRange(lines, citation.section);
      const body = phraseSection ? lines.slice(phraseSection.start, phraseSection.end).join('\n') : '';
      if (!body.includes(citation.requiredPhrase)) {
        problems.push(
          `skillRuleCitations.${key}: section "${citation.section}" no longer contains ${JSON.stringify(citation.requiredPhrase)}, so the rule this corpus rests on is gone`,
        );
      }
    }
    const [start, end] = String(citation.lines).split('-').map(Number);
    const last = Number.isFinite(end) ? end : start;
    if (!Number.isFinite(start) || last > lines.length) {
      notices.push(`skillRuleCitations.${key}: cites lines ${citation.lines}, ${citation.file} has ${lines.length}`);
      continue;
    }
    const section = sectionRange(lines, citation.section);
    if (section && (start < section.start || last > section.end)) {
      notices.push(
        `skillRuleCitations.${key}: cites ${citation.file}:${citation.lines}, section "${citation.section}" now spans ${section.start}-${section.end}`,
      );
    }
  }

  if (!Array.isArray(groundTruth.fixtureSets) || groundTruth.fixtureSets.length === 0) {
    problems.push('fixtureSets is missing or empty');
    return { problems, notices };
  }

  const seenSetIds = new Set();
  const seenProjectRoots = new Set();
  let undecidableTotal = 0;
  for (const set of groundTruth.fixtureSets) {
    const label = `fixtureSets[${set.id || '(no id)'}]`;
    if (!set.id) problems.push(`${label}: no id`);
    if (seenSetIds.has(set.id)) problems.push(`${label}: duplicate id`);
    seenSetIds.add(set.id);

    // The project root is what makes a bundle an addressable input: the prompt is
    // written against it, so a plan step that names one is asking for that
    // bundle. Two sets sharing a root would send one prompt and nothing would
    // tell their steps apart. A root naming the set's role would hand the run the
    // answer.
    if (set.projectRoot) {
      if (seenProjectRoots.has(set.projectRoot)) problems.push(`${label}: duplicate projectRoot "${set.projectRoot}"`);
      seenProjectRoots.add(set.projectRoot);
      if (!/^[a-z\d]+(?:-[a-z\d]+)*$/.test(set.projectRoot)) {
        problems.push(`${label}: projectRoot "${set.projectRoot}" is not a lowercase hyphenated directory name`);
      }
      for (const role of ROLE_WORDS) {
        if (set.projectRoot.includes(role)) problems.push(`${label}: projectRoot "${set.projectRoot}" names the set's role ("${role}")`);
      }
    } else {
      problems.push(`${label}: projectRoot is not declared`);
    }

    // The declared evidence list is held equal to what is on disk in both
    // directions. One direction alone lets a file be shipped that the corpus
    // never describes, which is an input the ground truth says nothing about, or
    // a described file nobody ships, which is a citation target that resolves to
    // nothing.
    const setRoot = set.root ? path.join(FIXTURE_ROOT, set.root) : null;
    if (!setRoot || !fs.existsSync(setRoot)) {
      problems.push(`${label}: root ${set.root ?? '(not declared)'} does not exist under test/fixtures/nfr-eval/`);
    } else {
      const onDisk = filesUnder(setRoot).map((relative) => relative.split(path.sep).join('/'));
      const declared = [...(set.evidenceFiles ?? [])].sort();
      for (const relative of declared) {
        if (!onDisk.includes(relative)) problems.push(`${label}: evidenceFiles names ${relative}, which is not under ${set.root}/`);
      }
      for (const relative of onDisk) {
        if (!declared.includes(relative))
          problems.push(`${label}: ${set.root}/${relative} is staged and evidenceFiles does not declare it`);
      }
      // Required and non-empty, rather than checked only when truthy. An empty
      // string satisfies a presence test and then names no file, so the guarded
      // form skipped the check entirely on the one value it exists to catch.
      // That shape was found four times across three suites in one night, in a
      // token set, a schema branch, a deciding token and a repository path.
      if (typeof set.thresholdSource !== 'string' || set.thresholdSource.trim().length === 0) {
        problems.push(`${label}: thresholdSource is missing or empty, so nothing names where this bundle states its thresholds`);
      } else if (!onDisk.includes(set.thresholdSource)) {
        problems.push(`${label}: thresholdSource ${set.thresholdSource} is not a file in this bundle`);
      }
    }

    const domains = set.domains ?? {};
    for (const name of DOMAINS) {
      const domain = domains[name];
      const domainLabel = `${label}.domains.${name}`;
      if (!domain) {
        problems.push(`${domainLabel}: is not declared, and Step 4 dispatches a worker for it`);
        continue;
      }
      if (!STATUSES.has(domain.expectedStatus)) {
        problems.push(`${domainLabel}: expectedStatus "${domain.expectedStatus}" is outside the four-value enum`);
      }
      if (!citations[domain.rule]) {
        problems.push(`${domainLabel}: rule "${domain.rule}" names no entry in skillRuleCitations`);
      }
      // The flag and the rule are one claim spelled twice, so they are held
      // equal. A domain flagged undecidable under a rule that does not make it so
      // would put a ceiling of zero behind a judgment the workflow permits.
      const undecidable = domain.isUndecidable === true;
      if (undecidable !== UNDECIDABLE_RULES.has(domain.rule)) {
        problems.push(
          `${domainLabel}: isUndecidable is ${undecidable} and rule "${domain.rule}" is ${UNDECIDABLE_RULES.has(domain.rule) ? '' : 'not '}one of [${[...UNDECIDABLE_RULES].join(', ')}]`,
        );
      }
      if (undecidable) {
        undecidableTotal += 1;
        if (domain.expectedStatus !== 'CONCERNS') {
          problems.push(`${domainLabel}: is undecidable and expects ${domain.expectedStatus}; both rules name CONCERNS in as many words`);
        }
      }
      if (domain.thresholdStated === true && (domain.thresholdTokens ?? []).length === 0) {
        problems.push(`${domainLabel}: states a threshold and declares no thresholdTokens, so nothing checks the reported threshold`);
      }
      if (domain.thresholdStated === false && (domain.thresholdTokens ?? []).length > 0) {
        problems.push(`${domainLabel}: states no threshold and still declares thresholdTokens`);
      }
      for (const token of domain.thresholdTokens ?? []) {
        // An empty or blank token is the vacuous case: `includes('')` holds
        // against every string, so a domain carrying one scores full threshold
        // fidelity having compared nothing. A token set is a claim about what the
        // report has to say, and a claim that every report satisfies is not one.
        if (typeof token !== 'string' || token.trim().length === 0) {
          problems.push(`${domainLabel}: thresholdTokens carries an empty token, which every report satisfies and nothing measures`);
          continue;
        }
        if (token !== token.toLowerCase()) {
          problems.push(`${domainLabel}: thresholdToken "${token}" is not lowercase, and the comparison lowercases the report`);
        }
      }

      // The typed domain status exists to be compared with what its criteria roll
      // up to. The harness scores the recomputed value, so a mistake in the
      // corpus is caught here rather than scored against a run.
      const criteria = domain.criteria ?? [];
      if (criteria.length === 0) {
        problems.push(`${domainLabel}: declares no criteria, so the declared status rolls up from nothing`);
        continue;
      }
      for (const criterion of criteria) {
        if (!STATUSES.has(criterion.expectedStatus)) {
          problems.push(`${domainLabel}: criterion "${criterion.name}" has status "${criterion.expectedStatus}"`);
        }
        for (const relative of criterion.evidence ?? []) {
          if (!(set.evidenceFiles ?? []).includes(relative)) {
            problems.push(`${domainLabel}: criterion "${criterion.name}" cites ${relative}, which the bundle does not carry`);
          }
        }
        // A criterion the corpus expects to PASS on no evidence is the exact
        // mistake this suite exists to catch, so the corpus may not contain one.
        if (criterion.expectedStatus === 'PASS' && (criterion.evidence ?? []).length === 0) {
          problems.push(`${domainLabel}: criterion "${criterion.name}" expects PASS and cites no evidence`);
        }
      }
      const rolled = rollupStatus(criteria.map((criterion) => criterion.expectedStatus));
      if (rolled !== domain.expectedStatus) {
        problems.push(`${domainLabel}: expectedStatus is ${domain.expectedStatus}, its criteria roll up to ${rolled}`);
      }
    }

    const overall = deriveOverallStatus(expectedDomainStatuses(set));
    if (set.expectedOverallStatus !== overall) {
      problems.push(`${label}: expectedOverallStatus is ${set.expectedOverallStatus}, the four domain statuses give ${overall}`);
    }
    // A bundle stating every threshold must expect no UNKNOWN anywhere, and a
    // bundle leaving one unstated must expect exactly that word. The two are the
    // same claim read from the two sides.
    const anyUnstated = DOMAINS.some((name) => domains[name]?.thresholdStated === false);
    if (set.expectedUnknownThresholdDeclared !== anyUnstated) {
      problems.push(
        `${label}: expectedUnknownThresholdDeclared is ${set.expectedUnknownThresholdDeclared} and ${anyUnstated ? 'a domain states no threshold' : 'every domain states its threshold'}`,
      );
    }
  }

  // A corpus with no undecidable domain measures nothing this suite exists for,
  // and one whose every set is undecidable has no control.
  if (undecidableTotal === 0) {
    problems.push('no domain in any fixture set is undecidable, so an unsupported PASS is not expressible in this corpus');
  }
  const cleanSets = groundTruth.fixtureSets.filter((set) => expectedDomainStatuses(set).every((status) => status === 'PASS'));
  if (cleanSets.length === 0) {
    problems.push('no fixture set expects four PASS results, so a workflow that never passes anything would clear this suite');
  }

  // Every negative control the corpus declares is enforced by a threshold this
  // harness applies, and every enforcement row names a control the corpus still
  // declares.
  const controls = groundTruth.negativeControls ?? [];
  for (const control of controls) {
    const key = NEGATIVE_CONTROL_ENFORCEMENT[control.id];
    if (!key) {
      problems.push(
        `negativeControls[${control.id ?? '(no id)'}]: no row in NEGATIVE_CONTROL_ENFORCEMENT names the threshold that enforces it`,
      );
    } else if (!Object.hasOwn(THRESHOLDS, key)) {
      problems.push(
        `negativeControls[${control.id}]: NEGATIVE_CONTROL_ENFORCEMENT names threshold "${key}", which THRESHOLDS does not declare`,
      );
    }
  }
  for (const id of Object.keys(NEGATIVE_CONTROL_ENFORCEMENT)) {
    if (!controls.some((control) => control.id === id)) {
      problems.push(`NEGATIVE_CONTROL_ENFORCEMENT names "${id}", which negativeControls does not declare`);
    }
  }

  // Every rejected case is an exclusion every fixture set has to satisfy.
  const rejected = groundTruth.rejectedCases ?? [];
  for (const entry of rejected) {
    const holds = REJECTED_CASE_EXCLUSIONS[entry.id];
    if (!holds) {
      problems.push(`rejectedCases[${entry.id ?? '(no id)'}]: no predicate in REJECTED_CASE_EXCLUSIONS checks the exclusion`);
      continue;
    }
    for (const set of groundTruth.fixtureSets) {
      if (!holds(set)) problems.push(`rejectedCases[${entry.id}]: fixtureSets[${set.id}] carries the case the corpus says it rejects`);
    }
  }
  for (const id of Object.keys(REJECTED_CASE_EXCLUSIONS)) {
    if (!rejected.some((entry) => entry.id === id)) {
      problems.push(`REJECTED_CASE_EXCLUSIONS names "${id}", which rejectedCases does not declare`);
    }
  }

  return { problems, notices };
}

/* -------------------------------------------------------------------------- */
/* Workspace staging                                                           */
/* -------------------------------------------------------------------------- */

/** Digest of a file list, keyed by relative path so a rename shows up. */
function digestTree(root, relativePaths) {
  const parts = [];
  for (const relative of [...relativePaths].sort()) {
    try {
      parts.push(relative, fs.readFileSync(path.join(root, relative)));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      parts.push(relative, '\0missing', relative);
    }
  }
  return digest(parts);
}

/**
 * The one artifact the runner leaves behind, as the authorization's artifact map
 * names it.
 *
 * The path is relative to the authorization's working directory, which is the
 * staged workspace, so it names the bundle's own project root rather than the
 * workflow's default of `test-artifacts/` under a project root that is the
 * working directory.
 *
 * @param {object} set
 * @returns {{report: string}}
 */
function nfrArtifactPaths(set) {
  return { report: path.join(set.projectRoot, 'test-artifacts', 'nfr-assessment.md') };
}

/** The resolved TEA config the staged run reads its placeholders from. */
function configYaml(set) {
  return [
    '# Written by test/eval-nfr.js for one staged evidence bundle.',
    '# test_artifacts points inside this workspace only, so the report the run writes',
    '# lands beside the bundle it audited and nowhere else.',
    'user_name: tea-eval-harness',
    `project_name: ${set.projectRoot}`,
    'communication_language: English',
    'document_output_language: English',
    'output_folder: docs',
    'test_artifacts: test-artifacts',
    '# The browser-evidence branch in step-03 is off: this audit reads the bundle it was given and',
    '# collects nothing live, which is what makes two runs of one bundle comparable.',
    'tea_browser_automation: none',
    '# Sequential keeps the four domain workers in this process. A subagent mode would have them write',
    '# under /tmp, outside the workspace the capability declaration scopes the run to.',
    'tea_execution_mode: sequential',
    'tea_capability_probe: false',
    '',
  ].join('\n');
}

/**
 * Stage one evidence bundle into a disposable workspace.
 *
 * Layout, with the workspace itself as the agent's working directory:
 *
 *   <projectRoot>/   the bundle, plus a resolved _bmad/tea/config.yaml
 *   skill/           the bmad-testarch-nfr workflow, copied verbatim
 *
 * The project root is the set's own, so the prompt that names it says which
 * bundle the run audits. The skill sits outside the project root on purpose: its
 * step files and knowledge fragments carry example evidence and example
 * thresholds, and a bundle that contained them would feed the audit numbers that
 * are not the service's.
 *
 * @param {object} set
 * @returns {{dir: string, projectDir: string, bundleFiles: string[], bundleDigest: string}}
 */
function stageWorkspace(set) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-nfr-eval-'));
  const projectDir = path.join(dir, set.projectRoot);
  const setRoot = path.join(FIXTURE_ROOT, set.root);

  for (const relative of filesUnder(setRoot)) {
    const target = path.join(projectDir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(setRoot, relative), target);
  }

  fs.mkdirSync(path.join(projectDir, 'test-artifacts'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, '_bmad', 'tea'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, '_bmad', 'tea', 'config.yaml'), configYaml(set), 'utf8');

  for (const relative of filesUnder(SKILL_ROOT)) {
    const target = path.join(dir, 'skill', relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(SKILL_ROOT, relative), target);
  }

  // The bundle files the run must leave alone. test-artifacts and _bmad are
  // excluded because the run legitimately writes into the first and the harness
  // wrote the second.
  const bundleFiles = filesUnder(projectDir).filter(
    (relative) => !relative.startsWith(`test-artifacts${path.sep}`) && !relative.startsWith(`_bmad${path.sep}`),
  );
  return { dir, projectDir, bundleFiles, bundleDigest: digestTree(projectDir, bundleFiles) };
}

/**
 * Assert the staged workspace holds no part of the ground truth.
 *
 * This is the measurement's validity, so it is checked rather than assumed: no
 * staged path is named for the ground truth, no staged file carries its bytes,
 * and no staged file carries a key that appears only in it.
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
 * The prompt one evidence bundle gets.
 *
 * Every path is relative to the workspace, which keeps the text identical across
 * runs and machines and makes its digest something a later run can compare with.
 *
 * It states the run's configuration and nothing about the answers: no domain is
 * named with a status, no threshold is quoted, no evidence file is pointed at,
 * and the bundle is left to be discovered the way step-01 and step-03 discover
 * one.
 *
 * The one fact about the bundle the prompt carries is its project root, which the
 * whole prompt is written against. That is what makes the bundle an addressable
 * input: two bundles send two prompts, so a plan step can ask for the one it
 * means. The name carries the service and not the bundle's role.
 *
 * `customCategories` is the one configuration value a caller may vary. The
 * harness never does; the nfr contract's sensitivity witness does, because
 * step-02 adds any `custom_nfr_categories` it is given to the categories it
 * elicits and the report template carries a section for them, so two prompts
 * differing in that one value produce two reports that differ in whether the
 * category is named at all.
 *
 * @param {object} set
 * @param {{customCategories?: string[]}} [options]
 * @returns {string}
 */
function buildPrompt(set, { customCategories = [] } = {}) {
  const root = set.projectRoot;
  return [
    `You are running the TEA workflow \`bmad-testarch-nfr\` against the project in \`${root}/\`.`,
    '',
    'The workflow is in `skill/`. Read `skill/instructions.md` first, then execute every step file it',
    'names in order, in full, without skipping or reordering. The step files are under `skill/steps-c/`.',
    '',
    '----- run configuration -----',
    'Resolve the workflow placeholders to these values:',
    '',
    `- \`{project-root}\`: \`${root}\``,
    `- \`{config_source}\`: \`${root}/_bmad/tea/config.yaml\``,
    `- \`{test_artifacts}\`: \`${root}/test-artifacts\``,
    '- `{skill-root}`: `skill`',
    `- \`custom_nfr_categories\`: \`${customCategories.join(',')}\``,
    '',
    `The NFR requirements and the thresholds for this service are stated under \`${root}/docs/\`. The`,
    `evidence to audit them against is what you find under \`${root}/\`. Discover both the way step-01`,
    'and step-03 say to; nothing outside that directory is evidence about this service.',
    '',
    '----- what to produce -----',
    `Write \`${root}/test-artifacts/nfr-assessment.md\` from \`skill/nfr-report-template.md\`, carrying:`,
    '',
    '- one `## <Domain> Assessment` section for each of Performance, Security, Reliability, and',
    '  Maintainability, in that order;',
    '- inside each section, one finding per dimension the workflow evaluates, each stating its',
    '  `**Status:**`, its `**Threshold:**`, its `**Actual:**`, and its `**Evidence:**`;',
    `- an evidence citation that names the file it rests on, by a path under \`${root}/\`;`,
    '- the `## Evidence Gaps` section the template declares; and',
    '- the Gate YAML snippet the template ends with, carrying `overall_status`.',
    '',
    `Do not add, edit, or delete any file under \`${root}/docs/\`, \`${root}/evidence/\`, or`,
    `\`${root}/config/\`. This workflow audits evidence and generates none.`,
    '',
    'When you are done, print one line naming the file you wrote. Nothing else you print is read.',
  ].join('\n');
}

/** Every case with the exact prompt it is sent. */
function caseIndex(sets) {
  return sets.map((set) => ({ id: set.id, prompt: buildPrompt(set) }));
}

/**
 * The ids of the cases this suite scores: one per evidence bundle, which is one
 * staged workspace and one agent call.
 *
 * tools/validate-eval-schemas.js checks the manifest's `caseCount` against the
 * length of this, the same way it checks its thresholds against THRESHOLDS.
 *
 * @returns {string[]}
 */
function caseIds() {
  return (loadGroundTruth()?.fixtureSets ?? []).map((set) => set.id);
}

/* -------------------------------------------------------------------------- */
/* Report parsing                                                              */
/* -------------------------------------------------------------------------- */

const DOMAIN_HEADING = /^(#{2,6})\s+(Performance|Security|Reliability|Maintainability)\s+Assessment\s*$/i;
/**
 * The heading the claimed evidence gaps sit under.
 *
 * It is a prefix match rather than an equality. `maxCleanFalsePositives` counts
 * `report.evidenceGaps.length`, so a heading this does not recognise is a section
 * whose every invented gap is silently not a finding. Measured against the stored
 * `clean-correct-audit` report with one invented gap under it, `## Evidence Gaps`
 * scored one clean false positive and `## Evidence Gaps and Risks` scored zero,
 * which is the whole threshold cleared by four words of rewording.
 *
 * `\b` is what keeps the widening honest: the heading has to say Evidence Gaps and
 * then either stop or continue into another word, so `Evidence Gapsomething` still
 * does not match.
 */
const EVIDENCE_GAPS_HEADING = /^(#{2,6})\s+Evidence Gaps\b/i;
const STATUS_LINE = /\*\*\s*status\s*:?\s*\*\*\s*:?\s*(PASS|CONCERNS|FAIL|N\/A)\b/i;
const THRESHOLD_LINE = /\*\*\s*threshold\s*:?\s*\*\*\s*:?\s*(.*)$/i;
/**
 * A claimed evidence gap: one top-level list item under the Evidence Gaps
 * heading.
 *
 * The checkbox and the bold name are the template's shape and neither is
 * required here. Measured on the clean bundle, a run that listed an invented gap
 * as a plain bullet scored zero clean false positives where the same gap in the
 * template's own shape scored one, so the threshold whose whole job is catching
 * an invented finding could be cleared by writing it differently.
 *
 * An ordered item counts the same as an unordered one, for that reason and no
 * other. Measured the same way, the same invented gap written `1. ` instead of
 * `- ` scored zero where the bullet scored one. Markdown gives an author both
 * spellings for one list and the template happens to use bullets, so reading only
 * bullets makes the ceiling a claim about the marker rather than about the
 * finding.
 *
 * Only a top-level item counts, and that exclusion stays. The template gives each
 * gap indented sub-bullets for its owner and deadline, so counting an indented
 * item would report one gap as four, and inflating the count of a threshold whose
 * ceiling is zero is a worse failure than the one it would close. That is the
 * difference between this exclusion and the two above: those cost a real finding,
 * this one buys a real finding being counted once.
 */
const GAP_ITEM = /^ {0,1}(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?(.+?)\s*$/;

/** The bolded name a gap item leads with, which is the template's shape and the gap's identity. */
const GAP_NAME = /^\*\*(.+?)\*\*/;
const OVERALL_STATUS = /overall_status:[ \t]+['"]?(PASS|CONCERNS|FAIL|WAIVED|N\/A)/;

/** The heading `nfr-report-template.md` gives the gate snippet, which is where the run's own scalar lives. */
const GATE_SECTION_HEADING = /^(#{2,6})\s+Gate YAML Snippet\s*$/i;

/** A markdown fragment reduced to the plain lowercase text a threshold token is compared against. */
function normalizeThreshold(text) {
  return String(text).replaceAll(/[`*_]/g, '').replaceAll(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * The file-shaped citations in one line of a domain section.
 *
 * Two forms, the same split test/eval-trace.js draws for the traceability matrix.
 * Inside backticks the span is the boundary, so a path holding a space is taken
 * whole; the template writes its evidence that way. In free prose the extension
 * is the only boundary available, so a spaced path is truncated to its last
 * space-free segment. Delimited spans are cut out before the prose scan runs, so
 * a citation inside backticks is never counted twice.
 *
 * @param {string} line
 * @returns {string[]}
 */
function citationsIn(line) {
  const found = [];
  const delimited = new RegExp(String.raw`^\s*(\S.*\.(?:${EVIDENCE_EXTENSIONS}))\s*$`, 'i');
  const prose = new RegExp(String.raw`([\w./~@-]+\.(?:${EVIDENCE_EXTENSIONS}))\b`, 'gi');
  let rest = '';
  let cursor = 0;
  for (const span of line.matchAll(/`([^`]+)`/g)) {
    rest += line.slice(cursor, span.index);
    cursor = span.index + span[0].length;
    const match = delimited.exec(span[1]);
    if (match) found.push(match[1]);
  }
  rest += line.slice(cursor);
  for (const match of rest.matchAll(prose)) found.push(match[1]);
  return found;
}

/**
 * The four domain sections, the overall status, and the evidence gaps, read out
 * of the report the run wrote.
 *
 * Returns null when the document declares no section for any of the four domains,
 * which is a report this harness cannot measure rather than a run that got every
 * domain wrong. runCase reports that as an environment failure, the same way
 * test/eval-trace.js does for a matrix with no criterion section.
 *
 * @param {string} text The report, as the probe observation's `report` artifact carries it.
 * @returns {{domains: Map<string, object>, duplicateDomainSections: string[], overallStatus: string|null, evidenceGaps: string[], unknownThresholdDeclared: boolean}|null}
 */
function parseReport(text) {
  const document = String(text);
  // A run that quotes the example the workflow ships is quoting a complete
  // assessment of another service: four `## <Domain> Assessment` sections, a
  // status for every dimension under them, and twenty evidence citations naming
  // files no bundle here carries. Read raw, that quote is scored as the run's own
  // answer, and a quote placed before the run's own sections is the answer that
  // wins, because the first section for a domain decides it. cli/lib/parse-report.js
  // strips fenced blocks before scanning a test-review report for exactly this
  // spoof, and this is that function rather than a second opinion about what a
  // fence is.
  const lines = stripFencedCodeBlocks(document).split('\n');
  const domains = new Map();
  const duplicateDomainSections = [];
  const evidenceGaps = [];

  let currentDomain = null;
  let currentDepth = 0;
  let inGaps = false;
  let gapsDepth = 0;
  for (const line of lines) {
    const anyHeading = /^(#{1,6})\s/.exec(line.trim());
    if (anyHeading) {
      const depth = anyHeading[1].length;
      if (currentDomain !== null && depth <= currentDepth) currentDomain = null;
      if (inGaps && depth <= gapsDepth) inGaps = false;
      const domainHeading = DOMAIN_HEADING.exec(line.trim());
      if (domainHeading) {
        const name = domainHeading[2].toLowerCase();
        currentDepth = depth;
        // A second section for a domain that already has one keeps the first.
        // Two sections state the domain's answer twice and a reader cannot tell
        // which one the overall status came from; the first is the one the report
        // leads with. The second is recorded here rather than dropped, which is
        // what lets it reach maxDuplicateDomainSections.
        const repeated = domains.has(name);
        if (repeated) duplicateDomainSections.push(name);
        currentDomain = repeated ? null : name;
        if (currentDomain !== null) {
          domains.set(name, { statuses: [], thresholdLines: [], citations: [] });
        }
        continue;
      }
      if (EVIDENCE_GAPS_HEADING.test(line.trim())) {
        inGaps = true;
        gapsDepth = depth;
      }
      continue;
    }
    if (inGaps) {
      const gap = GAP_ITEM.exec(line);
      if (gap) {
        // The bolded name when the item carries one, which is the gap's identity
        // and what the template writes, and the whole item otherwise. Keeping the
        // name where there is one means widening the item pattern moved no stored
        // result: only a bullet that names its gap in some other way reads
        // differently, and that is the shape this widening exists to count.
        const named = GAP_NAME.exec(gap[1]);
        evidenceGaps.push((named ? named[1] : gap[1]).replaceAll(/[`*_]/g, '').trim());
      }
    }
    if (currentDomain === null) continue;
    const entry = domains.get(currentDomain);
    const status = STATUS_LINE.exec(line);
    if (status) entry.statuses.push(status[1].toUpperCase());
    const threshold = THRESHOLD_LINE.exec(line);
    if (threshold) entry.thresholdLines.push(threshold[1]);
    // Every other line of the domain section, rather than only the one labelled
    // `**Evidence:**`.
    //
    // `maxFabricatedEvidence` is computed from the citations this collects, so a
    // label it did not recognise was a citation that did not exist. Measured
    // against the stored `gapped-fabricated-evidence` report, the same
    // nonexistent `coverage/lcov-report/index.html` scored one fabricated
    // citation under `**Evidence:**`, and zero under `**Source:**`, zero under
    // `**Evidence Source:**`, and zero written into the `**Actual:**` prose. A
    // ceiling of zero that any of three rewordings clears is not a ceiling, and
    // the section is the honest boundary: a file named inside a domain's
    // assessment is that domain's grounding whatever line it is written on.
    //
    // The `**Threshold:**` line is the one exclusion, because it is the one line
    // that legitimately names a document without citing evidence. A threshold
    // line says where the target came from, so `Statement coverage at or above
    // 80% (docs/tech-spec.md)` names the requirements document rather than a
    // measurement of the service. Folding that into the grounding would make a
    // run that mentions its spec there read as differently grounded from one that
    // does not, and `maxUnstableCases` is zero, so a run rewording that one line
    // between repetitions would fail the suite for having cited nothing new.
    //
    // The other thing to know is that this set feeds `signatureOf`, which is why
    // the widening is the whole line rather than a second label: the citations of
    // every stored case had to come out identical or the corpus moves. Measured
    // over all thirteen stored nfr reports before the change, no line inside a
    // domain section carried a file-shaped token except the `**Evidence:**` lines
    // already read, so no stored result moved and `SCORER_VERSION` did not need a
    // bump. What this does inherit is `citationsIn`'s prose reading, so a domain
    // section whose prose says `Node.js` now offers a `.js` token where before
    // only an evidence line could; that is the same reading the evidence line has
    // always had, applied to more lines.
    if (!threshold) entry.citations.push(...citationsIn(line));
  }

  if (domains.size === 0) return null;
  for (const entry of domains.values()) {
    entry.status = rollupStatus(entry.statuses);
    entry.thresholdText = normalizeThreshold(entry.thresholdLines.join(' | '));
    entry.thresholdRaw = entry.thresholdLines.join('\n');
  }

  // Two readings of the gate scalar are wrong before the one below. Dropping
  // fenced lines loses it entirely, because the Gate YAML snippet the template
  // ends with is itself a fenced block and on every report the workflow produces
  // the scalar lives inside ```yaml. Reading the whole document takes a quoted
  // example's scalar ahead of the run's, because the first match wins, and a run
  // whose own gate says FAIL was scored PASS from an example above it.
  const depths = fenceDepths(document);
  const raw = document.split('\n');
  // Fence depth does not separate them either, which is worth stating because it
  // looked like it did. Fences do not nest in CommonMark, so an example quoted
  // inside a longer fence is one block and its scalar sits at the same depth as
  // the report's own.
  //
  // The heading is what separates them. A heading inside a fence is content, so
  // only the run's own section heading is at depth 0, and a quoted example that
  // opens no fence of its own puts its headings at depth 0 where the
  // duplicate-section count already catches it.
  //
  // A report that states no such heading reads no overall status and fails
  // `overallStatusAccuracy`, which is the direction a parser should fail in.
  const gateStart = raw.findIndex((line, index) => depths[index] === 0 && GATE_SECTION_HEADING.test(line.trim()));
  let gateEnd = raw.length;
  if (gateStart !== -1) {
    const depth = /^(#{1,6})\s/.exec(raw[gateStart].trim())[1].length;
    for (let cursor = gateStart + 1; cursor < raw.length; cursor += 1) {
      const next = /^(#{1,6})\s/.exec(raw[cursor].trim());
      if (depths[cursor] === 0 && next && next[1].length <= depth) {
        gateEnd = cursor;
        break;
      }
    }
  }
  const overall = gateStart === -1 ? null : OVERALL_STATUS.exec(raw.slice(gateStart, gateEnd).join('\n'));
  return {
    domains,
    duplicateDomainSections,
    overallStatus: overall ? overall[1].toUpperCase() : null,
    evidenceGaps,
    // Compared as a plain case-sensitive substring over the whole document,
    // because that is the one claim the contract's own oracle can make with
    // `containment`. A looser reading here and a literal one there would be two
    // similar claims rather than the same one, and test/test-contract-oracles.js
    // holds them to being the same. Fenced lines are included for that reason
    // rather than by oversight: the oracle reads the artifact as one string.
    unknownThresholdDeclared: document.includes(UNKNOWN_TOKEN),
  };
}

/**
 * The report as a file on disk, tagged the way the adapter would tag it and then
 * read through parseReport, so a stored replay case and a live observation go
 * through one reader.
 *
 * @param {string} directory Directory holding `test-artifacts/nfr-assessment.md`.
 * @returns {{ok: true, report: object}|{ok: false, failureClass: string, reason: string}}
 */
function readReport(directory) {
  const reportPath = path.join(directory, 'test-artifacts', 'nfr-assessment.md');
  if (!fs.existsSync(reportPath)) return reportFromArtifact({ kind: 'absent' });
  return reportFromArtifact({ kind: 'text', value: fs.readFileSync(reportPath, 'utf8') });
}

/**
 * The report off the tagged artifact the probe observation carries.
 *
 * The adapter has already decided what the file is: `absent` when the run never
 * wrote it, `json` when it wrote something JSON.parse accepts, which a markdown
 * report is not, `text` otherwise. Each is its own failure class here, and none
 * is a low score.
 *
 * @param {{kind: string, value?: unknown}} artifact
 * @returns {{ok: true, report: object}|{ok: false, failureClass: string, reason: string}}
 */
function reportFromArtifact(artifact) {
  if (!artifact || artifact.kind === 'absent') {
    return { ok: false, failureClass: 'environment-missing-artifact', reason: 'no nfr-assessment.md was written' };
  }
  if (artifact.kind !== 'text' || typeof artifact.value !== 'string') {
    return { ok: false, failureClass: 'environment-parser', reason: 'nfr-assessment.md is not a text document' };
  }
  const parsed = parseReport(artifact.value);
  if (parsed === null) {
    return {
      ok: false,
      failureClass: 'environment-missing-artifact',
      reason: 'nfr-assessment.md declares no section for any of the four audited domains',
    };
  }
  return { ok: true, report: parsed };
}

/* -------------------------------------------------------------------------- */
/* Scoring                                                                     */
/* -------------------------------------------------------------------------- */

/** One check outcome, carrying what was expected so a miss can be printed. */
function check(field, expected, actual) {
  return { field, expected, actual, ok: JSON.stringify(expected) === JSON.stringify(actual) };
}

/**
 * The basenames a citation may resolve to: every file the bundle carries, plus
 * the config the harness staged and the report the run is writing.
 *
 * Read from the corpus rather than from the staged workspace, so a stored replay
 * case resolves a citation exactly as a live run does without a workspace to look
 * at. validateCorpus holds `evidenceFiles` equal to what is on disk in both
 * directions, which is what makes the two readings the same reading.
 */
function knownBasenames(set) {
  return new Set([...(set.evidenceFiles ?? []).map((relative) => path.basename(relative)), 'config.yaml', 'nfr-assessment.md']);
}

/**
 * The threshold check for one domain.
 *
 * A stated threshold has to be the one the report states, checked by any of the
 * tokens the corpus records for it, so a report rewording "0 critical and 0 high
 * vulnerabilities" still passes and a report naming a different number does not.
 * A threshold the bundle never states has to be recorded as UNKNOWN, which is the
 * workflow's own spelling in step-02 and the one thing that separates a run that
 * noticed the gap from a run that filled it in.
 */
function scoreThreshold(domain, reported) {
  const stated = domain.thresholdStated === true;
  if (!reported) return check(`threshold ${stated ? 'is stated' : 'is UNKNOWN'}`, true, false);
  if (stated) {
    const matched = (domain.thresholdTokens ?? []).some((token) => reported.thresholdText.includes(token));
    return check(`threshold names one of [${(domain.thresholdTokens ?? []).join(', ')}]`, true, matched);
  }
  return check(`threshold is recorded as ${UNKNOWN_TOKEN}`, true, reported.thresholdRaw.includes(UNKNOWN_TOKEN));
}

/**
 * Score one completed run of one evidence bundle.
 *
 * @param {object} set One entry of groundTruth.fixtureSets.
 * @param {object} report One parseReport result.
 * @returns {object}
 */
function scoreRun(set, report) {
  const known = knownBasenames(set);
  const domainResults = DOMAINS.map((name) => {
    const declared = set.domains[name];
    const reported = report.domains.get(name) ?? null;
    return {
      domain: name,
      // A domain is covered when the report states a status for it. A heading with
      // no line STATUS_LINE recognises leaves the domain unjudged just as surely as
      // no heading does, and a section whose every status is spelled outside the
      // four-value enum reaches this the same way, because rollupStatus drops an
      // unrecognised token. Such a section is also a miss under
      // domainStatusAccuracy, on `ok` below. The two are not one defect counted
      // twice: coverage is about the deliverable being complete and the accuracy is
      // about the judgment being right, and `sections` below records the heading
      // count so a reader can tell a missing section from an unreadable one.
      present: reported?.status != null,
      expected: declared.expectedStatus,
      reported: reported?.status ?? null,
      undecidable: declared.isUndecidable === true,
      ok: reported?.status === declared.expectedStatus,
      threshold: scoreThreshold(declared, reported),
    };
  });

  // A PASS on a domain whose status the workflow's own rules say cannot be
  // reached from this bundle. This is the measurement the suite exists for, and
  // it is counted apart from the status accuracy so that one wrong judgment of
  // eight cannot absorb it.
  const unsupportedPass = domainResults.filter((item) => item.undecidable && item.reported === 'PASS').map((item) => item.domain);

  const fabricated = [];
  for (const [name, entry] of report.domains) {
    for (const citation of entry.citations) {
      if (!known.has(path.basename(citation))) fabricated.push(`${name} -> ${citation}`);
    }
  }

  const expectedOverall = set.expectedOverallStatus;
  const overall = check('overall_status', expectedOverall, report.overallStatus);
  const unknownThreshold = check(
    `a threshold is recorded as ${UNKNOWN_TOKEN}`,
    set.expectedUnknownThresholdDeclared === true,
    report.unknownThresholdDeclared,
  );

  // The clean bundle states every threshold and meets every one, so each of these
  // is a definite false positive rather than an unattributed finding a human
  // still has to judge.
  const isCleanSet = expectedDomainStatuses(set).every((status) => status === 'PASS');
  let cleanFalsePositives = 0;
  if (isCleanSet) {
    cleanFalsePositives += domainResults.filter((item) => item.reported !== 'PASS').length;
    cleanFalsePositives += report.evidenceGaps.length;
    cleanFalsePositives += report.unknownThresholdDeclared ? 1 : 0;
  }

  return {
    caseId: set.id,
    isCleanSet,
    // Every file-shaped citation the report made, per domain, in report order.
    // `fabricated` is the subset of these that resolves to no file in the bundle
    // and is what reaches a threshold; the whole set is carried so signatureOf
    // can see a run change its grounding while keeping its verdict.
    citations: Object.fromEntries([...report.domains].map(([name, entry]) => [name, entry.citations])),
    domainResults,
    // `present` is what domainCoverage grades: a domain the report states a status
    // for. `sections` is the weaker heading count, which is all the contract's own
    // coverage oracle can see, since it reads the report as one string and a
    // `containment` check cannot bind a status line to the section above it.
    // nfrOracleSpecs in tools/generate-contracts.js restates `sections` for that
    // reason and test/test-contract-oracles.js holds the two to agreeing.
    coverage: {
      present: domainResults.filter((item) => item.present).length,
      sections: DOMAINS.filter((name) => report.domains.has(name)).length,
      total: DOMAINS.length,
    },
    // A domain the report assessed twice. The status above is the first section's,
    // which is what the report leads with, and the second section is counted here
    // so a run that contradicts itself fails the suite on the contradiction.
    duplicateDomainSections: report.duplicateDomainSections,
    unsupportedPass,
    fabricated,
    evidenceGaps: report.evidenceGaps,
    overall,
    unknownThreshold,
    cleanFalsePositives,
  };
}

/**
 * The scored answer as one string, for stability.
 *
 * Every measurement that reaches a threshold is in here. A signature covering
 * less than the scoring does lets the answer move between repetitions while
 * unstableCases reads zero, which would make maxUnstableCases a claim about the
 * part of the answer the signature happened to include.
 *
 * Nothing scored is excluded and nothing environmental is included: the scored
 * object carries no run identifier and no timestamp.
 *
 * @param {object} scored One entry from scoreRun.
 * @param {number} mutations Bundle files the run changed or added, which maxFixtureMutations scores.
 * @returns {string}
 */
function signatureOf(scored, mutations) {
  return JSON.stringify([
    scored.caseId,
    scored.domainResults.map((item) => `${item.domain}=${item.reported}/${item.present}/${item.threshold.actual}`),
    // The evidence each domain cited, and not only the citations that resolve to
    // nothing. Two runs that reach the same four statuses off different files
    // have not given the same answer, and a signature built from the statuses
    // alone cannot see that: measured by construction, swapping one resolving
    // citation for another resolving one collided before this line existed.
    // Grounding is what varies between repetitions of a judgment that agrees,
    // so a stability gate blind to it is strongest where the risk is lowest.
    scored.citations,
    scored.coverage.present,
    scored.coverage.sections,
    scored.duplicateDomainSections,
    scored.unsupportedPass,
    scored.fabricated,
    scored.evidenceGaps,
    scored.overall.actual,
    scored.unknownThreshold.actual,
    scored.cleanFalsePositives,
    mutations,
  ]);
}

/* -------------------------------------------------------------------------- */
/* Running                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Everything about the runner request that does not change between runs: the
 * operator's overrides and the runner's own wall clock. The vendor name is
 * applied per run, because one invocation may measure several.
 *
 * `--timeout-ms` is the inner clock. It bounds the vendor call inside the runner
 * and reports a timeout as an exit code the caller classifies; the
 * authorization's `maxElapsedMs` is a minute longer and SIGKILLs, so the inner
 * bound fires first and the classification survives.
 */
function runnerOptions(options) {
  const option = { 'timeout-ms': String(RUN_TIMEOUT_MS) };
  if (options.agentCmd) option['agent-cmd'] = options.agentCmd;
  if (options.model) option.model = options.model;
  if (options.agentArgs.length > 0) option['agent-arg'] = [...options.agentArgs];
  if (options.envPass.length > 0) option['env-pass'] = [...options.envPass];
  return option;
}

/**
 * One complete NFR run of one evidence bundle in a fresh workspace, through
 * eval-quality's command-line adapter.
 *
 * The staged workspace is the authorization's working directory, so the policy is
 * what confines the run rather than a convention, and the report is read off the
 * observation rather than by path.
 *
 * @returns {Promise<{ok: true, scored: object, mutations: number}|{ok: false, failureClass: string, reason: string}>}
 */
async function runCase(set, options, agent, runIndex) {
  const workspace = stageWorkspace(set);
  try {
    const leaked = assertGroundTruthAbsent(workspace.dir);
    if (leaked.length > 0) {
      return { ok: false, failureClass: 'environment-configuration', reason: leaked.join('; ') };
    }

    const treeBefore = workingTreeState(PROJECT_ROOT);
    const { port } = await createProbePort({
      cwd: workspace.dir,
      interfaceIds: [NFR_INTERFACE],
      artifacts: { [NFR_INTERFACE]: nfrArtifactPaths(set) },
      // The operator's own pass-through names, so the authorization permits
      // exactly what the request below declares.
      environmentKeys: { [NFR_INTERFACE]: options.envPass },
    });
    const result = await probeCommand(
      port,
      probeRequest({
        probeId: `${set.id}-run-${runIndex + 1}`,
        interfaceId: NFR_INTERFACE,
        operationId: NFR_OPERATION,
        option: { ...runnerOptions(options), agent },
        environment: hostEnvironment(NFR_INTERFACE, options.envPass),
        stdin: { kind: 'text', value: buildPrompt(set) },
      }),
      new AbortController().signal,
    );
    // The declared scope is the workspace. A run that reached the repository
    // instead is outside it, and its artifact is not read. Checked before the
    // result is, because a killed run may have written before it was killed.
    const treeChanges = workingTreeChanges(treeBefore, workingTreeState(PROJECT_ROOT));
    if (treeChanges.length > 0) {
      return {
        ok: false,
        failureClass: 'environment-configuration',
        reason: `the runner changed the repository under a scoped-artifact-writes declaration: ${treeChanges.join(', ')}`,
      };
    }
    if (!result.ok) return { ok: false, failureClass: result.failureClass, reason: result.reason };

    const { observation } = result;
    if (observation.exitCode !== 0) {
      const tail = observedText(observation.stderr).trim().split('\n').filter(Boolean).slice(-3).join(' | ');
      return {
        ok: false,
        failureClass: failureClassForExit(observation.exitCode),
        reason: tail || `tea-nfr-runner exited ${observation.exitCode}`,
      };
    }

    const report = reportFromArtifact(observation.artifacts.report);
    if (!report.ok) return report;

    // The workflow audits evidence and generates none. A run that wrote into the
    // bundle has moved the benchmark, and the next run would be measured against
    // a bundle this one edited.
    const mutations = digestTree(workspace.projectDir, workspace.bundleFiles) === workspace.bundleDigest ? 0 : 1;
    const added = filesUnder(workspace.projectDir).filter(
      (relative) =>
        !relative.startsWith(`test-artifacts${path.sep}`) &&
        !relative.startsWith(`_bmad${path.sep}`) &&
        !workspace.bundleFiles.includes(relative),
    );

    return { ok: true, scored: scoreRun(set, report.report), mutations: mutations + added.length };
  } finally {
    fs.rmSync(workspace.dir, { recursive: true, force: true });
  }
}

function preflight({ agents, agentCmd }) {
  const problems = [];
  const versions = {};
  const report = (failureClass, message) => problems.push({ failureClass, message });

  if (!fs.existsSync(GROUND_TRUTH)) report('environment-missing-artifact', `ground truth not found at ${GROUND_TRUTH}`);
  if (!fs.existsSync(SKILL_ROOT)) report('environment-missing-artifact', `nfr workflow not found at ${SKILL_ROOT}`);
  // The command every run goes through. The adapter spawns the file itself, so a
  // missing executable bit fails the spawn before argv matters, and that is a
  // configuration problem to name here rather than a lost run to classify later.
  for (const problem of targetProblems(PROJECT_ROOT, [NFR_INTERFACE])) report('environment-configuration', problem);

  for (const agent of agents) {
    if (!Object.hasOwn(AGENT_ADAPTERS, agent)) {
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
const pct = (value) => (Number.isNaN(value) ? '  n/a' : `${(value * 100).toFixed(0).padStart(3)}%`);

/**
 * Write the machine-readable record when --json asked for one, then exit with the
 * code the failure class carries.
 */
async function finish({ options, startedAt, mode, sets, runners, suiteFailureClasses = [] }) {
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
        // Both stamps come from the clock port rather than from `Date` directly,
        // so a scripted or replayed run cannot pair a real wall-clock stamp with
        // scripted durations and produce a record that passes its own schema
        // while describing a run that never happened.
        generatedAt: await nowIso(),
        mode,
        suite,
        repository: repositoryState(PROJECT_ROOT),
        fixtureDigest: digestFiles(PROJECT_ROOT, suite.fixtures),
        promptDigest: digestPrompts(caseIndex(sets)),
        cases,
        runners,
        durationMs: await elapsedMsSince(startedAt),
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

async function main() {
  const startedAt = await nowMs();
  const options = parseArgs(process.argv.slice(2));
  const { agents, runs, validateOnly, preflightOnly } = options;
  const staticMode = validateOnly ? 'validate-only' : preflightOnly ? 'preflight-only' : 'live';

  console.log(`${colors.cyan}========================================`);
  console.log('tea nfr eval harness');
  console.log(`========================================${colors.reset}\n`);

  const groundTruth = loadGroundTruth();
  if (!groundTruth) {
    console.error(`${colors.red}eval: ground truth at ${GROUND_TRUTH} is missing or not valid JSON${colors.reset}`);
    await finish({ options, startedAt, mode: staticMode, sets: [], runners: [], suiteFailureClasses: ['environment-missing-artifact'] });
  }

  const sets = selectSets(groundTruth, options.sets);
  if (sets.length === 0) {
    console.error(`${colors.red}eval: no fixture set matched ${options.sets.join(', ')}${colors.reset}`);
    await finish({ options, startedAt, mode: staticMode, sets: [], runners: [], suiteFailureClasses: ['environment-configuration'] });
  }

  const { problems, notices } = validateCorpus(groundTruth);
  for (const notice of notices) console.log(`  ${colors.yellow}drift${colors.reset} ${notice}`);
  if (problems.length > 0) {
    console.error(`${colors.red}the corpus is inconsistent:${colors.reset}`);
    for (const problem of problems) console.error(`  ${colors.red}✗${colors.reset} ${problem}`);
    console.error('');
    // An inconsistent corpus is a real finding about the repository, measured
    // without a model call, so it keeps the exit 1 the sibling harnesses give the
    // same case.
    await finish({ options, startedAt, mode: staticMode, sets: [], runners: [], suiteFailureClasses: ['quality'] });
  }

  const domainCount = sets.length * DOMAINS.length;
  const undecidable = sets.reduce((sum, set) => sum + DOMAINS.filter((name) => set.domains[name].isUndecidable === true).length, 0);
  console.log(
    `${colors.green}✓${colors.reset} ${sets.length} evidence bundle(s), ${domainCount} domain judgment(s), ${undecidable} undecidable; ` +
      'every cited rule resolves and every declared evidence file is on disk',
  );

  if (validateOnly || preflightOnly) {
    // Staging is exercised here because the ground truth staying out of the
    // agent's workspace is the measurement's validity, and a check that only runs
    // when a model runs is a check nobody runs.
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
          await finish({ options, startedAt, mode: staticMode, sets: [], runners: [], suiteFailureClasses: ['environment-configuration'] });
        }
        const artifacts = path.join(workspace.projectDir, 'test-artifacts');
        if (filesUnder(artifacts).length > 0) {
          console.error(
            `${colors.red}eval: ${set.id} staged test-artifacts is not empty; the run must write the only file in it${colors.reset}`,
          );
          await finish({ options, startedAt, mode: staticMode, sets: [], runners: [], suiteFailureClasses: ['environment-configuration'] });
        }
        console.log(`  ${colors.green}✓${colors.reset} ${set.id}: staged workspace carries no ground truth and an empty test-artifacts`);
      } finally {
        fs.rmSync(workspace.dir, { recursive: true, force: true });
      }
    }
    if (validateOnly) {
      console.log(`\n${colors.green}corpus valid; nothing measured (--validate-only).${colors.reset}\n`);
      await finish({ options, startedAt, mode: 'validate-only', sets, runners: [] });
    }
  }

  const { problems: readiness, versions } = preflight(options);
  if (readiness.length > 0) {
    console.error(`${colors.red}eval pre-flight failed; nothing was measured:${colors.reset}`);
    for (const problem of readiness) console.error(`  - ${problem.message}`);
    console.error(`\n${colors.dim}A failed pre-flight is exit 2, never a 0% score.${colors.reset}`);
    await finish({
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
    await finish({ options, startedAt, mode: 'preflight-only', sets, runners: [] });
  }
  console.log(`${colors.dim}${runs} run(s) per evidence bundle per agent${colors.reset}\n`);

  const runners = [];

  for (const agent of agents) {
    console.log(`${colors.cyan}${agent}${colors.reset}`);
    const agentStartedAt = await nowMs();
    const totals = {
      statusTotal: 0,
      statusHits: 0,
      undecidableTotal: 0,
      undecidableHits: 0,
      thresholdTotal: 0,
      thresholdHits: 0,
      overallTotal: 0,
      overallHits: 0,
      coverageTotal: 0,
      coverageHits: 0,
      duplicateDomainSections: 0,
      unsupportedPass: 0,
      fabricated: 0,
      cleanFalsePositives: 0,
      mutations: 0,
    };
    let completedRuns = 0;
    let unstableCases = 0;
    let incompleteCases = 0;
    const lostRunClasses = [];

    for (const set of sets) {
      const signatures = new Set();
      const caseScores = [];
      for (let runIndex = 0; runIndex < runs; runIndex += 1) {
        const outcome = await runCase(set, options, agent, runIndex);
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
        totals.statusTotal += scored.domainResults.length;
        totals.statusHits += scored.domainResults.filter((item) => item.ok).length;
        const undecidableResults = scored.domainResults.filter((item) => item.undecidable);
        totals.undecidableTotal += undecidableResults.length;
        totals.undecidableHits += undecidableResults.filter((item) => item.ok).length;
        totals.thresholdTotal += scored.domainResults.length + 1;
        totals.thresholdHits += scored.domainResults.filter((item) => item.threshold.ok).length + (scored.unknownThreshold.ok ? 1 : 0);
        totals.overallTotal += 1;
        totals.overallHits += scored.overall.ok ? 1 : 0;
        totals.coverageTotal += scored.coverage.total;
        totals.coverageHits += scored.coverage.present;
        totals.duplicateDomainSections += scored.duplicateDomainSections.length;
        totals.unsupportedPass += scored.unsupportedPass.length;
        totals.fabricated += scored.fabricated.length;
        totals.cleanFalsePositives += scored.cleanFalsePositives;
      }

      const first = caseScores[0];
      const complete = caseScores.length === runs;
      const stable = signatures.size === 1 && complete;
      const clean = first.domainResults.every((item) => item.ok) && first.overall.ok;
      console.log(
        `  ${clean ? `${colors.green}✓${colors.reset}` : `${colors.yellow}•${colors.reset}`} ${set.id}: ` +
          `${first.domainResults.filter((item) => item.ok).length}/${first.domainResults.length} domains, ` +
          `overall ${first.overall.actual ?? 'none'} (expected ${first.overall.expected}), ` +
          `${stable ? 'stable' : complete ? `${colors.red}${signatures.size} different answers on identical input${colors.reset}` : `${colors.red}only ${caseScores.length}/${runs} runs measured${colors.reset}`}`,
      );
      for (const item of first.domainResults.filter((entry) => !entry.ok)) {
        const flag = item.undecidable ? `${colors.red} (undecidable)${colors.reset}` : '';
        console.log(
          `        ${colors.yellow}${item.domain}:${colors.reset} reported ${item.reported ?? 'nothing'}, expected ${item.expected}${flag}`,
        );
      }
      for (const domain of first.duplicateDomainSections) console.log(`        ${colors.red}second section for:${colors.reset} ${domain}`);
      for (const domain of first.unsupportedPass) console.log(`        ${colors.red}unsupported PASS:${colors.reset} ${domain}`);
      for (const entry of first.fabricated) console.log(`        ${colors.red}fabricated evidence:${colors.reset} ${entry}`);
      if (!complete) incompleteCases += 1;
      else if (!stable) unstableCases += 1;
    }

    const measurements = {
      domainStatusAccuracy: measured(ratio(totals.statusHits, totals.statusTotal)),
      undecidableDomainAccuracy: measured(ratio(totals.undecidableHits, totals.undecidableTotal)),
      thresholdFidelityAccuracy: measured(ratio(totals.thresholdHits, totals.thresholdTotal)),
      overallStatusAccuracy: measured(ratio(totals.overallHits, totals.overallTotal)),
      domainCoverage: measured(ratio(totals.coverageHits, totals.coverageTotal)),
      duplicateDomainSections: totals.duplicateDomainSections,
      unsupportedPass: totals.unsupportedPass,
      fabricatedEvidence: totals.fabricated,
      cleanFalsePositives: totals.cleanFalsePositives,
      unstableCases,
      incompleteCases,
      fixtureMutations: totals.mutations,
    };

    console.log(`  ${colors.dim}────────${colors.reset}`);
    for (const [label, key] of [
      ['domain status      ', 'domainStatusAccuracy'],
      ['undecidable domains', 'undecidableDomainAccuracy'],
      ['threshold fidelity ', 'thresholdFidelityAccuracy'],
      ['overall status     ', 'overallStatusAccuracy'],
      ['domain coverage    ', 'domainCoverage'],
    ]) {
      const value = measurements[key] === null ? Number.NaN : measurements[key];
      console.log(`  ${label} ${pct(value)}   (threshold ${pct(THRESHOLDS[key])})`);
    }
    console.log(
      `  duplicate sections  ${String(totals.duplicateDomainSections).padStart(4)}   (max ${THRESHOLDS.maxDuplicateDomainSections})`,
    );
    console.log(`  unsupported PASS    ${String(totals.unsupportedPass).padStart(4)}   (max ${THRESHOLDS.maxUnsupportedPass})`);
    console.log(`  fabricated evidence ${String(totals.fabricated).padStart(4)}   (max ${THRESHOLDS.maxFabricatedEvidence})`);
    console.log(`  clean false pos.    ${String(totals.cleanFalsePositives).padStart(4)}   (max ${THRESHOLDS.maxCleanFalsePositives})`);
    console.log(`  fixture mutations   ${String(totals.mutations).padStart(4)}   (max ${THRESHOLDS.maxFixtureMutations})`);

    const failures = [];
    for (const key of [
      'domainStatusAccuracy',
      'undecidableDomainAccuracy',
      'thresholdFidelityAccuracy',
      'overallStatusAccuracy',
      'domainCoverage',
    ]) {
      const value = measurements[key];
      // NaN fails every comparison, so an unmeasurable metric would otherwise
      // clear a bar it never met. Unmeasurable is a failure, and it says which
      // metric.
      if (value === null) failures.push(`${key} (unmeasurable)`);
      else if (value < THRESHOLDS[key]) failures.push(key);
    }
    if (totals.duplicateDomainSections > THRESHOLDS.maxDuplicateDomainSections) {
      failures.push(`${totals.duplicateDomainSections} duplicate domain section(s)`);
    }
    if (totals.unsupportedPass > THRESHOLDS.maxUnsupportedPass) failures.push(`${totals.unsupportedPass} unsupported PASS result(s)`);
    if (totals.fabricated > THRESHOLDS.maxFabricatedEvidence) failures.push(`${totals.fabricated} fabricated evidence citation(s)`);
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
          durationMs: await elapsedMsSince(agentStartedAt),
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
        durationMs: await elapsedMsSince(agentStartedAt),
        failureClass: failures.length > 0 ? 'quality' : 'none',
        failures,
      }),
    );
  }

  await finish({ options, startedAt, mode: 'live', sets, runners });
}

// Only when invoked directly, so the scoring internals can be exercised and the
// manifest can read THRESHOLDS without spending a vendor run.
if (require.main === module) {
  main().catch((error) => {
    console.error(`${colors.red}eval: ${error?.stack ?? error}${colors.reset}`);
    process.exit(2);
  });
}

module.exports = {
  parseArgs,
  loadGroundTruth,
  validateCorpus,
  rollupStatus,
  deriveOverallStatus,
  expectedDomainStatuses,
  stageWorkspace,
  nfrArtifactPaths,
  assertGroundTruthAbsent,
  buildPrompt,
  caseIndex,
  caseIds,
  readReport,
  reportFromArtifact,
  parseReport,
  scoreRun,
  signatureOf,
  DOMAINS,
  RUNNER_CAPABILITIES,
  THRESHOLDS,
  SUITE_ID,
  UNKNOWN_TOKEN,
  NFR_INTERFACE,
  NFR_OPERATION,
};
