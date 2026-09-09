/**
 * The live half of the scoring chain: a real pre-flight, then a real score and
 * seal under it.
 *
 * `npm run test:probe-corpus` runs the same chain against stored evidence with no
 * model call. This runs `runPreflight` through `eval-quality`'s command-line
 * adapter against the commands TEA ships, so the pre-flight verdict is measured
 * rather than constructed, and then scores every probe under that verdict and
 * seals each contract.
 *
 * WHAT IS LIVE AND WHAT IS NOT
 *
 * The pre-flight is live: every leg is a real agent run through a real process.
 * The sealed run record each probe is scored against is the stored output
 * `test/replay/` keeps, because a live record needs a complete harness run per
 * probe and `npm run eval:all` is where that cost belongs. So a verdict here is a
 * real answer to "can this environment measure anything" composed with a replayed
 * answer to "did the contract catch it". The evaluator configuration on every
 * artifact says `stored-replay`, and the cost report says what the pre-flight
 * actually spent.
 *
 * RESUMABLE, AND WHY IT HAS TO BE
 *
 * Twenty legs at up to fifteen minutes each is a long run against a quota that
 * can end it at any point. Every observation is cached to disk under a digest of
 * the request that produced it, so a rate limit costs one leg and not the set,
 * and a second invocation pays only for what is missing. The cache is keyed on
 * the request rather than on the leg, which also collapses the legs that are the
 * same request: AD-10 mints two control-observe legs from the first witness leg's
 * inputs, and a manifestation witness against the same file list as a witness leg
 * is the same run again.
 *
 * THE WORKSPACE
 *
 * Each suite runs in its own staged directory, never in the repository. A
 * test-review leg names its fixtures by repository-relative path and writes
 * `verdict.json` beside them, and the policy's `cwd` is what both resolve
 * against, so the fixtures are copied into the run directory and the artifact
 * lands there. A trace leg needs its own fixture set staged, which is what
 * test/eval-trace.js already does for its own runs, and the leg's prompt says which
 * set that is. A selection needs nothing on disk at all.
 *
 * Usage:
 *   npm run eval:preflight                     # the live pre-flight, cached, nothing scored
 *   npm run eval:contract-strength             # pre-flight, then score and seal
 *   node test/eval-contract-strength.js --suite trace --agent codex
 *   node test/eval-contract-strength.js --from-cache      # score with no new model call
 *
 * Exit codes are read against `test/probes/expected-strength.json`, the same
 * baseline the deterministic gate compares to: 0 when every probe reached the
 * outcome the corpus records, 1 when a verdict moved, 2 when a pre-flight outcome
 * moved. Eight of the thirty-one probes could not be pre-flighted when that rule
 * was written, and the baseline said so; all thirty-one pre-flight now, so a
 * failure here is news and the baseline is what says so.
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { digest } = require('./lib/eval-record');
const { validateArtifact } = require('./lib/eval-quality-inputs');
const { createProbePort, hostEnvironment } = require('./lib/probe-targets');
const { runSuite, sealContract, suites } = require('./lib/probe-scoring');
const { stageWorkspace, traceArtifactPaths } = require('./eval-trace');

const PROJECT_ROOT = path.join(__dirname, '..');
const REVIEW_FIXTURE_DIR = path.join('test', 'fixtures', 'test-review-eval');
const REVIEW_SKILL_DIR = path.join('src', 'workflows', 'testarch', 'bmad-testarch-test-review');
const DEFAULT_OUT = path.join(PROJECT_ROOT, 'test', 'eval-artifacts', 'contract-strength');
const DEFAULT_CACHE = path.join(PROJECT_ROOT, 'test', 'eval-artifacts', 'preflight-cache');
const BASELINE_PATH = path.join(PROJECT_ROOT, 'test', 'probes', 'expected-strength.json');
const TRACE_GROUND_TRUTH = path.join(PROJECT_ROOT, 'test', 'fixtures', 'trace-eval', 'ground-truth.json');

const colors = {
  reset: '[0m',
  red: '[31m',
  green: '[32m',
  yellow: '[33m',
  dim: '[2m',
};

function parseArgs(argv) {
  const options = {
    agent: 'claude',
    suiteIds: [],
    preflightOnly: false,
    fromCache: false,
    force: false,
    out: DEFAULT_OUT,
    cache: DEFAULT_CACHE,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`${argument} needs a value`);
      index += 1;
      return value;
    };
    switch (argument) {
      case '--agent': {
        options.agent = next();
        break;
      }
      case '--suite': {
        options.suiteIds.push(next());
        break;
      }
      case '--out': {
        options.out = path.resolve(next());
        break;
      }
      case '--cache': {
        options.cache = path.resolve(next());
        break;
      }
      case '--preflight-only': {
        options.preflightOnly = true;
        break;
      }
      case '--from-cache': {
        options.fromCache = true;
        break;
      }
      case '--force': {
        options.force = true;
        break;
      }
      default: {
        throw new Error(`unknown option ${argument}`);
      }
    }
  }
  return options;
}

/**
 * One directory copied into another.
 *
 * Hand-written rather than `fs.cpSync`, which is still experimental below Node
 * 22.3.0 and this package declares `>=22.0.0`.
 */
