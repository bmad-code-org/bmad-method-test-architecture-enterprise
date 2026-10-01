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
- `cli/lib/evaluate/ci-plan.js` (`readPlan`, validation), `schemas/evaluation-ci-plan.schema.json` -- imported by the test.
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
- Given a repository with an evaluation plan, when the step runs, then each distinct `pr` command is its own standalone `run:` step in an `evaluation-pr` job and the plan's tier placement is read from the plan; skill prose points at the schema and `ci-plan.js` and restates no AD-10 table (revert: writing a check id with its default tier into the step fails the scan).
- Given the GitHub Actions template, when `test:evaluate-ci-render` parses the evaluation block as YAML, then it holds a per-check step pattern and an upload of the evaluation folder's `runs/` with `if: always()` (revert: removing the block, or dropping `if: always()`, fails).
- Given `npm test`, when the chain runs, then `test:evaluate-ci-render` is in it with a shard weight, and `test:ci-coverage`, `test:shards`, `test:doc-counts`, `test:contract-sources`, `test:probe-sources`, `test:eval-schemas`, `test:eval-replay` and `test:eval-ci-data` stay green.
- Given the `evaluation-plan` fixture adopter, when the live `eval:ci` run produces a workflow, then it parses, lints clean, lists each distinct `pr` command as a standalone `run:` step, uploads `runs/` under `if: always()`, adds nothing the request did not ask for, and the capture replays to the same score.
- Given the CI contract and suite, when the contract and probes are regenerated, then `generate-contracts.js --check`, `generate-probes.js --check` and the CI suite replay pass with the new set counted.
- Given the work is done, then the CHANGELOG entry, the sprint-status row (`review`), `epics.md` and `test-design-epic-2.md` amendments and this record agree with what shipped.

## Implementation Notes

