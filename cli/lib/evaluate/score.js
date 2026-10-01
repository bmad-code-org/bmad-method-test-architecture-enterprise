/**
 * `tea-evaluate score`: every trial set a completed `tea-evaluate run` sealed,
 * scored by the eval-quality CLI (AD-6, AD-7, AD-10, AD-12).
 *
 * The run is `runs/<invocationId>/`, named by `--run` or, when none is named,
 * the most recent `run` invocation. A run that did not complete (its
 * `run.json` records how it stopped, or no end at all while it is still
 * running, and does not say `completed: true`) has nothing to score, and
 * neither has a `preflight` invocation: both exit 64, since the command was
 * pointed at nothing it can score.
 *
 * Before any engine call, every file the engine reads is read from the run
 * directory once, as a regular file opened without blocking and without
 * following a link (a FIFO or a link there is a finding, never waited on), and
 * held in memory (`score-inputs.js`, Story 1.68); the check parses and digests
 * those held bytes (exit 10 on any finding, naming the file), and the views are
 * built from them. The files a record's actions artifact names are read for
 * the digest check alone, and the engine reads none of them:
 *
 *   - `trial-sets.json` against the runtime's own schema, with each probe
 *     named once;
 *   - the compiled contract, the scoring policy, the preflight verdict, the
 *     evaluator configuration, and each set's probe, records and isolation
 *     manifest against the schema eval-quality publishes for it;
 *   - each set against the run: the index names the probes the run sealed,
 *     each once, and each set's records once; each set's `runId` is the one
 *     the run derived from its invocation and the probe; each probe file names
 *     its probe; every record carries the set's `runId` and arm and the run's
 *     contract, sealed brief and evaluator configuration digests; each
 *     record's evidence references are public, name files inside this run
 *     directory (its manifest reference the set's own manifest) and digest
 *     the files they name; and the record count, the corpus digest, and the
 *     digests of the compiled contract, the policy, the preflight verdict, the
 *     evaluator configuration, each probe file, each record and each
 *     isolation manifest are the ones `run.json` recorded, a file it recorded
 *     no digest for included.
 *
 * A `records` run's sets are an adopter harness's own records, copied into the
 * run byte for byte (AD-21): their run IDs, evidence references and digest
 * agreement are the harness's and eval-quality's to judge, so those checks
 * are left out and the index must name exactly the records the run copied;
 * every other check, the schemas and the digests `run.json` recorded
 * included, holds as for any run.
 *
 * An isolation manifest that is absent at the check is passed on as absent,
 * never filled in: eval-quality reads a trial set with none as Invalid.
 *
 * Then `eval-quality score` runs once per probe, with every trial's
 * `--record`, the set's `--isolation-manifest`, the run's
 * `--evaluator-configuration`, and `--out` naming a private staging file the
 * runtime owns outside the evaluation folder (removed after the call). Each
 * call's argv, exit code, stdout and stderr, the argv exactly as it ran, are
 * written to `scores/<scoreInvocationId>/<probeId>/score.json` in the run
 * directory whether or not an evidence artifact was emitted, since AD-10
 * classifies a `score` exit 3 from those diagnostics and AD-12 lists them in
 * the bundle. A staged artifact that meets its published schema, names the run's
 * corpus digest and carries an outcome for this probe passes the copy check;
 * one that fails it is not copied, and the command exits 12. It is copied in as
 * `evidence-artifact.json` and read back only when the held inputs still stand
 * and reproduce it (Story 1.68):
 *
 *   - after the call every input is read and digested again, and the first one
 *     that changed or appeared since the check is named (exit 12, nothing copied);
 *   - the held bytes are scored in process the way the CLI scores a probe, and
 *     the staged file must equal the serialized result byte for byte (an absent
 *     staged file must match a result with no artifact), so a rewrite the
 *     engine read and a process then restored, and a well-formed artifact a
 *     process substituted, are refused (exit 12, nothing copied). The re-score
 *     compares and refuses; the CLI still decides every enforced verdict.
 *
 * A call that cannot run, is killed or exits with a code the CLI does not
 * document is recorded and the others still run; the command then exits 12.
 *
 * Every score output goes through the held-directory writer `run` uses
 * (`run-directory.js`, AD-7, AD-12). The run directory already exists, so the
 * writer attaches to it, adopts a real `scores` directory or creates it
 * exclusively, and creates the invocation and probe directories exclusively.
 * A link or another entry planted at one of them, a directory a process swaps
 * for a link or moves while `score` runs, or a file planted where an output is
 * about to land stops the write before a byte leaves the run directory, and
 * the command exits 12.
 *
 * Otherwise the command's exit is one of the calls' own exits, passed through:
 * the most severe across the probes, in the order 64, 5, 4, 3, 2, 0 (a usage
 * error, a runtime fault, a structural failure, Invalid, FAIL, success).
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const AjvModule = require('ajv/dist/2020');

const { loadEngine } = require('./engine');
const { EngineStageError, runEngineStage } = require('./engine-cli');
const { newInvocationId, readJson } = require('./preflight');
const { createArtifactValidator } = require('./records');
const { RunDirectory, RunDirectoryError } = require('./run-directory');
const { TRIAL_SETS_NAME } = require('./run');
const { holdScoreInputs, regularFileBytes } = require('./score-inputs');
const { makeScratchDirectory, releaseScratchDirectory, removeScratchDirectory } = require('./workspace');
const { writePartitionViews } = require('./partition');
const { writeInterpretation } = require('./interpret');

const Ajv = AjvModule.default ?? AjvModule;

/** The exits a `score` call can pass through, most severe first. */
const SEVERITY = [64, 5, 4, 3, 2, 0];
const OPERATION_PHASES_NAME = 'operation-phases.json';
const INFRASTRUCTURE = 12;
const WIRING = 64;
const AUTHORING = 10;

