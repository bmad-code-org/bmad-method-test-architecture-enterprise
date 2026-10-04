---
title: "Story 1.112: Keep other sessions' commits from failing a run's adopter-tree check"
type: 'bugfix'
created: '2026-10-04'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '3487a9185da6ad67659be37be03e650bc2f5a78e'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.112; Story 1.31)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.112 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-7, AD-8)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.31.md (the confinement this story narrows the comparison for)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.85.md (the record format)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** `adopterTreeState` (`cli/lib/evaluate/workspace.js`) digests every ref of the project's repository and the repository's common git directory, besides `git status` and the content of the paths it names.
A commit, fetch or branch in any other worktree of the same repository while a `preflight` or `run` is in flight changes that digest, so the run exits 12 ("changed during the qualification") with no qualified probe written.
Story 1.46's first live preflight failed this way after twelve minutes with no file edited, and the story ran its live legs from a standalone clone to avoid it.
A confined target works in a private repository and cannot reach the shared refs, so the comparison guards nothing there; an opted-out target can write them, which is what the comparison is for.

**Approach:** `adopterTreeState` takes a `sharedState` option.
`preflight.js` passes `sharedState: !confines(confinement)`, so a confined run reads `git status` and the content of every path it names, and an opted-out run also reads the refs and the shared git state.
The CLI reference says which readings each run takes and tells a maintainer who shares a repository with other sessions to run an opted-out evaluation from a standalone clone.

## Boundaries & Constraints

**Always:** A confined run still compares the working tree in full: a tracked file edited, or an untracked file created, while the run is in flight exits 12.
An opted-out run keeps the comparison it has today, so a target that runs `git update-ref` or writes `.git/config` exits 12.
`run.json` records `adopterTree.unchanged: true` when only the shared state moved in a confined run.
Outside a git repository the tree digest of `launch.root` stays the comparison for both modes.
The engine check runs at start and end.
No eval-quality change.
No skill file changes: `references/ci.md`, `SKILL.md`, `assets/evaluation-ci-plan.template.json` and every `capture-record.json` stay as they are.

**Never:** a shared-state comparison switched off for an opted-out run, a tolerance for some refs, a new `evaluation.json` field, a change to the profiles, to what a confined target can read or write, or to the isolation golden, a new dependency.

**Decisions (build worker, owner-delegated):** the Decisions list below carries each choice with its reason.

## I/O & Edge-Case Matrix

| Scenario                       | Input / State                                                                       | Expected Output / Behavior                                                                   | Error Handling |
| ------------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------- |
| Foreign commit, confined       | a branch and a commit made in a second worktree while the first clean trial is held | run exits 0, `run.json` `adopterTree.unchanged: true`, `confinement` is the host's mechanism | n/a            |
| Tracked edit, confined         | a line appended to `rules/policy.txt` while the trial is held                       | run exits 12 naming the adopter's tree, `unchanged: false`                                   | exit 12        |
| Untracked file, confined       | a new file in the project while the trial is held                                   | run exits 12 naming the adopter's tree, `unchanged: false`                                   | exit 12        |
| Target git write, confined     | the target runs `git update-ref` or `git config --local`                            | run exits 0, the project's refs and configuration are as they were                           | n/a            |
| `git update-ref`, opted out    | the target runs `git update-ref refs/heads/written-by-target HEAD`                  | run exits 12, `confinement: opt-out`, `unchanged: false`                                     | exit 12        |
| `.git/config` write, opted out | the target runs `git config --local tea.written by-target`                          | run exits 12, `confinement: opt-out`, `unchanged: false`                                     | exit 12        |
| Reference                      | `docs/reference/tea-evaluate-cli.md`, section `## The workspace`                    | names the two comparisons and the standalone-clone advice                                    | n/a            |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/workspace.js`: `adopterTreeState` gains `sharedState` (default `true`); the refs and `sharedStateDigest` are read only with it.
- `cli/lib/evaluate/preflight.js`: `readTree` passes `sharedState: !confines(confinement)`; the exit message names refs and shared git state only when they were compared.
- `test/test-evaluate-run.js`: `checkSharedStateAcrossSessions` (held confined runs, a confined target's git writes, the opted-out writes), `checkWorkspaceReference`, helpers `heldGate`, `heldRun` and `foreignCommit`.
- `test/fixtures/evaluate/mutation/bin/verdict.js`: the acts `hold-gate`, `update-ref` and `write-config`.
- `docs/reference/tea-evaluate-cli.md` (`## The workspace`), `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `ARCHITECTURE-SPINE.md` (AD-8), `sprint-status.yaml`, `story-1.85.md` (status `done`).
- Not changed: the profiles and the isolation golden, the skill's guides, `references/ci.md`, `SKILL.md`, the CI plan template, every `capture-record.json`.

