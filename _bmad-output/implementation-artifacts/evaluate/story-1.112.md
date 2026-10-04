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
The evaluation layer (the command evaluator, the HTTP probe port, the judge, the sealed-brief agent) ran under a profile that let it write the project's `.git/config`, `hooks/` and refs, so a confined run also needs those guarded.

**Approach:** `adopterTreeState` takes a `sharedState` option, `'full'` or `'configuration'`, and every reading carries the checkout's own `HEAD`.
`preflight.js` passes `'configuration'` for a confined run, which reads `git status`, the content of every path it names, the checkout's `HEAD` and the common git directory without its refs and the records that move with them, and `'full'` for an opted-out run, which also reads every ref.
The layer prefix denies a write under the project's common git directory (a Seatbelt deny rule, a Bubblewrap `--ro-bind`), so no layer process can plant a hook, change the configuration or move a ref.
The CLI reference says which readings each run takes and tells a maintainer who shares a repository with other sessions to run an opted-out evaluation from a standalone clone.

## Boundaries & Constraints

**Always:** A confined run still compares the working tree in full, the checkout's own `HEAD`, the git configuration and the hooks: a tracked file edited, an untracked file created, an edit committed in the project's own checkout, or a write to the configuration or a hook, while the run is in flight exits 12.
A ref that moves in another worktree leaves a confined run alone.
The evaluation layer cannot write the project's common git directory: a layer process that runs `git update-ref`, writes `.git/config` or writes a hook is refused, and the run records the refs and the configuration untouched.
An opted-out run keeps the comparison it has today, so a target that runs `git update-ref` or writes `.git/config` exits 12.
`run.json` records `adopterTree.unchanged: true` when only the shared state moved in a confined run.
Outside a git repository the tree digest of `launch.root` stays the comparison for both modes.
The engine check runs at start and end.
No eval-quality change.
No skill file changes: `references/ci.md`, `SKILL.md`, `assets/evaluation-ci-plan.template.json` and every `capture-record.json` stay as they are.

**Never:** a shared-state comparison switched off for an opted-out run, a tolerance for some refs, a new `evaluation.json` field, a change to the target profiles, to what a confined target can read or write, or to the isolation golden's target entries, a new dependency.
The layer prefix is the one profile this story changes, and only by the git directory's write denial.

**Decisions (build worker, owner-delegated):** the Decisions list below carries each choice with its reason.

## I/O & Edge-Case Matrix

| Scenario                       | Input / State                                                                                      | Expected Output / Behavior                                                                      | Error Handling |
| ------------------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------- |
| Foreign commit, confined       | a branch, a commit, a tag and a `gc` made in a second worktree while the first clean trial is held | run exits 0, `run.json` `adopterTree.unchanged: true`, `confinement` is the host's mechanism    | n/a            |
| Tracked edit, confined         | a line appended to `rules/policy.txt` while the trial is held                                      | run exits 12 naming the adopter's tree, `unchanged: false`                                      | exit 12        |
| Untracked file, confined       | a new file in the project while the trial is held                                                  | run exits 12 naming the adopter's tree, `unchanged: false`                                      | exit 12        |
| Commit in the checkout         | a line appended to `rules/policy.txt` and committed in the project's repository                    | run exits 12 naming the adopter's tree, `unchanged: false`                                      | exit 12        |
| Layer git writes, confined     | the command evaluator runs `git update-ref`, appends to `.git/config`, writes a hook               | each is refused, refs, configuration and hooks are as they were, run exits 0, `unchanged: true` | n/a            |
| Layer git writes, opted out    | the same evaluator in an opted-out run                                                             | all three land, run exits 12, `confinement: opt-out`, `unchanged: false`                        | exit 12        |
| Target git write, confined     | the target runs `git update-ref` or `git config --local`                                           | run exits 0, the project's refs and configuration are as they were                              | n/a            |
| `git update-ref`, opted out    | the target runs `git update-ref refs/heads/written-by-target HEAD`                                 | run exits 12, `confinement: opt-out`, `unchanged: false`                                        | exit 12        |
| `.git/config` write, opted out | the target runs `git config --local tea.written by-target`                                         | run exits 12, `confinement: opt-out`, `unchanged: false`                                        | exit 12        |
| Reference                      | `docs/reference/tea-evaluate-cli.md`, section `## The workspace`                                   | names the two comparisons and the standalone-clone advice                                       | n/a            |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/workspace.js`: `adopterTreeState` takes `sharedState: 'full' | 'configuration'` (default `'full'`) and every reading carries `head`, the checkout's own commit; `sharedStateDigest` takes `references: false` and leaves `GIT_REFERENCE_STATE` out.
- `cli/lib/evaluate/confinement.js`: `commonGitDirectory`, `selectConfinement` takes `root` and returns `gitDirectory`, `seatbeltLayerProfile` and `bubblewrapLayerArguments` deny a write under it.
- `cli/lib/evaluate/preflight.js`: `selectConfinement` gets `launch.root`; `readTree` passes `'configuration'` for a confined run and `'full'` for an opted-out one; the exit message names the readings of the mode.
- `test/test-evaluate-run.js`: `checkSharedStateAcrossSessions`, `checkLayerGitDirectoryUnits`, `checkAdopterTreeModes`, `checkWorkspaceReference`, helpers `heldGate`, `heldRun` and `foreignCommit`.
- `test/fixtures/evaluate/mutation/bin/verdict.js`: the acts `hold-gate`, `update-ref` and `write-config`.
- `docs/reference/tea-evaluate-cli.md` (`## The workspace` and `### File-system confinement`), `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `ARCHITECTURE-SPINE.md` (AD-8), `sprint-status.yaml`, `story-1.85.md` (status `done`).
- Not changed: the target profiles, the isolation golden (it pins the layer vectors of a confinement with no git directory, whose bytes are unchanged), the skill's guides, `references/ci.md`, `SKILL.md`, the CI plan template, every `capture-record.json`.

