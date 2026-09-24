---
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted:
  ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-09-23'
inputDocuments:
  - '_bmad-output/planning-artifacts/evaluate/epics.md'
  - '_bmad-output/planning-artifacts/evaluate/SPEC.md'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md'
  - '_bmad-output/planning-artifacts/evaluate/eval-quality-facts.md'
  - '_bmad-output/planning-artifacts/evaluate/eval-quality-vocabulary.md'
  - '_bmad-output/planning-artifacts/evaluate/target-kind-adapter-mapping.md'
  - '_bmad-output/planning-artifacts/evaluate/input-notes.md'
  - '_bmad-output/planning-artifacts/evaluate/evaluation-framework-facts.md'
  - 'AGENTS.md'
  - 'package.json'
  - '.github/workflows/quality.yaml'
  - 'tools/validate-ci-coverage.js'
  - 'test/test-installation-components.js'
  - 'test/test-routing-evidence.js'
  - 'test/test-schema-versions.js'
  - 'test/test-eval-quality-corpus.js'
  - 'test/test-automate-eval-fixture.js'
  - 'eval-quality@467e3a3: src/core/probe/target-policy.ts'
  - 'eval-quality@467e3a3: src/testing/probe-conformance.ts'
  - 'eval-quality@467e3a3: src/application/index.ts'
  - 'knowledge: risk-governance, probability-impact, test-levels-framework, test-priorities-matrix'
---

# Test Design: Epic 1, The Evaluate authoring loop

**Date:** 2026-09-22
**Author:** eval-testdesign (planning fleet step 4), on the owner's behalf
**Status:** Draft for owner review

## Executive Summary

**Scope:** full epic-level test design for Stories 1.1 to 1.26 of `epics.md`. The 2026-09-23 amendment added Stories 1.17 to 1.26 and extended Stories 1.3, 1.4, 1.12, 1.13, 1.14 and 1.16 to close the plan gap audit; their scenarios, risks and gates are below, and sections appear in execution order. The stories are built overnight by `/bmad-build` workers in order, uncommitted, so every acceptance criterion here names the check that fails when its story's work is reverted. A worker treats this file and `epics.md` together as the story's test plan.

**Risk summary:**

- Risks identified: 37
- High-priority risks (score 6 or more): 21, two of them at 9 as the stories were first written (R1-21, R1-22), each closed by a corrected acceptance criterion
- Dominant categories: TECH (engine boundary, runtime moves, evaluator isolation, shape tests), DATA (rollback, evidence and held-out integrity) and BUS (guidance that looks complete and produces weak evaluations)

**Coverage summary:**

- P0: 81 scenarios over the runtime's integrity paths (rollback, verdict source, infrastructure classification, evaluator isolation, held-out redaction, calibration, the dogfood proof, the behavioral proofs of guidance)
- P1: 67 scenarios over authoring checks, adapters, registration, the evaluation layer and craft headings
- P2: 12 scenarios over guidance text, packaging and documentation counts
- New `npm test` scripts: `test:trial-set-scoring`, `test:evaluate-boundaries`, `test:evaluate-check`, `test:evaluate-preflight`, `test:evaluate-mutation`, `test:evaluate-run`, `test:evaluate-arms`, `test:evaluate-evaluators`, `test:evaluate-mcp`, `test:evaluate-api`, `test:evaluate-workflow`, `test:evaluate-tool-use`, `test:evaluate-promptfoo`, `test:evaluate-partitions`, `test:evaluate-calibration`, `test:evaluate-interpret`, `test:evaluate-guidance`, `test:evaluate-authoring`, `test:evaluate-gap-loop`, `test:evaluate-learned-framework`, each with its own `quality.yaml` step in the `validate` job

**Corrections made to `epics.md` in this step:** acceptance criteria in fourteen stories were untestable or wrong as written. Each is listed with its reason under "Acceptance Criteria Corrected In epics.md" and the corrected text is already in `epics.md`.

## Test Levels Used In This Epic

TeA's suites are plain Node scripts using `node:assert`, a header comment stating what the file proves, a non-zero exit on the first failed assertion, and one `npm run test:<name>` script chained into `npm test`. Every new file here follows that house form. `tools/validate-ci-coverage.js` fails any chained script with no workflow step, so each new script lands with its `quality.yaml` step in the same story.

| Level | What it means here | Example |
| --- | --- | --- |
| Unit | A pure function in `cli/lib/evaluate/` exercised in process with no engine call and no child process | `corpus-index.json` sorting, AD-7 `conditionArm` labels |
| Static | A source scan over committed files that holds a structural rule (imports, allowed engine symbols, forbidden literals) | `test:evaluate-boundaries`, the HTTP port grep |
| Integration over real eval-quality | The runtime drives the installed `eval-quality` CLI and library on fixture files, with stub targets under `test/fixtures/` | `test:evaluate-run` end to end on a stub target |
| Contract | An artifact validated against eval-quality's published schemas or the runtime-owned schemas | `evaluation.json` template against the runtime schema |
| Guidance | A structured read of prompt content in the skill (`SKILL.md`, `references/`, `assets/`) that fails when a required passage or marker is removed | `test:evaluate-guidance` |
| Replay | Stored observations and sealed records re-scored through the CLI with no target launch | Story 1.2's `test:trial-set-scoring`, which re-scores stored replay records as a three-trial set through `eval-quality score` |
| Live | A real run of a skill through the local Claude Code CLI on the owner's subscription, recorded as evidence | Story 1.16's proof run; the authoring, gap-loop and learned-framework sessions of Stories 1.24 to 1.26 |
| Behavioral guidance | A live authoring session whose committed output is then re-run deterministically in `npm test` and must score strong | `test:evaluate-authoring`, `test:evaluate-gap-loop`, `test:evaluate-learned-framework` |

Live runs never enter `npm test`. Their evidence is recorded and then held by deterministic checks.

## Risk Assessment

Scores use probability (1 to 3) times impact (1 to 3). Six or more requires a mitigation that lands in the story named; nine would block release. Owner for every mitigation is the `/bmad-build` worker of the story named in the Timeline column, verified by the coordinator's review layers.

### High-Priority Risks (Score 6 or more)

