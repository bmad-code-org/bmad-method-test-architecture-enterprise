---
title: 'Story 1.93: Prove the merge, scheduled and release rendering and the re-render of evaluation plans'
type: 'feature'
created: '2026-10-04'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '712b0ad4'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.93; Stories 2.3, 1.94, 1.121, 1.122, 1.123)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.93 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-11, AD-12)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-2.3.md (the evaluation-plan case and its live capture)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.94.md (stored-run scoring in the probe leg)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.112.md (the record format)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** The `evaluation-plan` case of the `ci` behavioral suite proves one slice of `steps-c/step-03b-render-evaluation-plans.md`: a plan with checks on the `pr` tier, rendered on GitHub Actions in create mode.
The step also renders the `merge`, `scheduled` and `release` tiers (the event each trigger maps to, the `merge` job running the `pr` commands first, the 30 and 120 minute limits, the event guard on each job), gives each job an artifact name of its own, replaces its own jobs by their marker on a second run, and renders edit mode through the assess and apply steps.
No harness case reaches any of that: `test/eval-ci.js` stages create mode over one `pr`-only plan, and `test:evaluate-ci-render` parses the template block and the step references and runs no agent.
An evaluation that runs on merge, on a schedule and on release is enforced there only if the rendering of those tiers, of a re-run and of edit mode is right, and nothing measured it.

**Approach:** Two fixture adopters join `test/fixtures/ci-eval/`, each with a request that never names the plan.
The tiers adopter places checks on `pr`, `merge`, `scheduled` and `release`, and its ground truth lists the four triggers, a job per tier with its one `tea-evaluate ci` step, the `merge` job's `pr` step ahead of its own, the event each job runs on (the test job's events too, since the workflow gains events after it), the 30, 30, 120 and 120 minute limits and each job's `runs/` upload under `if: always()` with an artifact name of its own.
The edit adopter is the harness's first edit-mode set: its pipeline already holds a hand-written job and an evaluation job under the plan's marker, and the second run has to replace the marker job under the id the rules give now, leave the hand-written job byte for byte and leave the create run's checkpoint untouched.
A live `eval:ci` run of each adopter scores against the ground truth, and the by-hand capture of each is stored as a real capture under `test/replay/ci/` beside constructed deviations that each miss exactly the elements they remove.
The harness gains an edit mode (`mode`, `editTarget`, an edit prompt), element fields (`after`, `runsOn`, `timeoutMinutes`, `markerJobs` on a job; `jobId`, `name` on an artifact; `runsOn` on a command; `types` on a trigger) and two element kinds (`preserved`, `checkpoint`).

## Boundaries & Constraints

**Always:** The ground truth is authored from the step's rules and the adopters' requests and is never put in the agent's context.
Every element quotes the request file of its adopter, and every rule it rests on is cited under `skillRuleCitations` with a phrase the corpus validator finds in the cited section.
Each of the three evaluation adopters is held to every one of its elements (`requireEveryElement`).
Only GitHub Actions is in the suite: the corpus rejects other platforms and actionlint lints GitHub Actions alone.
The live runs go through the local Claude Code CLI on the owner's subscription, with no API key, and the real output is stored as it came.
A run that fails the scorer is either a defect of the new ground truth, which is fixed, or a real deviation of the skill, which is fixed in the step and run live again.
`references/ci.md`, `SKILL.md`, the plan template and every `capture-record.json` stay as they are (the step file is not digested by them).
The engine check runs at start and end.
No eval-quality change, no new dependency.

**Never:** a hand-edited generated digest, a fabricated or hand-written capture, a new story, a threshold loosened to make a run pass.

**Decisions (build worker, owner-delegated):** the Decisions list below carries each choice with its reason.

## I/O & Edge-Case Matrix

