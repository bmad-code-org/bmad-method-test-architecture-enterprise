---
name: 'step-01b-resume'
description: 'Resume an interrupted run from its own traceability matrix, matched by run identity'
outputFile: '{test_artifacts}/trace/traceability-matrix-{run_key}.md'
progressGlob: '{test_artifacts}/trace/traceability-matrix-*.md'
legacyOutputFile: '{test_artifacts}/traceability-matrix.md'
---

# Step 1b: Resume Workflow

## STEP GOAL

Resume an interrupted workflow by selecting the traceability matrix that belongs to the run being resumed, loading its progress, displaying it, and routing to the next incomplete step.

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`

---

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 📖 Load the next step only when instructed

## CONTEXT BOUNDARIES:

- Available context: traceability matrices with progress frontmatter written by previous runs
- Focus: Select the correct run's matrix, load its progress, and route to the next step
- Limits: Do not re-execute completed steps; do not resume a matrix belonging to a different run
- Dependencies: A matrix must exist from a previous run of the same scope

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

### 1. Select the Run to Resume

Each run writes its own matrix at `{outputFile}`, where `run_key` is `story-{story_key}`, `epic-{epic_key}` for a v7 epic, `epic-{epic_num}` for a v6 epic, `release-{slug}`, `hotfix-{slug}`, or `system`. Build the candidate list:

1. List every file matching `{progressGlob}`.
2. Also check `{legacyOutputFile}`. Runs from before outputs carried run identity wrote to that fixed name. It is a candidate only while it is in progress: read its `workflowStatus`, or infer it from `lastStep` as section 2 describes when the field is absent. A completed legacy matrix stays where it is and is never moved or deleted.

Then select one:

- **No candidates:** display "⚠️ **No previous progress found.** There is no output document to resume from. Please use **[C] Create** to start a fresh workflow run." **Halt.**

- **The user named a scope in this invocation** (a specific story, epic, release, or hotfix): resolve `run_key` exactly as `step-01-load-context.md` section 4 does, then select `{outputFile}` for that key. For a v7 epic, also apply the pre-change epic file rule below. When nothing is selected yet and `{legacyOutputFile}` is a candidate, offer to migrate the legacy matrix to `{run_key}` and **halt** until the user answers; if they accept, select it. If nothing was selected for that key, display "⚠️ **No progress found for `{run_key}`.** Matrices exist for: {list of candidate run keys}. Use **[C] Create** to start a run for `{run_key}`, or name one of the listed scopes." **Halt.** Never fall back to another scope's matrix.

- **Exactly one candidate and no scope named:** select it and state which run it belongs to before continuing.

- **More than one candidate and no scope named:** list each candidate with its `runKey`, `lastStep`, and `lastSaved`, and ask which run to resume. **Halt** until the user answers. A headless run halts with the list.

**Pre-change v7 epic file.** Runs from before v7 epic keys wrote a v7 epic's matrix as `{test_artifacts}/trace/traceability-matrix-epic-<epic id>.md`. When resuming a named v7 epic, also check that file for the epic's id:

1. The file is accepted only when its saved target names this epic: its `oracleSources` or `inputDocuments` cite a file inside this epic's folder (`initiative-<initiative>/tickets/<epic folder>/`). An epic number or a similar title alone is never evidence. A file that cites no file of any epic is not a candidate.
2. When the file names another initiative's epic, or `{outputFile}` for the new key and an accepted pre-change file are both candidates, list each file with its `runKey`, saved target, `lastStep`, and `lastSaved`, and ask which run to resume. **Halt** until the user answers. A headless run halts with the list.
3. When the accepted pre-change file is the only candidate, select it and say so.

A selected pre-change file keeps its stored `runScope`, `runKey`, and target for the rest of the run, so its summary and gate decision keep its own `run_key`. It has no `oracleGranularity`, so it resumes as a criterion-oracle run. An unnamed resume finds the same file through `{progressGlob}` and adopts its stored identity the same way.

---

### 2. Load the Selected Matrix

Read the selected matrix and parse YAML frontmatter for:

- `runScope`: `story`, `epic`, `release`, `hotfix`, or `system`
- `runKey`: this run's identity
- `targetType`, `targetId`, `targetLabel`: the gate target Step 1 resolved
- `workflowStatus`: overall workflow state (`in-progress` or `completed`)
- `stepsCompleted`: array of completed step names
- `lastStep`: last completed step name
- `lastSaved`: timestamp of last save
- `oracleGranularity`: `requirements` or `criteria`. A checkpoint with no `oracleGranularity` is a criterion-oracle run and resumes as one, with its rows and evidence unchanged. Resume never re-decides granularity; only a fresh run adopts requirement granularity.
- `oracleLedger`, and for a requirement-granularity run `criterionLedger`: the frozen ledgers Step 1 wrote, with parents, `priorityBasis`, and contributors. A resumed Step 3, 4, or 5 builds its rows from them and never rebuilds them from the ticket files.

**Run identity check.** When the user named a scope in this invocation, `runKey` must equal the `run_key` resolved for it. A pre-change v7 epic file that section 1 accepted passes this check through its saved target and keeps its stored `runKey`. If neither holds, display "⚠️ **Matrix belongs to a different run** (`{runKey}`, not `{run_key}`). Refusing to resume." **Halt.** Do not read its progress state and do not report its `workflowStatus`. When the user named no scope, adopt the matrix's own `runScope`, `runKey`, and target as this run's identity.

**Legacy matrix migration.** If the selected matrix is `{legacyOutputFile}` and carries no `runKey`, it predates run identity and cannot be proven to belong to any scope, so the run identity check above does not apply to it. Migrate it before continuing:

1. Use the scope the user named in this invocation. When they named none, ask which run it covers (a specific story, epic, release, or hotfix, or the whole system) and **halt** until they answer. Resolve the target, `run_scope`, and `run_key` exactly as `step-01-load-context.md` section 4 does.
2. If `{outputFile}` already exists for that key, list both files with their `lastSaved` and ask which one to keep. **Halt** until the user answers. Keeping the folder matrix deletes `{legacyOutputFile}` and continues from `{outputFile}`; keeping the legacy matrix continues with item 3. A headless run keeps the folder matrix, leaves `{legacyOutputFile}` untouched, and says so.
3. Create the `{test_artifacts}/trace/` folder if it does not exist and write the matrix's content to `{outputFile}` with `runScope`, `runKey`, `targetType`, `targetId`, and `targetLabel` added.
4. Only after that write succeeds, delete `{legacyOutputFile}`. Continue from the migrated file.

Leave the legacy summary and gate decision JSON files at the root of `{test_artifacts}` untouched: Step 5 of the resumed run writes this run's own summary and gate decision to `{e2e_trace_summary_output}` and `{gate_decision_output}`.

If `workflowStatus` is missing (legacy progress file), infer it from `lastStep`: `'step-05-gate-decision'` or no `lastStep` is `'completed'`, and every other step is `'in-progress'`.

---

For a story run, read `{tea-contracts}/story-identity.md` before continuing: a named story is resolved by its sections 1 and 4 for the identity check, `ticketRef` locates the story when `storyFile` is empty or gone, and section 5 governs every citation the checkpoint carries (read through `resolvedSources`; report, never follow, an `unresolved` one). This holds on every resume path, named or not.

### 3. Display Progress Dashboard

Display:

"📋 **Workflow Resume — Requirements Traceability & Quality Gate**

**Run:** {runKey} ({runScope})
**Target:** {targetLabel || targetId || 'None resolved'} ({targetType})
**Workflow status:** {workflowStatus}
**Last saved:** {lastSaved}
**Steps completed:** {stepsCompleted.length} of 5

1. Load Context (step-01-load-context) — {✅ if in stepsCompleted, ⬜ otherwise}
2. Discover Tests (step-02-discover-tests) — {✅ if in stepsCompleted, ⬜ otherwise}
3. Map Criteria (step-03-map-criteria) — {✅ if in stepsCompleted, ⬜ otherwise}
4. Analyze Gaps (step-04-analyze-gaps) — {✅ if in stepsCompleted, ⬜ otherwise}
5. Gate Decision (step-05-gate-decision) — {✅ if in stepsCompleted, ⬜ otherwise}"

---

### 4. Route to Next Step

If `workflowStatus` is `'completed'`, display:
"✅ **All steps completed.** Use **[V] Validate** to review outputs or **[E] Edit** to make revisions."

**THEN:** Halt.

Based on `lastStep`, load the next incomplete step:

- `'step-01-load-context'` → Load `./step-02-discover-tests.md`
- `'step-02-discover-tests'` → Load `./step-03-map-criteria.md`
- `'step-03-map-criteria'` → Load `./step-04-analyze-gaps.md`
- `'step-04-analyze-gaps'` → Load `./step-05-gate-decision.md`

**If `lastStep` does not match any value above**, display: "⚠️ **Unknown progress state** (`workflowStatus`: {workflowStatus}, `lastStep`: {lastStep}). Please use **[C] Create** to start fresh." Then halt.

**Otherwise**, load the identified step file, read completely, and execute.

The existing content in the selected matrix provides context from previously completed steps. Every later step continues writing to that same file, so `runScope`, `runKey`, and the target stay unchanged for the rest of the run, and Step 5 writes the summary and gate decision under the same `run_key`.

---

## 🚨 SYSTEM SUCCESS/FAILURE METRICS

### ✅ SUCCESS:

- The matrix belonging to the requested run was selected, and any ambiguity was resolved by asking
- Output document loaded and parsed correctly
- Explicit or legacy progress state resolved correctly
- Progress dashboard displayed accurately, including run identity
- Routed to correct next step

### ❌ SYSTEM FAILURE:

- Resuming a matrix whose `runKey` differs from the run being resumed
- Silently picking one matrix when several exist
- Not loading output document
- Incorrect progress display
- Routing to wrong step
- Re-executing completed steps

**Master Rule:** Resume MUST route to the exact next incomplete step of the run it was asked to resume. Never re-execute completed steps, and never continue another run's matrix.
