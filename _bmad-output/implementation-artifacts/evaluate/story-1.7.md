---
title: 'Story 1.7: Mutate only in a disposable copy and prove the rollback'
type: 'feature'
created: '2026-09-24'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: '4cfe42a13099d8869c919743f3a2519bb281356a'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Stories 1.6, 1.7, 1.8)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.7 section, R1-01, R1-06, R1-11)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-5, AD-6, AD-7, AD-8, AD-9, AD-10)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** `tea-evaluate preflight` refuses every evaluation holding a seeded-defect probe with exit 12, because no mutated copy exists, and its disposable copy links provisioned directories in writable, so nothing yet earns `rollbackVerified: true` and a leg can still write into the adopter's files.

**Approach:** Build AD-8's workspaces (a detached git worktree at the evaluated commit, a temp copy for a `copy` workspace or a non-git target, a temp copy of the working tree under `--from-working-tree`), each with read-only provisioned directories, and qualify every controlled-mutation probe inside `preflight` through AD-8's six steps, run by a single-trial arm executor over the contract's interaction plan and a deterministic evaluator over eval-quality's `resolveCheck`.
The qualified probe then reaches `eval-quality preflight`, whose manifestation-witness leg runs in a mutated copy while every other leg runs in the pristine copy (AD-6).

## Boundaries & Constraints

**Always:** the adopter's tree is never written (git status and every tracked file unchanged); `rollbackVerified` is computed from the restored digest and the re-pass, never written as a literal; every workspace is removed in `finally` and on an interrupting signal; the enforced preflight verdict still comes from the eval-quality CLI; the qualified probe is validated against eval-quality's published probe schema and admitted by its `qualifyProbe` before it is written; `test/eval-contract-strength.js` and `test/test-automate-eval-fixture.js` keep only TeA data.

