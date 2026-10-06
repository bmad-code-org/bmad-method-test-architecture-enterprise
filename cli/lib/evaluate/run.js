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
 *   1a. a command evaluator's declared frameworks observed before any evaluator launch (Story 1.44): each version
 *      probe of `evaluator/frameworks.json` runs through the evaluator's own launch path, `framework-versions.json`
 *      records the declared and observed versions, and a package that is missing or at another version exits 12
 *      with no trial; the run reads them again before each launch of the evaluator and after each trial, and a
 *      change exits 12 with no record for that trial;
 *   1b. a sealed-brief evaluator's installed agent CLI version is observed before calibration or qualification
 *      (Story 1.72), bound into the configuration and held before each launch and after each attempt or trial;
 *   1c. a sealed-brief agent evaluator qualified before any trial (Story 1.34): the agent runs
 *      `evaluatorQualification.attempts` times on the clean arm and on each mutated arm, each attempt in a
 *      workspace of its own that writes under `evaluator-qualification/` alone, its record scored by
 *      `eval-quality score`, and `evaluator-qualification.json` reports each attempt's outcome, copied from the
 *      evidence artifact, and each arm's agreement (exit 11 below `minimumAgreement`, with no trial set);
 *   2. every arm a probe needs, `evaluation.json`'s `trials` times: the clean
 *      arm (`conditionArm: clean`) for the clean controls, one mutated arm per
 *      mutation (`mutated:<mutationId>`) for the probes it seeds, one
 *      historical arm per pre-fix revision or pre-fix deployment
 *      (`historical:<preFixSha>`, `historical:<pre-fix release>`) for the
 *      historical probes the preflight qualified, and one gameability arm per
 *      gameability probe (`gameability:<probeId>`); each trial runs the
 *      interaction plan once, in a workspace of its own that reproduces the
 *      pristine one (with the mutation applied and its digest held to the one
 *      the qualification measured) or the pre-fix one (a deployment arm's
 *      HTTP calls reaching the pre-fix deployment), or, on a gameability
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
 *      tools the trials were granted, the tool calls they made and the paths
 *      the confinement's audit saw them open outside what they were granted
 *      (`confinement.js`, Story 1.31); one
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

const AjvModule = require('ajv/dist/2020');
const { AGENT_VERSION_CEILING_MS, observeAgentVersion } = require('../agent-adapters');

const { admissionRefusal, armVerdict, referenceTo } = require('./admission');
const { callLabel, causeNote, faultRecord, hostEnvironmentPort, persistableRequest, reasonNote, runArm } = require('./arm');
const { observeFrameworks, runCommandEvaluator } = require('./command-evaluator');
const { effectiveProbeTimeoutMs, observationProblems, observedVersions, versionsRecord } = require('./frameworks');
const { corpusDigestOf } = require('./corpus-index');
const { calibrationObservation, calibrationPartial, calibrationStepPair, readCalibration, runCalibration } = require('./calibration');
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
const { holdDeployment, recordRefusal } = require('./historical');
const { JudgeError, answerNonce, judgeConfigurationFor, judgeRubrics, recordedJudgeModel } = require('./judge');
const { EvaluatorError, judgmentFromRows, setRecommendationOf, trialRecommendation } = require('./judgment-rows');
const { QualificationError, applyReplaceExact } = require('./mutation');
const { committedProbes, selectPartition, unknownPartition } = require('./partition');
const { PreflightOutcome, readJson, runPipeline } = require('./preflight');
const { importRecords } = require('./records-evaluator');
const { evaluatorConfiguration, isolationManifest, sealedRunRecord } = require('./records');
const { bridgeTools } = require('./bridge');
const { bridgeRouter, runSealedBriefAgent } = require('./sealed-brief-agent');
const { ZERO, addUsage } = require('./usage-report');
const { forbiddenInputNote, layerPrefix } = require('./confinement');
const { CREDENTIALS_FILE, textNeutralizer } = require('./recorded-paths');
const { EngineStageError, runEngineStage } = require('./engine-cli');
const { heldRefusal, stagedArtifact } = require('./held-refusal');
const { AttemptInputError, RUN_FILES, attemptProbeFile, holdAttemptInputs } = require('./score-inputs');
const { gitAccessOf, makeScratchDirectory, releaseScratchDirectory } = require('./workspace');

const Ajv = AjvModule.default ?? AjvModule;

