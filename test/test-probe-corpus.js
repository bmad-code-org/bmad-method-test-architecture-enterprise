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
const { routingWholeBodyTargets } = require('../tools/generate-contracts');
const { baselineDifferences, cacheDirectoryFor, stagedWorkspaceFor, stagingOf } = require('./eval-contract-strength');
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
 * Oracles a stored correct run is known not to satisfy, each a defect of the oracle and not of the run.
 *
 * The real capture of the `evaluation-plan-quarry-grader` project quotes the folder names for the shell
 * (`npm install --prefix 'evals'`), which the harness's structural check accepts and a substring oracle over the
 * literal `npm install --prefix evals` cannot. Both oracles read a contract token from
 * `test/fixtures/ci-eval/ground-truth.json`, whose digest `test/probes/ci.probes.json` records and
 * `expected-strength.json` pins through the corpus digest, so closing the defect moves the baseline and is a story
 * of its own (found in Story 1.94, filed with the coordinator).
 *
 * The entry is exact. A listed oracle must resolve as violated, and it stops being listed in the change that fixes it:
 * a listed oracle that holds fails here, so the exception cannot outlive the defect.
 */
const KNOWN_UNHELD = [
  { suiteId: 'ci', setId: 'evaluation-plan-quarry-grader', elementId: 'command-evaluation-install' },
  { suiteId: 'ci', setId: 'evaluation-plan-quarry-grader', elementId: 'command-evaluation-ci-pr' },
];

/**
 * The suites whose evidence builder scores a stored run as the correct one (Story 1.94), and so must expose the oracle
 * specs and the legs the checks below read.
 *
 * One list, read by every check here. A builder that opts out of `storedRunSpecs` or `storedRunLegs` is a builder
 * reverted to a constant `held` (or one renamed so no check can find it), and `storedRunExposureProblems` fails it, so
 * no check skips it. A suite that exposes them without being listed fails too, so the list and
 * the builders cannot drift apart.
 */
const STORED_RUN_SUITES = new Set(['trace', 'nfr', 'test-design', 'ci']);

/** The suites that score a stored run and expose no way to read what they scored, and the suites that expose it unlisted. */
function storedRunExposureProblems(suite) {
  const listed = STORED_RUN_SUITES.has(suite.id);
  const specs = suite.evidence.storedRunSpecs;
  const legs = suite.evidence.storedRunLegs;
  if (listed && (specs === undefined || legs === undefined)) {
    return [
      `${suite.id}: the evidence builder exposes no ${[specs === undefined ? 'storedRunSpecs' : null, legs === undefined ? 'storedRunLegs' : null].filter(Boolean).join(' or ')}, so no check reads what its record scored and a constant held would pass the corpus`,
    ];
  }
  if (!listed && (specs !== undefined || legs !== undefined)) {
    return [`${suite.id}: the evidence builder exposes storedRunSpecs or storedRunLegs and the suite is not in STORED_RUN_SUITES`];
  }
  return [];
}

/**
 * The oracles a stored correct run no longer satisfies, one problem each.
 *
 * Four suites score a stored run as the correct one (`STORED_RUN_SUITES`), and each states its oracle specs on
 * `storedRunSpecs`. Their records derive every disposition from the scorer `tools/generate-contracts.js` pairs
 * with the oracle (Story 1.94), so a replay case that is not the correct run of its project or set, or a row of
 * `CI_CORRECT_RUNS` pointing at another project's workflow or at a deviation the substring vocabulary can state, reads
 * here as the oracle that no longer holds. The baseline below could not say which oracle: the clean control passes
 * pre-flight and scores `CONCERNS`, and `comparableResultOf` keeps only `probeId`, `state`, `severity` and
 * `trialIndex` of each outcome, so a moved oracle disposition or corroboration reaches no field of the baseline.
 * Rows of the full and minimal projects that move the run a defect probe carries do move the baseline; the
 * evaluation-plan row, which only P-004 reads, does not.
 *
 * The `KNOWN_UNHELD` check runs whatever the builder exposes: a builder with no specs resolves everything `held`,
 * which `storedRunExposureProblems` reports and which also trips every "holds now" entry here.
 */
