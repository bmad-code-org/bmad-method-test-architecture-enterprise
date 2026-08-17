---
title: 'Eval Quality and Behavioral Coverage Roadmap'
description: 'Current TEA eval coverage, the remaining per-skill work, the planned eval-quality boundary, and the path to repeatable CI execution'
---

# Eval Quality and Behavioral Coverage Roadmap

This is the source-controlled handoff for TEA's remaining eval work. It records what exists, what still needs evidence, and the order in which to build it.

The central constraint is simple: `npm run eval:all` runs every live eval that exists today. It does not yet prove the complete behavior of every TEA skill.

## Current Baseline

TEA currently has three layers of self-validation:

| Layer                           | What exists                                                                                | What it proves                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Deterministic repository checks | `npm test`, including `test:criteria-fragments`, `test:enforce-hook`, and `test:eval-data` | Repository structure, rule traceability, hook decisions, and eval data remain internally consistent               |
| Fragment-selection eval         | 24 cases across eight workflow skills, repeated twice by default                           | The agent selects required knowledge and avoids explicitly excluded knowledge                                     |
| Full behavioral eval            | `test-review`, repeated three times against nine planted defects and one clean file        | The complete review can find known defects without flooding a clean file, and its score and verdict remain stable |

The single live entrypoint is:

```bash
npm run eval:all -- --agent codex
```

It runs 48 fragment selections and 3 complete reviews for one runner. The focused harnesses remain available for debugging.

## Coverage Still Owed

Fragment selection is a routing measurement. A passing routing suite does not establish that the workflow produced a correct final artifact. Nine of TEA's ten skills still need a full behavioral eval.

