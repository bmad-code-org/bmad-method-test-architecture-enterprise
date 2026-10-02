---
title: 'Story 1.64: Hold the release across the witness legs and the trials'
type: 'feature'
created: '2026-10-02'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '934312b7'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Stories 1.38, 1.64 and 1.65)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.64 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-1, AD-7, AD-8)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.38.md (the story that asks once)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.65.md (the story that asks per interface; the previous record and the model for this one)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/eval-quality-facts.md'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** A deployment-routed historical probe's pre-fix deployment is asked which release it runs once per HTTP interface before the qualification arms (Stories 1.38 and 1.65). The manifestation-witness legs and the trials of the arm `historical:<pre-fix release>` reach that deployment afterwards, so a deployment redeployed between the report and those calls is measured under the identifier the probe declares, and the digests a qualified probe records (`artifactDigest`, `fixCommitDigest`) name a release the legs and trials never ran against.

**Approach:** The runtime asks the pre-fix deployment again at two more points, once per HTTP interface through the same `holdToReport` that Story 1.65 made per interface: after the witness legs have run (before the preflight verdict reads them) and after the last trial of the arm (before any trial set of its probes is sealed). A changed identifier, a denial or an answer with no string at the pointer refuses every probe on that pre-fix release, naming the point, the side, the interface and both identifiers. The refusal is recorded as every historical refusal is. No eval-quality change.

## Boundaries & Constraints

**Always:** reuse `holdToReport`, `reportedRelease`, `reportsProblems` and `quotedIdentifier`; the loop over a deployment's interfaces (sorted interface-ID order, first refusal stops the asking) lives in one place that the qualification asking and the two new points all call, so there is one derivation of the request, the pointer read and the refusal text. The port sends every report request and eval-quality's `evaluateTarget` decides it (AD-1); TeA keeps no HTTP client in `cli/` and computes no verdict. The comparison is an equality of the string read and the declared `release`, TeA's own field. The refusal is recorded as the qualification refusals are (`run.json`'s `refused`, `refused/<probeId>.json`), the clean control and the probes on other releases still run, and the run exits 0 as for the other refusals. Keep `engine.js` the one runtime file that loads eval-quality and every run-directory write through `run-directory.js`. The report requests are no trial: they record no evidence artifact and count against no budget. Scrub through `hostEnvironmentPort` as the first ask does, so an identifier echoing a secret reaches no artifact (Story 1.66). Keep `cli/` free of any framework import (`test:direction`, `test:evaluate-boundaries`). Verify every behavioral claim about a vendor tool live against the installed version before it enters plan or reference text. Exercise every revert check once in a scratch copy and record the observation. Fix pre-existing defects found on the way. Run `test:schema-versions` locally: a literal `schemaVersion` under `cli/lib/evaluate`, `test/lib` or `tools` fails it. List every digest or evidence byte the change refreshed. The committed `test/fixtures/evaluate-api` project keeps its bytes: the test's own project copy (`withLedger` over `makeDeploymentProject`) and a wrapper around the fixture grader carry the release that changes. Keep `test:doc-claims` clean: state what the code does today and never write "not yet" or "as of now" without a dated claims entry.

**Never:** an eval-quality change or a new engine export; an HTTP client in `cli/`; a trial run, or a trial set sealed, for a probe whose pre-fix deployment changed its release; asking the post-fix deployment at the new points (it is reached only by the qualification arms); recording the declared `release` as the reported one; a second derivation of the request or the pointer read; a new dependency; a raised timeout; a script that is not chained; weight added to a heavy suite without the measured weight reported to the coordinator; a commit, push, pull request, merge or release.

**Decisions (coordinator, owner-delegated):**

