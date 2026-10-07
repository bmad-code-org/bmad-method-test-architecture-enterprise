---
title: 'How to Read the Gaps and Fix Them with TEA'
description: Find what a weak evaluation result means, repair the corpus or oracle with the Evaluate skill and rerun until the gap closes
---

# How to Read the Gaps and Fix Them with TEA

Use this guide when a run stops early, scores CONCERNS, or leaves a probe class below its floor.
A gap is a place where the evaluation cannot yet tell a good target from a defective one.
You read the evidence, name one gap, ask the Evaluate skill to repair it, and rerun.
The example follows a command that reviews test files and the two gaps its evaluation had.

## When to Use This

- `preflight` or `run` exited 11
- `score` exited 0 and the verdict reads CONCERNS
- A strength floor reads `does-not-meet`
- A held-out probe was not caught

## Prerequisites

- An evaluation folder that passes `check`
- A preflight or a scored run to read
- The Evaluate skill, to author the repair with you

## Steps

### 1. Name the First Gap

Read the exit of the last command first.
Exit 11 means the evaluation is too weak to trust, and its message names the probe and the reason.
Run the preflight and keep its run ID.
`RUN` holds the ID in the last line, `runs/<ID>`, and each later command that reads this run's evidence uses `$RUN`:

```bash
RUN=$(npm exec --prefix evals -- tea-evaluate preflight --evaluation evals/test-review-json-stdin 2>&1 | tee /dev/stderr | tail -1 | grep -o '[0-9]\{8\}T[0-9]\{9\}Z-[0-9a-f]\{8\}' | tail -1)
```

Over the example folder it prints:

```text
tea-evaluate preflight: probes/P-005.probe.json: qualified; the restored digest matched and the baseline passed again
tea-evaluate preflight: probes/P-006.probe.json: qualified; the restored digest matched and the baseline passed again
tea-evaluate preflight: probes/P-007.probe.json: M-003: the mutated arm did not fail (held), so the probe's oracle does not catch this mutation (exit 11, /work/app/evals/test-review-json-stdin/runs/20261007T090613064Z-07007bfd)
```

Probe `P-007` plants the defect `M-003` into the reviewer's rules, then runs the evaluation's oracle over the defective target.
The oracle was supposed to fail and it held, so it accepts output that it should reject.

The qualification evidence names the oracle:

```bash
(cd evals/test-review-json-stdin/runs/$RUN &&
  grep -o '"verdict": "[a-z]*"\|"oracleId": "O-[0-9]*"\|"resolution": "[a-z]*"' qualification/P-007/mutated-fail.json)
```

```text
"verdict": "held"
"oracleId": "O-003"
"resolution": "true"
```

Oracle `O-003` resolved true over the mutated observations, so it accepted them.
The same file holds each request and the answer the defective target gave.
For the step `match`, the defective reviewer flagged a valid test file with `missing-assertion`, and `O-003` allowed that answer.

### 2. Find the Loose Check

`contract.json` holds the oracle.
The `match` step passed whenever stdout equaled either of two answers:

```json
{
  "op": "any",
  "operands": [
    {
      "op": "equality",
      "operands": [
        { "pointer": "/interactions/match/stdout" },
        { "literal": { "file": "cases/clean-assert-match.test.js", "status": "clean", "findings": [] } }
      ]
    },
    {
      "op": "equality",
      "operands": [
        { "pointer": "/interactions/match/stdout" },
        { "literal": { "file": "cases/clean-assert-match.test.js", "status": "findings", "findings": ["missing-assertion"] } }
      ]
    }
  ]
}
```

The second alternative accepts the false finding, so the oracle holds for the clean target and for the defective one.
A loose oracle also lets a gameability probe through, such as an answer that flags every file.

### 3. Ask the Skill to Repair It

- **Claude Code / Cursor / Windsurf:** `/bmad-testarch-evaluate`
- **Codex:** `$bmad-testarch-evaluate`
- **Inside a `/bmad-tea` chat:** `EV`

```text
Fix the gap in evals/test-review-json-stdin: P-007 mutated arm held.
```

The skill records the gap, authors one repair and reruns the stages that the repair touches.
For this gap it keeps one equality, the exact clean answer:

```json
{
  "op": "equality",
  "operands": [
    { "pointer": "/interactions/match/stdout" },
    { "literal": { "file": "cases/clean-assert-match.test.js", "status": "clean", "findings": [] } }
  ]
}
```

Repairs are small and aimed at one gap.
The skill authors a probe, an oracle, a clean control, a rubric criterion or an evidence pointer.
The repair edits the evaluation folder and leaves the target as it is.

### 4. Rerun the Loop