**Never:** trial sets, sealing, `score`, `run.json`'s scoring fields (Story 1.8); the historical, gameability or canary routes (Story 1.9); `captured`, `matcher` or `principal` input bindings (Story 1.18); a new subcommand (AD-5 fixes seven).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Git target | committed stub project, seeded probe on M-001 | exit 0; the arms ran in a detached worktree; `run.json` `dirty: false`; qualified probe with `rollbackVerified: true`; witness leg in the mutated copy, others in the pristine copy; no worktree left | N/A |
| Working tree | uncommitted edit, `--from-working-tree` | the edit is evaluated in a temp copy; `run.json` `dirty: true` | N/A |
| Copy workspace | `workspace.kind: copy`, or a non-git target | temp copy; `run.json` `dirty: false` and a tree digest | N/A |
| Occurrences | `find` absent, or present twice | exit 10, no probe | N/A |
| Weak mutation | baseline fails, or the mutated arm passes | exit 11, no probe | evidence kept |
| Infrastructure | unwritable temp directory, a restore that throws, a target exiting an infrastructure code | exit 12, no probe | workspaces removed |
| Provisioned write | a leg writes under a provisioned directory | the write fails; the adopter's directory is unchanged | N/A |
| Other seeded route | a seeded probe on the historical route | exit 12 before any leg | N/A |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/preflight.js` -- the command; its copy code (`stageCopy`, `containLinks`, `realPathLoosely`, `cleanUpOnSignal`) moves to `workspace.js`; `recordingPort` gains per-leg routing.
- `cli/lib/evaluate/registry.js` -- `createProbePort({ cwd, projectRoot })` and `targetProblems(projectRoot)` already take a per-workspace root; unchanged.
- `cli/lib/evaluate/records.js` -- `recordObservation` builds the arm's observations; `createArtifactValidator` validates the qualified probe and the scoring policy.
- `cli/lib/evaluate/engine.js` -- `loadEngine` gives `resolveCheck`, `makeResolveOperand`, `makePointerDenotesCollection`, `referenceSetKeysOf`, `digestBytes`, `qualifyProbe`; `engineVersion`, `expectedSchemaVersion`.
- `cli/lib/evaluate/check.js` -- `provisioned-target` and `skill-root` messages; a controlled-mutation probe needs `policy/scoring-policy.json`.
- `cli/lib/evaluate/digest.js` -- `digest` for tree digests; `bounded-probe.js` for `git`.
- `test/eval-contract-strength.js` -- `cachingPort`, `cacheOnlyPort`, `requestKey`, `copyTree` and the generic half of `stagedWorkspaceFor` move to `workspace.js`.
- `test/test-automate-eval-fixture.js` -- its mutate, measure, restore cycle moves to `mutation.js`; it keeps its voucher data and evidence writing.
- `test/test-evaluate-boundaries.js` -- `MOVES` gains both files; a new `rollback-literal` rule.
- `test/test-evaluate-preflight.js` -- the seeded refusal and the provisioned-link assertions change.
- `node_modules/eval-quality/dist/core/preflight/plan.js` -- a witness leg's `probeId` is the witness's `legId`; `reduce.js` fails `seeded-faults-scoped` when the witness fires on a clean leg.

## Tasks & Acceptance

**Execution:**

- [x] `cli/lib/evaluate/workspace.js` -- workspaces, read-only provisioning, link containment, signal cleanup, adopter tree state, `stageDirectories`, `cachingPort`.
- [x] `cli/lib/evaluate/arm.js`, `cli/lib/evaluate/evaluator.js` -- the single-trial arm executor and the deterministic evaluator.
- [x] `cli/lib/evaluate/mutation.js` -- replace-exact, the six-step cycle, the qualified probe.
- [x] `cli/lib/evaluate/preflight.js`, `cli/evaluate.js` -- qualification inside `preflight`, routing, `--from-working-tree`, exit 11, `run.json`.
- [x] `cli/lib/evaluate/check.js`, `cli/lib/evaluate/schemas/evaluation.schema.json` -- the scoring-policy requirement and the read-only wording.
- [x] `test/fixtures/evaluate/mutation/`, `test/test-evaluate-mutation.js` -- the stub target and the cases.
- [x] `test/eval-contract-strength.js`, `test/test-automate-eval-fixture.js`, `test/test-evaluate-boundaries.js`, `test/test-evaluate-preflight.js`, `test/test-evaluate-check.js`, `test/fixtures/evaluate/valid/` -- re-pointed harness and updated cases.
- [x] `package.json`, `.github/workflows/quality.yaml`, `docs/reference/tea-evaluate-cli.md`, CHANGELOG, sprint-status.

**Acceptance Criteria:** epics.md Story 1.7; each revert check in test-design-epic-1.md's Story 1.7 table is exercised once.

## Design Notes

- **Where qualification runs.** eval-quality's `preflight` parses its probe list against the full `Probe` schema, whose `controlled-mutation` route requires baseline-pass and mutated-fail evidence and a rollback flag, and plans a seeded-fault leg from each defect's manifestation witness.
  So a seeded probe reaches the CLI only after AD-8's cycle has produced that evidence, and the cycle runs inside `preflight`, ahead of the legs; AD-5's seven subcommands stay seven.
  The cycle runs on the pristine workspace, whose restore it then proves, so the legs that follow run on a copy whose rollback was measured; each mutation also gets its own mutated workspace for its witness leg.
- **Arms.** An arm is one pass over the contract's interaction plan in declaration order, with literal bindings only, through the registry's port for that workspace; a stdin binding with one string literal is sent as text, any other as JSON.
  The deterministic evaluator resolves each oracle the probe's behaviors declare through `resolveCheck` over the arm's observations: held when the check resolves as its polarity expects, violated when it resolves the other way, not attempted on `insufficient-evidence`.
  The baseline passes when every such oracle holds; the mutated arm fails when at least one is violated.
- **Re-pass.** Step 6 re-runs the baseline arm at most `1 + reExecutionCap` times, `reExecutionCap` from `policy/scoring-policy.json`.
- **Digests.** `preDigest`, `mutatedDigest` and `restoredDigest` are eval-quality's `digestBytes` over the `targetArtifact` bytes (`sha256:<hex>`), so a stub can print the same value from its own working directory.
  The qualified probe's `artifactDigest` is `preDigest`; `commitDigest` is `digestBytes` over the commit id for a worktree and the tree digest for a copy; `implementationDigest` digests the workspace files under `launch.skillRoot` (or the whole root), provisioned directories left out.
- **Read-only provisioning.** No unprivileged process can make a symbolic link read-only, so each provisioned directory is copied (a copy-on-write clone where the file system offers one) and its write bits removed; a leg writing under it fails unless it restores the bits, and the adopter's directory is never reachable.
- **Workspaces after review.** The pristine workspace runs only the legs; each seeded probe is qualified in a workspace of its own, and each mutation's witness leg in a mutated workspace; every later workspace reproduces the pristine one.

## Implementation Notes

- **Implemented directly.** The workflow's implementation subagent was not used: this build already runs as a subagent of the coordinator, and the design decisions below were made during investigation.
- **Workspaces (`cli/lib/evaluate/workspace.js`).** `createWorkspace` makes a detached worktree (`git worktree add --detach --quiet`, `core.hooksPath` pointed at an empty directory, the commit, tree and the worktree's metadata path recorded) or a temp copy (`fs.cpSync` with verbatim links and `COPYFILE_FICLONE`, `.git` and the evaluation's `runs/` left out), copies each provisioned directory in and removes its write bits, and contains every link in the workspace.
  Link containment now resolves each link where it lies in the workspace: inside the workspace it stays, into the source tree it is re-pointed, anywhere else it is refused; Story 1.6's source-side resolution gave the same answers on every case its tests hold, and the workspace-side one also serves a worktree, whose links are the commit's.
  `removeWorkspace` restores owner write access to directories, runs `git worktree remove --force --force`, removes the directory, and removes the worktree's metadata directory if it is still there, so `git worktree prune` never runs against the adopter's other worktrees.
  Every git command runs with the `GIT_` variables removed, since TeA's own pre-commit hook runs `npm test` with `GIT_DIR` and `GIT_INDEX_FILE` set.
  `adopterTreeState` reads `git status --porcelain=v1 -z --untracked-files=all` and digests the bytes of every path it names, where `git diff` would have been bounded by a 1 MB output buffer and blind to untracked content.
- **Arms and evaluator.** `arm.js` runs the interaction plan (literal bindings, `after` ordering, command operations only) through `hostEnvironmentPort`, which now carries the host-environment injection and scrubbing `preflight.js` held for its legs; an answer carrying one of the entry's `infrastructureExitCodes` stops the arm (exit 12).
  `evaluator.js` resolves oracles through the engine's `resolveCheck`, `makeResolveOperand`, `makePointerDenotesCollection` and `referenceSetKeysOf`, the same functions `check.js` already used for the infrastructure-code rule.
- **Mutation (`mutation.js`).** `planReplaceExact` works on bytes (a `Buffer` search), so a target that is not UTF-8 cannot be corrupted by a decode; the target must be a regular file.
  The restore removes whatever the mutated arm left at the path before writing, so a link swapped in cannot redirect it, and a directory there fails it.
  The occurrence count is checked before step 1, so an unappliable mutation spends no arm.
- **Preflight.** The qualification needs `policy/scoring-policy.json` (`reExecutionCap`, `regexMatchStepBudget`), so `check` requires it once a probe takes the `controlled-mutation` route and validates a policy that is present against the engine's schema and version.
  The qualified probe's `commitDigest` is `digestBytes` over the commit id for a worktree and the tree digest for a copy, `implementationDigest` digests the workspace under `launch.skillRoot` (or the whole root), provisioned directories left out, and `systemId` is the `evaluationId`; Story 1.8 asserts these against AD-7 and may tighten them.
  A missing `launch.skillRoot` in the workspace exits 12 before the cycle, since there is no implementation to digest.
  The run directory is created only once the pristine workspace exists, so a refused workspace starts no run, as Story 1.6's refusals already asserted.
- **Harness moves.** `test/eval-contract-strength.js` keeps `stagedWorkspaceFor`'s TeA data (which directories a suite's leg needs, the trace set staging) and the log formatting, and hands the runtime's `cachingPort` its file-system port, clock and an `augment` that adds the agent and the operation's environment; the cache file shape is unchanged.
  `test/test-automate-eval-fixture.js` keeps its voucher inputs, its three arms and its evidence files, runs the runtime's cycle over a runtime `copy` workspace of the voucher service, and gains a `require.main` guard so the boundaries test can load it; its evidence bytes are unchanged.
  `test:evaluate-boundaries` scans the two named files beside `test/lib/`, copies `test/` and `tools/` into its move plants (the named files load the trace harness, which loads `tools/`), and skips `test/eval-artifacts/`.
- **Gaps closed on the way.** `README.md` read "eighty" `npm test` checks after this story added the eighty-first. `test/test-evaluate-check.js` introduced its cases as "the eleven authoring defects" where it holds far more; the heading now names none. Story 1.6's record still said `status: 'in-review'` after its merge.
  `CHANGELOG.md`'s unreleased Story 1.6 entry said provisioned directories stay writable and every seeded evaluation exits 12; both sentences now describe the shipped behavior.
  The live `npm run eval:preflight` (below) found every NFR and CI leg running in an empty directory: `stagedWorkspaceFor` staged the trace and test-review suites only, so each NFR and CI agent reported its skill and project missing and wrote a report about that. It now stages NFR and CI sets through their own harnesses (`eval-nfr.js` and `eval-ci.js` `stageWorkspace`, with each set's artifact paths), as it did for trace; a rerun of the NFR suite showed the agents reading their bundles and writing real assessments.

### Revert checks exercised

Each was undone once in the working tree, the named suite run, the failure observed, and the change restored.

- Worktree replaced by a copy (`const worktree = false`): "the git target's workspace is copy; expected git-worktree", "the baseline arm ran in a "plain" directory; a git target runs in a detached worktree", and the uncommitted-edit case evaluated the working tree.
- `dirty` hard-coded `false`: "run.json records dirty false under --from-working-tree; expected true"; hard-coded `true`: four failures, the git, commit, copy and non-git cases.
- The restore made a no-op: "restoredDigest sha256:fb28… is not preDigest sha256:2a77…", "the run wrote qualified probes []", and the git target exited 12.
- Mutating the adopter's `launch.root` in place of the pristine workspace: the git target exited 11, "the arms' verdicts are held and held", no qualified probe.
- The occurrence guard removed: both occurrence cases exited 11 (expected 10); the baseline guard removed: the baseline case lost its message; the mutated-arm guard removed: exit 3 and a qualified probe written; the step 5 guard removed: "a restore whose digest differs stopped with 11 … expected 12 at step 5" (the unit case over scripted arms, added because the end-to-end cases reach step 5 only through a broken restore); the re-run bound off by one: three cycle failures.
- The infrastructure exit guard removed: "a target exiting an infrastructure code exited 3; expected 12".
- Provisioned directories left writable: "a write under the provisioned vendor/ was allowed".
- Every leg routed to the pristine workspace: exit 3, "the witness leg ran in pristine", a failed CLI verdict; every leg routed to the mutated workspace: exit 3, each clean leg "ran in mutated:M-001", and "the seeded-faults-scoped check is failed; expected satisfied".
- The adopter-tree comparison hard-coded true: "preflight whose target wrote into the project exited 0; expected 12" and a qualified probe written.
- `rollbackVerified: true` written in `qualifiedProbe`: `test:evaluate-boundaries` reports `cli/lib/evaluate/mutation.js [rollback-literal]`.
- `cachingPort` defined again in `test/eval-contract-strength.js`: "defines cachingPort, which lives only in cli/lib/evaluate/workspace.js" and "exports cachingPort, which is not … own cachingPort"; the automate fixture off the mutation module: "does not require ../cli/lib/evaluate/mutation".
- The scoring-policy requirement removed from `check`: "a controlled-mutation probe with no scoring policy: check exited 0; expected 10".

### Review round revert checks

Each fix was undone once in the working tree, `node test/test-evaluate-mutation.js` run, the failure observed, and the fix restored.

- Qualification in the pristine workspace: "leg witness-alpha saw what the qualification's mutated arm left behind", four legs.
- The evaluation folder kept in the workspace: "leg witness-alpha could read the evaluation folder", four legs.
- The mode not restored: "the restored bin/run.sh has mode 644, not the pre-mutation 755".
- The reading after the legs removed: "preflight whose legs wrote into the project exited 0; expected 12".
- Refs left out of the reading: "preflight whose target tagged the shared repository exited 0; expected 12".
- Links contained over the whole worktree: "preflight over a project in a repository with a link out elsewhere exited 12; expected 0".
- The provisioned-link refusal removed: both link cases "exited 11; expected 12 naming the link".
- Overlapping occurrences counted once: "overlapping occurrences of the find text count once".
- The `GIT_` scrub removed: "preflight under a hook's GIT_ variables exited 12; expected 0".
- `unlockDirectories` not descending: 56 failures, the git target exiting 12 on a read-only leftover.
- `.git` in the implementation digest: "the same files checked out in another worktree digest to sha256:c5b1…, not sha256:bf58…".
- The commit kept for copies: "run.json records commit b3e0… for a copy workspace".
- The re-pass exit left at 11: "a baseline that fails its only re-run under reExecutionCap 0 stopped with 11 … expected 12 (an unfit harness)".
- `rollbackVerified = true` bound, reassigned, computed-keyed or held in JSON: each new plant is reported by `test:evaluate-boundaries`, which would miss it without the new clauses.

## Spec Change Log

- 2026-09-24: epics.md Story 1.7, first criterion, amended: provisioned directories are read-only copies, since no unprivileged process can make a symbolic link read-only; ARCHITECTURE-SPINE.md AD-8 amended to match.
- 2026-09-24: epics.md Story 1.7, the six-steps criterion, amended: the cycle runs inside `tea-evaluate preflight`, ahead of its legs, since eval-quality's `preflight` parses its probe list against the full `Probe` schema whose `controlled-mutation` route needs the cycle's evidence; `reExecutionCap` comes from `policy/scoring-policy.json`, which `check` now requires once a probe takes the route.
- 2026-09-24: epics.md Story 1.6, the probe-list criterion, marked superseded: a controlled-mutation probe now reaches the CLI, and another route still exits 12.
- 2026-09-24: test-design-epic-1.md, Story 1.7's workspace row amended: it said a non-git target records `dirty: true`, which the corrected criterion contradicts, and named read-only links.
- 2026-09-24 (review round 1): the Design Notes' single pristine workspace became one pristine workspace for the legs and one qualification workspace per seeded probe, every later workspace reproducing the first; a re-pass failure exits 12, since eval-quality reads an exceeded re-execution cap as an unfit harness; the adopter's project is read after the legs as well, refs, configuration and hooks included; the evaluation folder is left out of every workspace. None of these contradicts a criterion's text, so epics.md is unchanged by them.
- 2026-09-24 (owner): Stories 1.27 (test-design contract guard rows, from the staged live run) and 1.28 (recover from a killed run: supervisor and leader SIGKILLed together, and workspaces a SIGKILLed preflight leaves) appended to Epic 1.

## Review Triage Log

Three layers ran on opus in parallel over the working tree: `bmad-code-review` (C, four sub-layers), `bmad-testarch-test-review` (T) and `bmad-review` adversarial by execution (A).
Each finding was checked against the code before acting; every fix below has a test that fails when the fix is undone, except where the row says otherwise.

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| C1, A2 | high | the pristine workspace was reused, so what the mutated arm left behind reached the re-pass, the next probe and every clean leg | fixed: each seeded probe is qualified in a workspace of its own (`qualify-<probeId>`), removed after its cycle, and the legs run in a pristine workspace no arm touched; the stub writes `residue.txt` in lenient mode and the test asserts the re-run sees it and no clean leg does |
| A1 | high | a target running git in the worktree writes the adopter's refs, configuration and hooks, which the worktree shares, and nothing noticed | fixed by detection: `adopterTreeState` reads every ref, the configuration and the hooks directory beside `git status`, so a change exits 12 with no qualified probe; test: the stub tags the commit through its worktree; prevention would mean dropping the worktree the criterion names, so the docs now say the worktree shares those and the run refuses a change to them |
| A3, C4 | high | one unreadable directory a leg left behind kept every read-only directory locked, `removeWorkspace` threw out of `finally`, masked the outcome and leaked the other workspaces | fixed: `unlockDirectories` opens each directory before reading it and skips only what still fails; `finally` removes each workspace under its own try and logs a leftover; test: a mutated arm that leaves `locked/` at mode 000 still qualifies and leaves the temp directory empty |
| A4, C10 | medium | a restored workspace that fails its re-runs exited 11, and a failed restore paired with a silent mutation reported 11 | fixed: the restored digest and mode are checked before the mutated verdict, and a re-pass failure exits 12, since eval-quality reads an exceeded re-execution cap as an unfit harness; docs, the `cli/evaluate.js` header and CHANGELOG say so |
| A5, C5 | medium | the adopter-tree reading ran only with seeded probes and only before the legs; outside git there was none | fixed: read before the workspaces, after the qualification and after the legs, for every run; outside git the tree digest of `launch.root` without `runs/`; tests: a leg of an evaluation with no seeded probe writing into the project exits 12 |
| A6, C13 | medium | a copy workspace inside a repository recorded the commit while holding working-tree bytes | fixed: a copy records `commit: null`; test |
| A7 | medium | a link out of the repository anywhere in a monorepo refused every subproject, and the message named the wrong root | fixed: links are contained under the workspace's `launch.root`, resolved against the worktree top; test: a project under `packages/` of a repository whose top holds a link out |
| A8 | medium | a provisioned directory that is a symbolic link made its target read-only | fixed: refused with exit 12 whether the link is untracked or tracked; the docs no longer say a leg "cannot" write, since the owner can restore the bits and root ignores them |
| A9 | medium | large files, a missing `TMPDIR` and disk-full surfaced as raw stack traces | fixed: file digests are streamed in 1 MB chunks, a missing temp directory and any other error while making a workspace become a `WorkspaceRefusal` with a message; test: a `TMPDIR` that does not exist exits 12 naming it; the 2 GB and disk-full paths are not reproduced in the suite |
| A10, C6 | medium | the mutated workspace was rebuilt from the live project and HEAD, so edits or a moved HEAD during the run reached the witness leg | fixed: every later workspace reproduces the pristine one (its commit, or a copy of the pristine copy whose tree digest must match, provisioned copies taken from the pristine workspace) |
| A11 | low | `reExecutionCap` has no runtime ceiling | skipped: the field is eval-quality's, its published default is 2 and the adopter sets it; step 6 stops at the first pass, so the cap is reached only by a harness that never re-passes |
| A12 | low | the evaluation folder (contract, probes, mutations) sat inside every workspace, an answer key for an agent target | fixed: left out of every workspace (a copy skips it, a worktree removes it after checkout); tests in both the mutation and preflight suites, where Story 1.6's assertion that the copy holds the folder is inverted |
| A13, C12 | low | two witnesses sharing a leg id overwrite each other's route | skipped: eval-quality's `planPreflight` refuses a leg id claimed twice (`malformed-operator-expression`) before any leg reaches the port, so no overwritten route drives a leg; read in `dist/core/preflight/plan.js` |
| A14 | low | the stub's header miscounted its policy lines | fixed |
| C2 | medium | the restore dropped the file mode | fixed: the mode is recorded, restored and compared at step 5; unit test on a 0755 script |
| C3 | medium | `implementationDigest` hashed the worktree's `.git` file, so it depended on where the checkout sat | fixed: `.git` at the workspace top is excluded; test: two projects of the same files digest alike |
| C7 | medium | overlapping occurrences counted once | fixed; unit test |
| C8 | low | qualified probes were written before the mutated routes could fail | fixed: `probes/` is written last, after the reading that follows the legs |
| C9 | low | an arm error lost the cycle's evidence, and a raw adapter error escaped | fixed: the cycle wraps every arm, keeps its evidence and a `fault.json`, and a denial exits 10; no end-to-end test reaches an arm denial, since `check`'s `unregistered-executable` refuses every such evaluation first |
| C11 | low | a failed `git worktree add` could leave its metadata | fixed: the entry is found by its `gitdir` file in the repository whether or not the add finished; not reproduced in the suite |
| C14, T11 | low | the rollback literal could hide in a binding, a bare assignment, a computed key or a JSON template | fixed: four new plants and a JSON scan under `cli/` |
| C15, T9 | low | root ignores permission bits | fixed: the read-only checks are skipped with a printed reason as root |
| C-gaps | low | untested: `expects-violation`, credential scrubbing in evidence, tree digest stability, arm bindings and order, the moved leg cache, exit-11 evidence | fixed: each has a case now, the leg cache with a pinned `requestKey` computed by the code at 4cfe42a |
| C-text | low | CHANGELOG's copy model, a JSDoc line, the lost `--from-cache` hint | fixed; `cacheOnlyPort` takes a `hint` |
| T1 | medium | a global `commit.gpgsign` crashed the suite | fixed: the test's git reads no global or system configuration |
| T2 | medium | the non-git case depended on `TMPDIR` | fixed: the precondition is asserted with a message |
| T3 | medium | the runtime's `GIT_` scrub was never exercised | fixed: a run under a hook's `GIT_DIR`, `GIT_WORK_TREE` and `GIT_INDEX_FILE` |
| T4 | medium | refs and configuration changes were invisible to the test | fixed: the test's own reading adds refs, the stash and `.git/config` |
| T5 | medium | unbounded waits | fixed: every spawn has a 120 s timeout and the interrupt wait a deadline |
| T6 | medium | "no probe" could pass vacuously | fixed: more than one run directory fails, and each failure case asserts its run directory, no `probes.json`, and the exit-11 evidence |
| T7 | low | removing step 6's early stop went unnoticed | fixed: the git target asserts one re-run and a unit case asserts the phases |
| T8 | low | the step 5 unit case keyed on call order | fixed: keyed on content |
| T10 | low | two loops could check nothing | fixed |
| T12 | low | no check that the automate fixture's copy is removed | fixed |
| T13 | low | pid reuse in the interrupt case | fixed: alive means the pid still runs the stub (`ps`) |

## Final review round 1

The final review of PR #237 at 7e84609, worked after rebasing onto `main` at ccde995 (#236, TEA outputs scoped into per-workflow folders with run keys).
The rebase conflicted in `CHANGELOG.md` only, and both entries are kept under `## [Unreleased]`.
The semantic interactions: #236 moved the NFR and CI harnesses' report paths and prompts (run keys), which `stagedWorkspaceFor` now reads through each harness's own artifact-path function, so the staged legs follow them; every request key in those suites changed with the prompts.
The runtime reads no `_bmad` configuration and writes only under the evaluation folder's `runs/`, so no output folder or run key reaches it.
Each finding was verified against the code first.

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| R1 | high | an arm that replaced a directory on the `targetArtifact`'s path with a link to the adopter's tree carried the runtime's own restore out of the workspace | fixed: `planReplaceExact` and the cycle check every directory on the path is real before the mutation, before the restore and so before the step 5 digest (exit 12, `rollbackVerified` false); test: a mutated arm that links `rules/` to the project's `rules/` exits 12 with the project unchanged |
| R2 | medium | preflight legs exiting an infrastructure code pass, while the docs promised exit 12 | skipped in code, fixed in wording: Story 1.6's criterion and test-design row require a leg's non-zero exit to reach the CLI's verdict (a failing control leg exits 3), and AD-10 classifies that exit 3 as infrastructure from the persisted verdict; faulting the leg would break that pass-through. The exit-12 promise now names qualification arm steps, where it holds, and the preflight section says how a leg's infrastructure exit reads |
| R3 | medium | submodules are checked out empty in a worktree | fixed: a gitlink under `launch.root` at the evaluated commit is refused with exit 12 naming it; test with a gitlink `libs/shared` |
| R4 | medium | `info/exclude`, `info/attributes` and `description` escaped the shared-state reading | fixed: the reading digests the whole common git directory except `objects`, `logs`, `worktrees`, `index`, `modules`, `lfs` and lock files, which every existing case confirms git's own worktree add and remove leave unchanged; test: a target appending to `info/exclude` exits 12 |
| R5 | low | a run that stopped after its legs left `probes.json` (with `rollbackVerified: true`) and a passing verdict | fixed: the project is read after the legs and before the CLI, and any stop after `probes.json` is written removes it; test: a seeded run whose `Judge alpha.` leg writes into the project exits 12 with no `probes.json`, no `preflight-verdict.json` and no `probes/` |
| R6 | low | a copy workspace refused a `TMPDIR` only inside `launch.root`, so one inside the repository failed every run as a tree change | fixed: the containment root is the repository top for every kind; test in the monorepo shape |
| T1 | medium | `armVerdict` reading `not-attempted` as held passed | fixed: `armVerdict` exported and unit-tested (an unsettled oracle is inconclusive, a violated one violated), and scripted cycles with an inconclusive baseline or mutated arm exit 11; an end-to-end `insufficient-evidence` oracle needs a quantifier over a declared collection the stub fixture does not have, so the unit carries it |
| T2 | medium | the schema validation and the qualification gate could be bypassed unnoticed | fixed: `admissionRefusal` extracted and unit-tested (a probe without `schemaVersion` fails the schema, a signature-less defect probe fails `signature-absent`), and end to end a seeded probe with no defect signature exits 10 |
| T3 | medium | constant `implementationDigest` and `commitDigest` passed | fixed: a worktree probe's `commitDigest` is asserted as the SHA-256 of the commit id, a copy's as its tree digest, and the implementation digest moves with `bin/verdict.js` and stays with `vendor/` |
| T4 | low | the stdin text branch was unasserted | fixed: the stub's echoed request is `Judge the request.` |
| T5 | low | moving the mutated verdict ahead of step 5 passed | fixed: a drifted restore beside a mutated arm that held exits 12 |
| T6 | low | a destructuring default evaded `rollback-literal` | fixed: two `AssignmentPattern` plants (`{ rollbackVerified = true }`, `{ rollbackVerified: verified = true }`) |
| T7 | low | two shared-repository and nesting cases asserted only the exit | fixed: messages and an empty temp directory asserted |
| H1 | high | the leg cache key ignored staging, so CI hits were the empty-directory observations | fixed: the cache path carries a staging name per suite (`fixture-set-v1`, `review-tree-v1`, `empty-v1`); the CI entries were deleted, the NFR entries kept only after checking each names its written report, and the others moved to their staging names; found on the way: test-design legs had the same gap (every cached observation says the workspace was empty), so test-design is staged through `eval-test-design.js` too and its empty entries deleted |
| H2 | medium | the NFR UNKNOWN witness matched the bare word | fixed in `tools/generate-probes.js`: `**Threshold:** UNKNOWN`; the corpus regenerated, and `test/probes/expected-strength.json` moved only in the NFR `corpusDigest` |
| H3 | medium | `--force` re-spawned shared requests and overwrote the evidence | fixed: a set of keys this port wrote; unit test: two forced legs of one request spawn once and keep the first answer |
| H4 | medium | nothing failed if NFR or CI staging were reverted | fixed: `test:probe-corpus` stages every trace, NFR, CI and test-design fixture set and asserts `<projectRoot>/`, `skill/` and the runner's artifact paths |
| H5 | — | the record called `nfr P-001`'s failure a measurement | corrected in Verification |
| C1 | — | the preflight header and the qualification JSDoc still described qualifying on the pristine workspace | fixed |
| CR1 | — | AD-8 said `targetArtifact` is repo-relative | valid: the runtime, `check` and the schema resolve it against `launch.root`; AD-8 is amended (dated), and the schema and the docs now say relative to `launch.root`, not the repository, when they differ |
| CR2 | — | the docs promised no write to adopter state | valid: the workspace section now says the runtime writes nothing into the tree and a target that writes outside its workspace (an absolute path, the shared git state) is detected afterwards and exits 12 |