function storedRunProblems(suite, scored) {
  if (!STORED_RUN_SUITES.has(suite.id)) return [];
  const specs = suite.evidence.storedRunSpecs ?? [];
  const problems = [];
  const known = KNOWN_UNHELD.filter((entry) => entry.suiteId === suite.id);
  const seen = new Set();
  for (const entry of scored) {
    for (const disposition of entry.record.oracleDispositions) {
      if (disposition.disposition === 'held') continue;
      const spec = specs.find((candidate) => candidate.id === disposition.oracleId);
      const listed = known.find((item) => item.setId === spec?.setId && item.elementId === spec?.elementId);
      if (listed !== undefined) {
        seen.add(listed);
        continue;
      }
      problems.push(
        `${suite.id} ${entry.probe.probeId}: oracle ${disposition.oracleId} no longer holds on the stored correct run (${disposition.note ?? disposition.disposition})`,
      );
    }
  }
  for (const item of known) {
    if (!seen.has(item)) {
      problems.push(`${suite.id}: ${item.elementId} on ${item.setId} holds now, so it no longer belongs in KNOWN_UNHELD`);
    }
  }
  return problems;
}

/**
 * Oracles no stored wrong run can fail, each with the reason, so the per-oracle check below states what it cannot reach.
 *
 * An entry is exact. Every oracle of its suite and kind must hold under every wrong read, and one a wrong read fails
 * stops being listed in the change that makes it failable: the exception cannot outlive its reason.
 */
const WRONG_RUN_CANNOT_FAIL = [
  {
    suiteId: 'ci',
    kind: 'run-measured',
    why: 'its scorer reads no workflow: the claim is that the run exited clean and wrote one, which every stored read states by construction',
  },
];

/**
 * The refused reads of each suite whose harness can refuse to score a run, one per leg, through `storedCase`.
 *
 * `reads` is the correct run a leg names and `through` is the stored case the harness refuses to score (summary schema
 * 0.2 or a matrix with no sections, a report with no domain sections or no assessment sections, a register with no
 * rows). Every oracle of that leg's set then answers `false`, which is the `scored === null` branch of each builder,
 * and the builder reports the set on `refusedSets` so the read is known to have been refused. `measuresStill` lists the
 * kinds that keep answering from what they read: test-design's projection-coherence reads the projection alone, so it
 * measures. It holds with the projection intact and is violated when the read is repeated with the projection's
 * `design` key dropped, so the branch is held in both directions. The ci scorer is a
 * substring search over the workflow and refuses nothing, so its entry is `null`.
 *
 * A leg without an entry fails: the run-measured oracle of a set is failed only by a refusal of that set's run, so
 * every leg needs one for its oracle to stay pinned.
 */
const REFUSED_READS = {
  trace: [
    { reads: 'seeded-correct-run', through: 'seeded-summary-schema-0-2', measuresStill: [] },
    { reads: 'clean-correct-run', through: 'clean-matrix-without-sections', measuresStill: [] },
  ],
  nfr: [
    { reads: 'gapped-correct-audit', through: 'gapped-report-without-sections', measuresStill: [] },
    { reads: 'clean-correct-audit', through: 'gapped-gate-without-assessment-sections', measuresStill: [] },
  ],
  'test-design': [
    { reads: 'seeded-correct-run', through: 'seeded-register-absent', measuresStill: ['projection-coherence'] },
    { reads: 'clean-correct-run', through: 'seeded-register-absent', measuresStill: ['projection-coherence'] },
  ],
  ci: null,
};

/**
 * One read of the clean control's record with the legs reading the cases `storedCase` names.
 *
 * `violated` is the set of oracles that resolve `violated`, and `refused` the sets whose stored run the harness
 * refused to score, as the builder reports them.
 */
