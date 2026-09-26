#!/usr/bin/env node
'use strict';
const fs = require('node:fs');

const request = fs.readFileSync(0, 'utf8').trim();
const items = JSON.parse(fs.readFileSync('rules/items.json', 'utf8'));
process.stdout.write(`Summary for ${request}: ${items.required.join(', ')}\n`);
