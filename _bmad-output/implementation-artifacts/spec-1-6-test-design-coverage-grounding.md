---
title: 'Story 1.6: Keep test design coverage grounded and restrained'
type: 'bugfix'
created: '2026-09-18'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'f7093f2'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/live-eval-remediation-story.md'
---

<!-- markdownlint-disable MD033 MD060 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** The test-design live baseline reports only 50% coverage mapping accuracy, eleven risks above the declared fixture ceiling, and two unstable cases. The workflow leaves enough room for speculative risk rows and weakly linked coverage plans to pass as grounded analysis.

**Approach:** Capture comparable diagnostics, classify the confirmed causes, then make every risk traceable to the supplied epic and every coverage row traceable to a declared risk at an admitted test level. Add deterministic regressions for over-reporting and invalid coverage mapping while preserving all existing shape, arithmetic, category, band, link, priority, grounding, and fixture-integrity checks.

## Boundaries & Constraints

**Always:** Preserve the 1.27.1 baseline byte for byte. Keep ground truth outside prompts and staged workspaces. Keep the seeded and clean fixtures, thresholds, two repetitions, and declared runner contract unchanged. Require exact risk IDs in coverage links, admitted levels for each material risk, and evidence-grounded risk descriptions. Record the user-facing correction under Unreleased.

**Never:** Lower thresholds, remove cases, weaken ground truth, accept speculative risks as grounded, change the public test-design workflow name, implement the planned Evaluate skill, or alter unrelated scorers and stored replay expectations.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Grounded risk plan | Epic supports the material risk and the coverage row names its exact risk ID at an admitted level | Risk is retained and coverage mapping passes | Missing support or mapping is a scored quality failure |
| Speculative risk | Risk description has no support in the supplied epic and exceeds the set ceiling | The workflow omits it or stays within the declared ceiling | Scorer records ungrounded or ceiling excess |
| Invalid coverage level | Material risk is linked only to a level the fixture does not admit | Mapping fails for that risk | Preserve the risk and report the invalid level |

</frozen-after-approval>

<!-- markdownlint-enable MD033 MD060 -->

## Code Map

- `src/workflows/testarch/bmad-testarch-test-design/steps-c/step-03-risk-and-testability.md` -- require risk rows to be grounded in explicit epic evidence and constrain speculative additions.
- `src/workflows/testarch/bmad-testarch-test-design/steps-c/step-04-coverage-plan.md` -- require exact declared risk IDs and admitted coverage levels for every material risk.
- `src/workflows/testarch/bmad-testarch-test-design/test-design-template.md` -- make the risk-link contract visible in generated plans without changing the public output shape.
- `test/eval-test-design.js` -- live parser, scorer, diagnostics, stability signature, and root-cause classification. Reuse its existing ceilings and metric projections.
- `test/replay/test-design/` -- deterministic stored designs and expected projections. Add cases that prove seeded over-reporting and missing or inadmissible coverage mapping.
- `test/test-eval-replay.js` -- replay and signature gate for stored test-design evidence.
- `test/results/eval-all/history/2026-09-17T12-23-09-218Z.json` -- protected baseline. Do not edit.
- `CHANGELOG.md`, `package.json`, `.github/workflows/quality.yaml` -- document the correction and retain the existing quality-chain registration.

## Tasks & Acceptance

**Execution:**

- [x] Capture and retain pre-fix focused diagnostics, including Claude environment failure and disclosed runner substitution if no vendor run measures.
- [x] Update risk and coverage workflow guidance with explicit grounding and link invariants.
- [x] Add deterministic replay evidence for risk-ceiling excess and inadmissible or missing coverage mapping.
- [x] Run focused replay and repository quality gates, then record post-fix evidence and provenance.
- [x] Update the Unreleased changelog entry.

**Acceptance Criteria:**

- Given seeded and clean epics, when test design is generated, then every material risk maps to an accepted coverage class and the output stays below each declared ceiling.
- Given a confirmed defect, when its deterministic replay is run, then restoring the defect fails the intended metric while existing scorer expectations remain unchanged.
- Given two complete repetitions, when the focused suite is scored, then coverage mapping is at least 0.8, ceiling excess and ungrounded risks are zero, all perfect shape metrics remain perfect, and instability is zero.
- Given repository validation, when `npm test` and all quality jobs run, then every required check passes and the protected baseline remains byte-identical.

## Implementation Notes

- Claude pre-fix completed zero of four repetitions because the runner exited with code 1 for all cases. The result class is `environment-transport`.
- Codex was attempted as the documented substitution. It completed zero of four repetitions because the local Codex quota was exhausted. No live quality score is claimed from either run.
- The deterministic guard is registered through `test:eval-test-design-data`, which already runs in `npm test` and the quality workflow. The replay corpus now has 149 passing cases, including a seeded risk-ceiling regression.

## Spec Change Log

## Review Triage Log

- `review-substitution`: no active review subagents were available in the Codex runtime. I applied the blind-hunter, edge-case, and verification-gap lenses directly against the staged diff and surrounding callers. No actionable finding remained after verification.

## Verification

**Commands:**

- `npm run eval:test-design -- --validate-only` -- expected: corpus and staged-workspace controls pass.
- `npm run test:eval-replay -- --suite test-design` -- expected: all stored test-design cases reproduce.
- `npm run format:check && npm run lint:md && npm run lint` -- expected: all checks pass.
- `npm run test:ci-coverage && npm run test:ci-coverage-filters` -- expected: the new guard is covered by the quality workflow.
- `npm test` -- expected: full quality gate passes.
