---
name: 'step-03b-subagent-mobile'
description: 'Subagent: Generate mobile tests only (Maestro device flows plus unit/component)'
subagent: true
outputFile: '/tmp/tea-automate-mobile-tests-{{timestamp}}.json'
---

# Subagent 3B-mobile: Generate Mobile Tests

## SUBAGENT CONTEXT

This is an **isolated subagent** running in parallel with API test generation.

**What you have from parent workflow:**

- Target features/journeys identified in Step 2
- Knowledge fragments loaded: `mobile-test-strategy`, `maestro-flows`, `mobile-ci-device-lab`, `test-levels-framework`, `test-priorities-matrix`, `test-quality`
- Config: test framework, detected stack type (`mobile`)
- Coverage plan: which journeys need coverage and at which level

**Your task:** Generate mobile tests ONLY. Device flows in Maestro, plus unit and component tests in the app's own framework.

---

## MANDATORY EXECUTION RULES

- Read this entire subagent file before acting
- Apply the level framework BEFORE generating anything: most coverage does not belong in a device flow
- Output structured JSON to temp file using the subagent output schema contract
- Follow `maestro-flows.md` patterns exactly; a flow that violates them is a defect you authored
- Do NOT generate API endpoint tests (that's subagent 3A)
- Do NOT generate browser E2E tests; a device flow has no DOM and no request interceptor
- Do NOT run flows (that's step 4), and never assume a simulator is booted
- Do NOT generate fixtures yet (that's step 3C aggregation)

---

## SUBAGENT TASK

### 1. Assign Levels Before Generating

For every target from the coverage plan, decide its level using `mobile-test-strategy.md`. This is the step that decides whether the suite is usable.

Promote to a **device flow** only when the risk is in the integration:

- P0 revenue or access journeys end to end
- OS permission grant AND denial paths
- Deep link entry into a specific screen
- Background, foreground, and process-death restoration
- Offline and reconnect behavior
- Push notification tap-through
- App upgrade with existing local data

Keep at **unit or component** level:

- Input validation, formatting, mapping, reducers
- Conditional rendering and list cell variants
- Error copy and empty states
- API error mapping

**Duplicate coverage guard:** before emitting a flow, state which cheaper level could not have covered it. If you cannot name one, it does not belong in a flow.

### 2. Detect the App's Frameworks

From `config.test_framework` and project manifests:

- **React Native / Expo**: Maestro for flows; Jest or Vitest with React Native Testing Library for unit and component
- **Native iOS**: Maestro for flows; XCTest for unit
- **Native Android**: Maestro for flows; JUnit plus Robolectric for unit, instrumented tests only where required
- **Flutter**: Maestro for flows; `flutter test` for unit and widget tests

### 3. Generate Maestro Flows

Every generated flow must satisfy the `maestro-flows.md` checklist:

- `clearState` before `launchApp` for top-level `device-flow` entries (omit `clearState` and `launchApp` in `subflow` entries like `subflows/login.yaml` invoked via `runFlow` so they do not reset or relaunch the app mid-journey)
- Accessibility-id selectors first; `text` only when no id exists; scoped relations for repeated labels
- No bare `index:` and no `point:` coordinates
- `extendedWaitUntil` on a named condition with an explicit timeout, never `sleep`
- At least one `assertVisible` / `assertNotVisible` / `assertTrue` on the destination state, and it must be able to fail: never put `optional: true` on the assertion that carries the flow's outcome (registry row C7)
- Every command used on both platforms is documented for both, or split by `runFlow: when: platform:`. `back` is Android and Web only and no-ops on iOS while reporting success, and `hideKeyboard` on Android is the system back key, which dismisses an open React Native modal
- `${ENV_VAR}` for every credential, never a literal
- One user journey per file, shared setup extracted to `{maestro_root}/subflows/` (where `{maestro_root}` is the resolved Maestro root: `maestro/` or `.maestro/`)
- A `P0`-`P3` tag matching the priority the coverage plan assigned

**Confidence gate:** if you cannot determine an element's accessibility id from the source, do not invent one. Record it as an unknown in `assumptions` and mark the flow as needing an id, per `confidence-gate.md`.

### 4. Generate Unit and Component Tests

Cover everything the level framework kept below the device layer, using the app's own framework and its idiomatic patterns. Include priority tags in test descriptions.

### 5. Track Fixture Needs

Identify what the suite needs but do not create it yet:

- Subflows (login, onboarding dismissal, seed navigation)
- Test accounts and how they are provisioned per run
- Backend seed or stub required for a deterministic flow
- Device or emulator preconditions (locale, permissions pre-grant, network condition)

---

## OUTPUT FORMAT

Write JSON to temp file: `/tmp/tea-automate-mobile-tests-{{timestamp}}.json`

```json
{
  "subagentType": "mobile",
  "success": true,
  "testsGenerated": [
    {
      "file": "maestro/checkout-happy-path.yaml",
      "content": "[full flow content]",
      "level": "device-flow",
      "description": "Checkout with a saved card",
      "cheaperLevelRuledOut": "component tests cannot exercise the payment sheet the OS presents",
      "priority_coverage": { "P0": 1, "P1": 0, "P2": 0, "P3": 0 }
    },
    {
      "file": "maestro/subflows/login.yaml",
      "content": "[full subflow content]",
      "level": "subflow",
      "description": "Reusable login sequence",
      "priority_coverage": { "P0": 0, "P1": 0, "P2": 0, "P3": 0 }
    },
    {
      "file": "src/features/cart/__tests__/cartTotals.test.ts",
      "content": "[full test file content]",
      "level": "unit",
      "description": "Cart total and discount calculation",
      "priority_coverage": { "P0": 2, "P1": 1, "P2": 0, "P3": 0 }
    }
  ],
  "coverageSummary": {
    "deviceFlows": 1,
    "subflows": 1,
    "unitTests": 1,
    "componentTests": 0,
    "fixtureNeeds": ["test account provisioning per run", "backend seed for a saved card"]
  },
  "assumptions": ["checkout_submit_button accessibility id not found in source; flow needs the id added"]
}
```

If test generation fails, write a failure payload to the same file path:

```json
{
  "subagentType": "mobile",
  "success": false,
  "error": "Failed to generate mobile tests: [description of failure reason]"
}
```

`subflows` are counted separately from `deviceFlows` on purpose: shared setup is not a test, and folding it into the flow count inflates the coverage number.

---

## COMPLETION

Write the JSON file, then return control to the parent workflow. Do not load the next step; the parent aggregates in step 3C.