/** Every diagnostic line of the eval-quality CLI starts with this. */
const DIAGNOSTIC_PREFIX = 'eval-quality: ';

const TRIAL_SETS_SCHEMA = path.join(__dirname, 'schemas', 'trial-sets.schema.json');

/** The outcome of one `tea-evaluate score`. */
class ScoreOutcome {
  constructor({ exitCode, message, findings = [], runDirectory = null, scores = [] }) {
    this.exitCode = exitCode;
    this.message = message;
    this.findings = findings;
    this.runDirectory = runDirectory;
    this.scores = scores;
  }
}

/** `file` parsed as JSON, read by `regularFileBytes`. */
function regularJson(file) {
  return JSON.parse(regularFileBytes(file).toString('utf8'));
}

/** A run directory's `run.json`, or null when it has none that parses. */
function runRecordOf(directory) {
  try {
    return regularJson(path.join(directory, 'run.json'));
  } catch {
    return null;
  }
}

/** The run directory `--run` names, or the most recent `run` invocation; a wiring message when there is none to score. */
function runDirectoryFor(folder, invocationId) {
  const runs = path.join(folder, 'runs');
  let directory;
  if (invocationId === undefined) {
    const candidates = fs.existsSync(runs)
      ? fs
          .readdirSync(runs)
          .filter((name) => runRecordOf(path.join(runs, name))?.command === 'run')
          .sort()
      : [];
    if (candidates.length === 0) return { wiring: `${runs} holds no tea-evaluate run to score; run tea-evaluate run first` };
    directory = path.join(runs, candidates.at(-1));
  } else {
    if (path.basename(invocationId) !== invocationId || invocationId === '.' || invocationId === '..') {
      return { wiring: `--run ${JSON.stringify(invocationId)} is not a run identifier` };
    }
    directory = path.join(runs, invocationId);
    const record = runRecordOf(directory);
    if (record === null) return { wiring: `--run ${invocationId} names no run under ${runs}` };
    if (record.command !== 'run') {
      return { wiring: `--run ${invocationId} names a tea-evaluate ${record.command} invocation, which seals no trial set; name a run` };
    }
  }
  const record = runRecordOf(directory);
  if (record?.completed !== true || !fs.existsSync(path.join(directory, TRIAL_SETS_NAME))) {
    let how;
    if (record?.outcome === undefined) how = 'it records no end, so it is still running or was stopped before it could record one';
    else if (record.outcome.stage === 'signal') how = `it was stopped by ${record.outcome.signal}`;
    else
      how = `it stopped at its ${record.outcome.stage} stage with exit ${record.outcome.exitCode}: ${String(record.outcome.message).split('\n')[0]}`;
    return {
      wiring: `the run ${path.basename(directory)} did not complete and sealed nothing to score (${how}); run tea-evaluate run again, or name a completed run with --run`,
      directory,
    };
  }
  return { directory, record };
}

/** A path `trial-sets.json` names, resolved in the run directory; the schema has already refused `..` and absolute paths. */
function inRun(runDirectory, relative) {
  return path.join(runDirectory, ...relative.split('/'));
}

/** `file`'s path relative to the evaluation folder, in POSIX form, as an artifact reference spells it. */
function referencePath(folder, file) {
  return path.relative(folder, file).split(path.sep).join('/');
}

