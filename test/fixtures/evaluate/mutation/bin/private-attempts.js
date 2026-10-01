/**
 * What `verdict.js`'s `probe-private` act and its leftover process
 * (`verdict-private-leftover.js`) try on the run's private directories
 * (Story 1.58): the paths the sealed-brief agent stub announced
 * (`--announce`), each attempt answered as `allowed`, `listed <entries>` or
 * `refused <code>`; the token file's read answers `token` when it held the
 * bridge's admission token (48 hex characters) and never prints it.
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

/** How reading a file ended: `allowed`, `token` when it holds a 48-hex admission token, or refused with the error code. */
function readAttempt(file) {
  try {
    return /^[0-9a-f]{48}$/.test(fs.readFileSync(file, 'utf8').trim()) ? 'token' : 'allowed';
  } catch (error) {
    return `refused ${error.code ?? error.message}`;
  }
}

/** The attempts on one announcement's paths, as `private-<name>: <how>` lines. */
function privateAttempts(announced) {
  return [
    // The configuration names the token's file and carries no token; the token is in the file alone.
    `private-config-read: ${readAttempt(announced.config)}`,
    `private-token-read: ${readAttempt(announced.tokenFile)}`,
    `private-evaluator-list: ${listAttempt(announced.cwd)}`,
    `private-parent-list: ${listAttempt(path.dirname(announced.cwd))}`,
    `private-root-list: ${listAttempt(path.dirname(path.dirname(announced.cwd)))}`,
    `private-socket-connect: ${connectAttempt(announced.socket)}`,
  ];
}

module.exports = { privateAnnouncements, privateAttempts };
