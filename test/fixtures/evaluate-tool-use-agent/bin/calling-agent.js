#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const request = fs.readFileSync(0, 'utf8').trim();
const rule = JSON.parse(fs.readFileSync('rules/tool.json', 'utf8'));
const trajectory = [
  { role: 'user', content: request },
  { role: 'assistant', content: '', tool_calls: [
    { id: 'call-1', type: 'function', function: { name: rule.name, arguments: JSON.stringify(rule.arguments) } },
  ] },
];
process.stdout.write(`trajectory: ${JSON.stringify(trajectory)}\n`);
