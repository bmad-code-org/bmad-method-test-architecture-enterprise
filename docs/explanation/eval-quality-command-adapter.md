---
title: 'The eval-quality Command Adapter'
description: 'How TEA runs declared commands through eval-quality, enforces execution policies, and checks contract strength'
---

# The eval-quality Command Adapter

TEA measures skills by running commands and reading their outputs.
Its early harnesses duplicated process spawning, argument assembly, timeouts, and artifact parsing.

`createCommandLineAdapter`, introduced in `eval-quality` 1.0.0, supplies a shared process probe.
TEA runs the package's command-line conformance arm against it with sixteen assertions.
The lockfile records the installed version.
See the [roadmap](./eval-quality-roadmap.md) and `test/contracts/README.md` for the adoption record.

Three processes have separate jobs: the vendor agent does the skill's work, a TEA command invokes it, and `eval-all.js` starts the suites.
The adapter probes the TEA command and returns an observation.
TEA owns vendor routing and credentials.

## What it replaces

- Argv assembled by hand per call, now one request over `argument`, `option`, `environment`, `stdin`.
- A per-harness `timeout` with `SIGTERM`, now `maxElapsedMs` per authorization with `SIGKILL` and a named fault.
- No output cap on any harness-side spawn, now `maxOutputBytes` per stream and artifact, the process killed on breach.
- `existsSync` then `JSON.parse` in a `try`, now an artifact map read back as tagged `json`, `text`, or `absent`.
- Nothing deciding which executable a harness may run, now a `CommandTargetPolicy` that denies by default.

## What it does not replace

`agent-adapters.js` and `run-agent.js` own vendor arguments, model selection, child environments, and login handling.

`eval-all.js` uses `stdio: 'inherit'` so a long matrix prints progress while it runs.
The probe adapter captures a command's output and returns it after completion.

Version, git-state, and keychain probes use `test/lib/bounded-probe.js` with a ten-second deadline and SIGKILL backstop.
The original adoption bounded ten probes: six version checks, three git reads, and one keychain lookup.

## The policy is the seam

A contract names a logical executable: `ProbeRequest` validates it against `executable` is constrained to `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`.
The policy maps that name to a real executable.
`test/lib/probe-targets.js` holds the mapping to a real file, the working directory, the artifact map, and both budgets.
One module decides all of it, absolute paths stay out of sixteen contracts, and a free gate binds differently from a live run without touching one.

Artifact paths have two resolution bases:

- **`--json` and `--output` resolve against `--project-root`; the artifact map resolves against the policy `cwd`.** `test-review.contract.json`'s witness legs pass a bare `verdict.json` and name no project root, so its live pre-flight writes into whichever directory also has to satisfy its repository-relative `--files`.
  Those legs need an explicit project root and run-scoped artifact paths.

The environment field is the seam's fourth coupling, and it earns its own section below.

## The environment channel

`ProbeRequest` carries four channels: `argument`, `option`, `stdin`, and `environment`.
The first three are what a command reads to know what to do; `environment` is what a command reads to know who it is, chiefly a vendor credential or a stored login.

`CommandTargetPolicy.permittedEnvironmentKeys` is required from `eval-quality` 3.0.0 with no default, so a target with no explicit list authorizes nothing: the adapter refuses any key a request declares that is not on that target's own list, before a process spawns.
Undeclared keys are refused.

`vendorEnvironmentNames()` in `cli/lib/runner-exit-codes.js` is what each of TEA's runner commands actually authorizes: the union of every shipped vendor adapter's own `envNames`, plus `HOME` and `USER`, because both shipped vendors resolve a stored login through `HOME` and the adapter otherwise passes the child nothing else that could reach one.
`test/lib/probe-targets.js` reads that function, and `test/test-probe-targets.js` holds every contract's declared environment keys equal to its authorization's permitted keys in both directions.

`PATH` is on no target's list, and cannot be: a request names its `target` as a bare command, so a declared `PATH` would let the request choose which binary answers for a logical name like `tea-test-review`.
The adapter supplies its own `PATH`, and the request cannot override it.

`CI` is on no list either, for a different reason: `cli/test-review.js` reads it to decide filesystem isolation when `--isolate` is not stated.
Permitting it would let the host decide how a measured run executed, isolation on in one environment and off in another with the two sealed records indistinguishable afterward, so `CI` stays off every command's list and `test/eval-test-review.js` states `--isolate` explicitly.

## Reaching more than one skill

