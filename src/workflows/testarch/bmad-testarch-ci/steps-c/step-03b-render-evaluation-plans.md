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
- 🚫 The plan is the only definition of tier membership: read `placement.tier` and `command` as written, and never move, add, drop or reword a check
- 🚫 Do not edit a plan

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 💾 Record outputs before proceeding
- 📖 Load the next step only when instructed

## CONTEXT BOUNDARIES:

- Available context: the pipeline file written by steps 2 and 3 (create mode) or loaded by `steps-e/step-01-assess.md` (edit mode), and the platform, test stack, Node version, install command and package runner the pipeline was built on
- Create mode: take those from step 1. On resume, read them from the step 1 and 2 output recorded in `{outputFile}`
- Edit mode: step 1 does not run. The platform is the one the loaded file's path names (`.github/workflows/*.yml` is `github-actions`, `.gitlab-ci.yml` is `gitlab-ci`, `Jenkinsfile` is `jenkins`, `azure-pipelines.yml` is `azure-devops`, `.harness/*.yaml` is `harness`, `.circleci/config.yml` is `circle-ci`), and the Node setup and install steps are the ones the file's own jobs use
- Limits: change no job this step did not write, except the event guards of section 3 item 7

## ENTRY POINTS

Two places load this step.

- **Create mode** reaches it from step 3 through `nextStepFile`. Run sections 1 to 5, then load `{nextStepFile}`.
- **Edit mode** loads sections 1 and 2 from `steps-e/step-01-assess.md` and sections 3 and 4 from `steps-e/step-02-apply-edit.md`. Hold what section 1 finds in the conversation and never write `{outputFile}`: the checkpoint belongs to the create run. Skip section 5, report what was rendered in the edit summary, and return to the edit step that loaded this one. Edit mode renders only when the loaded target is a pipeline file; for any other target, report the plans found and render nothing.

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

## 1. Detect Plans

List the files named `evaluation-ci-plan.json` whose parent directory is `ci`, preferring `git ls-files` so untracked and ignored copies are skipped. Evaluate writes `<evaluation folder>/ci/evaluation-ci-plan.json`. Skip `node_modules/`, `runs/` and `baseline/`, and skip a plan whose `ci/` is a symbolic link, naming it in the summary.

For each plan keep its path and its evaluation folder (the directory that holds `ci/`, relative to `{project-root}`). Read the plan as JSON; a file that is not JSON is reported and skipped.

When no plan is found, record `evaluation plans: none`, change nothing in the pipeline and go to section 5.

---

## 2. Validate Each Plan

The plan's rules belong to the Evaluate runtime and ship in the TeA package. The schema is `cli/lib/evaluate/schemas/evaluation-ci-plan.schema.json` and the placement rules, with the tier table they apply, are in `cli/lib/evaluate/ci-plan.js`, both inside the installed `bmad-method-test-architecture-enterprise` package. Read them there. Never copy their contents into this skill or into a pipeline file.

- With a shell, run `npx tea-evaluate check --evaluation <evaluation folder>`. Exit 10 carries the `ci-plan` findings, which are those rules: report them verbatim and do not render that plan. Any other failure (the package is not installed, exit 64, an `npx` error) means the plan was not validated: render it as written and say so in the summary. Other plans still render.
- Without a shell, read the plan against those two files and refuse a plan that breaks them the same way. When the files are not readable, render the plan as written and say in the summary that it was not validated.
- Read `package.json`. The rendered steps run the `tea-evaluate` bin, so `bmad-method-test-architecture-enterprise` and `eval-quality` must be devDependencies. When either is missing, list `npm install --save-dev bmad-method-test-architecture-enterprise eval-quality` as a next step in the summary and still render.

---

## 3. Render Each Plan

Render with the template of the platform. For GitHub Actions the pattern is the evaluation block of `./github-actions-template.yaml`, between its `evaluation-plan:begin` and `evaluation-plan:end` markers. Write the jobs into the same pipeline file as the other jobs.

For each tier the plan holds a check on, write one job:

