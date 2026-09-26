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
 * Before any engine call, every input is read from the run directory as a
 * regular file, opened without blocking and without following a link (a FIFO
 * or a link there is a finding, never waited on), and checked (exit 10 on any
 * finding, naming the file):
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
 * An isolation manifest that is absent is passed on as absent, never filled
 * in: eval-quality reads a trial set with none as Invalid.
 *
 * Then `eval-quality score` runs once per probe, with every trial's
 * `--record`, the set's `--isolation-manifest`, the run's
 * `--evaluator-configuration`, and `--out` naming the evidence artifact. Each
 * call's argv, exit code, stdout and stderr are written to
 * `scores/<scoreInvocationId>/<probeId>/score.json` in the run directory
 * whether or not an evidence artifact was emitted, since AD-10 classifies a
 * `score` exit 3 from those diagnostics and AD-12 lists them in the bundle.
 * A call that cannot run, is killed or exits with a code the CLI does not
 * document is recorded and the others still run; the command then exits 12.
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
const { newInvocationId, readJson, writeJson } = require('./preflight');
const { createArtifactValidator } = require('./records');
const { TRIAL_SETS_NAME } = require('./run');

const Ajv = AjvModule.default ?? AjvModule;

/** The exits a `score` call can pass through, most severe first. */
const SEVERITY = [64, 5, 4, 3, 2, 0];
const INFRASTRUCTURE = 12;
const WIRING = 64;
const AUTHORING = 10;

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

/** Opening for a read never waits on a FIFO and never follows a link. */
const READ_REGULAR = fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0) | (fs.constants.O_NOFOLLOW ?? 0);

/**
 * The bytes of `file`, which must be a regular file: it is opened without
 * blocking and without following a link, so a FIFO, a device or a link left
 * in the run directory is refused at once and never waited on.
 *
 * @returns {Buffer}
 */
