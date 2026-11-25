/**
 * `target-findings.json`: what an evaluation found wrong or weak in the target itself, and the adopter's decision on each.
 *
 * Stage 11 classifies every failure or weakness as an instrument problem, which the gap loop repairs, or a target problem, which
 * becomes a target finding here. `check` holds the file to its schema and to the folder (`targetFindingsProblems`): the evaluation
 * it names, the contract behaviors and committed probes it cites, the authoring record and handoff it names, and, where the cited
 * run's evidence is on disk (the run directory, or `baseline/` for the accepted run), the trial records, score invocation,
 * isolation-manifest paths and interpretation finding it cites. A held-out probe is cited by its gap-view row alone, so a held-out
 * trial, path or finding is refused and nothing of a held-out trial set is read.
 *
 * Readiness is advice while the gap loop runs (`targetFindingsWarnings`): an undecided finding, a this-pr finding with no measured
 * rerun, and a scored evaluation with no file are warnings, so the loop's own `check` keeps passing until the one decision point at
 * the end of Stage 11, and the pre-PR checklist requires `check` to print none of them.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { MANIFEST_NAME, readFolderFile } = require('./folder');

const TARGET_FINDINGS_NAME = 'target-findings.json';
const RULE = 'target-findings';
const RUN_ID = /^[A-Za-z0-9_-]+$/;
const PROBE_ID = /^P-[0-9]{3,}$/;

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
    const stats = fs.lstatSync(current, { throwIfNoEntry: false });
    if (stats === undefined || stats.isSymbolicLink() || !stats.isDirectory()) return false;
  }
  return true;
}

/**
 * Where a cited run's evidence lives in the folder: its run directory, or `baseline/` when the run is the accepted one, or null
 * when neither is on disk (runs are gitignored, so a run made on another machine is cited and not verified).
 */
function evidenceRoot(folder, run) {
  if (typeof run !== 'string' || !RUN_ID.test(run)) return null;
  if (isFolderDirectory(folder, `runs/${run}`) && folderJson(folder, `runs/${run}/run.json`) !== null)
    return { root: `runs/${run}`, run: true };
  const baseline = folderJson(folder, 'baseline/baseline.json');
  if (baseline?.acceptedRun === run) return { root: 'baseline', run: false };
  return null;
}

/** The record numbers a trial set holds, from its `record-<n>.json` files. */
function recordNumbers(folder, trialSet) {
  return fs
    .readdirSync(path.join(folder, ...trialSet.split('/')), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^record-[1-9][0-9]*\.json$/.test(entry.name))
    .map((entry) => Number(entry.name.slice('record-'.length, -'.json'.length)));
}

