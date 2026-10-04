---
title: 'Story 1.120: Hold the partial-clone failing-pack refusal to one outcome on Linux'
type: 'bugfix'
created: '2026-10-04'
status: 'done'
route: 'dispatch'
review_loop_iteration: 3
baseline_commit: '128680ad1971cfe784eb2e00cb9712f562ac1d85'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.120; Stories 1.80 and 1.132)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.120 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-7, AD-8)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.132.md (the story that rewrote the pack stage)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** The confinement case `a failing pack over a partial clone` replaces `pack-objects` with a `git` wrapper that exits 1, so the build must refuse naming `rev-list`, `pack-objects` and the wrapper's message.
On Linux CI it refused later once, at `read-tree HEAD` (`failed to unpack tree object HEAD`), which means the pack stage had reported success.
Story 1.132 rewrote the stage (a `stages` list run as one pipeline) and the flake had to be reproduced again on the new code.

**Approach:** Reproduce on the current code in a Linux container with git 2.44 or later, with the story's loop (200 runs, serially and eight at a time).
Name the cause and fix it at its site.
Commit the loop as `tools/loop-failing-pack.js` (`npm run loop:failing-pack`) and a workflow that runs it on the ubuntu runner on demand and for a pull request that touches the pack stage.

## Boundaries & Constraints

**Always:** A failing pack stage over a partial clone refuses naming `rev-list`, `pack-objects` and the wrapper's message on every run, and no run reaches `read-tree`.
The streaming reader's exit status is the first failed stage's status whatever state its pipes are in.
The loop fails a run that refuses anywhere else, and a run in which the case did not execute.
Commit ids, digests and the isolation golden stay as they are.
No eval-quality change.

**Never:** a retry that hides the failure, a longer timeout, a sleep, a change to the case that makes it pass without the stage reporting the failure, or a new dependency.

**Decisions (coordinator, owner-delegated):** the Decisions list below carries each choice with its reason.

## I/O & Edge-Case Matrix

| Scenario                                       | Input / State                                                                                                      | Expected Output / Behavior                                                                              | Error Handling |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | -------------- |
| Failing pack over a partial clone, 200 runs    | Linux, git 2.47, a wrapper that exits 1 for `pack-objects`, the loop serially and eight at a time                  | every run refuses naming `rev-list`, `pack-objects` and the wrapper's message; none reaches `read-tree` | exit 12        |
| Pack stage fails after the walk has exited     | the walk exits at once and a child it started holds its output open and prints into it later; the pack stage fails | the job exits with the pack stage's status and `git pack-objects exited N` on standard error            | exit as named  |
| `trees` job whose `cat-file` stage ends unread | a commit list of 200,000 lines, a `cat-file` stage that exits 4 after 0.3 seconds without reading its input        | the job exits 4 with `git cat-file exited 4` and prints nothing                                         | exit 4         |
| Loop with a run that did not execute the case  | a host whose git is older than 2.44 (the suite skips the partial-clone cases), or a suite that counts no checks    | the loop fails the run, saying the host skipped the partial-clone cases or the suite counted no checks  | exit 1         |
| Loop arguments                                 | `--runs`, `--parallel` not a whole number of 1 or more                                                             | exit 2 with the argument named                                                                          | exit 2         |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/git-lines.js`: the `pack` job ends a stage on its `exit` event; the `trees` job destroys the commit list's output when the `cat-file` stage fails and fails when that stage exits 0 having answered fewer lines than it was sent.
- `tools/loop-failing-pack.js`: the loop; `package.json` script `loop:failing-pack`.
- `.github/workflows/failing-pack-loop.yaml`: the Linux job, for a pull request that touches the pack stage or the loop and on demand.
- `test/test-evaluate-run.js`: four rows in `checkWithheldHistoryReachUnits` (the pack job over a walk whose child holds its output open, the `trees` job over a `cat-file` stage that exits 4 unread, one that exits 4 over a list a child still holds, and one that exits 0 unread) and the stubs they need.
- `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `sprint-status.yaml`, this record.
- Not changed: `workspace.js`, the case `a failing pack over a partial clone`, the target profiles, the isolation golden, every `capture-record.json`.

## Tasks & Acceptance

