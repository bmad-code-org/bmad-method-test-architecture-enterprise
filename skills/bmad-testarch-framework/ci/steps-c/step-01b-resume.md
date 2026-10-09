---
name: 'step-01b-resume'
description: 'Resume interrupted workflow from last completed step'
outputFile: '{test_artifacts}/ci/ci-pipeline-progress.md'
legacyOutputFile: '{test_artifacts}/ci-pipeline-progress.md'
---

# Step 1b: Resume Workflow

## STEP GOAL

Resume an interrupted workflow by loading the existing progress document, displaying progress, verifying previously created artifacts, and routing to the next incomplete step.

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`

---

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 📖 Load the next step only when instructed

## CONTEXT BOUNDARIES:

- Available context: Output document with progress frontmatter
- Focus: Load progress and route to next step
- Limits: Do not re-execute completed steps
- Dependencies: Output document must exist from a previous run

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

### 1. Load Output Document

For an archived Create run, the coordinator first follows `resources/setup-state.md` section 1a to verify its immutable checkpoint snapshots, archive displaced history and restore the selected original checkpoint bytes. Load only that restored same-run checkpoint; a different run at the fixed path cannot supply this run's choices or worker position. A preservation or restore failure halts before migration, hooks or step dispatch.

A checkpoint that carries no `workflowStatus` predates that key: treat it as `'completed'` when its `lastStep` is `'step-04-validate-and-summary'`, and as `'in-progress'` otherwise.

**Legacy checkpoint migration.** Runs from older TEA versions wrote the checkpoint to `{legacyOutputFile}`, at the root of `{test_artifacts}`.
Migrate it only while it is in progress. A completed legacy checkpoint stays where it is and is never moved or deleted.

For explicit Resume of an in-progress archived legacy checkpoint restored through `setup-state.md` section 1a, first archive any displaced modern counterpart and verify the selected legacy checkpoint's identity and digest. Select that restored legacy checkpoint deterministically, including in headless mode, and execute items 2 and 3 below once before activation, journal adoption or saved next-step dispatch. Preserve its raw bytes and update the adopted journal's phase reference to `{outputFile}`. A completed archived legacy checkpoint stays at its restored legacy path with its saved phase reference and bypasses migration. The general conflict choice in item 1 applies to other in-progress legacy recovery. A saved pending-phase absence cannot consume any foreign checkpoint through either lookup path.

1. If `{outputFile}` also exists, list both files with their `lastSaved` and ask which one to keep. **Halt** until the user answers. Keeping the folder checkpoint deletes `{legacyOutputFile}` and continues from `{outputFile}`; keeping the legacy checkpoint continues with item 2. A headless run keeps the folder checkpoint, leaves `{legacyOutputFile}` untouched, and says so.
2. Create the `{test_artifacts}/ci/` folder if it does not exist and write the legacy checkpoint's content to `{outputFile}` unchanged.
3. Only after that write succeeds, delete `{legacyOutputFile}`. Tell the user the checkpoint was moved and continue from the moved file.

Read `{outputFile}` and parse YAML frontmatter for:

- `workflowStatus` — overall workflow state (`in-progress` or `completed`)
- `stepsCompleted` — array of completed step names
- `lastStep` — last completed step name
- `lastSaved` — timestamp of last save

**If `{outputFile}` does not exist and no in-progress `{legacyOutputFile}` exists**, display:

"⚠️ **No previous progress found.** There is no output document to resume from. Please use **[C] Create** to start a fresh workflow run."

**THEN:** Halt. Do not proceed.

---

### 2. Recover a Missing Legacy Contract and Verify Artifacts

When this recovered legacy Create checkpoint has no contract, follow `resources/setup-state.md` section 4's `setup_inventory_only` recovery before next-step dispatch. Read recorded choices and the actual project inventory, atomically journal the reconstructed contract, and retain the original `lastStep`/`stepsCompleted`. Contract recovery skips installs/tests, custom hooks, phase checkpoint writes and full preflight replay. Clear inventory mode, then verify artifacts and dispatch the original next incomplete step.

Since this is a file-creation workflow, verify that artifacts from completed steps still exist on disk:

- If `step-02-generate-pipeline` is in `stepsCompleted`, check that the pipeline config file exists (e.g., `.github/workflows/test.yml` or equivalent)
- If any expected artifact is missing, warn the user and suggest re-running from the step that creates it

---

### 3. Display Progress Dashboard

Display:

"📋 **Workflow Resume — CI/CD Pipeline Setup**

**Last saved:** {lastSaved}
**Steps completed:** {stepsCompleted.length} of 5

1. Preflight Checks (step-01-preflight) — {✅ if in stepsCompleted, ⬜ otherwise}
2. Generate Pipeline (step-02-generate-pipeline) — {✅ if in stepsCompleted, ⬜ otherwise}
3. Configure Quality Gates (step-03-configure-quality-gates) — {✅ if in stepsCompleted, ⬜ otherwise}
4. Render Evaluation Plans (step-03b-render-evaluation-plans) — {✅ if in stepsCompleted, ⬜ otherwise; when `lastStep` is `step-04-validate-and-summary` and this step is absent, "not run: checkpoint predates this step, use [E] Edit to render plans"}
5. Validate & Summary (step-04-validate-and-summary) — {✅ if in stepsCompleted, ⬜ otherwise}"

---

### 4. Route to Next Step

This loader handles legacy Create checkpoints lacking an operation-specific journal next position. After the read-only gate has recovered the applicable run and hook ledger, compute the next file using the table below and save that concrete next position in the run journal. Load that file directly once. A journal-backed Resume uses its saved next file/subsection directly and never redispatches through this loader or the shared router. Edit/Validate Resume always follows the journal's saved operation-specific target/report/position.

When the Create terminal's artifacts were saved but completion hooks remain unfinished, save `phase-handoff` or `canonical-completion` as applicable and load `{skill-root}/resources/setup-phase-completion.md` directly. If this phase is complete and the same recovered run has another pending/generated phase, dispatch that phase's original C/E/V entry or generated terminal directly. The completed-state halt below applies only after the selected run's phases and hooks have completed.

If `workflowStatus` is `'completed'`, display: "✅ **All steps completed.** Use **[V] Validate** to review outputs or **[E] Edit** to make revisions." Then halt.

Based on `lastStep`, load the next incomplete step:

- `'step-01-preflight'` → Load `{skill-root}/ci/steps-c/step-02-generate-pipeline.md`
- `'step-02-generate-pipeline'` → Load `{skill-root}/ci/steps-c/step-03-configure-quality-gates.md`
- `'step-03-configure-quality-gates'` → Load `{skill-root}/ci/steps-c/step-03b-render-evaluation-plans.md`
- `'step-03b-render-evaluation-plans'` → Load `{skill-root}/ci/steps-c/step-04-validate-and-summary.md`
- `'step-04-validate-and-summary'` → **Workflow already complete.** Display: "✅ **All steps completed.** Use **[V] Validate** to review outputs or **[E] Edit** to make revisions." Then halt.

**If `lastStep` does not match any value above**, display: "⚠️ **Unknown progress state** (`lastStep`: {lastStep}). Please use **[C] Create** to start fresh." Then halt.

**Otherwise**, load the identified step file, read completely, and execute.

The existing content in `{outputFile}` provides context from previously completed steps. Use it as reference for remaining steps.

---

## 🚨 SYSTEM SUCCESS/FAILURE METRICS

### ✅ SUCCESS:

- Output document loaded and parsed correctly
- Previously created artifacts verified
- Progress dashboard displayed accurately
- Routed to correct next step

### ❌ SYSTEM FAILURE:

- Not loading output document
- Incorrect progress display
- Routing to wrong step
- Re-executing completed steps

**Master Rule:** Resume MUST route to the exact next incomplete step. Never re-execute completed steps.
