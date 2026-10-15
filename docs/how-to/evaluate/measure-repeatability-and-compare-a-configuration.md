---
title: 'How to Measure Repeatability and Compare One Configuration with TEA'
description: Read saved Test Design runs for repeatability, then judge one cheaper configuration against the incumbent from a frozen declaration, without a model call
---

# How to Measure Repeatability and Compare One Configuration with TEA

**Bottom line:** This guide answers two questions from records you already hold. Does an unchanged workflow give the same result when it runs again? When exactly one setting changes (the model, the effort or one prompt region), does the cheaper configuration stay good enough and cost less? The answer is an advisory analysis. **Adoption stays a human decision.**

## Who This Is For

This is an optional tool for TEA maintainers. You run it from a TEA repository checkout as `node test/lib/configuration-experiment.js`. It is not a `tea-evaluate` command, and the Evaluate skill does not prepare its inputs. It works offline on saved records: it makes no model call, runs no workflow and accepts no baseline.

Run every command below from the repository root. The first three read committed fixtures; the last reads the report the paired analysis writes. Field rules, file formats and the full decision order live in the [Configuration Experiment Reader](/docs/reference/configuration-experiment-reader.md) reference.

## 1. Measure Repeatability

Start here. Repeatability needs no candidate and no budget. The committed evidence file points the repeatability declaration at a recorded Test Design run with two cases at two repetitions each:

```bash
node test/lib/configuration-experiment.js analyze test/fixtures/configuration-experiment/baseline-evidence.json --out experiment-output/repeatability
```

The reader writes `experiment-report.md`, `experiment-report.json` and `evidence-index.json` into the `--out` directory. It refuses to overwrite earlier output, so give each run its own directory. For each case the report shows:

- **Success fraction:** completed repetitions that meet `gates.success`, over completed repetitions.
- **Metric spread:** minimum, maximum and range of each metric across repetitions.
- **Native stability:** whether every repetition produced the same native signature, and which signature components differ. A case can succeed every time and still be unstable. In this run both cases are unstable.
- **Scorer replay:** each saved document scored twice. Two identical scorings show the scorer agreed with itself on those saved bytes. A difference from the recorded signature means the scorer's reading changed since the capture.

Read these limits before you quote a number:

- All variability across repetitions comes from the target. None of it is labeled judge noise.
- Runs captured earlier are imported historical evidence. Only a fresh-workspace receipt shows that an attempt generated its document, so this report counts four imported trials and no fresh ones.
- Two cases show instability. They cannot establish noninferiority or population precision.

## 2. Choose One Change

Pick one baseline and one candidate that differ in a single setting: the model, the effort (or one decode setting) or one prompt region. A second difference ends the comparison with `revised-design-required`. Choose the cases, the repeat count, the allowed quality loss, the required saving and the budget now, before you see any candidate result.

Repetitions sharpen the measurement of a case. They never count as extra cases, so the number of cases sets how much the comparison can show.

## 3. Declare Limits and Freeze

