# Run

Run from the sealed evaluation folder after its target registry, evaluator, mutations, policy and conditions pass `check`. Save each command, exit status, stderr and resulting artifact path in the run log. Stop the command sequence on a nonzero stage exit; retain diagnostics and route the failure through the gaps guide before retrying. eval-quality alone decides verdict and strength.

## Install the private latest-spec runtime

In `{tea_evaluations_folder}`, create a private `package.json` with TeA and eval-quality as `devDependencies` at the `latest` spec. The adopter decides whether to track this manifest and its lockfile for reproducibility. Keep the installed versions in the run log. Node >=22.20.0 is required. Install with `npm install --prefix {tea_evaluations_folder}`. Stage 6 installs `assets/evaluation-folder.gitignore` as `<evaluation-folder>/.gitignore` before the first preflight; verify that it still ignores `runs/` before this run. When `{project-root}` is TeA's own package, invoke `node cli/evaluate.js` from the repository root for TeA commands so the local source is tested. Use the same local engine installation for `eval-quality`.

<!-- example:package -->

```json
{ "private": true, "devDependencies": { "eval-quality": "latest", "bmad-method-test-architecture-enterprise": "latest" } }
```

## Check, compile, seal and preflight

For an adopter installation, execute these commands in order. Replace `<evaluation-folder>` with the chosen folder and stop at any nonzero exit. `compile` checks the contract; `seal` freezes the brief; `preflight` exercises the actual registry and clean control. Re-run from `check` after changing an input.

```sh
npm exec --prefix {tea_evaluations_folder} -- tea-evaluate check --evaluation <evaluation-folder>
npm exec --prefix {tea_evaluations_folder} -- eval-quality compile --in <evaluation-folder>/contract.json --out <evaluation-folder>/compiled-contract.json
npm exec --prefix {tea_evaluations_folder} -- eval-quality seal --in <evaluation-folder>/contract.json --out <evaluation-folder>/sealed-brief.json
npm exec --prefix {tea_evaluations_folder} -- tea-evaluate preflight --evaluation <evaluation-folder>
```

Inside TeA, run `node cli/evaluate.js` from the repository root for every `tea-evaluate` subcommand, retaining its arguments. Run compile and seal through `./node_modules/.bin/eval-quality` from that same root. For example, `node cli/evaluate.js preflight --evaluation <evaluation-folder>` and `./node_modules/.bin/eval-quality compile --in <evaluation-folder>/contract.json --out <evaluation-folder>/compiled-contract.json` use the repository's one local eval-quality installation. The Stage 6 sequence uses this same branch before the first preflight.

## Run development and score

```sh
npm exec --prefix {tea_evaluations_folder} -- tea-evaluate run --evaluation <evaluation-folder> --partition development
npm exec --prefix {tea_evaluations_folder} -- tea-evaluate score --evaluation <evaluation-folder> --run <invocationId>
```

Use the `invocationId` emitted by `run`; it names `runs/<invocationId>/` and is the value `score --run` accepts. Each trial set has its own `runId`, which is a different identifier. The runtime qualifies mutations against a passing baseline, calibrates any rubric judge, qualifies a sealed-brief agent evaluator on the clean and mutated arms, executes clean and mutated trials through the chosen evaluator, verifies rollback, and seals records and isolation manifests. `score` delegates every probe to eval-quality and persists per-probe diagnostics under `runs/<invocationId>/scores/<scoreInvocationId>/`, plus evidence artifacts, the run-wide `strength-aggregate.json`, `interpretation.json`, `partitions.json` and `gap-view.json`. Preserve both the command exit and each per-probe exit. A clean control should resolve `passed-clean-control` and the seeded defect `caught`; read those states from the evidence artifact. If a development `score` exits 3 with no artifact, read its persisted `score.json`, stdout and stderr diagnostics and route the fault through the gaps guide. For a held-out fault, read only `gap-view.json` and reproduce the class failure in development before inspecting diagnostics.

## Read development strength before held-out

Read the run-wide aggregate the development `score` invocation copied to `runs/<invocationId>/scores/<scoreInvocationId>/strength-aggregate.json`. The `strengthAggregate` pointer in `partitions.json`, `interpretation.json` and that invocation's `score.json` gives its `status`, which must be `copied`. eval-quality's `aggregate-strength` stage owns every count, rate, comparability and decision in the file, so copy them and compute none. For each class in `floorDecisions`, record the `floor` declared in `evaluation.json.strengthFloor` (copied beside the aggregate as `strength-floors.json`), the engine's floor decision (`meets`, `does-not-meet` or `undeclared`) with its `basis`, and the class's `eligible`, `exercised`, `caught`, `rate` and `comparable`. A class with no floor in `evaluation.json.strengthFloor` reads `undeclared` with basis `no-floor-declared`; the readings that follow apply under a declared floor. A `null` class has no eligible probe. A class with `rate: null` has eligible probes and none exercised. A class with `comparable: false` fell below `minimumTrialCount` or left an oracle unreached, and under a declared floor reads `does-not-meet` with basis `not-comparable`. None of the three is a pass. A `status` of `absent`, `refused`, `mismatch` or `failed` means no aggregate stands, so the guide makes no class-wide claim: record the status and its reason, and route the cause through the gaps guide. Each probe's own evidence artifact still carries `strength.comparable` and `strength.vector` for that one probe, which is where to read a missed probe or an uncovered class. Clean controls and canaries stay outside every denominator. Show the adopter each class decision beside the per-probe evidence and unresolved gaps. A `does-not-meet` class gets a development repair, or the adopter's declined reason on record, before held-out. Make no new verdict.

## Run held-out after development review

After the adopter confirms held-out readiness from the development evidence and recorded gaps, run `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate run --evaluation <evaluation-folder> --partition held-out`, then score that invocation ID with the command form above. In TeA's own package, use `node cli/evaluate.js` from the repository root. Read held-out outcomes through `gap-view.json` only. Keep held-out probe content closed during the authoring loop; use its ID, class and outcome to identify the class needing new development evidence.