function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target);
    else fs.copyFileSync(source, target);
  }
}

/** A directory name a cache path can carry, from a suite identifier that may hold a slash. */
const slug = (suiteId) => suiteId.replaceAll(/[^a-z\d]+/gi, '-');

/**
 * The run directory one suite's legs execute in, and the artifact paths that
 * directory makes true.
 *
 * A trace leg is staged by the trace harness itself, so the set arrives exactly as
 * `npm run eval:trace` stages it, under the same project root its artifact override
 * names. Which set that is comes out of the leg's own prompt: each fixture set has
 * its own project root and the prompt is written against it, so a leg that traces
 * the clean set asks for the clean set. Staging one set for every leg is what made
 * the contract's two witness legs seeded runs, which is the scoping failure
 * `seeded-faults-scoped` reported against all three defect probes.
 *
 * A test-review leg is the coupling `docs/explanation/eval-quality-command-adapter.md`
 * records: its `--files` are repository-relative, its `--json` is a bare
 * `verdict.json`, and both resolve against the policy's `cwd`, which is also
 * where the artifact map reads the verdict back. So the run directory is given
 * the fixture tree at the path `--files` names and the skill at a path
 * `resolveSkill` probes, and everything the leg declares is then true of it. The
 * skill is `src/workflows/testarch/...`, which is the fourth candidate
 * `cli/lib/resolve-skill.js` looks in and the one a checkout of this repository
 * satisfies.
 *
 * A selection leg gets an empty directory, which is what its `read-only`
 * declaration is for.
 */
function stagedWorkspaceFor(suiteId, request) {
  if (suiteId === 'trace') {
    const groundTruth = JSON.parse(fs.readFileSync(TRACE_GROUND_TRUTH, 'utf8'));
    const prompt = String(request?.channels?.stdin?.value ?? '');
    const set = groundTruth.fixtureSets.find((entry) => prompt.includes(`\`{project-root}\`: \`${entry.projectRoot}\``));
    if (set === undefined) {
      throw new Error('a trace leg sent a prompt naming no fixture set project root, so there is no set to stage for it');
    }
    const staged = stageWorkspace(set);
    return {
      root: staged.dir,
      cwd: staged.dir,
      artifacts: { 'tea-trace-runner': traceArtifactPaths(set) },
    };
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `tea-${slug(suiteId)}-preflight-`));
  if (suiteId === 'test-review') {
    copyTree(path.join(PROJECT_ROOT, REVIEW_FIXTURE_DIR), path.join(dir, REVIEW_FIXTURE_DIR));
    copyTree(path.join(PROJECT_ROOT, REVIEW_SKILL_DIR), path.join(dir, REVIEW_SKILL_DIR));
  }
  return { root: dir, cwd: dir, artifacts: {} };
}

/** The environment names this operation declares it accepts, intersected with what this machine has. */
function permittedEnvironment(contract, operationId) {
  const operation = contract.permittedInterfaces.flatMap((iface) => iface.operations).find((entry) => entry.operationId === operationId);
  const permitted = new Set(operation?.requestShape?.environment?.permittedKeys ?? []);
  return Object.fromEntries(Object.entries(hostEnvironment()).filter(([name]) => permitted.has(name)));
}

/** The cache key for one probe request: everything about it except which leg asked. */
function requestKey(request) {
  const { probeId, ...rest } = request;
  return digest([JSON.stringify(rest)])
    .replace('sha256:', '')
    .slice(0, 32);
}

/**
 * The live port, with every observation cached to disk under its request.
 *
 * The cache is the resumability. A leg whose request was answered before is
 * returned from disk with this leg's own correlation identifiers written back
 * on, because the reducer indexes observations by `probeId` and the cached one
 * carries whichever leg happened to run first.
 *
 * A fresh workspace per spawned leg, and that is not tidiness. The first live
 * trace pre-flight ran both witness legs in one staged directory and the second
 * leg's artifact map read back a summary the first leg had written: the two
 * summaries were byte-identical while the two matrices differed, so the
 * differential the witness asserts was measured against a file the second run
 * never produced. `fixtureReset` is `null` on every TEA contract, so AD-10 plans
 * nothing to reset one, and a directory each is the only thing that makes a leg's
 * evidence its own.
 */
