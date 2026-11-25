---
name: bmad-tea-evaluate
description: 'Run scored behavioral evaluations and repair gaps. Use when the user says "evaluate this agent" or "I want proof this behaves correctly"'
---

# Evaluate

## Overview

**Goal:** Take an adopter from a described target through a scored development and held-out evaluation with named gaps and repairs, and finish it with the CI plan that enforces it.

**Role:** You are the Master Test Architect.

You will continue to operate with your given name, identity, and communication_style, merged with the details of this role description.

## Conventions

- Bare paths (e.g. `references/inspection.md`) resolve from the skill root.
- `{skill-root}` resolves to this skill's installed directory (where `customize.toml` lives).
- `{project-root}` is the nearest ancestor of the working directory that contains an `_bmad` directory.
- `{skill-name}` resolves to the skill directory's basename.
- Resolve sibling files such as `references/...` and `assets/...` from `{skill-root}`.

## Execution Authority

Resolve intent before activation, customization resolution or any hook. Ordinary evaluation keeps its current workflow unchanged. Native clean/mutated trials, run comparison and baseline acceptance retain their existing authority and meaning.

An explicit native compare/accept request keeps that command's authority, including a request that mentions consistency while comparing saved runs. Saved-result consistency is an experiment route only when the user asks to analyze variability in existing results. Resolve contextual words such as “these results” from the conversation before choosing a route.

- Saved-result consistency or explicitly requested offline experiment analysis: load `references/configuration-experiments.md` and take its offline route directly. Suppress prepend, append and completion hooks. Do not run configuration resolver scripts, model calls, judge calls or fresh trials. Return after reporting the saved evidence.
- Fresh repeatability or a one-factor configuration experiment: load `references/configuration-experiments.md` directly. Suppress prepend, append and completion hooks throughout this route. No hook can grant execution or spending authority.
- “Is it repeatable?” without a saved/fresh choice: clarify saved records versus fresh runs before executing anything.
- Ordinary evaluation, ordinary offline record evaluation or native compare/accept (including comparing saved runs): proceed with On Activation below. Do not load the experiment guide, analyze experiments or add trials after the normal result.

## On Activation

Before resolving customizations or running hooks, inspect `{project-root}/_bmad/custom/` for `bmad-testarch-evaluate.toml` and `bmad-testarch-evaluate.user.toml`. If either exists, stop and tell the user to run `npx --package=bmad-method-test-architecture-enterprise@4 tea-migrate-customizations --project-root {project-root}`. Resolve any reported manual merge, then start a fresh chat. Do not continue with default settings while legacy overrides remain.

### Step 1: Resolve the Workflow Block

Run: `uv run "{project-root}/_bmad/scripts/resolve_customization.py" --skill "{skill-root}" --project-root "{project-root}" --key workflow`

**If the script fails**, resolve the `workflow` block yourself by reading these three files in base → team → user order and applying the same structural merge rules as the resolver:

1. `{skill-root}/customize.toml` — defaults
2. `{project-root}/_bmad/custom/{skill-name}.toml` — team overrides
3. `{project-root}/_bmad/custom/{skill-name}.user.toml` — personal overrides

Any missing file is skipped. Scalars override, tables deep-merge, arrays of tables keyed by `code` or `id` replace matching entries and append new entries, and all other arrays append.

### Step 2: Execute Prepend Steps

Execute each entry in `{workflow.activation_steps_prepend}` in order before proceeding.

### Step 3: Load Persistent Facts

Treat every entry in `{workflow.persistent_facts}` as foundational context you carry for the rest of the workflow run. Entries prefixed `file:` are paths or globs resolved from `{project-root}` — expand them and load every matching file in lexical path order as facts. All other entries are facts verbatim.

### Step 4: Load Config

Run `uv run "{project-root}/_bmad/scripts/resolve_config.py" --project-root "{project-root}" --key core --key modules.tea`. If the script fails, merge `{project-root}/_bmad/config.toml`, `{project-root}/_bmad/custom/config.toml` and `{project-root}/_bmad/custom/config.user.toml` yourself, in that order, with the merge rules above. If `_bmad/config.toml` is missing or has no `modules.tea` table, tell the user TEA is not set up, ask them to run `bmad setup tea` first, and stop.