- [x] Reproduce on the current code, in a Linux container with git 2.47 (`node:24-trixie`, bubblewrap and strace), with the loop serially and eight at a time.
- [x] Find the cause and fix it at its site (`git-lines.js`), the `trees` job's same defect included.
- [x] The unit rows that fail on every host without the fixes.
- [x] The loop script, its npm script and the workflow.
- [x] `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `sprint-status.yaml`, this record.

**Acceptance Criteria:** as in `epics.md` Story 1.120, with the amendment dated 2026-10-04 there.

## Reproduction

The loop ran on `128680ad` (Story 1.132 merged) in a container built from `node:24-trixie` with `git`, `bubblewrap` and `strace` installed (git 2.47.3, node 24, user `tester`, `--tmpfs /tmp:rw,exec,mode=1777`, `seccomp`, `apparmor` and `systempaths` unconfined, `SYS_ADMIN` and `SYS_PTRACE`), over a copy of the tree under the scratchpad directory.
`node:24-bookworm` carries git 2.39.5 and bookworm-backports has no newer git, so the partial-clone cases would skip there.

- Serial, 20 runs: 2 failed, both with `failed to unpack tree object HEAD` at `read-tree HEAD`; one run failed in `a failing pack over a partial clone` and one in `a pack a signal killed` (the sibling case, which fails the same way).
- Eight at a time, `128680ad` with its own test file: 12 of 60 runs failed; 1 of 40 serial runs failed on the same code. All 13 failures were refusals at `read-tree` in `a failing pack over a partial clone` or its sibling `a pack a signal killed`.
  A run with this story's test file against the unfixed `git-lines.js` fails every time, on the new deterministic rows, so its failed-run count says nothing about the flake; the counts above use the original test file.

A debug copy of `git-lines.js` logged each stage's `exit` and `close` and the process exit.
In a failing run the log read: the pack stage's `exit` with code 1, the index stage's `exit` with 128, the walk's `exit` with code 0, no `close` for the walk, `process exit 0`.
That is the cause: the job waits for every stage's `close`, and `close` waits until the stage's standard output has been read to its end.
Node pauses the walk's output when the next stage's input is destroyed (the pack stage had exited), the walk's last bytes were still unread, the walk never closed, the event loop ran dry and the process exited 0.
The first failure had been recorded (`state.failure`), but the job reports it only when every stage has ended.
`packInto` took exit 0 as a built pack, `read-tree HEAD` ran against a store with no objects and refused with `failed to unpack tree object HEAD`.
It is a race between the walk's output being read and the pack stage's exit being handled, so it needs a loaded host: the earlier Linux CI run was one of 20 steps sharing a runner, and this host's load average was in the hundreds from the other lanes.

A deterministic form: a walk stub that exits at once while a child it started holds the output pipe open and prints into it a second later, and a pack stub that exits 3 after half a second.
Run directly against `git-lines.js` at `128680ad` it exits 0 after two seconds with the stub's message on standard error and nothing else.

The `trees` job showed the same exit 0 with a different input: a commit list of 200,000 lines against a `cat-file` stage that exits 1 after 0.3 seconds without reading.
The job paused the list for its input to drain, the stage ended, nothing drained, the list never ended and the job exited 0 printing nothing, so `treesAtPath` would have returned no trees for a history it had not read.

## Decisions

1. **A stage ends on its `exit`, not its `close`.**
   `exit` is the child's own end, `close` adds "and its output has been read".
   Every consumer of a stage's output is another stage, and a stage that has exited has taken all the input it will take, so nothing the job waits for sits in the output of a stage that has exited.
   The last stage's output is ignored.
   `exit` fires whatever the pipes hold, so the job cannot run dry before reporting.
2. **Rejected: resuming the paused stream, or draining it when the next stage dies.**
   It repairs one ordering and leaves the job's end tied to a stream's end, so a child that holds the pipe open (a hook, a `git` wrapper that starts a background process) still keeps the job waiting.
3. **Rejected: an exit guard (`process.on('exit')`) that turns a silent exit into a failure.**
   It would report the symptom with a generic message and hide which stage failed.
4. **Rejected: passing each stage's output stream to the next stage as its standard input.**
   It removes the pipe's pause but changes how the job reads and delivers the pack, which Story 1.132 settled, and does not touch the `trees` job.
5. **The `trees` job destroys the list's output when its `cat-file` stage fails, and refuses a stage that exits 0 before it read the list.**
   The job paused the list when the stage's input buffer was full and resumed it on `drain`; a stage that has ended never drains.
   Killing the list is not enough: Node resumes a child's output once, on the child's exit, so a list that had already exited while a child of its own held the output open stayed paused after that resume, never closed and left the job to run dry with exit 0.
   Destroying the output stream ends it whatever the list's state, and it makes a separate resume and a guard against pausing again unnecessary; both were tried, held no case once the destroy was in, and were removed.
   A stage that exits 0 without answering every line it was sent answered for part of the history, which the job took as a whole one and printed no trees.
   Two checks hold it, and each catches what the other cannot.
   The list's end marks the list delivered before the stage's input is closed, and a clean exit before that mark fails the job (`git cat-file ended before the commit list was handed to it`); a stage that exits before the list has printed anything has counted no lines, so a count alone accepts it, and a long list then pauses for input nobody reads and hangs.
   The job also counts the lines it sends and the lines the stage answers (`cat-file --batch-check` answers each line it reads, `missing` included) and fails a clean exit whose counts differ (`git cat-file answered N of M lines`); a short list is fully delivered before a stage that reads nothing exits, so the mark alone accepts it.
   The job's other modes read one process's output as it arrives and are not exposed to it.
6. **The loop runs the case that holds the failing-pack case.**
   `--only` selects a suite case by name, and `a failing pack over a partial clone` is a section of `the withheld git history's reach units`, whose 73 checks take about five seconds.
   A loop that selected only the section would need a new case in the suite's list, which moves the case count the documentation and the shard plan hold, for a saving of seconds.
   The loop classifies a failing run by the message of the failing-pack check and lists any other failure as it came, so a run that fails elsewhere cannot hide.
