---
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted:
  ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-09-23'
inputDocuments:
  - '_bmad-output/planning-artifacts/evaluate/epics.md'
  - '_bmad-output/planning-artifacts/evaluate/SPEC.md'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md'
  - '_bmad-output/planning-artifacts/evaluate/eval-quality-facts.md'
  - '_bmad-output/planning-artifacts/evaluate/ci-enforcement-policy.md'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md'
  - 'AGENTS.md'
  - 'package.json'
  - '.github/workflows/quality.yaml'
  - 'tools/validate-ci-coverage.js'
  - 'test/eval-ci.js'
  - 'src/workflows/testarch/bmad-testarch-ci/'
  - 'knowledge: risk-governance, probability-impact, test-levels-framework, test-priorities-matrix'
---

# Test Design: Epic 2, Continuous proof in CI

**Date:** 2026-09-22
**Author:** eval-testdesign (planning fleet step 4), on the owner's behalf
**Status:** Draft for owner review

## Executive Summary

**Scope:** full epic-level test design for Stories 2.1 to 2.5 and the owner's Story H.1. The 2026-09-23 amendment made tier placement a derived, recorded decision (AD-10), added the gameability arm, contract-source freshness and oracle-versus-scorer agreement to `pr`, put held-out partitions and judge calibration on `scheduled` and `release`, and wired every new fixture evaluation into TeA's `pr` tier; the added risks and scenarios are marked by those stories. Epic 2 turns Epic 1's evaluation into a check that runs on every pull request, with tiers, enforcement classes and a published evidence bundle. It inherits Epic 1's test levels, house test form and revert-check rule (`test-design-epic-1.md`, "Test Levels Used In This Epic").

**Risk summary:**

- Risks identified: 19
- High-priority risks (score 6 or more): 10, one of them at 9 as the stories were first written (R2-14), closed by a corrected acceptance criterion
- Dominant categories: TECH (replay integrity, enforcement mapping) and OPS (pipeline rendering, evidence upload)

**Coverage summary:**

- P0: 20 scenarios over replay integrity, the AD-10 table, baseline acceptance, the placement floor and the three added deterministic checks
- P1: 20 scenarios over tier membership, placement reasons, rendering and TeA's own wiring
- P2: 2 scenarios over documentation
- New `npm test` scripts: `test:evaluate-compare`, `test:evaluate-ci`, `test:evaluate-ci-render`, and Story 2.5's per-evaluation `pr` scripts, each chained into `npm test` (amended 2026-09-25 in Story 1.9: CI runs the `npm test` chain in shards through the `chain` matrix, which `test:ci-coverage` and `test:shards` hold, so a chained script needs no step of its own)

**Corrections made to `epics.md` and `ARCHITECTURE-SPINE.md` in this step:** acceptance criteria in all five stories and H.1 were untestable, incomplete or unbuildable as written, and AD-5, AD-7, AD-8, AD-10 and AD-12 gained the matching text; see "Acceptance Criteria Corrected In epics.md".

## Risk Assessment

Owner for every mitigation is the `/bmad-build` worker of the story named, verified by the coordinator's review layers; Story H.1's are the owner's.

### High-Priority Risks (Score 6 or more)