- Only the pre-fix deployment is asked at the new points: the witness legs and the trials of `historical:<pre-fix release>` reach it, and nothing after the qualification reaches the post-fix deployment.
- Three points in all: before the arms (Stories 1.38 and 1.65, unchanged), after the witness legs, after the trials. A deployment that keeps its release is asked three times at each of its HTTP interface origins.
- Each interface is asked at each point in sorted interface-ID order, through the route's port (`deploymentRoute` returns it; extend what the route and the arm carry as the build needs, the declared `reports` of the probe included). The first answer that refuses stops the asking at that point.
- The witness-legs point asks right after the legs finish (`treeUnchanged('legs')`) and before `observations.json` is written and the CLI's preflight verdict reads the run directory. A pre-fix release that changed refuses every qualified probe on that route: each leaves `qualified`, `probes.json` and `observations.json`, is recorded in `run.refused` and `refused/<probeId>.json`, and the verdict counts the probes that remain, so a witness measured under another release cannot fail a verdict it should not.
  If a spike shows that eval-quality's preflight CLI refuses probes and observations that disagree about a leg, ask directly after the verdict instead, drop the refused probes from the arm before any trial, and say in the record what the spike showed.
  The build says in the record which placement it took and why.
- The trials point asks after the last trial of the arm and before `writer.verify('after the trials')`, so no trial set of a refused probe reaches `sealProbeTrials`. The probes of the refused arm are recorded in `run.refused`, run no further stage, and the run exits 0.
  The trials' own evidence artifacts stay in the run directory, since each trial ran and wrote them before the check.
- A refusal at a later point names the point (`after the witness legs`, `after the trials`), the side, the interface, the identifier reported or what was found, and the declared release, in the wording of the first point's refusal.
- When every probe of the run is refused at a later point, the run behaves as when every probe was refused at qualification (the existing no-arm stop), since that path already decides what a run with nothing left to score does.
- The request label stays distinct per interface, side and point and passes the arm label rules (`report-<side>-<interfaceId>` before the arms; the build chooses the suffix for the other two and checks the label rules); a repeated label across points is the defect to avoid.
- `run.json`'s `releases[<probeId>][<side>]` keeps `{ declared, reported }` with `reported` the map by interface from before the arms; a later refusal is recorded in `refused`, not in `releases`.
- The three points are stated in the reference's `### Against deployments`. The sentence the new case reads: "The run asks the pre-fix deployment which release each of its HTTP interfaces runs at three points: before the qualification arms, after the witness legs and after the trials."

## I/O & Edge-Case Matrix

