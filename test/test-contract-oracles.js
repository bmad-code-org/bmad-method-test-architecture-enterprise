/**
 * Evaluate every oracle in every Behavioral Evaluation Contract, with
 * eval-quality's own evaluator, over evidence this repository already holds, and
 * check that each oracle says what the harness scorer says about the same
 * evidence.
 *
 * Nothing read the oracles before this. `npm run test:contracts` compiles a
 * contract, which checks its shape and its discipline rules and never runs an
 * operator; `npm run test:contract-sources` checks the JSON is what the generator
 * writes. An oracle could therefore be well formed, generated, and unevaluable,
 * and eleven of the thirteen in test-review.contract.json were: every regex
 * pattern was shaped as an optional group around a dot-star, which eval-quality's
 * operator refuses before matching anything, as a catastrophic-backtracking risk.
 * The first evaluation of a plant oracle threw `budget-exhausted`. This check is
 * what found that, and it is what keeps the next such defect from lasting.
 *
 * WHAT IS EVALUATED, AND AGAINST WHAT
 *
 *   test-review          Every stored verdict under test/replay/test-review is one
 *                        observation of the `review-corpus` step: the verdict as
 *                        the `verdict` artifact and the exit code the CLI would
 *                        have produced for its recommendation. All thirteen
 *                        oracles resolve over it, and each is compared with what
 *                        scoreVerdict computed from the same verdict: a plant
 *                        oracle holds exactly when the plant is a hit, the clean
 *                        oracle when no finding names the clean control, the scope
 *                        oracle when no finding is out of scope, the verdict-shape
 *                        oracle when the verdict has a findings array, the exit
 *                        oracle when the CLI would exit 1.
 *
 *   fragment-selection   Every case in every evals.json is the plan step its
 *                        contract names. Each is evaluated over three constructed
 *                        selections: the mandated set exactly, the mandated set
 *                        plus one excluded fragment, and the mandated set minus one
 *                        fragment. The containment oracle must hold on the first
 *                        two and fail on the third, the exclusion oracle must hold
 *                        on the first and third and fail on the second, and both
 *                        must agree with scoreCase on every one. The three stored
 *                        stdout captures under test/replay/fragment-selection are
 *                        evaluated as well, through the same parser the runner
 *                        applies to a live reply.
 *
 *   trace                Every stored trace run under test/replay/trace is one
 *                        observation of the plan step for the fixture set it was
 *                        frozen from: the summary as the `summary` artifact, the
 *                        matrix as the `matrix` artifact, exit code 0. Every
 *                        oracle the contract states for that set resolves over it
 *                        and is compared with the check it restates in scoreRun,
 *                        through the correspondence tools/generate-contracts.js
 *                        writes beside each oracle. The other set's oracles are
 *                        evaluated over the same run too, so every oracle is seen
 *                        resolving false on evidence that fails it.
 *
 *   nfr                  Every stored NFR run under test/replay/nfr is one
 *                        observation of the plan step for the evidence bundle it
 *                        was frozen from: the report as the `report` artifact,
 *                        exit code 0. The same two rules as trace: each oracle is
 *                        compared with the check it restates, and the other
 *                        bundle's oracles are evaluated over the same run so every
 *                        oracle is seen resolving false. A report the harness
 *                        refuses, because it declares no section for any of the
 *                        four audited domains, is skipped entirely rather than
 *                        compared, for the reason the trace matrix is: the
 *                        deliverable is markdown and every oracle reads it as one
 *                        string, so there is no measurement to compare with.
 *
 * AGREEMENT
 *
 * An oracle may never contradict the scorer. Where the scorer passes, the oracle
 * resolves `true`. Where the scorer fails, the oracle resolves `false`. Where the
 * scorer cannot score at all, because the verdict carries no findings array or
 * the reply carried no selection, the oracle resolves anything but `true`.
 *
 * One divergence is admitted, and only in the shape AD-4 names: an oracle that
 * quantifies over an empty collection resolves `insufficient-evidence` with the
 * `empty-collection` introduction condition recorded on the node that hit it.
 * The harness reads an empty findings array as a reviewer that named nothing,
 * which is a measured miss of every plant; the contract vocabulary reads it as
 * no evidence and abstains. Both are stated readings, and this check accepts the
 * abstention exactly when the resolution tree says the collection was empty, so
 * an oracle that abstained for any other reason on failing evidence is still a
 * disagreement. test/contracts/README.md records the divergence beside the
 * fractional-recall one.
 *
 * Trace adds two stated exceptions of its own. The waiver oracles are compared
 * only where scoreWaivers scored them, because the harness skips the waiver
 * block when the gate did not match so that one wrong gate is not scored three
 * times, and the spec's scorer half says so with undefined. And a run the
 * harness refuses before scoring splits on why: a summary it refuses, for its
 * schema version or its shape, is a run the contract's run-measured oracle must
 * also refuse, and its other oracles are not compared because there is no
 * measurement to compare with; a matrix it refuses, one with no criterion
 * section, is outside the operator vocabulary altogether, since the matrix is
 * markdown and every oracle reads the summary, so nothing is compared and the
 * skip is printed.
 *
 * The evaluator is eval-quality's, loaded from the installed package's `dist/`
 * by file path, because no barrel exports it and the package's `exports` map has
 * no wildcard. `test/test-contracts.js` no longer reaches into `dist/` at all: it
 * calls the exported `compile` and reads the fault it throws. This file is the
 * one remaining path-level coupling, the devDependency is pinned to an exact
 * version, and the coupling is stated here.
 *
 * Usage: node test/test-contract-oracles.js
 * Exit codes: 0 every oracle evaluated and agreed, 1 an oracle faulted or disagreed,
 * 2 the corpus or the evaluator could not be loaded
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { parseSelection } = require('../cli/lib/parse-selection');
const { verdictFor } = require('../cli/lib/parse-report');
const { scoreVerdict } = require('./eval-test-review');
const { loadSuites, scoreCase } = require('./eval-fragment-selection');
const {
  loadGroundTruth: loadTraceGroundTruth,
  parseMatrix,
  scoreRun: scoreTraceRun,
  summaryFromArtifact,
  TRACE_OPERATION,
} = require('./eval-trace');
const {
  loadGroundTruth: loadNfrGroundTruth,
  reportFromArtifact: nfrReportFromArtifact,
  scoreRun: scoreNfrRun,
  NFR_OPERATION,
} = require('./eval-nfr');
const { parseRouting } = require('../cli/lib/parse-routing');
const {
  correctRoutingAnswer,
  loadCorpus: loadRoutingCorpus,
  menuItems: routingMenuItems,
  scoreCase: scoreRoutingCase,
  ROUTING_OPERATION,
} = require('./eval-bmad-tea-routing');
const { findCases } = require('./test-eval-replay');
// The correspondence between each trace or nfr oracle and the scoreRun check it
// restates is written once, in the generator beside the oracle itself.
const {
  nfrOracleSpecs,
  nfrStepId,
  traceOracleSpecs,
  traceStepId,
  routingOracleSpecs,
  ROUTING_CONTRACTS,
} = require('../tools/generate-contracts');
// Same rule for test-design: the generator owns the correspondence between each
// oracle and the harness predicate it is paired with, so it is imported rather
// than restated here.
const { testDesignOracleSpecs, testDesignStepId } = require('../tools/generate-contracts');
const {
  readDesign: readTestDesign,
  scoreRun: scoreTestDesignRun,
  loadGroundTruth: loadTestDesignGroundTruth,
  TEST_DESIGN_OPERATION,
} = require('./eval-test-design');

const { scoringPolicy } = require('./lib/eval-quality-inputs');

const PROJECT_ROOT = path.join(__dirname, '..');
const CONTRACT_ROOT = path.join(__dirname, 'contracts');
const GROUND_TRUTH = path.join(__dirname, 'fixtures', 'test-review-eval', 'ground-truth.json');

/**
 * The regex step budget every oracle here is evaluated under.
 *
 * Read from test/probes/scoring-policy.json rather than restated, because that is
 * the policy TEA actually scores with and two numbers for one budget is a drift
 * nobody watches. It had already drifted: this constant was 10,000 with a comment
 * saying "the budget is never approached", while the shipped policy declares
 * 1,000,000. The comment was true of the evidence the two older contracts address,
 * which is a JSON field holding a short string. It stopped being true the moment a
 * contract addressed a whole markdown document, because the estimated step count
 * scales with the length of the value matched: test-design's oracles estimate up to
 * 29,436 steps against a three-kilobyte document and would have faulted here at
 * budget-exhausted while scoring cleanly under the policy every real run uses.
 */
