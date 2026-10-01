---
title: 'Story 1.45: Aggregate development strength through eval-quality'
type: 'feature'
created: '2026-10-01'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'b4bcff02'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Stories 1.14 and 1.45)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.45 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-5, AD-6, AD-7, AD-10, AD-12, AD-13)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.41.md (the held writer, staged `--out` and copy check this story reuses)'
  - '{project-root}/cli/lib/evaluate/score.js (`scoreProbes`, `scoreProbe`, `artifactProblems`)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** `tea-evaluate score` invokes eval-quality once per probe, so no run-wide class rate exists to compare with `evaluation.json.strengthFloor`, and TeA must not compute one (AD-6). Story 1.14 therefore tells the skill to record the limitation and make no class-wide claim.

**Approach:** The engine now owns the aggregate: eval-quality 4.7.0 (released first, PR #172 in the engine repository) ships `aggregate-strength`, which reads the run's per-probe evidence artifacts, the declared floors and the scoring policy and mints one `StrengthAggregate` with the eligible, exercised and caught counts, the rate, comparability and a floor decision per class. After the probe loop, `score` calls that stage through `runEngineStage` (the CLI over persisted files), copies the result into `scores/<scoreInvocationId>/strength-aggregate.json` through the held writer with the Story 1.41 staging and read-back, and records it in the score summary and `interpretation.json`. TeA compares digests and the engine version only; it never computes a rate or a decision. `references/run.md` and `references/gaps.md` read that aggregate to enforce the adopter's class floors before held-out execution.

## Boundaries & Constraints

**Always:** the peer floor moves to `>=4.7.0` everywhere it is recorded (package.json peer, lockfile root and installed entry, publish guard and release-metadata `ENGINE_FLOOR`, the install hint, the reference, the AD-5 and AD-13 text, tests that pin 4.6.0). The aggregate runs once per `score` invocation, after the probe loop, only when every probe copied an evidence artifact and no integrity error occurred; otherwise the summary records it as absent with the reason, and the existing shim and race-fixture call counts hold. Floors come from `evaluation.json.strengthFloor`, staged as a private file and copied into the score directory with its digest so a replay reads the same floors; the policy is the run's own `policy` input. The aggregate is validated against the published `strength-aggregate` schema and schema version before it is copied. The aggregate's `inputs[].artifactDigest` values must equal the digests of the evidence files TeA persisted (`digestArtifact` over `scanJson`, through `engine.js`, since the file ends in a newline and a byte digest will not match), the set of probes must equal the scored probe set, and its `engineVersion` must equal `run.json.evalQualityVersion`; any disagreement exits 12 and blocks every class-wide claim. A floor decision never changes an exit code (the engine exits 0 whatever it decides); engine exits 4, 5 and 64 pass through the existing most-severe combination. A `records` run aggregates too. The aggregate is part of the evidence bundle (AD-12). Skill guide edits go through the workflow-builder Edit process.

**Never:** a rate, count, comparability or floor decision computed in TeA; the library import (`aggregateStrength`) in place of the CLI stage; reading `evaluation.json` a second time after staging the floors; an aggregate call that changes the argv, exit code or file set of a score invocation in which a probe has no evidence; a new exit code; an engine change in this story (4.7.0 is released); `canary` floors (the engine admits `defect`, `gameability` and `zero-action`; canaries stay outside every denominator, so the TeA schema drops `canary` from `strengthFloor`).

**Decisions (coordinator, owner-delegated):**

- Engine first: eval-quality 4.7.0 was released from lane 3 before this story built. Lane 1's Story 1.68 (verified read of score inputs) is unmerged; 1.45 lands first, and 1.68 then routes this call's inputs (the copied evidence, the staged floors, the policy) through its held read.
- `aggregate-strength` joins `DOCUMENTED_EXITS` as {0, 4, 5, 64}; any other code, a signal or a spawn error is an `EngineStageError` (exit 12).
- The aggregate covers the partition the invocation scored. The guides read the development aggregate before held-out; a held-out floor stays out of scope.

## I/O & Edge-Case Matrix

| Scenario                                              | Input / State                                            | Expected Output / Behavior                                                             | Error Handling          |
| ----------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------- |
| Four of five qualified defect probes caught           | floor `0.75`, then the same evidence at `0.9`            | aggregate copied; `defect` decision `meets`, then `does-not-meet` (`rate-below-floor`) | exit 0 either way       |
| Class with no eligible probe                          | no probe of a class                                      | class `null`, decision `does-not-meet` (`no-eligible-probe`) or `undeclared`           | none                    |
| Admitted class, no exercised probe                    | all trials unreached                                     | `rate: null`, `no-exercised-probe`                                                     | none                    |
| Trial set below `minimumTrialCount`                   | one probe with fewer trials                              | class `comparable: false`, never `meets`                                               | none                    |
| Clean controls and canaries                           | scored beside defect probes                              | outside every class denominator                                                        | none                    |
| A probe has no evidence artifact                      | a probe exits 3 with no artifact                         | no aggregate call; summary records it absent with the reason; no class-wide claim      | per-probe exit as today |
| Aggregate digest, probe set or engine version differs | a persisted evidence file changed, or a forged aggregate | nothing copied, summary names the mismatch                                             | exit 12                 |
| Direct re-run of the recorded argv, fresh `--out`     | unchanged run, floors copy in the score directory        | equals the persisted aggregate byte for byte                                           | n/a                     |
| Engine refuses the set                                | engine exits 4 or 5                                      | no aggregate; the exit joins the most-severe combination                               | exit 4 or 5             |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/score.js`: `scoreProbes` (after the probe loop, before the summary write) gets the aggregate step; `scoreProbe`'s staging and `writer.write` read-back are the pattern to reuse; `combinedExit`.
- `cli/lib/evaluate/engine-cli.js`: `runEngineStage` and `DOCUMENTED_EXITS` (add `'aggregate-strength'`).
- `cli/lib/evaluate/engine.js`: the only file naming eval-quality; add the digest helper (`digestArtifact` over `scanJson`), the `strength-aggregate` validator and schema version, and the 4.7.0 install hint.
- `cli/lib/evaluate/interpret.js`, `cli/lib/evaluate/partition.js`: carry the aggregate pointer; `interpretation.json` key list moves in `test/test-evaluate-interpret.js`.
- `cli/lib/evaluate/schemas/evaluation.schema.json` (`strengthFloor`, drop `canary`), `src/workflows/testarch/bmad-testarch-evaluate/assets/evaluation.json`.
- `src/workflows/testarch/bmad-testarch-evaluate/references/run.md` (`## Read development strength before held-out`) and `references/gaps.md` (`## Read the strength vector`, step 6 of `## Author, rerun and rescore`): replace the "no engine-owned class rate" limitation with the aggregate reading; `test/test-evaluate-guidance.js` markers `no engine-owned class rate across all probes`, `no class-wide strength claim` and `no class-wide catch rate across probes` are replaced by pins for the source (`strength-aggregate.json`), the floor decision and basis, `null`, `rate: null`, `not-comparable`, and the absent or mismatched case.
- `test/test-evaluate-run.js`, `test/test-evaluate-partitions.js`, `test/fixtures/evaluate/engine-shim.js`, `race-engine.js` (pass non-`score` stages through), `wrap-score-writer.cjs`.
- Version floor: `package.json`, `package-lock.json`, `tools/guard-publish.js`, `test/test-release-metadata.js`, `test/test-guard-publish.js`, `docs/reference/tea-evaluate-cli.md`, `ARCHITECTURE-SPINE.md` (AD-5, AD-13, versions table).
- `CHANGELOG.md`, `epics.md` and `test-design-epic-1.md` (amend where the build departs), `tools/test-shard-weights.json` (only if a measured weight moves).

## Tasks & Acceptance

**Execution:**

- [ ] Raise the peer floor to 4.7.0 and refresh the lock (`npm install eval-quality@4.7.0` in the lock, `latest` stays the dev spec); update every pinned reference -- AC 1
- [ ] Aggregate step in `scoreProbes` with staged floors, staged `--out`, schema and digest checks, held-writer copy and read-back, summary and `interpretation.json` pointer; `DOCUMENTED_EXITS`; `engine.js` helpers -- AC 1, 2, 3
- [ ] Schema `canary` removal and its tests -- AC 2
- [ ] End-to-end cases over real 4.7.0 (five probes; floor flip 0.75 vs 0.9 over one evidence set; null, `rate: null` and non-comparable states; controls and canaries outside; absent, mismatched and forged aggregates; direct re-run of the recorded argv equal byte for byte), shim and race fixture guards, revert observations per criterion -- AC 1 to 4
- [ ] Skill guides (workflow-builder Edit), guidance test, reference, CHANGELOG, plan amendments -- AC 5

**Acceptance Criteria:**

- Five qualified defect probes scored through the engine produce one copied aggregate whose bytes equal the engine's and whose input digests equal TeA's persisted evidence (revert: computing the rate locally, or dropping the copy, fails byte and lineage equality).
- Four caught among five meets a `0.75` floor and does not meet `0.9` on the same evidence; the guide reads only that decision (revert: removing the floor comparison or changing either expected decision fails).
- `null`, `rate: null` and non-comparable readings stay distinct and clean controls and canaries stay outside every denominator (revert: counting an excluded probe or converting a state fails).
- A missing, mismatched or forged aggregate exits 12 or is recorded absent and blocks a class-wide claim; re-running the recorded argv reproduces the persisted aggregate byte for byte.
- `references/run.md` and `references/gaps.md` read the aggregate to enforce class floors before held-out execution; the guidance test fails if the source, the decision and basis, or the null and non-comparable readings are removed.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**

- `npm view eval-quality version` -- expected: 4.7.0 or later
- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.aggregateStrength !== 'function' || typeof m.scanJson !== 'function') process.exit(1)"` -- expected: exit 0
- `npm run test:release-metadata && npm run test:guard-publish` -- expected: green
- `npm run test:evaluate-run && npm run test:evaluate-partitions && npm run test:evaluate-interpret && npm run test:evaluate-guidance && npm run test:evaluate-check` -- expected: green
- `npm run test:evaluate-boundaries && npm run test:direction && npm run test:shards && npm run test:ci-coverage && npm run test:doc-counts && npm run test:changelog` -- expected: green
- `npm run lint && npm run lint:md && npm run format:check && npm run docs:validate-links && npm run docs:build` -- expected: green
- `npm test` -- expected: green in CI shards (not run locally, per the owner's relay instruction)