| Risk ID | Category | Description | P | I | Score | Mitigation | Timeline |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R2-01 | TECH | A replay that passes because it compares a file with itself: the produced evidence is written over the committed baseline or read back from it, or the baseline evidence is copied forward without re-scoring | 2 | 3 | 6 | Replay reads produced evidence only from a fresh `runs/<invocationId>/replay/` and baseline bytes only from `baseline/`; a difference exits 13 (new AD-10 row). One mutated baseline evidence byte exits 13 (catches self-comparison); a mutated clean-control `exitCode` in a baseline observation exits 13 while eval-quality's exits stay as recorded, and a logging engine shim shows `preflight` and `score` invoked (together they catch a copy without re-scoring) | 2.2 |
| R2-02 | OPS | Pipeline rendering is untestable as written: `bmad-testarch-ci` templates are rendered by the agent following step files, so no deterministic renderer exists for a test to call | 3 | 2 | 6 | A deterministic guidance and template test, plus an `evaluation-plan` case in the existing CI behavioral suite scored by `test/eval-ci.js` with a recorded replay (Story 2.3 corrected) | 2.3 |
| R2-03 | TECH | `tea-evaluate ci` maps an exit to a different enforcement class than AD-10, or promotes CONCERNS | 2 | 3 | 6 | Table-driven test with one fixture per AD-10 row asserting class and action; a `--strict` scan over `cli/` and the plan template | 2.2 |
| R2-04 | DATA | A dirty run (`dirty: true`) accepted as a baseline | 2 | 3 | 6 | `compare --accept` refusal test; Story 2.1's check against Story 1.16's real dirty run | 2.1 |
| R2-05 | TECH | A verdict or class computed by `tea-evaluate ci` itself: CONCERNS read from somewhere other than the evidence artifact, or a stage exit rewritten | 2 | 3 | 6 | Each stage exit asserted equal to the direct CLI exit on the same inputs; CONCERNS asserted read from the evidence artifact's verdict field only | 2.2 |
| R2-06 | OPS | TeA's own `pr` wiring passes CI while the evidence is never uploaded, so a red run leaves nothing to audit | 2 | 3 | 6 | A `test:evaluate-ci` case parses `quality.yaml` and asserts an `actions/upload-artifact` step with `if: always()` whose path covers every evaluation's `runs/` directory | 2.5 |
| R2-14 | DATA | The replay cannot reproduce committed evidence: `baseline/` as first specified held no isolation manifests, evaluator configuration, scoring policy, sealed brief or preflight verdict, and `score` is Invalid or produces different bytes without them | 3 | 3 | 9 | AD-12 and Story 2.1 list every replay input; omitting the isolation manifests makes the replay exit 3 | 2.1 |
| R2-15 | TECH | Fixture baselines have no sanctioned producer: overnight fixture runs would be dirty and `compare --accept` refuses them | 3 | 2 | 6 | A fixture's `evaluation.json` declares a copy workspace, so its runs record `dirty: false` and are accepted through `compare --accept` (AD-8 amended) | 2.2 |
| R2-16 | TECH | Placement drifts from what the adopter's repository needs: the ci stage writes AD-10's default table without inspecting, or a plan moves a deterministic no-secret check off `pr` | 2 | 3 | 6 | Plan schema refuses a changed tier with no reason and a deterministic check off `pr`; two recorded fixture repositories must yield plans that differ, with reasons citing their files (Story 2.4) | 2.2, 2.4 |
| R2-07 | BUS | AD-15's last condition (the `pr` replay of the dogfood baseline) never lands because Story H.1 is manual | 2 | 3 | 6 | Story H.1 lists exact commands and what each proves; the pending replay is named in `epic-2-proof.md`; H.1 step 3 adds the replay script so `test:ci-coverage` holds it once added | H.1 |

### Medium-Priority Risks (Score 3 to 4)

| Risk ID | Category | Description | P | I | Score | Mitigation |
| --- | --- | --- | --- | --- | --- | --- |
| R2-08 | TECH | A stale baseline (contract or corpus digest changed) passes `pr` silently | 2 | 2 | 4 | `test:evaluate-ci` case: digest drift warns on `pr`, blocks on `release` |
| R2-09 | OPS | Fixture baselines recorded on one published engine diverge after the engine floats to a newer release (Story 1.15 `latest` spec), turning `pr` red for a reason that is engine drift | 2 | 2 | 4 | `compare` refuses across `evalQualityVersion` (Story 2.1) and routes to `compare --accept`; the pull request that moves the engine re-records the fixture baselines through `compare --accept` |
| R2-10 | TECH | A refused comparison across `evalQualityVersion` read as a block | 2 | 2 | 4 | AD-10 "informs" row asserted in the table test |
| R2-11 | SEC | A live tier wired to run on `pr`, needing a secret TeA's CI lacks | 1 | 3 | 3 | Plan schema forbids a live check on `pr`; guidance test asserts skill and agent live tiers sit on `scheduled`, `release` and manual dispatch |
| R2-12 | OPS | The CI stage rewrites an existing `eval-quality.config.json` section | 1 | 3 | 3 | Guidance marker; the eight TeA gate jobs asserted unchanged by a `quality.yaml` diff check in Story 2.5 |
| R2-17 | TECH | Oracle-versus-scorer agreement is re-derived by TeA and drifts from the engine's own comparison | 2 | 2 | 4 | TeA reads the `corroboration` eval-quality records on each baseline oracle outcome and keeps no comparison table; a flipped disposition, re-scored, is reported `disagrees` by the engine and exits 11 |
| R2-18 | DATA | Contract-source freshness passes on a changed requirements statement, or has no statement to compare | 2 | 2 | 4 | The contract stage stamps `sourceSpecDigest` with `digestBytes` over the committed `requirements.md` bytes; a one-byte edit exits 10; Story 2.2 back-fills statements into the base fixture `test/fixtures/evaluate/` and the Stories 1.10, 1.11, 1.18 to 1.20 fixtures, and a missing statement exits 10 |
| R2-19 | SEC | Held-out partitions or model-judge calibration placed on `pr`, needing a secret TeA's CI lacks | 1 | 3 | 3 | AD-20 rule; plan schema and guidance place them on `scheduled` and `release` |