## Tasks & Acceptance

- [x] Reproduce through the real CLI on the unchanged code: a confined run held in flight while a second worktree commits.
- [x] `workspace.js`, `preflight.js`: the `sharedState` option and its use.
- [x] `test/test-evaluate-run.js`, `verdict.js`: the cases, each with its revert check below.
- [x] Reference sentences and their case, `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `ARCHITECTURE-SPINE.md`, `sprint-status.yaml`, this record.

**Acceptance Criteria:** as in `epics.md` Story 1.112, with the amendment dated 2026-10-04 there (the cases and their stub acts).

## Reproduction

Run first on the unchanged code, through the real CLI (`checkSharedStateAcrossSessions` against the unchanged `workspace.js` and `preflight.js`): a confined `run` of the verdict fixture whose first clean trial is held by the stub act `hold-gate`, with the case making a branch and a commit in a second worktree of the project's repository while the trial is held.
2 of 34 checks failed: the run exited 12 where 0 was expected, with "the adopter's tree at <repository> (its git status, file contents or shared git state) changed during the trials, so no trial set is written", and `run.json` recorded `adopterTree.unchanged: false` with `confinement: seatbelt`.
The other cases passed on the unchanged code: a tracked edit and an untracked file exit 12, a confined target's `git update-ref` and `git config` leave the shared state alone, and both opted-out writes exit 12.
So the defect is the one case, and the rest are the guards the change must keep.

## Decisions

1. **The confinement mode picks the comparison.**
   A confined target works in a private repository (Story 1.57) and its sandbox withholds the project's git directory, so it can neither read nor write the refs and configuration a worktree shares; an opted-out target can.
   `readTree` already knows which of the two the run is (`confines(confinement)`), so `preflight.js` passes `sharedState: !confines(confinement)` and no new input exists.
2. **Rejected: a per-evaluation setting that turns the shared-state comparison off.**
   The confinement mode already says whether a target can write the shared state, so a second switch could only disagree with it; the owner's rule is to leave out a capability nobody needs.
3. **Rejected: a comparison limited to the refs the evaluated commit reaches, or a tolerance for refs outside the evaluated branch.**
   An opted-out target can write any ref, tag or configuration key, and the guard exists for that case.
   For a confined run the whole shared state is out of reach, so a partial comparison there adds a false stop and no protection.
4. **Rejected: dropping the shared-state comparison for every run.**
   An opted-out target that runs `git update-ref` or writes `.git/config` would then change the adopter's repository without a stop; the I/O matrix keeps both writes at exit 12.
5. **Rejected: snapshotting the refs the run itself created and comparing the rest.**
   It needs the run to name its own writes to git (a worktree add, a branch, a tag), which a second implementation of what `GIT_BOOKKEEPING` already excludes, and it still stops the confined run on a foreign commit.
6. **`sharedState` defaults to `true`.**
   Every caller that does not say keeps the comparison it had, and `preflight.js` is the one caller that narrows it.
7. **`run.json` gains no field.**
   `confinement` is recorded beside `adopterTree`, and the reference says which comparison each value takes, so a reader needs no further record; `adopterTree.unchanged` keeps its meaning.
8. **The exit message names refs and shared git state only when they were compared.**
   A confined run that stops now says "its git status, file contents" and an opted-out run keeps naming "refs or shared git state", so the message never blames state the run did not read.
   Every case that greps the refusal greps "the adopter's tree", which both messages keep.
9. **The target is held through its working directory.**
   The stub act `hold-gate` writes `gate-started` in its working directory and waits for `gate-release` there.
   The working directory is the one place a confined target can write and the case, which is not confined, can read and write too; the host's mechanism needs no grant, a network port or a path outside the workspace, so the case runs unchanged under Seatbelt and Bubblewrap.
   `heldRun` finds the file by scanning the trial's workspace directory two levels deep, since the layout under it differs by workspace kind.
10. **The foreign change is a branch and a commit in a second worktree.**
    It is the change the story names (another session in the same repository) and it moves a ref of the shared git directory.
    The case removes the worktree afterwards.
11. **The cases run on the host's own mechanism, with no skip.**
    The brief names Bubblewrap cases that run on the ubuntu CI job and skip on macOS; these cases name no mechanism, so Seatbelt carries them here and Bubblewrap carries them in CI.
    The Linux run is therefore CI's: no container ran in this build.
12. **A confined `preflight` has its own held case.**
    `preflight` and `run` read the project through one `readTree`, but a case holds the mutated arm of a `preflight` too (stub label `mutated-M-001`), since the story names both commands.
13. **A confined target's own git writes leave the shared state as it was.**
    The case runs `git update-ref` and `git config --local` from a confined target, asserts the stub ran each (a `: exit <code>` line is in the trial's stdout, whose label the record scrubs to `[redacted]`) and that the project's refs and configuration are as they were, which holds the premise that makes decision 1 safe.
    On macOS git refuses both writes (exit 128 for `update-ref`, 255 for `config`), since the private repository is read-only to the target; the case reads no exit code, so a host where the write lands in the private repository passes the same way.
    The first draft asserted exit 0 and the review found it vacuous in the other direction, which is why it asserts that the command ran.
14. **The project's own `HEAD` is no longer part of the comparison.**
    `sharedStateDigest` held the common directory's `HEAD`, so a `git checkout` or an empty commit in the project's own checkout stopped a run even with a clean status.
    Every workspace of the run is built from the commit the run started on, so the run's result does not depend on it, and the story asks for the working tree alone.
    A commit in the checkout that changes a file still shows in `git status`.

## Implementation Notes

- `adopterTreeState` reads `git status` and the content digest of the paths it names first, and the refs and `sharedStateDigest` only when `sharedState` is true; a confined run's state has the keys `repository`, `status` and `changes`, so the equality `treeUnchanged` takes is over those three.
- `uncommittedUnder` and the `before.status` log line read `status`, which both modes carry.
- The comparison outside a git repository is the tree digest of `launch.root` in both modes, unchanged.
- The reference's `## The workspace` section carries the new sentences; its earlier statement that a confined run "keeps the same checks" now says it compares the working tree the same way.
- Linux: no container ran in this build (the owner decides container calls); the Linux CI job runs `checkSharedStateAcrossSessions` and `checkWorkspaceReference` under Bubblewrap.

