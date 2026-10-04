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
A confined target works in a private repository and cannot reach the shared refs; an opted-out target can write them, which is what the comparison is for.
The evaluation layer (the command evaluator, the HTTP probe port, the judge, the sealed-brief agent) ran under a profile that let it write the project's `.git/config`, `hooks/` and refs, and the hooks directory a `core.hooksPath` names, so a confined run needs those writes refused.

**Approach:** `adopterTreeState` takes a boolean `sharedState` (default `true`), and every reading carries the checkout's own `HEAD`.
`preflight.js` passes `false` for a confined run, which reads `repository`, `head`, `status` and `changes` and no git directory, and `true` for an opted-out run, which also reads every ref, the common git directory and the hooks directory a `core.hooksPath` names outside it.
Every process of a confined run is denied a write to the project's common git directory (the target by its profile, the evaluation layer by the layer prefix: a Seatbelt deny rule, a Bubblewrap `--ro-bind`), and so is the hooks directory `core.hooksPath` names outside it, so no layer process can plant a hook, change the configuration or move a ref.
That denial is the guard of a confined run, and a digest of the git directory in a confined run could fire only on other sessions' work.
The CLI reference says which readings each run takes and tells a maintainer who shares a repository with other sessions to run an opted-out evaluation from a standalone clone.

## Boundaries & Constraints

**Always:** A confined run still compares the working tree in full and the checkout's own `HEAD`: a tracked file edited, an untracked file created or an edit committed in the project's own checkout while the run is in flight exits 12.
A ref, the configuration, branch tracking or an in-progress operation that changes in another worktree or the main checkout leaves a confined run alone.
The evaluation layer cannot write the project's common git directory or the hooks directory `core.hooksPath` names outside it: a layer process that runs `git update-ref`, writes `.git/config` or writes a hook is refused by the layer, and the run records the refs and the configuration untouched.
An opted-out run keeps the comparison it has today, the hooks directory included, so a target that runs `git update-ref`, writes `.git/config` or writes a hook exits 12.
`run.json` records `adopterTree.unchanged: true` when only the shared state moved in a confined run.
Outside a git repository the tree digest of `launch.root` stays the comparison for both modes.
The engine check runs at start and end.
No eval-quality change.
No skill file changes: `references/ci.md`, `SKILL.md`, `assets/evaluation-ci-plan.template.json` and every `capture-record.json` stay as they are.

**Never:** a shared-state comparison switched off for an opted-out run, a tolerance for some refs, a new `evaluation.json` field, a change to the target profiles, to what a confined target can read or write, or to the isolation golden's target entries, a new dependency.
The layer prefix is the one profile this story changes, and only by the write denial of the git directory and the hooks directory.

**Decisions (build worker, owner-delegated):** the Decisions list below carries each choice with its reason.

## I/O & Edge-Case Matrix

| Scenario                       | Input / State                                                                                                                                             | Expected Output / Behavior                                                                      | Error Handling |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------- |
| Foreign commit, confined       | a branch, a commit, a tag, a `gc`, a `push -u` and a `worktree add -b` from a remote-tracking ref in second worktrees while the first clean trial is held | run exits 0, `run.json` `adopterTree.unchanged: true`, `confinement` is the host's mechanism    | n/a            |
| Stopped rebase, linked project | the project is a linked worktree and the main checkout stops a conflicting rebase while the trial is held                                                 | run exits 0, `unchanged: true`                                                                  | n/a            |
| Tracked edit, confined         | a line appended to `rules/policy.txt` while the trial is held                                                                                             | run exits 12 naming the adopter's tree, `unchanged: false`                                      | exit 12        |
| Untracked file, confined       | a new file in the project while the trial is held                                                                                                         | run exits 12 naming the adopter's tree, `unchanged: false`                                      | exit 12        |
| Commit in the checkout         | a line appended to `rules/policy.txt` and committed in the project's repository                                                                           | run exits 12 naming the adopter's tree, `unchanged: false`                                      | exit 12        |
| Layer git writes, confined     | the command evaluator runs `git update-ref`, appends to `.git/config`, writes a hook in `hooks/` and writes a hook into the `core.hooksPath` directory    | each is refused, refs, configuration and hooks are as they were, run exits 0, `unchanged: true` | n/a            |
| Layer writes, folder outside   | the same evaluator, the evaluation folder outside the project's repository and `launch.root` pointing into it                                             | each is refused, run exits 0, `unchanged: true`                                                 | n/a            |
| Layer git writes, opted out    | the same evaluator in an opted-out run                                                                                                                    | all four land, run exits 12, `confinement: opt-out`, `unchanged: false`                         | exit 12        |
| Target git write, confined     | the target runs `git update-ref` or `git config --local`                                                                                                  | run exits 0, the project's refs and configuration are as they were                              | n/a            |
| `git update-ref`, opted out    | the target runs `git update-ref refs/heads/written-by-target HEAD`                                                                                        | run exits 12, `confinement: opt-out`, `unchanged: false`                                        | exit 12        |
| `.git/config` write, opted out | the target runs `git config --local tea.written by-target`                                                                                                | run exits 12, `confinement: opt-out`, `unchanged: false`                                        | exit 12        |
| Hook write, opted out          | the target writes `pre-commit` into the directory `core.hooksPath` names                                                                                  | run exits 12, `confinement: opt-out`, `unchanged: false`                                        | exit 12        |
| Reference                      | `docs/reference/tea-evaluate-cli.md`, section `## The workspace`                                                                                          | names the two comparisons and the standalone-clone advice                                       | n/a            |

