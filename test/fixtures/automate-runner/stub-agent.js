#!/usr/bin/env node
// Synthetic transport fixture. It tests CLI orchestration and cannot establish generation quality.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const prompt = fs.readFileSync(0, 'utf8');
const manifestPath = JSON.parse(prompt.split('\n').find((line) => /^".*generation\.json"$/.test(line)));
const match = prompt.match(/Authoritative generation mode: (red|expand)\. Authoritative operation: (\w+)\./);
const mode = match[1];
const operation = match[2];
const settings = JSON.parse(prompt.match(/Resolved Create settings: (\{[^\n]+\})\. Keep default/)[1]);
const scenario = process.env.TEA_AUTOMATE_STUB_CASE ?? 'success';
if (scenario === 'missing') process.exit(0);
const summaryPath = '_bmad-output/test-artifacts/automate/summary.md';
fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
fs.mkdirSync('tests/api', { recursive: true });
fs.writeFileSync('tests/api/generated.spec.ts', `${mode === 'red' ? 'test.skip' : 'test'}('AC-1 behavior', () => {});\n`);
fs.writeFileSync('_bmad-output/test-artifacts/automate/runner.json', JSON.stringify({ synthetic: true, scenario }));
fs.writeFileSync(summaryPath, `---\n${yaml.dump({ workflowStatus: 'completed', test_mode: mode, test_operation: 'create', ...settings, healing_rounds_used: 0 })}---\n\n# Synthetic CLI fixture\n`);
const failed = scenario === 'failed';
const blocked = scenario === 'blocked';
const disabled = !settings.auto_validate;
const count = { executed: blocked || disabled ? 0 : 1, passed: blocked || disabled || failed || mode === 'red' ? 0 : 1, failed: blocked || disabled ? 0 : failed || mode === 'red' ? 1 : 0, skipped: 0, intendedFailures: mode === 'red' && !blocked && !disabled && !failed ? 1 : 0 };
const result = { mode, operation, executionStatus: blocked ? 'could not measure' : disabled ? 'disabled' : failed ? 'failed' : mode === 'red' ? 'verified red' : 'passed', summaryPath, generatedFiles: ['tests/api/generated.spec.ts'], executionReports: blocked || disabled ? [] : ['_bmad-output/test-artifacts/automate/runner.json'], counts: { initial: count, final: count }, healingRoundsUsed: 0, remainingFailures: failed || blocked ? ['Synthetic failure'] : [] };
const status = failed || mode === 'red' || scenario === 'forged-pass' ? 'failed' : 'passed';
fs.writeFileSync('_bmad-output/test-artifacts/automate/runner.json', JSON.stringify({ synthetic: true, suites: [{specs: [{tests: [{results: [{status}]}]}]}], errors: scenario === 'load-error' ? [{message: 'Synthetic import failure'}] : [] }));
if (scenario === 'mixed-report') {
  fs.writeFileSync('_bmad-output/test-artifacts/automate/runner.json', JSON.stringify({schemaVersion:1,files:[{tests:[{status:'failed'}]}],productionFilesTouched:['app.js']}));
  fs.writeFileSync('_bmad-output/test-artifacts/automate/opaque.json', JSON.stringify({note:'opaque evidence'}));
  result.executionReports.push('_bmad-output/test-artifacts/automate/opaque.json');
}
if (scenario === 'stale-report') fs.utimesSync('_bmad-output/test-artifacts/automate/runner.json', new Date(0), new Date(0));
if (scenario === 'wrong-mode') result.mode = mode === 'red' ? 'expand' : 'red';
if (scenario === 'skipped') result.counts.final.skipped = 1;
if (scenario === 'missing-file') result.generatedFiles = ['tests/api/absent.spec.ts'];
if (scenario === 'rounds') result.healingRoundsUsed = 4;
fs.writeFileSync(manifestPath, JSON.stringify(result));
process.stdout.write('Synthetic agent completed.\n');
