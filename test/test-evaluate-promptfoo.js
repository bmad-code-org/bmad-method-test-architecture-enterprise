/** Deterministic promptfoo assertions imported through Evaluate's judgment rows. */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { ENGINE_CLI_ENV } = require('../cli/lib/evaluate/engine');
const { judgmentFromRows } = require('../cli/lib/evaluate/judgment-rows');

const ROOT = path.join(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixtures', 'evaluate-promptfoo');
const EVALUATION = path.join('evals', 'summary');
const EVALUATOR = path.join(FIXTURE, EVALUATION, 'evaluator');
const CLI = path.join(ROOT, 'cli', 'evaluate.js');
const failures = [];
const projects = [];
let checks = 0;
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== ENGINE_CLI_ENV && !key.startsWith('GIT_')));

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function command(bin, args, options = {}) {
  const result = spawnSync(bin, args, { cwd: ROOT, encoding: 'utf8', timeout: 180_000, env, ...options });
  if (result.error) throw result.error;
  return { status: result.status, output: `${result.stdout}${result.stderr}`, stdout: result.stdout };
}

function read(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function nodeFloor(nvmrc, requirement, runtime = process.version, spawn = () => {}) {
  const match = /^>=\s*(\d+)\.(\d+)\.(\d+)$/.exec(requirement);
  if (!match) throw new Error(`unsupported promptfoo Node requirement ${requirement}`);
  const minimum = match.slice(1).map(Number);
  for (const [source, version] of [
    ['.nvmrc', fs.readFileSync(nvmrc, 'utf8').trim()],
    ['running Node', runtime],
  ]) {
    const parts = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/
      .exec(version)
      ?.slice(1)
      .map((part) => Number(part ?? 0));
    if (!parts) {
      throw new Error(`promptfoo requires Node ${requirement}; ${source} selects ${version}`);
    }
    const difference = parts.findIndex((part, index) => part !== minimum[index]);
    if (difference !== -1 && parts[difference] < minimum[difference]) {
      throw new Error(`promptfoo requires Node ${requirement}; ${source} selects ${version}`);
    }
  }
  spawn();
}

function engine() {
  const packageFile = path.join(ROOT, 'node_modules', 'promptfoo', 'package.json');
  const installed = read(packageFile);
  const requirement = installed.engines.node;
  check(read(path.join(ROOT, 'package.json')).devDependencies.promptfoo === 'latest', 'promptfoo must use the latest spec');
  check(installed.license === 'MIT', `promptfoo ${installed.version} has licence ${installed.license}`);
  let spawned = false;
  nodeFloor(path.join(ROOT, '.nvmrc'), requirement, process.version, () => {
    spawned = true;
  });
  check(spawned, 'the repository Node major failed promptfoo engine preflight');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-promptfoo-node-'));
  try {
    const minimum = /^>=\s*(\d+)\.(\d+)\.(\d+)$/.exec(requirement);
    const floor = minimum.slice(1).join('.');
    const below =
      Number(minimum[3]) > 0
        ? `${minimum[1]}.${minimum[2]}.${Number(minimum[3]) - 1}`
        : Number(minimum[2]) > 0
          ? `${minimum[1]}.${Number(minimum[2]) - 1}.99`
          : `${Number(minimum[1]) - 1}.99.99`;
    fs.writeFileSync(path.join(temp, '.nvmrc'), `${floor}\n`);
    spawned = false;
    nodeFloor(path.join(temp, '.nvmrc'), requirement, `v${floor}`, () => {
      spawned = true;
    });
    check(spawned, `the exact Node floor ${floor} was rejected`);
    fs.writeFileSync(path.join(temp, '.nvmrc'), `${below}\n`);
    spawned = false;
    let message = '';
    try {
      nodeFloor(path.join(temp, '.nvmrc'), requirement, process.version, () => {
        spawned = true;
      });
    } catch (error) {
      message = error.message;
    }
    check(
      message.includes(`promptfoo requires Node ${requirement}`),
      `the insufficient Node major did not name ${requirement}: ${message}`,
    );
    check(!spawned, 'the insufficient .nvmrc Node version spawned promptfoo');
    fs.writeFileSync(path.join(temp, '.nvmrc'), `${floor}\n`);
    spawned = false;
    message = '';
    try {
      nodeFloor(path.join(temp, '.nvmrc'), requirement, `v${below}`, () => {
        spawned = true;
      });
    } catch (error) {
      message = error.message;
    }
    check(message.includes('running Node') && message.includes(requirement), `the running Node floor was not reported: ${message}`);
    check(!spawned, 'the insufficient running Node spawned promptfoo');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
  return installed;
}

function observed(stdout) {
  return { observationId: 'trial-1-summarize', stdout: { kind: 'text', value: stdout } };
}

function directEvaluator() {
  const file = path.join(EVALUATOR, 'promptfoo.mjs');
  for (const [label, stdout, expected] of [
    ['clean', 'Summary for List pantry: apples, pears\n', ['pass', 'pass', 'pass']],
    ['omitted item', 'Summary for List pantry: apples\n', ['pass', 'fail', 'pass']],
    ['forbidden item', 'Summary for List pantry: apples, pears, shellfish\n', ['pass', 'pass', 'fail']],
  ]) {
    const result = command(file, [], { input: JSON.stringify({ sealedBrief: {}, observations: [observed(stdout)] }) });
    check(result.status === 0, `${label}: evaluator exited ${result.status}: ${result.output}`);
    if (result.status !== 0) continue;
    const rows = JSON.parse(result.stdout).rows;
    check(
      rows.length === 3 && rows.map((row) => row.outcome).join(',') === expected.join(','),
      `${label}: wrong assertion rows ${JSON.stringify(rows)}`,
    );
    check(
      rows.every((row) => row.observationIds[0] === 'trial-1-summarize'),
      `${label}: a row lost the stdout observation`,
    );
    for (const row of rows.filter((item) => item.outcome === 'fail')) {
      check(row.quoteChannel === 'stdout' && stdout.includes(row.quote), `${label}: failed row does not quote observed stdout`);
    }
    if (label === 'forbidden item') {
      check(rows[2]?.key === 'forbidden-shellfish', `forbidden item mapped to ${rows[2]?.key}`);
      const judgment = judgmentFromRows({
        contract: read(path.join(FIXTURE, EVALUATION, 'contract.json')),
        mapping: read(path.join(EVALUATOR, 'mapping.json')),
        answer: { rows },
        probeId: 'P-003',
        behaviorIds: ['B-003'],
      });
      check(
        judgment.findings.some((finding) => finding.oracleId === 'O-003'),
        'forbidden shellfish did not map to O-003',
      );
    }
  }
  const source = fs.readFileSync(file, 'utf8');
  for (const flag of [
    '--assertions',
    '--model-outputs',
    '--output',
    '--no-cache',
    'PROMPTFOO_DISABLE_TELEMETRY',
    'PROMPTFOO_DISABLE_UPDATE',
  ]) {
    check(source.includes(flag), `evaluator omitted promptfoo control ${flag}`);
  }
  check(!source.includes('...process.env'), 'evaluator passed inherited credentials to promptfoo');
  const assertionTypes = [...fs.readFileSync(path.join(EVALUATOR, 'asserts.yaml'), 'utf8').matchAll(/^- type: (\S+)/gm)].map(
    (match) => match[1],
  );
  check(
    assertionTypes.length === 3 && assertionTypes.every((type) => ['contains', 'not-contains'].includes(type)),
    `fixture assertions require a model or changed shape: ${assertionTypes.join(', ')}`,
  );
}

function childInvocation() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-promptfoo-spawn-'));
  try {
    const preload = path.join(temporary, 'capture.cjs');
    const captureFile = path.join(temporary, 'spawn.json');
    fs.writeFileSync(
      preload,
      `const child = require('node:child_process');
const fs = require('node:fs');
const { syncBuiltinESMExports } = require('node:module');
const original = child.spawnSync;
child.spawnSync = (...arguments_) => {
  fs.writeFileSync(process.env.TEA_PROMPTFOO_CAPTURE, JSON.stringify({ executable: arguments_[0], args: arguments_[1], options: arguments_[2] }));
  return original(...arguments_);
};
syncBuiltinESMExports();
`,
    );
    const stdout = 'Summary for List pantry: apples, pears\n';
    const result = command(path.join(EVALUATOR, 'promptfoo.mjs'), [], {
      input: JSON.stringify({ sealedBrief: {}, observations: [observed(stdout)] }),
      env: {
        ...env,
        NODE_OPTIONS: `--require=${preload}`,
        TEA_PROMPTFOO_CAPTURE: captureFile,
        OPENAI_API_KEY: 'must-not-reach-promptfoo',
        ANTHROPIC_API_KEY: 'must-not-reach-promptfoo',
      },
    });
    check(result.status === 0, `captured evaluator exited ${result.status}: ${result.output}`);
    check(fs.existsSync(captureFile), 'evaluator did not spawn a captured promptfoo child');
    if (!fs.existsSync(captureFile)) return;
    const capture = read(captureFile);
    check(capture.executable === process.execPath, `promptfoo child used ${capture.executable}`);
    const installed = read(path.join(ROOT, 'node_modules', 'promptfoo', 'package.json'));
    check(
      capture.args?.[0] === path.join(ROOT, 'node_modules', 'promptfoo', installed.bin.promptfoo),
      `promptfoo child used ${capture.args?.[0]}`,
    );
    check(
      JSON.stringify(capture.args.slice(1)) ===
        JSON.stringify([
          'eval',
          '--assertions',
          'asserts.yaml',
          '--model-outputs',
          'outputs.json',
          '--output',
          'results.jsonl',
          '--no-cache',
          '--no-write',
          '--no-table',
        ]),
      `promptfoo child arguments changed: ${capture.args.join(' ')}`,
    );
    check(capture.options?.cwd.startsWith(os.tmpdir()), `promptfoo child wrote under ${capture.options?.cwd}`);
    check(capture.options?.env.PROMPTFOO_DISABLE_TELEMETRY === '1', 'promptfoo child enabled telemetry');
    check(capture.options?.env.PROMPTFOO_DISABLE_UPDATE === '1', 'promptfoo child enabled update checks');
    check(
      JSON.stringify(Object.keys(capture.options.env).sort()) ===
        JSON.stringify(['HOME', 'LANG', 'PATH', 'PROMPTFOO_DISABLE_TELEMETRY', 'PROMPTFOO_DISABLE_UPDATE', 'TMPDIR'].sort()),
      `promptfoo child environment changed: ${Object.keys(capture.options.env).join(', ')}`,
    );
    check(
      ['NODE_OPTIONS', 'TEA_PROMPTFOO_CAPTURE', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY'].every((key) => !(key in capture.options.env)),
      'promptfoo child inherited evaluator credentials or the capture hook',
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function promptfooResult(assertionFile, stdout, expectedStatus = 0) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-promptfoo-shape-'));
  try {
    fs.writeFileSync(path.join(temporary, 'outputs.json'), JSON.stringify([stdout]));
    fs.copyFileSync(path.join(EVALUATOR, assertionFile), path.join(temporary, 'asserts.yaml'));
    const result = command(
      path.join(ROOT, 'node_modules', '.bin', 'promptfoo'),
      [
        'eval',
        '--assertions',
        'asserts.yaml',
        '--model-outputs',
        'outputs.json',
        '--output',
        'results.jsonl',
        '--no-cache',
        '--no-write',
        '--no-table',
      ],
      {
        cwd: temporary,
        env: { ...env, PROMPTFOO_DISABLE_TELEMETRY: '1', PROMPTFOO_DISABLE_UPDATE: '1' },
      },
    );
    check(
      result.status === expectedStatus,
      `${assertionFile}: promptfoo exited ${result.status}, expected ${expectedStatus}: ${result.output}`,
    );
    const file = path.join(temporary, 'results.jsonl');
    check(fs.existsSync(file), `${assertionFile}: promptfoo produced no JSONL: ${result.output}`);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8').trim()) : null;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function mapResults(results, observation) {
  const result = command(path.join(EVALUATOR, 'promptfoo.mjs'), ['--map-results'], {
    input: JSON.stringify({ results, observation }),
  });
  check(result.status === 0, `promptfoo result import exited ${result.status}: ${result.output}`);
  return result.status === 0 ? JSON.parse(result.stdout).rows : [];
}

function refuseResults(results, observation, expectedMessage, status) {
  const result = command(path.join(EVALUATOR, 'promptfoo.mjs'), ['--map-results'], {
    input: JSON.stringify({ results, observation, status }),
  });
  check(result.status !== 0 && result.output.includes(expectedMessage), `promptfoo accepted invalid results: ${result.output}`);
}

function resultShapes() {
  const stdout = 'Summary for List pantry: apples, pears\n';
  const observation = observed(stdout);
  const multi = promptfooResult('asserts.yaml', stdout);
  check(multi?.gradingResult?.componentResults?.length === 3, 'installed promptfoo did not emit three componentResults');
  if (multi) {
    const rows = mapResults([multi], observation);
    check(
      rows.map((row) => row.key).join(',') === 'required-apples,required-pears,forbidden-shellfish',
      'multi-assertion import lost a judgment',
    );
    const withoutComponents = structuredClone(multi);
    delete withoutComponents.gradingResult.componentResults;
    refuseResults([withoutComponents], observation, 'incomplete multi-assertion grade');
    const partial = structuredClone(multi);
    partial.gradingResult.componentResults.pop();
    refuseResults([partial], observation, 'incomplete multi-assertion grade');
    const repeated = structuredClone(multi);
    repeated.gradingResult.componentResults[1] = repeated.gradingResult.componentResults[0];
    refuseResults([repeated], observation, 'unique expected assertion');
    const missingPass = structuredClone(multi);
    delete missingPass.gradingResult.componentResults[1].pass;
    refuseResults([missingPass], observation, 'without a boolean pass');
    const conflictingMetric = structuredClone(multi);
    conflictingMetric.testCase.assert[0].metric = 'required-pears';
    refuseResults([conflictingMetric], observation, 'metric conflicts with its type and value');
    const ungradedMulti = structuredClone(multi);
    delete ungradedMulti.gradingResult;
    refuseResults([ungradedMulti], observation, 'neither a grade nor a concrete error');
    ungradedMulti.error = 'deliberate multi-assertion evaluation error';
    const ungradedRows = mapResults([ungradedMulti], observation);
    check(
      ungradedRows.length === 3 &&
        ungradedRows.map((row) => row.key).join(',') === 'required-apples,required-pears,forbidden-shellfish' &&
        ungradedRows.every((row) => row.outcome === 'fail' && row.quote === stdout && row.quoteChannel === 'stdout'),
      `ungraded multi-assertion result lost cited failures: ${JSON.stringify(ungradedRows)}`,
    );
    ungradedMulti.response.output = 'different stdout';
    refuseResults([ungradedMulti], observation, 'output differs from the cited stdout');
    ungradedMulti.error = '  ';
    ungradedMulti.response.output = stdout;
    refuseResults([ungradedMulti], observation, 'neither a grade nor a concrete error');
    const noOutput = structuredClone(multi);
    delete noOutput.response.output;
    refuseResults([noOutput], observation, 'graded output other than the cited stdout');
    const wrongOutput = structuredClone(multi);
    wrongOutput.response.output = 'Summary for another request';
    refuseResults([wrongOutput], observation, 'output differs from the cited stdout');
    refuseResults([multi], observation, 'before completing evaluation', 2);
  }
  const failed = promptfooResult('asserts.yaml', 'Summary for List pantry: apples\n', 100);
  check(
    failed?.gradingResult?.componentResults?.some((component) => component.pass === false),
    'installed promptfoo did not fail the omitted-item assertion',
  );
  const single = promptfooResult('asserts-single.yaml', stdout);
  check(single?.gradingResult?.componentResults?.length === 1, 'installed promptfoo did not emit its single componentResult');
  if (single) {
    const withoutComponents = structuredClone(single);
    delete withoutComponents.gradingResult.componentResults;
    const rows = mapResults([withoutComponents], observation);
    check(
      rows.length === 1 && rows[0].key === 'required-pears' && rows[0].outcome === 'pass',
      'top-level grade fallback lost the single assertion',
    );
    const emptyComponents = structuredClone(single);
    emptyComponents.gradingResult.componentResults = [];
    refuseResults([emptyComponents], observation, 'empty or invalid componentResults');
    const missingTopLevelPass = structuredClone(withoutComponents);
    delete missingTopLevelPass.gradingResult.pass;
    refuseResults([missingTopLevelPass], observation, 'without a boolean pass');
  }
  const errored = promptfooResult('asserts-error.yaml', stdout, 100);
  check(typeof errored?.error === 'string', 'installed promptfoo did not emit the deterministic assertion error');
  if (errored) {
    check(errored.testCase?.assert?.[0]?.metric === 'required-pears', 'the error assertion lost its oracle identity');
    const withoutGrade = structuredClone(errored);
    delete withoutGrade.gradingResult;
    delete withoutGrade.response;
    const rows = mapResults([withoutGrade], observation);
    check(rows.length === 1 && rows[0].outcome === 'fail' && rows[0].key === 'required-pears', 'ungraded error lost its failure row');
    check(rows[0]?.quote === stdout && rows[0]?.quoteChannel === 'stdout', 'ungraded error did not cite observed stdout');
    const judgment = judgmentFromRows({
      contract: read(path.join(FIXTURE, EVALUATION, 'contract.json')),
      mapping: read(path.join(EVALUATOR, 'mapping.json')),
      answer: { rows },
      probeId: 'P-002',
      behaviorIds: ['B-002'],
    });
    check(
      judgment.findings.length === 1 && judgment.findings[0].oracleId === 'O-002',
      'ungraded promptfoo error did not become a scored defect finding',
    );
    const unidentified = structuredClone(withoutGrade);
    delete unidentified.testCase.assert[0].metric;
    refuseResults([unidentified], observation, 'unknown, or repeated assertion metadata');
    const unknownType = structuredClone(withoutGrade);
    unknownType.testCase.assert[0].type = 'equals';
    refuseResults([unknownType], observation, 'metric conflicts with its type and value');
  }
}

function project(edit = () => {}) {
  const root = fs.mkdtempSync(path.join(__dirname, '.tea-promptfoo-'));
  projects.push(root);
  fs.cpSync(FIXTURE, root, { recursive: true });
  const folder = path.join(root, EVALUATION);
  edit(folder);
  const digest = command(process.execPath, [CLI, 'digest', '--evaluation', folder]);
  check(digest.status === 0, `digest failed: ${digest.output}`);
  command('git', ['init', '--quiet', '--initial-branch', 'main'], { cwd: root });
  command('git', ['add', '--all'], { cwd: root });
  const committed = command(
    'git',
    ['-c', 'user.name=TeA test', '-c', 'user.email=tea-test@example.test', 'commit', '--quiet', '-m', 'fixture'],
    { cwd: root },
  );
  check(committed.status === 0, `fixture commit failed: ${committed.output}`);
  return folder;
}

function latestRun(folder) {
  const runs = path.join(folder, 'runs');
  const name = fs
    .readdirSync(runs)
    .filter((entry) => entry !== '.gitignore')
    .sort()
    .at(-1);
  return path.join(runs, name);
}

function votes(run, probeId) {
  const scores = path.join(run, 'scores');
  const name = fs.readdirSync(scores).sort().at(-1);
  const evidence = read(path.join(scores, name, probeId, 'evidence-artifact.json'));
  return evidence.reducedProbeOutcomes[0].trialVotes.map((vote) => vote.state);
}

function pipeline() {
  const folder = project();
  for (const subcommand of ['check', 'preflight', 'run', 'score']) {
    const result = command(process.execPath, [CLI, subcommand, '--evaluation', folder]);
    check(result.status === 0, `${subcommand} exited ${result.status}: ${result.output}`);
    if (result.status !== 0) return;
  }
  const run = latestRun(folder);
  const clean = votes(run, 'P-001');
  const mutated = votes(run, 'P-002');
  check(clean.length === 3 && clean.every((state) => state === 'passed-clean-control'), `clean votes: ${clean}`);
  check(mutated.length === 3 && mutated.every((state) => state === 'caught'), `mutated votes: ${mutated}`);
  const index = read(path.join(run, 'trial-sets.json'));
  const set = index.trialSets.find((entry) => entry.probeId === 'P-002');
  check(set?.records.length === 3, `mutated arm has ${set?.records.length} records`);
  for (const relative of set?.records ?? []) {
    const record = read(path.join(run, relative));
    const finding = record.findings.find((item) => item.oracleId === 'O-002');
    const observation = record.observations.find((item) => item.observationId === finding?.observationIds[0]);
    check(
      finding?.quotedEvidence[0]?.channel === 'stdout' && observation?.stdout?.value.includes(finding.quotedEvidence[0].quote),
      `mutation finding does not quote observed stdout: ${JSON.stringify(finding)}`,
    );
  }
  const frameworkFiles = fs
    .readdirSync(path.dirname(folder), { recursive: true })
    .filter((name) => /(?:outputs\.json|results\.jsonl)$/.test(name));
  check(frameworkFiles.length === 0, `promptfoo wrote result files into the adopter tree: ${frameworkFiles.join(', ')}`);
}

function degenerate() {
  const folder = project((evaluation) => {
    const file = path.join(evaluation, 'evaluator', 'promptfoo.mjs');
    fs.writeFileSync(
      file,
      '#!/usr/bin/env node\nimport fs from "node:fs";\nconst input = JSON.parse(fs.readFileSync(0, "utf8"));\nconst rows = ["required-apples", "required-pears", "forbidden-shellfish"].map((key) => ({ key, outcome: "pass", observationIds: [input.observations[0].observationId] }));\nprocess.stdout.write(JSON.stringify({ rows }) + "\\n");\n',
      { mode: 0o755 },
    );
  });
  const ran = command(process.execPath, [CLI, 'run', '--evaluation', folder]);
  check(ran.status === 0, `always-pass run exited ${ran.status}: ${ran.output}`);
  if (ran.status !== 0) return;
  const scored = command(process.execPath, [CLI, 'score', '--evaluation', folder]);
  check(scored.status === 2, `always-pass score exited ${scored.status}, expected uncaught defect exit 2: ${scored.output}`);
  const states = votes(latestRun(folder), 'P-002');
  check(states.length === 3 && states.every((state) => state !== 'caught'), `always-pass evaluator caught the mutation: ${states}`);
}

(async () => {
  try {
    const installed = engine();
    directEvaluator();
    childInvocation();
    resultShapes();
    pipeline();
    degenerate();
    process.stdout.write(`promptfoo ${installed.version}: ${checks} checks, ${failures.length} failures\n`);
  } catch (error) {
    failures.push(error.stack);
  } finally {
    if (process.env.KEEP_PROMPTFOO !== '1') for (const root of projects) fs.rmSync(root, { recursive: true, force: true });
  }
  if (failures.length > 0) {
    for (const failure of failures) process.stderr.write(`${failure}\n`);
    process.exitCode = 1;
  }
})();
