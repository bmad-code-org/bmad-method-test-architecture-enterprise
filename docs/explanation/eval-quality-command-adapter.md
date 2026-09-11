---
title: 'The eval-quality Command Adapter'
description: 'Why TEA probes every measured command through eval-quality, what that deletes, and the order the remaining skills adopt it in'
---

# The eval-quality Command Adapter

TEA measures a skill by running a command and reading what it wrote. Every harness owned that mechanism itself: its own `spawnSync`, argv, timeout, and `existsSync` plus `JSON.parse` over the file the run produced. Three copies, disagreeing about what a command may do, none capping output.

`eval-quality` 1.0.0 ships that mechanism as `createCommandLineAdapter`, a real `EnvironmentProbePort` over a child process with a conformance arm behind it, 16 outcomes on the 3.0.0 TEA now runs. TEA uses it and deletes what it invented. See the [roadmap](./eval-quality-roadmap.md) for the surrounding plan and `test/contracts/README.md` for the contracts.

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

**The `--version`, `git`, and keychain probes stay.** They interrogate the environment rather than probe a system under test, so the adapter does not cover them. None passed a timeout, so any one could hang CI rather than fail it; all eight now go through `test/lib/bounded-probe.js`, which is a ten-second deadline, a SIGKILL, and a reason the caller can act on. Eight is four `--version` probes, three `git` reads, and the keychain lookup.

## The policy is the seam

A contract names a logical executable and `ProbeRequest` enforces it: `executable` is constrained to `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`, so a filesystem path cannot be written into a contract or smuggled through a request. `test/lib/probe-targets.js` holds the mapping to a real file, the working directory, the artifact map, and both budgets. One module decides all of it, absolute paths stay out of nine contracts, and a free gate binds differently from a live run without touching one.

Two couplings the seam does not remove, both found by running it:

- **`--json` and `--output` resolve against `--project-root`; the artifact map resolves against the policy `cwd`.** `test-review.contract.json`'s witness legs pass a bare `verdict.json` and name no project root, so its live pre-flight writes into whichever directory also has to satisfy its repository-relative `--files`. Those legs need an explicit project root and run-scoped artifact paths.
- **The child environment is closed** to `PATH` plus what the request declares, and from `eval-quality` 3.0.0 the authorization declares which of those keys a request may carry at all. All three commands permit the vendor names plus `HOME` and `USER`, because both vendors resolve a stored login through `HOME`; `tea-test-review` permits `CI` on top of them, which it reads to decide filesystem isolation. A key outside a command's list is refused before a process spawns, and `PATH` is on no list: `target` may name a bare command, so a declared `PATH` would choose which binary runs. The adapter supplies its own.

## Reaching more than one skill

Twelve contracts declare four logical executables, each a command TEA ships. When there were nine they declared two, and one did not exist: `tea-fragment-selection-runner`, named by eight of them, was fiction, which is worse than a declared gap: the contract compiles, pre-flight schedules a leg against it, and the gate stays green over a command nobody can run.

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

| Published surface                                                                 | TEA's use                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compile`, through the `eval-quality` binary                                      | `npm run test:contracts` compiles all twelve contracts against `test/contracts/expected-status.json`                                                                                                                                                                                                    |
| `createCommandLineAdapter`, `nodeCommandMechanism`, `CommandTargetPolicy`         | `test/lib/probe-targets.js` maps four logical executables to four real commands                                                                                                                                                                                                                         |
| `runPreflight`                                                                    | `npm run eval:preflight` drives every contract's witness legs through the adapter for real                                                                                                                                                                                                              |
| `runScore`                                                                        | `npm run test:probe-corpus` scores 51 probes across thirteen corpora; `npm run eval:contract-strength` scores them under a live pre-flight verdict                                                                                                                                                      |
| `seal`                                                                            | one sealed evaluator brief per contract, written by the same script                                                                                                                                                                                                                                     |
| `digestArtifact`                                                                  | every artifact digest the run record and the isolation manifest declare                                                                                                                                                                                                                                 |
| the published JSON Schemas                                                        | `test/lib/eval-quality-inputs.js` validates every artifact TEA builds or receives against `eval-quality/schemas/*`                                                                                                                                                                                      |
| `preflightFromObservations`                                                       | unused, and it cannot be used: a caller has to key its observations by leg identifier, and the leg identifiers are minted by the plan `runPreflight` builds. TEA holds a port for both halves, so the port entry point answers the same question with no ordering problem                               |
| `validateLineageChain`, `INTERCHANGE_ARTIFACT_KEYS`, `digestComposite`            | unused. Every TEA artifact is `revisionCount: 0` with a null parent, so there is no chain to validate, and the digest helper TEA needs is the artifact one                                                                                                                                              |
| `serializeArtifact`, `digestBytes`, `StructuralFailure`, the `./corpus/*` subpath | `npm run test:eval-quality-corpus` seals the package's own compile-and-seal example and compares the serialized bytes with the shipped brief, digests every corpus file against the digest `corpus/dev/index.json` records, and reads a refused compile by its failure class rather than by duck-typing |
| `eval-quality/conformance`                                                        | `npm run test:probe-conformance` runs the published command-line arm against a fixture command                                                                                                                                                                                                          |