function cachingPort({ makePort, contract, cacheDir, agent, force, counters, log }) {
  fs.mkdirSync(cacheDir, { recursive: true });
  return {
    async probe(request, signal) {
      const key = requestKey(request);
      const file = path.join(cacheDir, `${key}.json`);
      if (!force && fs.existsSync(file)) {
        for (const counter of counters) counter.hits += 1;
        log(`  ${colors.dim}cached${colors.reset} leg ${request.probeId} (${key})`);
        const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
        return { ...cached.observation, probeId: request.probeId, interfaceId: request.interfaceId, operationId: request.operationId };
      }
      const augmented = {
        ...request,
        channels: {
          ...request.channels,
          option: { ...request.channels.option, agent },
          environment: { ...permittedEnvironment(contract, request.operationId), ...request.channels.environment },
        },
      };
      log(`  ${colors.yellow}running${colors.reset} leg ${request.probeId} (${key})`);
      const { port: realPort, workspace } = await makePort(augmented);
      const startedAt = Date.now();
      let observation;
      try {
        observation = await realPort.probe(augmented, signal);
      } finally {
        fs.rmSync(workspace.root, { recursive: true, force: true });
      }
      const elapsedMs = Date.now() - startedAt;
      const leg = { key, legId: request.probeId, operationId: request.operationId, elapsedMs, exitCode: observation.exitCode };
      for (const counter of counters) {
        counter.spawns += 1;
        counter.elapsedMs += elapsedMs;
        counter.legs.push(leg);
      }
      fs.writeFileSync(
        file,
        `${JSON.stringify({ key, agent, at: new Date().toISOString(), elapsedMs, request: { ...augmented, channels: { ...augmented.channels, environment: Object.keys(augmented.channels.environment) } }, observation }, null, 2)}\n`,
        'utf8',
      );
      log(
        `  ${colors.dim}wrote${colors.reset} ${path.relative(PROJECT_ROOT, file)} in ${(elapsedMs / 1000).toFixed(1)}s, exit ${observation.exitCode}`,
      );
      return observation;
    },
  };
}

/** A port that answers only from the cache and refuses to spend a call. */
function cacheOnlyPort(cacheDir, counters) {
  return {
    async probe(request) {
      const key = requestKey(request);
      const file = path.join(cacheDir, `${key}.json`);
      if (!fs.existsSync(file)) {
        throw new Error(`--from-cache is set and leg ${request.probeId} (${key}) has no cached observation; run without it first`);
      }
      const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const counter of counters) counter.hits += 1;
      return { ...cached.observation, probeId: request.probeId, interfaceId: request.interfaceId, operationId: request.operationId };
    },
  };
}

/** What one run of the legs cost, in the terms an operator planning the next one needs. */
function costReport(agent, stats, startedAt) {
  return {
    startedAt: new Date(startedAt).toISOString(),
    agent,
    spawnedLegs: stats.spawns,
    cachedLegs: stats.hits,
    spawnedWallClockSeconds: Math.round(stats.elapsedMs / 1000),
    totalWallClockSeconds: Math.round((Date.now() - startedAt) / 1000),
    legs: stats.legs,
  };
}

