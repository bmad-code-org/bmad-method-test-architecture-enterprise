#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rules = JSON.parse(readFileSync(new URL('../rules/review.json', import.meta.url), 'utf8'));
let input = '';
for await (const chunk of process.stdin) input += chunk;

let request;
try {
  request = JSON.parse(input);
} catch {
  console.log(JSON.stringify({ error: 'invalid JSON' }));
  process.exit(0);
}

if (
  process.argv.length !== 2 ||
  request === null ||
  typeof request !== 'object' ||
  Array.isArray(request) ||
  request.action !== 'review' ||
  typeof request.file !== 'string' ||
  Object.keys(request).length !== 2
) {
  console.log(JSON.stringify({ error: 'provide a JSON object with action review and a file string' }));
  process.exit(0);
}

try {
  const source = readFileSync(resolve(request.file), 'utf8');
  const findings = [];
  if (!rules.assertions.some((token) => source.includes(token))) findings.push('missing-assertion');
  if (rules.disabled.some((token) => source.includes(token))) findings.push('disabled-test');
  console.log(JSON.stringify({ file: request.file, status: findings.length === 0 ? 'clean' : 'findings', findings }));
} catch {
  console.log(JSON.stringify({ error: 'cannot read test file' }));
}