/** The most severe of the exits, by `SEVERITY`. */
function combinedExit(codes) {
  return SEVERITY.find((code) => codes.includes(code)) ?? 0;
}

function phaseEntries(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? JSON.stringify(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))
    : null;
}

/** A run snapshots the checked phase map before taking records. Refuse old or edited snapshots. */
function phaseSnapshotProblems(run, contract) {
  const phases = run.operationPhases;
  if (phases === null || typeof phases !== 'object' || Array.isArray(phases)) return ['run.json carries no operationPhases snapshot'];
  const problems = [];
  const interfaces = new Map();
  for (const iface of contract.permittedInterfaces) {
    for (const operation of iface.operations) {
      const id = operation.operationId;
      const previous = interfaces.get(id);
      if (previous !== undefined && previous !== iface.logicalId)
        problems.push(`operation ${id} occurs on interfaces ${previous} and ${iface.logicalId}`);
      interfaces.set(id, iface.logicalId);
      if (!Object.hasOwn(phases, id)) problems.push(`operation ${id} has no phase in run.json`);
    }
  }
  for (const [id, phase] of Object.entries(phases)) {
    if (!interfaces.has(id)) problems.push(`run.json classifies undeclared operation ${id}`);
    if (phase !== 'process' && phase !== 'outcome') problems.push(`run.json gives operation ${id} unknown phase ${JSON.stringify(phase)}`);
  }
  return problems;
}

