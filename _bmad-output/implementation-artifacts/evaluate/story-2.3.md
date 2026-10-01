---
title: 'Story 2.3: Render evaluation plans in bmad-testarch-ci'
type: 'feature'
created: '2026-10-01'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '1096cffa0546721c025367bdf3aad12e37d483c8'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 2.3, its Dependencies and Gate)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-2.md (the Story 2.3 section, R2-02)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-10, AD-11, AD-12)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-2.2.md (Implementation Notes, Design Notes)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** `bmad-testarch-ci` cannot see an evaluation. `ci/evaluation-ci-plan.json` (Story 2.2) says which check runs on which tier, and no pipeline file runs it, so an adopter's evaluation ends locally working and unenforced. Evaluate must not write workflow files itself (AD-11), and the CI skill's templates are rendered by the agent, so nothing deterministic can prove the rendering.

**Approach:** The CI skill gains a step, authored directly in the house shape, that detects `ci/evaluation-ci-plan.json` files and renders each with the platform templates: a job per tier the plan holds, one step per distinct check command, and an upload of `runs/` with `if: always()`. Create mode reaches the step through its step chain, edit mode through its assess and apply steps. The GitHub Actions template gains the evaluation block. `test:evaluate-ci-render` proves the reachability and parses the block. A new `evaluation-plan` case of the `ci` behavioral suite proves the rendering behaviorally: a fixture adopter carries a copy of the Story 1.10 fixture's plan, a live `npm run eval:ci` produces the workflow, and the capture is stored as a real replay.

## Boundaries & Constraints

**Always:**

- The plan's schema and placement rules stay where Story 2.2 put them (`cli/lib/evaluate/schemas/evaluation-ci-plan.schema.json`, `cli/lib/evaluate/ci-plan.js`). Skill prose points at them and copies neither: no tier table, no list of check ids with their defaults. A test may import them.
- The step reads tier membership from `placement.tier` and the command from `command`. It never moves, adds or drops a check and never edits the plan.
- A check's `command` is the argv a pipeline renders. `tea-evaluate ci --tier <tier>` runs every check of the tier, so checks that share one command render as one step whose name lists their ids; every distinct command renders as a standalone `run:` step. A merge job runs the `pr` tier's steps as well as its own, since a tier holds only the checks placed on it.
- Evidence: after the check steps, an upload of `<evaluation folder>/runs/` with `if: always()` (each invocation writes `runs/<invocationId>/`).
- No `continue-on-error` on an evaluation step: the runtime's exit is the verdict and `warn` enforcement is already exit 0 there.
- Re-rendering replaces what an earlier render wrote (each generated job carries a marker comment naming its plan) and removes jobs whose plan or tier is gone. Existing jobs the step did not write stay untouched.
- Every edit to the skill keeps `node tools/generate-contracts.js --check` and the `ci` suite replay green; sections the ground truth cites keep their headings and phrases.
- Wording rules: no em dash or spaced hyphen as a clause connector, no negation-then-correction sentences, in every file this story writes.

**Never:**

- Builder (`/bmad-workflow-builder`) Edit or Analyze on `bmad-testarch-ci` (AD-11: house shape, authored directly).
- Edits to the other four platform templates, the plan schema, `ci-plan.js`, `ci.js` or the `tea-evaluate` CLI.
- Re-accepting the Story 2.2 fixture baselines (Story 1.91 owns it), hand-rolled stale-lock or takeover logic, or a fabricated replay capture.
- Credentials wired into a rendered job: the plan carries none, so the step lists the live tiers' credential needs in its summary.

## I/O & Edge-Case Matrix

