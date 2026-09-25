/**
 * `tea-evaluate run`: the clean and mutated arms as sealed trial sets (AD-7).
 *
 * A run is the preflight pipeline (`preflight.js`: check, the pristine
 * workspace, `compile` and `seal`, each seeded probe qualified through its
 * controlled mutation, the legs, and the eval-quality CLI's verdict), carried
 * on while every workspace is still live:
 *
 *   1. each clean control qualified: one clean arm in a workspace of its own,
 *      whose oracles for the control's behavior must hold (exit 11 otherwise),
 *      its evidence under `qualification/<probeId>/`, and the control
 *      materialized as eval-quality's `clean-control` probe;
 *   2. every arm a probe needs, `evaluation.json`'s `trials` times: the clean
 *      arm (`conditionArm: clean`) for the clean controls, and one mutated arm
 *      per mutation (`mutated:<mutationId>`) for the probes it seeds; each
 *      trial runs the interaction plan once, in a workspace of its own that
 *      reproduces the pristine one (with the mutation applied and its digest
 *      held to the one the qualification measured), and is judged by the
 *      deterministic evaluator (`judgeTrial`);
 *   3. the adopter's project read again (exit 12 on any change);
 *   4. one trial set per probe under `trial-sets/<probeId>/`: a Sealed Run
 *      Record per trial (`trialIndex` 1..N, one `runId` for the set, `mode:
 *      contract-scoring`), and one isolation manifest from the workspaces and
 *      tools the trials were granted; one evaluator configuration for the run,
 *      carrying the seal's `sealedBriefDigest`; each validated against the
 *      schema eval-quality publishes before it is written;
 *   5. `trial-sets.json`, the index `tea-evaluate score` reads, written last,
 *      and `run.json` completed with the digests, the runner and model
 *      identity, the trial count and the duration.
 *
 * A trial step that exits one of its registry entry's
 * `infrastructureExitCodes` is a target that could not run: the trial yields
 * no record and the run stops with exit 12, as does any trial that cannot run.
 * A stopped run writes no `trial-sets.json`, so there is nothing to score.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { hostEnvironmentPort, persistableRequest, runArm } = require('./arm');
const { corpusDigestOf } = require('./corpus-index');
const { expectedSchemaVersion } = require('./engine');
const { evaluateOracles, judgeTrial, oraclesOfBehaviors } = require('./evaluator');
const { QualificationError, applyReplaceExact } = require('./mutation');
const { PreflightOutcome, admissionRefusal, armVerdict, readJson, referenceTo, runPipeline, writeJson } = require('./preflight');
const { evaluatorConfiguration, isolationManifest, sealedRunRecord } = require('./records');

const POLICY_PATH = 'policy/scoring-policy.json';
const CONDITIONS_PATH = 'policy/evaluator-conditions.json';
const INDEX_PATH = 'corpus-index.json';
const PROBE_FILE = /\.probe\.json$/;
const RUNNABLE_ROUTES = ['clean-control', 'controlled-mutation'];
const DENIAL_FAULT = 'forbidden-target';

/** The index `tea-evaluate score` reads; its absence says the run did not complete. */
const TRIAL_SETS_NAME = 'trial-sets.json';
/** The index's version, read from the runtime-owned schema `score` validates it against, so the two cannot disagree. */
const TRIAL_SETS_SCHEMA_VERSION = readJson(path.join(__dirname, 'schemas', 'trial-sets.schema.json')).properties.schemaVersion.const;

/** The deterministic evaluator's identity, an opaque label with no person or account in it. */
const EVALUATOR_IDENTITY = 'tea-evaluate deterministic evaluator';

/**
 * What the isolation manifest records for a quantity the runtime neither
 * meters nor bounds (tokens and cost): the largest safe integer, the most the
 * published schema admits for a token ceiling and the same figure for cost,
 * so no ceiling is claimed that the runtime did not enforce.
 */
const UNBOUNDED = Number.MAX_SAFE_INTEGER;

const FORBIDDEN_INPUT_NOTE =
  'The target runs in a disposable workspace that leaves out the evaluation folder, so the contract, the probes, the mutations and the scoring policy are never in reach of it; the deterministic evaluator reads the contract and the trial observations only.';

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

/** An artifact eval-quality reads, written as its canonical serialization (RFC 8785, one artifact per file). */
function writeArtifact(engine, file, value, artifactPath) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, engine.serializeArtifact(value, artifactPath));
}

