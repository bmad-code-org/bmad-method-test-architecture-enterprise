/**
 * The scoring half of `eval-quality`, run end to end with no model call.
 *
 * `npm run test:probe-targets` proves TEA's commands reach the environment-probe
 * port. This proves the rest of the chain: every probe in every corpus parses
 * against the schema `eval-quality` publishes for it, `runPreflight` plans and
 * reduces each probe's legs, `runScore` returns a verdict and a contract-strength
 * vector, `seal` produces a brief, and every artifact the chain mints validates.
 *
 * The evidence is the outputs `test/replay/` already stores, answered through a
 * port that reads them off disk, so this needs no credential and makes no paid
 * call. The live half is `npm run eval:preflight` and `npm run eval:contract-strength`,
 * which run the same code against the real command-line adapter.
 *
 * WHAT THE BASELINE IS FOR
 *
 * `test/probes/expected-strength.json` records what each probe scores today,
 * including the ones nothing can score yet. One blocker is left, recorded rather
 * than avoided: a defect signature cannot address a file a command wrote, so a
 * probe carrying one is refused by the qualification gate, which is why
 * test-review's gameability probe and trace's three defect probes score nothing.
 * tools/generate-probes.js states it in full. The other blocker was a defect
 * probe whose manifestation witness fired on a leg the contract called clean.
 * Fourteen of `test-design`'s sixteen probes and all three of `ci`'s defect probes
 * still fail pre-flight with `seeded-fault-fired`, and every probe in the other
 * thirteen corpora pre-flights.
 * A baseline is what makes the day one of them closes visible instead of silent,
 * so movement in either direction fails this check until somebody has read why
 * and regenerated it.
 *
 * Usage:
 *   node test/test-probe-corpus.js
 *   node test/test-probe-corpus.js --write   # regenerate the baseline
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const prettier = require('prettier');

const { loadEvalQuality, scoringPolicy, validateArtifact } = require('./lib/eval-quality-inputs');
const { publishedMember } = require('./lib/vocabularies');
const { ladderExitCode, ladderVerdict, runSuite, storedProbePort, suites } = require('./lib/probe-scoring');
const { baselineDifferences, stagedWorkspaceFor } = require('./eval-contract-strength');
const { digestTree, stageWorkspace } = require('./eval-trace');
const { compareStoredResults } = require('./lib/compare-dominance');

const BASELINE_PATH = path.join(__dirname, 'probes', 'expected-strength.json');

const colors = {
  reset: '[0m',
  red: '[31m',
  green: '[32m',
  dim: '[2m',
};

/** The distinct reasons a ladder gave, with the oracle identifiers folded out so the baseline reads as a shape. */
function basisShapes(basis) {
  return [...new Set(basis.map((line) => line.replaceAll(/oracle O-\d+/g, 'oracle'))).values()].sort();
}

/**
 * The reason codes AD-9's gate gave, or null when it admitted the probe.
 *
 * A rejected probe resolves an oracle to `infrastructure-error` wherever no
 * higher-precedence condition already resolved it, which reads the same
 * whichever of the twenty reasons fired. `runScore` carries the closed set out
 * on `qualification`, so the baseline records which one it was and a rejection
 * that changes its reason shows up as a diff.
 *
 * Every code is held against `QUALIFICATION_FAILURES` before it reaches the
 * baseline. The package publishes no JSON Schema over the qualification result,
 * so nothing else in the chain reads these against the vocabulary they come
 * from, and a code renamed upstream would be recorded here as a moved baseline
 * entry: a reader would go looking for a rejection that changed its reason and
 * find a rename. The throw says which it is.
 *
 * @param {{failures: {code: string}[]}} qualification
 * @param {string[]} published `eval-quality`'s own `QUALIFICATION_FAILURES`.
 */
function qualificationCodes(qualification, published) {
  const codes = qualification.failures
    .map((failure) =>
      publishedMember({ QUALIFICATION_FAILURES: published }, failure.code, "a code the qualification gate's rejection carries"),
    )
    .sort();
  return codes.length === 0 ? null : codes;
}

