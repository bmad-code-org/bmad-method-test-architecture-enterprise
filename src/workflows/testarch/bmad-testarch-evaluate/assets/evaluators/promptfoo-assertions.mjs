#!/usr/bin/env node

// Declare the installed promptfoo with promptfoo-frameworks.json and installed-version.mjs (see references/evaluator.md).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
// Give every assertion in asserts.yaml a metric that exactly matches one key
// in mapping.json. The metric remains its identity if assertions are reordered.
const mapping = JSON.parse(fs.readFileSync(path.join(directory, 'mapping.json'), 'utf8'));
const mappedKeys = Object.keys(mapping.keys);
const knownKeys = new Set(mappedKeys);

// The assertion types that run no adopter code and call no model. Each is also admitted with a `not-` prefix.
export const ALLOWED_ASSERTION_TYPES = [
  'contains',
  'icontains',
  'contains-all',
  'contains-any',
  'icontains-all',
  'icontains-any',
  'equals',
  'starts-with',
  'regex',
  'is-json',
];
// promptfoo runs a `file://` value as code when the path before its first colon, once resolved, ends in one of these.
// Its own tests are `.js`, `.cjs`, `.mjs`, `.ts`, `.cts` and `.mts` without regard to case, and `.py` and `.rb` exactly.
// The guard takes all of them without regard to case.
const CODE_EXTENSIONS = ['.js', '.cjs', '.mjs', '.ts', '.cts', '.mts', '.py', '.rb'];
const QUOTED_LIMIT = 200;
const REPAIR = 'an assertion that needs code belongs in a command evaluator you own';

function quoted(text) {
  return JSON.stringify(String(text).slice(0, QUOTED_LIMIT));
}

function loadsCode(reference, { packages }) {
  if (packages && reference.startsWith('package:')) return true;
  if (!reference.startsWith('file://')) return false;
  const fileReference = reference.slice('file://'.length);
  const colon = fileReference.indexOf(':');
  const target = path.resolve('/', colon === -1 ? fileReference : fileReference.slice(0, colon)).toLowerCase();
  return CODE_EXTENSIONS.some((extension) => target.endsWith(extension));
}

// promptfoo has already run the assertion when this refuses it: a code reference or a transform ran, and a model-graded type called its model.
function refuseAssertion(assertion) {
  const { type } = assertion ?? {};
  const base = typeof type === 'string' && type.startsWith('not-') ? type.slice('not-'.length) : type;
  const named = typeof type === 'string' ? quoted(type) : '(none)';
  if (typeof base !== 'string' || !ALLOWED_ASSERTION_TYPES.includes(base)) {
    throw new Error(
      `promptfoo assertion type ${named} is refused: only assertions that run no adopter code and call no model are admitted (${ALLOWED_ASSERTION_TYPES.join(', ')}, each also with a not- prefix); ${REPAIR}`,
    );
  }
  const { value } = assertion;
  const references = Array.isArray(value) ? value.map((item) => [item, false]) : [[value, true]];
  for (const [reference, packages] of references) {
    if (typeof reference === 'string' && loadsCode(reference, { packages })) {
      throw new Error(`promptfoo assertion ${named} is refused: its value ${quoted(reference)} loads adopter code; ${REPAIR}`);
    }
  }
  if (assertion.transform !== undefined && assertion.transform !== null) {
    throw new Error(
      `promptfoo assertion ${named} is refused: its transform rewrites the output, so the assertion would grade text the target did not produce; ${REPAIR}`,
    );
  }
}

function assertionKey(assertion) {
  const metric = assertion?.metric;
  return typeof metric === 'string' && knownKeys.has(metric) ? metric : undefined;
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
  // The installed promptfoo --model-outputs path removes one final LF. It
  // preserves other trailing whitespace, which can affect assertions.
  const gradedOutput = stdout.endsWith('\n') ? stdout.slice(0, -1) : stdout;
  const failureEvidence = () => {
    if (stdout.length > 0) return { quote: stdout, quoteChannel: 'stdout' };
    if (Number.isInteger(observation.exitCode)) return { quote: String(observation.exitCode), quoteChannel: 'exit-code' };
    throw new Error('promptfoo cannot cite empty stdout without an observed exit code');
  };
  const rows = [];
  for (const result of results) {
    for (const assertion of Array.isArray(result.testCase?.assert) ? result.testCase.assert : []) refuseAssertion(assertion);
    const graded = result.gradingResult !== undefined && result.gradingResult !== null;
    if (result.response?.output !== undefined && (typeof result.response.output !== 'string' || result.response.output !== gradedOutput)) {
      throw new Error('promptfoo output differs from the cited stdout observation');
    }
    if (graded && typeof result.response?.output !== 'string') {
      throw new Error('promptfoo graded output other than the cited stdout observation');
    }
    const assertions = result.testCase?.assert;
    if (!Array.isArray(assertions) || assertions.length > mappedKeys.length) {
      throw new Error('promptfoo returned assertions outside evaluator/mapping.json');
    }
    const expected = assertions.map((assertion) => assertionKey(assertion));
    if (!Array.isArray(expected) || expected.length === 0 || expected.includes(undefined) || new Set(expected).size !== expected.length) {
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
      const key = assertionKey(grade?.assertion ?? (expected.length === 1 ? assertions[index] : undefined));
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
              ...failureEvidence(),
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
  const stdoutPrefix = process.argv.find((argument) => argument.startsWith('--stdout-prefix='))?.slice('--stdout-prefix='.length) ?? '';
  const matchingObservations = input.observations.filter(
    (candidate) => candidate.stdout?.kind === 'text' && candidate.stdout.value.startsWith(stdoutPrefix),
  );
  if (matchingObservations.length !== 1) {
    throw new Error(`expected one stdout observation matching the prefix, found ${matchingObservations.length}`);
  }
  const [observation] = matchingObservations;
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-promptfoo-'));
  try {
    fs.writeFileSync(path.join(temporary, 'outputs.json'), JSON.stringify([observation.stdout.value]));
    fs.copyFileSync(path.join(directory, 'asserts.yaml'), path.join(temporary, 'asserts.yaml'));
    const command = spawnSync(
      process.execPath,
      [
        promptfooEntrypoint(),
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
    const results = fs
      .readFileSync(resultFile, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const rows = rowsFromResults(results, observation);
    if (rows.length !== mappedKeys.length || new Set(rows.map((row) => row.key)).size !== mappedKeys.length) {
      throw new Error('promptfoo did not judge every mapped assertion exactly once');
    }
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
