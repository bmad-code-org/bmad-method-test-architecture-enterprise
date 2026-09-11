---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation', 'peer-review-refinement']
inputDocuments:
  - '~/opensource/bmad-eval-quality/CHANGELOG.md'
  - '~/opensource/bmad-eval-quality/package.json'
  - '~/opensource/bmad-eval-quality/src/index.ts'
  - '~/opensource/bmad-eval-quality/src/application/index.ts'
  - '~/opensource/bmad-eval-quality/src/testing/index.ts'
  - '~/opensource/bmad-eval-quality/src/adapters/index.ts'
  - '~/opensource/bmad-eval-quality/src/core/schemas/probe.ts'
  - '~/opensource/bmad-eval-quality/src/core/schemas/eval-contract.ts'
  - '~/opensource/bmad-eval-quality/src/core/schemas/sealed-run-record.ts'
  - '~/opensource/bmad-eval-quality/src/core/schemas/artifact-reference.ts'
  - '~/opensource/bmad-eval-quality/src/core/score/strength.ts'
  - '~/opensource/bmad-eval-quality/scripts/'
  - '~/opensource/bmad-eval-quality/schemas/'
  - '~/opensource/bmad-eval-quality/corpus/'
  - 'docs/explanation/eval-quality-roadmap.md'
  - 'docs/explanation/eval-quality-adoption-guide.md'
  - 'docs/explanation/eval-quality-command-adapter.md'
  - 'DESIGN-CRITERIA-REGISTRY.md'
  - 'AGENTS.md'
  - 'CHANGELOG.md'
  - 'package.json'
  - '.npmrc'
  - '.markdownlint-cli2.yaml'
  - 'eslint.config.mjs'
  - '.github/workflows/quality.yaml'
  - 'test/contracts/'
  - 'test/probes/'
  - 'test/evals/suite-manifest.json'
  - 'test/test-probe-conformance.js'
  - 'test/lib/eval-quality-inputs.js'
  - 'test/lib/probe-targets.js'
  - 'test/lib/probe-scoring.js'
  - 'tools/generate-probes.js'
  - 'tools/generate-contracts.js'
  - 'tools/validate-ci-coverage.js'
  - 'src/workflows/testarch/bmad-testarch-framework/resources/hooks/tea-enforce.cjs'
---

# TEA - Epic Breakdown

## Overview

This document is the epic and story breakdown for upgrading TEA from `eval-quality` 1.4.0 to 3.0.0, adopting every capability of that package TEA can use, and closing the deferred work the repository already declares.

There is no PRD and no architecture document for this work, and none was written. It is a brownfield upgrade of an existing dependency, so the requirements source is the dependency's own released behavior read from its source, plus TEA's current state read from its own artifacts.

Three facts frame everything below.

The upgrade is not a version bump. TEA's 31 probes are stamped `schemaVersion: 3` and its 10 contracts `4`, while `PROBE_SCHEMA_VERSION` and `EVAL_CONTRACT_SCHEMA_VERSION` are both `5`, and on 3.0.0 a stale probe stamp is a `schema-version-mismatch` runtime fault at exit `5` in both `preflight` and `score`.

TEA is the package's proving ground. A limitation found in `eval-quality` during this work is fixed in `eval-quality` and released, rather than worked around in TEA.

The package already ships more than TEA uses. Three reference adapters exist for the three ports TEA hand-rolls, and several capabilities TEA needs are implemented but unreachable because no barrel exports them.

Explicitly out of scope, and the epic set's definition of done must name both halves, feature and documentation:

- The ten Absolute registry rows in `tea-enforce.cjs`'s `DEFERRED` map. Each is deferred because a regex hook cannot decide it, and closing them means replacing the hook with a parser.
- Reversing `eval-quality`'s written decision not to pin `schemaVersion` with a JSON Schema `const`. The package argues the case in the schema itself, and FR12 meets the same need on the consumer side instead.

## Requirements Inventory

### Functional Requirements

**Running on the current package**

FR1: TEA depends on `eval-quality` 3.0.0, replacing the `1.4.0` pin at `package.json:140`.

FR2: Every `CommandTargetPolicy` TEA builds declares `permittedEnvironmentKeys`. Two sites build one: the policy object opening at `test/lib/probe-targets.js:186` and the one at `test/test-probe-conformance.js:139`. The field is required with no default, so both fail `CommandTargetPolicy.parse` on 3.0.0 until it is added.

FR3: Every environment key TEA declares matches `EnvironmentKeyName` (`/^[A-Za-z_][A-Za-z0-9_]*$/`, `src/core/schemas/primitives.ts:145`), and no declaration attempts `PATH`, which the schema refuses by refine and the adapter refuses again at `src/adapters/command-line-adapter.ts:164`.

FR4: All 31 probe artifacts across the 10 files under `test/probes/` carry `schemaVersion: 5`, migrated from `3`, and `tools/generate-probes.js` emits `5`. The load-bearing edit is the ninth input channel: each of the 21 `inputBinding` selectors gains `"arguments": null`. The stamp itself changes no validation verdict, because no published schema pins it, and it is what `preflight` and `score` read at runtime.

FR5: All 10 eval contracts under `test/contracts/` carry `schemaVersion: 5`, migrated from `4`, and `tools/generate-contracts.js` emits `5`. All 10 validate at version 5 with no other edit.

FR6: `preflight` and `score` read every migrated probe without raising `schema-version-mismatch`.

FR7: TEA's `CommandProbeSubject` supplies `unauthorizedEnvironmentKeyRequest`, required on `CommandProbeSubject` at `src/testing/probe-conformance.ts:472`, and the `command-probe` arm reports the 16 outcomes `CONFORMANCE_OUTCOME_COUNTS` names where it reported 15 on 1.4.0.

FR8: TEA's branches stay total across the three-member `ProbeRequest` and `ProbeObservation` unions (`port-messages.ts:168` and `:245`) and the six-member `ConformancePort` (`src/testing/conformance.ts:32`).

**What the package must publish, and what TEA then derives**

FR9: `eval-quality` exports `PROBE_SCHEMA_VERSION` and `EVAL_CONTRACT_SCHEMA_VERSION` from a public entry point. Both are declared (`probe.ts:90`, `eval-contract.ts:161`) and reachable from none of the four barrels, so 3.0.0 made a stale stamp a hard runtime fault while giving no caller a way to read the number. The root barrel exports 19 names and the exports map has no wildcard, so a deep import is refused with `ERR_PACKAGE_PATH_NOT_EXPORTED`.

FR10: `eval-quality` exports `compareDominance`, with `ComparableResult`, `DominanceRelationValue` and `Severity`. It is declared at `src/core/score/strength.ts:254` and reachable from no barrel, so FR30 has no way to run without this.

FR11: Every artifact version a consumer must write or match is a named, exported constant. Three are scattered literals the package itself stamps: `sealed-evaluator-brief` at `src/core/seal/seal.ts:98`, `evidence-artifact` at `src/core/emit/emit.ts:110`, `preflight-verdict` at `src/core/preflight/reduce.ts:475`. A fourth is needed for a different reason: `sealed-run-record` is caller-produced, so the package stamps it nowhere, yet it reads version 6 and TEA must write that number. Without an exported source for it, FR13 cannot resolve without a literal or a refused deep import.

FR12: TEA validates the `schemaVersion` of every artifact it authors against the constant the package exports, before the artifact reaches a pipeline stage. This covers the stamped artifacts TEA builds or reads, and excludes `artifact-reference`, which deliberately carries no `schemaVersion`. This meets the need behind pinning a JSON Schema `const` without reversing the package's written decision against it, which is argued in the schema: a `const` "exports as `{"type":"number","const":1}`, losing `integer` for a non-TypeScript consumer" and turns a version mismatch into an anonymous parse failure instead of the dedicated `schema-version-mismatch` fault.

FR13: TEA derives its expected artifact versions from the package. `test/lib/eval-quality-inputs.js:48` hardcodes a five-entry `SCHEMA_VERSIONS` table whose comment concedes the versions are "stated rather than derived". Two entries are wrong for 3.0.0: `probe` reads 3 and must read 5, and `sealedRunRecord` reads 3 and must read 6 (`sealed-run-record.ts:429`; a version-5 record carrying `invalidReason` fails to parse against version 6). TEA builds a sealed run record from that entry at `eval-quality-inputs.js:300`, so it currently emits version-3 records. `probe` and `scoringPolicy` are dead entries with no reader.

FR14: TEA validates the two artifact kinds it hand-authors that the published schemas cover and TEA never checks: `eval-contract` and `scoring-policy`. `validateArtifact` covers seven of the twelve today, and the contract stamp FR5 moves is in the class Ajv never sees.

FR15: The gates `eval-quality` keeps repo-local ship to consumers, so TEA runs them rather than rebuilding them. `files` is `["dist","schemas","corpus","README.md","LICENSE"]`, so `check-doc-counts.ts`, `check-doc-claims.ts`, `check-doc-invocations.mjs`, `audit-lockfile-age.mjs`, `check-licenses.mjs`, `check-dependency-direction.ts`, `check-package-boundary.ts` and `check-lineage-ownership.ts` reach nobody.

FR16: Every `eval-quality` change this epic set requires is published to npm, and TEA's pin moves to the published version. No `file:` or `link:` dependency on a local checkout lands on `main`.

FR17: `eval-quality`'s `VERSION` export tells the truth. `dist/index.d.ts` declares `VERSION = "2.0.0"` while `package.json` reads `3.0.0`.

**Ports**

FR18: TEA resolves its corpus through `CorpusPort`, using the shipped `createLocalCorpusAdapter`, and certifies it with `runCorpusPortConformance`. TEA digests corpora by hand at `test/eval-trace.js:1146`, `test/lib/probe-scoring.js:663` and `tools/generate-probes.js:217`.

FR19: TEA reads and writes files through `FileSystemPort`, using the shipped `createNodeFileSystemAdapter`, and certifies it with `runFileSystemPortConformance`.

FR20: TEA measures elapsed time through `ClockPort`, using the shipped `createSystemClockAdapter`, and certifies it with `runClockPortConformance`.