async function readUnder(suite, probe, storedCase, options = {}) {
  const refused = new Set();
  const evidence = await suite.evidenceFor(suite.contract, { storedCase, refusedSets: refused, ...options });
  const inputs = await evidence.recordInputs(probe);
  return {
    violated: new Set(
      inputs.oracleDispositions.filter((disposition) => disposition.disposition === 'violated').map((disposition) => disposition.oracleId),
    ),
    refused,
  };
}

/** The oracles that resolve `violated` in the clean control's record when the suite's legs read the cases `storedCase` names. */
async function violatedUnder(suite, probe, storedCase, options = {}) {
  return (await readUnder(suite, probe, storedCase, options)).violated;
}

/**
 * Every set and every oracle of one suite held to a wrong stored run.
 *
 * `storedRunProblems` proves a correct row passes. Nothing in it fails when the derivation behind it is reverted to a
 * constant `held`, since a constant also passes every correct row, so this is the revert check of Story 1.94: the
 * evidence builder is asked for the same record with legs reading other runs through `storedCase`. Four reads:
 *
 * - Rotation. Leg i reads leg (i + 1) mod n, so every set reads a run other than its own. A set follows the run when
 *   an oracle that holds on its own run is violated in the rotated one. The identity record leaves the oracles of
 *   `KNOWN_UNHELD` out of that baseline, since the correct run already violates them.
 * - One leg at a time through every other stored case of the suite. This is what a `CI_CORRECT_RUNS` row pointed at
 *   another project's workflow or at a stored deviation looks like to the builder.
 * - For test-design, a projection with its `design` key dropped, which only the projection-coherence oracles read.
 * - The refused reads of `REFUSED_READS`, which must fail every oracle of the set that read them.
 *
 * Every oracle that holds on its own run must be violated by a scorer under at least one of the first three, or be
 * listed in `WRONG_RUN_CANNOT_FAIL` with the reason a wrong run cannot fail it. A violation a refusal produced counts
 * only for the `run-measured` oracles, whose scorer answers `true` for any scored run: the refusal answers every other
 * oracle of the set `false` without calling its scorer, so counting it would hide a scorer reverted to a constant
 * `held` behind the refusal. Constant `held` on any oracle fails this.
 */
