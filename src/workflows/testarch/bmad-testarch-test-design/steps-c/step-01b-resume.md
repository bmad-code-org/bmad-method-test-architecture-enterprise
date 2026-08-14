---
name: 'step-01b-resume'
description: 'Resume an interrupted run from its own checkpoint, matched by run identity'
outputFile: '{test_artifacts}/test-design-progress-{run_key}.md'
progressGlob: '{test_artifacts}/test-design-progress-*.md'
legacyOutputFile: '{test_artifacts}/test-design-progress.md'
---

# Step 1b: Resume Workflow

## STEP GOAL

Resume an interrupted workflow by selecting the checkpoint that belongs to the run being resumed, loading its progress, displaying it, and routing to the next incomplete step.

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`

---

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 📖 Load the next step only when instructed

## CONTEXT BOUNDARIES:

- Available context: progress checkpoints written by previous runs
- Focus: Select the correct run's checkpoint, load its progress, and route to the next step
- Limits: Do not re-execute completed steps; do not resume a checkpoint belonging to a different run
- Dependencies: A checkpoint must exist from a previous run of the same scope

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

### 1. Select the Run to Resume

Each run writes its own checkpoint at `{outputFile}`, where `run_key` is `system` for system-level runs and `epic-{epic_num}` for epic-level runs. Build the candidate list:

1. List every file matching `{progressGlob}`.
2. Also check `{legacyOutputFile}`. Runs from before checkpoints carried run identity wrote to that fixed name.

Then select one:

- **No candidates:** display "⚠️ **No previous progress found.** There is no checkpoint to resume from. Please use **[C] Create** to start a fresh workflow run." **Halt.**

- **The user named a scope in this invocation** (a specific epic, or system-level): resolve `run_key` exactly as `step-01-detect-mode.md` does, then select `{outputFile}` for that key. If no checkpoint exists for it, display "⚠️ **No progress found for `{run_key}`.** Checkpoints exist for: {list of candidate run keys}. Use **[C] Create** to start a run for `{run_key}`, or name one of the listed scopes." **Halt.** Never fall back to another scope's checkpoint.

- **Exactly one candidate and no scope named:** select it and state which run it belongs to before continuing.

- **More than one candidate and no scope named:** list each candidate with its `runKey`, `lastStep`, and `lastSaved`, and ask which run to resume. **Halt** until the user answers.

---

### 2. Load the Selected Checkpoint

Read the selected checkpoint and parse YAML frontmatter for:

- `runScope` — `system-level` or `epic-level`
- `runKey` — this run's identity
- `workflowStatus` — overall workflow state (`in-progress` or `completed`)
- `totalSteps` — total number of create-mode workflow steps
- `stepsCompleted` — array of completed step names
- `lastStep` — last completed step name
- `nextStep` — next step file to execute
- `lastSaved` — timestamp of last save

**Run identity check.** When the user named a scope in this invocation, `runKey` must equal the `run_key` resolved for it. If it does not, display "⚠️ **Checkpoint belongs to a different run** (`{runKey}`, not `{run_key}`). Refusing to resume." **Halt.** Do not read its progress state and do not report its `workflowStatus`. When the user named no scope, adopt the checkpoint's own `runScope` and `runKey` as this run's identity.

**Legacy checkpoint migration.** If `runKey` is absent, the checkpoint predates run identity and cannot be proven to belong to any scope. Ask the user which run it covers (a specific epic, or system-level) and **halt** until they answer. Resolve `run_scope` and `run_key` from their answer exactly as `step-01-detect-mode.md` does, write the checkpoint's content to `{outputFile}` with `runScope` and `runKey` added, delete `{legacyOutputFile}`, and continue from the migrated file.

If `workflowStatus`, `totalSteps`, or `nextStep` are missing (legacy progress file), infer them from `lastStep` using this mapping:

- `'step-01-detect-mode'` → `workflowStatus: 'in-progress'`, `totalSteps: 5`, `nextStep: './step-02-load-context.md'`
- `'step-02-load-context'` → `workflowStatus: 'in-progress'`, `totalSteps: 5`, `nextStep: './step-03-risk-and-testability.md'`
- `'step-03-risk-and-testability'` → `workflowStatus: 'in-progress'`, `totalSteps: 5`, `nextStep: './step-04-coverage-plan.md'`
- `'step-04-coverage-plan'` → `workflowStatus: 'in-progress'`, `totalSteps: 5`, `nextStep: './step-05-generate-output.md'`
- `'step-05-generate-output'` → `workflowStatus: 'completed'`, `totalSteps: 5`, `nextStep: ''`

---

### 3. Display Progress Dashboard

Display:

"📋 **Workflow Resume — Test Design and Risk Assessment**

**Run:** {runKey} ({runScope})
**Workflow status:** {workflowStatus}
**Last saved:** {lastSaved}
**Last completed step:** {lastStep}
**Next step:** {nextStep || 'None'}
**Steps completed:** {stepsCompleted.length} of {totalSteps}"

---

### 4. Route to Next Step

If `workflowStatus` is `'completed'`, display:
"✅ **All steps completed.** Use **[V] Validate** to review outputs or **[E] Edit** to make revisions."

**THEN:** Halt.

If `nextStep` is one of the known create-mode step files below, load it, read completely, and execute:

- `./step-02-load-context.md`
- `./step-03-risk-and-testability.md`
- `./step-04-coverage-plan.md`
- `./step-05-generate-output.md`

**If `nextStep` is empty or does not match a known step file**, display:
"⚠️ **Unknown progress state** (`workflowStatus`: {workflowStatus}, `lastStep`: {lastStep}, `nextStep`: {nextStep}). Please use **[C] Create** to start fresh."

**THEN:** Halt.

The existing content in the selected checkpoint provides context from previously completed steps. Every later step continues writing to that same checkpoint, so `runScope` and `runKey` stay unchanged for the rest of the run.

---

## 🚨 SYSTEM SUCCESS/FAILURE METRICS

### ✅ SUCCESS:

- The checkpoint belonging to the requested run was selected, and any ambiguity was resolved by asking
- Checkpoint loaded and parsed correctly
- Explicit or legacy progress state resolved correctly
- Progress dashboard displayed accurately, including run identity
- Routed to correct next step

### ❌ SYSTEM FAILURE:

- Resuming a checkpoint whose `runKey` differs from the run being resumed
- Silently picking one checkpoint when several exist
- Not loading the checkpoint
- Incorrect progress display
- Routing to wrong step
- Re-executing completed steps

**Master Rule:** Resume MUST route to the exact next incomplete step of the run it was asked to resume. Never re-execute completed steps, and never continue another run's checkpoint.
