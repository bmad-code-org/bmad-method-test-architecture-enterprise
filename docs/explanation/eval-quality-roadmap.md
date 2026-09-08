---
title: 'Eval Quality and Behavioral Coverage Roadmap'
description: 'Current TEA eval coverage, the remaining per-skill work, the planned eval-quality boundary, and the path to repeatable CI execution'
---

# Eval Quality and Behavioral Coverage Roadmap

This is the source-controlled handoff for TEA's remaining eval work. It records what exists, what still needs evidence, and the order in which to build it.

The central constraint is simple: `npm run eval:all` runs every live eval that exists today. It does not yet prove the complete behavior of every TEA skill.

## Current Baseline

TEA currently has three layers of self-validation:

| Layer                           | What exists                                                                                                        | What it proves                                                                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deterministic repository checks | `npm test`, including `test:criteria-fragments`, `test:enforce-hook`, `test:eval-data`, and `test:eval-trace-data` | Repository structure, rule traceability, hook decisions, and both eval corpora remain internally consistent                                                                         |
| Fragment-selection eval         | 24 cases across eight workflow skills, repeated twice by default                                                   | The agent selects required knowledge and avoids explicitly excluded knowledge                                                                                                       |
| Full behavioral eval            | `test-review`, repeated three times against nine planted defects and one clean file                                | The complete review can find known defects without flooding a clean file, and its score and verdict remain stable                                                                   |
| Full behavioral eval            | `trace`, repeated twice against a ten-criterion seeded set and a five-criterion clean set                          | The seeded set scores its ten criteria and derives the expected FAIL gate. The clean set false-positives its gate on a misclassified discriminating criterion; see the last section |

The single live entrypoint is:

```bash
npm run eval:all -- --agent codex
```

It runs 48 fragment selections, 3 complete reviews, and 4 complete traces for one runner. The focused harnesses remain available for debugging.

## Coverage Still Owed

Fragment selection is a routing measurement. A passing routing suite does not establish that the workflow produced a correct final artifact. Eight of TEA's ten skills still need a full behavioral eval.

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
| `bmad-testarch-trace`       | Fragment selection and full behavioral eval | Run the suite against a real model, then add a set whose oracle is synthetic and a set that exercises a counted live record, both of which the corpus declines |

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
- Require every declared repetition to complete before variance or stability can pass. The `test-review` harness once scored fewer runs than were requested, which made variance unmeasurable and weakened the stability claim. Every live harness now exits `2` on a short run.
- Rename or document the current review precision metric precisely. It penalizes definite false positives reported against the clean fixture. Unmatched findings on seeded fixtures remain unattributed until adjudicated, so they cannot silently count as either correct or incorrect.
- Add replay tests that score stored outputs without launching a model. Parser and scorer changes must reproduce the historical result or declare an intentional version change.
- Give each suite its own capability policy and fresh disposable workspace. Fragment selection needs read-only access, while a complete workflow may need scoped artifact writes or command execution. Each harness exports the `RUNNER_CAPABILITIES` it hands to `cli/lib/run-agent.js`, which turns the tier into vendor argv, and `npm run test:eval-schemas` fails when the manifest declares something else.
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

Items 1 through 6 are done. Item 7 is what remains:

