/** AgentEvals over a calling agent's own command and the real Evaluate pipeline. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { ENGINE_CLI_ENV } = require('../cli/lib/evaluate/engine');
const { judgmentFromRows } = require('../cli/lib/evaluate/judgment-rows');
const { registryFromEvaluation } = require('../cli/lib/evaluate/registry');

const ROOT = path.join(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixtures', 'evaluate-tool-use-agent');
const CLI = path.join(ROOT, 'cli', 'evaluate.js');
const EVALUATION = path.join('evals', 'tool-use');
const failures = [];
let checks = 0;
const projects = [];
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

function evaluate(folder, subcommand) {
  return command(process.execPath, [CLI, subcommand, '--evaluation', folder]);
}

function read(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function write(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function project(label, edit = () => {}) {
  const root = fs.mkdtempSync(path.join(__dirname, `.tea-tool-use-${label}-`));
  projects.push(root);
  fs.cpSync(FIXTURE, root, { recursive: true });
  const folder = path.join(root, EVALUATION);
  edit(folder);
  const digested = evaluate(folder, 'digest');
  check(digested.status === 0, `${label}: digest failed: ${digested.output}`);
  const initialized = command('git', ['init', '--quiet', '--initial-branch', 'main'], { cwd: root });
  check(initialized.status === 0, `${label}: git init failed: ${initialized.output}`);
  command('git', ['add', '--all'], { cwd: root });
  const committed = command(
    'git',
    ['-c', 'user.name=TeA test', '-c', 'user.email=tea-test@example.test', 'commit', '--quiet', '-m', 'fixture'],
    {
      cwd: root,
    },
  );
  check(committed.status === 0, `${label}: git commit failed: ${committed.output}`);
  return { root, folder };
}

function latestRun(folder) {
  const runs = path.join(folder, 'runs');
  const names = fs
    .readdirSync(runs)
    .filter((name) => name !== '.gitignore')
    .sort();
  return names.length > 0 ? path.join(runs, names.at(-1)) : null;
}

function records(run, probeId) {
  const index = read(path.join(run, 'trial-sets.json'));
  const set = index.trialSets.find((entry) => entry.probeId === probeId);
  return set?.records.map((relative) => read(path.join(run, relative))) ?? [];
}

function votes(run, probeId) {
  const scores = path.join(run, 'scores');
  const latest = fs.readdirSync(scores).sort().at(-1);
  const evidence = read(path.join(scores, latest, probeId, 'evidence-artifact.json'));
  return evidence.reducedProbeOutcomes[0].trialVotes.map((vote) => vote.state);
}

function agentTrajectory(rule) {
  const copy = fs.mkdtempSync(path.join(__dirname, '.tea-tool-use-direct-'));
  projects.push(copy);
  fs.cpSync(path.join(FIXTURE, 'bin'), path.join(copy, 'bin'), { recursive: true });
  fs.cpSync(path.join(FIXTURE, 'rules'), path.join(copy, 'rules'), { recursive: true });
  write(path.join(copy, 'rules', 'tool.json'), rule);
  const result = command(path.join(copy, 'bin', 'calling-agent.js'), [], { cwd: copy, input: 'Weather in Austin\n' });
  check(result.status === 0, `the calling agent exited ${result.status}: ${result.output}`);
  return result.stdout;
}

function directEvaluator() {
  const rule = read(path.join(FIXTURE, 'rules', 'tool.json'));
  const noCall = `trajectory: ${JSON.stringify([
    { role: 'user', content: 'Weather in Austin' },
    { role: 'assistant', content: '', tool_calls: [] },
  ])}\n`;
  const missingAssistant = `trajectory: ${JSON.stringify([{ role: 'user', content: 'Weather in Austin' }])}\n`;
  const noToolCalls = `trajectory: ${JSON.stringify([
    { role: 'user', content: 'Weather in Austin' },
    { role: 'assistant', content: '' },
  ])}\n`;
  const extraMessage = `trajectory: ${JSON.stringify([
    ...read(path.join(FIXTURE, EVALUATION, 'evaluator', 'reference', 'weather.json')),
    { role: 'user', content: 'Unexpected follow-up' },
  ])}\n`;
  const extraCallTrajectory = read(path.join(FIXTURE, EVALUATION, 'evaluator', 'reference', 'weather.json'));
  extraCallTrajectory[1].tool_calls.push({
    id: 'call-2',
    type: 'function',
    function: { name: 'search_web', arguments: '{}' },
  });
  const extraCall = `trajectory: ${JSON.stringify(extraCallTrajectory)}\n`;
  for (const { label, stdout, expected, citedText } of [
    { label: 'correct tool and arguments', stdout: agentTrajectory(rule), expected: 'pass' },
    { label: 'wrong tool', stdout: agentTrajectory({ ...rule, name: 'search_web' }), expected: 'fail', citedText: 'search_web' },
    { label: 'escaped tool name', stdout: agentTrajectory({ ...rule, name: 'search"web' }), expected: 'fail', citedText: 'search' },
    {
      label: 'wrong arguments',
      stdout: agentTrajectory({ ...rule, arguments: { city: 'Dallas' } }),
      expected: 'fail',
      citedText: 'Dallas',
    },
    { label: 'no call', stdout: noCall, expected: 'fail', citedText: 'tool_calls' },
    { label: 'missing assistant', stdout: missingAssistant, expected: 'fail', citedText: '"role":"user"' },
    { label: 'absent tool_calls', stdout: noToolCalls, expected: 'fail', citedText: '"role":"assistant"' },
    { label: 'extra message', stdout: extraMessage, expected: 'fail', citedText: 'Unexpected follow-up' },
    { label: 'extra tool call', stdout: extraCall, expected: 'fail', citedText: 'search_web' },
  ]) {
    const answer = command(path.join(FIXTURE, EVALUATION, 'evaluator', 'trajectory.mjs'), [], {
      input: JSON.stringify({
        sealedBrief: {},
        observations: [
          { observationId: 'noise', stdout: { kind: 'text', value: 'unrelated tool_calls output' } },
          { observationId: 'trial-1-call-tool', stdout: { kind: 'text', value: stdout } },
        ],
      }),
    });
    check(answer.status === 0, `${label}: evaluator exited ${answer.status}: ${answer.output}`);
    if (answer.status !== 0) continue;
    const rows = JSON.parse(answer.stdout).rows;
    check(rows.length === 1 && rows[0].outcome === expected, `${label}: evaluator rows are ${JSON.stringify(rows)}`);
    check(rows[0].observationIds[0] === 'trial-1-call-tool', `${label}: evaluator did not cite the trajectory observation`);
    if (expected === 'fail') {
      check(stdout.includes(rows[0].quote), `${label}: the cited stdout lacks ${rows[0].quote}`);
      check(rows[0].quote.includes(citedText), `${label}: the quote ${rows[0].quote} does not identify ${citedText}`);
    }
  }
}

function pipeline() {
  const { folder } = project('pipeline');
  for (const subcommand of ['check', 'preflight', 'run', 'score']) {
    const result = evaluate(folder, subcommand);
    check(result.status === 0, `${subcommand} exited ${result.status}: ${result.output}`);
    if (result.status !== 0) return;
  }
  const run = latestRun(folder);
  const cleanVotes = votes(run, 'P-001');
  const mutatedVotes = votes(run, 'P-002');
  const cleanRecords = records(run, 'P-001');
  const mutatedRecords = records(run, 'P-002');
  check(
    cleanVotes.length === 3 && mutatedVotes.length === 3,
    `expected three votes per arm, got ${cleanVotes.length} and ${mutatedVotes.length}`,
  );
  check(
    cleanRecords.length === 3 && mutatedRecords.length === 3,
    `expected three records per arm, got ${cleanRecords.length} and ${mutatedRecords.length}`,
  );
  check(
    cleanVotes.every((state) => state === 'passed-clean-control'),
    'the clean control did not pass',
  );
  check(
    mutatedVotes.every((state) => state === 'caught'),
    'the wrong-tool mutation was not caught',
  );
  check(mutatedRecords.reduce((count, record) => count + record.findings.length, 0) === 3, 'expected three wrong-tool findings');
  for (const record of mutatedRecords) {
    check(record.findings.length === 1, `trial ${record.trialIndex} has ${record.findings.length} findings, expected one`);
    const finding = record.findings[0];
    const observed = record.observations.find((item) => item.observationId === finding?.observationIds[0]);
    check(
      finding?.quotedEvidence[0]?.channel === 'stdout' && observed?.stdout?.value.includes(finding.quotedEvidence[0].quote),
      `the finding does not cite its own stdout observation: ${JSON.stringify(finding)}`,
    );
  }
  const evaluation = read(path.join(folder, 'evaluation.json'));
  const registry = registryFromEvaluation(evaluation, { root: path.dirname(path.dirname(folder)) });
  const authorization = registry.commandTargetPolicy({ cwd: path.dirname(path.dirname(folder)) }).authorizations[0];
  check(authorization.executable === 'calling-agent', `the registry authorized ${JSON.stringify(authorization)}`);
  const preflightRun = fs
    .readdirSync(path.join(folder, 'runs'))
    .filter((name) => name !== '.gitignore' && name !== path.basename(run))
    .sort()
    .at(-1);
  const leg = read(path.join(folder, 'runs', preflightRun, 'observations', '001-request-alpha.json'));
  check(
    leg.request.executable === authorization.executable,
    `preflight ran ${leg.request.executable}, authorization names ${authorization.executable}`,
  );
}

function degenerate() {
  const { folder } = project('degenerate', (evaluation) => {
    const file = path.join(evaluation, 'evaluator', 'trajectory.mjs');
    fs.writeFileSync(
      file,
      '#!/usr/bin/env node\nimport fs from "node:fs";\nconst input = JSON.parse(fs.readFileSync(0, "utf8"));\nprocess.stdout.write(JSON.stringify({ rows: [{ key: "trajectory_strict_match", outcome: "pass", observationIds: [input.observations[0].observationId] }] }) + "\\n");\n',
      { mode: 0o755 },
    );
  });
  const ran = evaluate(folder, 'run');
  check(ran.status === 0, `degenerate run exited ${ran.status}: ${ran.output}`);
  if (ran.status !== 0) return;
  const scored = evaluate(folder, 'score');
  check(scored.status === 2, `degenerate score exited ${scored.status}, expected the engine's uncaught-defect exit 2: ${scored.output}`);
  const states = votes(latestRun(folder), 'P-002');
  check(states.length === 3, `expected three degenerate-arm votes, got ${states.length}`);
  check(
    states.every((state) => state !== 'caught'),
    'the always-pass evaluator caught the mutation',
  );
}

function numeric() {
  const make = (label, mode) =>
    project(label, (folder) => {
      const contract = read(path.join(folder, 'contract.json'));
      contract.rubrics = [
        {
          id: 'R-101',
          scaleLevels: [
            { level: 1, anchor: 'The first tool call differs from the reference.' },
            { level: 3, anchor: 'The trajectory strictly matches the reference.' },
          ],
          failureModePenalties: [{ name: 'wrong-tool', description: 'A wrong tool receives the lower anchor.' }],
          maxLength: 200,
          criteria: [{ id: 'RC-101', text: 'How closely does the trajectory match?', evidence: '/interactions/call-tool/stdout' }],
        },
      ];
      write(path.join(folder, 'contract.json'), contract);
      const mapping = read(path.join(folder, 'evaluator', 'mapping.json'));
      mapping.keys['trajectory-quality'] = { rubricId: 'R-101', criterionId: 'RC-101', levels: [1, 3] };
      write(path.join(folder, 'evaluator', 'mapping.json'), mapping);
      const evaluation = read(path.join(folder, 'evaluation.json'));
      evaluation.evaluator.args = [mode];
      write(path.join(folder, 'evaluation.json'), evaluation);
    });
  const accepted = make('numeric', '--numeric');
  const result = evaluate(accepted.folder, 'run');
  check(result.status === 0, `numeric AgentEvals run exited ${result.status}: ${result.output}`);
  if (result.status === 0) {
    const record = records(latestRun(accepted.folder), 'P-001')[0];
    const numericResult = { key: 'trajectory-quality', score: 3, comment: 'The trajectory meets the highest anchored level.' };
    const rows = [
      {
        key: numericResult.key,
        outcome: 'score',
        score: numericResult.score,
        observationIds: [record.observations[0].observationId],
        comment: numericResult.comment,
      },
    ];
    const converted = judgmentFromRows({
      contract: read(path.join(accepted.folder, 'contract.json')),
      mapping: read(path.join(accepted.folder, 'evaluator', 'mapping.json')),
      answer: { rows },
      probeId: 'P-001',
      behaviorIds: ['B-001'],
    });
    check(
      converted.judgeResults.length === 1 && converted.judgeResults[0].score === 3,
      'the numeric score did not map to one judge result',
    );
    check(record.judgeResults.length === 1 && record.judgeResults[0].score === 3, 'the record did not carry the mapped numeric score');
  }
  const refused = make('off-scale', '--off-scale');
  const bad = evaluate(refused.folder, 'run');
  check(bad.status === 12, `off-scale AgentEvals run exited ${bad.status}, expected 12: ${bad.output}`);
  const run = latestRun(refused.folder);
  check(run !== null && !fs.existsSync(path.join(run, 'trial-sets.json')), 'an off-scale score wrote a trial set');
  const sets = run === null ? null : path.join(run, 'trial-sets');
  const recordFiles =
    sets !== null && fs.existsSync(sets)
      ? fs.readdirSync(sets, { recursive: true }).filter((name) => /^record-.*\.json$/.test(path.basename(name)))
      : [];
  check(recordFiles.length === 0, `an off-scale score wrote sealed record(s): ${recordFiles.join(', ')}`);
}

try {
  const dependencies = read(path.join(ROOT, 'package.json')).devDependencies;
  check(dependencies.agentevals === 'latest', 'agentevals must use the latest spec');
  check(dependencies['@langchain/core'] === 'latest', '@langchain/core must use the latest spec');
  const agentPackageFile = require.resolve('agentevals/package.json');
  const agentPackage = read(agentPackageFile);
  const licenceFile = path.join(path.dirname(agentPackageFile), 'LICENSE');
  const licence = fs.existsSync(licenceFile) ? fs.readFileSync(licenceFile, 'utf8') : '';
  check(
    (agentPackage.license === undefined || agentPackage.license === 'MIT') &&
      licence.includes('Copyright (c)') &&
      licence.includes('Permission is hereby granted, free of charge') &&
      licence.includes('The above copyright notice and this permission notice shall be included') &&
      licence.includes('THE SOFTWARE IS PROVIDED "AS IS"'),
    'the installed AgentEvals package lacks the MIT licence evidence used by the licence gate',
  );
  directEvaluator();
  pipeline();
  degenerate();
  numeric();
} finally {
  if (process.env.KEEP_TOOL_USE !== '1') for (const root of projects) fs.rmSync(root, { recursive: true, force: true });
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`${failure}\n`);
  process.stderr.write(`${failures.length}/${checks} tool-use checks failed\n`);
  process.exitCode = 1;
} else process.stdout.write(`${checks} tool-use checks passed\n`);