### Final review round 1 revert checks

Each fix was undone once in the working tree, the named suite run, the failure observed, and the fix restored.

- R1, the path check made a no-op: "preflight with a mutated arm that links the target directory out of its workspace exited 0; expected 12".
- R3, the gitlink refusal disabled: "preflight over a project holding a submodule exited 0; expected 12 naming it" (the stub never reads the submodule, so the empty checkout passed unnoticed).
- R4, the shared-state digest left out: "preflight whose target wrote the shared info/exclude exited 0".
- R5, the probe list not removed: "a run stopped after its legs kept the probe list it handed the CLI".
- R6, the containment root back at `launch.root` for copies: "preflight of a copy workspace with TMPDIR inside the repository exited 12; expected 12 naming TMPDIR" (it exited 12 for the tree change, the misleading stop the finding describes).
- T1, an unsettled oracle read as held: "an arm with an unsettled oracle reads as held".
- T2, the schema validation made empty: "a qualified probe with no schemaVersion was admitted"; the gate forced open: "a defect probe with no signature passed the qualification gate" and "preflight with a seeded probe with no defect signature exited 0; expected 10".
- T3, a constant implementation digest: "the implementation digest did not move with bin/verdict.js".
- T4, the stdin text branch removed: "the arm sent stdin {"prompt":"Judge the request."}".
- T5, a drifted restore beside a mutated arm that held: covered by the new scripted case, which expects 12 where the old order gave 11.
- T6, the `AssignmentPattern` clause removed: both destructuring-default plants are missed.
- H3, `force` without the written set: "under force, a second leg sending one request spawned 2 time(s)".
- H4, NFR staging removed from `stagedWorkspaceFor`: `test:probe-corpus` reports "nfr gapped-harbor-billing-ledger: the staged workspace holds no harbor-billing-ledger/" and "no skill/".