### What the corpus is

`tools/generate-probes.js` writes 51 probes from the ground truth this repository already keeps.
Nine defect probes for `test-review`, one per planted registry row, each a controlled mutation whose
target artifact, baseline-pass evidence and mutated-fail evidence are files on disk. Three for
`trace`, one per criterion the seeded set deliberately leaves short. A clean control for every
contract, and a gameability probe for each of the eight fragment-selection contracts and for
`test-review`. `test/probes/README.md` carries the whole record.

Every probe names the oracle that catches it, and that is enforced rather than intended: the
generator reads a probe's `behaviorId` out of the contract and refuses one whose behavior discharges
more than a single oracle.

What the corpus scores, read off `test/probes/expected-strength.json` as it stands:

| Contract                               | defect        | gameability           | Not scored, and why                                                                                     |
| -------------------------------------- | ------------- | --------------------- | ------------------------------------------------------------------------------------------------------- |
| `test-review`                          | 9 of 9 caught | refused               | the gameability signature reads a written file, so AD-9's gate refuses it                               |
| the eight fragment-selection contracts | none authored | 1 of 1 caught on each | fragment selection seeds no defect; it is a routing measurement with a required set and a forbidden set |
| `trace`                                | refused       | none authored         | all three signatures read a written file, so AD-9's gate refuses them                                   |

The two numbers that moved and what moved them: `test-review`'s defect class went from four exercised
and four caught to nine and nine when `eval-quality` 1.4.0 dropped a clean leg that had issued the
fault leg's own request, and `trace`'s three plants stopped failing pre-flight when its witness legs
moved off the seeded set. Both are `seeded-faults-scoped`, and both are below. Every probe in the
corpus now pre-flights, so what is left unscored is the qualification gate alone.

A clean control never enters the vector, which is AD-7's rule rather than a gap: what it establishes
is that the contract does not fire where there is nothing to find.

`npm run eval:preflight` and `npm run eval:contract-strength` read their exit code against
`test/probes/expected-strength.json` rather than against pass and fail directly: 0 when every probe
reached the outcome the corpus records, 1 when a verdict moved, 2 when a pre-flight outcome moved.
Eight probes could not be pre-flighted when that rule was written, and both scripts would have been
red on every run, which is how a script stops being read before the day it means something. All
thirty-one pre-flight now, so the baseline is what says a green run is green rather than what excuses
a red one, and the rule is what catches the first probe to stop.

### The behavior grouping was a defect, and it is fixed

`eval-quality`'s `designatedOracleIdOf` resolves AD-40's designated oracle only for a behavior
declaring exactly one oracle, and `score` votes a trial with `designatedState ?? firstInvalidatingState ?? firstState`.
A behavior grouping four plant oracles resolves none, so every probe in the corpus would have voted
whatever state the contract's first oracle happened to reach, and the defect catch rate would have
been zero by construction whatever the reviewer did.

`test-review.contract.json` grouped its nine plant oracles into three behaviors by severity, and each
fragment-selection contract grouped its two oracles per case into one behavior. Both are one behavior
per oracle now. The demand is unchanged: the same oracles, all required, at the same severities, with
all contracts still compiling and all 611 oracle checks of the day still agreeing with their scorers.
Only the grouping moved. Two routing contracts and their oracles have joined the corpus since, so the
count is a record of that change rather than a running total.

