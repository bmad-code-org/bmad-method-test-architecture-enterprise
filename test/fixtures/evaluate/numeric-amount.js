#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

let request;
try {
  request = JSON.parse(fs.readFileSync(0, 'utf8'));
} catch {
  process.stdout.write('error: invalid amount\n');
  process.exit(0);
}

if (typeof request?.amount !== 'number' || !Number.isFinite(request.amount)) {
  process.stdout.write('error: invalid amount\n');
} else {
  process.stdout.write(`accepted amount: ${request.amount}\n`);
}