## Revert observations

Each revert was applied once to a scratch copy of the final tree under the scratchpad directory (not the working tree), the named case run, the failed-check count recorded and the copy restored.

| Revert (the one edit)                                                                                         | Case run                       | Observed                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The shared-state comparison restored for a confined run (`sharedState: true` in `readTree`)                   | `--only="shared git state"`    | 3 of 38 fail: the held confined `run` exits 12 where 0 is expected and records `unchanged: false`, and the held confined `preflight` exits 12                                                 |
| The shared-state comparison removed for an opted-out run (`sharedState: false`)                               | `--only="shared git state"`    | 6 of 38 fail: the `git update-ref` target and the `.git/config` target each exit 0 where 12 is expected, with no refusal naming the adopter's tree and `run.json` recording `unchanged: true` |
| The working tree not compared for a confined run (the confined state returns an empty `status` and `changes`) | `--only="shared git state"`    | 6 of 38 fail: the tracked edit and the untracked file each exit 0 where 12 is expected, with no refusal and `unchanged` not false                                                             |
| The standalone-clone sentence deleted from `## The workspace`                                                 | `--only="workspace reference"` | 1 of 3 fails                                                                                                                                                                                  |

The unchanged code is the reproduction: the first row's case failed 2 of 34 checks there (the held `run`), before the `preflight` case was added.

