# Coverage Traceability & Quality Gate

**Workflow:** `bmad-testarch-trace`
**Version:** 5.0 (Step-File Architecture)

---

## Overview

Create a coverage-oracle-to-tests traceability matrix, analyze coverage gaps, and optionally make a gate decision (PASS/CONCERNS/FAIL/WAIVED) based on evidence.

When formal requirements are unavailable, the workflow should resolve the best available coverage oracle automatically: specs/contracts first, external pointers second, and synthetic journeys/requirements inferred from source as the final brownfield fallback.

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

- `config_source`, `test_artifacts`, `user_name`, `communication_language`, `document_output_language`, `date`
- `test_dir`, `source_dir`, `live_results_input`, `coverage_levels`, `gate_type`, `decision_mode`, `collection_mode`
- `default_output_file`, `e2e_trace_summary_output`, `gate_decision_output`: every output lives under `{test_artifacts}/trace/` and carries the `run_key` Step 1 resolves (`traceability-matrix-{run_key}.md`, `e2e-trace-summary-{run_key}.json`, `gate-decision-{run_key}.json`), so runs for different scopes never share a file

### 2. First Step

Load, read completely, and execute:
`{skill-root}/steps-c/step-01-load-context.md`

### 3. Resume Support

If the user selects **Resume** mode, load, read completely, and execute:
`{skill-root}/steps-c/step-01b-resume.md`

This selects the traceability matrix that belongs to the run being resumed, checks its `runKey` and progress frontmatter, and routes to the next incomplete step.