function writeArtifact(dir, name, value) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function runOneSuite(suite, options, stats) {
  const suiteStats = { spawns: 0, hits: 0, elapsedMs: 0, legs: [] };
  const outDir = path.join(options.out, slug(suite.id));
  // Keyed by agent as well as by suite. `requestKey` runs on the request before
  // the agent is merged into its option channel, so two vendors would otherwise
  // share one entry and a run against the second would be answered by the first
  // while reporting itself cached. The agent is what changes the answer, and the
  // environment values that also reach the child are credentials that must not
  // be hashed into a path.
  const cacheDir = path.join(options.cache, slug(options.agent), slug(suite.id));
  const interfaceIds = suite.contract.permittedInterfaces.map((iface) => iface.logicalId);
  const log = (line) => console.log(line);

  let port;
  if (options.fromCache) {
    port = cacheOnlyPort(cacheDir, [stats, suiteStats]);
  } else {
    port = cachingPort({
      makePort: async (request) => {
        const staged = stagedWorkspaceFor(suite.id, request);
        const { port: realPort } = await createProbePort({ cwd: staged.cwd, interfaceIds, artifacts: staged.artifacts });
        return { port: realPort, workspace: staged };
      },
      contract: suite.contract,
      cacheDir,
      agent: options.agent,
      force: options.force,
      counters: [stats, suiteStats],
      log,
    });
  }

  console.log(`\n${suite.id} ${colors.dim}(${suite.probes.length} probe(s), a staged workspace per spawned leg)${colors.reset}`);
  const suiteStartedAt = Date.now();

  if (options.preflightOnly) {
    const { preflightSuite } = require('./lib/probe-scoring');
    const verdicts = [];
    for (const probe of suite.probes) {
      const verdict = await preflightSuite(
        { ...suite, probes: [probe] },
        {
          port,
          runId: `live-${slug(suite.id)}-${probe.probeId}`,
          signal: AbortSignal.timeout(60 * 60_000),
        },
      );
      verdicts.push({ probeId: probe.probeId, passed: verdict.passed, preflight: preflightOutcome(verdict) });
      writeArtifact(outDir, `preflight-${probe.probeId}.json`, verdict);
      console.log(
        `  ${probe.probeId} ${probe.probeClass.padEnd(11)} pre-flight ${verdict.passed ? colors.green + 'passed' : colors.red + 'failed'}${colors.reset}`,
      );
    }
    // Only when a leg was actually spawned. A cached or `--from-cache` run spent
    // nothing, and overwriting the record of the run that did spend something
    // with a row of zeros loses the only thing this file is for.
    if (suiteStats.spawns > 0) writeArtifact(outDir, 'preflight-cost.json', costReport(options.agent, suiteStats, suiteStartedAt));
    return { suiteId: suite.id, preflightOnly: true, verdicts };
  }

  const outcome = await runSuite(suite, {
    port,
    runId: `live-${slug(suite.id)}`,
    modelSnapshot: 'stored-replay',
    signal: AbortSignal.timeout(60 * 60_000),
  });

  const problems = [];
  for (const entry of outcome.scored) {
    problems.push(...entry.schemaProblems, ...entry.preflightProblems);
    writeArtifact(outDir, `preflight-${entry.probe.probeId}.json`, entry.preflight);
    if (entry.result.artifact !== null) writeArtifact(outDir, `evidence-${entry.probe.probeId}.json`, entry.result.artifact);
    console.log(
      `  ${entry.probe.probeId} ${entry.probe.probeClass.padEnd(11)} pre-flight ${entry.preflight.passed ? 'passed' : 'failed'}  verdict ${String(entry.result.ladder.verdict)} (exit ${entry.result.ladder.exitCode})`,
    );
  }
  if (suiteStats.spawns > 0) writeArtifact(outDir, 'preflight-cost.json', costReport(options.agent, suiteStats, suiteStartedAt));
  const sealed = await sealContract(suite.contract);
  problems.push(...sealed.schemaProblems);
  writeArtifact(outDir, 'sealed-evaluator-brief.json', sealed.brief);
  writeArtifact(outDir, 'contract-strength.json', {
    contractId: suite.contract.contractId,
    vector: outcome.strength,
    probes: outcome.scored.map((entry) => ({
      probeId: entry.probe.probeId,
      probeClass: entry.probe.probeClass,
      preflightPassed: entry.preflight.passed,
      verdict: entry.result.ladder.verdict,
      exitCode: entry.result.ladder.exitCode,
      basis: entry.result.ladder.basis,
    })),
  });

  const rate = (entry) => (entry === null || entry.rate === null ? 'not measured' : `${(entry.rate * 100).toFixed(0)}%`);
  console.log(
    `  ${colors.dim}strength: defect ${rate(outcome.strength.defect)}, gameability ${rate(outcome.strength.gameability)}, zero-action ${rate(outcome.strength['zero-action'])}${colors.reset}`,
  );

  return {
    suiteId: suite.id,
    strength: outcome.strength,
    problems,
    verdicts: outcome.scored.map((entry) => ({
      probeId: entry.probe.probeId,
      passed: entry.preflight.passed,
      preflight: preflightOutcome(entry.preflight),
      verdict: entry.result.ladder.verdict,
      exitCode: entry.result.ladder.exitCode,
    })),
  };
}

/**
 * One pre-flight verdict in the spelling `test/probes/expected-strength.json`
 * records, so a live outcome and a recorded one compare as strings.
 */
function preflightOutcome(verdict) {
  if (verdict.passed) return 'passed';
  const failed = verdict.checks.filter((check) => check.outcome === 'failed').map((check) => check.kind);
  return `failed: ${[...new Set(failed)].sort().join(', ')}`;
}

