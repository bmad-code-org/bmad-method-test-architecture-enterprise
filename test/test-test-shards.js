/**
 * tools/test-shards.js's partition, held against the chain it splits and the
 * workflow matrix that runs it.
 *
 * CI runs the `npm test` chain only through that tool, one shard per matrix
 * runner, so a partition that dropped a script would drop it from CI without
 * any job going red, and a matrix that skipped a shard number would do the
 * same to a whole shard. This proves, for every shard count from 1 to 8, that
 * the shards cover the chain exactly once, in chain order, and come out the
 * same on every run; that a script with no weight lands on the lightest shard;
 * that the weights file names no script the chain has dropped; and that the
 * quality workflow's matrix lists exactly 1 through the count it passes; that
 * the coverage job checks shard manifests for that same count, and that the
 * manifest check refuses a missing, foreign, duplicate or incomplete set; and
 * that a shard keeps going past a failing or signal-killed script.
 *
 * Usage: node test/test-test-shards.js
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { chainedScripts, shardedChainRuns, shardRunProblems } = require('../tools/validate-ci-coverage');
const {
  collectCoverage,
  includeUrlPrefixes,
  manifestProblems,
  parseShard,
  planShards,
  readShardManifests,
  readWeights,
  runShard,
  staleWeights,
} = require('../tools/test-shards');

const PROJECT_ROOT = path.join(__dirname, '..');
const MAX_SHARDS = 8;

const colors = { reset: '\u001B[0m', red: '\u001B[31m', green: '\u001B[32m' };

const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function lightestIndex(plan) {
  let lightest = 0;
  for (const [index, shard] of plan.entries()) if (shard.seconds < plan[lightest].seconds) lightest = index;
  return lightest;
}

function checkPartition(chain, weights) {
  for (let total = 1; total <= MAX_SHARDS; total += 1) {
    const plan = planShards(chain, weights, total);
    check(plan.length === total, `${total} shard(s) asked for, ${plan.length} planned`);
    const all = plan.flatMap((shard) => shard.scripts);
    check(all.length === chain.length, `${total} shard(s): ${all.length} script slots for a chain of ${chain.length}`);
    check(new Set(all).size === all.length, `${total} shard(s): a script is planned into more than one shard`);
    const missing = chain.filter((script) => !all.includes(script));
    check(missing.length === 0, `${total} shard(s): chained script(s) in no shard: ${missing.join(', ')}`);
    for (const [index, shard] of plan.entries()) {
      const positions = shard.scripts.map((script) => chain.indexOf(script));
      const ordered = positions.every((position, at) => at === 0 || positions[at - 1] < position);
      check(ordered, `${total} shard(s): shard ${index + 1} does not list its scripts in chain order`);
    }
    const reversedWeights = Object.fromEntries(Object.entries(weights).toReversed());
    const again = planShards(chain, reversedWeights, total);
    check(
      JSON.stringify(again) === JSON.stringify(plan),
      `${total} shard(s): the plan changed when the weights file listed the same entries in another order`,
    );
  }
}

function checkUnweightedScriptLandsOnLightestShard(chain, weights) {
  const synthetic = planShards(['a', 'b', 'c', 'fresh'], { a: 10, b: 10, c: 1 }, 2);
  check(
    JSON.stringify(synthetic.map((shard) => shard.scripts)) ===
      JSON.stringify([
        ['a', 'c'],
        ['b', 'fresh'],
      ]),
    `an unweighted script did not land on the lighter shard: ${JSON.stringify(synthetic)}`,
  );

  const newest = chain.at(-1);
  const withoutNewest = Object.fromEntries(Object.entries(weights).filter(([script]) => script !== newest));
  for (let total = 1; total <= MAX_SHARDS; total += 1) {
    const before = planShards(
      chain.filter((script) => script !== newest),
      withoutNewest,
      total,
    );
    const after = planShards(chain, withoutNewest, total);
    const landed = after.findIndex((shard) => shard.scripts.includes(newest));
    check(
      landed === lightestIndex(before),
      `${total} shard(s): ${newest}, with no weight, landed on shard ${landed + 1}; the lightest shard was ${lightestIndex(before) + 1}`,
    );
  }
}

function checkWeights(chain, weights) {
  const stale = staleWeights(chain, weights);
  check(
    stale.length === 0,
    `tools/test-shard-weights.json names script(s) the npm test chain no longer calls: ${stale.join(', ')}; remove them`,
  );
  check(
    JSON.stringify(staleWeights(['kept'], { kept: 1, renamed: 2 })) === JSON.stringify(['renamed']),
    'staleWeights did not name a weight whose script left the chain',
  );
  const nonNumeric = Object.entries(weights).filter(([, seconds]) => typeof seconds !== 'number' || !(seconds >= 0));
  check(nonNumeric.length === 0, `weights that are not non-negative numbers: ${JSON.stringify(nonNumeric)}`);
}

function checkWorkflowMatrix() {
  const runs = shardedChainRuns().filter((run) => run.file === 'quality.yaml');
  check(runs.length === 1, `quality.yaml should run tools/test-shards.js from exactly one job, found ${runs.length}`);
  for (const run of runs) {
    const problems = shardRunProblems(run);
    check(problems.length === 0, problems.join('; '));
    check(
      run.total >= 1 && run.total <= MAX_SHARDS,
      `quality.yaml shards the chain ${run.total} ways; this file proves 1 to ${MAX_SHARDS}`,
    );
  }
  // The coverage job's manifest check has to expect the same shard count, or
  // it would pass with shards missing or fail on a correct merge.
  const workflow = fs.readFileSync(path.join(PROJECT_ROOT, '.github', 'workflows', 'quality.yaml'), 'utf8');
  const expected = [...workflow.matchAll(/node tools\/test-shards\.js --check-manifests "\$RUNNER_TEMP\/v8" --shards (\d+)/g)].map(
    (match) => Number.parseInt(match[1], 10),
  );
  check(
    runs.length === 1 && JSON.stringify(expected) === JSON.stringify([runs[0].total]),
    `quality.yaml's coverage job checks shard manifests for ${JSON.stringify(expected)} shard(s); the chain job runs ${runs[0]?.total}`,
  );
}

function checkManifestProblems() {
  const chain = ['test:a', 'test:b', 'test:c'];
  const full = [
    { shard: 1, total: 2, scripts: ['test:a', 'test:c'] },
    { shard: 2, total: 2, scripts: ['test:b'] },
  ];
  check(manifestProblems(full, chain, 2).length === 0, `a complete set of manifests was refused: ${manifestProblems(full, chain, 2)}`);
  const cases = {
    'a missing shard': [full[0]],
    'a manifest from another shard count': [full[0], { ...full[1], total: 3 }],
    'a duplicate shard': [full[0], full[1], full[1]],
    'a chained script no shard ran': [full[0], { ...full[1], scripts: [] }],
    'a script the chain does not call': [full[0], { ...full[1], scripts: ['test:b', 'test:gone'] }],
    'a script two shards ran': [full[0], { ...full[1], scripts: ['test:b', 'test:a'] }],
    'an unreadable manifest': [full[0], full[1], { unreadable: 'shard-manifest-3.json' }],
  };
  for (const [name, manifests] of Object.entries(cases)) {
    check(manifestProblems(manifests, chain, 2).length > 0, `${name} passed the manifest check`);
  }
}

function checkShardArgument() {
  check(JSON.stringify(parseShard('2/5')) === JSON.stringify({ index: 2, total: 5 }), 'parseShard misread 2/5');
  for (const bad of ['0/5', '6/5', '1/0', 'x', '1-5', undefined]) {
    let threw = false;
    try {
      parseShard(bad);
    } catch {
      threw = true;
    }
    check(threw, `parseShard accepted ${JSON.stringify(bad)}`);
  }
}

function checkCoverageCollection(manifest) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-test-shards-'));
  try {
    const raw = path.join(scratch, 'raw');
    const flat = path.join(scratch, 'flat');
    fs.mkdirSync(raw);
    fs.mkdirSync(flat);
    const inside = pathToFileURL(path.join(PROJECT_ROOT, 'tools', 'test-shards.js')).href;
    const outside = pathToFileURL(path.join(PROJECT_ROOT, 'node_modules', 'c8', 'index.js')).href;
    fs.writeFileSync(
      path.join(raw, 'coverage-1.json'),
      JSON.stringify({
        result: [
          { url: inside, functions: [] },
          { url: outside, functions: [] },
          { url: 'node:fs', functions: [] },
        ],
      }),
    );
    fs.writeFileSync(path.join(raw, 'coverage-2.json'), JSON.stringify({ result: [{ url: outside, functions: [] }] }));
    fs.writeFileSync(path.join(raw, 'coverage-3.json'), '{"result": [');
    const written = collectCoverage(raw, flat, 'shard-2-test_x-', includeUrlPrefixes(manifest));
    const names = fs.readdirSync(flat);
    check(
      written === 1 && JSON.stringify(names) === '["shard-2-test_x-coverage-1.json"]',
      `collectCoverage wrote ${JSON.stringify(names)}`,
    );
    if (names.length === 1) {
      const kept = JSON.parse(fs.readFileSync(path.join(flat, names[0]), 'utf8'));
      check(
        JSON.stringify(kept.result.map((entry) => entry.url)) === JSON.stringify([inside]),
        `collectCoverage kept ${JSON.stringify(kept.result.map((entry) => entry.url))}; expected only the tools/ entry`,
      );
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Drives runShard over a throwaway project whose middle script fails: the
 * shard has to run the script after it anyway, annotate the failure, exit 1,
 * write every script's timing, and collect only the included coverage.
 */