`trace.contract.json` is split the same way, twenty-six behaviors for twenty-six oracles, minted from
the oracle identifiers so `B-00n` and `O-00n` are one thing. Its authored groups still carry the
severity, the risk, the requirement link and the success sentence; what they no longer do is put nine
oracles behind one behavior. Its two probes passed before the split only because a clean control
resolves `passed-clean-control` on every oracle, so the fallthrough happened to be right; a defect
probe there would have been voted by `O-001` whatever criterion it withheld.

### What the probe vocabulary cannot say about a command

Four limits, all measured against the installed package rather than inferred, and all recorded in
`test/probes/expected-strength.json` so the day one closes is visible. Three have closed since they
were written: two upstream in `eval-quality` 1.4.0 and one here, in the trace contract. Each is kept
with what closed it, because a limit that vanishes silently teaches nobody why it was there.

**A defect signature cannot address a file a command wrote.** `qualifyProbe` refuses an `artifact`
pointer outright as `condition-artifact-channel-contract-local`: an artifact identifier is minted per
contract, so a signature carrying one resolves only against the contract it was authored on. A
`stdout` pointer is refused as `condition-pointer-unwritable` unless the operation declares standard
output as its descriptor channel. Measured across TEA's three commands: a structured stdout signature
against `tea-fragment-selection-runner` qualifies, the same shape against `tea-test-review` does not,
an artifact signature against either is refused, and an `exit-code` signature qualifies against all
three. Measured again on `tea-trace-runner` through `runScore`, one channel at a time over the same
stored evidence: `artifact` is refused as `condition-artifact-channel-contract-local`, `stdout` as
`condition-pointer-unwritable`, and `exit-code` is admitted.

What is left is the exit code, and whether that is honest depends on the command. For
`tea-test-review` it discriminates: a review that finds a gating defect exits 1 and one that finds
none exits 0, so the condition is false on the clean control, and the nine plant probes carry it. It
does not discriminate which row, so per-row attribution is the designated oracle's and the finding's
rather than the signature's, which is a weaker guarantee than AD-40 intends and is stated here
because it is what the vocabulary allows. For `tea-trace-runner` the exit code discriminates nothing,
since every completed trace run exits 0 whatever it wrote, so its three probes keep the signature
that states the truth about the plant and are refused rather than given one that would qualify and
mean nothing.

**`seeded-faults-scoped` compares a run against itself.** AD-10 asks whether a seeded fault fires
anywhere it should not, and `planPreflight` answers it against every leg already registered for the
operation, which for a TEA contract is its sensitivity witness legs. `test-review`'s differential
drove one leg at a seeded fixture and `trace`'s drove both at the seeded set, so at `eval-quality`
1.3.0 a plant in a file a witness leg read fired on a leg the plan called clean. Five of the nine
review plants landed there, and all three trace plants: the live pre-flight reported `D-001: the
manifestation witness fires on clean leg "witness-gate-evaluated"`. The four review plants in the
file no witness leg reads pre-flighted cleanly and scored, and the defect class caught all four.

No leg TEA could add repaired it, and the reason was sharper than "a plant sits in a file a witness
reads". For those five plants the fault leg's request is byte for byte the sensitivity leg's request:
the same executable, the same `--files`, the same `--json`, the same `--agent`. The observation cache
collapses them into one spawn for exactly that reason. So the check resolved the manifestation
relation against a run identical to the fault run, and no relation true on the one can be false on
the other. Adding a leg that reads an unplanted fixture changed nothing, because the check fails on a
leg that fires rather than on the absence of a leg that does not, and adding legs could only add ways
to fire. Making the seeded witness leg read an unplanted fixture was not available either: the
differential it asserts is that two file lists produce different severity counts, and two unplanted
lists produce the same counts, so the witness would fail instead. The one remaining shape, a witness
whose relation compares the `reviewedFiles` the verdict echoes back, is the "the evidence contains
the string I sent" condition the probe-side qualification gate exists to reject, and authoring it
contract-side to get a green pre-flight would be gaming the witness.

