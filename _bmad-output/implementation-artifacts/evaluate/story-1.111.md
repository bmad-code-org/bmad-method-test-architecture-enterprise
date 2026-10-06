---
title: 'Story 1.111: Guide Stage 6 preflight by partition and refuse an unpartitioned plan preflight'
type: 'feature'
created: '2026-10-05'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '4dbc5945'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.111; Stories 1.51 and 1.84)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.111 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-9, AD-16, AD-18, AD-22)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.51.md (the partition plan and `preflight --partition`)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.84.md (the live sessions this story reruns)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.97.md (the record format)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** `SKILL.md` Stage 6 prescribes `tea-evaluate preflight --evaluation <evaluation-folder>` with no `--partition`, and the CLI accepts the flagless command.
Under a declared `partitionPlan` that command derives the both view and launches the held-out request while the gap loop is still open, so a worker that follows `SKILL.md` alone leaves the held-out request and its step ID in the run directory.
Story 1.51 corrected `references/adapters.md` and `references/run.md` and left `SKILL.md` alone, because both `capture-record.json` files pin its digest.

**Approach:** Stage 6 names `--partition development` in both command forms, says the flag is required only when `evaluation.json` declares a `partitionPlan`, and keeps the held-out preflight after the development review.
`adapters.md` and `run.md` say the same.
`tea-evaluate preflight` refuses a call with no `--partition` over an evaluation that declares a `partitionPlan`: exit 64, before `check` and before any workspace, naming the flag and both values.
`checkGuidance` holds the Stage 6 clauses as markers.
The `SKILL.md` edit changes the digest both capture records pin, so both live sessions (`tagged-release`, `nightly-deploy`) run again and each record is regenerated from its session's output.

## Boundaries & Constraints

**Always:** The skill edit goes through `/bmad-workflow-builder` Edit with a clean Analyze gate (AD-16, AD-18).
A folder with no `partitionPlan` preflights with no flag, with the exit code and every committed replay byte it had.
`preflight --partition held-out` and `--partition development` work as before.
`run` and `score` keep their flagless meaning, and the CI `preflight-live` check keeps the both view.
The refusal is a usage error (exit 64) and comes before `check`, so an evaluation that cannot be read still reports `check`'s findings.
Each session runs `claude -p` with `claude-sonnet-5-5` through the local Claude Code CLI with no API key, `acceptEdits` and the tools Read, Write, Edit, Glob, Grep and Bash, in a scratch copy under the scratchpad directory, with the prompt the committed record held, byte for byte.
The committed plan and the `evaluation.json` are the files each session wrote, copied by hand.

**Never:** an edit of `references/ci.md`, step 03b of `bmad-testarch-ci`, the plan template or a `--partition both` value; a plan or record typed by hand; two live sessions at the same time; a new story.

**Decisions (build worker, owner-delegated):** the Decisions list below carries each choice with its reason.

## I/O & Edge-Case Matrix

