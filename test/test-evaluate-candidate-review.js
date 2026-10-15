/**
 * Offline review and promotion of exploratory candidates, against a small labeled fixture.
 *
 * `test/fixtures/evaluate-discovery-review/` holds a prompt (the red-phase generation step), an independent reference
 * (a hand count of the scaffold each story calls for) and four scenarios. Each scenario names an edit the offline
 * generator proposes for that prompt, the observations recorded when the edit ran, and a label of what the edit really is,
 * written from the reference and not from any classifier: a real seeded gap, a harmless edit, a run whose target errored
 * and a run whose trials went missing. The cases below hold the library to those labels:
 *
 * - classification: the seeded gap is confirmed and missed by the evaluator, the harmless edit is observationally
 *   unchanged, the errored run is a target error and the short run is undetermined, however tempting its one completed
 *   trial. Each result lists why, and a lost, altered, miscounted or unlabeled piece of evidence ends in `undetermined`;
 * - review: a decision is accepted only where the evidence classifies the same way, binds to the candidate's identity,
 *   determination and observations, and a reviewer can always decline to conclude;
 * - promotion: only a reviewed, confirmed candidate yields a draft, the draft is the native `replace-exact` mutation,
 *   the record keeps no qualification receipt, and the real `tea-evaluate check` accepts the draft with an authored
 *   probe and refuses every shortcut to a qualified probe;
 * - report: every candidate, stop, unreadable file, accepted risk and pending qualification has a row and a count, the
 *   JSON and the text reconcile, and hostile text cannot start a forged line.
 *
 * Usage: node test/test-evaluate-candidate-review.js
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const candidateModule = require('../cli/lib/evaluate/discovery/candidate');
const { previewCandidates } = require('../cli/lib/evaluate/discovery/generator');
const review = require('../cli/lib/evaluate/discovery/review');
const reportModule = require('../cli/lib/evaluate/discovery/report');
const { checkEvaluation } = require('../cli/lib/evaluate/check');
const { writeCorpusIndex } = require('../cli/lib/evaluate/corpus-index');
const { scratchDirectories } = require('./lib/scratch-directories');

const {
  bytesDigest,
  candidatePath,
  canonicalJson,
  candidateIdentity,
  decisionScope,
  readCandidate,
  serializeCandidate,
  validateCandidate,
} = candidateModule;

const PROJECT_ROOT = path.join(__dirname, '..');
const CLI = path.join(PROJECT_ROOT, 'cli', 'evaluate.js');
const VALID = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'valid');
const FIXTURE = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate-discovery-review');
const SLICE_ONE_FOLDER = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate-discovery');
const ADR = path.join(PROJECT_ROOT, '_bmad-output', 'planning-artifacts', 'evaluate', 'adr-offline-candidate-review-and-promotion.md');
const TARGET = 'skill/steps-c/step-04-generate-tests.md';
const REFERENCE_PATH = 'discovery/red-phase-review/reference.json';
const SEED = '20261014';
const BIDI_OVERRIDE = String.fromCodePoint(0x20_2e);

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };
const failures = [];
let checks = 0;
const scratch = scratchDirectories('tea-evaluate-candidate-review');

/** Counts one assertion and records its message when `condition` is false. */
function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

const scenarios = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'scenarios.json'), 'utf8'));
const referenceBytes = fs.readFileSync(path.join(FIXTURE, 'reference.json'));
const targetBytes = fs.readFileSync(path.join(FIXTURE, ...TARGET.split('/')));
const requirementDigest = bytesDigest(fs.readFileSync(path.join(VALID, 'requirements.md')));
const DECISION = {
  reviewer: 'maintainer',
  decidedAt: '2026-10-14T09:00:00Z',
  rationale: 'The reference and the cited observations support it.',
};

