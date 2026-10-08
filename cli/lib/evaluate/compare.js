/**
 * `tea-evaluate compare`: a run's evidence compared with the committed
 * `baseline/`, and `compare --accept`, the one command that writes `baseline/`
 * (AD-10, AD-12).
 *
 * The first half of this file is the comparison logic two of TeA's own test
 * helpers held, generalized into the runtime. Those helpers keep TeA's own data
 * and import the rest from here.
 *
 *   - `compareStoredResults` is a wrapper around eval-quality's own
 *     `compareDominance`, closing the one gap the package leaves to its caller.
 *     The package returns the same `'incomparable'` whether two results disagree
 *     on `comparabilityKey` (they do not measure the same scoring policy and
 *     probe set at all) or whether they agree and a genuine component-wise
 *     comparison finds no winner. A caller that treated that string as one of
 *     four ordinary verdicts would accept "not comparable in the first place" as
 *     a measured tie, so `refusalReason` checks `comparabilityKey` first and the
 *     refusal names both keys. The relation itself is the engine's; TeA computes
 *     no verdict or ordering.
 *   - `isComparableShaped` says whether a stored result carries the
 *     `ComparableResult` fields (`outcomes`, `strength`, `comparabilityKey`,
 *     `scoredProbeId`, `reducedProbeOutcomes`, `trials`). The last three arrived
 *     with `EvidenceArtifact` schema version 4, whose `compareDominance`
 *     recomputes each side's trial-set reduction from them before comparing: it
 *     dereferences `trials.completedAttempts`, `trials.invalidatedAttempts` and
 *     each reduced entry's `trialVotes` and `invalidatedAttempts`, so each must
 *     be an array. A result stored in the version 3 shape reads as not
 *     comparable and never reaches the package.
 *   - `versionRefusalReason` refuses two records measured by different installed
 *     engines: every result below the record was scored against that install, so
 *     a verdict across them is not a verdict about drift.
 *   - `dominanceBetween` is the dispatch: the relation between two stored
 *     results, or null when either lacks the `ComparableResult` shape.
 *
 * The second half is the command. Without `--accept` it compares the run's
 * per-probe evidence artifacts (the run's latest `scores/<scoreInvocationId>/`)
 * with the artifacts under `baseline/scores/` and reports one of three outcomes,
 * every one of them exit 0:
 *
 *   - `first-run`: there is no `baseline/` to compare with;
 *   - `refused`: the two sides do not measure the same thing. The partitions
 *     differ (a held-out run against a development baseline), the probe sets
 *     differ, a probe's `comparabilityKey` differs (read from the evidence
 *     artifacts, where eval-quality records it), or `evalQualityVersion` differs
 *     (read from `run.json`, since every artifact below it was scored by that
 *     install). A version refusal routes to `compare --accept`, which re-records
 *     the baseline on the new engine in a reviewed pull request;
 *   - `compared`: one engine relation per probe, the baseline as `a` and the run
 *     as `b`.
 *
 * A `baseline/` that is not the bytes `baseline/baseline.json` lists is none of
 * the three: before any of its evidence is read, `compare` exits 10 with one
 * `baseline-digest` finding for each file whose `digestBytes` differs from the
 * `files` map, each listed file that is missing and each unlisted file other
 * than `baseline.json` (`baseline-digests.js`, which `check` calls too).
 *
 * With `--accept` it replaces `baseline/` wholesale with a byte-identical
 * snapshot of the run. `baseline/` mirrors the run directory's relative paths,
 * so every digest `run.json` recorded still matches. The sealed records name
 * their actions artifacts and isolation manifests as `runs/<acceptedRun>/...`
 * paths and `score` refuses a reference outside the run directory it scores, so
 * a replay through `score` places the baseline's bytes at `runs/<acceptedRun>/`
 * (in a scratch copy of the evaluation folder).
 * No file is rewritten, since that would move the digests.
 * The runtime records neutral path forms at the source (`recorded-paths.js`), so
 * `run.json`, the observations and the score call records the copy holds name no
 * workspace, repository, staging directory or checkout of the machine that made
 * the run, and every digest was taken over those bytes. The refusal order is: no run, a run that did not
 * complete or a run with no score invocation (64); `dirty: true` (10, nothing
 * written); a probe with no evidence artifact in the latest score invocation, a
 * missing member, an entry that is not a regular file, a directory on the way
 * to a member that is a link, a latest `scores/<id>/score.json` that does not
 * name this run or records an exit or an aggregate `score` would refuse (12, 64,
 * a refused or mismatched aggregate), or any finding the input checks `score`
 * runs over the run would report (10, nothing written); then the copy.
 *
 * The copy is staged under `runs/.compare-staging/` (gitignored, on the same
 * file system as `baseline/`, so each rename stays atomic) and swapped in last,
 * so a refused or failed accept leaves the old `baseline/` untouched (12 on a
 * failure while staging or swapping). Nothing is staged inside the committed
 * evaluation folder, so an interrupted accept leaves no untracked entry there
 * for the next `run` to record as `dirty: true`. An accept interrupted between
 * its two renames leaves `baseline/` absent and the previous one under
 * `runs/.compare-staging/retired-*`. Plain `compare` is strictly read-only and
 * never restores or deletes: with `baseline/` absent and a retired copy present
 * it exits 10 naming the copy. `compare --accept` is the only writer. It holds
 * an exclusive lock (`runs/.compare-staging.lock`, one `mkdir`; an existing
 * entry makes a second accept exit 12, naming the pid the holder recorded when
 * it can be read, and saying to delete the directory when no accept is running,
 * since nothing decides a lock is stale or takes one over; a SIGINT or SIGTERM
 * removes the lock and exits 130 or 143, a SIGKILL leaves it) for its whole
 * sequence: it puts a retired baseline
 * back when `baseline/` is absent (a failed restore exits 12 naming where the
 * old baseline lies), deletes stale staging and retired directories, then
 * stages, swaps and cleans up.
 *
 * The members are the files a replay through `score` reads, taken from the run
 * directory by name: `run.json`, `trial-sets.json`, `contract.json`,
 * `eval-contract.json`, `sealed-evaluator-brief.json`, `scoring-policy.json`,
 * `evaluator-configuration.json`, `operation-phases.json`,
 * `preflight-verdict.json`, `probes.json`, `probes/`, `observations.json`,
 * `observations/`, `trial-sets/` (records and isolation manifests), the actions
 * artifact each record references (under `trials/`, since `score` refuses a
 * record whose actions artifact is absent and a replay needs it), the run's
 * `qualification/<probeId>/` files and the run's latest `scores/<id>/` subtree.
 * Nothing under `engine/`, `faults/`, `refused/`, `evaluator-qualification/`
 * and none of the derived views (`gap-view.json`, `interpretation.json`,
 * `partitions.json`) is copied, and no probe's bytes or evidence paths are
 * rewritten: the probe digests `run.json` anchors would stop matching.
 * `baseline/baseline.json` records the accepted run, its score invocation,
 * partition, engine version and corpus, contract and policy digests, a `files`
 * map of relative path to `digestBytes`, and each qualification file as a public
 * reference under `baseline/qualification/`, which `check`'s
 * `qualification-digest` rule verifies.
 *
 * Every file is read without blocking and without following a link and written
 * exclusively into a directory this command made, so a link or another
 * non-regular entry anywhere under the run's members or `baseline/` is refused,
 * exit 10, naming the entry.
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const AjvModule = require('ajv/dist/2020');

const { baselineDigestFindings } = require('./baseline-digests');
const { loadEngine } = require('./engine');
const { createArtifactValidator } = require('./records');
const { holdRunInputs, inputFindings, phaseSnapshotProblems, runDirectoryFor } = require('./score');
const { NOT_A_BASELINE, declaresKnownDefect } = require('./before-state');
const { regularFileBytes, scoreInputList } = require('./score-inputs');

const Ajv = AjvModule.default ?? AjvModule;

/** The runtime-owned schema of `baseline/baseline.json`; the manifest's version is read from it so the two cannot disagree. */
const BASELINE_SCHEMA = JSON.parse(fs.readFileSync(path.join(__dirname, 'schemas', 'baseline.schema.json'), 'utf8'));
const BASELINE_SCHEMA_VERSION = BASELINE_SCHEMA.properties.schemaVersion.const;

