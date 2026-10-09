---
title: 'Adopting eval-quality, One Skill at a Time'
description: 'Build a behavioral evaluation for one BMAD skill using the TEA runners, fixtures, contracts, and checks'
---

# Adopting eval-quality, One Skill at a Time

Build an evaluation for one BMAD skill, then expand to other skills as the harness develops.
The worked examples come from TEA's adoption between commits `7f9d6ad` and `f6e3b4f`.

TEA has eleven skills with covering suites.
Start with a skill whose output you can score against independently authored ground truth.

## What "measured" means here, and what TEA has

A skill is measured when a run of it produces evidence that a checked-in oracle can score, at a threshold declared before the run, with a repetition count the harness enforces.
Everything short of that is an assertion.

TEA's state today, as `test/evals/suite-manifest.json` registers it:

| Layer                               | What it covers                                                                                                                                                                                                                                                                                                                                                                                                                                      | Where                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Deterministic repository checks     | The `npm test` chain, credential-free, no live model call; some checks install dependencies                                                                                                                                                                                                                                                                                                                                                         | `package.json`                             |
| Fragment-selection eval             | 24 cases across the eight workflow skills that ship a knowledge index, measuring which knowledge a run loads                                                                                                                                                                                                                                                                                                                                        | `test/eval-fragment-selection.js`          |
| Behavioral eval, `test-review`      | 9 planted defects across two seeded files, one clean control, one scope control, repeated three times                                                                                                                                                                                                                                                                                                                                               | `test/eval-test-review.js`                 |
| Behavioral eval, `atdd`             | A red-phase story with five acceptance criteria, executed against an unimplemented fixture under the isolation every gate that executes content runs in, repeated twice                                                                                                                                                                                                                                                                             | `test/eval-atdd.js`                        |
| Behavioral eval, `automate`         | Four hand-authored spec sets against a fixed voucher-redemption service and a scratch copy carrying its seeded regression, no live agent, no repetition                                                                                                                                                                                                                                                                                             | `test/eval-automate.js`                    |
| Behavioral eval, `trace`            | A seeded set of ten acceptance criteria and a clean set of five, each in its own staged workspace, repeated twice                                                                                                                                                                                                                                                                                                                                   | `test/eval-trace.js`                       |
| Behavioral eval, `bmad-tea`         | 19 intents put to the agent, one call each, measuring which menu item a sentence routes to, repeated twice                                                                                                                                                                                                                                                                                                                                          | `test/eval-bmad-tea-routing.js`            |
| Behavioral eval, `nfr`              | An evidence bundle with known gaps and a clean control, each audited in its own staged workspace, repeated twice                                                                                                                                                                                                                                                                                                                                    | `test/eval-nfr.js`                         |
| Behavioral eval, `test-design`      | A seeded epic with five material risks and four ruled out, and a clean control epic, each in its own staged workspace, repeated twice                                                                                                                                                                                                                                                                                                               | `test/eval-test-design.js`                 |
| Behavioral eval, `ci`               | Six projects: a full-request project, a minimal-request project, and four evaluation projects (a plan on the pull request tier, a plan on the pull request, merge, scheduled and release tiers, the edit of a pipeline that already holds a marker job and a hand-written job, and the edit of a pipeline whose publish job waits for the release evaluation job), each scaffolded or edited and linted in its own staged workspace, repeated twice | `test/eval-ci.js`                          |
| Behavioral eval, `framework`        | One case: a generated scaffold installed and smoke-tested for real, then two seeded defects each proven to fail for their own reason, inside the isolation every gate that executes content runs in                                                                                                                                                                                                                                                 | `test/eval-framework-scaffold.js`          |
| Transcript-harness infrastructure   | A trivial scripted three-turn session, driving `runTranscript` through a stub agent to prove the multi-turn engine itself; discharges no skill's coverage obligation                                                                                                                                                                                                                                                                                | `test/eval-transcript.js`                  |
| Behavioral eval, `teach-me-testing` | One case, two turns, against a real vendor: turn 1 plays a full first session with a seeded wrong quiz answer and the review it triggers, turn 2 is a fresh process proving progress persisted                                                                                                                                                                                                                                                      | `test/eval-teach-me-testing.js`            |
| Evaluate-authored eval, `evaluate`  | Evaluate's own suite: five seeded probes (two gap-guide class swaps, one held out, plus the web-interface seed, the dropped exit-table row and the guessed class) and four clean controls, five trials each through the skill runner; `tea-evaluate` runs it and `eval:all` skips it                                                                                                                                                                | `test/evaluations/bmad-testarch-evaluate/` |
| Behavioral Evaluation Contracts     | Sixteen, all compiling, all generated, every oracle evaluated against stored evidence                                                                                                                                                                                                                                                                                                                                                               | `test/contracts/`                          |
| Replay corpus                       | 158 stored outputs scored with no model call: 3 selections, 13 atdd reports, 10 verdicts, 15 trace pairs, 29 nfr reports, 54 ci runs, 14 test-design documents, 20 replies                                                                                                                                                                                                                                                                          | `test/replay/`                             |