| Risk ID | Category | Description | P | I | Score | Mitigation | Timeline |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R1-01 | DATA | `rollbackVerified: true` asserted without a performed restore, repeating the twin-fixture pattern of `tools/generate-probes.js` | 2 | 3 | 6 | No-op-restore test in `test:evaluate-mutation`; evidence carries pre, mutated and restored artifact digests with mutated unequal to pre and restored equal to pre; the stub target prints the sha256 of its own `targetArtifact`, so the baseline re-pass leg's stdout must equal `preDigest`, evidence the runtime does not compute; `test:evaluate-boundaries` forbids a `rollbackVerified: true` literal anywhere in `cli/` | 1.7 |
| R1-02 | TECH | A verdict computed outside the eval-quality CLI: the runtime calls `runScore`, `preflightFromObservations`, `compile` or `seal` from the library, or derives an exit code from evidence it read | 2 | 3 | 6 | `test:evaluate-boundaries` confines every engine import to `cli/lib/evaluate/engine.js` and forbids the four stage members on its bindings; a logging shim at `TEA_EVALUATE_ENGINE_CLI` proves `preflight` and `score` reach the CLI (the library's `runPreflight` verdict is byte-identical to the CLI's, so byte equality alone cannot prove the source) | 1.4, 1.6, 1.8 |
| R1-03 | TECH | A check whose name promises more than it holds: a guidance test that passes on a keyword, `test:evaluate-mcp` that never speaks MCP, a "passed preflight" read from the discarded library verdict | 3 | 2 | 6 | Every acceptance criterion below names its revert check; guidance tests read structured markers (a table keyed by exact vocabulary members) and fail on any missing key; adapter tests assert the transport actually used (`createMcpAdapter`, a live loopback socket) | every story |
| R1-04 | TECH | The lean skill shape breaks house-shape tests: `test/test-installation-components.js` asserts `steps-c` routing and the `instructions.md` sentence for every listed skill, and a naive "no `workflow.yaml` means lean" rule would misclassify `bmad-teach-me-testing`, which has no `workflow.yaml` and does have `steps-c/` | 3 | 2 | 6 | Lean means no `workflow.yaml` and no `steps-c/`; house and lean assertion sets are disjoint and each has a negative case (Story 1.3 corrected) | 1.3 |
| R1-05 | OPS | Adding the EV routing intent breaks `test:eval-routing-evidence`, which compares the live corpus case ids and fixture digest with Story 1.3's committed live evidence | 3 | 2 | 6 | Re-anchor the historical evidence to per-case snapshots so added cases pass and changed recorded cases fail; record a live routing run for the EV intent (Story 1.3 corrected) | 1.3 |
| R1-06 | TECH | Refactor moves whose revert no test notices (Stories 1.5, 1.7): the old assertions still pass when the code moves back to `test/lib/` | 3 | 2 | 6 | `test:evaluate-boundaries` asserts each re-pointed `test/lib/` file requires its `cli/lib/evaluate/` module and that the moved implementation markers exist only under `cli/lib/evaluate/` | 1.5, 1.7 |
| R1-07 | OPS | Engine drift inside a story: since Story 1.2 committed the exact `4.0.0` pin, a plain `npm install` or `npm ci` no longer resets it, but an explicit downgrade for a revert check (`npm install eval-quality@3.4.0`, with or without `--no-save`) left unrestored drifts the workspace, and later tests fail for a reason nobody attributes | 3 | 2 | 6 | Engine check at story start and end; every new `test:evaluate-*` file that needs trial-set scoring or the export starts with a capability probe that exits with a message naming the missing engine feature and the re-install command; a revert-check downgrade is restored in the same step before the worker moves on | 1.2 onward |
| R1-08 | TECH | The dogfood behavior is observable only in a file the skill wrote, so AD-19 refuses its seeded probe and AD-15 cannot close | 2 | 3 | 6 | Story 1.16 requires the discharged behavior on the runner's stdout or exit code, with the mutation in a `references/` file that behavior reads (Story 1.16 corrected) | 1.16 |
| R1-09 | TECH | Story 1.2's revert criterion is untestable as written: `test/test-schema-versions.js` reads every version from the installed package, so it passes on 3.4.0 and on the tarball alike | 3 | 2 | 6 | Replace with a trial-set scoring case that fails on published 3.4.0 (Story 1.2 corrected) | 1.2 |
| R1-10 | TECH | An infrastructure failure (runner exit 3 to 6, launch failure) reads as a low score or a `missed` outcome | 2 | 3 | 6 | `test:evaluate-run` asserts a stub exiting with a registry `infrastructureExitCodes` value yields no record and exit 12; `check` refuses a defect signature those codes could satisfy | 1.5, 1.8 |
| R1-11 | DATA | The adopter's working tree is written by a mutation or left with scratch state | 2 | 3 | 6 | `test:evaluate-mutation` compares `git status --porcelain` and a digest of every tracked file before and after, including on each failure path | 1.7 |
| R1-21 | OPS | The shipped runtime crashes for every adopter: code moved from `test/lib/` requires `ajv`, a devDependency, and every in-repo test stays green because devDependencies are installed | 3 | 3 | 9 | `ajv` moves to `dependencies`; a packed-install case installs the packed tarball with `--omit=dev` and runs `tea-evaluate check` to exit 0 (Story 1.4 corrected) | 1.4 |
| R1-22 | OPS | The dogfood proof cannot start: TEA is not installed into its own repository, so `_bmad/tea/config.yaml` does not exist for the skill's activation contract | 3 | 3 | 9 | Story 1.16 writes a gitignored `_bmad/tea/config.yaml`, invokes the skill by path and records both (Story 1.16 corrected) | 1.16 |
| R1-23 | TECH | The dogfood mutated arm does not manifest because the mutated behavior is restated in several guides the model also reads, so the run exits 11 | 2 | 3 | 6 | The discharged output is defined in one place in `references/`; the worker confirms manifestation once on the disposable copy before the recorded run | 1.16 |
| R1-25 | TECH | An evaluator reads the answers: a sealed-brief agent or command evaluator receives oracle checks, `testData` or the interaction plan and satisfies them without exercising the behavior | 2 | 3 | 6 | A stub agent adapter captures the whole prompt and tool configuration and the test scans it for every `check` string, `testData` literal and step ID; the bridge exposes brief-permitted operations only | 1.17 |
| R1-26 | TECH | The runtime grows framework-specific importers or re-implements ingest checks (quote and citation verification), creating a second verdict path and a release per framework | 2 | 3 | 6 | The `cli` layer's dependency-direction `allow` list names no framework, so `test:direction` fails any framework import whatever its name; a secondary name scan in `test:evaluate-boundaries`; an unwitnessed quote reaches `score` unchanged and eval-quality returns Invalid; Stories 1.20 and 1.26 record an empty `cli/` diff | 1.17, 1.20, 1.26 |
| R1-28 | DATA | Held-out probe content reaches the gap stage, so the evaluation is tuned to the probes meant to test it | 2 | 3 | 6 | `gap-view.json` carries held-out probes as ID, class and outcome only, asserted by a content scan; Story 1.25's transcript shows no held-out file read | 1.21, 1.25 |
| R1-29 | TECH | Judge calibration leaks the labels to the judge, or an uncalibrated judge's scores count | 2 | 3 | 6 | Stub judge capture shows no `expectedLevel`; agreement below threshold exits 11 with no record; calibration digest carried as `decodingParameters["tea.judgeCalibrationDigest"]` in `EvaluatorConfiguration`, whose strict schema has no other slot | 1.21 |
| R1-30 | TECH | `interpretation.json` or `partitions.json` restates outcomes differently from the evidence artifact, a second verdict path | 2 | 3 | 6 | Byte comparison of every copied field; a key allow-list forbids added outcomes, verdicts, rates or claim scores | 1.21, 1.22 |
| R1-31 | BUS | Guidance passes every term and heading test and still produces weak corpora or contracts | 3 | 2 | 6 | Stories 1.24 to 1.26: live authoring on two more kinds, seeded-weakness closure and an unfamiliar framework, each committed and re-run to a defined strong state in `npm test`; tagged worked examples compile | 1.12 to 1.14, 1.23 to 1.26 |
| R1-32 | TECH | A live authoring session is contaminated: it reads the hand-built fixture evaluations, `SEEDED.md` or held-out probes, so the proof proves nothing about the guidance | 2 | 3 | 6 | Sessions run in a temporary folder holding only the skill, the target and its files; transcript file reads are cited in completion notes; the reviewer checks them | 1.24, 1.25, 1.26 |

### Medium-Priority Risks (Score 3 to 4)

| Risk ID | Category | Description | P | I | Score | Mitigation |
| --- | --- | --- | --- | --- | --- | --- |
| R1-12 | SEC | The HTTP port template carries its own address classification, so eval-quality's fixes never reach adopters | 2 | 2 | 4 | Grep test in `test:evaluate-api` for private-range literals and CIDR arithmetic; conformance proves the four denied address classes |
| R1-13 | SEC | Vendor knowledge leaks into `cli/skill-runner.js` or `cli/lib/evaluate/` | 2 | 2 | 4 | `test:evaluate-boundaries` scans for vendor names and vendor CLI flags outside `cli/lib/agent-adapters.js` |
| R1-14 | DATA | A stale `corpus-index.json` or a digest over reformatted bytes lets the corpus change without the digest moving | 2 | 2 | 4 | `check` stale-index case; `test/fixtures/**` is already prettier-ignored; Story 1.16 adds `test/evaluations/**` |
| R1-15 | TECH | The contract skeleton "filled from the example" has no defined fill, so the compile test can pass on a hand-edited copy | 2 | 2 | 4 | A fill-values file and a failing case for an unfilled placeholder (Story 1.13 corrected) |
| R1-16 | TECH | AD-14's "no suite has both authoring paths" placed in the shipped runtime needs TeA-only knowledge an adopter's runtime cannot have | 3 | 1 | 3 | Enforced in `tools/validate-eval-schemas.js` at Story 1.15 (Stories 1.4 and 1.15 corrected) |
| R1-17 | OPS | The API conformance template needs endpoints (redirect chain, slow and oversize responses) no deployed adopter target offers, so the `pr` tier would need a live target | 2 | 2 | 4 | The conformance template starts its own loopback stub server (Story 1.11 corrected) |
| R1-18 | BUS | Live nondeterminism in the dogfood clean arm produces `false-positive` and a FAIL on the proof | 2 | 2 | 4 | A behavior with a crisp deterministic oracle; trial count set explicitly; any FAIL is recorded as found and routed through the gaps stage as the next action; the run is recorded once |
| R1-19 | TECH | A rubric judge runs when no rubric is declared, putting a model call into a deterministic arm | 1 | 3 | 3 | `test:evaluate-arms` counts judge invocations through a stub adapter: zero without a rubric |
| R1-27 | OPS | Framework devDependencies (AgentEvals pulls a LangChain dependency tree; promptfoo declares `engines.node >=22.22.0`) break installation, licences or lockfile age | 2 | 2 | 4 | `test:licences`, `test:lockfile-age`, `test:supply-chain` in Stories 1.19, 1.20, 1.26; the promptfoo test checks `.nvmrc` before spawning |
| R1-33 | TECH | The "unfamiliar" framework of Story 1.26 is already described in the skill, so the learn-on-the-go procedure is never exercised | 2 | 2 | 4 | `test:evaluate-learned-framework` greps the skill directory for the framework's name |
| R1-34 | TECH | Worked examples in the guides drift from eval-quality's schemas as the engine floats | 2 | 2 | 4 | Tagged examples compile or validate inside `test:evaluate-guidance` against the installed engine |
| R1-35 | TECH | A `captured` binding resolves from `testData` and the workflow test passes on a constant | 2 | 2 | 4 | The workflow fixture mints a fresh identifier per run |
| R1-36 | OPS | Verified framework facts drift as versions float | 3 | 1 | 3 | Each framework story re-verifies the facts against the installed version and corrects `evaluation-framework-facts.md` |
| R1-37 | BUS | A request to evaluate a vendor model is carried out as asked | 1 | 3 | 3 | Vendor-model passage asserted by the guidance test; recorded redirect in Story 1.24 |

### Low-Priority Risks (Score 1 to 2)

| Risk ID | Category | Description | P | I | Score | Action |
| --- | --- | --- | --- | --- | --- | --- |
| R1-24 | OPS | A required peer dependency makes npm 7 and later install the engine into every project that installs TeA | 2 | 1 | 2 | `peerDependenciesMeta` marks it optional; `test:release-metadata` asserts the shape |
| R1-20 | PERF | End-to-end stub runs (1.8, 1.10, 1.11) lengthen `npm test` | 2 | 1 | 2 | Each new file stays under 30 seconds on a laptop; the story's completion notes record the measured time |

## NFR Planning

