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
 * an incomplete matrix covers none of them, and nested commands count only
 * when their failure can fail CI. `shardRunProblems` refuses each
 * way a green run could skip a shard or swallow its failure, one case each,
 * and `chainedScripts` refuses a chain part that is not a bare `npm run`.
 *
 * The actionlint install is held the same way: each case mutates a copy of the real
 * installer or workflow text and the check has to fail, so a check that passes over
 * everything cannot hide behind the clean repository.
 *
 * Usage: node test/test-ci-coverage.js
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  ACTIONLINT_INSTALLER,
  ACTIONLINT_WORKFLOWS,
  actionlintInstallerProblems,
  actionlintInstallProblems,
  actionlintInstallStepProblems,
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

function checkEveryBranchFilterIsAllowed() {
  const [run] = runsOf(shardWorkflow({ on: 'pull_request:\n    branches: ["**"]' }));
  check(
    run && shardRunProblems(run).length === 0,
    `a pull_request branches filter of "**" was refused: ${JSON.stringify(run && shardRunProblems(run))}`,
  );
}

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

function checkShardedChainCoversNestedScripts() {
  const scripts = {
    'test:cli':
      'echo "npm run test:orphan" && printf "before; npm run test:orphan" && npm run test:test-review-cli && node test/test-trace-cli.js',
    'test:test-review-cli': 'node test/test-test-review-cli.js',
    'test:orphan': 'node test/test-orphan.js',
  };
  const covered = scriptsCoveredInCi(['test:cli'], new Set(), [FULL_SHARD_RUN], scripts);
  check(
    covered.has('test:cli') && covered.has('test:test-review-cli') && !covered.has('test:orphan'),
    `a sharded command did not count its nested npm script as run in CI: ${JSON.stringify([...covered])}`,
  );
}

function checkConditionalFallbackDoesNotCountAsCovered() {
  const scripts = {
    'test:cli': 'npm run test:fast || npm run test:orphan; npm run test:always',
    'test:fast': 'node test/fast.js',
    'test:orphan': 'node test/orphan.js',
    'test:always': 'node test/always.js',
  };
  const covered = scriptsCoveredInCi(['test:cli'], new Set(), [FULL_SHARD_RUN], scripts);
  check(
    covered.has('test:always') && !covered.has('test:fast') && !covered.has('test:orphan'),
    `conditional fallback was counted as guaranteed CI execution: ${JSON.stringify([...covered])}`,
  );
  scripts['test:cli'] = 'npm run test:fast && npm run test:maybe || npm run test:orphan; npm run test:always';
  scripts['test:maybe'] = 'node test/maybe.js';
  const chained = scriptsCoveredInCi(['test:cli'], new Set(), [FULL_SHARD_RUN], scripts);
  check(
    chained.has('test:always') && !chained.has('test:fast') && !chained.has('test:maybe') && !chained.has('test:orphan'),
    `conditional command chain was counted as guaranteed CI execution: ${JSON.stringify([...chained])}`,
  );
}

