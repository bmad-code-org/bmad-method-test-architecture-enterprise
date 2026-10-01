/**
 * Preloaded with `node --require` to run `tea-evaluate score` with one act
 * performed right after the writer creates a file, so the copy of the evidence
 * artifact is exercised between its write and its read-back without racing a
 * process against the runtime (Story 1.41).
 *
 * When `RunDirectory.write` has written a file whose path ends with
 * `TEA_SCORE_SWAP_AFTER`, the file's directory is moved aside and a symbolic
 * link to the directory `TEA_SCORE_SWAP_TARGET` names takes its place, once, as
 * a process a target left running could. The write itself still succeeds.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { RunDirectory } = require(path.join(__dirname, '..', '..', '..', 'cli', 'lib', 'evaluate', 'run-directory.js'));

const after = process.env.TEA_SCORE_SWAP_AFTER;
const target = process.env.TEA_SCORE_SWAP_TARGET;
const write = RunDirectory.prototype.write;
let swapped = false;
RunDirectory.prototype.write = function writeThenSwap(file, bytes) {
  const written = write.call(this, file, bytes);
  if (!swapped && after && String(file).endsWith(after)) {
    swapped = true;
    const directory = path.dirname(written);
    fs.renameSync(directory, `${directory}.moved`);
    fs.symlinkSync(target, directory, 'dir');
  }
  return written;
};
