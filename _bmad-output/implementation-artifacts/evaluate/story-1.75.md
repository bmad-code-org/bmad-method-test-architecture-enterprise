---
title: 'Name a report-operation signature collision at check, before the run'
type: 'feature'
created: '2026-10-03'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'c041cf9655d93a0f00bcb44412f563e6f44fe7a1'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.65.md'
---

<frozen-after-approval reason="owner delegated Story 1.75 build and merge through the Evaluate relay">

## Intent

**Problem:** Two HTTP interfaces that serve their release at one method and path each declare a report operation, and eval-quality refuses the contract with `duplicate-operation-signature`. `check` exits 0 for that registry and `run` exits 4 at compile.

**Approach:** Route B. When the probes' deployments name report operations on two or more interfaces, `check` runs the engine's own `compile` stage and quotes a `duplicate-operation-signature` refusal as a `historical` finding, so TeA computes no verdict of its own (AD-1). The engine keeps its contract-wide scope: defect signatures bind a home operation by method and erased path with no interface ID (AD-40), so scoping the refusal per interface would make that binding ambiguous and needs an engine release.

## Boundaries & Constraints

**Always:** Reach the engine only through `runEngineStage`. Quote the engine's refusal line verbatim; it names both interfaces, both operation IDs and the shared method and path. Write nothing under the evaluation folder: the compile output and record go to a private temporary directory removed afterward. Leave `check` quiet when compile exits 0, or reports another refusal, a fault or no result (those stay the `compile` check's and `run`'s findings).

**Never:** Compute or compare method and path templates in TeA. Add an engine release or change eval-quality. Call compile when no probe names report operations on two interfaces.

## I/O & Edge-Case Matrix

| Scenario           | Input / State                                                                                     | Expected Output / Behavior                                                                                                     | Error Handling                        |
| ------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| Collision          | Two HTTP interfaces, report operations with one method and path, a `historical` probe naming both | `check` exits 10; one `historical` finding quoting the engine line with both interfaces, both operation IDs and `GET /release` | None                                  |
| Distinct paths     | Same registry, report paths differ                                                                | `check` exits 0                                                                                                                | None                                  |
| One report         | A probe names a report for one interface                                                          | No compile call; no finding                                                                                                    | None                                  |
| Other refusal      | Compile exits 4 for another cause                                                                 | No finding from this rule                                                                                                      | Left to the `compile` check and `run` |
| Engine unavailable | The stage cannot start                                                                            | No finding from this rule                                                                                                      | Left to `run`                         |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/check.js`: `checkProbes` (~1022) gathers each historical probe's deployments and calls `historicalBoundaryProblems`; `reportsProblems` (`release-report.js`) validates each report. Add the collision rule beside them; `checkEvaluation` (2022) has no scratch directory today.
- `cli/lib/evaluate/engine-cli.js`: `runEngineStage('compile', ...)`, documented exits 0, 4, 5, 64; pattern at `ci.js` baseline staleness and `preflight.js` ~813. Reuse; do not change.
- `test/test-evaluate-check.js` (`test:evaluate-check`): `plantApiHistorical`, `reportOf`, `TWO_INTERFACE_DEPLOYMENTS`, `historicalFindingsOf`. The extra interface's report operation clones `report-release`, so every two-interface fixture shares `GET /release` today.
- `docs/reference/tea-evaluate-cli.md` `### Against deployments` (~590-592): sentence "`check` exits 0 for such a registry, and `run` exits 4 with the compile refusal" is replaced.
- `test/test-evaluate-arms.js` `checkHistoricalReference` (~2627): reads the section; add the limit-sentence assertion.
- `CHANGELOG.md`, `_bmad-output/implementation-artifacts/evaluate/sprint-status.yaml`.

## Tasks & Acceptance

**Execution:**

- [x] `test/test-evaluate-check.js`: give `plantApiHistorical`'s extra interfaces a distinct report path by default, add a `collide` option, and cover the matrix (collision, operation IDs and signature, distinct clean, one report, other refusal, engine unavailable).
- [x] `cli/lib/evaluate/check.js`: add the rule; stage compile in a private temporary directory.
- [x] `docs/reference/tea-evaluate-cli.md`, `test/test-evaluate-arms.js`: replace the limit sentence; hold it with a reading case.
- [x] `CHANGELOG.md`, sprint row, this record: behavior, route reason, revert observations, gates.

