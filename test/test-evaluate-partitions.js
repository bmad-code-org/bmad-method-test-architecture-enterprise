'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { writePartitionViews } = require('../cli/lib/evaluate/partition');
const { suite } = require('./lib/evaluate-story-121');

const test = suite('tea-evaluate-partitions');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

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
  fs.writeFileSync(evidenceFile, `${JSON.stringify(edited, null, 2)}\n`);
  writePartitionViews({
    folder: project.folder,
    runDirectory: latest,
    scoreInvocationId: current.scoreInvocationId,
    trialSets: read(path.join(latest, 'trial-sets.json')).trialSets,
    scores: read(path.join(scoreDirectory, 'score.json')).scores,
    heldOutProbes: ['P-002'],
  });
  assert.equal(
    JSON.stringify(read(path.join(latest, 'partitions.json'))['held-out'][0].outcome),
    JSON.stringify(edited.reducedProbeOutcomes[0]),
  );
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
  const unsafe = test.project('scores-link');
  const unsafeRunResult = test.cli(unsafe.folder, 'run', [], unsafe.env);
  assert.equal(unsafeRunResult.status, 0, unsafeRunResult.output);
  const unsafeRun = test.latest(unsafe.folder);
  fs.symlinkSync(unsafe.repository, path.join(unsafeRun, 'scores'), 'dir');
  const status = () => spawnSync('git', ['-C', unsafe.repository, 'status', '--porcelain'], { encoding: 'utf8' }).stdout;
  const beforeScore = status();
  const refusedScore = test.cli(unsafe.folder, 'score', ['--run', path.basename(unsafeRun)], unsafe.env);
  assert.equal(refusedScore.status, 12, refusedScore.output);
  assert.match(refusedScore.output, /scores is a link or a non-directory entry/);
  assert.equal(status(), beforeScore, 'a planted scores link redirected score output into the adopter repository');
  const invalid = test.cli(project.folder, 'run', ['--partition', 'unknown'], project.env);
  assert.equal(invalid.status, 64);
  process.stdout.write('Evaluate partition selection and evidence projections passed.\n');
} finally {
  test.cleanup();
}