## Tasks & Acceptance

- [x] Reproduce through the real CLI on the unchanged code: a confined run held in flight while a second worktree commits.
- [x] `workspace.js`, `preflight.js`: the `sharedState` modes, the checkout's `HEAD`, and their use.
- [x] `confinement.js`: the layer prefix denies a write under the project's common git directory on both mechanisms.
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
   `readTree` already knows which of the two the run is (`confines(confinement)`), so `preflight.js` passes `'configuration'` for a confined run and `'full'` for an opted-out one, and no new input exists.
2. **Rejected: a per-evaluation setting that turns the shared-state comparison off.**
   The confinement mode already says whether a target can write the shared state, so a second switch could only disagree with it; the owner's rule is to leave out a capability nobody needs.
3. **Rejected: a comparison limited to the refs the evaluated commit reaches, or a tolerance for refs outside the evaluated branch.**
   An opted-out target can write any ref, tag or configuration key, and the guard exists for that case.
   For a confined run no ref is in reach of a target or of the evaluation layer (decision 15), so a partial comparison there adds a false stop and no protection.
4. **Rejected: dropping the shared-state comparison for every run.**
   An opted-out target that runs `git update-ref` or writes `.git/config` would then change the adopter's repository without a stop; the I/O matrix keeps both writes at exit 12.
5. **Rejected: snapshotting the refs the run itself created and comparing the rest.**
   It needs the run to name its own writes to git (a worktree add, a branch, a tag), which a second implementation of what `GIT_BOOKKEEPING` already excludes, and it still stops the confined run on a foreign commit.
6. **`sharedState` defaults to `'full'`.**
   Every caller that does not say keeps the comparison it had, and `preflight.js` is the one caller that narrows it.
7. **`run.json` gains no field.**
   `confinement` is recorded beside `adopterTree`, and the reference says which comparison each value takes, so a reader needs no further record; `adopterTree.unchanged` keeps its meaning.
8. **The exit message names the readings of the run's mode.**
   A confined run that stops says "its git status, file contents, HEAD or git configuration" and an opted-out run says "its git status, file contents, HEAD or the refs and shared git state", so the message names only state the run read.
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
    The state holds the commit `git rev-parse HEAD` names in the checkout (`head`), which another worktree's commit cannot move, since `HEAD` is per worktree, so the main checkout's `HEAD` file in the common git directory is left out of a `configuration` digest and the checkout's own commit replaces it.
    A `git checkout` to a branch at the same commit leaves the tree and the commit as they were, and the reading is equal.