async function wrongRunProblems(suite) {
  if (!STORED_RUN_SUITES.has(suite.id)) return [];
  const legs = suite.evidence.storedRunLegs;
  const specs = suite.evidence.storedRunSpecs;
  // `storedRunExposureProblems` reports a builder that exposes neither.
  if (legs === undefined || specs === undefined) return [];
  const probe = suite.probes.find((candidate) => candidate.expectedClean);
  if (probe === undefined) {
    return [`${suite.id}: the corpus has no clean control, so no record carries every set's run to read through another's`];
  }
  const caseIds = legs.map((leg) => leg.caseId);
  const shared = [...new Set(caseIds.filter((caseId, index) => caseIds.indexOf(caseId) !== index))];
  if (shared.length > 0) {
    return [
      `${suite.id}: more than one set reads the stored case ${shared.join(', ')}, so a read through another set's run cannot be told from the set's own`,
    ];
  }
  if (legs.length < 2) return [`${suite.id}: one set is the only leg, so there is no other stored run to read it through`];

  const problems = [];
  const own = await violatedUnder(suite, probe, (caseId) => caseId);
  const heldOnOwn = specs.filter((spec) => !own.has(spec.id));
  const specOf = new Map(specs.map((spec) => [spec.id, spec]));

  const rotation = new Map(legs.map((leg, index) => [leg.caseId, legs[(index + 1) % legs.length].caseId]));
  const rotated = await readUnder(suite, probe, (caseId) => rotation.get(caseId) ?? caseId);
  for (const leg of legs) {
    const followed = heldOnOwn.some((spec) => spec.setId === leg.setId && rotated.violated.has(spec.id));
    if (!followed) {
      problems.push(
        `${suite.id}: ${leg.setId} read the stored run of ${rotation.get(leg.caseId)} and no oracle that holds on its own run failed, so a replay case pointed at the wrong run passes the corpus`,
      );
    }
  }

  // What a scorer failed. A refusal answers every oracle of its set without a scorer, so it adds only the oracles
  // whose scorer answers `true` for every scored run.
  const failable = new Set();
  const take = (read) => {
    for (const oracleId of read.violated) {
      const spec = specOf.get(oracleId);
      if (!read.refused.has(spec.setId) || spec.kind === 'run-measured') failable.add(oracleId);
    }
  };
  take(rotated);
  const stored = fs
    .readdirSync(path.join(__dirname, 'replay', suite.id), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const leg of legs) {
    for (const read of stored.filter((name) => name !== leg.caseId)) {
      take(await readUnder(suite, probe, (caseId) => (caseId === leg.caseId ? read : caseId)));
    }
  }
  // The runner derives its projection from the document, so no stored document yields a malformed one. The
  // projection-coherence oracles read the projection alone, and the only wrong read that moves them is a projection
  // with a key dropped.
  if (suite.id === 'test-design') {
    take(await readUnder(suite, probe, (caseId) => caseId, { projectionOf: ({ design, ...rest }) => rest }));
  }
  // The whole-summary oracles read the summary's own keys. The only stored summary that drops a key belongs to the
  // seeded set (rejected_evidence), so the clean set's oracle is failed by a read that drops each key of the contract's
  // declaration in turn: the harness still scores the run, and the oracle that reads the whole object is the one that
  // must notice. A drop the harness refuses (schema_version) answers every oracle of the set, so it fails nothing here.
  if (suite.id === 'trace') {
    for (const key of suite.contract.permittedInterfaces[0].operations[0].responseDescriptor.requiredKeys) {
      const read = await readUnder(suite, probe, (caseId) => caseId, {
        summaryOf: (summary) => {
          const { [key]: _dropped, ...rest } = summary;
          return rest;
        },
      });
      take(read);
      for (const spec of specs.filter((candidate) => candidate.kind === 'whole-summary')) {
        if (!read.refused.has(spec.setId) && !read.violated.has(spec.id)) {
          problems.push(
            `${suite.id}: ${spec.id} (whole-summary on ${spec.setId}) still held when the stored summary lost ${key}, so a constant held would pass the corpus`,
          );
        }
      }
    }
  }
  for (const spec of heldOnOwn) {
    const accepted = WRONG_RUN_CANNOT_FAIL.find((entry) => entry.suiteId === suite.id && entry.kind === spec.kind);
    const where = `${spec.id} (${spec.kind}${spec.elementId ? ` ${spec.elementId}` : ''} on ${spec.setId})`;
    if (accepted === undefined && !failable.has(spec.id)) {
      problems.push(`${suite.id}: ${where} holds under every wrong stored run, so a constant held would pass the corpus`);
    }
    if (accepted !== undefined && failable.has(spec.id)) {
      problems.push(
        `${suite.id}: ${where} is listed in WRONG_RUN_CANNOT_FAIL and a wrong stored run fails it, so it no longer belongs there`,
      );
    }
  }
  for (const entry of WRONG_RUN_CANNOT_FAIL.filter((candidate) => candidate.suiteId === suite.id)) {
    if (!specs.some((spec) => spec.kind === entry.kind)) {
      problems.push(`${suite.id}: WRONG_RUN_CANNOT_FAIL lists ${entry.kind}, which no oracle of the suite has`);
    }
  }

  const refusals = REFUSED_READS[suite.id];
  if (refusals === undefined) return [...problems, `${suite.id}: REFUSED_READS states no refused read for this suite`];
  if (refusals === null) return problems;
  for (const leg of legs) {
    if (!refusals.some((refusal) => refusal.reads === leg.caseId)) {
      problems.push(
        `${suite.id}: REFUSED_READS states no refused read for ${leg.setId}, so its run-measured oracle is failed by nothing the check reads`,
      );
    }
  }
  for (const refusal of refusals) {
    const refusedLeg = legs.find((leg) => leg.caseId === refusal.reads);
    if (refusedLeg === undefined) {
      problems.push(`${suite.id}: REFUSED_READS reads ${refusal.reads}, which is no leg of the suite`);
      continue;
    }
    const through = (caseId) => (caseId === refusal.reads ? refusal.through : caseId);
    const refused = await readUnder(suite, probe, through);
    if (!refused.refused.has(refusedLeg.setId)) {
      problems.push(
        `${suite.id}: ${refusedLeg.setId} read ${refusal.through} and the harness did not refuse it, so the refused-run branch is not the one answering`,
      );
    }
    const setSpecs = specs.filter((candidate) => candidate.setId === refusedLeg.setId);
    for (const spec of setSpecs.filter((candidate) => !refusal.measuresStill.includes(candidate.kind))) {
      if (!refused.violated.has(spec.id)) {
        problems.push(
          `${suite.id}: ${spec.id} (${spec.kind}) on ${spec.setId} still held when the set read ${refusal.through}, which the harness refuses to score, so the refused-run branch answers nothing`,
        );
      }
    }
    // The kinds that keep measuring on a refused run read the projection alone. With the projection intact they hold,
    // and a malformed projection must fail them, so the branch is held in both directions.
    if (refusal.measuresStill.length > 0) {
      for (const spec of setSpecs.filter((candidate) => refusal.measuresStill.includes(candidate.kind))) {
        if (refused.violated.has(spec.id)) {
          problems.push(
            `${suite.id}: ${spec.id} (${spec.kind}) on ${spec.setId} was violated when the set read ${refusal.through} with its projection intact, so the refused-run branch does not measure it`,
          );
        }
      }
      const malformed = await readUnder(suite, probe, through, { projectionOf: ({ design, ...rest }) => rest });
      for (const spec of setSpecs.filter((candidate) => refusal.measuresStill.includes(candidate.kind))) {
        if (!malformed.violated.has(spec.id)) {
          problems.push(
            `${suite.id}: ${spec.id} (${spec.kind}) on ${spec.setId} still held when the set read ${refusal.through} with its projection's design dropped, so the refused-run branch does not measure it`,
          );
        }
      }
    }
  }
  return problems;
}