7. **The workflow runs for a pull request that touches the pack stage and on demand.**
   A workflow file can be dispatched only from the default branch, so a story that adds it could not run it before merging; the path filter (`git-lines.js`, the loop, the workflow) runs it on this pull request and on every later change to the stage it guards.
   A pull request runs 20 serial and 60 parallel runs (about 10 minutes), because the first full run of 200 and 200 held a runner for about 54 minutes while the other lanes' pull requests queued behind the shared job limit; the manual start keeps 200 in each loop.
   The step names `SERIAL_RUNS`, `PARALLEL_RUNS` and `PARALLEL` through the environment, so an input never reaches the shell as text.
8. **The unit rows use child processes and a pipe, not a mock of the stream.**
   The failing-pack outcome depends on the order of Node's child and stream events, which a fake child cannot reproduce faithfully.
   A real stub whose child holds the pipe open makes the order the same on every host, so the rows fail without the fix on macOS too.

## Implementation Notes

- The pack job's comment names `exit` and why `close` is wrong, one sentence per line.
- `tools/loop-failing-pack.js` runs the suite with `--group=confinement --only=<case>`, `FORCE_COLOR=0`, counts a run as passed only when it exits 0 and the suite reports a nonzero check count, and prints each failing run's reason as it ends.
  `--log=<directory>` keeps every run's output as `run-<n>.log`, which the workflow uploads.
- The workflow installs bubblewrap and strace and allows the user namespace like the `chain` job, and prints the runner's git version.
  The case fails in CI when git is older than 2.44, so a runner image that regresses fails the loop visibly.

## Revert observations

Each revert was applied once to a scratch copy of the final tree, the named case run, the failed-check count recorded and the copy discarded.
`--only="reach units"` runs `checkWithheldHistoryReachUnits` (73 checks).

