'use strict';

/**
 * The dogfood suite's coverage gaps, closed (Story 1.46, AD-15), held offline.
 *
 * `test/evaluations/bmad-testarch-evaluate/` is the evaluation Evaluate authored for its own skill. Story 1.16's live run
 * recorded `contractVerdict: CONCERNS` for it: four coverage rules unsatisfied at `critical`, B-002 without a seeded probe,
 * and four pieces of drift. This suite replays the committed folder through the real CLI over real eval-quality, with the
 * model's place taken by `test/fixtures/evaluate-dogfood/skill-reader.js`, a deterministic reader of the skill's own guides.
 * The live proof (the Claude Code CLI over the same folder) is recorded in `epic-1-proof.md`; this replay holds what the
 * live run measured, so a regression in the contract, a probe, a mutation or a guide fails here without a model call.
 *
 * Revert checks the story names, each one case below:
 *  - the replay scores every evidence artifact `PASS` with no unsatisfied coverage gap, every clean control
 *    `passed-clean-control` and every seeded probe, development and held-out, `caught` at `minimumTrialCount`; removing a
 *    repair brings its engine rule back as a `CONCERNS` artifact (the four variants at the end),
 *  - the seed of B-002 (M-003) edits the one sentence that states the web-application rule; `test:evaluate-guidance` holds
 *    that the rule is stated once, so a second statement fails there, and the live preflight qualifies the seed against the
 *    model, which this replay cannot (its reader takes the sentence it finds),
 *  - the reference set equals the exit table of `references/gaps.md`, so a row added or dropped there fails here,
 *  - O-003 holds each record to the class its row gives (Story 1.116): the predicate equals one `id` and `class` pair per row of
 *    the table, a listing that swaps the classes of `tea-evaluate 11` and `tea-evaluate 12` fails it, and so does a class changed
 *    in the guide with no contract edit, where a test of the class vocabulary alone passes both,
 *  - each seeded probe violates only the oracles of its own behavior and every oracle outcome reads `agrees`, so the rows of
 *    M-001 and M-002 move O-001 alone,
 *  - each seeded probe has its own defect ID, the requirements digest is the one the contract and `evaluation.json` carry,
 *    the requirements name the JSON fields as evidence, and the skill's `.gitignore` asset lists what Stage 6 writes.
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { scratchDirectories } = require('./lib/scratch-directories');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'cli/evaluate.js');
const ENGINE = path.join(ROOT, 'node_modules/.bin/eval-quality');
const EVALUATION = path.join(ROOT, 'test/evaluations/bmad-testarch-evaluate');
const SKILL = 'skills/bmad-testarch-evaluate';
const READER = path.join(__dirname, 'fixtures/evaluate-dogfood/skill-reader.js');
const GIT = ['-c', 'user.name=TeA test', '-c', 'user.email=tea-test@example.test', '-c', 'core.hooksPath=/dev/null'];
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
const GIT_ENV = { ...BASE_ENV, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

const scratch = scratchDirectories('tea-evaluate-dogfood');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const sha256 = (bytes) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;

/** The rows of the AD-10 exit table in the skill's `gaps.md`, in table order, as `{ id, class }`. */
function exitTableOf(gaps) {
  const heading = '## Map AD-10 exits and classes to repairs';
  const start = gaps.indexOf(heading);
  assert.notEqual(start, -1, 'gaps.md holds the AD-10 exit table section');
  const end = gaps.indexOf('\n## ', start + heading.length);
  return gaps
    .slice(start, end === -1 ? undefined : end)
    .split('\n')
    .filter((line) => line.startsWith('| `'))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    )
    .map(([id, cls]) => ({ id: id.replaceAll('`', ''), class: cls }));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', timeout: 600_000, env: BASE_ENV, ...options });
  if (result.error) throw result.error;
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}
const cli = (folder, command, args = []) => run(process.execPath, [CLI, command, '--evaluation', folder, ...args]);

function commit(repository) {
  for (const args of [
    ['init', '--quiet', '--initial-branch', 'main'],
    ['add', '--all'],
    ['commit', '--quiet', '-m', 'fixture'],
  ]) {
    const result = spawnSync('git', [...GIT, '-C', repository, ...args], { encoding: 'utf8', env: GIT_ENV });
    assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  }
}

