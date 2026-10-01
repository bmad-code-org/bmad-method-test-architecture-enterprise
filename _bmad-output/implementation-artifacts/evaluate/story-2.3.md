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

**Approach:** The CI skill gains a step, authored directly in the house shape, that detects `ci/evaluation-ci-plan.json` files and renders each with the platform templates: a job per tier the plan holds, one `tea-evaluate ci --tier <tier>` step per tier named for the tier's checks, and an upload of the evaluation folder's `runs/` with `if: always()`. Create mode reaches the step through its step chain, edit mode through its assess and apply steps. The GitHub Actions template gains the evaluation block. `test:evaluate-ci-render` proves the reachability and parses the block. A new `evaluation-plan` case of the `ci` behavioral suite proves the rendering behaviorally: a fixture adopter carries a copy of the Story 1.10 fixture's plan, a live `npm run eval:ci` produces the workflow, and the capture is stored as a real replay.

## Boundaries & Constraints

**Always:**

- The plan's schema and placement rules stay where Story 2.2 put them (`cli/lib/evaluate/schemas/evaluation-ci-plan.schema.json`, `cli/lib/evaluate/ci-plan.js`). Skill prose points at them and copies neither: no tier table, no list of check ids with their defaults. A test may import them.
- The step reads tier membership from `placement.tier` and the command from `command`. It never moves, adds or drops a check and never edits the plan.
- A tier renders as one standalone step, `tea-evaluate ci --tier <tier>`, which runs every check of the tier, named for the tier's checks. A merge job runs the `pr` tier's step first and its own second, since a tier holds only the checks placed on it.
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
- `test/test-evaluate-ci-render.js` (new, `test:evaluate-ci-render`) -- reachability graph over the step files, template block parse, the AD-10 non-restatement scan, fixture plan equals the source plan and the ground truth's elements equal what the plan renders to.
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
- Given a repository with an evaluation plan, when the step runs, then the `pr` tier is one `tea-evaluate ci --tier pr` step, named for the tier's checks, in an `evaluation-pr` job and the plan's tier placement is read from the plan; skill prose points at the schema and `ci-plan.js` and restates no AD-10 table (revert: writing a check id with its default tier into the step fails the scan).
- Given the GitHub Actions template, when `test:evaluate-ci-render` parses the evaluation block as YAML, then it holds the one-step-per-tier pattern and an upload of the evaluation folder's `runs/` with `if: always()` (revert: removing the block, or dropping `if: always()`, fails).
- Given `npm test`, when the chain runs, then `test:evaluate-ci-render` is in it with a shard weight, and `test:ci-coverage`, `test:shards`, `test:doc-counts`, `test:contract-sources`, `test:probe-sources`, `test:eval-schemas`, `test:eval-replay` and `test:eval-ci-data` stay green.
- Given the `evaluation-plan` fixture adopter, when the live `eval:ci` run produces a workflow, then it parses, lints clean, lists the install and the tier step as standalone `run:` steps, uploads `runs/` under `if: always()`, adds nothing the request did not ask for, and the capture replays to the same score.
- Given the CI contract and suite, when the contract and probes are regenerated, then `generate-contracts.js --check`, `generate-probes.js --check` and the CI suite replay pass with the new set counted.
- Given the work is done, then the CHANGELOG entry, the sprint-status row (`review`), `epics.md` and `test-design-epic-2.md` amendments and this record agree with what shipped.

## Implementation Notes

