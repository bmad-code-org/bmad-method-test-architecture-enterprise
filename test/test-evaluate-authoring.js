/** Deterministic replay of the two live Evaluate authoring proofs (Story 1.24). */
'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { treeDigest } = require('../cli/lib/evaluate/workspace');

const ROOT = path.resolve(__dirname, '..');
const ENGINE = path.join(ROOT, 'node_modules/.bin/eval-quality');
const EVALUATE = path.join(ROOT, 'cli/evaluate.js');
const FIXTURES = path.join(__dirname, 'fixtures/evaluate-authoring');
const SECTIONS = ['representative', 'negative', 'malformed', 'gameability', 'held-out'];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function digest(file) {
  return `sha256:${sha256(file)}`;
}

function filesUnder(root) {
  const visit = (folder) =>
    fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) return visit(file);
      assert.ok(entry.isFile(), `${file} must be a regular file`);
      return [path.relative(root, file).split(path.sep).join('/')];
    });
  return visit(root).sort();
}

function checkFrozenInputs(fixture) {
  const lines = fs.readFileSync(path.join(fixture, 'authoring-inputs.sha256'), 'utf8').trim().split('\n');
  const listed = lines.map((line) => {
    const match = /^([a-f0-9]{64}) {2}(target\/.+)$/.exec(line);
    assert.ok(match, `invalid authoring input digest: ${line}`);
    assert.equal(sha256(path.join(fixture, match[2])), match[1], `${match[2]} changed after authoring`);
    return match[2];
  });
  assert.deepEqual(
    listed.sort(),
    filesUnder(path.join(fixture, 'target')).map((file) => `target/${file}`),
  );
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
  assert.equal(result.error, undefined, `${command} could not start: ${result.error}`);
  assert.equal(result.status, 0, `${command} ${args.join(' ')} exited ${result.status}\n${result.stdout}\n${result.stderr}`);
}

function sameBytes(actual, expected, label) {
  assert.ok(fs.readFileSync(actual).equals(fs.readFileSync(expected)), `${label} differs from committed evidence`);
}

function recordedInput(channels) {
  return {
    value:
      channels.body?.kind === 'raw'
        ? { rawBase64: channels.body.base64, contentType: channels.body.contentType }
        : (channels.body?.value ?? normalizedStdin(channels.stdin?.value)),
    query: channels.query ?? {},
  };
}

function assertPublicInput(actual, heldOutOnly, label) {
  assert.ok(
    heldOutOnly.every((input) => !isDeepStrictEqual(input, actual)),
    `${label} contains a held-out-only request`,
  );
}

function privateTextMarkers(privateValues) {
  return privateValues.flatMap((body) => {
    const encodedBody = JSON.stringify(body);
    const markers = [encodedBody, JSON.stringify(encodedBody).slice(1, -1)];
    if (typeof body.answer === 'string') markers.push(body.answer);
    if (Array.isArray(body.answer)) {
      const encodedArray = JSON.stringify(body.answer);
      markers.push(encodedArray, JSON.stringify(encodedArray).slice(1, -1));
    }
    return markers;
  });
}

function containsPrivateText(value, markers) {
  const compact = value.replaceAll(/\s+/g, '');
  return markers.some((marker) => value.includes(marker) || compact.includes(marker));
}

function containsPrivateInput(value, privateValues, markers) {
  if (privateValues.some((input) => isDeepStrictEqual(value, input))) return true;
  if (typeof value === 'string') {
    if (containsPrivateText(value, markers)) return true;
    try {
      const decoded = JSON.parse(value);
      if (decoded !== value) return containsPrivateInput(decoded, privateValues, markers);
    } catch {
      return false;
    }
  }
  if (Array.isArray(value)) return value.some((entry) => containsPrivateInput(entry, privateValues, markers));
  if (value !== null && typeof value === 'object') {
    return Object.values(value).some((entry) => containsPrivateInput(entry, privateValues, markers));
  }
  return false;
}