TEA raised it upstream, and 1.4.0 fixes it in the reducer. A clean leg is dropped when it issued the
fault leg's request and received the fault leg's answer, compared over the request with the
correlation identifier neutralised and over the projected evidence with the observation identifier
neutralised. Both halves are required: dropping on the answer alone would discard AD-10's own worked
example of two distinct nonexistent identifiers both returning 404, which are the legs the check
exists to read. A check left with no clean leg to examine now fails and names why, where it reported
satisfied before.

Measured on the stored replay across the two versions, `test-review`'s five plants move from
`preflight: failed: seeded-faults-scoped` with a null verdict and exit 3 to `preflight: passed`,
`CONCERNS`, exit 0, each carrying its own strength vector. The suite's defect class goes from four
exercised and four caught to nine and nine, still at a rate of 1. `expected-strength.json` records
the move.

`trace`'s three plants failed on that same run, and that was the fix working: their witness fired on
`witness-gate-withheld`, a leg that issues a different request and receives a different answer, so
the reducer kept it in the examined set and the check reported a real scoping problem in the trace
contract. That problem is now closed, and the shape of it is worth keeping.

The witness was right and the leg was not clean. AD-10 reads every other leg of an operation as a
clean leg. `trace-fixture-set` carries `stateChangeMarker: true`, so `selectControl` plans no control
leg for it, and the only other legs it had were its two sensitivity witness legs, both staged against
the seeded set. `D-001` asserts that P0 coverage is 50, which is what the seeded workspace produces
and what `allow_gate` does not move, so the relation was true on a seeded run with the gate withheld.
It fired there because the plant was there.

Nothing in the request could say otherwise. The run's real input is the staged workspace, both sets
were staged at one `project/` root, and `buildPrompt` took a fixture set and read nothing off it, so
the two sets sent byte-identical prompts and no leg could ask for the set without the plant. Each set
now declares a `projectRoot` in `test/fixtures/trace-eval/ground-truth.json`,
`tenant-data-export` and `api-token-lifecycle`, and the whole prompt is written against it:
`{project-root}`, `{config_source}`, `{test_artifacts}`, `{test_dir}`, `{source_dir}`, the epic
directory, and both deliverable paths. `stagedWorkspaceFor` stages the set the leg's prompt names,
the stored-evidence port answers with that set's stored run, and the stub agent resolves
`{project-root}` off the prompt the way a real agent does.

The contract's two witness legs now trace the clean set, which is the set that establishes what
"clean leg" means for this operation. P0 coverage there is 100, so `D-001`'s relation resolves false
on both legs and the check is satisfied on evidence. The `allow_gate` differential is untouched and
holds on either set: the clean set writes `gate_basis: "priority_thresholds"` when the gate is
allowed and `"none"` when it is withheld, the same pair the seeded set writes. Measured on the stored
replay, the three probes move from `preflight: failed: seeded-faults-scoped` to `preflight: passed`,
and their basis loses the `pre-flight verdict did not pass` line. They are still refused by the
qualification gate, so their verdict, exit code and strength are unchanged.

The project roots name the epic each set traces and not the set's role. A run that read `clean` in
the directory it works in would have been handed the answer, which is the rule the corpus already
follows when it keeps every inline label out of the fixture files, so `validateCorpus` fails a
project root carrying `seeded`, `clean`, `control`, `planted` or `gap`.

**"This collection is empty" has a spelling, as of 1.4.0.** Through 1.3.0 the evaluator intercepted
an empty array on every quantifier and every single-operand leaf and returned `insufficient-evidence`
with an `empty-collection` condition before the operator ran, so `count-tolerance` with `expected: 0`
never counted. `trace`'s O-023 and O-024 make exactly that claim about its clean set, and both
abstained on the run they were written to confirm. TEA raised it upstream and 1.4.0 exempts the three
operators that read a property of the collection itself: `count-tolerance` reads its cardinality,
`existence` and `absence` read its presence. Measured on the stored replay across the two versions,
O-023 and O-024 move from `abstained` to `passed-clean-control`, so `count-tolerance` was the right
spelling to have committed to.

