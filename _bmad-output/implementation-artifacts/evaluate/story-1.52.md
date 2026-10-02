---
title: 'Story 1.52: Stop agent descendants on Windows'
type: 'bugfix'
created: '2026-10-02'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '214e1e70ee76ad72a2839592f0f69ba4359e3e29'
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.28.md'
---

<frozen-after-approval reason="Owner gave GO for the Evaluate relay and Story 1.52">

## Intent

**Problem:** On Windows the guardian kills only the direct agent. A child it started can survive both a normal agent exit and a simultaneous leader and supervisor kill.

**Approach:** Give the guardian and all ordinary descendants one Windows Job Object with kill-on-close ownership before starting the agent. Prove both failures through the real runner on Windows.

## Boundaries & Constraints

**Always:** Fail closed if the job cannot be established. Preserve the runner's report and output behavior. Assert the direct agent and child PIDs end within a documented bound. Run the Windows integration in CI.

**Never:** Rely on a process-tree snapshot after the agent exits. Alter the POSIX process-group path. Require a precompiled binary downloaded at runtime.

## I/O & Edge-Case Matrix

| Scenario        | Input / State                                       | Expected Output / Behavior                               | Error Handling                            |
| --------------- | --------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------- |
| Normal exit     | Agent starts a long-lived child and exits           | Child ends and runner reports the agent's exit           | Test teardown reaps survivors             |
| Dual kill       | Leader and supervisor die while agent and child run | Guardian's lifeline ends; both PIDs end within the bound | Runner reports transport failure          |
| Job unavailable | PowerShell helper or Job Object assignment fails    | Agent never starts                                       | Runner reports a controlled spawn failure |

</frozen-after-approval>

## Code Map

- `cli/lib/agent-supervisor.js`: Windows guardian currently starts the agent immediately and signals only its PID. Wait for a job owner to attach the guardian before spawning.
- `cli/lib/windows-job-owner.ps1`: new Windows helper creates a Job Object, sets kill-on-close, assigns the waiting guardian, reports readiness and holds the sole job handle until the guardian closes its lifeline.
- `test/test-evaluate-preflight.js`: current supervision cases skip Windows. Add platform-specific real-runner PID cases and a reference assertion.
- `.github/workflows/quality.yaml`: add a Windows job for the platform-specific preflight case; existing chain remains Ubuntu.
- `docs/reference/tea-evaluate-cli.md` and `docs/reference/tea-test-review-cli.md`: replace the stale Windows limitation with the ownership mechanism and bound.

## Tasks & Acceptance

**Execution:**

- [x] Add Windows real-runner cases for normal agent exit, simultaneous leader and supervisor termination, and job setup failure. Observe the expected child survivor before the production fix.
- [x] Establish Job Object ownership before agent launch, hold it through the turn, and close it on every agent end or guardian loss.
- [x] Add a Windows CI gate, reference assertions, changelog entry, and sprint status updates.
- [ ] Run focused, docs, release-metadata, engine export, and full repository gates. Verify each criterion by temporarily removing its implementation or assertion.

**Acceptance Criteria:**

- Given an agent that starts a child, when the agent exits normally, then both PIDs end within the documented bound; removing Job Object ownership leaves the child alive.
- Given a running agent and child, when the leader and supervisor are terminated together, then the guardian's lifeline closes and both PIDs end within the documented bound; removing Job Object ownership leaves the child alive.
- Given Job Object setup fails, when the guardian is asked to run an agent, then it does not start the agent and the runner reports the setup failure.
- Given the Windows runner reference, when its supervision passage is removed, then the documentation assertion fails.

## Implementation Notes

The Windows CI job runs the real `tea-skill-runner` with a detached child that writes a heartbeat. On the test-only branch, [run 37063941962](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/actions/runs/37063941962) observed the normal-exit child alive with a fresh heartbeat after its agent had exited and at the runner's 30 s timeout. The dual-kill case observed a child surviving beyond 10 s. The setup-failure case launched the agent because the old supervisor had no Job Object setup. These are the revert observations for the first three acceptance criteria. The reference assertion is checked separately by deleting its required passage in a temporary edit and restoring it. Story 1.61 was merged with its status still at `review`; this PR sets it to `done`.

[Windows startup probe 37069059035](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/actions/runs/37069059035) isolated the helper's C# `Add-Type` block under the runner's minimal environment. The standalone PowerShell 5.1 process took 25,799 ms end to end, exited 0 with empty stderr, and spent 581 ms in `Add-Type`. The guardian's helper reached READY about 14.7 s after spawn, with 14,447 ms inside `Add-Type`; its agent launched and reported exit 0. The earlier 15 s setup bound had no useful margin. Windows setup now gets a separate measured bound, and the agent wall clock starts after confirmed launch. Removing `kill-on-close` from the runner reference made `test:evaluate-preflight` fail 1 of 301 checks at the intended documentation assertion; the passage was restored.