const isAiFeature = (folder) => folder.endsWith(path.join('ai-feature', 'evaluation'));

/**
 * The behaviors whose oracles each scored trial of a probe violates, one sorted list per trial. The qualification evidence
 * lists only the oracles of the behaviors a probe declares (the engine judges a degenerate response and a mutation against
 * those alone), so a mutation or a degenerate answer that also breaks another behavior is visible only in the scored
 * evidence, whose outcomes hold every contract oracle with its disposition.
 */
function violatedBehaviorsByTrial(folder, evidence) {
  const contract = readJson(path.join(folder, 'contract.json'));
  const owner = new Map(contract.behaviors.flatMap((behavior) => behavior.oracles.map((oracleId) => [oracleId, behavior.id])));
  const trials = new Map();
  for (const outcome of evidence.outcomes) {
    assert.ok(owner.has(outcome.oracleId), `oracle ${outcome.oracleId} belongs to no behavior`);
    const violated = trials.get(outcome.trialIndex) ?? new Set();
    if (outcome.disposition === 'violated') violated.add(owner.get(outcome.oracleId));
    trials.set(outcome.trialIndex, violated);
  }
  return [...trials].sort(([left], [right]) => left - right).map(([, violated]) => [...violated].sort());
}

/** The behaviors a probe is declared to break: a controlled mutation's defects, a gameability probe's own behavior, nothing for a control. */
function declaredBehaviors(probe) {
  if (probe.qualification.route === 'controlled-mutation') return [...new Set(probe.defects.map((defect) => defect.behaviorId))].sort();
  return probe.qualification.route === 'gameability' ? [probe.behaviorId] : [];
}

/**
 * Every oracle the scored trials of a probe judge agrees with the evidence, and the oracles they violate belong to exactly the
 * behaviors the probe declares. A mutation that breaks a behavior its defects do not declare files no finding for it
 * (eval-quality records the disposition as `disagrees`), and a degenerate answer that differs from the correct server on a step
 * another behavior's oracle reads violates that oracle too, so each probe answers like the correct server beyond what it seeds.
 */
function checkScoredBehaviors(folder, probe, evidence, label) {
  assert.deepEqual(
    evidence.outcomes.filter((entry) => entry.corroboration !== 'agrees').map((entry) => `${entry.oracleId} ${entry.corroboration}`),
    [],
    `${label} has an oracle whose judgment the evidence does not corroborate`,
  );
  const declared = declaredBehaviors(probe);
  const message = {
    'controlled-mutation': `${label} mutation violates the oracles of behaviors its defects do not declare`,
    gameability: `${label} degenerate response violates the oracles of behaviors other than ${probe.behaviorId}`,
    'clean-control': `${label} clean control violates an oracle`,
  }[probe.qualification.route];
  for (const violated of violatedBehaviorsByTrial(folder, evidence)) assert.deepEqual(violated, declared, message);
}

function checkGameabilityEvidence(folder, probe, source, naive, disciplined) {
  const corpusPath = `corpus/gameability/${probe.probeId}.json`;
  const response = { path: corpusPath, digest: digest(path.join(folder, corpusPath)) };
  assert.equal(naive.probeId, probe.probeId);
  assert.equal(disciplined.probeId, probe.probeId);
  assert.equal(naive.phase, 'naive-oracle-satisfied');
  assert.equal(disciplined.phase, 'disciplined-oracle-rejected');
  assert.deepEqual(naive.degenerateResponse, response);
  assert.deepEqual(disciplined.degenerateResponse, response);
  assert.equal(naive.verdict, 'held');
  assert.equal(disciplined.verdict, 'violated');
  assert.ok(naive.oracles.some((oracle) => oracle.oracleId === source.qualification.naiveOracle && oracle.disposition === 'held'));
  assert.ok(disciplined.oracles.some((oracle) => oracle.disposition === 'violated'));
  assert.deepEqual(naive.steps, disciplined.steps, `${probe.probeId} gameability evidence changed between judgments`);
  const corpus = readJson(path.join(folder, corpusPath));
  assert.deepEqual(
    naive.steps.map((step) => step.stepId).sort(),
    Object.keys(corpus.steps).sort(),
    `${probe.probeId} gameability response steps differ from the corpus`,
  );
  for (const step of naive.steps) {
    const answer = corpus.steps[step.stepId];
    if (Object.hasOwn(answer, 'status')) {
      assert.equal(step.observation.status, answer.status);
      assert.deepEqual(step.observation.body.value, JSON.parse(answer.body));
    } else {
      assert.equal(step.observation.exitCode, answer.exitCode);
      assert.deepEqual(step.observation.stdout.value, JSON.parse(answer.stdout));
      assert.equal(step.observation.stderr.value, answer.stderr);
    }
  }
}