</frozen-after-approval>

The frozen block above was edited in review rounds 1 and 2: round 1 narrowed the Never line from profile changes to target profiles and the isolation golden's target entries, and round 2 moved the guard from a digest to the layer denial and added the hooks directory.
The owner's delegation (rule 15, 2026-10-04: fix every real defect in the PR) required those changes, so the frozen block now reads as built.

## Code Map

- `cli/lib/evaluate/workspace.js`: `adopterTreeState` takes `sharedState` (boolean, default `true`) and every reading carries `head`, the checkout's own commit; `sharedStateDigest` reads the common git directory and the hooks directory `core.hooksPath` names outside it.
- `cli/lib/evaluate/confinement.js`: `commonGitDirectory`, `hooksDirectory`, `selectConfinement` takes a required `root` and returns `gitDirectory` and `hooksDirectory`, `seatbeltLayerProfile` and `bubblewrapLayerArguments` deny a write under both.
- `cli/lib/evaluate/preflight.js`: `selectConfinement` gets `launch.root`; `readTree` passes `false` for a confined run and `true` for an opted-out one; the exit message names the readings of the mode.
- `test/test-evaluate-run.js`: `checkSharedStateAcrossSessions`, `checkLayerGitDirectoryUnits`, `checkAdopterTreeModes`, `checkWorkspaceReference`, helpers `heldGate`, `heldRun`, `foreignCommit` and `makeProject`'s `outside` option.
- `test/fixtures/evaluate/mutation/bin/verdict.js`: the acts `hold-gate`, `update-ref`, `write-config` and `write-hook`.
- `docs/reference/tea-evaluate-cli.md` (`## The workspace` and `### File-system confinement`), `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `ARCHITECTURE-SPINE.md` (AD-8), `sprint-status.yaml`, `story-1.85.md` (status `done`).
- Not changed: the target profiles, the isolation golden (it pins the layer vectors of a confinement with no git directory, whose bytes are unchanged), the skill's guides, `references/ci.md`, `SKILL.md`, the CI plan template, every `capture-record.json`.

## Tasks & Acceptance

- [x] Reproduce through the real CLI on the unchanged code: a confined run held in flight while a second worktree commits.
- [x] `workspace.js`, `preflight.js`: the `sharedState` boolean, the checkout's `HEAD`, and their use.
- [x] `confinement.js`: the layer prefix denies a write under the project's common git directory and the `core.hooksPath` directory on both mechanisms, and `selectConfinement` requires `root`.
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
   `readTree` already knows which of the two the run is (`confines(confinement)`), so `preflight.js` passes `sharedState = false` for a confined run and `true` for an opted-out one, and no new input exists.
2. **Rejected: a per-evaluation setting that turns the shared-state comparison off.**
   The confinement mode already says whether a target can write the shared state, so a second switch could only disagree with it; the owner's rule is to leave out a capability nobody needs.
3. **Rejected: a comparison limited to the refs the evaluated commit reaches, or a tolerance for refs outside the evaluated branch.**
   An opted-out target can write any ref, tag or configuration key, and the guard exists for that case.
   For a confined run no ref is in reach of a target or of the evaluation layer (Decision 15), so a partial comparison there adds a false stop and no protection.
4. **Rejected: dropping the shared-state comparison for every run.**
   An opted-out target that runs `git update-ref` or writes `.git/config` would then change the adopter's repository without a stop; the I/O matrix keeps both writes at exit 12.
5. **Rejected: snapshotting the refs the run itself created and comparing the rest.**
   It needs the run to name its own writes to git (a worktree add, a branch, a tag), which a second implementation of what `GIT_BOOKKEEPING` already excludes, and it still stops the confined run on a foreign commit.
6. **`sharedState` defaults to `true`.**
   Every caller that does not say keeps the comparison it had, and `preflight.js` is the one caller that narrows it.
7. **`run.json` gains no field.**
   `confinement` is recorded beside `adopterTree`, and the reference says which comparison each value takes, so a reader needs no further record; `adopterTree.unchanged` keeps its meaning.
8. **The exit message names the readings of the run's mode.**
   A confined run that stops says "its git status, file contents or HEAD" and an opted-out run says "its git status, file contents, HEAD or the refs and shared git state", so the message names only state the run read.
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
    The case runs `git update-ref` and `git config --local` from a confined target, asserts the stub ran each (a `ref write: exit <code>` or `config write: exit <code>` line is in the trial's stdout; the stub names the line by what it did, since the record scrubs the act's own name to `[redacted]`, so a match on the act name never holds) and that the project's refs and configuration are as they were, which holds the premise that makes decision 1 safe.
    On macOS git refuses both writes (exit 128 for `update-ref`, 255 for `config`), since the private repository is read-only to the target; the case reads no exit code, so a host where the write lands in the private repository passes the same way.
    The first draft asserted exit 0 and the review found it vacuous in the other direction, which is why it asserts that the command ran.
14. **Every reading carries the checkout's own `HEAD`.**
    `git status` and the content of the paths it names miss an edit committed in the project's own checkout while a run is in flight, since status is clean before and after.
    The state holds the commit `git rev-parse HEAD` names in the checkout (`head`), which another worktree's commit cannot move, since `HEAD` is per worktree, so a confined run reads no git directory and the checkout's own commit is the one `HEAD` it compares.
    A `git checkout` to a branch at the same commit leaves the tree and the commit as they were, and the reading is equal.
15. **The evaluation layer cannot write the project's common git directory.**
    Found in round 1: the layer (the command evaluator, the HTTP probe port, the judge, the sealed-brief agent) ran under `(allow default)` on Seatbelt and `--bind / /` on Bubblewrap with only the evaluation folder read-only, so it could write `.git/config`, `hooks/` and the refs.
    Before the story such a write exited 12; with the working tree alone compared it exited 0 with `unchanged: true`, and a planted pre-commit hook runs the next time the adopter commits.
    The fix is in the layer prefix: `seatbeltLayerProfile` adds the common git directory's spellings to the `(deny file-write* ...)` rule beside the evaluation folder's, and `bubblewrapLayerArguments` adds `--ro-bind <dir> <dir>` after `--bind / /`.
    `selectConfinement` takes `root` (`launch.root` from `preflight`), resolves the directory with `git rev-parse --git-common-dir` from it, so a linked worktree resolves to the main repository's directory, returns it as `gitDirectory`, and refuses a path no profile can carry; a project in no git repository has `gitDirectory: null` and the vectors are the evaluation folder's alone.
    The target profiles and the isolation golden stay as they are, and the layer vectors the golden pins carry no git directory, so their bytes are unchanged and the golden needed no update.
16. **A confined run digests no git directory; the layer denial is the guard.**
    Round 1 kept a digest of the common git directory without its refs (`config`, `hooks/`, `info/`, `description`) for a confined run, and round 2 found it fails on ordinary work in other worktrees: `git push -u` and `git worktree add -b <b> <remote-tracking ref>` write `branch.<b>.*` into the shared `config`, and a rebase, cherry-pick, merge or `merge --squash` in the main checkout leaves `rebase-merge/`, `REBASE_HEAD`, `AUTO_MERGE`, `CHERRY_PICK_HEAD`, `MERGE_*`, `SQUASH_MSG`, `sequencer/`, `REVERT_HEAD`, `BISECT_*`, `TAG_EDITMSG`, `gc.pid` or `shallow` in the common directory, which the lanes do on every story.
    Every process of a confined run is denied a write to that directory (the target by its profile, the layer by Decision 15), so the denial is the guard and a digest of it fires on other sessions only.
    The confined reading holds `repository`, `head`, `status` and `changes`; the opted-out reading adds `refs` and `shared`, the whole common git directory without its bookkeeping (`objects`, `logs`, `worktrees`, `index`, `modules`, `lfs` and lock files).
    The list of reference entries a confined digest left out (`GIT_REFERENCE_STATE`), the `'configuration'` mode and the `references: false` option are removed, since nothing else used them.
17. **The Bubblewrap arguments are tested as an argument list on any host.**
    `checkLayerGitDirectoryUnits` reads the Seatbelt profile and the Bubblewrap vector and checks the git directory's and the hooks directory's binds come after `--bind / /` and the evaluation folder's bind; the end-to-end layer cases run on the host's mechanism, so macOS ran Seatbelt and the ubuntu CI job runs Bubblewrap.
    No container ran in this build; the ubuntu CI job runs `checkSharedStateAcrossSessions` and `checkWorkspaceReference` under Bubblewrap.
18. **A `core.hooksPath` outside the git directory is protected like the git directory.**
    This repository sets `core.hooksPath` to `.husky/_` (gitignored), which lies outside the common git directory, so a layer process could plant a hook the adopter's next commit runs.
    `selectConfinement` also resolves `git -C <root> rev-parse --git-path hooks` to a real path (relative to `root`), and when that directory exists outside the common git directory it is denied to the layer on both mechanisms with the same profile-safe path check and refusal wording as the git directory, and carried in the confinement object as `hooksDirectory`.
    An opted-out run digests that directory in its full comparison (`sharedStateDigest`), since its target can write it.
    A hooks path inside the git directory is the git directory's own and adds nothing.
19. **`selectConfinement` requires `root`.**
    A call without it defaulted `root` to the evaluation folder, so a caller that forgot it protected no repository and no case failed.
    The argument is required and a call without it throws a `TypeError`; every caller passes it (`launch.root` in `preflight.js`, the folder in the cases that have no project).
    The evaluator case with the evaluation folder outside the project's repository (`launch.root` pointing into one) fails when the default returns, which the revert table records.

## Implementation Notes

- `adopterTreeState` reads `git status`, the content digest of the paths it names and the checkout's `head`; with `sharedState` it also reads `shared` (`sharedStateDigest`, the hooks directory included) and `refs`, so a confined run's state has the keys `repository`, `head`, `status` and `changes`, an opted-out run's adds `refs` and `shared`, and the equality `treeUnchanged` takes is over the keys of the run's own mode.
- `uncommittedUnder` and the `before.status` log line read `status`, which both modes carry.
- The comparison outside a git repository is the tree digest of `launch.root` in both modes, unchanged.
- The reference's `## The workspace` section carries the new sentences; its earlier statement that a confined run "keeps the same checks" says it compares the working tree and the checkout's `HEAD` the same way, and `### File-system confinement` says the evaluation layer's processes cannot write the project's git directory or the hooks directory `core.hooksPath` names.
- Linux: no container ran in this build; the ubuntu CI job runs `checkSharedStateAcrossSessions` and `checkWorkspaceReference` under Bubblewrap.

