---
title: "Name a report operation's collision with any other api operation at check"
type: 'feature'
created: '2026-10-03'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'cc1ab7934ee78ec36268fcfbc719269a731c23d8'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.75.md'
---

<frozen-after-approval reason="owner delegated Story 1.77 build and merge through the Evaluate relay">

## Intent

**Problem:** Story 1.75 compiles at `check` only when one `historical` probe's deployments name report operations on two or more interfaces. A report operation whose method and path equal an ordinary `api` operation of another interface, and two probes that each name a report for a different interface, still pass `check` and fail `run` at exit 4.

**Approach:** The trigger becomes any `historical` probe that names a report operation. The compile is contract-wide, so one compile and one finding on the first such probe cover every probe. The finding is worded around the two operations the engine's line names, whichever kinds they are. TeA still compares no template (AD-1).

## Boundaries & Constraints

**Always:** Reach the engine only through `runEngineStage`; quote the engine's line; write nothing under the evaluation folder; stay quiet for every outcome other than the `duplicate-operation-signature` refusal.

**Never:** Compute or compare method and path templates in TeA. Call compile when no `historical` probe names a report. Change eval-quality.

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/check.js`: `checkProbes` notes the first `historical` probe whose deployments name at least one report (`reportedInterfaces(...).length > 0`); `checkReportCollision` words the finding.
- `docs/reference/tea-evaluate-cli.md`: `### Against deployments` and the `historical` row of the rules table.
- `test/test-evaluate-check.js`: `checkReportCollidingWithAnyOperation`, `plantCollidingOrdinaryInterface`, and the one-report cases of `checkReportSignatureCollision`.
- `test/test-evaluate-arms.js`: `checkHistoricalReference` reads the widened wording and fails while "two or more interfaces" remains.
- `epics.md` "Parallel lanes" and `sprint-status.yaml` `parallel_lanes`: synced to the `LANES.md` table (Kerem's rebalance of 2026-10-03).

## Design Decisions

- The finding does not filter on whether the engine's line names a report operation. A collision between two ordinary operations draws the finding when some probe names a report, because the compile refuses the contract and `run` would exit 4 either way; the wording ("two operations that share an identity") does not claim a report is involved. Filtering would make TeA parse the engine's line to decide.
- A collision between two ordinary operations with no probe naming a report makes no compile call here and stays the CI plan's `compile` check, as the story's third criterion requires.
- Two probes that each name a report for a different interface are reachable only through a registry whose `reports` already draw their own findings; the collision finding is still one, on the first probe.

## Verification

- `npm run test:evaluate-check` (1120 checks) and `npm run test:evaluate-arms` (732 checks) pass.
- Revert observation: narrowing the trigger back to `> 1` fails 11 checks (the one-report case, the report-versus-ordinary case, its preflight and wording asserts, and the two-probe case).
- `npm run lint`, `npm run format:check`, `npm run lint:md`, `npm run docs:validate-links` pass.

## Review Triage Log

Round 1: pending.
