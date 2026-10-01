---
title: "Story 1.57: Withhold the committed evaluation folder from a confined target's git history"
type: 'bugfix'
created: '2026-10-01'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'b4bcff028f5eebd24935b582caec73917e1e8b28'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.57)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.57 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-7, AD-8)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.62.md (the shared primitives and the byte-identity golden)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** A git workspace is a worktree of the evaluated commit. Its `.git` file names a directory under the adopter's git directory, whose `commondir` is the adopter's own object store. The workspace leaves the evaluation folder's files out of the checkout, and the confinement withholds the folder on disk, while a confined target still reads the project's git directory. A target that runs `git show <commit>:<evaluation folder>/contract.json`, or `git cat-file` on a blob it finds through `git ls-tree`, reads the committed contract, probes and mutations.

**Approach:** For a confined run, each git workspace gets a private withheld repository beside its checkout, and the confinement withholds the adopter's git directory from the target. The withheld repository is a bare store under the workspace directory that holds every commit, tree and blob reachable from the evaluated commit except the objects reachable only through the evaluation folder's subtree at some commit. Each such subtree object is replaced by the empty tree through a `refs/replace/` entry, so the evaluated commit, its history and every commit id stay byte-identical and git never reads a folder object. The worktree's metadata `commondir` is repointed at that store and its index is rebuilt from the replaced tree. Under both mechanisms the adopter's git directory is unreadable and unwritable to the target except the one worktree metadata directory the target's `.git` file names.

## Boundaries & Constraints

**Always:** reuse `createWorkspace`, `worktreeMetadataOf` and `removeWorkspace`: the worktree is still made by `git worktree add`, registered in the adopter's repository and removed by `git worktree remove`, so the journal, the reclaim of killed runs and the shared-state digest keep working unchanged. The withheld repository lives inside the workspace directory and outside the checkout (the target may not write it), and `removeWorkspace` removes it with the directory. Commit ids, `commitDigest`, `implementationDigest` and a historical probe's revisions stay unchanged. `git status`, `git log`, `git diff` and `git log -p` over the evaluated tree work in the checkout and print what they print today, except that the evaluation folder shows as an empty tree (no deletions listed). Build the withheld repository only when the run confines (a caller option such as `withholdHistory`); an opt-out run keeps today's worktree untouched. Every path the profiles carry goes through `assertProfileSafePath`. Update `test/fixtures/isolation-primitives/golden.json` with `TEA_UPDATE_ISOLATION_GOLDEN=1 npm run test:isolation-primitives` and read the diff. The engine check runs at start and end. No eval-quality change.

**Never:** a rewritten commit or tree id, a ref or object written into the adopter's repository, `git worktree add` replaced by a second mechanism, an alternates file, a promisor remote, sparse checkout or a sparse index (a tree with a missing subtree makes `git status` and `git diff` fail), disabling replace refs, a snapshot of history truncated to one commit, any dependency, a change to what the profiles allow for the workspace, the private directories or the evaluation folder.

**Decisions (coordinator, owner-delegated):**

- Withheld set: every `exclude` entry that lies inside the repository (the evaluation folder, even when it lies outside `launch.root`).
- Build recipe (verified by hand on git 2.55): (1) the distinct trees `<commit>:<path>` over `git rev-list <commit>`, via `git rev-parse --verify --quiet`, for each withheld path; (2) `git init --bare --object-format=<the adopter's>`, with `core.bare=false` set in its config; (3) `git rev-list --objects <commit> ^<tree>...` (stdin) piped into `git pack-objects` writing a pack into the store; (4) write the empty tree (`git hash-object -t tree -w --stdin </dev/null`, whose id is `4b825dc642cb6eb9a060e54bf8d69288fbee4904` for SHA-1) and one `refs/replace/<tree>` per folder tree; (5) `git rev-list --objects --missing=print <commit>` in the store, drop the folder trees from the answer, and pack what remains from the adopter's repository (a blob that equals a folder blob and also sits outside the folder is excluded by step 3 and restored here); repeat until nothing but the folder trees is missing; (6) copy `<adopter git directory>/shallow` when present; (7) write `<metadata>/commondir` as the store's absolute path and run `git read-tree HEAD` with `GIT_DIR=<metadata>` so the index matches the replaced tree.
- Every git call of the build runs through `runGit` (supervised, timeout) with hooks disabled; a failure is a `WorkspaceRefusal` (exit 12) and the half-built workspace is removed by the existing failure path.
- Confinement: `targetSandbox` takes the adopter's git directory and the worktree metadata directory (both from the workspace) and withholds the first except the second. Seatbelt: `(deny file-read* file-write* (subpath <gitdir>))` then `(allow file-read* (subpath <metadata>))`, both before the evaluation folder's denial. Bubblewrap: `--tmpfs <gitdir>` then `--ro-bind <metadata> <metadata>`. The audit's `withheld` list gains the git directory, so a Node process that opens it is reported.
- `docs/reference/tea-evaluate-cli.md`'s `### File-system confinement` loses the sentence saying the git directory stays readable and the clause about `git show`, and says: the target's git sees the evaluated commit's full history with the evaluation folder as an empty tree, the project's git directory is withheld, and a target that must read the project's git directory opts out. Amend AD-8 in `ARCHITECTURE-SPINE.md` by one sentence naming the withheld repository.

