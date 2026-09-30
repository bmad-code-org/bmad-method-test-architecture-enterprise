---
title: 'Story 1.35: Judge a tool server that crashes mid-call'
type: 'feature'
created: '2026-09-30'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '3b136ab2'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** eval-quality's MCP adapter rejected a `tools/call` whose session ended before the server answered (the server exited or a signal ended it) with `port-failure`, and its `McpProbeObservation` had no field for how the session ended, so `tea-evaluate` stopped such an arm with exit 12. A crash mutation on an `mcp` interface could never be caught, where a command that crashes by a signal of its own is an observation its oracles judge.

**Approach:** eval-quality 4.4.0 (PR bmad-eval-quality#169, released by this story's coordinator) gives `McpProbeObservation` an optional signed `exitCode`, present only when the server's process ended the session after the handshake and before the answer, and carries it on the record's `exit-code` channel. The runtime records that observation (`isError` true, absent body, `exitCode`) as a command step records its exit code, and a signal from outside still stops the arm with exit 12. TeA's devDependency floor and peer floor rise to 4.4.0, with the engine check at start and end.

## Boundaries & Constraints

**Always:** The runtime records what the observation carries and computes no outcome (AD-1). An ended session is recorded with `responseStatus` 1, an absent `responseBody` and `exitCode` set to the observation's. `arm.js` treats the observation's `exitCode` with the rule a command step follows: `stoppedFromOutside(exitCode)` (a hang-up, interrupt, quit, kill or terminate signal) stops the arm with exit 12 and a message naming the tool step; any other code (a plain exit code, or a signal of the server's own such as an abort or segmentation fault) is recorded. The sealed-brief agent's bridge applies the same rule and its tool result carries `exitCode` for a recorded ended session. A server that cannot start, refuses its handshake, crosses a ceiling or writes a line that is no JSON-RPC message still stops the run with exit 12.

**Never:** Add an `infrastructureExitCodes` field to a tool-server registry entry (nothing needs it). Copy engine logic or compute a verdict in TeA. Change the gameability arm's degenerate-response shape. Pin the engine version below the floor the story raises.

## I/O & Edge-Case Matrix

| Scenario                              | Input / State                                                      | Expected Output / Behavior                                                                                             | Error Handling            |
| ------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Server exits 3 before answering       | mutation plants `crash: grade_answer`; oracle over `response-body` | observation with `exitCode` 3, record `responseStatus` 1, `exitCode` 3, absent body; preflight 0; mutated arm `caught` | N/A                       |
| Server ended by its own signal        | abort (`SIGABRT`, exit -6)                                         | recorded as an observation with `exitCode` -6                                                                          | N/A                       |
| Server ended by a signal from outside | `SIGKILL` (exit -9) or `SIGTERM` (-15)                             | arm stops, exit 12, message names the step and the code                                                                | `ArmError`                |
| Server cannot start / refuses         | handshake refused, missing `--policy`, hang past the ceiling       | exit 12 as before                                                                                                      | existing cases stay green |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/arm.js` (about 842): the `mcp` branch of `runArm` records the observation; add `exitCode` and the outside-signal stop. `stoppedFromOutside` (86).
- `cli/lib/evaluate/sealed-brief-agent.js` (about 592 to 620 and `callResult` 309): same recording and rule in `handleMcp`; the tool result text carries `exitCode` when present.
- `test/fixtures/evaluate-mcp/server/grader.js`: policy lines `crash: <tool>` (log the call, then `process.exit(3)` before answering) and `crash-signal: <tool>` (`process.kill(process.pid, 'SIGABRT')`); update its header comment.
- `test/test-evaluate-mcp.js`: pipeline-style case over a project variant whose M-001 plants the crash policy, with the exit-code oracle or signature the fixture needs; units for the arm rule (own signal recorded, outside signal stops); the existing handshake and hanging cases stay unchanged.
- `docs/reference/tea-evaluate-cli.md` (169, 170, 607 and the registry MCP passage): replace the limit sentence with how an ended session is recorded; the run section's crash sentence covers a tool server beside a command; mention the outside-signal rule.
- `package.json` (`peerDependencies` floor `>=4.3.0` to `>=4.4.0`), `package-lock.json`; `CHANGELOG.md` `## [Unreleased]`.
- The interaction plan's oracle over `exit-code` needs `contract.json` support for an mcp operation only in the variant the test writes; the committed fixture's contract stays as it is unless the case needs the committed one.

## Tasks & Acceptance

**Execution:**

- [ ] `arm.js`, `sealed-brief-agent.js` -- record the ended session, stop on an outside signal -- AC 1, 2
- [ ] `grader.js`, `test-evaluate-mcp.js` -- crash mutation case, own-signal and outside-signal units -- AC 1, 2
- [ ] docs, CHANGELOG, `package.json`, lockfile, `epics.md` and `test-design-epic-1.md` amendments -- AC 3

**Acceptance Criteria:**

- Given eval-quality 4.4.0 and a mutation of the MCP fixture's server that makes `grade_answer` exit before it answers, when `tea-evaluate preflight` and `run` run over the fixture, then the mutated arm's step is recorded as an observation carrying the ended session on the record's `exit-code` channel, preflight exits 0 and the mutated arm resolves `caught`; projecting the ended session away, so the step stops the arm, makes preflight exit 12.
- Given a server that cannot start, refuses its handshake or crosses a ceiling, then the run still stops with exit 12 and the existing cases stay green; recording a refused handshake as an observation turns the handshake case red.
- Given the reference, when it is read, then it states how an ended session is recorded and no longer holds Story 1.10's limit sentence.

## Verification

**Commands:**

- `npm test` -- expected: green (about 10 minutes)
- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.evaluateTarget !== 'function') process.exit(1)"` -- expected: exit 0
- `npm run test:release-metadata` -- expected: green

## Implementation Notes

- `cli/lib/evaluate/arm.js` `runArm`, `mcp` branch: an observation whose `exitCode` is a number is a session the server's own process ended after the handshake and before it answered (eval-quality's `McpProbeObservation.exitCode`). When `stoppedFromOutside(exitCode)` holds, the arm stops with an `ArmError` (`error.steps = steps`, as the command branch sets it) reading "the <label> arm's step <stepId> ended the tool server's session with a signal from outside it (exit code <code>): the target could not run". Any other code is recorded through `recordObservation` with `exitCode: observation.exitCode ?? null`, beside `responseStatus` 1 and an absent body that the existing `isError` and `bodyValue` lines already produce. An answered call records `exitCode: null`. The `mcp` entry keeps no `infrastructureExitCodes`, and the check runs only on a numeric code, since `stoppedFromOutside` reads an absent code as "no code at all". The header comment states the rule.
- `cli/lib/evaluate/sealed-brief-agent.js`: `handleMcp` applies the same rule (`infrastructure ??=` with the message "the evaluator's call <id> ended the tool server's session with a signal from outside it (exit code <code>): the target could not run", so the trial yields no record and the run exits 12 once the agent ends, as for a command call) and records `exitCode`; `callResult` adds `exitCode` to the tool result JSON only when the observation carries one, so the agent reads how the session ended and an answered call's result is byte for byte what it was.
- `test/fixtures/evaluate-mcp/server/grader.js`: policy line `crash: <tool>` logs the call and exits 3 before answering; `crash-signal: <tool> [SIGNAL]` logs the call and kills the process with `SIGNAL` (`SIGABRT` when none is named). The optional signal name lets one fixture drive the outside-signal case end to end (`SIGKILL`); the header comment lists both lines. The stub MCP agent needed no case: the bridge units drive `bridgeRouter` directly with a port that answers the ended session.
- `test/test-evaluate-mcp.js`: `checkCrashingServer` builds a variant (`useCrashMutation`) whose M-001 plants `crash: grade_answer` and moves the oracle (`/interactions/grade-run/exit-code` equals `null`, so the clean arm holds and the ended session violates it), the defect signature (`observableChannel: 'exit-code'`, predicate over `/interactions/observed/exit-code`) and the manifestation witness (`manifest-crash`, exit code 3) onto the `exit-code` channel, the only channel an ended session fills (its body is absent). It asserts `check` 0, `preflight` 0 with the manifestation leg recorded as `{kind: 'mcp', isError: true, result: absent, exitCode: 3}` in the mutated workspace, `run` 0, each mutated record `responseStatus` 1, `responseBody` null, `exitCode` 3, a finding of O-001 and one server call per mutated trial in the log, each clean record answered (`responseStatus` 0, `exitCode` null, no finding), and `score` votes `passed-clean-control` and `caught`. A variant with `crash-signal: grade_answer` records `exitCode` -6 in each mutated trial; one with `crash-signal: grade_answer SIGKILL` exits 12 naming the signal. `checkUnits` adds arm units (a plain exit, a zero exit, `SIGABRT` and `SIGSEGV` recorded; `SIGHUP`, `SIGINT`, `SIGQUIT`, `SIGKILL` and `SIGTERM` stop with an `ArmError` naming the step and the code and carrying `steps`) and the same two rules through `bridgeRouter` (recorded with the code in the tool result, or the router's `infrastructure()` set; an answered call carries no `exitCode`). `checkReferenceRecordsEndedSession` reads the reference (AC 3). The handshake-refused and hanging-server cases are untouched. The header comment lists the new cases.
- Docs: `docs/reference/tea-evaluate-cli.md` replaces the limit paragraph in the tool-server passage (record shape, the `exit-code` channel, `observableChannel`, the outside-signal rule, what still exits 12) and the run section's crash sentence (a tool server beside a command). `CHANGELOG.md` `### Changed` carries the entry. `epics.md` and `test-design-epic-1.md` are amended in place, dated 2026-09-30, for the exit-code channel, the outside-signal rule and the grader's policy lines.
- Departures from the plan text. The plan says the record carries the ended session on "the channel eval-quality's record names": it is `exit-code`, which eval-quality 4.4.0 (PR #169) makes reachable for an `mcp` operation. The plan's engine text says the observation carries "the server's exit code or the signal that ended it"; the engine carries one signed `exitCode` (a signal is its number made negative), so a single rule serves both. The outside-signal stop is an addition the frozen section already names.
- Review round 1 added `cli/lib/evaluate/confinement.js` `confinedMcpMechanism`: under Bubblewrap the engine reports the status of the process it launched, which is Bubblewrap's (`128 + n` for a signal `n`), so a confined server's abort read 134 and a kill from outside read 137 (a plain exit, recorded as the target's behavior). The mechanism now reads the status file the shim leaves, as `confinedCommandMechanism` does, for a session that ended: a recorded signal becomes the signal's number negated, a plain exit keeps its code and a shim that never ran is a `ConfinementError`. An answered call has no exit and its status is only removed. `test-evaluate-run.js` holds the four cases as units (Bubblewrap is not available on macOS) and `test-evaluate-mcp.js` adds confined end-to-end cases (an abort recorded as -6, a kill from outside exit 12), which run under Seatbelt here and Bubblewrap on Linux CI.
- Skill gate: `references/oracles.md` line 46 gained one sentence (an MCP step's `/interactions/<step>/exit-code` holds the signed code when the server's process ended the session before answering, `null` on an answered call), made through `/bmad-workflow-builder` Edit, headless, on `src/workflows/testarch/bmad-testarch-evaluate/` only (customization resolved with no extra gates, memlog entry appended, no commit). `quick_validate.py`, `prepass-prompt-metrics.py`, `prepass-workflow-integrity.py` and `scan-scripts.py` report no issue; `scan-path-standards.py` reports the 14 findings that predate this change (none in the edited file). The one-sentence edit is not an Analyze run. `test:evaluate-guidance` holds the sentence under `## Exact checks and evidence pointers`. AD-17 module validation does not apply: no registration file changed.
- Header comments that stated the old limit now match the code: `arm.js`, `sealed-brief-agent.js` and `records.js`.
- Not built, on purpose: no `infrastructureExitCodes` for a tool-server entry (frozen Never), no change to the gameability arm's degenerate response. The coordinator raised the peer floor to `>=4.4.0` in `package.json` and `package-lock.json` after releasing eval-quality 4.4.0 (PR #169, minor release), and updated the install hint in `cli/lib/evaluate/engine.js` and the reference's requirements line.

## Revert observations

Each check is exercised once: undo the change locally, run the named script, restore the file byte for byte from a saved copy (`cmp` confirmed each restore).

- AC 1, dropping the `exitCode` recording in `arm.js` (`exitCode: observation.exitCode ?? null` removed): `node test/test-evaluate-mcp.js` fails 8 of 199 checks, among them the four arm units (`a tool server ended by a plain exit was recorded as ...` with `exitCode` null) and `preflight over a server that exits mid-call exited 11; expected 0` ("the mutated arm did not fail (held)": with no code on the record the exit-code oracle holds).
- AC 1, projecting the ended session away so the step stops the arm (`if (endedSession)` in place of `if (endedSession && stoppedFromOutside(...))`): 8 of 199 fail, among them `preflight over a server that exits mid-call exited 12; expected 0` ("the mutated arm could not run") and the arm units for a plain exit, a zero exit, `SIGABRT` and `SIGSEGV`, which stopped the arm.
- AC 1, dropping the outside-signal stop in `arm.js` (`if (false)`): 6 of 217 fail, the five arm units (`SIGHUP` to `SIGTERM`: no `ArmError`) and `a server killed from outside: run exited 0; expected 12`.
- AC 1, the same two directions for the sealed-brief agent's bridge (`handleMcp`): dropping the stop fails 2 of 217 (`a bridge call to a server ended by SIGKILL from outside left the stop null`, and `SIGTERM`); stopping on any ended session fails 2 (the plain exit and the own abort left unrecorded and the run stopped); dropping `exitCode` from the tool result fails 2 (the result carries none); dropping it from the recorded observation fails 2.
- AC 2, recording a refused handshake as an observation (a temporary catch in `hostEnvironmentPort` turning the port fault "the server refused the initialize handshake" into an `mcp` observation with `exitCode` 1): 12 of 217 fail, among them `a server refusing its handshake: run exited 11; expected 12` and `a handshake refusal quoting a secret JSON escapes kept the cause null`. The hanging-server case is unchanged and was green throughout every other revert.
- AC 3, Story 1.10's limit sentence restored to the tool-server passage: `checkReferenceRecordsEndedSession` fails 2 of 217 (`the reference still holds Story 1.10's limit` for "never caught on an `mcp` interface" and "has no field for a session that ended mid-call"). The run section's crash sentence restored to "a tool server that crashes during a call is a target that could not run": 2 fail (`the run section's crash sentence does not cover a tool server beside a command` and the limit).
- Review round 1, the confined mechanism drops the signal mapping (`return result`): `node test/test-evaluate-run.js` fails 2 of 543 (`a confined tool server ended by a signal of its own (SIGABRT) reads {"isError":true,"exitCode":134}; expected -6`, and SIGKILL 137 for -9).
- Review round 1, the guide's sentence removed from `oracles.md`: `test:evaluate-guidance` fails 1 (`oracles.md` lacks the sentence's opening marker).
- Final review round 1, a server that cannot start (the registry's `targetArgs` drop `--policy=`): a temporary wrapper in `registry.js` catching the mechanism's error and returning an ended session (`{ isError: true, exitCode: 2 }`) turns the new `checkServerThatCannotStart` case red (`run exited 11; expected 12` and the missing "exited during initialize"), with the handshake and hanging-server cases red beside it (9 of 226 fail). The engine owns the start-and-handshake boundary; TeA's only hold on it is that it lets the engine's error through, which the mutation breaks. The file was restored from a saved copy and `git diff` shows it unchanged.

## Gates

- Run in the last state of the tree, all green: `node test/test-evaluate-mcp.js` 222 checks, `test:evaluate-arms` 398, `test:evaluate-run` 543, `test:evaluate-boundaries` 306, `test:evaluate-check` 713, `test:evaluate-evaluators` 786, `test:evaluate-guidance`, `test:direction`, `docs:validate-links`, `lint`, `lint:md`, `format:check`, `test:doc-claims`, `test:doc-counts`, `test:release-metadata`.
- Engine check exit 0 and `node test/test-evaluate-mcp.js` (222 checks) pass against the published eval-quality 4.4.0, which the coordinator installed after the release (the worker's runs used a locally packed build of PR #169). The peer floor moved to `>=4.4.0` in `package.json` and `package-lock.json` with the install hint and the reference's requirements line; the `eval-quality` devDependency stays `latest`. On a 4.3.0 install a crash still exits 12.
- Unrun: a live evaluation run (none belongs to this story). The full `npm test` runs in the commit hook and in CI.

## Review

One adversarial subagent (Opus) read the working-tree diff against the frozen spec. Every finding was verified against the code.

Fixed:

- High: a tool server confined by Bubblewrap recorded the wrong code (see Implementation Notes); the unit and confined cases cover it.
- Low: the CHANGELOG entry said a server that "writes no JSON-RPC message" exits 12 (it says "a line that is no JSON-RPC message" now); the `arm.js`, `sealed-brief-agent.js` and `records.js` header comments; `oracles.md` steered a crash-mutation author away from the `exit-code` channel (one sentence added, guarded by the guidance test); a test comment promised a check on the mutated legs' calls (trimmed to the trials it asserts).

Skipped, with reason:

- High: the dev and peer floors to 4.4.0. The spec assigns it to the coordinator after the release; done by the coordinator once eval-quality 4.4.0 was published (see Gates).

## Final review round 1

Two Opus reviewers read the diff at 37435ac3. Every finding was verified against the code.

Fixed:

1. `confinedMcpMechanism` in `cli/lib/evaluate/confinement.js` blamed Bubblewrap for the exit code when the status file held no start mark. eval-quality 4.4.0 returns an `exitCode` only after a completed handshake, so the cause is unknown. The error now reads "the status file of the confined tool server <target> holds no start mark, so its exit code N cannot be told from ... Bubblewrap (bwrap)'s own", exit 12 stays, and the comment above it states only that the code may be Bubblewrap's own. The unit in `test/test-evaluate-run.js` is relabelled "a status file with no start mark" and asserts the message.
2. The comment in `test/test-evaluate-run.js` about the status a signal left reads "A tool-server call answered: it has no exit, so the runtime only removes the status a signal left."
3. `test/test-evaluate-mcp.js` gains `checkServerThatCannotStart`: a project whose registry `targetArgs` drop `--policy=` (the fixture's grader exits 2 before its handshake). It asserts `run` exits 12, the output holds "exited during initialize" and no `trial-sets.json` exists. The file's header lists the case. The revert observation is recorded above.
4. `epics.md`, Story 1.35's "Engine consumption" paragraph, carries the amendment on the signed `exitCode`, eval-quality 4.4.0 and the Bubblewrap signal read.
5. `test-design-epic-1.md`, Story 1.35: the Levels and Files line lists integration, unit and static and the three files; the cannot-start case joins the exit-12 row; rows for the outside-signal stop, the confined signal read and the `oracles.md` sentence are added.
6. `ARCHITECTURE-SPINE.md` line 110 carries the dated note that an ended session also carries its signed `exitCode` on the `exit-code` channel.

Skipped: none.