| NFR category | Requirement | Risk link | Planned validation | Evidence |
| --- | --- | --- | --- | --- |
| Security | NFR3 (`web` never emitted), NFR4 (signature channels), AD-20 (only declared environment keys reach a target, `PATH` never declared) | R1-12, R1-13 | `test:evaluate-check` cases; command conformance's environment-key denial through `createCommandLineAdapter` | `npm test` output |
| Reliability | AD-8 rollback proof; AD-7 infrastructure classification | R1-01, R1-10, R1-11 | `test:evaluate-mutation`, `test:evaluate-run` | `npm test` output; Story 1.16 rollback digests |
| Maintainability | NFR1 single engine, AD-5 single driver, NFR6 floating versions, NFR10 framework-neutral runtime | R1-02, R1-06, R1-07, R1-26 | `test:evaluate-boundaries`; Story 1.15 float; empty `cli/` diffs in Stories 1.20 and 1.26 | `npm test` output; `git diff -- package.json package-lock.json`; completion notes |
| Performance | UNKNOWN: no threshold stated for `npm test` duration or live run cost | R1-20 | Measured and recorded per story | Completion notes |

Unknown threshold: no source states a limit on `npm test` wall time or on live proof duration. Recorded as unknown; stories report measured values.

## Entry Criteria

- [ ] The engine check exits 0 in the TeA worktree on the published eval-quality package TeA's devDependency resolves (4.0.0 or later, carrying Story 1.1's export and trial-set scoring)
- [ ] `npm test` is green on the TeA worktree before Story 1.2's change (the baseline every later failure is compared with)
- [ ] The local Claude Code CLI runs non-interactively on the build machine (needed by Stories 1.3 and 1.16)

## Exit Criteria

- [ ] Every P0 and P1 scenario below exists and passes in `npm test`
- [ ] Every acceptance criterion's revert check was exercised once by the worker (revert the change locally, observe the named failure, restore) and the observation is in the completion notes
- [ ] Story 1.16's proof record holds every item in "The Dogfood Proof" below
- [ ] The committed outputs of Stories 1.24, 1.25 and 1.26 reach their defined strong states in `test:evaluate-authoring`, `test:evaluate-gap-loop` and `test:evaluate-learned-framework`, and each session's transcript shows no read outside its permitted folder
- [ ] `git diff -- package.json package-lock.json` shows no `file:` or `.tgz` spec

## Acceptance Criteria Corrected In epics.md

| Story | Problem as written | Correction now in `epics.md` |
| --- | --- | --- |
| 1.1 | "denies an unlisted address with the first declared denial reason": `DENIAL_REASONS[0]` is `interface-not-authorized`, and an unlisted address on an authorized interface, scheme, host and port is denied `address-not-authorized` (`target-policy.ts:355-361`); the two policy names read as value exports, and both are Zod schemas that `package-exports.test.ts` keeps off the barrel | Exact address and reason, an interface case, and type-only exports |
| 1.2 | `test/test-schema-versions.js` reads each constant from the installed package, so it cannot fail on 3.4.0 because of the repair; `test/test-eval-quality-corpus.js` feeds the package nothing of TeA's by design | A new `test:trial-set-scoring` that fails on published 3.4.0; the tests the engine change broke are named as the repair's revert checks |
| 1.3 | The EV intent changes `intents.json`, which `test:eval-routing-evidence` holds to Story 1.3's live evidence by case ids and whole-file digest, so the story could not finish green; `bmad-teach-me-testing` has no `workflow.yaml` and does have `steps-c/`; `persistent_facts = []` and `on_complete` live in `customize.toml`; the guidance test had no owner until Story 1.12 | Per-case snapshots with new per-case digests and a recorded live routing run; lean defined as no `workflow.yaml` and no `steps-c/`; activation assertions split by file; `test:evaluate-guidance` created and chained here |
| 1.4 | The AD-14 case needs TeA-only knowledge the shipped runtime cannot have; code moved into `cli/` requires `ajv`, a devDependency, so the runtime would crash for adopters; the `cli` layer has no externals list, so "one allowed external" would fail `test:direction` or check nothing; a required peer is auto-installed by npm 7 and later; "exactly one `import('eval-quality'` site" cannot hold once Story 1.5 moves the `eval-quality/adapters` import and the synchronous `require` | AD-14 moved to Story 1.15; `ajv` in `dependencies` with a packed-install case; a full externals list; optional peer; one engine module `engine.js` with a test seam |
| 1.5 | "pass unchanged in their assertions" still passes after a revert; a text scan for `createCommandLineAdapter(` or `repositoryState(` hits legal call sites across `test/` | Definition scans in named files |
| 1.6 | The existing runners exit 2 for a usage error, so "2 to 6 for infrastructure" misclassifies it; a byte comparison with the CLI cannot tell the CLI verdict from the identical library verdict | Codes 3 to 6 plus usage 2; a logging engine shim |
| 1.7 | Exit 11 needs an arm run and an oracle verdict, which arrived only in Story 1.8; the three digests all came from the runtime; a non-git or copy-workspace temp copy recorded `dirty: true`, contradicting AD-8, so the fixture baselines Story 2.5 needs could never be accepted (found by the sprint-planning review) | The single-trial arm executor and evaluator move into 1.7; the stub prints its own artifact digest; only `--from-working-tree` records `dirty: true`, with a `workspace` field in the `evaluation.json` schema (Story 1.4) and a `copy` declaration in the Story 1.10 and 1.11 fixtures |
| 1.8 | The pass-through criterion named no comparison; fixture `runs/` directories written from here on were ignored only in Story 2.5; no story captured the `score` diagnostics that AD-10 reads to classify a `score` exit 3 and AD-12 lists in the bundle (found by the sprint-planning readiness check) | A logging shim plus a direct CLI comparison; the fixture `runs/` ignore entry moved here; per-probe `score` exit code, stdout and stderr persisted in `runs/`, keyed by probe ID |
| 1.11 | The conformance suite needs endpoints no deployed target offers; an ESM import cannot be spied on | A self-started loopback stub server; an injected evaluator |
| 1.13 | "once filled from the example" had no mechanical meaning | A fill-values file and a failing unfilled-placeholder case |
| 1.15 | `evalType` is a closed enum in `test/schema/suite-manifest.js`, `eval:all` spawns every suite's harness, and three counters count only `behavioral`, so Story 1.16's registration would leave the skill unaccounted | Schema branch, `eval:all` routing and counters named, with a revert case; AD-14 case added |
| 1.3 to 1.16 (amendment 2026-09-23) | The plan gap audit found eleven partial and two missing items: guides specified as term lists, no evaluation-layer choice, no workflow or calling-agent fixture, no held-out probes or judge calibration, no `seal` in the skill stage, fixed CI membership | Stories 1.3, 1.4, 1.12, 1.13, 1.14 and 1.16 extended; Stories 1.17 to 1.26 added; scenarios below |
| 1.16 | TEA is not installed into its own repository, so the activation contract had no config to load; the behavior's channel was unconstrained; a multiply-stated behavior may not manifest under a one-file mutation; the worktree `shasum` proved an untouched tree and was labelled rollback proof | Setup steps; stdout or exit code; single-source output with a manifestation check; the independent CLI re-score; relabelled check |

## Coverage Plan By Story

Each table row is one acceptance criterion. "Revert check" names the test and what it observes when the story's change is undone. Priority follows `test-priorities-matrix.md`.

### Story 1.1: Export eval-quality's HTTP target-policy evaluation and pack the engine

Repository: the eval-quality worktree `eq-evaluate-export`. Levels: unit (vitest over the package root), static (`check:layers`, `package-exports.test.ts`), documentation gates.

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| `evaluateTarget`, `classifyAddress`, `parseAddress`, `isSafeMethod` importable from `dist/index.js` | The `node --input-type=module` probe in the AC | Integration over the built package | P0 | Removing the re-export makes the probe exit 1 |
| Loopback authorization allows `127.0.0.1`, denies `10.0.0.1` with `address-not-authorized`, and denies an unmapped interface with `interface-not-authorized` | New case in `tests/architecture/package-exports.test.ts` importing from the package root | Unit | P0 | Import fails at load |
| `qualifyProbe`, `OUTCOME_STATES`, `DISCIPLINE_RULES` exported | Same file, one assertion per symbol, `OUTCOME_STATES` length 12 and `DISCIPLINE_RULES` length 7 | Unit | P0 | Symbol `undefined` |
| Layering holds | `npm run check:layers` | Static | P1 | Importing `core/probe` from `src/index.ts` directly fails the root layer rule |
| Docs name the exports | `check:docs`, `check:doc-invocations`, `check:doc-counts`, `check:doc-claims`, `docs:validate-links` | Documentation gate | P2 | `doc-claims` fails on the removed claim |
| `[3.4.0]` CHANGELOG section and `[Unreleased]` export entry | `stamp-changelog.test.ts` still passes; worker diffs the section against `git log v3.3.0..v3.4.0` | Static | P2 | Manual comparison in completion notes |
| `npm run validate` exits 0 and the tarball is packed | `npm run validate`; `tar -tzf` lists `package/dist/index.js` | Integration | P0 | Missing tarball fails Story 1.2's entry criterion |

### Story 1.2: Run TeA's gate on the engine Evaluate needs

Levels: integration over real eval-quality, replay.

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| `eval-quality` devDependency raised to the published 4.0.0, engine check 0, manifests show the version bump and no `file:` or `.tgz` spec | Engine check; `git diff -- package.json package-lock.json` | Integration | P0 | A `file:` or `.tgz` spec in the diff fails the story gate |
| `npm test` green on eval-quality 4.0.0, with the broken tests repaired | Worker first runs `npm test` on eval-quality 4.0.0 with no repair and records every failing script; those scripts are the repair's revert checks | Replay, integration | P0 | Reverting the repair re-fails each recorded script |
| TeA's gate depends on trial-set scoring | New `test/test-trial-set-scoring.js` (`test:trial-set-scoring`) built with the `test/lib/eval-quality-inputs.js` builders: seal a contract, score a three-trial set through `eval-quality score` with repeated `--record`, assert `reducedProbeOutcomes` present and `strength.comparable === true` | Integration over real eval-quality | P0 | With `node_modules/eval-quality` downgraded to published 3.4.0 (`npm install eval-quality@3.4.0 --no-save`, since `npm ci` now restores the committed 4.0.0 pin), the CLI rejects the repeated `--record` flag as a usage error, so the case fails and proves TeA depends on trial-set scoring |

