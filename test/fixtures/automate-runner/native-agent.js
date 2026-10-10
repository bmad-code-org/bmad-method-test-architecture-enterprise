#!/usr/bin/env node
'use strict';
// Controlled generation transport with real native Playwright execution.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const prompt = fs.readFileSync(0, 'utf8');
const read = fs.readFileSync;
fs.readFileSync = function (file, ...args) {
  return file === 0 ? prompt : read.call(this, file, ...args);
};
require('./stub-agent');
fs.readFileSync = read;
const [form, selection = 'full'] = process.argv.slice(2);
const forms = {
  named: ["import {test,expect} from '@playwright/test';", 'test', 'ts'],
  cjs: ["const {test,expect}=require('@playwright/test');", 'test', 'cjs'],
  'cjs-alias': ["const {test:check,expect}=require('@playwright/test');", 'check', 'js'],
  'cjs-namespace': ["const pw=require('@playwright/test'); const {test,expect}=pw;", 'pw.test', 'cjs'],
  namespace: ["import * as pw from '@playwright/test'; import {test,expect} from '@playwright/test';", 'pw.test', 'ts'],
  'require-namespace': ["import {test,expect} from '@playwright/test'; const pw=require('@playwright/test');", 'pw.test', 'ts'],
  'namespace-alias': ["import * as pw from '@playwright/test'; const {test,expect}=pw; const check=pw.test;", 'check', 'ts'],
  'namespace-merge': [
    "import * as pw from '@playwright/test'; const {test,expect}=pw; const check=pw.mergeTests(pw.test,pw.test);",
    'check',
    'ts',
  ],
  merge: ["import {test,expect,mergeTests as combine} from '@playwright/test'; const check=combine(test,test);", 'check', 'ts'],
  'cjs-merge': ["const {test,expect,mergeTests:combine}=require('@playwright/test'); const check=combine(test,test);", 'check', 'cjs'],
  extend: ["import {test,expect} from '@playwright/test'; const check=test.extend({});", 'check', 'ts'],
  'var-alias': ["import {test,expect} from '@playwright/test'; {var check=test;}", 'check', 'ts'],
  reassigned: ["import {test,expect} from '@playwright/test'; let check; check=test;", 'check', 'ts'],
  'unresolved-namespace': ["import {test,expect} from '@playwright/test'; const pw=await import('@playwright/test');", 'pw.test', 'mjs'],
  'computed-namespace': [
    "import {test,expect} from '@playwright/test'; import * as pw from '@playwright/test'; const method='test';",
    'pw[method]',
    'ts',
  ],
  esm: ["import {test,expect} from '@playwright/test';", 'test', 'mjs'],
  'named-only': ["import {test,expect} from '@playwright/test';", 'test.only', 'ts'],
  'cjs-only': ["const {test,expect}=require('@playwright/test');", 'test.only', 'cjs'],
  'esm-package': ["import {test,expect} from '@playwright/test';", 'test', 'js'],
  'regexp-projects': ["import {test,expect} from '@playwright/test';", 'test', 'ts'],
  'glob-basename': ["import {test,expect} from '@playwright/test';", 'test', 'ts'],
  nested: ["import {test,expect} from '@playwright/test';", 'test', 'ts'],
  regexp: ["import {test,expect} from '@playwright/test';", 'test', 'ts'],
  'regexp-ignore': ["import {test,expect} from '@playwright/test';", 'test', 'ts'],
};
const [prefix, test, ext] = forms[form];
const file = `tests/api/generated.spec.${ext}`;
if (form === 'esm-package') fs.writeFileSync('tests/package.json', '{"type":"module"}');
fs.rmSync('tests/api/generated.spec.ts');
const first = [
  'namespace',
  'require-namespace',
  'namespace-alias',
  'namespace-merge',
  'cjs-namespace',
  'merge',
  'cjs-merge',
  'extend',
  'var-alias',
  'reassigned',
  'unresolved-namespace',
  'computed-namespace',
].includes(form)
  ? 'test'
  : test;
fs.writeFileSync(
  file,
  `${prefix}\n${first}('AC-1 behavior',()=>{expect(1).toBe(1)});\n${test}('AC-2 behavior',()=>{expect(2).toBe(2)});\n`,
);
const config = form === 'nested' ? 'configs/playwright.config.cjs' : 'playwright.config.cjs';
fs.mkdirSync(path.dirname(config), { recursive: true });
const selectors =
  form === 'regexp'
    ? 'testMatch:/GENERATED\\.spec\\.ts$/i,'
    : form === 'regexp-ignore'
      ? 'testMatch:/\\.spec\\.ts$/g,testIgnore:/[\\/]ignored[\\/]/i,'
      : form === 'regexp-projects'
        ? "projects:[{name:'active',testMatch:/generated\\.spec\\.ts$/g},{name:'ignored',testMatch:/\\.spec\\.ts$/,testIgnore:/GENERATED/i},{name:'unmatched',testMatch:/other\\.spec\\.ts$/}],"
        : form === 'glob-basename'
          ? "testMatch:'generated.spec.ts',"
          : '';
fs.writeFileSync(
  config,
  `module.exports={testDir:${JSON.stringify(form === 'nested' ? '../tests' : './tests')},${selectors}reporter:'json',workers:1};`,
);
if (form === 'regexp-ignore') {
  fs.mkdirSync('tests/ignored');
  fs.writeFileSync('tests/ignored/broken.spec.ts', "throw new Error('ignored source must stay unexecuted');\n");
}
const native = spawnSync(
  process.execPath,
  [
    path.join(path.dirname(require.resolve('playwright/package.json')), 'cli.js'),
    'test',
    '--config',
    path.resolve(config),
    ...(selection === 'partial' ? ['--grep', 'AC-1 behavior'] : []),
  ],
  { encoding: 'utf8', timeout: 20_000 },
);
fs.writeFileSync('_bmad-output/test-artifacts/automate/runner.json', native.stdout);
fs.writeFileSync('native-exit.json', JSON.stringify({ status: native.status, stderr: native.stderr }));
const manifestPath = JSON.parse(prompt.split('\n').find((line) => /^".*generation\.json"$/.test(line)));
const manifest = JSON.parse(fs.readFileSync(manifestPath));
manifest.generatedFiles = [file];
const count = selection === 'partial' ? 1 : 2;
manifest.counts.initial = manifest.counts.final = { executed: count, passed: count, failed: 0, skipped: 0, intendedFailures: 0 };
fs.writeFileSync(manifestPath, JSON.stringify(manifest));
