---
title: 'Story 1.39: Tell a captured value too large to launch from a target that cannot run'
type: 'feature'
created: '2026-10-01'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'f15bc83b'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Stories 1.18 and 1.39)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.39 section, and the Story 1.18 section for the fixtures it extends)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-1, AD-7, AD-10)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.18.md (the skip this story extends)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** a `captured` binding sends the value an earlier step's target printed. A command step that value makes too large for the system's argument and environment limit fails to launch, and eval-quality's command-line adapter reports that as a plain `port-failure` carrying the spawn's `E2BIG` as its cause, the same fault as a target that could not start. The run stops with exit 12 and reads the printing target's own output as an unfit harness. Story 1.18 already skips a step whose captured value the request cannot carry for every reason it can decide before the launch (`captured-value-unsendable`); the size limit belongs to the system, and only the launch knows it.

**Approach:** eval-quality's command-line adapter reports a launch the system refused for its argument and environment size as a `port-failure` fault carrying the `portFailureReason` `launch-too-large` (released as a minor version; the coordinator makes that change in eval-quality first). TeA's arm runner reads that field on a command step: a step with at least one `captured` binding is not issued and the arm's evidence lists it as `captured-value-unsendable`, naming each captured binding of the step and eval-quality's reason; a step with only literal bindings keeps stopping the run with exit 12, since the contract itself cannot be sent. TeA's devDependency and peer floor rise to the release with the engine check at start and end.

## Boundaries & Constraints

**Always:** eval-quality's reason decides; TeA reads `error.portFailureReason` off the fault as it already reads a policy denial's `reason`, and computes no size of its own (AD-1). The skip is recorded as every other not-issued step is, in the arm's `steps` as `{ stepId, operationId, skipped }`, with no observation, no isolation-manifest call and no record of a call. `engine.js` stays the one runtime file that loads eval-quality; every run-directory write goes through `run-directory.js`. A command step whose launch the system refuses and whose bindings are all literal stops the run with exit 12 as before. The engine check runs at start and end. The peer floor in `package.json` and the lockfile move to the released version and `devDependency` stays `latest`.

**Never:** A size limit, an `ARG_MAX` probe or a byte count in TeA. Skipping a literal-only step for its size. Reading the fault's message or the spawn's `E2BIG` code to decide (the `portFailureReason` is the contract). A new dependency. Releasing eval-quality without two Opus review rounds.

**Decisions (coordinator, owner-delegated):**

