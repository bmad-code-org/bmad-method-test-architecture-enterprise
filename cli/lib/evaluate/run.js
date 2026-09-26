/**
 * `tea-evaluate run`: every arm a probe needs, as sealed trial sets (AD-7).
 *
 * A run is the preflight pipeline (`preflight.js`: check, the pristine
 * workspace, `compile` and `seal`, each seeded probe qualified through its
 * controlled mutation, the legs, and the eval-quality CLI's verdict), carried
 * on while every workspace is still live:
 *
 *   1. each clean control qualified: one clean arm in a workspace of its own,
 *      whose oracles for the control's behavior must hold (exit 11 otherwise),
 *      its evidence under `qualification/<probeId>/`, and the control
 *      materialized as eval-quality's `clean-control` probe; and each
 *      gameability probe qualified with no target launched (`gameability.js`:
 *      its committed degenerate response satisfies its naive oracle and
 *      violates the disciplined one, exit 11 otherwise) and materialized as
 *      eval-quality's `gameability` probe;
 *   2. every arm a probe needs, `evaluation.json`'s `trials` times: the clean
 *      arm (`conditionArm: clean`) for the clean controls, one mutated arm per
 *      mutation (`mutated:<mutationId>`) for the probes it seeds, one
 *      historical arm per pre-fix revision (`historical:<preFixSha>`) for the
 *      historical probes the preflight qualified, and one gameability arm per
 *      gameability probe (`gameability:<probeId>`); each trial runs the
 *      interaction plan once, in a workspace of its own that reproduces the
 *      pristine one (with the mutation applied and its digest held to the one
 *      the qualification measured) or the pre-fix one, or, on a gameability
 *      arm, answered from the degenerate response with nothing launched, and
 *      is judged by the evaluation layer `evaluation.json` declares
 *      (`evaluators.js`, AD-21): by default the deterministic evaluator
 *      (`judgeTrial`) and, when the contract declares a rubric, one rubric
 *      judge call (`judge.js`) whose scores every record of the trial carries
 *      as `judgeResults`; or the judgment rows a command evaluator
 *      (`command-evaluator.js`) or a sealed-brief agent acting through the
 *      bridge (`sealed-brief-agent.js`) answers, converted through
 *      `evaluator/mapping.json` (`judgment-rows.js`); a `records` run takes
 *      the adopter harness's sealed records in place of trials
 *      (`records-evaluator.js`);
 *   3. the adopter's project read again after every trial (exit 12 on any
 *      change), and the run directory held to exactly what the runtime wrote
 *      (`run-directory.js`: exit 12 on an entry it did not write or a file
 *      whose bytes differ from the ones it wrote);
 *   4. one trial set per probe under `trial-sets/<probeId>/`: a Sealed Run
 *      Record per trial (`trialIndex` 1..N, one `runId` for the set, `mode:
 *      contract-scoring`), and one isolation manifest from the workspaces and
 *      tools the trials were granted and the tool calls they made; one
 *      evaluator configuration for the run, carrying the seal's
 *      `sealedBriefDigest`; each validated against the schema eval-quality
 *      publishes before it is written;
 *   5. `trial-sets.json`, the index `tea-evaluate score` reads; then the
 *      adopter's project read once more and the run directory verified again;
 *      and only then, as the run's last write, `run.json` completed with the
 *      digests of every file `score` reads, the runner and model identity, the
 *      trial count and the duration, so no `run.json` says completed before
 *      nothing the run wrote was found touched.
 *
 * A trial step that exits one of its registry entry's
 * `infrastructureExitCodes`, or that a signal from outside stops, is a target
 * that could not run: the trial yields no record and the run stops with exit
 * 12, as does any trial that cannot run and any trial whose rubric judge or
 * evaluator cannot answer inside its contract. A stopped run holds no `trial-sets.json`, so there is nothing
 * to score. A historical probe the preflight refused runs on no arm and is
 * named in `run.json`'s `refused`.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { admissionRefusal, armVerdict, referenceTo } = require('./admission');
const { callLabel, causeNote, faultRecord, hostEnvironmentPort, persistableRequest, reasonNote, runArm } = require('./arm');
const { runCommandEvaluator } = require('./command-evaluator');
const { corpusDigestOf } = require('./corpus-index');
const { expectedSchemaVersion, loadEngine } = require('./engine');
const { evaluateOracles, judgeTrial, oraclesOfBehaviors } = require('./evaluator');
const {
  EvaluatorLayerError,
  IDENTITIES,
  configurationFields,
  convertsRows,
  evaluatorLayerChange,
  readEvaluatorLayer,
  recordedEvaluatorModel,
} = require('./evaluators');
const { degenerateArm } = require('./gameability');
const { JudgeError, answerNonce, judgeConfigurationFor, judgeRubrics, recordedJudgeModel } = require('./judge');
const { EvaluatorError, judgmentFromRows, setRecommendationOf, trialRecommendation } = require('./judgment-rows');
const { QualificationError, applyReplaceExact } = require('./mutation');
const { PreflightOutcome, readJson, runPipeline } = require('./preflight');
const { importRecords } = require('./records-evaluator');
const { evaluatorConfiguration, isolationManifest, sealedRunRecord } = require('./records');
const { bridgeTools } = require('./bridge');
const { bridgeRouter, runSealedBriefAgent } = require('./sealed-brief-agent');

const POLICY_PATH = 'policy/scoring-policy.json';
const CONDITIONS_PATH = 'policy/evaluator-conditions.json';
const INDEX_PATH = 'corpus-index.json';
const PROBE_FILE = /\.probe\.json$/;
const RUNNABLE_ROUTES = ['clean-control', 'controlled-mutation', 'historical', 'gameability'];
const DENIAL_FAULT = 'forbidden-target';

/** The index `tea-evaluate score` reads; its absence says the run did not complete. */
const TRIAL_SETS_NAME = 'trial-sets.json';
/** The index's version, read from the runtime-owned schema `score` validates it against, so the two cannot disagree. */
const TRIAL_SETS_SCHEMA_VERSION = readJson(path.join(__dirname, 'schemas', 'trial-sets.schema.json')).properties.schemaVersion.const;

/** The deterministic evaluator's identity, an opaque label with no person or account in it. */
const EVALUATOR_IDENTITY = IDENTITIES.deterministic;

