/**
 * The schema-version constants `eval-quality` publishes, read once through
 * `require`, and the two helpers that hold a stamp to them.
 *
 * WHY THIS MODULE IS SEPARATE FROM `eval-quality-inputs.js`
 *
 * `docs/explanation/eval-quality-command-adapter.md` states this is the one
 * place in TEA's `eval-quality` integration that reads synchronously: every
 * other call site went through `test/lib/file-system-port.js` and became
 * asynchronous when TEA adopted the package's ports, and this cluster never
 * touches the port at all because it never touches `fs`. Nothing machine-held
 * that claim until now: a future edit that added an `await` here would have
 * broken the invariant with no check to catch it.
 *
 * `eval-quality.config.json`'s `dependency-direction` section can hold a
 * declared layer to a `purity` ban on `await`, an async function, and
 * `new Date`, and the ban applies at whole-layer granularity, which for an
 * exact-match layer is one whole file. `test/lib/eval-quality-inputs.js`
 * cannot be that file: it also builds four legitimately asynchronous
 * functions (schema compilation, artifact validation, the scoring-policy
 * reader) that do real file I/O and a dynamic ESM import, so a purity ban
 * declared against that file would fail on code that has every right to
 * await. This module holds only the cluster that is genuinely synchronous, so
 * `eval-quality.config.json` declares an exact-match `dependency-direction`
 * layer scoped to this one file, with `purity` named against it, and
 * `npm run test:direction` is what now enforces the invariant the prose above
 * only used to state.
 *
 * `test/lib/eval-quality-inputs.js` requires this module and re-exports
 * `SCHEMA_VERSIONS`, `expectedSchemaVersion` and `schemaVersionProblems`
 * under the same names, so every one of its existing consumers keeps working
 * unchanged.
 */

'use strict';

// The version constants come in through `require`. `require(esm)` is stable on
// every Node the engines field admits (>= 22.20.0), and the loader hands back the
// same module instance `loadEvalQuality`'s dynamic `import` returns, so the two
// readings cannot disagree. This is a synchronous read of the installed
// package, never of a file this module owns, so the file-system port plays no
// part in it.
//
// The require is wrapped rather than left to throw, because this module is
// reached, through `test/lib/eval-quality-inputs.js`, by callers that never
// touch a schema version at all, among them `test/test-contracts.js`, which
// resolves `eval-quality` itself and prints a named skip for a tree installed
// with `--omit=dev`. An unguarded require here reached `eval-quality` before
// that skip ever ran, turning a documented, exit-0 skip into an uncaught
// `MODULE_NOT_FOUND` crash; reproduced by removing `node_modules/eval-quality`
// and running `node test/test-contracts.js`. A missing or broken package is
// instead reported the moment a caller actually asks `expectedSchemaVersion`
// for a number, in `packageVersions` below.
let packageVersions;
try {
  packageVersions = require('eval-quality');
} catch {
  packageVersions = null;
}

/**
 * The `schemaVersion` of each artifact TEA writes or receives, keyed by the
 * basename of the schema `eval-quality` publishes for it, which is the key
 * `validateArtifact` takes. Every value is the constant the installed package
 * exports for that kind. Nothing here is stated.
 *
 * Six kinds eval-quality publishes a schema for and TEA writes, and each has a
 * reader. The three `eval-quality-inputs.js` builds stamp through
 * `expectedSchemaVersion`. `tools/generate-probes.js` and
 * `tools/generate-contracts.js` read the probe and contract versions the same
 * way, so the bytes they commit carry the package's number. The scoring
 * policy at `test/probes/scoring-policy.json` is hand-authored, so
 * `schemaVersionProblems` is what holds it.
 *
 * Three more kinds TEA only receives: `evidence-artifact`, `sealed-evaluator-brief`
 * and `preflight-verdict`, each already read by a `validateArtifact` call site in
 * `test/lib/probe-scoring.js`. `validateArtifact` runs `schemaVersionProblems`
 * beside its Ajv pass for every kind this table covers, so a wrong stamp on a
 * received artifact is named the same way a wrong stamp on a written one is; an
 * entry with no reader is a number nothing holds. TEA also stamps `suite-result`
 * and `run-summary`, against its own `test/schema/eval-result.schema.json`;
 * those are not eval-quality's to publish and carry no entry here.
 *
 * It was a literal table, and it drifted the way a copied number does: on the
 * upgrade to 3.0.0 its record entry read 3 against a parser that reads 6, and
 * nothing said so until a `schema-version-mismatch` fault surfaced inside a
 * scoring stage. `npm run test:schema-versions` now holds every stamp TEA
 * writes to this table, and this table to the package.
 *
 * A value is `undefined` when `packageVersions` is `null` (the package could
 * not be loaded) or when the installed package renamed the constant; either
 * way `expectedSchemaVersion` refuses to hand the value back uninspected.
 */
const SCHEMA_VERSIONS = Object.freeze({
  'sealed-run-record': packageVersions?.SEALED_RUN_RECORD_SCHEMA_VERSION,
  'isolation-manifest': packageVersions?.ISOLATION_MANIFEST_SCHEMA_VERSION,
  'evaluator-configuration': packageVersions?.EVALUATOR_CONFIGURATION_SCHEMA_VERSION,
  probe: packageVersions?.PROBE_SCHEMA_VERSION,
  'eval-contract': packageVersions?.EVAL_CONTRACT_SCHEMA_VERSION,
  'scoring-policy': packageVersions?.SCORING_POLICY_SCHEMA_VERSION,
  'evidence-artifact': packageVersions?.EVIDENCE_ARTIFACT_SCHEMA_VERSION,
  'sealed-evaluator-brief': packageVersions?.SEALED_EVALUATOR_BRIEF_SCHEMA_VERSION,
  'preflight-verdict': packageVersions?.PREFLIGHT_VERDICT_SCHEMA_VERSION,
});

/**
 * The published kinds that carry no `schemaVersion` by design, each with the
 * reason, so a caller asking for one is told why there is none.
 */
const UNSTAMPED_KINDS = Object.freeze({
  'artifact-reference':
    'it is a reference shape embedded inside other artifacts and never crosses the package boundary alone, so the package publishes it with no schemaVersion and no lineage',
});

/**
 * The `schemaVersion` the installed package reads for one kind TEA writes.
 *
 * Throws on a kind with no stamp by design and on a kind TEA does not write,
 * because both are caller bugs: the first would stamp a field the schema
 * rejects, and the second would read `undefined` and stamp that. Also throws
 * when the package could not be loaded or renamed the constant, rather than
 * handing back `undefined`: a caller stamping with `undefined` writes valid
 * JSON with the field missing, since `JSON.stringify` drops an `undefined`
 * value, which is a worse failure than this one and a silent one.
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
    if (packageVersions === null) throw new TypeError(`eval-quality could not be loaded, so no schemaVersion is available for ${kind}`);
    throw new TypeError(`eval-quality exports no positive integer schemaVersion constant for ${kind}; read ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * One artifact's stamp against the version the installed package reads for its
 * kind.
 *
 * The message mirrors the package's own `schema-version-mismatch` fault, which
 * reads `carries "schemaVersion" X where this build reads Y`, so a reader who has
 * seen one has seen both. A wrong stamp is reported, because it is a finding
 * about the artifact and the caller decides what a finding costs. A kind the
 * table does not cover still throws, because that is a bug in the caller.
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

module.exports = {
  SCHEMA_VERSIONS,
  expectedSchemaVersion,
  schemaVersionProblems,
};
