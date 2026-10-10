---
title: 'How to Read the Gaps and Fix Them with TEA'
description: Find what a weak evaluation result means, repair the corpus or oracle with the Evaluate skill and rerun until the gap closes
---

# How to Read the Gaps and Fix Them with TEA

When a run stops early or reports weak coverage, tell Evaluate which run to inspect.
Your coding agent reads the evidence, repairs one gap in the checks, and reruns them to see whether the gap closed.
A gap means the current checks cannot reliably tell a good target from a defective one.
The files and commands below show what your agent normally handles and let you repeat its work.

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

Ask Evaluate to inspect the command that stopped or the scored run that reported CONCERNS.
It names one gap and shows you the evidence before changing a check.
In this example, preflight exits 11 and reports:

```text
tea-evaluate preflight: probes/P-007.probe.json: M-003: the mutated arm did not fail (held), so the probe's oracle does not catch this mutation (exit 11, /work/app/evals/test-review-json-stdin/runs/20261007T090613064Z-07007bfd)
```

Probe `P-007` plants the defect `M-003` into the reviewer's rules, then runs the evaluation's oracle over the defective target.
The oracle was supposed to fail and it held, so it accepts output that it should reject.

The qualification evidence names oracle `O-003` as the check that accepted the defective answer.
For the step `match`, the defective reviewer flagged a valid test file with `missing-assertion`, and `O-003` allowed that answer.

### 2. Find the Loose Check

The oracle in `contract.json` allows either a clean answer or a false `missing-assertion` finding for the same valid file.
That second answer lets the planted defect pass.
The repair should require the clean answer for this file.

### 3. Ask the Skill to Repair It

- **Claude Code / Cursor / Windsurf:** `/bmad-testarch-evaluate`
- **Codex:** `$bmad-testarch-evaluate`
- **Inside a `/bmad-tea` chat:** `EV`

```text
Fix the gap in evals/test-review-json-stdin: P-007 mutated arm held.
```

The skill records the gap, authors one repair and reruns the stages that the repair touches.
For this gap it keeps only the clean answer in the oracle.

Repairs are small and aimed at one gap.
The skill authors a probe, an oracle, a clean control, a rubric criterion or an evidence pointer.
The repair edits the evaluation folder and leaves the target as it is.

### 4. Rerun the Development Checks

The skill refreshes changed files, checks the folder, preflights the target, then runs and scores the development probes.
To repeat the final two commands manually after those checks:

```bash
RUN=$(npm exec --prefix evals -- tea-evaluate run --evaluation evals/test-review-json-stdin --partition development 2>&1 | tee /dev/stderr | sed -n 's/.*score --run \([^ ]*\) .*/\1/p')
SCORE=$(npm exec --prefix evals -- tea-evaluate score --evaluation evals/test-review-json-stdin --run "$RUN" 2>&1 | tee /dev/stderr | sed -n 's#.*runs/.*/scores/\([^ ]*\) (exit .*#\1#p')
```

`RUN` and `SCORE` hold the IDs used in the evidence examples below.
The repaired preflight now qualifies `P-007`:

```text
tea-evaluate preflight: probes/P-007.probe.json: qualified; the restored digest matched and the baseline passed again
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

For `malformed-input` the skill adds a request with the wrong type for `file` and checks the error response.
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
`meets` means the caught share reached its floor.
`does-not-meet` means the class needs attention; read `basis` to see why it could not meet its floor.
`undeclared` means the class has no floor.
The example declares a `zero-action` floor of 1, and its zero-action probes are all clean controls, so no probe of that class counts.
Two repairs close it.
Ask the skill to add a probe of that class for a behavior where the target must act, or ask it to remove the floor and record why.
With the floor removed and the development partition rerun, the same command prints:

```text
defect {"basis":"rate-meets-floor","decision":"meets","floor":1}
gameability {"basis":"rate-meets-floor","decision":"meets","floor":1}
zero-action {"basis":"no-floor-declared","decision":"undeclared","floor":null}
```

The development score now passes its declared floors.
Confirm that the remaining gaps are understood before opening the held-out partition.

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
(cd "evals/test-review-json-stdin/runs/$RUN" &&
  node -p "require('./gap-view.json')['held-out'].map((r) => r.probeId + ' ' + r.probeClass + (r.outcome ? ' caught=' + r.outcome.caught + ' ' + r.outcome.caughtCount + '/' + r.outcome.validCount : ' outcome withheld')).join('\n')")
```

```text
P-010 defect caught=true 3/3
P-011 defect caught=true 3/3
P-012 defect caught=true 3/3
P-013 defect caught=true 3/3
```

A row with `caught=false` means the evaluation misses a class of defect.
Ask the skill for a new development probe of that class, repair it there, and run the held-out partition again.
A row that prints `outcome withheld` has a `null` outcome.
It hides its cause on purpose, so reproduce the class failure in development.

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