| Scenario                                         | Input / State                                                                                                  | Expected Output / Behavior                                                                                                                                                                                 | Error Handling                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Release kept at every point                      | two HTTP interfaces, two pre-fix origins, `reports` for both                                                   | probe qualifies and seals as in Story 1.38; each pre-fix origin logs three report requests (before the arms, after the witness legs, after the trials) in that order with the legs and trials between them | n/a                                              |
| Changed after the witness legs                   | the first pre-fix origin answers another release once the witness leg has run                                  | every probe on that release refused naming `after the witness legs`, the interface and both identifiers in `run.json`'s `refused` and `refused/<probeId>.json`; no trial of it runs                        | exit 0; the clean control and other releases run |
| Changed after the witness legs, later interface  | the second pre-fix origin answers another release after the witness legs, the first keeps its release          | same refusal, naming the second interface; the first origin was asked at that point first                                                                                                                  | exit 0                                           |
| Changed while the trials run                     | the pre-fix origin changes its release between the first and the last trial                                    | the probe refused naming `after the trials`, both identifiers; no trial set of it sealed; its trials' evidence stays                                                                                       | exit 0                                           |
| Changed on the second interface after the trials | the second origin changes after the trials, the first keeps its release                                        | same refusal, naming the second interface                                                                                                                                                                  | exit 0                                           |
| Denied at a later point                          | the policy denies the report operation after the first request, or the answer carries no string at the pointer | the probe refused with eval-quality's reason or the pointer and what it found, at the point named                                                                                                          | exit 0                                           |
| Origin unreachable at a later point              | the pre-fix origin stops answering after the legs                                                              | stops the run with exit 12 as any call does, naming the point                                                                                                                                              | exit 12                                          |
| Two probes on one pre-fix release                | both route to the arm `historical:<release>`; the release changes after the legs                               | both refused, each with its own `refused/<probeId>.json`                                                                                                                                                   | exit 0                                           |
| Identifier echoes a secret                       | a later answer reports the injected secret in another letter case                                              | the refusal quotes `[redacted]`; no artifact holds the value                                                                                                                                               | n/a                                              |
| The reference                                    | `### Against deployments` read under its heading                                                               | states the three points                                                                                                                                                                                    | the case fails when the sentence is removed      |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/historical.js` (`holdToReport` near 552, `qualifyDeploymentProbe` near 660, `deploymentRoute` near 759): one exported function asks a deployment's interfaces in sorted order through a port and returns the first refusal or the map of reported identifiers; `qualifyDeploymentProbe` calls it too. `holdToReport` takes the point it asks at and names it in its refusal text.
- `cli/lib/evaluate/preflight.js` (routes near 950 to 995, legs near 1010 to 1050, the call into `afterVerdict` near 1075): carry what the later asks need on the route (its port, the declared `reports`, the release) and ask after the legs as decided.
- `cli/lib/evaluate/run.js` (the historical arm near 956 to 969, the trial loop near 1195, the seal loop near 1217): carry the route's port and reports on the arm, ask after the last trial of a deployment arm, and drop a refused arm's probes before `sealProbeTrials`.
- `docs/reference/tea-evaluate-cli.md` (`### Against deployments`): the three points; the single-point wording is gone.
- Tests: `test/test-evaluate-arms.js` (the `withLedger` copy, the grader wrapper, `REPORT`, the deployment cases, the reference read, a `--held-releases-only` runner flag for the revert checks, as `--reported-interfaces-only` does), and `test:evaluate-preflight` or `test:evaluate-run` only where a touched function has its own case there.
- `CHANGELOG.md` (`Changed` under `[Unreleased]`), `_bmad-output/implementation-artifacts/evaluate/sprint-status.yaml`, and `epics.md` and `test-design-epic-1.md` only where the build amends a criterion or a test row.

## Tasks & Acceptance

**Execution:**

- [x] `historical.js` -- the shared interface loop, the point named in the refusal, `holdToReport` exported -- AC 1 to 4
- [x] `preflight.js` -- route and arm carry the port and reports, the ask after the witness legs, the refused probes leave the verdict -- AC 1
- [x] `run.js` -- the ask after the last trial, the refused arm's probes leave the sealing -- AC 2
- [x] `test/test-evaluate-arms.js` -- the wrapper grader whose release changes on a signal the case sends, the cases and the runner flag -- AC 1 to 5
- [x] Docs reference, CHANGELOG, sprint row, this record -- AC 5 and all

**Acceptance Criteria:**

- Given a deployment-routed historical probe whose pre-fix deployment reports its declared release before the arms and another release once the witness legs have run (a loopback fixture grader behind a wrapper whose `GET /release` answer changes on a signal the case sends), `tea-evaluate run` sends the report request again through `holdToReport` after the witness legs, and a changed identifier refuses the probe with the identifier reported then and the one the probe declares both named in `run.json`'s `refused` and `refused/<probeId>.json`, and no trial of that probe runs, a `test:evaluate-arms` case reading the deployment's request log (revert: dropping the request after the witness legs lets the trials run under the declared identifier).
- A pre-fix deployment that changes its release while the trials run is asked once more after the last trial and before any trial set is sealed, a changed identifier refuses the probe with both identifiers named and no trial of it reaches a sealed trial set, a `test:evaluate-arms` case (revert: dropping the request after the trials seals trials measured under another release).
- A deployment that keeps its release is asked three times at each of its HTTP interface origins (before the arms, after the witness legs, after the trials), its qualified probe and digests are the ones Story 1.38 records, and the request log shows each request in that order, a `test:evaluate-arms` case (revert: asking only before the arms leaves two requests short in each log).
- The later requests go through the evaluation's HTTP port and eval-quality's policy as the first does, so a denial or an answer with no string at the pointer refuses the probe with its reason, a `test:evaluate-arms` case (revert: sending them outside the port exits 0 with no refusal).
- The reference's `### Against deployments` states the three points, and the case reading the section fails when its sentence is removed.
- Each criterion's changed release is also put on the second interface's origin (a later element), and the trials case puts it on a probe whose arm holds a second probe.
- Gate: `test:evaluate-arms`, `npm test`.

