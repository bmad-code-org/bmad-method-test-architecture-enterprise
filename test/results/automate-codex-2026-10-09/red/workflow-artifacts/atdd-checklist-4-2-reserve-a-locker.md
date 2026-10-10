---
runScope: 'story'
runKey: 'story-4-2-reserve-a-locker'
testMode: 'red'
testEntry: 'bmad-testarch-automate'
test_mode: 'red'
test_operation: 'create'
auto_validate: true
auto_heal_failures: true
max_healing_iterations: 3
use_mcp_healing: true
healing_rounds_used: 0
workflowStatus: 'completed'
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-10-10T01:30:35Z'
storyId: '4.2'
storyKey: '4-2-reserve-a-locker'
primaryLevel: 'API'
storyFile: 'docs/stories/4-2-reserve-a-locker.md'
atddChecklistPath: '_bmad-output/test-artifacts/atdd/atdd-checklist-4-2-reserve-a-locker.md'
generatedTestFiles:
  - 'tests/api/locker-reservations.spec.ts'
inputDocuments:
  - 'docs/stories/4-2-reserve-a-locker.md'
  - 'package.json'
  - 'playwright.config.ts'
  - 'README.md'
  - 'src/server.js'
  - 'src/lockers.js'
  - '_bmad/config.toml'
  - '/Users/murat/opensource/_wt/automate-codex-evaluation/skills/bmod-tea/knowledge/data-factories.md'
  - '/Users/murat/opensource/_wt/automate-codex-evaluation/skills/bmod-tea/knowledge/component-tdd.md'
  - '/Users/murat/opensource/_wt/automate-codex-evaluation/skills/bmod-tea/knowledge/test-quality.md'
  - '/Users/murat/opensource/_wt/automate-codex-evaluation/skills/bmod-tea/knowledge/test-healing-patterns.md'
  - '/Users/murat/opensource/_wt/automate-codex-evaluation/skills/bmod-tea/knowledge/selector-resilience.md'
  - '/Users/murat/opensource/_wt/automate-codex-evaluation/skills/bmod-tea/knowledge/timing-debugging.md'
  - '/Users/murat/opensource/_wt/automate-codex-evaluation/skills/bmod-tea/knowledge/fixture-architecture.md'
  - '/Users/murat/opensource/_wt/automate-codex-evaluation/skills/bmod-tea/knowledge/network-first.md'
acceptanceCriteria:
  - id: 'AC-1'
    idSource: 'supplied'
    text: 'A free locker can be reserved. POST /lockers/{lockerId}/reservations with a JSON body { "parcelId": "<string>", "durationMinutes": <integer> } on a locker with no active reservation responds 201 with a JSON body carrying reservationId (a non-empty string), lockerId (the locker reserved), parcelId (the parcel given) and expiresAt (an ISO-8601 timestamp durationMinutes after the request).'
  - id: 'AC-2'
    idSource: 'supplied'
    text: 'A reserved locker cannot be reserved again. POST /lockers/{lockerId}/reservations on a locker that already has an active reservation responds 409 with the JSON body { "error": "locker-reserved" }, and the existing reservation is unchanged.'
  - id: 'AC-3'
    idSource: 'supplied'
    text: 'The duration is validated. POST /lockers/{lockerId}/reservations responds 422 with the JSON body { "error": "invalid-duration" } when durationMinutes is missing, is not an integer, is below 1, or is above 1440. No reservation is created.'
  - id: 'AC-4'
    idSource: 'supplied'
    text: 'A reservation can be released. DELETE /lockers/{lockerId}/reservations/{reservationId} responds 204 with no body, and a subsequent POST /lockers/{lockerId}/reservations on the same locker responds 201 again.'
  - id: 'AC-5'
    idSource: 'supplied'
    text: 'The locker reports whether it is reserved. GET /lockers/{lockerId} carries "reserved": true while the locker has an active reservation and "reserved": false otherwise, beside the existing id, location and size fields.'
---

# ATDD Checklist: Story 4.2 Reserve a locker

## TDD Red Phase

- Five API acceptance scaffolds generated with `test.skip()`.
- Zero browser E2E scaffolds generated because this service has no UI.
- Each leaf title maps to exactly one supplied criterion ID.
- Tests use Playwright's `request` fixture against the real service.
- Production and runner configuration remain outside the generated scope.

## Acceptance Criteria Coverage