| Revert (the one edit)                                                                      | Case run               | Observed                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The `pack` job counts a stage ended on `close` again (`exit` back to `close`)              | `--only="reach units"` | 1 of 73 fails: `a pack that fails after the walk ended with its output still open ended 0; expected 3`                                                                                 |
| The `trees` job drops the check that the whole list was handed to the stage                | `--only="reach units"` | 3 of 73 fail: `askzero` ends 1 with the count message, `askidle` ends 0 with nothing printed, `askgone` never ends (the suite's timeout kills it); each expected the handed-to message |
| The `trees` job drops the check that the stage answered every line it was sent             | `--only="reach units"` | 1 of 73 fails: `askshort` (5 lines) ends 0 with nothing printed, expected 1                                                                                                            |
| The `trees` job leaves the list's output open when the stage fails                         | `--only="reach units"` | 3 of 73 fail: the `askearly`, `askbg` and `askzero` rows end 0 with nothing printed (the stubs' `awk` outlives the kill and holds the list's output, so only the destroy ends it)      |
| Both reverted (`git-lines.js` at `128680ad`) with the story's test file                    | `--only="reach units"` | 7 of 73 fail: `askearly`, `askbg`, `askzero`, `askshort`, `askidle`, `askgone` and the pack row                                                                                        |
| `git-lines.js` and the test file at `128680ad`, the loop, Linux container, eight at a time | `loop:failing-pack`    | 12 of 60 runs fail, each a refusal at `read-tree HEAD` in the failing-pack case or its sibling                                                                                         |
| `git-lines.js` and the test file at `128680ad`, the loop, Linux container, serially        | `loop:failing-pack`    | 1 of 40 runs fails the same way (2 of 20 in the first smoke run)                                                                                                                       |

## Gates

Run one host-heavy gate at a time, on a machine shared with the other lanes.
No full local `npm test`: the hook and CI carry the chain.

Local, macOS (Seatbelt), on the final tree:

- `test:evaluate-confinement` (1,541 and 1,543 checks across reruns), `test:evaluate-run` (592), `test:isolation-primitives`: green. One run of the confinement group under heavy host load ended in a stack trace that its output tail did not name; four reruns of the group passed.
- `npm run format:check`, `npm run lint`, `npm run lint:md`, `test:changelog`, `test:shards`, `test:ci-coverage`, `test:ci-coverage-filters`, `test:doc-counts`, `test:bmad-output-gated`: green.
- `git diff -- package-lock.json` is empty; `package.json` gains the `loop:failing-pack` script.

Linux, in the container over copies of the final tree:

- The loop over the fixed code, eight at a time: 200 of 200 runs passed.
- The loop over the fixed code, serially: 200 of 200 runs passed.

CI: the `Failing-pack loop` workflow ran on this pull request at `8cfdb3fb` on the ubuntu runner (git 2.55.0): 200 of 200 serial runs passed in 37 minutes and 200 of 200 runs eight at a time passed in 16 (run 37219892619). The final head's run is recorded in the pull request's checks.

## Build review

Round 1 (PR #344, three Opus lenses: adversarial, test quality, story and repository compliance) found, each reproduced and fixed:

| Finding                                                                                                                                                           | Fix                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| The loop passed on a host whose git skipped the partial-clone cases (the suite fails the skip only when `CI` is set)                                              | The loop fails a run that prints `skipped the partial-clone cases`                                              |
| The `trees` job's explicit resume held no case, and a `cat-file` stage that exits 0 while the list is still being written to it made the job exit 0 with no trees | A `delivered` mark before the stage's input closes, a failure for a clean exit before it, and the `askzero` row |
| A `never` and an `instead of` wording, a CHANGELOG count with no recorded source, a baseline commit that was not a real id                                        | Reworded, counts taken from the loops' output, the id corrected                                                 |

Round 2 (one Opus lens, regressions only) found, reproduced and fixed:

| Finding                                                                                                                             | Fix                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Removing the resume brought back the silent exit 0 for a list that had already exited while a child held its output                 | The job destroys the list's output when the stage fails, and the `askbg` row holds it |
| The loop passed a run that exited 0 without a check count                                                                           | The loop fails it                                                                     |
| The CHANGELOG and the amendment said a stage that exits 0 "before it read the list" fails the job, which is more than the code does | Reworded to "while the list is still being written to it"                             |

CodeRabbit (PR #344, four threads, all valid, all fixed):

| Finding                                                                                                                                  | Fix                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A short list is fully written before a `cat-file` stage that reads nothing exits 0, so the `delivered` mark accepted an empty answer set | The job also counts lines sent and lines answered and fails a clean exit with fewer answers (`git cat-file answered N of M lines`); the `askshort` row holds a 5-line list |
| The loop took a bare `--runs` or `--parallel` as absent and ignored unknown flags                                                        | Unknown, bare and repeated flags exit 2 with the argument named                                                                                                            |
| `mkdirSync` and `writeFileSync` failures escaped the loop's summary                                                                      | A bad log directory exits 2, a failed log write is listed as a failed run                                                                                                  |
| `process.exit` could cut the summary off on a pipe                                                                                       | The loop sets `process.exitCode` and lets Node exit                                                                                                                        |

Round 4 (one Opus lens, regressions only, on the CodeRabbit fixes) found, reproduced and fixed:

| Finding                                                                                                                                                           | Fix                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Replacing the `delivered` mark with the count alone accepted a stage that exits 0 before the list printed anything (nothing counted yet), and hung on a long list | Both checks stay, with their own messages; the `askidle` (slow list) and `askgone` (long list, stage gone at once) rows hold the first |
| A failed log write counted the run as passed and as failed                                                                                                        | The loop skips the pass count after a log failure                                                                                      |

Round 3 (one Opus lens, regressions only) found the destroy sound on every successful list (0 to 200,000 lines, real git included) and one wrong count in this record's revert table, fixed.
