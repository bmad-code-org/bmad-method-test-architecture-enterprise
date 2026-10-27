---
title: 'How to Bring an Existing Suite into Evaluate with TEA'
description: Use an AgentEvals or promptfoo suite as the evaluation layer, or learn another framework as you go
---

# How to Bring an Existing Suite into Evaluate with TEA

**Bottom line:** Use this guide to reuse grading checks that match your evaluation's contract. Ask Evaluate to map the evidence and verify an adapter with a known pass, known fail, and evaluator error. With a command evaluator, TEA runs the target and your wrapper grades its observations; with records, your harness supplies compatible sealed evidence. Follow the chosen route's checks before relying on clean-control and defect-detection results. Naming a framework does not install or qualify it.

## Start with the Evaluate Skill

Use this guide when you already have useful assertions, trajectory checks or grading code and want TEA's repeated trials, qualified defects, held-out probes and scored evidence around them. You do not need to rewrite working checks simply to adopt Evaluate.

Start with an evaluation folder whose contract, oracles and registry pass `check` and `preflight`, as [Evaluate a Skill or Agent](/docs/how-to/evaluate/evaluate-a-skill-or-agent.md) describes. Have the existing suite, its installed version and primary documentation available. The CLI needs Node.js 22.20 or later; the suite may have its own runtime requirements.

Start or resume Evaluate:

- **Claude Code / Cursor / Windsurf:** `/bmad-tea-evaluate`
- **Codex:** `$bmad-tea-evaluate`
- **Inside a `/bmad-tea` chat:** `EV`

```text
Reuse our AgentEvals trajectory checks for evals/calling-agent-tool-use.
Show which checks match the contract, what evidence they need,
and what cannot be reused. Verify the adapter on a known pass,
a known fail and a framework error before running target trials.
```

Substitute your framework and evaluation folder. The skill investigates and authors the adapter; you approve the requirements, expected results, dependency versions and any model use. The CLI validates and executes the setup; `eval-quality` produces the formal verdicts.

## 1. Choose What to Reuse

First decide who runs the target and who grades its output.

- **Use `command` when you want TEA to run the target and your code to grade the observations.** A wrapper runs once per trial, reads `{ "sealedBrief", "observations" }` on standard input and prints `{ "rows": [...] }`. This is the usual choice for existing assertions or framework grading APIs.
- **Consider `records` when your harness already runs and grades the target.** It must produce TEA-compatible sealed records, configuration bindings and evidence. An aggregate score, JUnit report or ordinary framework result file is not a sealed-record import. The runtime checks bindings but does not prove the harness executed its scorer or tie imported records to the target's current state.
- **Keep `deterministic` if TEA's built-in checks already cover the requirements.** You may not need a framework adapter. Use `sealed-brief-agent` when the evaluator must choose its own calls, rather than simply consume your suite's results.

These are the four supported evaluator kinds. A framework is an implementation behind `command`, not another kind. See [Choose an Evaluator and Calibrate a Judge](/docs/how-to/evaluate/choose-an-evaluator-and-calibrate-a-judge.md).

Map only checks that answer a contract requirement and have the needed evidence. Keep unrelated tests in their existing suite. Identify missing channels or incompatible assertions before building the wrapper.

## 2. Match a Starter to Your Checks

### AgentEvals trajectory checks

The shipped AgentEvals wrapper compares a captured trajectory with a committed reference, using strict trajectory matching and exact tool-argument matching. It is not an adapter for every AgentEvals evaluator.

The default reference is `evaluator/reference/trajectory.json`. The target must print its JSON trajectory after the `trajectory:` prefix on stdout. The skill can configure another reference under `evaluator/reference/` or another prefix. Exactly one observation must match the prefix; ambiguous or missing observations stop the evaluator.

Review the reference against the requirement. A reference that merely copies the target's current behavior can preserve a bug.

### promptfoo assertions

The shipped promptfoo wrapper grades captured stdout with assertions in `evaluator/asserts.yaml`. Give each assertion a distinct `metric` matching its key in `mapping.json`:

```yaml
- type: contains
  value: apples
  metric: required-apples
- type: not-contains
  value: shellfish
  metric: forbidden-shellfish
```

The starter admits `contains`, `icontains`, `contains-all`, `contains-any`, `icontains-all`, `icontains-any`, `equals`, `starts-with`, `regex` and `is-json`, including their `not-` forms. It rejects other assertion types, including `javascript` and model-graded assertions such as `llm-rubric`.

It also rejects result configurations that can hide crashes or grade altered output, including executable value references, templates, transforms, invalid regexes and zero-weight assertions. These are result-admission checks, not a promise that arbitrary promptfoo configuration is safe to execute. Review the assertions first.

Use a command evaluator you own for checks outside that supported subset. The wrapper requires every mapped assertion exactly once, even if assertions are reordered. Its stdout selector must identify one observation. The installed CLI removes one final line feed when grading captured output, so use another evaluator for a byte-exact trailing-newline requirement.

## 3. Review the Adapter and Its Mapping

A command integration normally includes:

```text
evaluator/
  trajectory.mjs
  mapping.json
  frameworks.json
  installed-version.mjs
  LEARNED.md
  reference/trajectory.json
```

The wrapper name and input files depend on your suite. A promptfoo integration uses its assertions file instead of a trajectory reference. Track every required file under `evaluator/`; in a Git repository, untracked files are outside the evaluator's recorded tree.

