/**
 * The score inputs of a sealed run, held (Story 1.68, AD-6, AD-7, AD-12).
 *
 * `tea-evaluate score` hands the eval-quality CLI the paths of a run's files.
 * A target process left alive in a run that opted out of file-system
 * confinement can rewrite one of them after the input check and before or
 * during the engine's read, so the engine would judge bytes the check never
 * saw. This module is the one place that names those inputs and holds what the
 * check accepted:
 *
 *   - `holdScoreInputs` reads each input once, as a regular file opened without
 *     following a link, digests the bytes with the engine's `digestBytes` and
 *     keeps them in memory for the whole command. The check parses these bytes
 *     and compares their digests with the ones `run.json` recorded, so what it
 *     accepted and what it holds are one read.
 *   - `changedSince` reads every input again after an engine call and names the
 *     first one that changed, stopped being a regular file or appeared (a
 *     manifest absent at the check and present afterwards counts).
 *   - `reproduce` scores the held bytes in process, the way the CLI scores a
 *     probe, and returns what the CLI should have done with them: the artifact
 *     bytes it stages (null when none), the exit it takes and the diagnostic
 *     lines it prints. The caller compares them with the call and can only
 *     refuse a mismatch: the CLI still decides every enforced verdict, and this
 *     result never becomes an exit code, a verdict or an artifact (AD-6,
 *     amended 2026-10-01).
 *
 * The enumeration lives here once, so a later engine call routes through the
 * same hold.
 * `holdAttemptInputs` (Story 1.69) holds the inputs of one evaluator attempt's score call the same way.
 * It reads each through the run directory writer, which holds it to the digest the runtime wrote.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { BEHAVIOR_ID, named, oraclesListed, sameOracles } = require('./partition');

/** The exits `eval-quality score` takes outside a verdict: a structural failure, a runtime fault and a usage error. */
const STRUCTURAL_EXIT = 4;
const FAULT_EXIT = 5;
const USAGE_EXIT = 64;
/** Every diagnostic line of the eval-quality CLI starts with this. */
const DIAGNOSTIC_PREFIX = 'eval-quality: ';

/** The run directory's files that have one fixed name: the compiled contract, the policy, the preflight verdict and the evaluator configuration. */
const RUN_FILES = Object.freeze({
  contract: 'eval-contract.json',
  policy: 'scoring-policy.json',
  preflightVerdict: 'preflight-verdict.json',
  evaluatorConfiguration: 'evaluator-configuration.json',
});

/** A held input that is not what the runtime wrote (Story 1.69); the message names the file. */
class AttemptInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AttemptInputError';
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

/**
 * Every file the engine reads for the run's score calls, with the digest
 * `run.json` recorded for it (undefined when it recorded none) and what the
 * file is called in a finding.
 *
 * A path the index names in two roles (as the contract and as the policy, say)
 * is listed once, under its first role, with the other role's name in
 * `aliases`; no file can be sealed as two kinds of input, and the check
 * reports it.
 *
 * @returns {Array<{ relative: string, file: string, kind: string, expected: string | undefined, what: string, aliases: string[] }>}
 */
function scoreInputList({ runDirectory, index, record }) {
  const recorded = record.artifacts ?? {};
  const inputs = [];
  const listed = new Map();
  const add = (kind, relative, expected, what) => {
    const first = listed.get(relative);
    if (first !== undefined) {
      if (first.kind !== kind) first.aliases.push(what);
      return;
    }
    const input = { relative, file: path.join(runDirectory, ...relative.split('/')), kind, expected, what, aliases: [] };
    listed.set(relative, input);
    inputs.push(input);
  };
  add('contract', index.contract, recorded.contract, 'the compiled contract');
  add('preflight', index.preflightVerdict, recorded.preflightVerdict, 'the preflight verdict');
  add('configuration', index.evaluatorConfiguration, recorded.evaluatorConfiguration, 'the evaluator configuration');
  add('policy', index.policy, record.policyDigest, 'the policy the run used');
  for (const set of index.trialSets) {
    add('probe', set.probe, recorded.probes?.[set.probeId], `probe ${set.probeId}`);
    for (const relative of set.records) add('record', relative, recorded.records?.[relative], `a record of ${set.probeId}`);
    add('manifest', set.isolationManifest, recorded.isolationManifests?.[set.probeId], `the isolation manifest of ${set.probeId}`);
  }
  return inputs;
}

