---
title: 'Adopting eval-quality, One Skill at a Time'
description: 'How to take one BMAD skill from asserted quality to measured quality, using what TEA built and what it got wrong'
---

# Adopting eval-quality, One Skill at a Time

This is a working guide for an engineer on a BMAD module who has never used `eval-quality` and wants one skill measured. It is written from what TEA built between commits `7f9d6ad` and `f6e3b4f`, and every claim in it names the file that supports it. Read it with the repository open.

TEA is one module of ten skills. `bmad-method` core has many more and has none of this, so the unit of adoption is one skill, and the order the skills are taken in matters more than the speed.

## What "measured" means here, and what TEA has

A skill is measured when a run of it produces evidence that a checked-in oracle can score, at a threshold declared before the run, with a repetition count the harness enforces. Everything short of that is an assertion.

TEA's state today, as `test/evals/suite-manifest.json` registers it:

| Layer                           | What it covers                                                                                                                               | Where                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Deterministic repository checks | The `npm test` chain, credential-free, no network, no model call                                                                             | `package.json`                    |
| Fragment-selection eval         | 24 cases across the eight workflow skills that ship a knowledge index, measuring which knowledge a run loads                                 | `test/eval-fragment-selection.js` |
| Behavioral eval, `test-review`  | 9 planted defects across two seeded files, one clean control, one scope control, repeated three times                                        | `test/eval-test-review.js`        |
| Behavioral eval, `trace`        | A seeded set of ten acceptance criteria and a clean set of five, each in its own staged workspace, repeated twice                            | `test/eval-trace.js`              |
| Behavioral eval, `bmad-tea`     | 18 intents put to the agent, one call each, measuring which menu item a sentence routes to, repeated twice                                   | `test/eval-bmad-tea-routing.js`   |
| Behavioral eval, `nfr`          | An evidence bundle with known gaps and a clean control, each audited in its own staged workspace, repeated twice                             | `test/eval-nfr.js`                |
| Behavioral Evaluation Contracts | Fourteen, all compiling, all generated, every oracle evaluated against stored evidence                                                       | `test/contracts/`                 |
| Replay corpus                   | 70 stored outputs scored with no model call: 3 selections, 10 verdicts, 14 trace pairs, 15 nfr reports, 11 test-design documents, 17 replies | `test/replay/`                    |

One of the ten skills, `bmad-teach-me-testing`, has no suite of any kind. It carries a deferred entry in the manifest naming its owner, its missing evidence, and the condition that retires the entry, because a suite list with a skill quietly missing from it reads as coverage.

The three suites that existed then were measured live for the first time on 2026-09-08 and all three were green. No result artifact is committed, so the numbers live in `docs/explanation/eval-quality-roadmap.md` and any claim about them needs a fresh measurement. The `bmad-tea-routing`, `nfr` and `test-design` suites were added afterwards and have never been run live, so each has declared thresholds and no measurement behind them.

## 1. What you need before you start

### An observable output

The skill has to leave something behind that is not the conversation. `test-review` writes a JSON verdict and a markdown report. `trace` writes `test-artifacts/e2e-trace-summary.json` and `test-artifacts/traceability-matrix.md`. Fragment selection answers with a JSON object on standard output. Each of those is a thing an oracle can address.

If the skill's only output is a transcript, the rest of this guide does not apply to it yet. See [What does not transfer](#what-does-not-transfer).

### A command that runs it

This is the single biggest cost in the whole adoption, and it is worth saying plainly before anybody plans around it. TEA already shipped one command for other reasons, `tea-test-review` (`cli/test-review.js`). The other two commands in this repository exist because contracts needed something real to name, and both were written during this work: `cli/fragment-selection-runner.js` and `cli/trace-runner.js`, about 185 lines each.

Skipping this step produces a specific and expensive failure. Eight fragment-selection contracts declared `tea-fragment-selection-runner` before anything by that name existed. The contracts compiled. Pre-flight scheduled a leg against the command. The gate stayed green over a command nobody could run. `docs/explanation/eval-quality-command-adapter.md` records this as worse than a declared gap, and `test/test-probe-targets.js` now fails when a contract names an interface the execution registry does not carry, in both directions.

A runner command is small and has a fixed shape. Read `cli/fragment-selection-runner.js` and `cli/trace-runner.js` together. They differ in their default timeout, the capability they declare, and whether the answer comes back on standard output or as files left on disk. Everything else is the same file.