/**
 * What the isolation manifest records for a quantity the runtime neither
 * meters nor bounds (tokens and cost): the largest safe integer, the most the
 * published schema admits for a token ceiling and the same figure for cost,
 * so no ceiling is claimed that the runtime did not enforce.
 */
const UNBOUNDED = Number.MAX_SAFE_INTEGER;

/**
 * What the runtime does to withhold the forbidden inputs, and no more: it
 * hands the target a workspace without the evaluation folder and requests
 * that carry the plan's literals, and it does not sandbox the target's file
 * system (Story 1.31).
 */
const FORBIDDEN_INPUT_NOTE =
  "Withheld from what the runtime hands the target: each trial runs in a disposable workspace that leaves out the evaluation folder, and every request carries only the interaction plan's literal bindings. The runtime does not sandbox the target's file system, so a target that searches for the evaluation folder can reach it.";

/**
 * What `run.json` says ran for one registry entry: a command's executable and
 * target, a tool server's target, arguments and tools, or an HTTP target's
 * address, methods, server and the digest of the evaluation's HTTP port.
 */
function runnerOf(entry, registry) {
  if (entry.kind === 'mcp') {
    return { interfaceId: entry.interfaceId, kind: 'mcp', target: entry.target, targetArgs: entry.targetArgs, tools: entry.tools };
  }
  if (entry.kind === 'api') {
    return {
      interfaceId: entry.interfaceId,
      kind: 'api',
      scheme: entry.scheme,
      host: entry.host,
      ...(entry.port === undefined ? {} : { port: entry.port }),
      addresses: entry.addresses,
      methods: entry.methods,
      ...(entry.server === undefined ? {} : { server: { target: entry.server.target, targetArgs: entry.server.targetArgs } }),
      httpProbePortDigest: registry.httpPort?.digest ?? null,
    };
  }
  return { interfaceId: entry.interfaceId, executable: entry.executable, target: entry.target };
}

/** Every committed probe, sorted by file name, parsed. */
function committedProbes(folder) {
  const directory = path.join(folder, 'probes');
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((name) => PROBE_FILE.test(name))
    .sort()
    .map((name) => ({ file: `probes/${name}`, probe: readJson(path.join(directory, name)) }));
}

/** An artifact eval-quality reads, written through the run directory's writer as its canonical serialization (RFC 8785, one artifact per file). */
function writeArtifact(engine, writer, file, value, artifactPath) {
  writer.write(file, engine.serializeArtifact(value, artifactPath));
}

/**
 * The run's refusals before any workspace is made: every probe on a route this
 * release scores (exit 12, since a retry cannot pass), and a scoring policy,
 * whose `minimumTrialCount`, `catchThreshold` and `severityFloor` the scores
 * read (exit 10). A folder with no probe never gets here: `check` refuses an
 * arm no probe runs on, and `arms` declares at least one.
 */
function refusal({ folder }) {
  const probes = committedProbes(folder).filter(({ probe }) => probe !== null && typeof probe === 'object');
  const unrunnable = probes.filter(({ probe }) => !RUNNABLE_ROUTES.includes(probe.qualification?.route));
  if (unrunnable.length > 0) {
    return new PreflightOutcome({
      stage: 'launch',
      exitCode: 12,
      message: `${unrunnable.map(({ file, probe }) => `${file} (route ${probe.qualification?.route})`).join(', ')} take a route this release does not run; run scores probes on the ${RUNNABLE_ROUTES.join(' and ')} routes only, so a retry cannot pass`,
    });
  }
  const findings = [];
  if (!fs.existsSync(path.join(folder, ...POLICY_PATH.split('/')))) {
    findings.push({
      file: POLICY_PATH,
      rule: 'missing-file',
      message: `run needs ${POLICY_PATH}: its minimumTrialCount, catchThreshold and severityFloor are the thresholds every score reads`,
    });
  }
  if (findings.length === 0) return null;
  return new PreflightOutcome({ stage: 'check', exitCode: 10, message: `${findings.length} authoring defect(s)`, findings });
}

/**
 * Runs `tea-evaluate run` over one evaluation folder.
 *
 * @param {string} folder the resolved evaluation folder
 * @param {object} [options]
 * @param {boolean} [options.fromWorkingTree]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {(line: string) => void} [options.log]
 * @returns {Promise<PreflightOutcome>}
 */
function runRunCommand(folder, { fromWorkingTree = false, env = process.env, log = () => {} } = {}) {
  const started = Date.now();
  // What the scores read is taken once, before anything runs, so an edit to
  // the evaluation folder during the run cannot reach the trial sets.
  let snapshot = null;
  return runPipeline(folder, {
    command: 'run',
    fromWorkingTree,
    env,
    log,
    prepare: async (context) => {
      const refused = refusal(context);
      if (refused !== null) return refused;
      const conditionsFile = path.join(folder, ...CONDITIONS_PATH.split('/'));
      const probes = committedProbes(folder);
      let layer;
      try {
        layer = readEvaluatorLayer({
          folder,
          evaluation: context.evaluation,
          contract: readJson(path.join(folder, 'contract.json')),
          engine: await loadEngine(),
        });
      } catch (error) {
        if (!(error instanceof EvaluatorLayerError)) throw error;
        return new PreflightOutcome({ stage: 'check', exitCode: 10, message: `the evaluation layer cannot be used: ${error.message}` });
      }
      snapshot = {
        policyBytes: fs.readFileSync(path.join(folder, ...POLICY_PATH.split('/'))),
        conditions: fs.existsSync(conditionsFile) ? readJson(conditionsFile) : null,
        index: readJson(path.join(folder, INDEX_PATH)),
        probeIds: probes.map(({ probe }) => probe.probeId),
        layer,
      };
      return null;
    },
    afterVerdict: (context) => runTrialSets({ ...context, snapshot, started }),
  });
}