- **The step.** `steps-c/step-03b-render-evaluation-plans.md` sits between the quality gates and the validation step. Step 3's `nextStepFile` points at it and it points at step 4; resume routing and the five-row dashboard follow, and a checkpoint that predates the step shows it as not run with the `[E] Edit` hint. Placing the step as 03b leaves step 2's body untouched. Both step 2 and step 3 are `contextFiles` of the fragment-selection eval, so step 3's one-line frontmatter edit moved that contract's digest and its generated probes, and `node tools/generate-contracts.js` and `generate-probes.js` regenerated them. Edit mode loads the same file twice: `steps-e/step-01-assess.md` runs its sections 1 and 2 (detect, validate) and `step-02-apply-edit.md` runs 3 and 4 (render, re-render). Edit mode never writes the create run's checkpoint, takes the platform from the loaded file's path (`.yml` and `.yaml`) and renders only into a pipeline file.
- **Rendering rules (round 1).** A job per tier the plan places a check on, with one step: `npm exec --prefix <evaluations folder> -- tea-evaluate ci --evaluation <evaluation folder> --tier <tier>`, a `run: |` block named for every check on the tier. The evaluations folder is the directory that holds AD-20's private `package.json` (normally the parent of the evaluation folder) and is installed with `npm ci --prefix` when it holds a lockfile and `npm install --prefix` otherwise; the job runs no root install and no root-keyed cache. `ci --tier` takes no check selector (confirmed in `cli/evaluate.js`: `--evaluation` and `--tier` only), so it is the one entry that runs a tier. A `gate` check renders nothing, since `ci` runs it. The `merge` job runs the `pr` step then its own. Other rules: `timeout-minutes` 30 or 120, event guards on earlier jobs when a trigger adds an event, an `if: always()` upload of the evaluation folder's `runs/` named for the job id, no `continue-on-error` on a step or the job, no invented credentials, a refused plan only for findings about `ci/evaluation-ci-plan.json`, detection through `git ls-files --cached --others --exclude-standard`. A job is found again by the plan path in its `# tea-evaluation-plan:` marker, rewritten under the current id, and given a short digest of the plan path when its id collides. The step reads the plan's rules from the TeA package and restates no tier table.
- **Amendments.** Round 1 replaced the one-step-per-distinct-command reading with one step per tier; the Spec Change Log holds each amendment with its reason.
- **The template block** sits in the extension section as commented YAML between `evaluation-plan:begin` and `evaluation-plan:end`, so the template stays a pipeline a project can start from and `test:evaluate-ci-render` parses the block after stripping the comment prefix.
- **`test:evaluate-ci-render`** (weight 0.4) holds the create chain, the edit entries with their handover and anchored load instructions, the resume routing and dashboard hint, the block parsed as YAML (one `tea-evaluate ci` step through `npm exec --prefix`, an `--prefix` install, no root install or cache, no job or step `continue-on-error`, one upload at exactly `EVALUATION_FOLDER/runs/` under `always()` pinned to `@v4`), the non-restatement scan over every skill file but the knowledge fragments, the plan equals the Story 1.10 fixture's with its evaluation folder moved, the ground truth's elements equal what that plan renders to, the CI manifest lists exactly the files under each project root, the corpus validator refuses seven malformed elements, the scorer's reading of the step name, and one real capture.
- **The `evaluation-plan` case.** `test/fixtures/ci-eval/evaluation-plan/` (project `quarry-grader`, set `evaluation-plan-quarry-grader`) carries `evals/grader/ci/evaluation-ci-plan.json`, a copy of the Story 1.10 fixture's plan with the folder moved, the AD-20 `evals/package.json`, and a request that never names the plan. The set is a full-request set (`isMinimalRequest: false`): the contract generator accepts more than one full set. The ground truth gains the artifact `condition` (compared exactly after the `${{ }}` wrapper), the command `standaloneStep` and `checkIds`, and a `job` element (id, command and the marker comment read from the source). `workflowRuleViolations` also flags `continue-on-error` on a `tea-evaluate` step or on a job that runs one. `test/lib/probe-scoring.js` maps each project to its stored correct run (`CI_CORRECT_RUNS`), since two full sets cannot share one observation identifier. `test/probes/expected-strength.json` moved only in the ci corpus digests.
- **Replay corpus.** `test/replay/ci/evaluation-plan-live-capture/` is the real capture; thirteen constructed single deviations sit beside it. Case results were derived by scoring the files and read against the intended deviation. The replay header counts were already stale at the base commit, and the final tree holds 137 cases, 132 that produce a number, 117 of those constructed and 15 captured (12 ATDD, 2 test-review, 1 here); `test/README.md` and `test/test-eval-replay.js` carry them.
- **Live evidence (round 1).** `node test/eval-ci.js --agent claude --runs 2 --set evaluation-plan-quarry-grader` over the final skill and fixture: 9 of 9 requested elements, 0 unrequested, 0 lint findings, 0 rule violations, stable across both repetitions, every threshold met. The harness discards the workflow it scores, so the stored file is the same staging and prompt run once more by hand through `cli/ci-runner.js` and the local Claude Code CLI (a script kept outside the repository), byte for byte, and it scored 9 of 9. With the story's skill removed (the baseline commit's skill staged) the agent found the plan by itself and wrote five identical steps, bare `tea-evaluate` commands and an upload under `${{ always() }}`, 2 of 8 elements missed under the first ground truth, below the 0.9 recall threshold. Removing only step 3's reference leaves the step staged, and the agent found it through `instructions.md`, so that run is no revert.
- **Doc counts.** The `ci` suite now runs three projects, so one `eval:all` run makes 109 agent calls (327 for three runners): `README.md`, the adoption guide, the roadmap and the `doc-counts` pattern in `eval-quality.config.json` follow, and the two content-hash pins in that file follow the manifest.
- **Docs.** `docs/how-to/workflows/setup-ci.md` gains an Evaluation Plans section, the CLI reference links to it, and `docs/reference/commands.md` lists the plan input and the job output.

### Revert observations

Each AC check was undone once in a `/tmp` copy of the tree (node_modules linked) and observed. Round 0 (first push):

