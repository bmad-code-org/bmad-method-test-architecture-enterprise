---
title: 'How to Measure Repeatability and Compare One Configuration with TEA'
description: Read saved Test Design runs for repeatability, then judge one cheaper configuration against the incumbent from a frozen declaration, without a model call
---

# How to Measure Repeatability and Compare One Configuration with TEA

**Bottom line:** Use this guide to ask two questions of evidence you already hold. First, does an unchanged workflow produce the same result when it runs again? Second, when exactly one factor changes (the model, the effort setting or one prompt region), does the cheaper configuration stay good enough and cost less? The reader works offline on saved records. It makes no model call, runs no workflow and never accepts a baseline. **Its output is an advisory analysis. Adoption stays a human decision.**

## What the Reader Does

The reader is `test/lib/configuration-experiment.js` in a TEA repository checkout. It has no `tea-*` command of its own and leaves normal Evaluate runs and verdicts unchanged.

| You give it                                      | It returns                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| A frozen `experiment.json` declaration           | Whether the declaration is complete and unchanged since freezing     |
| Saved Test Design runs or your own evidence rows | Per-case success fractions, metric spread and native stability       |
| The saved documents                              | A replay of the deterministic scorer, kept apart from the native run |
| A second arm and a declared changed factor       | A paired contrast with explicit gates and a decision                 |

It writes three files: `experiment-report.json`, `experiment-report.md` and `evidence-index.json`. The index has one row per attempt. Failed, canceled, invalid and retried attempts stay in it. Every aggregate in the report lists the attempts it came from, and the index holds each of them.

## 1. Read What You Already Have

Start with repeatability. It needs no candidate and no budget. Declare the baseline once, freeze it and point the reader at the saved runs.

This declaration matches the two recorded Test Design runs in `test/results/codex-test-design/raw/`:

```json
{
  "schemaVersion": "1.0.0",
  "experimentId": "test-design-baseline-repeatability",
  "stage": "baseline",
  "scope": {
    "workflow": "bmad-tea-test-design",
    "owner": "TEA maintainers",
    "claim": "fixed-suite",
    "judge": "none",
    "objective": "repeatability",
    "baseline": {
      "id": "incumbent",
      "description": "The Test Design workflow as installed, unchanged."
    },
    "candidate": null,
    "changedFactor": null,
    "memberships": {
      "development": ["seeded-offline-order-capture", "clean-last-sync-indicator"],
      "validation": [],
      "confirmation": []
    },
    "clusters": [
      {
        "caseId": "seeded-offline-order-capture",
        "clusterId": "seeded-offline-order-capture",
        "weight": 0.5
      },
      {
        "caseId": "clean-last-sync-indicator",
        "clusterId": "clean-last-sync-indicator",
        "weight": 0.5
      }
    ]
  },
  "identity": {
    "fixed": {
      "suiteDigest": "sha256:56e7e6dd92b0e73a93d88f4211ae8cf7aa530de38dfc26bc6505302e0a0d3b1b",
      "promptDigest": "sha256:e114e910f40d0ffe4b4594c7b6ba27d301ea95a480cd988acba6bd6dfe894c9f",
      "groundTruthDigest": "record the digest of test/fixtures/test-design-eval/ground-truth.json",
      "scorerDigest": "record the digest of test/eval-test-design.js",
      "thresholdsDigest": "record the digest of the suite thresholds",
      "rubricDigest": "not-applicable"
    }
  },
  "design": {
    "repeats": 2,
    "order": "interleaved",
    "isolation": "fresh staged workspace per attempt",
    "maxAttempts": 1,
    "stoppingRule": "fixed repeat schedule"
  },
  "gates": {
    "success": {
      "metrics": {
        "groundedRiskRecall": 0.8,
        "riskPrecision": 0.8,
        "scaleComplianceAccuracy": 1,
        "scoreArithmeticAccuracy": 1,
        "categoryValidityAccuracy": 1,
        "bandPlacementAccuracy": 1,
        "riskIdWellFormedAccuracy": 1,
        "riskLinkResolutionAccuracy": 1,
        "priorityOrderingAccuracy": 1,
        "coverageMappingAccuracy": 0.8
      }
    },
    "critical": {
      "tolerance": 0,
      "rules": [
        {
          "id": "top-severity-risk-missed",
          "count": "topSeverityMissed"
        },
        {
          "id": "ungrounded-risk-reported",
          "count": "ungroundedRisks"
        }
      ]
    }
  },
  "resources": {
    "authorization": null
  }
}
```