/** One probe's result, small enough to read in a diff and complete enough to notice a change. */
function probeSummary(entry, registries) {
  const failedChecks = entry.preflight.checks.filter((check) => check.outcome === 'failed').map((check) => check.kind);
  return {
    probeClass: entry.probe.probeClass,
    expectedClean: entry.probe.expectedClean,
    behaviorId: entry.probe.behaviorId,
    preflight: entry.preflight.passed ? 'passed' : `failed: ${[...new Set(failedChecks)].sort().join(', ')}`,
    // Read from the diagnostic sink, which is the only channel that reports how
    // many legs a pre-flight planned. It is not the check count: 29 of these 55
    // probes plan a number of legs that differs from the number of checks their
    // verdict carries.
    preflightLegs: entry.diagnostics.legs,
    verdict: ladderVerdict(entry.result.ladder, registries.VERDICTS),
    exitCode: ladderExitCode(entry.result.ladder, registries.VERDICTS),
    // The ladder's own answer to whether `--strict` would promote this CONCERNS,
    // recorded whatever TEA decides to do with it, so the day a CONCERNS fires
    // only on AD-21's evidence conditions is the day this file moves.
    strictPromotable: entry.result.ladder.strictPromotable,
    basis: basisShapes(entry.result.ladder.basis),
    qualification: qualificationCodes(entry.result.qualification, registries.QUALIFICATION_FAILURES),
    strength: entry.result.artifact?.strength?.vector ?? null,
    comparableResult: comparableResultOf(entry),
  };
}

/**
 * The `ComparableResult` slice `compareDominance` reads (TEA Story 5.1), or
 * `null` when this probe minted no artifact. Since `EvidenceArtifact` schema
 * version 4 the comparator recomputes each side's trial-set reduction before
 * comparing, so the slice carries `scoredProbeId`, `reducedProbeOutcomes` and
 * `trials` alongside `comparabilityKey` and `strength`. `outcomes` is slimmed
 * to `probeId`/`state`/`severity`/`trialIndex`: the reduction consistency check
 * reads exactly those four fields, the severity-floor override reads
 * `reducedProbeOutcomes`, and this baseline's own stated goal is staying small
 * enough to read in a diff.
 */
function comparableResultOf(entry) {
  const artifact = entry.result.artifact;
  if (artifact === null) return null;
  return {
    comparabilityKey: artifact.comparabilityKey,
    scoredProbeId: artifact.scoredProbeId,
    strength: artifact.strength,
    trials: artifact.trials,
    reducedProbeOutcomes: artifact.reducedProbeOutcomes,
    outcomes: artifact.outcomes.map((outcome) => ({
      probeId: outcome.probeId,
      state: outcome.state,
      severity: outcome.severity,
      trialIndex: outcome.trialIndex,
    })),
  };
}

/**
 * What the sink said that the returned artifacts cannot say for themselves.
 *
 * A sink nobody fills reports nothing and reads in a diff as adoption, so the
 * three facts checked here are the ones that go wrong silently: a stage that is
 * not `preflight` means a stage TEA does not handle started emitting, an even
 * diagnostic count means the planned/observed/closing emission contract moved,
 * and no diagnostics at all means the sink stopped being passed.
 */
function diagnosticProblems(suiteId, entry) {
  const { count, legs, stages } = entry.diagnostics;
  const where = `${suiteId} ${entry.probe.probeId}`;
  const problems = [];
  if (count === 0) problems.push(`${where}: the pre-flight diagnostic sink received nothing, so no leg was reported`);
  else if (legs === null)
    problems.push(`${where}: the sink reported ${count} diagnostic(s), which is not one closing line over two lines per leg`);
  // A zero-leg plan reduces to `passed` having probed nothing, which is the one
  // pre-flight outcome that looks like success and measures nothing. Every probe
  // in every corpus plans two, three or four, so zero is a finding here.
  else if (legs === 0) problems.push(`${where}: the pre-flight planned no legs, so it passed without probing anything`);
  const unexpected = stages.filter((stage) => stage !== 'preflight');
  if (unexpected.length > 0) problems.push(`${where}: the sink reported stage(s) TEA does not read: ${unexpected.join(', ')}`);
  return problems;
}

/**
 * One suite's outcome in the shape the live harness reports, so the live
 * harness's baseline comparator can be driven from here.
 *
 * `test/eval-contract-strength.js` is exposed only as `eval:contract-strength`
 * and `eval:preflight`, neither of which is in `npm test`, so `baselineDifferences`
 * had no gate at all: it is the function that decides whether a paid run passed,
 * and nothing ran it. The rows it reads are a pure function of the score, and
 * this file has already computed one for every probe, so driving it needs no
 * credential and no model call. That is the same argument the staging check
 * below makes for the same file.
 */
