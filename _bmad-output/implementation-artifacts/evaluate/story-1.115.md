---
title: "Story 1.115: Give the skill a command that prints a file's digest"
type: 'feature'
created: '2026-10-04'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'ecb46cd64c38916a572633bffe2815a97516aa77'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.115; Story 1.12; Story 1.67)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.115 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-5)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.112.md (the record format)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.85.md (the record format)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** Stage 2 (`references/intake.md`), Stage 4 (`SKILL.md` and `references/contract.md`) and `assets/README.md` tell the model to stamp `requirements.digest` and `sourceSpecDigest` with eval-quality's `digestBytes` over the confirmed `requirements.md` bytes.
Stage 4's guide gave no command, and Stage 2's gave a one-off inline `node --input-type=module -e` script.
The model otherwise computes a SHA-256 by hand or with its own script, and a wrong value is found only when `check` refuses the folder.
Story 1.46's Analyze run named this as the determinism lens's one high.

**Approach:** `tea-evaluate digest --evaluation <folder> --file <path>` prints `digestBytes` over the bytes of one file the folder holds and writes nothing.
It is an option of the existing `digest` subcommand, so AD-5's count of seven subcommands stays, as it did for `--calibration-inputs` (Story 1.67).
The path is relative to the evaluation folder and is refused (exit 64, one line on stderr, nothing on stdout) when it is absolute, has a `..` segment, passes through a symbolic link, names a directory or a file the folder does not hold, or is not a regular file.
`--file` with `--calibration-inputs` is a usage error.
The `intake.md` and `contract.md` guides and `assets/README.md` name the command where they say to stamp a digest, and `intake.md` drops its inline script.

## Boundaries & Constraints

**Always:** The printed value is `engine.digestBytes` over the file's bytes, loaded through `cli/lib/evaluate/engine.js`, and nothing else computes it.
The command writes nothing under the folder, `corpus-index.json` included, and prints only `sha256:<64 hex>` and a newline on stdout.
A refusal prints nothing on stdout.
The guides edit goes through `bmad-workflow-builder` Edit, with Analyze after it.
`SKILL.md`, `references/ci.md` and `assets/evaluation-ci-plan.template.json` stay as they are: the live capture records `test/fixtures/evaluate-ci-repos/*/capture-record.json` pin them.
The engine check runs at start and end.
No eval-quality change, no new dependency.

**Never:** a second path checker beside the one this story adds to `folder.js`, a new subcommand, a new npm script, a change to `digest` without `--file` or to `--calibration-inputs`.

**Decisions (build worker, owner-delegated):** the Decisions list below carries each choice with its reason.

## I/O & Edge-Case Matrix

| Scenario               | Input / State                                                                                                     | Expected Output / Behavior                                              | Error Handling |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------- |
| A file in the folder   | `--file requirements.md`, `./requirements.md`, `corpus/<nested file>`, an empty file                              | `sha256:` and 64 hex digits equal to `digestBytes` of the bytes, exit 0 | n/a            |
| One byte changes       | a space appended to `requirements.md`                                                                             | a different digest, the digest of the new bytes                         | n/a            |
| Writes                 | any successful or refused call                                                                                    | the folder is as it was; `corpus-index.json` is not written             | n/a            |
| Path leaves the folder | `../x`, `corpus/../requirements.md`, an absolute path (outside or inside the folder)                              | stdout empty, one stderr line naming the path and the reason            | exit 64        |
| Link                   | a link to a file in or outside the folder, a link to a directory used as a component                              | the same                                                                | exit 64        |
| Not a regular file     | a directory, the folder itself (`.`), a file the folder does not hold, a path below a file, a FIFO, an empty path | the same                                                                | exit 64        |
| Both options           | `--file` with `--calibration-inputs`                                                                              | stdout empty, stderr says they cannot be combined                       | exit 64        |
| No path, no folder     | `--file` with no value, or no `--evaluation`                                                                      | stdout empty                                                            | exit 64        |
| Guides                 | `intake.md`, `contract.md`, `assets/README.md`                                                                    | each names the command; `intake.md` has no inline script                | n/a            |
| Reference              | `docs/reference/tea-evaluate-cli.md`, section `## digest`                                                         | describes `--file`, what it prints and when it exits 64                 | n/a            |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/folder.js`: `readFolderFile(folder, relative)` walks the path one component at a time with `lstat`, refuses a link at any component, a directory, a missing entry and a non-regular file, and reads the bytes through `regularFileBytes` (`score-inputs.js`, an `O_NOFOLLOW | O_NONBLOCK` open and an `fstat`), so a FIFO swapped in after the walk is refused at once.
- `cli/evaluate.js`: `runFileDigest`, the `--file <path>` option of `digest`, the usage error for the combination, the header comment and the command description.
- `test/test-evaluate-check.js`: `checkDigestFile` and the two engine-absent cases added to `checkEngineAbsent`.
- `test/test-evaluate-guidance.js`: `checkDigestFileGuidance`, its marker in `checkIntake` (the old `From {tea_evaluations_folder}/<evaluationId>/` marker went with the script), and four corrupted-guide cases.
- `src/workflows/testarch/bmad-testarch-evaluate/references/intake.md`, `references/contract.md`, `assets/README.md`.
- `docs/reference/tea-evaluate-cli.md` (`## digest`), `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `sprint-status.yaml`, this record.
- Not changed: `SKILL.md`, `references/ci.md`, `assets/evaluation-ci-plan.template.json`, every `capture-record.json`, `package.json`, `package-lock.json`.