/** Every finding in the held inputs of the run directory, before any engine call. */
async function inputFindings({ folder, runDirectory, index, record, engine, held }) {
  const validate = createArtifactValidator();
  const findings = [];
  const add = (file, rule, message) => findings.push({ file, rule, message });
  const parsed = new Map();
  const read = async (relative, kind) => {
    if (parsed.has(relative)) return parsed.get(relative);
    let value = null;
    try {
      value = held.json(relative);
    } catch (error) {
      add(relative, 'json', `cannot be read as JSON: ${error.message}`);
    }
    if (value !== null) for (const problem of await validate(kind, value)) add(relative, 'engine-schema', problem);
    parsed.set(relative, value);
    return value;
  };
  for (const { relative, message } of held.aliasFindings()) add(relative, 'run-integrity', message);
  const runPrefix = `${referencePath(folder, runDirectory)}/`;
  const referenceProblem = (reference, what, expectedPath = null) => {
    if (reference?.storage !== 'public' || typeof reference.path !== 'string') {
      return `its ${what} is not a public reference to a file the run wrote`;
    }
    if (!reference.path.startsWith(runPrefix) || reference.path.split('/').includes('..')) {
      return `its ${what} ${reference.path} lies outside this run directory, ${runPrefix}`;
    }
    if (expectedPath !== null && reference.path !== expectedPath) return `its ${what} ${reference.path} is not its set's ${expectedPath}`;
    const file = path.join(folder, ...reference.path.split('/'));
    // A file the score reads is digested from the bytes held for it, never read a second time.
    const heldEntry = held.lookup(path.relative(runDirectory, file).split(path.sep).join('/'));
    if (heldEntry === undefined ? !fs.existsSync(file) : !heldEntry.exists) return `its ${what} ${reference.path} is not there`;
    let bytes;
    try {
      bytes = heldEntry === undefined ? regularFileBytes(file) : heldEntry.bytes;
      if (bytes === null) throw new Error(heldEntry.error);
    } catch (error) {
      return `its ${what} ${reference.path} ${error.message}`;
    }
    const actual = engine.digestBytes(bytes);
    return actual === reference.digest
      ? null
      : `its ${what} ${reference.path} digests to ${actual}, not the ${reference.digest} it records`;
  };
  const anchored = (relative) => {
    const problem = held.anchorFinding(relative);
    if (problem !== null) add(relative, 'run-integrity', problem);
  };
  const recorded = record.artifacts ?? {};
  // A records run's sets are an adopter harness's own records, copied unchanged: their run IDs, references and
  // digests are the harness's, and eval-quality judges their agreement; the run anchors their bytes all the same.
  const imported = record.evaluator?.kind === 'records';

  await read(index.contract, 'eval-contract');
  anchored(index.contract);
  let phaseSnapshot;
  try {
    const bytes = regularFileBytes(inRun(runDirectory, OPERATION_PHASES_NAME));
    phaseSnapshot = JSON.parse(bytes.toString('utf8'));
    const actual = engine.digestBytes(bytes);
    if (actual !== recorded.operationPhases)
      add(
        OPERATION_PHASES_NAME,
        'run-integrity',
        `digests to ${actual}, not the ${recorded.operationPhases ?? 'missing digest'} run.json recorded`,
      );
  } catch (error) {
    add(OPERATION_PHASES_NAME, 'run-integrity', `cannot be read as a regular JSON file: ${error.message}`);
  }
  if (phaseSnapshot !== undefined && phaseEntries(phaseSnapshot) !== phaseEntries(record.operationPhases))
    add('run.json', 'operation-phases', `operationPhases differs from the sealed ${OPERATION_PHASES_NAME}`);
  await read(index.preflightVerdict, 'preflight-verdict');
  anchored(index.preflightVerdict);
  await read(index.evaluatorConfiguration, 'evaluator-configuration');
  anchored(index.evaluatorConfiguration);
  const policy = await read(index.policy, 'scoring-policy');
  if (policy !== null) anchored(index.policy);
  if (index.corpusDigest !== record.corpusDigest) {
    add(TRIAL_SETS_NAME, 'run-integrity', `names corpusDigest ${index.corpusDigest}, not the ${record.corpusDigest} run.json recorded`);
  }
  if (index.invocationId !== record.invocationId) {
    add(TRIAL_SETS_NAME, 'run-integrity', `names invocation ${index.invocationId}, not the run's own ${record.invocationId}`);
  }
  const sealedProbes = Object.keys(recorded.probes ?? {}).sort();
  const indexedProbes = index.trialSets.map((set) => set.probeId).sort();
  if (JSON.stringify(indexedProbes) !== JSON.stringify(sealedProbes)) {
    add(
      TRIAL_SETS_NAME,
      'run-integrity',
      `holds trial sets for ${JSON.stringify(indexedProbes)}, and the run sealed ${JSON.stringify(sealedProbes)}`,
    );
  }
  const seen = new Set();
  const seenRecords = new Set();
  for (const set of index.trialSets) {
    if (seen.has(set.probeId)) add(TRIAL_SETS_NAME, 'run-integrity', `names probe ${set.probeId} in more than one trial set`);
    seen.add(set.probeId);
    // AD-7: a set's runId is derived from this invocation and its probe, so a set another run sealed cannot pass as this one's.
    const derived = `${record.invocationId}-${set.probeId}`;
    if (!imported && set.runId !== derived) {
      add(TRIAL_SETS_NAME, 'run-integrity', `names runId ${set.runId} for ${set.probeId}, not the ${derived} this run derives`);
    }
    const probe = await read(set.probe, 'probe');
    if (probe !== null && probe.probeId !== set.probeId)
      add(set.probe, 'run-integrity', `is probe ${probe.probeId}, not the ${set.probeId} its trial set scores`);
    anchored(set.probe);
    if (imported) {
      // The harness chose how many records a set holds; the index must name exactly the ones the run copied.
      const copied = Object.keys(recorded.records ?? {})
        .filter((relative) => relative.startsWith(`trial-sets/${set.probeId}/`))
        .sort();
      if (JSON.stringify([...set.records].sort()) !== JSON.stringify(copied)) {
        add(
          TRIAL_SETS_NAME,
          'run-integrity',
          `names records ${JSON.stringify(set.records)} for ${set.probeId}, and the run copied ${JSON.stringify(copied)}`,
        );
      }
    } else if (set.records.length !== record.trialCount) {
      add(
        TRIAL_SETS_NAME,
        'run-integrity',
        `holds ${set.records.length} record(s) for ${set.probeId}, not the ${record.trialCount} trial(s) run.json recorded`,
      );
    }
    for (const relative of set.records) {
      if (seenRecords.has(relative)) add(TRIAL_SETS_NAME, 'run-integrity', `names the record ${relative} more than once`);
      seenRecords.add(relative);
      const sealed = await read(relative, 'sealed-run-record');
      anchored(relative);
      if (sealed !== null && Array.isArray(sealed.observations) && Array.isArray(sealed.findings)) {
        const observedIds = new Set(sealed.observations.map((observation) => observation.observationId));
        if (record.operationPhases && typeof record.operationPhases === 'object') {
          for (const observation of sealed.observations) {
            if (!Object.hasOwn(record.operationPhases, observation.operationId))
              add(
                relative,
                'operation-phases',
                `observation ${observation.observationId} names unclassified operation ${observation.operationId}`,
              );
          }
        }
        for (const finding of sealed.findings) {
          if (!Array.isArray(finding.observationIds) || finding.observationIds.length === 0)
            add(relative, 'citation', `finding ${finding.findingId} cites no observation`);
          if (!Array.isArray(finding.quotedEvidence) || finding.quotedEvidence.length === 0)
            add(relative, 'citation', `finding ${finding.findingId} quotes no evidence`);
          for (const id of finding.observationIds ?? []) {
            if (!observedIds.has(id))
              add(relative, 'citation', `finding ${finding.findingId} cites observation ${id}, which this record does not contain`);
          }
        }
      }
      if (sealed === null || imported) continue;
      if (sealed.runId !== set.runId || sealed.conditionArm !== set.conditionArm) {
        add(
          relative,
          'run-integrity',
          `carries runId ${sealed.runId} and arm ${sealed.conditionArm}, not its set's ${set.runId} and ${set.conditionArm}`,
        );
      }
      for (const [field, expected] of [
        ['sealedBriefDigest', record.sealedBriefDigest],
        ['contractDigest', record.contractDigest],
        ['evaluatorConfigurationDigest', record.evaluatorConfigurationDigest],
      ]) {
        if (sealed[field] !== expected)
          add(relative, 'run-integrity', `carries ${field} ${sealed[field]}, not the ${expected} run.json recorded`);
      }
      const actions = referenceProblem(sealed.actionsArtifact, 'actions artifact');
      if (actions !== null) add(relative, 'run-integrity', actions);
      // An absent manifest reaches eval-quality as absent; one that is there must be the one the records name.
      if (held.exists(set.isolationManifest)) {
        const manifest = referenceProblem(
          sealed.isolationManifestArtifact,
          'isolation manifest',
          referencePath(folder, inRun(runDirectory, set.isolationManifest)),
        );
        if (manifest !== null) add(relative, 'run-integrity', manifest);
      }
    }
    if (held.exists(set.isolationManifest)) {
      await read(set.isolationManifest, 'isolation-manifest');
      anchored(set.isolationManifest);
    }
  }
  return findings;
}

