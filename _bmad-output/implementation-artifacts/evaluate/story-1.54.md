---
title: 'Story 1.54: Reclaim auxiliary scratch after a killed preflight'
type: 'bugfix'
created: '2026-10-03'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '049d03ba2f7d20d78cfdb08ce3946de54c40228f'
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.53.md'
---

<frozen-after-approval reason="Owner gave GO for the Evaluate relay and Story 1.54">

## Intent

**Problem:** A killed preflight leaves its private parent and auxiliary scratch in the shared per-user root. Workspace recovery journals only disposable workspaces, so the next preflight misses those directories.

**Approach:** Bind the private parent to the evaluation and invocation with durable ownership evidence. Recover verified dead-run parents on the next preflight, across changes to `TMPDIR`.

## Boundaries & Constraints

**Always:** Reproduce the leak through the real CLI before fixing it. Recover only directories corroborated by the same evaluation's durable ownership record and a dead owner. Report each removal. Preserve a live owner's parent, another evaluation's parent, and any parent whose ownership is uncertain. Keep adopter status, files and refs unchanged.

**Never:** Delete a private parent based only on its PID-shaped name. Follow a symlink in the shared root, journal or parent. Depend on a signal handler to clean up `SIGKILL`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Killed preflight | Engine compile holds scratch; CLI receives `SIGKILL`; next preflight has a different `TMPDIR` | Owned engine staging and parent are reported and removed | An unverifiable entry remains for later inspection |
| Live or unrelated owner | Another CLI remains active or another evaluation owns a parent | Both parents remain | A reused or uncertain PID is treated as live |
| Killed run | Command evaluator holds scratch; run receives `SIGKILL` | Next preflight reclaims its verified parent and command scratch | The later preflight remains usable |
| Normal exit | CLI completes or handles a signal | Existing cleanup and reports hold | No stale ownership record causes a later removal |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/preflight.js`: `pipeline` makes the private parent before opening the workspace journal; it recovers workspaces before reading adopter state, and `finally` cleans scratch. Move the ownership handshake and recovery into that window.
- `cli/lib/evaluate/workspace.js`: `journalDirectory`, `reclaimDeadWorkspaces`, `makePrivateParent`, and `makeScratchDirectory` provide the safe path and ownership primitives. Keep workspace recovery semantics intact.
- `cli/lib/evaluate/ci.js`: `reclaimReplayScratch` is a separate CI path with a folder and PID owner file. Preserve its behavior.
- `cli/lib/evaluate/command-evaluator.js`: `launchExecutable` holds `tea-evaluate-command-*` under the parent during a run. Plain preflight does not invoke it.
- `test/test-evaluate-mutation.js`: `checkKilledRun` provides a real CLI kill, changed `TMPDIR`, ownership and adopter-state pattern.
- `test/test-evaluate-evaluators.js`: command evaluator fixtures and private-parent cases exercise run-time scratch.
- `docs/reference/tea-evaluate-cli.md`: workspace section documents killed-run recovery and has a heading-scoped assertion.

## Tasks & Acceptance

**Execution:**

- [x] `test/test-evaluate-mutation.js`: add a real preflight kill while engine staging exists; observe the leak before the fix, then check recovered path, changed `TMPDIR`, ownership protections and adopter state.
- [x] `test/test-evaluate-evaluators.js`: cover a killed `run` with active command evaluator scratch and normal cleanup.
- [x] `cli/lib/evaluate/workspace.js` and `cli/lib/evaluate/preflight.js`: create and retire durable auxiliary ownership, then reclaim verified dead-run parents before adopter-state capture.
- [x] `docs/reference/tea-evaluate-cli.md`, `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, sprint status and this record: align the documented recovery with the reachable CLI paths and record the fix.

**Acceptance Criteria:**

