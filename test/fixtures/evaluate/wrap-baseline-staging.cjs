/**
 * Preloaded with `node --require` to run `tea-evaluate compare --accept` with one
 * failure injected while the baseline is staged or swapped in, so an interrupted
 * accept is exercised without racing a process against the runtime (Story 2.1).
 *
 * The staging directory lives under `runs/.compare-staging/`, where a retired baseline waits
 * while the new one is swapped in.
 *
 * `TEA_BASELINE_FAIL=write` makes the write of every staged file after the first
 * `TEA_BASELINE_FAIL_AFTER` (default 3) throw a disk-full error. `TEA_BASELINE_FAIL=rename`
 * makes the rename of the finished staging directory into place throw, after the old
 * baseline was moved aside. `TEA_BASELINE_FAIL=strand` makes that rename fail and then the rename
 * that puts the old baseline back fail too, which leaves `baseline/` absent and the old one retired.
 * `TEA_BASELINE_FAIL=hold` sleeps `TEA_BASELINE_HOLD_MS` (default 1500) after the first staged file, while the lock is held.
 * `TEA_BASELINE_FAIL=kill` makes the process SIGKILL itself while staging, after
 * `TEA_BASELINE_FAIL_AFTER` files, so no cleanup runs. `TEA_BASELINE_FAIL=sigint` sends the process a SIGINT at the same point and lets staging continue until the handler runs. `TEA_BASELINE_FAIL=probe` runs a plain
 * `compare` (the arguments in `TEA_BASELINE_PROBE_ARGS`, a JSON array; its status and output
 * written to the JSON file `TEA_BASELINE_PROBE_OUT`) at the moment between the two renames, when
 * `baseline/` is absent and the old one is retired, then lets the swap finish.
 */

'use strict';

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const mode = process.env.TEA_BASELINE_FAIL;
const allowed = Number(process.env.TEA_BASELINE_FAIL_AFTER ?? '3');
const inStaging = (file) => String(file).includes('.compare-staging/staging-');
const inRetired = (file) => String(file).includes('.compare-staging/retired-');
const refusal = () => Object.assign(new Error('ENOSPC: no space left on device (injected by the test)'), { code: 'ENOSPC' });

if (mode === 'write' || mode === 'kill' || mode === 'sigint' || mode === 'hold') {
  const write = fs.writeFileSync;
  let written = 0;
  let signalled = false;
  fs.writeFileSync = function writeFileSync(file, ...rest) {
    if (inStaging(file)) {
      written += 1;
      // `hold` stalls the accept that holds the lock once, so concurrent accepts started now meet it.
      if (mode === 'hold') {
        if (written === 1) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(process.env.TEA_BASELINE_HOLD_MS ?? '1500'));
        return write.call(this, file, ...rest);
      }
      if (written > allowed) {
        if (mode === 'kill') process.kill(process.pid, 'SIGKILL');
        if (mode === 'sigint') {
          // Delivered to the process's own handler at the next yield to the event loop, which the staging loop makes per file.
          if (!signalled) process.kill(process.pid, 'SIGINT');
          signalled = true;
        } else throw refusal();
      }
    }
    return write.call(this, file, ...rest);
  };
}
if (mode === 'rename' || mode === 'strand') {
  const rename = fs.renameSync;
  fs.renameSync = function renameSync(from, to) {
    if (inStaging(from) || (mode === 'strand' && inRetired(from))) throw refusal();
    return rename.call(this, from, to);
  };
}
if (mode === 'probe') {
  const rename = fs.renameSync;
  fs.renameSync = function renameSync(from, to) {
    const result = rename.call(this, from, to);
    if (inRetired(to)) {
      const folder = process.argv[process.argv.indexOf('--evaluation') + 1];
      const probe = spawnSync(
        process.execPath,
        [process.argv[1], 'compare', '--evaluation', folder, ...JSON.parse(process.env.TEA_BASELINE_PROBE_ARGS)],
        { encoding: 'utf8' },
      );
      fs.writeFileSync(process.env.TEA_BASELINE_PROBE_OUT, JSON.stringify({ status: probe.status, output: `${probe.stdout}${probe.stderr}` }));
    }
    return result;
  };
}
