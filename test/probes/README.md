# Probe Corpora

A contract says what a TEA skill has to do. A probe says what was wrong with the system when the
contract was asked, and `eval-quality`'s `runScore` reads the two together to answer the question the
package exists for: did this contract's oracles catch the defect that was actually there?

| Corpus                                      | Probes | What they are                                                        |
| ------------------------------------------- | -----: | -------------------------------------------------------------------- |
| `test-review.probes.json`                   |     11 | Nine planted registry rows, one clean control, one gameability probe |
| `trace.probes.json`                         |      4 | Three seeded coverage gaps, one clean control                        |
| `fragment-selection/<workflow>.probes.json` |    2x8 | One gameability probe and one clean control per workflow             |

**Every probe here is generated. Do not hand-edit one.** `tools/generate-probes.js` writes all ten
files from the sources this repository already keeps: `test/fixtures/test-review-eval/ground-truth.json`
and `criteria-registry.md` for the planted rows and their severities,
`test/fixtures/trace-eval/ground-truth.json` for the seeded set's coverage gaps, and each
`test/evals/<workflow>/evals.json` for the required and forbidden fragment sets. Regenerate with
`node tools/generate-probes.js`; `npm run test:probe-sources` fails when a file on disk differs from
what its sources generate.

Each probe names the oracle that catches it, through the behavior it declares. `eval-quality`'s
`designatedOracleIdOf` resolves AD-40's designated oracle only for a behavior declaring exactly one
oracle, so `behaviorId` is read out of the generated contract rather than chosen, and the generator
refuses a probe whose behavior discharges more than one. A probe that restates a plant nobody can
detect is worthless, and that check is what keeps one out.

## Running them

```bash
npm run test:probe-sources        # are the corpora what their sources generate?
npm run test:probe-corpus         # does every probe score, and does every artifact validate?
npm run eval:preflight            # the live pre-flight, cached, no scoring
npm run eval:contract-strength    # the live pre-flight, then score and seal
```

`npm run test:probe-corpus` is in `npm test`. It runs the whole chain (`runPreflight`, `runScore`,
`seal`) against the outputs `test/replay/` already stores, answered through a port that reads them
off disk, so it needs no credential and makes no paid call. `test/probes/expected-strength.json`
records what every probe scores, and any movement in either direction fails the check until somebody
has read why and regenerated it with `node test/test-probe-corpus.js --write`.

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

**A rejected probe now names its reason.** The qualification gate computes a closed list of twenty
reason codes. Through eval-quality 1.3.0 none of them reached the evidence artifact or any published
export, so a rejected probe surfaced only as `infrastructure-error` and an exit code of 3, and a
corpus author had nothing to act on. From 1.4.0 `runScore` returns `qualification` beside the
artifact and the ladder, and `expected-strength.json` records the codes per probe. The reason still
stays off the evidence artifact, which is deliberate: it is a fact about the probe rather than about
the run.

## What the scoring half reports about the contracts

`runScore` computes AD-20's coverage gaps from the contract itself, and this is the first thing in
this repository to read them. `expected-strength.json` records them per suite under
`unsatisfiedCoverageRules`, and they are findings about the contracts rather than about the runs.