Freeze it by recording the digest of its bytes:

```bash
node test/lib/configuration-experiment.js freeze experiment.json
```

Add the printed value as `"frozen": { "digest": "sha256:…" }`. Any later edit changes the digest. The report then marks the digest as not matching, and a paired contrast is blocked. A declaration without a candidate gives the repeatability reading alone, so freezing is optional there. A paired contrast needs it.

Describe the saved material in an evidence file. Relative paths resolve against the evidence file:

```json
{
  "declaration": "experiment.json",
  "recordedRuns": [
    { "kind": "test-design", "dir": "test/results/codex-test-design/raw/two-run-before-numeric", "arm": "A", "stage": "baseline" }
  ]
}
```

Run the reader into a new directory. It never overwrites earlier outputs, and it stops if a recorded run no longer matches its manifest hashes:

```bash
node test/lib/configuration-experiment.js analyze evidence.json --out experiment-output
```

## 2. Read the Repeatability Report

For each case the report shows:

- **Success fraction.** Completed repetitions that meet the declared success rule, divided by completed repetitions. The rule is `gates.success`: every listed metric at or above its minimum, and no critical miss.
- **Metric spread.** The minimum, maximum and range of each metric across repetitions. A metric with no denominator for a case (recall on a case with no seeded risks) is not applicable there and is left out.
- **Native stability.** Whether every repetition signed the same under the suite's own stability signature, as the loaded native records hold it. A row without a loaded record has no known signature. When they differ, the report names the signature components that differ. A case can have a success fraction of 1 and still be unstable.
- **Scorer replay.** The saved documents run twice through the deterministic scorer. Two identical runs show the scorer is deterministic. A difference from the recorded signature means the scorer changed since the capture. The replay is its own result and the native record stays as recorded.

Read these limits before you quote a number:

- Runs captured earlier are imported historical evidence. A recorded workspace path is provenance. Only a fresh-workspace receipt shows that an attempt generated its deliverable, so imported runs are never counted as fresh trials.
- Total variability across repetitions comes from the target. None of it is labeled judge noise.
- Test Design scores with a parser, so judge variance is not applicable. A workflow that uses a rubric judge supplies repeated judgments of one frozen output, and the report then shows disagreement, missing verdicts and validity on labeled good and bad controls. A judge that is stable and wrong is invalid.
- Two exposed cases show instability. They cannot establish noninferiority or population precision.

## 3. Compare One Configuration

Run the contrast only when you have chosen a baseline, one candidate, the cases, the repeat count, the tolerances and the budget. Declaring them is a human decision made before any data is examined. This example shows the full shape:

