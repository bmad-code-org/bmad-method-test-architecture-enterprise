---
title: 'Story 1.103: Prove the Story 1.42 review fixes against their mutants'
type: 'feature'
created: '2026-10-03'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '155abc17d89bddcf67d47d68fa1e7507a76dc556'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.103)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.103 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-23)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.42.md (Review round 1, Not done)'
  - '{project-root}/AGENTS.md'
---

<!-- prettier-ignore-start -->

<frozen-after-approval reason="The Evaluate relay coordinator froze the approach">

## Intent

**Problem:** Story 1.42's review round (adversarial and mutation lens, 53 mutants, 15 survivors) added tests and a guard fix for its survivors, and the weekly usage limit ended the work before any mutation run showed that each new test fails on the mutant it was written for. The suites were green and nothing proved the two-interface attribution stays protected at every lookup site (AD-23).

**Approach:** Define each surviving mutant as the smallest edit that collapses a pair lookup back to an operation-ID-only lookup (or removes the check beside it), apply it in a disposable copy, run the suites that read the site, and record the failing test. A mutant that survives gets a test that fails on it in this pull request. The Story 2.4 capture-record guard is proved the same way.

## Boundaries & Constraints

**Always:** Mutation experiments run in a scratch copy made with `git archive HEAD` and a link to this checkout's `node_modules`. The shared checkout is never mutated. Signal only processes this work started.

**Never:** Mutate a file of the shared checkout or add an npm script chain. The coordinator flips Stories 1.42 and 1.78 to `done` in this pull request; the build leaves those rows alone.

</frozen-after-approval>

<!-- prettier-ignore-end -->

## Decision

