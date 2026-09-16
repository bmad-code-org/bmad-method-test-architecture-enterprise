/**
 * Proof that test/lib/transcript-harness.js's runTranscript actually drives a
 * multi-turn session and actually notices when one contradicts itself, before
 * test/eval-transcript.js is trusted to register the suite that depends on
 * it.
 *
 * Every check here spawns a real tea-transcript-runner process, through the
 * real probe port, against the real scripted stub — never a mock of
 * runTranscript's own internals — the same discipline
 * test/test-atdd-isolation.js applies to cli/lib/atdd-isolation.js: what a
 * contradictory or failing session actually does on this machine, not what
 * the code says it should do. No credential, no network, no model call.
 *
 * WHAT IS PROVEN
 *
 *   consistent session    a scripted responder whose every turn agrees with
 *                         itself completes all N turns, and the cross-turn
 *                         check holds
 *   cross-turn prompts     turn 2's prompt actually carries turn 1's own
 *                         reply, proving buildTurnPrompt's priorTurns
 *                         argument carries real content rather than an empty
 *                         shell
 *   contradictory session  a scripted responder whose last turn contradicts
 *                         turn 1 still completes all N turns, and the
 *                         cross-turn check fires and names the disagreement
 *                         rather than passing silently
 *   mid-session failure    a responder that exits nonzero on turn 2 stops the
 *                         session there: turn 3 is never run, and the failed
 *                         turn's exit code is recorded rather than dropped
 *
 * Usage: node test/test-transcript-harness.js
 * Exit codes: 0 every property held, 1 a property did not hold
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runTranscript } = require('./lib/transcript-harness');
const { failureClassForExit } = require('../cli/transcript-runner');
const { loadGroundTruth, makeBuildTurnPrompt, crossTurnHolds, sessionComplete, STUB_AGENT, RUN_TIMEOUT_MS } = require('./eval-transcript');

const colors = { reset: '[0m', red: '[31m', green: '[32m', dim: '[2m' };
let failures = 0;

function assert(condition, label, detail) {
  if (condition) {
    console.log(`  ${colors.green}✓${colors.reset} ${label}`);
    return;
  }
  failures += 1;
  console.log(`  ${colors.red}✗ ${label}${colors.reset}`);
  if (detail) console.log(`    ${colors.dim}${detail}${colors.reset}`);
}

/**
 * One scripted session, in a fresh persistent workspace, driven through the
 * real runner and the real stub, cleaned up after.
 *
 * STUB_TRANSCRIPT_MODE is set on this process's own environment and forwarded
 * per turn through `envPass`, the same mechanism an operator's own
 * `--env-pass` uses; this file is the only caller of the stub's modes other
 * than `consistent`, which test/eval-transcript.js's registered case also
 * drives.
 *
 * `runnerOptionsOverride` is merged over the default runner options, so a
 * caller can omit a key (by passing it as `undefined`) to prove the runner's
 * own default applies, or replace one (such as `envPass`) outright.
 */