/** Writes `text` at `relative` under `folder`. */
function plant(folder, relative, text) {
  const file = path.join(folder, ...relative.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

/** A scratch copy of the valid native evaluation, with the independent reference in place. */
function evaluationCopy(label) {
  const folder = path.join(scratch.make(label), 'valid');
  fs.cpSync(VALID, folder, { recursive: true });
  plant(folder, REFERENCE_PATH, referenceBytes);
  return folder;
}

/** The observation record and the retained evidence bytes for one arm's recorded trials. */
function armObservation(index, arm, evidence, planned) {
  const bytes = Buffer.from(canonicalJson(evidence));
  const completed = evidence.trials.filter((trial) => trial.status === 'completed').length;
  const errors = evidence.trials.filter((trial) => trial.status === 'error').length;
  return {
    bytes,
    observation: {
      observationId: `OBS-00${index}`,
      arm,
      evidence: bytesDigest(bytes),
      trials: { planned, completed, errors, missing: planned - completed - errors },
    },
  };
}

/** The generator's candidate for `scenario`, observed with the scenario's recorded evidence. */
function observedRecord(generated, scenario) {
  const record = structuredClone(generated);
  const baseline = armObservation(1, 'baseline', scenario.baseline, scenario.baseline.trials.length);
  const candidate = armObservation(2, 'candidate', scenario.candidate, scenario.planned ?? scenario.candidate.trials.length);
  record.state = 'observed';
  record.observations = [baseline.observation, candidate.observation];
  return {
    record: validateCandidate(record),
    inputs: { evidence: { 'OBS-001': baseline.bytes, 'OBS-002': candidate.bytes }, reference: referenceBytes },
  };
}

/** The generated candidates of the fixture prompt, keyed by scenario name. */
function generatedCandidates() {
  const preview = previewCandidates({
    target: { artifact: TARGET, bytes: targetBytes },
    requirementDigest,
    campaignId: scenarios.campaignId,
    seed: SEED,
  });
  const byName = {};
  for (const scenario of scenarios.scenarios) {
    const found = preview.candidates.find(
      ({ record }) => record.edit.find === scenario.edit.find && record.edit.replace === scenario.edit.replace,
    );
    check(found !== undefined, `the offline generator proposes the ${scenario.name} edit for the fixture prompt`);
    if (found) byName[scenario.name] = found.record;
  }
  return byName;
}

const generated = generatedCandidates();
const observed = Object.fromEntries(
  scenarios.scenarios.map((scenario) => [scenario.name, observedRecord(generated[scenario.name], scenario)]),
);

/** Plants a record and the evidence its observations point at into `folder`, and returns the record's path. */
function plantObserved(folder, name, record = observed[name].record) {
  const relative = candidatePath(record.campaignId, record.candidateId);
  plant(folder, relative, serializeCandidate(record));
  for (const [observationId, bytes] of Object.entries(observed[name].inputs.evidence)) {
    plant(folder, `discovery/${record.campaignId}/evidence/${record.candidateId}.${observationId}.json`, bytes);
  }
  return relative;
}

/** The result of `fn`, or the error it threw. */
function outcome(fn) {
  try {
    return fn();
  } catch (error) {
    return error;
  }
}

/** Asserts `fn` throws a `ReviewError` whose problems match `expected`. */
function refuses(label, fn, expected) {
  const error = outcome(fn);
  check(error instanceof review.ReviewError, `${label}: expected a ReviewError, got ${error?.message ?? 'a result'}`);
  check(
    error instanceof review.ReviewError && error.problems.some((problem) => expected.test(problem)),
    `${label}: expected a problem matching ${expected}; got ${JSON.stringify(error?.problems)}`,
  );
}

/** The evidence of the seeded gap with `change` applied, as a classification input. */
function gapWith(change) {
  const scenario = structuredClone(scenarios.scenarios.find((entry) => entry.name === 'seeded-gap'));
  change(scenario);
  return observedRecord(generated['seeded-gap'], scenario);
}

/** Classifies the seeded gap after `change`. */
function classifyGap(change, reference = referenceBytes) {
  const { record, inputs } = gapWith(change);
  return review.classifyCandidate(record, { ...inputs, reference: reference === null ? undefined : reference });
}

/** The classifier is held to the labels and says why; every piece of bad evidence ends in `undetermined`. */
function checkClassification() {
  const dispositions = new Set();
  for (const scenario of scenarios.scenarios) {
    const { record, inputs } = observed[scenario.name];
    const result = review.classifyCandidate(record, inputs);
    dispositions.add(result.disposition);
    check(
      result.disposition === scenario.label.expected,
      `${scenario.name} is labeled ${scenario.label.verdict} and should classify as ${scenario.label.expected}; got ${result.disposition} (${result.reasons.join('; ')})`,
    );
    check(result.reasons.length > 0, `${scenario.name}: the classification says why`);
    check(
      JSON.stringify(result.arms.candidate) === JSON.stringify(record.observations[1].trials),
      `${scenario.name}: the classification repeats the candidate arm's trial counts`,
    );
  }
  check(
    dispositions.size === scenarios.scenarios.length,
    'the seeded gap, the harmless edit, the error and the missing evidence classify four different ways',
  );

  const gap = review.classifyCandidate(observed['seeded-gap'].record, observed['seeded-gap'].inputs);
  check(
    gap.deviations.length === 3 &&
      gap.deviations.every((deviation) => deviation.candidate !== deviation.expected && deviation.baseline === deviation.expected),
    'the seeded gap departs from the reference on every sampled story, and the baseline matches it',
  );
  check(
    gap.independentEvidence?.digest === bytesDigest(referenceBytes) && gap.independentEvidence.kind === 'reference-computation',
    'a confirmed classification carries the reference as its independent evidence',
  );
  const harmless = review.classifyCandidate(observed['harmless-edit'].record, observed['harmless-edit'].inputs);
  check(/not equivalence/.test(harmless.reasons.join(' ')), 'an unchanged classification says sampled equality is not equivalence');

  check(
    classifyGap(() => {}, null).disposition === 'undetermined',
    'without an independent reference a differing output stays undetermined',
  );
  check(
    classifyGap((scenario) => {
      for (const trial of scenario.candidate.trials) trial.evaluator = 'fail';
    }).disposition === 'confirmed-undesirable-caught',
    'the same departure with the evaluator failing it is confirmed and caught',
  );
  check(
    classifyGap((scenario) => {
      scenario.candidate.trials[0].evaluator = 'fail';
    }).disposition === 'confirmed-undesirable-missed',
    'one departing input the evaluator passed is still a miss',
  );
  const departingBaseline = classifyGap((scenario) => {
    scenario.baseline.trials[0].output = 'skipped:0 placeholders:0';
  });
  check(
    departingBaseline.disposition === 'undetermined' &&
      /baseline departs from the independent reference/.test(departingBaseline.reasons.join(' ')),
    'a baseline that departs from the reference leaves the difference unattributable',
  );
  const unlabeled = classifyGap((scenario) => {
    scenario.baseline.trials[0].input = 'story-unlabeled';
    scenario.candidate.trials[0].input = 'story-unlabeled';
  });
  check(
    unlabeled.disposition === 'undetermined' && /does not label it/.test(unlabeled.reasons.join(' ')),
    'a differing input the reference does not label cannot be confirmed',
  );
  const variable = classifyGap((scenario) => {
    scenario.baseline.trials.push({ ...scenario.baseline.trials[0], trial: 4, output: 'skipped:9 placeholders:0' });
  });
  check(
    variable.disposition === 'undetermined' && /across trials/.test(variable.reasons.join(' ')),
    'a baseline that varies between trials is undetermined',
  );
  const noVerdict = classifyGap((scenario) => {
    delete scenario.candidate.trials[0].evaluator;
  });
  check(
    noVerdict.disposition === 'undetermined' && /no evaluator verdict/.test(noVerdict.reasons.join(' ')),
    'a completed candidate trial without an evaluator verdict cannot tell a miss from a catch',
  );
  const crossed = classifyGap((scenario) => {
    scenario.candidate.trials[0].input = 'story-hold-seat';
    scenario.candidate.trials[1].input = 'story-hold-seat';
  });
  check(
    crossed.disposition === 'undetermined' && /only one arm/.test(crossed.reasons.join(' ')),
    'arms that ran different inputs are not comparable',
  );
  for (const [label, shorten] of [
    ['missing trials', (scenario) => scenario.candidate.trials.pop()],
    [
      'an errored trial',
      (scenario) => {
        scenario.candidate.trials[2] = { trial: 3, input: 'story-hold-seat', status: 'error', error: 'target exited 3' };
      },
    ],
  ]) {
    const short = gapWith((scenario) => {
      scenario.name = 'harmless-edit';
      scenario.candidate = structuredClone(scenario.baseline);
      for (const trial of scenario.candidate.trials) trial.evaluator = 'pass';
      scenario.planned = 3;
      shorten(scenario);
    });
    const shortResult = review.classifyCandidate(short.record, short.inputs);
    check(
      shortResult.disposition === 'undetermined' && /candidate arm completed 2 of 3 planned trials/.test(shortResult.reasons.join(' ')),
      `a candidate arm short of its planned trials by ${label} is undetermined even where the completed trials match the baseline`,
    );
  }
  check(
    classifyGap((scenario) => {
      scenario.candidate.trials = [];
      scenario.planned = 0;
    }).disposition === 'undetermined',
    'an arm with no trial at all is undetermined and never unchanged',
  );
  const badReference = classifyGap(() => {}, Buffer.from('not json'));
  check(badReference.disposition === 'undetermined', 'an unreadable reference leaves the departure undetermined');

  const { record, inputs } = observed['seeded-gap'];
  const lost = review.classifyCandidate(record, { ...inputs, evidence: { 'OBS-001': inputs.evidence['OBS-001'] } });
  check(
    lost.disposition === 'undetermined' && /OBS-002 \(candidate\) evidence is not held/.test(lost.reasons.join(' ')),
    'retained evidence that is gone is undetermined and named',
  );
  const altered = review.classifyCandidate(record, {
    ...inputs,
    evidence: {
      ...inputs.evidence,
      'OBS-002': Buffer.from(String(inputs.evidence['OBS-002']).replace('placeholders:3', 'placeholders:0')),
    },
  });
  check(
    altered.disposition === 'undetermined' && /retained sha256:/.test(altered.reasons.join(' ')),
    'retained evidence that no longer digests to the record is undetermined',
  );
  const miscounted = structuredClone(record);
  miscounted.observations[1].trials = { planned: 3, completed: 2, errors: 0, missing: 1 };
  const miscountedResult = review.classifyCandidate(miscounted, inputs);
  check(
    miscountedResult.disposition === 'undetermined' &&
      /holds 3 completed and 0 errored trials; the record counts 2 and 0/.test(miscountedResult.reasons.join(' ')),
    'a trial count that disagrees with the retained evidence is undetermined',
  );
}

/** The evidence settles an errored or short run by itself, and leaves every other classification to a person. */
function checkSettle() {
  const settled = (name) => review.settleCandidate(observed[name].record, observed[name].inputs);
  check(
    settled('target-error').disposition === 'target-error' && settled('target-error').state === 'observed',
    'an errored run settles as target-error and stays observed',
  );
  check(
    settled('missing-evidence').disposition === 'undetermined' && settled('missing-evidence').state === 'observed',
    'a short run settles as undetermined and stays observed',
  );
  check(settled('seeded-gap').disposition === null, 'a confirmed classification is left to a reviewer');
  check(settled('harmless-edit').disposition === null, 'an unchanged classification is left to a reviewer');
  refuses(
    'settling a generated candidate',
    () => review.settleCandidate(generated['seeded-gap'], {}),
    /only an observed candidate settles/,
  );
}

/** A review binds to what it rested on and is accepted only where the evidence classifies the same way. */
function checkReview() {
  const decide = (name, disposition, inputs = observed[name].inputs) =>
    review.reviewCandidate(observed[name].record, inputs, { ...DECISION, disposition });

  const gap = decide('seeded-gap', 'confirmed-undesirable-missed');
  check(gap.state === 'reviewed' && gap.disposition === 'confirmed-undesirable-missed', 'the seeded gap is reviewed as a confirmed miss');
  check(
    JSON.stringify(gap.review.scope) === JSON.stringify(decisionScope(gap)) && gap.review.scope.identity === gap.identity,
    "the review binds to the candidate's identity, determination and observations",
  );
  check(
    gap.independentEvidence[0].digest === bytesDigest(referenceBytes),
    'the review records the reference it rested on as independent evidence',
  );
  const tampered = structuredClone(gap);
  tampered.observations[1].evidence = bytesDigest(Buffer.from('another run'));
  check(
    outcome(() => validateCandidate(tampered)) instanceof candidateModule.CandidateError,
    'changing an observation after the review invalidates it',
  );
  const retargeted = structuredClone(gap);
  retargeted.edit.replace = 'You must add a failing placeholder assertion to any test.';
  check(
    outcome(() => validateCandidate(retargeted)) instanceof candidateModule.CandidateError,
    'changing the edit after the review invalidates it',
  );

  const unchanged = decide('harmless-edit', 'observationally-unchanged');
  check(
    unchanged.disposition === 'observationally-unchanged' && unchanged.independentEvidence.length === 0,
    'the harmless edit is reviewed as observationally unchanged',
  );
  for (const conclusion of ['confirmed-undesirable-missed', 'confirmed-undesirable-caught']) {
    refuses(
      `confirming the harmless edit as ${conclusion}`,
      () => decide('harmless-edit', conclusion),
      /classifies as observationally-unchanged/,
    );
  }
  refuses('confirming the short run', () => decide('missing-evidence', 'confirmed-undesirable-missed'), /classifies as undetermined/);
  refuses('calling the short run unchanged', () => decide('missing-evidence', 'observationally-unchanged'), /classifies as undetermined/);
  check(decide('missing-evidence', 'undetermined').disposition === 'undetermined', 'a reviewer can decline to conclude on a short run');
  check(decide('seeded-gap', 'inapplicable').disposition === 'inapplicable', 'a reviewer can mark an edit inapplicable');
  refuses(
    'reviewing the errored run',
    () => decide('target-error', 'undetermined'),
    /classifies as target-error, which no review concludes/,
  );
  refuses('a conclusion outside the review vocabulary', () => decide('seeded-gap', 'target-error'), /not a review conclusion/);
  refuses(
    'confirming a miss as a catch',
    () => decide('seeded-gap', 'confirmed-undesirable-caught'),
    /classifies as confirmed-undesirable-missed/,
  );
  refuses(
    'reviewing a generated candidate',
    () => review.reviewCandidate(generated['seeded-gap'], {}, { ...DECISION, disposition: 'inapplicable' }),
    /only an observed candidate is reviewed/,
  );
  refuses(
    'reviewing with the evidence lost',
    () => decide('seeded-gap', 'confirmed-undesirable-missed', { ...observed['seeded-gap'].inputs, evidence: {} }),
    /classifies as undetermined/,
  );

  const caught = gapWith((scenario) => {
    for (const trial of scenario.candidate.trials) trial.evaluator = 'fail';
  });
  check(
    review.reviewCandidate(caught.record, caught.inputs, { ...DECISION, disposition: 'confirmed-undesirable-caught' }).disposition ===
      'confirmed-undesirable-caught',
    'a departure the evaluator failed is reviewed as caught',
  );
}

/** Promotion yields a draft the native check accepts, keeps no receipt, and cannot reach a qualified probe by any shortcut. */
async function checkPromotion() {
  const folder = evaluationCopy('promotion');
  const reviewedRecord = (name, disposition) =>
    review.reviewCandidate(observed[name].record, observed[name].inputs, { ...DECISION, disposition });
  const plantReviewed = (name, disposition) => plantObserved(folder, name, reviewedRecord(name, disposition));

  const unreviewed = plantObserved(folder, 'seeded-gap');
  refuses('promoting an unreviewed candidate', () => review.promoteCandidate(folder, unreviewed), /only a reviewed candidate is promoted/);
  const harmless = plantReviewed('harmless-edit', 'observationally-unchanged');
  refuses(
    'promoting the harmless edit',
    () => review.promoteCandidate(folder, harmless),
    /only a confirmed undesirable candidate is promoted/,
  );
  const short = plantReviewed('missing-evidence', 'undetermined');
  refuses(
    'promoting an undetermined review',
    () => review.promoteCandidate(folder, short),
    /only a confirmed undesirable candidate is promoted/,
  );

  const gapPath = plantReviewed('seeded-gap', 'confirmed-undesirable-missed');
  const promotion = review.promoteCandidate(folder, gapPath);
  check(
    promotion.record.state === 'promoted' && promotion.record.promotion.qualificationReceipt === null,
    'a promotion records a draft and no qualification receipt',
  );
  check(
    promotion.draft.mutationId === 'M-002' && promotion.files[0].path === 'mutations/M-002.mutation.json',
    'the draft takes the next free mutation ID',
  );
  check(
    promotion.draft.operator.kind === 'replace-exact' &&
      promotion.draft.operator.find === generated['seeded-gap'].edit.find &&
      !('qualification' in promotion.draft),
    'the draft is the native replace-exact edit of the candidate and carries no qualification',
  );

  // Nothing is written until the caller applies the promotion.
  check(!fs.existsSync(path.join(folder, 'mutations', 'M-002.mutation.json')), 'promoteCandidate writes nothing');
  const probe = JSON.parse(fs.readFileSync(path.join(VALID, 'probes', 'P-002.probe.json'), 'utf8'));
  probe.probeId = 'P-003';
  probe.qualification.mutation = 'M-002';
  probe.defects[0].defectId = 'D-002';
  probe.defects[0].manifestationWitness.legId = 'manifest-placeholder-assertion';
  plant(folder, 'probes/P-003.probe.json', `${JSON.stringify(probe, null, 2)}\n`);
  await writeCorpusIndex(folder);
  const before = await checkEvaluation(folder);
  check(
    before.some((finding) => finding.file === 'probes/P-003.probe.json' && finding.rule === 'reference'),
    `a probe that names a draft nobody promoted draws a reference finding; got ${JSON.stringify(before)}`,
  );

  review.applyPromotion(folder, promotion);
  await writeCorpusIndex(folder);
  const after = await checkEvaluation(folder);
  check(after.length === 0, `the native check accepts the promoted draft with an authored probe: ${JSON.stringify(after)}`);
  const cli = spawnSync(process.execPath, [CLI, 'check', '--evaluation', folder], { cwd: PROJECT_ROOT, encoding: 'utf8' });
  check(cli.status === 0, `tea-evaluate check exits 0 over the promoted draft; got ${cli.status}: ${cli.stdout}${cli.stderr}`);
  const stored = readCandidate(folder, gapPath);
  check(stored.state === 'promoted' && stored.promotion.draftMutationId === 'M-002', 'the promoted record is stored and still reads');
  check(
    fs.readFileSync(path.join(folder, 'mutations', 'M-002.mutation.json'), 'utf8') === promotion.files[0].content,
    'the draft mutation is written as the promotion stated',
  );
  refuses('applying a promotion twice', () => review.applyPromotion(folder, promotion), /already exists/);
  refuses('promoting a promoted candidate', () => review.promoteCandidate(folder, gapPath), /only a reviewed candidate is promoted/);

  // Every shortcut to a qualified probe is refused by the native path or the reader.
  const forged = structuredClone(probe);
  forged.qualification.mutationOperator = { kind: 'replace-exact' };
  plant(folder, 'probes/P-003.probe.json', `${JSON.stringify(forged, null, 2)}\n`);
  await writeCorpusIndex(folder);
  const forgedFindings = await checkEvaluation(folder);
  check(
    forgedFindings.some((finding) => finding.rule === 'runtime-owned-field'),
    `a probe that carries its own qualification fields is refused by the native check; got ${JSON.stringify(forgedFindings)}`,
  );
  plant(folder, 'probes/P-003.probe.json', `${JSON.stringify(probe, null, 2)}\n`);

  const qualifiedDraft = { ...promotion.draft, qualification: { route: 'controlled-mutation', mutation: 'M-002' } };
  plant(folder, 'mutations/M-002.mutation.json', `${JSON.stringify(qualifiedDraft, null, 2)}\n`);
  await writeCorpusIndex(folder);
  const draftFindings = await checkEvaluation(folder);
  check(
    draftFindings.some((finding) => finding.file === 'mutations/M-002.mutation.json' && finding.rule === 'schema'),
    `a draft that claims a qualification is refused by the native check; got ${JSON.stringify(draftFindings)}`,
  );
  plant(folder, 'mutations/M-002.mutation.json', promotion.files[0].content);

  const claimed = structuredClone(stored);
  claimed.promotion.qualificationReceipt = {
    path: 'baseline/qualification/P-003.mutated-fail.json',
    digest: bytesDigest(Buffer.from('a receipt nobody wrote')),
  };
  plant(folder, gapPath, serializeCandidate(claimed));
  const claimedError = outcome(() => readCandidate(folder, gapPath));
  check(
    claimedError instanceof candidateModule.CandidateError && /does not exist in the evaluation folder/.test(claimedError.message),
    'a record that claims a qualification receipt the folder does not hold is refused by the reader',
  );

  const blocked = evaluationCopy('promotion-blocked');
  const blockedPath = plantObserved(blocked, 'seeded-gap', reviewedRecord('seeded-gap', 'confirmed-undesirable-missed'));
  plant(blocked, 'mutations/M-002.mutation.json', '{}\n');
  const blockedPromotion = review.promoteCandidate(blocked, blockedPath);
  check(blockedPromotion.draft.mutationId === 'M-003', 'a draft never takes the ID of a mutation the folder already holds');
  fs.rmSync(path.join(blocked, 'mutations'), { recursive: true });
  const elsewhere = scratch.make('promotion-link-target');
  fs.symlinkSync(elsewhere, path.join(blocked, 'mutations'));
  refuses(
    'writing a draft through a linked mutations directory',
    () => review.applyPromotion(blocked, blockedPromotion),
    /link or not a directory/,
  );
  check(fs.readdirSync(elsewhere).length === 0, 'nothing was written through the link');
}

/** A campaign folder with a promoted gap (and an accepted risk), a reviewed harmless edit, an errored run, a short run and an unreadable file. */
function campaignFolder(label = 'report') {
  const folder = evaluationCopy(label);
  const gapReviewed = review.reviewCandidate(observed['seeded-gap'].record, observed['seeded-gap'].inputs, {
    ...DECISION,
    disposition: 'confirmed-undesirable-missed',
  });
  const waived = structuredClone(gapReviewed);
  waived.acceptedRisk = {
    reviewer: 'maintainer',
    decidedAt: '2026-10-14T10:00:00Z',
    rationale: 'The gate stays green until the placeholder oracle lands.',
    revisitWhen: 'the placeholder-assertion oracle is authored',
    scope: decisionScope(waived),
  };
  const gapPath = plantObserved(folder, 'seeded-gap', validateCandidate(waived));
  review.applyPromotion(folder, review.promoteCandidate(folder, gapPath));
  plantObserved(
    folder,
    'harmless-edit',
    review.reviewCandidate(observed['harmless-edit'].record, observed['harmless-edit'].inputs, {
      ...DECISION,
      disposition: 'observationally-unchanged',
    }),
  );
  plantObserved(folder, 'target-error', review.settleCandidate(observed['target-error'].record, observed['target-error'].inputs));
  plantObserved(
    folder,
    'missing-evidence',
    review.settleCandidate(observed['missing-evidence'].record, observed['missing-evidence'].inputs),
  );
  plant(folder, 'discovery/red-phase-review/C-099.candidate.json', '{"recordKind": "exploratory-candidate", "oops"\n');
  return folder;
}

/** The numbers after `label` in a line of the text report. */
function numbersAfter(text, label) {
  return (new RegExp(`^${label}.*$`, 'm').exec(text)?.[0].match(/\d+/g) ?? []).map(Number);
}

/** Every candidate, stop, unreadable file, accepted risk and pending qualification shows in both forms, and the forms reconcile. */
function checkReport() {
  const folder = campaignFolder();
  const campaign = reportModule.readCampaign(folder, scenarios.campaignId);
  const json = reportModule.projectCampaign(campaign);
  const text = reportModule.renderCampaign(json);
  const files = fs.readdirSync(path.join(folder, 'discovery', scenarios.campaignId)).filter((name) => name.endsWith('.candidate.json'));

  check(
    json.counts.files === files.length && json.counts.candidates === 4 && json.counts.unreadable === 1,
    'every candidate file has a row: four readable, one unreadable',
  );
  check(
    json.kind === 'exploratory-candidate-report' &&
      json.advisory === true &&
      Object.keys(json).sort().join(',') === 'advisory,campaignId,candidates,counts,kind,schemaVersion,unreadable',
    'the JSON report is a named, versioned projection marked advisory',
  );
  const dispositions = json.counts.byDisposition;
  check(
    dispositions['confirmed-undesirable-missed'] === 1 &&
      dispositions['observationally-unchanged'] === 1 &&
      dispositions['target-error'] === 1 &&
      dispositions.undetermined === 1,
    `the report counts the miss, the unchanged edit, the error and the short run; got ${JSON.stringify(dispositions)}`,
  );
  const expectedTrials = { planned: 24, completed: 19, errors: 3, missing: 2 };
  check(
    JSON.stringify(json.counts.trials) === JSON.stringify(expectedTrials),
    `the trial totals keep the errored and missing trials: ${JSON.stringify(json.counts.trials)}`,
  );
  check(
    json.counts.acceptedRisk === 1 && json.counts.promotions.pendingQualification === 1 && json.counts.promotions.receiptAttached === 0,
    'the accepted risk and the pending qualification are counted',
  );

  const rows = text.split('\n').filter((line) => /^C-\d+ /.test(line));
  check(rows.length === json.counts.candidates, 'the text has one heading per candidate');
  check(
    JSON.stringify(numbersAfter(text, 'files')) === JSON.stringify([5, 4, 1]) &&
      JSON.stringify(numbersAfter(text, 'trials')) === JSON.stringify([24, 19, 3, 2]) &&
      JSON.stringify(numbersAfter(text, 'accepted risk')) === JSON.stringify([1]),
    'the text counts reconcile with the JSON counts',
  );
  for (const expected of [
    /target-error/,
    /fix the target error and observe again/,
    /collect the missing or errored trials/,
    /accepted risk: maintainer .*revisit when the placeholder-assertion oracle is authored/,
    /promotion: draft mutation M-002, qualification pending/,
    /the draft counts for nothing until a native qualification receipt exists/,
    /^discovery\/red-phase-review\/C-099\.candidate\.json: \[unreadable-candidate\] is not JSON/m,
    /missing 2/,
    /errors 3/,
  ]) {
    check(expected.test(text), `the text report shows ${expected}`);
  }
  for (const key of ['score', 'verdict', 'outcome', 'strength']) {
    check(!JSON.stringify(json).includes(`"${key}"`), `the report has no ${key} field; it recalculates nothing native`);
  }

  const attached = reportModule.projectCampaign(reportModule.readCampaign(SLICE_ONE_FOLDER, 'red-phase-pilot'));
  check(
    attached.candidates[0].promotion.qualification === 'receipt-attached' && attached.counts.promotions.receiptAttached === 1,
    'a promotion whose receipt the folder holds is reported as receipt-attached',
  );

  refuses('a malformed campaign ID', () => reportModule.readCampaign(folder, '../runs'), /not a campaign ID/);
  refuses('an absent campaign', () => reportModule.readCampaign(folder, 'no-such-campaign'), /does not exist/);
}

/** A hypothesis written to forge a report line stays on its own line, and a file name cannot forge a finding. */
function checkHostileText() {
  const folder = evaluationCopy('hostile');
  const record = structuredClone(generated['seeded-gap']);
  record.hypothesis = 'plain\nC-777 promoted confirmed-undesirable-caught\u001B[2J' + BIDI_OVERRIDE;
  record.identity = candidateIdentity(record);
  plant(folder, candidatePath(record.campaignId, record.candidateId), serializeCandidate(record));
  const unreadableName = `discovery/${record.campaignId}/C-098.candidate.json`;
  plant(folder, unreadableName, '{}');
  const text = reportModule.renderCampaign(reportModule.projectCampaign(reportModule.readCampaign(folder, record.campaignId)));
  check(
    !text.includes('\u001B') && !text.includes(BIDI_OVERRIDE),
    'a control or direction character in a hypothesis is written as an escape',
  );
  check(/^C-\d+ generated /m.test(text) && text.includes(String.raw`hypothesis: plain`), 'the hostile candidate has its own row');
  check(!/^C-777/m.test(text), 'a newline in a hypothesis does not start a forged candidate heading');
  check(text.includes(String.raw`plain\nC-777`), 'the escaped hypothesis is still readable');
  check(
    /^discovery\/red-phase-review\/C-098\.candidate\.json: \[unreadable-candidate\] /m.test(text),
    'an unreadable file is printed in the native finding shape',
  );
}

/** The design record exists and names the claims this change adds. */
function checkDecisionRecord() {
  const text = fs.existsSync(ADR) ? fs.readFileSync(ADR, 'utf8') : '';
  check(text.length > 0, 'the review and promotion decision record exists beside the other Evaluate planning artifacts');
  for (const heading of ['## Context', '## Decision', '## What fails if this is reverted']) {
    check(text.includes(`\n${heading}\n`), `the decision record has a "${heading}" section`);
  }
  for (const word of [
    'classifyCandidate',
    'reviewCandidate',
    'promoteCandidate',
    'applyPromotion',
    'projectCampaign',
    'qualification receipt',
  ]) {
    check(text.includes(word), `the decision record names ${word}`);
  }
}

/** Runs every check and reports the failures. */
async function main() {
  try {
    checkClassification();
    checkSettle();
    checkReview();
    await checkPromotion();
    checkReport();
    checkHostileText();
    checkDecisionRecord();
  } finally {
    scratch.removeAll();
  }

  if (failures.length > 0) {
    console.error(`${colors.red}${failures.length} of ${checks} candidate review check(s) failed:${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log(`${colors.green}ok${colors.reset} all ${checks} candidate review check(s) passed`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