/**
 * An oracle the generator does not specify has to throw, and must never resolve `held`.
 *
 * A contract that declares an oracle identifier no spec states is a stale contract file, and a builder that answered
 * `held` for it would score a claim nothing measured. Each builder that measures a stored run (the four of
 * `STORED_RUN_SUITES` and test-review's) is asked for the clean control's record against the contract with one extra
 * oracle.
 */
async function unknownOracleProblems(suite) {
  if (!STORED_RUN_SUITES.has(suite.id) && suite.evidence.verdictOracleIds === undefined) return [];
  const probe = suite.probes.find((candidate) => candidate.expectedClean);
  if (probe === undefined) return [];
  const contract = { ...suite.contract, oracles: [...suite.contract.oracles, { ...suite.contract.oracles[0], id: 'O-999' }] };
  try {
    await (await suite.evidenceFor(contract)).recordInputs(probe);
  } catch (error) {
    return /O-999.*(does not specify|measures nothing for)/.test(error.message)
      ? []
      : [`${suite.id}: an unknown oracle threw ${error.message}, not the unspecified-oracle error`];
  }
  return [`${suite.id}: a contract declaring oracle O-999, which this suite's builder measures nothing for, was scored without an error`];
}

/**
 * The test-review record measures its stored verdict, including the two oracles of the verdict-payload behavior.
 *
 * Read through a verdict that exits 0 (`approved-with-no-findings`) the exit-code oracle must be violated. Read through
 * the stored verdict with one field dropped (each of the four top-level fields, and each of the four a finding carries,
 * every one a verdict the harness still scores) the payload oracle must be, with the exit-code oracle still held. Read
 * through a verdict the harness refuses to score (`verdict-without-findings`, whose expected result is `null`) every
 * oracle must be violated. Both oracles hold on the stored verdict the record carries, so a builder that fixes either
 * at `held`, or reads fewer fields than the oracle's operands name, fails here.
 */
