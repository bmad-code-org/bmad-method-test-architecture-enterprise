/**
 * `tools/validate-ci-coverage.js`'s own filter logic, held by a test rather
 * than by watching it pass against the current, already-clean repo state.
 *
 * `uncoveredScripts` and `staleDeliberatelyLocalEntries` are the two halves
 * of the "every script is covered or explained" claim, one in each
 * direction. Both are pure functions of a manifest and a coverage set, so a
 * regression in either (an inverted condition, a typo'd membership check)
 * would make the tool report success over synthetic input the same way it
 * would over the real tree, which is exactly the failure mode this file
 * exists to catch: `node tools/validate-ci-coverage.js` alone, run only
 * against the live repo, could not distinguish "nothing is wrong" from "the
 * check that would say so is broken."
 *
 * `scriptsCoveredInCi` gets the same treatment: a chain run through
 * tools/test-shards.js over a full 1..N matrix covers every chained script,
 * an incomplete matrix covers none of them, and with no sharded run a chained
 * script counts only when a workflow names it.
 *
 * Usage: node test/test-ci-coverage.js
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  chainedScripts,
  DELIBERATELY_LOCAL,
  scriptsCoveredInCi,
  staleDeliberatelyLocalEntries,
  uncoveredScripts,
} = require('../tools/validate-ci-coverage');

const PROJECT_ROOT = path.join(__dirname, '..');

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };

const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function checkUncoveredScriptsFlagsAGenuineGap() {
  const manifest = { scripts: { 'test:chained-example': 'node x.js', 'tool:orphan': 'node y.js' } };
  const inCi = new Set(['test:chained-example']);
  const uncovered = uncoveredScripts(manifest, inCi);
  check(
    uncovered.includes('tool:orphan'),
    `a script in neither inCi nor DELIBERATELY_LOCAL was not flagged; uncoveredScripts returned ${JSON.stringify(uncovered)}`,
  );
}

function checkUncoveredScriptsClearsACiCoveredScript() {
  const manifest = { scripts: { 'test:chained-example': 'node x.js' } };
  const inCi = new Set(['test:chained-example']);
  const uncovered = uncoveredScripts(manifest, inCi);
  check(uncovered.length === 0, `a script found running in CI was flagged anyway: ${JSON.stringify(uncovered)}`);
}

function checkUncoveredScriptsClearsAnAllowlistedScript() {
  const [anyAllowlisted] = Object.keys(DELIBERATELY_LOCAL);
  const manifest = { scripts: { [anyAllowlisted]: 'node z.js' } };
  const uncovered = uncoveredScripts(manifest, new Set());
  check(uncovered.length === 0, `${anyAllowlisted}, a DELIBERATELY_LOCAL entry, was flagged as uncovered: ${JSON.stringify(uncovered)}`);
}

function checkUncoveredScriptsExemptsTestByName() {
  const manifest = { scripts: { test: 'npm run test:chained-example' } };
  const uncovered = uncoveredScripts(manifest, new Set());
  check(uncovered.length === 0, `the "test" meta-script was flagged despite its name exemption: ${JSON.stringify(uncovered)}`);
}

function checkStaleDeliberatelyLocalEntriesFlagsARemovedScript() {
  const [anyAllowlisted, ...rest] = Object.keys(DELIBERATELY_LOCAL);
  const manifestMissingIt = { scripts: Object.fromEntries(rest.map((name) => [name, 'node x.js'])) };
  const stale = staleDeliberatelyLocalEntries(manifestMissingIt);
  check(
    stale.includes(anyAllowlisted),
    `${anyAllowlisted} was removed from the manifest's scripts and staleDeliberatelyLocalEntries did not name it: ${JSON.stringify(stale)}`,
  );
}

function checkStaleDeliberatelyLocalEntriesClearsAPresentScript() {
  const manifestWithAll = { scripts: Object.fromEntries(Object.keys(DELIBERATELY_LOCAL).map((name) => [name, 'node x.js'])) };
  const stale = staleDeliberatelyLocalEntries(manifestWithAll);
  check(
    stale.length === 0,
    `every DELIBERATELY_LOCAL script is present, yet staleDeliberatelyLocalEntries reported: ${JSON.stringify(stale)}`,
  );
}

const FULL_SHARD_RUN = { file: 'quality.yaml', job: 'chain', total: 2, shards: [1, 2] };

function checkShardedChainCoversEveryChainedScript() {
  const covered = scriptsCoveredInCi(['test:a', 'test:b'], new Set(), [FULL_SHARD_RUN]);
  check(
    covered.has('test:a') && covered.has('test:b'),
    `a full shard matrix did not count the chain as run in CI: ${JSON.stringify([...covered])}`,
  );
}

function checkChainedScriptNeitherShardedNorNamedIsMissing() {
  const covered = scriptsCoveredInCi(['test:a', 'test:b'], new Set(['test:a']), []);
  check(
    covered.has('test:a') && !covered.has('test:b'),
    `with no shard run, only the named script should count as run in CI: ${JSON.stringify([...covered])}`,
  );
}

function checkIncompleteShardMatrixCoversNothing() {
  const covered = scriptsCoveredInCi(['test:a'], new Set(), [{ ...FULL_SHARD_RUN, total: 3 }]);
  check(!covered.has('test:a'), 'a shard matrix of [1, 2] for a 3-way split still counted the chain as run in CI');
}

function checkRealRepoIsClean() {
  const manifest = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
  const chained = chainedScripts(manifest);
  const inCi = scriptsCoveredInCi(chained);
  const notRun = chained.filter((script) => !inCi.has(script));
  check(notRun.length === 0, `chained script(s) the real workflows never run: ${JSON.stringify(notRun)}`);
  const uncovered = uncoveredScripts(manifest, inCi);
  check(
    uncovered.length === 0,
    `the real package.json has uncovered script(s), which the tool's own main() should already be catching: ${JSON.stringify(uncovered)}`,
  );
  const stale = staleDeliberatelyLocalEntries(manifest);
  check(stale.length === 0, `DELIBERATELY_LOCAL has stale entry(ies) against the real package.json: ${JSON.stringify(stale)}`);
}

function main() {
  checkUncoveredScriptsFlagsAGenuineGap();
  checkUncoveredScriptsClearsACiCoveredScript();
  checkUncoveredScriptsClearsAnAllowlistedScript();
  checkUncoveredScriptsExemptsTestByName();
  checkStaleDeliberatelyLocalEntriesFlagsARemovedScript();
  checkStaleDeliberatelyLocalEntriesClearsAPresentScript();
  checkShardedChainCoversEveryChainedScript();
  checkChainedScriptNeitherShardedNorNamedIsMissing();
  checkIncompleteShardMatrixCoversNothing();
  checkRealRepoIsClean();

  if (failures.length > 0) {
    console.error(`${colors.red}${failures.length} of ${checks} ci-coverage filter check(s) failed:${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log(`${colors.green}ok${colors.reset} all ${checks} ci-coverage filter check(s) passed`);
  return 0;
}

if (require.main === module) process.exitCode = main();