| Scenario                         | Input / State                                                      | Expected Output / Behavior                                                                                       | Error Handling                     |
| -------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Plan, no partition               | `preflight` over a `partitionPlan` with no `--partition`           | exit 64, the message names `--partition development` and `--partition held-out`, no launch, no `runs/` directory | the maintainer adds the flag       |
| Plan, no partition, working tree | the same with `--from-working-tree`                                | exit 64 as above                                                                                                 | n/a                                |
| Plan, named partition            | `--partition development`, `--partition held-out`                  | preflight as before                                                                                              | n/a                                |
| Plan, unknown partition          | `--partition both`, `--partition x`                                | exit 64, `unknown partition`, as before                                                                          | n/a                                |
| No plan, no partition            | `heldOutProbes` and no `partitionPlan`                             | exit 0, the folder's own `contract.json` bytes in the run                                                        | n/a                                |
| Unreadable `evaluation.json`     | not JSON, with no `--partition`                                    | exit 10 with `check`'s findings                                                                                  | the maintainer repairs the file    |
| Plan, `run` with no partition    | `run` over a `partitionPlan`                                       | runs both partitions, exit 0, as before                                                                          | n/a                                |
| CI `preflight-live`              | `ci --tier merge` over a `partitionPlan`                           | qualifies every partition, as before                                                                             | n/a                                |
| Guide edited, records old        | `SKILL.md` differs from the digest in `sessionRead`                | `test:evaluate-ci` fails with `SKILL.md changed since the live session read it`                                  | the maintainer reruns the sessions |
| Stage 6 clause removed           | the development flag, the flag rule or the held-out clause deleted | `test:evaluate-guidance` fails naming the clause                                                                 | n/a                                |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/partition.js`: `partitionRequired(partition, evaluation)`, the exit-64 refusal beside `unknownPartition`.
- `cli/lib/evaluate/preflight.js`: `runPreflightCommand` takes `requirePartition`, reads `evaluation.json` once for the refusal and the held-out probe list, and refuses before `selectPartition` and the pipeline.
- `cli/evaluate.js`: `preflightCommand` sets `requirePartition: true`; the `--partition` option text and the exit-code header say the new truth.
- `src/workflows/testarch/bmad-testarch-evaluate/SKILL.md` (Stage 6), `references/run.md` and `references/adapters.md`: the flag in the commands, the flag rule and the held-out clause.
- `test/test-evaluate-guidance.js`: the Stage 6 markers and four deletion cases, the `adapters.md` and `run.md` markers and the expected command sequence of `run.md`.
- `test/test-evaluate-partition-plans.js`: the refusal case (`plan-no-partition-preflight`) and the cases that reached the both view through a flagless `preflight`, which now reach it through a flagless `run`.
- `test/fixtures/evaluate-ci-repos/{tagged-release,nightly-deploy}/capture-record.json` and `evals/answer-grade/ci/evaluation-ci-plan.json`: regenerated from the two sessions; `evaluation.json` came back byte-identical to the committed file in both.
- `docs/reference/tea-evaluate-cli.md` (`## preflight`, the `preflight-live` sentence, the exit-64 row), `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `sprint-status.yaml` (row 1.111 `done`), this record.
- `cli/lib/evaluate/ci.js` (header comment), `cli/lib/evaluate/check.js` and `cli/lib/evaluate/schemas/evaluation-ci-plan.schema.json` (description text), `references/corpus.md` and the `kind` row of the plan field table: the claim that an evaluate check's argv runs by hand now excepts `preflight-live` under a `partitionPlan`, and the corpus guide names the held-out preflight or a run of both partitions.
- Not changed: `references/ci.md`, the plan template, step 03b, `run.js`, `score.js`.

## Tasks & Acceptance

- [x] Reproduce through the real CLI: a flagless `preflight` over the partition-plan fixture launches the held-out request.
- [x] The refusal in `partition.js`, `preflight.js` and `evaluate.js`.
- [x] The `SKILL.md` Edit through `/bmad-workflow-builder`, with `adapters.md` and `run.md` in the same session and a clean Analyze delta.
- [x] The guidance markers and deletion cases, the refusal case and the both-view cases moved to `run`.
- [x] Both live sessions, one at a time, and both records regenerated; `test:evaluate-ci` green.
- [x] The four revert checks on a scratch copy of the final tree.
- [x] Reference, CHANGELOG, planning amendments, `sprint-status.yaml`, this record.

**Acceptance Criteria:** as in `epics.md` Story 1.111, with the amendment dated 2026-10-05 there.

## Reproduction

Run first on the unchanged code, through the real CLI over the `partition-plan` fixture (`planProject` layout: a committed temp project with the fixture's held-out plan, the launch marker on), on this macOS host.
`tea-evaluate preflight --evaluation <folder>` with no `--partition` exits 0.
The target's marker file records 34 launches, 9 of them carrying the held-out request (the plan's canary), and 12 files under `runs/` hold the held-out step ID `held-out-run`.
The same call with `--partition development` exits 0 with 18 launches, none of them the held-out request, and no file of `runs/` holds the step ID.
After the change the flagless call exits 64 with no launch and no `runs/` directory, and the development call is unchanged.

## Decisions