- **The prompt arrives on standard input.** The command builds no prompt. A prompt is assembled from step files and per-case repository facts, which belong to the eval corpus.
- **The command knows no vendor.** It calls `runAgent` from `cli/lib/run-agent.js`, the one place that holds vendor argv, model pinning, the minimal child environment, and credential shape.
- **It declares one capability.** `tea-fragment-selection-runner` declares `read-only`, because a selection is a reply and needs no file. `tea-trace-runner` declares `scoped-artifact-writes`, because its deliverable is two files. Under `read-only`, claude runs with no write tool and codex under its read-only sandbox.
- **Its exit codes are failure classes.** Both commands import one table, `cli/lib/runner-exit-codes.js`: `0` none, `2` usage, `3` `environment-configuration`, `4` `environment-transport`, `5` `environment-timeout`, `6` `environment-parser`. The adapter that runs the command records an exit code as an observation and never as a fault, so the code is the only channel a failure class survives the boundary through. Two commands spelling one class with two numbers would leave the caller guessing which command it held.
- **It exports its own request shape.** `SELECTION_REQUEST_KEYS` in the selection runner declares which arguments, options, environment names, and standard-input keys the command accepts. `tools/generate-contracts.js` reads that export. `test/contracts/README.md` records why a transcription would have been worse: the transcribed version of `tea-test-review`'s verdict descriptor had drifted by seven keys before anybody measured it.
- **It is registered twice.** Once in `package.json` under `bin`, once in `test/lib/probe-targets.js` as an execution target with its script path, its permitted subcommand paths, its artifact map, and its wall-clock backstop.

One more cost is invisible until you pay it. `eval-quality` is ESM and TEA is CommonJS, so every entry point through it is asynchronous. The harnesses were synchronous from `main()` down, and converting one touched every scoring loop in it. `docs/explanation/eval-quality-command-adapter.md` calls that the real cost of the rewiring.

### The adapter, and what you no longer write

Before `eval-quality` 1.0.0, each TEA harness owned the mechanism it measured with: its own `spawnSync`, its own argv assembly, its own timeout, its own `existsSync` followed by `JSON.parse` in a `try`. Three copies, disagreeing about what a command may do, none capping output, and nothing anywhere deciding which executable a harness was allowed to run.

`createCommandLineAdapter` is that mechanism written once. `test/lib/probe-targets.js` is the TEA-owned half around it and is worth copying wholesale:

- a `CommandTargetPolicy` that denies by default, so a logical name with no registry entry is refused before a process starts;
- the one place a logical executable resolves to a real file, a working directory, an artifact map, and two budgets, which keeps machine-absolute paths out of every contract;
- `maxOutputBytes` of eight megabytes per stream and per artifact, where nothing capped output before;
- `maxElapsedMs` as an outer SIGKILL backstop, deliberately longer than the inner timeout each command applies to its own vendor call, because the inner clock classifies a timeout and the outer one only kills;
- `failureClassForFault`, which maps every fault the port can throw onto a TEA failure class, so a killed run is classified and never scored.

Three kinds of probe stay outside the adapter, because they interrogate the environment rather than a system under test: a runner's `--version`, `git` questions about the working tree, and the macOS keychain lookup for a stored login. All seven of those ran as a bare `spawnSync` with no timeout until `373ab70`. A pre-flight exists to fail before a paid matrix starts, and one that blocks forever shows CI a running job rather than a broken one. `test/lib/bounded-probe.js` gives them a ten-second deadline, a SIGKILL rather than a SIGTERM, and a reason the caller can act on.

## 2. Choose the skill by the evidence available

Order the skills by the evidence available, and let the first ones build infrastructure the later ones reuse. TEA ordered its remaining skills twice, on two axes, and both orderings are in the repository.

`docs/explanation/eval-quality-roadmap.md` orders by how strong an oracle the output admits:

1. `trace` and `nfr`: bounded reports with explicit evidence, status, coverage, waiver, and gate rules.
2. `atdd` and `automate`: executable fail-before and pass-after checks against qualified seeded regressions.
3. `framework` and `ci`: generated project and pipeline fixtures that can be installed, parsed, linted, and smoke-tested.
4. `test-design`: deterministic artifact checks plus semantic oracles for risk grounding and coverage choices.
5. `bmad-tea` and `bmad-teach-me-testing`: transcript-based, multi-turn behavior with more semantic scoring.
6. `test-review`: expand the existing corpus as real misses and false positives are qualified.

`docs/explanation/eval-quality-command-adapter.md` orders the same skills by the shape of the artifact, which is what decides how much command work each one needs, and grades the difficulty:

1. `trace` and `automate`, writing into a staged tree. One runner wrapping the agent in a staged workspace, and an artifact map over what it writes. `trace` is done and is the worked example in this repository.
2. `nfr` and `test-design`, each writing its assessment artifact. Medium: neither has a harness, so the corpus is the work.
3. `atdd`, and `automate`'s fail-before leg, one command against two revisions. Medium: the fixture reset such a plan needs does not exist.
4. `framework` and `ci`, scaffolding a project or pipeline. High: the artifact is a tree and the artifact map addresses files.
5. `bmad-tea` and `bmad-teach-me-testing`. Unknown: one request and one observation is not a multi-turn transcript.

