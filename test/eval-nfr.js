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
 *   gate disagreements   a domain the gate artifact and the assessment section answer
 *                        differently, ceiling zero
 *   duplicate sections   a second, contradictory section for one domain
 *   fabricated evidence  a citation naming a file the bundle does not contain
 *   clean false positives anything reported against the bundle that has no gaps
 *   stability            the same scored answer on identical input, over everything above
 *   fixture mutations    the run must not write into the bundle it was given
 *
 * WHERE A DOMAIN STATUS COMES FROM
 *
 * The workflow's Gate YAML snippet declares `audited_domains`, one status per
 * domain, and that block is what this harness scores. Until Story 7.1 the snippet
 * carried `overall_status` and the eight ADR checklist categories and nothing for
 * the four domains Step 4 evaluates, so the status was read out of the
 * `## <Domain> Assessment` prose instead, which scored the template's rendering of
 * the judgment where the artifact should have carried the judgment itself.
 *
 * The prose is still read, for one purpose: the two are one judgment written
 * twice, and `maxGateDisagreements` is zero. A run whose gate artifact contradicts
 * its own assessment section has published two answers to one question, and which
 * of them a reader acts on decides a release. That is a defect in the deliverable
 * rather than a disagreement about a judgment, which is why it is a ceiling and
 * not an accuracy.
 *
 * The rule that produces each value is `skillRuleCitations.domainStatusIsWorstFinding`,
 * stated in nfr-status-definitions.md under "Domain Status": the worst status among
 * the domain's findings, with N/A deciding nothing. Before this story the corpus
 * reached that rule by analogy from step-04e's compliance rollup, because the
 * workflow stated no rule for a domain's own status.
 *
 * test/eval-trace.js still records the same split for its own deliverable, reading
 * per-criterion statuses out of `traceability-matrix.md` because
 * `e2e-trace-summary.json` carries no per-criterion block. That gap is recorded in
 * Epic 7 and is a separate deliverable from this one.
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

/*
 * WHAT STILL REACHES `fs` DIRECTLY, AND WHY
 *
 * Fourteen calls, in four groups, none of them a read or a write of a file's
 * contents.
 *
 * - One directory walk and its guard, which enumerate a staged tree. The
 *   file-system port reads one caller-owned path and cannot read a directory at
 *   all.
 * - One directory question over a fixture set's root, asked by the validator so a
 *   set naming a root nobody ships is reported rather than thrown on.
 * - Two pre-flight existence questions, over the ground truth and over the nfr
 *   workflow directory. The second is a directory; the first is a file the port
 *   could answer for only by reading every byte to learn a boolean, which is a
 *   different operation with a different cost.
 * - Nine lifecycle calls: one `mkdtemp`, four `mkdir`, two `copyFile` and two
 *   `rm` that create and remove the staged workspace. Seven are directory
 *   operations the port has no method for. The two `copyFile` calls are not: a
 *   copy is a byte read followed by a byte write, and what stops them is
 *   `test/lib/file-system-port.js` publishing `readBytes` with no `writeBytes`
 *   beside it, which is a wrapper omission rather than a port limit.
 *
 * Every read of a file's contents and the one write of one go through
 * `test/lib/file-system-port.js`, and `npm run test:file-system-port` is what
 * makes that falsifiable rather than asserted.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { AGENT_ADAPTERS, resolveModel } = require('../cli/lib/agent-adapters');
const { fenceDepths, stripFencedCodeBlocks } = require('../cli/lib/parse-report');
const { failureClassForExit } = require('../cli/nfr-runner');
const { missingCredential } = require('./eval-test-review');
const { loadSuiteManifest, suiteById } = require('./lib/suite-manifest');
const { contractVersionsFor } = require('./lib/contract-versions');
const {
  digest,
  digestFiles,
  digestPrompts,
  repositoryState,
  probeVersion,
  redactArgs,
  measured,
  diagnosticRecord,
  artifactEvidence,
  numericContributions,
  diagnosticRateMiss,
  classifyDiagnosticQuality,
  suiteResultRecord,
  writeSuiteResult,
} = require('./lib/eval-record');
const { worstFailureClass, exitCodeForFailureClass } = require('./schema/eval-result');
const { workingTreeState, workingTreeChanges } = require('./lib/runner-capabilities');
const { PROBE_TIMEOUT_MS, boundedProbe } = require('./lib/bounded-probe');
const { nowMs, nowIso, elapsedMsSince } = require('./lib/clock');
const {
  createProbePort,
  hostEnvironment,
  observedText,
  probeCommandWithRetry,
  probeRequest,
  targetProblems,
} = require('./lib/probe-targets');
const { readBytes, readJson, readText, writeText } = require('./lib/file-system-port');

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
  'gate-artifact-agrees-with-its-own-report': 'maxGateDisagreements',
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
  // A status declared in the gate artifact and assessed in the document, for each
  // of the four domains Step 4 dispatches a worker for. Both halves, because each
  // alone is half a deliverable: a gate line with no assessment behind it is an
  // answer nobody can check, and an assessment the gate never publishes is the gap
  // Story 7.1 closed. A report missing a section has left a dispatched domain
  // unreported and no reading of the workflow admits three; a heading carrying no
  // status the four-value enum recognises leaves it just as unreported, and so does
  // a gate value outside that enum, which is why the count is over declared and
  // assessed statuses rather than over headings.
  domainCoverage: 1,
  // Over the criteria ground truth declares evidence for, a real citation the
  // report made for one names the file ground truth declares for it. Two
  // designs were worked out by hand before this was calibrated: exempt a
  // criterion with no declared evidence, or count every criterion uniformly
  // and let the two structurally-empty criteria in the gapped bundle's
  // maintainability domain (Test Coverage, Code Duplication, correctly cited
  // to the tech spec to state the threshold and record that no report exists)
  // register as permanent misses. The second reads as a live-noise band worth
  // calibrating; it is not, because those two misses are a fixed count baked
  // into the bundle rather than something a model's behavior varies. Live
  // calibration settled it: `node test/eval-nfr.js --agent claude --runs 2`
  // against both bundles scored the exempting design 72/72 (100%) over both
  // repetitions of both bundles, with real evidence citations grounded
  // correctly everywhere the model did not fabricate one outright, against
  // the uniform design's fixed 72/76 (94.7%) every single repetition, never
  // moving. A live model's real behavior confirmed the clean design rather
  // than merely a hand-built fixture's, so the ceiling is 1, matching
  // domainCoverage and overallStatusAccuracy: exempting an evidence-free
  // criterion is what the workflow's own rule already means by "evidence
  // that speaks to it", not a threshold chosen to admit slack.
  groundedCitationAccuracy: 1,
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
  // A domain the gate artifact and the assessment section answer differently.
  // nfr-status-definitions.md states the two as one judgment written twice, one
  // for a machine and one for a person, so a report carrying both answers has
  // published a contradiction rather than made a judgment this suite could grade.
  // The ceiling is zero for the same reason the duplicate-section ceiling is: it is
  // a defect in the deliverable, and no reading of the workflow admits one.
  maxGateDisagreements: 0,
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
 * The existence check this used to open with is gone rather than converted: the
 * port answers absence, so asking first was a second reading of the same
 * question with a window between them.
 *
 * @returns {Promise<object|null>} Null when the file is missing or unparseable, so the
 *   caller can report that as an environment failure rather than crash inside a reporter.
 */
