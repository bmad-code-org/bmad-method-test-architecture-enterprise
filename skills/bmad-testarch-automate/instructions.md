<!-- Powered by BMAD-CORE™ -->

# Test Generation: Expand Mode

**Version**: 5.0 (Step-File Architecture)

---

## Overview

Expands test automation coverage by generating prioritized tests at the appropriate level (E2E, API, Component, Unit) with supporting fixtures and helpers.

Modes:

- **BMad-Integrated**: Uses story/PRD/test-design artifacts when available
- **Standalone**: Analyzes existing codebase without BMad artifacts

---

## WORKFLOW ARCHITECTURE

This workflow uses **step-file architecture** for disciplined execution:

- **Micro-file Design**: Each step is self-contained
- **JIT Loading**: Only the current step file is in memory
- **Sequential Enforcement**: Execute steps in order without skipping

---

## INITIALIZATION SEQUENCE

This instruction file owns expand mode after canonical activation.
Set `test_mode = expand` when a direct runner loads this file without the shared router; use the canonical `{skill-root}`.
Resolve the selected workflow customization from `{skill-root}/customize.toml` and its legacy automate overrides when the runner has not activated it.
Red mode uses `{skill-root}/red/instructions.md`; entry activation and operation routing remain in `SKILL.md`.

### 1. Configuration Loading

From `workflow.yaml`, resolve:

- `date` (`test_artifacts`, `user_name`, `communication_language` and `document_output_language` come from activation)
- `test_dir`, `source_dir`, `coverage_target`, `standalone_mode`

### 2. First Create Step

Load, read completely, and execute:
`{skill-root}/steps-c/step-01-preflight-and-context.md`

### 3. Resume Support

If the user selects **Resume** mode, load, read completely, and execute:
`{skill-root}/steps-c/step-01b-resume.md`

Each run writes one summary per scope at `{test_artifacts}/automate/automation-summary-{run_key}.md`, where `run_key` is `story-{story_key}`, `epic-{epic_num}`, `target-{slug}`, or `system`, and records `runScope` and `runKey` in its frontmatter. Resume selects the summary for the run being resumed (migrating a legacy `{test_artifacts}/automation-summary.md` into the `automate/` folder first), reads its progress tracking frontmatter, and routes to the next incomplete step.

## Create Execution and Healing

After generation and aggregation, the selected mode's Create terminal step reads `{skill-root}/resources/run-and-heal.md` completely. That resource is authoritative for running generated tests, classifying results, scoped repairs and completion evidence. Resolve `auto_validate` and `auto_heal_failures` to true by default, `max_healing_iterations` to 3 with a maximum of three, and `use_mcp_healing` to true for available diagnosis tools only. Explicit run instructions take priority over `modules.tea` settings. Validation disabled means no execution/healing; healing disabled or zero rounds means execution without repairs.

Load the retained `healing_rounds_used` and settings before any Resume progress write; initialize zero at first loop entry, including legacy Resume with no counter and no prior repair evidence. Otherwise retain the saved count, and report an inconsistent budget without more repairs if prior repair evidence has no valid count. Persist an incremented round count before repairing confirmed defects in this run's generated tests/support. Preserve acceptance criteria, exact business assertions and production source. Never add skip, `test.fixme()`, expected-failure annotations, weakened assertions, increased test timeouts or SUT success mocks to suppress a failure. Stop within the retained budget and report unresolved test failures, product defects and environment blockers with their evidence.

Expand seeks passing generated coverage. Red executes disposable activated copies, preserving correct intended failures and every permanent scaffold skip call and business assertion. Confirmed wrong-reason repairs update the owned permanent generated files, which are re-copied and re-activated before each re-run. Red selects the compatible available verifier or the project-native runner as the shared resource directs, with original configuration/environment and fresh per-test evidence. Summary completion records the actual execution status; generation completion cannot imply passing coverage or verified red.

Validate and Edit follow their canonical operation routes. Neither operation loads this Create loop, repairs tests or requires a passing full suite. Validate reports available evidence and unmet criteria; Edit checks only the changed outputs.