- **The step.** `steps-c/step-03b-render-evaluation-plans.md` sits between the quality gates and the validation step. Step 3's `nextStepFile` points at it and it points at step 4; resume routing and the five-row dashboard follow, and a checkpoint that predates the step shows it as not run with the `[E] Edit` hint. Placing the step as 03b leaves step 2's body untouched. Both step 2 and step 3 are `contextFiles` of the fragment-selection eval, so step 3's one-line frontmatter edit moved that contract's digest and its generated probes, and `node tools/generate-contracts.js` and `generate-probes.js` regenerated them. Edit mode loads the same file twice: `steps-e/step-01-assess.md` runs its sections 1 and 2 (detect, validate) and `step-02-apply-edit.md` runs 3 and 4 (render, re-render). Edit mode never writes the create run's checkpoint, takes the platform from the loaded file's path (`.yml` and `.yaml`) and renders only into a pipeline file.
- **Rendering rules (round 1).** A job per tier the plan places a check on, with one step: `npm exec --prefix <evaluations folder> -- tea-evaluate ci --evaluation <evaluation folder> --tier <tier>`, a `run: |` block named for every check on the tier. The evaluations folder is the directory that holds AD-20's private `package.json` (normally the parent of the evaluation folder) and is installed with `npm ci --prefix` when it holds a lockfile and `npm install --prefix` otherwise; the job runs no root install and no root-keyed cache. `ci --tier` takes no check selector (confirmed in `cli/evaluate.js`: `--evaluation` and `--tier` only), so it is the one entry that runs a tier. A `gate` check renders nothing, since `ci` runs it. The `merge` job runs the `pr` step then its own. Other rules: `timeout-minutes` 30 or 120, event guards on earlier jobs when a trigger adds an event, an `if: always()` upload of the evaluation folder's `runs/` named for the job id, no `continue-on-error` on a step or the job, no invented credentials, a refused plan only for findings about `ci/evaluation-ci-plan.json`, detection through `git ls-files --cached --others --exclude-standard`. A job is found again by the plan path in its `# tea-evaluation-plan:` marker, rewritten under the current id, and given a short digest of the plan path when its id collides. The step reads the plan's rules from the TeA package and restates no tier table.
- **Amendments.** Round 1 replaced the one-step-per-distinct-command reading with one step per tier; the Spec Change Log holds each amendment with its reason.
- **The template block** sits in the extension section as commented YAML between `evaluation-plan:begin` and `evaluation-plan:end`, so the template stays a pipeline a project can start from and `test:evaluate-ci-render` parses the block after stripping the comment prefix.
- **`test:evaluate-ci-render`** (weight 0.4) holds the create chain, the edit entries with their handover and anchored load instructions, the resume routing and dashboard hint, the block parsed as YAML (one `tea-evaluate ci` step through `npm exec --prefix`, an `--prefix` install, no root install or cache, no job or step `continue-on-error`, one upload at exactly `EVALUATION_FOLDER/runs/` under `always()` pinned to `@v4`), the non-restatement scan over every skill file but the knowledge fragments, the plan equals the Story 1.10 fixture's with its evaluation folder moved, the ground truth's elements equal what that plan renders to, the CI manifest lists exactly the files under each project root, the corpus validator refuses seven malformed elements, the scorer's reading of the step name, and one real capture.
- **The `evaluation-plan` case.** `test/fixtures/ci-eval/evaluation-plan/` (project `quarry-grader`, set `evaluation-plan-quarry-grader`) carries `evals/grader/ci/evaluation-ci-plan.json`, a copy of the Story 1.10 fixture's plan with the folder moved, the AD-20 `evals/package.json`, and a request that never names the plan. The set is a full-request set (`isMinimalRequest: false`): the contract generator accepts more than one full set. The ground truth gains the artifact `condition` (compared exactly after the `${{ }}` wrapper), the command `standaloneStep` and `checkIds`, and a `job` element (id, command and the marker comment read from the source). `workflowRuleViolations` also flags `continue-on-error` on a `tea-evaluate` step or on a job that runs one. `test/lib/probe-scoring.js` maps each project to its stored correct run (`CI_CORRECT_RUNS`), since two full sets cannot share one observation identifier. `test/probes/expected-strength.json` moved only in the ci corpus digests.
- **Replay corpus.** `test/replay/ci/evaluation-plan-live-capture/` is the real capture; fifteen constructed deviations sit beside it (round 2 added the Node floor, the expression forms of `continue-on-error` and the stored sha256). Case results were derived by scoring the files and read against the intended deviation. The replay header counts were already stale at the base commit, and the final tree holds 140 cases, 135 that produce a number, 120 of those constructed and 15 captured (12 ATDD, 2 test-review, 1 here); `test/README.md` and `test/test-eval-replay.js` carry them.
- **Live evidence (round 2 final; round 1 scored 9 of 9).** `node test/eval-ci.js --agent claude --runs 2 --set evaluation-plan-quarry-grader` over the final skill and fixture: 10 of 10 requested elements, 0 unrequested, 0 lint findings, 0 rule violations, stable across both repetitions, every threshold met. The harness discards the workflow it scores, so the stored file is the same staging and prompt run once more by hand through `cli/ci-runner.js` and the local Claude Code CLI (a script kept outside the repository), byte for byte, and it scored 10 of 10. With the story's skill removed (the baseline commit's skill staged) the agent found the plan by itself and wrote five identical steps, bare `tea-evaluate` commands and an upload under `${{ always() }}`, 2 of 8 elements missed under the first ground truth, below the 0.9 recall threshold. Removing only step 3's reference leaves the step staged, and the agent found it through `instructions.md`, so that run is no revert.
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

