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
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** The exits `eval-quality score` takes outside a verdict: a structural failure, a runtime fault and a usage error. */
const STRUCTURAL_EXIT = 4;
const FAULT_EXIT = 5;
const USAGE_EXIT = 64;
const DIAGNOSTIC_PREFIX = 'eval-quality: ';

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

/** What the held inputs of one `score` command are: the bytes the input check accepted. */
class HeldInputs {
  #engine;

  constructor({ engine, index, entries }) {
    this.#engine = engine;
    this.index = index;
    this.entries = new Map(entries.map((entry) => [entry.relative, entry]));
  }

  /** The held entry of a run-relative path, or undefined when that path is no score input. */
  lookup(relative) {
    return this.entries.get(relative);
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
        bytes = regularFileBytes(entry.file);
      } catch (error) {
        return {
          relative: entry.relative,
          message: `can no longer be read as the regular file the input check accepted: ${error.message}`,
        };
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
 * @returns {HeldInputs}
 */
function holdScoreInputs({ runDirectory, index, record, engine }) {
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
  return new HeldInputs({ engine, index, entries });
}

module.exports = { HeldInputs, holdScoreInputs, regularFileBytes, scoreInputList };
