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
 * by file path. `test/test-contracts.js` already reaches `dist/cli/main.js` the
 * same way; neither is on the package's `exports` map, and the devDependency is
 * pinned to an exact version, so the coupling is stated here.
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
const { findCases } = require('./test-eval-replay');
// The correspondence between each trace oracle and the scoreRun check it
// restates is written once, in the generator beside the oracle itself.
const { traceOracleSpecs, traceStepId } = require('../tools/generate-contracts');

const PROJECT_ROOT = path.join(__dirname, '..');
const CONTRACT_ROOT = path.join(__dirname, 'contracts');
const GROUND_TRUTH = path.join(__dirname, 'fixtures', 'test-review-eval', 'ground-truth.json');

/**
 * The regex step budget a scoring policy would carry. Every pattern the
 * generator writes is an anchored literal with one alternation, so the budget
 * is never approached; it is here because the operator requires one.
 */
const REGEX_STEP_BUDGET = 10_000;

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

function checkTraceOracles(evaluator) {
  console.log('\ntrace.contract.json over every stored trace run');
  const contract = readJson(path.join(CONTRACT_ROOT, 'trace.contract.json'), 'the trace contract');
  const groundTruth = loadTraceGroundTruth();
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

async function main() {
  console.log('contract oracles, evaluated with eval-quality and compared with the harness scorers');
  const evaluator = await loadEvaluator();
  const groundTruth = readJson(GROUND_TRUTH, 'the test-review ground truth');

  checkTestReviewOracles(evaluator, groundTruth);
  checkFragmentSelectionOracles(evaluator);
  checkTraceOracles(evaluator);

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