/** What `designate` answers when a probe asks the engine for no oracle of its own. */
const NO_DESIGNATION = Object.freeze({ oracleId: null, problem: null });

/** What the held inputs of one `score` command are: the bytes the input check accepted. */
class HeldInputs {
  #engine;
  #read;
  #accepted;
  #designate;

  /**
   * @param {object} options
   * @param {((relative: string) => Buffer) | null} [options.read] reads a held input again after a call.
   *   Null reads the input's file as a regular file.
   *   An evaluator attempt's inputs are read through the run directory writer.
   * @param {string} [options.accepted] what a held file was accepted as, for the message of a file that cannot be read again
   * @param {(probe: object) => { oracleId: string|null, problem: string|null, listed?: string[]|null }} [options.designate] the oracle a probe asks
   *   `eval-quality score --designated-oracle` for (Story 1.110): `partition.js` `bothViewDesignation`, which names an oracle only for
   *   a probe of a both run under a `partitionPlan` whose behavior the both view lists with several. The CLI call's arguments and the
   *   in-process score both read it through `designation`, so they cannot disagree.
   */
  constructor({
    engine,
    index,
    entries,
    read = null,
    accepted = 'the regular file the input check accepted',
    designate = () => NO_DESIGNATION,
  }) {
    this.#engine = engine;
    this.#read = read;
    this.#accepted = accepted;
    this.#designate = designate;
    this.index = index;
    this.entries = new Map(entries.map((entry) => [entry.relative, entry]));
  }

  /** The held entry of a run-relative path, or undefined when that path is no score input. */
  lookup(relative) {
    return this.entries.get(relative);
  }

  /**
   * What one trial set's probe designates (Story 1.110), read from the held probe: the oracle the CLI call is handed and the in-process
   * score is given, or `oracleId: null` for neither. `problem` names a probe the contract cannot place, and a probe that cannot be read
   * designates nothing here, since the input check reports that file itself.
   *
   * @returns {{ oracleId: string|null, problem: string|null }}
   */
  designation(set) {
    let probe;
    try {
      probe = this.json(set.probe);
    } catch {
      return NO_DESIGNATION;
    }
    return this.#designate(probe);
  }

  /**
   * A finding for each trial set whose designation cannot be made, or whose behavior the folder's both view lists with other oracles
   * than the contract this run sealed does, where that can change the designation. The sealed contract of a both run is the both view
   * the run compiled. A sealed list of several oracles may have been designated one, so a folder that lists it differently would score
   * the probe under an oracle the run never held or leave it undesignated; a folder that designates an oracle the sealed list does not
   * hold is refused too. A sealed list of exactly one oracle is designated by the engine from the sealed contract whatever the folder
   * says, so a folder that changed such a behavior is the stale-baseline rule's to report.
   *
   * @returns {Array<{ relative: string, message: string }>}
   */
  designationFindings() {
    const findings = [];
    let contract = null;
    try {
      contract = this.json(this.index.contract);
    } catch {
      // The contract's own finding comes from the input check.
    }
    for (const set of this.index.trialSets) {
      const { oracleId, problem, listed } = this.designation(set);
      // A problem every probe shares (the folder's views cannot be derived) is reported once.
      if (problem !== null && !findings.some((entry) => entry.message === problem))
        findings.push({ relative: set.probe, message: problem });
      if (problem !== null || listed === undefined || contract === null) continue;
      const behaviorId = this.json(set.probe)?.behaviorId;
      const sealed = oraclesListed(contract, behaviorId);
      if (sameOracles(listed, sealed)) continue;
      // A list the sealed contract holds with exactly one oracle is designated by the engine from the sealed contract whatever the
      // folder says, so only a folder that designates an oracle or a sealed list of several (which may have designated one) can differ.
      if (oracleId === null && !(Array.isArray(sealed) && sealed.length > 1)) continue;
      findings.push({
        relative: set.probe,
        message: `names ${named(behaviorId, BEHAVIOR_ID, 'a behavior')}, whose oracles the evaluation folder's both view lists differently from the contract this run sealed; run the evaluation again`,
      });
    }
    return findings;
  }