function liveShapedVerdicts(outcome, registries) {
  return outcome.scored.map((entry) => ({
    probeId: entry.probe.probeId,
    passed: entry.preflight.passed,
    preflight: entry.preflight.passed ? 'passed' : probeSummary(entry, registries).preflight,
    preflightLegs: entry.diagnostics.legs,
    verdict: ladderVerdict(entry.result.ladder, registries.VERDICTS),
  }));
}

/**
 * The live comparator, driven over the rows this run just measured and then over
 * one row deliberately moved.
 *
 * A comparator that reports nothing on matching rows proves only that it is
 * silent, so each of the three fields it reads is moved in turn and the finding
 * it must produce is named. A field it stops reading fails here.
 */
function comparatorProblems(results, baseline) {
  const problems = [];
  const clean = baselineDifferences(results, baseline);
  if (clean.environment.length > 0 || clean.measured.length > 0) {
    problems.push(
      `the live comparator reported differences against the corpus that produced them: ${[...clean.environment, ...clean.measured].join('; ')}`,
    );
  }
  const moves = [
    { field: 'preflightLegs', value: 99, bucket: 'environment' },
    { field: 'preflight', value: 'failed: moved', bucket: 'environment' },
    { field: 'verdict', value: 'MOVED', bucket: 'measured' },
  ];
  for (const { field, value, bucket } of moves) {
    const [first, ...rest] = results;
    const [head, ...tail] = first.verdicts;
    const mutated = [{ ...first, verdicts: [{ ...head, [field]: value }, ...tail] }, ...rest];
    const seen = baselineDifferences(mutated, baseline);
    if (seen[bucket].length !== 1) {
      problems.push(
        `the live comparator reported ${seen[bucket].length} ${bucket} difference(s) for a moved ${field}, where it must report exactly one`,
      );
    }
  }
  return problems;
}

/**
 * Whether `comparableResult.strength.vector` carries at least one class with
 * a non-null rate. `compareDominance`'s own `componentComparison` returns
 * `'incomparable'` the moment neither side contributes a class, which is
 * correct for the package's own purpose (no evidence means no relation) but
 * means two byte-identical results with zero contributing classes compare
 * as `'incomparable'` rather than `'equivalent'` — not a moved baseline,
 * just a probe class that never measures anything.
 */
function hasContributingEvidence(comparableResult) {
  return Object.values(comparableResult.strength.vector).some((entry) => entry !== null && entry.rate !== null);
}

/**
 * `comparatorProblems` above already fails the moment any field in `summary`
 * moves against the on-disk baseline, including `comparableResult`, so a
 * scorer change never passes silently. What that literal diff cannot say is
 * *what kind* of change it is: a probe whose recorded strength fell against
 * the stored baseline and one whose strength merely got noisier both read as
 * "these bytes differ." This runs `compareDominance` (TEA Story 5.1) between
 * each probe's stored `comparableResult` and its freshly measured one and
 * names the relation, so a scorer change that alters a historical result is
 * reported as a dominance change and not only as a diff.
 *
 * A probe absent from either side, or with no artifact on either side (an
 * Invalid run mints none), carries no comparison: there is nothing stored to
 * compare a fresh score against, or nothing measured to compare with. Nor
 * does a probe where neither side ever contributes a class (see
 * `hasContributingEvidence`): comparing it against itself would always read
 * `'incomparable'`, which is a property of the probe, not a finding.
 */
async function dominanceProblems(onDiskBaseline, freshSummary, severityFloor) {
  const problems = [];
  for (const [suiteId, freshSuite] of Object.entries(freshSummary)) {
    const storedSuite = onDiskBaseline[suiteId];
    if (storedSuite === undefined) continue;
    for (const [probeId, fresh] of Object.entries(freshSuite.probes)) {
      const stored = storedSuite.probes?.[probeId];
      if (stored === undefined || stored.comparableResult === null || fresh.comparableResult === null) continue;
      if (!hasContributingEvidence(stored.comparableResult) && !hasContributingEvidence(fresh.comparableResult)) continue;
      const compared = await compareStoredResults(stored.comparableResult, fresh.comparableResult, severityFloor);
      if (!compared.ok) {
        problems.push(`${suiteId} ${probeId}: dominance comparison refused against the stored baseline: ${compared.reason}`);
      } else if (compared.relation !== 'equivalent') {
        problems.push(`${suiteId} ${probeId}: dominance moved to "${compared.relation}" against the stored baseline`);
      }
    }
  }
  return problems;
}

/**
 * `dominanceProblems` driven over one real, unmutated pair (which must
 * report nothing) and then over the same pair with one side's strength
 * vector moved to a worse rate (which must report exactly one dominance
 * change). Proves the check actually runs rather than only existing to be
 * described, the same discipline `comparatorProblems` above holds itself to.
 */
