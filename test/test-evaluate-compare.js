'use strict';

/**
 * `tea-evaluate compare` and `compare --accept` (Story 2.1, AD-12), run through the
 * real CLI over real eval-quality and real clean runs of the verdict fixture.
 *
 * Every case builds its own copy of a scored project and mutates the copy, never a
 * committed fixture. The revert checks the story names are each one case:
 *  - the `evalQualityVersion`-only refusal (a relation without TeA's refusal),
 *  - the replay of an accepted baseline without its isolation manifests (exit 3),
 *  - the dirty refusal (an accepted dirty run writes `baseline/`),
 *  - staging inside the committed folder (an accept killed mid-staging makes the next run dirty),
 *  - a lock that is taken over (three accepts at once all run),
 *  - a plain compare that restores or deletes (an accept running at the same time loses both baselines),
 *  - the input checks `score` runs (an edited sealed record is accepted),
 *  - the directory-link check (a linked `trials/` directory is followed).
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const AjvModule = require('ajv/dist/2020');

const { loadEngine } = require('../cli/lib/evaluate/engine');
const baselines = require('./lib/evaluate-baseline');
const { suite } = require('./lib/evaluate-story-121');

const Ajv = AjvModule.default ?? AjvModule;
const test = suite('tea-evaluate-compare');
const CLI = path.join(__dirname, '..', 'cli', 'evaluate.js');
const STAGING_WRAPPER = path.join(__dirname, 'fixtures', 'evaluate', 'wrap-baseline-staging.cjs');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const copies = [];
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

/** Every regular file and link under `directory` with its content digest or link target, sorted; nothing is followed. */
function treeOf(directory) {
  const found = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) walk(file);
      else
        found.push(
          `${path.relative(directory, file)} ${entry.isSymbolicLink() ? `link to ${fs.readlinkSync(file)}` : sha(fs.readFileSync(file))}`,
        );
    }
  };
  walk(directory);
  return found.sort();
}

/** Every regular file under `directory`, relative and sorted. */
function filesOf(directory) {
  return treeOf(directory).map((line) => line.split(' ')[0]);
}

const copyOf = (project) => baselines.copyOf(project, copies);
const { commitAll } = baselines;
const runAndScore = (project, runArgs) => baselines.runAndScore(test, project, runArgs);

/** `compare` through the CLI with a failure injected by the staging wrapper. */
function wrapped(folder, mode, extraEnv = {}, args = ['--accept']) {
  const run = spawnSync(process.execPath, ['--require', STAGING_WRAPPER, CLI, 'compare', '--evaluation', folder, ...args], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    env: { ...process.env, TEA_BASELINE_FAIL: mode, ...extraEnv },
  });
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

function latestScore(runDirectory) {
  return fs.readdirSync(path.join(runDirectory, 'scores')).sort().at(-1);
}

function evidenceOf(directory, probeId) {
  return read(path.join(directory, 'scores', latestScore(directory), probeId, 'evidence-artifact.json'));
}

/** What an accept may leave behind: nothing in the folder beside `baseline/`, and nothing under `runs/.compare-staging/`. */
function leftovers(folder) {
  const scratch = path.join(folder, 'runs', '.compare-staging');
  return [
    ...fs.readdirSync(folder).filter((name) => name.startsWith('.baseline-')),
    ...(fs.existsSync(scratch) ? fs.readdirSync(scratch) : []),
    ...fs.readdirSync(path.join(folder, 'runs')).filter((name) => name.startsWith('.compare-staging.lock')),
  ];
}

