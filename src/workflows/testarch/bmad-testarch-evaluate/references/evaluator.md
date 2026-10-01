# Evaluator

Choose the evaluation layer after the contract, oracles and target adapter pass `check`, `compile`, `seal` and `preflight`. The layer obtains observations and judgments. `eval-quality` remains the authority for evidence support and scoring. Record the choice in `evaluation.json.evaluator`, rerun `tea-evaluate check` and `preflight`, then prove one known pass and one known fail before relying on the layer.

## Run the system

The evaluation must execute or observe the target under the contract's authorized interface. TeA runs each planned target interaction for `deterministic` and `command`. A `sealed-brief-agent` chooses interactions through TeA's MCP bridge, whose registry authorization still governs calls. A `records` harness runs the target itself and supplies its own sealed records. Derive the clean and defect arms from the same committed baseline, applying only the intended adopter-side mutation in the defect arm. Hold fixed conditions and the trial plan across both arms.

## Capture observations on every oracle channel

Capture the channels each oracle reads: exit code, stdout, stderr, HTTP response, MCP result, tool-call trajectory or artifact, as applicable. Preserve the actual output. A judgment row cites the observation IDs that support it. A failure row quotes a substring of an observed channel and names `quoteChannel`; `artifact` quotes also need `artifactId`. The runtime converts rows to records, and eval-quality checks their evidence support. A harness using `records` must put the observations and their provenance in each `SealedRunRecord` itself.

## Judge the behavior

For `deterministic`, TeA uses eval-quality's `resolveCheck` on the authored oracle; a declared rubric needs a calibrated judge. A `sealed-brief-agent` judges from the sealed brief and its bridge observations without seeing answer keys. A `command` evaluator judges through adopter code, including a skill-specific evaluator, custom code or a framework wrapper. A `records` harness performs its own judgments before import; a rubric among them needs the harness's calibration judgments (see the calibration judgments in Emit judgment rows or sealed records). Bind every judgment key to the contract's oracle and behavior, or to a rubric criterion and its anchored levels, in `evaluator/mapping.json`. Calibrate every rubric judge against adopter-labelled examples before its scores count.

Stage 6 may have prepared a deterministic rubric judge. When choosing `command` or `sealed-brief-agent`, remove `evaluation.json.judge` and `policy/evaluator-conditions.json.judge`; `check` refuses those unused fields for row-converting evaluators. Bind each rubric criterion and its anchored levels in `evaluator/mapping.json`, keep the labelled `policy/judge-calibration.json` and `evaluation.json.judgeCalibration.minimumAgreement`, and calibrate the selected evaluator's own scores before trials. A `records` evaluator with a rubric calibrates through the judgments its harness writes.

## Emit judgment rows or sealed records

`command` and `sealed-brief-agent` produce one JSON answer per trial: `{ "rows": [...], "recommendation": "PASS" }`. Each row names a mapped `key`, an `outcome` of `pass`, `fail` or `score`, and `observationIds`. A `fail` also needs a verbatim `quote`, `quoteChannel`, `confidence` and `comment`; a `score` needs an anchored integer `score`. TeA converts these rows through `evaluator/mapping.json` into sealed run records. `deterministic` produces its records within TeA. `records` imports schema-valid `SealedRunRecord` files from the adopter harness. See `assets/evaluators/command-evaluator.mjs` and `assets/evaluators/mapping.json` for starter shapes.