/**
 * A committed temp project holding the evaluation folder, the skill's guides and the reader in the place of the skill
 * runner, laid out as the repository is so the folder's `launch.root`, registry target and mutation targets resolve.
 * `trim` keeps one clean control (`true` keeps P-001, a probe ID keeps that probe) and one arm, with one trial, for the variants
 * that only read the engine's coverage or one trial's oracle outcomes.
 */
function project(label, { edit = () => {}, trim = false } = {}) {
  const directory = scratch.make(label);
  const repository = path.join(directory, 'repository');
  const folder = path.join(repository, 'test/evaluations/bmad-testarch-evaluate');
  fs.mkdirSync(path.dirname(folder), { recursive: true });
  const derived = new Set(['runs', 'compiled-contract.json', 'sealed-brief.json']);
  fs.cpSync(EVALUATION, folder, { recursive: true, filter: (file) => !derived.has(path.basename(file)) });
  fs.cpSync(path.join(ROOT, SKILL), path.join(repository, SKILL), {
    recursive: true,
    filter: (file) => path.basename(file) !== '.memlog.md',
  });
  fs.mkdirSync(path.join(repository, 'cli'));
  fs.copyFileSync(READER, path.join(repository, 'cli/skill-runner.js'));
  fs.mkdirSync(path.join(repository, '_bmad'), { recursive: true });
  fs.writeFileSync(
    path.join(repository, '_bmad/config.toml'),
    '[core]\nuser_name = "Test"\ncommunication_language = "English"\n\n[modules.tea]\ntest_artifacts = "test-artifacts"\n',
  );
  fs.mkdirSync(path.join(repository, 'node_modules'));
  fs.writeFileSync(path.join(repository, 'node_modules/.placeholder'), '');
  fs.writeFileSync(path.join(repository, '.gitignore'), '_bmad/\nnode_modules/\n');
  if (trim) {
    for (const name of fs.readdirSync(path.join(folder, 'probes')))
      if (name !== `${trim === true ? 'P-001' : trim}.probe.json`) fs.rmSync(path.join(folder, 'probes', name));
    for (const name of fs.readdirSync(path.join(folder, 'mutations'))) fs.rmSync(path.join(folder, 'mutations', name));
    const evaluation = read(path.join(folder, 'evaluation.json'));
    Object.assign(evaluation, { arms: ['clean'], trials: 1, heldOutProbes: [] });
    write(path.join(folder, 'evaluation.json'), evaluation);
    const policy = read(path.join(folder, 'policy/scoring-policy.json'));
    policy.minimumTrialCount = 1;
    write(path.join(folder, 'policy/scoring-policy.json'), policy);
  }
  edit({ folder, repository });
  const digested = cli(folder, 'digest');
  assert.equal(digested.status, 0, digested.output);
  commit(repository);
  return { folder, repository };
}

/** The newest completed `run` directory under a folder. */
function latest(folder) {
  const runs = path.join(folder, 'runs');
  return path.join(
    runs,
    fs
      .readdirSync(runs)
      .filter((name) => !name.startsWith('.'))
      .sort()
      .at(-1),
  );
}

/** Runs one partition and scores it, returning each probe's evidence artifact by probe ID. */
function runAndScore(subject, partition) {
  const ran = cli(subject.folder, 'run', partition === null ? [] : ['--partition', partition]);
  assert.equal(ran.status, 0, `run ${partition ?? ''} exited ${ran.status}\n${ran.output}`);
  const invocation = path.basename(latest(subject.folder));
  const scored = cli(subject.folder, 'score', ['--run', invocation]);
  assert.equal(scored.status, 0, `score exited ${scored.status}\n${scored.output}`);
  const scores = path.join(latest(subject.folder), 'scores');
  const scoreDirectory = path.join(scores, fs.readdirSync(scores).sort().at(-1));
  const evidence = {};
  for (const probeId of fs.readdirSync(scoreDirectory).filter((name) => /^P-\d+$/.test(name))) {
    evidence[probeId] = read(path.join(scoreDirectory, probeId, 'evidence-artifact.json'));
  }
  return evidence;
}

/**
 * A runner in the reader's place whose reply swaps the classes of the `tea-evaluate 11` and `tea-evaluate 12` records of a
 * listing: every id is still covered and both classes still belong to the table's vocabulary (Story 1.116).
 */
