---
title: 'Story 1.97: Gate an existing publish or deploy job on the evaluation job'
type: 'feature'
created: '2026-10-04'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'dc9df4d0'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.97; Stories 1.121, 1.122, 1.123 and 1.95, which follow it in lane 4)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.97 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-10, AD-11)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.96.md (the record format and the plan rules this story extends)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.93.md (the ci corpus, the edit set and the constructed deviations)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-2.4.md (the ci stage and the step 03b event guards)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** A `scheduled` or `release` evaluation job gates nothing unless the repository's own publish or deploy job waits for it.
`bmad-testarch-ci` may not change a job it did not write, so step 03b could not make that wait, and the plan had no way to say which job waits for which tier.
A repository whose deploy runs on its own cron or on a tag ended with an evaluation that reports and blocks nothing that ships.

**Approach:** A check of the plan gains an optional `gates` list, the ids of the existing pipeline jobs its tier must gate.
The schema owns the shape, `ci-plan.js` reports a violation under rule `gates`, and `tea-evaluate check` and `ci` exit 10 on it.
The ci stage of the Evaluate skill sets the field when its release flow inspection finds a job the tier must gate.
Step 03b of `bmad-testarch-ci` resolves each name against the repository's workflow files, refuses a plan whose name matches no job or whose gate conflicts, and otherwise makes the job wait: `needs` inside the pipeline file, a `workflow_run` trigger and an `if:` across files.
It reports the edit, writes the wait again under the current evaluation job id on a re-render and removes it when the plan stops naming the job.
A new edit-mode adopter of the `ci` behavioral suite holds the rendering with a `wait` element, a constructed correct run and two constructed deviations; its live capture is stored by the coordinator after this build.

## Boundaries & Constraints

**Always:**

- The jobs a tier gates are the union of `gates` over the checks the plan places on that tier, so a job is named once on any check of the tier and a repeat across the tier's checks is merged.
- A name that is no job id exits 10 from `check` and `ci` with rule `gates` and no `schema` finding beside it, and `ci` runs nothing.
- Every committed plan keeps passing, and so does everything else committed (`test/fixtures/ci-eval/*` apart from the new adopter, `evaluate-api`, `evaluate/mutation`).
- Step 03b may change the gated job's `needs` or `if:` (and the `on:` of its workflow for the cross-file form) and nothing else of it.
- The ground truth is authored from the step's rules and the adopter's request, and the request names neither the plan, `gates` nor `needs`.

**Never:**

- An edit of the two committed plans of `test/fixtures/evaluate-ci-repos/` or of their `capture-record.json`: the coordinator's recapture produces them.
- The live capture of the new adopter, the two live recaptures, a `claude -p` session, an `eval:ci` run against a real agent, Docker.
- A new story, a change to the lane lists or to the sections of Stories 1.121, 1.122, 1.123 and 1.95.
- A hand-edited generated digest.

**Decisions (build worker, owner-delegated):** the owner delegated every decision of this build, so none waited at a checkpoint; the Decisions list below carries each choice with its reason.

## I/O & Edge-Case Matrix