The two orderings agree at both ends, which is the useful part: a bounded JSON report is the cheapest thing to measure and a transcript is the most expensive. They disagree in the middle because they weigh different work, so pick a skill that both lists place early.

A case qualifies when three things hold, from the roadmap's own rule: the seeded defect or expected behavior is observable from the exact evidence given to the agent, the ground truth was written independently of the generated output, and the oracle can distinguish a real catch from a fluent guess. Do not add a case because the failure looks plausible.

## 3. Build the ground truth

This is the part that cannot be generated and is where the value of the whole exercise sits. `test/fixtures/test-review-eval/ground-truth.json` and `test/fixtures/trace-eval/ground-truth.json` are the two worked examples, and they answer different shapes of question.

### Seeded defects with known locations

Each planted defect records the row it violates, the line the rule fires on, and the set of lines a reviewer may cite and still be scored as having found it:

```json
{
  "row": "H3",
  "line": 31,
  "admittedLines": [26, 29, 30, 31],
  "what": "conditional decides whether anything is asserted",
  "why": "The conditional at 31, its two comment lines, and the enclosing test at 26."
}
```

`admittedLines` replaced a symmetric line tolerance, which was wrong in both directions. The radius was justified in one direction only, that a reviewer citing the enclosing test rather than the exact offending line has still found the defect. A symmetric window did not reach the enclosing declaration for two of the plants, and it admitted lines 41, 42 and 43 of a 40-line file, which the rubric's own fabricated-location penalty calls a defect. Derive the line numbers from the fixture and re-derive them whenever the fixture changes, or recall is measured against the wrong lines and the number lies quietly.

Nine plants across two files, four of them CRITICAL, is the whole `test-review` positive corpus. It is small on purpose. A corpus is only worth what its ground truth is worth, and every row of it is hand-authored.

### The clean fixture is not optional

`test/fixtures/test-review-eval/clean/profile.spec.ts` has no defects by construction, and the ground truth says what a run must not report against it and which false positives are likely:

```json
"mustNotReport": {
  "reason": "Deliberately clean. Any violation here is a false positive.",
  "commonFalsePositives": [
    "network-first: the intercept IS registered before the navigation",
    "priority markers: [P1]/[P2] are present in the test names",
    "data factories: buildProfile is a factory with overrides"
  ]
}
```

The reason it is mandatory is one sentence in the roadmap: recall alone rewards a system that reports everything. A reviewer that flags every line scores 100% recall against nine plants. The clean control is what makes that score cost something, and the `nonFalsePositiveRate` threshold is what prices it.

The `trace` corpus goes further and makes a whole fixture set the negative control. Its clean set of five criteria has adequate evidence for every one, so any reported gap is a false positive, the expected gate is PASS, and `maxCleanFalsePositives` is zero.

### A discriminating case, in both directions

The strongest single element in either corpus is a case that separates reading the evidence from matching the names, and each `trace` fixture set carries one.

The seeded set's AC-2 has no coverage at all, and the corpus plants a test titled `AC-2 rejects export requests from members without the admin role` that builds its context from `ADMIN_TOKEN`, posts the request AC-1 already covers, and asserts a 202. `MEMBER_TOKEN` is declared at the top of the file and never used, which is the gap made visible. A run that matches on names scores AC-2 as covered, which moves P0 coverage from 50% to 100% and flips the gate from FAIL to PASS.

The clean set's AC-4 is the mirror. Neither the file name nor either test title mentions AC-4 or the word expiry, so the mapping can only be made by reading what the tests assert. A run that matches on names reports AC-4 as a gap, which is a false positive and flips the clean gate from PASS to FAIL.

Both are flagged `isDiscriminatingCase` in the ground truth and scored on their own threshold, `discriminatingCriterionAccuracy` at 1.0, because a pooled accuracy hides them.

### The ground truth is never in the agent's context

Each `trace` case runs in a staged workspace holding one fixture set, a resolved config, and a copy of the skill. `ground-truth.json` is not copied, and `test/eval-trace.js` asserts it before spending a call: no staged file carries its bytes, no staged path is named for it, and the assembled prompt contains none of the tokens that appear only in it. That is the whole validity of the measurement, so it is an assertion rather than a convention.

### Independence, and where TEA does not have it

The fragment-selection suite names the same paths under `fixtures` and `groundTruth`, and the manifest's own comment says why: the oracle there was quoted from each workflow's step files rather than written independently of the case. That is an honest limit, and it is the reason fragment selection does not discharge a skill's coverage obligation in the manifest. Fragment selection measures a routing decision taken before the workflow produces anything.

### Every key in the ground truth must be read by something

