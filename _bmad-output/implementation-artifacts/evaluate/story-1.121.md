---
title: 'Story 1.121: Make the ci controlled-mutation witnesses read the reported element so their preflight passes'
type: 'bugfix'
created: '2026-10-04'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'f570511a'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.121; the Story 1.99 amendment that files it; Stories 1.122, 1.123 and 1.95, which follow it in lane 4)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.121 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-10, AD-11 and the Story 1.99 amendments)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.99.md (the pre-flight analysis that found this)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.97.md (the record format and the latest ci-corpus change)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.93.md (the ci corpus and its constructed deviations)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** The three ci controlled-mutation probes carry manifestation witnesses that read the element the run gets wrong.
P-001 and P-002 are a `not` over a containment of the requested token, and P-003 is a containment of `burn-in`.
Pre-flight's fault leg replays the correct run on the planted input, where each witness is silent, so `test/probes/expected-strength.json` has recorded `failed: seeded-fault-fired, seeded-faults-scoped` for all three since before Story 1.99.
The other fifteen controlled-mutation probes read the plant in a run that reports it and pass pre-flight.

**Approach:** Each ci witness reads the request in the workflow the run wrote.
P-001 and P-002 become a containment of the requested element.
P-003 becomes an `all` of a containment of the requested test command and a `not` over a containment of the forbidden job, so it fires on the minimal project's correct run and stays silent on every clean leg.
The qualification kit declares `plant-reported` for the ci corpus, the `gap-read` label leaves the kit, and `test:ci-qualification` resolves each witness over the two clean legs pre-flight reads.
The baseline records the three pre-flights as `passed`.

## Boundaries & Constraints

**Always:**

- The witnesses live in `tools/generate-probes.js` (`buildCiProbes`); `test/probes/ci.probes.json` is regenerated from it.
- Every other probe keeps its verdict, exit code and pre-flight outcome, and `expected-strength.json` moves only in the three ci pre-flight records and the ci corpus digest.
- The verdict and exit code of the three probes stay null and 3: the qualification gate still refuses their signatures as `condition-artifact-channel-contract-local`.

**Never:**

- An edit of `references/ci.md`, `SKILL.md`, `assets/evaluation-ci-plan.template.json`, step 03b, `github-actions-template.yaml` or either `capture-record.json`, so no live recapture is needed.
- A live session, `claude -p`, an `eval:ci` run against a real agent, Docker.
- A new story, a change to the lane lists, or an edit of the sections of Stories 1.122, 1.123 and 1.95.
- A hand-edited generated digest.

**Decisions (build worker, owner-delegated):** the owner delegated every decision of this build, so none waited at a checkpoint; the Decisions list below carries each choice with its reason.

## I/O & Edge-Case Matrix

| Scenario                                  | Input / State                                                                 | Expected Output / Behavior                                                                          | Error Handling                                    |
| ----------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| P-001 and P-002 witness, correct run      | the full project's correct workflow                                           | fires (the workflow contains `0 2 * * 0`, `contents: read`)                                         | n/a                                               |
| P-001 and P-002 witness, twin             | the workflow with the requested element withheld                              | silent                                                                                              | n/a                                               |
| P-003 witness, minimal correct run        | the minimal project's correct workflow (`npm test`, no burn-in)               | fires                                                                                               | n/a                                               |
| P-003 witness, twin                       | the minimal workflow with the template's burn-in job appended                 | silent                                                                                              | n/a                                               |
| P-003 witness, full project's correct run | the full project's correct workflow (a clean leg of the operation)            | silent (it carries `burn-in`)                                                                       | n/a                                               |
| Any witness, no workflow written          | the alternate-platform leg's observation, the artifact `absent`               | silent                                                                                              | `test:ci-qualification` fails when it fires       |
| Witness that reads the other direction    | a `not` over a containment on P-001 or P-002, a bare containment of `burn-in` | silent on the correct run and fires on the twin                                                     | `test:ci-qualification` fails the direction check |
| Staged pre-flight from the leg cache      | `node test/eval-contract-strength.js --suite ci --from-cache`                 | P-001, P-002, P-003 and P-004 `passed`, P-001 to P-003 verdict null exit 3, P-004 `CONCERNS` exit 0 | exit 2 when a pre-flight outcome moved            |

</frozen-after-approval>

## Code Map

