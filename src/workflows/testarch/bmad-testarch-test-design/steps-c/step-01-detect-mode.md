---
name: 'step-01-detect-mode'
description: 'Determine system-level vs epic-level mode, resolve run identity, and validate prerequisites'
nextStepFile: '{skill-root}/steps-c/step-02-load-context.md'
resumeStepFile: '{skill-root}/steps-c/step-01b-resume.md'
outputFile: '{test_artifacts}/test-design-progress-{run_key}.md'
---

# Step 1: Detect Mode & Prerequisites

## STEP GOAL

Determine whether to run **System-Level** or **Epic-Level** test design, resolve the run identity that names this run's progress checkpoint, and confirm required inputs are available.

## MANDATORY EXECUTION RULES

### Universal Rules

- 📖 Read this entire step file before taking any action
- ✅ Speak in `{communication_language}`
- 🚫 Do not load the next step until this step is complete

### Role Reinforcement

- ✅ You are the **Master Test Architect**
- ✅ You prioritize risk-based, evidence-backed decisions

---

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 💾 Record outputs before proceeding
- 📖 Load the next step only when instructed

## CONTEXT BOUNDARIES:

- Available context: config, loaded artifacts, and knowledge fragments
- Focus: this step's goal only
- Limits: do not execute future steps
- Dependencies: prior steps' outputs (if any)

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

## 1. Mode Detection (Priority Order)

### A) User Intent (Highest Priority)

Use explicit intent if the user already indicates scope:

- **PRD + ADR (no epic/stories)** → **System-Level Mode**
- **Epic + Stories (no PRD/ADR)** → **Epic-Level Mode**
- **Both PRD/ADR + Epic/Stories** → Prefer **System-Level Mode** first

If intent is unclear, ask:

> "Should I create (A) **System-level** test design (PRD + ADR → Architecture + QA docs), or (B) **Epic-level** test design (Epic → single test plan)?"

### B) File-Based Detection (BMad-Integrated)

If user intent is unclear:

- If `{implementation_artifacts}/sprint-status.yaml` exists → **Epic-Level Mode**
- Otherwise → **System-Level Mode**

### C) Ambiguous → Ask

If mode still unclear, ask the user to choose (A) or (B) and **halt** until they respond.

---

## 2. Prerequisite Check (Mode-Specific)

### System-Level Mode Requires:

- PRD (functional + non-functional requirements)
- ADR or architecture decision records
- Architecture or tech-spec document

### Epic-Level Mode Requires:

- Epic and/or story requirements with acceptance criteria
- Architecture context (if available)

### HALT CONDITIONS

If required inputs are missing **and** the user cannot provide them:

- **System-Level**: "Please provide PRD + ADR/architecture docs to proceed."
- **Epic-Level**: "Please provide epic/story requirements or acceptance criteria to proceed."

---

## 3. Confirm Mode

State which mode you will use and why. Then proceed.

---

## 4. Resolve Run Identity

Every run writes a progress checkpoint whose filename carries the run's identity, so an interrupted run for one scope is never clobbered by a run for another. Resolve `run_scope` and `run_key` **now**, before any progress is saved.

### System-Level Mode

Set `run_scope` to `system-level` and `run_key` to `system`. A project has one system-level test design, so every system-level run shares this checkpoint.

### Epic-Level Mode

Set `run_scope` to `epic-level`, then resolve `epic_num` here rather than at output time:

1. Use the epic the user named in this invocation.
2. Otherwise take the epic number from the epic and story documents identified in the prerequisite check, reading it from document metadata, the H1 heading, or the filename.
3. If `epic_num` is still ambiguous, list the candidate epics and ask the user which one this run covers. **Halt** until they answer.

Set `run_key` to `epic-{epic_num}`.

If the epic carries no number, derive a stable slug from its title and use that in place of the number:

- lowercase the title
- collapse runs of whitespace to a single `-`
- strip every character that is not alphanumeric or `-`
- trim leading and trailing hyphens
- truncate to 64 characters

Carry `epic_num`, `run_scope`, and `run_key` forward through every remaining step. Step 5 writes `{test_artifacts}/test-design-epic-{epic_num}.md` from the same `epic_num`, so a plan and its checkpoint always name the same run.

---

## 5. Check for an Existing Checkpoint

Check whether `{outputFile}` already exists. A checkpoint at this path belongs to a previous run of the **same** scope; checkpoints for other scopes live under their own filenames and are never read or written here.

- **Does not exist:** this is a fresh run. Proceed to Save Progress.
- **Exists with `workflowStatus: 'in-progress'`:** a previous run for this scope was interrupted. Display its `lastStep` and `lastSaved`, then ask:

  > "An unfinished test-design run for `{run_key}` was last saved {lastSaved} at step {lastStep}. Resume it, or start over? Starting over replaces the checkpoint."

  **Halt** until the user answers. If they resume, load `{resumeStepFile}`, read it completely, and execute it. If they start over, replace `{outputFile}` entirely in Save Progress.

- **Exists with `workflowStatus: 'completed'`:** a finished run for this scope. Replace `{outputFile}` entirely in Save Progress.

**Never merge two runs into one checkpoint.** A `stepsCompleted` array carried over from a prior run makes the resume dashboard and its routing report steps this run never performed.

---

### 6. Save Progress

**Save this step's accumulated work to `{outputFile}`.**

Write the file with YAML frontmatter, replacing any prior content as decided in the previous section:

```yaml
---
runScope: '{run_scope}'
runKey: '{run_key}'
workflowStatus: 'in-progress'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode']
lastStep: 'step-01-detect-mode'
nextStep: '{nextStepFile}'
lastSaved: '{date}'
---
```

Then write this step's output below the frontmatter.

`runScope` and `runKey` are this run's identity. Later steps carry both forward unchanged, and Resume mode refuses to continue a checkpoint whose `runKey` does not match the run being resumed.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs
- `run_scope` and `run_key` resolved before the first save, and the checkpoint written to the path they name
- Any pre-existing checkpoint for this scope was reported to the user and either resumed or replaced

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
- Saving progress before run identity is resolved, or writing to a checkpoint path that carries no run identity
- Appending this run's progress to a checkpoint left by a previous run
  **Master Rule:** Skipping steps is FORBIDDEN.
