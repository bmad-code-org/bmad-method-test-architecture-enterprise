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
 * 12, as does any trial that cannot run. A stopped run holds no
 * `trial-sets.json`, so there is nothing to score.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { hostEnvironmentPort, persistableRequest, runArm } = require('./arm');
const { corpusDigestOf } = require('./corpus-index');
const { expectedSchemaVersion } = require('./engine');
const { evaluateOracles, judgeTrial, oraclesOfBehaviors } = require('./evaluator');
const { QualificationError, applyReplaceExact } = require('./mutation');
const { PreflightOutcome, admissionRefusal, armVerdict, readJson, referenceTo, runPipeline } = require('./preflight');
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

/**
 * What the runtime does to withhold the forbidden inputs, and no more: it
 * hands the target a workspace without the evaluation folder and requests
 * that carry the plan's literals, and it does not sandbox the target's file
 * system (Story 1.31).
 */
const FORBIDDEN_INPUT_NOTE =
  "Withheld from what the runtime hands the target: each trial runs in a disposable workspace that leaves out the evaluation folder, and every request carries only the interaction plan's literal bindings. The runtime does not sandbox the target's file system, so a target that searches for the evaluation folder can reach it.";

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
async function qualificationArm({ contract, registry, workspace, stop, writer, directory, log, signal }) {
  const { port } = await registry.createProbePort({ cwd: workspace.root, projectRoot: workspace.root });
  try {
    return await runArm({ contract, port: hostEnvironmentPort({ port, registry }), registry, label: 'baseline', signal });
  } catch (error) {
    writer.writeJson(`${directory}/fault.json`, {
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
 * One trial of one arm in a workspace of its own: the mutated arm's mutation
 * applied and held to the digest the qualification measured, the plan run
 * once with `evaluator-chosen` observations, and every probe on the arm
 * judged. Its evidence goes to `trials/<arm>/trial-<n>.json`.
 */
async function runTrial({ arm, trialIndex, contract, registry, pristine, make, discard, policy, engine, writer, stop, signal }) {
  const label = `trial-${arm.slug}-${trialIndex}`;
  const evidenceFile = `trials/${arm.slug}/trial-${trialIndex}.json`;
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
      writer.writeJson(evidenceFile, {
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
    writer.writeJson(evidenceFile, {
      conditionArm: arm.conditionArm,
      trialIndex,
      workspace: label,
      elapsedMs,
      oracles: anyJudgment.oracles,
      steps: executed.steps,
    });
    const mounts = [
      `${workspace.kind} ${label}`,
      ...workspace.provisioned.map((entry) => `read-only ${label}/${path.relative(workspace.root, entry).split(path.sep).join('/')}`),
    ];
    // The commands the runtime ran for the plan, each an observed call; what the target itself opened or reached is not observed.
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
  const { folder, evaluation, contract, registry, qualified, routesByMutation, engine, validate, invocationId, writer, run, sealed } =
    context;
  const { writeRun, treeUnchanged, retractUnlessSealed, markSealed, outcome, stop, log, snapshot } = context;
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
  // Every file the trial sets cite or copy (the contract, the sealed brief, the
  // preflight verdict, each trial's evidence) must hold the bytes the runtime
  // wrote, and the run directory nothing else, before any trial set is written.
  writer.verify('after the trials');

  const failures = (kind, problems) => {
    if (problems.length > 0) {
      throw stop({
        stage: 'trial',
        exitCode: 12,
        message: `the runtime built a ${kind} that does not meet eval-quality's published schema: ${problems.join('; ')}`,
      });
    }
  };

  // The digests of the compiled contract and the sealed brief as the stages
  // wrote them, taken before any target ran.
  if (sealed === null) {
    throw stop({
      stage: 'trial',
      exitCode: 12,
      message: 'the engine stages wrote no compiled contract or sealed brief, so no trial set can name them',
    });
  }
  const { contractDigest, sealedBriefDigest } = sealed;
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
  writeArtifact(engine, writer, 'evaluator-configuration.json', configuration, 'EvaluatorConfiguration');

  const stepCeilingMs = (contract.interactionPlan ?? []).reduce((total, step) => {
    const operation = (contract.permittedInterfaces ?? [])
      .flatMap((iface) => iface.operations ?? [])
      .find((candidate) => candidate.operationId === step.operationId);
    const interfaceId = (contract.permittedInterfaces ?? []).find((iface) => (iface.operations ?? []).includes(operation))?.logicalId;
    return total + (registry.targetFor(interfaceId, operation?.invocation?.executable)?.maxElapsedMs ?? 0);
  }, 0);
  const planSteps = (contract.interactionPlan ?? []).length;
  // The digest of the bytes the runtime wrote to a run-directory file, which `score` holds each file to.
  const bytesDigest = (file) => engine.digestBytes(writer.read(file));

  const trialSets = [];
  const recordDigests = {};
  const manifestDigests = {};
  for (const arm of arms) {
    for (const probe of arm.probes) {
      const recommendation = setRecommendation(arm.trials.map((trial) => trial.judgments[probe.probeId]));
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
          observations: Object.values(trial.stepObservations).sort((a, b) => a.sequence - b.sequence),
          actionsArtifact: referenceTo(folder, writer, trial.evidenceFile, engine.digestBytes),
          isolationManifestArtifact: referenceTo(folder, writer, manifestFile, engine.digestBytes),
          resourceUse: {
            toolCalls: trial.toolCalls.length,
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
      // A seeded probe's file is the preflight's own; a clean control's is written here.
      const probeFile = `probes/${probe.probeId}.probe.json`;
      const probeBytes = Buffer.from(`${JSON.stringify(probe, null, 2)}\n`);
      if (!writer.has(probeFile)) writer.write(probeFile, probeBytes);
      else if (!writer.read(probeFile).equals(probeBytes)) {
        throw stop({ stage: 'trial', exitCode: 12, message: `${probeFile} is not the probe the run qualified` });
      }
      trialSets.push({
        probeId: probe.probeId,
        runId,
        conditionArm: arm.conditionArm,
        probe: probeFile,
        records,
        isolationManifest: manifestFile,
      });
    }
  }

  writer.write('scoring-policy.json', snapshot.policyBytes);
  const corpusDigest = await corpusDigestOf(snapshot.index);
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
    message: `${trialSets.length} trial set(s) of ${trialCount} trial(s) sealed over ${arms.map((arm) => arm.conditionArm).join(', ')}; score them with tea-evaluate score --run ${invocationId}`,
  });
  // The project must be as it was, and the run directory exactly what the
  // runtime wrote, before run.json says completed; that write is the run's last.
  treeUnchanged('sealing', { record: false });
  writer.verify('after the trial sets were sealed');
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
    outcome: { stage: result.stage, exitCode: result.exitCode, message: result.message },
  });
  writeRun();
  markSealed();
  return result;
}

module.exports = { EVALUATOR_IDENTITY, FORBIDDEN_INPUT_NOTE, TRIAL_SETS_NAME, TRIAL_SETS_SCHEMA_VERSION, runRunCommand, setRecommendation };