async function runScripted(mode, turnCount, buildTurnPrompt, runnerOptionsOverride = {}) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), `tea-transcript-harness-${mode}-`));
  const previousMode = process.env.STUB_TRANSCRIPT_MODE;
  process.env.STUB_TRANSCRIPT_MODE = mode;
  try {
    return await runTranscript({
      workspace,
      buildTurnPrompt,
      turnCount,
      runnerOptions: {
        agent: 'custom',
        agentCmd: STUB_AGENT,
        envPass: ['STUB_TRANSCRIPT_MODE'],
        timeoutMs: RUN_TIMEOUT_MS,
        ...runnerOptionsOverride,
      },
    });
  } finally {
    if (previousMode === undefined) delete process.env.STUB_TRANSCRIPT_MODE;
    else process.env.STUB_TRANSCRIPT_MODE = previousMode;
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

async function main() {
  console.log('the multi-turn transcript engine, proven before test/eval-transcript.js registers it\n');

  const groundTruth = await loadGroundTruth();
  if (!groundTruth) {
    console.error(
      `${colors.red}no ground truth at test/fixtures/transcript-eval/ground-truth.json; nothing else can be proven${colors.reset}`,
    );
    process.exit(1);
  }
  const { turnCount } = groundTruth;
  const buildTurnPrompt = makeBuildTurnPrompt(turnCount);

  console.log('a consistent session');
  const consistent = await runScripted('consistent', turnCount, buildTurnPrompt);
  assert(
    sessionComplete(consistent.turns, turnCount),
    `all ${turnCount} turns complete`,
    JSON.stringify(consistent.turns.map((turn) => ({ turnIndex: turn.turnIndex, exitCode: turn.exitCode, ok: turn.ok }))),
  );
  const consistentCross = crossTurnHolds(consistent.turns, groundTruth);
  assert(consistentCross.holds, 'the cross-turn check holds on a session that agrees with itself', consistentCross.disagreement ?? '');

  console.log("\nturn 2's prompt carries turn 1's own reply");
  const turn1Reply = (consistent.turns[0]?.reply ?? '').trim();
  assert(turn1Reply.length > 0, 'turn 1 actually recorded a reply', JSON.stringify(consistent.turns[0]));
  assert(
    turn1Reply.length > 0 && (consistent.turns[1]?.prompt ?? '').includes(turn1Reply),
    "turn 2's prompt embeds turn 1's own reply, proving buildTurnPrompt's priorTurns argument carries real content",
    JSON.stringify(consistent.turns[1]?.prompt),
  );

  console.log('\na contradictory session');
  const contradictory = await runScripted('contradictory', turnCount, buildTurnPrompt);
  assert(
    sessionComplete(contradictory.turns, turnCount),
    `all ${turnCount} turns still complete; a contradiction is a content disagreement, not a process failure`,
    JSON.stringify(contradictory.turns.map((turn) => ({ turnIndex: turn.turnIndex, exitCode: turn.exitCode, ok: turn.ok }))),
  );
  const contradictoryCross = crossTurnHolds(contradictory.turns, groundTruth);
  assert(!contradictoryCross.holds, 'the cross-turn check fires rather than passing silently over a session that disagrees with itself');
  const lastReply = (contradictory.turns.at(-1)?.reply ?? '').trim();
  assert(
    typeof contradictoryCross.disagreement === 'string' &&
      contradictoryCross.disagreement.includes(groundTruth.establishedToken) &&
      contradictoryCross.disagreement.includes(lastReply),
    'the reported failure names both sides of the disagreement: what turn 1 established and what the last turn actually said',
    contradictoryCross.disagreement,
  );

  console.log('\na mid-session failure stops the session');
  const failing = await runScripted('fail-turn-2', turnCount, buildTurnPrompt);
  assert(
    failing.turns.length === 2,
    'the session stops right after the failing turn: it never runs turn 3 blind against a reply that never arrived',
    JSON.stringify(failing.turns.map((turn) => turn.turnIndex)),
  );
  assert(failing.turns[0]?.ok === true, 'turn 1 completed normally before the failure', JSON.stringify(failing.turns[0]));
  const failedTurn = failing.turns[1];
  assert(
    failedTurn !== undefined && failedTurn.ok === false,
    'the failed turn is recorded as not ok, a harness-level failure rather than one silently dropped',
    JSON.stringify(failedTurn),
  );
  assert(
    typeof failedTurn?.exitCode === 'number' &&
      failedTurn.exitCode !== 0 &&
      failureClassForExit(failedTurn.exitCode) === 'environment-transport',
    "the failed turn's own exit code is recorded on the turn, and classifies as the transport failure a nonzero vendor exit always is",
    JSON.stringify({ exitCode: failedTurn?.exitCode, failureClass: failureClassForExit(failedTurn?.exitCode ?? -1) }),
  );
  assert(
    typeof failedTurn?.reply === 'string' && failedTurn.reply.trim().length === 0,
    'the failed turn recorded no usable reply, since the responder printed its failure to stderr rather than stdout',
    JSON.stringify(failedTurn?.reply),
  );

  console.log("\nomitting agent and timeoutMs lets the runner's own defaults apply");
  const defaulted = await runScripted('consistent', turnCount, buildTurnPrompt, { agent: undefined, timeoutMs: undefined });
  assert(
    sessionComplete(defaulted.turns, turnCount),
    'a session that relies on the documented optional defaults for agent and timeoutMs still completes',
    JSON.stringify(defaulted.turns.map((turn) => ({ turnIndex: turn.turnIndex, exitCode: turn.exitCode, ok: turn.ok }))),
  );

  console.log('\na probe-level failure, not a process exit, also stops the session');
  // A malformed environment key name (a space is not a legal one) is refused
  // by the port's own request-schema validation before any process starts,
  // which is runTranscript's `!result.ok` branch rather than the `exitCode !==
  // 0` branch the fail-turn-2 case above exercises: no process ever ran, so
  // there is no exit code and no reply to report, only the failure class the
  // port itself gave the refusal.
  const malformedEnvName = 'STUB TRANSCRIPT MODE';
  const previousMalformed = process.env[malformedEnvName];
  process.env[malformedEnvName] = 'x';
  let malformed;
  try {
    malformed = await runScripted('consistent', turnCount, buildTurnPrompt, { envPass: ['STUB_TRANSCRIPT_MODE', malformedEnvName] });
  } finally {
    if (previousMalformed === undefined) delete process.env[malformedEnvName];
    else process.env[malformedEnvName] = previousMalformed;
  }
  assert(
    malformed.turns.length === 1,
    'the session stops after the first turn: the request itself was refused before any process ran',
    JSON.stringify(malformed.turns),
  );
  const refusedTurn = malformed.turns[0];
  assert(refusedTurn?.ok === false, 'the refused turn is recorded as not ok', JSON.stringify(refusedTurn));
  assert(
    refusedTurn?.exitCode === null && refusedTurn?.reply === null,
    'a probe-level failure records no exit code and no reply at all, unlike a process that ran and exited nonzero',
    JSON.stringify(refusedTurn),
  );
  assert(
    typeof refusedTurn?.failureClass === 'string' && refusedTurn.failureClass.length > 0,
    'the turn carries the failure class the port itself reported for the refusal',
    JSON.stringify(refusedTurn?.failureClass),
  );

  console.log('');
  if (failures > 0) {
    console.log(`${colors.red}${failures} propert${failures === 1 ? 'y' : 'ies'} did not hold.${colors.reset}\n`);
    process.exit(1);
  }
  console.log(`${colors.green}every transcript-engine property held.${colors.reset}\n`);
}

main().catch((error) => {
  console.error(`${colors.red}${error?.stack ?? error}${colors.reset}`);
  process.exit(1);
});
