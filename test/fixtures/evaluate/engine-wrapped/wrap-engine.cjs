/**
 * Preloaded with `node --require` to run tea-evaluate over an eval-quality
 * whose `runPreflight` fails on purpose, so the planning-refusal fallthrough in
 * `cli/lib/evaluate/preflight.js` is exercised both ways (Story 1.6, T2).
 *
 * The ESM hooks registered below resolve every `import('eval-quality')` outside
 * `wrapped-engine.mjs` to that module, which re-exports the real engine with
 * `runPreflight` replaced. `TEA_EVALUATE_WRAP_RUNPREFLIGHT` picks the failure:
 *
 *   structural-before-legs  throw a StructuralFailure before any leg reaches the port
 *   error-after-one-leg     let one leg run, then throw a plain Error
 */

'use strict';

const Module = require('node:module');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

Module.register(pathToFileURL(path.join(__dirname, 'wrap-engine-hooks.mjs')));
