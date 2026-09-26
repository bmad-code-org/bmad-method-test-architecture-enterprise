/**
 * The one door from `tea-evaluate` to eval-quality.
 *
 * eval-quality is ESM only and this runtime is CommonJS, so the library is
 * reached through one cached dynamic `import()`. This file is the only file
 * under `cli/` allowed to load the package; `npm run test:evaluate-boundaries`
 * fails on a second load, on `runScore`, `preflightFromObservations` or `seal`
 * named anywhere under `cli/`, and on any `compile` whose receiver is not an
 * Ajv instance. Those stages decide enforced verdicts, and every enforced
 * verdict comes from the eval-quality CLI over persisted files (AD-1, AD-6),
 * whose path `engineCliPath` resolves.
 *
 * eval-quality is an optional peer dependency of TeA: a project that never
 * runs Evaluate does not receive it, so a missing engine is reported as an
 * installation problem (exit 12).
 *
 * This file also holds the runtime's one synchronous reading of the engine:
 * the schema-version constants a record builder stamps, the engine's
 * `VERSION`, and its `parseAddress`, which keys an IP literal the way the
 * engine's policy reads it. Record builders and `check` call these from
 * synchronous code, so they cannot wait for the dynamic import. `eval-quality.config.json` declares this file as
 * its own `dependency-direction` layer with a `purity` block, so an `await`, an
 * async function or `new Date` here fails `npm run test:direction`; the loaders
 * below return their promise without awaiting it.
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
        `It is an optional peer dependency of TeA; install ${ENGINE_PACKAGE}@">=4.3.0" in the project that runs Evaluate. ` +
        `(${cause?.message ?? 'no further detail'})`,
      { cause },
    );
    this.name = 'EngineUnavailableError';
  }
}

// The version constants come in through a synchronous `require`, read on
// first use. `require(esm)` is stable on every Node the engines field admits
// (>= 22.20.0), and it hands back the same module instance the dynamic
// `import()` below resolves, so the two readings cannot disagree. Reading on
// first use keeps loading this file free: a subcommand that never stamps a
// record never evaluates the engine synchronously.
//
// The require is guarded, because the engine is an optional peer: a caller
// that never asks for a schema version (a TeA check that prints a named skip
// when the engine is absent) must not crash. A missing or broken engine is
// reported, with its cause, the moment a caller asks `expectedSchemaVersion`
// or `engineVersion` for a value.
let packageVersions;
let packageVersionsError;

/** The engine's root barrel, required once; `null` when it cannot be loaded. */
function engineConstants() {
  if (packageVersions === undefined) {
    try {
      packageVersions = require('eval-quality');
    } catch (error) {
      packageVersions = null;
      packageVersionsError = error;
    }
  }
  return packageVersions;
}

let pending;
let pendingAdapters;
let pendingConformance;

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

/**
 * The engine's `eval-quality/adapters` subpath (the command-line, MCP, corpus,
 * file-system and clock adapters), imported once per process on the same terms
 * as `loadEngine`.
 *
 * @returns {Promise<Record<string, unknown>>}
 */
function loadAdapters() {
  if (pendingAdapters === undefined) {
    pendingAdapters = import('eval-quality/adapters').catch((error) => {
      pendingAdapters = undefined;
      throw new EngineUnavailableError(error);
    });
  }
  return pendingAdapters;
}

/**
 * The engine's `eval-quality/conformance` subpath, imported once per process on
 * the same terms as `loadEngine`: the runtime reads an HTTP port's answer
 * through its `probeParsers.response`, eval-quality's own `ProbeObservation`
 * parser, so no copy of that schema lives in TeA.
 *
 * @returns {Promise<Record<string, unknown>>}
 */
function loadConformance() {
  if (pendingConformance === undefined) {
    pendingConformance = import('eval-quality/conformance').catch((error) => {
      pendingConformance = undefined;
      throw new EngineUnavailableError(error);
    });
  }
  return pendingConformance;
}

/**
 * The installed engine's own version string.
 *
 * @returns {string}
 */
function engineVersion() {
  const constants = engineConstants();
  if (constants === null) throw new EngineUnavailableError(packageVersionsError);
  if (typeof constants.VERSION !== 'string') {
    throw new EngineUnavailableError(new Error(`the installed ${ENGINE_PACKAGE} exports no VERSION string`));
  }
  return constants.VERSION;
}

/**
 * eval-quality's canonical spelling of an IP address literal, read through
 * its own `parseAddress`, so every spelling its policy reads as one address
 * (`::ffff:7f00:1` and `127.0.0.1`) gives one string; null when `host` is no
 * address the engine parses, such as a name.
 *
 * @param {string} host an address, unbracketed
 * @returns {string | null}
 */