/** One arm of the clean controls' qualification: the evidence, or a stop with the exit its failure maps to. */
async function qualificationArm({ contract, registry, workspace, stop, writer, directory, log, signal }) {
  const { port } = await registry.createProbePort({ cwd: workspace.root, projectRoot: workspace.root });
  try {
    return await runArm({ contract, port: hostEnvironmentPort({ port, registry }), registry, label: 'baseline', signal });
  } catch (error) {
    writer.writeJson(`${directory}/fault.json`, {
      phase: 'baseline-pass',
      workspace: workspace.label,
      ...faultRecord(error),
      steps: error?.steps ?? [],
    });
    log(`the clean controls' baseline arm could not run: ${error?.message ?? error}`);
    throw stop({
      stage: 'qualification',
      exitCode: error?.code === DENIAL_FAULT ? 10 : 12,
      message: `the clean controls' baseline arm ${error?.code === DENIAL_FAULT ? `was denied by the registry${reasonNote(error)}` : 'could not run'}: ${error?.message ?? error}${causeNote(error)}`,
    });
  }
}

/**
 * Qualifies every clean control through one clean arm in a workspace of its
 * own, and materializes each as eval-quality's `clean-control` probe.
 */
async function qualifyCleanControls({
  folder,
  evaluation,
  contract,
  registry,
  pristine,
  make,
  discard,
  policy,
  engine,
  validate,
  digests,
  writer,
  stop,
  log,
  signal,
}) {
  const controls = committedProbes(folder).filter(({ probe }) => probe.qualification.route === 'clean-control');
  if (controls.length === 0) return [];
  const workspace = make('qualify-clean', pristine);
  let arm;
  try {
    arm = await qualificationArm({
      contract,
      registry,
      workspace,
      stop,
      writer,
      directory: 'qualification/clean',
      log,
      signal,
    });
  } finally {
    discard(workspace);
  }
  const materialized = [];
  for (const { file, probe } of controls) {
    const oracles = await evaluateOracles({
      contract,
      stepObservations: arm.stepObservations,
      oracleIds: oraclesOfBehaviors(contract, [probe.behaviorId]),
      regexMatchStepBudget: policy.regexMatchStepBudget,
    });
    const verdict = armVerdict(oracles);
    const evidenceFile = `qualification/${probe.probeId}/baseline-pass.json`;
    writer.writeJson(evidenceFile, {
      probeId: probe.probeId,
      phase: 'baseline-pass',
      workspace: workspace.label,
      verdict,
      oracles,
      steps: arm.steps,
    });
    if (oracles.length === 0 || verdict !== 'held') {
      throw stop({
        stage: 'qualification',
        exitCode: oracles.length === 0 ? 10 : 11,
        message:
          oracles.length === 0
            ? `${file}: behavior ${probe.behaviorId} declares no oracle, so the clean control has nothing to pass`
            : `${file}: the clean control's baseline does not pass (its oracles are ${verdict}), so it cannot qualify; the evidence is in ${path.relative(folder, writer.pathOf(evidenceFile))}`,
      });
    }
    const candidate = {
      schemaVersion: expectedSchemaVersion('probe'),
      parentDigest: null,
      revisionCount: 0,
      probeId: probe.probeId,
      probeClass: probe.probeClass,
      behaviorId: probe.behaviorId,
      systemId: evaluation.evaluationId,
      implementationDigest: digests.implementationDigest,
      // A clean control seeds nothing, so the artifact under test is the implementation as a whole.
      artifactDigest: digests.implementationDigest,
      commitDigest: digests.commitDigest,
      rationale: probe.rationale,
      qualification: {
        route: 'clean-control',
        baselinePassEvidence: referenceTo(folder, writer, evidenceFile, engine.digestBytes),
        revisionCommitDigest: digests.commitDigest,
        noKnownDefectStatement: probe.qualification.noKnownDefectStatement,
      },
      expectedClean: true,
      defects: [],
    };
    const refused = await admissionRefusal({ candidate, contract, engine, validate });
    if (refused !== null) throw stop({ stage: 'qualification', exitCode: 10, message: `${file}: ${refused}` });
    log(`${file}: qualified; its baseline passed`);
    materialized.push(candidate);
  }
  return materialized;
}

/**
 * One trial of one arm: on a mutated or historical arm, in a workspace of its
 * own reproducing the pristine or the pre-fix one (the mutated arm's mutation
 * applied and held to the digest the qualification measured), the plan run
 * once; on a gameability arm, the plan answered from the degenerate response
 * with nothing launched. The plan's observations are `evaluator-chosen`,
 * since the plan is the evaluation's own exercise of the target, except under
 * a sealed-brief agent, whose own calls are the evaluation's and the plan a
 * harness baseline it never sees (`baseline`). Every probe on the arm is
 * judged, and so is every rubric. Its evidence goes to
 * `trials/<arm>/trial-<n>.json`.
 */
