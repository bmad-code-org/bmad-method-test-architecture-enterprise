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

Inside TeA, replace each `tea-evaluate` command with `node cli/evaluate.js`, retaining its arguments. For example, `node cli/evaluate.js preflight --evaluation <evaluation-folder>`.

## Run development and score

```sh
npm exec --prefix {tea_evaluations_folder} -- tea-evaluate run --evaluation <evaluation-folder> --partition development
npm exec --prefix {tea_evaluations_folder} -- tea-evaluate score --evaluation <evaluation-folder> --run <invocationId>
```

Use the `invocationId` emitted by `run`; it names `runs/<invocationId>/` and is the value `score --run` accepts. Each trial set has its own `runId`, which is a different identifier. The runtime qualifies mutations against a passing baseline, calibrates any rubric judge, executes clean and mutated trials through the chosen evaluator, verifies rollback, and seals records and isolation manifests. `score` delegates every probe to eval-quality and persists per-probe diagnostics under `runs/<invocationId>/scores/<scoreInvocationId>/`, plus evidence artifacts, `interpretation.json`, `partitions.json` and `gap-view.json`. Preserve both the command exit and each per-probe exit. A clean control should resolve `passed-clean-control` and the seeded defect `caught`; read those states from the evidence artifact. If `score` exits 3 with no artifact, read its persisted `score.json`, stdout and stderr diagnostics and route the fault through the gaps guide.

## Read development strength before held-out

Read eval-quality's `strength.comparable` and `strength.vector` from each scored development evidence artifact. For each exercised class in `defect`, `gameability` and `zero-action`, compare its engine-reported `rate` with that class's `evaluation.json.strengthFloor` value. Record the artifact path and whether the rate meets the adopter's floor. Across the development artifacts, a class planned for enforcement that stays `null` or has `rate: null` calls for more development evidence before a strength claim. `strength.comparable: false` also calls for more evidence. Clean controls and canaries have their own outcomes and stay outside the engine's strength vector. Use the engine's reported rates; the guide adds no scoring calculation.

## Run held-out after development is strong

After the development partition is strong at the adopter's policy, run `tea-evaluate run --evaluation <evaluation-folder> --partition held-out`, then score that invocation ID. Read held-out outcomes through `gap-view.json` only. Keep held-out probe content closed during the authoring loop; use its ID, class and outcome to identify the class needing new development evidence.
