---
name: 'step-01-validate'
description: 'Validate workflow outputs against checklist'
outputFile: '{test_artifacts}/ci-validation-report.md'
validationChecklist: '../checklist.md'
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

### 2a. Script Injection Scan

Scan all generated YAML workflow files for the vulnerable pattern: `${{ inputs.*` or other user-controlled GitHub context expressions (`${{ github.event.pull_request.title`, `${{ github.event.issue.body`, `${{ github.event.comment.body`, `${{ github.head_ref`) appearing directly inside `run:` blocks.

**Detection method:** For each `run:` block in generated YAML, check if any `${{ inputs.*` or unsafe context expression appears in the run script body. If found, flag as **FAIL** with the specific line and recommend converting to the safe `env:` intermediary pattern.

**Safe patterns to ignore:** `${{ steps.*.outputs.* }}`, `${{ matrix.* }}`, `${{ runner.os }}`, `${{ github.sha }}`, `${{ github.ref }}`, `${{ secrets.* }}`, `${{ env.* }}` — these are system-controlled and safe to use directly in `run:` blocks.

### 3. Write Report

Write a validation report to `{outputFile}` with PASS/WARN/FAIL per section.

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Validation report written
- All checklist items evaluated

### ❌ SYSTEM FAILURE:

- Skipped checklist items
- No report produced
