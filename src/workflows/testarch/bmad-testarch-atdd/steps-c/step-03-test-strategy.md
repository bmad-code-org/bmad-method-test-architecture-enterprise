---
name: 'step-03-test-strategy'
description: 'Map acceptance criteria to test levels and priorities'
outputFile: '{test_artifacts}/atdd-checklist-{story_key}.md'
nextStepFile: '{skill-root}/steps-c/step-04-generate-tests.md'
---

# Step 3: Test Strategy

## STEP GOAL

Translate acceptance criteria into a prioritized, level-appropriate test plan.

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`
- 🚫 Avoid duplicate coverage across levels

---

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 💾 Record outputs before proceeding
- 📖 Load the next step only when instructed

## CONTEXT BOUNDARIES:

- Available context: config, loaded artifacts, and knowledge fragments
- Focus: this step's goal only
- Limits: do not execute future steps
- Dependencies: prior steps' outputs (if any)

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

## 1. Map Acceptance Criteria

- Convert each acceptance criterion in the persisted registry into test scenarios
- Record the exact declared acceptance criterion id on every scenario. Preserve supplied ids and use the preflight-generated id for an unnamed criterion
- Plan exactly one primary red-phase scaffold for every declared criterion. Record secondary branches for green-phase automation without emitting extra red-phase leaves
- Identify the one smallest criterion-defining assertion that must fail first. Assert the exact newly promised status, scalar, or property before broad object, schema, or secondary assertions
- Establish prerequisite state through an existing fixture, provider state, or unasserted setup action. Keep an unimplemented setup response opaque before the criterion assertion: do not parse it, branch on it, throw from it, assert it, or derive cleanup data from it
- For state-transition criteria, choose the transition-bearing branch as the primary red-phase scenario
- Include negative and edge cases where risk is high

---

## 2. Select Test Levels

Choose the best level per scenario based on `{detected_stack}`:

**If {detected_stack} is `frontend` or `fullstack`:**

- **E2E** for critical user journeys
- **API** for business logic and service contracts
- **Component** for UI behavior

**If {detected_stack} is `backend` or `fullstack`:**

- **Unit** for pure functions, business logic, and edge cases
- **Integration** for service interactions, database queries, and middleware
- **API/Contract** for endpoint validation, request/response schemas, and Pact contracts
- **No E2E** for pure backend projects (no browser-based testing needed)

---

## 3. Prioritize Tests

Assign P0–P3 priorities using risk and business impact.

---

## 4. Confirm Red Phase Requirements

Ensure all tests are designed to **fail before implementation** (TDD red phase).

For each declared criterion, confirm that its single red-phase scaffold reaches the criterion-defining assertion before any other assertion can fail. The first assertion must isolate the exact newly promised status, scalar, or property. Broad object, schema, and secondary assertions follow it within that leaf only when they cannot change its first failure. A criterion describing behavior after a state transition must exercise that transition. Record baseline branches and additional cases in the checklist for green-phase automation.

---

## 5. Save Progress

**Save this step's accumulated work to `{outputFile}`.**

- **If `{outputFile}` does not exist** (first save), create it with YAML frontmatter:

  ```yaml
  ---
  stepsCompleted: ['step-03-test-strategy']
  lastStep: 'step-03-test-strategy'
  lastSaved: '{date}'
  ---
  ```

  Then write this step's output below the frontmatter.

- **If `{outputFile}` already exists**, update:
  - Add `'step-03-test-strategy'` to `stepsCompleted` array (only if not already present)
  - Set `lastStep: 'step-03-test-strategy'`
  - Set `lastSaved: '{date}'`
  - Append this step's output to the appropriate section.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Step completed in full with required outputs

### ❌ SYSTEM FAILURE:

- Skipped sequence steps or missing outputs
  **Master Rule:** Skipping steps is FORBIDDEN.