async function runTrial(context) {
  const { arm, trialIndex, contract, registry, pristine, make, discard, engine, writer, stop, signal, snapshot } = context;
  const label = `trial-${arm.slug}-${trialIndex}`;
  const evidenceFile = `trials/${arm.slug}/trial-${trialIndex}.json`;
  const provenance = snapshot.layer.evaluator.kind === 'sealed-brief-agent' ? 'baseline' : 'evaluator-chosen';
  if (arm.degenerate !== undefined) {
    const began = Date.now();
    let executed;
    try {
      executed = await degenerateArm({
        contract,
        registry,
        steps: arm.degenerate.steps,
        label: `trial-${trialIndex}`,
        provenance,
        signal,
      });
    } catch (error) {
      writer.writeJson(evidenceFile, {
        conditionArm: arm.conditionArm,
        trialIndex,
        workspace: null,
        degenerateResponse: arm.degenerate.response,
        fault: { message: String(error?.message ?? error) },
        steps: error?.steps ?? [],
      });
      throw stop({ stage: 'trial', exitCode: 12, message: `${label} yields no record: ${error?.message ?? error}` });
    }
    // Nothing launched: no workspace was granted and no command ran.
    return concludeTrial(context, {
      label,
      evidenceFile,
      executed,
      began,
      evidence: { workspace: null, degenerateResponse: arm.degenerate.response },
      port: null,
      mounts: [],
      toolCalls: [],
    });
  }
  const workspace = make(label, arm.basis ?? pristine);
  try {
    if (arm.mutation !== null) {
      let applied;
      try {
        applied = applyReplaceExact(workspace.root, arm.mutation, { within: workspace.directory });
      } catch (error) {
        if (!(error instanceof QualificationError)) throw error;
        throw stop({ stage: 'trial', exitCode: error.exitCode, message: `${label}: ${error.message}` });
      }
      const digest = engine.digestBytes(fs.readFileSync(applied.file));
      if (digest !== arm.mutatedDigest) {
        throw stop({
          stage: 'trial',
          exitCode: 12,
          message: `${label}: the mutated workspace digests to ${digest}, not the ${arm.mutatedDigest} the qualification measured`,
        });
      }
    }
    const problems = registry.targetProblems(workspace.root);
    if (problems.length > 0)
      throw stop({ stage: 'trial', exitCode: 12, message: `${label}: the registry cannot launch: ${problems.join('; ')}` });
    const { port: adapter } = await registry.createProbePort({ cwd: workspace.root, projectRoot: workspace.root });
    const port = hostEnvironmentPort({ port: adapter, registry });
    const began = Date.now();
    let executed;
    try {
      executed = await runArm({ contract, port, registry, label: `trial-${trialIndex}`, provenance, signal });
    } catch (error) {
      writer.writeJson(evidenceFile, {
        conditionArm: arm.conditionArm,
        trialIndex,
        workspace: label,
        fault: {
          ...faultRecord(error),
          request: error?.request === undefined ? null : persistableRequest(error.request),
        },
        steps: error?.steps ?? [],
      });
      const denied = error?.code === DENIAL_FAULT;
      throw stop({
        stage: 'trial',
        exitCode: denied ? 10 : 12,
        message: `${label} ${denied ? `was denied by the registry${reasonNote(error)}` : 'yields no record'}: ${error?.message ?? error}${causeNote(error)}`,
      });
    }
    return await concludeTrial(context, {
      label,
      evidenceFile,
      executed,
      began,
      evidence: { workspace: label },
      port,
      mounts: [
        `${workspace.kind} ${label}`,
        ...workspace.provisioned.map((entry) => `read-only ${label}/${path.relative(workspace.root, entry).split(path.sep).join('/')}`),
      ],
      // The commands and tool calls the runtime made for the plan, each an observed call; what the target itself opened or
      // reached is not observed.
      toolCalls: executed.steps.map((step) => callLabel(step.request)),
    });
  } finally {
    discard(workspace);
  }
}

/**
 * A trial's judgment once its plan ran, by the evaluator kind the run reads:
 * the deterministic evaluator over every probe on the arm and, when the
 * contract declares a rubric, one rubric judge call (`judgeRubrics` makes no
 * call otherwise); or the judgment rows a command evaluator or a sealed-brief
 * agent answers, converted per probe through the mapping. The trial's
 * evidence is written either way. A judge or an evaluator that cannot answer
 * inside its contract stops the run with exit 12 and no record, what it
 * printed kept under `evaluator/` (or in the trial's evidence, for the
 * judge).
 */
async function concludeTrial(context, facts) {
  if (convertsRows(context.snapshot.layer.evaluator.kind)) return concludeWithRows(context, facts);
  const { arm, trialIndex, contract, evaluation, policy, writer, stop } = context;
  const { label, evidenceFile, executed, began, evidence, mounts, toolCalls } = facts;
  const elapsedMs = Date.now() - began;
  const judgments = {};
  for (const probe of arm.probes) {
    judgments[probe.probeId] = await judgeTrial({
      contract,
      stepObservations: executed.stepObservations,
      probeId: probe.probeId,
      behaviorIds: [probe.behaviorId, ...probe.defects.map((defect) => defect.behaviorId)],
      regexMatchStepBudget: policy.regexMatchStepBudget,
    });
  }
  const [anyJudgment] = Object.values(judgments);
  const written = {
    conditionArm: arm.conditionArm,
    trialIndex,
    ...evidence,
    elapsedMs,
    oracles: anyJudgment.oracles,
    steps: executed.steps,
  };
  let judged;
  try {
    judged = await judgeRubrics({
      contract,
      stepObservations: executed.stepObservations,
      judge: evaluation.judge,
      scratch: context.scratch,
    });
  } catch (error) {
    if (!(error instanceof JudgeError)) throw error;
    writer.writeJson(evidenceFile, { ...written, judge: { fault: error.message, stdout: error.stdout, stderr: error.stderr } });
    throw stop({ stage: 'trial', exitCode: 12, message: `${label} yields no record: ${error.message}` });
  }
  // A trial no judge scored keeps the evidence shape of a run with no rubric.
  writer.writeJson(
    evidenceFile,
    judged.called
      ? { ...written, judge: { nonce: judged.nonce, results: judged.results, stdout: judged.stdout, stderr: judged.stderr } }
      : written,
  );
  return {
    trialIndex,
    evidenceFile,
    observations: Object.values(executed.stepObservations).sort((a, b) => a.sequence - b.sequence),
    judgments,
    judgeResults: judged.results,
    judgeCalled: judged.called,
    elapsedMs,
    mounts,
    toolCalls,
  };
}

/**
 * A trial judged by a command evaluator or a sealed-brief agent: its answer
 * read against the import contract and converted per probe
 * (`judgmentFromRows`), what it printed written under
 * `evaluator/<arm>/trial-<n>.{stdout,stderr,json}`, and, for a sealed-brief
 * agent, the calls it made through the bridge kept in the trial's evidence.
 */