async function dominanceComparatorProblems(summary, severityFloor) {
  const problems = [];
  const hasEvidentProbe = (s) =>
    Object.values(s.probes).some((p) => p.comparableResult !== null && hasContributingEvidence(p.comparableResult));
  const [suiteId, suite] = Object.entries(summary).find(([, s]) => hasEvidentProbe(s));
  const [probeId, probe] = Object.entries(suite.probes).find(
    ([, p]) => p.comparableResult !== null && hasContributingEvidence(p.comparableResult),
  );

  const clean = await dominanceProblems(summary, summary, severityFloor);
  if (clean.length > 0) {
    problems.push(`the dominance comparator reported ${clean.length} change(s) comparing the corpus against itself: ${clean.join('; ')}`);
  }

  const worsened = {
    ...summary,
    [suiteId]: {
      ...suite,
      probes: {
        ...suite.probes,
        [probeId]: {
          ...probe,
          comparableResult: {
            ...probe.comparableResult,
            strength: {
              ...probe.comparableResult.strength,
              vector: { defect: { caught: 0, exercised: 1, rate: 0 }, gameability: null, 'zero-action': null },
            },
          },
        },
      },
    },
  };
  const seen = await dominanceProblems(summary, worsened, severityFloor);
  if (seen.length !== 1) {
    problems.push(
      `the dominance comparator reported ${seen.length} change(s) for one probe moved to a worse strength vector, where it must report exactly one`,
    );
  }
  return problems;
}

function suiteSummary(outcome, registries) {
  const gaps = outcome.scored
    .map((entry) => entry.result.artifact)
    .filter(Boolean)
    .flatMap((artifact) => artifact.coverageGaps.filter((gap) => !gap.satisfied).map((gap) => gap.rule));
  return {
    contractId: outcome.suite.contract.contractId,
    // The digest that pins which corpus these scores were computed over. It is
    // recorded here because nothing else attested it: a change to what `suites`
    // puts on `probes`, a sort or a stripped comment, would move every suite's
    // digest with the whole gate green.
    corpusDigest: outcome.corpusDigest,
    probeCount: outcome.scored.length,
    strength: outcome.strength,
    unsatisfiedCoverageRules: [...new Set(gaps)].sort(),
    probes: Object.fromEntries(outcome.scored.map((entry) => [entry.probe.probeId, probeSummary(entry, registries)])),
  };
}