| Scenario                          | Input / State                                                                                                                  | Expected Output / Behavior                                                                                                                   | Error Handling           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Job id on a check                 | `"gates": ["publish"]`, `["deploy-to_prod"]`, `["_deploy"]`, two ids                                                           | valid                                                                                                                                        | n/a                      |
| Name that is no job id            | `""`, `1deploy`, `-deploy`, a name with a space, a dot, a slash, a semicolon, a newline, `${{ matrix.job }}`, a non-ASCII name | `check` and `ci` exit 10 with `[gates]` naming `checks[n].gates[m]`, no `schema` finding, `ci` runs nothing                                  | exit 10                  |
| List that is not a list of names  | a string, `[]`, a repeated name, a number                                                                                      | exit 10 with `[gates]`                                                                                                                       | exit 10                  |
| Schema violation beside a gate    | `gates` valid, `enforcement` outside its enum                                                                                  | rule `schema` alone                                                                                                                          | exit 10                  |
| One job on two checks of a tier   | `publish` on two checks of `release`                                                                                           | valid, merged                                                                                                                                | n/a                      |
| One job on two tiers              | `publish` on `release` and `scheduled`                                                                                         | valid for the plan; step 03b refuses it when the two evaluation jobs do not run on one event                                                 | plan refused in the step |
| Gated job in the pipeline file    | `publish` with `needs: test` beside `evaluation-release`                                                                       | `needs: [test, evaluation-release]`, every other key and byte of the job as it was                                                           | n/a                      |
| Gated job in another file         | `deploy` in `deploy.yml`, no `if:`                                                                                             | `workflow_run` on the pipeline's name with `types: [completed]` in `on:`, `if: github.event.workflow_run.conclusion == 'success'` on the job | n/a                      |
| Cross-file job with its own `if:` | `deploy` in `deploy.yml` with `if: github.ref == ...`                                                                          | conflict: the plan is refused and reported, nothing renders from it                                                                          | plan refused in the step |
| Name that matches no job          | `gates: ["absent"]`, a name two files hold, or the id of a job under the plan marker                                           | the plan is refused and reported, nothing renders from it                                                                                    | plan refused in the step |
| Re-render                         | the evaluation job renamed, or the plan stops naming the job                                                                   | the `needs` entry is rewritten under the current id, or removed with its key when it was the only entry                                      | n/a                      |
| Tier wired to no event of its own | a `release` tier whose only event another tier took                                                                            | the summary names it as wired to no event of its own; its job runs on the shared event and a job it gates waits for it there                 | n/a                      |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/schemas/evaluation-ci-plan.schema.json`: the `gates` property of a check (`minItems` 1, `uniqueItems`, items matching `^[A-Za-z_][A-Za-z0-9_-]*$`) and the description.
- `cli/lib/evaluate/ci-plan.js`: `gatesLocation` and `schemaFinding`, which report an ajv error under `checks[n].gates` as rule `gates`; the header comment.
- `cli/evaluate.js`, `cli/lib/evaluate/check.js`: the exit-code header and the `ci-plan` family comment.
- `src/workflows/testarch/bmad-testarch-evaluate/references/ci.md`: the release-flow sentence that records job ids, the section `## Gate the publish or deploy job`, the pointer in `## Write the plan`, the gated example, the hand-off and closing summary.
- `src/workflows/testarch/bmad-testarch-ci/steps-c/step-03b-render-evaluation-plans.md`: the rules line, the Limits line, the gate resolution in section 2, the reworded item 7 clause, item 10, the re-render bullets of section 4, the platform sentence, the success and failure lines.
- `src/workflows/testarch/bmad-testarch-ci/github-actions-template.yaml`: the `evaluation-gate:begin` and `evaluation-gate:end` block; `checklist.md`, `steps-v/step-01-validate.md` and `steps-c/step-04-validate-and-summary.md`: one line each.
- `test/test-evaluate-ci.js`: the case `the gated jobs`.
- `test/test-evaluate-ci-render.js`: `checkGateSentences`, `checkGateTemplateBlock`, `checkGateFixture`, `checkGatedWait`, `checkGateCases`, `checkWaitGuards`.
- `test/test-evaluate-guidance.js`: the section markers, the gated example check and the corrupted-guide cases.
- `test/eval-ci.js`: the `wait` element kind, `withoutNeeds`, the validator branch, the recall threshold (0.97). `test/fixtures/ci-eval/evaluation-gate/` and its ground truth set and citation, `test/replay/ci/evaluation-gate-*` (the constructed correct run and the two deviations), `test/lib/probe-scoring.js` (`CI_CORRECT_RUNS`), `test/fixtures/ci-runner/stub-agent.js`, `test/test-probe-targets.js`, `test/evals/suite-manifest.json`.
- Regenerated: `test/contracts/ci.contract.json`, `test/probes/ci.probes.json`, `test/probes/expected-strength.json`.
- `docs/reference/tea-evaluate-cli.md`, `docs/how-to/workflows/setup-ci.md`, `README.md`, `docs/explanation/eval-quality-adoption-guide.md`, `docs/explanation/eval-quality-roadmap.md`, `eval-quality.config.json`, `test/README.md`, `test/probes/README.md`, `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `ARCHITECTURE-SPINE.md` (AD-10, AD-11), `sprint-status.yaml` (row 1.97 `review`).
- Also changed: `src/workflows/testarch/bmad-testarch-evaluate/SKILL.md` and `references/adapters.md`, `gaps.md`, `harness.md` and `run.md` (path text the builder's scan flagged), and `test/lib/evaluate-plan-shape.js` (the subset trigger check of decision 29).
- Not changed: `ci.js`, the plan template, the lane lists, the sections of Stories 1.121, 1.122 and 1.95, and the text of Story 1.123 apart from the dated amendment of decision 22.

## Tasks & Acceptance

- [x] Schema and `ci-plan.js`: the field, the rule `gates`.
- [x] `ci.md`: when the stage sets `gates`, the example, the hand-off.
- [x] Step 03b and its supporting files: resolution, the two forms of the wait, the re-render, the reworded event clause.
- [x] `test:evaluate-ci`, `test:evaluate-ci-render`, `test:evaluate-guidance`.
- [x] The `evaluation-gate` adopter, the `wait` element, the constructed correct run and deviations, contracts, probes and baseline.
- [x] Counts, docs, CHANGELOG, planning amendments, `sprint-status.yaml`, this record.
- [x] The live capture of the adopter and the two repository recaptures (the recapture worker, after this build).

**Acceptance Criteria:** as in `epics.md` Story 1.97, with the amendment dated 2026-10-04 there.

## Decisions

1. **The schema owns the shape, the finding says `gates`.**
   The schema holds the list, its uniqueness and the job id pattern, as the brief asks, and a violation of it would carry rule `schema`.
   `schemaFinding` reports an ajv error whose path is `checks[n].gates` or `checks[n].gates[m]` under rule `gates` and names the repair, so one defect gives one finding with the rule name the story gives.
   Every other schema error keeps rule `schema`, which a revert case holds.
2. **`minItems` 1 and `uniqueItems`.**
   An empty list names nothing and reads as a gate that is not one.
   A repeat inside one list is a typing error, while a repeat across the checks of a tier is the union and no finding.
3. **No union helper in the runtime.**
   Nothing under `cli/` reads the union: `ci` runs checks and the step reads the plan as JSON.
   A helper without a user would be dead code (Story 1.96's round 1 removed one), so the union lives in the schema description, `ci.md` and the step, and the tests compute it from the plan.
4. **Name resolution belongs to the step.**
   `check` reads one evaluation folder and cannot know which workflow files the repository holds, so a name that matches no job is the step's finding, reported in its summary, as the story says.
5. **`ci.md` gains a section of its own.**
   The stage sets `gates` on a check of the tier whose evaluation job should stop the shipment, usually `release`, leaves it out when the inspection found no such job or the adopter declined, and says which in the reason.
   The release-flow inspection records each job by id and workflow file, the first worked plan gates `publish` of `release.yml`, and the hand-off relays the step's report.
   The plan template is unchanged: an optional field with no default needs no example there.
6. **Inside one file the wait is `needs`.**
   The step writes the evaluation job into the pipeline file, so a gated job in that file waits for it through the platform's own dependency edge, appended after the entries it had.
   Its `if:` and every other key stay, because its own event handling already says when it runs and the evaluation job runs on that event.
7. **Across files the wait is `workflow_run`, an `if:` and a checkout `ref`.**
   A job waits only for jobs of its own workflow run, so `needs` cannot reach an evaluation job in another file.
   The gated workflow gains a `workflow_run` trigger on the pipeline's `name:` with `types: [completed]`.
   Round 0 of the review showed that the trigger alone fires after every run of the pipeline, a skipped evaluation job still concludes `success`, and a `workflow_run` job checks out the default branch.
   So the job's `if:` requires the conclusion `success` and the event of the tier (`github.event.workflow_run.event`), its `actions/checkout` steps take `ref: ${{ github.event.workflow_run.head_sha }}`, and the workflow's other jobs are limited to the events they already ran on, as item 7 does for a pipeline that gains an event.
   The job then starts only when the evaluation workflow completed successfully on the tier's event, and the summary says so.
   The template carries the pattern as a gate block, so the agent has a shape to follow and the render test has YAML to parse.
8. **Which form applies is decided by the gated job's file against the evaluation job's file.**
   The evaluation jobs always go into the one pipeline file the step writes, so the test is where the gated job lives.
9. **A conflict is a wait that cannot hold, and a conflict refuses the plan.**
   Inside the pipeline file, the job runs on an event on which its tier's evaluation job does not run (a job named by two tiers on different events is the usual case, and round 0 added the single-tier case: a deploy on push and release gated by the release tier), so it would wait for a skipped job and never start.
   The job already waits through the other form for another plan.
   The job lives in another file and already has an `if:` other than the one the step wrote, since `workflow_run` changes the event the job runs on and the step cannot combine the conditions without guessing.
   The job's `if:` calls a status function other than `success()`, since it would run after the evaluation job failed.
   The story's text says a name that matches no job or a conflicting gate "renders nothing for that plan", so the whole plan is refused and its earlier jobs stay as section 4 leaves a refused plan.
10. **A name matches when exactly one file holds the job, and a job under the plan marker is no job.**
    Two files with one job id make the target ambiguous.
    A job the step wrote is excluded so that a tier cannot wait for itself or for another tier's evaluation job.
11. **The re-render restores the wait with its job.**
    Section 4 rewrites a `needs` entry that names a marker job under the id it carried then with the id item 1 gives now, adds the wait where it is absent, and removes it with its plan entry or its evaluation job.
    A list left with one entry is written as that entry, so a job that began with `needs: test` ends with it and one that began as `[test]` ends with the same entry in the other spelling.
12. **The "wired to no event" line stands, reworded.**
    A tier whose only event another tier took still has no event of its own after the gate, which names a job and creates no event.
    The clause now says "of its own", states that the tier's evaluation job runs on the shared event, and that a job it gates waits for it there; the phrase "until the gating of Story 1.97" is gone from the step and from `epics.md`.
13. **A new edit-mode adopter.**
    The tiers and edit adopters have stored real captures that the new element would turn into misses, and the brief keeps everything committed passing.
    The adopter is an edit set because the gated job is a hand-written job of an existing pipeline: a hand-written `test` job (preserved by digest), a hand-written `publish` job that `needs` the test job and runs on a published release, a progress file, and a plan with four `pr` checks and `twin-run` (which carries `gates: ["publish"]`) and `held-out` on `release`.
    The pipeline lists the `release` event because the scorer's guard reader gives a release event a tag ref, and a tag push would read as the default branch.
14. **The `wait` element.**
    It names the job, the exact `needs` list the job must end with (`test`, then `evaluation-release`), the events it still runs on, and the digest of its source with its `needs` lines removed (`withoutNeeds`), so the wait is present, in the order the step gives, and nothing else of the job moved.
    The validator recomputes the digest from the staged pipeline, requires an edit set, and refuses a malformed element.
    Its `contractToken` is null: the substring vocabulary reads a document as one string and cannot state a `needs` list, so the element adds no oracle.
15. **The fixture's comments say "release team".**
    `wrongRunProblems` requires some oracle of each set to fail on every other set's correct run.
    With the edit adopter's comment token (`# Maintained by the platform team`) in both pipelines every oracle of the edit set held on the gate set's run, so the gate adopter's comment says release team.
