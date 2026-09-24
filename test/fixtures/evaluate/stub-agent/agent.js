#!/usr/bin/env node
/**
 * A stand-in for a vendor CLI behind `tea-skill-runner --agent custom`, so the
 * runner and `tea-evaluate preflight` run end to end with no credential, no
 * network and no model (Story 1.6).
 *
 * It honours the custom adapter's contract (`cli/lib/agent-adapters.js`): the
 * whole prompt on stdin, the working directory as its world, the reply on
 * stdout, a non-zero exit on failure. It reads the skill directory the runner's
 * first prompt line names and prints the `name` in that skill's `SKILL.md`, so
 * a run proves the runner handed over the skill root it was given, and it
 * prints the request line, so two prompts give two replies.
 *
 * Markers in the request drive the other cases:
 *   STUB-EXIT <n>    print to stderr and exit n
 *   STUB-SLEEP <ms>  wait that long before answering (a timeout case)
 *   STUB-ENV <NAME>  also print the value of that environment variable
 *   STUB-WRITE       write stub-wrote.txt in the working directory
 *   STUB-ORPHAN <file>  start a child that sleeps for a minute and write its
 *                    pid to that absolute path, before any sleep (a case that
 *                    asserts nothing the agent started outlives the turn)
 *   STUB-BIG <n>     print n bytes of filler after the reply
 *   STUB-LIST        also print every path under the working directory, as
 *                    JSON, a symbolic link marked with a trailing `@` and not
 *                    followed
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const REQUEST_MARKER = '----- request -----';

const prompt = fs.readFileSync(0, 'utf8');
const skillRoot = /^The skill to run is in `([^`]+)`/.exec(prompt)?.[1];
if (skillRoot === undefined) {
  process.stderr.write('stub-agent: the prompt names no skill directory\n');
  process.exit(9);
}
const skill = fs.readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8');
const name = /^name:\s*(\S+)/m.exec(skill)?.[1] ?? '(unnamed)';
const request = prompt.slice(prompt.indexOf(REQUEST_MARKER) + REQUEST_MARKER.length).trim();

const orphan = /STUB-ORPHAN (\S+)/.exec(request);
if (orphan !== null) {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
  fs.writeFileSync(orphan[1], String(child.pid));
}
const sleep = /STUB-SLEEP (\d+)/.exec(request);
if (sleep !== null) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(sleep[1]));
const exit = /STUB-EXIT (\d+)/.exec(request);
if (exit !== null) {
  process.stderr.write(`stub-agent: asked to exit ${exit[1]}\n`);
  process.exit(Number(exit[1]));
}
if (request.includes('STUB-WRITE')) fs.writeFileSync('stub-wrote.txt', 'written by the stub agent\n');
const env = /STUB-ENV ([A-Za-z_][A-Za-z0-9_]*)/.exec(request);
const echoed = env === null ? '' : `env: ${process.env[env[1]] ?? '(unset)'}\n`;
function listing(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${prefix}${entry.name}`;
    if (entry.isSymbolicLink()) return [`${relative}@`];
    if (entry.isDirectory()) return [relative, ...listing(path.join(directory, entry.name), `${relative}/`)];
    return [relative];
  });
}
const listed = request.includes('STUB-LIST') ? `list: ${JSON.stringify(listing('.').sort())}\n` : '';
const big = /STUB-BIG (\d+)/.exec(request);
const filler = big === null ? '' : `${'x'.repeat(Number(big[1]))}\n`;
process.stdout.write(`skill: ${name}\nrequest: ${request}\n${echoed}${listed}${filler}`);