function qualificationEvidence(replay, runId, probe, field) {
  const reference = probe.qualification[field];
  assert.equal(reference?.storage, 'public', `${probe.probeId} ${field} must be public evidence`);
  assert.equal(reference?.privateRef, null, `${probe.probeId} ${field} has a private reference`);
  const name = path.posix.basename(reference.path);
  assert.equal(reference.path, `runs/${runId}/qualification/${probe.probeId}/${name}`, `${probe.probeId} ${field} names another run`);
  const file = path.join(replay, 'qualification', probe.probeId, name);
  assert.equal(digest(file), reference.digest, `${probe.probeId} ${field} digest`);
  return readJson(file);
}

function checkQualification(folder, replay, runId, probe, source) {
  const route = source.qualification.route;
  assert.equal(probe.qualification.route, route, `${probe.probeId} qualification route changed`);
  if (route === 'gameability') {
    assert.equal(probe.qualification.degenerateResponse, source.qualification.degenerateResponse);
    const naive = qualificationEvidence(replay, runId, probe, 'naiveOracleSatisfiedEvidence');
    const disciplined = qualificationEvidence(replay, runId, probe, 'disciplinedOracleRejectedEvidence');
    checkGameabilityEvidence(folder, probe, source, naive, disciplined);
    return;
  }

  const baseline = qualificationEvidence(replay, runId, probe, 'baselinePassEvidence');
  assert.equal(baseline.probeId, probe.probeId);
  assert.equal(baseline.verdict, 'held', `${probe.probeId} baseline did not pass`);
  if (route === 'clean-control') {
    assert.equal(probe.qualification.noKnownDefectStatement, source.qualification.noKnownDefectStatement);
    return;
  }

  assert.equal(route, 'controlled-mutation', `${probe.probeId} has an unexpected qualification route`);
  const mutationId = source.qualification.mutation;
  const mutation = readJson(path.join(folder, 'mutations', `${mutationId}.mutation.json`));
  assert.equal(mutation.mutationId, mutationId);
  assert.equal(probe.qualification.mutationSource, mutation.mutationSource);
  assert.equal(probe.qualification.expectedObservableFailure, mutation.expectedObservableFailure);
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
  const changed = original.replace(operator.find, operator.replace);
  const mutatedDigest = `sha256:${crypto.createHash('sha256').update(changed).digest('hex')}`;
  const mutated = qualificationEvidence(replay, runId, probe, 'mutatedFailEvidence');
  assert.equal(baseline.targetArtifactDigest, digest(target));
  assert.equal(mutated.probeId, probe.probeId);
  assert.equal(mutated.mutationId, mutationId);
  assert.equal(mutated.targetArtifactDigest, mutatedDigest);
  assert.equal(mutated.verdict, 'violated', `${probe.probeId} mutation did not manifest`);
  assert.deepEqual(
    probe.defects.flatMap((defect) => defect.oracleEvidence),
    probe.defects.map(() => probe.qualification.mutatedFailEvidence),
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
  assert.ok(rollback.rePasses.length > 0, `${probe.probeId} has no post-rollback baseline`);
  assert.ok(rollback.rePasses.length <= 1 + rollback.reExecutionCap, `${probe.probeId} exceeded its re-execution cap`);
  assert.equal(rollback.rePasses.at(-1).verdict, 'held', `${probe.probeId} did not pass after rollback`);
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

function normalizedStdin(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function heldOutOnlyInputs(folder, heldOut) {
  const evaluation = readJson(path.join(folder, 'evaluation.json'));
  const channel = evaluation.interface === 'api' ? 'body' : 'stdin';
  const developmentCorpus =
    channel === 'body'
      ? fs
          .readdirSync(path.join(folder, 'corpus/development'))
          .filter((name) => name.endsWith('.json') && !name.endsWith('.expected.json'))
          .map((name) => readJson(path.join(folder, 'corpus/development', name)))
          .map((entry) => {
            assert.ok(Object.hasOwn(entry, 'body') && Object.hasOwn(entry, 'query'));
            return { value: entry.body, query: entry.query };
          })
      : fs
          .readdirSync(path.join(folder, 'corpus/requests'))
          .filter((name) => name.endsWith('.stdin'))
          .map((name) => ({
            value: normalizedStdin(fs.readFileSync(path.join(folder, 'corpus/requests', name), 'utf8')),
            query: {},
          }));
  const rawDevelopment = path.join(folder, 'corpus/development/D08-invalid-json.txt');
  if (channel === 'body' && fs.existsSync(rawDevelopment)) {
    developmentCorpus.push({
      value: { rawBase64: fs.readFileSync(rawDevelopment).toString('base64'), contentType: 'application/json' },
      query: {},
    });
  }
  assert.ok(developmentCorpus.length > 0, 'missing independent development corpus');
  const privateWitnesses = heldOut.flatMap((id) => {
    const probe = readJson(path.join(folder, 'probes', `${id}.probe.json`));
    return probe.defects.flatMap((defect) => {
      const inputs = defect.manifestationWitness?.inputs;
      if (!inputs?.[channel]) return [];
      const candidate = {
        value: inputs[channel].value,
        query: inputs.query ?? {},
      };
      return developmentCorpus.some((input) => isDeepStrictEqual(input, candidate)) ? [] : [candidate];
    });
  });
  if (channel === 'body') {
    const privateCorpus = ['H01-uppercase-restricted.json', 'H03-nonstring-array.json'].map((name) => {
      const entry = readJson(path.join(folder, 'corpus/held-out', name));
      return { value: entry.body, query: entry.query };
    });
    assert.ok(privateCorpus.length > 0, 'AI feature has no held-out-only inputs');
    assert.ok(
      privateCorpus.every((input) => developmentCorpus.every((entry) => !isDeepStrictEqual(input, entry))),
      'AI held-out-only input appears in the development corpus',
    );
    assert.equal(privateWitnesses.length, privateCorpus.length, 'AI held-out witnesses differ from private corpus cases');
    assert.ok(
      privateCorpus.every((input) => privateWitnesses.some((witness) => isDeepStrictEqual(input, witness))),
      'AI held-out witness does not match its private corpus case',
    );
  }
  return privateWitnesses;
}

function runReplay(folder, runName, out, expectedProbeIds, heldOutOnly) {
  const replay = path.join(folder, 'replay', runName);
  const runRecord = readJson(path.join(replay, 'run.json'));
  if (runName === 'development') {
    const privateValues = heldOutOnly.map((input) => input.value);
    assert.ok(privateValues.every((value) => value !== null && typeof value === 'object'));
    const markers = privateTextMarkers(privateValues);
    for (const file of filesUnder(replay).filter((name) => name.endsWith('.json'))) {
      const bytes = fs.readFileSync(path.join(replay, file), 'utf8');
      assert.ok(
        !containsPrivateText(bytes, markers) && !containsPrivateInput(JSON.parse(bytes), privateValues, markers),
        `${runName} ${file} contains a held-out-only input value`,
      );
    }
  }
  const targetDigest = treeDigest(path.join(path.dirname(folder), 'target'));
  assert.equal(runRecord.workspace.treeDigest, targetDigest, `${runName} evaluated a different target tree`);
  assert.equal(runRecord.adopterTree.unchanged, true, `${runName} changed the adopter tree`);
  sameBytes(path.join(folder, 'policy/scoring-policy.json'), path.join(replay, 'scoring-policy.json'), `${runName} policy`);
  const qualifiedProbes = fs
    .readdirSync(path.join(replay, 'probes'))
    .filter((name) => name.endsWith('.probe.json'))
    .map((name) => readJson(path.join(replay, 'probes', name)));
  assert.deepEqual(
    qualifiedProbes.map((probe) => probe.probeId).sort(),
    expectedProbeIds,
    `${runName} qualified a different probe inventory`,
  );
  const engineProbes = readJson(path.join(replay, 'probes.json'));
  assert.deepEqual(
    engineProbes.map((probe) => probe.probeId).sort(),
    qualifiedProbes
      .filter((probe) => probe.qualification.route === 'controlled-mutation')
      .map((probe) => probe.probeId)
      .sort(),
    `${runName} preflight probe inventory differs from qualified mutations`,
  );
  const qualifiedById = new Map(qualifiedProbes.map((probe) => [probe.probeId, probe]));
  for (const probe of engineProbes) {
    assert.deepEqual(probe, qualifiedById.get(probe.probeId), `${runName} ${probe.probeId} preflight probe changed`);
  }
  const preflightObservations = readJson(path.join(replay, 'observations.json'));
  const rawObservationFiles = filesUnder(path.join(replay, 'observations'));
  assert.equal(rawObservationFiles.length, preflightObservations.length, `${runName} raw observation inventory differs`);
  const rawObservations = rawObservationFiles.map((file) => readJson(path.join(replay, 'observations', file)));
  const rawByLeg = new Map(rawObservations.map((entry) => [entry.legId, entry]));
  assert.equal(rawByLeg.size, rawObservations.length, `${runName} repeats a preflight leg`);
  for (const [index, entry] of rawObservations.entries()) {
    assert.equal(entry.sequence, index + 1, `${runName} raw observation sequence changed`);
    assert.equal(entry.request.probeId, entry.legId);
    assert.equal(entry.observation.probeId, entry.legId);
    assert.deepEqual(entry.observation, preflightObservations[index], `${runName} preflight response differs from raw observation`);
    if (runName === 'development') {
      assertPublicInput(recordedInput(entry.request.channels), heldOutOnly, `${runName} ${entry.legId} preflight`);
    }
  }
  for (const probe of qualifiedProbes) {
    const source = readJson(path.join(folder, 'probes', `${probe.probeId}.probe.json`));
    assert.deepEqual(
      authoredProbeFields(probe, Object.keys(source)),
      authoredProbeFields(source, Object.keys(source)),
      `${runName} ${probe.probeId} differs from the authored probe`,
    );
    assert.equal(probe.implementationDigest, targetDigest, `${runName} ${probe.probeId} implementation digest`);
    assert.equal(probe.commitDigest, targetDigest, `${runName} ${probe.probeId} commit digest`);
    checkQualification(folder, replay, runRecord.invocationId, probe, source);
    if (source.qualification.route === 'controlled-mutation') {
      for (const defect of probe.defects) {
        const witness = defect.manifestationWitness;
        const recorded = rawByLeg.get(witness.legId);
        assert.ok(recorded, `${runName} ${probe.probeId} manifestation request is absent`);
        assert.equal(recorded.workspace, `mutated:${source.qualification.mutation}`);
        assert.equal(recorded.request.interfaceId, witness.interfaceId);
        assert.equal(recorded.request.operationId, witness.operationId);
        const channels = { ...recorded.request.channels };
        if (Array.isArray(channels.environment) && channels.environment.length === 0) channels.environment = {};
        assert.deepEqual(channels, witness.inputs, `${runName} ${probe.probeId} manifestation request differs`);
        assert.deepEqual(
          recorded.observation,
          preflightObservations.find((entry) => entry.probeId === witness.legId),
          `${runName} ${probe.probeId} manifestation response differs from preflight`,
        );
      }
    }
  }
  const verdict = path.join(out, `${runName}-preflight.json`);
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
    verdict,
  ]);
  sameBytes(verdict, path.join(replay, 'preflight-verdict.json'), `${runName} preflight`);

  const index = readJson(path.join(replay, 'trial-sets.json'));
  const scores = path.join(replay, 'scores');
  const scoreId = fs.readdirSync(scores).sort().at(-1);
  assert.ok(scoreId, `${runName} has no committed score`);
  assert.equal(index.trialSets.length > 0, true, `${runName} has no sealed trial sets`);
  assert.deepEqual(
    index.trialSets.map((set) => set.probeId).sort(),
    expectedProbeIds,
    `${runName} trial sets differ from the authored ${runName} probe inventory`,
  );
  for (const set of index.trialSets) {
    assert.equal(set.records.length, readJson(path.join(folder, 'policy/scoring-policy.json')).minimumTrialCount);
    if (runName === 'development') {
      for (const record of set.records) {
        const trial = readJson(path.join(replay, record));
        for (const observation of trial.observations) {
          const channel = observation.callInputs.body === null ? 'stdin' : 'body';
          const actual = {
            value:
              channel === 'stdin'
                ? normalizedStdin(observation.callInputs.stdin)
                : observation.callInputs.bodyEncoding === 'raw'
                  ? { rawBase64: observation.callInputs.body.base64, contentType: observation.callInputs.body.contentType }
                  : observation.callInputs.body,
            query: observation.callInputs.query ?? {},
          };
          assertPublicInput(actual, heldOutOnly, `${runName} ${set.probeId} trial`);
        }
      }
    }
    if (runName === 'development' && isAiFeature(folder) && set.probeId === 'P-014') {
      const source = readJson(path.join(folder, 'probes/P-014.probe.json'));
      const raw = source.defects[0].manifestationWitness.inputs.body;
      assert.deepEqual(source.defectSignature.condition.selector.inputBinding.body, raw, 'P-014 selector binds the witness bytes');
      const predicate = source.defectSignature.condition.predicate;
      assert.equal(predicate.op, 'all', 'P-014 requires every defect-signature condition');
      assert.ok(
        predicate.operands.some(
          (operand) =>
            operand.op === 'equality' &&
            operand.operands[0]?.pointer === '/interactions/observed/response-status' &&
            operand.operands[1]?.literal === 200,
        ),
        'P-014 only matches HTTP 200',
      );
      assert.equal(raw.contentType, 'application/json', 'P-014 declares the corpus content type');
      assert.deepEqual(
        Buffer.from(raw.base64, 'base64'),
        fs.readFileSync(path.join(folder, 'corpus/development/D08-invalid-json.txt')),
        'P-014 sends the frozen malformed JSON bytes',
      );
      for (const [phase, expectedStatus, expectedBody] of [
        ['baseline-pass', 400, { error: 'invalid JSON' }],
        ['mutated-fail', 200, { decision: 'pass', reason: 'accepted' }],
      ]) {
        const qualification = readJson(path.join(replay, `qualification/P-014/${phase}.json`));
        const step = qualification.steps.find((entry) => entry.stepId === 'raw-invalid-json');
        assert.deepEqual(step?.request?.channels?.body, raw, `P-014 ${phase} request bytes`);
        assert.equal(step?.observation?.status, expectedStatus, `P-014 ${phase} status`);
        assert.deepEqual(step?.observation?.body?.value, expectedBody, `P-014 ${phase} response`);
      }
      assert.equal(set.records.length, 3, 'P-014 has three scored trials');
      for (const record of set.records) {
        const trial = readJson(path.join(replay, record));
        const observed = trial.observations.find((entry) => entry.observationId.endsWith('raw-invalid-json'));
        assert.deepEqual(observed?.callInputs?.body, raw, `P-014 ${record} raw body`);
        assert.equal(observed?.callInputs?.bodyEncoding, 'raw', `P-014 ${record} body encoding`);
        assert.equal(observed?.responseStatus, 200, `P-014 ${record} parser mutation`);
      }
    }
    const artifact = path.join(out, `${runName}-${set.probeId}-evidence.json`);
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
    sameBytes(artifact, path.join(scores, scoreId, set.probeId, 'evidence-artifact.json'), `${runName} ${set.probeId} score`);
    const evidence = readJson(artifact);
    const probe = readJson(path.join(folder, set.probe.replace(/^probes\//, 'probes/')));
    assert.equal(evidence.contractVerdict, 'PASS', `${runName} ${set.probeId} verdict`);
    assert.equal(evidence.exitCode, 0, `${runName} ${set.probeId} exit`);
    assert.ok(
      evidence.coverageGaps.every((gap) => gap.satisfied),
      `${runName} ${set.probeId} has an uncovered rule`,
    );
    assert.ok(evidence.reducedProbeOutcomes.some((outcome) => outcome.probeId === set.probeId));
    checkScoredBehaviors(folder, probe, evidence, `${runName} ${set.probeId}`);
    const outcome = evidence.reducedProbeOutcomes.find((entry) => entry.probeId === set.probeId);
    const expected = probe.expectedClean ? 'passed-clean-control' : 'caught';
    assert.deepEqual(
      outcome.trialVotes.map((vote) => vote.state),
      Array.from({ length: set.records.length }, () => expected),
      `${runName} ${set.probeId} votes`,
    );
    const classRate = evidence.strength.vector[probe.probeClass];
    if (!probe.expectedClean) assert.equal(classRate?.rate, 1, `${runName} ${set.probeId} class rate`);
  }
}

function checkSuite(kind, out) {
  const fixture = path.join(FIXTURES, kind);
  const folder = path.join(fixture, 'evaluation');
  for (const file of [
    'target/DESCRIPTION.md',
    'target/intake-answers.md',
    'inspection-record.md',
    'requirements-statement.md',
    'session-transcript.md',
  ]) {
    assert.ok(fs.statSync(path.join(fixture, file)).isFile(), `${kind} lacks ${file}`);
  }
  checkFrozenInputs(fixture);
  const manifest = readJson(path.join(folder, 'replay/manifest.json'));
  assert.deepEqual([...manifest.runs].sort(), ['development', 'held-out']);
  assert.deepEqual(
    Object.keys(manifest.hashes).sort(),
    filesUnder(path.join(folder, 'replay'))
      .filter((file) => file !== 'manifest.json')
      .map((file) => `replay/${file}`),
    `${kind} replay manifest omits or invents a file`,
  );
  for (const [relative, digest] of Object.entries(manifest.hashes)) {
    assert.equal(sha256(path.join(folder, relative)), digest, `${kind} ${relative} changed`);
  }
  const evaluation = readJson(path.join(folder, 'evaluation.json'));
  assert.equal(evaluation.targetKind, kind === 'ai-feature' ? 'ai-feature' : 'test-review-mechanism');
  assert.equal(evaluation.interface, kind === 'ai-feature' ? 'api' : 'cli');
  assert.ok(evaluation.heldOutProbes.length > 0, `${kind} has no held-out probe`);
  const probes = fs.readdirSync(path.join(folder, 'probes')).filter((name) => name.endsWith('.probe.json'));
  const authoredProbeIds = probes.map((name) => readJson(path.join(folder, 'probes', name)).probeId).sort();
  const heldOut = [...evaluation.heldOutProbes].sort();
  assert.ok(
    heldOut.every((id) => authoredProbeIds.includes(id)),
    `${kind} names a missing held-out probe`,
  );
  const sections = new Set();
  for (const name of probes) {
    const probe = readJson(path.join(folder, 'probes', name));
    const section = /^\[([^\]]+)\]/.exec(probe.rationale)?.[1];
    assert.ok(SECTIONS.includes(section), `${kind} ${probe.probeId} has a noncanonical corpus section`);
    assert.equal(section === 'held-out', heldOut.includes(probe.probeId), `${kind} ${probe.probeId} section/partition mismatch`);
    sections.add(section);
  }
  for (const section of SECTIONS) assert.ok(sections.has(section), `${kind} lacks ${section} corpus coverage`);
  // A floor stays only for a class its partition can hold an eligible probe of. A clean control never is one (eval-quality's
  // strength vector leaves every `expectedClean` probe out), so a floor on its class reads `no-eligible-probe` on `ci`.
  const authored = probes.map((name) => readJson(path.join(folder, 'probes', name)));
  for (const [partition, members] of [
    ['development', authored.filter((probe) => !heldOut.includes(probe.probeId))],
    ['held-out', authored.filter((probe) => heldOut.includes(probe.probeId))],
  ])
    for (const probeClass of Object.keys(evaluation.strengthFloor))
      assert.ok(
        members.some((probe) => probe.probeClass === probeClass && !probe.expectedClean),
        `${kind} declares a ${probeClass} floor that its ${partition} partition holds no eligible probe for`,
      );
  assert.ok(fs.readdirSync(path.join(folder, 'mutations')).some((name) => name.endsWith('.mutation.json')));
  assert.ok(fs.existsSync(path.join(folder, 'evaluator/selection.md')), `${kind} lacks an evaluator selection reason`);

  run(process.execPath, [EVALUATE, 'check', '--evaluation', folder]);
  const compiled = path.join(out, `${kind}-compiled.json`);
  const sealed = path.join(out, `${kind}-sealed.json`);
  run(ENGINE, ['compile', '--in', path.join(folder, 'contract.json'), '--out', compiled]);
  run(ENGINE, ['seal', '--in', path.join(folder, 'contract.json'), '--out', sealed]);
  const heldOutOnly = heldOutOnlyInputs(folder, heldOut);
  for (const runName of manifest.runs) {
    const replay = path.join(folder, 'replay', runName);
    sameBytes(path.join(folder, 'contract.json'), path.join(replay, 'contract.json'), `${kind} ${runName} contract`);
    sameBytes(compiled, path.join(replay, 'eval-contract.json'), `${kind} ${runName} compile`);
    sameBytes(sealed, path.join(replay, 'sealed-evaluator-brief.json'), `${kind} ${runName} seal`);
    const expectedProbeIds = runName === 'held-out' ? heldOut : authoredProbeIds.filter((id) => !heldOut.includes(id));
    runReplay(folder, runName, out, expectedProbeIds, heldOutOnly);
  }
  if (kind === 'ai-feature') {
    const notes = fs.readFileSync(path.join(fixture, 'completion-notes.md'), 'utf8');
    const transcript = fs.readFileSync(path.join(fixture, 'session-transcript.md'), 'utf8');
    assert.match(notes, /vendor model/i);
    assert.match(notes, /adopter/i);
    assert.match(transcript, /vendor model/i);
    assert.match(transcript, /adopter/i);
    for (const name of fs.readdirSync(path.join(folder, 'mutations'))) {
      if (!name.endsWith('.mutation.json')) continue;
      const mutation = readJson(path.join(folder, 'mutations', name));
      assert.doesNotMatch(JSON.stringify(mutation).toLowerCase(), /vendor|model/);
    }
  }
}

function main() {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-evaluate-authoring-'));
  try {
    for (const kind of ['ai-feature', 'test-review']) checkSuite(kind, out);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
  console.log('ok both Evaluate authoring suites replayed byte for byte');
}

main();
