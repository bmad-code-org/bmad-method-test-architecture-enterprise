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
 *                      partial | nothing | fail | forbidden-write | stale-copy
 *   STUB_ASSERT_STDIN  when "1", fail if the prompt did not arrive on stdin or
 *                      if any of it leaked into argv
 *   STUB_OLD_REPORT    stale-copy source: a report pre-placed with an old mtime
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

const mode = process.env.STUB_MODE || 'approve';

if (mode === 'fail') {
  console.error('stub-agent: simulated agent failure (STUB_MODE=fail)');
  process.exit(2);
}

if (mode === 'nothing') {
  process.exit(0);
}

const outputMatch = prompt.match(/^Write (\/.+?)\. The step-03 evaluation protocol/m);
if (!outputMatch) {
  console.error('stub-agent: prompt is missing the "Write <path>" line');
  process.exit(96);
}
const outputPath = outputMatch[1];

function writeFixtureReport(fixtureName) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'reports', fixtureName), outputPath);
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
