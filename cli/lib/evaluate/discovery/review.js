/**
 * Offline review and promotion of an exploratory candidate.
 *
 * A candidate that ran leaves two observations (the baseline arm and the candidate arm), each pointing at the retained
 * evidence it summarizes. This module reads that evidence and, when an independent reference supplies the expected
 * behavior, classifies what the candidate did:
 *
 * - `target-error`: an arm recorded errors and not one completed trial.
 * - `undetermined`: an arm is short of its planned trials, an evidence file is absent or no longer digests to what the
 *   record names, the baseline varies between trials, the arms ran different inputs, the outputs differ with no
 *   independent label to say which is right, or the baseline itself departs from the reference.
 * - `observationally-unchanged`: every sampled input produced the same output on both arms. That says nothing about an
 *   input nobody sampled, so it is never read as equivalence.
 * - `confirmed-undesirable-caught` and `confirmed-undesirable-missed`: the candidate arm departs from an independent
 *   reference where the baseline matches it; the evaluator failed the departing trial (caught) or passed it (missed).
 *
 * The classification is a suggestion that decides nothing. A review records a person's decision, bound to the
 * candidate's identity, its determination and the observations it rested on, and a confirmed or unchanged conclusion is
 * accepted only where the evidence classifies the same way. A reviewer can always decline to conclude. A promotion turns
 * a reviewed, confirmed candidate into the draft native `replace-exact` mutation and records no qualification: the draft
 * is checked, compiled, sealed, qualified and scored by the native path like any authored mutation, and the record
 * carries no receipt until that path produces one.
 *
 * Nothing here calls a model, a process or the network, and nothing writes outside `discovery/` and the draft mutation.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  REVIEW_DISPOSITIONS,
  bytesDigest,
  canonicalJson,
  decisionScope,
  draftMutation,
  readCandidate,
  readHeldFile,
  validateCandidate,
} = require('./candidate');

/** A review or promotion that cannot proceed; `problems` lists every reason. */
class ReviewError extends Error {
  constructor(problems) {
    super(`cannot review or promote the candidate: ${problems.join('; ')}`);
    this.name = 'ReviewError';
    this.problems = problems;
  }
}

const ARMS = Object.freeze(['baseline', 'candidate']);
const MUTATION_FILE = /^M-([0-9]{3,})\.mutation\.json$/;
const EVALUATOR_VERDICTS = new Set(['pass', 'fail']);

/** A plain object, not an array or null. */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The trials one observation's evidence file holds, or the reasons it cannot be used. The evidence is the JSON object
 * `{arm, trials: [{trial, input, status, output?, evaluator?, error?}]}`; a completed trial of the candidate arm also
 * carries the evaluator's verdict on it, `pass` or `fail`.
 */
function readEvidence(observation, bytes) {
  const label = `${observation.observationId} (${observation.arm})`;
  if (bytes === undefined) return { problems: [`${label} evidence is not held, so the original observation cannot be read`] };
  const actual = bytesDigest(bytes);
  if (actual !== observation.evidence) {
    return { problems: [`${label} evidence digests to ${actual}; the record retained ${observation.evidence}`] };
  }
  let value;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return { problems: [`${label} evidence is not JSON text`] };
  }
  if (!isObject(value) || value.arm !== observation.arm || !Array.isArray(value.trials)) {
    return { problems: [`${label} evidence is not {arm: ${observation.arm}, trials: [...]}`] };
  }
  const problems = [];
  const trials = [];
  for (const [index, trial] of value.trials.entries()) {
    const at = `${label} trials[${index}]`;
    if (!isObject(trial) || typeof trial.input !== 'string' || trial.input === '') {
      problems.push(`${at} names no input`);
    } else if (trial.status === 'completed') {
      if (typeof trial.output !== 'string') problems.push(`${at} is completed with no output`);
      else if (observation.arm === 'candidate' && !EVALUATOR_VERDICTS.has(trial.evaluator)) {
        problems.push(`${at} is completed with no evaluator verdict, so a miss cannot be told from a catch`);
      } else trials.push({ input: trial.input, output: trial.output, evaluator: trial.evaluator });
    } else if (trial.status === 'error') {
      if (typeof trial.error !== 'string' || trial.error === '') problems.push(`${at} is an error with no message`);
      else trials.push({ input: trial.input, error: trial.error });
    } else {
      problems.push(
        `${at} has status ${JSON.stringify(trial.status)}; a trial is completed or an error, and an absent trial is counted as missing`,
      );
    }
  }
  const completed = trials.filter((trial) => trial.error === undefined).length;
  const errors = trials.length - completed;
  if (completed !== observation.trials.completed || errors !== observation.trials.errors) {
    problems.push(
      `${label} evidence holds ${completed} completed and ${errors} errored trials; the record counts ${observation.trials.completed} and ${observation.trials.errors}`,
    );
  }
  return problems.length > 0 ? { problems } : { problems, trials };
}

