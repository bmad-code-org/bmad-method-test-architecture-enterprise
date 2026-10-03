#!/usr/bin/env node
/**
 * The target of the partition-plan fixture (Story 1.51): a command that judges the request on its standard input by the gates
 * in rules/policy.txt, the file a controlled mutation edits. One gate covers each request, so a relaxed gate rejects only the
 * requests it covers and every other behavior keeps its verdict:
 *
 *   gate-1  the shared request and the contract's witnesses
 *   gate-2  a request that mentions the development partition
 *   gate-3  a request that mentions the held-out partition
 *
 * It prints `request: <the request>`, `verdict: accepted | rejected` and, when the covering gate is relaxed,
 * `relaxed: gate-<n>`. When VERDICT_MARKER names a file, every launch first appends one JSON line to it, the label of the
 * workspace it runs in and the request, so a case can count the launches of each request from outside the workspace.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const WORKSPACE = /^tea-evaluate-(.+)-(?:[A-Za-z0-9]{6}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

const request = fs.readFileSync(0, 'utf8').trim();
const policy = fs.readFileSync('rules/policy.txt', 'utf8').split('\n');
if (process.env.VERDICT_MARKER) {
  const label = WORKSPACE.exec(path.basename(path.dirname(process.cwd())))?.[1] ?? null;
  fs.appendFileSync(process.env.VERDICT_MARKER, `${JSON.stringify({ workspace: label, request })}\n`);
}
const gate = /held-out/.test(request) ? 'gate-3' : /development/.test(request) ? 'gate-2' : 'gate-1';
const relaxed = policy.includes(`${gate}: lenient`);
process.stdout.write([`request: ${request}`, `verdict: ${relaxed ? 'rejected' : 'accepted'}`, ...(relaxed ? [`relaxed: ${gate}`] : []), ''].join('\n'));
