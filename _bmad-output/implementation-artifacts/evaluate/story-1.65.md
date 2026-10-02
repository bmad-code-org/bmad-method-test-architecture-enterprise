---
title: 'Story 1.65: Ask every HTTP interface of a deployment which release it runs'
type: 'feature'
created: '2026-10-01'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '9ef51270'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Stories 1.38 and 1.65)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.65 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-1, AD-7, AD-8)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.38.md (the story this one completes)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.66.md (the previous story record, the model for this one)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/eval-quality-facts.md'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** A deployment-routed historical probe names one `report` per deployment. The runtime sends that one request to the origin of the interface the operation belongs to, and the origins of the deployment's other HTTP interfaces are never asked which release they run. A deployment whose second origin runs another release is measured, under the identifier the first origin reported, in every call a trial makes to that second origin, and the digests the qualified probe records (`artifactDigest`, `fixCommitDigest`) name a release the run did not measure there.

**Approach:** Each deployment names `reports`, a map keyed by the registry's HTTP interface ID to `{ operationId, pointer }`, one report for every HTTP interface of the registry and for no other. Before either arm the runtime sends each deployment one report request per HTTP interface, each through the evaluation's HTTP port to that interface's own origin, and refuses the probe when any answer is another identifier than the declared `release`, naming the interface, the identifier reported and the one declared. `check` and `deploymentPair` hold the same rules. No eval-quality change.

## Boundaries & Constraints

