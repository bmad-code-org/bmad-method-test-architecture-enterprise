#!/usr/bin/env node
/**
 * A stand-in target for `tea-evaluate preflight`'s mutation cases (Story 1.7):
 * a command that judges the request on its standard input by the policy in
 * `rules/policy.txt`, the file a controlled mutation edits.
 *
 * Every run prints, from its own working directory:
 *
 *   request: <the request>
 *   digest: sha256:<hex>        the SHA-256 of rules/policy.txt as it reads it,
 *                               evidence the runtime does not compute itself
 *   workspace: git-worktree | git-repository | plain
 *                               whether .git here is a worktree's file, a
 *                               repository's directory, or absent
 *   evaluation: present | absent
 *                               whether the evaluation folder (evals/verdict/) is here
 *   vendor: <vendor/library.txt, or (absent)>
 *   vendor-write: denied | allowed | absent
 *                               whether a write under the provisioned vendor/
 *                               succeeded
 *   residue: yes | no           whether residue.txt, which a lenient run
 *                               leaves behind, is here
 *   secret: <VERDICT_SECRET>    only when the host sets it
 *   verdict: accepted | rejected | unknown
 *                               accepted under `mode: strict`, rejected under
 *                               `mode: lenient`
 *
 * Policy lines drive the other cases:
 *
 *   sabotage: restore       after answering, replace rules/policy.txt with a
 *                           directory, so the runtime's restore cannot write it
 *   sabotage: adopter       append a line to the file VERDICT_TOUCH names, a
 *                           path outside the workspace, as a target that
 *                           writes where it must not would
 *   sabotage: refs          tag the checked-out commit through the worktree's
 *                           repository, which the adopter's repository shares
 *   sabotage: locked        leave locked/inner behind with locked/ unreadable,
 *                           as a target that locks its own output would
 *   sabotage: link          replace rules/ with a symbolic link to the
 *                           directory VERDICT_LINK names, outside the workspace
 *   sabotage: exclude       append a line to info/exclude in the git directory
 *                           the worktree shares with the adopter's repository
 *   sabotage: swap-root     after answering, move this working directory aside
 *                           and put a symbolic link to VERDICT_LINK in its
 *                           place, as a target that swaps its own root would
 *   sabotage: leg-writes    append to VERDICT_TOUCH only when the request is
 *                           `Judge alpha.`, which a preflight leg sends and no
 *                           arm does
 *   infrastructure: exit 3  answer nothing and exit 3, an exit its registry
 *                           entry declares as infrastructure
 *   sleep: <ms>             write this process's pid to the file VERDICT_PID
 *                           names, then wait that long before answering (a
 *                           case that interrupts the run mid-arm)
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const POLICY = 'rules/policy.txt';

const request = fs.readFileSync(0, 'utf8').trim();
const policy = fs.readFileSync(POLICY);
const text = policy.toString('utf8');
if (text.includes('infrastructure: exit 3')) {
  process.stderr.write('verdict: asked to report an infrastructure failure\n');
  process.exit(3);
}
const sleep = /sleep: (\d+)/.exec(text);
if (sleep !== null) {
  if (process.env.VERDICT_PID) fs.writeFileSync(process.env.VERDICT_PID, String(process.pid));
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(sleep[1]));
}

let workspace = 'plain';
try {
  workspace = fs.lstatSync('.git').isDirectory() ? 'git-repository' : 'git-worktree';
} catch {
  // No .git here: a plain copy.
}

let vendor = '(absent)';
let vendorWrite = 'absent';
if (fs.existsSync('vendor')) {
  vendor = fs.readFileSync('vendor/library.txt', 'utf8').trim();
  try {
    fs.writeFileSync('vendor/probe-write.txt', 'written by the verdict stub\n');
    vendorWrite = 'allowed';
  } catch {
    vendorWrite = 'denied';
  }
}
const residue = fs.existsSync('residue.txt') ? 'yes' : 'no';

let verdict = 'unknown';
if (text.includes('mode: strict')) verdict = 'accepted';
else if (text.includes('mode: lenient')) verdict = 'rejected';

process.stdout.write(
  [
    `request: ${request}`,
    `digest: sha256:${crypto.createHash('sha256').update(policy).digest('hex')}`,
    `workspace: ${workspace}`,
    `evaluation: ${fs.existsSync('evals/verdict') ? 'present' : 'absent'}`,
    `vendor: ${vendor}`,
    `vendor-write: ${vendorWrite}`,
    `residue: ${residue}`,
    ...(process.env.VERDICT_SECRET ? [`secret: ${process.env.VERDICT_SECRET}`] : []),
    `verdict: ${verdict}`,
    '',
  ].join('\n'),
);

if (verdict === 'rejected') fs.writeFileSync('residue.txt', 'left behind by a lenient run\n');
if (text.includes('sabotage: adopter') && process.env.VERDICT_TOUCH) {
  fs.appendFileSync(process.env.VERDICT_TOUCH, 'written by the verdict stub outside its workspace\n');
}
if (text.includes('sabotage: refs')) spawnSync('git', ['tag', '--force', 'verdict-sabotage'], { stdio: 'ignore' });
if (text.includes('sabotage: leg-writes') && request === 'Judge alpha.' && process.env.VERDICT_TOUCH) {
  fs.appendFileSync(process.env.VERDICT_TOUCH, 'written by a preflight leg outside its workspace\n');
}
if (text.includes('sabotage: exclude')) {
  const common = spawnSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).stdout.trim();
  if (common.length > 0) fs.appendFileSync(`${common}/info/exclude`, 'written-by-the-verdict-stub\n');
}
if (text.includes('sabotage: link') && process.env.VERDICT_LINK) {
  fs.rmSync('rules', { recursive: true, force: true });
  fs.symlinkSync(process.env.VERDICT_LINK, 'rules');
}
if (text.includes('sabotage: locked')) {
  fs.mkdirSync('locked/inner', { recursive: true });
  fs.chmodSync('locked', 0o000);
}
if (text.includes('sabotage: swap-root') && process.env.VERDICT_LINK) {
  const here = process.cwd();
  process.chdir('..');
  fs.renameSync(here, `${here}.moved`);
  fs.symlinkSync(process.env.VERDICT_LINK, here);
}
if (text.includes('sabotage: restore')) {
  fs.rmSync(POLICY);
  fs.mkdirSync(POLICY);
}
