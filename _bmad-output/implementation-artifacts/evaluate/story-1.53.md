---
title: 'Story 1.53: Bound an agent whose guardian is stopped'
type: 'bugfix'
created: '2026-10-02'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '11d98b2f28c7fce70c585975b7cfbdbd356e42b4'
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.52.md'
---

<frozen-after-approval reason="Owner gave GO for the Evaluate relay and Story 1.53">

## Intent

**Problem:** On POSIX, a guardian suspended by `SIGSTOP` cannot handle its leader lifeline closing. If the leader and supervisor are killed together, the agent and its child can continue indefinitely.

**Approach:** Establish an independent owner before the guardian starts the agent. The owner observes a kernel pipe held only by the leader and kills the guardian's process group when that pipe closes unexpectedly.

## Boundaries & Constraints

**Always:** Prove the failure through the real runner before the fix. Arm ownership before launching the agent. End the guardian, agent and ordinary child within 10 seconds of the simultaneous kill. Preserve normal reports, output, timeouts and Windows Job Object behavior. Fail closed if ownership cannot be armed.

**Never:** Depend on a stopped guardian's JavaScript callbacks, a process-tree snapshot after leader death, or a runtime download.

## I/O & Edge-Case Matrix

| Scenario      | Input / State                                   | Expected Output / Behavior                               | Error Handling                          |
| ------------- | ----------------------------------------------- | -------------------------------------------------------- | --------------------------------------- |
| Dual kill     | Guardian stopped; leader and supervisor killed  | Independent owner kills guardian group within 10 seconds | Runner reports transport failure        |
| Normal exit   | Agent and child running under an armed guardian | Existing agent result and output; no descendant survives | Owner exits after verified teardown     |
| Setup failure | Owner cannot arm before agent launch            | Agent never starts                                       | Runner reports controlled spawn failure |

</frozen-after-approval>

## Code Map

- `cli/lib/agent-supervisor.js`: `guard()` currently launches the POSIX agent immediately and relies on its own lifeline callback. `lead()` owns the guardian PID, its group and the supervisor lifeline. Add an isolated watchdog mode and a readiness handshake before `guard()` launches.
- `test/test-evaluate-preflight.js`: `checkSupervision()` has the real runner's dual-kill case. Reuse `startRunner`, PID discovery and cleanup; add a stopped-guardian case and a heading-scoped POSIX reference assertion.
- `docs/reference/tea-evaluate-cli.md`: `## tea-skill-runner` gives supervision guarantees and bounds. Name the independent owner and its 10-second descendant bound.
- `_bmad-output/implementation-artifacts/evaluate/sprint-status.yaml`: move Story 1.53 from backlog to in-progress, then done in this PR.
- `CHANGELOG.md`: add the POSIX supervision fix under `[Unreleased]`.

## Tasks & Acceptance

**Execution:**

- [x] `test/test-evaluate-preflight.js`: add the stopped-guardian real-runner reproduction with bounded waits and cleanup; observe an agent or child survive before the fix.
- [x] `cli/lib/agent-supervisor.js`: arm an independent watchdog through a private pipe and readiness handshake before agent launch; handle setup failure and normal teardown.
- [x] `docs/reference/tea-evaluate-cli.md` and its preflight assertion: document and enforce the mechanism and bound.
- [x] `CHANGELOG.md`, sprint status and this outcome record: record the user-facing fix, verification and revert observations.

**Acceptance Criteria:**

- Given a POSIX guardian with an agent and child running, when the guardian receives `SIGSTOP` and its leader and supervisor receive `SIGKILL`, then all three PIDs end within 10 seconds of the dual kill; removing the independent owner leaves the agent group alive.
- Given the runner reference, when its independent ownership passage is removed, then the heading-scoped documentation assertion fails.
- Given the owner cannot arm, when the guardian is asked to run an agent, then the agent does not launch and the runner reports a setup failure.

## Implementation Notes

Owner approval for the relay covers this story. The implementation must keep a watchdog out of the guardian's process group and keep its lifeline descriptors out of the guardian and agent. Confirm the inherited descriptor layout before relying on pipe EOF.

The leader starts a detached watchdog with only its private stdin readiness pipe, stdout readiness reply, and ignored stderr. The guardian has a separate arm descriptor and waits for `armed` before spawning the agent. Its agent inherits only standard input, output, and error. The leader keeps the watchdog's stdin pipe; neither the guardian nor the agent receives it. A test checks that the watchdog and guardian have different process-group IDs. The watchdog kills the guardian group on unexpected EOF. On normal completion, the leader kills the group before releasing the watchdog. POSIX setup has a 10 s bound, with a separate supervisor startup allowance; the agent wall clock starts when its PID is reported.

The first real-runner run before the supervisor fix failed one of 308 checks: the stopped guardian, agent, and child all survived 10 s after the leader and supervisor received `SIGKILL`. The corrected real-runner suite passed all 316 checks. Injecting a watchdog startup failure produced runner exit 4 naming `POSIX watchdog setup failed`, and the marker proving agent launch stayed absent. Removing the new owner passage from an in-memory copy of the heading-scoped reference made its assertion false; the reference file remained unchanged.