FR21: ~~TEA runs `runEnvironmentProbePortConformance` against its adapter, the generic port arm beside the command-line specialization.~~ **Withdrawn.** The premise was wrong. `runEnvironmentProbePortConformance` is not a generic arm beside a command-line specialization; it is the `api` arm, and the package says so in `dist/testing/probe-conformance.d.ts`, which names the three as the `api`, `cli` and `mcp` arms of three sibling mechanisms. Its `ProbeSubject` requires denied loopback, private, link-local and metadata addresses, an unauthorized method, an unauthorized scheme, a redirect to a denied target, a chain past `maxRedirects`, an oversize response, a slow answer and a 500, over a `ProbeTargetPolicy` carrying `scheme`, `methods`, `safeMethods`, `maxRedirects`, `maxRequestBytes` and `maxResponseBytes`. None of that exists on a command authorization. `eval-quality/adapters` ships no HTTP adapter, so there is nothing to run the arm against, and TEA authorizes no HTTP target, so it has no subject either. Satisfying it would mean building a port TEA does not use, which is the opposite of what this epic was rewritten to be. The arm is out of scope, and `test/test-port-totality.js` records that as a fact about TEA rather than as a gap in it.

FR22: Every expected conformance count TEA asserts reads from `CONFORMANCE_OUTCOME_COUNTS`, each arm TEA adds does the same, and a missing entry fails with the arm named rather than reporting an undefined expected count.

**Claims, codes and supply chain**

FR23: TEA's gate computes every published count from its own source. `docs/explanation/eval-quality-roadmap.md` states "48 fragment selections, 3 complete reviews, and 4 complete traces", which is correct today and held by nothing.

FR24: TEA's gate holds published prose claims against the artifacts they name.

FR25: TEA holds the fenced commands in its documentation against their declared exit codes. 23 files carry bash fences: 21 under `docs/`, plus `README.md` and `CONTRIBUTING.md`.

FR26: TEA narrows package faults by type rather than by duck-typing. `test/lib/probe-targets.js:220` narrows on `error?.code`, so any Node error carrying a `code`, such as `ENOENT` or `EACCES`, lands on `environment-transport`. `RuntimeFault` and `StructuralFailure` are exported classes and `instanceof` is the correct narrowing.

FR27: TEA asserts its recognized vocabularies against the package's exported registries: `FAILURE_CODES`, `RUNTIME_FAULT_CODES`, `QUALIFICATION_FAILURES`, `VERDICTS` and `EVALUATOR_RECOMMENDATIONS`. None is referenced by any TEA source file. `test/test-contracts.js:114` recovers a code with `/^eval-quality: ([a-z-]+):/` and an unrecognized code becomes the string `unknown`.

**Half the evidence moved under Story 4.5.** The regex is gone: `test/test-contracts.js` reads the code off the thrown fault as a field. The `unknown` fallback survives at the same site, so a code the fault does not carry still becomes a string nothing holds against `RUNTIME_FAULT_CODES`, and the requirement stands on that half.

FR28: TEA reads structured diagnostics from `DiagnosticSink` rather than parsing stderr. `RunPreflightOptions.sink` and `PreflightFromObservationsOptions.sink` are exported and unused by TEA.

**Satisfied, and the premise was half wrong.** The two halves of this requirement are two different surfaces and neither reaches the other, which the wording joins into one sentence.
The sink does not carry the reason. `Diagnostic` is `{ runId, stage, message }` with `message` as free prose (`application/diagnostics.ts`), so it is a run-identity and lifecycle channel; the reason a check resolved lives in `PreflightVerdict.checks[].outcome`, which TEA already read. What the sink alone carries is the leg count, and that is worth having: 26 of the 51 probes the stored corpus scores plan a number of legs that differs from the number of checks their verdict reports, and nothing else in TEA records it.
The stderr TEA parsed was never the sink's to replace. It was `test/test-contracts.js` scraping the `compile` binary, and `compile` emits no diagnostics at all, because the package emits only from stages carrying a run identifier. Its structured replacement is `compile` throwing in process: a `RuntimeFault` or `StructuralFailure` carrying `code` as a field, with the Zod error as `cause` for a schema failure.
`PreflightFromObservationsOptions.sink` stays unused, and it is not deferred work. TEA holds a port for both halves of the pre-flight, so it calls `runPreflight` and never `preflightFromObservations`, which `docs/explanation/eval-quality-command-adapter.md` already records as unusable here for a reason unrelated to the sink.

FR29: TEA makes the `--strict` CONCERNS-promotion decision explicitly, reading `LadderResolution.strictPromotable`, since TEA scores in process through `runScore` and NFR3 fixes exit `1` as the same rung.

FR30: TEA compares run strength through `compareDominance`, honoring `comparabilityKey` and each side's `strength.comparable`.

FR31: TEA audits both lockfiles for age and licence, and sets a resolution-time floor in `.npmrc`. TEA's `.npmrc` is one line; `eval-quality` sets `min-release-age=7` and keeps the fail-closed audit beside it because that setting fails open on an already-committed lockfile.

FR32: TEA holds the dependency direction between the trees that have an import graph: `cli/`, `tools/`, `test/` and `src/**/*.cjs`. `src/` holds 725 files of which one is JavaScript, so a gate over `src/` as a whole would be vacuous.

FR33: TEA holds its package boundary, so nothing the published tarball carries references the repository it was built in. TEA publishes to npm with three `bin` entries and ships `src/workflows/`.

FR34: TEA holds lineage ownership over the fields `tools/generate-probes.js` and `tools/generate-contracts.js` write and several readers consume.

FR35: TEA guards publish authorization, so a laptop with a valid token cannot publish outside the release workflow. TEA has no publish lifecycle hook.

FR36: TEA's planning and output trees are read by a gate. `eslint.config.mjs`, `.markdownlint-cli2.yaml` and `.prettierignore` all exclude `_bmad/**` and `_bmad*/**`, so this document and every artifact beside it are linted by nothing.

FR37: TEA's suppression allowlists are justified or removed. `.markdownlint-cli2.yaml` sets `config.default: false`, leaving five rules active across every shipped markdown file. `eslint.config.mjs:77-108` disables `no-undef`, `no-unused-vars` and `no-unreachable` across `cli/**`, `tools/**`, `test/**` and the hook scripts copied into user projects, with an in-file comment conceding the second is to "avoid failing CI on incidental unused vars".

FR38: TEA's coverage is enforced or the tooling is removed. The `c8` block declares no `check-coverage` and no threshold, `test:coverage` is in neither the `npm test` chain nor any workflow.

FR56: TEA fails closed when `eval-quality` cannot be resolved. `test/test-contracts.js:174` prints a skip notice and returns `0`, so a broken install leaves 10 contracts unchecked and reads as a pass. This was recorded as a known shape in an earlier draft and owned by no requirement, which is the state this plan exists to end.

FR39: Every new npm script is covered by CI. `tools/validate-ci-coverage.js` enforces only that scripts in the `npm test` chain run somewhere in CI, and states "the reverse is allowed", so a script outside that chain needs no step.

**Proving it**

FR40: TEA proves the pin move against the package's own published corpus before migrating a single TEA artifact, by compiling all 25 published contracts on 3.0.0 and diffing the sealed brief against the shipped bytes. `eval-quality/corpus/*` is a published subpath with a `sha256:` digest per entry and zero TEA references.

FR41: `npm run eval:all` runs live against the new feature set for at least one runner, and the measured result is recorded with its exit class.

FR42: `docs/explanation/eval-quality-roadmap.md` states the baseline that ships. Its Work Plan items 1 through 8 are already done, and the CLI-entry-point debt at line 169 is carried forward or closed explicitly.

FR43: `docs/explanation/eval-quality-adoption-guide.md` describes adoption against 3.0.0.

FR44: `docs/explanation/eval-quality-command-adapter.md` documents the environment channel and its default-deny allowlist, and decides the three unscored probe classes it currently records in prose.

FR45: TEA's hand-maintained `CHANGELOG.md` carries an entry for this work, per `AGENTS.md`.

FR46: TEA cuts a release once the work closes.

**Behavioral coverage**

FR47: A behavioral suite proves `bmad-tea` routes realistic and ambiguous user intents to the correct workflow, explains the choice, preserves the requested scope, and declines unsupported claims.

FR48: A behavioral suite proves `bmad-testarch-test-design` identifies grounded risks, applies probability and impact consistently, assigns priorities through stated judgment, and maps each material risk to suitable coverage.

FR49: A behavioral suite proves `bmad-testarch-nfr` grounds every status in supplied evidence, covers all four NFR domains, returns `CONCERNS` for unknown thresholds, and avoids unsupported `PASS` results.

FR50: A behavioral suite proves `bmad-testarch-ci` produces syntactically valid pipeline configuration with the requested triggers, permissions, test commands, quality gates, and artifacts.

FR51: A behavioral suite proves `bmad-testarch-atdd` produces acceptance tests that map to the supplied criteria, fail before implementation for the intended reason, and avoid changing production code.

FR52: A behavioral suite proves `bmad-testarch-automate` generates tests that pass on the fixed implementation, fail on a qualified seeded regression, and avoid vacuous or duplicate coverage.

FR53: A behavioral suite proves `bmad-testarch-framework` produces a scaffold containing the expected configuration, fixtures, scripts and hook registration, and that the scaffold installs and runs a smoke test.

FR54: A transcript-based behavioral suite proves `bmad-teach-me-testing` places a learner at the right level, corrects seeded misconceptions, adapts the session, persists progress, and avoids claiming mastery without evidence.

FR55: `test/evals/suite-manifest.json` carries no `deferred` entry.

### NonFunctional Requirements

NFR1: `npm test` and every job in `.github/workflows/quality.yaml` pass. The gate is each story's definition of done rather than a final step.

NFR2: Scoring comparability is stated rather than assumed. Where a change moves an attested corpus digest or a scoring input, the record says scores computed before and after are not comparable on that input, and where nothing moves it says that too.

NFR3: The existing exit classes hold: `0` thresholds met, `1` measured quality failure, `2` an environment that could not measure anything. An upgrade fault must not read as a measured quality regression.

NFR4: No TEA-side workaround for an `eval-quality` limitation. A gap found during adoption becomes a pull request against `~/opensource/bmad-eval-quality` and a release, and TEA consumes the released version. This binds where TEA would otherwise restate something the package knows. It does not bind ordinary artifact authoring: writing a stamp into a generator is what every consumer does.

NFR5: Diff size is measured and reported before a sweeping change lands. This is an explicit acceptance criterion on every story whose diff could exceed its intent, not a general aspiration.

NFR6: Any `eval-quality` release cut for this work passes that repository's `npm run validate` and carries a CHANGELOG entry in its established form.

NFR7: A story's acceptance criteria are mechanically checkable. Where a judgment is unavoidable, the story names the fixture, rubric or registry that decides it.

NFR8: A capability is either adopted or explicitly declined with the reason recorded on the page that describes it.

