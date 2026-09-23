---
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted:
  ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-09-22'
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

**Scope:** full epic-level test design for Stories 2.1 to 2.5 and the owner's Story H.1. Epic 2 turns Epic 1's evaluation into a check that runs on every pull request, with tiers, enforcement classes and a published evidence bundle. It inherits Epic 1's test levels, house test form and revert-check rule (`test-design-epic-1.md`, "Test Levels Used In This Epic").

**Risk summary:**

- Risks identified: 15
- High-priority risks (score 6 or more): 9, one of them at 9 as the stories were first written (R2-14), closed by a corrected acceptance criterion
- Dominant categories: TECH (replay integrity, enforcement mapping) and OPS (pipeline rendering, evidence upload)

**Coverage summary:**

- P0: 14 scenarios over replay integrity, the AD-10 table and baseline acceptance
- P1: 15 scenarios over tier membership, rendering and TeA's own wiring
- P2: 1 scenario over documentation
- New `npm test` scripts: `test:evaluate-compare`, `test:evaluate-ci`, `test:evaluate-ci-render`, and Story 2.5's per-evaluation `pr` scripts, each with its own `quality.yaml` step

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
| R2-07 | BUS | AD-15's last condition (the `pr` replay of the dogfood baseline) never lands because Story H.1 is manual | 2 | 3 | 6 | Story H.1 lists exact commands and what each proves; the pending replay is named in `epic-2-proof.md`; H.1 step 5 adds the replay script so `test:ci-coverage` holds it once added | H.1 |

### Medium-Priority Risks (Score 3 to 4)

| Risk ID | Category | Description | P | I | Score | Mitigation |
| --- | --- | --- | --- | --- | --- | --- |
| R2-08 | TECH | A stale baseline (contract or corpus digest changed) passes `pr` silently | 2 | 2 | 4 | `test:evaluate-ci` case: digest drift warns on `pr`, blocks on `release` |
| R2-09 | OPS | Fixture baselines recorded on the local tarball diverge from the released engine, turning `pr` red after H.1 | 2 | 2 | 4 | H.1 step 3 runs `npm test` on the published engine; a divergence re-records the fixture baselines through `compare --accept` in the same pull request |
| R2-10 | TECH | A refused comparison across `evalQualityVersion` read as a block | 2 | 2 | 4 | AD-10 "informs" row asserted in the table test |
| R2-11 | SEC | A live tier wired to run on `pr`, needing a secret TeA's CI lacks | 1 | 3 | 3 | Plan schema forbids a live check on `pr`; guidance test asserts skill and agent live tiers sit on `scheduled`, `release` and manual dispatch |
| R2-12 | OPS | The CI stage rewrites an existing `eval-quality.config.json` section | 1 | 3 | 3 | Guidance marker; the eight TeA gate jobs asserted unchanged by a `quality.yaml` diff check in Story 2.5 |

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
| 2.5 | The upload named no check; running the CI skill against TeA would render one agent-written step per command, where TeA's checks must be `npm test` scripts with `validate` steps | A `quality.yaml` test case; TeA wired directly; the fixture `runs/` ignore entry moved to Story 1.8 |
| H.1 | The red-until-release list was hand-written and missed members; `npm install` with the `latest` spec and an existing lockfile does not advance the engine | The list derived by running `npm test` on published 3.4.0 at the end of 2.5; `npm update eval-quality` |

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

### Story 2.5: TeA runs its `pr` tier and documents Evaluate

Levels: static, integration, documentation gates.

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| Each fixture's `pr` checks and the evaluate suite's `check`, `compile`, `seal` join `npm test` with their own `validate` steps, wired directly by the worker | `test:ci-coverage` | Static | P0 | A chained script with no step fails |
| Upload of every `runs/` directory | `test:evaluate-ci` case over `quality.yaml` | Static | P1 | Removing the upload step fails |
| Eight gates unchanged | `test:evaluate-ci` case asserts the eight `eval-quality-gates` scripts still run in their current jobs | Static | P1 | Moving a gate fails |
| `ci --tier pr` exits 0 for both fixtures; `check`, `compile`, `seal` exit 0 for the evaluate suite | The new scripts themselves | Integration | P0 | Any break fails `npm test` |
| Checks red on published 3.4.0 derived mechanically | `npm ci`, `npm test`, failing scripts recorded in `epic-2-proof.md`, tarball re-installed | Integration | P1 | Recorded evidence for H.1 |
| How-to page, links, shipped wording, 0/1/2 as optional pattern | `docs:validate-links`, `docs:build`, `test:doc-counts`, `test:doc-claims` | Documentation gate | P2 | Broken link fails |

