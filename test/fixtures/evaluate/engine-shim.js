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
 */

'use strict';

const fs = require('node:fs');

const [stage = ''] = process.argv.slice(2);
fs.appendFileSync(process.env.TEA_EVALUATE_SHIM_LOG, `${JSON.stringify(process.argv.slice(2))}\n`);
const code = process.env[`TEA_EVALUATE_SHIM_EXIT_${stage.toUpperCase()}`];
process.exitCode = code === undefined ? 0 : Number(code);
