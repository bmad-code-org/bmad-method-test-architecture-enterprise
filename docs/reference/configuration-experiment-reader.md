---
title: 'Configuration Experiment Reader'
description: Commands, declaration and evidence fields, verification and pairing rules, decision order and report fields of the offline repeatability and configuration-comparison reader
---

# Configuration Experiment Reader

The reader is `test/lib/configuration-experiment.js` in a TEA repository checkout. It is an optional maintainer tool with no `tea-*` command of its own. `tea-evaluate` does not run it, and the Evaluate skill does not prepare its inputs. It reads saved records offline: it makes no model call, runs no workflow and accepts no baseline. Its output is an advisory analysis.

For the task flow, read [How to Measure Repeatability and Compare a Configuration](/docs/how-to/evaluate/measure-repeatability-and-compare-a-configuration.md). This page is the lookup for its commands, files and rules.

## Commands

Run every command from the repository root.

```bash
node test/lib/configuration-experiment.js freeze <declaration.json>
node test/lib/configuration-experiment.js digest <experiment-report.json>
node test/lib/configuration-experiment.js analyze <evidence.json> --out <directory>
```

| Command   | Prints or writes                                                                            | Exit codes                                                                                                                                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `freeze`  | The declaration digest, `sha256:<hex>`                                                      | `0` printed; `1` the file cannot be read or parsed; `2` no file named (usage)                                                                                                                                                                |
| `digest`  | The digest of a saved `experiment-report.json`, which a confirmation pins                   | `0` printed; `1` the file cannot be read or parsed; `2` no file named (usage)                                                                                                                                                                |
| `analyze` | `experiment-report.json`, `experiment-report.md` and `evidence-index.json` in `<directory>` | `0` written; `1` a file cannot be read or parsed, a recorded run fails its manifest, an output file already exists, or any other error; `2` no evidence file or no `--out` (usage), or an evidence `selection` that is not a nonempty string |

`analyze` never overwrites an output file and writes nothing when a recorded run fails its manifest. Every command exits `1` on any error it throws.

### The declaration digest

`freeze` prints the SHA-256 of the declaration's canonical JSON with the top-level `frozen` block removed. Canonical JSON sorts the keys of every object, drops keys whose value is undefined and carries no whitespace. Reformatting the file or reordering its keys leaves the digest unchanged. Any change to a value, a key or the order of an array changes it.

Record the printed value as `"frozen": { "digest": "sha256:…" }`. Each later read recomputes the digest and compares it with the recorded one, so any edit after that point shows as a mismatch, and a mismatch blocks a paired contrast. The digest carries no time. It does not show when the plan was frozen, or that it was frozen before any result was seen. Record that order yourself, for example by committing the frozen declaration before you collect evidence.

`digest` prints the SHA-256 of the canonical JSON of a whole report file.

## The Declaration

A declaration states the experiment before any data is examined. The paired contrast checks every field marked paired; a repeatability reading needs only the general ones.

