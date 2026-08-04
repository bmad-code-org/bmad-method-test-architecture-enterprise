#!/usr/bin/env node
/**
 * Stub review agent for tea-test-review CLI tests. Stands in for `claude -p`
 * (passed to the CLI via --agent-cmd) so the agent spawn path is exercised
 * end-to-end without a live agent.
 *
 * The prompt arrives on STDIN (never argv); the report destination is parsed
 * from the prompt's "Write <path>" line. Env vars only reach the stub when
 * the CLI allows them through with --env-pass <NAME>:
 *
 *   STUB_MODE          approve (default) | approve-low | block | request-changes |
 *                      request-changes-critical | critical-approve | conflict |
 *                      score-mismatch | partial | nothing | fail |
 *                      forbidden-write | stale-copy
 *   STUB_ASSERT_STDIN  when "1", fail if the prompt did not arrive on stdin or
 *                      if any of it leaked into argv
 *   STUB_ASSERT_MODEL  expected model value; fail unless argv carries a model
 *                      flag set to exactly it. Proves the resolved model
 *                      actually reaches the vendor argv, which a unit test of
 *                      buildArgv alone cannot show.
 *   STUB_CONTEXT_OVERRIDE
 *                      JSON path array used in the report's Review Context
 *                      manifest. Adversarial tests use it to prove the CLI
 *                      binds report claims to the supplied context set.
 *   STUB_OLD_REPORT    stale-copy source: a report pre-placed with an old mtime
 *   STUB_LOCK_OUTPUT   when "1", make the report and its parent read-only after
 *                      writing so artifact replacement failure handling runs
 */

const fs = require('node:fs');
const path = require('node:path');

const REPORTS = {
  approve: 'approve.md',
  'approve-low': 'approve-low-score.md',
  block: 'block.md',
  'request-changes': 'request-changes.md',
  'request-changes-critical': 'request-changes-critical.md',
  'critical-approve': 'critical-approve.md',
  conflict: 'conflicting.md',
  'score-mismatch': 'score-mismatch.md',
  partial: 'malformed.md',
};

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

const prompt = readStdin();

if (process.env.STUB_ASSERT_STDIN === '1') {
  if (!prompt.includes('---BEGIN FILES---')) {
    console.error('stub-agent: prompt did not arrive on stdin');
    process.exit(97);
  }
  if (process.argv.slice(2).some((arg) => arg.includes('---BEGIN FILES---'))) {
    console.error('stub-agent: prompt must not travel via argv');
    process.exit(98);
  }
}

if (process.env.STUB_ASSERT_MODEL) {
  const argv = process.argv.slice(2);
  const modelValues = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '-m' || arg === '--model') {
      modelValues.push(argv[index + 1]);
    } else if (arg.startsWith('-m=') || arg.startsWith('--model=')) {
      modelValues.push(arg.slice(arg.indexOf('=') + 1));
    }
  }
  // More than one model flag is a real failure, not pedantry: codex rejects a
  // repeated --model with a clap usage error, so a duplicate here would break
  // every codex run.
  if (modelValues.length > 1) {
    console.error(`stub-agent: argv sets the model ${modelValues.length} times; codex rejects a repeated --model`);
    process.exit(92);
  }
  const actual = modelValues[0] ?? null;
  if (actual !== process.env.STUB_ASSERT_MODEL) {
    console.error(
      `stub-agent: expected model "${process.env.STUB_ASSERT_MODEL}" in argv, got ${actual === null ? 'no model flag' : `"${actual}"`}`,
    );
    process.exit(93);
  }
}

const mode = process.env.STUB_MODE || 'approve';

if (mode === 'fail') {
  console.error('stub-agent: simulated agent failure (STUB_MODE=fail)');
  process.exit(2);
}

if (mode === 'nothing') {
  console.log('stub-agent: exited successfully without writing the requested report');
  console.error('stub-agent: success-path stderr before missing report');
  process.exit(0);
}