/**
 * What this run measured, against what the corpus records it measures.
 *
 * The alternative was to exit 2 whenever any probe's pre-flight failed, which is
 * true of this corpus every time it runs: eight of its thirty-one probes cannot
 * be pre-flighted, for reasons `docs/explanation/eval-quality-command-adapter.md`
 * records and no leg TEA can author repairs. A script that is red on every run
 * stops being read within a week, and then the day it means something is the day
 * nobody looks. That is the same defect as a declaration nothing enforces,
 * arriving from the other direction.
 *
 * So the comparison is against the baseline, which is the idiom
 * `test/contracts/expected-status.json` and `test/probes/expected-strength.json`
 * already use everywhere else here: a recorded outcome, and movement in either
 * direction is the finding. A probe recorded as unable to pre-flight and unable
 * to pre-flight is not news. One that starts passing is, and so is one that
 * stops.
 */
function baselineDifferences(results, baseline) {
  const environment = [];
  const measured = [];
  for (const result of results) {
    const recorded = baseline[result.suiteId]?.probes;
    if (recorded === undefined) {
      environment.push(`${result.suiteId}: the baseline records no such suite`);
      continue;
    }
    for (const entry of result.verdicts ?? []) {
      const expected = recorded[entry.probeId];
      if (expected === undefined) {
        environment.push(`${result.suiteId} ${entry.probeId}: the baseline records no such probe`);
        continue;
      }
      if (entry.preflight !== expected.preflight) {
        environment.push(`${result.suiteId} ${entry.probeId}: pre-flight ${entry.preflight}, recorded ${expected.preflight}`);
      }
      // `--preflight-only` scores nothing, so there is no verdict to compare.
      if (entry.verdict !== undefined && entry.verdict !== expected.verdict) {
        measured.push(`${result.suiteId} ${entry.probeId}: verdict ${String(entry.verdict)}, recorded ${String(expected.verdict)}`);
      }
    }
  }
  return { environment, measured };
}

async function main(argv) {
  const options = parseArgs(argv);
  const selected = suites().filter((suite) => options.suiteIds.length === 0 || options.suiteIds.includes(suite.id));
  if (selected.length === 0) throw new Error(`no suite matches ${options.suiteIds.join(', ')}`);

  const stats = { spawns: 0, hits: 0, elapsedMs: 0, legs: [] };
  const results = [];
  const startedAt = Date.now();

  for (const suite of selected) {
    try {
      results.push(await runOneSuite(suite, options, stats));
    } catch (error) {
      console.error(`  ${colors.red}${suite.id} could not run:${colors.reset} ${error.message}`);
      results.push({ suiteId: suite.id, error: error.message });
    }
  }

  const cost = costReport(options.agent, stats, startedAt);
  if (cost.spawnedLegs > 0) writeArtifact(options.out, 'preflight-cost.json', cost);
  console.log(
    `\n${cost.spawnedLegs} leg(s) run and ${cost.cachedLegs} answered from cache, ${cost.spawnedWallClockSeconds}s spent in the model, ${cost.totalWallClockSeconds}s total.`,
  );
  console.log(`${colors.dim}artifacts under ${path.relative(PROJECT_ROOT, options.out)}${colors.reset}`);

  const failedToRun = results.filter((result) => result.error !== undefined);
  if (failedToRun.length > 0) return 2;
  const schemaProblems = results.flatMap((result) => result.problems ?? []);
  if (schemaProblems.length > 0) {
    console.error(`${colors.red}${schemaProblems.length} artifact(s) did not match their published schema:${colors.reset}`);
    for (const problem of schemaProblems) console.error(`   ${problem}`);
    return 2;
  }
  const { environment, measured } = baselineDifferences(results, JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')));
  if (environment.length > 0) {
    console.error(`\n${colors.red}${environment.length} pre-flight outcome(s) moved:${colors.reset}`);
    for (const line of environment) console.error(`   ${line}`);
    console.error(`\n${colors.dim}Read why before regenerating with: node test/test-probe-corpus.js --write${colors.reset}`);
    return 2;
  }
  if (measured.length > 0) {
    console.error(`\n${colors.red}${measured.length} verdict(s) moved:${colors.reset}`);
    for (const line of measured) console.error(`   ${line}`);
    return 1;
  }
  console.log(`${colors.green}every probe matched the outcome test/probes/expected-strength.json records${colors.reset}`);
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`${colors.red}contract strength could not run:${colors.reset} ${error.stack ?? error}`);
      process.exit(2);
    });
}

module.exports = { parseArgs, requestKey, stagedWorkspaceFor, validateArtifact };