Sixteen contracts declare shipped logical executables.
The original eight fragment-selection contracts named `tea-fragment-selection-runner` before it existed.
The command now reads a prompt from stdin and returns `{"fragments": [...]}` on stdout.
`test/test-probe-targets.js` checks that every contract interface exists in the registry and every registered command is used.

The implementations follow output shape:

- `trace`, `nfr`, and `test-design` write assessment artifacts through dedicated runners.
- `atdd` generates acceptance scaffolds that a separate checker executes under isolation.
- `ci` generates or edits pipelines through `tea-ci-runner`.
- `automate` executes four hand-authored spec sets against clean and mutated services.
- `framework` installs and smoke-tests a scaffold fixture.
- `bmad-tea` evaluates routing intents; `bmad-teach-me-testing` uses the persistent transcript harness.

The ten behavioral suites and Evaluate's own authored suite cover all eleven skills.

## What it cannot express

Repeatable options use array values, supported since `eval-quality` 1.2.0.
For example, two `--env-pass` occurrences are represented by two elements.

A negated flag needs its own key: `{'no-isolate': true}`.
A `false` option value is omitted.

The harnesses await package entry points and classify rejected promises before writing their result records.
Schema-version constants are read synchronously in `cli/lib/evaluate/engine.js` through `require('eval-quality')`.
A dependency-direction purity rule keeps that module synchronous.
`test/lib/eval-quality-inputs.js` re-exports its schema-version helpers.

## How much of eval-quality TEA actually uses

TEA uses contract compilation, environment probing, and scoring.
The table records its use of published package surfaces.

| Published surface                                                                         | TEA's use                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compile`, in process                                                                     | `npm run test:contracts` compiles all sixteen contracts against `test/contracts/expected-status.json`, and seeds six faults into each one so the refused path runs on every gate                                                                                                                                                                                                                               |
| `createCommandLineAdapter`, `nodeCommandMechanism`, `CommandTargetPolicy`                 | `test/lib/probe-targets.js` declares nine logical executables as registry data, and the runtime's registry (`cli/lib/evaluate/registry.js`) maps them to nine real commands                                                                                                                                                                                                                                    |
| `runPreflight`, `RunPreflightOptions.sink`                                                | `npm run eval:preflight` drives every contract's witness legs through the adapter for real, and the sink reports how many legs each pre-flight planned, which the verdict does not carry                                                                                                                                                                                                                       |
| `runScore`                                                                                | `npm run test:probe-corpus` scores 59 probes across fifteen corpora; `npm run eval:contract-strength` scores them under a live pre-flight verdict                                                                                                                                                                                                                                                              |
| the `score` binary with a repeated `--record`                                             | `npm run test:trial-set-scoring` scores three trials of test-review's P-001 through the package's own `score` command, checks the per-probe reduction in `reducedProbeOutcomes` for an agreeing set and for a set where one trial misses, and checks that a single record under the raised trial minimum stays non-comparable                                                                                  |
| `compareDominance`                                                                        | `test/lib/compare-dominance.js` refuses a `comparabilityKey` mismatch before calling it; `npm run test:compare-dominance` reaches every relation it declares, `npm run test:probe-corpus` compares each probe's fresh result with the stored baseline through it, and `npm run test:compare-eval-runs` compares two recorded runs' comparable suites through it                                                |
| `seal`                                                                                    | one sealed evaluator brief per contract, written by the same script                                                                                                                                                                                                                                                                                                                                            |
| `digestArtifact`                                                                          | every artifact digest the run record and the isolation manifest declare                                                                                                                                                                                                                                                                                                                                        |
| the published JSON Schemas                                                                | the runtime's record module (`cli/lib/evaluate/records.js`), wired through `test/lib/eval-quality-inputs.js`, validates every artifact TEA builds or receives against `eval-quality/schemas/*`                                                                                                                                                                                                                 |
| the nine `*_SCHEMA_VERSION` constants for the kinds TEA writes or receives, and `VERSION` | `cli/lib/evaluate/engine.js` reads every `schemaVersion` TEA writes from the constant the package exports for that kind, `validateArtifact` checks a received artifact's stamp against the same constant, and `npm run test:schema-versions` holds each stamp TEA commits, in source and on disk, to the same reading                                                                                          |
| `preflightFromObservations`                                                               | unused, and it cannot be used: a caller has to key its observations by leg identifier, and the leg identifiers are minted by the plan `runPreflight` builds. TEA holds a port for both halves, so the port entry point answers the same question with no ordering problem                                                                                                                                      |
| `validateLineageChain`, `INTERCHANGE_ARTIFACT_KEYS`, `digestComposite`                    | unused. Every TEA artifact is `revisionCount: 0` with a null parent, so there is no chain to validate, and the digest helper TEA needs is the artifact one                                                                                                                                                                                                                                                     |
| `RuntimeFault` as a narrowing                                                             | `npm run test:contracts` reads a refused compile's `code` and its Zod issue paths off the thrown fault, where it once reconstructed both from the binary's stderr, and `test/lib/probe-targets.js` narrows every fault the probe port throws with `instanceof` against `RuntimeFault` and `StructuralFailure` (the latter listed below), so a Node error carrying `ENOENT` is classified as `unexpected-error` |
| `FAILURE_CODES`, `RUNTIME_FAULT_CODES`, `QUALIFICATION_FAILURES`, `VERDICTS`              | every code and verdict TEA recognises is held against the registry that publishes it through `test/lib/vocabularies.js`, and `npm run test:port-totality` carries the ledger of which members TEA recognises and what it does with each                                                                                                                                                                        |
| `EVALUATOR_RECOMMENDATIONS`                                                               | validated through the package's published `sealed-run-record.schema.json` on every record TEA builds                                                                                                                                                                                                                                                                                                           |
| `serializeArtifact`, `digestBytes`, `StructuralFailure`, the `./corpus/*` subpath         | `npm run test:eval-quality-corpus` seals the package's own compile-and-seal example and compares the serialized bytes with the shipped brief, digests every corpus file against the digest `corpus/dev/index.json` records, and reads a refused compile by its published failure class                                                                                                                         |
| `createLocalCorpusAdapter`                                                                | `test/lib/corpus-port.js` resolves every corpus member the probe generator, the trace harness and the probe scorer digest, certified by `npm run test:corpus-conformance`                                                                                                                                                                                                                                      |
| `eval-quality/conformance`                                                                | `npm run test:probe-conformance` runs the published command-line arm against a fixture command, and `npm run test:corpus-conformance` runs the corpus arm against the shipped local corpus adapter                                                                                                                                                                                                             |