function checkNestedScriptNamesAndMaskedChains() {
  const scripts = {
    'test:root': 'npm run test:setup && npm run test:unit.js',
    'test:setup': 'node test/setup.js',
    'test:unit.js': 'node test/unit.js',
  };
  check(
    JSON.stringify(chainedScripts({ scripts: { test: 'npm run test:unit.js && npm run lint:md' } })) === '["test:unit.js","lint:md"]',
    'a dotted script name in the test chain was refused',
  );
  const covered = () => scriptsCoveredInCi(['test:root'], new Set(), [FULL_SHARD_RUN], scripts);
  check(covered().has('test:unit.js'), 'a dotted nested script was missed');
  scripts['test:root'] = 'npm run test:setup && npm run test:unit.js; echo done';
  check(!covered().has('test:setup') && !covered().has('test:unit.js'), 'a later statement masked && failures');
  scripts['test:root'] = 'npm run test:setup && npm run test:unit.js\n echo done';
  check(!covered().has('test:setup') && !covered().has('test:unit.js'), 'a later line masked && failures');
  scripts['test:root'] = 'npm run test:setup && npm run test:unit.js;';
  check(covered().has('test:unit.js'), 'a trailing separator hid a command required for success');
  scripts['test:root'] = 'case x in y) npm run test:unit.js;; esac; npm run test:setup';
  check(!covered().has('test:unit.js') && covered().has('test:setup'), 'an unmatched case clause counted as CI execution');
  scripts['test:root'] = 'if false; then\nnpm run test:unit.js\nfi\nnpm run test:setup';
  check(!covered().has('test:unit.js') && covered().has('test:setup'), 'an unexecuted if branch counted as CI execution');
  scripts['test:root'] = 'npm run test:unit.js & echo done; npm run test:setup';
  check(!covered().has('test:unit.js') && covered().has('test:setup'), 'a background command counted as CI execution');
  scripts['test:root'] = 'npm run test:unit.js | cat; npm run test:setup';
  check(!covered().has('test:unit.js') && covered().has('test:setup'), 'a pipeline command counted as CI execution');
  scripts['test:root'] = '(npm run test:unit.js); npm run test:setup';
  check(!covered().has('test:unit.js') && covered().has('test:setup'), 'a subshell command counted as guaranteed CI execution');
  scripts['test:root'] = 'helper() {\nnpm run test:unit.js\n}\nnpm run test:setup';
  check(!covered().has('test:unit.js') && covered().has('test:setup'), 'a function body counted without its invocation');
  scripts['test:root'] = 'npm run test:unit.js || true';
  check(!covered().has('test:unit.js'), 'a fallback hid a script failure');
  scripts['test:root'] = 'npm run test:unit.js; echo done';
  check(!covered().has('test:unit.js'), 'a later statement hid a script failure');
  scripts['test:root'] = 'npm run test:unit.js; npm run test:setup';
  check(!covered().has('test:unit.js') && covered().has('test:setup'), 'only the last statement should gate CI');
  scripts['test:root'] = 'npm run test:unit.js && npm run test:setup';
  check(covered().has('test:unit.js') && covered().has('test:setup'), 'an unmasked && chain should gate CI');
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
  'a pull_request types filter': { on: 'pull_request:\n    types: [opened]' },
  'a pull_request paths filter': { on: 'pull_request:\n    paths: ["src/**"]' },
  'a pull_request paths-ignore filter': { on: 'pull_request:\n    paths-ignore: ["docs/**"]' },
  'a pull_request branches-ignore filter': { on: 'pull_request:\n    branches-ignore: ["release/**"]' },
  'a pull_request branches filter narrower than every branch': { on: 'pull_request:\n    branches: [main]' },
  'a pull_request branches filter that negates a branch': { on: 'pull_request:\n    branches: ["**", "!release/**"]' },
  'needs on the chain job': { job: 'needs: lint' },
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

const WORKFLOW_ROOT = path.join(PROJECT_ROOT, '.github', 'workflows');
const INSTALLER_TEXT = fs.readFileSync(ACTIONLINT_INSTALLER, 'utf8');

/** Replace one piece of text, and fail the case when the piece is gone, so a stale mutation cannot pass silently. */
function mutate(name, text, from, to) {
  check(text.includes(from), `${name}: the mutation target ${JSON.stringify(from)} is no longer in the file`);
  return text.replace(from, to);
}

/** Each way the installer can drop what the criteria require, with a phrase its problem has to carry. */
const INSTALLER_MUTATIONS = {
  'a single attempt': [(text) => mutate('a single attempt', text, 'ATTEMPTS=7', 'ATTEMPTS=1'), 'retries each download'],
  'four attempts': [(text) => mutate('four attempts', text, 'ATTEMPTS=7', 'ATTEMPTS=4'), 'retries each download'],
  'six attempts, which stop the waits at 32 seconds': [
    (text) => mutate('six attempts', text, 'ATTEMPTS=7', 'ATTEMPTS=6'),
    'makes exactly 7 attempts',
  ],
  'a wait budget below the schedule': [
    (text) => mutate('a wait budget of 60', text, 'WAIT_BUDGET=126', 'WAIT_BUDGET=60'),
    'spends at most 126 seconds',
  ],
  'a retry base of 0 by default': [
    (text) => mutate('a retry base of 0', text, 'INSTALL_ACTIONLINT_RETRY_BASE:-2}', 'INSTALL_ACTIONLINT_RETRY_BASE:-0}'),
    'waits a base of 2 seconds by default',
  ],
  'a sleep that does nothing by default': [
    (text) => mutate('a sleep of true', text, 'INSTALL_ACTIONLINT_SLEEP:-sleep}', 'INSTALL_ACTIONLINT_SLEEP:-true}'),
    'sleeps with the real `sleep` by default',
  ],
  'a deadline of 2000 seconds by default': [
    (text) => mutate('a deadline of 2000', text, 'INSTALL_ACTIONLINT_DEADLINE:-170}', 'INSTALL_ACTIONLINT_DEADLINE:-2000}'),
    'stops retrying after 170 seconds by default',
  ],
  'a constant wait': [(text) => mutate('a constant wait', text, 'RETRY_BASE << ($1 - 1)', 'RETRY_BASE'), 'grows the wait'],
  'no gzip -t before the pinned script reads the tarball': [
    (text) => mutate('no gzip -t', text, ' && gzip -t "$tarball" 2>/dev/null', ''),
    '`gzip -t`',
  ],
  'no checksum check on the tarball': [
    (text) => mutate('no checksum check', text, 'verify_checksum "$tarball" && return 0', 'return 0'),
    'release checksum file',
  ],
  'a checksum comparison that never differs': [
    (text) => mutate('no checksum comparison', text, '[[ $actual != "$expected" ]]', 'false'),
    'release checksum file',
  ],
  'a hard-coded version in place of the resolution': [
    (text) =>
      mutate(
        'a hard-coded version',
        text,
        '  with_retry try_latest || give_up "resolving the latest release from ${LATEST_URL}"',
        '  VERSION=1.7.12',
      ),
    'resolves the latest release tag',
  ],
  'a version literal anywhere in the code': [(text) => `${text}\nPINNED_VERSION=1.7.12\n`, 'keeps the actionlint version out of its code'],
  'a branch in place of the commit': [
    (text) => mutate('a branch', text, /^SCRIPT_COMMIT=[0-9a-f]{40}$/m.exec(text)[0], 'SCRIPT_COMMIT=main'),
    '40-hex commit',
  ],
  'a branch in the script URL': [
    (text) => mutate('a branch in the URL', text, '${RAW_BASE}/${SCRIPT_COMMIT}/scripts', '${RAW_BASE}/main/scripts'),
    '40-hex commit',
  ],
  'a script digest that is not 64 hex': [
    (text) => mutate('a short digest', text, /^SCRIPT_SHA256_DEFAULT=[0-9a-f]{64}$/m.exec(text)[0], 'SCRIPT_SHA256_DEFAULT=a96d6013'),
    '64-hex sha256',
  ],
  'a download script that is not checked against its digest': [
    (text) => mutate('no script digest check', text, '[[ $actual != "$SCRIPT_SHA256" ]]', 'false'),
    '64-hex sha256',
  ],
  'a comment standing in for the gzip check': [
    (text) =>
      mutate(
        'a comment for the gzip check',
        text,
        'if fetch_file "$TARBALL_URL" "$tarball" && gzip -t "$tarball" 2>/dev/null; then',
        '# fetch_file "$TARBALL_URL" "$tarball" && gzip -t "$tarball"\n  if fetch_file "$TARBALL_URL" "$tarball"; then',
      ),
    '`gzip -t`',
  ],
};

function checkActionlintInstallerKeepsEveryPart() {
  const clean = actionlintInstallerProblems(INSTALLER_TEXT);
  check(clean.length === 0, `the real installer was refused: ${JSON.stringify(clean)}`);
  for (const [name, [apply, phrase]] of Object.entries(INSTALLER_MUTATIONS)) {
    const problems = actionlintInstallerProblems(apply(INSTALLER_TEXT));
    check(
      problems.some((problem) => problem.includes(phrase)),
      `${name} did not fail the installer check with ${JSON.stringify(phrase)}: ${JSON.stringify(problems)}`,
    );
  }
}

/** The inline step each workflow ran before the installer, which a GitHub 503 fails on its first attempt. */
const INLINE_STEP = `        run: |
          curl -sSfL -o download-actionlint.bash https://raw.githubusercontent.com/rhysd/actionlint/3795ba2f6cb243eeca54c9d22e5c531cb9dcfb4a/scripts/download-actionlint.bash
          echo "a96d60132afb74536ff2b55cc784d5c55b0b57980d3d49f962f0b3871447d53a  download-actionlint.bash" | sha256sum -c -
          bash download-actionlint.bash
          sudo mv ./actionlint /usr/local/bin/
`;

function checkEachWorkflowKeepsTheInstaller() {
  for (const file of ACTIONLINT_WORKFLOWS) {
    const text = fs.readFileSync(path.join(WORKFLOW_ROOT, file), 'utf8');
    const clean = actionlintInstallStepProblems(file, text);
    check(clean.length === 0, `${file} was refused: ${JSON.stringify(clean)}`);
    const step = /^ {8}run: \|\n {10}bash tools\/install-actionlint\.sh[^\n]*\n[^\n]*\n/m.exec(text);
    check(step !== null, `${file}: the Install actionlint run block is not where the case looks for it`);
    if (!step) continue;
    const mutations = {
      'the inline curl and bash steps': text.replace(step[0], INLINE_STEP),
      'a step that runs something else': text.replace(step[0], '        run: echo installed\n'),
      'a step with no timeout': text.replace(
        '        timeout-minutes: 5\n        run: |\n          bash tools/install-actionlint.sh',
        '        run: |\n          bash tools/install-actionlint.sh',
      ),
      'a step with a 30 minute timeout': text.replace(
        '        timeout-minutes: 5\n        run: |\n          bash tools/install-actionlint.sh',
        '        timeout-minutes: 30\n        run: |\n          bash tools/install-actionlint.sh',
      ),
      'a step that swallows the installer failure': text.replace(
        'bash tools/install-actionlint.sh "$RUNNER_TEMP/actionlint-bin"',
        'bash tools/install-actionlint.sh "$RUNNER_TEMP/actionlint-bin" || true',
      ),
      'a step that continues on error': text.replace(
        '        timeout-minutes: 5\n',
        '        timeout-minutes: 5\n        continue-on-error: true\n',
      ),
      'a step with an if': text.replace(
        '        timeout-minutes: 5\n',
        "        timeout-minutes: 5\n        if: github.event_name == 'push'\n",
      ),
      'no Install actionlint step': text.replace('- name: Install actionlint', '- name: Install a linter'),
      'a second step that runs the download script': `${text}      - name: Lint again\n        run: bash download-actionlint.bash\n`,
    };
    for (const [name, mutated] of Object.entries(mutations)) {
      check(mutated !== text, `${file}: the mutation "${name}" changed nothing`);
      const problems = actionlintInstallStepProblems(file, mutated);
      check(problems.length > 0, `${file} with ${name} passed the actionlint install check`);
    }
  }
}

function checkRealRepoIsClean() {
  const manifest = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
  const chained = chainedScripts(manifest);
  const inCi = scriptsCoveredInCi(chained, undefined, undefined, manifest.scripts);
  const install = actionlintInstallProblems();
  check(install.length === 0, `the real actionlint install is refused: ${JSON.stringify(install)}`);
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
  checkShardedChainCoversNestedScripts();
  checkConditionalFallbackDoesNotCountAsCovered();
  checkNestedScriptNamesAndMaskedChains();
  checkChainedScriptNeitherShardedNorNamedIsMissing();
  checkIncompleteShardMatrixCoversNothing();
  checkEveryBypassIsRefused();
  checkEveryBranchFilterIsAllowed();
  checkChainOfNonNpmRunPartFails();
  checkActionlintInstallerKeepsEveryPart();
  checkEachWorkflowKeepsTheInstaller();
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