One limit is worth knowing before writing a new oracle. Every quantifier still abstains over an empty
collection, which is AD-4's whole purpose and is why `trace`'s five `for-any` oracles over the seeded
export abstained on the clean control for as long as they were resolved against the clean set's
summary: they ask whether some element exists, and an empty collection is an honest "nothing was
checked". `deep-equality` against a literal `[]` also still abstains, so the
two spellings of "this collection is empty" disagree. eval-quality records that disagreement in AD-4
rather than hiding it. The bare `count-tolerance` assertion is the one to write.

**A rejected probe names its reason, as of 1.4.0.** The qualification gate computes a closed list of
twenty reason codes. Through 1.3.0 none of them reached the evidence artifact or any published
export, so a probe the gate rejected surfaced as `infrastructure-error` and exit 3 and a corpus
author reading that had nothing to act on. Reading the reasons meant calling `qualifyProbe`, which
was off the exports map, and taking it would have been the third reach into `dist/` this document
already records two of. TEA raised that upstream instead. `runScore` now returns `qualification`
beside the artifact and the ladder, `QUALIFICATION_FAILURES` publishes the closed set, and
`test-probe-corpus` records the codes per probe in `expected-strength.json`. No reach into `dist/`
was needed and the count stays at two.

### What the scoring half says about TEA's contracts

Three findings, all measured, none of them tuned away.

- **`test-review` and every fragment-selection contract leave AD-20 coverage rules unsatisfied.**
  `runScore` computes them from the contract itself and nothing in this repository had read them
  before. `test-review` leaves `whole-body`, `malformed-input` and `state-change-read-back`
  unsatisfied; every fragment-selection contract leaves `malformed-input` unsatisfied. Each scores the
  run down to CONCERNS without blocking it, which is exactly the weight AD-20 gives a coverage gap.
- **`trace`'s clean control scored FAIL. Closed, and the two halves that closed it work only
  together.** Five of its twenty-six oracles abstained on `P-004`: `O-009`, `O-010`, `O-011`,
  `O-013` and `O-014`, every one a `for-any` quantifier over the seeded export, and every one named
  in the artifact's `verdictBasis`. It was seven. `O-023` and `O-024`, the two asserting that a
  collection is empty, moved to `passed-clean-control` when `eval-quality` 1.4.0 gave that claim a
  spelling.

  The five abstained because the record carried one observation and both plan steps selected it, so
  the seeded set's oracles quantified over the clean summary's empty or absent collections. Each
  step binds its own set's prompt as a literal now, and the clean control's record carries both
  sets' runs, so the seeded step selects the seeded run and the clean step selects the clean one.
  Measured on the stored replay, all twenty-six oracles resolve `passed-clean-control` and `P-004`
  moves from FAIL at exit 2 to CONCERNS at exit 0. What holds it at CONCERNS is the four unsatisfied
  AD-20 coverage rules the bullet above describes, which is separate work.

  Either half on its own is worse than neither, which is why they landed together. Two observations
  under the old matcher bindings leave every observation satisfying both steps, and `exactly-one`
  then reports selector ambiguity on all twenty-six oracles at exit 3. Literals over one observation
  select nothing: all twenty-six resolve `unreached` and the run reports CONCERNS at exit 0 having
  examined no evidence at all, which is a silent green and is worse than the FAIL it replaces. A
  literal is compared with `deepEquals`, so the contract's literal and the record's prompt are both
  `buildPrompt` from `test/eval-trace.js`, and `traceEvidence` in `test/lib/probe-scoring.js` throws
  when the contract on disk binds any other bytes. Both states above were run before the change was
  accepted, so the failure mode is one somebody has seen.

- **A plan cannot tell two steps apart when both bind their inputs by matcher.** Each
  fragment-selection contract declares one plan step per case, distinguished only by the prompt, and
  the prompt is bound `{matcher: 'any'}`. A record carrying one observation is therefore selected by
  every step, and the oracles of the other cases resolve against evidence that is not theirs. The
  designated oracle still votes correctly, so the strength vector is unaffected, and the surrounding
  outcome rows are noise. This is the limit `test/contracts/README.md` records as "a plan cannot
  declare that two steps must receive different inputs", with its consequence now measured.

  The trace contract closed this with literals; the eight fragment-selection contracts keep the
  matcher, and the reason is size. Their prompts carry the workflow's knowledge-loading rules and its
  whole fragment index, 21 to 43 kilobytes per step, so binding each step's prompt as a literal adds
  between 42 and 143 kilobytes to a contract and roughly doubles every one of the eight files: 1.7x
  for `bmad-testarch-nfr`, 2.7x for `bmad-testarch-automate`, measured from the prompts those
  contracts already carry on their witness legs. Trace pays 3.6 kilobytes on 108 for the same fix,
  because its two prompts are 1.8 kilobytes each, the size of the prompt the file already carries on
  each of its two witness legs.

