/**
 * `target-findings.json`: what an evaluation found wrong or weak in the target itself, and the adopter's decision on each.
 *
 * Stage 11 classifies every failure or weakness as an instrument problem, which the gap loop repairs, or a target problem, which
 * becomes a target finding here. Three things read the file:
 *
 * - `reviewTargetFindings` problems (every `check`): its schema and its agreement with the folder. The evaluation it names, the
 *   contract behaviors and committed probes it cites, the authoring record and handoff it names, and the run evidence it cites
 *   wherever that run is on disk (its run directory, or `baseline/` for the accepted run): each cited trial's state in the score's
 *   reduced outcome, a held-out probe's gap-view row (the reduced outcome a held-out probe discloses, and nothing more of it), a
 *   qualification record's verdict, an isolation path against the trial set's allowlist, and a process finding rebuilt from the
 *   sealed record and operation phases the way `interpretation.json` is. A this-pr finding's measurement is held to the finding's
 *   own evidence (its before run), to the one rerun every this-pr finding shares (its after runs, one per partition) and to the
 *   per-probe receipt it commits, which keeps the before and after outcomes on record once `check --ready` has read them from the runs.
 * - `reviewTargetFindings` readiness: what is not ready for the pull request. A scored evaluation with no file, an undecided
 *   finding, a this-pr finding with no measurement, and a citation or measurement run `check` cannot find. `check` prints these as
 *   warnings while the gap loop runs, and `check --ready`, the pre-PR invocation, reports them as findings and exits 10.
 * - `draftTargetFindings` (`tea-evaluate target-findings`): the candidates one run's evidence holds, each with its source, evidence,
 *   behavior and severity filled from the run and the contract, for the classification Stage 11 makes. It copies states and
 *   computes no verdict.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { MANIFEST_NAME, readFolderFile } = require('./folder');
const { mountsOutsideAllowlist } = require('./isolation-allowlist');
const { projectTrial } = require('./interpret');

const TARGET_FINDINGS_NAME = 'target-findings.json';
const RULE = 'target-findings';
const RUN_ID = /^[A-Za-z0-9_-]+$/;
const PROBE_ID = /^P-[0-9]{3,}$/;
const RECORD = /^record-[1-9][0-9]*\.json$/;
/** The trial states of a target that behaved as its probe expects. */
const PASSING = new Set(['passed-clean-control', 'caught', 'confirmed']);
/** The trial states that show the target behaving wrongly; every other state is a fault of the instrument or its execution. */
const FAILING = new Set(['false-positive', 'missed']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** The parsed JSON object a folder file holds, or null when it is absent, unreadable, not JSON or not an object. */
function folderJson(folder, relative) {
  const read = readFolderFile(folder, relative);
  if (!read.ok) return null;
  try {
    const value = JSON.parse(read.bytes.toString('utf8'));
    return isPlainObject(value) ? value : null;
  } catch {
    return null;
  }
}

/** Whether `relative` names a real directory of the folder, reached through no link at any component. */
function isFolderDirectory(folder, relative) {
  let current = folder;
  for (const segment of relative.split('/')) {
    current = path.join(current, segment);
    let stats;
    try {
      stats = fs.lstatSync(current, { throwIfNoEntry: false });
    } catch {
      return false;
    }
    if (stats === undefined || stats.isSymbolicLink() || !stats.isDirectory()) return false;
  }
  return true;
}

/** The names of a folder directory's entries that match `pattern`, sorted, or none when it is no real directory. */
function namesIn(folder, relative, pattern) {
  if (!isFolderDirectory(folder, relative)) return [];
  try {
    return fs
      .readdirSync(path.join(folder, ...relative.split('/')))
      .filter((name) => pattern.test(name))
      .sort();
  } catch {
    // A directory that cannot be listed holds nothing this review reads; its own rules report it, and the check goes on.
    return [];
  }
}

/** The trial numbers of a trial set, from its `record-<n>.json` files. */
function recordNumbers(folder, trialSet) {
  return namesIn(folder, trialSet, RECORD).map((name) => Number(name.slice('record-'.length, -'.json'.length)));
}

/**
 * Where a cited run's evidence lives in the folder: its run directory, or `baseline/` when the run is the accepted one, with its
 * `run.json`; or null when neither is on disk (runs are gitignored, so a run made on another machine is cited and not verified).
 */
function locateRun(folder, run) {
  if (typeof run !== 'string' || !RUN_ID.test(run)) return null;
  const record = isFolderDirectory(folder, `runs/${run}`) ? folderJson(folder, `runs/${run}/run.json`) : null;
  if (record !== null) return { root: `runs/${run}`, record };
  const baseline = folderJson(folder, 'baseline/baseline.json');
  if (baseline?.acceptedRun === run) return { root: 'baseline', record: folderJson(folder, 'baseline/run.json') ?? {} };
  return null;
}

/** The engine's reduced outcome of one probe under one score invocation of a located run, or null when it holds none. */
function reducedOutcome(folder, root, score, probe) {
  const artifact = folderJson(folder, `${root}/scores/${score}/${probe}/evidence-artifact.json`);
  const entries = Array.isArray(artifact?.reducedProbeOutcomes) ? artifact.reducedProbeOutcomes : [];
  return entries.find((entry) => entry?.probeId === probe) ?? null;
}

/** A reduced outcome's per-trial states, by trial number. */
function votesOf(outcome) {
  return new Map((Array.isArray(outcome?.trialVotes) ? outcome.trialVotes : []).map((vote) => [vote?.trialIndex, vote?.state]));
}

/** The receipt form of a reduced outcome: what a measurement commits and `check` compares, with the votes in trial order. */
function receiptOf(outcome) {
  return {
    caught: outcome.caught,
    caughtCount: outcome.caughtCount,
    validCount: outcome.validCount,
    votes: [...votesOf(outcome).entries()].sort(([left], [right]) => left - right).map(([, state]) => state),
  };
}

function sameReceipt(left, right) {
  const ordered = (value) => ({ caught: value.caught, caughtCount: value.caughtCount, validCount: value.validCount, votes: value.votes });
  return JSON.stringify(ordered(left)) === JSON.stringify(ordered(right));
}

/**
 * The qualification record of the clean arm every probe that qualifies against the target runs: a clean control's baseline, and a
 * seeded probe's first step before its mutation (`mutation.js`). Only a clean control can be recorded known-failing instead.
 */
const CLEAN_ARM = 'baseline-pass';
const KNOWN_FAILING_ARM = 'baseline-known-failing';

/** Whether a qualification record shows its clean arm failing: its oracles decided, and one was violated. */
function showsFailure(record) {
  return record?.verdict === 'violated';
}

/** A trial set's paths outside its allowlist, or null when the manifest's lists are not lists of paths. */
function outsideAllowlist(manifest) {
  const paths = (value) => Array.isArray(value) && value.every((entry) => typeof entry === 'string');
  if (!paths(manifest?.observedMounts) || !paths(manifest?.allowedMounts)) return null;
  return mountsOutsideAllowlist(manifest.observedMounts, manifest.allowedMounts);
}

/** Whether `text` names `id` as a whole finding ID, so `T-001` is not found inside `T-0010`. */
function namesFinding(text, id) {
  return new RegExp(`(?<![A-Za-z0-9-])${id}(?![0-9])`).test(text);
}

/** The partitions a measurement entry covers: its own, or every partition the evaluation has for a run of both. */
function covered(entry, heldOut) {
  if (entry.partition !== 'both') return [entry.partition];
  return heldOut.size > 0 ? ['development', 'held-out'] : ['development'];
}

/** The probe's partition: held-out when `evaluation.json` holds it out, development otherwise. */
function partitionOf(heldOut, probe) {
  return heldOut.has(probe) ? 'held-out' : 'development';
}

/** The measurement entry that covers a partition: its own, or a run of both partitions. */
function entryFor(measurement, partition) {
  return measurement.partitions.find((entry) => entry.partition === partition || entry.partition === 'both');
}

/** The committed probe file a finding cites, or null. */
function committedProbe(folder, probe) {
  return typeof probe === 'string' && PROBE_ID.test(probe) ? folderJson(folder, `probes/${probe}.probe.json`) : null;
}

function describeVotes(votes, cited) {
  const shown = cited.length > 0 ? cited.filter((trial) => votes.has(trial)) : [...votes.keys()];
  return shown.length === 0 ? 'no vote for the cited trials' : shown.map((trial) => `trial ${trial} ${votes.get(trial)}`).join(', ');
}

/** Holds the cited trials' states to what the finding's source says they show. */
function checkVotes(report, label, finding, outcome, where) {
  const { evidence, source } = finding;
  const votes = votesOf(outcome);
  const cited = evidence.trials ?? [];
  for (const trial of cited)
    if (!votes.has(trial)) report(`${label} cites trial ${trial} of probe ${evidence.probe}, which ${where} holds no vote for`);
  const stateOf = (trial) => votes.get(trial);
  if (source === 'clean-control-failure') {
    const considered = cited.length > 0 ? cited.filter((trial) => votes.has(trial)) : [...votes.keys()];
    const wrong = cited.some((trial) => votes.has(trial) && stateOf(trial) !== 'false-positive');
    if (wrong || !considered.some((trial) => stateOf(trial) === 'false-positive'))
      report(
        `${label} is a clean-control failure, and ${where} records ${describeVotes(votes, cited)}; a clean control that failed reads false-positive`,
      );
  }
  if (source === 'intermittent-behavior') {
    if (evidence.trialCount !== undefined && evidence.trialCount !== votes.size)
      report(`${label} records trialCount ${evidence.trialCount}; ${where} holds ${votes.size} trial vote(s)`);
    const wrong = cited.some((trial) => votes.has(trial) && !FAILING.has(stateOf(trial)));
    const unsteady = [...votes.keys()].some((trial) => !cited.includes(trial) && !PASSING.has(stateOf(trial)));
    if (wrong || unsteady)
      report(
        `${label} is an intermittent behavior, and ${where} records ${describeVotes(votes, [...votes.keys()])}; its cited trials must fail and every other trial pass`,
      );
  }
  if (source === 'behavior-failure' && cited.some((trial) => votes.has(trial) && !FAILING.has(stateOf(trial))))
    report(`${label} is a behavior failure, and ${where} records ${describeVotes(votes, cited)}; each cited trial must fail`);
}

/** A held-out probe's evidence: the gap-view row the score discloses, compared with the reduced outcome it was copied from. */
function checkGapView(report, folder, label, finding, located) {
  const { evidence } = finding;
  const outcome = reducedOutcome(folder, located.root, evidence.score, evidence.probe);
  if (outcome === null) {
    report(
      `${label} cites the gap-view row of ${evidence.probe} under score ${evidence.score}, which ${located.root}/ holds no outcome for`,
    );
    return;
  }
  const row = receiptOf(outcome);
  const probeClass = committedProbe(folder, evidence.probe)?.probeClass;
  if (!sameReceipt(evidence.gapView, row) || evidence.gapView.probeClass !== probeClass)
    report(
      `${label} copies a gap-view row of ${evidence.probe} that differs from score ${evidence.score}'s (${JSON.stringify({ probeClass, ...row })}); copy the row as gap-view.json gives it`,
    );
  if (!row.votes.some((state) => FAILING.has(state)))
    report(`${label} cites a gap-view row of ${evidence.probe} whose votes show no failing trial`);
  if (finding.source === 'intermittent-behavior' && !row.votes.some((state) => PASSING.has(state)))
    report(`${label} is an intermittent behavior, and the gap-view row of ${evidence.probe} shows no passing trial`);
}

/** A process finding rebuilt from the sealed records, the run's operation phases and its contract, as `interpretation.json` is. */
function checkProcessFinding(report, folder, label, evidence, root, records) {
  const phases = folderJson(folder, `${root}/operation-phases.json`);
  const contract = folderJson(folder, `${root}/eval-contract.json`);
  if (phases === null || contract === null) {
    report(
      `${label} cites process finding ${evidence.finding}, and ${root}/ holds no operation-phases.json or eval-contract.json to trace it`,
    );
    return;
  }
  const oracles = new Map((Array.isArray(contract.oracles) ? contract.oracles : []).map((oracle) => [oracle?.id, oracle]));
  const listed = (evidence.trials ?? records).some((trial) => {
    const record = folderJson(folder, `${root}/trial-sets/${evidence.probe}/record-${trial}.json`);
    if (record === null) return false;
    try {
      return projectTrial(record, phases, oracles).process.includes(evidence.finding);
    } catch {
      return false;
    }
  });
  if (!listed)
    report(
      `${label} cites finding ${JSON.stringify(evidence.finding)}, which the sealed records of probe ${evidence.probe}${evidence.trials === undefined ? '' : ` trial ${evidence.trials.join(', ')}`} under ${root}/ do not list in the process phase`,
    );
}

/**
 * Holds one citation (a finding's own evidence, or the development reproduction of a held-out one) to the run evidence on disk.
 * Returns a note when the cited run is not on disk, which readiness reports as unverified, or null.
 */
function checkRunEvidence(report, folder, label, finding, heldOut) {
  const { evidence } = finding;
  const { probe } = evidence;
  if (probe !== undefined && heldOut.has(probe)) {
    for (const field of ['trials', 'paths', 'finding', 'qualification'])
      if (evidence[field] !== undefined)
        report(
          `${label} cites ${field} of held-out probe ${probe}; cite a held-out probe by its gap-view row (gapView), and its development reproduction under reproducedBy`,
        );
    if (evidence.gapView === undefined) report(`${label} cites held-out probe ${probe} with no gapView; copy its gap-view.json row`);
  } else if (evidence.gapView !== undefined) report(`${label} copies a gap-view row for development probe ${probe}; cite its trials`);
  if (evidence.trials !== undefined && evidence.trialCount !== undefined) {
    const over = evidence.trials.filter((trial) => trial > evidence.trialCount);
    if (over.length > 0) report(`${label} cites trial ${over.join(', ')} of ${evidence.trialCount}`);
    if (finding.source === 'intermittent-behavior' && evidence.trials.length >= evidence.trialCount)
      report(
        `${label} cites every trial of ${evidence.trialCount} as failing, so the behavior does not fail only some trials; record it as the failure it is`,
      );
  }
  if (evidence.run === undefined) return null;
  const located = locateRun(folder, evidence.run);
  if (located === null)
    return `${label} cites run ${evidence.run}, which is neither under runs/ nor the accepted baseline, so its evidence is unverified`;
  if (probe === undefined) return null;
  const { root } = located;
  if (heldOut.has(probe)) {
    if (evidence.gapView !== undefined && evidence.score !== undefined) checkGapView(report, folder, label, finding, located);
    return null;
  }
  if (evidence.qualification !== undefined) {
    const file = `${root}/qualification/${probe}/${evidence.qualification}.json`;
    const record = folderJson(folder, file);
    if (record === null) report(`${label} cites qualification record ${file}, which cannot be read`);
    else if (!showsFailure(record))
      report(
        `${label} cites qualification record ${file}, whose verdict is ${JSON.stringify(record.verdict ?? null)}; it shows the clean arm failing only when its oracles decided and one was violated`,
      );
  }
  const trialSet = `${root}/trial-sets/${probe}`;
  if (evidence.score === undefined && evidence.trials === undefined && evidence.paths === undefined) return null;
  if (!isFolderDirectory(folder, trialSet)) {
    report(`${label} cites probe ${probe} of run ${evidence.run}, whose evidence (${root}/) holds no trial set for it`);
    return null;
  }
  const records = recordNumbers(folder, trialSet);
  for (const trial of evidence.trials ?? [])
    if (!records.includes(trial))
      report(`${label} cites trial ${trial} of probe ${probe}; ${trialSet}/record-${trial}.json does not exist`);
  if (evidence.score !== undefined) {
    const outcome = reducedOutcome(folder, root, evidence.score, probe);
    if (outcome === null)
      report(
        `${label} cites score invocation ${evidence.score} of run ${evidence.run}, which holds no score of probe ${probe} under ${root}/scores/`,
      );
    else checkVotes(report, label, finding, outcome, `score ${evidence.score}`);
  }
  if (evidence.paths !== undefined) {
    const manifest = folderJson(folder, `${trialSet}/isolation-manifest.json`);
    if (manifest === null) report(`${label} cites isolation paths of probe ${probe}; ${trialSet}/isolation-manifest.json cannot be read`);
    else {
      const listed = outsideAllowlist(manifest);
      if (listed === null)
        report(
          `${label} cites isolation paths of probe ${probe}; ${trialSet}/isolation-manifest.json holds no list of observedMounts and allowedMounts to verify them against`,
        );
      const outside = new Set(listed ?? evidence.paths);
      for (const cited of evidence.paths)
        if (!outside.has(cited))
          report(
            `${label} cites path ${JSON.stringify(cited)}, which ${trialSet}/isolation-manifest.json does not record outside the trial set's allowlist`,
          );
    }
  }
  if (evidence.finding !== undefined) checkProcessFinding(report, folder, label, evidence, root, records);
  return null;
}

/**
 * Holds a this-pr finding's measurement to its evidence, to the batch's shared rerun and to its committed receipts. Returns a note
 * for every run it could not find on disk, which readiness reports.
 */
function checkMeasurement(report, folder, label, finding, { heldOut, batch }) {
  const { measurement } = finding.disposition;
  const notes = [];
  const partitions = measurement.partitions.map((entry) => entry.partition);
  if (new Set(partitions).size !== partitions.length) report(`${label} measures a partition more than once`);
  if (partitions.includes('both') && partitions.length > 1)
    report(`${label} measures a run of both partitions beside a partition of its own; record one or the other`);
  for (const partition of heldOut.size > 0 ? ['development', 'held-out'] : ['development'])
    if (entryFor(measurement, partition) === undefined)
      report(`${label} measures no ${partition} rerun; record the before and after runs of every partition the evaluation has`);
  const located = new Map();
  for (const entry of measurement.partitions) {
    if (entry.before !== null && entry.before.run === entry.after.run)
      report(`${label} measures run ${entry.after.run} before and after; the after run is the rerun with every this-pr change applied`);
    for (const side of ['before', 'after']) {
      const pair = entry[side];
      if (pair === null) continue;
      const found = locateRun(folder, pair.run);
      if (found === null) {
        notes.push(
          `${label} measures ${entry.partition} ${side} run ${pair.run}, which is neither under runs/ nor the accepted baseline, so its outcomes are unverified`,
        );
        continue;
      }
      located.set(`${entry.partition}:${side}`, found);
      if (typeof found.record.partition === 'string' && found.record.partition !== entry.partition)
        report(`${label} measures ${entry.partition} with ${side} run ${pair.run}, a run of ${found.record.partition}`);
      if (folderJson(folder, `${found.root}/scores/${pair.score}/score.json`) === null)
        report(`${label} measures ${side} score ${pair.score} of run ${pair.run}, which ${found.root}/scores/ does not hold`);
    }
  }
  // The before run is the scored run the finding came from.
  const { evidence } = finding;
  if (evidence.run !== undefined && evidence.score !== undefined && evidence.probe !== undefined) {
    const entry = entryFor(measurement, partitionOf(heldOut, evidence.probe));
    if (entry !== undefined && (entry.before?.run !== evidence.run || entry.before?.score !== evidence.score))
      report(
        `${label} measures from ${entry.before === null ? 'no before run' : `run ${entry.before.run} score ${entry.before.score}`}, not the run ${evidence.run} score ${evidence.score} its evidence cites`,
      );
  }
  // Every this-pr change is applied together and measured by one rerun.
  for (const entry of measurement.partitions)
    for (const partition of covered(entry, heldOut)) {
      const shared = batch.get(partition);
      if (shared === undefined) batch.set(partition, { ...entry.after, by: finding.id });
      else if (shared.run !== entry.after.run || shared.score !== entry.after.score)
        report(
          `${label} measures ${partition} after run ${entry.after.run}, and ${shared.by} after run ${shared.run}; every this-pr change is applied together and measured by one rerun`,
        );
    }
  const receipts = new Set(measurement.probes.map((receipt) => receipt.probe));
  if (evidence.probe !== undefined && !receipts.has(evidence.probe))
    report(`${label} measures no receipt for probe ${evidence.probe}, the probe its evidence cites`);
  for (const receipt of measurement.probes) {
    if (committedProbe(folder, receipt.probe) === null) {
      report(`${label} measures probe ${receipt.probe}, which probes/ does not hold`);
      continue;
    }
    const entry = entryFor(measurement, partitionOf(heldOut, receipt.probe));
    if (entry === undefined) continue;
    if (entry.before === null && receipt.before !== null)
      report(`${label} records a before outcome for ${receipt.probe} with no before run to read it from`);
    if (entry.before !== null && receipt.before === null)
      report(
        `${label} records no before outcome for ${receipt.probe}; copy it from score ${entry.before.score}, the scored run the change is measured from`,
      );
    for (const side of ['before', 'after']) {
      const found = located.get(`${entry.partition}:${side}`);
      if (found === undefined || receipt[side] === null) continue;
      const outcome = reducedOutcome(folder, found.root, entry[side].score, receipt.probe);
      if (outcome === null)
        report(`${label} records a ${side} outcome for ${receipt.probe}, which score ${entry[side].score} does not hold`);
      else if (!sameReceipt(receipt[side], receiptOf(outcome)))
        report(
          `${label} records ${side} outcome ${JSON.stringify(receipt[side])} for ${receipt.probe}; score ${entry[side].score} records ${JSON.stringify(receiptOf(outcome))}`,
        );
    }
  }
  return notes;
}

/** Whether any run in the folder holds a completed score: Stage 10 has produced evidence a target finding can cite. */
function hasScoredRun(folder) {
  return namesIn(folder, 'runs', RUN_ID).some((run) =>
    namesIn(folder, `runs/${run}/scores`, RUN_ID).some((score) => folderJson(folder, `runs/${run}/scores/${score}/score.json`) !== null),
  );
}

/**
 * Every defect of `target-findings.json` (`problems`) and every reason it is not ready for the pull request (`readiness`). Absent,
 * the file has no defect, and readiness says whether one is due.
 *
 * @param {string} folder the evaluation folder by its real path
 * @param {{ evaluation: object, contract: object | undefined, validate: Function, describe: Function }} context
 * @returns {{ problems: Array<{ file: string, rule: string, message: string }>, readiness: Array<{ file: string, rule: string, message: string }> }}
 */
function reviewTargetFindings(folder, { evaluation, contract, validate, describe }) {
  const problems = [];
  const readiness = [];
  const add = (rule, message) => problems.push({ file: TARGET_FINDINGS_NAME, rule, message });
  const ready = (message) => readiness.push({ file: TARGET_FINDINGS_NAME, rule: RULE, message });
  const report = (message) => add(RULE, message);
  let present;
  try {
    present = fs.lstatSync(path.join(folder, TARGET_FINDINGS_NAME), { throwIfNoEntry: false }) !== undefined;
  } catch {
    present = true;
  }
  if (!present) {
    if (folderJson(folder, 'baseline/baseline.json') !== null || hasScoredRun(folder))
      ready(
        `the evaluation has scored evidence and no ${TARGET_FINDINGS_NAME}; record each problem found in the target with its decision, or an empty findings list when the evaluation found none`,
      );
    return { problems, readiness };
  }
  const read = readFolderFile(folder, TARGET_FINDINGS_NAME);
  if (!read.ok) {
    add('json', `${TARGET_FINDINGS_NAME} ${read.reason}`);
    return { problems, readiness };
  }
  let value;
  try {
    value = JSON.parse(read.bytes.toString('utf8'));
  } catch (error) {
    add('json', `does not parse as JSON: ${error.message}`);
    return { problems, readiness };
  }
  if (!validate(value)) {
    for (const line of [...new Set(describe(validate.errors, value))].slice(0, 10)) add('schema', line);
    return { problems, readiness };
  }
  if (typeof evaluation.evaluationId === 'string' && value.evaluationId !== evaluation.evaluationId)
    report(`evaluationId ${JSON.stringify(value.evaluationId)} is not ${MANIFEST_NAME}'s ${JSON.stringify(evaluation.evaluationId)}`);
  const behaviors = new Set(
    (Array.isArray(contract?.behaviors) ? contract.behaviors : []).map((behavior) => behavior?.id).filter((id) => typeof id === 'string'),
  );
  const heldOut = new Set(Array.isArray(evaluation.heldOutProbes) ? evaluation.heldOutProbes : []);
  const seen = new Set();
  const batch = new Map();
  let previous;
  for (const finding of value.findings) {
    const label = `finding ${finding.id}`;
    if (seen.has(finding.id)) add('duplicate-id', `finding ID ${JSON.stringify(finding.id)} is declared more than once`);
    else if (previous !== undefined && Number(finding.id.slice(2)) < Number(previous.slice(2)))
      report(`${label} follows ${previous}; list findings in ID order`);
    seen.add(finding.id);
    previous = finding.id;
    if (finding.behaviorId !== null && contract !== undefined && !behaviors.has(finding.behaviorId))
      add('reference', `${label} names behavior ${finding.behaviorId}, which contract.json does not declare`);
    const { evidence } = finding;
    const reproducedBy = evidence.reproducedBy;
    for (const [where, probe] of [
      ['cites', evidence.probe],
      ['reproduces on', reproducedBy?.probe],
    ]) {
      if (probe === undefined) continue;
      const committed = committedProbe(folder, probe);
      if (committed === null) add('reference', `${label} ${where} probe ${probe}, which probes/ does not hold`);
      else if (where === 'cites' && finding.source === 'clean-control-failure' && committed.expectedClean !== true) {
        // A probe that is no clean control runs its clean arm only in qualification (a seeded probe's first step, before its
        // mutation), and its trials run the mutated arm, so its clean arm fails only in that record.
        if (evidence.qualification === undefined)
          report(
            `${label} is a clean-control failure on ${probe}, which is not a clean control (expectedClean is not true); cite the qualification record of its clean arm (qualification baseline-pass)`,
          );
        else if (evidence.qualification !== CLEAN_ARM)
          report(
            `${label} cites qualification ${evidence.qualification} of ${probe}; only a clean control records ${evidence.qualification}, so cite ${CLEAN_ARM}, the clean arm ${probe} ran`,
          );
      }
    }
    if (evidence.record !== undefined) {
      const record = readFolderFile(folder, evidence.record);
      if (!record.ok) report(`${label} cites record ${evidence.record}, which ${record.reason}`);
      else if (finding.source === 'authoring' && !record.bytes.toString('utf8').includes(evidence.excerpt))
        report(`${label} quotes an excerpt ${evidence.record} does not hold; quote the record's own words`);
    }
    const notes = [checkRunEvidence(report, folder, label, finding, heldOut)];
    if (reproducedBy !== undefined) {
      if (heldOut.has(reproducedBy.probe))
        report(`${label} reproduces on held-out probe ${reproducedBy.probe}; a reproduction is a development probe`);
      else notes.push(checkRunEvidence(report, folder, `${label}'s reproduction`, { ...finding, evidence: reproducedBy }, heldOut));
    }
    const { disposition } = finding;
    if (disposition.decision === 'new-pr') {
      const handoff = readFolderFile(folder, disposition.handoff);
      if (!handoff.ok) report(`${label} hands off to ${disposition.handoff}, which ${handoff.reason}`);
      else if (!namesFinding(handoff.bytes.toString('utf8'), finding.id))
        report(`${label} hands off to ${disposition.handoff}, which does not name ${finding.id}`);
    }
    if (disposition.decision === 'undecided')
      ready(`${label} is undecided; decide this-pr, new-pr or declined with a reason before the pull request`);
    if (disposition.decision === 'this-pr') {
      if (disposition.measurement === undefined)
        ready(
          `${label} is decided this-pr and records no measurement; apply every this-pr change together, rerun and score each partition once, and record the before and after runs with each probe's outcomes`,
        );
      else notes.push(...checkMeasurement(report, folder, label, finding, { heldOut, batch }));
    }
    for (const note of notes) if (note !== null) ready(note);
  }
  // One decision point: a problem the batch rerun shows is never decided this-pr, since that would start another fix cycle.
  const afterRuns = new Set([...batch.values()].map((after) => after.run));
  for (const finding of value.findings)
    if (finding.disposition.decision === 'this-pr' && afterRuns.has(finding.evidence.run))
      report(
        `finding ${finding.id} comes from the rerun that measured the this-pr changes, so it cannot be decided this-pr; revert the change that caused it, hand it off new-pr, or stop and ask the adopter`,
      );
  return { problems, readiness };
}

/** The newest completed `run` invocation of the folder, or the one named, with its newest completed score. */
function scoredRun(folder, named) {
  const runs = named === undefined ? namesIn(folder, 'runs', RUN_ID).toReversed() : [named];
  for (const run of runs) {
    if (!RUN_ID.test(run)) continue;
    const record = folderJson(folder, `runs/${run}/run.json`);
    if (record?.command !== 'run') continue;
    // A run still in progress has neither finished nor stopped (the state `status` reads); a run that stopped at exit 11 keeps its
    // outcome and its qualification evidence, so it stays.
    if (named === undefined && record.completed !== true && !isPlainObject(record.outcome)) continue;
    const score = namesIn(folder, `runs/${run}/scores`, RUN_ID)
      .toReversed()
      .find((candidate) => folderJson(folder, `runs/${run}/scores/${candidate}/score.json`) !== null);
    return { run, score: score ?? null };
  }
  return null;
}

/**
 * The target-finding candidates one run's evidence holds: a clean control whose trials read false-positive (in every trial, or only
 * some), a development probe whose clean arm did not hold in qualification (a clean control's baseline, or a seeded probe's clean
 * arm before its mutation; a run that stopped at exit 11 has no score, and this keeps its evidence), a held-out probe with a failing
 * vote (by its gap-view row alone), a path a trial opened outside its allowlist, and a process finding of a clean control's trial. Each candidate is evidence to classify: Stage 11 decides whether the target or the
 * instrument is at fault, and only the target's become findings.
 *
 * @param {string} folder
 * @param {{ run?: string, evaluation: object, contract: object | undefined }} options
 * @returns {{ run: string, score: string | null, candidates: object[] } | null} null when the folder holds no such run
 */
function draftTargetFindings(folder, { run, evaluation, contract }) {
  const found = scoredRun(folder, run);
  if (found === null) return null;
  const root = `runs/${found.run}`;
  const heldOut = new Set(Array.isArray(evaluation.heldOutProbes) ? evaluation.heldOutProbes : []);
  const severities = new Map(
    (Array.isArray(contract?.behaviors) ? contract.behaviors : []).map((behavior) => [behavior?.id, behavior?.severity]),
  );
  const candidates = [];
  const candidate = (probe, source, evidence) =>
    candidates.push({ source, evidence, behaviorId: probe.behaviorId ?? null, severity: severities.get(probe.behaviorId) ?? null });
  for (const name of namesIn(folder, 'probes', /^P-[0-9]{3,}\.probe\.json$/)) {
    const probe = folderJson(folder, `probes/${name}`);
    if (probe === null || typeof probe.probeId !== 'string') continue;
    const id = probe.probeId;
    const clean = probe.expectedClean === true;
    // A held-out probe's qualification stays closed; a probe whose route has no clean arm (historical, gameability) holds no record.
    for (const phase of heldOut.has(id) ? [] : clean ? [CLEAN_ARM, KNOWN_FAILING_ARM] : [CLEAN_ARM]) {
      const record = folderJson(folder, `${root}/qualification/${id}/${phase}.json`);
      if (showsFailure(record)) candidate(probe, 'clean-control-failure', { run: found.run, probe: id, qualification: phase });
    }
    if (found.score !== null && (clean || heldOut.has(id))) {
      const outcome = reducedOutcome(folder, root, found.score, id);
      const votes = votesOf(outcome);
      const failing = [...votes.entries()]
        .filter(([, state]) => FAILING.has(state))
        .map(([trial]) => trial)
        .sort((left, right) => left - right);
      if (outcome !== null && failing.length > 0) {
        const passing = [...votes.values()].some((state) => PASSING.has(state));
        const source = passing ? 'intermittent-behavior' : clean ? 'clean-control-failure' : 'behavior-failure';
        const evidence = { run: found.run, score: found.score, probe: id };
        if (heldOut.has(id)) evidence.gapView = { probeClass: probe.probeClass, ...receiptOf(outcome) };
        else {
          evidence.trials = failing;
          if (source === 'intermittent-behavior') evidence.trialCount = votes.size;
        }
        candidate(probe, source, evidence);
      }
    }
    if (heldOut.has(id)) continue;
    const trialSet = `${root}/trial-sets/${id}`;
    const manifest = folderJson(folder, `${trialSet}/isolation-manifest.json`);
    const outside = outsideAllowlist(manifest) ?? [];
    if (outside.length > 0) candidate(probe, 'isolation-violation', { run: found.run, probe: id, paths: outside });
    if (!clean || found.score === null) continue;
    const phases = folderJson(folder, `${root}/operation-phases.json`);
    const sealed = folderJson(folder, `${root}/eval-contract.json`);
    if (phases === null || sealed === null) continue;
    const oracles = new Map((Array.isArray(sealed.oracles) ? sealed.oracles : []).map((oracle) => [oracle?.id, oracle]));
    const byFinding = new Map();
    for (const trial of recordNumbers(folder, trialSet)) {
      const record = folderJson(folder, `${trialSet}/record-${trial}.json`);
      if (record === null) continue;
      let process;
      try {
        ({ process } = projectTrial(record, phases, oracles));
      } catch {
        continue;
      }
      for (const findingId of process) byFinding.set(findingId, [...(byFinding.get(findingId) ?? []), trial]);
    }
    for (const [findingId, trials] of byFinding)
      candidate(probe, 'process-finding', {
        run: found.run,
        score: found.score,
        probe: id,
        trials: trials.sort((left, right) => left - right),
        finding: findingId,
      });
  }
  return { run: found.run, score: found.score, candidates };
}

module.exports = { TARGET_FINDINGS_NAME, draftTargetFindings, reviewTargetFindings };