### Round 2 fixes (PR #287, by finding id)

- **0a (red CI):** the `ci` stub target (`test/fixtures/ci-runner/stub-agent.js`) answered every project but the minimal one with the full-request pipeline, so the new set scored 18 unrequested elements. It now answers the `quarry` project with the live capture, and `test/test-probe-targets.js` expects three projects and six runs. `test:probe-targets` passes. The lesson is recorded in the process: the chain scripts that read `test/fixtures/ci-eval`, `test/replay/ci`, `test/contracts` or `test/probes` (probe-targets, probe-conformance, corpus-conformance, port-totality, compare-dominance and the rest of the non-evaluate chain) now run before a push.
- **0b (shard cap):** the timing artifacts of run 36923412327 plus run 36908433555 (shard 2's artifact was cancelled with the job) showed the cause: shard 2 ran 921 s because `test:evaluate-ci` took 419 s against a weight of 271.5, with `test:evaluate-private` and `test:doc-invocations` also over theirs. Main has since moved to eight shards (#288) and refreshed the weights (`test:evaluate-ci` 344, `test:doc-invocations` 193.8), so the merged file keeps main's numbers and moves only the scripts this change touches (`test:evaluate-ci-render` 0.8 new, `test:eval-replay` 1.2, `test:eval-ci-data` 0.8, `test:probe-corpus` 3.4). The eight shards plan at about 473.5 s each; `test:shards` (117 checks) and `test:ci-coverage` (107 chain steps over 8) pass.
- **A1:** the evaluation job takes `.nvmrc` only at or above the tooling's `engines.node` floor (22.20.0), else the current LTS, through a determine step in the template block with `NODE_FLOOR` and `NODE_LTS` placeholders. The scorer reads two `node-version` elements: the test jobs from `.nvmrc`, and the evaluation job against the floor (`scope`, `floor`). A constructed case runs the evaluation job on Node 20, and the render test scores an `.nvmrc` of 20 and 24, a literal, a guarded step and a pipeline with no evaluation job. The fixture's `.nvmrc` stays 24. The capture changed and was re-recorded from a fresh live run (10 of 10, stable over two repetitions).
- **A2:** every restatement of the superseded criterion is rewritten (epics.md, test-design-epic-2.md, this record, the CLI reference `kind` row, the `ci.js` header comment, the plan schema's `command` description, Story 2.2's record, `test/README.md`); the grep the brief names hits only dated amendment notes.
- **A3:** the CLI reference spells every adopter invocation `npm exec --prefix evals -- tea-evaluate ...` and installs TeA and eval-quality in the evaluations folder's private `package.json`; no other doc names `npx tea-evaluate`. **A5:** both hand-off clauses are gone. **A6:** `LINT_INVOCATION`'s comment sits above it.
- **A4:** `standaloneStep` counts holders per job and requires the command to end its line or sit before a separator, so a merge job (pr step, then merge step) and a lockfile install (`npm ci --prefix evals`) pass; render-test cases cover both and a repeated step in one job.
- **B1:** any `continue-on-error` value but the literal `false` on the evaluation job or its step is a violation; replay cases cover the expression form of each. **B6:** an extra `tea-evaluate` invocation counts as unrequested and a root `npm install` in a job that runs one is a violation (the root-install case is now a violation case).
- **B2:** the `evaluationPlanCommandSteps` phrase runs through `--tier <tier>`, and 18 sentences of the step (detection, skip list, refuse rule, `check` through `npm exec`, id digest, install, no root install, Node floor, tier step, naming, gate, merge order, no `continue-on-error`, timeouts, re-render by marker path, edit mode checkpoint, success line, the `.yaml` platform map) are pinned whole and at a sentence start, plus the template's merge prose.
- **B3:** the edit instructions are pinned as whole paragraphs, the assess handover is checked, the resume dashboard line is exact and its count equals the create chain. **B4:** any `npm ci|install` without `--prefix` in the block fails, `if-no-files-found: warn` and the legend lines are pinned. **B5:** two more rename cases (a dropped first and last id) and a marker moved into a following job (S04, a mutant of the same line, is near-equivalent and shares its case). **B7:** the capture's sha256 is stored and asserted. **B8:** the progress example, checklist Step 10, validate 3b and the step 4 bullet are guarded. **B10:** both messages name the defect.
- **B9:** appended as Story 1.95 (eighty-three stories), with its `epics.md` and `test-design-epic-1.md` sections, dependency row, `backlog` row and lane 3 entry.

#### Round 2 revert observations

Thirty-eight mutants, each made once in a `/tmp` copy (node_modules linked) and each observed failing. Scorer: the Node floor check returns true, the command match drops the end-of-line rule, per-job counting becomes global (all `test:evaluate-ci-render`); the expression-form `continue-on-error`, root-install and unrequested-invocation rules removed, and the ground-truth Node scope flipped (all `test:eval-replay`). Step prose: eighteen sentence mutants (each pinned sentence negated or reworded), the apply-edit `Skip its section 5.`, the assess body, the dashboard count and its hint row. Template: `npm ci --ignore-scripts` as the install, `if-no-files-found` removed, a legend line cut, the merge prose cut. Supporting files: the progress example, checklist, validate step and step 4 bullet each reworded. Capture: one byte added to the stored workflow (the sha256 check). The earlier round's mutants were re-observed against the new tests where their targets moved.

### Round 3 fixes (PR #287, by finding id)

- **R3-1:** the recall threshold stays 0.9 over the 28 requested elements of three projects (two misses of slack for the two prose-request projects, whose elements are spelled in the request), and the evaluation-plan set declares `requireEveryElement` in its ground truth, which holds that project to every one of its ten elements on its own. Reason: its elements each read one property the step prescribes, so one miss is a deviation, while a per-project threshold in the manifest would need new hash pins and a schema entry for the same effect. The harness reports `<set> missed a requested element (<ids>)` as a failure and the case classifier maps it. The stub agent gained a `deviation` mode (the one-step-per-check capture for the evaluation-plan project) and `test:probe-targets` asserts that a run one element short exits 1 and names the project while the corpus recall stays at or above 0.9. Reproduced first: with the stub's `/quarry/` row on the deviation the live gate exited 0 at 9 of 10.
- **R3-2:** the scorer compares commands as the shell reads them (`shellForm` drops the quote characters) in `invokes`, `invokesExactly`, the standalone holder comparison and the unrequested-segment check, and the step text stays as it is. Reproduced: a quoted rendering scored 3 misses and 1 unrequested. The new live capture quotes its paths, so the stored case holds the quoted spelling; the render test scores a quoted merge pipeline with no miss and no unrequested element.
- **R3-3:** a Node step that writes the version is run under bash in an empty directory whose `.nvmrc` holds the project's version and the value written to `GITHUB_OUTPUT` is read, so a step that names the floor and ignores it fails on `.nvmrc` 20; `lts/*`, `node` and `latest` meet the floor and any other alias (`lts/iron`) does not. Cases: ignored floor on 20 and 24, literal `lts/*`, literal `node`, literal `lts/iron`, an `.nvmrc` of `lts/iron`.
- **R3-4:** the template and step item 2 keep `.nvmrc` only when its value, after a leading `v`, matches `^[0-9]+(\.[0-9]+){0,2}$` and is at or above the floor, else the current LTS. Reproduced: with `sort -V` alone `lts/iron` and `lts/hydrogen` were kept. The render test runs the template's own Node step under bash for eleven `.nvmrc` values (`24`, `v22.20.0`, `22.21`, `20`, `22.12.0`, `22`, `lts/iron`, `lts/hydrogen`, `lts/*`, `node`, none). The capture changed, so it was re-recorded from a fresh live run (10 of 10, stable over two repetitions) with its new sha256, and the contract, probes and every deviation derived from the capture were regenerated.
- **R3-5:** the `README.md` line reads 140 stored outputs, and Story 1.95's criteria and test design name that line.

#### Round 3 revert observations

| Mutant                                                         | Case                                                    | Result                                                                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `requireEveryElement` check removed in the harness             | `test:probe-targets` deviation run                      | exits 1                                                                                                                               |
| `requireEveryElement` set false in the ground truth            | same                                                    | exits 1                                                                                                                               |
| Stub's deviation row points at the correct capture             | same                                                    | exits 1                                                                                                                               |
| `shellForm` returns the script unchanged                       | render test (quoted rendering, rename and marker cases) | exits 1, 7 checks; `test:eval-replay` moves 15 cases                                                                                  |
| A writer script that names the floor passes whatever it writes | render test, ignored floor                              | exits 1                                                                                                                               |
| `lts/*` and `node` not read as current                         | render test                                             | exits 1, 2 checks                                                                                                                     |
| Template without the plain-version test                        | render test, template Node step                         | exits 1, 4 checks                                                                                                                     |
| Step sentence for the alias rule reworded                      | render test, pinned sentence                            | exits 1                                                                                                                               |
| Plain-version regex removed from `atFloor`                     | none                                                    | survives: `semver.coerce` already returns null for every alias it excludes, so the guard is near-equivalent and kept as documentation |

### Round 4 fixes (PR #287)

- **F1 (CI shards 4 and 8):** R3-5 changed the README comment to a number the doc-invocation lookup (`test/lib/doc-invocation-entry.js`) and the adoption guide still keyed on at 123, so `test:doc-invocation-entry` and `doc-invocations` failed. The number is a drift magnet (already wrong at 123 on main), so the `README.md` line, the adoption guide line and the lookup key all read `stored outputs against the scorers`; a grep for that phrase finds exactly those three. Story 1.95's criteria no longer name the README count and say why; they name the totals still unguarded (`test/README.md` and the `test-eval-replay.js` header). I ran every chain script that reads `README.md`, `docs/` or `test/lib/doc-*` (36 scripts, the three heavier docs readers `evaluate-gap-loop`, `evaluate-learned-framework` and `evaluate-workflow` included) and a sweep for the other counts R3-5 touched: the remaining "123" figures sit in the roadmap and adoption guide prose, were stale before this story and no gate reads them.
- **F2 (CodeRabbit, valid):** with the last `evaluation-ci-plan.json` deleted, section 1 recorded `evaluation plans: none` and went to section 5, and the apply step ran sections 3 and 4 only when step 1 found plans, so the marked jobs stayed. Section 1 now goes to section 4 (removal of jobs whose plan is gone) before section 5, and the apply step runs sections 3 and 4 on every pipeline file target. The pinned apply paragraph is updated, two sentences are pinned (the no-plan route and the removal rule), and the capture is unchanged (the rendering text did not move).

| Mutant                                       | Case                        | Result                            |
| -------------------------------------------- | --------------------------- | --------------------------------- |
| Apply step back to "when step 1 found plans" | whole-paragraph pin         | `test:evaluate-ci-render` exits 1 |
| No-plan sentence back to "go to section 5"   | pinned sentence             | exits 1                           |
| Removal sentence reworded to never remove    | pinned sentence             | exits 1                           |
| Lookup key back to `123 stored outputs ...`  | `test:doc-invocation-entry` | exits 1                           |

## Design Notes

Why 03b: step 2 is the pipeline's generation and a plan is a second input to the same file, so the render follows the quality gates and the validation step covers it. Why one step per tier: the runtime runs a tier as a unit and writes one evidence bundle per invocation (AD-10, AD-12), so the pipeline's granularity is the tier. Why the evaluation steps use a `run: |` block: the paths come from a repository file, and a block scalar holds any quoted command without YAML escaping. Why the tooling is installed with `--prefix`: AD-20 keeps the private `package.json` out of the adopter's root manifest.

## Verification

Observed on the tree merged with origin/main ffdbd304 (round 3; CI runs the full chain):

- `npm run test:evaluate-ci-render`: 194 checks passed. `test:eval-ci-data`: corpus valid. `test:eval-replay`: 167 passed, 0 moved.
- `test:probe-targets` (with the new deviation run), `test:probe-conformance`, `test:corpus-conformance`, `test:port-totality`, `test:compare-dominance`: green.
- `test:eval-schemas`, `test:suite-manifest`, `test:contracts`, `test:contract-oracles`, `test:probe-corpus` (only the ci corpus digest moved), `node tools/generate-contracts.js --check` (16 contracts) and `node tools/generate-probes.js --check` (15 files): green.
- `test:doc-claim-sources`, `test:doc-counts`, `test:doc-claims`, `test:shards` (117 checks), `test:ci-coverage` (107 chain steps over 8 shards): green.
- `test:evaluate-run` (571 checks), `test:evaluate-guidance`, `format:check`, `lint`, `lint:md`, `docs:validate-links`: green.
- Live: `node test/eval-ci.js --agent claude --runs 2 --set evaluation-plan-quarry-grader`: 10 of 10 requested elements, 0 unrequested, stable, every threshold met.
- Not run locally: the full `npm test` chain, left to CI as the owner instructed. Round 2's run of 74 other chain scripts stands; this round changed only the harness, the ci template and step, the stub and the ci corpus.
