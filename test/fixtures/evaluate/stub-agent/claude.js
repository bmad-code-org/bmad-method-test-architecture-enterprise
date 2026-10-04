#!/usr/bin/env node
/**
 * A stand-in for the Claude Code CLI behind `tea-skill-runner --agent claude --agent-cmd ./claude.js` (Story 1.113), so the real
 * runner and adapter run end to end under confinement with no account, no network and no model.
 *
 * It finds its login the way the CLI does on Linux: the variable CLAUDE_CODE_OAUTH_TOKEN, then the credentials file at
 * `.claude/.credentials.json` under HOME.
 * With neither it prints `Not logged in` to standard error and exits 1, which the runner reports as transport (exit 4).
 * Otherwise it answers in the shape the adapter reads (`--output-format json`).
 * `result` holds the name of the skill the prompt names, the request, and `login: <source> <sha256 of what it read>`.
 * The usage fields complete a report.
 *
 * Markers in the request:
 *   STUB-TRY-WRITE-LOGIN   also print whether an append to the credentials file under HOME was allowed or refused
 *   STUB-ECHO-TOKEN        also print the variable's value, which the run must scrub
 *   STUB-ECHO-LOGIN        also print the credentials file's content, which the run must scrub
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const prompt = fs.readFileSync(0, 'utf8');
const credentials = path.join(process.env.HOME ?? '', '.claude', '.credentials.json');
const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
let source = 'none';
let digest = '';
let content = '';
if (token !== undefined && token !== '') {
  source = 'token';
  digest = sha(token);
} else {
  try {
    content = fs.readFileSync(credentials, 'utf8');
    digest = sha(content);
    source = 'file';
  } catch {
    // No file: the check below reports the missing login.
  }
}
if (source === 'none') {
  process.stderr.write('Not logged in. Run `claude login`.\n');
  process.exit(1);
}
const skillRoot = /^The skill to run is in `([^`]+)`/.exec(prompt)?.[1] ?? '(none)';
const request = prompt.slice(prompt.indexOf('----- request -----') + '----- request -----'.length).trim();
const attempt = (action) => {
  try {
    action();
    return 'allowed';
  } catch (error) {
    return `refused ${error.code}`;
  }
};
const lines = [`skill-root: ${skillRoot}`, `request: ${request}`, `login: ${source} ${digest}`];
if (request.includes('STUB-TRY-WRITE-LOGIN')) {
  lines.push(`login-write: ${attempt(() => fs.appendFileSync(credentials, 'rewritten by the agent\n'))}`);
}
if (request.includes('STUB-ECHO-LOGIN')) lines.push(`login-echo: ${content.trim()}`);
if (request.includes('STUB-ECHO-TOKEN')) lines.push(`token-echo: ${token ?? '(unset)'}`);
process.stdout.write(
  `${JSON.stringify({ result: `${lines.join('\n')}\n`, usage: { input_tokens: 1, output_tokens: 1 }, total_cost_usd: 0 })}\n`,
);