```json
{
  "schemaVersion": "1.0.0",
  "experimentId": "test-design-cheaper-model",
  "stage": "selection",
  "scope": {
    "workflow": "bmad-tea-test-design",
    "owner": "TEA maintainers",
    "claim": "fixed-suite",
    "judge": "none",
    "objective": "cost",
    "baseline": {
      "id": "incumbent",
      "description": "The Test Design workflow on the incumbent model at high effort."
    },
    "candidate": {
      "id": "cheaper-model-v1",
      "description": "The same workflow on one cheaper model at high effort."
    },
    "changedFactor": {
      "kind": "model",
      "setting": "model",
      "detail": "incumbent model to cheaper model; nothing else differs"
    },
    "memberships": {
      "development": ["seeded-offline-order-capture", "clean-last-sync-indicator"],
      "validation": ["validation-case-1", "validation-case-2"],
      "confirmation": ["confirmation-case-1", "confirmation-case-2", "confirmation-case-3", "confirmation-case-4"]
    },
    "clusters": [
      {
        "caseId": "seeded-offline-order-capture",
        "clusterId": "seeded-offline-order-capture",
        "weight": 0.25
      },
      {
        "caseId": "clean-last-sync-indicator",
        "clusterId": "clean-last-sync-indicator",
        "weight": 0.25
      },
      {
        "caseId": "validation-case-1",
        "clusterId": "validation-case-1",
        "weight": 0.25
      },
      {
        "caseId": "validation-case-2",
        "clusterId": "validation-case-2",
        "weight": 0.25
      }
    ]
  },
  "identity": {
    "fixed": {
      "suiteDigest": "record the digest of the suite manifest entry",
      "fixtureDigest": "record the digest of the staged fixtures",
      "groundTruthDigest": "record the digest of test/fixtures/test-design-eval/ground-truth.json",
      "scorerDigest": "record the digest of test/eval-test-design.js",
      "thresholdsDigest": "record the digest of the suite thresholds",
      "rubricDigest": "not-applicable",
      "promptDigest": "record the digest of the task prompts",
      "sourcePins": {
        "tea": "record the TEA commit",
        "evalQuality": "record the eval-quality version"
      },
      "environment": {
        "runner": "record the runner and its version",
        "cacheRegime": "cold cache on every attempt"
      }
    },
    "arms": {
      "A": {
        "model": {
          "requested": "incumbent-model-id",
          "resolved": "record the model id the provider reports"
        },
        "effort": {
          "requested": "high",
          "applied": "record the effort the provider applied"
        },
        "decode": {
          "temperature": "record the applied setting"
        },
        "promptDigest": "record the digest of the target package prompt"
      },
      "B": {
        "model": {
          "requested": "cheaper-model-id",
          "resolved": "record the model id the provider reports for the cheaper model"
        },
        "effort": {
          "requested": "high",
          "applied": "record the effort the provider applied"
        },
        "decode": {
          "temperature": "record the applied setting"
        },
        "promptDigest": "record the digest of the target package prompt"
      }
    }
  },
  "design": {
    "repeats": 3,
    "order": "interleaved",
    "isolation": "fresh staged workspace per attempt; every deliverable regenerated",
    "maxAttempts": 2,
    "stoppingRule": "fixed repeat schedule; no early stop",
    "failureRules": {
      "timeout": "incomplete"
    },
    "analysis": {
      "alpha": 0.05,
      "B": 10000,
      "seed": 20261014,
      "prng": "mulberry32",
      "quantile": "linear",
      "simultaneous": true
    }
  },
  "gates": {
    "success": {
      "metrics": {
        "groundedRiskRecall": 0.8,
        "riskPrecision": 0.8,
        "scaleComplianceAccuracy": 1,
        "scoreArithmeticAccuracy": 1,
        "categoryValidityAccuracy": 1,
        "bandPlacementAccuracy": 1,
        "riskIdWellFormedAccuracy": 1,
        "riskLinkResolutionAccuracy": 1,
        "priorityOrderingAccuracy": 1,
        "coverageMappingAccuracy": 0.8
      }
    },
    "quality": {
      "riskPrecision": {
        "maxLoss": 0.05
      },
      "scaleComplianceAccuracy": {
        "maxLoss": 0.05
      },
      "riskLinkResolutionAccuracy": {
        "maxLoss": 0.05
      }
    },
    "floors": {
      "riskPrecision": 0.8
    },
    "saving": {
      "minFraction": 0.25
    },
    "critical": {
      "tolerance": 0,
      "rules": [
        {
          "id": "top-severity-risk-missed",
          "count": "topSeverityMissed"
        },
        {
          "id": "ungrounded-risk-reported",
          "count": "ungroundedRisks"
        }
      ]
    }
  },
  "resources": {
    "authorization": null,
    "overhead": []
  },
  "frozen": {
    "digest": "sha256:3b5d6173637dc1c24cf7123dea4fbe97b7c0ed30c1205d00f43c480da2fc90ec"
  }
}
```

`resources.authorization: null` means no live execution is authorized. The reader never runs anything either way.

The contrast needs all of the following, and names whatever is missing:

- A frozen declaration whose digest matches.
- Identity for both arms and for everything that stays fixed, including a `cacheRegime` leaf in `identity.fixed` for the cache policy both arms run under. An unknown applied setting blocks the contrast.
- Exactly one changed setting, named in `scope.changedFactor.setting`:

  | Factor   | Setting                | What has to change together                              |
  | -------- | ---------------------- | -------------------------------------------------------- |
  | `model`  | `model`                | The requested model and the model the provider resolved  |
  | `effort` | `effort`               | The requested effort and the effort the provider applied |
  | `effort` | `decode.<name>`        | That one decode leaf                                     |
  | `prompt` | `promptRegions.<name>` | That one prompt region and the whole `promptDigest`      |

  Any other difference, a second decode leaf or a second prompt region included, stops the contrast with `revised-design-required`. So does a requested change the resolved or applied identity does not show.

