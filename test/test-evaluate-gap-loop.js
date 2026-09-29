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
const { evaluateOracles, oraclesOfBehaviors } = require('../cli/lib/evaluate/evaluator');
const { degenerateArm } = require('../cli/lib/evaluate/gameability');
const { loadEngine } = require('../cli/lib/evaluate/engine');
const { registryFromEvaluation } = require('../cli/lib/evaluate/registry');
const { recordObservation } = require('../cli/lib/evaluate/records');
const { treeDigest } = require('../cli/lib/evaluate/workspace');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE = process.env.TEA_EVALUATE_GAP_LOOP_FIXTURE ?? path.join(__dirname, 'fixtures/evaluate-gap-loop');
const SOURCE = path.join(__dirname, 'fixtures/evaluate-authoring/test-review');
const ENGINE = path.join(ROOT, 'node_modules/.bin/eval-quality');
const GUIDE =
  process.env.TEA_EVALUATE_GAP_LOOP_GUIDE ?? path.join(ROOT, 'src/workflows/testarch/bmad-testarch-evaluate/references/gaps.md');
const EXCLUDED = new Set(['replay', 'runs', 'node_modules']);
const PROBE_CLASSES = {
  'P-001': 'zero-action',
  'P-002': 'zero-action',
  'P-003': 'zero-action',
  'P-004': 'zero-action',
  'P-005': 'defect',
  'P-006': 'defect',
  'P-007': 'defect',
  'P-008': 'defect',
  'P-009': 'gameability',
  'P-010': 'defect',
  'P-011': 'defect',
  'P-012': 'defect',
  'P-013': 'defect',
  'P-014': 'zero-action',
  'P-016': 'zero-action',
  'P-017': 'gameability',
};
const HELD_OUT_IDS = ['P-010', 'P-011', 'P-012', 'P-013'];
const DEVELOPMENT_IDS = Object.keys(PROBE_CLASSES).filter((id) => !HELD_OUT_IDS.includes(id));

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
    const folder = path.join(FIXTURE, phase, 'evaluation');
    const evaluation = readJson(path.join(folder, 'evaluation.json'));
    assert.deepEqual(evaluation.heldOutProbes, HELD_OUT_IDS, `${phase} held-out IDs changed`);
    const probeFiles = filesUnder(path.join(folder, 'probes')).filter((file) => file.endsWith('.probe.json'));
    assert.deepEqual(
      probeFiles.map((file) => path.basename(file, '.probe.json')),
      Object.keys(PROBE_CLASSES).sort(),
      `${phase} probe inventory changed`,
    );
    for (const id of Object.keys(PROBE_CLASSES)) {
      const probe = readJson(path.join(folder, 'probes', `${id}.probe.json`));
      assert.equal(probe.probeId, id);
      assert.equal(probe.probeClass, PROBE_CLASSES[id], `${phase} ${id} class changed`);
      assert.equal(probe.expectedClean, PROBE_CLASSES[id] === 'zero-action', `${phase} ${id} clean status changed`);
    }
  }
  const before = path.join(FIXTURE, 'before/evaluation');
  const original = path.join(SOURCE, 'evaluation');
  const beforeFiles = new Set(filesUnder(before, EXCLUDED));
  const originalFiles = new Set(filesUnder(original, EXCLUDED));
  const omitted = [...originalFiles].filter((file) => !beforeFiles.has(file)).sort();
  assert.deepEqual(omitted, ['adapter/README.md', 'gap-report.md'], 'before omitted an unexpected Story 1.24 source file');
  assert.deepEqual(
    [...beforeFiles].filter((file) => !originalFiles.has(file)),
    [],
    'before added an unexpected source file',
  );
  const changed = [...beforeFiles]
    .filter((file) => !fs.readFileSync(path.join(before, file)).equals(fs.readFileSync(path.join(original, file))))
    .sort();
  assert.deepEqual(
    changed,
    [
      'compiled-contract.json',
      'contract.json',
      'corpus-index.json',
      'corpus/gameability/P-009.json',
      'corpus/gameability/P-017.json',
      'sealed-brief.json',
    ],
    'before differs from Story 1.24 outside the two seeds and generated files',
  );
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
  assert.ok(!('evaluation/gap-report.md' in blind.initialFiles), 'historical gap report reached the blind session');
  assert.ok(!('evaluation/adapter/README.md' in blind.initialFiles), 'historical adapter hint reached the blind session');
  for (const [file, hash] of Object.entries(blind.initialFiles)) {
    assert.doesNotMatch(file, /SEEDED\.md|held-out|P-01[0-3]\.probe\.json/);
    let bytes;
    switch (file) {
      case 'evaluation/evaluation.json': {
        const manifest = readJson(path.join(before, file));
        manifest.heldOutProbes = [];
        bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
        break;
      }
      case 'gaps.md': {
        bytes = fs.readFileSync(path.join(FIXTURE, 'blind/gaps.md'));
        break;
      }
      case 'evaluation/corpus-index.json': {
        bytes = fs.readFileSync(path.join(FIXTURE, 'blind/corpus-index.json'));
        break;
      }
      case 'evidence/w1-gameability.json': {
        bytes = fs.readFileSync(
          path.join(before, 'evaluation/replay/gameability-diagnostic/qualification/P-009/disciplined-oracle-rejected.json'),
        );
        break;
      }
      case 'evidence/development-first-stop.json': {
        bytes = fs.readFileSync(path.join(before, 'evaluation/replay/development-stopped/qualification/P-007/mutated-fail.json'));
        break;
      }
      case 'evidence/w2-coverage.json': {
        bytes = fs.readFileSync(path.join(before, 'evaluation/replay/coverage-diagnostic.json'));
        break;
      }
      default: {
        bytes = fs.readFileSync(path.join(before, file));
      }
    }
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), hash, `${file} blind input changed`);
    const suppliedText = bytes.toString('utf8');
    const leakPattern =
      file === 'gaps.md'
        ? /typed-file|pre-seed|\bW[12]\b|O-003|test-review|historical held-out|held-out scores|all \d+ scored|2026092[89]T\d{9}Z|held-out.{0,100}(?:3\/3|three of three|zero coverage gaps)/i
        : /type-violating|typed-file|pre-seed|\bW[12]\b|historical held-out|held-out scores|all \d+ scored|2026092[89]T\d{9}Z|held-out.{0,100}(?:3\/3|three of three|zero coverage gaps)/i;
    assert.doesNotMatch(suppliedText, leakPattern, `${file} exposes a repair hint or historical held-out outcome`);
  }
}