/**
 * Runs `tea-evaluate score` over one evaluation folder.
 *
 * @param {string} folder the resolved evaluation folder
 * @param {object} [options]
 * @param {string} [options.run] the invocation identifier of the run to score
 * @param {NodeJS.ProcessEnv} [options.env] the environment the engine CLI runs under
 * @param {(line: string) => void} [options.log]
 * @returns {Promise<ScoreOutcome>}
 */
async function runScoreCommand(folder, { run: invocationId, env = process.env, log = () => {} } = {}) {
  const located = runDirectoryFor(folder, invocationId);
  if (located.wiring !== undefined)
    return new ScoreOutcome({ exitCode: WIRING, message: located.wiring, runDirectory: located.directory ?? null });
  const runDirectory = located.directory;
  log(`scoring run ${path.basename(runDirectory)}`);

  let index;
  try {
    index = regularJson(path.join(runDirectory, TRIAL_SETS_NAME));
  } catch (error) {
    return new ScoreOutcome({
      exitCode: AUTHORING,
      runDirectory,
      findings: [{ file: TRIAL_SETS_NAME, rule: 'json', message: `cannot be read as JSON: ${error.message}` }],
      message: `${TRIAL_SETS_NAME} cannot be read; no score call ran`,
    });
  }
  const ajv = new Ajv({ strict: false, allErrors: true });
  const indexSchema = ajv.compile(readJson(TRIAL_SETS_SCHEMA));
  if (!indexSchema(index)) {
    const findings = [...new Set((indexSchema.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message}`))].map(
      (message) => ({
        file: TRIAL_SETS_NAME,
        rule: 'schema',
        message,
      }),
    );
    return new ScoreOutcome({
      exitCode: AUTHORING,
      runDirectory,
      findings,
      message: `${TRIAL_SETS_NAME} does not meet its schema; no score call ran`,
    });
  }

  const engine = await loadEngine();
  const held = holdScoreInputs({ runDirectory, index, record: located.record, engine });
  const findings = await inputFindings({ folder, runDirectory, index, record: located.record, engine, held });
  if (findings.length === 0) {
    const contract = held.json(index.contract);
    for (const message of phaseSnapshotProblems(located.record, contract))
      findings.push({ file: 'run.json', rule: 'operation-phases', message });
  }
  if (findings.length > 0) {
    return new ScoreOutcome({
      exitCode: AUTHORING,
      runDirectory,
      findings,
      message: `${findings.length} problem(s) in ${path.relative(folder, runDirectory)}'s artifacts; no score call ran`,
    });
  }

  // The probes the run refused (a historical probe with no revisions to address, or a deployment the registry does not
  // authorize) have no trial set; say so, never silently.
  const refused = (Array.isArray(located.record?.refused) ? located.record.refused : []).map(({ probeId, reason }) => ({
    probeId,
    reason,
  }));
  for (const { probeId, reason } of refused) log(`${probeId}: refused by the run, so not scored: ${reason}`);
  const refusedNote =
    refused.length === 0
      ? ''
      : `; ${refused.length} probe(s) the run refused are not scored: ${refused.map((entry) => entry.probeId).join(', ')}`;
  // A run that opted out of file-system confinement scores as any other, so its verdicts say its targets ran unconfined.
  const optedOut = located.record?.confinement === 'opt-out';
  const optedOutNote = optedOut
    ? '; the run opted out of file-system confinement (run.json records confinement "opt-out"), so its targets ran unconfined and could reach the evaluation folder'
    : '';
  if (optedOut) log('the run opted out of file-system confinement: its targets ran unconfined and could reach the evaluation folder');

  const scoreInvocationId = newInvocationId();
  const scoreRelative = `scores/${scoreInvocationId}`;
  let writer;
  try {
    writer = RunDirectory.attach(runDirectory);
    writer.adoptDirectory('scores');
    writer.ensureDirectory(scoreRelative);
  } catch (error) {
    writer?.close();
    if (!(error instanceof RunDirectoryError)) throw error;
    return new ScoreOutcome({
      exitCode: INFRASTRUCTURE,
      runDirectory,
      message: `score output cannot be created inside the run directory: ${error.message}`,
    });
  }
  const scratch = [];
  try {
    return await scoreProbes({
      folder,
      runDirectory,
      index,
      located,
      held,
      env,
      log,
      writer,
      scratch,
      scoreInvocationId,
      scoreRelative,
      refused,
      refusedNote,
      optedOutNote,
    });
  } finally {
    // A staging directory that could not be removed after its call is tried again here.
    while (scratch.length > 0) {
      try {
        removeScratchDirectory(scratch.pop());
      } catch {
        // It stays on disk under the system's temporary directory; the score's own result is already decided.
      }
    }
    writer.close();
  }
}

