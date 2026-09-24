---
name: 'step-01b-resume'
description: 'Resume an interrupted run from its own output file, matched by run identity'
outputFile: '{test_artifacts}/nfr/nfr-assessment-{run_key}.md'
progressGlob: '{test_artifacts}/nfr/nfr-assessment-*.md'
legacyOutputFile: '{test_artifacts}/nfr-assessment.md'
---

# Step 1b: Resume Workflow

## STEP GOAL

Resume an interrupted workflow by selecting the output document that belongs to the run being resumed, loading its progress, displaying it, and routing to the next incomplete step.

## MANDATORY EXECUTION RULES

- Read the entire step file before acting
- Speak in `{communication_language}`

---

## EXECUTION PROTOCOLS:

- Follow the MANDATORY SEQUENCE exactly
- Load the next step only when instructed

## CONTEXT BOUNDARIES:

- Available context: output documents with progress frontmatter written by previous runs
- Focus: Select the correct run's output document, load its progress, and route to the next step
- Limits: Do not re-execute completed steps; do not resume an output document belonging to a different run
- Dependencies: An output document must exist from a previous run of the same scope

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly.

### 1. Select the Run to Resume

Each run writes its own output document at `{outputFile}`, where `run_key` is `system`, `epic-{epic_num}`, or `story-{story_key}`. Build the candidate list:

1. List every file matching `{progressGlob}`.
2. Also check `{legacyOutputFile}`. Runs from before output files carried run identity wrote to that fixed name. It is a candidate only while it is in progress: read its `workflowStatus`, or infer it from `lastStep` as section 2 describes when the field is absent. A completed legacy file stays where it is and is never moved or deleted.

Then select one:

- **No candidates:** display "No previous progress found. There is no output document to resume from. Please use **[C] Create** to start a fresh workflow run." **Halt.**

- **The user named a scope in this invocation** (a story, an epic, or the whole system): resolve `run_key` exactly as `step-01-load-context.md` does, then select `{outputFile}` for that key. When it does not exist and `{legacyOutputFile}` is a candidate, offer to migrate the legacy file to `{run_key}` and **halt** until the user answers; if they accept, select it. If nothing was selected for that key, display "**No progress found for `{run_key}`.** Output documents exist for: {list of candidate run keys}. Use **[C] Create** to start a run for `{run_key}`, or name one of the listed scopes." **Halt.** Never fall back to another scope's output document.

- **Exactly one candidate and no scope named:** select it and state which run it belongs to before continuing.

- **More than one candidate and no scope named:** list each candidate with its `runKey`, `lastStep`, and `lastSaved`, and ask which run to resume. **Halt** until the user answers.

---

### 2. Load the Selected Output Document

Read the selected output document and parse YAML frontmatter for:

- `runScope` -- `story`, `epic`, or `system`
- `runKey` -- this run's identity
- `workflowStatus` -- overall workflow state (`in-progress` or `completed`)
- `stepsCompleted` -- array of completed step names
- `lastStep` -- last completed step name
- `lastSaved` -- timestamp of last save

**Run identity check.** When the user named a scope in this invocation, `runKey` must equal the `run_key` resolved for it. If it does not, display "**Output document belongs to a different run** (`{runKey}`, requested `{run_key}`). Refusing to resume." **Halt.** Do not read its progress state and do not report its `workflowStatus`. When the user named no scope, adopt the document's own `runScope` and `runKey` as this run's identity.

**Legacy output migration.** If the selected document is `{legacyOutputFile}` and carries no `runKey`, it predates run identity and cannot be proven to belong to any scope, so the run identity check above does not apply to it. Migrate it before continuing:

1. Use the scope the user named in this invocation. When they named none, ask which run it covers (a story, an epic, or the whole system) and **halt** until they answer. Resolve `run_scope` and `run_key` exactly as `step-01-load-context.md` does.
2. If `{outputFile}` already exists for that key, list both files with their `lastSaved` and ask which one to keep. **Halt** until the user answers. Keeping the folder file deletes `{legacyOutputFile}` and continues from `{outputFile}`; keeping the legacy file continues with item 3. A headless run keeps the folder file, leaves `{legacyOutputFile}` untouched, and says so.
3. Create the `{test_artifacts}/nfr/` folder if it does not exist and write the legacy document's content to `{outputFile}` with `runScope` and `runKey` added.
4. Only after that write succeeds, delete `{legacyOutputFile}`. Continue from the migrated file.

If `workflowStatus` is missing (legacy output document), infer it from `lastStep`: `'step-05-generate-report'` means `completed`; every other step means `in-progress`.

---

### 3. Display Progress Dashboard

Display progress with checkmark/empty indicators:

```text
NFR Evidence Audit - Resume Progress:

Run: {runKey} ({runScope})
Workflow status: {workflowStatus}

1. Load Context (step-01-load-context)                    [completed/pending]
2. Define Thresholds (step-02-define-thresholds)           [completed/pending]
3. Gather Evidence (step-03-gather-evidence)               [completed/pending]
4. Evaluate & Aggregate (step-04e-aggregate-nfr)           [completed/pending]
5. Generate Report (step-05-generate-report)               [completed/pending]

Last saved: {lastSaved}
```

---

### 4. Route to Next Step

Based on `lastStep`, load the next incomplete step:

| lastStep                    | Next Step File                    |
| --------------------------- | --------------------------------- |
| `step-01-load-context`      | `./step-02-define-thresholds.md`  |
| `step-02-define-thresholds` | `./step-03-gather-evidence.md`    |
| `step-03-gather-evidence`   | `./step-04-evaluate-and-score.md` |
| `step-04e-aggregate-nfr`    | `./step-05-generate-report.md`    |
| `step-05-generate-report`   | **Workflow already complete.**    |

**If `lastStep` is the final step** (`step-05-generate-report`), display: "All steps completed. Use **[C] Create** to start fresh, **[V] Validate** to review outputs, or **[E] Edit** to make revisions." Then halt.

**If `lastStep` does not match any value above**, display: "Unknown progress state (`lastStep`: {lastStep}). Please use **[C] Create** to start fresh." Then halt.

**Otherwise**, load the identified step file, read completely, and execute.

The existing content in the selected output document provides context from previously completed steps. Every later step continues writing to that same document, so `runScope` and `runKey` stay unchanged for the rest of the run.

---

## SYSTEM SUCCESS/FAILURE METRICS

### SUCCESS:

- The output document belonging to the requested run was selected, and any ambiguity was resolved by asking
- Output document loaded and parsed correctly
- Progress dashboard displayed accurately, including run identity
- Routed to correct next step

### FAILURE:

- Resuming an output document whose `runKey` differs from the run being resumed
- Silently picking one output document when several exist
- Not loading output document
- Incorrect progress display
- Routing to wrong step

**Master Rule:** Resume MUST route to the exact next incomplete step of the run it was asked to resume. Never re-execute completed steps, and never continue another run's output document.
