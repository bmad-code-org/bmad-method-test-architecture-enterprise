# Run

Run from the sealed evaluation folder after its target registry, evaluator, mutations, policy and conditions pass `check`. Save each command, exit status, stderr and resulting artifact path in the run log. Stop the command sequence on a nonzero stage exit; retain diagnostics and route the failure through the gaps guide before retrying. eval-quality alone decides verdict and strength.

## Install the private latest-spec runtime

In `{tea_evaluations_folder}`, create a private `package.json` with TeA and eval-quality as `devDependencies` at the `latest` spec. The adopter decides whether to track this manifest and its lockfile for reproducibility. Keep the installed versions in the run log. Node >=22.20.0 is required. Install with `npm install --prefix {tea_evaluations_folder}`. Stage 6 installs `assets/evaluation-folder.gitignore` as `<evaluation-folder>/.gitignore` before the first preflight; verify that it still ignores `runs/`, `compiled-contract.json` and `sealed-brief.json` before this run. When `{project-root}` is TeA's own package, invoke `node cli/evaluate.js` from the repository root for TeA commands so the local source is tested. Use the same local engine installation for `eval-quality`.

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

Under a `partitionPlan`, give the `preflight` command `--partition development`. A preflight with no `--partition` builds the both view and launches the held-out request while the gap loop is still open; run `--partition held-out` only after the development review.

Inside TeA, run `node cli/evaluate.js` from the repository root for every `tea-evaluate` subcommand, retaining its arguments. Run compile and seal through `./node_modules/.bin/eval-quality` from that same root. For example, `node cli/evaluate.js preflight --evaluation <evaluation-folder>` and `./node_modules/.bin/eval-quality compile --in <evaluation-folder>/contract.json --out <evaluation-folder>/compiled-contract.json` use the repository's one local eval-quality installation. The Stage 6 sequence uses this same branch before the first preflight.

## Run confined

`preflight` and `run` confine every process they start, before any of them starts, through the mechanism the host provides: Seatbelt through `sandbox-exec` on macOS and Bubblewrap through `bwrap` on Linux (`apt-get install bubblewrap`). Each mechanism also needs the observer its audit reads: `log stream` on macOS, and `strace` on Linux (`apt-get install strace`, version 6.1 or later, which needs ptrace). The runtime first confines a trivial process and confirms the observer. A host with neither mechanism, a mechanism the host refuses (a kernel that forbids unprivileged user namespaces, a container that forbids a network namespace), an observer that cannot confirm itself, a temp directory inside the evaluation folder, or an evaluation folder or temp directory whose path holds a double quote, a backslash or a control character stops the command with exit 12 and names the reason. A `tea-evaluate` started from inside a Seatbelt sandbox, such as an agent's tool on macOS, is refused as well, since `sandbox-exec` cannot apply a profile there; start it from an unsandboxed terminal. Repair the named host condition and rerun `preflight`.

Set `"confinement": false` in `evaluation.json` to run the targets unconfined. `run.json` then records `"confinement": "opt-out"`, the run observes no file-system access, so its `observedMounts` are empty and carry no evidence, the target can reach the evaluation folder, and `score` says so in its summary. Use the opt-out for a target that must write outside its workspace, commit or read the project's git directory, and record the adopter's reason in the evaluation notes.

On Linux an entry runs its processes in a network namespace of their own with a loopback and nothing else, and an HTTP service the target starts stays reachable from the runtime through a bridge the runtime owns, provided the service listens on `127.0.0.1` or `::1`, since any other address stops the call.
An entry that lists hosts in `egress` also gets, for each call, a proxy the runtime owns that tunnels a request for a listed host and port and refuses every other, so the target reaches those hosts and nothing else, and no entry reaches the host's abstract Unix sockets.
macOS Seatbelt ignores the field.
A confined target cannot connect to a socket file of the host that exists when its call starts (Bubblewrap masks it and answers `ECONNREFUSED`, macOS Seatbelt denies it and answers `EPERM`), so a target that needs a host service through one opts out with `"confinement": false`.
A socket file a host process binds after the call started is reachable wherever nothing masks or denies its path: under Bubblewrap anywhere outside the masks, on macOS only inside the granted paths and the bridge's shape beneath the private root.
The reason is that seccomp cannot read a socket's path, a network namespace does not scope path sockets and AppArmor needs a profile that root loads, so Bubblewrap has no way to refuse a connection to a path once the process has started.