The review round's survivor list names sites, so this story fixed one edit per site.
Thirty-eight mutants cover every site the list names (`score.js` phase snapshot and unclassified observation, `sealed-brief-agent.js` `degenerateAnswer` and `armPortFor`, `run.js` calibration observation and step ceiling, `calibration.js`, `arm.js`, `check.js` option sets, gameability lookups, principal mappings and phase coverage, the workflow suite's skipped-step entry) plus the other pair sites Story 1.42 touched (`interpret.js` `phaseOf`, `records-calibration.js`, `historical.js`, `release-report.js`, `admission.js`).
Twelve more mutants cover the capture-record guard.
The independent review of the first commit added five mutants of the same sites (A1b, K1c, K2c, K7b, K8b, each dropping the other half of a pair lookup) and two guard mutants (G6b, G10) and a third round added G11 (an operation moved between two declared interfaces); they survived the first tests and each now has a case.

A committed harness would run the suites of the gate list once per mutant, far past the pre-commit budget, so it stays out of the repository.
The mutant list and the failing test per mutant live in this record.
Each new case in a suite is its own revert check: removing the code it protects fails it.

The mutants ran in four scratch copies under the session's scratchpad, one file edited at a time and restored afterwards, against eval-quality 6.0.1 (the version installed, since versions float).

## What changed

- **`test/test-evaluate-interpret.js`.** Direct calls of `phaseSnapshotProblems` over the two-interface run's real contract (a reused operation ID classified on the other interface does not stand in for a missing pair, an operation only the HTTP interface declares is undeclared on the command interface, an unknown phase on one pair), a sealed record whose command observation names an operation the snapshot classifies only on the HTTP interface, and two `runArm` refusals (a step whose operation only another interface declares, and a step on a pair its own interface declares twice). The duplicate has its own path template and the case compiles it with `eval-quality` first, so a later engine release that refuses it fails the case. The arm cases use their own trap port. The gameability router case adds a second operation of the command interface under another executable, with its own step and answer.
- **`test/test-evaluate-check.js`.** The gameability case now answers both interfaces' steps with exit 9, which only the second interface's entry declares as infrastructure, so a registry entry matched by executable alone flags the wrong step.
  A principal-mapping case puts one operation ID on two interfaces and requires a finding for the step on the second interface only.
  The skill-runner ceiling case adds a step on the second interface and requires its finding on one line, so an option set matched to its registry entry by executable alone passes no longer. A shared-interface case declares a second operation under another executable on one interface, gives only that entry the 1000 ms ceiling and exit 9, and requires the findings of that step alone.
- **`test/test-evaluate-calibration.js`.** A unit case holds `calibrationStepPair` to the step's own interface where two interfaces share an operation ID.
- **`test/test-evaluate-ci.js`.** The Story 2.4 capture-record guard moved out of `checkRepositoryPlans` into its own case, `the capture-record guard`, a table where each failure is a named case (see below).
  `captureProblems` refuses a `migrations` entry that names anything beyond `file`, `story` and `change`, and `reverseSchema2Migration` requires the migrated file to be the runtime's own serialization with phases keyed under interfaces its registry declares (`JSON.stringify(value, null, 2)` and a newline), so a whitespace edit no longer survives the rebuild.
- **`cli/lib/evaluate/arm.js`.** The `operationsByPair` comment now says when compile refuses a pair declared twice (one transport signature, or a check that cites the step) and that the arm refuses an uncited step on it.
- **`test/lib/scratch-directories.js`.** `holdPrivateParents(pid)` writes the holder's process id to a file named for `pid` in `/tmp/tea-evaluate-test-holds-p<uid>`, beside the private root and outside every parent, and the reaper of dead private parents leaves every parent named `run-<pid>-*` while that holder runs. A hold is written before the parent exists, into a staged file made exclusively and renamed into place, and a reaper the holder started itself ignores it. The directory gets the private root's checks (`heldPrivateRoot`: a real directory the user owns, no link; `holdPrivateParents` throws and the reaper reaps nothing when it fails), a hold is opened without blocking and read only when it is a regular file, and the reaper removes every regular file there that is not a hold or staged file of a running suite.
- **`test/test-evaluate-mutation.js` and `test/test-test-design-qualification.js`.** Every case that spawns a child whose private parent it later reads or expects to be reclaimed holds that child's pid right after the spawn (the interrupted preflight, the launched pair of preflights, the killed engine stage, the unrelated live run, the Git-checkout hold), the auxiliary-journal edge case holds its planted dead pid, and the qualification signal case holds the pid of the child it kills and its planted dead pid.
- **Plan.** `epics.md` Story 1.103 and `test-design-epic-1.md` amend the guard criterion (see the amendment below).

## Acceptance criteria and their revert checks

| Criterion                                                               | What fails on a revert                                                                                                                                                                    |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every listed survivor fails a named test                                | The mutant table below: each of the 37 reachable mutants fails the test named beside it. Reverting any new case lets its mutant pass again.                                               |
| A surviving mutant gets a test                                          | Thirteen mutants survived the review round's tests and the first version of this story's (S2, S3, S5, C2, Ar4, K3, K7, K8, A1b, K1c, K2c, K7b, K8b). Each now has a case and fails on it. |
| The capture-record guard fails on a false entry, an absent one, an edit | Twelve guard mutants (G1 to G11 and G6b) each fail a named case of `the capture-record guard`.                                                                                            |
| Unreachable sites are recorded with the reason                          | `check.js` `infrastructureObservation` is the one site no contract can reach (below).                                                                                                     |

## Mutants

Each mutant is one edit to one file of a scratch copy.
`Suite` is the suite that read the site.
`New` marks the thirteen survivors (S2, S3, S5, C2, Ar4, K3, K7, K8, A1b, K1c, K2c, K7b, K8b) and the test this story added for each.

| ID  | Site and edit                                                                                                      | Suite       | Failing test                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | `score.js` `phaseEntries` drops the interface from each triple                                                     | interpret   | `run.json phases swapped between interfaces`                                                                                                                                        |
| S2  | `score.js` snapshot completeness looks a phase up across interfaces by operation ID                                | interpret   | New: `a reused operation ID classified on the HTTP interface does not stand in for the command pair`                                                                                |
| S3  | `score.js` snapshot `declared` set keyed by operation ID alone                                                     | interpret   | New: `an operation only the HTTP interface declares is undeclared on the command interface`                                                                                         |
| S4  | `score.js` snapshot accepts an unknown phase                                                                       | interpret   | `a snapshot with an unknown phase`                                                                                                                                                  |
| S5  | `score.js` unclassified observation looks its phase up across interfaces                                           | interpret   | New: `an observation of an operation the snapshot classifies on another interface`                                                                                                  |
| S6  | `score.js` skips the unclassified observation check                                                                | interpret   | `an observation of an unclassified pair`                                                                                                                                            |
| I1  | `interpret.js` `phaseOf` looks across interfaces by operation ID                                                   | interpret   | the shared-operation `projectTrial` case (strict deep equal of citations)                                                                                                           |
| A1  | `sealed-brief-agent.js` `degenerateAnswer` finds the step by operation ID alone                                    | interpret   | `each interface is answered from its own step`                                                                                                                                      |
| A1b | `sealed-brief-agent.js` `degenerateAnswer` finds the step by interface and kind alone (the operation half dropped) | interpret   | New: `each interface and each operation is answered from its own step` (the command interface now also declares `grade-extra` under `grader-cli-x`, with its own step and answer)   |
| A2  | `sealed-brief-agent.js` `armPortFor` hands `degenerateAnswer` no interface                                         | interpret   | `each interface is answered from its own step`                                                                                                                                      |
| A3  | `sealed-brief-agent.js` `degenerateAnswer` answers from the first step of the kind                                 | interpret   | `each interface is answered from its own step`                                                                                                                                      |
| R1  | `run.js` trial step ceiling finds a step's operation by operation ID across interfaces                             | interpret   | `the trial ceiling follows each step's own interface`                                                                                                                               |
| R2  | `run.js` calibration observation names no step interface                                                           | evaluators  | `command calibration observation named calibration/judge-request; expected the plan step's pair verdict/judge-request`                                                              |
| C1  | `calibration.js` `calibrationStepPair` never names the step interface                                              | evaluators  | the same evaluator case as R2                                                                                                                                                       |
| C2  | `calibration.js` `calibrationStepPair` takes the first plan step that shares the step's operation ID               | calibration | New: the `calibrationStepPair` unit case (`second-run` gives `grader-api`)                                                                                                          |
| C3  | `calibration.js` `calibrationObservation` drops the interface                                                      | evaluators  | the same evaluator case as R2                                                                                                                                                       |
| C4  | `calibration.js` `calibrationProblems` resolves against an observation with no interface                           | calibration | `the calibration observation names no interface`                                                                                                                                    |
| RC1 | `records-calibration.js` scorer input names no step interface                                                      | records     | `a records run over verified calibration judgments exited 10; expected 0` (20 checks, `scorerInput is not the label-free observation`)                                              |
| Ar1 | `arm.js` operations indexed and looked up by operation ID alone                                                    | interpret   | `tea-evaluate run` exit 12 on the reused-operation project (`declares twice`), and `a step on an interface that does not declare its operation ran` (the `wrongInterface` arm case) |
| Ar2 | `arm.js` operations indexed by operation ID alone, last interface wins                                             | interpret   | `tea-evaluate run` exit 11 on the reused-operation project (the clean arm does not pass), and the same `wrongInterface` arm case                                                    |
| Ar3 | `arm.js` a skipped step's entry drops its interface                                                                | workflow    | `a create whose output is a field its output does not hold` and 13 more exact-entry checks                                                                                          |
| Ar4 | `arm.js` `operationsByPair` accepts a pair declared twice in one interface                                         | interpret   | New: `a step on a pair its interface declares twice ran` (the case compiles the duplicate with `eval-quality` first)                                                                |
| K1  | `check.js` `optionSetsByOperation` matches a plan step by operation ID alone                                       | check       | `a second interface with a tighter ceiling drew a finding for the first interface's step`                                                                                           |
| K1c | `check.js` `optionSetsByOperation` matches a plan step by interface alone (the operation half dropped)             | check       | New: `a step was not held to the ceiling of its own operation's entry on a shared interface` (one interface, two executables, only the second entry has the 1000 ms ceiling)        |
| K2  | `check.js` gameability step lookup matches the operation by ID alone                                               | check       | `a gameability answer for a step on the second interface was not held to that interface's codes`                                                                                    |
| K2c | `check.js` gameability step lookup finds the operation by interface alone                                          | check       | New: `a gameability answer was not held to the infrastructure codes of its own operation's entry on a shared interface` (only the second entry declares exit 9)                     |
| K3  | `check.js` principal mapping lookup keyed by operation ID alone                                                    | check       | New: `a principal mapping was not held to the interface of each step that shares an operation ID`                                                                                   |
| K4  | `check.js` missing-pair finding looks across interfaces                                                            | check       | `a reused operation ID whose second interface has no phase operation phase` and 5 more                                                                                              |
| K5  | `check.js` undeclared-pair finding looks across interfaces                                                         | check       | `an undeclared interface operation phase` and 2 more                                                                                                                                |
| K6  | `check.js` unknown-phase finding dropped                                                                           | check       | `an unknown phase operation phase` and 1 more                                                                                                                                       |
| K7  | `check.js` gameability registry entry matched by executable alone                                                  | check       | New: the same gameability case, now answering both interfaces' steps with exit 9                                                                                                    |
| K7b | `check.js` gameability registry entries matched by interface alone (the executable dropped)                        | check       | New: the same shared-interface gameability case as K2c                                                                                                                              |
| K8  | `check.js` option set matched to its registry entry by executable alone                                            | check       | New: `the step on the second interface was not held to its own entry's ceiling`                                                                                                     |
| K8b | `check.js` option set matched to its registry entry by interface alone (the executable dropped)                    | check       | New: the same shared-interface ceiling case as K1c                                                                                                                                  |
| K9  | `check.js` `infrastructureObservation` names an `interfaceId`                                                      | check       | none (unreachable, below)                                                                                                                                                           |
| X1  | `historical.js` the report step is not told its interface                                                          | arms        | 139 of 729 arms checks                                                                                                                                                              |
| X2  | `release-report.js` the report plan step names no interface                                                        | arms        | 139 of 729 arms checks                                                                                                                                                              |
| X3  | `admission.js` qualification receives the home pair instead of its operation                                       | arms        | 96 of 566 arms checks                                                                                                                                                               |

### Capture-record guard

The guard of Story 2.4 (`test:evaluate-ci`, case `the capture-record guard`) holds each named case below.
`G` rows are mutants of the guard.

| ID  | Mutant                                                                                                                                                        | Failing case                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| G1  | a digest the entry names (`from` or `to`) is accepted                                                                                                         | `a migration entry that names a false from digest`                                                     |
| G2  | a `wrote` digest is not compared with the bytes                                                                                                               | `a wrote digest retyped to the migrated file as it stands`                                             |
| G3  | the migration is reversed whether or not the record declares it                                                                                               | `a record with no migrations entry`                                                                    |
| G4  | the rebuild is ignored and the migrated bytes are digested as they stand                                                                                      | `the committed record fails its own guard`                                                             |
| G5  | the rebuild accepts any serialization of the migrated file                                                                                                    | `an evaluation.json with a byte appended beyond the declared migration`                                |
| G6  | a migration of a file the tests do not know is accepted                                                                                                       | `a migration of a file the tests do not know`                                                          |
| G6b | a migration credited to another story is accepted (`migration.story !== '1.42'` dropped)                                                                      | `a migration credited to another story`                                                                |
| G7  | a migration declared twice is accepted                                                                                                                        | `a migration declared twice`                                                                           |
| G8  | the rebuild accepts one operation ID under two interfaces                                                                                                     | `a migrated file that reuses an operation ID across two interfaces, which no flat map could have held` |
| G9  | the rebuild does not require schema 2                                                                                                                         | `a migrated file that claims schema 1 beside its nested phases`                                        |
| G10 | a migrated file whose phases sit under an interface its registry never declared is accepted                                                                   | `a migrated file whose phases are keyed under an interface its registry never declared`                |
| G11 | a phase pair the file's contract does not declare is accepted (an operation moved to another declared interface, keeping order, rebuilds the same flat bytes) | `a moved operation ... was accepted` (the two-interface block after the case table)                    |

The table of cases also holds `a migration entry that names a false to digest`, `a record with an empty migrations list`, an `evaluation.json` whose tiers changed, one whose `operationPhases` changed, and a declared migration over a file that was never migrated.
G8 and G9 survived the first version of the table, which is why their two cases exist.

## Notes and decisions

- **Amendment to the guard criterion.** Story 1.42's review removed `from` and `to` from the `migrations` entry, since the rebuilt bytes are the only authority for the digest.
  The criterion's "names a false `from` digest" therefore has no entry shape to name.
  The criterion in `epics.md` now reads: the guard fails when a `migrations` entry names a digest (`from` or `to`), when a `wrote` digest is retyped, when the entry is absent and when `evaluation.json` changes by anything but the declared migration.
  The test-design row says the same.
  The guard now refuses any entry field beyond `file`, `story` and `change`, so a retyped `from` is refused where it was silently ignored before.
- **A whitespace edit passed the rebuild.** The first named case, one byte appended to `evaluation.json`, found that the rebuild reserializes the parsed file, so the guard accepted a changed byte.
  `reverseSchema2Migration` now returns `null` for a file that is not the runtime's own serialization, and the case fails with `declared migration could have produced`.
- **The `ambiguous` branch of `operationsByPair` is reachable.** Story 1.42 recorded it as unreachable past `eval-quality compile`, which was wrong for an uncited step.
  A real compile shows the engine refuses a pair declared twice only when a check cites a step that names it (`unreachable-check-evidence`, "which that interface declares more than once").
  A plan step no check cites, on a pair its interface declares twice, compiles, so the arm is the last place that stops it.
  Ar4 is therefore tested.
  The case runs `runArm` over the reused-operation project's compiled contract with the duplicated operation and an uncited step.
- **`infrastructureObservation` stays untested (K9).** `check.js` builds a synthetic command observation for a target that could not run and hands it to the engine's `resolveCheck`.
  Story 1.42 removed the `interfaceId` line from it.
  The engine reads an observation only through evidence pointers, and the pointer grammar's `EVIDENCE_CHANNELS` (`eval-quality/dist/core/schemas/pointer.js`: response-body, response-headers, response-status, stdout, stderr, exit-code, artifact, call-inputs) names no channel that reads `interfaceId`.
  No compiled contract can make a check read the field, so no test can observe it and the mutant stays alive by construction.
- **A shared-root flake class (real, closed for the cases below).** Four concurrent runs of `checkInterruptedReplay` failed five times in eight, with `the next ci run removed run-<pid>-otherfol` (and, in the first baseline run, a missing `removed the replay scratch directory`).
  The case plants parents named for a dead process under the shared `/tmp/tea-evaluate-p<uid>` and waits on the parent of a `ci` it kills.
  Every suite's `scratchDirectories` start and `removeAll` runs `removeDeadPrivateParents`, which removes the parent of every dead process under that root, so a suite finishing at the same time deleted another suite's planted or killed parent.
  An `fs` hook that logged the callers showed `removeDeadPrivateParents` as the only remover, and the runtime's own sweep skips another folder's parent.
  The first fix put a hold file inside each parent.
  It left a window between creating a parent and marking it, treated an empty or `0` hold as live, and could not serve the cases whose parents the runtime inspects.
  The second kept the hold beside the root but trusted the directory like any other, so a link in its place took the writes and a FIFO named like a pid blocked every reaper.
  The hold directory now gets the private root's checks, is read only through a non-blocking open of a regular file, is written through an exclusive staged file, and is swept of every regular file that is not a live hold or a live holder's staged file.
  A hold is written whole, so a file that names no running process is stale.
  The cases closed: every case of `test-evaluate-ci.js`, `test-evaluate-mutation.js` and `test-test-design-qualification.js` that plants a parent under a dead pid or reads the parent of a child it kills.
  The qualification case also stopped passing vacuously when another suite's reaper removed what the next cycle was meant to reclaim: the next cycle is a process the holder started, which ignores the hold.
  The unit case `the scratch holds` covers the pid texts, the sweep (a stale hold with and without a planted parent, an empty hold, a gone suite's staged file, a stray file), the release guard, a linked holds directory, a FIFO hold and a link planted at the staged name; its mutants L1 to L10 are all killed.
  Still open: a suite run from a checkout without this change still reaps the parents of the checkouts that have it, which resolves once this lands.
  `--auxiliary-only` failed two runs in ten under a tight-loop reaper while another lane's `test-evaluate-run` was running, and the hook showed no removal by this checkout's reaper, so the foreign reaper is the likely cause.
- **Where the mutants ran.** Every experiment ran in a `git archive HEAD` copy with a link to `node_modules`, one file edited and restored per mutant.
  The harness lives in the session scratchpad and is not committed.
- **Version of the engine.** The suites ran against eval-quality 6.0.1, the installed release.
  Story 1.42's own table names 5.0.0.

## Verification

Gates run in this checkout on the final tree:

- `test:evaluate-check` (1132 checks), `-interpret`, `-arms`, `-agents`, `-mcp`, `-run`, `-records`, `-calibration`, `-ci`, `-compare`, `-mutation` (727 checks) and `test:test-design-qualification` (206 checks).
- `npx eslint . --max-warnings 0`, `npm run format:check`, `npm run lint:md`, `npm run docs:validate-links`.
- The full `npm test` was not run; CI carries it.

## Undone

- A foreign-checkout reaper: a suite run from a checkout without `test/lib/scratch-directories.js` holds still removes held parents until this merges.
- A committed mutation harness.
  The mutants need the suites they run, which take longer than the pre-commit budget, so the list in this record is the reproduction.
