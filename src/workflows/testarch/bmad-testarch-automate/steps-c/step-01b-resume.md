---
name: 'step-01b-resume'
description: 'Resume an interrupted run from its own automation summary, matched by run identity'
outputFile: '{test_artifacts}/automate/automation-summary-{run_key}.md'
progressGlob: '{test_artifacts}/automate/automation-summary-*.md'
legacyOutputFile: '{test_artifacts}/automation-summary.md'
---

# Step 1b: Resume Workflow

## STEP GOAL

Resume an interrupted workflow by selecting the automation summary that belongs to the run being resumed, loading its progress, displaying it, and routing to the next incomplete step.

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`

---

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 📖 Load the next step only when instructed

## CONTEXT BOUNDARIES:

- Available context: automation summaries written by previous runs
- Focus: Select the correct run's summary, load its progress, and route to the next step
- Limits: Do not re-execute completed steps; do not resume a summary belonging to a different run
- Dependencies: A summary must exist from a previous run of the same scope

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

### 1. Select the Run to Resume

Each run writes its own summary at `{outputFile}`, where `run_key` is `story-{story_key}`, `epic-{epic_num}`, `target-{slug}`, or `system`. Build the candidate list:

1. List every file matching `{progressGlob}`.
2. Also check `{legacyOutputFile}`. Runs from before summaries carried run identity wrote to that fixed name. It is a candidate only while it is in progress: read its `workflowStatus`, or infer it from `lastStep` as section 2 describes when the field is absent. A completed legacy summary stays where it is and is never moved or deleted.

Then select one:

- **No candidates:** display "⚠️ **No previous progress found.** There is no automation summary to resume from. Please use **[C] Create** to start a fresh workflow run." **Halt.**

- **The user named a scope in this invocation** (a story, an epic, a feature or path, or the whole system): resolve `run_key` exactly as `step-01-preflight-and-context.md` does, then select `{outputFile}` for that key. When it does not exist and `{legacyOutputFile}` is a candidate, offer to migrate the legacy summary to `{run_key}` and **halt** until the user answers; if they accept, select it. If nothing was selected for that key, display "⚠️ **No progress found for `{run_key}`.** Summaries exist for: {list of candidate run keys}. Use **[C] Create** to start a run for `{run_key}`, or name one of the listed scopes." **Halt.** Never fall back to another scope's summary.

- **Exactly one candidate and no scope named:** select it and state which run it belongs to before continuing.

- **More than one candidate and no scope named:** list each candidate with its `runKey` (or `legacy, scope unknown`), `lastStep`, and `lastSaved`, and ask which run to resume. **Halt** until the user answers.

---

### 2. Load the Selected Summary

Read the selected summary and parse YAML frontmatter for:

- `runScope` — `story`, `epic`, `target`, or `system`
- `runKey` — this run's identity
- `workflowStatus` — overall workflow state (`in-progress` or `completed`)
- `stepsCompleted` — array of completed step names
- `lastStep` — last completed step name
- `lastSaved` — timestamp of last save

**Run identity check.** When the user named a scope in this invocation, `runKey` must equal the `run_key` resolved for it. If it does not, display "⚠️ **Summary belongs to a different run** (`{runKey}`, not `{run_key}`). Refusing to resume." **Halt.** Do not read its progress state and do not report its `workflowStatus`. When the user named no scope, adopt the summary's own `runScope` and `runKey` as this run's identity.

**Legacy summary migration.** If the selected summary is `{legacyOutputFile}` and carries no `runKey`, it predates run identity and cannot be proven to belong to any scope, so the run identity check above does not apply to it. Migrate it before continuing:

1. Use the scope the user named in this invocation. When they named none, ask which run it covers (a story, an epic, a feature or path, or the whole system) and **halt** until they answer. Resolve `run_scope` and `run_key` exactly as `step-01-preflight-and-context.md` does.
2. If `{outputFile}` already exists for that key, list both files with their `lastSaved` and ask which one to keep. **Halt** until the user answers. Keeping the folder summary deletes `{legacyOutputFile}` and continues from `{outputFile}`; keeping the legacy summary continues with item 3. A headless run keeps the folder summary, leaves `{legacyOutputFile}` untouched, and says so.
3. Create the `{test_artifacts}/automate/` folder if it does not exist and write the summary's content to `{outputFile}` with `runScope` and `runKey` added.
4. Only after that write succeeds, delete `{legacyOutputFile}`. Continue from the migrated file.

If `workflowStatus` is missing (legacy summary), infer it from `lastStep`: `'step-04-validate-and-summarize'` means `completed`; any other known step means `in-progress`.

---

### 3. Display Progress Dashboard

Display:

"📋 **Workflow Resume — Test Automation Expansion**

**Run:** {runKey} ({runScope})
**Workflow status:** {workflowStatus}
**Last saved:** {lastSaved}"

Then display progress with ✅/⬜ indicators:

1. ✅/⬜ Preflight & Context (step-01-preflight-and-context)
2. ✅/⬜ Identify Targets (step-02-identify-targets)
3. ✅/⬜ Generate Tests + Aggregate (step-03c-aggregate)
4. ✅/⬜ Validate & Summarize (step-04-validate-and-summarize)

---

### 4. Route to Next Step

If `workflowStatus` is `'completed'`, display:
"✅ **All steps completed.** Use **[V] Validate** to review outputs or **[E] Edit** to make revisions."

**THEN:** Halt.

Based on `lastStep`, load the next incomplete step:

- `'step-01-preflight-and-context'` → load `./step-02-identify-targets.md`
- `'step-02-identify-targets'` → load `./step-03-generate-tests.md`
- `'step-03c-aggregate'` → load `./step-04-validate-and-summarize.md`

**If `lastStep` does not match any value above**, display: "⚠️ **Unknown progress state** (`workflowStatus`: {workflowStatus}, `lastStep`: {lastStep}). Please use **[C] Create** to start fresh." Then halt.

**Otherwise**, load the identified step file, read completely, and execute.

The existing content in the selected summary provides context from previously completed steps. Every later step continues writing to that same summary, so `runScope` and `runKey` stay unchanged for the rest of the run.

---

## 🚨 SYSTEM SUCCESS/FAILURE METRICS

### ✅ SUCCESS:

- The summary belonging to the requested run was selected, and any ambiguity was resolved by asking
- A legacy `{legacyOutputFile}` was migrated into `{test_artifacts}/automate/` with `runScope` and `runKey` added before continuing
- Summary loaded and parsed correctly
- Progress dashboard displayed accurately, including run identity
- Routed to correct next step

### ❌ SYSTEM FAILURE:

- Resuming a summary whose `runKey` differs from the run being resumed
- Silently picking one summary when several exist
- Not loading the summary
- Incorrect progress display
- Routing to wrong step
- Re-executing completed steps

**Master Rule:** Resume MUST route to the exact next incomplete step of the run it was asked to resume. Never re-execute completed steps, and never continue another run's summary.
