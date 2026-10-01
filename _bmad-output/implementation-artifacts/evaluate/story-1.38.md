---
title: 'Story 1.38: Hold a deployment to the release it reports'
type: 'feature'
created: '2026-09-30'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'b391e31a'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Stories 1.32, 1.36, 1.38)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.38 section, and the Story 1.32 section for the fixtures it extends)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-1, AD-6, AD-7, AD-8, AD-10)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.32.md (the deployment route this story completes)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** a deployment-routed historical probe declares the release identifier each deployment runs (`qualification.deployments.preFix.release` and `.fix.release`), and the run records the digests of those identifiers without asking either deployment which release it runs. A deployment redeployed after the probe was authored is measured under the identifier the probe declares: the qualification arms catch a pre-fix deployment that no longer shows the defect (exit 11), and nothing catches one that still shows it under another release.

**Approach:** each `Deployment` of the probe also names `report`, how the deployment reports its release: `{ operationId, pointer }`, an operation of the contract's `api` interface and an RFC 6901 JSON pointer into the JSON body of its answer. Before either arm, the runtime sends that request to each deployment through the evaluation's HTTP port (the same port and the same eval-quality policy decision every call meets), reads the string at the pointer, and refuses the probe when it is not the declared `release`, naming both identifiers. A denied request, a failed call, or an answer with no string at the pointer refuses the probe with its reason. `check` holds the request's shape under `historical`.

## Boundaries & Constraints