NFR9: Any gate that executes content rather than reading it runs isolated. Three do: the fenced documentation commands, the generated acceptance tests, and the generated scaffold's install and smoke run. Each runs in a disposable non-privileged workspace with no credentials in its environment, no network beyond what the step declares, and bounded CPU and wall clock, and the workspace is removed on both the passing and the throwing path. The isolation is proven before the gate is enabled, not after.

### Additional Requirements

- `eval-quality` is a devDependency resolved through `require.resolve('eval-quality/package.json')`. `test/test-contracts.js:174` prints a yellow "skipped" and returns `0` when it is absent, so a broken install reads as a pass.
- Both TEA contracts already carry two sensitivity witnesses each, so that capability needs verification rather than first-time adoption.
- TEA's contracts declare the `cli` interface kind only, over `artifact`, `text` and `absent` response descriptors.
- `test/contracts/expected-status.json` records `{"status": "compiles"}` for all 10 contracts and no failure code, so there is no code in that file to check against a registry today.
- The conformance arms this work adopts were already available on the installed 1.4.0 (`corpus` 6, `clock` 6, `file-system` 12), so nothing about them is gated on the pin move. `environment-probe` 19 was counted here too until FR21 was withdrawn; it is the api arm and TEA adopts no HTTP port, so it is not among them.
- `schemas/artifact-reference.schema.json` carries no `schemaVersion` by design. It is a reference shape embedded in other artifacts, the exemption is asserted by a test against the registry's `carriesLineage` flag, and no story may add a version to it.
- Cross-repository authorization is granted: pull requests and releases against `~/opensource/bmad-eval-quality` are in scope.

**Swept and excluded, with the reason:**

- `tea-test-review` declares no `eval-quality` dependency, so the companion action needs no upgrade.
- `PrivateArtifactManifest` and `--private-manifest` stay out. The channel resolves an artifact by digest without the bytes travelling, and TEA's evidence under `test/replay/` does not need it while TEA publishes no private artifacts. Revisit if evidence ever has to leave the repository.
- `bench:digest` has no TEA subject worth defending.
- `.github/workflows/tea-test-review.yaml:106`'s `continue-on-error` is benign: the job is `if: always()` and the next step reads and reports the outcome.
- Nothing under `test/` is skipped or quarantined. Every `test.skip` hit is fixture text inside `test/test-enforce-hook.js` exercising the hook's own C1 rule.

### FR Coverage Map

| FR | Epic | Covered by |
| --- | --- | --- |
| FR1 | Epic 1 | The pin moves to 3.0.0 |
| FR2 | Epic 1 | `permittedEnvironmentKeys` on both policy sites |
| FR3 | Epic 1 | Keys match `EnvironmentKeyName`, no `PATH` |
| FR4 | Epic 1 | 31 probes stamped 5, ninth channel added |
| FR5 | Epic 1 | 10 contracts stamped 5 |
| FR6 | Epic 1 | `preflight` and `score` clear every probe |
| FR7 | Epic 1 | `unauthorizedEnvironmentKeyRequest`, arm reports 16 |
| FR8 | Epic 1 | Totality across the widened unions |
| FR9 | Epic 2 | Schema-version constants exported |
| FR10 | Epic 2 | `compareDominance` exported |
| FR11 | Epic 2 | The three package-stamped artifacts get constants |
| FR12 | Epic 2 | TEA validates the stamp against the constant |
| FR13 | Epic 2 | `SCHEMA_VERSIONS` derived; two wrong entries fixed |
| FR14 | Epic 2 | `eval-contract` and `scoring-policy` validated |
| FR15 | Epic 2 | The eight repo-local gates ship to consumers |
| FR16 | Epic 2 | Published, no local checkout on `main` |
| FR17 | Epic 2 | `VERSION` matches `package.json` |
| FR18 | Epic 3 | `createLocalCorpusAdapter` adopted and certified |
| FR19 | Epic 3 | `createNodeFileSystemAdapter` adopted and certified |
| FR20 | Epic 3 | `createSystemClockAdapter` adopted and certified |
| FR21 | Epic 3 | Withdrawn: the api arm has no adapter and no subject in TEA |
| FR22 | Epic 3 | Each arm reads its count from the package, and a missing entry names the arm |
| FR23 | Epic 4 | Published counts computed from source |
| FR24 | Epic 4 | Published prose claims held |
| FR25 | Epic 4 | 23 files of fenced commands executed |
| FR26 | Epic 4 | `instanceof RuntimeFault` narrowing |
| FR27 | Epic 4 | Five exported registries asserted |
| FR28 | Epic 4 | `DiagnosticSink` replaces stderr parsing |
| FR29 | Epic 4 | `strictPromotable` decided explicitly |
| FR30 | Epic 5 | `compareDominance` wired for drift |
| FR31 | Epic 4 | Lockfile age, licences, `.npmrc` floor |
| FR32 | Epic 4 | Dependency direction over the JavaScript trees |
| FR33 | Epic 4 | Package boundary held |
| FR34 | Epic 4 | Lineage ownership held |
| FR35 | Epic 4 | Publish authorization guarded |
| FR36 | Epic 4 | `_bmad-output` read by a gate |
| FR37 | Epic 4 | Suppression allowlists justified or removed |
| FR38 | Epic 4 | Coverage enforced or tooling removed |
| FR39 | Epic 4 | CI coverage extended past the `test` chain |
| FR56 | Epic 4 | TEA fails closed on an unresolvable `eval-quality` |
| FR40 | Epic 1 | Published corpus compiled as the pin-move smoke test |
| FR41 | Epic 5 | `eval:all` run live, exit class recorded |
| FR42 | Epic 5 | Roadmap states the shipped baseline |
| FR43 | Epic 5 | Adoption guide describes 3.0.0 |
| FR44 | Epic 5 | Command-adapter page updated and its three gaps decided |
| FR45 | Epic 5 | TEA `CHANGELOG.md` entry |
| FR46 | Epic 5 | TEA cuts its release |
| FR47 | Epic 6 | `bmad-tea` suite |
| FR48 | Epic 6 | `test-design` suite |
| FR49 | Epic 6 | `nfr` suite |
| FR50 | Epic 6 | `ci` suite |
| FR51 | Epic 6 | `atdd` suite |
| FR52 | Epic 6 | `automate` suite |
| FR53 | Epic 6 | `framework` suite |
| FR54 | Epic 6 | `teach-me-testing` suite |
| FR55 | Epic 6 | The manifest `deferred` array is empty |

Every FR from FR1 to FR56 is mapped, and no epic requires a later epic to function.

## Epic List

### Epic 1: TEA runs on `eval-quality` 3.0.0

A TEA maintainer runs the full gate against the current package and it is green. Nothing in this epic waits on an upstream change: 3.0.0 is already published, and every gap it closes is on TEA's side.

**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR40

### Epic 2: The package publishes what its consumers need, and TEA derives from it

A consumer reads the schema stamp it must write, compares two results, and runs the package's own gates, instead of restating any of it. Ends with a published release and TEA consuming it.

**FRs covered:** FR9, FR10, FR11, FR12, FR13, FR14, FR15, FR16, FR17

### Epic 3: Every port TEA hand-rolls runs on the shipped adapter

The corpus digesting, file access and timing TEA performs by hand run through `eval-quality`'s reference adapters and are proven by its conformance suite.

One arm is out of scope and the reason is recorded rather than left as a silence. `runEnvironmentProbePortConformance` is the `api` arm over HTTP, the package ships no HTTP adapter, and TEA authorizes no HTTP target, so the arm has no subject. FR21 is withdrawn above with the evidence. The arms this epic does adopt, `corpus`, `clock` and `file-system`, each have a shipped adapter behind them. Four arms run where one runs today: the command-line arm TEA already has, plus the corpus, clock and file-system arms.

**FRs covered:** FR18, FR19, FR20, FR21 (withdrawn), FR22

### Epic 4: TEA's claims, codes and supply chain are machine-held

Nothing TEA publishes or depends on is trusted because someone remembered to check it. Counts, prose, fenced commands, fault types, vocabularies, lockfiles, layering, package boundary, publish authorization, lint exclusions and coverage are each held by a gate that fails.

**FRs covered:** FR23, FR24, FR25, FR26, FR27, FR28, FR29, FR31, FR32, FR33, FR34, FR35, FR36, FR37, FR38, FR39, FR56

### Epic 5: Drift is measured and the upgrade is proven live

Drift between two runs is measurable, the suite has been run live with its result recorded, the documentation states the baseline that ships, and TEA releases.

**FRs covered:** FR30, FR41, FR42, FR43, FR44, FR45, FR46

### Epic 6: Every TEA skill is covered by a behavioral suite

Eight skills are declared deferred in `test/evals/suite-manifest.json`, each with an owner and a statement of missing evidence, and `test/eval-all.js` exits `2` when a skill is in neither a suite nor that list. The declaration is honest and it is still deferred work. This epic closes it.

**FRs covered:** FR47 through FR55

## Epic Dependencies

Epic 1 depends on nothing and unblocks Epics 3 and 4. Epic 2 depends on Epic 1 only for the pin. Epic 3 depends on Epic 1. Epic 4's Stories 4.1 through 4.3 depend on Epic 2's release, and its remaining stories depend on nothing. Epic 5 depends on Epic 2 for `compareDominance` and on Epics 1, 3 and 4 for what it documents. Epic 6's suite stories depend on nothing in Epics 1 through 5; only its closing story does.

Epic 2 was deliberately moved off the critical path. An earlier draft put the upstream work first and serialized everything behind an npm release. Only the derivation stories genuinely need it, so Epic 1 now lands against the already-published 3.0.0 and the release leaves the critical path of everything else.

Every epic carries two standing items in its definition of done, and each is written as an acceptance criterion on that epic's closing story rather than left implicit: any new npm script gets its `.github/workflows/quality.yaml` step in the same change, and the full gate passes before the epic closes.

## Epic Sizing

Sizing was measured where it could be. The largest item in an earlier draft, hand-implementing three ports, collapsed when the review found the package already ships adapters for all three.

| Epic | Size | What drives it |
| --- | --- | --- |
| Epic 1 | Small | Pin, two policy sites, 31 stamps and 21 channel additions by generator, one conformance scenario, one totality test. |
| Epic 2 | Medium | Seven small upstream exports and constants, one release, then three TEA-side derivation stories. Story 2.5, publishing eight repo-local gates, is the one genuine design item. |
| Epic 3 | Small to medium | Three adapters are imports rather than implementations. The cost is the cutover of TEA's existing call sites, which is why the file-system cutover is split per harness. |
| Epic 4 | Largest of Epics 1 to 5 | Sixteen requirements, each a gate. Several are small; FR37 and FR38 have unknowable size until their first run reports, so both are split into report-then-fix. |
| Epic 5 | Medium | Documentation, one live run, one release, and wiring the dominance comparison. |
| Epic 6 | Largest overall | Eight behavioral suites, each needing fixtures, seeded defects and clean controls. |