Write the declaration. The paired example at `test/fixtures/configuration-experiment/paired-example/experiment.json` lowers the effort from high to medium on the same model and changes nothing else; its full text and every field rule are in the [reference](/docs/reference/configuration-experiment-reader.md#paired-example). Then freeze it:

```bash
node test/lib/configuration-experiment.js freeze test/fixtures/configuration-experiment/paired-example/experiment.json
```

For your own experiment, copy `paired-example/` (or `baseline-evidence.json` and `example-baseline-experiment.json` for a repeatability reading) to a directory of your own, point the evidence file at your own run directories, edit the declaration, and freeze your copy.

Record the printed value as `"frozen": { "digest": "sha256:…" }`. The digest is the SHA-256 of the declaration's canonical JSON without the `frozen` block, so whitespace and key order do not change it and any other edit does. A paired contrast is blocked when the digest no longer matches. The digest carries no time: it cannot show when you froze the plan or that you froze it before seeing results, so commit the frozen declaration before you collect evidence.

## 4. Collect Evidence

The contrast reads a recorded run directory per arm and an exposure ledger, listed in an evidence file such as `test/fixtures/configuration-experiment/paired-example/evidence.json`. Each attempt's `provenance.json` has to carry a fresh-workspace `receipt`, its pairing `blockId`, and the `observed` identity it ran under. It also has to carry its `cost` when `scope.objective` is `cost` or a saving gate is declared, and `latency` under a latency gate.

**Capturing these inputs is manual today.** No TEA runner writes `receipt`, `blockId`, `observed`, `usage`, `cost` or `latency` into `provenance.json`, and nothing outside the tests builds an exposure ledger. You add the fields, build the ledger and regenerate each run's manifest yourself, and you own their truth. There is no supported capture procedure to follow yet. The reference lists [every field](/docs/reference/configuration-experiment-reader.md#a-recorded-run-directory).

A cost that was never recorded stays unknown. It never counts as zero, and an unknown cost that a cost objective or saving gate needs blocks the contrast.

The paired example reuses one recorded run's documents for both arms, with receipts, identities and costs written in by hand. It demonstrates the files and the report, and its numbers are no measurement.

## 5. Analyze

```bash
node test/lib/configuration-experiment.js analyze test/fixtures/configuration-experiment/paired-example/evidence.json --out experiment-output/paired
```

The reader verifies every attempt against its manifest, receipt and saved bytes, scores the bytes again, checks the pairs and their order, then decides. This is the paired section of `experiment-output/paired/experiment-report.md`:

```text
## Paired contrast

Decision: **inconclusive**

- degenerate interval (all cluster contrasts equal) for quality:riskPrecision, quality:scaleComplianceAccuracy, quality:riskLinkResolutionAccuracy, floor:riskPrecision: diagnostic only, not proof of zero uncertainty

Adoption would require explicit human approval of the exact configuration bytes and destination.

| Arm | Attempts | Completed | Errors | Canceled | Task cost | Task latency (ms) |
| --- | --- | --- | --- | --- | --- | --- |
| A | 4 | 4 | 0 | 0 | 1.6 USD | unknown |
| B | 4 | 4 | 0 | 0 | 0.5 USD | unknown |

| Gate | Threshold | Lower bound | Result |
| --- | --- | --- | --- |
| quality:riskPrecision | -0.05 | 0 | clears |
| quality:scaleComplianceAccuracy | -0.05 | 0 | clears |
| quality:riskLinkResolutionAccuracy | -0.05 | 0 | clears |
| floor:riskPrecision | 0 | 0.2 | clears |
| saving | 0 | 0.125 | clears |
```

Each quality row compares the lower bound of candidate minus baseline with the negative of its `gates.quality.<metric>.maxLoss`. The floor row shows the margin above the declared floor, and the saving row is the contrast `(1 - minFraction) * baseline cost - candidate cost`, which has to stay above zero.

Every bound clears, and the decision is still `inconclusive`. Both arms hold the same documents, so every case shows the same quality difference and the interval has no width. The reader treats that as too little evidence to decide. The saving clears because the hand-written costs differ.

The decision is one of these outcomes:

| Outcome                   | What it means                                                                                                                            | What you do next                                                                                                                                                                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `blocked`                 | The declaration is incomplete or unfrozen, or the evidence is missing, unverifiable, unpaired or out of order. The reasons name each gap | Fix what the reasons name and analyze into a new directory                                                                                                                                                                                                          |
| `new-baseline-required`   | Something both arms should share changed: task, ground truth, rubric, scorer, thresholds, or an arm's own identity                       | Measure the baseline again under the current identity and declare a new experiment                                                                                                                                                                                  |
| `revised-design-required` | More than the declared setting differs, or the declared setting did not change everywhere it has to                                      | Redesign so exactly one setting changes, and freeze a new declaration                                                                                                                                                                                               |
| `rejected`                | A verified candidate critical miss, or a binding native gate that is red. Savings never override it                                      | Drop the candidate                                                                                                                                                                                                                                                  |
| `descriptive-only`        | The design is unsupported, for example unequal case weights or cases that share a generated build                                        | Read the numbers as description; redesign with equal, independent cases to get a decision                                                                                                                                                                           |
| `inconclusive`            | Too few cases, an interval with no width, an uncalibrated bootstrap, or a lower bound that misses its threshold                          | Too few cases or a missed bound: add cases and run again. No width: the cases need to differ, because identical results give no measure of uncertainty. Uncalibrated bootstrap: the reader's statistics need repair before any decision. None of these shows a loss |
| `aa-control`              | Both arms have the same configuration                                                                                                    | Use it as a noise check; declare a real change to compare                                                                                                                                                                                                           |
| `selection-cleared`       | Every gate clears on the selection cases                                                                                                 | Freeze a confirmation on cases the candidate has never seen                                                                                                                                                                                                         |
| `recommend`               | Every gate clears on untouched confirmation cases                                                                                        | Review the exact configuration and approve or decline it by hand                                                                                                                                                                                                    |

## 6. Confirm on Untouched Cases

A selection that clears earns a confirmation; only a confirmation on cases the candidate has never seen can return `recommend`. Print the digest of the selection report:

```bash
node test/lib/configuration-experiment.js digest experiment-output/paired/experiment-report.json
```

The example's selection is `inconclusive`, so it cannot go on to confirmation. With a `selection-cleared` report, pin that digest and the selection declaration's digest in the confirmation declaration, point its evidence file at the selection evidence, and analyze. The confirmation may change only its stage, its cases and their clusters, its ledger pin and these two pins. The [reference](/docs/reference/configuration-experiment-reader.md#confirmation-pins) lists the rules.

## 7. Approve by Hand

`recommend` names a configuration and carries no authority. The reader applies no patch, accepts no baseline and records no native verdict. A maintainer reviews the exact configuration bytes and where they go, then adopts or declines them.

## Related

- [Configuration Experiment Reader](/docs/reference/configuration-experiment-reader.md): commands, fields, rules and the full decision order
- [How to Compare Runs and Accept a Baseline](/docs/how-to/evaluate/compare-runs-and-accept-a-baseline.md): native comparison and baseline acceptance
- [How to Choose an Evaluator and Calibrate a Judge](/docs/how-to/evaluate/choose-an-evaluator-and-calibrate-a-judge.md): judge calibration against labels
- [How Evaluate Works](/docs/explanation/how-evaluate-works.md): qualification, held-out probes and the limits of a pass
