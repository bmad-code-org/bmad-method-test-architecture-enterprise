/**
 * The exploratory candidate contract and the boundary that keeps it out of every scored artifact.
 *
 * A candidate is a proposed edit whose defect no native oracle demonstrates yet. It is reviewed and promoted to a draft
 * mutation; it is never scored. This file holds that line from both sides:
 *
 * - the contract: one versioned fixture parses and serializes to the same bytes, every state and disposition is
 *   representable, the lifecycle only moves forward, and a record that is unversioned, unknown, held-out, unevidenced,
 *   stale, forged or carrying a native field is refused. A file is read only from its own path, through no link, and held
 *   to the requirements file and the receipt it names;
 * - the boundary, through the real loader: the fixture's own bytes are planted where a scored artifact reads (every
 *   directory of the folder, `evaluation.json`, a probe's qualification) and `checkEvaluation` and the `tea-evaluate check`
 *   binary refuse each. The same bytes under `discovery/` leave check, the corpus digest and the index byte-identical;
 * - no native change: no native schema or fixture carries a candidate field, no disposition is an eval-quality outcome,
 *   verdict or qualification failure, and a promoted candidate's draft is an ordinary mutation `check` accepts. The import
 *   boundary itself is the `discovery-import` rule of `test/test-evaluate-boundaries.js`.
 *
 * Usage: node test/test-evaluate-discovery.js
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const AjvModule = require('ajv/dist/2020');

const discovery = require('../cli/lib/evaluate/discovery/candidate');
const { checkEvaluation } = require('../cli/lib/evaluate/check');
const { INDEXED_ROOTS, buildCorpusIndex, writeCorpusIndex } = require('../cli/lib/evaluate/corpus-index');
const { digest } = require('../cli/lib/evaluate/digest');
const { loadEngine } = require('../cli/lib/evaluate/engine');
const { addFormats } = require('../cli/lib/evaluate/formats');
const { scratchDirectories } = require('./lib/scratch-directories');

const Ajv = AjvModule.default ?? AjvModule;

const PROJECT_ROOT = path.join(__dirname, '..');
const CLI = path.join(PROJECT_ROOT, 'cli', 'evaluate.js');
const VALID = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'valid');
const FIXTURE_FOLDER = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate-discovery');
const FIXTURE_PATH = discovery.candidatePath('red-phase-pilot', 'C-001');
const RECEIPT = 'baseline/qualification/P-003/mutated-fail.json';
const EVIDENCE = 'discovery/red-phase-pilot/evidence/playwright-test-annotations.md';
const PLANNED = path.join(PROJECT_ROOT, 'test', 'fixtures', 'evaluate', 'partition-plan', 'evals', 'verdict');
const NATIVE_SCHEMAS = path.join(PROJECT_ROOT, 'cli', 'lib', 'evaluate', 'schemas');
const DISCOVERY_ROOT = path.join(PROJECT_ROOT, 'cli', 'lib', 'evaluate', 'discovery');
const ADR = path.join(PROJECT_ROOT, '_bmad-output', 'planning-artifacts', 'evaluate', 'adr-exploratory-candidate-contract.md');

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };

const failures = [];
let checks = 0;
const scratch = scratchDirectories('tea-evaluate-discovery');

/** Counts one assertion and records its message when `condition` is false. */
function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

const fixtureText = fs.readFileSync(path.join(FIXTURE_FOLDER, ...FIXTURE_PATH.split('/')), 'utf8');
const fixture = () => JSON.parse(fixtureText);

/** `record` with its identity recomputed and every decision re-bound to it, as a careful editor would leave it. */
function rebound(record) {
  const next = structuredClone(record);
  next.identity = discovery.candidateIdentity(next);
  for (const key of ['review', 'acceptedRisk']) if (next[key] !== null) next[key].scope = discovery.decisionScope(next);
  return next;
}

/** The problems `validateCandidate` reports for `record`, or `[]` when it is accepted. */
function problemsOf(record) {
  try {
    discovery.validateCandidate(record);
    return [];
  } catch (error) {
    if (!(error instanceof discovery.CandidateError)) throw error;
    return error.problems;
  }
}

/** Asserts the reader refuses `record` with a problem matching `expected`. */
function refuses(label, record, expected) {
  const problems = problemsOf(record);
  check(problems.length > 0, `${label}: the reader accepted it`);
  check(
    problems.some((problem) => expected.test(problem)),
    `${label}: expected a problem matching ${expected}; got ${JSON.stringify(problems)}`,
  );
}

/** Asserts the reader accepts `record`. */
function accepts(label, record) {
  const problems = problemsOf(record);
  check(problems.length === 0, `${label}: the reader refused it: ${JSON.stringify(problems)}`);
}

/** Asserts the reader refuses the JSON `text` with a problem matching `expected`. */
function refusesText(label, text, expected) {
  let problems = [];
  try {
    discovery.parseCandidate(text);
  } catch (error) {
    if (!(error instanceof discovery.CandidateError)) throw error;
    problems = error.problems;
  }
  check(problems.length > 0, `${label}: the reader accepted it`);
  check(
    problems.some((problem) => expected.test(problem)),
    `${label}: expected a problem matching ${expected}; got ${JSON.stringify(problems)}`,
  );
}

/** `value` with every object's keys in reverse order, at every depth. */
function reversedKeys(value) {
  if (Array.isArray(value)) return value.map(reversedKeys);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .toReversed()
      .map((key) => [key, reversedKeys(value[key])]),
  );
}

/** Every `pattern` of a schema that spells an `X-NNN` identifier. */
function idPatterns(schema, found = new Set()) {
  if (Array.isArray(schema)) for (const item of schema) idPatterns(item, found);
  else if (schema !== null && typeof schema === 'object') {
    if (typeof schema.pattern === 'string' && /^\^[A-Z]+-\[0-9\]/.test(schema.pattern)) found.add(schema.pattern);
    for (const child of Object.values(schema)) idPatterns(child, found);
  }
  return found;
}

/** The fixture parses and serializes to its own bytes, at every key depth, with the identifiers and digests native artifacts use. */
async function checkRoundTrip() {
  const record = discovery.readCandidate(FIXTURE_FOLDER, FIXTURE_PATH);
  check(record.schemaVersion === discovery.CANDIDATE_SCHEMA_VERSION, 'the fixture carries the current schemaVersion');
  check(discovery.serializeCandidate(record) === fixtureText, 'parse then serialize returns the fixture byte for byte');
  const deep = discovery.serializeCandidate(discovery.parseCandidate(JSON.stringify(reversedKeys(record))));
  check(deep === fixtureText, 'key order at every depth of the input leaves the output bytes unchanged');
  check(discovery.candidateIdentity(record) === record.identity, 'the stored identity is the one the reader computes');
  const nativeIdPatterns = ['probe', 'eval-contract'].flatMap((name) => [
    ...idPatterns(
      JSON.parse(
        fs.readFileSync(path.join(path.dirname(require.resolve('eval-quality/package.json')), 'schemas', `${name}.schema.json`), 'utf8'),
      ),
    ),
  ]);
  nativeIdPatterns.push('^M-[0-9]{3,}$');
  check(nativeIdPatterns.length >= 4, `the native identifier patterns were collected (${nativeIdPatterns.length})`);
  check(
    nativeIdPatterns.every((pattern) => !new RegExp(pattern).test(record.candidateId)),
    `the candidate ID ${record.candidateId} matches a native identifier pattern among ${nativeIdPatterns}`,
  );

  const engine = await loadEngine();
  const requirements = fs.readFileSync(path.join(FIXTURE_FOLDER, 'requirements.md'));
  check(
    requirements.equals(fs.readFileSync(path.join(VALID, 'requirements.md'))),
    "the fixture folder holds the valid fixture's requirements bytes",
  );
  check(
    discovery.bytesDigest(requirements) === engine.digestBytes(requirements),
    'the reader digests file bytes the way eval-quality does',
  );
  check(
    record.requirement.digest === JSON.parse(fs.readFileSync(path.join(VALID, 'evaluation.json'), 'utf8')).requirements.digest,
    'the fixture reuses the digest evaluation.json records',
  );
}