Four top-level keys in the `trace` ground truth were read by nothing until `96bb76c`. One of them, `nonDeterministicReportedValues`, stated the seeded API test count as 5 or 6 where the evidence gives 6 or 7. Its own arithmetic was wrong and nothing could notice, because nothing read it. It was replaced by a per-set `expectedTestInventory` that `--validate-only` recomputes and the harness scores. The same pass bound `negativeControls` and `rejectedCases` to harness tables that `--validate-only` cross-checks in both directions, verified by adding an unbound id each way and watching it fail.

The same defect appeared in the `test-review` corpus. `knownUnplanted` recorded two findings that a human had adjudicated as real defects nobody planted, and nothing read it, so the adjudication changed no number and every run asked somebody to re-adjudicate the same two findings.

A key nobody reads is a comment that looks like data. Bind each one to a check, or delete it.

## 4. Write the harness

### What a harness measures

Name the measurements before writing any of them, and keep the list in the file header. `test/eval-trace.js` names fifteen, from per-criterion coverage status down to fixture mutations, each with a note saying why it is scored separately, and the manifest declares sixteen thresholds over them. Two structural decisions in that list transfer to any skill:

- **Score the discriminating judgments on their own.** A pooled accuracy over ten criteria hides the one that flips the answer.
- **Do not lead with the aggregate.** The `trace` gate is one bit, and scoring one criterion wrongly flips it. So the gate carries the same weight in the summary as one criterion status. A harness that led with the gate would leave six of the seeded set's ten judgments unmeasured.

### What a threshold means

A threshold is a gate declared before the live run, and it lives in two places that are checked against each other. `test/evals/suite-manifest.json` declares it and the harness holds it in a `THRESHOLDS` constant; `tools/validate-eval-schemas.js` fails `npm test` when the two disagree. So does the case count, against the case-id list each harness exports, and so do the runner capabilities.

That check earns its keep. `test-review` failed any run whose verdict moved between identical repetitions and the manifest never declared that gate, which is the exact drift the check exists to catch. `maxDistinctVerdicts` is declared in both places now, and deleting it from the manifest fails `npm run test:eval-schemas`, which is how the fix was verified.

Set thresholds so that they can teach something. The `test-review` header states the rule directly: this harness exists to detect regression and vendor drift, so a bar nobody can clear teaches nothing and a bar everyone clears teaches nothing either. Its recall threshold is 0.7 against nine plants, its CRITICAL recall is 1.0, and its non-false-positive rate is 0.8.

Name a metric for what it actually measures. TEA's review precision metric penalizes definite false positives, meaning findings against the clean fixture. An unmatched finding on a seeded fixture stays unattributed until a human adjudicates it, so it counts as neither correct nor incorrect, and the metric is named `nonFalsePositiveRate` rather than precision for that reason.

### The rule this repository learned the hard way

**A failed model call is an environment failure and never a low score.** Authentication, timeout, transport, parser, and missing-artifact failures mean nothing was measured. Reporting them as a low number is reporting a quality regression that did not happen.

The mechanism is three exit codes and an ordered list of failure classes:

- `0`: every threshold met.
- `1`: a threshold was missed, or the corpus is inconsistent. A real result.
- `2`: the environment could not measure anything.

`FAILURE_CLASSES` in `test/schema/eval-result.js` is ordered by ascending severity and `worstFailureClass` takes the highest index, so an environment failure always outranks a measured quality failure. The exit code is derived from the class rather than chosen separately.

### The one promotion TEA declines, and why

`eval-quality`'s own binary takes a `--strict` flag that promotes a CONCERNS verdict to exit `1`, except a CONCERNS whose only firing conditions are the two evidence conditions AD-21 names. The ladder settles that question itself and publishes the answer as `LadderResolution.strictPromotable`, which is the field a consumer is meant to read.

TEA scores in process through `runScore` and reaches no binary, so nothing applies `--strict` unless TEA decides to. **TEA declines the promotion**, and `STRICT_CONCERNS_PROMOTION` in `test/lib/probe-scoring.js` is where that decision is written down. Exit `1` in this repository already means a measured quality failure decided by the failure classes above, and a probe corpus decides one by baseline movement. Promoting would give exit `1` a second meaning inside one repository, which is the same defect this section opens with, reached through the verdict ladder. It would also take `npm test` red today on the 32 CONCERNS the stored corpus scores, every one of which `test/probes/expected-strength.json` already records as expected.

The field is still read every run. `test/test-probe-corpus.js` records `strictPromotable` for every scored probe. It can only move on probes that resolve CONCERNS, and every current CONCERNS is `true` because each one fires on an unsatisfied coverage gap, which AD-21 counts as a system claim. The day a CONCERNS fires only on `below-minimum-trial-count` or `oracle-unreached`, the field goes `false`, the baseline moves, and somebody reads why. `ladderExitCode` is the single place a ladder resolution becomes an exit code TEA reports, so flipping the decision is one constant with a measured consequence.

