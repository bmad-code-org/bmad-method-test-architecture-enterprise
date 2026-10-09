---
title: 'How TEA Is Tested'
description: How TEA proves its own behavior through deterministic repository checks, behavioral evaluations, clean controls, seeded defects, gameability probes, repeated live runs, and recorded baselines
---

# How TEA Is Tested

TEA checks its own behavior with repository gates, behavioral suites, and recorded live runs.
Each suite defines its fixtures, thresholds, and stability requirements in the suite manifest.

```mermaid
flowchart TD
  subgraph TIER1["Tier 1: Deterministic Gates in CI (npm test)"]
    D1[Rule and guidance alignment]
    D2[Replay harness over stored runs]
    D3[Contract oracles and schema validation]
    D4[Machine-held documentation claims]
  end

  subgraph TIER2["Tier 2: Behavioral Evaluations & Execution Suites (eval:all)"]
    B1[Live-agent runners where applicable]
    B2[Staged, isolated workspaces]
    B3[Clean / negative controls]
    B4[Seeded / positive cases]
    B5[Gameability probes: anti-spoofing]
  end

  subgraph TIER3["Tier 3: Live Evidence & Provenance"]
    E1[Repetition & stability where applicable]
    E2[Three exit classes: 0 pass / 1 quality / 2 env]
    E3[Recorded JSON results & measurement comparison]
  end

  TIER2 -->|records runs| TIER3
  TIER3 -->|replayed by| TIER1
```

## The Testing Layers

### 1. Deterministic Repository Checks

`npm test` runs the repository's credential-free checks without live model calls.
These include structural validation, scorer replays, and deterministic execution against local fixtures.
Some checks require local services or declared external dependencies.

The checks include:

- **Guidance and rule alignment:** Validates that every review rule, NFR guidance directive, and ATDD standard matches its corresponding knowledge fragments and enforcement hooks.
- **Contract oracles and schemas:** Verifies that all probe and evaluation contracts conform to their schemas and that contract oracles match the harness scorers.
- **Replay harness:** Replays stored outputs from earlier agent runs through current scorers to confirm that scoring updates preserve existing evaluation semantics.
- **Documentation claim gates:** Holds configured claims, script invocations, and factual statements against their machine-readable source of truth so documentation stays synchronized with the repository.

### 2. Behavioral Evaluations and Execution Suites

Deterministic checks prove that static files and rules are consistent.
The manifest-driven `eval:all` command runs both live-agent evaluations and deterministic execution suites.
Live-agent suites invoke headless CLI runners in staged workspaces to evaluate whether an autonomous model produces sound engineering outputs.
The `automate` and `framework` suites execute committed test or scaffold fixtures without model calls.

Each suite evaluates a specific skill against concrete artifacts:

- `bmad-tea-routing`: Validates that user intent routes to the correct workflow, declines unsupported requests, and asks clarifying questions when requests are ambiguous.
- `bmad-testarch-automate` red-mode step files: Measures whether generated acceptance tests fail red for declared business criteria. The ATDD evaluation stages the canonical red instructions and reads them directly.
- `bmad-testarch-test-design`: Checks that identified risks map to valid test levels and stay within fixture risk ceilings.
- `bmad-testarch-test-review`: Verifies recall of planted anti-patterns without raising false alarms on clean code.
- `bmad-testarch-nfr`: Evaluates whether NFR assessments ground their verdicts in supplied evidence files.
- `bmad-testarch-trace`: Checks that requirements-to-evidence matrices resolve full provenance, identify gaps, and maintain stable metadata.
- `bmad-testarch-ci`: Exercises the framework skill's CI phase instructions and validates that generated CI configurations parse and wire real test commands.
- `bmad-testarch-automate` expand mode: Tests regression detection against running services using four hand-authored spec sets without model calls.
- `bmad-testarch-framework`: Tests template-produced scaffolds in capability-restricted sandboxes with explicitly permitted registry and loopback access.
- `bmad-teach-me-testing`: Tests multi-turn teaching sessions and persistent learner progress.

The deterministic run-and-heal fixture check applies a known repair itself and reruns Playwright. It proves that the controlled fixture reproduces the test error and passes with the supplied repair. Other deterministic checks verify mode-routing guidance, retained product defects, and intended red failures.

Separate recorded live-agent captures exercise the ATDD and automate entries, including routing, generated tests, repair decisions, settings, and Resume. Their saved commands, staged instruction files, before-and-after artifacts, native runner reports, and physical execution logs provide evidence of what the agent did in each captured run.

### 3. Clean Controls and Seeded Defects

Each suite defines positive, negative, clean, or seeded cases appropriate to its task.
False-positive limits, repetition counts, and stability requirements are suite-specific and declared in the suite manifest.
Several suites require zero unstable cases; others enforce bounded score variation, stable verdicts, or different explicit ceilings.

- **Clean controls:** Provide an evidence bundle, code file, or requirement set with zero planted flaws.
  The agent evaluates the input against defined thresholds (for example, `test-review` declares an 80% non-false-positive rate).
- **Seeded defects:** Deliberately introduce known flaws: missing test coverage reports, unstated performance thresholds, broken retry policies, or unmapped criteria.
  The agent must detect the seeded defect and report the expected status (such as `CONCERNS` or `FAIL`).

### 4. Gameability Probes

Evaluation harnesses include protections against accidental shortcuts:

- **Isolated workspaces:** Ground truth files stay outside the agent's workspace and execution prompt.
  Token leak detectors verify that answer-key identifiers remain excluded from context.
- **Anti-spoofing parsers:** Fenced code blocks quoting example templates are stripped before parsing so quoted examples do not score as agent findings.
- **Path and citation validation:** Citations are checked against actual files in the input bundle; naming an external file is penalized as fabricated evidence.
  For NFR assessments, the scorer also checks citations against the fixture's criterion-to-evidence mapping; citing a real file associated with another criterion is a grounding failure.
