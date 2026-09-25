/**
 * Runs one shard of the `npm test` chain, so CI can split the chain across a
 * matrix of runners.
 *
 * Run serially under c8, the chain took about 20 minutes on one runner and
 * reached the coverage job's timeout. No script in it reads another's output,
 * so the chain splits cleanly across runners. Inside one runner the scripts
 * still run one at a time, in chain order, because several of them bind fixed
 * ports or write fixed temp paths.
 *
 * The partition is deterministic. `tools/test-shard-weights.json` holds the
 * seconds each script took in CI under coverage. Scripts with a weight go
 * heaviest first, ties broken by name, each onto the lightest shard so far
 * (ties broken by the lower shard number). Scripts with no weight follow in
 * chain order, each onto the lightest shard at `DEFAULT_WEIGHT` seconds. The
 * chain itself comes from `chainedScripts` in tools/validate-ci-coverage.js,
 * the same parser test:ci-coverage uses, so the two cannot disagree on what
 * the chain is. test:shards holds the partition to the chain, and holds the
 * workflow matrix to the shard count, for every count this could be run with.
 *
 * Coverage: with `--coverage-dir D`, each script runs with NODE_V8_COVERAGE
 * pointing at its own scratch directory. When the script exits, each raw V8
 * file is cut down to the entries under the package.json c8 `include` roots
 * and written into D, which is flat because `c8 report` reads its temp
 * directory flat, under a `shard-<i>-<script>-` prefix that keeps every name
 * unique once the shards' directories are merged. `c8 report --temp-directory
 * D` over the merged directory then applies the package.json thresholds to the
 * whole chain. Raw coverage carries absolute file URLs, so the merge only
 * works where every shard checked the repository out to the same path, which
 * every GitHub-hosted job does.
 *
 * A failing script does not stop the shard: every other script still runs, so
 * one red run names every failure in the shard. Each failure is annotated with
 * `::error title=npm run <script>::`, and the shard exits 1 after printing its
 * timing table.
 *
 * Refreshing the weights: every CI shard writes `--timings` into a
 * `timings-<i>` artifact. Download them with `gh run download <run-id>
 * --pattern 'timings-*'`, then merge every downloaded `shard-<i>.json` with
 * `jq -S -s add` into tools/test-shard-weights.json.
 *
 * Usage:
 *   node tools/test-shards.js --shard <i>/<n> [--coverage-dir D] [--timings out.json]
 *   node tools/test-shards.js --shard <i>/<n> --list
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { parseArgs } = require('node:util');

const { chainedScripts } = require('./validate-ci-coverage');

const PROJECT_ROOT = path.join(__dirname, '..');
const WEIGHTS_FILE = path.join(__dirname, 'test-shard-weights.json');

/** Seconds assumed for a chained script the weights file does not list yet. */
const DEFAULT_WEIGHT = 5;

function readManifest() {
  return JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
}

function readWeights() {
  return JSON.parse(fs.readFileSync(WEIGHTS_FILE, 'utf8'));
}

/** Every weights entry that names a script the chain no longer calls. */
function staleWeights(chain, weights) {
  const inChain = new Set(chain);
  return Object.keys(weights)
    .filter((script) => !inChain.has(script))
    .sort();
}

/**
 * The chain split into `total` shards, each listed in chain order.
 *
 * Pure: the same chain, weights and total always give the same shards.
 */
function planShards(chain, weights, total, defaultWeight = DEFAULT_WEIGHT) {
  if (!Number.isInteger(total) || total < 1) throw new RangeError(`shard total must be a positive integer, got ${total}`);
  const order = new Map();
  for (const script of chain) if (!order.has(script)) order.set(script, order.size);
  const scripts = [...order.keys()];
  const known = scripts
    .filter((script) => Object.hasOwn(weights, script))
    .sort((a, b) => weights[b] - weights[a] || (a < b ? -1 : a > b ? 1 : 0));
  const unknown = scripts.filter((script) => !Object.hasOwn(weights, script));

  const shards = Array.from({ length: total }, () => ({ scripts: [], seconds: 0 }));
  const place = (script, seconds) => {
    let lightest = shards[0];
    for (const shard of shards) if (shard.seconds < lightest.seconds) lightest = shard;
    lightest.scripts.push(script);
    lightest.seconds += seconds;
  };
  for (const script of known) place(script, weights[script]);
  for (const script of unknown) place(script, defaultWeight);

  return shards.map((shard) => ({
    scripts: shard.scripts.sort((a, b) => order.get(a) - order.get(b)),
    seconds: shard.seconds,
  }));
}

