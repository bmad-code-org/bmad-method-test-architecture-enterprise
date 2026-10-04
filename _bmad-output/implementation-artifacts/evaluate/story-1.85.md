---
title: "Story 1.85: Show a sparse-checkout project to the target's git as the project shows it"
type: 'bugfix'
created: '2026-10-04'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '1c55d8c48be6a2b741b7d91c9dac9ee106fe9ae2'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.85; Stories 1.57 and 1.80)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.85 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-7, AD-8)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.80.md (the partial-clone shape and the Decisions that deferred this story)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.57.md (the withheld repository this extends)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** A project whose worktree uses sparse checkout (`git sparse-checkout set`, in cone mode or with a pattern list, and a blob-less clone made with `--sparse`) hands every new worktree its cone, so the files outside the cone are absent from the checkout.
The private repository that Story 1.57 builds for a confined git workspace rebuilds the worktree's index with `git read-tree HEAD`, which sets no skip-worktree bit, and carries no sparse setting.
The target's `git status` therefore lists every tracked file outside the cone as deleted where the project's status lists nothing, and `git sparse-checkout list` fails.

**Approach:** The build asks the new worktree, while its common directory is still the adopter's, whether it is sparse (`core.sparseCheckout`, with `core.sparseCheckoutCone`).
A sparse worktree gets those two settings in the private repository, keeps its own patterns file (`info/sparse-checkout` in its metadata directory), and has `git read-tree -m -u HEAD` run over the index that `read-tree HEAD` built, which marks every tracked file outside the cone skip-worktree and touches no file.
A worktree that is not sparse keeps the index it has today.

## Boundaries & Constraints

**Always:** Commit ids, `commitDigest`, `implementationDigest`, the profiles and the isolation golden stay unchanged.
The sparse state comes from the worktree the build made, so a git that did not copy the cone into it (before 2.36) and a project that is not sparse both leave the index as `read-tree HEAD` builds it.
A step that fails is a `WorkspaceRefusal` (exit 12) and the half-built workspace is removed by the existing path.
The engine check runs at start and end. No eval-quality change. No skill file changes.

**Never:** a sparse setting in the private repository of a worktree that is not sparse, a file written or removed in the checkout by the index step, a change to what the profiles allow, a new dependency.

**Decisions (build worker, owner-delegated):** the Decisions list below carries each choice with its reason.

## I/O & Edge-Case Matrix

| Scenario                     | Input / State                                                                          | Expected Output / Behavior                                                                                                                        | Error Handling                    |
| ---------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Cone                         | `git sparse-checkout set bin rules evals`, tracked `docs/`, `archive/`, `src/` outside | target's `status` clean, `ls-files` lists the outside files, `ls-files -t` equals the project's, `sparse-checkout list` prints the project's cone | n/a                               |
| Pattern list                 | `set --no-cone '/*' '!/docs/' '!/archive/' '!/src/'`                                   | same lines as the project's, `core.sparseCheckoutCone` is `false`                                                                                 | n/a                               |
| Sparse index                 | cone with `--sparse-index`                                                             | same lines as the project's (the private index is a full one)                                                                                     | n/a                               |
| Blob-less `--sparse` clone   | `--filter=blob:none --sparse`, cone set                                                | same lines as the project's, no process fetches from the remote                                                                                   | git before 2.44 skips, as in 1.80 |
| Not sparse                   | no sparse rule                                                                         | `status`, `ls-files`, `ls-files -t` equal the project's, `sparse-checkout list` exits 128 as the project's, no sparse setting                     | n/a                               |
| Worktree-scoped project keys | `git config --worktree remote.leak.url ...`, `credential.helper`                       | the worktree's metadata directory holds no `config.worktree`                                                                                      | n/a                               |
| Index step fails             | `read-tree -m -u` exits nonzero                                                        | `WorkspaceRefusal` naming the command, workspace removed                                                                                          | exit 12                           |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/workspace.js`: new `sparseSettingsOf` (asks the worktree), step (6) of `buildWithheldRepository` (the settings, `read-tree -m -u HEAD`, the removal of `config.worktree`).
- `test/test-evaluate-run.js`: `checkSparseCheckout` (real CLI: cone, pattern list, sparse index, non-sparse control, blob-less `--sparse` clone), helpers `sparseProject`, `sparseView`, `sparseLines`, `checkSparseLines`; `partialCloneOf` gains `{ sparse }`; `historyLines` gains `act`; the sentence check in `checkConfinementReference`.
- `test/fixtures/evaluate/mutation/bin/verdict.js`: the `probe-sparse` act.
- `docs/reference/tea-evaluate-cli.md` (`### File-system confinement`), `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `ARCHITECTURE-SPINE.md` (AD-8), `sprint-status.yaml`, `story-1.84.md` (status `done`).
- Not changed: the profiles and the isolation golden, the skill's guides, `references/ci.md`, `SKILL.md`, the CI plan template, every `capture-record.json`.

