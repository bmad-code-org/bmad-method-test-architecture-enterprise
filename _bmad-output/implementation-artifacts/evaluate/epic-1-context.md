# Epic 1 Context: The Evaluate authoring loop

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Help an adopter create and run a strong behavioral evaluation of their own target without hand-building its runner, adapter, corpus, or evaluation layer. Evaluate inspects the target, captures requirements, authors evaluation artifacts, runs clean and seeded-defect cases, and closes identified weaknesses. TeA's Evaluate skill is the first proof target, followed by broader target kinds and evaluation frameworks.

## Stories

- Story 1.1: Export eval-quality HTTP target policy
- Story 1.2: Run TeA's gate on the engine
- Story 1.3: Register Evaluate as a TEA skill
- Story 1.4: Ship tea-evaluate check and digest
- Story 1.5: Move registry, records, and provenance into runtime
- Story 1.6: Probe a skill through the generic runner
- Story 1.7: Mutate in a disposable copy and prove rollback
- Story 1.8: Run and score clean and mutated arms
- Story 1.9: Qualify gameability and historical probes
- Story 1.17: Drive evaluation layers through one import contract
- Story 1.10: Evaluate a stdio MCP tool server
- Story 1.11: Scaffold the HTTP probe port
- Story 1.18: Evaluate workflow targets through bindings
- Story 1.19: Evaluate a tool-use agent with AgentEvals
- Story 1.20: Import promptfoo results
- Story 1.21: Hold out probes and calibrate judges
- Story 1.22: Attribute findings for interpretation
- Story 1.12: Inspect targets, capture requirements, and design corpora
- Story 1.13: Author contracts, oracles, rubrics, and adapters
- Story 1.23: Teach evaluation-layer selection and construction
- Story 1.14: Run evaluations and interpret gaps
- Story 1.15: Float the engine version and admit authored suites
- Story 1.16: Evaluate authors its own suite
- Story 1.24: Author suites for two more target kinds
- Story 1.25: Close seeded weaknesses through the gap loop
- Story 1.26: Learn an unfamiliar evaluation framework
- Story 1.27: Distinguish documented guards from invented risks
- Story 1.28: Recover from a killed run
- Story 1.29: Record live-run costs
- Story 1.30: Send principal and matcher bindings
- Story 1.31: Sandbox the target file system
- Story 1.32: Qualify historical probes across deployments
- Story 1.33: Record eval-quality denial reasons
- Story 1.34: Qualify sealed-brief agent evaluators
- Story 1.35: Judge a tool server that crashes mid-call
- Story 1.36: Test HTTP entries against the target-policy parser
- Story 1.37: Identify an HTTP server by its bound port
- Story 1.38: Match deployments to reported releases
- Story 1.39: Separate oversized captured values from launch failures
- Story 1.40: Calibrate imported rubric scores
- Story 1.41: Confine score output during concurrent run changes
- Story 1.42: Attribute reused operation IDs to interfaces
- Story 1.43: Keep ungraded framework errors out of target findings
- Story 1.44: Record installed framework versions in provenance
- Story 1.45: Aggregate development strength through eval-quality
- Story 1.46: Close the dogfood suite's coverage gaps

## Requirements & Constraints

Evaluate must inspect a target and map it to a supported `cli`, `api`, or `mcp` interface, capture adopter-confirmed behavioral requirements, and design a corpus with clean controls, seeded defects, and suitable gameability probes. Each behavior has one designated oracle. Contracts compile and seal through eval-quality; adapters produce authorized observations; clean runs pass and seeded defects are caught. Mutation happens in a disposable copy and rollback is performed and evidenced. Gap analysis separates target findings from evaluation weakness and infrastructure failure, then proposes and verifies the probes, controls, or oracles that close gaps. Held-out probes stay outside the authoring loop, and rubric judges are calibrated before their scores count.

Every TeA story is one pull request from `main`. Keep eval-quality versions floating, use the published engine, and never place framework-specific dependencies in TeA's runtime. Add user-facing changes under the Unreleased changelog section. Run `npm test` and the engine import check at each story's start and finish. Evaluation verdicts come from eval-quality; repository-policy gates remain separate. A reverted change must fail its named acceptance check.

## Technical Decisions

The system under test, evaluation layer, Behavioral Evaluation Contract, and eval-quality form a one-way stack. TeA owns the layers above eval-quality. The Evaluate skill authors declarative artifacts; `tea-evaluate` stages workspaces, launches targets, applies mutations, records observations, drives evaluators, and interprets results. eval-quality remains the sole engine for compile, seal, preflight reduction, scoring, and strength calculations.

Target kind selects the interface and adapter; contracts do not store TeA's target-kind vocabulary. Web applications use their HTTP surface as `api`; `web` is never emitted. The runtime uses one run-record shape and one framework-neutral evaluator import contract. Framework-specific code belongs in the adopter's evaluation folder. Evaluator configuration records the model snapshot; runs without a model use `none` and the digest of empty system-prompt bytes.

Probe corpora have a documented layout and digest. Only the runtime executes targets or mutates them. Execution targets are explicitly authorized through a registry. Keep generation ownership distinct: TeA's existing suites are generator-owned and checked with `--check`; Evaluate-authored suites are committed files checked by `tea-evaluate check`. CI enforcement uses eval-quality verdicts, while eval-quality-gates handles repository policy.

## Cross-Story Dependencies

Stories follow the execution order listed in the epic dependency table. Story 1.16 depends on Story 1.15. Stories 1.24 and 1.25 extend the proof and gap loop after 1.16; Story 1.26 depends on Stories 1.23 and 1.25. Epic 2 uses the evaluation authored in Story 1.16, with its first story also depending on Stories 1.26 and 1.45.