| Criterion | Priority | Primary scaffold | First criterion assertion | Expected pre-implementation result |
| --- | --- | --- | --- | --- |
| AC-1 | P0 | Reserve free locker `L-104` | status is `201` | current route returns `404` |
| AC-2 | P0 | Attempt a second reservation for `L-217` | second status is `409` | current route returns `404` |
| AC-3 | P0 | Submit duration `1441` for `L-330` | status is `422` | current route returns `404` |
| AC-4 | P0 | Release known reservation `reservation-for-L-104` | status is `204` | current route returns `404` |
| AC-5 | P1 | Read an actively reserved `L-330` | `reserved` is `true` | property is absent |

## Generated Files

- `tests/api/locker-reservations.spec.ts`
- `tests/support/factories/reservation.ts`

## Fixture and Provider-State Needs

- `reservationPayload()` creates unique parcel IDs and supports explicit duration overrides.
- Before AC-4 is activated for green implementation, bind `reservation-for-L-104` to an active reservation through the implementation's test provider-state seam.
- Before AC-5 is activated for green implementation, arrange `L-330` as actively reserved through that same seam.
- These provider states remain explicit checklist work because no reservation store or setup seam exists before implementation.

## Green-Phase Expansion

- AC-1: verify the exact expiry offset after the service gains a controllable clock or equivalent deterministic time seam.
- AC-2: verify the existing reservation remains unchanged.
- AC-3: cover missing, non-integer, below-minimum, and above-maximum durations; verify each failure leaves the locker free.
- AC-4: verify the `204` body is empty and the same locker accepts a subsequent reservation.
- AC-5: verify the baseline `reserved: false` state and preserve `id`, `location`, and `size` in both states.

## Task-by-Task Activation

1. Add the required provider state for the current criterion when listed above.
2. Remove `test.skip()` from only that criterion's scaffold.
3. Run `npm test -- tests/api/locker-reservations.spec.ts` and observe the recorded red failure.
4. Implement the criterion without weakening its assertion.
5. Run the same command until the activated criterion passes.
6. Restore unrelated scaffolds to skipped state until their implementation task begins.

## Execution and Healing Plan

- Frozen owned scope: `tests/api/locker-reservations.spec.ts`, `tests/support/factories/reservation.ts`.
- Runner: compatible `tea-atdd-red-check` against a disposable project copy.
- Service: `PORT=43927 node src/server.js`, with readiness at `http://127.0.0.1:43927/health`.
- Per-file process budget: 95,000 ms. This derives from five selected tests at the configured 15,000 ms each, plus the 15,000 ms service deadline and 5,000 ms report overhead.
- Selected tests: the five generated leaves mapped one-to-one to `AC-1` through `AC-5`.
- Expected signatures: `AC-1` expects 201 and receives 404; `AC-2` expects 409 and receives 404; `AC-3` expects 422 and receives 404; `AC-4` expects 204 and receives 404; `AC-5` expects `true` and receives an absent value.
- Generated baselines: scaffold SHA-256 `f0378f92ff11d64107d1e18386b6ea1a46b8cb15d798674f69f5c03fdeab488d`; factory SHA-256 `8d3dc40e2f022ce4b37c4a2ec3e6e91bbdca3515ebb50aa66e3495f63536fa74`.
- Protected baselines: `package.json` `c954331e833028a549c6c64a6c2921a19e889c481043e88197e8b0ef265bcd54`; `playwright.config.ts` `e4d135a1d845b37d7e1599d65e40c131377b216b968e9896ed25077ce16a9072`; `src/lockers.js` `9b30bb3535be609f1a33d6a00707aaa1d76eae1ab038662dbf997cfb9000d3e7`; `src/server.js` `416b047100c7b1dd079523f964e448289c4fcc4b495817662a416665997a61ad`; `_bmad/config.toml` `727316cea29c5234ebdfb0cf0d90dd493b03d7d026590594d861b01ff2931174`. All protected modes are `0644`.

## Story Handoff

The story links this checklist and the API scaffold under `### ATDD Artifacts` in its Dev Notes.

## Red Verification Result

Execution status: **verified red**.

