/**
 * Preloaded with `node --require` to run `tea-evaluate compare --accept` with one
 * failure injected while the baseline is staged or swapped in, so an interrupted
 * accept is exercised without racing a process against the runtime (Story 2.1).
 *
 * `TEA_BASELINE_FAIL=write` makes the write of every staged file after the first
 * `TEA_BASELINE_FAIL_AFTER` (default 3) throw a disk-full error. `TEA_BASELINE_FAIL=rename`
 * makes the rename of the finished staging directory into place throw, after the old
 * baseline was moved aside.
 */

'use strict';

const fs = require('node:fs');

const mode = process.env.TEA_BASELINE_FAIL;
const allowed = Number(process.env.TEA_BASELINE_FAIL_AFTER ?? '3');
const inStaging = (file) => String(file).includes('.baseline-staging-');
const refusal = () => Object.assign(new Error('ENOSPC: no space left on device (injected by the test)'), { code: 'ENOSPC' });

if (mode === 'write') {
  const write = fs.writeFileSync;
  let written = 0;
  fs.writeFileSync = function writeFileSync(file, ...rest) {
    if (inStaging(file)) {
      written += 1;
      if (written > allowed) throw refusal();
    }
    return write.call(this, file, ...rest);
  };
}
if (mode === 'rename') {
  const rename = fs.renameSync;
  fs.renameSync = function renameSync(from, to) {
    if (inStaging(from)) throw refusal();
    return rename.call(this, from, to);
  };
}