  /** A finding for each path the index names in two roles, in listing order. */
  aliasFindings() {
    return [...this.entries.values()].flatMap((entry) =>
      entry.aliases.map((other) => ({
        relative: entry.relative,
        message: `is named as both ${entry.what} and ${other}, and no file is sealed as two inputs`,
      })),
    );
  }

  /** The held entry of a run-relative path; a path that is not a score input is a caller bug. */
  entry(relative) {
    const entry = this.entries.get(relative);
    if (entry === undefined) throw new Error(`${relative} is not a score input of this run`);
    return entry;
  }

  /**
   * The arguments of the `eval-quality score` call over one trial set's held inputs, in the order every call of the runtime
   * gives them, each path spelled by `pathOf`; the isolation manifest is named only when the hold found one.
   *
   * @param {{ pathOf: (relative: string) => string, set: object, out: string }} options
   * @returns {string[]}
   */
  scoreArguments({ pathOf, set, out }) {
    const args = [];
    for (const record of set.records) args.push('--record', pathOf(record));
    args.push(
      '--contract',
      pathOf(this.index.contract),
      '--probe',
      pathOf(set.probe),
      '--preflight-verdict',
      pathOf(this.index.preflightVerdict),
      '--policy',
      pathOf(this.index.policy),
      '--corpus-digest',
      this.index.corpusDigest,
    );
    if (this.exists(set.isolationManifest)) args.push('--isolation-manifest', pathOf(set.isolationManifest));
    args.push('--evaluator-configuration', pathOf(this.index.evaluatorConfiguration));
    const { oracleId } = this.designation(set);
    if (oracleId !== null) args.push('--designated-oracle', oracleId);
    args.push('--out', out);
    return args;
  }

  /** Whether anything was there at the check (a missing file is absent); the engine is handed a manifest only when there was. */
  exists(relative) {
    return this.entry(relative).exists;
  }

  /** The held bytes parsed as JSON; throws the read or parse error the check reports. */
  json(relative) {
    const entry = this.entry(relative);
    if (entry.bytes === null) throw new Error(entry.error);
    return JSON.parse(entry.bytes.toString('utf8'));
  }

  /** A finding for a held file whose bytes are not the ones `run.json` recorded, or null (an absent file is the schema check's to report). */
  anchorFinding(relative) {
    const entry = this.entry(relative);
    if (!entry.exists) return null;
    if (entry.expected === undefined) return `has no digest in run.json, so it is not a file the run sealed as ${entry.what}`;
    if (entry.bytes === null) return `${entry.error}, so it is not ${entry.what} the run sealed`;
    return entry.digest === entry.expected
      ? null
      : `digests to ${entry.digest}, not the ${entry.expected} run.json recorded for ${entry.what}`;
  }

  /**
   * The first held input that is no longer what the check accepted, read again
   * now: `{ relative, message }`, or null when every input is unchanged.
   */
  changedSince() {
    for (const entry of this.entries.values()) {
      if (entry.bytes === null) {
        if (entry.exists) continue;
        try {
          fs.lstatSync(entry.file);
        } catch {
          continue;
        }
        return { relative: entry.relative, message: 'appeared after the input check, which found no file there' };
      }
      let bytes;
      try {
        bytes = this.#read === null ? regularFileBytes(entry.file) : this.#read(entry.relative);
      } catch (error) {
        return { relative: entry.relative, message: `can no longer be read as ${this.#accepted}: ${error.message}` };
      }
      const digest = this.#engine.digestBytes(bytes);
      if (digest !== entry.digest) {
        return {
          relative: entry.relative,
          message: `changed after the input check: it digests to ${digest}, not the ${entry.digest} the check accepted`,
        };
      }
    }
    return null;
  }

