---
title: 'Recover from a killed run'
type: 'bugfix'
created: '2026-09-28'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: '83f7b6b664d9ae2ee14c5f8919348c2c9cf291ae'
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.7.md'
---

<frozen-after-approval reason="Owner delegated the Evaluate relay and asked this coordinator to build the next ready story">

## Intent

**Problem:** A simultaneous kill of the agent's leader and supervisor can leave the agent group alive. A killed `tea-evaluate preflight` also leaves its temporary workspace and detached Git worktree registered. The next run has no way to identify and reclaim that owned scratch.

**Approach:** Keep an independent agent-group guardian alive through the leader and supervisor failure. Mark each workspace with verifiable ownership before it can register a worktree, then let the next preflight reclaim scratch from dead invocations and report what it removed.

## Boundaries & Constraints

**Always:** Reproduce both failures through the runner and CLI before changing production code. Keep the adopter's status, refs and unrelated temporary paths unchanged. Preserve live-run workspaces. Bound waits and clean up test processes even when assertions fail. Exercise a revert check for each acceptance criterion.

**Never:** Reclaim an unverified path or a workspace owned by a live process. Rely on a catchable signal handler to clean up after `SIGKILL`. Modify a target's source tree to store the marker.

## I/O & Edge-Case Matrix

| Scenario                | Input / State                                                       | Expected Output / Behavior                                                           | Error Handling                                       |
| ----------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Dual kill               | Leader and supervisor receive `SIGKILL` while the agent has a child | Agent group stops and runner returns a transport failure within the documented bound | Test teardown kills any survivor                     |
| Dead invocation         | Preflight is killed after a workspace and detached worktree exist   | Next preflight reports and removes owned directory and Git registration              | Adopter status and refs remain byte-identical        |
| Live or uncertain owner | Marker names a running process, or ownership cannot be verified     | Workspace remains untouched                                                          | Report or skip uncertain scratch without deleting it |

</frozen-after-approval>

## Code Map

- `cli/lib/agent-supervisor.js`: leader starts the detached agent group; supervisor and leader each kill it when they survive. Both can die together. Add a surviving ownership path without changing the existing report and pipe behavior.
- `cli/lib/run-agent.js`: maps a missing supervisor report to a transport failure; preserve that exit and bound the runner's wait.
- `test/test-evaluate-preflight.js`: existing dual-kill case returns a transport failure, then manually kills the orphan. Extend it to assert the group and child stop before teardown.
- `cli/lib/evaluate/workspace.js`: `createWorkspace` allocates `/tmp/tea-evaluate-*` and registers a detached worktree; `removeWorkspace` removes both directory and metadata. Add an owner marker and safe stale-workspace discovery here.
- `cli/lib/evaluate/preflight.js`: in-memory `liveWorkspaces` and `finally` cleanup vanish on `SIGKILL`. Reclaim before making a new workspace and before adopter-tree state capture.
- `cli/lib/evaluate/run.js`: trial workspaces use the shared factory. The same marker must cover their scratch.
- `test/test-evaluate-mutation.js`: extend the real-project SIGTERM case with killed-run recovery, worktree-list, live-owner and unchanged-adopter assertions.
- `docs/reference/tea-evaluate-cli.md`: update `## The workspace` and runner supervision wording. Hold the workspace passage by its exact heading.
- `_bmad-output/planning-artifacts/evaluate/epics.md` and `test-design-epic-1.md`: correct the stale dual-kill revert wording after the red test confirms the runner already returns.
- Preserve the passing end-to-end dual-kill, dead-worktree, live-owner, documentation and revert tests. Extend them to cover non-Git copies, changed `TMPDIR`, partial Git registration, the actual agent process group and a failed test's bounded teardown.

## Tasks & Acceptance

**Execution:**

- [x] `test/test-evaluate-preflight.js` and `test/test-evaluate-mutation.js`: reproduce the orphan group and abandoned worktree end to end, then add bounded red regressions with unconditional cleanup.
- [x] `cli/lib/agent-supervisor.js` and `cli/lib/run-agent.js`: stop the agent group and close the runner after the combined kill, including the agent-start race.
- [x] `cli/lib/evaluate/workspace.js` and `cli/lib/evaluate/preflight.js`: write and verify workspace ownership, reclaim dead invocations and detached registrations, preserve live or uncertain owners, and report removals.
- [x] `docs/reference/tea-evaluate-cli.md`, Epic 1 plan, test design, `CHANGELOG.md` and sprint status: document recovery and the corrected revert evidence.
- [x] Run focused gates, each revert check, docs gates, engine export check and `npm test`.

**Acceptance Criteria:**