| Scenario                             | Input / State                                                   | Expected Output / Behavior                                                                                       | Error Handling           |
| ------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Create mode, plan present            | `evals/grader/ci/evaluation-ci-plan.json` with five `pr` checks | `evaluation-pr` job: one step for `check`, one for the four checks sharing `ci --tier pr`, upload `if: always()` | N/A                      |
| Edit mode, plan present              | existing pipeline file, one plan                                | assess detects the plan, apply renders it into the loaded pipeline                                               | N/A                      |
| No plan in the repository            | no `evaluation-ci-plan.json`                                    | `evaluation plans: none` recorded, pipeline unchanged                                                            | N/A                      |
| Plan refused by `tea-evaluate check` | exit 10 with `ci-plan` findings                                 | findings reported verbatim, plan not rendered                                                                    | other plans still render |
| Package files unreadable             | TeA not installed in the project                                | plan read as written, summary says it was not validated                                                          | N/A                      |
| Plan places checks on several tiers  | `pr` and `scheduled` checks                                     | a job per tier; the `scheduled` job runs on `schedule` and `workflow_dispatch` as the checks' `trigger` says     | N/A                      |
| Re-render                            | marker jobs already in the pipeline                             | those jobs replaced, jobs of vanished plans removed, unmarked jobs untouched                                     | N/A                      |
| Removed step                         | `step-03b-render-evaluation-plans.md` deleted or unreferenced   | `test:evaluate-ci-render` fails                                                                                  | exit 1                   |
| Template block removed               | no `evaluation-plan:begin` block                                | `test:evaluate-ci-render` fails                                                                                  | exit 1                   |
| Skill prose restates the AD-10 table | an id with its default tier written into the step               | `test:evaluate-ci-render` fails                                                                                  | exit 1                   |

</frozen-after-approval>

## Code Map

- `src/workflows/testarch/bmad-testarch-ci/steps-c/step-03-configure-quality-gates.md` -- `nextStepFile` moves from step 4 to the new step; lines 63-66 and 68 are cited by the ground truth, so only frontmatter line 4 changes.
- `src/workflows/testarch/bmad-testarch-ci/steps-c/step-03b-render-evaluation-plans.md` (new) -- detect, validate, render, re-render, save progress.
- `src/workflows/testarch/bmad-testarch-ci/steps-c/step-01b-resume.md` -- routing and dashboard gain the new step.
- `src/workflows/testarch/bmad-testarch-ci/steps-c/step-04-validate-and-summary.md`, `checklist.md`, `steps-v/step-01-validate.md` -- validation and summary cover rendered plans. Insert after the sections the ground truth cites, so cited line ranges hold.
- `src/workflows/testarch/bmad-testarch-ci/steps-e/step-01-assess.md`, `step-02-apply-edit.md` -- edit mode detects and renders.
- `src/workflows/testarch/bmad-testarch-ci/github-actions-template.yaml` -- the evaluation block, between `evaluation-plan:begin` and `evaluation-plan:end` marker comments in the extension section, each line carrying a comment prefix.
- `src/workflows/testarch/bmad-testarch-ci/SKILL.md`, `instructions.md` -- one sentence each naming plan rendering in create and edit mode.
- `cli/lib/evaluate/ci-plan.js` (`readPlan`, validation), `schemas/evaluation-ci-plan.schema.json` -- imported by the test, never copied.
- `test/test-evaluate-ci-render.js` (new, `test:evaluate-ci-render`) -- reachability graph over the step files, template block parse, the AD-10 non-restatement scan, fixture plan equals the source plan and the ground truth's command elements equal the plan's distinct `pr` commands.
- `test/eval-ci.js` -- artifact elements gain an optional `condition` the upload's `if` must contain; `validateCorpus` checks it. `test/test-eval-replay.js` -- no logic change expected (the scoring digest takes every parameter).
- `test/fixtures/ci-eval/evaluation-plan/` (new project), `test/fixtures/ci-eval/ground-truth.json` (set, citations), `test/replay/ci/evaluation-plan-*/` (live capture), `test/evals/suite-manifest.json` (`ci` suite `caseCount`, `fixtures`), regenerated `test/contracts/ci.contract.json`, `test/probes/ci.probes.json`, `expected-*` files.
- `package.json` (script, chain after `test:evaluate-ci`), `tools/test-shard-weights.json`, `README.md` chain count, `test/README.md`, `docs/how-to/workflows/setup-ci.md`, `CHANGELOG.md`, `sprint-status.yaml`, `epics.md` and `test-design-epic-2.md` (amendments), `ARCHITECTURE-SPINE.md` AD-11 (dated amendment).