- Given a preflight killed during an engine stage, when the next preflight starts for the same evaluation under another `TMPDIR`, then it reports and removes the dead run's parent and stage directory; disabling recovery leaves them.
- Given a run killed during a command evaluator, when the next preflight starts for the same evaluation, then it removes the verified command scratch with the parent; disabling recovery leaves them.
- Given live, unrelated or unverifiable parents, when recovery runs, then it leaves them and the adopter's status, files and refs unchanged; weakening the ownership check fails the integration case.
- Given the workspace reference, when its auxiliary recovery passage is removed, then the heading-scoped documentation assertion fails.

## Implementation Notes

The original story premise names an active command evaluator in plain `preflight`. That path cannot occur: the evaluator runs after the preflight verdict inside `tea-evaluate run`. The spec keeps a real preflight engine-stage case and a separate command-evaluator run case. Amend the epic criterion and test design in this PR as the relay protocol requires.

Use Codex only. Keep implementation local for review. Lane 1 owns the next full local `npm test` slot; run focused gates and wait for the lane 2 slot before starting the full gate.

## Spec Change Log

The Epic 1 criterion and test design now distinguish engine staging in `preflight` from command evaluator scratch in `run`. Both use the same next-preflight recovery path.

## Review Triage Log

- Blind 1, `medium`, `patch`: `makePrivateParent` resolved a missing launch root before `createWorkspace` could return its launch refusal. The pipeline now checks the root first, and the mutation case asserts exit 12.
- Blind 2, `medium`, `patch`: a short `writeSync` could leave an invalid journal or marker before a later kill. Both writes now use the complete-write file operation.
- Blind 3, `low`, `patch`: a journal write or sync exception left its exclusive file behind. Creation now removes that file on failure; injected write and sync failures check this.
- Blind 4, `low`, `patch`: handled signals bypass `finally` after deleting scratch, leaving a stale ownership record. The signal cleanup now retires a record when its parent is gone.
- Blind 5, `medium`, `patch`: journal `lstat` followed by a pathname read could follow a swapped link or wait on a FIFO. Recovery now opens without following links or blocking and checks the opened file identity.
- Blind 6, `medium`, `patch`: the parent marker had the same read race. The verified-descriptor reader now protects it and the swap regression checks preservation.
- Blind 7, `low`, rejected: an external process with the same user identity could replace a verified parent in the small interval before recursive deletion. The dead run cannot do that, and a complete atomic recursive removal needs native handle-relative filesystem operations; adding partial guards here would add complexity without closing the race.
- Blind 8, `medium`, `patch`: neither the journal-only nor empty unmarked-parent creation window had a regression. Both windows now have explicit recovery assertions.
- Blind 9, `medium`, `patch`: both real killed-process cases skip Windows, leaving actual CLI root selection untested there. A bounded Windows CI case now drives a real preflight against a verified old `TEMP` record.
- Edge 1, `medium`, `patch`: the missing-root error was reachable before the established refusal. The pipeline root check and regression cover it.
- Edge 2, `medium`, `patch`: a swapped marker could be followed or could block. Descriptor-based marker verification and a swap regression cover it.
- Edge 3, `low`, rejected: recursive removal still uses a pathname after identity verification. Only a concurrent same-user actor swapping that path in the deletion window produces the stated outcome; a portable atomic recursive handle operation is unavailable in this Node runtime.
- Verification gap 1, `medium`, `patch`: a helper forced through the Windows branch did not prove production CLI behavior. The native Windows CI step runs preflight after `TEMP` changes and checks the original parent is reported and removed.
- Verification gap 2, `medium`, `patch`: no test exercised an absent marker after parent creation. The auxiliary journal edge case now checks that empty parent is reclaimed.
- Verification gap other, `medium`, `patch`: macOS immutable scratch exposed a real cleanup fault: recursive parent removal could delete its marker before failing on a child. Cleanup now handles children first and retains the marked parent when any child fails; the scratch case checks later recovery.
- Final test-quality review 1, `medium`, `patch`: the unrelated project's preflight completed before recovery, leaving no unrelated scratch to preserve. The integration case now holds that project's real engine stage and parent through recovery and asserts both exact paths survive.
- Final architecture review 1, `medium`, `patch`: recursive parent removal could delete the marker before a later child, leaving nonempty unmarked scratch after interruption. Recovery now removes children first and retains marker and journal through a forced mid-cleanup failure, then succeeds on retry.