1. **The refusal branch of the second criterion.**
   The epic offered a refusal or a recorded reason for keeping the command.
   The guide edit alone leaves the CLI accepting the command that launches the held-out request, and a CLI that cannot launch a held-out request during authoring holds where a guide sentence only advises.
   `epics.md` carries the amendment, and the paragraph about Lane 3 and the shared recapture with Story 1.84 is superseded since Story 1.84 merged first.
2. **The refusal belongs to the command line, through an option of the library function.**
   `runPreflightCommand` is also the function the CI `preflight-live` check calls.
   CI is no authoring step, qualifies every probe on the `merge` tier, and a `partitionPlan` must not turn that check into an exit 64.
   `requirePartition` defaults to false and `preflightCommand` in `cli/evaluate.js` sets it, so the command a worker types refuses and the CI check keeps the both view.
   The reference says so beside the `preflight-live` sentence.
3. **The refusal sits next to `unknownPartition` and has its shape.**
   `partitionRequired` returns `{ exitCode: 64, message }` and `runPreflightCommand` turns it into a `PreflightOutcome` of stage `check`, as `unknownPartition` is turned, so `runDriven` prints it as `tea-evaluate preflight: <message> (exit 64, <folder>)`.
   The message names `--partition development` and `--partition held-out` and gives the reason in a clause.
4. **The refusal comes after the unknown-partition check and before `check`.**
   A usage error needs no authoring pass.
   An `evaluation.json` that cannot be read leaves the refusal unreached, since the read sits in the `try` that already sends a malformed folder to the pipeline, so `check` reports it with exit 10 and the case holds that.
5. **`run` and `score` stay as they are.**
   A flagless `run` is a measurement run of both partitions (`run --partition` documents it), and `score` has no partition option.
   The test holds that a flagless `run` over the plan still launches the held-out request and exits 0.
6. **`--partition both` is not added.**
   The CLI offers `development` and `held-out`, and the both view stays reachable through a flagless `run` and through the CI `preflight-live` check.
7. **The cases that reached the both view through `preflight` reach it through `run`.**
   Ten sites of `test-evaluate-partition-plans.js` ran a flagless `preflight` to see the both view refuse a plan defect or compile a view.
   `run` runs `check` and the preflight pipeline first, so the same findings and compile exits show, and each site keeps its assertion.
   The one case that compiled the both view of a passing plan now runs a full `run`.
8. **Stage 6 shows the flag in both command forms and states when it is required.**
   The commands carry `--partition development`, the next sentences say the flag is required only when `evaluation.json` declares a `partitionPlan` (a preflight with no `--partition` over one exits 64), and the held-out preflight runs only after the development review.
   `run.md` already carried `--partition development` on its `run` command, and now carries it on `preflight` too, so the three files agree.
   An evaluation with no `partitionPlan` needs no flag, and the sentence says "required only when" in the shape the neighbouring paragraphs use.
9. **`adapters.md` and `run.md` were edited in the same builder session.**
   Neither is a `sessionRead` key of a capture record (`references/ci.md`, `SKILL.md` and the plan template are), so the live sessions did not need them final, and a grep of `src/`, `docs/` and `test/` for `preflight --evaluation` finds no other flagless Stage 6 command.
10. **The edit is gated twice.**
    The builder's Analyze ran as a delta (workflow-integrity, scripts and path-standards scans, `quick_validate`, one lens pass over the changed paragraph), recorded in the skill's gitignored `.memlog.md` as round 10: 0 critical, 0 high, 0 medium, 0 low new.
    The path-standards scan flags only `.memlog.md` itself (a process file at the skill root, gitignored); `SKILL.md` is 1982 tokens against the 2000 target.
    `test:evaluate-guidance` is the second gate and holds each clause.
    Round 1 of the review changed `references/corpus.md` through the builder again (the compile-defect sentence names the first held-out preflight or run of both partitions): the Analyze delta ran as round 11 in the same `.memlog.md`, workflow-integrity prepass 0 issues, scan-scripts 0, `quick_validate` ok, path-standards 0 in skill files (the 1 high is `.memlog.md` itself), one lens pass over the changed sentence, 0 critical, 0 high, 0 medium, 0 low new.
11. **No new story.**
    The sessions' plans and exits needed no repair, and nothing was found that this change leaves open.

## Implementation Notes

