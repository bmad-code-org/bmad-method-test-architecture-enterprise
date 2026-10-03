---
title: 'Story 1.80: Bring a partial-clone project, its tags and a very large history into the withheld repository'
type: 'bugfix'
created: '2026-10-03'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'c041cf9655d93a0f00bcb44412f563e6f44fe7a1'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.80)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.80 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-7, AD-8)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.57.md (the withheld repository this extends)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** Story 1.57's withheld repository packs the evaluated commit's whole history from the project's object store, with four gaps. A project cloned with a promisor remote (`--filter=blob:none`, `--filter=tree:0`) does not hold that history on disk, so the build was refused with exit 12. The repository carries `HEAD` and the history but no tag, so a target that builds with `git describe --tags` finds none. The build reads the object walk's whole output into memory, so a history of more than about six million objects exceeds the 256 MB buffer and the run exits 12. The configuration it carries for a tracked filter driver reads `git config --get-regexp` output as `<key> <value>` lines, so a driver whose name holds a space and a `required` written with no value (printed as the key alone) were dropped.

**Approach:** The build keeps its recipe and changes four things. A partial clone builds from the objects on disk: every adopter-side call runs with `GIT_NO_LAZY_FETCH=1`, objects the project lacks are left out as the project leaves them out, and nothing fetches. The tags whose commits the evaluated history reaches are written into the store with their annotations. Every walk whose output can exceed a buffer (the commits that name the folder's trees, the objects the store misses, a partial clone's pack) runs through one streaming reader, `cli/lib/evaluate/git-lines.js`, under the supervisor. The filter drivers and the `core.` settings are read with `-z`, so a name with a space and a value-less boolean survive.

## Boundaries & Constraints

**Always:** Commit ids, `commitDigest`, `implementationDigest` and the profiles stay unchanged (the isolation golden does not move). The store carries no remote, URL, credential, hook, branch or promisor marker. A build step that fails is a `WorkspaceRefusal` (exit 12) and the half-built workspace is removed by the existing path. A partial clone's store holds only what the project holds on disk. Tags carried are those `git for-each-ref --merged <commit>` returns, so no ref names an object the store lacks. The engine check runs at start and end. No eval-quality change.

**Never:** a fetch from a promisor remote by any process the build starts, a promisor marker or remote in the store, a branch or remote ref, a buffer that holds a whole walk, a new dependency, a change to what the profiles allow.

**Decisions (build worker, owner-delegated):**