| Scenario                      | Input / State                                                                                                                         | Expected Output / Behavior                                                                                                                       | Error Handling                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| Create over four tiers        | the tiers adopter: plan with four `pr`, one `merge`, two `scheduled` and two `release` checks, request names no plan                  | four jobs under the marker, one `tea-evaluate ci` step per tier, 23 of 23 elements, no unrequested element, no rule violation                    | a miss fails the set (`requireEveryElement`)  |
| Merge job without the pr step | the capture with the `pr` step cut from the `merge` job                                                                               | `job-evaluation-merge` misses and nothing else                                                                                                   | n/a                                           |
| One name for two jobs         | the capture with the `merge` upload named `evaluation-pr-runs`                                                                        | `artifact-evaluation-runs-merge` misses and nothing else                                                                                         | n/a                                           |
| Scheduled under the pr limit  | the capture with the `scheduled` job at `timeout-minutes: 30`                                                                         | `job-evaluation-scheduled` misses and nothing else                                                                                               | n/a                                           |
| Unguarded pr job              | the capture with no `if` on the `pr` job                                                                                              | `job-evaluation-pr` misses (the job runs on four events) and nothing else                                                                        | n/a                                           |
| Unguarded test job            | the capture with no `if` on the `test` job                                                                                            | `guard-unit-tests` misses and nothing else                                                                                                       | n/a                                           |
| Swapped artifact names        | the capture with the `pr` and `merge` uploads under each other's names                                                                | `artifact-evaluation-runs-pr` and `artifact-evaluation-runs-merge` miss                                                                          | n/a                                           |
| Edit over a stale marker job  | a pipeline with a hand-written `test` job and a marker job `evaluation-evals-ledger-pr` named for two of four checks, a checkpoint    | `evaluation-pr` replaces the marker job, one job carries the marker, the `test` job and the checkpoint are byte for byte, 12 of 12 elements      | a miss fails the set                          |
| Test job reformatted          | the edit capture with the quotes of `name: 'Unit tests'` changed                                                                      | `preserved-job-test` misses and nothing else                                                                                                     | n/a                                           |
| Checkpoint rewritten          | the edit capture and a stored checkpoint with a line appended                                                                         | `checkpoint-untouched` misses and nothing else; a live harness run that does it also counts one fixture mutation                                 | exit 1                                        |
| Stale job kept                | the edit capture with the old marker job added beside `evaluation-pr`, with its marker, without it, or with its tier command replaced | `job-evaluation-pr` (two jobs carry the marker or run the tier) misses, and `command-evaluation-ci-pr` too where the stale step names two checks | n/a                                           |
| Job id kept                   | the edit capture with the id `evaluation-evals-ledger-pr` and its artifact name                                                       | `job-evaluation-pr` and `artifact-evaluation-runs` miss                                                                                          | n/a                                           |
| New sets counted              | `test:contract-sources`, `test:probe-sources`, `test:eval-schemas`, `test:eval-replay`, `test:eval-ci-data`, the `ci` suite manifest  | each holds the two sets, `caseCount` is 5, the `fixtures` list names every file of the five roots                                                | a stale count, contract or probe corpus fails |

</frozen-after-approval>

## Code Map