## Final review round 2

Two reviewers (runtime by execution, tests and compliance) read head 9274413; each finding was verified against the code first.

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| S1 | high | an arm that swapped `launch.root` (or a directory above it) for a link bypassed round 1's path walk, which started at `launch.root`, so the restore could write into the adopter's tree | fixed: `planReplaceExact` requires the real directory holding the target to lie inside the real workspace directory and records it; the cycle checks the same real path before the mutation, before and after the restore and after every re-run (exit 12); test: a mutated arm that moves its working directory aside and links the project in its place, with an uncommitted project edit the restore would have overwritten, exits 12 with the project unchanged. The suggested pinning of each arm's `cwd` is not done: a `cwd` is a path string, and after a swap the cycle's next step is always one of these checks, so no arm of the cycle runs in a swapped directory; a pristine-workspace leg that swaps its root and writes is caught by the reading after the legs |
| S2 | medium | round 1's walk refused a committed in-project link on the target's path (`rules -> config/rules`) | fixed by S1's real-path containment, which follows a link that stays in the workspace; test: that project qualifies with exit 0 |
| S3 | low | an interrupting signal or an engine stage that could not run left `probes.json` | fixed: the probe list is removed in a `finally` unless the verdict stage completed, and `cleanUpOnSignal` removes it from a live list; test: a shim whose verdict stage exits an undocumented 2 gives exit 12 with no `probes.json` (the signal path shares the list with the workspace cleanup the interrupt case already holds) |
| S4 | low | round 1 refused a `TMPDIR` the repository ignores | fixed: inside the repository and outside `launch.root`, a temp directory is refused only when `git check-ignore` says it is not ignored; inside `launch.root` a copy is still refused; test: an ignored temp directory inside the repository runs with exit 0 and leaves nothing behind, beside round 1's refused one |
| S5 | medium | a clean arm that hard-linked the target to an adopter file made the runtime's mutation write reach that file | fixed: a regular file with more than one link is refused at plan time and before every write (exit 12), and the mutation and the restore each remove the file and write a new one; unit test: an arm that hard-links the target to a file outside the workspace stops the cycle with 12 and the outside file keeps its bytes |
| S6 | low | nothing failed if the staging segment left the cache path | fixed: `cacheDirectoryFor` is exported and `test:probe-corpus` asserts each set-staged suite's and test-review's cache path ends in a staging name of its own, distinct from the empty one; a digest of what is staged was not adopted, since staging a leg to learn its cache key would stage every cached leg |
| S7 | low | H2 was held only by the corpus digest | fixed: `test:contract-oracles` resolves the NFR UNKNOWN witness over a clean report naming the word in prose (false) and over a recorded `**Threshold:** UNKNOWN` (true) |
| S8 | low | the schema said the adopter's tree is never written | fixed with the suggested wording |

