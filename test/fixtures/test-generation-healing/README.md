# Generated-Test Healing Fixture

A small backend project exercises the shared Create run-and-heal resource through actual Playwright execution. It needs the repository's `@playwright/test` dependency; no browser, server or model is needed for deterministic fixture checks.

`criteria.json` is the fixed behavioral contract. The seeded generated total test has an import typo. The refund test exposes a real one-cent product defect. The red scaffold reaches its promised confirmation state and fails because that behavior is absent.

For a live skill run, copy this entire folder to a fresh scratch project and make its installed Playwright dependency available. Give the agent the canonical skill and `resources/run-and-heal.md`, the generated scope and `criteria.json`. This fixture uses `test_stack_type = backend`, `test_framework = playwright` and `tea_use_playwright_utils = false`; its function-level checks need no HTTP fixtures:

- Expand Create: execute `tests/expand/`, repair the confirmed generated import defect, rerun, report the preserved refund defect. The total test passes and the refund still fails.
- Red Create: verify `tests/red/` through `tea-atdd-red-check` in a disposable copy. The failure must contain the assertion's expected `confirmed` and received `pending`. Keep the permanent scaffold unchanged with its existing `test.skip()`.
- Validate/Edit: assess the same inputs without healing or requiring a passing suite.

Only the `total.spec.ts` import can change during the seeded heal. Every assertion and `src/orders.js` must remain unchanged. Report execution commands, classification, repair rounds, healed path, product reproduction and intended red failure in the mode's summary.

`test/test-generation-healing.js` executes these seeded outcomes and verifies the instruction/config/terminal guards. Its controlled fixture repair validates the execution witness and invariants. A live agent capture establishes that the skill follows the instruction resource.
