/**
 * `cli/lib/evaluate/isolation-allowlist.js` against eval-quality's own ingest.
 *
 * `preflight` and `run` refuse a mount outside the allowlist before `score` would, with a copy of the rule eval-quality applies to a
 * trial set's isolation manifest. A copy can drift, so every case here feeds one manifest to both: TeA's `mountsOutsideAllowlist` and
 * `mountRefusal`, and the engine's `runScore` (the entry `score` calls, here in process over a committed baseline's records, probe,
 * contract and policy with only the manifest's mounts replaced). The engine's verdict is its exit (3 for an isolation violation, 0
 * for the baseline's PASS) and its `mount outside allowlist: <path>` reasons, in order and each once; the helper must give the same
 * verdict and the same paths, and its refusal must exist exactly when the engine refuses.
 *
 * The cases hold the boundaries of the rule: a mount the workspace, `launch.root`, a `systemPaths` entry or a private directory
 * granted and one it did not, a path and its prefix (`/a/bc` against `/a/b`), a trailing slash, a symbolic link and the path it leads
 * to (made on disk), case, repeated and empty lists, and every pair of a pool of spellings of one path.
 *
 * Usage: node test/test-evaluate-isolation-conformance.js
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadEngine } = require('../cli/lib/evaluate/engine');
const { mountRefusal, mountsOutsideAllowlist } = require('../cli/lib/evaluate/isolation-allowlist');

const BASELINE = path.join(__dirname, 'fixtures', 'evaluate-authoring', 'ai-feature', 'evaluation', 'baseline');
const REASON = /^isolation manifest violation: mount outside allowlist: (.*)$/;

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };
const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

const read = (relative) => JSON.parse(fs.readFileSync(path.join(BASELINE, relative), 'utf8'));

/** The cases: a name, the manifest's observed mounts and the mounts it allows. */
function cases(scratch) {
  const list = [];
  const add = (name, observed, allowed) => list.push({ name, observed, allowed });

  // Nothing observed, whatever is allowed.
  add('nothing observed, nothing allowed', [], []);
  add('nothing observed, a workspace allowed', [], ['copy trial-clean-1']);

  // The grants a run records, and a path under each that no grant lists.
  const grants = ['copy trial-clean-1', 'copy trial-clean-2', 'read-only trial-clean-1/vendor', 'read-only login <credentials-file>'];
  add('a workspace grant observed as the label it is allowed by', ['copy trial-clean-1'], grants);
  add('a path inside the workspace is not its label', ['/work/ws/file.txt'], grants);
  add('launch.root observed, only its workspace label allowed', ['/proj'], grants);
  add('launch.root allowed as a path and observed', ['/proj'], ['/proj']);
  add('a file under launch.root, only the root allowed', ['/proj/src/a.js'], ['/proj']);
  add('a systemPaths entry observed as given', ['/opt/tool'], ['/opt/tool']);
  add('a file under a systemPaths entry, only the entry allowed', ['/opt/tool/bin/x'], ['/opt/tool']);
  add('a private directory observed, nothing allowed', ['<private-root>/run-1/home'], grants);
  add('a private directory allowed and observed', ['<private-root>/run-1/home'], ['<private-root>/run-1/home']);
  add('the evaluation folder observed', ['<evaluation-folder>/contract.json'], grants);
  add('the home neutral form observed and allowed', ['<home>/.claude/settings.json'], ['<home>/.claude/settings.json']);
  add('the home neutral form observed, another file allowed', ['<home>/.claude/settings.json'], ['<home>/.claude/.credentials.json']);

  // A path and its prefix, in both directions.
  add('/a/bc against /a/b', ['/a/bc'], ['/a/b']);
  add('/a/b against /a/bc', ['/a/b'], ['/a/bc']);
  add('/a/b/c against /a/b', ['/a/b/c'], ['/a/b']);
  add('/a/b against /a/b/c', ['/a/b'], ['/a/b/c']);
  add('/a/b against /a', ['/a/b'], ['/a']);
  add('/a against /a/b', ['/a'], ['/a/b']);

  // Spellings of one path.
  add('a trailing slash observed', ['/a/b/'], ['/a/b']);
  add('a trailing slash allowed', ['/a/b'], ['/a/b/']);
  add('a doubled slash', ['/a//b'], ['/a/b']);
  add('a dot segment', ['/a/./b'], ['/a/b']);
  add('a parent segment', ['/a/c/../b'], ['/a/b']);
  add('a different case', ['/A/B'], ['/a/b']);
  add('a leading space', [' /a/b'], ['/a/b']);
  add('a relative spelling', ['a/b'], ['/a/b']);
  add('a non-ASCII path, composed and decomposed', ['/café'], ['/café']);
  add('a non-ASCII path, the same bytes', ['/café'], ['/café']);

  // Lists: several mounts, a repeat, an order, an empty allowlist.
  add('three observed, one allowed', ['/z', '/a/b', '/m'], ['/a/b']);
  add('one observed twice, outside', ['/x', '/x'], ['/y']);
  add('one observed twice, inside', ['/x', '/x'], ['/x']);
  add('outside paths keep the observed order', ['/z', '/b', '/m', '/a'], []);
  add('an outside path between two inside ones', ['/a', '/x', '/b'], ['/a', '/b']);
  add('an allowed path listed twice', ['/a'], ['/a', '/a']);
  add('an empty allowlist', ['/a'], []);

  // A symbolic link on disk and the path it leads to: two spellings, so two verdicts.
  const target = path.join(scratch, 'real');
  const link = path.join(scratch, 'link');
  fs.mkdirSync(target);
  fs.symlinkSync(target, link, 'dir');
  fs.writeFileSync(path.join(target, 'file.txt'), 'x\n');
  add('a link observed, its target allowed', [link], [target]);
  add('a target observed, its link allowed', [target], [link]);
  add('a file through a link, the target directory allowed', [path.join(link, 'file.txt')], [target]);
  add('a file through a link, the link allowed', [path.join(link, 'file.txt')], [link]);
  add('a link and its real path both allowed', [link, target], [link, target]);
  add('the real path of a link observed, the real path allowed', [fs.realpathSync(link)], [fs.realpathSync(target)]);

  // Every pair from a pool of spellings of one path, one observed against one allowed.
  const pool = ['/a/b', '/a/b/', '/a/bc', '/a/b/c', '/A/B', '/a//b', '/a', '/', 'a/b', '<home>/a/b'];
  for (const observed of pool)
    for (const allowed of pool) add(`pool: ${JSON.stringify(observed)} against ${JSON.stringify(allowed)}`, [observed], [allowed]);
  return list;
}

