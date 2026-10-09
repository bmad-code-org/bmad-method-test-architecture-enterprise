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

### 2. First Step

Load, read completely, and execute:
`{skill-root}/steps-c/step-01-preflight-and-context.md`

### 3. Resume Support

If the user selects **Resume** mode, load, read completely, and execute:
`{skill-root}/steps-c/step-01b-resume.md`

Each run writes one summary per scope at `{test_artifacts}/automate/automation-summary-{run_key}.md`, where `run_key` is `story-{story_key}`, `epic-{epic_num}`, `target-{slug}`, or `system`, and records `runScope` and `runKey` in its frontmatter. Resume selects the summary for the run being resumed (migrating a legacy `{test_artifacts}/automation-summary.md` into the `automate/` folder first), reads its progress tracking frontmatter, and routes to the next incomplete step.
