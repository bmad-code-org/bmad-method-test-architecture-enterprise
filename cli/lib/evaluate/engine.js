/**
 * The one door from `tea-evaluate` to eval-quality.
 *
 * eval-quality is ESM only and this runtime is CommonJS, so the library is
 * reached through one cached dynamic `import()`. This file is the only file
 * under `cli/` allowed to name the package in an `import(` or `require(`;
 * `npm run test:evaluate-boundaries` fails on a second one, and on any binding
 * obtained from here that reaches `runScore`, `preflightFromObservations`,
 * `compile` or `seal`. Those stages decide enforced verdicts, and every
 * enforced verdict comes from the eval-quality CLI over persisted files
 * (AD-1, AD-6), whose path `engineCliPath` resolves.
 *
 * eval-quality is an optional peer dependency of TeA: a project that never
 * runs Evaluate does not receive it, so a missing engine is reported as an
 * installation problem rather than a crash.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ENGINE_PACKAGE = 'eval-quality';
const ENGINE_CLI_ENV = 'TEA_EVALUATE_ENGINE_CLI';

/** Raised when the optional peer is not installed where this runtime can reach it. */
class EngineUnavailableError extends Error {
  constructor(cause) {
    super(
      `${ENGINE_PACKAGE} is not installed where tea-evaluate can reach it. ` +
        `It is an optional peer dependency of TeA; install ${ENGINE_PACKAGE}@">=4.0.0" in the project that runs Evaluate. ` +
        `(${cause?.message ?? 'no further detail'})`,
      { cause },
    );
    this.name = 'EngineUnavailableError';
  }
}

let pending;

/**
 * The engine's library, imported once per process.
 *
 * The promise is memoized, so concurrent first calls share one import. A failed
 * import is not memoized: the next call tries again.
 *
 * @returns {Promise<Record<string, unknown>>}
 */
function loadEngine() {
  if (pending === undefined) {
    pending = import('eval-quality').catch((error) => {
      pending = undefined;
      throw new EngineUnavailableError(error);
    });
  }
  return pending;
}

/** The directory of the installed engine package, read through its exported `./package.json`. */
function enginePackageRoot() {
  try {
    return path.dirname(require.resolve(`${ENGINE_PACKAGE}/package.json`));
  } catch (error) {
    throw new EngineUnavailableError(error);
  }
}

/**
 * The path of the engine's command-line entry point.
 *
 * `TEA_EVALUATE_ENGINE_CLI` substitutes another executable (a test shim); an
 * empty value counts as unset. Otherwise it is the `eval-quality` bin the
 * installed package declares beside its `package.json`.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
function engineCliPath(env = process.env) {
  const override = env[ENGINE_CLI_ENV];
  if (typeof override === 'string' && override.length > 0) return path.resolve(override);
  const root = enginePackageRoot();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[ENGINE_PACKAGE];
  if (typeof bin !== 'string') {
    throw new EngineUnavailableError(new Error(`the installed ${ENGINE_PACKAGE} declares no "${ENGINE_PACKAGE}" bin`));
  }
  return path.join(root, bin);
}

/**
 * The path of a schema the engine publishes under `schemas/`.
 *
 * @param {string} name for example `eval-contract.schema.json`
 * @returns {string}
 */
function engineSchemaPath(name) {
  if (name !== path.basename(name)) throw new Error(`engine schema name must be a bare file name; got ${JSON.stringify(name)}`);
  return path.join(enginePackageRoot(), 'schemas', name);
}

module.exports = {
  ENGINE_CLI_ENV,
  ENGINE_PACKAGE,
  EngineUnavailableError,
  engineCliPath,
  engineSchemaPath,
  loadEngine,
};