**Always:** The port sends the report request and eval-quality's `evaluateTarget` decides it (AD-1); TeA keeps no HTTP client in `cli/` and computes no verdict. The comparison is an equality of the string read and the declared `release`, TeA's own field. The refusal is recorded as every historical refusal is (`run.json`'s `refused`, `refused/<probeId>.json`) and the clean control still runs, so the run exits 0 as for the other refusals. `engine.js` stays the one runtime file that loads eval-quality; every run-directory write goes through `run-directory.js`. The worktree route of Story 1.9 keeps its behavior. The report request is sent with no bound inputs: a path template with parameters, or a declared request shape that requires an input, is refused by `check`, since nothing binds it. The engine check runs at start and end.

**Never:** An HTTP client in `cli/`. A deployment-routed probe that skips the request because the pointer or operation is missing (both are required). Recording the declared `release` as the reported one. A new dependency. An edit to eval-quality unless the build finds the port or the observation cannot carry a JSON answer body for an `api` operation; if so, stop and report, the coordinator owns that change.

**Decisions (coordinator, owner-delegated):**

- `report` is required on both `preFix` and `fix`. An optional field would leave the gap this story closes; the Story 1.32 fixtures, cases and docs that name deployments gain it.
- The report operation is an operation of an `api` interface of the contract. The deployment answers that interface at the origin its `origins` names for the registry interface the contract interface maps to (read the mapping as the runtime reads it for every call).
- The request is built as an arm builds an `api` step with no bound inputs, sent through the same port `createProbePort({ deployment })` returns for that deployment, so the policy, redirects, ceilings and auth of the entry apply. The report call is not a trial, records no evidence artifact and does not count against any trial budget.
- A success answer is a 2xx status with a JSON body; any other answer has no string at the pointer and refuses the probe with the status named.
- Refusal reasons name the side (`pre-fix` or `post-fix`), the declared release and what was found: the reported identifier, eval-quality's denial reason, the call's fault, or the pointer that found no string.
- A port fault that is infrastructure (the port process broke, a contract violation) still stops the run with exit 12 as it does for any call; only a policy denial and an answer the probe's own declaration cannot be read from refuse the probe.

## I/O & Edge-Case Matrix

| Scenario                      | Input / State                                                               | Expected Output / Behavior                                                                       | Error Handling                           |
| ----------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| Both report what they declare | pre-fix server reports `R1`, post-fix reports `R2`, probe declares the same | qualifies as in Story 1.32; `run.json` records the reported identifiers beside the declared ones | N/A                                      |
| One reports another release   | pre-fix server reports `R9` where the probe declares `R1`                   | probe refused, reason names `R1` and `R9`, clean control runs, exit 0                            | `refused/<probeId>.json` names both      |
| Policy denies the request     | registry authorizes methods that exclude the report operation's method      | probe refused with eval-quality's reason                                                         | nothing sent to the deployment           |
| No string at the pointer      | answer is JSON with a number, object or nothing at the pointer; non-2xx     | probe refused, reason names the pointer and what was found                                       | refusal, exit 0                          |
| Undeclared operation          | `report.operationId` names no operation of an `api` interface               | `check` exits 10 under `historical`                                                              | `run` without `check` stops with exit 12 |
| Not a JSON pointer            | `report.pointer` is `release` or `/a/~2`                                    | `check` exits 10 under `historical`                                                              | as above                                 |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/schemas/committed-probe.schema.json` (`$defs.Deployment`): add required `report` `{ operationId, pointer }`.
- `cli/lib/evaluate/check.js` (`historical` rule around 821 to 900, header doc near 56): operation declared on an `api` interface of the contract, no path parameters and no required input, pointer is a valid JSON pointer (non-empty, starts with `/`, `~` only as `~0` or `~1`).
- `cli/lib/evaluate/historical.js` (`deploymentPair` 431, `qualifyDeploymentProbe` around 507): guard the same rule as defence in depth (exit 12), and send the report request to each deployment after `deploymentAccess` and before the arms, through the port `registry.createProbePort({ deployment })` returns; refuse with the reasons above.
- `cli/lib/evaluate/arm.js` (request building near 730): reuse the step-to-request construction for an operation with no inputs; do not copy it.
- `cli/lib/evaluate/preflight.js` and `run.js`: record the reported identifiers with the deployments in `run.json` if they pass through these files.
- `test/fixtures/evaluate-api/server/grader.js`: a release route the loopback server answers with the release it was started with; the fixture contract and registry gain the report operation.
- `test/test-evaluate-arms.js` (deployment cases around 947 to 1380; header comment near 43 and 67): the cases below. `test/test-evaluate-check.js`: the two `check` cases. Existing cases that name deployments gain `report`.
- `docs/reference/tea-evaluate-cli.md` (`### Against deployments` at 495, and the `historical` rule row in the `check` list); `CHANGELOG.md` `## [Unreleased]`.
- `epics.md` (Story 1.32's amendment note that says "which Story 1.38 adds") and `test-design-epic-1.md`: amend in place, dated 2026-09-30, only where the build departs from the plan text.
- Skill gate: grep `src/workflows/testarch/bmad-testarch-evaluate/` for deployments and `fixCommit`; if any guidance states the probe's deployment shape, edit it through `/bmad-workflow-builder` Edit per Build Rules, otherwise record that none does.

## Tasks & Acceptance

**Execution:**

- [x] schema, `check.js`, `historical.js` (and `arm.js`, `preflight.js`, `run.js` as needed): the `report` field, its `check` rule, the request, the comparison and the refusals -- AC 1, 2, 3
- [x] fixture grader release route, contract and registry operation, existing deployment cases updated -- AC 1, 2
- [x] `test-evaluate-arms.js` and `test-evaluate-check.js` cases, reference section and its reading case, CHANGELOG, plan amendments -- AC 1, 2, 3, 4

**Acceptance Criteria:**

- Given two loopback fixture servers that report their release, when `tea-evaluate run` qualifies the probe, then a deployment reporting a release other than the declared one refuses the probe with both identifiers named in `run.json`'s `refused` and `refused/<probeId>.json`; skipping the comparison lets the mismatched deployment qualify, which the case catches.
- Given a report request the eval-quality policy denies, or an answer with no string at the pointer, then the probe is refused with its reason; recording the declared release unasked lets the case exit 0 with no refusal, which the case catches.
- Given `check`, then under `historical` it refuses a report request naming an operation the contract does not declare, or a pointer that is not a JSON pointer, each as its own case; dropping the rule lets `run` stop with exit 12, which the case catches.
- Given the reference, then `### Against deployments` states the comparison, and the case reading the section fails when its sentence is removed.

## Verification

**Commands:**

- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.evaluateTarget !== 'function') process.exit(1)"` -- expected: exit 0
- `npm run test:evaluate-arms && npm run test:evaluate-check` -- expected: green
- `npm run lint && npm run lint:md && npm run format:check` -- expected: green
- `npm run docs:validate-links && npm run docs:build` -- expected: green
- `npm run test:release-metadata` -- expected: green
- `npm test` -- expected: green (about 10 minutes, runs in CI shards)

## Implementation Notes

- Implemented directly from the spec by the build worker, as Stories 1.8 to 1.11 and 1.32 were: a second implementation agent would have loaded the same context again.
  `/bmad-build` ran its clarify step (the spec has status `in-progress` and a baseline, so it resumed at step 3) and its tasks and acceptance verification; the review layers below ran as opus subagents.
- Engine: eval-quality 4.5.0 as installed. The port and the observation carry a JSON answer body for an `api` operation (`ProbeObservation` body `kind: json`, read by `observedBody` under an `application/json` or `+json` content type), so the coordinator's stop condition did not fire and eval-quality is unchanged.
- New `cli/lib/evaluate/release-report.js`: `reportProblems` (the shared rule `check` and the runtime guard hold), `isJsonPointer`, `quotedIdentifier` and `reportedRelease`.
  `reportedRelease` runs `runArm` over a one-step plan (`release-report`, no bound inputs) through `hostEnvironmentPort`, so the request is built as every `api` step is and `arm.js` needed no change and no copy.
  The pointer is read with eval-quality's own `makeResolveOperand` over `/interactions/release-report/response-body<pointer>`, the reading every `captured` binding already uses, so TeA keeps no pointer reader.
  The file imports nothing external and loads the engine through `engine.js` alone; `test:direction` and `test:evaluate-boundaries` pass.
- `historical.js`: `qualifyDeploymentProbe` builds each deployment's port once, asks the pre-fix deployment and then the post-fix one (`holdToReport`) after `deploymentAccess` and before either arm, and hands the same ports to the arms, so the report request and the arm of a side reach one origin under one authorization.
  `holdToReport` refuses the probe with the side, the declared release and what was found: eval-quality's denial reason (`forbidden-target`), an answer with no string at the pointer (named with the pointer), or a string other than the declared `release` (both identifiers, the reported one quoted as JSON writes it with each character outside printable ASCII escaped and cut at 160 characters).
  Any other fault, a call that reached no answer or passed a ceiling of the entry, stops the run with exit 12, and so does a request the run cannot build (`ArmError`, its own message).
  `deploymentPair` takes the contract and holds the runtime's copy of the rules: no `report` on a side, and every `reportProblems` finding, with exit 12.
- `preflight.js`: a qualified deployment-routed probe records `run.json`'s `releases[<probeId>]`, `{ preFix, fix }`, each `{ declared, reported }`; a refused probe records none.
- `check.js`: `historicalBoundaryProblems` takes the contract and adds `reportProblems` per named side under `historical`: the operation must be declared once, on an `api` interface the registry serves over HTTP, not marked as changing state, with no path parameter and no required key in any channel, and the pointer must match RFC 6901 (non-empty, `/`-led, `~` only as `~0` or `~1`).
  A deployment with no `report`, an extra field or an empty field fails the probe schema under `schema`.
- Schema: `committed-probe.schema.json` `Deployment` requires `report` `{ operationId, pointer }`.
- Fixture: `test/fixtures/evaluate-api/server/grader.js` answers `GET /release` with `GRADER_RELEASE` and, through a `release:` policy line, a number, an object, nothing, plain text or a 503 carrying the right release; the fixture contract gains `report-release` (no request keys, so `sensitivityWitness` is `null`) and `evaluation.json` its `outcome` phase.
  `test-evaluate-api.js`'s two-entry registry case copies every operation's phase to its `-second` twin, since the fixture contract now holds two operations.
- Tests: `test-evaluate-arms.js` gains `checkReportedReleases` (a pair of deployments of its own: a pre-fix and a post-fix deployment reporting another release, each refused with both identifiers and the other side unasked; separator and direction characters and a 401-character release quoted as the escape and the cut say; a policy denial, `method-not-authorized`, with nothing sent; five answer shapes and a pointer that finds a boolean, each refused with the pointer and what it found and the post-fix deployment left unasked; a post-fix answer with nothing; a deployment whose process ends on the request, exit 12 with no refusal), the existing deployment cases' request logs now start with `/release`, `run.json`'s `releases` is asserted in full, the cased-label case gives its second probe a pre-fix deployment that reports the cased release, and `deploymentPair`, `reportProblems`, `isJsonPointer` and `quotedIdentifier` units.
  `test-evaluate-check.js` gains the undeclared-operation case, two pointer cases (`release`, `/a/~2`), a required-input case, a path-parameter case, a state-changing case, a `cli` interface case, an interface-the-registry-does-not-serve case, and three `schema` cases (no `report`, an extra and an empty field); each asserts its finding is the only one (or one per deployment).
- Docs: `docs/reference/tea-evaluate-cli.md` `### Against deployments` (the `report` bullet, the comparison paragraph, the JSON content type, the exit 12 cases, `releases`), the `historical` rule row, the preflight step 5 list and the boundary sentence; `CHANGELOG.md` `### Added`.
- Shard weight: `tools/test-shard-weights.json` `test:evaluate-arms` 160 to 235. The suite took 169 seconds alone and the deployment cases run about 55 seconds longer than before (fourteen more project runs), about 1.4 times as Story 1.32 set its own weight.
- Skill gate: grep of `src/workflows/testarch/bmad-testarch-evaluate/` for deployments, `fixCommit` and `preFix` found no guidance that states the probe's deployment shape (`references/intake.md` says only that deployments may be excluded from scope), so no `/bmad-workflow-builder` run was needed.

### Departures from the plan text

- A "failed call" is read as an answer that is no 2xx (refused, status named). A call that reaches no answer (a refused or reset connection, an ended process) or passes a ceiling of the entry (answer size, time, redirects) is a target that could not run and exits 12, as every other call does and as Decision 6 of the frozen section keeps for faults that are not a denial or an unreadable answer.
  Both reviewers read the Approach's "a failed call ... refuses the probe" as covering those faults; the build keeps the frozen Decision 6 and the Story 1.32 precedent (an unreachable host exits 12), since a refusal exits 0 and would leave a run green while a deployment is down. The coordinator may overturn this reading.
- `check` refuses more than the plan names: a report operation declared twice or on a non-`api` interface, of an interface the registry does not serve over HTTP, marked as changing state, or needing an input.
- `run.json` gains `releases`; the plan says only that the run records the reported identifiers.
- Amended in place, dated 2026-09-30: `epics.md` (Story 1.32's criterion 3 note and Story 1.38's criteria), `test-design-epic-1.md` (Story 1.32's note and Story 1.38's section) and `ARCHITECTURE-SPINE.md` (the AD-8 Story 1.32 amendment, which said the release is not asked of the deployment).

## Review Triage Log

### Build review (code review, test review and adversarial lenses; opus, on the uncommitted tree)

| Finding                        | Verdict | Evidence and disposition                                                                                                                                                                                                                                                          |
| ------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Failed call exits 12           | skipped | Both the code review (D1) and the adversarial review (F1) read the Approach as refusing on a call that reaches no answer or passes a ceiling. The frozen Decision 6 and Story 1.32 keep exit 12 for faults other than a denial and an unreadable answer; recorded above; flagged  |
| Release checked once           | skipped | F2: the witness legs and trials reach the pre-fix deployment after the report; the frozen spec scopes the request to before either arm. The docs and CHANGELOG claim now says the digests name the releases each deployment reported before the arms ran; reported as a new story |
| Shared arm label, reports      | skipped | F3: two probes naming one pre-fix origin with different `report` fields: the probe whose report contradicts the deployment is refused with both identifiers, which is the outcome the story asks for                                                                              |
| `releases` adds nothing        | skipped | F4: a qualified probe's reported release equals its declared one by construction; a mismatch is a refusal whose reason names both; a structured refusal record is scope nobody asked for                                                                                          |
| Hostile release string         | fixed   | F5: `quotedIdentifier` writes every character outside printable ASCII as `\uXXXX` and cuts at 160 characters; a unit and two cases                                                                                                                                                |
| Echoed secret in a refusal     | skipped | F6: `hostEnvironmentPort` scrubs an observation case-sensitively for every call, evidence included; a change belongs to that scrub; reported                                                                                                                                      |
| Pointer printed raw            | fixed   | F7: the pointer is JSON-quoted in every message; no length bound was added, since the adopter writes it                                                                                                                                                                           |
| ArmError blamed the deployment | fixed   | F8: a request the run cannot build has its own message                                                                                                                                                                                                                            |
| Interrupt read as failure      | skipped | F9: `revisionArm` and `deploymentAccess` read an aborted call the same way; the outer interrupt path owns it                                                                                                                                                                      |
| Lists of causes incomplete     | fixed   | F10, F11, P4: docs, CHANGELOG, `preflight.js` header and step 5 name every cause, anything but a string, and the exit 12 cases                                                                                                                                                    |
| JSON content type              | fixed   | F12: the reference states the `application/json` or `+json` requirement                                                                                                                                                                                                           |
| Operation phase                | fixed   | F13: the `report` bullet says `operationPhases` names the phase and the compiled contract changes                                                                                                                                                                                 |
| Two interfaces declare it      | fixed   | F14, P3: the ambiguity test runs first and has a unit; the operation-phases rule does not cover a twice-declared operation across interface kinds                                                                                                                                 |
| One interface's report         | skipped | F15: the `report` bullet states the limit; reported                                                                                                                                                                                                                               |
| State-changing report          | fixed   | D2: `check` and the guard refuse an operation the contract marks as changing state; a `check` case and a unit                                                                                                                                                                     |
| Pointer missing in unread      | fixed   | P1: both messages carry the pointer                                                                                                                                                                                                                                               |
| Shared `REPORT` mutated        | fixed   | P2: each side gets a copy and the constant is frozen                                                                                                                                                                                                                              |
| Weak test callbacks            | fixed   | `sent: () => true` is gone: each case asserts the request log of the asked side and of the unasked one; the conditional sealed assertion sits at the three `run` sites                                                                                                            |
| Check cases not isolated       | fixed   | the interface-not-served case names its phase and asserts one finding; the path-parameter case asserts two                                                                                                                                                                        |
| Cumulative request logs        | fixed   | `checkReportedReleases` starts a pair of deployments of its own, and each case that reads a request log reads the change it caused against a baseline taken before its run (`snapshot`, `pathsSince`), so one added or reordered case cannot break another's assertions           |
| Missing negative cases         | fixed   | a `cli` interface, a twice-declared operation, a required header, a required path and body key, a contract with no interfaces, escaped and unescaped pointers, a post-fix unread answer, the cut, and the schema's extra and empty fields                                         |
| Answer `down` passes           | fixed   | the 503 answer carries the right release, so a missing status gate lets the probe qualify                                                                                                                                                                                         |
| Order-sensitive equality       | skipped | the `releases` assertion compares one JSON string like the file's other run.json assertions                                                                                                                                                                                       |
| House style in a comment       | fixed   | the crash case's comment no longer rejects a half                                                                                                                                                                                                                                 |

## Revert observations

Each check exercised once: undo the change locally, run the named suite (for the `test:evaluate-arms` checks a scratch copy of `test-evaluate-arms.js` restricted to the deployment route, the deployment units and the reference case, 238 checks, which was deleted), restore the file from a saved copy (`cmp` confirmed each restore byte for byte).

- AC 1, the comparison skipped (`if (false)` for `answer.reported !== release`): 25 of 238 fail, among them "a run whose pre-fix deployment reports another release: run.json records the refusals []" and that run sealing `["P-001","P-004"]`.
- AC 2, the declared release recorded unasked (`holdToReport` returning `{ reported: release }` before the request): 60 of 238 fail; the mismatch, denial and answer-shape cases exit 0 with no refusal, and every request log loses its `/release`.
- AC 2, the denial not a refusal: 3 fail ("a run whose report request the policy denies exited 12; expected 0").
- AC 2, the status gate dropped: 6 fail; the 503 answer that carries the right release now qualifies and the deployment receives the arms' requests.
- AC 2, every fault refusing (the exit 12 split dropped): 1 fails ("a pre-fix deployment that ends its process on the report request exited 0 with the refusals [...port-failure...]; expected 12").
- AC 3, the `check` rule dropped (the loop over named sides emptied): 30 of 751 `test:evaluate-check` checks fail, each new case "check exited 0; expected 10".
- AC 3, the pointer rule dropped: 8 of 751 `check` failures and 8 of 238 arms failures (the `deploymentPair` units and `reportProblems` over `""` and `release`).
- AC 3, the state-change rule dropped: 4 `check` failures and 1 arms unit.
- AC 3, the runtime guard of `deploymentPair` dropped: 14 of 238 fail, one unit per refused shape.
- AC 4, the reference sentence reworded: 1 of 238 fails ("the reference's \"### Against deployments\" section does not state that the probe is refused when the reported string is not the declared release").
- `run.json`'s `releases` not written: 1 of 238 fails ("run.json records the releases {}").
- `quotedIdentifier` returning plain `JSON.stringify`: 5 of 238 fail (the two quoting cases, the whole-release assertion and the unit).
- Review round 1, AC 2, the declared release dropped from the denial and unread messages of `holdToReport`: 8 of 239 `test:evaluate-arms` checks fail (the denial case, the five answer-shape cases, the post-fix nothing answer and the boolean-pointer case), each "run.json records the refusals" naming a reason without `pre-fix deployment grader-1.4.2` or `post-fix deployment grader-1.4.3`. The scratch copy ran 239 checks after the added assertions.
- Review round 1, AC 3, the twice-declared rule of `reportProblems` dropped (`declaring.length > 1` made unreachable): 4 of 757 `test:evaluate-check` checks fail, all in the new case "a report names an operation two interfaces declare" (no `historical` finding at all, then no finding naming the operation).
- Review round 1, AC 3, the interface kind rule dropped (`declaring[0].iface?.kind !== 'api'` removed): 2 of 757 fail, both in the cli case, which now asserts that the probe's historical findings are exactly the two kind findings; the planted cli interface is no valid contract, so engine-schema findings keep the run at exit 10 and the exit status alone never caught this revert.

## Gates

- Engine check (`evaluateTarget` is a function) exit 0 at the start and at the end; `git diff -- package.json package-lock.json` shows no change and no `file:` or `.tgz` spec.
- Last state of the tree, all green: `test:evaluate-arms` 536 checks, `test:evaluate-check` 757, `test:evaluate-api` 322, `test:evaluate-guidance`, `test:evaluate-preflight` 236, `test:evaluate-run` 543, `test:evaluate-boundaries` 306, `test:port-totality`, `lint`, `lint:md`, `format:check`, `docs:validate-links`, `docs:build`, `test:release-metadata`, `test:doc-claims`, `test:doc-counts`, `test:direction`, `test:ci-coverage`, `test:shards`, `test:changelog`, `test:bmad-output-gated`.
- Formatting: Prettier realigned the frozen section's I/O matrix table in this file (whitespace only), since `lint:md` and `format:check` read the record.
- Unrun: the full `npm test` (it runs in CI shards, and the change is inside the evaluate files, the reference, the CHANGELOG and the shard weights).

## Left undone, reported

- The release is asked once, at qualification: the witness legs and the trials reach the pre-fix deployment afterwards, so a redeploy in between is measured under the declared identifier. A story could ask the deployment again after the legs and after the trials (F2).
- One `report` per deployment covers the interface its operation belongs to; another HTTP interface of the same deployment is not asked (F15).
- `hostEnvironmentPort` scrubs an observation's secrets case-sensitively, so a deployment that echoes the auth value in another letter case reaches the evidence and, through a reported identifier, a refusal (F6).
