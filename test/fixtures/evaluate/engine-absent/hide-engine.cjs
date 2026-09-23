/**
 * Preloaded with `node --require` to run tea-evaluate as if the optional
 * eval-quality peer were not installed: every CommonJS resolution of
 * `eval-quality` or a subpath fails as a missing module, and the ESM hooks
 * registered below fail every `import()` of it the same way.
 */

'use strict';

const Module = require('node:module');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function resolveWithoutEngine(request, ...rest) {
  if (request === 'eval-quality' || request.startsWith('eval-quality/')) {
    const error = new Error(`Cannot find module '${request}'`);
    error.code = 'MODULE_NOT_FOUND';
    throw error;
  }
  return originalResolve.call(this, request, ...rest);
};

Module.register(pathToFileURL(path.join(__dirname, 'hide-engine-hooks.mjs')));
