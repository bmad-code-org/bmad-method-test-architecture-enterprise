'use strict';

/**
 * `tea-evaluate compare` and `compare --accept` (Story 2.1, AD-12), run through the
 * real CLI over real eval-quality and real clean runs of the verdict fixture.
 *
 * Every case builds its own copy of a scored project and mutates the copy, never a
 * committed fixture. The revert checks the story names are each one case:
 *  - the `evalQualityVersion`-only refusal (a relation without TeA's refusal),
 *  - the replay of an accepted baseline without its isolation manifests (exit 3),
 *  - the dirty refusal (an accepted dirty run writes `baseline/`).
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const AjvModule = require('ajv/dist/2020');

const { loadEngine } = require('../cli/lib/evaluate/engine');
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

/** A copy of a project's repository in a temp directory of its own; the evaluation folder inside it. */
function copyOf(project) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'tea-evaluate-compare-copy-'));
  copies.push(root);
  fs.cpSync(project.repository, path.join(root, 'repository'), { recursive: true });
  return path.join(root, 'repository', path.relative(project.repository, project.folder));
}

/** Commits the repository's current state, as the reviewed pull request that accepts a baseline does. */
function commitAll(repository, message) {
  const git = ['-c', 'user.name=TeA test', '-c', 'user.email=tea-test@example.test', '-c', 'core.hooksPath=/dev/null'];
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };
  for (const args of [
    ['add', '--all'],
    ['commit', '--quiet', '-m', message],
  ]) {
    const run = spawnSync('git', [...git, '-C', repository, ...args], { encoding: 'utf8', env });
    assert.equal(run.status, 0, `${args.join(' ')}: ${run.stderr}`);
  }
}

function runAndScore(project, runArgs = []) {
  const ran = test.cli(project.folder, 'run', runArgs, project.env);
  assert.equal(ran.status, 0, ran.output);
  const run = test.latest(project.folder);
  const scored = test.cli(project.folder, 'score', ['--run', path.basename(run)], project.env);
  assert.equal(scored.status, 0, scored.output);
  return run;
}

/** `compare` through the CLI with a failure injected by the staging wrapper. */
function wrapped(folder, mode, extraEnv = {}) {
  const run = spawnSync(process.execPath, ['--require', STAGING_WRAPPER, CLI, 'compare', '--evaluation', folder, '--accept'], {
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

/** What no stray entry of an accept may leave beside `baseline/`. */
function leftovers(folder) {
  return fs.readdirSync(folder).filter((name) => name.startsWith('.baseline-'));
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

    // Replay the accepted baseline through score in a copy.
    {
      const folder = copyOf(project);
      const runDirectory = path.join(folder, 'runs', firstId);
      fs.rmSync(runDirectory, { recursive: true });
      fs.cpSync(path.join(folder, 'baseline'), runDirectory, {
        recursive: true,
        filter: (file) => path.basename(file) !== 'baseline.json',
      });
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
      const runDirectory = path.join(folder, 'runs', firstId);
      fs.rmSync(runDirectory, { recursive: true });
      fs.cpSync(path.join(folder, 'baseline'), runDirectory, {
        recursive: true,
        filter: (file) => path.basename(file) !== 'baseline.json' && path.basename(file) !== 'isolation-manifest.json',
      });
      const replayed = test.cli(folder, 'score', ['--run', firstId]);
      assert.equal(replayed.status, 3, replayed.output);
      assert.match(replayed.output, /isolation manifest .* is absent/);
    }

    // Compare with equal keys: a second run over one probe set compares to the engine's own relation.
    const second = runAndScore(project);
    const secondId = path.basename(second);
    assert.notEqual(secondId, firstId);
    {
      const { compareDominance } = engine;
      const floor = read(path.join(second, 'scoring-policy.json')).severityFloor;
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
      // The command compares and writes nothing.
      assert.deepEqual(treeOf(baseline), treeOf(path.join(project.folder, 'baseline')));
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
      assert.match(result.output, /refused: .*3\.9\.9.*4\.7\.0|refused: .*4\.7\.0.*3\.9\.9/);
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
