---
title: 'Eval Quality and Behavioral Coverage Roadmap'
description: 'Current TEA eval coverage, the remaining per-skill work, the planned eval-quality boundary, and the path to repeatable CI execution'
---

# Eval Quality and Behavioral Coverage Roadmap

This is the source-controlled handoff for TEA's remaining eval work. It records what exists, what still needs evidence, and the order in which to build it. [Adopting eval-quality, One Skill at a Time](./eval-quality-adoption-guide.md) turns the same material into a procedure for a module that has none of it yet.

`npm run eval:all` runs every live eval that exists. Ten of TEA's eleven skills have one; `bmad-testarch-evaluate` is named in `test/evals/suite-manifest.json`'s `deferred` array with its owner, missing evidence, and exit condition until Story 1.16 authors its own suite. Story 6.12 turns the manifest's discipline into a machine-checked gate, proving `eval:all` finds no undeclared skill.

## Current Baseline

TEA currently has three layers of self-validation:

| Layer                           | What exists                                                                                                                                                                                                                                                                | What it proves                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deterministic repository checks | `npm test`, including `test:criteria-fragments`, `test:enforce-hook`, `test:eval-data`, `test:eval-test-design-data`, and `test:eval-trace-data`                                                                                                                           | Repository structure, rule traceability, hook decisions, and all three eval corpora remain internally consistent                                                                                                                                                                                                                                                            |
| Fragment-selection eval         | 24 cases across eight workflow skills, repeated twice by default                                                                                                                                                                                                           | The agent selects required knowledge and avoids explicitly excluded knowledge                                                                                                                                                                                                                                                                                               |
| Full behavioral eval            | `test-review`, repeated three times against nine planted defects and one clean file                                                                                                                                                                                        | The complete review can find known defects without flooding a clean file, and its score and verdict remain stable                                                                                                                                                                                                                                                           |
| Full behavioral eval            | `test-design`, repeated twice against a seeded epic carrying five material risks and a clean control capped at three                                                                                                                                                       | The register is grounded in the epic it was given, its arithmetic and score bands hold, priorities respect the fixture's severity ordering, and every material risk reaches the coverage plan                                                                                                                                                                               |
| Full behavioral eval            | `trace`, repeated twice against a ten-criterion seeded set and a five-criterion clean set                                                                                                                                                                                  | The seeded set scores its ten criteria and derives the expected FAIL gate. The clean set false-positives its gate on a misclassified discriminating criterion; see the last section                                                                                                                                                                                         |
| Full behavioral eval            | `atdd`, repeated twice against one story and five acceptance criteria, executing the generated scaffold under NFR9's isolation                                                                                                                                             | Every generated test fails for the reason its criterion states, none passes vacuously, none stays skipped, none loads with an error, every test maps to a supplied criterion, and no run mutates production files                                                                                                                                                           |
| Full behavioral eval            | `bmad-tea-routing`, 19 intents repeated twice: eleven with one right menu item, four where two or more items are genuinely close enough that the right answer is to ask, and four nothing on the menu serves                                                               | `bmad-tea` routes an intent to the workflow the menu names, asks rather than guesses when two or more items are genuinely close, and declines rather than routing when nothing on the menu serves                                                                                                                                                                           |
| Full behavioral eval            | `ci`, two projects each with its own written request, service, and thresholds, repeated twice                                                                                                                                                                              | The generated workflow parses and lints clean under `actionlint` on pinned flags, and requested elements land without emitting a forbidden one                                                                                                                                                                                                                              |
| Full behavioral eval            | `nfr`, two evidence bundles each audited in its own staged workspace so one service's measurement never judges against another's target, repeated twice                                                                                                                    | The audit's domain statuses and gate decision are grounded in the evidence bundle it was given, not in the workflow's own prose                                                                                                                                                                                                                                             |
| Full behavioral eval            | `automate`, four hand-authored spec sets standing in for generated coverage, each run against the fixed `voucher-service` fixture and a scratch copy carrying its seeded minimum-spend regression                                                                          | One set catches the regression and attributes the failure to the seeded boundary through a declared message pattern; the other three each stand in for coverage that looks thorough and detects nothing: interior-only assertions, an assertion that cannot fail against real behavior, and a duplicated assertion                                                          |
| Full behavioral eval            | `framework`, one case: the clean `bmad-testarch-framework` scaffold fixture installed for real and its own `api-sample.spec.ts` run against a minimal in-memory stub, inside NFR9 isolation extended with a CONNECT-allowlisting proxy                                     | The generated scaffold actually installs and its own smoke test actually passes against a real backend; a seeded backend defect and a seeded installed-fixture defect each then fail that same smoke test for their own distinct, verified reason                                                                                                                           |
| Full behavioral eval            | `bmad-teach-me-testing`, one case, two turns, against a real vendor: turn 1 plays a full first session through the real skill with a seeded wrong quiz answer and the `[R]` review it triggers, turn 2 is a brand-new, memoryless process in the same persistent workspace | Placement matches the fixture's declared level, the seeded wrong answer's correction reappears in the transcript after the review choice, the fresh second process resumes on the right continuation greeting by reading `progress.yaml` rather than any process memory, and no session `progress.yaml` claims complete without transcript evidence it was actually quizzed |

