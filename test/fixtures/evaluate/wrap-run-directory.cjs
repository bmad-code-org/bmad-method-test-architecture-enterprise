/**
 * Preloaded with `node --require` to run `tea-evaluate run` with one act
 * performed at one named verification of its run directory, so the paths a
 * run takes around its last writes are exercised without racing a process
 * against the runtime (Story 1.8, final review rounds 1 and 2).
 *
 * `TEA_EVALUATE_VERIFY_AT` names the point: the act happens when
 * `RunDirectory.verify`'s `when` argument contains that text, and every other
 * verification runs as usual. `TEA_EVALUATE_VERIFY_DO` names the act:
 *
 *   fail       throw a `RunDirectoryError`, as a planted entry would
 *   touch      append a line to the file `TEA_EVALUATE_VERIFY_FILE` names (a
 *              tracked file of the adopter's project), then verify as usual
 *   move-root  move the run directory to the path `TEA_EVALUATE_VERIFY_FILE`
 *              names and leave a symbolic link to it in its place, as a
 *              process a target left running could, then verify as usual
 *   index-directory
 *              replace `trial-sets.json` with a directory of the same name,
 *              as a process a target left running could, so the retraction
 *              the failed verification starts meets a directory; then
 *              verify as usual
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { RunDirectory, RunDirectoryError } = require(path.join(__dirname, '..', '..', '..', 'cli', 'lib', 'evaluate', 'run-directory.js'));

const at = process.env.TEA_EVALUATE_VERIFY_AT;
const act = process.env.TEA_EVALUATE_VERIFY_DO;
const target = process.env.TEA_EVALUATE_VERIFY_FILE;
const verify = RunDirectory.prototype.verify;
RunDirectory.prototype.verify = function verifyAfterAct(when) {
  if (at && String(when).includes(at)) {
    if (act === 'fail') throw new RunDirectoryError(`the run directory is not what the runtime wrote ${when}: an entry planted for the test`);
    if (act === 'touch') fs.appendFileSync(target, 'written into the project while the run sealed its trial sets\n');
    if (act === 'move-root') {
      fs.renameSync(this.root, target);
      fs.symlinkSync(target, this.root);
    }
    if (act === 'index-directory') {
      fs.rmSync(path.join(this.root, 'trial-sets.json'));
      fs.mkdirSync(path.join(this.root, 'trial-sets.json'));
    }
  }
  return verify.call(this, when);
};