- The reason is `launch-too-large`, carried on `fault.portFailureReason` (eval-quality's typed `PORT_FAILURE_REASONS`). It rides on a field of its own because widening `RuntimeFault.reason` would break TypeScript consumers that narrow it (engine review, 2026-10-01); `reason` stays the policy denial's.
- The skip names every captured binding of the step (`binding`, `pointer`, and a `reason` text that carries eval-quality's reason), since a refused launch cannot say which value made it too large.
- The skip covers command steps only: an HTTP request or a tool call has no spawn limit in this adapter, and the MCP adapter's spawn is a separate story if a target ever needs it.
- A step with captured and literal bindings together is a skipped step; the literals alone are not the cause the system can name.

## I/O & Edge-Case Matrix

| Scenario                 | Input / State                                                                           | Expected Output / Behavior                                                                      | Error Handling                             |
| ------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Oversized captured value | `create` prints an identifier past the system limit; `read-back` binds it as `captured` | `read-back` is not issued, `steps` lists it `captured-value-unsendable` with `launch-too-large` | run exits 0, probe outcome is not `caught` |
| Oversized literal        | a command step whose literal binding is past the limit                                  | run stops with exit 12 and the fault                                                            | contract defect, not a target behavior     |
| Normal captured value    | captured identifier within the limit                                                    | step issued as in Story 1.18                                                                    | N/A                                        |
| Other launch failure     | executable missing (`ENOENT`) after a captured binding                                  | run stops with exit 12 as before                                                                | no reason, not a size refusal              |

</frozen-after-approval>

## Code Map

- eval-quality `/Users/murat/opensource/bmad-eval-quality`: `src/core/schemas/faults.ts`, `src/adapters/command-line-adapter.ts`, `src/adapters/port-boundary.ts`, docs and CHANGELOG (a Sonnet build worker; two Opus review lenses; minor release per RELAY.md).
- `cli/lib/evaluate/arm.js` (the command branch around 774 and the `port.probe` call around 810; `faultRecord` near 316): catch the fault on a command step, decide skip or rethrow, record the skipped step.
- `cli/lib/evaluate/http-port-host.js` and the port wrapper that rebuilds a fault (near 76) and `http-target.js` (near 927): carry `portFailureReason` on a `port-failure` fault where they today carry `reason` on a denial; the command port host if it has its own wrapper.
- `test/test-evaluate-workflow.js` (the Story 1.18 fixture, `checkUnits`, the `captured-value-unsendable` cases around 331 to 500 and the reference reading case near 1329): the cases below. `test/fixtures/evaluate-workflow/`: the fixture whose `create` prints an oversized identifier in named workspaces.
- `docs/reference/tea-evaluate-cli.md` (`### Steps not issued` at 436); `CHANGELOG.md` `## [Unreleased]`.
- `package.json` (peer floor), `package-lock.json`, the engine install hint if it names the floor (as Story 1.35 did).
- `epics.md` and `test-design-epic-1.md`: amend in place, dated 2026-10-01, only where the build departs from the plan text.
- Skill gate: grep `src/workflows/testarch/bmad-testarch-evaluate/` for `captured-value-unsendable` and steps not issued; if guidance states the skip causes, edit it through `/bmad-workflow-builder` Edit per Build Rules, otherwise record that none does.

## Tasks & Acceptance

**Execution:**

- [ ] eval-quality: the `launch-too-large` `portFailureReason`, its tests with revert observations, docs, CHANGELOG; two Opus review rounds; merge; minor release; `npm view eval-quality version` -- AC 1, 2
- [ ] `arm.js` and the port wrapper: read the reason, skip a captured-bound command step, rethrow a literal-only one -- AC 1, 2
- [ ] fixture, `test-evaluate-workflow.js` cases, reference sentence and its reading case, CHANGELOG, plan amendments, peer floor and lockfile -- AC 1, 2, 3

**Acceptance Criteria:**

- Given the release and Story 1.18's workflow fixture, whose `create` prints an identifier larger than the system's argument limit in the workspaces a test names, when `tea-evaluate run` runs, then the dependent step is not issued, the trial's evidence lists it as `captured-value-unsendable` naming the binding and eval-quality's reason, the run exits 0 and the probe's outcome read from the evidence artifact is not `caught`; stopping the run on the fault as before makes the case exit 12.
- Given a command step with only literal bindings the system refuses for its size, then the run stops with exit 12; skipping it as well lets the unit pass a contract defect.
- Given the reference, then `### Steps not issued` names the size limit among the values the request cannot carry, and the case reading the section fails when that sentence is removed.

## Verification

**Commands:**

- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.evaluateTarget !== 'function') process.exit(1)"` -- expected: exit 0
- `npm run test:evaluate-workflow && npm run test:evaluate-arms` -- expected: green
- `npm run lint && npm run lint:md && npm run format:check` -- expected: green
- `npm run docs:validate-links && npm run docs:build` -- expected: green
- `npm run test:release-metadata` -- expected: green
- `npm test` -- expected: green (about 10 minutes, runs in CI shards)

## Implementation Notes

- Built directly from the spec by the build worker. The engine is eval-quality 4.5.0 as published plus the engine branch's tarball (eval-quality PR #171), installed with `npm install --no-save`; `package.json` and `package-lock.json` are untouched and the coordinator raises the peer floor and the lockfile after the release.
- Engine carriage, as the coordinator's mid-build message set it: the adapter throws `RuntimeFault` code `port-failure` with `portFailureReason: 'launch-too-large'` and the spawn error as `cause`; `RuntimeFault.reason` keeps its type.
  `hostEnvironmentPort` mutates and rethrows the same fault object (message and `scrubbedCause` only), so the field passes through unchanged; no wrapper in the command path rebuilds a fault (`registry.createProbePort` returns the adapter's `probe` directly, and `http-port-host.js` and `http-target.js` serve `api` steps only).
- `cli/lib/evaluate/arm.js`: `boundValues` returns a `captured` list of every captured binding of its channel in the existing site shape `{ binding, pointer }`, and `runArm` gathers it per step (`capturedSites`).
  The `port.probe` call sits in a `try`; a fault where `isLaunchTooLarge(error)` (code `port-failure` and `error.portFailureReason === 'launch-too-large'`, read off the fault and nowhere else) on a `cli` step with at least one captured binding is recorded as `{ stepId, operationId, skipped: { reason: 'captured-value-unsendable', bindings } }` and the loop continues.
  Each binding carries `binding`, `pointer` and a `reason` text that names `launch-too-large`.
  Every other fault is rethrown unchanged, so a literal-only step, a `port-failure` with no such reason, another code, and an HTTP or tool-call step still stop the run (`run.js` exits 12).
  The step never reaches `issued`, `sequence`, `stepObservations` or `steps` as an issued entry, so `run.js` counts no call and writes no observation; a later step naming it in `after` skips as `after-step-not-issued` through the existing check, and one capturing from it skips as `captured-value-absent`.
  `faultRecord` records `portFailureReason` beside `reason` when the fault carries it, so a stopped run's evidence keeps it.
- `eval-quality.config.json` `doc-claims` `symbols.foreign` gains `portFailureReason` (a field of an eval-quality `RuntimeFault`), since the reference now spells it.
- Fixture: `test/fixtures/evaluate-workflow/bin/records.js` prints a 2 MiB identifier from `create` in the workspaces `RECORDS_OVERSIZE_ID` names (the record is still stored under the short identifier), and `evaluation.json` permits that variable as an environment key.
  The channel is `read-back`'s `option.id`, which reaches the launch as `--id <value>`; 2 MiB is past macOS's 1 MiB limit for the whole vector and Linux's 128 KiB limit for one argument.
  The fixture's two label checks now go through one `names` helper that matches no workspace for an unlabelled run (the old `split(',').includes(workspace ?? '')` matched `''` when the variable was unset).
- Tests, `test/test-evaluate-workflow.js` (148 checks): `checkOversizedValue` (real eval-quality, `run` exit 0, each mutated trial's evidence ending in the skipped `read-back` with no `request` or `observation`, binding `option.id`, pointer, reason naming `launch-too-large`, records holding the `create` observation alone, tool-call counts in records and manifests, the store logging no read, no `caught` vote and the clean control passing after `score`) and `checkLaunchTooLarge` (skip and chained `after-step-not-issued`; every captured binding named across two channels beside a literal; literal-only step throws; a `port-failure` with no reason, another port-failure reason, the reason under another code and `reason` alone throw; the wrapper keeps the field and `scrubbedCause`; `faultRecord`; HTTP and tool-call steps throw; the real command-line adapter refuses a 2 MiB literal through the registry's port with the field).
  The header comment lists both cases, and `checkReference` gains the size-limit assertion.
- Docs: `docs/reference/tea-evaluate-cli.md` `### Steps not issued` gains the size-limit sentences; `CHANGELOG.md` `### Added`.
- Skill gate: grep of `src/workflows/testarch/bmad-testarch-evaluate/` for `captured-value-unsendable`, `unsendable`, `not issued` and `captured-value` finds one line, `references/contract.md` line 412, which says "A missing or unsendable capture leaves the dependent step unissued and must appear in preflight".
  It states no list of causes and stays true with the size limit, so no `/bmad-workflow-builder` run was needed.
- Shard weight: `test:evaluate-workflow` took 22 seconds against its weight of 25, so `tools/test-shard-weights.json` is unchanged.

### Departures from the plan text

- The plan and the frozen section name `reason` as the carrier; the engine review moved the value to `portFailureReason`, so the arm reads and records that field. Amended in place, dated 2026-10-01, in `epics.md` (Story 1.39's engine consumption paragraph) and `test-design-epic-1.md` (Story 1.39's section). The frozen Decisions still say `reason`; the coordinator amends them.
- The fault record gains `portFailureReason`, which the plan does not mention; the coordinator's message asked for it.
- The unit set is wider than the plan's two units: it also holds the other fault shapes, the wrapper, the record and the non-command kinds.
- The integration case uses a 2 MiB identifier, not the 4 MiB the brief suggests, which exceeds both limits and keeps the run artifacts smaller.

## Review Triage Log

(none yet; the coordinator runs the reviews)

## Revert observations

Each check exercised once: undo the change locally in `cli/lib/evaluate/arm.js` or the reference, run `npm run test:evaluate-workflow` (148 checks when green), restore from a saved copy (`cmp` confirmed each restore byte for byte). Counts are of the final build on the reworked engine (`portFailureReason`); a first pass on the earlier `reason` carriage gave the same shapes.

- AC 1, stopping on the fault as before (the catch made unreachable): 5 of 135 fail, among them "a run whose mutated trials print an oversized identifier exited 12; expected 0" and the three arm units; the case catches the exit 12 as the spec says.
- AC 1, the arm reading `error.reason` instead of `error.portFailureReason`: 6 of 135 fail (the same as above plus "the reason field alone after a captured binding").
- AC 1, the skip naming only the first captured binding: 1 of 148 fails ("a step with captured and literal bindings recorded ...").
- AC 1, the binding's reason text without `launch-too-large`: 5 of 148 fail (the unit, the mixed-bindings unit and the three mutated trials' evidence).
- AC 1, any `port-failure` skipped (the reason test dropped): 3 of 148 fail (no reason, another port-failure reason, `reason` alone).
- AC 1, the reason accepted under any code: 1 of 148 fails ("the port-failure reason under another code ...").
- AC 1, every kind skipped (the `cli` test dropped): 2 of 148 fail (the HTTP request and the tool call).
- AC 1, `faultRecord` not recording `portFailureReason`: 1 of 148 fails ("the fault record of a refused literal-only step is ...").
- AC 2, a literal-only step skipped as well (the captured-binding test dropped): 4 of 148 fail ("a literal-only step the system refuses for size gave [{\"reason\":\"captured-value-unsendable\",\"bindings\":[]}]", the wrapper unit, the fault-record unit and the real-adapter unit).
- AC 3, the size-limit sentences removed from `### Steps not issued`: 1 of 148 fails (the reference case); removing only the literal-only sentence fails the same case.

## Gates

- Engine check (`evaluateTarget` is a function) exit 0 at the start and at the end; `PORT_FAILURE_REASONS` exports `launch-too-large` from the installed tarball; `git diff -- package.json package-lock.json` shows no change and no `file:` or `.tgz` spec.
- Green on the last state of the tree: `test:evaluate-workflow` 148 checks, `test:evaluate-arms` 536, `test:evaluate-boundaries` 306, `test:direction`, `lint`, `lint:md`, `format:check`, `docs:validate-links`, `test:release-metadata`, `test:doc-claims`, `test:doc-counts`, `test:ci-coverage`, `test:shards`, `test:changelog`.
- Formatting: Prettier realigned the frozen section's I/O matrix table in this file (whitespace only), since `lint:md` and `format:check` read the record.
- Unrun: the full `npm test` (CI shards) and `docs:build`. Until eval-quality ships the release, the registry's 4.5.0 lacks the field and the new integration and real-adapter checks fail against it; the coordinator raises the peer floor and the lockfile after the release.

## Left undone, reported

- The MCP adapter's spawn of a tool server has no size reason; the plan scopes that to a story of its own if a target needs it.
- `http-port-host.js` and `http-target.js` carry `reason` on the faults they rebuild and not `portFailureReason`; their `port-failure` faults come from process failures that name no such reason, so nothing reads it there.
- The confined command mechanism (Seatbelt, Bubblewrap) wraps the spawn; the new checks run the real adapter unconfined and the integration case runs with `confinement` off (the fixture's log opts out), so a confined launch's `E2BIG` reaching the adapter as the same fault is unproved here.