function regularFileBytes(file) {
  let descriptor;
  try {
    descriptor = fs.openSync(file, READ_REGULAR);
  } catch (error) {
    if (error.code === 'ELOOP' || error.code === 'EMLINK') throw new Error('is a symbolic link, not a regular file the run wrote');
    throw error;
  }
  try {
    if (!fs.fstatSync(descriptor).isFile()) throw new Error('is not a regular file the run wrote');
    return fs.readFileSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
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

/** Every finding in the run directory's inputs, before any engine call. */
async function inputFindings({ folder, runDirectory, index, record, engine }) {
  const validate = createArtifactValidator();
  const findings = [];
  const add = (file, rule, message) => findings.push({ file, rule, message });
  const parsed = new Map();
  const read = async (relative, kind) => {
    const file = inRun(runDirectory, relative);
    if (parsed.has(file)) return parsed.get(file);
    let value = null;
    try {
      value = regularJson(file);
    } catch (error) {
      add(relative, 'json', `cannot be read as JSON: ${error.message}`);
    }
    if (value !== null) for (const problem of await validate(kind, value)) add(relative, 'engine-schema', problem);
    parsed.set(file, value);
    return value;
  };
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
    if (!fs.existsSync(file)) return `its ${what} ${reference.path} is not there`;
    let bytes;
    try {
      bytes = regularFileBytes(file);
    } catch (error) {
      return `its ${what} ${reference.path} ${error.message}`;
    }
    const actual = engine.digestBytes(bytes);
    return actual === reference.digest
      ? null
      : `its ${what} ${reference.path} digests to ${actual}, not the ${reference.digest} it records`;
  };
  const anchored = (relative, expected, what) => {
    const file = inRun(runDirectory, relative);
    if (!fs.existsSync(file)) return;
    if (expected === undefined) {
      add(relative, 'run-integrity', `has no digest in run.json, so it is not a file the run sealed as ${what}`);
      return;
    }
    let bytes;
    try {
      bytes = regularFileBytes(file);
    } catch (error) {
      add(relative, 'run-integrity', `${error.message}, so it is not ${what} the run sealed`);
      return;
    }
    const actual = engine.digestBytes(bytes);
    if (actual !== expected) add(relative, 'run-integrity', `digests to ${actual}, not the ${expected} run.json recorded for ${what}`);
  };
  const recorded = record.artifacts ?? {};
  // A records run's sets are an adopter harness's own records, copied unchanged: their run IDs, references and
  // digests are the harness's, and eval-quality judges their agreement; the run anchors their bytes all the same.
  const imported = record.evaluator?.kind === 'records';

  await read(index.contract, 'eval-contract');
  anchored(index.contract, recorded.contract, 'the compiled contract');
  await read(index.preflightVerdict, 'preflight-verdict');
  anchored(index.preflightVerdict, recorded.preflightVerdict, 'the preflight verdict');
  await read(index.evaluatorConfiguration, 'evaluator-configuration');
  anchored(index.evaluatorConfiguration, recorded.evaluatorConfiguration, 'the evaluator configuration');
  const policy = await read(index.policy, 'scoring-policy');
  if (policy !== null) anchored(index.policy, record.policyDigest, 'the policy the run used');
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
    anchored(set.probe, recorded.probes?.[set.probeId], `probe ${set.probeId}`);
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
      anchored(relative, recorded.records?.[relative], `a record of ${set.probeId}`);
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
      if (fs.existsSync(inRun(runDirectory, set.isolationManifest))) {
        const manifest = referenceProblem(
          sealed.isolationManifestArtifact,
          'isolation manifest',
          referencePath(folder, inRun(runDirectory, set.isolationManifest)),
        );
        if (manifest !== null) add(relative, 'run-integrity', manifest);
      }
    }
    if (fs.existsSync(inRun(runDirectory, set.isolationManifest))) {
      await read(set.isolationManifest, 'isolation-manifest');
      anchored(set.isolationManifest, recorded.isolationManifests?.[set.probeId], `the isolation manifest of ${set.probeId}`);
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
  const findings = await inputFindings({ folder, runDirectory, index, record: located.record, engine });
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

  const scoreInvocationId = newInvocationId();
  const scoreDirectory = path.join(runDirectory, 'scores', scoreInvocationId);
  fs.mkdirSync(scoreDirectory, { recursive: true });
  const scores = [];
  let stageFailed = false;
  try {
    for (const set of index.trialSets) {
      const directory = path.join(scoreDirectory, set.probeId);
      const evidence = path.join(directory, 'evidence-artifact.json');
      fs.mkdirSync(directory, { recursive: true });
      const args = [];
      for (const relative of set.records) args.push('--record', inRun(runDirectory, relative));
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
      const manifest = inRun(runDirectory, set.isolationManifest);
      if (fs.existsSync(manifest)) args.push('--isolation-manifest', manifest);
      else
        log(
          `${set.probeId}: the isolation manifest ${set.isolationManifest} is absent and is not supplied; eval-quality reads the trial set as Invalid`,
        );
      args.push('--evaluator-configuration', inRun(runDirectory, index.evaluatorConfiguration), '--out', evidence);
      const recordPath = path.join(directory, 'score.json');
      let exitCode = null;
      let failure = null;
      try {
        const result = runEngineStage('score', args, { runDirectory: scoreDirectory, recordPath, env, log });
        ({ exitCode } = result);
        log(`${set.probeId}: eval-quality score exited ${exitCode}`);
        // An Invalid result emits no artifact; its reasons are the stage's own stderr lines.
        for (const line of result.stderr.split('\n').filter((text) => text.startsWith('eval-quality: invalid:')))
          log(`${set.probeId}: ${line}`);
      } catch (error) {
        if (!(error instanceof EngineStageError)) throw error;
        stageFailed = true;
        failure = error.message;
        log(`${set.probeId}: ${error.message}`);
      }
      scores.push({
        probeId: set.probeId,
        exitCode,
        failure,
        record: path.relative(folder, recordPath),
        evidence: fs.existsSync(evidence) ? path.relative(folder, evidence) : null,
      });
    }
  } finally {
    writeJson(path.join(scoreDirectory, 'score.json'), {
      invocationId: scoreInvocationId,
      run: index.invocationId,
      exitCode: stageFailed ? INFRASTRUCTURE : combinedExit(scores.map((entry) => entry.exitCode)),
      scores,
      refused,
    });
  }
  const exitCode = stageFailed ? INFRASTRUCTURE : combinedExit(scores.map((entry) => entry.exitCode));
  return new ScoreOutcome({
    exitCode,
    runDirectory,
    scores,
    message: stageFailed
      ? `an eval-quality score call could not run or exited with a code the CLI does not document; every call's record is in ${path.relative(folder, scoreDirectory)}`
      : `eval-quality score ran for ${scores.length} probe(s) of run ${index.invocationId}; each call's diagnostics and evidence are in ${path.relative(folder, scoreDirectory)}${refusedNote}`,
  });
}

module.exports = { SEVERITY, ScoreOutcome, combinedExit, runScoreCommand };
