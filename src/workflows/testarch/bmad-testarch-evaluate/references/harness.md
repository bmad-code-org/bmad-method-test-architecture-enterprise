# Harness

The adopter chooses the policy for the target's risk. Ask them to name `policyId` and choose `severityFloor`, `minimumTrialCount`, and `catchThreshold` before the first `tea-evaluate check`. Record the reason for each choice in the evaluation notes. Stage 6 may already have created `policy/scoring-policy.json` from `assets/scoring-policy.template.json`; inspect and confirm that policy here, and copy the template only if the route did not need it earlier. Fill its null fields only after the adopter answers. The installed template supplies no defaults for these three thresholds or `policyId`. Ask the adopter to accept or revise its other values, including `confidenceThreshold`, `reExecutionCap`, `remediationCap`, and `regexMatchStepBudget`; record those decisions. Set `evaluation.json.trials` to at least the chosen `minimumTrialCount` before `tea-evaluate check`, which exits 10 when the manifest plans fewer trials. After any policy or trial-count change, run `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate check --evaluation <evaluation-folder>`. For TeA's own package, run `node cli/evaluate.js check --evaluation <evaluation-folder>` from the repository root.

## Choose risk and trials

Use this table to explain tradeoffs. The figures are discussion examples; the adopter selects values for the target. A deterministic evaluator can still exercise variable target behavior. A sampled model needs enough comparable trials to measure repeatability. `severityFloor: low` blocks low, material and critical failures. `severityFloor: critical` blocks critical failures. A lower floor is stricter, so the examples lower it as risk rises.

| Target        | Risk     | Example `severityFloor` | Example `minimumTrialCount` | Example `catchThreshold` | Why discuss this choice                                                              |
| ------------- | -------- | ----------------------- | --------------------------- | ------------------------ | ------------------------------------------------------------------------------------ |
| Deterministic | low      | `critical`              | `1`                         | `0.5`                    | Critical failures block; one repeatable detection may cover a low-consequence check. |
| Deterministic | material | `material`              | `2`                         | `0.75`                   | Material and critical failures block; a second trial exposes hidden state.           |
| Deterministic | critical | `low`                   | `3`                         | `0.9`                    | Every severity blocks; repeated catches protect the consequential invariant.         |
| Sampled model | low      | `critical`              | `5`                         | `0.6`                    | Critical failures block; several samples reveal common model misses.                 |
| Sampled model | material | `material`              | `10`                        | `0.8`                    | Material and critical failures block; more samples reveal variable misses.           |
| Sampled model | critical | `low`                   | `20`                        | `0.95`                   | Every severity blocks; many samples test consistency under critical risk.            |

eval-quality uses the strict rule `caughtCount / validCount > catchThreshold` to decide whether each qualified probe is caught. Equality fails. A threshold of `1` cannot be passed by a finite catch rate. Separately, a probe with fewer completed trials than `minimumTrialCount` makes the strength vector non-comparable; complete the planned trials under the same fixed conditions before reading a trend. Clean controls and canaries guard viability and false positives; the vector excludes them.

## Record evaluator conditions

Stage 6 creates `policy/evaluator-conditions.json` from `assets/evaluator-conditions.template.json`; Stage 7 may update it for the chosen evaluator. Inspect and confirm the existing file here. Copy the template only if the file is absent. Fill `modelSnapshot` with the exact fixed target model. Compute `systemPromptDigest` with eval-quality's `digestBytes` over the actual system prompt bytes; never type a digest by hand. Fill `judge.modelSnapshot` only for a declared deterministic rubric judge; remove `judge` when unused. For a model-free target use `modelSnapshot: "none"` and the empty-byte digest required by the schema, even if its evaluator uses a model. Record the evaluator model separately when its kind requires one. Keep model, prompt, evaluator version, decoding parameters, and isolation conditions fixed across clean and mutated arms.

## Verify isolation

`tea-evaluate run` writes a per-trial-set isolation manifest for the qualified clean and mutated arms. Its runtime verifies the disposable copy and rollback. `tea-evaluate score` passes the manifests and records to eval-quality for structural and evidence validation. Read those diagnostics to confirm trial references and fixed conditions before interpreting strength. A `records` harness must supply its own schema-valid isolation manifest with the sealed records. Preserve these manifests for `score`; a missing one makes the score Invalid. Do not hand-author a claim of isolation in place of run evidence.

## Run a skill or agent target confined

`tea-evaluate` confines every target process it starts, so keep `confinement` on for a skill or agent target. A confined target writes the trial's workspace and the runtime's private directories only, and it cannot read the evaluation folder. An agent CLI behind `tea-skill-runner`, or the agent's own command, writes its session and settings state under `HOME`. Each confined sandbox therefore gets one private home directory that the runtime makes beneath the run's private parent and removes with the run. `HOME` names it, `XDG_CONFIG_HOME`, `XDG_CACHE_HOME` and `XDG_DATA_HOME` name directories inside it, and the profile grants that directory for reading and writing as it grants the call's temp directory. No other home is reachable from it. The adopter's real home and the project stay unwritable. No registry field declares a writable path, since the private home covers the state an agent CLI writes.

The home keeps its state across the calls of one trial or arm, so an agent's session continues, and each independent arm or leg starts empty: the next trial, the baseline, mutated and re-pass arms of a qualification, and each leg of a `preflight`. List the credential variables the agent needs under `environmentKeys` (for example the vendor's API key name); the runtime passes their host values and sets the home variables over any host value, `HOME` included. A login the agent stored under the adopter's real home is not found under the private home, so give that agent its API key variable. A run with `"confinement": false` keeps the host environment and makes no home; use it only for a target that must write outside its workspace.

<!-- example:registry -->

```json
{
  "interfaceId": "stub-skill",
  "executable": "tea-skill-runner",
  "target": "tea-skill-runner",
  "subcommandPaths": [[]],
  "artifacts": {},
  "environmentKeys": [],
  "maxElapsedMs": 60000,
  "infrastructureExitCodes": [3, 4, 5, 6]
}
```

This entry is the working [source fixture: evaluation.json](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/fixtures/evaluate/preflight/evaluation.json) that runs confined with no `confinement` field. Add the agent's credential names to `environmentKeys` for a real agent.
