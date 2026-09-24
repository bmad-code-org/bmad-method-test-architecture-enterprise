---
name: 'step-01b-resume'
description: 'Resume an interrupted run from its own checkpoint, matched by run identity'
outputFile: '{test_artifacts}/test-design/test-design-progress-{run_key}.md'
progressGlob: '{test_artifacts}/test-design/test-design-progress-*.md'
legacyOutputFile: '{test_artifacts}/test-design-progress.md'
legacyScopedGlob: '{test_artifacts}/test-design-progress-*.md'
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
2. Also list every file matching `{legacyScopedGlob}`. Runs from before the `test-design/` folder wrote scoped checkpoints to the root of `{test_artifacts}`.
3. Also check `{legacyOutputFile}`. Runs from before checkpoints carried run identity wrote to that fixed name.

A legacy checkpoint from item 2 or 3 is a candidate only while it is in progress: read its `workflowStatus`, or infer it from `lastStep` as section 2 describes when the field is absent. A completed legacy checkpoint stays where it is and is never moved or deleted.

Then select one:

- **No candidates:** display "⚠️ **No previous progress found.** There is no checkpoint to resume from. Please use **[C] Create** to start a fresh workflow run." **Halt.**

- **The user named a scope in this invocation** (a specific epic, or system-level): resolve `run_key` exactly as `step-01-detect-mode.md` does, then select `{outputFile}` for that key. When only the pre-folder checkpoint `{test_artifacts}/test-design-progress-{run_key}.md` is a candidate for that key, select it. When neither exists and `{legacyOutputFile}` is a candidate, offer to migrate it to `{run_key}` and **halt** until the user answers; if they accept, select it. If nothing was selected for that key, display "⚠️ **No progress found for `{run_key}`.** Checkpoints exist for: {list of candidate run keys}. Use **[C] Create** to start a run for `{run_key}`, or name one of the listed scopes." **Halt.** Never fall back to another scope's checkpoint.

- **Exactly one candidate and no scope named:** select it and state which run it belongs to before continuing.

- **More than one candidate and no scope named:** list each candidate with its `runKey`, `lastStep`, and `lastSaved`, and ask which run to resume. **Halt** until the user answers.

---

### 2. Load the Selected Checkpoint

Read the selected checkpoint and parse YAML frontmatter for:

- `runScope` — `system` or `epic`. Checkpoints written before this rename carry `system-level` or `epic-level`; read those as `system` and `epic`.
- `runKey` — this run's identity
- `workflowStatus` — overall workflow state (`in-progress` or `completed`)
- `totalSteps` — total number of create-mode workflow steps
- `stepsCompleted` — array of completed step names
- `lastStep` — last completed step name
- `nextStep` — next step file to execute
- `lastSaved` — timestamp of last save

**Run identity check.** When the user named a scope in this invocation, `runKey` must equal the `run_key` resolved for it. If it does not, display "⚠️ **Checkpoint belongs to a different run** (`{runKey}`, not `{run_key}`). Refusing to resume." **Halt.** Do not read its progress state and do not report its `workflowStatus`. When the user named no scope, adopt the checkpoint's own `runScope` and `runKey` as this run's identity.

**Legacy checkpoint migration.** Migrate a selected checkpoint that lives outside the `test-design/` folder before continuing:

1. Resolve its run identity.
   - **Pre-folder scoped checkpoint** (matched `{legacyScopedGlob}`): it already carries `runScope` and `runKey`, so apply the run identity check above as for any other checkpoint.
   - **Fixed-name checkpoint** (`{legacyOutputFile}`): if `runKey` is absent, the checkpoint predates run identity and cannot be proven to belong to any scope, so the run identity check above does not apply to it. Use the scope the user named in this invocation. When they named none, ask which run it covers (a specific epic, or system-level) and **halt** until they answer. Resolve `run_scope` and `run_key` exactly as `step-01-detect-mode.md` does.
2. If `{outputFile}` already exists for that key, list both files with their `lastSaved` and ask which one to keep. **Halt** until the user answers. Keeping the folder checkpoint deletes the legacy checkpoint and continues from `{outputFile}`; keeping the legacy checkpoint continues with item 3. A headless run keeps the folder checkpoint, leaves the legacy checkpoint untouched, and says so.
3. Create the `{test_artifacts}/test-design/` folder if it does not exist and write the checkpoint to `{outputFile}`: a pre-folder scoped checkpoint unchanged, a fixed-name checkpoint with `runScope` and `runKey` added.
4. Only after that write succeeds, delete the legacy checkpoint. Continue from the migrated file.

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
