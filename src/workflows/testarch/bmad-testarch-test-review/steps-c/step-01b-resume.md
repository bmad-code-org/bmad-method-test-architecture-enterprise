---
name: 'step-01b-resume'
description: 'Resume an interrupted review from its own report, matched by run identity'
outputFile: '{test_artifacts}/test-review/test-review-{run_key}.md'
progressGlob: '{test_artifacts}/test-review/test-review-*.md'
legacyOutputFile: '{test_artifacts}/test-review.md'
---

# Step 1b: Resume Workflow

## STEP GOAL

Resume an interrupted workflow by selecting the report that belongs to the run being resumed, loading its progress, displaying it, and routing to the next incomplete step.

## MANDATORY EXECUTION RULES

- Read the entire step file before acting
- Speak in `{communication_language}`

---

## EXECUTION PROTOCOLS:

- Follow the MANDATORY SEQUENCE exactly
- Load the next step only when instructed

## CONTEXT BOUNDARIES:

- Available context: review reports with progress frontmatter written by previous runs
- Focus: Select the correct run's report, load its progress, and route to the next step
- Limits: Do not re-execute completed steps; do not resume a report belonging to a different run
- Dependencies: A report must exist from a previous run of the same scope

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly.

### 1. Select the Run to Resume

**When `output_file_override` is non-empty**, it IS `{outputFile}`, replacing the step frontmatter default. It is the only candidate: skip the candidate list below and select it. If it does not exist, display "No previous progress found. There is no output document at `{outputFile}` to resume from. Please use **[C] Create** to start a fresh workflow run." Then halt.

Otherwise, each run writes its own report at `{outputFile}`, where `run_key` is `story-{story_key}`, `epic-{epic_num}`, `system`, or `target-{slug}` as `step-01-load-context.md` resolves it. Build the candidate list:

1. List every file matching `{progressGlob}`, skipping validation reports (`test-review-validation-report-*.md`).
2. Also check `{legacyOutputFile}`. Runs from before reports carried run identity wrote to that fixed name.

Then select one:

- **No candidates:** display "No previous progress found. There is no output document to resume from. Please use **[C] Create** to start a fresh workflow run." Then halt.

- **The user named a scope in this invocation** (a story, an epic, the whole suite, or a reviewed file or directory): resolve `run_key` exactly as `step-01-load-context.md` does, then select `{outputFile}` for that key. If no report exists for it, display "No progress found for `{run_key}`. Reports exist for: {list of candidate run keys}. Use **[C] Create** to start a run for `{run_key}`, or name one of the listed scopes." Then halt. Never fall back to another scope's report.

- **Exactly one candidate and no scope named:** select it and state which run it belongs to before continuing.

- **More than one candidate and no scope named:** list each candidate with its `runKey` (or "legacy, no run identity"), `lastStep`, and `lastSaved`, and ask which run to resume. Halt until the user answers.

---

### 2. Load the Selected Report

Read the selected report and parse YAML frontmatter for:

- `runScope` -- `story`, `epic`, `system`, or `target`
- `runKey` -- this run's identity
- `workflowStatus` -- overall workflow state (`in-progress` or `completed`)
- `stepsCompleted` -- array of completed step names
- `lastStep` -- last completed step name
- `lastSaved` -- timestamp of last save

**Run identity check.** When the user named a scope in this invocation, `runKey` must equal the `run_key` resolved for it. If it does not, display "Report belongs to a different run (`{runKey}`, not `{run_key}`). Refusing to resume." Then halt. Do not read its progress state and do not report its `workflowStatus`. When the user named no scope, adopt the report's own `runScope` and `runKey` as this run's identity.

**Legacy report migration.** If `runKey` is absent, the report predates run identity and cannot be proven to belong to any scope. Ask the user which scope it covers (a story, an epic, the whole suite, or a reviewed file or directory) and halt until they answer. Resolve `run_scope` and `run_key` from their answer exactly as `step-01-load-context.md` does, then:

- **Selected from `{legacyOutputFile}`:** write its content to `{outputFile}` with `runScope` and `runKey` added, delete `{legacyOutputFile}`, and continue from the migrated file. If a report for the same `runKey` already exists in the `test-review/` folder, list both with their `lastSaved` and ask which one to keep. Halt until the user answers, then delete the other.
- **Selected through `output_file_override`:** add `runScope` and `runKey` to its frontmatter in place and continue from it. The override path is the caller's, so the report stays there.

If `workflowStatus` is missing (legacy report), infer it from `lastStep`: `step-04-generate-report` means `completed`, and any other step means `in-progress`.

---

### 3. Display Progress Dashboard

Display progress with checkmark/empty indicators:

```text
Test Quality Review - Resume Progress:

Run: {runKey} ({runScope})
Workflow status: {workflowStatus}

1. Load Context (step-01-load-context)              [completed/pending]
2. Discover Tests (step-02-discover-tests)           [completed/pending]
3. Quality Evaluation + Aggregate (step-03f-aggregate-scores) [completed/pending]
4. Generate Report (step-04-generate-report)         [completed/pending]

Last saved: {lastSaved}
```

---

### 4. Route to Next Step

If `workflowStatus` is `'completed'`, display: "All steps completed. Use **[C] Create** to start fresh, **[V] Validate** to review outputs, or **[E] Edit** to make revisions." Then halt.

Based on `lastStep`, load the next incomplete step:

| lastStep                    | Next Step File                    |
| --------------------------- | --------------------------------- |
| `step-01-load-context`      | `./step-02-discover-tests.md`     |
| `step-02-discover-tests`    | `./step-03-quality-evaluation.md` |
| `step-03f-aggregate-scores` | `./step-04-generate-report.md`    |
| `step-04-generate-report`   | **Workflow already complete.**    |

**If `lastStep` is the final step** (`step-04-generate-report`), display: "All steps completed. Use **[C] Create** to start fresh, **[V] Validate** to review outputs, or **[E] Edit** to make revisions." Then halt.

**If `lastStep` does not match any value above**, display: "Unknown progress state (`lastStep`: {lastStep}). Please use **[C] Create** to start fresh." Then halt.

**Otherwise**, load the identified step file, read completely, and execute.

The existing content in the selected report provides context from previously completed steps. Every later step continues writing to that same report, so `runScope` and `runKey` stay unchanged for the rest of the run.

---

## SYSTEM SUCCESS/FAILURE METRICS

### SUCCESS:

- The report belonging to the requested run was selected, and any ambiguity was resolved by asking
- A legacy report was migrated to its scoped path with `runScope` and `runKey` added
- Output document loaded and parsed correctly
- Progress dashboard displayed accurately, including run identity
- Routed to correct next step

### FAILURE:

- Resuming a report whose `runKey` differs from the run being resumed
- Silently picking one report when several exist
- Not loading output document
- Incorrect progress display
- Routing to wrong step
- Re-executing completed steps

**Master Rule:** Resume MUST route to the exact next incomplete step of the run it was asked to resume. Never re-execute completed steps, and never continue another run's report.