const WIRING = 64;
const AUTHORING = 10;
const INFRASTRUCTURE = 12;
const OK = 0;

const BASELINE = 'baseline';
const BASELINE_MANIFEST = 'baseline.json';
/** Under `runs/`, which `run` keeps out of the adopter's commits: an interrupted accept leaves nothing there for git to see. */
const SCRATCH = ['runs', '.compare-staging'];
/** The directory an accept holds from recovery through cleanup; one `mkdir` is the whole claim, and a `pid` file in it is information only. */
const LOCK = ['runs', '.compare-staging.lock'];
const LOCK_PID = 'pid';
const STAGING_PREFIX = 'staging-';
const RETIRED_PREFIX = 'retired-';
/** What a score invocation's own exit may be for the run to become a baseline: success, FAIL (a weak result) and Invalid. */
const ACCEPTED_SCORE_EXITS = new Set([0, 2, 3]);
/** A strength aggregate `score` could not copy: the engine refused it, it failed, or it disagreed with what `score` persisted. */
const REFUSED_AGGREGATES = new Set(['failed', 'refused', 'mismatch']);
const TRIAL_SETS_SCHEMA = path.join(__dirname, 'schemas', 'trial-sets.schema.json');
const SCORES = 'scores';
const EVIDENCE_NAME = 'evidence-artifact.json';
const TRIAL_SETS_NAME = 'trial-sets.json';

/** The run's files `score` reads, by name; each must be a regular file. */
const FILE_MEMBERS = [
  'run.json',
  TRIAL_SETS_NAME,
  'contract.json',
  'eval-contract.json',
  'sealed-evaluator-brief.json',
  'scoring-policy.json',
  'evaluator-configuration.json',
  'operation-phases.json',
  'preflight-verdict.json',
  'probes.json',
  'observations.json',
];
/** The run's directories `score` reads: always present, copied whole. */
const DIRECTORY_MEMBERS = ['probes', 'trial-sets'];
/** The run's directories copied whole when the run has them. */
const OPTIONAL_DIRECTORY_MEMBERS = ['observations', 'qualification'];

// ---------------------------------------------------------------------------
// The comparison logic (generalized from TeA's test helpers)

/**
 * `null` when both sides measure the same scoring-policy-and-probe-set, the
 * reason string otherwise.
 *
 * @param {{comparabilityKey: string}} a
 * @param {{comparabilityKey: string}} b
 * @returns {string | null}
 */
function refusalReason(a, b) {
  if (a.comparabilityKey === b.comparabilityKey) return null;
  return (
    `comparabilityKey differs (${a.comparabilityKey} vs ${b.comparabilityKey}): the two results do not ` +
    'measure the same scoring policy and probe set, so no relation between them is meaningful'
  );
}

/**
 * The `ComparableResult` slice one stored result carries.
 * @typedef {object} ComparableSlice
 * @property {object[]} outcomes
 * @property {object} strength
 * @property {string} comparabilityKey
 * @property {string|null} scoredProbeId
 * @property {object[]} reducedProbeOutcomes
 * @property {object} trials
 */

/**
 * @param {ComparableSlice} a
 * @param {ComparableSlice} b
 * @param {string} severityFloor
 * @returns {Promise<{ok: true, relation: string} | {ok: false, reason: string}>}
 */
async function compareStoredResults(a, b, severityFloor) {
  const reason = refusalReason(a, b);
  if (reason !== null) return { ok: false, reason };
  const { compareDominance } = await loadEngine();
  return { ok: true, relation: compareDominance(a, b, severityFloor) };
}

/**
 * Whether a stored result carries the `ComparableResult` shape. A structural
 * check rather than a schema check on purpose: a schema-valid `evalResultSchema`
 * record can never carry these keys (the schema is `.strict()`), so this is the
 * only test that can say yes the day a suite starts carrying them.
 *
 * @param {object} result
 * @returns {boolean}
 */
function isComparableShaped(result) {
  const isObject = (value) => value !== null && typeof value === 'object';
  return (
    Array.isArray(result?.outcomes) &&
    isObject(result?.strength) &&
    typeof result?.comparabilityKey === 'string' &&
    (result?.scoredProbeId === null || typeof result?.scoredProbeId === 'string') &&
    Array.isArray(result?.reducedProbeOutcomes) &&
    result.reducedProbeOutcomes.every(
      (entry) => isObject(entry) && Array.isArray(entry.trialVotes) && Array.isArray(entry.invalidatedAttempts),
    ) &&
    isObject(result?.trials) &&
    Array.isArray(result?.trials?.completedAttempts) &&
    Array.isArray(result?.trials?.invalidatedAttempts)
  );
}

/**
 * `null` when two records were measured by the same installed engine, the
 * refusal reason otherwise.
 *
 * @param {{evalQualityVersion: string}} previous
 * @param {{evalQualityVersion: string}} current
 * @returns {string | null}
 */
function versionRefusalReason(previous, current) {
  if (previous.evalQualityVersion === current.evalQualityVersion) return null;
  return (
    `eval-quality version differs (${previous.evalQualityVersion} vs ${current.evalQualityVersion}): the two runs were not measured ` +
    'by the same installed package, so no drift between them is meaningful'
  );
}

