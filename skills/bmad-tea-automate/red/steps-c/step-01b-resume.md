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

Resolve the named story from the invocation. In a headless run with no story named in the invocation, use the `ticket` reference supplied by the calling build. Treat that reference as the named story. If a story was named, resolve `story_key` and `run_key` as `step-01-preflight-and-context.md` does before selecting any checkpoint.

If `resume_checkpoint_path` is set, select that exact readable file before building a candidate list. Do not list, substitute, or ask to choose another checkpoint. Proceed directly to section 2 and apply its identity and legacy migration checks. A supplied checkpoint path is not a named target scope; only a separately supplied story, epic, feature, target or system request triggers the scope identity comparison.

Each run writes its own checklist at `{outputFile}`, and its `run_key` is `story-{story_key}`. Build the candidate list:

1. List every file matching `{progressGlob}`.
2. Also list every file matching `{legacyProgressGlob}`. Runs from before ATDD checklists moved into the `atdd/` folder wrote to the `{test_artifacts}/` root under the same file name, so a named story's legacy checklist is `{legacyOutputFile}`. A legacy root checklist is a candidate only while it is in progress: read its `workflowStatus`, or infer it from `lastStep` as section 2 describes when the field is absent. A completed legacy checklist stays where it is and is never moved or deleted.

Identify each candidate's story by its frontmatter `storyKey`, falling back to the `{story_key}` part of its file name. If a folder checklist and an in-progress legacy root checklist name the same story, they form one candidate for that story. Selecting it selects the legacy checklist, so the legacy checklist migration in section 2 asks which file to keep.

Then select one:

- **No candidates:** display "⚠️ **No previous progress found.** There is no ATDD checklist to resume from. Please use **[C] Create** to start a fresh workflow run." **Halt.**

- **A story was named:** select the candidate with the resolved `story_key`. If none exists, display "⚠️ **No progress found for `{run_key}`.** Checklists exist for: {list of candidate run keys}. Use **[C] Create** to start a run for `{run_key}`, or name one of the listed stories." **Halt.** Never fall back to another story's checklist.

- **Exactly one candidate and no story named:** select it and state which story it belongs to before continuing.

- **More than one candidate and no story named:** a headless run halts with "Multiple ATDD checklists exist. Supply the story reference to resume." In an interactive run, list each candidate with its story key, `lastStep`, and `lastSaved`, and ask which run to resume. **Halt** until the user answers.

---

### 2. Load the Selected Checklist

**Run identity check.** Read the identity fields before inspecting progress. For a legacy checklist, recover its story key from `storyKey` or, if absent, its `atdd-checklist-{story_key}.md` filename. Halt if the story key cannot be recovered. When a story was named, compare the checklist's story key with the resolved `story_key`, and compare any existing `runKey` with `run_key`. If either differs, report the two identities and halt before reading or reporting progress. A missing legacy `runKey` proceeds to migration once the story key matches.

**Legacy checklist migration.** A checklist selected from `{legacyProgressGlob}`, or any checklist without `runKey`, predates run identity. ATDD checklists always recorded their story, so the identity is recoverable:

1. Use the story key recovered and checked above.
2. Set `run_scope` to `story` and `run_key` to `story-{story_key}`.
3. If the checklist came from the legacy root and `{outputFile}` already exists for that story, verify the folder checklist has the same `storyKey` and `runKey` before choosing either file. In an interactive run, list both files with their `lastSaved` and ask which one to keep. **Halt** until the user answers. Keeping the folder checklist deletes the legacy file and continues from `{outputFile}`; keeping the legacy checklist continues with item 4. A headless run keeps the folder checklist, leaves the legacy file untouched, and says so.
4. Create the `{test_artifacts}/atdd/` folder if it does not exist, and write the checklist's content to `{outputFile}` with `storyKey`, `runScope`, and `runKey` set in its frontmatter and `atddChecklistPath` set to `{outputFile}`.
5. If the checklist came from the legacy root, delete the legacy file only after that write succeeds. Continue from the migrated file.

After any migration, require the final checklist's `runKey` to equal `story-{storyKey}` and both keys to match the named story when supplied. Halt on a missing or mismatched identity before reading progress. If no story was named, adopt the final checklist's identity.

Bind `outputFile` and `atddChecklistPath` to the selected checklist's exact path after any migration. Preserve this path for all subsequent progress saves, even when it is outside `{test_artifacts}`. Refresh the stored `atddChecklistPath` to this exact path on the next progress save so the implementation handoff names the resumed checklist.

Read the remaining frontmatter after the identity check:

- `runScope` is always `story` for ATDD.
- `workflowStatus`, `stepsCompleted`, `lastStep`, and `lastSaved` describe the saved progress.
- `storyId`, `storyFile`, and `ticketRef` identify the story source. Older checklists may omit `ticketRef`.

If `workflowStatus` is missing (legacy checklist), infer it from `lastStep`: `'step-05-validate-and-complete'` means `completed`; any other known step means `in-progress`.

---

For a story run, read `{tea-contracts}/story-identity.md` before continuing: a named story is resolved by its sections 1 and 4 for the identity check, `ticketRef` locates the story when `storyFile` is empty or gone, and section 5 governs every citation the checkpoint carries (read through `resolvedSources`; report, never follow, an `unresolved` one). This holds on every resume path, named or not.

### 3. Display Progress Dashboard

Display:

"📋 **Workflow Resume — Acceptance Test-Driven Development**

**Run:** {runKey} ({runScope})
**Story:** {storyId} (`{storyFile}` or `{ticketRef}`)
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

- The requested story determined which checklist to resume. An ambiguous headless resume halted with the missing input.
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