After any repair the skill refreshes the corpus index when probe or corpus files changed, then runs these in order and stops at the first nonzero exit:

```bash
npm exec --prefix evals -- tea-evaluate digest --evaluation evals/test-review-json-stdin
npm exec --prefix evals -- tea-evaluate check --evaluation evals/test-review-json-stdin
npm exec --prefix evals -- eval-quality compile --in evals/test-review-json-stdin/contract.json --out evals/test-review-json-stdin/compiled-contract.json
npm exec --prefix evals -- eval-quality seal --in evals/test-review-json-stdin/contract.json --out evals/test-review-json-stdin/sealed-brief.json
npm exec --prefix evals -- tea-evaluate preflight --evaluation evals/test-review-json-stdin
RUN=$(npm exec --prefix evals -- tea-evaluate run --evaluation evals/test-review-json-stdin --partition development 2>&1 | tee /dev/stderr | sed -n 's/.*score --run \([^ ]*\) .*/\1/p')
SCORE=$(npm exec --prefix evals -- tea-evaluate score --evaluation evals/test-review-json-stdin --run "$RUN" 2>&1 | tee /dev/stderr | sed -n 's#.*runs/.*/scores/\([^ ]*\) (exit .*#\1#p')
```

The last two commands keep the IDs the following steps read: `RUN` is the run `run` just sealed and `SCORE` is the score invocation under `runs/$RUN/scores/`.
Each pass through the loop replaces them with the pass's own IDs.

`digest` prints the new index digest, `compile` and `seal` print nothing and exit 0, and the preflight now qualifies `P-007`:

```text
tea-evaluate digest: wrote /work/app/evals/test-review-json-stdin/corpus-index.json (42 file(s))
sha256:346329593c03486009899e605b83347d935e7cdc4b04717b508d0a3c100cb947
...
tea-evaluate preflight: probes/P-007.probe.json: qualified; the restored digest matched and the baseline passed again
tea-evaluate preflight: probes/P-009.probe.json: qualified; its degenerate response satisfies O-001 and violates O-003
tea-evaluate preflight: eval-quality preflight exited 0; its verdict and diagnostics are in runs/20261007T090641470Z-9508055a (exit 0, /work/app/evals/test-review-json-stdin/runs/20261007T090641470Z-9508055a)
```

### 5. Read the Verdict and Coverage Gaps

`run` and `score` now exit 0, and the score still has work for you.
Read each probe's verdict and the coverage rules it reports unsatisfied:

```bash
(cd evals/test-review-json-stdin/runs/$RUN/scores/$SCORE &&
  grep -o '"contractVerdict":"[A-Z]*"\|"rule":"[a-z-]*"' P-001/evidence-artifact.json P-002/evidence-artifact.json)
```

```text
P-001/evidence-artifact.json:"contractVerdict":"CONCERNS"
P-001/evidence-artifact.json:"rule":"malformed-input"
P-002/evidence-artifact.json:"contractVerdict":"CONCERNS"
P-002/evidence-artifact.json:"rule":"malformed-input"
```

Exit 0 covers PASS, WAIVED and CONCERNS.
CONCERNS names a rule the contract leaves unsatisfied.
Here `malformed-input` is unsatisfied because no plan step binds a request key to a value of the wrong type.

The skill repairs each rule with a concrete addition:

| Rule                           | Repair                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `malformed-input`              | Add a plan step that binds a declared request key with the `type-violating` matcher, and an oracle for it |
| `whole-body`                   | Add an oracle that names every required response key, and a defect outside the keyword                    |
| `per-record`                   | Add a multi-record probe with per-record evidence                                                         |
| `omission-and-completeness`    | Add a missing-item probe and an oracle over the complete required set                                     |
| `success-indicator-separation` | Add an oracle that reads success evidence apart from the target's own success claim                       |
| `state-change-read-back`       | Add a state-changing probe with a read-back control                                                       |
| `sibling-cross-check`          | Add a probe whose sibling fields disagree, and an oracle that compares them                               |

For `malformed-input` the skill adds a step that sends the `file` key as a number:

```json
{
  "stepId": "typed-file",
  "interfaceId": "review-cli",
  "operationId": "review",
  "inputBinding": {
    "stdin": { "action": { "literal": "review" }, "file": { "matcher": "type-violating" } }
  }
}
```

It then widens the error oracle to the new step and adds the step to each gameability response file.
After the loop of step 4 runs again, every probe reads PASS with no coverage gaps:

```text
P-001/evidence-artifact.json:"contractVerdict":"PASS"
P-002/evidence-artifact.json:"contractVerdict":"PASS"
```

### 6. Read the Strength of Each Class