async function concludeWithRows(context, facts) {
  const { arm, trialIndex, contract, folder, writer, stop, signal, snapshot, sealedBrief, scratch, env } = context;
  const { label, evidenceFile, executed, began, evidence, port, mounts, toolCalls } = facts;
  const { evaluator, mapping, validate } = snapshot.layer;
  // The evaluator runs from the evaluation folder, so the run holds the layer's files to the bytes it digested
  // before each launch and after each trial; the window between this read and the launch is Story 1.31's.
  const holdLayer = (when) => {
    const change = evaluatorLayerChange(folder, snapshot.layer.files);
    if (change !== null) throw new EvaluatorError(`the evaluation layer changed ${when}: ${change}`);
  };
  const baseline = Object.values(executed.stepObservations).sort((a, b) => a.sequence - b.sequence);
  const streams = `evaluator/${arm.slug}/trial-${trialIndex}`;
  const written = { conditionArm: arm.conditionArm, trialIndex, ...evidence, steps: executed.steps };
  let router = null;
  let evaluated;
  const judgments = {};
  let judgeResults = [];
  try {
    holdLayer("before the evaluator's launch");
    if (evaluator.kind === 'command') {
      evaluated = await runCommandEvaluator({
        folder,
        evaluator,
        sealedBrief,
        observations: baseline,
        mapping,
        validate,
        scratch,
        env,
      });
    } else {
      // Drawn after the plan ran and before the router exists, so neither a plan step's output nor any call can carry it.
      const nonce = answerNonce();
      router = bridgeRouter({
        contract,
        registry: context.registry,
        port,
        degenerate: arm.degenerate?.steps ?? null,
        label: `trial-${trialIndex}`,
        taken: new Set(baseline.map((observation) => observation.observationId)),
        firstSequence: baseline.length + 1,
        budget: contract.budgets?.maxToolCalls ?? 0,
        nonce,
        signal,
      });
      evaluated = await runSealedBriefAgent({ evaluator, sealedBrief, contract, mapping, validate, router, nonce, scratch, env });
    }
    holdLayer('while the evaluator ran');
    // The conversion refuses a row on a key of the other kind and a score off its levels, as the schema refuses a bad shape.
    for (const probe of arm.probes) {
      const judgment = judgmentFromRows({
        contract,
        mapping,
        answer: evaluated.answer,
        probeId: probe.probeId,
        behaviorIds: [probe.behaviorId, ...probe.defects.map((defect) => defect.behaviorId)],
      });
      judgments[probe.probeId] = judgment;
      ({ judgeResults } = judgment);
    }
  } catch (error) {
    if (!(error instanceof EvaluatorError)) throw error;
    // An answer the conversion refused was read in full, so what the evaluator printed is the answer's own.
    const printed = evaluated ?? error;
    writer.write(`${streams}.stdout`, printed.stdoutBytes);
    writer.write(`${streams}.stderr`, printed.stderrBytes);
    writer.writeJson(`${streams}.json`, {
      conditionArm: arm.conditionArm,
      trialIndex,
      kind: evaluator.kind,
      fault: error.message,
      outcome: error.outcome ?? evaluated?.outcome ?? null,
      prompt: error.prompt ?? evaluated?.prompt ?? null,
      nonce: error.nonce ?? evaluated?.nonce ?? null,
      calls: router?.calls ?? null,
    });
    writer.writeJson(evidenceFile, {
      ...written,
      elapsedMs: Date.now() - began,
      evaluator: { kind: evaluator.kind, fault: error.message, streams },
    });
    throw stop({ stage: 'trial', exitCode: 12, message: `${label} yields no record: ${error.message}` });
  }
  const elapsedMs = Date.now() - began;
  // What the evaluator printed is kept as the bytes it wrote; its answer was read from their UTF-8 text.
  writer.write(`${streams}.stdout`, evaluated.stdoutBytes);
  writer.write(`${streams}.stderr`, evaluated.stderrBytes);
  writer.writeJson(`${streams}.json`, {
    conditionArm: arm.conditionArm,
    trialIndex,
    kind: evaluator.kind,
    outcome: evaluated.outcome ?? null,
    prompt: evaluated.prompt ?? null,
    nonce: evaluated.nonce ?? null,
    calls: router?.calls ?? null,
  });
  const observations = [...baseline, ...(router?.observations ?? [])];
  writer.writeJson(evidenceFile, {
    ...written,
    elapsedMs,
    evaluator: { kind: evaluator.kind, answer: evaluated.answer, streams, calls: router?.calls ?? null },
  });
  // The bridge's calls that launched a command or a tool server are observed tool calls as the plan's are; a gameability arm
  // launches none.
  const bridged = (port === null ? [] : (router?.calls ?? []))
    .filter((call) => call.observation !== undefined)
    .map((call) => callLabel(call.request));
  return {
    trialIndex,
    evidenceFile,
    observations,
    judgments,
    judgeResults,
    judgeCalled: false,
    recommendations: Object.fromEntries(
      Object.entries(judgments).map(([probeId, judgment]) => [probeId, trialRecommendation(evaluated.answer, judgment)]),
    ),
    // Every call the trial made: the plan's steps and each call of the agent's the budget admitted.
    callCount: executed.steps.length + (router?.counted() ?? 0),
    elapsedMs,
    mounts,
    toolCalls: [...toolCalls, ...bridged],
  };
}

/**
 * What the evaluator recommends for one probe's whole trial set, which
 * eval-quality holds equal across the set: FAIL when any trial filed a finding
 * against the probe, CONCERNS when one left an oracle of the probe's behaviors
 * unsettled, PASS otherwise.
 *
 * @param {Array<{ findings: object[], oracleDispositions: object[], discharged: string[] }>} judgments the probe's judgment in each trial
 * @returns {'PASS'|'CONCERNS'|'FAIL'}
 */
function setRecommendation(judgments) {
  if (judgments.some((judgment) => judgment.findings.length > 0)) return 'FAIL';
  const unsettled = judgments.some((judgment) =>
    judgment.oracleDispositions.some((entry) => entry.disposition === 'not-attempted' && judgment.discharged.includes(entry.oracleId)),
  );
  return unsettled ? 'CONCERNS' : 'PASS';
}

