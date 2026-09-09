---
title: 'The eval-quality Command Adapter'
description: 'Why TEA probes every measured command through eval-quality, what that deletes, and the order the remaining skills adopt it in'
---

# The eval-quality Command Adapter

TEA measures a skill by running a command and reading what it wrote. Every harness owned that mechanism itself: its own `spawnSync`, argv, timeout, and `existsSync` plus `JSON.parse` over the file the run produced. Three copies, disagreeing about what a command may do, none capping output.

`eval-quality` 1.0.0 ships that mechanism as `createCommandLineAdapter`, a real `EnvironmentProbePort` over a child process with 15 conformance outcomes behind it. TEA uses it and deletes what it invented. See the [roadmap](./eval-quality-roadmap.md) for the surrounding plan and `test/contracts/README.md` for the contracts.

"Runner" has meant three processes here, which is most of why the boundary was unclear: the vendor agent doing the skill's work, the TEA command under evaluation, and `eval-all.js` orchestrating one child per suite. `eval-quality` has an opinion about the middle one only. It probes a declared interface and returns an observation, never launching an agent and holding no view on vendor routing or credential shape.

## What it replaces

- Argv assembled by hand per call, now one request over `argument`, `option`, `environment`, `stdin`.
- A per-harness `timeout` with `SIGTERM`, now `maxElapsedMs` per authorization with `SIGKILL` and a named fault.
- No output cap on any harness-side spawn, now `maxOutputBytes` per stream and artifact, the process killed on breach.
- `existsSync` then `JSON.parse` in a `try`, now an artifact map read back as tagged `json`, `text`, or `absent`.
- Nothing deciding which executable a harness may run, now a `CommandTargetPolicy` that denies by default.

That last one had no TEA equivalent at all. A harness could spawn anything.

## What it does not replace

**`agent-adapters.js` and `run-agent.js` stay.** They are one layer down and they are product: that spawn carries vendor argv, model pinning, the minimal child environment, and credential-shape knowledge dated against live verification. Replacing it deletes the feature to simplify the harness.

**`eval-all.js`'s child spawn stays.** It uses `stdio: 'inherit'` so a forty-minute matrix prints as it goes. A probe captures and returns at the end, which is wrong for an operator watching one.

**The `--version`, `git`, and keychain probes stay.** They interrogate the environment rather than probe a system under test, so the adapter does not cover them. None passed a timeout, so any one could hang CI rather than fail it; all seven now go through `test/lib/bounded-probe.js`, which is a ten-second deadline, a SIGKILL, and a reason the caller can act on.

## The policy is the seam

A contract names a logical executable and `ProbeRequest` enforces it: `executable` is constrained to `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`, so a filesystem path cannot be written into a contract or smuggled through a request. `test/lib/probe-targets.js` holds the mapping to a real file, the working directory, the artifact map, and both budgets. One module decides all of it, absolute paths stay out of nine contracts, and a free gate binds differently from a live run without touching one.

Two couplings the seam does not remove, both found by running it:

- **`--json` and `--output` resolve against `--project-root`; the artifact map resolves against the policy `cwd`.** `test-review.contract.json`'s witness legs pass a bare `verdict.json` and name no project root, so its live pre-flight writes into whichever directory also has to satisfy its repository-relative `--files`. Those legs need an explicit project root and run-scoped artifact paths.
- **The child environment is closed** to `PATH` plus what the request declares. Both vendors resolve a stored login through `HOME`, so the selection runner permits `HOME` and `USER`. `tea-test-review` does not, so its live pre-flight must use an API key.

## Reaching more than one skill

Ten contracts declare three logical executables, each a command TEA ships. When there were nine they declared two, and one did not exist: `tea-fragment-selection-runner`, named by eight of them, was fiction, which is worse than a declared gap: the contract compiles, pre-flight schedules a leg against it, and the gate stays green over a command nobody can run.