- **Neutral project paths:** Fixture directories omit role words like `gapped`, `clean`, or `control` so the working path reveals no test state.

### 5. Repeated Live Runs and Stability

Language model outputs vary across runs, so suites declare repetition counts and stability ceilings suited to their task.
For example, `bmad-tea-routing` allows up to two unstable cases across repeated runs; `test-review` permits score standard deviation up to 3 while requiring a single stable verdict; `teach-me-testing` evaluates session persistence across a two-turn session.

- **Stability signatures:** After each run, the harness extracts a deterministic signature covering scored judgments, citations, and domain statuses.
- **Suite-specific ceilings:** The suite manifest declares each suite's repetition and stability thresholds.

### 6. The Three Exit Classes

TEA evaluates runs with strict separation between test failures and infrastructure errors:

| Exit Code | Class                   | Meaning                                                                                                                                                                        |
| --------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0`       | **Pass**                | Static data is valid, preflight checks succeeded, or live evaluation thresholds and ceilings were met.                                                                         |
| `1`       | **Quality Failure**     | The runner executed normally, but output missed a quality threshold, missed a seeded defect, or hallucinated evidence.                                                         |
| `2`       | **Environment Failure** | The harness could not complete measurement due to missing credentials, timeouts, transport errors, or unexpected execution failures. No quality score is awarded or penalized. |

Exit 1 records measured quality failures across workflow, model, harness, corpus, or oracle defects.
Exit 2 records environment or unexpected runtime errors, preventing infrastructure failures from skewing quality metrics.
The convention is optional and belongs to TEA's own harnesses; [Adopting eval-quality](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/docs/eval-quality-adoption-guide.md#the-012-exit-convention-an-optional-pattern) describes it for a harness of your own.

### 7. Recorded Results and Provenance

With `--json`, `eval:all` writes a structured run summary containing provenance, measurements, and bounded diagnostics.
Maintainers preserve a summary under `test/results/eval-all/` using `tools/record-eval-run.js`.
Each recording updates `latest.json` and adds a timestamped history entry.

These records preserve:

- Full runner, model, and CLI version strings
- SHA-256 digests of all fixture bundles and prompts
- Case-level and repetition-level diagnostic objects
- Exact stability signatures and duration measurements

Historical baselines are preserved as immutable records.
Recorded `eval:all` runs are compared for changes in measurements, failure classes, and suite membership.
The comparison refuses incompatible configurations.
Separate strength-result comparisons use `eval-quality`'s `compareDominance` when both records carry the required comparable-result data.
Read `latest.json` for the measured results and failure classes.
A recorded run can include infrastructure failures.

## The Boundary: TEA vs. `eval-quality`

TEA supplies the execution harnesses, domain-specific scorers, fixtures, oracles, and acceptance thresholds.
`eval-quality` supplies reusable contract, probe, validation, sealing, and scoring primitives:

| Responsibility       | Owned by TEA                                                       | Owned by `eval-quality`                                                       |
| -------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Target understanding | Domain rules, workflow step specifications, and agent instructions | Agnostic to specific target domain                                            |
| Evaluation design    | Defining domain test plans, ATDD, NFR, or trace expectations       | Providing reusable probe schemas, adapters, and contracts                     |
| Corpus & oracles     | Authoring fixtures and criterion-to-file truth mappings            | Validating contract schema conformity and oracle logic                        |
| Evidence & execution | Driving workflow execution and capturing generated artifacts       | Preflighting environments, verifying evidence integrity, and contract sealing |
| Scoring & strength   | Interpreting domain-specific gaps and triage                       | Mathematical scoring, metric aggregation, and `compareDominance` calculation  |

## Evaluate

The **Evaluate skill** (`bmad-testarch-evaluate`, menu code `EV`) is one of TEA's eight workflows.
It takes a described target (a skill, an agent, a workflow, a tool-use system, an AI feature) through a scored development and held-out evaluation built on `eval-quality`, names the gaps the scores expose, helps repair them, and finishes with the CI plan that enforces the evaluation.
Its runtime, `tea-evaluate`, validates, digests, preflights, runs, scores and compares an evaluation folder and runs its CI tiers ([tea-evaluate CLI](/docs/reference/tea-evaluate-cli.md)).
`bmad-testarch-framework`'s CI setup renders an evaluation's CI plan into a pipeline, and Evaluate's last stage hands the plan to it ([Setup CI](/docs/how-to/workflows/setup-ci.md#evaluation-plans)).
The tutorial [Evaluate Your First Skill](/docs/tutorials/evaluate-your-first-skill.md) walks one small skill from requirements to a scored run and an accepted baseline.
[How Evaluate Works](/docs/explanation/how-evaluate-works.md) explains the stack and the rules behind it.
Evaluate authored and ran its own suite; `test/evaluations/bmad-testarch-evaluate/` is the reference for an Evaluate-authored evaluation, and TEA's generator-owned suites are the reference for hand-built ones.

## Further Reading

- [Verification Architecture](/docs/explanation/verification-architecture.md): how TEA separates stack-neutral verification reasoning from stack-specific execution targets.
- [Eval Quality Roadmap](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/docs/eval-quality-roadmap.md): the completed transition from fragment selection to full behavioral coverage.
- [Adopting eval-quality, One Skill at a Time](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/docs/eval-quality-adoption-guide.md): guide for bringing behavioral evaluations to other BMAD skills.
- [The eval-quality Command Adapter](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/docs/eval-quality-command-adapter.md): how TEA probes CLI-based workflows and captures structured observations.
- [Recorded eval:all Results](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/results/eval-all/latest.json): live baseline evidence and historical run records.