- `test/eval-ci.js`: `SET_MODES`, `ELEMENT_KINDS` (`preserved`, `checkpoint`), `validateCorpus` (mode, `editTarget`, the new element fields, the digests of the staged job and checkpoint), `stageIntoWorkspace` (the edit target out of the mutation digest), `buildEditPrompt`, `jobBlockOf`, `markerJobIds`, `guardHolds`, `cronsOf`, `jobRunsOn`, `eventsRunBy`, `checkElement` (job `after`, `runsOn`, `timeoutMinutes`, `markerJobs`; artifact `jobId`, `name`; command `runsOn`; trigger `types`; `preserved`; `checkpoint`), `scoreRun` (an `aux` of project files read after the run), `runCase` (reads the checkpoint files from the workspace), `THRESHOLDS.requestedElementRecall` (0.96).
- `test/fixtures/ci-eval/evaluation-tiers/` and `evaluation-edit/`: the two adopters, with their requests, plans, evaluations folder manifests, and for the edit adopter the pipeline and the checkpoint.
- `test/fixtures/ci-eval/ground-truth.json`: eight new rule citations, the two sets.
- `test/replay/ci/evaluation-tiers-*` (live capture and six deviations) and `evaluation-edit-*` (live capture and six deviations); the edit cases hold the checkpoint beside the workflow.
- `test/test-eval-replay.js`: reads the checkpoint files of an edit case from its folder; `test/lib/probe-scoring.js`: two rows of `CI_CORRECT_RUNS`; `test/fixtures/ci-runner/stub-agent.js`: the two projects, a `checkpoint` mode; `test/test-probe-targets.js`: five projects, the checkpoint case and the edit project's correct run.
- `test/test-evaluate-ci-render.js`: `checkTierFixtures`, `checkEventGuards`, `checkNeedsAndExistingJobGuards`, `checkEditSetGuards`, `checkTierAndEditCases`, the guard cases in `checkCorpusGuards`, three sentence pins.
- `src/workflows/testarch/bmad-testarch-ci/steps-c/step-03b-render-evaluation-plans.md`: section 4 as a list that names the rename.
- `eval-quality.config.json`: the doc-count pattern for the number of ci projects and the two content hashes of the suite manifest that the doc claims pin; `README.md`, `docs/explanation/eval-quality-adoption-guide.md` and `docs/explanation/eval-quality-roadmap.md` carry the new call, replay and capture counts.
- `test/evals/suite-manifest.json`, `test/contracts/ci.contract.json`, `test/probes/ci.probes.json`, `test/probes/expected-strength.json` (regenerated by the repository's tooling), `test/README.md`, `test/probes/README.md`, `docs/how-to/workflows/setup-ci.md`, `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `sprint-status.yaml`.
- Not changed: `references/ci.md`, `SKILL.md`, the plan template, `cli/`, every `capture-record.json`, `KNOWN_UNHELD`.

## Tasks & Acceptance

- [x] Build the tiers adopter and its ground truth; score a live run.
- [x] Build the edit adopter, the edit mode of the harness and its ground truth; score a live run; fix the step where the live run found a deviation; score again.
- [x] Store the by-hand captures and the constructed deviations; regenerate contracts, probes and the baseline with the repository's tooling.
- [x] The render test, the stub, the probe-targets case, the manifest, the docs, the planning amendments, the CHANGELOG and this record.

**Acceptance Criteria:** as in `epics.md` Story 1.93, with the amendment dated 2026-10-04 there.

## Implementation Notes

### Live evidence

All live runs went through `cli/ci-runner.js` and the local Claude Code CLI (2.1.289, the adapter's default model alias `sonnet`), each in a staged workspace of the harness.
The harness does not report turns and the by-hand runs print none, so the record carries duration and no turn count.

| Run                                                                                                                     | Result                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| edit, by hand, step text of Story 2.3                                                                                   | 10 of 12: every part of the marker job rewritten except its key, which stayed `evaluation-evals-ledger-pr`, with its artifact named for it, 30 s  |
| edit, by hand, first rewording of section 4                                                                             | the same two misses, 31 s                                                                                                                         |
| edit, by hand, section 4 as a list that names the rename                                                                | 12 of 12: renamed to `evaluation-pr` and `evaluation-pr-runs`, the test job and the checkpoint untouched, 38 s                                    |
| tiers (three tiers), by hand, step text with the merge rule, the timeout rule and the guard sentence cut (scratch copy) | 17 of 18: `job-evaluation-merge` misses its `pr` step (the template block carries the timeouts and the guards, so those two still rendered), 79 s |
| tiers, by hand, after the review round added the `release` tier and the test job's guard                                | 23 of 23, 0 unrequested, 0 lint findings, 78 s (the stored capture)                                                                               |
| edit, by hand, after the request gained the progress file sentence                                                      | 12 of 12, 39 s (the stored capture)                                                                                                               |
| `npm run eval:ci -- --agent claude --runs 2 --set evaluation-tiers-granite-router --set evaluation-edit-ember-ledger`   | tiers 23 of 23 and edit 12 of 12 on both repetitions, stable, 0 unrequested, every threshold met, 4 of 4 runs completed, 235 s                    |

The harness runs of the first design (three tiers) scored 18 of 18 and 12 of 12 over two repetitions, 234 s.
An earlier harness invocation lost its first tiers run because the working tree changed while it ran (the harness refuses a run whose repository changed under a `scoped-artifact-writes` declaration): the build edited two files in the checkout during that run.
It was stopped and run again with no edit in flight, and the same rule held for the final harness run.

### The finding

The first two live edit runs kept the id the stale job carried.
Item 1 of the step gives `evaluation-<tier>` when the repository holds one plan and `evaluation-<folder>-<tier>` when it holds several, and section 4 said to rewrite each marker job under the id item 1 gives now.
The runs rewrote the job's step, Node setup, limit and upload and left its key, which no sentence of the step said to change.
Section 4 is now a list: match the jobs by marker, work out the id item 1 gives now (a job written while the repository held several plans carries the folder), rename the job and its artifact name to it, and keep no job under the old id.
Two sentences are pinned by `test:evaluate-ci-render`, and the corpus holds the deviation (`evaluation-edit-job-id-kept`).
The step file is not digested by any `capture-record.json`, so no live session of the Evaluate skill needed a recapture.

## Decisions

1. **Two new sets, one per mode.**
   The create-mode tiers set and the edit-mode set differ in staging, prompt and what they score, so each is its own project with its own request (the harness runs one project per workspace and per agent call).
2. **The tiers request asks for the tiers in prose and says nothing about a plan.**
   It names pull requests, pushes to `main`, published releases and a weekly schedule, and says which checks run where ("its pull request checks", "its merge checks when a change lands on `main`", "its scheduled checks", "its release checks").
   A run that does not detect `ci/evaluation-ci-plan.json` has no way to write them, which is what the story asks the case to measure.
3. **The plan places checks on all four tiers, and the scheduled tier's trigger is `schedule` alone.**
   The criteria name `pr`, `merge` and `scheduled`, and the title promises `release`.
   The release tier maps to `release` of type `published` (the step's rule when the repository's workflows name no other release event) and shares the 120 minute limit with `scheduled`.
   `manual-dispatch` would add `workflow_dispatch`, a second guard shape and an unrequested trigger to a request that says "No manual dispatch".
4. **Job guards are scored by evaluating the `if` for each event the workflow names, with `needs` read.**
   A substring match on `github.event_name` accepts a guard that excludes the right event, and a job that `needs` a job its event skips never runs whatever its own `if` says.
   `guardHolds` evaluates the expression for each event over a whitelist of `github.event_name`, `github.event.schedule`, `github.ref`, string literals, `startsWith(github.ref, '<literal>')`, `==`, `!=`, `!`, `&&`, `||` and parentheses, lowering the expression and the values because GitHub compares strings without regard to case.
   Any other token reads as an unreadable guard and the element misses, naming it.
   `jobRunsOn` requires the job's own guard and every job it needs to hold on the event, and `eventsRunBy` compares the resulting events with `runsOn`.
   The whitelist is the whole grammar, so no identifier but the two context names reaches the evaluated code.
5. **Timeouts and artifact names are elements of the job and the upload they belong to.**
   `timeoutMinutes` compares `timeout-minutes` exactly, and the artifact element carries `jobId` and `name`, so a deviation that repeats one name misses the element of the job that repeats it and no other.
6. **The merge job's step order is `after` on the job element.**
   The `merge` job must hold a step of its own for the `pr` command, then one for its own; each step holds that one command.
   The tier-step element (`standaloneStep`, `checkIds`) already counts the same step in two jobs once per job and requires every holder to be named for the checks, so the repeated `pr` step is held to its name as well.
7. **An edit set stages the pipeline and the checkpoint as project files.**
   The pipeline is the one file the run changes on purpose, so `stageIntoWorkspace` leaves `editTarget` out of the mutation digest.
   Every other file stays in it, the checkpoint included, so a run that rewrites the checkpoint is a fixture mutation and a missed `checkpoint` element, and the stub's `checkpoint` mode proves the harness path.
8. **`preserved` digests the job's source and `checkpoint` digests the file.**
   A parse drops comments, quoting and layout, and a rewrite that normalizes them still parses to the same job.
   The hand-written job carries a comment, single quotes, a blank line inside its steps and an `env` block so that a rewrite shows.
   The corpus validator recomputes both digests from the staged files, so the ground truth cannot name bytes the fixture does not hold.
9. **The stored edit case keeps the checkpoint the run left.**
   The replay cannot read a workspace, so the case folder holds the file at its project path beside the workflow, and a file the run deleted is a file the folder does not hold.
10. **The contract tokens survive shell quotes.**
    `command-evaluation-install` is `npm install --prefix` and each tier step is `--tier <tier>`.
    The full commands carry folder names that a run may quote for the shell, as the existing capture does, and its two substring oracles over the full commands do not hold on it (Story 1.122 repairs those two).
    Every new oracle holds on its stored capture, so `KNOWN_UNHELD` is unchanged.
11. **The recall threshold moves from 0.9 to 0.96.**
    The corpus grew from 28 to 63 requested elements, and 0.9 would admit six misses where it admitted two.
    The three evaluation projects are held to every element on their own, so the ratio governs the full and minimal projects as before.
12. **The test job's guard is an element of the tiers set.**
    The request says the test job runs on pull requests and pushes to `main` only.
    The workflow gains the push, release and schedule events after the test job was written, which is the step's rule for a job that existed before a new event, and the live run followed it without a prompt.
    The element is a `command` element with `runsOn`, read over every job that runs `npm test`.
13. **A second job for a tier is counted by what it runs and by its marker, and a tier's job runs no other tier's step.**
    The edit adopter's job element requires exactly one job that runs the tier's command and exactly one that carries the marker.
    Every `tea-evaluate` invocation in a tier's job, split at the shell separators, is the tier's own command or the `pr` command its `after` names; round 1 of the PR review showed that a `pr` job carrying the scheduled step scored 23 of 23.
    The first build counted markers only, and the review showed that a stale job renamed with its marker removed scored clean; `evaluation-edit-stale-job-kept-unmarked` holds that, and `evaluation-edit-marker-job-emptied` holds the marker count (a job under the marker whose tier command is gone).
14. **The story's three deviations and nine more.**
    Each derives from a stored capture by one edit: an unguarded `pr` job (`runsOn`), an unguarded test job (command `runsOn`), swapped artifact names (the `jobId` filter), a reformatted test job (`preserved`), a rewritten checkpoint (`checkpoint`), a stale job kept with its marker, without it and with its command replaced, and a kept id.
    The render test holds the elements each one misses.
    A merge job that waits for the `pr` job with `needs` stays out of the corpus because it misses the element the deviation without the `pr` step misses, and two cases that score alike by element and differ by detail make `test:eval-replay`'s signature check fail; `test:evaluate-ci-render` scores it through one edit of the capture instead.
15. **Deviations that miss more or fewer elements than one.**
    The stale job's step names two of four checks, so the tier-step element misses beside the job element; the kept id misses the job and its artifact; the swapped names miss both uploads.
    Each is recorded as it scores, and the render test pins each list.
16. **Section 4 of the step is a list.**
    One sentence that carried match, rewrite, remove, stale and leave-alone lost the rename in the live runs.
    The list keeps every earlier sentence of the section and adds the id derivation and the rename.
17. **The scorer version stays 16.**
    The scorer gained element fields and kinds that no earlier case declares, so every stored result reproduces and nothing moved.
18. **The probe baseline moved by the new clean-control legs.**
    `expected-strength.json` records the ci corpus digest and the outcomes of the clean control, whose record carries one leg per set; the file moved in those two places only (the digest and 31 added clean-control outcomes, 187 lines).
19. **Pointing a `CI_CORRECT_RUNS` row at a stored deviation.**
    Of the twelve new deviations two make `test:probe-corpus` fail (`evaluation-tiers-shared-artifact-name` through its artifact name token, `evaluation-edit-job-id-kept` through the two tokens that carry the job id), and ten pass through, so the figures of `test/probes/README.md` are 13 of 46 and 33, and Story 1.123's criteria read 33.
20. **The doc-count pattern names five ci projects.**
    `eval-quality.config.json` held the sentence "three ci projects" of the adoption guide as a literal; the guide now says five, and the two manifest hashes that the doc claims pin were re-confirmed (the `deferred` array is empty and the state table is accurate after the ci row was corrected).

## Revert observations

Each revert was applied once to a scratch copy of the final tree under the scratchpad directory, the named test run, the failures recorded and the copy discarded.
`test:eval-replay` passes 182 checks on the final tree; `test:evaluate-ci-render` runs 360.

| Revert (the one edit)                                                 | Case run                  | Observed                                                                                                                                                                |
| --------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the job `timeoutMinutes` check removed                                | `test:eval-replay`        | 1 moved: `evaluation-tiers-scheduled-under-pr-timeout`                                                                                                                  |
| the job `runsOn` check removed                                        | `test:eval-replay`        | 1 moved: `evaluation-tiers-pr-job-unguarded`                                                                                                                            |
| the job `after` check removed                                         | `test:eval-replay`        | 1 moved: `evaluation-tiers-merge-without-pr-step`                                                                                                                       |
| the artifact `name` checks removed                                    | `test:eval-replay`        | 2 moved: `evaluation-tiers-artifact-names-swapped`, `evaluation-tiers-shared-artifact-name`                                                                             |
| the artifact `jobId` filter removed                                   | `test:eval-replay`        | 2 moved: `evaluation-edit-job-id-kept`, `evaluation-tiers-artifact-names-swapped`                                                                                       |
| the marker count of `markerJobs` removed                              | `test:eval-replay`        | 1 moved: `evaluation-edit-marker-job-emptied`                                                                                                                           |
| the runner count of `markerJobs` removed                              | `test:eval-replay`        | 2 moved: `evaluation-edit-stale-job-kept`, `evaluation-edit-stale-job-kept-unmarked`                                                                                    |
| `preserved` always present                                            | `test:eval-replay`        | 1 moved: `evaluation-edit-test-job-reformatted`                                                                                                                         |
| `checkpoint` always present                                           | `test:eval-replay`        | 1 moved: `evaluation-edit-checkpoint-rewritten`                                                                                                                         |
| the command `runsOn` check removed                                    | `test:eval-replay`        | 1 moved: `evaluation-tiers-test-job-unguarded`                                                                                                                          |
| `guardHolds` answers true for every guard                             | `test:eval-replay`        | 8 moved, the tiers capture and its guard and timeout deviations among them                                                                                              |
| `jobRunsOn` ignores `needs`                                           | `test:evaluate-ci-render` | 1 of 360 failed: the merge job that needs the `pr` job misses nothing                                                                                                   |
| the trigger `types` check removed                                     | `test:evaluate-ci-render` | 1 of 360 failed: the release trigger of type `created` misses nothing                                                                                                   |
| the merge job's step order check (`first > own`) removed              | `test:evaluate-ci-render` | 1 of 360 failed: the merge job that runs its own step ahead of the `pr` step misses nothing                                                                             |
| the check that a tier job runs no other tier's step removed           | `test:evaluate-ci-render` | 1 of 360 failed: the `pr` job carrying the scheduled step misses nothing                                                                                                |
| the per-cron reading of `jobRunsOn` replaced by one read with no cron | `test:evaluate-ci-render` | 1 of 360 failed: the scheduled job guarded by the declared cron misses `job-evaluation-scheduled`                                                                       |
| the trigger `types` validation removed from `validateCorpus`          | `test:evaluate-ci-render` | 1 of 360 failed: the validator does not refuse a trigger whose `types` is not a list                                                                                    |
| the command `runsOn` validation removed from `validateCorpus`         | `test:evaluate-ci-render` | 1 of 360 failed: the validator does not refuse a command whose `runsOn` is empty                                                                                        |
| `step-03b` back at its text on `main`                                 | `test:evaluate-ci-render` | 2 of 360 failed: the two sentence pins of section 4 (and `test:contract-sources` reports the contract's source digest)                                                  |
| the checkpoint fixture dropped from the suite manifest's `fixtures`   | `test:evaluate-ci-render` | 1 of 360 failed: the manifest omits the file                                                                                                                            |
| the tiers live capture removed                                        | `test:evaluate-ci-render` | 2 of 341 failed; `test:probe-corpus` cannot assemble the corpus; `test:eval-replay` stays green, since a missing case is absent from it (the totals gate is Story 1.95) |
| `CI_CORRECT_RUNS` without the edit row                                | `test:probe-corpus`       | exit 2: the project names no stored correct run                                                                                                                         |
| the manifest's `caseCount` back at 3                                  | `test:eval-schemas`       | 1 problem: the manifest declares 3 and the harness scores 5                                                                                                             |
| `ci.contract.json` at its text on `main`                              | `test:contract-sources`   | fails, differs from its sources first at line 6                                                                                                                         |
| `ci.probes.json` at its text on `main`                                | `test:probe-sources`      | fails, out of date with its sources                                                                                                                                     |
| a request quote of the tiers adopter changed                          | `test:eval-ci-data`       | 2 problems: the quote no longer resolves in the request                                                                                                                 |
| the edit prompt branch of `buildPrompt` removed                       | `test:contract-sources`   | fails, the contract's stdin literal differs from the prompt the harness assembles                                                                                       |
| the edit target kept in the mutation digest                           | `test:probe-targets`      | 4 checks failed: the edit project's correct run reads as a mutation                                                                                                     |
| `runCase` reads no checkpoint after the run                           | `test:probe-targets`      | 4 checks failed: the correct edit run misses the checkpoint element                                                                                                     |
| the stub's `checkpoint` mode writes nothing                           | `test:probe-targets`      | 2 checks failed: the exit-1 and the mutation-count checks of the rewritten checkpoint                                                                                   |

The live revert of the step's own rules is in the table above: with the merge rule cut from the step, the live run misses the merge job's `pr` step, and with section 4 as Story 2.3 wrote it, two of two live edit runs kept the old id.

## Gates

Run one host-heavy gate at a time, on a machine shared with the other lanes.
No full local `npm test`: the hook and CI carry the chain.

Local, macOS, on the final tree:

- Engine check (`evaluateTarget` is a function) at the start and at the end: exit 0.
- `test:evaluate-ci-render` 360 checks, `test:eval-ci-data`, `test:eval-replay` 182 checks (0 moved), `test:contract-sources`, `test:probe-sources`, `test:eval-schemas`, `test:probe-corpus` (with the regenerated baseline), `test:probe-targets`, `test:contract-oracles` (8,219 checks), `test:contracts`, `test:ci-qualification` (449), `test:probe-conformance`, `test:corpus-conformance`, `test:port-totality`, `test:eval-quality-corpus`: green.
- `test:doc-counts`, `test:doc-claims`, `test:doc-count-sources`, `test:doc-claim-sources`, `test:shards` 183, `test:ci-coverage`, `test:changelog`, `test:suite-manifest`: green.
- `npm run lint`, `npm run lint:md`, `npm run format:check`: green.
- `git diff -- package.json package-lock.json` is empty.
- No Docker and no container ran. `docs:build` and `docs:validate-links` ran on the final tree after the one docs change (`docs/how-to/workflows/setup-ci.md`, the two explanation pages).

## Build review

Round 0: one Opus subagent reviewed the uncommitted tree in three lenses (correctness, test quality, compliance), read only, in place of `/bmad-code-review`.
`/bmad-build` could not render here (`_bmad/scripts/render_skill.py` is absent from this worktree, which carries no `_bmad` install), so the build followed the skill's steps by hand: the spec above, the implementation, one review pass.
Every finding was checked against the code or by running the case before it was acted on.

| Finding                                                                                                                                        | Verdict           | Route                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| High: `test:doc-counts` failed with 17 disagreements (ci calls 6 to 10, total calls, replay corpus, real captures)                             | valid, reproduced | Fixed here: the three docs and the config pattern carry the new counts                                                                                                   |
| High: `test:doc-claims` failed on the two claims pinned to the manifest's content hash                                                         | valid, reproduced | Fixed here: the ci row of the adoption guide corrected, both claims re-read, both hashes updated                                                                         |
| Medium: an edit run that keeps the stale job beside the new one with its marker removed scored 12 of 12                                        | valid, reproduced | Fixed here: the job element counts the jobs that run the tier's command; two cases hold it                                                                               |
| Medium: `runsOn` ignored `needs`, so a merge job waiting for the guarded `pr` job read as running on push                                      | valid, reproduced | Fixed here: `jobRunsOn` requires the needed jobs to run on the event; the render test scores it                                                                          |
| Medium: the `release` tier and the guard on a job that existed before an event were proved by no case                                          | valid             | Fixed here: the plan gained two `release` checks, the request the release trigger and the test job's events, and the ground truth the elements; the live runs score them |
| Medium: `guardHolds` could not read `github.event.schedule` or `startsWith(github.ref, ...)`, the guards the step prescribes for shared events | valid             | Fixed here: both are read, with a per-event ref and cron                                                                                                                 |
| Medium: the README counts did not add up                                                                                                       | valid             | Fixed here: 155 cases, 149 produce a number, 132 of those constructed, 17 captured                                                                                       |
| Medium: the story record was untracked and failed prettier                                                                                     | valid             | Fixed here: staged with `git add -f` by path, formatted                                                                                                                  |
| Low: two citation line numbers were off and two citations no element used                                                                      | valid             | Fixed here: lines corrected, `evaluationEventGuard` and `evaluationEditEntry` each cited by an element                                                                   |
| Low: the checkpoint element's quote said nothing about the checkpoint                                                                          | valid             | Fixed here: the edit request gained the progress file sentence and the element quotes it                                                                                 |
| Low: nothing failed on a reverted artifact `jobId` filter                                                                                      | valid             | Fixed here: `evaluation-tiers-artifact-names-swapped`                                                                                                                    |
| Low: the deviation-mode assertion of `test:probe-targets` still compared recall with 0.9                                                       | valid             | Fixed here: it reads the harness's threshold                                                                                                                             |
| Low: the `guardHolds` comment had a banned tail and miscounted its names; string comparison was case-sensitive                                 | valid             | Fixed here: the comment rewritten, comparison case-insensitive                                                                                                           |
| Low: the CHANGELOG said section 1 where item 1 of section 3 was meant                                                                          | valid             | Fixed here                                                                                                                                                               |
| Low: the tiers request states what three rules under test produce (`pushes to main`, `of its own`, `more time`)                                | skipped           | The request is the adopter's own statement of what it wants, and the rules map it to events, `-runs` names and 120 minutes, which only the step says                     |
| `guardHolds` is safe against escaping the whitelist                                                                                            | confirmed         | Read and probed: only two context names, single-quoted literals without a quote or a backslash, and the listed operators reach the evaluated code                        |

Round 1 (PR review): the coordinator's Opus review found eleven defects, each verified against the code and fixed in the second commit.

| Finding                                                                                                     | Verdict           | Route                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The `pr`-ahead-of-`merge` order check had no test that fails when it is removed                             | valid, reproduced | Fixed: `checkNeedsAndExistingJobGuards` swaps the two steps of the merge job and expects `job-evaluation-merge` alone                                                        |
| A tier job that also runs another tier's step scored clean (the `pr` job with the scheduled step, 23 of 23) | valid, reproduced | Fixed: the job element requires every `tea-evaluate` invocation in the job, split at the shell separators, to be its own command or its `after`; the render test scores it   |
| The per-cron reading of `jobRunsOn` was never exercised                                                     | valid             | Fixed: the scheduled job guarded by `github.event.schedule == '0 3 * * 0'` misses nothing and by `'0 4 * * 0'` misses `job-evaluation-scheduled` only                        |
| The validator's refusals of a malformed trigger `types` and command `runsOn` had no case                    | valid             | Fixed: two cases of `checkCorpusGuards` against the tiers set                                                                                                                |
| `README.md` "What Has to Pass" still said 90% recall and two projects                                       | valid             | Fixed: 96% and "Five projects twice: 10 calls"                                                                                                                               |
| Four places named three tiers for the tiers project                                                         | valid             | Fixed: the adoption guide row, the manifest comment, the render test header and the `checkTierFixtures` docstring name four; both manifest hashes regenerated by the tooling |
| `epics.md` lane prose still described the old lane order (1.79, 1.132, 1.111, 1.114 and 1.115)              | valid             | Fixed: 1.79 follows 1.107 in lane 1, lane 2 no longer carries 1.132, lane 3 keeps 1.116 after lane 2's 1.113 and names lane 5 for 1.111, 1.114 and 1.115                     |
| Decision 18 said 187 added control outcomes                                                                 | valid             | Fixed: 31 added clean-control outcomes (187 lines)                                                                                                                           |
| `capturedBy` of the two live captures quoted a single-set invocation                                        | valid             | Fixed: both quote the one `npm run eval:ci` invocation with both `--set` flags; `test:eval-replay` stays at 182 passed, 0 moved                                              |
| `evaluationReRender` cited lines 103-105                                                                    | valid             | Fixed: 100-105; every other `lines` citation of the new ground truth checked against the files                                                                               |
| The record and the sprint row were not `done` (LANES.md rule 16)                                            | valid             | Fixed: `done` in both                                                                                                                                                        |

The scorer change (a tier job refusing another tier's step) moved no stored case.
The ground truth's `lines` edit moved the corpus digest of `ci.probes.json` and the ci `corpusDigest` of `expected-strength.json`, regenerated through `tools/generate-probes.js` and `node test/test-probe-corpus.js --write`; the baseline moved in that digest alone.