The single live entrypoint is:

```bash
npm run eval:all -- --agent codex
```

It runs 48 fragment selections, 38 routing intents, 4 complete test designs, 3 complete reviews, 4 complete audits, 4 complete pipelines, 4 complete traces, and 2 generations for one runner. `automate` and `framework` both run inside the same `eval:all` invocation too, at zero calls: `automate`'s four cases and `framework`'s install-and-smoke run all execute for real every time but spend no vendor call, which is why the count above carries no term for either. `bmad-teach-me-testing` also runs inside the same invocation and is not zero-cost: its one case spends 2 more calls, one per turn, at its single declared repetition. The focused harnesses remain available for debugging.

Underneath the ten full behavioral suites above, TEA now exercises `eval-quality`'s command-line adapter (`createCommandLineAdapter`, every harness's own runner), its local corpus adapter, its file-system adapter, and its clock port, each certified against the package's own published conformance suite before any call site adopted it. The package publishes six conformance arms in total; TEA runs four (`command-probe`, `corpus`, `clock`, `file-system`) and records why the other two have no subject to run against rather than skipping them silently: `environment-probe` (the HTTP `api` arm) because TEA authorizes no HTTP target and the package ships no HTTP adapter, and `mcp-probe` because TEA authorizes no tool server. `npm run test:port-totality` holds that ledger, in both directions, against the package's own published count. TEA also uses the package's scoring pipeline (`runPreflight`, `runScore`, `seal`) to compile and score every Behavioral Evaluation Contract under `test/contracts/` (`test/contracts/README.md` carries the current count), and its `compareDominance` rule to compare two stored results by strength rather than by an eyeballed diff.

## Coverage Closed

Fragment selection is a routing measurement. A passing routing suite does not establish that the workflow produced a correct final artifact. Epic 6 closed this gap for `bmad-tea` (routing), `bmad-testarch-atdd`, `bmad-testarch-automate`, `bmad-testarch-ci`, `bmad-testarch-framework`, `bmad-testarch-nfr`, `bmad-testarch-test-design`, `bmad-testarch-test-review`, `bmad-testarch-trace`, and `bmad-teach-me-testing` (a transcript-based suite rather than a fragment-selection one), each now a full behavioral eval in `test/evals/suite-manifest.json`. `bmad-testarch-evaluate` is the one skill still open, named in `test/evals/suite-manifest.json`'s `deferred` array with its owner, missing evidence, and exit condition until Story 1.16 lands its own suite, so `eval:all` cannot silently imply coverage that does not exist.

Each behavioral eval needs both positive cases and clean or negative controls. Recall alone rewards a system that reports everything.