### What the corpus is

`tools/generate-probes.js` writes 59 probes across fifteen corpora from checked-in ground truth.
`test/probes/README.md` records their current inventory and outcomes.
A behavior covered by a probe must have exactly one designated oracle; the generator enforces it.

The early corpus included nine review defect probes, three trace gaps, three NFR gaps, three CI gaps, clean controls, and gameability probes for review and the eight fragment-selection contracts.
Its recorded outcomes include:

| Contract                           | Defect probes | Gameability probes         | Limitation                                 |
| ---------------------------------- | ------------- | -------------------------- | ------------------------------------------ |
| Review                             | 9 of 9 caught | Refused                    | Gameability signature addresses a file     |
| Eight fragment-selection contracts | None authored | 1 of 1 caught per contract | Routing corpus has no planted defect class |
| Trace                              | Refused       | None authored              | Signatures address written files           |
| NFR                                | Refused       | None authored              | Signatures address written files           |
| CI                                 | Refused       | None authored              | Signatures address written files           |

TEA maintainers own the refused signatures.
Their exit condition is a signature over a permitted, discriminating evidence channel.
Review's exit code supports defect qualification; trace's completed-run exit cannot distinguish a defect.
The [vocabulary section](#what-the-probe-vocabulary-cannot-say-about-a-command) explains the boundary.

On stored replay, review's exercised defect count rose from four to nine after the 1.4.0 identical-leg fix.
Trace and CI plants cleared preflight after their witnesses used clean, correctly requested runs.
Fourteen of test-design's sixteen probes still fail `seeded-fault-fired`; probes in the other fourteen corpora pass preflight.
Qualification accounts for the remaining refusals.

A clean control checks false alarms and stays outside the strength vector.
`eval:preflight` and `eval:contract-strength` compare outcomes with `expected-strength.json`: `0` means the recorded outcomes matched, `1` means a verdict moved, and `2` means a preflight outcome moved.
A passing corpus check can therefore include known refused probes.

### The behavior grouping was a defect, and it is fixed

`designatedOracleIdOf` requires a behavior with exactly one oracle.
`score` otherwise falls through from the designated state to the first invalidating state or first state.
A behavior grouped around several planted defects can therefore vote from the wrong oracle.

The original review contract grouped nine plant oracles into three severity behaviors.
Fragment-selection contracts grouped both case oracles into one behavior.
They now use one behavior per oracle, preserving the same required checks and severities.
All 611 oracle checks at the time still agreed with the scorers.
That count records the change; later routing contracts added checks.

The trace contract likewise has twenty-six behaviors for twenty-six oracles.
Its earlier clean controls passed because every oracle resolved `passed-clean-control`; they had not exposed the grouping defect.

### What the probe vocabulary cannot say about a command

The corpus records these limits and fixes in `test/probes/expected-strength.json`.

**Artifact signatures remain contract-local.** `qualifyProbe` refuses an `artifact` pointer with `condition-artifact-channel-contract-local`.
A stdout pointer requires a declared stdout descriptor channel; otherwise it gets `condition-pointer-unwritable`.
An exit-code signature qualifies for TEA's commands.
Review exit codes distinguish gating findings from a clean review, so its nine plant probes can score through that channel.
The designated oracle supplies per-row attribution.
Trace returns `0` for any completed report, so its exit code cannot establish a defect catch.
Its artifact signatures remain refused.

**Identical fault and witness legs were fixed in 1.4.0.** In 1.3.0, `seeded-faults-scoped` compared planted faults against sensitivity legs even when a leg sent the fault request and received the fault answer.
Five review plants failed preflight this way.
The reducer now removes such a leg only when both request and projected evidence match, with identifiers neutralized.
Distinct requests that happen to return the same answer remain checked.
A plan with no clean leg fails.
Stored replay moved the review defect class from four exercised and caught to nine exercised and caught, catch rate 1.

Trace had a separate scoping defect.
Both witness legs used the seeded workspace, where D-001's P0 coverage of 50 stayed true even when the gate was withheld.
Each fixture now names its neutral `projectRoot`, and the prompt identifies that root.
The witnesses use the clean set, whose P0 coverage is 100, and preserve the `allow_gate` differential.
All three trace plants moved to passing preflight on stored replay; qualification still refuses their signatures.
Corpus validation rejects project roots containing `seeded`, `clean`, `control`, `planted`, or `gap`.

**Empty-collection checks were fixed in 1.4.0.** Earlier versions abstained before any operator read an empty array.
Now `count-tolerance`, `existence`, and `absence` can inspect the collection itself.
Trace O-023 and O-024 moved from `abstained` to `passed-clean-control`.
Quantifiers and `deep-equality` against `[]` still abstain.
Use `count-tolerance` with `expected: 0` to assert an empty collection.

**Qualification reasons became public in 1.4.0.** `runScore` returns `qualification`, and `QUALIFICATION_FAILURES` exports twenty reason codes.
Previously a refused probe surfaced as infrastructure-error at exit 3 without an actionable reason.
TEA records the codes per probe through public exports.

### What the scoring half says about TEA's contracts

The scoring pipeline exposed three contract weaknesses:

1. Coverage rules remain unsatisfied.
   Review leaves `malformed-input` and `state-change-read-back` open; fragment selection leaves `malformed-input` open.
   Whole-body checks added later closed that coverage rule for review, trace, and routing.
   These lower the verdict to CONCERNS.
2. Trace's clean control originally selected one observation for both plan steps.
   Five seeded `for-any` oracles abstained on clean collections, and two empty-collection assertions also abstained before 1.4.0.
   Step-specific prompt literals and records containing both sets now select the correct evidence.
   All twenty-six oracles pass the clean control, which moved P-004 from FAIL at exit 2 to CONCERNS at exit 0 on stored replay.
   Trace currently leaves `malformed-input`, `state-change-read-back`, and `success-indicator-separation` open.
3. Fragment-selection plan steps still bind prompts with `{matcher: 'any'}`.
   One observation can satisfy several steps, so non-designated outcome rows can refer to the wrong case.
   The designated oracle still votes correctly.

Trace's two fixes had to land together.
Two observations with broad matchers caused selector ambiguity at exit 3.
Literal matchers with only one observation made every oracle `unreached`, producing CONCERNS at exit 0 without examining evidence.
`traceEvidence` now checks that committed literal prompts match `buildPrompt`.

Fragment-selection literal bindings remain deferred because each prompt carries 21-43 KB of workflow rules and index content.
They would add 42-143 KB per contract, growing the eight contracts by 1.7x-2.7x.
Trace added 3.6 KB to a 108 KB contract.

### What the live pre-flight measured

The first pre-flight this repository has ever run, on 2026-09-09 against `claude`, at `eval-quality` 1.3.0.
Twenty-one legs spawned, 55 minutes of model time, and every leg cached under a digest of its request so a second invocation pays for nothing it has already answered.
The three manifestation witnesses `trace` gained at 1.3.0 cost nothing on that run: their request was the one its `allow_gate: true` witness leg already sent, and the cache is keyed on the request.
The table is that run and has not been re-measured; what has changed under it since is below.

| Suite                                  | Legs spawned | Model time | Pre-flight                                                                           |
| -------------------------------------- | -----------: | ---------: | ------------------------------------------------------------------------------------ |
| the eight fragment-selection contracts |           16 |       919s | both probes passed on all eight                                                      |
| `trace`                                |            2 |       872s | the clean control passed; the three defect probes fire on a leg the plan calls clean |
| `test-review`                          |            3 |      1485s | the clean control, the gameability probe and four of the nine defect probes passed   |

The corpus establishes the behavior behind each witness.
The fragment-selection differential is two prompts producing two different fragment lists, and the nfr pair differ by exactly the one fragment its config-gated case turns on.
The `trace` differential is `allow_gate`: the `true` leg wrote `gate_basis: "priority_thresholds"` with `gate_status: "FAIL"` and the `false` leg wrote `gate_basis: "none"` and no gate at all, which is what step-05 declares.
`test-review`'s differential is the file list: the seeded fixture drew five findings and exit 1, the clean control drew none and exit 0.

Two things about that table have moved since, both measured through stored replay.
`test-review`'s pre-flight outcome reached nine of nine defect probes, because `eval-quality` 1.4.0 drops a clean leg that issued the fault leg's own request.
`trace`'s is now all four probes passing, because its witness legs moved to the clean set.
That move also costs a leg: the three manifestation witnesses trace the seeded set while the two witness legs trace the clean set, so the cache needs an additional request and `trace` spawns three legs where it spawned two.
The three manifestation witnesses share one request, adding one spawn.

Two things the live run found that no deterministic check could.

**The two witness legs shared a staged workspace, and the second read the first's file.** The first live `trace` pre-flight failed its own witness.
Both legs ran in one staged directory, and their two summaries came back byte-identical while their two matrices differed, which is a run that rewrote one artifact and left the other.
The second leg's artifact map was reading a summary the first leg wrote.
Every TEA contract declares `fixtureReset: null`, so pre-flight plans nothing to reset a workspace between legs, and a directory per spawned leg is the only thing that makes a leg's evidence its own.
With that fixed the witness passes, and the fix cost the twelve minutes of the first pair.

**`test-review`'s witness legs name their skill.** They name their fixtures by repository-relative path, name no project root, and write a bare `verdict.json`, so all three resolve against the policy's `cwd`.
The CLI reviews with the skill packaged beside it (`cli/lib/resolve-skill.js`), so a run directory holding only the fixtures starts the agent and needs no skill of its own.

### The witness legs were not runnable, and now they are

Eight fragment-selection witnesses originally sent the placeholder sentence "The prompt the harness assembles for case X".
The generator now calls the harness's `buildPrompt`, as trace already did.
Contracts grew from about 20 KB to 59-109 KB to carry runnable prompts.

The review request shape originally allowed three API keys and forbade `HOME`.
A stored-login run could not authenticate through that environment.
The request shape and policy now read `vendorEnvironmentNames()` from the same source, and `test:probe-targets` checks equality in both directions.

## Done, and owed

The shared registry, policy, command port, and failure classification live in `cli/lib/evaluate/registry.js` and `test/lib/probe-targets.js`.
`npm run test:probe-targets` checks default-deny, observation shape, artifact reads and absence, budget kills, environment-key admission, and contract-to-registry agreement with stub vendors.

The review, fragment-selection, and trace harnesses invoke their real commands through the port.
They return real artifacts or stdout and score them with no model call in the integration checks.
Review passes an explicit `--project-root` and absolute artifact paths.
Each selection invocation gets its own scratch `cwd`.
Each trace invocation gets the fixture workspace its prompt names.
Relative custom-agent paths resolve from the operator's directory before staging.

Trace's contract has 26 summary oracles checked against fifteen stored runs under both sets' oracles.
The end-to-end stub checks verify a passing run, a quality failure for fixture mutation, and a missing-artifact failure.
Its witnesses compare `allow_gate` within the clean workspace; fixture sets themselves differ through workspace contents.

The package adoption added deterministic checks for the published corpus, conformance coverage, schema versions, and dependency direction.
Public exports added in 3.3.0 replaced two imports into `dist/`; `npm link` can select a local package build without a special import path.
The lockfile-age cache generator also stopped importing an unpublished package gate and now queries the registry directly, with byte-identical output verified.
Dependency-direction enforcement fails at zero violations.

Historical probe records still name `stored-replay` as their evaluator configuration.
A fresh live sealed record per probe requires a full harness run, budgeted separately from preflight.
