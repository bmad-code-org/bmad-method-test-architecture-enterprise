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
| `fragment-selection/<workflow>.contract.json` | Fragment routing for eight workflows                     | 24 cases                                            |

**Every contract here is generated. Do not hand-edit one.** `tools/generate-contracts.js` writes all
nine from their sources: `test-review.contract.json` from
`test/fixtures/test-review-eval/ground-truth.json` and `criteria-registry.md`, and each
fragment-selection contract from that workflow's `test/evals/<workflow>/evals.json`, its deciding
step file, and its `resources/tea-index.csv`. Regenerate with `node tools/generate-contracts.js`; an
edit made here by hand is overwritten by the next run and fails the gate in the meantime.

`test-review.contract.json` addresses `verdict.findings`, which is a field the `tea-test-review` CLI
did not carry until the change that added these contracts. Before it, the only way to learn which
defects a review reported was to re-parse the markdown report with two regular expressions, which is
what `findingsFromReport` in `test/eval-test-review.js` still did. The report was the contract; now
the verdict is.

## These contracts do not compile yet, and that is the finding

Everything in this section is measured against the published `eval-quality` release, so a check run
against a `dist/` built locally from a newer revision can disagree with every count below.

`eval-quality`'s own release plan records an entry criterion for its next version, in section 12 of
`TEST-PLAN-NEXT-STEPS.md`:

> The first `eval-contract` written for `bmad-tea` is the first time anyone authors one against the
> published schema without this repository's fixtures at hand. [...] A change needed here is the
> finding, and it names which part of the schema or which failure code did not carry enough
> information to author against.

These are those contracts and this is that finding. Reproduce it with the published package:

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

## What the operator vocabulary cannot say

Two limits surfaced while writing the oracles, and neither is about transport.

**A fractional pass over a set of oracles has no spelling.** `all` and `for-all` are total, `any` and
`for-any` are existential, and nothing sits between. The `test-review` eval's own recall threshold is
0.7, so it tolerates missing two of nine planted defects; the contract can only demand all nine or at
least one. This is the largest divergence between the contract and the eval it describes, and it is
why the contract's behaviors read as absolute demands.

**A plan cannot declare that two steps must receive different inputs.** The 24 fragment-selection
cases differ only in the prompt sent to the runner, and that is the property that makes the suite
mean anything. `sensitivityWitness` expresses a two-leg version of this inside one operation and
nothing expresses it across plan steps.

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
```

The two answer different questions and neither substitutes for the other. The generator check is the
one that runs unconditionally; the compile check needs `eval-quality` on disk.

The compile check resolves `eval-quality` from `node_modules` and skips with an explicit message when it is
absent, so the deterministic gate stays credential-free and runs with no network. It never passes
silently: a skip says it skipped.

When the compiler is available, the check compares each contract against the status
`expected-status.json` records for it. Every contract is `blocked` today. A baseline is what keeps a
known failure from reading as a passing check, and what makes the day they start compiling visible
instead of silent, so a contract whose status moves in either direction fails the check until the
baseline is updated to say so. Regenerate it with `--write` once you have read why something moved.

`eval-quality` is deliberately not a declared dependency. Adding it pins TEA to a version whose
schema cannot express these contracts. The dependency lands in the same change that makes them
compile.

## What the generator enforces

`node tools/generate-contracts.js --check` regenerates all nine in memory and fails when the bytes on
disk differ, naming the contract and the first line that moved. It runs in `npm test`, so a fixture
edit that leaves a contract stale fails the deterministic gate.

What that covers:

- every planted row, its file, and its admitted-line set, read from `ground-truth.json`;
- which behavior a planted row belongs to, read from the row's severity in `criteria-registry.md`,
  so a plant that changes row cannot leave a behavior linked to a row nobody plants;
- every required and forbidden fragment list, the case ids, the plan steps, the witness legs, and the
  per-case counts in the oracle scopes, read from each `evals.json`;
- both `sourceSpecDigest` values, recomputed from the files they pin;
- the selection cardinality bound, counted from each workflow's `tea-index.csv`;
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

Two things.

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