**Acceptance Criteria:**

- Given the colliding registry, when `check` runs, then it exits 10 with one finding naming both interfaces and operation IDs and `GET /release`; reverting the rule exits 0.
- Given distinct report paths, when `check` runs, then it exits 0; a rule that flags any two report operations fails.
- Given the reference, when its section is read, then the limit sentence is absent and the new behavior stated; restoring the sentence fails.
- Given the record, when read under its route heading, then it names route B and the reason.

## Implementation Notes

- `release-report.js`: `reportedInterfaces(deployments)` lists the interface IDs whose `reports` entry names an operation, across both sides.
  `signatureCollisionLine(contractPath, env)` makes a private directory under the system temporary directory (`fs.mkdtempSync`, mode 0700), runs `runEngineStage('compile', ['--in', contract, '--out', <private>/eval-contract.json])` with the stage record also in the private directory, and removes it in a `finally`.
  It returns the first line of the stage's output that holds `duplicate-operation-signature:` when compile exits 4, and `null` for every other outcome (exit 0, another exit 4 refusal, 5, 64, a stage that cannot start, a signal, an undocumented exit).
  TeA compares no method or path template.
- `check.js`: `checkProbes` notes the first `historical` probe whose deployments name reports on two or more interfaces and, after the loop, `checkReportCollision` calls the rule once for the whole contract and adds one `historical` finding to that probe: the engine's line in parentheses and what to change.
  A registry with no such probe makes no compile call.
- The engine's refusal (eval-quality 5.x, read live): `eval-quality: duplicate-operation-signature: EvalContract.permittedInterfaces[logicalId=ledger].operations[operationId=report-ledger-release]: collides with permittedInterfaces[logicalId=grader].operations[operationId=report-release] after parameter-name erasure ("GET /release") among api-shaped operations (AD-19, AD-40)`, on stderr, exit 4.
- Tests (`test/test-evaluate-check.js`): `plantApiHistorical` gives each extra interface's report operation the path `/<id>/release` and takes `{ collide }` to leave it at `GET /release`; `checkReportSignatureCollision` covers the matrix (collision with the engine's own line quoted and nothing written under the folder or left in the temporary directory, distinct paths, a stand-in engine that proves the quote and the single compile call, one report with no compile call, another refusal, an engine that cannot start).
  The unserved-interface case's hand-planted `status` operation moved to `/status/release`, since it collided too.
- Docs: `### Against deployments` replaces the sentence that `check` exits 0 for such a registry; `checkHistoricalReference` (`test:evaluate-arms`) reads the new sentence and the absence of the old one.
  The Story 1.65 `CHANGELOG.md` line that stated the limit now points here.

- Round 1 review repair: the finding text names the operations the quoted line names (an unrelated collision is not blamed on reports), `signatureCollisionLine` catches only `EngineStageError`, exit 4 is the constant `COMPILE_REFUSED`, and `checkEvaluation` takes `env` (the CI plan and preflight pass theirs) so `check` and the run's own compile use one engine.
  The stand-in engine takes `SHIM_EXIT` and `SHIM_STREAM`; new cases cover compile exit 5, exit 64, an exit 4 with no collision line, a collision line on stdout, and two qualifying probes (one finding on the first, one compile call).
  The `historical` row of the rules table names the finding and `checkHistoricalReference` reads it.
  `test:evaluate-check` passes 1,095 checks after the repair.
- Deferred to Story 1.77 (appended to Epic 1, lane 1): a probe that names one report colliding with an ordinary `api` operation, and two probes that each name one report. The trigger stays at two reported interfaces here, as the frozen Intent says.

- CI chain 6/12 on round 2's head cfe68ba0 failed `test:evaluate-confinement`: `checkPrivateDirectorySources` counts `mkdtempSync(` per file under `cli/lib/evaluate/` and holds a private directory of the evaluation layer to `makeScratchDirectory`. A real defect, not machine load, so no rerun. `signatureCollisionLine` now stages through `makeScratchDirectory` and `releaseScratchDirectory` with a scratch list of its own, leaving the per-file counts at the expected set; `test:evaluate-check` passes 1,098 checks and the count matches.

## Route