## Implementation Notes

- `historical.js`: one loop asks a deployment's interfaces.
  `holdInterfaces({ entries, ...asked })` runs `holdToReport` once per `{ interfaceId, report }` entry and returns the first refusal or the map of reported identifiers.
  The qualification (`qualifyDeploymentProbe`) and both later points call it, so the request, the pointer read and the refusal text have one derivation.
  `reportEntries(reportsOf)` turns the `reports` of the probes on a deployment into entries in sorted interface-ID order; an entry every probe names alike (same interface, operation and pointer) is asked once, so two probes on one pre-fix release send one request per interface and point.
  `holdDeployment({ route, point })` asks the pre-fix deployment of a route through the route's port with the reports of the probes on it (`route.members`).
  `recordRefusal` writes `run.json`'s `refused` and `refused/<probeId>.json` for every historical refusal (the three earlier call sites in `preflight.js` use it as well, and so do the two new points).
  `holdToReport` takes `point` (`arms`, `legs`, `trials`).
  A refusal at a later point starts with the point (`after the witness legs, the pre-fix deployment's "ledger" interface reports release ...`), the exit 12 message names it after the file, and the first point's wording is unchanged, so no earlier case moved.
  `holdToReport` stays internal: nothing outside `holdInterfaces` needs it, so I did not export it, which departs from the task line "`holdToReport` exported".
- Request label.
  The first point keeps `report-<side>-<interfaceId>`; the later points are `report-after-legs-<side>-<interfaceId>` and `report-after-trials-<side>-<interfaceId>`.
  The point comes before the side because an interface ID is any kebab-case slug, so a suffix collides: `report-pre-fix-grader` with a `-legs` suffix reads `report-pre-fix-grader-legs`, which is also the first point's label for an interface named `grader-legs`.
  `report-pre-fix-<id>` never starts with `report-after-`, so no interface ID makes one point's label another's (`reportLabel`, a unit over 3 points, 2 sides and 7 interface IDs, among them `legs`, `trials`, `after-legs-grader` and `pre-fix-grader`).
  The label occurs in the request's `probeId` and an `ArmError` message and reaches no recorded artifact, so only that unit observes it.
- `preflight.js`.
  `deploymentRoute` returns `members: []` and the route loop pushes `{ probeId, file, reports, legIds }` for each qualified deployment probe (`qualifyDeploymentProbe` returns `preFixReports`, and the `qualified` entry carries its `file`).
  Placement (the spec's decision with a fallback): the ask comes right after `engine.runPreflight` returns and before `observations.json` is written, `treeUnchanged('legs')` and the CLI's verdict.
  Spike (below) showed eval-quality's preflight CLI accepts a probes list without a refused probe and observations without its legs, so the fallback was not needed.
  `holdAfterLegs` asks each historical deployment route in sorted release order and returns one refusal per probe of a refused route; each is recorded, the probe leaves `qualified`, `probes.json` is rewritten (`writer.replaceJson`), the probe's witness legs leave the observations (matched by the observation's `probeId`, the leg ID), and the route leaves `historicalByRevision`, so `run.js` builds no arm for it.
  Each leg's own file under `observations/` stays, as the trials' evidence stays.
  `run.json`'s `releases` keeps the entries of a probe refused later (what was reported before the arms).
  The ask also runs in the planning-refusal path (no leg ran), where it is harmless and the CLI refuses the plan next; I did not add a branch for it.
