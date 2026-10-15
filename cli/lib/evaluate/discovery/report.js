/**
 * The evidence and decision projection of a discovery campaign: every candidate record of
 * `discovery/<campaignId>/`, as JSON and as text, so a reviewer sees what was proposed, what was observed, what was
 * decided and what is still open.
 *
 * The projection is advisory. It computes no score and recalculates no native verdict: each row repeats what the record
 * holds, and the totals add those rows up. A stop is as visible as a success: a candidate that errored, one whose trials
 * went missing, a candidate file that cannot be read, an accepted risk and a promotion that is still waiting for its
 * native qualification each have a row and a count. The text prints free text through the same escaping `tea-evaluate`
 * applies to its findings, so a hypothesis, a rationale or a file name cannot start a forged line.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { CandidateError, DISCOVERY_DIRECTORY, readCandidate } = require('./candidate');
const { ReviewError } = require('./review');
const { escapeUnprintable, findingLine } = require('../finding-lines');

const REPORT_KIND = 'exploratory-candidate-report';
const REPORT_VERSION = 1;
const CAMPAIGN_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CANDIDATE_SUFFIX = '.candidate.json';
const TRIAL_KEYS = Object.freeze(['planned', 'completed', 'errors', 'missing']);

/**
 * Reads every candidate file of a campaign. A file the reader refuses is kept as an unreadable entry with its problems, so
 * a candidate never drops out of the report because it is invalid.
 *
 * @param {string} folder the evaluation folder
 * @param {string} campaignId
 * @returns {{campaignId: string, candidates: object[], unreadable: Array<{file: string, problems: string[]}>}}
 * @throws {ReviewError} when the campaign ID is malformed or the campaign directory is absent
 */
function readCampaign(folder, campaignId) {
  if (typeof campaignId !== 'string' || !CAMPAIGN_ID.test(campaignId)) {
    throw new ReviewError([`${JSON.stringify(campaignId)} is not a campaign ID (lowercase words joined by hyphens)`]);
  }
  const directory = `${DISCOVERY_DIRECTORY}/${campaignId}`;
  let names;
  try {
    names = fs.readdirSync(path.join(folder, directory));
  } catch {
    throw new ReviewError([`${directory} does not exist in the evaluation folder`]);
  }
  const candidates = [];
  const unreadable = [];
  for (const name of names.filter((entry) => entry.endsWith(CANDIDATE_SUFFIX)).sort()) {
    const file = `${directory}/${name}`;
    try {
      candidates.push(readCandidate(folder, file));
    } catch (error) {
      if (!(error instanceof CandidateError)) throw error;
      unreadable.push({ file, problems: error.problems });
    }
  }
  return { campaignId, candidates, unreadable };
}

/** What a reviewer does next with a candidate in this state. */
function nextAction(record) {
  switch (record.state) {
    case 'generated':
    case 'applicable': {
      return 'observe the baseline and candidate arms';
    }
    case 'observed': {
      if (record.disposition === 'target-error') return 'fix the target error and observe again; the evidence supports no review';
      if (record.disposition === 'undetermined') return 'collect the missing or errored trials and observe again';
      return 'classify the observations, then review';
    }
    case 'reviewed': {
      return record.disposition.startsWith('confirmed-undesirable')
        ? 'promote to a draft mutation'
        : `none; the review concluded ${record.disposition}`;
    }
    case 'promoted': {
      return record.promotion.qualificationReceipt === null
        ? 'author the probe and oracle that demonstrate the defect, then run tea-evaluate check, preflight and scoring; the draft counts for nothing until a native qualification receipt exists'
        : 'none; the native qualified probe carries the defect from here';
    }
    default: {
      return 'review by hand; this report does not recognize the state';
    }
  }
}

