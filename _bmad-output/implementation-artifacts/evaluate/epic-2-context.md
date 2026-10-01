# Epic 2 Context: Continuous proof in CI

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

The evaluation Epic 1 produces runs on every pull request in the adopter's CI, with tiers, enforcement classes and a published evidence bundle, so drift in strength or evidence is visible and every deterministic check blocks before merge. The epic closes by running the `pr` tier for TeA's own Evaluate-authored suite and every fixture evaluation, and by documenting Evaluate as shipped. Story H.1 (owner hand-off, run by Story 2.5's coordinator) later accepts the clean dogfood baseline.

## Stories

- Story 2.1: Compare runs and accept a baseline
- Story 2.2: Plan CI tiers and run them with `tea-evaluate ci`
- Story 2.3: Render evaluation plans in `bmad-testarch-ci`
- Story 2.4: Finish the evaluation with its CI stage
- Story 2.5: TeA runs its `pr` tier and documents Evaluate

## Requirements & Constraints

- Every deterministic check runs on every pull request at minimum: compile, seal, `check` with contract-source freshness, API port conformance, the gameability arm, oracle-versus-scorer agreement, and the baseline replay. Each check records why it sits in its tier, and the enforcement policy states per check whether it blocks, warns or informs.
- A completed CI run leaves a retrievable evidence bundle that answers what was measured and what it found without re-running anything. A baseline exists for comparison across runs.
- Behavioral verdicts are enforced through eval-quality's exit codes alone. `eval-quality-gates` enforces repository policy only and stays opt-in per adopter.
- The `pr` tier needs no secret and calls no model. Skill and agent targets run live checks only on `scheduled`, `release` and manual dispatch, with the runner's credential keys declared as `permittedEnvironmentKeys`. Held-out partitions and model-judge calibration also sit in the live tiers.
- Infrastructure failure never counts as a quality score. CONCERNS is a warning, read from the evidence artifact. `--strict` is never passed. No policy claims `evidence-over-truncated`, `evidence-unavailable` or `evidence-internally-inconsistent`.
- Versions float: eval-quality is never pinned. A refused baseline comparison across `evalQualityVersion` informs and routes to `compare --accept`.
- Public repository: name no third-party individuals or employer-internal systems.
- Every story ends with `npm test` green and a CHANGELOG entry under `[Unreleased]`. Each acceptance criterion names a revert check that fails when the work is undone, and the worker exercises each once.

## Technical Decisions

- **Enforcement map.** Exits 0, 2, 3, 4, 5 and 64 come from eval-quality; `tea-evaluate` adds 10 (authoring defect, including freshness mismatch), 11 (evaluation weakness: non-manifesting mutation, failed baseline, judge below calibration, oracle corroboration `disagrees` or `not-evaluable` for a required oracle), 12 (infrastructure) and 13 (evaluation evidence drift, where the replay's produced evidence differs from baseline). `tea-evaluate ci` passes stage exits through verbatim and computes no verdict itself.
- **Plan.** `ci/evaluation-ci-plan.json` is platform-neutral and the only definition of tier membership. Per check: tier, trigger, kind (`evaluate` with a `tea-evaluate` command, or `gate` with an `eval-quality-gates` command), enforcement class, evidence paths, and `placement` (chosen tier, `defaultTier`, `reason` naming what repository inspection found). Validation fails a tier change with no reason and a deterministic no-secret check placed off `pr`.
- **Default tiers.** `pr`: check, compile, seal, port conformance, gameability arm, agreement, baseline replay. `merge`: `pr` plus a live preflight needing no secret. `scheduled`: live preflight, twin run at `minimumTrialCount`, held-out partition, judge calibration when a rubric exists, strength comparison. `release`: the `scheduled` set as a gate. Strength floor per probe class warns on `scheduled` and blocks on `release`; a stale baseline (contract, corpus or policy digest drift) warns on `pr` and blocks on `release`.
- **Replay integrity.** Replay reads baseline bytes only from `baseline/`, places them at `runs/<acceptedRun>/` inside a scratch copy of the evaluation folder (the sealed records name their artifacts under that path, and `score` refuses a reference outside the run directory it scores), and writes produced evidence only to a fresh `runs/<invocationId>/replay/`. It must re-run `preflight` and `score` on the engine and never copy baseline evidence forward.
- **Baseline.** `baseline/` is committed and changes only through `tea-evaluate compare --accept` in a reviewed pull request. It holds the contract snapshot, sealed brief, qualified probes, observations, preflight verdict, sealed records, per-trial-set isolation manifests, evaluator configuration, scoring policy and evidence, plus `baseline/qualification/`. Omitting any input, the isolation manifests especially, makes the replay exit 3. Accept refuses a run whose `run.json` says `dirty: true` (exit 10). Comparison uses `compareDominance` and reports `refused` when `comparabilityKey` differs.
- **Evidence bundle.** `runs/<invocationId>/` is gitignored and uploaded as a CI artifact with `if: always()`. It holds the contract, observations, verdicts, records, manifests, evidence, diagnostics, evaluator output, calibration results, `partitions.json`, `gap-view.json`, `interpretation.json`, gate outputs and `run.json` (versions, digests, runner and model identity, trial count, duration, commit). `tea-evaluate ci` persists each check's exit code, stdout and stderr there.
- **Fixture baselines.** A fixture target's `evaluation.json` declares a copy workspace so its runs record `dirty: false` and can be accepted. Fixture baselines are re-recorded through `compare --accept` in the pull request that moves the engine.
- **One pipeline owner.** `bmad-testarch-ci` gains a step that detects evaluation plans and renders them through its existing platform templates, reached from both create and edit entry points. Evaluate never writes workflow files. That skill is edited directly in its house shape, gated by its house tests, `node tools/generate-contracts.js --check` and its suite replay; builder Analyze does not apply. Edits to the Evaluate skill itself (Story 2.4) go through `/bmad-workflow-builder`.
- **TeA's own wiring.** TeA's checks are `npm test` chain scripts that the `chain` matrix of `.github/workflows/quality.yaml` runs, held by `test:ci-coverage` and `test:shards`. The eight `eval-quality-gates` stay in their current jobs unchanged. New scripts: `test:evaluate-compare`, `test:evaluate-ci`, `test:evaluate-ci-render`, plus Story 2.5's per-evaluation `pr` scripts.
- **Contract freshness.** `check` compares the contract's `sourceSpecDigest` with `digestBytes` over the committed `requirements.md` named by `evaluation.json`. Story 2.2 back-fills a `requirements.md` and matching digest into every pre-1.12 fixture evaluation. Negative `check` cases are built in temp folders and never committed as evaluation folders.
- **Agreement.** TeA reads the `corroboration` eval-quality records on each oracle outcome in the baseline evidence and keeps no comparison table.
- **Rendering proof.** CI skill templates are rendered by the agent, so Story 2.3 proves rendering with a deterministic step-and-template test plus an `evaluation-plan` case in `test/eval-ci.js` (fixture set under `test/fixtures/ci-eval/evaluation-plan/`, live capture by hand into `test/replay/ci/`, contracts and probes regenerated, suite manifest updated).

## Cross-Story Dependencies

- Chain: 2.1 then 2.2 then 2.3 then 2.4 then 2.5, then H.1. Epic 2 depends on Epic 1's runtime and on the suite Story 1.16 authors; Story 2.1 also depends on 1.26 and 1.45 and needs Story 1.16's retained dirty run.
- Lane 3 runs 1.45, 2.1 to 2.4, 1.47, 1.49, 1.48, 1.42, 1.50, 1.55, 1.56, 1.51, 1.46, then 2.5 last. Story 2.5 baselines every fixture, so it waits for each story that changes committed evidence bytes (1.42, 1.44, 1.50, 1.51, 1.55, 1.56). Lane 3 owns every eval-quality release.
- Story 2.5 wires the evaluations from Stories 1.10, 1.11, 1.16, 1.18, 1.19, 1.20, 1.24, 1.25 and 1.26 and records results at `_bmad-output/implementation-artifacts/evaluate/epic-2-proof.md`. For `bmad-testarch-evaluate` only `check`, `compile` and `seal` run until H.1 adds the replay with a clean baseline.
- Story 2.2 changes `check`'s behavior for every existing fixture (freshness), so `test:evaluate-*` suites from Epic 1 must stay green. Story 2.4's fixture repositories carry the Story 1.24 AI-feature evaluation.
- Rebase onto latest `origin/main` before merging and keep both sides in `CHANGELOG.md`, `sprint-status.yaml`, `epics.md`, the `package.json` test chain and `quality.yaml`.
