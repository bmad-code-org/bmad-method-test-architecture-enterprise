/**
 * The scoring half of `eval-quality`, driven over TEA's probe corpora.
 *
 * `runPreflight` decides whether the environment can measure anything, `runScore`
 * decides whether a contract's oracles caught the defect a probe seeded, and
 * `seal` produces the brief an evaluator may see. This module wires all three and
 * is the only place their inputs are assembled, so the deterministic gate and the
 * live run score the same way and differ only in which port answers the pre-flight
 * legs.
 *
 * ONE RECORD PER PROBE, AND WHY
 *
 * `runScore` scores exactly one probe per call, and `mapFindings` buckets any
 * defect finding citing a different probe as `dangling`, which resolves the
 * oracle that finding cites to `infrastructure-error` and invalidates the whole
 * run. A record is therefore paired with a probe and carries the findings
 * attributed to that probe. Nothing is hidden by that: the observations the
 * record carries are the complete output of the run, and every oracle reads them.
 *
 * WHERE THE EVIDENCE COMES FROM
 *
 * The deterministic half scores the outputs `test/replay/` already stores, which
 * is the same corpus `npm run test:eval-replay` and `npm run test:contract-oracles`
 * read. No model call, no credential, no network. The live half scores the same
 * shapes off a real pre-flight. Two of the stored outputs are real captures and
 * the rest are constructed, which each case's own expected.json records.
 *
 * WHAT A DISPOSITION SAYS
 *
 * `oracleDispositions` is the evaluator's own claim about each oracle, and the
 * evaluator here is TEA's scorer. Each disposition is derived from what the
 * stored case records the scorer measured rather than from evaluating the oracle,
 * so `eval-quality`'s corroboration compares two independent readings of one
 * verdict. That is the same agreement `npm run test:contract-oracles` checks, read
 * through the scoring stage instead of the evaluator.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { digest } = require('./eval-record');
const {
  evaluatorConfiguration,
  isolationManifest,
  loadEvalQuality,
  recordObservation,
  scoringPolicy,
  sealedRunRecord,
  validateArtifact,
} = require('./eval-quality-inputs');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const CONTRACT_ROOT = path.join(PROJECT_ROOT, 'test', 'contracts');
const PROBE_ROOT = path.join(PROJECT_ROOT, 'test', 'probes');
const REPLAY_ROOT = path.join(PROJECT_ROOT, 'test', 'replay');
const EVAL_ROOT = path.join(PROJECT_ROOT, 'test', 'evals');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const stripComment = (value) => {
  const { $comment, ...rest } = value;
  return rest;
};

/** The budgets and ceilings a replayed run declares. A stored output cost nothing to read and the artifacts have to say so. */
const REPLAY_BUDGETS = { maxToolCalls: 0, maxWallClockMinutes: 0, maxCostUsd: '0' };
const REPLAY_CEILINGS = { maxToolCalls: 1, maxInputTokens: 1, maxOutputTokens: 1, maxWallClockMinutes: 1, maxCostUsd: '0.01' };
const REPLAY_USE = { toolCalls: 0, inputTokens: 0, outputTokens: 0, wallClockSeconds: 0, costUsd: '0' };

const FORBIDDEN_INPUT_NOTE =
  'The run is handed a prompt and a workspace. The ground truth, the planted rows, and the expected selection stay in the harness.';

// ---------------------------------------------------------------------------
// evidence: test-review
// ---------------------------------------------------------------------------

function reviewVerdict(caseId) {
  return stripComment(readJson(path.join(REPLAY_ROOT, 'test-review', caseId, 'verdict.json')));
}

function reviewExpectation(caseId) {
  return readJson(path.join(REPLAY_ROOT, 'test-review', caseId, 'expected.json')).result;
}

/** `Block` is the only recommendation that exits 1; every other measured verdict exits 0. */
const reviewExitCode = (verdict) => (verdict.recommendation === 'Block' ? 1 : 0);

