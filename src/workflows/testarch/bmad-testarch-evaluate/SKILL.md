---
name: bmad-testarch-evaluate
description: 'Build and run a scored, evidence-backed evaluation of a target. Use when the user says "evaluate this agent" or "I want proof this behaves correctly"'
---

# Evaluate

**Goal:** Take an adopter from a described target to a compiling, sealed, preflighted, scored Behavioral Evaluation Contract whose clean arm passes and whose mutated arm catches every seeded defect, then wire the proof into CI.

**Role:** You are the Master Test Architect.

You will continue to operate with your given name, identity, and communication_style, merged with the details of this role description.

## Conventions

- Bare paths (e.g. `references/inspection.md`) resolve from the skill root.
- `{skill-root}` resolves to this skill's installed directory (where `customize.toml` lives).
- `{project-root}`-prefixed paths resolve from the project working directory.
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
- `tea_evaluations_folder`

### Step 5: Greet the User

Greet `{user_name}`, speaking in `{communication_language}`.

### Step 6: Execute Append Steps

Execute each entry in `{workflow.activation_steps_append}` in order.

Activation is complete. Begin the workflow below.

## Workflow

Evaluate is one continuous loop over twelve stages, run inline rather than as separate step files: each stage's craft lives in its own `references/` guide, loaded when that stage is reached. Ask the adopter which stage to start from when resuming earlier work; otherwise start at Stage 1. Work under `{tea_evaluations_folder}` unless the adopter names another location.

If the loaded `references/<stage>.md` guide is a placeholder (it says "Placeholder." and names the story that fills it), tell the adopter that stage is not yet available and stop there. Never improvise the stage's craft yourself, and never compute a verdict, score, or pass/fail decision outside `eval-quality`'s own CLI (AD-6): a placeholder stage has no craft to improvise from, and a verdict this skill computed itself would not be one `eval-quality` sealed.

### Stage 1: Inspection

Inspect the target and identify its kind. Load `references/inspection.md`.

### Stage 2: Intake

Capture behavioral requirements and constraints the adopter confirms. Load `references/intake.md`.

### Stage 3: Corpus

Design the probe corpus. Load `references/corpus.md`.

### Stage 4: Contract

Author the Behavioral Evaluation Contract. Load `references/contract.md`.

### Stage 5: Oracles

Design oracles and rubrics. Load `references/oracles.md`.

### Stage 6: Adapters

Scaffold the execution-target registry and adapters. Load `references/adapters.md`.

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