[The bounded asynchronous probe 37069233644](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/actions/runs/37069233644) repeated the result: the standalone process took 24,796 ms, exited 0 with empty stderr, and its `Add-Type` step took 548 ms; the guardian helper's `Add-Type` step took 16,354 ms, beyond the former 15 s bound. It recorded an agent PID and a successful FD3 report.

## Spec Change Log

## Review Triage Log

| Finding                                | Verdict and evidence                                                                                                                                                                                                                                                                 | Route              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| Blind 1: minimal Windows environment   | medium. `run-agent.js` omits `TEMP`, `TMP`, and `SystemRoot`; the new `Add-Type` helper can fail to compile under a restricted account before it owns the guardian.                                                                                                                  | patch              |
| Blind 2: setup versus wall clock       | medium. The leader starts its wall clock before the guardian's 15 s setup wait; an agent with a shorter timeout can be stopped before launch, and the current guardian may still launch it.                                                                                          | patch with Blind 4 |
| Blind 3: setup report ordering         | medium. `fail()` terminates a potentially assigned helper before writing fd 3, which can terminate its guardian and lose the specific failure report.                                                                                                                                | patch              |
| Blind 4: launch after stop             | high. `launch()` checks `abandoned` and `finished` but not `stopping`; the grace timer can expire during helper setup, then a cancelled agent starts.                                                                                                                                | patch              |
| Blind 5: PowerShell scanner scope      | low. Framework names and forbidden config text are scanned before the helper exception, while JS AST rules cannot parse PowerShell. The fixed-purpose helper has no reachable scoring call. Additional generic AST scanning would add complexity without a demonstrated user path.   | reject             |
| Blind 6: later setup failure stages    | medium. The injected failure precedes Job Object creation, so it cannot prove assignment failure prevents agent launch.                                                                                                                                                              | patch              |
| Blind 7: Windows timeout case          | medium. The changed Windows path handles the runner wall clock, but the new integration gate lacks a running agent and child timeout case.                                                                                                                                           | patch              |
| Blind 8: runner death case             | low. Runner death is an existing supervision contract; the change does not alter the leader's runner-loss guard, and the normal and dual-kill cases exercise the new Job Object owner. A further process-tree case would add test complexity for a path this change does not affect. | reject             |
| Blind 9: helper death after READY      | medium. The helper is new, and its unexpected exit after readiness must close the only job handle and end descendants; no current case exercises this.                                                                                                                               | patch              |
| Blind 10: exit-code prose              | low. The reference exit-5 row says process group without a POSIX qualifier, even though the same section now describes Windows Job Object ownership.                                                                                                                                 | patch              |
| Blind 11: run-agent contract comment   | low. `run-agent.js` still says Windows timeout reaches only the direct agent, which conflicts with the new guarantee and can mislead maintainers.                                                                                                                                    | patch              |
| Edge 1: signal during setup            | high. The guardian's `launch()` can run after `stop()` and after its 2 s force-kill timer expires.                                                                                                                                                                                   | patch with Blind 4 |
| Edge 2: scanner capitalization         | medium. The helper exception uses case-sensitive `indexOf`; case-varied engine or rollback names bypass this check.                                                                                                                                                                  | patch              |
| Verification gap 1: assignment failure | medium. The injected exception occurs before `AssignProcessToJobObject`; removing the assignment failure check would leave all current Windows cases green on a host where assignment succeeds.                                                                                      | patch with Blind 6 |

The final native review found that the 10 s PID checks began after runner closure and ran sequentially. Both PIDs now share one deadline anchored to the agent exit marker or dual kill.

## Design Notes

Assign the guardian itself to a kill-on-close Job Object before it starts an agent. Windows then puts ordinary child processes in that job automatically. The helper holds the only job handle and watches a pipe owned by the guardian. The guardian closes the pipe after reporting a normal agent exit; if the guardian dies, the pipe closes too. If assignment fails, readiness never arrives and the agent is never launched.

## Verification

**Commands:**

- `npm run test:evaluate-preflight`: focused Windows and POSIX supervision checks.
- `npm run docs:validate-links` and `npm run docs:build`: reference checks.
- `npm run test:release-metadata`: workflow metadata gate.
- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.evaluateTarget !== 'function') process.exit(1)"`: engine export.
- `npm test`: full repository gate.