function reviewBody(verdict) {
  return {
    exitCode: reviewExitCode(verdict),
    stdout: { kind: 'json', value: verdict },
    stderr: { kind: 'text', value: '' },
    artifacts: { verdict: { kind: 'json', value: verdict }, report: { kind: 'text', value: '' } },
  };
}

/**
 * Which oracle each behavior discharges, keyed by the requirement the behavior
 * links.
 *
 * Read off `requirementLinks` rather than parsed out of an oracle's commentary
 * prose or counted off the end of the oracle list. Both are generated from one
 * ground truth, and a link is a declared field while the commentary is a
 * sentence somebody may reword and the ordering is a convention nothing checks.
 */
function oracleIdsByRequirement(contract) {
  const byRequirement = new Map();
  for (const behavior of contract.behaviors) {
    if (behavior.oracles.length !== 1) continue;
    for (const link of behavior.requirementLinks) byRequirement.set(`${link.scheme}/${link.id}`, behavior.oracles[0]);
  }
  return byRequirement;
}

function testReviewEvidence(contract) {
  const step = contract.interactionPlan[0];
  const reviewedFiles = step.inputBinding.option.files.literal;
  const groundTruth = readJson(path.join(PROJECT_ROOT, 'test', 'fixtures', 'test-review-eval', 'ground-truth.json'));
  const byRequirement = oracleIdsByRequirement(contract);
  const cleanFile = groundTruth.files.find((entry) => (entry.planted ?? []).length === 0);
  const cleanOracleId = byRequirement.get(`tea-eval-ground-truth/${cleanFile.path}`);
  const scopeOracleId = byRequirement.get(`tea-eval-ground-truth/${groundTruth.negativeControls[0].id}`);
  const rowOfOracle = new Map(
    groundTruth.files
      .flatMap((entry) => entry.planted ?? [])
      .map((plant) => [byRequirement.get(`tea-criteria-registry/${plant.row}`), plant.row]),
  );

  return {
    /**
     * The two witness legs differ in the file list they review, so the answer is
     * chosen the same way: a leg naming a seeded fixture gets the review that
     * reports every planted row, and a leg naming the clean control gets the
     * review that reports nothing gating.
     */
    answer(request) {
      const files = String(request.channels.option.files ?? '');
      return reviewBody(reviewVerdict(files.includes('/seeded/') ? 'full-recall' : 'approved-with-no-findings'));
    },
    recordInputs(probe) {
      // The gameability probe is scored against the run that games the suite:
      // every planted row reported, plus one finding against a file nobody asked
      // the reviewer to look at.
      const caseId = probe.probeClass === 'gameability' ? 'out-of-scope-finding' : 'full-recall';
      const verdict = reviewVerdict(caseId);
      const measured = reviewExpectation(caseId);
      const observationId = 'review-corpus-run';
      const body = reviewBody(verdict);
      const observations = [
        recordObservation({
          observationId,
          sequence: 1,
          operationId: step.operationId,
          callInputs: { option: { files: reviewedFiles, json: 'verdict.json', agent: 'claude' } },
          stdout: body.stdout,
          stderr: body.stderr,
          exitCode: body.exitCode,
          artifacts: body.artifacts,
        }),
      ];

      // The scope oracle is the last but two, by the order
      // tools/generate-contracts.js writes them: one oracle per plant, then the
      // clean control, the scope control, the verdict shape, and the exit code.
      const oracleIds = contract.oracles.map((oracle) => oracle.id);
      const missedRows = new Set(measured.misses);

      const findings =
        probe.probeClass === 'gameability'
          ? [
              {
                findingType: 'defect',
                findingId: 'F-001',
                oracleId: scopeOracleId,
                probeId: probe.probeId,
                behaviorId: probe.behaviorId,
                severity: 'material',
                summary: `The review reported ${measured.outOfScope} finding(s) against a file outside the review set.`,
                confidence: 1,
                observationIds: [observationId],
                evidenceArtifacts: [],
                quotedEvidence: [
                  {
                    quote: verdict.findings.find((finding) => !reviewedFiles.includes(finding.file)).file,
                    channel: 'artifact',
                    artifactId: 'verdict',
                  },
                ],
              },
            ]
          : [];

      const violated = new Set(findings.map((finding) => finding.oracleId));
      const held = (oracleId) => {
        if (violated.has(oracleId)) return false;
        if (oracleId === scopeOracleId) return measured.outOfScope === 0;
        if (oracleId === cleanOracleId) return measured.falsePositives - measured.outOfScope === 0;
        const row = rowOfOracle.get(oracleId);
        return row === undefined ? true : !missedRows.has(row);
      };

      return {
        observations,
        findings,
        oracleDispositions: oracleIds.map((oracleId) => ({
          oracleId,
          disposition: held(oracleId) ? 'held' : 'violated',
          observationIds: [observationId],
          note: null,
        })),
        evaluatorRecommendation: findings.length > 0 ? 'CONCERNS' : 'PASS',
        conditionArm: caseId,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// evidence: trace
// ---------------------------------------------------------------------------

function traceArtifacts(caseId) {
  const root = path.join(REPLAY_ROOT, 'trace', caseId, 'test-artifacts');
  return {
    summary: { kind: 'json', value: stripComment(readJson(path.join(root, 'e2e-trace-summary.json'))) },
    matrix: { kind: 'text', value: fs.readFileSync(path.join(root, 'traceability-matrix.md'), 'utf8') },
  };
}

function traceEvidence(contract) {
  const [seededStep, cleanStep] = contract.interactionPlan;

  return {
    /**
     * The witness differentiates on one prompt value, `allow_gate`. A leg that
     * allows the gate gets the run that evaluated one; a leg that withholds it
     * gets a summary whose `gate_basis` is `none`, which is what step-05 writes
     * when the gate is not evaluated.
     */
    answer(request) {
      const prompt = String(request.channels.stdin?.value ?? '');
      const artifacts = traceArtifacts('seeded-correct-run');
      if (/allow_gate`?: `?false/.test(prompt)) {
        const withheld = { ...artifacts.summary.value, gate_basis: 'none', gate_status: 'NOT_EVALUATED' };
        return {
          exitCode: 0,
          stdout: { kind: 'text', value: '' },
          stderr: { kind: 'text', value: '' },
          artifacts: { ...artifacts, summary: { kind: 'json', value: withheld } },
        };
      }
      return { exitCode: 0, stdout: { kind: 'text', value: '' }, stderr: { kind: 'text', value: '' }, artifacts };
    },
    recordInputs(probe) {
      const clean = probe.expectedClean;
      const caseId = clean ? 'clean-correct-run' : 'seeded-correct-run';
      const step = clean ? cleanStep : seededStep;
      const observationId = clean ? 'trace-clean-run' : 'trace-seeded-run';
      const artifacts = traceArtifacts(caseId);
      return {
        observations: [
          recordObservation({
            observationId,
            sequence: 1,
            operationId: step.operationId,
            callInputs: { option: { agent: 'claude' }, stdin: { prompt: `The prompt the trace harness assembles for ${caseId}.` } },
            stdout: { kind: 'text', value: '' },
            stderr: { kind: 'text', value: '' },
            exitCode: 0,
            artifacts,
          }),
        ],
        findings: [],
        // Both stored runs are recorded as scoring every check they were given,
        // so every oracle held on the evidence the harness read.
        oracleDispositions: contract.oracles.map((oracle) => ({
          oracleId: oracle.id,
          disposition: 'held',
          observationIds: [observationId],
          note: null,
        })),
        evaluatorRecommendation: 'PASS',
        conditionArm: caseId,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// evidence: fragment selection
// ---------------------------------------------------------------------------

function selectionBody(fragments) {
  return {
    exitCode: 0,
    stdout: { kind: 'json', value: { fragments } },
    stderr: { kind: 'text', value: '' },
    artifacts: {},
  };
}

function fragmentSelectionEvidence(contract, workflow) {
  const evals = readJson(path.join(EVAL_ROOT, workflow, 'evals.json'));
  const caseOf = new Map(evals.cases.map((entry) => [entry.id, entry]));
  const first = evals.cases[0];
  const step = contract.interactionPlan.find((entry) => entry.stepId === first.id);

  return {
    /**
     * A witness leg's prompt names its own case, so the answer is that case's
     * mandated set. The two legs mandate different sets by construction, which is
     * what `buildSelectionWitness` asserts before it writes the witness, so the
     * differential holds on correct answers and would fail on a runner that
     * returned one list whatever it was asked.
     */
    answer(request) {
      // The leg carries the prompt the harness assembles, and the one part of it
      // that differs case by case is the task the run is given. Matching on that
      // is what tells the two witness legs apart.
      const prompt = String(request.channels.stdin?.value ?? '');
      const matched = evals.cases.find((entry) => prompt.includes(entry.prompt)) ?? first;
      return selectionBody(matched.expect.mustLoad);
    },
    recordInputs(probe) {
      const entry = caseOf.get(first.id);
      // The degenerate reply names every fragment the case mentions, mandated and
      // forbidden alike. It clears the containment oracle and is exactly what the
      // exclusion oracle exists to reject.
      const fragments =
        probe.probeClass === 'gameability' ? [...entry.expect.mustLoad, ...entry.expect.mustNotLoad] : entry.expect.mustLoad;
      const observationId = `${first.id}-run`;
      const body = selectionBody(fragments);
      const observations = [
        recordObservation({
          observationId,
          sequence: 1,
          operationId: step.operationId,
          callInputs: { option: { agent: 'claude' }, stdin: { prompt: `The prompt the selection harness assembles for ${first.id}.` } },
          stdout: body.stdout,
          stderr: body.stderr,
          exitCode: body.exitCode,
          artifacts: {},
        }),
      ];

      const named = new Set(fragments);
      const forbiddenNamed = entry.expect.mustNotLoad.filter((fragment) => named.has(fragment));
      const findings =
        forbiddenNamed.length > 0
          ? [
              {
                findingType: 'defect',
                findingId: 'F-001',
                oracleId: 'O-002',
                probeId: probe.probeId,
                behaviorId: probe.behaviorId,
                severity: 'critical',
                summary: `The selection for ${first.id} named ${forbiddenNamed.length} fragment(s) the step file excludes.`,
                confidence: 1,
                observationIds: [observationId],
                evidenceArtifacts: [],
                quotedEvidence: [{ quote: forbiddenNamed[0], channel: 'stdout', artifactId: null }],
              },
            ]
          : [];

      // Every case beyond the first is unexercised by this record, so its oracles
      // carry no attempt. A `not-attempted` disposition citing nothing is the one
      // spelling AD-33 admits for that.
      const exercisedOracleIds = new Set(['O-001', 'O-002']);
      const violated = new Set(findings.map((finding) => finding.oracleId));
      return {
        observations,
        findings,
        oracleDispositions: contract.oracles.map((oracle) => {
          if (!exercisedOracleIds.has(oracle.id))
            return { oracleId: oracle.id, disposition: 'not-attempted', observationIds: [], note: null };
          return {
            oracleId: oracle.id,
            disposition: violated.has(oracle.id) ? 'violated' : 'held',
            observationIds: [observationId],
            note: null,
          };
        }),
        evaluatorRecommendation: findings.length > 0 ? 'CONCERNS' : 'PASS',
        conditionArm: probe.probeClass === 'gameability' ? 'degenerate-selection' : 'expected-selection',
      };
    },
  };
}

// ---------------------------------------------------------------------------
// the suites
// ---------------------------------------------------------------------------

/** Every contract that has a probe corpus, with the evidence source that answers for it. */
function suites() {
  const entries = [
    {
      id: 'test-review',
      contractPath: path.join(CONTRACT_ROOT, 'test-review.contract.json'),
      probesPath: path.join(PROBE_ROOT, 'test-review.probes.json'),
      evidenceFor: testReviewEvidence,
    },
    {
      id: 'trace',
      contractPath: path.join(CONTRACT_ROOT, 'trace.contract.json'),
      probesPath: path.join(PROBE_ROOT, 'trace.probes.json'),
      evidenceFor: traceEvidence,
    },
  ];
  const selectionRoot = path.join(PROBE_ROOT, 'fragment-selection');
  for (const name of fs.readdirSync(selectionRoot).sort()) {
    if (!name.endsWith('.probes.json')) continue;
    const workflow = name.replace('.probes.json', '');
    entries.push({
      id: `fragment-selection/${workflow}`,
      contractPath: path.join(CONTRACT_ROOT, 'fragment-selection', `${workflow}.contract.json`),
      probesPath: path.join(selectionRoot, name),
      evidenceFor: (contract) => fragmentSelectionEvidence(contract, workflow),
    });
  }
  return entries.map((entry) => {
    const contract = readJson(entry.contractPath);
    return { ...entry, contract, probes: readJson(entry.probesPath), evidence: entry.evidenceFor(contract) };
  });
}

/** An `EnvironmentProbePort` that answers every leg from the outputs `test/replay/` already stores. */
function storedProbePort(suite) {
  return {
    async probe(request) {
      const body = suite.evidence.answer(request);
      return {
        probeId: request.probeId,
        interfaceId: request.interfaceId,
        operationId: request.operationId,
        kind: 'cli',
        exitCode: body.exitCode,
        stdout: body.stdout,
        stderr: body.stderr,
        artifacts: body.artifacts,
      };
    },
  };
}

/**
 * One probe's pre-flight, through whichever port the caller supplies.
 *
 * Per probe rather than per corpus, because `runScore` pairs one probe with one
 * verdict and AD-10 plans a seeded-fault check for every defect the probes it is
 * handed declare. A corpus-wide verdict lets one probe nobody can pre-flight
 * invalidate the score of every other probe in the file, which is a fact about
 * the first probe rather than about the contract.
 *
 * The legs an operation's sensitivity witness declares are the same for every
 * probe, so a live port that memoizes on the request pays for them once.
 */
async function preflightSuite(suite, { port, runId, signal, sink }) {
  const { runPreflight } = await loadEvalQuality();
  return runPreflight({ contract: suite.contract, probes: suite.probes, runId, port, signal, sink });
}

/**
 * One probe scored against its contract.
 *
 * Returns the ladder result and the evidence artifact whenever there is one. An
 * Invalid run mints no artifact, which `runScore` states as `artifact: null`,
 * and the reason is in the basis.
 */
async function scoreProbe(suite, probe, { preflightVerdict, runId, modelSnapshot, signal, corpusDigest }) {
  const { runScore, digestArtifact } = await loadEvalQuality();
  const inputs = suite.evidence.recordInputs(probe);
  const contractDigest = digestArtifact(suite.contract);

  const configuration = evaluatorConfiguration({
    evaluatorIdentity: `tea-${suite.id}`,
    modelSnapshot,
    sealedBriefDigest: contractDigest,
    systemPromptDigest: digest([suite.contract.contractId, probe.probeId]),
    permissionInventory: [],
    budgets: REPLAY_BUDGETS,
  });
  const evaluatorConfigurationDigest = digestArtifact(configuration);
  const manifest = isolationManifest({
    runId,
    contractId: suite.contract.contractId,
    conditionArm: inputs.conditionArm,
    modelSnapshot,
    systemPromptDigest: configuration.systemPromptDigest,
    contractDigest,
    evaluatorConfigurationDigest,
    workspaceIdentity: `tea-${suite.id}-${probe.probeId}`,
    resourceCeilings: REPLAY_CEILINGS,
    actualResourceUse: REPLAY_USE,
    forbiddenInputNote: FORBIDDEN_INPUT_NOTE,
  });
  const record = sealedRunRecord({
    runId,
    conditionArm: inputs.conditionArm,
    contractDigest,
    sealedBriefDigest: contractDigest,
    evaluatorConfigurationDigest,
    evaluatorRecommendation: inputs.evaluatorRecommendation,
    oracleDispositions: inputs.oracleDispositions,
    findings: inputs.findings,
    observations: inputs.observations,
    actionsArtifact: { storage: 'public', path: `test/replay/${suite.id}`, privateRef: null, digest: contractDigest },
    isolationManifestArtifact: { storage: 'public', path: `test/replay/${suite.id}`, privateRef: null, digest: digestArtifact(manifest) },
    resourceUse: REPLAY_USE,
  });

  const schemaProblems = [
    ...validateArtifact('sealed-run-record', record).map((message) => `SealedRunRecord${message}`),
    ...validateArtifact('isolation-manifest', manifest).map((message) => `IsolationManifest${message}`),
    ...validateArtifact('evaluator-configuration', configuration).map((message) => `EvaluatorConfiguration${message}`),
  ];

  const result = await runScore({
    record,
    manifest,
    configuration,
    contract: suite.contract,
    probe,
    preflightVerdict,
    policy: scoringPolicy(),
    privateManifest: null,
    corpusDigest,
    signal,
  });

  if (result.artifact !== null) {
    schemaProblems.push(...validateArtifact('evidence-artifact', result.artifact).map((message) => `EvidenceArtifact${message}`));
  }

  return { probe, record, manifest, configuration, result, schemaProblems };
}

/** The digest that pins which corpus a score was computed over. */
function corpusDigestOf(suite) {
  return digest([suite.contract.contractId, JSON.stringify(suite.probes)]);
}

/**
 * The contract-strength vector over one suite, assembled from the per-probe
 * artifacts.
 *
 * `runScore` seals one probe per call, so each artifact carries a vector over
 * that probe alone. AD-7's rate is over unique qualified probe identifiers per
 * class, and summing the per-probe counts is that same rate: canary probes and
 * clean controls contribute a `null` class on their own artifact and are excluded
 * here for the same reason.
 */
function strengthVector(scored) {
  const classes = ['defect', 'gameability', 'zero-action'];
  const vector = {};
  for (const probeClass of classes) {
    const relevant = scored.filter(({ probe }) => probe.probeClass === probeClass && !probe.expectedClean);
    if (relevant.length === 0) {
      vector[probeClass] = null;
      continue;
    }
    let exercised = 0;
    let caught = 0;
    for (const entry of relevant) {
      const own = entry.result.artifact?.strength?.vector?.[probeClass];
      if (!own) continue;
      exercised += own.exercised;
      caught += own.caught;
    }
    vector[probeClass] = { exercised, caught, rate: exercised === 0 ? null : caught / exercised };
  }
  return vector;
}

/** The sealed evaluator brief for one contract: the contract minus everything that gives the answer away. */
async function sealContract(contract) {
  const { seal } = await loadEvalQuality();
  const brief = seal(contract);
  return { brief, schemaProblems: validateArtifact('sealed-evaluator-brief', brief) };
}

/**
 * One suite, end to end: pre-flight, then every probe scored, then the brief.
 *
 * `port` decides whether this is the deterministic half or the live one. Nothing
 * else differs.
 */
async function runSuite(suite, { port, runId, modelSnapshot, signal, sink }) {
  const corpusDigest = corpusDigestOf(suite);
  const scored = [];
  for (const probe of suite.probes) {
    const preflightVerdict = await preflightSuite(
      { ...suite, probes: [probe] },
      { port, runId: `${runId}-${probe.probeId}`, signal, sink },
    );
    const preflightProblems = validateArtifact('preflight-verdict', preflightVerdict);
    const entry = await scoreProbe(suite, probe, { preflightVerdict, runId, modelSnapshot, signal, corpusDigest });
    scored.push({ ...entry, preflight: preflightVerdict, preflightProblems });
  }
  const sealed = await sealContract(suite.contract);

  return { suite, scored, strength: strengthVector(scored), sealed };
}

module.exports = {
  corpusDigestOf,
  preflightSuite,
  runSuite,
  scoreProbe,
  sealContract,
  storedProbePort,
  strengthVector,
  suites,
};