## Tasks & Acceptance

- [x] `folder.js`, `evaluate.js`: the option, the confined read and the combination error.
- [x] `test-evaluate-check.js`: `checkDigestFile`.
- [x] The three guides through `bmad-workflow-builder` Edit, Analyze after, and `checkDigestFileGuidance`.
- [x] Reference section, `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `sprint-status.yaml` (`review`), this record.

**Acceptance Criteria:** as in `epics.md` Story 1.115, with the amendment dated 2026-10-04 there (the path rules, the combination and the case names).

## Decisions

1. **`--file` with `--calibration-inputs` exits 64.**
   Each option makes `digest` read-only with its own output, and a call that asks for both has no single answer to print.
   It is a usage error through `UsageError`, raised before the folder resolves.
2. **The path is relative to the evaluation folder, and an absolute path is refused.**
   The folder is where the command's authority ends, so a path spelled from the process's working directory would make the answer depend on where the shell stands.
   An absolute path inside the folder is refused too: accepting it needs a second comparison of the spelling with the folder's real path, and the relative spelling is always available.
3. **The refusal lives in `folder.js` as `readFolderFile`, and it reuses `regularFileBytes`.**
   No helper existed that checks a link at every component of a path inside the folder: `corpus-index.js` refuses links by walking directory entries (`filesUnder`) and has no per-path form, `check.js` tests the single `requirements.md` path inline, and `recordsDirectory` resolves a directory.
   `folder.js` already owns "what counts as the evaluation folder", takes `fs` and `path` only, and its result shape (`{ ok, reason }`) matches `resolveEvaluationFolder`.
   The final read is `regularFileBytes` from `score-inputs.js`, the open every run-directory read already uses, so the story adds the component walk and no second reader.
4. **`.` and empty segments are skipped, `..` is refused anywhere.**
   `./requirements.md` is a natural spelling and stays inside.
   `corpus/../requirements.md` stays inside too, but its meaning depends on whether `corpus` is a link, so it is refused without resolving.
5. **A refusal is one stderr line, exit 64, and not a `UsageError`.**
   `UsageError` prints a second `Usage:` line; the story asks for a one-line reason, so `runFileDigest` writes the line itself and returns the usage code.
   The echoed path is JSON-quoted and escaped, as every other user-supplied text in the CLI's lines is.
6. **The folder resolves first, then the path, then the engine.**
   A refused path exits 64 whether or not the optional eval-quality peer is installed, and only a good path needs the engine (exit 12 when it is absent, as for every engine call).
7. **`intake.md` places `assets/evaluation.json` before the command.**
   The old script needed no `evaluation.json`; the command locates the folder through it, so the guide says to put the starter there first.
   The guide's other sentences that the command made obsolete went with the script: the self-comparison of the printed value with the manifest it was just copied into, and the remark about `digestArtifact`.
8. **`contract.md` names the TeA-development form.**
   The guide's compile and seal line already names `node cli/evaluate.js` beside `npm exec`; the stamp line gets the same one clause.
9. **`SKILL.md` stays untouched.**
   Its Stage 4 line and its resume line still say "eval-quality's `digestBytes` over the committed file".
   Stage 4 loads `references/contract.md` on the line before, which names the command, and `check` refuses a wrong stamp.
   `SKILL.md` is a `sessionRead` key of the live capture records, so an edit would invalidate them.
10. **`test:evaluate-check` runs its packed-install case in this build.**
    The case packs into a temporary directory and installs there; it writes nothing into the checkout.
11. **The docs section states the use.**
    The `## digest` reference says the printed value is the one for `requirements.digest` and `sourceSpecDigest`, and the case holds three phrases of it.

12. **`--file` does not serve `systemPromptDigest`.**
    The system prompt a target runs under lives in the target, outside the evaluation folder, and `--file` reads only what the folder holds, which is what makes its confinement checkable.
    A model-free target uses the empty-byte digest the schema requires, and `references/harness.md` already tells the model to compute any other digest with `digestBytes`.
    Reading a path outside the folder needs a second confinement rule and its own tests for a case this story's acceptance criteria do not name.

