---
name: 'step-01b-resume'
description: 'Resume an interrupted run from its own story checklist, matched by run identity'
outputFile: '{test_artifacts}/atdd/atdd-checklist-{story_key}.md'
progressGlob: '{test_artifacts}/atdd/atdd-checklist-*.md'
legacyOutputFile: '{test_artifacts}/atdd-checklist-{story_key}.md'
legacyProgressGlob: '{test_artifacts}/atdd-checklist-*.md'
---

# Step 1b: Resume Workflow

## STEP GOAL

Resume an interrupted workflow by selecting the checklist that belongs to the story being resumed, loading its progress, displaying it, and routing to the next incomplete step.

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`

---

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 📖 Load the next step only when instructed

## CONTEXT BOUNDARIES:

- Available context: ATDD checklists written by previous runs
- Focus: Select the correct story's checklist, load its progress, and route to the next step
- Limits: Do not re-execute completed steps; do not resume a checklist belonging to a different story
- Dependencies: A checklist must exist from a previous run for the same story

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

### 1. Select the Run to Resume

Each run writes its own checklist at `{outputFile}`, and its `run_key` is `story-{story_key}`. Build the candidate list:

1. List every file matching `{progressGlob}`.
2. Also list every file matching `{legacyProgressGlob}`. Runs from before ATDD checklists moved into the `atdd/` folder wrote to the `{test_artifacts}/` root under the same file name, so a named story's legacy checklist is `{legacyOutputFile}`.

Identify each candidate's story by its frontmatter `storyKey`, falling back to the `{story_key}` part of its file name. If a folder checklist and a legacy root checklist name the same story, the folder checklist is the candidate; leave the legacy file untouched and mention that it exists.

Then select one:

- **No candidates:** display "⚠️ **No previous progress found.** There is no ATDD checklist to resume from. Please use **[C] Create** to start a fresh workflow run." **Halt.**

- **The user named a story in this invocation:** resolve `story_key` and `run_key` exactly as `step-01-preflight-and-context.md` does, then select the candidate for that story. If none exists, display "⚠️ **No progress found for `{run_key}`.** Checklists exist for: {list of candidate run keys}. Use **[C] Create** to start a run for `{run_key}`, or name one of the listed stories." **Halt.** Never fall back to another story's checklist.

- **Exactly one candidate and no story named:** select it and state which story it belongs to before continuing.

- **More than one candidate and no story named:** list each candidate with its story key, `lastStep`, and `lastSaved`, and ask which run to resume. **Halt** until the user answers.

---

### 2. Load the Selected Checklist

Read the selected checklist and parse YAML frontmatter for:

- `runScope` — always `story` for ATDD
- `runKey` — this run's identity, `story-{story_key}`
- `workflowStatus` — overall workflow state (`in-progress` or `completed`)
- `stepsCompleted` — array of completed step names
- `lastStep` — last completed step name
- `lastSaved` — timestamp of last save
- `storyId`, `storyKey`, `storyFile` — the story this checklist covers

**Run identity check.** When the user named a story in this invocation, `runKey` must equal the `run_key` resolved for it, and `storyKey` must equal the resolved `story_key`. If either differs, display "⚠️ **Checklist belongs to a different story** (`{runKey}`, not `{run_key}`). Refusing to resume." **Halt.** Do not read its progress state and do not report its `workflowStatus`. When the user named no story, adopt the checklist's own `storyKey`, `runScope`, and `runKey` as this run's identity.

**Legacy checklist migration.** A checklist selected from `{legacyProgressGlob}`, or any checklist without `runKey`, predates run identity. ATDD checklists always recorded their story, so the identity is recoverable:

1. Set `story_key` to the checklist's `storyKey`, or to the `{story_key}` part of its file name when `storyKey` is absent. If the user named a story and it differs, apply the run identity check above and halt.
2. Set `run_scope` to `story` and `run_key` to `story-{story_key}`.
3. Create the `{test_artifacts}/atdd/` folder if it does not exist, and write the checklist's content to `{outputFile}` with `runScope` and `runKey` added to its frontmatter and `atddChecklistPath` set to `{outputFile}`.
4. If the checklist came from the legacy root, delete the legacy file. Continue from the migrated file.

If `workflowStatus` is missing (legacy checklist), infer it from `lastStep`: `'step-05-validate-and-complete'` means `completed`; any other known step means `in-progress`.

---

### 3. Display Progress Dashboard

Display:

"📋 **Workflow Resume — Acceptance Test-Driven Development**

**Run:** {runKey} ({runScope})
**Story:** {storyId} (`{storyFile}`)
**Workflow status:** {workflowStatus}
**Last saved:** {lastSaved}"

Then display progress with ✅/⬜ indicators:

1. ✅/⬜ Preflight & Context (step-01-preflight-and-context)
2. ✅/⬜ Generation Mode (step-02-generation-mode)
3. ✅/⬜ Test Strategy (step-03-test-strategy)
4. ✅/⬜ Generate Tests + Aggregate (step-04c-aggregate)
5. ✅/⬜ Validate & Complete (step-05-validate-and-complete)

---

### 4. Route to Next Step

If `workflowStatus` is `'completed'`, display:
"✅ **All steps completed.** Use **[V] Validate** to review outputs or **[E] Edit** to make revisions."

**THEN:** Halt.

Based on `lastStep`, load the next incomplete step:

- `'step-01-preflight-and-context'` → load `./step-02-generation-mode.md`
- `'step-02-generation-mode'` → load `./step-03-test-strategy.md`
- `'step-03-test-strategy'` → load `./step-04-generate-tests.md`
- `'step-04c-aggregate'` → load `./step-05-validate-and-complete.md`

**If `lastStep` does not match any value above**, display: "⚠️ **Unknown progress state** (`workflowStatus`: {workflowStatus}, `lastStep`: {lastStep}). Please use **[C] Create** to start fresh." Then halt.

**Otherwise**, load the identified step file, read completely, and execute.

The existing content in the selected checklist provides context from previously completed steps. Every later step continues writing to that same checklist, so `runScope`, `runKey`, and `storyKey` stay unchanged for the rest of the run.

---

## 🚨 SYSTEM SUCCESS/FAILURE METRICS

### ✅ SUCCESS:

- The checklist belonging to the requested story was selected, and any ambiguity was resolved by asking
- A legacy root checklist was moved into `{test_artifacts}/atdd/` with `runScope` and `runKey` added before continuing
- Checklist loaded and parsed correctly
- Progress dashboard displayed accurately, including run identity
- Routed to correct next step

### ❌ SYSTEM FAILURE:

- Resuming a checklist whose `runKey` or `storyKey` differs from the story being resumed
- Silently picking one checklist when several exist
- Reading `{outputFile}` before `story_key` is resolved
- Not loading the checklist
- Incorrect progress display
- Routing to wrong step
- Re-executing completed steps

**Master Rule:** Resume MUST route to the exact next incomplete step of the story it was asked to resume. Never re-execute completed steps, and never continue another story's checklist.