Review the wiring the skill adds to `evaluation.json`. This is a merge fragment, not a complete file:

```json
{
  "evaluator": {
    "kind": "command",
    "command": "evaluator/trajectory.mjs",
    "timeoutMs": 30000
  }
}
```

For AgentEvals, the mapping can bind the wrapper's stable result key to an oracle and behavior that already exist in the contract:

```json
{
  "schemaVersion": 1,
  "keys": {
    "trajectory_strict_match": {
      "oracleId": "O-001",
      "behaviorId": "B-001"
    }
  }
}
```

A `pass` or `fail` row answers an oracle. Every row cites observed evidence; a failure also quotes the observed channel and supplies confidence and a comment. Numeric rubric results use `score` rows mapped to an existing criterion's anchored levels. A framework's aggregate score cannot replace these bindings.

Unknown or duplicate row keys, off-scale scores and malformed answers stop the evaluator. Missing judgments must not become passes: an unanswered oracle is `not-attempted`; an unanswered rubric criterion can become an Invalid result.

## 4. Pin the Framework and Verify the Adapter

Ask the skill to install the version you intend to use, then commit the evaluation package manifest and lockfile. It records:

- `frameworks.json`: each framework's exact version and an executable probe that reads the installed version
- `LEARNED.md`: the installed versions, primary sources, executed examples and unresolved contradictions
- The wrapper, mapping and reference or assertion files that determine judgments

Declare judgment-producing plugins and dependencies too. When a top-level version does not capture local patches or dependency changes, use `installState` with a tree or lockfile source; see [The evaluation layer](/docs/reference/tea-evaluate-evaluators.md#the-evaluation-layer).

For an unfamiliar framework, the skill should first inspect its documented inputs, outputs, runtime, license and model requirements, then execute three small cases against the installed version:

1. A known pass returns the expected grade.
2. A known fail returns a failing grade supported by the observed output.
3. A case the framework cannot grade stops as an evaluator error, rather than inventing a target failure.

A missing framework or version mismatch stops `run` with exit 12 before any trial executes; inspect `runs/<invocationId>/framework-versions.json` for declared versus observed versions and failed probe diagnostics.

During trial execution, a nonzero wrapper exit, timeout or malformed answer also stops `run` with exit 12 and seals no record for that trial. Inspect `runs/<invocationId>/evaluator/<arm>/trial-<n>.stderr` to diagnose wrapper execution failures. A grader failure is not evidence that the target failed.

`check` validates the version declarations against `LEARNED.md`. During execution, `run` checks installed versions before trials, before evaluator launches and after trials. A mismatch stops the affected evidence from counting. On an intentional upgrade, repeat the examples and update the declarations and learning record together.

## 5. Calibrate Any Rubric

Skip this step if the contract has no rubric. Otherwise, framework ownership of the score does not remove calibration.

Have the skill prepare labeled examples for every criterion and anchored level. Approve those labels and `judgeCalibration.minimumAgreement`, then run calibration through the configured scorer. For a `command` evaluator, rubric scores come from your wrapper; TEA does not add its separate judge. Omit the unused separate `judge` blocks.

For `records`, your harness must also supply bound `calibration-judgments.json`. TEA computes agreement from those answers but cannot prove or replay the harness's scorer execution. TEA refuses a `records` evaluator with rubrics and a `partitionPlan`. Use `command` when TEA must execute the scorer or you need that partitioned rubric setup. Follow the [judge calibration guide](/docs/how-to/evaluate/choose-an-evaluator-and-calibrate-a-judge.md) for the full gate.

## 6. Run the Evaluation and Inspect the Score

Ask the skill to run these commands, or repeat them yourself:

```bash
npm exec --prefix evals -- tea-evaluate check --evaluation evals/calling-agent-tool-use
npm exec --prefix evals -- tea-evaluate preflight --evaluation evals/calling-agent-tool-use --partition development
npm exec --prefix evals -- tea-evaluate run --evaluation evals/calling-agent-tool-use --partition development
```

Stop at the first nonzero exit. After a successful run, score it; with no `--run`, `score` takes the most recent run:

```bash
npm exec --prefix evals -- tea-evaluate score --evaluation evals/calling-agent-tool-use
```

A zero `run` exit means records were sealed. Review the score evidence for `passed-clean-control` on the known pass and `caught` on the qualified seeded defect. Adapter examples alone do not establish this end-to-end result. Run held-out probes after development review.

Once the evidence is sound, [compare runs and approve a baseline](/docs/how-to/evaluate/compare-runs-and-accept-a-baseline.md). For CI, [keep model-free replay on pull requests and live evaluation on suitable tiers](/docs/how-to/evaluate/put-an-evaluation-in-ci.md). A model-free assertion does not remove the cost or credentials of an LLM target.

## Related Guides

- [How to Read the Gaps and Fix Them](/docs/how-to/evaluate/read-the-gaps-and-fix-them.md): Interpret a weak scored result
- [How Evaluate Works](/docs/explanation/how-evaluate-works.md): Fixed conditions and the limits of a pass

## Reference

- [tea-evaluate CLI](/docs/reference/tea-evaluate-cli.md): Fields, import requirements and evidence
- [run](/docs/reference/tea-evaluate-cli.md#run)
- [Exit codes](/docs/reference/tea-evaluate-cli.md#exit-codes)