const SWAPPING_RUNNER = `#!/usr/bin/env node
'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const result = spawnSync(process.execPath, [path.join(__dirname, 'skill-reader.js'), ...process.argv.slice(2)], {
  stdio: ['inherit', 'pipe', 'inherit'],
  encoding: 'utf8',
});
const reply = JSON.parse(result.stdout);
if (Array.isArray(reply.exits)) {
  const [eleven, twelve] = ['tea-evaluate 11', 'tea-evaluate 12'].map((id) => reply.exits.find((row) => row.id === id));
  [eleven.class, twelve.class] = [twelve.class, eleven.class];
}
process.stdout.write(JSON.stringify(reply) + '\\n');
`;

/**
 * Runs the exit-table control (P-006) over the committed folder with `contract` and `repository` applied, and returns the
 * run's exit code and the oracles it found violated. A baseline that violates the control's own oracle stops the run at
 * its qualification (exit 11), and the violation is read from that record. Otherwise the clean trial's records give it.
 */
function replayOf(label, { contract = () => {}, repository = () => {} } = {}) {
  const subject = project(label, {
    trim: 'P-006',
    edit: (where) => {
      const file = path.join(where.folder, 'contract.json');
      const edited = read(file);
      contract(edited);
      write(file, edited);
      repository(where);
    },
  });
  const ran = cli(subject.folder, 'run');
  const directory = latest(subject.folder);
  const violated = (oracles) => oracles.filter((oracle) => oracle.disposition === 'violated').map((oracle) => oracle.oracleId);
  if (ran.status === 0) return { exit: 0, violated: violated(read(path.join(directory, 'trials/clean/trial-1.json')).oracles) };
  assert.match(
    ran.output,
    /P-006\.probe\.json: the clean control's baseline does not pass/,
    `${label}: run exited ${ran.status}\n${ran.output}`,
  );
  return { exit: ran.status, violated: violated(read(path.join(directory, 'qualification/P-006/baseline-pass.json')).oracles) };
}

const unsatisfied = (artifact) => artifact.coverageGaps.filter((gap) => !gap.satisfied).map((gap) => gap.rule);
const stateVotes = (artifact) => artifact.reducedProbeOutcomes[0].trialVotes.map((vote) => vote.state);

