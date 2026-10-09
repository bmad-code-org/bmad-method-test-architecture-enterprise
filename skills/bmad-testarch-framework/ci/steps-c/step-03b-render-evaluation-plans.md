---
name: 'step-03b-render-evaluation-plans'
description: 'Detect ci/evaluation-ci-plan.json files and render them into the pipeline'
nextStepFile: '{skill-root}/ci/steps-c/step-04-validate-and-summary.md'
outputFile: '{test_artifacts}/ci/ci-pipeline-progress.md'
---

# Step 3b: Render Evaluation Plans

## STEP GOAL

Find every evaluation CI plan in the repository and render each one into the pipeline file of the chosen `ci_platform`. Evaluate writes the plan and this workflow writes every pipeline file, so one skill owns them.

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`
- 🚫 The plan is the only definition of tier membership: read `placement.tier` as written and never move, add or drop a check
- 🚫 Do not edit a plan
- 🚫 A `gates` entry names a job to wait for and creates no job, event or check

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 💾 Record outputs before proceeding
- 📖 Load the next step only when instructed

## CONTEXT BOUNDARIES:

- Available context: the pipeline file written by steps 2 and 3 (create mode) or loaded by `{skill-root}/ci/steps-e/step-01-assess.md` (edit mode), and the platform, test stack and Node version the pipeline was built on
- Create mode: take those from step 1. On resume, read them from the step 1 and 2 output recorded in `{outputFile}`
- Edit mode: step 1 does not run. The platform is the one the loaded file's path names (`.github/workflows/*.yml` and `.github/workflows/*.yaml` are `github-actions`, `.gitlab-ci.yml` is `gitlab-ci`, `Jenkinsfile` is `jenkins`, `azure-pipelines.yml` is `azure-devops`, `.harness/*.yaml` is `harness`, `.circleci/config.yml` is `circle-ci`), and the runner and Node setup are the ones the file's own jobs use
- Limits: change no job this step did not write, except the event guards of section 3 item 7 and the wait of section 3 item 10, which changes that one job's `needs` in the pipeline file, or across files that job's `if:` and checkout `ref:`, its workflow's `workflow_run` trigger and the event guards of that workflow's other jobs, and nothing else

## ENTRY POINTS

Two places load this step.

- **Create mode** reaches it from step 3 through `nextStepFile`. Run sections 1 to 5, then load `{nextStepFile}`.
- **Edit mode** loads sections 1 and 2 from `{skill-root}/ci/steps-e/step-01-assess.md` and sections 3 and 4 from `{skill-root}/ci/steps-e/step-02-apply-edit.md`. Hold what section 1 finds in the conversation and never write `{outputFile}`: the checkpoint belongs to the create run. Skip section 5, report what was rendered in the edit summary, and return to the edit step that loaded this one. Edit mode renders only when the loaded target is a pipeline file; for any other target, report the plans found and render nothing.

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

## 1. Detect Plans

List the files named `evaluation-ci-plan.json` whose parent directory is `ci` with `git ls-files --cached --others --exclude-standard`, so a plan Evaluate has just written and not yet committed is found while ignored copies are skipped. Evaluate writes `<evaluation folder>/ci/evaluation-ci-plan.json`. Skip `node_modules/`, `runs/` and `baseline/`, and skip a plan whose `ci/` is a symbolic link, naming it in the summary.

For each plan keep its path and its evaluation folder (the directory that holds `ci/`, relative to `{project-root}`). Read the plan as JSON; a file that is not JSON is reported and skipped.

When no plan is found, record `evaluation plans: none`, render nothing and go to section 4, which removes the jobs of plans that no longer exist, before section 5.

---

## 2. Validate Each Plan

The plan's rules belong to the Evaluate runtime and ship in the TeA package. The schema is `cli/lib/evaluate/schemas/evaluation-ci-plan.schema.json` and the placement rules, with the tier table they apply, are in `cli/lib/evaluate/ci-plan.js`, both inside the installed `bmad-method-test-architecture-enterprise` package. Read them there. Never copy their contents into this skill or into a pipeline file.

The runtime lives in the evaluations folder, the directory that holds the private `package.json` Evaluate wrote with `bmad-method-test-architecture-enterprise` and `eval-quality` as devDependencies, normally the parent of the evaluation folder. The adopter's root manifest stays untouched, so every invocation names that folder with `--prefix`. When no such `package.json` is found above the evaluation folder, report it, render nothing from that plan and list running Evaluate's install stage as a next step.

- With a shell, run `npm exec --prefix <evaluations folder> -- tea-evaluate check --evaluation <evaluation folder>`. Refuse the plan only when a finding line concerns `ci/evaluation-ci-plan.json` (the `ci-plan` family, exit 10): report those findings verbatim and do not render that plan. Report any other finding and still render. A failure to run `check` at all (the package is not installed, exit 64, an `npm` error) means the plan was not validated: render it and say so in the summary. Other plans still render.
- Without a shell, read the plan against those two files and refuse a plan that breaks them the same way. When the files are not readable, render the plan as written and say in the summary that it was not validated.

Then resolve the gates of every plan that was not refused.
A tier gates the union of the `gates` lists over the checks the plan places on it, each name once.
A name matches a job when exactly one workflow file of the repository holds a job with that id (for GitHub Actions, the pipeline file this step writes and the other files in `.github/workflows/`).
A name that no file holds, that several files hold, or that is the id of a job this step wrote (one that carries the `# tea-evaluation-plan:` marker) matches no job.
A gate conflicts when its wait cannot hold, and each conflict below refuses the plan.
Inside the pipeline file, a job that needs a skipped job is skipped, so a gate conflicts when the gated job already ran in a run where its tier's evaluation job is skipped.
Compare the events and the branch, tag and cron filters the gated job ran on as its file held them before this render (its workflow's `on:` and its own `if:`) with the events and guards the evaluation job of each tier that gates it runs on, using the ref or cron guards item 7 gives it.
A run this render adds, such as a merge tier widening `on.push` to `branches: [main]` or a new cron, is skipped through the wait and is no conflict.
A deploy that already ran on every `push` beside a release evaluation job guarded to tags conflicts.
It also conflicts when the tier's evaluation job runs on a run the gated job did not run on before this render, such as a `workflow_dispatch` the render adds to a tag-push release file, since an in-file gated job carries no guard of its own and would run there.
A gated job that already ran on `workflow_dispatch`, as a nightly deploy file does, gains no run when the evaluation job runs on a dispatch, and a deploy file that did not start on `workflow_dispatch` before the render conflicts when the plan names `manual-dispatch` on the gating tier.
It conflicts when the job already waits for an evaluation job of another plan through the other form of item 10.
It conflicts, in either form, when the job's `if:` calls a status function other than `success()` (`always()`, `!cancelled()` or `failure()`), since the job would run after the evaluation job failed.
Across files the wait is `workflow_run`, and it conflicts when the tier's GitHub event is `pull_request`, `pull_request_target` or another event that runs code of a fork, since the job would check out the fork's commit with the repository's secrets.
It conflicts when the tier's evaluation job carries a ref or cron guard beyond its event, since `github.event.workflow_run.event` cannot tell a tag push from a branch push or one cron from another, and a skipped evaluation job still lets the run conclude `success`.
It conflicts when the gated file already has a `workflow_run` trigger that lists a workflow other than the pipeline file, or when the job is gated by another plan or by a second tier, since two `if:` lines cannot be combined.
It conflicts when the gated job has `needs` (its sibling is skipped on the `workflow_run` event and the job never runs again), is a `uses:` reusable-workflow job (it has no checkout step to carry the `ref`), has an `if:` of its own other than the one this step wrote, or reads `github.ref`, `github.ref_name`, `github.sha`, `github.head_ref` or `github.event.*` outside the wait this step wrote, since those contexts change under `workflow_run`.
Refuse a plan with a name that matches no job or with a conflicting gate: report each in the summary, render nothing from that plan, and treat the jobs of its earlier run as section 4 treats a refused plan.
Other plans still render.

---

## 3. Render Each Plan

Render with the template of the platform. For GitHub Actions the pattern is the evaluation block of `{skill-root}/ci/github-actions-template.yaml`, between its `evaluation-plan:begin` and `evaluation-plan:end` markers. Write the jobs into the same pipeline file as the other jobs.

`tea-evaluate ci --evaluation <evaluation folder> --tier <tier>` is the runtime's one entry that runs a tier: it runs every check the plan places on the tier, a `gate` check included, and writes the evidence bundle under `runs/<invocationId>/`. It takes no check selector. A step per check command would run checks twice and a failing early step would stop the job before the bundle exists, so a tier is one step.

For each tier the plan places a check on, write one job:

1. **Job.** Its id is `evaluation-<tier>`, or `evaluation-<folder>-<tier>` when the repository holds several plans, with `<folder>` the evaluation folder path written with `-` for every character outside letters, digits and `_`. When that id equals the id of a job this step did not write, or of another plan's job, append a hyphen and the first six hexadecimal characters of the SHA-256 of the plan path. The artifact name in item 6 is the job id followed by `-runs`. Put the marker comment `# tea-evaluation-plan: <plan path>` first inside the job (`//` in a Jenkinsfile) so a later run can find it.
2. **Setup.** Use the runner and checkout the pipeline's other jobs use, and skip a dependency cache keyed on a root manifest the repository may not have. The Node version is the project's `.nvmrc` version only when it is at or above the floor the tooling declares, the lower bound of `engines.node` in the `package.json` of the installed `bmad-method-test-architecture-enterprise` package (22.20.0 when that package is not readable), and the current LTS otherwise. Keep `.nvmrc` only when its value, after a leading `v` is dropped, matches `^[0-9]+(\.[0-9]+){0,2}$` and is at or above the floor: an alias such as `lts/iron` names an older line and falls back to the current LTS. The tooling exits 12 on an older Node, which would block every pull request of a project pinned to one. Then install the evaluations folder: `npm ci --prefix <evaluations folder>` when it holds a `package-lock.json`, else `npm install --prefix <evaluations folder>`. Never run the root install in this job.
3. **One step per tier.** Write one standalone `run:` step, `npm exec --prefix <evaluations folder> -- tea-evaluate ci --evaluation <evaluation folder> --tier <tier>`, as a `run: |` block that holds that one command. Name it for the ids of every check the plan places on the tier, in plan order. Render nothing for a `gate` check, which `ci` runs. Quote each path for a POSIX shell. A path holding a newline or `${{` makes the plan not renderable: report it and render nothing from that plan. Never interpolate an `inputs.*` or `github.event.*` context into a `run:` block.
4. **Merge.** The job for the `merge` tier runs the `pr` tier's step first and the `merge` tier's step second, each as its own step, since a tier holds only the checks placed on it.
5. **Blocking.** The step blocks the job. Never add `continue-on-error` to a step or to the job: the runtime's exit is the verdict, and a `warn` enforcement is already exit 0 there.
6. **Evidence.** After the tier's step add an upload of `<evaluation folder>/runs/` with `if: always()`, `if-no-files-found: warn`, and the artifact name from item 1. Each invocation writes `runs/<invocationId>/` under that folder, so one path uploads every invocation.
7. **Triggers.** Add to the workflow's `on:` the events the tier's checks name in `trigger`, keeping the triggers already there: `pull-request` is `pull_request`, `merge` is `merge_group` when the pipeline already lists it and `push` to the default branch otherwise (read it from the repository or the pipeline's existing `push` branches), `schedule` is `schedule` (reuse the pipeline's cron or the request's, else the template's weekly cron, and say so in the summary), `release` is the event the repository's existing release or deploy workflow starts on, read from its workflows (a `push` of a tag pattern, `release` of type `published`, or the deploy workflow's own trigger) and `release` of type `published` when they name none, and `manual-dispatch` is `workflow_dispatch`. Limit the evaluation job with an `if:` on the event when the workflow carries more events than the tier's checks name. When two tiers' triggers resolve to the same GitHub event, limit each job with a guard that tells them apart: `github.ref == 'refs/heads/<default branch>'` for a branch push, `startsWith(github.ref, 'refs/tags/')` (or the tag pattern) for a tag push and `github.event.schedule == '<its cron>'` for each cron, and give `workflow_dispatch` to every tier whose `trigger` names it and guard the tiers that do not name it out of it. When a tier's only resolved event is one that another tier took, name that tier in the summary as wired to no event of its own, and render no guard that excludes a tier from every event: its evaluation job runs on the event the other tier took, and a job it gates (item 10) waits for it there, since `gates` names a job and creates no event.
   When an event is new to the workflow, or an event the workflow already has gains a branch filter, a tag pattern or a cron, give each job that existed before an `if:` limiting it to the events and filters it already ran on, and name the guard in the summary.
   An in-file gated job (item 10) is exempt from that guard, since its `needs` on the evaluation job keeps it off the runs this render adds, which holds because section 2 refuses a gate whose evaluation job runs on one of them.
8. **Timeout.** `timeout-minutes` is 30 for the `pr` and `merge` jobs and 120 for `scheduled` and `release`, whose live checks spend model calls. Raise it when a `gate` check's `timeoutMs` and the rest of the job's work exceed it.
9. **Credentials.** The plan carries none, and live tiers can need model credentials. Do not invent secret names. List the credential needs in the summary as a next step.
10. **Gates.**
    For each job the tier gates (section 2), make the job wait for the tier's evaluation job, by where the gated job lives.
    In the pipeline file this step writes, the wait is `needs`: append the evaluation job's id to the gated job's `needs`, keep the entries already there in their order (a `needs` that is one string becomes a list), and leave the job's `if:` and every other key as they are, so the job's own event handling stays as it was.
    In another workflow file the wait is a `workflow_run` trigger, since a job waits only for jobs of its own workflow run and `needs` cannot reach the evaluation job: add to that file's `on:`, keeping the triggers already there, `workflow_run` with `workflows` naming the pipeline file this step writes (its `name:`, or its file path when it has none) and `types: [completed]`, give the job `if: github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == '<the GitHub event of the tier>' && github.event.workflow_run.path == '<the pipeline file path>'`, and set `ref: ${{ github.event.workflow_run.head_sha }}` on the job's `actions/checkout` steps, as the gate block of `{skill-root}/ci/github-actions-template.yaml` shows between its `evaluation-gate:begin` and `evaluation-gate:end` markers.
    A completed workflow run triggers the job whatever workflow and event started it, and a `workflow_run` job checks out the default branch, so the three checks limit the job to a successful run of the pipeline file on the tier's event and the `ref` builds the commit the evaluation ran on.
    That job then starts only from that completion, and the summary says so.
    Give each other job of that file, except a job this item gates, an `if:` limiting it to the events it already ran on, as item 7 does for a pipeline that gains an event.
    Report each edit in the summary with the job, its file and the evaluation job it waits for, and change nothing else of the job.

Other platforms get the same structure in their own idiom: a job or stage per tier, one step per tier, the evidence kept whatever the result, and the wait of item 10 as the platform's own dependency between jobs, or between pipelines when the gated job lives in another file.

| Platform       | Evidence kept whatever the result                                |
| -------------- | ---------------------------------------------------------------- |
| `gitlab-ci`    | `artifacts:` with `when: always` and the `runs/` path            |
| `jenkins`      | `post { always { archiveArtifacts ... } }` over the `runs/` path |
| `azure-devops` | a `PublishPipelineArtifact@1` task with `condition: always()`    |
| `harness`      | an upload step with `when: stageStatus: All`                     |
| `circle-ci`    | `store_artifacts` on a step with `when: always`                  |

---

## 4. Re-render Without Duplicating

A run replaces what an earlier run wrote.

- Find the jobs that carry a `# tea-evaluation-plan:` marker and match each to its plan by the path in the marker, whatever its id.
- For each job whose plan still places checks on its tier, work out the id item 1 gives that plan and tier now. It can differ from the id the job carries: a job written while the repository held several plans carries the plan's folder, and with one plan left item 1 gives `evaluation-<tier>`.
- Rewrite the job under the id item 1 gives now: rename it, give its artifact the name item 1 derives from the new id, and keep no job under the old id, so a renamed or newly shared id never leaves two jobs.
- Remove a job only when its plan file is gone or the plan no longer places a check on its tier.
- Restore each wait with its job.
  For a job the plan's tier gates, write the wait under the id item 1 gives now: replace the `needs` entry that names a job the marker carried, under the id it carried then, with the current id, so a renamed evaluation job leaves neither two entries nor a dangling one, and add the wait where it is absent.
- Remove a wait when the plan no longer names the job on that tier, and remove the waits on an evaluation job when that job is removed.
  The `needs` entry goes, the key with it when it was the only entry, and a list left with one entry is written as that entry.
  Across files the `if:` and the checkout `ref:` go with the wait, and the `workflow_run` trigger and the guards on the workflow's other jobs go only when no other wait in that file still uses them.
  The gated job then carries what it carried before the first render, a one-entry `needs` list reading as its entry.
- A job whose plan is refused or unreadable stays as it is and is reported as stale.
- Leave every job without the marker as it is.

---

## 5. Save Progress

Create mode only. Edit mode skips this section.

**Save this step's accumulated work to `{outputFile}`.**

Retain `run_id`, `setup_scope`, `setup_operation`, the agreed `contract`, and hook ledger fields with this Create phase's frontmatter. For every scope, report this save and the next step to the coordinator so it atomically updates `{test_artifacts}/framework/setup-run-progress.md` and `phase_position` through `resources/setup-state.md`; preserve per-phase step names and artifact paths. Workers update only their own Create checkpoint.

- **If `{outputFile}` does not exist** (first save), create it with YAML frontmatter:

  ```yaml
  ---
  workflowStatus: 'in-progress'
  stepsCompleted: ['step-03b-render-evaluation-plans']
  lastStep: 'step-03b-render-evaluation-plans'
  lastSaved: '{date}'
  ---
  ```

  Then write this step's output below the frontmatter.

- **If `{outputFile}` already exists**, update:
  - Set `workflowStatus: 'in-progress'`
  - Add `'step-03b-render-evaluation-plans'` to `stepsCompleted` array (only if not already present)
  - Set `lastStep: 'step-03b-render-evaluation-plans'`
  - Set `lastSaved: '{date}'`
  - Append this step's output to the appropriate section of the document: the plans found, the jobs written, the jobs gated, the plans refused or not validated, and the credentials the live tiers need.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Every plan found was validated or reported, and each valid plan is rendered with one `tea-evaluate ci` step per tier and an `if: always()` upload of its `runs/` folder
- Every job a tier gates waits for the tier's evaluation job, or the plan is refused with the name or the conflict reported

### ❌ SYSTEM FAILURE:

- A plan rendered by copying its tier table into the pipeline or this skill
- A check moved to another tier, or an evaluation step marked `continue-on-error`
- A gated job changed beyond the wait of section 3 item 10 (its `needs` in the pipeline file; across files its `if:` and checkout `ref:`, its workflow's `workflow_run` trigger and the guards of that workflow's other jobs), or a wait written for a plan that was refused
- Edit mode writing the create run's checkpoint
- Skipped sequence steps or missing outputs
  **Master Rule:** Skipping steps is FORBIDDEN.