/** A copy of `artifact` as a run that missed what the original caught: the one probe's reduction and strength agree. */
function weakened(artifact) {
  const weak = structuredClone(artifact);
  weak.outcomes[0].state = 'missed';
  weak.reducedProbeOutcomes[0].trialVotes[0].state = 'missed';
  weak.reducedProbeOutcomes[0].caught = false;
  weak.reducedProbeOutcomes[0].caughtCount = 0;
  weak.strength.vector.defect = { caught: 0, exercised: 1, rate: 0 };
  return weak;
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** The files `score` reads from a run directory, derived from the run's own index and records, not from `compare`. */
function scoreReads(folder, runDirectory) {
  const index = read(path.join(runDirectory, 'trial-sets.json'));
  const prefix = `${path.relative(folder, runDirectory)}/`;
  const names = new Set([
    'run.json',
    'trial-sets.json',
    index.contract,
    index.policy,
    index.preflightVerdict,
    index.evaluatorConfiguration,
  ]);
  names.add('operation-phases.json');
  for (const set of index.trialSets) {
    names.add(set.probe);
    names.add(set.isolationManifest);
    for (const recordPath of set.records) {
      names.add(recordPath);
      const record = read(path.join(runDirectory, recordPath));
      names.add(record.actionsArtifact.path.slice(prefix.length));
      names.add(record.isolationManifestArtifact.path.slice(prefix.length));
    }
  }
  return [...names].sort();
}

async function main() {
  try {
    const engine = await loadEngine();
    const project = test.project('compare');

    // Compare with no baseline.
    const first = runAndScore(project);
    const firstId = path.basename(first);
    let result = test.cli(project.folder, 'compare', ['--run', firstId]);
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /first-run: /);
    assert.equal(fs.existsSync(path.join(project.folder, 'baseline')), false, 'a compare wrote baseline/');

    // Accept a clean scored run.
    result = test.cli(project.folder, 'compare', ['--accept', '--run', firstId]);
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /accepted: /);
    const baseline = path.join(project.folder, 'baseline');
    assert.deepEqual(leftovers(project.folder), []);
    const manifest = read(path.join(baseline, 'baseline.json'));
    const manifestSchema = new Ajv({ strict: false, allErrors: true }).compile(
      read(path.join(__dirname, '..', 'cli', 'lib', 'evaluate', 'schemas', 'baseline.schema.json')),
    );
    assert.equal(manifestSchema(manifest), true, JSON.stringify(manifestSchema.errors));
    const runRecord = read(path.join(first, 'run.json'));
    assert.equal(runRecord.dirty, false);
    assert.equal(manifest.acceptedRun, firstId);
    assert.equal(manifest.scoreInvocationId, latestScore(first));
    for (const field of ['partition', 'evalQualityVersion', 'corpusDigest', 'contractDigest', 'policyDigest'])
      assert.equal(manifest[field], runRecord[field], field);
    // The members the story names, each byte for byte the run's own with the digest `files` records.
    const { digestBytes } = engine;
    const held = filesOf(baseline).filter((name) => name !== 'baseline.json');
    assert.deepEqual(Object.keys(manifest.files).sort(), held, 'baseline.json does not list exactly the files it holds');
    for (const name of held) {
      const bytes = fs.readFileSync(path.join(baseline, name));
      assert.equal(bytes.equals(fs.readFileSync(path.join(first, name))), true, `${name} is not the run's own bytes`);
      assert.equal(manifest.files[name], digestBytes(bytes), `${name}: files records another digest`);
    }
    for (const name of scoreReads(project.folder, first)) assert.ok(held.includes(name), `the baseline lacks ${name}, which score reads`);
    for (const name of [
      'run.json',
      'trial-sets.json',
      'contract.json',
      'eval-contract.json',
      'sealed-evaluator-brief.json',
      'scoring-policy.json',
      'evaluator-configuration.json',
      'operation-phases.json',
      'preflight-verdict.json',
      'probes.json',
      'observations.json',
    ])
      assert.ok(held.includes(name), `the baseline lacks ${name}`);
    for (const prefix of ['probes/', 'observations/', 'trial-sets/', 'qualification/', `scores/${latestScore(first)}/`])
      assert.ok(
        held.some((name) => name.startsWith(prefix)),
        `the baseline holds nothing under ${prefix}`,
      );
    for (const name of held)
      for (const never of [
        'engine/',
        'faults/',
        'refused/',
        'evaluator-qualification/',
        'gap-view.json',
        'interpretation.json',
        'partitions.json',
      ])
        assert.equal(name.startsWith(never), false, `the baseline copied ${name}`);
    // The run's `trials/` is copied only as the actions artifacts the records reference, which a replay through score needs.
    assert.deepEqual(
      held.filter((name) => name.startsWith('trials/')),
      scoreReads(project.folder, first).filter((name) => name.startsWith('trials/')),
    );
    // Every qualification file is a public reference `check` verifies.
    const qualification = held.filter((name) => name.startsWith('qualification/'));
    assert.ok(qualification.length > 0);
    assert.deepEqual(
      manifest.qualification.map((reference) => reference.path).sort(),
      qualification.map((name) => `baseline/${name}`),
    );
    for (const reference of manifest.qualification) {
      assert.equal(reference.storage, 'public');
      assert.equal(reference.digest, manifest.files[reference.path.slice('baseline/'.length)]);
    }
    result = test.cli(project.folder, 'check');
    assert.equal(result.status, 0, result.output);

    // The reviewed pull request commits the baseline; an uncommitted one would make every later run dirty.
    commitAll(project.repository, 'accept the baseline');

    // Replay the accepted baseline through score in a copy. The sealed records name their actions artifacts and isolation
    // manifests as runs/<acceptedRun>/... and score refuses a reference outside the run directory it scores, so the replay
    // places the baseline's bytes at the accepted id; under any other id every record would reach outside its run.
    {
      const folder = copyOf(project);
      const runDirectory = baselines.placeBaseline(folder, firstId);
      const replayed = test.cli(folder, 'score', ['--run', firstId]);
      assert.equal(replayed.status, 0, replayed.output);
      const scores = fs.readdirSync(path.join(runDirectory, 'scores')).sort();
      assert.equal(scores.length, 2, 'the replay did not score into a directory of its own');
      for (const probeId of read(path.join(runDirectory, 'trial-sets.json')).trialSets.map((set) => set.probeId)) {
        const produced = fs.readFileSync(path.join(runDirectory, 'scores', scores[1], probeId, 'evidence-artifact.json'));
        const accepted = fs.readFileSync(path.join(baseline, 'scores', manifest.scoreInvocationId, probeId, 'evidence-artifact.json'));
        assert.equal(produced.equals(accepted), true, `the replay of ${probeId} did not reproduce the accepted evidence bytes`);
      }
    }

    // Revert check: a baseline without its isolation manifests replays as Invalid, exit 3.
    {
      const folder = copyOf(project);
      baselines.placeBaseline(folder, firstId, ['isolation-manifest.json']);
      const replayed = test.cli(folder, 'score', ['--run', firstId]);
      assert.equal(replayed.status, 3, replayed.output);
      assert.match(replayed.output, /isolation manifest .* is absent/);
    }

    // An accept killed while staging (SIGKILL, so no cleanup runs) leaves its staging directory and its lock under the
    // gitignored runs/, so the next run is not dirty. The accept re-records the same run: the baseline is unchanged.
    {
      const before = treeOf(baseline);
      const killed = wrapped(project.folder, 'kill', {}, ['--accept', '--run', firstId]);
      assert.equal(killed.status, null, `the accept was not killed: ${killed.output}`);
      assert.ok(
        leftovers(project.folder).some((name) => name.startsWith('staging-')),
        'the killed accept left no staging directory',
      );
      assert.deepEqual(treeOf(baseline), before);
    }

    // Compare with equal keys: a second run over one probe set compares to the engine's own relation.
    const second = runAndScore(project);
    const secondId = path.basename(second);
    assert.notEqual(secondId, firstId);
    assert.equal(read(path.join(second, 'run.json')).dirty, false, 'a killed accept made the next run dirty');
    {
      const { compareDominance } = engine;
      const floor = read(path.join(second, 'scoring-policy.json')).severityFloor;
      const treeBefore = treeOf(baseline);
      result = test.cli(project.folder, 'compare', ['--run', secondId]);
      assert.equal(result.status, 0, result.output);
      assert.match(result.output, /compared: 2 probe\(s\)/);
      for (const probeId of ['P-001', 'P-002']) {
        const a = evidenceOf(baseline, probeId);
        const b = evidenceOf(second, probeId);
        assert.equal(a.comparabilityKey, b.comparabilityKey, `${probeId}: two runs over one probe set carry different keys`);
        assert.ok(
          result.output.includes(`${probeId}: ${compareDominance(a, b, floor)} (`),
          `${probeId}: not the engine's relation\n${result.output}`,
        );
      }
      // The command compares and writes nothing: what the killed accept left is still there.
      assert.deepEqual(treeOf(baseline), treeBefore);
      assert.ok(leftovers(project.folder).length > 0, 'a plain compare deleted what the killed accept left');
      // The killed accept's lock stays: the next accept refuses and gives the remedy, then succeeds once the directory is
      // deleted, and it deletes the stale staging directory.
      const before = treeOf(baseline);
      const lock = path.join(project.folder, 'runs', '.compare-staging.lock');
      assert.equal(fs.existsSync(lock), true, 'the killed accept left no lock');
      result = test.cli(project.folder, 'compare', ['--accept', '--run', firstId]);
      assert.equal(result.status, 12, result.output);
      assert.match(result.output, /holds runs\/\.compare-staging\.lock.*delete that directory and run the accept again/);
      assert.deepEqual(treeOf(baseline), before);
      fs.rmSync(lock, { recursive: true });
      result = test.cli(project.folder, 'compare', ['--accept', '--run', firstId]);
      assert.equal(result.status, 0, result.output);
      assert.deepEqual(leftovers(project.folder), []);
      assert.deepEqual(treeOf(baseline), before);
    }

    // Revert check: a run that differs from the baseline only in evalQualityVersion is refused, never given a relation.
    {
      const folder = copyOf(project);
      const runDirectory = path.join(folder, 'runs', secondId);
      const record = read(path.join(runDirectory, 'run.json'));
      fs.writeFileSync(path.join(runDirectory, 'run.json'), `${JSON.stringify({ ...record, evalQualityVersion: '3.9.9' }, null, 2)}\n`);
      for (const probeId of ['P-001', 'P-002'])
        assert.equal(
          evidenceOf(path.join(folder, 'baseline'), probeId).comparabilityKey,
          evidenceOf(runDirectory, probeId).comparabilityKey,
        );
      result = test.cli(folder, 'compare', ['--run', secondId]);
      assert.equal(result.status, 0, result.output);
      assert.match(result.output, /refused: /);
      assert.ok(
        result.output.includes(`eval-quality version differs (${record.evalQualityVersion} vs 3.9.9)`),
        `the refusal does not name both versions\n${result.output}`,
      );
      assert.match(result.output, /compare --accept/);
      assert.doesNotMatch(result.output, /(a-dominates-b|b-dominates-a|equivalent|incomparable) \(a is/);
    }

    // A changed scoring policy changes the comparabilityKey: refused, the reason names both keys, exit 0.
    {
      const changed = test.project('compare-policy', ({ folder }) => {
        const file = path.join(folder, 'policy/scoring-policy.json');
        fs.writeFileSync(file, `${JSON.stringify({ ...read(file), catchThreshold: 0.75 }, null, 2)}\n`);
      });
      const other = runAndScore(changed);
      fs.cpSync(baseline, path.join(changed.folder, 'baseline'), { recursive: true });
      result = test.cli(changed.folder, 'compare', ['--run', path.basename(other)]);
      assert.equal(result.status, 0, result.output);
      assert.match(result.output, /refused: /);
      const wanted = evidenceOf(baseline, 'P-001').comparabilityKey;
      const got = evidenceOf(other, 'P-001').comparabilityKey;
      assert.notEqual(wanted, got);
      assert.ok(result.output.includes(wanted) && result.output.includes(got), `the refusal does not name both keys\n${result.output}`);
    }

    // A partition other than the baseline's is refused, naming it.
    {
      const ran = test.cli(project.folder, 'run', ['--partition', 'development']);
      assert.equal(ran.status, 0, ran.output);
      const development = test.latest(project.folder);
      const scored = test.cli(project.folder, 'score', ['--run', path.basename(development)]);
      assert.equal(scored.status, 0, scored.output);
      result = test.cli(project.folder, 'compare', ['--run', path.basename(development)]);
      assert.equal(result.status, 0, result.output);
      assert.match(result.output, /refused: the partitions differ \(the baseline holds "both", this run "development"\)/);
    }

    // A link or another non-regular entry under baseline/ is refused, naming it.
    {
      const folder = copyOf(project);
      fs.symlinkSync(os.tmpdir(), path.join(folder, 'baseline', 'probes', 'planted'));
      result = test.cli(folder, 'compare', ['--run', secondId]);
      assert.equal(result.status, 10, result.output);
      assert.match(result.output, /baseline\/probes\/planted: \[baseline-file\]/);
      assert.doesNotMatch(result.output, /compared: |refused: |first-run: /);
    }

    // A run with a link among its members is refused, naming the entry, with the old baseline untouched.
    {
      const folder = copyOf(project);
      fs.symlinkSync(os.tmpdir(), path.join(folder, 'runs', secondId, 'probes', 'planted'));
      const before = treeOf(path.join(folder, 'baseline'));
      result = test.cli(folder, 'compare', ['--accept', '--run', secondId]);
      assert.equal(result.status, 10, result.output);
      assert.match(result.output, /probes\/planted: \[run-file\]/);
      assert.deepEqual(treeOf(path.join(folder, 'baseline')), before);
      assert.deepEqual(leftovers(folder), []);
    }

    // A partly scored run is refused, naming the probe, with nothing written.
    {
      const folder = copyOf(project);
      const runDirectory = path.join(folder, 'runs', secondId);
      fs.rmSync(path.join(runDirectory, 'scores', latestScore(runDirectory), 'P-002', 'evidence-artifact.json'));
      const before = treeOf(path.join(folder, 'baseline'));
      result = test.cli(folder, 'compare', ['--accept', '--run', secondId]);
      assert.equal(result.status, 10, result.output);
      assert.match(result.output, /P-002\/evidence-artifact\.json: \[evidence\] probe P-002 has no evidence artifact/);
      assert.deepEqual(treeOf(path.join(folder, 'baseline')), before);
      assert.deepEqual(leftovers(folder), []);
      result = test.cli(folder, 'compare', ['--run', secondId]);
      assert.equal(result.status, 10, result.output);
    }

    // A baseline file that parses to null or to anything but an object blames the baseline, naming it.
    for (const text of ['null', '[]', '7']) {
      const folder = copyOf(project);
      fs.writeFileSync(path.join(folder, 'baseline', 'run.json'), `${text}\n`);
      result = test.cli(folder, 'compare', ['--run', secondId]);
      assert.equal(result.status, 10, `${text}: ${result.output}`);
      assert.match(result.output, /baseline\/run\.json: \[baseline-file\] does not hold a JSON object/);
      assert.doesNotMatch(result.output, /compared: |refused: |first-run: /);
    }

    // The evidence artifact of the baseline is held to the engine schema: a missing required field is exit 10.
    {
      const folder = copyOf(project);
      const evidence = path.join(folder, 'baseline', 'scores', manifest.scoreInvocationId, 'P-001', 'evidence-artifact.json');
      const artifact = read(evidence);
      delete artifact.comparabilityKey;
      writeJson(evidence, artifact);
      result = test.cli(folder, 'compare', ['--run', secondId]);
      assert.equal(result.status, 10, result.output);
      assert.match(result.output, /baseline\/scores\/.*\/P-001\/evidence-artifact\.json: \[engine-schema\]/);
      assert.doesNotMatch(result.output, /compared: |refused: |first-run: /);
    }

    // The probe sets differ under one partition: refused, exit 0, naming the probe the baseline lacks.
    {
      const folder = copyOf(project);
      const indexFile = path.join(folder, 'baseline', 'trial-sets.json');
      const index = read(indexFile);
      index.trialSets = index.trialSets.filter((set) => set.probeId !== 'P-002');
      writeJson(indexFile, index);
      assert.equal(
        read(path.join(folder, 'baseline', 'run.json')).partition,
        read(path.join(folder, 'runs', secondId, 'run.json')).partition,
      );
      result = test.cli(folder, 'compare', ['--run', secondId]);
      assert.equal(result.status, 0, result.output);
      assert.match(result.output, /refused: the probe sets differ \(only the baseline scores: none; only this run scores: P-002\)/);
      assert.doesNotMatch(result.output, /compared: |a is the baseline/);
    }

    // The baseline is `a`, the run `b`: a baseline that measured stronger is `a-dominates-b`, a weaker one `b-dominates-a`.
    {
      const { compareDominance } = engine;
      const floor = read(path.join(second, 'scoring-policy.json')).severityFloor;
      const strong = evidenceOf(baseline, 'P-002');
      const weak = weakened(strong);
      assert.equal(compareDominance(strong, weak, floor), 'a-dominates-b');
      assert.equal(compareDominance(weak, strong, floor), 'b-dominates-a');
      for (const [side, expected] of [
        ['run', 'a-dominates-b'],
        ['baseline', 'b-dominates-a'],
      ]) {
        const folder = copyOf(project);
        const root = side === 'run' ? path.join(folder, 'runs', secondId) : path.join(folder, 'baseline');
        writeJson(path.join(root, 'scores', latestScore(root), 'P-002', 'evidence-artifact.json'), weak);
        result = test.cli(folder, 'compare', ['--run', secondId]);
        assert.equal(result.status, 0, result.output);
        assert.match(result.output, new RegExp(`P-002: ${expected} \\(a is the baseline, b is run ${secondId}\\)`), `${side} weakened`);
      }
    }

    // The latest score invocation is the one compared and accepted: a run scored twice counts its second score.
    {
      const folder = copyOf(project);
      const runDirectory = path.join(folder, 'runs', secondId);
      const scoredAgain = test.cli(folder, 'score', ['--run', secondId]);
      assert.equal(scoredAgain.status, 0, scoredAgain.output);
      const [firstScore, latest] = fs.readdirSync(path.join(runDirectory, 'scores')).sort();
      assert.equal(latest, latestScore(runDirectory));
      // The first invocation's evidence is weaker, so a compare that read it would report another relation for P-002.
      const { compareDominance } = engine;
      const floor = read(path.join(second, 'scoring-policy.json')).severityFloor;
      const strongEvidence = evidenceOf(runDirectory, 'P-002');
      const firstEvidence = path.join(runDirectory, 'scores', firstScore, 'P-002', 'evidence-artifact.json');
      writeJson(firstEvidence, weakened(read(firstEvidence)));
      const fromLatest = compareDominance(evidenceOf(path.join(folder, 'baseline'), 'P-002'), strongEvidence, floor);
      const fromFirst = compareDominance(evidenceOf(path.join(folder, 'baseline'), 'P-002'), read(firstEvidence), floor);
      assert.notEqual(fromLatest, fromFirst);
      result = test.cli(folder, 'compare', ['--run', secondId]);
      assert.equal(result.status, 0, result.output);
      assert.ok(
        result.output.includes(`P-002: ${fromLatest} (a is the baseline`),
        `compare did not read the latest score\n${result.output}`,
      );
      writeJson(firstEvidence, strongEvidence);
      result = test.cli(folder, 'compare', ['--accept', '--run', secondId]);
      assert.equal(result.status, 0, result.output);
      assert.equal(read(path.join(folder, 'baseline', 'baseline.json')).scoreInvocationId, latest);
      assert.deepEqual(fs.readdirSync(path.join(folder, 'baseline', 'scores')), [latest], 'the baseline holds an earlier score invocation');
    }

    // Accept copies only a run `score` would still accept: an edited sealed record is refused, exit 10, nothing written.
    {
      const folder = copyOf(project);
      const runDirectory = path.join(folder, 'runs', secondId);
      const record = path.join(runDirectory, read(path.join(runDirectory, 'trial-sets.json')).trialSets[0].records[0]);
      fs.appendFileSync(record, ' ');
      const before = treeOf(path.join(folder, 'baseline'));
      result = test.cli(folder, 'compare', ['--accept', '--run', secondId]);
      assert.equal(result.status, 10, result.output);
      assert.match(result.output, /\[run-integrity\] digests to .* not the .* run\.json recorded/);
      assert.deepEqual(treeOf(path.join(folder, 'baseline')), before);
      assert.deepEqual(leftovers(folder), []);
    }

    // A score invocation that exited 12 (its strength aggregate disagreed with run.json) is refused; a weak result, exit 2, is not.
    {
      const folder = copyOf(project);
      const runDirectory = path.join(folder, 'runs', secondId);
      const record = read(path.join(runDirectory, 'run.json'));
      writeJson(path.join(runDirectory, 'run.json'), { ...record, evalQualityVersion: '3.9.9' });
      const scoredAgain = test.cli(folder, 'score', ['--run', secondId]);
      assert.equal(scoredAgain.status, 12, scoredAgain.output);
      const recorded = read(path.join(runDirectory, 'scores', latestScore(runDirectory), 'score.json'));
      assert.equal(recorded.exitCode, 12);
      assert.equal(recorded.strengthAggregate.status, 'mismatch');
      const before = treeOf(path.join(folder, 'baseline'));
      result = test.cli(folder, 'compare', ['--accept', '--run', secondId]);
      assert.equal(result.status, 10, result.output);
      assert.match(result.output, /score\.json: \[score-record\] records exit 12.*score the run again/);
      assert.match(result.output, /\[score-record\] records its strength aggregate as mismatch/);
      assert.deepEqual(treeOf(path.join(folder, 'baseline')), before);
      assert.deepEqual(leftovers(folder), []);
      // The same invocation recorded as a FAIL result with a copied aggregate is a legitimately weak run, and is accepted.
      const scoreFile = path.join(runDirectory, 'scores', latestScore(runDirectory), 'score.json');
      writeJson(path.join(runDirectory, 'run.json'), record);
      writeJson(scoreFile, { ...recorded, exitCode: 2, strengthAggregate: { ...recorded.strengthAggregate, status: 'copied' } });
      result = test.cli(folder, 'compare', ['--accept', '--run', secondId]);
      assert.equal(result.status, 0, result.output);
    }

    // A directory above a file the accept reads that is a link is followed by no read: exit 10, naming it, nothing written.
    {
      const folder = copyOf(project);
      const runDirectory = path.join(folder, 'runs', secondId);
      const outside = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'tea-evaluate-compare-outside-'));
      copies.push(outside);
      fs.renameSync(path.join(runDirectory, 'trials'), path.join(outside, 'trials'));
      fs.symlinkSync(path.join(outside, 'trials'), path.join(runDirectory, 'trials'));
      const before = treeOf(path.join(folder, 'baseline'));
      result = test.cli(folder, 'compare', ['--accept', '--run', secondId]);
      assert.equal(result.status, 10, result.output);
      assert.match(result.output, /trials: \[run-file\] is a link or a file where a directory is required/);
      assert.deepEqual(treeOf(path.join(folder, 'baseline')), before);
      assert.deepEqual(leftovers(folder), []);
    }
    {
      const folder = copyOf(project);
      const runs = path.join(folder, 'runs');
      fs.renameSync(path.join(runs, secondId), path.join(runs, 'zz-real'));
      fs.symlinkSync(path.join(runs, 'zz-real'), path.join(runs, secondId));
      const before = treeOf(path.join(folder, 'baseline'));
      for (const args of [
        ['--run', secondId],
        ['--accept', '--run', secondId],
      ]) {
        result = test.cli(folder, 'compare', args);
        assert.equal(result.status, 10, `${args.join(' ')}: ${result.output}`);
        assert.match(result.output, new RegExp(`runs/${secondId}: \\[run-file\\] is a link or a file where a directory is required`));
        assert.doesNotMatch(result.output, /compared: |refused: |first-run: |accepted: /);
      }
      assert.deepEqual(treeOf(path.join(folder, 'baseline')), before);
    }

    // A directory above an evidence artifact that is a link is followed by no read, in a plain compare as in an accept.
    {
      const folder = copyOf(project);
      const runDirectory = path.join(folder, 'runs', secondId);
      const probeDirectory = path.join(runDirectory, 'scores', latestScore(runDirectory), 'P-001');
      const outside = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'tea-evaluate-compare-outside-'));
      copies.push(outside);
      fs.renameSync(probeDirectory, path.join(outside, 'P-001'));
      fs.symlinkSync(path.join(outside, 'P-001'), probeDirectory);
      result = test.cli(folder, 'compare', ['--run', secondId]);
      assert.equal(result.status, 10, result.output);
      assert.match(result.output, /scores\/.*\/P-001: \[evidence\] is a link or a file where a directory is required/);
      assert.doesNotMatch(result.output, /compared: |refused: |first-run: /);
    }

    // The latest score.json must be the record of this run's invocation, and an object.
    for (const [label, edit, expected] of [
      [
        'another run',
        (value) => ({ ...value, run: 'some-other-run' }),
        /score\.json: \[score-record\] names run "some-other-run".*score the run again/,
      ],
      [
        'another invocation',
        (value) => ({ ...value, invocationId: 'some-other-invocation' }),
        /\[score-record\] names score invocation "some-other-invocation"/,
      ],
      ['null', () => null, /\[score-record\] does not hold a JSON object/],
    ]) {
      const folder = copyOf(project);
      const runDirectory = path.join(folder, 'runs', secondId);
      const file = path.join(runDirectory, 'scores', latestScore(runDirectory), 'score.json');
      writeJson(file, edit(read(file)));
      const before = treeOf(path.join(folder, 'baseline'));
      result = test.cli(folder, 'compare', ['--accept', '--run', secondId]);
      assert.equal(result.status, 10, `${label}: ${result.output}`);
      assert.match(result.output, expected, label);
      assert.deepEqual(treeOf(path.join(folder, 'baseline')), before, label);
    }

    // score's own input checks run over the run: an index off its schema, and an operation phase snapshot that disagrees
    // with the contract (a snapshot sealed that way, so every digest still matches and only the phase check can see it).
    {
      const folder = copyOf(project);
      const indexFile = path.join(folder, 'runs', secondId, 'trial-sets.json');
      const index = read(indexFile);
      delete index.corpusDigest;
      writeJson(indexFile, index);
      result = test.cli(folder, 'compare', ['--accept', '--run', secondId]);
      assert.equal(result.status, 10, result.output);
      assert.match(result.output, /trial-sets\.json: \[schema\] .*corpusDigest/);
    }
    {
      const folder = copyOf(project);
      const runDirectory = path.join(folder, 'runs', secondId);
      const phasesFile = path.join(runDirectory, 'operation-phases.json');
      const phases = read(phasesFile);
      phases[Object.keys(phases)[0]]['undeclared-operation'] = 'process';
      writeJson(phasesFile, phases);
      const record = read(path.join(runDirectory, 'run.json'));
      writeJson(path.join(runDirectory, 'run.json'), {
        ...record,
        operationPhases: phases,
        artifacts: { ...record.artifacts, operationPhases: engine.digestBytes(fs.readFileSync(phasesFile)) },
      });
      const before = treeOf(path.join(folder, 'baseline'));
      result = test.cli(folder, 'compare', ['--accept', '--run', secondId]);
      assert.equal(result.status, 10, result.output);
      assert.match(result.output, /run\.json: \[operation-phases\] run\.json classifies undeclared operation undeclared-operation/);
      assert.deepEqual(treeOf(path.join(folder, 'baseline')), before);
    }

    // An actions artifact whose bytes differ from the digest its record names is not copied.
    {
      const folder = copyOf(project);
      const runDirectory = path.join(folder, 'runs', secondId);
      const record = read(path.join(runDirectory, read(path.join(runDirectory, 'trial-sets.json')).trialSets[0].records[0]));
      const actions = path.join(folder, record.actionsArtifact.path);
      fs.appendFileSync(actions, ' ');
      const before = treeOf(path.join(folder, 'baseline'));
      result = test.cli(folder, 'compare', ['--accept', '--run', secondId]);
      assert.equal(result.status, 10, result.output);
      assert.match(result.output, /trials\/.*: \[run-file\] digests to .* not the .* the record that references it recorded/);
      assert.deepEqual(treeOf(path.join(folder, 'baseline')), before);
    }

    // An accept interrupted between its two renames leaves baseline/ absent and the old one retired. A plain compare is
    // read-only: it exits 10 naming the retired copy and deletes nothing.
    {
      const folder = copyOf(project);
      const scratch = path.join(folder, 'runs', '.compare-staging');
      fs.mkdirSync(path.join(scratch, 'staging-dead0002'), { recursive: true });
      fs.writeFileSync(path.join(scratch, 'staging-dead0002', 'half-written.json'), '{');
      fs.renameSync(path.join(folder, 'baseline'), path.join(scratch, 'retired-cafe0001'));
      const before = treeOf(scratch);
      result = test.cli(folder, 'compare', ['--run', secondId]);
      assert.equal(result.status, 10, result.output);
      assert.match(result.output, /runs\/\.compare-staging\/retired-cafe0001: \[interrupted-accept\]/);
      assert.match(result.output, /compare --accept restores it/);
      assert.doesNotMatch(result.output, /compared: |refused: |first-run: /);
      assert.deepEqual(treeOf(scratch), before, 'a plain compare changed what the interrupted accept left');
      assert.equal(fs.existsSync(path.join(folder, 'baseline')), false);
      // The next accept restores it first: even one that is then refused leaves the old baseline in place and the scratch empty.
      const runDirectory = path.join(folder, 'runs', secondId);
      fs.rmSync(path.join(runDirectory, 'scores', latestScore(runDirectory), 'P-002', 'evidence-artifact.json'));
      result = test.cli(folder, 'compare', ['--accept', '--run', secondId]);
      assert.equal(result.status, 10, result.output);
      assert.deepEqual(
        filesOf(path.join(folder, 'baseline')),
        filesOf(path.join(project.folder, 'baseline')),
        'the retired baseline was not put back',
      );
      assert.deepEqual(leftovers(folder), []);
    }
    // A put-back that fails reports where the old baseline really is.
    {
      const folder = copyOf(project);
      const scratch = path.join(folder, 'runs', '.compare-staging');
      fs.mkdirSync(scratch, { recursive: true });
      fs.renameSync(path.join(folder, 'baseline'), path.join(scratch, 'retired-cafe0001'));
      const failed = wrapped(folder, 'strand', {}, ['--accept', '--run', secondId]);
      assert.equal(failed.status, 12, failed.output);
      assert.match(failed.output, /baseline\/ is absent: an earlier accept stopped.*runs\/\.compare-staging\/retired-cafe0001.*by hand/);
      assert.doesNotMatch(failed.output, /is as it was/);
      assert.deepEqual(fs.readdirSync(scratch), ['retired-cafe0001']);
      assert.deepEqual(
        leftovers(folder).filter((name) => name.includes('lock')),
        [],
        'the failed accept kept its lock',
      );
    }
    // A swap whose put-back fails too says baseline/ is absent and where the old one lies; the next accept restores it.
    {
      const folder = copyOf(project);
      const failed = wrapped(folder, 'strand');
      assert.equal(failed.status, 12, failed.output);
      assert.match(failed.output, /baseline\/ is absent and the previous baseline lies at runs\/\.compare-staging\/retired-/);
      assert.match(failed.output, /the next compare --accept puts it back/);
      assert.doesNotMatch(failed.output, /is as it was/);
      assert.equal(fs.existsSync(path.join(folder, 'baseline')), false);
      result = test.cli(folder, 'compare', ['--accept', '--run', secondId]);
      assert.equal(result.status, 0, result.output);
      assert.equal(read(path.join(folder, 'baseline', 'baseline.json')).acceptedRun, secondId);
      assert.deepEqual(leftovers(folder), []);
    }
    // A plain compare that runs between the two renames of an accept finds baseline/ absent: it exits 10 and deletes nothing,
    // so the accept's swap completes and its message is true. A compare that restored or deleted would remove both copies.
    {
      const folder = copyOf(project);
      const out = path.join(path.dirname(folder), 'probe.json');
      const accepted = wrapped(
        folder,
        'probe',
        { TEA_BASELINE_PROBE_ARGS: JSON.stringify(['--run', secondId]), TEA_BASELINE_PROBE_OUT: out },
        ['--accept', '--run', secondId],
      );
      assert.equal(accepted.status, 0, accepted.output);
      assert.match(accepted.output, /accepted: run /);
      const probe = read(out);
      assert.equal(probe.status, 10, probe.output);
      assert.match(probe.output, /runs\/\.compare-staging\/retired-.*\[interrupted-accept\]/);
      assert.equal(read(path.join(folder, 'baseline', 'baseline.json')).acceptedRun, secondId);
      assert.deepEqual(leftovers(folder), []);
      result = test.cli(folder, 'check');
      assert.equal(result.status, 0, result.output);
    }
    // A second accept while a live process holds the lock exits 12 naming the holder and changes nothing.
    {
      const folder = copyOf(project);
      const lock = path.join(folder, 'runs', '.compare-staging.lock');
      fs.mkdirSync(lock);
      fs.writeFileSync(path.join(lock, 'pid'), `${process.pid}\n`);
      const before = treeOf(path.join(folder, 'baseline'));
      result = test.cli(folder, 'compare', ['--accept', '--run', secondId]);
      assert.equal(result.status, 12, result.output);
      assert.match(result.output, new RegExp(`holds runs/\\.compare-staging\\.lock \\(pid ${process.pid}\\)`));
      assert.deepEqual(treeOf(path.join(folder, 'baseline')), before);
      assert.equal(fs.existsSync(lock), true, "the refused accept removed the other holder's lock");
      // A plain compare does not take the lock.
      result = test.cli(folder, 'compare', ['--run', secondId]);
      assert.equal(result.status, 0, result.output);
    }
    // A leftover lock directory (an accept that was killed) refuses the accept with the remedy; once it is deleted, the accept runs.
    {
      const folder = copyOf(project);
      const lock = path.join(folder, 'runs', '.compare-staging.lock');
      fs.mkdirSync(lock);
      const before = treeOf(path.join(folder, 'baseline'));
      result = test.cli(folder, 'compare', ['--accept', '--run', secondId]);
      assert.equal(result.status, 12, result.output);
      assert.match(
        result.output,
        /holds runs\/\.compare-staging\.lock; if none is running \(an earlier accept was killed\), delete that directory/,
      );
      assert.deepEqual(treeOf(path.join(folder, 'baseline')), before);
      fs.rmSync(lock, { recursive: true });
      result = test.cli(folder, 'compare', ['--accept', '--run', secondId]);
      assert.equal(result.status, 0, result.output);
      assert.equal(read(path.join(folder, 'baseline', 'baseline.json')).acceptedRun, secondId);
      assert.deepEqual(leftovers(folder), []);
    }
    // A lock entry that is a file refuses the same way, and a linked runs/ is a real error text, never a stack trace.
    {
      const folder = copyOf(project);
      fs.writeFileSync(path.join(folder, 'runs', '.compare-staging.lock'), 'x');
      result = test.cli(folder, 'compare', ['--accept', '--run', secondId]);
      assert.equal(result.status, 12, result.output);
      assert.match(result.output, /delete that directory/);
      const linked = copyOf(project);
      fs.renameSync(path.join(linked, 'runs'), path.join(linked, 'runs-real'));
      fs.symlinkSync(path.join(linked, 'runs-real'), path.join(linked, 'runs'));
      result = test.cli(linked, 'compare', ['--accept', '--run', secondId]);
      assert.equal(result.status, 12, result.output);
      assert.match(result.output, /runs is a link or a file where a directory is required/);
      assert.equal(fs.existsSync(path.join(linked, 'runs-real', '.compare-staging.lock')), false);
    }
    // Three accepts at once over one scored project: the one that holds the lock (stalled by the wrapper) finishes, the others
    // exit 12 with the lock message and no stack trace, and the baseline passes check with no staging or retired leftovers.
    {
      const folder = copyOf(project);
      const results = await Promise.all(
        [1, 2, 3].map(
          () =>
            new Promise((resolve) => {
              const child = spawn(
                process.execPath,
                ['--require', STAGING_WRAPPER, CLI, 'compare', '--evaluation', folder, '--accept', '--run', secondId],
                { cwd: path.join(__dirname, '..'), env: { ...process.env, TEA_BASELINE_FAIL: 'hold' } },
              );
              let output = '';
              child.stdout.on('data', (chunk) => (output += chunk));
              child.stderr.on('data', (chunk) => (output += chunk));
              child.on('close', (status) => resolve({ status, output }));
            }),
        ),
      );
      const statuses = results.map((one) => one.status).sort();
      assert.deepEqual(statuses, [0, 12, 12], JSON.stringify(results));
      for (const lost of results.filter((one) => one.status === 12)) {
        assert.match(lost.output, /another tea-evaluate compare --accept holds runs\/\.compare-staging\.lock/);
        assert.doesNotMatch(lost.output, /\n\s+at .*:\d+:\d+\)?/, 'a losing accept printed a stack trace');
      }
      assert.equal(read(path.join(folder, 'baseline', 'baseline.json')).acceptedRun, secondId);
      assert.deepEqual(leftovers(folder), []);
      result = test.cli(folder, 'check');
      assert.equal(result.status, 0, result.output);
    }
    // Ctrl-C mid-staging removes the lock and exits 130; the staging leftover stays for the next accept's recovery.
    {
      const folder = copyOf(project);
      const before = treeOf(path.join(folder, 'baseline'));
      const interrupted = wrapped(folder, 'sigint', {}, ['--accept', '--run', secondId]);
      assert.equal(interrupted.status, 130, interrupted.output);
      const left = leftovers(folder);
      assert.equal(
        left.some((name) => name.includes('lock')),
        false,
        'the interrupted accept left its lock',
      );
      assert.equal(
        left.some((name) => name.startsWith('staging-')),
        true,
        'the interrupted accept left no staging directory to recover',
      );
      assert.deepEqual(treeOf(path.join(folder, 'baseline')), before);
      result = test.cli(folder, 'compare', ['--accept', '--run', secondId]);
      assert.equal(result.status, 0, result.output);
      assert.deepEqual(leftovers(folder), []);
    }

    // An accept that fails while staging or swapping leaves the old baseline byte-identical and nothing behind.
    for (const [mode, expectation] of [
      ['write', /could not be written/],
      ['rename', /could not be written/],
    ]) {
      const folder = copyOf(project);
      const before = treeOf(path.join(folder, 'baseline'));
      const failed = wrapped(folder, mode);
      assert.equal(failed.status, 12, `${mode}: ${failed.output}`);
      assert.match(failed.output, expectation);
      assert.deepEqual(treeOf(path.join(folder, 'baseline')), before, `${mode}: the old baseline changed`);
      assert.deepEqual(leftovers(folder), [], `${mode}: left a staging or retired directory`);
      // With no old baseline, the failure leaves none.
      const fresh = copyOf(project);
      fs.rmSync(path.join(fresh, 'baseline'), { recursive: true });
      const freshFailed = wrapped(fresh, mode);
      assert.equal(freshFailed.status, 12, `${mode}: ${freshFailed.output}`);
      assert.equal(fs.existsSync(path.join(fresh, 'baseline')), false);
      assert.deepEqual(leftovers(fresh), []);
    }

    // The second accept replaces baseline/ wholesale and the folder still checks.
    {
      const folder = copyOf(project);
      fs.writeFileSync(path.join(folder, 'baseline', 'stale.json'), '{}\n');
      result = test.cli(folder, 'compare', ['--accept', '--run', secondId]);
      assert.equal(result.status, 0, result.output);
      assert.equal(fs.existsSync(path.join(folder, 'baseline', 'stale.json')), false, 'a file of the old baseline survived');
      assert.equal(read(path.join(folder, 'baseline', 'baseline.json')).acceptedRun, secondId);
      assert.deepEqual(leftovers(folder), []);
      result = test.cli(folder, 'check');
      assert.equal(result.status, 0, result.output);
      // A qualification file changed after the accept is a digest `check` refuses.
      const file = path.join(folder, 'baseline', 'qualification', 'P-001', 'baseline-pass.json');
      fs.appendFileSync(file, ' ');
      result = test.cli(folder, 'check');
      assert.equal(result.status, 10, result.output);
      assert.match(result.output, /\[qualification-digest\]/);
    }

    // A run with no score invocation exits 64; a dirty run exits 10 and writes nothing (Story 1.16's retained run is the live case).
    {
      const dirty = test.project('compare-dirty');
      fs.writeFileSync(path.join(dirty.repository, 'vendor/extra.txt'), 'uncommitted\n');
      const ran = test.cli(dirty.folder, 'run', ['--from-working-tree']);
      assert.equal(ran.status, 0, ran.output);
      const dirtyRun = test.latest(dirty.folder);
      assert.equal(read(path.join(dirtyRun, 'run.json')).dirty, true);
      for (const args of [[], ['--accept']]) {
        result = test.cli(dirty.folder, 'compare', args);
        assert.equal(result.status, 64, `unscored ${args.join(' ')}: ${result.output}`);
        assert.match(result.output, /has no score invocation/);
      }
      const scored = test.cli(dirty.folder, 'score', ['--run', path.basename(dirtyRun)]);
      assert.equal(scored.status, 0, scored.output);
      // Without a baseline, nothing appears.
      result = test.cli(dirty.folder, 'compare', ['--accept']);
      assert.equal(result.status, 10, result.output);
      assert.match(result.output, /run\.json: \[dirty\]/);
      assert.equal(fs.existsSync(path.join(dirty.folder, 'baseline')), false, 'a dirty run wrote baseline/');
      assert.deepEqual(leftovers(dirty.folder), []);
      // With one, the old baseline is byte-identical afterwards.
      fs.cpSync(baseline, path.join(dirty.folder, 'baseline'), { recursive: true });
      const before = treeOf(path.join(dirty.folder, 'baseline'));
      result = test.cli(dirty.folder, 'compare', ['--accept']);
      assert.equal(result.status, 10, result.output);
      assert.deepEqual(treeOf(path.join(dirty.folder, 'baseline')), before);
      // A dirty run compares: it is only never accepted.
      result = test.cli(dirty.folder, 'compare');
      assert.equal(result.status, 0, result.output);
    }

    // Wiring: no evaluation, an unknown run, no second flag.
    assert.equal(spawnSync(process.execPath, [CLI, 'compare'], { encoding: 'utf8' }).status, 64);
    result = test.cli(project.folder, 'compare', ['--run', 'no-such-run']);
    assert.equal(result.status, 64, result.output);
    result = test.cli(project.folder, 'compare', ['--accept', '--force']);
    assert.equal(result.status, 64, result.output);

    process.stdout.write('Evaluate compare and baseline acceptance passed.\n');
  } finally {
    test.cleanup();
    for (const copy of copies) fs.rmSync(copy, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