try {
  // ---- the committed folder, read statically ----------------------------------------------------------------------------
  const contract = read(path.join(EVALUATION, 'contract.json'));
  const evaluation = read(path.join(EVALUATION, 'evaluation.json'));
  const gaps = fs.readFileSync(path.join(ROOT, SKILL, 'references/gaps.md'), 'utf8');
  const table = exitTableOf(gaps);

  // The reference set is the exit table.
  assert.equal(table.length, 13, 'the exit table holds thirteen rows');
  const referenceSet = contract.referenceSets['exit-table'];
  assert.deepEqual(referenceSet.keys, ['id']);
  assert.deepEqual(
    referenceSet.members,
    table.map((row) => ({ id: row.id })),
    'contract.json referenceSets.exit-table drifted from the exit table in references/gaps.md: author the new row or drop the old one',
  );
  // O-003 holds each record to the class its row gives: one `all` pair of `@/id` and `@/class` per row. The rows of
  // tea-evaluate 11 and 12 compare the class with the answer the classify-exits step gave for that exit, and O-001 holds
  // that answer to the table, so a seeded edit of either row moves O-001 alone (Story 1.116).
  const answerOf = { 'tea-evaluate 11': 'exit11', 'tea-evaluate 12': 'exit12' };
  const o003 = contract.oracles.find((oracle) => oracle.id === 'O-003');
  const pairs = o003.check.operands.find((operand) => operand.op === 'for-all').predicate;
  assert.deepEqual(
    pairs,
    {
      op: 'any',
      operands: table.map((row) => ({
        op: 'all',
        operands: [
          { op: 'equality', operands: [{ pointer: '@/id' }, { literal: row.id }] },
          {
            op: 'equality',
            operands: [
              { pointer: '@/class' },
              answerOf[row.id] === undefined
                ? { literal: row.class }
                : { pointer: `/interactions/classify-exits/stdout/${answerOf[row.id]}` },
            ],
          },
        ],
      })),
    },
    'O-003 pairs each record with the class its row of the exit table gives it: a drift from the table fails here',
  );
  const o001 = JSON.stringify(contract.oracles.find((oracle) => oracle.id === 'O-001').check);
  for (const [id, field] of Object.entries(answerOf)) {
    const row = table.find((candidate) => candidate.id === id);
    assert.ok(
      o001.includes(`{"pointer":"/interactions/classify-exits/stdout/${field}"},{"literal":${JSON.stringify(row.class)}}`),
      `O-001 holds the ${field} answer to the class of the ${id} row`,
    );
  }
  const location = contract.permittedInterfaces[0].operations[0].responseDescriptor.collectionLocations;
  assert.deepEqual(location, [
    { pointer: '/exits', expectedCardinality: { mode: 'exact', count: table.length }, referenceSet: 'exit-table' },
  ]);

  // Each seeded probe carries its own defect, its own mutation and an ID no other probe uses.
  const probes = fs
    .readdirSync(path.join(EVALUATION, 'probes'))
    .sort()
    .map((name) => read(path.join(EVALUATION, 'probes', name)));
  const defects = probes.flatMap((probe) => probe.defects.map((defect) => defect.defectId));
  assert.equal(new Set(defects).size, defects.length, `defect IDs are shared across probes: ${defects}`);
  const mutations = probes.filter((probe) => probe.expectedClean === false).map((probe) => probe.qualification.mutation);
  assert.equal(new Set(mutations).size, mutations.length, 'two seeded probes share a mutation');
  assert.deepEqual(
    probes.map((probe) => [probe.probeId, probe.probeClass, probe.behaviorId]),
    [
      ['P-001', 'zero-action', 'B-001'],
      ['P-002', 'defect', 'B-001'],
      ['P-003', 'defect', 'B-001'],
      ['P-004', 'zero-action', 'B-002'],
      ['P-005', 'defect', 'B-002'],
      ['P-006', 'zero-action', 'B-003'],
      ['P-007', 'defect', 'B-003'],
      ['P-008', 'zero-action', 'B-004'],
      ['P-009', 'defect', 'B-004'],
    ],
  );

  // The requirements are the digested source: the contract and evaluation.json carry the same digest, and the admissible
  // evidence is the JSON fields the oracles read.
  const requirements = fs.readFileSync(path.join(EVALUATION, 'requirements.md'));
  assert.equal(contract.sourceSpecDigest, sha256(requirements), 'contract.json sourceSpecDigest is stale');
  assert.equal(evaluation.requirements.digest, sha256(requirements), 'evaluation.json requirements.digest is stale');
  const requirementsText = requirements.toString('utf8');
  for (const field of ['`status`', '`exit11`', '`exit12`', '`targetKind`', '`interface`', '`exits`', '`class`', '`basis`'])
    assert.ok(requirementsText.includes(field), `requirements.md names the JSON field ${field} as evidence`);
  assert.doesNotMatch(requirementsText, /answer line/i, 'requirements.md still describes fixed answer lines');

  // The README counts the rule's statements as the skill holds them: once.
  const readme = fs.readFileSync(path.join(EVALUATION, 'corpus/README.md'), 'utf8');
  assert.match(readme, /stated once in the skill/);
  assert.doesNotMatch(readme, /three times|four times/);
  for (const probe of probes) assert.ok(readme.includes(`| ${probe.probeId} `), `corpus/README.md lists ${probe.probeId}`);

  // Stage 6 writes the compile and seal outputs into the folder, so the skill's asset ignores them, as the folder does.
  const asset = fs
    .readFileSync(path.join(ROOT, SKILL, 'assets/evaluation-folder.gitignore'), 'utf8')
    .split('\n')
    .filter(Boolean);
  for (const output of ['runs/', 'compiled-contract.json', 'sealed-brief.json'])
    assert.ok(asset.includes(output), `the .gitignore asset lists ${output}`);
  assert.deepEqual(fs.readFileSync(path.join(EVALUATION, '.gitignore'), 'utf8').split('\n').filter(Boolean), asset);

  // The folder passes check, and the engine compiles and seals it.
  const checked = cli(EVALUATION, 'check');
  assert.equal(checked.status, 0, checked.output);
  const staging = scratch.make('engine');
  for (const stage of ['compile', 'seal']) {
    const out = path.join(staging, `${stage}.json`);
    const result = run(ENGINE, [stage, '--in', path.join(EVALUATION, 'contract.json'), '--out', out]);
    assert.equal(result.status, 0, `eval-quality ${stage} exited ${result.status}\n${result.output}`);
  }

  // ---- replay: development, then held-out, over real eval-quality ------------------------------------------------------
  const replay = project('replay');
  // Stage 6's preflight comes first, as the live run's does: it passes, and each seeded probe qualifies.
  const preflight = cli(replay.folder, 'preflight');
  assert.equal(preflight.status, 0, `preflight exited ${preflight.status}\n${preflight.output}`);
  for (const probeId of ['P-002', 'P-003', 'P-005', 'P-007', 'P-009'])
    assert.match(preflight.output, new RegExp(`probes/${probeId}\\.probe\\.json: qualified;`), `preflight did not qualify ${probeId}`);
  const development = runAndScore(replay, 'development');
  const heldOut = runAndScore(replay, 'held-out');
  const scored = { ...development, ...heldOut };
  assert.deepEqual(
    Object.keys(scored).sort(),
    probes.map((probe) => probe.probeId),
    'every probe is scored',
  );
  const minimum = read(path.join(EVALUATION, 'policy/scoring-policy.json')).minimumTrialCount;
  for (const probe of probes) {
    const artifact = scored[probe.probeId];
    assert.equal(artifact.contractVerdict, 'PASS', `${probe.probeId} records ${artifact.contractVerdict}, not PASS`);
    assert.deepEqual(unsatisfied(artifact), [], `${probe.probeId} records an unsatisfied coverage rule`);
    const votes = stateVotes(artifact);
    assert.ok(votes.length >= minimum, `${probe.probeId} holds ${votes.length} trial votes, below minimumTrialCount ${minimum}`);
    const expected = probe.expectedClean ? 'passed-clean-control' : 'caught';
    assert.deepEqual([...new Set(votes)], [expected], `${probe.probeId} votes ${votes}, expected ${expected}`);
  }
  assert.deepEqual(Object.keys(heldOut), ['P-003'], 'the held-out run scores the held-out probe alone');

  // Each seeded defect is scoped to one oracle: the oracles its mutated trials violate are the ones its own behavior lists,
  // and the engine's corroboration agrees on every oracle outcome. M-001 and M-002 edit the rows of tea-evaluate 11 and 12,
  // which O-003 reads too, so a listing check that held the row's literal class would violate beside O-001 and read `disagrees`.
  const oraclesOf = Object.fromEntries(contract.behaviors.map((behavior) => [behavior.id, behavior.oracles]));
  for (const probe of probes) {
    const outcomes = scored[probe.probeId].outcomes;
    assert.deepEqual(
      [...new Set(outcomes.filter((outcome) => outcome.corroboration !== 'agrees').map((outcome) => outcome.oracleId))],
      [],
      `${probe.probeId} records an oracle outcome whose corroboration is not agrees`,
    );
    assert.deepEqual(
      [...new Set(outcomes.filter((outcome) => outcome.disposition === 'violated').map((outcome) => outcome.oracleId))],
      probe.expectedClean ? [] : oraclesOf[probe.behaviorId],
      `${probe.probeId} violates an oracle outside its behavior`,
    );
  }

  // ---- a listing that swaps two classes fails O-003 (Story 1.116) ------------------------------------------------------
  const held = { exit: 0, violated: [] };
  const vocabulary = [...new Set(table.map((row) => row.class))];
  /** O-003 as Story 1.46 left it: each record's class tested against the table's vocabulary, with the evidence targets it then had. */
  const vocabularyOnly = (edited) => {
    const oracle = edited.oracles.find((candidate) => candidate.id === 'O-003');
    oracle.check.operands.find((operand) => operand.op === 'for-all').predicate = {
      op: 'set-membership',
      operands: [{ pointer: '@/class' }, { literal: vocabulary }],
    };
    oracle.direction.evidenceTargets = oracle.direction.evidenceTargets.filter((target) => target.includes('/list-exit-table/'));
  };
  const swapRunner = ({ repository }) => {
    fs.copyFileSync(path.join(repository, 'cli/skill-runner.js'), path.join(repository, 'cli/skill-reader.js'));
    fs.writeFileSync(path.join(repository, 'cli/skill-runner.js'), SWAPPING_RUNNER, { mode: 0o755 });
  };
  /** Gives the `eval-quality 3` row a class that is in the table's vocabulary and is not the row's own. */
  const reclassify = ({ repository }) => {
    const file = path.join(repository, SKILL, 'references/gaps.md');
    const text = fs.readFileSync(file, 'utf8');
    const from = '| `eval-quality 3`        | infrastructure or integrity                   |';
    const to = '| `eval-quality 3`        | runtime fault                                 |';
    assert.ok(text.includes(from) && vocabulary.includes('runtime fault'), 'the row the case reclassifies is in the table');
    fs.writeFileSync(file, text.replace(from, to));
  };
  assert.deepEqual(replayOf('clean-listing'), held, 'the committed contract passes the unswapped listing');
  assert.deepEqual(
    replayOf('swapped-listing', { repository: swapRunner }),
    { exit: 11, violated: ['O-003'] },
    'a complete listing in vocabulary that swaps the classes of tea-evaluate 11 and 12 violates O-003, and the run stops at the control',
  );
  assert.deepEqual(
    replayOf('swapped-listing-vocabulary-only', { repository: swapRunner, contract: vocabularyOnly }),
    held,
    'a class vocabulary test alone passes the swapped listing, which is why O-003 pairs each id with its class',
  );
  // Swapping a class in the guide with no contract edit fails the replay.
  assert.deepEqual(
    replayOf('reclassified-row', { repository: reclassify }),
    { exit: 11, violated: ['O-003'] },
    'a class changed in the guide table, with no contract edit, violates O-003',
  );
  assert.deepEqual(
    replayOf('reclassified-row-vocabulary-only', { repository: reclassify, contract: vocabularyOnly }),
    held,
    'a class vocabulary test alone passes a class changed to another class of the table',
  );

  // ---- reverting one repair brings its engine rule back as CONCERNS ---------------------------------------------------
  const base = runAndScore(project('base-trimmed', { trim: true }), null)['P-001'];
  assert.deepEqual([base.contractVerdict, unsatisfied(base)], ['PASS', []], 'the trimmed control scores PASS with no gap');
  const variant = (label, change) => {
    const artifact = runAndScore(
      project(label, {
        trim: true,
        edit: ({ folder }) => {
          const file = path.join(folder, 'contract.json');
          const edited = read(file);
          change(edited);
          write(file, edited);
        },
      }),
      null,
    )['P-001'];
    return [artifact.contractVerdict, unsatisfied(artifact)];
  };
  /** The variant reads CONCERNS and names the rule its repair closed; a rule a newer engine adds beside it is no regression of ours. */
  const reverts = (rule, label, change) => {
    const [verdict, rules] = variant(label, change);
    assert.equal(verdict, 'CONCERNS', `${label} scores ${verdict}`);
    assert.ok(rules.includes(rule), `${label} leaves ${rule} satisfied: ${rules}`);
  };
  const descriptor = (edited) => edited.permittedInterfaces[0].operations[0].responseDescriptor;
  const checkOf = (edited, id) => edited.oracles.find((oracle) => oracle.id === id).check;
  reverts('success-indicator-separation', 'no-indicator', (edited) => {
    descriptor(edited).successIndicator = null;
  }); // gap G-1
  reverts('malformed-input', 'no-type-violation', (edited) => {
    edited.interactionPlan.find((step) => step.stepId === 'refuse-no-exit').inputBinding.stdin.exit = { literal: 12 };
  }); // gap G-2
  reverts('per-record', 'no-quantifier', (edited) => {
    const check = checkOf(edited, 'O-003');
    check.operands = check.operands.filter((operand) => operand.op !== 'for-all');
    // The evidence targets that only the quantifier's pairs read go with it, or the direction no longer aligns with the check.
    const oracle = edited.oracles.find((candidate) => candidate.id === 'O-003');
    oracle.direction.evidenceTargets = oracle.direction.evidenceTargets.filter((target) => target.includes('/list-exit-table/'));
  }); // gap G-3
  reverts('omission-and-completeness', 'no-completeness', (edited) => {
    const check = checkOf(edited, 'O-003');
    check.operands = check.operands.filter((operand) => operand.op !== 'covers-by-key');
  }); // gap G-4

  console.log(
    'evaluate-dogfood: the committed folder holds its reference set, defect IDs, digests and ignores; the replay scores PASS with no gap; each repair reverts to its CONCERNS rule',
  );
} finally {
  scratch.removeAll();
}
