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
 * or a pre-flight leg count moved. Fourteen of the 55 probes cannot be
 * pre-flighted, all of them `test-design`'s, and the baseline says so, so a
 * failure here is news and the baseline is what says so.
 */

'use strict';

/*
 * WHAT STILL REACHES `fs` DIRECTLY, AND WHY
 *
 * Two calls, neither a read of a file's contents: the `mkdir` that creates the
 * artifact directory, since the port writes bytes at a path and creates no
 * directories, which is the package's boundary; and the `rm` that removes a
 * staged workspace whose authorization was refused before the cache could take
 * it over.
 *
 * The staging, the leg cache and the per-leg workspace are the runtime's
 * (`cli/lib/evaluate/workspace.js`: `stageDirectories`, `cachingPort`,
 * `cacheOnlyPort`, `requestKey`); this harness keeps its TeA data, which
 * directories a suite's leg needs and how a leg is announced, and hands the
 * runtime `test/lib/file-system-port.js`'s reader and writer and
 * `test/lib/clock.js`, so every read of a file's contents and every artifact
 * write still goes through the port: the trace ground truth, each cached leg
 * observation, the recorded baseline, and the cost report, the sealed brief and
 * the verdict files this harness writes.
 *
 * What holds that is uneven, and the uneven half is worth stating. This file is
 * exposed only as `eval:contract-strength` and `eval:preflight`, neither of which
 * is in `npm test`, so `npm run test:file-system-port` cannot drive it the way it
 * drives the other harnesses. `stagedWorkspaceFor` is reached, because
 * `test/test-probe-corpus.js` calls it directly for every trace leg. The leg
 * cache, the baseline read and `writeArtifact` are reached only by a run that
 * spends model calls, so a substitution there would not be caught by the gate.
 */

const fs = require('node:fs');
const path = require('node:path');

const { refuseScriptedRecord } = require('./lib/eval-record');
const { nowMs, nowIso, elapsedMsSince } = require('./lib/clock');
const { cacheOnlyPort, cachingPort, requestKey, stageDirectories } = require('../cli/lib/evaluate/workspace');
const { loadEvalQuality, validateArtifact } = require('./lib/eval-quality-inputs');
const { createProbePort, readEnvironment } = require('./lib/probe-targets');
const {
  collectingSink,
  ladderExitCode,
  ladderVerdict,
  preflightDiagnostics,
  runSuite,
  sealContract,
  suites,
} = require('./lib/probe-scoring');
const { readJson, writeText } = require('./lib/file-system-port');
const ciHarness = require('./eval-ci');
const nfrHarness = require('./eval-nfr');
const testDesignHarness = require('./eval-test-design');
const traceHarness = require('./eval-trace');

const PROJECT_ROOT = path.join(__dirname, '..');
const REVIEW_FIXTURE_DIR = path.join('test', 'fixtures', 'test-review-eval');
const REVIEW_SKILL_DIR = path.join('src', 'workflows', 'testarch', 'bmad-testarch-test-review');
const DEFAULT_OUT = path.join(PROJECT_ROOT, 'test', 'eval-artifacts', 'contract-strength');
const DEFAULT_CACHE = path.join(PROJECT_ROOT, 'test', 'eval-artifacts', 'preflight-cache');
const BASELINE_PATH = path.join(PROJECT_ROOT, 'test', 'probes', 'expected-strength.json');
/**
 * The suites whose legs each audit one fixture set: the set's own harness
 * stages it, under the project root the leg's prompt names, and the artifact
 * paths that set makes true are the leg's.
 */
const SET_STAGED_SUITES = {
  trace: { harness: traceHarness, interfaceId: 'tea-trace-runner', artifactPaths: traceHarness.traceArtifactPaths },
  nfr: { harness: nfrHarness, interfaceId: 'tea-nfr-runner', artifactPaths: nfrHarness.nfrArtifactPaths },
  ci: { harness: ciHarness, interfaceId: 'tea-ci-runner', artifactPaths: ciHarness.ciArtifactPaths },
  'test-design': {
    harness: testDesignHarness,
    interfaceId: 'tea-test-design-runner',
    artifactPaths: testDesignHarness.designArtifactPaths,
  },
};

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

/** A directory name a cache path can carry, from a suite identifier that may hold a slash. */
const slug = (suiteId) => suiteId.replaceAll(/[^a-z\d]+/gi, '-');