/** The reference file's labels, or the reason it cannot be used. It is `{kind, reference, cases: {input: expected output}}`. */
function readReference(bytes) {
  let value;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return { problem: 'the independent reference is not JSON text' };
  }
  const valid =
    isObject(value) &&
    typeof value.kind === 'string' &&
    typeof value.reference === 'string' &&
    value.reference !== '' &&
    isObject(value.cases) &&
    Object.values(value.cases).every((expected) => typeof expected === 'string');
  if (!valid) return { problem: 'the independent reference is not {kind, reference, cases: {input: expected output}}' };
  return {
    cases: new Map(Object.entries(value.cases)),
    evidence: { kind: value.kind, reference: value.reference, digest: bytesDigest(bytes) },
  };
}

/** The outputs per input of an arm's completed trials, or the inputs whose repeated trials disagree. */
function outputsByInput(trials) {
  const outputs = new Map();
  const varying = new Set();
  for (const trial of trials.filter((entry) => entry.error === undefined)) {
    if (outputs.has(trial.input) && outputs.get(trial.input).output !== trial.output) varying.add(trial.input);
    if (!outputs.has(trial.input)) outputs.set(trial.input, { output: trial.output, evaluators: [] });
    outputs.get(trial.input).evaluators.push(trial.evaluator);
  }
  return { outputs, varying: [...varying] };
}

/**
 * Classifies what a candidate did from the evidence the record retains.
 *
 * @param {object} record a candidate with observations
 * @param {{evidence?: Record<string, Uint8Array>, reference?: Uint8Array}} [inputs] the bytes of each observation's
 *   evidence file by observation ID, and the bytes of the independent reference
 * @returns {{disposition: string, reasons: string[], arms: object, compared: number, deviations: object[], independentEvidence: object|null}}
 *   `disposition` is a candidate disposition, never a native outcome; `reasons` says why, every missing, errored or
 *   unreadable piece of evidence included
 */
function classifyCandidate(record, { evidence = {}, reference } = {}) {
  const reasons = [];
  const arms = {};
  const trialsByArm = { baseline: [], candidate: [] };
  for (const arm of ARMS) arms[arm] = { planned: 0, completed: 0, errors: 0, missing: 0 };
  for (const observation of record.observations) {
    for (const key of Object.keys(arms[observation.arm])) arms[observation.arm][key] += observation.trials[key];
    const read = readEvidence(observation, evidence[observation.observationId]);
    reasons.push(...read.problems);
    if (read.trials) trialsByArm[observation.arm].push(...read.trials);
  }
  const result = (disposition, extra = {}) => ({
    disposition,
    reasons,
    arms,
    compared: 0,
    deviations: [],
    independentEvidence: null,
    ...extra,
  });

  for (const arm of ARMS) {
    const { planned, completed, errors, missing } = arms[arm];
    if (record.observations.every((observation) => observation.arm !== arm)) {
      reasons.push(`the ${arm} arm has no observation`);
    } else if (completed === 0 && errors > 0) {
      reasons.push(`the ${arm} arm recorded ${errors} errored trials and no completed one`);
      return result('target-error');
    } else if (completed === 0 || completed < planned) {
      reasons.push(`the ${arm} arm completed ${completed} of ${planned} planned trials (${errors} errored, ${missing} missing)`);
    }
  }
  if (reasons.length > 0) return result('undetermined');

  const baseline = outputsByInput(trialsByArm.baseline);
  const candidate = outputsByInput(trialsByArm.candidate);
  for (const [arm, { varying }] of [
    ['baseline', baseline],
    ['candidate', candidate],
  ]) {
    for (const input of varying) reasons.push(`the ${arm} arm produced different outputs for input ${JSON.stringify(input)} across trials`);
  }
  const inputs = new Set([...baseline.outputs.keys(), ...candidate.outputs.keys()]);
  for (const input of inputs) {
    if (!baseline.outputs.has(input) || !candidate.outputs.has(input)) {
      reasons.push(`input ${JSON.stringify(input)} ran on only one arm, so the arms are not comparable there`);
    }
  }
  if (reasons.length > 0) return result('undetermined', { compared: inputs.size });

  const differing = [...inputs].filter((input) => baseline.outputs.get(input).output !== candidate.outputs.get(input).output);
  if (differing.length === 0) {
    reasons.push(
      `all ${inputs.size} sampled inputs produced the same output on both arms; an input nobody sampled may still differ, so this is not equivalence`,
    );
    return result('observationally-unchanged', { compared: inputs.size });
  }

  if (reference === undefined) {
    reasons.push(
      `the outputs differ on ${differing.length} of ${inputs.size} inputs and no independent reference says which output is right`,
    );
    return result('undetermined', { compared: inputs.size });
  }
  const labels = readReference(reference);
  if (labels.problem) {
    reasons.push(labels.problem);
    return result('undetermined', { compared: inputs.size });
  }
  const deviations = [];
  for (const input of differing) {
    const expected = labels.cases.get(input);
    const seen = { input, expected, baseline: baseline.outputs.get(input).output, candidate: candidate.outputs.get(input).output };
    if (expected === undefined) {
      reasons.push(`input ${JSON.stringify(input)} differs between the arms and the independent reference does not label it`);
    } else if (seen.baseline === expected) {
      deviations.push({ ...seen, evaluators: candidate.outputs.get(input).evaluators });
    } else {
      reasons.push(
        `the baseline departs from the independent reference on input ${JSON.stringify(input)}, so the difference is not attributable to the edit`,
      );
    }
  }
  if (reasons.length > 0 || deviations.length === 0) {
    return result('undetermined', { compared: inputs.size, deviations });
  }
  const missed = deviations.some((deviation) => deviation.evaluators.every((verdict) => verdict === 'pass'));
  reasons.push(
    `${deviations.length} of ${inputs.size} inputs depart from the independent reference only on the candidate arm; the evaluator ${missed ? 'passed' : 'failed'} ${missed ? 'a departing input' : 'every departing input'}`,
  );
  return result(missed ? 'confirmed-undesirable-missed' : 'confirmed-undesirable-caught', {
    compared: inputs.size,
    deviations,
    independentEvidence: labels.evidence,
  });
}

