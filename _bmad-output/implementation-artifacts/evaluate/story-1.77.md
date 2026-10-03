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

**Approach:** The trigger becomes any `historical` probe that names a report operation. The compile is contract-wide, so one compile and one finding cover every probe. The finding is worded around the two operations the engine's line names, whichever kinds they are. TeA still compares no template (AD-1).

## Boundaries & Constraints

**Always:** Reach the engine only through `runEngineStage`; quote the engine's line; write nothing under the evaluation folder; stay quiet for every outcome other than the `duplicate-operation-signature` refusal.

**Never:** Compute or compare method and path templates in TeA. Call compile when no `historical` probe names a report. Change eval-quality.

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/check.js`: `checkProbes` collects each `historical` probe's reported `(interface, operation)` pairs (`reportedOperations`); `checkReportCollision` compiles once, keeps the refusal only when its line names a reported pair (`lineNamesOperation`) and places the finding on the first probe whose report the line names.
- `docs/reference/tea-evaluate-cli.md`: `### Against deployments` and the `historical` row of the rules table.
- `test/test-evaluate-check.js`: `checkReportCollidingWithAnyOperation`, `plantCollidingOrdinaryInterface`, and the one-report cases of `checkReportSignatureCollision`.
- `test/test-evaluate-arms.js`: `checkHistoricalReference` reads the widened wording and fails while "two or more interfaces" remains.
- `epics.md` "Parallel lanes" and `sprint-status.yaml` `parallel_lanes`: synced to the `LANES.md` table (Kerem's rebalance of 2026-10-03).

## Design Decisions

- The first build kept every `duplicate-operation-signature` refusal once a probe named a report. Round 1 (edge, blind) showed that is wrong: every valid deployments probe names a report, so the rule fired on any collision of the contract, including `cli` pairs, and took over the CI plan's `compile` check. The finding is now kept only when the engine's line names an operation a probe's report names, as `logicalId=<interface>].operations[operationId=<operation>]`. This matches identifiers on the engine's own line and compares no template (AD-1).
- The engine names the first collision it meets, so a report collision behind an unrelated one shows after that one is fixed; TeA cannot reach it without comparing templates (AD-1). The reference and CHANGELOG say so.
- The finding is worded around "a deployment's report operation shares an identity with another operation", since the other operation can be a report or an ordinary one.
- A collision between operations no report names makes no finding here and stays the CI plan's `compile` check; with no probe naming a report there is no compile call either.
- Two probes that each name a report for a different interface are refused by Story 1.65's coverage rule already; the case holds the one collision finding beside those findings. Epics AC 2 and the test-design row are amended to say so.

Round 2 (adversarial and edge, verification): the adversarial and edge reviewer found cross-probe collection untested (**medium**, patched with a case where only the second probe's report collides), the finding sitting on a probe whose own report does not collide (**low**, patched: it sits on the first probe whose report the line names), a report collision hidden behind an earlier one (**low**, documented) and a stale code map (**low**, patched).

## Verification

- `npm run test:evaluate-check` (1126 checks) and `npm run test:evaluate-arms` (732 checks) pass.
- Revert observations: narrowing the trigger back to `> 1` fails 11 checks; compiling for any `historical` probe, keeping every refusal, and the 1.75 wording each fail their own cases (round 1 verification).
- `npm run lint`, `npm run format:check`, `npm run lint:md`, `npm run docs:validate-links` pass.

## Review Triage Log

Round 1 (blind, edge case, verification gap; three Opus reviewers):

- The finding fired on every engine collision once a probe named a report, `cli` pairs included (edge 1, blind 1): **medium**, patched. Kept only when the line names a reported interface and operation ID; cases for an `api` pair, a `cli` pair and the report's operation ID on another interface.
- The ordinary-only case had no `historical` probe, so "compile for any historical probe" survived (verification 1): **medium**, patched. The case plants a `fixCommit` probe and asserts the engine refuses the fixture.
- The wording guard banned only the 1.75 strings (verification 2): **low**, patched. It asserts `report operations` is absent and `shares an identity with another operation` is present.
- AC 2 and the CHANGELOG overstated the two-probe case (verification 3, blind 2): **low**, patched. The case was already refused by Story 1.65's coverage rule; AC, test-design row and CHANGELOG say so.
- The reference said the other operation is on another interface (blind 1): **low**, patched to "of the contract".
