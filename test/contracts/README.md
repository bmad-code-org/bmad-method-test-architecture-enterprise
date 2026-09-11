# Behavioral Evaluation Contracts

An eval contract states what a TEA skill has to do, in a form a machine can check, and it does it in
a vocabulary that lives outside this repository. The format, the compiler, and the scorer belong to
[`eval-quality`](https://www.npmjs.com/package/eval-quality). TEA owns the fixtures, the seeded
defects, the ground truth, and the runners. That split is the one
`docs/explanation/eval-quality-roadmap.md` records, and these files are the first contracts written
against it.

| Contract                                      | Suite                                                    | Cases                                               |
| --------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------- |
| `test-review.contract.json`                   | The full behavioral eval for `bmad-testarch-test-review` | 9 planted defects, 1 clean control, 1 scope control |
| `test-design.contract.json`                   | The full behavioral eval for `bmad-testarch-test-design` | 1 seeded set of 5 material risks, 1 clean control   |
| `trace.contract.json`                         | The full behavioral eval for `bmad-testarch-trace`       | 1 seeded set of 10 criteria, 1 clean set of 5       |
| `fragment-selection/<workflow>.contract.json` | Fragment routing for eight workflows                     | 24 cases                                            |

**Every contract here is generated. Do not hand-edit one.** `tools/generate-contracts.js` writes all
eleven from their sources: `test-review.contract.json` from
`test/fixtures/test-review-eval/ground-truth.json` and `criteria-registry.md`; `trace.contract.json`
from `test/fixtures/trace-eval/ground-truth.json`, the request shape `cli/trace-runner.js` declares,
the prompt `test/eval-trace.js` assembles, and the summary literal in the trace workflow's step-05;
`test-design.contract.json` from `test/fixtures/test-design-eval/ground-truth.json`, the request shape
`cli/test-design-runner.js` declares, the prompt `test/eval-test-design.js` assembles, and a digest
over the test-design workflow's step-03, step-04, step-05 and `test-design-template.md`; and
each fragment-selection contract from that workflow's `test/evals/<workflow>/evals.json`, its deciding
step file, and its `resources/tea-index.csv`. Regenerate with `node tools/generate-contracts.js`; an
edit made here by hand is overwritten by the next run and fails the gate in the meantime.

`test-review.contract.json` addresses `verdict.findings`, which is a field the `tea-test-review` CLI
did not carry until the change that added these contracts. Before it, the only way to learn which
defects a review reported was to re-parse the markdown report with two regular expressions, which is
what `findingsFromReport` in `test/eval-test-review.js` did. The report was the contract; now the
verdict is, and `scoreVerdict` reads the same array this contract asserts against.

That second parser had already answered differently in both directions, on fixtures this repository
keeps. It read raw lines and never stripped fenced blocks, so the Critical finding quoted inside the
fenced example in `fixtures/test-review-cli/reports/fenced-fake-finding.md` counted as real: two
findings against the CLI's one. And it dropped the finding in
`fixtures/test-review-cli/reports/finding-without-location.md` whose location line is missing, which
tripped its own declared-versus-attributed guard and scored the whole run unmeasurable: one finding
against the CLI's two. It is gone. `scoreVerdict` returns null only for a verdict carrying no
findings array at all, and `test/replay/test-review/verdict-without-findings/` covers that branch.

## They did not compile against 0.2.0, and that was the finding

Everything in this section is measured against the published `eval-quality` release, so a check run
against a `dist/` built locally from a newer revision can disagree with every count below.

`eval-quality`'s own release plan records an entry criterion for its next version, in section 12 of
`TEST-PLAN-NEXT-STEPS.md`:

> The first `eval-contract` written for `bmad-tea` is the first time anyone authors one against the
> published schema without this repository's fixtures at hand. [...] A change needed here is the
> finding, and it names which part of the schema or which failure code did not carry enough
> information to author against.

These are those contracts and this is that finding. Reproduce it with the published package, which
is now a declared devDependency so `npm run test:contracts` runs in CI rather than skipping:

```bash
npx eval-quality compile --in test/contracts/test-review.contract.json
```

`test-review.contract.json` produces 58 parse issues, and every one of them has the same cause: the
contract language can describe a system under test that speaks HTTP, and a TEA skill runs behind a
command.

| Issues | Where                                                             | What an author cannot write                                                                                                                                                                                                                                             |
| -----: | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     32 | oracle operands, direction evidence targets, one rubric criterion | An evidence pointer into a file the run wrote. `AD-26`'s channels are `response-body`, `response-headers`, `response-status`, `call-inputs`, `stdout`, `stderr`, `exit-code`, and none of them addresses an artifact. The review report and the verdict are both files. |
|     12 | `sensitivityWitness.legs[].inputs`                                | Command inputs on a witness leg. `WitnessInputs` requires exactly `path`, `query`, `header`, `body`.                                                                                                                                                                    |
|      5 | `permittedInterfaces[].operations[].requestShape`                 | Command inputs on an operation. `requestShape` requires exactly the same four. A command takes positional arguments, options, environment variables, and standard input.                                                                                                |
|      5 | `interactionPlan[].inputBinding`                                  | The same four channels again, on the plan step that binds them.                                                                                                                                                                                                         |
|      2 | `operations[].method`, `operations[].pathTemplate`                | A command invocation. `method` is an HTTP verb enum and `pathTemplate` is required, so a command contract can only parse by declaring a meaningless `POST /path`.                                                                                                       |
|      1 | `sensitivityWitness.channel`                                      | A differential over a command input. The enum admits `path`, `query`, `body`.                                                                                                                                                                                           |
|      1 | `operations[]`                                                    | The fields a command operation needs. `additionalProperties: false` rejects `invocation`, `artifacts`, and the field naming which channel the response descriptor describes.                                                                                            |

One more rejection sits behind those, and a contract has to get past all 58 to reach it:

```text
unsupported-interface-kind: EvalContract.permittedInterfaces[logicalId=…].kind:
  "cli" is not supported in v0; only "api" is (AD-10)
```

`kind: "cli"` parses. It contributes none of the 58, because it is a compile-stage rejection and the
parse fails first. It is the last gate rather than the first one.

The evidence side is already command-aware and the declaration side is not. `EVIDENCE_CHANNELS` in
`eval-quality`'s `src/core/schemas/pointer.ts` already carries `stdout`, `stderr`, and `exit-code`,
and `SealedRunRecord`'s observation already records all three. Only `Interface` and `Operation` are
HTTP-only, which is what makes the gap closeable rather than structural.

`0.2.0` prints the failure code and the artifact and stops there, so a run against it shows the code
without the located issue list the table below breaks down. The list comes from a later revision of
the renderer. The issues themselves are the same either way; only whether the tool prints them
differs.

## Thirteen of thirteen compile

`package.json`'s `eval-quality` devDependency moved from `0.2.0` through `0.3.0` to `1.0.0` on 2026-09-08. All 58
parse issues in the table above, and the `unsupported-interface-kind` rejection behind them, are
`0.2.0` findings, and `0.3.0` closed the gap they describe. Every contract compiles now, including the
two `tea-routing-*` contracts added since the table was written. `npm run
test:contracts` and `test/contracts/expected-status.json` carry the current baseline; regenerate it
with `--write` whenever the compiler version changes.

`fragment-selection/bmad-testarch-trace.contract.json` needed one more change to get there.
Its selection operation declares request keys, the prompt, the stack, and the TEA config, and AD-10
requires a witness on any operation that does, but trace's own eval deliberately keeps both cases'
`mustLoad` sets identical: traceability is a mapping problem, not a framework problem, and the
workflow's step file states no stack branch. A differential witness, the kind the other eight
contracts declare, asserts two cases produce different selections, which is false here by design, so
`buildSelectionWitness` in `tools/generate-contracts.js` used to return no witness at all for an
operation like this, which was legal under `0.2.0`. `0.3.0` requires one anyway and names the path:
an operation insensitive to its declared inputs by design declares a witness whose relation says so,
a true and checkable claim, and gets the weaker guarantee that follows from it rather than the one a
differential establishes. `buildSelectionWitness` now authors that invariance witness whenever a
workflow's cases all mandate one fragment set, the same equality expression a differential uses,
un-negated. It is a decision recorded here rather than a defect fixed: trace's selection is
input-insensitive by design, and the contract now states that as its own claim instead of stating
nothing.

`trace.contract.json` states its witness over standard input on one prompt value,
`allow_gate`. Its two plan steps send two prompts, each written against its own fixture set's project
root, and each step binds that prompt as its `stdin.prompt` literal. The summaries the two sets
produce differ because of the files staged under those roots, so a differential across the two sets
would attribute to the prompt a difference the staged workspace produced, and an invariance claim over
them would be false. `allow_gate` is the one prompt value the ground truth establishes an effect for,
through `skillRuleCitations.gateEligibility`: step-05 evaluates a gate only when it is true and writes
`gate_basis` as `none` otherwise, so two prompts differing in that value, over one staged fixture set,
produce two `gate_basis` values. That is a true and checkable claim that the command reads its
standard input, and it is the claim the witness makes. Both its legs stage the clean set, because AD-10
reads every other leg of an operation as a clean leg, and they are runnable only against that staged
workspace, which is the coupling `docs/explanation/eval-quality-command-adapter.md` records for every
artifact-writing command. The contract itself states this reasoning in `testData.setup`, because
`SensitivityWitness` is a strict object with no prose field of its own; do not look for it on the
witness. The section "A plan cannot declare that two steps must receive different inputs" below
records what those literals cost and what they bought.

## The routing suite is two contracts, and the bound is why

`tea-routing-intents.contract.json` and `tea-routing-controls.contract.json` express one suite between
them, which is what the suite manifest's `contracts` array is an array for.

The reason is a published bound rather than a preference. `eval-quality`'s AD-39 scripting bound caps
an interaction plan at sixteen steps, in `core/compile/scripting-bound.js`, and it is exclusive: a
plan of exactly sixteen is legal and seventeen is `plan-exceeds-scripting-bound`. The routing corpus
is eighteen intents and each one is its own agent call with its own oracles, so one plan step per
intent is the only binding under which a case's oracles read that case's answer. Eighteen steps is
past the ceiling.

The split falls on the corpus's own line rather than at sixteen. One contract carries the ten intents
with a right answer and asks whether the right answer came back; the other carries the eight controls,
the four where asking is correct and the four nothing on the menu serves, and asks whether the skill
declined to guess. The sensitivity witness each one needs differs with it: the intents contract
differs its two legs on the menu code, because both of its legs route, and the controls contract on
the action.

Both contracts bind standard input as a literal prompt on every step, which is what the trace contract
does and for the same reason recorded there. Every step declares the same operation, so under a
`{ matcher: 'any' }` binding one observation is selected by all of them at once and each case's oracles
quantify over evidence that is not theirs. The literal is what tells eighteen steps apart, and it is
also what the two contracts cost: each step carries the whole assembled prompt, which is the skill and
its menu read off disk, so the pair is about 420 kilobytes of mostly repeated bytes. That is the price
of the binding being correct, and it is paid by a generated file rather than by a reader.

## `test-design.contract.json` states the weak reading, and says so

One honest limitation shapes every oracle in this contract, so it is recorded first.

`bmad-testarch-test-design` declares one deliverable in the epic-level mode this contract exercises, and it is prose: `{test_artifacts}/test-design-epic-{epic_num}.md`, with nothing machine-readable beside it.
`bmad-testarch-trace` is the contrast that makes the gap legible.
It writes `e2e-trace-summary.json` beside its markdown matrix, which is why `trace.contract.json` can state the matrix's content through the arithmetic consequences the summary carries and declare the matrix a volatile pointer.
Test-design has no summary to point its oracles at.

So every oracle in this contract addresses the document as a whole, and the generator pairs each one with `documentMentions`, `test/eval-test-design.js`'s own document-global predicate, rather than with the row-scoped scorer result.
That makes the agreement `test/test-contract-oracles.js` checks true by construction.
Pairing an oracle with the row-scoped result would make the two agree by coincidence on whatever the replay corpus happens to hold, which reads as coverage and holds nothing.

What a green `test-contract-oracles.js` buys here is narrow, so it is worth stating plainly.
It says the contract and the harness agree about which vocabulary the document carries.
It does not say the suite passed, and it says nothing about the arithmetic or the mapping: the 1-3 scale, the arithmetic that makes a score the product of its own two factors, the band a row is filed under, the coverage level and the pairwise priority ordering are the harness's to check, because an oracle over a markdown body cannot tell which row a token sits in and cannot do arithmetic at all.

Fifteen oracles, in three kinds.
One `run-measured` per fixture set asserts the document carries a table cell holding an `R-NNN` identifier, which is the shape the harness reads rows out of, and a document with none is refused before it is scored at all.
One `material-vocabulary` per material risk, five on the seeded set and none on the clean one, asserts the document reaches the deciding vocabulary of a risk the epic supports in as many words.
One `unsupported-vocabulary` per ruled-out risk, four on each set, asserts the document does not reach a risk the epic rules out.
The two `run-measured` behaviors grade `material` and the other thirteen grade `critical`.
Each token group becomes one anchored, case-insensitive regex whose spaces are `\s+`, and a matcher's groups are conjoined with `all`: `matchesGroups` lowercases and collapses whitespace before it searches, and without the `\s+` a token like "feature flag" would miss wherever the document wrapped the line between the two words, and the oracle would disagree with its own scorer.
No lookahead and no backreference anywhere, for the reason the regex limit below records.

Each of the two plan steps binds its own prompt as a `stdin.prompt` literal, for the reason the trace plan records below: both steps declare one operation, so under a matcher binding every observation satisfies both steps and each set's oracles would quantify over evidence that is not theirs.
`buildTestDesignPrompt` in the generator is `test/eval-test-design.js`'s own `buildPrompt`, so the literal on disk and the bytes a run sends are one function.

The sensitivity witness differs its two legs on `design_level`, `full` against `minimal`, over one staged fixture set, and asserts the two documents are not deep-equal.
`test-design-template.md` renders that value straight into the document's Scope line, `**Scope:** {design_level} test design for Epic {epic_num}`, so two prompts differing in it produce two documents, which is a true and checkable claim that the command reads its standard input.
A differential between the two fixture sets would not do: their documents differ because their staged epics differ, which would attribute to the prompt an effect the workspace produced.
Both legs stage the clean set, and the contract states the whole arrangement in `testData.setup`, because `SensitivityWitness` is a strict object with no prose field of its own.

## What the operator vocabulary cannot say

Five limits surfaced while writing the oracles, and none of them is about transport.

**A fractional pass over a set of oracles has no spelling.** `all` and `for-all` are total, `any` and
`for-any` are existential, and nothing sits between. The `test-review` eval's own recall threshold is
0.7, so it tolerates missing two of nine planted defects; the contract can only demand all nine or at
least one. This is the largest divergence between the contract and the eval it describes, and it is
why the contract's behaviors read as absolute demands.

**A plan cannot declare that two steps must receive different inputs.** The 24 fragment-selection
cases differ only in the prompt sent to the runner, and that is the property that makes the suite
mean anything. `sensitivityWitness` expresses a two-leg version of this inside one operation and
nothing expresses it across plan steps.

Answered for `trace`, at a price the eight fragment-selection contracts cannot pay. Binding each
step's `stdin.prompt` as a literal of that step's own prompt is what tells the two steps apart: the
seeded step selects the seeded run, the clean step selects the clean one, and `trace`'s clean control
moved from FAIL at exit 2 with five oracles abstaining to CONCERNS at exit 0 with all twenty-six
resolving `passed-clean-control`. It costs 3.6 kilobytes on `trace.contract.json` and 42 to 143
kilobytes on a fragment-selection contract, which roughly doubles each of those eight files, so they
keep the matcher. A literal is compared with `deepEquals`, so both sides of one have to come from a
single function: `tools/generate-contracts.js` and `test/lib/probe-scoring.js` both call `buildPrompt`
from `test/eval-trace.js`, and the record builder throws when the contract on disk carries any other
bytes. A prompt restated in either place would select nothing and every oracle would resolve
`unreached`, which reads as a clean run at exit 0.

**An empty collection is no evidence.** AD-4 resolves a quantifier over an
empty collection to `insufficient-evidence` with an `empty-collection` introduction condition. The
`test-review` harness reads a verdict whose findings array is empty as a reviewer that named nothing,
which is a measured miss of every plant; the contract abstains on the same verdict. Both readings
are stated, and `test/test-contract-oracles.js` accepts the abstention exactly when the resolution
tree records that condition, and nowhere else.

**A markdown deliverable is one string.** The trace matrix carries the per-criterion coverage
statuses, the judgment the corpus exists to measure, and the vocabulary addresses a text artifact only
as a whole document, through `regex`. A pattern that finds one section and reads its status inside a
multi-kilobyte document runs against the evaluator's step budget, so `trace.contract.json` states the
statuses through their deterministic consequences in the summary: the counts, the percentages, the
gate, the gap buckets. The harness reads the matrix and the contract does not, and a stored run whose
matrix declares no criterion section is refused by the harness and unseen by the contract, which
`test/test-contract-oracles.js` prints as a skip rather than counting as agreement.

**A regex is checked for shape at evaluation time, and `compile` never runs it.** The evaluator
refuses a quantifier nested inside a quantified group before matching anything, as a
catastrophic-backtracking risk, and reports it as a `budget-exhausted` fault. Every regex oracle in
`test-review.contract.json` carried that shape, an optional group around a dot-star and a slash, so
eleven of its thirteen oracles could never resolve. The compiler requires only the `^` and `$`
anchors, which both shapes have, and every contract compiled clean throughout. The generator now
spells the directory prefix as an alternation with an empty branch, and the oracle suite below is
what would catch the next such pattern.

Two more limits are worth recording as answered rather than open. "None of these appear in this
collection" over plain strings IS expressible, as
`not(for-any(collection, set-membership({pointer: "@/"}, {literal: [...]})))`: the bare `@/` spelling
addresses the bound element itself, which is what a collection of strings needs. `set-membership`'s
set position still takes only a reference set or a literal array, never a pointer. And no statistic
across repetitions is expressible at all: score variance and verdict stability are computed over N
runs, and every oracle here is a predicate over one interaction's evidence.

## Validating them here

```bash
node tools/generate-contracts.js --check   # are the contracts what their sources generate?
npm run test:contracts                     # does the compiler still say what the baseline records?
npm run test:contracts -- --cli /path/to/eval-quality/dist/cli/main.js
npm run test:contract-oracles              # does every oracle resolve, and agree with the harness scorer?
```

The three answer different questions and none substitutes for another. The generator check is the
one that runs unconditionally; the compile check and the oracle check need `eval-quality` on disk.

The oracle check is the one that reads the oracles. It evaluates every oracle in every contract with
`eval-quality`'s own evaluator, loaded from the installed package, over evidence this repository
already holds: each stored verdict under `test/replay/test-review/` as one observation of the
`review-corpus` step, each fragment-selection case over three constructed selections and the stored
captures, each stored test design under `test/replay/test-design/` as the `design` artifact of its
fixture set's plan step, and each stored trace run under `test/replay/trace/` as one observation of its
fixture set's plan step, the last two evaluated under both sets' oracles so that every oracle is also
seen failing. Each answer is compared with the harness scorer's on the same evidence: a plant oracle
holds exactly when `scoreVerdict` counts the plant as a hit, the scope oracle exactly when it counts no finding as out of
scope, a containment oracle exactly when `scoreCase` misses nothing, each test-design oracle exactly
when `documentMentions` says the document carries that risk's vocabulary, and each trace oracle exactly
when the `scoreRun` checks it restates all pass, through a correspondence `tools/generate-contracts.js`
writes beside the oracle. Two trace exceptions are stated in that check's header: the waiver oracles
are compared only where the harness scored them, because it skips the waiver block when the gate did
not match so that one wrong gate is not scored three times, and a summary the harness refuses for its
schema version is one the contract's run-shape oracle has to refuse too, with its other oracles left
uncompared because there is no measurement to compare with. Test-design splits the same way on a
document the harness refuses for carrying no risk table: the contract's `run-measured` oracle has to
refuse it too, and its other oracles are left uncompared. An oracle that faults, or that
contradicts the scorer, fails `npm test`. Nothing read an oracle before it, and the section above
records what its first run found.

The compile check resolves `eval-quality` from `node_modules` and skips with an explicit message when it is
absent, so the deterministic gate stays credential-free and runs with no network. It never passes
silently: a skip says it skipped.

When the compiler is available, the check compares each contract against the status
`expected-status.json` records for it. All thirteen contracts `compile` today. A baseline is what keeps a
known failure from reading as a passing check, and what makes the day a contract's status moves
visible instead of silent, so any movement in either direction fails the check until the baseline is
updated to say so. Regenerate it with `--write` once you have read why something moved.

`eval-quality` is a declared devDependency, pinned at an exact version. `0.3.0` is the release that
closed the gap the table above describes, and the pin has moved forward since without the compile
status changing.

## What the generator enforces

`node tools/generate-contracts.js --check` regenerates all eleven in memory and fails when the bytes on
disk differ, naming the contract and the first line that moved. It runs in `npm test`, so a fixture
edit that leaves a contract stale fails the deterministic gate.

What that covers:

- every planted row, its file, and its admitted-line set, read from `ground-truth.json`;
- which behavior a planted row belongs to, read from the row's severity in `criteria-registry.md`,
  so a plant that changes row cannot leave a behavior linked to a row nobody plants, and how hard that
  behavior grades, derived from the same severity: a group whose rows carry their own gate is
  `critical`, a group that feeds the pooled recall gate is `material`, and nothing grades below
  `material`, because missing a planted defect must not rank under one out-of-scope finding;
- every required and forbidden fragment list, the case ids, the plan steps, the witness legs, and the
  per-case counts in the oracle scopes, read from each `evals.json`;
- both `sourceSpecDigest` values, recomputed from the files they pin, through the one digest helper
  in `test/lib/eval-record.js`, which length-prefixes each file so a byte moved from the tail of one
  step file to the head of the next changes the answer;
- every key a sensitivity-witness leg supplies, read from the operation's own `requestShape`, so a
  leg is always a request the port could issue. The test-review legs restated that list and supplied
  only `files` against a shape requiring `files`, `json` and `agent`, which parses and then fails
  compilation under `undeclared-mandatory-input`;
- the selection cardinality bound, counted from each workflow's `tea-index.csv`;
- every value a trace oracle asserts, read from `test/fixtures/trace-eval/ground-truth.json`: the gate
  and its ten criteria fields, the inventory, the priority rows, the risk counts, the per-level
  criteria counts, the live dispositions and each blocker's severity, the rejected span at the
  corpus's own line tolerance, and each waiver's verdict; the trace summary's key set, read from the
  object literal in step-05 rather than transcribed; and the two witness prompts, built by the harness
  function that builds the live one;
- every value a test-design oracle asserts, read from `test/fixtures/test-design-eval/ground-truth.json`:
  each declared risk's token groups, compiled into the anchored regexes the oracles carry, the grounding
  sentence a material oracle quotes and the exclusion sentence an unsupported one quotes; and the two
  witness prompts and both plan-step prompt literals, built by the harness function that builds the live
  one. The generator also refuses a corpus that does not declare exactly one seeded set and one clean
  control, and a specification digest naming a step file that does not exist;
- the budgets and the probe-step bound, scaled from the case count; and
- the verdict response descriptor's `requiredKeys`, `permittedKeys` and `types`, read from
  `VERDICT_KEYS` in `cli/test-review.js`, which composes `PARSED_VERDICT_KEYS` from
  `cli/lib/parse-report.js` with the wrapper's own fields and the waiver's three.

The prose that is genuinely authored (an oracle's `commentary`, the sentence a behavior's
`description` opens with, the risk ids) lives in `tools/generate-contracts.js`, which is the one
place it is written.

## The verdict descriptor is read from the CLI

It was not, and it had drifted. `test-review.contract.json` declared the key set and types of the
verdict `tea-test-review` writes, nothing compared that declaration to the CLI, and by the time
anyone measured it the CLI could emit twenty-two keys against a `permittedKeys` list of fifteen. The
seven it forbade were `reportedQualityScore`, `reportedRecommendation`, `unscorableTestArtifacts`,
`gateFailures`, `waived`, `waiveReason` and `waiveUntil`. Two of those are ordinary: the CLI derives
the score and the recommendation from the ledger and publishes the agent's own values beside them
whenever the two disagree, which is what most real reviews do.

`parseReport` now builds its return value by projecting through `PARSED_VERDICT_KEYS`, so a field it
computes and does not declare throws. `cli/test-review.js` composes that into
`VERDICT_KEYS` and asserts every published payload against it. The generator reads `VERDICT_KEYS` for
the descriptor's three key and type fields, so `--check` fails the moment the CLI gains a field. This
is the idiom `tools/validate-eval-schemas.js` already uses to check a manifest's declared thresholds
against the `THRESHOLDS` its harness applies.

Admitting seven more keys weakens the closed set the descriptor asserts. `requiredKeys` moves the
other way in the same change, from a hand-picked seven to all fourteen keys every verdict carries,
which is a stronger claim than the list it replaces and one the CLI now enforces on every payload it
publishes.

`successIndicator`, `channelRoles` and the findings cardinality bound stay authored in the generator.
Each is a reading of the payload: which key decides pass from fail, which one is the collection, how
many findings a review may plausibly report. The CLI states none of that about itself.

The skip payload is out of the descriptor's scope on purpose. It is a different shape: no agent ran,
so it carries a null recommendation and score and none of the fields a review produces. One
descriptor covering both could only declare their union, and a union whose recommendation and score
are sometimes null asserts nothing about the verdict this contract exists to check. `SKIP_KEYS`
declares that shape in `cli/test-review.js` and `test/test-test-review-cli.js` asserts a real skip
payload against it, so the exclusion stays a tracked decision. The `--agent none` prompt-only payload
is a third shape and is likewise outside the descriptor.

## What is still not enforced

Two things. A third, whether an oracle can be evaluated at all and whether it agrees with the harness
scorer, is enforced by `npm run test:contract-oracles` and is described under Validating them here.

**A behavior's success criterion is authored prose that names a set in words.** "names all seven
mandated fragments" is written in the generator, because the eight workflows name their required
sets in eight different ways, and nothing counts it back from `evals.json`. The generator checks what it can: every
fragment the sentence names by filename must be one the case requires or forbids, and a sentence of
the plain `names all N ... fragments` shape must agree with how many the case mandates. A lead that
carries its count inside a longer phrase is checked only on the filenames.

**Nothing checks that a case is still worth running.** The generator refuses a case that requires or
forbids nothing, because either would make an oracle vacuous, and it refuses a sensitivity witness
whose two legs mandate the same fragment set. Past that, whether the corpus still exercises the
behavior it claims to is a question no check here asks.
