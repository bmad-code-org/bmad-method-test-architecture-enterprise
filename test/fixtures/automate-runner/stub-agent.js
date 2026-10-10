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
const requestId = JSON.parse(prompt.match(/CLI request identity: ("[^"]+")\./)[1]);
const settings = JSON.parse(prompt.match(/Resolved Create settings: (\{[^\n]+\})\. Keep default/)[1]);
const story = prompt.match(/Story path: ("[^\n]+")\./)?.[1];
const targets = prompt.match(/Target scope: (\[[^\n]+\])\. Read/)?.[1];
const selected = prompt.match(/Exact saved artifact: ("[^\n]+")\. Select/)?.[1];
const terminal = mode === 'red' ? 'step-05-validate-and-complete' : 'step-04-validate-and-summarize';
const steps = mode === 'red' ? ['step-01-preflight-and-context','step-02-generation-mode','step-03-test-strategy','step-04c-aggregate',terminal] : ['step-01-preflight-and-context','step-02-identify-targets','step-03c-aggregate',terminal];
const scenario = process.env.TEA_AUTOMATE_STUB_CASE ?? 'success';
if (scenario === 'missing') process.exit(0);
const unrelated = scenario.endsWith('unrelated');
const summaryPath = selected && !unrelated ? JSON.parse(selected) : '_bmad-output/test-artifacts/automate/summary.md';
const original = fs.existsSync(summaryPath) ? fs.readFileSync(summaryPath, 'utf8') : '';
const parsed = original.match(/^---\n([\s\S]*?)\n---/);
const saved = parsed ? yaml.load(parsed[1]) : {};
fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
fs.mkdirSync('tests/api', { recursive: true });
fs.mkdirSync('_bmad-output/test-artifacts/automate', { recursive: true });
if (scenario !== 'stale-artifacts') {
  if (scenario !== 'stale-generated') fs.writeFileSync('tests/api/generated.spec.ts', `${mode === 'red' ? 'test.skip' : 'test'}('AC-1 behavior', () => {});\n`);
  if (operation === 'create' || operation === 'resume') {
    fs.writeFileSync(summaryPath, `---\n${yaml.dump({ ...saved, stepsCompleted: steps, lastStep:terminal, workflowStatus: 'completed', test_mode: mode, test_operation: 'create', ...settings, healing_rounds_used: (operation === 'create' ? 0 : saved.healing_rounds_used ?? 0), cli_request_id: requestId, cli_story: operation === 'resume' && Object.hasOwn(saved,'cli_story') ? saved.cli_story : story ? JSON.parse(story) : null, cli_targets: operation === 'resume' && Object.hasOwn(saved,'cli_targets') ? saved.cli_targets : targets ? JSON.parse(targets) : [], inputDocuments: story ? [JSON.parse(story)] : saved.inputDocuments ?? [] })}---\n\n# Synthetic CLI fixture\n`);
  } else if (operation === 'edit') {
    if (!unrelated && scenario !== 'edit-unchanged') fs.writeFileSync(summaryPath, `${original}\nRequested synthetic edit applied.\n`);
    else if (unrelated) fs.writeFileSync(summaryPath, `---\n${yaml.dump({workflowStatus:'completed',test_mode:mode,test_operation:'create'})}---\n# Unrelated\n`);
  } else if (unrelated) fs.writeFileSync(summaryPath, `---\n${yaml.dump({workflowStatus:'completed',test_mode:mode,test_operation:'create'})}---\n# Unrelated\n`);
}
const failed = scenario === 'failed';
const blocked = scenario === 'blocked';
const disabled = !settings.auto_validate || ['edit','validate'].includes(operation);
const count = { executed: blocked || disabled ? 0 : 1, passed: blocked || disabled || failed || mode === 'red' ? 0 : 1, failed: blocked || disabled ? 0 : failed || mode === 'red' ? 1 : 0, skipped: 0, intendedFailures: mode === 'red' && !blocked && !disabled && !failed ? 1 : 0 };
const validationReportPath = operation === 'validate' ? path.join('_bmad-output/test-artifacts/automate', `validation-${requestId}.md`) : null;
if (validationReportPath) {
  fs.writeFileSync(validationReportPath, `---\n${yaml.dump({cli_request_id:requestId,cli_mode:mode,cli_operation:'validate',status:scenario === 'validation-incomplete' ? 'IN_PROGRESS' : 'PASS',validated_artifacts:[summaryPath]})}---\n# Synthetic validation\n`, {flag:'wx'});
  if (scenario === 'validate-mutates') fs.appendFileSync(summaryPath, '\nUnrequested mutation.\n');
}
const result = { requestId, validationReportPath, mode, operation, executionStatus: blocked ? 'could not measure' : disabled ? 'disabled' : failed ? 'failed' : mode === 'red' ? 'verified red' : 'passed', summaryPath, generatedFiles: ['tests/api/generated.spec.ts'], executionReports: blocked || disabled ? [] : ['_bmad-output/test-artifacts/automate/runner.json'], counts: { initial: count, final: count }, healingRoundsUsed: (operation === 'create' ? 0 : saved.healing_rounds_used ?? 0), remainingFailures: failed || blocked ? ['Synthetic failure'] : [] };
const status = failed || mode === 'red' || scenario === 'forged-pass' ? 'failed' : 'passed';
fs.writeFileSync('_bmad-output/test-artifacts/automate/runner.json', JSON.stringify({ synthetic: true, config:{configFile:path.resolve('playwright.config.ts'),rootDir:path.resolve('tests'),projects:[{id:'',name:'',testDir:path.resolve('tests'),testMatch:['**/*.spec.ts'],testIgnore:[]}]}, suites: [{file:'api/generated.spec.ts',specs: [{file:'api/generated.spec.ts',title:'AC-1 behavior',line:1,column:mode === 'red' ? 6 : 5,tests: [{projectId:'',projectName:'',results: [{status,errors:status === 'failed' ? [{message:'Error: expect(received).toBe(expected)\nExpected: 201\nReceived: 404'}] : []}]}]}]}], errors: scenario === 'load-error' ? [{message: 'Synthetic import failure'}] : [] }));
if (['second-file','second-leaf','wrong-title','wrong-line','missing-project','anonymous-report','dynamic-test','table-test','callback-test','repeat-missing','repeat-complete','projects-complete','alias-suite','computed-test','declared-alias','activated-red','wrong-column'].includes(scenario)) {
  const runnerPath='_bmad-output/test-artifacts/automate/runner.json';
  const report=JSON.parse(fs.readFileSync(runnerPath,'utf8'));
  if (scenario === 'second-file') {fs.writeFileSync('tests/api/second.spec.ts', "test('AC-2 behavior',()=>{});\n");result.generatedFiles.push('tests/api/second.spec.ts');}
  if (scenario === 'second-leaf') fs.appendFileSync('tests/api/generated.spec.ts', "test('AC-2 behavior',()=>{});\n");
  if (scenario === 'dynamic-test') fs.writeFileSync('tests/api/generated.spec.ts', "for (const title of ['AC-1 behavior','AC-2 behavior']) test(title,()=>{});\n");
  if (scenario === 'table-test') fs.appendFileSync('tests/api/generated.spec.ts', "test.each(['one','two'])('dynamic %s',()=>{});\n");
  if (scenario === 'callback-test') fs.appendFileSync('tests/api/generated.spec.ts', "test('other leaf', callback);\n");
  if (['repeat-missing','repeat-complete'].includes(scenario)) report.config.projects[0].repeatEach=2;
  if (scenario === 'repeat-complete') {report.suites[0].specs[0].tests.push(structuredClone(report.suites[0].specs[0].tests[0]));for (const counts of Object.values(result.counts)) {counts.executed=2;counts.passed=2;}}
  if (scenario === 'projects-complete') {report.config.projects.push({...report.config.projects[0],id:'mobile',name:'mobile'});report.suites[0].specs[0].tests.push({...structuredClone(report.suites[0].specs[0].tests[0]),projectId:'mobile',projectName:'mobile'});for (const counts of Object.values(result.counts)) {counts.executed=2;counts.passed=2;}}
  if (scenario === 'alias-suite') {
    fs.writeFileSync('tests/api/generated.spec.ts', "import {test as check} from '@playwright/test';\ncheck.describe('suite',()=>{\n  check('AC-1 behavior',()=>{});\n});\n");
    const spec=report.suites[0].specs[0];spec.line=3;spec.column=8;
    report.suites[0].specs=[];report.suites[0].suites=[{title:'suite',file:'api/generated.spec.ts',line:2,column:1,specs:[spec]}];
  }
  if (scenario === 'computed-test') fs.appendFileSync('tests/api/generated.spec.ts', "test[method]('other leaf', ()=>{});\n");
  if (scenario === 'declared-alias') fs.appendFileSync('tests/api/generated.spec.ts', "alias('other leaf',()=>{});\nimport {test as alias} from '@playwright/test';\n");
  if (scenario === 'activated-red') report.suites[0].specs[0].column=5;
  if (scenario === 'wrong-column') report.suites[0].specs[0].column=99;
  if (scenario === 'wrong-title') report.suites[0].specs[0].title='unrelated';
  if (scenario === 'wrong-line') report.suites[0].specs[0].line=2;
  if (scenario === 'missing-project') report.config.projects.push({...report.config.projects[0],id:'mobile',name:'mobile'});
  if (scenario === 'anonymous-report') delete report.suites[0].specs[0].file;
  if (scenario === 'anonymous-report') delete report.suites[0].file;
  fs.writeFileSync(runnerPath,JSON.stringify(report));
}
if (['incomplete-steps','wrong-terminal','wrong-step-mode','disabled-round','increment-round'].includes(scenario)) {
  const state=yaml.load(fs.readFileSync(summaryPath,'utf8').match(/^---\n([\s\S]*?)\n---/)[1]);
  if (scenario === 'incomplete-steps') state.stepsCompleted=[];
  if (scenario === 'wrong-terminal') state.lastStep='step-01-preflight-and-context';
  if (scenario === 'wrong-step-mode') state.stepsCompleted=mode === 'red' ? ['step-01-preflight-and-context','step-02-identify-targets','step-03c-aggregate','step-04-validate-and-summarize'] : ['step-01-preflight-and-context','step-02-generation-mode','step-03-test-strategy','step-04c-aggregate','step-05-validate-and-complete'];
  if (['disabled-round','increment-round'].includes(scenario)) {state.healing_rounds_used=((operation === 'create' ? 0 : saved.healing_rounds_used ?? 0))+1;result.healingRoundsUsed=state.healing_rounds_used;}
  fs.writeFileSync(summaryPath,`---\n${yaml.dump(state)}---\n# Synthetic CLI fixture\n`);
}
if (scenario === 'late-directory-hardlink') fs.linkSync('src/schema.json','late-directory-result.json');
if (scenario === 'mixed-pass') {
  fs.writeFileSync('_bmad-output/test-artifacts/automate/opaque.json',JSON.stringify({note:'opaque'}));result.executionReports.push('_bmad-output/test-artifacts/automate/opaque.json');
}
if (scenario === 'mixed-report') {
  fs.writeFileSync('_bmad-output/test-artifacts/automate/runner.json', JSON.stringify({schemaVersion:1,files:[{tests:[{status:'failed'}]}],productionFilesTouched:['app.js']}));
  fs.writeFileSync('_bmad-output/test-artifacts/automate/opaque.json', JSON.stringify({note:'opaque evidence'}));
  result.executionReports.push('_bmad-output/test-artifacts/automate/opaque.json');
}
if (scenario === 'opaque') fs.writeFileSync('_bmad-output/test-artifacts/automate/runner.json', JSON.stringify({note:'unrecognized evidence'}));
if (scenario === 'invalid-json') fs.writeFileSync('_bmad-output/test-artifacts/automate/runner.json', '{invalid');
if (['timed-out-red', 'interrupted-red', 'nonassertion-red'].includes(scenario)) fs.writeFileSync('_bmad-output/test-artifacts/automate/runner.json', JSON.stringify({suites:[{specs:[{tests:[{results:[{status:scenario === 'timed-out-red' ? 'timedOut' : scenario === 'interrupted-red' ? 'interrupted' : 'failed',errors:[{message:'Infrastructure unavailable'}]}]}]}]}],errors:[]}));
if (scenario === 'stale-report') fs.utimesSync('_bmad-output/test-artifacts/automate/runner.json', new Date(0), new Date(0));
if (scenario === 'duplicate-report-hardlink') {
  const alias = '_bmad-output/test-artifacts/automate/runner-alias.json';
  if (fs.existsSync(alias)) fs.unlinkSync(alias);
  fs.linkSync(result.executionReports[0], alias);
  result.executionReports.push(alias);
  for (const counts of Object.values(result.counts)) { counts.executed *= 2; counts.passed *= 2; }
}
if (scenario === 'wrong-mode') result.mode = mode === 'red' ? 'expand' : 'red';
if (scenario === 'wrong-request') result.requestId = 'another-request';
if (scenario === 'wrong-scope') {
  const text=fs.readFileSync(summaryPath,'utf8');fs.writeFileSync(summaryPath,text.replace('cli_targets:', 'unrelated_targets:'));
}
if (scenario === 'skipped') result.counts.final.skipped = 1;
if (scenario === 'missing-file') result.generatedFiles = ['tests/api/absent.spec.ts'];
if (scenario === 'rounds') result.healingRoundsUsed = 4;
if (scenario === 'reset-rounds') result.healingRoundsUsed = 0;
if (scenario === 'late-hardlink') fs.linkSync('tests/api/generated.spec.ts','late-result.json');
fs.writeFileSync(manifestPath, JSON.stringify(result));
process.stdout.write('Synthetic agent completed.\n');