The story count is high because each gate, adapter and suite is its own story. That keeps every story reviewable in one session and every failure attributable to one change.

## Epic 1: TEA runs on `eval-quality` 3.0.0

A TEA maintainer runs the full gate against the current package and it is green. Nothing here waits on an upstream change.

**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR40

### Story 1.1: Prove the pin move against the package's own corpus

As a TEA maintainer,
I want the new package version proven against its own published corpus before I touch a single TEA artifact,
So that a failure during migration is attributable to TEA rather than to the upgrade.

**Acceptance Criteria:**

**Given** `eval-quality/corpus/*` is a published subpath whose `corpus/dev/index.json` carries 27 entries with a `sha256:` digest each: 25 contracts, of which 24 sit under `contracts/` and the twenty-fifth is the compile-and-seal example, that example's sealed brief, and the corpus README
**When** a smoke check compiles every published contract against 3.0.0
**Then** each contract's compile status matches what the corpus declares
**And** the sealed brief produced by the example matches the shipped bytes
**And** the check runs as its own npm script with its own `quality.yaml` step

**Given** the smoke check passes
**When** the pin at `package.json:140` moves from `1.4.0` to `3.0.0`
**Then** `npm ci` installs it and `require.resolve('eval-quality/package.json')` resolves 3.0.0

### Story 1.2: Bound the environment channel on every command policy

As a TEA maintainer,
I want each command policy to declare which environment keys its probes may carry,
So that the adapter is default-deny on every channel and the operator's mapping decides what a spawned process receives.

**Acceptance Criteria:**

**Given** `CommandTargetPolicy.permittedEnvironmentKeys` is required with no default at `src/core/schemas/probe-policy.ts:84`
**When** TEA builds a policy at `test/lib/probe-targets.js:186` and at `test/test-probe-conformance.js:139`
**Then** both declare `permittedEnvironmentKeys`, naming only the keys their contracts declare or `[]` to carry none
**And** neither attempts `PATH`, which the schema refuses by refine and the adapter refuses again

**Given** TEA declares an environment key on a request
**When** the request reaches the adapter
**Then** the key matches `EnvironmentKeyName`
**And** a key that does not match fails at the port boundary rather than reaching a spawned process

### Story 1.3: Migrate all 31 probes and 10 contracts

As a TEA maintainer,
I want every probe and contract stamped at the version `eval-quality` reads,
So that `preflight` and `score` run instead of faulting at exit `5`.

**Measured before this story was sized.** TEA has 31 probes across 10 files, not the 15 across 2 an earlier draft recorded: `test-review.probes.json` 11, `trace.probes.json` 4, and 8 files under `test/probes/fragment-selection/` carrying 2 each. All are stamped 3. There are 10 contracts, all stamped 4, of which 8 are under `test/contracts/fragment-selection/`. Measured against 3.0.0's published schemas with Ajv: all 31 probes and all 10 contracts validate clean once each of the 21 `inputBinding` selectors gains the ninth channel as `"arguments": null`. Unedited, 21 of 31 probes fail. The stamp bump changes no validation verdict, because no published schema pins the version; it is what `preflight` and `score` read at runtime.

**Acceptance Criteria:**

**Given** all 31 probes carry `schemaVersion: 3` and 21 `inputBinding` selectors carry eight channels
**When** they are migrated
**Then** every probe carries `5` and every `inputBinding` carries `"arguments": null` as its ninth channel
**And** all 31 validate against the published `probe.schema.json` with Ajv
**And** the 8 fragment-selection probe files are migrated with the same generator change as the two top-level files, not by hand

**Given** all 10 contracts carry `schemaVersion: 4`
**When** they are migrated
**Then** every contract carries `5` and needs no other edit
**And** `test:contracts` reports `compiles` for all 10, matching `test/contracts/expected-status.json`

**Given** `tools/generate-probes.js` and `tools/generate-contracts.js` emit the stamps
**When** `test:probe-sources` and `test:contract-sources` run in check mode
**Then** both pass, so a regeneration reproduces the migrated bytes
**And** the diff size is reported before the change lands, since it spans 20 files

**Given** the migration is complete
**When** `npm run eval:preflight` and `npm run test:probe-corpus` run
**Then** neither raises `schema-version-mismatch` and both exit `0`

### Story 1.4: Complete the command-probe conformance arm

As a TEA maintainer,
I want TEA's adapter to satisfy every assertion the package makes about a command-line probe,
So that the environment channel's default-deny is proven rather than assumed.

**Acceptance Criteria:**

**Given** `unauthorizedEnvironmentKeyRequest` is a required field of `CommandProbeSubject` at `src/testing/probe-conformance.ts:472` and TEA's subject does not declare it
**When** the subject gains it
**Then** that request is authorized in every other respect and declares exactly one environment key its authorization omits
**And** `runCommandLineProbeConformance` reports the 16 outcomes `CONFORMANCE_OUTCOME_COUNTS['command-probe']` names, all passing

**Given** the refusal scenario runs
**When** the adapter denies the request
**Then** the denial happens with zero underlying mechanism calls and no process is spawned

### Story 1.5: Prove totality across the widened port unions

As a TEA maintainer,
I want every branch TEA takes over a port message to stay total,
So that a member added upstream fails TEA's gate rather than falling through at runtime.

**Acceptance Criteria:**

**Given** `ProbeRequest` and `ProbeObservation` are each three-member unions and `ConformancePort` has six members
**When** TEA branches on a request kind, an observation shape or a port name
**Then** every branch handles the members the installed package declares
**And** an unhandled member raises a named error rather than returning a default

**Given** TEA is CommonJS and consumes an ESM package with no typechecker
**When** totality is asserted
**Then** it is asserted by an executed test over the package's own exported member lists rather than by review
**And** that test fails if a future release adds a member TEA does not handle

**Given** Epic 1 is otherwise complete
**When** `npm test` and every `quality.yaml` job run
**Then** all pass, and every new script added in this epic has its own workflow step

## Epic 2: The package publishes what its consumers need, and TEA derives from it

A consumer reads the schema stamp it must write, compares two results, and runs the package's own gates, instead of restating any of it.

**FRs covered:** FR9, FR10, FR11, FR12, FR13, FR14, FR15, FR16, FR17

### Story 2.1: Export the schema-version constants and the dominance comparison

As a consumer of `eval-quality`,
I want the package to export the versions it enforces and the comparison it defines,
So that I read them from the package instead of copying them into my own source or being unable to reach them at all.

**Acceptance Criteria:**

**Given** `PROBE_SCHEMA_VERSION` (`probe.ts:90`) and `EVAL_CONTRACT_SCHEMA_VERSION` (`eval-contract.ts:161`) are reachable from none of the four barrels
**When** they are exported
**Then** both resolve from a published entry point
**And** their declared type is the literal integer rather than `number`, so a consumer comparing against them narrows correctly

**Given** `compareDominance` is declared at `src/core/score/strength.ts:254`, is absent from the root barrel's 19 exports, and cannot be deep-imported because the exports map has no wildcard
**When** it is exported
**Then** it resolves from a published entry point along with `ComparableResult`, `DominanceRelationValue` and `Severity`

**Given** the new exports exist
**When** `npm run validate` runs in `eval-quality`
**Then** the barrel test covering the public surface asserts each new name is present

### Story 2.2: Name the three versions the package stamps

As a maintainer of `eval-quality`,
I want each artifact this package stamps to carry its version as a named constant,
So that the number cannot disagree with itself between the writer and the reader.

**Acceptance Criteria:**

**Given** the package stamps exactly three artifacts with a bare literal: `sealed-evaluator-brief` at `src/core/seal/seal.ts:98`, `evidence-artifact` at `src/core/emit/emit.ts:110`, `preflight-verdict` at `src/core/preflight/reduce.ts:475`
**When** each is replaced by a named constant
**Then** the writer reads the constant and a grep for a bare `schemaVersion: <integer>` assignment under `src/` returns nothing
**And** each constant is exported alongside those from Story 2.1

**Given** `sealed-run-record` is caller-produced, so the package stamps it nowhere while its reader accepts version 6 (`sealed-run-record.ts:429`)
**When** the version a caller must write is published
**Then** `SEALED_RUN_RECORD_SCHEMA_VERSION` is exported from the same entry point as the others
**And** it is derived from the reader rather than restated beside it, so the two cannot drift
**And** the same treatment is applied to every caller-produced artifact whose reader pins a version, so FR13 resolves for all five of TEA's entries without a literal

**Given** `schemas/artifact-reference.schema.json` deliberately carries no `schemaVersion`, an exemption asserted by a test against the registry's `carriesLineage` flag
**When** this story runs
**Then** that artifact is left alone and the exemption test still passes

**Given** the caller-produced artifacts the package only validates carry their versions in `tests/schemas/fixtures/artifact-fixtures.ts` alone
**When** this story runs
**Then** those are out of scope and the reason is recorded

### Story 2.3: Make `VERSION` tell the truth

As a consumer reading the package's own version export,
I want it to match the published package,
So that a version check against it is not silently wrong.

**Acceptance Criteria:**

**Given** `dist/index.d.ts` declares `VERSION = "2.0.0"` while `package.json` reads `3.0.0`
**When** the export is corrected
**Then** it is derived from `package.json` rather than restated
**And** a gate fails when the two disagree

### Story 2.4: Release the package and verify it on npm

As a consumer waiting on these changes,
I want them in a published version,
So that I depend on a release rather than on someone's local checkout.

**Acceptance Criteria:**

**Given** Stories 2.1 through 2.3 are merged
**When** the release is prepared
**Then** `CHANGELOG.md` carries an entry naming each change
**And** the bump is `minor`, since every change is additive or a correction, and the published version confirms it

**Given** the release workflow has run
**When** the published version is checked directly against the npm registry with a bounded retry
**Then** the new version is present and installable
**And** a registry lag that made the workflow report a failure exits differently from a real publish failure, so the two are told apart before the release is called done

**Given** `eval-quality`'s own gate
**When** the release is cut
**Then** `npm run validate` passed on the released tree

### Story 2.5: Publish the eight repo-local gates as a consumable surface

As a maintainer of a repository that depends on `eval-quality`,
I want to run the package's gates against my own repository,
So that my pages, commands, lockfiles, layering, boundary and lineage are held by the same mechanism rather than by copies I keep in sync.

**Acceptance Criteria:**