/**
 * The run directory one suite's legs execute in, and the artifact paths that
 * directory makes true.
 *
 * A trace, NFR, CI or test-design leg is staged by its suite's own harness, so
 * the set arrives exactly as `npm run eval:trace`, `eval:nfr`, `eval:ci` or
 * `eval:test-design` stages it, under the
 * same project root its artifact override names. Which set that is comes out of
 * the leg's own prompt: each fixture set has its own project root and the prompt
 * is written against it, so a leg that traces the clean set asks for the clean
 * set. Staging one set for every leg is what made the trace contract's two
 * witness legs seeded runs, which is the scoping failure `seeded-faults-scoped`
 * reported against all three defect probes. NFR, CI and test-design legs ran in
 * an empty directory until Story 1.7's live run found every one of them
 * reporting that its skill and project were missing.
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
/**
 * How a suite's legs are staged, named in the leg cache's path. Change the
 * name whenever `stagedWorkspaceFor` changes what a suite's leg runs in.
 */
function stagingOf(suiteId) {
  if (SET_STAGED_SUITES[suiteId] !== undefined) return 'fixture-set-v1';
  return suiteId === 'test-review' ? 'review-tree-v1' : 'empty-v1';
}

async function stagedWorkspaceFor(suiteId, request) {
  const setStaged = SET_STAGED_SUITES[suiteId];
  if (setStaged !== undefined) {
    const groundTruth = await setStaged.harness.loadGroundTruth();
    if (groundTruth === null) throw new Error(`the ${suiteId} ground truth is missing or not JSON, so no ${suiteId} leg can be staged`);
    const prompt = String(request?.channels?.stdin?.value ?? '');
    const set = groundTruth.fixtureSets.find((entry) => prompt.includes(`\`{project-root}\`: \`${entry.projectRoot}\``));
    if (set === undefined) {
      throw new Error(`a ${suiteId} leg sent a prompt naming no fixture set project root, so there is no set to stage for it`);
    }
    const staged = await setStaged.harness.stageWorkspace(set);
    return {
      root: staged.dir,
      cwd: staged.dir,
      artifacts: { [setStaged.interfaceId]: setStaged.artifactPaths(set) },
    };
  }
  const staged = stageDirectories({
    from: PROJECT_ROOT,
    directories: suiteId === 'test-review' ? [REVIEW_FIXTURE_DIR, REVIEW_SKILL_DIR] : [],
    prefix: `tea-${slug(suiteId)}-preflight-`,
  });
  return { ...staged, artifacts: {} };
}

/**
 * The environment names this operation declares it accepts, with the values this
 * machine has for them.
 *
 * Read straight off the contract's own declaration. The authorization permits
 * the same names, because both derive from the command's one allowlist in
 * `cli/lib/runner-exit-codes.js`, so a leg built here carries no key the adapter
 * refuses.
 */
function permittedEnvironment(contract, operationId) {
  const operation = contract.permittedInterfaces.flatMap((iface) => iface.operations).find((entry) => entry.operationId === operationId);
  return readEnvironment(operation?.requestShape?.environment?.permittedKeys ?? []);
}

/** The runtime's cache log events as this harness prints them. */
function logLeg(event) {
  switch (event.event) {
    case 'cached': {
      console.log(`  ${colors.dim}cached${colors.reset} leg ${event.legId} (${event.key})`);
      break;
    }
    case 'running': {
      console.log(`  ${colors.yellow}running${colors.reset} leg ${event.legId} (${event.key})`);
      break;
    }
    case 'wrote': {
      console.log(
        `  ${colors.dim}wrote${colors.reset} ${path.relative(PROJECT_ROOT, event.file)} in ${(event.elapsedMs / 1000).toFixed(1)}s, exit ${event.exitCode}`,
      );
      break;
    }
    default:
  }
}

/** What one run of the legs cost, in the terms an operator planning the next one needs. */
function costReport(agent, stats, startedAt, totalElapsedMs) {
  return {
    startedAt: new Date(startedAt).toISOString(),
    agent,
    spawnedLegs: stats.spawns,
    cachedLegs: stats.hits,
    spawnedWallClockSeconds: Math.round(stats.elapsedMs / 1000),
    totalWallClockSeconds: Math.round(totalElapsedMs / 1000),
    legs: stats.legs,
  };
}

async function writeArtifact(dir, name, value) {
  // Every artifact this harness writes, which is the cost report, the sealed
  // evaluator brief and the verdict files. Under a fixture the cost report's
  // `startedAt` and `totalWallClockSeconds` are scripted, which is the artifact
  // class `refuseScriptedRecord` exists to prevent, and the rest are evidence on
  // the same run. This harness writes through its own writer rather than through
  // eval-record.js, so the guard is applied here too.
  refuseScriptedRecord(path.join(dir, name));
  // Stays on `fs`: the port writes bytes at a path and makes no directories.
  fs.mkdirSync(dir, { recursive: true });
  await writeText(path.join(dir, name), `${JSON.stringify(value, null, 2)}\n`);
}