function checkEvidence(report, folder, label, finding, heldOut) {
  const evidence = finding.evidence;
  const probe = evidence.probe;
  if (probe !== undefined && heldOut.has(probe)) {
    for (const field of ['trials', 'paths', 'finding'])
      if (evidence[field] !== undefined)
        report(
          `${label} cites ${field} of held-out probe ${probe}; cite a held-out probe by its gap-view.json row alone (run, score and probe), and reproduce the failure on a development probe to cite its trials`,
        );
    return;
  }
  if (evidence.trials !== undefined && evidence.trialCount !== undefined) {
    const over = evidence.trials.filter((trial) => trial > evidence.trialCount);
    if (over.length > 0) report(`${label} cites trial ${over.join(', ')} of ${evidence.trialCount}`);
    if (finding.source === 'intermittent-behavior' && evidence.trials.length >= evidence.trialCount)
      report(
        `${label} cites every trial of ${evidence.trialCount} as failing, so the behavior does not fail only some trials; record it as the failure it is`,
      );
  }
  const located = evidenceRoot(folder, evidence.run);
  if (located === null || probe === undefined) return;
  const { root } = located;
  const trialSet = `${root}/trial-sets/${probe}`;
  if (!isFolderDirectory(folder, trialSet)) {
    report(`${label} cites probe ${probe} of run ${evidence.run}, whose evidence (${root}/) holds no trial set for it`);
    return;
  }
  const numbers = recordNumbers(folder, trialSet);
  for (const trial of evidence.trials ?? [])
    if (!numbers.includes(trial))
      report(`${label} cites trial ${trial} of probe ${probe}; ${trialSet}/record-${trial}.json does not exist`);
  if (evidence.trialCount !== undefined && evidence.trialCount !== numbers.length)
    report(`${label} records trialCount ${evidence.trialCount}; ${trialSet} holds ${numbers.length} trial record(s)`);
  if (evidence.score !== undefined && !isFolderDirectory(folder, `${root}/scores/${evidence.score}/${probe}`))
    report(
      `${label} cites score invocation ${evidence.score} of run ${evidence.run}, which holds no score of probe ${probe} under ${root}/scores/`,
    );
  if (evidence.paths !== undefined) {
    const manifest = folderJson(folder, `${trialSet}/isolation-manifest.json`);
    if (manifest === null) report(`${label} cites isolation paths of probe ${probe}; ${trialSet}/isolation-manifest.json cannot be read`);
    else {
      const observed = new Set(Array.isArray(manifest.observedMounts) ? manifest.observedMounts : []);
      for (const cited of evidence.paths)
        if (!observed.has(cited))
          report(`${label} cites path ${JSON.stringify(cited)}, which ${trialSet}/isolation-manifest.json does not list in observedMounts`);
    }
  }
  if (evidence.finding !== undefined && located.run) {
    const interpretation = folderJson(folder, `${root}/interpretation.json`);
    if (interpretation?.scoreInvocationId !== evidence.score) return;
    const entry = (Array.isArray(interpretation.probes) ? interpretation.probes : []).find((candidate) => candidate?.probeId === probe);
    const trials = (Array.isArray(entry?.trials) ? entry.trials : []).filter(
      (trial) => evidence.trials === undefined || evidence.trials.includes(trial?.trialIndex),
    );
    if (!trials.some((trial) => Array.isArray(trial?.process) && trial.process.includes(evidence.finding)))
      report(
        `${label} cites finding ${JSON.stringify(evidence.finding)}, which ${root}/interpretation.json does not list under process for probe ${probe}${evidence.trials === undefined ? '' : ` in trial ${evidence.trials.join(', ')}`}`,
      );
  }
}

/**
 * Every defect of `target-findings.json` beyond its schema. Absent, the file has none: an evaluation records it at Stage 11, and
 * `targetFindingsWarnings` says when one is due.
 *
 * @param {(file: string, rule: string, message: string) => void} add the check report's `add`
 * @param {string} folder the evaluation folder by its real path
 * @param {{ evaluation: object, contract: object | undefined, validate: Function, describe: Function }} context
 */
function targetFindingsProblems(add, folder, { evaluation, contract, validate, describe }) {
  if (fs.lstatSync(path.join(folder, TARGET_FINDINGS_NAME), { throwIfNoEntry: false }) === undefined) return;
  const read = readFolderFile(folder, TARGET_FINDINGS_NAME);
  if (!read.ok) {
    add(TARGET_FINDINGS_NAME, 'json', `${TARGET_FINDINGS_NAME} ${read.reason}`);
    return;
  }
  let value;
  try {
    value = JSON.parse(read.bytes.toString('utf8'));
  } catch (error) {
    add(TARGET_FINDINGS_NAME, 'json', `does not parse as JSON: ${error.message}`);
    return;
  }
  if (!validate(value)) {
    for (const line of [...new Set(describe(validate.errors, value))].slice(0, 10)) add(TARGET_FINDINGS_NAME, 'schema', line);
    return;
  }
  const report = (message) => add(TARGET_FINDINGS_NAME, RULE, message);
  if (typeof evaluation.evaluationId === 'string' && value.evaluationId !== evaluation.evaluationId)
    report(`evaluationId ${JSON.stringify(value.evaluationId)} is not ${MANIFEST_NAME}'s ${JSON.stringify(evaluation.evaluationId)}`);
  const behaviors = new Set(
    (Array.isArray(contract?.behaviors) ? contract.behaviors : []).map((behavior) => behavior?.id).filter((id) => typeof id === 'string'),
  );
  const heldOut = new Set(Array.isArray(evaluation.heldOutProbes) ? evaluation.heldOutProbes : []);
  const seen = new Set();
  let previous;
  for (const finding of value.findings) {
    const label = `finding ${finding.id}`;
    if (seen.has(finding.id))
      add(TARGET_FINDINGS_NAME, 'duplicate-id', `finding ID ${JSON.stringify(finding.id)} is declared more than once`);
    else if (previous !== undefined && Number(finding.id.slice(2)) < Number(previous.slice(2)))
      report(`${label} follows ${previous}; list findings in ID order`);
    seen.add(finding.id);
    previous = finding.id;
    if (finding.behaviorId !== null && contract !== undefined && !behaviors.has(finding.behaviorId))
      add(TARGET_FINDINGS_NAME, 'reference', `${label} names behavior ${finding.behaviorId}, which contract.json does not declare`);
    const probe = finding.evidence.probe;
    if (probe !== undefined) {
      const committed = PROBE_ID.test(probe) ? folderJson(folder, `probes/${probe}.probe.json`) : null;
      if (committed === null) add(TARGET_FINDINGS_NAME, 'reference', `${label} cites probe ${probe}, which probes/ does not hold`);
      else if (finding.source === 'clean-control-failure' && committed.expectedClean !== true)
        report(`${label} is a clean-control failure on ${probe}, which is not a clean control (expectedClean is not true)`);
    }
    if (finding.evidence.record !== undefined) {
      const record = readFolderFile(folder, finding.evidence.record);
      if (!record.ok) report(`${label} cites record ${finding.evidence.record}, which ${record.reason}`);
      else if (finding.source === 'authoring' && !record.bytes.toString('utf8').includes(finding.evidence.excerpt))
        report(`${label} quotes an excerpt ${finding.evidence.record} does not hold; quote the record's own words`);
    }
    const { disposition } = finding;
    if (disposition.decision === 'new-pr') {
      const handoff = readFolderFile(folder, disposition.handoff);
      if (!handoff.ok) report(`${label} hands off to ${disposition.handoff}, which ${handoff.reason}`);
      else if (!handoff.bytes.toString('utf8').includes(finding.id))
        report(`${label} hands off to ${disposition.handoff}, which does not name ${finding.id}`);
    }
    if (disposition.measurement !== undefined && disposition.measurement.before.run === disposition.measurement.after.run)
      report(
        `${label} measures run ${disposition.measurement.before.run} before and after; the after run is the rerun with every this-pr change applied`,
      );
    checkEvidence(report, folder, label, finding, heldOut);
  }
}

