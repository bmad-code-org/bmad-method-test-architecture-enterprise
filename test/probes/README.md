# Probe Corpora

A contract says what a TEA skill has to do. A probe says what was wrong with the system when the
contract was asked, and `eval-quality`'s `runScore` reads the two together to answer the question the
package exists for: did this contract's oracles catch the defect that was actually there?

| Corpus                                      | Probes | What they are                                                        |
| ------------------------------------------- | -----: | -------------------------------------------------------------------- |
| `test-review.probes.json`                   |     11 | Nine planted registry rows, one clean control, one gameability probe |
| `trace.probes.json`                         |      4 | Three seeded coverage gaps, one clean control                        |
| `fragment-selection/<workflow>.probes.json` |    2x8 | One gameability probe and one clean control per workflow             |
| `tea-routing-intents.probes.json`           |      2 | One gameability probe and one clean control                          |
| `tea-routing-controls.probes.json`          |      2 | One gameability probe and one clean control                          |

**Every probe here is generated. Do not hand-edit one.** `tools/generate-probes.js` writes all twelve
files from the sources this repository already keeps: `test/fixtures/test-review-eval/ground-truth.json`
and `criteria-registry.md` for the planted rows and their severities,
`test/fixtures/trace-eval/ground-truth.json` for the seeded set's coverage gaps, each
`test/evals/<workflow>/evals.json` for the required and forbidden fragment sets, and
`test/fixtures/tea-routing-eval/ground-truth.json` for the routing answers. Regenerate with
`node tools/generate-probes.js`; `npm run test:probe-sources` fails when a file on disk differs from
what its sources generate.

Each probe names the oracle that catches it, through the behavior it declares. `eval-quality`'s
`designatedOracleIdOf` resolves AD-40's designated oracle only for a behavior declaring exactly one
oracle, so `behaviorId` is read out of the generated contract rather than chosen, and the generator
refuses a probe whose behavior discharges more than one. A probe that restates a plant nobody can
detect is worthless, and that check is what keeps one out.

## The routing corpora carry no defect probe

`tea-routing-intents.probes.json` and `tea-routing-controls.probes.json` ship a gameability probe and
a clean control each, and nothing else. A defect probe needs a controlled mutation of the system under
test with baseline and mutated evidence, and the system here is `src/agents/bmad-tea/SKILL.md`.
Mutating the skill to prove that the eval catches the mutation is an edit to the thing being measured,
so the route is closed rather than unused. The fragment-selection corpora carry the same two classes
for the same reason.

The gameability probe is worth reading, because it is about the scoring the routing suite chose.
A stated reason is scored by token containment, which is cheap and deterministic and gameable: a reply
that quotes the user's own message back as its reason satisfies every deciding token the fixture
names, whatever it then did with the message. That reply is the probe. The oracle that catches it is
the one reading the decision rather than the prose: the menu code for the intents contract, and the
question for the controls contract, where a clarification that names nothing to choose between passes
the reason oracle and asks the user nothing.

## Running them

```bash
npm run test:probe-sources        # are the corpora what their sources generate?
npm run test:probe-corpus         # does every probe score, and does every artifact validate?
npm run eval:preflight            # the live pre-flight, cached, no scoring
npm run eval:contract-strength    # the live pre-flight, then score and seal
```

`npm run test:probe-corpus` is in `npm test`. It runs the whole chain (`runPreflight`, `runScore`,
`seal`) against the outputs `test/replay/` already stores, answered through a port that reads them
off disk, so it needs no credential and makes no paid call. A trace leg is answered with the fixture
set its own prompt names, which is the same rule the live adapter stages by.
`test/probes/expected-strength.json` records what every probe scores, and any movement in either
direction fails the check until somebody has read why and regenerated it with
`node test/test-probe-corpus.js --write`.

The two live scripts run the same code against the real command-line adapter. Every observation is
cached under a digest of the request that produced it, so a rate limit costs one leg and not the set,
and the cache also collapses the legs that are the same request: AD-10 mints two control-observe legs
from the first witness leg's inputs, so eight planned legs cost two runs.

## What each class establishes

- **`defect`**: a planted registry row or a withheld coverage gap. It is a controlled mutation whose
  target artifact, baseline-pass evidence and mutated-fail evidence are all files this repository
  keeps, and its signature states the observable the plant produces.