/** One probe's `eval-quality score` call, staged and copied in; the entry `score.json` and the views summarize it. */
async function scoreProbe({ folder, runDirectory, set, index, held, validate, env, log, writer, scratch, scoreRelative }) {
  const relative = `${scoreRelative}/${set.probeId}`;
  const recordRelative = `${relative}/score.json`;
  const evidenceRelative = `${relative}/evidence-artifact.json`;
  // The probe's directory is made, exclusively, before the engine runs, so an entry planted at it stops the probe unscored.
  writer.ensureDirectory(relative);
  const staging = makeScratchDirectory(scratch, 'tea-evaluate-score-');
  try {
    const produced = path.join(staging, 'evidence-artifact.json');
    const args = [];
    for (const record of set.records) args.push('--record', inRun(runDirectory, record));
    args.push(
      '--contract',
      inRun(runDirectory, index.contract),
      '--probe',
      inRun(runDirectory, set.probe),
      '--preflight-verdict',
      inRun(runDirectory, index.preflightVerdict),
      '--policy',
      inRun(runDirectory, index.policy),
      '--corpus-digest',
      index.corpusDigest,
    );
    // The manifest is supplied when the input check found it, and left out when it found none, whatever is there now.
    if (held.exists(set.isolationManifest)) args.push('--isolation-manifest', inRun(runDirectory, set.isolationManifest));
    else
      log(
        `${set.probeId}: the isolation manifest ${set.isolationManifest} is absent and is not supplied; eval-quality reads the trial set as Invalid`,
      );
    args.push('--evaluator-configuration', inRun(runDirectory, index.evaluatorConfiguration), '--out', produced);
    let exitCode = null;
    let stderr = '';
    let failure = null;
    let stageFailed = false;
    try {
      const result = runEngineStage('score', args, {
        runDirectory: writer.pathOf(scoreRelative),
        recordPath: writer.pathOf(recordRelative),
        writer,
        env,
        log,
      });
      ({ exitCode, stderr } = result);
      log(`${set.probeId}: eval-quality score exited ${exitCode}`);
      // An Invalid result emits no artifact; its reasons are the stage's own stderr lines.
      for (const reason of diagnosticBlocks(result.stderr).filter((text) => text.startsWith('eval-quality: invalid:')))
        log(`${set.probeId}: ${reason}`);
    } catch (error) {
      if (!(error instanceof EngineStageError)) throw error;
      stageFailed = true;
      failure = error.message;
      log(`${set.probeId}: ${error.message}`);
    }
    let evidence = null;
    let artifact = null;
    const staged = stagedArtifact(produced);
    if (staged.problem === undefined) {
      const problems = staged.bytes === null ? [] : await artifactProblems({ bytes: staged.bytes, set, index, validate });
      // A call that could not run, was killed or exited undocumented already fails the command and has no staged file to
      // compare; every other call is held to the inputs the check accepted.
      const refusal =
        problems.length > 0 || (failure !== null && staged.bytes === null)
          ? null
          : await heldRefusal({ held, set, staged, exitCode, stderr });
      if (problems.length > 0) {
        stageFailed = true;
        failure = failure === null ? `${set.probeId}: the staged evidence artifact fails the copy check: ${problems[0]}` : failure;
        log(`${set.probeId}: the staged evidence artifact fails the copy check (${problems.join('; ')}); it is not copied`);
      } else if (refusal !== null) {
        stageFailed = true;
        failure = failure === null ? `${set.probeId}: ${refusal}` : failure;
        log(`${set.probeId}: ${refusal}; nothing is copied`);
      } else if (staged.bytes !== null) {
        // Copied through the held directory and read back from it: the parsed artifact is the one that was written.
        writer.write(evidenceRelative, staged.bytes);
        const back = writer.read(evidenceRelative);
        if (!back.equals(staged.bytes)) throw new RunDirectoryError(`${evidenceRelative} does not hold the artifact eval-quality staged`);
        evidence = writer.pathOf(evidenceRelative);
        artifact = JSON.parse(back.toString('utf8'));
      }
    } else {
      stageFailed = true;
      failure = failure === null ? `${set.probeId}: the staged evidence artifact ${staged.problem}` : failure;
      log(`${set.probeId}: the staged evidence artifact ${staged.problem}; it is not copied`);
    }
    return {
      stageFailed,
      artifact,
      entry: {
        probeId: set.probeId,
        exitCode,
        failure,
        record: path.relative(folder, writer.pathOf(recordRelative)),
        evidence: evidence === null ? null : path.relative(folder, evidence),
      },
    };
  } finally {
    releaseScratchDirectory(scratch, staging);
  }
}