15. **The evaluation layer cannot write the project's common git directory.**
    Found in round 1: the layer (the command evaluator, the HTTP probe port, the judge, the sealed-brief agent) ran under `(allow default)` on Seatbelt and `--bind / /` on Bubblewrap with only the evaluation folder read-only, so it could write `.git/config`, `hooks/` and the refs.
    Before the story such a write exited 12; with the working tree alone compared it exited 0 with `unchanged: true`, and a planted pre-commit hook runs the next time the adopter commits.
    The fix is in the layer prefix: `seatbeltLayerProfile` adds the common git directory's spellings to the `(deny file-write* ...)` rule beside the evaluation folder's, and `bubblewrapLayerArguments` adds `--ro-bind <dir> <dir>` after `--bind / /`.
    `selectConfinement` takes `root` (`launch.root` from `preflight`, the evaluation folder by default for a caller that has none), resolves the directory with `git rev-parse --git-common-dir` from it, so a linked worktree resolves to the main repository's directory, returns it as `gitDirectory`, and refuses a path no profile can carry; a project in no git repository has `gitDirectory: null` and the vectors are the evaluation folder's alone.
    The target profiles and the isolation golden stay as they are, and the layer vectors the golden pins carry no git directory, so their bytes are unchanged and the golden needed no update.
16. **A confined run keeps comparing the configuration, the hooks and `info/` as a second guard.**
    The digest costs one walk of a few small entries, and it covers a write by any process the layer profile does not wrap.
    `GIT_REFERENCE_STATE` lists what is left out, found by running `git worktree add`, `commit`, `branch`, `tag`, `fetch`, `pack-refs` and `gc` in a second worktree and diffing the common directory: `refs`, `packed-refs`, `HEAD`, `FETCH_HEAD`, `ORIG_HEAD`, `info/refs` (written by `gc`), plus `COMMIT_EDITMSG`, `MERGE_HEAD`, `MERGE_MSG`, `MERGE_MODE` and `gc.log`, which a commit, merge or gc in the main checkout leaves.
    `config`, `hooks/`, `info/exclude`, `info/attributes` and `description` stay in.
    `worktrees/`, `logs/`, `objects/`, `index`, `modules/`, `lfs/` and lock files were already left out as bookkeeping.
17. **The Bubblewrap arguments are tested as an argument list on any host.**
    `checkLayerGitDirectoryUnits` reads the Seatbelt profile and the Bubblewrap vector and checks the git directory's bind comes after `--bind / /` and the evaluation folder's bind; the end-to-end layer case runs on the host's mechanism, so macOS ran Seatbelt and the ubuntu CI job runs Bubblewrap.
    No container ran in this build.

## Implementation Notes

- `adopterTreeState` reads `git status`, the content digest of the paths it names and the checkout's `head`, then `sharedStateDigest` (without the reference entries for `configuration`) and, for `full`, every ref; a confined run's state has the keys `repository`, `head`, `status`, `changes` and `shared`, and an opted-out run's adds `refs`, so the equality `treeUnchanged` takes is over the keys of the run's own mode.
- `uncommittedUnder` and the `before.status` log line read `status`, which both modes carry.
- The comparison outside a git repository is the tree digest of `launch.root` in both modes, unchanged.
- The reference's `## The workspace` section carries the new sentences; its earlier statement that a confined run "keeps the same checks" says it compares the working tree, the checkout's `HEAD`, the git configuration and the hooks the same way, and `### File-system confinement` says the evaluation layer's processes cannot write the project's git directory.
- Linux: no container ran in this build (the owner decides container calls); the Linux CI job runs `checkSharedStateAcrossSessions` and `checkWorkspaceReference` under Bubblewrap.

## Revert observations

Each revert was applied once to a scratch copy of the final tree under the scratchpad directory (not the working tree), the named case run, the failed-check count recorded and the copy restored.
The counts are of the final tree: `shared git state` has 73 checks, `evaluation layer's git directory` and `adopter-tree readings` 8 each, `workspace reference` 3.

