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
 * script counts only when a workflow names it. `shardRunProblems` refuses each
 * way a green run could skip a shard or swallow its failure, one case each,
 * and `chainedScripts` refuses a chain part that is not a bare `npm run`.
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
  shardedChainRunsIn,
  shardRunProblems,
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

const GOOD_RUN_LINE =
  'node tools/test-shards.js --shard ${{ matrix.shard }}/2 --coverage-dir "$RUNNER_TEMP/v8" --timings "$RUNNER_TEMP/t-${{ matrix.shard }}.json"';

/** A workflow that shards the chain two ways, with one part swapped out per case. */
function shardWorkflow({
  on = 'pull_request:',
  matrix = 'shard: [1, 2]',
  job = '',
  step = '',
  run = GOOD_RUN_LINE,
  workflowDefaults = '',
} = {}) {
  return [
    'on:',
    `  ${on}`,
    ...(workflowDefaults ? workflowDefaults.split('\n') : []),
    'jobs:',
    '  chain:',
    '    runs-on: ubuntu-latest',
    ...(job ? [`    ${job}`] : []),
    '    strategy:',
    '      matrix:',
    ...matrix.split('\n').map((line) => `        ${line}`),
    '    steps:',
    '      - name: Run this shard',
    ...(step ? [`        ${step}`] : []),
    `        run: ${JSON.stringify(run)}`,
    '',
  ].join('\n');
}

function runsOf(text) {
  return shardedChainRunsIn('x.yaml', text);
}

const FULL_SHARD_RUN = runsOf(shardWorkflow())[0];

function checkShardedChainCoversEveryChainedScript() {
  check(
    FULL_SHARD_RUN && shardRunProblems(FULL_SHARD_RUN).length === 0,
    `the well-formed shard workflow was refused: ${JSON.stringify(FULL_SHARD_RUN && shardRunProblems(FULL_SHARD_RUN))}`,
  );
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
  const run = runsOf(shardWorkflow({ run: GOOD_RUN_LINE.replace('/2 ', '/3 ') }))[0];
  const covered = scriptsCoveredInCi(['test:a'], new Set(), [run]);
  check(!covered.has('test:a'), 'a shard matrix of [1, 2] for a 3-way split still counted the chain as run in CI');
}

/**
 * Every way a green run could skip a shard or swallow its failure, each of
 * which has to be refused on its own.
 */
const REFUSED_SHARD_WORKFLOWS = {
  'a matrix exclude': { matrix: 'shard: [1, 2]\nexclude:\n  - shard: 2' },
  'a matrix include': { matrix: 'shard: [1, 2]\ninclude:\n  - shard: 3' },
  'a second matrix key': { matrix: 'shard: [1, 2]\nos: [ubuntu-latest]' },
  'a job-level if': { job: "if: github.event_name == 'push'" },
  'a job-level continue-on-error': { job: 'continue-on-error: true' },
  'a step-level if': { step: 'if: matrix.shard != 2' },
  'a step-level continue-on-error': { step: 'continue-on-error: true' },
  'a step-level shell': { step: 'shell: bash {0}' },
  '--list on the run line': { run: GOOD_RUN_LINE.replace('/2 ', '/2 --list ') },
  '|| true after the invocation': { run: `${GOOD_RUN_LINE} || true` },
  '; true after the invocation': { run: `${GOOD_RUN_LINE}; true` },
  '&& after the invocation': { run: `${GOOD_RUN_LINE} && echo done` },
  'a pipe after the invocation': { run: `${GOOD_RUN_LINE} | tee log.txt` },
  'a command substitution in a flag value': { run: GOOD_RUN_LINE.replace('$RUNNER_TEMP/v8', '$(false)') },
  'a second line in the run block': { run: `${GOOD_RUN_LINE}\nexit 0` },
  'a backslash-escaped quote that lets || true out of a flag value': {
    run: 'node tools/test-shards.js --shard ${{ matrix.shard }}/2 --timings "a\\" --timings " || true #"',
  },
  'a job-level defaults.run.shell': { job: 'defaults:\n      run:\n        shell: sh -c "exit 0" {0}' },
  'a job-level defaults.run.working-directory': { job: 'defaults:\n      run:\n        working-directory: website' },
  'a workflow-level defaults.run.shell': { workflowDefaults: 'defaults:\n  run:\n    shell: sh -c "exit 0" {0}' },
  'a workflow-level defaults.run.working-directory': { workflowDefaults: 'defaults:\n  run:\n    working-directory: website' },
  'a step-level working-directory': { step: 'working-directory: website' },
  'a workflow that does not run on pull_request': { on: 'push:' },
};

function checkEveryBypassIsRefused() {
  for (const [name, parts] of Object.entries(REFUSED_SHARD_WORKFLOWS)) {
    const [run] = runsOf(shardWorkflow(parts));
    check(run !== undefined, `${name}: the shard invocation was not found at all`);
    if (!run) continue;
    check(shardRunProblems(run).length > 0, `${name} passed shardRunProblems`);
    check(!scriptsCoveredInCi(['test:a'], new Set(), [run]).has('test:a'), `${name} still counted the chain as run in CI`);
  }
}

function checkChainOfNonNpmRunPartFails() {
  let message = '';
  try {
    chainedScripts({ scripts: { test: 'npm run test:a && node test/x.js' } });
  } catch (error) {
    message = error.message;
  }
  check(
    message.includes('"node test/x.js"'),
    `a chain part that is not a bare npm run was not refused by name: ${JSON.stringify(message)}`,
  );
  check(
    JSON.stringify(chainedScripts({ scripts: { test: 'npm run test:a && npm run lint:md' } })) === '["test:a","lint:md"]',
    'a chain of bare npm run parts did not parse',
  );
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
  checkEveryBypassIsRefused();
  checkChainOfNonNpmRunPartFails();
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
