---
id: SPEC-evaluate
companions: [target-kind-adapter-mapping.md, eval-quality-vocabulary.md, ci-enforcement-policy.md, eval-quality-facts.md, ARCHITECTURE-SPINE.md]
sources: [input-notes.md]
---

# Evaluate

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability; consult them only if you need narrative rationale or prose color this contract intentionally omits.

## Why

Building a strong, running behavioral evaluation by hand costs real, catalogued effort, and Evaluate exists to remove that cost for every future TeA skill and for any adopter outside TeA who wants a strong, running evaluation of their own agent, skill, workflow, tool-use system, or AI feature. TeA already proved the cost by hand: ten skills each carry a behavioral suite, sixteen generated Behavioral Evaluation Contracts, and a documented command adapter, all built one skill at a time (custom runners, an ESM/CommonJS boundary rewrite, a deny-by-default execution-target registry). `how-tea-is-tested.md` already names an Evaluate skill as proposed future work and points at that hand-built suite as the reference implementation until it ships. TeA evaluating its own skills is the first real adopter and proof target: Evaluate has to reproduce, for the next skill TeA builds, what the hand-built suites already prove is possible, without a person re-inventing the runner, the adapter, and the corpus from nothing.

## Capabilities

- **CAP-1**
  - **intent:** Identify which target kind (agent, skill, workflow, tool-use system, or AI feature) an adopter's system is, and the `eval-quality` interface kind (`cli`, `api`, or `mcp`) and adapter shape it maps to.
  - **success:** Given a described target, Evaluate names its target kind and interface kind, or asks a clarifying question when the description is ambiguous; a web application maps to `api` through its HTTP surface, and no generated contract declares kind `web`.

- **CAP-2**
  - **intent:** Capture the behavioral requirements and constraints an evaluation needs that target inspection alone cannot infer: what must be proven, what evidence is admissible, and what interfaces and resources are in scope.
  - **success:** Produces a written statement of the behavior(s) to evaluate that the adopter confirms before corpus design starts.

- **CAP-3**
  - **intent:** Design the probe corpus for the target: clean controls, seeded-defect probes, and gameability probes matched to the target's shape and the captured requirements, plus the corpus layout and digest, since `eval-quality` defines no corpus manifest and takes `corpusDigest` as caller-attested.
  - **success:** The corpus carries at least one clean control (a `zero-action`-class probe with `expectedClean: true`) and one seeded-defect probe per declared behavior (or that probe recorded as refused with its stated reason), a `zero-action` defect probe for every behavior with a mandatory-action requirement, and a gameability probe for every behavior a rubric or a judgment-based oracle relation governs.

- **CAP-4**
  - **intent:** Author the Behavioral Evaluation Contract expressing the declared behaviors, permitted interfaces, sensitivity witnesses, and interaction plan, and stamp its remaining required identity and lineage fields (`schemaVersion`, `contractId`, `sourceSpecDigest`, `parentDigest`, `revisionCount`).
  - **success:** `eval-quality compile` exits 0 against the generated contract, and every declared behavior carries a non-null `observableSuccessCriterion`.

- **CAP-5**
  - **intent:** Define one designated oracle per behavior that a defect or gameability probe must discharge, and a rubric wherever judgment-heavy quality needs an anchored scale.
  - **success:** Every behavior a probe is meant to discharge declares exactly one oracle, and every declared rubric compiles.

- **CAP-6**
  - **intent:** Scaffold the runner command, or MCP or HTTP wiring, the target needs to be probed through `eval-quality`'s supported interface kinds, and register it in an execution-target registry naming the real command, working directory, artifact map, and budgets.
  - **success:** The scaffolded adapter and registry let a caller collect a real observation for the target and hand it to `eval-quality preflight`, which reduces it into a `PreflightVerdict` with no `interface-not-authorized` or `executable-not-authorized` denial.

- **CAP-7**
  - **intent:** Define, apply, and roll back the controlled mutation each seeded-defect probe plants (target artifact, expected observable failure, rollback), capturing its baseline-pass and mutated-fail evidence and its manifestation witness.
  - **success:** Every `controlled-mutation` seeded-defect probe carries baseline-pass and mutated-fail evidence and `rollbackVerified: true` backed by a rollback Evaluate actually performed; a `historical`-route probe carries fail-before and pass-after evidence; a refused probe carries its stated reason; and every admitted probe's manifestation witness resolves cleanly at preflight.

- **CAP-8**
  - **intent:** Generate the scoring policy, evaluator configuration, and isolation manifest the run needs.
  - **success:** The generated `ScoringPolicy`, evaluator configuration, and isolation manifest validate against `eval-quality`'s published schemas, and the adopter sets every `ScoringPolicy` threshold (`severityFloor`, `minimumTrialCount`, `catchThreshold`) explicitly to their own risk tolerance.

- **CAP-9**
  - **intent:** Run the target for a clean-arm and a mutated-arm run, collect the observations, produce and seal the `SealedRunRecord`s, and drive them through `eval-quality`'s compile, seal, preflight, and score stages end to end.
  - **success:** The clean arm resolves `passed-clean-control` with no unrelated coverage gap at or above the severity floor, and the mutated arm's seeded probe resolves `caught`, both in the resulting evidence artifact.

