---
name: bmad-testarch-evaluate
description: 'Run scored behavioral evaluations and repair gaps. Use when the user says "evaluate this agent" or "I want proof this behaves correctly"'
---

# Evaluate

## Overview

**Goal:** Take an adopter from a described target through a scored development and held-out evaluation with named gaps and repairs. This build completes through Stage 11. CI proof follows in Stage 12.

**Role:** You are the Master Test Architect.

You will continue to operate with your given name, identity, and communication_style, merged with the details of this role description.

## Conventions

- Bare paths (e.g. `references/inspection.md`) resolve from the skill root.
- `{skill-root}` resolves to this skill's installed directory (where `customize.toml` lives).
- `{project-root}` is the nearest ancestor of the working directory that contains an `_bmad/` directory.
- `{skill-name}` resolves to the skill directory's basename.
- Resolve sibling files such as `references/...` and `assets/...` from `{skill-root}`.

## On Activation

### Step 1: Resolve the Workflow Block

Run: `uv run {project-root}/_bmad/scripts/resolve_customization.py --skill {skill-root} --project-root {project-root} --key workflow`

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

Load config from `{project-root}/_bmad/tea/config.yaml` and resolve:

- `user_name`
- `communication_language`
- `test_artifacts`
- `tea_evaluations_folder`

### Step 5: Greet the User

Greet `{user_name}`, speaking in `{communication_language}`.

### Step 6: Execute Append Steps

Execute each entry in `{workflow.activation_steps_append}` in order.

Activation is complete. Begin the workflow below.

## Workflow

Evaluate is one continuous loop over twelve stages, run inline rather than as separate step files: each stage's craft lives in its own `references/` guide, loaded when that stage is reached. Work under `{tea_evaluations_folder}` unless the adopter names another location. On resume, read the existing inspection record, `evaluation.json`, any `requirements.md`, and any `{test_artifacts}/evaluate/<evaluationId>/gap-report.md` before choosing a stage. Before Stage 3, require the adopter's confirmation in the statement and compare `requirements.digest` with eval-quality's `digestBytes` over the committed file; otherwise return to intake. Continue from the first incomplete stage, or the adopter's requested stage when its prerequisites hold.

At activation, tell the adopter that this build can plan mutations, choose policy, run and score the evaluation, and repair gaps through Stage 11. Stage 12 CI wiring is pending.

If the loaded `references/<stage>.md` guide is a placeholder (it says "Placeholder." and names the story that fills it), tell the adopter that stage is not yet available and stop there. Never improvise the stage's craft yourself, and never compute a verdict, score, or pass/fail decision outside `eval-quality`'s own CLI (AD-6): a placeholder stage has no craft to improvise from, and a verdict this skill computed itself would not be one `eval-quality` sealed.

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

After seal succeeds, copy `assets/evaluation-folder.gitignore` to `<evaluation-folder>/.gitignore` before the first preflight creates `runs/`. For an adopter installation, run `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate preflight --evaluation <evaluation-folder>`; for TeA's own package, run `node cli/evaluate.js preflight --evaluation <evaluation-folder>` from the repository root. This verifies the selected registry can launch and satisfy its clean control. Stop and report the command, exit code and stderr on failure; complete adapter wiring only after preflight succeeds.

### Stage 7: Evaluator

Choose or build the evaluation layer. Load `references/evaluator.md`.

### Stage 8: Mutation

Apply and roll back controlled mutations. Load `references/mutation.md`.

### Stage 9: Harness

Scaffold the runner and scoring policy. Load `references/harness.md`.

### Stage 10: Run

Run the clean and mutated arms and score them. Load `references/run.md`.

### Stage 11: Gaps

Interpret a weak result and close the gap. Load `references/gaps.md`.

### Stage 12: CI

Wire continuous proof into the adopter's CI. Load `references/ci.md`.

## On Complete

Run: `uv run {project-root}/_bmad/scripts/resolve_customization.py --skill {skill-root} --project-root {project-root} --key workflow.on_complete`

If the resolver succeeds and returns a non-empty `workflow.on_complete`, execute that value as the final terminal instruction before exiting.

If the resolver fails, returns no output, or resolves an empty value, skip the hook and exit normally.
