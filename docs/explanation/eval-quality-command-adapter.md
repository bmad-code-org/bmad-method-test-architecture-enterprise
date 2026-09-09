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

## How much of eval-quality TEA actually uses

The package has three stages: compile a contract, probe an environment, then score what came back.
TEA used the first two and none of the third. It uses all three now, and this section is the
inventory, kept honest by being a list of what is still unused rather than a list of what is.

| Published surface                                                                                          | TEA's use                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compile`, through the `eval-quality` binary                                                               | `npm run test:contracts` compiles all ten contracts against `test/contracts/expected-status.json`                                                                                                                                                                         |
| `createCommandLineAdapter`, `nodeCommandMechanism`, `CommandTargetPolicy`                                  | `test/lib/probe-targets.js` maps three logical executables to three real commands                                                                                                                                                                                         |
| `runPreflight`                                                                                             | `npm run eval:preflight` drives every contract's witness legs through the adapter for real                                                                                                                                                                                |
| `runScore`                                                                                                 | `npm run test:probe-corpus` scores 31 probes across ten corpora; `npm run eval:contract-strength` scores them under a live pre-flight verdict                                                                                                                             |
| `seal`                                                                                                     | one sealed evaluator brief per contract, written by the same script                                                                                                                                                                                                       |
| `digestArtifact`                                                                                           | every artifact digest the run record and the isolation manifest declare                                                                                                                                                                                                   |
| the published JSON Schemas                                                                                 | `test/lib/eval-quality-inputs.js` validates every artifact TEA builds or receives against `eval-quality/schemas/*`                                                                                                                                                        |
| `preflightFromObservations`                                                                                | unused, and it cannot be used: a caller has to key its observations by leg identifier, and the leg identifiers are minted by the plan `runPreflight` builds. TEA holds a port for both halves, so the port entry point answers the same question with no ordering problem |
| `validateLineageChain`, `INTERCHANGE_ARTIFACT_KEYS`, `serializeArtifact`, `digestBytes`, `digestComposite` | unused. Every TEA artifact is `revisionCount: 0` with a null parent, so there is no chain to validate, and the digest helpers TEA needs are the artifact one and its own file digest                                                                                      |
| `eval-quality/conformance`                                                                                 | `npm run test:probe-conformance` runs the published command-line arm against a fixture command                                                                                                                                                                            |

### What the corpus is

`tools/generate-probes.js` writes 31 probes from the ground truth this repository already keeps.
Nine defect probes for `test-review`, one per planted registry row, each a controlled mutation whose
target artifact, baseline-pass evidence and mutated-fail evidence are files on disk. Three for
`trace`, one per criterion the seeded set deliberately leaves short. A clean control for every
contract, and a gameability probe for each of the eight fragment-selection contracts and for
`test-review`. `test/probes/README.md` carries the whole record.

Every probe names the oracle that catches it, and that is enforced rather than intended: the
generator reads a probe's `behaviorId` out of the contract and refuses one whose behavior discharges
more than a single oracle.

### The behavior grouping was a defect, and it is fixed

`eval-quality`'s `designatedOracleIdOf` resolves AD-40's designated oracle only for a behavior
declaring exactly one oracle, and `score` votes a trial with `designatedState ?? firstInvalidatingState ?? firstState`.
A behavior grouping four plant oracles resolves none, so every probe in the corpus would have voted
whatever state the contract's first oracle happened to reach, and the defect catch rate would have
been zero by construction whatever the reviewer did.

`test-review.contract.json` grouped its nine plant oracles into three behaviors by severity, and each
fragment-selection contract grouped its two oracles per case into one behavior. Both are one behavior
per oracle now. The demand is unchanged: the same oracles, all required, at the same severities, with
all ten contracts still compiling and all 611 oracle checks still agreeing with their scorers. Only
the grouping moved.

`trace.contract.json` still groups, up to nine oracles under one behavior, and its probes are a clean
control and three defect probes whose signature the vocabulary refuses for the reason below. Nothing
there votes through a designated oracle yet, and the day a trace probe needs to, the same split is
what it needs.

### What the probe vocabulary cannot say about a command

Two limits, both measured against the installed package rather than inferred, and both recorded in
`test/probes/expected-strength.json` so the day either closes is visible.

**A defect signature cannot address a file a command wrote.** `qualifyProbe` refuses an `artifact`
pointer outright as `condition-artifact-channel-contract-local`: an artifact identifier is minted per
contract, so a signature carrying one resolves only against the contract it was authored on. A
`stdout` pointer is refused as `condition-pointer-unwritable` unless the operation declares standard
output as its descriptor channel. Measured across TEA's three commands: a structured stdout signature
against `tea-fragment-selection-runner` qualifies, the same shape against `tea-test-review` does not,
an artifact signature against either is refused, and an `exit-code` signature qualifies against all
three. So the eight fragment-selection contracts carry a signature that discriminates a real
degenerate reply, and the two contracts whose deliverable is a file carry one that says what is true
about the plant and is refused. Writing an `exit-code` signature for those instead would qualify and
discriminate nothing, which is the catch rate of 1.00 by construction that AD-40 exists to prevent.