- Evidence rows that record the identity they ran under. A changed task, ground truth, rubric, scorer or threshold, or an arm that differs from its declaration, ends in `new-baseline-required`.
- Verified evidence on every attempt, failed, canceled and retried ones included. A receipt and a row's numbers are claims until the reader checks them against a native record. The records come from run directories the reader loads and checks against their `manifest.json`: the evidence file lists them under `recordedRuns` or `nativeRuns`, every file the reader takes from a run has to be listed in its manifest, a run that fails its manifest yields no records, and two runs that hold different records under one reference are refused. A record holds the run's attempt identity, input hash (of its `prompt.txt`), output hash, signature, and qualification (`passed` for failure class `none`, `failed` for any other class, unknown when none is recorded). It also holds what the runner recorded for the attempt in `provenance.json`: `receipt` (with ISO 8601 `startedAt` and `endedAt` in order), `blockId`, `observed`, `usage`, `cost` and `latency`. Without a recorded `observed` identity the record holds what `result.json` shows, and a field the runner did not record is null, so a row that states it does not match. Every row names its record in `native.ref`, pins its run's manifest digest in `native.manifestSha256`, and repeats the record's case, repetition, `attempt` number, status, hashes, receipt, block, observed identity, usage, cost and latency, and any `signature` or `qualification` it states. The row also names its stage. Within a pair's arm the `attempt` numbers run 1, 2, and so on without a gap or a repeat; a row without one blocks. A row that completed or claims an artifact also carries the saved bytes in `outputText`; they hash to `outputSha256` and to the receipt's `artifactSha256`, and the deterministic scorer, run again over them, reproduces every required metric and every critical count on the row. An attempt that saved nothing records no output hash and no `artifactSha256`. The native gates (`gates.native.requireQualification`, `requireStableSignatures`) read the records of verified attempts, and a missing verdict or signature blocks. The evidence index marks each attempt `verified` or `claimed`, lists what failed, and names the source of its record. A claimed attempt blocks the contrast. A candidate attempt left out of this stage blocks it too, unless it is labeled with the other paired stage and sits on that stage's own cases. For a Test Design declaration the command line supplies the scorer. A caller of `readExperiment` passes it as `replay`, and passes as `nativeRecords` the records `loadRecordedTestDesignRun` returns; an object built any other way is no native record. The Test Design scorer reads documents, so it cannot see fixture mutations in the workspace: a `fixtureMutations` critical rule stays claimed and blocks.
- A complete pair for each planned case and repetition, with both arms in one pairing block named by `blockId`. A block holds one pair, and the pair's retries belong to it. The receipts' start times are the recorded dispatch order: every attempt of a block starts strictly before the next block's first attempt, and an `interleaved` schedule starts the two arms of a pair at different times. Equal start times across blocks show no order. A missing block, a block shared by two pairs, a pair split across blocks or an order off the declared schedule blocks the contrast. An attempt for a repetition the schedule does not plan blocks it too, and its charge stays in the cost totals.
- Every critical count recorded as a nonnegative integer on every completed candidate attempt. A missing, negative or fractional count is unknown and blocks, and a row's `notApplicable` list cannot excuse it. A retry or failed attempt that saved an artifact is scored again like any other, so its counts have to match what its bytes show, and a negative or fractional count on any attempt blocks. Required metrics are recorded on every attempt. A required metric has to apply to every case, so gate on metrics that are defined for all of them.
- All-in task cost for both arms when the objective is cost or a saving gate is declared, with `gates.saving.minFraction` in (0, 1). `resources.costScope.taskExecution` has to include `target` and `tools` and may add components. The judge scope counts only with a rubric judge and names no task component. A charged component in neither scope blocks the contrast, so no charge drops out of the saving gate.
- Required metrics are rates in [0, 1]; a value outside that range on any attempt blocks, and an allowed `maxLoss` stays below 1. A timeout scored as a failure (`design.failureRules.timeout: "failure"`) takes `failureMetricValue: 0`, the worst outcome on that scale, and every success minimum is then above 0. A candidate that completes no attempt at all blocks.
- An exposure ledger that records which cases the candidate has seen. A confirmation declaration pins the ledger head it was frozen against in `exposure.ledgerHeadAtFreeze`, and a ledger that no longer extends that head is refused. A confirmation case that was exposed during selection, or used to confirm another candidate, is refused. A selection case that already served as confirmation is refused too.