For a sealed-brief agent, set `evaluation.json.evaluator` to `{ "kind": "sealed-brief-agent", "agent": "claude", "timeoutMs": 30000 }`, then supply a compatible installed agent and credentials. Keep `evaluator/mapping.json` with the judgment keys and add `policy/evaluator-conditions.json` with `evaluator.modelSnapshot` naming the exact agent model snapshot. Check that the selected adapter supports bridged runs and record its installed version in `evaluator/LEARNED.md`. The [Evaluate CLI reference](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/docs/reference/tea-evaluate-cli.md#the-evaluation-layer) documents the bridge and model conditions.

When the target itself uses no model, a valid starting shape for those conditions is `{ "schemaVersion": 1, "modelSnapshot": "none", "systemPromptDigest": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "evaluator": { "modelSnapshot": "<exact-agent-model-snapshot>" } }`. Replace the placeholder with the installed model's exact snapshot. When the target uses a model, name that target snapshot and its prompt digest in the top-level fields. Keep agent credentials outside committed files.

A sealed-brief agent chooses its own calls, so it is qualified before its verdicts count. Set `evaluation.json.evaluatorQualification` to `{ "attempts": <at least 2>, "minimumAgreement": <0 to 1> }`; you choose both values and no template fills them. Before the first trial, `tea-evaluate run` runs the agent `attempts` times on the clean arm and on each mutated arm, scores each attempt with `eval-quality score`, and writes `evaluator-qualification.json`. An attempt agrees when eval-quality reduces it to `passed-clean-control` on the clean arm or `caught` on a mutated arm; an attempt eval-quality reads as Invalid counts as disagreeing. An arm whose agreement falls below `minimumAgreement` exits 11 with no trial record. `tea-evaluate check` exits 10 under `evaluator` when a sealed-brief agent declares no `evaluatorQualification`, and when any other kind declares one.

For an adopter harness, set `evaluation.json.evaluator` to `{ "kind": "records", "records": "sealed-records" }`. The harness writes `sealed-records/evaluator-configuration.json`, one `sealed-records/<probeId>/<trial>.json` per qualified probe trial, and `sealed-records/<probeId>/isolation-manifest.json` so scoring can verify isolation. Generate each file against the published eval-quality schemas and the current sealed brief digest. `tea-evaluate run` imports those files after `check` and `preflight`; it rejects missing or mismatched records. A missing isolation manifest reaches scoring as Invalid.

When the contract declares a rubric, the harness also runs its own scorer over each labelled item in `policy/judge-calibration.json`, handing it the response and no label, and writes `sealed-records/calibration-judgments.json`: `{ "schemaVersion": 1, "scorerConfigurationDigest": "sha256:...", "items": [{ "rubricId", "criterionId", "scorerInput", "answer" }] }`, one item per labelled item in the labelled file's order. `scorerInput` is exactly the label-free observation the runtime derives from the item and is compared whole, so a label such as `expectedLevel` or a different response fails. `answer` is an anchored level or `null`. `scorerConfigurationDigest` is eval-quality's `digestArtifact` (kind `EvaluatorConfiguration`) over `evaluator-configuration.json` with `tea.judgeCalibrationDigest` and `tea.judgeCalibrationMinimumAgreement` removed from its `decodingParameters`; compute it with that function from the configuration file and never type it. The configuration binds `tea.judgeCalibrationDigest` to the `digestBytes` of `policy/judge-calibration.json` and `tea.judgeCalibrationMinimumAgreement` to `evaluation.json.judgeCalibration.minimumAgreement`. `check` and `run` verify the judgments and bindings with one function: absent or unverifiable ones exit 10 (`check` reports the `judge-calibration` rule). `run` then computes agreement and exits 11 below the minimum before any record is copied, with `judge-calibration.json` in the run directory. A `records` evaluation with no rubric needs no judgments file. The runtime verifies the binding and the label-free input and cannot prove the harness ran its scorer; a harness that needs that proof runs its scorer through a `command` evaluator.

The [Evaluate CLI reference](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/docs/reference/tea-evaluate-cli.md#the-evaluation-layer) gives the required record layout and the calibration judgments layout.

## Selection rubric

Discuss each criterion with the adopter before choosing an option. Record the reason and installed version in the evaluation folder. The table's `evaluator.kind` values are the four values the runtime accepts. For a `command` choice, keep framework-specific code under the adopter's `evaluator/` folder, install its dependencies in the adopter's evaluation folder, and declare the executable, timeout and permitted environment keys in `evaluation.json`.

| Option                          | `evaluator.kind`     | Determinism                               | Need for a model and its credentials                  | Visibility of process and trajectory                                          | Need for reference outputs                      | Rubric and calibration needs                | Language and runtime fit with adopter                  | Licence                          | Maintenance and version drift                     | Cost per trial                                      | CI tier fit                                                      |
| ------------------------------- | -------------------- | ----------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------- | ------------------------------------------------------ | -------------------------------- | ------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| TeA deterministic evaluator     | `deterministic`      | Repeatable checks                         | Model only for a rubric judge; supply its credentials | Reads captured observations, including trajectory when the adapter records it | Needed when an oracle compares with a reference | Calibrate a declared rubric judge           | Runs in TeA's Node runtime                             | TeA and eval-quality terms apply | Track TeA and engine versions                     | Target execution plus optional judge                | Good for secret-free `pr` when no model runs                     |
| Sealed-brief agent evaluator    | `sealed-brief-agent` | Sampled judgment, qualified before trials | Agent model and credentials required                  | Chooses calls through the bridge; recorded calls expose process               | Optional; the brief withholds answer keys       | Calibrate rubric judgments                  | Requires a supported agent adapter and bridge          | Check agent and model terms      | Pin and record model snapshot and adapter version | Model calls on each trial and qualification attempt | Live `scheduled` or `release`; replay evidence on `pr`           |
| Adopter harness sealing records | `records`            | Depends on the harness                    | Depends on the harness and judge                      | Harness must capture every oracle channel and provenance                      | Depends on its judgments                        | Harness scorer, calibrated by its judgments | Works with the adopter's existing runtime              | Check harness dependencies       | Harness owns format and version upgrades          | Harness execution plus scoring                      | Any tier its dependencies permit                                 |
| Skill-specific evaluator        | `command`            | Depends on the skill checks               | Optional model and credentials                        | Reads TeA observations; can inspect skill traces                              | Choose per skill oracle                         | Calibrate any rubric judge                  | Executable under `evaluator/` can wrap another runtime | Check dependencies               | Maintain the skill-specific adapter               | Target plus evaluator calls                         | `pr` if deterministic and secret-free; live tier if model-backed |
| Custom evaluation code          | `command`            | Set by its implementation                 | Optional model and credentials                        | Reads TeA observations and cites them                                         | Choose per oracle                               | Calibrate any rubric judge                  | Wrap the adopter's language with an executable         | Check dependencies               | Adopter maintains code and output contract        | Measure per trial                                   | Place by secrets, duration and cost                              |
| External evaluation framework   | `command`            | Depends on chosen assertions              | Depends on framework evaluator and credentials        | Check access to process trace and cited output                                | Depends on framework mode                       | Map rubric scores and calibrate judges      | Wrap its installed API or CLI under `evaluator/`       | Verify framework licence         | Verify installed API and changelog on upgrade     | Measure framework and model calls                   | Deterministic assertions on `pr`; model calls in live tiers      |

## Framework landscape

The list is illustrative. Any framework is admissible through the import contract. [AgentEvals](https://github.com/langchain-ai/agentevals) can score an agent's tool-call trajectory with a deterministic strict matcher; [the calling-agent fixture](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/tree/main/test/fixtures/evaluate-tool-use-agent) demonstrates its judgment rows and reference trajectory. [promptfoo](https://github.com/promptfoo/promptfoo) can run deterministic assertions over already captured outputs; [the summary fixture](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/tree/main/test/fixtures/evaluate-promptfoo) imports its per-assertion results. Their starter executables are `assets/evaluators/agentevals-trajectory.mjs` and `assets/evaluators/promptfoo-assertions.mjs`. Other frameworks need the same evidence path and may use a different language behind a `command` executable.

For AgentEvals, copy a regular, tracked reference trajectory to `evaluator/reference/trajectory.json`, or set `evaluator.args` to `--reference=reference/<name>.json` for another tracked file under that directory. The template rejects paths or links outside the digested reference tree. The target's stdout must carry the JSON trajectory after `trajectory:` and one space; set `--prefix=<text>` if its prefix differs. Bind the `trajectory_strict_match` row key to the trajectory oracle in `evaluator/mapping.json`. For promptfoo, put the assertions in `evaluator/asserts.yaml` and give each assertion a distinct `metric` that exactly matches its key in `evaluator/mapping.json`. Assertion order can change without changing the mapping. A trial must judge every mapped assertion exactly once. The wrapper runs promptfoo over the captured stdout in a temporary directory; `--stdout-prefix=<text>` selects an observation when the trial has several stdout channels. Each prefix must identify exactly one observation, or the template stops with an ambiguity error. This installed promptfoo CLI removes one final line feed from model outputs; use another evaluator for an oracle that judges that byte. Install the chosen framework as a dependency of the adopter's evaluation folder and check its installed version.

## Separate ungraded framework errors from graded target failures

A framework result is target evidence only when the framework graded the output. A graded assertion with `pass: false` becomes a `fail` row that quotes the observed channel; a graded `pass: true` becomes a `pass` row. For promptfoo the grade is the result's `gradingResult`, with one `componentResults` entry per assertion when several ran.

A result with no grade, with or without an `error` string, says only that the framework could not judge the output. It establishes nothing about the target, so the wrapper writes no row for it: it exits non-zero with a diagnostic naming the ungraded framework error. `tea-evaluate run` then ends as evaluator infrastructure failure (exit 12) and seals no record for the trial. The evaluator's stderr in the run directory (`evaluator/<arm>/trial-<n>.stderr`) holds the diagnostic, which carries only the first line of the framework's error. Reproduce the result by running the installed framework directly over the captured stdout, as in step 4 of the procedure below, read the full error, fix the assertions or the framework setup, and run again.

The grade set must be complete. The imported result carries one grade for every mapped assertion, each exactly once. A missing grade, a repeated grade or a grade without a boolean `pass` stops the trial with no record, even when another assertion graded, because a partial set would let a pass stand for an assertion nobody judged.

The two inputs below are payloads for `node promptfoo-assertions.mjs --map-results`, read from stdin by the starter copied into an `evaluator/` folder whose `mapping.json` defines the key `required-pears`. The first has no grade and the wrapper refuses it:

<!-- example:promptfoo-ungraded -->

```json
{
  "observation": {
    "observationId": "trial-1-summarize",
    "stdout": { "kind": "text", "value": "Summary for List pantry: apples, pears\n" }
  },
  "results": [
    {
      "error": "promptfoo could not grade this output",
      "response": { "output": "Summary for List pantry: apples, pears" },
      "testCase": { "assert": [{ "type": "contains", "value": "pears", "metric": "required-pears" }] }
    }
  ]
}
```

The second carries a graded failure, which the wrapper maps to a `fail` row quoting the observed stdout:

<!-- example:promptfoo-graded-fail -->

```json
{
  "observation": { "observationId": "trial-1-summarize", "stdout": { "kind": "text", "value": "Summary for List pantry: apples\n" } },
  "results": [
    {
      "response": { "output": "Summary for List pantry: apples" },
      "testCase": { "assert": [{ "type": "contains", "value": "pears", "metric": "required-pears" }] },
      "gradingResult": {
        "pass": false,
        "reason": "Expected output to contain \"pears\"",
        "componentResults": [
          {
            "pass": false,
            "reason": "Expected output to contain \"pears\"",
            "assertion": { "type": "contains", "value": "pears", "metric": "required-pears" }
          }
        ]
      }
    }
  ]
}
```

## Learn an unfamiliar framework

1. Read primary sources only: the framework's documentation, repository, API reference, examples and changelog. Record URLs or commit references for every API or behavior you use. Do not adopt a claim from a secondary summary.
2. Find how the framework takes inputs, invokes or observes the target, judges, returns results, and whether it needs a model or credentials. Check whether it exposes every process and output channel the oracles need.
3. Install the version the adopter uses. Record the package name, installed version, runtime and licence. Read that installed version's API and release notes before writing the adapter.
4. Execute a minimal example against a known pass and a known fail with that installed version. Save the command, input, stdout, stderr, exit status and framework result for both. Add a third case the framework cannot grade (a broken assertion, a missing credential, a timeout) and record how its result arrives. A documented API claim that execution contradicts remains unadopted until resolved.
5. Fill `evaluator/LEARNED.md` from `assets/evaluators/LEARNED.md`: framework and installed version, each fact used with its primary source, executed pass and fail output, and contradictions. Keep the file with the evaluator so its digest captures the learned conditions.
6. Map each framework result to a stable judgment key in `evaluator/mapping.json`. Write a `command` wrapper under `evaluator/` that reads `{ sealedBrief, observations }` from stdin and prints `{ rows, recommendation? }`. Make failures quote the actual observation, and make the wrapper exit non-zero on a result the framework did not grade. Run `tea-evaluate check` and `preflight` now. After the mutation and run stages have supplied their artifacts, run and score a clean control and a seeded defect. Accept the full pipeline only when eval-quality resolves `passed-clean-control` and `caught`.

## Vendor rule

The framework and any judge model are fixed conditions of a run. Record the installed framework version in a tracked `evaluator/LEARNED.md` file and the model snapshot in `policy/evaluator-conditions.json`. Update that version record whenever the installed dependency changes; the runtime digests the tracked `evaluator/` tree and the updated record moves the scoring configuration. The system under test is the adopter's use of the vendor dependency. Mutate the adopter's prompts, context, wiring, validation or state handling; keep the vendor version and model snapshot fixed across arms.