function checkShardRunKeepsGoingPastAFailure() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tea-test-shards-run-')));
  try {
    const manifest = {
      name: 'shard-run-fixture',
      private: true,
      scripts: {
        'test:first': 'node lib/hit.js',
        'test:broken': 'node -e "process.exit(3)"',
        'test:killed': 'node -e "process.kill(process.pid, 9)"',
        'test:last': 'node lib/hit.js',
      },
      c8: { include: ['lib/**'] },
    };
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
    fs.mkdirSync(path.join(root, 'lib'));
    fs.writeFileSync(path.join(root, 'lib', 'hit.js'), "'use strict';\nprocess.exitCode = 0;\n");
    const coverageDir = path.join(root, 'v8');
    const timings = path.join(root, 'timings', 'shard-2.json');
    const lines = [];
    const status = runShard(
      ['test:first', 'test:broken', 'test:killed', 'test:last'],
      { index: 2, total: 3 },
      {
        root,
        manifest,
        coverageDir,
        timings,
        stdio: 'ignore',
        log: (line) => lines.push(line),
      },
    );
    const output = lines.join('\n');
    check(status === 1, `a shard with a failing script returned ${status}; expected 1`);
    check(
      output.includes('::error title=npm run test%3Abroken::npm run test:broken failed (3) in shard 2/3'),
      `the failing script got no escaped ::error annotation:\n${output}`,
    );
    check(
      output.includes('::error title=npm run test%3Akilled::npm run test:killed failed'),
      `a script killed by a signal did not fail the shard with an annotation:\n${output}`,
    );
    check(/ok {4}npm run test:last/.test(output), `the script after the failure did not run to a pass:\n${output}`);
    const recorded = fs.existsSync(timings) ? Object.keys(JSON.parse(fs.readFileSync(timings, 'utf8'))) : [];
    check(
      JSON.stringify(recorded) === JSON.stringify(['test:broken', 'test:first', 'test:killed', 'test:last']),
      `timings recorded ${JSON.stringify(recorded)}; expected all four scripts`,
    );
    const [shardManifest] = readShardManifests(coverageDir);
    check(
      JSON.stringify(shardManifest) ===
        JSON.stringify({ shard: 2, total: 3, scripts: ['test:first', 'test:broken', 'test:killed', 'test:last'] }),
      `the shard wrote the manifest ${JSON.stringify(shardManifest)}; expected shard 2 of 3 naming all four scripts`,
    );
    const files = fs.existsSync(coverageDir) ? fs.readdirSync(coverageDir).filter((name) => !name.startsWith('shard-manifest-')) : [];
    const prefixes = [...new Set(files.map((name) => name.replace(/coverage-.*$/, '')))].sort();
    check(
      JSON.stringify(prefixes) === JSON.stringify(['shard-2-test_first-', 'shard-2-test_last-']),
      `coverage files carried prefixes ${JSON.stringify(prefixes)}; expected one per script that loaded lib/`,
    );
    const hit = pathToFileURL(path.join(root, 'lib', 'hit.js')).href;
    const urls = new Set(
      files.flatMap((name) => JSON.parse(fs.readFileSync(path.join(coverageDir, name), 'utf8')).result.map((e) => e.url)),
    );
    check(
      JSON.stringify([...urls]) === JSON.stringify([hit]),
      `collected coverage names ${JSON.stringify([...urls])}; expected only lib/hit.js`,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
  const chain = chainedScripts(manifest);
  const weights = readWeights();
  checkPartition(chain, weights);
  checkUnweightedScriptLandsOnLightestShard(chain, weights);
  checkWeights(chain, weights);
  checkWorkflowMatrix();
  checkManifestProblems();
  checkShardArgument();
  checkCoverageCollection(manifest);
  checkShardRunKeepsGoingPastAFailure();

  if (failures.length > 0) {
    console.error(`${colors.red}${failures.length} of ${checks} test-shards check(s) failed:${colors.reset}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }
  console.log(`${colors.green}ok${colors.reset} all ${checks} test-shards check(s) passed`);
  return 0;
}

if (require.main === module) process.exitCode = main();