**Always:** reuse, do not copy, `reportedRelease`, `reportProblems`, `holdToReport` and `quotedIdentifier`; the per-interface check is the existing check run once per key, so there is one derivation of the request, the pointer read and the refusal text. The port sends every report request and eval-quality's `evaluateTarget` decides it (AD-1); TeA keeps no HTTP client in `cli/` and computes no verdict. The comparison is an equality of the string read and the declared `release`, TeA's own field. The refusal is recorded as every historical refusal is (`run.json`'s `refused`, `refused/<probeId>.json`), the clean control still runs and the run exits 0 as for the other refusals. Keep `engine.js` the one runtime file that loads eval-quality and every run-directory write through `run-directory.js`. The report requests are no trial: they record no evidence artifact and count against no budget. Scrub through `hostEnvironmentPort`, so an identifier echoing a secret reaches no artifact (Story 1.66). Keep `cli/` free of any framework import (`test:direction`, `test:evaluate-boundaries`). Verify every behavioral claim about a vendor tool live against the installed version before it enters plan or reference text. Exercise every revert check once in a scratch copy and record the observation. Fix pre-existing defects found on the way. Run `test:schema-versions` locally: a literal `schemaVersion` under `cli/lib/evaluate`, `test/lib` or `tools` fails it. List every digest or evidence byte the change refreshed. The committed `test/fixtures/evaluate-api` project keeps its bytes: build the two-interface registry and contract in the test's own project copy.

**Never:** an eval-quality change or a new engine export; an HTTP client in `cli/`; a probe that qualifies with an HTTP interface unasked; recording the declared `release` as the reported one; a second derivation of the request or the pointer read; a new dependency; a raised timeout; a script that is not chained; weight added to a heavy suite without the measured weight reported to the coordinator; a commit, push, pull request, merge or release.

**Decisions (coordinator, owner-delegated):**

- One report per interface is the design; the plan's closing alternative (one report suffices) does not apply, because a second origin can run another release, which is the defect. The plan text needs no amendment beyond the shape below. `epics.md` and `test-design-epic-1.md` carry an `Amended 2026-10-01 in Story 1.65's build:` paragraph naming the shape.
- The probe field is `reports` (the single `report` field is gone; nothing is released, so no compatibility alias). Its value is an object keyed by interface ID, `{ "<interfaceId>": { "operationId": "...", "pointer": "..." } }`, `minProperties` 1, each value as `report` was. The key is the interface the operation must belong to.
- `check` (rule `historical`) refuses, as one finding each naming the side: an HTTP interface of the registry with no entry in `reports`; an entry for an interface the registry does not serve over HTTP; an operation that the contract does not declare on the interface its key names (the finding names the interface the operation does belong to when it belongs to another); and every existing `reportProblems` finding per entry (undeclared or doubly declared operation, state-changing, needs an input, no JSON pointer), worded with `deployments.<side>.reports.<interfaceId>`. A missing, empty or extra field of an entry fails the probe schema under `schema`.
- `deploymentPair` holds the same rules with exit 12 (`unaddressable`), through the same `reportProblems`.
- The runtime asks each side's interfaces in sorted interface-ID order, the pre-fix deployment first. The first answer that is another identifier, an unreadable answer or a denial refuses the probe: later interfaces and the post-fix deployment stay unasked (a refusal needs one finding, and asking a deployment already refused only adds requests). A probe that qualifies has sent each deployment exactly one report request per HTTP interface.
- Each refusal names the side, the interface ID, the declared release and what was found. An identifier is quoted as `quotedIdentifier` quotes it.
- `run.json`'s `releases[<probeId>][<side>]` stays `{ declared, reported }`, and `reported` becomes an object keyed by interface ID, each value the identifier that interface reported (equal to `declared` for a qualified probe). The shape the reference documents is this one.
- Each request's label is distinct per interface and side (`report-<side>-<interfaceId>`) and passes the arm label rules; the build checks that an interface ID is valid in a label and says what it did.
- The ask is the existing one: a request with no bound inputs, over the interface's own port entry, so the policy, redirects, ceilings and auth of that interface's registry entry apply.

## I/O & Edge-Case Matrix

| Scenario                               | Input / State                                                                                  | Expected Output / Behavior                                                                                                                                  | Error Handling                              |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Every origin runs the declared release | two HTTP interfaces, two loopback servers per deployment, `reports` for both                   | probe qualifies; each of the four servers logs exactly one report request; `run.json` `releases` lists `reported` by interface                              | n/a                                         |
| Second origin runs another release     | pre-fix deployment's second origin reports another release                                     | probe refused naming the interface, the identifier reported and the one declared in `run.json`'s `refused` and `refused/<probeId>.json`; clean control runs | exit 0; the post-fix deployment is unasked  |
| Another release on the post-fix side   | post-fix deployment's second origin reports another release                                    | probe refused the same way, side `post-fix`                                                                                                                 | exit 0                                      |
| One interface denied or unreadable     | policy denies a method for the second interface, or its answer has no string at the pointer    | probe refused naming the interface and eval-quality's denial or the pointer and what it found                                                               | exit 0                                      |
| A report missing for an HTTP interface | `reports` names one of two HTTP interfaces                                                     | `check` exits 10 under `historical`; `deploymentPair` returns `unaddressable`, the run exits 12 without `check`                                             | exit 10 / 12                                |
| A report for an interface not served   | `reports` has a key the registry does not serve over HTTP                                      | same two refusals                                                                                                                                           | exit 10 / 12                                |
| An operation of another interface      | the key names interface A, the operation is declared on interface B                            | `check` names B as the interface the operation belongs to                                                                                                   | exit 10 / 12                                |
| Schema shape                           | `reports` absent, `{}`, an entry missing a field, with an extra field, or with an empty string | `check` exits 10 under `schema`                                                                                                                             | n/a                                         |
| One HTTP interface                     | registry of one HTTP interface, `reports` of one key                                           | valid; qualifies as before                                                                                                                                  | n/a                                         |
| Identifier echoes a secret             | a second origin reports the injected secret in another case                                    | refusal quotes `[redacted]`; no artifact holds the value                                                                                                    | n/a                                         |
| The reference                          | `### Against deployments` read under its heading                                               | states that every HTTP interface's origin is asked; the sentence that one operation asks the other interfaces nothing is gone                               | the case fails when the sentence is removed |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/schemas/committed-probe.schema.json`: `$defs.Deployment` replaces `report` with required `reports` (an object keyed by interface ID, `minProperties` 1, each `{ operationId, pointer }` as `report` was; the description says one report per HTTP interface of the registry).
- `cli/lib/evaluate/release-report.js`: `reportProblems` takes the interface key it holds the entry to (adds the operation-belongs-to-its-key rule); the module doc and `reportedRelease`'s label stay the one derivation; add the per-deployment loop only if it belongs here, not in `historical.js`.
- `cli/lib/evaluate/check.js` (`historicalBoundaryProblems`, near 893): hold `reports` against the registry's HTTP interfaces and `reportProblems` per entry; the doc comment names the rule.
- `cli/lib/evaluate/historical.js` (`deploymentPair` near 449 and 497; `holdToReport` near 540; `qualifyDeploymentProbe` near 640): the guard, and one request per interface of each side in sorted order, with the interface named in each refusal; `reached[revision].reported` becomes the per-interface map.
- `cli/lib/evaluate/preflight.js` (near 853): `run.json`'s `releases` records `reported` by interface.
- `docs/reference/tea-evaluate-cli.md` (`### Against deployments`, the `report` bullet near 553, the comparison paragraphs, `releases`, the `historical` rule row, the closing boundary sentence): the new shape, that every HTTP interface's origin is asked, and the removal of "asks the deployment's other interfaces nothing".
- `src/workflows/testarch/bmad-testarch-evaluate/references/`: any guide or sample that names a deployment's `report` (grep `report` and `deployments` under the skill; edit through `/bmad-workflow-builder` Edit run headless with Analyze at zero critical and zero high findings, a finding that contradicts a repository test skipped with the reason in the completion notes) only if one exists; none is known.
- Tests: `test/test-evaluate-arms.js` (`makeDeploymentProject` near 1050, `REPORT` near 971, deployment cases 1100 to 1580, the reference read near 1633, `deploymentPair` units near 1848; header comment near 43 and 67; a new `--reported-interfaces-only` runner flag for the revert checks, like `--reported-releases-only`), `test/test-evaluate-check.js` (`REPORT` near 279, `DEPLOYMENTS`, the report cases near 1575 to 1760). Every existing case that names `report` moves to `reports`.
- `CHANGELOG.md` (`Changed` under `[Unreleased]`), `_bmad-output/implementation-artifacts/evaluate/sprint-status.yaml`, `epics.md` and `test-design-epic-1.md` (the Story 1.65 amendment), `ARCHITECTURE-SPINE.md` only if an AD sentence (AD-8) names one report per deployment.

## Tasks & Acceptance

**Execution:**

- [x] `committed-probe.schema.json`, `release-report.js`, `check.js` -- `reports` shape and the `check` rules -- AC 2, 3, 5
- [x] `historical.js`, `preflight.js` -- `deploymentPair` guard, one request per interface, the interface-named refusals, `run.json` `releases` by interface -- AC 1, 2
- [x] `test/test-evaluate-arms.js`, `test/test-evaluate-check.js` -- the two-interface project copy, the cases, the existing cases moved to `reports` -- AC 1 to 4
- [x] Docs reference, CHANGELOG, plan amendments, sprint row, this record -- AC 4 and all

**Acceptance Criteria:**

- Given a registry that serves two HTTP interfaces, a probe whose deployments each name a report for every one of them, and two loopback fixture servers per deployment, the second interface's origin of the pre-fix deployment running another release, `tea-evaluate run` sends each deployment one report request per HTTP interface before either arm, each to that interface's own origin, and refuses the probe with the interface, the identifier reported and the one declared named in `run.json`'s `refused` and `refused/<probeId>.json`, a `test:evaluate-arms` case reading each server's request log (revert: asking the first interface alone lets the probe qualify).
- `check` refuses under `historical` a deployment whose reports leave an HTTP interface of the registry without one, or name an interface the registry does not serve over HTTP, a `test:evaluate-check` case each, and `deploymentPair` holds the same rules with exit 12, a `test:evaluate-arms` unit (revert: dropping the rule lets an origin go unasked).
- The probe schema carries a report per interface, a `test:evaluate-check` `schema` case for a missing `reports`, an entry with a missing, extra or empty field and an empty map; a registry with one HTTP interface keeps a probe that names one report valid (revert: dropping the field lets a probe through with an origin unasked).
- The reference's `### Against deployments` states that every HTTP interface's origin is asked, and the case reading the section fails when its sentence is removed.
- `check` refuses an operation the contract does not declare on the interface its key names, naming the interface it belongs to, a `test:evaluate-check` case (revert: dropping the rule lets the run ask an interface for an operation it does not serve).
- Gate: `test:evaluate-arms`, `test:evaluate-check`, `npm test`.

## Implementation Notes

- `release-report.js`: `reportProblems({ report, interfaceId, contract, where })` holds one entry to the interface its key names (new rule: the operation must be declared on that interface; the finding names the interface it does belong to) and keeps the earlier findings.
  Its `interfaces` option is gone: the key rule covers an operation of an interface the registry does not serve, since the key itself must be an HTTP interface of the registry.
  `reportsProblems({ reports, contract, interfaces, where })` is the one derivation of the per-deployment rules: an HTTP interface with no report, a key the registry does not serve over HTTP, and each entry through `reportProblems`, interfaces in sorted order.
  `check.js` (`historicalBoundaryProblems`) and `historical.js` (`deploymentPair`) both call it, so `check` and the runtime guard cannot drift.
  `reportedRelease`, `quotedIdentifier` and `holdToReport` are reused: the per-interface ask is the existing ask run once per key.
- `deploymentPair` (exit 12) refuses `reports` that is no object, then the first `reportsProblems` finding, then an entry without both string fields (the schema's finding in `check`), then a contract with no interfaces.
- `qualifyDeploymentProbe`: for each side (pre-fix first) it asks `Object.keys(reports).sort()` one `holdToReport` each, through `ports[revision]`, which routes each request to the interface its operation belongs to.
  The first refusal returns at once, so the later interfaces and the post-fix deployment stay unasked.
  `reached[revision].reported` is the map by interface ID, and `preflight.js` records it unchanged in `run.json`'s `releases[<probeId>][<side>].reported`.
- Refusal text (each names the side, the interface, the declared release and what was found): `the pre-fix deployment's "ledger" interface reports release "x" where the probe declares "y", so the run would measure it under an identifier it does not run`; the denied, unread and exit 12 messages add `for its "ledger" interface`.
- Request label: `report-<side>-<interfaceId>`.
  An interface ID is eval-quality's `Identifier` (a kebab-case slug), so it is valid in a label, and the label occurs only in the request's `probeId` and in an `ArmError` message; no recorded artifact carries it, so no case can observe it and I added no revert check for it.
- `committed-probe.schema.json`: `reports` replaces `report` (required, `minProperties` 1, each value `{ operationId, pointer }` with both fields required and nothing else).
- `docs/reference/tea-evaluate-cli.md`: the example, the `release` and `reports` bullets (the old "asks the deployment's other interfaces nothing" paragraph is gone), the comparison paragraphs, the `releases` record, the closing boundary sentence and the `historical` rule row.
  The sentence the new case reads: "The run asks the origin of every HTTP interface of the registry which release it runs: `reports` names one report for each, and each request goes to that interface's own origin."
- Plan text: `epics.md` (Story 1.65's fifth criterion rewritten, the amendment paragraph, Story 1.64's dependency and amendment, the dependency row), `test-design-epic-1.md` (the Story 1.65 and 1.64 amendments, one more row), and `ARCHITECTURE-SPINE.md` (an `Amended 2026-10-01 in Story 1.65` sentence on AD-8, which named one `report` per deployment).
- Tests.
  `test/test-evaluate-arms.js`: `withLedger` (an `edit` for `makeDeploymentProject`) gives the test's own project copy a `ledger` registry entry (no `server`, a `port`, its own `deployments`), a `ledger` interface in the contract with a copy of the report operation, a report and an origin in both deployments; `test/fixtures/evaluate-api` keeps its bytes.
  `checkReportedInterfaces` starts four loopback servers and reads their request logs (see the table in `test-design-epic-1.md`); the `deploymentPair` units gain six two-interface refusals, a whole pair, the one-interface pair and `reportsProblems` units; the reference case reads the new sentence and the absence of the old one.
  Every existing case that named `report` moved to `reports`, and the refusal wording that gained the interface moved with it.
  `--reported-interfaces-only` runs the interface cases, the deployment units and the reference read.
  `test/test-evaluate-check.js`: `reportOf` and `TWO_INTERFACE_DEPLOYMENTS`, `plantApiHistorical` declares each extra interface in the contract, six new cases (a missing report on the second interface post-fix and on the first pre-fix, the first interface's operation under the second key, a second report without its pointer, an empty map, the old single `report`), the unserved-key case rewritten for the new shape, the extra and empty field case moved to `reports`, and two clean cases (a registry of one HTTP interface with one report, a registry of two with two) through `runCleanCases`, which now takes a case's own `copy`.
- Adopter limit: each interface's report operation needs a method and path template that no other `api` operation of the contract uses.
  eval-quality 4.7.0 refuses `duplicate-operation-signature` across the whole contract, so two services that both serve their release at `GET /release` cannot each declare a report operation.
  `check` exits 0 for such a registry and `run` exits 4 with the compile refusal.
  The reference states the limit (`### Against deployments`, the `reports` bullet) and the CHANGELOG entry carries a line for it; Story 1.75 makes `check` name the collision.
  The tests meet the limit too: the `ledger` interface's report operation sits under a `/ledger` path prefix, and its servers are the fixture's `grader.js` behind a wrapper (`prefixed`) that cuts `/ledger` from each request path and answers a path outside the prefix as unknown, so a request that reached the wrong interface's origin finds no release.
  The grader's bytes are unchanged.
  The server logs the cut path, so each server's own log tells the interface.
  The `ledger` servers run the grader's `release: object` policy and `ledger` reports at `/release/name`, so a pointer read from the wrong interface's report finds an object or nothing (round 1).
- Digests and evidence bytes refreshed: none.
  No fixture, committed digest, record or evidence file changed; the arms cases write to temporary projects.
- `story-1.65.md`'s I/O matrix table was re-padded by `prettier --write` (cell text unchanged), because `lint:md` (MD060) and `format:check` fail on the record as written.
- The skill needed no edit: `grep` over `src/workflows/testarch/bmad-testarch-evaluate` finds no guide that names a deployment's `report`.

### Departures from the plan text

- The plan's closing criterion ("if the build shows that one report suffices") does not apply, as the coordinator decided: a second origin can run another release, which is the defect.
  It is rewritten in `epics.md` as the key-belongs-to-its-interface rule, with its `test:evaluate-check` case.
- The plan says `check` refuses a report "for an interface the registry does not serve over HTTP".
  The finding is on the key, `deployments.<side>.reports.<id> names an interface the registry does not serve over HTTP`; an operation declared on another interface than its key is a separate finding that names the interface it does belong to.
- The record of Story 1.38's CHANGELOG entries (under `Added`) still says `report`; they describe the earlier shape, and the `Changed` entry for this story states the move.

## Revert observations

Each exercised once on a scratch copy of the final tree (`rsync` of the checkout without `.git`, `node_modules` linked, under the session scratchpad), by applying one edit, running the named suite there, and restoring the file.
The working tree was never mutated.
The unmodified copy passes: `node test/test-evaluate-arms.js --reported-interfaces-only` 152 checks, `node test/test-evaluate-check.js` 1,010.
The counts are failed checks.

- AC 1, the second origin is asked.
  Asking the first interface alone (`.slice(0, 1)` on the sorted keys): 21 of 152 fail, among them the stale-second-origin case (the probe qualifies, the run is not refused, P-004 is sealed) and the qualified case (the second origin received nothing).
  The asking in key order in place of sorted order (the case writes `ledger` first): 3 fail, the refusal then names the second interface and the first origin goes unasked.
  The post-fix deployment never asked: 9 fail, the second post-fix origin goes unasked and its mismatch qualifies.
  The asking continuing after a pre-fix refusal (the probe is not refused): 14 fail.
  `reported` recorded as one string in place of the map by interface: 1 fails, the `run.json` `releases` check.
  A denial no longer caught (exit 12 in place of a refusal): 2 fail, the second interface's denial case.
- AC 2, `check` and `deploymentPair` hold a report per interface.
  The missing-interface rule dropped in `reportsProblems`: 8 of 1,010 `test:evaluate-check` checks fail (both missing-report cases, the later and the earlier interface) and 2 of 152 arms checks (the `deploymentPair` and `reportsProblems` units).
  The unserved-key rule dropped: 4 `check` checks and 1 arms check fail.
  The `deploymentPair` guard (`reportsProblems`' first finding) dropped: 16 arms checks fail.
- AC 3, the schema.
  `reports` dropped from `required`: 3 `check` checks fail (a probe with no `reports` exits 0).
  `minProperties` dropped: 2 fail (the empty map).
  The entry's `additionalProperties: false` dropped: 1 fails (the extra field).
- AC 4, the reference.
  The sentence removed: 1 arms check fails.
  The old paragraph ("One operation reports one interface's release ... asks the deployment's other interfaces nothing") restored: 1 fails.
- AC 5, the operation of another interface under a key.
  The rule dropped: 4 `check` checks fail (the case on the second interface's key exits 0), and the `deploymentPair` unit fails in the arms run.
- The request label (`report-<side>-<interfaceId>`): no revert check, as noted in Implementation Notes.

### Round 1 reverts

Same method on a fresh scratch copy of the round 1 tree (`rsync` without `.git`, `node_modules` linked).
The unmodified copy passes `node test/test-evaluate-arms.js --reported-interfaces-only` with 155 checks (152 before round 1, plus three new).

- Item 3, the pointer of the wrong interface.
  The mutation reads the first interface's pointer for each interface in `holdToReport`'s call (`report: { ...reports[interfaceId], pointer: reports[Object.keys(reports).sort()[0]].pointer }`).
  Round 0 test file with the mutation: 0 of 152 fail.
  Round 1 test file with the mutation: 9 of 155 fail (the qualified case, the `run.json` releases record, the request logs, the sealed probes, the stale, moved, unread and echo cases).
- Item 4, the interface in the exit 12 message.
  Removing the clause `for ${interfaceNote}` (with its leading space) from the could-not-answer branch of `holdToReport`: 1 of 155 fails, the new second-interface crash case.
  The could-not-be-built branch (`ArmError`) has no case, and none can reach it.
  The report operation is built from a plan with no bound inputs, and `reportsProblems` refuses beforehand each operation the arm cannot build a request for (undeclared, declared by two interfaces, not an `api` operation, requiring input or a path parameter), so `runArm` throws no `ArmError` for a report that passed `check` or `deploymentPair`.
- Item 5, the one-interface refusal beside the comment.
  Dropping the unserved-key loop in `reportsProblems`: 2 of 155 fail, the earlier two-interface unit and the new one-interface unit.
- Item 6, the refusal exists and omits the later interface.
  Neutralising the mismatch comparison (`answer.reported !== release`): 17 of 155 fail, the new `recorded no refusal` assertion among them, where the old assertion passed with no refusal at all.
  Asking the keys in written order in place of sorted order: 3 fail, the omission assertion among them.

## Gates

- Engine check (`evaluateTarget` is a function, eval-quality 4.7.0) exit 0 at the end of the build.
- Green on the final tree: `test:evaluate-arms`, `test:evaluate-check`, `test:evaluate-run`, `test:evaluate-preflight`, `test:evaluate-guidance`, `test:evaluate-boundaries`, `test:schema-versions`, `test:schemas`, `test:boundary`, `test:direction`, `test:doc-counts`, `test:shards`, `test:ci-coverage`, `test:changelog`, `lint`, `lint:md`, `format:check`, `docs:validate-links`.
- `git diff -- package.json package-lock.json` is empty.
- Measured weight of `test:evaluate-arms` before and after, with `--reported-interfaces-only` timed alone; the coordinator updates `tools/test-shard-weights.json`.

Results on the final tree.

- Engine check (`evaluateTarget` is a function) exit 0.
- Green: `test:evaluate-arms` 634 checks, `test:evaluate-check` 1,010, `test:evaluate-run` 571, `test:evaluate-preflight` 300 (no flake this time), `test:evaluate-guidance`, `test:evaluate-boundaries` 427, `test:schema-versions`, `test:schemas`, `test:boundary`, `test:direction`, `test:doc-counts`, `test:shards` 117, `test:ci-coverage` 107 steps, `test:changelog`, `lint`, `lint:md`, `format:check`, `docs:validate-links`.
- Green, the other chain scripts that read a touched file or run `tea-evaluate check` and `run`: `test:evaluate-api` 4,166, `test:evaluate-authoring`, `test:evaluate-mutation` 665, `test:evaluate-ci`, `test:evaluate-compare`, `test:evaluate-workflow` 165, `test:evaluate-mcp` 226, `test:evaluate-tool-use` 99, `test:evaluate-partitions`, `test:evaluate-gap-loop`, `test:evaluate-interpret`, `test:evaluate-calibration`, `test:doc-claims`, `test:doc-claim-sources`, `test:doc-count-sources`, `test:doc-invocations`, `test:doc-invocation-entry`, `test:contract-sources`, `test:conflict-markers`, `test:suite-manifest`.
- `git diff -- package.json package-lock.json` is empty.
- Measured weight of `test:evaluate-arms`, same machine, the HEAD tree copied beside this one, one run each, run alone: 208.3 seconds before (570 checks, 179 CPU seconds), 221.8 after (634 checks, 194 CPU seconds), +13.5 seconds. `--reported-interfaces-only` alone takes 19 seconds (152 checks; the interface cases take 16 of them), the earlier `--reported-releases-only` 28.4.
  The weights file is the coordinator's: `test:evaluate-arms` rises by about the 14 seconds measured, `test:evaluate-check` (about 90 seconds locally) by a few.
- Unrun: the full `npm test` (CI shards).

Round 1, on the final tree.

- Green: `test:evaluate-arms` 638 checks, `test:evaluate-check`, `test:evaluate-boundaries`, `test:evaluate-guidance`, `test:schemas`, `test:doc-counts`, `test:shards`, `test:ci-coverage`, `test:changelog`, `lint`, `lint:md`, `format:check`, `docs:validate-links`.
  `lint` and `format:check` first failed on the round 1 test edit (an unneeded escape, then the table of the new `test-design-epic-1.md` section) and passed after the fix.
- Measured weight of `test:evaluate-arms` after round 1, the round 0 test file beside it in the same scratch tree, run alone one after the other on a machine busier than at the round 0 measurement: 239.9 seconds before (634 checks, 210.3 CPU seconds), 241.2 after (638 checks, 211.9 CPU seconds), +1.3 seconds.
  The round 0 weight (+13.5 seconds) stands for the story; round 1 adds about 1 second of CPU (one more server start, no new run beyond the crash case).
  `--reported-interfaces-only` takes 19 seconds (155 checks).
- `git diff -- package.json package-lock.json` is empty.

## Build review

No independent reviewer ran in this worker; the coordinator's reviewer follows.
My own read of the final diff against the frozen block, row by row of the I/O matrix:

- Every origin runs the declared release: the qualified case (four servers, one report request each, `releases` by interface).
- Second origin runs another release, either side: the stale-second and moved-second cases, each read from the four request logs.
- Denied or unreadable second interface: the denied, unread cases; the echo case covers the secret in another letter case.
- A report missing, a key not served, an operation of another interface: `check` cases and `deploymentPair` units.
- Schema shape: five `schema` cases (`reports` absent, `{}`, an entry missing a field, with an extra field or an empty string, and the old `report`).
- One HTTP interface: a clean case and a unit.
- The reference: the sentence case and the absence of the old one.
- Request count: a qualified probe sends each deployment one request per HTTP interface (the qualified case reads exactly `["/release"]` on each `ledger` server and one `/release` on each `grader` server).
- Pre-fix first and sorted order: the stale-second case (post-fix servers unasked, the pre-fix `grader` asked once) and the both-stale case (keys written `ledger` first).

### Round 1 (2026-10-02)

Two Opus lenses (adversarial, test quality) reviewed `2e30ee18`.
The fix applies their six items:

1. The limit was not stated (adversarial, high).
   The reference, the CHANGELOG entry and this record's Implementation Notes and Undone now state it, and Story 1.75 closes it (`epics.md`, `test-design-epic-1.md`, the dependency row, `sprint-status.yaml` and both lane lists).
2. A banned antithesis in Implementation Notes (adversarial, low): reworded; the line sits outside the frozen block.
3. The ledger report pointer equalled the grader's (test quality, medium): `ledger` runs under `release: object` and reports at `/release/name`; the proof is in Round 1 reverts.
4. No case for the interface in an exit 12 message (test quality, low): a second-interface crash case in `checkReportedInterfaces`.
5. A comment promised a refusal the check beside it did not assert (test quality, low): the one-interface `deploymentPair` unit now refuses a report for a second interface.
6. An omission assertion that passed with no refusal (test quality, nit): the refusal is asserted to exist before it is asserted to omit the later interface.

## Undone

`check` does not name a collision between the report operations of two interfaces that serve their release at one path.
eval-quality 4.7.0 refuses `duplicate-operation-signature` across the whole contract, so such a registry passes `check` (exit 0) and `run` exits 4 with the compile refusal.
The reference and the CHANGELOG state the limit; Story 1.75 (Name a report-operation signature collision at check, before the run) closes it, with the route (eval-quality scoping the refusal per interface, or `check` calling the engine's own compile verdict) decided there.
The `ledger` servers share one wrapper and the fixture's grader; a fixture whose grader serves a second path of its own would drop the wrapper, but nothing needs it.