### Low-Priority Risks (Score 1 to 2)

| Risk ID | Category | Description | P | I | Score | Action |
| --- | --- | --- | --- | --- | --- | --- |
| R2-13 | OPS | Documentation counts and claims drift when Evaluate is described as shipped | 2 | 1 | 2 | `test:doc-counts`, `test:doc-claims` |

## NFR Planning

| NFR category | Requirement | Risk link | Planned validation | Evidence |
| --- | --- | --- | --- | --- |
| Security | AD-20: the `pr` tier needs no secret; live tiers declare credential keys as `permittedEnvironmentKeys` | R2-11 | Plan schema and guidance tests | `npm test` output |
| Reliability | AD-10: infrastructure never counted as a quality score; replay reproduces committed evidence | R2-01, R2-03 | `test:evaluate-ci` | `npm test` output; `quality.yaml` run |
| Auditability | CAP-12: a CI run leaves a retrievable evidence bundle | R2-06 | Upload step assertion | GitHub Actions artifact |
| Performance | UNKNOWN: no threshold stated for `pr` tier duration | none | Measured in Story 2.5 | `epic-2-proof.md` |

## Entry Criteria

- [ ] Epic 1 exit criteria met, including `epic-1-proof.md` and the retained `runs/<invocationId>/` of Story 1.16
- [ ] Fixture evaluations for `test/fixtures/evaluate-mcp/` and `test/fixtures/evaluate-api/` pass `check`, `preflight`, `run` and `score` (Stories 1.10, 1.11)

## Exit Criteria

- [ ] Every P0 and P1 scenario below exists and passes in `npm test`
- [ ] `tea-evaluate ci --tier pr` exits 0 for both fixture adopters; `check`, `compile` and `seal` exit 0 for `bmad-testarch-evaluate`
- [ ] `epic-2-proof.md` records every item in "The Dogfood Proof In CI" below
- [ ] Every acceptance criterion's revert check observed once and recorded

## Acceptance Criteria Corrected In epics.md

| Story | Problem as written | Correction now in `epics.md` (and spine) |
| --- | --- | --- |
| 2.1 | `baseline/` lacked the isolation manifests, evaluator configuration, scoring policy, sealed brief and preflight verdict a replay through `score` needs; `compareDominance` already refuses a changed `comparabilityKey`, so that revert check could not fail | Full member list (AD-12 amended); the `evalQualityVersion`-only case is the revert check |
| 2.2 | A mutated observation byte was said to exit 3, and a changed observation leaves eval-quality at exit 0 while the evidence bytes change; a replay mismatch had no AD-10 exit; a mutated observation alone proves re-preflight and misses a copy of old evidence | Exit 13 for evidence drift (AD-10 row), a named observation field, a logging engine shim, and policy drift counted as a stale baseline |
| 2.2 | AD-12 lists gate outputs in `runs/`, and no story captured them (found by the sprint-planning readiness check) | Plan checks gain kind `gate` for adopted `eval-quality-gates` (AD-11 amended); `tea-evaluate ci` persists each check's exit code, stdout and stderr under `runs/<invocationId>/` |
| 2.2 | Overnight fixture runs were dirty, so `compare --accept` could never produce the fixture baselines | Fixture targets declare a copy workspace and record `dirty: false` (AD-8 amended) |
| 2.3 | No deterministic renderer exists for the agent-rendered CI templates; `eval:ci` writes no replay cases; set roots must sit under `test/fixtures/ci-eval/`; a new set regenerates contracts and probes and changes the suite's `caseCount` | Deterministic step-and-template test, hand-captured replay case, regenerated contracts and probes, updated manifest entry |
| 2.5 | The upload named no check; running the CI skill against TeA would render one agent-written step per command, where TeA's checks must be `npm test` chain scripts, which the `chain` matrix runs (amended 2026-09-25 in Story 1.9) | A `quality.yaml` test case; TeA wired directly; the fixture `runs/` ignore entry moved to Story 1.8 |
| H.1 | The red-until-release list was hand-written and missed members; `npm install` with the `latest` spec and an existing lockfile does not advance the engine | Superseded on 2026-09-23: eval-quality 4.0.0 shipped during Story 1.2, so the red-until-release list and the release and floor-raise steps were removed; H.1 keeps the `npm test`, clean run, baseline acceptance and replay steps |