async function loadGroundTruth() {
  try {
    const read = await readJson(GROUND_TRUTH);
    return read.present ? read.value : null;
  } catch (error) {
    // A parse failure only. The bare catch used to swallow every class the read
    // can raise, so a permission error, a directory in place of the file or an
    // aborted signal all reported as "missing or not valid JSON": the caller was
    // told about the corpus when the fault was the tree or the install.
    if (error instanceof SyntaxError) return null;
    throw error;
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

/**
 * Every markdown heading text in a file's contents.
 *
 * Takes the lines rather than the path, because the one caller has already read
 * the file to split it: reading it a second time is the same question twice with
 * a window in between, which is the argument this whole conversion is built on.
 */
function headingsOf(lines) {
  const headings = new Set();
  for (const line of lines) {
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
 * @returns {Promise<{problems: string[], notices: string[]}>}
 */
async function validateCorpus(groundTruth) {
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
    // The existence check that used to guard this read is gone: the read answers
    // absence itself, and the same problem is reported off that answer.
    const cited = await readText(path.join(PROJECT_ROOT, citation.file));
    if (!cited.present) {
      problems.push(`skillRuleCitations.${key}: ${citation.file} does not exist`);
      continue;
    }
    const lines = cited.text.split('\n');
    if (citation.section && !headingsOf(lines).has(citation.section)) {
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
  const seenCriterionNames = new Set();
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
      // scoreRun matches a report's criterion heading to one of these names after
      // stripCriterionAnnotation strips both sides, so two declared criteria that
      // strip to the same name would share one citation list in scoreRun with
      // nothing to tell them apart; caught here, at the one place both names are
      // in hand together, rather than left to surface as moved replay numbers.
      const strippedNames = new Map();
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
        const strippedName = stripCriterionAnnotation(String(criterion.name ?? ''));
        if (strippedNames.has(strippedName)) {
          problems.push(
            `${domainLabel}: criteria "${strippedNames.get(strippedName)}" and "${criterion.name}" both strip to "${strippedName}", ` +
              'and scoreRun would share one citation list between them',
          );
        } else {
          strippedNames.set(strippedName, criterion.name);
        }
        if (typeof criterion.name === 'string') seenCriterionNames.add(criterion.name);
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

  // CRITERION_BULLET_ALIASES's two targets are literals in eval-nfr.js, not read
  // from ground-truth.json, so a rename there would otherwise surface only
  // indirectly, as a moved replay number with no named cause. Checked once,
  // against every criterion name declared anywhere in the corpus, since the
  // aliases are parser-wide rather than scoped to one bundle.
  for (const target of CRITERION_BULLET_ALIASES.values()) {
    if (!seenCriterionNames.has(target)) {
      problems.push(
        `CRITERION_BULLET_ALIASES names "${target}" as a bullet alias target, and no criterion in ground-truth.json is named that`,
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

/**
 * Digest of a file list, keyed by relative path so a rename shows up.
 *
 * The `try`/`catch` that separated `ENOENT` from everything else is gone: the
 * port makes absence a value and raises the rest, so the marker is written where
 * the read says the file was not there and a permission error still reaches the
 * caller. The digest input is unchanged, so the value it produces is the value it
 * has always produced.
 */
async function digestTree(root, relativePaths) {
  const parts = [];
  for (const relative of [...relativePaths].sort()) {
    const read = await readBytes(path.join(root, relative));
    if (read.present) parts.push(relative, read.bytes);
    else parts.push(relative, '\0missing', relative);
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
 * @returns {Promise<{dir: string, projectDir: string, bundleFiles: string[], bundleDigest: string}>}
 */
async function stageWorkspace(set) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-nfr-eval-'));
  try {
    return await stageIntoWorkspace(dir, set);
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}

async function stageIntoWorkspace(dir, set) {
  const projectDir = path.join(dir, set.projectRoot);
  const setRoot = path.join(FIXTURE_ROOT, set.root);

  for (const relative of filesUnder(setRoot)) {
    const target = path.join(projectDir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(setRoot, relative), target);
  }

  fs.mkdirSync(path.join(projectDir, 'test-artifacts'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, '_bmad', 'tea'), { recursive: true });
  await writeText(path.join(projectDir, '_bmad', 'tea', 'config.yaml'), configYaml(set));

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
  return { dir, projectDir, bundleFiles, bundleDigest: await digestTree(projectDir, bundleFiles) };
}

/**
 * Assert the staged workspace holds no part of the ground truth.
 *
 * This is the measurement's validity, so it is checked rather than assumed: no
 * staged path is named for the ground truth, no staged file carries its bytes,
 * and no staged file carries a key that appears only in it.
 *
 * @param {string} dir Workspace root.
 * @returns {Promise<string[]>} Problems, empty when the workspace is clean.
 */
async function assertGroundTruthAbsent(dir) {
  const problems = [];
  // Both existence checks are gone: each read answers absence itself. A staged
  // file that vanished between the walk and the read used to throw out of a
  // validator whose whole job is to report, and is reported now.
  const groundTruthBytes = (await readText(GROUND_TRUTH)).text;
  for (const relative of filesUnder(dir)) {
    if (path.basename(relative) === 'ground-truth.json') {
      problems.push(`staged workspace contains ${relative}`);
      continue;
    }
    const staged = await readText(path.join(dir, relative));
    if (!staged.present) {
      problems.push(`staged file ${relative} disappeared between the walk and the read, so it was not checked`);
      continue;
    }
    const text = staged.text;
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
    '- the Gate YAML snippet the template ends with, carrying `overall_status` and the',
    '  `audited_domains` block, one status per domain.',
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
async function caseIds() {
  return ((await loadGroundTruth())?.fixtureSets ?? []).map((set) => set.id);
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

/**
 * A criterion `###` heading, one level under a domain's `##` heading: the text
 * after the `#`s, trimmed.
 */
const CRITERION_HEADING = /^(#{2,6})\s+(.+?)\s*$/;

/**
 * A bullet naming a criterion and nothing else on the line, the shape
 * `nfr-report-template.md` gives Resource Usage's two sub-criteria and Disaster
 * Recovery's two sub-criteria: `- **CPU Usage**`, with the fields that would
 * normally follow a `###` heading nested one level deeper instead. A field
 * label line (`- **Status:** PASS`) always carries a value after the label, so
 * requiring nothing but whitespace to end of line is what keeps this from
 * matching one.
 */
const CRITERION_BULLET = /^\s*[-*+]\s+\*\*([^*]+)\*\*\s*$/;

/**
 * A live model's own heading text decorates a criterion far more freely than
 * the two hand-curated fixture sets that this parser's design started from.
 * Calibrating against `claude`, four live runs of the two bundles wrote
 * `MTTR (Mean Time To Recovery)`, `Compliance (GDPR)`, `Compliance (if
 * applicable)`, and `Disaster Recovery (evaluated separately — ...)` for
 * headings whose ground-truth name carries no such suffix at all, next to
 * `CI Burn-In (Stability)` against `CI Burn-In`, which is the one case the
 * stored corpus alone had shown. A per-string alias table sized to the stored
 * corpus would have missed three of those four; stripping every trailing
 * `(...)` annotation, not just the last one, is what a name written for a
 * human, decorated for a human, actually needs: a heading chaining two, `MTTR
 * (Mean Time To Recovery) (revised)`, defeats a single strip the same way an
 * un-stripped one defeats none. `Response Time (p95)` and `Availability
 * (Uptime)` carry their one parenthetical as part of the canonical name
 * itself, which is why `scoreRun` strips it from both sides rather than only
 * from the report's.
 *
 * Peels balanced trailing parenthetical groups one at a time by counting
 * parens from the end, rather than matching `[^()]*` inside a single regex: a
 * regex excluding parens from the group's own contents cannot describe a
 * group containing another group, so `Disaster Recovery (evaluated
 * separately (see appendix))` left the whole annotation unstripped under the
 * regex this replaced. Unbalanced input (an unmatched `(` or `)`) is left
 * alone rather than guessed at, since a heading that cannot be balanced is not
 * one this function can safely claim to understand.
 */
function stripCriterionAnnotation(text) {
  let result = String(text).trim();
  for (;;) {
    if (!result.endsWith(')')) return result;
    let depth = 0;
    let start = -1;
    for (let i = result.length - 1; i >= 0; i -= 1) {
      if (result[i] === ')') depth += 1;
      else if (result[i] === '(') {
        depth -= 1;
        if (depth === 0) {
          start = i;
          break;
        }
      }
    }
    if (start === -1) return result;
    result = result.slice(0, start).trimEnd();
  }
}

/**
 * Resource Usage's two sub-criteria are the one place a live report renames
 * the criterion outright rather than decorating it: `**CPU Usage**` names
 * nothing `stripCriterionAnnotation` alone can recover, because the
 * ground-truth name it stands for, `Resource Usage: CPU`, shares no substring
 * with it. Disaster Recovery's own two bullets, `**RTO (Recovery Time
 * Objective)**` and `**RPO (Recovery Point Objective)**`, are deliberately
 * absent: ground truth declares one Disaster Recovery criterion, not two, so
 * a report writing those bullets keeps citing under the heading above them,
 * which is what leaving them out of this table does.
 *
 * Looked up case-insensitively and with a trailing colon stripped
 * (`normalizeBulletKey`), since `**CPU Usage:**` and `**cpu usage**` name the
 * same bullet a live model could write either of and `stripCriterionAnnotation`
 * strips neither on its own.
 */
const normalizeBulletKey = (name) => name.replace(/:\s*$/, '').trim().toLowerCase();
const CRITERION_BULLET_ALIASES = new Map(
  [
    ['CPU Usage', 'Resource Usage: CPU'],
    ['Memory Usage', 'Resource Usage: Memory'],
  ].map(([key, value]) => [normalizeBulletKey(key), value]),
);

/**
 * The gate block that carries the four domain statuses, and the lines under it.
 *
 * The key is `audited_domains` because that is the spelling
 * `resources/nfr-assessment.example.md` has always published; Story 7.1 added it
 * to `nfr-report-template.md`, which had only the eight ADR rows under
 * `categories`. Reading `categories` for a domain would read the wrong block:
 * `security` is a key in both, and it answers a different question in each.
 *
 * A value outside the four-value enum is not recorded, which leaves the domain
 * undeclared rather than declared wrong. That is the same reading `rollupStatus`
 * gives a section spelling its status `PARTIAL`, and it is what keeps a run from
 * clearing `domainCoverage` with a word no gate consumer can act on.
 */
const DOMAIN_BLOCK_KEY = 'audited_domains';
const AUDITED_DOMAINS_KEY = new RegExp(String.raw`^(\s*)${DOMAIN_BLOCK_KEY}:\s*(?:#.*)?$`);
const AUDITED_DOMAIN_LINE =
  /^(\s*)(performance|security|reliability|maintainability):[ \t]+['"]?(PASS|CONCERNS|FAIL|N\/A)['"]?\s*(?:#.*)?$/i;

/**
 * The four domain statuses the gate block declares, read from the lines of the
 * run's own gate section.
 *
 * The block ends where the indentation returns to the key's own level, so a key
 * the block does not declare is absent rather than defaulted, and a line the enum
 * does not recognise is skipped rather than ending the block: the four domains are
 * written in one order and a bad value in the middle must not hide the ones after
 * it.
 *
 * @param {string[]} lines The raw lines of the gate section, fences included.
 * @returns {{declared: Map<string, string>, contradictions: string[]}}
 */
function gateDomainsIn(lines) {
  const start = lines.findIndex((line) => AUDITED_DOMAINS_KEY.test(line));
  if (start === -1) return { declared: new Map(), contradictions: [] };
  const indent = AUDITED_DOMAINS_KEY.exec(lines[start])[1].length;
  const declared = new Map();
  const contradictions = [];
  for (let cursor = start + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor];
    // A blank line and a comment line end nothing. Both are YAML a run writing the
    // snippet produces, and ending the block on either would read four declared
    // statuses as none, which reports a parse limit as an unreported domain.
    if (line.trim().length === 0 || line.trim().startsWith('#')) continue;
    if (/^(\s*)/.exec(line)[1].length <= indent) break;
    const entry = AUDITED_DOMAIN_LINE.exec(line);
    if (!entry) continue;
    const domain = entry[2].toLowerCase();
    const status = entry[3].toUpperCase();
    // The first line wins, the same way the first section for a domain does: a
    // block stating one domain twice has stated its answer twice, and the block
    // leads with the one a reader reads first. Every repeat is a contradiction,
    // the same domain answered more than once, whether or not the two lines
    // agree: `duplicateDomainSections` counts a second section this way
    // regardless of its status, and the gate block is held to the same rule
    // rather than a looser one that only fires when the two answers differ.
    if (!declared.has(domain)) declared.set(domain, status);
    else if (declared.get(domain) === status) contradictions.push(`${domain}: gate declares ${status} twice`);
    else contradictions.push(`${domain}: gate declares ${declared.get(domain)} and ${status}`);
  }
  return { declared, contradictions };
}

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
 * The four domain sections, the gate block's four domain statuses, the overall
 * status, and the evidence gaps, read out of the report the run wrote.
 *
 * Returns null when the document declares no section for any of the four domains,
 * which is a report this harness cannot measure rather than a run that got every
 * domain wrong. runCase reports that as an environment failure, the same way
 * test/eval-trace.js does for a matrix with no criterion section. The gate block
 * does not rescue such a report and is not meant to: four statuses with no
 * assessment behind them are an answer with no audit under it, and
 * test/replay/nfr/gapped-report-without-sections is the stored case that holds
 * this line.
 *
 * Each domain entry also carries `criteria`, a `Map<string, string[]>` from a
 * criterion name, as the report itself spells it, to every file-shaped
 * citation attributed to it. It is tracked the same way `currentDomain` is: a
 * `###` heading or a promoted bullet opens a criterion, and every citation
 * line until the next one belongs to it. The parser never reads ground truth,
 * so a heading's text is stored as written; `stripCriterionAnnotation` and the
 * match against `ground-truth.json`'s `criteria[].name` are `scoreRun`'s job,
 * where both sides of that comparison are available. `citations` above stays
 * the flat per-domain array signatureOf and maxFabricatedEvidence already
 * read; `criteria` is what `scoreRun` reads for `groundedCitationAccuracy`,
 * the two consulted for different questions rather than one replacing the
 * other.
 *
 * @param {string} text The report, as the probe observation's `report` artifact carries it.
 * @returns {{domains: Map<string, object>, gateDomains: Map<string, string>, gateSelfContradictions: string[], gateBlockDeclared: boolean, duplicateDomainSections: string[], overallStatus: string|null, evidenceGaps: string[], unknownThresholdDeclared: boolean}|null}
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
  let currentCriterion = null;
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
        currentCriterion = null;
        // A second section for a domain that already has one keeps the first.
        // Two sections state the domain's answer twice and a reader cannot tell
        // which one the overall status came from; the first is the one the report
        // leads with. The second is recorded here rather than dropped, which is
        // what lets it reach maxDuplicateDomainSections.
        const repeated = domains.has(name);
        if (repeated) duplicateDomainSections.push(name);
        currentDomain = repeated ? null : name;
        if (currentDomain !== null) {
          domains.set(name, { statuses: [], thresholdLines: [], citations: [], criteria: new Map() });
        }
        continue;
      }
      if (EVIDENCE_GAPS_HEADING.test(line.trim())) {
        inGaps = true;
        gapsDepth = depth;
        // Closes the criterion the same way the domain branch above closes
        // the domain. Left open, a gaps heading written one level under a
        // domain (rather than at the domain's own top level, where every
        // stored report writes it) would leave currentCriterion pointing at
        // whichever criterion was last open, and every file-shaped token in
        // the gap bullets below would attribute to it: the identical
        // silent-misattribution shape the depth restriction exists to close,
        // reached through this sibling branch instead.
        currentCriterion = null;
      } else if (currentDomain !== null && depth === currentDepth + 1) {
        // Exactly one level under the domain's own heading is the next
        // criterion: `depth <= currentDepth` above would already have cleared
        // currentDomain for a heading that is not nested under it, and a
        // heading nested deeper than one level (a model's own aside inside a
        // criterion, `#### Root Cause Note` under `### Fault Tolerance`) is
        // left alone rather than promoted, so it cannot silently steal the
        // still-open criterion's later citations. `currentDepth` never moves
        // off the domain's own depth, so this is a fixed one-level test, not
        // a running one; nfr-report-template.md gives every criterion exactly
        // one level under its domain, and no live calibration run has ever
        // written one any other depth. Stored as written: matching it against
        // a ground-truth criterion name is scoreRun's job, not this
        // ground-truth-blind parser's, and stripCriterionAnnotation is what it
        // uses to do that.
        const heading = CRITERION_HEADING.exec(line.trim());
        if (heading) currentCriterion = heading[2];
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
    // Resource Usage's two sub-criteria, and any bullet shaped the same way, name
    // themselves on their own line with nothing else on it. Only the two names the
    // template actually splits switch the criterion; every other such bullet
    // (Disaster Recovery's RTO/RPO, chiefly) leaves citations attributed to
    // whatever heading is still open, which is correct because ground truth
    // declares no separate criterion for either.
    const bullet = CRITERION_BULLET.exec(line);
    const bulletKey = bullet ? normalizeBulletKey(stripCriterionAnnotation(bullet[1])) : null;
    if (bulletKey !== null && CRITERION_BULLET_ALIASES.has(bulletKey)) {
      currentCriterion = CRITERION_BULLET_ALIASES.get(bulletKey);
    }
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
    // over the thirteen stored nfr reports that existed when the widening landed,
    // no line inside a domain section carried a file-shaped token except the
    // `**Evidence:**` lines already read, so no stored result moved and
    // `SCORER_VERSION` did not need a bump.
    //
    // That sentence stopped describing the corpus inside the same pull request
    // that wrote it, and stopped again in the pull request after: two more cases
    // landed, then five more landed after that for the gate-artifact reading,
    // and the corpus is twenty. Re-measured over all twenty stored reports:
    // exactly one domain-section line carries a file-shaped token outside
    // `**Evidence:**` and `**Threshold:**`, and it is the one this widening
    // exists for. `gapped-fabricated-evidence-on-a-source-label` carries
    // `- **Source:** reports/jscpd/jscpd-report.json` in its maintainability
    // section, and that case's stored result counts it as a fabricated citation,
    // so a label-scoped reading would score it zero and the case would prove
    // nothing. `gapped-report-without-sections` and
    // `gapped-gate-without-assessment-sections` declare no domain section at
    // all, so eighteen of the twenty contribute any domain-section line to the
    // measurement.
    //
    // The reading itself is held by that case rather than by this paragraph:
    // narrowing this push back to lines carrying an `**Evidence:**` label and
    // running `npm run test:eval-replay` fails
    // `nfr/gapped-fabricated-evidence-on-a-source-label` and nothing else, 1 of
    // the 20 nfr cases. The count in the paragraph above was the part nothing
    // held, which is how it shipped stale twice.
    //
    // What this does inherit is `citationsIn`'s prose reading, so a domain
    // section whose prose says `Node.js` now offers a `.js` token where before
    // only an evidence line could; that is the same reading the evidence line has
    // always had, applied to more lines.
    if (!threshold) {
      const found = citationsIn(line);
      entry.citations.push(...found);
      // Attributed to whichever criterion heading or promoted bullet is still
      // open. A line read before the first one (not observed in a real report,
      // where the first line of a domain's body is always its first criterion's
      // heading) attributes to nothing, the same way an unrecognised criterion
      // name does in `scoreRun`: silently not scored, neither grounded nor not.
      if (currentCriterion !== null && found.length > 0) {
        const list = entry.criteria.get(currentCriterion) ?? [];
        list.push(...found);
        entry.criteria.set(currentCriterion, list);
      }
    }
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
  // The same slice for both readings the gate carries. The domain block is
  // separated from a quoted example's by the heading exactly as the scalar is,
  // and test/replay/nfr/gapped-example-quoted-in-fence is the case that proves it
  // has to be: the example it quotes carries its own `audited_domains` map whose
  // four values contradict the run's own.
  const gateLines = gateStart === -1 ? [] : raw.slice(gateStart, gateEnd);
  const gateBlock = gateDomainsIn(gateLines);
  const overall = gateStart === -1 ? null : OVERALL_STATUS.exec(gateLines.join('\n'));
  return {
    domains,
    gateDomains: gateBlock.declared,
    // A domain the block itself answers twice, differently. Recorded beside the
    // statuses because the count it feeds is about the artifact carrying two
    // answers, whichever pair of places they are written in.
    gateSelfContradictions: gateBlock.contradictions,
    // The key appearing anywhere in the document, which is the weakest reading of
    // the block and the only one the contract's own vocabulary can state: an oracle
    // reads the report as one string, so it can say the key is present and cannot
    // say it is present in the run's own gate section rather than inside a quoted
    // example. It is recorded at exactly that strength so the oracle and its scorer
    // make one claim rather than two similar ones, the way `coverage.sections` is
    // recorded beside the stricter `coverage.present`.
    //
    // `gateDomains` above is the strict reading and is what every measurement uses.
    // test/replay/nfr/gapped-block-only-in-the-quoted-example is the case where the
    // two separate: the key is in the document, no domain is declared by the run,
    // and the report scores zero coverage.
    gateBlockDeclared: document.includes(`${DOMAIN_BLOCK_KEY}:`),
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
 * @returns {Promise<{ok: true, report: object}|{ok: false, failureClass: string, reason: string}>}
 */
async function readReport(directory) {
  // The existence check that used to guard this read is gone: the read answers
  // absence, and `absent` is the tagged artifact a run that wrote nothing leaves.
  const read = await readText(path.join(directory, 'test-artifacts', 'nfr-assessment.md'));
  return reportFromArtifact(read.present ? { kind: 'text', value: read.text } : { kind: 'absent' });
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
  return { ok: true, report: parsed, text: artifact.value };
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
    // The gate artifact is the answer scored. The section is read beside it, and
    // the two are held to agreeing below.
    const gate = report.gateDomains.get(name) ?? null;
    return {
      domain: name,
      // A domain is covered when the gate artifact declares a status for it and
      // the document assesses it. Both halves are the deliverable: four gate lines
      // with no assessment behind them are an answer nobody can check, and an
      // assessment the gate never publishes is the gap this story closed. A
      // heading with no line STATUS_LINE recognises leaves the domain unassessed
      // just as surely as no heading does, and a gate value outside the four-value
      // enum leaves it undeclared the same way, because gateDomainsIn drops an
      // unrecognised token. Such a report is also a miss under
      // domainStatusAccuracy, on `ok` below. The two are not one defect counted
      // twice: coverage is about the deliverable being complete and the accuracy is
      // about the judgment being right, and `sections` below records the heading
      // count so a reader can tell a missing section from an unreadable one.
      present: gate != null && reported?.status != null,
      expected: declared.expectedStatus,
      reported: gate,
      // The section's own rollup, carried so a reader of a failing run can see
      // which half of the deliverable moved.
      sectionStatus: reported?.status ?? null,
      undecidable: declared.isUndecidable === true,
      ok: gate === declared.expectedStatus,
      threshold: scoreThreshold(declared, reported),
    };
  });

  // A domain the two halves answer differently. Only a domain both of them answer
  // can contradict: a gate line with no readable section, or a section the gate
  // never publishes, is an incomplete deliverable and is counted by
  // domainCoverage, not here. Inventing a contradiction out of a missing half
  // would put two names on one defect and make a ceiling of zero unreachable for a
  // report that is merely short.
  const gateDisagreements = [
    ...domainResults
      .filter((item) => item.reported != null && item.sectionStatus != null && item.reported !== item.sectionStatus)
      .map((item) => `${item.domain}: gate ${item.reported}, section ${item.sectionStatus}`),
    ...report.gateSelfContradictions,
  ];

  // A PASS on a domain whose status the workflow's own rules say cannot be
  // reached from this bundle. This is the measurement the suite exists for, and
  // it is counted apart from the status accuracy so that one wrong judgment of
  // eight cannot absorb it.
  // A PASS published in either half. The gate is the answer this suite scores, and
  // the section is the answer a person reads, so a run that passes an undecidable
  // domain in its prose has published the judgment the workflow's own rules forbid
  // whatever its gate line says. Counting the gate alone would let the headline
  // ceiling of the suite be cleared by writing CONCERNS in one line and PASS in
  // twelve, and the disagreement that pairing also produces is a different defect
  // counted separately.
  const unsupportedPass = domainResults
    .filter((item) => item.undecidable && (item.reported === 'PASS' || item.sectionStatus === 'PASS'))
    .map((item) => item.domain);

  const fabricated = [];
  for (const [name, entry] of report.domains) {
    for (const citation of entry.citations) {
      if (!known.has(path.basename(citation))) fabricated.push(`${name} -> ${citation}`);
    }
  }

  // Whether a domain's citations speak to the criterion they were cited for,
  // over the criteria ground truth declares evidence for. Fabrication above
  // asks whether a cited file is in the bundle at all; this asks the
  // different question a real file cannot answer for itself, whether it is
  // the file ground truth names for THIS criterion.
  //
  // A criterion with no declared evidence is excluded outright: the gapped
  // bundle's Test Coverage and Code Duplication have none, and a report that
  // cites the tech spec there to state the threshold and record that no report
  // exists is correct, not a miss with nothing to check it against. A
  // criterion the report never cited is excluded too -- that is a missing
  // citation, a different failure this measurement does not speak to. And a
  // citation already counted as fabricated above is excluded from the
  // criteria it was cited under: a file absent from the bundle cannot also be
  // scored as the wrong file for this one, or one defect would be named twice.
  //
  // Matched by `stripCriterionAnnotation` on both sides, because a live
  // model's own heading text decorates a criterion far more freely than the
  // stored fixtures alone showed; see the note on that function. A criterion
  // this report's heading text does not resolve to any declared name at all
  // is silently excluded the same way an uncited one is, since there is
  // nothing in `set.domains[domain].criteria` to check it against.
  //
  // Two report headings that strip to the same name are concatenated rather
  // than letting the second overwrite the first. `reportedCriteria` is keyed
  // on the raw heading text, so both are present and distinct there; folding
  // them with `new Map(...)` would keep only whichever came last, discarding
  // the other's citations with nothing to show they existed. That is the
  // same silent-loss shape the depth restriction above exists to close, one
  // step later: a correct citation under the first of two same-stripped
  // headings would vanish if the second, unrelated one, happened to be
  // written last, and the real.every() check below could then read a wrong
  // citation as the only one that ever existed. Concatenating instead scores
  // every real citation from either heading against the criterion, so an
  // extra wrong one is still caught by real.every() rather than silently
  // dropped.
  const ungroundedCitations = [];
  let groundedCriteriaHits = 0;
  let groundedCriteriaTotal = 0;
  for (const domainName of DOMAINS) {
    const declaredCriteria = set.domains[domainName]?.criteria ?? [];
    const reportedCriteria = report.domains.get(domainName)?.criteria ?? new Map();
    const byStrippedName = new Map();
    for (const [name, cites] of reportedCriteria) {
      const key = stripCriterionAnnotation(name);
      byStrippedName.set(key, [...(byStrippedName.get(key) ?? []), ...cites]);
    }
    for (const criterion of declaredCriteria) {
      if ((criterion.evidence ?? []).length === 0) continue;
      const cited = byStrippedName.get(stripCriterionAnnotation(criterion.name));
      if (!cited || cited.length === 0) continue;
      const real = cited.filter((file) => known.has(path.basename(file)));
      if (real.length === 0) continue;
      groundedCriteriaTotal += 1;
      // Every real citation has to match, not just one of them: a criterion
      // cited with both the right file and an extra real-but-wrong one is not
      // grounded, because the wrong file is still a citation of a real but
      // irrelevant file, exactly what AC1 says cannot read as grounding. Only
      // the mismatched file(s) are named below; the correct one alongside them
      // is not a finding.
      const mismatched = real.filter((file) => !criterion.evidence.some((declared) => path.basename(declared) === path.basename(file)));
      if (mismatched.length === 0) groundedCriteriaHits += 1;
      else ungroundedCitations.push(`${domainName}: ${criterion.name} -> ${mismatched.join(', ')}`);
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
    // A domain the gate never answered is not a finding against the bundle. It is an
    // incomplete deliverable, which domainCoverage already reports; counting it here
    // would fail the run on the invented-finding ceiling and name the wrong defect.
    cleanFalsePositives += domainResults.filter((item) => item.reported != null && item.reported !== 'PASS').length;
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
    gateBlockDeclared: report.gateBlockDeclared,
    // A domain the report assessed twice. The status above is the first section's,
    // which is what the report leads with, and the second section is counted here
    // so a run that contradicts itself fails the suite on the contradiction.
    duplicateDomainSections: report.duplicateDomainSections,
    gateDisagreements,
    unsupportedPass,
    fabricated,
    // Over the criteria with declared evidence, a citation the report actually
    // made, and a resolving file: `groundedCriteria.hits`/`.total` is what
    // groundedCitationAccuracy aggregates, and `ungroundedCitations` names the
    // misses the way `fabricated` names its own.
    groundedCriteria: { hits: groundedCriteriaHits, total: groundedCriteriaTotal },
    ungroundedCitations,
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
    // Both halves of each domain's answer. `reported` is the gate's and is what the
    // suite scores; `sectionStatus` is the document's and is scored through
    // gateDisagreements and unsupportedPass, so a signature carrying only the gate
    // would let two runs whose prose disagrees sign identically wherever the gate
    // half is absent, and maxUnstableCases would be a claim about the gate alone.
    scored.domainResults.map((item) => `${item.domain}=${item.reported}/${item.sectionStatus}/${item.present}/${item.threshold.actual}`),
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
    scored.gateBlockDeclared,
    scored.duplicateDomainSections,
    scored.gateDisagreements,
    scored.unsupportedPass,
    scored.fabricated,
    // Which criterion a citation was attributed to, not only which files were
    // cited. Two runs can carry the identical flat citation list in `citations`
    // above and still disagree on which criterion each file was cited for --
    // swapping two headings while the citations beneath them keep the same
    // document order reorders nothing in that flat array -- so grounding needs
    // its own place here rather than riding on citations already covering it.
    scored.groundedCriteria,
    scored.ungroundedCitations,
    scored.evidenceGaps,
    scored.overall.actual,
    scored.unknownThreshold.actual,
    scored.cleanFalsePositives,
    mutations,
  ]);
}

function nfrDiagnosticProjection(scored, mutations) {
  const undecidable = scored.domainResults.filter((item) => item.undecidable);
  return {
    domainStatusAccuracy: {
      numerator: scored.domainResults.filter((item) => item.ok).length,
      denominator: scored.domainResults.length,
      threshold: THRESHOLDS.domainStatusAccuracy,
    },
    undecidableDomainAccuracy: {
      numerator: undecidable.filter((item) => item.ok).length,
      denominator: undecidable.length,
      threshold: THRESHOLDS.undecidableDomainAccuracy,
    },
    thresholdFidelityAccuracy: {
      numerator: scored.domainResults.filter((item) => item.threshold.ok).length + (scored.unknownThreshold.ok ? 1 : 0),
      denominator: scored.domainResults.length + 1,
      threshold: THRESHOLDS.thresholdFidelityAccuracy,
    },
    overallStatusAccuracy: { numerator: scored.overall.ok ? 1 : 0, denominator: 1, threshold: THRESHOLDS.overallStatusAccuracy },
    domainCoverage: { numerator: scored.coverage.present, denominator: scored.coverage.total, threshold: THRESHOLDS.domainCoverage },
    groundedCitationAccuracy: {
      numerator: scored.groundedCriteria.hits,
      denominator: scored.groundedCriteria.total,
      threshold: THRESHOLDS.groundedCitationAccuracy,
    },
    duplicateDomainSections: scored.duplicateDomainSections.length,
    maxDuplicateDomainSections: THRESHOLDS.maxDuplicateDomainSections,
    gateDisagreements: scored.gateDisagreements.length,
    maxGateDisagreements: THRESHOLDS.maxGateDisagreements,
    unsupportedPass: scored.unsupportedPass.length,
    maxUnsupportedPass: THRESHOLDS.maxUnsupportedPass,
    fabricatedEvidence: scored.fabricated.length,
    maxFabricatedEvidence: THRESHOLDS.maxFabricatedEvidence,
    cleanFalsePositives: scored.cleanFalsePositives,
    maxCleanFalsePositives: THRESHOLDS.maxCleanFalsePositives,
    fixtureMutations: mutations,
    maxFixtureMutations: THRESHOLDS.maxFixtureMutations,
    maxUnstableCases: THRESHOLDS.maxUnstableCases,
  };
}

function nfrDiagnosticClassifier(diagnostics) {
  const variants = new Map();
  for (const entry of diagnostics) {
    if (entry.completionState !== 'completed') continue;
    if (!variants.has(entry.caseId)) variants.set(entry.caseId, new Set());
    variants.get(entry.caseId).add(entry.signature);
  }
  return (entry, failures) => {
    const metric = entry.metricContributions;
    const failed = failures.join('; ');
    const reasons = [];
    for (const key of [
      'domainStatusAccuracy',
      'undecidableDomainAccuracy',
      'thresholdFidelityAccuracy',
      'overallStatusAccuracy',
      'domainCoverage',
      'groundedCitationAccuracy',
    ]) {
      if (!failed.includes(key)) continue;
      if (diagnosticRateMiss(entry, key, diagnostics)) reasons.push(key);
    }
    for (const [needle, value, ceiling] of [
      ['duplicate domain section', 'duplicateDomainSections', 'maxDuplicateDomainSections'],
      ['gate artifact', 'gateDisagreements', 'maxGateDisagreements'],
      ['unsupported PASS', 'unsupportedPass', 'maxUnsupportedPass'],
      ['fabricated evidence', 'fabricatedEvidence', 'maxFabricatedEvidence'],
      ['clean false positives', 'cleanFalsePositives', 'maxCleanFalsePositives'],
      ['fixture mutations', 'fixtureMutations', 'maxFixtureMutations'],
    ]) {
      if (failed.includes(needle) && metric[value] > metric[ceiling]) reasons.push(value);
    }
    const unstable = (variants.get(entry.caseId)?.size ?? 0) > 1;
    if (failed.includes('unstable case') && unstable) reasons.push('unstable case');
    if (reasons.length === 0) return null;
    return {
      reasons,
      rootCause: reasons.length === 1 && reasons[0] === 'unstable case' ? 'model-instability' : 'tea-workflow-defect',
    };
  };
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
  let workspace = await stageWorkspace(set);
  try {
    const treeBefore = workingTreeState(PROJECT_ROOT);
    const portForAttempt = async (attempt) => {
      if (attempt > 1) {
        fs.rmSync(workspace.dir, { recursive: true, force: true });
        workspace = await stageWorkspace(set);
      }
      const leaked = await assertGroundTruthAbsent(workspace.dir);
      if (leaked.length > 0) {
        return { ok: false, failureClass: 'environment-configuration', reason: leaked.join('; ') };
      }
      const { port } = await createProbePort({
        cwd: workspace.dir,
        interfaceIds: [NFR_INTERFACE],
        artifacts: { [NFR_INTERFACE]: nfrArtifactPaths(set) },
        // The operator's own pass-through names, so the authorization permits
        // exactly what the request below declares.
        environmentKeys: { [NFR_INTERFACE]: options.envPass },
      });
      return port;
    };
    const result = await probeCommandWithRetry(
      portForAttempt,
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
    const mutations = (await digestTree(workspace.projectDir, workspace.bundleFiles)) === workspace.bundleDigest ? 0 : 1;
    const added = filesUnder(workspace.projectDir).filter(
      (relative) =>
        !relative.startsWith(`test-artifacts${path.sep}`) &&
        !relative.startsWith(`_bmad${path.sep}`) &&
        !workspace.bundleFiles.includes(relative),
    );

    return {
      ok: true,
      scored: scoreRun(set, report.report),
      mutations: mutations + added.length,
      artifactEvidence: artifactEvidence(nfrArtifactPaths(set).report, report.text),
    };
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
      suite = suiteById((await loadSuiteManifest(PROJECT_ROOT)).manifest, SUITE_ID);
    } catch (error) {
      console.error(`${colors.red}eval: ${error.message}${colors.reset}`);
      process.exit(2);
    }
    const cases = caseIndex(sets).map((item) => ({ id: item.id, promptDigest: digest(item.prompt) }));
    await writeSuiteResult(
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
        fixtureDigest: await digestFiles(PROJECT_ROOT, suite.fixtures),
        promptDigest: digestPrompts(caseIndex(sets)),
        cases,
        runners,
        declaredRepetitions: options.runs,
        durationMs: await elapsedMsSince(startedAt),
        suiteFailureClasses,
        contractVersions: await contractVersionsFor(suite, PROJECT_ROOT),
      }),
    );
    console.log(`${colors.dim}result written to ${options.jsonPath}${colors.reset}`);
  }

  process.exit(exitCode);
}

/** The per-runner half of the result record. */
function runnerRecord(
  agent,
  options,
  versions,
  { expected, completed, measurements, durationMs, failures, diagnostics = [], diagnosticClassifier },
) {
  const executable = agent === 'custom' ? options.agentCmd : agent;
  const classifiedDiagnostics = classifyDiagnosticQuality(diagnostics, failures, diagnosticClassifier, {
    measurements,
    expected,
    completed,
  });
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
    failureClass: worstFailureClass(classifiedDiagnostics.map((entry) => entry.failureClass)),
    failures,
    diagnostics: classifiedDiagnostics,
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

  const groundTruth = await loadGroundTruth();
  if (!groundTruth) {
    console.error(`${colors.red}eval: ground truth at ${GROUND_TRUTH} is missing or not valid JSON${colors.reset}`);
    await finish({ options, startedAt, mode: staticMode, sets: [], runners: [], suiteFailureClasses: ['environment-missing-artifact'] });
  }

  const sets = selectSets(groundTruth, options.sets);
  if (sets.length === 0) {
    console.error(`${colors.red}eval: no fixture set matched ${options.sets.join(', ')}${colors.reset}`);
    await finish({ options, startedAt, mode: staticMode, sets: [], runners: [], suiteFailureClasses: ['environment-configuration'] });
  }

  const { problems, notices } = await validateCorpus(groundTruth);
  for (const notice of notices) console.log(`  ${colors.yellow}drift${colors.reset} ${notice}`);
  if (problems.length > 0) {
    console.error(`${colors.red}the corpus is inconsistent:${colors.reset}`);
    for (const problem of problems) console.error(`  ${colors.red}✗${colors.reset} ${problem}`);
    console.error('');
    // An inconsistent corpus is a real finding about the repository, measured
    // without a model call, so it keeps the exit 1 the sibling harnesses give the
    // same case.
    await finish({
      options,
      startedAt,
      mode: staticMode,
      sets: [],
      runners: [],
      suiteFailureClasses: problems.map((message) => ({ failureClass: 'quality', rootCause: 'corpus-defect', message })),
    });
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
      const workspace = await stageWorkspace(set);
      try {
        const leaked = [
          ...(await assertGroundTruthAbsent(workspace.dir)),
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
      suiteFailureClasses: readiness,
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
      gateDisagreements: 0,
      unsupportedPass: 0,
      fabricated: 0,
      groundedTotal: 0,
      groundedHits: 0,
      cleanFalsePositives: 0,
      mutations: 0,
    };
    let completedRuns = 0;
    let unstableCases = 0;
    let incompleteCases = 0;
    const lostRunClasses = [];
    const diagnostics = [];

    for (const set of sets) {
      const signatures = new Set();
      const caseScores = [];
      for (let runIndex = 0; runIndex < runs; runIndex += 1) {
        const outcome = await runCase(set, options, agent, runIndex);
        if (!outcome.ok) {
          console.error(`  ${colors.red}${set.id} run ${runIndex + 1}: ${outcome.reason}${colors.reset}`);
          lostRunClasses.push(outcome.failureClass);
          diagnostics.push(
            diagnosticRecord({ caseId: set.id, repetition: runIndex + 1, failureClass: outcome.failureClass, reason: outcome.reason }),
          );
          continue;
        }
        caseScores.push(outcome.scored);
        totals.mutations += outcome.mutations;
        const signature = signatureOf(outcome.scored, outcome.mutations);
        signatures.add(signature);
        diagnostics.push(
          diagnosticRecord({
            caseId: set.id,
            repetition: runIndex + 1,
            signature,
            metricContributions: numericContributions(nfrDiagnosticProjection(outcome.scored, outcome.mutations)),
            evidence: [{ kind: 'output-signature', value: signature }, ...outcome.artifactEvidence],
          }),
        );
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
        totals.gateDisagreements += scored.gateDisagreements.length;
        totals.unsupportedPass += scored.unsupportedPass.length;
        totals.fabricated += scored.fabricated.length;
        totals.groundedTotal += scored.groundedCriteria.total;
        totals.groundedHits += scored.groundedCriteria.hits;
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
      for (const entry of first.gateDisagreements) console.log(`        ${colors.red}gate contradicts section:${colors.reset} ${entry}`);
      for (const domain of first.unsupportedPass) console.log(`        ${colors.red}unsupported PASS:${colors.reset} ${domain}`);
      for (const entry of first.fabricated) console.log(`        ${colors.red}fabricated evidence:${colors.reset} ${entry}`);
      for (const entry of first.ungroundedCitations) console.log(`        ${colors.red}ungrounded citation:${colors.reset} ${entry}`);
      if (!complete) incompleteCases += 1;
      else if (!stable) unstableCases += 1;
    }

    const measurements = {
      domainStatusAccuracy: measured(ratio(totals.statusHits, totals.statusTotal)),
      undecidableDomainAccuracy: measured(ratio(totals.undecidableHits, totals.undecidableTotal)),
      thresholdFidelityAccuracy: measured(ratio(totals.thresholdHits, totals.thresholdTotal)),
      overallStatusAccuracy: measured(ratio(totals.overallHits, totals.overallTotal)),
      domainCoverage: measured(ratio(totals.coverageHits, totals.coverageTotal)),
      groundedCitationAccuracy: measured(ratio(totals.groundedHits, totals.groundedTotal)),
      duplicateDomainSections: totals.duplicateDomainSections,
      gateDisagreements: totals.gateDisagreements,
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
      ['grounded citations ', 'groundedCitationAccuracy'],
    ]) {
      const value = measurements[key] === null ? Number.NaN : measurements[key];
      console.log(`  ${label} ${pct(value)}   (threshold ${pct(THRESHOLDS[key])})`);
    }
    console.log(
      `  duplicate sections  ${String(totals.duplicateDomainSections).padStart(4)}   (max ${THRESHOLDS.maxDuplicateDomainSections})`,
    );
    console.log(`  gate disagreements  ${String(totals.gateDisagreements).padStart(4)}   (max ${THRESHOLDS.maxGateDisagreements})`);
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
      'groundedCitationAccuracy',
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
    if (totals.gateDisagreements > THRESHOLDS.maxGateDisagreements) {
      failures.push(`${totals.gateDisagreements} domain(s) where the gate artifact and the assessment section disagree`);
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
          diagnostics,
          diagnosticClassifier: nfrDiagnosticClassifier(diagnostics),
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
        diagnostics,
        diagnosticClassifier: nfrDiagnosticClassifier(diagnostics),
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
  runnerRecord,
  parseArgs,
  loadGroundTruth,
  validateCorpus,
  stripCriterionAnnotation,
  CRITERION_BULLET_ALIASES,
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
  nfrDiagnosticProjection,
  nfrDiagnosticClassifier,
  DOMAINS,
  DOMAIN_BLOCK_KEY,
  RUNNER_CAPABILITIES,
  THRESHOLDS,
  SUITE_ID,
  UNKNOWN_TOKEN,
  NFR_INTERFACE,
  NFR_OPERATION,
};