1. **Job.** Its id is `evaluation-<tier>`, or `evaluation-<folder>-<tier>` when the repository holds several plans, with `<folder>` the evaluation folder path written with `-` for every character outside letters, digits and `_`. The artifact name in item 6 is the job id followed by `-runs`. Put the marker comment `# tea-evaluation-plan: <plan path>` first inside the job (`//` in a Jenkinsfile) so a later run can find it.
2. **Setup.** Use the runner, checkout, Node setup (version from `.nvmrc` when the project has one) and dependency install the pipeline's other jobs use.
3. **Steps: one step per distinct command.** Take each check's `command` in plan order and render one standalone `run:` step per distinct argv. A step is named for the ids of every check that carries that argv: `tea-evaluate ci --tier <tier>` runs every check of the tier, so checks that share it run once. Lead the argv with the project's package runner (`npx` for npm) because the bins are devDependencies, quote each argument for a POSIX shell, and keep the rest as the plan wrote it. Write the command as a `run: |` block that holds that one command and nothing else. A `gate` check renders the same way. An argument holding a newline or `${{` makes the plan not renderable: report it and render nothing from that plan. Never interpolate an `inputs.*` or `github.event.*` context into a `run:` block.
4. **Merge.** The job for the `merge` tier first runs the distinct commands of the `pr` tier, then the `merge` tier's commands that the `pr` list does not already hold, since a tier holds only the checks placed on it.
5. **Blocking.** The step blocks the job. Never add `continue-on-error`: the runtime's exit is the verdict, and a `warn` enforcement is already exit 0 there.
6. **Evidence.** After the check steps add an upload of `<evaluation folder>/runs/` with `if: always()`, `if-no-files-found: warn`, and the artifact name from item 1. Each invocation writes `runs/<invocationId>/` under that folder, so one path uploads every invocation.
7. **Triggers.** Add to the workflow's `on:` the events the tier's checks name in `trigger`, keeping the triggers already there: `pull-request` is `pull_request`, `merge` is `push` to the default branch (read it from the repository or the pipeline's existing `push` branches), `schedule` is `schedule` (reuse the pipeline's cron or the request's, else the template's weekly cron, and say so in the summary), `release` is `release` of type `published`, and `manual-dispatch` is `workflow_dispatch`. Limit the evaluation job with an `if:` on the event when the workflow carries more events than the tier's checks name. When an event is new to the workflow, give each job that existed before an `if:` limiting it to the events it already ran on, and name the guard in the summary.
8. **Timeout.** `timeout-minutes` is 30 for the `pr` and `merge` jobs and 120 for `scheduled` and `release`, whose live checks spend model calls. Raise it when a `gate` check's `timeoutMs` and the rest of the job's work exceed it.
9. **Credentials.** The plan carries none, and live tiers can need model credentials. Do not invent secret names. List the credential needs in the summary as a next step.

Other platforms get the same structure in their own idiom: a job or stage per tier, one step per distinct command, and the evidence kept whatever the result.

| Platform       | Evidence kept whatever the result                                |
| -------------- | ---------------------------------------------------------------- |
| `gitlab-ci`    | `artifacts:` with `when: always` and the `runs/` path            |
| `jenkins`      | `post { always { archiveArtifacts ... } }` over the `runs/` path |
| `azure-devops` | a `PublishPipelineArtifact@1` task with `condition: always()`    |
| `harness`      | an upload step with `when: stageStatus: All`                     |
| `circle-ci`    | `store_artifacts` on a step with `when: always`                  |

---

## 4. Re-render Without Duplicating

A run replaces what an earlier run wrote. Find the jobs whose id starts with `evaluation-` and that carry a `# tea-evaluation-plan:` marker. Replace each one whose plan still exists and holds checks on its tier. Remove one only when its plan file is gone or the plan no longer places a check on its tier. A job whose plan is refused or unreadable stays as it is and is reported as stale. Leave every other job as it is.

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

- Every plan found was validated or reported, and each valid plan is rendered with one step per distinct command and an `if: always()` upload of its `runs/` folder

### ❌ SYSTEM FAILURE:

- A plan rendered by copying its tier table into the pipeline or this skill
- A check moved to another tier, or an evaluation step marked `continue-on-error`
- Edit mode writing the create run's checkpoint
- Skipped sequence steps or missing outputs
  **Master Rule:** Skipping steps is FORBIDDEN.