/** The lines of `text` that start an `eval-quality: ` diagnostic. */
function diagnosticLines(text) {
  return text.split('\n').filter((line) => line.startsWith(DIAGNOSTIC_PREFIX));
}

/** `text` as one string per `eval-quality: ` diagnostic, the lines that follow one (a newline inside its reason) kept with it. */
function diagnosticBlocks(text) {
  const blocks = [];
  for (const line of text.split('\n')) {
    if (line.startsWith(DIAGNOSTIC_PREFIX)) blocks.push(line);
    else if (blocks.length > 0) blocks[blocks.length - 1] += `\n${line}`;
  }
  return blocks.map((block) => block.trimEnd());
}

/**
 * Why a call's result is not the one the held inputs stand behind, or null (Story 1.68): an input changed or appeared
 * since the check (named first), or the call is not what the CLI does with the held bytes. That is the staged artifact
 * (byte for byte; an absent file must match a result with no artifact, whatever the call exited), then the call's exit,
 * then the `eval-quality: ` lines on its stderr that explain an Invalid result (AD-10 classifies an exit 3 from them),
 * when the library gives them. The comparison only refuses; it never decides.
 */
async function heldRefusal({ held, set, staged, exitCode, stderr }) {
  const changed = held.changedSince();
  if (changed !== null) return `${changed.relative} ${changed.message}`;
  const expected = await held.reproduce(set);
  if (expected.artifact === null) {
    if (staged.bytes !== null) return 'the staged evidence artifact is not the result of the verified inputs, which produce no artifact';
  } else if (staged.bytes === null) {
    return 'the call staged no evidence artifact, and the verified inputs produce one';
  } else if (!expected.artifact.equals(staged.bytes)) {
    return 'the staged evidence artifact differs from the one the verified inputs produce (an in-process score of the held bytes)';
  }
  // A call that could not run or was killed has no exit of its own to compare.
  if (exitCode !== null && exitCode !== expected.exitCode) {
    return `the call exited ${exitCode} where the verified inputs give ${expected.exitCode} (an in-process score of the held bytes)`;
  }
  if (expected.lines !== null && exitCode !== null) {
    // The CLI writes each line plus a newline and keeps any newline inside it (a mount path or a key can carry one), so
    // both sides go through the same split before the prefixed pieces are compared.
    const printed = diagnosticLines(stderr);
    if (JSON.stringify(printed) !== JSON.stringify(diagnosticLines(expected.lines.map((line) => `${line}\n`).join('')))) {
      return "the call's eval-quality diagnostics differ from those the verified inputs give (an in-process score of the held bytes)";
    }
  }
  return null;
}

