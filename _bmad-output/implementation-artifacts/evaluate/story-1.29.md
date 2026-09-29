---
title: 'Record what a live run spends'
type: 'feature'
created: '2026-09-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'f3abd8521c8588018817672f78705ec595c5ccf9'
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md'
---

<frozen-after-approval reason="Owner delegated the relay story and its delivery decisions">

## Intent

**Problem:** Live `tea-evaluate run` trials always claim zero input tokens, output tokens and cost even when their target reports use. Readers cannot tell a measured zero from absent telemetry.

**Approach:** Capture validated, target-reported use for each trial, write it into the sealed record and aggregate it in the trial set's isolation manifest. Mark unreported use explicitly in `run.json`. Let `tea-skill-runner` translate supported vendor CLI reports at its adapter boundary.

## Boundaries & Constraints

**Always:** Preserve eval-quality's closed record and manifest schemas, decimal-string money and safe integer token counts. Keep vendor parsing in `cli/lib/agent-adapters.js`. Count only target calls issued by the scored trial. Preserve target output and existing fault behavior. A reported zero remains distinguishable from an absent report. Every criterion needs a demonstrated revert failure.

**Scope:** Support CLI registry targets through a documented vendor-neutral report on stderr, plus the built-in skill runner's supported agent adapters when their CLI reports usage. API and MCP targets remain explicitly unreported until they have a report contract. Invalid reports fail clearly and never become measured zero.

## I/O & Edge-Case Matrix

| Scenario | Input or state | Expected behavior |
| --- | --- | --- |
| Reported use | Each trial's target emits valid token and cost use | Each record holds that trial's numbers; the manifest sums them exactly |
| Reported zero | Target emits a valid zero report | Zero is marked measured |
| No report | Target emits no use | Closed schemas hold zero; `run.json` marks that trial unreported |
| Invalid report | Negative, fractional, overflowing or malformed use | Run fails with an actionable target-report error |
| Several plan steps | Steps report separate use | One trial sums issued step reports once |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/arm.js`: `runArm` issues plan steps and retains CLI observation stderr. Parse the neutral report here or in a narrow helper; keep target observations intact.
- `cli/lib/evaluate/run.js`: `runTrial`, `concludeTrial`, `concludeWithRows`, trial-set construction and `completeRun` carry use into records, manifests and `run.json`. The hard-coded zeroes are near the record and manifest builders.
- `cli/lib/agent-adapters.js`, `cli/lib/run-agent.js`, `cli/skill-runner.js`: adapter-specific report extraction and skill runner emission. Preserve answer stdout and the supervised runner contract.
- `test/test-evaluate-run.js`: `makeProject` and `bin/verdict.js` create real CLI trial fixtures; add reported, unreported, invalid and exact-sum assertions here.
- `docs/reference/tea-evaluate-cli.md`: explain the report source and unreported marker under the exact `## run` heading. The integration test reads that section.
- `_bmad-output/implementation-artifacts/evaluate/sprint-status.yaml` and `CHANGELOG.md`: relay state and Unreleased entry.

## Tasks & Acceptance

**Execution:**

- [x] Define and validate the CLI target report, then propagate per-step and per-trial use without changing eval-quality artifact schemas.
- [x] Translate available built-in agent usage reports in the adapter layer and emit the neutral report from `tea-skill-runner`.
- [x] Record per-trial use, trial-set sums and unreported status; preserve exact decimal arithmetic and fault behavior.
- [x] Add end-to-end fixture assertions and exact-heading documentation assertions; run each criterion's revert check.
- [x] Update reference, changelog and sprint row; run the engine export check, focused tests, documentation gates and `npm test`.

**Acceptance Criteria:**

- Given a CLI target that reports known use, when a multi-trial run completes, then each sealed record holds its trial use and each manifest holds the exact set sum; removing report ingestion fails the fixture assertion.
- Given a target with no report and one that reports zero, when both run, then `run.json` distinguishes unreported from measured zero; removing the marker fails the assertion.
- Given invalid reported use, when a trial executes, then the run fails with a specific error and writes no measured-zero claim; removing validation fails the assertion.
- Given the CLI reference under `## run`, when the usage passage is read, then it names the report source and meaning of unreported; deleting the passage fails the documentation assertion.

## Implementation Notes

- CLI targets report one complete `TEA_EVALUATE_USAGE_JSON:` line on stderr. The report has safe integer `inputTokens` and `outputTokens` and decimal-string `costUsd`. The runtime reads the raw report before the host scrubs the persisted observation. An absent report leaves zero in the closed engine schemas and lists the issued step under `run.json.unreportedResourceUse`.
- `tea-skill-runner` reads Claude's structured JSON report and Codex's JSONL report. Codex currently supplies token counts without cost, so its use remains unreported. The custom adapter passes a complete neutral report through. The agent answer remains on stdout.
- Usage from plan steps and sealed-brief bridge target calls is counted once per scored trial. Preflight and qualification calls are excluded. Decimal money is summed without floating-point arithmetic.
- The approved matrix inside the frozen block needs Prettier spacing changes. `.prettierignore` excludes this story file so the block remains read-only and the formatting gate can pass.

### Revert checks

- Removing report ingestion made `node test/test-evaluate-run.js --usage-only` exit 1; the skill runner report and measured record assertions failed.
- Removing the `unreportedResourceUse` append made the same command exit 1; the no-report trial had an empty marker.
- Removing report validation made the same command exit 1; the fractional-token case was accepted.
- Removing the `## run` report source text made the same command exit 1; the exact-heading documentation assertion failed.
- Each temporary revert was restored. The post-restore usage-only run passed all 34 checks.

### Verification

- Passed: `npm run test:evaluate-run` (423 checks), `npm run test:evaluate-evaluators` (589 checks), `npm run test:evaluate-boundaries` (306 checks), `npm run test:direction`, `npm run test:changelog`, `npm run lint`, `npm run lint:md`, `npm run format:check`, `npm run docs:validate-links`, `npm run docs:build`, and the specified eval-quality engine export check.
- Passed: `npm test`, including its full release gate, lint, Markdown lint and Prettier checks.

## Spec Change Log

## Review Triage Log

- Manual audit covered the usage report parser, safe integer and decimal validation, raw stderr capture before scrubbing, scored-trial aggregation, API and MCP unreported markers, built-in adapter translation, and the `.prettierignore` exception. No verified product defect remains.
- Independent final review subagents were attempted after the full local gate. The weekly Codex allowance refused or stalled those sessions, so the independent review gate was skipped and the manual audit is the recorded review evidence.
- Manual follow-up repaired four concrete gaps: exponent-form Claude costs are normalized to decimal strings, synthetic gameability arms exclude usage accounting, the reference's stale zero-use sentence is corrected, and usage fixtures require run artifacts plus marker shapes.

## Verification

**Commands:**

- `npm run test:evaluate-run`
- `npm run docs:validate-links`
- `npm run docs:build`
- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.evaluateTarget !== 'function') process.exit(1)"`
- `npm test`
