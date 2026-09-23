# eval-quality vocabulary Evaluate must reuse

The exact terms and shapes `eval-quality` v3.4.0 already publishes. Evaluate's capabilities and any downstream architecture, stories, or test design use this vocabulary for these concepts and coin no parallel terms. Verified against `docs/reference/cli-commands.md`, `docs/explanation/contract-strength.md`, `docs/explanation/behavioral-evaluation-contracts.md`, `schemas/eval-contract.schema.json`, and `schemas/probe.schema.json` in `bmad-eval-quality`.

## The four-stage pipeline

One binary, `eval-quality`, chains four commands:

1. **`compile`**: validates a contract against the `EvalContract` schema and the discipline rules, emits the compiled contract.
2. **`seal`**: compiles, then reduces to a `SealedEvaluatorBrief` carrying the contract's digest.
3. **`preflight`**: plans the probe legs a contract implies, reduces the observations it is handed, mints a `PreflightVerdict` for a named run. The adapter Evaluate scaffolds issues the requests; `preflight` issues none.
4. **`score`**: chains ingest, score, and emit; validates each sealed run record, scores the trial set against the compiled contract, mints an `EvidenceArtifact` carrying the verdict.

A separate binary, `eval-quality-gates`, enforces deterministic repository policy (dependency direction, licences, lockfile age, package boundaries, documentation-claim drift). It alone reads `eval-quality.config.json`, keyed one section per gate; none of the four `eval-quality` commands above take a config file. `eval-quality-gates` has its own exit contract (`0` pass, `1` policy finding, `64` invocation error). Behavioral verdicts are enforced in CI through the `eval-quality` exit codes below; see the Constraints section of `SPEC.md`.

## Exit codes (`compile`/`seal`/`preflight`/`score`, AD-21's six plus `64`)

| Code | Meaning |
| --- | --- |
| `0` | Success: every verdict other than FAIL or a promoted CONCERNS |
| `1` | CONCERNS promoted by `--strict` |
| `2` | FAIL |
| `3` | Invalid: a failed pre-flight, or any other AD-21 invalidating condition |
| `4` | Structural failure |
| `5` | Runtime fault |
| `64` | Usage error |

`--strict` never promotes a CONCERNS whose firing conditions are all evidence conditions (a measurement that fell short of policy).

## Probe classes and clean controls

`probeClass` (`schemas/probe.schema.json`) enumerates exactly four values: **`defect`**, **`gameability`**, **`zero-action`**, **`canary`**. AD-7 excludes both clean controls and canary probes from the contract-strength vector by design: canary probes indict the corpus, and clean controls verify that unmutated runs go unpenalized.

`expectedClean` splits `zero-action` into two probe types. A clean control is `expectedClean: true` paired with `probeClass: "zero-action"`: the only pairing `qualifyProbe`'s `admissibleRoutes` admits for a clean branch, routed through the `clean-control` qualification route. A zero-action *defect* probe is `expectedClean: false` with the same `probeClass`, seeding a system that silently no-ops on a mandatory requirement (`docs/explanation/contract-strength.md`), qualified the same way a `defect`-class probe is. CAP-3 authors both: the clean control that proves the pairing, and, wherever a behavior states a mandatory action, the zero-action defect probe that proves silent no-ops get caught.

For a `controlled-mutation` probe, `eval-quality` performs no mutation and executes nothing. The probe record only carries the declaration: `mutationOperator` (free text naming the edit, unread by any code), `targetArtifact` (what changed), and `rollbackVerified` (the caller's asserted boolean). CAP-7 owns making that assertion true.

## The verdict ladder and contract strength answer different questions

`score` reports both. The **verdict** (PASS / CONCERNS / FAIL / Invalid, AD-21) judges the run: in production mode, whether the system under test shipped; in contract-scoring mode, whether the run itself was sound. The **strength vector** (`buildStrengthVector`) is a catch rate per probe class: unique qualified probes resolving `caught` over unique qualified probes `exercised`. They disagree on purpose: a contract can catch its planted defect and still verdict FAIL or CONCERNS if another oracle abstained, evidence was incomplete, or a coverage gap sits at or above the scoring policy's `severityFloor`. CAP-10 (gap interpretation) reads both.

## One designated oracle per behavior (AD-40)

`designatedOracleIdOf` resolves a behavior's designated oracle only when that behavior declares exactly one oracle. A behavior grouping several oracles resolves none, and no probe naming it can score a caught defect: TeA's own `test-review` contract originally grouped its plant oracles by severity and, like `trace`, had to be split to one oracle per behavior for exactly this reason. CAP-5 authors one behavior per oracle from the start.

## What a defect signature can address (AD-9 qualification)

A probe's defect signature may point at an exit code, or at the descriptor-nominated stdout/response channel. It may never point at a file the target wrote (`condition-artifact-channel-contract-local`) or at an unnominated stream (`condition-pointer-unwritable`). TeA's own `trace` and `nfr` contracts still carry `refused` defect classes for exactly this reason: their only evidence is a written artifact. CAP-6 and CAP-7 plan a signature the vocabulary can address, or record the probe as refused with a stated reason, the same discipline TeA already applies to its own four refused cells.

## The BEC fields Evaluate's capabilities populate

`schemas/eval-contract.schema.json`'s top-level `required` array has 21 entries. Sixteen are content Evaluate authors: CAP-4 authors `behaviors`, `permittedInterfaces`, `interactionPlan`, and the sensitivity witnesses inside each operation, plus `waivers`, `referenceSets`, `siblingGroups`, `scopedResources`, `forbiddenInputs`, `testData`, `budgets`, `safetyLimits`, `requiredEvidence`, `probeStepBound`, and `fixtureReset`; CAP-5 authors `oracles` and `rubrics`. The other five (`schemaVersion`, `contractId`, `sourceSpecDigest`, `parentDigest`, `revisionCount`) are identity and lineage fields CAP-4 stamps; `eval-quality` checks them on `seal`. CAP-8 separately generates the scoring policy, evaluator configuration, and isolation manifest, which travel alongside the contract.
