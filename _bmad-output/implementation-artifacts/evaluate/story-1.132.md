---
title: "Story 1.132: Pack the withheld history without writing into the adopter's repository"
type: 'bugfix'
created: '2026-10-04'
status: 'done'
route: 'dispatch'
review_loop_iteration: 2
baseline_commit: '0984765d9f99c323103e13fdb4c6ac0ebf36957f'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.132; Stories 1.57 and 1.80)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.132 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-7, AD-8)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.112.md (the record format)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.85.md (the story whose review found the defect)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** `buildWithheldRepository` (`cli/lib/evaluate/workspace.js`) packs the evaluated commit's history into the private store with `pack-objects --revs <store>/objects/pack/pack`, run inside the adopter's repository, and the partial-clone path (`rev-list --objects --missing=allow-any` into `pack-objects <store>/objects/pack/pack`, the `pack` job of `cli/lib/evaluate/git-lines.js`) does the same.
`pack-objects` writes its temporary pack and index into the adopter's own `.git/objects/pack` and renames them into the store, which sits under the temp directory.
A project and a temp directory on different filesystems (a project under a home directory and a tmpfs `/tmp`, the default layout on Linux hosts) are refused with `fatal: unable to rename temporary file ... Invalid cross-device link`, a failed run leaves `tmp_pack_*` and `tmp_idx_*` files in the adopter's `objects/pack`, and a successful run writes there for a moment, which breaks the contract that a confined run writes nothing into the adopter's repository.

**Approach:** The adopter's object store is only read.
`pack-objects --stdout` prints the pack and the store's own `git --git-dir=<store> index-pack --stdin` writes it, so the pack and its index are written on the store's device.
The `pack` job takes a `stages` list of git argument lists and runs them as one pipeline: the revisions go to the first stage's standard input, each stage's output feeds the next one, and the last prints nothing.
A full repository runs `[pack-objects --revs --stdout, index-pack --stdin]` and a partial clone runs `[rev-list --objects --missing=allow-any --stdin, pack-objects --stdout, index-pack --stdin]`.

## Boundaries & Constraints