Route B: `check` calls the engine's own compile and quotes its refusal.
Reason: eval-quality's refusal is contract-wide on purpose (AD-40), since a defect signature binds its home operation by method and erased path with no interface ID, so scoping the refusal per interface (route A) would make that binding ambiguous and needs an engine release this story may not make.
Route B keeps AD-1 whole: TeA compares no template and computes no verdict, and the finding is the engine's line.

## Spec Change Log

## Review Triage Log

Round 1 (edge case, blind, verification gap; three Opus reviewers):

- Gate too narrow (blind 1): **medium**, deferred to Story 1.77. A probe that names one report, or two probes that each name one, still reach `run` at exit 4 when that report collides with an ordinary `api` operation of another interface. The frozen Intent and matrix limit the call to two reported interfaces, and widening that is a story of its own (RELAY.md standing rule).
- Finding blames report operations for an unrelated collision (edge 1, blind 2): **medium**, patch. The engine's line can name two non-report operations in a contract that also has two reported interfaces; the finding text then prescribes the wrong fix. Reword the finding around the operations the quoted line names.
- Compile has no timeout (edge 2, blind 3): **low**, rejected. Every other engine stage (`run`, `preflight`, CI `compile`) spawns without one too, and the CI job has its own cap; a bound here adds a parameter to `runEngineStage` for a hung engine that `run` meets first.
- `rmSync` could throw in `finally` (edge 3): **low**, rejected. The directory is a fresh private `mkdtemp` directory of this process; no case reaches EPERM or EBUSY.
- Needle fallback strips quotes (edge 4, blind 12): **medium**, patch. The interface assertion also passes on operation IDs; assert `logicalId=grader` and `logicalId=ledger`.
- Bare `catch` swallows everything (blind 4): **medium**, patch. Catch only `EngineStageError`; a temporary-directory failure or a programming error must not read as "no collision".
- Killed `check` leaves a temporary directory (blind 5): **low**, rejected. The window is one compile of about 0.3 s, the directory holds only the compile output, and the fix needs scratch recovery for a command that has none.
- Quiet outcomes untested (blind 6): **medium**, patch. Add shim cases for exit 5, exit 64 and an exit 4 with no matching line, and one where the collision line is on stdout.
- Rules table row for `historical` does not name the new finding (blind 7): **medium**, patch. Add it to the row and to the arms reading case.
- One quote per run, loose substring match (blind 8): **false** for the first part (eval-quality's `checkDuplicateOperationSignature` throws at the first collision, so there is one line); **low** for the anchor, rejected, since no other compile refusal names the code in its message.
- Bare exit `4` (blind 9): **low**, patch (a named constant, a direct correction).
- Compile runs on a contract that already drew findings (blind 10): **low**, rejected. The cost is one 0.3 s spawn on a path that is already failing, and the guard adds a branch.
- Diff lacks the record and the sprint row (blind 11): **false**. Planning files are gitignored by design and join the PR with `git add -f`; the record is the claims file the reviewer was given.
- Double possessive in the reference (blind 13): **low**, patch (a direct wording fix).
- Several probes: one compile and one finding untested (verification gap 1): **medium**, patch. Add a case with two qualifying historical probes: one finding on the first probe, one compile call.
- `env` not threaded (verification gap, other): **medium**, patch. `checkEvaluation` takes `env` and the CI and preflight call sites pass theirs, so `check` and the run's own compile choose one engine.

Round 2 (blind, edge case, verification gap; fresh Opus reviewers on the repaired diff):

- Finding still says "api operations" and blames report paths for any collision (blind 1): **medium**, patch. The engine also refuses cli and mcp identities and any two operations, so the text must claim only what the quoted line says.
- Unusable temporary directory crashes `check` (edge 1, verification gap other, reproduced with `TMPDIR=/nonexistent`): **medium**, patch. Round 1's narrowed catch left `mkdtemp` failures to propagate; an unusable staging directory is a reason the rule cannot run and stays quiet like an engine that cannot start.
- `EngineUnavailableError` from the engine path lookup is not caught (edge 4): **low**, patch (one more class in the same catch; the docs say an engine that cannot start draws no finding).
- Docs and CHANGELOG list the quiet outcomes without a killed stage or an undocumented exit (blind 2): **low**, patch (wording only). A silent skip stays: `run` reports an engine that cannot start, and `check` writes nothing by design.
- Compile record deleted, `log` not passed, substitution unannounced (blind 3, edge 3): **low**, rejected. The quoted engine line is the evidence the finding carries, `check` writes nothing outside a private directory (frozen Boundaries), and the substitution notice belongs to the stage records of `run`.
- `run` and the CI plan compile twice (blind 4): **low**, rejected. One 0.3 s spawn on a path with two reported interfaces; the accepted cost is recorded here.
- Undocumented exit and signal have no test (blind 5): **low**, patch (one more `SHIM_EXIT` case).
- No case shows `preflight` or `run` stopping at `check` for a collision (blind 6): **medium**, patch. The CHANGELOG states that `run` used to exit 4 and now stops earlier; add a `preflight` case.
- One fixture still builds a colliding contract (blind 7): **medium**, patch. `checkReportOperationReusedAcrossInterfaces` clones the whole grader interface; give the clone paths of its own so Story 1.77 does not turn it red.
- `checkEvaluation` JSDoc omits `platform` and `env` (blind 8): **low**, patch.
- Staging ignores the caller's `TMPDIR` (edge 2): **low**, rejected. `os.tmpdir()` reads the process environment, the caller's `env` chooses the engine, and nothing in production passes a different one.

Round 3 (regressions and material defects only; one fresh Opus reviewer on the round 2 repair commit): no material findings. The reviewer re-ran `test:evaluate-check` (1,098 checks), ESLint and Prettier. The missing-temporary-directory case runs the real engine on the colliding folder and fails without the catch. Not material: the `EngineUnavailableError` branch has no case of its own (the existing engine-unavailable case raises `EngineStageError`).

## Design Notes

Route B record: eval-quality's refusal is contract-wide on purpose (AD-40). A defect signature is a method plus erased path and has no interface ID, so `resolveHomeOperation` is unambiguous only because compile refuses duplicates. Route A would need a schema change and an engine release. Quoting the engine's line keeps AD-1 whole and also covers a report operation colliding with any other `api` operation.

## Verification

**Commands:**

- `npm run test:evaluate-check` and `npm run test:evaluate-arms` -- expected: pass
- `npm test` -- expected: the full gate passes
- `npm run docs:validate-links`, `npm run docs:build`, `npm run test:release-metadata` -- expected: pass
- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.evaluateTarget !== 'function') process.exit(1)"` -- expected: exit 0

