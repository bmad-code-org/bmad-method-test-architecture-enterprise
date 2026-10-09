<!-- Powered by BMAD-CORE™ -->

# CI/CD Pipeline Setup

**Version**: 5.0 (Step-File Architecture)

---

## Overview

Scaffold a production-ready CI/CD quality pipeline with test execution, burn-in loops for flaky detection, parallel sharding, artifact collection, and notifications.

---

## WORKFLOW ARCHITECTURE

This workflow uses **step-file architecture**:

- **Micro-file Design**: Each step is self-contained
- **JIT Loading**: Only the current step file is in memory
- **Sequential Enforcement**: Execute steps in order

---

## INITIALIZATION SEQUENCE

### 1. Configuration Loading

From `workflow.yaml`, resolve:

- `date` (`test_artifacts`, `user_name`, `communication_language` and `document_output_language` come from activation)
- `test_dir`, and `ci_platform` from `{workflow.ci_platform}`

### 2. Canonical CI Activation

If invoked through legacy workflow metadata, preset `setup_scope = ci` and `setup_entry = bmad-testarch-ci`, then load `{skill-root}/SKILL.md` and its shared router before executing a phase. Keep the original operation and legacy CI customization. CI instructions, templates and steps resolve under `{skill-root}/ci/`.

### 3. First Step

Load, read completely, and execute:
`{skill-root}/ci/steps-c/step-01-preflight.md`

### 4. Evaluation Plans

Step 3b renders every `ci/evaluation-ci-plan.json` it finds into the pipeline, in create mode and, through the edit steps, in edit mode.

### 5. Resume Support

Resume follows the saved position in `setup-run-progress.md`. Only a legacy Create checkpoint with no saved journal position loads `{skill-root}/ci/steps-c/step-01b-resume.md` after recovering any missing contract through read-only inventory. This loader then routes directly to the next incomplete step.