const REGEX_STEP_BUDGET = scoringPolicy().regexMatchStepBudget;

const colors = {
  reset: '[0m',
  red: '[31m',
  green: '[32m',
  dim: '[2m',
};

let passed = 0;
let failed = 0;

function assert(condition, label, detail) {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.log(`  ${colors.red}✗ ${label}${colors.reset}`);
  if (detail) console.log(`    ${colors.dim}${detail}${colors.reset}`);
}

function unreadable(message) {
  console.error(`${colors.red}contract oracles: ${message}${colors.reset}`);
  process.exit(2);
}

function readJson(absolute, label) {
  if (!fs.existsSync(absolute)) unreadable(`${label} not found at ${path.relative(PROJECT_ROOT, absolute)}`);
  try {
    return JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch (error) {
    unreadable(`${label} is not valid JSON: ${error.message}`);
  }
}

/** eval-quality's evaluator, or exit 2 with the reason it could not be loaded. */
async function loadEvaluator() {
  let root;
  try {
    root = path.dirname(require.resolve('eval-quality/package.json', { paths: [PROJECT_ROOT] }));
  } catch {
    unreadable('eval-quality is not installed; it is a declared devDependency, so run npm install');
  }
  const load = (relative) => import(pathToFileURL(path.join(root, 'dist', 'core', relative)).href);
  try {
    const [resolution, evidence] = await Promise.all([load('evaluate/resolution.js'), load('evaluate/evidence-resolution.js')]);
    return {
      resolveCheck: resolution.resolveCheck,
      makeResolveOperand: evidence.makeResolveOperand,
      makePointerDenotesCollection: evidence.makePointerDenotesCollection,
      referenceSetKeysOf: evidence.referenceSetKeysOf,
    };
  } catch (error) {
    unreadable(`eval-quality's evaluator could not be loaded from ${root}/dist/core: ${error.message}`);
  }
}

/**
 * One observation of one command step, in the shape eval-quality's
 * `Observation` schema declares, with every channel a contract here never
 * addresses left null or absent.
 */
function observation({ operationId, exitCode = null, stdout = { kind: 'absent' }, artifacts = {} }) {
  return {
    observationId: `${operationId}-1`,
    sequence: 1,
    operationId,
    provenance: 'baseline',
    principal: null,
    callInputs: { path: null, query: null, header: null, body: null, argument: null, option: null, environment: null, stdin: null },
    responseBody: null,
    responseHeaders: null,
    responseStatus: null,
    stdout,
    stderr: { kind: 'absent' },
    exitCode,
    artifacts,
  };
}

/** Whether any node in a resolution tree abstained because its collection was empty. */
function sawEmptyCollection(node) {
  if (!node) return false;
  if (node.introductionCondition === 'empty-collection') return true;
  return (node.children ?? []).some((child) => sawEmptyCollection(child));
}

/**
 * Every oracle of one contract resolved over one set of step observations.
 *
 * @returns {Map<string, {resolution: string, emptyCollection: boolean}|{fault: string}>} By oracle id.
 */
function evaluateOracles(evaluator, contract, stepObservations) {
  const referenceSets = Object.fromEntries(Object.entries(contract.referenceSets ?? {}).map(([id, set]) => [id, set.members]));
  const resolveOperand = evaluator.makeResolveOperand(stepObservations, referenceSets);
  const denotesCollection = evaluator.makePointerDenotesCollection(contract);
  const referenceSetKeys = evaluator.referenceSetKeysOf(contract);
  const results = new Map();
  for (const oracle of contract.oracles) {
    try {
      const resolved = evaluator.resolveCheck(
        oracle.check,
        resolveOperand,
        denotesCollection,
        referenceSetKeys,
        REGEX_STEP_BUDGET,
        `oracles/${oracle.id}`,
      );
      results.set(oracle.id, { resolution: resolved.resolution, emptyCollection: sawEmptyCollection(resolved) });
    } catch (error) {
      results.set(oracle.id, { fault: `${error.code ?? 'error'}: ${error.message}` });
    }
  }
  return results;
}

/**
 * Whether an oracle's resolution agrees with what the scorer said about the same
 * evidence; see AGREEMENT in the header.
 *
 * @param {object|undefined} result The oracle's evaluation.
 * @param {boolean|null} scorer True where the scorer passed, false where it failed, null where it could not score.
 */
function agrees(result, scorer) {
  if (!result || result.fault) return false;
  if (scorer === null) return result.resolution !== 'true';
  if (result.resolution === 'insufficient-evidence' && result.emptyCollection) return true;
  return result.resolution === (scorer ? 'true' : 'false');
}

/** The scorer's three-way answer for one oracle: null when nothing could be scored. */
function verdictOf(scored, passes) {
  return scored === null ? null : passes(scored);
}

function describe(result) {
  if (!result) return 'is not declared by the contract';
  if (result.fault) return `faulted with ${result.fault}`;
  return `resolved ${result.resolution}${result.emptyCollection ? ' over an empty collection' : ''}`;
}

// ---------------------------------------------------------------------------
// test-review
// ---------------------------------------------------------------------------

/** The plants in corpus order, which is the order the generator numbers their oracles in. */
function plantsInOrder(groundTruth) {
  return groundTruth.files.flatMap((entry) => (entry.planted ?? []).map((plant) => ({ row: plant.row, path: entry.path })));
}

function checkTestReviewOracles(evaluator, groundTruth) {
  console.log('\ntest-review.contract.json over every stored verdict');
  const contract = readJson(path.join(CONTRACT_ROOT, 'test-review.contract.json'), 'the test-review contract');
  const plants = plantsInOrder(groundTruth);
  const oracleId = (index) => `O-${String(index).padStart(3, '0')}`;
  const [cleanId, scopeId, verdictId, exitId] = [1, 2, 3, 4].map((offset) => oracleId(plants.length + offset));
  const declared = new Set(contract.oracles.map((oracle) => oracle.id));
  assert(
    declared.size === plants.length + 4 && [cleanId, scopeId, verdictId, exitId].every((id) => declared.has(id)),
    'the contract declares one oracle per plant plus the clean, scope, verdict, and exit oracles',
    `declared ${[...declared].join(', ')}`,
  );

  const cases = findCases().filter((item) => item.suite === 'test-review');
  for (const item of cases) {
    const verdict = readJson(path.join(item.directory, 'verdict.json'), `${item.id} verdict`);
    // The harness passes no --fail-on, so the CLI's default decides: a Block or a
    // Request Changes exits 1 and anything else exits 0.
    const exitCode = verdictFor(verdict.recommendation, 'request-changes') === 'fail' ? 1 : 0;
    const results = evaluateOracles(evaluator, contract, {
      'review-corpus': observation({
        operationId: 'review-test-files',
        exitCode,
        artifacts: { verdict: { kind: 'json', value: verdict } },
      }),
    });
    const scored = scoreVerdict(verdict, groundTruth);

    for (const [index, plant] of plants.entries()) {
      const id = oracleId(index + 1);
      const hit = verdictOf(scored, (result) => !result.misses.some((miss) => miss.row === plant.row && miss.path === plant.path));
      assert(
        agrees(results.get(id), hit),
        `${item.id}: ${id} (${plant.row} in ${path.basename(plant.path)}) agrees with the scorer`,
        `scorer says ${hit === null ? 'unmeasurable' : hit ? 'hit' : 'miss'}, oracle ${describe(results.get(id))}`,
      );
    }
    const cleanFalsePositives = scored === null ? null : scored.falsePositives - scored.outOfScope;
    assert(
      agrees(
        results.get(cleanId),
        verdictOf(scored, () => cleanFalsePositives === 0),
      ),
      `${item.id}: ${cleanId} (clean control) agrees with the scorer`,
      `scorer counts ${cleanFalsePositives ?? 'no'} clean-control finding(s), oracle ${describe(results.get(cleanId))}`,
    );
    assert(
      agrees(
        results.get(scopeId),
        verdictOf(scored, (result) => result.outOfScope === 0),
      ),
      `${item.id}: ${scopeId} (review-set scope) agrees with the scorer`,
      `scorer counts ${scored?.outOfScope ?? 'no'} out-of-scope finding(s), oracle ${describe(results.get(scopeId))}`,
    );
    // The shape oracle is the one the scorer's null answers directly: a verdict
    // with no findings array is unscorable and must not read as well formed.
    assert(
      agrees(results.get(verdictId), scored === null ? null : true),
      `${item.id}: ${verdictId} (verdict shape) agrees with the scorer`,
      `scorer ${scored === null ? 'cannot score this verdict' : 'scores it'}, oracle ${describe(results.get(verdictId))}`,
    );
    assert(
      agrees(results.get(exitId), exitCode === 1),
      `${item.id}: ${exitId} (exit code) matches the exit the CLI would produce`,
      `the CLI would exit ${exitCode} on "${verdict.recommendation}", oracle ${describe(results.get(exitId))}`,
    );
  }
  console.log(`  ${colors.dim}${cases.length} stored verdict(s), ${contract.oracles.length} oracle(s) each${colors.reset}`);
}

// ---------------------------------------------------------------------------
// fragment-selection
// ---------------------------------------------------------------------------

/**
 * The three constructed selections for one case, each with the reason it is
 * there. None is empty: an empty selection is an empty collection, which the
 * contract vocabulary reads as no evidence, so a case that mandates one fragment
 * gets an excluded fragment in its place.
 */
function constructedSelections(expect) {
  const wrong =
    expect.mustLoad.length > 1
      ? { label: 'the mandated set minus one fragment', fragments: expect.mustLoad.slice(1) }
      : { label: 'an excluded fragment in place of the one mandated fragment', fragments: [expect.mustNotLoad[0]] };
  return [
    { label: 'exactly the mandated set', fragments: [...expect.mustLoad] },
    { label: 'the mandated set plus one excluded fragment', fragments: [...expect.mustLoad, expect.mustNotLoad[0]] },
    wrong,
  ];
}

function checkSelectionCase(evaluator, contract, workflow, item, caseIndex, selection, label) {
  const containmentId = `O-${String(2 * caseIndex + 1).padStart(3, '0')}`;
  const exclusionId = `O-${String(2 * caseIndex + 2).padStart(3, '0')}`;
  const stdout = selection === null ? { kind: 'absent' } : { kind: 'json', value: { fragments: selection } };
  const results = evaluateOracles(evaluator, contract, {
    [item.id]: observation({ operationId: 'select-fragments', exitCode: selection === null ? 6 : 0, stdout }),
  });
  const score = selection === null ? null : scoreCase(item, selection);
  assert(
    agrees(
      results.get(containmentId),
      verdictOf(score, (result) => result.missing.length === 0),
    ),
    `${workflow}/${item.id}: ${containmentId} (containment) agrees with scoreCase on ${label}`,
    `scoreCase ${score === null ? 'has no selection to score' : `misses ${score.missing.length}`}, oracle ${describe(results.get(containmentId))}`,
  );
  assert(
    agrees(
      results.get(exclusionId),
      verdictOf(score, (result) => result.forbidden.length === 0),
    ),
    `${workflow}/${item.id}: ${exclusionId} (exclusion) agrees with scoreCase on ${label}`,
    `scoreCase ${score === null ? 'has no selection to score' : `counts ${score.forbidden.length} forbidden`}, oracle ${describe(results.get(exclusionId))}`,
  );
}

function checkFragmentSelectionOracles(evaluator) {
  console.log('\nfragment-selection/<workflow>.contract.json over constructed and stored selections');
  const suites = loadSuites([]);
  const contracts = new Map();
  let evaluated = 0;
  for (const suite of suites) {
    const contract = readJson(path.join(CONTRACT_ROOT, 'fragment-selection', `${suite.dir}.contract.json`), `${suite.dir} contract`);
    contracts.set(suite.dir, contract);
    assert(
      contract.oracles.length === 2 * suite.data.cases.length,
      `${suite.dir}: the contract declares two oracles per case`,
      `${contract.oracles.length} oracle(s) for ${suite.data.cases.length} case(s)`,
    );
    for (const [caseIndex, item] of suite.data.cases.entries()) {
      for (const constructed of constructedSelections(item.expect)) {
        checkSelectionCase(evaluator, contract, suite.dir, item, caseIndex, constructed.fragments, constructed.label);
        evaluated += 2;
      }
    }
  }

  // The stored captures, through the same parser the runner applies to a live
  // reply. `sourceCase` names the workflow and case each was frozen from, and the
  // case is scored against its current expectations, so this compares the
  // oracle and the scorer on one input; the stored result is history and stays out of it.
  for (const item of findCases().filter((entry) => entry.suite === 'fragment-selection')) {
    const expected = readJson(path.join(item.directory, 'expected.json'), `${item.id} expected result`);
    const match = /^test\/evals\/([^/]+)\/evals\.json :: (.+)$/.exec(String(expected.inputs?.sourceCase ?? ''));
    if (!match) {
      assert(
        false,
        `${item.id}: expected.json names the evals.json case it was frozen from`,
        `sourceCase is ${JSON.stringify(expected.inputs?.sourceCase)}`,
      );
      continue;
    }
    const [, workflow, caseId] = match;
    const suite = suites.find((candidate) => candidate.dir === workflow);
    const caseIndex = suite?.data.cases.findIndex((candidate) => candidate.id === caseId) ?? -1;
    if (!suite || caseIndex === -1) {
      assert(false, `${item.id}: its source case ${workflow}/${caseId} still exists`);
      continue;
    }
    const selection = parseSelection(fs.readFileSync(path.join(item.directory, 'stdout.txt'), 'utf8'));
    checkSelectionCase(
      evaluator,
      contracts.get(workflow),
      workflow,
      suite.data.cases[caseIndex],
      caseIndex,
      selection,
      `stored capture ${item.id}`,
    );
    evaluated += 2;
  }
  console.log(`  ${colors.dim}${evaluated} oracle evaluation(s) across ${suites.length} contract(s)${colors.reset}`);
}

// ---------------------------------------------------------------------------
// trace
// ---------------------------------------------------------------------------

/**
 * One stored trace run as the artifacts a probe observation would carry: the
 * summary tagged the way the adapter tags a file, the matrix as text.
 */
function traceArtifactsOf(directory, expected) {
  const summaryPath = path.join(directory, expected.storedOutput?.summary ?? path.join('test-artifacts', 'e2e-trace-summary.json'));
  const matrixPath = path.join(directory, expected.storedOutput?.matrix ?? path.join('test-artifacts', 'traceability-matrix.md'));
  let summary = { kind: 'absent' };
  if (fs.existsSync(summaryPath)) {
    const text = fs.readFileSync(summaryPath, 'utf8');
    try {
      summary = { kind: 'json', value: JSON.parse(text) };
    } catch {
      summary = { kind: 'text', value: text };
    }
  }
  const matrix = fs.existsSync(matrixPath) ? { kind: 'text', value: fs.readFileSync(matrixPath, 'utf8') } : { kind: 'absent' };
  return { summary, matrix };
}

/**
 * The harness's answer for one stored run: the scored object, or the reason it
 * refused to score at all, split on which artifact it refused.
 */
function scoreTraceArtifacts(set, artifacts, groundTruth) {
  const summary = summaryFromArtifact(artifacts.summary);
  if (!summary.ok) return { refused: 'summary', reason: summary.reason };
  const matrix = artifacts.matrix.kind === 'text' ? parseMatrix(artifacts.matrix.value, set) : null;
  if (matrix === null) return { refused: 'matrix', reason: 'the matrix declares no section for any criterion the oracle names' };
  return { scored: scoreTraceRun(set, summary.summary, matrix, groundTruth.evidenceLineTolerance, groundTruth.coveragePercentTolerance) };
}

async function checkTraceOracles(evaluator) {
  console.log('\ntrace.contract.json over every stored trace run');
  const contract = readJson(path.join(CONTRACT_ROOT, 'trace.contract.json'), 'the trace contract');
  const groundTruth = await loadTraceGroundTruth();
  if (!groundTruth) unreadable('the trace ground truth is missing or not valid JSON');
  const specs = traceOracleSpecs(groundTruth);
  assert(
    contract.oracles.length === specs.length && contract.oracles.every((oracle, index) => oracle.id === specs[index].id),
    'the contract declares exactly the oracles the generator specifies, in order',
    `${contract.oracles.length} on disk, ${specs.length} specified`,
  );

  let evaluated = 0;
  let skippedUnscored = 0;
  let skippedMatrix = 0;
  const seenFalse = new Set();
  const cases = findCases().filter((item) => item.suite === 'trace');
  assert(cases.length > 0, 'test/replay/trace holds at least one stored trace run');
  for (const item of cases) {
    const expected = readJson(path.join(item.directory, 'expected.json'), `${item.id} expected result`);
    const artifacts = traceArtifactsOf(item.directory, expected);
    // Every set's oracles over this run. The set the run was frozen from is the
    // agreement check proper; the other set is the run seen as a wrong answer to
    // a different question, which is what makes an oracle resolve false.
    for (const set of groundTruth.fixtureSets) {
      const results = evaluateOracles(evaluator, contract, {
        [traceStepId(set)]: observation({ operationId: TRACE_OPERATION, exitCode: 0, artifacts }),
      });
      const answer = scoreTraceArtifacts(set, artifacts, groundTruth);
      const label = `${item.id} as ${set.id === expected.inputs?.fixtureSet ? 'its own set' : set.id}`;
      const own = specs.filter((spec) => spec.setId === set.id);
      if (answer.refused === 'matrix') {
        skippedMatrix += own.length;
        continue;
      }
      for (const spec of own) {
        const result = results.get(spec.id);
        if (answer.refused === 'summary') {
          // A run the harness will not score. The contract has to refuse it too,
          // through the one oracle that reads the run's shape; the rest have no
          // measurement to agree or disagree with.
          if (spec.kind !== 'run-measured') {
            skippedUnscored += 1;
            continue;
          }
          assert(
            agrees(result, null),
            `${label}: ${spec.id} (${spec.kind}) refuses the run the harness refuses (${answer.reason})`,
            `oracle ${describe(result)}`,
          );
          evaluated += 1;
          continue;
        }
        const scorer = spec.scorer(answer.scored);
        if (scorer === undefined) {
          skippedUnscored += 1;
          continue;
        }
        if (scorer === false) seenFalse.add(spec.id);
        assert(
          agrees(result, scorer),
          `${label}: ${spec.id} (${spec.kind}) agrees with scoreRun`,
          `scoreRun says ${scorer ? 'pass' : 'fail'}, oracle ${describe(result)}`,
        );
        evaluated += 1;
      }
    }
  }
  // Every oracle but the shape one has to have been seen failing somewhere, or
  // this check has only ever confirmed that a correct run passes.
  for (const spec of specs) {
    if (spec.kind === 'run-measured') continue;
    assert(seenFalse.has(spec.id), `${spec.id} (${spec.kind} on ${spec.setId}) was seen resolving false on some stored run`);
  }
  console.log(
    `  ${colors.dim}${evaluated} oracle evaluation(s) across ${cases.length} stored run(s) and ${groundTruth.fixtureSets.length} set(s); ${skippedUnscored} not scored by the harness, ${skippedMatrix} on a matrix it refused${colors.reset}`,
  );
}

// ---------------------------------------------------------------------------
// bmad-tea routing
// ---------------------------------------------------------------------------

/**
 * What each routing oracle kind asks, restated as a question about the harness
 * scorer's own output.
 *
 * Every one of these reads a single field, and each of those fields exists on the
 * score for this reason: `menuCorrect` is separate from `routeCorrect` and
 * `missingStated` from `declineOk` so that the oracle and the scorer are compared
 * on exactly one question at a time. An oracle that reads the menu code and a
 * scorer field that also reads the workflow would disagree on a reply that got
 * one right and the other wrong, and the disagreement would say nothing about
 * either.
 */
const ROUTING_SCORER_QUESTION = {
  action: (score) => score.actionCorrect,
  menu: (score) => score.menuCorrect,
  workflow: (score) => score.workflowCorrect,
  reason: (score) => score.tokensFound === score.tokens,
  scope: (score) => score.scopeOk,
  candidates: (score) => score.candidatesNamed === score.candidates,
  missing: (score) => score.missingStated,
};

/**
 * Two constructed answers per case: the one the oracles are written for, and one
 * that fails every one of them.
 *
 * Both are needed. An oracle only ever seen resolving true is an oracle nothing
 * has shown can resolve false, and the stored replies cover eleven of the
 * eighteen intents, so the constructed pair is what exercises the rest in both
 * directions.
 *
 * The correct half is `correctRoutingAnswer` from the harness, whose reason is
 * the case's own deciding tokens joined. That makes it evidence about the oracle
 * and no evidence at all about the token set: a token set of nonsense would pass
 * here. `node test/eval-bmad-tea-routing.js --validate-only` is what holds a
 * token set to the user's message, and the stored replies are what test realistic
 * phrasing.
 */
function constructedRoutingAnswers(expected) {
  const correct = correctRoutingAnswer(expected);
  const otherAction = expected.expectedAction === 'route' ? 'decline' : 'route';
  const wrong = {
    action: otherAction,
    menuCode: otherAction === 'route' ? 'TMT' : null,
    workflow: otherAction === 'route' ? 'bmad-teach-me-testing' : null,
    scope: null,
    reason: 'no particular feature of the message decided it',
    question: null,
    missing: null,
  };
  // A route case's wrong answer has to be wrong where the menu and workflow
  // oracles are concerned, so it names a target that is never this case's own.
  if (expected.expectedAction === 'route' && expected.expectedMenuCode === 'TMT') {
    wrong.menuCode = 'TR';
    wrong.workflow = 'bmad-testarch-trace';
  }
  const answers = [
    { label: 'the answer the oracles are written for', answer: correct, expectHold: true },
    { label: 'an answer of the wrong kind', answer: wrong, expectHold: false },
  ];
  if (expected.expectedAction === 'route') {
    // A third answer, because one wrong answer cannot fail every oracle of a
    // route case. The wrong-kind answer above is a decline, which carries a null
    // workflow, and a null workflow is the correct state for GATE, whose menu
    // item targets a prompt rather than a skill. So the oracle that exists to
    // catch a workflow named behind GATE is satisfied by the answer meant to fail
    // it. This one is a route to the wrong target, which is what fails the menu
    // and workflow oracles on every route case including that one.
    answers.push({
      label: 'a route to the wrong target',
      answer: {
        ...correct,
        menuCode: expected.expectedMenuCode === 'TMT' ? 'TR' : 'TMT',
        workflow: expected.expectedMenuCode === 'TMT' ? 'bmad-testarch-trace' : 'bmad-teach-me-testing',
      },
      expectHold: false,
    });
  }
  return answers;
}

function checkOneRoutingAnswer(evaluator, contract, specsForCase, caseId, expected, menu, intent, answer, label) {
  const score = scoreRoutingCase(expected, answer, menu, intent);
  const stdout = answer === null ? { kind: 'absent' } : { kind: 'json', value: answer };
  const results = evaluateOracles(evaluator, contract, {
    [caseId]: observation({ operationId: ROUTING_OPERATION, exitCode: answer === null ? 6 : 0, stdout }),
  });
  let evaluated = 0;
  for (const spec of specsForCase) {
    const question = ROUTING_SCORER_QUESTION[spec.kind];
    const result = results.get(spec.id);
    assert(
      agrees(result, verdictOf(score, question)),
      `${caseId}: ${spec.id} (${spec.kind}) agrees with scoreCase on ${label}`,
      `scoreCase ${score === null ? 'has no answer to score' : `says ${question(score)}`}, oracle ${describe(result)}`,
    );
    evaluated += 1;
  }
  return { evaluated, results };
}

function checkRoutingOracles(evaluator) {
  console.log('\ntea-routing-*.contract.json over constructed and stored routing answers');
  const corpus = loadRoutingCorpus();
  const menu = routingMenuItems();
  const stored = findCases().filter((item) => item.suite === 'bmad-tea-routing');
  assert(stored.length > 0, 'test/replay/bmad-tea-routing holds at least one stored routing answer');
  let evaluated = 0;

  for (const contractSpec of ROUTING_CONTRACTS) {
    const contract = readJson(path.join(CONTRACT_ROOT, contractSpec.relativePath), `the ${contractSpec.contractId} contract`);
    const cases = corpus.cases.filter((item) => contractSpec.actions.includes(item.expected.expectedAction));
    const specs = routingOracleSpecs(cases, menu);
    assert(
      specs.length === contract.oracles.length,
      `${contractSpec.relativePath}: the generator's oracle list is the one on disk`,
      `${specs.length} generated, ${contract.oracles.length} on disk`,
    );
    const byCase = new Map();
    for (const spec of specs) byCase.set(spec.caseId, [...(byCase.get(spec.caseId) ?? []), spec]);
    const seenFalse = new Set();

    for (const item of cases) {
      for (const constructed of constructedRoutingAnswers(item.expected)) {
        const { evaluated: count, results } = checkOneRoutingAnswer(
          evaluator,
          contract,
          byCase.get(item.id) ?? [],
          item.id,
          item.expected,
          menu,
          item.intent,
          constructed.answer,
          constructed.label,
        );
        evaluated += count;
        if (!constructed.expectHold) {
          for (const spec of byCase.get(item.id) ?? []) {
            if (results.get(spec.id)?.resolution === 'false') seenFalse.add(spec.id);
          }
        }
      }
    }

    // The stored replies, through the same parser the runner applies to a live
    // one. Each names the corpus case it was frozen from, and it is scored
    // against that case's current oracle, so this compares the contract and the
    // scorer on one input; the stored result is history and stays out of it.
    for (const replayed of stored) {
      const expected = readJson(path.join(replayed.directory, 'expected.json'), `${replayed.id} expected result`);
      const match = /^test\/fixtures\/tea-routing-eval\/intents\.json :: (.+)$/.exec(String(expected.inputs?.sourceCase ?? ''));
      if (!match) {
        assert(false, `${replayed.id}: expected.json names the intents.json case it was frozen from`, String(expected.inputs?.sourceCase));
        continue;
      }
      const caseId = match[1];
      const specsForCase = byCase.get(caseId);
      // A stored reply to an intent this contract does not carry belongs to the
      // other one, which sees it on its own pass.
      if (specsForCase === undefined) continue;
      const item = cases.find((candidate) => candidate.id === caseId);
      if (!item) {
        assert(false, `${replayed.id}: its source case ${caseId} still exists in the corpus`);
        continue;
      }
      const answer = parseRouting(fs.readFileSync(path.join(replayed.directory, 'stdout.txt'), 'utf8'));
      const { evaluated: count } = checkOneRoutingAnswer(
        evaluator,
        contract,
        specsForCase,
        caseId,
        item.expected,
        menu,
        item.intent,
        answer,
        `stored reply ${replayed.id}`,
      );
      evaluated += count;
    }

    for (const spec of specs) {
      assert(seenFalse.has(spec.id), `${spec.id} (${spec.kind} on ${spec.caseId}) was seen resolving false on some answer`);
    }
  }

  console.log(
    `  ${colors.dim}${evaluated} oracle evaluation(s) across ${ROUTING_CONTRACTS.length} contract(s) and ${stored.length} stored reply(ies)${colors.reset}`,
  );
}

// ---------------------------------------------------------------------------
// test-design
// ---------------------------------------------------------------------------

/**
 * One stored test-design run as the artifact a probe observation would carry.
 *
 * The deliverable is markdown, so the adapter tags it `text` and there is nothing
 * else on the observation to read. That is the whole reason this contract's oracles
 * are what they are; see the comment above testDesignOracleSpecs in
 * tools/generate-contracts.js.
 */
function testDesignArtifactOf(directory, expected) {
  const designPath = path.join(directory, expected.storedOutput?.design ?? 'design.md');
  return fs.existsSync(designPath) ? { kind: 'text', value: fs.readFileSync(designPath, 'utf8') } : { kind: 'absent' };
}

/**
 * Evaluate every test-design oracle over every stored document and compare each
 * answer with the harness predicate the generator paired it with.
 *
 * Each spec's `scorer` reads `documentMentions`, the harness's own document-global
 * predicate, rather than the row-scoped scored result. That is deliberate and it is
 * what makes this comparison meaningful: an oracle over a markdown body cannot tell
 * which row a token sits in, so pairing it with the row-scoped answer would make the
 * two agree by coincidence on whatever this corpus happens to hold.
 *
 * A green run here therefore says the contract and the harness agree about which
 * vocabulary a document carries. It does not say the suite passed, and it says
 * nothing about the arithmetic, the band placement, the coverage mapping or the
 * priority ordering, all of which only the harness checks.
 */
function checkTestDesignOracles(evaluator) {
  console.log('\ntest-design.contract.json over every stored test design');
  const contract = readJson(path.join(CONTRACT_ROOT, 'test-design.contract.json'), 'the test-design contract');
  const groundTruth = loadTestDesignGroundTruth();
  if (!groundTruth) unreadable('the test-design ground truth is missing or not valid JSON');
  const specs = testDesignOracleSpecs(groundTruth);
  assert(
    contract.oracles.length === specs.length && contract.oracles.every((oracle, index) => oracle.id === specs[index].id),
    'the contract declares exactly the oracles the generator specifies, in order',
    `${contract.oracles.length} on disk, ${specs.length} specified`,
  );

  const categories = new Set(groundTruth.riskCategories ?? []);
  const setsById = new Map((groundTruth.fixtureSets ?? []).map((set) => [set.id, set]));
  let evaluated = 0;
  let skippedRefused = 0;
  const seenFalse = new Set();
  const cases = findCases().filter((item) => item.suite === 'test-design');
  assert(cases.length > 0, 'test/replay/test-design holds at least one stored test design');

  for (const item of cases) {
    const expected = readJson(path.join(item.directory, 'expected.json'), `${item.id} expected result`);
    const artifact = testDesignArtifactOf(item.directory, expected);
    // Every set's oracles over this document. The set the document was frozen from
    // is the agreement check proper; the other set is the document seen as a wrong
    // answer to a different question, which is what makes an oracle resolve false.
    for (const set of groundTruth.fixtureSets ?? []) {
      const stepId = testDesignStepId(set);
      const results = evaluateOracles(evaluator, contract, {
        [stepId]: observation({ operationId: TEST_DESIGN_OPERATION, exitCode: 0, artifacts: { design: artifact } }),
      });
      const read = readTestDesign(artifact);
      const own = specs.filter((spec) => spec.setId === set.id);
      const label = `${item.id} as ${set.id === expected.inputs?.fixtureSet ? 'its own set' : set.id}`;

      if (!read.ok) {
        // A document the harness will not score. The contract has to refuse it too,
        // through the one oracle that reads the run's shape; the rest have no
        // measurement to agree or disagree with.
        for (const spec of own) {
          if (spec.kind !== 'run-measured') {
            skippedRefused += 1;
            continue;
          }
          assert(
            agrees(results.get(spec.id), null),
            `${label}: ${spec.id} (${spec.kind}) refuses the document the harness refuses (${read.reason})`,
            `oracle ${describe(results.get(spec.id))}`,
          );
          evaluated += 1;
        }
        continue;
      }

      const scored = scoreTestDesignRun(setsById.get(set.id), read.design, categories);
      for (const spec of own) {
        const scorer = spec.scorer(scored);
        if (scorer === false) seenFalse.add(spec.id);
        assert(
          agrees(results.get(spec.id), scorer),
          `${label}: ${spec.id} (${spec.kind}) agrees with the harness predicate it is paired with`,
          `harness says ${scorer ? 'pass' : 'fail'}, oracle ${describe(results.get(spec.id))}`,
        );
        evaluated += 1;
      }
    }
  }
  // Every oracle but the shape one has to have been seen failing somewhere, or this
  // check has only ever confirmed that a correct run passes.
  for (const spec of specs) {
    if (spec.kind === 'run-measured') continue;
    assert(seenFalse.has(spec.id), `${spec.id} (${spec.kind} on ${spec.setId}) was seen resolving false on some stored document`);
  }
  console.log(
    `  ${colors.dim}${evaluated} oracle evaluation(s) across ${cases.length} stored document(s) and ${(groundTruth.fixtureSets ?? []).length} set(s); ${skippedRefused} on a document the harness refused${colors.reset}`,
  );
}

// ---------------------------------------------------------------------------
// nfr
// ---------------------------------------------------------------------------

/** One stored nfr run as the artifact a probe observation would carry: the report as text. */
function nfrArtifactsOf(directory, expected) {
  const reportPath = path.join(directory, expected.storedOutput?.report ?? path.join('test-artifacts', 'nfr-assessment.md'));
  if (!fs.existsSync(reportPath)) return { report: { kind: 'absent' } };
  return { report: { kind: 'text', value: fs.readFileSync(reportPath, 'utf8') } };
}

/**
 * The harness's answer for one stored nfr run: the scored object, or the reason it
 * refused to score at all.
 */
function scoreNfrArtifacts(set, artifacts) {
  const report = nfrReportFromArtifact(artifacts.report);
  if (!report.ok) return { refused: report.reason };
  return { scored: scoreNfrRun(set, report.report) };
}

function checkNfrOracles(evaluator) {
  console.log('\nnfr.contract.json over every stored NFR run');
  const contract = readJson(path.join(CONTRACT_ROOT, 'nfr.contract.json'), 'the nfr contract');
  const groundTruth = loadNfrGroundTruth();
  if (!groundTruth) unreadable('the nfr ground truth is missing or not valid JSON');
  const specs = nfrOracleSpecs(groundTruth);
  assert(
    contract.oracles.length === specs.length && contract.oracles.every((oracle, index) => oracle.id === specs[index].id),
    'the contract declares exactly the oracles the generator specifies, in order',
    `${contract.oracles.length} on disk, ${specs.length} specified`,
  );

  let evaluated = 0;
  let skippedUnscored = 0;
  const seenFalse = new Set();
  const cases = findCases().filter((item) => item.suite === 'nfr');
  assert(cases.length > 0, 'test/replay/nfr holds at least one stored NFR run');
  for (const item of cases) {
    const expected = readJson(path.join(item.directory, 'expected.json'), `${item.id} expected result`);
    const artifacts = nfrArtifactsOf(item.directory, expected);
    // Every bundle's oracles over this run. The bundle the run was frozen from is
    // the agreement check proper; the other bundle is the run seen as a wrong
    // answer to a different question, which is what makes an oracle resolve false.
    for (const set of groundTruth.fixtureSets) {
      const results = evaluateOracles(evaluator, contract, {
        [nfrStepId(set)]: observation({ operationId: NFR_OPERATION, exitCode: 0, artifacts }),
      });
      const answer = scoreNfrArtifacts(set, artifacts);
      const label = `${item.id} as ${set.id === expected.inputs?.fixtureSet ? 'its own bundle' : set.id}`;
      const own = specs.filter((spec) => spec.setId === set.id);
      // A report the harness will not score at all. Unlike trace, the refusal is
      // never about a second artifact: the deliverable is one markdown document,
      // and a document with no domain section is outside the operator vocabulary
      // altogether, because every oracle here reads the document as one string.
      // Nothing is compared and the skip is printed.
      if (answer.refused) {
        skippedUnscored += own.length;
        continue;
      }
      for (const spec of own) {
        const result = results.get(spec.id);
        const scorer = spec.scorer(answer.scored);
        if (scorer === false) seenFalse.add(spec.id);
        assert(
          agrees(result, scorer),
          `${label}: ${spec.id} (${spec.kind}) agrees with scoreRun`,
          `scoreRun says ${scorer ? 'pass' : 'fail'}, oracle ${describe(result)}`,
        );
        evaluated += 1;
      }
    }
  }
  // Every oracle but the run-shape one has to have been seen failing somewhere, or
  // this check has only ever confirmed that a correct run passes.
  for (const spec of specs) {
    if (spec.kind === 'run-measured') continue;
    assert(seenFalse.has(spec.id), `${spec.id} (${spec.kind} on ${spec.setId}) was seen resolving false on some stored run`);
  }
  console.log(
    `  ${colors.dim}${evaluated} oracle evaluation(s) across ${cases.length} stored run(s) and ${groundTruth.fixtureSets.length} bundle(s); ${skippedUnscored} on a report the harness refused${colors.reset}`,
  );
}

async function main() {
  console.log('contract oracles, evaluated with eval-quality and compared with the harness scorers');
  const evaluator = await loadEvaluator();
  const groundTruth = readJson(GROUND_TRUTH, 'the test-review ground truth');

  checkTestReviewOracles(evaluator, groundTruth);
  checkFragmentSelectionOracles(evaluator);
  checkRoutingOracles(evaluator);
  checkTestDesignOracles(evaluator);
  await checkTraceOracles(evaluator);
  checkNfrOracles(evaluator);

  console.log('');
  if (failed > 0) {
    console.log(`${colors.red}${failed} oracle check(s) failed${colors.reset}, ${passed} passed.\n`);
    process.exit(1);
  }
  console.log(`${colors.green}every oracle evaluated and agreed with its scorer${colors.reset} (${passed} checks).\n`);
}

main().catch((error) => {
  console.error(`${colors.red}contract oracles: ${error.stack ?? error.message}${colors.reset}`);
  process.exit(2);
});