## Tasks & Acceptance

- [x] Reproduce through the real CLI on the unchanged code: a cone, a pattern list and a blob-less `--sparse` clone.
- [x] `workspace.js`: the sparse settings and the index step.
- [x] `test/test-evaluate-run.js`, `verdict.js`: the cases, each with its revert check below.
- [x] Reference sentence and its case, `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `ARCHITECTURE-SPINE.md`, `sprint-status.yaml`, this record.
- [x] One Linux run of the new case in the `tea-bwrap-strace` container.

**Acceptance Criteria:** as in `epics.md` Story 1.85, with the amendments dated 2026-10-04 there (the shapes the case runs, every line compared with the project's, and the metadata directory's `config.worktree`).

## Reproduction

Run first on the unchanged code, by hand: in a scratch repository with `git sparse-checkout set cone`, a worktree made with `git worktree add --detach` inherits the cone (its metadata directory holds `info/sparse-checkout` and a `config.worktree` with `core.sparseCheckout` and `core.sparseCheckoutCone`).
With a bare store as its common directory and `git read-tree HEAD`, `git status --porcelain` listed `other/b.txt` and `other/deep/c.txt` as deleted (status code `D` in the second column).
Setting `core.sparseCheckout` and `core.sparseCheckoutCone` in the store changed nothing in the status; `git read-tree -m -u HEAD` after them gave `S other/b.txt` and `S other/deep/c.txt` in `git ls-files -t`, a clean status, and `git sparse-checkout list` printed `cone`.

Then through the real CLI (`checkSparseCheckout` against the unchanged `workspace.js`, a confined run whose stub `probe-sparse` prints the git lines): 15 of 52 checks failed.
For the cone, the pattern list and the blob-less `--sparse` clone alike, the target's `status` listed `archive/old/notes.txt`, `docs/guide.md` and `src/library.js` as deleted where the project's printed nothing, `ls-files -t` flagged every outside file `H` where the project's flags it `S`, `git sparse-checkout list` exited 128 where the project's printed its cone, and `core.sparseCheckout` read `unset` where the project's read `true`.
The control (a project that is not sparse) passed, so `git ls-files` and `git status` of a non-sparse project already equal the project's.

## Decisions

1. **Settings in the private repository, `read-tree -m -u HEAD` for the bits.**
   The target's `git sparse-checkout list` needs `core.sparseCheckout`, so the store carries the worktree's two settings; the patterns stay the worktree's own `info/sparse-checkout`, which the metadata directory already holds, so no pattern is copied or parsed.
   `read-tree -m -u` over the index that `read-tree HEAD` built applies git's own pattern engine, so a cone and a pattern list need no code of ours.
   Verified by experiment on git 2.55 and 2.39: it sets the bits, runs no clean or smudge filter, and writes or removes no file (a file outside the cone that exists is left, with git's "not uptodate" notice and exit 0, since a fresh index has no stat data).
2. **Rejected: `update-index --skip-worktree` from a path list.**
   The list would come from the adopter's index (`ls-files -t`) or from our own matching of the patterns.
   The first copies one entry per file of a monorepo, which sparse checkout exists to avoid, and the second is a second pattern engine that can diverge from git's.
   Neither supplies the settings that `git sparse-checkout list` needs.
3. **Rejected: `git sparse-checkout reapply`.**
   It runs the same `read-tree -m -u` and also updates modes (cone, sparse index), which can rewrite the pattern file or the index format; the build needs only the index step.
4. **Rejected: `extensions.worktreeConfig` in the store, so the copied `config.worktree` carries the settings.**
   It would make git read every worktree-scoped key `git worktree add` copied, remotes and credential helpers of the project included.
   The two settings go into the store's own configuration instead.
5. **The sparse question is asked of the worktree, before the commondir swap.**
   The effective `core.sparseCheckout` the new worktree reads (its own configuration over the project's) is what the project's checkout shows, whichever file holds it.
   A git before 2.36 does not copy the cone into a new worktree, so it is a full checkout and the question answers no.
6. **A failing `read-tree -m -u` refuses the build (exit 12).**
   The reviewer found no input where it fails after `read-tree HEAD` succeeded (patterns that leave no entry, a missing or empty patterns file, legacy settings in the common configuration, gitlinks, a project that is itself a linked worktree all exit 0 on git 2.39 and 2.55), and a refusal beats a target that sees false deletions.
7. **`config.worktree` leaves the metadata directory (found in review, pre-existing).**
   `git worktree add` copies the project worktree's `config.worktree` into the new metadata directory, which the target may read, with any worktree-scoped remote URL, credential helper or hook, and `git sparse-checkout set` is what turns that file on, so sparse projects are the ones that have it.
   The private repository never reads it, so it is removed after the sparse settings are read.
8. **The sparse index is not carried.**
   The private repository's index is a full one; `status`, `ls-files` and `ls-files -t` equal the project's (the case runs a sparse-index project), while `ls-files --sparse` differs.
   AD-8 says so.
9. **The case compares every line with the project's own, byte for byte.**
   The stub prints `status`, `ls-files`, `ls-files -t`, `sparse-checkout list`, both settings and the tracked files the checkout holds as JSON, and `sparseView` asks the project for the same lines with the same git commands.
   The evaluation folder's paths leave the project's lines, since the target's git sees the folder as an empty tree (Story 1.57).
   The cone is `bin`, `rules` and `evals`, which the stub target needs on disk; `docs/`, `archive/old/` and `src/` are the tracked files outside it.
10. **The `--sparse` clone case runs where git honors `GIT_NO_LAZY_FETCH` (2.44 and later), like Story 1.80's partial-clone cases.**
    The clone sets its cone before the remote's upload-pack logging starts, so the log holds only fetches of the run.

## Implementation Notes

- `sparseSettingsOf` runs `git config --type=bool --get` for the two keys against `--git-dir <metadata> --work-tree <top>`; one process more for a non-sparse worktree and three for a sparse one.
- The linked-objects shortcut of Story 1.57 needs no change: the settings and the index step run in step (6) for every workspace, linked or built.
- Not done, by decision: a sparse index in the private repository; a cone edit by the target (it writes the private repository, which the reference already lists among the git writes a target cannot make).
- Linux: the new case ran in the container `tea-bwrap-strace` (Debian bookworm, git 2.39.5, bubblewrap 0.8.0, strace 6.1, user `tester`), exactly as `story-1.82.md` records, on a copy of the tree under the scratchpad directory with `.git` left out and the worktree's `node_modules` mounted read-only: `docker run --init --rm --security-opt seccomp=unconfined --security-opt apparmor=unconfined --security-opt systempaths=unconfined --cap-add SYS_ADMIN --cap-add SYS_PTRACE -u tester -e HOME=/home/tester -v <copy>:/work -v <worktree>/node_modules:/work/node_modules:ro -w /work tea-bwrap-strace node test/test-evaluate-run.js --group=confinement --only="sparse checkout"`.
  51 checks passed on the first change (the `--sparse` clone case skips there, git 2.39 predates 2.44, and prints the skip line); the final tree is in the Gates section.

## Revert observations

Each revert was applied once to a scratch copy of the tree under the scratchpad directory (never the working tree), the named case run, the failed-check count recorded and the copy restored.

| Revert (the one edit)                                                         | Case run                         | Observed                                                                                                                                 |
| ----------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| A plain `read-tree` (the sparse block removed)                                | `--only="sparse checkout"`       | 20 of 66 fail: status lists the outside files as deleted, `ls-files -t` flags them `H`, `sparse-checkout list` exits 128, settings unset |
| Every worktree treated as sparse (the `core.sparseCheckout` question removed) | `--only="sparse checkout"`       | 3 of 66 fail, all in the non-sparse control: `sparse-list` prints `""` where the project's exits 128, `sparse-config` reads `true/unset` |
| The settings not written to the private repository                            | `--only="sparse checkout"`       | 20 of 66 fail: `read-tree -m -u` applies no pattern, so the status lists deletions and `sparse-config` reads `unset/unset`               |
| `core.sparseCheckoutCone` not carried                                         | `--only="sparse checkout"`       | 7 of 66 fail: `sparse-list` prints the raw patterns of a cone, `sparse-config` reads `true/unset`                                        |
| The `read-tree -m -u HEAD` step removed, the settings kept                    | `--only="sparse checkout"`       | 8 of 66 fail: the status lists deletions, `ls-files -t` flags the outside files `H`                                                      |
| The reference's sparse sentences deleted                                      | `--only="confinement reference"` | 1 of 13 fails                                                                                                                            |
| `config.worktree` left in the metadata directory (review finding 1)           | `--only="sparse checkout"`       | 4 of 74 fail: the cone, pattern list, sparse index and `--sparse` clone runs each find the file                                          |

The first six rows ran on the tree before the `config.worktree` change and its reference sentence; the last row ran on the final tree.

## Gates

Run on the final tree, one host-heavy gate at a time, on a machine shared with the other lanes. No full local `npm test`: the hook and CI carry the chain.

- Build round on the final tree: `test:evaluate-confinement` 1,311 checks (the new case is 74 of them), `test:evaluate-run` 592, `test:evaluate-arms` 733, `test:evaluate-mutation` 727, `test:evaluate-preflight` 324, `test:evaluate-guidance`, `test:isolation-primitives` (golden unchanged), `test:bmad-output-gated` 124 green. `test:evaluate-run`, `-mutation`, `-preflight` and `-isolation-primitives` ran before the `config.worktree` removal, which only deletes a file in a metadata directory; `-confinement` and `-arms` ran after it.
- Linux: `checkSparseCheckout` in the `tea-bwrap-strace` container, 58 checks green on the final tree (the `--sparse` clone case skips on git 2.39 and prints the skip line).
- `test:doc-counts`, `test:doc-claims`, `test:shards` (the confinement weight is 502 seconds: 450.4 plus the case's 34 seconds at the 1.517 CI ratio), `test:ci-coverage`, `test:changelog`: green.
- `npm run lint`, `npm run lint:md`, `npm run format:check`, `npm run docs:validate-links`: green.
- Engine check at the start and the end: exit 0. `git diff -- package.json package-lock.json` is empty.

## Build review

One fresh Opus subagent reviewed the commit in three lenses (code, tests, adversarial), read only, in place of `/bmad-code-review`.
Every finding was checked against code or by experiment before it was acted on.

| Finding                                                                                                                                                                               | Verdict           | Route                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Low (adversarial, pre-existing): the metadata directory holds a copy of the project's `config.worktree`, which a target can read, with worktree-scoped remote URLs, helpers and hooks | valid, reproduced | Fixed here: the file is removed after the sparse settings are read; the case sets a worktree-scoped URL and helper and asserts the file is absent; reference, AD-8 and CHANGELOG say so |
| Low (code): `index.sparse` is not carried, so the target's index is a full one and `ls-files --sparse` differs                                                                        | valid, accepted   | Decision 8 and AD-8 name it; `status`, `ls-files` and `ls-files -t` equal the project's                                                                                                 |
| Low (tests): the evaluation-folder filter handled the one-character `ls-files -t` tag and not the two-character status prefix                                                         | valid             | Fixed: the filter accepts both prefixes                                                                                                                                                 |
| Low (code, informational): a populated submodule outside the cone is `H` in the project and `S` in the target (status clean on both)                                                  | valid, accepted   | A submodule inside `launch.root` is already refused; an outside one differs in a flag only                                                                                              |
| Info (tests): the `--sparse` clone case skips on a git before 2.44                                                                                                                    | valid, accepted   | As Story 1.80's partial-clone cases: they run on macOS here and on CI hosts with git 2.44 or later, and fail under `CI` on an older git                                                 |

No finding is left for a new story.
Bubblewrap ran only in the container, once.