| Skill                       | Existing live coverage                      | Behavioral contract to add                                                                                                                                     |
| --------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bmad-tea`                  | None                                        | Route realistic and ambiguous user intents to the correct workflow, explain the choice, preserve the requested scope, and decline unsupported claims           |
| `bmad-teach-me-testing`     | None                                        | Place a learner at the right level, correct seeded misconceptions, adapt the session, persist progress, and avoid claiming mastery without evidence            |
| `bmad-testarch-atdd`        | Fragment selection                          | Produce acceptance tests that map to the supplied criteria, fail before implementation for the intended reason, and avoid changing production code             |
| `bmad-testarch-automate`    | Fragment selection                          | Generate tests that pass on the fixed implementation, fail on a qualified seeded regression, and avoid vacuous or duplicate coverage                           |
| `bmad-testarch-ci`          | Fragment selection                          | Produce syntactically valid pipeline configuration with the requested triggers, permissions, test commands, quality gates, and artifacts                       |
| `bmad-testarch-framework`   | Fragment selection                          | Produce a scaffold that installs, validates, runs a smoke test, and contains the expected configuration, fixtures, scripts, and hook registration              |
| `bmad-testarch-nfr`         | Fragment selection                          | Ground every status in supplied evidence, cover all four NFR domains, return `CONCERNS` for unknown thresholds, and avoid unsupported `PASS` results           |
| `bmad-testarch-test-design` | Fragment selection                          | Identify grounded risks, apply probability and impact consistently, assign priorities through stated judgment, and map each material risk to suitable coverage |
| `bmad-testarch-test-review` | Fragment selection and full behavioral eval | Expand the corpus across languages and frameworks, add more clean controls, and measure drift across runner and model changes                                  |
| `bmad-testarch-trace`       | Fragment selection                          | Map criteria to real evidence, calculate coverage correctly, expose gaps, enforce evidence and waiver rules, and derive the expected gate decision             |

Each behavioral eval needs both positive cases and clean or negative controls. Recall alone rewards a system that reports everything.

## Why This Fits `eval-quality`

TEA is a strong reference client for the planned standalone `eval-quality` project. TEA already has real skills, fixtures, deterministic rules, one mature behavioral corpus, repeated-run measurements, and known gaps across different output types.

The dependency should remain one-way:

| TEA owns                                          | `eval-quality` owns                                           |
| ------------------------------------------------- | ------------------------------------------------------------- |
| Skill execution and agent runners                 | The Behavioral Evaluation Contract format and authoring rules |
| Public fixtures, seeded defects, and ground truth | Contract compilation, validation, and sealing                 |
| Domain-specific oracles and thresholds            | Contract-strength analysis and common result schemas          |
| Prompt and artifact capture                       | Reproducible scoring rules over declared evidence             |
| TEA's local and CI orchestration                  | Stack-neutral libraries and a thin CLI usable outside TEA     |

`eval-quality` should not need TEA installed and should not launch TEA's agents. TEA should call its public library or CLI to validate evaluation contracts and score declared evidence. This preserves `eval-quality` as an independent quality layer and makes TEA its first public proving ground.

The existing fragment-selection and `test-review` evals should become the first two Behavioral Evaluation Contracts. Converting working harnesses first will expose schema or integration gaps before nine new harnesses copy an unstable pattern.

## Work Plan

### 1. Finish the Shared Eval Foundation

- Add a versioned suite manifest. Each entry should declare the skill, eval type, fixtures, contract, thresholds, repetition count, CI tier, and runner capabilities.
- Make `eval:all` discover suites from that manifest. It should fail when a TEA skill has neither a behavioral suite nor an explicit deferred declaration.
- Add machine-readable output such as `--json <path>`. Include the repository commit, suite and case IDs, runner executable and version, resolved model and parameters, contract version, fixture digest, prompt digest, expected and completed repetitions, measurements, duration, token or cost data when available, and final failure class.
- Preserve the existing exit classes: `0` for thresholds met, `1` for measured quality failure, and `2` for an environment that could not measure anything.
- Classify authentication, timeout, transport, parser, and missing-artifact failures as environment failures. A failed model call must not look like a measured quality regression.
- Require every declared repetition to complete before variance or stability can pass. The current `test-review` harness can score fewer than the requested three runs, which makes variance unmeasurable and weakens the stability claim.
- Rename or document the current review precision metric precisely. It penalizes definite false positives reported against the clean fixture. Unmatched findings on seeded fixtures remain unattributed until adjudicated, so they cannot silently count as either correct or incorrect.
- Add replay tests that score stored outputs without launching a model. Parser and scorer changes must reproduce the historical result or declare an intentional version change.
- Give each suite its own capability policy and fresh disposable workspace. Fragment selection needs read-only access, while a complete workflow may need scoped artifact writes or command execution.
- Keep credentials out of prompts, artifacts, logs, and result files.

### 2. Integrate the `eval-quality` Contract Layer

- Express fragment selection and `test-review` as versioned Behavioral Evaluation Contracts.
- Compile and validate every contract in the deterministic pull-request gate.
- Seal the exact contract, fixture, prompt, and scoring inputs used by a live run.
- Keep agent execution in TEA. Feed the captured evidence and outputs into the `eval-quality` scoring boundary.
- Record contract-strength findings separately from the skill's measured quality. A weak eval can produce a green score that deserves no confidence.
- Refuse a scored result when required evidence is absent, stale, internally inconsistent, or inaccessible to the evaluator.

This phase is complete when the same sealed inputs replay to the same deterministic score, and when Claude, Codex, or another runner can be compared against the same contract without changing its oracles.

### 3. Add Behavioral Suites in Evidence Order

Use this order so the first additions have strong oracles and create reusable infrastructure:

1. `trace` and `nfr`: bounded reports with explicit evidence, status, coverage, waiver, and gate rules.
2. `atdd` and `automate`: executable fail-before and pass-after checks against qualified seeded regressions.
3. `framework` and `ci`: generated project and pipeline fixtures that can be installed, parsed, linted, and smoke-tested.
4. `test-design`: deterministic artifact checks plus semantic oracles for risk grounding and coverage choices.
5. `bmad-tea` and `bmad-teach-me-testing`: transcript-based, multi-turn behavior with more semantic scoring.
6. `test-review`: expand the existing corpus continuously as real misses and false positives are qualified.

Do not add a case only because the failure looks plausible. A case qualifies when the seeded defect or expected behavior is observable from the exact evidence given to the agent, the ground truth was written independently of the generated output, and the oracle can distinguish a real catch from a fluent guess.

### 4. Complete Runner Portability

Claude and Codex have verified built-in paths. The custom runner contract covers other headless CLIs that can read a prompt, operate in the repository, return the requested artifact, and exit reliably.

Remaining runner work:

- Verify Gemini end to end with a valid `GEMINI_API_KEY` or `GOOGLE_API_KEY`. The current account's CLI login cannot run the live eval, so no Gemini pass has been recorded.
- Treat any Antigravity runner as experimental until a complete `eval:all` run proves prompt delivery, artifact writes, timeouts, exit-code mapping, and parseable reports.
- Add runner and model labels for custom adapters so result files identify what actually ran.
- Add a runner admission suite. It should test stdin or documented prompt transport, working-directory access, report creation, nonzero failures, timeout handling, minimal environment forwarding, and model selection.
- Review prompt confidentiality for CLIs that accept the prompt only as a process argument. Process arguments may be visible to other local processes and CI diagnostics.
- Add an export and import mode for manual LLM use. It should emit complete, case-addressed prompt bundles and accept responses or artifacts later. Manual mode must use the same parser and scorer as headless mode and must be marked in result metadata.

The manual bundle must include every source file and instruction the case expects the model to inspect. A prompt that points at a local path is not portable to a chat session that cannot read the repository.

Custom-runner preflight can prove that the executable and fixtures exist. Authentication remains unproven until the runner completes a real model call.

### 5. Adopt a CI Policy

Use three CI tiers:

| Tier          | Trigger                                  | Contents                                                                                    | Credentials and cost                         |
| ------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Deterministic | Every pull request                       | Existing repository checks, eval data validation, contract compilation, scorer replay tests | None                                         |
| Smoke         | Manual and scheduled                     | One qualified case per behavioral suite with one approved runner                            | Secret-backed credentials, bounded model use |
| Full matrix   | Manual, scheduled, and release candidate | Every suite at its required repetition count across selected runner and model combinations  | Secret-backed credentials, measured quota    |

Live results should upload the machine-readable summary, generated artifacts, sanitized transcripts, and logs. Trend reporting should compare like with like by contract, fixture, prompt, runner, and model identity.

Keep live model quality separate from the required pull-request gate until the corpus, thresholds, and variance are calibrated. Promotion to a required gate needs a recorded baseline, an owner, a flake policy, and a rollback rule.

## Definition of Done for Every Behavioral Suite

A skill can be marked behaviorally covered only when all of these are true:

- The fixture represents a realistic TEA use case and contains no private data.
- Ground truth was authored independently of the agent output.
- The case includes planted positives plus a clean or negative control.
- Deterministic assertions run outside the agent wherever the output permits them.
- Semantic oracles are versioned, bounded, and limited to judgments that cannot be made deterministically.
- The agent sees every fact required to reach the expected answer.
- Repeated identical runs measure stability.
- Thresholds, reducer rules, and invalid-run rules are declared before the live run.
- The suite emits stable machine-readable results and CI-compatible exit codes.
- At least one built-in or admitted custom runner has completed the suite end to end.
- `npm test` remains credential-free and makes no paid model calls.

## Next Implementation Slice

The next agent should keep the slice narrow:

1. Add the suite manifest and JSON result schema.
2. Migrate fragment selection and `test-review` into the manifest without changing their current thresholds.
3. Add deterministic replay tests for both result types.
4. Express those two suites as the first `eval-quality` contracts once its public compiler and scorer are ready.
5. Add the `trace` behavioral suite as the first new skill contract.
6. Run the deterministic gate, then one runner smoke job, then the full existing `eval:all` baseline.

Gemini verification, Antigravity admission, manual export and import, and the remaining eight behavioral suites stay visible in the manifest as deferred work. A deferred entry must name its owner, missing evidence, and exit condition so `eval:all` cannot silently imply coverage that does not exist.