### Final review round 2 revert checks

- S1, the real-path comparison disabled: seven failures, "preflight with a mutated arm that links the target directory out of its workspace exited 0; expected 12" among them.
- S2, round 1's link refusal restored on the first path segment: "preflight whose targetArtifact sits behind an in-project link exited 12; expected 0".
- S3, the `finally` retraction removed: "a run whose verdict stage could not run kept its probe list" and "a run stopped after its legs kept the probe list it handed the CLI".
- S4, every temp directory in the repository treated as unignored: "preflight with a TMPDIR the repository ignores exited 12; expected 0".
- S5, the hard-link refusal removed: "a clean arm that hard-linked the target outside the workspace stopped with no error"; removing only the removal before each write passes, since the refusal stops the cycle first, so the two are layered defenses of one case.
- S6, the staging name dropped from the cache path: `test:probe-corpus` exits 1 naming each suite.
- S7, the witness back on the bare `UNKNOWN`: `test:contract-oracles` fails one check.

## Final review round 3

One bounded reviewer, by execution, at b9a3036; S1, the ancestor and workspace swaps, S5 during either arm, the FIFO variants, S3, S4 and the plan stories re-ran clean.

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| T1 | medium | the containment check and the write both went through path strings, and the command-line adapter leaves a target's surviving processes running, so a leftover process could swap the target's directory for a link between the check and the write; one of 30 runs of a racing stub had the runtime's own `rmSync` delete the adopter's `rules/policy.txt`, an uncommitted edit included | fixed: the plan records the real directory's device and inode, and every write and every step-5 read enters that directory, confirms its identity (exit 12 otherwise), and works on the target by its bare name (`rmSync`, then an exclusive `writeFileSync`), restoring the working directory in `finally`; a directory held as the working directory stays itself whatever happens to its path. Unit test: an `fs.rmSync` wrapper swaps the target's directory for a link to an outside directory on its first call; the cycle stops with 12 and the outside file keeps its bytes. The reference's rollback sentence now says what the code guarantees |