## Gates

Run one host-heavy gate at a time, on a machine shared with the other lanes.
No full local `npm test`: the hook and CI carry the chain.

Local, macOS (Seatbelt), on the build's tree:

- `test:evaluate-confinement` 1,363 checks green, run once (the new case is 38 of them and `checkWorkspaceReference` 3); the review round then added two assertions to the new case, which `--only="shared git state"` ran green at 42 checks.
- `test:evaluate-preflight` 324, `test:evaluate-mutation` 727, `test:evaluate-run` 592, `test:evaluate-guidance`, `test:evaluate-arms` 733, `test:evaluate-evaluators` 800, `test:evaluate-ci`, `test:evaluate-partition-plans`, `test:evaluate-compare`, `test:evaluate-dogfood`: green (the last seven read `test/fixtures/evaluate/mutation`, whose stub gained three acts).
- `npm run lint`, `npm run lint:md`, `npm run format:check`, `npm run docs:validate-links`: green.
- `test:doc-counts`, `test:doc-claims`, `test:shards`, `test:ci-coverage`, `test:changelog`, `test:bmad-output-gated` 127: green on the final tree.
- Linux: no container ran, since the owner decides container calls; the Linux CI job runs `checkSharedStateAcrossSessions` and `checkWorkspaceReference` under Bubblewrap.
- Engine check at the start and the end: exit 0. `git diff -- package.json package-lock.json` is empty.

## Build review

One subagent reviewed the commit in three lenses (correctness, test quality, compliance), read only, in place of `/bmad-code-review`.
Every finding was checked against the code or by running the case before it was acted on.

| Finding                                                                                                                                                                                                        | Verdict           | Route                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Medium (tests): the `shared-contained` loop asserts no outcome of the target's git write, so it passes whether the write is refused or never ran, and three records said "changes the private repository only" | valid, reproduced | Fixed here: the loop asserts the stub ran each command (macOS git refuses both, exit 128 and 255, which is what the records now say); Decision 13 records it |
| Medium (docs): `epics.md` said a confined `preflight` is not held in flight by a separate case, and the test holds it                                                                                          | valid             | Fixed here                                                                                                                                                   |
| Low (docs): the reference said "another session in the same repository", which a commit in the project's own checkout contradicts                                                                              | valid             | Fixed here: "in another worktree of the same repository"                                                                                                     |
| Low (style, records): "no longer stops" is the forbidden shape, "exercises Bubblewrap" states a result no run gave, the committed record held TODO sections                                                    | valid             | Fixed here                                                                                                                                                   |
| Low (adversarial): the project's own `HEAD` left the comparison, so a `git checkout` or an empty commit in the checkout with a clean status goes unseen                                                        | valid, accepted   | Decision 14: every workspace is built from the commit the run started on, so the result does not depend on it                                                |
| Low (tests): `heldRun` kills only the CLI on its deadline path and a throwing `during` leaves the second worktree in the temp project                                                                          | valid, accepted   | The temp project is removed by the suite's scratch cleanup; neither path occurs in a passing run                                                             |

The review left no finding for a new story.