One case belongs to the same rule and is easy to miss. **Every declared repetition must complete.** Stability and variance are claims about repeated runs, and a case that lost a run has fewer observations than the gate declared. The `test-review` harness once scored fewer runs than were requested, which made variance unmeasurable and weakened the stability claim while still reporting a pass. All six harnesses exit `2` on a short run now.

### Confine the run, and check afterwards

Declare what the runner may do and then verify it did no more. Fragment selection runs in an empty scratch directory that is the authorization's own working directory, and a run that leaves a file there is an environment failure whose reply is never scored. The `test-review` eval passes `--isolate` on every review. The `trace` eval checks after every run that the repository it lives in did not change, and writes inside the staged workspace are scored separately as `maxFixtureMutations`.

These were all declared before they were applied. Until `3e8be70` the manifest declared runner capabilities that no harness handed to any runner, so fragment selection ran the agent in the repository root with `Write` and `Edit` available while the manifest said `read-only`, and `test-review` enabled isolation only under `CI`, so a laptop run handed the agent a writable checkout.

### Three modes, one of which costs money

Every harness supports the same three:

| Mode               | What it does                                                                                        | Cost                     |
| ------------------ | --------------------------------------------------------------------------------------------------- | ------------------------ |
| `--validate-only`  | Static. Asserts the corpus is internally consistent and every span resolves in the fixture it names | None. Runs in `npm test` |
| `--preflight-only` | The static checks, then the runner: on `PATH`, answers `--version`, has a credential                | No model call            |
| default            | A vendor run per case per repetition                                                                | Model calls              |

`--validate-only` is the mode the deterministic gate runs. `--preflight-only` is what the suite manifest declares as `preflightArgs`, and `tools/validate-eval-schemas.js` drives that argv once with a missing runner and once with `node` standing in, requiring exit 2 and exit 0 with matching result records, so a pre-flight that never reaches the runner fails `npm test`.

### Replay the scorers without a model

A harness is mostly scoring logic, and scoring logic is code that needs its own regression test. `test/replay/` holds 57 stored outputs and `npm run test:eval-replay` scores them with no model call and no network. Two rules make the corpus worth having:

- **Derive each expected result by hand from the ground truth**, before running the code under test. A result generated from the scorer proves the scorer agrees with itself.
- **Carry a scorer version.** A parser or scorer change either reproduces every stored result or bumps `SCORER_VERSION` in an edit somebody has to review. `--accept` refuses to re-record until that bump happens.

Deriving by hand is not ceremony. Writing the `trace` parser-rejection case by hand found a defect: `readMatrix` closed a criterion section only at the next criterion-shaped heading, so a `### Gap Analysis` heading left the last section open and a test cited beneath it was recorded as that criterion's evidence. The derivation gave 10 citations and the code gave 11.

Two of the 57 stored outputs are real captures. The other 55 are constructed, because the only real outputs this repository has banked from live runs are both unscoreable.

## 5. Express the skill as a contract

A Behavioral Evaluation Contract states what a skill has to do in a vocabulary that lives outside the repository. `eval-quality` owns the format, the compiler, and the evaluator. The module owns the fixtures, the seeded defects, the ground truth, and the runners. The dependency is one-way: `eval-quality` does not need the module installed and does not launch its agents.

### Generate contracts, never hand-write them

All fourteen TEA contracts are written by `tools/generate-contracts.js` from their sources, and `node tools/generate-contracts.js --check` regenerates them in memory and fails when the bytes on disk differ. It runs in `npm test`, so a fixture edit that leaves a contract stale fails the deterministic gate.

What the generator reads rather than transcribes is the interesting part: every planted row and its admitted-line set from the ground truth; which behavior a row belongs to and how hard it grades, from the row's severity in the criteria registry; every required and forbidden fragment list from each `evals.json`; the verdict descriptor's key set and types from `VERDICT_KEYS` in `cli/test-review.js`; each runner's request shape from the runner itself; the trace summary's key set from the object literal in the workflow's step-05; and both source-spec digests, recomputed from the files they pin through a helper that length-prefixes each file, so a byte moved from the tail of one step file to the head of the next changes the answer.

The prose that is genuinely authored, an oracle's commentary and the sentence a behavior's description opens with, lives in the generator, which is the one place it is written.

### What the compiler catches, and what it does not

The compiler answers one question: is this contract well formed against the schema. That question is worth asking and it is not the same question as whether the contract says anything.

`npm run test:contracts` compares each contract against the status `test/contracts/expected-status.json` records for it, and a status that moves in either direction fails until the baseline is updated to say so. A baseline is what keeps a known failure from reading as a passing check.

