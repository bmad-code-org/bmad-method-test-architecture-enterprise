---
name: 'step-01-load-context'
description: 'Load NFR requirements, evidence sources, and knowledge base, and resolve run identity'
nextStepFile: '{skill-root}/steps-c/step-02-define-thresholds.md'
resumeStepFile: '{skill-root}/steps-c/step-01b-resume.md'
knowledgeIndex: './resources/tea-index.csv'
outputFile: '{test_artifacts}/nfr/nfr-assessment-{run_key}.md'
---

# Step 1: Load Context & Knowledge Base

## STEP GOAL

Gather NFR requirements, evidence sources, and knowledge fragments needed for the evidence audit, and resolve the run identity that names this run's output file.

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`
- 🚫 Halt if implementation or evidence is unavailable

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

## 1. Prerequisites

- Implementation accessible for evaluation
- Evidence sources available (test results, metrics, logs)

If missing: **HALT** and request the missing inputs.

---

## 2. Load Configuration

From `{config_source}`:

- Read `tea_browser_automation`

---

### Deterministic Knowledge Selection

The fragment list for this step is a closed set. Start empty, evaluate the complete conditions under **Load Knowledge Base Fragments**, and add every fragment from each matching list. A config flag opens a branch only when every stack, runner, package, and relevance condition on that branch also matches. Do not add fragments from tier labels, index descriptions, nearby mentions, general usefulness, or possible future need. Deduplicate while preserving the order below. Identical facts and config must produce an identical list.

## 3. Load Knowledge Base Fragments

From `{knowledgeIndex}` load:

- `adr-quality-readiness-checklist.md`
- `ci-burn-in.md`
- `test-quality.md`
- `playwright-config.md`
- `error-handling.md`

**Playwright CLI (if `tea_browser_automation` is "cli" or "auto"):**

- `playwright-cli.md`

**MCP Patterns (if `tea_browser_automation` is "mcp" or "auto"):**

- (existing MCP-related fragments, if any are added in future)

---

## 4. Load Artifacts

If available, read:

- `tech-spec.md` (primary NFRs)
- `PRD.md` (product-level NFRs)
- `story` or `test-design` docs (feature-level NFRs); test-design outputs live in `{test_artifacts}/test-design/`, with the legacy root `{test_artifacts}/` as fallback

---

## 5. Confirm Inputs

Summarize loaded NFR sources and evidence availability.

---

## 6. Resolve Run Identity

Every run writes its audit to a file whose name carries the run's scope, so an audit for one story or epic is never overwritten by, or merged into, an audit for another. Resolve `run_scope` and `run_key` **now**, before anything is saved.

`run_key` takes one of these forms:

- `system`: the whole project or system, or no narrower scope could be resolved.
- `epic-{epic_num}`: one epic.
- `story-{story_key}`: one story. `story_key` is the BMM story file basename without `.md` (for example `1-2-user-authentication`). Without a story file, use the story id with `.` replaced by `-` (`1.2` becomes `1-2`).

Slug rule (used for an epic title with no number): lowercase; replace every run of characters outside `a-z` and `0-9` with a single `-`; trim leading and trailing `-`; truncate to 64 characters.

Resolve the scope in this order:

1. Use the scope the user named in this invocation (a story, an epic, or the whole system).
2. Otherwise take the scope carried by the artifacts loaded above: the story file name for a story, or the epic number from the epic document's metadata, H1 heading, or filename for an epic. An epic with no number uses the slug of its title in place of `epic_num`.
3. If several candidate scopes remain in an interactive run, list them and ask the user which one this audit covers. **Halt** until they answer. A headless or autonomous run that cannot resolve a single scope uses `system` and states that choice in the audit's output.

Set `run_scope` to `story`, `epic`, or `system` to match the resolved form, and set `run_key` accordingly.

Carry `run_scope` and `run_key` forward through every remaining step. Later steps never re-derive them.

---

## 7. Check for an Existing Output

Check whether `{outputFile}` already exists. A file at this path belongs to a previous run of the **same** scope; audits for other scopes live under their own filenames and are never read or written by this run.

- **Does not exist:** this is a fresh run. Proceed to Save Progress.
- **Exists with `workflowStatus: 'in-progress'`:** a previous run for this scope was interrupted. Display its `lastStep` and `lastSaved`, then ask:

  > "An unfinished NFR evidence audit for `{run_key}` was last saved {lastSaved} at step {lastStep}. Resume it, or start over? Starting over replaces the file."

  **Halt** until the user answers. If they resume, load `{resumeStepFile}`, read it completely, and execute it. If they start over, replace `{outputFile}` entirely in Save Progress. A headless run starts over.

- **Exists with `workflowStatus: 'completed'`:** a finished audit for this scope. Replace `{outputFile}` entirely in Save Progress.

**Never merge two runs into one file.** Findings, evidence, and a `stepsCompleted` array carried over from a prior run would make the audit report evidence and steps this run never examined.

---

## 8. Save Progress

**Save this step's accumulated work to `{outputFile}`.**

Create the `{test_artifacts}/nfr/` folder if it does not exist. Write the file using the workflow template (if available), replacing any prior content as decided in the previous section, with YAML frontmatter:

```yaml
---
runScope: '{run_scope}'
runKey: '{run_key}'
workflowStatus: 'in-progress'
stepsCompleted: ['step-01-load-context']
lastStep: 'step-01-load-context'
lastSaved: '{date}'
---
```

Then write this step's output below the frontmatter.

`runScope` and `runKey` are this run's identity. Later steps carry both forward unchanged, and Resume mode refuses to continue a file whose `runKey` does not match the run being resumed.

**Update `inputDocuments`**: Set `inputDocuments` in the output template frontmatter to the list of artifact paths loaded in this step (e.g., knowledge fragments, test design documents, configuration files).

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs
- `run_scope` and `run_key` resolved before the first save, and the audit written to the path they name
- Any pre-existing audit for this scope was reported to the user and either resumed or replaced

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
- Saving before run identity is resolved, or writing to an output path that carries no run identity
- Appending this run's work to an audit left by a previous run
  **Master Rule:** Skipping steps is FORBIDDEN.