- **`zero-action` with `expectedClean`**: the clean control. AD-7 keeps it out of the strength vector
  on purpose; what it establishes is that the contract does not fire where there is nothing to find.
- **`gameability`**: the degenerate reply that clears a naive oracle and is rejected by a disciplined
  one. For fragment selection that is a selection naming every fragment in the index, which satisfies
  the containment oracle and violates the exclusion oracle. AD-9's gameability route qualifies a
  response rather than a seeded defect, so these probes declare no defect and owe no manifestation
  witness.

## What the vocabulary cannot say

Recorded here because a silent omission would read as a passing measurement.

**A defect signature cannot address a file a command wrote.** `qualifyProbe` refuses an `artifact`
pointer as `condition-artifact-channel-contract-local`, because an artifact identifier is minted per
contract and a signature carrying one resolves only against the contract it was authored on. A
`stdout` pointer resolves only where the operation declares standard output as its descriptor
channel. `tea-fragment-selection-runner` does, so its signatures qualify and its gameability probes
score. `tea-test-review` and `tea-trace-runner` both write their deliverable to a file, so a
signature that says something true about their plants is refused, and the refusal is recorded in
`expected-strength.json` rather than replaced by an `exit-code` signature that would qualify and
discriminate nothing.

The refusal is now measured per channel rather than asserted. Scoring `trace`'s three defect probes
through `runScore` with each channel in turn, over the same stored evidence: the committed `artifact`
signature is refused as `condition-artifact-channel-contract-local`, a `stdout` signature over the
same field is refused as `condition-pointer-unwritable` because the operation's descriptor channel is
the summary artifact, and an `exit-code` signature is admitted. The admitted one is the one that says
nothing: `cli/lib/runner-exit-codes.js` gives 0 to every run whose agent completed, so a trace run
that wrote a summary full of gaps and the clean control both exit 0 and the condition is true on
both. `tea-test-review` is the case where the exit code does discriminate, and its nine plant probes
carry it. `tea-trace-runner` has no such channel, so its three probes keep the signature that states
the truth about the plant and stay refused, with the reason code recorded per probe.

**A rejected probe now names its reason.** The qualification gate computes a closed list of twenty
reason codes. Through eval-quality 1.3.0 none of them reached the evidence artifact or any published
export, so a rejected probe surfaced only as `infrastructure-error` and an exit code of 3, and a
corpus author had nothing to act on. From 1.4.0 `runScore` returns `qualification` beside the
artifact and the ladder, and `expected-strength.json` records the codes per probe. The reason still
stays off the evidence artifact, which is deliberate: it is a fact about the probe rather than about
the run.

**A seeded fault is scoped only where a leg can ask for the set without it.** `trace`'s three defect
probes failed pre-flight on `seeded-faults-scoped` through eval-quality 1.4.0, and the reducer named
the leg: `D-001: the manifestation witness fires on clean leg "witness-gate-withheld"`. The witness
was right and the leg was not clean. AD-10 reads every other leg of an operation as a clean leg, the
only other legs `trace-fixture-set` had were its two sensitivity witness legs, and both traced the
seeded set, so the plant was in every one of them. The manifestation witness asserts a coverage
number the seeded workspace produces and `allow_gate` does not move, so it fired there truthfully.

The staged workspace was the run's real input and no request could name it, so no leg could ask for a
set without the plant. Each fixture set now declares its own `projectRoot` in
`test/fixtures/trace-eval/ground-truth.json`, `buildPrompt` writes the whole prompt against it, and
both the live adapter and the stored-evidence port stage the set the prompt names. The contract's two
witness legs trace the clean set, where P0 coverage is 100 and the manifestation relation asserting
50 resolves false, so the check is satisfied on evidence rather than on an authored relation. The
`allow_gate` differential is unchanged and holds on either set. The three probes moved from
`preflight: failed: seeded-faults-scoped` to `preflight: passed` in `expected-strength.json`; they
are still refused by the qualification gate, so they still score nothing.

The project roots carry the epic each set traces rather than the set's role. A run that read `clean`
in the directory it works in would have been told the answer, and `validateCorpus` fails a corpus
whose project root names a role.

## What the scoring half reports about the contracts

`runScore` computes AD-20's coverage gaps from the contract itself, and this is the first thing in
this repository to read them. `expected-strength.json` records them per suite under
`unsatisfiedCoverageRules`, and they are findings about the contracts rather than about the runs.
