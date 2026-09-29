#!/usr/bin/env node
'use strict';
const fs = require('node:fs');

const request = fs.readFileSync(0, 'utf8').trim();
if (!/^List [a-z]+$/.test(request)) {
  process.stderr.write('error: invalid list request\n');
  process.exitCode = 2;
  return;
}
const items = JSON.parse(fs.readFileSync('target/rules/items.json', 'utf8'));
process.stdout.write(`Summary for ${request}: ${items.required.join(', ')}\n`);
