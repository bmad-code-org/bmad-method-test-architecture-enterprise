---
name: 'step-03b-render-evaluation-plans'
description: 'Detect ci/evaluation-ci-plan.json files and render them into the pipeline'
nextStepFile: '{skill-root}/steps-c/step-04-validate-and-summary.md'
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

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 💾 Record outputs before proceeding
- 📖 Load the next step only when instructed

## CONTEXT BOUNDARIES:

- Available context: the pipeline file written by steps 2 and 3 (create mode) or loaded by `steps-e/step-01-assess.md` (edit mode), and the platform, test stack and Node version the pipeline was built on
- Create mode: take those from step 1. On resume, read them from the step 1 and 2 output recorded in `{outputFile}`
- Edit mode: step 1 does not run. The platform is the one the loaded file's path names (`.github/workflows/*.yml` and `.github/workflows/*.yaml` are `github-actions`, `.gitlab-ci.yml` is `gitlab-ci`, `Jenkinsfile` is `jenkins`, `azure-pipelines.yml` is `azure-devops`, `.harness/*.yaml` is `harness`, `.circleci/config.yml` is `circle-ci`), and the runner and Node setup are the ones the file's own jobs use
- Limits: change no job this step did not write, except the event guards of section 3 item 7

## ENTRY POINTS

Two places load this step.

- **Create mode** reaches it from step 3 through `nextStepFile`. Run sections 1 to 5, then load `{nextStepFile}`.
- **Edit mode** loads sections 1 and 2 from `steps-e/step-01-assess.md` and sections 3 and 4 from `steps-e/step-02-apply-edit.md`. Hold what section 1 finds in the conversation and never write `{outputFile}`: the checkpoint belongs to the create run. Skip section 5, report what was rendered in the edit summary, and return to the edit step that loaded this one. Edit mode renders only when the loaded target is a pipeline file; for any other target, report the plans found and render nothing.

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

## 1. Detect Plans

List the files named `evaluation-ci-plan.json` whose parent directory is `ci` with `git ls-files --cached --others --exclude-standard`, so a plan Evaluate has just written and not yet committed is found while ignored copies are skipped. Evaluate writes `<evaluation folder>/ci/evaluation-ci-plan.json`. Skip `node_modules/`, `runs/` and `baseline/`, and skip a plan whose `ci/` is a symbolic link, naming it in the summary.

For each plan keep its path and its evaluation folder (the directory that holds `ci/`, relative to `{project-root}`). Read the plan as JSON; a file that is not JSON is reported and skipped.

When no plan is found, record `evaluation plans: none`, change nothing in the pipeline and go to section 5.

---

## 2. Validate Each Plan

The plan's rules belong to the Evaluate runtime and ship in the TeA package. The schema is `cli/lib/evaluate/schemas/evaluation-ci-plan.schema.json` and the placement rules, with the tier table they apply, are in `cli/lib/evaluate/ci-plan.js`, both inside the installed `bmad-method-test-architecture-enterprise` package. Read them there. Never copy their contents into this skill or into a pipeline file.

The runtime lives in the evaluations folder, the directory that holds the private `package.json` Evaluate wrote with `bmad-method-test-architecture-enterprise` and `eval-quality` as devDependencies, normally the parent of the evaluation folder. The adopter's root manifest stays untouched, so every invocation names that folder with `--prefix`. When no such `package.json` is found above the evaluation folder, report it, render nothing from that plan and list running Evaluate's install stage as a next step.

- With a shell, run `npm exec --prefix <evaluations folder> -- tea-evaluate check --evaluation <evaluation folder>`. Refuse the plan only when a finding line concerns `ci/evaluation-ci-plan.json` (the `ci-plan` family, exit 10): report those findings verbatim and do not render that plan. Report any other finding and still render. A failure to run `check` at all (the package is not installed, exit 64, an `npm` error) means the plan was not validated: render it and say so in the summary. Other plans still render.
- Without a shell, read the plan against those two files and refuse a plan that breaks them the same way. When the files are not readable, render the plan as written and say in the summary that it was not validated.

---

## 3. Render Each Plan

Render with the template of the platform. For GitHub Actions the pattern is the evaluation block of `./github-actions-template.yaml`, between its `evaluation-plan:begin` and `evaluation-plan:end` markers. Write the jobs into the same pipeline file as the other jobs.

`tea-evaluate ci --evaluation <evaluation folder> --tier <tier>` is the runtime's one entry that runs a tier: it runs every check the plan places on the tier, a `gate` check included, and writes the evidence bundle under `runs/<invocationId>/`. It takes no check selector. A step per check command would run checks twice and a failing early step would stop the job before the bundle exists, so a tier is one step.

For each tier the plan places a check on, write one job:

1. **Job.** Its id is `evaluation-<tier>`, or `evaluation-<folder>-<tier>` when the repository holds several plans, with `<folder>` the evaluation folder path written with `-` for every character outside letters, digits and `_`. When that id equals the id of a job this step did not write, or of another plan's job, append a hyphen and the first six hexadecimal characters of the SHA-256 of the plan path. The artifact name in item 6 is the job id followed by `-runs`. Put the marker comment `# tea-evaluation-plan: <plan path>` first inside the job (`//` in a Jenkinsfile) so a later run can find it.
2. **Setup.** Use the runner and checkout the pipeline's other jobs use, and skip a dependency cache keyed on a root manifest the repository may not have. The Node version is the project's `.nvmrc` version only when it is at or above the floor the tooling declares, the lower bound of `engines.node` in the `package.json` of the installed `bmad-method-test-architecture-enterprise` package (22.20.0 when that package is not readable), and the current LTS otherwise. Keep `.nvmrc` only when its value, after a leading `v` is dropped, matches `^[0-9]+(\.[0-9]+){0,2}$` and is at or above the floor: an alias such as `lts/iron` names an older line and falls back to the current LTS. The tooling exits 12 on an older Node, which would block every pull request of a project pinned to one. Then install the evaluations folder: `npm ci --prefix <evaluations folder>` when it holds a `package-lock.json`, else `npm install --prefix <evaluations folder>`. Never run the root install in this job.
3. **One step per tier.** Write one standalone `run:` step, `npm exec --prefix <evaluations folder> -- tea-evaluate ci --evaluation <evaluation folder> --tier <tier>`, as a `run: |` block that holds that one command. Name it for the ids of every check the plan places on the tier, in plan order. Render nothing for a `gate` check, which `ci` runs. Quote each path for a POSIX shell. A path holding a newline or `${{` makes the plan not renderable: report it and render nothing from that plan. Never interpolate an `inputs.*` or `github.event.*` context into a `run:` block.
4. **Merge.** The job for the `merge` tier runs the `pr` tier's step first and the `merge` tier's step second, each as its own step, since a tier holds only the checks placed on it.
5. **Blocking.** The step blocks the job. Never add `continue-on-error` to a step or to the job: the runtime's exit is the verdict, and a `warn` enforcement is already exit 0 there.
6. **Evidence.** After the tier's step add an upload of `<evaluation folder>/runs/` with `if: always()`, `if-no-files-found: warn`, and the artifact name from item 1. Each invocation writes `runs/<invocationId>/` under that folder, so one path uploads every invocation.
7. **Triggers.** Add to the workflow's `on:` the events the tier's checks name in `trigger`, keeping the triggers already there: `pull-request` is `pull_request`, `merge` is `push` to the default branch (read it from the repository or the pipeline's existing `push` branches), `schedule` is `schedule` (reuse the pipeline's cron or the request's, else the template's weekly cron, and say so in the summary), `release` is `release` of type `published`, and `manual-dispatch` is `workflow_dispatch`. Limit the evaluation job with an `if:` on the event when the workflow carries more events than the tier's checks name. When an event is new to the workflow, give each job that existed before an `if:` limiting it to the events it already ran on, and name the guard in the summary.
8. **Timeout.** `timeout-minutes` is 30 for the `pr` and `merge` jobs and 120 for `scheduled` and `release`, whose live checks spend model calls. Raise it when a `gate` check's `timeoutMs` and the rest of the job's work exceed it.
9. **Credentials.** The plan carries none, and live tiers can need model credentials. Do not invent secret names. List the credential needs in the summary as a next step.

Other platforms get the same structure in their own idiom: a job or stage per tier, one step per tier, and the evidence kept whatever the result.

| Platform       | Evidence kept whatever the result                                |
| -------------- | ---------------------------------------------------------------- |
| `gitlab-ci`    | `artifacts:` with `when: always` and the `runs/` path            |
| `jenkins`      | `post { always { archiveArtifacts ... } }` over the `runs/` path |
| `azure-devops` | a `PublishPipelineArtifact@1` task with `condition: always()`    |
| `harness`      | an upload step with `when: stageStatus: All`                     |
| `circle-ci`    | `store_artifacts` on a step with `when: always`                  |

---

## 4. Re-render Without Duplicating

A run replaces what an earlier run wrote. Find the jobs that carry a `# tea-evaluation-plan:` marker and match each to its plan by the path in the marker, whatever its id. Rewrite each job whose plan still places checks on its tier under the id item 1 gives now, so a renamed or newly shared id never leaves two jobs. Remove a job only when its plan file is gone or the plan no longer places a check on its tier. A job whose plan is refused or unreadable stays as it is and is reported as stale. Leave every job without the marker as it is.

---

## 5. Save Progress

Create mode only. Edit mode skips this section.

**Save this step's accumulated work to `{outputFile}`.**

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
  - Append this step's output to the appropriate section of the document: the plans found, the jobs written, the plans refused or not validated, and the credentials the live tiers need.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Every plan found was validated or reported, and each valid plan is rendered with one `tea-evaluate ci` step per tier and an `if: always()` upload of its `runs/` folder

### ❌ SYSTEM FAILURE:

- A plan rendered by copying its tier table into the pipeline or this skill
- A check moved to another tier, or an evaluation step marked `continue-on-error`
- Edit mode writing the create run's checkpoint
- Skipped sequence steps or missing outputs
  **Master Rule:** Skipping steps is FORBIDDEN.