**Given** `files` is `["dist","schemas","corpus","README.md","LICENSE"]`, so `check-doc-counts.ts`, `check-doc-claims.ts`, `check-doc-invocations.mjs`, `audit-lockfile-age.mjs`, `check-licenses.mjs`, `check-dependency-direction.ts`, `check-package-boundary.ts` and `check-lineage-ownership.ts` reach no consumer
**When** they are published
**Then** a consumer that has only installed the package invokes each against its own repository
**And** each reads its configuration from a file in the consumer's repository, whose format and location the story specifies concretely
**And** none rewrites any file it reads

**Given** a fixture consumer repository with its own configuration
**When** each gate runs against it
**Then** the gate passes on the compliant fixture and fails on a fixture seeded with the defect that gate exists to catch, one seeded fixture per gate

**Given** a consumer supplies no configuration for a gate
**When** that gate runs
**Then** it fails with a message naming the missing configuration rather than falling back to `eval-quality`'s own

### Story 2.6: Derive TEA's artifact versions from the package

As a TEA maintainer,
I want TEA to read each artifact's expected version from `eval-quality`,
So that the next bump fails TEA's gate loudly instead of passing until a runtime fault finds it.

**Acceptance Criteria:**

**Given** `test/lib/eval-quality-inputs.js:48` hardcodes a five-entry `SCHEMA_VERSIONS` table whose comment concedes the versions are "stated rather than derived"
**When** the table is replaced by reads of the exported constants
**Then** the comment describing the stated shape is removed rather than left describing something that no longer exists

**Given** two entries are wrong for 3.0.0
**When** the table is derived
**Then** `probe` resolves to 5, not 3
**And** `sealedRunRecord` resolves to 6, not 3, read from the constant Story 2.2 exports, so the record TEA builds at `eval-quality-inputs.js:300` stops emitting a version-3 artifact against a build that reads 6

**Given** a version TEA writes and a version the installed package reads disagree
**When** the derived table is exercised
**Then** a test covers that mismatch path explicitly, rather than waiting for a live run to find it
**And** the `probe` and `scoringPolicy` entries, which no code reads, are removed rather than derived

**Given** a future release moves an artifact version
**When** TEA installs it and runs `npm test`
**Then** the mismatch is reported and names the artifact and both versions

### Story 2.7: Validate the stamp and the two unchecked artifact kinds

As a TEA maintainer,
I want a wrong stamp caught by validation rather than by a runtime fault at exit `5`,
So that the failure names the field instead of arriving from inside a pipeline stage.

**Acceptance Criteria:**

**Given** the published schemas declare `schemaVersion` as a bare integer by a documented decision, because a `const` "exports as `{"type":"number","const":1}`, losing `integer` for a non-TypeScript consumer" and turns a mismatch into an anonymous parse failure
**When** TEA validates an artifact
**Then** TEA compares the artifact's `schemaVersion` against the constant the package exports, as a check beside the Ajv pass
**And** a mismatch fails naming the artifact, the found version and the expected version
**And** the published schemas are left unchanged

**Given** `validateArtifact` at `test/lib/eval-quality-inputs.js:98` covers seven of the twelve published artifact kinds
**When** coverage is extended
**Then** `eval-contract` and `scoring-policy` are validated against their published schemas
**And** TEA's 10 contracts pass the Ajv check as well as the CLI's `compile` exit code, so the artifact class Story 1.3 restamped is no longer the one Ajv never sees

**Given** Epic 2 is otherwise complete
**When** `npm test` and every `quality.yaml` job run
**Then** all pass, and every new script has its own workflow step

## Epic 3: Every port TEA hand-rolls runs on the shipped adapter

The corpus digesting, file access and timing TEA performs by hand run through `eval-quality`'s reference adapters and are proven by its conformance suite.

An earlier draft had TEA implement three ports. The package already exports `createLocalCorpusAdapter`, `createNodeFileSystemAdapter` and `createSystemClockAdapter` from `eval-quality/adapters`, beside the command-line adapter TEA already consumes. The work is adoption and cutover, and the cutover is what carries the risk.

**FRs covered:** FR18, FR19, FR20, FR21 (withdrawn), FR22

### Story 3.1: Hold every conformance count to the package

As a TEA maintainer,
I want every conformance count TEA asserts to come from the package,
So that an arm whose assertion list moves upstream fails here instead of drifting.

This story was `Run the generic environment-probe conformance arm` and half of it was withdrawn. FR21's premise was wrong and the record of why is in the requirements inventory above. What survives is FR22, which stands on its own: it holds the one arm TEA runs today and every arm this epic's remaining stories adopt.

**Acceptance Criteria:**

**Given** `test/test-probe-conformance.js` reads `CONFORMANCE_OUTCOME_COUNTS['command-probe']` by subscript, so a key the package stopped publishing yields an undefined expected count and a message naming a count rather than a missing arm
**When** the count is read through one shared accessor instead
**Then** a missing entry fails with the arm named and with the arms the package does publish
**And** the accessor is what every arm TEA adds later uses, so the rule holds without being restated per arm

**Given** `test/test-port-totality.js` asserts that a running arm's check reads its count from the registry on a live source line
**When** the accessor replaces the subscript
**Then** that assertion still holds, against the accessor's own call shape

**Given** a gate nobody has seen fire is a gate nobody has tested
**When** the accessor is added
**Then** a check drives it with an arm the package does not publish and asserts the arm is named in the failure

### Story 3.2: Resolve the corpus through the shipped adapter

As a TEA maintainer,
I want corpus resolution to run through `createLocalCorpusAdapter`,
So that the digest TEA attests comes from a certified implementation rather than from three hand-written helpers.

**Acceptance Criteria:**

**Given** `createLocalCorpusAdapter` is exported from `eval-quality/adapters` and referenced nowhere in TEA
**When** it is adopted
**Then** `runCorpusPortConformance` reports the count the package names, all passing
**And** the arm is added before any TEA call site changes, so this criterion is satisfiable with no diff outside one new file

**Given** TEA digests corpora by hand at `test/eval-trace.js:1146`, `test/lib/probe-scoring.js:663` and `tools/generate-probes.js:217`
**When** those three call sites are cut over
**Then** every corpus digest TEA computes flows through the adapter
**And** the diff size is reported before the cutover lands

**Given** the digest mechanism changed
**When** the digest is recomputed for an existing suite
**Then** the record states whether the attested value moved
**And** if it moved, the record states that scores computed before and after are not comparable on that input, and the replay corpus and stored expected artifacts are re-attested in this story rather than left inconsistent

### Story 3.3: Read the clock through the shipped adapter

As a TEA maintainer,
I want elapsed time measured through `createSystemClockAdapter`,
So that timing is injectable and its conformance is proven rather than read from the wall clock in each harness.

**Acceptance Criteria:**

**Given** `createSystemClockAdapter` is exported and unused by TEA
**When** it is adopted
**Then** `runClockPortConformance` reports the count the package names, all passing

**Given** TEA measures durations directly in its harnesses
**When** those readings are cut over
**Then** every duration TEA reports in its `--json` output comes from the port

### Story 3.4: Certify the file-system adapter

As a TEA maintainer,
I want `createNodeFileSystemAdapter` adopted and proven,
So that the port is available and certified before any call site depends on it.

**Acceptance Criteria:**

**Given** `createNodeFileSystemAdapter` is exported and unused by TEA
**When** it is adopted
**Then** `runFileSystemPortConformance` reports the count the package names, all passing
**And** this story adds no diff outside one new file and its workflow step, so FR19's conformance clause is satisfied before any cutover begins

### Story 3.5: Cut the trace harness over to the file-system port

As a TEA maintainer,
I want `test/eval-trace.js` reading and writing through the port,
So that the largest harness is converted on its own and reviewable on its own.

**Acceptance Criteria:**

**Given** `test/eval-trace.js` is 2,502 lines carrying 36 direct `fs` calls, and the port's dynamic import makes every read asynchronous so the conversion cascades up each call chain
**When** the harness is cut over
**Then** the story names the exact call sites before work begins, and the diff size is reported before it lands
**And** every temporary workspace is still removed on both the passing and the throwing path

**Given** a harness reads an artifact that is absent, empty or over its cap
**When** the read goes through the port
**Then** the outcome is the port's declared shape rather than an exception TEA interprets
**And** absent and empty are satisfied by the port, while over its cap is satisfied by there being no cap to exceed: `FileReadRequest` is `{path}` and `FileReadResponse` is `{path, bytes}`, so the port declares no maximum and no truncation, and the capped read is the command-line adapter's `maxOutputBytes` over an artifact read back from a spawned run, which already goes through that port

### Story 3.6: Cut the remaining harnesses over to the file-system port

As a TEA maintainer,
I want the review, fragment-selection and probe harnesses converted,
So that no eval harness reaches the file system directly.

**Acceptance Criteria:**

**Given** Story 3.5 converted the trace harness and established the call pattern
**When** `test/eval-test-review.js`, `test/eval-fragment-selection.js`, `test/lib/probe-scoring.js` and `test/lib/probe-targets.js` are converted
**Then** each is a separate commit with its own reported diff size
**And** no direct `fs` call remains in the eval harnesses

**Given** two shared readers sit under `test/lib/` and belong to no harness, so Story 3.5 found them and assigned them here rather than converting them
**When** this story runs
**Then** `writeSuiteResult` at `test/lib/eval-record.js:299` and `loadSuiteManifest` at `test/lib/suite-manifest.js:32` read and write through the port
**And** they are converted here rather than in Story 3.5 because every harness that calls them becomes asynchronous with them, and those call sites are this story's

**Given** the file-system port declares `readFile` and `writeFile` and nothing else
**When** a call site this story reaches is an existence check, a directory walk, or a directory lifecycle operation
**Then** it stays on `fs` and the record says which calls those are and that the port cannot express them
**And** `workingTreeState` at `test/lib/runner-capabilities.js:38` is one of them, a repository walk that is the largest file-access surface these harnesses touch and is invisible at its call site
**And** `missingCredential` at `test/eval-test-review.js:241` is declined rather than converted, because it reads outside the repository in the user's home and AD-18 keeps credential material out of a declaration, so routing a credential probe through a port whose requests are logged is the wrong direction

**Given** Epic 3 is otherwise complete
**When** `npm test` and every `quality.yaml` job run
**Then** all pass, five conformance arms are reported where one was reported before, and every new script has its own workflow step

## Epic 4: TEA's claims, codes and supply chain are machine-held

Nothing TEA publishes or depends on is trusted because someone remembered to check it.

FR39 is satisfied across this epic rather than by one story: `tools/validate-ci-coverage.js` enforces only that scripts in the `npm test` chain run in CI and states "the reverse is allowed", so Story 4.8 extends it to every script and each other story adds its own workflow step.