## Tasks & Acceptance

**Execution:**

- [x] `steps-c/step-03b-render-evaluation-plans.md`, `step-03-configure-quality-gates.md`, `step-01b-resume.md`, `step-04-validate-and-summary.md`, `checklist.md`, `steps-v/step-01-validate.md`, `SKILL.md`, `instructions.md` -- the create-mode step and its routing -- AC 1, 2
- [x] `steps-e/step-01-assess.md`, `step-02-apply-edit.md` -- the edit-mode entry -- AC 1
- [x] `github-actions-template.yaml` -- the evaluation block -- AC 3
- [x] `test/test-evaluate-ci-render.js`, `package.json`, `tools/test-shard-weights.json`, `README.md` -- the deterministic render test, chained -- AC 1, 3, 4
- [x] `test/fixtures/ci-eval/evaluation-plan/`, `ground-truth.json`, `test/eval-ci.js` -- the `evaluation-plan` case -- AC 5
- [x] live `npm run eval:ci --set evaluation-plan-*`, `test/replay/ci/evaluation-plan-*`, `suite-manifest.json`, regenerated contracts and probes -- the real capture -- AC 5, 6
- [x] docs, `CHANGELOG.md`, `sprint-status.yaml`, amendments, story record -- AC 7

**Acceptance Criteria:**

- Given create mode and edit mode, when the entry steps are followed through their step references, then both reach the detection step, and deleting it or its references fails `test:evaluate-ci-render`.
- Given a repository with an evaluation plan, when the step runs, then each distinct `pr` command is its own standalone `run:` step in an `evaluation-pr` job and the plan's tier placement is read, never recomputed; skill prose points at the schema and `ci-plan.js` and restates no AD-10 table (revert: writing a check id with its default tier into the step fails the scan).
- Given the GitHub Actions template, when `test:evaluate-ci-render` parses the evaluation block as YAML, then it holds a per-check step pattern and an upload of the evaluation folder's `runs/` with `if: always()` (revert: removing the block, or dropping `if: always()`, fails).
- Given `npm test`, when the chain runs, then `test:evaluate-ci-render` is in it with a shard weight, and `test:ci-coverage`, `test:shards`, `test:doc-counts`, `test:contract-sources`, `test:probe-sources`, `test:eval-schemas`, `test:eval-replay` and `test:eval-ci-data` stay green.
- Given the `evaluation-plan` fixture adopter, when the live `eval:ci` run produces a workflow, then it parses, lints clean, lists each distinct `pr` command as a standalone `run:` step, uploads `runs/` under `if: always()`, adds nothing the request did not ask for, and the capture replays to the same score.
- Given the CI contract and suite, when the contract and probes are regenerated, then `generate-contracts.js --check`, `generate-probes.js --check` and the CI suite replay pass with the new set counted.
- Given the work is done, then the CHANGELOG entry, the sprint-status row (`review`), `epics.md` and `test-design-epic-2.md` amendments and this record agree with what shipped.

## Implementation Notes