/** `relative` in POSIX form. */
function posix(relative) {
  return relative.split(path.sep).join('/');
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
    prepare: (context) => {
      const refused = refusal(context);
      if (refused !== null) return refused;
      const conditionsFile = path.join(folder, ...CONDITIONS_PATH.split('/'));
      snapshot = {
        policyBytes: fs.readFileSync(path.join(folder, ...POLICY_PATH.split('/'))),
        conditions: fs.existsSync(conditionsFile) ? readJson(conditionsFile) : null,
        index: readJson(path.join(folder, INDEX_PATH)),
        probeIds: committedProbes(folder).map(({ probe }) => probe.probeId),
      };
      return null;
    },
    afterVerdict: (context) => runTrialSets({ ...context, snapshot, started }),
  });
}

/** One arm of the clean controls' qualification: the evidence, or a stop with the exit its failure maps to. */
async function qualificationArm({ contract, registry, workspace, stop, directory, log, signal }) {
  const { port } = await registry.createProbePort({ cwd: workspace.root, projectRoot: workspace.root });
  try {
    return await runArm({ contract, port: hostEnvironmentPort({ port, registry }), registry, label: 'baseline', signal });
  } catch (error) {
    writeJson(path.join(directory, 'fault.json'), {
      phase: 'baseline-pass',
      workspace: workspace.label,
      code: typeof error?.code === 'string' ? error.code : null,
      message: String(error?.message ?? error),
      steps: error?.steps ?? [],
    });
    log(`the clean controls' baseline arm could not run: ${error?.message ?? error}`);
    throw stop({
      stage: 'qualification',
      exitCode: error?.code === DENIAL_FAULT ? 10 : 12,
      message: `the clean controls' baseline arm ${error?.code === DENIAL_FAULT ? 'was denied by the registry' : 'could not run'}: ${error?.message ?? error}`,
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
  runDirectory,
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
      directory: path.join(runDirectory, 'qualification', 'clean'),
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
    const evidenceFile = path.join(runDirectory, 'qualification', probe.probeId, 'baseline-pass.json');
    writeJson(evidenceFile, {
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
            : `${file}: the clean control's baseline does not pass (its oracles are ${verdict}), so it cannot qualify; the evidence is in ${path.relative(folder, evidenceFile)}`,
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
        baselinePassEvidence: referenceTo(folder, evidenceFile, engine.digestBytes),
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
 * One trial of one arm in a workspace of its own: the mutated arm's mutation
 * applied and held to the digest the qualification measured, the plan run
 * once with `evaluator-chosen` observations, and every probe on the arm
 * judged. Its evidence goes to `trials/<arm>/trial-<n>.json`.
 */
async function runTrial({ arm, trialIndex, contract, registry, pristine, make, discard, policy, engine, runDirectory, stop, signal }) {
  const label = `trial-${arm.slug}-${trialIndex}`;
  const evidenceFile = path.join(runDirectory, 'trials', arm.slug, `trial-${trialIndex}.json`);
  const workspace = make(label, pristine);
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
    const { port } = await registry.createProbePort({ cwd: workspace.root, projectRoot: workspace.root });
    const began = Date.now();
    let executed;
    try {
      executed = await runArm({
        contract,
        port: hostEnvironmentPort({ port, registry }),
        registry,
        label: `trial-${trialIndex}`,
        provenance: 'evaluator-chosen',
        signal,
      });
    } catch (error) {
      writeJson(evidenceFile, {
        conditionArm: arm.conditionArm,
        trialIndex,
        workspace: label,
        fault: {
          code: typeof error?.code === 'string' ? error.code : null,
          message: String(error?.message ?? error),
          request: error?.request === undefined ? null : persistableRequest(error.request),
        },
        steps: error?.steps ?? [],
      });
      const denied = error?.code === DENIAL_FAULT;
      throw stop({
        stage: 'trial',
        exitCode: denied ? 10 : 12,
        message: `${label} ${denied ? 'was denied by the registry' : 'yields no record'}: ${error?.message ?? error}`,
      });
    }
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
    writeJson(evidenceFile, {
      conditionArm: arm.conditionArm,
      trialIndex,
      workspace: label,
      elapsedMs,
      oracles: anyJudgment.oracles,
      steps: executed.steps,
    });
    const mounts = [
      `${workspace.kind} ${label}`,
      ...workspace.provisioned.map((entry) => `read-only ${label}/${posix(path.relative(workspace.root, entry))}`),
    ];
    const toolCalls = executed.steps.map((step) => `${step.request.interfaceId}/${step.request.executable}`);
    return { trialIndex, evidenceFile, stepObservations: executed.stepObservations, judgments, elapsedMs, mounts, toolCalls };
  } finally {
    discard(workspace);
  }
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
  const { folder, evaluation, contract, registry, qualified, routesByMutation, engine, validate, invocationId, runDirectory, run } =
    context;
  const { writeRun, treeUnchanged, outcome, stop, log, snapshot } = context;
  const startedAt = context.started;

  const cleanControls = await qualifyCleanControls(context);
  treeUnchanged('qualification');

  const arms = [];
  if (cleanControls.length > 0)
    arms.push({ conditionArm: 'clean', slug: 'clean', mutation: null, mutatedDigest: null, probes: cleanControls });
  for (const mutationId of [...routesByMutation.keys()].sort()) {
    const seededOn = qualified.filter((entry) => entry.mutation.mutationId === mutationId);
    arms.push({
      conditionArm: `mutated:${mutationId}`,
      slug: `mutated-${mutationId}`,
      mutation: seededOn[0].mutation,
      mutatedDigest: seededOn[0].mutatedDigest,
      probes: seededOn.map((entry) => entry.probe),
    });
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
  const unarmed = snapshot.probeIds.filter((probeId) => !armed.has(probeId));
  if (unarmed.length > 0) {
    throw stop({
      stage: 'trial',
      exitCode: 12,
      message: `no arm ran for ${unarmed.join(', ')}, so the run cannot score every probe it holds`,
    });
  }

  const failures = (kind, problems) => {
    if (problems.length > 0) {
      throw stop({
        stage: 'trial',
        exitCode: 12,
        message: `the runtime built a ${kind} that does not meet eval-quality's published schema: ${problems.join('; ')}`,
      });
    }
  };

  const sealedBrief = readJson(path.join(runDirectory, 'sealed-evaluator-brief.json'));
  const sealedBriefDigest = engine.digestArtifact(sealedBrief, 'SealedEvaluatorBrief');
  const compiledContract = readJson(path.join(runDirectory, 'eval-contract.json'));
  const contractDigest = engine.digestArtifact(compiledContract, 'EvalContract');
  const { conditions } = snapshot;
  const tools = registry.entries.map((entry) => `${entry.interfaceId}/${entry.executable}`).sort();
  const configuration = evaluatorConfiguration({
    evaluatorIdentity: EVALUATOR_IDENTITY,
    modelSnapshot: conditions?.modelSnapshot ?? 'none',
    sealedBriefDigest,
    systemPromptDigest: conditions?.systemPromptDigest ?? engine.digestBytes(new Uint8Array(0)),
    toolInventory: tools,
    permissionInventory: [],
    decodingParameters: {},
    budgets: contract.budgets,
    seed: null,
  });
  failures('EvaluatorConfiguration', await validate('evaluator-configuration', configuration));
  const configurationDigest = engine.digestArtifact(configuration, 'EvaluatorConfiguration');
  writeArtifact(engine, path.join(runDirectory, 'evaluator-configuration.json'), configuration, 'EvaluatorConfiguration');

  const stepCeilingMs = (contract.interactionPlan ?? []).reduce((total, step) => {
    const operation = (contract.permittedInterfaces ?? [])
      .flatMap((iface) => iface.operations ?? [])
      .find((candidate) => candidate.operationId === step.operationId);
    const interfaceId = (contract.permittedInterfaces ?? []).find((iface) => (iface.operations ?? []).includes(operation))?.logicalId;
    return total + (registry.targetFor(interfaceId, operation?.invocation?.executable)?.maxElapsedMs ?? 0);
  }, 0);
  const planSteps = (contract.interactionPlan ?? []).length;

  const trialSets = [];
  for (const arm of arms) {
    for (const probe of arm.probes) {
      const recommendation = setRecommendation(arm.trials.map((trial) => trial.judgments[probe.probeId]));
      const directory = path.join(runDirectory, 'trial-sets', probe.probeId);
      const runId = `${invocationId}-${probe.probeId}`;
      const mounts = arm.trials.flatMap((trial) => trial.mounts);
      const manifest = isolationManifest({
        runId,
        contractId: contract.contractId,
        conditionArm: arm.conditionArm,
        modelSnapshot: configuration.modelSnapshot,
        systemPromptDigest: configuration.systemPromptDigest,
        contractDigest,
        evaluatorConfigurationDigest: configurationDigest,
        workspaceIdentity: `${evaluation.evaluationId} ${arm.conditionArm}`,
        allowedMounts: mounts,
        observedMounts: mounts,
        toolAllowlist: tools,
        observedToolCalls: [...new Set(arm.trials.flatMap((trial) => trial.toolCalls))].sort(),
        resourceCeilings: {
          maxToolCalls: Math.max(1, planSteps * trialCount),
          maxInputTokens: UNBOUNDED,
          maxOutputTokens: UNBOUNDED,
          maxWallClockMinutes: Math.max(stepCeilingMs * trialCount, 1) / 60_000,
          maxCostUsd: String(UNBOUNDED),
        },
        actualResourceUse: {
          toolCalls: arm.trials.reduce((total, trial) => total + trial.toolCalls.length, 0),
          inputTokens: 0,
          outputTokens: 0,
          wallClockSeconds: arm.trials.reduce((total, trial) => total + trial.elapsedMs, 0) / 1000,
          costUsd: '0',
        },
        forbiddenInputNote: FORBIDDEN_INPUT_NOTE,
      });
      failures('IsolationManifest', await validate('isolation-manifest', manifest));
      const manifestFile = path.join(directory, 'isolation-manifest.json');
      writeArtifact(engine, manifestFile, manifest, 'IsolationManifest');
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
          observations: Object.values(trial.stepObservations).sort((a, b) => a.sequence - b.sequence),
          actionsArtifact: referenceTo(folder, trial.evidenceFile, engine.digestBytes),
          isolationManifestArtifact: referenceTo(folder, manifestFile, engine.digestBytes),
          resourceUse: {
            toolCalls: trial.toolCalls.length,
            inputTokens: 0,
            outputTokens: 0,
            wallClockSeconds: trial.elapsedMs / 1000,
            costUsd: '0',
          },
        });
        failures('SealedRunRecord', await validate('sealed-run-record', record));
        const recordFile = path.join(directory, `record-${trial.trialIndex}.json`);
        writeArtifact(engine, recordFile, record, 'SealedRunRecord');
        records.push(posix(path.relative(runDirectory, recordFile)));
      }
      const probeFile = path.join(runDirectory, 'probes', `${probe.probeId}.probe.json`);
      writeJson(probeFile, probe);
      trialSets.push({
        probeId: probe.probeId,
        runId,
        conditionArm: arm.conditionArm,
        probe: posix(path.relative(runDirectory, probeFile)),
        records,
        isolationManifest: posix(path.relative(runDirectory, manifestFile)),
      });
    }
  }

  const policyFile = path.join(runDirectory, 'scoring-policy.json');
  fs.writeFileSync(policyFile, snapshot.policyBytes);
  const corpusDigest = await corpusDigestOf(snapshot.index);
  // The bytes `score` reads, digested as written, so it can hold the run directory to what the run sealed.
  const bytesDigest = (file) => engine.digestBytes(fs.readFileSync(file));
  const artifacts = {
    evaluatorConfiguration: bytesDigest(path.join(runDirectory, 'evaluator-configuration.json')),
    preflightVerdict: bytesDigest(path.join(runDirectory, 'preflight-verdict.json')),
    probes: Object.fromEntries(trialSets.map((set) => [set.probeId, bytesDigest(path.join(runDirectory, ...set.probe.split('/')))])),
  };
  Object.assign(run, {
    artifacts,
    contractDigest,
    corpusDigest,
    policyDigest: engine.digestBytes(snapshot.policyBytes),
    sealedBriefDigest,
    evaluatorConfigurationDigest: configurationDigest,
    runner: registry.entries.map((entry) => ({ interfaceId: entry.interfaceId, executable: entry.executable, target: entry.target })),
    evaluator: { kind: 'deterministic', identity: EVALUATOR_IDENTITY },
    model: { modelSnapshot: configuration.modelSnapshot, systemPromptDigest: configuration.systemPromptDigest },
    trials: { perArm: trialCount, arms: arms.map((arm) => arm.conditionArm) },
    trialCount,
    startedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    completed: true,
  });
  writeRun();
  writeJson(path.join(runDirectory, TRIAL_SETS_NAME), {
    schemaVersion: TRIAL_SETS_SCHEMA_VERSION,
    invocationId,
    corpusDigest,
    contract: 'eval-contract.json',
    policy: 'scoring-policy.json',
    preflightVerdict: 'preflight-verdict.json',
    evaluatorConfiguration: 'evaluator-configuration.json',
    trialSets,
  });
  return outcome({
    stage: 'trial',
    exitCode: 0,
    message: `${trialSets.length} trial set(s) of ${trialCount} trial(s) sealed over ${arms.map((arm) => arm.conditionArm).join(', ')}; score them with tea-evaluate score --run ${invocationId}`,
  });
}

module.exports = { EVALUATOR_IDENTITY, TRIAL_SETS_NAME, TRIAL_SETS_SCHEMA_VERSION, runRunCommand, setRecommendation };