## Implementation Notes

- `readFolderFile` returns `{ ok: true, bytes }` or `{ ok: false, reason }`; the reason completes a sentence that starts with the spelled path.
- `runFileDigest` is the only caller, and `digest` without `--file` is unchanged: it still writes `corpus-index.json` and prints `corpusDigest`.
- The CLI case builds its folder from a copy of `test/fixtures/evaluate/valid`, removes `corpus-index.json` first and compares a link-aware listing of the folder (a link as itself, a file by digest) before and after, so a write of the index fails the case.
- The guidance case runs the command exactly as `intake.md` and `contract.md` spell it (the `npm exec` lead removed, the placeholders replaced with the valid fixture) through `cli/evaluate.js` and compares the output with `digestBytes`, so a flag that drifts from the CLI fails the gate.
- Linux: no container ran in this build; the case uses `mkfifo` and symbolic links only, and skips the FIFO on Windows.

## Revert observations

Each revert was applied once to a scratch copy of the final tree under the scratchpad directory, the named suite run and the copy restored.
The scratch copy ran `checkDigestFile` alone (76 checks, all green before each revert) for the first seven CLI rows, and `checkEngineAbsent` with `checkDigestFile` (87 checks) for the last two, which review round 1 added; the guide rows ran the whole `test:evaluate-guidance`.

| Revert (the one edit)                                                                             | Case run                 | Observed                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `digestBytes` over the path string (`digestBytes(Buffer.from(file))`)                             | `checkDigestFile`        | 5 of 76 fail: the file, the `./requirements.md` spelling through `evaluation.json`, the nested file, the empty file and the changed byte each print a digest that is not the digest of the bytes                                             |
| The link refusal removed from `readFolderFile`                                                    | `checkDigestFile`        | 4 of 76 fail: the four link paths still exit 64, because the `O_NOFOLLOW` open and the type check refuse them, but the reason on stderr is no longer the link refusal the case holds                                                         |
| The `..` refusal removed                                                                          | `checkDigestFile`        | 3 of 76 fail: `corpus/../requirements.md` exits 0 and prints a digest where 64 and the parent-segment line are expected; the other parent paths still miss a file or leave the folder, so they stay refused                                  |
| The directory refusal removed                                                                     | `checkDigestFile`        | 1 of 76 fails: `corpus` still exits 64 (the type check refuses it) with a reason that is not the directory refusal                                                                                                                           |
| Write the index (`writeCorpusIndex` called before printing)                                       | `checkDigestFile`        | 15 of 76 fail: the folder differs after the first call, and every refused call that gets that far leaves `corpus-index.json` behind                                                                                                          |
| Remove the option (`--file` deleted from the `digest` definition)                                 | `checkDigestFile`        | 25 of 76 fail: commander rejects `--file` (`unknown option`), so the successes exit 64, every refusal line is commander's, `--file` with `--calibration-inputs` and the bare form give no line of ours, and `digest --help` omits the option |
| Allow both options                                                                                | `checkDigestFile`        | 1 of 76 fails: `--file` with `--calibration-inputs` exits 0                                                                                                                                                                                  |
| The `..` refusal removed (round 1, with the outside file spelled so that it exists)               | `checkDigestFile`        | 6 of 87 fail: `corpus/../requirements.md` and `../../outside-<id>/secret.md`, a file that exists outside the folder, each exit 0 and print a digest where 64 and the parent-segment line are expected                                        |
| `runFileDigest` loads the engine before it reads the path (round 1)                               | `checkEngineAbsent`      | 1 of 87 fails: a refused path with eval-quality absent exits 12 where 64 is expected                                                                                                                                                         |
| `intake.md` without the sentence that puts `assets/evaluation.json` in the folder first (round 1) | `test:evaluate-guidance` | 1 failed check: `intake.md lacks` the sentence, and the gate's own corrupted-guide case for it                                                                                                                                               |
| `intake.md` without the command                                                                   | `test:evaluate-guidance` | exit 1, 1 failed check naming the digest command: `intake.md lacks` it                                                                                                                                                                       |
| `contract.md` without the command                                                                 | `test:evaluate-guidance` | exit 1, 1 failed check naming the digest command: `contract.md lacks` it                                                                                                                                                                     |
| `assets/README.md` without the command                                                            | `test:evaluate-guidance` | exit 1, 2 failed checks naming the digest command: the README lacks the sentence and names `digest --file` once where two lines each name it                                                                                                 |
| `intake.md` with an inline `node --input-type=module -e` script back                              | `test:evaluate-guidance` | exit 1, 1 failed check: `intake.md still computes the requirements digest with an inline script`                                                                                                                                             |