function checkGuide() {
  for (const file of [path.join(FIXTURE, 'blind/gaps.md'), GUIDE]) {
    const guide = fs.readFileSync(file, 'utf8');
    const row = guide.split('\n').find((line) => /^\| `malformed-input`\s+\|/.test(line));
    assert.ok(row, `${file} lacks malformed-input guidance`);
    assert.match(row, /each operation declaring a request key/);
    assert.match(row, /type-violating/);
    assert.match(row, /oracle check/);
    assert.match(guide, /"requestKey":\s*\{\s*"matcher":\s*"type-violating"\s*\}/);
  }
}

function checkBlockedBlindSessions() {
  const finalInputs = readJson(path.join(FIXTURE, 'blind-inputs.json')).initialFiles;
  const sessions = [
    [
      'r2',
      '20260929T041030384Z-f42b06f1',
      '20260929T041118138Z-95557dd4',
      'cddeb8df160bc0aa1dfa4deecd830b4c83f56314025ef0bd41239e526f1a4b4f',
    ],
    [
      'r3',
      '20260929T042912394Z-58dfda95',
      '20260929T042952889Z-e93cfbe1',
      '6992635fbb71fea20341633b8c63f301c12afacfa090637948aa2cca6b4d77e5',
    ],
  ];
  for (const [name, runId, scoreId, artifactHash] of sessions) {
    const inputs = readJson(path.join(FIXTURE, 'blind', `${name}-inputs.json`));
    assert.deepEqual(Object.keys(inputs.initialFiles).sort(), Object.keys(finalInputs).sort(), `${name} input set drifted`);
    for (const [file, hash] of Object.entries(inputs.initialFiles)) {
      if (file !== 'gaps.md') assert.equal(hash, finalInputs[file], `${name} ${file} differs from the final seeded input`);
    }
    assert.equal(sha256(path.join(FIXTURE, 'blind', `${name}-gaps.md`)), inputs.initialFiles['gaps.md']);
    assert.ok(!('evaluation/gap-report.md' in inputs.initialFiles));
    assert.ok(!('evaluation/adapter/README.md' in inputs.initialFiles));
    const transcript = fs.readFileSync(path.join(FIXTURE, 'blind', `${name}-session-transcript.md`), 'utf8');
    const report = fs.readFileSync(path.join(FIXTURE, 'blind', `${name}-gap-report.md`), 'utf8');
    assert.ok(transcript.includes(runId) && transcript.includes(scoreId), `${name} blocker run is unattributed`);
    assert.ok(report.includes(runId) && report.includes(scoreId), `${name} blocker report is unattributed`);
    assert.match(report, /malformed-input/);
    const file = path.join(FIXTURE, 'blind', `${name}-blocker-score.json`);
    assert.equal(sha256(file), artifactHash);
    const scored = readJson(file);
    assert.equal(scored.runId, `${runId}-P-018`);
    assert.equal(scored.contractVerdict, 'CONCERNS');
    assert.deepEqual(
      scored.coverageGaps.filter((gap) => !gap.satisfied).map((gap) => [gap.rule, gap.severity]),
      [['malformed-input', 'critical']],
    );
    assert.deepEqual(
      scored.reducedProbeOutcomes[0].trialVotes.map((vote) => vote.state),
      ['caught', 'caught', 'caught'],
    );
  }
}