function canonicalAddress(host) {
  const constants = engineConstants();
  if (constants === null) throw new EngineUnavailableError(packageVersionsError);
  if (typeof constants.parseAddress !== 'function') {
    throw new EngineUnavailableError(new Error(`the installed ${ENGINE_PACKAGE} exports no parseAddress`));
  }
  const parsed = constants.parseAddress(host);
  return parsed?.ok === true ? parsed.canonical : null;
}

/**
 * The `schemaVersion` of each artifact kind TeA writes or receives, keyed by the
 * basename of the schema the engine publishes for it. Every value is the
 * constant the installed engine exports for that kind; nothing here is stated,
 * because a literal table drifts the way a copied number does.
 *
 * A value is `undefined` when the engine could not be loaded or renamed the
 * constant; `expectedSchemaVersion` refuses to hand either back.
 */
const SCHEMA_VERSION_CONSTANTS = {
  'sealed-run-record': 'SEALED_RUN_RECORD_SCHEMA_VERSION',
  'isolation-manifest': 'ISOLATION_MANIFEST_SCHEMA_VERSION',
  'evaluator-configuration': 'EVALUATOR_CONFIGURATION_SCHEMA_VERSION',
  probe: 'PROBE_SCHEMA_VERSION',
  'eval-contract': 'EVAL_CONTRACT_SCHEMA_VERSION',
  'scoring-policy': 'SCORING_POLICY_SCHEMA_VERSION',
  'evidence-artifact': 'EVIDENCE_ARTIFACT_SCHEMA_VERSION',
  'sealed-evaluator-brief': 'SEALED_EVALUATOR_BRIEF_SCHEMA_VERSION',
  'preflight-verdict': 'PREFLIGHT_VERDICT_SCHEMA_VERSION',
};
const SCHEMA_VERSIONS = Object.freeze(
  Object.defineProperties(
    {},
    Object.fromEntries(
      Object.entries(SCHEMA_VERSION_CONSTANTS).map(([kind, constant]) => [
        kind,
        { enumerable: true, get: () => engineConstants()?.[constant] },
      ]),
    ),
  ),
);

/** The published kinds that carry no `schemaVersion` by design, each with the reason. */
const UNSTAMPED_KINDS = Object.freeze({
  'artifact-reference':
    'it is a reference shape embedded inside other artifacts and never crosses the package boundary alone, so the package publishes it with no schemaVersion and no lineage',
});

/**
 * The `schemaVersion` the installed engine reads for one kind.
 *
 * Throws on a kind with no stamp by design, on a kind the table does not cover,
 * and when the engine could not be loaded or renamed the constant: a caller
 * stamping `undefined` writes valid JSON with the field missing, since
 * `JSON.stringify` drops it, which is a silent failure and a worse one.
 *
 * @param {string} kind The published schema basename, for example `probe`.
 * @returns {number}
 */
function expectedSchemaVersion(kind) {
  if (Object.hasOwn(UNSTAMPED_KINDS, kind)) throw new TypeError(`${kind} carries no schemaVersion by design: ${UNSTAMPED_KINDS[kind]}`);
  if (!Object.hasOwn(SCHEMA_VERSIONS, kind)) {
    throw new TypeError(`no schemaVersion is recorded for ${kind}; TEA writes or receives ${Object.keys(SCHEMA_VERSIONS).join(', ')}`);
  }
  const value = SCHEMA_VERSIONS[kind];
  if (!Number.isInteger(value) || value <= 0) {
    if (engineConstants() === null) throw new EngineUnavailableError(packageVersionsError);
    throw new TypeError(`eval-quality exports no positive integer schemaVersion constant for ${kind}; read ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * One artifact's stamp against the version the installed engine reads for its
 * kind. The message mirrors the engine's own `schema-version-mismatch` fault.
 * A kind the table does not cover throws, because that is a caller bug.
 *
 * @param {string} kind The published schema basename.
 * @param {unknown} value
 * @returns {string[]} Empty when the stamp agrees.
 */
function schemaVersionProblems(kind, value) {
  const expected = expectedSchemaVersion(kind);
  const found = value !== null && typeof value === 'object' ? value.schemaVersion : undefined;
  if (found === expected) return [];
  if (found === undefined) return [`${kind} carries no "schemaVersion" where this build reads ${expected}`];
  return [`${kind} carries "schemaVersion" ${JSON.stringify(found)} where this build reads ${expected}`];
}

/** The directory of the installed engine package, read through its exported `./package.json`. */
function enginePackageRoot() {
  try {
    return path.dirname(require.resolve('eval-quality/package.json'));
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
  SCHEMA_VERSIONS,
  UNSTAMPED_KINDS,
  canonicalAddress,
  engineCliPath,
  engineSchemaPath,
  engineVersion,
  expectedSchemaVersion,
  loadAdapters,
  loadConformance,
  loadEngine,
  schemaVersionProblems,
};