/** The tally of `values`, keyed by value, in first-seen order. */
function tally(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

/** One candidate as a report row: what the record holds, nothing recomputed. */
function candidateRow(record) {
  return {
    candidateId: record.candidateId,
    identity: record.identity,
    state: record.state,
    disposition: record.disposition,
    hypothesis: record.hypothesis,
    edit: { target: record.target.artifact, find: record.edit.find, replace: record.edit.replace },
    observations: record.observations.map(({ observationId, arm, evidence, trials }) => ({ observationId, arm, evidence, trials })),
    independentEvidence: record.independentEvidence.map(({ kind, reference, digest }) => ({ kind, reference, digest })),
    review:
      record.review === null
        ? null
        : { reviewer: record.review.reviewer, decidedAt: record.review.decidedAt, rationale: record.review.rationale },
    acceptedRisk:
      record.acceptedRisk === null
        ? null
        : {
            reviewer: record.acceptedRisk.reviewer,
            decidedAt: record.acceptedRisk.decidedAt,
            rationale: record.acceptedRisk.rationale,
            revisitWhen: record.acceptedRisk.revisitWhen,
          },
    promotion:
      record.promotion === null
        ? null
        : {
            draftMutationId: record.promotion.draftMutationId,
            qualification: record.promotion.qualificationReceipt === null ? 'pending' : 'receipt-attached',
          },
    nextAction: nextAction(record),
  };
}

/**
 * The projection of a campaign as JSON-serializable data.
 *
 * @param {ReturnType<typeof readCampaign>} campaign
 * @returns {object}
 */
function projectCampaign(campaign) {
  const rows = campaign.candidates.map((record) => candidateRow(record));
  const trials = Object.fromEntries(TRIAL_KEYS.map((key) => [key, 0]));
  for (const row of rows) {
    for (const observation of row.observations) for (const key of TRIAL_KEYS) trials[key] += observation.trials[key];
  }
  return {
    kind: REPORT_KIND,
    schemaVersion: REPORT_VERSION,
    advisory: true,
    campaignId: campaign.campaignId,
    counts: {
      files: rows.length + campaign.unreadable.length,
      candidates: rows.length,
      unreadable: campaign.unreadable.length,
      byState: tally(rows.map((row) => row.state)),
      byDisposition: tally(rows.map((row) => row.disposition ?? 'none')),
      trials,
      acceptedRisk: rows.filter((row) => row.acceptedRisk !== null).length,
      promotions: {
        pendingQualification: rows.filter((row) => row.promotion?.qualification === 'pending').length,
        receiptAttached: rows.filter((row) => row.promotion?.qualification === 'receipt-attached').length,
      },
    },
    candidates: rows,
    unreadable: campaign.unreadable.map(({ file, problems }) => ({ file, problems })),
  };
}

/** `counts` as `name n, name n`, or `none`. */
function listCounts(counts) {
  const entries = Object.entries(counts);
  return entries.length === 0 ? 'none' : entries.map(([name, count]) => `${name} ${count}`).join(', ');
}

/** `value` as one printable line. */
function line(value) {
  return escapeUnprintable(value);
}

/** The trial counts of an observation as text. */
function trialText(trials) {
  return TRIAL_KEYS.map((key) => `${key} ${trials[key]}`).join(' ');
}

/**
 * The projection as text a person reads.
 *
 * @param {ReturnType<typeof projectCampaign>} report
 * @returns {string}
 */
function renderCampaign(report) {
  const { counts } = report;
  const lines = [
    `campaign ${line(report.campaignId)}: advisory evidence for review; nothing here is scored`,
    `files ${counts.files}: ${counts.candidates} readable, ${counts.unreadable} unreadable`,
    `states: ${listCounts(counts.byState)}`,
    `dispositions: ${listCounts(counts.byDisposition)}`,
    `trials: ${trialText(counts.trials)}`,
    `accepted risk: ${counts.acceptedRisk}, kept in every count`,
    `promotions: ${counts.promotions.pendingQualification} pending native qualification, ${counts.promotions.receiptAttached} with a receipt`,
  ];
  for (const row of report.candidates) {
    lines.push(
      '',
      `${row.candidateId} ${row.state} ${row.disposition ?? 'no disposition'}`,
      `  hypothesis: ${line(row.hypothesis)}`,
      `  edit ${line(row.edit.target)}`,
      `    - ${line(row.edit.find)}`,
      `    + ${line(row.edit.replace)}`,
    );
    for (const observation of row.observations) {
      lines.push(`  ${observation.arm} ${observation.observationId}: ${trialText(observation.trials)} evidence ${observation.evidence}`);
    }
    if (row.observations.length === 0) lines.push('  observations: none');
    for (const evidence of row.independentEvidence) {
      lines.push(`  independent evidence: ${line(evidence.kind)}, ${line(evidence.reference)} (${evidence.digest})`);
    }
    if (row.review !== null) {
      lines.push(`  review: ${line(row.review.reviewer)} at ${line(row.review.decidedAt)}: ${line(row.review.rationale)}`);
    }
    if (row.acceptedRisk !== null) {
      lines.push(
        `  accepted risk: ${line(row.acceptedRisk.reviewer)} at ${line(row.acceptedRisk.decidedAt)}: ${line(row.acceptedRisk.rationale)}; revisit when ${line(row.acceptedRisk.revisitWhen)}`,
      );
    }
    if (row.promotion !== null) {
      lines.push(`  promotion: draft mutation ${row.promotion.draftMutationId}, qualification ${row.promotion.qualification}`);
    }
    lines.push(`  next: ${row.nextAction}`);
  }
  if (report.unreadable.length > 0) lines.push('', 'unreadable:');
  const printed = lines.map((text) => `${text}\n`);
  for (const { file, problems } of report.unreadable) printed.push(findingLine(file, 'unreadable-candidate', problems.join('; ')));
  return printed.join('');
}

module.exports = { REPORT_KIND, REPORT_VERSION, projectCampaign, readCampaign, renderCampaign };
