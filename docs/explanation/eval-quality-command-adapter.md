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

**The `--version`, `git`, and keychain probes stay, and remain owed.** They interrogate the environment rather than probe a system under test, so the adapter does not cover them. None passes a timeout, so any one can hang CI. They need a bounded helper.

## The policy is the seam

A contract names a logical executable and `ProbeRequest` enforces it: `executable` is constrained to `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`, so a filesystem path cannot be written into a contract or smuggled through a request. `test/lib/probe-targets.js` holds the mapping to a real file, the working directory, the artifact map, and both budgets. One module decides all of it, absolute paths stay out of nine contracts, and a free gate binds differently from a live run without touching one.

Two couplings the seam does not remove, both found by running it:

- **`--json` and `--output` resolve against `--project-root`; the artifact map resolves against the policy `cwd`.** `test-review.contract.json`'s witness legs pass a bare `verdict.json` and name no project root, so its live pre-flight writes into whichever directory also has to satisfy its repository-relative `--files`. Those legs need an explicit project root and run-scoped artifact paths.
- **The child environment is closed** to `PATH` plus what the request declares. Both vendors resolve a stored login through `HOME`, so the selection runner permits `HOME` and `USER`. `tea-test-review` does not, so its live pre-flight must use an API key.

## Reaching more than one skill

Nine contracts declare two logical executables, and one did not exist. `tea-fragment-selection-runner`, named by eight of them, was fiction, which is worse than a declared gap: the contract compiles, pre-flight schedules a leg against it, and the gate stays green over a command nobody can run.

`cli/fragment-selection-runner.js` is that command now. Its whole surface is the one turn those contracts declared: a prompt on standard input, `{"fragments": [...]}` on standard output. It builds no prompt, because a prompt belongs to the eval corpus, and knows no vendor, because it calls `runAgent`. `test/test-probe-targets.js` keeps the fiction from returning: every declared interface, executable, and subcommand path must be one the registry carries, and every registered command must be named by some contract.

One runner covers eight skills because the eight contracts declare one interface. The rest is per-skill: each item below is one registry entry, one contract, and no change to the probe layer:

- `trace` and `automate`, writing into a staged tree. Low: `eval-trace.js` already stages, invokes, and reads two files back by path.
- `nfr` and `test-design`, each writing its assessment artifact. Medium: neither has a harness, so the corpus is the work.
- `atdd`, and `automate`'s fail-before leg, one command against two revisions. Medium: the fixture reset such a plan needs does not exist.
- `framework` and `ci`, scaffolding a project or pipeline. High: the artifact is a tree and the artifact map addresses files.
- `bmad-tea` and `bmad-teach-me-testing`. Unknown: one request and one observation is not a multi-turn transcript.

## What it cannot express

- **A repeatable option has no spelling.** `option` is a key map, so one `--env-pass` per probe is the ceiling. The selection stub packs its mode and fragment list into one variable for this reason.
- **A negated flag is its own key.** A `false` value is omitted entirely, so commander's `--no-isolate` must be spelled `{'no-isolate': true}`.
- **Every entry point is asynchronous.** `eval-quality` is ESM and this repository is CommonJS. The harnesses are synchronous from `main()` down, so converting one touches every scoring loop in it. That is the real cost of the rewiring below.

## Done, and owed

Done, and covered by `npm test`: the registry, policy, port, and fault-to-failure-class mapping in `test/lib/probe-targets.js`; the runner, whose request shape and default agent `tools/generate-contracts.js` reads rather than transcribes; and `npm run test:probe-targets`, which drives both real commands through the real adapter against checked-in fixtures with a stub vendor. It asserts default-deny, the observation shape, artifact read-back, an absent artifact, a real budget kill classified as a timeout, and contract-to-registry agreement both ways, with no model call and no credential.

Owed:

- **The three harnesses still spawn their own commands.** `eval-test-review.js`'s `runReview` and `promptDigestFromCli`, and `eval-trace.js`'s `runCase`, are what `probeCommand` replaces. `eval-fragment-selection.js` calls `runAgent` in process and should route through the runner in the same change, so its live path and its contract describe one thing.
- **No pre-flight has run.** `runPreflight` drives each contract's sensitivity witness through this port at two live model calls per contract. Nothing here has spent one.