/**
 * The dominance relation between two stored results, when both carry the
 * `ComparableResult` shape, or `null` when either does not.
 *
 * @param {object} previous
 * @param {object} current
 * @param {string} severityFloor the scoring policy's declared floor
 * @returns {Promise<{ok: true, relation: string}|{ok: false, reason: string}|null>}
 */
async function dominanceBetween(previous, current, severityFloor) {
  if (!isComparableShaped(previous) || !isComparableShaped(current)) return null;
  return compareStoredResults(previous, current, severityFloor);
}

// ---------------------------------------------------------------------------
// The command

/** The outcome of one `tea-evaluate compare`. */
class CompareOutcome {
  constructor({ exitCode, message, findings = [], runDirectory = null, report = [], status = null, relations = [] }) {
    this.exitCode = exitCode;
    this.message = message;
    this.findings = findings;
    this.runDirectory = runDirectory;
    this.report = report;
    this.status = status;
    /** `compared` only: the engine's relation per probe, the baseline as `a` and the run as `b` (`tea-evaluate ci` reads them). */
    this.relations = relations;
  }
}

/** One finding as the CLI prints it. */
function finding(file, rule, message) {
  return { file, rule, message };
}

/** Why a read of `file` failed, in words a finding can carry. */
function readProblem(error) {
  return error?.code === undefined || error.code === 'ELOOP' || error.code === 'EMLINK' ? error.message : `${error.code}: ${error.message}`;
}

/** `text` as a relative path inside a directory, or null when it is empty, absolute or climbs. */
function safeRelative(text) {
  if (typeof text !== 'string' || text.length === 0 || text.includes('\\') || text.includes('\0')) return null;
  const parts = text.split('/');
  return parts.some((part) => part === '' || part === '.' || part === '..') ? null : text;
}

function absolute(root, relative) {
  return path.join(root, ...relative.split('/'));
}

/** `entry`'s `lstat`, null when there is none. */
function lstatOrNull(file) {
  try {
    return fs.lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * The first directory on the way down to `relative` (a file below `root`) that
 * is a link or a file, relative to `root`, or null when each one that exists is
 * a real directory. A link in the middle of a path is followed by every plain
 * read, so each directory above a file is held to `lstat` before the file is
 * read; one that is absent is reported where its file is read.
 */
function linkedDirectory(root, relative) {
  let current = '';
  for (const part of relative.split('/').slice(0, -1)) {
    current = current === '' ? part : `${current}/${part}`;
    const stats = lstatOrNull(absolute(root, current));
    if (stats === null) return null;
    if (!stats.isDirectory()) return current;
  }
  return null;
}

/** The finding for a directory `linkedDirectory` named. */
function linkedFinding(label, directory, rule) {
  return finding(`${label}${directory}`, rule, 'is a link or a file where a directory is required; nothing is followed');
}

/**
 * Every regular file under `root/relative`, passed to `onFile` as its path
 * relative to `root`. Only real directories are entered, so a link (a loop
 * included) is never followed; each entry that is neither a directory nor a
 * regular file is a finding that names it.
 */
function walkRegular(root, relative, onFile, findings, rule, label) {
  const directory = absolute(root, relative);
  let stats;
  let names;
  try {
    stats = fs.lstatSync(directory);
    if (stats.isDirectory()) names = fs.readdirSync(directory).sort();
  } catch (error) {
    findings.push(finding(`${label}${relative}`, rule, `cannot be examined: ${readProblem(error)}`));
    return;
  }
  if (!stats.isDirectory()) {
    findings.push(finding(`${label}${relative}`, rule, 'is a link or a file where a directory is required; nothing is followed'));
    return;
  }
  for (const name of names) {
    const child = `${relative}/${name}`;
    let entry;
    try {
      entry = fs.lstatSync(absolute(root, child));
    } catch (error) {
      findings.push(finding(`${label}${child}`, rule, `cannot be examined: ${readProblem(error)}`));
      continue;
    }
    if (entry.isDirectory()) walkRegular(root, child, onFile, findings, rule, label);
    else if (entry.isFile()) onFile(child);
    else findings.push(finding(`${label}${child}`, rule, 'is not a regular file or directory; no link is followed and none is copied'));
  }
}

/** `relative` read from `root` as a regular file into `files`; a finding when it cannot be. */
function readRegularInto(files, root, relative, findings, rule, label) {
  if (files.has(relative)) return;
  try {
    files.set(relative, regularFileBytes(absolute(root, relative)));
  } catch (error) {
    findings.push(finding(`${label}${relative}`, rule, `cannot be read as a regular file: ${readProblem(error)}`));
  }
}

/** `bytes` parsed as JSON; a finding when they are not. */
function parseBytes(bytes, relative, findings, rule, label) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    findings.push(finding(`${label}${relative}`, rule, `cannot be read as JSON: ${error.message}`));
    return null;
  }
}