All eleven of TEA's skills now have a real suite.
The eleventh, `bmad-testarch-evaluate`, is covered by the suite Evaluate authored and ran on itself, registered in `test/evals/suite-manifest.json` as `evalType: evaluate-authored`.
Evaluate ships as a TEA workflow: [Evaluate Your First Skill](/docs/tutorials/evaluate-your-first-skill.md) teaches it by doing, and [How Evaluate Works](/docs/explanation/how-evaluate-works.md) explains it.

Live baselines across the complete suite are recorded in `test/results/eval-all/latest.json` with timestamped history.
[How TEA Is Tested](/docs/explanation/how-tea-is-tested.md) explains the verification layers, clean and seeded controls, and the boundary with `eval-quality` in plain language.

## 1. What you need before you start

### An observable output

Choose an observable output: a report, files, structured stdout, or a transcript with declared turn-level checks.
`test-review` writes a JSON verdict and a markdown report.
`trace` writes `test-artifacts/trace/e2e-trace-summary-{run_key}.json` and `test-artifacts/trace/traceability-matrix-{run_key}.md`.
Fragment selection answers with a JSON object on standard output.
Each of those is a thing an oracle can address.

For a transcript, use the multi-turn harness described in [What does not transfer](#what-does-not-transfer).

### A command that runs it

Give the skill a command that a contract can invoke.
`cli/fragment-selection-runner.js` and `cli/trace-runner.js` are worked examples:

- Read the prompt from standard input; the corpus authors it.
- Call `runAgent` from `cli/lib/run-agent.js`, which owns vendor arguments, model selection, and the child environment.
- Declare the required capability: `read-only` for a reply, `scoped-artifact-writes` for files.
- Import the shared exit table from `cli/lib/runner-exit-codes.js`.
- Export the request shape so the contract generator reads it from the command.
- Register the command in `package.json` and the execution-target registry.

Runner exits are `0` for success, `2` for usage, `3` for environment configuration, `4` for transport, `5` for timeout, and `6` for parsing.
The adapter records these as observations, so every command needs the same mapping.

TEA's first eight fragment-selection contracts named a command that had not shipped.
They compiled, and their preflight declarations provided false confidence.
`test/test-probe-targets.js` now checks contract-to-registry agreement in both directions.

The harnesses await `eval-quality` calls because its entry points are asynchronous.

### The adapter, and what you no longer write

Use `createCommandLineAdapter` to run a declared target, enforce its policy, and read its artifacts.
TEA's shared registry builder is `cli/lib/evaluate/registry.js`; its own target declarations are in `test/lib/probe-targets.js`.
An Evaluate adopter declares entries in `evaluation.json`.

The target entry supplies:

- `CommandTargetPolicy`, which denies undeclared executables and subcommands.
- `permittedEnvironmentKeys`, an explicit list required since `eval-quality` 3.0.0.
- The executable, working directory, and artifact map.
- `maxOutputBytes`, eight megabytes per stream and artifact in TEA.
- `maxElapsedMs`, an outer SIGKILL backstop longer than the command's own timeout.

`vendorEnvironmentNames()` provides TEA's permitted credential and login keys.
See [The environment channel](./eval-quality-command-adapter.md#the-environment-channel).

Map port faults by narrowing with `instanceof RuntimeFault` or `StructuralFailure`, then checking the published code tables.
An ordinary Node error is `unexpected-error`.
A check on `error?.code` alone once classified Node's `ENOENT` and `EACCES` as package transport faults.

Runner version, git-state, and keychain probes use `test/lib/bounded-probe.js`.
It gives each probe a ten-second deadline and a SIGKILL backstop.

## 2. Choose the skill by the evidence available

Start with outputs whose correctness has a strong oracle.
TEA used this order:

1. `trace` and `nfr`: reports with declared evidence, coverage, and gate rules.
2. `atdd` and `automate`: executable checks against qualified regressions.
3. `framework` and `ci`: project and pipeline outputs that can be installed, parsed, and smoke-tested.
4. `test-design`: artifact checks plus bounded semantic judgments.
5. `bmad-tea` and `bmad-teach-me-testing`: routing and multi-turn transcripts.
6. `test-review`: keep expanding the existing corpus with qualified misses and false positives.

The [roadmap](./eval-quality-roadmap.md) records that plan.
The [command-adapter guide](./eval-quality-command-adapter.md) groups implementations by output shape.
All of these TEA skills now have suites.
`automate` executes hand-authored test sets against clean and mutated services; `framework` executes a scaffold fixture.
Neither spends a live-agent call in `eval:all`.

Qualify a case before adding it: the supplied evidence must expose the expected behavior, ground truth must be independent of the generated output, and the oracle must distinguish a real catch from a guess.

## 3. Build the ground truth

Author the expected behavior independently of the output you will measure.
`test/fixtures/test-review-eval/ground-truth.json` and `test/fixtures/trace-eval/ground-truth.json` are the two worked examples, and they answer different shapes of question.

### Seeded defects with known locations

Record the rule, offending line, and exact lines a reviewer may cite:

```json
{
  "row": "H3",
  "line": 31,
  "admittedLines": [26, 29, 30, 31],
  "what": "conditional decides whether anything is asserted",
  "why": "The conditional at 31, its two comment lines, and the enclosing test at 26."
}
```

TEA replaced a symmetric line tolerance with `admittedLines`.
The old window excluded valid enclosing declarations for two plants and admitted lines 41-43 in a 40-line file.
Recompute admitted lines whenever the fixture changes.

The review corpus has nine plants across two files, four CRITICAL, with hand-authored ground truth.

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

The reason it is mandatory is one sentence in the roadmap: recall alone rewards a system that reports everything.
A reviewer that flags every line scores 100% recall against nine plants.
The clean control is what makes that score cost something, and the `nonFalsePositiveRate` threshold is what prices it.

The `trace` corpus goes further and makes a whole fixture set the negative control.
Its clean set of five criteria has adequate evidence for every one, so any reported gap is a false positive, the expected gate is PASS, and `maxCleanFalsePositives` is zero.

### A discriminating case, in both directions

The strongest single element in either corpus is a case that separates reading the evidence from matching the names, and each `trace` fixture set carries one.

The seeded set's AC-2 has no coverage at all, and the corpus plants a test titled `AC-2 rejects export requests from members without the admin role` that builds its context from `ADMIN_TOKEN`, posts the request AC-1 already covers, and asserts a 202.
`MEMBER_TOKEN` is declared at the top of the file and never used, which is the gap made visible.
A run that matches on names scores AC-2 as covered, which moves P0 coverage from 50% to 100% and flips the gate from FAIL to PASS.

The clean set's AC-4 is the mirror.
Neither the file name nor either test title mentions AC-4 or the word expiry, so the mapping can only be made by reading what the tests assert.
A run that matches on names reports AC-4 as a gap, which is a false positive and flips the clean gate from PASS to FAIL.

Both are flagged `isDiscriminatingCase` in the ground truth and scored on their own threshold, `discriminatingCriterionAccuracy` at 1.0, because a pooled accuracy hides them.

### The ground truth is never in the agent's context

Each `trace` case runs in a staged workspace holding one fixture set, a resolved config, and a copy of the skill.
`ground-truth.json` is not copied, and `test/eval-trace.js` asserts it before spending a call: no staged file carries its bytes, no staged path is named for it, and the assembled prompt contains none of the tokens that appear only in it.
These exclusions are checked before a model call.

### Independence, and where TEA does not have it

The fragment-selection suite names the same paths under `fixtures` and `groundTruth`, and the manifest's own comment says why: the oracle there was derived from each workflow's step files.
That is an honest limit, and it is the reason fragment selection does not discharge a skill's coverage obligation in the manifest.
Fragment selection measures a routing decision taken before the workflow produces anything.

### Every key in the ground truth must be read by something

Four top-level keys in the `trace` ground truth were read by nothing until `96bb76c`.
One of them, `nonDeterministicReportedValues`, stated the seeded API test count as 5 or 6 where the evidence gives 6 or 7.
Its own arithmetic was wrong and nothing could notice, because nothing read it.
It was replaced by a per-set `expectedTestInventory` that `--validate-only` recomputes and the harness scores.
The same pass bound `negativeControls` and `rejectedCases` to harness tables that `--validate-only` cross-checks in both directions, verified by adding an unbound id each way and watching it fail.

The same defect appeared in the `test-review` corpus.
`knownUnplanted` recorded two findings that a human had adjudicated as real defects nobody planted, and nothing read it, so the adjudication changed no number and every run asked somebody to re-adjudicate the same two findings.

Bind each ground-truth key to a validation or scoring check.

## 4. Write the harness

### What a harness measures

Name the measurements before writing any of them, and keep the list in the file header.
`test/eval-trace.js` names fifteen, from per-criterion coverage status down to fixture mutations, each with a note saying why it is scored separately, and the manifest declares sixteen thresholds over them.
Two structural decisions in that list transfer to any skill:

- **Score the discriminating judgments on their own.** A pooled accuracy over ten criteria hides the one that flips the answer.
- **Do not lead with the aggregate.** The `trace` gate is one bit, and scoring one criterion wrongly flips it.
  So the gate carries the same weight in the summary as one criterion status.
  A harness that led with the gate would leave six of the seeded set's ten judgments unmeasured.

### What a threshold means

Declare thresholds before the live run.
TEA keeps them in `test/evals/suite-manifest.json` and each harness's `THRESHOLDS` constant.
`tools/validate-eval-schemas.js` checks agreement, case counts, and runner capabilities.

The check caught an undeclared stable-verdict gate in `test-review`.
`maxDistinctVerdicts` now exists in both places.
The review thresholds are 0.7 recall, 1.0 CRITICAL recall, and 0.8 non-false-positive rate.

`nonFalsePositiveRate` penalizes definite false positives on clean fixtures.
Unmatched findings on seeded fixtures remain unattributed until human adjudication.

### Stamp every artifact from the constant the package exports

Read each artifact's schema version from the constant `eval-quality` exports.
Examples include `SEALED_RUN_RECORD_SCHEMA_VERSION`, `PROBE_SCHEMA_VERSION`, and `EVAL_CONTRACT_SCHEMA_VERSION`.

`cli/lib/evaluate/engine.js` reads them into `SCHEMA_VERSIONS` through `require('eval-quality')`.
The dependency-direction purity rule keeps that module synchronous.
`test/lib/eval-quality-inputs.js` re-exports the table.

`npm run test:schema-versions` checks committed source and artifacts against those constants before generator diffs run.
A version mismatch names the artifact and both stamps.

### The rule this repository learned the hard way

A failed model call receives no quality score.
Authentication, timeout, transport, parsing, and missing-artifact failures mean the harness could not complete measurement.

TEA's harness convention is:

- `0`: all thresholds met.
- `1`: a measured quality failure or inconsistent corpus.
- `2`: measurement could not complete.

`FAILURE_CLASSES` in `test/schema/eval-result.js` orders failures by severity.
`worstFailureClass` selects the highest entry and derives the exit from it.
`unexpected-error` is the most severe entry and names a harness defect outside the port's published fault classes.

### The 0/1/2 exit convention, an optional pattern

The three exit codes above are TEA's own harness convention, and `eval-quality` does not require them.
A harness of your own can adopt them when its callers need to tell "the skill got worse" from "nothing was measured":

| Exit | Meaning                               |
| ---- | ------------------------------------- |
| `0`  | every threshold met                   |
| `1`  | a measured quality failure            |
| `2`  | an environment that could not measure |

`tea-evaluate` does not use the convention.
It passes `eval-quality`'s own exits through verbatim (`2` is a scored FAIL, `3` an invalid run, `4` a contract defect, `5` a runtime fault, `64` a wiring defect) and adds `10` to `13` for authoring defects, weak evaluations, infrastructure and baseline drift.
In `tea-evaluate`, exit `2` therefore means a measured failure, and its exit table is in the [tea-evaluate CLI](/docs/reference/tea-evaluate-cli.md#exit-codes) reference.

### The one promotion TEA declines, and why

`eval-quality --strict` promotes some CONCERNS outcomes to failure.
Its `LadderResolution.strictPromotable` field excludes concerns caused solely by `below-minimum-trial-count` or `oracle-unreached`.

TEA's probe corpus keeps `STRICT_CONCERNS_PROMOTION` false in `test/lib/probe-scoring.js`.
It detects quality regression through baseline movement and already records 34 expected CONCERNS outcomes.
The 59-probe baseline also records `strictPromotable`; changes remain visible.

Require every declared repetition to finish before scoring stability.
The review harness once passed with fewer observations than requested.
Live-agent harnesses now exit `2` on a short run.

### Confine the run, and check afterwards

Declare what the runner may do and then verify it did no more.
Fragment selection runs in an empty scratch directory that is the authorization's own working directory, and a run that leaves a file there is an environment failure whose reply is never scored.
The `test-review` eval passes `--isolate` on every review.
The `trace` eval checks after every run that the repository it lives in did not change, and writes inside the staged workspace are scored separately as `maxFixtureMutations`.

These were all declared before they were applied.
Until `3e8be70` the manifest declared runner capabilities that no harness handed to any runner, so fragment selection ran the agent in the repository root with `Write` and `Edit` available while the manifest said `read-only`, and `test-review` enabled isolation only under `CI`, so a laptop run handed the agent a writable checkout.

### Three modes, one of which costs money

Live-agent harnesses support three modes:

| Mode               | What it does                                                        | Model calls             |
| ------------------ | ------------------------------------------------------------------- | ----------------------- |
| `--validate-only`  | Validates corpus structure, references, and spans                   | None                    |
| `--preflight-only` | Validates the corpus and checks runner availability and credentials | None                    |
| Default            | Executes each case at the declared repetitions                      | Per case and repetition |

The manifest declares `preflightArgs`.
`tools/validate-eval-schemas.js` checks that missing and present runners produce the expected exits and result records.
Framework and automate instead execute deterministic fixtures; their default runs can need local services or dependency downloads.

### Replay the scorers without a model

A harness is mostly scoring logic, and scoring logic is code that needs its own regression test.
`test/replay/` holds 158 stored outputs and `npm run test:eval-replay` scores them with no model call and no network.
Two rules make the corpus worth having:

- **Derive each expected result by hand from the ground truth**, before running the code under test.
  A result generated from the scorer proves the scorer agrees with itself.
- **Carry a scorer version.** A parser or scorer change either reproduces every stored result or bumps `SCORER_VERSION` in an edit somebody has to review.
  `--accept` refuses to re-record until that bump happens.

Hand-derived expectations found a trace parser defect: `readMatrix` closed a criterion section only at the next criterion-shaped heading, so a `### Gap Analysis` heading left the last section open and a test cited beneath it was recorded as that criterion's evidence.
The derivation gave 10 citations and the code gave 11.

6 of the 158 stored outputs are real captures, 12 are captured reports and the other 140 are constructed.

## 5. Express the skill as a contract

A Behavioral Evaluation Contract states what a skill has to do in a vocabulary that lives outside the repository.
`eval-quality` owns the format, the compiler, and the evaluator.
The module owns the fixtures, the seeded defects, the ground truth, and the runners.
The dependency is one-way: `eval-quality` does not need the module installed and does not launch its agents.

### Generate contracts, never hand-write them

`tools/generate-contracts.js` writes all sixteen TEA contracts from authoritative sources.
Its `--check` mode regenerates in memory and fails on changed bytes.

It reads planted rows and admitted lines from ground truth, severity from the criteria registry, fragment sets from `evals.json`, and request and verdict shapes from the runners.
It also reads the trace summary shape and recomputes source-spec digests with length-prefixed files.
Oracle commentary and behavior descriptions live in the generator.

Edit the owning sources, then run the generator.

### What the compiler catches, and what it does not

Compilation checks the contract schema.
`npm run test:contracts` compares each result with `test/contracts/expected-status.json`.

Eleven of the thirteen original review oracles compiled but faulted when evaluated because their regexes used a forbidden backtracking shape.
`npm run test:contract-oracles` found this on its first run.
It executes every oracle over stored evidence and compares its answer with the harness scorer.
Add this check with the first contract.

### What the operator vocabulary cannot say

Five limits surfaced while writing TEA's oracles.
Know them before you promise a contract will express a threshold:

- **A fractional pass has no spelling.** `all` and `for-all` are total, `any` and `for-any` are existential, and nothing sits between.
  The `test-review` eval tolerates missing two of nine plants at a 0.7 recall threshold; the contract can demand all nine or at least one.
  This is the largest divergence between a TEA contract and the eval it describes.
- **No statistic across repetitions is expressible.** Score variance and verdict stability are computed over N runs, and every oracle is a predicate over one interaction's evidence.
- **A plan cannot declare that two steps must receive different inputs.** The 24 fragment-selection cases differ only in the prompt, which is the property that makes the suite mean anything.
- **An empty collection is no evidence.** A quantifier over an empty collection resolves to `insufficient-evidence`.
  The `test-review` harness reads a verdict with an empty findings array as a reviewer that named nothing, which is a measured miss of every plant; the contract abstains on the same verdict.
  Both readings are stated, and the oracle check accepts the abstention exactly when the resolution tree records that condition.
- **A markdown deliverable is one string.** The vocabulary addresses a text artifact only as a whole document, through `regex`, and a pattern that finds one section and reads its status inside a multi-kilobyte document runs against the evaluator's step budget.
  So `trace.contract.json` states the per-criterion statuses through their deterministic consequences in the JSON summary: the counts, the percentages, the gate, the gap buckets.
  The harness reads the matrix and the contract does not.

### The witness

A sensitivity witness checks whether an operation reads its declared inputs.
Usually it supplies two different inputs and requires different outputs.

The fragment-selection trace contract mandates the same fragment set in both cases, so it uses an invariance witness with a weaker guarantee.
The behavioral trace contract uses `allow_gate`: enabling it writes a gate basis; withholding it writes `gate_basis: "none"`.

Artifact-writing witness legs need a fresh staged workspace per invocation.
The workspace contents are part of the operation's input.

## 6. Run it, deterministically and live

### The deterministic gate

The `npm test` chain makes no live model calls.
Some installation and dependency checks use network access.
Evaluation checks include:

```bash
npm run test:eval-data          # fragment-selection corpus, static
npm run test:eval-trace-data    # trace corpus, static
npm run test:eval-schemas       # manifest against harness constants, and the preflight argv
npm run test:eval-replay        # stored outputs against the scorers
npm run test:contract-sources   # are the contracts what their sources generate?
npm run test:contracts          # does the compiler still say what the baseline records?
npm run test:contract-oracles   # does every oracle resolve, and agree with the scorer?
npm run test:probe-targets      # drive every real command through the real adapter
```

`npm run test:probe-targets` is the one that proves the whole chain with no credential.
Each suite ships a stub agent that answers `--version` and produces a plausible artifact, so the harness runs end to end through the real adapter, the real policy, and the real command.
For `trace` it spawns the harness itself and reads its result record back: every threshold met on a correct run, a `quality` failure when the stub writes a test into the corpus, and `environment-missing-artifact` when the stub writes nothing.

Two operational cautions.
First, a check in the local chain has to run in CI as well, which is what `npm run test:ci-coverage` enforces; four checks added in one change reached `npm test` and never reached the workflow, so contract drift, a broken replay record and a corrupted trace corpus would each have passed CI while failing on a laptop.
Second, the reverse happened too: `test:cli` used to run only in its own CI job, outside the `npm test` chain, so a change that satisfied the local gate went red in CI.
It joined the chain once its runtime fell from about 15 minutes to under a minute.

### Live, by hand

```bash
npm run eval:all -- --agent claude                    # everything, one runner
npm run eval:all -- --preflight-only --agent codex    # readiness, no model call
node test/eval-trace.js --agent claude --runs 2       # one suite
node test/eval-trace.js --agent codex --set clean-api-token-lifecycle
```

`eval:all` discovers its suites from the manifest and refuses to run when a TEA skill appears in neither the suite list nor the deferred list.

### Why both

Run both the repository checks and the live suite.
The first validates the measurement machinery; the second measures the skill.

The first live fragment-selection run surfaced two real defects, both since fixed.
`framework-python-backend` loaded `playwright-utils-mandate.md` into a Python project, because the step file gated the mandate on a config flag alone.
`test-design-system-level` loaded `contract-testing.md` off the phrase "describes three services", because the step files said "microservices indicators" without ever defining it.
Neither is visible to any static check, and both are ordinary knowledge-routing bugs of the kind that make a fluent answer wrong.

Run live against more than one vendor when you can.
The confirming `trace` run was measured against Codex because the Claude account was rate limited.

## 7. What it costs

### Model calls

One default `npm run eval:all` for one runner spends 117 calls: 48 fragment selections (24 cases at two repetitions), 38 routing intents (19 intents at two repetitions), 4 complete test designs (two cases at two repetitions), 3 complete reviews (one call covers all three fixtures, at three repetitions), 4 complete audits (two evidence bundles at two repetitions), 12 complete pipelines (six ci projects at two repetitions), 4 complete traces (two cases at two repetitions), 2 complete atdd generations (one story at two repetitions), and 2 teaching turns (one case at one repetition).

Repetition counts are a real cost multiplier and are declared per suite.
Two is the smallest number that can say whether an answer is reproducible.
`test-review` uses three because it also measures score variance.

`eval-quality`'s own pre-flight is a separate spend.
It drives each contract's witness legs through the same port for real, and TEA ran its first one on 2026-09-09 against `claude`: twenty-one legs spawned and 55 minutes of model time, with every leg cached under a digest of its request so a second invocation pays for nothing it has already answered.
The eight fragment-selection contracts took sixteen legs and 919 seconds between them, `trace` two legs and 872 seconds, and `test-review` three legs and 1,485 seconds.
`docs/explanation/eval-quality-command-adapter.md` records what each one returned.
Budget a pre-flight as its own line, and expect the first one to find something.

### Wall clock

Each harness bounds its own vendor call and the adapter backstops it a minute or more later:

| Suite              | Inner timeout | Adapter backstop |
| ------------------ | ------------- | ---------------- |
| fragment-selection | 5 minutes     | 6 minutes        |
| test-review        | 15 minutes    | 16 minutes       |
| trace              | 20 minutes    | 21 minutes       |

These are timeout bounds.
One real data point: the first `test-review` measurement defaulted to the codex runner, hit the fifteen-minute bound, and measured nothing, so the recorded numbers come from an explicit `--agent claude`.
Live-agent harnesses default to `claude` now.
Budget a full matrix in tens of minutes, and note that `eval-all.js` deliberately keeps its own child spawn with `stdio: 'inherit'` so a long matrix prints as it goes.

### The parts that stay manual

- **Authoring ground truth.** Every planted defect, every admitted-line set, every criterion's true coverage and the evidence span that establishes it.
- **Adjudicating unmatched findings.** An unmatched finding on a seeded fixture is neither a hit nor a false positive until a human decides.
  TEA's two were adjudicated by hand and recorded under `knownUnplanted` so nobody has to do it twice.
- **Deriving replay expectations.** By hand, from the ground truth, before the code runs.
- **Deciding whether a case is still worth running.** The generator refuses a case that requires or forbids nothing and a witness whose two legs mandate the same set.
  Past that, whether the corpus still exercises the behavior it claims to is a question no check here asks.
- **Writing each behavior's success criterion.** It names a set in words, and nothing counts it back from the eval data.
  The generator checks what it can: every fragment the sentence names by filename must be one the case requires or forbids, and a sentence of the plain `names all N ... fragments` shape must agree with the count.

## The mistakes worth copying

Every one of these was found by running something the repository had believed without checking.

**AC-4, and three runs that were right.** The `trace` clean set failed its first three measured runs.
Its discriminating criterion AC-4 came back PARTIAL, then INTEGRATION-ONLY, then PARTIAL, against a declared truth of FULL, and the mismatch false-positived the gate to FAIL.
The first fix inlined the coverage-classification rule into step-03, on the theory that a run citing the checklist by name had to guess the semantics from the enum labels.
Re-measuring at three runs did not move it, and that second measurement is what showed the runs were right and the corpus was wrong.
AC-4 claimed a console list shows an expired token while its only evidence was two API tests asserting what an endpoint returns, and every other criterion in that set naming a rendered surface carries component or e2e evidence.
The criterion was rewritten to say what the tests establish, and the set passed.
When measurement and corpus disagree, the corpus is a suspect.

**The prompt that was silently truncated at 8 KB.** `tea-test-review --agent none` printed the first 8 KB of a 15 KB prompt to any caller that captured it, because `console.log` on a pipe is asynchronous and the `process.exit` that followed discarded what had not drained.
The eval harness digests that output to detect a prompt change, so every prompt change past the 8 KB mark was invisible to the digest, and the digest moved with the length of the temporary directory path because the cut landed somewhere else.
The command sets its exit code and returns now.

**Three declarations nothing enforced.** In one pass: the manifest declared runner capabilities no harness applied, the pre-flight argv skipped the runner for two of three suites, and the contracts held oracles nothing in the repository read.
A declaration that nothing enforces is worse than a gap, because it reads as a guarantee.

**Two witness legs sharing one staged workspace.** The first live `trace` pre-flight failed its own witness.
Both legs ran in one staged directory and their two summaries came back byte-identical beside two matrices that differed, which is a run that rewrote one artifact and left the other, so the second leg's artifact map was reading a file the first leg wrote.
Every TEA contract declares `fixtureReset: null`, so nothing in the plan resets a workspace between legs, and a directory per spawned leg is the only thing that makes a leg's evidence its own.
No deterministic check could have found it.

**Prose that the code contradicts.** One audit found fourteen such claims, including four files saying no live eval run had ever been recorded after all three suites had been measured, a replay corpus described as eleven cases when it held twelve, and thirteen thresholds where the harness declares sixteen.
Numbers in prose go stale silently.
Re-derive them, or generate them.

**A test file that could not be reviewed.** 22 KB of new test code carried three raw NUL bytes used as a string separator, so git read the file as binary and hid the textual diff.
The escape is the same byte at runtime.

**Four characters of headroom.** `llms-full.txt` sat at 599,996 characters of a 600,000 cap marked DO NOT CHANGE, so the next documentation change of any size would have failed the build.
Measure the bundle when you add a document.
This one is 44,322 characters: with it in, the bundle measures 615,953 and `npm run docs:build` exits 1 on the cap, so `tools/build-docs.js` excludes it alongside the roadmap and the command-adapter document, on the same reasoning.
The bundle is 571,631 characters without it.

## What does not transfer

Adapt the harness to the skill's output shape:

- A transcript needs turn-level state and checks.
  `test/lib/transcript-harness.js` composes sequential adapter calls in one persistent workspace, and `bmad-teach-me-testing` uses it.
- Fragment selection applies only to skills with a knowledge index.
  It measures routing; behavioral or Evaluate-authored suites establish the skill's coverage obligation.
- A generated project needs an artifact map and checks over the relevant files.
- Semantic judgments need human adjudication, corpus correction, and periodic review of case value.

All eight skills covered by fragment selection now have behavioral suites of their own.

## Where to look

| You want                                             | Read                                                                             |
| ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| The implementation history and remaining runner work | `docs/explanation/eval-quality-roadmap.md`                                       |
| What the adapter replaced, and its limits            | `docs/explanation/eval-quality-command-adapter.md`                               |
| The contract record and its findings                 | `test/contracts/README.md`                                                       |
| How a suite declares itself                          | `test/evals/suite-manifest.json` and `test/schema/suite-manifest.js`             |
| The execution-target registry                        | `cli/lib/evaluate/registry.js`, and TEA's entries in `test/lib/probe-targets.js` |
| A runner command, twice                              | `cli/fragment-selection-runner.js`, `cli/trace-runner.js`                        |
| The contract generator                               | `tools/generate-contracts.js`                                                    |
| The result record and its failure classes            | `test/schema/eval-result.js`                                                     |
| A worked corpus                                      | `test/fixtures/test-review-eval/`, `test/fixtures/trace-eval/`                   |