**A rejected probe carries no reason across the boundary.** The qualification gate computes a closed
list of twenty reason codes and none of them reaches the evidence artifact or any published export.
A probe the gate rejects surfaces as `infrastructure-error` on every oracle and exit 3, and a corpus
author reading that has nothing to act on. Reading the reasons needs `qualifyProbe`, which is not on
the exports map, and that would be the third reach into `dist/` this document already records two of.
TEA does not take it.

### What the scoring half says about TEA's contracts

Three findings, all measured, none of them tuned away.

- **`test-review` and every fragment-selection contract leave AD-20 coverage rules unsatisfied.**
  `runScore` computes them from the contract itself and nothing in this repository had read them
  before. `test-review` leaves `whole-body`, `malformed-input` and `state-change-read-back`
  unsatisfied; every fragment-selection contract leaves `malformed-input` unsatisfied. Each scores the
  run down to CONCERNS without blocking it, which is exactly the weight AD-20 gives a coverage gap.
- **`trace`'s clean control scores FAIL.** Seven of its twenty-six oracles quantify over collections
  the clean set leaves empty, so each resolves `insufficient-evidence` with an `empty-collection`
  introduction condition and lands on `abstained`, which is a behavioural failure at or above the
  policy's severity floor. `test/contracts/README.md` already recorded that the contract abstains
  where the harness reads a measured miss; this is the first time the consequence has been scored.
- **A plan cannot tell two steps apart when both bind their inputs by matcher.** Each
  fragment-selection contract declares one plan step per case, distinguished only by the prompt, and
  the prompt is bound `{matcher: 'any'}` because the alternative is a 28-kilobyte literal per step. A
  record carrying one observation is therefore selected by every step, and the oracles of the other
  cases resolve against evidence that is not theirs. The designated oracle still votes correctly, so
  the strength vector is unaffected, and the surrounding outcome rows are noise. This is the limit
  `test/contracts/README.md` records as "a plan cannot declare that two steps must receive different
  inputs", with its consequence now measured.

### What the live pre-flight measured

The first pre-flight this repository has ever run, on 2026-09-09 against `claude`. Twenty legs
spawned, 46 minutes of model time, and every leg cached under a digest of its request so a second
invocation pays for nothing it has already answered.

| Suite                                  | Legs spawned | Model time | Pre-flight                                                                                           |
| -------------------------------------- | -----------: | ---------: | ---------------------------------------------------------------------------------------------------- |
| the eight fragment-selection contracts |           16 |       919s | both probes passed on all eight                                                                      |
| `trace`                                |            2 |       872s | the clean control passed; the three defect probes fail `seeded-fault-fired`                          |
| `test-review`                          |            2 |      1006s | the clean control and the gameability probe passed; the nine defect probes fail `seeded-fault-fired` |

Every witness held for a reason the corpus establishes rather than by accident. The
fragment-selection differential is two prompts producing two different fragment lists, and the nfr
pair differ by exactly the one fragment its config-gated case turns on. The `trace` differential is
`allow_gate`: the `true` leg wrote `gate_basis: "priority_thresholds"` with `gate_status: "FAIL"` and
the `false` leg wrote `gate_basis: "none"` and no gate at all, which is what step-05 declares.
`test-review`'s differential is the file list: the seeded fixture drew five findings and exit 1, the
clean control drew none and exit 0.

Two things the live run found that no deterministic check could.

**The two witness legs shared a staged workspace, and the second read the first's file.** The first
live `trace` pre-flight failed its own witness. Both legs ran in one staged directory, and their two
summaries came back byte-identical while their two matrices differed, which is a run that rewrote one
artifact and left the other. The second leg's artifact map was reading a summary the first leg wrote.
Every TEA contract declares `fixtureReset: null`, so AD-10 plans nothing to reset a workspace between
legs, and a directory per spawned leg is the only thing that makes a leg's evidence its own. With
that fixed the witness passes, and the fix cost the twelve minutes of the first pair.

**`test-review`'s witness legs need the skill on disk.** They name their fixtures by
repository-relative path, name no project root, and write a bare `verdict.json`, so all three resolve
against the policy's `cwd`. A run directory holding only the fixtures fails before the agent starts,
because `cli/lib/resolve-skill.js` probes four candidates under the project root and finds none. The
run directory is given the skill at `src/workflows/testarch/bmad-testarch-test-review`, which is the
fourth candidate and the one a checkout of this repository satisfies.

### The witness legs were not runnable, and now they are

