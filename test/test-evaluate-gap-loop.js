/** Deterministic replay of the blind Evaluate gap repair (Story 1.25). */
'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { armVerdict } = require('../cli/lib/evaluate/admission');
const { corpusDigestOf } = require('../cli/lib/evaluate/corpus-index');
const { evaluateOracles } = require('../cli/lib/evaluate/evaluator');
const { degenerateArm } = require('../cli/lib/evaluate/gameability');
const { loadEngine } = require('../cli/lib/evaluate/engine');
const { registryFromEvaluation } = require('../cli/lib/evaluate/registry');
const { treeDigest } = require('../cli/lib/evaluate/workspace');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE = process.env.TEA_EVALUATE_GAP_LOOP_FIXTURE ?? path.join(__dirname, 'fixtures/evaluate-gap-loop');
const SOURCE = path.join(__dirname, 'fixtures/evaluate-authoring/test-review');
const ENGINE = path.join(ROOT, 'node_modules/.bin/eval-quality');
const EXCLUDED = new Set(['replay', 'runs', 'node_modules']);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function digest(file) {
  return `sha256:${sha256(file)}`;
}

function filesUnder(root, exclude = new Set()) {
  const visit = (folder) =>
    fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
      if (exclude.has(entry.name)) return [];
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) return visit(file);
      assert.ok(entry.isFile(), `${file} must be a regular file`);
      return [path.relative(root, file).split(path.sep).join('/')];
    });
  return visit(root).sort();
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
  assert.equal(result.error, undefined, `${command} could not start: ${result.error}`);
  assert.equal(result.status, 0, `${command} ${args.join(' ')} exited ${result.status}\n${result.stdout}\n${result.stderr}`);
}

function sameBytes(actual, expected, label) {
  assert.ok(fs.readFileSync(actual).equals(fs.readFileSync(expected)), `${label} differs from committed evidence`);
}

function checkInventory() {
  const inventory = readJson(path.join(FIXTURE, 'source-inventory.json'));
  assert.equal(inventory.schemaVersion, 1);
  const actual = ['before', 'after'].flatMap((phase) => {
    const phaseRoot = path.join(FIXTURE, phase);
    return filesUnder(phaseRoot, EXCLUDED).map((file) => `${phase}/${file}`);
  });
  assert.deepEqual(Object.keys(inventory.hashes).sort(), actual.sort(), 'source inventory misses an authored file');
  for (const [file, hash] of Object.entries(inventory.hashes)) {
    assert.equal(sha256(path.join(FIXTURE, file)), hash, `${file} changed after evidence capture`);
  }
  assert.equal(
    treeDigest(path.join(FIXTURE, 'before/target')),
    treeDigest(path.join(FIXTURE, 'after/target')),
    'the frozen target changed',
  );
  assert.equal(treeDigest(path.join(FIXTURE, 'before/target')), treeDigest(path.join(SOURCE, 'target')));
  for (const phase of ['before', 'after']) {
    sameBytes(
      path.join(FIXTURE, phase, 'evaluation/requirements.md'),
      path.join(SOURCE, 'evaluation/requirements.md'),
      `${phase} confirmed requirements`,
    );
  }
}

function checkReplayManifest(folder, expectedRuns) {
  const replay = path.join(folder, 'replay');
  const manifest = readJson(path.join(replay, 'manifest.json'));
  assert.deepEqual(manifest.runs, expectedRuns);
  assert.deepEqual(
    Object.keys(manifest.hashes).sort(),
    filesUnder(replay)
      .filter((file) => file !== 'manifest.json')
      .map((file) => `replay/${file}`),
    'replay manifest misses an input or evidence file',
  );
  for (const [file, hash] of Object.entries(manifest.hashes)) {
    assert.equal(sha256(path.join(folder, file)), hash, `${file} changed after capture`);
  }
}