## Why This Fits `eval-quality`

`eval-quality` is no longer a planned project; it is a real, versioned dependency TEA has been upgrading across this whole run, and TEA is the package's proving ground: a limitation found in `eval-quality` while adopting a capability here is fixed in `eval-quality` and released, rather than worked around in TEA. TEA brought real skills, fixtures, deterministic rules, a mature behavioral corpus, repeated-run measurements, and known gaps across different output types to that role, which is what made it a strong first client rather than a synthetic one.

The dependency remains one-way:

| TEA owns                                          | `eval-quality` owns                                           |
| ------------------------------------------------- | ------------------------------------------------------------- |
| Skill execution and agent runners                 | The Behavioral Evaluation Contract format and authoring rules |
| Public fixtures, seeded defects, and ground truth | Contract compilation, validation, and sealing                 |
| Domain-specific oracles and thresholds            | Contract-strength analysis and common result schemas          |
| Prompt and artifact capture                       | Reproducible scoring rules over declared evidence             |
| TEA's local and CI orchestration                  | Stack-neutral libraries and a thin CLI usable outside TEA     |

`eval-quality` should not need TEA installed and should not launch TEA's agents. TEA should call its public library or CLI to validate evaluation contracts and score declared evidence. This preserves `eval-quality` as an independent quality layer and makes TEA its first public proving ground.

Fragment selection and `test-review` became the first two Behavioral Evaluation Contracts, and every suite that followed adopted the same shape: converting a working harness first exposed schema and integration gaps the later suites did not have to rediscover on their own.

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

All nine items are done:

1. ~~Add the suite manifest and JSON result schema.~~ `test/evals/suite-manifest.json` and `test/schema/eval-result.js`.
2. ~~Migrate fragment selection and `test-review` into the manifest without changing their current thresholds.~~ Both registered, every threshold unchanged, and `npm run test:eval-schemas` fails when the manifest and the harness constants disagree.
3. ~~Add deterministic replay tests for both result types.~~ `test/test-eval-replay.js` and `npm run test:eval-replay` score 108 stored cases with no model call and no network: three fragment-selection outputs, six `atdd` reports, ten `test-review` verdicts, eleven `test-design` documents, fourteen `trace` artifact pairs, seventeen `bmad-tea-routing` replies, twenty-six `nfr` reports, and twenty-one `ci` runs under `test/replay/`. Each case carries the result it must reproduce, derived by hand from the ground truth rather than generated from the code under test, and a parser or scorer change either reproduces every one or bumps the harness's scorer version in an edit somebody has to review. Two of the 108 stored outputs are real captures and 106 are constructed, because the only real outputs this repository has banked are both unscoreable. The struck title names two result types because `trace` did not exist when it was written; its artifact pairs are the third. `npm run test:contract-oracles` evaluates every contract oracle over the same stored outputs with `eval-quality`'s evaluator and fails when an oracle disagrees with the scorer.
4. ~~Express those two suites as the first `eval-quality` contracts.~~ Every contract under `test/contracts/` compiles (`test/contracts/README.md` carries the current count and the whole record, including the 58 parse issues the original finding reported). The first nine were written against `0.2.0`, where none of them compiled because the contract language could only describe a system under test that speaks HTTP; `0.3.0` closed that gap and eight began compiling, and the ninth followed once `tools/generate-contracts.js` learned to author an invariance witness for `trace`, whose two cases mandate the same fragment set on purpose. `trace.contract.json` is the trace behavioral suite's own and arrived with `tea-trace-runner`, and `nfr.contract.json` is the NFR suite's own and arrived with `tea-nfr-runner`; every suite that landed after them (`ci`, `atdd`, `bmad-tea-routing`) arrived with a contract of its own the same way, `bmad-tea-routing` with two (`tea-routing-intents.contract.json` and `tea-routing-controls.contract.json`). `nfr.contract.json` is the one contract with no machine-readable artifact to address, because the NFR workflow declares a single markdown deliverable, so its ten oracles state what a `containment` test can reach about a whole document and the harness reads the rest.
5. ~~Add the `trace` behavioral suite.~~ `test/eval-trace.js` scores the corpus at `test/fixtures/trace-eval/` against sixteen declared thresholds, `trace` is registered in the manifest as behavioral, and its deferred entry is gone. Its per-criterion statuses come from the traceability matrix because `e2e-trace-summary.json` carries no per-criterion block at schema_version 0.3.0; adding one is the change that would let the whole suite score from a single JSON file.
6. ~~Run the deterministic gate, then one runner smoke job, then the full existing `eval:all` baseline.~~ **The three suites that existed then have been measured live and all three are green.** Every threshold in this repository was a declared target until 2026-09-08 and none had been measured; these are the first real numbers. `bmad-tea-routing`, `nfr` and `test-design` were added later and are still declared targets with no measurement behind them.
   - **fragment-selection**, 24 cases: required recall 100% against a 90% threshold, forbidden rate 1% against a 10% ceiling. Both pass. It surfaced two real defects, both since fixed: `framework-python-backend` loaded `playwright-utils-mandate.md` into a Python project whose step file gated the mandate on the config flag alone, and `test-design-system-level` loaded `contract-testing.md` off the phrase "describes three services" because the step files said "microservices indicators" without ever defining it.
   - **test-review**: recall 100% against 0.7, CRITICAL recall 100% against 1.0, non-false-positive rate 100% against 0.8, verdict stable. Its two `unattributed` findings were adjudicated by hand and are real; `test/fixtures/test-review-eval/ground-truth.json` records them under `knownUnplanted`. It defaulted to the `codex` runner at the time, which timed out at fifteen minutes and measured nothing, so the numbers above are from an explicit `--agent claude`; every harness defaults to `claude` now.
   - **trace**: green on both sets, and the corpus had to be corrected to get there. The seeded set scores 10 of 10 criteria with the expected FAIL gate; the clean set scores 5 of 5 with the expected PASS gate; every one of the sixteen thresholds is met, with zero clean false positives, zero invented criteria, zero duplicate sections, and zero fixture mutations.
     The clean set failed on the first three measured runs, and the reason is the record worth keeping. Its discriminating criterion AC-4 came back PARTIAL, then INTEGRATION-ONLY, then PARTIAL again, against a declared truth of FULL, and the mismatch false-positived the gate to FAIL. The first fix inlined the coverage-classification rule into step-03, on the theory that a run citing `checklist.md` by name had to guess the semantics from the enum labels. Re-measuring at `--runs 3` did not move it. That second measurement is what showed the runs were right: AC-4 claimed a console list shows an expired token while its only evidence was two API tests asserting what `GET /tenants/{tenant}/tokens` returns, and every other criterion in that set naming a rendered surface carries component or e2e evidence. The criterion was rewritten to say what the tests establish, and the clean set passed.
     Measured against `codex` rather than `claude`/`sonnet`, because that account was rate limited when the confirming run was due. A second vendor agreeing is worth more here than a matched one would have been.