## Design Notes

The shared private root survives `TMPDIR` changes and contains unrelated runs. The durable record must bind folder, invocation and exact parent path. Recovery should validate the record and parent before removal, using the existing held-root and journal protections.

The auxiliary journal entry is written and synced before its exact parent path is created. A matching marker is written inside the parent before any staging starts. A kill before directory creation leaves a record the next preflight retires; a kill before the marker leaves an empty parent that can be reclaimed. Recovery checks the held journal, the evaluation folder and target root, invocation identifier, exact parent path, private mode, marker and dead owner. It reports each auxiliary entry and the parent after removal. Normal cleanup retires the record only after the parent is gone; a failed cleanup stays recoverable.

The pre-fix real CLI reproduction failed two checks: the next preflight did not report the killed engine-stage parent and left it in the shared root. With the fix, the mutation suite passed 693 checks, including live and unrelated owner protection, a mismatched marker, a linked parent, changed `TMPDIR`, path reporting and adopter state. The evaluator suite passed 575 checks, including a killed `run` while command scratch was active and normal scratch cleanup.

Follow-up review found that Windows recovery compared a recorded root with the next invocation's temp root, and that an interrupted in-parent marker write was retained. Recovery now validates and holds the root named in each journal entry; POSIX still requires its fixed root. It accepts a zero-byte or exact-prefix marker only while that marker is the parent's sole entry. The narrow auxiliary regression passed 35 checks, including an earlier Windows temp root, POSIX fixed-root rejection, linked-root refusal, and the two partial-marker cases. The full focused suites and full gate are queued after this follow-up change.

Final review found that auxiliary ownership was attempted before a missing `launch.root` reached its established workspace refusal, a short journal write could survive an exception, handled signals left a cleaned parent's journal entry, and ownership reads could follow a file swapped after inspection. The runtime now checks the root first, writes records completely, removes a new journal entry on write or sync failure, retires successful signal cleanup, and reads a verified descriptor without following a link or blocking on a FIFO. The test covers journal-only and unmarked-parent kill windows and a native Windows CLI recovery step after `TEMP` changes. A macOS immutable child exposed a cleanup ordering gap: children are now removed first, and a failed child keeps the parent and its marker until a later preflight can reclaim it.

The last recovery review found that recursive removal could erase the marker before it finished removing auxiliary children. Recovery now removes children one at a time while the marker remains, then removes the marker and empty parent before retiring the journal. An injected failure on the second child checks that the marker and journal survive and a later recovery completes. The real killed-engine case also keeps an unrelated preflight's engine stage and private parent live through same-evaluation recovery and checks their exact paths survive.

Before the last review patch, the narrow auxiliary regression passed 57/57 and the full local `npm test` chain exited 0, including preflight 324/324, mutation 712/712 and evaluators 575/575. The new interrupted-recovery and unrelated-live-owner assertions need a focused rerun after lane 3 releases the host slot. The native Windows recovery case passed in PR #311's first Windows CI run; the final head will receive fresh CI.

## Verification

**Commands:**

- `npm run test:evaluate-mutation`: real preflight recovery and ownership cases pass.
- `npm run test:evaluate-evaluators`: command evaluator and private-parent cases pass.
- `npm run docs:validate-links`, `npm run docs:build`, `npm run lint`, `npm run lint:md`, `npm run format:check`: required gates pass.
- `npm test`: passed with exit 0 before the final review patch; the final head awaits focused tests and fresh CI.
- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.evaluateTarget !== 'function') process.exit(1)"`: engine export remains available.