/** The staged artifact's bytes (null when the call wrote none), read as a regular file without following a link. */
function stagedArtifact(file) {
  let stats;
  try {
    stats = fs.lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return { bytes: null };
    return { problem: `cannot be examined: ${error.message}` };
  }
  if (!stats.isFile()) return { problem: 'is a link or a non-file entry' };
  try {
    return { bytes: regularFileBytes(file) };
  } catch (error) {
    return { problem: `cannot be read: ${error.message}` };
  }
}

/** Why a staged artifact fails the copy check (published schema, the run's corpus digest, an outcome for the probe); empty when it passes. */
async function artifactProblems({ bytes, set, index, validate }) {
  let artifact;
  try {
    artifact = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    return [`is not JSON: ${error.message}`];
  }
  const problems = await validate('evidence-artifact', artifact);
  if (problems.length > 0) return [`fails its published schema: ${problems[0]}`];
  if (artifact.scoringVersionInputs?.corpusDigest !== index.corpusDigest) {
    return [`names corpus ${artifact.scoringVersionInputs?.corpusDigest}, not the run's ${index.corpusDigest}`];
  }
  if (!artifact.reducedProbeOutcomes?.some((outcome) => outcome.probeId === set.probeId)) return [`holds no outcome for ${set.probeId}`];
  return [];
}

async function scoreProbes({
  folder,
  runDirectory,
  index,
  located,
  held,
  env,
  log,
  writer,
  scratch,
  scoreInvocationId,
  scoreRelative,
  refused,
  refusedNote,
  optedOutNote,
}) {
  const validate = createArtifactValidator();
  const scores = [];
  const evidence = new Map();
  let stageFailed = false;
  let integrity = null;
  let unexpected = null;
  try {
    for (const set of index.trialSets) {
      const probe = await scoreProbe({ folder, runDirectory, set, index, held, validate, env, log, writer, scratch, scoreRelative });
      stageFailed ||= probe.stageFailed;
      scores.push(probe.entry);
      if (probe.artifact !== null) evidence.set(set.probeId, probe.artifact);
    }
  } catch (error) {
    if (error instanceof RunDirectoryError) integrity = error.message;
    else unexpected = error;
  }
  const exitCode = stageFailed || integrity !== null ? INFRASTRUCTURE : combinedExit(scores.map((entry) => entry.exitCode));
  try {
    writer.writeJson(`${scoreRelative}/score.json`, {
      invocationId: scoreInvocationId,
      run: index.invocationId,
      exitCode,
      scores,
      refused,
      confinement: located.record?.confinement ?? null,
    });
    if (integrity === null && unexpected === null) {
      writePartitionViews({
        writer,
        readInput: (relative) => held.json(relative),
        scoreInvocationId,
        trialSets: index.trialSets,
        evidence,
        heldOutProbes: located.record.heldOutProbes,
      });
      writeInterpretation({
        writer,
        readInput: (relative) => held.json(relative),
        scoreInvocationId,
        trialSets: index.trialSets,
        scores,
        evidence,
        contractPath: index.contract,
        operationPhases: located.record.operationPhases,
      });
    }
  } catch (error) {
    if (!(error instanceof RunDirectoryError)) throw error;
    integrity ??= error.message;
  }
  if (unexpected !== null) throw unexpected;
  if (integrity !== null) {
    return new ScoreOutcome({
      exitCode: INFRASTRUCTURE,
      runDirectory,
      scores,
      message: `score output was refused to keep it inside the run directory: ${integrity}`,
    });
  }
  return new ScoreOutcome({
    exitCode,
    runDirectory,
    scores,
    message: stageFailed
      ? `an eval-quality score call could not run, exited with a code the CLI does not document, staged an artifact that fails the copy check, or ran over inputs that changed or that its artifact does not reproduce; every call's record is in ${path.relative(folder, writer.pathOf(scoreRelative))}`
      : `eval-quality score ran for ${scores.length} probe(s) of run ${index.invocationId}; each call's diagnostics and evidence are in ${path.relative(folder, writer.pathOf(scoreRelative))}${refusedNote}${optedOutNote}`,
  });
}

module.exports = { SEVERITY, ScoreOutcome, combinedExit, runScoreCommand };