- Given the leader, supervisor, agent and agent child are running, when the first two receive `SIGKILL`, then the entire agent group stops and the runner returns a transport failure within the documented bound; reverting the guard leaves a group member alive.
- Given a preflight killed during qualification with a marked workspace and detached worktree, when another preflight starts, then it reports and removes both and preserves the adopter's status and refs; reverting reclaim leaves the directory or registration.
- Given a workspace marker whose owner is live, when another preflight starts, then that workspace and its registration remain; reverting the liveness check removes it.
- Given the CLI reference under `## The workspace`, when its recovery passage is read, then it names the marker, killed-run residue and next-preflight reclaim; deleting the passage fails the documentation assertion.

## Implementation Notes

The original end-to-end probes left an agent group alive after both supervisors received `SIGKILL` and left a detached worktree after a killed preflight. Iteration 1 passed its focused gates, `npm test`, docs gates and engine export check before review. That implementation was reverted for the iteration 1 design changes.

Iteration 1 revert checks failed at the intended assertions: removing the guardian left an agent group member alive; removing reclaim left the workspace and Git registration; removing owner liveness removed a live workspace; removing the reference passage failed the docs assertion. Re-run all revert checks on the new implementation.

Iteration 2 starts the guardian as the detached group leader before it launches the agent. The parent knows that group ID as soon as the guardian starts. The guardian closes the group when its parent lifeline ends; Windows forced stop also targets the reported agent PID. Preflight records each workspace in a private journal under its own `runs/` directory before creating the workspace path. Recovery verifies project identity, owner liveness, marker agreement and Git registration before it removes a dead workspace. It also handles changed `TMPDIR`, an unmarked empty directory and a missing worktree `.git` pointer.

Iteration 2 revert checks failed at the intended assertions: disabling guardian lifeline handling left the guardian, agent and child alive; disabling reclaim left the killed workspace and Git registration; disabling the owner liveness guard removed a live workspace; deleting the reference passage failed its exact-heading documentation assertion.

Iteration 2 verification passed: focused preflight and mutation suites, all four revert checks, documentation link validation and site build, engine export check and the full `npm test` gate. The full gate includes lint, markdown lint, formatting and release metadata checks.

Round 2 review added coverage for intact and missing Git worktrees, journal retirement and PID liveness under a failed `ps` lookup. It also removed the guardian report timeout and logged metadata-only recovery. Follow-ups for Windows descendants, a stopped guardian and auxiliary scratch are Stories 1.52 to 1.54; Story 1.31 already tracks target filesystem confinement.

After the round 2 patches, `npm test` passed with 236 preflight, 536 mutation, 389 run, 385 arms and 589 evaluator checks, followed by the repository lint, markdown lint and formatting gates. `npm run docs:validate-links`, `npm run docs:build` and the eval-quality engine export check passed. The Windows branch remains unexercised on this macOS host; Story 1.52 carries its descendant guarantee.

The final review found that an unreadable Git metadata directory could retire a journal too early, the journal parent could be swapped, and a killed preflight could leave its Git checkout child running. It also found two partial-marker windows during workspace creation and removal, and two test assertions that could miss an adopter change or signal an unrelated reused PID. Recovery now holds and verifies the journal directory, retains ownership through a sidecar marker, preserves uncertain Git metadata, and supervises Git checkout and removal. End-to-end mutation regressions cover each failure window, the adopter-state baseline, and the journal-parent swap. The focused mutation suite passed 634 checks, and the promptfoo suite passed with canonical dependency paths. Story 1.24 merged first and owns follow-ups 1.50 and 1.51, so this story's three follow-ups became 1.52 to 1.54.

## Spec Change Log

- Iteration 1 review found a Windows forced-stop regression, a guardian PID-report gap, cross-project copy deletion, unmarked and unreachable dead workspaces, and incomplete Git registration handling. The supervision and recovery design notes now require a group ID known before agent launch, a Windows direct kill, a durable project-scoped workspace journal created before the directory, exact project identity, and verified partial-registration cleanup. The prior implementation's guardian handoff and current-TMPDIR scan are known-bad states. KEEP: preserve the existing report/pipe behavior, the passing dual-kill and killed-run regressions, live-owner preservation, untouched adopter assertions, documentation checks, and all four revert observations.

## Review Triage Log