**FRs covered:** FR23, FR24, FR25, FR26, FR27, FR28, FR29, FR31, FR32, FR33, FR34, FR35, FR36, FR37, FR38, FR39, FR56

### Story 4.1: Hold every published count against its source

As a reader of TEA's documentation,
I want every number on a published page computed from what it describes,
So that a page cannot promise a corpus size or a run count the repository contradicts.

**Acceptance Criteria:**

**Given** the count gate published in Story 2.5 is installable and Story 2.4 released it
**When** it is configured over TEA's `docs/`
**Then** a registry names each held sentence and the source that computes its number
**And** the gate fails when a registered sentence no longer matches its page, and separately when a registered source produces no match, so an unmatched pattern is a failure rather than a silent pass

**Given** `docs/explanation/eval-quality-roadmap.md` states "48 fragment selections, 3 complete reviews, and 4 complete traces", which is correct today and held by nothing
**When** the gate runs
**Then** each number is computed from the suite that produces it and compared with the page

### Story 4.2: Hold every published prose claim against its artifact

As a reader of TEA's documentation,
I want a claim about the code to resolve against the code,
So that a renamed symbol or a stale sentence fails the build instead of misleading a reader.

**Acceptance Criteria:**

**Given** the claim gate published in Story 2.5 is installable
**When** it is configured over TEA's `docs/` with TEA's own sources
**Then** it holds citations to a path and line, backticked symbols, transcribed lists, named failure codes and worked JSON blocks

**Given** a claim naming a version, a date, or a "currently", "not yet" or "as of" phrase
**When** the gate runs
**Then** that claim is registered with the predicate that settles it, and an unregistered claim of that shape fails

**Given** a claim no artifact can decide
**When** it is recorded as a human reading
**Then** the record names the commit it was made against and the file it concerns
**And** the gate fails when that file changes after the recorded commit, so the escape hatch cannot become the default path

### Story 4.3: Execute the fenced commands in the documentation

As a reader following TEA's documentation,
I want the commands on the page to be the commands that work,
So that a renamed script or a changed flag is caught by the build rather than by me.

**Acceptance Criteria:**

**Given** 23 files carry bash fences, 21 under `docs/` plus `README.md` and `CONTRIBUTING.md`, and nothing executes them
**When** the invocation gate from Story 2.5 is configured
**Then** each block is judged against its declared exit code
**And** an illustrative block carries an explicit marker whose syntax this story specifies, and an unmarked block that does not run fails

**Given** a documented command names a script `package.json` does not define
**When** the gate runs
**Then** it fails naming the page and the command

**Given** this gate executes content that a page author wrote
**When** it runs
**Then** it runs under NFR9's isolation, and the isolation is proven before the gate is enabled

### Story 4.4: Narrow faults by type and assert every vocabulary

As a TEA maintainer,
I want TEA to recognize package faults and vocabularies through the package's own exports,
So that a renamed code or a stray `ENOENT` cannot pass as something it is not.

**Acceptance Criteria:**

**Given** `test/lib/probe-targets.js:220` narrows faults on `error?.code`, so any Node error carrying a `code` such as `ENOENT` or `EACCES` walks the same chain and lands on `environment-transport`
**When** narrowing is rewritten
**Then** it uses `instanceof RuntimeFault` and `instanceof StructuralFailure`
**And** a Node error carrying a `code` is classified as an unexpected error rather than as a transport fault, proven by a test that throws one

**Given** no TEA source file references `FAILURE_CODES`, `RUNTIME_FAULT_CODES`, `QUALIFICATION_FAILURES`, `VERDICTS` or `EVALUATOR_RECOMMENDATIONS`
**When** TEA's recognized vocabularies are asserted
**Then** every code and verdict TEA recognizes is checked for membership in the matching exported registry
**And** a code recovered by `test/test-contracts.js:114` that is in no registry fails rather than becoming the string `unknown`

**Given** `test/contracts/expected-status.json` records `{"status": "compiles"}` for all 10 contracts and no failure code
**When** this story runs
**Then** the registry check applies to codes recovered at runtime, and the story records that the fixture carries no code to check today

**Given** `test/test-contracts.js:174` prints a skip notice and returns `0` when `require.resolve('eval-quality/package.json')` fails, leaving 10 contracts unchecked
**When** the resolution path is made fail-closed
**Then** an unresolvable `eval-quality` exits non-zero and names how many contracts went unchecked
**And** a test drives the unresolvable path and asserts the non-zero exit, so the behavior is pinned rather than described

### Story 4.5: Read diagnostics from the sink and decide the strict rung

As a TEA maintainer,
I want structured diagnostics and an explicit CONCERNS-promotion decision,
So that TEA stops reconstructing from stderr and stops leaving a published verdict rung undecided.

**Acceptance Criteria:**

**Given** `RunPreflightOptions.sink` and `PreflightFromObservationsOptions.sink` are exported and unused by TEA
**When** TEA passes a `DiagnosticSink`
**Then** the reason a leg or an oracle resolved as it did is read from the sink
**And** `test/test-contracts.js`'s stderr regex is removed rather than left beside the structured channel

**Given** `src/cli/exit-codes.ts` promotes a CONCERNS verdict to exit `1` under `--strict`, except a CONCERNS whose only firing conditions are evidence conditions, read from `LadderResolution.strictPromotable`
**When** TEA scores in process through `runScore`
**Then** TEA reads `strictPromotable` and makes the promotion decision explicitly
**And** the decision is recorded on the page describing TEA's exit classes, since NFR3 fixes exit `1` as the same rung

### Story 4.6: Hold the supply chain

As a TEA maintainer,
I want both lockfiles audited and a resolution floor set,
So that TEA is held to the standard TEA asks of the repositories it reviews.

**Acceptance Criteria:**

**Given** `package-lock.json` and `website/package-lock.json` have no age or licence gate, and `.npmrc` is one line
**When** the audit from Story 2.5 is configured
**Then** the age threshold and the SPDX licence allowlist are both named explicitly in TEA's configuration
**And** `.npmrc` sets a `min-release-age` floor, and the fail-closed audit stays beside it because that setting fails open on an already-committed lockfile

**Given** the configuration is written
**When** it is checked
**Then** it contains no version literal that would have to be maintained by hand

### Story 4.7: Hold layering, boundary and lineage

As a TEA maintainer,
I want the import direction, the package boundary and lineage ownership enforced,
So that a violation fails the build rather than surviving review.

**Acceptance Criteria:**

**Given** `src/` holds 725 files of which one is JavaScript, so a gate over it as a whole would be vacuous
**When** the direction gate from Story 2.5 is configured
**Then** it covers `cli/`, `tools/`, `test/` and `src/**/*.cjs`, and the declared edges are written down
**And** the gate reports violations without failing on its first run, so the size of the fix is known before it starts

**Given** the first run reported a violation count
**When** the violations are fixed
**Then** the gate is switched to failing, and the fix is its own commit with its diff size reported

**Given** TEA publishes to npm with three `bin` entries and ships `src/workflows/`
**When** the boundary gate runs
**Then** nothing in the published tarball references `test/`, `_bmad-output/` or any dev-only path

**Given** `tools/generate-probes.js` and `tools/generate-contracts.js` write fields several readers consume
**When** the lineage gate runs
**Then** ownership drift between writer and readers fails

**Given** TEA has no publish lifecycle hook, so a laptop holding a valid npm token can publish outside the release workflow
**When** a publish authorization guard is added
**Then** a publish attempted outside the authorized release workflow is refused before any tarball is uploaded, proven by a test that runs the guard with a token present and asserts the refusal
**And** a publish through the authorized release workflow still succeeds, proven on the next release rather than asserted

### Story 4.8: Gate the ungated trees, allowlists, coverage and CI

As a TEA maintainer,
I want the places nothing currently reads to be read,
So that a suppression is a decision rather than an inheritance.

**Acceptance Criteria:**

**Given** `eslint.config.mjs`, `.markdownlint-cli2.yaml` and `.prettierignore` all exclude `_bmad/**` and `_bmad*/**`, so `_bmad-output/` including this document is read by no gate
**When** a gate is added over that tree
**Then** it reads the markdown there and fails on what it is configured to catch

**Given** `.markdownlint-cli2.yaml` sets `config.default: false`, leaving five rules active across every shipped markdown file
**When** the allowlist is reviewed
**Then** each disabled rule is either re-enabled or recorded with the reason it stays off
**And** the review is split from the fix, so the cost of re-enabling is known before it is paid

**Given** `eslint.config.mjs:77-108` disables `no-undef`, `no-unused-vars` and `no-unreachable` across `cli/**`, `tools/**`, `test/**` and the hook scripts copied into user projects, with an in-file comment conceding the second avoids "failing CI on incidental unused vars"
**When** the disables are reviewed
**Then** the two correctness rules are re-enabled and their violations fixed, or each is recorded with a reason that is not convenience

**Given** the `c8` block declares no `check-coverage` and no threshold, and `test:coverage` runs in neither the `npm test` chain nor any workflow
**When** coverage is addressed
**Then** a threshold is set and enforced in CI, or the tooling is removed so nothing implies a coverage gate exists

**Given** `tools/validate-ci-coverage.js` enforces only the `npm test` chain and states "the reverse is allowed", so `test:cli`, `test:coverage`, the six `eval:*` and the four `docs:*` scripts need no workflow step
**When** the validator is extended
**Then** every script in `package.json` is either covered by a CI step or listed as deliberately local with a reason

**Given** Epic 4 is otherwise complete
**When** `npm test`, `tools/validate-ci-coverage.js` and every `quality.yaml` job run
**Then** all pass

## Epic 5: Drift is measured and the upgrade is proven live

Drift between two runs is measurable, the suite has been run live with its result recorded, the documentation states the baseline that ships, and TEA releases.

**FRs covered:** FR30, FR41, FR42, FR43, FR44, FR45, FR46

### Story 5.1: Compare run strength through `compareDominance`

As a TEA maintainer,
I want two runs compared by the package's own dominance rule,
So that drift across a runner or model change is measured rather than eyeballed across two reports.

**Acceptance Criteria:**

**Given** `compareDominance` became reachable in Story 2.1 and TEA's pin moved to that release
**When** it is wired into TEA's result handling
**Then** two stored results can be compared, and the comparison honours `comparabilityKey` and each side's `strength.comparable`
**And** a comparison across a key boundary is refused with the reason rather than returning a verdict

**Given** a fixture pair of stored results with a known dominance relation
**When** they are compared
**Then** the reported relation equals the fixture's declared relation
**And** the fixture covers each relation the type declares, including neither-dominates