const outputMatch = prompt.match(/^Write (\/.+?)\. The step-03 evaluation protocol/m);
if (!outputMatch) {
  console.error('stub-agent: prompt is missing the "Write <path>" line');
  process.exit(96);
}
const outputPath = outputMatch[1];

function promptArray(begin, end) {
  const start = prompt.indexOf(`${begin}\n`);
  const finish = prompt.indexOf(`\n${end}`, start);
  if (start === -1 || finish === -1) {
    return [];
  }
  return JSON.parse(prompt.slice(start + begin.length + 1, finish));
}

const reviewedFiles = promptArray('---BEGIN FILES---', '---END FILES---');
const contextFiles = promptArray('---BEGIN CONTEXT---', '---END CONTEXT---');
const reportedContextFiles = process.env.STUB_CONTEXT_OVERRIDE
  ? JSON.parse(process.env.STUB_CONTEXT_OVERRIDE)
  : contextFiles;
const contextBasisMatch = prompt.match(/\*\*Context Basis\*\*: (none|pr_diff_truncated|pr_diff)/);
const contextBasis = contextBasisMatch ? contextBasisMatch[1] : 'none';

function replaceManifestSection(report, heading, files, { remove = false, addBefore } = {}) {
  const lines = report.split('\n');
  const start = lines.findIndex((line) => line === `## ${heading}`);
  if (start === -1) {
    if (remove || !addBefore) {
      return report;
    }
    const insertion = lines.findIndex((line) => line === `## ${addBefore}`);
    if (insertion === -1) {
      return report;
    }
    lines.splice(insertion, 0, `## ${heading}`, '', ...files.map((file) => `- ${file}`), '');
    return lines.join('\n');
  }
  let finish = start + 1;
  while (finish < lines.length && !lines[finish].startsWith('## ')) {
    finish++;
  }
  const replacement = remove ? [] : [`## ${heading}`, '', ...files.map((file) => `- ${file}`), ''];
  lines.splice(start, finish - start, ...replacement);
  return lines.join('\n');
}

function bindReportToPrompt(report) {
  let bound = report.replace(/^\*\*Context Basis\*\*:[ \t]*[^\n]+$/m, `**Context Basis**: ${contextBasis}`);
  bound = replaceManifestSection(bound, 'Reviewed Files', reviewedFiles);
  bound = replaceManifestSection(bound, 'Review Context', reportedContextFiles, {
    remove: contextBasis === 'none',
    addBefore: 'Reviewed Files',
  });
  return bound;
}

function writeFixtureReport(fixtureName) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const report = fs.readFileSync(path.join(__dirname, 'reports', fixtureName), 'utf8');
  fs.writeFileSync(outputPath, bindReportToPrompt(report));
  if (process.env.STUB_LOCK_OUTPUT === '1') {
    fs.chmodSync(outputPath, 0o444);
    fs.chmodSync(path.dirname(outputPath), 0o555);
  }
}

if (mode === 'forbidden-write') {
  try {
    fs.writeFileSync(path.join(process.cwd(), 'PWNED.txt'), 'isolation breach\n');
    console.error('stub-agent: forbidden write to PWNED.txt succeeded — filesystem isolation is NOT working');
    process.exit(99);
  } catch {
    // Expected under isolation: the write is denied, so the review can proceed.
  }
  writeFixtureReport('approve.md');
  process.exit(0);
}

if (mode === 'stale-copy') {
  const source = process.env.STUB_OLD_REPORT;
  if (!source) {
    console.error('stub-agent: STUB_OLD_REPORT must be set (and --env-pass STUB_OLD_REPORT passed) for STUB_MODE=stale-copy');
    process.exit(94);
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.copyFileSync(source, outputPath);
  const sourceStat = fs.statSync(source);
  fs.utimesSync(outputPath, sourceStat.atime, sourceStat.mtime); // keep the stale timestamps
  process.exit(0);
}

const fixture = REPORTS[mode];
if (!fixture) {
  console.error(`stub-agent: unknown STUB_MODE "${mode}"`);
  process.exit(95);
}
writeFixtureReport(fixture);
process.exit(0);
