/** Repeat the learned framework proof through the real Evaluate pipeline. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixtures', 'evaluate-learn');
const EVALUATION = path.join(FIXTURE, 'evaluation');
const EVALUATOR = path.join(EVALUATION, 'evaluator', 'autoevals-exact.mjs');
const CLI = path.join(ROOT, 'cli', 'evaluate.js');
const NAME = 'autoevals';
const PUBLISHER_SHA = 'b0500edbf6c157d526f9bc027798ea269a3ceb7c';
const SCORER_DOC = `https://github.com/braintrustdata/autoevals/blob/${PUBLISHER_SHA}/SCORERS.md`;
const SCORER_SOURCE = `https://github.com/braintrustdata/autoevals/blob/${PUBLISHER_SHA}/SCORERS.md#exactmatch`;
const README_SOURCE = `https://github.com/braintrustdata/autoevals/blob/${PUBLISHER_SHA}/README.md#score-results`;
const SUMMARY = 'Summary for List pantry: apples, pears\n';
const MUTATED = 'Summary for List pantry: apples\n';
const REFUSAL = 'error: invalid list request\n';
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_') && !/(?:API_KEY|TOKEN|SECRET|CREDENTIAL|AUTHORIZATION)/i.test(key)),
);
const temporaryProjects = [];
const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function command(bin, args, options = {}) {
  const result = spawnSync(bin, args, { cwd: ROOT, encoding: 'utf8', timeout: 180_000, env, ...options });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, output: `${result.stdout}${result.stderr}` };
}

function read(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function filesUnder(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(folder, entry.name);
    return entry.isDirectory() ? filesUnder(file) : [file];
  });
}

function sourcedFacts(learned) {
  const section = learned.split('## Primary-source facts used\n')[1]?.split('\n## ')[0] ?? '';
  const rows = section
    .split('\n')
    .filter((line) => line.startsWith('| ') && !/^\| (?:Fact used|---)/.test(line))
    .map((line) => line.split('|').map((cell) => cell.trim()));
  const expected = new Map([
    ['`ExactMatch` takes `output` and `expected`', [SCORER_SOURCE]],
    ['It scores exact equality as 1 or inequality as 0', [SCORER_DOC]],
    ['The result has `name` and `score`', [README_SOURCE]],
    ['No model call is needed for this heuristic scorer', [SCORER_DOC]],
  ]);
  const observed = rows.map((cells) => cells[1]);
  const approved =
    rows.length === expected.size &&
    new Set(observed).size === expected.size &&
    rows.every((cells) => {
      const required = expected.get(cells[1]);
      const links = [...(cells[2] ?? '').matchAll(/\]\((https:\/\/[^)]+)\)/g)].map((match) => match[1]);
      return required && links.length === required.length && required.every((url) => links.includes(url));
    });
  const publisherLinks = [...learned.matchAll(/https:\/\/github\.com\/braintrustdata\/autoevals(?:\/[^)\s]*)?/g)].map((match) => match[0]);
  return approved && publisherLinks.length >= 6 && publisherLinks.every((url) => url.includes(PUBLISHER_SHA));
}

function learnedSection(learned, heading) {
  return learned.split(`${heading}\n`)[1]?.split('\n## ')[0] ?? '';
}

function bullet(section, label) {
  return section
    .split('\n')
    .find((line) => line.startsWith(`- ${label}: `))
    ?.slice(label.length + 4);
}

function documentedExamples(learned, transcript) {
  const pass = learnedSection(learned, '## Executed minimal example: known pass');
  const fail = learnedSection(learned, '## Executed minimal example: known fail');
  const recordedCommand = bullet(pass, 'Command')?.match(/^`([^`]+)` from `([^`]+)`\.$/);
  check(Boolean(recordedCommand), 'known pass: LEARNED.md lacks an executable command and working directory');
  check(fail.includes('- Same command.'), 'known fail: LEARNED.md does not identify its command');
  if (!recordedCommand) return;

  const [invocation, workingDirectory] = recordedCommand.slice(1);
  check(workingDirectory === 'test/evaluations', `unexpected known-example working directory: ${workingDirectory}`);
  const learning = transcript.indexOf('25. Before authoring any evaluator mapping');
  const mapping = transcript.indexOf('26. Authored `evaluator/LEARNED.md`');
  check(learning !== -1 && mapping > learning, 'transcript does not show framework examples before mapping');
  check(
    transcript.slice(learning, mapping).includes(`\`${invocation}\``) &&
      transcript.slice(learning, mapping).includes('Exit 0, stderr empty'),
    'transcript lacks the documented command, exit status, or stderr before mapping',
  );

  const executed = command('sh', ['-c', invocation], { cwd: path.join(ROOT, workingDirectory) });
  check(executed.status === 0 && executed.stderr === '', `documented command exited ${executed.status}: ${executed.output}`);
  const actual = executed.stdout.trimEnd().split('\n').map(JSON.parse);
  check(actual.length === 2, `documented command returned ${actual.length} examples`);

  for (const [label, section, output, score, outcome] of [
    ['pass', pass, SUMMARY, 1, 'pass'],
    ['fail', fail, MUTATED, 0, 'fail'],
  ]) {
    const inputLine = label === 'pass' ? bullet(section, 'Input') : section.match(/^- Same command\. Input: (.+)$/m)?.[1];
    const statedInput =
      label === 'pass'
        ? inputLine?.match(/^`output` and `expected` both `([^`]+)`\.$/)
        : inputLine?.match(/^`output` was `([^`]+)`; `expected` retained `pears`\.$/);
    check(
      Boolean(statedInput) && statedInput[1].replaceAll(String.raw`\n`, '\n') === output,
      `known ${label}: LEARNED.md lacks the actual command input`,
    );
    const stdoutLine = bullet(section, 'Stdout')?.match(/^`(.+)`\.$/);
    check(Boolean(stdoutLine), `known ${label}: LEARNED.md lacks parseable stdout`);
    if (!stdoutLine) continue;
    const recorded = JSON.parse(stdoutLine[1]);
    const observed = actual.find((row) => row.label === `known-${label}`);
    check(
      recorded.label === `known-${label}` && recorded.input?.output === output && recorded.input?.expected === SUMMARY,
      `known ${label}: documented stdout input differs from the stated command input: ${stdoutLine[1]}`,
    );
    check(
      JSON.stringify(recorded) === JSON.stringify(observed),
      `known ${label}: documented stdout differs from executed command: ${stdoutLine[1]}`,
    );
    check(
      recorded.result?.name === 'ExactMatch' && recorded.result.score === score,
      `known ${label}: documented framework score is wrong: ${stdoutLine[1]}`,
    );
    const processRecord = bullet(section, 'Stderr')?.match(/^([^.]*)\. Exit status: (\d+)\. Framework result: `([^`]+)`, score (\d+)\.$/);
    check(
      Boolean(processRecord) &&
        processRecord[1] === 'empty' &&
        Number(processRecord[2]) === executed.status &&
        processRecord[3] === 'ExactMatch' &&
        Number(processRecord[4]) === score,
      `known ${label}: LEARNED.md lacks correct stderr, exit status, or score`,
    );
    check(
      bullet(section, 'Judgment row')?.includes(`\`pantry-exact-summary\` maps this to ${outcome}`),
      `known ${label}: LEARNED.md lacks the mapped judgment`,
    );
  }
}

function evidenceRecord() {
  const skill = path.join(ROOT, 'src', 'workflows', 'testarch', 'bmad-testarch-evaluate');
  const mentions = filesUnder(skill).filter((file) => fs.readFileSync(file, 'utf8').toLowerCase().includes(NAME));
  check(mentions.length === 0, `framework named in skill: ${mentions.join(', ')}`);

  const learned = fs.readFileSync(path.join(EVALUATION, 'evaluator', 'LEARNED.md'), 'utf8');
  const transcript = fs.readFileSync(path.join(FIXTURE, 'maintainer-transcript.md'), 'utf8');
  const facts = fs.readFileSync(path.join(ROOT, '_bmad-output', 'planning-artifacts', 'evaluate', 'evaluation-framework-facts.md'), 'utf8');
  const installed = read(path.join(ROOT, 'node_modules', NAME, 'package.json'));
  check(
    learned.includes(`Installed version and runtime: \`${installed.version}\``) && facts.includes(`autoevals@${installed.version}`),
    `installed framework changed to ${installed.version}; recheck learned facts`,
  );
  check(read(path.join(ROOT, 'package.json')).devDependencies[NAME] === 'latest', 'framework dependency must float at latest');
  check(installed.license === 'MIT', `unexpected framework licence: ${installed.license}`);
  for (const heading of [
    '## Framework and installed version',
    '## Primary-source facts used',
    '## Executed minimal example: known pass',
    '## Executed minimal example: known fail',
    '## Documented claims contradicted by execution',
    '## Mapping and pipeline result',
  ]) {
    check(learned.includes(heading), `LEARNED.md lacks ${heading}`);
  }
  check(sourcedFacts(learned), 'LEARNED.md lacks a primary source for a fact used');
  documentedExamples(learned, transcript);
  check(!sourcedFacts(learned.replace(SCORER_SOURCE, 'https://example.test/summary')), 'primary-source guard accepted a secondary source');
  const factRows = (learned.split('## Primary-source facts used\n')[1]?.split('\n## ')[0] ?? '')
    .split('\n')
    .filter((line) => line.startsWith('| ') && !/^\| (?:Fact used|---)/.test(line));
  check(
    factRows.length === 4 && !sourcedFacts(learned.replace(factRows[3], factRows[2])),
    'primary-source guard accepted a duplicate row in place of a required fact',
  );
  const probes = ['P-001', 'P-002', 'P-003', 'P-004'];
  for (const probe of probes) check(transcript.includes(probe), `transcript lacks ${probe}`);
  check(
    transcript.indexOf('38. Final `digest`') < transcript.indexOf('39. Final development `run') &&
      transcript.indexOf('39. Final development `run') < transcript.indexOf('40. Final held-out `run'),
    'transcript lacks the ordered final digest, development, and held-out evidence',
  );
  const mutations = fs.readdirSync(path.join(EVALUATION, 'mutations')).filter((name) => name.endsWith('.mutation.json'));
  check(mutations.length === 1 && mutations[0] === 'M-001.mutation.json', `expected one committed mutation: ${mutations}`);
  const mapping = read(path.join(EVALUATION, 'evaluator', 'mapping.json')).keys;
  check(
    mapping['pantry-exact-summary']?.oracleId === 'O-001' &&
      mapping['pantry-exact-summary']?.behaviorId === 'B-001' &&
      mapping['malformed-request-refusal']?.oracleId === 'O-002' &&
      mapping['malformed-request-refusal']?.behaviorId === 'B-002' &&
      Object.keys(mapping).length === 2,
    `framework result mapping changed: ${JSON.stringify(mapping)}`,
  );
  const contract = read(path.join(EVALUATION, 'contract.json'));
  const oracleLiteral = (oracleId, pointer) => {
    const oracle = contract.oracles.find((item) => item.id === oracleId);
    const equality = oracle?.check?.operands.find(
      (operand) => operand.op === 'equality' && operand.operands.some((item) => item.pointer === pointer),
    );
    return equality?.operands.find((item) => Object.hasOwn(item, 'literal'))?.literal;
  };
  check(
    oracleLiteral('O-001', '/interactions/summarize/stdout') === SUMMARY &&
      oracleLiteral('O-001', '/interactions/summarize/exit-code') === 0 &&
      oracleLiteral('O-002', '/interactions/reject-malformed/stderr') === REFUSAL &&
      oracleLiteral('O-002', '/interactions/reject-malformed/stdout') === '' &&
      oracleLiteral('O-002', '/interactions/reject-malformed/exit-code') === 2,
    'contract oracle literals drifted from the evaluator expectations',
  );
  const behaviors = Object.fromEntries(contract.behaviors.map((behavior) => [behavior.id, behavior]));
  check(
    behaviors['B-001']?.oracles.length === 1 &&
      behaviors['B-001'].oracles[0] === 'O-001' &&
      behaviors['B-001'].observableSuccessCriterion ===
        `List pantry produces ${SUMMARY.trimEnd()} followed by one newline and exit code 0.` &&
      behaviors['B-002']?.oracles.length === 1 &&
      behaviors['B-002'].oracles[0] === 'O-002' &&
      behaviors['B-002'].observableSuccessCriterion === `A type-violating request exits 2 and prints ${REFUSAL.trimEnd()} on stderr.`,
    'behavior success criteria drifted from the evaluator expectations',
  );
}

function callsFramework(source) {
  return (
    /import\s*\{\s*ExactMatch\s*\}\s*from\s*['"]autoevals['"]/.test(source) && /await ExactMatch\(\{ output, expected \}\)/.test(source)
  );
}

function observed(step, stdout, stderr, exitCode) {
  return {
    observationId: `trial-1-${step}`,
    observation: { stdout, stderr, exitCode },
  };
}

function wrapperInput(stdout = SUMMARY, { summary = {}, refusal = {} } = {}) {
  return JSON.stringify({
    sealedBrief: {},
    observations: [
      observed('summarize', stdout, summary.stderr ?? '', summary.exitCode ?? 0),
      observed('reject-malformed', refusal.stdout ?? '', refusal.stderr ?? REFUSAL, refusal.exitCode ?? 2),
    ],
  });
}

async function installedApi() {
  const { ExactMatch } = await import('autoevals');
  for (const [label, output, expectedScore] of [
    ['known pass', SUMMARY, 1],
    ['known fail', MUTATED, 0],
  ]) {
    const result = await ExactMatch({ output, expected: SUMMARY });
    check(
      result?.name === 'ExactMatch' && result.score === expectedScore,
      `${label}: changed installed API or result shape: ${JSON.stringify(result)}`,
    );
  }
  const source = fs.readFileSync(EVALUATOR, 'utf8');
  check(callsFramework(source), 'wrapper no longer calls the learned framework scorer');
  check(
    !callsFramework(source.replace('await ExactMatch({ output, expected })', '{ name: "ExactMatch", score: 1 }')),
    'framework-call guard accepted a handwritten answer',
  );

  for (const [label, stdout, outcome] of [
    ['clean', SUMMARY, 'pass'],
    ['mutated', MUTATED, 'fail'],
  ]) {
    const result = command(EVALUATOR, [], { input: wrapperInput(stdout) });
    check(result.status === 0, `${label} wrapper exited ${result.status}: ${result.output}`);
    if (result.status !== 0) continue;
    const rows = JSON.parse(result.stdout).rows;
    const summary = rows.find((row) => row.key === 'pantry-exact-summary');
    const refusal = rows.find((row) => row.key === 'malformed-request-refusal');
    check(rows.length === 2 && summary?.outcome === outcome && refusal?.outcome === 'pass', `${label} rows: ${result.stdout}`);
    check(summary?.observationIds[0] === 'trial-1-summarize', `${label} row lost its real observation`);
    check(refusal?.observationIds[0] === 'trial-1-reject-malformed', `${label} refusal row lost its observation`);
    if (outcome === 'fail') {
      check(summary.quote === stdout && summary.quoteChannel === 'stdout', 'failure does not quote the observed stdout verbatim');
    }
  }

  for (const [label, input, failedKey, quote, quoteChannel] of [
    [
      'unexpected malformed stdout',
      wrapperInput(SUMMARY, { refusal: { stdout: 'unexpected summary\n' } }),
      'malformed-request-refusal',
      'unexpected summary\n',
      'stdout',
    ],
    ['silent summary', wrapperInput(''), 'pantry-exact-summary', '0', 'exit-code'],
    ['silent refusal', wrapperInput(SUMMARY, { refusal: { stderr: '' } }), 'malformed-request-refusal', '2', 'exit-code'],
    ['wrong summary exit', wrapperInput(SUMMARY, { summary: { exitCode: 7 } }), 'pantry-exact-summary', '7', 'exit-code'],
    ['wrong refusal exit', wrapperInput(SUMMARY, { refusal: { exitCode: 0 } }), 'malformed-request-refusal', '0', 'exit-code'],
  ]) {
    const result = command(EVALUATOR, [], { input });
    check(result.status === 0, `${label} wrapper exited ${result.status}: ${result.output}`);
    if (result.status !== 0) continue;
    const rows = JSON.parse(result.stdout).rows;
    const failure = rows.find((row) => row.key === failedKey);
    check(
      rows.length === 2 && failure?.outcome === 'fail' && rows.find((row) => row.key !== failedKey)?.outcome === 'pass',
      `${label} did not fail its judgment row: ${result.stdout}`,
    );
    check(
      failure?.quote === quote && failure.quoteChannel === quoteChannel,
      `${label} did not quote the observed ${quoteChannel}: ${result.stdout}`,
    );
  }
}

function project(edit = () => {}) {
  const root = fs.mkdtempSync(path.join(__dirname, '.tea-learn-'));
  temporaryProjects.push(root);
  fs.cpSync(FIXTURE, root, { recursive: true });
  const folder = path.join(root, 'evaluation');
  edit(folder);
  const digest = command(process.execPath, [CLI, 'digest', '--evaluation', folder]);
  check(digest.status === 0, `digest failed: ${digest.output}`);
  for (const [bin, args] of [
    ['git', ['init', '--quiet', '--initial-branch', 'main']],
    ['git', ['add', '--all']],
    ['git', ['-c', 'user.name=TeA test', '-c', 'user.email=tea-test@example.test', 'commit', '--quiet', '-m', 'fixture']],
  ]) {
    const result = command(bin, args, { cwd: root });
    check(result.status === 0, `fixture git setup failed: ${result.output}`);
  }
  return folder;
}

function latestRun(folder) {
  const runs = path.join(folder, 'runs');
  const name = fs
    .readdirSync(runs)
    .filter((entry) => /^\d{8}T/.test(entry))
    .sort()
    .at(-1);
  return path.join(runs, name);
}

function scored(run, probeId) {
  const folder = path.join(run, 'scores');
  const batch = fs.readdirSync(folder).sort().at(-1);
  return read(path.join(folder, batch, probeId, 'evidence-artifact.json'));
}

function pipeline() {
  const folder = project();
  for (const subcommand of ['check', 'preflight']) {
    const result = command(process.execPath, [CLI, subcommand, '--evaluation', folder]);
    check(result.status === 0, `${subcommand} exited ${result.status}: ${result.output}`);
    if (result.status !== 0) return;
  }
  const development = command(process.execPath, [CLI, 'run', '--evaluation', folder, '--partition', 'development']);
  check(development.status === 0, `development run exited ${development.status}: ${development.output}`);
  if (development.status !== 0) return;
  const run = latestRun(folder);
  const developmentScore = command(process.execPath, [CLI, 'score', '--evaluation', folder, '--run', path.basename(run)]);
  check(developmentScore.status === 0, `development score exited ${developmentScore.status}: ${developmentScore.output}`);
  if (developmentScore.status !== 0) return;
  const index = read(path.join(run, 'trial-sets.json'));
  check(
    JSON.stringify(index.trialSets.map((set) => set.probeId).sort()) === JSON.stringify(['P-001', 'P-002', 'P-004']),
    `development partition selected wrong probes: ${index.trialSets.map((set) => set.probeId)}`,
  );
  for (const [probeId, expected] of [
    ['P-001', 'passed-clean-control'],
    ['P-004', 'passed-clean-control'],
    ['P-002', 'caught'],
  ]) {
    const evidence = scored(run, probeId);
    const votes = evidence.reducedProbeOutcomes[0].trialVotes.map((vote) => vote.state);
    check(votes.length === 3 && votes.every((state) => state === expected), `${probeId} votes: ${votes}`);
  }
  const defectEvidence = scored(run, 'P-002');
  check(
    defectEvidence.contractVerdict === 'CONCERNS' &&
      JSON.stringify(defectEvidence.coverageGaps.map((gap) => [gap.rule, gap.satisfied])) ===
        JSON.stringify([['success-indicator-separation', false]]),
    `unexpected contract concern scope: ${JSON.stringify(defectEvidence.coverageGaps)}`,
  );
  check(
    defectEvidence.strength?.comparable === true && defectEvidence.strength.vector.defect.rate === 1,
    `mutated probe lost comparable defect strength: ${JSON.stringify(defectEvidence.strength)}`,
  );
  const config = read(path.join(run, 'evaluator-configuration.json'));
  check(config.modelSnapshot === 'none' && config.judgeConfiguration === null, 'model-free evaluator gained a model condition');
  const mutated = index.trialSets.find((set) => set.probeId === 'P-002');
  check(mutated?.records.length === 3, `mutated trial count: ${mutated?.records.length}`);
  for (const relative of mutated?.records ?? []) {
    const record = read(path.join(run, relative));
    const finding = record.findings.find((item) => item.oracleId === 'O-001');
    const observation = record.observations.find((item) => item.observationId === finding?.observationIds[0]);
    check(
      finding?.quotedEvidence[0]?.quote === observation?.stdout?.value && finding.quotedEvidence[0].channel === 'stdout',
      `finding lacks a verbatim captured stdout quote: ${JSON.stringify(finding)}`,
    );
  }

  const heldOut = command(process.execPath, [CLI, 'run', '--evaluation', folder, '--partition', 'held-out']);
  check(heldOut.status === 0, `held-out run exited ${heldOut.status}: ${heldOut.output}`);
  if (heldOut.status !== 0) return;
  const heldOutRun = latestRun(folder);
  const heldOutConfig = read(path.join(heldOutRun, 'evaluator-configuration.json'));
  check(heldOutConfig.modelSnapshot === 'none' && heldOutConfig.judgeConfiguration === null, 'held-out evaluator gained a model condition');
  const heldOutScore = command(process.execPath, [CLI, 'score', '--evaluation', folder, '--run', path.basename(heldOutRun)]);
  check(heldOutScore.status === 0, `held-out score exited ${heldOutScore.status}: ${heldOutScore.output}`);
  if (heldOutScore.status !== 0) return;
  const heldOutIndex = read(path.join(heldOutRun, 'trial-sets.json'));
  check(
    JSON.stringify(heldOutIndex.trialSets.map((set) => set.probeId)) === JSON.stringify(['P-003']) &&
      heldOutIndex.trialSets[0]?.records.length === 3,
    `held-out partition selected wrong trials: ${JSON.stringify(heldOutIndex.trialSets)}`,
  );
  const gap = read(path.join(heldOutRun, 'gap-view.json'));
  const outcome = gap['held-out']?.find((entry) => entry.probeId === 'P-003')?.outcome;
  const votes = outcome?.trialVotes.map((vote) => vote.state);
  check(
    votes?.length === 3 && votes.every((state) => state === 'caught') && outcome.caughtCount === 3 && outcome.validCount === 3,
    `held-out P-003 gap result: ${JSON.stringify(outcome)}`,
  );
}

function brokenMapping() {
  const folder = project((evaluation) => {
    const file = path.join(evaluation, 'evaluator', 'mapping.json');
    const mapping = read(file);
    mapping.keys['wrong-key'] = mapping.keys['pantry-exact-summary'];
    delete mapping.keys['pantry-exact-summary'];
    fs.writeFileSync(file, `${JSON.stringify(mapping, null, 2)}\n`);
  });
  const result = command(process.execPath, [CLI, 'run', '--evaluation', folder, '--partition', 'development']);
  check(
    result.status === 12 && result.output.includes('judgment-rows schema') && result.output.includes('wrong-key'),
    `broken mapping ran successfully: ${result.output}`,
  );
}

function changedResultShape() {
  const folder = project();
  const stub = path.join(path.dirname(folder), 'node_modules', NAME);
  fs.mkdirSync(stub, { recursive: true });
  fs.writeFileSync(path.join(stub, 'package.json'), '{"name":"autoevals","type":"module","exports":"./index.mjs"}\n');
  fs.writeFileSync(path.join(stub, 'index.mjs'), 'export const ExactMatch = async () => ({ name: "ExactMatch", score: 0.5 });\n');
  const result = command(path.join(folder, 'evaluator', 'autoevals-exact.mjs'), [], { input: wrapperInput() });
  check(
    result.status !== 0 && result.output.includes('unexpected autoevals ExactMatch result'),
    `changed result shape was accepted: ${result.output}`,
  );
}

function frameworkControlsJudgment() {
  const folder = project();
  const stub = path.join(path.dirname(folder), 'node_modules', NAME);
  fs.mkdirSync(stub, { recursive: true });
  fs.writeFileSync(path.join(stub, 'package.json'), '{"name":"autoevals","type":"module","exports":"./index.mjs"}\n');
  const input = wrapperInput();

  for (const [summaryScore, refusalScore, summaryOutcome, refusalOutcome] of [
    [0, 1, 'fail', 'pass'],
    [1, 1, 'pass', 'pass'],
    [1, 0, 'pass', 'fail'],
  ]) {
    fs.writeFileSync(
      path.join(stub, 'index.mjs'),
      `export const ExactMatch = async ({ output, expected }) => {
  if (expected === ${JSON.stringify(SUMMARY)} && output === ${JSON.stringify(SUMMARY)}) {
    return { name: 'ExactMatch', score: ${summaryScore} };
  }
  if (expected === ${JSON.stringify(REFUSAL)} && output === ${JSON.stringify(REFUSAL)}) {
    return { name: 'ExactMatch', score: ${refusalScore} };
  }
  throw new Error('wrapper passed unexpected scorer inputs');
};\n`,
    );
    const result = command(path.join(folder, 'evaluator', 'autoevals-exact.mjs'), [], { input });
    check(result.status === 0, `framework scores ${summaryScore}/${refusalScore}: wrapper exited ${result.status}: ${result.output}`);
    if (result.status !== 0) continue;
    const rows = JSON.parse(result.stdout).rows;
    const summary = rows.find((row) => row.key === 'pantry-exact-summary');
    const refusal = rows.find((row) => row.key === 'malformed-request-refusal');
    check(
      rows.length === 2 && summary?.outcome === summaryOutcome && refusal?.outcome === refusalOutcome,
      `framework scores ${summaryScore}/${refusalScore}: wrapper ignored scorer result: ${result.stdout}`,
    );
    if (summaryScore === 0) {
      check(summary?.quote === SUMMARY && summary.quoteChannel === 'stdout', 'forced scorer failure lost the observed stdout quote');
    }
    if (refusalScore === 0) {
      check(refusal?.quote === REFUSAL && refusal.quoteChannel === 'stderr', 'forced refusal failure lost the observed stderr quote');
    }
  }
}

(async () => {
  try {
    evidenceRecord();
    await installedApi();
    pipeline();
    brokenMapping();
    changedResultShape();
    frameworkControlsJudgment();
  } catch (error) {
    failures.push(error.stack);
  } finally {
    if (process.env.KEEP_LEARNED_FRAMEWORK !== '1') {
      for (const root of temporaryProjects) fs.rmSync(root, { recursive: true, force: true });
    }
  }
  process.stdout.write(`learned ${NAME}: ${checks} checks, ${failures.length} failures\n`);
  for (const failure of failures) process.stderr.write(`${failure}\n`);
  if (failures.length > 0) process.exitCode = 1;
})();