**Given** the comparison is available
**When** it runs over the replay corpus in `test:eval-replay`
**Then** a scorer change that alters a historical result is reported as a dominance change rather than only as a diff

### Story 5.2: Run the whole suite live and record the result

As a TEA maintainer,
I want the full evaluation run live once the upgrade is in,
So that the claim rests on a measured run rather than on a green deterministic gate.

**Acceptance Criteria:**

**Given** Epics 1 through 4 are merged
**When** `npm run eval:all -- --agent <runner>` runs for at least one runner
**Then** every declared repetition completes
**And** the exit class is recorded as `0`, `1` or `2`

**Given** the run produces machine-readable output
**When** the result is recorded
**Then** the record carries the repository commit, the resolved runner and model, the contract and probe versions, the corpus digest, and the measurements
**And** a failure caused by the upgrade is distinguished from a measured quality regression

**Given** the live run reveals a defect in `eval-quality`
**When** it is triaged
**Then** it opens a new story rather than extending this one, so this story's size stays known
**And** the NFR4 obligation to fix it upstream still holds

### Story 5.3: Restate the roadmap against what ships

As a reader deciding what TEA's evaluation covers,
I want the roadmap to describe the shipped state,
So that I am not reading a plan for work that is already done.

**Acceptance Criteria:**

**Given** the roadmap's Work Plan records "Items 1 through 8 are done. Item 9 is what remains", and the versioned suite manifest and `--json` output it asks for exist at `test/lib/suite-manifest.js` and across the four harnesses
**When** the page is rewritten
**Then** completed items are recorded as shipped rather than requested
**And** the baseline table names which conformance arms run and which `eval-quality` capabilities TEA uses

**Given** line 169 records that giving the remaining skills real CLI entry points is "owed work with a design document of its own", which Epic 6 does not close
**When** the page is rewritten
**Then** that debt is carried forward explicitly with its owner, or closed with the reason
**And** every capability TEA declined carries its reason, so none sits in an unrecorded "not yet" state

**Given** the count gate from Story 4.1 is in place
**When** the rewritten page states a number
**Then** the gate computes it and passes

### Story 5.4: Update the adoption guide and the command-adapter page

As a maintainer adopting `eval-quality` elsewhere,
I want TEA's guides to describe the current version,
So that I follow a procedure that works.

**Acceptance Criteria:**

**Given** `docs/explanation/eval-quality-adoption-guide.md` describes adoption against the superseded pin
**When** it is updated
**Then** it states the required `permittedEnvironmentKeys`, the current artifact stamps, and that the stamps are read from the package

**Given** `docs/explanation/eval-quality-command-adapter.md` does not describe the environment channel
**When** it is updated
**Then** it documents the channel, its default-deny allowlist, and why `PATH` cannot be permitted

**Given** the page records three unscored probe classes in prose: `test-review` gameability refused under AD-9, `trace` defect refused for the same reason, and fragment selection with none authored
**When** the page is rewritten
**Then** each is either closed or carried forward as a tracked item with an owner, rather than left as prose
**And** the claim gate from Story 4.2 holds every symbol and code the page names

### Story 5.5: Record the change and release TEA

As a consumer of TEA,
I want this work in a published release with a changelog entry,
So that the dependency change is visible to anyone installing TEA.

**Acceptance Criteria:**

**Given** `AGENTS.md` requires TEA's hand-maintained `CHANGELOG.md` to be updated in the same change
**When** the entry is written
**Then** it names the `eval-quality` version change, the artifact migration, the conformance arms added, and the gates added
**And** it states what a consumer of TEA must do differently, or that nothing is required of them

**Given** the epic is otherwise complete
**When** the release is cut
**Then** the published version is confirmed against the npm registry
**And** no `file:` or `link:` dependency on a local checkout is present in the released tree

**Given** Epic 5 is otherwise complete
**When** `npm test` and every `quality.yaml` job run
**Then** all pass, and every new script added in this epic has its own workflow step

## Epic 6: Every TEA skill is covered by a behavioral suite

Eight skills are declared deferred in `test/evals/suite-manifest.json`, each with an owner and a statement of missing evidence, and `test/eval-all.js` exits `2` when a skill is in neither a suite nor that list.

Each skill's `exitCondition` was written when the deferral was declared, and each story turns one into an executable suite.

No story in this epic depends on anything in Epics 1 through 5. Four dependencies run inside it, each backwards and each stated in the dependent story's own first Given: Story 6.7 needs the fixture Story 6.6 builds, Story 6.9 needs the static scoring Story 6.8 establishes, Story 6.11 needs the harness Story 6.10 builds, and Story 6.12 needs all eleven. Stories 6.1 through 6.6, 6.8 and 6.10 depend on nothing and can run in any order or in parallel. Story 6.12's documentation clause additionally depends on Story 4.1.

Every suite carries clean or negative controls as well as positive cases, because recall alone rewards a system that reports everything.

**FRs covered:** FR47, FR48, FR49, FR50, FR51, FR52, FR53, FR54, FR55

### Story 6.1: Prove `bmad-tea` routes an intent to the right workflow

As a user who describes a testing problem in my own words,
I want the routing agent to send me to the workflow that fits and to say why,
So that I am not silently pointed at the wrong workflow.

**Acceptance Criteria:**

**Given** no suite measures `bmad-tea` and no fixture of intents exists
**When** the fixture set is authored
**Then** it carries realistic intents with one correct workflow each, ambiguous intents whose correct behavior is to ask, and intents the skill should decline
**And** each fixture entry names the deciding feature of the intent as an expected token set

**Given** the suite runs
**When** an intent is routed
**Then** the chosen workflow is scored against the fixture's expected workflow
**And** the stated reason is scored for containing the fixture's deciding-feature tokens rather than by judgment
**And** the requested scope is compared with the scope carried into the workflow

**Given** an intent the skill cannot serve
**When** it is routed
**Then** the skill declines and names what is missing, and a confident route scores as a defect

### Story 6.2: Prove `bmad-testarch-test-design` grounds its risks

As someone handing a feature to the test-design workflow,
I want the risks it returns to be traceable to what I gave it,
So that I can tell an analysis of my feature from a list that would fit any feature.

**Acceptance Criteria:**

**Given** no fixture carries a known risk set
**When** the fixture is authored
**Then** it carries a feature description with known material risks, plausible risks it does not support, a severity rank per risk, and the coverage classes acceptable for each
**And** a clean control carries a feature whose risk set is genuinely small

**Given** the suite runs
**When** risks are returned
**Then** each is scored for grounding in the supplied description, and an ungrounded risk scores as a false positive

**Given** priorities are assigned
**When** two risks appear whose fixture severity ranks are ordered
**Then** their assigned priorities respect that ordering as a pairwise constraint
**And** every material risk maps to one of the coverage classes the fixture declares acceptable for it

### Story 6.3: Prove `bmad-testarch-nfr` refuses an unsupported PASS

As someone auditing non-functional requirements,
I want every status grounded in the evidence I supplied,
So that a PASS means the evidence showed it.

**Acceptance Criteria:**

**Given** no evidence fixture with known gaps exists
**When** the fixture is authored
**Then** it carries evidence supporting some statuses, evidence absent for others, and a threshold left unstated
**And** the expected result names which domains can be decided and which cannot

**Given** the suite runs
**When** a status is returned for a domain with no supporting evidence
**Then** an unsupported `PASS` scores as a defect, and `CONCERNS` for an unknown threshold scores as correct

**Given** all four NFR domains are in the fixture
**When** the report is produced
**Then** every domain is addressed rather than silently dropped

### Story 6.4: Prove `bmad-testarch-ci` emits configuration that parses

As someone generating a pipeline,
I want the configuration to be valid and to contain what I asked for,
So that I find a broken workflow in the suite rather than on my first push.

**Acceptance Criteria:**

**Given** generated pipeline configuration is never parsed or linted
**When** the suite runs
**Then** every generated configuration is parsed, and a parse failure scores as a defect
**And** it is linted with `actionlint` for GitHub Actions, invoked with the version and flags this story pins

**Given** the request names triggers, permissions, test commands, quality gates and artifacts
**When** the configuration is generated
**Then** each requested element is scored individually, and an element the request did not ask for is reported

**Given** a clean control requesting a minimal pipeline
**When** it is generated
**Then** the output does not accumulate elements the request never mentioned

### Story 6.5: Prove `bmad-testarch-atdd` fails red for the intended reason

As someone starting from acceptance criteria,
I want the generated tests to fail before implementation because the behavior is missing,
So that a red test proves the behavior is absent rather than that the test is broken.

**Acceptance Criteria:**

**Given** generated acceptance tests are never executed
**When** the suite runs
**Then** each generated test is executed against the unimplemented fixture
**And** its failure is classified by exit path: an assertion failure matching the fixture's declared message pattern scores as correct, while a parse error, an import error or any other non-assertion exit scores as a defect

**Given** the criteria supplied to the workflow
**When** the tests are generated
**Then** each maps to a supplied criterion, and a test mapping to none is reported

**Given** the workflow runs against the fixture
**When** the run completes
**Then** no production file has changed, and a changed production file scores as a defect regardless of the test result

**Given** this suite executes generated test code
**When** it runs
**Then** it runs under NFR9's isolation, and the isolation is proven before the suite is enabled

### Story 6.6: Build the fixed implementation and qualified regression fixture

As a TEA maintainer,
I want a fixed implementation and a qualified seeded regression to measure against,
So that the `automate` suite has something real to detect.

**Acceptance Criteria:**

**Given** no fixed implementation and no qualified seeded regression exist
**When** the fixture is authored
**Then** it carries a fixed implementation and a regression qualified under the package's `controlled-mutation` route
**And** the qualification record names `targetArtifact` and carries `rollbackVerified`, and rollback is proven by re-running against the restored artifact
**And** `mutationOperator` is populated, since it is the field the package documents as an opaque caller string no code reads

### Story 6.7: Prove `bmad-testarch-automate` catches the qualified regression

As someone expanding automated coverage,
I want generated tests that pass on working code and fail on a real regression,
So that the coverage I gained detects something.

**Acceptance Criteria:**

**Given** the fixture from Story 6.6
**When** the generated tests execute against the fixed implementation
**Then** they pass
**And** when they execute against the seeded regression, at least one fails and the failure is attributed to the seeded behavior

**Given** the generated set is scored
**When** a test asserts nothing constraining the behavior, or duplicates another test's assertion
**Then** it is reported as vacuous or duplicate rather than counted as coverage

### Story 6.8: Score the `bmad-testarch-framework` scaffold's contents