/** Every state and disposition has a valid record, and the dispositions that stop a candidate sit at the states that can stop it. */
function checkEveryStateAndDispositionRepresentable() {
  const stop = (state, disposition) => {
    const record = fixture();
    record.state = state;
    record.disposition = disposition;
    record.review = null;
    record.acceptedRisk = null;
    record.promotion = null;
    record.independentEvidence = [];
    if (state === 'generated' || state === 'applicable') record.observations = [];
    return rebound(record);
  };
  accepts('a generated candidate', stop('generated', null));
  accepts('an applicable candidate', stop('applicable', null));
  accepts('an observed candidate', stop('observed', null));
  const stops = {
    'generation-error': 'generated',
    inapplicable: 'applicable',
    'binding-not-consumed': 'observed',
    unexercised: 'observed',
    'target-error': 'observed',
    'judge-failure': 'observed',
    'budget-exhausted': 'observed',
    'observationally-unchanged': 'observed',
    undetermined: 'observed',
  };
  for (const [disposition, state] of Object.entries(stops)) accepts(`disposition ${disposition} at ${state}`, stop(state, disposition));
  for (const disposition of discovery.REVIEW_DISPOSITIONS) {
    const reviewed = fixture();
    reviewed.state = 'reviewed';
    reviewed.disposition = disposition;
    reviewed.promotion = null;
    accepts(`disposition ${disposition} at review`, rebound(reviewed));
  }
  accepts('the promoted fixture', fixture());
  const covered = new Set([...Object.keys(stops), ...discovery.REVIEW_DISPOSITIONS]);
  check(
    discovery.DISPOSITIONS.every((disposition) => covered.has(disposition)),
    `every disposition is exercised; missing ${discovery.DISPOSITIONS.filter((disposition) => !covered.has(disposition))}`,
  );
  check(
    discovery.STATES.join(',') === 'generated,applicable,observed,reviewed,promoted',
    'the candidate states run generated, applicable, observed, reviewed, promoted',
  );
}

