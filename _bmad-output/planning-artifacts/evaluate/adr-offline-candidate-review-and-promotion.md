---
name: Offline candidate review and promotion
type: adr
status: accepted
created: 2026-10-14
scope: Evaluate discovery lane, features F03 and F14 of the Evaluate discovery plan, third slice
binds: [AD-8, AD-9, AD-22]
sources: [adr-exploratory-candidate-contract.md, adr-offline-prompt-candidate-generator.md]
---

# ADR: Offline candidate review and promotion

## Context

The first slice defined the candidate record and its boundary, the second slice generates candidates. This slice closes the offline loop: a candidate that ran is classified from the evidence it retained, a person reviews it, a confirmed one is promoted to a draft native mutation, and a report shows every candidate and every stop. The code is `cli/lib/evaluate/discovery/review.js` and `report.js`, library entry points with no command, because the first slice reserved none and a `discover` command group has to wait for a slice that runs candidates.

The plan asks for F03 at its minimum (independently supported classification, explicit uncertainty, an identity-bound decision, draft promotion) and F14 at its basic level (a candidate evidence and decision projection). Nothing here waives a risk, accepts a baseline or calls a model.

## Decision

`classifyCandidate(record, {evidence, reference, referencePath})` reads the bytes of each observation's retained evidence file and, when the outputs of the two arms differ, the bytes of an independent reference. It returns a candidate disposition and the reasons for it. The disposition is a suggestion and decides nothing.

- `target-error`: an arm recorded errors and no completed trial.
- `undetermined`: an arm is short of its planned trials; an evidence file is absent, no longer digests to what the record retained, or disagrees with the recorded counts; the baseline varies between trials; the arms ran different inputs; the outputs differ and no reference says which is right; the reference does not label a differing input; or the baseline itself departs from the reference, so the difference is not attributable to the edit. One departing trial among missing ones is `undetermined`.
- `observationally-unchanged`: every sampled input produced the same output on both arms. The reasons say that an unsampled input may still differ.
- `confirmed-undesirable-missed` and `confirmed-undesirable-caught`: the candidate arm departs from the reference where the baseline matches it. The evaluator's recorded verdict on each departing trial separates the two: it passed at least one (missed) or failed every one (caught).

The evidence file is `{arm, trials: [{trial, input, status, output, evaluator, error}]}` at `discovery/<campaignId>/evidence/<candidateId>.<observationId>.json`, and its digest is the observation's `evidence`. Outputs are an independently defined behavioral projection of the target (a count, a field, a code), compared as exact strings. A free-text output has to be projected before it is recorded, since the classifier infers no semantic equivalence. Both files are read as strict UTF-8 JSON and refused when an object states a key twice. The reference is `{kind, reference, cases: {input: expected output}}`, kept as a snapshot at `discovery/<campaignId>/evidence/<file>`, and is recorded as the candidate's independent evidence under that path with its own digest (a reference kept anywhere else classifies as undetermined), which the first slice's reader already holds apart from the requirement, the target and every observation.

`settleCandidate` stores the stops the evidence settles alone (`target-error`, `undetermined`) on an observed record, so they stay in the record and the report. `reviewCandidate` records a person's decision. A confirmed or unchanged conclusion is accepted only where the classification says the same; `undetermined` and `inapplicable` can always be chosen; an errored run cannot be reviewed. The review scope is `decisionScope` of the first slice: identity, determination and the observations the decision rested on.

`promoteCandidate(folder, relative, referencePath)` reads the stored record through `readCandidate`, accepts only a reviewed record with a confirmed conclusion, classifies the retained evidence and the reference again so that evidence lost or altered since the review ends the promotion, and returns the promoted record, the draft from `draftMutation` and the files to write, with the next free `M-NNN` as the draft ID. The promotion holds no qualification receipt. `applyPromotion` stages the record, creates the draft with exclusive create and replaces the record, and refuses when the stored record is no longer the one the promotion was computed from, checked again just before the swap, or when a cited evidence snapshot no longer digests to the recorded value. A failure at any step removes what it created. Authoring the probe and the oracle that demonstrate the defect, and the native check, seal, qualification and scoring, stay with the person and the native tools. The test runs the real `tea-evaluate check` over the draft with an authored probe; qualification itself needs a live workspace and is not run offline.

`readCampaign`, `projectCampaign` and `renderCampaign` build the projection. Each candidate file has a row, and a file the reader refuses is an unreadable entry with its problems, printed in the native finding shape. The totals count states, dispositions, planned, completed, errored and missing trials, accepted risks, promotions pending a native qualification and promotions with a receipt. The report is marked advisory and carries no score, verdict or outcome. Free text goes through the escaping `tea-evaluate` applies to its findings.

The module boundary of the first slice gains one allowed load, `finding-lines.js`, a pure printer.

Chosen conventionally: the labeled fixture is the red-phase generation step with a hand-counted reference; the reviewer is a repository maintainer; classification compares exact output strings, since a semantic comparison would need a judge, which is not independent evidence.

## What fails if this is reverted

| Claim                                                                  | What fails                                                                                                                  |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| A real seeded gap and a harmless edit classify differently             | `checkClassification` holds each scenario of the labeled fixture to its label                                               |
| Errored, short, lost, altered and unlabeled evidence never confirms    | `checkClassification` variants, `checkReview` refusals                                                                      |
| A review needs supporting evidence and binds to what it rested on      | `checkReview`                                                                                                               |
| Promotion keeps no receipt and writes only a native draft              | `checkPromotion`, which runs `checkEvaluation` and the `tea-evaluate check` binary over the draft with an authored probe    |
| A shortcut to a qualified probe is refused                             | `checkPromotion` plants a probe and a draft that claim a qualification, and a record that claims a receipt the folder lacks |
| Rejected, missing, errored and unreadable evidence stays in the report | `checkReport` counts every candidate file against the rows, the trial totals and the text                                   |
| A waived risk and a pending qualification stay visible                 | `checkReport`                                                                                                               |
| Report text cannot forge a line                                        | `checkHostileText`                                                                                                          |
| The candidate code reaches no scoring module                           | `discovery-import` in `test/test-evaluate-boundaries.js`                                                                    |
