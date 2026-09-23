# Evaluate skill: source notes

Author's planning notes for the TeA Evaluate skill, captured 2026-09-22 as the input to `bmad-spec`.

## Add the BMad Evaluate skill

Build Evaluate as a thin TeA workflow over eval-quality.

1. Inspect the target. Identify what kind of thing is being evaluated: agent, skill, workflow, tool-use system, end-to-end AI feature.
2. Ask for missing requirements and constraints.
3. Design the corpus.
4. Author the Behavioral Evaluation Contract (BEC).
5. Produce clean controls.
6. Produce seeded-defect / negative probes.
7. Produce gameability probes.
8. Define expected behavior, oracles, and rubrics.
9. Scaffold the target adapter or harness.
10. Define controlled mutation and rollback.
11. Generate harness configuration.
12. Compile and validate everything through eval-quality.
13. Preflight it.
14. Run it.
15. Interpret the result.
16. Identify weak evaluation coverage and propose the missing probes, controls, or evidence.

Important boundary: TeA authors the domain-specific evaluation. eval-quality remains the measurement engine.

So the skill builds them. It inspects the target, scaffolds the adapter, proposes the mutations and the rollback, drafts the probe corpus, wires the clean and mutant runs, drafts oracles and rubrics. The adopter answers questions and gets a running eval. TeA reads the result, names what is weak, and builds the missing piece.

### Corpus design

TeA should know how to design a good corpus for testing an agent, skill, workflow, test-review mechanism, and similar targets.

```text
TeA / domain-specific eval workflow
  understands what is being evaluated
  ↓ authors:
  evaluation contract
  positive / clean controls
  negative / seeded-defect probes
  gameability probes
  expected behavior / oracles
  harness configuration
  ↓
eval-quality
  validates the contract
  validates the probes
  preflights the environment
  verifies evidence
  scores the runs
  tells you whether the eval is actually strong
```

### Writing a Behavioral Evaluation Contract

TeA should know how to write a BEC. TeA designs the evaluation. eval-quality evaluates the evaluation.

```text
TeA
  understands requirements, risks, test design, system shape
  authors the BEC
  authors or derives probes/corpus
  defines oracles, clean controls, negative cases, gameability cases
eval-quality
  checks whether that BEC is structurally sound
  seals it
  preflights the environment
  scores the evidence
  measures contract strength
```

### Use eval-quality as the measurement engine

### Supply the bring-your-own pieces

- Target harness or adapter
- Controlled mutations and rollback
- Probe corpus
- Clean and mutant runs
- Observations and evidence
- Oracles and rubrics

### Teach TeA to interpret gaps and build what is missing

## Wire evaluation and repository governance into CI

- Inspect the target repository, existing CI, release flow, and risk profile to determine which eval-related checks belong on PRs, merges, scheduled runs, and releases.
- Define the CI evaluation set: BEC compile validation, preflight, clean controls, seeded-defect / mutant runs, gameability probes, repeated trials, scoring, contract-strength thresholds, and applicable eval-quality-gates.
- Generate or update `eval-quality.config.json` and the required CI configuration.
- Define enforcement policy: which results block the pipeline, which produce CONCERNS, and which are informational.
- Preserve failure classification between target behavior failure, evaluation weakness, repository-policy violation, and infrastructure / invocation failure.
- Publish the evidence needed to understand and audit the result: observations where appropriate, evidence artifacts, contract strength, verdicts, gate findings, and run metadata.
- Treat CI integration as part of completing the evaluation. TeA should answer "how is this evaluation continuously proven?" when it designs the eval, rather than leaving a locally working evaluation unenforced.
- TeA owns deciding what should run, when it should run, and what should block. eval-quality provides behavioral measurement; eval-quality-gates provides deterministic repository-policy enforcement.
