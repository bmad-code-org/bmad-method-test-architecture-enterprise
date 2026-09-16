/**
 * transcript eval harness.
 *
 * TEA's eight existing suites each score exactly one agent invocation per
 * case, so nothing can drive or record a multi-turn exchange, and
 * `bmad-teach-me-testing` — a live, multi-turn teaching skill — has stayed
 * permanently `deferred` for exactly that reason. This suite is not the
 * measurement of that skill: Story 6.11 is. This suite proves the reusable
 * engine that measurement will run on, `test/lib/transcript-harness.js`'s
 * `runTranscript`, against a trivial, fully scripted three-turn session, so
 * the mechanism is proven before anything real is built on it.
 *
 * WHY THIS SUITE'S CASE NEVER SPENDS A VENDOR CALL
 *
 * Every turn of this suite's one registered case is driven through
 * `--agent custom --agent-cmd test/fixtures/transcript-runner/stub-agent.js`,
 * hardcoded here regardless of the `--agent` flag `eval:all` was given. That is
 * deliberate: this suite proves harness plumbing, not skill behavior, so it
 * costs nothing and is 100% reproducible. `--agent` is still accepted and still
 * gates the pre-flight, because `eval:all` invokes every suite in its manifest
 * the same way and this harness's pre-flight has to react to `--agent-cmd` the
 * same way every sibling harness's does; it just never reaches the one call
 * this suite actually scores.
 *
 * WHAT IS MEASURED
 *
 *   crossTurnConsistencyRate  the fraction of repetitions whose last turn still
 *                             agrees with what turn 1 established, over a
 *                             scripted responder that always agrees with
 *                             itself. The suite this proves the mechanism for
 *                             has no room for a second metric: the cross-turn
 *                             check is the point, and test/test-transcript-harness.js
 *                             is what proves it actually fires against a
 *                             responder that does not agree with itself.
 *
 * NO EVAL-QUALITY CONTRACT, ORACLE, OR PROBE CORPUS
 *
 * Every other behavioral suite in this repository is expressed as an
 * eval-quality contract and checked by `test/test-contract-oracles.js`. This
 * one is not: it proves a mechanism, not a skill's behavior, against a
 * "trivial scripted session" (the acceptance criteria's own words), so plain
 * assertions are what `validateCorpus` and the scoring below use — the same
 * shape `test/test-atdd-isolation.js` uses for the property it proves, not the
 * contract machinery `test/eval-nfr.js` carries for the semantic judgment it
 * measures. `test/contracts/README.md` records why a contract exists at all;
 * this suite is the harness-proof case it does not need to answer.
 *
 * THREE MODES
 *
 *   --validate-only   Static. No process, no cost. Asserts the ground truth is
 *                     internally consistent and agrees with the stub's own
 *                     scripted replies.
 *   --preflight-only  The static checks, then: is the runner executable on
 *                     PATH, does it answer --version, does a built-in vendor
 *                     have a credential. Exits before any process runs the
 *                     scripted session. This is what `eval:all --preflight-only`
 *                     runs, and the argv the suite manifest declares as
 *                     preflightArgs.
 *   default           Drives the scripted session `--runs` times. Spends no
 *                     vendor call regardless of `--agent`; see above.
 *
 * Usage:
 *   node test/eval-transcript.js --validate-only
 *   node test/eval-transcript.js --preflight-only --agent codex
 *   node test/eval-transcript.js --agent claude --runs 2
 *   node test/eval-transcript.js --agent claude --json results/transcript.json
 *
 * Exit codes:
 *   0  the corpus is valid (--validate-only), the runner is ready
 *      (--preflight-only), or every repetition's session was cross-turn
 *      consistent
 *   1  a session disagreed with itself, or the corpus is inconsistent (a real
 *      result)
 *   2  the environment could not run the eval (nothing was measured): a
 *      missing credential or executable, a timeout, a transport error, or
 *      fewer completed repetitions than were declared
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { AGENT_ADAPTERS } = require('../cli/lib/agent-adapters');
const { failureClassForExit } = require('../cli/transcript-runner');
const { runTranscript } = require('./lib/transcript-harness');
const { loadSuiteManifest, suiteById } = require('./lib/suite-manifest');
const { contractVersionsFor } = require('./lib/contract-versions');
const { digestFiles, repositoryState, probeVersion, measured, suiteResultRecord, writeSuiteResult } = require('./lib/eval-record');
const { worstFailureClass, exitCodeForFailureClass } = require('./schema/eval-result');
const { PROBE_TIMEOUT_MS, boundedProbe } = require('./lib/bounded-probe');
const { nowMs, nowIso, elapsedMsSince } = require('./lib/clock');
const { targetProblems } = require('./lib/probe-targets');
const { readJson } = require('./lib/file-system-port');
const { SCRIPTS } = require('./fixtures/transcript-runner/stub-agent');

const PROJECT_ROOT = path.join(__dirname, '..');
const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'transcript-eval');
const GROUND_TRUTH = path.join(FIXTURE_ROOT, 'ground-truth.json');
const STUB_AGENT = path.join(__dirname, 'fixtures', 'transcript-runner', 'stub-agent.js');
const SUITE_ID = 'transcript';
const CASE_ID = 'consistent-three-turn-session';

/** The interface test/lib/probe-targets.js and test/lib/transcript-harness.js share. */
const TRANSCRIPT_INTERFACE = 'tea-transcript-runner';