| Mutation                                                                               | Observed                                                 |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Delete `step-03b-render-evaluation-plans.md`                                           | `test:evaluate-ci-render` exits 1: five checks fail      |
| Step 3's `nextStepFile` back to step 4                                                 | create chain does not reach the step                     |
| Drop `evaluationPlansStepFile` from the assess step, or the apply step's load sentence | the edit-entry check fails for that file                 |
| Resume routing sends the quality gates step to step 4                                  | resume check fails                                       |
| Remove the `evaluation-plan:begin` marker                                              | block check fails                                        |
| Write `oracle-agreement` into the step; point the step away from the schema            | the non-restatement scan and the pointer check fail      |
| Edit the fixture plan's folder; break its schema                                       | plan-equals-source and runtime-schema checks fail        |
| Mark the capture `constructed`                                                         | the one-real-capture check fails                         |
| Revert the `condition` scoring; substring match for the condition                      | `test:eval-replay` reports a moved case                  |
| Restore the generator's `full.length === 1`                                            | `generate-contracts.js --check` exits 1                  |
| `caseCount` back to 2                                                                  | `test:eval-schemas` exits 1                              |
| Delete the fixture plan                                                                | `test:eval-ci-data` exits 1                              |
| Rename the step's section 3 heading                                                    | the ground truth's citation fails in `test:eval-ci-data` |
| Edit a skill file without regenerating                                                 | `generate-contracts.js --check` exits 1                  |

Round 1 (mutant, case, result):

| Mutant                                                                                               | Case                     | Result                                            |
| ---------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------- |
| Template upload path `runs/`                                                                         | block check, B1          | `test:evaluate-ci-render` exits 1                 |
| `continue-on-error` on the template job                                                              | block check, B2          | exits 1                                           |
| `if: always()` on the tier step                                                                      | block check, B8          | exits 1                                           |
| Upload pinned to `@v3`; a second `tea-evaluate` step                                                 | block check, B8          | exits 1 each                                      |
| Root `npm ci` instead of the `--prefix` install; a root-keyed cache                                  | block check, A1          | exits 1 each                                      |
| Assess step hands over to step 4                                                                     | edit entry, B4           | exits 1                                           |
| `Never load ...` in the assess step; `never run ...` in the apply step                               | anchored instruction, B4 | exits 1 each                                      |
| `held-out` in step 3; `oracle-agreement` in the Jenkins template                                     | whole-skill scan, B5     | exits 1 each                                      |
| Never-copy sentence removed                                                                          | B5                       | exits 1                                           |
| `evals/package.json` dropped from the manifest                                                       | manifest check, B11      | exits 1                                           |
| Each corpus guard removed (`condition` with `onFailureOnly`, `standaloneStep` type, `retentionDays`) | corpus guards, B7        | exits 1 each                                      |
| `checkIds` scoring removed                                                                           | step naming, B3          | exits 1                                           |
| Job-level `continue-on-error` scoring removed                                                        | replay case, B2          | `test:eval-replay` moves 1 case                   |
| Job marker check removed; job command check removed                                                  | replay cases, B9         | moves 1 and 2 cases                               |
| Ground-truth upload token back to `runs/`                                                            | replay, B1               | moves 13 cases (the scoring digest)               |
| `standaloneStep` scoring removed                                                                     | replay, A2               | moves 3 cases (duplicates, chained, root install) |
| Resume dashboard hint removed                                                                        | resume check, C3         | exits 1                                           |

## Spec Change Log

- **2026-10-01, criterion amended (first push):** each `pr` check as its own step became each distinct `pr` command as its own step, and the upload became the evaluation folder's `runs/`. Reason: the plan Story 2.2 committed gives four checks one `tea-evaluate ci --tier pr` command, so one step per check ran the tier four times. Superseded below.
- **2026-10-01, round 1, one step per tier:** each distinct command became one `tea-evaluate ci --tier <tier>` step per job, named for every check on the tier, after an `--prefix` install, with no `npx` and no root install. Reason: `ci --tier` is the runtime's one entry that runs a tier and writes its evidence bundle and takes no check selector, so a step per distinct command ran checks twice, spent a live preflight twice and let a failing early step stop the job before the bundle existed; AD-20 keeps the tooling in the evaluations folder's private `package.json`, and `npx tea-evaluate` fetches an unclaimed registry name. KEEP: the plan's `placement.tier` is read from the plan, the upload runs under `always()`, the step reads the runtime's schema.
- **2026-10-01, fixture folder moved to `evals/grader`:** the Story 1.10 plan names `test/fixtures/evaluate-mcp/evals/grader`, which a copied adopter project cannot hold. Reason: the harness stages one project root, and the render test holds the copy equal to the source with that one string replaced. Round 1 added `evals/package.json` beside it because AD-20 puts the manifest one level above the evaluation folder.
- **2026-10-01, CI contract generator accepts several full-request sets:** the contract roles were one full and one minimal. Reason: the new project is a second full request, and the roles read `isMinimalRequest` only.
- **2026-10-01, artifact `condition`, command `standaloneStep` and `checkIds`, `job` elements:** each element reads one property the story claims. Reason: the review's mutants showed a looser element (a substring condition, a presence-only command, a bare `runs/` token) let the deviation pass.

