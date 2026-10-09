<!-- Powered by BMAD-CORE™ -->

# Test Framework and CI Setup

**Version**: 5.0 (Step-File Architecture)

---

## Overview

Initialize a production-ready browser, backend, or mobile test framework and CI/CD quality pipeline under shared framework-only, CI-only, or both scope. CI assets live under `{skill-root}/ci/`.

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

- `date` (`test_artifacts`, `user_name`, `communication_language` and `document_output_language` come from activation)
- `test_dir`, `use_typescript`, `framework_preference`, `project_size`

### 2. Shared Scope and Operation Routing

Load `{skill-root}/SKILL.md` and `{skill-root}/resources/setup-routing.md` completely. Apply the read-only request gate before activation hooks or project writes, then preserve create/resume/validate/edit across each selected phase. Framework root paths and CI artifact/checkpoint paths remain unchanged. Framework Create routes to `{skill-root}/steps-c/step-01-preflight.md`; Resume follows the saved position in `setup-run-progress.md`. Only a legacy Create checkpoint with no saved journal position loads `{skill-root}/steps-c/step-01b-resume.md`.

For both Create, load `{skill-root}/resources/setup-parallel.md` after framework selection. Every phase terminal loads `{skill-root}/resources/setup-phase-completion.md` and completes only after all selected phases pass.
