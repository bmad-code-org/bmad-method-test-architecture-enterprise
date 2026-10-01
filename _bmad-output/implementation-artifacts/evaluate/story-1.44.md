---
title: 'Story 1.44: Record installed framework versions in evaluator provenance'
type: 'feature'
created: '2026-10-01'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'ef1b127cc92a9981d53ab9ea15c64ff2adc0b4d5'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Stories 1.17, 1.23, 1.43 and 1.44)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.44 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-21; AD-6 and AD-10 untouched)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.43.md (the previous story record, the model for this one)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/eval-quality-facts.md'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** A `command` evaluator's tree digest and wiring cover the tracked `evaluator/` files, `LEARNED.md` included, but an installed framework lives outside that tree (a package in `node_modules`). An upgrade changes the framework's behavior while every tracked byte stays fixed, so new judgments are produced under the old `EvaluatorConfiguration` digest and scoring version, and `LEARNED.md` can say a version that is no longer the one that ran.

**Approach:** The evaluation declares each installed framework dependency in a tracked, machine-readable `evaluator/frameworks.json` (package identity, expected version, version-probe command and arguments; an empty list for a dependency-free evaluator), so the existing tree digest covers it. `check` refuses an absent or malformed declaration and holds `evaluator/LEARNED.md` to it. `run` observes the installed versions through the probe, launched as the evaluator is launched, before any evaluator trial, again before each evaluator launch and after each trial, stops with exit 12 and no sealed trial record on a missing, different or changed package, and records the observation in `EvaluatorConfiguration.decodingParameters` and in an auditable run artifact. The starters and `references/evaluator.md` teach the step. No eval-quality change.

## Boundaries & Constraints

**Always:** record the observed versions under one caller-owned `tea.` key in `decodingParameters` (the field `configurationFields` in `cli/lib/evaluate/evaluators.js` owns). Run the probe with the command evaluator's own environment rules (`evaluator.environmentKeys`, an empty private working directory, the run's confinement) through the evaluator's own launch path, the only spawn path. Keep `cli/` free of any framework import (`test:direction`, `test:evaluate-boundaries`). Edit the skill through `/bmad-workflow-builder` Edit run headless on `src/workflows/testarch/bmad-testarch-evaluate/`, with Analyze at zero critical and zero high findings (a finding that contradicts a repository test is skipped with the reason in the completion notes). Verify every behavioral claim about a vendor tool live against the installed version before it enters plan or guide text. Exercise every revert check once in a scratch copy and record the observation. Fix pre-existing defects found on the way. List every digest or evidence byte the change refreshed.

**Never:** an eval-quality change or a new engine export; importing a framework into `cli/`; a replay or `score` that probes afresh; a sealed trial record for a trial whose frameworks were missing, different or changed; a raised timeout; a script that is not chained; weight added to a heavy suite without the measured weight in `tools/test-shard-weights.json`; mutations of the repository's real `node_modules` in a test; a commit, push, pull request, merge or release.

**Decisions (coordinator, owner-delegated):**

- No eval-quality change: the observed versions travel in `decodingParameters`, the caller-owned field.
- The declaration is a tracked file under `evaluator/` so the evaluator tree digest covers it; `check` refuses an absent or malformed one and cross-checks a nonempty one against `evaluator/LEARNED.md`.
- The probe runs through the command evaluator's launch path and prints the installed package identity and version; `cli/` never imports a framework.
- `run` observes before any evaluator trial, again before each evaluator launch and after each trial; a missing dependency, a version different from the declaration or a change mid-run exits 12 with no sealed trial record for the affected trial.
- Replay and `score` stay byte-stable for an unchanged environment, and read the observed versions from the recorded run.

**Decisions (build, recorded here):**