/** Each way a record can be unversioned, unknown, held-out, unevidenced, stale, forged or native-shaped is refused with the problem that names it. */
function checkRefusals() {
  refuses('unknown schemaVersion', { ...fixture(), schemaVersion: 2 }, /\/schemaVersion must be equal to constant/);
  const unversioned = fixture();
  delete unversioned.schemaVersion;
  refuses('missing schemaVersion', unversioned, /must have required property 'schemaVersion'/);
  refuses('unknown state', { ...fixture(), state: 'qualified' }, /\/state must be equal to one of the allowed values/);
  refuses('unknown disposition', { ...fixture(), disposition: 'killed' }, /\/disposition/);
  refuses('a native outcome as disposition', { ...fixture(), disposition: 'caught' }, /\/disposition/);
  refuses('a native record kind', { ...fixture(), recordKind: 'probe' }, /\/recordKind must be equal to constant/);
  refuses('a held-out partition', { ...fixture(), partition: 'held-out' }, /\/partition must be equal to constant/);
  refuses('a native-shaped candidate ID', { ...fixture(), candidateId: 'M-001' }, /\/candidateId must match pattern/);
  for (const field of ['outcome', 'verdict', 'qualification', 'score', 'strength', 'probeId', 'reclassifies', 'caught']) {
    refuses(
      `a native ${field} field`,
      { ...fixture(), [field]: 'x' },
      new RegExp(String.raw`must NOT have additional properties \("${field}"\)`),
    );
  }
  const nestedEdit = fixture();
  nestedEdit.edit.operator = 'replace-exact';
  refuses('an unknown field inside the edit', nestedEdit, /\/edit must NOT have additional properties \("operator"\)/);
  const nestedReview = fixture();
  nestedReview.review.outcome = 'caught';
  refuses('an unknown field inside the review', nestedReview, /\/review.*must NOT have additional properties \("outcome"\)/);

  const unevidenced = rebound({ ...fixture(), independentEvidence: [] });
  refuses('a confirmed defect with no independent evidence', unevidenced, /\/independentEvidence/);
  const sameJudge = fixture();
  sameJudge.independentEvidence[0].kind = 'same-judge-rerun';
  refuses('a judge repeating itself as independent evidence', sameJudge, /\/independentEvidence\/0\/kind/);
  const circular = fixture();
  circular.independentEvidence[0].digest = circular.requirement.digest;
  refuses('evidence that is the requirement', rebound(circular), /independentEvidence\[0\]\.digest is the requirement's digest/);
  const echoed = fixture();
  echoed.independentEvidence[0].digest = echoed.observations[1].evidence;
  refuses(
    'evidence that is an observation of the evaluated system',
    rebound(echoed),
    /independentEvidence\[0\]\.digest is an observation's evidence/,
  );

  const unreviewed = rebound({ ...fixture(), state: 'observed', review: null, promotion: null });
  refuses('a confirmed defect with no review', unreviewed, /\/review/);
  const noObservations = rebound({ ...fixture(), state: 'observed', observations: [], review: null, promotion: null, disposition: null });
  refuses('an observed candidate with no observation', noObservations, /\/observations/);
  const oneArm = fixture();
  oneArm.observations = oneArm.observations.filter((observation) => observation.arm === 'baseline');
  refuses('a confirmed defect observed on one arm', rebound(oneArm), /\/observations/);
  const idle = fixture();
  idle.observations[1].trials = { planned: 3, completed: 0, errors: 3, missing: 0 };
  refuses(
    'a confirmed defect resting on no completed trial',
    rebound(idle),
    /needs a candidate observation with at least one completed trial/,
  );

  const harmlessPromotion = rebound({ ...fixture(), disposition: 'undetermined' });
  refuses('a promotion of a candidate review did not confirm', harmlessPromotion, /\/disposition/);
  refuses('a promotion on a candidate that is not promoted', rebound({ ...fixture(), state: 'reviewed' }), /\/promotion must be null/);
  refuses('a promoted candidate with no promotion', rebound({ ...fixture(), promotion: null }), /\/promotion/);
  refuses(
    'a generated candidate holding an observation',
    rebound({ ...fixture(), state: 'generated', review: null, promotion: null, disposition: null }),
    /\/observations/,
  );
  refuses(
    'a generated candidate holding a review',
    rebound({ ...fixture(), state: 'generated', observations: [], promotion: null, disposition: null }),
    /\/review must be null/,
  );
  refuses(
    'an applicable candidate with a confirmed disposition',
    rebound({ ...fixture(), state: 'applicable', observations: [], review: null, promotion: null }),
    /\/review/,
  );
  refuses(
    'an observed candidate holding a review',
    rebound({ ...fixture(), state: 'observed', promotion: null, disposition: 'undetermined' }),
    /\/review must be null/,
  );
  refuses(
    'a reviewed candidate that stopped on a generation error',
    rebound({ ...fixture(), state: 'reviewed', promotion: null, disposition: 'generation-error' }),
    /\/disposition/,
  );

  const uncited = fixture();
  uncited.review.scope.observations = uncited.review.scope.observations.filter((reviewed) => reviewed.observationId === 'OBS-001');
  refuses(
    'a confirmed review that cites no candidate-arm observation',
    uncited,
    /review\.scope\.observations cites no candidate observation with a completed trial/,
  );
  const ownDigest = fixture();
  ownDigest.independentEvidence[0].digest = ownDigest.target.artifactDigest;
  refuses('evidence that is the edited file itself', rebound(ownDigest), /independentEvidence\[0\]\.digest is the target's own digest/);

  const tampered = fixture();
  tampered.edit.replace = 'test.only(';
  refuses('an edit changed without its identity', tampered, /identity is sha256:[0-9a-f]+; the candidate's fields digest to/);
  const staleEdit = fixture();
  staleEdit.edit.replace = 'test.only(';
  staleEdit.identity = discovery.candidateIdentity(staleEdit);
  refuses('a review made against the edit before it changed', staleEdit, /review\.scope\.identity .* is stale/);
  const flipped = fixture();
  flipped.disposition = 'confirmed-undesirable-caught';
  refuses('a disposition flipped after the review', flipped, /review\.scope\.determination .* is stale/);
  const swapped = fixture();
  swapped.independentEvidence[0].reference = 'discovery/red-phase-pilot/evidence/another-specification.md';
  refuses('independent evidence replaced after the review', swapped, /review\.scope\.determination .* is stale/);
  const staleRequirement = fixture();
  staleRequirement.requirement.digest = digest('another requirement');
  staleRequirement.identity = discovery.candidateIdentity(staleRequirement);
  refuses('a review made against another requirement', staleRequirement, /review\.scope\.identity .* is stale/);

  const extended = rebound({
    ...fixture(),
    observations: [
      ...fixture().observations,
      {
        observationId: 'OBS-003',
        arm: 'candidate',
        evidence: digest('rerun'),
        trials: { planned: 3, completed: 3, errors: 0, missing: 0 },
      },
    ],
  });
  accepts('three observations reviewed together', extended);
  const dropped = structuredClone(extended);
  dropped.observations = dropped.observations.filter((observation) => observation.observationId !== 'OBS-002');
  refuses(
    'the observation a review rested on dropped from the record',
    dropped,
    /review\.scope\.observations names OBS-002 .* no longer holds/,
  );
  const hollowed = fixture();
  hollowed.observations[1].trials = { planned: 3, completed: 0, errors: 3, missing: 0 };
  hollowed.observations.push({
    observationId: 'OBS-003',
    arm: 'candidate',
    evidence: digest('later rerun'),
    trials: { planned: 3, completed: 3, errors: 0, missing: 0 },
  });
  refuses('the trial counts behind a review changed after it', hollowed, /review\.scope\.observations names OBS-002 .* no longer holds/);
  const rearmed = fixture();
  rearmed.observations[1].arm = 'baseline';
  rearmed.observations.push({
    observationId: 'OBS-003',
    arm: 'candidate',
    evidence: digest('later rerun'),
    trials: { planned: 3, completed: 3, errors: 0, missing: 0 },
  });
  refuses(
    'the arm of a reviewed observation changed after the review',
    rearmed,
    /review\.scope\.observations names OBS-002 .* no longer holds/,
  );
  const appended = fixture();
  appended.observations.push({
    observationId: 'OBS-003',
    arm: 'candidate',
    evidence: digest('repair rerun'),
    trials: { planned: 3, completed: 3, errors: 0, missing: 0 },
  });
  accepts('an observation appended after promotion, with the original miss still in place', appended);
  const reworded = fixture();
  reworded.review.rationale = 'Reworded after the fact.';
  accepts('a reworded rationale, which the scope does not bind', reworded);

  const waived = rebound({
    ...fixture(),
    acceptedRisk: {
      reviewer: 'maintainer',
      decidedAt: '2026-10-14T10:00:00Z',
      rationale: 'Low blast radius.',
      scope: {},
      revisitWhen: 'the next release',
    },
  });
  accepts('an accepted risk bound to the candidate', waived);
  const kept = discovery.parseCandidate(discovery.serializeCandidate(waived));
  check(
    kept.disposition === 'confirmed-undesirable-missed' && kept.observations.length === 2,
    'an accepted risk read back leaves the disposition and the observations in every count',
  );
  const foreign = structuredClone(waived);
  foreign.acceptedRisk.scope.identity = digest('another candidate');
  refuses('an accepted risk bound to another candidate', foreign, /acceptedRisk\.scope\.identity .* is stale/);
  const open = structuredClone(waived);
  delete open.acceptedRisk.revisitWhen;
  refuses('an accepted risk with no revisit condition', open, /\/acceptedRisk.*must have required property 'revisitWhen'/);
  const undated = structuredClone(waived);
  undated.acceptedRisk.decidedAt = 'yesterday';
  refuses('an accepted risk with no date', undated, /\/acceptedRisk\/decidedAt must match format "date-time"/);
  refuses(
    'an accepted risk on a candidate the evaluator caught',
    rebound({ ...waived, disposition: 'confirmed-undesirable-caught' }),
    /\/acceptedRisk.*|\/disposition/,
  );
  refuses(
    'an accepted risk on a candidate nobody reviewed',
    rebound({ ...waived, state: 'observed', review: null, promotion: null, disposition: 'undetermined' }),
    /\/acceptedRisk must be null/,
  );

  refuses(
    'a requirement outside the folder',
    { ...fixture(), requirement: { ...fixture().requirement, path: '../../secret' } },
    /\/requirement\/path must be equal to constant/,
  );
  const receipt = fixture();
  receipt.promotion.qualificationReceipt.path = 'baseline/qualification/../../../etc/passwd';
  refuses('a receipt that climbs out of the folder', receipt, /\/promotion\/qualificationReceipt/);
  for (const artifact of ['../outside.md', '/etc/passwd', 'skill//step.md']) {
    const target = fixture();
    target.target.artifact = artifact;
    refuses(`a target spelled ${artifact}`, target, /\/target\/artifact must match pattern/);
  }
  const noop = fixture();
  noop.edit.replace = noop.edit.find;
  refuses('an edit that changes nothing', rebound(noop), /changes nothing/);
  const overcount = fixture();
  overcount.observations[0].trials = { planned: 3, completed: 3, errors: 1, missing: 0 };
  refuses('trial counts past the planned count', rebound(overcount), /trials accounts for 4 trials of 3 planned/);
  const repeated = fixture();
  repeated.observations[1].observationId = 'OBS-001';
  refuses('a repeated observation ID', rebound(repeated), /observationId OBS-001 repeats/);

  for (const [label, act] of [
    ['serializing', (record) => discovery.serializeCandidate(record)],
    ['rendering the draft of', (record) => discovery.draftMutation(record)],
  ]) {
    let refused = false;
    try {
      act(flipped);
    } catch (error) {
      refused = error instanceof discovery.CandidateError;
    }
    check(refused, `${label} a record with a stale review is refused`);
  }

  refusesText(
    'a repeated top-level key',
    fixtureText.replace('  "state": "promoted",', '  "state": "generated",\n  "state": "promoted",'),
    /key "state" appears twice/,
  );
  refusesText(
    'a repeated nested key',
    fixtureText.replace('"occurrences": 1', '"occurrences": 2,\n    "occurrences": 1'),
    /key "occurrences" appears twice/,
  );
  const lone = fixture();
  lone.hypothesis = 'a\uD800b';
  refuses('a lone surrogate', lone, /holds a lone surrogate/);
  refusesText('text that is not JSON', 'not json', /is not JSON/);
  refusesText('a JSON array', '[]', /\(root\) must be object/);
  refusesText('JSON null', 'null', /\(root\) must be object/);
}

/** A scratch copy of the fixture folder. */
function folderCopy(label) {
  const folder = path.join(scratch.make(label), 'folder');
  fs.cpSync(FIXTURE_FOLDER, folder, { recursive: true });
  return folder;
}

/** Asserts `readCandidate` refuses `relative` in `folder` with a problem matching `expected`. */
function refusesFile(label, folder, relative, expected) {
  let problems = [];
  try {
    discovery.readCandidate(folder, relative);
  } catch (error) {
    if (!(error instanceof discovery.CandidateError)) throw error;
    problems = error.problems;
  }
  check(problems.length > 0, `${label}: the reader accepted it`);
  check(
    problems.some((problem) => expected.test(problem)),
    `${label}: expected a problem matching ${expected}; got ${JSON.stringify(problems)}`,
  );
}

/** A candidate is read only from its own path, through no link, against the requirements file and receipt it names. */
function checkFileReading() {
  const file = (folder) => path.join(folder, ...FIXTURE_PATH.split('/'));
  refusesFile(
    'a path outside the lane',
    FIXTURE_FOLDER,
    'discovery/C-001.candidate.json',
    /is not discovery\/<campaignId>\/C-NNN\.candidate\.json/,
  );
  refusesFile('a path that climbs', FIXTURE_FOLDER, 'discovery/../discovery/red-phase-pilot/C-001.candidate.json', /is not discovery/);

  const moved = folderCopy('moved');
  fs.mkdirSync(path.join(moved, 'discovery', 'other-campaign'));
  fs.copyFileSync(file(moved), path.join(moved, 'discovery', 'other-campaign', 'C-001.candidate.json'));
  refusesFile(
    'a record in another campaign directory',
    moved,
    'discovery/other-campaign/C-001.candidate.json',
    /campaignId red-phase-pilot differs from the directory other-campaign/,
  );
  fs.copyFileSync(file(moved), path.join(moved, 'discovery', 'red-phase-pilot', 'C-777.candidate.json'));
  refusesFile(
    'a record under another file name',
    moved,
    'discovery/red-phase-pilot/C-777.candidate.json',
    /candidateId C-001 differs from the file name C-777/,
  );

  const linked = folderCopy('linked');
  fs.renameSync(path.join(linked, 'discovery', 'red-phase-pilot'), path.join(linked, 'elsewhere'));
  fs.symlinkSync(path.join(linked, 'elsewhere'), path.join(linked, 'discovery', 'red-phase-pilot'));
  refusesFile('a campaign directory that is a link', linked, FIXTURE_PATH, /reached through a link/);
  const leaf = folderCopy('leaf');
  fs.renameSync(file(leaf), path.join(leaf, 'C-001.json'));
  fs.symlinkSync(path.join(leaf, 'C-001.json'), file(leaf));
  refusesFile('a candidate file that is a link', leaf, FIXTURE_PATH, /reached through a link/);

  refusesFile('a missing file', FIXTURE_FOLDER, 'discovery/red-phase-pilot/C-002.candidate.json', /does not exist/);
  const directory = folderCopy('directory');
  fs.rmSync(file(directory));
  fs.mkdirSync(file(directory));
  refusesFile('a directory where the file belongs', directory, FIXTURE_PATH, /is not a regular file/);
  if (process.platform !== 'win32') {
    for (const [label, relative] of [
      ['a candidate file', FIXTURE_PATH],
      ['the requirements file', 'requirements.md'],
      ['a qualification receipt', RECEIPT],
      ['an independent evidence snapshot', EVIDENCE],
    ]) {
      const fifo = folderCopy('fifo');
      fs.rmSync(path.join(fifo, ...relative.split('/')));
      const made = spawnSync('mkfifo', [path.join(fifo, ...relative.split('/'))]);
      check(made.status === 0, `mkfifo made the pipe for ${label}`);
      const reader = spawnSync(
        process.execPath,
        [
          '-e',
          `try { require(${JSON.stringify(path.join(DISCOVERY_ROOT, 'candidate.js'))}).readCandidate(${JSON.stringify(fifo)}, ${JSON.stringify(FIXTURE_PATH)}); } catch (error) { console.log(error.problems.join('; ')); }`,
        ],
        { encoding: 'utf8', timeout: 20_000 },
      );
      check(
        reader.error === undefined && /is not a regular file/.test(reader.stdout),
        `reading with a named pipe as ${label} did not refuse it: ${reader.error?.message ?? reader.stdout}`,
      );
    }
  }
  const binary = folderCopy('binary');
  fs.writeFileSync(file(binary), Buffer.from([0x7b, 0xff, 0xfe, 0x7d]));
  refusesFile('bytes that are not UTF-8', binary, FIXTURE_PATH, /is not UTF-8 text/);

  const edited = folderCopy('requirement');
  fs.appendFileSync(path.join(edited, 'requirements.md'), 'One more requirement.\n');
  refusesFile(
    'a requirements file edited after the review',
    edited,
    FIXTURE_PATH,
    /requirements\.md digests to sha256:[0-9a-f]+; the record names/,
  );
  const noRequirements = folderCopy('no-requirement');
  fs.rmSync(path.join(noRequirements, 'requirements.md'));
  refusesFile('a folder with no requirements file', noRequirements, FIXTURE_PATH, /requirement requirements\.md does not exist/);
  const receipt = folderCopy('receipt');
  fs.appendFileSync(path.join(receipt, ...RECEIPT.split('/')), ' ');
  refusesFile('a qualification receipt edited after promotion', receipt, FIXTURE_PATH, /P-003\/mutated-fail\.json digests to/);
  const crossed = folderCopy('crossed');
  fs.writeFileSync(
    path.join(crossed, 'probes', 'P-003.probe.json'),
    '{"probeId":"P-003","qualification":{"route":"controlled-mutation","mutation":"M-001"}}\n',
  );
  refusesFile(
    'a receipt of a probe that qualifies another mutation',
    crossed,
    FIXTURE_PATH,
    /qualifies P-003, whose mutation is M-001; the draft is M-002/,
  );
  fs.rmSync(path.join(crossed, 'probes', 'P-003.probe.json'));
  refusesFile(
    'a receipt of a probe the folder does not hold',
    crossed,
    FIXTURE_PATH,
    /qualified probe probes\/P-003\.probe\.json does not exist/,
  );
  fs.rmSync(path.join(receipt, ...RECEIPT.split('/')));
  refusesFile(
    'a qualification receipt that is gone',
    receipt,
    FIXTURE_PATH,
    /qualification receipt baseline\/qualification\/P-003\/mutated-fail\.json does not exist/,
  );
  checkQualificationChain();
  checkEvidenceProvenance();
}

/** The folder copy `label` with its candidate rewritten by `edit` (and every decision re-bound to it) and `change` applied to the folder. */
function resealedFolder(label, edit = () => {}, change = () => {}) {
  const folder = folderCopy(label);
  change(folder);
  const record = JSON.parse(fs.readFileSync(path.join(folder, ...FIXTURE_PATH.split('/')), 'utf8'));
  edit(record);
  fs.writeFileSync(path.join(folder, ...FIXTURE_PATH.split('/')), discovery.serializeCandidate(rebound(record)));
  return folder;
}

/** Rewrites the JSON at `relative` under `folder` with `edit` and points the candidate's receipt at the new bytes when it is the receipt. */
function editHeld(relative, edit) {
  return (folder) => {
    rewriteJson(folder, relative, edit);
    if (relative !== RECEIPT) return;
    const candidate = path.join(folder, ...FIXTURE_PATH.split('/'));
    const record = JSON.parse(fs.readFileSync(candidate, 'utf8'));
    record.promotion.qualificationReceipt.digest = discovery.bytesDigest(fs.readFileSync(path.join(folder, ...RECEIPT.split('/'))));
    fs.writeFileSync(candidate, discovery.serializeCandidate(record));
  };
}

/** A linked qualification receipt is the native qualification of the draft: arbitrary bytes, a failed or partial qualification and a mutation of another edit are refused. */
function checkQualificationChain() {
  const BASELINE = 'baseline/qualification/P-003/baseline-pass.json';
  const ROLLBACK = 'baseline/qualification/P-003/rollback.json';
  const MUTATION = 'mutations/M-002.mutation.json';
  const ACCEPTED = 'baseline/probes/P-003.probe.json';
  const accepted = discovery.readCandidate(FIXTURE_FOLDER, FIXTURE_PATH);
  check(
    accepted.promotion.qualificationReceipt.path === RECEIPT,
    'the fixture links the native mutated-fail evidence of its qualification',
  );

  // Arbitrary bytes under a correct digest: the reproduction of the provenance defect.
  const arbitrary = resealedFolder(
    'arbitrary-receipt',
    (record) => {
      record.promotion.qualificationReceipt.digest = discovery.bytesDigest(Buffer.from('not a qualification receipt'));
    },
    (folder) => fs.writeFileSync(path.join(folder, ...RECEIPT.split('/')), 'not a qualification receipt'),
  );
  refusesFile('arbitrary bytes with a correct digest as the receipt', arbitrary, FIXTURE_PATH, /qualification receipt .* is not JSON text/);
  const array = resealedFolder(
    'array-receipt',
    (record) => {
      record.promotion.qualificationReceipt.digest = discovery.bytesDigest(Buffer.from('[]\n'));
    },
    (folder) => fs.writeFileSync(path.join(folder, ...RECEIPT.split('/')), '[]\n'),
  );
  refusesFile('a receipt that is not an object', array, FIXTURE_PATH, /qualification receipt .* is not a JSON object/);

  const scenarios = [
    ['a mutated arm that held', RECEIPT, (value) => (value.verdict = 'held'), /states verdict "held"; the promotion needs "violated"/],
    [
      'a mutated arm that was inconclusive',
      RECEIPT,
      (value) => (value.verdict = 'inconclusive'),
      /states verdict "inconclusive"; the promotion needs "violated"/,
    ],
    ['a receipt of another phase', RECEIPT, (value) => (value.phase = 'baseline-pass'), /states phase "baseline-pass"/],
    ['a receipt of another probe', RECEIPT, (value) => (value.probeId = 'P-004'), /states probeId "P-004"/],
    ['a receipt of another mutation', RECEIPT, (value) => (value.mutationId = 'M-009'), /states mutationId "M-009"/],
    [
      'a receipt of another target',
      RECEIPT,
      (value) => (value.targetArtifact = 'skill/other.md'),
      /states targetArtifact "skill\/other\.md"/,
    ],
    [
      'a receipt whose mutated bytes are the target',
      RECEIPT,
      (value) => (value.targetArtifactDigest = accepted.target.artifactDigest),
      /the mutated bytes digest to another value than the target's/,
    ],
    [
      'a receipt with no mutated digest',
      RECEIPT,
      (value) => delete value.targetArtifactDigest,
      /the mutated bytes digest to another value/,
    ],
    [
      'a baseline that did not hold',
      BASELINE,
      (value) => (value.verdict = 'violated'),
      /states verdict "violated"; the promotion needs "held"/,
    ],
    [
      'a baseline of another target version',
      BASELINE,
      (value) => (value.targetArtifactDigest = discovery.bytesDigest(Buffer.from('another version'))),
      /baseline-pass\.json states targetArtifactDigest/,
    ],
    [
      'a rollback that was not verified',
      ROLLBACK,
      (value) => (value.rollbackVerified = false),
      /does not state that the rollback was verified/,
    ],
    [
      'a rollback that restored other bytes',
      ROLLBACK,
      (value) => (value.restoredDigest = discovery.bytesDigest(Buffer.from('other bytes'))),
      /rollback\.json states restoredDigest/,
    ],
    [
      'a rollback of another mutated file',
      ROLLBACK,
      (value) => (value.mutatedDigest = discovery.bytesDigest(Buffer.from('other bytes'))),
      /rollback\.json states mutatedDigest/,
    ],
    [
      'a qualification of a probe that takes another route',
      'probes/P-003.probe.json',
      (value) => (value.qualification.route = 'historical'),
      /takes the historical route/,
    ],
    ['a probe of another ID', 'probes/P-003.probe.json', (value) => (value.probeId = 'P-004'), /is the probe P-004/],
    [
      'a mutation of another ID',
      MUTATION,
      (value) => (value.mutationId = 'M-009'),
      /mutations\/M-002\.mutation\.json states mutationId "M-009"/,
    ],
    [
      'a mutation of another target',
      MUTATION,
      (value) => (value.targetArtifact = 'skill/other.md'),
      /states targetArtifact "skill\/other\.md"/,
    ],
    [
      'a mutation with the same ID and another edit',
      MUTATION,
      (value) => (value.operator.replace = 'test.only('),
      /operator\.replace "test\.only\("; the candidate's edit is "test\.fixme\("/,
    ],
    ['a mutation that finds other text', MUTATION, (value) => (value.operator.find = 'test.slow('), /operator\.find "test\.slow\("/],
    ['a mutation that expects other occurrences', MUTATION, (value) => (value.operator.occurrences = 2), /operator\.occurrences 2/],
    ['a mutation of another operator', MUTATION, (value) => (value.operator.kind = 'delete'), /operator\.kind "delete"/],
    [
      'a mutation that is not a native mutation file',
      MUTATION,
      (value) => delete value.mutationSource,
      /mutations\/M-002\.mutation\.json .*mutationSource/,
    ],
  ];
  const more = [
    [
      'an accepted probe that is not a qualified probe',
      ACCEPTED,
      (value) => delete value.systemId,
      /is not a qualified probe; it lacks systemId/,
    ],
    [
      'an accepted probe with no qualification fields',
      ACCEPTED,
      (value) => delete value.qualification.rollbackVerified,
      /lacks rollbackVerified/,
    ],
    [
      'an accepted probe of a string schema version',
      ACCEPTED,
      (value) => (value.schemaVersion = '1.0.0'),
      /which is not a probe schema version/,
    ],
    ['an accepted probe that expects a clean run', ACCEPTED, (value) => (value.expectedClean = true), /states expectedClean true/],
    ['an accepted probe of another probe', ACCEPTED, (value) => (value.probeId = 'P-004'), /states probeId "P-004"/],
    [
      'an accepted probe of another artifact digest',
      ACCEPTED,
      (value) => (value.artifactDigest = discovery.bytesDigest(Buffer.from('other'))),
      /states artifactDigest/,
    ],
    ['an accepted probe with a malformed commit digest', ACCEPTED, (value) => (value.commitDigest = 'abc'), /states commitDigest "abc"/],
    [
      'a rollback whose restored arm violated an oracle',
      ROLLBACK,
      (value) => (value.rePasses[0].oracles[0].disposition = 'violated'),
      /rollback\.json holds oracle results that do not back the verdict held/,
    ],
    [
      'an accepted probe that qualified another operator',
      ACCEPTED,
      (value) => (value.qualification.mutationOperator = 'replace-exact: "a" -> "b" (occurrences 1)'),
      /qualified "replace-exact: \\"a\\"/,
    ],
    [
      'an accepted probe of another target',
      ACCEPTED,
      (value) => (value.qualification.targetArtifact.digest = discovery.bytesDigest(Buffer.from('other'))),
      /qualified a target digesting to/,
    ],
    [
      'an accepted probe whose rollback was not verified',
      ACCEPTED,
      (value) => (value.qualification.rollbackVerified = false),
      /does not state that the rollback was verified/,
    ],
    ['an accepted probe of another route', ACCEPTED, (value) => (value.qualification.route = 'historical'), /takes the historical route/],
    [
      'an accepted probe that records other mutated-fail bytes',
      ACCEPTED,
      (value) => (value.qualification.mutatedFailEvidence.digest = discovery.bytesDigest(Buffer.from('other'))),
      /for its mutated-fail evidence/,
    ],
    [
      'an accepted probe that records other baseline-pass bytes',
      ACCEPTED,
      (value) => (value.qualification.baselinePassEvidence.digest = discovery.bytesDigest(Buffer.from('other'))),
      /for its baseline-pass evidence/,
    ],
    ['a baseline of another probe', BASELINE, (value) => (value.probeId = 'P-004'), /states probeId "P-004"/],
    ['a baseline of another mutation', BASELINE, (value) => (value.mutationId = 'M-009'), /states mutationId "M-009"/],
    ['a baseline of another target', BASELINE, (value) => (value.targetArtifact = 'skill/other.md'), /states targetArtifact/],
    ['a baseline of another phase', BASELINE, (value) => (value.phase = 'mutated-fail'), /states phase "mutated-fail"/],
    [
      'a baseline with no oracle results',
      BASELINE,
      (value) => (value.oracles = []),
      /holds oracle results that do not back the verdict held/,
    ],
    [
      'a baseline whose oracle did not hold',
      BASELINE,
      (value) => (value.oracles[0].disposition = 'violated'),
      /holds oracle results that do not back the verdict held/,
    ],
    [
      'a receipt with no oracle results',
      RECEIPT,
      (value) => (value.oracles = []),
      /holds oracle results that do not back the verdict violated/,
    ],
    [
      'a receipt whose oracles all held',
      RECEIPT,
      (value) => (value.oracles[0].disposition = 'held'),
      /holds oracle results that do not back the verdict violated/,
    ],
    ['a rollback of another probe', ROLLBACK, (value) => (value.probeId = 'P-004'), /states probeId "P-004"/],
    ['a rollback of another mutation', ROLLBACK, (value) => (value.mutationId = 'M-009'), /states mutationId "M-009"/],
    ['a rollback of another target', ROLLBACK, (value) => (value.targetArtifact = 'skill/other.md'), /states targetArtifact/],
    [
      'a rollback that started from other bytes',
      ROLLBACK,
      (value) => (value.preDigest = discovery.bytesDigest(Buffer.from('other bytes'))),
      /states preDigest/,
    ],
    ['a rollback with no re-pass', ROLLBACK, (value) => (value.rePasses = []), /ends with no restored arm that held/],
    [
      'a rollback whose last re-pass did not hold',
      ROLLBACK,
      (value) => (value.rePasses[0].verdict = 'violated'),
      /ends with no restored arm that held/,
    ],
  ];
  for (const [label, relative, edit, expected] of [...scenarios, ...more]) {
    const folder = resealedFolder('chain', () => {}, editHeld(relative, edit));
    let problems = [];
    try {
      discovery.readCandidate(folder, FIXTURE_PATH);
    } catch (error) {
      if (!(error instanceof discovery.CandidateError)) throw error;
      problems = error.problems;
    }
    check(
      problems.some((problem) => expected.test(problem) && problem.includes(relative.replace(/^.*\//, ''))),
      `${label}: expected a problem matching ${expected} that names ${relative}; got ${JSON.stringify(problems)}`,
    );
  }

  for (const [label, relative, expected] of [
    ['a mutation the folder does not hold', MUTATION, /draft mutation mutations\/M-002\.mutation\.json does not exist/],
    [
      'a qualification with no baseline evidence',
      BASELINE,
      /qualification evidence baseline\/qualification\/P-003\/baseline-pass\.json does not exist/,
    ],
    [
      'a qualification with no rollback evidence',
      ROLLBACK,
      /qualification evidence baseline\/qualification\/P-003\/rollback\.json does not exist/,
    ],
  ]) {
    const folder = folderCopy('partial');
    fs.rmSync(path.join(folder, ...relative.split('/')));
    refusesFile(label, folder, FIXTURE_PATH, expected);
  }

  for (const receiptPath of [
    'baseline/qualification/P-003.mutated-fail.json',
    'baseline/qualification/P-003/rollback.json',
    'baseline/qualification/P-003/mutated-fail.txt',
  ]) {
    const unknown = fixture();
    unknown.promotion.qualificationReceipt.path = receiptPath;
    refuses(`a receipt spelled ${receiptPath}`, unknown, /\/promotion\/qualificationReceipt\/path must match pattern/);
  }

  const duplicated = resealedFolder(
    'duplicate-key-receipt',
    () => {},
    (folder) => {
      const file = path.join(folder, ...RECEIPT.split('/'));
      fs.writeFileSync(
        file,
        fs.readFileSync(file, 'utf8').replace('"verdict": "violated",', '"verdict": "held",\n  "verdict": "violated",'),
      );
      const candidate = path.join(folder, ...FIXTURE_PATH.split('/'));
      const record = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      record.promotion.qualificationReceipt.digest = discovery.bytesDigest(fs.readFileSync(file));
      fs.writeFileSync(candidate, discovery.serializeCandidate(record));
    },
  );
  refusesFile('a receipt that states a key twice', duplicated, FIXTURE_PATH, /mutated-fail\.json states a key twice in one object/);
  const stopped = folderCopy('stopped');
  fs.writeFileSync(path.join(stopped, 'baseline', 'qualification', 'P-003', 'fault.json'), '{"probeId":"P-003"}\n');
  refusesFile('a qualification that stopped partway', stopped, FIXTURE_PATH, /fault\.json records a qualification that stopped/);

  checkRealQualificationEvidence();
  const authored = JSON.parse(fs.readFileSync(path.join(FIXTURE_FOLDER, ...MUTATION.split('/')), 'utf8'));
  check(
    JSON.stringify(authored) === JSON.stringify(discovery.draftMutation(accepted)),
    'the fixture mutation file is the draft the candidate renders',
  );
}

/**
 * The reader accepts the evidence `tea-evaluate preflight` really wrote: the committed qualification of the bmad-tea-evaluate
 * evaluation, linked from a candidate that states that qualification's mutation, and the fixture's evidence keeps its shape.
 */
function checkRealQualificationEvidence() {
  const real = path.join(PROJECT_ROOT, 'test', 'evaluations', 'bmad-tea-evaluate');
  const readReal = (relative) => JSON.parse(fs.readFileSync(path.join(real, ...relative.split('/')), 'utf8'));
  const mutation = readReal('mutations/M-005.mutation.json');
  const folder = folderCopy('real-qualification');
  fs.rmSync(path.join(folder, 'baseline', 'qualification', 'P-003'), { recursive: true });
  fs.rmSync(path.join(folder, 'probes', 'P-003.probe.json'));
  fs.rmSync(path.join(folder, 'baseline', 'probes', 'P-003.probe.json'));
  fs.rmSync(path.join(folder, 'mutations', 'M-002.mutation.json'));
  fs.cpSync(path.join(real, 'baseline', 'qualification', 'P-009'), path.join(folder, 'baseline', 'qualification', 'P-009'), {
    recursive: true,
  });
  fs.copyFileSync(path.join(real, 'probes', 'P-009.probe.json'), path.join(folder, 'probes', 'P-009.probe.json'));
  fs.mkdirSync(path.join(folder, 'baseline', 'probes'), { recursive: true });
  fs.copyFileSync(path.join(real, 'baseline', 'probes', 'P-009.probe.json'), path.join(folder, 'baseline', 'probes', 'P-009.probe.json'));
  fs.copyFileSync(path.join(real, 'mutations', 'M-005.mutation.json'), path.join(folder, 'mutations', 'M-005.mutation.json'));
  const receipt = 'baseline/qualification/P-009/mutated-fail.json';
  const candidate = path.join(folder, ...FIXTURE_PATH.split('/'));
  const record = JSON.parse(fs.readFileSync(candidate, 'utf8'));
  record.target = {
    artifact: mutation.targetArtifact,
    artifactDigest: readReal('baseline/qualification/P-009/baseline-pass.json').targetArtifactDigest,
  };
  record.edit = { find: mutation.operator.find, replace: mutation.operator.replace, occurrences: mutation.operator.occurrences };
  record.promotion = {
    draftMutationId: 'M-005',
    qualificationReceipt: { path: receipt, digest: discovery.bytesDigest(fs.readFileSync(path.join(folder, ...receipt.split('/')))) },
  };
  fs.writeFileSync(candidate, discovery.serializeCandidate(rebound(record)));
  let problems = [];
  try {
    discovery.readCandidate(folder, FIXTURE_PATH);
  } catch (error) {
    if (!(error instanceof discovery.CandidateError)) throw error;
    problems = error.problems;
  }
  check(problems.length === 0, `the reader refused the committed native qualification of P-009: ${JSON.stringify(problems)}`);

  const keys = (value) => Object.keys(value).sort().join(',');
  // The reader's fields of a qualified probe are the ones the native writer emits, and the fixture and the real baseline hold them.
  const { qualifiedProbe } = require('../cli/lib/evaluate/mutation');
  const written = qualifiedProbe({
    probe: { probeId: 'P-001', probeClass: 'defect', behaviorId: 'B-001', rationale: 'r', defects: [] },
    mutation: {
      mutationSource: 's',
      operator: { find: 'a', replace: 'b', occurrences: 1 },
      targetArtifact: 't',
      expectedObservableFailure: 'e',
    },
    systemId: 'x',
    digests: { implementationDigest: 'i', artifactDigest: 'a', commitDigest: 'c' },
    baselinePassEvidence: {},
    mutatedFailEvidence: {},
    rollbackVerified: false,
  });
  check(
    keys(Object.fromEntries(discovery.QUALIFIED_PROBE_FIELDS.map((field) => [field, 0]))) === keys(written),
    `the reader's qualified probe fields are ${discovery.QUALIFIED_PROBE_FIELDS}; the native writer emits ${Object.keys(written)}`,
  );
  check(
    keys(Object.fromEntries(discovery.QUALIFICATION_FIELDS.map((field) => [field, 0]))) === keys(written.qualification),
    "the reader's qualification fields are the ones the native writer emits",
  );
  const realProbe = readReal('baseline/probes/P-009.probe.json');
  const ourProbe = JSON.parse(fs.readFileSync(path.join(FIXTURE_FOLDER, 'baseline', 'probes', 'P-003.probe.json'), 'utf8'));
  check(
    keys(realProbe) === keys(written) && keys(ourProbe) === keys(written),
    'the fixture and the real accepted probe keep the fields a qualified probe has',
  );
  check(
    typeof realProbe.schemaVersion === typeof ourProbe.schemaVersion,
    "the fixture probe's schema version has the type a native probe's has",
  );
  for (const name of ['baseline-pass', 'mutated-fail', 'rollback']) {
    const file = `baseline/qualification/P-009/${name}.json`;
    const ours = JSON.parse(fs.readFileSync(path.join(FIXTURE_FOLDER, 'baseline', 'qualification', 'P-003', `${name}.json`), 'utf8'));
    check(
      keys(ours) === keys(readReal(file)),
      `the fixture's ${name}.json keeps the fields a qualification writes: ${keys(ours)} against ${keys(readReal(file))}`,
    );
  }
  const oursRollback = JSON.parse(
    fs.readFileSync(path.join(FIXTURE_FOLDER, 'baseline', 'qualification', 'P-003', 'rollback.json'), 'utf8'),
  );
  check(
    keys(oursRollback.rePasses[0]) === keys(readReal('baseline/qualification/P-009/rollback.json').rePasses[0]),
    "the fixture's re-pass keeps the fields a qualification writes",
  );
}

/** Independent evidence is a snapshot of the folder that digests to the record's value, so a later reader replays what the reviewer saw. */
function checkEvidenceProvenance() {
  const evidence = path.join(...EVIDENCE.split('/'));
  const wrongDigest = resealedFolder('wrong-digest-evidence', (record) => {
    record.independentEvidence[0].digest = `sha256:${'0'.repeat(64)}`;
  });
  refusesFile(
    'evidence whose snapshot digests to another value',
    wrongDigest,
    FIXTURE_PATH,
    /playwright-test-annotations\.md digests to sha256:[0-9a-f]+; the record names sha256:0{64}/,
  );
  const absent = resealedFolder(
    'absent-evidence',
    () => {},
    (folder) => fs.rmSync(path.join(folder, evidence)),
  );
  refusesFile(
    'evidence whose snapshot is gone',
    absent,
    FIXTURE_PATH,
    /independent evidence discovery\/red-phase-pilot\/evidence\/playwright-test-annotations\.md does not exist/,
  );
  const edited = folderCopy('edited-evidence');
  fs.appendFileSync(path.join(edited, evidence), 'An edited line.\n');
  refusesFile('evidence edited after the review', edited, FIXTURE_PATH, /playwright-test-annotations\.md digests to/);
  const empty = resealedFolder(
    'empty-evidence',
    (record) => {
      record.independentEvidence[0].digest = discovery.bytesDigest(Buffer.alloc(0));
    },
    (folder) => fs.writeFileSync(path.join(folder, evidence), ''),
  );
  refusesFile('evidence that is an empty snapshot', empty, FIXTURE_PATH, /is empty, so it holds nothing a reviewer saw/);
  const link = resealedFolder(
    'linked-evidence',
    () => {},
    (folder) => {
      fs.renameSync(path.join(folder, evidence), path.join(folder, 'snapshot.md'));
      fs.symlinkSync(path.join(folder, 'snapshot.md'), path.join(folder, evidence));
    },
  );
  refusesFile('evidence that is a link', link, FIXTURE_PATH, /reached through a link/);

  const otherCampaign = resealedFolder('other-campaign-evidence', (record) => {
    record.independentEvidence[0].reference = EVIDENCE.replace('red-phase-pilot', 'other-campaign');
  });
  refusesFile(
    'evidence kept in another campaign',
    otherCampaign,
    FIXTURE_PATH,
    /is not a snapshot under discovery\/red-phase-pilot\/evidence\//,
  );
  for (const reference of [
    'https://invalid.example/no-evidence',
    'the Playwright test annotations reference',
    'requirements.md',
    'discovery/red-phase-pilot/evidence/../C-001.candidate.json',
    'discovery/red-phase-pilot/evidence/note.candidate.json',
    'discovery/red-phase-pilot/evidence/',
  ]) {
    const record = fixture();
    record.independentEvidence[0].reference = reference;
    refuses(`evidence spelled ${reference}`, record, /\/independentEvidence\/0\/reference must match pattern/);
  }

  // The reproduction: a prose reference with an invented digest.
  const invented = fixture();
  invented.independentEvidence[0] = {
    kind: 'reference-computation',
    reference: 'https://invalid.example/no-evidence',
    digest: `sha256:${'0'.repeat(64)}`,
  };
  refuses('an invented citation with an invented digest', rebound(invented), /\/independentEvidence\/0\/reference/);
}

/** A scratch copy of the valid evaluation fixture. */
function evaluationCopy(label) {
  const folder = path.join(scratch.make(label), 'valid');
  fs.cpSync(VALID, folder, { recursive: true });
  return folder;
}

/** Writes `text` (the fixture candidate by default) at `relative` under `folder`. */
function plant(folder, relative, text = fixtureText) {
  const file = path.join(folder, ...relative.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

/** Applies `edit` to the JSON file at `relative` under `folder` and writes it back. */
function rewriteJson(folder, relative, edit) {
  const file = path.join(folder, ...relative.split('/'));
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  edit(value);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** Runs `tea-evaluate` with `args` and returns its exit status and output. */
function runCli(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd: PROJECT_ROOT, encoding: 'utf8' });
  if (result.error) throw result.error;
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

/** The fixture's own bytes planted where a scored artifact reads are refused by the real loader and binary; under `discovery/` they change nothing. */
async function checkBoundaryThroughTheRealLoader() {
  const clean = evaluationCopy('clean');
  const cleanFindings = await checkEvaluation(clean);
  check(cleanFindings.length === 0, `the valid fixture checks clean before anything is planted: ${JSON.stringify(cleanFindings)}`);
  check(!INDEXED_ROOTS.includes(discovery.DISCOVERY_DIRECTORY), 'the corpus index does not cover the discovery directory');

  const lane = evaluationCopy('lane');
  plant(lane, FIXTURE_PATH);
  plant(lane, 'discovery/red-phase-pilot/notes.candidate.json');
  check(
    JSON.stringify(await checkEvaluation(lane)) === JSON.stringify(cleanFindings),
    'candidates under discovery/ leave the findings of check unchanged',
  );
  check(
    JSON.stringify(await buildCorpusIndex(lane)) === JSON.stringify(await buildCorpusIndex(clean)),
    'candidates under discovery/ leave the corpus digest index unchanged',
  );
  const laneCli = runCli(['check', '--evaluation', lane]);
  check(laneCli.status === 0, `tea-evaluate check exits 0 beside candidates under discovery/; got ${laneCli.status}: ${laneCli.output}`);
  const cleanDigest = runCli(['digest', '--evaluation', clean]);
  const laneDigest = runCli(['digest', '--evaluation', lane]);
  check(cleanDigest.status === 0 && laneDigest.status === 0, 'tea-evaluate digest runs on both folders');
  check(
    fs.readFileSync(path.join(clean, 'corpus-index.json'), 'utf8') === fs.readFileSync(path.join(lane, 'corpus-index.json'), 'utf8'),
    'tea-evaluate digest writes the same corpus-index.json with and without candidates',
  );

  const placements = [
    'C-001.candidate.json',
    'corpus/C-001.candidate.json',
    'corpus/held-out/C-001.candidate.json',
    'corpus/reservations/docs/deep/C-001.candidate.json',
    'evaluator/C-001.candidate.json',
    'baseline/probes/C-001.candidate.json',
    'baseline/qualification/C-001.candidate.json',
    'policy/C-001.candidate.json',
    'ci/C-001.candidate.json',
    'probes/C-001.candidate.json',
    'mutations/C-001.candidate.json',
    'policy/notes.candidate.json',
  ];
  for (const relative of placements) {
    const folder = evaluationCopy('placement');
    plant(folder, relative);
    const findings = await checkEvaluation(folder);
    check(
      findings.some((finding) => finding.file === relative && finding.rule === 'candidate-placement'),
      `a candidate planted at ${relative} drew no candidate-placement finding; findings ${JSON.stringify(findings.map(({ file, rule }) => `${file}:${rule}`))}`,
    );
  }

  for (const skipped of ['runs/C-001.candidate.json', 'node_modules/C-001.candidate.json']) {
    const folder = evaluationCopy('skipped');
    plant(folder, skipped);
    const findings = await checkEvaluation(folder);
    check(
      findings.every((finding) => finding.rule !== 'candidate-placement'),
      `a candidate at ${skipped}, which the scan leaves out, drew a finding`,
    );
  }
  for (const nested of [
    'corpus/runs/C-001.candidate.json',
    'policy/node_modules/C-001.candidate.json',
    'policy/discovery/C-001.candidate.json',
  ]) {
    const folder = evaluationCopy('nested');
    plant(folder, nested);
    const findings = await checkEvaluation(folder);
    check(
      findings.some((finding) => finding.file === nested && finding.rule === 'candidate-placement'),
      `a candidate at ${nested}: the top-level skips apply at depth, so it drew no finding`,
    );
  }

  const unplanned = evaluationCopy('unplanned');
  plant(unplanned, 'corpus/held-out/C-001.candidate.json');
  const unplannedFindings = await checkEvaluation(unplanned, { partition: 'development' });
  check(
    unplannedFindings.some((finding) => finding.file === 'corpus/held-out/C-001.candidate.json' && finding.rule === 'candidate-placement'),
    'an evaluation with no held-out plan has no sealed folder, and the corpus index digests this one, so a development check refuses the candidate',
  );

  const planned = path.join(scratch.make('planned'), 'verdict');
  fs.cpSync(PLANNED, planned, { recursive: true });
  for (const spelling of ['held-out', 'Held-Out']) {
    if (spelling !== 'held-out') fs.renameSync(path.join(planned, 'corpus', 'held-out'), path.join(planned, 'corpus', spelling));
    plant(planned, `corpus/${spelling}/C-001.candidate.json`);
    const listed = [];
    const original = fs.readdirSync;
    fs.readdirSync = function readdirSpy(target, ...rest) {
      listed.push(String(target));
      return original.call(this, target, ...rest);
    };
    let development;
    let both;
    try {
      development = await checkEvaluation(planned, { partition: 'development' });
      const developmentListed = listed.splice(0);
      check(
        developmentListed.every((target) => !target.toLowerCase().includes('held-out')),
        `a development check listed a sealed ${spelling} folder: ${developmentListed.filter((target) => target.toLowerCase().includes('held-out'))}`,
      );
      both = await checkEvaluation(planned, { partition: 'both' });
      check(
        listed.some((target) => target.toLowerCase().includes('held-out')),
        `a check that opens the held-out partition never listed ${spelling}, so the spy proves nothing`,
      );
    } finally {
      fs.readdirSync = original;
    }
    check(
      development.every((finding) => finding.rule !== 'candidate-placement'),
      `a development check flagged a candidate in the sealed ${spelling} folder`,
    );
    check(
      both.some((finding) => finding.file === `corpus/${spelling}/C-001.candidate.json` && finding.rule === 'candidate-placement'),
      `a check that opens the held-out partition refuses a candidate planted in ${spelling}`,
    );
  }

  const smuggles = [
    {
      label: 'a candidate named as a mutation',
      plant: (folder) => plant(folder, 'mutations/M-002.mutation.json'),
      file: 'mutations/M-002.mutation.json',
      rule: 'schema',
    },
    {
      label: 'a candidate named as a probe',
      plant: (folder) => plant(folder, 'probes/P-003.probe.json'),
      file: 'probes/P-003.probe.json',
      rule: 'schema',
    },
    {
      label: 'a candidate record inside evaluation.json',
      plant: (folder) => rewriteJson(folder, 'evaluation.json', (evaluation) => (evaluation.candidates = [fixture()])),
      file: 'evaluation.json',
      rule: 'schema',
      message: /candidates/,
    },
    {
      label: 'a discovery section inside evaluation.json',
      plant: (folder) =>
        rewriteJson(folder, 'evaluation.json', (evaluation) => (evaluation.discovery = { campaigns: ['red-phase-pilot'] })),
      file: 'evaluation.json',
      rule: 'schema',
      message: /discovery/,
    },
    {
      label: 'a probe qualified by a candidate that sits in discovery/',
      plant: (folder) => {
        plant(folder, FIXTURE_PATH);
        rewriteJson(folder, 'probes/P-002.probe.json', (probe) => (probe.qualification.mutation = 'C-001'));
      },
      file: 'probes/P-002.probe.json',
      rule: 'id-pattern',
      message: /C-001/,
    },
  ];
  for (const smuggle of smuggles) {
    const folder = evaluationCopy('smuggle');
    smuggle.plant(folder);
    const findings = await checkEvaluation(folder);
    const hit = findings.filter(
      (finding) => finding.file === smuggle.file && finding.rule === smuggle.rule && (smuggle.message?.test(finding.message) ?? true),
    );
    check(
      hit.length > 0,
      `${smuggle.label}: check did not refuse it at ${smuggle.file} under ${smuggle.rule}; findings ${JSON.stringify(findings.map(({ file, rule }) => `${file}:${rule}`))}`,
    );
  }

  const folder = evaluationCopy('cli');
  plant(folder, 'corpus/C-001.candidate.json');
  const refused = runCli(['check', '--evaluation', folder]);
  check(refused.status === 10, `tea-evaluate check exits 10 on a candidate planted in corpus/; got ${refused.status}`);
  check(
    /corpus\/C-001\.candidate\.json: \[candidate-placement\]/.test(refused.output),
    `the refusal names the planted file and the rule: ${refused.output}`,
  );
}

/** The draft of a promoted candidate is a native mutation that `check` accepts, and only a promoted candidate has one. */
async function checkPromotionYieldsAnOrdinaryMutation() {
  const record = discovery.readCandidate(FIXTURE_FOLDER, FIXTURE_PATH);
  const draft = discovery.draftMutation(record);
  const validateMutation = addFormats(new Ajv({ strict: false, allErrors: true })).compile(
    JSON.parse(fs.readFileSync(path.join(NATIVE_SCHEMAS, 'mutation.schema.json'), 'utf8')),
  );
  check(validateMutation(draft) === true, `the draft is a native mutation: ${JSON.stringify(validateMutation.errors)}`);
  check(
    draft.operator.kind === 'replace-exact' && draft.operator.occurrences === 1,
    'the draft is a replace-exact edit with one occurrence',
  );
  check(
    draft.mutationId === record.promotion.draftMutationId && !('qualification' in draft),
    'the draft carries its ID and no qualification',
  );

  const folder = evaluationCopy('draft');
  plant(folder, `mutations/${draft.mutationId}.mutation.json`, `${JSON.stringify(draft, null, 2)}\n`);
  await writeCorpusIndex(folder);
  const findings = await checkEvaluation(folder);
  check(findings.length === 0, `tea-evaluate check accepts the draft as an authored mutation: ${JSON.stringify(findings)}`);

  const unpromoted = fixture();
  unpromoted.state = 'reviewed';
  unpromoted.promotion = null;
  let refused = false;
  try {
    discovery.draftMutation(rebound(unpromoted));
  } catch (error) {
    refused = error instanceof discovery.CandidateError && /only a promoted candidate has a draft/.test(error.message);
  }
  check(refused, 'a candidate that is not promoted has no draft');
}

/** Every eval-quality schema refuses a candidate, and no disposition or state is an engine outcome, verdict or qualification failure. */
async function checkEngineSchemasRefuseTheCandidate() {
  const engine = await loadEngine();
  const root = path.dirname(require.resolve('eval-quality/package.json'));
  const schemaDirectory = path.join(root, 'schemas');
  const ajv = addFormats(new Ajv({ strict: false, allErrors: true }));
  const schemas = fs
    .readdirSync(schemaDirectory)
    .filter((name) => name.endsWith('.schema.json'))
    .map((name) => ({ name, schema: JSON.parse(fs.readFileSync(path.join(schemaDirectory, name), 'utf8')) }));
  for (const { schema } of schemas) ajv.addSchema(schema);
  check(schemas.length > 0, 'eval-quality publishes schemas to hold the candidate against');
  for (const { name, schema } of schemas) {
    check(ajv.getSchema(schema.$id)(fixture()) === false, `the engine's ${name} accepts a candidate record`);
  }

  const disposition = new Set(discovery.DISPOSITIONS);
  const vocabularies = {
    OUTCOME_STATES: engine.OUTCOME_STATES,
    VERDICTS: engine.VERDICTS,
    QUALIFICATION_FAILURES: engine.QUALIFICATION_FAILURES,
  };
  for (const [name, members] of Object.entries(vocabularies)) {
    const values = Object.values(members ?? {}).flat();
    check(values.length > 0, `eval-quality exports ${name}`);
    for (const member of values)
      check(!disposition.has(member), `the candidate disposition ${member} is also a member of eval-quality's ${name}`);
  }
  for (const state of discovery.STATES)
    check(!engine.OUTCOME_STATES.includes(state), `the candidate state ${state} is an eval-quality outcome`);
}

/** Every property name and every string value of `value`, depth first. */
function* tokens(value, keysOnly = false) {
  if (Array.isArray(value)) for (const item of value) yield* tokens(item, keysOnly);
  else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      yield key;
      yield* tokens(child, keysOnly);
    }
  } else if (typeof value === 'string' && !keysOnly) yield value;
}

/** Every key in the `properties` maps of a schema, at any depth. */
function propertyNames(schema, found = new Set()) {
  if (Array.isArray(schema)) for (const item of schema) propertyNames(item, found);
  else if (schema !== null && typeof schema === 'object') {
    if (schema.properties !== null && typeof schema.properties === 'object')
      for (const name of Object.keys(schema.properties)) found.add(name);
    for (const child of Object.values(schema)) propertyNames(child, found);
  }
  return found;
}

/** Candidate property names that native artifacts also use, for their own reasons. Every other name is candidate-only. */
const SHARED_WITH_NATIVE = new Set([
  'artifact',
  'artifactDigest',
  'completed',
  'digest',
  'disposition',
  'evidence',
  'find',
  'kind',
  'name',
  'observationId',
  'observations',
  'occurrences',
  'partition',
  'path',
  'rationale',
  'reference',
  'replace',
  'schemaVersion',
  'scope',
  'seed',
  'state',
  'target',
  'trials',
  'version',
]);

/** No native schema or fixture carries a candidate-only property, and the native schemas stay closed. */
async function checkNativeArtifactsAreUnchanged() {
  const candidateSchema = JSON.parse(fs.readFileSync(path.join(DISCOVERY_ROOT, 'candidate.schema.json'), 'utf8'));
  const names = [...propertyNames(candidateSchema)];
  const onlyCandidate = [...names.filter((name) => !SHARED_WITH_NATIVE.has(name)), 'exploratory-candidate', 'discovery-candidate'];
  check(names.length > 30, `the candidate schema's property names were collected (${names.length})`);
  for (const shared of SHARED_WITH_NATIVE)
    check(names.includes(shared), `${shared} is a candidate property, so it belongs in the shared list`);

  const engineRoot = path.dirname(require.resolve('eval-quality/package.json'));
  const native = [
    ...fs.readdirSync(NATIVE_SCHEMAS).map((name) => path.join(NATIVE_SCHEMAS, name)),
    ...fs.readdirSync(path.join(engineRoot, 'schemas')).map((name) => path.join(engineRoot, 'schemas', name)),
    path.join(VALID, 'evaluation.json'),
    path.join(VALID, 'mutations', 'M-001.mutation.json'),
    path.join(VALID, 'probes', 'P-002.probe.json'),
    path.join(VALID, 'policy', 'scoring-policy.json'),
  ];
  for (const file of native) {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    const found = new Set(tokens(value));
    const leaked = onlyCandidate.filter((field) => found.has(field));
    check(leaked.length === 0, `${path.relative(PROJECT_ROOT, file)} carries the candidate field(s) ${leaked.join(', ')}`);
    const named = [...tokens(value, true)].filter((key) => /candidate|discovery/i.test(key));
    check(named.length === 0, `${path.relative(PROJECT_ROOT, file)} names ${named.join(', ')}, a candidate or discovery property`);
  }

  const mutationSchema = JSON.parse(fs.readFileSync(path.join(NATIVE_SCHEMAS, 'mutation.schema.json'), 'utf8'));
  check(
    candidateSchema.properties.target.properties.artifact.pattern === mutationSchema.properties.targetArtifact.pattern,
    'a candidate names its target file by the rule a mutation does',
  );
  check(
    candidateSchema.$id !== mutationSchema.$id && candidateSchema.additionalProperties === false,
    'the candidate schema is its own closed schema',
  );
  for (const name of ['mutation', 'committed-probe', 'evaluation']) {
    const schema = JSON.parse(fs.readFileSync(path.join(NATIVE_SCHEMAS, `${name}.schema.json`), 'utf8'));
    check(schema.additionalProperties === false, `${name}.schema.json stays closed at the top level`);
  }
}

/** The decision record exists with its sections and names the rules this change adds. */
function checkDecisionRecord() {
  const text = fs.existsSync(ADR) ? fs.readFileSync(ADR, 'utf8') : '';
  check(text.length > 0, 'the candidate contract decision record exists beside the other Evaluate planning artifacts');
  for (const heading of [
    '## Context',
    '## Decision',
    '## Compatibility boundary',
    '## Partitions',
    '## Accepted risk',
    '## Pinned versions and sources',
  ]) {
    check(text.includes(`\n${heading}\n`), `the decision record has a "${heading}" section`);
  }
  const claimed = ['candidate-placement', 'discovery-import', 'judge-failure'];
  for (const word of claimed) check(text.includes(`\`${word}\``), `the decision record names ${word}`);
}

/** Runs every check and reports the failures. */
async function main() {
  try {
    await checkRoundTrip();
    checkEveryStateAndDispositionRepresentable();
    checkRefusals();
    checkFileReading();
    await checkBoundaryThroughTheRealLoader();
    await checkPromotionYieldsAnOrdinaryMutation();
    await checkEngineSchemasRefuseTheCandidate();
    await checkNativeArtifactsAreUnchanged();
    checkDecisionRecord();
  } finally {
    scratch.removeAll();
  }

  if (failures.length > 0) {
    console.error(`${colors.red}${failures.length} of ${checks} discovery check(s) failed:${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log(`${colors.green}ok${colors.reset} all ${checks} discovery check(s) passed`);
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