As someone initializing a test framework,
I want the scaffold to contain what it should,
So that I get a working starting point rather than a directory of plausible files.

**Acceptance Criteria:**

**Given** no generated scaffold is ever inspected
**When** the suite runs
**Then** the expected configuration, fixtures, scripts and hook registration are each checked individually
**And** a missing hook registration is reported rather than absorbed into an overall pass
**And** this story executes nothing, so it carries no network dependency and no install time

### Story 6.9: Install and smoke-test the generated scaffold

As someone initializing a test framework,
I want the scaffold to install and run,
So that its contents being right is not mistaken for it working.

**Acceptance Criteria:**

**Given** Story 6.8 scores the scaffold's contents statically
**When** an install-and-smoke suite is added
**Then** the scaffold is installed in a disposable workspace, validated, and a smoke test executed
**And** the suite is declared separately from Story 6.8's so its wall clock and its network dependency do not gate the static scoring
**And** the workspace is removed on both the passing and the throwing path
**And** the install runs under NFR9's isolation, with the network access it needs declared explicitly and nothing else reachable, proven before the suite is enabled

### Story 6.10: Build the multi-turn transcript harness

As a TEA maintainer,
I want a harness that drives and records a multi-turn session,
So that a teaching skill has something to be measured by.

**Acceptance Criteria:**

**Given** TEA's four harnesses all score a single invocation
**When** the transcript harness is built
**Then** it drives a multi-turn session against a scripted responder and records every turn
**And** it is registered in `test/evals/suite-manifest.json` with its own capability policy
**And** it is proven by a trivial scripted session before any skill is measured with it

### Story 6.11: Prove `bmad-teach-me-testing` teaches rather than asserts

As a learner working through a teaching session,
I want the session to meet me at my level and correct me when I am wrong,
So that I am not told I have mastered something the session never checked.

**Acceptance Criteria:**

**Given** the harness from Story 6.10 and a scripted learner starting at a known level with a seeded misconception
**When** the session runs
**Then** the placement is scored against the known level
**And** the seeded misconception is scored for being corrected rather than passed over

**Given** the fixture declares a remediation topic absent from the pre-correction plan
**When** the session continues after the correction
**Then** adaptation is scored as the post-correction turns covering that declared topic

**Given** progress is persisted across turns
**When** the session ends
**Then** the persisted progress matches what the transcript shows was covered
**And** a claim of mastery for a topic the transcript never tested scores as a defect

### Story 6.12: Empty the deferred array

As a TEA maintainer,
I want the manifest to carry no deferred entry,
So that every skill is covered by a suite rather than by a declaration that it is not.

**Acceptance Criteria:**

**Given** Stories 6.1 through 6.11 have each added a suite
**When** `test/evals/suite-manifest.json` is updated
**Then** its `deferred` array is empty and every TEA skill appears in the suites list

**Given** the array is empty
**When** `npm run eval:all` runs
**Then** the declaration gate at `test/eval-all.js` finds no undeclared skill and does not exit `2`

**Given** the roadmap's Coverage Still Owed table listed these eight skills, and Story 4.1's count gate is in place
**When** the documentation is updated
**Then** the table records the coverage that now exists
**And** the count gate computes any number the rewritten table states

**Given** Epic 6 is otherwise complete
**When** `npm test` and every `quality.yaml` job run
**Then** all pass, and every new script has its own workflow step

## Validation Record

Checked mechanically where possible.

| Check | Result |
| --- | --- |
| Functional requirements defined | 56 |
| Covered in the FR coverage map | 56 |
| Assigned to an epic | 56 |
| Withdrawn, struck in place with the evidence | 1 (FR21) |
| Stories carrying acceptance criteria | 43 of 43 |
| Stories in the As a / I want / So that form | 43 of 43 |
| Stories carrying Given / When / Then criteria | 43 of 43 |
| Stories referencing a later story or epic | 0 |
| Unreplaced template placeholders | 0 |

**Epic independence.** Epic 1 depends on nothing. Epic 2 depends on Epic 1 only for the pin. Epic 3 depends on Epic 1. Epic 4's first three stories depend on Epic 2's release; the rest depend on nothing. Epic 5 depends on Epic 2 for `compareDominance` and on Epics 1, 3 and 4 for what it documents. Epic 6's stories depend on nothing outside the epic; inside it, 6.7 needs 6.6, 6.9 needs 6.8, 6.11 needs 6.10, and 6.12 needs all eleven. Every dependency points backwards.

**File overlap.** Epics 1 and 3 both touch `test/test-probe-conformance.js` and `tools/generate-probes.js`. Consolidation was considered and rejected: on `test-probe-conformance.js` the touches are three localized sequential edits in one file, and on `generate-probes.js` they fall in different regions of a 720-line file. Merging would give a ten-story epic that cannot be green until all of it lands.

**Not applicable.** No architecture document specifies a starter template, and TEA has no database or entities.

**Deferred work, checked 2026-09-10.** Three registries were read rather than assumed. `_bmad-output/implementation-artifacts/deferred-work.md` holds seven entries, all verified resolved against current code. `test/evals/suite-manifest.json` holds eight declared deferrals, which Epic 6 closes. `tea-enforce.cjs`'s `DEFERRED` map holds ten Absolute registry rows, each deferred because a regex hook cannot decide it, and these stay out of scope as a stated limit. A fourth surface of the same family, `test/test-contracts.js:174`'s skip-reads-as-pass, is recorded in Additional Requirements.

## Review Record

Three independent reviewers read this document against both repositories before it was finalized, on three separate angles: factual accuracy, completeness against `eval-quality`'s published surface, and structure. Every finding acted on below was re-verified against source here rather than taken on report.

**Facts that were wrong in the first draft, and are corrected above:**

- The migration is 31 probes across 10 files and 10 contracts, not 15 across 2. The first measurement read only the top level of `test/probes/` and missed the 8 fragment-selection files. Roughly double the stated scope.
- The stamp bump changes no validation verdict. No published schema pins `schemaVersion`, so the only load-bearing edit is the ninth `inputBinding` channel on 21 selectors. The stamp matters at runtime, not at validation.
- `test/lib/eval-quality-inputs.js`'s table has two wrong entries, not one. `sealedRunRecord` reads 3 and must read 6, which the first draft never mentioned, and TEA emits sealed run records from that entry.
- Eleven schemas declare a bare integer, not twelve. `artifact-reference` deliberately carries no `schemaVersion`, an exemption asserted by a test.
- Pinning `schemaVersion` with a `const` reverses a decision the package argues in writing, with two stated reasons. FR12 now meets the need on the consumer side and the schemas are left alone.
- FR25 named the wrong artifacts. The four it listed are caller-produced and the package stamps none of them; the three it does stamp are now named.
- 23 documentation files carry bash fences, not 11.
- `test/contracts/expected-status.json` records no failure code, so an acceptance criterion in the first draft had no subject.
- `test/test-probe-conformance.js:177` already reads its expected count from `CONFORMANCE_OUTCOME_COUNTS`. A story existed for work already done, and it was deleted.
- `test/test-contracts.js:174` prints a visible skip notice. The defect is that a skip reads as a pass; the word "silently" was wrong.
- Several cited line numbers were off by a few and are corrected.

**Structural changes:**

- The upstream epic no longer blocks the upgrade. 3.0.0 is already published, and only the derivation stories need anything from it, so TEA now lands against the published release first. NFR4 was being over-read to forbid ordinary artifact authoring; it is narrowed above to what it was meant to catch.
- Epic 3 shrank from three port implementations to three adapter adoptions. The package already exports `createLocalCorpusAdapter`, `createNodeFileSystemAdapter` and `createSystemClockAdapter`, which no reviewer of the first draft had checked.
- The file-system cutover was one story covering 69 direct calls across 5,800 lines. It is now certify-then-cut-over-per-harness.
- The fixture, install and harness halves of three Epic 6 stories were split from the suites that use them.
- Sixteen acceptance criteria that could not be mechanically checked were given a fixture, a registry, a named tool or a predicate. NFR7 now states the rule.
- NFR5 was owned by no story and is now an explicit criterion on each sweeping change.
- Two stories with unknowable size, the lint allowlists and the layering violations, are split into report-then-fix.

**Requirements the review added that the first draft missed entirely:** the three shipped adapters, validating `eval-contract` and `scoring-policy`, `check:boundary`, `check:lineage`, the publish-authorization guard, `.npmrc` `min-release-age`, the published corpus as a pin-move smoke test, `--strict` and `strictPromotable`, `DiagnosticSink`, `instanceof RuntimeFault` narrowing, `VERDICTS` and `EVALUATOR_RECOMMENDATIONS`, a gate over `_bmad-output/`, the markdownlint and eslint suppression allowlists, unenforced coverage, and the limit of what `validate-ci-coverage.js` actually enforces. The first draft had 43 requirements; it now has 55.

**One defect found in `eval-quality` itself:** `dist/index.d.ts` declares `VERSION = "2.0.0"` while `package.json` reads `3.0.0`. Story 2.3 fixes it.

## CodeRabbit Round 1

Eight findings, each verified against the document before it was acted on. Seven were valid as stated, one partly.

| Finding | Verdict | Change |
| --- | --- | --- |
| Epic 3 says four conformance arms where there are five | Valid | Corrected in the epic summary and the closing criterion, and the five are now named |
| Epic 6's independence claim contradicts its own stories | Valid | The four in-epic dependencies are stated, and the eight stories that really are independent are named |
| FR12 overreaches to artifacts with no stamp | Partly valid | Scoped to the artifacts TEA authors and `artifact-reference` excluded by name. The suggested narrowing to `eval-contract` and `scoring-policy` was declined: that is FR14's scope, and the stamp check matters most for probes |
| Story 5.5 lacks the standing gate criteria every other closing story has | Valid | Added |
| The skip-reads-as-pass in `test-contracts.js` is documented and owned by nothing | Valid | Now FR56, with a fail-closed criterion and a test on Story 4.4 |
| FR35 has no executable criterion | Valid, and understated | FR35 was mapped to Epic 4 and implemented by no story at all. A criterion is now on Story 4.7 |
| FR13 cannot resolve `sealedRunRecord` without a literal | Valid | `sealed-run-record` is caller-produced, so the package stamps it nowhere. FR11 and Story 2.2 now export a constant for it and for every caller-produced artifact whose reader pins a version, and Story 2.6 gains a mismatch-path test |
| Three gates execute content with no stated isolation | Valid | NFR9 states the isolation, and Stories 4.3, 6.5 and 6.9 each carry it as a criterion proven before the gate is enabled |

The document moved from 55 requirements to 56 and from 8 non-functional requirements to 9.
