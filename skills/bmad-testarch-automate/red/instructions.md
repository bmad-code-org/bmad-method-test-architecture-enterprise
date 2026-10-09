<!-- Powered by BMAD-CORE™ -->

# Acceptance Test-Driven Development (ATDD)

**Version**: 5.0 (Step-File Architecture)

---

## Overview

Generates **red-phase acceptance test scaffolds** before implementation (TDD red phase), plus an implementation checklist. Produces tests at appropriate levels (E2E/API/Component) with supporting fixtures and helpers.

---

## WORKFLOW ARCHITECTURE

This workflow uses **step-file architecture**:

- **Micro-file Design**: Each step is self-contained
- **JIT Loading**: Only the current step file is in memory
- **Sequential Enforcement**: Execute steps in order without skipping

---

## INITIALIZATION SEQUENCE

This instruction file owns red mode after canonical activation.
Set `test_mode = red` when a direct runner loads this file without the shared router; keep `{skill-root}` canonical.
Resolve red customization using `{skill-root}/../bmad-testarch-atdd/customize.toml` and the legacy ATDD overrides.
When that sibling is absent, merge `{skill-root}/red/customize.toml` with `_bmad/custom/bmad-testarch-atdd.toml` and `.user.toml` manually and retain its workflow block.
Entry activation and operation routing remain in `{skill-root}/SKILL.md`.

### 1. Configuration Loading

From `{skill-root}/red/workflow.yaml`, resolve:

- `date` (`test_artifacts`, `user_name`, `communication_language` and `document_output_language` come from activation)
- `test_dir`

### 2. First Create Step

Load, read completely, and execute:
`{skill-root}/red/steps-c/step-01-preflight-and-context.md`

### 3. Resume Support

If the user selects **Resume** mode, load, read completely, and execute:
`{skill-root}/red/steps-c/step-01b-resume.md`

Each run writes one checklist per story at `{test_artifacts}/atdd/atdd-checklist-{story_key}.md`, with `runScope: story` and `runKey: story-{story_key}` in its frontmatter. Resume selects the checklist for the story being resumed (moving a legacy `{test_artifacts}/atdd-checklist-{story_key}.md` into the `atdd/` folder first), reads its progress tracking frontmatter, and routes to the next incomplete step.

## Create Execution and Healing

After generation and aggregation, the selected mode's Create terminal step reads `{skill-root}/resources/run-and-heal.md` completely. That resource is authoritative for running generated tests, classifying results, scoped repairs and completion evidence. Resolve `auto_validate` and `auto_heal_failures` to true by default, `max_healing_iterations` to 3 with a maximum of three, and `use_mcp_healing` to true for available diagnosis tools only. Explicit run instructions take priority over `modules.tea` settings. Validation disabled means no execution/healing; healing disabled or zero rounds means execution without repairs.

Load the retained `healing_rounds_used` and settings before any Resume progress write; initialize zero at first loop entry, including legacy Resume with no counter and no prior repair evidence. Otherwise retain the saved count, and report an inconsistent budget without more repairs if prior repair evidence has no valid count. Persist an incremented round count before repairing confirmed defects in this run's generated tests/support. Preserve acceptance criteria, exact business assertions and production source. Never add skip, `test.fixme()`, expected-failure annotations, weakened assertions, increased test timeouts or SUT success mocks to suppress a failure. Stop within the retained budget and report unresolved test failures, product defects and environment blockers with their evidence.

Expand seeks passing generated coverage. Red executes disposable activated copies, preserving correct intended failures and every permanent scaffold skip call and business assertion. Confirmed wrong-reason repairs update the owned permanent generated files, which are re-copied and re-activated before each re-run. Red selects the compatible available verifier or the project-native runner as the shared resource directs, with original configuration/environment and fresh per-test evidence. Summary completion records the actual execution status; generation completion cannot imply passing coverage or verified red.

Validate and Edit follow their canonical operation routes. Neither operation loads this Create loop, repairs tests or requires a passing full suite. Validate reports available evidence and unmet criteria; Edit checks only the changed outputs.