const POLICY_PATH = 'policy/scoring-policy.json';
const CONDITIONS_PATH = 'policy/evaluator-conditions.json';
const INDEX_PATH = 'corpus-index.json';
const RUNNABLE_ROUTES = ['clean-control', 'controlled-mutation', 'historical', 'gameability'];
const DENIAL_FAULT = 'forbidden-target';
/** Where the scoring policy sits in the run directory. */
const POLICY_FILE = RUN_FILES.policy;
/** The runtime-owned schema of `evaluator-qualification.json`. */
const QUALIFICATION_SCHEMA = path.join(__dirname, 'schemas', 'evaluator-qualification.schema.json');
/** The prefix of the lines eval-quality prints for an Invalid result, as `score` reports them. */
const INVALID_LINE = 'eval-quality: invalid:';

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
 * What `run.json` says ran for one registry entry: a command's executable and
 * target, a tool server's target, arguments and tools, or an HTTP target's
 * address, the deployment origins it authorizes, methods, server and the
 * digest of the evaluation's HTTP port.
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
      ...(entry.deployments === undefined ? {} : { deployments: entry.deployments }),
      methods: entry.methods,
      ...(entry.server === undefined ? {} : { server: { target: entry.server.target, targetArgs: entry.server.targetArgs } }),
      httpProbePortDigest: registry.httpPort?.digest ?? null,
    };
  }
  return { interfaceId: entry.interfaceId, executable: entry.executable, target: entry.target };
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
function refusal({ folder, selectedProbeIds = null }) {
  const probes = committedProbes(folder).filter(
    ({ probe }) => probe !== null && typeof probe === 'object' && (selectedProbeIds === null || selectedProbeIds.has(probe.probeId)),
  );
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
 * @param {string} [options.partition] `development` or `held-out`; everything when absent
 * @param {number} [options.trials] trials per arm, for a caller that asks for a count other than `evaluation.json`'s
 *   (`tea-evaluate ci`'s twin run asks for the scoring policy's `minimumTrialCount`); the evaluation's own when absent
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {(line: string) => void} [options.log]
 * @returns {Promise<PreflightOutcome>}
 */
function runRunCommand(folder, { fromWorkingTree = false, partition, trials, seed, env = process.env, log = () => {} } = {}) {
  if (trials !== undefined && !(Number.isInteger(trials) && trials >= 1))
    return Promise.resolve(
      new PreflightOutcome({
        stage: 'check',
        exitCode: 64,
        message: `unknown trial count ${JSON.stringify(trials)}; choose a positive integer`,
      }),
    );
  const unknown = unknownPartition(partition);
  if (unknown !== null) return Promise.resolve(new PreflightOutcome({ stage: 'check', ...unknown }));
  let heldOut;
  let selection;
  try {
    heldOut = new Set(readJson(path.join(folder, 'evaluation.json')).heldOutProbes ?? []);
    selection = selectPartition({ partition, heldOutProbes: heldOut, probes: partition === undefined ? [] : committedProbes(folder) });
  } catch {
    // The pipeline's check reports malformed source files with authoring findings; it keeps the partition, so a development
    // run still does not open the held-out plan.
    return runPipeline(folder, { command: 'run', partition, fromWorkingTree, seed, env, log });
  }
  if (selection.refusal !== undefined) return Promise.resolve(new PreflightOutcome({ stage: 'check', ...selection.refusal }));
  const { selectedProbeIds } = selection;
  const started = Date.now();
  // What the scores read is taken once, before anything runs, so an edit to
  // the evaluation folder during the run cannot reach the trial sets.
  let snapshot = null;
  return runPipeline(folder, {
    command: 'run',
    partition,
    selectedProbeIds,
    fromWorkingTree,
    seed,
    env,
    log,
    prepare: async (context) => {
      const refused = refusal({ ...context, selectedProbeIds });
      if (refused !== null) return refused;
      const conditionsFile = path.join(folder, ...CONDITIONS_PATH.split('/'));
      const probes = committedProbes(folder);
      let layer;
      try {
        layer = readEvaluatorLayer({
          folder,
          evaluation: context.evaluation,
          contract: context.contract,
          engine: await loadEngine(),
          view: context.view,
        });
      } catch (error) {
        if (!(error instanceof EvaluatorLayerError)) throw error;
        return new PreflightOutcome({ stage: 'check', exitCode: 10, message: `the evaluation layer cannot be used: ${error.message}` });
      }
      snapshot = {
        policyBytes: fs.readFileSync(path.join(folder, ...POLICY_PATH.split('/'))),
        conditions: fs.existsSync(conditionsFile) ? readJson(conditionsFile) : null,
        index: readJson(path.join(folder, INDEX_PATH)),
        probeIds: probes
          .filter(({ probe }) => selectedProbeIds === null || selectedProbeIds.has(probe.probeId))
          .map(({ probe }) => probe.probeId),
        selectedProbeIds,
        heldOutProbes: [...heldOut],
        operationPhases: structuredClone(context.evaluation.operationPhases ?? {}),
        partition: partition ?? 'both',
        trials: trials ?? null,
        calibration: readCalibration(folder),
        layer,
      };
      return null;
    },
    afterVerdict: (context) => runTrialSets({ ...context, snapshot, started }),
  });
}

/** One arm of the clean controls' qualification: the evidence, or a stop with the exit its failure maps to. */
async function qualificationArm({ contract, registry, workspace, stop, writer, directory, log, seed, signal }) {
  const { port, releaseHome } = await registry.createProbePort({
    cwd: workspace.root,
    projectRoot: workspace.root,
    workspace: workspace.top,
    git: gitAccessOf(workspace),
    privateRoot: registry.privateRoot,
  });
  try {
    return await runArm({ contract, port: hostEnvironmentPort({ port, registry }), registry, label: 'baseline', seed, signal });
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
  } finally {
    releaseHome();
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
  seed,
  signal,
  snapshot,
}) {
  const controls = committedProbes(folder).filter(
    ({ probe }) =>
      probe.qualification.route === 'clean-control' && (snapshot.selectedProbeIds === null || snapshot.selectedProbeIds.has(probe.probeId)),
  );
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
      seed,
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

/** The directory under the run directory that holds an evaluator attempt's files (Story 1.34). */
const QUALIFICATION_DIRECTORY = 'evaluator-qualification';
/** The report `run` writes once the attempts are scored. */
const QUALIFICATION_REPORT = 'evaluator-qualification.json';
/** The installed frameworks a command evaluator's run observed (Story 1.44). */
const FRAMEWORK_VERSIONS = 'framework-versions.json';

/**
 * What a trial is called and where it writes. A trial of the arm's trial set
 * keeps its evidence under `trials/<arm>/` and what its evaluator printed under
 * `evaluator/<arm>/`. An evaluator attempt (`context.attempt`, Story 1.34) runs
 * the same trial once, in a workspace whose label does not start with
 * `trial-`, and writes everything under
 * `evaluator-qualification/<arm>/attempt-<n>/`, so it leaves nothing where the
 * trial sets look.
 */
function trialNames({ arm, trialIndex, attempt }) {
  if (attempt === undefined) {
    return {
      label: `trial-${arm.slug}-${trialIndex}`,
      observationLabel: `trial-${trialIndex}`,
      evidenceFile: `trials/${arm.slug}/trial-${trialIndex}.json`,
      streams: `evaluator/${arm.slug}/trial-${trialIndex}`,
    };
  }
  const directory = `${QUALIFICATION_DIRECTORY}/${arm.slug}/attempt-${attempt}`;
  return {
    label: `attempt-${arm.slug}-${attempt}`,
    observationLabel: `attempt-${attempt}`,
    evidenceFile: `${directory}/actions.json`,
    streams: `${directory}/evaluator`,
  };
}

/**
 * One trial of one arm: on a mutated or historical arm, in a workspace of its
 * own reproducing the pristine or the pre-fix one (the mutated arm's mutation
 * applied and held to the digest the qualification measured; a deployment
 * arm's HTTP calls sent to the pre-fix deployment's origins), the plan run
 * once; on a gameability arm, the plan answered from the degenerate response
 * with nothing launched. The plan's observations are `evaluator-chosen`,
 * since the plan is the evaluation's own exercise of the target, except under
 * a sealed-brief agent, whose own calls are the evaluation's and the plan a
 * harness baseline it never sees (`baseline`). Every probe on the arm is
 * judged, and so is every rubric. Its evidence goes to
 * `trials/<arm>/trial-<n>.json`, or, for an evaluator attempt, under
 * `evaluator-qualification/` (`trialNames`).
 */
async function runTrial(context) {
  const { arm, trialIndex, contract, registry, pristine, make, discard, engine, writer, stop, signal, snapshot, run } = context;
  const { label, observationLabel, evidenceFile } = trialNames(context);
  const provenance = snapshot.layer.evaluator.kind === 'sealed-brief-agent' ? 'baseline' : 'evaluator-chosen';
  if (arm.degenerate !== undefined) {
    const began = Date.now();
    let executed;
    try {
      executed = await degenerateArm({
        contract,
        registry,
        steps: arm.degenerate.steps,
        label: observationLabel,
        provenance,
        signal,
      });
    } catch (error) {
      writer.writeJson(evidenceFile, {
        conditionArm: arm.conditionArm,
        trialIndex,
        workspace: null,
        degenerateResponse: arm.degenerate.response,
        fault: faultRecord(error),
        steps: error?.steps ?? [],
      });
      const denied = error?.code === DENIAL_FAULT;
      throw stop({
        stage: 'trial',
        exitCode: denied ? 10 : 12,
        message: `${label} ${denied ? `was denied by the registry${reasonNote(error)}` : 'yields no record'}: ${error?.message ?? error}`,
      });
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
      observedMounts: async () => [],
      auditChannel: () => null,
      hostSocketReport: () => null,
      egressReport: () => null,
      toolCalls: [],
    });
  }
  const workspace = make(label, arm.basis ?? pristine);
  // The trial's private home goes with the trial, so no later trial can reach an earlier one's state.
  let releaseHome = () => {};
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
    // The trial's port audits what its target processes open outside what they were granted (`confinement.js`).
    let probePort;
    try {
      probePort = await registry.createProbePort({
        cwd: workspace.root,
        projectRoot: workspace.root,
        workspace: workspace.top,
        git: gitAccessOf(workspace),
        privateRoot: registry.privateRoot,
        deployment: arm.deployment ?? null,
        audit: true,
      });
    } catch (error) {
      // The audit's observer could not start (Story 1.60): a trial no audit watches yields no record.
      throw stop({ stage: 'trial', exitCode: 12, message: `${label} yields no record: ${error?.message ?? error}` });
    }
    const { port: adapter, observedMounts, auditChannel, hostSocketReport, egressReport } = probePort;
    releaseHome = probePort.releaseHome;
    const port = hostEnvironmentPort({ port: adapter, registry });
    const began = Date.now();
    let executed;
    try {
      executed = await runArm({ contract, port, registry, label: observationLabel, provenance, seed: run?.seed, signal });
    } catch (error) {
      writer.writeJson(evidenceFile, {
        conditionArm: arm.conditionArm,
        trialIndex,
        workspace: label,
        ...(arm.deployment ? { origins: arm.deployment.origins } : {}),
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
      evidence: { workspace: label, ...(arm.deployment ? { origins: arm.deployment.origins } : {}) },
      port,
      mounts: [
        `${workspace.kind} ${label}`,
        ...workspace.provisioned.map((entry) => `read-only ${label}/${path.relative(workspace.root, entry).split(path.sep).join('/')}`),
        // The login files a registry entry's `login` grants, read-only (Story 1.113), named by their neutral form (`recorded-paths.js`).
        ...new Set(registry.logins.filter(({ file }) => file !== null).map(() => `read-only login ${CREDENTIALS_FILE}`)),
      ],
      // What the confinement's audit saw the target open outside what it was granted, read once the trial's calls ended.
      observedMounts,
      auditChannel,
      hostSocketReport,
      egressReport,
      // The commands and tool calls the runtime made for the plan, each an observed call.
      toolCalls: executed.steps.filter((step) => step.skipped === undefined).map((step) => callLabel(step.request)),
    });
  } finally {
    releaseHome();
    discard(workspace);
  }
}

/**
 * What the confinement's audit saw the trial's processes open outside what they were granted (Story 1.60). An audit
 * that cannot confirm what it saw (its observer ended, or never reported a read the runtime made) leaves the trial with
 * no record, exit 12: an empty list is never what a broken observer returns.
 */
async function readObservedMounts(observedMounts, { stop, label }) {
  try {
    return await observedMounts();
  } catch (error) {
    throw stop({ stage: 'trial', exitCode: 12, message: `${label} yields no record: ${error?.message ?? error}` });
  }
}

/**
 * The `run.json` entry of one audited trial (Story 1.81): the canaries the audit sent (reads of a file no target can reach,
 * through the sandbox's own token), the ones the kernel's log delivered and whether the log itself reported lost events.
 * The trial is `lossy` when the log delivered fewer canaries than were sent or reported a loss, and `complete` otherwise.
 * Linux's trace loses nothing and sends none, so its trials are `complete` with none sent.
 */
function channelEntry(arm, trial) {
  const { canariesSent, canariesDelivered, logReportedLoss } = trial.auditChannel;
  return {
    conditionArm: arm.conditionArm,
    trialIndex: trial.trialIndex,
    completeness: canariesDelivered < canariesSent || logReportedLoss ? 'lossy' : 'complete',
    canariesSent,
    canariesDelivered,
    logReportedLoss,
  };
}

/**
 * The `run.json` entry of one trial whose calls left host sockets reachable (Story 1.82), or `null`: a call hides at most as many
 * Unix sockets as its Bubblewrap command leaves room for, ranked by who can create them, so a host holding more sockets of other users
 * than that leaves the rest reachable, and the entry names how many calls were cut and the most sockets one call left.
 */
function socketTruncationEntry(arm, trial) {
  const report = trial.hostSocketReport;
  if (report === null || report === undefined || report.truncatedCalls === 0) return null;
  return {
    conditionArm: arm.conditionArm,
    trialIndex: trial.trialIndex,
    calls: report.calls,
    truncatedCalls: report.truncatedCalls,
    socketsLeftReachable: report.socketsLeftReachable,
  };
}

/**
 * The `run.json` entry of one trial whose egress proxies refused a request (Story 1.83), or `null`: each distinct refusal names the host
 * and port asked for, the registry entries whose authorization was asked, eval-quality's reason and detail, the address the host resolved
 * to when it did and how many times it was made; `omitted` counts the distinct requests past the cap the sandbox keeps.
 */
function egressRefusalEntry(arm, trial) {
  const report = trial.egressReport;
  if (report === null || report === undefined || report.refusals.length === 0) return null;
  return { conditionArm: arm.conditionArm, trialIndex: trial.trialIndex, refusals: report.refusals, omitted: report.omitted };
}

/** The sentence the run's summary adds for trials whose egress proxy refused a request, naming each host, port and entry, `''` when none did. */
function egressRefusalNote(entries) {
  if (entries.length === 0) return '';
  const named = entries
    .map((entry) => {
      const [first, ...rest] = entry.refusals;
      const more = rest.length + entry.omitted;
      return `${entry.conditionArm} trial ${entry.trialIndex} (${first.host}:${first.port} for ${first.interfaceIds.map((id) => JSON.stringify(id)).join(', ')}, ${first.reason}${more > 0 ? `, and ${more} more` : ''})`;
    })
    .join(', ');
  return `; the egress proxy refused a host the target asked for in ${named}, so the target did not reach it`;
}

/** The sentence the run's summary adds for trials that left host sockets reachable, naming each with its counts, `''` when none did. */
function leftSocketsNote(entries) {
  if (entries.length === 0) return '';
  const named = entries
    .map(
      (entry) =>
        `${entry.conditionArm} trial ${entry.trialIndex} (${entry.truncatedCalls} of ${entry.calls} call(s), up to ${entry.socketsLeftReachable} socket(s))`,
    )
    .join(', ');
  return `; the host held more Unix sockets than a call can hide, so ${named} left sockets of other users reachable`;
}

/** The sentence the run's summary adds for the lossy trials, naming each with its counts, `''` when no trial is lossy. */
function lostCanaryNote(entries) {
  const lossy = entries.filter((entry) => entry.completeness === 'lossy');
  if (lossy.length === 0) return '';
  const named = lossy
    .map((entry) => {
      const lost = entry.canariesSent - entry.canariesDelivered;
      const counts = lost > 0 ? [`${lost} of ${entry.canariesSent}`] : [];
      if (entry.logReportedLoss) counts.push('the log reported lost events');
      return `${entry.conditionArm} trial ${entry.trialIndex} (${counts.join('; ')})`;
    })
    .join(', ');
  return `; the kernel's log lost audit reports in ${named}, so the observed mounts of ${lossy.length === 1 ? 'that trial' : 'those trials'} may be incomplete`;
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
  const {
    label,
    evidenceFile,
    executed,
    began,
    evidence,
    mounts,
    observedMounts,
    auditChannel,
    hostSocketReport,
    egressReport,
    toolCalls,
  } = facts;
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
      spawnPrefix: layerPrefix(context.registry.confinement),
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
    observedMounts: await readObservedMounts(observedMounts, { stop, label }),
    // Read once the audit's observed mounts are, which ends the canary reads the count needs (Story 1.81); `null` where nothing audited the trial.
    auditChannel: auditChannel(),
    // What the calls' lists of host sockets left reachable once their budget ran out (Story 1.82); `null` where nothing hides sockets.
    hostSocketReport: hostSocketReport(),
    // What the calls' egress proxies refused (Story 1.83); `null` where nothing proxies.
    egressReport: egressReport(),
    toolCalls,
    resourceUse: executed.resourceUse ?? ZERO,
    unreportedSteps: executed.unreportedSteps ?? [],
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
  const {
    label,
    evidenceFile,
    executed,
    began,
    evidence,
    port,
    mounts,
    observedMounts,
    auditChannel,
    hostSocketReport,
    egressReport,
    toolCalls,
  } = facts;
  const { evaluator, mapping, validate } = snapshot.layer;
  // The evaluator runs from the evaluation folder, so the run holds the layer's files to the bytes it digested
  // before each launch and after each trial, and the frameworks it declares the same way. In a confined run no
  // process of the run can write `evaluator/` (`confinement.js`), which closes the window between this read and
  // the launch; an opted-out run keeps the reads.
  const spawnPrefix = layerPrefix(context.registry.confinement);
  const holdLayer = async (when) => {
    const change = evaluatorLayerChange(folder, snapshot.layer.files);
    if (change !== null) throw new EvaluatorError(`the evaluation layer changed ${when}: ${change}`);
    // The installed frameworks sit outside the tracked tree, so they are read again beside it (Story 1.44).
    const moved = await frameworkChange(context);
    if (moved !== null) throw new EvaluatorError(`the installed frameworks changed ${when}: ${moved}`);
    const agentMoved = await agentVersionChange(context);
    if (agentMoved !== null) throw new EvaluatorError(`the installed agent version could not be held ${when}: ${agentMoved}`);
  };
  const baseline = Object.values(executed.stepObservations).sort((a, b) => a.sequence - b.sequence);
  const { observationLabel, streams } = trialNames(context);
  const written = { conditionArm: arm.conditionArm, trialIndex, ...evidence, steps: executed.steps };
  let router = null;
  let evaluated;
  const judgments = {};
  let judgeResults = [];
  try {
    await holdLayer("before the evaluator's launch");
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
        spawnPrefix,
      });
    } else {
      // Drawn after the plan ran and before the router exists, so neither a plan step's output nor any call can carry it.
      const nonce = answerNonce();
      router = bridgeRouter({
        contract,
        registry: context.registry,
        port,
        degenerate: arm.degenerate?.steps ?? null,
        label: observationLabel,
        taken: new Set(baseline.map((observation) => observation.observationId)),
        firstSequence: baseline.length + 1,
        budget: contract.budgets?.maxToolCalls ?? 0,
        nonce,
        signal,
      });
      evaluated = await runSealedBriefAgent({
        evaluator,
        sealedBrief,
        contract,
        mapping,
        validate,
        router,
        nonce,
        scratch,
        env,
        spawnPrefix,
      });
    }
    await holdLayer('while the evaluator ran');
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
  let resourceUse;
  try {
    resourceUse = addUsage(executed.resourceUse ?? ZERO, router?.resourceUse() ?? ZERO);
  } catch (error) {
    throw stop({ stage: 'trial', exitCode: 12, message: `${label} yields no record: ${error.message}` });
  }
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
    callCount: executed.steps.filter((step) => step.skipped === undefined).length + (router?.counted() ?? 0),
    elapsedMs,
    mounts,
    // Read after the agent's own calls through the bridge, which ran in the trial's workspace too.
    observedMounts: await readObservedMounts(observedMounts, { stop, label }),
    // Read once the audit's observed mounts are, which ends the canary reads the count needs (Story 1.81); `null` where nothing audited the trial.
    auditChannel: auditChannel(),
    // What the calls' lists of host sockets left reachable once their budget ran out (Story 1.82); `null` where nothing hides sockets.
    hostSocketReport: hostSocketReport(),
    // What the calls' egress proxies refused (Story 1.83); `null` where nothing proxies.
    egressReport: egressReport(),
    toolCalls: [...toolCalls, ...bridged],
    resourceUse,
    unreportedSteps: [...(executed.unreportedSteps ?? []), ...(router?.unreportedSteps ?? [])],
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