## Coverage Plan By Story

### Story 2.1: Compare runs and accept a baseline

File: `test/test-evaluate-compare.js` (`test:evaluate-compare`). Levels: integration over real eval-quality, static.

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| Compare through `compareDominance`; `refused` on differing `comparabilityKey`, including across `evalQualityVersion` | Two fixture evidence sets with equal keys return a dominance relation; one with a changed key, and one whose only difference is `evalQualityVersion` in `run.json`, return `refused` | Integration | P0 | `compareDominance` already reports `incomparable` for a changed key, so the revert check is the `evalQualityVersion`-only case, which returns a relation without TeA's refusal |
| `compare --accept` writes the full `baseline/` and `baseline/qualification/` | Assert each AD-12 member (contract, sealed brief, qualified probes, observations, preflight verdict, sealed records, isolation manifests, evaluator configuration, scoring policy, evidence) exists with its run digest; replay the accepted baseline | Integration | P0 | Omitting the isolation manifests makes the replay exit 3 |
| Dirty run refused | `run.json.dirty === true` fixture exits 10 and writes nothing under `baseline/` | Integration | P0 | Removing the refusal writes `baseline/` |
| `test/lib/compare-*.js` import the runtime | `test:evaluate-boundaries` case; `test:compare-dominance` and `test:compare-eval-runs` pass | Static | P1 | Code moved back fails the marker scan |
| Story 1.16's dirty run refused and recorded | Worker runs `compare --accept` on the retained run; exit 10 recorded in `epic-1-proof.md` | Live evidence | P1 | Recorded evidence |

### Story 2.2: Plan CI tiers and run them with `tea-evaluate ci`