function checkBlindDiscovery() {
  const file = path.join(FIXTURE, 'blind/r4-discovery-score.json');
  assert.equal(sha256(file), 'b7b4c84e7cc88195ad212651f706743c99f66f93dedef81cd394403890ba4a58');
  const scored = readJson(file);
  assert.equal(scored.runId, '20260929T043419685Z-5d865dcf-P-009');
  assert.equal(scored.contractVerdict, 'PASS');
  assert.deepEqual(
    scored.coverageGaps.filter((gap) => !gap.satisfied),
    [],
  );
  assert.deepEqual(
    scored.reducedProbeOutcomes[0].trialVotes.map((vote) => vote.state),
    ['caught', 'caught', 'caught'],
  );
  const report = fs.readFileSync(path.join(FIXTURE, 'gap-report.md'), 'utf8');
  const transcript = fs.readFileSync(path.join(FIXTURE, 'session-transcript.md'), 'utf8');
  for (const id of ['20260929T043419685Z-5d865dcf', '20260929T043457320Z-94f603cf']) {
    assert.ok(report.includes(id) && transcript.includes(id), `blind discovery score ${id} is unattributed`);
  }
}

function checkIntermediateDevelopment() {
  const artifact = path.join(FIXTURE, 'blind/intermediate-development-score.json');
  assert.equal(sha256(artifact), '1826019ede41e901faf2a197f89ac1c425171abee8f61477a22775c4515fcbfa');
  const scored = readJson(artifact);
  assert.equal(scored.runId, '20260929T035801825Z-b5cb51ff-P-009');
  assert.equal(scored.scoredProbeId, 'P-009');
  assert.equal(scored.contractVerdict, 'CONCERNS');
  assert.deepEqual(
    scored.coverageGaps.filter((gap) => !gap.satisfied).map((gap) => [gap.rule, gap.severity]),
    [['malformed-input', 'critical']],
  );
  assert.deepEqual(
    scored.reducedProbeOutcomes[0].trialVotes.map((vote) => vote.state),
    ['caught', 'caught', 'caught'],
  );
  const transcript = fs.readFileSync(path.join(FIXTURE, 'blind/r2-session-transcript.md'), 'utf8');
  assert.match(transcript, /20260929T035801825Z-b5cb51ff/);
  assert.match(transcript, /20260929T035839151Z-e5c0085e/);
}

function checkGenerated(folder, out) {
  const phase = path.basename(path.dirname(folder));
  const compiled = path.join(out, `${phase}-compiled-contract.json`);
  const sealed = path.join(out, `${phase}-sealed-brief.json`);
  run(ENGINE, ['compile', '--in', path.join(folder, 'contract.json'), '--out', compiled]);
  run(ENGINE, ['seal', '--in', path.join(folder, 'contract.json'), '--out', sealed]);
  sameBytes(compiled, path.join(folder, 'compiled-contract.json'), `${phase} authored compile`);
  sameBytes(sealed, path.join(folder, 'sealed-brief.json'), `${phase} authored seal`);
  return { compiled, sealed };
}

