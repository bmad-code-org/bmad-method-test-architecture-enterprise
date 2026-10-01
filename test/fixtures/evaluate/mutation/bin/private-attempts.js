/**
 * What `verdict.js`'s `probe-private` act and its leftover process
 * (`verdict-private-leftover.js`) try on the run's private directories
 * (Story 1.58): the paths the sealed-brief agent stub announced
 * (`--announce`), each attempt answered as `allowed` or `refused <code>`; the
 * configuration read answers `token` when the file held the bridge's admission
 * token (a 48-character hex value) and never prints it.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

/** How listing a directory ended: `listed <entries>`, or refused with the error code. */
function listAttempt(directory) {
  try {
    return `listed ${fs.readdirSync(directory).length}`;
  } catch (error) {
    return `refused ${error.code ?? error.message}`;
  }
}

/** The announcements in `file`, one per sealed-brief agent run, oldest first. */
function privateAnnouncements(file) {
  try {
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

/** Connects to a unix socket in a process of its own (so the attempt is another process of the target's) and says how it ended. */
function connectAttempt(socket) {
  const script =
    "const c=require('net').connect(process.argv[1]);c.on('connect',()=>{console.log('allowed');c.destroy()});c.on('error',(e)=>console.log('refused '+(e.code||e.message)))";
  const result = spawnSync(process.execPath, ['-e', script, socket], { encoding: 'utf8', timeout: 20_000 });
  return result.stdout.trim() || `refused ${result.error?.code ?? 'no answer'}`;
}

/** The attempts on one announcement's paths, as `private-<name>: <how>` lines. */
function privateAttempts(announced) {
  let token;
  try {
    token = /"TEA_EVALUATE_BRIDGE_TOKEN":"[0-9a-f]{48}"/.test(fs.readFileSync(announced.config, 'utf8')) ? 'token' : 'allowed (no token)';
  } catch (error) {
    token = `refused ${error.code ?? error.message}`;
  }
  return [
    `private-config-read: ${token}`,
    `private-evaluator-list: ${listAttempt(announced.cwd)}`,
    `private-parent-list: ${listAttempt(path.dirname(announced.cwd))}`,
    `private-socket-connect: ${connectAttempt(announced.socket)}`,
  ];
}

/**
 * How many `tea-evaluate-run-*` directories the directory holding the announced run's private parent lists, and how many
 * entries the target can see in them: a target that names nothing of the run can still scan for the parent.
 */
function scanForPrivateParent(announced) {
  const base = path.dirname(path.dirname(announced.cwd));
  let names = [];
  try {
    names = fs.readdirSync(base).filter((name) => name.startsWith('tea-evaluate-run-'));
  } catch {
    // An unreadable directory names nothing.
  }
  const visible = names.reduce((total, name) => {
    try {
      return total + fs.readdirSync(path.join(base, name)).length;
    } catch {
      return total;
    }
  }, 0);
  return `${names.length} found, ${visible} visible`;
}

module.exports = { privateAnnouncements, privateAttempts, scanForPrivateParent };
