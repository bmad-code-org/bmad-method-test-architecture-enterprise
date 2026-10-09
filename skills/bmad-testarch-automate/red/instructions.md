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

### 2. First Step

Load, read completely, and execute:
`{skill-root}/red/steps-c/step-01-preflight-and-context.md`

### 3. Resume Support

If the user selects **Resume** mode, load, read completely, and execute:
`{skill-root}/red/steps-c/step-01b-resume.md`

Each run writes one checklist per story at `{test_artifacts}/atdd/atdd-checklist-{story_key}.md`, with `runScope: story` and `runKey: story-{story_key}` in its frontmatter. Resume selects the checklist for the story being resumed (moving a legacy `{test_artifacts}/atdd-checklist-{story_key}.md` into the `atdd/` folder first), reads its progress tracking frontmatter, and routes to the next incomplete step.