| Field                                                                       | Needed for   | Rule                                                                                                                                                                                                     |
| --------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`                                                             | general      | `1.0.0`                                                                                                                                                                                                  |
| `experimentId`                                                              | general      | Any nonempty name                                                                                                                                                                                        |
| `stage`                                                                     | general      | `baseline` reads the development cases; `selection` reads development and validation cases; `confirmation` reads confirmation cases. A contrast runs in the last two                                     |
| `scope.workflow`, `scope.owner`                                             | general      | Nonempty                                                                                                                                                                                                 |
| `scope.claim`                                                               | general      | `fixed-suite` or `population`                                                                                                                                                                            |
| `scope.judge`                                                               | general      | `none` for a deterministic scorer, `rubric` for a rubric judge                                                                                                                                           |
| `scope.baseline.id`                                                         | general      | Nonempty                                                                                                                                                                                                 |
| `scope.memberships`                                                         | general      | `development`, `validation` and `confirmation` case lists. A case sits in one list only, and the stage needs at least one case                                                                           |
| `identity.fixed`                                                            | general      | Everything both arms share                                                                                                                                                                               |
| `design.repeats`                                                            | general      | Integer from 1 to 1000                                                                                                                                                                                   |
| `gates.success.metrics`                                                     | general      | Minimum per metric; a repetition succeeds when every listed metric meets its minimum and no critical miss occurs                                                                                         |
| `scope.objective`                                                           | general      | `repeatability` in a repeatability declaration; `cost` or `quality` for a paired contrast                                                                                                                |
| `scope.candidate.id`                                                        | paired       | Nonempty. `scope.candidate` is `null` in a repeatability declaration                                                                                                                                     |
| `scope.changedFactor`                                                       | paired       | `kind` (`model`, `effort` or `prompt`), `setting` from the factor table below, and a free-text `detail`. `null` in a repeatability declaration                                                           |
| `scope.clusters`                                                            | paired       | One `{ caseId, clusterId, weight }` per stage case, nonnegative weights summing to 1. Cases may share a `clusterId`, and the reader then averages them equally inside the cluster                        |
| `identity.fixed.*Digest`                                                    | paired       | `suiteDigest`, `groundTruthDigest`, `scorerDigest`, `thresholdsDigest` and `rubricDigest`; write `not-applicable` where nothing applies                                                                  |
| `identity.fixed.<path>.cacheRegime`                                         | paired       | One cache-policy leaf anywhere under `identity.fixed`, such as `identity.fixed.environment.cacheRegime`: the cache policy both arms run under                                                            |
| `identity.arms.A`, `identity.arms.B`                                        | paired       | `model.requested`, `model.resolved`, `effort.requested` and `effort.applied`; optional `decode.<name>`, `promptRegions.<name>` and `promptDigest`                                                        |
| `design.order`                                                              | paired       | `interleaved` or `randomized`                                                                                                                                                                            |
| `design.isolation`, `design.stoppingRule`                                   | paired       | Nonempty text                                                                                                                                                                                            |
| `design.maxAttempts`                                                        | paired       | Positive integer                                                                                                                                                                                         |
| `design.failureRules.timeout`                                               | paired       | `incomplete`, or `failure` with `failureMetricValue: 0` and every success minimum above 0                                                                                                                |
| `design.analysis`                                                           | paired       | `alpha` in (0, 0.5), `B` from 1000 to 1,000,000, a uint32 `seed`, `prng: "mulberry32"`, `quantile` `linear` or `nearest-rank`, `simultaneous` true or false                                              |
| `gates.quality.<metric>.maxLoss` or `gates.quality.<metric>.minImprovement` | paired       | Exactly one per metric: a loss in [0, 1) or an improvement above 0. A cost objective allows the loss form only; a quality objective needs one improvement. Each `gates.quality` key is a required metric |
| `gates.floors.<metric>`                                                     | paired       | Absolute floor on a metric that `gates.quality` names                                                                                                                                                    |
| `gates.saving.minFraction`                                                  | paired       | In (0, 1); required for a cost objective                                                                                                                                                                 |
| `gates.latency.maxIncreaseFraction`                                         | optional     | 0 or more                                                                                                                                                                                                |
| `gates.critical`                                                            | paired       | `tolerance: 0` and at least one `{ id, count }` rule                                                                                                                                                     |
| `gates.native.requireQualification`, `gates.native.requireStableSignatures` | optional     | Read only from the native records of completed, verified candidate attempts, so a red baseline record never rejects; a missing verdict or signature blocks                                               |
| `resources.authorization`                                                   | paired       | Present; `null` means no live execution is authorized. The reader runs nothing either way                                                                                                                |
| `resources.costScope`                                                       | optional     | `taskExecution` includes `target` and `tools` (the default) and may add components; `judge` (default `["judge"]`) names no task component                                                                |
| `resources.pricing`                                                         | optional     | `{ currency, perMillionTokens: { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } }`, every rate present                                                                                   |
| `resources.overhead`                                                        | optional     | Entries with an `amount` for preflight, calibration and diagnostics outside the attempts; when it is absent, the experiment total stays unknown                                                          |
| `frozen.digest`                                                             | paired       | The value `freeze` printed                                                                                                                                                                               |
| `exposure.ledgerHeadAtFreeze`                                               | confirmation | `{ head, length }` of the exposure ledger the confirmation was frozen against                                                                                                                            |
| `selection.declarationDigest`, `selection.reportDigest`                     | confirmation | The frozen selection declaration's digest and the `digest` of its `selection-cleared` report                                                                                                             |

### Identity values

The reader never hashes the files behind the `identity.fixed` digests. It compares each declared value with the value the evidence records, so any string that pins the bytes works. The examples use `sha256:` of each file at the captured commit.

### Repeatability example

This declaration is `test/fixtures/configuration-experiment/example-baseline-experiment.json`. Its evidence file, `test/fixtures/configuration-experiment/baseline-evidence.json`, points it at one recorded Test Design run directory, `test/results/codex-test-design/raw/two-run-before-numeric`, with two cases at two repetitions each. Without a candidate it gives the repeatability reading alone, so it carries no `frozen` block.

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
      "groundTruthDigest": "sha256:51e4131de21e2f438bcd33af876e8bcf7cec196e99c55fe0eae4bed59016c3ef",
      "scorerDigest": "sha256:8e86ba175a04cc58967aab1aef5cbc79febc55d12c78c8c831a00a7cfb2ead42",
      "thresholdsDigest": "sha256:41f5a06b9162743fbfdd92223bf50135b930290657f8ff87755fd3953e151097",
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

### Paired example

This declaration is `test/fixtures/configuration-experiment/paired-example/experiment.json`. It changes the effort from high to medium on the same model and nothing else. Both arms reuse one recorded run's documents, with receipts, observed identities and costs written in by hand, so the example shows the file shapes and the report and measures nothing. Because both arms reuse one run, they inherit its `provenance.capturedAt` and `provenance.originalWorkspace`, so those two fields show shape only; the receipt times are the dispatch record.

```json
{
  "schemaVersion": "1.0.0",
  "experimentId": "test-design-lower-effort",
  "stage": "selection",
  "scope": {
    "workflow": "bmad-tea-test-design",
    "owner": "TEA maintainers",
    "claim": "fixed-suite",
    "judge": "none",
    "objective": "cost",
    "baseline": {
      "id": "incumbent",
      "description": "The Test Design workflow at high effort."
    },
    "candidate": {
      "id": "medium-effort-v1",
      "description": "The same workflow and model at medium effort."
    },
    "changedFactor": {
      "kind": "effort",
      "setting": "effort",
      "detail": "high effort to medium effort; nothing else differs"
    },
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
      "sourceCommit": "2a90c6baaeff7a263a0f7777f441a87a07d98b04",
      "groundTruthDigest": "sha256:51e4131de21e2f438bcd33af876e8bcf7cec196e99c55fe0eae4bed59016c3ef",
      "scorerDigest": "sha256:8e86ba175a04cc58967aab1aef5cbc79febc55d12c78c8c831a00a7cfb2ead42",
      "thresholdsDigest": "sha256:41f5a06b9162743fbfdd92223bf50135b930290657f8ff87755fd3953e151097",
      "rubricDigest": "not-applicable",
      "environment": {
        "cacheRegime": "cold cache on every attempt"
      }
    },
    "arms": {
      "A": {
        "model": {
          "requested": "gpt-6.1-sol",
          "resolved": "gpt-6.1-sol"
        },
        "effort": {
          "requested": "high",
          "applied": "high"
        }
      },
      "B": {
        "model": {
          "requested": "gpt-6.1-sol",
          "resolved": "gpt-6.1-sol"
        },
        "effort": {
          "requested": "medium",
          "applied": "medium"
        }
      }
    }
  },
  "design": {
    "repeats": 2,
    "order": "interleaved",
    "isolation": "fresh staged workspace per attempt; every deliverable regenerated",
    "maxAttempts": 1,
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
        "riskPrecision": 0.8,
        "scaleComplianceAccuracy": 1,
        "riskLinkResolutionAccuracy": 1
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
    "digest": "sha256:22a86d7caf1c44c3440a6b442d1f59274662486959f62c4e6ef7d1797879f4f8"
  }
}
```

## The Evidence File

`analyze` reads one evidence file. Relative paths resolve against the evidence file.

| Field          | Meaning                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| `declaration`  | Path of the declaration                                                                                        |
| `recordedRuns` | Recorded Test Design run directories as `{ kind: "test-design", dir, arm, stage }`; each becomes evidence rows |
| `nativeRuns`   | Run directories whose native records back rows listed under `attempts`                                         |
| `attempts`     | Evidence rows written by another tool                                                                          |
| `ledger`       | The exposure ledger                                                                                            |
| `selection`    | A confirmation's pointer to the selection stage's evidence file                                                |
| `resume`       | A resumed run's pinned ledger head                                                                             |
| `judgeCalls`   | Repeated judgments of one frozen output, for a rubric judge                                                    |

The paired example's evidence file is `test/fixtures/configuration-experiment/paired-example/evidence.json`, and the repeatability example's is `test/fixtures/configuration-experiment/baseline-evidence.json`.

### A recorded run directory

A recorded run holds `manifest.json`, `result.json` and one `cases/<caseId>-run-<repetition>/` folder per case and repetition, so a run directory holds one attempt per case and repetition. Each folder has `observation.json`, `prompt.txt` and `provenance.json`. The manifest lists every file with its byte count and SHA-256. The reader checks each listed file, refuses a file it reads that the manifest does not list, and refuses the whole run when anything differs. It takes the document bytes from `observation.json`.

`provenance.json` carries these keys, named here as the reader reads them:

| Field                                                   | Meaning                                                                                                     |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `provenance.requestedModel`                             | The model the runner asked for                                                                              |
| `provenance.attempt`                                    | Attempt number within the repetition, starting at 1                                                         |
| `provenance.receipt`                                    | `{ kind: "fresh-workspace", workspaceId, startedAt, endedAt, artifactSha256 }` with ISO 8601 times in order |
| `provenance.blockId`                                    | The pairing block the attempt belongs to                                                                    |
| `provenance.observed`                                   | `{ fixed, arm }`: the identity the attempt ran under                                                        |
| `provenance.usage`                                      | Token counts by category                                                                                    |
| `provenance.cost`                                       | `{ currency, components: { target, tools, … } }`                                                            |
| `provenance.latency`                                    | `{ taskMs }`                                                                                                |
| `provenance.capturedAt`, `provenance.originalWorkspace` | Provenance only; a recorded workspace path is no receipt                                                    |

A field the runner did not record reads as null, so a row that states a value for it does not match its record. Without `observed`, the record holds what the run shows: the suite and prompt digests, source commit and runner version from `result.json`, and the requested model from `provenance.requestedModel`, which the live eval writes. A recorded `observed` identity is always compared with the suite digest and the requested model, and with the prompt digest, source commit and runner where `observed` names them. Any disagreement refuses the run.

### Capturing paired inputs

Capturing these inputs is manual today. No TEA runner writes `receipt`, `blockId`, `observed`, `usage`, `cost` or `latency` into `provenance.json`. The Test Design live eval retains only the attempt's mode, case, agent, requested model, repetition, attempt number, capture time and original workspace, and it records runner usage as null. Nothing outside the tests builds an exposure ledger; `appendExposure` exists only as a library export. A maintainer who wants a paired contrast adds these fields and builds the ledger by hand, regenerates the run's `manifest.json`, and owns their truth. There is no supported capture procedure to follow yet.

### The exposure ledger

Each entry is `{ seq, kind, caseId, candidateId, hash }`, where `kind` is `selection-exposure` or `confirmation-exposure`, `seq` runs 1, 2 and so on, and `hash` is the SHA-256 of the previous entry's hash (`sha256:genesis` for the first), a newline and the canonical JSON of the entry without its hash. `appendExposure(ledger, entry)` in the reader module returns the whole ledger extended by one entry. Removing, reordering or editing an entry that a later entry follows breaks the chain. Dropping entries from the end leaves a valid chain, so only a pinned head protects the history up to it: a confirmation's `exposure.ledgerHeadAtFreeze` and the head its selection report recorded.

This command, run from the repository root, builds the paired example's ledger and prints it. For your own experiment, change the case list and the candidate id:

```bash
node -e "const { appendExposure } = require('./test/lib/configuration-experiment.js'); let ledger = []; for (const caseId of ['seeded-offline-order-capture', 'clean-last-sync-indicator']) ledger = appendExposure(ledger, { kind: 'selection-exposure', caseId, candidateId: 'medium-effort-v1' }); console.log(JSON.stringify(ledger, null, 2));"
```

### Rewriting a manifest

After you edit any file in a run directory, rewrite its `manifest.json`: `files[]` of `{ path, sha256, bytes }`, where `sha256` is the hex digest with no prefix. This command, run from the repository root, rewrites the manifest of the run directory named last:

```bash
node -e "const fs = require('fs'), path = require('path'), crypto = require('crypto'); const dir = process.argv[1]; const names = ['provenance.json', 'observation.json', 'prompt.txt']; const files = ['result.json', ...fs.readdirSync(path.join(dir, 'cases')).sort().flatMap((folder) => names.map((name) => 'cases/' + folder + '/' + name))].filter((file) => fs.existsSync(path.join(dir, file))).map((file) => { const bytes = fs.readFileSync(path.join(dir, file)); return { path: file, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length }; }); fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ files }, null, 2) + '\n');" test/fixtures/configuration-experiment/paired-example/candidate-run
```

## The Repeatability Reading

- **Success fraction:** completed repetitions that meet `gates.success`, over completed repetitions. A metric with no denominator for a case (recall on a case with no seeded risks) is not applicable there: it is left out of the spread and excused from the success rule.
- **Native stability:** whether every repetition carries the same native signature, as the loaded native records hold it. A row without a loaded native record has no known signature.
- **Judge:** Test Design scores with a parser, so judge variance is not applicable. A workflow with a rubric judge supplies repeated judgments of one frozen output in `judgeCalls`, and the report shows disagreement, missing verdicts and validity on labeled good and bad controls. A judge that is stable and wrong is invalid.

## Rules the Paired Contrast Enforces

The contrast needs all of the following and names whatever is missing.

### One changed factor

| Factor   | Setting                | What has to change together                              |
| -------- | ---------------------- | -------------------------------------------------------- |
| `model`  | `model`                | The requested model and the model the provider resolved  |
| `effort` | `effort`               | The requested effort and the effort the provider applied |
| `effort` | `decode.<name>`        | That one decode leaf                                     |
| `prompt` | `promptRegions.<name>` | That one prompt region and the whole `promptDigest`      |

Any other difference between the arms, a second decode leaf or a second prompt region included, ends in `revised-design-required`. So does a requested change that the resolved or applied identity does not show. An unknown applied setting blocks. Identity recorded on the evidence that differs from the declaration (a changed task, ground truth, rubric, scorer or threshold, or an arm that runs under something other than its declaration) ends in `new-baseline-required`. Arms with identical configuration are an A/A control.

### Verified evidence

Every attempt, failed, canceled and retried ones included, has to be verified. A receipt and a row's numbers are claims until the reader checks them against a native record from a run directory it loaded and checked against that run's manifest. Two runs that hold different records under one reference are refused.

A record holds the attempt's identity, the input hash of its `prompt.txt`, the output hash, the native signature and the qualification (`passed` for failure class `none`, `failed` for any other class, unknown when none is recorded), plus what `provenance.json` holds. Every row names its record in `native.ref`, pins the run's manifest digest in `native.manifestSha256`, names its stage, and repeats the record's case, repetition, `attempt`, status, hashes, receipt, block, observed identity, usage, cost and latency, and any signature or qualification it states.

A row that completed or claims an artifact carries the saved bytes in `outputText`. They hash to `outputSha256` and to the receipt's `artifactSha256`, and the deterministic scorer, run again over them, reproduces every required metric and every critical count on the row. An attempt that saved nothing records no output hash and no `artifactSha256`.

The evidence index marks each attempt `verified` or `claimed`, lists what failed, and names the source of its record. A claimed attempt blocks. A candidate attempt missing from this stage blocks too, unless it is labeled with the other paired stage and sits on that stage's own cases. For a Test Design declaration the command line supplies the scorer. A library caller of `readExperiment` passes it as `replay` and passes as `nativeRecords` the records `loadRecordedTestDesignRun` returns; an object built any other way is no native record. The Test Design scorer reads documents and cannot see fixture mutations in the workspace, so a `fixtureMutations` critical rule stays claimed and blocks.

### Pairs, blocks and order

- Each planned case and repetition has a complete pair, both arms in one pairing block named by `blockId`. A block holds one pair, and the pair's retries belong to it.
- Within a pair's arm the `attempt` numbers run 1, 2 and so on without a gap or a repeat. A row without one blocks, and so do attempts beyond `design.maxAttempts`.
- The receipts' start times are the recorded dispatch order. Every attempt of a block starts strictly before the next block's first attempt, and an `interleaved` schedule starts the two arms of a pair at different times. Equal start times across blocks show no order.
- A missing block, a block shared by two pairs, a pair split across blocks, an order off the declared schedule, or an attempt for a repetition the schedule does not plan blocks. The unplanned attempt's charge stays in the cost totals.

### Metrics and critical counts

- Every completed candidate attempt records each critical count as a nonnegative integer. A missing, negative or fractional count is unknown and blocks, and a row's `notApplicable` list cannot excuse it. A negative or fractional count recorded on any candidate attempt blocks, completed or not. A retry or failed attempt that saved an artifact is scored again like any other, and its counts have to match what its bytes show.
- A required metric is a `gates.quality` key. It is checked on the scoring attempt of each case and repetition and on any attempt that saved an artifact, and it has to apply to every case, so gate on metrics every case defines. Required metrics are rates in [0, 1], and a value outside that range blocks.
- A candidate that completes no attempt blocks.

### Cost

When the objective is cost or a saving gate is declared, every attempt of both arms carries all-in task cost. A charged component in neither the task nor the judge scope blocks, so no charge drops out of the saving gate. The judge scope counts only with a rubric judge.

### Exposure

The exposure ledger records which cases the candidate has seen. A selection case that already served as confirmation is refused. A confirmation case exposed during selection, or used to confirm another candidate, is refused. A confirmation's ledger has to extend the head pinned in `exposure.ledgerHeadAtFreeze`.

### Confirmation pins

A confirmation runs only for a candidate whose selection cleared. Its declaration pins the frozen selection declaration in `selection.declarationDigest` and the `selection-cleared` report in `selection.reportDigest` (the value `digest` printed for that report). Its evidence file names the selection's evidence file as `"selection": "selection-evidence.json"`. The reader reads the selection again from that evidence with the same scorer, and the report it gets has to match the pinned digest and read `selection-cleared`. An edited report never matches.

A confirmation may change its stage, its confirmation cases and their clusters, its ledger pin and the two selection pins. The candidate, the baseline, the identities, the gates and margins, the design and analysis, and the cost rules stay as selection froze them. Missing selection evidence, evidence that does not reproduce the pinned report, a selection that did not clear, or any other change blocks the confirmation. The ledger head the selection report recorded has to still be in the ledger.

## The Estimator

Each cluster is one `clusterId`; cases that share it are averaged equally inside it. The reader averages each case's repetitions within each arm, then the cluster's cases, takes the paired difference (candidate minus baseline), and resamples whole clusters with replacement. Alpha, the resample count, the seed, the generator and the quantile convention are declared and frozen. The same draws serve every metric and the cost contrast. With `simultaneous: true` alpha is split across the bounds. Repetitions improve the measurement of a case and never count as extra cases. Unequal cluster weights, unequal case weights inside a cluster, and clusters that share a generated build stay descriptive-only. Before any bound can support a decision, the bootstrap must reproduce its reference fixtures, and the report says whether it did.

## The Decision Order

Gates are checked in this order, and the first that applies decides:

1. An unusable or unfrozen declaration, a digest that does not match, or a confirmation without its pinned `selection-cleared` report is `blocked`.
2. Unknown identity, or identity not recorded on an attempt, is `blocked`. A changed measurement identity is `new-baseline-required`. An undeclared second change, or a declared setting that does not change on every identity it has to, is `revised-design-required`.
3. A verified candidate critical miss is `rejected`, whatever the averages and costs say.
4. A declared binding native gate that is red is `rejected`.
5. Claimed evidence the reader cannot verify, an unverified critical miss, an unrecorded critical count, incomplete pairs, missing pairing blocks, a dispatch order off the declared schedule, unknown or unclassified required cost, unknown latency under a latency gate, non-finite data or an unusable ledger are `blocked`. Arms with identical configuration and no other problem are `aa-control`.
6. An unsupported design is `descriptive-only`.
7. Too few clusters, a degenerate interval, an uncalibrated bootstrap, a baseline mean cost that is not positive, or no estimate at all is `inconclusive`.
8. Every required lower bound must strictly exceed its threshold: the quality bound above the negative of the allowed loss, the saving bound above zero for the contrast `(1 - minFraction) * baseline cost - candidate cost`, each absolute floor and any latency limit. Equality does not pass. A failed bound is `inconclusive`, because failing to show noninferiority is no proof of loss.

When every bound clears, a selection reports `selection-cleared` and a confirmation reports `recommend`. A recommendation names a configuration and carries no authority: it applies no patch, accepts no baseline and carries no native verdict.

## Cost and Latency

The report lists task-execution cost, judge cost and total experiment cost separately. Retries, canceled and failed attempts stay in the totals. A component that is not recorded is unknown, and one unknown component makes its total unknown. Tokens become money only through a complete price sheet in `resources.pricing` over complete usage, and the report lists each cost derived that way. Recorded Test Design runs carry no usage, so they can show repeatability and no saving. Under a declared latency gate, unknown or negative task latency blocks.

## Report Fields

`experiment-report.md` opens with the stage, the declaration digest and whether it matches, then the repeatability reading, the paired contrast, cost, denominators and source limitations. `experiment-report.json` carries the same content:

| Field                              | Holds                                                                                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `declaration`                      | The digest and whether it is frozen and matching                                                                                                               |
| `identities`                       | The declared `identity.fixed` and `identity.arms`; the digest of each identity the evidence recorded is under `descriptive.groups[].identity`                  |
| `descriptive`                      | Per case: completed and planned repetitions, success fraction, metric spread, native stability and differing signature components; scorer replay; judge status |
| `contrast`                         | Arms, pairs, verification problems, critical misses, native gates, cost, exposure, estimator, gate bounds and the `decision` with its reasons                  |
| `cost`                             | Task, judge and experiment totals with unknown components counted                                                                                              |
| `denominators`                     | Planned slots and per-arm row counts by status, reconciled against the index                                                                                   |
| `exclusions`                       | Every row left out, with its reason                                                                                                                            |
| `sourceLimitations`                | What the evidence cannot show                                                                                                                                  |
| `schemaVersion`, `analysisVersion` | The formats the report follows                                                                                                                                 |

`evidence-index.json` has one row per attempt. Failed, canceled, invalid and retried attempts stay in it, and every aggregate in the report lists the attempts it came from.

The scorer replay runs the saved documents through the deterministic scorer twice. Two identical scorings show the scorer agreed with itself on those saved bytes. A difference from the recorded signature means the scorer's reading of those bytes changed since the capture. The replay is its own result, and the native record stays as recorded.

## Related

- [How to Measure Repeatability and Compare a Configuration](/docs/how-to/evaluate/measure-repeatability-and-compare-a-configuration.md): the task flow
- [How to Compare Runs and Accept a Baseline](/docs/how-to/evaluate/compare-runs-and-accept-a-baseline.md): native comparison and baseline acceptance
- [How Evaluate Works](/docs/explanation/how-evaluate-works.md): qualification, held-out probes and the limits of a pass