/** Whether any run in the folder holds a completed score: Stage 10 has produced evidence a target finding can cite. */
function hasScoredRun(folder) {
  if (!isFolderDirectory(folder, 'runs')) return false;
  for (const run of fs.readdirSync(path.join(folder, 'runs')).filter((name) => RUN_ID.test(name))) {
    if (!isFolderDirectory(folder, `runs/${run}/scores`)) continue;
    for (const score of fs.readdirSync(path.join(folder, 'runs', run, 'scores')).filter((name) => RUN_ID.test(name)))
      if (folderJson(folder, `runs/${run}/scores/${score}/score.json`) !== null) return true;
  }
  return false;
}

/**
 * The readiness warnings: a scored evaluation (an accepted baseline or a completed score) with no `target-findings.json`, each
 * undecided finding, and each this-pr finding with no measured rerun. A file that does not parse or has no findings list is the
 * findings' to report, so it warns of nothing.
 *
 * @param {string} folder
 * @returns {Array<{ file: string, rule: string, message: string }>}
 */
function targetFindingsWarnings(folder) {
  const warn = (message) => ({ file: TARGET_FINDINGS_NAME, rule: RULE, message });
  if (fs.lstatSync(path.join(folder, TARGET_FINDINGS_NAME), { throwIfNoEntry: false }) === undefined) {
    const scored = folderJson(folder, 'baseline/baseline.json') !== null || hasScoredRun(folder);
    return scored
      ? [
          warn(
            `the evaluation has scored evidence and no ${TARGET_FINDINGS_NAME}; record each target problem with its decision at the end of Stage 11, or an empty findings list when the evaluation found none`,
          ),
        ]
      : [];
  }
  const value = folderJson(folder, TARGET_FINDINGS_NAME);
  if (value === null || !Array.isArray(value.findings)) return [];
  const warnings = [];
  for (const finding of value.findings) {
    if (!isPlainObject(finding) || typeof finding.id !== 'string' || !isPlainObject(finding.disposition)) continue;
    if (finding.disposition.decision === 'undecided')
      warnings.push(warn(`finding ${finding.id} is undecided; decide this-pr, new-pr or declined with a reason at the end of Stage 11`));
    else if (finding.disposition.decision === 'this-pr' && finding.disposition.measurement === undefined)
      warnings.push(
        warn(
          `finding ${finding.id} is decided this-pr and records no measurement; apply every this-pr change together, rerun and score development and held-out once, and record the before and after runs`,
        ),
      );
  }
  return warnings;
}

module.exports = { TARGET_FINDINGS_NAME, targetFindingsProblems, targetFindingsWarnings };