**The best argument for evaluating oracles rather than trusting compilation is this repository's own.** Every regex oracle in `test-review.contract.json` used a shape the evaluator refuses before matching anything, an optional group around a dot-star and a slash, which it reports as a catastrophic-backtracking risk and a `budget-exhausted` fault. Eleven of the contract's thirteen oracles could therefore never resolve. The compiler requires only the `^` and `$` anchors, which both shapes have, so every contract compiled clean throughout, and the check that ran in CI was green the entire time.

`npm run test:contract-oracles` is what found it, on its first run. It evaluates every oracle in every contract with `eval-quality`'s own evaluator, over evidence the repository already holds, and compares each answer with the harness scorer's on the same evidence. An oracle that faults, or that contradicts the scorer, fails `npm test`. Build this check on the day you write your first contract.

### What the operator vocabulary cannot say

Five limits surfaced while writing TEA's oracles. Know them before you promise a contract will express a threshold:

- **A fractional pass has no spelling.** `all` and `for-all` are total, `any` and `for-any` are existential, and nothing sits between. The `test-review` eval tolerates missing two of nine plants at a 0.7 recall threshold; the contract can demand all nine or at least one. This is the largest divergence between a TEA contract and the eval it describes.
- **No statistic across repetitions is expressible.** Score variance and verdict stability are computed over N runs, and every oracle is a predicate over one interaction's evidence.
- **A plan cannot declare that two steps must receive different inputs.** The 24 fragment-selection cases differ only in the prompt, which is the property that makes the suite mean anything.
- **An empty collection is no evidence.** A quantifier over an empty collection resolves to `insufficient-evidence`. The `test-review` harness reads a verdict with an empty findings array as a reviewer that named nothing, which is a measured miss of every plant; the contract abstains on the same verdict. Both readings are stated, and the oracle check accepts the abstention exactly when the resolution tree records that condition.
- **A markdown deliverable is one string.** The vocabulary addresses a text artifact only as a whole document, through `regex`, and a pattern that finds one section and reads its status inside a multi-kilobyte document runs against the evaluator's step budget. So `trace.contract.json` states the per-criterion statuses through their deterministic consequences in the JSON summary: the counts, the percentages, the gate, the gap buckets. The harness reads the matrix and the contract does not.

### The witness

Every operation that declares request inputs needs a sensitivity witness, which is a checkable claim that the command actually reads them. The usual form is a differential: two legs with different inputs must produce different outputs.

Two TEA cases show what to do when a differential would be false. `fragment-selection/bmad-testarch-trace.contract.json` covers a workflow whose two cases mandate the same fragment set on purpose, because traceability is a mapping problem and the step file states no stack branch. Asserting that the two cases produce different selections would be false by design, so the generator authors an invariance witness instead: the same equality expression, un-negated, which is a true and checkable claim that earns the weaker guarantee following from it.

`trace.contract.json`'s two plan steps share one prompt, because the harness names no fact about either fixture set in it. A differential between the two steps would attribute to the prompt a difference the staged workspace produced. Its witness is a differential over standard input on one prompt value, `allow_gate`, which is the one prompt value the ground truth establishes an effect for: step-05 evaluates a gate only when it is true and writes `gate_basis` as `none` otherwise.

Witness legs for an artifact-writing command carry a coupling worth planning for. They are runnable only against a staged workspace, because the run's real input is the working directory and the request shape cannot name one.

## 6. Run it, deterministically and live

### The deterministic gate

The `npm test` chain is credential-free, makes no network call and no model call, and grows a step whenever a new check lands. The eval-relevant ones:

```bash
npm run test:eval-data          # fragment-selection corpus, static
npm run test:eval-trace-data    # trace corpus, static
npm run test:eval-schemas       # manifest against harness constants, and the preflight argv
npm run test:eval-replay        # 57 stored outputs against the scorers
npm run test:contract-sources   # are the contracts what their sources generate?
npm run test:contracts          # does the compiler still say what the baseline records?
npm run test:contract-oracles   # does every oracle resolve, and agree with the scorer?
npm run test:probe-targets      # drive every real command through the real adapter
```

`npm run test:probe-targets` is the one that proves the whole chain with no credential. Each suite ships a stub agent that answers `--version` and produces a plausible artifact, so the harness runs end to end through the real adapter, the real policy, and the real command. For `trace` it spawns the harness itself and reads its result record back: every threshold met on a correct run, a `quality` failure when the stub writes a test into the corpus, and `environment-missing-artifact` when the stub writes nothing.

Two operational cautions. First, a check in the local chain has to run in CI as well, which is what `npm run test:ci-coverage` enforces; four checks added in one change reached `npm test` and never reached the workflow, so contract drift, a broken replay record and a corrupted trace corpus would each have passed CI while failing on a laptop. Second, the reverse is also possible: `test:cli` runs in its own sharded CI job and is not in the `npm test` chain, so a change that satisfied the local gate has already gone red in CI.