The gate's own corrupted-guide cases run inside every `test:evaluate-guidance` pass and report a failure if a corrupted guide passes `checkDigestFileGuidance`.

## Gates

Run one host-heavy gate at a time, on a machine shared with the other lanes.
No full local `npm test`: the hook and CI carry the chain.

Local, macOS, on the final tree:

- Engine check (`evaluateTarget` is a function) at the start and at the end: exit 0.
- `test:evaluate-check`: 1,228 checks green (the packed-install case packs into a temporary directory and installs there; it writes nothing into the checkout).
- `test:evaluate-guidance`: green, including the corrupted-guide cases of `checkDigestFileGuidance`.
- `npm run lint`, `npm run lint:md`, `npm run format:check`: green.
- `npm run docs:validate-links`: green.
- `test:cli`, `test:doc-counts`, `test:doc-claims`, `test:shards` (183), `test:ci-coverage`, `test:changelog`, `test:bmad-output-gated`, `test:release-metadata`, `test:evaluate-boundaries` (500), `test:direction`, `test:boundary`, `test:evaluate-dogfood`, `test:evaluate-authoring`, `test:evaluate-gap-loop`, `test:evaluate-ci`: green.
- `test:evaluate-evaluators --calibration-inputs-only` (the case that reads `digest`'s header and help): green after its expected header became `[--calibration-inputs | --file <path>]`.
- `npm run docs:build`: green.
- `git diff -- package.json package-lock.json` is empty.

Builder Analyze (five lenses, read only, run as subagents over the whole skill): 0 critical.
The determinism lens's high from Story 1.46 (a digest computed in the model's own words) is resolved: every place that stamps the requirements digest names the command, and the lens reports `check` as the backstop for `SKILL.md`'s two lines that still say `digestBytes`.
The one remaining high is `references/corpus.md` at 14,381 tokens against the 9,000-token single-purpose budget, reported by the architecture, enhancement and leanness lenses; Story 1.114 carves that guide, and this story does not touch it.
Findings on lines this story edited were taken: the self-comparison sentence, the `digestArtifact` remark and the exit-64 enumeration left `intake.md`, and `contract.md` gained the TeA-development form.
The lenses' findings on `SKILL.md` (its two digest lines) contradict the pinned live capture records and are skipped for that reason.
The medium determinism finding that `systemPromptDigest` has no command (`references/harness.md`) is answered by Decision 12.

## Build review

Round 0: one subagent reviews the commit read only, in place of `/bmad-code-review`.
Round 1: one subagent reviewed the commit read only, in three lenses (correctness and security, test quality, compliance), in place of `/bmad-code-review`.
Every finding was checked against the code before it was acted on.

| Finding                                                                                                                                       | Verdict           | Route                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Low: a directory above the file swapped for a link after the walk is followed by the final open, which refuses a link only at the file itself | valid, narrow     | The docstring says the open guards the file and the walk guards the directories above it. A `realpath` comparison afterwards would refuse a path spelled in another case on a case-insensitive file system with the wrong reason, so the walk stays the guard |
| Low: the race path reused the run directory's wording ("the run wrote")                                                                       | valid             | Fixed: `readFolderFile` maps the open's refusals to the link and regular-file reasons                                                                                                                                                                         |
| Medium (tests): `../<outside>/secret.md` named a file that did not exist, so no case proved a path outside the folder                         | valid, reproduced | Fixed: the outside file is spelled with `path.relative`, the case asserts it exists, and the `..` revert now fails 6 of 87                                                                                                                                    |
| Low-medium (tests): Decision 6 had no case                                                                                                    | valid             | Fixed: two `checkEngineAbsent` runs (a refused path exits 64, a good path exits 12), with the revert in the table                                                                                                                                             |
| Low (tests): the sentence that puts `assets/evaluation.json` in the folder first was not held                                                 | valid             | Fixed: a marker and a corrupted-guide case                                                                                                                                                                                                                    |
| Medium (compliance): a sentence handed a finding to the coordinator                                                                           | valid             | Fixed: Decision 12 gives the reason                                                                                                                                                                                                                           |
| Medium (compliance): the record held placeholders                                                                                             | valid             | Fixed: the Gates section holds the observed results                                                                                                                                                                                                           |
| Low (compliance): the reference called every refused absolute path "outside the folder"                                                       | valid             | Fixed: the sentence lists the cases as the CHANGELOG does                                                                                                                                                                                                     |
| Low (compliance): rewritten guide lines held several sentences                                                                                | valid             | Fixed: `intake.md` line 31, `contract.md` line 7 and the README bullet are one sentence per line; the guidance markers sit within single sentences                                                                                                            |