`score` also writes `strength-aggregate.json` beside the probe folders.
`$RUN` and `$SCORE` still hold the IDs of the latest pass through the loop of step 4.
Print one line per class:

```bash
(cd evals/test-review-json-stdin/runs/$RUN/scores/$SCORE &&
  node -p "const d = require('./strength-aggregate.json').floorDecisions; Object.keys(d).map((c) => c + ' ' + JSON.stringify(d[c])).join('\n')")
```

```text
defect {"basis":"rate-meets-floor","decision":"meets","floor":1}
gameability {"basis":"rate-meets-floor","decision":"meets","floor":1}
zero-action {"basis":"no-eligible-probe","decision":"does-not-meet","floor":1}
```

The floors come from `strengthFloor` in `evaluation.json`.
Read each class by its `basis`:

- `rate-meets-floor` and `rate-below-floor` compare the share of caught probes with the floor.
- `no-eligible-probe` means the run holds no probe of that class that it can count.
  Clean controls stay outside every denominator.
- `not-comparable` means fewer trials than `minimumTrialCount` completed, or an oracle of the probe was never reached.
- `no-exercised-probe` and `unexercised-probe` mean an eligible probe did not run.
- `no-floor-declared` reads `undeclared`: the class has no floor in `evaluation.json`.

Only `rate-meets-floor` is a pass.
The example declares a `zero-action` floor of 1, and its zero-action probes are all clean controls, so no probe of that class counts.
Two repairs close it.
Ask the skill to add a probe of that class for a behavior where the target must act, or ask it to remove the floor and record why.
With the floor removed and the development partition rerun, the same command prints:

```text
defect {"basis":"rate-meets-floor","decision":"meets","floor":1}
gameability {"basis":"rate-meets-floor","decision":"meets","floor":1}
zero-action {"basis":"no-floor-declared","decision":"undeclared","floor":null}
```

### 7. Run the Held-Out Partition

Held-out probes stay closed during the repair loop, so a repair cannot tune itself to an answer it should not see.
Run them once the development evidence is clean and you confirm it is ready:

```bash
RUN=$(npm exec --prefix evals -- tea-evaluate run --evaluation evals/test-review-json-stdin --partition held-out 2>&1 | tee /dev/stderr | sed -n 's/.*score --run \([^ ]*\) .*/\1/p')
SCORE=$(npm exec --prefix evals -- tea-evaluate score --evaluation evals/test-review-json-stdin --run "$RUN" 2>&1 | tee /dev/stderr | sed -n 's#.*runs/.*/scores/\([^ ]*\) (exit .*#\1#p')
```

Read held-out results only from `gap-view.json` in the run folder.
Each held-out row holds the probe ID, its class and the reduced outcome:

```bash
(cd evals/test-review-json-stdin/runs/$RUN &&
  node -p "require('./gap-view.json')['held-out'].map((r) => r.probeId + ' ' + r.probeClass + ' caught=' + r.outcome.caught + ' ' + r.outcome.caughtCount + '/' + r.outcome.validCount).join('\n')")
```

```text
P-010 defect caught=true 3/3
P-011 defect caught=true 3/3
P-012 defect caught=true 3/3
P-013 defect caught=true 3/3
```

A row with `caught=false` means the evaluation misses a class of defect.
Ask the skill for a new development probe of that class, repair it there, and run the held-out partition again.
A row whose `outcome` is `null` hides its cause on purpose, so reproduce the class failure in development.

## How You Know It Worked

- `preflight` exits 0 and every seeded probe prints `qualified`
- Every probe's `contractVerdict` reads PASS and reports no coverage gap
- Each class with a floor reads `meets`, or the skill removed the floor and recorded why
- Each held-out probe reads `caught=true`

## Related Guides

- [How to Compare Runs and Accept a Baseline](/docs/how-to/evaluate/compare-runs-and-accept-a-baseline.md): Keep the clean result as the baseline
- [How to Choose an Evaluator and Calibrate a Judge](/docs/how-to/evaluate/choose-an-evaluator-and-calibrate-a-judge.md): Repair a judge that disagrees with your labels
- [How to Evaluate a Skill or Agent](/docs/how-to/evaluate/evaluate-a-skill-or-agent.md): The first run

## Reference

- [tea-evaluate CLI](/docs/reference/tea-evaluate-cli.md): Every command, option and exit code
- [digest](/docs/reference/tea-evaluate-cli.md#digest)
- [score](/docs/reference/tea-evaluate-cli.md#score)
- [Exit codes](/docs/reference/tea-evaluate-cli.md#exit-codes)
- [How Evaluate Works](/docs/explanation/how-evaluate-works.md): Why held-out probes stay closed and how gameability probes work