- **CAP-10**
  - **intent:** Read a scored run's coverage gaps, unsatisfied rules, and abstained or missed oracles, and translate them into a specific missing probe, control, or oracle.
  - **success:** For a CONCERNS, FAIL, or Invalid verdict, Evaluate names the unsatisfied rule, failed preflight check, or missing evidence and proposes the specific probe, control, or oracle that would close it.

- **CAP-11**
  - **intent:** Wire the evaluation's continuous proof into the adopter's CI: which checks run on pull requests, merges, schedules, and releases; which results block the pipeline, warn, or inform; and how target-behavior failure is told apart from evaluation weakness, repository-policy violation, and infrastructure failure.
  - **success:** The adopter's CI runs the compiled contract's deterministic checks on every pull request at minimum, and the enforcement policy states, per check, whether it blocks, warns, or informs.

- **CAP-12**
  - **intent:** Define what evidence a CI run publishes for audit: observations, evidence artifacts, contract strength, verdicts, gate findings, and run metadata, with a recorded baseline for comparison across runs.
  - **success:** A completed CI run leaves a retrievable evidence bundle sufficient to answer what was measured and what it found, without re-running the evaluation.

## Constraints

- `eval-quality` is the fixed measurement engine. Evaluate calls it for contract compilation, sealing, preflight reduction, and scoring, and TeA keeps no copy of that logic.
- `eval-quality` performs no mutation and executes no target. Evaluate, or the adopter harness it scaffolds, plants the mutation, runs the target, and produces the sealed run records and observations `eval-quality` scores.
- Only `cli`, `api`, and `mcp` interface kinds compile; `web` is rejected under `unsupported-interface-kind`. Evaluate maps every target to one of the three supported kinds and never emits kind `web`; a web application is evaluated through its HTTP surface declared as `api`.
- A defect signature cannot address a file the target wrote. Evaluate plans a seeded probe's defect signature on exit code or the descriptor-nominated stream, or records the probe as refused with a stated reason.
- A behavior discharged by a probe must declare exactly one oracle. A behavior spread across multiple oracles has no designated oracle, and no probe naming it can score a caught defect.
- Versions float. Evaluate never pins `eval-quality` to an older release or proposes pinning it.
- Behavioral-evaluation verdicts are enforced in CI through `eval-quality`'s score verdict ladder and its exit codes alone. `eval-quality-gates` enforces repository policy only.
- Never evaluate a vendor dependency. The system under test is always the adopter's own use of it, with the dependency held as a fixed condition of the run.
- Public repository. No third-party individuals or employer-internal systems are named in the spec or any companion.

## Non-goals

- Evaluate does not evaluate the underlying model or vendor. The model is a fixed condition of every run.

## Success signal

An adopter target, proven first against TeA's own next skill, gets a compiling, preflighted, scored Behavioral Evaluation Contract whose clean arm passes and whose mutated-arm run catches its seeded probe, with the deterministic half of that contract enforced on every pull request in the adopter's CI. Running Evaluate produces all of it; nobody hand-builds the runner, the adapter, and the corpus the way `eval-quality-adoption-guide.md` documents TeA doing for each of its ten skills.

## Assumptions

- Assumed the five-way target-kind vocabulary is TeA's own classification layer, absent from `eval-quality`'s schema (verified in `target-kind-adapter-mapping.md`).
- Assumed `eval-quality-gates` wiring is opt-in per adopter repository, since `eval-quality`'s own documentation states that a user adopting behavioral evaluation does not need it.

## Open Questions

- Does Evaluate's three-exit-class discipline, if it adopts one matching TeA's existing 0 pass / 1 quality-failure / 2 environment-failure convention, get imposed on every adopter, or documented as a worked pattern without being required elsewhere?

## Settled By Architecture

- **Skill shape:** one skill, `bmad-testarch-evaluate`, not split across an authoring skill and a CI-wiring skill (AD-2).
- **Adapter mechanics:** target kind picks the interface kind and the adapter Evaluate generates, per the AD-4 mapping table; contracts never carry target kind (AD-4).
- **CI-enforcement-wiring ownership:** Evaluate composes with `bmad-testarch-ci` as one pipeline owner. Evaluate writes `ci/evaluation-ci-plan.json`; `bmad-testarch-ci` gains a step that detects evaluation plans and renders them with its existing platform templates (AD-11).
- **Generator coexistence:** TeA's ten existing suites stay generator-owned, guarded by `--check`; Evaluate-authored evaluations are committed files guarded by `tea-evaluate check`. No suite has both (AD-14).
- **CI tiers and `eval-quality-gates`:** `pr`, `merge`, `scheduled`, and `release` tiers each with a fixed check membership (AD-10). The eight `eval-quality-gates` stay in TeA's current `quality.yaml` jobs; Evaluate adds a section to `eval-quality.config.json` only for gates an adopter opts into (AD-11).