### What the live pre-flight measured

The first pre-flight this repository has ever run, on 2026-09-09 against `claude`, at `eval-quality`
1.3.0. Twenty-one legs spawned, 55 minutes of model time, and every leg cached under a digest of its
request so a second invocation pays for nothing it has already answered. The three manifestation
witnesses `trace` gained at 1.3.0 cost nothing on that run: their request was the one its
`allow_gate: true` witness leg already sent, and the cache is keyed on the request. The table is that
run and has not been re-measured; what has changed under it since is below.

| Suite                                  | Legs spawned | Model time | Pre-flight                                                                           |
| -------------------------------------- | -----------: | ---------: | ------------------------------------------------------------------------------------ |
| the eight fragment-selection contracts |           16 |       919s | both probes passed on all eight                                                      |
| `trace`                                |            2 |       872s | the clean control passed; the three defect probes fire on a leg the plan calls clean |
| `test-review`                          |            3 |      1485s | the clean control, the gameability probe and four of the nine defect probes passed   |

Every witness held for a reason the corpus establishes rather than by accident. The
fragment-selection differential is two prompts producing two different fragment lists, and the nfr
pair differ by exactly the one fragment its config-gated case turns on. The `trace` differential is
`allow_gate`: the `true` leg wrote `gate_basis: "priority_thresholds"` with `gate_status: "FAIL"` and
the `false` leg wrote `gate_basis: "none"` and no gate at all, which is what step-05 declares.
`test-review`'s differential is the file list: the seeded fixture drew five findings and exit 1, the
clean control drew none and exit 0.

Two things about that table have moved since, both on the stored replay rather than on a repeat of
the live run. `test-review`'s pre-flight outcome is now nine of nine defect probes rather than four,
because `eval-quality` 1.4.0 drops a clean leg that issued the fault leg's own request. `trace`'s is
now all four probes passing, because its witness legs moved to the clean set. That move also costs a
leg: the three manifestation witnesses trace the seeded set while the two witness legs trace the
clean set, so their request is no longer one the cache already holds and `trace` spawns three legs
where it spawned two. The three still share one request between them, so it is one extra spawn and
not three.

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
grew from around 20 kilobytes to between 59 and 109, which is what the trace contract already paid
for the same correctness.

`test-review`'s request shape declared an environment permitting three API keys and forbidding `HOME`.
The adapter closes the child environment to `PATH` plus what the request declares, and
`cli/test-review.js` resolves a stored login through `HOME`, so a machine with a keychain login could
not run that contract's own pre-flight. The shape is read from `vendorEnvironmentNames()` now, the
same source the other two commands use, and on 3.0.0 the authorization permits exactly that list,
asserted equal in both directions by `npm run test:probe-targets`.

## Done, and owed

Done, and covered by `npm test`: the registry, policy, port, and fault-to-failure-class mapping in `test/lib/probe-targets.js`; the runner, whose request shape and default agent `tools/generate-contracts.js` reads rather than transcribes; and `npm run test:probe-targets`, which drives every real command through the real adapter against checked-in fixtures with a stub vendor. It asserts default-deny, the observation shape, artifact read-back, an absent artifact, a real budget kill classified as a timeout, and contract-to-registry agreement both ways, with no model call and no credential.

Three more checks joined that list with the move to 3.0.0. `npm run test:probe-targets` now also holds each contract's declared environment keys equal to its authorization's permitted keys in both directions, and asserts that an unpermitted key is denied before a process spawns and that a malformed key fails at the port parse. `npm run test:eval-quality-corpus` compiles the package's own published corpus, which is the one check here that feeds the package nothing of TEA's. `npm run test:port-totality` holds TEA's branches total over both probe unions and all six published conformance arms.

