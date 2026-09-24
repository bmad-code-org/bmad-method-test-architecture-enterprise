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

### 1. Configuration Loading

From `workflow.yaml`, resolve:

- `config_source`, `test_artifacts`, `user_name`, `communication_language`, `document_output_language`, `date`
- `test_dir`

### 2. First Step

Load, read completely, and execute:
`{skill-root}/steps-c/step-01-preflight-and-context.md`

### 3. Resume Support

If the user selects **Resume** mode, load, read completely, and execute:
`{skill-root}/steps-c/step-01b-resume.md`

Each run writes one checklist per story at `{test_artifacts}/atdd/atdd-checklist-{story_key}.md`, with `runScope: story` and `runKey: story-{story_key}` in its frontmatter. Resume selects the checklist for the story being resumed (moving a legacy `{test_artifacts}/atdd-checklist-{story_key}.md` into the `atdd/` folder first), reads its progress tracking frontmatter, and routes to the next incomplete step.