### Story 1.3: Register Evaluate as a TEA skill

Levels: static (install test, description validator), contract (routing contracts), guidance, live (routing run recorded).

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| Lean files present, house files absent | `test/test-installation-components.js` lean set: requires `SKILL.md`, `customize.toml`, `references/`, `assets/`; forbids `workflow.yaml`, `steps-c/`, `steps-e/`, `steps-v/`, `instructions.md`, `checklist.md`, `scripts/` | Static | P0 | Adding `workflow.yaml` to the skill fails the lean set |
| Lean discriminator | Same file: a skill is lean when it has neither `workflow.yaml` nor `steps-c/`; `bmad-teach-me-testing` stays on the house set; a synthetic temp skill with `steps-c/` and no `workflow.yaml` is classified house | Static | P0 | Changing the rule to "no `workflow.yaml`" moves `bmad-teach-me-testing` to the lean set and fails its forbidden-file assertions |
| Activation contract | Lean set asserts the `resolve_customization.py` line, `{workflow.persistent_facts}` and `_bmad/tea/config.yaml` in `SKILL.md`, and `persistent_facts = []` and `on_complete` in `customize.toml` | Static | P1 | Deleting any line fails |
| Stage list points at `references/` files | `test/test-evaluate-guidance.js` (created and chained here as `test:evaluate-guidance`, with its `quality.yaml` step) parses the stage list in `SKILL.md` and asserts twelve stages, the `evaluator` stage among them, each naming an existing `references/<stage>.md` | Guidance | P1 | Removing a stage entry or file fails |
| `module-help.csv` EV row, agent menu EV, marketplace path, `tea_evaluations_folder` default `evals`, `expectedMenu` | Install test assertions, one per item | Static | P0 | Each revert fails `test:install` |
| Routing intent and regenerated contracts | `test:contract-sources`, `test:probe-sources` (`--check`), `test:eval-routing-data`; `probeStepBound` held by `test:contracts` | Contract | P1 | Reverting the regeneration fails `--check` |
| Historical routing evidence re-anchored | `test/test-routing-evidence.js` holds each recorded case to a per-case snapshot under `test/results/live-eval-remediation/story-1-3/cases/`, extracted while the whole-file digest still equals the contract's `fixtureDigest`, with a new per-case sha256; added live cases pass, a changed recorded case fails | Static | P0 | Editing one recorded intent's text fails |
| EV intent routes live | `npm run eval:routing` through the local Claude Code CLI; the EV intent routes to `EV` in both repetitions; result recorded in completion notes | Live | P1 | Recorded evidence, outside `npm test` |
| `deferred` suite-manifest entry | `test:suite-manifest`, `test:eval-schemas` | Static | P0 | Removing the entry fails the unaccounted-skill check |
| Description validator reads lean `SKILL.md` frontmatter | `test:tea-workflow-descriptions` with a temp lean skill whose frontmatter description is missing | Static | P1 | Reverting to the hard-coded teach-me path lets the bad temp skill pass, which the negative case catches |
| Builder files excluded | `.gitignore` entries; `npm pack --dry-run --json` parsed in the install test asserting no `.memlog.md` or `.analysis/` path | Static | P1 | Removing the ignore entry lets a planted `.memlog.md` reach the pack list |
| Documentation counts | `test:doc-counts`, `test:doc-claims` | Documentation gate | P2 | Count drift fails |

### Story 1.4: Ship `tea-evaluate` with `check` and `digest`

Levels: unit, integration over real eval-quality, contract, static. Files created: `test/test-evaluate-check.js` (`test:evaluate-check`), `test/test-evaluate-boundaries.js` (`test:evaluate-boundaries`), fixtures under `test/fixtures/evaluate/`.

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| Bin, optional `peerDependencies >=4.1.1`, release metadata and guard-publish cover both | `test:release-metadata`, `test:guard-publish` gain assertions for `bin["tea-evaluate"]`, the `>=4.1.1` peer range and `peerDependenciesMeta` optional | Static | P1 | Removing the bin, lowering the floor below 4.1.1, or dropping the optional flag fails |
| Runtime installs and runs for an adopter | Packed-install case in `test:evaluate-check`: `npm pack`, install into a temp folder with `--omit=dev` beside the local engine, `tea-evaluate check --evaluation <fixture>` exits 0 | Integration | P0 | Moving `ajv` back to `devDependencies` fails with a module-not-found crash |
| CommonJS runtime, one engine module, `cli` externals listed | `test:direction` with an `allow` list naming every external `cli/` uses; `test:evaluate-boundaries` asserts `cli/lib/evaluate/engine.js` is the only file naming `eval-quality` in `import(` or `require(`, subpaths and synchronous requires included | Static | P1 | A second engine import anywhere under `cli/` fails; removing a listed external while `cli/` imports it fails `test:direction` |
| Engine boundary (AD-1, AD-6) | `test:evaluate-boundaries` scans bindings obtained from `engine.js` only (so `ajv.compile` is untouched) and fails on `runScore`, `preflightFromObservations`, `compile` or `seal` | Static | P0 | Adding `engine.runScore(` anywhere in `cli/` fails |
| `--evaluation` required, exit 64; no `_bmad/` read | `test:evaluate-check` spawns each subcommand with no flag; boundaries test forbids the string `_bmad` under `cli/lib/evaluate/` | Integration, static | P1 | Defaulting a path makes the exit 0 |
| Valid fixture folder exits 0 | `test:evaluate-check` over `test/fixtures/evaluate/valid/` | Integration | P0 | Any schema tightening that rejects the valid fixture fails |
| Eleven refusal cases exit 10 | One temp copy of the valid fixture per case, each with one defect: stale index, unknown `schemaVersion` (message names a TeA version), runtime-owned probe field, non-`replace-exact` operator, `targetArtifact` in a provisioned directory, `web` interface, defect signature on a written file, oracle count not 1 on a discharged behavior, off-pattern ID (one sub-case per ID kind), `baseline/qualification/` digest mismatch, clean control not `zero-action` with `expectedClean: true` | Integration | P0 | Deleting any one refusal rule turns its case to exit 0 |
| `digest` writes sorted `{path, sha256}` and prints `corpusDigest` | Unit: sort and hash over a temp tree; integration: printed digest equals `digestArtifact(index, 'corpus-index.json')` computed in the test from the installed engine | Unit, integration | P1 | A digest over probes only (TeA's `corpusDigestOf`) differs after a `corpus/` byte change, which the test makes |

### Story 1.5: Move the registry, records and provenance into the runtime

Levels: static, integration.

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| Modules exist under `cli/lib/evaluate/` and `EXECUTION_TARGETS` is data | New case in `test:evaluate-check`: the registry built from `test/fixtures/evaluate/valid/evaluation.json` yields a `CommandTargetAuthorization` that validates against eval-quality's schema | Contract | P1 | Removing the schema read fails |
| `test/lib/` files keep only TeA data and TeA's own eval-result vocabulary (fault-to-failure-class mapping, suite-result, run-summary and diagnostic records) and import the runtime (amended 2026-09-23 in Story 1.5 review to match the rewritten epics.md criterion) | `test:evaluate-boundaries`: `test/lib/probe-targets.js`, `eval-quality-inputs.js`, `eval-record.js` each `require` their `cli/lib/evaluate/` module; the definitions `function sealedRunRecord`, `function repositoryState` and the command-target-policy builder exist only in their `cli/lib/evaluate/` modules, checked in the named files (call sites elsewhere, such as `test/test-probe-conformance.js`, stay legal); the schema-version reader moves into `engine.js` and the purity layer is re-pointed; every runtime function the three files hand out, including those a runtime factory returns, is the runtime's own function object | Static | P0 | Moving the code back fails the marker scan or the identity check |
| No `cli/` file imports `test/` | `test:direction` (the `cli` layer may not import `test`), the `test-import` rule of `test:evaluate-boundaries`, and `test:boundary`'s `test-tree-reach` pattern, proven by `test:layering-boundary-lineage` on a seeded `cli/` tree (amended 2026-09-23 in Story 1.5 review: `test:boundary` had no pattern for an import without a file extension) | Static | P0 | An import from `test/` fails all three |
| Existing harness unchanged | `test:probe-targets`, `test:probe-conformance`, `test:eval-replay`, `test:compare-eval-runs` | Replay, integration | P0 | Regression in any fails |
| `infrastructureExitCodes` refuses a satisfiable signature | New `test:evaluate-check` case: signature `exitCode == 3` with the skill runner's codes 3 to 6 exits 10 (amended 2026-09-23 in Story 1.5: exit 2 is the runner's usage error, so AD-7 and R1-10 name 3 to 6) | Integration | P1 | Removing the rule turns exit 0 |

### Story 1.6: Probe a skill through the generic runner and `tea-evaluate preflight`