function checkGapReport() {
  const report = fs.readFileSync(path.join(FIXTURE, 'gap-report.md'), 'utf8');
  assert.match(report, /O-003/);
  assert.match(report, /P-009/);
  assert.match(report, /malformed-input/);
  assert.match(report, /typed-file/);
  const listed = /## Changed files\n([\s\S]*?)(?=\n## |$)/
    .exec(report)?.[1]
    .split('\n')
    .map((line) => /^- `([^`]+)`$/.exec(line)?.[1])
    .filter(Boolean);
  assert.ok(listed, 'gap report needs a Changed files section');
  const before = path.join(FIXTURE, 'before/evaluation');
  const after = path.join(FIXTURE, 'after/evaluation');
  const files = new Set([...filesUnder(before, EXCLUDED), ...filesUnder(after, EXCLUDED)]);
  const changed = [...files]
    .filter((file) => {
      const left = path.join(before, file);
      const right = path.join(after, file);
      return !fs.existsSync(left) || !fs.existsSync(right) || !fs.readFileSync(left).equals(fs.readFileSync(right));
    })
    .map((file) => `evaluation/${file}`)
    .sort();
  assert.deepEqual(listed.sort(), changed, 'gap report does not account for every authored change');
  const transcript = fs.readFileSync(path.join(FIXTURE, 'session-transcript.md'), 'utf8');
  const reads = /## Files read\n([\s\S]*?)(?=\n## |$)/.exec(transcript)?.[1];
  assert.ok(reads, 'session transcript needs a Files read section');
  for (const line of reads.split('\n')) {
    const file = /^- `([^`]+)`$/.exec(line)?.[1];
    if (!file) continue;
    assert.doesNotMatch(file, /SEEDED\.md|held-out|P-01[0-3]\.probe\.json/);
  }
}

function checkBlindInputs() {
  const blind = readJson(path.join(FIXTURE, 'blind-inputs.json'));
  assert.equal(blind.schemaVersion, 1);
  const before = path.join(FIXTURE, 'before');
  const targetFiles = filesUnder(path.join(before, 'target')).map((file) => `target/${file}`);
  const evaluationFiles = filesUnder(path.join(before, 'evaluation'), EXCLUDED)
    .filter((file) => !file.startsWith('corpus/held-out/') && !/^probes\/P-01[0-3]\.probe\.json$/.test(file))
    .map((file) => `evaluation/${file}`);
  const evidenceFiles = ['gaps.md', 'evidence/w1-gameability.json', 'evidence/development-first-stop.json', 'evidence/w2-coverage.json'];
  assert.deepEqual(Object.keys(blind.initialFiles).sort(), [...targetFiles, ...evaluationFiles, ...evidenceFiles].sort());
  for (const [file, hash] of Object.entries(blind.initialFiles)) {
    assert.doesNotMatch(file, /SEEDED\.md|held-out|P-01[0-3]\.probe\.json/);
    let bytes;
    if (file === 'evaluation/evaluation.json') {
      const manifest = readJson(path.join(before, file));
      manifest.heldOutProbes = [];
      bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
    } else if (file === 'gaps.md') {
      bytes = fs.readFileSync(path.join(FIXTURE, 'blind/gaps.md'));
    } else if (file === 'evidence/w1-gameability.json') {
      bytes = fs.readFileSync(
        path.join(before, 'evaluation/replay/gameability-diagnostic/qualification/P-009/disciplined-oracle-rejected.json'),
      );
    } else if (file === 'evidence/development-first-stop.json') {
      bytes = fs.readFileSync(path.join(before, 'evaluation/replay/development-stopped/qualification/P-007/mutated-fail.json'));
    } else if (file === 'evidence/w2-coverage.json') {
      bytes = fs.readFileSync(path.join(before, 'evaluation/replay/coverage-diagnostic.json'));
    } else {
      bytes = fs.readFileSync(path.join(before, file));
    }
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), hash, `${file} blind input changed`);
  }
}

