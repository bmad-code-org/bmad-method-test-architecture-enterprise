'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { ENGINE_CLI_ENV } = require('../cli/lib/evaluate/engine');
const { writePartitionViews } = require('../cli/lib/evaluate/partition');
const { RunDirectory } = require('../cli/lib/evaluate/run-directory');
const { suite } = require('./lib/evaluate-story-121');

const test = suite('tea-evaluate-partitions');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const RACE_ENGINE = path.join(__dirname, 'fixtures', 'evaluate', 'race-engine.js');

/** Every regular file and link under `directory` with its content digest or link target, sorted; nothing is followed and empty directories are left out. */
function filesUnder(directory) {
  const found = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) walk(file);
      else {
        const state = entry.isSymbolicLink()
          ? `link to ${fs.readlinkSync(file)}`
          : crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
        found.push(`${path.relative(directory, file)} ${state}`);
      }
    }
  };
  walk(directory);
  return found.sort();
}

/** The shim's logged calls, one argv per line. */
function loggedCalls(log) {
  return fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
}

try {
  // The partitions are held to which workspaces launched the target, which the launch marker records.
  const project = test.project(
    'partitions',
    ({ folder }) => {
      const manifest = path.join(folder, 'evaluation.json');
      const evaluation = read(manifest);
      evaluation.heldOutProbes = ['P-002'];
      fs.writeFileSync(manifest, `${JSON.stringify(evaluation, null, 2)}\n`);
    },
    { marker: true },
  );
  for (const [partition, expected] of [
    ['development', ['P-001']],
    ['held-out', ['P-002']],
    [null, ['P-001', 'P-002']],
  ]) {
    const args = partition === null ? [] : ['--partition', partition];
    const launchFile = project.env.VERDICT_MARKER;
    const before = fs.existsSync(launchFile) ? fs.readFileSync(launchFile, 'utf8').trim().split('\n').length : 0;
    const ran = test.cli(project.folder, 'run', args, project.env);
    assert.equal(ran.status, 0, `${partition}: ${ran.output}`);
    const run = test.latest(project.folder);
    const launched = fs.readFileSync(launchFile, 'utf8').trim().split('\n').slice(before).map(JSON.parse);
    if (partition === 'development') {
      assert.equal(
        launched.some(({ workspace }) => workspace === 'qualify-P-002'),
        false,
      );
      assert.equal(fs.existsSync(path.join(run, 'qualification/P-002')), false);
    }
    if (partition === 'held-out') {
      assert.equal(
        launched.some(({ workspace }) => workspace === 'qualify-clean'),
        false,
      );
      assert.equal(fs.existsSync(path.join(run, 'qualification/P-001')), false);
    }
    const index = read(path.join(run, 'trial-sets.json'));
    assert.deepEqual(index.trialSets.map((set) => set.probeId).sort(), expected);
    const scored = test.cli(project.folder, 'score', ['--run', path.basename(run)], project.env);
    assert.equal(scored.status, 0, `${partition}: ${scored.output}`);
    const partitions = read(path.join(run, 'partitions.json'));
    const gap = read(path.join(run, 'gap-view.json'));
    assert.deepEqual([...partitions.development, ...partitions['held-out']].map((entry) => entry.probeId).sort(), expected);
    const scoreDirectory = path.join(run, 'scores', partitions.scoreInvocationId);
    for (const entries of [partitions.development, partitions['held-out'], gap.development, gap['held-out']]) {
      for (const entry of entries) {
        const evidence = read(path.join(scoreDirectory, entry.probeId, 'evidence-artifact.json'));
        assert.equal(JSON.stringify(entry.outcome), JSON.stringify(evidence.reducedProbeOutcomes[0]));
      }
    }
    for (const entry of gap['held-out']) assert.deepEqual(Object.keys(entry).sort(), ['outcome', 'probeClass', 'probeId']);
    if (expected.includes('P-002')) {
      const heldOut = read(path.join(project.folder, 'probes/P-002.probe.json'));
      const mutation = read(path.join(project.folder, 'mutations/M-001.mutation.json'));
      const text = JSON.stringify(gap);
      for (const secret of [
        heldOut.rationale,
        heldOut.defects[0].summary,
        JSON.stringify(heldOut.defectSignature.condition.selector.inputBinding),
        mutation.operator.find,
        mutation.operator.replace,
      ])
        assert.equal(text.includes(secret), false, `held-out detail leaked: ${secret}`);
    }
  }
  const latest = test.latest(project.folder);
  const current = read(path.join(latest, 'partitions.json'));
  const scoreDirectory = path.join(latest, 'scores', current.scoreInvocationId);
  const evidenceFile = path.join(scoreDirectory, 'P-002/evidence-artifact.json');
  const edited = read(evidenceFile);
  edited.reducedProbeOutcomes[0].caught = !edited.reducedProbeOutcomes[0].caught;
  // The views summarize the evidence artifact the writer handed over; they read no score directory themselves.
  const viewWriter = RunDirectory.attach(latest);
  try {
    writePartitionViews({
      writer: viewWriter,
      runDirectory: latest,
      scoreInvocationId: current.scoreInvocationId,
      trialSets: read(path.join(latest, 'trial-sets.json')).trialSets,
      evidence: new Map([['P-002', edited]]),
      heldOutProbes: ['P-002'],
    });
  } finally {
    viewWriter.close();
  }
  assert.equal(
    JSON.stringify(read(path.join(latest, 'partitions.json'))['held-out'][0].outcome),
    JSON.stringify(edited.reducedProbeOutcomes[0]),
  );
  // The probe a view summarizes is a regular file of the run, read without following a link.
  const probeLink = path.join(latest, 'probe-link.json');
  fs.symlinkSync(path.join(latest, read(path.join(latest, 'trial-sets.json')).trialSets[0].probe), probeLink);
  const linkWriter = RunDirectory.attach(latest);
  try {
    assert.throws(
      () =>
        writePartitionViews({
          writer: linkWriter,
          runDirectory: latest,
          scoreInvocationId: current.scoreInvocationId,
          trialSets: [{ probeId: 'P-001', probe: 'probe-link.json' }],
          evidence: new Map(),
          heldOutProbes: [],
        }),
      /symbolic link/,
    );
  } finally {
    linkWriter.close();
    fs.unlinkSync(probeLink);
  }
  for (const name of ['partitions.json', 'gap-view.json']) {
    const view = path.join(latest, name);
    const sentinel = path.join(project.directory, `${name}.sentinel`);
    fs.writeFileSync(sentinel, `outside ${name}\n`);
    fs.unlinkSync(view);
    fs.symlinkSync(sentinel, view);
    const rescored = test.cli(project.folder, 'score', ['--run', path.basename(latest)], project.env);
    assert.equal(rescored.status, 0, rescored.output);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), `outside ${name}\n`);
    assert.equal(fs.lstatSync(view).isFile(), true);
  }
  // A planted entry at `scores` is refused before any engine call: a link to the adopter repository, with the engine
  // shim counting its calls, and then a plain file; once it is gone the run scores normally.
  const unsafe = test.project('scores-link');
  const unsafeRunResult = test.cli(unsafe.folder, 'run', [], unsafe.env);
  assert.equal(unsafeRunResult.status, 0, unsafeRunResult.output);
  const unsafeRun = test.latest(unsafe.folder);
  const unsafeLog = path.join(unsafe.directory, 'scores-link-calls.log');
  const counting = { ...unsafe.env, [ENGINE_CLI_ENV]: RACE_ENGINE, TEA_RACE_LOG: unsafeLog };
  fs.writeFileSync(path.join(unsafe.repository, 'tracked-sentinel.txt'), 'outside the run directory\n');
  const status = () => spawnSync('git', ['-C', unsafe.repository, 'status', '--porcelain'], { encoding: 'utf8' }).stdout;
  const beforeScore = status();
  const sentinelBefore = filesUnder(unsafe.repository).filter((line) => !line.startsWith('evals/verdict/runs/'));
  fs.symlinkSync(unsafe.repository, path.join(unsafeRun, 'scores'), 'dir');
  const refusedScore = test.cli(unsafe.folder, 'score', ['--run', path.basename(unsafeRun)], counting);
  assert.equal(refusedScore.status, 12, refusedScore.output);
  assert.match(refusedScore.output, /scores is a link or a non-directory entry/);
  assert.equal(status(), beforeScore, 'a planted scores link redirected score output into the adopter repository');
  assert.deepEqual(
    filesUnder(unsafe.repository).filter((line) => !line.startsWith('evals/verdict/runs/')),
    sentinelBefore,
    'a planted scores link was followed',
  );
  assert.equal(loggedCalls(unsafeLog).length, 0, 'a planted scores link was refused only after an engine call');
  fs.unlinkSync(path.join(unsafeRun, 'scores'));
  fs.writeFileSync(path.join(unsafeRun, 'scores'), 'a file where the score directory goes\n');
  const fileScore = test.cli(unsafe.folder, 'score', ['--run', path.basename(unsafeRun)], counting);
  assert.equal(fileScore.status, 12, fileScore.output);
  assert.match(fileScore.output, /scores is a link or a non-directory entry/);
  assert.equal(loggedCalls(unsafeLog).length, 0, 'a planted scores file was refused only after an engine call');
  assert.equal(fs.readFileSync(path.join(unsafeRun, 'scores'), 'utf8'), 'a file where the score directory goes\n');
  fs.unlinkSync(path.join(unsafeRun, 'scores'));
  const afterPlant = test.cli(unsafe.folder, 'score', ['--run', path.basename(unsafeRun)], unsafe.env);
  assert.equal(afterPlant.status, 0, afterPlant.output);
  assert.equal(fs.lstatSync(path.join(unsafeRun, 'scores')).isDirectory(), true);

  // A link at `runs/`, which `run` refuses, is refused by `score` too: with `runs` moved aside and a link to a copy of
  // it inside the adopter's tree, no engine call is made and nothing is written there.
  const unsafeRuns = path.join(unsafe.folder, 'runs');
  const runsCopy = path.join(unsafe.repository, 'runs-copy');
  fs.cpSync(unsafeRuns, runsCopy, { recursive: true });
  fs.renameSync(unsafeRuns, `${unsafeRuns}.moved`);
  fs.symlinkSync(runsCopy, unsafeRuns, 'dir');
  const repositoryListing = () => filesUnder(unsafe.repository).filter((line) => !line.startsWith('evals/verdict/runs.moved/'));
  const listingBeforeRunsLink = repositoryListing();
  const statusBeforeRunsLink = status();
  const callsBeforeRunsLink = loggedCalls(unsafeLog).length;
  const runsLinked = test.cli(unsafe.folder, 'score', ['--run', path.basename(unsafeRun)], counting);
  assert.equal(runsLinked.status, 12, runsLinked.output);
  assert.match(runsLinked.output, /runs is a link or a non-directory entry/);
  assert.equal(loggedCalls(unsafeLog).length, callsBeforeRunsLink, 'a planted runs link was refused only after an engine call');
  assert.deepEqual(repositoryListing(), listingBeforeRunsLink, 'a planted runs link was followed into the adopter repository');
  assert.equal(status(), statusBeforeRunsLink, 'a planted runs link changed the adopter repository');
  fs.unlinkSync(unsafeRuns);
  fs.renameSync(`${unsafeRuns}.moved`, unsafeRuns);

  // A repeated score keeps both invocations: the first is untouched by the second, and each holds its own evidence.
  const repeated = test.latest(project.folder);
  const invocations = () => fs.readdirSync(path.join(repeated, 'scores')).sort();
  const first = invocations();
  assert.ok(first.length > 0, 'the run to rescore has no score invocation');
  const firstFiles = filesUnder(path.join(repeated, 'scores', first.at(-1)));
  const again = test.cli(project.folder, 'score', ['--run', path.basename(repeated)], project.env);
  assert.equal(again.status, 0, again.output);
  const both = invocations();
  assert.equal(both.length, first.length + 1, `a second score left ${JSON.stringify(both)} after ${JSON.stringify(first)}`);
  assert.deepEqual(
    filesUnder(path.join(repeated, 'scores', first.at(-1))),
    firstFiles,
    'a second score changed the first score invocation',
  );
  const indexed = read(path.join(repeated, 'trial-sets.json'))
    .trialSets.map((set) => set.probeId)
    .sort();
  for (const name of both.slice(-2)) {
    const directory = path.join(repeated, 'scores', name);
    const summary = read(path.join(directory, 'score.json'));
    assert.equal(summary.invocationId, name);
    assert.equal(summary.exitCode, 0);
    assert.deepEqual(summary.scores.map((entry) => entry.probeId).sort(), indexed);
    for (const probeId of indexed) {
      const call = read(path.join(directory, probeId, 'score.json'));
      assert.equal(call.exitCode, 0, `${name}/${probeId}`);
      assert.equal(call.stage, 'score');
      const evidence = read(path.join(directory, probeId, 'evidence-artifact.json'));
      assert.equal(evidence.reducedProbeOutcomes[0].probeId, probeId);
      const entry = summary.scores.find((candidate) => candidate.probeId === probeId);
      assert.equal(path.join(project.folder, entry.evidence), path.join(directory, probeId, 'evidence-artifact.json'));
    }
  }
  assert.equal(read(path.join(repeated, 'partitions.json')).scoreInvocationId, both.at(-1));
  assert.equal(read(path.join(repeated, 'interpretation.json')).scoreInvocationId, both.at(-1));

  // A process changing the score directories while `score` runs: after the real engine has run, a shim at the engine
  // path swaps the scores parent, the invocation directory or the probe directory for a link, plants one where the
  // next probe's directory or an output file will be, and `score` exits 12 with the adopter's repository and the
  // external sentinels exactly as they were. Every link points at a directory with the path a followed write would need.
  const race = test.project('race', ({ repository }) => {
    fs.mkdirSync(path.join(repository, 'leak'));
    fs.writeFileSync(path.join(repository, 'leak', 'sentinel.txt'), 'inside the adopter repository\n');
  });
  const raceRunResult = test.cli(race.folder, 'run', [], race.env);
  assert.equal(raceRunResult.status, 0, raceRunResult.output);
  const raceRun = test.latest(race.folder);
  const external = path.join(race.directory, 'external');
  fs.mkdirSync(path.join(external, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(external, 'sentinel.txt'), 'outside the adopter repository\n');
  fs.writeFileSync(path.join(external, 'nested', 'other.txt'), 'further out\n');
  const raceStatus = () => spawnSync('git', ['-C', race.repository, 'status', '--porcelain'], { encoding: 'utf8' }).stdout;
  const snapshot = () => ({ status: raceStatus(), leak: filesUnder(path.join(race.repository, 'leak')), external: filesUnder(external) });
  const refusal = {
    'swap-scores': /no longer the directory the runtime made/,
    'swap-invocation': /no longer the directory the runtime made/,
    'swap-probe': /no longer the directory the runtime made/,
    'plant-next-probe': /already holds scores\/[^ ]+\/P-002, which the runtime did not make/,
    'plant-record': /already holds scores\/[^ ]+\/P-001\/score\.json, which the runtime did not write/,
    'plant-evidence': /already holds scores\/[^ ]+\/P-001\/evidence-artifact\.json, which the runtime did not write/,
    'plant-summary': /already holds scores\/[^ ]+\/score\.json, which the runtime did not write/,
  };
  const callsMade = { 'plant-summary': 2 };
  const scoresDirectory = path.join(raceRun, 'scores');
  // Each attempt is held to the state just before it, and every attempt is reported, so a regression says how many swaps got through.
  const gotThrough = [];
  for (const target of [path.join(race.repository, 'leak'), external]) {
    for (const [mode, pattern] of Object.entries(refusal)) {
      const label = `${mode} toward ${path.relative(race.directory, target)}`;
      const log = path.join(race.directory, `${mode}-${path.basename(target)}.log`);
      const before = snapshot();
      const raced = test.cli(race.folder, 'score', ['--run', path.basename(raceRun)], {
        ...race.env,
        [ENGINE_CLI_ENV]: RACE_ENGINE,
        TEA_RACE_LOG: log,
        TEA_RACE_MODE: mode,
        TEA_RACE_TARGET: target,
        TEA_RACE_SENTINEL: path.join(target, 'sentinel.txt'),
      });
      const after = snapshot();
      const problems = [];
      if (raced.status !== 12) problems.push(`exited ${raced.status}, not 12`);
      if (!/score output was refused to keep it inside the run directory/.test(raced.output)) problems.push('did not report the refusal');
      if (!pattern.test(raced.output)) problems.push(`did not name the entry (${pattern})`);
      if (loggedCalls(log).length !== (callsMade[mode] ?? 1)) problems.push(`made ${loggedCalls(log).length} engine call(s)`);
      if (after.status !== before.status) problems.push("changed the adopter repository's git status");
      if (JSON.stringify(after.leak) !== JSON.stringify(before.leak)) problems.push('put a file in the adopter repository');
      if (JSON.stringify(after.external) !== JSON.stringify(before.external)) problems.push('changed an external sentinel');
      if (problems.length > 0) gotThrough.push(`${label}: ${problems.join('; ')}`);
      if (fs.lstatSync(scoresDirectory).isSymbolicLink()) {
        fs.unlinkSync(scoresDirectory);
        fs.renameSync(`${scoresDirectory}.moved`, scoresDirectory);
      }
    }
  }
  assert.deepEqual(gotThrough, [], `${gotThrough.length} race attempt(s) were not refused cleanly`);
  const afterRaces = test.cli(race.folder, 'score', ['--run', path.basename(raceRun)], race.env);
  assert.equal(afterRaces.status, 0, afterRaces.output);
  const invalid = test.cli(project.folder, 'run', ['--partition', 'unknown'], project.env);
  assert.equal(invalid.status, 64);
  process.stdout.write('Evaluate partition selection and evidence projections passed.\n');
} finally {
  test.cleanup();
}