/** The trial sets, the evaluator configuration and the index, after the preflight verdict passed. */
async function runTrialSets(given) {
  // The trials judge with the scoring policy the run copies, read before anything ran.
  const context = { ...given, policy: JSON.parse(given.snapshot.policyBytes.toString('utf8')) };
  const {
    folder,
    evaluation,
    contract,
    registry,
    qualified,
    routesByMutation,
    routesByRevision,
    engine,
    validate,
    invocationId,
    writer,
    run,
    sealed,
  } = context;
  const { treeUnchanged, stop, log, snapshot } = context;

  const cleanControls = await qualifyCleanControls(context);
  // The gameability probes the shared pipeline qualified before the verdict.
  const { gameability } = context;
  treeUnchanged('qualification');

  const arms = [];
  if (cleanControls.length > 0)
    arms.push({ conditionArm: 'clean', slug: 'clean', mutation: null, mutatedDigest: null, probes: cleanControls });
  for (const mutationId of [...routesByMutation.keys()].sort()) {
    const seededOn = qualified.filter((entry) => entry.mutation?.mutationId === mutationId);
    arms.push({
      conditionArm: `mutated:${mutationId}`,
      slug: `mutated-${mutationId}`,
      mutation: seededOn[0].mutation,
      mutatedDigest: seededOn[0].mutatedDigest,
      probes: seededOn.map((entry) => entry.probe),
    });
  }
  // A historical arm per pre-fix revision: its trials reproduce the pre-fix worktree its witness legs ran in.
  for (const preFix of [...routesByRevision.keys()].sort()) {
    arms.push({
      conditionArm: `historical:${preFix}`,
      slug: `historical-${preFix}`,
      mutation: null,
      mutatedDigest: null,
      basis: routesByRevision.get(preFix).workspace,
      probes: qualified.filter((entry) => entry.historical?.preFix === preFix).map((entry) => entry.probe),
    });
  }
  for (const { probe, steps, response } of gameability) {
    arms.push({
      conditionArm: `gameability:${probe.probeId}`,
      slug: `gameability-${probe.probeId}`,
      mutation: null,
      mutatedDigest: null,
      degenerate: { steps, response },
      probes: [probe],
    });
  }
  const refusedIds = new Set(run.refused.map((refusal) => refusal.probeId));
  if (arms.length === 0) {
    throw stop({
      stage: 'trial',
      exitCode: 12,
      message: `every probe was refused (${run.refused.map((refusal) => `${refusal.file}: ${refusal.reason}`).join('; ')}), so the run has no arm to run and nothing to score`,
    });
  }

  // The digests of the compiled contract and the sealed brief as the stages
  // wrote them, taken before any target ran.
  const noStages = () =>
    stop({
      stage: 'trial',
      exitCode: 12,
      message: 'the engine stages wrote no compiled contract or sealed brief, so no trial set can name them',
    });
  const { kind } = snapshot.layer.evaluator;
  if (kind === 'records') {
    if (sealed === null) throw noStages();
    return concludeImportedRecords({ ...context, arms, refusedIds });
  }
  if (convertsRows(kind)) {
    // A command evaluator and a sealed-brief agent read the brief the run sealed, as its bytes were written.
    if (sealed === null) throw noStages();
    context.sealedBrief = writer.readJson('sealed-evaluator-brief.json');
  }

  const trialCount = evaluation.trials;
  for (const arm of arms) {
    arm.trials = [];
    for (let trialIndex = 1; trialIndex <= trialCount; trialIndex += 1) {
      log(`${arm.conditionArm}: trial ${trialIndex} of ${trialCount}`);
      arm.trials.push(await runTrial({ ...context, arm, trialIndex }));
      // Read after every trial, so a target that writes into the project stops the run at once.
      treeUnchanged('trials');
    }
  }
  const armed = new Set(arms.flatMap((arm) => arm.probes.map((probe) => probe.probeId)));
  // A refused probe runs on no arm by design, and run.json names it with its reason.
  const unarmed = snapshot.probeIds.filter((probeId) => !armed.has(probeId) && !refusedIds.has(probeId));
  if (unarmed.length > 0) {
    throw stop({
      stage: 'trial',
      exitCode: 12,
      message: `no arm ran for ${unarmed.join(', ')}, so the run cannot score every probe it holds`,
    });
  }
  // Every file the trial sets cite or copy (the contract, the sealed brief, the
  // preflight verdict, each trial's evidence) must hold the bytes the runtime
  // wrote, and the run directory nothing else, before any trial set is written.
  writer.verify('after the trials');

  const failures = (artifactKind, problems) => {
    if (problems.length > 0) {
      throw stop({
        stage: 'trial',
        exitCode: 12,
        message: `the runtime built a ${artifactKind} that does not meet eval-quality's published schema: ${problems.join('; ')}`,
      });
    }
  };

  if (sealed === null) throw noStages();
  const { contractDigest, sealedBriefDigest } = sealed;
  const { conditions, layer } = snapshot;
  const tools = registry.toolInventory();
  // Only the deterministic kind calls TeA's rubric judge; every other kind scores the rubric itself.
  const judgeConfiguration =
    kind === 'deterministic' ? judgeConfigurationFor({ contract, conditions, digestBytes: engine.digestBytes }) : null;
  const fields = configurationFields({ layer, conditions, judgeConfiguration, digestBytes: engine.digestBytes });
  // The tools a sealed-brief agent had: one per interface the bridge exposed.
  const bridged =
    kind === 'sealed-brief-agent' ? bridgeTools(context.sealedBrief.permittedInterfaces ?? []).map((tool) => `bridge:${tool.name}`) : [];
  const configuration = evaluatorConfiguration({
    evaluatorIdentity: fields.evaluatorIdentity,
    modelSnapshot: fields.modelSnapshot,
    sealedBriefDigest,
    systemPromptDigest: fields.systemPromptDigest,
    toolInventory: [...tools, ...bridged],
    permissionInventory: [],
    decodingParameters: fields.decodingParameters,
    budgets: contract.budgets,
    seed: null,
    judgeConfiguration: fields.judgeConfiguration,
  });
  failures('EvaluatorConfiguration', await validate('evaluator-configuration', configuration));
  const configurationDigest = engine.digestArtifact(configuration, 'EvaluatorConfiguration');
  writeArtifact(engine, writer, 'evaluator-configuration.json', configuration, 'EvaluatorConfiguration');

  const stepCeilingMs = (contract.interactionPlan ?? []).reduce((total, step) => {
    const operation = (contract.permittedInterfaces ?? [])
      .flatMap((iface) => iface.operations ?? [])
      .find((candidate) => candidate.operationId === step.operationId);
    const interfaceId = (contract.permittedInterfaces ?? []).find((iface) => (iface.operations ?? []).includes(operation))?.logicalId;
    return total + registry.ceilingMs(interfaceId, operation);
  }, 0);
  // A sealed-brief agent's own calls count against the contract's budget in each trial, beside the plan's steps.
  const callsPerTrial =
    (contract.interactionPlan ?? []).length + (kind === 'sealed-brief-agent' ? (contract.budgets?.maxToolCalls ?? 0) : 0);
  // The evaluator's wall clock counts toward a trial's ceiling beside the plan's.
  const trialCeilingMs = stepCeilingMs + (convertsRows(kind) ? layer.evaluator.timeoutMs : 0);
  // The digest of the bytes the runtime wrote to a run-directory file, which `score` holds each file to.
  const bytesDigest = (file) => engine.digestBytes(writer.read(file));

  const trialSets = [];
  const recordDigests = {};
  const manifestDigests = {};
  for (const arm of arms) {
    for (const probe of arm.probes) {
      const recommendation = convertsRows(kind)
        ? setRecommendationOf(arm.trials.map((trial) => trial.recommendations[probe.probeId]))
        : setRecommendation(arm.trials.map((trial) => trial.judgments[probe.probeId]));
      const directory = `trial-sets/${probe.probeId}`;
      const runId = `${invocationId}-${probe.probeId}`;
      const manifest = isolationManifest({
        runId,
        contractId: contract.contractId,
        conditionArm: arm.conditionArm,
        modelSnapshot: configuration.modelSnapshot,
        systemPromptDigest: configuration.systemPromptDigest,
        contractDigest,
        evaluatorConfigurationDigest: configurationDigest,
        workspaceIdentity: `${evaluation.evaluationId} ${arm.conditionArm}`,
        allowedMounts: arm.trials.flatMap((trial) => trial.mounts),
        // The runtime observes no file-system access, so it records no observed mount (records.js).
        observedMounts: [],
        toolAllowlist: tools,
        observedToolCalls: [...new Set(arm.trials.flatMap((trial) => trial.toolCalls))].sort(),
        resourceCeilings: {
          maxToolCalls: Math.max(1, callsPerTrial * trialCount),
          maxInputTokens: UNBOUNDED,
          maxOutputTokens: UNBOUNDED,
          maxWallClockMinutes: Math.max(trialCeilingMs * trialCount, 1) / 60_000,
          maxCostUsd: String(UNBOUNDED),
        },
        actualResourceUse: {
          toolCalls: arm.trials.reduce((total, trial) => total + (trial.callCount ?? trial.toolCalls.length), 0),
          inputTokens: 0,
          outputTokens: 0,
          wallClockSeconds: arm.trials.reduce((total, trial) => total + trial.elapsedMs, 0) / 1000,
          costUsd: '0',
        },
        forbiddenInputNote: FORBIDDEN_INPUT_NOTE,
      });
      failures('IsolationManifest', await validate('isolation-manifest', manifest));
      const manifestFile = `${directory}/isolation-manifest.json`;
      writeArtifact(engine, writer, manifestFile, manifest, 'IsolationManifest');
      manifestDigests[probe.probeId] = bytesDigest(manifestFile);
      const records = [];
      for (const trial of arm.trials) {
        const judgment = trial.judgments[probe.probeId];
        const record = sealedRunRecord({
          runId,
          conditionArm: arm.conditionArm,
          trialIndex: trial.trialIndex,
          contractDigest,
          sealedBriefDigest,
          evaluatorConfigurationDigest: configurationDigest,
          evaluatorRecommendation: recommendation,
          oracleDispositions: judgment.oracleDispositions,
          findings: judgment.findings,
          observations: trial.observations,
          judgeResults: trial.judgeResults,
          actionsArtifact: referenceTo(folder, writer, trial.evidenceFile, engine.digestBytes),
          isolationManifestArtifact: referenceTo(folder, writer, manifestFile, engine.digestBytes),
          resourceUse: {
            toolCalls: trial.callCount ?? trial.toolCalls.length,
            inputTokens: 0,
            outputTokens: 0,
            wallClockSeconds: trial.elapsedMs / 1000,
            costUsd: '0',
          },
        });
        failures('SealedRunRecord', await validate('sealed-run-record', record));
        const recordFile = `${directory}/record-${trial.trialIndex}.json`;
        writeArtifact(engine, writer, recordFile, record, 'SealedRunRecord');
        recordDigests[recordFile] = bytesDigest(recordFile);
        records.push(recordFile);
      }
      trialSets.push({
        probeId: probe.probeId,
        runId,
        conditionArm: arm.conditionArm,
        probe: writeQualifiedProbe({ writer, stop }, probe),
        records,
        isolationManifest: manifestFile,
      });
    }
  }

  return completeRun(context, {
    arms,
    trialSets,
    recordDigests,
    manifestDigests,
    configurationDigest,
    trialCount,
    evaluatorRecord: {
      kind,
      identity: configuration.evaluatorIdentity,
      ...(kind === 'command' ? { command: layer.evaluator.command } : {}),
      ...(kind === 'sealed-brief-agent' ? { agent: layer.evaluator.agent, model: recordedEvaluatorModel(layer.evaluator) } : {}),
    },
    model: { modelSnapshot: configuration.modelSnapshot, systemPromptDigest: configuration.systemPromptDigest },
    judge:
      judgeConfiguration === null
        ? null
        : {
            agent: evaluation.judge.agent,
            // The model the adapter runs: the judge's own, or the adapter's pinned default.
            model: recordedJudgeModel(evaluation.judge),
            ...judgeConfiguration,
            calls: arms.reduce((total, arm) => total + arm.trials.filter((trial) => trial.judgeCalled).length, 0),
          },
  });
}