The refusal reads `evaluation.json` once.
`runPreflightCommand` already read it for `heldOutProbes`, so the same parsed object feeds `partitionRequired` and `selectPartition`, and a read that throws takes the existing fallback into the pipeline.
`partitionRequired` reads only `partitionPlan` and no byte of the held-out plan, so the message and the exit cost nothing in confidentiality.

## Revert observations

Each revert ran once on a scratch copy of the final tree under the scratchpad directory (a `git init`ed copy without the working tree's `.git`, with `node_modules` linked), with the named suite run until it stopped.

| Revert (the one edit)                                                                                                      | Suite run                       | Observed                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The sentence "Held-out preflight (`--partition held-out`) runs only after the development review." deleted from `SKILL.md` | `test:evaluate-guidance`        | exit 1, 1 failure: `SKILL.md Stage 6 partition lacks "Held-out preflight (`--partition held-out`) runs only after the development review."`                                                                                                                                                                                                                                                                                                 |
| The two old `capture-record.json` files (from the baseline commit) restored beside the edited `SKILL.md`                   | `test:evaluate-ci`              | exit 1 in `the plans of two repositories` (the 29 cases before it pass): `tagged-release: SKILL.md changed since the live session read it; run the session again` and `tagged-release: evals/answer-grade/ci/evaluation-ci-plan.json is not the file the live session wrote`                                                                                                                                                                |
| `requirePartition: true` deleted from `preflightCommand`, so the flagless preflight reaches the pipeline                   | `test:evaluate-partition-plans` | exit 1 at the refusal case, 1 failed case (the suite stops at the first failing assertion), and the first assertion to fail is the held-out scan of the run directory: `preflight left the held-out partition in a run directory`, followed by the `runs/<id>/contract.json` hits that hold the token `canary-9c41d7e2` and the step ID `held-out-run`, which names the step ID before the exit-64, launch-count and `runs/` assertions run |
| `partitionRequired` made to refuse every flagless preflight (the `partitionPlan` check deleted)                            | `test:evaluate-partition-plans` | exit 1 at the `plan-absent` case, the verdict fixture with `heldOutProbes` and no plan: `64 !== 0`, the refusal message in place of the preflight                                                                                                                                                                                                                                                                                           |
| The refusal moved after `checkEvaluation` in `runPreflightCommand` (a refusal that waits for `check` to find nothing)      | `test:evaluate-partition-plans` | exit 1 at the refusal case, 1 failed case: `a flagless preflight over a check finding must refuse first`, `10 !== 64`, the output holding the planted `contract.json: [engine-schema] /oracles/0/polarity` finding                                                                                                                                                                                                                          |
| The `--partition development` flag removed from the `node cli/evaluate.js preflight` example of `references/run.md`        | `test:evaluate-guidance`        | exit 1, 1 failure: `run.md partition plan preflight lacks "node cli/evaluate.js preflight --evaluation <evaluation-folder> --partition development"`                                                                                                                                                                                                                                                                                        |

The suites stop at the first failing assertion, so each row counts the case that failed first.

## Gates

Run one at a time on the final tree (after the review fixes), on a machine shared with the other lanes.
No full local `npm test`: the hook and CI carry the chain.

- `test:evaluate-partition-plans` (9m58s, with the refusal case, the CI `preflight-live` case and the reference assertion), `test:evaluate-guidance` (69s), `test:evaluate-ci` (307s, 36 cases, both regenerated records), `test:evaluate-ci-repositories` (seven tier scripts, 579s), `test:evaluate-ci-render` (534 checks) and `test:evaluate-preflight` (353 checks, 98s, which reads the reference and the preflight code): green.
- `test:eval-replay` (185 passed, 0 moved), `test:probe-corpus`, `test:doc-counts` (0 disagreements), `test:doc-claims` (0 disagreements), `test:shards` (183 checks), `test:ci-coverage` (133 chain steps), `test:changelog`, `test:release-metadata`, `test:bmad-output-gated` (153 checks), `docs:validate-links`, `lint`, `lint:md` (0 issues) and `format:check`: green.
- No npm script was added, so no shard weight changed.
- `git diff -- package.json package-lock.json` is empty.

## Live recapture

Both ran on this host (macOS) with Claude Code 2.1.289, one at a time, `claude -p "<prompt>" --model claude-sonnet-5-5 --allowedTools Read Write Edit Glob Grep Bash --permission-mode acceptEdits --output-format json` from the scratch repository, with no API key in the environment.
The prompt is the one the committed records held, byte for byte (Stage 12, the CI stage; it names no placement).
`permission_denials` is empty in both outputs.
Each scratch copy held the committed repository without `capture-record.json`, the plan, `runs/` and `baseline/`; the skill copied from the working tree with the Stage 6 edit; `_bmad/tea/config.yaml` with `tea_evaluations_folder: evals`; the CLI and the two packages linked into `evals/node_modules`; `tiers` reset to `["pr", "scheduled"]`; and one scored run (15 trial sets of 3 trials, `run` then `score`) with no baseline.
`references/ci.md`, the plan template, step 03b and the template were not edited by the recapture, and `git status` showed a clean tree before each session.

| Session          | Model               | Turns | Duration           | Outcome                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------- | ------------------- | ----- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tagged-release` | `claude-sonnet-5-5` | 17    | 325,558 ms (5m26s) | 11 checks: seven on `pr`, `preflight-live` on `merge`, `twin-run` and `held-out` (block) and `strength-comparison` (warn) on `release`; `tiers` `pr`, `merge`, `release`; `gates` set on the release `twin-run` as `["publish"]`; `tea-evaluate check` clean at the end; tier exits `pr`, `merge` and `release` all 0; no finding named in its output                       |
| `nightly-deploy` | `claude-sonnet-5-5` | 17    | 421,165 ms (7m01s) | 14 checks: seven on `pr`, `preflight-live` on `merge`, the three live checks on `scheduled` (all `warn`, `schedule` and `manual-dispatch`) and again on `release` (`release` and `manual-dispatch`); `tiers` `pr`, `merge`, `scheduled`, `release`; `gates` set on the release `twin-run` as `["production"]`; `tea-evaluate check` clean at the end; all four tier exits 0 |

The sessions never ran a Stage 6 preflight (the prompt starts at Stage 12), so the edit changed what they read and nothing they did.
Both plans keep the checks, tiers, enforcement, triggers and `gates` of the committed ones; only the `reason` lines are worded anew, and in the `nightly-deploy` plan the `gates` key moved ahead of the release `twin-run`'s `placement` object.
`evaluation.json` came back from both sessions byte-identical to the committed file.
Each session accepted the latest scored run as the baseline in its scratch copy and wrote an inspection record under `_bmad-output/test-artifacts/` there; neither is committed.
The records took `model`, `turns` and `durationMs` from the output JSON, `claudeCodeVersion` from `claude --version`, the digests from the files, and `repositoryRead` from `test/lib/evaluate-ci-repos.js`.
Both sessions ran after Story 1.98 and Story 1.42, so the records declare no `migrations` entry.
The generator was a scratchpad script and is not committed; `test:evaluate-ci` recomputes every digest.

## Build review

One fresh Opus subagent reviewed the diff read-only (the CLI change, every caller of `runPreflightCommand`, the changed cases of `test-evaluate-partition-plans.js` against the originals, the guide and reference wording against the code, the capture digests and the writing rules).
Every finding was checked against the code before it was acted on.

| Finding                                                                                                                                                                                                    | Verdict | Route                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Medium: the plan records `tea-evaluate preflight --evaluation <folder>` for `preflight-live`, which now exits 64 by hand under a plan, and the reference said the argv can be run by hand                  | valid   | Fixed: the `preflight-live` paragraph of the reference says `ci` runs the check by its id and the recorded argv exits 64 when typed under a `partitionPlan`; the template and `ci.md` stay as the story fixes them                                                                  |
| Medium: no case held that the CI `preflight-live` check still qualifies every partition, so defaulting `requirePartition` to true broke CI under every plan with no failing test                           | valid   | Fixed: the refusal case runs `ci --tier merge` over the plan project, asserts exit 0 and that the held-out request launched                                                                                                                                                         |
| Low: the `compiled` helper's comment and failure label still said preflight for the both view, which now runs through `run`                                                                                | valid   | Fixed: the comment names preflight and run and the label names the command                                                                                                                                                                                                          |
| Low: a `deepEqual` over the run directory could not fail, since the line before it asserted the directory absent                                                                                           | valid   | Fixed: the scan covers every file of the project's `runs/` paths and runs before the exit, launch-count and `runs/`-existence assertions, so it is the first assertion to fail, naming the file and the held-out token, when a preflight leaves a run directory holding the step ID |
| Low: the CHANGELOG said "keeps every run byte"                                                                                                                                                             | valid   | Fixed: "with the same exit code and committed replay bytes"                                                                                                                                                                                                                         |
| Low: the refusal message said "a command with no --partition launches the held-out request", and a flagless `run` also does                                                                                | valid   | Fixed: "a preflight with no --partition"                                                                                                                                                                                                                                            |
| Low: two comments started a second sentence partway through a line                                                                                                                                         | valid   | Fixed: one sentence per line                                                                                                                                                                                                                                                        |
| Low: the usage header of `cli/evaluate.js` listed `preflight` and `run` without `--partition`                                                                                                              | valid   | Fixed: both lines carry `[--partition <development\|held-out>]`                                                                                                                                                                                                                     |
| No finding in: the refusal's order against `check`, the unreadable-file fallback, every other caller, the changed cases' assertions, the deletion cases, every pinned digest, the guide and reference text | n/a     | n/a                                                                                                                                                                                                                                                                                 |

## Review round 1

Each round 1 finding was reproduced against the tree before the fix.

| Finding                                                                                                                                                                                                                                        | Verdict | Route                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gates section said `test:bmad-output-gated` (149 checks) while the rebased tree reported a higher count                                                                                                                                        | valid   | Fixed: every number of the Gates section was read again from a run on the final tree                                                                                                                                                                                                   |
| The reference (`preflight` section) and `references/corpus.md` said a compile defect surfaces "at the first held-out or both preflight", a command the CLI refuses under a `partitionPlan`; `check.js` carried the same phrase in a comment    | valid   | Fixed: "the first held-out preflight or run of both partitions" in the three places; `corpus.md` went through the builder with a clean Analyze delta; a grep of `src/`, `docs/`, `test/`, `cli/` and `README.md` for a flagless or both preflight told by hand found no other sentence |
| One sentence per line was broken in the reference where the `preflight-live` sentence and the `twin-run` text shared a line                                                                                                                    | valid   | Fixed: `twin-run` starts its own line; the rendering is the same                                                                                                                                                                                                                       |
| The held-out scan of the refusal case ran after the launch-count and `runs/` assertions, so it could not be the failing assertion                                                                                                              | valid   | Fixed: the scan runs first, with a message that names each hit; the revert check in Revert observations shows it failing first                                                                                                                                                         |
| The plan field table (`kind` row), the header comment of `ci.js` and the schema description of `kind` said the recorded argv of an `evaluate` check can be run by hand, and the `preflight-live` argv exits 64 by hand under a `partitionPlan` | valid   | Fixed: the argv runs by hand except `preflight-live` under a `partitionPlan`, which `ci` alone runs over every partition; `references/ci.md` and the plan template stay as the capture records pin them                                                                                |

## Review round 1b

Each finding was reproduced with a mutant before the fix.

| Finding                                                                                                                                                                                                                                                   | Verdict | Route                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The record and the CHANGELOG say the refusal comes before `check`, and no case held it: the refusal placed after `checkEvaluation` kept `test:evaluate-partition-plans` green                                                                             | valid   | Fixed: the refusal case plants a contract defect that `check` reports, runs a flagless `preflight`, and asserts exit 64, the refusal message and no `check` finding line in the output; the Revert observations show the mutant failing it |
| The TeA-package example `node cli/evaluate.js preflight --evaluation <evaluation-folder> --partition development` in `references/run.md` had no marker, so dropping its flag left a command that exits 64 under a plan and `test:evaluate-guidance` green | valid   | Fixed: the example is a marker of the `run.md partition plan preflight` list; the Revert observations show the mutant failing it                                                                                                           |