async function checkBeforeDiagnostics() {
  const folder = path.join(FIXTURE, 'before/evaluation');
  const contract = readJson(path.join(folder, 'contract.json'));
  const scoreRoot = path.join(folder, 'replay/held-out/scores');
  const scoreId = fs.readdirSync(scoreRoot).sort().at(-1);
  const scored = readJson(path.join(scoreRoot, scoreId, 'P-010/evidence-artifact.json'));
  const coverage = scored.coverageGaps.filter((gap) => !gap.satisfied);
  assert.deepEqual(
    coverage.map((gap) => gap.rule),
    ['malformed-input'],
  );
  assert.equal(coverage[0].satisfied, false);
  assert.equal(coverage[0].severity, 'critical');
  assert.deepEqual(readJson(path.join(folder, 'replay/coverage-diagnostic.json')), coverage);

  const stopped = readJson(path.join(folder, 'replay/development-stopped/run.json'));
  const firstStop = readJson(path.join(folder, 'replay/development-stopped/qualification/P-007/mutated-fail.json'));
  assert.equal(stopped.outcome.stage, 'qualification');
  assert.equal(stopped.outcome.exitCode, 11);
  assert.match(stopped.outcome.message, /P-007.*mutated arm did not fail/);
  assert.equal(firstStop.verdict, 'held');
  assert.equal(firstStop.oracles.find((oracle) => oracle.oracleId === 'O-003')?.disposition, 'held');
  sameBytes(path.join(folder, 'contract.json'), path.join(folder, 'replay/development-stopped/contract.json'), 'first-stop contract');

  const probe = readJson(path.join(folder, 'probes/P-009.probe.json'));
  const responseFile = path.join(folder, 'corpus/gameability/P-009.json');
  const response = readJson(responseFile);
  const evaluation = readJson(path.join(folder, 'evaluation.json'));
  const registry = registryFromEvaluation(evaluation, { root: path.join(FIXTURE, 'before/target') });
  const arm = await degenerateArm({ contract, registry, steps: response.steps, label: 'degenerate', provenance: 'baseline' });
  const policy = readJson(path.join(folder, 'policy/scoring-policy.json'));
  const oracles = await evaluateOracles({
    contract,
    stepObservations: arm.stepObservations,
    oracleIds: ['O-003'],
    regexMatchStepBudget: policy.regexMatchStepBudget,
  });
  const engine = await loadEngine();
  const generated = {
    probeId: probe.probeId,
    phase: 'disciplined-oracle-rejected',
    degenerateResponse: { path: 'corpus/gameability/P-009.json', digest: engine.digestBytes(fs.readFileSync(responseFile)) },
    verdict: armVerdict(oracles),
    oracles,
    steps: arm.steps,
  };
  assert.equal(generated.verdict, 'held', 'seeded gameability weakness disappeared');
  assert.deepEqual(
    generated,
    readJson(path.join(folder, 'replay/gameability-diagnostic/qualification/P-009/disciplined-oracle-rejected.json')),
    'gameability qualification no longer reproduces',
  );
  sameBytes(path.join(folder, 'contract.json'), path.join(folder, 'replay/gameability-diagnostic/contract.json'), 'gameability contract');
}

function authoredProbeFields(probe, keys) {
  return Object.fromEntries(
    keys
      .filter((key) => key !== 'qualification')
      .map((key) => {
        if (key !== 'defects') return [key, probe[key]];
        return [
          key,
          probe.defects.map((defect) => {
            const authored = { ...defect };
            delete authored.oracleEvidence;
            return authored;
          }),
        ];
      }),
  );
}

function qualificationEvidence(replay, runId, probe, field) {
  const reference = probe.qualification[field];
  assert.equal(reference?.storage, 'public', `${probe.probeId} ${field} must be public evidence`);
  assert.equal(reference?.privateRef, null, `${probe.probeId} ${field} has a private reference`);
  const name = path.posix.basename(reference.path);
  assert.equal(reference.path, `runs/${runId}/qualification/${probe.probeId}/${name}`);
  const file = path.join(replay, 'qualification', probe.probeId, name);
  assert.equal(digest(file), reference.digest, `${probe.probeId} ${field} digest`);
  return readJson(file);
}