## Revert observations

Each exercised once on a scratch copy of the final tree (`rsync` without `.git`, `node_modules` linked, under the session scratchpad), one edit at a time, restored after.
The unmodified copy passes `node test/test-evaluate-check.js` with 1,090 checks. Counts are failed checks.

- The rule dropped (`checkReportCollision` never called): 12 fail, among them the collision case (exit 0 in place of 10) and the stand-in quote case.
- A rule that flags any two report operations (the compile line replaced by a collision line whenever the engine accepts): 9 fail, among them the distinct-path clean case and the two-interface clean case.
- Compile called for a probe that names one report: 2 fail (the one-report case, the compile call count).
- The private temporary directory not removed: 2 fail (the leftover assertions).
- Another refusal quoted as the finding: 1 fails (the other-refusal case).
- The reference's limit sentence restored: 1 of 157 `node test/test-evaluate-arms.js --reported-interfaces-only` checks fails.

## Gates

- Engine check (`evaluateTarget` is a function) exit 0.
- Green: `test:evaluate-check` 1,090, `test:evaluate-arms` 728, `test:evaluate-preflight` 324, `test:evaluate-ci`, `test:evaluate-api` 4,453, `test:evaluate-run` 571, `test:evaluate-workflow` 165, `test:evaluate-guidance`, `test:evaluate-boundaries` 448, `test:direction`, `test:boundary`, `test:schema-versions`, `test:schemas`, `test:doc-claims`, `test:doc-counts`, `test:doc-claim-sources`, `test:doc-invocations`, `test:changelog`, `test:shards`, `test:ci-coverage`, `test:release-metadata`, `lint`, `lint:md`, `format:check`, `docs:validate-links`, `docs:build`.
- `git diff -- package.json package-lock.json` is empty.
- Unrun: the full `npm test` (CI shards).
- Digests and evidence bytes refreshed: none. `test/fixtures` keeps its bytes; the cases write to temporary copies.