async function main() {
  const write = process.argv.slice(2).includes('--write');
  const signal = AbortSignal.timeout(600_000);
  // The two vocabularies this file writes into the baseline, from the barrel the
  // scoring run itself resolves. Neither is enumerated by a published JSON
  // Schema over anything `runScore` returns, so this is the only place they are
  // held against what the package publishes.
  const { VERDICTS, QUALIFICATION_FAILURES } = await loadEvalQuality();
  const registries = { VERDICTS, QUALIFICATION_FAILURES };
  const problems = [];
  const summary = {};
  const liveShaped = [];

  console.log('\nprobe corpora scored through eval-quality, against stored evidence\n');

  for (const suite of await suites()) {
    for (const probe of suite.probes) {
      for (const message of await validateArtifact('probe', probe)) {
        problems.push(`${suite.id} ${probe.probeId}: Probe${message}`);
      }
    }

    const outcome = await runSuite(suite, { port: storedProbePort(suite), runId: 'replay', modelSnapshot: 'stored-replay', signal });
    for (const entry of outcome.scored) {
      for (const message of entry.schemaProblems) problems.push(`${suite.id} ${entry.probe.probeId}: ${message}`);
      for (const message of entry.preflightProblems) problems.push(`${suite.id} ${entry.probe.probeId}: PreflightVerdict${message}`);
      problems.push(...diagnosticProblems(suite.id, entry));
    }
    for (const message of outcome.sealed.schemaProblems) problems.push(`${suite.id}: SealedEvaluatorBrief${message}`);

    summary[suite.id] = suiteSummary(outcome, registries);
    liveShaped.push({ suiteId: suite.id, verdicts: liveShapedVerdicts(outcome, registries) });
    const vector = outcome.strength;
    const rate = (entry) => (entry === null || entry.rate === null ? '  -  ' : `${(entry.rate * 100).toFixed(0).padStart(3)}%`);
    console.log(
      `  ${suite.id.padEnd(42)} ${outcome.scored.length} probe(s)  defect ${rate(vector.defect)}  gameability ${rate(vector.gameability)}  zero-action ${rate(vector['zero-action'])}`,
    );
  }

  problems.push(...comparatorProblems(liveShaped, summary));

  const policy = await scoringPolicy();
  problems.push(...(await dominanceComparatorProblems(summary, policy.severityFloor)));

  // The live harness's staging, which nothing else in the chain reaches.
  //
  // `test/eval-contract-strength.js` is exposed only as `eval:contract-strength`
  // and `eval:preflight`, neither of which is in `npm test`, so its plumbing had
  // no gate at all. It stages a workspace for every trace leg, and a staging
  // call that returns a promise nobody awaits hands the port `cwd: undefined`,
  // which a spawn reads as "inherit": every leg would then run against this
  // checkout instead of the staged fixture, and the first signal would be a paid
  // live run measuring the wrong tree. Staging is pure plumbing with no model
  // call in it, so it belongs in this check rather than behind a credential.
  const traceGroundTruth = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'trace-eval', 'ground-truth.json'), 'utf8'));
  for (const set of traceGroundTruth.fixtureSets) {
    const staged = await stagedWorkspaceFor('trace', { channels: { stdin: { value: `\`{project-root}\`: \`${set.projectRoot}\`` } } });
    try {
      if (typeof staged?.cwd !== 'string' || !fs.existsSync(staged.cwd)) {
        problems.push(`${set.id}: the contract-strength harness staged no working directory (${JSON.stringify(staged?.cwd ?? null)})`);
      }
    } finally {
      if (typeof staged?.root === 'string') fs.rmSync(staged.root, { recursive: true, force: true });
    }
  }

  // A run that deletes a corpus member is reported as a mutation rather than
  // taking the harness down. The digest is over members the port resolves, so a
  // member that stopped resolving comes back null, and the caller counts null as
  // a mutation whatever the baseline holds.
  const mutationSet = traceGroundTruth.fixtureSets[0];
  const mutated = await stageWorkspace(mutationSet);
  try {
    fs.rmSync(path.join(mutated.projectDir, mutated.corpusFiles[0]));
    const afterDeletion = await digestTree(mutated.projectDir, mutated.corpusFiles);
    if (afterDeletion !== null) {
      problems.push(
        `deleting ${mutated.corpusFiles[0]} from a staged workspace left the corpus digest readable, so a destroyed benchmark reads as unmutated`,
      );
    }
  } finally {
    fs.rmSync(mutated.dir, { recursive: true, force: true });
  }

  // Through Prettier with this repository's own config, because test/probes/ is
  // not in .prettierignore and `npm run format:check` is part of the same gate.
  const prettierConfig = await prettier.resolveConfig(BASELINE_PATH);
  const rendered = await prettier.format(`${JSON.stringify(summary, null, 2)}\n`, {
    ...prettierConfig,
    parser: 'json',
    filepath: BASELINE_PATH,
  });
  if (write) {
    fs.writeFileSync(BASELINE_PATH, rendered, 'utf8');
    console.log(`\n${colors.green}wrote${colors.reset} test/probes/expected-strength.json`);
  } else if (fs.existsSync(BASELINE_PATH)) {
    const onDisk = fs.readFileSync(BASELINE_PATH, 'utf8');
    problems.push(...(await dominanceProblems(JSON.parse(onDisk), summary, policy.severityFloor)));
    if (onDisk !== rendered) {
      const expected = onDisk.split('\n');
      const actual = rendered.split('\n');
      const index = expected.findIndex((line, position) => line !== actual[position]);
      problems.push(
        `test/probes/expected-strength.json is out of date, first at line ${index + 1}\n` +
          `     recorded: ${(expected[index] ?? '(end of file)').trim()}\n` +
          `     measured: ${(actual[index] ?? '(end of file)').trim()}`,
      );
    }
  } else {
    problems.push('test/probes/expected-strength.json is missing; regenerate it with --write');
  }

  if (problems.length > 0) {
    console.error(`\n${colors.red}${problems.length} problem(s):${colors.reset}`);
    for (const problem of problems) console.error(`   ${problem}`);
    console.error(
      `\n${colors.dim}A score that moved is a finding. Read why before regenerating with: node test/test-probe-corpus.js --write${colors.reset}`,
    );
    return 1;
  }

  console.log(`\n${colors.green}every probe scored and every artifact matched its published schema${colors.reset}\n`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`${colors.red}probe corpus scoring could not run:${colors.reset} ${error.stack ?? error}`);
    process.exit(2);
  });