async function testReviewVerdictProblems(suite) {
  if (suite.id !== 'test-review') return [];
  const probe = suite.probes.find((candidate) => candidate.expectedClean);
  const { exitOracleId, payloadOracleId, wholeBodyOracleId } = suite.evidence.verdictOracleIds;
  const problems = [];
  // The contract on disk must carry the oracle that reads the whole verdict. The builder tolerates its absence so a
  // contract variant without it can be scored for coverage, which leaves this the check that fails the real contract.
  if (wholeBodyOracleId === undefined) {
    return ['test-review: no behavior links tea-cli-contract/verdict-whole-body, so no oracle reads the whole verdict'];
  }
  const own = await violatedUnder(suite, probe, (caseId) => caseId);
  for (const oracleId of [exitOracleId, payloadOracleId, wholeBodyOracleId]) {
    if (own.has(oracleId)) problems.push(`test-review: ${oracleId} is violated on the stored verdict the record carries`);
  }
  // The whole-verdict oracle reads every key the CLI always writes and no key it does not declare, so a verdict that
  // loses any one key, carries an extra one, or holds a key of another type must violate it, whether or not the harness
  // still scores the verdict. Dropping one key is the read a reader of fewer keys than the oracle names would miss.
  const { VERDICT_KEYS } = require('../cli/test-review');
  // A value of another JSON kind than the type the CLI declares: an array is not an object here, and a string is neither.
  const wrongValueOf = (type) => ({ string: 7, number: 'seven', boolean: 'yes', object: [], array: 'none' })[type];
  const wholeBodyReads = [
    { label: 'an undeclared key', verdictOf: (verdict) => ({ ...verdict, undeclaredKey: 1 }) },
    ...Object.keys(VERDICT_KEYS.always).map((key) => ({
      label: `the verdict's ${key}`,
      verdictOf: (verdict) => {
        const { [key]: _dropped, ...rest } = verdict;
        return rest;
      },
    })),
    ...Object.entries({ ...VERDICT_KEYS.always, ...VERDICT_KEYS.conditional })
      .filter(([, type]) => type !== null)
      .map(([key, type]) => ({
        label: `a ${key} that is not ${type}`,
        verdictOf: (verdict) => (Object.hasOwn(verdict, key) ? { ...verdict, [key]: wrongValueOf(type) } : verdict),
        // A key the stored verdict does not carry stays absent, and the verdict is whole.
        skipWhenAbsent: key,
      })),
  ];
  const storedVerdict = JSON.parse(fs.readFileSync(path.join(__dirname, 'replay', 'test-review', 'full-recall', 'verdict.json'), 'utf8'));
  for (const { label, verdictOf, skipWhenAbsent } of wholeBodyReads) {
    if (skipWhenAbsent !== undefined && !Object.hasOwn(storedVerdict, skipWhenAbsent)) continue;
    const read = await violatedUnder(suite, probe, (caseId) => caseId, { verdictOf });
    if (!read.has(wholeBodyOracleId)) {
      problems.push(`test-review: ${wholeBodyOracleId} still held when the stored verdict carried ${label}`);
    }
  }
  const exits0 = await violatedUnder(suite, probe, (caseId) => (caseId === 'full-recall' ? 'approved-with-no-findings' : caseId));
  if (!exits0.has(exitOracleId)) {
    problems.push(`test-review: ${exitOracleId} still held when the record read approved-with-no-findings, which exits 0`);
  }
  const drops = [
    ...['findings', 'violations', 'qualityScore', 'recommendation'].map((key) => ({
      label: `the verdict's ${key}`,
      // The exit code is the one the recommendation maps to, so a verdict without one exits 0 and the exit-code oracle
      // is violated by the same drop. Every other field leaves the exit code where it was.
      exitFollows: key === 'recommendation',
      verdictOf: (verdict) => {
        const { [key]: _dropped, ...rest } = verdict;
        return rest;
      },
    })),
    // The oracle's operands are `for-all` over the findings, so a field dropped from the first finding and from the
    // last one must both fail it: a reader of the first finding alone passes the first.
    ...['row', 'file', 'line', 'severity'].map((key) => ({
      label: `the ${key} of its first finding`,
      verdictOf: (verdict) => {
        const { [key]: _dropped, ...first } = verdict.findings[0];
        return { ...verdict, findings: [first, ...verdict.findings.slice(1)] };
      },
    })),
    ...['row', 'file', 'line', 'severity'].map((key) => ({
      label: `the ${key} of its last finding`,
      verdictOf: (verdict) => {
        const { [key]: _dropped, ...last } = verdict.findings.at(-1);
        return { ...verdict, findings: [...verdict.findings.slice(0, -1), last] };
      },
    })),
  ];
  for (const { label, verdictOf, exitFollows = false } of drops) {
    const dropped = await violatedUnder(suite, probe, (caseId) => caseId, { verdictOf });
    if (!dropped.has(payloadOracleId)) {
      problems.push(`test-review: ${payloadOracleId} still held when the stored verdict lost ${label}`);
    }
    if (dropped.has(exitOracleId) !== exitFollows) {
      problems.push(
        exitFollows
          ? `test-review: ${exitOracleId} still held when the stored verdict lost ${label}, which the exit code is read from`
          : `test-review: ${exitOracleId} was violated by a verdict that lost only ${label}`,
      );
    }
  }
  let refused;
  try {
    refused = await violatedUnder(suite, probe, (caseId) => (caseId === 'full-recall' ? 'verdict-without-findings' : caseId));
  } catch (error) {
    // A builder that scores a verdict the harness refused reads the measurement that is not there.
    return [...problems, `test-review: reading verdict-without-findings, which the harness refuses to score, threw ${error.message}`];
  }
  for (const oracleId of suite.contract.oracles.map((oracle) => oracle.id)) {
    if (!refused.has(oracleId)) {
      problems.push(
        `test-review: ${oracleId} still held when the record read verdict-without-findings, which the harness refuses to score`,
      );
    }
  }
  return problems;
}