  /**
   * What `eval-quality score` does with the held inputs of one trial set,
   * scored in process the way the CLI scores a probe (no private manifest, no
   * corpus root): the artifact bytes it would stage (null when none), the exit
   * it would take, and the `eval-quality: ` diagnostic lines its result would
   * print (null when the library refused the inputs, whose rendering is the
   * CLI's own). The held bytes are the only source: nothing is read from the
   * run directory. The caller compares and refuses; none of this becomes a
   * verdict, an exit code or an artifact of `score`.
   *
   * @returns {Promise<{ artifact: Buffer | null, exitCode: number, lines: string[] | null }>}
   */
  async reproduce(set) {
    const records = set.records.map((relative) => this.json(relative));
    // The CLI refuses a private-storage manifest reference without a corpus root before it scores (a usage error, no artifact).
    if (records.some((sealed) => sealed?.isolationManifestArtifact?.storage === 'private')) {
      return { artifact: null, exitCode: USAGE_EXIT, lines: null };
    }
    const { oracleId } = this.designation(set);
    try {
      const { artifact, ladder, qualification } = await this.#engine.runScore({
        record: records,
        manifest: this.exists(set.isolationManifest) ? this.json(set.isolationManifest) : null,
        configuration: this.json(this.index.evaluatorConfiguration),
        contract: this.json(this.index.contract),
        probe: this.json(set.probe),
        preflightVerdict: this.json(this.index.preflightVerdict),
        // The CLI reads its policy through the engine's lexical scanner, which refuses a repeated key.
        policy: this.#engine.scanJson(this.entry(this.index.policy).bytes.toString('utf8'), 'ScoringPolicy'),
        privateManifest: null,
        corpusDigest: this.index.corpusDigest,
        ...(oracleId === null ? {} : { designatedOracleId: oracleId }),
        port: undefined,
        signal: new AbortController().signal,
      });
      const lines = qualification.failures.map(
        (failure) => `${DIAGNOSTIC_PREFIX}${failure.code}: ${failure.artifactPath}: ${failure.detail}`,
      );
      if (ladder.verdict === null) lines.push(...ladder.basis.map((reason) => `${DIAGNOSTIC_PREFIX}invalid: ${reason}`));
      return {
        artifact: artifact === null ? null : Buffer.from(this.#engine.serializeArtifact(artifact, 'EvidenceArtifact'), 'utf8'),
        exitCode: ladder.exitCode,
        lines,
      };
    } catch (error) {
      // The library refused the held inputs as the CLI does: a structural failure is exit 4, a fault and a defect exit 5.
      return { artifact: null, exitCode: error instanceof this.#engine.StructuralFailure ? STRUCTURAL_EXIT : FAULT_EXIT, lines: null };
    }
  }