## Review Triage Log

Three layers (blind hunter, edge-case hunter, verification-gap reviewer) ran over the diff before the first push. Verdicts are mine.

| Finding                                                                                                | Verdict                                    | Disposition                                                                                               |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `continue-on-error` on an evaluation step is not scored                                                | high                                       | patched: `workflowRuleViolations` flags it; replay case added                                             |
| "One step per command" is not distinguishable from duplicated or chained steps                         | high                                       | patched: `standaloneStep` on the command elements; duplicated and chained cases added                     |
| Edit mode writes the create run's checkpoint and flips a finished run to in-progress                   | high                                       | patched: section 5 is create mode only; section 1 holds in the conversation in edit mode                  |
| Edit mode has no source for platform, Node version or install                                          | medium                                     | patched                                                                                                   |
| Edit target may be the progress checkpoint                                                             | medium                                     | patched: render only into a pipeline file                                                                 |
| Rendering triggers changes the other jobs                                                              | medium                                     | patched: event guards on earlier jobs, named in the summary                                               |
| Argv escaping, `${{`, newline in an argument                                                           | medium                                     | patched: a block scalar for the command, POSIX quoting, a refusal rule                                    |
| Timeout fixed at 30 minutes                                                                            | medium                                     | patched: `TIMEOUT_MINUTES`, 30 or 120                                                                     |
| Package prerequisite never checked                                                                     | medium                                     | superseded in round 1 (A1): the evaluations folder's `package.json` is read                               |
| Artifact name collides for two plans; job id collides                                                  | medium                                     | patched, then reworked in round 1 (A5)                                                                    |
| `check` exit other than 10                                                                             | medium                                     | patched, then narrowed in round 1 (A3)                                                                    |
| Re-render deletes a working job on a refused plan                                                      | medium                                     | patched: stale and reported                                                                               |
| Condition matched by substring                                                                         | medium                                     | patched: exact after removing the wrapper                                                                 |
| Merge ordering when argvs overlap                                                                      | low                                        | superseded in round 1 (one step per tier)                                                                 |
| Schedule with no cron in a headless run; merge branch                                                  | low                                        | patched                                                                                                   |
| Resume test crashes with no resume route; scan covered four files                                      | low                                        | patched, widened in round 1 (B5)                                                                          |
| Merge job runs `pr` steps against "never add a check"                                                  | false                                      | AD-10 and Story 2.2's notes define a merge trigger as the `pr` tier plus the `merge` tier                 |
| `check` is run again inside `ci --tier pr`                                                             | maybe-false at first push, high in round 1 | round 1 (A2) removed the standalone `check` step                                                          |
| `merge`, `scheduled`, `release`, re-render and edit mode have no live case; other platforms unmeasured | high                                       | deferred to Story 1.93; other platforms stay outside the suite, which rejects them by design (actionlint) |
| `validateCorpus` branches for `condition` and `standaloneStep` run only on the committed corpus        | low                                        | skipped at first push; fixed in round 1 (B7, C3b)                                                         |

### Round 1 fixes (PR #287, by finding id)

