#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const keys = new Map([
  ['contains:apples', 'required-apples'],
  ['contains:pears', 'required-pears'],
  ['not-contains:shellfish', 'forbidden-shellfish'],
]);
const knownKeys = new Set(keys.values());

function assertionKey(assertion) {
  const byTypeAndValue = keys.get(`${assertion?.type}:${assertion?.value}`);
  const metric = assertion?.metric;
  if (
    (metric !== undefined && (!knownKeys.has(metric) || (byTypeAndValue !== undefined && metric !== byTypeAndValue))) ||
    (metric !== undefined && assertion?.type !== 'javascript' && byTypeAndValue === undefined)
  ) {
    throw new Error('promptfoo assertion metric conflicts with its type and value');
  }
  return byTypeAndValue ?? metric;
}

function completedStatus(status, stderr = '') {
  if (status !== 0 && status !== 100) throw new Error(`promptfoo exited ${status} before completing evaluation: ${stderr}`);
}

function promptfooEntrypoint() {
  const require = createRequire(import.meta.url);
  let candidate = path.dirname(require.resolve('promptfoo'));
  while (candidate !== path.dirname(candidate)) {
    const packageFile = path.join(candidate, 'package.json');
    if (fs.existsSync(packageFile)) {
      const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
      if (pkg.name === 'promptfoo') return path.join(candidate, pkg.bin.promptfoo);
    }
    candidate = path.dirname(candidate);
  }
  throw new Error('the installed promptfoo devDependency could not be located');
}

export function rowsFromResults(results, observation) {
  const stdout = observation.stdout.value;
  const rows = [];
  for (const result of results) {
    const graded = result.gradingResult !== undefined && result.gradingResult !== null;
    if (result.response?.output !== undefined && (typeof result.response.output !== 'string' || result.response.output.trimEnd() !== stdout.trimEnd())) {
      throw new Error('promptfoo output differs from the cited stdout observation');
    }
    if (graded && typeof result.response?.output !== 'string') {
      throw new Error('promptfoo graded output other than the cited stdout observation');
    }
    const expected = result.testCase?.assert?.map(assertionKey);
    if (!Array.isArray(expected) || expected.length === 0 || expected.some((key) => key === undefined) || new Set(expected).size !== expected.length) {
      throw new Error('promptfoo returned missing, unknown, or repeated assertion metadata');
    }
    const components = result.gradingResult?.componentResults;
    if (components !== undefined && (!Array.isArray(components) || components.length === 0)) {
      throw new Error('promptfoo returned an empty or invalid componentResults list');
    }
    if (!graded) {
      // No gradingResult means promptfoo could not grade this output, which says nothing about the target.
      // The trial stops here without a judgment row.
      const frameworkError =
        (typeof result.error === 'string' ? result.error.trim().split('\n')[0].slice(0, 200) : '') || 'no error reported';
      throw new Error(`promptfoo returned an ungraded framework error (${frameworkError}); the evaluation stops without a judgment`);
    }
    if (expected.length > 1 && (!Array.isArray(components) || components.length !== expected.length)) {
      throw new Error('promptfoo returned an incomplete multi-assertion grade');
    }
    if (Array.isArray(components) && components.length > 0 && components.length !== expected.length) {
      throw new Error('promptfoo returned an incomplete assertion grade');
    }
    const grades = Array.isArray(components) && components.length > 0 ? components : [result.gradingResult];
    const observedKeys = new Set();
    for (const [index, grade] of grades.entries()) {
      if (typeof grade?.pass !== 'boolean') throw new Error('promptfoo returned a grade without a boolean pass');
      const key = assertionKey(grade?.assertion ?? (expected.length === 1 ? result.testCase.assert[index] : undefined));
      if (key === undefined || !expected.includes(key) || observedKeys.has(key)) {
        throw new Error('promptfoo returned a grade without a unique expected assertion');
      }
      observedKeys.add(key);
      const passed = grade?.pass === true;
      rows.push(
        passed
          ? { key, outcome: 'pass', observationIds: [observation.observationId], comment: grade.reason ?? 'Assertion passed.' }
          : {
              key,
              outcome: 'fail',
              observationIds: [observation.observationId],
              quote: stdout,
              quoteChannel: 'stdout',
              confidence: 1,
              comment: grade?.reason ?? 'Assertion failed.',
            },
      );
    }
    if (observedKeys.size !== expected.length) throw new Error('promptfoo omitted an expected assertion judgment');
  }
  return rows;
}

function main() {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const observation = input.observations.find(
    (candidate) => candidate.stdout?.kind === 'text' && candidate.stdout.value.startsWith('Summary for '),
  );
  if (observation === undefined) throw new Error('the summarizer supplied no stdout summary');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-promptfoo-'));
  try {
    fs.writeFileSync(path.join(temporary, 'outputs.json'), JSON.stringify([observation.stdout.value]));
    const assertions = process.argv.includes('--single')
      ? 'asserts-single.yaml'
      : process.argv.includes('--ungraded')
        ? 'asserts-ungraded.yaml'
        : 'asserts.yaml';
    fs.copyFileSync(path.join(directory, assertions), path.join(temporary, 'asserts.yaml'));
    const command = spawnSync(
      process.execPath,
      [promptfooEntrypoint(), 'eval', '--assertions', 'asserts.yaml', '--model-outputs', 'outputs.json', '--output', 'results.jsonl', '--no-cache', '--no-write', '--no-table'],
      {
        cwd: temporary,
        encoding: 'utf8',
        timeout: 45_000,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          TMPDIR: temporary,
          LANG: process.env.LANG ?? 'C.UTF-8',
          PROMPTFOO_DISABLE_TELEMETRY: '1',
          PROMPTFOO_DISABLE_UPDATE: '1',
        },
      },
    );
    if (command.error) throw command.error;
    completedStatus(command.status, command.stderr);
    const resultFile = path.join(temporary, 'results.jsonl');
    if (!fs.existsSync(resultFile)) throw new Error(`promptfoo exited ${command.status} without a JSONL result: ${command.stderr}`);
    const results = fs.readFileSync(resultFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    const rows = rowsFromResults(results, observation);
    if (rows.length === 0) throw new Error('promptfoo returned no assertion judgments');
    process.stdout.write(`${JSON.stringify({ rows })}\n`);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--map-results')) {
    const { results, observation, status } = JSON.parse(fs.readFileSync(0, 'utf8'));
    if (status !== undefined) completedStatus(status);
    process.stdout.write(`${JSON.stringify({ rows: rowsFromResults(results, observation) })}\n`);
  } else main();
}
