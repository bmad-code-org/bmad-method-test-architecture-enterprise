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

`command` and `sealed-brief-agent` produce one JSON answer per trial: `{ "rows": [...], "recommendation": "PASS" }`. Each row names a mapped `key`, an `outcome` of `pass`, `fail` or `score`, and `observationIds`. A `fail` also needs a verbatim `quote`, `quoteChannel`, `confidence` and `comment`; a `score` needs an anchored integer `score`. TeA converts these rows through `evaluator/mapping.json` into sealed run records. `deterministic` produces its records within TeA. `records` imports schema-valid `SealedRunRecord` files from the adopter harness. See `assets/evaluators/command-evaluator.mjs`, `assets/evaluators/mapping.json` and `assets/evaluators/frameworks.json` for starter shapes.

For a sealed-brief agent, set `evaluation.json.evaluator` to `{ "kind": "sealed-brief-agent", "agent": "claude", "model": "<immutable-model-id>", "timeoutMs": 30000 }`, then supply a compatible installed agent and credentials. Keep `evaluator/mapping.json` with the judgment keys and add `policy/evaluator-conditions.json` with `evaluator.modelSnapshot` naming the same immutable model ID as `evaluator.model`; `check` exits 10 when the two differ. Check that the selected adapter supports bridged runs and record its installed version in `evaluator/LEARNED.md`. The [Evaluate CLI reference](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/docs/reference/tea-evaluate-cli.md#the-evaluation-layer) documents the bridge and model conditions.

When the target itself uses no model, a valid starting shape for those conditions is `{ "schemaVersion": 1, "modelSnapshot": "none", "systemPromptDigest": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "evaluator": { "modelSnapshot": "<exact-agent-model-snapshot>" } }`. Replace the placeholder with the immutable ID that `evaluator.model` holds. When the target uses a model, name that target snapshot and its prompt digest in the top-level fields. Keep agent credentials outside committed files.

A sealed-brief agent chooses its own calls, so it is qualified before its verdicts count. Set `evaluation.json.evaluatorQualification` to `{ "attempts": <at least 2>, "minimumAgreement": <0 to 1> }`; you choose both values and no template fills them. Before the first trial, `tea-evaluate run` runs the agent `attempts` times on the clean arm and on each mutated arm, scores each attempt with `eval-quality score`, and writes `evaluator-qualification.json`. An attempt agrees when eval-quality reduces it to `passed-clean-control` on the clean arm or `caught` on a mutated arm; an attempt eval-quality reads as Invalid counts as disagreeing. An arm whose agreement falls below `minimumAgreement` exits 11 with no trial record. `tea-evaluate check` exits 10 under `evaluator` when a sealed-brief agent declares no `evaluatorQualification`, and when any other kind declares one.

For an adopter harness, set `evaluation.json.evaluator` to `{ "kind": "records", "records": "sealed-records" }`. The harness writes `sealed-records/evaluator-configuration.json`, one `sealed-records/<probeId>/<trial>.json` per qualified probe trial, and `sealed-records/<probeId>/isolation-manifest.json` so scoring can verify isolation. Generate each file against the published eval-quality schemas and the current sealed brief digest. Every sealed observation carries `interfaceId`, the interface that declares the operation it exercised, beside `operationId`; a record without it fails the published schema. Each record and isolation manifest names `evaluatorConfigurationDigest`, eval-quality's `digestArtifact` (kind `EvaluatorConfiguration`) of the final `evaluator-configuration.json`, bindings included, so finish the configuration before you seal. `tea-evaluate run` imports those files after `check` and `preflight`; it rejects missing or mismatched records, and one that names another configuration digest, with exit 10 and nothing copied. A missing isolation manifest reaches scoring as Invalid. Under a `partitionPlan`, `run` refuses with exit 10 and nothing copied a record that names an oracle, behavior, criterion, observation or citation the run's view does not declare, and a harness names an observation `<label>-<stepId>` (labels `trial-<n>`, `attempt-<n>`, `baseline`, `degenerate`, `mutated`, `re-pass-<n>`) or `<label>-call-<n>`.

When the contract declares a rubric, the harness also runs its own scorer over each labelled item in `policy/judge-calibration.json`, handing it the response and no label, and writes `sealed-records/calibration-judgments.json`: `{ "schemaVersion": 1, "scorerConfigurationDigest": "sha256:...", "items": [{ "rubricId", "criterionId", "scorerInput", "answer" }] }`. `answer` is an anchored level or `null`. `scorerInput` is the label-free observation the runtime derives from the item, `interfaceId` included, and is compared whole, so a label such as `expectedLevel` or a different response fails.

Write `evaluator-configuration.json` first (the two `tea.judgeCalibration*` bindings may be absent), then run `tea-evaluate digest --evaluation <folder> --calibration-inputs` and copy its `scorerConfigurationDigest` and each item's `rubricId`, `criterionId` and `scorerInput` into the judgments file verbatim, adding only `answer`; then bind `tea.judgeCalibrationDigest` to its `calibrationDigest`. Bind `tea.judgeCalibrationMinimumAgreement` to `evaluation.json.judgeCalibration.minimumAgreement`, the one binding value the command does not print. Bind both values before you seal any record or isolation manifest: each one names `evaluatorConfigurationDigest`, the digest of the final configuration with its bindings, and `run` refuses a record sealed against an earlier one. The printed values hold for the contract, the configuration (the two `tea.judgeCalibration*` keys aside) and the labelled file the command read, so run it again, recopy, and re-seal every record and isolation manifest after editing any of them. The command prints one JSON document and writes nothing. It exits 10 for an evaluator that is not `records` or a contract with no rubric, which need no judgments file; any other `judge-calibration` finding says what to fix, and the configuration must be a complete eval-quality `EvaluatorConfiguration` bar the two bindings.

`check` and `run` verify the judgments and bindings with one function: absent or unverifiable ones exit 10 (`check` reports the `judge-calibration` rule). `run` then computes agreement and exits 11 below the minimum before any record is copied, with `judge-calibration.json` in the run directory. A `records` evaluation with no rubric needs no judgments file. The runtime verifies the binding and the label-free input and cannot prove the harness ran its scorer; a harness that needs that proof runs its scorer through a `command` evaluator.

The [Evaluate CLI reference](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/docs/reference/tea-evaluate-cli.md#the-evaluation-layer) gives the required record layout and the calibration judgments layout.

### Installed agent adapter version

`tea-evaluate run` observes the configured agent executable's installed adapter version before calibration or qualification. The `claude` adapter reads its CLI's own `--version` output. A custom adapter's configured command answers `--version` (appended after its `agentArgs`) on stdout with one line of JSON whose `agentVersion` is a three-part semantic version, for example `{"agentVersion":"1.2.3"}`. Plain text, a missing or repeated `agentVersion`, malformed JSON, several lines, a value such as `latest` that is not a semantic version and a value longer than 256 characters exit 12 before calibration, so a dependency's version printed by the command never becomes the agent's. Its stderr stays free for logging. If your custom command printed a bare version before, change that output to the JSON line. The run records that version in `evaluator-configuration.json` as `tea.evaluatorAgentVersion` and in `run.json` under `evaluator.version`. A missing, unreadable or changed version stops the run with exit 12 before an affected judgment counts. The run checks again before every agent launch and after each trial. An agent CLI upgrade changes the evaluator configuration digest and scoring version, so run a fresh qualification and update `evaluator/LEARNED.md` with the new installed version and what changed. Keep the declared model snapshot fixed while comparing runs across an adapter upgrade.

## Selection rubric

Discuss each criterion with the adopter before choosing an option. Record the reason and installed version in the evaluation folder. The table's `evaluator.kind` values are the four values the runtime accepts. For a `command` choice, keep framework-specific code under the adopter's `evaluator/` folder, install its dependencies in the adopter's evaluation folder, and declare the executable, timeout and permitted environment keys in `evaluation.json`, and each installed framework in `evaluator/frameworks.json`.

| Option                          | `evaluator.kind`     | Determinism                               | Need for a model and its credentials                  | Visibility of process and trajectory                                          | Need for reference outputs                      | Rubric and calibration needs                | Language and runtime fit with adopter                  | Licence                          | Maintenance and version drift                     | Cost per trial                                      | CI tier fit                                                      |
| ------------------------------- | -------------------- | ----------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------- | ------------------------------------------------------ | -------------------------------- | ------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| TeA deterministic evaluator     | `deterministic`      | Repeatable checks                         | Model only for a rubric judge; supply its credentials | Reads captured observations, including trajectory when the adapter records it | Needed when an oracle compares with a reference | Calibrate a declared rubric judge           | Runs in TeA's Node runtime                             | TeA and eval-quality terms apply | Track TeA and engine versions                     | Target execution plus optional judge                | Good for secret-free `pr` when no model runs                     |
| Sealed-brief agent evaluator    | `sealed-brief-agent` | Sampled judgment, qualified before trials | Agent model and credentials required                  | Chooses calls through the bridge; recorded calls expose process               | Optional; the brief withholds answer keys       | Calibrate rubric judgments                  | Requires a supported agent adapter and bridge          | Check agent and model terms      | Pin and record model snapshot and adapter version | Model calls on each trial and qualification attempt | Live `scheduled` or `release`; replay evidence on `pr`           |
| Adopter harness sealing records | `records`            | Depends on the harness                    | Depends on the harness and judge                      | Harness must capture every oracle channel and provenance                      | Depends on its judgments                        | Harness scorer, calibrated by its judgments | Works with the adopter's existing runtime              | Check harness dependencies       | Harness owns format and version upgrades          | Harness execution plus scoring                      | Any tier its dependencies permit                                 |
| Skill-specific evaluator        | `command`            | Depends on the skill checks               | Optional model and credentials                        | Reads TeA observations; can inspect skill traces                              | Choose per skill oracle                         | Calibrate any rubric judge                  | Executable under `evaluator/` can wrap another runtime | Check dependencies               | Maintain the skill-specific adapter               | Target plus evaluator calls                         | `pr` if deterministic and secret-free; live tier if model-backed |
| Custom evaluation code          | `command`            | Set by its implementation                 | Optional model and credentials                        | Reads TeA observations and cites them                                         | Choose per oracle                               | Calibrate any rubric judge                  | Wrap the adopter's language with an executable         | Check dependencies               | Adopter maintains code and output contract        | Measure per trial                                   | Place by secrets, duration and cost                              |
| External evaluation framework   | `command`            | Depends on chosen assertions              | Depends on framework evaluator and credentials        | Check access to process trace and cited output                                | Depends on framework mode                       | Map rubric scores and calibrate judges      | Wrap its installed API or CLI under `evaluator/`       | Verify framework licence         | Verify installed API and changelog on upgrade     | Measure framework and model calls                   | Deterministic assertions on `pr`; model calls in live tiers      |

## Framework landscape

The list is illustrative. Any framework is admissible through the import contract. [AgentEvals](https://github.com/langchain-ai/agentevals) can score an agent's tool-call trajectory with a deterministic strict matcher; [the calling-agent fixture](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/tree/main/test/fixtures/evaluate-tool-use-agent) demonstrates its judgment rows and reference trajectory. [promptfoo](https://github.com/promptfoo/promptfoo) can run deterministic assertions over already captured outputs; [the summary fixture](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/tree/main/test/fixtures/evaluate-promptfoo) imports its per-assertion results. Their starter executables are `assets/evaluators/agentevals-trajectory.mjs` and `assets/evaluators/promptfoo-assertions.mjs`, each paired with the version probe `assets/evaluators/installed-version.mjs` and a declaration template (`agentevals-frameworks.json`, `promptfoo-frameworks.json`) whose `<installed version>` you replace. Other frameworks need the same evidence path and may use a different language behind a `command` executable.

For AgentEvals, copy a regular, tracked reference trajectory to `evaluator/reference/trajectory.json`, or set `evaluator.args` to `--reference=reference/<name>.json` for another tracked file under that directory. The template rejects paths or links outside the digested reference tree. The target's stdout must carry the JSON trajectory after `trajectory:` and one space; set `--prefix=<text>` if its prefix differs. Bind the `trajectory_strict_match` row key to the trajectory oracle in `evaluator/mapping.json`. For promptfoo, put the assertions in `evaluator/asserts.yaml` and give each assertion a distinct `metric` that exactly matches its key in `evaluator/mapping.json`. Assertion order can change without changing the mapping. A trial must judge every mapped assertion exactly once. The starter admits only assertions that run no adopter code and call no model (the types and what stops the trial are under Separate ungraded framework errors from graded target failures below). The wrapper runs promptfoo over the captured stdout in a temporary directory; `--stdout-prefix=<text>` selects an observation when the trial has several stdout channels. Each prefix must identify exactly one observation, or the template stops with an ambiguity error. This installed promptfoo CLI removes one final line feed from model outputs; use another evaluator for an oracle that judges that byte. Install the chosen framework as a dependency of the adopter's evaluation folder and declare its installed version (see Declare the installed framework versions below), copying `installed-version.mjs` into `evaluator/` and the declaration template to `evaluator/frameworks.json`.

## Separate ungraded framework errors from graded target failures

A framework result is target evidence only when the framework graded the output. A graded assertion with `pass: false` becomes a `fail` row that quotes the observed channel when the assertion is of an admitted kind (see below); a graded `pass: true` becomes a `pass` row. For promptfoo the grade is the result's `gradingResult`, with one `componentResults` entry per assertion when several ran.

A result with no grade, with or without an `error` string, says only that the framework could not judge the output. It establishes nothing about the target, so the wrapper writes no row for it: it exits non-zero with a diagnostic naming the ungraded framework error. `tea-evaluate run` then ends as evaluator infrastructure failure (exit 12) and seals no record for the trial. The evaluator's stderr in the run directory (`evaluator/<arm>/trial-<n>.stderr`) holds the diagnostic, which carries only the first line of the framework's error. Reproduce the result by running the installed framework directly over the captured stdout, as in step 4 of the procedure below, read the full error, fix the assertions or the framework setup, and run again.

A graded result still stops the trial when its assertion runs code, calls a model, or would report a grade the target did not earn.
With promptfoo 0.123.1 a thrown `javascript` assertion, and an allow-listed assertion whose `value` is a `file://` reference to a Python or Ruby file that raises, arrive graded `pass: false` with the crash text as the `reason`, and promptfoo sets an `error` string on every failed assertion, so neither `error` nor the shape of the result separates a crash from a failure.
The starter admits the assertion types `contains`, `icontains`, `contains-all`, `contains-any`, `icontains-all`, `icontains-any`, `equals`, `starts-with`, `regex` and `is-json`, each also with a `not-` prefix.
The types run no adopter code and call no model, and the guards below keep a value or a key of an admitted type from doing either, or from reporting a grade the target did not earn.
Any other type stops the trial: `javascript`, `python`, `ruby`, `webhook`, and a model-graded type such as `llm-rubric` or `factuality`.
An admitted type also stops the trial when its `value` loads code: a string `value` that is a `file://` reference whose path (the text before the first colon) ends in `.js`, `.cjs`, `.mjs`, `.ts`, `.cts`, `.mts`, `.py` or `.rb` in any letter case, an element of an array `value` that is such a reference, or a string `value` that starts with `package:`.
A `file://` reference to a `.json`, `.yaml`, `.yml` or `.txt` file is data and stays admitted, and so does a `package:` string inside an array `value`, which promptfoo reads as plain text.
A string `value`, or a string element of an array `value`, that contains `{{`, `{%` or `{#` stops the trial too: promptfoo renders it as a nunjucks template, which can run code and can derive the expected value from the output, so the oracle is no longer the one you wrote; to match literal braces write a `regex` or `not-regex` pattern with escaped braces such as `[{][{]`.
A `regex` or `not-regex` assertion whose string `value` does not compile as a regular expression stops the trial, because promptfoo grades the pattern error as a failure of the target.
A `regex` or `not-regex` assertion whose string `value` is a `file://` reference stops the trial too, because promptfoo compiles the file's content after the wrapper's check, so write the pattern inline.
An assertion with `weight: 0` stops the trial, because promptfoo then reports a failed assertion as a pass.
An assertion that carries a `transform` (any value other than null) stops the trial as well, because the transform rewrites the output before the assertion grades it and the row would grade text the target did not produce.
An assertion that needs code, or that grades a rewritten output, belongs in a `command` evaluator you own, where a crash exits non-zero.
The wrapper reads the assertions promptfoo reports it ran, so promptfoo has already run the code when the wrapper refuses the result.
The refusal names the assertion type and the reason in the same stderr file.

The grade set must be complete. The imported result carries one grade for every mapped assertion, each exactly once. A missing grade, a repeated grade or a grade without a boolean `pass` stops the trial with no record, even when another assertion graded, because a partial set would let a pass stand for an assertion nobody judged.

The three inputs below are payloads for `node promptfoo-assertions.mjs --map-results`, read from stdin by the starter copied into an `evaluator/` folder whose `mapping.json` defines the key `required-pears`. The first has no grade and the wrapper refuses it:

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

The third is a graded failure that is a crash: `file://boom.py` raised, promptfoo graded the result `pass: false`, and the wrapper refuses it for the value that ran code:

<!-- example:promptfoo-refused -->

```json
{
  "observation": {
    "observationId": "trial-1-summarize",
    "stdout": { "kind": "text", "value": "Summary for List pantry: apples, pears\n" }
  },
  "results": [
    {
      "response": { "output": "Summary for List pantry: apples, pears" },
      "testCase": { "assert": [{ "type": "contains", "value": "file://boom.py", "metric": "required-pears" }] },
      "gradingResult": {
        "pass": false,
        "reason": "Error running Python script: RuntimeError: deliberate assertion error",
        "componentResults": [
          {
            "pass": false,
            "reason": "Error running Python script: RuntimeError: deliberate assertion error",
            "assertion": { "type": "contains", "value": "file://boom.py", "metric": "required-pears" }
          }
        ]
      }
    }
  ]
}
```

## Declare the installed framework versions

A `command` evaluator that depends on an installed framework declares it in `evaluator/frameworks.json`, a tracked file the evaluator tree digest covers.
A package in `node_modules` sits outside that tree, so without a declaration an upgrade would change the judgments while the scoring configuration stays the same.
Each entry names the package, the one exact version expected and a version probe.
Declare `installState` when plugins or transitive packages can change judgments, a package is locally patched, or a dependency range can resolve to different installed trees under one top-level version. The version alone suffices when that exact package release is the complete judgment dependency and its installed files cannot be changed independently.
Set `installState.source` to `tree` to digest the package's installed files in sorted path order. Set it to `lockfile` to digest the package's entry in the nearest npm `package-lock.json`. The declaration names the source and never pins an observed digest.
Each source covers one declared package. Declare every plugin or transitive package that contributes judgments as a separate framework entry, including a hoisted package outside the first package's installed tree. Use `tree` for linked or locally patched packages; their installed files can differ from a lockfile entry under the same version.
The probe is an executable under `evaluator/` that prints `{"package": "<name>", "version": "<installed version>"}` for the installed package and exits non-zero when the package is not installed.
`assets/evaluators/installed-version.mjs` is that probe for any Node package: pass the package name as its argument.
For declared install state, pass `tree` or `lockfile` as its second argument. The probe then prints `installSource` and `installDigest` beside `package` and `version`, with the digest in `sha256:<64 lowercase hex digits>` form. The reported source must equal `installState.source`. A missing, malformed or mismatched observation stops `run` with exit 12 before any affected trial seals.
Place the shipped Node probe beside the evaluator wrapper so both resolve `node_modules` from the same location. If the wrapper loads packages from another location, write a custom probe that resolves from that wrapper's actual location.
When the wrapper imports a nested package, add `--importer <package>` after the source argument in the tracked `probe.args`. Repeat it in import order for deeper nesting. For example, `["acme-evals-helper", "tree", "--importer", "acme-evals", "--importer", "acme-evals-plugin"]` resolves `acme-evals` from beside the probe, `acme-evals-plugin` from that package, then `acme-evals-helper` from the plugin. Each step uses Node's nearest `node_modules` search from the previous package's directory; an importer that cannot be resolved makes the probe exit non-zero.
For a linked importer, the probe follows the importer's real path before resolving the next package, matching Node's default module resolution. If two same-name dependency copies live inside different importer trees, declare each importer package with `tree` as a separate framework entry; each importer tree digest includes its nested copy. `frameworks.json` still names a package once.
Run the tracked probe command with the exact `probe.args` from `frameworks.json`, including the source and any `--importer` chain, to read the installed version. Copy that reported version into `frameworks.json` and `LEARNED.md`.
An evaluator with no installed framework dependency declares `"frameworks": []`.
Declare the framework and any plugin or provider package whose behavior produces the judgments.
Install the declared version exactly (`npm install --save-exact <package>@<version>`) and track the evaluation folder's `package.json` and lockfile, so a clean install or CI resolves the same release.

<!-- example:frameworks -->

```json
{
  "schemaVersion": 1,
  "frameworks": [
    {
      "package": "acme-evals",
      "version": "1.2.3",
      "probe": { "command": "evaluator/installed-version.mjs", "args": ["acme-evals"], "probeTimeoutMs": 10000 }
    }
  ]
}
```

For a framework with a separately installed judgment plugin, declare each package and its source:

<!-- example:frameworks-install-state -->

```json
{
  "schemaVersion": 1,
  "frameworks": [
    {
      "package": "acme-evals",
      "version": "1.2.3",
      "installState": { "source": "tree" },
      "probe": { "command": "evaluator/installed-version.mjs", "args": ["acme-evals", "tree"] }
    },
    {
      "package": "acme-evals-plugin",
      "version": "2.0.0",
      "installState": { "source": "tree" },
      "probe": { "command": "evaluator/installed-version.mjs", "args": ["acme-evals-plugin", "tree"] }
    }
  ]
}
```

For a framework in another language, write the probe in that language.
The run launches it with only the base environment and the evaluator's `environmentKeys`, in an empty private working directory and under the run's confinement, so it activates no virtual environment. `probe.probeTimeoutMs` is optional and defaults to 10,000 ms (10 seconds). `tea-evaluate check` accepts integers from 1 to 60,000 ms (60 seconds). The effective bound is the smaller of that value and `evaluator.timeoutMs`; the command evaluator keeps its own timeout. `framework-versions.json` records each probe's effective bound.
It must find the same installation the wrapper uses, by a path relative to its own file or a pinned interpreter, and read installed metadata (in Python, `importlib.metadata.version`) without importing or running the framework.
It prints the package string exactly as `frameworks.json` declares it, which is limited to letters, digits, `.`, `_`, `-`, `~` and an optional `@scope/`.
The version starts with a digit, so a probe for an ecosystem that reports `v1.2.3` prints `1.2.3`.

`tea-evaluate run` reads the installed versions before the first trial, before each launch of the evaluator and after each trial.
For each framework, multiply its effective bound by one initial read plus two reads per trial plus two reads per calibration launch, then sum those products across frameworks. A hanging probe costs one effective probe timeout plus the supervisor's cleanup grace because the run stops at the first unreadable read.
A package that is missing, installed at a version other than the declared one, or changed during the run ends the run with exit 12 and seals no record for the affected trial.
Either reinstall the declared version or make the deliberate upgrade below.
The observed versions join the evaluator configuration, so a changed version changes the scoring version, and `framework-versions.json` in the run directory keeps the declared and observed versions, and the output of any probe that failed.
The observed `installDigest` also joins `tea.evaluatorFrameworks`, `framework-versions.json` and `run.json` when `installState` is declared. A changed digest under the same version changes the configuration digest and scoring version. The run rechecks it before each evaluator launch and after each trial.
`tea-evaluate check` runs no probe.
It refuses an absent or malformed declaration, and it reads `evaluator/LEARNED.md`: the "Framework and installed version" section carries one backticked `package@version` for each declared package, and a different version, a missing one or a package the declaration omits is a finding.
Write the runtime and any other version in that section as plain prose, because every backticked `package@version` there is read as a record.

An upgrade is a deliberate change, including the one `npm install` at the `latest` spec makes.
Read the new version's API and release notes, run the known pass and known fail again, update `LEARNED.md` and `frameworks.json` together, commit both and run again.

## Learn an unfamiliar framework

1. Read primary sources only: the framework's documentation, repository, API reference, examples and changelog. Record URLs or commit references for every API or behavior you use. Do not adopt a claim from a secondary summary.
2. Find how the framework takes inputs, invokes or observes the target, judges, returns results, and whether it needs a model or credentials. Check whether it exposes every process and output channel the oracles need.
3. Install the version the adopter uses. Record the package name, installed version, runtime and licence, and declare the package, version and a version probe in `evaluator/frameworks.json`. Read that installed version's API and release notes before writing the adapter.
4. Execute a minimal example against a known pass and a known fail with that installed version. Save the command, input, stdout, stderr, exit status and framework result for both. Add a third case the framework cannot grade (a malformed assertion value, a missing credential, a timeout) and record how its result arrives; a thrown assertion may arrive as an ordinary failing grade, so refuse in the wrapper the assertion kinds that run adopter code or call a model. A documented API claim that execution contradicts remains unadopted until resolved.
5. Fill `evaluator/LEARNED.md` from `assets/evaluators/LEARNED.md`: framework and installed version (the backticked `package@version` that `frameworks.json` declares), each fact used with its primary source, executed pass and fail output, and contradictions. Keep the file with the evaluator so its digest captures the learned conditions.
6. Map each framework result to a stable judgment key in `evaluator/mapping.json`. Write a `command` wrapper under `evaluator/` that reads `{ sealedBrief, observations }` from stdin and prints `{ rows, recommendation? }`. Make failures quote the actual observation, and make the wrapper exit non-zero on a result the framework did not grade and on an assertion that runs adopter code or calls a model. Run `tea-evaluate check` and `preflight` now. After the mutation and run stages have supplied their artifacts, run and score a clean control and a seeded defect. Accept the full pipeline only when eval-quality resolves `passed-clean-control` and `caught`.

## Vendor rule

The framework and any judge model are fixed conditions of a run. Record the installed framework version in a tracked `evaluator/LEARNED.md` file and the model snapshot in `policy/evaluator-conditions.json`. For a `command` evaluator, also declare the framework in `evaluator/frameworks.json`; the runtime stops with exit 12 on a package that differs. Update the record and the declaration together whenever the installed dependency changes. The system under test is the adopter's use of the vendor dependency. Mutate the adopter's prompts, context, wiring, validation or state handling; keep the vendor version and model snapshot fixed across arms.