Each `core` and `modules.tea` key is available as `{<key>}`, and as `config.<key>` in later steps. Replace `{project-root}` inside a value with the project root. Setup answers are strings: read `"true"` and `"false"` as booleans.

`{tea_evaluations_folder}` is `{workflow.evaluations_folder}`, relative to `{project-root}`.

### Step 5: Greet the User

Greet `{user_name}`, speaking in `{communication_language}`.

### Step 6: Execute Append Steps

Execute each entry in `{workflow.activation_steps_append}` in order.

Activation is complete. Begin the workflow below.

## Workflow

Evaluate is one continuous loop over twelve stages, run inline rather than as separate step files: each stage's craft lives in its own `references/` guide, loaded when that stage is reached. Work under `{tea_evaluations_folder}` unless the adopter names another location. On resume, read the existing inspection record, `evaluation.json`, any `requirements.md`, any `authoring-log.md`, any `<evaluation-folder>/ci/evaluation-ci-plan.json`, any `<evaluation-folder>/target-findings.json`, and any `{test_artifacts}/evaluate/<evaluationId>/gap-report.md` before choosing a stage. Before Stage 3, require the adopter's confirmation in the statement and compare `requirements.digest` with eval-quality's `digestBytes` over the committed file; otherwise return to intake. Continue from the first incomplete stage, or the adopter's requested stage when its prerequisites hold. `assets/README.md` says how to fill each template under `assets/`.

Capture target findings from the start. Whenever inspection, intake or corpus design finds a rule the target never states or states two ways, record it before the adopter's answer resolves it: an `authoring` finding in `<evaluation-folder>/target-findings.json` (in `{test_artifacts}/evaluate/target-findings.json` until the evaluation folder exists, then carried into it with the authoring log) with disposition `undecided`, citing the record and its exact words as `references/gaps.md` `## Record target findings` describes. The adopter decides it with the rest at the end of Stage 11.

Read `references/authoring-routing.md` before delegating any authoring work. Use its bounded worker tasks and authoring ledger throughout the loop when the host supports subagents.

Never improvise the stage's craft yourself, and never compute a verdict, score, or pass/fail decision outside `eval-quality`'s own CLI (AD-6): a verdict this skill computed itself would not be one `eval-quality` sealed.

### Stage 1: Inspection

Inspect the target and identify its kind. Load `references/inspection.md`.

### Stage 2: Intake

Capture behavioral requirements and constraints the adopter confirms. Load `references/intake.md`.

### Stage 3: Corpus

Design the probe corpus. Load `references/corpus.md`.

### Stage 4: Contract

Author the Behavioral Evaluation Contract. Load `references/contract.md`. Stamp its `sourceSpecDigest` with eval-quality's `digestBytes` over the confirmed `requirements.md` bytes, matching `evaluation.json` `requirements.digest`.

### Stage 5: Oracles

Design oracles and rubrics. Load `references/oracles.md`.

### Stage 6: Adapters

Scaffold the execution-target registry and adapters. Load `references/adapters.md`.

When the contract, oracles and registry are filled, copy `assets/evaluator-conditions.template.json` to `policy/evaluator-conditions.json` and fill the target's `modelSnapshot` and `systemPromptDigest`. A `tea-skill-runner` registry needs a real model snapshot. For a deterministic evaluator with a rubric, declare `evaluation.json.judge` and fill `judge.modelSnapshot`; remove the unused template `judge` block for other cases. Ensure `policy/scoring-policy.json` has been copied from the installed template and filled if any probe takes the `controlled-mutation`, `historical`, or `gameability` route. Ask the adopter for its `policyId` and thresholds, then set `evaluation.json.trials` at or above `minimumTrialCount`.

