/** Controlled parser replay. This process performs no model generation. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const prompt = fs.readFileSync(0, 'utf8');
const contract = JSON.parse(
  prompt.match(/Required shape \(empty arrays are shape examples, fill all actual declared criteria\): (.*)\./)[1],
);
const reportPath = JSON.parse(prompt.match(/Produce a completed scope-specific audit at (.*)\./)[1]);
const contextPath = JSON.parse(prompt.match(/canonical workflow context at (.*?)\. Required shape/)[1]);
const source = process.argv[2];
const context = JSON.parse(fs.readFileSync(path.join(source, 'nfr-context-system.json')));
// These two transport identities bind the unchanged audit to this fresh consuming project.
context.requestId = contract.requestId;
context.supplied_project_root = contract.supplied_project_root;
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.copyFileSync(path.join(source, 'nfr-assessment-system.md'), reportPath);
fs.writeFileSync(contextPath, JSON.stringify(context, null, 2) + '\n');
process.stdout.write('Controlled parser replay of retained native report. No model generation.');
