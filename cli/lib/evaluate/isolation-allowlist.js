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
 * The paths every leg opened outside the allowlist, in the order the first leg opened them: what is left of the legs' mounts
 * after the allowed ones and every path some leg did not open. A target that lives outside its workspace produces this set,
 * since its own files load on every launch.
 *
 * @param {Map<string, string[]>} legs the mounts each leg's audit listed, by leg
 * @param {string[]} allowed
 * @returns {string[]}
 */
function mountsOfEveryLeg(legs, allowed) {
  const lists = [...legs.values()].map((mounts) => mountsOutsideAllowlist(mounts, allowed));
  if (lists.length === 0) return [];
  return lists.reduce((common, list) => common.filter((mount) => list.includes(mount)));
}

/**
 * One note for each path only some legs opened outside the allowlist, naming the path and the legs that opened it.
 *
 * @param {Map<string, string[]>} legs
 * @param {string} folder the evaluation folder, for the neutral form of each path
 * @returns {string[]}
 */
function chanceMountNotes(legs, folder) {
  const neutral = textNeutralizer({ folder });
  const everyLeg = new Set(mountsOfEveryLeg(legs, []));
  const openedBy = new Map();
  for (const [leg, mounts] of legs) {
    for (const mount of new Set(mounts)) {
      if (everyLeg.has(mount)) continue;
      openedBy.set(mount, [...(openedBy.get(mount) ?? []), leg]);
    }
  }
  return [...openedBy].map(
    ([mount, opened]) =>
      `note: ${opened.length === 1 ? 'leg' : 'legs'} ${opened.map((leg) => JSON.stringify(leg)).join(', ')} opened ${neutral(mount)} outside the allowlist and the other legs did not; ` +
      'a trial that opens it makes `score` exit 3, so this is no refusal here',
  );
}

/**
 * The refusal for mounts outside the allowlist, or `null` when there are none. It names the first paths in the form the records
 * use (`recorded-paths.js`), says what `score` does with them, and gives both setups that work for a target that launches from
 * outside its workspace. `who` is `legs` for the paths every preflight leg opened, `trials` for those the sealed manifests list.
 *
 * @param {object} options
 * @param {string[]} options.mounts the offending paths, as the audit reported them
 * @param {string} options.folder the evaluation folder, for the neutral form of each path
 * @param {'legs'|'trials'} options.who
 * @returns {string|null}
 */
function mountRefusal({ mounts, folder, who }) {
  if (mounts.length === 0) return null;
  const neutral = textNeutralizer({ folder });
  const named = mounts.slice(0, NAMED_PATHS).map((mount) => `mount outside allowlist: ${neutral(mount)}`);
  const list = `${named.join('; ')}${mounts.length > named.length ? `; and ${mounts.length - named.length} more` : ''}`;
  const finding =
    who === 'legs'
      ? `isolation manifest violation: every preflight leg opened ${mounts.length} path(s) outside the allowlist (${list}), so every trial will too, and \`score\` refuses a trial that does (exit 3).`
      : `isolation manifest violation: the trials opened ${mounts.length} path(s) outside the allowlist, so \`score\` would exit 3 (${list}).`;
  return [
    finding,
    'If they are the files of a target that launches from outside its workspace, use one of two setups: make the registry `target` a path inside `launch.root` (for example `node_modules/.bin/tea-skill-runner` over a copy workspace, or a git workspace with `workspace.provision`), or keep the bare name and list the directories it runs from in `systemPaths`, with the bin directory that holds its link on `PATH`.',
  ].join(' ');
}

module.exports = { NAMED_PATHS, chanceMountNotes, mountRefusal, mountsOfEveryLeg, mountsOutsideAllowlist };