- Route: compatible `tea-atdd-red-check` using a disposable project copy.
- Command: `tea-atdd-red-check --test-dir tests --per-file-timeout-ms 95000 --server-command 'PORT=43927 node src/server.js' --server-health-url http://127.0.0.1:43927/health` with the disposable root, report path, and project `node_modules` supplied.
- Initial counts: 5 executed, 0 passed, 5 failed, 0 skipped, 5 intended failures.
- Final counts: 5 executed, 0 passed, 5 failed, 0 skipped, 5 intended failures.
- Healing rounds used: 0. Every result was an intended missing-behavior failure.
- Runner report: `_bmad-output/test-artifacts/automate-cli/a7dea3b7-95b3-4506-9b9d-c7ef3e300446/tea-automate-stiIS9/attempt-1/red-report-initial.json`.
- Diagnosis tools: runner assertion output and source inspection. Browser evidence was irrelevant to this API-only project.

### Criterion Evidence

| Criterion | Actual assertion evidence | Classification |
| --- | --- | --- |
| AC-1 | expected `201`, received `404` | intended missing behavior |
| AC-2 | expected `409`, received `404` | intended missing behavior |
| AC-3 | expected `422`, received `404` | intended missing behavior |
| AC-4 | expected `204`, received `404` | intended missing behavior |
| AC-5 | expected `true`, received `undefined` | intended missing behavior |

The verifier reported one spec file, five failed test attempts, zero load errors, and an empty `productionFilesTouched` list. Permanent scaffold and factory hashes stayed equal to their frozen baselines. Protected source and configuration hashes and permission modes also stayed equal to their baselines.

## Implementation Checklist

- [ ] AC-1: add `POST /lockers/{lockerId}/reservations`, create in-memory reservation state, return the required `201` body, and use a deterministic clock seam for exact expiry tests.
- [ ] AC-2: reject an active locker's second reservation with `409 { "error": "locker-reserved" }` while retaining the original reservation.
- [ ] AC-3: validate all four duration variants and leave reservation state unchanged after every `422` response.
- [ ] AC-4: add the delete route, expose a test provider-state seam for known active reservation IDs, return an empty `204`, and prove the locker can be reserved again.
- [ ] AC-5: add `reserved` to locker detail responses, expose a provider-state seam for the active state, and preserve the existing locker fields.

Implementation estimate: 5 to 8 story points. This estimate does not influence the technical design.

## Red, Green, Refactor Commands

- All permanent scaffolds: `npm test`
- This file: `npm test -- tests/api/locker-reservations.spec.ts`
- One activated criterion: `npx playwright test tests/api/locker-reservations.spec.ts --grep 'AC-1'`
- Debug one criterion: `PWDEBUG=console npx playwright test tests/api/locker-reservations.spec.ts --grep 'AC-1'`
- Headed execution: N/A. These tests use Playwright's API request context and launch no browser.

Activate one criterion at a time, observe its recorded red signature, implement the behavior, reach green, and refactor with the active criterion still green.

## Validation Summary

- Story and framework prerequisites: PASS.
- Criterion registry and one-to-one leaf mapping: PASS.
- Permanent `test.skip()` scaffolds: PASS.
- First criterion-defining assertions and opaque unimplemented setup calls: PASS.
- Disposable activation and fresh per-test evidence: PASS.
- Source and configuration integrity: PASS.
- Story artifact handoff: PASS.
- Generated TypeScript load and import validation: PASS through the activated verifier run.
- Playwright Utils mandate: N/A because `tea_use_playwright_utils` is `false`.
- Pact.js Utils mandate: N/A because `tea_use_pactjs_utils` is `false` and no consumer-provider contract boundary is in scope.
- E2E, component, selectors, data-testid, external mocks, and browser-session cleanup: N/A for this JSON-only service.
- Test fixtures with teardown: deferred until the reservation store exposes a provider-state seam; the required AC-4 and AC-5 states are documented above.
- Factory dependency: the project has no Faker dependency. The factory uses Node's UUID generator for the unconstrained parcel identity and retains exact duration overrides.

## Delivery Summary

- Story ID: `4.2`.
- Story key: `4-2-reserve-a-locker`.
- Primary test level: API.
- Test counts: 5 API, 0 E2E, 0 component.
- Test file: `tests/api/locker-reservations.spec.ts`, 66 lines.
- Factory: `tests/support/factories/reservation.ts`, 14 lines.
- Factory count: 1.
- Fixture count: 0.
- External mock requirements: 0.
- data-testid requirements: 0.
- Implementation tasks: 5.
- Knowledge applied: data factories, fixture architecture, test quality, healing patterns, selector resilience, timing debugging, and network-first safeguards.
- Recommended next workflow: `dev-story` for Story 4.2. Run Automate in expand mode after implementation to add the recorded secondary branches.