/** A probe the run qualified, written as the trial set's probe file; a seeded probe's file is the preflight's own, which it must equal. */
function writeQualifiedProbe({ writer, stop }, probe) {
  const probeFile = `probes/${probe.probeId}.probe.json`;
  const probeBytes = Buffer.from(`${JSON.stringify(probe, null, 2)}\n`);
  if (!writer.has(probeFile)) writer.write(probeFile, probeBytes);
  else if (!writer.read(probeFile).equals(probeBytes)) {
    throw stop({ stage: 'trial', exitCode: 12, message: `${probeFile} is not the probe the run qualified` });
  }
  return probeFile;
}

/**
 * A `records` run's trial sets: every probe the run qualified takes the
 * records the adopter's harness sealed for it (`records-evaluator.js`),
 * copied unchanged, beside the harness's own evaluator configuration.
 */
async function concludeImportedRecords(context) {
  const { folder, arms, refusedIds, snapshot, sealed, validate, writer, engine, stop } = context;
  const probes = arms.flatMap((arm) => arm.probes);
  const unarmed = snapshot.probeIds.filter((probeId) => !probes.some((probe) => probe.probeId === probeId) && !refusedIds.has(probeId));
  if (unarmed.length > 0) {
    throw stop({
      stage: 'trial',
      exitCode: 12,
      message: `no arm holds ${unarmed.join(', ')}, so the run cannot score every probe it holds`,
    });
  }
  let imported;
  try {
    imported = await importRecords({
      folder,
      evaluator: snapshot.layer.evaluator,
      probes: arms.flatMap((arm) => arm.probes.map((probe) => ({ probeId: probe.probeId, conditionArm: arm.conditionArm }))),
      sealedBriefDigest: sealed.sealedBriefDigest,
      validate,
      writer,
    });
  } catch (error) {
    if (!(error instanceof EvaluatorLayerError)) throw error;
    throw stop({ stage: 'trial', exitCode: 10, message: `the records evaluator's records cannot be scored: ${error.message}` });
  }
  const bytesDigest = (file) => engine.digestBytes(writer.read(file));
  const recordDigests = {};
  const manifestDigests = {};
  const trialSets = imported.sets.map((set) => {
    for (const record of set.records) recordDigests[record] = bytesDigest(record);
    if (set.manifest !== null) manifestDigests[set.probeId] = bytesDigest(set.manifest);
    return {
      probeId: set.probeId,
      runId: set.runId,
      conditionArm: set.conditionArm,
      probe: writeQualifiedProbe(
        context,
        probes.find((probe) => probe.probeId === set.probeId),
      ),
      records: set.records,
      // An absent manifest reaches eval-quality as absent, which it reads as Invalid.
      isolationManifest: set.manifest ?? `trial-sets/${set.probeId}/isolation-manifest.json`,
    };
  });
  writer.verify('after the records were imported');
  return completeRun(context, {
    arms,
    trialSets,
    recordDigests,
    manifestDigests,
    configurationDigest: engine.digestArtifact(imported.configuration, 'EvaluatorConfiguration'),
    trialCount: null,
    evaluatorRecord: { kind: 'records', identity: imported.configuration.evaluatorIdentity, records: snapshot.layer.evaluator.records },
    model: { modelSnapshot: imported.configuration.modelSnapshot, systemPromptDigest: imported.configuration.systemPromptDigest },
    judge: null,
  });
}

