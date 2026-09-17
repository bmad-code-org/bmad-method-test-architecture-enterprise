/**
 * The reusable multi-turn transcript-driving engine.
 *
 * TEA's eight existing suites each score exactly one agent invocation per
 * case, which is what has kept `bmad-teach-me-testing` — a live, multi-turn
 * teaching skill — permanently `deferred`: nothing can drive or record a
 * multi-turn exchange. `runTranscript` is that mechanism, stated once so
 * Story 6.11 can build on it rather than write its own: it runs N sequential
 * turns against `tea-transcript-runner` (cli/transcript-runner.js) in one
 * persistent workspace and hands back every turn's prompt, reply, and exit
 * code.
 *
 * Each turn is one existing-shaped single-invocation call, driven through
 * `probeCommand` and `test/lib/probe-targets.js`'s `tea-transcript-runner`
 * registration, so authorization, output-capping, and budget enforcement stay
 * identical to every other TEA runner call. What makes a *session* out of N
 * such calls is entirely this file: the workspace is the same directory for
 * every turn, so a turn's agent can read what an earlier turn left there, and
 * `buildTurnPrompt(turnIndex, priorTurns, workspace)` is the caller's own
 * callback for shaping turn N from what turns before it produced.
 *
 * This module knows nothing about what a session is *for*. It is kept that
 * way on purpose: the case this story proves it against is a trivial
 * three-turn scripted exchange (test/eval-transcript.js), and the case it
 * exists for is Story 6.11's real teaching session, which will supply its own
 * `buildTurnPrompt` and read its own meaning out of the turns this returns.
 */

'use strict';

const { createProbePort, hostEnvironment, observedText, probeCommandWithRetry, probeRequest } = require('./probe-targets');

/** The interface `test/lib/probe-targets.js` registers this engine's runner under. */
const TRANSCRIPT_INTERFACE = 'tea-transcript-runner';

/** Arbitrary within this engine: no eval-quality contract names an operation here (see test/contracts/README.md). */
const TRANSCRIPT_OPERATION = 'run-turn';

/**
 * The per-request option object one turn's call carries, everything but the
 * agent name, which the caller varies per turn only in the sense that every
 * turn of one session uses the same one.
 *
 * `timeoutMs` and (at the call site) `agent` are both documented optional,
 * with a stated fallback to the runner's own default. Each is included only
 * when actually given: an omitted `timeout-ms` sent as the literal text
 * "undefined" fails the runner's own `--timeout-ms` regex, a usage error, and
 * an omitted `agent` sent as the value `undefined` fails the request's own
 * schema validation before the runner ever starts. Leaving the key out
 * entirely is what lets `cli/transcript-runner.js`'s own commander defaults
 * (`DEFAULT_TIMEOUT_MS`, `DEFAULT_AGENT`) apply, the same as an operator who
 * never typed the flag.
 *
 * @param {object} runnerOptions
 * @returns {object}
 */
function turnOption({ agentCmd, agentArgs = [], envPass = [], model, timeoutMs }) {
  const option = {};
  if (timeoutMs !== undefined) option['timeout-ms'] = String(timeoutMs);
  if (agentCmd) option['agent-cmd'] = agentCmd;
  if (model) option.model = model;
  if (agentArgs.length > 0) option['agent-arg'] = [...agentArgs];
  if (envPass.length > 0) option['env-pass'] = [...envPass];
  return option;
}

/**
 * Run one multi-turn session: N sequential `tea-transcript-runner` calls in
 * one persistent workspace.
 *
 * Turns run strictly in order and never in parallel, because turn N's prompt
 * is built from what turns before it produced (`buildTurnPrompt`'s own
 * `priorTurns` argument) and because each turn's agent shares the workspace
 * with every other turn, so two turns writing to it at once would race.
 *
 * A turn whose call could not even be observed — the runner executable is
 * missing, the wall clock ran out, anything `probeCommand` reports as
 * `ok: false` — is recorded the same way a turn that ran and exited nonzero
 * is: the session stops there rather than running the next turn blind against
 * a reply that never arrived.
 *
 * @param {object} input
 * @param {string} input.workspace Absolute path to an existing, writable directory every turn's agent runs in.
 * @param {(turnIndex: number, priorTurns: object[], workspace: string) => string} input.buildTurnPrompt
 *   Called once per turn, before that turn's call, with every turn recorded so far.
 * @param {number} input.turnCount How many turns a complete session has. A stopped session may record fewer.
 * @param {object} input.runnerOptions
 * @param {string} [input.runnerOptions.agent] Agent adapter name; 'custom' requires `agentCmd`.
 * @param {string} [input.runnerOptions.agentCmd] Executable override for the 'custom' adapter.
 * @param {string[]} [input.runnerOptions.agentArgs] Extra vendor argv, repeatable.
 * @param {string[]} [input.runnerOptions.envPass] Environment variable names to forward into every turn's call.
 * @param {string} [input.runnerOptions.model] Model override.
 * @param {number} [input.runnerOptions.timeoutMs] Per-turn wall-clock timeout in milliseconds; defaults to the runner's own default.
 * @returns {Promise<{turns: Array<{turnIndex: number, prompt: string, reply: string|null, exitCode: number|null, artifacts: object|null, ok: boolean, failureClass?: string, reason?: string}>}>}
 */
async function runTranscript({ workspace, buildTurnPrompt, turnCount, runnerOptions = {} }) {
  if (typeof workspace !== 'string' || workspace.length === 0) {
    throw new Error('runTranscript requires a workspace; a session with no persistent directory shares nothing between its turns');
  }
  if (typeof buildTurnPrompt !== 'function') {
    throw new TypeError("runTranscript requires buildTurnPrompt(turnIndex, priorTurns, workspace) to build each turn's prompt");
  }
  if (!Number.isInteger(turnCount) || turnCount < 1) {
    throw new Error(`runTranscript requires a positive integer turnCount; got ${JSON.stringify(turnCount)}`);
  }

  const { agent, envPass = [] } = runnerOptions;
  const { port } = await createProbePort({
    cwd: workspace,
    interfaceIds: [TRANSCRIPT_INTERFACE],
    environmentKeys: { [TRANSCRIPT_INTERFACE]: envPass },
  });

  const turns = [];
  for (let turnIndex = 0; turnIndex < turnCount; turnIndex += 1) {
    const prompt = buildTurnPrompt(turnIndex, turns, workspace);
    const option = turnOption(runnerOptions);
    if (agent !== undefined) option.agent = agent;
    const result = await probeCommandWithRetry(
      port,
      probeRequest({
        probeId: `turn-${turnIndex + 1}`,
        interfaceId: TRANSCRIPT_INTERFACE,
        operationId: TRANSCRIPT_OPERATION,
        option,
        environment: hostEnvironment(TRANSCRIPT_INTERFACE, envPass),
        stdin: { kind: 'text', value: prompt },
      }),
      new AbortController().signal,
    );

    if (!result.ok) {
      turns.push({
        turnIndex,
        prompt,
        reply: null,
        exitCode: null,
        artifacts: null,
        ok: false,
        failureClass: result.failureClass,
        reason: result.reason,
      });
      break;
    }

    const { observation } = result;
    turns.push({
      turnIndex,
      prompt,
      reply: observedText(observation.stdout),
      exitCode: observation.exitCode,
      artifacts: observation.artifacts,
      ok: observation.exitCode === 0,
    });
    if (observation.exitCode !== 0) break;
  }

  return { turns };
}

module.exports = { runTranscript, TRANSCRIPT_INTERFACE, TRANSCRIPT_OPERATION };