/**
 * The routing records carry the constructed correct answer of every case and no stored run, so they are not in
 * `STORED_RUN_SUITES`: nothing stored can be pointed at the wrong run. Each case's whole-body oracle is derived from the
 * answer the record carries for it through the scorer `tools/generate-contracts.js` pairs with it (Story 1.100), and
 * this holds that derivation to the answer. Read through an answer that lost its reason, lost its action, carries an
 * action the skill does not allow or carries a key the runner does not declare, the oracle of that case must be
 * violated and the oracle of every other case must stay held. A builder that fixes the disposition at `held`, or reads
 * one case's answer for another, fails here, and so does a contract without the oracle of a case.
 */
async function routingWholeBodyProblems(suite) {
  if (!suite.id.startsWith('tea-routing-')) return [];
  const probe = suite.probes.find((candidate) => candidate.expectedClean);
  if (probe === undefined) return [];
  const steps = suite.contract.interactionPlan.map((planStep) => planStep.stepId);
  const oracleOf = new Map(
    steps.map((stepId) => [
      stepId,
      suite.contract.oracles.find(
        (oracle) => JSON.stringify(oracle.direction.evidenceTargets) === JSON.stringify(routingWholeBodyTargets(stepId)),
      )?.id,
    ]),
  );
  const problems = [];
  for (const [stepId, oracleId] of oracleOf) {
    if (oracleId === undefined)
      problems.push(`${suite.id}: no oracle names the two required keys of ${stepId}, so nothing reads its whole answer`);
  }
  if (problems.length > 0) return problems;
  const own = await violatedUnder(suite, probe, (caseId) => caseId);
  for (const [stepId, oracleId] of oracleOf) {
    if (own.has(oracleId))
      problems.push(`${suite.id}: ${oracleId} (whole-body on ${stepId}) is violated on the constructed correct answer`);
  }
  const malformed = [
    { label: 'a reason of null', answerOf: (answer) => ({ ...answer, reason: null }) },
    {
      label: 'no reason key',
      answerOf: ({ reason: _reason, ...rest }) => rest,
    },
    {
      label: 'no action key',
      answerOf: ({ action: _action, ...rest }) => rest,
    },
    { label: 'an action the skill does not allow', answerOf: (answer) => ({ ...answer, action: 'maybe' }) },
    { label: 'a key the runner does not declare', answerOf: (answer) => ({ ...answer, confidence: 1 }) },
  ];
  for (const stepId of [steps[0], steps.at(-1)]) {
    for (const { label, answerOf } of malformed) {
      const read = await violatedUnder(suite, probe, (caseId) => caseId, {
        answerOf: (caseId, answer) => (caseId === stepId ? answerOf(answer) : answer),
      });
      if (!read.has(oracleOf.get(stepId))) {
        problems.push(`${suite.id}: ${oracleOf.get(stepId)} (whole-body on ${stepId}) still held when its answer had ${label}`);
      }
      for (const [otherId, oracleId] of oracleOf) {
        if (otherId !== stepId && read.has(oracleId)) {
          problems.push(`${suite.id}: ${oracleId} (whole-body on ${otherId}) was violated by an answer of ${stepId} that had ${label}`);
        }
      }
    }
  }
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
    problems.push(
      ...storedRunProblems(suite, outcome.scored),
      ...storedRunExposureProblems(suite),
      ...(await wrongRunProblems(suite)),
      ...(await unknownOracleProblems(suite)),
      ...(await testReviewVerdictProblems(suite)),
      ...(await routingWholeBodyProblems(suite)),
    );

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
  //
  // The NFR, CI and test-design legs are staged the same way, each fixture set
  // by its own suite's harness: until Story 1.7 they ran in an empty directory,
  // and every live agent reported its skill and project missing.
  // The leg cache is keyed by how a suite's legs are staged, so a leg staged
  // from its fixture set is never answered by one run in an empty directory.
  const cacheOptions = { cache: path.join('cache-root'), agent: 'claude' };
  const emptyStaging = cacheDirectoryFor(cacheOptions, 'fragment-selection/bmad-testarch-ci');
  for (const suiteId of ['trace', 'nfr', 'ci', 'test-design', 'test-review']) {
    const directory = cacheDirectoryFor(cacheOptions, suiteId);
    if (path.basename(directory) !== stagingOf(suiteId) || stagingOf(suiteId) === path.basename(emptyStaging)) {
      problems.push(
        `${suiteId}: the leg cache path ${directory} does not carry a staging name of its own, so a leg could be answered by a run staged another way`,
      );
    }
  }
  const traceGroundTruth = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'trace-eval', 'ground-truth.json'), 'utf8'));
  for (const [suiteId, fixtureDirectory, runner] of [
    ['trace', 'trace-eval', 'tea-trace-runner'],
    ['nfr', 'nfr-eval', 'tea-nfr-runner'],
    ['ci', 'ci-eval', 'tea-ci-runner'],
    ['test-design', 'test-design-eval', 'tea-test-design-runner'],
  ]) {
    const groundTruth = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', fixtureDirectory, 'ground-truth.json'), 'utf8'));
    for (const set of groundTruth.fixtureSets) {
      const staged = await stagedWorkspaceFor(suiteId, { channels: { stdin: { value: `\`{project-root}\`: \`${set.projectRoot}\`` } } });
      try {
        if (typeof staged?.cwd !== 'string' || !fs.existsSync(staged.cwd)) {
          problems.push(
            `${suiteId} ${set.id}: the contract-strength harness staged no working directory (${JSON.stringify(staged?.cwd ?? null)})`,
          );
          continue;
        }
        for (const expected of [set.projectRoot, 'skill']) {
          if (!fs.existsSync(path.join(staged.cwd, expected))) {
            problems.push(`${suiteId} ${set.id}: the staged workspace holds no ${expected}/, so the leg's agent would find nothing to run`);
          }
        }
        if (Object.keys(staged.artifacts?.[runner] ?? {}).length === 0) {
          problems.push(
            `${suiteId} ${set.id}: the staged workspace names no artifact path for ${runner}, so the leg's report would never be read back`,
          );
        }
      } finally {
        if (typeof staged?.root === 'string') fs.rmSync(staged.root, { recursive: true, force: true });
      }
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