/**
 * The candidate with the stop the evidence settles on its own: `target-error` when an arm only errored, `undetermined`
 * when the evidence is short, absent or unreadable. The record stays in the `observed` state, so the stop stays visible
 * and a later observation can lift it. Any other classification needs a person, and the record comes back unchanged.
 *
 * @param {object} record an observed candidate
 * @param {object} [inputs] as for {@link classifyCandidate}
 * @returns {object}
 */
function settleCandidate(record, inputs) {
  if (record.state !== 'observed')
    throw new ReviewError([`candidate ${record.candidateId} is ${record.state}; only an observed candidate settles`]);
  const { disposition } = classifyCandidate(record, inputs);
  if (disposition !== 'target-error' && disposition !== 'undetermined') return record;
  return validateCandidate({ ...structuredClone(record), disposition });
}

/**
 * Records a person's review of an observed candidate. The decision is bound to the candidate's identity, its
 * determination and the observations it rests on, so a later change to the edit, the requirement, the conclusion or an
 * observation makes the reader refuse it.
 *
 * @param {object} record an observed candidate
 * @param {object} inputs as for {@link classifyCandidate}
 * @param {{reviewer: string, decidedAt: string, rationale: string, disposition: string}} decision
 * @returns {object} the reviewed candidate
 * @throws {ReviewError} when the candidate is not observed, the disposition is not a review conclusion, an arm only
 *   errored, or the evidence does not support a confirmed or unchanged conclusion
 */
function reviewCandidate(record, inputs, decision) {
  const problems = [];
  if (record.state !== 'observed')
    problems.push(`candidate ${record.candidateId} is ${record.state}; only an observed candidate is reviewed`);
  if (!REVIEW_DISPOSITIONS.includes(decision.disposition)) {
    problems.push(
      `${JSON.stringify(decision.disposition)} is not a review conclusion; a review concludes ${REVIEW_DISPOSITIONS.join(', ')}`,
    );
  }
  if (problems.length > 0) throw new ReviewError(problems);
  const classification = classifyCandidate(record, inputs);
  if (classification.disposition === 'target-error') {
    throw new ReviewError([`the evidence classifies as target-error, which no review concludes: ${classification.reasons.join('; ')}`]);
  }
  const declines = decision.disposition === 'undetermined' || decision.disposition === 'inapplicable';
  if (!declines && decision.disposition !== classification.disposition) {
    throw new ReviewError([
      `the evidence classifies as ${classification.disposition}, which does not support ${decision.disposition}: ${classification.reasons.join('; ')}`,
    ]);
  }

  const next = structuredClone(record);
  next.state = 'reviewed';
  next.disposition = decision.disposition;
  next.independentEvidence = decision.disposition.startsWith('confirmed-undesirable') ? [classification.independentEvidence] : [];
  next.review = { reviewer: decision.reviewer, decidedAt: decision.decidedAt, rationale: decision.rationale, scope: null };
  next.review.scope = decisionScope(next);
  return validateCandidate(next);
}