16. **The adopter's correct run was a constructed one until its live capture existed.**
    `CI_CORRECT_RUNS` needs a stored run for every set, so the row pointed at `evaluation-gate-correct-pipeline`, a constructed case like `full-correct-pipeline`.
    The recapture stored the live capture as `evaluation-gate-live-capture`, moved the row and the stub agent's mapping to it as the other evaluation sets' rows moved, and deleted the constructed case, since nothing else needed it.
    The render test now requires exactly one real capture of the set.
17. **Two constructed deviations.**
    Since the recapture each derives from the live capture by the same single edit (the `needs` line cut to `test`, and the release evaluation job's `if:` changed to `pull_request`).
    Two cases of one set that miss the same elements with different details break `test:eval-replay`'s signature check (they score differently and sign alike), as Story 1.93 found.
    `evaluation-gate-needs-cut` misses the wait alone; `evaluation-gate-release-job-on-pull-requests` misses the release job and the wait, because a publish job that needs an evaluation job its event skips never starts.
    Every other way a wait goes wrong (the entry replaced, reordered or extended, the wrong evaluation job, the job's `if:`, steps or timeout changed, the job gone, the evaluation job removed, the wait on the wrong job) is one edit of the correct run scored in `test:evaluate-ci-render`.
18. **The recall threshold moves from 0.96 to 0.97.**
    The corpus grew from 63 to 78 elements, and 0.97 admits the two misses 0.96 admitted at 63.
    The four evaluation projects are held to every element on their own.
19. **The scorer version stays 16.**
    The scorer gained a kind and fields that no earlier case declares, so every stored result reproduces.
20. **The ground truth's rule lines moved.**
    The `lines` of the citations into `step-03b` and `checklist.md` named the old line numbers and drifted when the step grew; they now name the lines the sections span, and the new citation `evaluationGateWait` rests on item 10.
21. **The builder gate ran in round 1.**
    Round 0 could not find the `bmad-workflow-builder` scripts; they live at `/Users/murat/opensource/.claude/skills/bmad-workflow-builder/scripts`.
    Round 1 ran them read-only over a scratch copy of the skill: `quick_validate.py` ok with no errors, `scan-scripts.py` pass (the skill has no `scripts/` directory), and `scan-path-standards.py` with six high findings, none in `references/ci.md`.
    The six were `SKILL.md:20` (a bare `_bmad/`), `references/adapters.md:22` (`../stub-agent`), `references/gaps.md:99` (`/var/run/postgresql/...`), `references/harness.md:93` (`/opt/verdict-rules`) and `references/run.md:32` twice (`/usr/bin/sandbox-exec`, `/usr/bin/log stream`).
    All six are fixed here by naming the thing without the path (`_bmad` directory, the sibling folder `stub-agent`, a `.s.PGSQL.5432` file, the `verdict-rules` directory, `sandbox-exec`, `log stream`), and `test:evaluate-guidance` pins the new wording; a second scan reports zero findings.
    The `SKILL.md` edit changes its digest, which the live recapture refreshes.
    The Analyze lenses of the builder were not run as a subagent; the Opus review rounds carry them.
22. **The figures of Story 1.123 move.**
    Both new deviations pass through a `CI_CORRECT_RUNS` row (the wait has no substring oracle and the release job's tokens are all present), so `test/probes/README.md` reads 13 of the 48 stored ci deviations and 35 that pass through.
    Round 2 appended a dated amendment to the Story 1.123 section of `epics.md` and to its row in `test-design-epic-1.md` (35 pass through, adding the two deviations) and left the rest of that story as written.
23. **Round 1 amends the frozen edit set of the gated job.**
    The boundary "Step 03b may change the gated job's `needs` or `if:`" reads, from round 1 on: inside the pipeline file the job's `needs`; across files the job's `if:` and checkout `ref:`, the workflow's `workflow_run` trigger and the event guards of that workflow's other jobs, and nothing else.
    `ARCHITECTURE-SPINE.md`, the CHANGELOG, `setup-ci.md`, `epics.md` and the step's Limits and failure lines say the same.
24. **A cross-file wait is allowed only when none of its conflicts holds.**
    Round 1 showed that `workflow_run` fires for every conclusion of the pipeline, that a skipped evaluation job still lets the run conclude `success`, and that the job then builds the default branch.
    So the step refuses the plan for a pull request or fork tier (checking out `workflow_run.head_sha` there is the pwn-request pattern), for an evaluation job carrying a ref or cron guard (the event cannot tell a tag push from a branch push or one cron from another), for a gated workflow that already follows another workflow, for a job gated by two plans or tiers (two `if:` lines cannot be combined), and for a job with `needs` (its sibling is skipped on the `workflow_run` event), a `uses:` job (no checkout step to carry the `ref`), an `if:` of its own or contexts that change under `workflow_run` (`github.ref`, `github.ref_name`, `github.sha`, `github.head_ref`, `github.event.*`).
    The rendered `if:` also requires `github.event.workflow_run.path` to be the pipeline file's path, so another workflow named alike cannot start the job, and the template's gate block carries it.
    Two jobs of one plan in one gated file are fine: they share the one trigger and each carries its own `if:`, and the trigger and the guards on the other jobs go only when no other wait in that file uses them.
25. **Gated jobs get no event guard.**
    The "each other job of that file" guard excludes a job the item gates, so a gated job never carries both the guard on its original events and its `workflow_run` `if:`.
26. **In-file `needs` conflicts compare the runs the gated job already had.**
    A job that needs a skipped job is skipped, so the gate conflicts when the gated job already ran in a run where the evaluation job is skipped.
    The comparison reads the events and the branch, tag and cron filters the gated job ran on as its file held them before the render (its workflow's `on:` and its own `if:`) against the events and the ref or cron guards item 7 gives the evaluation job.
    A run the render adds, such as the merge tier widening `on.push` to `branches: [main]` or a new cron, is skipped through the wait and is no conflict: that is the protection the adopter wants.
    A deploy that already ran on every `push` beside a release evaluation job guarded to tags conflicts.
27. **The worked example is true for its repository.**
    `ci.md` now has the CI skill edit `release.yml`, the file that holds `publish`, so the evaluation jobs and `publish` share it and the claim that the tag reaches the registry only after the release tier passes holds through `needs`.
    The Gate section says the wait holds best when the job lives in the workflow file the CI skill edits, names the refusals of a cross-file wait, and the hand-off says to invoke the skill on the workflow file that holds the gated job.
28. **Smaller round 1 fixes.**
    The README thresholds read 97% and 12 calls, the CLI reference row carries the `gates` clause once, and the finding says "a job in one of the repository's workflow files".
    The `seen` de-duplication of `schemaFinding` is gone: no real ajv output for this schema repeats a path and message (ten plans with bad ids, kinds, triggers, placements, gate lists and mixed faults were tried), and the original `Set` it replaced removed nothing.
    New and extended lines are one sentence per line.
    `checkGatedWait` gains the wait extended at the end of the list and the wait followed by an entry that runs on the same event, the case that fails a prefix comparison of `needs` (the first alone is caught by the events check, not by the comparison).

29. **The committed-plan shape check accepts a subset of a tier's events.**
    The first `nightly-deploy` recapture session named `release` and `manual-dispatch` on its release checks, because `deploy.yml` starts on a schedule and a manual dispatch.
    `check` accepts it (Story 1.96, Decision 7), and `test/lib/evaluate-plan-shape.js` still demanded the exact `release` trigger of Story 2.4, which failed `the plans of two repositories`.
    The helper takes `subsetTriggers` for a live session's plan, so a plan may name any non-empty, duplicate-free subset of the events its tier uses, and the template and the guide's examples keep the exact trigger.
    The plan is the session's, byte for byte.
    The second recapture wrote `release` alone on those checks, and the third wrote `release` and `manual-dispatch` again; the helper keeps the rule, since any live session may name a subset.

30. **Item 7 exempts an in-file gated job from the guard on jobs that existed before.**
    Its `needs` on the guarded evaluation job keeps it off the runs the render adds, which mirrors decision 25 across files.
31. **Item 7 also guards the jobs that existed before when a render widens an event's filters.**
    A new branch filter, tag pattern or cron on an event the workflow already has must not make a pre-existing job that is not gated (a `publish` whose gate the adopter declined, a deploy) run on the new runs, so the step limits each such job to the events and filters it already ran on.
    The statement is made once, in item 7, and pinned.
    The template's evaluation block comments say nothing about it, so they are unchanged.
32. **`workflow_dispatch` goes to every tier whose `trigger` names `manual-dispatch`.**
    The `nightly-deploy` plan of the first recapture named it on both `scheduled` and `release`, so the tiers that do not name it are guarded out of it and a gated job that runs on a dispatch waits for the release evaluation job on a dispatch too.
    The plan of the second recapture names it on `scheduled` alone, so item 7 gives the dispatch to the scheduled evaluation job only and section 2 reports the dispatch run of `production` as a conflict (the section `Section 2 applied to the committed plans`).
33. **Section 2 is applied to the two committed live plans by the test's own helper.**
    `renderGatedPipeline` in `test/test-evaluate-ci-render.js` builds the pipeline from each repository's committed workflows and plan by the step's rules (tier events and their guards, the runs the render adds, the resolution of each gated name, the conflicts, the guards on the jobs that existed before and the `needs` of the gated job) and the case `checkGateRenders` parses the result.
    The helper models the in-file wait on GitHub Actions only; a gate in another file is refused by the helper as one it does not model, and the cross-file form is held by the step's sentences and the template's gate block.
    The outcome per plan is in the section `Section 2 applied to the committed plans`.
34. **The record's closing state.**
    The row of Story 1.97 in `sprint-status.yaml` and this record's `status` read `done`, as the lane protocol asks of a story's last review-fix push, and the Build review lists the findings of rounds 0, 1 and 2.
35. **The citations that drifted.**
    `gateMustBeAbleToFail` and `burnInSkippedForBackend` cited `step-03-configure-quality-gates.md` at lines 68 and 63 to 66, where the phrases now stand at 74 and 70 to 72.
    The corpus validator reads the phrase in the cited section and only reports a line outside the section as a notice, so no gate failed; the lines are corrected, and the scoring digest ignores them.

36. **The stage names the gated workflow's events (round 3, finding 1).**
    The round 2 `nightly-deploy` session left `manual-dispatch` off its release checks, and section 2 then refused its own gate for the dispatch runs the release evaluation job skips, so the guide left the stage to write a plan the step refuses.
    `references/ci.md` now tells the stage to name in the `trigger` of every check on the gating tier each event that starts the gated job's workflow, and to list `manual-dispatch` beside `release` when that workflow also starts on `workflow_dispatch`, as a nightly `deploy.yml` does.
    The `release` mapping in `## Place the live checks` carries the same clause, the nightly worked example lists `["release", "manual-dispatch"]` on its release check (`check` accepts it: a tier may name any subset of its events, Story 1.96 decision 7, and the guidance test lets the second example use the subset check), and five corrupted-guide cases pin the sentences, the mapping and the example.
37. **Rule C holds in both directions (round 3, finding 2).**
    Round 2 compared the gated job's pre-render runs with the evaluation job's runs, which catches a run the job had and the evaluation job skips.
    It missed the reverse: an evaluation job that runs on a run the gated job did not have, such as a `workflow_dispatch` that a release plan adds to a tag-push release file, where an in-file gated job carries no guard of its own and would run on it.
    Section 2 now says so, item 7's exemption reason says it holds because section 2 refuses that gate, and the two sentences, the helper's second direction and a `tagged-release` case with `manual-dispatch` on its release checks pin it.
    A gated job that already ran on `workflow_dispatch` gains no run, so the nightly case is untouched, and a deploy file that did not start on a dispatch conflicts when the plan names `manual-dispatch` on the gating tier.

## Implementation Notes

- `test:evaluate-ci` first failed in `the plans of two repositories` and stops there: that case and `the capture-record guard` compare the digest of `references/ci.md` with the one the two capture records pin, which the coordinator's recapture refreshes.
  The cases after it were run by name.
  The recapture refreshed both records, and the whole case list passes.
- The correct run was linted by `actionlint` through the scratch tool that wrote the stored results, and every stored case reports no finding.
- `expected-strength.json` moved in the ci corpus digest and the clean control's outcomes for the new leg.

## Revert observations

The counts of `test:evaluate-ci-render` in the first table are those of the 460-check run on the commit before round 0 of the review, which added 13 checks; the round 1 table is counted on the 487-check run.

Each revert was applied once to a scratch copy of the final tree under the scratchpad directory, the named test run, the failures recorded and the copy discarded.
`test:evaluate-ci --only="the gated jobs"` stops at its first failing assertion, so its count is one failed case and the cell names the assertion; `test:evaluate-ci-render` counts every check.

| Revert (the one edit)                                                                                 | Case run                            | Observed                                                                                                                   |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| the job id pattern removed from the schema                                                            | `test:evaluate-ci` `the gated jobs` | 1 case fails: `the name "": ci exited 0`                                                                                   |
| `uniqueItems` removed                                                                                 | `test:evaluate-ci` `the gated jobs` | 1 case fails: `a repeated name in one check: ci exited 0`                                                                  |
| `minItems` removed                                                                                    | `test:evaluate-ci` `the gated jobs` | 1 case fails: `an empty list: ci exited 0`                                                                                 |
| the `gates` property removed                                                                          | `test:evaluate-ci` `the gated jobs` | 1 case fails: `a plain id` is refused as `[schema] /checks/0 must NOT have additional properties`                          |
| every ajv error reported as `schema`                                                                  | `test:evaluate-ci` `the gated jobs` | 1 case fails: `the name "": ci lacks the [gates] finding`                                                                  |
| every ajv error reported as `gates`                                                                   | `test:evaluate-ci` `the gated jobs` | 1 case fails: `a schema violation next to a gate: ci lacks the [schema] finding`                                           |
| the `needs` list comparison removed from the `wait` element                                           | `test:evaluate-ci-render`           | 5 of 460 checks fail (the entry put ahead, no needs at all, the wait on the test job, and two more)                        |
|                                                                                                       | `test:eval-replay`                  | 1 case moves: `evaluation-gate-needs-cut`, whose wait is then present                                                      |
| the digest of the job without its `needs` removed from the `wait` element                             | `test:evaluate-ci-render`           | 4 of 460 checks fail (the publish condition widened, its steps edited, its timeout edited, and one more)                   |
| the events check removed from the `wait` element                                                      | `test:evaluate-ci-render`           | 1 of 460 checks fails: the evaluation job on the wrong event misses the job alone where the job and the wait belong        |
|                                                                                                       | `test:eval-replay`                  | 1 case moves: `evaluation-gate-release-job-on-pull-requests`, whose wait is then present                                   |
| `withoutNeeds` removes nothing                                                                        | `test:evaluate-ci-render`           | 7 of 460 checks fail, the block-list form of a correct wait among them                                                     |
| the edit-set requirement removed from the validator                                                   | `test:evaluate-ci-render`           | 1 of 460 checks fails: `validateCorpus does not refuse a wait on a set that is not an edit set`                            |
| the staged-digest comparison removed from the validator                                               | `test:evaluate-ci-render`           | 1 of 460 checks fails: the wait whose digest is not the staged job without its needs is not refused                        |
| the `needs` list shape check removed from the validator                                               | `test:evaluate-ci-render`           | 1 of 460 checks fails: the wait whose needs holds a non-name is not refused                                                |
| step 03b loses the sentence that the cross-file job starts from the completion                        | `test:evaluate-ci-render`           | 1 of 460 checks fails                                                                                                      |
| step 03b loses the sentence that refuses a plan with a name that matches no job or a conflicting gate | `test:evaluate-ci-render`           | 1 of 460 checks fails                                                                                                      |
| step 03b says "wired to no event until the gating of Story 1.97" again                                | `test:evaluate-ci-render`           | 2 of 460 checks fail: the reworded clause is missing and the retired phrase is present                                     |
| the template's gate block follows `requested` in place of `completed`                                 | `test:evaluate-ci-render`           | 1 of 460 checks fails                                                                                                      |
| the `CI_CORRECT_RUNS` row of the gate adopter removed                                                 | `test:probe-corpus`                 | throws: the project names no stored correct run                                                                            |
| the stub agent's mapping for the gate adopter removed                                                 | `test:probe-targets`                | the correct pipeline runs for the project fail (28 failure lines)                                                          |
| `references/ci.md` and the step's gating sentences                                                    | `test:evaluate-guidance`            | fourteen corrupted-guide cases, each fails the gate with the failure it targets (a section, a sentence, the gated example) |

Round 1 reverts, applied the same way to a scratch copy of the tree after the fixes (`test:evaluate-ci-render`, 487 checks; each removal of a step sentence fails the check named, all other checks passing):

| Revert (the one edit)                                                     | Failing check                                                                                                                                                                 |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| rule C removed from section 2 (a job that needs a skipped job)            | lacks the sentence for a skipped evaluation job skips the gated job                                                                                                           |
| the events and guards comparison removed                                  | lacks the sentence for events and guards are compared                                                                                                                         |
| the other-form conflict removed                                           | lacks the sentence for a job gated by another plan through the other form conflicts                                                                                           |
| the status function conflict removed                                      | lacks the sentence for a status function in the if conflicts                                                                                                                  |
| the pull request or fork tier conflict removed                            | lacks the sentence for a cross-file wait for a pull request or fork tier conflicts                                                                                            |
| the ref or cron guard conflict removed                                    | lacks the sentence for a cross-file wait behind a ref or cron guard conflicts                                                                                                 |
| the follows-another-workflow and gated-twice conflict removed             | lacks the sentence for a file that follows another workflow, or a job gated twice, conflicts                                                                                  |
| the needs, uses, own if and changing contexts conflict removed            | lacks the sentence for a cross-file job with needs, uses, an if or changing contexts conflicts                                                                                |
| the guard exclusion of gated jobs removed from item 10                    | lacks the sentence for the other jobs of the gated workflow are guarded, a gated job is not                                                                                   |
| the shared trigger and guards rule removed from section 4                 | lacks the sentence for across files the trigger and guards stay while another wait uses them                                                                                  |
| the workflow path removed from the template's `if:`                       | the gate block gives the job an if other than the successful conclusion of a run of the pipeline file started by the tier's event                                             |
| the scorer compares `needs` by prefix                                     | the wait followed by an entry that runs on the same event misses nothing where wait-publish belongs                                                                           |
| the stored correct run's release evaluation job guarded to `pull_request` | 18 checks fail, the rule C check of the fixture (the publish job can run where the release evaluation job is skipped) among them and the wait cases that expect a single miss |

A `CI_CORRECT_RUNS` row pointed at `evaluation-gate-needs-cut` or at `evaluation-gate-release-job-on-pull-requests` passes `test:probe-corpus` (the wait has no substring oracle and the release job's tokens are all present), which is why `test/probes/README.md` counts both among the stored deviations that pass through.

Round 2 reverts, applied once each to a scratch copy of the final tree (`test:evaluate-ci-render`, 515 checks):

| Revert (the one edit)                                                                                 | Failing checks                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the helper compares the runs after the render (rule C on post-render runs)                            | 3 fail: `tagged-release is refused`, `nightly-deploy is refused` and `the pre-render comparison treats the runs the render adds as a conflict`            |
| the helper guards the gated job as it guards the other jobs                                           | 2 fail: `tagged-release: the publish job changed beyond its needs` and `nightly-deploy: the gated production job carries an event guard besides its wait` |
| the helper never guards the jobs that existed before                                                  | 1 fails: `tagged-release without the gate: publish runs under undefined`                                                                                  |
| the helper gives `workflow_dispatch` to the release tier alone                                        | 1 fails: `nightly-deploy: the scheduled evaluation job runs under github.event.schedule == '17 2 * * *'`                                                  |
| the step loses the sentence that a run the render adds is no conflict                                 | 1 fails: `lacks the sentence for a run the render adds is no conflict`                                                                                    |
| the step loses the sentence that a deploy on every push beside a tag-guarded evaluation job conflicts | 1 fails: `lacks the sentence for a deploy that already ran on every push beside a tag-guarded evaluation job conflicts`                                   |
| item 7 loses the sentence that widened filters guard the jobs that existed before                     | 2 fail: the clause and the whole sentence                                                                                                                 |
| item 7 loses the in-file gated job exemption                                                          | 1 fails: `lacks the sentence for an in-file gated job is exempt from the pre-existing job guard`                                                          |
| item 7 gives `workflow_dispatch` to the one tier again                                                | 1 fails: `lacks the trigger clause for every tier that names manual-dispatch takes workflow_dispatch`                                                     |

Round 3 reverts, applied once each to a scratch copy of the final tree (`test:evaluate-ci-render`, 520 checks).
The first nine rows re-run the round 2 reverts.

| Revert (the one edit)                                                                                                                  | Failing checks                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| the helper compares the runs after the render (rule C on post-render runs)                                                             | 5 of 509 fail: `tagged-release is refused`, the tagged dispatch refusal now reading a pull request conflict, `nightly-deploy: the plan with release alone reads ...`, `edited plan: nightly-deploy ... is refused` and `the pre-render comparison treats the runs the render adds as a conflict` |
| the helper guards the gated job as it guards the other jobs                                                                            | 2 fail: `tagged-release: the publish job changed beyond its needs` and `edited plan: the gated production job carries an event guard besides its wait`                                                                                                                                           |
| the helper never guards the jobs that existed before                                                                                   | 1 fails: `tagged-release without the gate: publish runs under undefined`                                                                                                                                                                                                                         |
| the helper gives `workflow_dispatch` to the release tier alone                                                                         | 1 fails: `edited plan: the scheduled evaluation job runs under github.event.schedule == '17 2 * * *'`                                                                                                                                                                                            |
| the step loses the sentence that a run the render adds is no conflict                                                                  | 1 fails: `lacks the sentence for a run the render adds is no conflict`                                                                                                                                                                                                                           |
| the step loses the sentence that a deploy on every push beside a tag-guarded evaluation job conflicts                                  | 1 fails: `lacks the sentence for a deploy that already ran on every push beside a tag-guarded evaluation job conflicts`                                                                                                                                                                          |
| item 7 loses the sentence that widened filters guard the jobs that existed before                                                      | 2 fail: the clause and the whole sentence                                                                                                                                                                                                                                                        |
| item 7 loses the in-file gated job exemption                                                                                           | 1 fails: `lacks the sentence for an in-file gated job is exempt from the pre-existing job guard`                                                                                                                                                                                                 |
| item 7 gives `workflow_dispatch` to the one tier again                                                                                 | 1 fails: `lacks the trigger clause for every tier that names manual-dispatch takes workflow_dispatch`                                                                                                                                                                                            |
| the step loses the sentence that an evaluation job on a run the gated job did not have conflicts                                       | 1 fails: `lacks the sentence for an evaluation job running on a run the gated job did not have conflicts`                                                                                                                                                                                        |
| the step loses the sentence that a gated job that already ran on a dispatch gains no run                                               | 1 fails: `lacks the sentence for a gated job that already ran on a dispatch gains no run, and a file without dispatch conflicts`                                                                                                                                                                 |
| the helper's second direction removed                                                                                                  | 1 fails: `a gate whose evaluation job runs on a dispatch the render adds does not conflict: undefined`                                                                                                                                                                                           |
| `ci.md` loses the trigger sentence, the dispatch sentence, the mapping clause, the example's `manual-dispatch` or the lead-in sentence | each fails `test:evaluate-guidance` with the failure it targets (five corrupted-guide cases)                                                                                                                                                                                                     |

## Gates

Run one host-heavy gate at a time, on a machine shared with the other lanes.
No full local `npm test`: the hook and CI carry the chain.
Local, macOS, on the final tree:

- `test:evaluate-check` 1,232 checks, `test:evaluate-ci-render` 516, `test:evaluate-guidance`, `test:evaluate-partition-plans`, `test:probe-corpus`, `test:probe-sources`, `test:contract-sources`, `test:contract-oracles` 9,184, `test:ci-qualification` 449, `test:contracts`, `test:probe-conformance`, `test:probe-targets`, `test:eval-replay` (185 cases, 0 moved), `test:eval-ci-data`, `test:eval-schemas`, `test:evaluate-boundaries` 500, `test:direction`: green.
- `test:evaluate-ci`: every case green when run by name except two, `the plans of two repositories` and `the capture-record guard`.
  Both compare the digest of `references/ci.md` with the one the two capture records pin (`tagged-release: references/ci.md changed since the live session read it; run the session again`), so they fail until the coordinator recaptures the records.
  The cases after the first of them stop the run, so they were run by name: `the scratch holds`, `the live tiers`, `the strength floor`, `a weak target` and `judge calibration` pass.
- `test:doc-counts`, `test:doc-claims`, `test:shards` (183), `test:ci-coverage`, `test:changelog`, `test:release-metadata`: green.
- `npm run lint`, `npm run lint:md`, `npm run format:check`, `npm run docs:validate-links`: green.
- Round 3 re-ran the list on the final tree: `test:evaluate-ci-render` 520, `test:evaluate-ci` by case name (only the two capture-pending cases fail, on the `references/ci.md` digest), and the rest of the focused list green.
- Round 2 re-ran the list on the final tree: `test:evaluate-check` 1,290 checks, `test:evaluate-ci-render` 520, `test:eval-replay` 185 passed, `test:evaluate-ci` by case name (every case green; `the plans of two repositories` and `the capture-record guard` fail only on `references/ci.md changed since the live session read it`, which the coordinator's recapture refreshes), and the rest of the focused list green.
- `git diff -- package.json package-lock.json` is empty.
- Round 1 re-ran the whole list on the final tree, `test:evaluate-ci` by case name (30 cases green, the two capture-pending ones excepted), and the builder scripts over the skill directory (`quick_validate` ok, `scan-scripts` pass, `scan-path-standards` zero findings).
- The live capture and the recapture ran after the build: see "Live recapture" below for the gates of that commit.

## Build review

Round 0: one Opus subagent reviewed the commit read only in three lenses (step 03b correctness, test quality, compliance), in place of `/bmad-code-review`.
Every finding was checked against the code before it was acted on.

| Finding                                                                                                                                            | Verdict | Route                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High: the cross-file `workflow_run` job fired after every pipeline run (a skipped evaluation job concludes `success`) and built the default branch | valid   | Fixed here: the `if:` requires the tier's event, the checkout steps take the evaluated commit, the other jobs of the gated workflow are guarded, and the template block, its parse test, the step, checklist, validate step and docs follow |
| High: a single tier could silently stop a gated job on an event its evaluation job skips                                                           | valid   | Fixed here: the conflict definition covers it                                                                                                                                                                                               |
| Medium: a re-render refused its own earlier `if:`                                                                                                  | valid   | Fixed here: the conflict reads an `if:` other than the one the step wrote                                                                                                                                                                   |
| Medium: a status function in the job's `if:` bypasses the gate                                                                                     | valid   | Fixed here: a conflict                                                                                                                                                                                                                      |
| Medium: the other jobs of the gated workflow were undefined                                                                                        | valid   | Fixed here, in item 10                                                                                                                                                                                                                      |
| Low: the `workflows:` value was ambiguous                                                                                                          | valid   | Fixed here: the `name:` of the pipeline file, its path when it has none                                                                                                                                                                     |
| Low: the one-entry `needs` restore claim                                                                                                           | valid   | Fixed here: the claim and decision 11 say how a one-entry list reads                                                                                                                                                                        |
| Low: ci.md, the CHANGELOG and setup-ci named only another plan's conflict                                                                          | valid   | Fixed here: "a conflicting gate"                                                                                                                                                                                                            |
| Low: the event conflict test needed the item 7 events from section 2                                                                               | valid   | Fixed here: section 2 says it uses the events item 7 resolves                                                                                                                                                                               |
| Medium: the ground truth's `why` overclaimed what the element measures                                                                             | valid   | Fixed here                                                                                                                                                                                                                                  |
| Medium: a `needs` entry naming no job scored as a present wait                                                                                     | valid   | Fixed here: the element requires each entry to be a job of the workflow, and the case that removes the waited job expects the wait to miss                                                                                                  |
| Medium: the ci `$comment` of the suite manifest still said five projects                                                                           | valid   | Fixed here                                                                                                                                                                                                                                  |
| Medium: the Story 1.123 section and its test-design row state 33 pass-through deviations                                                           | valid   | Fixed in round 2: a dated amendment in each reads 35                                                                                                                                                                                        |
| Low: `withoutNeeds` missed an indentless block list                                                                                                | valid   | Fixed here, with a case                                                                                                                                                                                                                     |
| Low: two new summary lines and two guidance guards were unpinned                                                                                   | valid   | Fixed here: two pins and two corrupted-guide cases                                                                                                                                                                                          |
| Low: new sentences were appended to multi-sentence lines                                                                                           | valid   | Fixed here in ci.md, the validate step and AD-11                                                                                                                                                                                            |

Round 1 on the open pull request found real defects in the cross-file form and the conflict rules, and the fix is decisions 23 to 28 above: the cross-file wait is refused for a pull request or fork tier, an evaluation job behind a ref or cron guard, a gated file that already follows another workflow, a job gated twice and a job with `needs`, `uses:`, an `if:` or changing contexts; the `if:` carries the workflow path; gated jobs get no event guard; the in-file wait compares events and guards; the worked example holds for its repository; the full edit set is stated in every place that named two keys; the smaller findings and the builder gate are closed.

Round 1 on pull request #351 (the coordinator's Opus lenses) found defects in the cross-file form and the conflict rules.

| Finding                                                                                                                                                                                                                                                                            | Verdict | Route                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| The cross-file wait was allowed for a pull request tier and fork code, for an evaluation job behind a ref or cron guard, for a gated workflow that already follows another workflow, for a job gated twice and for a job with `needs`, `uses:`, its own `if:` or changing contexts | valid   | Fixed in round 1: each is a conflict that refuses the plan (decision 24)                                       |
| The rendered `if:` could be satisfied by another workflow named alike                                                                                                                                                                                                              | valid   | Fixed in round 1: it requires `github.event.workflow_run.path` to be the pipeline file's path                  |
| A gated job received both the guard on its original events and its `workflow_run` `if:`, and removing a wait could take a trigger another wait still used                                                                                                                          | valid   | Fixed in round 1: gated jobs are excluded from the guard, and the trigger goes only when no other wait uses it |
| The in-file wait compared events alone                                                                                                                                                                                                                                             | valid   | Fixed in round 1 (decision 26)                                                                                 |
| The worked example in `ci.md` claimed a gate its repository did not give                                                                                                                                                                                                           | valid   | Fixed in round 1: the CI skill edits the file that holds `publish` (decision 27)                               |
| The edit set of the wait was stated as only `needs` or `if:` in four places                                                                                                                                                                                                        | valid   | Fixed in round 1 (decision 23)                                                                                 |
| README thresholds, a doubled clause in the CLI reference, a message saying "pipeline file", one-sentence lines, a missing prefix-comparison case, an unneeded de-duplication                                                                                                       | valid   | Fixed in round 1 (decision 28)                                                                                 |
| The builder gate was recorded as not runnable                                                                                                                                                                                                                                      | valid   | Fixed in round 1: the scripts ran and their six findings are fixed (decision 21)                               |

Round 2 on pull request #351 (after the rebase onto `0f095dee`).

| Finding                                                                                                                               | Verdict | Route                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| Rule C compared the runs after the render, so the merge tier's widened `push` filter read as a conflict                               | valid   | Fixed in round 2: pre-render runs (decision 26), the sentences, `ci.md` and their pins                                 |
| An in-file gated job received the guard on the jobs that existed before                                                               | valid   | Fixed in round 2 (decision 30)                                                                                         |
| A render that widened an event's filters did not guard the pre-existing jobs that were not gated                                      | valid   | Fixed in round 2 (decision 31)                                                                                         |
| `workflow_dispatch` went to one tier, where the committed `nightly-deploy` plan names `manual-dispatch` on two                        | valid   | Fixed in round 2 (decision 32)                                                                                         |
| The record claimed no conflict in either committed plan with no application of the rules                                              | valid   | Fixed in round 2: the section `Section 2 applied to the committed plans` and the case `checkGateRenders` (decision 33) |
| The setup guide, the CHANGELOG and AD-11 listed fewer conflicts than the step, and the Code Map named files as unchanged that changed | valid   | Fixed in round 2                                                                                                       |
| Story 1.123's figures read 33 where the tree has 35                                                                                   | valid   | Fixed in round 2: dated amendments (decision 22)                                                                       |
| Two citations into `step-03-configure-quality-gates.md` had drifted                                                                   | valid   | Fixed in round 2 (decision 35)                                                                                         |

Round 3 on pull request #351.

| Finding                                                                                                                                   | Verdict | Route                             |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------- |
| The guide let the stage write a nightly plan that section 2 refuses, because nothing told it to name `manual-dispatch` on the gating tier | valid   | Fixed in round 3 (decision 36)    |
| Rule C missed an evaluation job running on a run the gated job did not have                                                               | valid   | Fixed in round 3 (decision 37)    |
| The round 2 revert table did not carry the failing counts on the final tree                                                               | valid   | Fixed in round 3: the table below |
| The setup guide did not name the widened filters or the gated-job exemption of item 7                                                     | valid   | Fixed in round 3                  |

## Section 2 applied to the committed plans

Both committed live plans of `test/fixtures/evaluate-ci-repos/` carry a `gates` entry on their release `twin-run`.
The final section 2 and items 7 and 10 of step 03b were applied to each with its committed workflows, by hand for this record and by `renderGatedPipeline` in `checkGateRenders` of `test:evaluate-ci-render`, which builds the rendered pipeline and parses it for the wait, the guards and the widened triggers.
`tagged-release` is not refused.
`nightly-deploy` is refused when its release checks name `release` alone, as the round 2 session wrote them, with one conflict that the case pins, and renders when they name `manual-dispatch` beside `release`.
The case reads the committed plan and asserts whichever shape it has, and builds both shapes by editing, so the suite holds before and after a recapture.

**`tagged-release`** gates `publish`.

- Pipeline file: `release.yml` (name `release`), the file that holds `publish`, as the ci stage's hand-off asks.
- Tier events (item 7): `pr` is `pull_request`, new to the file; `merge` is a push to the default branch, since the file lists no `merge_group`, which adds `branches: [main]` to its `push` filter; `release` is the file's own trigger, a push of `v*` tags. `merge` and `release` share `push`, so the merge job is limited by `github.ref == 'refs/heads/main'` and the release job by `startsWith(github.ref, 'refs/tags/')`.
- Section 2: `publish` matches exactly one file and is no job under the plan marker. The runs it had before the render are the tag pushes, and the release evaluation job runs on tag pushes, so it is never skipped where `publish` ran. The pull request and branch runs are added by the render and are skipped through the wait, which is no conflict. `publish` has no `if:`, no `needs` and no status function, and no other plan gates it.
- Item 7's guard on the jobs that existed before: `publish` is the only one and is gated in-file, so it is exempt.
- Result: `on` is `push` with `tags: ['v*']` and `branches: [main]` plus `pull_request`; `publish` is byte for byte as it was except `needs: [evaluation-release]`; `evaluation-pr`, `evaluation-merge` and `evaluation-release` carry the guards above.
- Second direction (round 3): a release plan that names `manual-dispatch` adds a `workflow_dispatch` run to a tag-push file, where the in-file `publish` would run, so the step refuses it and the case pins `publish would run on [{"event":"workflow_dispatch"}], which it did not run on before, where the release evaluation job runs`.
- Without the gate (the adopter declines), `publish` is limited to `github.event_name == 'push' && startsWith(github.ref, 'refs/tags/')` and has no `needs`, which the case also checks.

**`nightly-deploy`** gates `production`.

- Pipeline file: `deploy.yml` (name `deploy`), the file that holds `production`.
- Tier events: `pr` is `pull_request` and `merge` a push to the default branch (both new, `deploy.yml` lists no `merge_group`); `scheduled` is `schedule` with the cron of the repository's `nightly.yml`, `17 2 * * *`, a second cron on an event the file already has; `release` is the file's own trigger, the cron `47 3 * * *`; the plan names `manual-dispatch` on `scheduled` alone in its round 2 shape, so `workflow_dispatch` goes to the scheduled evaluation job only (item 7, decision 32), and on both tiers in its resolved shape.
  `scheduled` and `release` share `schedule`, so each is limited by its cron.
- Section 2: `production` matches exactly one file.
  The runs it had before the render are the cron `47 3 * * *` and the dispatch, and the release evaluation job runs on the cron alone.
  The dispatch run of `production` is a run where the release evaluation job is skipped, so the step refuses the plan with `production already ran on [{"event":"workflow_dispatch"}], where the release evaluation job is skipped`, and the CI skill reports it to the adopter.
  No `if:`, no `needs`, no status function, no other plan.
- Resolution: the adopter names `manual-dispatch` on the release checks too, which is the plan the first recapture's session wrote and the ci stage now asks for (decision 36).
  The second direction of rule C does not fire there: `production` already ran on `workflow_dispatch`, so the release evaluation job running on a dispatch adds no run to it.
  The case renders that plan (the live plan with `manual-dispatch` added to its three release checks) and holds the result below.
- Item 7's guard on the jobs that existed before: `production` is gated in-file, so it is exempt.
- Result of the resolved plan: `on.schedule` holds both crons and `workflow_dispatch` stays; `production` is byte for byte as it was except `needs: [evaluation-release]`, so on a dispatch it waits for the release evaluation job.

The helper verifies the rendered YAML for these two plans and for edits that must conflict or refuse (a deploy on every push beside a tag-guarded release evaluation job, a gated job calling `always()`, a name no file holds, a name two files hold).
It models the in-file form only, so what it verifies is the step's rules as the test's author reads them; the agent's rendering of the same repositories is the live sessions' business.

## Live recapture

The first recapture ran after the round 1 fixes, and the second after round 2, which edited `references/ci.md` and step 03b.
Round 3 edited `references/ci.md` and step 03b again, so both ci-repos sessions and the gate adopter ran a third time and the rows below replace the earlier ones.
The third recapture ran on this host (macOS) with Claude Code 2.1.289, one session at a time, with no API key in the environment.
Both ci-repos sessions ran `claude -p "<prompt>" --model claude-sonnet-5-5 --allowedTools Read Write Edit Glob Grep Bash --permission-mode acceptEdits --output-format json` from the scratch repository, with the prompt the committed records held, byte for byte.
`permission_denials` is empty in both outputs.
Each scratch copy held the committed repository without `capture-record.json`, the plan, `runs/` and `baseline/`, the skill copied from the working tree, `_bmad/tea/config.yaml` with `tea_evaluations_folder: evals`, the CLI and the two packages linked into `evals/node_modules`, `tiers` reset to `["pr", "scheduled"]`, and one scored run (15 trial sets of 3 trials) with no baseline.
The gate adopter ran once through `npm run eval:ci -- --agent claude --runs 1 --set evaluation-gate-slate-publisher` against the final step.

| Session                                       | Model               | Turns | Duration           | Outcome                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------- | ------------------- | ----- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tagged-release`                              | `claude-sonnet-5-5` | 18    | 299,360 ms (4m59s) | 11 checks: seven on `pr`, `preflight-live` on `merge`, `twin-run` and `held-out` (block) and `strength-comparison` (warn) on `release`; `tiers` `pr`, `merge`, `release`; `gates` set on the release `twin-run` as `["publish"]`; `tea-evaluate check` clean at the end; tier exits `pr`, `merge` and `release` all 0; no finding named in its output                                                       |
| `nightly-deploy`                              | `claude-sonnet-5-5` | 24    | 550,791 ms (9m11s) | 14 checks: seven on `pr`, `preflight-live` on `merge`, the three live checks on `scheduled` (all `warn`, `schedule` and `manual-dispatch`) and again on `release` (`release` and `manual-dispatch`); `tiers` `pr`, `merge`, `scheduled`, `release`; `gates` set on the release `twin-run` as `["production"]`; `tea-evaluate check` clean at the end; tier exits all four 0; no finding named in its output |
| `evaluation-gate-slate-publisher` (`eval:ci`) | `sonnet` alias      | n/a   | 37 s wall clock    | 15 of 15 requested elements, 0 unrequested, 0 lint findings, 0 rule violations, 0 fixture mutations, every threshold met (requested elements 100% against 97%, trigger accuracy 100%), 1 of 1 runs completed; the stored live capture stays                                                                                                                                                                 |

The recapture followed the final guide: `references/ci.md`, `SKILL.md`, the plan template, step 03b and `github-actions-template.yaml` were not edited by the recapture.
`tea-evaluate check` accepted both `gates` entries.
The `nightly-deploy` session wrote `manual-dispatch` beside `release` on its three release checks, as the round 3 sentence in the ci stage asks, so section 2 of step 03b accepts its gate for the dispatch run of `production`.
The render test pins both shapes, and the committed live plan now has the resolved one.
Both sessions wrote `evaluation.json` byte-identical to the committed file.
The `tagged-release` plan differs from the second recapture's in the wording of its `reason` lines only.
The `nightly-deploy` plan differs in the wording of its `reason` lines and in `manual-dispatch` on the three release checks.
The records took `model`, `turns` and `durationMs` from the output JSON, `claudeCodeVersion` from `claude --version`, the digests from the files, and `repositoryRead` from `test/lib/evaluate-ci-repos.js`.
Both sessions ran after Story 1.98 and Story 1.42, so the records declare no `migrations` entry.

The verification run of the gate adopter used the final step (rule C in both directions, item 7 and the ci stage's trigger sentence as round 3 left them).
Round 3 changed those places and no element of the ground truth, and the run scored every element with 0 unrequested and 0 violations, so the stored capture stays.
The run reported five drifted citations: `ground-truth.json` cited section "3. Render Each Plan" of step 03b at lines 85 to 123, where it now spans 87 to 126.
The five `skillRuleCitations` entries cite 87-126, and `test/probes/ci.probes.json` and the `corpusDigest` of `test/probes/expected-strength.json` carry the new digest of the ground truth file (no probe score moved).

The live capture is stored as `test/replay/ci/evaluation-gate-live-capture` (real-capture origin, sha256 `1195abb99119d36cbce7e581215e7f8ce33d3ce8e79ec10204cfbb90d69eb79b`, `capturedBy` quoting the one `npm run eval:ci` invocation).
It replaced the constructed correct run: the `CI_CORRECT_RUNS` row and the stub agent's mapping point at it, the two deviations derive from it by one edit each, and `checkGatedWait` edits it.
The replay corpus holds 158 stored cases with 6 real captures and 140 constructed ones, and `test:doc-counts` reports 0 disagreements.

Gates, run one at a time on the commit: `test:evaluate-ci` (all cases, 4m28s), `test:evaluate-ci-repositories` (seven tier scripts, 8m42s on the rerun; the first run met a port collision with another process on the host in `tagged-release release`), `test:evaluate-ci-render` (525 checks), `test:eval-replay` (185 passed, 0 moved), `test:probe-corpus`, `test:probe-sources`, `test:doc-counts` (0 disagreements), `test:doc-claims` (0 disagreements), `test:eval-ci-data`, `lint`, `lint:md` and `format:check`.