1. ~~Add the suite manifest and JSON result schema.~~ `test/evals/suite-manifest.json` and `test/schema/eval-result.js`.
2. ~~Migrate fragment selection and `test-review` into the manifest without changing their current thresholds.~~ Both registered, every threshold unchanged, and `npm run test:eval-schemas` fails when the manifest and the harness constants disagree.
3. ~~Add deterministic replay tests for both result types.~~ `test/test-eval-replay.js` and `npm run test:eval-replay` score thirteen stored cases with no model call and no network: three fragment-selection outputs and ten `test-review` verdicts under `test/replay/`. Each case carries the result it must reproduce, derived by hand from the ground truth rather than generated from the code under test, and a parser or scorer change either reproduces every one or bumps the harness's scorer version in an edit somebody has to review. Two of the thirteen stored outputs are real captures and eleven are constructed, because the only real outputs this repository has banked are both unscoreable. `npm run test:contract-oracles` evaluates every contract oracle over the same stored outputs with `eval-quality`'s evaluator and fails when an oracle disagrees with the scorer.
4. ~~Express those two suites as the first `eval-quality` contracts.~~ Nine contracts under `test/contracts/`. All nine compile as of `eval-quality` 1.0.0. They were written against `0.2.0`, where none of them compiled because the contract language could only describe a system under test that speaks HTTP; `0.3.0` closed that gap and eight began compiling, and the ninth followed once `tools/generate-contracts.js` learned to author an invariance witness for `trace`, whose two cases mandate the same fragment set on purpose. `test/contracts/README.md` carries the whole record, including the 58 parse issues the original finding reported.
5. ~~Add the `trace` behavioral suite.~~ `test/eval-trace.js` scores the corpus at `test/fixtures/trace-eval/` against sixteen declared thresholds, `trace` is registered in the manifest as behavioral, and its deferred entry is gone. Its per-criterion statuses come from the traceability matrix because `e2e-trace-summary.json` carries no per-criterion block at schema_version 0.3.0; adding one is the change that would let the whole suite score from a single JSON file.
6. ~~Run the deterministic gate, then one runner smoke job, then the full existing `eval:all` baseline.~~ **All three suites have now been measured live against `claude`/`sonnet`.** Every threshold in this repository was a declared target until 2026-09-08 and none had been measured; these are the first real numbers.
   - **fragment-selection**, 24 cases: required recall 100% against a 90% threshold, forbidden rate 1% against a 10% ceiling. Both pass. It surfaced two real defects, both since fixed: `framework-python-backend` loaded `playwright-utils-mandate.md` into a Python project whose step file gated the mandate on the config flag alone, and `test-design-system-level` loaded `contract-testing.md` off the phrase "describes three services" because the step files said "microservices indicators" without ever defining it.
   - **test-review**: recall 100% against 0.7, CRITICAL recall 100% against 1.0, non-false-positive rate 100% against 0.8, verdict stable. Its two `unattributed` findings were adjudicated by hand and are real; `test/fixtures/test-review-eval/ground-truth.json` records them under `knownUnplanted`. It defaulted to the `codex` runner at the time, which timed out at fifteen minutes and measured nothing, so the numbers above are from an explicit `--agent claude`; all three harnesses default to `claude` now.
   - **trace**: the seeded set scores 10 of 10 criteria with the expected FAIL gate. The clean set does not pass. Its discriminating criterion AC-4 was misclassified on both measured runs, as PARTIAL and then INTEGRATION-ONLY against a truth of FULL, which false-positives the gate to FAIL. The rule that decides it lives in `checklist.md` and step-03 only cited the file by name, so the run had to guess the semantics from the enum labels. Step-03 now carries the deciding rule inline. Seven of its thresholds sit below target and it is the one suite of the three that is not yet green.
7. Adopt `eval-quality`'s command-line adapter and retire the process-probing machinery this repository invented. `eval-quality` 1.0.0 ships `createCommandLineAdapter`, `nodeCommandMechanism`, and a deny-by-default `CommandTargetPolicy`, which is a real `EnvironmentProbePort` over a child process, plus a `cli` arm in its own conformance suite. `test/lib/probe-targets.js` and `npm run test:probe-targets` drive both of TEA's commands through it, and `tea-fragment-selection-runner` exists now, so the eight fragment-selection contracts name a command TEA ships. Each of the three harnesses still hand-rolls its own `spawnSync`, timeout, and output capture, and the `trace` suite drives an AI agent through workflow prompts rather than a command. Reaching every skill therefore means giving the remaining skills real CLI entry points, which is already the direction the TEA CLI rollout records. This is owed work with a design document of its own.

The remaining eight behavioral suites stay visible in the manifest as deferred work. A deferred entry must name its owner, missing evidence, and exit condition so `eval:all` cannot silently imply coverage that does not exist. Gemini verification, Antigravity admission, and manual export and import are tracked in this document, because a `deferred` entry is keyed on a skill and the manifest has no shape that holds a runner obligation.