- `tools/generate-probes.js`: the three ci manifestation witnesses in `buildCiProbes`, the ci rationales (each ends with `PLANT_REPORTED_NOTE`), the cycle comment, and the note above `PLANT_REPORTED_NOTE`.
- `test/test-ci-qualification.js`: declares `plant-reported`, resolves each witness over an absent workflow and over the full project's correct pipeline, and states the direction in its header.
- `test/lib/qualification-suite.js`: the `gap-read` label and its branch are gone; the direction check holds a corpus to `plant-reported`.
- Regenerated: `test/probes/ci.probes.json`, `test/probes/expected-strength.json` (the three ci pre-flight records, their `basis`, the ci corpus digest). `test/contracts/ci.contract.json` is byte-identical, since the witnesses live on the probes.
- `docs/explanation/eval-quality-command-adapter.md`, `test/probes/README.md`, `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `ARCHITECTURE-SPINE.md`, `sprint-status.yaml` (row 1.121 `review`).
- Not changed: `references/ci.md`, `SKILL.md`, the plan template, step 03b, `github-actions-template.yaml`, the two capture records, the lane lists, the sections of Stories 1.122, 1.123 and 1.95.

## Tasks & Acceptance

- [x] Reproduce the three recorded pre-flight failures on the untouched tree.
- [x] Change the three witnesses in the generator and regenerate the probes, the contracts and the baseline.
- [x] The kit: `plant-reported` for the ci corpus, `gap-read` removed, the clean-leg reads added.
- [x] Counts, docs, CHANGELOG, planning amendments, `sprint-status.yaml`, this record.

**Acceptance Criteria:** as in `epics.md` Story 1.121, with the amendment dated 2026-10-04 there.

## Decisions

1. **The leg cache came from the ci stub agent.**
   The worktree had no `test/eval-artifacts/preflight-cache`, and this build runs no live session.
   A scratch driver (under the scratchpad, never committed) ran each pre-flight leg of the ci suite through `cachingPort` with the ci stub agent (`test/fixtures/ci-runner/stub-agent.js`, the replay corpus's correct run) as a `custom` agent, and `nothing` mode for the alternate-platform leg, which is the observation a real run gives (the declared artifact `absent`).
   The cache keys are taken before the agent is merged into the request, so they equal the live keys.
   On the untouched tree the stub-built cache reproduces the recorded baseline exactly (see Reproduction), which is what makes it a fair stand-in for the live cache.
   The first attempt, with the correct run on both witness legs, failed `input-sensitivity` as well, because the two witness legs then answered alike; the real alternate-platform leg writes nothing, so the driver does too.
2. **P-001 and P-002 drop the `not`.**
   The fault leg replays the full project's request, which is the same request as the `witness-github-actions` leg, so pre-flight drops that clean leg as having answered alike.
   The one clean leg left is the alternate-platform leg, whose artifact is absent, and a bare containment over an absent artifact is silent there.
3. **P-003 is `all(containment npm test, not containment burn-in)`.**
   Tried against the cached legs:

   | Witness                                         | Pre-flight                                                                                                                                                                        |
   | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | containment of `burn-in` (the old witness)      | `seeded-fault-fired` (false on the minimal project's correct run) and `seeded-faults-scoped` (fires on `witness-github-actions`, the full project's run, which carries `burn-in`) |
   | `not` over a containment of `burn-in` (flipped) | `seeded-faults-scoped` (fires on `witness-alternate-platform`: a `not` over a containment of an absent artifact is true)                                                          |
   | `all(npm test, not burn-in)`                    | passes                                                                                                                                                                            |
   | `all(not burn-in, npm test)`                    | passes (operand order does not matter)                                                                                                                                            |
   | `all(npm ci, not burn-in)`                      | passes (any anchor the minimal run holds works)                                                                                                                                   |

   The positive operand is what makes the witness silent on an absent artifact, and the `not` is what makes it silent on the full project's run.
   `npm test` is the minimal project's requested test command, the token the clean control P-004 already reads, so no new literal enters the generator's vocabulary.
   The shape reads as the request honoured: the requested command present and the forbidden job absent.

4. **`defectSignature` stays.**
   The signature is the condition under which the defect is observed (the element missing, the job present), a different claim from the witness, and the acceptance criteria change the witness only.
5. **The ci rationales gain `PLANT_REPORTED_NOTE`.**
   The note says the witness reads the plant in a run that reports it and is silent on the mutated artifact; that is now true of the ci probes, so the eighteen controlled-mutation rationales carry it.
   The ci `corpusDigest` moves with the probe text, as the baseline's digest rule expects.
6. **The kit keeps a `witnessDirection` declaration with one label.**
   The acceptance criteria say `test:ci-qualification` declares `plant-reported`, and the declaration is how a suite states what its corpus holds.
   The kit's check reads each committed witness over both stored artifacts and fails any witness that does not fire on the clean arm and stay silent on the mutated one, so a witness that reads the other direction fails the suite with the two resolutions in the message.
7. **A static read of the two clean legs.**
   The pre-flight verdict needs a leg cache that only a live run fills, so nothing in `npm test` would fail if P-003's positive operand were removed (the kit's direction check cannot tell the flipped `not` from the final shape: both fire on the correct pipeline and are silent on the twin).
   `test:ci-qualification` resolves each emitted witness over an `absent` workflow observation and, for each probe whose fault-leg request differs from the contract's `witness-github-actions` request, over the full project's correct pipeline, and fails when it fires on either.
   P-001 and P-002 send that request, so pre-flight drops the leg as having answered alike and the read is skipped for them; the skip is keyed on the deep equality of the two requests, so a prompt that drifts runs the read.
   Those are the two clean legs `seeded-faults-scoped` examines, so the check fails on the same witnesses pre-flight fails them on.
8. **`expected-strength.json` moves a little further than the brief's list: the `basis` line.**
   The three records drop `"pre-flight verdict did not pass"` from `basis`, a consequence of the pre-flight passing and inside the three ci pre-flight records.
   Every other field of the three records, and every field of every other record, is unchanged.
9. **`docs/explanation/eval-quality-command-adapter.md` is brought current.**
   It said all three ci defect probes fail pre-flight on `seeded-fault-fired` and that seventeen of 59 probes cannot pre-flight.
   Fourteen of 59 cannot (all `test-design`'s), the ci probes clear pre-flight and are refused at AD-9's gate as `nfr`'s are, and the doc says so.
   The `eval-quality.config.json` doc-claim keyed on "of the 59 cannot pre-flight today" is still the snapshot sentence, and `test:doc-counts` and `test:doc-claims` pass.

## Reproduction

`node test/eval-contract-strength.js --suite ci --from-cache` on the untouched tree (leg cache built as in decision 1):

| Probe | Pre-flight                                         | Verdict, exit |
| ----- | -------------------------------------------------- | ------------- |
| P-001 | `failed: seeded-fault-fired, seeded-faults-scoped` | null, 3       |
| P-002 | `failed: seeded-fault-fired, seeded-faults-scoped` | null, 3       |
| P-003 | `failed: seeded-fault-fired, seeded-faults-scoped` | null, 3       |
| P-004 | `passed`                                           | `CONCERNS`, 0 |

The run ended `every probe matched the outcome test/probes/expected-strength.json records`.
After the change the same command prints `passed` for all four, the verdicts and exit codes above, and the same line.

## Revert observations

Each revert was applied once to a scratch copy of the final tree (the committed tree exported with `git archive`, a scratch git repository for the suite's status guard, the leg cache copied in, `node_modules` linked) under the scratchpad directory, the named check run, the failure recorded and the file restored.

| Revert (the one edit)                                                             | Check run                                           | Observed                                                                                                     |
| --------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| the `not` restored in P-001's witness (committed probe file)                      | `eval-contract-strength.js --suite ci --from-cache` | exit 2: `P-001: pre-flight failed: seeded-fault-fired, seeded-faults-scoped, recorded passed`                |
|                                                                                   | `test:ci-qualification`                             | 1 of 456 checks fail: P-001's witness is silent on the clean arm and fires on the mutated artifact           |
| the `not` restored in P-002's witness                                             | `eval-contract-strength.js --suite ci --from-cache` | exit 2: `P-002: ... failed: seeded-fault-fired, seeded-faults-scoped, recorded passed`                       |
|                                                                                   | `test:ci-qualification`                             | 1 of 456 checks fail: the same direction failure                                                             |
| P-003's old witness (containment of `burn-in`)                                    | `eval-contract-strength.js --suite ci --from-cache` | exit 2: `P-003: ... failed: seeded-fault-fired, seeded-faults-scoped, recorded passed`                       |
|                                                                                   | `test:ci-qualification`                             | 1 of 456 checks fail: the direction failure                                                                  |
| P-003's flipped containment (`not` over `burn-in`)                                | `eval-contract-strength.js --suite ci --from-cache` | exit 2: `P-003: pre-flight failed: seeded-faults-scoped, recorded passed`                                    |
| P-003 without its `not` (containment of `npm test` alone)                         | `eval-contract-strength.js --suite ci --from-cache` | exit 2: `P-003: pre-flight failed: seeded-faults-scoped`                                                     |
|                                                                                   | `test:ci-qualification`                             | 1 of 456 checks fail: the witness fires on the clean arm and on the mutated artifact                         |
| all three old witnesses (the `gap-read` set)                                      | `test:ci-qualification`                             | 3 of 456 checks fail, one per probe, each naming the direction and the declared `plant-reported`             |
| the generator's P-001 and P-002 with the `not` restored                           | `test:ci-qualification`                             | 2 of 456 fail: both witnesses fire when the run wrote no workflow                                            |
|                                                                                   | `test:probe-sources`                                | fails: `test/probes/ci.probes.json differs from its sources`                                                 |
| the generator's P-003 without the `npm test` operand                              | `test:ci-qualification`                             | 1 of 456 fails: the witness fires when the run wrote no workflow                                             |
|                                                                                   | `test:probe-sources`                                | fails: `test/probes/ci.probes.json differs from its sources`                                                 |
| the generator's P-001 and P-002 fault-leg prompt changed by one character         | `test:ci-qualification`                             | 2 of 458 fail: both witnesses fire on the full project's correct pipeline, which the read now covers         |
| the generator's P-003 as a bare containment of `burn-in`                          | `test:ci-qualification`                             | 1 of 456 fails: the witness fires on the full project's correct pipeline                                     |
|                                                                                   | `test:probe-sources`                                | fails: `test/probes/ci.probes.json differs from its sources`                                                 |
| `expected-strength.json` with the three ci pre-flight records as on `origin/main` | `eval-contract-strength.js --suite ci --from-cache` | exit 2: three pre-flight outcomes moved, `passed` against `failed: seeded-fault-fired, seeded-faults-scoped` |
|                                                                                   | `test:probe-corpus`                                 | fails on the ci `corpusDigest` (recorded `fa5c71f8`, measured `4358c3a1`)                                    |

Without the added clean-leg reads, the flipped containment of `burn-in` (row 4) passes `test:ci-qualification`, which is why those reads exist (decision 7); the rows against the generator are the ones that exercise them.

## Gates

Run one host-heavy gate at a time, on a machine shared with the other lanes.
No full local `npm test`: the hook and CI carry the chain.
Local, macOS, on the final tree:

- `node test/eval-contract-strength.js --suite ci --from-cache`: matches the recorded outcomes.
- `test:ci-qualification` (456 checks), `test:probe-corpus`, `test:probe-sources` (15 corpus files), `test:contract-sources` (16 contracts), `test:contracts`, `test:contract-oracles` (9,184 checks), `test:eval-ci-data`, `test:eval-replay` (185 passed, 0 moved).
- `git diff -- package.json package-lock.json` is empty.

## Build review

One pass of a general-purpose review subagent over the commit, read only, in place of `/bmad-code-review`.
It found the acceptance criteria met and the witness shapes correct against eval-quality's pre-flight reducer, and four items:

| Finding                                                                                                            | Verdict | Route                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/test-probe-corpus.js` still said all three ci defect probes fail pre-flight and named thirteen other corpora | valid   | Fixed here: fourteen other corpora, `test-design` only                                                                                       |
| The Story 1.99 CHANGELOG entry contradicted itself after the appended amendment                                    | valid   | Fixed here: the entry states the final direction (`plant-reported` for all four corpora), and the new entry names the old `gap-read` reading |
| The clean-leg read skipped P-001 and P-002 on their baseline path, with nothing holding the request equality       | valid   | Fixed here: the skip is keyed on the deep equality with the `witness-github-actions` request, and a revert row proves it                     |
| The record ended on a placeholder                                                                                  | valid   | Fixed here: this section                                                                                                                     |

The planning documents keep their Story 1.99 paragraphs as history, each followed by the dated 2026-10-04 amendment.
