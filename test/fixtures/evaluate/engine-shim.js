#!/usr/bin/env node
/**
 * A stand-in for the eval-quality CLI, reached through `TEA_EVALUATE_ENGINE_CLI`
 * (Story 1.6, R1-02).
 *
 * It appends its argv as one JSON line to the file `TEA_EVALUATE_SHIM_LOG`
 * names, writes nothing else, and exits with the code
 * `TEA_EVALUATE_SHIM_EXIT_<STAGE>` names for its first argument (for example
 * `TEA_EVALUATE_SHIM_EXIT_PREFLIGHT=5`), or 0 when that variable is unset. A
 * `tea-evaluate` run whose exit equals the shim's preflight exit, with the
 * preflight argv in the log, took its verdict from the CLI: the library's own
 * `runPreflight` verdict over the same observations would pass.
 *
 * When `TEA_EVALUATE_SHIM_STREAMS` is set, it also prints three lines to each
 * stream, `<value> stdout <probe>`, `<value> stdout 2 <probe>` and
 * `<value> stdout 3 <probe>` (the last with no closing newline) to standard
 * output and the same with `stderr` to standard error, `<probe>` being the
 * file name `--probe` names (or `-`), so a test can tell each call's streams
 * apart and see a capture swapped, dropped or cut short.
 * `TEA_EVALUATE_SHIM_EXIT_<STAGE>_<PROBE>` (for example
 * `TEA_EVALUATE_SHIM_EXIT_SCORE_P_001=4`) sets the exit for the call whose
 * `--probe` names that probe, ahead of the stage's own.
 */

'use strict';

const fs = require('node:fs');

const [stage = ''] = process.argv.slice(2);
fs.appendFileSync(process.env.TEA_EVALUATE_SHIM_LOG, `${JSON.stringify(process.argv.slice(2))}\n`);
const argv = process.argv.slice(2);
const at = argv.indexOf('--probe');
const probe = at === -1 ? '-' : argv[at + 1].split(/[\\/]/).pop();
const streams = process.env.TEA_EVALUATE_SHIM_STREAMS;
if (streams) {
  process.stdout.write(`${streams} stdout ${probe}\n${streams} stdout 2 ${probe}\n${streams} stdout 3 ${probe}`);
  process.stderr.write(`${streams} stderr ${probe}\n${streams} stderr 2 ${probe}\n${streams} stderr 3 ${probe}`);
}
const probeKey = probe.replace(/\.probe\.json$/, '').replaceAll('-', '_').toUpperCase();
const code = process.env[`TEA_EVALUATE_SHIM_EXIT_${stage.toUpperCase()}_${probeKey}`] ?? process.env[`TEA_EVALUATE_SHIM_EXIT_${stage.toUpperCase()}`];
process.exitCode = code === undefined ? 0 : Number(code);