function checkQualification(folder, replay, runId, probe, source) {
  const route = source.qualification.route;
  assert.equal(probe.qualification.route, route, `${probe.probeId} qualification route`);
  if (route === 'gameability') {
    assert.equal(probe.qualification.degenerateResponse, source.qualification.degenerateResponse);
    const responsePath = `corpus/gameability/${probe.probeId}.json`;
    const response = { path: responsePath, digest: digest(path.join(folder, responsePath)) };
    const corpusSteps = readJson(path.join(folder, responsePath)).steps;
    const phases = [
      ['naiveOracleSatisfiedEvidence', 'naive-oracle-satisfied', 'held'],
      ['disciplinedOracleRejectedEvidence', 'disciplined-oracle-rejected', 'violated'],
    ];
    for (const [field, phase, expected] of phases) {
      const evidence = qualificationEvidence(replay, runId, probe, field);
      assert.equal(evidence.probeId, probe.probeId);
      assert.equal(evidence.phase, phase);
      assert.equal(evidence.verdict, expected);
      assert.deepEqual(evidence.degenerateResponse, response);
      assert.deepEqual(
        evidence.steps.map((step) => step.stepId).sort(),
        Object.keys(corpusSteps).sort(),
        `${probe.probeId} ${phase} response plan`,
      );
      for (const step of evidence.steps) {
        const answer = corpusSteps[step.stepId];
        assert.equal(step.observation.exitCode, answer.exitCode);
        assert.deepEqual(step.observation.stdout.value, JSON.parse(answer.stdout));
        assert.equal(step.observation.stderr.value, answer.stderr);
      }
    }
    return;
  }

  const baseline = qualificationEvidence(replay, runId, probe, 'baselinePassEvidence');
  assert.equal(baseline.probeId, probe.probeId);
  assert.equal(baseline.verdict, 'held');
  if (route === 'clean-control') {
    assert.equal(probe.qualification.noKnownDefectStatement, source.qualification.noKnownDefectStatement);
    return;
  }

  assert.equal(route, 'controlled-mutation');
  const mutationId = source.qualification.mutation;
  const mutation = readJson(path.join(folder, 'mutations', `${mutationId}.mutation.json`));
  assert.equal(probe.qualification.mutationSource, mutation.mutationSource);
  assert.equal(probe.qualification.targetArtifact.path, mutation.targetArtifact);
  const target = path.join(path.dirname(folder), 'target', mutation.targetArtifact);
  assert.equal(probe.qualification.targetArtifact.digest, digest(target));
  const operator = mutation.operator;
  assert.equal(operator.kind, 'replace-exact');
  assert.equal(
    probe.qualification.mutationOperator,
    `replace-exact: ${JSON.stringify(operator.find)} -> ${JSON.stringify(operator.replace)} (occurrences ${operator.occurrences})`,
  );
  const original = fs.readFileSync(target, 'utf8');
  assert.equal(original.split(operator.find).length - 1, operator.occurrences);
  const mutatedDigest = `sha256:${crypto.createHash('sha256').update(original.replace(operator.find, operator.replace)).digest('hex')}`;
  const mutated = qualificationEvidence(replay, runId, probe, 'mutatedFailEvidence');
  assert.equal(baseline.targetArtifactDigest, digest(target));
  assert.equal(mutated.probeId, probe.probeId);
  assert.equal(mutated.mutationId, mutationId);
  assert.equal(mutated.targetArtifactDigest, mutatedDigest);
  assert.equal(mutated.verdict, 'violated');
  assert.deepEqual(
    probe.defects.flatMap((defect) => defect.oracleEvidence),
    [probe.qualification.mutatedFailEvidence],
  );
  const rollback = readJson(path.join(replay, 'qualification', probe.probeId, 'rollback.json'));
  assert.equal(rollback.probeId, probe.probeId);
  assert.equal(rollback.mutationId, mutationId);
  assert.equal(rollback.targetArtifact, mutation.targetArtifact);
  assert.equal(rollback.preDigest, digest(target));
  assert.equal(rollback.mutatedDigest, mutatedDigest);
  assert.equal(rollback.restoredDigest, rollback.preDigest);
  assert.equal(rollback.rollbackVerified, true);
  assert.equal(probe.qualification.rollbackVerified, true);
  assert.ok(rollback.rePasses.length > 0);
  assert.ok(rollback.rePasses.length <= 1 + rollback.reExecutionCap);
  assert.equal(rollback.rePasses.at(-1).verdict, 'held');
}