7. ~~Adopt `eval-quality`'s command-line adapter and retire the process-probing machinery this repository invented.~~ `eval-quality` 1.0.0 shipped `createCommandLineAdapter`, `nodeCommandMechanism`, and a deny-by-default `CommandTargetPolicy`, which is a real `EnvironmentProbePort` over a child process, plus a `cli` arm in its own conformance suite. `test/lib/probe-targets.js` and `npm run test:probe-targets` drive every one of TEA's commands through it.
   - Every harness has probed through the port as of `eval-quality` 1.2.0, which added the repeatable-option spelling the harnesses needed to forward `--env-pass` and `--agent-arg` at all.
   - The pin is 4.0.0 now.
   - Every authorization has declared which environment keys its requests may carry since 3.0.0, so the channel a contract author declares is bounded by the operator's mapping rather than passed through whole; each was verified end to end against its stub agent with no model call, the trace harness by spawning it whole and reading its result record back.

   There was no separate "TEA CLI rollout" design document, and there never needed to be one: `package.json`'s `bin` field now registers a runner for every skill that has a behavioral suite (`tea-fragment-selection-runner`, `tea-routing-runner`, `tea-trace-runner`, `tea-nfr-runner`, `tea-ci-runner`, `tea-test-design-runner`, `tea-atdd-runner`, `tea-atdd-red-check`, `tea-test-review`), each landing with the Epic 6 story that added its suite rather than through a separate initiative. `tea-transcript-runner` is a tenth entry but not a skill-specific one: `transcript` is `evalType: "infrastructure"` in the manifest, the shared multi-turn plumbing Story 6.11 built for `bmad-teach-me-testing` to use rather than a suite of its own. `tea-evaluate` is an eleventh entry and no suite runner either: it is the runtime of the Evaluate workflow, which validates and digests an evaluation folder ([tea-evaluate CLI](../reference/tea-evaluate-cli.md)). Not every behavioral suite needs a dedicated CLI entry point: `bmad-testarch-automate` and `bmad-testarch-framework` both run deterministically, spending no live-agent call, so neither needed a runner of its own, and `bmad-teach-me-testing` shares `tea-transcript-runner` rather than getting a dedicated entry, since Story 6.11 built that plumbing to be reusable rather than skill-specific.

8. ~~Adopt the scoring half.~~ `runPreflight`, `runScore` and `seal` all run. `tools/generate-probes.js` writes 59 probes across fifteen corpora from the ground truth this repository already keeps, `npm run test:probe-corpus` scores every one of them against the outputs under `test/replay/` with no model call and validates every artifact against the schemas `eval-quality` publishes, and `npm run eval:preflight` drives the witness legs through the real command-line adapter, which is the first pre-flight this repository has run. `npm run test:probe-conformance` runs the package's own published port conformance suite against the adapter, sixteen assertions. `npm run test:eval-quality-corpus` compiles the package's own published corpus against the pinned release, which is the one check here that feeds the package nothing of TEA's, and `npm run test:port-totality` holds TEA's branches total over both probe unions and all six published conformance arms. What the scoring half found is recorded in `docs/explanation/eval-quality-command-adapter.md` under "How much of eval-quality TEA actually uses": three contract-strength findings, two limits in the probe vocabulary, and one contract-authoring defect that had made the whole measurement meaningless.

9. ~~Give the remaining skills a behavioral suite, in the evidence order section 3 sets out.~~ `bmad-testarch-framework` fit that order's third phase and now has one (Story 6.9, `test/eval-framework-scaffold.js`): a real `npm install` and a real smoke test against a minimal in-memory stub, inside NFR9 isolation extended with a CONNECT-allowlisting proxy, and two seeded defects each caught for their own distinct, verified reason on every live run, proving the generated scaffold installs and runs rather than only reading as structurally correct. `bmad-teach-me-testing` fit the order's fifth, transcript-based phase; `test/lib/transcript-harness.js` (added with `tea-transcript-runner`) was exactly the multi-turn plumbing that phase named as still missing, and it now has a suite of its own too (Story 6.11, `test/eval-teach-me-testing.js`). Everything above is measurement machinery, and it now measures ten of TEA's eleven skills; the eleventh, `bmad-testarch-evaluate`, is deferred until Story 1.16 lands its own suite.

`test/evals/suite-manifest.json`'s `deferred` array names exactly one skill, `bmad-testarch-evaluate`, with the owner, missing evidence, and exit condition its declaration requires: no other skill's coverage obligation is discharged by declaration. Gemini verification, Antigravity admission, and manual export and import stay tracked in this document rather than in the manifest, because those are runner obligations the manifest has no shape for, not a skill's coverage; all three remain unshipped, per the "Complete Runner Portability" section above.