`run.json` records what the targets ran under. `confinement` is `seatbelt`, `bubblewrap` or `opt-out`. `egress` lists each entry that lists hosts with its `host:port` items and is `[]` when none does.
Read both before reading a verdict, and tell the adopter which hosts each entry may reach.
Only a `bubblewrap` run holds an entry to its `egress`; under `seatbelt` and `opt-out` every entry keeps the host's network.
`egressRefusals` lists each trial whose proxy refused a request, with the host, the port and the entry, and is `[]` when none did; when a trial is listed, say so before reading its verdict, since a target refused its provider fails for that reason. `hostSocketTruncation` lists each trial whose calls left sockets of other users reachable because the host held more Unix sockets than a call can hide, and is `[]` when no call was cut; when an entry is listed, say so before reading that trial's verdict.

## Run development and score

```sh
npm exec --prefix {tea_evaluations_folder} -- tea-evaluate run --evaluation <evaluation-folder> --partition development
npm exec --prefix {tea_evaluations_folder} -- tea-evaluate score --evaluation <evaluation-folder> --run <invocationId>
```

Use the `invocationId` emitted by `run`; it names `runs/<invocationId>/` and is the value `score --run` accepts. Each trial set has its own `runId`, which is a different identifier. The runtime qualifies mutations against a passing baseline, calibrates any rubric judge, qualifies a sealed-brief agent evaluator on the clean and mutated arms, executes clean and mutated trials through the chosen evaluator, verifies rollback, and seals records and isolation manifests. `score` delegates every probe to eval-quality and persists per-probe diagnostics under `runs/<invocationId>/scores/<scoreInvocationId>/`, plus evidence artifacts, the run-wide `strength-aggregate.json`, `interpretation.json`, `partitions.json` and `gap-view.json`. Preserve both the command exit and each per-probe exit. A clean control should resolve `passed-clean-control` and the seeded defect `caught`; read those states from the evidence artifact. If a development `score` exits 3 with no artifact, read its persisted `score.json`, stdout and stderr diagnostics and route the fault through the gaps guide. For a held-out fault, read only `gap-view.json` and reproduce the class failure in development before inspecting diagnostics.

## Read development strength before held-out

Read the run-wide aggregate the development `score` invocation copied to `runs/<invocationId>/scores/<scoreInvocationId>/strength-aggregate.json`. The `strengthAggregate` pointer in `partitions.json`, `interpretation.json` and that invocation's `score.json` gives its `status`, which must be `copied`. eval-quality's `aggregate-strength` stage owns every count, rate, comparability and decision in the file, so copy them and compute none. For each class in `floorDecisions`, record the `floor` declared in `evaluation.json.strengthFloor` (copied beside the aggregate as `strength-floors.json`), the engine's floor decision (`meets`, `does-not-meet` or `undeclared`) with its `basis`, and the class's `eligible`, `exercised`, `caught`, `rate` and `comparable`. A class with no floor in `evaluation.json.strengthFloor` reads `undeclared` with basis `no-floor-declared`; the readings that follow apply under a declared floor. A `null` class has no eligible probe. A class with `rate: null` has eligible probes and none exercised. A class with `comparable: false` fell below `minimumTrialCount` or left an oracle unreached, and under a declared floor reads `does-not-meet` with basis `not-comparable`. None of the three is a pass. A `status` of `absent`, `refused`, `mismatch` or `failed` means no aggregate stands, so the guide makes no class-wide claim: record the status and its reason, and route the cause through the gaps guide. Each probe's own evidence artifact still carries `strength.comparable` and `strength.vector` for that one probe, which is where to read a missed probe or an uncovered class. Clean controls and canaries stay outside every denominator. Show the adopter each class decision beside the per-probe evidence and unresolved gaps. A `does-not-meet` class gets a development repair, or the adopter's declined reason on record, before held-out. Make no new verdict.

## Run held-out after development review

After the adopter confirms held-out readiness from the development evidence and recorded gaps, run `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate run --evaluation <evaluation-folder> --partition held-out`, then score that invocation ID with the command form above. In TeA's own package, use `node cli/evaluate.js` from the repository root. Read held-out outcomes through `gap-view.json` only. Keep held-out probe content closed during the authoring loop; use its ID, class and outcome to identify the class needing new development evidence. When `evaluation.json` declares a `partitionPlan`, the held-out run launches only the shared steps and the held-out plan's steps, and `preflight --partition held-out` qualifies the held-out probes over that same view; keep `corpus/held-out/` closed too, and never copy a held-out request into a development file.
