#!/usr/bin/env node
/**
 * The command twin of the grader service in `test/fixtures/evaluate-api` (Story 1.42): it reads the same policy file,
 * `rules/policy.txt`, from its working directory, and says on stdout whether the request it reads from standard input
 * is accepted. The reused-operation fixture declares it as the `grader-cli` interface, whose `grade-answer` operation
 * shares its ID with the service's, so one contract holds the same operation ID on a command and on an HTTP interface.
 *
 *   request: <the request>
 *   verdict: accepted | rejected    accepted under `mode: strict`, rejected under `mode: lenient`, the mutation M-001
 */
'use strict';

const fs = require('node:fs');

const request = fs.readFileSync(0, 'utf8').trim();
const policy = fs.readFileSync('rules/policy.txt', 'utf8');
const verdict = /mode:\s*lenient/.test(policy) ? 'rejected' : 'accepted';
process.stdout.write(`request: ${request}\nverdict: ${verdict}\n`);