- **The step.** `steps-c/step-03b-render-evaluation-plans.md` sits between the quality gates and the validation step. Step 3's `nextStepFile` points at it and it points at step 4; resume routing and the five-row dashboard follow. Placing the step as 03b leaves step 2's body untouched. Both step 2 and step 3 are `contextFiles` of the fragment-selection eval, so step 3's one-line frontmatter edit moved that contract's digest and its generated probes, and `node tools/generate-contracts.js` and `generate-probes.js` regenerated them. Edit mode loads the same file twice: `steps-e/step-01-assess.md` runs its sections 1 and 2 (detect, validate) and `step-02-apply-edit.md` runs 3 and 4 (render, re-render). Edit mode never writes the create run's checkpoint, takes the platform from the loaded file's path and renders only into a pipeline file.
- **Rendering rules.** A job per tier the plan holds, one standalone `run:` step per distinct argv (a `run: |` block, `npx`-led, shell-quoted, a newline or `${{` refuses the plan), a `merge` job that runs the `pr` commands first, `timeout-minutes` 30 or 120, event guards on jobs that existed before when a trigger adds an event, an `if: always()` upload of the evaluation folder's `runs/` named for the job, no `continue-on-error`, no invented credentials. A job is found again by its id prefix `evaluation-` and its `# tea-evaluation-plan:` comment; it is replaced when its plan still places checks on its tier, removed when the plan or tier is gone and reported stale when the plan is refused. The step reads the plan's rules from the TeA package (`cli/lib/evaluate/schemas/evaluation-ci-plan.schema.json`, `cli/lib/evaluate/ci-plan.js`) and restates no tier table.
- **The distinct-command rule amends the criterion.** The plan Story 2.2 committed gives five `pr` checks two commands: `check` has its own and the other four share `tea-evaluate ci --tier pr`, which runs every check of the tier. One step per check would run the tier four times, so a step is named for the checks that carry its argv. `epics.md`, `test-design-epic-2.md` and AD-11 carry the amendment.
- **The template block** sits in the extension section as commented YAML between `evaluation-plan:begin` and `evaluation-plan:end`, so the template stays a pipeline a project can start from and `test:evaluate-ci-render` parses the block after stripping the comment prefix.
- **`test:evaluate-ci-render`** (weight 0.4) holds the create chain (`nextStepFile` from step 1 reaches the step after the quality gates and before validation), the edit entries, the resume routing, the block parsed as YAML (a named run step holding one command, an upload under `always()` at `<folder>/runs/`, placeholders for job id, timeout and command), the non-restatement scan over every changed skill file (the check ids that are not ordinary words, taken from `DEFAULT_TIERS`), the plan equals the Story 1.10 fixture's with its evaluation folder moved, the ground truth's command elements equal the plan's distinct `pr` commands, and one real capture.
- **The `evaluation-plan` case.** `test/fixtures/ci-eval/evaluation-plan/` (project `quarry-grader`, set `evaluation-plan-quarry-grader`) carries `evals/grader/ci/evaluation-ci-plan.json`, a copy of the Story 1.10 fixture's plan at `test/fixtures/evaluate-mcp/evals/grader` with the folder moved to `evals/grader`, and a request that never names the plan. The set is a full-request set (`isMinimalRequest: false`): the contract generator now accepts more than one full set. The artifact element gains an optional `condition` (the upload's `if`, compared exactly after the `${{ }}` wrapper is removed) and the command element an optional `standaloneStep` (exactly one `run:` block invokes it and holds nothing else). `workflowRuleViolations` also flags `continue-on-error` on a `tea-evaluate` or `eval-quality-gates` step. `test/lib/probe-scoring.js` maps each project to its stored correct run (`CI_CORRECT_RUNS`), since two full sets cannot share one observation identifier. `test/probes/expected-strength.json` moved only in the ci corpus digests and in extra `passed-clean-control` rows.
- **Replay corpus.** `test/replay/ci/evaluation-plan-live-capture/` is the real capture; six constructed single deviations sit beside it (upload on failure only, upload negated, plan not detected, one step per check, `continue-on-error`, chained commands). Case results were derived by scoring the files and read against the intended deviation. The replay header counts in `test/test-eval-replay.js` and `test/README.md` were already stale (118 cases at the base commit against 124 files); they now read 127 cases, 122 scored, 107 constructed, 15 captured.
- **Live evidence.** `node test/eval-ci.js --agent claude --runs 2 --set evaluation-plan-quarry-grader` over the final skill: 8 of 8 requested elements, 0 unrequested, 0 lint findings, 0 rule violations, stable across both repetitions, every threshold met. The harness discards the workflow it scores, so the stored file is the same staging and prompt run once more by hand through `cli/ci-runner.js` and the local Claude Code CLI (a script kept outside the repository), byte for byte. Earlier runs against drafts of the step all scored 8 of 8.
- **Doc counts.** The `ci` suite now runs three projects, so one `eval:all` run makes 109 agent calls (327 for three runners): `README.md`, the adoption guide, the roadmap and the `doc-counts` pattern in `eval-quality.config.json` follow, and the two content-hash pins in that file follow the manifest.
- **Docs.** `docs/how-to/workflows/setup-ci.md` gains an Evaluation Plans section and the CLI reference links to it.