function observationsFromSteps(steps) {
  return Object.fromEntries(
    steps
      .filter((step) => step.observation)
      .map((step, index) => [
        step.stepId,
        recordObservation({
          observationId: step.observation.probeId,
          sequence: index + 1,
          operationId: step.observation.operationId,
          callInputs: {},
          stdout: step.observation.stdout,
          stderr: step.observation.stderr,
          exitCode: step.observation.exitCode,
          artifacts: step.observation.artifacts,
          provenance: 'baseline',
        }),
      ]),
  );
}

function pointersIn(value) {
  if (Array.isArray(value)) return value.flatMap(pointersIn);
  if (value === null || typeof value !== 'object') return [];
  return [...(typeof value.pointer === 'string' ? [value.pointer] : []), ...Object.values(value).flatMap(pointersIn)];
}

function checkSeedContract() {
  const original = readJson(path.join(SOURCE, 'evaluation/contract.json'));
  const before = readJson(path.join(FIXTURE, 'before/evaluation/contract.json'));
  const after = readJson(path.join(FIXTURE, 'after/evaluation/contract.json'));
  const typed = (contract) => contract.interactionPlan.filter((step) => step.stepId === 'typed-file');
  assert.equal(typed(original).length, 1, 'Story 1.24 lacks the typed interaction');
  assert.equal(typed(before).length, 0, 'W2 typed interaction survived the seed');
  assert.equal(typed(after).length, 1, 'the repair lacks the typed interaction');
  assert.deepEqual(typed(after)[0], typed(original)[0], 'the repaired typed interaction differs from Story 1.24');
  const typedPointers = ['/interactions/typed-file/exit-code', '/interactions/typed-file/stdout/error'];
  for (const [label, contract, expected] of [
    ['Story 1.24', original, typedPointers],
    ['before', before, []],
    ['after', after, typedPointers],
  ]) {
    const oracle = contract.oracles.find((item) => item.id === 'O-004');
    assert.deepEqual(
      oracle.direction.evidenceTargets.filter((pointer) => pointer.startsWith('/interactions/typed-file/')),
      expected,
      `${label} O-004 direction typed pointers`,
    );
    assert.deepEqual(
      pointersIn(oracle.check).filter((pointer) => pointer.startsWith('/interactions/typed-file/')),
      expected,
      `${label} O-004 check typed pointers`,
    );
  }
  const expected = structuredClone(original);
  const o003 = expected.oracles.find((oracle) => oracle.id === 'O-003');
  o003.commentary = 'The active match assertion accepts clean or the missing-assertion finding.';
  const match = o003.check.operands[1].operands[1];
  assert.deepEqual(match.operands[0], { pointer: '/interactions/match/stdout' });
  o003.check.operands[1].operands[1] = {
    op: 'any',
    operands: [
      match,
      {
        op: 'equality',
        operands: [
          match.operands[0],
          { literal: { file: 'cases/clean-assert-match.test.js', status: 'findings', findings: ['missing-assertion'] } },
        ],
      },
    ],
  };
  const o004 = expected.oracles.find((oracle) => oracle.id === 'O-004');
  o004.direction.evidenceTargets = o004.direction.evidenceTargets.filter((pointer) => !pointer.startsWith('/interactions/typed-file/'));
  o004.check.operands = o004.check.operands.filter(
    (operand) => !pointersIn(operand).some((pointer) => pointer.startsWith('/interactions/typed-file/')),
  );
  expected.interactionPlan = expected.interactionPlan.filter((step) => step.stepId !== 'typed-file');
  assert.deepEqual(before, expected, 'before contract has a change beyond W1 and W2');
  for (const id of ['P-009', 'P-017']) {
    const sourceMap = readJson(path.join(SOURCE, 'evaluation/corpus/gameability', `${id}.json`));
    const beforeMap = readJson(path.join(FIXTURE, 'before/evaluation/corpus/gameability', `${id}.json`));
    delete sourceMap.steps['typed-file'];
    assert.deepEqual(beforeMap, sourceMap, `${id} before response map has an extra change`);
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
  const mutation = readJson(path.join(folder, 'mutations/M-003.mutation.json'));
  const p007 = readJson(path.join(folder, 'probes/P-007.probe.json'));
  assert.equal(p007.qualification.mutation, 'M-003');
  assert.equal(firstStop.mutationId, 'M-003');
  assert.equal(firstStop.targetArtifact, mutation.targetArtifact);
  const original = fs.readFileSync(path.join(FIXTURE, 'before/target', mutation.targetArtifact), 'utf8');
  assert.equal(original.split(mutation.operator.find).length - 1, mutation.operator.occurrences);
  const mutated = original.replace(mutation.operator.find, mutation.operator.replace);
  assert.equal(firstStop.targetArtifactDigest, `sha256:${crypto.createHash('sha256').update(mutated).digest('hex')}`);
  const policy = readJson(path.join(folder, 'policy/scoring-policy.json'));
  const recomputed = await evaluateOracles({
    contract,
    stepObservations: observationsFromSteps(firstStop.steps),
    oracleIds: ['O-003'],
    regexMatchStepBudget: policy.regexMatchStepBudget,
  });
  assert.deepEqual(recomputed, firstStop.oracles, 'P-007 first-stop oracle changed from its saved observations');
  assert.equal(armVerdict(recomputed), firstStop.verdict);
  sameBytes(path.join(folder, 'contract.json'), path.join(folder, 'replay/development-stopped/contract.json'), 'first-stop contract');

  const probe = readJson(path.join(folder, 'probes/P-009.probe.json'));
  const responseFile = path.join(folder, 'corpus/gameability/P-009.json');
  const response = readJson(responseFile);
  const evaluation = readJson(path.join(folder, 'evaluation.json'));
  const registry = registryFromEvaluation(evaluation, { root: path.join(FIXTURE, 'before/target') });
  const arm = await degenerateArm({ contract, registry, steps: response.steps, label: 'degenerate', provenance: 'baseline' });
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

async function checkQualification(folder, replay, runId, probe, source) {
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
    const oracleIds = {
      'P-009': ['O-001', 'O-003'],
      'P-017': ['O-003', 'O-001'],
    }[probe.probeId];
    assert.ok(oracleIds, `${probe.probeId} is an unexpected gameability probe`);
    const policy = readJson(path.join(folder, 'policy/scoring-policy.json'));
    for (const [index, [field, phase, expected]] of phases.entries()) {
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
      const oracles = await evaluateOracles({
        contract: readJson(path.join(folder, 'contract.json')),
        stepObservations: observationsFromSteps(evidence.steps),
        oracleIds: [oracleIds[index]],
        regexMatchStepBudget: policy.regexMatchStepBudget,
      });
      assert.deepEqual(oracles, evidence.oracles, `${probe.probeId} ${phase} oracle changed from its recorded response`);
      assert.equal(armVerdict(oracles), evidence.verdict, `${probe.probeId} ${phase} verdict changed`);
    }
    return;
  }

  const baseline = qualificationEvidence(replay, runId, probe, 'baselinePassEvidence');
  assert.equal(baseline.probeId, probe.probeId);
  assert.equal(baseline.verdict, 'held');
  const contract = readJson(path.join(folder, 'contract.json'));
  const policy = readJson(path.join(folder, 'policy/scoring-policy.json'));
  const oracleIds = oraclesOfBehaviors(contract, [source.behaviorId]);
  const checkSavedPhase = async (phase, label) => {
    const oracles = await evaluateOracles({
      contract,
      stepObservations: observationsFromSteps(phase.steps),
      oracleIds,
      regexMatchStepBudget: policy.regexMatchStepBudget,
    });
    assert.deepEqual(oracles, phase.oracles, `${probe.probeId} ${label} oracle rows changed`);
    assert.equal(armVerdict(oracles), phase.verdict, `${probe.probeId} ${label} verdict changed`);
  };
  await checkSavedPhase(baseline, 'baseline');
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
  await checkSavedPhase(mutated, 'mutated');
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
  for (const [index, rePass] of rollback.rePasses.entries()) await checkSavedPhase(rePass, `re-pass ${index + 1}`);
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

async function checkDistinctMalformedSteps(folder) {
  const contract = readJson(path.join(folder, 'contract.json'));
  const byStep = new Map(contract.interactionPlan.map((step) => [step.stepId, step]));
  const raw = byStep.get('wrong-file-type');
  const typed = byStep.get('typed-file');
  assert.ok(raw && typed, 'the raw and typed malformed interactions must both exist');
  assert.equal(
    raw.inputBinding.stdin.raw.literal,
    fs.readFileSync(path.join(folder, 'corpus/requests/wrongFileType.stdin'), 'utf8').trim(),
  );
  assert.equal(typed.operationId, raw.operationId);
  assert.deepEqual(typed.inputBinding.stdin.file, { matcher: 'type-violating' });
  const oracle = contract.oracles.find((candidate) => candidate.id === 'O-004');
  const checks = pointersIn(oracle.check);
  for (const stepId of ['wrong-file-type', 'typed-file']) {
    assert.ok(oracle.direction.evidenceTargets.some((pointer) => pointer.startsWith(`/interactions/${stepId}/`)));
    assert.ok(checks.includes(`/interactions/${stepId}/stdout/error`));
    assert.ok(checks.includes(`/interactions/${stepId}/exit-code`));
  }
  for (const id of ['P-009', 'P-017']) {
    const response = readJson(path.join(folder, 'corpus/gameability', `${id}.json`));
    assert.ok(response.steps['typed-file'], `${id} lacks the typed malformed response`);
  }
  const clean = readJson(path.join(folder, 'replay/development/trials/clean/trial-1.json'));
  const steps = new Map(clean.steps.map((step) => [step.stepId, step]));
  assert.deepEqual(steps.get('wrong-file-type').request.channels.stdin, {
    kind: 'text',
    value: raw.inputBinding.stdin.raw.literal,
  });
  assert.equal(steps.get('typed-file').request.channels.stdin.kind, 'json');
  assert.equal(typeof steps.get('typed-file').request.channels.stdin.value.file, 'number');
  assert.deepEqual(steps.get('wrong-file-type').observation.stdout, steps.get('typed-file').observation.stdout);
  const documented = 'provide a JSON object with action review and a file string';
  assert.deepEqual(steps.get('typed-file').observation.stdout.value, { error: documented });
  assert.equal(steps.get('typed-file').observation.exitCode, 0);
  const policy = readJson(path.join(folder, 'policy/scoring-policy.json'));
  const resolve = async (observations) =>
    evaluateOracles({
      contract,
      stepObservations: observations,
      oracleIds: ['O-004'],
      regexMatchStepBudget: policy.regexMatchStepBudget,
    });
  const original = observationsFromSteps(clean.steps);
  assert.equal((await resolve(original))[0].disposition, 'held');
  const wrongError = structuredClone(original);
  wrongError['typed-file'].stdout.value.error = 'unexpected error';
  assert.equal((await resolve(wrongError))[0].disposition, 'violated', 'O-004 accepted a wrong typed-file error');
  const wrongExit = structuredClone(original);
  wrongExit['typed-file'].exitCode = 1;
  assert.equal((await resolve(wrongExit))[0].disposition, 'violated', 'O-004 accepted a nonzero typed-file exit');
}

async function replayRun(folder, runName, out, expectedVerdict, generated) {
  const replay = path.join(folder, 'replay', runName);
  sameBytes(path.join(folder, 'contract.json'), path.join(replay, 'contract.json'), `${runName} authored contract`);
  sameBytes(generated.compiled, path.join(replay, 'eval-contract.json'), `${runName} generated compile`);
  sameBytes(generated.sealed, path.join(replay, 'sealed-evaluator-brief.json'), `${runName} generated seal`);
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
  const expectedIds = runName === 'held-out' ? HELD_OUT_IDS : DEVELOPMENT_IDS;
  const authoredIds = fs
    .readdirSync(path.join(folder, 'probes'))
    .filter((name) => name.endsWith('.probe.json'))
    .map((name) => path.basename(name, '.probe.json'));
  assert.deepEqual(authoredIds.sort(), Object.keys(PROBE_CLASSES).sort(), `${runName} authored probe inventory changed`);
  assert.deepEqual([...heldOut].sort(), HELD_OUT_IDS, `${runName} held-out IDs changed`);
  assert.deepEqual(index.trialSets.map((set) => set.probeId).sort(), expectedIds.sort(), `${runName} partition omitted a probe`);
  const qualifiedProbes = filesUnder(path.join(replay, 'probes'))
    .filter((file) => file.endsWith('.probe.json'))
    .map((file) => readJson(path.join(replay, 'probes', file)));
  assert.deepEqual(qualifiedProbes.map((probe) => probe.probeId).sort(), expectedIds, `${runName} qualified probe inventory changed`);
  const targetDigest = treeDigest(path.join(path.dirname(folder), 'target'));
  for (const probe of qualifiedProbes) {
    const source = readJson(path.join(folder, 'probes', `${probe.probeId}.probe.json`));
    assert.deepEqual(authoredProbeFields(probe, Object.keys(source)), authoredProbeFields(source, Object.keys(source)));
    assert.equal(probe.implementationDigest, targetDigest);
    assert.equal(probe.commitDigest, targetDigest);
    await checkQualification(folder, replay, runRecord.invocationId, probe, source);
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
  assert.deepEqual(
    Object.keys(runRecord.artifacts.records).sort(),
    index.trialSets.flatMap((set) => set.records).sort(),
    `${runName} run record digest map differs from sealed trial sets`,
  );
  for (const set of index.trialSets) {
    const sourceProbe = readJson(path.join(folder, 'probes', `${set.probeId}.probe.json`));
    const scoredProbe = readJson(path.join(replay, set.probe));
    assert.deepEqual(
      authoredProbeFields(scoredProbe, Object.keys(sourceProbe)),
      authoredProbeFields(sourceProbe, Object.keys(sourceProbe)),
      `${runName} ${set.probeId} source probe`,
    );
    assert.equal(set.records.length, 3, `${runName} ${set.probeId} trial count`);
    for (const [trialIndex, recordPath] of set.records.entries()) {
      assert.equal(recordPath, `trial-sets/${set.probeId}/record-${trialIndex + 1}.json`);
      const recordFile = path.join(replay, recordPath);
      assert.equal(digest(recordFile), runRecord.artifacts.records[recordPath], `${runName} ${set.probeId} record digest`);
      const record = readJson(recordFile);
      assert.equal(record.runId, set.runId);
      assert.equal(record.conditionArm, set.conditionArm);
      assert.equal(record.trialIndex, trialIndex + 1);
      const actionPath = `trials/${set.conditionArm.replace(':', '-')}/trial-${trialIndex + 1}.json`;
      const actionFile = path.join(replay, actionPath);
      assert.deepEqual(record.actionsArtifact, {
        path: `runs/${runRecord.invocationId}/${actionPath}`,
        digest: digest(actionFile),
        privateRef: null,
        storage: 'public',
      });
      const actions = readJson(actionFile);
      assert.equal(actions.conditionArm, set.conditionArm);
      assert.equal(actions.trialIndex, trialIndex + 1);
      const observedSteps = actions.steps.filter((step) => step.observation);
      assert.equal(record.observations.length, observedSteps.length);
      for (const [index, step] of observedSteps.entries()) {
        const observation = record.observations[index];
        assert.equal(observation.observationId, step.observation.probeId);
        assert.equal(observation.operationId, step.observation.operationId);
        assert.deepEqual(observation.stdout, step.observation.stdout);
        assert.deepEqual(observation.stderr, step.observation.stderr);
        assert.equal(observation.exitCode, step.observation.exitCode);
      }
    }
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
  checkSeedContract();
  checkGapReport();
  checkBlindInputs();
  checkGuide();
  checkBlockedBlindSessions();
  checkBlindDiscovery();
  checkIntermediateDevelopment();
  const before = path.join(FIXTURE, 'before/evaluation');
  const after = path.join(FIXTURE, 'after/evaluation');
  await checkDistinctMalformedSteps(after);
  checkHeldOutInputIsolation(after);
  checkReplayManifest(before, ['held-out']);
  checkReplayManifest(after, ['development', 'held-out']);
  await checkBeforeDiagnostics();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-evaluate-gap-loop-'));
  try {
    const beforeGenerated = checkGenerated(before, out);
    const afterGenerated = checkGenerated(after, out);
    await replayRun(before, 'held-out', out, 'CONCERNS', beforeGenerated);
    for (const runName of ['development', 'held-out']) await replayRun(after, runName, out, 'PASS', afterGenerated);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
  console.log('ok Evaluate gap loop replayed before and after evidence byte for byte');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