File: `test/test-evaluate-ci.js` (`test:evaluate-ci`). Levels: integration over real eval-quality, contract, replay, static.

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| Plan schema owned by the runtime | Fixture plans validate; a plan with a live check on `pr` fails validation | Contract | P1 | Schema without the rule lets the live `pr` check through |
| `--tier` runs exactly the plan's checks | The runtime writes an executed-check log to `runs/`; assert set equality with the plan's checks for each tier | Integration | P0 | A hard-coded tier list diverges from a fixture plan that omits one check |
| `pr` replay reproduces committed evidence | Replay a committed fixture baseline; produced bytes in `runs/<invocationId>/replay/` equal `baseline/` bytes | Replay | P0 | A replay that skips `score` produces no file |
| Replay self-comparison guard | One mutated evidence byte in the committed baseline exits 13 | Replay | P0 | Comparing a file with itself passes, which the case catches |
| Replay re-scores | The clean-control leg's `exitCode` mutated in one baseline observation exits 13 with eval-quality's own exits as recorded; a logging shim at `TEA_EVALUATE_ENGINE_CLI` shows `preflight` and `score` invoked | Replay | P0 | Copying baseline evidence forward exits 0 and leaves the shim log empty |
| Stage exits verbatim; no `--strict`; CONCERNS from the evidence artifact as warn | Per stage, the direct CLI exit on the same inputs equals the `ci` result; a static scan finds no `--strict` in `cli/` or the plan template; a CONCERNS fixture exits 0 with a warn class | Integration, static | P0 | Mapping CONCERNS to a non-zero exit fails |
| AD-10 enforcement table, row by row | One fixture per row (eval-quality 0, 2, 3, 4, 5, 64; `tea-evaluate` 10, 11, 12, 13, 64; gates 1, 64) asserting class and action; the outcome-state mapping for each of the twelve states | Integration | P0 | Editing one mapping fails its row |
| Strength floor per probe class | Below-floor fixture warns on `scheduled`, blocks on `release` | Integration | P1 | Removing the floor passes both |
| Stale baseline | Changed corpus, contract or policy digest warns on `pr`, blocks on `release` | Integration | P1 | Removing the rule passes silently |
| Each check's exit code, stdout and stderr persisted | A fixture plan with a stub `gate` check printing distinct known bytes to each stream and exiting 1; assert byte equality per stream and the recorded code under `runs/<invocationId>/` | Integration | P1 | An empty, swapped or dropped capture fails equality |
| Claims none of the three unreachable FAIL rows | Static scan of `cli/lib/evaluate/ci.js` and the plan schema for the three names | Static | P1 | Adding one fails |
| Fixture plans and baselines for MCP and API adopters validate | Contract validation; each fixture run records `dirty: false` from its copy workspace and its baseline came through `compare --accept` | Contract | P1 | Missing plan fails; a dirty fixture run is refused at acceptance |
| A changed tier needs a `placement.reason` | Fixture plan with a moved check and no reason fails validation | Contract | P1 | Dropping the rule validates the plan |
| A deterministic no-secret check placed off `pr` is refused | Fixture plan moving `compile` to `scheduled` fails validation | Contract | P0 | Dropping the floor validates the plan |
| Gameability arm runs on `pr` with no target launch | Launch marker stays absent; the gameability probe's evidence is produced in `runs/` | Integration over real eval-quality | P0 | Launching the target writes the marker |
| Contract-source freshness | One byte changed in a fixture `requirements.md` makes `check` exit 10; deleting one fixture's `requirements.md` exits 10; a walk of every `evaluation.json` under `test/fixtures/` and `test/evaluations/`, the base fixture `test/fixtures/evaluate/` included, finds a statement whose `digestBytes` matches each contract | Integration | P0 | Removing the comparison exits 0 |
| Oracle-versus-scorer agreement | Read `corroboration` from each baseline oracle outcome; one disposition flipped in a fixture baseline record and re-scored makes eval-quality report `disagrees`, and the check exits 11; a required oracle `not-evaluable` or `unreached` exits 11; a static scan finds no disposition-to-outcome table in `cli/lib/evaluate/ci.js` | Integration over real eval-quality | P0 | A check that ignores `corroboration` passes the flipped case |
| Held-out partition held to the floor on its own | Below-floor held-out fixture warns on `scheduled`, blocks on `release` | Integration | P1 | Pooling partitions hides the held-out shortfall |
| Judge calibration on `scheduled` and `release` | A below-threshold stub judge exits 11 and blocks both tiers | Integration | P1 | Skipping calibration in the tier passes |

### Story 2.3: Render evaluation plans in `bmad-testarch-ci`