Levels: integration over real eval-quality, static, unit. File: `test/test-evaluate-preflight.js` (`test:evaluate-preflight`), stub agent under `test/fixtures/evaluate/stub-agent/`.

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| `cli/skill-runner.js`: explicit `--skill-root`, prompt on stdin, exits 3 to 6 on infrastructure failure and 2 on usage (`cli/lib/runner-exit-codes.js`), no install probing | Unit cases over the runner with the stub agent: missing `--skill-root` exits its usage code; stub timeout maps to the timeout code; boundaries test forbids `os.homedir()` and `.claude/skills` paths in the runner | Unit, static | P1 | Re-adding an install lookup fails the scan |
| Mutation `targetArtifact` under the skill root | `test:evaluate-check` case with a `targetArtifact` outside it exits 10 | Integration | P1 | Rule removed turns exit 0 |
| Preflight drives legs, persists observations, verdict from `eval-quality preflight` | `test:evaluate-preflight` runs `tea-evaluate preflight` on the stub and asserts `runs/<invocationId>/observations/` non-empty; with `TEA_EVALUATE_ENGINE_CLI` at a shim that logs argv, exits 0 for `compile` and `seal`, and exits 5 for `preflight --observations ... --run-id`, `tea-evaluate preflight` exits 5 and the log shows that preflight argv | Integration over real eval-quality | P0 | A runtime that writes the `runPreflight` library verdict exits 0 under the shim with an empty log |
| Exit passed through | Same file: a fixture whose clean-control leg exits non-zero yields exit 3 from both `tea-evaluate` and the direct CLI | Integration | P0 | A mapped exit differs |
| No authorization denial | Assert verdict `passed`, no fault under `runs/<invocationId>/faults/`, and no `forbidden-target`, `interface-not-authorized` or `executable-not-authorized` in `observations/`, `faults/`, `observations.json` or `preflight-verdict.json` (amended 2026-09-24 in Story 1.6: the adapter throws both denials as one `forbidden-target` fault that does not name its reason; amended again in the Story 1.6 final review: the scan names the files the runtime writes about legs and the verdict, since `engine/` holds the engine's own output) | Integration | P0 | Replacing the stub's registry entry with one for another executable produces a `forbidden-target` fault, exit 10, and the same assertions fail |

### Story 1.7: Mutate only in a disposable copy and prove the rollback

Levels: integration, static. File: `test/test-evaluate-mutation.js` (`test:evaluate-mutation`) over a temp git repository the test creates.

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| Git target copied with `git worktree add --detach`; provisioned links read-only; `--from-working-tree` and non-git use temp copy with `dirty: true` | Three cases: git target (assert `git worktree list` shows the detached copy during the run and none after); uncommitted edit with `--from-working-tree` (assert `run.json.dirty === true`); non-git temp directory | Integration | P1 | Copying with `cp` loses the detached-worktree assertion |
| Six AD-8 steps in order; `rollbackVerified` only after restored digest equals pre and baseline re-passes within `reExecutionCap` | The story builds the single-trial arm executor and `resolveCheck` evaluator AD-8 needs. Evidence files hold `preDigest`, `mutatedDigest`, `restoredDigest`; assert `mutatedDigest !== preDigest` and `restoredDigest === preDigest`; the stub prints the sha256 of its `targetArtifact`, and the baseline re-pass leg's stdout equals `preDigest` | Integration | P0 | Replacing restore with a no-op makes the re-pass stdout equal `mutatedDigest` and no probe is emitted, which the test asserts |
| Adopter tree unchanged | `git status --porcelain` and a sha256 of every tracked file, before and after, on the pass path and each failure path | Integration | P0 | Mutating in place changes the digest set |
| Failure exits 10, 11, 12 with no probe | Occurrence count 0 and 2 exit 10; baseline that fails and mutation that does not manifest exit 11; unwritable workspace and a restore that throws exit 12; each asserts no qualified probe in `runs/` | Integration | P0 | Removing any guard changes the exit |
| Workspace kind sets `dirty` | A `copy` fixture records `dirty: false`; `--from-working-tree` records `dirty: true` | Integration | P0 | Hard-coding either value fails one case |
| Leg routing by `manifestationWitness.legId`, `cwd` per leg | Observations record `cwd`; the seeded-fault leg's `cwd` is the mutated copy, every other leg's the pristine copy | Integration | P0 | Routing every leg to one copy fails `seeded-faults-scoped` and the `cwd` assertion |
| No `rollbackVerified: true` literal | `test:evaluate-boundaries` scans `cli/` | Static | P0 | A hard-coded literal fails |
| Harness re-pointed; `eval:preflight` still runs | Boundaries case for `test/eval-contract-strength.js` and `test/test-automate-eval-fixture.js`; `test:automate-eval-fixture` passes; worker runs `npm run eval:preflight` once and records the result | Static, integration | P1 | Code moved back fails the marker scan |

### Story 1.8: Run the clean and mutated arms and score them

Levels: integration over real eval-quality, contract, unit. File: `test/test-evaluate-run.js` (`test:evaluate-run`).

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| `invocationId`, `runId` per trial set, `trialIndex` 1..N with N at least `minimumTrialCount`, `mode`, `conditionArm` | Read every sealed record in `runs/`; assert the AD-7 shape per record | Integration | P0 | A reused `runId` across arms fails the uniqueness check |
| Requests only from `interactionPlan` bound from `testData` | Stub target logs its received input; assert it equals the bound plan literal | Integration | P1 | A hard-coded request differs from the logged input |
| Deterministic evaluator over `resolveCheck` | Unit: a synthetic observation resolves to the expected finding set | Unit | P1 | Swapping the evaluator changes the finding |
| `IsolationManifest` per trial set, `EvaluatorConfiguration` per run with `sealedBriefDigest`, `run.json` fields | Contract validation against eval-quality schemas; `sealedBriefDigest` equals the digest of the persisted sealed brief | Contract | P0 | A stale digest fails equality |
| A no-model run's `EvaluatorConfiguration` validates: `modelSnapshot` is `none`, `systemPromptDigest` is `digestBytes` over the empty byte string | Schema validation of the generated configuration | Contract | P1 | Leaving either field empty fails validation |
| Infrastructure exit yields no record, invocation exits 12 | Stub exiting 4 in one trial | Integration | P0 | Recording the trial yields a record and exit 0 or 2 |
| `score` once per probe, every `--record`, exit passed through | A logging shim at `TEA_EVALUATE_ENGINE_CLI` records one `score` argv per probe with every trial's `--record`; with the real engine, a direct `eval-quality score` on the persisted inputs gives equal exit and byte-equal evidence on a passing and a FAIL fixture | Integration over real eval-quality | P0 | Computing the exit in the runtime makes the FAIL fixture's exits differ |
| Artifacts validated before the CLI | Corrupt one field in memory through a test hook; assert the runtime refuses before spawning | Contract | P1 | Validation removed lets the CLI reject with exit 4 instead, which the test distinguishes |
| `score` exit code, stdout and stderr persisted per probe | A shim at `TEA_EVALUATE_ENGINE_CLI` prints distinct known bytes to each stream and exits with a distinct code; assert byte equality per stream and the recorded code in `runs/<invocationId>/`, keyed by probe ID | Integration | P1 | An empty, swapped or dropped capture fails equality |
| Probe digests per AD-7 | Assert `commitDigest`, `artifactDigest`, `implementationDigest` against values the test computes with `git rev-parse` and sha256 | Integration | P1 | A digest of the wrong tree differs |
| `runs/` gitignored | `git check-ignore` on the template path, `test/evaluations/x/runs/y` and `test/fixtures/evaluate-x/runs/y` | Static | P2 | Removing the entry fails |
| End to end: `passed-clean-control` and `caught` at `minimumTrialCount` with a comparable strength vector | Read `reducedProbeOutcomes` and `strength` from the evidence artifacts | Integration over real eval-quality | P0 | Any break in the chain changes the outcome |
| Missing isolation manifest is Invalid | Run with the manifest suppressed; assert exit 3 and Invalid, a non-empty persisted `score` stderr and no evidence artifact | Integration | P0 | A runtime that fills a default manifest passes, which the assertion catches |
| Policy template has no threshold values; a filled copy validates | Contract test over `assets/scoring-policy.template.json` | Contract | P1 | Adding a default value fails |

### Story 1.9: Qualify gameability and historical probes, and judge rubrics

File: `test/test-evaluate-arms.js` (`test:evaluate-arms`). Levels: integration over real eval-quality, unit.

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| Gameability arm launches no target | Stub target writes a launch marker; assert no marker; assert both gameability evidence fields and `qualifyProbe` returns no failure code | Integration | P0 | Launching the target writes the marker |
| Historical arm over two revisions; refused with fewer | Temp git repo with a fix commit; assert fail-before, pass-after, seeded-fault leg `cwd` at the pre-fix revision; a one-commit repo yields a refused probe with a reason | Integration | P1 | Routing to HEAD fails the fail-before assertion |
| Judge only with a rubric, through `agent-adapters.js`, recorded in `judgeConfiguration` | Stub agent adapter counts calls: one per judged trial with a rubric, zero without | Integration | P0 | An unconditional judge call makes the zero-rubric count non-zero |

### Story 1.17: Drive any evaluation layer through one import contract

File: `test/test-evaluate-evaluators.js` (`test:evaluate-evaluators`), stub evaluators under `test/fixtures/evaluate/evaluators/`. Levels: integration over real eval-quality, contract, static.

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| `check` refuses an unknown kind, a missing `mapping.json`, a key bound to an undeclared oracle, behavior or criterion, rubric levels that differ from the anchored scale, a missing records directory | One `test:evaluate-check` case per refusal, each exit 10 | Integration | P1 | Deleting one rule turns its case to exit 0 |
| Judgment rows (with `quoteChannel`, `artifactId` on the `artifact` channel, `comment` on `fail`) convert through `mapping.json` into `Finding`-valid findings (`findingType: defect`, runtime-minted `findingId`, `summary` from `comment`, `evidenceArtifacts: []`, `quotedEvidence { quote, channel, artifactId }`), dispositions and judge results; every record validates against the published `sealed-run-record` schema; a clean arm `passed-clean-control`, a mutated arm `caught` | Stub `command` evaluators, one per row shape, run end to end through `score`; a `fail` row with no `quoteChannel`, and an `artifact` row with no `artifactId`, each fail the row schema and exit 12 | Integration over real eval-quality | P0 | A conversion that drops `findingType` or `evidenceArtifacts` fails schema validation before `score`; one that drops `observationIds` makes the mutated outcome something other than `caught` |
| The runtime copies no ingest rule | A stub whose `quote` is absent from the cited observation reaches `score` unchanged, and eval-quality returns Invalid | Integration over real eval-quality | P0 | A runtime that pre-filters quotes produces a record the engine scores differently, which the assertion on the Invalid result catches |
| Evaluator crash, non-zero exit or schema-invalid output exits 12 with no record; stdout and stderr persisted | Three stubs; assert exit 12, no record, byte-equal captured streams | Integration | P0 | Recording a trial from invalid output yields a record and a scored exit |
| Sealed-brief agent receives the brief and nothing else | Stub agent adapter captures prompt and tool configuration; assert the brief is present and no oracle `check`, `testData` literal, plan step ID, operation ID or path template appears | Integration | P0 | Adding the contract to the prompt, or naming operations in the bridge's tool descriptions, makes the scan find them |
| Bridge exposes one tool per brief interface with a kind-generic call shape, maps authorized calls to the contract `operationId`, and records `evaluator-chosen` observations with routed `cwd`; a call the registry authorization does not grant is denied with eval-quality's denial reason and no launch | MCP client drives the bridge for each interface kind; launch marker absent on denial; an authorized call matching no declared operation is recorded unmatched | Integration | P0 | A bridge that forwards every call writes the marker |
| `EvaluatorConfiguration` validates against its strict published schema, with kind and digests under `decodingParameters` (`tea.evaluatorKind`, `tea.evaluatorExecutableDigest`, `tea.evaluatorTreeDigest`) | Schema validation; one byte edited under `evaluator/` changes the configuration digest, the records' `evaluatorConfigurationDigest` and the scoring version | Contract | P1 | Omitting the tree digest leaves the configuration digest unchanged after the edit |
| `records` evaluator validated and passed through unchanged; invalid record exits 10 before any engine call | Logging engine shim shows no call for the invalid record; valid records reach `score` byte-identical | Integration | P1 | Removing validation lets the shim log a `score` call |
| Row cardinality: unmapped key or duplicate key fails the row schema, exit 12; zero rows for a trial with a mapped oracle exits 12 | Three stub evaluators, one per shape | Integration | P1 | Accepting a duplicate row produces two findings for one oracle, which the case catches |
| `evaluator.timeoutMs` required for `command`; a hung evaluator's process group is killed at the timeout, its streams persisted, no record, exit 12 | `test:evaluate-check` case for a missing timeout; a stub that never exits | Integration | P0 | Removing the timeout leaves the test hanging until the harness timeout, which fails it |
| No framework name under `cli/` | `test:evaluate-boundaries` scan over a name list held in the test | Static | P0 | Adding `require('agentevals')` under `cli/` fails |

### Story 1.10: Evaluate a stdio MCP tool server

File: `test/test-evaluate-mcp.js` (`test:evaluate-mcp`), fixture `test/fixtures/evaluate-mcp/`.

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| `McpTargetAuthorization` built, preflight passes | Assert observations carry MCP tool-call shape (structured result, protocol `2025-06-18` handshake recorded by the fixture) | Integration over real eval-quality | P0 | A `cli` shim in place of the server has no handshake record |
| Clean `passed-clean-control`, mutated `caught` | Evidence artifacts | Integration | P0 | Chain break changes outcome |
| Tool removed yields `tool-not-authorized` | Negative case in the same file | Integration | P0 | Authorization ignoring tools passes, which the case catches |

### Story 1.11: Scaffold the HTTP probe port for `api` targets

File: `test/test-evaluate-api.js` (`test:evaluate-api`), fixture `test/fixtures/evaluate-api/`.

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| Port template is a default-export factory holding configuration only and calling `evaluateTarget` | The evaluator is an injected option defaulting to the imported `evaluateTarget`; the test injects a counting wrapper and asserts one call per request and per redirect hop; the grep test holds that the default is the import | Unit | P0 | A port that decides locally makes zero calls to the wrapper |
| Grep for copied classification | Scan both templates for private-range literals (`10.`, `172.16`, `192.168`, `169.254`, `fc00`, `fe80`) and CIDR arithmetic | Static | P1 | Pasting a range list fails |
| Conformance template starts its own loopback stub server and passes `runEnvironmentProbePortConformance` | Run the rendered conformance file; assert nineteen outcomes pass and the stub server is closed in `finally` | Integration over real eval-quality | P0 | Pointing conformance at a deployed URL fails in the offline test |
| Loopback fixture: conformance, preflight, `passed-clean-control`, `caught`; contract kind `api`; unlisted address denied with eval-quality's reason | End to end over the fixture | Integration | P0 | Chain break changes outcome |

### Story 1.18: Evaluate a workflow target through `after` and `captured` bindings

File: `test/test-evaluate-workflow.js` (`test:evaluate-workflow`), fixture `test/fixtures/evaluate-workflow/`.

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| Steps issued in `after` order; `sequence` increases in issue order | Read observations of each trial | Integration | P1 | Issuing in array order with the plan reversed breaks the ordering assertion |
| `captured` binding carries the identifier minted in the same trial | Assert `read-back` `callInputs` equals `create`'s returned identifier; the fixture mints a fresh one per run | Integration | P0 | Binding from `testData` fails equality |
| Preflight passes; clean `passed-clean-control`; mutated `caught` | Evidence artifacts | Integration over real eval-quality | P0 | A chain break changes the outcome |
| Missing captured value: dependent step not issued, no observation, outcome other than `caught` | A fixture variant whose `create` omits the identifier | Integration | P1 | Issuing the step with an empty binding produces an observation the test forbids |
| Capture and `after` cycle refused with `binding-cycle`, exit 4 passed through | Compile a cyclic contract variant | Integration over real eval-quality | P2 | A mapped exit differs |

### Story 1.19: Evaluate a tool-use calling agent through its own command, judged by AgentEvals

File: `test/test-evaluate-tool-use.js` (`test:evaluate-tool-use`), fixture `test/fixtures/evaluate-tool-use-agent/`.

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| Evaluator runs AgentEvals' `createTrajectoryMatchEvaluator` in `strict` mode over the cited stdout trajectory and prints judgment rows | Run the fixture evaluator directly on a recorded clean and wrong-tool trajectory; assert one `pass` and one `fail` row citing the observation | Integration | P0 | An evaluator that ignores the trajectory prints the same row for both |
| Clean `passed-clean-control`; mutated (wrong tool) `caught`; the contract's own oracle names the first tool | Evidence artifacts | Integration over real eval-quality | P0 | An always-`pass` evaluator makes the mutated outcome something other than `caught`, which the test observes |
| Agent's own command is the authorized executable | Assert the preflight authorization's executable is the stub agent command | Integration | P1 | Routing through the skill runner fails equality |
| Scored AgentEvals result maps to `judgeResults` when the score is an anchored level; exit 12 otherwise | Unit cases over `{ key, score, comment }` objects | Unit | P1 | Accepting any number produces a record for the out-of-scale score |
| devDependencies at `latest`; licences, lockfile age and supply chain pass; no framework name in `cli/` | `test:release-metadata`, `test:licences`, `test:lockfile-age`, `test:supply-chain`, `test:evaluate-boundaries` | Static | P1 | A pinned spec fails the float assertion |
| Facts re-verified against the installed version | Completion notes; `evaluation-framework-facts.md` diff reviewed | Manual evidence | P2 | Recorded evidence |

### Story 1.20: Import a second framework's results: promptfoo

File: `test/test-evaluate-promptfoo.js` (`test:evaluate-promptfoo`), fixture `test/fixtures/evaluate-promptfoo/`.

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| Evaluator runs `promptfoo eval --assertions --model-outputs --output <results.jsonl> --no-cache` with telemetry and update checks off, reads the JSONL rows, prints one row per `componentResults` entry, falls back to `gradingResult` when `componentResults` is absent, and prints a `fail` row for an error row with no `gradingResult` | Run the fixture evaluator on a multi-assertion row, a single-assertion row with no `componentResults`, and an error row | Integration | P0 | Reading only `componentResults` drops the single-assertion row, which the case catches |
| Clean `passed-clean-control`; mutated `caught` | Evidence artifacts | Integration over real eval-quality | P0 | A chain break changes the outcome |
| No `cli/` change across the story | `git diff --stat -- cli/` recorded; `test:evaluate-boundaries` afterwards | Static, manual evidence | P1 | A framework import under `cli/` fails the scan |
| Node engine floor met by `.nvmrc`, reported by name when unmet | The test reads `.nvmrc` and promptfoo's `engines.node` before spawning | Static | P2 | A lower major in a temp `.nvmrc` produces the named message |

### Story 1.21: Hold out probes and calibrate rubric judges

Files: `test/test-evaluate-partitions.js` (`test:evaluate-partitions`), `test/test-evaluate-calibration.js` (`test:evaluate-calibration`), new `test:evaluate-check` cases.

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| `heldOutProbes` refusals: unknown ID, clean control, behavior left with no development probe | `test:evaluate-check` cases, exit 10 | Integration | P1 | A removed rule turns its case to exit 0 |
| `--partition` runs the named partition only | Executed-probe log per partition | Integration | P1 | Ignoring the flag runs every probe |
| `gap-view.json` carries held-out probes as ID, class and outcome only | Scan for each held-out probe's rationale, defect summary, `testData` binding and mutation text | Integration | P0 | Writing a full probe into the file fails the scan |
| Partition outcomes equal evidence fields byte for byte | Compare each copied field | Integration over real eval-quality | P0 | A recomputed outcome differs on a fixture whose evidence the test edits |
| Calibration refusals: criterion with no item, anchored level with no item, missing `minimumAgreement` | `test:evaluate-check` cases, exit 10 | Integration | P1 | A removed rule turns its case to exit 0 |
| Calibration runs before the first trial through the same judge path with labels withheld | Stub judge captures input; assert no `expectedLevel` value; assert calibration file written before any record | Integration | P0 | Passing the item whole puts the label in the capture |
| Agreement below threshold exits 11 with no record | Stub judge disagreeing on one of two items, threshold 0.9 | Integration | P0 | Skipping the gate yields records and a scored exit |
| Calibration digest carried as `decodingParameters["tea.judgeCalibrationDigest"]` | Schema validation of the configuration; editing one calibration item changes the configuration digest and the scoring version | Contract | P1 | Omitting the digest leaves the configuration digest unchanged |

### Story 1.22: Attribute findings for interpretation

File: `test/test-evaluate-interpret.js` (`test:evaluate-interpret`).

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| `operationPhases` refusals: unclassified permitted operation, phase for an undeclared operation | `test:evaluate-check` cases, exit 10 | Integration | P1 | A removed rule turns its case to exit 0 |
| Findings traced to observations, quotes, oracle and evidence pointers; partitioned by phase | Fixture records with process and outcome findings | Integration | P1 | Dropping the pointer lookup leaves pointers empty, which the assertion catches |
| First material error is the lowest `sequence` among `material` and `critical` citations | Sequences 7, 3, 12 name 3; a `low` finding at 1 leaves it at 3 | Unit | P0 | Ignoring severity names 1 |
| Outcomes, verdict and strength copied from evidence byte for byte; no added outcome, verdict, rate or claim score | Field comparison and a key allow-list over the file | Integration over real eval-quality | P0 | A computed field outside the allow-list fails |

### Story 1.12: Inspect the target, capture requirements and design the corpus

Levels: guidance, contract. File: `test/test-evaluate-guidance.js`.

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| Inspection maps six kinds as AD-4 does, web to `api`, clarifying question on ambiguity, kind only in `evaluation.json` | Parse the mapping table in `references/inspection.md` and compare row by row with a copy of AD-4's table held in the test | Guidance | P1 | Editing one row fails |
| Five inspection headings (entry points, behaviors, surfaces, existing tests, failure history) with worked examples; inspection record template | Heading markers; template section parse | Guidance | P1 | Removing one heading fails |
| Vendor-model passage and worked redirect | Marker plus the redirect example's presence | Guidance | P0 | Removing the passage fails |
| Six intake question families with example questions and worked answers; statement template sections match | Heading markers; template section set equals the family set | Guidance | P1 | Removing one family or section fails |
| `requirements` path and digest in `evaluation.json` | `test:evaluate-check` case: a template-filled `evaluation.json` validates, one missing the digest fails | Contract | P1 | Removing the schema field fails the valid case |
| Six per-kind corpus headings, each with representative, negative and malformed, gameability and held-out sub-headings | Heading tree parse | Guidance | P1 | Removing one sub-heading fails |
| Tagged worked corpora validate against eval-quality's probe schema, rationales tagged by section | Extract tagged blocks; validate; parse rationale tags | Contract | P0 | Corrupting one example fails |
| Intake writes to `{test_artifacts}/evaluate/<evaluationId>/` and halts | Assert the halt marker and the path string | Guidance | P1 | Removing the halt fails |
| Corpus names each CAP-3 rule and runs `digest` | Assert four rule markers and the `tea-evaluate digest` invocation | Guidance | P1 | Deleting a rule fails |
| `evaluation.json` template validates against the runtime schema | Contract | Contract | P1 | Template drift fails |

### Story 1.13: Author the contract, oracles, rubrics and adapter wiring

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| Contract guide covers sixteen authored and five identity fields, seven `forbiddenInputs`, non-null criterion | Guidance test reads the field list from `eval-quality/schemas/eval-contract.schema.json` `required` and asserts each is named | Guidance | P1 | Removing a field name fails |
| Skeleton filled from `test/fixtures/evaluate/contract-fill.json` compiles and seals exit 0; an unfilled placeholder fails; `sourceSpecDigest` equals `digestBytes` over the fixture's `requirements.md` bytes | Substitute every `{{key}}` from the fill file, run `eval-quality compile` and `seal`; a skeleton key absent from the fill file fails the test before compile; compare the stamped digest | Integration over real eval-quality | P0 | Removing `forbiddenInputs` from the skeleton yields exit 4; stamping any other digest fails equality |
| Oracle guide, adapter guide, stage halts on non-zero with the failure code | Guidance markers | Guidance | P2 | Removal fails |
| Seven authoring-discipline rules, each with a worked fragment and the gap its absence produces | Heading per rule; tagged fragments compile inside the fill contract | Guidance, integration over real eval-quality | P0 | Removing a rule heading or corrupting its fragment fails |
| Interaction-plan, sensitivity-witness and waiver headings with worked examples | Heading markers; tagged examples compile | Guidance | P1 | Removal fails |
| What `seal` withholds and why | Marker naming checks, interaction plan and test data, and the digest's role | Guidance | P1 | Removal fails |
| Skill stage runs `check`, `compile`, then `seal`, halting on non-zero | Parse the stage's command sequence | Guidance | P0 | Removing `seal` fails |
| Oracle relation choice, exact checks with evidence pointers, anchored rubrics, calibration design; every tagged check and rubric compiles | Heading markers; compile tagged blocks | Guidance, integration over real eval-quality | P0 | An unanchored rubric example fails compile with `rubric-unanchored` |
| Loose oracle shown with the degenerate response it accepts and the tightened oracle | Marker for the triple | Guidance | P1 | Removal fails |
| Adapter guide covers every AD-4 row with a worked registry entry and cites the fixtures | Row set equals AD-4's; each cited fixture path exists | Guidance | P1 | Removing the workflow or calling-agent row fails |

### Story 1.23: Teach choosing and building the evaluation layer

Levels: guidance, integration (template rendering).

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| Duties of an evaluation layer mapped to evaluator kinds | Heading markers in `references/evaluator.md` | Guidance | P1 | Removing a heading fails |
| Selection rubric: every option row with named criteria and a valid `evaluator.kind` | Parse the table; validate each kind against the runtime schema | Guidance, contract | P0 | Removing a row or naming an unknown kind fails |
| Landscape states the list is illustrative | Marker | Guidance | P2 | Removal fails |
| Learn-on-the-go steps and the `LEARNED.md` template sections | Step markers; template section parse | Guidance | P0 | Removing the executed-example step fails |
| Vendor rule for the layer | Marker | Guidance | P1 | Removal fails |
| Framework templates reproduce the Story 1.19 and 1.20 fixtures | Render each template into a temp copy of its fixture and run it to `passed-clean-control` and `caught` | Integration over real eval-quality | P0 | A template that drifts from its fixture changes the outcome |

### Story 1.14: Drive the run and interpret the gaps

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| `gaps.md` maps every outcome state and discipline rule from the installed package, every preflight check from the schema, every AD-10 exit | Parse the mapping table in `gaps.md`; the key set must equal `OUTCOME_STATES`, `DISCIPLINE_RULES`, the preflight check enum and the AD-10 exits, each row naming a probe, control, oracle or evidence remedy | Guidance | P0 | Removing one row fails set equality |
| Harness asks for the three thresholds and fills no default | Guidance marker plus the Story 1.8 template contract test | Guidance | P1 | A default value fails the template test |
| Runtime invocation per AD-20 and `node cli/evaluate.js` in TeA | Guidance markers for both forms | Guidance | P2 | Removal fails |
| Mutation planning writes `M-NNN.mutation.json` per AD-19 | Guidance marker; the file shape is held by `check` | Guidance | P2 | Removal fails |
| Realistic mutation headings per behavior class, each with a tagged mutation file; single-source rule; vendor refusal | Heading markers; tagged files validate against the runtime schema | Guidance, contract | P0 | Corrupting one example fails |
| Harness risk table (deterministic and sampled targets at three risk levels) and the strict threshold rule | Table parse; marker for `caughtCount / validCount > catchThreshold` | Guidance | P1 | Removing a row fails |
| Gaps readings: strength vector, loose oracle, process and outcome, first material error, held-out from `gap-view.json` | Heading markers | Guidance | P1 | Removal fails |
| Author, rerun and rescore loop steps, held-out partition last | Ordered step parse | Guidance | P1 | Removing a step or reordering held-out first fails |

### Story 1.15: Float the engine pin and admit Evaluate-authored suites

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| Devdependency spec `latest`; exact-version assertion removed | `test:eval-quality-corpus` asserts the spec is `latest` and records the resolved version | Static | P1 | Restoring `3.4.0` fails |
| `.npmrc` and `lockfile-age` exclusions stay | `test:supply-chain`, `test:lockfile-age` | Static | P2 | Removal fails the existing gates |
| `evaluate-authored` entry cross-checked against `evaluation.json` and scoring policy | `test:eval-schemas` over a fixture entry; a changed threshold fails | Contract | P0 | Removing the cross-check lets the changed threshold pass |
| AD-14: no skill has both a `behavioral` and an `evaluate-authored` entry | `test:eval-schemas` negative case | Static | P1 | Removing the rule passes the negative case |
| `evaluate-authored` admitted by the manifest schema, `eval:all` and the three coverage counters | `test/schema/suite-manifest.js` branch; a fixture manifest whose only entry for a temp skill is `evaluate-authored` passes `test:suite-manifest` | Contract | P0 | Reverting the counter change leaves the temp skill unaccounted and fails |

### Story 1.16: Evaluate authors its own suite, run live and recorded

Covered in full under "The Dogfood Proof" below.

### Story 1.24: Evaluate authors strong suites for two more target kinds

Levels: live (recorded), integration (deterministic re-run). File: `test/test-evaluate-authoring.js` (`test:evaluate-authoring`).

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| Sessions run in a temporary folder with only the skill, the target and its two files | Transcript file reads recorded; the worker lists the folder before the session | Live evidence | P0 | A read outside the folder in the transcript fails the story's review |
| `check`, `compile`, `seal` exit 0; committed replay inputs (observations, preflight verdict, sealed records, isolation manifests, evaluator configuration, policy, evidence) present | `test:evaluate-authoring` runs the three commands and checks the `evaluation/replay/` set | Integration over real eval-quality | P0 | Breaking the contract fails compile |
| Both suites strong at `minimumTrialCount` as defined in the story, whatever evaluator kind was chosen | Replay the committed observations and records through `eval-quality preflight --observations` and `score` directly, with no target launch and no model call; produced evidence equals the committed evidence byte for byte; assert outcomes, class rates 1.0, PASS, no gap at or above the floor | Replay | P0 | Editing the committed contract or one committed observation changes the evidence and fails |
| Each suite covers its kind's four corpus sections | Parse `rationale` section tags per probe | Integration | P1 | Deleting the held-out probes fails coverage |
| Vendor-model request redirected; no mutation targets a model | Transcript excerpt in completion notes; scan committed mutations for model identifiers | Live evidence, static | P1 | Recorded evidence |

### Story 1.25: Close seeded weaknesses through the gap loop

File: `test/test-evaluate-gap-loop.js` (`test:evaluate-gap-loop`).

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| Before evidence shows W1 (gameability probe unqualified or not `caught`) and W2 (`malformed-input` coverage gap) | Replay of `before/replay/` through `preflight` and `score`, byte-equal to the committed evidence | Replay | P0 | A before copy without the seeded weakness fails the assertion |
| After evaluation strong | Replay of `after/replay/`, byte-equal to the committed evidence | Replay | P0 | Reverting the tightened oracle changes the evidence and fails |
| Every changed file is named in the gap report | Diff `before/` against `after/`; parse the committed gap report | Static | P1 | An unexplained edit fails |
| Session never read `SEEDED.md` or held-out probe files | Transcript file reads cited in completion notes | Live evidence | P0 | Recorded evidence |

### Story 1.26: Learn an unfamiliar evaluation framework on the go

File: `test/test-evaluate-learned-framework.js` (`test:evaluate-learned-framework`).

| AC | Test | Level | P | Revert check |
| --- | --- | --- | --- | --- |
| Framework name absent from the skill directory | Recursive grep in the test | Static | P0 | Adding the name to a guide fails |
| `LEARNED.md` holds framework, version, facts with sources, executed example and output, contradictions | Section parse | Static | P1 | Removing the executed example fails |
| Minimal example executed against a known pass and fail before mapping | Transcript order in completion notes | Live evidence | P1 | Recorded evidence |
| Clean `passed-clean-control`; mutated `caught`; no `cli/` change | Deterministic re-run; `git diff --stat -- cli/` recorded | Integration over real eval-quality | P0 | Breaking the mapping changes the outcome |

## The Dogfood Proof (AD-15)

### What the run must produce

A maintainer session (the overnight worker) runs `EV` on `bmad-testarch-evaluate`, answering intake from `SPEC.md`. TEA is not installed into its own repository, so the worker first writes a gitignored `_bmad/tea/config.yaml` with `tea_evaluations_folder: test/evaluations` and `test_artifacts`, invokes the skill by path from `src/workflows/testarch/bmad-testarch-evaluate/SKILL.md`, and gives the runner-driven arms TEA config the way the existing runners do (`cli/lib/resolve-tea-config.js`). The discharged behavior must be observable on the skill runner's stdout or exit code (AD-19); inspection is the natural candidate: given a described web application, the run prints interface kind `api`, and the mutation edits the one place in `references/` that defines that output line, so the mutated arm prints `web`. A behavior restated in several guides (the never-`web` rule appears in inspection, contract and adapter guidance) can survive a one-file mutation, so the output format must have a single source, and the worker confirms manifestation once on the disposable copy before the recorded run. The oracle reads stdout; the signature addresses stdout.

### How the run is verified

The worker performs each step and records its output in `_bmad-output/implementation-artifacts/evaluate/epic-1-proof.md`:

1. `tea-evaluate check`, `eval-quality compile` and `eval-quality seal` on `contract.json` exit 0, in the order the skill's stage runs them.
2. `runs/<invocationId>/preflight-verdict.json` has `passed: true`, with `clean-control`, `seeded-faults-scoped` and `seeded-fault-fired` satisfied.
3. The evidence artifact for the clean control carries `passed-clean-control` in `reducedProbeOutcomes`; the seeded probe carries `caught`; `trials.completedAttempts` is at least `minimumTrialCount` for each set; both `eval-quality score` exit codes are recorded.
4. Rollback: the mutation evidence carries `preDigest`, `mutatedDigest` and `restoredDigest`, with `mutatedDigest` unequal to `preDigest` and `restoredDigest` equal to it, and the re-passed baseline leg resolves the clean-control oracle. Adopter tree untouched: `shasum -a 256` of the file in the worktree equals `preDigest` and `git status --porcelain` is identical before and after.
5. Independent re-score: `eval-quality score` run directly from `node_modules/.bin`, outside `tea-evaluate`, over the persisted records, isolation manifests and evaluator configuration, reproduces each evidence artifact byte for byte (sha256 equal). This is the proof that the verdicts come from the CLI.
6. `run.json` records `dirty: true`, the model and runner identity as fixed conditions, and the engine version: the published eval-quality release TeA's devDependency resolves (4.0.0 or later).
7. The gaps Evaluate named, verbatim.

A verdict other than PASS, or a `missed` seeded probe, is recorded as the finding it is. The run is recorded once, and the gaps stage output is the next action.

### What is committed

Staged, uncommitted overnight: `test/evaluations/bmad-testarch-evaluate/` (`evaluation.json`, `contract.json`, `probes/`, `mutations/`, `corpus/`, `corpus-index.json`, `policy/`), the suite-manifest entry, `.prettierignore`, and `epic-1-proof.md` (`git add -f`). `runs/` stays in the worktree, gitignored, for Epic 2.

### What `npm test` enforces afterwards

- `test:eval-schemas`: the `evaluate-authored` entry's thresholds equal `evaluation.json` and the scoring policy.
- `test:suite-manifest`: `bmad-testarch-evaluate` is accounted for by a suite, with no `deferred` entry.
- From Story 2.5: `tea-evaluate check`, `eval-quality compile` and `seal` over the committed evaluation, each its own script and `quality.yaml` step, so a stale `corpus-index.json`, a hand edit that breaks the contract, or an ID off pattern blocks every pull request.
- After Story H.1: the `pr` replay of the accepted baseline reproduces the committed evidence.

## Execution Strategy

- **Pull request:** every `test:evaluate-*` script above runs in `npm test` and in its own `quality.yaml` step. All use stub targets or loopback fixtures, no secret, no model call.
- **Manual, recorded:** Story 1.3's routing run, Story 1.16's proof run, and the Story 1.24, 1.25 and 1.26 sessions, through the local Claude Code CLI; each of the last three is then held by a deterministic script.
- **Nightly and weekly:** none in this epic; Epic 2 defines the `scheduled` tier.

## Resource Estimates

| Priority | Scenarios | Effort range |
| --- | --- | --- |
| P0 | 81 | 71 to 106 hours |
| P1 | 67 | 37 to 61 hours |
| P2 | 12 | 5 to 9 hours |
| Total | 160 | 113 to 176 hours, spread over twenty-six stories |

## Quality Gate Criteria

- P0 pass rate 100 percent; P1 pass rate 100 percent (no flaky allowance: every test here is deterministic)
- Every score-6 risk has its mitigation test merged in the story named
- Every acceptance criterion's revert check observed once and recorded
- `npm test`, the engine check and, where named, `npm run test:release-metadata` green at each story's end

## Mitigation Plans

Each score-6 risk above names its test and story. Verification for all of them is the revert check: the worker undoes the mitigation locally, observes the named failure, restores it, and records the observation in completion notes. The coordinator's review layers check that record against the diff.

## Assumptions and Dependencies

1. The engine is the published eval-quality release, 4.0.0 or later, which carries trial-set scoring (#143) and Story 1.1's target-policy export (#158); its `package.json` version reads that release.
2. `node_modules/.bin/eval-quality` is the CLI every integration test spawns; no test spawns a globally installed copy.
3. The local Claude Code CLI is authenticated on the build machine.

## Interworking and Regression

| Component | Impact | Regression scope |
| --- | --- | --- |
| `test/lib/` harness | Re-pointed at `cli/lib/evaluate/` | `test:probe-targets`, `test:probe-conformance`, `test:eval-replay`, `test:compare-eval-runs`, `test:automate-eval-fixture`, `eval:preflight` |
| Routing suite | Menu grows to eleven items | `test:eval-routing-data`, `test:eval-routing-boundaries`, `test:eval-routing-evidence`, `test:contract-sources`, `test:probe-sources` |
| Install and description validators | Lean shape admitted | `test:install`, `test:tea-workflow-descriptions` |
| Package metadata | New bin and peer range; framework devDependencies | `test:release-metadata`, `test:guard-publish`, `test:licences`, `test:lockfile-age`, `test:supply-chain` |
| Agent adapters | Sealed-brief evaluator and bridge attachment | existing runner tests that load `cli/lib/agent-adapters.js`, `test:evaluate-evaluators` |

## Appendix

Knowledge fragments applied: `risk-governance.md`, `probability-impact.md`, `test-levels-framework.md`, `test-priorities-matrix.md`. Related: `epics.md`, `SPEC.md`, `ARCHITECTURE-SPINE.md`, `eval-quality-facts.md`, `test-design-epic-2.md`.

**Generated by:** BMad TEA Agent, `bmad-testarch-test-design`, epic-level mode.