// A scripted stub replies instantly; one minute is a generous backstop rather
// than a bound this suite ever approaches.
const RUN_TIMEOUT_MS = 60_000;

/**
 * What the runner is allowed to do, checked against the manifest's declaration
 * by tools/validate-eval-schemas.js the same way THRESHOLDS is.
 */
const RUNNER_CAPABILITIES = ['scoped-artifact-writes'];

/**
 * One threshold, named on the cross-turn check: the property this suite exists
 * to prove is that a session's last turn can be held against what its first
 * turn established. 1 because the scripted responder this suite always drives
 * is deterministic and always agrees with itself; a session that stopped
 * agreeing with itself would be this suite's own harness breaking, not a
 * judgment call.
 */
const THRESHOLDS = {
  crossTurnConsistencyRate: 1,
};

const colors = {
  reset: '[0m',
  red: '[31m',
  green: '[32m',
  yellow: '[33m',
  cyan: '[36m',
  dim: '[2m',
};

function fatal(code, message) {
  console.error(`${colors.red}eval: ${message}${colors.reset}`);
  process.exit(code);
}

function parseArgs(argv) {
  const agents = [];
  const agentArgs = [];
  const envPass = [];
  let runs = 1;
  let validateOnly = false;
  let preflightOnly = false;
  let agentCmd;
  let model;
  let jsonPath;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--agent': {
        const value = argv[index + 1];
        if (!value) fatal(2, '--agent requires a vendor name');
        agents.push(value);
        index += 1;
        break;
      }
      case '--runs': {
        runs = Number.parseInt(argv[index + 1] ?? '', 10);
        if (!Number.isInteger(runs) || runs < 1) fatal(2, '--runs requires a positive integer');
        index += 1;
        break;
      }
      case '--agent-cmd': {
        const value = argv[index + 1];
        if (!value) fatal(2, '--agent-cmd requires an executable path or name');
        agentCmd = value.includes('/') || value.includes(path.sep) ? path.resolve(value) : value;
        index += 1;
        break;
      }
      case '--agent-arg': {
        const value = argv[index + 1];
        if (value === undefined) fatal(2, '--agent-arg requires a value');
        agentArgs.push(value);
        index += 1;
        break;
      }
      case '--env-pass': {
        const value = argv[index + 1];
        if (!value) fatal(2, '--env-pass requires an environment variable name');
        envPass.push(value);
        index += 1;
        break;
      }
      case '--model': {
        model = argv[index + 1];
        if (!model) fatal(2, '--model requires a model name');
        index += 1;
        break;
      }
      case '--json': {
        jsonPath = argv[index + 1];
        if (!jsonPath) fatal(2, '--json requires a file path');
        index += 1;
        break;
      }
      case '--validate-only': {
        validateOnly = true;
        break;
      }
      case '--preflight-only': {
        preflightOnly = true;
        break;
      }
      default: {
        fatal(2, `unknown argument: ${arg}`);
      }
    }
  }
  if (agents.length === 0) agents.push('claude');
  if (agents.includes('custom') && !agentCmd) fatal(2, '--agent custom requires --agent-cmd');
  if (agents.includes('custom') && model) {
    fatal(2, '--model is not supported by --agent custom; pass the runner model through --agent-arg');
  }
  if (agents.length > 1 && (agentCmd || agentArgs.length > 0 || envPass.length > 0 || model)) {
    fatal(2, 'runner overrides require exactly one --agent; run separate commands for different runner configurations');
  }
  if (validateOnly && preflightOnly) fatal(2, '--validate-only and --preflight-only name different modes; pass one');
  return { agents, runs, validateOnly, preflightOnly, agentCmd, agentArgs, envPass, model, jsonPath };
}