Levels: guidance, static, replay, live (recorded). Files: `test/test-evaluate-ci-render.js` (`test:evaluate-ci-render`); the CI suite corpus under `test/fixtures/ci-eval/evaluation-plan/`; replay records under `test/replay/ci/evaluation-plan-*`.

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| A new step detects `ci/evaluation-ci-plan.json` in create and edit mode | Render test reads `steps-c/` and `steps-e/` and asserts the detection step is reached from both entry points | Guidance | P1 | Removing the step file fails |
| Each `pr` check renders as its own pipeline step; `runs/<invocationId>/` uploaded | The GitHub Actions template gains an evaluation block; the render test parses it as YAML and asserts a per-check step pattern and an upload step with `if: always()` | Static | P1 | Removing the block fails |
| Behavioral proof on the fixture adopters | `test/eval-ci.js` gains an `evaluation-plan` set under `test/fixtures/ci-eval/evaluation-plan/` (a copy of the MCP fixture's plan); ground truth lists each `pr` command as a standalone `run:` step and the upload path; a live `npm run eval:ci` produces the workflow, which the worker captures by hand into `test/replay/ci/evaluation-plan-<case>/expected.json`; contracts and probes regenerated (`probeStepBound` grows) and `caseCount` and `fixtures` updated | Replay, live | P0 | In `npm test`, `test:evaluate-ci-render` fails when the step is reverted, and `test:eval-replay` holds the captured case to the scorer; the live run shows the behavior |
| House tests, `generate-contracts.js --check`, `generate-probes.js --check`, `test:eval-schemas`, CI suite replay pass | Existing scripts | Static, replay | P0 | Regression fails |

### Story 2.4: Finish the evaluation with its CI stage

Levels: guidance, contract.

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| Stage writes the plan, live tiers for skill and agent targets on `scheduled`, `release` and manual dispatch, credential keys as `permittedEnvironmentKeys`, invokes `bmad-testarch-ci` edit mode | `test:evaluate-guidance` markers in `references/ci.md` | Guidance | P1 | Removing a marker fails |
| `eval-quality-gates` opt-in, sections added only for adopted gates, never rewritten | Guidance markers | Guidance | P1 | Removal fails |
| Plan template validates | Contract test against the runtime schema | Contract | P1 | Template drift fails |
| Repository inspection headings (existing CI, merge flow, release flow, risk profile) with worked examples | `test:evaluate-guidance` heading markers | Guidance | P1 | Removing a heading fails |
| Every placement records its reason; deviations from the default are recorded | Guidance marker; template field present | Guidance, contract | P1 | Removal fails |
| Gameability, freshness and agreement placed on `pr`; held-out and calibration on `scheduled` and `release` | Guidance markers and template defaults | Guidance | P1 | Moving one fails |
| Two fixture repositories yield different, reasoned placements | Both committed plans validate; `test:evaluate-ci` asserts at least one live check differs and each differing reason cites a file from its repository | Contract, live evidence | P0 | A stage that writes the default table produces identical plans, which the assertion catches |

### Story 2.5: TeA runs its `pr` tier and documents Evaluate

Levels: static, integration, documentation gates.

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| Each fixture's `pr` checks and the evaluate suite's `check`, `compile`, `seal` join the `npm test` chain, wired directly by the worker (amended 2026-09-25 in Story 1.9: the `chain` matrix runs them) | `test:ci-coverage`, `test:shards` | Static | P0 | A chained script the `chain` matrix does not run fails |
| Upload of every `runs/` directory | `test:evaluate-ci` case over `quality.yaml` | Static | P1 | Removing the upload step fails |
| Eight gates unchanged | `test:evaluate-ci` case asserts the eight `eval-quality-gates` scripts still run in their current jobs | Static | P1 | Moving a gate fails |
| `ci --tier pr` exits 0 for both fixtures; `check`, `compile`, `seal` exit 0 for the evaluate suite | The new scripts themselves | Integration | P0 | Any break fails `npm test` |
| Every fixture evaluation added by Stories 1.18 to 1.20 and 1.24 to 1.26 runs its `pr` tier, gameability, freshness and agreement included | One chained script each, run by the `chain` matrix (amended 2026-09-25 in Story 1.9); `test:ci-coverage` | Integration, static | P0 | A chained script the `chain` matrix does not run fails; any break fails `npm test` |
| The how-to page explains the stack, evaluator kinds, the import contract, learn-on-the-go, held-out probes, calibration and CI placement | `docs:validate-links`, `docs:build`, `test:doc-claims` | Documentation gate | P2 | A broken link or claim fails |
| How-to page, links, shipped wording, 0/1/2 as optional pattern | `docs:validate-links`, `docs:build`, `test:doc-counts`, `test:doc-claims` | Documentation gate | P2 | Broken link fails |

### Story H.1 (owner): Accept the dogfood baseline and turn its `pr` replay green

Each step already names what it proves in `epics.md`. The test view: step 1 is the full `npm test` on the merged tree and the published engine (every Epic 1 and Epic 2 check green); step 2 repeats "The Dogfood Proof" of `test-design-epic-1.md` with `dirty: false`; step 3 adds the `bmad-testarch-evaluate` replay script to the `npm test` chain, which the `chain` matrix runs and `test:ci-coverage` and `test:shards` then hold (amended 2026-09-25 in Story 1.9); step 4 is the replay passing in the pull request's own `quality.yaml` run.

## The Dogfood Proof In CI

### How AD-15's CI condition is verified

1. Overnight (Story 2.5): `check`, `compile` and `seal` of `test/evaluations/bmad-testarch-evaluate/` exit 0 as `npm test` scripts; every fixture evaluation's full `pr` tier exits 0, replay, gameability arm, freshness and agreement included.
2. `epic-2-proof.md` records: each `pr` script's exit, the replay's produced and baseline evidence digests for both fixtures, the pending status of the evaluate suite's replay with a pointer to `epic-1-proof.md`, and the measured `pr` tier duration.
3. After H.1: the evaluate suite's replay reproduces its accepted baseline locally and in the pull request's `quality.yaml` run; the run's uploaded artifact holds `runs/<invocationId>/`.

### What is committed

Staged overnight: `cli/lib/evaluate/compare.js` and `ci.js`, fixture plans and baselines, the `bmad-testarch-ci` step and template block, CI suite corpus and replay records, the `quality.yaml` upload step (amended 2026-09-25 in Story 1.9: checks join the `npm test` chain the `chain` matrix runs), documentation, and `epic-2-proof.md` (`git add -f`). The evaluate suite's `baseline/` enters only through H.1 step 3.

### What `npm test` enforces afterwards

- Every fixture adopter's `pr` tier, replay included, on every pull request.
- `check`, `compile` and `seal` of the Evaluate-authored suite on every pull request; after H.1, its replay as well.
- The AD-10 table, the replay guards and the dirty-baseline refusal through `test:evaluate-ci` and `test:evaluate-compare`.
- The CI skill's evaluation-plan rendering through its recorded replay.

## Execution Strategy

- **Pull request:** all scripts above; no secret, no model call.
- **Manual, recorded:** Story 2.3's `eval:ci` live case; H.1 steps 2 to 4.
- **Scheduled and release:** defined per adopter by the plan; TeA's own CI has no model secret and runs the `pr` tier only (AD-20).

## Resource Estimates

| Priority | Scenarios | Effort range |
| --- | --- | --- |
| P0 | 20 | 19 to 30 hours |
| P1 | 20 | 12 to 20 hours |
| P2 | 2 | 2 to 3 hours |
| Total | 42 | 33 to 53 hours, over five stories |

## Quality Gate Criteria

- P0 and P1 pass rate 100 percent
- Every score-6 risk has its mitigation test merged in the story named
- `npm run test:ci-coverage` and `npm run test:shards` green with every new script in the chain the `chain` matrix runs (amended 2026-09-25 in Story 1.9)
- `npm run docs:validate-links` and `npm run docs:build` green for Story 2.5

## Assumptions and Dependencies

1. Story 1.16's `runs/<invocationId>/` is retained in the worktree for Story 2.1.
2. The fixture baselines are recorded on the published engine TeA's devDependency resolves (4.0.0 or later); R2-09 covers a later engine float.

## Interworking and Regression

| Component | Impact | Regression scope |
| --- | --- | --- |
| `bmad-testarch-ci` | New detection step and template block | House tests, `test:contract-sources` for `ci.contract.json`, `test:eval-ci-data`, `test:eval-replay` |
| `quality.yaml` | An upload step in the `chain` job; new checks join the `npm test` chain the `chain` matrix runs (amended 2026-09-25 in Story 1.9) | `test:ci-coverage`, `test:ci-coverage-filters`, `test:shards` |
| Documentation | Evaluate described as shipped | `test:doc-counts`, `test:doc-claims`, `docs:build` |

## Appendix

Knowledge fragments applied: `risk-governance.md`, `probability-impact.md`, `test-levels-framework.md`, `test-priorities-matrix.md`. Related: `epics.md`, `ARCHITECTURE-SPINE.md` (AD-10, AD-11, AD-12, AD-15, AD-20), `ci-enforcement-policy.md`, `test-design-epic-1.md`.

**Generated by:** BMad TEA Agent, `bmad-testarch-test-design`, epic-level mode.