### Revert observations

Each AC check was undone once in a `/tmp` copy of the tree (node_modules linked) and observed:

| Mutation                                                                                                                            | Observed                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Delete `step-03b-render-evaluation-plans.md`                                                                                        | `test:evaluate-ci-render` exits 1: five checks fail (file, name, chain, both pointers) |
| Step 3's `nextStepFile` back to step 4                                                                                              | create chain does not reach the step                                                   |
| Drop `evaluationPlansStepFile` from the assess step, or the apply step's load sentence                                              | the edit-entry check fails for that file                                               |
| Resume routing sends the quality gates step to step 4                                                                               | resume check fails                                                                     |
| Remove the `evaluation-plan:begin` marker; `if: always()` to `failure()`; upload path off `runs/`; the command placeholder replaced | each fails its block check                                                             |
| Write `oracle-agreement` into the step; point the step away from the schema                                                         | the non-restatement scan and the pointer check fail                                    |
| Edit the fixture plan's folder; break its schema; change a ground-truth command or condition                                        | plan-equals-source, runtime schema, command-equality and condition checks fail         |
| Mark the capture `constructed`                                                                                                      | the one-real-capture check fails                                                       |
| Revert the `condition` scoring; substring match for the condition                                                                   | `test:eval-replay` reports a moved case                                                |
| Revert `standaloneStep` or its "holds more than the command" half                                                                   | two moved cases (duplicated, chained)                                                  |
| Revert the evaluation `continue-on-error` rule                                                                                      | one moved case                                                                         |
| Delete a stored workflow's upload `if`, or the shared `ci` step                                                                     | `test:eval-replay` moves that case                                                     |
| Restore the generator's `full.length === 1`                                                                                         | `generate-contracts.js --check` exits 1                                                |
| `caseCount` back to 2                                                                                                               | `test:eval-schemas` exits 1 (manifest declares 2, harness scores 3)                    |
| Delete the fixture plan                                                                                                             | `test:eval-ci-data` exits 1 (`projectFiles` names a file not on disk)                  |
| Rename the step's section 3 heading                                                                                                 | the ground truth's citation fails in `test:eval-ci-data`                               |
| Edit a skill file without regenerating                                                                                              | `generate-contracts.js --check` exits 1                                                |

The behavior half was observed live. With the story's skill removed (the baseline commit's skill in the staged workspace) the agent found the plan by itself and wrote five steps (four identical), bare `tea-evaluate` commands with no `npx`, and an upload under `${{ always() }}`: 2 of 8 requested elements missed, below the 0.9 recall threshold. With only step 3's reference removed and the step file still staged, the agent found the step anyway through `instructions.md` and `SKILL.md`, so that run is no revert. Removing the whole skill is the revert.

## Spec Change Log

- **2026-10-01, criterion amended:** each `pr` check as its own step became each distinct `pr` command as its own step, named for the checks that carry it, and the upload is the evaluation folder's `runs/` (which holds one `<invocationId>/` per invocation). Known-bad state avoided: the plan Story 2.2 committed gives four checks the one `tea-evaluate ci --tier pr` command, so one step per check runs the whole tier four times. KEEP: the plan is read as written, a check is never moved or dropped, the upload runs under `always()`.

## Review Triage Log

Three layers (blind hunter, edge-case hunter, verification-gap reviewer) ran over the diff before the live capture. Verdicts are mine.