async function main() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-isolation-conformance-'));
  try {
    const engine = await loadEngine();
    const records = [1, 2, 3].map((trial) => read(`trial-sets/P-001/record-${trial}.json`));
    const manifest = read('trial-sets/P-001/isolation-manifest.json');
    const options = {
      record: records,
      configuration: read('evaluator-configuration.json'),
      contract: read('eval-contract.json'),
      probe: read('probes/P-001.probe.json'),
      preflightVerdict: read('preflight-verdict.json'),
      policy: engine.scanJson(fs.readFileSync(path.join(BASELINE, 'scoring-policy.json'), 'utf8'), 'ScoringPolicy'),
      privateManifest: null,
      corpusDigest: read('trial-sets.json').corpusDigest,
      port: undefined,
    };
    const scored = async (observedMounts, allowedMounts) => {
      const { ladder } = await engine.runScore({
        ...options,
        manifest: { ...manifest, observedMounts, allowedMounts },
        signal: new AbortController().signal,
      });
      const paths = [];
      for (const reason of ladder.basis) {
        const found = REASON.exec(reason);
        if (found !== null && !paths.includes(found[1])) paths.push(found[1]);
      }
      return { exitCode: ladder.exitCode, paths };
    };

    // The control: the baseline's own manifest scores PASS, so an exit 3 below is the mounts alone.
    const control = await scored(manifest.observedMounts, manifest.allowedMounts);
    check(
      control.exitCode === 0 && control.paths.length === 0,
      `the baseline's own manifest scored exit ${control.exitCode} naming ${JSON.stringify(control.paths)}`,
    );

    const all = cases(scratch);
    let refused = 0;
    for (const { name, observed, allowed } of all) {
      let engineSays;
      try {
        engineSays = await scored(observed, allowed);
      } catch (error) {
        check(false, `${name}: eval-quality refused the manifest (${error.message}), so the case proves nothing`);
        continue;
      }
      const ours = mountsOutsideAllowlist(observed, allowed);
      const refusal = mountRefusal({ mounts: ours, folder: scratch, opened: 'the trials' });
      if (engineSays.paths.length > 0) refused += 1;
      check(
        JSON.stringify(ours) === JSON.stringify(engineSays.paths),
        `${name}: eval-quality names ${JSON.stringify(engineSays.paths)} outside the allowlist; the helper names ${JSON.stringify(ours)}`,
      );
      check(
        (engineSays.exitCode === 3) === ours.length > 0 && (refusal !== null) === (engineSays.exitCode === 3),
        `${name}: eval-quality's score exits ${engineSays.exitCode}; the helper ${ours.length > 0 ? 'refuses' : 'passes'} and the refusal is ${refusal === null ? 'absent' : 'present'}`,
      );
      check(
        engineSays.exitCode === 0 || engineSays.exitCode === 3,
        `${name}: eval-quality's score exits ${engineSays.exitCode}, neither PASS nor the isolation violation`,
      );
    }
    // The set is not all one verdict: a helper that never refuses, or one that always does, fails some case above.
    check(
      refused > 0 && refused < all.length,
      `${refused} of ${all.length} cases are refused by eval-quality; the set must hold both verdicts`,
    );
    console.log(`isolation conformance: ${all.length} manifest(s) scored by eval-quality and by the helper, ${refused} refused`);
    return all.length;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

main().then(
  (count) => {
    if (failures.length > 0) {
      console.error(`${colors.red}${failures.length} of ${checks} isolation conformance check(s) failed:${colors.reset}`);
      for (const failure of failures) console.error(`  - ${failure}`);
      process.exitCode = 1;
      return;
    }
    console.log(`${colors.green}ok${colors.reset} all ${checks} isolation conformance check(s) passed over ${count} manifest(s)`);
  },
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