## Revert observations

Each revert was applied once to a scratch copy of the final tree under the scratchpad directory (not the working tree), the named case run, the failed-check count recorded and the copy restored.
The `--only` filters match case names: `--only="shared git state across"` runs `checkSharedStateAcrossSessions` (85 checks), `--only="shared git state"` runs that case and `checkAdopterTreeModes` (85 and 15, 100 checks), `--only="evaluation layer's git directory"` runs `checkLayerGitDirectoryUnits` (14), `--only="adopter-tree readings"` runs `checkAdopterTreeModes` alone (15) and `--only="workspace reference"` runs `checkWorkspaceReference` (3).
The counts below are of the final tree, rerun after review round 2.

| Revert (the one edit)                                                                                              | Case run                                    | Observed                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A confined run reads the full shared state (`sharedState = true` in `preflight.js`)                                | `--only="shared git state"`                 | 5 of 100 fail: the held confined `run` and `preflight` exit 12 where 0 is expected, and so does the linked-worktree run whose main checkout stopped a rebase                                                 |
| An opted-out run reads the working tree only (`sharedState = false`)                                               | `--only="shared git state"`                 | 13 of 100 fail: the evaluator's four writes, the `git update-ref`, `git config` and `write-hook` targets each exit 0 where 12 is expected, with no refusal and `unchanged: true`                             |
| The checkout's `head` left out of the state                                                                        | `--only="shared git state"`                 | 7 of 100 fail: `shared-committed` exits 0 where 12 is expected, and the readings case sees no `head` key and no change from a commit in the checkout                                                         |
| The confined working tree not compared (`status` and `changes` empty)                                              | `--only="shared git state"`                 | 8 of 100 fail: the tracked edit and the untracked file each exit 0 where 12 is expected, with no refusal and `unchanged` not false                                                                           |
| A confined run digests the git directory (`shared` read when `sharedState` is `false`)                             | `--only="shared git state"`                 | 10 of 100 fail: the confined run, the confined `preflight` and the linked-worktree run exit 12 on `push -u`, `worktree add -b` and a stopped rebase, and the readings case sees `shared` and a moved reading |
| The layer profile without the git and hooks directories (`layerPrefix` passes neither to the Seatbelt profile)     | `--only="shared git state"`                 | 4 of 100 fail: the evaluator's `git update-ref`, `.git/config`, hook and hooks-path writes are allowed in the inside and the outside variant                                                                 |
| The same revert, read as units                                                                                     | `--only="evaluation layer's git directory"` | 2 of 14 fail: the Seatbelt profile denies neither the git directory nor the hooks directory                                                                                                                  |
| The Bubblewrap layer vector without the git directory's `--ro-bind`                                                | `--only="evaluation layer's git directory"` | 1 of 14 fails: the vector does not bind the git directory read-only after the evaluation folder and `--bind / /`                                                                                             |
| The Bubblewrap layer vector without the hooks directory's `--ro-bind`                                              | `--only="evaluation layer's git directory"` | 1 of 14 fails: the vector does not bind the hooks directory read-only after the git directory                                                                                                                |
| The Seatbelt profile without the hooks directory                                                                   | `--only="shared git state"`                 | 4 of 100 fail: the evaluator's write into the `core.hooksPath` directory is allowed in the inside and the outside variant, and the file is present afterwards                                                |
| `selectConfinement` resolves no hooks directory (`hooks = null`)                                                   | `--only="shared git state"`                 | 4 of 100 fail: the same two variants                                                                                                                                                                         |
| `selectConfinement` without `root`: the default `root = folder` back and the call in `preflight.js` without `root` | `--only="shared git state across"`          | 2 of 85 fail: in the variant with the evaluation folder outside the repository the evaluator's `update-ref`, `.git/config`, hook and hooks-path writes land                                                  |
| The required-`root` check removed from `selectConfinement`                                                         | `--only="evaluation layer's git directory"` | 1 of 14 fails: a call without `root` does not throw                                                                                                                                                          |
| The full reading without the hooks directory                                                                       | `--only="shared git state"`                 | 5 of 100 fail: the opted-out target's `write-hook` exits 0 where 12 is expected, and a hook in the `core.hooksPath` directory leaves the full reading unchanged                                              |
| `config` left out of the full digest                                                                               | `--only="shared git state"`                 | 5 of 100 fail: the `git config` target exits 0 where 12 is expected, and a configuration write leaves the full reading unchanged                                                                             |
| `hooks` left out of the full digest                                                                                | `--only="shared git state"`                 | 1 of 100 fails: a hook leaves the full reading unchanged                                                                                                                                                     |
| `info` left out of the full digest                                                                                 | `--only="shared git state"`                 | 1 of 100 fails: an `info/exclude` entry leaves the full reading unchanged                                                                                                                                    |
| The refs left out of the full reading                                                                              | `--only="shared git state"`                 | 1 of 100 fails: the full reading holds no `refs` key                                                                                                                                                         |
| The standalone-clone sentence deleted from `## The workspace`                                                      | `--only="workspace reference"`              | 1 of 3 fails                                                                                                                                                                                                 |
| The sentence about the confined reading deleted from `## The workspace`                                            | `--only="workspace reference"`              | 1 of 3 fails                                                                                                                                                                                                 |