**Always:** The adopter's `objects/pack` holds no new file during or after the build, whether it succeeds or a stage fails.
A project and a temp directory on different filesystems build, in a full repository and, where git honors `GIT_NO_LAZY_FETCH`, in a partial clone.
The streaming reader keeps one line at a time and the pack's bytes flow stage to stage with the pipe's backpressure; no whole-walk buffer appears, and the build's other walks keep the 256 MiB buffer and the stream reader of Story 1.80.
A stage that fails ends the others, the job exits with the first failure's status, and the failed stage's standard error reaches the caller, which refuses the workspace.
Commit ids, digests (`commitDigest`, `implementationDigest`, a historical probe's revisions) and the isolation golden stay as they are.
The engine check runs at start and end.
No eval-quality change.

**Never:** a copy of a pack across devices to repair a failed rename, a store moved onto the project's filesystem, a write into the adopter's repository to make the build work, a change to what the private repository holds, or a new dependency.

**Decisions (build worker, owner-delegated):** the Decisions list below carries each choice with its reason.

## I/O & Edge-Case Matrix

| Scenario                             | Input / State                                                                             | Expected Output / Behavior                                                                                                           | Error Handling |
| ------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| Full repository across filesystems   | project under `/home/tester`, tmpfs `/tmp`, project's `objects/pack` read-only            | the build succeeds, the store holds a pack of its own and the three commits, the project's `objects/pack` listing is unchanged       | n/a            |
| Partial clone across filesystems     | the same layout over a `--filter=blob:none` clone, git 2.44 or later                      | the same                                                                                                                             | n/a            |
| Pack stage fails                     | a `git` shim exits 1 for `pack-objects`                                                   | the workspace is refused with the shim's message, no workspace directory remains, the project's `objects/pack` listing is unchanged  | exit 12        |
| Index stage fails                    | a `git` shim exits 1 for `index-pack`                                                     | the same                                                                                                                             | exit 12        |
| Commands the build runs              | a `git` shim that logs                                                                    | `pack-objects` carries `--stdout` and no path under `objects/pack`; `index-pack --stdin` carries `--git-dir=<store>`, once per pack  | n/a            |
| Pipeline unit, three stages          | stub `git`, 20,000 revisions, a walk of 2,000,000 ids, a heap of 48 MB                    | exit 0, the last stage received the pack stage's output, the first stage received 20,000 revision lines                              | n/a            |
| Pipeline unit, two stages            | stub `git`, 20,000 revisions                                                              | exit 0, the pack stage read the 20,000 revisions                                                                                     | n/a            |
| A stage fails or a signal kills it   | the walk exits 5, the pack stage exits 3 or is killed by SIGTERM, the index stage exits 4 | the job exits 5, 3, 143 or 4 with `git <stage> exited N` or `was killed by SIGTERM` on standard error and nothing on standard output | exit as named  |
| Second workspace for the same commit | a first workspace exists, git before 2.45 (no ref format reported)                        | the second workspace links the first one's objects and packs nothing                                                                 | n/a            |
| Reference                            | `docs/reference/tea-evaluate-cli.md`, `### File-system confinement`                       | says the build writes nothing into the project's object store and works across filesystems                                           | n/a            |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/git-lines.js`: the `pack` job takes `stages` and runs them as a pipeline, one `close` handler per stage, a failed stage kills the others with `SIGKILL`, the first failure's status and note are the job's.
- `cli/lib/evaluate/workspace.js`: `buildWithheldRepository`'s `packInto` builds the stage list (the full repository and the partial clone differ in their first stages only) and the one `intoStore` stage; the `inAdopter` helper and the old `pack-objects --revs <file>` call are gone; `runGitLines` names every stage in its label; the link from a cached store is taken for an unknown ref format.
- `test/test-evaluate-run.js`: `checkWithheldHistoryAcrossFilesystems`, `otherFilesystemDirectory` and `makeHistoryRepository`'s `base` option (Linux, the container), `checkWithheldHistoryPackStages` (every host), the pipeline cases of `checkWithheldHistoryReachUnits`, and the reference sentence in `checkConfinementReference`.
- `docs/reference/tea-evaluate-cli.md` (`### File-system confinement`), `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `ARCHITECTURE-SPINE.md` (AD-8), `sprint-status.yaml`.
- Not changed: the target profiles, the isolation golden, the skill's guides, the CI workflows, every `capture-record.json`.

## Tasks & Acceptance

- [x] Reproduce on the unchanged code in the container (the saved patch's case, which the build adopted).
- [x] `git-lines.js`: the `stages` pipeline; `workspace.js`: the stage lists and `intoStore`.
- [x] Tests: the cross-filesystem case, the pack stages case, the pipeline unit cases (the old `list` and `pack` keys are gone from them), the reference sentence.
- [x] The reference sentence, `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `ARCHITECTURE-SPINE.md`, `sprint-status.yaml` (`review`), this record.

**Acceptance Criteria:** as in `epics.md` Story 1.132, with the amendment dated 2026-10-04 there (the case names, the `stages` key and the container's `exec` tmpfs for the shim cases).

## Reproduction

Run first on the unchanged code, in the container the story names (`docker run --init --rm --tmpfs /tmp ... -u tester ... tea-bwrap-strace node test/test-evaluate-run.js --group=confinement --only="across filesystems"`), over a copy of the tree under the scratchpad directory with the case added.
The case makes the project's `objects/pack` read-only, and the unchanged build failed 1 of 2 checks with `fatal: Unable to create temporary file '.../repository/.git/objects/pack/tmp_pack_XXXXXX': Permission denied`, which shows the build writes into the adopter's `objects/pack`.
With the case's chmod removed on the same unchanged tree the build failed 2 of 2 checks: `fatal: unable to rename temporary file to '...': Invalid cross-device link`, and the project's `objects/pack` held `tmp_idx_8MIEAs` and `tmp_pack_osvL9A` afterwards.
On macOS with `TMPDIR` on an attached disk image the defect shows as `error: unable to write file ...pack: Cross-device link` (the story's earlier reproduction); this build ran no such disk image, since the container case is the story's reproduction and the pack stages case catches the same write on any host through the read-only `objects/pack`.
With the final tree the same container command passes (6 of 6 checks; the partial-clone leg is skipped there with its reason named, since the image's git is 2.39.5).

## Decisions

1. **The stage list shape is `stages: [[args], ...]`, one list of git argument lists, replacing the `list` and `pack` keys.**
   The full repository and the partial clone differ only in how many stages precede the index (a `pack-objects --revs` or a `rev-list` into `pack-objects`), and both end in `index-pack --stdin`.
   One loop over the list covers every length, and the stage that fails is named by its own subcommand (`stageOf`), so a failure reads `git index-pack exited 4` or `git rev-list exited 5` whichever the stage.
   Two keys for the walk and the pack plus a third for the index would have fixed the shape at three and left the full repository's two-stage case as a special case.
2. **Rejected: `index-pack` as a fixed trailing key (`into`) beside `list` and `pack`.**
   It names a stage by its role and gives the full repository's job an empty `list`, which is a conditional the loop does not need.
3. **A failed stage cleans up by ending the others and leaving the rest to the workspace.**
   The first stage that ends badly kills the others with `SIGKILL`, since they would otherwise wait on a pipe nobody reads or writes (as the two-stage job did), and the job exits with that stage's status and note.
   A killed `index-pack` can leave `tmp_pack_*` in the store's `objects/pack`; the store is inside the workspace directory, `createWorkspace`'s `catch` removes the directory (`removeWorkspace`), and the build records the store in `BUILT_REPOSITORIES` only after every pack succeeded, so no later workspace links a half-built store.
   The adopter's repository needs no cleanup, since nothing writes there; the pack stages case checks the project's `objects/pack` listing and that no `tea-evaluate-<label>-*` directory remains in the temp directory after each failure.
4. **`--stdout` into `index-pack --stdin` keeps the store's pack on its own device.**
   `pack-objects --stdout` writes the pack to its standard output and creates no file (no temporary pack, index or reverse index in the project's `objects/pack`), and `index-pack --stdin` run with `--git-dir=<store>` creates its `tmp_pack_*` in the store's own `objects/pack` and renames it to `pack-<hash>.pack` and `.idx` in that same directory.
   No rename crosses a device and nothing is created in the adopter's repository, which holds for a read-only `objects/pack` too.
   `index-pack` also verifies the pack's checksum and each object's id, so a truncated stream from a dying `pack-objects` is refused by the stage that reads it.
5. **Rejected: moving the store onto the project's filesystem, or copying the finished pack across devices.**
   The store is private to the run and sits under the temp directory so it falls inside the withheld root and the workspace's cleanup; a store beside the project is in the adopter's tree, and a copy after a failed rename still has `pack-objects` writing its temporary files into the adopter's `objects/pack`.
6. **Rejected: filling the store with `git fetch` or `git clone --bare` from the project.**
   The store holds the history except the objects only the evaluation folder's trees reach and then the objects the folder shares with the rest of the tree; `pack-objects --revs` takes exactly that as `^<tree>` exclusions, and a fetch cannot express them.
7. **The pack's bytes pass through the streaming reader's pipes.**
   `stages[i - 1].stdout.pipe(stages[i].stdin)` moves the pack with the pipe's backpressure and holds no more than the stream's high-water mark, so a pack of any size runs in the reader's small heap; the unit cases run the reader under `--max-old-space-size=48` over a walk of 2,000,000 ids.
8. **The build's other walks stay as they are.**
   The 256 MiB `maxBuffer` of `runGit` and the `missing`, `reached` and `trees` streaming modes are unchanged; the full repository's pack now goes through the reader like the partial clone's, so the `pack` job's revisions travel on standard input in both paths.
9. **The shim cases run on every host, the cross-filesystem case on Linux only.**
   The cross-filesystem case needs a second filesystem (a home directory beside a tmpfs `/tmp`, or `/dev/shm`) and skips with its reason named where there is none, as the story requires; the ubuntu runner's `/dev/shm` is a tmpfs, so CI runs it.
   The pack stages case needs no second device: a read-only `objects/pack` makes any write into it fail the build, so it fails on the unchanged code on macOS too, and its shim log pins the commands.
10. **The container's tmpfs needs `exec` for the shim cases.**
    The story's command mounts `--tmpfs /tmp`, which Docker mounts `noexec`, so every `git` shim in `/tmp` is skipped by `PATH` lookup and the real git runs; the existing cases with shims (`a failing git pack-objects did not refuse the workspace`) fail there for that reason and not because of this change.
    The cross-filesystem case ran with the story's exact command; the broader Linux runs used `--tmpfs /tmp:rw,exec,mode=1777`, and the pack stages case now says "the git shim never ran" when the shim cannot run.
11. **A git before 2.45 links a first workspace's objects into the second.**
    Found in the container (git 2.39.5): `adopterFacts` leaves `refFormat` null when `rev-parse --show-ref-format` is not understood, and the link from the cached store required `refFormat === 'files'`, so a second workspace for the same commit packed the history again, and the edges case that checks it failed in the container on the unchanged tree as well.
    The pack stages case holds it on every host with a `git` shim that answers `--show-ref-format` as an old git does.
    A git that does not report a ref format is older than the `reftable` format, so its stores are `files`; the link now requires `refFormat !== 'reftable'`.
12. **The saved attempt is adopted with changes.**
    Its `git-lines.js` and `workspace.js` hunks applied to the current tree as they were, and its test hunk applied unchanged.
    The review of the draft changed: the `no-negated-condition`, `no-new-array` and `prefer-includes` lint findings; the label of `runGitLines` (one list of stages for every job shape); the unit job, which still drove `mode: 'pack'` with the old keys and now drives the stages; the case's `git` reads, which ran `rev-parse HEAD` and `rev-list` in the bare store (its `HEAD` names no branch that exists, so `rev-list --count HEAD` fails) and now read the worktree.

## Implementation Notes

- A full repository's job is two stages and a partial clone's is three; `index-pack` is the same `[--git-dir=<store>, index-pack, --stdin]` list in both, built once as `intoStore`.
- The second pass of the build (`packInto(missing)` for the objects the folder shares with the rest of the tree) goes through the same stages, so the store may hold several packs; `index-pack` names each by its hash.
- `index-pack` runs no hook, so the stage carries no `core.hooksPath`; the adopter-side stages keep the `-c core.hooksPath=<empty directory>` and `--no-replace-objects` of the earlier call.
- The job's environment is `GIT_NO_LAZY_FETCH=1` for every stage, as before.
- The reference's `### File-system confinement` carries one new sentence, and `checkConfinementReference` reads it.
- Linux: the container ran the cross-filesystem case, the pack stages case and every `git history` case (240 checks) on the final tree.
  The partial-clone legs are skipped in the container (git 2.39.5 predates `GIT_NO_LAZY_FETCH`) and run on the host (macOS) and in the ubuntu CI job.

## Revert observations

Each revert was applied once to a scratch copy of the final tree under the scratchpad directory, the named case run, the failed-check count recorded and the copy discarded.
The `--only` filters match case names: `--only="across filesystems"` runs `checkWithheldHistoryAcrossFilesystems`, `--only="pack stages"` runs `checkWithheldHistoryPackStages` (32 checks on macOS), `--only="reach units"` runs `checkWithheldHistoryReachUnits` (66), `--only="git history edges"` runs `checkWithheldHistoryEdges` (29) and `--only="confinement reference"` runs `checkConfinementReference` (14).

| Revert (the one edit)                                                                                                                                         | Case run                         | Observed                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The old `pack-objects --revs <store>/objects/pack/pack` in the adopter's repository (`workspace.js`, `git-lines.js` at `0984765d`), container, `--tmpfs /tmp` | `--only="across filesystems"`    | 1 of 2 fail: `Unable to create temporary file ... tmp_pack_XXXXXX: Permission denied` in the read-only `objects/pack`                                               |
| The same, the case's chmod removed, container                                                                                                                 | `--only="across filesystems"`    | 2 of 2 fail: `unable to rename temporary file to ...: Invalid cross-device link`, and `tmp_idx_8MIEAs` and `tmp_pack_osvL9A` left in the adopter's `objects/pack`   |
| The same revert, macOS                                                                                                                                        | `--only="pack stages"`           | 9 of 22 fail: the build refuses over the read-only `objects/pack`, and the checks that read the commands the build ran fail with it                                 |
| The same revert                                                                                                                                               | `--only="reach units"`           | 9 of 66 fail: the job has no `stages` and exits 1 for every pipeline case                                                                                           |
| The `pack` job ignores a failed stage (the `fail` call in `finish` removed)                                                                                   | `--only="reach units"`           | 7 of 66 fail: the failing walk, pack (exit and signal) and index (three-stage and two-stage) exit 0, and the failing-pack builds over a partial clone do not refuse |
| The `pack` job holds the walk's output whole before the next stage reads it (a string collected on `data`)                                                    | `--only="reach units"`           | 3 of 66 fail: under the 48 MB heap the reader ends by a signal (no status) and the last stage is handed nothing                                                     |
| The `pack` job holds the walk's output as buffer chunks and hands them over at the end (outside the V8 heap)                                                  | `--only="reach units"`           | fails: the walk stub's order check reports `the walk ended before the pack stage read a line`, which the heap limit alone did not catch                             |
| The git before 2.45 link reverted (`facts.refFormat === 'files'` back), container                                                                             | `--only="git history edges"`     | 2 of 29 fail: a second workspace for the same commit packs the history again and copies the first one's packs instead of linking them                               |
| The git before 2.45 link reverted, macOS (a shim that answers `--show-ref-format` as an old git does)                                                         | `--only="pack stages"`           | 1 of 32 fails: the second workspace packs again (2 then 4 pack stages)                                                                                              |
| The reference's new sentence removed                                                                                                                          | `--only="confinement reference"` | 1 of 14 fails                                                                                                                                                       |

## Gates

Run one host-heavy gate at a time, on a machine shared with the other lanes.
No full local `npm test`: the hook and CI carry the chain.

Local, macOS (Seatbelt), on the final tree:

- Engine check (`evaluateTarget` is a function) at the start and at the end: exit 0.
- `test:evaluate-confinement` 1,537 checks green, `test:evaluate-run` 592 green, `test:isolation-primitives` (the golden, unchanged) green, `test:cli` green.
- `test:doc-counts`, `test:doc-claims`, `test:shards`, `test:ci-coverage`, `test:changelog`: green.
- `npm run docs:validate-links`, `npm run lint`, `npm run lint:md`, `npm run format:check`: green.
- `npm run docs:build`: green.
- `git diff -- package.json package-lock.json` is empty.
- Linux, in the `tea-bwrap-strace` container over copies of the final tree under the scratchpad directory: the story's exact command passes the cross-filesystem case (6 checks), and with the tmpfs mounted `exec` the 242 checks of `--only="git history"` pass (the cross-filesystem case, the pack stages case, the edges case, the reach units and the rest of the git history cases).
  The container's git is 2.39.5, so the partial-clone legs and the reftable case skip there with their reasons named; the host's git runs the partial-clone legs of the pack stages and unit cases, and the ubuntu CI job runs the partial-clone cross-filesystem leg.

## Build review

Round 0: one subagent reviewed the commit read only, in three lenses (correctness, test quality, compliance), in place of `/bmad-code-review`.
Every finding was checked against the code before it was acted on.

| Finding                                                                                                                                                                                                                                                       | Verdict    | Route                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Correctness of the pipeline (stage failure and kill, EPIPE, backpressure, `stageOf` behind `--git-dir=`, `GIT_*` stripping, `pack.packSizeLimit` under `--stdout`, an empty pack, a sha256 store, the `.rev` file, a partial clone's pack without `--strict`) | no defect  | none                                                                                                                                                                                                       |
| The failed-stage case scanned the shared temp directory for a leftover workspace, so another lane's run of the same case or a crashed earlier run could fail it                                                                                               | real       | each attempt gets its own `TMPDIR` (`tempDir('pack-stages-tmp')`) and the case reads that directory                                                                                                        |
| Nothing on a CI host proved the git before 2.45 link, since CI's git reports a ref format and only the container's did                                                                                                                                        | real       | `checkWithheldHistoryPackStages` ends with a case whose `git` shim answers `--show-ref-format` as an old git does; restoring `refFormat === 'files'` fails it on this host (1 of 32: 2 then 4 pack stages) |
| The index stage's shim exited before it read its input while the case's label said "after the pack is printed"                                                                                                                                                | real       | the shim reads its input first (`cat >/dev/null`), so the label is true                                                                                                                                    |
| Three comment lines held two sentences, and the AD-8 amendment's "no file, not even a temporary one" read as a negation-then-correction                                                                                                                       | nit, fixed | split and reworded                                                                                                                                                                                         |
| The CHANGELOG said the reader keeps a 256 MiB buffer, and named the cross-filesystem case's hosts wrongly (`/dev/shm` runs it on the ubuntu runner)                                                                                                           | nit, fixed | reworded                                                                                                                                                                                                   |

No finding was rejected.

Round 1 (PR #341, three Opus lenses: adversarial and edge cases, test quality, story and guide compliance).
The adversarial lens found no material defect (bitmaps, pack validity, an empty pack, replace refs, failure ordering, a read-only adopter, the ref-format link).
Every finding below was reproduced and fixed in the PR.

| Finding                                                                                                                                                                                                                  | Fix                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The reference, the CHANGELOG, AD-8, two code comments and this record said the build only reads the project's repository, while `git worktree add` writes the worktree's own entry under the project's `.git/worktrees/` | Each claim names the object store, and the CHANGELOG and AD-8 name the worktree entry; the reference case holds the new sentence                                                                        |
| The cross-filesystem case's skip reason named the wrong hosts and `/dev/shm` on a Mac                                                                                                                                    | The reason names a Linux host whose home directory or `/dev/shm` is on another filesystem, such as the ubuntu runner, and says when `/dev/shm` is absent                                                |
| The index-stage shim exited before it read its input, so the other stage was sometimes killed before it logged, and the pack stages case failed 2 of 24 runs under load                                                  | The shim drains standard input before it fails; 8 parallel runs pass 8 of 8                                                                                                                             |
| The 48 MB heap did not bind a walk held as buffer chunks, which sit outside the V8 heap                                                                                                                                  | The walk stub fails if it finishes before the pack stub has read a line, which a pipe that streams cannot do for an 82 MB walk; the buffer mutant now fails the unit cases                              |
| The before and after listing checks could not fail, because `objects/pack` was read-only throughout                                                                                                                      | The cross-filesystem case also builds a full repository over a writable `objects/pack`, and the failed-stage builds in the pack stages case run over a writable one; the container run passes 12 checks |

Round 2 (regressions only, one Opus lens).
It confirmed every round 1 fix on its own evidence (the pack stages case 8 of 8 in parallel, the Buffer mutant failing on the order check, the container run 12 of 12 and 3 of 4 failing on the old path).
It found two more, both fixed in the PR.

| Finding                                                                                                                                                                                                                 | Fix                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The failed-stage arms ran over a writable `objects/pack`, but their shim failed the stage before the real git ran, so no build path could leave a file there and the listing check still could not fail on the old path | The pack arm's shim runs the real `pack-objects` under `ulimit -f 0` and then fails: a pack printed to a pipe is unaffected, and a temporary file in the adopter's `objects/pack` is left behind; the old path now fails the listing check (`tmp_pack_*`) |
| Four comments, the epics.md amendment and the test design amendment still said the build only reads the project's repository or that `objects/pack` is read-only throughout                                             | Each names the object store and says which arms run over a read-only `objects/pack` and which over a writable one                                                                                                                                         |