### Final review round 3 revert check

- T1, the write and reads back on the target's path (`work(planned.file)` in place of the bare name): "the runtime removed or rewrote the file outside the workspace the swapped link led to".

## Coordinator decisions after round 1

### Test-design baseline

The decision to re-record the test-design baseline from the live run rested on the baseline having been measured by agents in an empty directory; checking it showed it was not.
`test/probes/expected-strength.json` is one file two gates read: `npm run test:probe-corpus` (in `npm test`) regenerates every field from the stored replay under `test/replay/test-design/` and fails on any difference, and `eval:preflight` compares its live outcomes with the same fields.
The test-design replay port answers every leg, the manifestation leg included, with the stored correct run of its set, so its seeded witnesses never fire and each defect probe reduces to `failed: seeded-fault-fired` by construction.
Writing a live outcome into the file fails the deterministic gate: setting `test-design` P-008 to `passed` made `test:probe-corpus` report the file out of date.
So the baseline stays the replay's, and the live moves are recorded here as measurements, which is how the file's own `eval:preflight` contract treats a moved outcome.

| Probe | Baseline (replay) | Staged live | Why |
| --- | --- | --- | --- |
| P-008 | failed: seeded-fault-fired | passed | the witness fires on the live seeded run: its document registers `cross-tenant-data-leak`, which the seeded epic rules out |
| P-009 | failed: seeded-fault-fired | passed | the same for `browser-and-accessibility-regression` |
| P-010 | failed: seeded-fault-fired | passed | the same for `data-residency-compliance` |
| P-012 | failed: seeded-fault-fired | failed: seeded-faults-scoped | the witness fires on the clean `witness-design-level-minimal` leg |
| P-013 | failed: seeded-fault-fired | failed: seeded-faults-scoped | the same |
| P-014 | failed: seeded-fault-fired | failed: seeded-faults-scoped | the same |