## I/O & Edge-Case Matrix

| Scenario                       | Input / State                                                                  | Expected Output / Behavior                                                     | Error Handling   |
| ------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ---------------- |
| Committed contract read        | confined run, stub runs `git show` and `git cat-file` at the commit and `HEAD` | each read finds no object                                                      | n/a              |
| Blob id guessed from history   | stub reads a folder blob id from an older commit's `git log --raw`             | `git cat-file` finds no object                                                 | n/a              |
| Replace disabled               | stub runs `git --no-replace-objects cat-file -p <commit>:<folder>`             | no object                                                                      | n/a              |
| Adopter git directory by path  | stub reads `<project>/.git/objects` and `packed-refs`                          | refused (EPERM under Seatbelt, empty file system under Bubblewrap)             | n/a              |
| Own git operations             | stub runs `git status`, `git log`, `git diff HEAD`, `git show HEAD:src/a`      | exit 0, evaluated tree intact, no listed deletions                             | n/a              |
| Content shared with the folder | a file outside the folder has the same bytes as a folder file                  | `git show HEAD:<that file>` prints it                                          | n/a              |
| Folder changed across commits  | two commits hold two different folder trees                                    | both trees replaced; no folder blob of either commit is readable               | n/a              |
| Shallow adopter repository     | `.git/shallow` present                                                         | the store carries the same `shallow`; `git log` stops where the adopter's does | n/a              |
| Opt-out run                    | `"confinement": false`                                                         | worktree as today, no store built                                              | n/a              |
| Historical probe revision      | a pre-fix worktree at another commit                                           | same recipe at that commit; digests unchanged                                  | n/a              |
| Build step fails               | `git pack-objects` exits nonzero                                               | `WorkspaceRefusal`, workspace and registration removed                         | exit 12          |
| Killed run                     | SIGKILL after the store is built                                               | the next run's reclaim removes the directory and the registration              | existing journal |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/workspace.js`: `createWorkspace` (the `worktree add` branch near line 1160, then the `rmSync` of `excluded` near line 1200), `worktreeMetadataOf`, `removeWorkspace`, `runGit`, `repositoryOf`. Add the withheld-repository builder here (`buildWithheldRepository`, near line 900), called after the checkout, and a `withholdHistory` option. The workspace record gains `gitView` (store path) so callers can name it.
- `cli/lib/evaluate/confinement.js`: `seatbeltTargetProfile`, `bubblewrapTargetArguments`, `targetSandbox` (the `withheld` list of `environment`), `selectConfinement` (unsafe-path refusals). Add the git-directory withholding next to the evaluation folder's.
- `cli/lib/evaluate/preflight.js` (`make`, near line 564) passes `withholdHistory: confines(confinement)`; `cli/lib/evaluate/registry.js` (near line 715) and the call sites that hand `options.workspace` to `targetSandbox` carry the git directory and metadata directory.
- `cli/lib/evaluate/historical.js`: revision worktrees go through `createWorkspace` with `commit`; confirm they get the same option.
- `test/test-evaluate-run.js` (`test:evaluate-confinement`, its `--group=confinement` cases, and `test:evaluate-run`): the confined stub-target cases and the `### File-system confinement` reading case. `test/test-evaluate-mutation.js`, `test/test-evaluate-arms.js`: the gates for the digests.
- `test/test-isolation-primitives.js`, `test/lib/isolation-golden.js`, `test/fixtures/isolation-primitives/golden.json`: the profile golden.
- `docs/reference/tea-evaluate-cli.md` (`### File-system confinement`), `CHANGELOG.md`, `sprint-status.yaml` row, `test-design-epic-1.md` (the Story 1.57 section), `ARCHITECTURE-SPINE.md` (AD-8).
- Do not change: `sharedStateDigest` (the adopter's git directory is still the shared state it digests), `trackedTreeDigest`, the journal and reclaim logic.

## Tasks & Acceptance

**Execution:**

- [x] `cli/lib/evaluate/workspace.js` -- withheld-repository builder per the recipe, `withholdHistory` option, `gitView` on the record, refusal on any build failure -- the object-level withholding
- [x] `cli/lib/evaluate/confinement.js`, `registry.js`, `preflight.js`, `historical.js` -- carry the git directory and metadata directory to `targetSandbox`; withhold the first except the second under both mechanisms; add it to the audit's withheld list -- the on-disk withholding
- [x] `test/test-evaluate-run.js` -- a confined case over a real git repository with the evaluation folder committed in two commits: the matrix rows above run by a stub target, each with its revert check (builder skipped, `commondir` untouched, deny removed); a static case reads `### File-system confinement` by its exact heading
- [x] workspace unit cases (in `test/test-evaluate-run.js` or the suite that owns workspace cases) -- shared blob, two folder trees, shallow repository, failing `pack-objects`, killed-run reclaim
- [x] `test/fixtures/isolation-primitives/golden.json` -- regenerate, read the diff, keep only the added git-directory rules
- [x] `docs/reference/tea-evaluate-cli.md`, `CHANGELOG.md` (`[Unreleased]`), `sprint-status.yaml`, `test-design-epic-1.md`, AD-8, this record -- documentation and wiring

**Acceptance Criteria:**

- Given a confined run over a git workspace whose evaluation folder is committed, when a stub target runs `git show` and `git cat-file` for the folder's committed files at the evaluated commit and at every ref it can name, then each read finds no object, and `git status`, `git log` and `git diff` over the evaluated tree exit 0; reverting the builder lets the stub print the committed contract.
- Given the same run, when the stub reads the project's git directory by path, then the read is refused and its own worktree metadata stays readable.
- Given the run, when the digests AD-7 names are recomputed, then they equal their values before the change.
- Given `docs/reference/tea-evaluate-cli.md`, when the confinement section is read by its exact heading, then the passage saying the git history stays readable is gone; a case fails while it remains.

## Implementation Notes

- `cli/lib/evaluate/workspace.js` gains `buildWithheldRepository`, called by `createWorkspace` after the checkout and the submodule and `launch.root` checks when `withholdHistory` is set, and `gitAccessOf(workspace)` (the git directory and the worktree's metadata directory a sandbox needs). The store is `<workspace directory>/git-view`, recorded as `workspace.gitView`; `removeWorkspace` and the killed-run reclaim remove it with the directory, so neither changed. `runGit` takes an `input` option (the pack and the ref update read standard input).
- Deviations from the recipe, each with the same result: step 1 asks `git cat-file --batch-check` once for `<commit>:<path>` over `git rev-list <commit>` where the recipe says `git rev-parse --verify --quiet` per commit (one process per commit is minutes on a long history); step 3 is `git pack-objects --revs` fed the commit and `^<tree>` lines, with no rev-list pipe to buffer; the `shallow` copy happens before the restore walk, since the walk must stop where the adopter's history does; the empty tree and the replace entries are written in the store with `hash-object` and one `update-ref --stdin`; after `git read-tree HEAD` a best-effort `git update-index -q --refresh` restores the file stamps, since the target cannot write the index and every `git status` would otherwise read every file.
- The withheld set also removes those paths from the checkout when they lie outside `launch.root` (the existing removal covers only the inside ones), since an index rebuilt from the replaced tree would list them as untracked.
- The Seatbelt profile needed one rule beyond the story's two: git resolves the metadata directory's path component by component with `lstat`, which `(deny file-read* ...)` over the git directory refuses (`fatal: Invalid path ... Operation not permitted`). `(allow file-read-metadata (literal <gitdir>) (literal <gitdir>/worktrees))` follows the metadata allowance; no content under either is readable. Bubblewrap needs nothing more.
- Copy workspaces inside a git repository also withhold the project's git directory (their `git` option carries `metadata: null`), since the committed folder sits there too.
- `test/fixtures/evaluate/mutation/bin/verdict.js`: the stubs that reached for the evaluation folder through `git rev-parse --git-common-dir` now derive it from `git rev-parse --absolute-git-dir` (`<project>/.git/worktrees/<name>`), which is what the story leaves a target; the new `probe-git` act asks the folder's questions. The golden gains five outputs (git-carrying Seatbelt and Bubblewrap targets and the audit environment) and no existing line changed.
- Cases: `checkWithheldHistoryRun` (real CLI, three commits of the folder, the opt-out control, the digests, the adopter's objects and refs untouched), `checkWithheldHistoryUnits` (the workspace edges, the three revert checks, a shallow clone, an older revision, a failing `git pack-objects`, a killed run reclaimed) and the reference reading in `checkConfinementReference`, all in `test/test-evaluate-run.js`.
- Review round, decisions (items by the coordinator's numbering):
  - The audit and the sandbox agree (1): the audit environment carries `withheldExcept` (the worktree's metadata), the guard reports a path under the git directory unless both its spelling and its real path lie under that exception, and the metadata and the private repository are granted. The evaluation folder is reported whatever the grants.
  - The build refuses where it would withhold nothing (2, 3): a path tracked at the commit whose tree no search finds, and a partial-clone project (`extensions.partialClone` or a `remote.*.promisor`), each raise a `WorkspaceRefusal`; the exclude entries and the repository are resolved with the same real path before the filter.
  - The sandbox covers more (4, 5): Bubblewrap remounts the git directory read-only after the metadata bind, and the object directories listed in `objects/info/alternates` (resolved, recursively) are withheld by both mechanisms and listed in the audit's withheld set; `gitAccessOf` carries `alternates` and `view`.
  - The store follows the adopter (6, 11): it takes the adopter's object format and ref format (`rev-parse --show-object-format` must succeed), the nine named `core.*` keys, `info/exclude` and `info/attributes`, and no remote, URL, credential or hook.
  - The graph is the adopter's own (7, 8): every adopter-side call runs with `--no-replace-objects`, the empty tree is written with an explicit empty input, and a folder tree equal to the empty tree gets no replace entry.
  - The restore is one pass in the usual case (9): missing ids are packed with their closure (`pack-objects --revs`), a verification walk follows, and a pass that reports the set the last one reported refuses. A spy counts two `rev-list --objects` walks for the first workspace.
  - Later workspaces link (10): a module-level map keyed by repository, commit and withheld paths holds a live store; a later build runs `git init`, hard-links the packs and loose objects, copies `refs/replace`, and builds in full when the link fails or the cached store is gone. Only the `files` ref format links.
  - Tests (12 to 17): the `probe-git` stub runs in a leg, a mutated witness leg, a seeded qualification, a mutated trial and the clean trial, with an opt-out run for two of them; a source scan holds that all nine `createProbePort` calls pass `git: gitAccessOf(...)`, which covers the historical calls no fixture here reaches confined; the audit cases read `observedMounts` and `score`.
- CI time round (the first push cancelled two shards at the 15 minute cap):
  - Fewer git processes per build. The facts about the adopter's repository (partial clone, object and ref formats, the `core.` settings to carry) are asked once per git directory in the process, with one `git config --get-regexp '^core\.'` in place of nine reads and nine writes, and appended to the store's `config` in one write. The cache lookup comes before the history queries, so a workspace that links skips `rev-list`, `cat-file` and `ls-tree`. Only the pack runs under the supervisor; `read-tree`, `update-index` and the restore walks run plain with the same timeout, since each costs about 70 ms more under the supervisor and is a local, bounded read.
  - Measured with a throwaway spy over a 12-commit repository (git processes started, wall time): before, first workspace 33 and 817 ms, second workspace 29 and 557 ms; after, first 21 and about 420 ms, second 9 and about 175 ms. A workspace without the withheld build starts 6 and takes about 140 ms.
  - `update-index --refresh` stays: with and without it the second workspace took 160 to 168 ms and 170 to 179 ms, a difference inside the noise, and it keeps the target's `git status` from reading every file.
  - `test:evaluate-run` is split the way Story 1.40 split the evaluators suite: `--group=run` (`test:evaluate-run`, 534 checks) and `--group=confinement` (`test:evaluate-confinement`, 282 checks). Local wall time was 129 s for each after the change, against 298 s for the whole file at the first commit of this story and 324 s at the end of the first review round. The weights are those local seconds times the 1.517 CI over local ratio of the first push (452 s over 298 s): 195.4 and 196, in place of 300.
  - `test:evaluate-evaluators`, which also runs confined git workspaces, took 354 s of wall time locally at the commit before this story and 364 s after it (746 checks each, same machine, same load). That is 3 percent, so the story does not explain a shard running past its weight of 411.7; the weight is unchanged.
- Not run here: Bubblewrap (this host is macOS). Its vector is held by the golden only.

## Spec Change Log

## Review Triage Log

Round 1 (Opus, three lenses: blind, edge-case, verification-gap; 35 filed items). Verdicts below; every valid item was fixed in the round-1 fix commit.

| Finding                                                                                                                                                | Verdict | Evidence and route                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Audit reports the target's allowed read of its worktree metadata                                                                                       | high    | `confinement-guard.cjs` checks `withheld` before `granted`; `score` would exit 3. Patched with `withheldExcept`, covered by an audit case.      |
| Build fails open when the folder's spelling differs                                                                                                    | high    | `ls-tree` shows the path tracked while `treesAtPath` finds no tree; nothing is replaced. Patched with a refusal and one realpath on both sides. |
| Bubblewrap leaves the git directory writable                                                                                                           | medium  | no `--remount-ro` after the metadata bind. Patched; golden regenerated.                                                                         |
| Alternate object stores readable by path                                                                                                               | high    | `objects/info/alternates` names stores outside the git directory. Patched in `gitAccessOf`, both mechanisms and the audit.                      |
| Partial-clone project would fetch its whole history                                                                                                    | medium  | the pack and restore walks need every object. Patched with a refusal naming both ways out; Story 1.80 supports such projects.                   |
| Restore loop is O(depth x history), 256-pass bound                                                                                                     | medium  | patched: missing ids packed with their closure, no-progress refusal, `--no-object-names`.                                                       |
| Every workspace repacks the history                                                                                                                    | medium  | patched with a hard-link cache keyed by repository, commit and paths, after CI showed shards 1 and 3 past the 15 minute cap.                    |
| Local config, `info/exclude`, `info/attributes` not carried                                                                                            | medium  | patched with a nine-key allowlist; no remote, URL, credential or hook.                                                                          |
| Tags and branches not carried                                                                                                                          | low     | documented in the reference; Story 1.80.                                                                                                        |
| Object-format probe falls back to sha1 silently; stub regex 40 hex only; ref format; empty-tree input; self-replacing empty tree; adopter replace refs | low     | patched, one line each.                                                                                                                         |
| Five verification gaps (other probe ports, copy workspace, shared subtree, folder outside `launch.root`, audit side, opt-out control)                  | medium  | patched with cases and a source scan over all nine call sites.                                                                                  |
| Reference and CHANGELOG wording, header wrap, stale story record                                                                                       | low     | patched.                                                                                                                                        |
| Probe-git row never tries a real blob id in the integration run                                                                                        | false   | the confined store lists no folder id by design (asserted); the unit case reads real ids through `runConfined`.                                 |
| "Every git call runs through the supervisor"                                                                                                           | false   | a claim in the frozen Decisions; the supervisor is kept for the long calls and the doc comment says which. Fix would edit the spec.             |

## Design Notes

Why replace refs and not a missing subtree: `git status`, `git diff` and `git add` read every tree on the path to a change, and a tree whose folder subtree is absent fails with `unable to read tree`, with or without sparse checkout, a sparse index or a promisor. A `refs/replace/<tree>` entry resolves the read to the built-in empty tree before git looks for the object, so every id stays and nothing reads a folder object. `git --no-replace-objects` then asks for the folder tree itself, which the store does not hold.

The store holds the adopter's history as the adopter has it. What a commit's tree held under the withheld path at an older location of the folder (a folder that moved) stays readable; the plan names the evaluation folder at its current path.

## Verification

**Commands:**

- `npm run test:isolation-primitives` -- expected: exit 0 after the golden is regenerated and its diff read
- `npm run test:evaluate-run && npm run test:evaluate-confinement && npm run test:evaluate-mutation && npm run test:evaluate-arms && npm run test:evaluate-preflight` -- expected: exit 0
- `npm run format:check && npm run lint && npm run lint:md && npm run docs:validate-links` -- expected: exit 0