`cli/fragment-selection-runner.js` is that command now. Its whole surface is the one turn those contracts declared: a prompt on standard input, `{"fragments": [...]}` on standard output. It builds no prompt, because a prompt belongs to the eval corpus, and knows no vendor, because it calls `runAgent`. `test/test-probe-targets.js` keeps the fiction from returning: every declared interface, executable, and subcommand path must be one the registry carries, and every registered command must be named by some contract.

One runner covers eight skills because the eight contracts declare one interface. The rest is per-skill: each item below is one registry entry, one contract, and no change to the probe layer:

- ~~`trace`~~ and `automate`, writing into a staged tree. `trace` is done, below. `automate` is the same shape: one runner wrapping the agent in a staged workspace, and an artifact map over what it writes.
- `nfr` and `test-design`, each writing its assessment artifact. Medium: neither has a harness, so the corpus is the work.
- `atdd`, and `automate`'s fail-before leg, one command against two revisions. Medium: the fixture reset such a plan needs does not exist.
- `framework` and `ci`, scaffolding a project or pipeline. High: the artifact is a tree and the artifact map addresses files.
- `bmad-tea` and `bmad-teach-me-testing`. Unknown: one request and one observation is not a multi-turn transcript.

## What it cannot express

- **A repeatable option is an array value, from `eval-quality` 1.2.0.** `option` is a key map, so one `--env-pass` per probe was the ceiling and the selection stub packed its mode and its fragment list into one variable. An array now emits the flag once per element, and the stub reads `STUB_MODE` and `STUB_FRAGMENTS` separately because reaching both proves the second occurrence arrived.
- **A negated flag is its own key.** A `false` value is omitted entirely, so commander's `--no-isolate` must be spelled `{'no-isolate': true}`.
- **Every entry point is asynchronous.** `eval-quality` is ESM and this repository is CommonJS. The harnesses were synchronous from `main()` down, so converting one touched every scoring loop in it. That was the real cost of the rewiring, and it is paid for all three: `main` is `async`, each run is awaited, and a rejected promise exits 2 with the reason printed rather than ending the process with no failure class and no record.

## Done, and owed

Done, and covered by `npm test`: the registry, policy, port, and fault-to-failure-class mapping in `test/lib/probe-targets.js`; the runner, whose request shape and default agent `tools/generate-contracts.js` reads rather than transcribes; and `npm run test:probe-targets`, which drives all three real commands through the real adapter against checked-in fixtures with a stub vendor. It asserts default-deny, the observation shape, artifact read-back, an absent artifact, a real budget kill classified as a timeout, and contract-to-registry agreement both ways, with no model call and no credential.

Also done: `eval-test-review.js`'s `runReview` and `promptDigestFromCli` drive `tea-test-review` through the port, and `eval-fragment-selection.js` runs `cli/fragment-selection-runner.js` rather than calling `runAgent` in process, so its live path and its contract describe one thing. Both were verified end to end against their stub agents, with no model call: the review harness reads a real verdict artifact back as JSON and scores it, and the selection harness scores a real reply off stdout.

Two path couplings closed with them. `runReview` states `--project-root` because the process no longer runs in the repository, and it passes absolute artifact paths so the CLI's `--project-root` resolution and the policy's `cwd` resolution cannot disagree. Each fragment-selection run's scratch directory is the authorization's `cwd`, so the `read-only` declaration is enforced by the policy rather than by the caller remembering to pass one.

Also done: `eval-trace.js`'s `runCase` probes `tea-trace-runner` (`cli/trace-runner.js`), the command the trace suite had no equivalent of. The runner's whole surface is a prompt on standard input and an agent run in the working directory. It builds no prompt and knows no vendor, and it declares `scoped-artifact-writes`, the one capability a trace run needs and a selection does not. The two workflow artifacts are the authorization's artifact map, supplied per run because each case stages its own workspace, and they come back tagged, so a file the run never wrote is `absent` and a missing artifact rather than an `existsSync` race. Both runner commands share one exit-code table in `cli/lib/runner-exit-codes.js`, because a caller holding an observation cannot tell which command produced it. `trace.contract.json` is the tenth contract, generated from `test/fixtures/trace-eval/ground-truth.json` with 26 oracles over the summary artifact, and `npm run test:contract-oracles` evaluates every one of them over the fourteen stored trace runs, under both fixture sets' oracles, and compares each with the `scoreRun` check it restates. The whole chain was verified with a stub vendor: `npm run test:probe-targets` spawns the harness itself, reads its result record back, and sees every threshold met on a correct run, a quality failure on a run that wrote a test, and a missing-artifact failure on a run that wrote nothing.