- Blind 1, `agent-supervisor.js` Windows forced stop: **high, bad_spec**. `signalGroup('SIGKILL')` skips direct kill when `GROUPS` is false, so a stubborn agent can survive the grace timer. The supervision design omitted a Windows backstop.
- Blind 2, guardian death before its PID report: **high, bad_spec**. The guardian spawns a detached group before writing its PID; if it dies in that interval, neither existing supervisor knows the group ID. The owner topology must close this gap.
- Blind 3, dual-kill test PID: **medium, patch**. `childrenOf(bothLeader)[0]` now names the guardian, while the assertion calls it the agent group. The test must identify the actual group it expects to stop.
- Blind 4, live target during reclaim: **false**. The verdict executable runs through `runSupervised`; the supervisor observes the killed preflight process, ends its lifeline, and the guardian stops its agent group. The test's later teardown checks a reused PID before killing it, but does not establish a surviving target during reclaim.
- Blind 5, same-user marker forgery: **medium, defer to Story 1.31**. A target process can edit its parent marker under the same user identity. Story 1.31 already requires file-system confinement of target processes to their workspace and prevents access to evaluation evidence; marker validation can protect against accidental or unrelated paths now.
- Blind 6, kill between directory creation and marker write: **medium, bad_spec**. `mkdtempSync` precedes the marker write, leaving an unmarked directory if killed in between. Recovery needs a durable record created before the directory.
- Blind 7, partial Git checkout: **medium, bad_spec**. A registered metadata entry can exist while `.git` is absent during `git worktree add`; `lstatSync` then throws and recovery skips it on every run. The recovery design must define partial-registration handling.
- Blind 8, changed `TMPDIR`: **medium, bad_spec**. Reclaim scans only the current temp directory, so a later preflight under another `TMPDIR` cannot find the earlier workspace. Same-project recovery needs a persistent location record.
- Edge 1, guardian startup gap: **high, bad_spec**. This is the same root cause and evidence as Blind 2; the guardian can die after spawn and before reporting the agent PID.
- Edge 2, unreadable temp directory: **low, patch**. `fs.realpathSync` can succeed while `fs.readdirSync` fails, producing an uncaught error. A direct error guard can preserve the normal refusal path.
- Edge 3, forged unrelated marker: **medium, bad_spec**. The current marker checks a repository path, but non-Git projects both present `null` identity; a forged candidate can be deleted. Add project identity and independent registration checks before removal.
- Edge 4, test child teardown: **low, patch**. A failed assertion before `await closed` reaches `finally`, which sends `SIGKILL` without awaiting process closure. The test can wait with a bound before deleting fixtures.
- Gap 1, dead copy coverage: **medium, patch**. The code claims to reclaim dead copies and the existing recovery regression exercises only Git worktrees. A killed-copy fixture must assert the directory is removed.
- Gap 2, reclaimed path output: **low, patch**. The output test matches generic words, so removing the directory from the log would pass. Compare with the abandoned path.
- Gap other, cross-project copy deletion: **high, bad_spec**. For two non-Git projects, both marker repository fields are `null`; the reviewer reproduced project B reclaiming project A's dead copy. Bind each marker and recovery record to the exact project root.
- Round 2 blind 1, Windows descendants: **medium, defer**. The new guardian's Windows path signals the direct agent, and the leader's later `taskkill` cannot run after dual leader/supervisor death. Windows had no process-group descendant guarantee before this story; a platform process-tree owner is separate work.
- Round 2 blind 2, stopped guardian: **medium, defer**. A guardian held in `SIGSTOP` cannot process its lifeline closure after the other two supervisors die. The frozen dual-kill scenario has a running guardian; this extra stopped-owner fault needs a kernel-backed owner.
- Round 2 blind 3, delayed report pipe: **low, patch**. The leader uses a 100 ms fallback after guardian exit even though only the guardian holds report fd 3, so the pipe's `end` is a safe completion signal. Remove the timer and wait for `end`.
- Round 2 blind 4, other scratch directories: **medium, defer**. `makeScratchDirectory` predates this story and creates evaluator command scratch, not a `createWorkspace` workspace. A killed preflight can leave that scratch; the story's frozen intent covers workspaces and agent processes.
- Round 2 blind 5, metadata without `gitdir`: **low, reject**. A local Git fixture with the metadata `gitdir` file removed made `git worktree list --porcelain` omit that worktree. The remaining metadata cannot be linked safely to this workspace and is not a listed registration; deleting it would require a speculative ownership rule.
- Round 2 blind 6, reused owner PID: **low, reject**. A reused PID is intentionally treated as uncertain ownership in `reclaimDeadWorkspaces`. Retaining uncertain scratch preserves the story's safety rule; process-start fingerprints add platform-specific state for a rare leak.
- Round 2 blind 7, moved project: **low, reject**. The exact folder and root paths no longer agree after moving the project, so the journal is deliberately unverifiable. Reclaiming after a move would require a new ownership scheme and weaken the rule that uncertain paths stay untouched.
- Round 2 blind 8, failed `ps`: **low, patch**. The test treats any nonzero `ps` exit as a dead target, so an unavailable `ps` could hide a survivor. Check kernel PID liveness when `ps` cannot identify the process.
- Round 2 blind 9, Git checkout before `gitdir`: **low, reject**. The current partial-worktree test removes `.git` after checkout and does not synthesize a missing metadata `gitdir`; the latter has no listed Git registration in the local Git fixture and cannot be safely attributed by path.
- Round 2 blind 10, journal retirement: **medium, patch**. The recovery tests assert the workspace and registration are gone but do not assert their journal entry was retired. Add that assertion.
- Round 2 gap 1, intact worktree: **medium, patch**. The only killed Git case removes `.git`, so a regression rejecting a valid pointer could pass. Add a killed worktree with its pointer intact and assert cleanup.
- Round 2 gap 2, missing worktree directory: **medium, patch**. The recovery tests all keep the temp directory. Add a case with an absent directory and a verified Git metadata entry, then assert registration cleanup.
- Round 2 edge 1, unverifiable metadata: **low, reject**. This overlaps blind 5; a metadata directory with no readable `gitdir` has no verifiable link to the workspace and Git does not list it as a registration.
- Round 2 edge 2, missing-directory report: **low, patch**. The recovery branch removes verified Git metadata and retires the journal without logging either action. Log that exact registration removal.
- Final adversarial 1, unreadable Git metadata: **high, patch**. A metadata read error was treated like absence and could retire the journal while the registration remained. Keep the journal for another recovery attempt.
- Final adversarial 2, swapped journal parent: **high, patch**. A target could redirect journal operations through a replaced `runs/` parent. Hold and verify the journal directory for its lifetime, and refuse a redirected write.
- Final adversarial 3, lingering Git checkout: **high, patch**. A killed preflight could leave `git worktree add` running while recovery removed its path. Supervise Git checkout and removal and prove the checkout child stops after the kill.
- Final edge 1, interrupted marker write: **medium, patch**. A partial marker in an otherwise empty, journal-verified workspace stranded the directory. Recover that exact partial write.
- Final edge 2, interrupted teardown: **medium, patch**. Recursive removal could remove the inner marker first. Keep a verified sidecar marker beside the workspace until cleanup completes.
- Final edge 3, adopter baseline: **medium, patch**. The killed-run test captured status and refs after changing the fixture. Compare against the original snapshot immediately after the kill.
- Final edge 4, uncertain PID: **medium, patch**. A failed `ps` lookup could make test teardown signal an unrelated reused PID. Signal only a positively identified verdict process.