The other ten test-design probes reduce to the baseline live.

Whether P-012 to P-014's witnesses are overbroad the way NFR's bare `UNKNOWN` was: they are document-global vocabulary readings (the epic marker and the negated oracle check), and the minimal clean document trips P-013 through prose alone.
A witness scoped to a structured field was tried against the cached live documents: a risk-register row (`| R-NNN |`) in the ruled-out risk's own category carrying its deciding vocabulary.
The stored `clean-over-reported` replay still matches it (R-002 DATA "corrupt the stored record", R-001 SEC "expose sensitive personal data to an unauthorized person", R-003 PERF "slow the home screen render and degrade startup latency"), and so do the clean staged legs: the minimal document's R-005 DATA row ("no order, queue entry or setting can be altered or lost") and R-007 PERF row ("render budget"), and the full document's R-006 PERF row ("render cost") and R-007 SEC row ("adds personal data").
The tightening therefore moves none of the three outcomes, and it would split the witness from the oracle it negates, which the generator keeps equal on purpose, so the witnesses are unchanged.
This is a contract weakness finding, measured and kept: the live `bmad-testarch-test-design` run registers risks its epic rules out as low-score rows ("Document", score 1 to 3), and oracles O-008 to O-010 and O-012 to O-014, which read vocabulary without regard to a row's score or its guard wording, cannot tell such a guard row from an invented risk. P-008 to P-010 passing live is the same behavior seen on the seeded set.
Closing it belongs to the test-design contract (a register reading that separates a scored risk from a documented guard, or a skill rule that leaves ruled-out categories out of the register), outside this story.