- Name and shape: `evaluator/frameworks.json`, `{ "schemaVersion": 1, "frameworks": [ { "package", "version", "probe": { "command", "args" } } ] }`, no other property. `package` is a name of letters, digits, dots, underscores and hyphens with an optional `@scope/`; `version` is one exact version (no range, space or backtick); `probe.command` is a path of a tracked regular executable under `evaluator/`, so the probe's own bytes are inside the tree digest.
- Probe contract: it prints exactly `{ "package", "version" }` (two string properties, the package equal to the declared one) and exits 0; any other exit, output or package is a dependency not installed as declared.
- Configuration key: `decodingParameters["tea.evaluatorFrameworks"]`, the observed `{ package, version }` list sorted by package, present for every `command` evaluator (an empty list for none) and for no other kind. `configurationFields` refuses a command layer built without it.
- `LEARNED.md` cross-check: the `## Framework and installed version` section carries one backticked `package@version` per declared package, no other version of it and no package the declaration omits; a nonempty declaration needs the file. A declared-empty evaluator whose `LEARNED.md` records a package disagrees as well.
- Only a `command` evaluator declares frameworks: a `sealed-brief-agent` runs no installed framework of its own, and its adapter version stays recorded in `LEARNED.md`.
- Observation points: once before calibration and the first trial (`framework-versions.json` is written there, whether the observation passes or not), then in the trial's `holdLayer` before each launch and after each evaluator run, and around each calibration launch.
- Run artifacts: `framework-versions.json` (declared and observed versions, a failed probe's fault with its stdout and stderr cut to 2000 characters, and the problems list) and `run.json`'s `evaluator.frameworks`.
- The probe is a plain executable. The skill ships `installed-version.mjs` (a Node package's `package.json` found as Node finds a module beside the file) for the Node case, an empty `frameworks.json`, and the AgentEvals and promptfoo declaration templates with a `<installed version>` placeholder that `check` refuses until filled.

## I/O & Edge-Case Matrix

| Scenario                                         | Input / State                                                                         | Expected Output / Behavior                                                                     | Error Handling            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------- |
| Declaration absent                               | `command` evaluator, no `evaluator/frameworks.json`                                   | `check` finding under `evaluator`                                                              | exit 10                   |
| Declaration malformed                            | not JSON, wrong shape, a range for a version, a probe outside `evaluator/`, a repeat  | `check` finding under `json` or `schema`                                                       | exit 10                   |
| Empty declaration                                | `"frameworks": []`                                                                    | accepted; `tea.evaluatorFrameworks` is `[]`; no probe launched                                 | n/a                       |
| LEARNED.md stale                                 | declaration at 2.0.0, `LEARNED.md` records 1.0.0, or absent, or an undeclared package | `check` finding under `evaluator` naming both                                                  | exit 10                   |
| Installed equals declared                        | package installed at the declared version                                             | run succeeds; `framework-versions.json`, the configuration and `run.json` hold the observation | n/a                       |
| Package upgraded under the old declaration       | installed 2.0.0, declared 1.0.0                                                       | run stops before any evaluator trial; artifact lists both versions                             | exit 12, no sealed record |
| Package missing                                  | probe exits 1                                                                         | run stops before any evaluator trial; artifact keeps the probe's stderr                        | exit 12, no sealed record |
| Probe prints another shape or package            | garbage, an extra key, another package, an empty version                              | that dependency has no observation and a fault; the run stops                                  | exit 12                   |
| Deliberate upgrade                               | declaration and `LEARNED.md` updated to 2.0.0, committed                              | run succeeds under another configuration digest and scoring version                            | n/a                       |
| Package changes while the evaluator runs         | the evaluator rewrites the package                                                    | that trial stops after the evaluator; no sealed record                                         | exit 12                   |
| Package changes between two trials               | a target rewrites the package in trial 2                                              | trial 2 stops before the evaluator launches; no sealed record                                  | exit 12                   |
| Recorded run scored after the package moved      | run recorded at 1.0.0, package now 2.0.0                                              | `score` reads the recorded configuration; evidence and scoring version unchanged               | n/a                       |
| Observed version alone changes the configuration | same tree and wiring, observed 1.0.0 against 1.0.1                                    | different configuration digest                                                                 | n/a                       |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/frameworks.js` (new): the pure rules. `declarationProblems`, `declaredFrameworks`, `learnedProblems`, `readProbeAnswer`, `observationProblems`, `observedVersions`, `versionsRecord`, `stderrNote`.
- `cli/lib/evaluate/command-evaluator.js`: `launchExecutable` (the launch path the evaluator and every probe share, extracted from `runCommandEvaluator`) and `observeFrameworks`.
- `cli/lib/evaluate/evaluators.js`: `readFrameworks` (read from the layer's own bytes; `EvaluatorLayerError` on absent, malformed or a probe the layer lacks), `layer.frameworks`, and `configurationFields`'s `frameworks` parameter and `tea.evaluatorFrameworks`.
- `cli/lib/evaluate/run.js`: `observeInstalledFrameworks` (before calibration and the first trial), `frameworkChange`, the async `holdLayer` and the calibration launches, `framework-versions.json`, `run.json`'s `evaluator.frameworks`.
- `cli/lib/evaluate/check.js`: `checkFrameworks` (absent, untracked, malformed, probe not a tracked executable, `LEARNED.md` agreement).
- `src/workflows/testarch/bmad-testarch-evaluate/`: `references/evaluator.md` (the new `## Declare the installed framework versions`, learn steps 3 and 5, the Vendor rule, landscape and selection paragraphs), `references/gaps.md` (exit 12 row), `assets/README.md`, `assets/evaluators/` (`installed-version.mjs`, `frameworks.json`, `agentevals-frameworks.json`, `promptfoo-frameworks.json`, the `LEARNED.md` template, starter headers).
- Fixtures: `test/fixtures/evaluate-learn`, `evaluate-promptfoo`, `evaluate-tool-use-agent` (declaration, probe copy, `LEARNED.md`), and `test/fixtures/evaluate/evaluators/command/evaluator/` (an empty `frameworks.json`, the stub `probe.js`, `rows.js --mode bump-package`), `test/fixtures/evaluate/mutation/bin/verdict.js` (`VERDICT_DO=bump`).
- Tests: `test/test-evaluate-evaluators.js` (`--frameworks-only`; groups `evaluators` and `agents`), `test/test-evaluate-check.js`, `test/test-evaluate-guidance.js`, plus the `frameworks.json` additions in `test-evaluate-run.js` and `test-evaluate-workflow.js`.
- `CHANGELOG.md`, `docs/reference/tea-evaluate-cli.md`, `_bmad-output/implementation-artifacts/evaluate/sprint-status.yaml`, `epics.md`, `test-design-epic-1.md`, `ARCHITECTURE-SPINE.md` (AD-21 amendment).

## Tasks & Acceptance

**Execution:**

- [x] `cli/lib/evaluate/frameworks.js`, `evaluators.js`, `check.js` -- declaration shape, read from the layer, `LEARNED.md` agreement -- AC 1
- [x] `cli/lib/evaluate/command-evaluator.js`, `run.js` -- one launch path, observation before the trials, rechecks, artifact, configuration key -- AC 2, 3, 4
- [x] Skill: guide section, gaps row, README, probe, declaration templates, `LEARNED.md` template line (builder Edit, Analyze clean) -- AC 5
- [x] Fixtures and tests (`evaluators`, `check`, `guidance`, the three framework fixtures and the stubs) -- AC 1 to 6
- [x] CHANGELOG, docs reference, plan amendments, sprint row, this record -- all

**Acceptance Criteria:**

- `check` refuses an absent or malformed `evaluator/frameworks.json`, a probe that is not a tracked executable of the layer, and a `LEARNED.md` whose `package@version` records disagree with the declaration; it accepts an empty list (revert: removing the declaration check accepts a stale or absent record, so the `FRAMEWORK_CASES` fail).
- `run` observes each declared package through the probe, launched as the evaluator is, before any evaluator trial; a missing or different package exits 12 with no sealed trial record; the observation is in `framework-versions.json` and `decodingParameters["tea.evaluatorFrameworks"]` (revert: omitting the observed version from the configuration leaves the direct test's digest unchanged and fails it; trusting the declaration produces a record under the old digest).
- `run` rechecks before each evaluator launch and after each trial; a change exits 12 without sealing the affected trial (revert: removing either recheck lets the changed dependency judge under the original digest and fails the mid-run case).
- A deliberate upgrade (declaration and `LEARNED.md`) runs under a different configuration digest and scoring version; a direct configuration test holds the tree and wiring fixed and changes only the observed version.
- `score` of a recorded run is unchanged by a later package upgrade; replay reads the recorded configuration.
- The AgentEvals and promptfoo starters demonstrate the declaration and observation, `references/evaluator.md` teaches the step for an unfamiliar framework, and `test:direction` and `test:evaluate-boundaries` hold framework neutrality (revert: removing a starter's declaration or adding a framework import to `cli/` fails).
- `test:evaluate-evaluators` and `test:evaluate-guidance` use isolated installed-package fixtures to prove stale documentation, missing package, package upgrade and mid-run change.

## Implementation Notes

- `cli/lib/evaluate/frameworks.js` holds the pure rules and imports nothing framework-specific.
  `declarationProblems` accepts exactly `{ schemaVersion: 1, frameworks: [...] }`, each entry `{ package, version, probe: { command, args? } }`, with no other property, a package name of letters, digits, `.`, `_`, `-` and an optional `@scope/`, a digit-led exact version (a tag such as `latest`, a range, a wildcard, a space or a backtick is refused), a `probe.command` that is a path under `evaluator/` with no empty, `.` or `..` segment, and each package once.
  `learnedProblems` reads the `## Framework and installed version` section of `LEARNED.md` (CRLF files included): one backticked `package@version` per declared package (the version starting with a digit, so `` `npm@latest` `` is no record), no other version of it, no package the declaration omits, one section only.
  `readProbeAnswer` takes exactly the properties `package` and `version`, both strings, the package equal to the declared one.
- `cli/lib/evaluate/command-evaluator.js`: `launchExecutable` is the one launch path (the supervisor, an empty private working directory in the run's scratch list, `buildMinimalEnv` over `environmentKeys`, the evaluator's `timeoutMs`, the confinement prefix); `runCommandEvaluator` and `observeFrameworks` both call it, so a probe sees what the evaluator sees.
  `observeFrameworks` returns one entry per declared package (`observed` or a `fault`, with the probe's output) and throws nothing for a missing package.
- `cli/lib/evaluate/evaluators.js`: `readEvaluatorLayer` reads `evaluator/frameworks.json` from the layer's own bytes (so the digest and the read agree), refuses an absent, malformed or probe-less declaration as an `EvaluatorLayerError` (`run` exit 10), and exposes `layer.frameworks`.
  `configurationFields` takes the observed list and records `tea.evaluatorFrameworks` for a `command` evaluator (a `TypeError` without it, so a caller cannot forget the observation); the other kinds are unchanged.
- `cli/lib/evaluate/run.js`: `observeInstalledFrameworks` runs before calibration and the first trial, writes `framework-versions.json` whether the observation passes or not, and exits 12 with no trial on a missing or different package; `holdLayer` (async) and the calibration launches read again before each launch and after each evaluator run through `frameworkChange`.
  The failed trial's `evaluator/<arm>/trial-<n>.json` carries the fault; `run.json`'s `evaluator.frameworks` repeats the observed list.
  `score`, `compare` and replay read the recorded `evaluator-configuration.json` and launch no probe; `score.js` and `compare.js` are unchanged.
- `cli/lib/evaluate/check.js`: `checkFrameworks` reports an absent or untracked declaration, a shape problem (`json` or `schema`), a probe that is not a tracked regular executable, an untracked `LEARNED.md`, and a `LEARNED.md` disagreement (all under `evaluator`), and runs no probe.
- The skill was edited through `/bmad-workflow-builder` Edit run headless on `src/workflows/testarch/bmad-testarch-evaluate/` (memlog `.memlog.md` and the Analyze run `.analysis/2026-10-01-story-1-44/`, both gitignored).
  Edited there: `references/evaluator.md` (new `## Declare the installed framework versions` between the failure-boundary section and the learn procedure, with one tagged `<!-- example:frameworks -->` block; learn steps 3 and 5; the Vendor rule scoped to a `command` evaluator; the landscape, selection-rubric and starter paragraphs), `references/gaps.md` (the exit 12 row names the installed-framework cases and both recoveries), `assets/README.md`, and under `assets/evaluators/` the probe `installed-version.mjs`, `frameworks.json` (the empty list), `agentevals-frameworks.json` and `promptfoo-frameworks.json` (a `<installed version>` placeholder `check` refuses until filled), the `LEARNED.md` template line, and one header line in each starter.
- Fixtures: `evaluate-learn`, `evaluate-promptfoo` and `evaluate-tool-use-agent` declare their real packages (`autoevals@0.3.0`, `promptfoo@0.123.1`, `agentevals@0.0.7`), carry the shipped probe byte for byte, and have a `LEARNED.md` (the learn fixture's gained the `package@version` line; the other two are new and minimal).
  The `evaluate/evaluators/command` stub gained an empty `frameworks.json`, a stub `probe.js` (modes, `--log`, `--flip-at` for a version that changes at an exact read) and `rows.js --mode bump-package`; `verdict.js` gained `VERDICT_DO=bump`.
  `test-evaluate-run.js`, `test-evaluate-check.js` and `test-evaluate-workflow.js` plant an empty declaration wherever they plant a command evaluator.
- Tests: `test/test-evaluate-evaluators.js` (new `--frameworks-only` runner flag; `checkInstalledFrameworks`, `checkInstalledFrameworksMidRun`, `checkInstalledFrameworksCalibration` in group `agents`, `checkFrameworkProbeShapes` and the direct configuration unit in group `evaluators`), `test/test-evaluate-check.js` (`FRAMEWORK_CASES` and three clean cases plus CRLF, prose and scoped-package clean cases), `test/test-evaluate-guidance.js` (the guide section, markers, tagged example, declaration templates, fixture probe equality, fixture-versus-installed message, the rendered starters through `check`, `run` and `score` with a recorded observation).
  Every package an isolated case mutates is `probe-fw` under the case's own `node_modules`; the repository's `node_modules` is read only.
- `tools/test-shard-weights.json`: measured on a loaded machine (other lanes were running), the local wall time of the changed scripts against `HEAD` gave +3 to +4 seconds for `test:evaluate-check`, `test:evaluate-promptfoo`, `test:evaluate-tool-use`, `test:evaluate-evaluators` and about +45 seconds for the three new `agents` cases; each delta was doubled for the CI measure.
  `test:evaluate-agents` 247.0 to 337.0, `test:evaluate-check` 256.8 to 264.8, `test:evaluate-evaluators` 177.2 to 183.2, `test:evaluate-guidance` 64.6 to 68.6, `test:evaluate-promptfoo` 73.4 to 79.4, `test:evaluate-tool-use` 42.7 to 50.7, `test:evaluate-learned-framework` 17.7 to 20.7.
  `node tools/test-shards.js --shard <i>/6 --list` lists 589.6 seconds on every shard by the weights (the cap is 900 seconds; the slowest measured shard was 12m26 in the last run, whose weights this raises by about 21 seconds a shard).
  No timeout was raised and no script was added, so the README's chain-count sentence stays at 105.
- Plan text: `epics.md` (an amendment after the Story 1.44 acceptance criteria), `test-design-epic-1.md` (the Story 1.44 test map) and `ARCHITECTURE-SPINE.md` (an AD-21 amendment) record the shapes decided here.
- Digests and evidence bytes refreshed: none are committed.
  The evaluate-learn evaluator tree digest changes at run time because `evaluator/` gained `frameworks.json` and `installed-version.mjs` and its `LEARNED.md` gained a line; no committed file pins it, and `corpus-index.json`, `requirements.md` and `maintainer-transcript.md` are unchanged.
  Lane 3's Stories 1.55 and 1.56 therefore see a new tree digest and a new `tea.evaluatorFrameworks` entry (`[{ "package": "autoevals", "version": "0.3.0" }]`) in that fixture's configuration, and every other `command` evaluator's configuration digest moves once.
  No committed `evaluator-configuration.json` carries a `command` evaluator (the replay fixtures under `evaluate-authoring` and `evaluate-gap-loop` are deterministic), so no replay evidence changed.

### Departures from the plan text

- The plan says each declaration holds a "version-probe command". A probe is a tracked executable under `evaluator/` (a command on `PATH` is refused), so its bytes are inside the tree digest and the launch path stays the evaluator's.
- The plan lets `check` verify `LEARNED.md` "against nonempty declarations". A nonempty declaration also needs the file (the Vendor rule already says the installed version is recorded there), and an empty declaration refuses a `LEARNED.md` that records a package.
- The plan reads versions "before any evaluator trial" and "after each trial". The first read comes before calibration, since calibration launches the evaluator too (so those launches are held the same way), and the read after a trial happens right after the evaluator returns, where the layer-bytes check already sits.
- `check` does not launch a probe. The plan's "check and run prepare its layer" is met by the declaration and `LEARNED.md` checks; observing what is installed is `run`'s.
- A diagnostic reads "could not read the installed <package>" for a probe that failed, whatever the cause (a missing package, a hang, a killed probe), since the probe cannot tell them apart; the fault text names the cause.
- Vendor claims verified live before they entered the guide or a fixture: the shipped probe printed `{"package":"autoevals","version":"0.3.0"}`, `{"package":"promptfoo","version":"0.123.1"}` and `{"package":"agentevals","version":"0.0.7"}` against the installed packages, and the three fixtures and both rendered starters run `check`, `run` and `score` through it.
  The guide makes no other claim about a vendor tool; its Python advice (`importlib.metadata.version`) is the standard library's, stated as guidance with no tested starter.

## Revert observations

Each exercised once on a scratch copy of the final tree (`cp -c`, `.git` and `node_modules` included, the working tree left as built), by applying one edit that undoes the change, running the named test, and restoring the file.
The unmodified copy passes: `--frameworks-only` 84 checks, `test:evaluate-check` 888, `test:evaluate-guidance` green.
The counts are the failed checks of the named script; the driver and its log are in the session scratchpad.

- AC 1, `check` ignores the declaration (the `checkFrameworks` call removed): 72 of 888 `test:evaluate-check` checks fail (absent, not JSON, a list, another schema version, no frameworks list, and the rest of the refusals).
  The `LEARNED.md` comparison removed: 22 of 888 (no `LEARNED.md`, another version, two versions, an unrecorded package, an undeclared one, no section, an empty declaration that records one).
  The shape check accepting whatever it is given: 32 of 888.
  The probe-file check removed: 3 of 888.
  A tag accepted as a version: 2 of 888.
  A repeated section accepted: 3 of 888.
  CRLF not normalized: 1 of 888 (the CRLF clean case exits 10).
  The untracked-declaration finding removed: 1 of 84 `--frameworks-only` checks (`check` exits 0 on a declaration git does not track).
  The untracked-`LEARNED.md` finding removed: 1 of 84 (`check` still exits 10 under the less specific "not a file the layer holds", so the pinned message fails).
- AC 2, the observed versions left out of the configuration: 2 of 84 (the configuration records `[]`; the run after a deliberate upgrade kept the old configuration digest).
  The `tea.evaluatorFrameworks` key not recorded: 3 of 84, among them the direct configuration unit that holds the tree and wiring fixed and changes only the observed version.
  Trusting the declaration (the start refusal inverted): 3 of 84 (the upgraded package and the removed package no longer exit 12, and their runs seal records).
  `framework-versions.json` not written: 1 failed check, and the case stops there (63 checks ran).
  `run.json`'s `evaluator.frameworks` left out: 1 of 84.
  The probe started without the evaluator's `environmentKeys`: 1 of 84.
- AC 3, the recheck before each launch removed: 3 of 84 (the between-trials case no longer stops at `trial-clean-2`, and the probe count is 7 against 13).
  The recheck after each trial removed: 2 of 84 (the during-trial case no longer exits 12, and the probe count is 7).
  The calibration recheck after a launch removed: 1 of 84; before a launch removed: 1 of 84.
- AC 4 and 5, the evidence scoring version moves with a deliberate upgrade in `checkInstalledFrameworks` (the declaration moves too, so the tree digest also changes); the isolated effect of the observed version is the direct configuration unit, which the `tea.evaluatorFrameworks` revert above fails.
  `score` of a recorded run after the package moved: the case compares the evidence scoring version and the reduced outcomes before and after; no code path in `score.js` reads a probe.
- AC 6, the guide section's heading renamed: 24 `test:evaluate-guidance` failures (each marker lost its section).
  The promptfoo declaration template removed: 4 failures; the AgentEvals template naming another package: 2 (the declaration check and the rendered starter's `check`); the gaps recovery sentence removed: 1; a fixture's probe copy differing from the shipped one: 1.
  A framework import added under `cli/` (`require('some-framework')` for `test:direction`, `require('promptfoo')` for the name scan): `test:direction` 1 violation, `test:evaluate-boundaries` 1 of 428 (the framework-name scan).
  The learn fixture recording another version: 2 failures in `test:evaluate-learned-framework` (`check` exits 10 naming both versions); its declaration removed: 2.

## Gates

- Engine check (`evaluateTarget` is a function, eval-quality 4.7.0) exit 0 at the end of the build; the coordinator reported it at the start and every engine-backed suite ran against it throughout.
- Green on the final tree: `test:evaluate-evaluators` 477, `test:evaluate-agents` 306, `test:evaluate-check` 888, `test:evaluate-guidance`, `test:evaluate-learned-framework` 117, `test:evaluate-promptfoo` 165, `test:evaluate-tool-use` 99, `test:evaluate-boundaries` 427, `test:direction`, `test:evaluate-workflow` 165, `test:evaluate-confinement` 331, `test:evaluate-calibration`, `test:shards` 117, `test:ci-coverage` (105 steps), `test:doc-counts`, `test:doc-claims`, `test:doc-count-sources`, `test:doc-claim-sources`, `test:changelog`, `test:release-metadata`, `lint`, `lint:md`, `format:check`, `docs:validate-links`, `docs:build`.
- `git diff -- package.json package-lock.json` is empty: no dependency, lockfile or peer change and no `file:` or `.tgz` spec.
- Unrun: the full `npm test` (CI shards).

## Build review

Builder Analyze (delta, five lenses) found 0 critical, 0 high, 6 medium and 7 low.

### Fixed (all thirteen)

- architecture-1 and enhancement-2: the Vendor rule applied the `command`-only mechanism to every kind; it is scoped to a `command` evaluator, keeping the two pinned phrases.
- architecture-2: `gaps.md` failed `format:check`; formatted, and the row now names both recoveries (enhancement-5).
- enhancement-1: the non-Node probe paragraph (base environment, confinement, no activated environment, installed metadata without importing, the exact package string).
- enhancement-3: install the declared version exactly and track the lockfile (`npm install --save-exact`).
- enhancement-4 and architecture-4: the `package@version` form is reserved for declared packages; the template's old runtime line became `Runtime, in plain prose`.
- determinism-1: the guide says to run `node evaluator/installed-version.mjs <package>` and copy the value into both files.
- architecture-3: the landscape pointer names the heading and the copy destinations.
- leanness-1, 2 and 3: the section keeps the author's moves and the exit 12 consequence, drops the decodingParameters key sentence, and the probe and starter headers shrank to what they must say.
- Skipped: none.
- Path scan (`scan-path-standards.py`): the same two high findings as Story 1.43's baseline (`SKILL.md` bare `_bmad`, `references/adapters.md` `../`), in files this story did not touch, plus the gitignored memlog and old analysis folders.

### Code review triage (three layers over the staged diff)

| Finding                                                                                                   | Verdict | Evidence and route                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Calibration holds untested (verification gap, blind)                                                      | medium  | no test reached `judgeItem` with a declaration; patched: `checkInstalledFrameworksCalibration` with a probe that flips at an exact read, both messages, and two reverts                                                                                                                                                                                                                  |
| Untracked declaration or probe unnamed (verification gap)                                                 | medium  | `check` and `run` disagreed on a layer git does not track, with no test; patched: three untracked cases in `checkInstalledFrameworks` and two reverts                                                                                                                                                                                                                                    |
| Untracked `LEARNED.md` skipped silently (edge)                                                            | medium  | the digest excludes it while `check` stays quiet for an empty declaration; patched with a finding and a case                                                                                                                                                                                                                                                                             |
| CRLF `LEARNED.md` misread (verification gap, edge, blind)                                                 | medium  | `split` on `\n` found no section; patched, with a clean case and a revert                                                                                                                                                                                                                                                                                                                |
| Repeated section ignored (edge, blind)                                                                    | low     | patched with a finding and a case                                                                                                                                                                                                                                                                                                                                                        |
| Prose backticks read as records (edge, blind)                                                             | medium  | `` `user@example.com` `` became package `user`; patched (digit-led version), with a clean case                                                                                                                                                                                                                                                                                           |
| Version pattern accepts `latest`, `1.x` (blind)                                                           | medium  | the run would then fail at exit 12; patched, tightened and negative cases added                                                                                                                                                                                                                                                                                                          |
| Probe cannot start, hangs, is killed; scoped package (verification gap, blind)                            | low     | untested branches; patched with unit cases through `observeFrameworks` and the shipped probe                                                                                                                                                                                                                                                                                             |
| Probe reading a malformed manifest or a name leaving `node_modules` (edge)                                | low     | patched in `installed-version.mjs`                                                                                                                                                                                                                                                                                                                                                       |
| "not installed as declared" for a hang (blind)                                                            | low     | patched wording to "could not read the installed"                                                                                                                                                                                                                                                                                                                                        |
| CHANGELOG breaking change under Added, contradictory install advice, one oversized bullet (blind)         | medium  | patched: a `### Changed` entry with the migration step, one rule for installs, the Added entry split into four short bullets                                                                                                                                                                                                                                                             |
| Docs table row for `framework-versions.json` (blind)                                                      | medium  | the row sat in the baseline-mirror table, which `compare.js` does not copy; removed, the artifact is described in the evaluation-layer section, with the start-of-run limit and what the declaration does not cover                                                                                                                                                                      |
| Fixture declarations break on a dependency bump (blind)                                                   | low     | patched with a guidance check that names the fixtures and the deliberate-upgrade step                                                                                                                                                                                                                                                                                                    |
| Hygiene: unused exports, UTF-16 slicing, a wrapped comment, `layer?.` before the null guard (blind)       | low     | exports removed, code-point slicing, comment rewrapped, guard reordered                                                                                                                                                                                                                                                                                                                  |
| Non-`EvaluatorError` exception escaping `holdLayer` (edge)                                                | false   | a scratch directory the evaluator's own launch cannot make fails the same way; the probe adds no new path                                                                                                                                                                                                                                                                                |
| `v1.2.3` or build metadata fails the exact comparison (edge)                                              | low     | corrected in round 1: the first triage called it false on the ground that the guide says one exact version, which does not hold, since the guide never said the version starts with a digit and `VERSION_PATTERN` refuses a declared `v1.2.3`; a probe that prints `v1.2.3` for a declared `1.2.3` does exit 12; patched by documenting the digit-first rule in the guide, with a marker |
| Exit class of a declared-versus-installed mismatch (blind)                                                | false   | coordinator decision: exit 12                                                                                                                                                                                                                                                                                                                                                            |
| `layer?.files` before `if (layer === null)` (blind)                                                       | false   | `layer` is null or an object; reordered for clarity only                                                                                                                                                                                                                                                                                                                                 |
| `evaluate-learn` `LEARNED.md` carries two version lines (blind)                                           | false   | the learned-framework test pins the older line; the new one is machine-read                                                                                                                                                                                                                                                                                                              |
| `run.md` and the workflow checklist do not mention the declaration (blind)                                | low     | rejected: `references/evaluator.md` is the guide Stage 6 loads, and the fix is a guide section; no repository rule asks for more                                                                                                                                                                                                                                                         |
| Probe timeout is the evaluator's timeout; a hung probe stalls 2 times its timeout per trial (edge, blind) | medium  | real; the plan's decision is that the probe follows the evaluator's rules, so it is deferred (see Left undone)                                                                                                                                                                                                                                                                           |
| Declaration completeness is the adopter's (blind)                                                         | medium  | real and documented; the CHANGELOG and docs now say the observation covers the declared packages at the version their `package.json` reports; deferred (see Left undone)                                                                                                                                                                                                                 |

### Left undone, reported

- A dedicated probe timeout (and bounded total probe cost per trial): the probe inherits `evaluator.timeoutMs`, so a hanging probe costs that timeout at each of its reads (one at the start, two per trial, two per calibration launch).
- Undeclared and transitive packages: the observation covers what the declaration lists, at the version the package's `package.json` reports; a plugin, a transitive dependency or a local patch to an installed file is outside it. An install-state digest (a lockfile or a package tree) would close it.
- A sealed-brief agent evaluator's adapter version stays recorded in `LEARNED.md` alone: the agent CLI's installed version is not observed, since only a `command` evaluator declares frameworks.
- `framework-versions.json` holds the start-of-run reading; a change during the run is in the stopped trial's evaluator fault only.
- No Python probe starter: the guide teaches the shape in prose and the shipped probe covers Node packages.

## Review round 1

The coordinator's CI run failed chain shard 1 on `npm run test:schema-versions`, and an adversarial review added four lows.

### The schema-versions gap

`frameworks.js` stated a literal `schemaVersion: 1` twice (the problem text and `versionsRecord`), which `test:schema-versions` refuses for every artifact TeA writes.
Reproduced first with `npm run test:schema-versions` (two problems, `frameworks.js:63` and `:264`).
My local gates had run the evaluate suites and the doc, boundary and direction gates but not the chain scripts that scan `cli/lib/evaluate`.
Fix, in the idiom `compare.js` uses for its baseline: two runtime schemas under `cli/lib/evaluate/schemas/`, `evaluator-frameworks.schema.json` (the declaration) and `framework-versions.schema.json` (the run artifact), each with `properties.schemaVersion.const`, which `frameworks.js` reads into `FRAMEWORKS_SCHEMA_VERSION` and `VERSIONS_SCHEMA_VERSION`; the problem text reads the constant too.
The schemas are used, not decorative: `test:evaluate-evaluators` validates every `framework-versions.json` a case produces (success, upgraded, missing) against its schema and holds the declaration schema and `declarationProblems` to the same verdict on eight shapes (empty list, one framework, a scoped package, another schema version, a wildcard, a tag, a probe outside `evaluator/`, an unknown property).
The scanning test is unchanged; `docs/reference/tea-evaluate-cli.md` lists both schemas among the runtime-owned ones.

Audit of the rest of the chain: `node tools/test-shards.js --shard 1/6 --list` names 16 scripts.
Run after the fix, all green: `test:schema-versions`, `test:doc-claim-sources`, `test:doc-invocation-entry`, `test:teach-me-testing-scoring`, `test:eval-atdd-data`, `test:nfr-evidence-guidance`, `test:probe-corpus`, `test:probe-conformance`, `test:probe-targets`, `test:licences`, `test:supply-chain`, `test:tea-workflow-descriptions`, `test:evaluate-interpret`, `test:evaluate-boundaries` and `format:check` (the heavy `test:evaluate-arms` and `test:evaluate-workflow` ran in the build and are unaffected).
Other quick chain scripts that read the tree: `test:schemas`, `test:eval-schemas`, `test:boundary`, `test:direction`, `test:knowledge`, `test:criteria-fragments`, `test:doc-counts`, `test:doc-claims`, `test:doc-count-sources`, `test:doc-invocations`, `validate:schemas`, `test:contract-sources`, `test:contracts`, `test:contract-oracles`, `test:probe-sources`, `test:lineage`, `test:layering-boundary-lineage`, `test:bmad-output-gated`, `test:cli`, `test:suite-manifest`, `test:conflict-markers`, `test:install`, `test:changelog`, `test:release-metadata`, `test:shards`, `test:ci-coverage`, plus `lint`, `lint:md` and `docs:validate-links`.
Then the focused suites again: `test:evaluate-check` 893, `test:evaluate-guidance`, `test:evaluate-evaluators` 485, `test:evaluate-agents` 309, `test:evaluate-learned-framework` 117, `test:evaluate-promptfoo` 165, `test:evaluate-tool-use` 99.

### Adversarial review lows (all accepted and fixed)

- 2a: the `LEARNED.md` section is found as a whole line (`^## Framework and installed version[ \t]*$`), fenced code blocks are ignored (a heading or a record quoted inside one counts for nothing), CRLF stays handled, and a section ends at the next level-two heading.
  New cases in `test-evaluate-check.js`: a file whose only heading is `### Framework and installed version` (refused as no section), a correct section with the heading quoted inside a fenced block (accepted, no "more than one section"), a heading with trailing spaces and a tab (accepted).
- 2b: the guide says `framework-versions.json` "keeps the declared and observed versions, and the output of any probe that failed", pinned by a guidance marker and a negative case.
- 2c: the guide says "The version starts with a digit, so a probe for an ecosystem that reports `v1.2.3` prints `1.2.3`.", pinned by a marker and a negative case.
  The triage row that rejected the `v1.2.3` finding is corrected above: the stated reason did not hold.
- 2d: the package-name rule names `~`, pinned by a marker.

### Revert observations (round 1)

Each applied once to a scratch copy of the final tree and restored.

- 2a, the heading matched as a substring: 3 of 893 `test:evaluate-check` checks fail (the `###` case reads as the section).
  Fenced blocks not ignored: 1 of 893 (the fenced-quote case exits 10).
  Trailing whitespace refused: 1 of 893.
- 2b, the old artifact wording restored in the guide: 2 `test:evaluate-guidance` failures; 2c, the digit sentence removed: 2.
- Schema version stated as a literal again: `npm run test:schema-versions` fails naming `frameworks.js:35`.
- The run-artifact schema without its `problems` property: 2 of 95 `--frameworks-only` checks fail (the refused and the missing-package artifacts).
  The declaration schema accepting a tag or a wildcard: 2 of 95 (the schema and `declarationProblems` disagree).

## Verification

**Commands:**

- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.evaluateTarget !== 'function') process.exit(1)"` -- expected: exit 0
- `npm run test:evaluate-evaluators && npm run test:evaluate-agents && npm run test:evaluate-guidance && npm run test:evaluate-check && npm run test:evaluate-learned-framework && npm run test:evaluate-promptfoo && npm run test:evaluate-tool-use` -- expected: green
- `npm run test:evaluate-boundaries && npm run test:direction && npm run test:shards && npm run test:ci-coverage && npm run test:doc-counts && npm run test:changelog` -- expected: green
- `npm run lint && npm run lint:md && npm run format:check && npm run docs:validate-links` -- expected: green
