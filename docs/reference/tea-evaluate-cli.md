---
title: 'tea-evaluate CLI'
description: 'Commands, exit codes, a platform checklist and a command sequence for tea-evaluate and tea-skill-runner'
---

# tea-evaluate CLI

`tea-evaluate` is the runtime behind the Evaluate skill (`bmad-tea-evaluate`).
It validates an evaluation folder, qualifies each seeded probe in a disposable workspace, runs every arm a probe needs as sealed trial sets, scores them through `eval-quality score`, compares the result with a committed baseline and runs the checks of one CI tier from the evaluation's own plan.
Eight subcommands cover those jobs.
TEA also ships `tea-skill-runner`, the command an evaluation registers to run a skill.

| Command                   | What it does                                                                      | Exit codes                           |
| ------------------------- | --------------------------------------------------------------------------------- | ------------------------------------ |
| [`check`](#check)         | Validates the folder and lists every authoring defect                             | 0, 10, 12, 64                        |
| [`digest`](#digest)       | Writes `corpus-index.json` and prints a digest                                    | 0, 10, 12, 64                        |
| [`preflight`](#preflight) | Qualifies each seeded probe and drives the preflight legs against the real target | 0, 3, 4, 5, 10, 11, 12, 64           |
| [`run`](#run)             | Runs the preflight, then every arm a probe needs, and seals the trials            | 0, 3, 4, 5, 10, 11, 12, 64           |
| [`status`](#status)       | Reads a run's current progress; `--follow` reports updates until it ends          | 0, 12, 64                            |
| [`score`](#score)         | Scores the trial sets of a completed run                                          | 0, 2, 3, 4, 5, 10, 12, 64            |
| [`compare`](#compare)     | Sets a scored run beside `baseline/`, and with `--accept` replaces the baseline   | 0, 10, 12, 64                        |
| [`ci`](#ci)               | Runs the checks the CI plan places on one tier                                    | 0, 1, 2, 3, 4, 5, 10, 11, 12, 13, 64 |

:::caution[Exit 0 does not always mean the target passed]

- `score` exits 0 for PASS, WAIVED and CONCERNS alike, and its summary names only the exit; each probe's evidence artifact under `scores/` says which, in `contractVerdict`, or in `productionVerdict` for the production-mode records a `records` evaluator imports.
- `compare` exits 0 for every comparison outcome: `compared` (whatever the relation, a run weaker than the baseline included), `first-run` and `refused`. Read its lines for the outcome.
- `compare --accept` exits 0 and records the run as the baseline even when `score` exited 2 (FAIL), and after an exit 3 (Invalid) whenever every probe still has its evidence artifact. Accepting records a reference point for later comparisons; it certifies nothing about quality, so review the scored evidence before you accept.
- Exits 2 to 5 carry eval-quality's verdicts and faults, apart from `ci`'s 2 for a breached strength floor on `release`; `ci` adds 1 for a gate's policy violation, and 10, 11, 12, 13 and 64 are TEA's own validation, weakness, infrastructure, drift and usage exits. [Exit codes](#exit-codes) lists them all.
- `ci` is where enforcement lives: the CI plan places each check on a tier, and one fixed table of exits and actions decides what blocks, what warns and what passes. [Exits and the evidence](#exits-and-the-evidence) gives that table's order, and [Put an Evaluation in CI](/docs/how-to/evaluate/put-an-evaluation-in-ci.md) wires it into a pipeline.

:::

[How Evaluate Works](/docs/explanation/how-evaluate-works.md) explains why these pieces exist, and [Why Evaluate Confines the Target](/docs/explanation/why-evaluate-confines-the-target.md) explains the confinement.
Four companion reference pages hold the detail behind the commands, and a link to a section that moved to one of them lands on its entry here:

- <a id="the-evaluationjson-fields"></a><a id="held-out-probes-and-partition-plans"></a><a id="operation-phases"></a><a id="the-registry"></a><a id="denial-reasons"></a><a id="the-http-port"></a><a id="a-started-services-port"></a><a id="the-launch"></a><a id="the-workspace"></a><a id="the-interaction-plan"></a><a id="binding-kinds"></a><a id="step-order"></a><a id="steps-not-issued"></a><a id="controlled-mutations"></a><a id="historical-probes"></a><a id="from-worktrees"></a><a id="against-deployments"></a><a id="either-route"></a><a id="gameability-probes"></a>[tea-evaluate Manifest](/docs/reference/tea-evaluate-manifest.md): the `evaluation.json` fields, held-out probes and partition plans, operation phases, the registry, the HTTP port, the launch, the workspace, the interaction plan, controlled mutations, historical probes and gameability probes.
- <a id="a-subscription-login-under-confinement"></a>[tea-evaluate Confinement](/docs/reference/tea-evaluate-confinement.md): what a confined target can read, write and reach on macOS and Linux, the audit, egress and subscription logins.
- <a id="judge-calibration-labels"></a><a id="the-rubric-judge"></a><a id="the-evaluation-layer"></a><a id="qualifying-a-sealed-brief-agent"></a>[tea-evaluate Evaluators](/docs/reference/tea-evaluate-evaluators.md): the evaluation layer, the rubric judge, judge calibration labels and sealed-brief agent qualification.
- <a id="the-run-directory"></a><a id="paths-in-the-records"></a><a id="run-wide-strength-aggregate"></a>[tea-evaluate Evidence](/docs/reference/tea-evaluate-evidence.md): the run directory, the path forms in the records and the run-wide strength aggregate.

## Prerequisites

- Node.js 22.20 or later, with TEA installed in the evaluations folder (the `evaluations_folder` setting in `_bmad/custom/bmad-tea-evaluate.toml`, `evals` by default and in these examples) through its private `package.json` (`npm install --prefix evals`), which provides the `tea-evaluate` and `tea-skill-runner` bins.
  The adopter's root manifest stays untouched, so every invocation names the folder: `npm exec --prefix evals -- tea-evaluate ...` and `npm exec --prefix evals -- tea-skill-runner ...`, run from the project root.
- `eval-quality` 8.0.0 or later, a devDependency of the same private `package.json`.
  TEA declares it as an optional peer dependency, so a project that installs TEA only for its other skills never receives it.
  Without it, `tea-evaluate` exits 12 and names the missing package.

`tea-evaluate` reads no BMAD configuration.
Every subcommand takes `--evaluation <path>`, naming the evaluation folder or its `evaluation.json`, and exits 64 when that flag is missing or resolves to no `evaluation.json`.
Nothing defaults to the working directory.

### Platform checklist

`preflight` and `run` confine every target before it starts, and stop with exit 12, naming what is missing, on a host that cannot confine or audit it.
Check the host before the first live command:

- macOS: `/usr/bin/sandbox-exec` (Seatbelt, part of macOS) and a session that may read the unified log through `/usr/bin/log stream`, which the audit reads.
  Start `tea-evaluate` from an unsandboxed terminal: `sandbox-exec` cannot apply a profile inside another Seatbelt sandbox, so a `tea-evaluate` started from a sandboxed shell (an agent's tool, say) is refused.
  A subscription login kept in the Keychain has no grant under confinement; export `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` instead.
- Linux: Bubblewrap's `bwrap` on `PATH` (`apt-get install bubblewrap`), a kernel that allows unprivileged user namespaces and a network namespace, and `strace` 6.1 or later on `PATH` (`apt-get install strace`) with ptrace allowed, which the audit reads.
  A target that calls a model provider or another outside service lists its host in its registry entry's `egress`, since a confined Linux target has a loopback and nothing else.
- Windows: no confinement mechanism exists, so a confined `preflight` or `run` exits 12.

`check`, `digest`, `status`, `score` and `compare` launch no target and need none of these.
`ci` needs them for the checks that run `preflight` or `run` (`preflight-live` and the live tiers); the checks of its `pr` tier launch no confined target.
[File-system confinement](/docs/reference/tea-evaluate-confinement.md#file-system-confinement) gives the full requirements, including the observer versions and the paths a host may not hold.

### File-system confinement

Confinement limits what a target can do on your host, and the two platforms limit reads differently:

- On both platforms a confined target writes only its workspace and the private directories the runtime hands it, cannot read or write the evaluation folder (the contract, the probes and which defect a mutation plants), cannot read or write your git directory and cannot reach the evaluation layer's private files.
- macOS blocks reads: Seatbelt refuses file data outside the target's grants with `EPERM` before the read happens.
  A macOS target keeps the host's network.
- Linux detects reads afterwards: Bubblewrap gives the target a read-only view of `/`, so a file outside its grants that Bubblewrap does not hide can be read.
  `strace` records each such read, and `run` and `score` refuse the trial that made it (exit 3, `mount outside allowlist`), after the read happened.
  Keep files a target must not read off a Linux evaluation host, or run in a container that does not hold them.
  The network is closed apart from a loopback and the hosts `egress` lists.

:::danger[`"confinement": false` removes these limits]
Setting `"confinement": false` in `evaluation.json` runs every target with your user's file system, network, home directory and credentials, with no audit.
A target can read any file you can read and write outside its workspace; the run notices a change to your project or its git state afterwards and exits 12, and a write anywhere else goes unnoticed.
No read outside the workspace is observed, so `score` cannot refuse a trial for one.
`run.json` records `"confinement": "opt-out"` and `score` says so in its summary line.
Opt out only for a target that cannot run confined (one that must commit, read the project's git directory or open a network route that is no HTTPS `CONNECT` tunnel), and state the reason in the change that sets the field.
:::

[tea-evaluate Confinement](/docs/reference/tea-evaluate-confinement.md) describes what a confined process can read, write and reach, the audit, egress and subscription logins in full.

## A typical sequence

This sequence runs an evaluation folder that already exists; the Evaluate skill writes the folder with you (see [Evaluate a Skill or Agent](/docs/how-to/evaluate/evaluate-a-skill-or-agent.md)).
Run it from the project root:

```bash
npm exec --prefix evals -- tea-evaluate digest --evaluation evals/my-evaluation
npm exec --prefix evals -- tea-evaluate check --evaluation evals/my-evaluation
npm exec --prefix evals -- tea-evaluate run --evaluation evals/my-evaluation
```

`run` starts with the whole preflight, so a separate `preflight` is an optional diagnostic step: it qualifies the probes and drives the preflight legs without running trials.
Under a `partitionPlan`, add `--partition development` to `run` while you author and `--partition held-out` after the development review; omitted, `run` runs both partitions.
`run` prints its invocation ID as it starts and again on its last line, and keeps its records under `runs/<invocationId>/`.
Capture the ID right after the run, while that directory is the newest entry under `runs/`, and name the run explicitly in the commands that follow:

```bash
RUN_ID=$(command ls evals/my-evaluation/runs | tail -n 1) # the newest invocation under runs/, the run that just ended
npm exec --prefix evals -- tea-evaluate score --evaluation evals/my-evaluation --run "$RUN_ID"
npm exec --prefix evals -- tea-evaluate compare --evaluation evals/my-evaluation --run "$RUN_ID"
```

Accepting the run as the baseline is a separate step, taken after someone has reviewed the scored evidence and in a reviewed pull request that commits `baseline/`:

```bash
npm exec --prefix evals -- tea-evaluate compare --evaluation evals/my-evaluation --run "$RUN_ID" --accept
```

## The evaluation folder

```text
<evaluationId>/
  evaluation.json               # TEA manifest: target kind, interface, registry, launch, workspace, arms, trials, tiers, strength floor
  requirements.md               # the committed requirements statement evaluation.json records and the contract's sourceSpecDigest is held to
  contract.json                 # the Behavioral Evaluation Contract
  probes/P-NNN.probe.json       # one committed probe per file, authored fields only
  mutations/M-NNN.mutation.json # one controlled mutation per file
  policy/scoring-policy.json    # eval-quality's scoring policy; required once a probe takes the controlled-mutation, historical or gameability route, and by run
  policy/evaluator-conditions.json # the model a run uses (and its rubric judge's or sealed-brief evaluator's), as a fixed condition; left out when no model runs
  policy/judge-calibration.json # labelled examples for every rubric criterion and anchored level; required when the contract has rubrics
  evaluator/                    # a command or sealed-brief-agent evaluator: mapping.json, and a command evaluator's executable, frameworks.json (the installed frameworks it declares) and LEARNED.md
  adapter/                      # an api evaluation's HTTP port and its conformance file, rendered from the skill's templates
  corpus/                       # the corpus the probes run against
  corpus/gameability/P-NNN.json # a gameability probe's degenerate response, one response per plan step of contract.json
  corpus/held-out/gameability/P-NNN.json # under a partitionPlan, the same probe's responses to the held-out plan's steps
  corpus-index.json             # written by tea-evaluate digest
  ci/evaluation-ci-plan.json    # the CI plan: which check runs on which tier, read by tea-evaluate ci
  baseline/                     # written by tea-evaluate compare --accept and committed: a byte-identical snapshot of the accepted run, baseline.json and baseline/qualification/ evidence
  runs/<invocationId>/          # written by each tea-evaluate invocation; gitignored
  .gitignore                    # ignores runs/ (the skill's assets/evaluation-folder.gitignore)
```

The runtime's schemas ship under `cli/lib/evaluate/schemas/` in the TEA package.
They cover the manifest, probes, mutations, degenerate responses, held-out plan, evaluator files, judgment rows, framework versions, and evaluator qualification reports.
`contract.json` and `policy/scoring-policy.json` meet the schemas eval-quality publishes.
[tea-evaluate Manifest](/docs/reference/tea-evaluate-manifest.md) describes each `evaluation.json` field and how the runtime reads it, and [tea-evaluate Evaluators](/docs/reference/tea-evaluate-evaluators.md) describes `evaluator/` and `policy/judge-calibration.json`.

## check

`check` validates the evaluation folder against the runtime's schemas, eval-quality's schemas and the rules below, and lists every authoring defect in one pass.
It writes nothing under the evaluation folder.
Run it after every edit to the folder and before `preflight`.

```bash
npm exec --prefix evals -- tea-evaluate check --evaluation evals/my-evaluation
```

| Option                | Meaning                                                    |
| --------------------- | ---------------------------------------------------------- |
| `--evaluation <path>` | The evaluation folder, or its `evaluation.json`. Required. |

Exit codes:

- `0`: the folder has no findings.
- `10`: at least one finding.
- `12`: `eval-quality` is not installed.
- `64`: `--evaluation` is missing or resolves to no `evaluation.json`.

Output on a clean folder:

```text
tea-evaluate check: <project>/evals/my-evaluation has no authoring defects
```

Output when the requirements changed after the contract was written:

```text
requirements.md: [requirements] evaluation.json records digest sha256:1ff6fd24bc3e328dfc4ca28e8ef66464c40fd9e1361435fd966bd205e9f1fc77; requirements.md digests to sha256:73b6c43d597f67df384c3de11db0ae52cddf60e46a486f348ba2b3cc9205b001
contract.json: [requirements] sourceSpecDigest "sha256:1ff6fd24bc3e328dfc4ca28e8ef66464c40fd9e1361435fd966bd205e9f1fc77" is not the digest of requirements.md, sha256:73b6c43d597f67df384c3de11db0ae52cddf60e46a486f348ba2b3cc9205b001: the requirements changed after the contract was authored, so author the contract against the committed statement again
tea-evaluate check: 2 authoring defect(s) in <project>/evals/my-evaluation
```

`check` prints one line per finding, `<file>: [<rule>] <message>`, and lists every finding.
A control, line-separator or bidirectional formatting character in a finding is printed as an escape (`\n`, `\u202E`), and a file name holding one is quoted, so no file name can print a line of its own.
It exits 0 when there are none and 10 when there is at least one.
The rules:

| Rule                       | Refuses                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stale-index`              | a `corpus-index.json` whose digest differs from the folder's current bytes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `schema-version`           | an `evaluation.json` version the installed TEA does not know; the message names the installed TEA version and the versions it knows, and is reported alone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `runtime-owned-field`      | a committed probe carrying a field the runtime writes: lineage, the attested digests, the system identifier, evidence references, the rollback flag, or a qualification field the mutation file owns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `mutation-operator`        | a mutation whose operator is not `replace-exact` with exactly one occurrence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `provisioned-target`       | a mutation target inside a directory the workspace provisions, which every workspace holds read-only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `candidate-placement`      | a `*.candidate.json` file outside the top-level `discovery/` directory. Exploratory candidates live under `discovery/<campaignId>/`, which no scored artifact reads                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `web-interface`            | a contract interface of kind `web`; a web application is evaluated through `api`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `written-file-signature`   | a defect signature addressing a file the target wrote: the `artifact` channel, or a predicate pointer under `/interactions/<id>/artifact` on any channel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `oracle-count`             | a behavior discharged by a defect or gameability probe that does not declare exactly one oracle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `id-pattern`               | a probe, defect, behavior, oracle or mutation ID off its pattern                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `qualification-digest`     | a public reference under `baseline/qualification/` whose recorded digest does not match the file                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `baseline-digest`          | Baseline files that differ from `baseline/baseline.json`, are missing or unlisted, or lack a readable manifest. Authored qualification evidence without a manifest may contain only `probes/`, `qualification/`, and a placeholder `README.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `clean-control`            | a clean control that is not `zero-action` with an expected-clean flag and no defects                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `infrastructure-exit-code` | a defect signature or manifestation witness an infrastructure exit code could satisfy (see [The registry](/docs/reference/tea-evaluate-manifest.md#the-registry))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `unregistered-executable`  | a `cli` signature or a witness naming a target no registry entry declares                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `skill-root`               | a mutation whose `targetArtifact` is not inside `launch.skillRoot`, a `tea-skill-runner` leg or plan step whose `skill-root` is not `launch.skillRoot`, or a skill root inside a provisioned directory                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `skill-runner`             | a `tea-skill-runner` registry entry that does not declare exit codes 3 to 6, or a leg or plan step for it with no literal `timeout-ms` below the entry's `maxElapsedMs` after reserving another 120 s on Windows for Job Object setup and supervisor completion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `trials`                   | an `evaluation.json` `trials` below the scoring policy's `minimumTrialCount`, so every trial set `run` seals would fall short of the minimum the scores read                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `arms`                     | a probe whose arm `arms` does not declare (a clean control needs `clean`, a probe on the `controlled-mutation` route `mutated`, one on the `historical` route `historical`, a gameability probe `gameability`), or an arm `arms` declares that no probe runs on                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `mutation-route`           | a probe on the `controlled-mutation` route that seeds no defect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `evaluator-conditions`     | a registry entry that runs `tea-skill-runner`, which always runs an agent, with no `policy/evaluator-conditions.json` naming the model the run uses, or a `modelSnapshot` of `none` beside a `systemPromptDigest` other than `sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`, the digest of the empty byte string                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `gameability`              | A probe with the wrong class, expected-clean flag, defects, or naive oracle; degenerate responses that are missing, leave plan steps unanswered, name unknown steps, use the wrong response kind, or exit an infrastructure code. Under `partitionPlan`, held-out responses must cover the held-out plan, and its naive oracle must remain available in that view. See [Gameability probes](/docs/reference/tea-evaluate-manifest.md#gameability-probes).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `historical`               | a probe on the `historical` route without `expectedClean: false`, that seeds no defect, or one whose `source` is not `natural`; one naming neither or both of `fixCommit` and `deployments`, one deployment without the other, one release for both, a deployment beside a registry entry that is not an HTTP entry, origins that are not an http or https origin for each HTTP interface of the registry and no other, or a deployment's `reports` leaving an HTTP interface of the registry without a report or naming an interface it does not serve over HTTP, or one report naming an operation the contract does not declare on the `api` interface its key names, one the contract marks as changing state, one that needs an input, or a pointer that is no JSON pointer, or, when a probe's deployments name a report operation, a duplicate operation signature between that report operation and another operation that eval-quality's compile refuses |
| `judge`                    | A deterministic rubric without its judge or recorded model; judge settings on an evaluator that scores rubrics itself; an unsupported adapter, missing custom command, unsupported model, or model snapshot that differs from the selected model. See [The rubric judge](/docs/reference/tea-evaluate-evaluators.md#the-rubric-judge).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `held-out`                 | a held-out ID that names no committed probe, names a clean control, or leaves an affected behavior without a development probe                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `partition-plan`           | A records evaluator with rubrics; invalid plan paths or schemas; duplicate step, oracle, rubric, waiver, or mapping IDs; references to steps or behaviors outside the selected view; behaviors with no oracle; held-out probe behaviors with several oracles; missing or conflicting evaluator mappings; or a view the engine refuses. Findings name paths and valid IDs while withholding plan content. See [Held-out probes and partition plans](/docs/reference/tea-evaluate-manifest.md#held-out-probes-and-partition-plans).                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `operation-phases`         | an interface-operation pair the contract declares with no phase, a phase for a pair the contract does not declare, or a phase other than `process` or `outcome`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `interface-identifier`     | two interfaces of a contract that share a `logicalId`: `check` asks eval-quality's compile once for a contract of two or more interfaces and quotes its `duplicate-interface-identifier` line, which names the identifier and both positions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `judge-calibration`        | missing or malformed labelled calibration, uncovered rubric criteria or anchored levels, a missing minimum agreement threshold, and, for a `records` evaluator whose contract declares a rubric, `calibration-judgments.json` or `evaluator-configuration.json` that is absent, unreadable or does not verify (see [The evaluation layer](/docs/reference/tea-evaluate-evaluators.md#the-evaluation-layer))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `evaluator`                | Missing or invalid mappings; unknown, repeated, or unbound oracles and rubric criteria; invalid scale levels; links or special files under `evaluator/`; missing command executables, framework declarations, tracked version probes, or matching `LEARNED.md` records; unsupported agent settings, a mismatched model snapshot, missing or inapplicable `evaluatorQualification` settings; or an absent or linked records directory. See [The evaluation layer](/docs/reference/tea-evaluate-evaluators.md#the-evaluation-layer).                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `adapter`                  | a registry that declares an HTTP target while the folder holds no regular `adapter/http-probe-port.mjs` in a real `adapter/` directory                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `requirements`             | `evaluation.json` records no requirements statement, `requirements.md` is absent, is not a regular file in the evaluation folder (a link, or a file swapped for a pipe, is refused) or its bytes differ from the digest `evaluation.json` records, or the contract's `sourceSpecDigest` is not the digest of those bytes: a requirements change the contract has not absorbed blocks the pull request (contract-source freshness)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `ci-plan` family           | A malformed plan; duplicate checks; commands, triggers, placements, defaults, or tier lists that disagree; `evaluation.json` `tiers` that differ from the tiers the plan places a check on; missing reasons; unresolved placeholders; invalid gate IDs; checks that do not apply to the evaluation; deterministic checks placed off `pr`; or live checks placed on `pr`. See [The plan](#the-plan).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

An evaluator of an unknown kind, and a `command` or `sealed-brief-agent` evaluator with no `timeoutMs`, fail the `evaluation.json` schema (`schema`).
The remaining findings cover malformed JSON (`json`), runtime or engine schemas (`schema`, `engine-schema`), files named for another ID (`file-name`), unknown references (`reference`), missing required files (`missing-file`), and repeated IDs (`duplicate-id`).
CI-plan policy findings name `deterministic-off-pr` (a deterministic check placed off `pr`), `live-on-pr` (a live check placed on `pr`), `placement-reason` (a missing reason), `tiers` (manifest and plan tiers disagree), and `gates` (invalid or repeated gate job IDs).

Registry findings cover duplicate interface/executable pairs, conflicting interface kinds, invalid HTTP host or authorization fields, and MCP policies the engine refuses.
Their messages retain the engine parser's reason.
The `corpus-file` rule requires real directories for `corpus/`, `probes/`, and `mutations/`, with regular entries inside them; `digest` rejects invalid entries too.
`baseline-file` rejects links and other non-regular entries under `baseline/`.

A `baseline/qualification/` reference must resolve to a regular file inside the folder.
The `compare` command runs the `baseline-digest` rule too, before it reads a baseline's evidence (see [Comparing](#comparing)).

## digest

```bash
npm exec --prefix evals -- tea-evaluate digest --evaluation evals/my-evaluation
```

`digest` writes `corpus-index.json`: every file under `corpus/`, `probes/` and `mutations/` as a path relative to the folder and the SHA-256 of its bytes, sorted by path.
It prints the corpus digest, which is eval-quality's artifact digest over that index, so any byte change in the corpus, the probes or the mutations moves it.
Run it after every change to those folders; `check` refuses a stale index.

| Option                 | Meaning                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `--evaluation <path>`  | The evaluation folder, or its `evaluation.json`. Required.                                      |
| `--calibration-inputs` | Print the values a `records` harness copies into its calibration judgments, and write nothing.  |
| `--file <path>`        | Print the digest of one file the folder holds, named relative to the folder, and write nothing. |

`--file` and `--calibration-inputs` cannot be combined.

Exit codes:

- `0`: the index was written, or the requested value was printed.
- `10`: an entry under `corpus/`, `probes/` or `mutations/` cannot be indexed, or `--calibration-inputs` met an evaluator that is not `records`, a contract with no rubric, an unusable labelled file or an unusable configuration.
- `12`: `eval-quality` is not installed.
- `64`: `--evaluation` is missing or resolves to no `evaluation.json`, `--file` names a path the folder cannot give (an absolute path, a `..` segment, a symbolic link, a directory or a file the folder does not hold), or `--file` is combined with `--calibration-inputs`.

Output of the default form, which prints the corpus digest on its second line:

```text
tea-evaluate digest: wrote <project>/evals/my-evaluation/corpus-index.json (5 file(s))
sha256:56758abf5e992f92843b86016265b3f51fc20665c03988f4dc40ab3274eb9f98
```

Output of `--file requirements.md`:

```text
sha256:1ff6fd24bc3e328dfc4ca28e8ef66464c40fd9e1361435fd966bd205e9f1fc77
```

```bash
npm exec --prefix evals -- tea-evaluate digest --evaluation evals/my-evaluation --calibration-inputs
```

With `--calibration-inputs`, `digest` is read-only and prints the values a `records` harness copies into its calibration judgments (see [The evaluation layer](/docs/reference/tea-evaluate-evaluators.md#the-evaluation-layer)): it writes nothing under the folder, `corpus-index.json` included, and prints no corpus digest.
The document on stdout holds `calibrationDigest` (eval-quality's `digestBytes` over `policy/judge-calibration.json`, the value for `tea.judgeCalibrationDigest`), `scorerConfigurationDigest` (over `<records>/evaluator-configuration.json` without its two `tea.judgeCalibration*` bindings, so the file can exist without them) and `items`, one `{ "rubricId", "criterionId", "scorerInput" }` per labelled item in the labelled file's order.
It carries no `answer` (your scorer supplies it) and no `expectedLevel`.
`check` and `run` derive the same values with the same functions, so a change to how the runtime derives the observation or the digest changes this output and their verification together.
It reads only what it needs and does not run `check`, so run `check` once the judgments file is written.
It exits 10 with a `judge-calibration` finding for an evaluator that is not `records`, a contract that declares no rubric, a labelled file `check` refuses, or a configuration that is absent, a link, not JSON or off eval-quality's `evaluator-configuration` schema.

```bash
npm exec --prefix evals -- tea-evaluate digest --evaluation evals/my-evaluation --file requirements.md
```

With `--file <path>`, `digest` is read-only and prints eval-quality's `digestBytes` over the bytes of one file the folder holds, as `sha256:` and 64 hex digits on one line.
This is the value for `requirements.digest` in `evaluation.json` and for the contract's `sourceSpecDigest`: both are the digest of the exact bytes of `requirements.md`, with nothing trimmed or normalized.
It writes nothing under the folder, `corpus-index.json` included, and prints no corpus digest.
The path is relative to the evaluation folder.
It exits 64 with one line on stderr for an absolute path, a path with a `..` segment, a symbolic link at any component, a directory, a file the folder does not hold, a path that cannot be read, an entry that is not a regular file or a file that changed while it was read, and for `--file` together with `--calibration-inputs`.
Change one byte of the file and the printed digest changes.

## preflight

`preflight` qualifies each seeded probe in a disposable workspace, drives the preflight legs against the real target and takes the verdict from `eval-quality preflight`.

Synopsis, with optional arguments in brackets:

```text
tea-evaluate preflight --evaluation <path> [--from-working-tree] [--partition development|held-out]
```

Examples, for an evaluation with no `partitionPlan` and for the development partition of one that declares it:

```bash
npm exec --prefix evals -- tea-evaluate preflight --evaluation evals/my-evaluation
npm exec --prefix evals -- tea-evaluate preflight --evaluation evals/my-evaluation --partition development
```

| Option                | Meaning                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `--evaluation <path>` | The evaluation folder, or its `evaluation.json`. Required.                                                                                 |
| `--from-working-tree` | Evaluate the working tree, uncommitted work included, in a temporary copy recorded as `dirty: true`. A dirty run cannot become a baseline. |
| `--partition <name>`  | `development` or `held-out`. Required when `evaluation.json` declares a `partitionPlan`; otherwise omitting it qualifies every probe.      |

Exit codes:

- `0`: the preflight passed.
- `3`, `4`, `5`: the exit of `eval-quality preflight`, passed through verbatim: 3 is a failed preflight, 4 a contract defect and 5 a runtime fault.
- `64`: an `eval-quality` stage's own exit 64, passed through.
- `10`: an authoring defect: a `check` finding, a leg the registry does not authorize, or a mutation whose `find` text does not occur exactly once.
- `11`: an evaluation weakness: a seeded probe whose clean arm does not pass or whose mutated arm does not fail, a historical probe that does not fail before its fix or pass after it, or a gameability probe whose degenerate response the naive oracle rejects or the disciplined oracle accepts.
- `12`: infrastructure: a workspace that cannot be made, a target that cannot launch, a restore that fails, a change to your project during the run, or an engine stage that cannot run.
- `64`: `--evaluation` is missing, `--partition` names an unknown partition, or `--partition` is missing over a `partitionPlan`.

Output of a passing preflight over the one-skill evaluation in [The evaluation.json fields](/docs/reference/tea-evaluate-manifest.md#the-evaluationjson-fields) (the invocation ID differs on every run):

```text
tea-evaluate preflight: pristine workspace, a temp copy: <tmp>/tea-evaluate-pristine-22e1cf32-0dae-44d0-9ec0-955881f9f3c8/target
tea-evaluate preflight: run 20261007T112706379Z-efa23a53: <project>/evals/my-evaluation/runs/20261007T112706379Z-efa23a53
tea-evaluate preflight: probes/P-002.probe.json: qualifying through M-001 in <tmp>/tea-evaluate-qualify-P-002-0b9d75bb-0c0f-444d-86fd-f216e4d9a106/target
tea-evaluate preflight: M-001: step 1, the clean arm
tea-evaluate preflight: M-001: step 2, the mutation applied to skill/SKILL.md
tea-evaluate preflight: M-001: step 3, the mutated arm
tea-evaluate preflight: M-001: step 4, the original bytes restored
tea-evaluate preflight: M-001: step 5, the restored digest checked
tea-evaluate preflight: M-001: step 6, the baseline re-run (attempt 1 of 3)
tea-evaluate preflight: probes/P-002.probe.json: qualified; the restored digest matched and the baseline passed again
tea-evaluate preflight: mutated workspace for M-001: <tmp>/tea-evaluate-mutated-M-001-71c66522-96b5-47a4-ad8a-2661098b634b/target
tea-evaluate preflight: leg "witness-at-limit": planned
tea-evaluate preflight: leg "witness-at-limit": observed
tea-evaluate preflight: leg "witness-under-limit": planned
tea-evaluate preflight: leg "witness-under-limit": observed
tea-evaluate preflight: leg "preflight-control-observe": planned
tea-evaluate preflight: leg "preflight-control-observe": observed
tea-evaluate preflight: leg "preflight-control-observe-2": planned
tea-evaluate preflight: leg "preflight-control-observe-2": observed
tea-evaluate preflight: leg "manifest-exclusive-limit": planned
tea-evaluate preflight: leg "manifest-exclusive-limit": observed
tea-evaluate preflight: eval-quality preflight exited 0; its verdict and diagnostics are in runs/20261007T112706379Z-efa23a53 (exit 0, <project>/evals/my-evaluation/runs/20261007T112706379Z-efa23a53)
```

With `--partition`, only that partition's seeded probes are qualified, over the contract that partition runs (see [Held-out probes and partition plans](/docs/reference/tea-evaluate-manifest.md#held-out-probes-and-partition-plans)); an unknown partition exits 64 and a held-out set with no probe exits 10.
When `evaluation.json` declares a `partitionPlan`, `--partition` is required: a `preflight` with no `--partition` exits 64 and names the flag and both values, because it would derive the both view and launch the held-out request.
Preflight `development` while you author, and `held-out` after the development review.
An evaluation with no `partitionPlan` preflights with no flag and qualifies every probe.

`preflight` checks the harness against the real target before trials begin.
Each invocation writes `runs/<invocationId>/` and creates `runs/.gitignore` on the first run.
The steps run in order, each stopping the run with its own exit:

1. `check` over the folder; any finding exits 10 and is printed as `check` prints it.
2. The evaluation must be one this release runs: every seeded probe on the `controlled-mutation` or `historical` route (exit 12 otherwise, and a retry cannot pass); and when the registry declares an HTTP target, the evaluation's HTTP port, started once and asked which protocol it speaks, must answer as TEA's host (exit 10 otherwise, and 12 when its process cannot start or answer in time; see [The HTTP port](/docs/reference/tea-evaluate-manifest.md#the-http-port)).
3. The pristine workspace (see [The workspace](/docs/reference/tea-evaluate-manifest.md#the-workspace)), with every registry target present and executable in it (exit 12 otherwise), and `run.json`.
4. `eval-quality compile` and `eval-quality seal` over the run's own copy of `contract.json`, writing `eval-contract.json` and `sealed-evaluator-brief.json`; a non-zero exit the CLI documents is passed through.
5. Each seeded probe qualified through its controlled mutation (see [Controlled mutations](/docs/reference/tea-evaluate-manifest.md#controlled-mutations)) or across its fix boundary, a fix commit or a pair of deployments (see [Historical probes](/docs/reference/tea-evaluate-manifest.md#historical-probes)), exiting 10, 11 or 12 when a step fails; a historical probe with no revisions to address, naming a deployment the registry does not authorize, or naming one that reports another release than the one it declares or whose report request is denied or answered with no string at the pointer, is refused and left out.
   Each gameability probe qualified over its degenerate response with no target launched (see [Gameability probes](/docs/reference/tea-evaluate-manifest.md#gameability-probes)), exiting 11 when the naive oracle rejects it or the disciplined oracle accepts it; `run` reuses the result.
6. The legs: eval-quality's `runPreflight` plans them from the contract and the qualified probes (every sensitivity-witness leg, the minted control legs, and each defect's manifestation-witness leg) and drives them through the adapter the registry authorizes, eval-quality's command-line adapter for a command, its MCP adapter for a tool call, and the evaluation's own HTTP port for an HTTP request.
   A manifestation witness's leg runs in its mutation's mutated workspace, or on the historical route in a worktree at the pre-fix revision or against the pre-fix deployment, and every other leg in the pristine workspace, each through an authorization whose working directory is that workspace.
   Each command request carries the host's values for the environment keys its registry entry permits, each tool server and each started HTTP service starts with the host's values for its entry's keys, and each HTTP request carries its entry's auth header.
   Every observation is written to `observations/` as it arrives, with the request, the workspace and the working directory beside it; a request's environment is recorded as its keys only, and every injected or server environment value and every auth value of eight characters or more is replaced by `[redacted]` in the observation's strings, object keys and numbers, as written and in the JSON-escaped forms [the registry](/docs/reference/tea-evaluate-manifest.md#the-registry) lists, in whatever letter case the target echoes it (lower, upper, capitalized or mixed; a case mapping that changes a text's length, such as `ß` to `SS`, and the Turkish `i` and `I`, included).
   A leg the registry does not authorize is refused by the adapter before it starts: the fault is written to `faults/` and the command exits 10.
   A leg that cannot run at all (a budget exceeded, a process that fails to start) is written there too and exits 12, as does any other failure that stops the legs.
   A leg that exits one of its entry's `infrastructureExitCodes` is an observation like any other: the CLI's verdict reads it (a control leg that exits non-zero fails `clean-control`, exit 3), which `ci` classes as an infrastructure or integrity exit.
   A qualification arm step that exits one stops the cycle with exit 12, since an arm has no verdict to classify it.
   Once the legs have run, the pre-fix deployment of each historical arm is asked again which release each of its HTTP interfaces runs (see [Against deployments](/docs/reference/tea-evaluate-manifest.md#against-deployments)).
   A release that changed refuses every probe on that pre-fix release: the probes leave `probes.json` and the observations the CLI reads, and the arm leaves `run.json`'s `deployments`.
   A deployment that cannot answer stops the run with exit 12, naming the point.
7. `eval-quality preflight --contract contract.json --probes probes.json --observations observations.json --run-id <invocationId>` over the files in the run directory, `probes.json` holding the qualified probes that remain.
   Its `preflight-verdict.json` is the verdict, and its exit code is the command's exit code, verbatim: 0 when the preflight passed, 3 when it failed.
8. A passed verdict is then held to the mount allowlist `score` applies to a trial set's isolation manifest.
   Each leg of the pristine workspace runs under the same audit as a trial (see [File-system confinement](/docs/reference/tea-evaluate-confinement.md#file-system-confinement)).
   A path that every one of those legs opened outside what it was granted exits 3, the exit `score` gives a trial that opens it: a target that lives outside its workspace loads its own files on every launch, so every trial opens them too.
   The message names the first paths and the two setups that work for such a target, `tea-skill-runner` named by its bare name for one: a registry `target` that is a path inside `launch.root` (`node_modules/.bin/tea-skill-runner` over a copy workspace, or over a git workspace with `workspace.provision`), or the bare name with the directories it runs from listed in `systemPaths`, the bin directory that holds its link on `PATH` among them.
   A path that only some legs opened is no refusal: `preflight` prints a note naming the path and the legs that opened it, and its exit does not change, since `score` judges the trials and not the legs.
   Only the legs whose audit lost no report take part in that check, because a path a lossy audit dropped is no evidence that the leg did not open it.
   A leg whose audit lost events, delivered fewer of its canary reads than it sent, or ran while reports reached the log faster than it keeps them, is left out, and `preflight` prints a note naming it; no note says the other legs did not open a path on its word.
   When every leg's audit lost reports, no leg can say what it opened, so `preflight` exits 12 with `the legs yield no audit` and the advice to run again on a quieter host, in place of passing.
   The check grants nothing and widens no allowlist; a run that opted out of confinement observes no path and is not refused.

`runPreflight` computes a verdict of its own, and `preflight` discards it: every verdict comes from the CLI over files you can rerun by hand from the run directory.
`engine/<stage>.json` records each stage's executable, argv, exit code, stdout and stderr, with the path forms of [Paths in the records](/docs/reference/tea-evaluate-evidence.md#paths-in-the-records).
A stage that cannot start, is killed by a signal, or exits with a code eval-quality does not document for that stage exits 12.
A SIGINT, SIGTERM, SIGHUP or SIGQUIT that reaches `check`, `preflight`, `run`, `score` or `ci` while a stage runs stops the stage's process group first, then the command removes its private directories and ends by the same signal.
The documented codes: `compile` and `seal` 0, 4, 5 and 64; `preflight` 0, 3, 4, 5 and 64; `score` 0, 2, 3, 4, 5 and 64; `aggregate-strength` 0, 4, 5 and 64.
Exit 1 is a CONCERNS promoted by `--strict`, which `tea-evaluate` never passes, so it is left out.
Setting `ENGINE_CLI_ENV` substitutes another executable for the eval-quality CLI; `tea-evaluate` announces the substitution on stderr and records it in each stage's record.

## run

`run` measures the evaluation: it runs every arm a probe needs `trials` times and seals every trial as a record `eval-quality score` reads.

It starts with the whole preflight, so a run that cannot qualify its probes stops before the first trial.

Synopsis, with optional arguments in brackets:

```text
tea-evaluate run --evaluation <path> [--from-working-tree] [--partition development|held-out] [--seed <value>] [--before-state]
```

Examples, over both partitions and over the development partition with the uncommitted working tree:

```bash
npm exec --prefix evals -- tea-evaluate run --evaluation evals/my-evaluation
npm exec --prefix evals -- tea-evaluate run --evaluation evals/my-evaluation --partition development --from-working-tree
```

| Option                | Meaning                                                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--evaluation <path>` | The evaluation folder, or its `evaluation.json`. Required.                                                                                                                                                               |
| `--from-working-tree` | Evaluate the working tree, uncommitted work included, in a temporary copy recorded as `dirty: true`. A dirty run cannot become a baseline.                                                                               |
| `--partition <name>`  | `development` or `held-out`. Omitted, `run` runs both partitions.                                                                                                                                                        |
| `--seed <value>`      | Seed the `matcher` bindings of the interaction plan and record the seed in `run.json`. The same seed repeats the same bytes.                                                                                             |
| `--before-state`      | Record the starting point of a target with known defects: a clean control that declares its defect may fail its baseline. The run is never accepted as a baseline (see [Record a before state](#record-a-before-state)). |

Exit codes:

- `0`: every selected probe has its trial set.
- `3`, `4`, `5`: the exit of the preflight stage, passed through verbatim.
- `64`: an `eval-quality` stage's own exit 64, passed through.
- `10`: an authoring defect: a trial request the registry does not authorize, no scoring policy, a clean control whose behavior declares no oracle, a probe `eval-quality` refuses, an evaluation layer it cannot use, or records a `records` evaluator imported that are missing or off their schema.
- `11`: an evaluation weakness: a clean control whose baseline does not pass (under `--before-state`, one that does not declare a known defect, or whose oracles cannot decide), a rubric scorer below `judgeCalibration.minimumAgreement`, or a sealed-brief agent below `evaluatorQualification.minimumAgreement`, besides the causes `preflight` lists.
- `12`: infrastructure: a trial that cannot run, exits an infrastructure code or is stopped by a signal from outside, a rubric judge or an evaluator that cannot answer, a run whose every probe was refused, a change to your project during the run, or a run directory holding an entry the runtime did not write, besides the causes `preflight` lists.
- `64`: `--evaluation` is missing, `--partition` names an unknown partition, or `--before-state` finds no clean control that declares a known defect in the evaluation or the selected partition.

The last lines of a run over the same one-skill evaluation, which seals three trial sets of three trials:

```text
tea-evaluate run: probes/P-001.probe.json: qualified; its baseline passed
tea-evaluate run: probes/P-003.probe.json: qualified; its baseline passed
tea-evaluate run: clean: trial 1 of 3
tea-evaluate run: clean: trial 2 of 3
tea-evaluate run: clean: trial 3 of 3
tea-evaluate run: mutated:M-001: trial 1 of 3
tea-evaluate run: mutated:M-001: trial 2 of 3
tea-evaluate run: mutated:M-001: trial 3 of 3
tea-evaluate run: 3 trial set(s) of 3 trial(s) sealed over clean, mutated:M-001; score them with tea-evaluate score --run 20261007T112710219Z-50f0b256 (exit 0, <project>/evals/my-evaluation/runs/20261007T112710219Z-50f0b256)
```

The closing line names the run and leaves out the prefix and `--evaluation`; the complete command, with the run captured as [A typical sequence](#a-typical-sequence) shows, is:

```bash
npm exec --prefix evals -- tea-evaluate score --evaluation evals/my-evaluation --run "$RUN_ID"
```

Omitting `--partition` runs both development and held-out probes.
`--partition development` or `--partition held-out` selects that set before preflight, qualification and trials.
An unknown partition exits 64; selecting an empty held-out set exits 10.
Under a `partitionPlan` the partition also selects the contract (see [Held-out probes and partition plans](/docs/reference/tea-evaluate-manifest.md#held-out-probes-and-partition-plans)): a development run launches the shared and development-only steps, a held-out run the shared and held-out steps, and each partition's run directory and baseline hold none of the other's requests, step IDs or oracles.
It needs `policy/scoring-policy.json` (exit 10 without it), and every probe on the `clean-control`, `controlled-mutation`, `historical` or `gameability` route (a canary exits 12, since a retry cannot pass).
The steps run in order in one invocation, each stopping the run with its own exit:

1. The whole preflight, as `preflight` runs it, in the same `runs/<invocationId>/`; a verdict that does not pass ends the run with its exit, and no trial runs.
   The mount check of step 8 is `preflight`'s alone; `run` judges the trials' own manifests.
2. Each clean control qualified: one clean arm in a workspace of its own, whose oracles for the control's behavior must hold (exit 11 otherwise, unless `--before-state` records the control as known-failing), its evidence under `qualification/<probeId>/baseline-pass.json`, or `baseline-known-failing.json` for a control recorded as known-failing.
3. A `sealed-brief-agent` qualified on the clean arm and on each mutated arm, before any trial (see [Qualifying a sealed-brief agent](/docs/reference/tea-evaluate-evaluators.md#qualifying-a-sealed-brief-agent)); agreement below `evaluatorQualification.minimumAgreement` exits 11 with no trial set.
4. Each arm a probe needs, `trials` times: the clean arm (`conditionArm: clean`) for the clean controls, one mutated arm per mutation (`mutated:<mutationId>`) for the probes it seeds, one historical arm per pre-fix revision (`historical:<preFixSha>`) or pre-fix deployment (`historical:<release>`), and one gameability arm per gameability probe (`gameability:<probeId>`).
   Every trial runs the interaction plan once, with its bindings (see [The interaction plan](/docs/reference/tea-evaluate-manifest.md#the-interaction-plan)), in a workspace of its own that reproduces the pristine one (the mutation applied for a mutated arm and its digest held to the one the qualification measured) or, on a historical arm, the pre-fix worktree, a deployment arm's HTTP calls reaching the pre-fix deployment; a gameability trial answers the plan from the degenerate response and launches nothing.
   The evaluation layer judges the trial (see [The evaluation layer](/docs/reference/tea-evaluate-evaluators.md#the-evaluation-layer)); under the default deterministic evaluator, when the contract declares a rubric, the rubric judge scores the trial once (see [The rubric judge](/docs/reference/tea-evaluate-evaluators.md#the-rubric-judge)).
   Its requests, observations, oracle resolutions or judgment rows, and any judge reply go to `trials/<arm>/trial-<n>.json`.
   A trial step that exits one of its registry entry's `infrastructureExitCodes`, or that a signal from outside stops (hang-up, interrupt, quit, kill or terminate), is a target that could not run: the trial yields no record and the run exits 12 (a qualification arm step stops its cycle the same way).
   A command step that crashes by a signal of its own (an abort, a segmentation fault) is an observation its oracles judge, and its record keeps the negative exit code; a tool server whose process ends the session during a call is an observation the same way, recorded with its exit code on the `exit-code` channel; a signal from outside stops either kind of step with exit 12 (see [The registry](/docs/reference/tea-evaluate-manifest.md#the-registry)).
   Your project is read again after every trial and every evaluator attempt (exit 12 on any change, with no trial set written).
   After the last trial of a deployment arm, the pre-fix deployment is asked once more which release each of its HTTP interfaces runs (see [Against deployments](/docs/reference/tea-evaluate-manifest.md#against-deployments)); a changed release refuses every probe on the arm before any trial set is sealed.
5. Every selected probe has its trial set, or the run exits 12, and the run directory holds exactly what the runtime wrote (see [The run directory](/docs/reference/tea-evaluate-evidence.md#the-run-directory)).
6. One trial set per probe under `trial-sets/<probeId>/`: `record-<n>.json` per trial and `isolation-manifest.json`, with `evaluator-configuration.json` for the whole run, each checked against the schema eval-quality publishes before it is written, and each written as eval-quality's canonical serialization; the contract and sealed-brief digests they carry were taken when `compile` and `seal` wrote those files, before any target ran.
7. `trial-sets.json`, the index `score` reads.
   Your project is then read once more and the run directory verified again; a change to either exits 12, and the run is recorded as not completed, with its `trial-sets.json` removed.
   Only then does the run's last write replace `run.json` with `completed: true` and the digests of every file `score` reads.
   A run that stopped holds no `trial-sets.json`; when the runtime cannot remove it or record the end in `run.json` (a run directory moved away, say), the exit message says so, and `run.json` still does not say `completed: true`.
   A run whose sealed isolation manifests list a mount outside the allowlist does not report success: it exits 3 naming the paths the trials opened, since `score` reads the same manifests as Invalid; a target that lives outside its workspace therefore runs its trials and is refused when they are sealed.
   Its trial sets stay sealed and `run.json` records `completed: true` with that exit in `outcome`, so `score --run <invocationId>` prints one `mount outside allowlist` reason per path.

`run.json` records how every `preflight` and `run` invocation ended (`outcome`: the stage, the exit and the message; for an interrupting signal, the stage `signal` and the signal's name), and a `run` records `completed`, true only for a run that sealed its trial sets.
While `run` is active, its progress snapshot records the current phase, time spent in that phase, completed and planned trials, last heartbeat, whole-run elapsed time and completed phase durations. The running command prints periodic heartbeat lines, including while a long target or evaluator call is in progress. Read the snapshot through [`status`](#status) from another process. Progress does not assign a verdict or estimate remaining time.
The scoring policy, the evaluator conditions and the corpus index are read once, before anything runs, and the policy `run` copies to `scoring-policy.json` is the one the trials used, its digest in `run.json`.
The workspaces leave the evaluation folder out, so the run reads it from your working tree: uncommitted work in it (an edit, a deletion or an untracked file) makes `run.json` record `dirty: true` and `evaluationFolder.dirty: true`, since no commit names what the run measured.

The deterministic evaluator, the default evaluation layer, judges every trial with eval-quality's `resolveCheck`.
A record carries a disposition for every oracle the contract declares, since eval-quality holds each one required, citing the observations its check reads.
It carries one `defect` finding for each violated oracle of the behaviors the probe discharges (its own and its defects'), attributed to that probe and behavior at the behavior's severity and confidence 1, quoting the whole of the first stream, body or written-file channel the oracle reads on a cited observation (an exit code only when none holds text), so eval-quality's own witness match and quotation audit decide what the finding proves.
A violated oracle of another behavior files no finding against the probe, since eval-quality would read it as the probe's false positive or an unwitnessed claim; its `violated` disposition stands, and eval-quality records that oracle's corroboration as `disagrees`.
The trial's observations carry `provenance: evaluator-chosen`: under this evaluator the interaction plan is the evaluator's own exercise of the target, and eval-quality's witness match counts only evaluator-chosen observations.
The records of one set share one `runId` (the invocation's identifier and the probe's), number `trialIndex` from 1 to `trials`, carry `mode: contract-scoring`, and carry one `evaluatorRecommendation` for the whole set, since eval-quality holds it equal across a set: FAIL when any trial filed a finding, CONCERNS when one left an oracle of the probe's behaviors unsettled, PASS otherwise.
So a trial whose own oracles all held carries its set's FAIL; in contract scoring eval-quality reads the recommendation into no verdict.

The isolation manifest records what the trials were granted and what the runtime observed: the workspace each trial ran in and its read-only provisioned directories as the allowed mounts, the registry's commands and tools as the tool allowlist (`<interface>/<executable>` or `<interface>/<tool>`), the commands and tool calls the runtime made for the plan as the observed tool calls, the tool-call and wall-clock ceilings the runtime enforces, and the largest safe integer (9007199254740991, the most the schema admits for a token ceiling) for the token and cost ceilings.
For CLI targets, each issued step can report target use on one stderr line: `TEA_EVALUATE_USAGE_JSON:{"inputTokens":7,"outputTokens":11,"costUsd":"0.00125"}`.
Token counts must be nonnegative safe integers and cost must be a nonnegative decimal string.
`tea-skill-runner` translates supported agent CLI reports into this line while keeping the agent's answer on stdout.
A malformed or repeated report stops the run with a target-report error.
The sealed record stores the sum of that trial's issued step reports, and the isolation manifest stores the exact sum of its trials.
Qualification and preflight calls do not count.
When a target gives no complete report, the closed record and manifest schemas still hold zero for missing use.
`run.json` lists the affected trial and step in `unreportedResourceUse`.
An empty list means every issued target call reported use, including an explicit measured zero.
API and MCP calls have no usage report contract and appear as unreported when issued.
Progress reports usage for scored trials only. It can show a trial cost when all trial calls report complete usage; otherwise trial cost is unknown and `reportedTrialCostUsd` is only the subtotal of reports received. `missingReports` gives the number of unreported trial calls. Qualification and preflight costs are not fully captured, so progress does not claim a full-run cost. An explicit zero in a complete report counts as measured zero.
The observed mounts are the paths the confinement's audit saw the trials' targets open outside what they were granted (see [File-system confinement](/docs/reference/tea-evaluate-confinement.md#file-system-confinement)), none in a clean run and none in a run that opted out, which observes no file-system access; on macOS the log can lose reports, so read an empty list together with the trial's `observedMountsChannel` entry in `run.json`.
The runtime observes no network access, so the network allowlist and the observed network targets are empty; a Bubblewrap target has a loopback and the hosts its entry lists through the proxy (see [File-system confinement](/docs/reference/tea-evaluate-confinement.md#file-system-confinement)), and a macOS target keeps the host's network.
Each forbidden input's note says what the runtime hands the target and names the confinement that withheld the rest, or, in a run that opted out, that the runtime does not sandbox the target's file system.
The evaluator configuration carries the `sealedBriefDigest` of the run's sealed brief, and `decodingParameters["tea.evaluatorKind"]`, the evaluation layer's kind.
Its `modelSnapshot` and `systemPromptDigest` come from `policy/evaluator-conditions.json`, which an evaluation whose target or evaluator uses a model commits (`check` requires it, naming a model other than `none`, once a registry entry runs `tea-skill-runner`, which always runs an agent); under a sealed-brief agent they are the agent's `evaluator.modelSnapshot` and the digest of the runtime's evaluator template (see [The evaluation layer](/docs/reference/tea-evaluate-evaluators.md#the-evaluation-layer)):

```json
{
  "schemaVersion": 1,
  "modelSnapshot": "the-model-snapshot-your-target-runs",
  "systemPromptDigest": "sha256:<64 hex digits>"
}
```

A run that uses no model leaves the file out and records `modelSnapshot: "none"` and the digest of the empty byte string, since the published schema requires both.

Each probe is written to `probes/` with these digests: `commitDigest` is the evaluated commit (`sha256:` and the SHA-256 of its identifier; a copy's tree digest), `artifactDigest` the `targetArtifact` bytes (a clean control's and a gameability probe's is its `implementationDigest`, a historical probe's the tracked tree at its pre-fix revision, or, against deployments, `sha256:` and the SHA-256 of its pre-fix release identifier), and `implementationDigest` the tracked tree of `launch.skillRoot`, or `launch.root`, at that commit, the SHA-256 of `git ls-tree -r -z <commit>:<directory>` with the evaluation folder's entries left out (for a copy, the tree digest of that directory without its provisioned directories).

### Record a before state

A skill with known defects fails its clean controls, and `run` stops with exit 11 on the first one.
`--before-state` records that starting point, so a later evaluation of the fixed skill has something to compare with.

A clean control declares its known defect in its attestation: a `qualification.noKnownDefectStatement` that begins `Known defect at this revision:` and says what fails.
The statement for a control that passes stays `No known defect at this revision.`

```json
{
  "route": "clean-control",
  "noKnownDefectStatement": "Known defect at this revision: the review writes whole-file findings for a pull request. This control records the before state."
}
```

```bash
npm exec --prefix evals -- tea-evaluate run --evaluation evals/my-evaluation --before-state
RUN_ID=$(command ls evals/my-evaluation/runs | tail -n 1) # the newest invocation under runs/, the run that just ended
npm exec --prefix evals -- tea-evaluate score --evaluation evals/my-evaluation --run "$RUN_ID"
```

Under the flag, a control that declares a known defect may fail its baseline when its oracles are violated; its evidence goes to `qualification/<probeId>/baseline-known-failing.json`.
Every other control must still pass, and a control with an oracle that cannot decide still exits 11.
The flag covers clean controls only: the clean arm of a seeded probe must still pass its preflight qualification, so a defect that also breaks a seeded probe's baseline still exits 11 there.
A control that declares a known defect and passes is recorded too, and the closing line names it, because its statement is stale.
The flag exits 64 when no selected control declares a known defect.

`run.json` gains `beforeState`, which lists each declaring control with its statement and the disposition its baseline had (`violated` or `held`).
The closing line of `run` and of `score` repeats it, in capitals, as `BEFORE STATE`.
`score` runs as usual and `eval-quality` computes every state: a known-failing control whose trials violate its oracles scores `false-positive`, so `score` exits 2 and the evidence artifacts hold the before state.
TEA records the declaration and computes no verdict.

A before state is excluded from baseline acceptance.
`compare` and `compare --accept` exit 10 on a run that records `beforeState`, and on any run whose sealed clean control still declares a known defect, so deleting the record by hand changes nothing.
Once the defect is fixed, change the control's statement to `No known defect at this revision.`, run without the flag and accept that run.

## status

`status` reads the progress of one `run` invocation from another process. It does not launch a target, score a trial, or write to the run directory.

Synopsis, with optional arguments in brackets:

```text
tea-evaluate status --evaluation <path> [--run <invocationId>] [--follow]
```

Examples, one snapshot of a named run and a follower that reports until it ends:

```bash
RUN_ID=$(command ls evals/my-evaluation/runs | tail -n 1) # the newest invocation under runs/, the run that just ended
npm exec --prefix evals -- tea-evaluate status --evaluation evals/my-evaluation --run "$RUN_ID"
npm exec --prefix evals -- tea-evaluate status --evaluation evals/my-evaluation --run "$RUN_ID" --follow
```

`--evaluation` names the evaluation folder. `--run` names the invocation ID printed when `run` starts; when omitted, `status` selects the latest run. Use an explicit ID to reconnect to a specific invocation. `--follow` reports changes until the run reaches a terminal outcome, including while its last update is stale. Stop a follower for an abandoned run with Ctrl-C. `status` refuses an unknown or malformed run ID and does not follow a linked run entry.

The snapshot shows the current phase, completed and planned trial counts, elapsed time recorded at the last update, completed phase durations, and the last heartbeat. Trial counts include each arm once, even when several probes share it. A heartbeat says when the run last reported progress; an old heartbeat does not establish whether its process is still alive. A completed or interrupted run shows its exit code or signal and no longer emits live heartbeats. Progress makes no verdict or ETA claim; use `score` for the result.

When trial reports exist, the usage section has `scope: "trials-only"`. `trialCostUsd` is a decimal string when all trial calls report complete usage, or null when trial cost is unknown. `reportedTrialCostUsd` is a decimal-string subtotal of reports received, and `missingReports` gives the number of trial calls without complete reports. A complete, explicitly reported zero is a measured zero. Full-run cost is unknown because qualification and preflight cost are not fully captured. Whole-run elapsed time includes those phases.

## score

`score` scores the trial sets of a completed run: the one `--run` names, or the most recent `run` invocation.

eval-quality supplies every behavioral judgment: `score` computes no verdict itself, and exits 0, 2, 3, 4 and 5 are eval-quality's own, passed through.
TEA adds its own exits for what it checks before and around those calls: 10 for a run artifact off its schema or out of agreement with its run, 12 for a call that cannot run or an input whose integrity does not hold, and 64 for usage.

Synopsis, with optional arguments in brackets:

```text
tea-evaluate score --evaluation <path> [--run <invocationId>]
```

Example, scoring a named run:

```bash
RUN_ID=$(command ls evals/my-evaluation/runs | tail -n 1) # the newest invocation under runs/, the run that just ended
npm exec --prefix evals -- tea-evaluate score --evaluation evals/my-evaluation --run "$RUN_ID"
```

| Option                 | Meaning                                                                     |
| ---------------------- | --------------------------------------------------------------------------- |
| `--evaluation <path>`  | The evaluation folder, or its `evaluation.json`. Required.                  |
| `--run <invocationId>` | The run to score. Omitted, `score` scores the most recent `run` invocation. |

Exit codes:

- `0`: every probe scored PASS, WAIVED or CONCERNS.
- `2`: a probe scored FAIL.
- `3`: a probe is Invalid, for example because the audit listed a path the target opened outside its grants.
- `4`: a structural failure of the contract or the evidence, passed through from eval-quality.
- `5`: a runtime fault, passed through from eval-quality.
- `10`: a run artifact is off its schema or out of agreement with its run, or a finding cites no observation or carries no quoted evidence.
- `12`: a score call that could not run, a link or another entry where `score` writes, an input that changed while a call ran, or a staged artifact, exit or `eval-quality:` line the held inputs do not reproduce.
- `64`: `--evaluation` is missing, there is no run to score, `--run` names no run or a `preflight` invocation, or the run did not complete.

Output over the run above:

```text
tea-evaluate score: scoring run 20261007T112710219Z-50f0b256
tea-evaluate score: P-001: eval-quality score exited 0
tea-evaluate score: P-003: eval-quality score exited 0
tea-evaluate score: P-002: eval-quality score exited 0
tea-evaluate score: strength aggregate: eval-quality aggregate-strength exited 0
P-001: eval-quality score exited 0; runs/20261007T112710219Z-50f0b256/scores/20261007T112718210Z-b641cefe/P-001/evidence-artifact.json
P-003: eval-quality score exited 0; runs/20261007T112710219Z-50f0b256/scores/20261007T112718210Z-b641cefe/P-003/evidence-artifact.json
P-002: eval-quality score exited 0; runs/20261007T112710219Z-50f0b256/scores/20261007T112718210Z-b641cefe/P-002/evidence-artifact.json
tea-evaluate score: eval-quality score ran for 3 probe(s) of run 20261007T112710219Z-50f0b256; each call's diagnostics and evidence are in runs/20261007T112710219Z-50f0b256/scores/20261007T112718210Z-b641cefe (exit 0, <project>/evals/my-evaluation/runs/20261007T112710219Z-50f0b256)
```

A run that did not complete (its `run.json` does not say `completed: true`, or it has no `trial-sets.json`) has nothing to score, and `score` exits 64 naming where it stopped, or that it records no end because it is still running or was stopped before it could record one; so does a `--run` naming no run or a `preflight` invocation, and a folder with no run.
Every input is read from the run directory once, as a regular file opened without blocking and without following a link (a FIFO or a link there is a finding, never waited on), held in memory, and checked first:

- `trial-sets.json` against the runtime's own schema (`cli/lib/evaluate/schemas/trial-sets.schema.json`): at least one set, a probe identifier on eval-quality's pattern, and every path inside the run directory;
- the compiled contract, the scoring policy the run copied, the preflight verdict, the evaluator configuration, and each set's probe, records and isolation manifest against the schema eval-quality publishes for it;
- each set against its run: the index names the probes the run sealed, each once, and each record once; each set's `runId` is the one the run derives from its invocation and the probe; each probe file names its probe; every record carries the set's `runId` and arm and the run's contract, sealed brief and evaluator configuration digests; each record's actions and isolation-manifest references are public, name files inside this run directory (the manifest reference its set's own manifest) and digest the files they name (a `records` run's records are your harness's own, so its run IDs, references and digests are left to eval-quality, and the index must name exactly the records the run copied); and the record count, the corpus digest, and the digests of the compiled contract, the policy, the preflight verdict, the evaluator configuration, each probe file, each record and each isolation manifest are the ones `run.json` recorded (under `artifacts` and `policyDigest`), so a file the run did not seal, or one rewritten or copied in from another run, is refused.
- `operation-phases.json` as a regular file with the digest `run.json` recorded; its phase map must equal `run.json.operationPhases`.
  The run writes both from its checked `evaluation.json` before completion, so later edits to the source manifest do not relabel sealed observations.
- every finding, including one from a `records` evaluator, must cite at least one observation in its sealed record and carry quoted evidence.
  A missing citation or quote exits 10 before eval-quality scores the run.

`score` holds each of these files to the digest `run.json` recorded, and keeps the bytes it checked until the command ends (see [Score input integrity](/docs/explanation/why-evaluate-confines-the-target.md#score-input-integrity)).

Any finding exits 10, names the file, and runs no `score` call.
Each `eval-quality: invalid: <reason>` line a call writes to stderr is also printed, prefixed with its probe.
An isolation manifest that is absent is passed on as absent and never filled in, so eval-quality reads that trial set as Invalid.

A probe the run refused has no trial set; `score` prints each one with its reason and records them under `refused` in its aggregate `score.json`, and its exit does not change.
Then `eval-quality score` runs once per probe, with every trial's `--record`, the set's `--isolation-manifest`, the run's `--evaluator-configuration` and the run's corpus digest, with `--designated-oracle` for a probe of a both run under a `partitionPlan` whose behavior the both view lists with several oracles and whose own partition's view lists exactly one (see [Held-out probes and partition plans](/docs/reference/tea-evaluate-manifest.md#held-out-probes-and-partition-plans)), and writes the evidence artifact to the private staging file `--out` names (see [Score output integrity](/docs/explanation/why-evaluate-confines-the-target.md#score-output-integrity)).
Each call goes to `runs/<invocationId>/scores/<scoreInvocationId>/<probeId>/`: `score.json` (its executable, argv in the forms of [Paths in the records](/docs/reference/tea-evaluate-evidence.md#paths-in-the-records), exit code, stdout and stderr, kept whether or not an evidence artifact was emitted) and `evidence-artifact.json` when there is one, with `score.json` beside the probes summarizing each call's exit.
The same run directory receives `partitions.json` and `gap-view.json`.
Both group scored probes under `development` and `held-out`; each available outcome is copied from the probe's evidence artifact.
A probe without an evidence artifact has `outcome: null`.
The development gap view includes the authored probe.
Each held-out gap entry contains only `probeId`, `probeClass`, and `outcome`, so its rationale, defect summary, test-data binding, and mutation text stay hidden.
It also receives `interpretation.json`.
Each trial names its sealed record path and contains its findings with recorded observation citations (`observationId`, `sequence`, `interfaceId`, `operationId`, `provenance`, `phase`, the phase being that of the exact interface-operation pair), each finding's quoted evidence and its oracle's compiled-contract evidence pointers.
The trial's `process` and `outcome` lists reference finding IDs by their cited observation phases; a finding citing both phases appears in both lists.
`firstMaterialError` names the lowest-sequence citation from a `material` or `critical` finding, or is `null`.
Each probe names its evidence artifact path, scorer exit code, score record path and failure detail.
These fields remain available when eval-quality emits no evidence artifact.
The `engine` object copies outcomes, reduced outcomes, strength and the applicable verdict from that artifact; it is `null` when there is no artifact.
Every call's exit is eval-quality's own: 0 (PASS, WAIVED or CONCERNS), 2 FAIL, 3 Invalid, 4 a structural failure, 5 a runtime fault, 64 usage.
`score` exits with the most severe of them and of the aggregate call (see [Run-wide strength aggregate](/docs/reference/tea-evaluate-evidence.md#run-wide-strength-aggregate)), in the order 64, 5, 4, 3, 2, 0, and the call that produced it is on record; rerunning `eval-quality score` by hand on a persisted argv, from the evaluation folder, gives the same exit and byte-identical evidence.
A call that cannot run, is killed or exits with a code the CLI does not document is recorded, the other calls still run, and `score` exits 12.

### When score exits 12

`score` holds every file it reads and writes to the bytes the run recorded, and it re-reads every input after each `eval-quality score` call.
It exits 12, naming the file or the call, when an input changed or appeared while a call ran, when a link or another entry sits where `score` writes, or when a staged artifact, exit or `eval-quality:` line is not what the held inputs produce.
A refused call copies no evidence, its reason is on the probe's entry in the invocation's `score.json`, and the other probes still run.
The checks themselves are described in [Why Evaluate Confines the Target](/docs/explanation/why-evaluate-confines-the-target.md#score-integrity).

## compare

`compare` sets a scored run beside the committed `baseline/` and, with `--accept`, replaces `baseline/` with that run.

Synopsis, with optional arguments in brackets:

```text
tea-evaluate compare --evaluation <path> [--run <invocationId>] [--accept]
```

Examples, comparing a named run with the baseline and, after review, accepting it:

```bash
RUN_ID=$(command ls evals/my-evaluation/runs | tail -n 1) # the newest invocation under runs/, the run that just ended
npm exec --prefix evals -- tea-evaluate compare --evaluation evals/my-evaluation --run "$RUN_ID"
npm exec --prefix evals -- tea-evaluate compare --evaluation evals/my-evaluation --run "$RUN_ID" --accept
```

| Option                 | Meaning                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `--evaluation <path>`  | The evaluation folder, or its `evaluation.json`. Required.                                  |
| `--run <invocationId>` | The run to compare or accept. Omitted, `compare` takes the most recent `run` invocation.    |
| `--accept`             | Replace `baseline/` with a snapshot of the run. A run recorded as `dirty: true` is refused. |

Exit codes:

- `0`: the comparison ended as `compared`, `first-run` or `refused`, or the baseline was accepted.
- `10`: the run's scores cannot be read as files the run wrote, a probe has no evidence artifact, a baseline holds a link, an entry that is not a regular file or an artifact off its schema, a baseline's bytes differ from its `baseline.json`, or `--accept` was given for a dirty run or a run that lacks a member a replay needs.
- `12`: `--accept` could not stage or swap in the baseline (the old `baseline/` is restored), or `runs/.compare-staging.lock` already exists.
- `64`: `--evaluation` is missing, there is no run to compare, or the run did not complete or has no score invocation.

With no baseline the comparison ends as `first-run`:

```text
tea-evaluate compare: comparing run 20261007T112710219Z-50f0b256
tea-evaluate compare: first-run: baseline/ holds no baseline to compare run 20261007T112710219Z-50f0b256 with; accept it with tea-evaluate compare --accept (exit 0, <project>/evals/my-evaluation/runs/20261007T112710219Z-50f0b256)
```

The message leaves out the prefix, `--evaluation` and the run; once the evidence is reviewed, the complete command, naming the run explicitly, is:

```bash
npm exec --prefix evals -- tea-evaluate compare --evaluation evals/my-evaluation --run "$RUN_ID" --accept
```

Accepting the run creates the baseline:

```text
tea-evaluate compare: accepting run 20261007T112710219Z-50f0b256
tea-evaluate compare: accepted: run 20261007T112710219Z-50f0b256 (score invocation 20261007T112718210Z-b641cefe) is the baseline, 53 file(s) under baseline/ (exit 0, <project>/evals/my-evaluation/runs/20261007T112710219Z-50f0b256)
```

With a baseline in place, the next comparison reports each probe:

```text
tea-evaluate compare: comparing run 20261007T112710219Z-50f0b256
P-001: incomparable (a is the baseline, b is run 20261007T112710219Z-50f0b256)
P-002: equivalent (a is the baseline, b is run 20261007T112710219Z-50f0b256)
P-003: incomparable (a is the baseline, b is run 20261007T112710219Z-50f0b256)
tea-evaluate compare: compared: 3 probe(s) of run 20261007T112710219Z-50f0b256 with the baseline of run 20261007T112710219Z-50f0b256 (exit 0, <project>/evals/my-evaluation/runs/20261007T112710219Z-50f0b256)
```

The run is the one `--run` names, or the most recent `run` invocation.
A run that is unresolved, did not complete or has no score invocation under `scores/` exits 64, as `score` does for a run with nothing to score.
A run whose latest score invocation holds no evidence artifact for a probe in `trial-sets.json` exits 10 naming the probe, and an artifact off the schema eval-quality publishes exits 10 as well.

### Comparing

Without `--accept`, `compare` reads the run's per-probe evidence artifacts (its latest `scores/<scoreInvocationId>/`) and the baseline's, validates each against the published `evidence-artifact` schema, and reports one of three outcomes.
Each exits 0:

- `first-run`: there is no `baseline/`.
  Accept the run to create one.
- `refused`: the two sides do not measure the same thing, and the reason says which.
  The partitions differ (a held-out or `both` run against a baseline accepted under another partition; the reason names both), the probe sets differ, a probe's `comparabilityKey` differs (changed scoring policy, probe set or corpus; the reason names both keys), or `evalQualityVersion` differs.
  The key is read from each evidence artifact, where eval-quality records it.
  The version is read from `run.json`, since every artifact below it was scored by that install, so a baseline another engine release scored is refused without reading its artifacts, and the reason routes to `compare --accept`: the pull request that moves the engine re-records the baseline there.
- `compared`: one line per probe with eval-quality's own `compareDominance` relation (`a-dominates-b`, `b-dominates-a`, `equivalent` or `incomparable`), the baseline as `a` and the run as `b`.
  TEA computes no relation or ordering; a clean control, which carries no strength vector, compares `incomparable` with itself.

A `baseline/` whose bytes are not the ones `baseline/baseline.json` lists exits 10 with a `baseline-digest` finding for each file whose `digestBytes` differs from the manifest's `files` map, each listed file that is missing and each file other than `baseline.json` that the map does not list, before any of the baseline's evidence is read and with no verdict; `check` reports the same rule, so a baseline edited by hand cannot pass as the one that was accepted.
A `baseline/` that holds a link or any entry that is not a regular file or directory, lacks its `run.json`, `trial-sets.json` or score invocation, or holds a `run.json` or `trial-sets.json` that is not a JSON object, exits 10 naming the entry.
A run whose directory, or a directory above one of its evidence artifacts, is a link exits 10 naming that directory, and nothing is followed.
`compare` without `--accept` reads and writes nothing under `baseline/` or `runs/.compare-staging/`.

### Accepting a baseline

`compare --accept` replaces `baseline/` wholesale with a byte-identical snapshot of the run.
A baseline changes only through this command, in a reviewed pull request; commit it with the change that moves the engine, the contract, the corpus or the policy.
Commit `baseline/` before the next `run`, since an uncommitted baseline inside a repository makes that run record `dirty: true`.

`compare --accept` is the only command that writes.
Before it looks at the run, it takes an exclusive lock with one `mkdir` of `runs/.compare-staging.lock` (a `pid` file inside names the holder for the message) and keeps it through the swap and cleanup.
A lock directory that already exists makes the accept exit 12 naming `runs/.compare-staging.lock` and the pid when it can be read; nothing decides a lock is stale or takes one over, so when no accept is running (an earlier accept was killed with SIGKILL), delete that directory by hand and run the accept again.
A Ctrl-C or SIGTERM removes the lock and exits with the shell's signal status (128 plus the signal number); the staging leftover stays for the next accept's recovery.
A `runs/` that is a link or a file, or a lock path that cannot be created, exits 12 with the real error text.
Under the lock it puts a retired baseline back when `baseline/` is absent (see below) and deletes stale staging and retired directories.

The refusal order is fixed:

1. No run, a run that did not complete, or a run with no score invocation: exit 64.
2. `dirty: true` in `run.json`: exit 10 with nothing written.
   A run measured over uncommitted work (`--from-working-tree` over a change) is never accepted, and there is no flag that overrides it.
   A before state (`run --before-state`, or a run whose sealed clean control declares a known defect) is refused the same way, by `compare` as well as `compare --accept`.
3. One pass over the run that reports every finding it makes: a probe with no evidence artifact in the latest score invocation, a member the replay needs that is missing, a link (a directory above a member included), any entry that is not a regular file, an actions artifact whose bytes differ from the digest its record names, and a latest `scores/<scoreInvocationId>/score.json` that does not parse, does not name this run and invocation, records an exit other than 0, 2 or 3 (12, 64, 4 or 5) or records a strength aggregate that was refused, failed or disagreed with the evidence `score` persisted.
   Exit 10 naming each, with nothing written; a `score.json` finding says to score the run again.
   A weak result stays acceptable: a probe the corpus did not catch exits 2.
4. Only when step 3 found nothing: every finding the input checks `score` runs over the run's artifacts would report (an edited sealed record or operation phase snapshot, for example), so no run `score` would refuse becomes a baseline.
   Exit 10 with nothing written.
5. The copy.
   The snapshot is staged under `runs/.compare-staging/` (gitignored, on the same file system as `baseline/`, so each rename is atomic), each staged file is read back and held to the digest of the bytes it was staged from, and the directory is swapped in as the last step.
   A failure while staging or swapping removes the staging directory, restores the previous `baseline/` and exits 12, so a refused or failed accept leaves the old baseline byte-identical; when restoring it fails too, the message says `baseline/` is absent and where the previous baseline lies.

Nothing is staged inside the committed evaluation folder, so an accept that is interrupted leaves no untracked entry there for the next `run` to record as `dirty: true`.
An accept interrupted between its two renames leaves `baseline/` absent and the previous baseline under `runs/.compare-staging/retired-*`.
The next `compare --accept` puts it back under its lock (a restore that fails reports the real state, where the retired baseline lies, and exits 12) and deletes stale staging and retired directories.
A plain `compare` is strictly read-only and never restores or deletes: with `baseline/` absent and a retired copy present it exits 10 naming the copy (and the lock, when one is present), since an accept either stopped there or is still running.

`baseline/` mirrors the run directory's relative paths, byte for byte, so every digest `run.json` recorded still matches.
The sealed records name their actions artifacts and isolation manifests as `runs/<acceptedRun>/...` paths, and `score` refuses a reference outside the run directory it scores, so a replay places the baseline's bytes at `runs/<acceptedRun>/` inside a scratch copy of the evaluation folder; under any other id, or under `runs/<id>/replay/`, the records would reach outside their run.
No file is rewritten, since the runtime recorded the neutral forms in the first place and every digest was taken over those bytes.
It holds:

| Path                                                                                                     | What it is                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run.json`, `trial-sets.json`                                                                            | the run record with the digests of every file below, and the index of its trial sets                                                                                               |
| `contract.json`, `eval-contract.json`, `sealed-evaluator-brief.json`                                     | the contract snapshot, the compiled contract and the sealed brief                                                                                                                  |
| `scoring-policy.json`, `evaluator-configuration.json`, `operation-phases.json`, `preflight-verdict.json` | the scoring policy, the evaluator configuration, the operation phase map and the preflight verdict the run used                                                                    |
| `probes.json`, `probes/`                                                                                 | the qualified probes, exactly as the run sealed them                                                                                                                               |
| `observations.json`, `observations/`                                                                     | the preflight observations                                                                                                                                                         |
| `trial-sets/`                                                                                            | each trial set's sealed records and isolation manifest                                                                                                                             |
| `trials/<arm>/trial-<n>.json`                                                                            | only the actions artifacts the records reference, since `score` refuses a record whose actions artifact is absent                                                                  |
| `qualification/<probeId>/`                                                                               | the qualification evidence the probes name, also listed in `baseline.json` as public references under `baseline/qualification/`, which `check` verifies                            |
| `scores/<scoreInvocationId>/`                                                                            | the run's latest score invocation: its evidence artifacts, call records, strength aggregate and floors                                                                             |
| `baseline.json`                                                                                          | the manifest: the accepted run, its score invocation, partition, `evalQualityVersion`, `corpusDigest`, `contractDigest`, `policyDigest` and a `files` map of path to `digestBytes` |

Nothing under `engine/`, `faults/`, `refused/` or `evaluator-qualification/`, no other file under `trials/`, and none of the derived views (`gap-view.json`, `interpretation.json`, `partitions.json`) is copied, and no probe's bytes or evidence paths are rewritten, since the probe digests `run.json` anchors would stop matching.
Omitting any of these inputs makes the replay fail: without the isolation manifests, `score` reads each trial set as Invalid and exits 3.
`run.json`, the observations and the score call records are copied as they are, and they hold the neutral forms of [Paths in the records](/docs/reference/tea-evaluate-evidence.md#paths-in-the-records), so the baseline names no workspace, repository, staging directory, checkout or home directory that the runtime wrote.
The text a target printed is part of each observation as received.
`baseline.json` meets the runtime's own schema (`cli/lib/evaluate/schemas/baseline.schema.json`).

## ci

```bash
npm exec --prefix evals -- tea-evaluate ci --evaluation evals/my-evaluation --tier pr
```

`ci` runs exactly the checks `ci/evaluation-ci-plan.json` places on one tier, `pr`, `merge`, `scheduled` or `release`: the plan is the only definition of tier membership.
It runs every check of the tier in plan order, whether or not an earlier one failed, so the evidence bundle is complete, and it enforces eval-quality's verdicts through one fixed table of exits and actions.
eval-quality supplies every behavioral judgment: each engine stage's exit passes through verbatim, `ci` passes no `--strict`, and it computes no verdict of its own, so eval-quality's exits and its evidence artifact decide what a check found.
`ci` adds TEA's own exits for what it checks around them: 10 for an authoring or plan defect, 11 for an evaluation weakness such as oracle disagreement or a stale baseline on `release`, 12 for a check that cannot run, 13 for evidence drift in the replay and 64 for usage.
An unknown or missing `--tier` is a usage error (64), and so is a missing plan, which the finding names by path.
A tier with no checks runs nothing and still writes its summary.
A tier holds only the checks placed on it, so a pipeline triggered by a merge runs the `pr` tier as well as the `merge` tier.

### The plan

`ci/evaluation-ci-plan.json` is platform-neutral and meets the runtime's own schema (`cli/lib/evaluate/schemas/evaluation-ci-plan.schema.json`).
The last stage of `bmad-tea-evaluate` writes it from an inspection of the adopter's repository, starting each check at the default tier and recording in `placement.reason` the file or answer behind every placement, and sets `evaluation.json` `tiers` to the tiers the plan uses.
`check` and `ci` hold the fields that follow from other fields to that plan: each check's `trigger` to its tier, `tiers` to the plan's tiers, the template placeholder, a check the evaluation cannot run and a `preflight-live` default to the registry.
Each check carries:

| Field         | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | for an `evaluate` check, one of the closed set below, so an unknown id fails validation; for a `gate` check, the name of the adopted gate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `tier`        | `pr`, `merge`, `scheduled` or `release`; it equals `placement.tier`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `trigger`     | what starts the check in a pipeline, and only an event its tier uses: `pull-request` on `pr`, `merge` on `merge`, `schedule` and `manual-dispatch` on `scheduled`, `release` and `manual-dispatch` on `release`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `kind`        | `evaluate`, run by `ci` through its id, with a `tea-evaluate` command that records the argv a reader can run by hand, except `preflight-live` under a `partitionPlan`, which `ci` alone runs over every partition (a pipeline runs `tea-evaluate ci --tier <tier>` once per tier); or `gate`, an `eval-quality-gates` command the adopter adopted, run as a child process in the evaluation folder with the plan's argv and no shell                                                                                                                                                                                                                                                                                                         |
| `command`     | the argv, led by `tea-evaluate` or `eval-quality-gates`, one array item per argument with no shell                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `enforcement` | `block`, or `warn` where the table says warn: a strength regression on `strength-comparison` (`scheduled`, `release`) and the strength floor on `twin-run` and `held-out` (`scheduled`). The field records the class; the action comes from the table, so a plan cannot demote a blocking exit, and validation refuses `warn` anywhere else                                                                                                                                                                                                                                                                                                                                                                                                  |
| `timeoutMs`   | a `gate` check only: how long the child may run, from 1000 to 3600000 milliseconds, 600000 when absent. Past it the runtime stops the gate's process group and the check exits 12                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `gates`       | optional: the ids of existing pipeline jobs (a publish or deploy job the repository already has) that the check's tier must gate, so a blocking exit stops the shipment. The jobs a tier gates are the union of `gates` over the checks the plan places on it, so a job is named once on any check of the tier and a repeat across the tier's checks is merged. `bmad-tea-framework` in CI scope renders each as a wait of the job on the tier's evaluation job: `needs` inside one workflow file; across files a `workflow_run` trigger, an `if:` on the run's conclusion, event and workflow path, the evaluated commit as the checkout `ref` and an event guard on that workflow's other jobs. The field names a job and creates no event |
| `evidence`    | the paths, relative to the evaluation folder, where the check leaves its evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `placement`   | `tier`, the `defaultTier` the default-tier table below gives the check, and a `reason` that names what the repository inspection found; every check needs a non-blank reason, whether its `tier` is its `defaultTier` or not                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

The `evaluate` ids, and the tiers each one defaults to:

| Id                                                                 | Default tier           | Runs                                                                                                                                                                                                               |
| ------------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `check`                                                            | `pr`                   | [`check`](#check), contract-source freshness and the plan's own rules included                                                                                                                                     |
| `compile`, `seal`                                                  | `pr`                   | eval-quality's `compile` and `seal` over `contract.json`, and under a `partitionPlan` over each of the development, held-out and both views; the engine's exit passes through, the most severe of the views' exits |
| `api-conformance`                                                  | `pr`                   | `node adapter/http-probe-port.conformance.mjs` in the evaluation folder; exit 1 is 10, a run that cannot finish 12                                                                                                 |
| `gameability`                                                      | `pr`                   | the gameability arm of every gameability probe, scored through `score` over the baseline's records                                                                                                                 |
| `oracle-agreement`                                                 | `pr`                   | the `corroboration` eval-quality recorded on each oracle outcome of the baseline evidence                                                                                                                          |
| `replay`                                                           | `pr`                   | the baseline replayed through eval-quality `preflight` and `score`                                                                                                                                                 |
| `preflight-live`                                                   | `merge`                | [`preflight`](#preflight) over the real target, when it needs no secret                                                                                                                                            |
| `twin-run`, `held-out`, `judge-calibration`, `strength-comparison` | `scheduled`, `release` | the live checks below                                                                                                                                                                                              |

Validation exits 10 (and `check` reports the same findings) for: a `tier` and a `placement.tier` that disagree, two checks of one id on one tier, a command not led by its tool, a `trigger` its tier does not use, a `<evaluation-folder>` left in a `command` or an `evidence` path (`<invocationId>` stays, the runtime fills it), a `defaultTier` the table does not give the check, a `preflight-live` `defaultTier` that disagrees with the registry (`merge` when the registry names no `environmentKeys` and the target is no skill or agent runner, `scheduled` or `release` otherwise), a check with no non-blank `reason`, a `gates` list that is empty, repeats a name or holds a name that is no job id (`gates`; the id is letters, digits, `-` and `_`, starting with a letter or `_`), `evaluation.json` `tiers` that differ from the set of tiers the plan places a check on, an `api-conformance` check over an evaluation whose registry names no HTTP target, a contract that declares a rubric (in `contract.json` or the held-out plan) while a live tier the plan uses holds no `judge-calibration` check, a deterministic check that needs no secret (every `pr` default, and every `gate`) placed off `pr`, since every pull request runs it, a live check on `pr`, which needs no secret and calls no model, an `enforcement` of `warn` where the table gives no warn, a `timeoutMs` on an `evaluate` check, and a `ci/` directory that is a link or a file, since a link there is followed by every plain read of the plan below it.

### The pr tier

- `replay` reads baseline bytes only from `baseline/`.
  It builds a scratch copy of the evaluation folder in a private directory beneath the run's private parent (`run-<pid>-*` in the user's private root, the root a confined target is denied), places the baseline's bytes at `runs/<acceptedRun>/` in it (the sealed records name their artifacts there), writes the baseline's own strength floors (`scores/<id>/strength-floors.json`) into the copy's `evaluation.json`, runs eval-quality's `preflight` over the baseline's `contract.json`, `probes.json` and `observations.json`, and runs `score` over it, with the staging directories of every call inside the scratch directory.
  The produced score subtree is the one `scores/` entry that is new after the call.
  `baseline/scores/` must hold the accepted score invocation alone, as a real directory (each accept keeps the latest subtree), and the manifest's `acceptedRun` and `scoreInvocationId` must be invocation identifiers, since each names a directory; a baseline that breaks either rule exits 10.
  The produced preflight verdict and every file `score` wrote under `scores/<id>/` (each probe's `evidence-artifact.json` and `score.json`, `strength-aggregate.json`, `strength-floors.json` and `aggregate-strength.json`) are written to a fresh `runs/<invocationId>/replay/` and compared byte for byte with the baseline's.
  The call records hold the path forms of [Paths in the records](/docs/reference/tea-evaluate-evidence.md#paths-in-the-records), so a replay of the same records writes them again; the one file left out is the invocation's own `score.json` summary, which names the replay's invocation id.
  The stage exits pass through.
  When they are 0 or 2 and a file differs, is missing or is extra, the check exits 13, evaluation evidence drift.
  A changed control leg in an observation makes eval-quality's own preflight exit 3, which passes through.
  The scratch directory, which also holds the staging directories of every engine call `ci` makes, is removed with its private parent however `ci` ends, a signal included; a `ci` killed with SIGKILL leaves them, and the next `ci` over the same evaluation folder removes the parent once the owner named in the scratch directory's owner file is gone.
  A parent of another evaluation folder, or of an owner that still runs, stays.
- `oracle-agreement` reads `corroboration` on each oracle outcome of the baseline evidence (`agrees`, `disagrees` or `not-evaluable`, the engine's own comparison of the evaluator's judgment with the evidence) and keeps no table of its own.
  `disagrees`, or `not-evaluable` or `unreached` on an oracle a behavior of the contract names, exits 11.
- `gameability` scores every gameability probe's arm through `score` over the baseline's records.
  No target launches.
- A **stale baseline**: when the current contract (compiled), corpus or `policy/scoring-policy.json` digest, or the strength floors in `evaluation.json`, differ from the ones the baseline recorded, the tier warns; on `release` the same state exits 11.
  The rule applies once per tier whenever `baseline/` exists, whichever checks the plan holds, and each check that reads the baseline (`replay`, `gameability`, `oracle-agreement`, `twin-run`, `strength-comparison`) carries it too: on `release` its exit combines with 11 by severity.
  The replay still runs against the baseline's own snapshot, with the baseline's floors, so an edit to the floors since the accept is a stale baseline.
  Re-record the baseline with `compare --accept` in a reviewed pull request.
- CONCERNS is read from `contractVerdict` in the evidence artifact and is a warning: exit 0, a warning line and a `warn` row.
  The replay, the gameability arm and every scored live run (`twin-run`, `held-out`, `judge-calibration`, `strength-comparison`) read it from the latest score of their run.

### The live tiers

`preflight-live` runs `preflight` over every partition and exits as it does; CI is no authoring step, so a `partitionPlan` does not require it to name one.
The plan records the argv `tea-evaluate preflight --evaluation <folder>` for the check, and `ci` runs the check by its id, so under a `partitionPlan` that argv exits 64 when typed by hand.
`twin-run` runs the evaluation (`run`, then `score`) over the partition the baseline recorded, at the scoring policy's `minimumTrialCount` trials per arm.
A baseline of `both`, the default of `run`, is a run of everything, held-out probes included, because a development run against it would be a `refused` comparison; `held-out` applies the floor to that partition on its own.
`held-out` runs the held-out partition on its own, at the evaluation's declared trial count.
`judge-calibration`, when the contract declares a rubric, reads the calibration report a run writes before its first trial and exits 11 below `judgeCalibration.minimumAgreement`; a contract with no rubric has nothing to calibrate.
`strength-comparison` compares the scored twin run with `baseline/` through [`compare`](#compare): a `refused` comparison, across `evalQualityVersion` included, is informational and routes to `compare --accept`, and a probe the baseline measured stronger is a warning.

The strength floor is read from the floor decisions eval-quality records in the strength aggregate of the twin run and of the held-out run, each on its own.
A class that does not meet its floor warns on `scheduled` and exits 2 on `release`.

Declare a floor only for a class that the partition it is read on can hold an eligible probe of.
A probe is eligible for the strength vector when it is not a canary and not `expectedClean`, so a clean control, which is also the `zero-action` class, never fills a floor: a `zero-action` floor reads `no-eligible-probe` and does not meet it unless each partition it is read on holds a `zero-action` defect probe, which a behavior that must take an action (its missing action is the defect) needs.
An evaluation whose behaviors all respond to a request declares `defect` and, once it holds a gameability probe in each partition, `gameability`, and no `zero-action` floor.
The twin run repeats the partition `baseline/` recorded and the held-out partition is read on its own, so every class whose floor the evaluation declares needs an eligible probe in the partition `baseline/` records (the corpus without `heldOutProbes` for a development baseline, the whole corpus for a `both` baseline) and one in `heldOutProbes`: a `gameability` or `zero-action` floor needs two probes of that class for a development baseline, one held out and one in the recorded partition, beside the defect probes.
The Evaluate skill's starter `evaluation.json` declares the `defect` floor alone for that reason.

### Exits and the evidence

A check that needs an absent `baseline/` exits 64; accept a scored run with `compare --accept` before rerunning it. `api-conformance` also exits 64 when `evaluation.json` names no HTTP entry in its registry.

The final exit is the most severe blocking result, in this order: 64, 12, 5, 4, 3, 13, 11, 10, 2, 1, then 0.
Each exit has a class and an action: eval-quality's 2 (target behavior failure), 3 (infrastructure or integrity), 4 (contract authoring defect), 5 (runtime fault) and 64, `tea-evaluate`'s 10, 11, 12, 13 and 64, and a gate's 1 (repository policy violation) and 64, each blocking.
A gate exit outside that table passes through as an undocumented exit, blocking, ranked after 1.
A `gate` check runs as a child process in a process group of its own, with the plan's argv, no shell and stdin closed.
It ends at its plan check's `timeoutMs` (600000 when absent): the group gets SIGTERM, then SIGKILL after two seconds, and the check exits 12.
It ends the same way, with the bytes up to the bound kept, when it prints more than 64 MiB; exactly 64 MiB passes.
Whatever the gate left running in its process group, a descendant that holds no stream included, is killed when the gate exits.
What the gate printed is persisted whatever the exit.
A SIGINT or SIGTERM to `ci` ends whatever the running check is waiting on at once: a gate, or an eval-quality stage (the plan's `compile` and `seal`, the replay's `preflight`, `score` and `aggregate-strength`, the stale-baseline `compile`, the compile `check` runs, and the stages of a live check).
The group of the gate or stage gets the signal and is killed half a second later, `ci` removes its scratch directory, and then `ci` ends by the same signal.
Only a SIGKILL of `ci` itself leaves a running gate or stage in its own process group, since no portable parent-death signal exists; the next `ci` over the folder removes the scratch directory it left, the one a `check` check made included.

`runs/<invocationId>/` holds `ci.json` (the tier, each check's id, exit, class, action, enforcement, evidence paths, warnings and notes, and the final exit), and per check `checks/<id>/exit-code`, `stdout` and `stderr` as the check printed them, whatever the exit (an `evaluate` check in the path forms of [Paths in the records](/docs/reference/tea-evaluate-evidence.md#paths-in-the-records), a `gate` as your command printed it); the engine's call records and outputs of `compile`, `seal` and the replay (`replay/preflight-verdict.json`, `replay/scores/`, `replay/engine/preflight.json`) sit beside them, and a live check's own run directories stay under `runs/`.

Under a `partitionPlan` the `compile` and `seal` checks run over three views: the development view (the folder's own `contract.json`), the held-out view and the both view.
The development view writes `checks/<id>/engine.json` and the compiled contract (`eval-contract.json`) or the sealed brief (`sealed-evaluator-brief.json`) beside it, the paths a folder with no `partitionPlan` has, and the held-out and both views write the same file names under `checks/<id>/held-out/` and `checks/<id>/both/`.
The check's stdout names each view and its exit, and the row's exit is the most severe of the views' exits, so the engine's exit and its class reach `ci` unchanged.
A view the engine refuses leaves its `engine.json` and no compiled contract or sealed brief, and eval-quality recompiles a contract before it seals it, so a view that does not compile is never sealed.
What the engine said about the held-out or both view stays in that view's `engine.json`, since it can quote the held-out plan: the console summary and the development view's files carry no held-out ID.
A view that cannot be derived, because the held-out plan or `contract.json` is absent, does not parse or is off its shape, is a finding that names the view (exit 10); its stage does not run and the other views still run.
A folder with no `partitionPlan`, and one whose `evaluation.json` cannot be read, runs each stage once over `contract.json` and writes the one `engine.json` and the one artifact.
Upload the evaluation folder's `runs/`, which holds every invocation's `<invocationId>/` directory, as a pipeline artifact whatever the result.
`bmad-tea-framework`'s CI setup renders the plan into the pipeline as one `tea-evaluate ci` step per tier with that upload under `if: always()` (see [Framework CI Setup](/docs/how-to/workflows/setup-test-framework.md#evaluation-plans)).

Accepted baselines hold the neutral path forms of [Paths in the records](/docs/reference/tea-evaluate-evidence.md#paths-in-the-records), so they name no workspace, repository, staging directory or home directory.
A baseline accepted before those forms existed holds absolute paths in its call records, so its replay reports drift until `compare --accept` records it again.

## tea-skill-runner

Synopsis, with optional arguments in brackets:

```text
tea-skill-runner --skill-root <dir> --agent <claude|codex|custom|agy> [--agent-cmd <path>] [--agent-arg <arg>]... [--env-pass <NAME>]... [--model <name>] [--timeout-ms <n>] [--capability <tier>]... < <prompt file>
```

Example, running `skills/my-skill` through the Claude Code adapter on the prompt in `prompt.txt`, from the project root:

```bash
npm exec --prefix evals -- tea-skill-runner --skill-root skills/my-skill --agent claude < prompt.txt
```

`tea-skill-runner` is the command an evaluation registers for a skill target.
It reads the prompt on standard input, tells the agent where the skill is (`--skill-root`, a directory holding `SKILL.md` inside the working directory), runs one headless agent turn through TEA's agent adapters, and prints what the agent printed.
The agent receives a short preamble naming the skill root, then the prompt exactly as read; a prompt that is not valid UTF-8 is a usage error.
It never looks for a skill anywhere else, and it names no vendor: `--agent` is required.
The skill root and its `SKILL.md` must resolve inside the working directory, symbolic links included.

The options:

| Option                | Meaning                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--skill-root <dir>`  | The skill directory, holding `SKILL.md`, inside the working directory. Required.                                                                       |
| `--agent <name>`      | The agent adapter: `claude`, `codex`, `custom` or `agy`. Required.                                                                                     |
| `--agent-cmd <path>`  | An executable that replaces the adapter's own command. The `custom` adapter requires it.                                                               |
| `--agent-arg <arg>`   | An extra argument appended to the agent CLI's argv. Repeatable.                                                                                        |
| `--env-pass <NAME>`   | The name of an environment variable allowed through to the agent. Repeatable.                                                                          |
| `--model <name>`      | The model to pin for this run. Omitted, the adapter's default.                                                                                         |
| `--timeout-ms <n>`    | The agent's wall-clock timeout in milliseconds. The default is 1200000.                                                                                |
| `--capability <tier>` | What the run may do to the file system: `read-only`, `scoped-artifact-writes` or `command-execution`. Repeatable; `scoped-artifact-writes` by default. |

The exit codes:

| Exit | Meaning                                                                                                                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | the agent ran to completion                                                                                                                                                                                               |
| 2    | usage: a missing or malformed option, an empty prompt or one that is not UTF-8, or a skill root outside the working directory                                                                                             |
| 3    | configuration: an unknown agent, or a skill root that does not exist or holds no `SKILL.md`                                                                                                                               |
| 4    | transport: the agent failed to start or exited non-zero, a process supervising it ended before the agent or without reporting, standard output closed before the reply was written, or the runner met an unexpected error |
| 5    | timeout: the agent outlived `--timeout-ms`; on POSIX its process group got `SIGTERM`, then `SIGKILL` 2 s later if it was still running; on Windows the Job Object closes when the agent ends and stops its descendants    |
| 6    | parser: the agent's usage report could not be read (malformed or incomplete JSON from the agent CLI)                                                                                                                      |

The example below runs the skill root `skill` with the `custom` adapter and `cat` as the agent, so the output is the prompt the agent received:

```bash
printf 'Review a refund of 100 against the limit of 100.\n' | npm exec --prefix evals -- tea-skill-runner --skill-root skill --agent custom --agent-cmd cat
```

```text
The skill to run is in `skill`. Read `skill/SKILL.md` first and follow it for the request below.
Resolve every path the skill names against that directory; resolve every other path against the working directory.

----- request -----
Review a refund of 100 against the limit of 100.
```

A registry entry for the runner declares `infrastructureExitCodes` 3 to 6, and `check` holds it to that.
On Linux the entry also lists the model provider's host and port in `egress`, since the agent calls it and a Bubblewrap target has a loopback only (see [File-system confinement](/docs/reference/tea-evaluate-confinement.md#file-system-confinement)).
A confined `--agent claude` target on a subscription declares `"login": "claude"` on its entry, which gives it the login it finds under the private home (see [A subscription login under confinement](/docs/reference/tea-evaluate-confinement.md#a-subscription-login-under-confinement)).
Its `target` is a path to the runner or the bin name `tea-skill-runner`, and where the runner lives decides whether `score` passes (see [Where the runner lives](#where-the-runner-lives)).

On POSIX the agent runs in its own process group, and when the agent exits, every process left in that group receives `SIGKILL`.
The group is also stopped when `--timeout-ms` runs out, and when the runner's process group receives `SIGINT`, `SIGTERM`, `SIGHUP` or `SIGQUIT`.
A process that leaves the group, such as a daemon that starts its own session, keeps running, and the runner does not wait for it.
On Windows a Job Object owns the agent and its descendants.
[How the skill runner supervises its agent](/docs/explanation/why-evaluate-confines-the-target.md#how-the-skill-runner-supervises-its-agent) describes the processes behind this.

Set every leg's `--timeout-ms` below the entry's `maxElapsedMs`.
On POSIX, reserve another 40 s in `maxElapsedMs` for watchdog setup, supervisor completion and runner overhead.
On Windows, reserve another 120 s in `maxElapsedMs` for bounded Job Object setup, supervisor completion and runner overhead.
These reserves let the runner report its own timeout as exit 5 before the adapter's ceiling fires.
At the ceiling, the adapter kills the runner's process group, records the leg as a fault, and `preflight` exits 12.
Exit 2 is left out on purpose: a usage error is a defect in the evaluation's own wiring, and its preflight and oracles see it as a failed run.

### Where the runner lives

On macOS an undeclared runner outside the read grants cannot load its source.
`preflight` names captured denials and the setup below even when its verdict fails.
`run` can stop at its verdict before any trial is sealed.
`score` then exits 64 because that incomplete run has no trials to score.

A confined trial reads its workspace, the system's own paths and the paths its registry entry lists in `systemPaths`.
The runner is a program the trial starts, so the audit lists each of its files that lies outside those places.
On macOS, the kernel refuses an undeclared source load, and `preflight` reports the attempted paths with exit 3. On Linux, `preflight` audits each leg's reads and refuses paths every leg opened with exit 3 before any trial; `run` and `score` refuse those paths from the trials' manifests, one `isolation manifest violation: mount outside allowlist` line per file.
That happens when `target` is a bare name such as `tea-skill-runner` and the name resolves to an install outside the workspace.
After `npm install --prefix evals bmad-method-test-architecture-enterprise eval-quality`, the install is `evals/node_modules`. On macOS, `preflight` reports the kernel-denied attempt. The path count depends on which source files the runner tried to load:

```text
tea-evaluate preflight: isolation manifest violation: every preflight leg attempted access to <count> path(s) outside the allowlist (mount outside allowlist: <project>/evals/node_modules/bmad-method-test-architecture-enterprise/cli/lib/agent-adapters.js; and other attempted paths); the kernel refused those accesses (exit 3).
```

In the Linux traced-read example, the audit names 18 paths, including the link `node_modules/.bin/tea-skill-runner` that `PATH` resolves under `evals/node_modules/.bin`.
For a path only some legs opened, `preflight` prints a note naming the path and the legs, and `run` and `score` refuse any trial that opens it.
Two setups work.

1. Put the runner inside `launch.root` and name it by its path in `target`.
   The path is `node_modules/.bin/tea-skill-runner` when TEA is installed in the project root, and `evals/node_modules/.bin/tea-skill-runner` for the install above.
   A `copy` workspace holds the install.
   A `git` workspace lacks an ignored directory, so list the install in `workspace.provision`, for example `"provision": ["evals/node_modules"]`.
2. Keep the bare name and list the two install directories, and the bin directory that holds the runner's link on `PATH`, in the entry's `systemPaths`, as absolute paths (a Linux audit lists the link itself):

```json
{
  "interfaceId": "refund-skill",
  "executable": "tea-skill-runner",
  "target": "tea-skill-runner",
  "subcommandPaths": [[]],
  "artifacts": {},
  "environmentKeys": [],
  "maxElapsedMs": 100000,
  "infrastructureExitCodes": [3, 4, 5, 6],
  "systemPaths": [
    "/work/app/evals/node_modules/bmad-method-test-architecture-enterprise",
    "/work/app/evals/node_modules/commander",
    "/work/app/evals/node_modules/.bin"
  ]
}
```

## Exit codes

Each command section above lists its causes and options.
For `ci`, the final exit is the most severe blocking result in the order given by [Exits and the evidence](#exits-and-the-evidence).

| Exit | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Success. For `score`, PASS, WAIVED, and CONCERNS all exit 0. `compare` also exits 0 for `first-run` or `refused`; `ci` exits 0 when every check passed or warned.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 1    | `ci`: a gate's policy violation or undocumented exit, ranked after other blocking exits.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2    | A FAIL from eval-quality, passed through by `score` and `ci`. On `release`, `ci` also uses 2 for a breached strength floor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 3-5  | Engine exits passed through: 3 for failed preflight or Invalid evidence, 4 for a contract defect, 5 for a runtime fault. `score` passes through a stage's exit only when its artifact, exit and reason lines are what the held inputs produce (see [Score input integrity](/docs/explanation/why-evaluate-confines-the-target.md#score-input-integrity)). `ci` passes through the exits of its engine stages. Qualification score faults can become 12.                                                                                                                                                                                                                    |
| 10   | Authoring or input defect: invalid schemas, references, registry entries, digests, records, baseline inputs, or `ci` plan fields. Dirty runs and before states cannot be accepted as baselines.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 11   | Evaluation weakness: a probe fails to distinguish its arms, a clean control fails, judge calibration falls below `judgeCalibration.minimumAgreement`, or a sealed-brief agent fails `evaluatorQualification.minimumAgreement`. `ci` also uses 11 for oracle disagreement or a stale baseline on `release`.                                                                                                                                                                                                                                                                                                                                                                 |
| 12   | infrastructure: a process cannot run, a resource ceiling is exceeded, evidence cannot be verified, or the baseline cannot be swapped safely. For `score`: a staged evidence artifact that fails eval-quality's published schema, names another corpus or carries no outcome for its probe; an input that changed or appeared while a call ran; or a call whose staged artifact, exit or `eval-quality:` diagnostic lines the held inputs do not reproduce. For evaluator qualification: an input that changed or was not the bytes the runtime wrote, or a staged artifact, exit or `eval-quality:` line the held bytes do not give. `ci` uses it when a check cannot run. |
| 13   | `ci`: evaluation evidence drift. Replaying the committed baseline changed, added, or omitted verdicts, evidence artifacts, score call records, strength aggregates, or floors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 64   | Usage or wiring error: missing or malformed arguments, missing evaluation or run, or an invalid `ci` tier. Engine stages' usage exits pass through where the command section specifies.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
