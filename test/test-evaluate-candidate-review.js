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
const REFERENCE_PATH = 'discovery/red-phase-review/evidence/reference.json';
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
    inputs: {
      evidence: { 'OBS-001': baseline.bytes, 'OBS-002': candidate.bytes },
      reference: referenceBytes,
      referencePath: REFERENCE_PATH,
    },
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
const generatedAll = Object.fromEntries(
  previewCandidates({
    target: { artifact: TARGET, bytes: targetBytes },
    requirementDigest,
    campaignId: scenarios.campaignId,
    seed: SEED,
  }).candidates.map(({ record }) => [record.candidateId, record]),
);
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

/** The exit status and output of the real `tea-evaluate check` over `folder`. */
function cliCheck(folder) {
  const result = spawnSync(process.execPath, [CLI, 'check', '--evaluation', folder], { cwd: PROJECT_ROOT, encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
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
  for (const [label, referencePath] of [
    ['kept outside the evidence directory', 'discovery/red-phase-review/reference.json'],
    ['kept in another campaign', 'discovery/other-campaign/evidence/reference.json'],
    ['given no path', undefined],
  ]) {
    const { record, inputs } = gapWith(() => {});
    const placed = review.classifyCandidate(record, { ...inputs, referencePath });
    check(
      placed.disposition === 'undetermined' &&
        /must be kept at discovery\/red-phase-review\/evidence\/<file>/.test(placed.reasons.join(' ')) &&
        placed.independentEvidence === null,
      `a reference ${label} is not cited as independent evidence: ${placed.disposition} ${JSON.stringify(placed.reasons)}`,
    );
  }

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

/** Repeated trials, noise and unreadable evidence: the classification follows each trial and never the first output. */
function checkNoiseAndMalformedEvidence() {
  const repeated = (verdicts, outputs = verdicts.map(() => 'skipped:3 placeholders:3')) =>
    classifyGap((scenario) => {
      const input = 'story-cancel-reservation';
      scenario.baseline.trials = verdicts.map((_, index) => ({
        trial: index + 1,
        input,
        status: 'completed',
        output: 'skipped:3 placeholders:0',
      }));
      scenario.candidate.trials = verdicts.map((evaluator, index) => ({
        trial: index + 1,
        input,
        status: 'completed',
        output: outputs[index],
        evaluator,
      }));
    });
  const flaky = repeated(['pass', 'fail', 'fail']);
  check(
    flaky.disposition === 'confirmed-undesirable-missed' && /passed at least one departing trial/.test(flaky.reasons.join(' ')),
    `an evaluator that passes one departing trial of three missed it: ${flaky.disposition}`,
  );
  const steady = repeated(['fail', 'fail', 'fail']);
  check(
    steady.disposition === 'confirmed-undesirable-caught' && /failed every departing trial/.test(steady.reasons.join(' ')),
    `an evaluator that fails every departing trial caught it: ${steady.disposition}`,
  );
  const flipping = repeated(['pass', 'pass', 'pass'], ['skipped:3 placeholders:3', 'skipped:3 placeholders:0', 'skipped:3 placeholders:3']);
  check(
    flipping.disposition === 'undetermined' && /candidate arm produced different outputs/.test(flipping.reasons.join(' ')),
    'a candidate arm whose output flips between trials is undetermined and never read from its first output',
  );

  const gap = classifyGap(() => {});
  const reasons = gap.reasons.join(' ');
  check(
    /3 of 3 inputs depart from the independent reference only on the candidate arm/.test(reasons) &&
      /passed at least one departing trial/.test(reasons),
    `the confirmed miss says which inputs depart and what the evaluator did: ${reasons}`,
  );

  const duplicated = (text) => {
    const { record, inputs } = gapWith(() => {});
    return review.classifyCandidate(record, { ...inputs, ...text(inputs) });
  };
  const repeatedReference = duplicated(() => ({
    reference: Buffer.from(
      '{"kind":"reference-computation","reference":"x","cases":{"story-cancel-reservation":"skipped:9","story-cancel-reservation":"skipped:3 placeholders:0"}}',
    ),
  }));
  check(
    repeatedReference.disposition === 'undetermined' &&
      /states the key "story-cancel-reservation" twice/.test(repeatedReference.reasons.join(' ')),
    'a reference that states a label twice is unreadable, so a reviewer and the classifier cannot read different labels',
  );
  const { record, inputs } = gapWith(() => {});
  const doubled = Buffer.from(
    String(inputs.evidence['OBS-002']).replace(
      '"output": "skipped:3 placeholders:3"',
      '"output": "skipped:3 placeholders:0", "output": "skipped:3 placeholders:3"',
    ),
  );
  const repeatedEvidence = review.classifyCandidate(
    { ...record, observations: [record.observations[0], { ...record.observations[1], evidence: bytesDigest(doubled) }] },
    { ...inputs, evidence: { ...inputs.evidence, 'OBS-002': doubled } },
  );
  check(
    repeatedEvidence.disposition === 'undetermined' && /states the key "output" twice/.test(repeatedEvidence.reasons.join(' ')),
    'evidence that states a key twice is unreadable',
  );
  for (const [label, edit, expected] of [
    ['a completed trial with no output', (trial) => delete trial.output, /is completed with no output/],
    ['an output that is not text', (trial) => (trial.output = { placeholders: 3 }), /is completed with no output/],
    ['an unknown trial status', (trial) => (trial.status = 'cancelled'), /has status "cancelled"/],
    [
      'an errored trial with no message',
      (trial) => ((trial.status = 'error'), delete trial.output, delete trial.evaluator),
      /is an error with no message/,
    ],
  ]) {
    const malformed = classifyGap((scenario) => edit(scenario.candidate.trials[0]));
    check(
      malformed.disposition === 'undetermined' && expected.test(malformed.reasons.join(' ')),
      `${label} is reported and leaves the candidate undetermined: ${malformed.disposition} ${malformed.reasons.join('; ')}`,
    );
  }
}

/** The evidence a folder holds is read from its own layout, through no link. */
function checkLoadReviewInputs() {
  const folder = evaluationCopy('inputs');
  plantObserved(folder, 'seeded-gap');
  const { record } = observed['seeded-gap'];
  const loaded = review.loadReviewInputs(folder, record, REFERENCE_PATH);
  check(
    review.classifyCandidate(record, loaded).disposition === 'confirmed-undesirable-missed' && loaded.reference.equals(referenceBytes),
    'the evidence and the reference a folder holds classify the candidate as the in-memory bytes do',
  );
  check(
    Object.keys(review.loadReviewInputs(folder, record).evidence).length === 2 &&
      review.loadReviewInputs(folder, record).reference === undefined,
    'loading without a reference path loads the evidence only',
  );
  const evidenceFile = path.join(folder, 'discovery', record.campaignId, 'evidence', `${record.candidateId}.OBS-002.json`);
  fs.rmSync(evidenceFile);
  fs.symlinkSync(path.join(folder, REFERENCE_PATH), evidenceFile);
  check(
    !('OBS-002' in review.loadReviewInputs(folder, record, REFERENCE_PATH).evidence),
    'an evidence file reached through a link is left out and reads as missing',
  );
  const missing = review.classifyCandidate(record, review.loadReviewInputs(folder, record, REFERENCE_PATH));
  check(
    missing.disposition === 'undetermined' && /OBS-002 \(candidate\) evidence is not held/.test(missing.reasons.join(' ')),
    'a link-reached evidence file classifies as undetermined',
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
  const stale = (disposition) => ({ ...observed['harmless-edit'].record, disposition });
  for (const stop of ['undetermined', 'target-error']) {
    check(
      review.settleCandidate(stale(stop), observed['harmless-edit'].inputs).disposition === null,
      `the ${stop} stop is cleared once complete evidence no longer supports it`,
    );
  }
  check(
    review.settleCandidate(stale('judge-failure'), observed['harmless-edit'].inputs).disposition === 'judge-failure',
    'a stop this function did not set is left as it is',
  );
  check(
    review.settleCandidate(stale('undetermined'), observed['missing-evidence'].inputs).disposition === 'undetermined',
    'a stop the evidence still supports is kept',
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
  refuses(
    'promoting an unreviewed candidate',
    () => review.promoteCandidate(folder, unreviewed, REFERENCE_PATH),
    /only a reviewed candidate is promoted/,
  );
  const harmless = plantReviewed('harmless-edit', 'observationally-unchanged');
  refuses(
    'promoting the harmless edit',
    () => review.promoteCandidate(folder, harmless, REFERENCE_PATH),
    /only a confirmed undesirable candidate is promoted/,
  );
  const short = plantReviewed('missing-evidence', 'undetermined');
  refuses(
    'promoting an undetermined review',
    () => review.promoteCandidate(folder, short, REFERENCE_PATH),
    /only a confirmed undesirable candidate is promoted/,
  );

  const gapPath = plantReviewed('seeded-gap', 'confirmed-undesirable-missed');
  const promotion = review.promoteCandidate(folder, gapPath, REFERENCE_PATH);
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

  check(cliCheck(folder).status === 10, 'tea-evaluate check exits 10 over a probe that names a draft nobody promoted');

  review.applyPromotion(folder, promotion);
  await writeCorpusIndex(folder);
  const after = await checkEvaluation(folder);
  check(after.length === 0, `the native check accepts the promoted draft with an authored probe: ${JSON.stringify(after)}`);
  const cli = cliCheck(folder);
  check(cli.status === 0, `tea-evaluate check exits 0 over the promoted draft; got ${cli.status}: ${cli.output}`);
  const stored = readCandidate(folder, gapPath);
  check(stored.state === 'promoted' && stored.promotion.draftMutationId === 'M-002', 'the promoted record is stored and still reads');
  check(
    fs.readFileSync(path.join(folder, 'mutations', 'M-002.mutation.json'), 'utf8') === promotion.files[0].content,
    'the draft mutation is written as the promotion stated',
  );
  refuses('applying a promotion twice', () => review.applyPromotion(folder, promotion), /changed after the promotion was computed/);
  refuses(
    'promoting a promoted candidate',
    () => review.promoteCandidate(folder, gapPath, REFERENCE_PATH),
    /only a reviewed candidate is promoted/,
  );

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
  check(cliCheck(folder).status === 10, 'tea-evaluate check exits 10 over a probe that carries its own qualification fields');
  plant(folder, 'probes/P-003.probe.json', `${JSON.stringify(probe, null, 2)}\n`);

  const qualifiedDraft = { ...promotion.draft, qualification: { route: 'controlled-mutation', mutation: 'M-002' } };
  plant(folder, 'mutations/M-002.mutation.json', `${JSON.stringify(qualifiedDraft, null, 2)}\n`);
  await writeCorpusIndex(folder);
  const draftFindings = await checkEvaluation(folder);
  check(
    draftFindings.some((finding) => finding.file === 'mutations/M-002.mutation.json' && finding.rule === 'schema'),
    `a draft that claims a qualification is refused by the native check; got ${JSON.stringify(draftFindings)}`,
  );
  check(cliCheck(folder).status === 10, 'tea-evaluate check exits 10 over a draft that claims a qualification');
  plant(folder, 'mutations/M-002.mutation.json', promotion.files[0].content);

  const claimed = structuredClone(stored);
  claimed.promotion.qualificationReceipt = {
    path: 'baseline/qualification/P-003/mutated-fail.json',
    digest: bytesDigest(Buffer.from('a receipt nobody wrote')),
  };
  plant(folder, gapPath, serializeCandidate(claimed));
  const claimedError = outcome(() => readCandidate(folder, gapPath));
  check(
    claimedError instanceof candidateModule.CandidateError && /does not exist in the evaluation folder/.test(claimedError.message),
    'a record that claims a qualification receipt the folder does not hold is refused by the reader',
  );

  // Evidence lost or altered after the review ends the promotion.
  for (const [label, damage] of [
    [
      'a retained evidence file deleted',
      (target) =>
        fs.rmSync(
          path.join(target, 'discovery', scenarios.campaignId, 'evidence', `${observed['seeded-gap'].record.candidateId}.OBS-002.json`),
        ),
    ],
    ['the reference replaced', (target) => plant(target, REFERENCE_PATH, '{"kind":"reference-computation","reference":"x","cases":{}}\n')],
    ['the reference deleted', (target) => fs.rmSync(path.join(target, ...REFERENCE_PATH.split('/')))],
  ]) {
    const damaged = evaluationCopy('promotion-damaged');
    const damagedPath = plantObserved(damaged, 'seeded-gap', reviewedRecord('seeded-gap', 'confirmed-undesirable-missed'));
    damage(damaged);
    if (label.startsWith('the reference')) {
      // The reader holds the cited reference snapshot to its digest before the classification runs.
      const error = outcome(() => review.promoteCandidate(damaged, damagedPath, REFERENCE_PATH));
      check(
        error instanceof candidateModule.CandidateError && /digests to|does not exist/.test(error.message),
        `promoting after ${label}: expected the reader to refuse the cited snapshot, got ${error?.message ?? 'a result'}`,
      );
    } else {
      refuses(
        `promoting after ${label}`,
        () => review.promoteCandidate(damaged, damagedPath, REFERENCE_PATH),
        /now classifies as undetermined/,
      );
    }
    check(!fs.existsSync(path.join(damaged, 'mutations', 'M-002.mutation.json')), `promoting after ${label} wrote no draft`);
  }

  // Applying a promotion holds the cited evidence and the stored record to what the promotion was computed from.
  const applied = (label) => {
    const target = evaluationCopy(label);
    const targetPath = plantObserved(target, 'seeded-gap', reviewedRecord('seeded-gap', 'confirmed-undesirable-missed'));
    return { target, targetPath, promotion: review.promoteCandidate(target, targetPath, REFERENCE_PATH) };
  };
  const evidenceChanged = applied('apply-evidence-changed');
  plant(evidenceChanged.target, REFERENCE_PATH, '{"kind":"reference-computation","reference":"x","cases":{}}\n');
  const readerRefuses = (label, fn, expected) => {
    const error = outcome(fn);
    check(
      error instanceof candidateModule.CandidateError && expected.test(error.message),
      `${label}: expected the reader to refuse, got ${error?.message ?? 'a result'}`,
    );
  };
  readerRefuses(
    'applying after the cited reference changed',
    () => review.applyPromotion(evidenceChanged.target, evidenceChanged.promotion),
    /digests to/,
  );
  const untouched = (state, label) => {
    check(!fs.existsSync(path.join(state.target, 'mutations', 'M-002.mutation.json')), `${label} wrote no draft`);
    check(
      !fs.existsSync(path.join(state.target, ...`${state.targetPath}.tmp`.split('/'))) &&
        JSON.parse(fs.readFileSync(path.join(state.target, ...state.targetPath.split('/')), 'utf8')).state === 'reviewed',
      `${label} left the candidate reviewed and no staging file`,
    );
  };
  untouched(evidenceChanged, 'applying after the cited reference changed');
  for (const [label, damage] of [
    [
      'an observation file replaced',
      (target, id) => plant(target, `discovery/${scenarios.campaignId}/evidence/${id}.OBS-002.json`, 'not the evidence the review used'),
    ],
    [
      'an observation file deleted',
      (target, id) => fs.rmSync(path.join(target, 'discovery', scenarios.campaignId, 'evidence', `${id}.OBS-001.json`)),
    ],
  ]) {
    const state = applied('apply-observation');
    damage(state.target, state.promotion.record.candidateId);
    refuses(`applying after ${label}`, () => review.applyPromotion(state.target, state.promotion), /now classifies as undetermined/);
    untouched(state, `applying after ${label}`);
  }
  // The files come from the promoted record: a changed path or content is refused before anything is written.
  for (const [label, forge] of [
    ['a mutation path outside the folder', (promotion) => (promotion.files[0].path = '../outside.txt')],
    ['an absolute mutation path', (promotion, state) => (promotion.files[0].path = path.join(path.dirname(state.target), 'outside.txt'))],
    ['another mutation name', (promotion) => (promotion.files[0].path = 'mutations/M-009.mutation.json')],
    ['a candidate path outside the folder', (promotion) => (promotion.files[1].path = '../C-001.candidate.json')],
    ['other mutation content', (promotion) => (promotion.files[0].content = 'written outside the evaluation folder\n')],
    ['other record content', (promotion) => (promotion.files[1].content = '{}\n')],
    ['another draft', (promotion) => (promotion.draft = { ...promotion.draft, mutationId: 'M-009' })],
    ['another record', (promotion) => (promotion.record = { ...promotion.record, candidateId: 'C-099' })],
    [
      'a record with another conclusion, re-scoped and rewritten consistently',
      (promotion) => {
        promotion.record.disposition = 'confirmed-undesirable-caught';
        promotion.record.review.scope = candidateModule.decisionScope(promotion.record);
        promotion.files[1].content = candidateModule.canonicalJson(promotion.record);
      },
    ],
    [
      'a record with another rationale',
      (promotion) => {
        promotion.record.review.rationale = 'A different rationale';
        promotion.record.review.scope = candidateModule.decisionScope(promotion.record);
        promotion.files[1].content = candidateModule.canonicalJson(promotion.record);
      },
    ],
  ]) {
    const state = applied('apply-forged');
    const forged = structuredClone(state.promotion);
    forge(forged, state);
    const error = outcome(() => review.applyPromotion(state.target, forged));
    check(
      error instanceof review.ReviewError || error instanceof candidateModule.CandidateError,
      `applying ${label}: expected a refusal, got ${error?.message ?? 'a result'}`,
    );
    check(!fs.existsSync(path.join(path.dirname(state.target), 'outside.txt')), `applying ${label} wrote outside the evaluation folder`);
    untouched(state, `applying ${label}`);
  }
  const forgedId = applied('apply-forged-id');
  const withId = structuredClone(forgedId.promotion);
  withId.record.promotion.draftMutationId = 'M-077';
  withId.draft = candidateModule.draftMutation(withId.record);
  withId.files = [
    { path: 'mutations/M-077.mutation.json', content: `${JSON.stringify(withId.draft, null, 2)}\n` },
    { path: withId.files[1].path, content: candidateModule.canonicalJson(withId.record) },
  ];
  refuses(
    'applying a promotion with a mutation ID that is not the next one',
    () => review.applyPromotion(forgedId.target, withId),
    /not the next free mutation ID/,
  );
  untouched(forgedId, 'applying a promotion with a mutation ID that is not the next one');
  check(!fs.existsSync(path.join(forgedId.target, 'mutations', 'M-077.mutation.json')), 'a forged mutation ID wrote its draft');
  // Evidence that changes after the staging has begun still ends the promotion before the record is swapped.
  const evidenceMidway = applied('apply-evidenceMidway');
  const writeFile = fs.writeFileSync;
  fs.writeFileSync = (file, content, options) => {
    if (String(file).endsWith('M-002.mutation.json')) {
      writeFile(
        path.join(
          evidenceMidway.target,
          'discovery',
          scenarios.campaignId,
          'evidence',
          `${evidenceMidway.promotion.record.candidateId}.OBS-002.json`,
        ),
        'not the evidence the review used',
      );
    }
    return writeFile(file, content, options);
  };
  try {
    refuses(
      'applying while an observation changes',
      () => review.applyPromotion(evidenceMidway.target, evidenceMidway.promotion),
      /now classifies as undetermined/,
    );
  } finally {
    fs.writeFileSync = writeFile;
  }
  untouched(evidenceMidway, 'applying while an observation changes');
  const paths = applied('promote-paths');
  for (const [label, relative, reference] of [
    ['a candidate path that climbs out of the folder', '../valid/discovery/red-phase-review/C-001.candidate.json', REFERENCE_PATH],
    ['a candidate path outside the lane', 'requirements.md', REFERENCE_PATH],
    ['a reference path that climbs out of the folder', paths.targetPath, '../outside.json'],
    ['an absolute reference path', paths.targetPath, path.join(paths.target, ...REFERENCE_PATH.split('/'))],
    ['a reference other than the one the record cites', paths.targetPath, 'discovery/red-phase-review/evidence/other.json'],
  ]) {
    refuses(
      `promoting with ${label}`,
      () => review.promoteCandidate(paths.target, relative, reference),
      /not a path inside|not discovery|not .* as its independent evidence|cites/,
    );
  }
  refuses(
    'loading review inputs from a path that climbs out of the folder',
    () => review.loadReviewInputs(paths.target, paths.promotion.record, '../../etc/passwd'),
    /not a path inside the evaluation folder/,
  );
  const raced = applied('apply-raced');
  const rewrittenRecord = fs
    .readFileSync(path.join(raced.target, ...raced.targetPath.split('/')), 'utf8')
    .replace('The reference and the cited', 'A rewrittenRecord review: the reference and the cited');
  const originalWrite = fs.writeFileSync;
  fs.writeFileSync = (file, content, options) => {
    if (String(file).endsWith('M-002.mutation.json'))
      originalWrite(path.join(raced.target, ...raced.targetPath.split('/')), rewrittenRecord);
    return originalWrite(file, content, options);
  };
  try {
    refuses(
      'applying while a newer review is written',
      () => review.applyPromotion(raced.target, raced.promotion),
      /changed while the promotion was written/,
    );
  } finally {
    fs.writeFileSync = originalWrite;
  }
  check(
    fs.readFileSync(path.join(raced.target, ...raced.targetPath.split('/')), 'utf8') === rewrittenRecord &&
      !fs.existsSync(path.join(raced.target, 'mutations', 'M-002.mutation.json')),
    'a review written while a promotion was applied is kept and the draft is cleaned up',
  );
  for (const reference of [
    'discovery/red-phase-review/evidence/../reference.json',
    'discovery/red-phase-review/evidence/sub/reference.json',
    'discovery/red-phase-review/evidence/x.candidate.json',
  ]) {
    const { record, inputs } = gapWith(() => {});
    const placed = review.classifyCandidate(record, { ...inputs, referencePath: reference });
    check(
      placed.disposition === 'undetermined' && placed.independentEvidence === null,
      `a reference at ${reference} is not cited: ${placed.disposition}`,
    );
  }

  // A decision written while the promotion is computed is never overwritten by it.
  const midway = evaluationCopy('promotion-midway');
  const midwayPath = plantObserved(midway, 'seeded-gap', reviewedRecord('seeded-gap', 'confirmed-undesirable-missed'));
  const newer = review.reviewCandidate(observed['seeded-gap'].record, observed['seeded-gap'].inputs, {
    ...DECISION,
    rationale: 'A newer review, written while the promotion was computed.',
    disposition: 'confirmed-undesirable-missed',
  });
  const realReaddir = fs.readdirSync;
  fs.readdirSync = (...args) => {
    fs.readdirSync = realReaddir;
    plant(midway, midwayPath, serializeCandidate(newer));
    return realReaddir(...args);
  };
  refuses(
    'promoting while the record is rewritten',
    () => review.promoteCandidate(midway, midwayPath, REFERENCE_PATH),
    /changed while the promotion was computed/,
  );
  fs.readdirSync = realReaddir;

  // A conclusion rewritten after the review, with its binding recomputed, is not the one the evidence supports.
  const rewritten = evaluationCopy('promotion-rewritten');
  const reviewedGap = structuredClone(reviewedRecord('seeded-gap', 'confirmed-undesirable-missed'));
  reviewedGap.disposition = 'confirmed-undesirable-caught';
  reviewedGap.review.scope = decisionScope(reviewedGap);
  const rewrittenPath = plantObserved(rewritten, 'seeded-gap', validateCandidate(reviewedGap));
  refuses(
    'promoting a conclusion the evidence does not support',
    () => review.promoteCandidate(rewritten, rewrittenPath, REFERENCE_PATH),
    /now classifies as confirmed-undesirable-missed, which does not support the stored confirmed-undesirable-caught/,
  );

  // A failed or stale write leaves the folder as it was.
  const racing = evaluationCopy('promotion-racing');
  const racingPath = plantObserved(racing, 'seeded-gap', reviewedRecord('seeded-gap', 'confirmed-undesirable-missed'));
  const racingPromotion = review.promoteCandidate(racing, racingPath, REFERENCE_PATH);
  const racingBefore = fs.readFileSync(path.join(racing, ...racingPath.split('/')), 'utf8');
  plant(racing, `${racingPath}.tmp`, 'a staging file from a crash');
  refuses('applying over a leftover staging file', () => review.applyPromotion(racing, racingPromotion), /already exists/);
  check(!fs.existsSync(path.join(racing, 'mutations', 'M-002.mutation.json')), 'a failed apply leaks no draft mutation');
  check(
    fs.readFileSync(path.join(racing, ...racingPath.split('/')), 'utf8') === racingBefore,
    'a failed apply leaves the stored record as it was',
  );
  fs.rmSync(path.join(racing, `${racingPath}.tmp`));
  plant(racing, 'mutations/M-002.mutation.json', '{}\n');
  refuses(
    'applying over a draft name taken since the promotion was computed',
    () => review.applyPromotion(racing, racingPromotion),
    /not the next free mutation ID/,
  );
  check(!fs.existsSync(path.join(racing, `${racingPath}.tmp`)), 'a failed apply removes its staging file');
  check(
    fs.readFileSync(path.join(racing, ...racingPath.split('/')), 'utf8') === racingBefore,
    'a refused draft name leaves the stored record as it was',
  );
  fs.rmSync(path.join(racing, 'mutations', 'M-002.mutation.json'));

  // A write that fails after the file exists leaves nothing behind.
  const realWrite = fs.writeFileSync;
  for (const suffix of ['.mutation.json', '.tmp']) {
    fs.writeFileSync = (file, ...rest) => {
      if (String(file).endsWith(suffix)) {
        realWrite(file, 'partial');
        throw Object.assign(new Error('no space left on device'), { code: 'ENOSPC' });
      }
      return realWrite(file, ...rest);
    };
    const failure = outcome(() => review.applyPromotion(racing, racingPromotion));
    fs.writeFileSync = realWrite;
    check(failure?.code === 'ENOSPC', `a write that fails after creating a ${suffix} file reports its error`);
    check(
      !fs.existsSync(path.join(racing, `${racingPath}.tmp`)) && !fs.existsSync(path.join(racing, 'mutations', 'M-002.mutation.json')),
      `a failed ${suffix} write leaves no staging file or partial draft`,
    );
    check(
      fs.readFileSync(path.join(racing, ...racingPath.split('/')), 'utf8') === racingBefore,
      `a failed ${suffix} write keeps the stored record`,
    );
  }
  const redecided = review.reviewCandidate(observed['seeded-gap'].record, observed['seeded-gap'].inputs, {
    ...DECISION,
    rationale: 'A second review, made after the promotion was computed.',
    disposition: 'confirmed-undesirable-missed',
  });
  plant(racing, racingPath, serializeCandidate(redecided));
  refuses(
    'applying over a record decided again in between',
    () => review.applyPromotion(racing, racingPromotion),
    /changed after the promotion was computed/,
  );
  check(!fs.existsSync(path.join(racing, 'mutations', 'M-002.mutation.json')), 'a stale apply leaks no draft mutation');
  check(readCandidate(racing, racingPath).review.rationale.startsWith('A second review'), 'a stale apply keeps the newer decision');

  const blocked = evaluationCopy('promotion-blocked');
  const blockedPath = plantObserved(blocked, 'seeded-gap', reviewedRecord('seeded-gap', 'confirmed-undesirable-missed'));
  plant(blocked, 'mutations/M-002.mutation.json', '{}\n');
  const blockedPromotion = review.promoteCandidate(blocked, blockedPath, REFERENCE_PATH);
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

/** `record` as another candidate: a new ID with its identity recomputed, for fixtures that need more rows than the scenarios. */
function variant(record, candidateId, change = () => {}) {
  const next = structuredClone(record);
  next.candidateId = candidateId;
  change(next);
  next.identity = candidateIdentity(next);
  return next;
}

/** Control characters other than the newline that ends a line, and the bidirectional formatting characters. */
// eslint-disable-next-line no-control-regex
const UNPRINTABLE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F‪-‮⁦-⁩]/;

/**
 * A campaign folder with every kind of row: a promoted gap with an accepted risk, a reviewed harmless edit, a reviewer's
 * undetermined and inapplicable conclusions, an errored run, a short run, a generated candidate and a generation error,
 * and five files the reader refuses (not JSON, another candidate's ID, a stale review, a link, a directory).
 */
function campaignFolder(label = 'report') {
  const folder = evaluationCopy(label);
  const planted = [];
  const put = (name, record) => {
    plantObserved(folder, name, record);
    planted.push(record);
  };
  const decide = (name, record, disposition) => review.reviewCandidate(record, observed[name].inputs, { ...DECISION, disposition });

  const waived = structuredClone(decide('seeded-gap', observed['seeded-gap'].record, 'confirmed-undesirable-missed'));
  waived.acceptedRisk = {
    reviewer: 'maintainer',
    decidedAt: '2026-10-14T10:00:00Z',
    rationale: 'The gate stays green until the placeholder oracle lands.',
    revisitWhen: 'the placeholder-assertion oracle is authored',
    scope: decisionScope(waived),
  };
  const gapPath = plantObserved(folder, 'seeded-gap', validateCandidate(waived));
  review.applyPromotion(folder, review.promoteCandidate(folder, gapPath, REFERENCE_PATH));
  planted.push(readCandidate(folder, gapPath));

  put('harmless-edit', decide('harmless-edit', observed['harmless-edit'].record, 'observationally-unchanged'));
  put('target-error', review.settleCandidate(observed['target-error'].record, observed['target-error'].inputs));
  put('missing-evidence', review.settleCandidate(observed['missing-evidence'].record, observed['missing-evidence'].inputs));
  put('missing-evidence', decide('missing-evidence', variant(observed['missing-evidence'].record, 'C-020'), 'undetermined'));
  put('harmless-edit', decide('harmless-edit', variant(observed['harmless-edit'].record, 'C-021'), 'inapplicable'));

  const spare = Object.values(generatedAll).find(
    (record) =>
      !scenarios.scenarios.some((scenario) => scenario.edit.find === record.edit.find && scenario.edit.replace === record.edit.replace),
  );
  const generatedPath = candidatePath(spare.campaignId, spare.candidateId);
  plant(folder, generatedPath, serializeCandidate(spare));
  planted.push(spare);
  const stopped = variant(spare, 'C-022', (record) => {
    record.disposition = 'generation-error';
  });
  plant(folder, candidatePath(stopped.campaignId, stopped.candidateId), serializeCandidate(stopped));
  planted.push(stopped);

  const lane = `discovery/${scenarios.campaignId}`;
  plant(folder, `${lane}/C-099.candidate.json`, '{"recordKind": "exploratory-candidate", "oops"\n');
  plant(folder, `${lane}/C-098.candidate.json`, serializeCandidate(stopped));
  const stale = decide('harmless-edit', variant(observed['harmless-edit'].record, 'C-097'), 'observationally-unchanged');
  stale.edit.replace = 'Keep every generated test file under 9000 lines.';
  plant(folder, `${lane}/C-097.candidate.json`, canonicalJson(stale));
  fs.symlinkSync(path.join(folder, ...generatedPath.split('/')), path.join(folder, ...`${lane}/C-096.candidate.json`.split('/')));
  fs.mkdirSync(path.join(folder, ...`${lane}/C-095.candidate.json`.split('/')));
  return { folder, planted };
}

/** The numbers after `label` in a line of the text report. */
function numbersAfter(text, label) {
  return (new RegExp(`^${label}.*$`, 'm').exec(text)?.[0].match(/\d+/g) ?? []).map(Number);
}

/** `values` counted, as the report keys them. */
function tallied(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

/** Every candidate, stop, unreadable file, accepted risk and pending qualification shows in both forms, and the forms reconcile. */
function checkReport() {
  const { folder, planted } = campaignFolder();
  const campaign = reportModule.readCampaign(folder, scenarios.campaignId);
  const json = reportModule.projectCampaign(campaign);
  const text = reportModule.renderCampaign(json);
  const files = fs.readdirSync(path.join(folder, 'discovery', scenarios.campaignId)).filter((name) => name.endsWith('.candidate.json'));
  const unreadable = ['C-099', 'C-098', 'C-097', 'C-096', 'C-095'].map((id) => `discovery/${scenarios.campaignId}/${id}.candidate.json`);

  check(
    json.counts.files === files.length && json.counts.candidates === planted.length && json.counts.unreadable === unreadable.length,
    `every candidate file has a row: ${planted.length} readable, ${unreadable.length} unreadable of ${files.length} files; got ${JSON.stringify(json.counts)}`,
  );
  check(
    JSON.stringify(json.unreadable.map(({ file }) => file).sort()) === JSON.stringify([...unreadable].sort()),
    'each refused file is listed: not JSON, another candidate ID, a stale review, a link and a directory',
  );
  check(
    json.kind === 'exploratory-candidate-report' &&
      json.advisory === true &&
      Object.keys(json).sort().join(',') === 'advisory,campaignId,candidates,counts,kind,schemaVersion,unreadable',
    'the JSON report is a named, versioned projection marked advisory',
  );
  check(
    canonicalJson(json.counts.byState) === canonicalJson(tallied(json.candidates.map((row) => row.state))) &&
      json.counts.byState.promoted === 1 &&
      json.counts.byState.reviewed === 3 &&
      json.counts.byState.observed === 2 &&
      json.counts.byState.generated === 2,
    `the states are counted: ${JSON.stringify(json.counts.byState)}`,
  );
  const dispositions = json.counts.byDisposition;
  check(
    canonicalJson(dispositions) === canonicalJson(tallied(planted.map((record) => record.disposition ?? 'none'))) &&
      dispositions['confirmed-undesirable-missed'] === 1 &&
      dispositions['observationally-unchanged'] === 1 &&
      dispositions['target-error'] === 1 &&
      dispositions.undetermined === 2 &&
      dispositions.inapplicable === 1 &&
      dispositions['generation-error'] === 1 &&
      dispositions.none === 1,
    `every disposition is counted, none among them hidden; got ${JSON.stringify(dispositions)}`,
  );
  const trials = { planned: 0, completed: 0, errors: 0, missing: 0 };
  for (const record of planted)
    for (const observation of record.observations) for (const key of Object.keys(trials)) trials[key] += observation.trials[key];
  check(
    JSON.stringify(json.counts.trials) === JSON.stringify(trials) && trials.errors === 3 && trials.missing === 4,
    `the trial totals keep the errored and missing trials: ${JSON.stringify(json.counts.trials)} against ${JSON.stringify(trials)}`,
  );
  check(
    json.counts.acceptedRisk === 1 && json.counts.promotions.pendingQualification === 1 && json.counts.promotions.receiptAttached === 0,
    'the accepted risk and the pending qualification are counted',
  );

  for (const record of planted) {
    const row = json.candidates.find((entry) => entry.candidateId === record.candidateId);
    check(row !== undefined, `${record.candidateId} has a JSON row`);
    if (!row) continue;
    check(
      row.state === record.state &&
        row.disposition === record.disposition &&
        row.identity === record.identity &&
        row.hypothesis === record.hypothesis &&
        row.edit.target === record.target.artifact &&
        row.edit.find === record.edit.find &&
        row.edit.replace === record.edit.replace &&
        canonicalJson(row.observations) === canonicalJson(record.observations) &&
        canonicalJson(row.independentEvidence) === canonicalJson(record.independentEvidence) &&
        row.review?.reviewer === record.review?.reviewer &&
        row.review?.rationale === record.review?.rationale &&
        row.acceptedRisk?.revisitWhen === record.acceptedRisk?.revisitWhen &&
        row.promotion?.draftMutationId === record.promotion?.draftMutationId,
      `${record.candidateId}: the JSON row repeats the record`,
    );
    check(
      text.split('\n').includes(`${record.candidateId} ${record.state} ${record.disposition ?? 'no disposition'}`),
      `${record.candidateId}: the text heading pairs its state with its disposition`,
    );
    for (const observation of record.observations) {
      const { trials: counts } = observation;
      check(
        text.includes(
          `  ${observation.arm} ${observation.observationId}: planned ${counts.planned} completed ${counts.completed} errors ${counts.errors} missing ${counts.missing} evidence ${observation.evidence}`,
        ),
        `${record.candidateId}: the text shows ${observation.observationId} with its trial counts and evidence digest`,
      );
    }
    for (const evidence of record.independentEvidence) {
      check(
        text.includes(`  independent evidence: ${evidence.kind}, ${evidence.reference} (${evidence.digest})`),
        `${record.candidateId}: the text shows its independent evidence`,
      );
    }
    if (record.review)
      check(
        text.includes(`  review: ${record.review.reviewer} at ${record.review.decidedAt}: ${record.review.rationale}`),
        `${record.candidateId}: the text shows its review`,
      );
  }
  check(
    text.split('\n').filter((line) => /^C-\d+ /.test(line)).length === planted.length && /^unreadable:$/m.test(text),
    'the text has one heading per readable candidate and an unreadable section',
  );
  check(
    JSON.stringify(numbersAfter(text, 'files')) === JSON.stringify([json.counts.files, json.counts.candidates, json.counts.unreadable]) &&
      JSON.stringify(numbersAfter(text, 'trials')) === JSON.stringify(Object.values(json.counts.trials)) &&
      JSON.stringify(numbersAfter(text, 'accepted risk')) === JSON.stringify([1]),
    'the text counts reconcile with the JSON counts',
  );
  for (const expected of [
    /^C-\d+ observed target-error$/m,
    /fix the target error and observe again/,
    /collect the missing or errored trials/,
    /stopped at generation-error; fix its cause and run the candidate again/,
    /accepted risk: maintainer .*revisit when the placeholder-assertion oracle is authored/,
    /promotion: draft mutation M-002, qualification pending/,
    /the draft counts for nothing until a native qualification receipt exists/,
    /^discovery\/red-phase-review\/C-099\.candidate\.json: \[unreadable-candidate\] is not JSON/m,
    /^discovery\/red-phase-review\/C-098\.candidate\.json: \[unreadable-candidate\] candidateId C-022 differs from the file name C-098/m,
    /^discovery\/red-phase-review\/C-097\.candidate\.json: \[unreadable-candidate\] identity is /m,
    /^discovery\/red-phase-review\/C-096\.candidate\.json: \[unreadable-candidate\] .*link/m,
    /^discovery\/red-phase-review\/C-095\.candidate\.json: \[unreadable-candidate\] .*not a regular file/m,
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

/** Free text from a record, a file name and a parser message cannot start a forged line or move the cursor. */
function checkHostileText() {
  const folder = evaluationCopy('hostile');
  const forged = `plain\nC-777 promoted confirmed-undesirable-caught\u001B[2J${BIDI_OVERRIDE}`;
  const plantRecord = (record) => plant(folder, candidatePath(record.campaignId, record.candidateId), serializeCandidate(record));

  const hypothesis = variant(generated['harmless-edit'], 'C-001', (record) => {
    record.hypothesis = forged;
  });
  plantRecord(hypothesis);
  const edited = variant(generated['harmless-edit'], 'C-002', (record) => {
    record.edit = { find: `find ${forged}`, replace: `replace ${forged}`, occurrences: 1 };
    record.target.artifact = 'skill/steps-c/step-04-generate-tests.md';
  });
  plantRecord(edited);
  const decided = review.reviewCandidate(variant(observed['seeded-gap'].record, 'C-003'), observed['seeded-gap'].inputs, {
    ...DECISION,
    reviewer: `reviewer ${forged}`,
    rationale: `rationale ${forged}`,
    disposition: 'confirmed-undesirable-missed',
  });
  const waived = structuredClone(decided);
  waived.acceptedRisk = {
    reviewer: 'maintainer',
    decidedAt: '2026-10-14T10:00:00Z',
    rationale: `risk ${forged}`,
    revisitWhen: `revisit ${forged}`,
    scope: decisionScope(waived),
  };
  plantObserved(folder, 'seeded-gap', validateCandidate(waived));
  plant(folder, `discovery/${hypothesis.campaignId}/evidence/C-003.OBS-001.json`, observed['seeded-gap'].inputs.evidence['OBS-001']);
  const lane = `discovery/${hypothesis.campaignId}`;
  plant(folder, `${lane}/x${'\u001B[2J'}name.candidate.json`, `{"pwned": "${forged.replaceAll('\n', ' ')}" \u001B]0;pwned\u0007`);

  const text = reportModule.renderCampaign(reportModule.projectCampaign(reportModule.readCampaign(folder, hypothesis.campaignId)));
  check(!UNPRINTABLE.test(text), 'no control or direction character reaches the text report');
  check(!/^C-777/m.test(text), 'a newline in free text does not start a forged candidate heading');
  const rows = text.split('\n').filter((line) => /^C-\d+ /.test(line));
  check(rows.length === 3, `the three hostile candidates have their own rows; got ${JSON.stringify(rows)}`);
  for (const where of [
    'hypothesis: plain',
    'find plain',
    'replace plain',
    'review: reviewer plain',
    'rationale plain',
    'risk plain',
    'revisit plain',
  ]) {
    const found = text
      .split('\n')
      .some((line) => line.includes(where.split(' ')[0]) && line.includes(`${where.split(' ').slice(1).join(' ')}\\nC-777`));
    check(found, `${where.split(' ')[0]}: the escaped free text is still readable on its own line`);
  }
  check(
    /^"discovery\/red-phase-review\/x\\u001b\[2Jname\.candidate\.json": \[unreadable-candidate\] /m.test(text),
    'an unreadable file with a control character in its name is quoted and escaped',
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
    checkNoiseAndMalformedEvidence();
    checkLoadReviewInputs();
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