| Revert (the one edit)                                                                                        | Case run                                    | Observed                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A confined run compares the full shared state (`sharedState = 'full'` in `preflight.js`)                     | `--only="shared git state"`                 | 3 of 73 fail: the held confined `run` exits 12 where 0 is expected and records `unchanged: false`, and the held confined `preflight` exits 12                                      |
| An opted-out run compares the configuration only (`sharedState = 'configuration'`)                           | `--only="shared git state"`                 | 4 of 73 fail: the `git update-ref` target exits 0 where 12 is expected, with no refusal naming the adopter's tree and `unchanged: true`                                            |
| The checkout's `head` left out of the state                                                                  | `--only="shared git state"`                 | 6 of 73 fail: `shared-committed` exits 0 where 12 is expected with no refusal, and the `adopter-tree readings` case sees no `head` key and no change from a commit in the checkout |
| The confined working tree not compared (`status` and `changes` empty)                                        | `--only="shared git state"`                 | 8 of 73 fail: the tracked edit and the untracked file each exit 0 where 12 is expected, with no refusal and `unchanged` not false                                                  |
| The layer profile without the git directory (`layerPrefix` passes no `gitDirectory` to the Seatbelt profile) | `--only="shared git state"`                 | 4 of 73 fail: the evaluator's `git update-ref` exits 0, its `.git/config` and hook writes are allowed, the run exits 12 where 0 is expected and records `unchanged: false`         |
| The same revert, read as units                                                                               | `--only="evaluation layer's git directory"` | 1 of 8 fails: the Seatbelt profile does not deny the git directory                                                                                                                 |
| The Bubblewrap layer vector without the git directory's `--ro-bind`                                          | `--only="evaluation layer's git directory"` | 1 of 8 fails: the vector does not bind the git directory read-only after the evaluation folder and `--bind / /`                                                                    |
| `config` left out of the confined digest                                                                     | `--only="adopter-tree readings"`            | 1 of 8 fails: a configuration write leaves the reading unchanged                                                                                                                   |
| `hooks` left out of the confined digest                                                                      | `--only="adopter-tree readings"`            | 1 of 8 fails: a hook leaves the reading unchanged                                                                                                                                  |
| `packed-refs` kept in the confined digest                                                                    | `--only="adopter-tree readings"`            | 1 of 8 fails: a second worktree's commit, tag, gc, pack-refs and fetch change the reading                                                                                          |
| `info/refs` kept in the confined digest                                                                      | `--only="adopter-tree readings"`            | 1 of 8 fails: the same second-worktree work changes the reading                                                                                                                    |
| The standalone-clone sentence deleted from `## The workspace`                                                | `--only="workspace reference"`              | 1 of 3 fails                                                                                                                                                                       |

The first build's reproduction (the unchanged code failed 2 of 34 checks in the held confined `run`) is the baseline for the first row.

## Gates

Run one host-heavy gate at a time, on a machine shared with the other lanes.
No full local `npm test`: the hook and CI carry the chain.

Local, macOS (Seatbelt), on the final tree after review round 1:

- `test:evaluate-confinement` 1,406 checks green, run once (`checkSharedStateAcrossSessions` 73, `checkLayerGitDirectoryUnits` 8, `checkAdopterTreeModes` 8, `checkWorkspaceReference` 3).
- `test:evaluate-preflight` 324, `test:evaluate-run` 592, `test:evaluate-guidance`, `test:isolation-primitives` (the golden over the layer vectors, unchanged): green.
- `test:doc-counts`, `test:doc-claims`, `test:shards` 183, `test:ci-coverage`, `test:changelog`: green.
- `npm run docs:validate-links`, `npm run lint`, `npm run lint:md`, `npm run format:check`: green.
- `npm run docs:build`: green on the final tree.
- Linux: no container ran, since the owner decides container calls; the Bubblewrap layer arguments are read as an argument list by `checkLayerGitDirectoryUnits` on this host, and the Linux CI job runs `checkSharedStateAcrossSessions` (the evaluator's refused writes included) and `checkWorkspaceReference` under Bubblewrap.
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

| Finding                                                                                                                                                                                                                                                                           | Verdict           | Route                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| High: the evaluation layer ran under `(allow default)` and `--bind / /` with only the evaluation folder read-only, so it could write the project's `.git/config`, `hooks/` and refs; before the story such a write exited 12 and with the working tree alone compared it exited 0 | valid, reproduced | Fixed: the layer prefix denies a write under the project's common git directory on both mechanisms (Decision 15), and the confined comparison keeps the configuration, hooks and `info/` as a second guard (Decision 16) |
| Medium: `git status` and the content of the named paths miss an edit committed in the project's own checkout while a run is in flight                                                                                                                                             | valid, reproduced | Fixed: the state carries the checkout's resolved `HEAD`, and `shared-committed` holds a commit in the project's repository at exit 12 (Decision 14); a commit in a second worktree on another branch still exits 0       |
| Low: the record's revert counts said "of 38" on a case of 42 checks                                                                                                                                                                                                               | valid             | Fixed: every revert reran on the final tree and the counts above are those of that run                                                                                                                                   |
| Low: the `shared-contained` loop matched `/^.+: exit \d+$/m`, which never checks the act name                                                                                                                                                                                     | valid             | Fixed: it matches the line the act prints, `ref write` or `config write`, since the record scrubs the act's own name (Decision 13)                                                                                       |
| Low: Decision 14's heading had the forbidden antithesis shape                                                                                                                                                                                                                     | valid             | Fixed: Decision 14 states the checkout's `HEAD` is part of every reading                                                                                                                                                 |

Round 1 left no finding open.