/* -------------------------------------------------------------------------- */
/* Ground truth                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Parse ground-truth.json.
 *
 * @returns {Promise<object|null>} Null when the file is missing or unparseable.
 */
async function loadGroundTruth() {
  try {
    const read = await readJson(GROUND_TRUTH);
    return read.present ? read.value : null;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

/**
 * Static validation of the corpus: the shape a --validate-only run checks, and
 * what every other mode checks before it spends a run.
 *
 * Holds ground truth's `turns` table to the stub's own `SCRIPTS.consistent`
 * table rather than re-typing it: a change to one without the other is exactly
 * the corpus rotting test/contracts/README.md's discipline exists to catch,
 * stated here in plain assertions because this suite carries no contract.
 *
 * @param {object} groundTruth
 * @returns {string[]} Problems; empty when the corpus is consistent.
 */
function validateCorpus(groundTruth) {
  const problems = [];
  const turnCount = groundTruth?.turnCount;
  if (!Number.isInteger(turnCount) || turnCount < 2) {
    problems.push(`turnCount must be an integer of at least 2 (a single turn has no cross-turn check); got ${JSON.stringify(turnCount)}`);
    return problems;
  }

  if (typeof groundTruth.establishedToken !== 'string' || groundTruth.establishedToken.trim().length === 0) {
    problems.push('establishedToken is missing or empty, so nothing checks the cross-turn claim');
  }

  const check = groundTruth.crossTurnCheck ?? {};
  const validTurn = (value) => Number.isInteger(value) && value >= 1 && value <= turnCount;
  if (!validTurn(check.sourceTurn)) {
    problems.push(
      `crossTurnCheck.sourceTurn must be a turn number between 1 and turnCount (${turnCount}); got ${JSON.stringify(check.sourceTurn)}`,
    );
  }
  if (!validTurn(check.checkedTurn)) {
    problems.push(
      `crossTurnCheck.checkedTurn must be a turn number between 1 and turnCount (${turnCount}); got ${JSON.stringify(check.checkedTurn)}`,
    );
  }
  if (validTurn(check.sourceTurn) && check.sourceTurn === check.checkedTurn) {
    problems.push('crossTurnCheck.sourceTurn and checkedTurn name the same turn, so the check would compare a reply with itself');
  }

  for (let turn = 1; turn <= turnCount; turn += 1) {
    const declared = groundTruth.turns?.[String(turn)];
    const scripted = SCRIPTS.consistent[turn];
    if (typeof declared !== 'string' || declared.length === 0) {
      problems.push(`turns["${turn}"] is missing or empty`);
      continue;
    }
    if (scripted === undefined) {
      problems.push(
        `test/fixtures/transcript-runner/stub-agent.js's SCRIPTS.consistent has no reply for turn ${turn}, so this suite cannot drive it`,
      );
      continue;
    }
    if (declared !== scripted) {
      problems.push(
        `turns["${turn}"] has drifted from test/fixtures/transcript-runner/stub-agent.js's own SCRIPTS.consistent[${turn}]: ` +
          `ground truth says ${JSON.stringify(declared)}, the stub says ${JSON.stringify(scripted)}`,
      );
    }
  }

  if (typeof groundTruth.establishedToken === 'string') {
    for (const turn of [check.sourceTurn, check.checkedTurn].filter((value) => validTurn(value))) {
      const text = groundTruth.turns?.[String(turn)];
      if (typeof text === 'string' && !text.includes(groundTruth.establishedToken)) {
        problems.push(
          `turns["${turn}"] does not contain establishedToken ${JSON.stringify(groundTruth.establishedToken)}, ` +
            'so a consistent session could never pass its own cross-turn check',
        );
      }
    }
  }

  return problems;
}

/* -------------------------------------------------------------------------- */
/* Prompt                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Build this suite's `buildTurnPrompt(turnIndex, priorTurns, workspace)`
 * callback, closed over the session's declared turn count so the last turn can
 * ask for a final confirmation rather than a mid-session one.
 *
 * Turn 2 and onward embed the prior turn's own reply, which is what proves the
 * general engine's callback shape actually carries cross-turn content: the
 * scripted stub ignores prompt text (it answers by turn number alone), but a
 * real agent behind this same callback — Story 6.11's own — would not.
 *
 * Exported so test/test-transcript-harness.js drives the identical prompt
 * shape rather than a second, divergent copy of it.
 *
 * @param {number} turnCount
 * @returns {(turnIndex: number, priorTurns: object[]) => string}
 */
function makeBuildTurnPrompt(turnCount) {
  return function buildTurnPrompt(turnIndex, priorTurns) {
    if (turnIndex === 0) {
      return 'Turn 1 of this session: state the vault access code, plainly, so a later turn can refer back to it.';
    }
    const previous = priorTurns[turnIndex - 1];
    const closing =
      turnIndex === turnCount - 1
        ? 'Give your final confirmation of the vault access code, consistent with what you said in turn 1.'
        : 'Confirm you still agree with what you said in turn 1.';
    return [`Turn ${turnIndex + 1} of this session.`, `In your previous turn you said: "${(previous?.reply ?? '').trim()}"`, closing].join(
      '\n',
    );
  };
}

/* -------------------------------------------------------------------------- */
/* Scoring                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Whether a completed session's last checked turn still agrees with what its
 * source turn established, and the disagreement to report when it does not.
 *
 * Exported so test/test-transcript-harness.js scores its own contradictory and
 * consistent sessions the same way this suite scores its one registered case,
 * rather than restating the check.
 *
 * @param {object[]} turns Every recorded turn, in order.
 * @param {{establishedToken: string, crossTurnCheck: {sourceTurn: number, checkedTurn: number}}} groundTruth
 * @returns {{holds: boolean, token: string, source: object|undefined, checked: object|undefined, disagreement: string|null}}
 */
function crossTurnHolds(turns, groundTruth) {
  const token = groundTruth.establishedToken;
  const source = turns[groundTruth.crossTurnCheck.sourceTurn - 1];
  const checked = turns[groundTruth.crossTurnCheck.checkedTurn - 1];
  const sourceHas = typeof source?.reply === 'string' && source.reply.includes(token);
  const checkedHas = typeof checked?.reply === 'string' && checked.reply.includes(token);
  const holds = sourceHas && checkedHas;
  const disagreement = holds
    ? null
    : `turn ${groundTruth.crossTurnCheck.sourceTurn} established ${JSON.stringify(token)}, but turn ${groundTruth.crossTurnCheck.checkedTurn} said ${JSON.stringify((checked?.reply ?? '(no reply)').trim())}`;
  return { holds, token, source, checked, disagreement };
}

/**
 * Whether every declared turn of a session actually ran and exited 0.
 *
 * @param {object[]} turns
 * @param {number} turnCount
 * @returns {boolean}
 */
function sessionComplete(turns, turnCount) {
  return turns.length === turnCount && turns.every((turn) => turn.ok);
}

/**
 * The ids of the cases this suite scores: one trivial, always-consistent,
 * three-turn scripted session.
 *
 * tools/validate-eval-schemas.js checks the manifest's `caseCount` against the
 * length of this, the same way it checks its thresholds against THRESHOLDS.
 *
 * @returns {Promise<string[]>}
 */
async function caseIds() {
  return [CASE_ID];
}

/* -------------------------------------------------------------------------- */
/* Pre-flight                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Readiness for a suite whose one scored case always drives the bundled stub,
 * hardcoded regardless of --agent (see the header comment above). So this
 * checks the bundled stub's own reachability, unconditionally, rather than
 * iterating the caller's requested `agents` for a credential or an executable
 * that this suite's own run never touches: an operator missing a credential
 * for a vendor named on the command line is not an environment failure here,
 * unlike every sibling harness whose live run actually spends that vendor.
 *
 * The one exception is `--agent custom --agent-cmd <path>`, which is an
 * explicit override rather than a named built-in vendor, and is also the
 * exact shape `tools/validate-eval-schemas.js`'s generic pre-flight check
 * drives every suite through: a caller naming a specific executable that way
 * is asking whether that one answers, so it is checked too.
 */
function preflight({ agents, agentCmd }) {
  const problems = [];
  const report = (failureClass, message) => problems.push({ failureClass, message });

  for (const problem of targetProblems(PROJECT_ROOT, [TRANSCRIPT_INTERFACE])) report('environment-configuration', problem);

  for (const agent of agents) {
    if (!Object.hasOwn(AGENT_ADAPTERS, agent)) {
      report('environment-configuration', `unknown agent "${agent}"; expected one of ${Object.keys(AGENT_ADAPTERS).join(', ')}`);
    }
  }

  const probeVersionOrReport = (executable) => {
    const probe = boundedProbe(executable, ['--version']);
    if (probe.ok) return;
    if (probe.reason === 'failed') {
      report('environment-transport', `agent CLI "${executable}" failed its --version probe (exit ${probe.status})`);
    } else if (probe.reason === 'timeout') {
      report('environment-transport', `agent CLI "${executable}" did not answer --version within ${PROBE_TIMEOUT_MS}ms and was killed`);
    } else {
      report('environment-transport', `agent CLI "${executable}" is not on PATH (${probe.detail})`);
    }
  };

  probeVersionOrReport(STUB_AGENT);
  if (agents.includes('custom') && agentCmd) probeVersionOrReport(agentCmd);

  return { problems };
}

/* -------------------------------------------------------------------------- */
/* Reporting                                                                  */
/* -------------------------------------------------------------------------- */

const ratio = (numerator, denominator) => (denominator === 0 ? Number.NaN : numerator / denominator);
const pct = (value) => (Number.isNaN(value) ? '  n/a' : `${(value * 100).toFixed(0).padStart(3)}%`);

/** Write the machine-readable record when --json asked for one, then exit with the code the failure class carries. */
async function finish({ options, startedAt, mode, runners, suiteFailureClasses = [] }) {
  const failureClass = worstFailureClass([...runners.map((runner) => runner.failureClass), ...suiteFailureClasses]);
  const exitCode = exitCodeForFailureClass(failureClass);

  if (options.jsonPath) {
    let suite;
    try {
      suite = suiteById((await loadSuiteManifest(PROJECT_ROOT)).manifest, SUITE_ID);
    } catch (error) {
      console.error(`${colors.red}eval: ${error.message}${colors.reset}`);
      process.exit(2);
    }
    await writeSuiteResult(
      options.jsonPath,
      suiteResultRecord({
        generatedAt: await nowIso(),
        mode,
        suite,
        repository: repositoryState(PROJECT_ROOT),
        fixtureDigest: await digestFiles(PROJECT_ROOT, suite.fixtures),
        // A session's later turns are built from what earlier turns actually
        // replied (buildTurnPrompt's own priorTurns argument), so there is no
        // single fixed prompt to digest before a session runs, unlike every
        // single-invocation sibling suite. The full transcript of every turn
        // actually sent and received lives on the run's own console output
        // rather than in this field.
        promptDigest: null,
        cases: [{ id: CASE_ID, promptDigest: null }],
        runners,
        durationMs: await elapsedMsSince(startedAt),
        suiteFailureClasses,
        contractVersions: await contractVersionsFor(suite, PROJECT_ROOT),
      }),
    );
    console.log(`${colors.dim}result written to ${options.jsonPath}${colors.reset}`);
  }

  process.exit(exitCode);
}

/** The one runner record this suite ever produces: the hardcoded stub, never the requested agent. */
function runnerRecord(version, { expected, completed, measurements, durationMs, failureClass, failures }) {
  return {
    agent: 'custom',
    executable: STUB_AGENT,
    version: version ?? probeVersion(STUB_AGENT),
    model: null,
    parameters: {
      agentArgs: [],
      envPassNames: ['STUB_TRANSCRIPT_MODE'],
      timeoutMs: RUN_TIMEOUT_MS,
      promptTransport: 'stdin',
    },
    repetitions: { expected, completed },
    measurements,
    durationMs,
    usage: null,
    failureClass,
    failures,
  };
}

async function main() {
  const startedAt = await nowMs();
  const options = parseArgs(process.argv.slice(2));
  const { runs, validateOnly, preflightOnly } = options;
  const staticMode = validateOnly ? 'validate-only' : preflightOnly ? 'preflight-only' : 'live';

  console.log(`${colors.cyan}========================================`);
  console.log('tea transcript eval harness');
  console.log(`========================================${colors.reset}\n`);

  const groundTruth = await loadGroundTruth();
  if (!groundTruth) {
    console.error(`${colors.red}eval: ground truth at ${GROUND_TRUTH} is missing or not valid JSON${colors.reset}`);
    await finish({ options, startedAt, mode: staticMode, runners: [], suiteFailureClasses: ['environment-missing-artifact'] });
  }

  const problems = validateCorpus(groundTruth);
  if (problems.length > 0) {
    console.error(`${colors.red}the corpus is inconsistent:${colors.reset}`);
    for (const problem of problems) console.error(`  ${colors.red}✗${colors.reset} ${problem}`);
    console.error('');
    // An inconsistent corpus is a real finding about the repository, measured
    // without a model call, so it keeps the exit 1 the sibling harnesses give
    // the same case.
    await finish({ options, startedAt, mode: staticMode, runners: [], suiteFailureClasses: ['quality'] });
  }

  console.log(
    `${colors.green}✓${colors.reset} ${groundTruth.turnCount}-turn scripted session; ground truth agrees with the stub's own script`,
  );

  if (validateOnly) {
    console.log(`\n${colors.green}corpus valid; nothing measured (--validate-only).${colors.reset}\n`);
    await finish({ options, startedAt, mode: 'validate-only', runners: [] });
  }

  const { problems: readiness } = preflight(options);
  if (readiness.length > 0) {
    console.error(`${colors.red}eval pre-flight failed; nothing was measured:${colors.reset}`);
    for (const problem of readiness) console.error(`  - ${problem.message}`);
    console.error(`\n${colors.dim}A failed pre-flight is exit 2, never a 0% score.${colors.reset}`);
    await finish({
      options,
      startedAt,
      mode: staticMode,
      runners: [],
      suiteFailureClasses: readiness.map((problem) => problem.failureClass),
    });
  }
  if (preflightOnly) {
    console.log(`${colors.green}✓${colors.reset} the bundled stub answers --version; no vendor credential is needed`);
    console.log(`\n${colors.green}pre-flight only; nothing measured.${colors.reset}\n`);
    await finish({ options, startedAt, mode: 'preflight-only', runners: [] });
  }

  console.log(
    `${colors.dim}${runs} run(s) of the ${groundTruth.turnCount}-turn session, always against the bundled stub regardless of --agent${colors.reset}\n`,
  );

  // The registered case always drives the bundled stub, regardless of --agent:
  // it proves the transcript-harness engine's plumbing, not a skill's
  // behavior, so it costs nothing and is fully reproducible. Set once, read by
  // every turn's runAgent call through hostEnvironment/--env-pass.
  process.env.STUB_TRANSCRIPT_MODE = 'consistent';

  const buildTurnPrompt = makeBuildTurnPrompt(groundTruth.turnCount);
  let completed = 0;
  let consistent = 0;
  const failures = [];
  const lostClasses = [];

  for (let runIndex = 0; runIndex < runs; runIndex += 1) {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-transcript-eval-'));
    try {
      const { turns } = await runTranscript({
        workspace,
        buildTurnPrompt,
        turnCount: groundTruth.turnCount,
        runnerOptions: {
          agent: 'custom',
          agentCmd: STUB_AGENT,
          envPass: ['STUB_TRANSCRIPT_MODE'],
          timeoutMs: RUN_TIMEOUT_MS,
        },
      });

      if (!sessionComplete(turns, groundTruth.turnCount)) {
        const lost = turns.at(-1);
        const failureClass = lost?.failureClass ?? failureClassForExit(lost?.exitCode ?? -1);
        console.error(
          `  ${colors.red}run ${runIndex + 1}: turn ${(lost?.turnIndex ?? 0) + 1} did not complete (${lost?.reason ?? `exit ${lost?.exitCode}`})${colors.reset}`,
        );
        lostClasses.push(failureClass);
        continue;
      }

      completed += 1;
      const cross = crossTurnHolds(turns, groundTruth);
      if (cross.holds) {
        consistent += 1;
        console.log(`  ${colors.green}✓${colors.reset} run ${runIndex + 1}: every turn recorded, cross-turn check holds`);
      } else {
        failures.push(`run ${runIndex + 1}: ${cross.disagreement}`);
        console.log(`  ${colors.red}✗${colors.reset} run ${runIndex + 1}: ${cross.disagreement}`);
      }
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  }

  const measurements = { crossTurnConsistencyRate: measured(ratio(consistent, completed)) };
  console.log(`\n  ${colors.dim}────────${colors.reset}`);
  console.log(
    `  cross-turn consistency ${pct(measurements.crossTurnConsistencyRate ?? Number.NaN)}   (threshold ${pct(THRESHOLDS.crossTurnConsistencyRate)})`,
  );

  const runners = [];
  if (completed < runs) {
    const failureClass = worstFailureClass([...lostClasses, 'environment-incomplete-repetitions']);
    console.log(
      `\n  ${colors.red}${runs - completed} run(s) short of ${runs} declared repetitions; consistency is unmeasurable${colors.reset}\n`,
    );
    runners.push(
      runnerRecord(null, {
        expected: runs,
        completed,
        measurements,
        durationMs: await elapsedMsSince(startedAt),
        failureClass,
        failures: [...failures, `${runs - completed} run(s) short of ${runs} repetitions`],
      }),
    );
  } else {
    const belowThreshold = (measurements.crossTurnConsistencyRate ?? -1) < THRESHOLDS.crossTurnConsistencyRate;
    if (belowThreshold && failures.length === 0) failures.push('crossTurnConsistencyRate');
    if (failures.length > 0) console.log(`\n  ${colors.red}below threshold: ${failures.join('; ')}${colors.reset}\n`);
    else console.log(`\n  ${colors.green}all thresholds met${colors.reset}\n`);
    runners.push(
      runnerRecord(null, {
        expected: runs,
        completed,
        measurements,
        durationMs: await elapsedMsSince(startedAt),
        failureClass: failures.length > 0 ? 'quality' : 'none',
        failures,
      }),
    );
  }

  await finish({ options, startedAt, mode: 'live', runners });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`${colors.red}eval: ${error?.stack ?? error}${colors.reset}`);
    process.exit(2);
  });
}

module.exports = {
  parseArgs,
  loadGroundTruth,
  validateCorpus,
  makeBuildTurnPrompt,
  crossTurnHolds,
  sessionComplete,
  caseIds,
  RUNNER_CAPABILITIES,
  THRESHOLDS,
  SUITE_ID,
  CASE_ID,
  TRANSCRIPT_INTERFACE,
  STUB_AGENT,
  RUN_TIMEOUT_MS,
};