### Live, by hand

```bash
npm run eval:all -- --agent claude                    # everything, one runner
npm run eval:all -- --preflight-only --agent codex    # readiness, no model call
node test/eval-trace.js --agent claude --runs 2       # one suite
node test/eval-trace.js --agent codex --set clean-api-token-lifecycle
```

`eval:all` discovers its suites from the manifest and refuses to run when a TEA skill appears in neither the suite list nor the deferred list.

### Why both

The deterministic gate protects the measurement. The live run is the measurement, and only the live run finds what nobody thought to check.

The first live fragment-selection run surfaced two real defects, both since fixed. `framework-python-backend` loaded `playwright-utils-mandate.md` into a Python project, because the step file gated the mandate on a config flag alone. `test-design-system-level` loaded `contract-testing.md` off the phrase "describes three services", because the step files said "microservices indicators" without ever defining it. Neither is visible to any static check, and both are ordinary knowledge-routing bugs of the kind that make a fluent answer wrong.

Run live against more than one vendor when you can. The confirming `trace` run was measured against codex rather than claude, because that account was rate limited when the run was due, and a second vendor agreeing is worth more than a matched one.

## 7. What it costs

### Model calls

One `npm run eval:all` for one runner spends 95 calls: 48 fragment selections (24 cases at two repetitions), 36 routing intents (18 intents at two repetitions), 3 complete reviews (one call covers all three fixtures, at three repetitions), 4 complete audits (two evidence bundles at two repetitions), and 4 complete traces (two cases at two repetitions).

Repetition counts are a real cost multiplier and are declared per suite. Two is the smallest number that can say whether an answer is reproducible. `test-review` uses three because it also measures score variance.

`eval-quality`'s own pre-flight is a separate spend. It drives each contract's witness legs through the same port for real, and TEA ran its first one on 2026-09-09 against `claude`: twenty-one legs spawned and 55 minutes of model time, with every leg cached under a digest of its request so a second invocation pays for nothing it has already answered. The eight fragment-selection contracts took sixteen legs and 919 seconds between them, `trace` two legs and 872 seconds, and `test-review` three legs and 1,485 seconds. `docs/explanation/eval-quality-command-adapter.md` records what each one returned. Budget a pre-flight as its own line, and expect the first one to find something.

### Wall clock

Each harness bounds its own vendor call and the adapter backstops it a minute or more later:

| Suite              | Inner timeout | Adapter backstop |
| ------------------ | ------------- | ---------------- |
| fragment-selection | 5 minutes     | 6 minutes        |
| test-review        | 15 minutes    | 16 minutes       |
| trace              | 20 minutes    | 21 minutes       |

Those are bounds rather than measured durations. One real data point: the first `test-review` measurement defaulted to the codex runner, hit the fifteen-minute bound, and measured nothing, so the recorded numbers come from an explicit `--agent claude`. All six harnesses default to `claude` now. Budget a full matrix in tens of minutes, and note that `eval-all.js` deliberately keeps its own child spawn with `stdio: 'inherit'` so a long matrix prints as it goes.

### The parts that stay manual

- **Authoring ground truth.** Every planted defect, every admitted-line set, every criterion's true coverage and the evidence span that establishes it.
- **Adjudicating unmatched findings.** An unmatched finding on a seeded fixture is neither a hit nor a false positive until a human decides. TEA's two were adjudicated by hand and recorded under `knownUnplanted` so nobody has to do it twice.
- **Deriving replay expectations.** By hand, from the ground truth, before the code runs.
- **Deciding whether a case is still worth running.** The generator refuses a case that requires or forbids nothing and a witness whose two legs mandate the same set. Past that, whether the corpus still exercises the behavior it claims to is a question no check here asks.
- **Writing each behavior's success criterion.** It names a set in words, and nothing counts it back from the eval data. The generator checks what it can: every fragment the sentence names by filename must be one the case requires or forbids, and a sentence of the plain `names all N ... fragments` shape must agree with the count.

## The mistakes worth copying

Every one of these was found by running something the repository had believed without checking.

**AC-4, and three runs that were right.** The `trace` clean set failed its first three measured runs. Its discriminating criterion AC-4 came back PARTIAL, then INTEGRATION-ONLY, then PARTIAL, against a declared truth of FULL, and the mismatch false-positived the gate to FAIL. The first fix inlined the coverage-classification rule into step-03, on the theory that a run citing the checklist by name had to guess the semantics from the enum labels. Re-measuring at three runs did not move it, and that second measurement is what showed the runs were right and the corpus was wrong. AC-4 claimed a console list shows an expired token while its only evidence was two API tests asserting what an endpoint returns, and every other criterion in that set naming a rendered surface carries component or e2e evidence. The criterion was rewritten to say what the tests establish, and the set passed. When measurement and corpus disagree, the corpus is a suspect.