| Finding                                                                                                | Verdict | Disposition                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `continue-on-error` on an evaluation step is not scored                                                | high    | patched: `workflowRuleViolations` flags it; replay case added                                                                               |
| "One step per command" is not distinguishable from duplicated or chained steps                         | high    | patched: `standaloneStep` on the command elements; duplicated and chained cases added                                                       |
| Edit mode writes the create run's checkpoint and flips a finished run to in-progress                   | high    | patched: section 5 is create mode only; section 1 holds in the conversation in edit mode                                                    |
| Edit mode has no source for platform, Node version or install                                          | medium  | patched: the platform from the loaded path, setup from the file's own jobs; resume reads them from the checkpoint                           |
| The edit target may be the progress checkpoint                                                         | medium  | patched: render only into a pipeline file                                                                                                   |
| Rendering triggers changes the other jobs                                                              | medium  | patched: event guards on earlier jobs, named in the summary; docs say so                                                                    |
| Argv escaping, `${{`, newline in an argument                                                           | medium  | patched: a block scalar for the command, POSIX quoting, a refusal rule                                                                      |
| Timeout fixed at 30 minutes                                                                            | medium  | patched: `TIMEOUT_MINUTES`, 30 or 120                                                                                                       |
| Package prerequisite never checked                                                                     | medium  | patched: devDependency read, install command in the summary                                                                                 |
| Artifact name collides for two plans; job id collides                                                  | medium  | patched: the job id carries the folder, the artifact is the job id plus `-runs`                                                             |
| `check` exit other than 10 (not installed, 64)                                                         | medium  | patched: only exit 10 refuses, any other failure renders with a not-validated note                                                          |
| Re-render deletes a working job on a refused plan; marker form per platform                            | medium  | patched: stale and reported; `//` in a Jenkinsfile                                                                                          |
| Condition matched by substring                                                                         | medium  | patched: exact after removing the wrapper; negated case added                                                                               |
| Merge ordering when argvs overlap                                                                      | low     | patched: `pr` commands first, then the `merge` commands the list lacks                                                                      |
| Schedule with no cron in a headless run; merge branch                                                  | low     | patched: the template's weekly cron and the repository's default branch                                                                     |
| Resume test crashes with no resume route; scan covered four files                                      | low     | patched                                                                                                                                     |
| CHANGELOG entry too long                                                                               | low     | patched: shortened                                                                                                                          |
| Replay header counts moved silently                                                                    | low     | patched here: the counts were already stale, now correct, recorded above                                                                    |
| Merge job runs `pr` steps against "never add a check"                                                  | false   | AD-10 and Story 2.2's notes define a merge trigger as the `pr` tier plus the `merge` tier; the commands are the plan's own                  |
| `check` is run again inside `ci --tier pr`                                                             | false   | the plan names each check's command, the runtime runs every check of a tier, and the double run belongs to the plan, which Story 2.4 writes |
| `merge`, `scheduled`, `release`, re-render and edit mode have no live case; other platforms unmeasured | high    | deferred to Story 1.93 (end of lane 3); other platforms stay outside the suite, which rejects them by design (actionlint)                   |
| Run finished before this change shows 4 of 5 and never detects a plan                                  | low     | skipped: `[E] Edit` picks the plans up, which is the path Evaluate's CI stage uses                                                          |
| `validateCorpus` branches for `condition` and `standaloneStep` run only on the committed corpus        | low     | skipped: the neighbouring `retentionDays` check has the same coverage                                                                       |

## Design Notes

Why 03b: step 2 is the pipeline's generation and a plan is a second input to the same file, so the render follows the quality gates and the validation step covers it. Why one step per distinct command: the runtime runs a tier as a unit (AD-10), so the pipeline's granularity is the command. Why the evaluation steps use a `run: |` block: the argv comes from a repository file, and a block scalar holds any quoted command without YAML escaping.

## Verification

**Commands:**

- `npm run test:evaluate-ci-render && npm run test:contract-sources && npm run test:probe-sources && npm run test:eval-schemas && npm run test:eval-replay && npm run test:eval-ci-data` -- expected: green
- `npm run test:doc-claim-sources && npm run test:evaluate-run && npm run test:doc-counts && npm run test:shards && npm run test:ci-coverage` -- expected: green
- `npm run format:check && npm run lint && npm run lint:md && npm run docs:validate-links` -- expected: green