/** The installed version of each framework the command evaluator declares, probed through the evaluator's own launch path. */
function frameworkEntries(context) {
  const { snapshot, folder, scratch, env, registry } = context;
  return observeFrameworks({
    folder,
    evaluator: snapshot.layer.evaluator,
    frameworks: snapshot.layer.frameworks,
    scratch,
    env,
    spawnPrefix: layerPrefix(registry.confinement),
  });
}

/**
 * Reads the installed frameworks before any evaluator trial and writes
 * `framework-versions.json` (the declared and observed versions, with the
 * diagnostics of a probe that failed). A dependency that is missing, or
 * installed at a version other than the declaration's, stops the run with
 * exit 12 before a trial runs, the artifact left behind. Returns the observed
 * `{ package, version }` list the configuration records.
 */
async function observeInstalledFrameworks(context) {
  const { snapshot, writer, stop } = context;
  const { frameworks } = snapshot.layer;
  const entries = await frameworkEntries(context);
  const problems = observationProblems(frameworks, entries);
  writer.writeJson(FRAMEWORK_VERSIONS, versionsRecord(frameworks, entries, problems));
  if (problems.length > 0) {
    throw stop({
      stage: 'trial',
      exitCode: 12,
      message: `the installed frameworks do not meet evaluator/frameworks.json, so no trial runs: ${problems.join('; ')}; see ${FRAMEWORK_VERSIONS}`,
    });
  }
  return observedVersions(entries);
}