- **A1:** the evaluation job installs the evaluations folder with `npm ci --prefix` (or `npm install --prefix` without a lockfile) and runs `npm exec --prefix <folder> -- tea-evaluate ...`; no root install, no root-keyed cache, no root devDependency advice in the step or the how-to. AD-20 and `references/corpus.md` give the folder: the directory that holds the private `package.json`. The fixture gained `evals/package.json`; the ground truth, scorer, template, docs and live capture follow.
- **A2:** one `tea-evaluate ci --tier` step per job, named for the tier's checks; `merge` runs `pr` then `merge`; a `gate` renders nothing. `ci` takes no check selector, so none was invented. The criterion is amended (Spec Change Log) in `epics.md`, `test-design-epic-2.md`, AD-11, this record and the docs.
- **A3:** only findings about `ci/evaluation-ci-plan.json` refuse a plan. **A4:** detection uses `git ls-files --cached --others --exclude-standard`. **A5:** earlier jobs are matched by the plan path in the marker and rewritten under the current id, with a plan-path digest on a collision. **A6:** `.yml` and `.yaml`.
- **B1:** the ground-truth token is `evals/grader/runs/`, the render test asserts the exact block path, and the replay holds `evaluation-plan-upload-wrong-path`. **B2:** job-level `continue-on-error` is a rule violation, the render test asserts its absence, and the replay holds `evaluation-plan-job-continue-on-error`. **B3:** `checkIds` scoring, held by the render test's naming case (a replay case would sign like the duplicate case). **B4:** the assess handover and anchored load instructions. **B5:** the scan covers every skill file but the knowledge fragments and the never-copy sentence is asserted. **B7:** seven corpus-guard cases in the render test, a passing `${{ always() }}` replay, and the `eval-quality-gates` alternative removed from `EVALUATION_INVOCATION`. **B8:** exactly one step runs `tea-evaluate`, no `if` on it, the upload pinned to `@v4`. **B9:** a `job` element reads the job id, its command and the marker comment. **B11:** the manifest equals the files under each project root. **B12:** the failure messages describe the defect.
- **B6:** appended as Story 1.94 (the CI probe leg holds every oracle `held`), with its `epics.md` and `test-design-epic-1.md` sections, dependency row, `backlog` row and lane 3 entry, and the story counts (eighty-two).
- **C1:** counts recounted from the tree. **C2:** one Spec Change Log entry per amendment and dated notes in `epics.md` and `test-design-epic-2.md`. **C3:** the resume dashboard hint and the negative corpus cases. **C4:** the progress example gains step 3b. **C5:** `ci-enforcement-policy.md` reads as AD-11 does. **C6, C7:** the CLI reference and `commands.md`. **C8:** the three wording fixes and a sweep of every added line. **C9:** the Verification section below.
- **B10 skipped:** step prose held by substring citations stays; the citations name a section and a phrase, and the phrases are the rules the corpus rests on.

## Design Notes

Why 03b: step 2 is the pipeline's generation and a plan is a second input to the same file, so the render follows the quality gates and the validation step covers it. Why one step per tier: the runtime runs a tier as a unit and writes one evidence bundle per invocation (AD-10, AD-12), so the pipeline's granularity is the tier. Why the evaluation steps use a `run: |` block: the paths come from a repository file, and a block scalar holds any quoted command without YAML escaping. Why the tooling is installed with `--prefix`: AD-20 keeps the private `package.json` out of the adopter's root manifest.

## Verification

Observed after the round 1 changes (local, final tree; CI runs the full chain):

- `npm run test:evaluate-ci-render`: 119 checks passed.
- `node test/eval-ci.js --validate-only` (`test:eval-ci-data`): corpus valid, 3 projects.
- `npm run test:eval-replay`: 164 passed, 0 moved.
- `npm run test:eval-schemas`, `test:suite-manifest`: green (`caseCount` 3, fixtures equal the files under each root).
- `node tools/generate-contracts.js --check` (`test:contract-sources`): 16 contracts match their sources. `node tools/generate-probes.js --check` (`test:probe-sources`): 15 probe corpus files match. `test:probe-corpus`: every probe scored and every artifact matched its published schema.
- `npm run test:doc-claim-sources`, `test:doc-counts` (0 disagreements), `test:doc-claims` (0 disagreements), `test:shards` (117 checks), `test:ci-coverage` (107 chain steps, all run in CI): green.
- `npm run test:evaluate-run`: 571 checks passed.
- `npm run format:check`, `lint`, `lint:md` (0 issues), `docs:validate-links` (all links valid): green.
- Live: `node test/eval-ci.js --agent claude --runs 2 --set evaluation-plan-quarry-grader`: 9 of 9 requested elements, stable, every threshold met.
- Not run locally: the full `npm test` chain, left to CI as the owner instructed.