/**
 * The run's last writes, once its trial sets are in the run directory: the
 * scoring policy, the index `score` reads, and `run.json` completed with the
 * digests of every file `score` reads, after the project and the run
 * directory are found as they were.
 */
async function completeRun(
  context,
  { arms, trialSets, recordDigests, manifestDigests, configurationDigest, trialCount, evaluatorRecord, model, judge },
) {
  const {
    invocationId,
    writer,
    run,
    sealed,
    registry,
    engine,
    snapshot,
    writeRun,
    treeUnchanged,
    retractUnlessSealed,
    markSealed,
    outcome,
  } = context;
  const startedAt = context.started;
  writer.write('scoring-policy.json', snapshot.policyBytes);
  const corpusDigest = await corpusDigestOf(snapshot.index);
  const bytesDigest = (file) => engine.digestBytes(writer.read(file));
  // The bytes `score` reads, digested as the runtime wrote them, so it can
  // hold the run directory to what the run sealed.
  const artifacts = {
    contract: bytesDigest('eval-contract.json'),
    evaluatorConfiguration: bytesDigest('evaluator-configuration.json'),
    preflightVerdict: bytesDigest('preflight-verdict.json'),
    probes: Object.fromEntries(trialSets.map((set) => [set.probeId, bytesDigest(set.probe)])),
    records: recordDigests,
    isolationManifests: manifestDigests,
  };
  // The index first, so no run.json ever says completed without one.
  writer.writeJson(TRIAL_SETS_NAME, {
    schemaVersion: TRIAL_SETS_SCHEMA_VERSION,
    invocationId,
    corpusDigest,
    contract: 'eval-contract.json',
    policy: 'scoring-policy.json',
    preflightVerdict: 'preflight-verdict.json',
    evaluatorConfiguration: 'evaluator-configuration.json',
    trialSets,
  });
  retractUnlessSealed.push(TRIAL_SETS_NAME);
  const result = outcome({
    stage: 'trial',
    exitCode: 0,
    message:
      trialCount === null
        ? `${trialSets.length} trial set(s) taken from the records evaluator's records over ${[...new Set(trialSets.map((set) => set.conditionArm))].join(', ')}; score them with tea-evaluate score --run ${invocationId}`
        : `${trialSets.length} trial set(s) of ${trialCount} trial(s) sealed over ${arms.map((arm) => arm.conditionArm).join(', ')}; score them with tea-evaluate score --run ${invocationId}`,
  });
  // The project must be as it was, and the run directory exactly what the
  // runtime wrote, before run.json says completed; that write is the run's last.
  treeUnchanged('sealing', { record: false });
  writer.verify('after the trial sets were sealed');
  Object.assign(run, {
    artifacts,
    contractDigest: sealed.contractDigest,
    corpusDigest,
    policyDigest: engine.digestBytes(snapshot.policyBytes),
    sealedBriefDigest: sealed.sealedBriefDigest,
    evaluatorConfigurationDigest: configurationDigest,
    runner: registry.entries.map((entry) => runnerOf(entry, registry)),
    evaluator: evaluatorRecord,
    model,
    judge,
    trials: {
      perArm: trialCount,
      arms: trialCount === null ? [...new Set(trialSets.map((set) => set.conditionArm))] : arms.map((arm) => arm.conditionArm),
    },
    trialCount,
    startedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    completed: true,
    outcome: { stage: result.stage, exitCode: result.exitCode, message: result.message },
  });
  writeRun();
  markSealed();
  return result;
}

module.exports = {
  EVALUATOR_IDENTITY,
  FORBIDDEN_INPUT_NOTE,
  TRIAL_SETS_NAME,
  TRIAL_SETS_SCHEMA_VERSION,
  runRunCommand,
  // A trial's denial cannot be reached through the pipeline, whose qualification runs the same plan under the same
  // policy first, so its unit drives one trial directly.
  runTrial,
  setRecommendation,
};