The trace witness is a differential over standard input on one prompt value, `allow_gate`. The two plan steps share one prompt on purpose, since the harness names no fact about either set in it, so a differential between the two steps would attribute to the prompt a difference the staged workspace produced, and an invariance claim would be false because the two summaries differ. `allow_gate` is the one prompt value the corpus establishes an effect for: step-05 evaluates a gate only when it is true and writes `gate_basis` as `none` otherwise, so two prompts differing in that value in one workspace produce two `gate_basis` values.

Two more couplings, both found by running it. A relative `--agent-cmd` passed the harness pre-flight, which probes it from the harness's own directory, and then failed every run, because the runner executes in the staged workspace and a relative path resolves there; `parseArgs` resolves a path against the operator's directory now. And the trace witness legs are runnable only against a staged workspace of the seeded set, because the run's real input is the working directory, which the request shape cannot name; that is the same coupling `test-review`'s legs have with `--project-root`.

## How much of `eval-quality` TEA actually uses

The package has three stages: compile a contract, probe an environment, then score what came back. TEA uses the first two completely and none of the third, and the reason is a chain rather than a choice.

Used:

- **`compile`**, through `dist/cli/main.js`, on all ten contracts every `npm test`. `test/contracts/expected-status.json` pins each one's status and a move in either direction fails.
- **`createCommandLineAdapter`, `nodeCommandMechanism`, and `evaluateCommandTarget`** from `eval-quality/adapters`, behind `test/lib/probe-targets.js`. Every measured TEA command runs through them.
- **The expression evaluator**, reached by file path under `dist/core/evaluate/`, in `npm run test:contract-oracles`. It resolves every oracle in every contract over stored outputs and compares each with the harness check it restates.

Not used, with the reason:

- **`runPreflight` and `preflightFromObservations`.** `runPreflight` plans a contract's sensitivity witness legs and sends each one through the probe port, at two live model calls per contract, ten contracts deep. `preflightFromObservations` reduces observations the caller already holds and sends nothing itself. Nothing here has spent a call through either.
- **`runScore` and `seal`.** `runScore` takes a `PreflightVerdict` and a `Probe` among its inputs. The verdict is an artifact the caller supplies, from either pre-flight entry point, so what gates this here is that TEA has produced no verdict at all. The `Probe` is a corpus of seeded defects carrying qualification records, which is `eval-quality`'s own outstanding held-out-probe-corpus item. Contract-strength scoring is the package's headline claim and TEA cannot make it yet; saying so is more useful than a partial number.
- **`digestArtifact`, `digestComposite`, `serializeArtifact`.** TEA digests through `test/lib/eval-record.js`, which has its own length-prefixed composition and its own callers. Two digest schemes over the same repository would be worse than one that is not the package's.
- **`validateLineageChain`** has no artifact here to validate a chain over.
- **`eval-quality/conformance`** defines the port an adapter author implements. TEA consumes a shipped adapter rather than writing one, so the conformance suite is not TEA's to run.

One coupling worth naming: two of the three used entry points are reached by file path into `dist/`, because neither the compiler CLI nor the evaluator is on the package's `exports` map. The devDependency is pinned exactly, so an upgrade is a deliberate edit here rather than something that arrives on its own. The reach still breaks on the upgrade that moves those files, and nothing declares it.

Owed:

- **No pre-flight has run.** `runPreflight` drives each contract's sensitivity witness through this port at two live model calls per contract. Nothing here has spent one, and it is the gate on everything in the scoring half above.