async function runOneSuite(suite, options, stats) {
  const suiteStats = { spawns: 0, hits: 0, elapsedMs: 0, legs: [] };
  const outDir = path.join(options.out, slug(suite.id));
  // Keyed by agent as well as by suite. `requestKey` runs on the request before
  // the agent is merged into its option channel, so two vendors would otherwise
  // share one entry and a run against the second would be answered by the first
  // while reporting itself cached. The agent is what changes the answer, and the
  // environment values that also reach the child are credentials that must not
  // be hashed into a path. Keyed by how a leg is staged as well: the request
  // says nothing about the directory the leg ran in, so a change to staging
  // (the NFR and CI legs ran in an empty directory until Story 1.7) must move
  // the cache, or every leg would be answered by a run in the old workspace.
  const cacheDir = path.join(options.cache, slug(options.agent), slug(suite.id), stagingOf(suite.id));
  const interfaceIds = suite.contract.permittedInterfaces.map((iface) => iface.logicalId);

  let port;
  if (options.fromCache) {
    port = cacheOnlyPort({ cacheDir, counters: [stats, suiteStats], readJson, hint: '; --from-cache is set, so run without it first' });
  } else {
    port = cachingPort({
      makePort: async (request) => {
        const staged = await stagedWorkspaceFor(suite.id, request);
        try {
          const { port: realPort } = await createProbePort({ cwd: staged.cwd, interfaceIds, artifacts: staged.artifacts });
          return { port: realPort, workspace: staged };
        } catch (error) {
          // The caller cleans up the workspace it was handed, and a throw here
          // hands it none, so every refused authorization would leave a staged
          // fixture tree behind.
          fs.rmSync(staged.root, { recursive: true, force: true });
          throw error;
        }
      },
      // The live request carries the agent in its option channel and the
      // host's values for the environment the operation declares; the cache
      // key is taken before either is added.
      augment: (request) => ({
        ...request,
        channels: {
          ...request.channels,
          option: { ...request.channels.option, agent: options.agent },
          environment: { ...permittedEnvironment(suite.contract, request.operationId), ...request.channels.environment },
        },
      }),
      recordFields: { agent: options.agent },
      cacheDir,
      force: options.force,
      counters: [stats, suiteStats],
      log: logLeg,
      readJson,
      writeText,
      clock: { nowMs, nowIso, elapsedMsSince },
    });
  }

  console.log(`\n${suite.id} ${colors.dim}(${suite.probes.length} probe(s), a staged workspace per spawned leg)${colors.reset}`);
  const suiteStartedAt = await nowMs();

  if (options.preflightOnly) {
    const { preflightSuite } = require('./lib/probe-scoring');
    const verdicts = [];
    // The sink is filled here for the reason `runSuite` fills its own: the leg
    // count is reported nowhere else, and this is the arm that spawns real legs,
    // so an operator watching a paid run is the reader who most needs to see how
    // many were planned.
    const { sink, diagnostics } = collectingSink();
    for (const probe of suite.probes) {
      const runId = `live-${slug(suite.id)}-${probe.probeId}`;
      const verdict = await preflightSuite(
        { ...suite, probes: [probe] },
        {
          port,
          runId,
          signal: AbortSignal.timeout(60 * 60_000),
          sink,
        },
      );
      const { legs } = preflightDiagnostics(diagnostics, runId);
      verdicts.push({ probeId: probe.probeId, passed: verdict.passed, preflightLegs: legs, preflight: preflightOutcome(verdict) });
      await writeArtifact(outDir, `preflight-${probe.probeId}.json`, verdict);
      console.log(
        `  ${probe.probeId} ${probe.probeClass.padEnd(11)} ${legs ?? '?'} leg(s)  pre-flight ${verdict.passed ? colors.green + 'passed' : colors.red + 'failed'}${colors.reset}`,
      );
    }
    // Only when a leg was actually spawned. A cached or `--from-cache` run spent
    // nothing, and overwriting the record of the run that did spend something
    // with a row of zeros loses the only thing this file is for.
    if (suiteStats.spawns > 0)
      await writeArtifact(
        outDir,
        'preflight-cost.json',
        costReport(options.agent, suiteStats, suiteStartedAt, await elapsedMsSince(suiteStartedAt)),
      );
    return { suiteId: suite.id, preflightOnly: true, verdicts };
  }

  const outcome = await runSuite(suite, {
    port,
    runId: `live-${slug(suite.id)}`,
    modelSnapshot: 'stored-replay',
    signal: AbortSignal.timeout(60 * 60_000),
  });
  // The published verdict vocabulary, from the barrel this run already resolved,
  // because `ladderExitCode` holds both sides of its comparison against it.
  const { VERDICTS } = await loadEvalQuality();

  const problems = [];
  for (const entry of outcome.scored) {
    problems.push(...entry.schemaProblems, ...entry.preflightProblems);
    await writeArtifact(outDir, `preflight-${entry.probe.probeId}.json`, entry.preflight);
    if (entry.result.artifact !== null) await writeArtifact(outDir, `evidence-${entry.probe.probeId}.json`, entry.result.artifact);
    console.log(
      `  ${entry.probe.probeId} ${entry.probe.probeClass.padEnd(11)} ${entry.diagnostics.legs ?? '?'} leg(s)  pre-flight ${entry.preflight.passed ? 'passed' : 'failed'}  verdict ${String(ladderVerdict(entry.result.ladder, VERDICTS))} (exit ${ladderExitCode(entry.result.ladder, VERDICTS)})`,
    );
  }
  if (suiteStats.spawns > 0)
    await writeArtifact(
      outDir,
      'preflight-cost.json',
      costReport(options.agent, suiteStats, suiteStartedAt, await elapsedMsSince(suiteStartedAt)),
    );
  const sealed = await sealContract(suite.contract);
  problems.push(...sealed.schemaProblems);
  await writeArtifact(outDir, 'sealed-evaluator-brief.json', sealed.brief);
  await writeArtifact(outDir, 'contract-strength.json', {
    contractId: suite.contract.contractId,
    vector: outcome.strength,
    probes: outcome.scored.map((entry) => ({
      probeId: entry.probe.probeId,
      probeClass: entry.probe.probeClass,
      preflightPassed: entry.preflight.passed,
      preflightLegs: entry.diagnostics.legs,
      verdict: ladderVerdict(entry.result.ladder, VERDICTS),
      exitCode: ladderExitCode(entry.result.ladder, VERDICTS),
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
      preflightLegs: entry.diagnostics.legs,
      verdict: ladderVerdict(entry.result.ladder, VERDICTS),
      exitCode: ladderExitCode(entry.result.ladder, VERDICTS),
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
 * true of this corpus every time it runs: fourteen of its 55 probes cannot be
 * pre-flighted, for reasons `docs/explanation/eval-quality-command-adapter.md`
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
 *
 * The leg count is compared on the same terms and in the same class. The plan is
 * a pure function of the contract and the probes, which the live arm and the
 * deterministic gate share, so the number here is guaranteed comparable to the
 * recorded one, and a live run whose sink stopped being filled reports `null`
 * against a recorded integer rather than printing a bare `?` and passing.
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
      if (entry.preflightLegs !== expected.preflightLegs) {
        environment.push(
          `${result.suiteId} ${entry.probeId}: pre-flight planned ${String(entry.preflightLegs)} leg(s), recorded ${String(expected.preflightLegs)}`,
        );
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
  const selected = (await suites()).filter((suite) => options.suiteIds.length === 0 || options.suiteIds.includes(suite.id));
  if (selected.length === 0) throw new Error(`no suite matches ${options.suiteIds.join(', ')}`);

  const stats = { spawns: 0, hits: 0, elapsedMs: 0, legs: [] };
  const results = [];
  const startedAt = await nowMs();

  for (const suite of selected) {
    try {
      results.push(await runOneSuite(suite, options, stats));
    } catch (error) {
      console.error(`  ${colors.red}${suite.id} could not run:${colors.reset} ${error.message}`);
      results.push({ suiteId: suite.id, error: error.message });
    }
  }

  const cost = costReport(options.agent, stats, startedAt, await elapsedMsSince(startedAt));
  if (cost.spawnedLegs > 0) await writeArtifact(options.out, 'preflight-cost.json', cost);
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
  // Named rather than dereferenced blind: baselineDifferences indexes the
  // baseline by suite id, and null[suiteId] throws a TypeError that says
  // nothing about which file was missing.
  const baselineRead = await readJson(BASELINE_PATH);
  if (!baselineRead.present) {
    console.error(
      `${colors.red}${path.relative(PROJECT_ROOT, BASELINE_PATH)} is missing, so no baseline comparison can run${colors.reset}`,
    );
    return 2;
  }
  const { environment, measured } = baselineDifferences(results, baselineRead.value);
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

module.exports = {
  baselineDifferences,
  cachingPort,
  parseArgs,
  requestKey,
  stageDirectories,
  stagedWorkspaceFor,
  stagingOf,
  validateArtifact,
};