function normalizedStdin(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function checkRawPreflight(folder, replay, runName, qualifiedProbes) {
  const observed = readJson(path.join(replay, 'observations.json'));
  const rawFiles = filesUnder(path.join(replay, 'observations'));
  assert.equal(rawFiles.length, observed.length);
  const raw = rawFiles.map((file) => readJson(path.join(replay, 'observations', file)));
  const byLeg = new Map(raw.map((entry) => [entry.legId, entry]));
  assert.equal(byLeg.size, raw.length);
  for (const [index, entry] of raw.entries()) {
    assert.equal(entry.sequence, index + 1);
    assert.equal(entry.request.probeId, entry.legId);
    assert.equal(entry.observation.probeId, entry.legId);
    assert.deepEqual(entry.observation, observed[index]);
  }
  for (const probe of qualifiedProbes) {
    if (probe.qualification.route !== 'controlled-mutation') continue;
    const source = readJson(path.join(folder, 'probes', `${probe.probeId}.probe.json`));
    for (const defect of probe.defects) {
      const witness = defect.manifestationWitness;
      const recorded = byLeg.get(witness.legId);
      assert.ok(recorded, `${runName} ${probe.probeId} manifestation leg is absent`);
      assert.equal(recorded.workspace, `mutated:${source.qualification.mutation}`);
      assert.equal(recorded.request.interfaceId, witness.interfaceId);
      assert.equal(recorded.request.operationId, witness.operationId);
      const channels = { ...recorded.request.channels };
      if (Array.isArray(channels.environment) && channels.environment.length === 0) channels.environment = {};
      assert.deepEqual(channels, witness.inputs);
      assert.deepEqual(
        recorded.observation,
        observed.find((entry) => entry.probeId === witness.legId),
      );
    }
  }
}

function checkHeldOutInputIsolation(folder) {
  const evaluation = readJson(path.join(folder, 'evaluation.json'));
  const corpus = filesUnder(path.join(folder, 'corpus/requests'))
    .filter((file) => file.endsWith('.stdin'))
    .map((file) => normalizedStdin(fs.readFileSync(path.join(folder, 'corpus/requests', file), 'utf8')));
  const heldOutWitnesses = evaluation.heldOutProbes.flatMap((id) => {
    const probe = readJson(path.join(folder, 'probes', `${id}.probe.json`));
    return probe.defects.map((defect) => defect.manifestationWitness.inputs.stdin.value);
  });
  assert.equal(heldOutWitnesses.length, evaluation.heldOutProbes.length);
  assert.ok(
    heldOutWitnesses.every((input) => corpus.some((candidate) => isDeepStrictEqual(candidate, input))),
    'a held-out-only request needs an explicit development evidence scan',
  );
}

async function replayRun(folder, runName, out, expectedVerdict) {
  const replay = path.join(folder, 'replay', runName);
  sameBytes(path.join(folder, 'contract.json'), path.join(replay, 'contract.json'), `${runName} authored contract`);
  const runRecord = readJson(path.join(replay, 'run.json'));
  assert.equal(runRecord.workspace.treeDigest, treeDigest(path.join(path.dirname(folder), 'target')));
  const verdictFile = path.join(out, `${path.basename(path.dirname(folder))}-${runName}-preflight.json`);
  run(ENGINE, [
    'preflight',
    '--contract',
    path.join(replay, 'contract.json'),
    '--probes',
    path.join(replay, 'probes.json'),
    '--observations',
    path.join(replay, 'observations.json'),
    '--run-id',
    runRecord.invocationId,
    '--out',
    verdictFile,
  ]);
  sameBytes(verdictFile, path.join(replay, 'preflight-verdict.json'), `${runName} preflight`);
  const index = readJson(path.join(replay, 'trial-sets.json'));
  assert.equal(index.corpusDigest, await corpusDigestOf(readJson(path.join(folder, 'corpus-index.json'))));
  sameBytes(path.join(folder, 'policy/scoring-policy.json'), path.join(replay, index.policy), `${runName} scoring policy`);
  const evaluation = readJson(path.join(folder, 'evaluation.json'));
  const heldOut = new Set(evaluation.heldOutProbes);
  const authoredIds = fs
    .readdirSync(path.join(folder, 'probes'))
    .filter((name) => name.endsWith('.probe.json'))
    .map((name) => path.basename(name, '.probe.json'));
  assert.deepEqual(
    index.trialSets.map((set) => set.probeId).sort(),
    authoredIds.filter((id) => (runName === 'held-out' ? heldOut.has(id) : !heldOut.has(id))).sort(),
    `${runName} partition omitted a probe`,
  );
  const qualifiedProbes = filesUnder(path.join(replay, 'probes'))
    .filter((file) => file.endsWith('.probe.json'))
    .map((file) => readJson(path.join(replay, 'probes', file)));
  assert.deepEqual(qualifiedProbes.map((probe) => probe.probeId).sort(), index.trialSets.map((set) => set.probeId).sort());
  const targetDigest = treeDigest(path.join(path.dirname(folder), 'target'));
  for (const probe of qualifiedProbes) {
    const source = readJson(path.join(folder, 'probes', `${probe.probeId}.probe.json`));
    assert.deepEqual(authoredProbeFields(probe, Object.keys(source)), authoredProbeFields(source, Object.keys(source)));
    assert.equal(probe.implementationDigest, targetDigest);
    assert.equal(probe.commitDigest, targetDigest);
    checkQualification(folder, replay, runRecord.invocationId, probe, source);
  }
  const preflightProbes = readJson(path.join(replay, 'probes.json'));
  assert.deepEqual(
    preflightProbes.map((probe) => probe.probeId).sort(),
    qualifiedProbes
      .filter((probe) => probe.qualification.route === 'controlled-mutation')
      .map((probe) => probe.probeId)
      .sort(),
  );
  for (const probe of preflightProbes) {
    assert.deepEqual(
      probe,
      qualifiedProbes.find((candidate) => candidate.probeId === probe.probeId),
    );
  }
  checkRawPreflight(folder, replay, runName, qualifiedProbes);
  const scoreId = fs.readdirSync(path.join(replay, 'scores')).sort().at(-1);
  assert.ok(scoreId);
  assert.ok(index.trialSets.length > 0);
  for (const set of index.trialSets) {
    const sourceProbe = readJson(path.join(folder, 'probes', `${set.probeId}.probe.json`));
    const scoredProbe = readJson(path.join(replay, set.probe));
    assert.deepEqual(
      authoredProbeFields(scoredProbe, Object.keys(sourceProbe)),
      authoredProbeFields(sourceProbe, Object.keys(sourceProbe)),
      `${runName} ${set.probeId} source probe`,
    );
    assert.equal(set.records.length, 3, `${runName} ${set.probeId} trial count`);
    const artifact = path.join(out, `${path.basename(path.dirname(folder))}-${runName}-${set.probeId}.json`);
    const args = ['score'];
    for (const record of set.records) args.push('--record', path.join(replay, record));
    args.push(
      '--contract',
      path.join(replay, index.contract),
      '--probe',
      path.join(replay, set.probe),
      '--preflight-verdict',
      path.join(replay, index.preflightVerdict),
      '--policy',
      path.join(replay, index.policy),
      '--corpus-digest',
      index.corpusDigest,
      '--isolation-manifest',
      path.join(replay, set.isolationManifest),
      '--evaluator-configuration',
      path.join(replay, index.evaluatorConfiguration),
      '--out',
      artifact,
    );
    run(ENGINE, args);
    sameBytes(artifact, path.join(replay, 'scores', scoreId, set.probeId, 'evidence-artifact.json'), `${runName} ${set.probeId} score`);
    const evidence = readJson(artifact);
    assert.equal(evidence.contractVerdict, expectedVerdict);
    assert.equal(evidence.exitCode, 0);
    const gaps = evidence.coverageGaps.filter((gap) => !gap.satisfied);
    assert.deepEqual(
      gaps.map((gap) => gap.rule),
      expectedVerdict === 'PASS' ? [] : ['malformed-input'],
    );
    if (expectedVerdict === 'PASS') {
      const probe = sourceProbe;
      const outcome = evidence.reducedProbeOutcomes.find((entry) => entry.probeId === set.probeId);
      const expected = probe.expectedClean ? 'passed-clean-control' : 'caught';
      assert.deepEqual(
        outcome.trialVotes.map((vote) => vote.state),
        [expected, expected, expected],
      );
      if (!probe.expectedClean) assert.equal(evidence.strength.vector[probe.probeClass]?.rate, 1);
    }
  }
}

async function main() {
  checkInventory();
  checkGapReport();
  checkBlindInputs();
  const before = path.join(FIXTURE, 'before/evaluation');
  const after = path.join(FIXTURE, 'after/evaluation');
  checkHeldOutInputIsolation(after);
  checkReplayManifest(before, ['held-out']);
  checkReplayManifest(after, ['development', 'held-out']);
  await checkBeforeDiagnostics();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-evaluate-gap-loop-'));
  try {
    await replayRun(before, 'held-out', out, 'CONCERNS');
    for (const runName of ['development', 'held-out']) await replayRun(after, runName, out, 'PASS');
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
  console.log('ok Evaluate gap loop replayed before and after evidence byte for byte');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