/** Parses `i/n` into `{ index, total }`, or throws naming what is wrong. */
function parseShard(value) {
  const match = /^(\d+)\/(\d+)$/.exec(value ?? '');
  if (!match) throw new Error(`--shard takes <i>/<n>, got ${JSON.stringify(value ?? null)}`);
  const index = Number.parseInt(match[1], 10);
  const total = Number.parseInt(match[2], 10);
  if (total < 1 || index < 1 || index > total) throw new Error(`--shard ${value} is out of range; i has to be between 1 and n`);
  return { index, total };
}

function parseCliArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      shard: { type: 'string' },
      'coverage-dir': { type: 'string' },
      timings: { type: 'string' },
      list: { type: 'boolean', default: false },
    },
    strict: true,
  });
  if (values.shard === undefined) throw new Error('--shard <i>/<n> is required');
  return {
    shard: parseShard(values.shard),
    coverageDir: values['coverage-dir'] === undefined ? undefined : path.resolve(values['coverage-dir']),
    timings: values.timings === undefined ? undefined : path.resolve(values.timings),
    list: values.list,
  };
}

/**
 * The file-URL prefixes of the package.json c8 `include` globs, cut at the
 * first glob character, so `cli/**` becomes `file:///.../cli/`.
 */
function includeUrlPrefixes(manifest, root = PROJECT_ROOT) {
  // V8 records the real path a module loaded from, so a root reached through
  // a symlink (macOS's /var/folders temp directories are one) has to be
  // resolved the same way before it can prefix anything.
  const base = fs.realpathSync(root);
  return (manifest.c8?.include ?? []).map((glob) => {
    const literal = glob.split(/[*?[{]/)[0];
    const href = pathToFileURL(path.join(base, literal)).href;
    return literal.endsWith('/') && !href.endsWith('/') ? `${href}/` : href;
  });
}

/** A script name made safe for a file name: `test:eval-data` becomes `test_eval-data`. */
function safeName(script) {
  return script.replaceAll(/[^\w.-]/g, '_');
}

/**
 * Moves one script's raw V8 files into the flat coverage directory, keeping
 * only the entries under the include roots and dropping a file with none.
 * Returns how many files it wrote.
 */
function collectCoverage(rawDir, coverageDir, prefix, urlPrefixes) {
  if (!fs.existsSync(rawDir)) return 0;
  let written = 0;
  for (const name of fs.readdirSync(rawDir).sort()) {
    if (!name.endsWith('.json')) continue;
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(path.join(rawDir, name), 'utf8'));
    } catch {
      // A process killed mid-write leaves a truncated file; c8 skips those too.
      continue;
    }
    const keep = (url) => typeof url === 'string' && urlPrefixes.some((urlPrefix) => url.startsWith(urlPrefix));
    const result = (raw.result ?? []).filter((entry) => keep(entry.url));
    if (result.length === 0) continue;
    const kept = { result, timestamp: raw.timestamp };
    if (raw['source-map-cache']) {
      kept['source-map-cache'] = Object.fromEntries(Object.entries(raw['source-map-cache']).filter(([url]) => keep(url)));
    }
    fs.writeFileSync(path.join(coverageDir, `${prefix}${name}`), JSON.stringify(kept));
    written += 1;
  }
  return written;
}

/** Escapes a workflow-command property value, where `:` and `,` are delimiters. */
function escapeProperty(value) {
  return value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A').replaceAll(':', '%3A').replaceAll(',', '%2C');
}

function formatSeconds(seconds) {
  return seconds.toFixed(1).padStart(7);
}