/** How the installed frameworks differ from the ones the run started with, or null when they are the same. */
async function frameworkChange(context) {
  const { frameworks } = context.snapshot.layer;
  // Only a command evaluator declares frameworks; any other kind has none to hold.
  if (frameworks === null || frameworks.length === 0) return null;
  const problems = observationProblems(frameworks, await frameworkEntries(context), {
    changed: true,
    initial: context.observedFrameworks,
  });
  return problems.length === 0 ? null : problems.join('; ');
}

/** The sealed-brief CLI version held beside the evaluator layer at every read position. */
async function agentVersionChange(context) {
  if (context.snapshot.layer.evaluator.kind !== 'sealed-brief-agent') return null;
  try {
    const version = await observeAgentVersion({
      evaluator: context.snapshot.layer.evaluator,
      scratch: context.scratch,
      env: context.env,
      spawnPrefix: layerPrefix(context.registry.confinement),
    });
    return version === context.agentVersion ? null : `observed ${version}; run began with ${context.agentVersion}`;
  } catch (error) {
    return error.message;
  }
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

  const cleanControls = await qualifyCleanControls({ ...context, seed: run.seed });
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
  // A historical arm per pre-fix revision or release: its trials reproduce the pre-fix worktree its witness legs ran
  // in, or reach the pre-fix deployment they reached.
  for (const preFix of [...routesByRevision.keys()].sort()) {
    const route = routesByRevision.get(preFix);
    arms.push({
      conditionArm: `historical:${preFix}`,
      slug: `historical-${preFix}`,
      mutation: null,
      mutatedDigest: null,
      basis: route.workspace,
      deployment: route.deployment,
      // A deployment arm is asked again after its last trial which release it runs (Story 1.64).
      route: route.deployment === null ? null : route,
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
  // A run whose every probe is refused has no arm and nothing to score, at qualification, after the legs or after the trials.
  const noArm = () =>
    stop({
      stage: 'trial',
      exitCode: 12,
      message: `every probe was refused (${run.refused.map((refusal) => `${refusal.file}: ${refusal.reason}`).join('; ')}), so the run has no arm to run and nothing to score`,
    });
  if (arms.length === 0) throw noArm();

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

  // A command evaluator's installed frameworks are read before anything it judges runs (Story 1.44).
  const observedFrameworks = kind === 'command' ? await observeInstalledFrameworks(context) : null;
  context.observedFrameworks = observedFrameworks;
  let observedAgentVersion = null;
  if (kind === 'sealed-brief-agent') {
    try {
      observedAgentVersion = await observeAgentVersion({
        evaluator: snapshot.layer.evaluator,
        scratch: context.scratch,
        env: context.env,
        spawnPrefix: layerPrefix(registry.confinement),
      });
      context.agentVersion = observedAgentVersion;
    } catch (error) {
      throw stop({ stage: 'trial', exitCode: 12, message: `the installed agent version could not be observed: ${error.message}` });
    }
  }

  let calibrationDigest = null;
  if ((contract.rubrics ?? []).length > 0) {
    const { layer } = snapshot;
    const judgeItem = async ({ rubric, criterion, response, responseKind }) => {
      const stepId = /^\/interactions\/([^/]+)/.exec(criterion.evidence)?.[1];
      const observation = calibrationObservation({ criterion, response, responseKind, ...calibrationStepPair(contract, criterion) });
      if (kind === 'deterministic') {
        const result = await judgeRubrics({
          contract,
          stepObservations: { [stepId]: observation },
          judge: evaluation.judge,
          scratch: context.scratch,
          calibrationResponse: { rubricId: rubric.id, criterionId: criterion.id },
          spawnPrefix: layerPrefix(registry.confinement),
        });
        treeUnchanged('calibration');
        return result.results.find((entry) => entry.rubricId === rubric.id && entry.criterionId === criterion.id)?.score ?? null;
      }
      const key = Object.entries(layer.mapping.keys).find(
        ([, binding]) => binding.rubricId === rubric.id && binding.criterionId === criterion.id,
      )?.[0];
      let answer;
      const changedBefore = evaluatorLayerChange(folder, layer.files);
      if (changedBefore !== null) throw new EvaluatorError(`the evaluation layer changed before calibration: ${changedBefore}`);
      const movedBefore = await frameworkChange(context);
      if (movedBefore !== null) throw new EvaluatorError(`the installed frameworks changed before calibration: ${movedBefore}`);
      const agentMovedBefore = await agentVersionChange(context);
      if (agentMovedBefore !== null)
        throw new EvaluatorError(`the installed agent version could not be held before calibration: ${agentMovedBefore}`);
      if (kind === 'command') {
        const result = await runCommandEvaluator({
          folder,
          evaluator: layer.evaluator,
          sealedBrief: context.sealedBrief,
          observations: [observation],
          mapping: layer.mapping,
          validate: layer.validate,
          scratch: context.scratch,
          env: context.env,
          spawnPrefix: layerPrefix(registry.confinement),
        });
        answer = result.answer;
      } else if (kind === 'sealed-brief-agent') {
        const calibrationView = {
          observationId: observation.observationId,
          callInputs: observation.callInputs,
          stdout: observation.stdout,
          stderr: observation.stderr,
          exitCode: observation.exitCode,
          responseBody: observation.responseBody,
          responseHeaders: observation.responseHeaders,
          responseStatus: observation.responseStatus,
          artifacts: observation.artifacts,
        };
        const nonce = answerNonce();
        const router = bridgeRouter({
          contract,
          registry,
          port: null,
          degenerate: null,
          label: 'calibration',
          taken: new Set(),
          firstSequence: 1,
          budget: 0,
          nonce,
          signal: context.signal,
        });
        const result = await runSealedBriefAgent({
          evaluator: layer.evaluator,
          sealedBrief: context.sealedBrief,
          contract,
          mapping: layer.mapping,
          validate: layer.validate,
          router,
          nonce,
          scratch: context.scratch,
          env: context.env,
          calibrationObservation: calibrationView,
          spawnPrefix: layerPrefix(registry.confinement),
        });
        answer = result.answer;
      } else throw new Error(`the ${kind} evaluator cannot calibrate a rubric`);
      const changedAfter = evaluatorLayerChange(folder, layer.files);
      if (changedAfter !== null) throw new EvaluatorError(`the evaluation layer changed during calibration: ${changedAfter}`);
      const movedAfter = await frameworkChange(context);
      if (movedAfter !== null) throw new EvaluatorError(`the installed frameworks changed during calibration: ${movedAfter}`);
      const agentMovedAfter = await agentVersionChange(context);
      if (agentMovedAfter !== null)
        throw new EvaluatorError(`the installed agent version could not be held during calibration: ${agentMovedAfter}`);
      treeUnchanged('calibration');
      return answer.rows.find((row) => row.key === key && row.outcome === 'score')?.score ?? null;
    };
    try {
      // Under a partition plan one labelled file serves every partition, and a partition's run judges the items of its own criteria.
      const partial = calibrationPartial(snapshot.partition, evaluation);
      const result = await runCalibration({
        calibration: snapshot.calibration,
        evaluation,
        contract,
        engine,
        writer,
        stop,
        judgeItem,
        partial,
      });
      calibrationDigest = result.digest;
    } catch (error) {
      if (error instanceof JudgeError || error instanceof EvaluatorError) {
        writer.writeJson('judge-calibration.json', { fault: error.message, stdout: error.stdout, stderr: error.stderr });
        throw stop({ stage: 'trial', exitCode: 12, message: `judge calibration could not run: ${error.message}` });
      }
      throw error;
    } finally {
      treeUnchanged('calibration');
    }
  }

  const trialCount = snapshot.trials ?? evaluation.trials;
  if (sealed === null) throw noStages();
  const { contractDigest, sealedBriefDigest } = sealed;
  const { conditions, layer } = snapshot;

  const failures = (artifactKind, problems) => {
    if (problems.length > 0) {
      throw stop({
        stage: 'trial',
        exitCode: 12,
        message: `the runtime built a ${artifactKind} that does not meet eval-quality's published schema: ${problems.join('; ')}`,
      });
    }
  };

  const tools = registry.toolInventory();
  // Only the deterministic kind calls TeA's rubric judge; every other kind scores the rubric itself.
  const judgeConfiguration =
    kind === 'deterministic' ? judgeConfigurationFor({ contract, conditions, digestBytes: engine.digestBytes }) : null;
  const fields = configurationFields({
    layer,
    conditions,
    judgeConfiguration,
    digestBytes: engine.digestBytes,
    calibrationDigest,
    calibrationMinimumAgreement: evaluation.judgeCalibration?.minimumAgreement ?? null,
    qualification: kind === 'sealed-brief-agent' ? (evaluation.evaluatorQualification ?? null) : null,
    frameworks: observedFrameworks,
    agentVersion: observedAgentVersion,
  });
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
  // Written ahead of the trials, since the records an evaluator qualification scores name its digest.
  writeArtifact(engine, writer, 'evaluator-configuration.json', configuration, 'EvaluatorConfiguration');

  const stepCeilingMs = (contract.interactionPlan ?? []).reduce((total, step) => {
    const iface = (contract.permittedInterfaces ?? []).find((candidate) => candidate.logicalId === step.interfaceId);
    const operation = (iface?.operations ?? []).find((candidate) => candidate.operationId === step.operationId);
    return total + registry.ceilingMs(iface?.logicalId, operation);
  }, 0);
  // A sealed-brief agent's own calls count against the contract's budget in each trial, beside the plan's steps.
  const callsPerTrial =
    (contract.interactionPlan ?? []).length + (kind === 'sealed-brief-agent' ? (contract.budgets?.maxToolCalls ?? 0) : 0);
  // The evaluator's wall clock counts toward a trial's ceiling beside the plan's. A command evaluator's trial also
  // reads its declared frameworks twice (before the launch and after the evaluator), each probe bounded by the
  // probe's effective timeout and run in turn; an empty declaration adds nothing.
  const probePassesMs =
    kind === 'command'
      ? 2 * layer.frameworks.reduce((total, framework) => total + effectiveProbeTimeoutMs(framework, layer.evaluator), 0)
      : 0;
  const versionPassesMs = kind === 'sealed-brief-agent' ? 3 * AGENT_VERSION_CEILING_MS : 0;
  const trialCeilingMs = stepCeilingMs + (convertsRows(kind) ? layer.evaluator.timeoutMs : 0) + probePassesMs + versionPassesMs;
  // The digest of the bytes the runtime wrote to a run-directory file, which `score` holds each file to.
  const bytesDigest = (file) => engine.digestBytes(writer.read(file));
  const sealing = {
    configuration,
    configurationDigest,
    contractDigest,
    sealedBriefDigest,
    tools,
    callsPerTrial,
    trialCeilingMs,
    failures,
    bytesDigest,
  };

  // A sealed-brief agent chooses its own calls, so its verdicts count only once it agrees with itself on the arms it will judge.
  if (kind === 'sealed-brief-agent') await qualifyEvaluator({ ...context, arms, sealing });

  for (const arm of arms) {
    arm.trials = [];
    for (let trialIndex = 1; trialIndex <= trialCount; trialIndex += 1) {
      log(`${arm.conditionArm}: trial ${trialIndex} of ${trialCount}`);
      const trial = await runTrial({ ...context, arm, trialIndex });
      const versionReadBegan = Date.now();
      const agentMoved = await agentVersionChange(context);
      if (agentMoved !== null)
        throw stop({ stage: 'trial', exitCode: 12, message: `the installed agent version could not be held after a trial: ${agentMoved}` });
      trial.elapsedMs += Date.now() - versionReadBegan;
      arm.trials.push(trial);
      // Read after every trial, so a target that writes into the project stops the run at once.
      treeUnchanged('trials');
    }
    // The trials reached the pre-fix deployment after the legs did, so it is asked once more which release it runs. A release
    // that changed refuses every probe on the arm before any trial set is sealed; the trials' evidence stays, since each ran.
    if (arm.route !== null && arm.route !== undefined) {
      const held = await holdDeployment({
        route: arm.route,
        point: 'trials',
        contract,
        registry,
        stop,
        seed: run.seed,
        signal: context.signal,
      });
      if (held.refused !== undefined) {
        for (const { probeId, file } of arm.route.members) {
          recordRefusal({ run, writer, writeRun: context.writeRun, log }, { probeId, file, reason: held.refused });
          refusedIds.add(probeId);
        }
        arm.refused = true;
      }
    }
  }
  const sealable = arms.filter((arm) => arm.refused !== true);
  if (sealable.length === 0) throw noArm();
  const armed = new Set(sealable.flatMap((arm) => arm.probes.map((probe) => probe.probeId)));
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

  const trialSets = [];
  const recordDigests = {};
  const manifestDigests = {};
  const unreportedResourceUse = [];
  const observedMountsChannel = [];
  const hostSocketTruncation = [];
  const egressRefusals = [];
  for (const arm of sealable) {
    for (const trial of arm.trials) {
      if (trial.auditChannel !== null) observedMountsChannel.push(channelEntry(arm, trial));
      const truncated = socketTruncationEntry(arm, trial);
      if (truncated !== null) hostSocketTruncation.push(truncated);
      const refused = egressRefusalEntry(arm, trial);
      if (refused !== null) egressRefusals.push(refused);
      if (trial.unreportedSteps.length > 0) {
        unreportedResourceUse.push({ conditionArm: arm.conditionArm, trialIndex: trial.trialIndex, stepIds: trial.unreportedSteps });
      }
    }
    for (const probe of arm.probes) {
      const directory = `trial-sets/${probe.probeId}`;
      const runId = `${invocationId}-${probe.probeId}`;
      const set = await sealProbeTrials(context, sealing, {
        conditionArm: arm.conditionArm,
        probe,
        trials: arm.trials,
        directory,
        runId,
      });
      manifestDigests[probe.probeId] = set.manifestDigest;
      Object.assign(recordDigests, set.recordDigests);
      trialSets.push({
        probeId: probe.probeId,
        runId,
        conditionArm: arm.conditionArm,
        probe: writeQualifiedProbe({ writer, stop }, probe),
        records: set.records,
        isolationManifest: set.manifestFile,
      });
    }
  }

  return completeRun(context, {
    arms: sealable,
    trialSets,
    recordDigests,
    manifestDigests,
    configurationDigest,
    trialCount,
    unreportedResourceUse,
    observedMountsChannel,
    hostSocketTruncation,
    egressRefusals,
    evaluatorRecord: {
      kind,
      identity: configuration.evaluatorIdentity,
      ...(kind === 'command' ? { command: layer.evaluator.command, frameworks: observedFrameworks } : {}),
      ...(kind === 'sealed-brief-agent'
        ? { agent: layer.evaluator.agent, model: recordedEvaluatorModel(layer.evaluator), version: observedAgentVersion }
        : {}),
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

/** What the evaluator recommends for one probe over `trials`, by the evaluator kind the run reads. */
function recommendationFor(kind, trials, probeId) {
  return convertsRows(kind)
    ? setRecommendationOf(trials.map((trial) => trial.recommendations[probeId]))
    : setRecommendation(trials.map((trial) => trial.judgments[probeId]));
}

/**
 * One probe's isolation manifest and Sealed Run Records for the trials of one
 * arm, each validated against the schema eval-quality publishes and written
 * under `directory`: `isolation-manifest.json` and `record-<trialIndex>.json`.
 * The trial sets and the evaluator qualification's attempts (one trial each)
 * seal through here, so the two build one shape.
 *
 * @returns {Promise<{ manifestFile: string, manifestDigest: string, records: string[], recordDigests: Record<string, string> }>}
 */
async function sealProbeTrials(context, sealing, { conditionArm, probe, trials, directory, runId }) {
  const { folder, evaluation, contract, registry, validate, engine, writer, stop } = context;
  const {
    configuration,
    configurationDigest,
    contractDigest,
    sealedBriefDigest,
    tools,
    callsPerTrial,
    trialCeilingMs,
    failures,
    bytesDigest,
  } = sealing;
  const kind = context.snapshot.layer.evaluator.kind;
  const trialCount = trials.length;
  const recommendation = recommendationFor(kind, trials, probe.probeId);
  let setUse = ZERO;
  try {
    for (const trial of trials) setUse = addUsage(setUse, trial.resourceUse);
  } catch (error) {
    throw stop({ stage: 'trial', exitCode: 12, message: `${runId}: ${error.message}` });
  }
  const manifest = isolationManifest({
    runId,
    contractId: contract.contractId,
    conditionArm,
    modelSnapshot: configuration.modelSnapshot,
    systemPromptDigest: configuration.systemPromptDigest,
    contractDigest,
    evaluatorConfigurationDigest: configurationDigest,
    workspaceIdentity: `${evaluation.evaluationId} ${conditionArm}`,
    allowedMounts: trials.flatMap((trial) => trial.mounts),
    // What the confinement's audit saw the set's trials open outside what they were granted (records.js).
    // The audit's host paths in the neutral forms (`recorded-paths.js`): the manifest is a record `compare --accept` copies and `runs/` uploads, and a path below the home or temp directory still says which file the target read.
    observedMounts: [...new Set(trials.flatMap((trial) => trial.observedMounts).map(textNeutralizer({ folder })))].sort(),
    toolAllowlist: tools,
    observedToolCalls: [...new Set(trials.flatMap((trial) => trial.toolCalls))].sort(),
    resourceCeilings: {
      maxToolCalls: Math.max(1, callsPerTrial * trialCount),
      maxInputTokens: UNBOUNDED,
      maxOutputTokens: UNBOUNDED,
      maxWallClockMinutes: Math.max(trialCeilingMs * trialCount, 1) / 60_000,
      maxCostUsd: String(UNBOUNDED),
    },
    actualResourceUse: {
      toolCalls: trials.reduce((total, trial) => total + (trial.callCount ?? trial.toolCalls.length), 0),
      inputTokens: setUse.inputTokens,
      outputTokens: setUse.outputTokens,
      wallClockSeconds: trials.reduce((total, trial) => total + trial.elapsedMs, 0) / 1000,
      costUsd: setUse.costUsd,
    },
    forbiddenInputNote: forbiddenInputNote(registry.confinement, registry.egressEntries, registry.logins),
  });
  failures('IsolationManifest', await validate('isolation-manifest', manifest));
  const manifestFile = `${directory}/isolation-manifest.json`;
  writeArtifact(engine, writer, manifestFile, manifest, 'IsolationManifest');
  const records = [];
  const recordDigests = {};
  for (const trial of trials) {
    const judgment = trial.judgments[probe.probeId];
    const record = sealedRunRecord({
      runId,
      conditionArm,
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
        inputTokens: trial.resourceUse.inputTokens,
        outputTokens: trial.resourceUse.outputTokens,
        wallClockSeconds: trial.elapsedMs / 1000,
        costUsd: trial.resourceUse.costUsd,
      },
    });
    failures('SealedRunRecord', await validate('sealed-run-record', record));
    const recordFile = `${directory}/record-${trial.trialIndex}.json`;
    writeArtifact(engine, writer, recordFile, record, 'SealedRunRecord');
    recordDigests[recordFile] = bytesDigest(recordFile);
    records.push(recordFile);
  }
  return { manifestFile, manifestDigest: bytesDigest(manifestFile), records, recordDigests };
}

/**
 * The state eval-quality reduces an attempt to when the agent behaved as the arm's probes expect: a clean control passes
 * (`passed-clean-control`) and a seeded defect is caught (`caught`). A historical or gameability arm is not qualified (null).
 */
function expectedOutcome(arm) {
  if (arm.conditionArm === 'clean') return 'passed-clean-control';
  return arm.conditionArm.startsWith('mutated:') ? 'caught' : null;
}

/**
 * One attempt's sealed record through `eval-quality score`, alone: the
 * outcome is the state the engine's evidence artifact reduced the attempt to,
 * copied unchanged, and an attempt the engine reads as Invalid has no
 * artifact, so it is kept with the engine's exit code and its `invalid:`
 * lines. Any other exit is an engine that could not score (exit 12).
 *
 * The call is held to its inputs (Story 1.69, AD-7, AD-12).
 * In a run that opted out of confinement a target's leftover process can rewrite a file between the runtime's write and the engine's read, or substitute the staged artifact.
 * The votes would then come from bytes the runtime never wrote.
 * The attempt's inputs are read once through the run directory writer (the bytes the runtime wrote, held to the digest it took).
 * The call runs over their paths.
 * Then the comparison `score` makes (`held-refusal.js`) refuses a call whose inputs changed, whose staged artifact is not the in-process score of the held bytes, or whose exit or `eval-quality:` lines are not the ones those bytes give: exit 12, no vote.
 * The staged bytes the comparison accepted are the ones copied in and read, once.
 */
async function scoreAttempt(context, { probe, directory, set, corpusDigest }) {
  const { writer, runDirectory, folder, env, log, scratch, stop, engine } = context;
  let held;
  try {
    held = holdAttemptInputs({
      read: (relative) => writer.read(relative),
      engine,
      corpusDigest,
      probeId: probe.probeId,
      set,
    });
  } catch (error) {
    if (!(error instanceof AttemptInputError)) throw error;
    throw stop({
      stage: 'trial',
      exitCode: 12,
      message: `${probe.probeId}: ${error.message}; no engine call was made and no vote is recorded for the attempt`,
    });
  }
  const staging = makeScratchDirectory(scratch, 'tea-evaluate-qualification-');
  try {
    const produced = path.join(staging, 'evidence-artifact.json');
    const [heldSet] = held.index.trialSets;
    const args = held.scoreArguments({ pathOf: (relative) => writer.pathOf(relative), set: heldSet, out: produced });
    let result;
    try {
      result = runEngineStage('score', args, { runDirectory, folder, recordPath: `${directory}/score.json`, writer, env, log });
    } catch (error) {
      if (!(error instanceof EngineStageError)) throw error;
      throw stop({ stage: 'trial', exitCode: 12, message: `${probe.probeId}: an evaluator attempt could not be scored: ${error.message}` });
    }
    const staged = stagedArtifact(produced);
    if (staged.problem !== undefined) {
      throw stop({
        stage: 'trial',
        exitCode: 12,
        message: `${probe.probeId}: the staged evidence artifact of an evaluator attempt ${staged.problem}; no vote is recorded for the call`,
      });
    }
    const refusal = await heldRefusal({ held, set: heldSet, staged, exitCode: result.exitCode, stderr: result.stderr });
    if (refusal !== null) {
      throw stop({
        stage: 'trial',
        exitCode: 12,
        message: `${probe.probeId}: the score call of an evaluator attempt is not the one the held inputs stand behind: ${refusal}; no vote is recorded for the call, and its call record is ${directory}/score.json`,
      });
    }
    if (result.exitCode === 3) {
      return {
        exitCode: 3,
        evidence: null,
        outcome: null,
        invalid: result.stderr.split('\n').filter((line) => line.startsWith(INVALID_LINE)),
      };
    }
    // Only a PASS, CONCERNS or FAIL result (exit 0 or 2) carries an evidence artifact worth reading.
    if (result.exitCode !== 0 && result.exitCode !== 2) {
      throw stop({
        stage: 'trial',
        exitCode: 12,
        message: `${probe.probeId}: eval-quality score exited ${result.exitCode} for an evaluator attempt, which is no result to read; its call record is ${directory}/score.json`,
      });
    }
    const evidence = `${directory}/evidence-artifact.json`;
    if (staged.bytes === null) {
      throw stop({
        stage: 'trial',
        exitCode: 12,
        message: `${probe.probeId}: eval-quality score exited ${result.exitCode} for an evaluator attempt and wrote no evidence artifact`,
      });
    }
    // The bytes the comparison accepted are the bytes kept and read; the staging path is not read again.
    writer.write(evidence, staged.bytes);
    let votes = [];
    try {
      const artifact = JSON.parse(staged.bytes.toString('utf8'));
      votes = artifact.reducedProbeOutcomes.find((reduced) => reduced.probeId === probe.probeId).trialVotes;
    } catch {
      // Read as no vote below, with the artifact kept in the run directory for the reader.
    }
    if (!Array.isArray(votes) || votes.length !== 1 || typeof votes[0]?.state !== 'string') {
      throw stop({
        stage: 'trial',
        exitCode: 12,
        message: `${probe.probeId}: the evidence artifact of an evaluator attempt (${evidence}) holds no single trial vote for the probe`,
      });
    }
    return { exitCode: result.exitCode, evidence, outcome: votes[0].state, invalid: [] };
  } finally {
    releaseScratchDirectory(scratch, staging);
  }
}

/**
 * Qualifies a sealed-brief agent before any of its verdicts counts (Story
 * 1.34). The agent chooses its own calls, so two runs over one seeded defect
 * can differ, and a run's verdict would depend on which calls it happened to
 * make. Before the first trial the agent runs `evaluatorQualification.attempts`
 * times on the clean arm and on each mutated arm, each attempt in a workspace of
 * its own that writes nothing under `trials/`; every probe of the arm is judged
 * on the attempt, sealed as a record of one trial and scored alone by
 * `eval-quality score`. A probe's agreement is the fraction of attempts whose
 * reduced state is the one the arm expects (`passed-clean-control` on the clean
 * arm, `caught` on a mutated one), an arm's agreement is the lowest of its
 * probes', and an arm below `minimumAgreement` stops the run with exit 11 after
 * `evaluator-qualification.json` is written. Historical and gameability arms are
 * not qualified.
 */
async function qualifyEvaluator(context) {
  const { evaluation, arms, sealing, snapshot, invocationId, writer, log, stop, treeUnchanged } = context;
  if (evaluation.evaluatorQualification === undefined) {
    throw stop({
      stage: 'check',
      exitCode: 10,
      message: 'a sealed-brief agent evaluator needs evaluation.json to declare evaluatorQualification',
    });
  }
  const { attempts, minimumAgreement } = evaluation.evaluatorQualification;
  const corpusDigest = await corpusDigestOf(snapshot.index);
  // The policy an attempt is scored with is the one the trial sets carry, so it is in the run directory before the first score.
  if (!writer.has(POLICY_FILE)) writer.write(POLICY_FILE, snapshot.policyBytes);
  const report = { attempts, minimumAgreement, arms: [] };
  for (const arm of arms) {
    const expected = expectedOutcome(arm);
    if (expected === null) continue;
    const probes = arm.probes.map((probe) => ({ probeId: probe.probeId, expectedOutcome: expected, agreement: 0, attempts: [] }));
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      log(`${arm.conditionArm}: evaluator attempt ${attempt} of ${attempts}`);
      const trial = await runTrial({ ...context, arm, trialIndex: 1, attempt });
      const versionReadBegan = Date.now();
      const agentMoved = await agentVersionChange(context);
      if (agentMoved !== null)
        throw stop({
          stage: 'trial',
          exitCode: 12,
          message: `the installed agent version could not be held after an evaluator attempt: ${agentMoved}`,
        });
      trial.elapsedMs += Date.now() - versionReadBegan;
      // Read after every attempt, so a target that writes into the project stops the run at once.
      treeUnchanged('qualification attempts');
      // The engine reads the run directory next: it must hold what the runtime wrote, and nothing else.
      writer.verify('before an evaluator attempt was scored');
      for (const [index, probe] of arm.probes.entries()) {
        const directory = `${QUALIFICATION_DIRECTORY}/${arm.slug}/attempt-${attempt}/${probe.probeId}`;
        const set = await sealProbeTrials(context, sealing, {
          conditionArm: arm.conditionArm,
          probe,
          trials: [trial],
          directory,
          runId: `${invocationId}-${probe.probeId}-attempt-${attempt}`,
        });
        writeQualifiedProbe({ writer, stop }, probe);
        const scored = await scoreAttempt(context, { probe, directory, set, corpusDigest });
        probes[index].attempts.push({ attempt, ...scored, agrees: scored.outcome === expected });
      }
    }
    for (const probe of probes) probe.agreement = probe.attempts.filter((entry) => entry.agrees).length / attempts;
    report.arms.push({
      conditionArm: arm.conditionArm,
      agreement: Math.min(...probes.map((probe) => probe.agreement)),
      probes,
    });
  }
  // Written before it is checked, so the attempts the run paid for stay readable whatever the check says.
  writer.writeJson(QUALIFICATION_REPORT, report);
  const problems = await qualificationProblems(report);
  if (problems.length > 0) {
    throw stop({
      stage: 'trial',
      exitCode: 12,
      message: `the runtime built an ${QUALIFICATION_REPORT} that does not meet its schema: ${problems.join('; ')}`,
    });
  }
  const below = report.arms.filter((entry) => entry.agreement < minimumAgreement);
  if (below.length > 0) {
    throw stop({
      stage: 'trial',
      exitCode: 11,
      message: `evaluator qualification agreement fell below ${minimumAgreement} on ${below.map((entry) => `${entry.conditionArm} (${entry.agreement})`).join(', ')}; see ${QUALIFICATION_REPORT}`,
    });
  }
}

/** The ways `report` departs from the runtime-owned schema of `evaluator-qualification.json`. */
async function qualificationProblems(report) {
  const ajv = new Ajv({ strict: false, allErrors: true });
  const validate = ajv.compile(readJson(QUALIFICATION_SCHEMA));
  return validate(report) ? [] : (validate.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message}`);
}

/** A probe the run qualified, written as the trial set's probe file; a seeded probe's file is the preflight's own, which it must equal. */
function writeQualifiedProbe({ writer, stop }, probe) {
  const probeFile = attemptProbeFile(probe.probeId);
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
  const { folder, arms, refusedIds, snapshot, sealed, validate, writer, engine, stop, contract, evaluation } = context;
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
      engine,
      writer,
      // An imported rubric score is gated on the harness's calibration judgments, over the labelled file this run took (exit 11 below the minimum).
      calibration: (contract.rubrics ?? []).length > 0 ? { labelled: snapshot.calibration, evaluation, contract, engine, stop } : null,
      // Under a partition plan a record names only what this run's view declares (Story 1.107).
      view: evaluation.partitionPlan === undefined ? null : { contract, partition: snapshot.partition },
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
    configurationDigest: imported.configurationDigest,
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
  {
    arms,
    trialSets,
    recordDigests,
    manifestDigests,
    configurationDigest,
    trialCount,
    unreportedResourceUse,
    observedMountsChannel = [],
    hostSocketTruncation = [],
    egressRefusals = [],
    evaluatorRecord,
    model,
    judge,
  },
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
  // A sealed-brief agent's qualification wrote the policy already, to score its attempts with the bytes the trial sets carry.
  if (!writer.has(POLICY_FILE)) writer.write(POLICY_FILE, snapshot.policyBytes);
  writer.writeJson('operation-phases.json', snapshot.operationPhases);
  const corpusDigest = await corpusDigestOf(snapshot.index);
  const bytesDigest = (file) => engine.digestBytes(writer.read(file));
  // The bytes `score` reads, digested as the runtime wrote them, so it can
  // hold the run directory to what the run sealed.
  const artifacts = {
    contract: bytesDigest('eval-contract.json'),
    operationPhases: bytesDigest('operation-phases.json'),
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
    contract: RUN_FILES.contract,
    policy: RUN_FILES.policy,
    preflightVerdict: RUN_FILES.preflightVerdict,
    evaluatorConfiguration: RUN_FILES.evaluatorConfiguration,
    trialSets,
  });
  retractUnlessSealed.push(TRIAL_SETS_NAME, 'operation-phases.json');
  const result = outcome({
    stage: 'trial',
    exitCode: 0,
    message:
      trialCount === null
        ? `${trialSets.length} trial set(s) taken from the records evaluator's records over ${[...new Set(trialSets.map((set) => set.conditionArm))].join(', ')}; score them with tea-evaluate score --run ${invocationId}`
        : `${trialSets.length} trial set(s) of ${trialCount} trial(s) sealed over ${arms.map((arm) => arm.conditionArm).join(', ')}; score them with tea-evaluate score --run ${invocationId}${lostCanaryNote(observedMountsChannel)}${leftSocketsNote(hostSocketTruncation)}${egressRefusalNote(egressRefusals)}`,
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
    partition: snapshot.partition,
    heldOutProbes: snapshot.heldOutProbes,
    operationPhases: snapshot.operationPhases,
    runner: registry.entries.map((entry) => runnerOf(entry, registry)),
    evaluator: evaluatorRecord,
    model,
    judge,
    trials: {
      perArm: trialCount,
      arms: trialCount === null ? [...new Set(trialSets.map((set) => set.conditionArm))] : arms.map((arm) => arm.conditionArm),
    },
    trialCount,
    ...(trialCount === null ? {} : { unreportedResourceUse, observedMountsChannel, hostSocketTruncation, egressRefusals }),
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
  TRIAL_SETS_NAME,
  TRIAL_SETS_SCHEMA_VERSION,
  runRunCommand,
  // A trial's denial cannot be reached through the pipeline, whose qualification runs the same plan under the same
  // policy first, so its unit drives one trial directly.
  runTrial,
  // The audit's failure to confirm what a trial opened ends the trial with no record; its unit drives the mapping directly.
  readObservedMounts,
  // A trial's audit channel entry and the summary's note on the trials that lost canary reads; their unit drives both directly.
  channelEntry,
  socketTruncationEntry,
  leftSocketsNote,
  egressRefusalEntry,
  egressRefusalNote,
  lostCanaryNote,
  setRecommendation,
  // An evaluator attempt's score call; its unit drives the hold's refusal directly, which no engine call can race with.
  scoreAttempt,
};
