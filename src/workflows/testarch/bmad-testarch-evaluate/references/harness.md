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

On Linux a confined target also runs in a network namespace of its own with a loopback and nothing else, which cuts an agent off from its model provider. Declare `"network": "host"` on the registry entry of a skill or agent target, and of any target that calls a model, an outside service or a database on the host, until Story 1.83 gives a confined target a route to the hosts its entry authorizes. The entry keeps the host's network and so a route to the host's abstract Unix sockets, which `run.json` records under `hostNetwork`; every other entry keeps the default, `"network": "isolated"`. macOS Seatbelt ignores the field.

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
  "infrastructureExitCodes": [3, 4, 5, 6],
  "network": "host"
}
```

This entry is the working [source fixture: evaluation.json](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/test/fixtures/evaluate/preflight/evaluation.json) that runs confined with no `confinement` field and declares `"network": "host"`, as an agent entry does. Add the agent's credential names to `environmentKeys` for a real agent.

## Declare what a confined target reads

A confined target reads the whole host except the evaluation folder, the project's git directory and the user's private root. The audit lists every path it opens outside what the trial was granted: the workspace, the call's temp directory, the private home, the Node installation the runtime runs from and the operating system's own directories. Each listed path becomes an `observedMounts` entry of the trial set's isolation manifest, and `score` then exits 3 (Invalid) with one `mount outside allowlist` reason per path. Executing a binary reads it, so a toolchain outside those grants is listed too.

List what the target legitimately reads in its registry entry's `systemPaths`: absolute host paths, each free of double quotes, backslashes and control characters, such as a language installation, a rules directory or a cache. A command, tool-server or HTTP entry takes the field, and an HTTP entry's list covers the service it starts. Ask the adopter to confirm each path before declaring it and name the narrowest directory that holds it, such as one language installation or one rules directory. The list grants reads only; a confined target writes nothing outside its workspace and its private directories, and the audit lists every access to the evaluation folder, the project's git directory or the user's private root even under a declared path. Two entries that start the same target declare the same `systemPaths` and the same `network`, or `check` exits 10.

<!-- example:evaluation-fragment -->

```json
{
  "registry": [
    {
      "interfaceId": "verdict",
      "executable": "verdict",
      "target": "bin/verdict.js",
      "subcommandPaths": [[]],
      "artifacts": {},
      "environmentKeys": [],
      "maxElapsedMs": 20000,
      "infrastructureExitCodes": [3],
      "systemPaths": ["/opt/verdict-rules"]
    }
  ]
}
```

This `evaluation.json` fragment declares `/opt/verdict-rules`, the one directory the `verdict` target reads beyond the system. It keeps the default network and runs confined. Merge its `registry` entry into the evaluation's registry, then run `check` and rerun development.