Also done: `eval-test-review.js`'s `runReview` and `promptDigestFromCli` drive `tea-test-review` through the port, and `eval-fragment-selection.js` runs `cli/fragment-selection-runner.js` rather than calling `runAgent` in process, so its live path and its contract describe one thing. Both were verified end to end against their stub agents, with no model call: the review harness reads a real verdict artifact back as JSON and scores it, and the selection harness scores a real reply off stdout.

Two path couplings closed with them. `runReview` states `--project-root` because the process no longer runs in the repository, and it passes absolute artifact paths so the CLI's `--project-root` resolution and the policy's `cwd` resolution cannot disagree. Each fragment-selection run's scratch directory is the authorization's `cwd`, so the `read-only` declaration is enforced by the policy rather than by the caller remembering to pass one.

Also done: `eval-trace.js`'s `runCase` probes `tea-trace-runner` (`cli/trace-runner.js`), the command the trace suite had no equivalent of. The runner's whole surface is a prompt on standard input and an agent run in the working directory. It builds no prompt and knows no vendor, and it declares `scoped-artifact-writes`, the one capability a trace run needs and a selection does not. The two workflow artifacts are the authorization's artifact map, supplied per run because each case stages its own workspace, and they come back tagged, so a file the run never wrote is `absent` and a missing artifact rather than an `existsSync` race. Both runner commands share one exit-code table in `cli/lib/runner-exit-codes.js`, because a caller holding an observation cannot tell which command produced it. `trace.contract.json` is the tenth contract, generated from `test/fixtures/trace-eval/ground-truth.json` with 26 oracles over the summary artifact, and `npm run test:contract-oracles` evaluates every one of them over the fourteen stored trace runs, under both fixture sets' oracles, and compares each with the `scoreRun` check it restates. The whole chain was verified with a stub vendor: `npm run test:probe-targets` spawns the harness itself, reads its result record back, and sees every threshold met on a correct run, a quality failure on a run that wrote a test, and a missing-artifact failure on a run that wrote nothing.

The trace witness is a differential over standard input on one prompt value, `allow_gate`. The differential is on that value rather than between the two fixture sets, because the seeded and clean summaries differ from the staged files rather than from the prompt, so a differential between the sets would attribute to the prompt a difference the prompt did not cause, and an invariance claim would be false because the two summaries differ. `allow_gate` is the one prompt value the corpus establishes an effect for: step-05 evaluates a gate only when it is true and writes `gate_basis` as `none` otherwise, so two prompts differing in that value over one staged set produce two `gate_basis` values. Both witness legs stage the clean set, which is what makes them clean legs for `seeded-faults-scoped`.

Two more couplings, both found by running it. A relative `--agent-cmd` passed the harness pre-flight, which probes it from the harness's own directory, and then failed every run, because the runner executes in the staged workspace and a relative path resolves there; `parseArgs` resolves a path against the operator's directory now. And the trace witness legs are runnable only against a staged workspace, because the run's real input is the working directory; that is the same coupling `test-review`'s legs have with `--project-root`. Which set that workspace holds is in the request now: each fixture set declares its own `projectRoot`, the prompt is written against it, and `stagedWorkspaceFor` stages the set the leg names. Staging one set for every leg is what made the two witness legs seeded runs, which is the scoping failure `seeded-faults-scoped` reported against all three defect probes.

One coupling worth naming, and it did not change with the scoring half: two of the entry points TEA
reaches are addressed by file path into `dist/`, because neither the compiler CLI nor the evaluator is
on the package's `exports` map. The devDependency is pinned exactly, so an upgrade is a deliberate
edit here rather than something that arrives on its own. The reach still breaks on the upgrade that
moves those files, and nothing declares it. A third reach was needed to read a rejected probe's
qualification reasons and was not taken; that is recorded above under what the vocabulary cannot say.

Owed:

- **A live sealed run record.** The scoring half is driven live for the pre-flight and replayed for the record, because a live record is a complete harness run per probe and that cost belongs to `npm run eval:all`. The evaluator configuration on every artifact says `stored-replay` so the two cannot be confused.