### Story H.1 (owner): Release the engine, accept the baseline, turn the `pr` replay green

Each step already names what it proves in `epics.md`. The test view: step 2 uses `npm update eval-quality` so the `latest` spec survives; step 3 is the full `npm test` on the published engine (every Epic 1 and Epic 2 check green, R2-09 surfaced here); step 4 repeats "The Dogfood Proof" of `test-design-epic-1.md` with `dirty: false`; step 5 adds the `bmad-testarch-evaluate` replay script and its `quality.yaml` step, which `test:ci-coverage` then holds; step 6 is the replay passing in the pull request's own `quality.yaml` run.

## The Dogfood Proof In CI

### How AD-15's CI condition is verified

1. Overnight (Story 2.5): `check`, `compile` and `seal` of `test/evaluations/bmad-testarch-evaluate/` exit 0 as `npm test` scripts; both fixture adopters' full `pr` tier exits 0, replay included.
2. `epic-2-proof.md` records: each `pr` script's exit, the replay's produced and baseline evidence digests for both fixtures, the pending status of the evaluate suite's replay with a pointer to `epic-1-proof.md`, and the measured `pr` tier duration.
3. After H.1: the evaluate suite's replay reproduces its accepted baseline locally and in the pull request's `quality.yaml` run; the run's uploaded artifact holds `runs/<invocationId>/`.

### What is committed

Staged overnight: `cli/lib/evaluate/compare.js` and `ci.js`, fixture plans and baselines, the `bmad-testarch-ci` step and template block, CI suite corpus and replay records, `quality.yaml` steps, documentation, and `epic-2-proof.md` (`git add -f`). The evaluate suite's `baseline/` enters only through H.1 step 5.

### What `npm test` enforces afterwards

- Every fixture adopter's `pr` tier, replay included, on every pull request.
- `check`, `compile` and `seal` of the Evaluate-authored suite on every pull request; after H.1, its replay as well.
- The AD-10 table, the replay guards and the dirty-baseline refusal through `test:evaluate-ci` and `test:evaluate-compare`.
- The CI skill's evaluation-plan rendering through its recorded replay.

## Execution Strategy

- **Pull request:** all scripts above; no secret, no model call.
- **Manual, recorded:** Story 2.3's `eval:ci` live case; H.1 steps 4 to 6.
- **Scheduled and release:** defined per adopter by the plan; TeA's own CI has no model secret and runs the `pr` tier only (AD-20).

## Resource Estimates

| Priority | Scenarios | Effort range |
| --- | --- | --- |
| P0 | 14 | 14 to 22 hours |
| P1 | 15 | 9 to 16 hours |
| P2 | 1 | 1 to 2 hours |
| Total | 29 | 24 to 40 hours, over five stories |

## Quality Gate Criteria

- P0 and P1 pass rate 100 percent
- Every score-6 risk has its mitigation test merged in the story named
- `npm run test:ci-coverage` green with every new script mapped to a `validate` step
- `npm run docs:validate-links` and `npm run docs:build` green for Story 2.5

## Assumptions and Dependencies

1. Story 1.16's `runs/<invocationId>/` is retained in the worktree for Story 2.1.
2. The eval-quality release in H.1 carries the same trial-set scoring and export the tarball carried; R2-09 covers a divergence.

## Interworking and Regression

| Component | Impact | Regression scope |
| --- | --- | --- |
| `bmad-testarch-ci` | New detection step and template block | House tests, `test:contract-sources` for `ci.contract.json`, `test:eval-ci-data`, `test:eval-replay` |
| `quality.yaml` | New `validate` steps and an upload step | `test:ci-coverage`, `test:ci-coverage-filters` |
| Documentation | Evaluate described as shipped | `test:doc-counts`, `test:doc-claims`, `docs:build` |

## Appendix

Knowledge fragments applied: `risk-governance.md`, `probability-impact.md`, `test-levels-framework.md`, `test-priorities-matrix.md`. Related: `epics.md`, `ARCHITECTURE-SPINE.md` (AD-10, AD-11, AD-12, AD-15, AD-20), `ci-enforcement-policy.md`, `test-design-epic-1.md`.

**Generated by:** BMad TEA Agent, `bmad-testarch-test-design`, epic-level mode.