- Tags only, no branches. The worktree is detached at the evaluated commit, which is what it is without confinement, and a branch that is not an ancestor of that commit would name an object the store lacks.
- A tag on a commit outside the evaluated history or on a tree is left out. `git for-each-ref --merged` is the filter; a failing listing is a refusal.
- The cache key of the linked-objects shortcut includes the tag set, so a workspace built after a tag was added builds in full.
- A partial clone's pack is `rev-list --objects --missing=allow-any --stdin | pack-objects`, run inside the reader. `pack-objects --revs --missing=allow-any` still stops at a missing tree (`fatal: bad tree object`), which a `--filter=tree:0` clone has for every old commit. A full repository keeps `pack-objects --revs`.
- A partial clone's restore of the objects the folder shares with the rest of the tree keeps only the missing ids that the folder's trees reach (`rev-list --objects` over those trees, run in the adopter, written to a file the reader loads). The store misses every object the project lacks, which is most of a blob-less history, so an unfiltered answer would be millions of ids. A full repository keeps the unfiltered answer, so a missing object it should hold still ends in the no-progress refusal.
- The stub's object walk prints seven million ids. The buffer is 256 MiB and an id line is 41 bytes, so it holds about 6,547,000 ids: 6,500,000 ids pass a buffered walk (the case ran green before the fix at that count). The AC text reads "more than six million" and still holds.
- A driver whose name holds a space cannot be named by `.gitattributes` (an attribute value ends at whitespace), so it changes no `git status`. The case reads that driver's configuration. The `required` key is read the same way, since a driver whose command works reads alike with or without it. AC 4 in `epics.md` is amended with that reason.
- The shared candidates (the objects the folder's trees reach) come from a streamed `reached` job (`rev-list --objects` over the folder's trees, the ids on the job's standard input) and travel in the next job's `keep` list. The reader reads its whole job from standard input, since a pack job's revisions (every tag, every folder tree) can outgrow one argument vector.
- A partial clone under git before 2.44, which cannot be told not to fetch, exits 12 with the way out named, since a treeless build would otherwise fetch one object per old commit. The partial-clone cases run only on a host whose git is 2.44 or later and name the skip.
- No process of a confined run fetches, a historical probe's checkout included. `git worktree add` and the `rev-parse` that resolves a historical revision run with `GIT_NO_LAZY_FETCH` (verified live on git 2.55 over blob:none and tree:0 clones: the checkout fails with `could not fetch ... from promisor remote` or `unable to read tree`, leaves no worktree registration, and the head revision still checks out). The refusal is exit 12 and names the revision and both ways out. A `test:evaluate-arms` case runs a historical probe over a blob-less clone and a full clone as the control.
- Sparse-checkout projects (found in review): the worktree inherits the cone and the rebuilt index has no skip-worktree bits, so the target's status lists the files outside the cone as deleted. The defect predates this story and needs the index rebuilt with sparse semantics, a change of its own, so it is Story 1.85 (end of lane 2).

## I/O & Edge-Case Matrix

| Scenario                    | Input / State                                                            | Expected Output / Behavior                                                                     | Error Handling         |
| --------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ---------------------- |
| Blob-less partial clone     | `--filter=blob:none`, folder committed, old blobs missing on disk        | run exits 0; target's `status`, `log`, `show HEAD:<file>` exit 0; no fetch; folder unreadable  | n/a                    |
| Treeless partial clone      | `--filter=tree:0`, old root trees missing                                | same as above                                                                                  | n/a                    |
| Shared content, partial     | a file outside the folder holds a folder file's bytes, present on disk   | `git show HEAD:<that file>` prints it                                                          | n/a                    |
| Tags                        | lightweight, annotated, nested; one on a side commit; one on a tree      | `git tag -l` lists the history's tags only; `describe --tags` resolves; no remote, URL, hook   | listing fails: exit 12 |
| Tag added between builds    | a second workspace after a new tag                                       | lists the new tag (the linked store was built for another tag set)                             | n/a                    |
| Very large history          | the store's walk prints 7,000,000 ids after the real answer              | run exits 0; shared copy still restored from the `?` lines                                     | reader fails: exit 12  |
| Filter driver names         | `filter.my driver.*`, a `required` with no value, a bare `core.symlinks` | each key present in the store, bare booleans as `true`                                         | n/a                    |
| Pack fails in a partial run | `pack-objects` exits nonzero                                             | `WorkspaceRefusal` naming the command, registration removed                                    | exit 12                |
| Older git                   | git before 2.44 and a partial-clone project                              | `WorkspaceRefusal` naming the version, an upgrade, the full history and `"confinement": false` | exit 12                |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/workspace.js`: `runGit` (gains `env`), `runCommand` (the shared spawn and supervisor path), `runGitLines` (runs one reader job), `adopterFacts` (`-z` parse; partial clones go through it), `tagsWithin`, `treesAtPath` (streams), `buildWithheldRepository` (tags, `packInto`, the shared-candidates file, the streamed walk, the tag refs).
- New `cli/lib/evaluate/git-lines.js`: the streaming reader, three jobs (`missing`, `trees`, `pack`).
- `test/test-evaluate-run.js`: `checkWithheldHistoryReach` (real CLI: two partial clones, tags, filter drivers, the seven-million-id walk), `checkWithheldHistoryReachUnits` (tags and the cache, configuration, partial clones and the git 2.44 gate, the reader under a 48 MB heap and under dying stages, a 20,000-revision pack job, non-ASCII folders, the static stream scan), the promisor-marker unit in `checkWithheldHistoryEdges`, the reference reading in `checkConfinementReference`.
- `test/fixtures/evaluate/mutation/bin/verdict.js`: the `probe-history` act.
- `test/test-evaluate-guidance.js`: the two guide strings and two absence checks.
- `src/workflows/testarch/bmad-testarch-evaluate/references/run.md` and `gaps.md`: one sentence each (edited through `/bmad-workflow-builder` Edit, headless).
- `docs/reference/tea-evaluate-cli.md` (`### File-system confinement`), `CHANGELOG.md`, `sprint-status.yaml`, `epics.md`, `test-design-epic-1.md`, `ARCHITECTURE-SPINE.md` (AD-8), `tools/test-shard-weights.json`.
- Do not change: the profiles and the isolation golden, `sharedStateDigest`, the journal and reclaim logic.

## Tasks & Acceptance

**Execution:**

- [x] Reproduce each defect through the real CLI before the fix (a confined `tea-evaluate run` with the `probe-history` stub): the partial clone exits 12 (both filters), `git tag -l` prints nothing, `filter.upper.required` is unset and the space-named driver is missing, and the seven-million-id walk exits 12 with ENOBUFS.
- [x] `cli/lib/evaluate/git-lines.js`, `workspace.js` -- the streaming reader, the no-fetch partial build, the tag copy, the `-z` configuration read
- [x] `test/test-evaluate-run.js`, `verdict.js`, `test-evaluate-guidance.js` -- the cases, each with its revert check below
- [x] `docs/reference/tea-evaluate-cli.md`, the two skill sentences, `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `ARCHITECTURE-SPINE.md`, `sprint-status.yaml`, `tools/test-shard-weights.json` -- documentation and wiring

**Acceptance Criteria:** as in `epics.md` Story 1.80, with the three amendments dated 2026-10-03 there (the tags the build leaves out, seven million ids, and the configuration read for the driver cases).

## Implementation Notes

- Reproduction first (real CLI, `probe-history` stub, before any fix): `--filter=blob:none` and `--filter=tree:0` runs exited 12 with the partial-clone refusal (ten failed checks); the tag project printed an empty `git tag -l` and `describe --tags` exited 128; `filter.upper.required` read `unset` and `filter.my driver.clean` was absent; the 6,500,000-id walk passed the buffered code, because 6,500,000 ids of 41 bytes are 266.5 MB against a 268.4 MB buffer, and the 7,000,000-id walk exited 12 with `ENOBUFS`.
- `runGit` now takes an `env` option and shares `runCommand` with `runGitLines`, which runs `git-lines.js` as the supervisor's command. The supervisor copies the child's output through its pipes, so the reader prints only what the caller keeps.
- `git-lines.js` has three jobs. `missing` runs the store walk and prints the ids of lines starting with `?` (optionally intersected with a keep file). `trees` pipes `rev-list <commit>` into `cat-file --batch-check` with `<commit>:<path>` lines and prints each distinct tree id, with backpressure on the pipe. `pack` pipes `rev-list --objects --missing=allow-any --stdin` into `pack-objects`. Each job exits with git's own status and prints nothing on failure.
- The `rev-list --objects` pass over the folder's trees (partial clone only) takes the tree ids on standard input, since a folder that changed thousands of times has more trees than an argument vector holds.
- `adopterFacts` no longer returns early for a partial clone (the formats and the configuration are local reads). The refusal and its message are gone; `facts.partial` selects the pack and walk variant.
- Tags: `git for-each-ref --merged <commit> refs/tags`, written with one `update-ref --stdin` after the objects exist, in the first build and in a linked one.
- Not done, by decision: branches; promisor configuration in the store.
- A `git log -p` over a commit whose blobs a blob-less clone never fetched fails in the target with git's missing-object error, as it fails in the clone without its remote. The reference says so.
- Historical probes over a partial clone: the runtime's own `git worktree add` at an old revision may fetch that revision's blobs from the remote, as the project's own checkout would. The target's git never fetches. The store build for that workspace then finds those blobs on disk.
- Not run here: Bubblewrap (this host is macOS). Nothing in this change touches a profile, and the isolation golden is unchanged.

## Revert observations

Each revert was applied once to a scratch copy of the final tree under the scratchpad directory (never the working tree), the named case run, the failed-check count recorded and the copy restored.

| Revert (the one edit)                                                                 | Case run                                                                       | Observed                                                                                                                                              |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Restore the partial-clone refusal in `buildWithheldRepository`                        | `--only="git reach"`                                                           | 12 of 40 checks fail; the blob:none run exits 12                                                                                                      |
| `NO_LAZY_FETCH = {}` (lazy fetching allowed)                                          | `--only="git reach"`                                                           | 2 of 42 fail: the tree:0 remote's upload-pack log is written and the clone's objects change                                                           |
| `tagsWithin` returns no tags                                                          | `--only=reach`                                                                 | 12 of 85 fail: `git tag -l` prints nothing, `describe --tags` exits 128                                                                               |
| Drop the tag set from the cache key                                                   | `--only="reach units"`                                                         | the unit aborts (1 of 10 checks): the second workspace links a store without the new annotated tag and `update-ref` refuses it                        |
| Walk the store through a buffered `runGit` (the old read)                             | `--only="git reach"`                                                           | 15 of 39 fail: the seven-million-id run exits 12 with `ENOBUFS`                                                                                       |
| Drop `-z` from the `core.`/`filter.` read                                             | `--only=reach`                                                                 | 8 of 85 fail: `filter.upper.required` unset, the space-named driver absent, a bare `core.symlinks` not carried                                        |
| Restore `Five limits apply` and the three limit sentences in the reference            | `--only="confinement reference"`                                               | 1 of 11 fails                                                                                                                                         |
| `keep: []` for a partial clone (no shared-object restore)                             | `--only="git reach"`                                                           | 12 of 40 fail: `read-tree HEAD` ends `unable to read tree`, the run exits 12                                                                          |
| Partial clone packs through `pack-objects --revs`                                     | `--only=reach`                                                                 | 13 of 58 fail: both partial runs exit 12 (`bad tree object`)                                                                                          |
| The reader appends every walk line to an array                                        | `--only="reach units"`                                                         | 2 of 43 fail: the 48 MB heap runs out and the reader is killed                                                                                        |
| The reader holds its commit batch until the end                                       | `--only="reach units"`                                                         | 1 of 43 fails: the same heap bound                                                                                                                    |
| Write the `trees` job's input as latin1 (review finding)                              | `--only="reach units"`                                                         | the non-ASCII tracked folder refuses the build (1 of 41 checks, unit aborts)                                                                          |
| Remove the git 2.44 gate                                                              | `--only="reach units"`                                                         | 1 of 43 fails: no refusal under a stub `git --version` of 2.43.0                                                                                      |
| Put the six-million-object clause back into `run.md`                                  | `node test/test-evaluate-guidance.js`                                          | fails with the two named findings (the sentence is missing, the stale phrase is present)                                                              |
| A bare `core.symlinks` not carried as true (`values.delete` in place of `true`)       | `--only="reach units"`                                                         | 1 of 54 fails: the unit's `core.symlinks` read                                                                                                        |
| Tags listed without the `--merged` filter                                             | `--only="reach units"`                                                         | 3 of 54 fail: `side-tag` and `tree-tag` are listed, and the store's refs include them                                                                 |
| A bare `filter.*.required` dropped                                                    | `--only="reach units"`                                                         | 2 of 54 fail: the unit's `filter.my driver.required` and `filter.bare.required` read                                                                  |
| Read the promisor marker without `--type=bool` (round 1 of the PR)                    | `--only="reach units"`                                                         | 4 of 54 fail: `yes`, `1`, `on` and a key with no value build as a full clone                                                                          |
| Split each `cat-file` answer on spaces (round 1)                                      | `--only="reach units"`                                                         | the unit aborts (1 of 34): a folder named `my tree`, present only in the last commit, adds a bogus id and the build exits 12                          |
| Read the folder's objects through a buffered `runGit` (round 1)                       | `--only="reach units"`                                                         | 1 of 54 fails: the stream scan no longer finds the `reached` job                                                                                      |
| Run the checkout and the revision's `rev-parse` without `GIT_NO_LAZY_FETCH` (round 1) | `--only="reach units"`; `node test/test-evaluate-arms.js --partial-clone-only` | 6 of 54 fail (the older revision builds and the tree:0 remote is asked); 2 of 3 fail in the arms case (exit 0 instead of 12, and the remote is asked) |
| A pack job's label names one stage (round 1)                                          | `--only="reach units"`                                                         | 1 of 54 fails: the refusal no longer names both stages                                                                                                |
| A stage a signal kills is not named (round 1)                                         | `--only="reach units"`                                                         | 4 of 58 fail: the reader's `listkill`, `askkill` and pack-kill cases and the build-level refusal                                                      |
| Remove the git-before-2.44 sentence from the reference (round 1)                      | `--only="confinement reference"`                                               | 1 of 11 fails                                                                                                                                         |
| Put a general "a partial clone is refused" sentence back (round 1)                    | `--only="confinement reference"`                                               | 1 of 11 fails                                                                                                                                         |
| Run on a CI host whose git is 2.43                                                    | `CI=1` with a stub `git --version`                                             | 1 failed check naming the version (without `CI` the skip line prints once)                                                                            |

Before any fix the same cases failed as the revert checks predict: 16 of 37 checks with the 6,500,000-id stub (partial clones exit 12, no tags, `required` unset, space-named driver absent), and the seven-million-id run exits 12.

## Gates

Run on the final tree, one host-heavy gate at a time, on a machine shared with the other lanes. No full local `npm test`: the hook and CI carry the chain.

- Build round: `test:evaluate-confinement` 823, `test:evaluate-run` 571, `test:evaluate-evaluators` 577, mutation 727, arms 727, preflight 324, ci, api 4,453, mcp 227, workflow 165, check 1,072, boundaries 448, guidance, isolation-primitives (golden unchanged), direction, boundary, bmad-output-gated all green.
- PR review round 1: `test:evaluate-confinement` 836, `test:evaluate-arms` 731 (its new `--partial-clone-only` case included), `test:evaluate-run` 571, `test:evaluate-preflight` 324, `test:evaluate-mutation` 727, `test:evaluate-evaluators` 577, `test:evaluate-ci`, `test:evaluate-api` 4,453, `test:evaluate-mcp` 227, `test:evaluate-workflow` 165, `test:evaluate-check` 1,072, `test:evaluate-boundaries` 448, `test:evaluate-guidance`, `test:isolation-primitives`, `test:direction`, `test:bmad-output-gated` 110 green. The macOS audit's lost-report attempts reran as the suite does by design; the Linux abstract-socket case is skipped on this host and runs in CI.
- `test:doc-counts`, `test:doc-claims`, `test:shards` (the confinement weight is 365.4 plus 53 seconds, the new cases' local time at the 1.517 CI ratio; the shard check did not ask for more), `test:ci-coverage`, `test:changelog`: green.
- `npm run lint`, `npm run lint:md`, `npm run format:check`, `npm run docs:validate-links`, `npm run docs:build`: green.
- Engine check at the start and the end: exit 0. `git diff -- package.json package-lock.json` is empty.
- Builder Analyze on the two skill sentences: zero new findings.

## Build review

Three fresh Opus subagents reviewed the diff in layers (code, tests, adversarial), read only, in place of `/bmad-code-review`, `/bmad-testarch-test-review` and `/bmad-review`, whose lenses the prompts carried. Every finding was checked against code or by experiment before it was acted on. The skill edit went through `/bmad-workflow-builder` Edit (headless) and its delta Analyze: zero new findings; the five path-standards highs in committed skill files predate the edit and sit on lines it did not touch.

| Finding                                                                                                                   | Verdict                      | Route                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High (code, adversarial): the `trees` job wrote `<commit>:<path>` as latin1, so a non-ASCII folder path found no tree     | valid, reproduced            | Fixed (UTF-8). Without the fix a tracked folder refused the build and a folder removed from the index leaked its history. Two units (tracked and removed) with a positive control.      |
| Medium (code): a pack job's revisions in one argument exceed Linux's 128 KiB per-argument limit near 3,000 tags and trees | valid, reproduced            | Fixed: the whole job travels on the reader's standard input. A unit sends 20,000 revisions.                                                                                             |
| Low (code): a pack stage that dies first left the reader waiting on a pipe                                                | valid, reproduced            | Fixed: a failed stage kills the other and the first failure's status wins. A unit.                                                                                                      |
| Medium (tests): a `rev-list` or `cat-file` that dies partway had no test, and the old code failed closed                  | valid                        | Fixed: reader units for both stages (exit 3 and 4, nothing printed) and a build whose commit list fails refuses.                                                                        |
| Medium (tests, adversarial): git before 2.44 ignores `GIT_NO_LAZY_FETCH`, so a treeless build fetches per old commit      | valid                        | Fixed: a partial clone under git before 2.44 exits 12 with the way out; the partial-clone cases skip on such a host and name why; a unit fakes `git --version`.                         |
| Medium (adversarial, round 1 of the PR): a historical probe's `git worktree add` fetches blobs of an older revision       | valid                        | Fixed in the PR's review round: the checkout runs with `GIT_NO_LAZY_FETCH` and a revision the clone lacks exits 12 naming it, which restores AC 1; the arms case and two units hold it. |
| Medium (adversarial): a sparse-checkout project's target `git status` lists the files outside the cone as deleted         | valid, predates 1.57's build | Not closed here: it needs the index rebuilt with sparse semantics. Story 1.85 at the end of lane 2, with the epics, test-design, dependency and sprint rows.                            |
| Low (adversarial): the shared-object ids sat in a file beside the store while the build ran                               | valid                        | Fixed: the ids travel in the reader's job on standard input; no file.                                                                                                                   |
| Low (adversarial): the reference said "any size" and "same commit", the CHANGELOG said "every walk"                       | valid                        | Reworded to what the code does (walks that grow with the history; 10 minute step limit; same commit and tags).                                                                          |
| Low (tests): the large-history stub's use was never proved                                                                | valid                        | The stub logs the intercepted walk and the case asserts the log exists.                                                                                                                 |
| Low (tests): the streaming of `treesAtPath` had no case at the workspace level                                            | valid                        | A static check holds that `treesAtPath` uses the reader and no `runGit`, and that the build names the `missing` and `pack` jobs.                                                        |
| Low (tests): the removed-folder check passed on any failure                                                               | valid                        | It asserts the path resolves (`cat-file -t` is `tree`), lists no entry, and reads no secret; the project's own `git show` is the positive control.                                      |
| Low (tests): the failing partial pack left no temp assertion                                                              | valid                        | The case passes a temp directory and asserts it is empty.                                                                                                                               |
| Low (tests): tag order depended on the host's `tag.sort`                                                                  | valid                        | `-c tag.sort=refname` in the units and the stub.                                                                                                                                        |
| Note (tests): on blob:none a missing `GIT_NO_LAZY_FETCH` changes nothing                                                  | accepted                     | Only tree:0 guards the variable, and it does (R2 above).                                                                                                                                |
| Note (adversarial): `tagsWithin` and the folder-trees walk still use the 256 MB buffer                                    | accepted                     | Both are bounded by tags and by the folder's own history, not the project's; the CHANGELOG and reference name only the walks that grow with the history.                                |

### PR review round 1

| Finding                                                                                     | Verdict | Route                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `partialCloneCause` read only the literal `true` of `promisor`                              | valid   | Read with `--type=bool`; a unit for `yes`, `1`, `on` and a bare key                                                                                                                                                                                                     |
| The `trees` job took a missing answer for a folder named `my tree` as a tree id and refused | valid   | The answer must match an object id, a space and `tree` and a size; a unit with that folder in the last commit only                                                                                                                                                      |
| The folder-objects walk was buffered, against the reference's claim                         | valid   | A streamed `reached` job; this record's earlier file-or-stdin wording corrected                                                                                                                                                                                         |
| The checkout of a historical revision could fetch                                           | valid   | `GIT_NO_LAZY_FETCH` on the checkout and on the revision's `rev-parse`, a refusal naming the revision, the git 2.44 gate before any checkout; a `test:evaluate-arms` case over a blob-less clone with a full clone as control; reference, AD-8, AC 1 and CHANGELOG match |
| The record said the version check was not done                                              | valid   | The clause is removed                                                                                                                                                                                                                                                   |
| The AC 5 and test-plan wording dropped every partial-clone refusal                          | valid   | The amendment keeps the pre-2.44 refusal, and the reference case checks that statement and rejects only the former general sentence                                                                                                                                     |
| A signal-killed stage ended as `ended 128:` with no stage                                   | valid   | The reader names the stage and the signal on stderr and exits with the shell's `128 + signal`; units for each mode's stage and a build-level refusal                                                                                                                    |
| A pack job's label named one stage                                                          | valid   | Both stages are named; the unit's stub text no longer contains the stage name                                                                                                                                                                                           |
| On git before 2.44 the partial-clone cases skipped silently                                 | valid   | Under `CI` they fail; the skip line prints once                                                                                                                                                                                                                         |
| H.1 dependencies and the lane 2 paragraph omitted Story 1.85                                | valid   | Added in `epics.md` and `sprint-status.yaml`                                                                                                                                                                                                                            |

Undone: sparse checkout (Story 1.85); git before 2.44 cannot run a partial-clone project confined (it exits 12 with the way out); Bubblewrap not run here (macOS host; no profile changed and the isolation golden is unchanged).

## Spec Change Log

## Review Triage Log