## Design Notes

The current dual-kill test already proves a bounded transport failure. It cleans the surviving agent group itself. The Epic 1 criterion's claim that a revert makes the runner time out is stale; the group-survival assertion is the revert-sensitive behavior.

Place the workspace marker outside the target/worktree subtree so it cannot change target digests or Git status. Validate the marker, path, repository identity and current worktree registration before removal. An unverifiable or live owner retains its scratch for a later run.

The guardian starts as a separate process-group leader on POSIX and launches the agent inside that group. The leader knows the guardian's group ID at spawn, before the agent can start; it can stop the group even if the guardian ends before reporting. The guardian kills its whole group when its lifeline closes. Preserve a direct agent kill on Windows after the grace period. The supervision test must identify both the guardian group and the agent process, and assert their ends after dual `SIGKILL`.

Each evaluation keeps a private workspace journal under its ignored `runs/` directory. Choose a unique workspace path and write a journal entry naming the exact evaluation folder, launch root, run ID, owner PID, temp path, workspace kind and repository identity before creating that path. Write the workspace marker outside the target subtree when the path exists. The next preflight reads its own evaluation's journal, including paths from an earlier `TMPDIR`, before adopter-state capture. A journaled path absent from disk can be retired; an empty, private directory left before the marker write can be removed only after the journal, exact path and ownership checks agree. For a completed marker, require the journal and marker to agree exactly. A non-Git project has its own folder identity, so it cannot reclaim another project's copy. Preserve live or uncertain owners. Catch an unreadable temp or journal directory as a controlled refusal or skip.

For a journaled Git worktree, verify the repository's metadata entry points to the exact workspace `.git` path. If checkout was killed before `.git` appeared, remove only that verified entry and owned temp path. If `.git` exists, verify its pointer back to metadata before removal. Keep unrelated registrations. After successful cleanup remove the journal entry and report each removed path. A killed agent or evaluator must cease through supervision before its workspace is reclaimed.

## Verification

**Commands:**

- `npm run test:evaluate-preflight` and `npm run test:evaluate-mutation`: dual-kill, dead-run and live-owner regressions pass.
- `npm run docs:validate-links` and `npm run docs:build`: reference remains valid.
- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.evaluateTarget !== 'function') process.exit(1)"`: engine export is present.
- `npm test`: full repository gate passes.
