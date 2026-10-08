#!/usr/bin/env node
/**
 * The agent of the tutorial evaluation: a stand-in for a model, so the tutorial runs with no credential, no network and no
 * model call. `tea-skill-runner --agent custom` starts it with the whole prompt on stdin, in the working directory of the
 * run, and takes its reply from stdout.
 *
 * It reads the skill directory the prompt names, finds the rule line of that skill's SKILL.md ("at or below the limit" or
 * "below the limit"), applies it to the amount and limit in the request, and prints the reply the skill asks for. A request
 * that gives no amount and limit is refused. A change to the rule line changes the reply, the way a change to a skill's
 * instructions changes a model's.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REQUEST_MARKER = '----- request -----';

const prompt = fs.readFileSync(0, 'utf8');
const skillRoot = /^The skill to run is in `([^`]+)`/.exec(prompt)?.[1];
if (skillRoot === undefined) {
  process.stderr.write('agent: the prompt names no skill directory\n');
  process.exit(9);
}
const skill = fs.readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8');
const request = prompt.slice(prompt.indexOf(REQUEST_MARKER) + REQUEST_MARKER.length).trim();

const rule = /^Approve a refund when its amount is (at or below|below) the limit\.$/m.exec(skill)?.[1];
if (rule === undefined) {
  process.stderr.write('agent: the skill holds no approval rule\n');
  process.exit(9);
}
const figures = /refund of (\d+) against the limit of (\d+)/.exec(request);
if (figures === null) {
  process.stdout.write(`${JSON.stringify({ status: 'refused' })}\n`);
  process.exit(0);
}
const amount = Number(figures[1]);
const limit = Number(figures[2]);
const approved = rule === 'at or below' ? amount <= limit : amount < limit;
process.stdout.write(`${JSON.stringify({ status: 'answered', decision: approved ? 'approved' : 'declined', amount })}\n`);