The full `npm test` initially reached its final lint stage and found a redundant `.filter()` in the new PID discovery test plus a duplicate `Fixed` heading in the changelog. Both were corrected. The complete rerun exited 0. One earlier full run's preflight integrity fixture rejected concurrent repository edits made during that run; the clean rerun passed its 316 preflight checks. The story matrix was formatted without changing its wording.

After rebasing onto `c17cfafa87a0a02b77379eb5fac04f3a0fc463e5`, the changelog kept both this fix and Story 1.72's CI timing entry. The refreshed lockfile installs eval-quality 6.0.0. The rebased `test:evaluate-preflight` passed all 316 checks. Docs links/build, lint, markdown lint, format, release metadata, and the engine export check passed. The next full local `npm test` slot belongs to lane 3 PR #307.

Review added the 25 s POSIX setup reserve to the shared supervised-agent ceiling, with a further 10 s of runner overhead in the registry authoring rule. The supervisor and ceiling now read the setup constants from one module. The reference names four POSIX supervisor processes and the corrected bound. Tests locate the guardian by its command, measure descendant exits against one deadline independent of runner reporting, delay watchdog readiness to check the agent's full wall clock, and kill an armed watchdog to check group teardown. Focused gates passed after these fixes: preflight 324, authoring check 1,058, evaluators 575.

Final review of PR #309 found that the older dual-kill case still used first-child discovery, the documentation assertion could accept an unrelated `10 s`, and the normal-exit process-group check accepted an empty `ps` result. All three are corrected. The normal-exit fixture now stays alive through PID inspection. The focused preflight gate passed all 324 checks after this correction.

Two fresh Codex reviewers inspected the corrected process lifecycle and test cases. Both passed the focused review without a material finding. [PR #309](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/pull/309). Before merge, confirm its full CI gate, CodeRabbit disposition, current `origin/main`, and the stopped-guardian and normal-exit evidence. Revert observation: removing the watchdog leaves a stopped guardian's agent group alive after the dual kill, as the pre-fix real-runner reproduction demonstrated.

## Spec Change Log

## Review Triage Log

| Finding                               | Verdict and evidence                                                                                                                                            | Route |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Blind 1: registry ceiling             | medium. `check.js` reserves no POSIX setup time, so an admitted `maxElapsedMs` can expire before the agent receives its full timeout.                           | patch |
| Blind 2: version probe ceiling        | medium. `supervisedAgentCeilingMs` still adds only the 5 s backstop on POSIX, while watchdog setup can consume up to 25 s before the agent clock.               | patch |
| Blind 3: reported bound               | medium. The runner reference still promises wall clock plus 7 s even though POSIX setup now precedes that clock.                                                | patch |
| Blind 4: process count                | low. The reference calls the supervisor, leader and guardian three processes, then introduces a fourth POSIX watchdog. A direct prose correction is sufficient. | patch |
| Blind 5: guardian discovery           | medium. The stopped-guardian test takes the leader's first child; process listing can return the watchdog first.                                                | patch |
| Blind 6: descendant deadline          | medium. The test applies the descendant's 10 s bound after awaiting runner closure, so a slow report can falsely fail even when every PID ended on time.        | patch |
| Edge 1: guardian discovery            | medium. Independently confirms Blind 5; identify the guardian by command before sending `SIGSTOP`.                                                              | patch |
| Verification gap 1: delayed readiness | medium. No POSIX test delays watchdog readiness, so moving the timeout start back before launch would leave normal-startup cases green.                         | patch |
| Verification gap 2: watchdog death    | medium. No real-runner case kills an armed watchdog and checks transport failure plus guardian-group teardown.                                                  | patch |
| Final tests 1: older dual kill        | medium. The pre-existing dual-kill case still selects the leader's first child; with the new watchdog, it may signal or clean up the wrong process group.       | patch |
| Final tests 2: reference deadline     | medium. A generic `10 s` check can pass from POSIX setup or Windows prose after the POSIX descendant-bound sentence is removed.                                 | patch |
| Final tests 3: group identity         | medium. An empty `ps` result becomes group ID zero; unequal values can pass without proving both live processes are in separate groups.                         | patch |
| Final compliance: older dual kill     | medium. Independently confirms Final tests 1; find the guardian by command in the older case and use that PID for teardown.                                     | patch |

## Design Notes

The guardian is the group leader. A detached watchdog can hold no runner output descriptors, wait on a leader-only pipe, and send `SIGKILL` to the negative guardian PID on EOF. The guardian waits for a leader arm message. That order closes the gap between guardian spawn and owner readiness.

## Verification

**Commands:**

- `npm run test:evaluate-preflight`: passed, 324 checks after review fixes.
- `npm run test:evaluate-check`: passed, 1,058 checks after review fixes.
- `npm run test:evaluate-evaluators`: passed, 575 checks after review fixes.
- `npm run docs:validate-links` and `npm run docs:build`: passed.
- `npm run lint`, `npm run lint:md`, and `npm run format:check`: passed.
- `npm test`: complete corrected rerun passed with exit 0.
- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.evaluateTarget !== 'function') process.exit(1)"`: passed.