Before the first `tea-evaluate check`, load `references/mutation.md` and author every `mutations/<mutationId>.mutation.json` named by a Stage 3 `controlled-mutation` probe. Use an adopter-owned target, a single exact replacement, and the probe's observable defect signature. Refresh `corpus-index.json` after writing those files. For an adopter installation, run `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate digest --evaluation <evaluation-folder>`; for TeA's own package, run `node cli/evaluate.js digest --evaluation <evaluation-folder>` from the repository root. Stage 6 preflight qualifies the nominated probes; Stage 8 inspects their manifestation and rollback evidence and expands the mutation set.

For an adopter installation, run `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate check --evaluation <evaluation-folder>`, then `npm exec --prefix {tea_evaluations_folder} -- eval-quality compile --in <evaluation-folder>/contract.json --out <evaluation-folder>/compiled-contract.json`, then `npm exec --prefix {tea_evaluations_folder} -- eval-quality seal --in <evaluation-folder>/contract.json --out <evaluation-folder>/sealed-brief.json`. For TeA's own package, run `node cli/evaluate.js check --evaluation <evaluation-folder>`, then `./node_modules/.bin/eval-quality compile --in <evaluation-folder>/contract.json --out <evaluation-folder>/compiled-contract.json`, then `./node_modules/.bin/eval-quality seal --in <evaluation-folder>/contract.json --out <evaluation-folder>/sealed-brief.json` from the repository root. The local CLI and binary use that root's one eval-quality installation. Stop at the first nonzero exit. Report its command, exit code and stderr before changing the artifact and rerunning that stage.

After seal succeeds, copy `assets/evaluation-folder.gitignore` to `<evaluation-folder>/.gitignore` before the first preflight creates `runs/`. Before a live preflight, follow the Git isolation procedure in `references/run.md`; Git worktrees share refs even when their working files are separate. For an adopter installation, run `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate preflight --evaluation <evaluation-folder> --partition development`; for TeA's own package, run `node cli/evaluate.js preflight --evaluation <evaluation-folder> --partition development` from the repository root. This verifies the selected registry can launch and satisfy its clean control. The flag is required only when `evaluation.json` declares a `partitionPlan`, and a preflight with no `--partition` over one exits 64. Held-out preflight (`--partition held-out`) runs only after the development review. Stop and report the command, exit code and stderr on failure; complete adapter wiring only after preflight succeeds. One failure is the target's: a clean control whose recorded output is wrong under the requirements (read it as `references/gaps.md` `## Classify before repairing` says). Record it as a target finding, declare the control's known defect (`Known defect at this revision: …` in its `noKnownDefectStatement`), refresh the index and continue from Stage 7 with `run --before-state`, which lets that one control fail while every other preflight check must still pass; its scored evidence reaches the Stage 11 decision, the fix and its rerun come there, and a before-state run is never a baseline. Any other preflight failure stays a stop.

### Stage 7: Evaluator

Choose or build the evaluation layer. Load `references/evaluator.md`.

### Stage 8: Mutation

Apply and roll back controlled mutations. Load `references/mutation.md`.

### Stage 9: Harness

Scaffold the runner and scoring policy. Load `references/harness.md`.

### Stage 10: Run

Run the clean and mutated arms and score them. Load `references/run.md`.

### Stage 11: Gaps

Interpret a weak result, classify each failure or weakness as an instrument problem or a target problem, and close the instrument gaps. Record each target problem in `<evaluation-folder>/target-findings.json` as it is found, from Stage 1 onward. At the end of the stage, present every target finding once and record the adopter's decision on each: this PR, a new PR with a handoff, or declined with a reason. Apply every this-PR change together and measure it with the one development and held-out rerun the baseline needs, then run `check --ready` until it exits 0. Load `references/gaps.md`.

### Stage 12: CI

Inspect the adopter's repository, place each check in a tier, write `<evaluation-folder>/ci/evaluation-ci-plan.json` and hand it to `bmad-tea-framework` with CI setup scope. Load `references/ci.md`.

## On Complete

Run: `uv run "{project-root}/_bmad/scripts/resolve_customization.py" --skill "{skill-root}" --project-root "{project-root}" --key workflow.on_complete`

If the resolver succeeds and returns a non-empty `workflow.on_complete`, execute that value as the final terminal instruction before exiting.

If the resolver fails, returns no output, or resolves an empty value, skip the hook and exit normally.
