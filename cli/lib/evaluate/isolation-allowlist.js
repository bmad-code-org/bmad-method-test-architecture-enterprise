/**
 * The isolation manifest's mount allowlist, applied where `score` applies it
 * (eval-quality's ingest) so `preflight` and `run` refuse a setup `score`
 * would reject, before an adopter has paid for a full run.
 *
 * eval-quality reads a trial set's manifest as Invalid when an observed mount
 * has no entry in `allowedMounts`, one `mount outside allowlist: <path>` reason
 * per path, and `score` exits 3. `mountsOutsideAllowlist` is that rule: the
 * observed values with no entry in the allowed ones, in the observed order and
 * each once. A conformance check in the development suite holds it to the engine
 * by scoring the same manifests through both and comparing the verdict and the paths.
 *
 * The allowlist is never widened here: a registry entry's `systemPaths` and the
 * trial's grants are the only things a target may open, and the audit already
 * leaves those out of `observedMounts`.
 */

'use strict';

const { textNeutralizer } = require('./recorded-paths');

/** How many offending paths a refusal names before it counts the rest. */
const NAMED_PATHS = 3;

/**
 * Observed values with no entry in the allowed ones, in the observed order and each once.
 *
 * @param {Iterable<string>} observed
 * @param {Iterable<string>} allowed
 * @returns {string[]}
 */
function mountsOutsideAllowlist(observed, allowed) {
  const permitted = new Set(allowed);
  return [...new Set(observed)].filter((value) => !permitted.has(value));
}

/**
 * The refusal for mounts outside the allowlist, or `null` when there are none. It names the first paths in the form the
 * records use (`recorded-paths.js`), says `score` would exit 3 on them, and gives both setups that work for a target
 * that launches from outside its workspace.
 *
 * @param {object} options
 * @param {string[]} options.mounts the offending paths, as the audit reported them
 * @param {string} options.folder the evaluation folder, for the neutral form of each path
 * @param {string} options.opened who opened them: `the preflight legs` or `the trials`
 * @returns {string|null}
 */
function mountRefusal({ mounts, folder, opened }) {
  if (mounts.length === 0) return null;
  const neutral = textNeutralizer({ folder });
  const named = mounts.slice(0, NAMED_PATHS).map((mount) => `mount outside allowlist: ${neutral(mount)}`);
  const rest = mounts.length - named.length;
  return [
    `isolation manifest violation: ${opened} opened ${mounts.length} path(s) outside the allowlist, so \`score\` would exit 3 (${named.join('; ')}${rest > 0 ? `; and ${rest} more` : ''}).`,
    'If they are the files of a target that launches from outside its workspace, use one of two setups: make the registry `target` a path inside `launch.root` (for example `node_modules/.bin/tea-skill-runner` over a copy workspace, or a git workspace with `workspace.provision`), or keep the bare name and list the directories it runs from in `systemPaths`.',
  ].join(' ');
}

module.exports = { NAMED_PATHS, mountRefusal, mountsOutsideAllowlist };