### `fragment-selection/bmad-testarch-ci` P-001 and P-002

Re-run live once with `--force`, which now runs each request once: 2 legs run and 6 from the cache, and both probes matched the baseline (exit 0, "every probe matched the outcome test/probes/expected-strength.json records").
The one moved sample was request `9ef586ea…`, which returned `{"fragments":[]}` at 20:31:22Z; the re-run of the same request returned `{"fragments":["ci-burn-in.md"]}`, the answer the suite's other leg gives, so the empty answer was sampling variance of the live agent.

### Documentation wording

The workspace section's two sentences that ended in a negation now say what the run does: a write outside the workspace "is detected afterwards, and the run exits 12", and for the shared git state "the run detects such a change afterwards and exits 12".

## Verification

**Commands:**

Final review round 1 (after the rebase onto ccde995 and the fixes):

- `npm test` -- exit 0 (`test:evaluate-mutation` 381 checks, `test:evaluate-boundaries` 296)
- `npm run test:release-metadata`, `npm run docs:validate-links`, `npm run docs:build` -- exit 0
- the Build Rules engine check -- exit 0
- after the coordinator decisions: `npm test` exit 0; `npm run docs:validate-links` and `npm run docs:build` exit 0; `eval:preflight` for `fragment-selection/bmad-testarch-ci` re-run live, matching the baseline
- `npm run eval:preflight` -- run live after the staging and cache fixes: 28 legs run, 162 answered from the cache, 4524 s in the model, exit 2 with eight preflight outcomes moved.
  NFR (P-001 to P-004 passed), CI (P-001 to P-003 failing `seeded-fault-fired` and `seeded-faults-scoped`, P-004 passed), trace, test-review, routing and every other fragment-selection suite reduce to `test/probes/expected-strength.json`.
  Six moves are test-design's, whose legs are staged for the first time: P-008 to P-010 now pass where the baseline recorded `seeded-fault-fired`, P-012 to P-014 fail `seeded-faults-scoped` where it recorded `seeded-fault-fired`, and the other ten reduce to the baseline; the baseline's test-design outcomes were measured by agents running in an empty directory, so re-recording them is the owner's call.
  Two moves are `fragment-selection/bmad-testarch-ci` P-001 and P-002, `input-sensitivity` resolving `insufficient-evidence`: one live witness leg (a request #236's rebase made new) returned `{"fragments":[]}`, a model sample in a suite whose staging this story did not change.

Build and review round:

- `npm test` -- exit 0, after the review round's fixes (81 checks; `test:evaluate-mutation` 321 checks)
- the Build Rules engine check -- exit 0 at the start and at the end; `git diff -- package.json package-lock.json` shows no `file:` or `.tgz` spec
- `npm run test:release-metadata`, `npm run docs:validate-links`, `npm run docs:build` -- exit 0
- `npm run eval:preflight` -- run once live through the local Claude Code CLI after the harness moved onto the runtime's `cachingPort` and `stageDirectories`: 35 legs run and 155 answered from the cache, about an hour in the model, exit 2 with eight preflight outcomes moved, every one in the NFR and CI suites (for example `nfr P-001: pre-flight failed: input-sensitivity, seeded-fault-fired, recorded passed`); the other suites matched the baseline.
  The cause was the unstaged NFR and CI legs (Implementation Notes).
  After the fix, a rerun of the NFR suite with `--force` staged every bundle and the witness legs wrote real assessments; its first probe, `nfr P-001`, then failed `seeded-faults-scoped` on one clean leg. Corrected in final review round 1 (H5): that was not a measurement of the contract. `--force` re-ran every leg whose request another probe also sends and overwrote the shared cache entry (H3), so the evidence the failing verdict was reduced from no longer existed, and the witness's bare `UNKNOWN` literal fired on a clean report that mentioned the word (H2). From the staged cache the NFR suite reduces to its baseline, P-001 to P-004 passed; the final round's live run is recorded below.

Planned:

- `npm test` -- exit 0
- `npm run test:release-metadata` -- exit 0
- `npm run docs:validate-links`, `npm run docs:build` -- exit 0
- the Build Rules engine check -- exit 0 at the start and at the end
- `npm run eval:preflight` -- run once, result recorded