function list(plan, { index, total }, weights) {
  const shard = plan[index - 1];
  console.log(`shard ${index}/${total}: ${shard.scripts.length} script(s), ${shard.seconds.toFixed(1)}s by the weights`);
  for (const script of shard.scripts) {
    const weight = Object.hasOwn(weights, script) ? `${weights[script]}s` : `${DEFAULT_WEIGHT}s (no weight yet)`;
    console.log(`  npm run ${script}  ${weight}`);
  }
  return 0;
}

/**
 * Runs `scripts` with `npm run` in `root`, one at a time, and returns 1 when
 * any failed. `root` and `log` exist so test:shards can drive a synthetic
 * project through the same code path CI takes, output included.
 */
function runShard(
  scripts,
  { index, total },
  { root = PROJECT_ROOT, manifest, coverageDir, timings, stdio = 'inherit', log = console.log },
) {
  const urlPrefixes = includeUrlPrefixes(manifest, root);
  if (coverageDir) fs.mkdirSync(coverageDir, { recursive: true });
  const scratch = coverageDir ? fs.mkdtempSync(path.join(os.tmpdir(), 'tea-test-shard-')) : null;

  const results = [];
  for (const script of scripts) {
    const env = { ...process.env };
    const rawDir = scratch ? path.join(scratch, safeName(script)) : null;
    if (rawDir) {
      fs.mkdirSync(rawDir, { recursive: true });
      env.NODE_V8_COVERAGE = rawDir;
    }
    log(`::group::npm run ${script}`);
    const started = process.hrtime.bigint();
    const child = spawnSync('npm', ['run', script], { cwd: root, env, stdio });
    const seconds = Number(process.hrtime.bigint() - started) / 1e9;
    log('::endgroup::');
    const status = child.error ? `spawn error: ${child.error.message}` : child.signal ? `signal ${child.signal}` : child.status;
    const passed = status === 0;
    if (!passed)
      log(`::error title=${escapeProperty(`npm run ${script}`)}::npm run ${script} failed (${status}) in shard ${index}/${total}`);
    if (rawDir) {
      collectCoverage(rawDir, coverageDir, `shard-${index}-${safeName(script)}-`, urlPrefixes);
      fs.rmSync(rawDir, { recursive: true, force: true });
    }
    results.push({ script, seconds, passed });
  }
  if (scratch) fs.rmSync(scratch, { recursive: true, force: true });

  const failed = results.filter((result) => !result.passed);
  const totalSeconds = results.reduce((sum, result) => sum + result.seconds, 0);
  log(`\nshard ${index}/${total}: ${results.length} script(s), ${failed.length} failed, ${totalSeconds.toFixed(1)}s`);
  for (const result of results) log(`${formatSeconds(result.seconds)}s  ${result.passed ? 'ok  ' : 'FAIL'}  npm run ${result.script}`);

  if (timings) {
    const rounded = Object.fromEntries(
      results.map((result) => [result.script, Math.round(result.seconds * 10) / 10]).sort(([a], [b]) => (a < b ? -1 : 1)),
    );
    fs.mkdirSync(path.dirname(timings), { recursive: true });
    fs.writeFileSync(timings, `${JSON.stringify(rounded, null, 2)}\n`);
  }

  if (failed.length > 0) {
    log(`\nshard ${index}/${total} failed: ${failed.map((result) => `npm run ${result.script}`).join(', ')}`);
    return 1;
  }
  return 0;
}

function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseCliArgs(argv);
  } catch (error) {
    console.error(`test-shards: ${error.message}`);
    console.error('usage: node tools/test-shards.js --shard <i>/<n> [--coverage-dir D] [--timings out.json] [--list]');
    return 2;
  }
  const manifest = readManifest();
  const weights = readWeights();
  const plan = planShards(chainedScripts(manifest), weights, options.shard.total);
  if (options.list) return list(plan, options.shard, weights);
  return runShard(plan[options.shard.index - 1].scripts, options.shard, {
    manifest,
    coverageDir: options.coverageDir,
    timings: options.timings,
  });
}

if (require.main === module) process.exitCode = main();

module.exports = {
  collectCoverage,
  DEFAULT_WEIGHT,
  includeUrlPrefixes,
  parseShard,
  planShards,
  readWeights,
  runShard,
  staleWeights,
  WEIGHTS_FILE,
};
