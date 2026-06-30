---
name: 'step-01-validate'
description: 'Validate workflow outputs against checklist'
outputFile: '{test_artifacts}/automate-validation-report.md'
validationChecklist: '{skill-root}/checklist.md'
---

# Step 1: Validate Outputs

## STEP GOAL:

Validate outputs using the workflow checklist and record findings.

## MANDATORY EXECUTION RULES (READ FIRST):

### Universal Rules:

- 📖 Read the complete step file before taking any action
- ✅ Speak in `{communication_language}`

### Role Reinforcement:

- ✅ You are the Master Test Architect

### Step-Specific Rules:

- 🎯 Validate against `{validationChecklist}`
- 🎯 Load and inspect `{ta_evidence_output}` when validating automate outputs
- 🚫 Do not skip checks

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 💾 Write findings to `{outputFile}`

## CONTEXT BOUNDARIES:

- Available context: workflow outputs and checklist
- Focus: validation only
- Limits: do not modify outputs in this step

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly.

### 1. Load Checklist

Read `{validationChecklist}` and list all criteria.

### 2. Validate Outputs

Evaluate outputs against each checklist item.

### 3. Load Structured Evidence

Read `{ta_evidence_output}` from disk and parse it as JSON with `JSON.parse`.

If the file is missing or invalid JSON, record `ERROR` for structured evidence validity.

Validate the structured evidence envelope:

- `contract_version` is `1.0`.
- `workflow` is `bmad-testarch-automate`.
- `story_ref` matches the requested story or is `null` when no story was provided.
- `node` is `TA`.
- `round` is a positive integer.
- `gate` is `PASS` or `ERROR`.
- `gate: "ERROR"` is recorded as an `ERROR` validation result.
- `generated_at` is present and parses as an ISO-8601 timestamp.
- `report_file` points to `automation-summary.md`.
- `changed_tests`, `fixture_needs`, `quality_concerns`, and `nfr_signals` are arrays.
- Each `changed_tests` entry includes non-empty `file`, `test_level`, `description`, and `source` fields.
- Each `changed_tests` entry includes complete non-negative integer `priority_coverage` counts.
- `coverage.total_tests`, `coverage.by_level.*`, and `coverage.priority_coverage.*` are non-negative integers.
- `coverage.total_tests` equals the sum of `coverage.by_level.*`.
- `artifact_pointers.automation_summary` points to `automation-summary.md`.
- `artifact_pointers.generated_test_files` is an array of generated or updated test paths.
- `changed_tests` and `artifact_pointers.generated_test_files` stay inside expected generated-test boundaries such as `tests/`, `pact/`, `pacts/`, or the configured test directory.
- `changed_tests` and `artifact_pointers.generated_test_files` reference the same file set.
- Each `nfr_signals` entry includes non-empty `category`, `source`, and `evidence` fields.
- Any `quality_concerns` entry with error severity, case-insensitive, is recorded as an `ERROR` validation result.
- Unresolved output placeholders are recorded as an `ERROR` validation result.

Treat missing required fields, invalid JSON, `gate: "ERROR"`, unexpected `story_ref`, missing report pointers, invalid timestamps, unresolved placeholders, invalid NFR signals, generated-test boundary escapes, or error-severity quality concerns as `ERROR`.

### 4. Write Report

Write a validation report to `{outputFile}` with PASS/WARN/ERROR per section.

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Validation report written
- All checklist items evaluated

### ❌ SYSTEM FAILURE:

- Skipped checklist items
- No report produced

## On Complete

Run: `python3 {project-root}/_bmad/scripts/resolve_customization.py --skill {skill-root} --key workflow.on_complete`

If the resolver succeeds and returns a non-empty `workflow.on_complete`, execute that value as the final terminal instruction before exiting.

If the resolver fails, returns no output, or resolves an empty value, skip the hook and exit normally.