Eight fragment-selection contracts declared a witness leg whose standard input was the sentence "The
prompt the harness assembles for case X", which parses, compiles, and is scheduled by pre-flight, and
then measures nothing when a real agent is finally handed it. `tools/generate-contracts.js` reads
`buildPrompt` out of `test/eval-fragment-selection.js` now, the same way the trace witness already
read its two prompts from its own harness, so a leg sends the prompt the suite sends. The contracts
grew from around 20 kilobytes to around 90, which is what the trace contract already paid for the
same correctness.

`test-review`'s request shape declared an environment permitting three API keys and forbidding `HOME`.
The adapter closes the child environment to `PATH` plus what the request declares, and
`cli/test-review.js` resolves a stored login through `HOME`, so a machine with a keychain login could
not run that contract's own pre-flight. The shape is read from `vendorEnvironmentNames()` now, the
same source the other two commands use.

## Done, and owed

Done, and covered by `npm test`: the registry, policy, port, and fault-to-failure-class mapping in `test/lib/probe-targets.js`; the runner, whose request shape and default agent `tools/generate-contracts.js` reads rather than transcribes; and `npm run test:probe-targets`, which drives all three real commands through the real adapter against checked-in fixtures with a stub vendor. It asserts default-deny, the observation shape, artifact read-back, an absent artifact, a real budget kill classified as a timeout, and contract-to-registry agreement both ways, with no model call and no credential.

Also done: `eval-test-review.js`'s `runReview` and `promptDigestFromCli` drive `tea-test-review` through the port, and `eval-fragment-selection.js` runs `cli/fragment-selection-runner.js` rather than calling `runAgent` in process, so its live path and its contract describe one thing. Both were verified end to end against their stub agents, with no model call: the review harness reads a real verdict artifact back as JSON and scores it, and the selection harness scores a real reply off stdout.

Two path couplings closed with them. `runReview` states `--project-root` because the process no longer runs in the repository, and it passes absolute artifact paths so the CLI's `--project-root` resolution and the policy's `cwd` resolution cannot disagree. Each fragment-selection run's scratch directory is the authorization's `cwd`, so the `read-only` declaration is enforced by the policy rather than by the caller remembering to pass one.

Also done: `eval-trace.js`'s `runCase` probes `tea-trace-runner` (`cli/trace-runner.js`), the command the trace suite had no equivalent of. The runner's whole surface is a prompt on standard input and an agent run in the working directory. It builds no prompt and knows no vendor, and it declares `scoped-artifact-writes`, the one capability a trace run needs and a selection does not. The two workflow artifacts are the authorization's artifact map, supplied per run because each case stages its own workspace, and they come back tagged, so a file the run never wrote is `absent` and a missing artifact rather than an `existsSync` race. Both runner commands share one exit-code table in `cli/lib/runner-exit-codes.js`, because a caller holding an observation cannot tell which command produced it. `trace.contract.json` is the tenth contract, generated from `test/fixtures/trace-eval/ground-truth.json` with 26 oracles over the summary artifact, and `npm run test:contract-oracles` evaluates every one of them over the fourteen stored trace runs, under both fixture sets' oracles, and compares each with the `scoreRun` check it restates. The whole chain was verified with a stub vendor: `npm run test:probe-targets` spawns the harness itself, reads its result record back, and sees every threshold met on a correct run, a quality failure on a run that wrote a test, and a missing-artifact failure on a run that wrote nothing.

The trace witness is a differential over standard input on one prompt value, `allow_gate`. The two plan steps share one prompt on purpose, since the harness names no fact about either set in it, so a differential between the two steps would attribute to the prompt a difference the staged workspace produced, and an invariance claim would be false because the two summaries differ. `allow_gate` is the one prompt value the corpus establishes an effect for: step-05 evaluates a gate only when it is true and writes `gate_basis` as `none` otherwise, so two prompts differing in that value in one workspace produce two `gate_basis` values.

Two more couplings, both found by running it. A relative `--agent-cmd` passed the harness pre-flight, which probes it from the harness's own directory, and then failed every run, because the runner executes in the staged workspace and a relative path resolves there; `parseArgs` resolves a path against the operator's directory now. And the trace witness legs are runnable only against a staged workspace of the seeded set, because the run's real input is the working directory, which the request shape cannot name; that is the same coupling `test-review`'s legs have with `--project-root`.

One coupling worth naming, and it did not change with the scoring half: two of the entry points TEA
reaches are addressed by file path into `dist/`, because neither the compiler CLI nor the evaluator is
on the package's `exports` map. The devDependency is pinned exactly, so an upgrade is a deliberate
edit here rather than something that arrives on its own. The reach still breaks on the upgrade that
moves those files, and nothing declares it. A third reach was needed to read a rejected probe's
qualification reasons and was not taken; that is recorded above under what the vocabulary cannot say.

Owed:

- **A live sealed run record.** The scoring half is driven live for the pre-flight and replayed for the record, because a live record is a complete harness run per probe and that cost belongs to `npm run eval:all`. The evaluator configuration on every artifact says `stored-replay` so the two cannot be confused.