`heldRun`'s release write was made to fail on a scratch copy (the gate directory removal refused with ENOTEMPTY before the write): the helper killed the CLI's process group it started, awaited it and rethrew, and no CLI process of the case remained.
The first build's reproduction (the unchanged code failed 2 of 34 checks in the held confined `run`) is the baseline for the first row.

## Gates

Run one host-heavy gate at a time, on a machine shared with the other lanes.
No full local `npm test`: the hook and CI carry the chain.

Local, macOS (Seatbelt), on the final tree after review round 2:

- `test:evaluate-confinement` 1,439 checks green, run once (`checkSharedStateAcrossSessions` 85, `checkLayerGitDirectoryUnits` 14, `checkAdopterTreeModes` 15, `checkWorkspaceReference` 3).
- `test:evaluate-preflight` 324, `test:evaluate-run` 592, `test:evaluate-guidance`, `test:isolation-primitives` (the golden over the layer vectors, unchanged): green.
- `test:doc-counts`, `test:doc-claims`, `test:shards` 183, `test:ci-coverage`, `test:changelog`: green.
- `npm run docs:validate-links`, `npm run lint`, `npm run lint:md`, `npm run format:check`: green.
- `npm run docs:build`: green on the final tree.
- Linux: no container ran in this build; the Bubblewrap layer arguments are read as an argument list by `checkLayerGitDirectoryUnits` on this host, and the ubuntu CI job runs `checkSharedStateAcrossSessions` (the evaluator's refused writes included) and `checkWorkspaceReference` under Bubblewrap.
- `git diff -- package.json package-lock.json` is empty.

## Build review

Round 0: one subagent reviewed the commit in three lenses (correctness, test quality, compliance), read only, in place of `/bmad-code-review`.
Every finding was checked against the code or by running the case before it was acted on.

| Finding                                                                                                                                                                                                        | Verdict           | Route                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Medium (tests): the `shared-contained` loop asserts no outcome of the target's git write, so it passes whether the write is refused or never ran, and three records said "changes the private repository only" | valid, reproduced | Fixed here: the loop asserts the stub ran each command (macOS git refuses both, exit 128 and 255, which is what the records now say); Decision 13 records it |
| Medium (docs): `epics.md` said a confined `preflight` is not held in flight by a separate case, and the test holds it                                                                                          | valid             | Fixed here                                                                                                                                                   |
| Low (docs): the reference said "another session in the same repository", which a commit in the project's own checkout contradicts                                                                              | valid             | Fixed here: "in another worktree of the same repository"                                                                                                     |
| Low (style, records): "no longer stops" is the forbidden shape, "exercises Bubblewrap" states a result no run gave, the committed record held TODO sections                                                    | valid             | Fixed here                                                                                                                                                   |
| Low (adversarial): the project's own `HEAD` left the comparison, so a `git checkout` or an empty commit in the checkout with a clean status goes unseen                                                        | valid             | Fixed in round 1: every reading carries the checkout's own `HEAD` (Decision 14)                                                                              |
| Low (tests): `heldRun` kills only the CLI on its deadline path and a throwing `during` leaves the second worktree in the temp project                                                                          | valid             | Fixed in round 1: `heldRun` starts the CLI in its own process group and kills the group, and `foreignCommit` removes its worktree when a step throws         |

Round 1: Opus reviewed the commit in two lenses, both reproduced the findings, and each was fixed in this PR.

| Finding                                                                                                                                                                                                                                                                           | Verdict           | Route                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| High: the evaluation layer ran under `(allow default)` and `--bind / /` with only the evaluation folder read-only, so it could write the project's `.git/config`, `hooks/` and refs; before the story such a write exited 12 and with the working tree alone compared it exited 0 | valid, reproduced | Fixed: the layer prefix denies a write under the project's common git directory on both mechanisms (Decision 15)                                                                                                   |
| Medium: `git status` and the content of the named paths miss an edit committed in the project's own checkout while a run is in flight                                                                                                                                             | valid, reproduced | Fixed: the state carries the checkout's resolved `HEAD`, and `shared-committed` holds a commit in the project's repository at exit 12 (Decision 14); a commit in a second worktree on another branch still exits 0 |
| Low: the record's revert counts said "of 38" on a case of 42 checks                                                                                                                                                                                                               | valid             | Fixed: every revert reran on the final tree and the counts above are those of that run                                                                                                                             |
| Low: the `shared-contained` loop matched `/^.+: exit \d+$/m`, which never checks the act name                                                                                                                                                                                     | valid             | Fixed: it matches the line the act prints, `ref write` or `config write`, since the record scrubs the act's own name (Decision 13)                                                                                 |
| Low: Decision 14's heading had the forbidden antithesis shape                                                                                                                                                                                                                     | valid             | Fixed: Decision 14 states the checkout's `HEAD` is part of every reading                                                                                                                                           |

Round 1 left no finding open.

Round 2: Opus reviewed the round 1 commit, the reviewers reproduced the findings, and each was fixed in this PR.

| Finding                                                                                                                                                                                                                                                                                                                                                              | Verdict           | Route                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| High: the confined run's `configuration` digest failed on ordinary work in another worktree (`git push -u`, `git worktree add -b` from a remote-tracking ref write `branch.<x>.*` into the shared `config`; a rebase, cherry-pick, merge or `merge --squash` in the main checkout leaves `rebase-merge/`, `REBASE_HEAD`, `AUTO_MERGE`, `MERGE_*`, `gc.pid` and more) | valid, reproduced | Fixed: a confined run digests no git directory, since every process of it is denied a write there and the digest could fire on other sessions only (Decision 16); the `'configuration'` mode, `GIT_REFERENCE_STATE` and `references: false` are removed; `foreignCommit` adds `push -u` and `worktree add -b`, and a held case runs a stopped rebase in the main checkout of a linked-worktree project |
| Medium: `core.hooksPath` (this repository sets `.husky/_`) points hooks outside the common git directory, so a layer process could plant a hook the adopter's next commit runs                                                                                                                                                                                       | valid, reproduced | Fixed: `selectConfinement` resolves the hooks directory, the layer is denied a write there on both mechanisms, and an opted-out run digests it (Decision 18)                                                                                                                                                                                                                                           |
| Medium: `selectConfinement`'s `root` had no case that failed on revert                                                                                                                                                                                                                                                                                               | valid, reproduced | Fixed: `root` is required, and the evaluator case with the evaluation folder outside the project's repository fails when the default returns (Decision 19)                                                                                                                                                                                                                                             |
| Low (record): Gates said `checkSharedStateAcrossSessions` 73 checks while `--only="shared git state across"` runs 65 and `--only="shared git state"` runs 73 because it also matches `checkAdopterTreeModes`                                                                                                                                                         | valid             | Fixed: the counts are the real ones of the final tree and the Revert observations say which `--only` runs what                                                                                                                                                                                                                                                                                         |
| Low (record): the Linux lines of Implementation Notes and Gates carried wording the record does not use                                                                                                                                                                                                                                                              | valid             | Fixed: the record says no container ran in this build and the ubuntu CI job runs the two cases under Bubblewrap                                                                                                                                                                                                                                                                                        |
| Low (records): `epics.md` said a confined target and evaluator both run `git update-ref`, append to `.git/config` or write a hook and are refused, which no case holds for a target; the frozen block had been edited in round 1 without a note                                                                                                                      | valid             | Fixed: `epics.md` says what each case holds, and the record says the owner's delegation required the frozen block's changes                                                                                                                                                                                                                                                                            |
| Low (test): `heldRun` leaked its CLI process group when the release write threw                                                                                                                                                                                                                                                                                      | valid             | Fixed: it ends the group it started, awaits it and rethrows                                                                                                                                                                                                                                                                                                                                            |

Round 2 left no finding open.