/** The score invocation directories under `directory/scores`, oldest first; null when `scores` is not a real directory. */
function scoreInvocations(directory) {
  const scores = path.join(directory, SCORES);
  const stats = lstatOrNull(scores);
  if (stats === null) return [];
  if (!stats.isDirectory()) return null;
  return fs
    .readdirSync(scores, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** The probe IDs a `trial-sets.json` index names, or null when it does not name them as the runtime writes them. */
function probesOf(index) {
  if (!Array.isArray(index?.trialSets)) return null;
  const probes = index.trialSets.map((set) => set?.probeId);
  return probes.every((probe) => typeof probe === 'string' && safeRelative(probe) !== null) ? probes : null;
}

/**
 * The evidence artifact each probe of the latest score invocation holds,
 * validated against the schema eval-quality publishes. A probe with none, or
 * with one that is not a regular file or does not meet the schema, is a
 * finding.
 */
async function readEvidence({ root, scoreId, probes, validate, findings, label }) {
  const artifacts = new Map();
  for (const probeId of probes) {
    const relative = `${SCORES}/${scoreId}/${probeId}/${EVIDENCE_NAME}`;
    const linked = linkedDirectory(root, relative);
    if (linked !== null) {
      findings.push(linkedFinding(label, linked, 'evidence'));
      continue;
    }
    const stats = lstatOrNull(absolute(root, relative));
    if (stats === null) {
      findings.push(
        finding(
          `${label}${relative}`,
          'evidence',
          `probe ${probeId} has no evidence artifact in score invocation ${scoreId}; score the run again`,
        ),
      );
      continue;
    }
    let artifact;
    try {
      artifact = JSON.parse(regularFileBytes(absolute(root, relative)).toString('utf8'));
    } catch (error) {
      findings.push(finding(`${label}${relative}`, 'evidence', `cannot be read as a regular JSON file: ${readProblem(error)}`));
      continue;
    }
    const problems = await validate('evidence-artifact', artifact);
    for (const problem of problems) findings.push(finding(`${label}${relative}`, 'engine-schema', problem));
    if (problems.length === 0) artifacts.set(probeId, artifact);
  }
  return artifacts;
}

/**
 * The run a command acts on, resolved and held to being scored: its record, its
 * trial-set index and its latest score invocation. `wiring` is the exit 64
 * message when the run is unresolved, did not complete or has no score
 * invocation; `findings` are exit 10 problems with the index or `scores`.
 */
function resolveScoredRun(folder, invocationId) {
  const located = runDirectoryFor(folder, invocationId);
  if (located.wiring !== undefined) return { wiring: located.wiring, runDirectory: located.directory ?? null };
  const runDirectory = located.directory;
  const name = path.basename(runDirectory);
  // `runs/` and the run directory are read below as real directories; a link at either is followed by every plain read.
  const linked = linkedDirectory(folder, `runs/${name}/run.json`);
  if (linked !== null) return { findings: [linkedFinding('', linked, 'run-file')], runDirectory };
  const invocations = scoreInvocations(runDirectory);
  if (invocations === null) {
    return { findings: [finding(`${SCORES}`, 'run-file', 'is a link or a file where the score invocations are expected')], runDirectory };
  }
  if (invocations.length === 0) {
    return { wiring: `the run ${name} has no score invocation under ${SCORES}/; run tea-evaluate score first`, runDirectory };
  }
  const findings = [];
  let index = null;
  try {
    index = JSON.parse(regularFileBytes(path.join(runDirectory, TRIAL_SETS_NAME)).toString('utf8'));
  } catch (error) {
    findings.push(finding(TRIAL_SETS_NAME, 'json', `cannot be read as a regular JSON file: ${readProblem(error)}`));
  }
  const probes = index === null ? null : probesOf(index);
  if (index !== null && probes === null) findings.push(finding(TRIAL_SETS_NAME, 'run-file', 'does not name its trial sets by probe'));
  if (findings.length > 0) return { findings, runDirectory };
  return { runDirectory, record: located.record, index, probes, scoreId: invocations.at(-1) };
}

/**
 * Why the run is a before state (`before-state.js`), or null: its `run.json` says so, or one of its sealed clean controls
 * still attests a known defect, which keeps a `run.json` edited by hand from passing a before state off as a baseline.
 */
function beforeStateFinding({ runDirectory, record, index }) {
  if (record?.beforeState !== undefined) {
    return {
      finding: finding('run.json', 'before-state', `records a before state; ${NOT_A_BASELINE}, and it has no baseline to compare with`),
      message: 'is a before state',
    };
  }
  for (const set of index.trialSets ?? []) {
    let probe;
    try {
      probe = JSON.parse(regularFileBytes(absolute(runDirectory, set.probe)).toString('utf8'));
    } catch {
      // A probe the run cannot read is the score-input checks' finding; this one only looks for the declaration.
      continue;
    }
    if (declaresKnownDefect(probe)) {
      return {
        finding: finding(
          set.probe,
          'before-state',
          `clean control ${probe.probeId} attests a known defect, so ${NOT_A_BASELINE}; once the defect is fixed, change its noKnownDefectStatement and run again`,
        ),
        message: 'has a clean control that declares a known defect',
      };
    }
  }
  return null;
}

/** The outcome that stops a command at a wiring or authoring problem of the run. */
function stopped(resolved) {
  if (resolved.wiring !== undefined) {
    return new CompareOutcome({ exitCode: WIRING, message: resolved.wiring, runDirectory: resolved.runDirectory });
  }
  return new CompareOutcome({
    exitCode: AUTHORING,
    findings: resolved.findings,
    runDirectory: resolved.runDirectory,
    message: `${resolved.findings.length} problem(s) with the run's scores; nothing was compared or written`,
  });
}

// ---------------------------------------------------------------------------
// compare

/** The baseline directory as a tree: every entry a directory or a regular file; findings for the rest. */
function baselineTreeFindings(folder) {
  const findings = [];
  walkRegular(folder, BASELINE, () => {}, findings, 'baseline-file', '');
  return findings;
}

function listOf(values) {
  return values.length === 0 ? 'none' : values.join(', ');
}

async function compareWithBaseline({ folder, resolved, validate }) {
  const { runDirectory, record, probes, scoreId } = resolved;
  const where = path.basename(runDirectory);
  const findings = [];
  const evidence = await readEvidence({ root: runDirectory, scoreId, probes, validate, findings, label: '' });
  if (findings.length > 0) return stopped({ findings, runDirectory });

  const baselinePath = path.join(folder, BASELINE);
  const baselineStats = lstatOrNull(baselinePath);
  if (baselineStats === null) {
    // A retired baseline with no `baseline/` is an accept that stopped between its renames or is running now; plain
    // compare reads and deletes nothing, so it names the copy and leaves the recovery to `compare --accept`.
    const retired = retiredBaselines(folder);
    if (retired.length > 0) {
      return new CompareOutcome({
        exitCode: AUTHORING,
        runDirectory,
        findings: retired.map((entry) =>
          finding(
            entry,
            'interrupted-accept',
            `holds the previous baseline, and ${BASELINE}/ is absent: an accept stopped between its two renames, or is still running${lstatOrNull(path.join(folder, ...LOCK)) === null ? '' : ` (${inFolder(folder, path.join(folder, ...LOCK))} is present)`}; tea-evaluate compare --accept restores it once no accept is running`,
          ),
        ),
        message: `${BASELINE}/ is absent while a retired baseline exists; nothing was compared, written or deleted`,
      });
    }
    return new CompareOutcome({
      status: 'first-run',
      exitCode: OK,
      runDirectory,
      message: `first-run: ${BASELINE}/ holds no baseline to compare run ${where} with; accept it with tea-evaluate compare --accept`,
    });
  }
  if (!baselineStats.isDirectory()) {
    return stopped({
      findings: [finding(BASELINE, 'baseline-file', 'is a link or a file where the baseline directory is required; nothing is followed')],
      runDirectory,
    });
  }
  const tree = baselineTreeFindings(folder);
  if (tree.length > 0) return stopped({ findings: tree, runDirectory });

  // A baseline that is not the bytes `baseline.json` lists is refused before any of its evidence is read (`baseline-digest`, AD-12).
  const engine = await loadEngine();
  const digests = baselineDigestFindings({ folder, digestBytes: engine.digestBytes });
  if (digests.length > 0) {
    return new CompareOutcome({
      exitCode: AUTHORING,
      findings: digests,
      runDirectory,
      message: `${BASELINE}/ fails ${BASELINE_MANIFEST}'s file digests (${digests.length} problem(s)); no verdict was given and nothing was read of its evidence or written`,
    });
  }

  const baselineRecord = readBaselineJson(baselinePath, 'run.json', findings);
  if (baselineRecord === null) return stopped({ findings, runDirectory });

  // What the two run records say, before any artifact below them is read: a baseline another engine scored may hold
  // artifacts this engine's schemas no longer describe, so the version refusal never depends on reading them.
  const refusals = [];
  const version = versionRefusalReason(baselineRecord, record);
  if (version !== null) refusals.push(`${version}; re-record the baseline with tea-evaluate compare --accept`);
  if (baselineRecord.partition !== record.partition) {
    refusals.push(
      `the partitions differ (the baseline holds ${JSON.stringify(baselineRecord.partition)}, this run ${JSON.stringify(record.partition)}), ` +
        'so the two measure different probe sets',
    );
  }
  if (refusals.length > 0) return refused(runDirectory, refusals);

  const baselineIndex = readBaselineJson(baselinePath, TRIAL_SETS_NAME, findings);
  const baselineProbes = baselineIndex === null ? null : probesOf(baselineIndex);
  if (baselineIndex !== null && baselineProbes === null) {
    findings.push(finding(`${BASELINE}/${TRIAL_SETS_NAME}`, 'baseline-file', 'does not name its trial sets by probe'));
  }
  const baselineScores = scoreInvocations(baselinePath);
  if (baselineScores === null || baselineScores.length === 0) {
    findings.push(finding(`${BASELINE}/${SCORES}`, 'baseline-file', 'holds no score invocation, so the baseline holds no evidence'));
  }
  if (findings.length > 0) return stopped({ findings, runDirectory });
  const baselineEvidence = await readEvidence({
    root: baselinePath,
    scoreId: baselineScores.at(-1),
    probes: baselineProbes,
    validate,
    findings,
    label: `${BASELINE}/`,
  });
  if (findings.length > 0) return stopped({ findings, runDirectory });

  const onlyBaseline = baselineProbes.filter((probe) => !probes.includes(probe)).sort();
  const onlyRun = probes.filter((probe) => !baselineProbes.includes(probe)).sort();
  if (onlyBaseline.length > 0 || onlyRun.length > 0) {
    refusals.push(
      `the probe sets differ (only the baseline scores: ${listOf(onlyBaseline)}; only this run scores: ${listOf(onlyRun)}), so the two measure different things`,
    );
  }
  const shared = probes.filter((probe) => baselineProbes.includes(probe)).sort();
  for (const probeId of shared) {
    const reason = refusalReason(baselineEvidence.get(probeId), evidence.get(probeId));
    if (reason !== null) refusals.push(`probe ${probeId}: ${reason}`);
  }
  if (refusals.length > 0) return refused(runDirectory, refusals);

  const severityFloor = readSeverityFloor(runDirectory, findings);
  if (findings.length > 0) return stopped({ findings, runDirectory });
  const relations = [];
  for (const probeId of shared) {
    // The baseline is `a`, this run `b`: `a-dominates-b` says the baseline measured stronger.
    const result = await dominanceBetween(baselineEvidence.get(probeId), evidence.get(probeId), severityFloor);
    if (result === null || result.ok === false) {
      return refused(runDirectory, [`probe ${probeId}: ${result?.reason ?? 'its evidence artifact is not in the comparable shape'}`]);
    }
    relations.push({ probeId, relation: result.relation });
  }
  return new CompareOutcome({
    status: 'compared',
    exitCode: OK,
    runDirectory,
    relations,
    report: relations.map(({ probeId, relation }) => `${probeId}: ${relation} (a is the baseline, b is run ${where})`),
    message: `compared: ${relations.length} probe(s) of run ${where} with the baseline of run ${baselineRecord.invocationId ?? 'unknown'}`,
  });
}

function refused(runDirectory, reasons) {
  return new CompareOutcome({ status: 'refused', exitCode: OK, runDirectory, message: `refused: ${reasons.join('; ')}` });
}

/** A baseline file read as a regular file holding one JSON object; a finding, and null, when it is anything else. */
function readBaselineJson(baselinePath, relative, findings) {
  let value;
  try {
    value = JSON.parse(regularFileBytes(absolute(baselinePath, relative)).toString('utf8'));
  } catch (error) {
    findings.push(finding(`${BASELINE}/${relative}`, 'baseline-file', `cannot be read as a regular JSON file: ${readProblem(error)}`));
    return null;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    findings.push(finding(`${BASELINE}/${relative}`, 'baseline-file', 'does not hold a JSON object'));
    return null;
  }
  return value;
}

/**
 * `baseline/baseline.json` read as a regular JSON file and held to its schema; the findings say what is wrong with it.
 * `tea-evaluate ci` reads the accepted run, score invocation and digests through this, so the manifest has one reader.
 *
 * @param {string} folder the evaluation folder
 * @returns {{ manifest: object | null, findings: Array<{ file: string, rule: string, message: string }> }}
 */
function readBaselineManifest(folder) {
  const findings = [];
  const manifest = readBaselineJson(path.join(folder, BASELINE), BASELINE_MANIFEST, findings);
  if (manifest === null) return { manifest: null, findings };
  const ajv = new Ajv({ strict: false, allErrors: true });
  const validate = ajv.compile(BASELINE_SCHEMA);
  if (!validate(manifest)) {
    for (const message of new Set(validate.errors.map((error) => `${error.instancePath || '/'} ${error.message}`))) {
      findings.push(finding(`${BASELINE}/${BASELINE_MANIFEST}`, 'schema', message));
    }
    return { manifest: null, findings };
  }
  return { manifest, findings };
}

/** The run's scoring policy's `severityFloor`, which `compareDominance` reads. */
function readSeverityFloor(runDirectory, findings) {
  try {
    const value = JSON.parse(regularFileBytes(path.join(runDirectory, 'scoring-policy.json')).toString('utf8'));
    if (typeof value?.severityFloor === 'string') return value.severityFloor;
    findings.push(finding('scoring-policy.json', 'run-file', 'names no severityFloor'));
  } catch (error) {
    findings.push(finding('scoring-policy.json', 'json', `cannot be read as a regular JSON file: ${readProblem(error)}`));
  }
  return null;
}

// ---------------------------------------------------------------------------
// accept

/**
 * The actions artifacts and isolation manifests the run's records reference inside the run directory: run-relative
 * path to the digest the record recorded for it.
 */
function referencedFiles({ folder, runDirectory, record, files, index, findings }) {
  const prefix = `${path.relative(folder, runDirectory).split(path.sep).join('/')}/`;
  // A records run's references are an adopter harness's own; only the ones that resolve inside this run directory are copied.
  const imported = record.evaluator?.kind === 'records';
  const found = new Map();
  for (const set of index.trialSets) {
    for (const recordPath of Array.isArray(set.records) ? set.records : []) {
      const bytes = files.get(recordPath);
      if (bytes === undefined) continue;
      const sealed = parseBytes(bytes, recordPath, findings, 'json', '');
      for (const field of ['actionsArtifact', 'isolationManifestArtifact']) {
        const reference = sealed?.[field];
        if (reference === null || typeof reference !== 'object') continue;
        const relative =
          typeof reference.path === 'string' && reference.path.startsWith(prefix)
            ? safeRelative(reference.path.slice(prefix.length))
            : null;
        if (relative === null) {
          if (!imported) {
            findings.push(
              finding(recordPath, 'run-file', `its ${field} ${JSON.stringify(reference.path)} does not name a file inside ${prefix}`),
            );
          }
          continue;
        }
        found.set(relative, imported ? null : reference.digest);
      }
    }
  }
  return [...found].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
}

/** Every member of the run as `relative path -> bytes`, with the findings that stop an accept. */
function collectMembers({ folder, runDirectory, record, resolved, engine }) {
  const findings = [];
  const files = new Map();
  const read = (relative) => readRegularInto(files, runDirectory, relative, findings, 'run-file', '');
  for (const relative of FILE_MEMBERS) {
    if (lstatOrNull(absolute(runDirectory, relative)) === null) {
      findings.push(finding(relative, 'run-file', 'is missing from the run, and a replay through score needs it'));
      continue;
    }
    read(relative);
  }
  for (const directory of [...DIRECTORY_MEMBERS, ...OPTIONAL_DIRECTORY_MEMBERS]) {
    if (lstatOrNull(absolute(runDirectory, directory)) === null) {
      if (DIRECTORY_MEMBERS.includes(directory)) {
        findings.push(finding(directory, 'run-file', 'is missing from the run, and a replay through score needs it'));
      }
      continue;
    }
    walkRegular(runDirectory, directory, read, findings, 'run-file', '');
  }
  for (const [relative, digest] of referencedFiles({ folder, runDirectory, record, files, index: resolved.index, findings })) {
    const linked = linkedDirectory(runDirectory, relative);
    if (linked !== null) {
      findings.push(linkedFinding('', linked, 'run-file'));
      continue;
    }
    if (lstatOrNull(absolute(runDirectory, relative)) === null) {
      findings.push(
        finding(relative, 'run-file', 'is referenced by a record and missing from the run, and a replay through score needs it'),
      );
      continue;
    }
    read(relative);
    // The record names the digest its artifact must hold; a file that differs is not the one the record sealed.
    const bytes = files.get(relative);
    if (bytes !== undefined && digest !== null && engine.digestBytes(bytes) !== digest) {
      findings.push(
        finding(relative, 'run-file', `digests to ${engine.digestBytes(bytes)}, not the ${digest} the record that references it recorded`),
      );
    }
  }
  walkRegular(runDirectory, `${SCORES}/${resolved.scoreId}`, read, findings, 'run-file', '');
  // `score` names the files it reads once, in `scoreInputList`; every one of them is a member, so a replay never lacks an input.
  if (findings.length === 0) {
    for (const input of scoreInputList({ runDirectory, index: resolved.index, record })) {
      if (!files.has(input.relative))
        findings.push(finding(input.relative, 'run-file', `is ${input.what}, which score reads, and the baseline would not hold it`));
    }
  }
  return { files, findings };
}

/**
 * The findings `score` would report over this run's inputs, so no run `score`
 * would refuse becomes a baseline. One seam over `score.js`: the trial-set index
 * schema, `inputFindings` and the operation-phase snapshot check, in the order
 * `runScoreCommand` runs them.
 */
async function scoreInputFindings({ folder, runDirectory, index, record, engine }) {
  const ajv = new Ajv({ strict: false, allErrors: true });
  const indexSchema = ajv.compile(JSON.parse(fs.readFileSync(TRIAL_SETS_SCHEMA, 'utf8')));
  if (!indexSchema(index)) {
    return [...new Set((indexSchema.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message}`))].map((message) =>
      finding(TRIAL_SETS_NAME, 'schema', message),
    );
  }
  const held = holdRunInputs({ folder, runDirectory, index, record, engine });
  const found = await inputFindings({ folder, runDirectory, index, record, engine, held });
  if (found.length === 0) {
    try {
      const contract = JSON.parse(regularFileBytes(absolute(runDirectory, index.contract)).toString('utf8'));
      for (const message of phaseSnapshotProblems(record, contract)) found.push(finding('run.json', 'operation-phases', message));
    } catch (error) {
      found.push(finding(index.contract, 'json', `cannot be read as a regular JSON file: ${readProblem(error)}`));
    }
  }
  return found;
}

/**
 * The findings that say the latest score invocation is not one `score` stands
 * behind: its `score.json` does not parse, does not name this run and invocation,
 * records an exit other than success, FAIL or Invalid (12 infrastructure, 64
 * wiring, 4 and 5 engine failures), or records a strength aggregate that was
 * refused, failed or disagreed with the evidence `score` persisted. A weak
 * result, such as a probe the corpus did not catch, exits 2 and stays acceptable.
 */
function scoreRecordFindings({ runDirectory, scoreId, index }) {
  const relative = `${SCORES}/${scoreId}/score.json`;
  const again = 'score the run again before accepting it';
  let value;
  try {
    value = JSON.parse(regularFileBytes(absolute(runDirectory, relative)).toString('utf8'));
  } catch (error) {
    return [finding(relative, 'score-record', `cannot be read as a regular JSON file (${readProblem(error)}); ${again}`)];
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [finding(relative, 'score-record', `does not hold a JSON object; ${again}`)];
  }
  const problems = [];
  if (value.invocationId !== scoreId) problems.push(`names score invocation ${JSON.stringify(value.invocationId)}, not ${scoreId}`);
  if (value.run !== index.invocationId) problems.push(`names run ${JSON.stringify(value.run)}, not ${index.invocationId}`);
  if (!ACCEPTED_SCORE_EXITS.has(value.exitCode)) {
    problems.push(`records exit ${JSON.stringify(value.exitCode)}, so that score invocation did not complete cleanly`);
  }
  const aggregate = value.strengthAggregate;
  if (aggregate === null || typeof aggregate !== 'object') problems.push('records no strengthAggregate');
  else if (REFUSED_AGGREGATES.has(aggregate.status)) {
    problems.push(
      `records its strength aggregate as ${aggregate.status}${typeof aggregate.reason === 'string' ? ` (${aggregate.reason})` : ''}`,
    );
  }
  return problems.map((problem) => finding(relative, 'score-record', `${problem}; ${again}`));
}

/** The `baseline.json` content over the members' digests, and the findings where it does not meet its schema. */
function manifestOf({ engine, record, scoreId, files }) {
  const digests = {};
  const qualification = [];
  for (const [relative, bytes] of [...files].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))) {
    const digest = engine.digestBytes(bytes);
    digests[relative] = digest;
    if (relative.startsWith('qualification/')) {
      qualification.push({ storage: 'public', path: `${BASELINE}/${relative}`, privateRef: null, digest });
    }
  }
  const manifest = {
    schemaVersion: BASELINE_SCHEMA_VERSION,
    acceptedRun: record.invocationId,
    scoreInvocationId: scoreId,
    partition: record.partition,
    evalQualityVersion: record.evalQualityVersion,
    corpusDigest: record.corpusDigest,
    contractDigest: record.contractDigest,
    policyDigest: record.policyDigest,
    files: digests,
    qualification,
  };
  const ajv = new Ajv({ strict: false, allErrors: true });
  const validate = ajv.compile(BASELINE_SCHEMA);
  const findings = validate(manifest)
    ? []
    : [...new Set(validate.errors.map((error) => `${error.instancePath || '/'} ${error.message}`))].map((message) =>
        finding(`${BASELINE}/${BASELINE_MANIFEST}`, 'schema', message),
      );
  return { manifest, findings };
}

function scratchDirectory(folder) {
  return path.join(folder, ...SCRATCH);
}

/** `file` relative to the evaluation folder, as the messages spell it. */
function inFolder(folder, file) {
  return path.relative(folder, file).split(path.sep).join('/');
}

/** An accept's swap that failed after it retired the previous baseline and could not put it back. */
class StrandedBaselineError extends Error {
  constructor(message, retired) {
    super(message);
    this.name = 'StrandedBaselineError';
    this.retired = retired;
  }
}

/** Writes `files` into a fresh staging directory under `runs/.compare-staging/` and reads each back; the staging path. */
async function stage({ folder, files, engine }) {
  const scratch = scratchDirectory(folder);
  fs.mkdirSync(scratch, { recursive: true, mode: 0o755 });
  const staging = fs.mkdtempSync(path.join(scratch, STAGING_PREFIX));
  try {
    fs.chmodSync(staging, 0o755);
    for (const [relative, bytes] of files) {
      const target = absolute(staging, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o755 });
      // Exclusive: an existing entry of any kind, a link included, stops the write instead of being followed.
      fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o644 });
      // Yields to the event loop, so a SIGINT or SIGTERM handler can run between files.
      await new Promise((resolve) => {
        setImmediate(resolve);
      });
    }
    for (const [relative, bytes] of files) {
      const back = regularFileBytes(absolute(staging, relative));
      if (engine.digestBytes(back) !== engine.digestBytes(bytes)) throw new Error(`${relative} does not hold the bytes it was staged from`);
    }
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  return staging;
}

/** Puts `staging` at `baseline/`, keeping the old baseline until the new one is in place. */
function swap(folder, staging, log) {
  const target = path.join(folder, BASELINE);
  const hadOld = lstatOrNull(target) !== null;
  const retired = path.join(path.dirname(staging), `${RETIRED_PREFIX}${crypto.randomBytes(4).toString('hex')}`);
  try {
    if (hadOld) fs.renameSync(target, retired);
    try {
      fs.renameSync(staging, target);
    } catch (error) {
      if (hadOld) {
        try {
          fs.renameSync(retired, target);
        } catch (restoreError) {
          throw new StrandedBaselineError(
            `${readProblem(error)}, and putting the previous baseline back failed too (${readProblem(restoreError)})`,
            retired,
          );
        }
      }
      throw error;
    }
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  if (hadOld) {
    try {
      fs.rmSync(retired, { recursive: true, force: true });
    } catch (error) {
      log(`the previous baseline could not be removed from ${retired}: ${error.message}`);
    }
  }
}

/** The `retired-*` entries under `runs/.compare-staging/`, relative to the folder; read only, nothing is touched. */
function retiredBaselines(folder) {
  const scratch = scratchDirectory(folder);
  const stats = lstatOrNull(scratch);
  if (stats === null || !stats.isDirectory()) return [];
  return fs
    .readdirSync(scratch)
    .filter((name) => name.startsWith(RETIRED_PREFIX))
    .sort()
    .map((name) => `${inFolder(folder, scratch)}/${name}`);
}

/** The pid a lock directory records, when it can be read; null otherwise. */
function recordedPid(lock) {
  try {
    const parsed = Number.parseInt(regularFileBytes(path.join(lock, LOCK_PID)).toString('utf8'), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The exclusive lock an accept holds for its whole sequence: recovery, staging, the swap and cleanup. A single `mkdir`
 * of `runs/.compare-staging.lock` is the claim. An existing entry refuses the accept (exit 12) and the message gives the
 * remedy for a lock a killed accept left: delete that directory. Nothing here decides a lock is stale, takes one over or
 * removes a lock this process did not just make. The `pid` file written after the claim is information for that
 * message and a failure to write it is ignored.
 *
 * @returns {{lock: string} | {problem: string}}
 */
function acquireLock(folder) {
  const lock = path.join(folder, ...LOCK);
  const where = inFolder(folder, lock);
  try {
    fs.mkdirSync(lock, { mode: 0o755 });
  } catch (error) {
    if (error.code !== 'EEXIST') return { problem: `${where} cannot be created (${readProblem(error)}); nothing was written` };
    const pid = recordedPid(lock);
    return {
      problem: `another tea-evaluate compare --accept holds ${where}${pid === null ? '' : ` (pid ${pid})`}; if none is running (an earlier accept was killed), delete that directory and run the accept again`,
    };
  }
  try {
    fs.writeFileSync(path.join(lock, LOCK_PID), `${process.pid}\n`, { flag: 'wx', mode: 0o644 });
  } catch {
    // The pid only helps a later refusal name the holder.
  }
  return { lock };
}

/**
 * The state an interrupted accept can leave under `runs/.compare-staging/`,
 * settled by `compare --accept` while it holds the lock: a retired baseline is
 * put back when `baseline/` is absent (the accept stopped between its two
 * renames), then every stale staging or retired directory is deleted. Plain
 * `compare` never calls this: it reads and deletes nothing.
 * Returns null, or the words that say what state the folder is really in when
 * the baseline could not be put back.
 */
function recoverBaseline(folder, log) {
  const scratch = scratchDirectory(folder);
  const stats = lstatOrNull(scratch);
  if (stats === null) return null;
  const where = inFolder(folder, scratch);
  if (!stats.isDirectory()) {
    fs.rmSync(scratch, { force: true });
    return null;
  }
  const target = path.join(folder, BASELINE);
  const retired = fs
    .readdirSync(scratch)
    .filter((name) => name.startsWith(RETIRED_PREFIX))
    .sort();
  if (lstatOrNull(target) === null && retired.length > 0) {
    if (retired.length > 1) {
      return `${BASELINE}/ is absent and ${where}/ holds ${retired.length} retired baselines (${retired.join(', ')}); move the right one back to ${BASELINE}/ by hand`;
    }
    try {
      fs.renameSync(path.join(scratch, retired[0]), target);
    } catch (error) {
      return `${BASELINE}/ is absent: an earlier accept stopped after it retired the previous baseline, which lies at ${where}/${retired[0]}, and putting it back failed (${readProblem(error)}); move it back to ${BASELINE}/ by hand`;
    }
    log(`restored ${BASELINE}/ from ${where}/${retired[0]}, where an interrupted accept had left it`);
  }
  for (const name of fs.readdirSync(scratch)) {
    try {
      fs.rmSync(path.join(scratch, name), { recursive: true, force: true });
    } catch (error) {
      log(`stale ${where}/${name} could not be removed: ${error.message}`);
    }
  }
  try {
    fs.rmdirSync(scratch);
  } catch {
    // It stays when something could not be removed from it; the next command tries again.
  }
  return null;
}

async function acceptBaseline({ folder, resolved, validate, log }) {
  const { runDirectory, record, scoreId } = resolved;
  const where = path.basename(runDirectory);
  if (record.dirty !== false) {
    return new CompareOutcome({
      exitCode: AUTHORING,
      runDirectory,
      findings: [
        finding(
          'run.json',
          'dirty',
          `records dirty ${JSON.stringify(record.dirty)}; a run measured over uncommitted work is never accepted as a baseline`,
        ),
      ],
      message: `run ${where} is dirty; nothing was written under ${BASELINE}/`,
    });
  }
  const findings = [];
  const engine = await loadEngine();
  await readEvidence({ root: runDirectory, scoreId, probes: resolved.probes, validate, findings, label: '' });
  const collected = collectMembers({ folder, runDirectory, record, resolved, engine });
  findings.push(...collected.findings, ...scoreRecordFindings({ runDirectory, scoreId, index: resolved.index }));
  // `score`'s own input checks read through the paths the findings above vouch for, so they run only when those are clean.
  if (findings.length === 0) findings.push(...(await scoreInputFindings({ folder, runDirectory, index: resolved.index, record, engine })));
  const { manifest, findings: manifestFindings } = manifestOf({ engine, record, scoreId, files: collected.files });
  findings.push(...manifestFindings);
  if (findings.length > 0) {
    return new CompareOutcome({
      exitCode: AUTHORING,
      runDirectory,
      findings,
      message: `${findings.length} problem(s) stop run ${where} from becoming the baseline; nothing was written under ${BASELINE}/`,
    });
  }
  const files = new Map(collected.files);
  files.set(BASELINE_MANIFEST, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
  try {
    swap(folder, await stage({ folder, files, engine }), log);
  } catch (error) {
    const stranded = error instanceof StrandedBaselineError;
    return new CompareOutcome({
      exitCode: INFRASTRUCTURE,
      runDirectory,
      message: stranded
        ? `the baseline could not be written (${readProblem(error)}); ${BASELINE}/ is absent and the previous baseline lies at ${inFolder(folder, error.retired)}; the next compare --accept puts it back, or move it back by hand`
        : `the baseline could not be written (${readProblem(error)}); the staging directory is removed and ${BASELINE}/ is as it was`,
    });
  }
  try {
    fs.rmdirSync(scratchDirectory(folder));
  } catch {
    // Only a directory with nothing in it is removed; one that is not empty or already gone stays as it is.
  }
  return new CompareOutcome({
    status: 'accepted',
    exitCode: OK,
    runDirectory,
    message: `accepted: run ${where} (score invocation ${scoreId}) is the baseline, ${files.size} file(s) under ${BASELINE}/`,
  });
}

/**
 * Runs `tea-evaluate compare` over one evaluation folder.
 *
 * @param {string} folder the resolved evaluation folder
 * @param {object} [options]
 * @param {string} [options.run] the invocation identifier of the run to compare or accept
 * @param {boolean} [options.accept] replace `baseline/` with a snapshot of the run
 * @param {(line: string) => void} [options.log]
 * @returns {Promise<CompareOutcome>}
 */
async function runCompareCommand(folder, { run: invocationId, accept = false, log = () => {} } = {}) {
  // Only an accept writes, so only an accept takes the lock; a plain compare reads and deletes nothing.
  let lock = null;
  const onSignal = (code) => () => {
    // Best effort: a Ctrl-C leaves no lock. Staging and retired leftovers stay for the next accept's recovery.
    if (lock !== null) fs.rmSync(lock, { recursive: true, force: true });
    process.exit(code);
  };
  const onInterrupt = onSignal(130);
  const onTerminate = onSignal(143);
  try {
    const runs = accept ? lstatOrNull(path.join(folder, 'runs')) : null;
    if (runs !== null && !runs.isDirectory()) {
      return new CompareOutcome({
        exitCode: INFRASTRUCTURE,
        message: 'runs is a link or a file where a directory is required; nothing was written',
      });
    }
    if (runs !== null) {
      const held = acquireLock(folder);
      if (held.problem !== undefined) return new CompareOutcome({ exitCode: INFRASTRUCTURE, message: held.problem });
      lock = held.lock;
      process.on('SIGINT', onInterrupt);
      process.on('SIGTERM', onTerminate);
      const problem = recoverBaseline(folder, log);
      if (problem !== null) return new CompareOutcome({ exitCode: INFRASTRUCTURE, message: problem });
    }
    const resolved = resolveScoredRun(folder, invocationId);
    if (resolved.wiring !== undefined || resolved.findings !== undefined) return stopped(resolved);
    const before = beforeStateFinding(resolved);
    if (before !== null) {
      return new CompareOutcome({
        exitCode: AUTHORING,
        runDirectory: resolved.runDirectory,
        findings: [before.finding],
        message: `run ${path.basename(resolved.runDirectory)} ${before.message}; nothing was compared or written under ${BASELINE}/`,
      });
    }
    log(`${accept ? 'accepting' : 'comparing'} run ${path.basename(resolved.runDirectory)}`);
    const validate = createArtifactValidator();
    if (accept) return await acceptBaseline({ folder, resolved, validate, log });
    return await compareWithBaseline({ folder, resolved, validate });
  } catch (error) {
    if (lock === null) throw error;
    return new CompareOutcome({
      exitCode: INFRASTRUCTURE,
      message: `compare --accept stopped on an unexpected error (${readProblem(error)}); ${BASELINE}/ and ${SCRATCH.join('/')}/ are as the failure left them`,
    });
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);
    // Only the directory this process made: `lock` is set after the one successful mkdir.
    if (lock !== null) fs.rmSync(lock, { recursive: true, force: true });
  }
}

module.exports = {
  BASELINE,
  CompareOutcome,
  baselineTreeFindings,
  compareStoredResults,
  dominanceBetween,
  isComparableShaped,
  lstatOrNull,
  probesOf,
  readBaselineJson,
  readBaselineManifest,
  readEvidence,
  refusalReason,
  runCompareCommand,
  scoreInvocations,
  versionRefusalReason,
  walkRegular,
};