### Confirmation

A confirmation runs only for a candidate whose selection cleared. Its declaration pins the frozen selection declaration in `selection.declarationDigest` (the value `freeze` printed) and the `selection-cleared` report the selection analysis wrote in `selection.reportDigest`:

```bash
node test/lib/configuration-experiment.js digest selection-output/experiment-report.json
```

The confirmation's evidence file names the selection's evidence file, as `"selection": "selection-evidence.json"`. The reader reads the selection again from that evidence, with the same scorer, and the report it gets has to match the pinned digest and read `selection-cleared`; an edited report never matches. A confirmation may change its stage, its confirmation cases and their clusters, its ledger pin and these two pins. Every other field stays as selection froze it: the candidate, the baseline, the identities, the gates and margins, the design and analysis, and the cost rules. Missing selection evidence, evidence that does not reproduce the pinned report, a selection that did not clear, or any other change blocks the confirmation. The ledger head the selection report recorded has to still be in the ledger.

### The estimator

Each case is one cluster. The reader averages a cluster's repetitions within each arm, takes the paired difference (candidate minus baseline), and resamples whole clusters with replacement. Alpha, the resample count, the seed, the generator and the quantile convention are declared and frozen. The same draws serve every metric and the cost contrast. Repetitions improve the measurement of a case and never count as extra cases. Unequal weights and clusters that share a generated build stay descriptive-only. Before any bound can support a decision, the bootstrap must reproduce its reference fixtures, and the report says whether it did.

### The decision

Gates are checked in this order, and the first that applies decides:

1. An unusable or unfrozen declaration is `blocked`, and so is a confirmation without its pinned `selection-cleared` report.
2. A changed measurement identity is `new-baseline-required`. An undeclared second change, or a declared setting that does not change on every identity it has to, is `revised-design-required`.
3. A verified candidate critical miss is `rejected`, whatever the averages and costs say.
4. A declared binding native gate that is red is `rejected`.
5. Claimed evidence the reader cannot verify, an unverified critical miss, an unrecorded critical count, incomplete pairs, missing pairing blocks, a dispatch order off the declared schedule, unknown or unclassified required cost, unknown latency under a latency gate, non-finite data or an unusable ledger are `blocked`.
6. An unsupported design is `descriptive-only`.
7. Too few clusters, a degenerate interval or an uncalibrated bootstrap is `inconclusive`.
8. Every required lower bound must strictly exceed its threshold: the quality bound above the negative of the allowed loss, the saving bound above zero for the contrast `(1 - minFraction) * baseline cost - candidate cost`, so a candidate has to cost less than the baseline by more than the declared `gates.saving.minFraction`, each absolute floor and any latency limit. Equality does not pass. A failed bound is `inconclusive`, because failing to show noninferiority is not proof of loss.

A passing selection run reports `selection-cleared`. Only a confirmation on untouched cases reports `recommend`. A recommendation names a configuration and carries no authority. It applies no patch, accepts no baseline and carries no native verdict.

## Cost and Latency

The report lists task-execution cost, judge cost and total experiment cost separately. Retries, canceled and failed attempts stay in the totals. A component that is not recorded is unknown, and one unknown component makes its total unknown. Tokens become money only through a complete price sheet in `resources.pricing` over complete usage. Overhead outside the attempts (preflight, calibration, diagnostics) is declared in `resources.overhead`. Recorded Test Design runs carry no usage, so they can show repeatability and no saving. Under a declared latency gate, unknown or negative task latency blocks the contrast.

## How You Know It Worked

The Markdown report opens with the decision and its reasons. The JSON report carries the same fields, the declaration digest, the schema and analysis versions, the denominator reconciliation, every exclusion and the source limitations.

## Related Guides

- [How to Compare Runs and Accept a Baseline](/docs/how-to/evaluate/compare-runs-and-accept-a-baseline.md): Native comparison and baseline acceptance
- [How to Choose an Evaluator and Calibrate a Judge](/docs/how-to/evaluate/choose-an-evaluator-and-calibrate-a-judge.md): Judge calibration against labels

## Reference

- [How Evaluate Works](/docs/explanation/how-evaluate-works.md): Qualification, held-out probes and the limits of a pass