- `run.js`.
  A deployment arm carries `route`.
  After the last trial of the arm, `holdDeployment({ point: 'trials' })` runs before the next arm, `writer.verify('after the trials')` and any sealing; a refusal records every probe of the arm (`recordRefusal`, `refusedIds`) and marks the arm `refused`.
  `sealable` (the arms not refused) replaces `arms` for the unarmed check, the sealing loop and `completeRun`; an empty `sealable` throws the existing no-arm stop (`noArm`, shared with the qualification-time stop).
  The judge's `calls` still count every arm's trials, since the calls were made.
- Spike: what eval-quality 4.7.0's preflight CLI does with a probes list and observations that drop a refused probe.
  On the run directory of a run whose probe P-004 passed the verdict (5 legs: `witness-alpha`, `witness-beta`, two control legs and P-004's `manifest-pre-fix`), I ran `eval-quality preflight` over four combinations: the original probes and observations passes with 5 legs; no probes and the full observations passes with 4 legs (the observation of the unplanned leg is ignored); the original probes and the observations without `manifest-pre-fix` fails (`manifest-pre-fix`: no observation); no probes and no `manifest-pre-fix` observation passes with 4 legs.
  The last combination is what the runtime writes, and the run's own verdict over it exits 0.
- `docs/reference/tea-evaluate-cli.md`: the sentence "The run asks the pre-fix deployment which release each of its HTTP interfaces runs at three points: before the qualification arms, after the witness legs and after the trials." sits in `### Against deployments` with the two later points described, the `release` bullet, the step-4 text of `run`, and the "Either route" paragraph (a refusal after the trials keeps `probes/<probeId>.probe.json`).
  Every sentence that said the release is asked before the arms only now says so for the first point.
  The CHANGELOG entry sits under `[Unreleased]` `Changed`; `ARCHITECTURE-SPINE.md` AD-8 gained an `Amended 2026-10-02 in Story 1.64` sentence; `test-design-epic-1.md` gained an amendment (the denial case, below); `epics.md` needed none.
- Tests (`test/test-evaluate-arms.js`).
  `wrapped` replaces `prefixed`: a wrapper around `http.createServer` that cuts a path prefix (Story 1.65) and, with `change`, redeploys a server on a signal the run sends (the grader reads `GRADER_RELEASE` on each request, so the wrapper sets or deletes it once `count` requests for `path` have been answered; or redirects, or ends the process).
  `test/fixtures/evaluate-api` keeps its bytes.
  Every wrapped server leaves out the `Date` header: with two probes on one arm, eval-quality's `seeded-faults-scoped` check drops a clean leg that repeats a witness leg's request and answer, and reads one that differs only in the `Date` header as another question, so the verdict failed (exit 3) in about one run of fifteen until the header was left out (40 of 40 runs pass since).
  The second probe (`withSecondProbe`) names its own defect ID, `D-002`.
  `checkHeldReleases` runs ten runs: the first interface's change after the legs over two probes (`run`), the second interface's after the legs (`preflight`, with the reports keyed `ledger` first so the sorted order is observable), the first interface's change while the trials run (`run`, then `score`), the second interface's change over two probes (`run`), a redirect to an unauthorized host, an answer with no string, a process that ends, an echoed secret (four `preflight` runs), and a run whose only probe is refused after the legs and one after the trials (`run`, exit 12).
  The qualified case of `checkReportedInterfaces` reads the three-point log (the pre-fix servers asked three times each, the post-fix ones once) and the two earlier deployment logs (`checkDeploymentRoute`, the confined case) moved to it.
  `checkHeldUnits` holds the labels and `reportEntries`.
  The policy cannot deny one report operation after allowing it once, so the denial case redirects the answer to a host the registry does not authorize (`host-not-authorized`, with `maxRedirects` 1 in the project's own copy); `test-design-epic-1.md` says so.
  `--held-releases-only` runs `checkHeld`, `checkHeldUnits` and the reference read.
- Digests and evidence bytes refreshed: none.
  No fixture, committed digest, record or evidence file changed; the arms cases write to temporary projects.
- The skill needed no edit: `grep` over `src/workflows/testarch/bmad-testarch-evaluate` finds no guide that says the release is asked once or before the arms only.

## Revert observations

Each exercised once on a scratch copy of the final tree (`rsync` of the checkout without `.git`, `node_modules` linked, under the session scratchpad), by applying one edit, running `node test/test-evaluate-arms.js --held-releases-only` there, and restoring the file.
The working tree was never mutated.
The unmodified copy passes: 70 checks.
The counts are failed checks of 70, identical on the copy made before the last comment edits and on the final one.

- AC 1, the ask after the witness legs.
  Dropping it (`holdAfterLegs` answers nothing): 32 fail, among them each first-interface and second-interface case (the probes qualify, their legs stay in `observations.json`, the trials run under the declared identifier).
  Stopping the asking at the first interface at both later points (`.slice(0, 1)` over the entries): 20 fail, the second-interface cases at the legs and at the trials.
  Asking the interfaces in written order (the second-interface case writes `ledger` first): 2 fail.
  The refusal covering the first probe of the route only: 6 fail (the two-probe case at the legs).
  The refused probes left in `probes.json`: 13 fail (the CLI then plans their witness legs and finds no observation, and the run exits 3).
  The refused probes' legs left in `observations.json`: 7 fail.
  The refused route left in `historicalByRevision` (an arm of no qualified probe runs its trials): 4 fail.
- AC 2, the ask after the trials.
  Dropping it: 13 fail (the probes seal under the changed release, the first-interface case and the second-interface case over two probes).
  The refused arm still sealed (`arm.refused` never set): 7 fail.
  The refusal covering the first probe of the arm only: 4 fail (the two-probe arm).
  The no-arm stop after the trials dropped (`sealable.length === 0`): 1 fails, the run whose only probe is refused after the trials exits 0 with no trial set.
- AC 3, three requests at each origin.
  Asking only before the arms (both later asks dropped): 42 fail, among them the qualified case's three-point log of the pre-fix servers, each log two requests short.
  Asking the report of each probe separately, with no dedupe of equal reports: 7 fail (the request logs of the two-probe cases).
- AC 4, the port and the policy.
  There is no way to send the request outside the port, which `holdToReport` takes as `port`; the criterion's observable effect is a denied request that exits 0 with no refusal, which I reproduced by reading a later denial as the release held (`DENIAL_FAULT` at a later point returns `{ reported: release }`): 4 fail, the redirect case (no refusal recorded, the probe qualified and the trials ran).
  The refusal without the point: 11 fail; the exit 12 message without the point: 1 fails, the process-ends case.
  The echoed secret and the no-string answer at a later point have no revert of their own; they run through `holdToReport` and `reportedRelease`, which Stories 1.38 and 1.66 revert-check, and the two cases here read the point in the wording.
- AC 5, the reference.
  The sentence removed: 1 fails.
- The request label.
  Dropping the point from `reportLabel`: 1 fails, the unit.
  The label reaches no artifact, so only the unit observes it.

## Gates

- Engine check (`evaluateTarget` is a function, eval-quality 4.7.0) exit 0.
- Green on the final tree: `test:evaluate-arms` 713 checks, `test:evaluate-check` 1,018, `test:evaluate-run` 571, `test:evaluate-preflight` 300 (no flake this time), `test:evaluate-guidance`, `test:evaluate-boundaries` 427, `test:schema-versions`, `test:schemas`, `test:boundary`, `test:direction`, `test:doc-counts`, `test:doc-claims`, `test:shards`, `test:ci-coverage`, `test:changelog`, `lint`, `lint:md`, `format:check`, `docs:validate-links`.
- Green, the other chain scripts that run `check`, `preflight`, `run` or `score` or read a file I touched: `test:evaluate-api` 4,166, `test:evaluate-mutation` 665, `test:evaluate-workflow` 165, `test:evaluate-mcp` 226, `test:evaluate-tool-use`, `test:evaluate-confinement` 404, `test:evaluate-held-inputs` 204, `test:evaluate-aggregate` 142, `test:evaluate-evaluators` 486, `test:evaluate-agents` 330, `test:evaluate-private` 96, `test:evaluate-records` 330, `test:evaluate-authoring`, `test:evaluate-ci`, `test:evaluate-ci-render` 209, `test:evaluate-compare`, `test:evaluate-partitions`, `test:evaluate-gap-loop`, `test:evaluate-interpret`, `test:evaluate-calibration`, `test:evaluate-promptfoo` 165, `test:evaluate-learned-framework` 117, `test:doc-claim-sources`, `test:doc-count-sources`, `test:doc-invocations`, `test:doc-invocation-entry`, `test:contract-sources`, `test:conflict-markers`, `test:suite-manifest`.
  `lint:md` and `format:check` first failed on the record's I/O matrix table (MD060) and passed after `prettier --write` re-padded it, cell text unchanged.
- `git diff -- package.json package-lock.json` is empty.
- Measured weight of `test:evaluate-arms`, same machine, the HEAD tree (`git archive`) copied beside this one, one run each, run alone: 218.6 seconds before (638 checks, 191.8 CPU seconds), 246.8 after (713 checks, 227.5 CPU seconds), +28.2 seconds wall and +35.7 CPU seconds.
  `--held-releases-only` alone takes 29 seconds (70 checks; ten runs, four of them `run`).
  The weights file is the coordinator's: `test:evaluate-arms` rises by about 28 seconds.
- Unrun: the full `npm test` (CI shards), as the owner told the relay.

## Build review

No independent reviewer ran in this worker; the coordinator's reviewer follows.
My own read of the final diff against the frozen block, row by row of the I/O matrix:

- Release kept at every point: the qualified case of `checkReportedInterfaces` (the pre-fix grader's log is `/release`, the arm, the witness leg, `/release`, three trials, `/release`; the pre-fix ledger's three `/release`; the post-fix servers once), and the two deployment-route cases, whose logs moved to the three points.
- Changed after the witness legs (first interface, and a later one): `held-legs-first` (two probes) and `held-legs-second` (the ledger changes, the grader asked and kept first, keys written `ledger` first), each read from the four request logs.
- Changed while the trials run (first interface, and the second over an arm of two probes): `held-trials-first` (the trials' evidence kept, no trial set, `score` names P-004 as refused) and `held-trials-second`.
- Denied at a later point: the redirect case, since a policy cannot deny one operation after allowing it once (amended in `test-design-epic-1.md`); no string at the pointer: the ledger reports nothing (404).
- Origin unreachable at a later point: the pre-fix process ends on the request, exit 12 naming the point and the interface.
- Two probes on one pre-fix release: the legs case and the second-interface trials case, each probe with its own `refused/<probeId>.json`.
- Identifier echoes a secret: the upper-cased auth value as a later answer, quoted `[redacted]`, in no file of the run or the output.
- The reference: the sentence case.
- Every probe of the run refused at a later point: the two `alone` runs exit 12 with the existing no-arm message and no trial set.
- Never list: no eval-quality change, no engine export, no HTTP client in `cli/`; no trial runs for a probe refused at the legs; no trial set sealed for one refused after the trials; the post-fix deployment is never asked at the new points (every log in the cases shows it asked once); `releases` keeps the declared and reported values from before the arms.

### Departures from the plan text

- `holdToReport` is not exported (the Task line said it would be); nothing outside `historical.js` calls it.
- The second criterion's trials stay in the run directory and so does `probes/<probeId>.probe.json` of a probe refused after the trials, since the verdict read it before the trials ran; the reference says so.
- A probe refused after the legs keeps no `probes/<probeId>.probe.json` and leaves the probe list and the observations the CLI reads; each leg's own file under `observations/` stays.

## Undone

Nothing.
No finding is left over for a new story: the evaluator qualification attempts of a sealed-brief agent run before the trials against the same pre-fix deployment, and the final ask after the arm's last trial covers them (a release that changed at any earlier moment refuses the arm there), so the three points leave no window.
