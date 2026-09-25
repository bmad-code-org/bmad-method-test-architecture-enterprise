/**
 * What every qualification route shares (AD-8, AD-9): the verdict an arm's
 * oracles give together, a reference to evidence the run wrote, and the gate
 * a qualified probe passes before it reaches the eval-quality CLI.
 *
 * The controlled-mutation cycle (`preflight.js`), the historical route
 * (`historical.js`), the gameability route (`gameability.js`) and the clean
 * controls (`run.js`) each build their probe from these, so no route admits a
 * probe the others would refuse.
 */

'use strict';

const path = require('node:path');

/** `relative` in POSIX form. */
function posix(relative) {
  return relative.split(path.sep).join('/');
}

/** What an arm's oracles say together: `held` when every one holds, `violated` when one fails, otherwise `inconclusive`. */
function armVerdict(oracles) {
  if (oracles.every((oracle) => oracle.disposition === 'held')) return 'held';
  return oracles.some((oracle) => oracle.disposition === 'violated') ? 'violated' : 'inconclusive';
}

/**
 * An artifact reference to a file the run wrote, by its path relative to the
 * evaluation folder, digesting the bytes the runtime wrote (`RunDirectory.read`
 * refuses any others).
 */
function referenceTo(folder, writer, file, digestBytes) {
  return {
    storage: 'public',
    path: posix(path.relative(folder, writer.pathOf(file))),
    privateRef: null,
    digest: digestBytes(writer.read(file)),
  };
}

/**
 * Why a qualified probe may not reach the CLI, or null when it may: it must
 * meet eval-quality's published probe schema and pass eval-quality's own
 * qualification gate (`qualifyProbe`, against the operation its signature
 * names), so the runtime hands the CLI admitted probes only.
 *
 * @param {object} options
 * @param {object} options.candidate the qualified probe
 * @param {object} options.contract
 * @param {object} options.engine the loaded eval-quality library
 * @param {(kind: string, value: unknown) => Promise<string[]>} options.validate
 * @returns {Promise<string|null>}
 */
async function admissionRefusal({ candidate, contract, engine, validate }) {
  const problems = await validate('probe', candidate);
  if (problems.length > 0) return `the qualified probe does not meet eval-quality's probe schema: ${problems.join('; ')}`;
  // A clean control carries no signature, and a canary's is null: neither has a home operation.
  const home =
    candidate.expectedClean || candidate.defectSignature === null
      ? null
      : engine.resolveHomeOperation(candidate.defectSignature, contract.permittedInterfaces);
  const admission = engine.qualifyProbe(candidate, home);
  if (admission.qualified) return null;
  return `eval-quality's qualification gate refuses the qualified probe: ${admission.failures.map((failure) => `${failure.code} (${failure.detail})`).join('; ')}`;
}

module.exports = { admissionRefusal, armVerdict, referenceTo };