/** The ID after the highest `M-NNN` mutation the folder holds. */
function nextMutationId(folder) {
  let taken = 0;
  let entries = [];
  try {
    entries = fs.readdirSync(path.join(folder, 'mutations'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  for (const name of entries) {
    const match = MUTATION_FILE.exec(name);
    if (match) taken = Math.max(taken, Number(match[1]));
  }
  return `M-${String(taken + 1).padStart(3, '0')}`;
}

/**
 * Promotes a reviewed, confirmed candidate to a draft mutation, as data. The result names the record as it will stand
 * and the files to write; {@link applyPromotion} writes them. The draft is the native `replace-exact` mutation and the
 * record's promotion holds no qualification receipt: only a native qualification produces one.
 *
 * @param {string} folder the evaluation folder
 * @param {string} relative the candidate's path under `discovery/`
 * @returns {{record: object, draft: object, files: Array<{path: string, content: string}>}}
 * @throws {import('./candidate').CandidateError} when the stored candidate or the files it names are invalid or stale
 * @throws {ReviewError} when the candidate is not reviewed with a confirmed conclusion
 */
function promoteCandidate(folder, relative) {
  const record = readCandidate(folder, relative);
  if (record.state !== 'reviewed') {
    throw new ReviewError([`candidate ${record.candidateId} is ${record.state}; only a reviewed candidate is promoted`]);
  }
  if (!record.disposition.startsWith('confirmed-undesirable')) {
    throw new ReviewError([
      `candidate ${record.candidateId} concluded ${record.disposition}; only a confirmed undesirable candidate is promoted`,
    ]);
  }
  const next = structuredClone(record);
  next.state = 'promoted';
  next.promotion = { draftMutationId: nextMutationId(folder), qualificationReceipt: null };
  validateCandidate(next);
  const draft = draftMutation(next);
  return {
    record: next,
    draft,
    files: [
      { path: `mutations/${draft.mutationId}.mutation.json`, content: `${JSON.stringify(draft, null, 2)}\n` },
      { path: relative, content: canonicalJson(next) },
    ],
  };
}

/** Refuses a directory on the way down `segments` from `folder` that is a link or not a directory; an absent one ends the walk. */
function writableDirectory(folder, segments) {
  let at = folder;
  for (const segment of segments) {
    at = path.join(at, segment);
    let stats;
    try {
      stats = fs.lstatSync(at);
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    if (stats.isSymbolicLink() || !stats.isDirectory()) throw new ReviewError([`${segments.join('/')} is a link or not a directory`]);
  }
}

/**
 * Writes a promotion: the draft mutation first, refusing a name the folder already holds, then the promoted record.
 *
 * @param {string} folder
 * @param {ReturnType<typeof promoteCandidate>} promotion
 * @throws {ReviewError} when a path on the way is a link or the draft's name is taken
 */
function applyPromotion(folder, promotion) {
  const [mutation, candidate] = promotion.files;
  for (const file of promotion.files) writableDirectory(folder, path.posix.dirname(file.path).split('/'));
  const mutationFile = path.join(folder, ...mutation.path.split('/'));
  fs.mkdirSync(path.dirname(mutationFile), { recursive: true });
  try {
    fs.writeFileSync(mutationFile, mutation.content, { flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST') throw new ReviewError([`${mutation.path} already exists; a promotion never replaces a mutation`]);
    throw error;
  }
  const candidateFile = path.join(folder, ...candidate.path.split('/'));
  const staging = `${candidateFile}.tmp`;
  fs.writeFileSync(staging, candidate.content, { flag: 'wx' });
  fs.renameSync(staging, candidateFile);
}

/**
 * Loads what {@link classifyCandidate} reads for a candidate the folder holds: the retained evidence of each
 * observation at `discovery/<campaignId>/evidence/<candidateId>.<observationId>.json`, and the reference at
 * `referencePath`. A file the folder does not hold is left out, so the classification reports it as missing.
 *
 * @param {string} folder
 * @param {object} record
 * @param {string} [referencePath] the independent reference, relative to the folder
 * @returns {{evidence: Record<string, Buffer>, reference?: Buffer}}
 */
function loadReviewInputs(folder, record, referencePath) {
  const held = (relative) => {
    try {
      return readHeldFile(folder, relative, 'review input');
    } catch {
      return null;
    }
  };
  const evidence = {};
  for (const observation of record.observations) {
    const bytes = held(`discovery/${record.campaignId}/evidence/${record.candidateId}.${observation.observationId}.json`);
    if (bytes !== null) evidence[observation.observationId] = bytes;
  }
  const reference = referencePath === undefined ? null : held(referencePath);
  return reference === null ? { evidence } : { evidence, reference };
}

module.exports = {
  ReviewError,
  applyPromotion,
  classifyCandidate,
  loadReviewInputs,
  promoteCandidate,
  reviewCandidate,
  settleCandidate,
};