  /**
   * What `eval-quality aggregate-strength` does with the persisted evidence artifacts of an invocation, its floors copy
   * and the held policy (Story 1.45, 1.68): the aggregate bytes it stages (null when it refuses) and the exit it
   * takes, 0 for an aggregate, 4 for a refused set, 5 for a fault in its inputs. The CLI reads all three inputs through
   * the engine's lexical scanner; so does this. The caller compares and refuses; nothing here becomes an aggregate.
   *
   * @param {{ evidence: Buffer[], floors: Buffer }} bytes the evidence files in trial-set order and the floors copy
   * @returns {{ aggregate: Buffer | null, exitCode: number }}
   */
  reproduceAggregate({ evidence, floors }) {
    try {
      const aggregate = this.#engine.aggregateStrength({
        evidence: evidence.map((bytes) => this.#engine.scanJson(bytes.toString('utf8'), 'EvidenceArtifact')),
        floors: this.#engine.scanJson(floors.toString('utf8'), 'StrengthFloors'),
        policy: this.#engine.scanJson(this.entry(this.index.policy).bytes.toString('utf8'), 'ScoringPolicy'),
      });
      return { aggregate: Buffer.from(this.#engine.serializeArtifact(aggregate, 'StrengthAggregate'), 'utf8'), exitCode: 0 };
    } catch (error) {
      // A refused set is a structural failure to the CLI; a fault in an input and a defect are exit 5.
      const refused = error instanceof this.#engine.AggregationRefusal || error instanceof this.#engine.StructuralFailure;
      return { aggregate: null, exitCode: refused ? STRUCTURAL_EXIT : FAULT_EXIT };
    }
  }
}

/**
 * Reads every score input of the run once and holds it.
 *
 * @param {object} options
 * @param {string} options.runDirectory
 * @param {object} options.index the parsed `trial-sets.json`
 * @param {object} options.record the parsed `run.json`
 * @param {{ digestBytes: (bytes: Buffer) => string }} options.engine
 * @param {(probe: object) => { oracleId: string|null, problem: string|null, listed?: string[]|null }} [options.designate] see `HeldInputs`
 * @returns {HeldInputs}
 */
function holdScoreInputs({ runDirectory, index, record, engine, designate }) {
  const entries = scoreInputList({ runDirectory, index, record }).map((input) => {
    try {
      const bytes = regularFileBytes(input.file);
      return { ...input, exists: true, bytes, error: null, digest: engine.digestBytes(bytes) };
    } catch (error) {
      // Presence comes from the one open that reads the bytes: a second look could disagree with it. Only a missing
      // file is absent; a link, a FIFO or any other entry there is present and is a finding.
      return { ...input, exists: error.code !== 'ENOENT', bytes: null, error: error.message, digest: null };
    }
  });
  return new HeldInputs({ engine, index, entries, designate });
}

/**
 * The inputs of one evaluator attempt's `eval-quality score` call (Story 1.69), read once and held.
 * They are the attempt's records and isolation manifest, the probe, and the run's contract, policy, preflight verdict and evaluator configuration.
 * `read` is the run directory writer's `read`, which refuses a file that is not the bytes the runtime wrote.
 * What is held is what the runtime wrote, and the check after the call reads each input the same way.
 * A qualification has no `trial-sets.json` yet, so the index `reproduce` reads is built here from the names the run gives its files.
 * The list is built by `scoreInputList` with no run directory and no `run.json` record: paths stay run-relative, and the digests come from the writer.
 *
 * @param {object} options
 * @param {(relative: string) => Buffer} options.read
 * @param {{ digestBytes: (bytes: Buffer) => string }} options.engine
 * @param {string} options.corpusDigest
 * @param {string} options.probeId
 * @param {{ records: string[], manifestFile: string }} options.set the attempt's sealed set: its record files and isolation manifest, run-relative
 * @param {(probe: object) => { oracleId: string|null, problem: string|null, listed?: string[]|null }} [options.designate] see `HeldInputs`
 * @returns {HeldInputs}
 * @throws {AttemptInputError} naming the first input that is not what the runtime wrote
 */
function holdAttemptInputs({ read, engine, corpusDigest, probeId, set, designate }) {
  const index = {
    ...RUN_FILES,
    corpusDigest,
    trialSets: [{ probeId, probe: attemptProbeFile(probeId), records: set.records, isolationManifest: set.manifestFile }],
  };
  const entries = scoreInputList({ runDirectory: '', index, record: {} }).map((input) => {
    let bytes;
    try {
      bytes = read(input.relative);
    } catch (error) {
      throw new AttemptInputError(`${input.relative} is not what the runtime wrote: ${error.message}`);
    }
    return { ...input, exists: true, bytes, error: null, digest: engine.digestBytes(bytes) };
  });
  return new HeldInputs({ engine, index, entries, read, accepted: 'the file the runtime wrote', designate });
}

/** The probe file a run writes for `probeId`. */
function attemptProbeFile(probeId) {
  return `probes/${probeId}.probe.json`;
}

module.exports = {
  AttemptInputError,
  DIAGNOSTIC_PREFIX,
  HeldInputs,
  RUN_FILES,
  attemptProbeFile,
  holdAttemptInputs,
  holdScoreInputs,
  regularFileBytes,
  scoreInputList,
};