**The prompt that was silently truncated at 8 KB.** `tea-test-review --agent none` printed the first 8 KB of a 15 KB prompt to any caller that captured it, because `console.log` on a pipe is asynchronous and the `process.exit` that followed discarded what had not drained. The eval harness digests that output to detect a prompt change, so every prompt change past the 8 KB mark was invisible to the digest, and the digest moved with the length of the temporary directory path because the cut landed somewhere else. The command sets its exit code and returns now.

**Three declarations nothing enforced.** In one pass: the manifest declared runner capabilities no harness applied, the pre-flight argv skipped the runner for two of three suites, and the contracts held oracles nothing in the repository read. A declaration that nothing enforces is worse than a gap, because it reads as a guarantee.

**Two witness legs sharing one staged workspace.** The first live `trace` pre-flight failed its own witness. Both legs ran in one staged directory and their two summaries came back byte-identical beside two matrices that differed, which is a run that rewrote one artifact and left the other, so the second leg's artifact map was reading a file the first leg wrote. Every TEA contract declares `fixtureReset: null`, so nothing in the plan resets a workspace between legs, and a directory per spawned leg is the only thing that makes a leg's evidence its own. No deterministic check could have found it.

**Eleven oracles nothing could evaluate.** Covered above. Compilation is not evaluation.

**A contract naming a command nobody ships.** Covered above. The check that prevents its return runs in both directions.

**Prose that the code contradicts.** One audit found fourteen such claims, including four files saying no live eval run had ever been recorded after all three suites had been measured, a replay corpus described as eleven cases when it held twelve, and thirteen thresholds where the harness declares sixteen. Numbers in prose go stale silently. Re-derive them, or generate them.

**A test file that could not be reviewed.** 22 KB of new test code carried three raw NUL bytes used as a string separator, so git read the file as binary and showed a size instead of a diff. The escape is the same byte at runtime.

**Four characters of headroom.** `llms-full.txt` sat at 599,996 characters of a 600,000 cap marked DO NOT CHANGE, so the next documentation change of any size would have failed the build. Measure the bundle when you add a document. This one is 44,322 characters: with it in, the bundle measures 615,953 and `npm run docs:build` exits 1 on the cap, so `tools/build-docs.js` excludes it alongside the roadmap and the command-adapter document, on the same reasoning. The bundle is 571,631 characters without it.

## What does not transfer

TEA's contracts lean on the fact that TEA workflows write files. A skill whose only output is a conversation is a different problem and this guide will not solve it.

- **One request and one observation is not a transcript.** The command adapter probes an interface once and returns an observation. `bmad-tea` routes a user's intent across turns and `bmad-teach-me-testing` runs a multi-session teaching arc, and neither shape fits. Both stay deferred in TEA's manifest for exactly this reason.
- **A skill with no knowledge index gets no fragment-selection floor either.** `bmad-teach-me-testing` ships none, so even the routing measurement does not apply to it. Fragment selection is the cheap first layer for the other eight, and it is not universal.
- **Fragment selection is not behavioral coverage.** It measures which knowledge a run loads, which is a routing decision taken before the workflow produces anything. TEA's manifest is explicit that only `evalType: behavioral` discharges a skill's coverage obligation, and four of the eight skills fragment selection spans are still listed as deferred. The other four, `nfr`, `test-design`, `test-review` and `trace`, are discharged by their own behavioral suites.
- **A tree is not an artifact map.** The artifact map addresses files by name. A skill whose deliverable is a generated project or pipeline needs a different addressing story before its contract can say anything about the output.
- **Semantic judgments still need a human in the loop.** Adjudication, corpus correction, and the decision that a case still exercises its behavior are all unautomated here, and the AC-4 story is what that looks like when it goes right.

## Where to look

| You want                                  | Read                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------- |
| The plan and what each item cost          | `docs/explanation/eval-quality-roadmap.md`                           |
| What the adapter replaced, and its limits | `docs/explanation/eval-quality-command-adapter.md`                   |
| The contract record and its findings      | `test/contracts/README.md`                                           |
| How a suite declares itself               | `test/evals/suite-manifest.json` and `test/schema/suite-manifest.js` |
| The execution-target registry             | `test/lib/probe-targets.js`                                          |
| A runner command, twice                   | `cli/fragment-selection-runner.js`, `cli/trace-runner.js`            |
| The contract generator                    | `tools/generate-contracts.js`                                        |
| The result record and its failure classes | `test/schema/eval-result.js`                                         |
| A worked corpus                           | `test/fixtures/test-review-eval/`, `test/fixtures/trace-eval/`       |
