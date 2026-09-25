---
title: eval-quality facts for Evaluate planning
source: eval-quality@467e3a3 (npm latest is v3.4.0; main adds unreleased trial-set scoring, #143)
verified: 2026-09-22, five-slice source scan with path:line citations; load-bearing claims re-checked by the coordinator
---

# eval-quality facts

**Update, Story 1.2 landing:** eval-quality has since released `4.0.0`, carrying both the target-policy export this file describes as Story 1.1's unpublished work (eval-quality#158) and the trial-set scoring below described as merged but unreleased (#143). Every "unreleased" or "published v3.4.0" claim in this file describes the state at the `verified` date above. TeA's own devDependency now pins the exact `4.1.4` release, and its optional peer range is floored at `>=4.1.4` (updated 2026-09-24 in Story 1.8: 4.1.3 is the first `score` that writes the reasons of an Invalid result to stderr, one `eval-quality: invalid: <reason>` line each, eval-quality#162; 4.1.4 changes only the `SealedRunRecord` schema's description of an observation's `provenance`, which now defines it by the observation's role: `evaluator-chosen` is an action the evaluation itself performed, whether an agent or a scripted plan chose it, and `baseline` a harness baseline or fixture set-up call, which the witness match excludes).

This is the ground truth every Evaluate planning artifact builds on. It describes eval-quality `main`, which is ahead of the published v3.4.0: trial-set scoring (#143: repeatable `score --record`, `reducedProbeOutcomes`, `EvidenceArtifact` schema v4, BREAKING) is merged but unreleased. Against published v3.4.0, `score` takes one record per call, so every trial set completes one trial and falls below `minimumTrialCount`. Evaluate therefore needs the next eval-quality release. Each fact cites the eval-quality source (paths relative to that repository). If a planning artifact contradicts this file, the planning artifact is wrong; if this file contradicts the eval-quality source, re-verify and fix this file.

## What this means for Evaluate (coordinator summary)

1. **eval-quality runs nothing under evaluation.** `compile`, `seal`, `preflight` and `score` are transformations over JSON. The CLI's `preflight` consumes pre-collected observations (`src/cli/run.ts:389-424` calls only `preflightFromObservations`), and `score` consumes caller-sealed run records. Driving the target, collecting observations, producing and sealing `SealedRunRecord`s is adopter work, so it is Evaluate's work to scaffold.
2. **Web targets are evaluated through the `api` interface kind.** The schema declares `api`, `web`, `cli`, `mcp`, but `web` never compiles (`src/core/compile/interface-inventory.ts:37-45`, `unsupported-interface-kind`). A web application is declared as `kind: "api"`.
3. **No `api` adapter ships.** The package performs no network I/O by design (`src/adapters/mcp-adapter.ts:11-19`). Shipped adapters: command line (`cli`), stdio MCP (`mcp`), local corpus, file system, clock. An HTTP target needs an adopter-owned `EnvironmentProbePort`, proven with the `eval-quality/conformance` suites. The HTTP authorization schema exists (`ProbeTargetAuthorization`, `src/core/schemas/probe-policy.ts:17-40`). Evaluate must scaffold this port for `api` targets.
4. **Target kind (agent, skill, workflow, tool-use, AI feature) is a docs concept only.** No schema field carries it. Each maps onto `api`, `cli` or `mcp` through the five `docs/how-to/evaluate-*-behavior.md` guides. Evaluate may use target kind to pick a corpus design and adapter shape; it never writes it into the contract.
5. **Mutation is the adopter's.** eval-quality applies no mutation and has no rollback mechanism. The `controlled-mutation` qualification route records `mutationSource`, `mutationOperator` (free text, read by no code), evidence, and an attested `rollbackVerified` that must be `true`. Evaluate owns applying the mutation, capturing baseline-pass and mutated-fail evidence, and proving rollback.
6. **There is no probe-corpus manifest format.** A probe set is a caller-supplied `Probe[]`; `corpusDigest` is caller-attested and only shape-checked. Evaluate defines how its corpus is laid out and digested.
7. **`eval-quality.config.json` configures `eval-quality-gates` only** (eight repository-policy gates). It holds no behavioral-evaluation settings. Behavioral thresholds live in the `ScoringPolicy` artifact.
8. **No reusable CI action ships.** Consumers invoke the binaries directly. Evaluate generates the CI wiring.
9. **Failure classification is already in the outcome vocabulary.** Target behavior failure, evaluation weakness (evidence conditions), evidence or policy integrity failure, and infrastructure failure map to distinct outcome states, ladder rows and exit codes (section below). Evaluate's CI policy maps onto these; it does not invent a parallel taxonomy.
10. **Three FAIL rows are unreachable from the shipped pipeline today**: `evidence-over-truncated`, `evidence-unavailable`, `evidence-internally-inconsistent` are hard-coded `false` in `src/core/score/score.ts:804-813`. A CI policy must not claim to detect them.

## Behavioral Evaluation Contract and interfaces

- `EvalContract` is a strict object with 21 top-level fields: `schemaVersion`, `parentDigest`, `revisionCount`, `contractId`, `sourceSpecDigest`, `behaviors`, `oracles`, `rubrics`, `waivers`, `permittedInterfaces`, `referenceSets`, `siblingGroups`, `interactionPlan`, `scopedResources`, `forbiddenInputs`, `testData`, `budgets`, `safetyLimits`, `requiredEvidence`, `probeStepBound`, `fixtureReset` (`src/core/schemas/eval-contract.ts:163-234`). `EVAL_CONTRACT_SCHEMA_VERSION = 5` (`eval-contract.ts:161`); any other value fails `schema-version-mismatch` (`src/core/compile/compile.ts:101-107`). JSON Schema mirror: `schemas/eval-contract.schema.json`.
- `behaviors`: at least one; each has `id` (`^B-[0-9]{3,}$`), `description`, `severity` (`low | material | critical`), `observableSuccessCriterion` (string or null), `requirementLinks`, `riskLinks`, `oracles` (`eval-contract.ts:37-70,175-180`).
- `oracles`: may be empty; each has `id` (`^O-[0-9]{3,}$`), `direction`, `check` (expression), `polarity` (`expects-hold | expects-violation`), `commentary` (`src/core/schemas/oracle.ts`).
- `forbiddenInputs` must list all seven floor members: `original-spec`, `source-code`, `repository`, `builder-transcript`, `implementation-logs`, `comparator-results`, `human-labels` (`eval-contract.ts:85-98`); otherwise `forbidden-input-floor-incomplete`.
- `waivers[].rule` names one of the seven discipline rules (`eval-contract.ts:295-304`).
- Interface kinds: `INTERFACE_KINDS = ['api','web','cli','mcp']` (`src/core/schemas/interface.ts:333`). Supported: `api`, `cli`, `mcp`; `web` fails `unsupported-interface-kind` at compile (`src/core/compile/interface-inventory.ts:37-45,74-84`). `api` and `web` share one HTTP operation shape (`interface.ts:352-357`). `cli` operations: executable plus subcommand path, channels argument, option, environment, stdin (`interface.ts:158-253`). `mcp` operations: tool name, one `arguments` channel, structured result (`interface.ts:304-321`).
- Target kind is not a schema field. The five how-to guides map agent, skill, workflow, tool-use and AI feature onto `api`, `cli`, `mcp` (`docs/how-to/evaluate-ai-feature-behavior.md:13-16`, `docs/reference/glossary.md:121`).
- Rubrics (`src/core/schemas/rubric.ts:49-96`): `id`, `scaleLevels`, `failureModePenalties` (no weights), `maxLength`, `criteria[{id,text,evidence}]`. Compile failures: `rubric-unanchored`, `rubric-scores-reasoning-prose`, `rubric-evidence-unreachable`.
- Sensitivity witnesses (`src/core/schemas/sensitivity-witness.ts:116-166`): `witnessId`, `channel`, exactly two `legs`, `relation`. Mandatory for every operation with request-channel keys; `null` only for a no-input operation. Strict compile raises `undeclared-mandatory-input`. `ManifestationWitness` and `FixtureReset` are related shapes for seeded-defect verification and per-run reset (`sensitivity-witness.ts:189-213`).
- Interaction plan steps (`src/core/schemas/plan.ts:170-180`): `stepId`, `operationId`, `inputBinding` (`literal`, `matcher: any | type-violating`, `captured`, `principal`), `after` (one level only), `cardinality` (`exactly-one | at-most-one | any`).
- `EvaluatorConfiguration` (`src/core/schemas/evaluator-configuration.ts:32-63`): `sealedBriefDigest`, `evaluatorIdentity`, `modelSnapshot`, `systemPromptDigest`, `decodingParameters`, `toolInventory`, `permissionInventory`, `budgets`, `seed`, `judgeConfiguration`.
- Sealing always recompiles first (`src/application/seal.ts:22`). `SealedEvaluatorBrief` v2 carries `contractDigest`, `behaviors`, generated oracle `directions`, interfaces narrowed to `{logicalId, kind}`, `scopedResources`, principal names, `budgets`, `safetyLimits`, `probeStepBound`; it cannot carry the interaction plan, oracle checks or test data (`src/core/schemas/sealed-evaluator-brief.ts:54-99`).
- Compile raises 26 structural failure codes (`src/core/failure-codes.ts:11-38`), including `missing-requirement-linkage`, `no-observable-success-criterion`, `unreachable-check-evidence`, `unsupported-interface-kind`, `undeclared-mandatory-input`, `oracle-missing-channel`, `plan-exceeds-scripting-bound`, `binding-cycle`, `waiver-incomplete`, `excluded-content-in-declaration`. Strict mode (default) adds the mandatory-input and sensitivity-witness checks (`src/application/compile.ts:33`).

## Probes, corpus, controls, seeded defects, gameability, mutation and rollback

- `Probe` is a discriminated union on `expectedClean` (`src/core/schemas/probe.ts:121-151`). Common fields: `schemaVersion`, `parentDigest`, `revisionCount`, `probeId` (`^P-[0-9]{3,}$`), `probeClass`, `behaviorId` (`^B-[0-9]{3,}$`), `systemId`, `implementationDigest`, `artifactDigest`, `commitDigest`, `rationale`, `qualification` (`probe.ts:44-64`). `PROBE_SCHEMA_VERSION = 5` (`probe.ts:90`).
- Probe classes, closed set: `defect`, `gameability`, `zero-action`, `canary` (`probe.ts:17-22`).
- Clean control: `expectedClean: true`, `defects: []`, no `defectSignature` (`probe.ts:126-134`). A clean control must be `probeClass: zero-action` with the `clean-control` qualification route (`src/core/score/qualification.ts:231-256`).
- Non-clean probes carry `defects[]` and a required `defectSignature` key; `null` is legal only for `canary` (`probe.ts:139-146`, enforced in `qualifyProbe`).
- Defect: `defectId`, `behaviorId`, `summary`, `severity`, `oracleEvidence: ArtifactReference[]`, `source: natural | controlled-mutation`, `manifestationWitness` (nullable; `null` fails the preflight `seeded-fault-fired` check) (`probe.ts:27-39`).
- Five qualification routes (`src/core/schemas/probe-qualification.ts:51-142`):
  - `historical`: fail-before and pass-after evidence, fix commit digest, `oracleStableAcrossRevisions` must be `true`.
  - `controlled-mutation`: `mutationSource`, `mutationOperator` (free text, read by no code), `targetArtifact`, `expectedObservableFailure`, `baselinePassEvidence`, `mutatedFailEvidence`, `rollbackVerified` must be `true`.
  - `gameability`: `degenerateResponse` (prose only), `naiveOracleSatisfiedEvidence`, `disciplinedOracleRejectedEvidence`.
  - `canary`: `indicts: corpus | fixture`, `nonDetectionEvidence`.
  - `clean-control`: `baselinePassEvidence`, `revisionCommitDigest`, `noKnownDefectStatement`.
- Mixed defect sources in one probe fail with `qualification-defect-sources-mixed` (`qualification.ts:266-282`).
- `qualifyProbe` (`qualification.ts:794-853`) is the only gate keeping unqualified probes out of a sealed set. 20 closed failure codes in `QUALIFICATION_FAILURES` (`qualification.ts:66-87`). `sealProbeSet` partitions probes into admitted and rejected (`qualification.ts:860-894`).
- Corpus port is bytes only: `CorpusPort.resolve({privateRef}) -> {privateRef, bytes}` (`src/ports/corpus-port.ts:8-16`). `createLocalCorpusAdapter({root})` resolves private refs under a root and rejects path escape, including through symlinks (`src/adapters/local-corpus-adapter.ts:30-108`).
- No corpus manifest or index schema exists. A probe set is a caller-supplied `Probe[]`.
- `corpusDigest` in scoring is caller-attested and only shape-checked (`src/application/score.ts:54-59,172-178`). `score` takes one probe at a time (`score.ts:49`).
- "Corpus" is overloaded: `corpus/dev/contracts/*.json` (24 files) are contract fixtures for the AD-31 coverage truth table (`src/core/coverage/table.ts`), a different object from a probe corpus.
- Coverage predicates read the contract, never probes. Seven AD-20 discipline rules: `success-indicator-separation`, `whole-body`, `malformed-input`, `per-record`, `sibling-cross-check`, `omission-and-completeness`, `state-change-read-back` (`src/core/coverage/rules.ts:7-15`). A gap record is emitted when a rule is relevant and unsatisfied (`src/core/coverage/coverage.ts:33-58`).
- eval-quality performs no mutation. The adopter makes the edit (`docs/how-to/evaluate-ai-feature-behavior.md:332`); no mutation code exists in `src/`.
- Rollback is an attested boolean (`rollbackVerified`); `false` fails with `qualification-evidence-unverified` (`qualification.ts:330-340`). No rollback mechanism exists in the package.
- `IsolationManifest` (`src/core/schemas/isolation-manifest.ts:102-149`) audits a run's sandbox (mounts, network, tool calls, resource ceilings, violations). `PrivateArtifactManifest` (`src/core/schemas/private-artifact-manifest.ts:64-73`) is a public-safe catalog of private artifacts. Neither is a mutation or rollback mechanism.

Unknowns: whether `corpusDigest` is cross-checked outside `score.ts`; how often callers supply `homeOperation` to `qualifyProbe` (which enables three declaration checks).

## Execution, adapters, preflight, trials, evidence

- Shipped adapters (`src/adapters/index.ts:7-27`): `createCommandLineAdapter` and `nodeCommandMechanism` (`cli`), `createMcpAdapter` and `nodeStdioMcpMechanism` (`mcp`, stdio only), `createLocalCorpusAdapter`, `createNodeFileSystemAdapter`, `createSystemClockAdapter`. No `api` adapter; the package performs no network I/O (`src/adapters/mcp-adapter.ts:11-19`).
- Command-line adapter: `shell: false` (`command-line-adapter.ts:249`); rejects non-`cli` requests with `forbidden-target` (`:394-402`); argv options first as `--key`, positionals after (`:113-132`); environment limited to declared keys plus host `PATH`, a declared `PATH` is denied (`:159-178`); `maxElapsedMs` and `maxOutputBytes` enforced with SIGKILL and `budget-exhausted` (`:238-338`); declared artifacts read back after exit (`:341-365`); a non-zero exit is an observation (`:31-35`).
- Target policies are default-deny. Command: keyed by `(interfaceId, executable)`, denies `interface-not-authorized`, `executable-not-authorized`, `subcommand-not-authorized` (`src/adapters/command-target-policy.ts:66-98`). MCP: keyed by `interfaceId`, denies `interface-not-authorized`, `tool-not-authorized` (`src/adapters/mcp-target-policy.ts:56-76`).
- Authorization schemas, every field required (`src/core/schemas/probe-policy.ts`): `CommandTargetAuthorization` (`target`, `permittedSubcommandPaths`, `permittedEnvironmentKeys`, `cwd`, `artifacts`, `maxElapsedMs`, `maxOutputBytes`; `:65-116`), `McpTargetAuthorization` (`target`, `targetArgs`, `tools`, `cwd`, `serverEnvironment`, `maxElapsedMs`, `maxOutputBytes`; `:146-191`), `ProbeTargetAuthorization` for HTTP (`scheme`, `host`, `port`, exact `addresses`, `methods`, `safeMethods`, `maxRedirects`, `maxElapsedMs`, `maxRequestBytes`, `maxResponseBytes`; `:17-40`). An empty authorization list is a legal deny-all.
- MCP adapter opens one session per call and kills the process group on teardown; protocol `2025-06-18` (`mcp-adapter.ts:28-46,74,145-156`). Tool errors are observations; only handshake refusal, caps, abort or spawn failure throw (`:47-55,338-345`).
- Preflight: `runPreflight` (library only) plans legs and awaits an `EnvironmentProbePort` sequentially (`src/application/preflight.ts:111-152`). `preflightFromObservations` reduces caller-supplied observations (`:158-197`) and is the only path the CLI uses (`src/cli/run.ts:414-421`).
- Preflight verdict: six checks, `interface-present`, `input-sensitivity`, `state-reset`, `clean-control`, `seeded-faults-scoped`, `seeded-fault-fired`; outcomes `satisfied | failed | exempt`; `passed` means no check failed (`schemas/preflight-verdict.schema.json:44-101`, `src/core/preflight/reduce.ts:483`). Control legs with HTTP status >= 400, MCP `isError`, or a non-zero exit are anomalous (`reduce.ts:50-60`). A `seeded-faults-scoped` check with no surviving clean leg fails (`reduce.ts:400-410`).
- Runtime faults, ten codes (`src/core/schemas/faults.ts:11-22`): `schema-parse-failure`, `schema-version-mismatch`, `non-canonicalizable-value`, `digest-mismatch`, `budget-exhausted`, `port-failure`, `port-contract-violation`, `forbidden-target`, `aborted`, `operator-cannot-accept-operand`.
- Trials: eval-quality has no run scheduler. A trial is one caller-produced, caller-sealed `SealedRunRecord` with `trialIndex` (1-based, unique), `mode` (`production | contract-scoring`), and an opaque `conditionArm` label (`schemas/sealed-run-record.schema.json:36-54`). "Clean leg" and "seeded-fault leg" vocabulary belongs to preflight planning (`src/core/preflight/plan.ts`).
- Ingest detects eleven condition kinds as data (`src/core/ingest/conditions.ts:34-64`): duplicate identifiers, dangling citations, unwitnessed quotations, isolation manifest absent or violated, forbidden input not withheld, cross-artifact disagreement on `runId`, `contractDigest` or `evaluatorConfigurationDigest`, evaluator configuration absent or digest mismatch, judge result unscored.
- Lineage stages: compile, seal, ingest, preflight, score, emit (`src/core/lineage/stage-table.ts:11-14`).

## Scoring, contract strength, verdicts, failure classification

- `runScore` validates inputs, verifies private-artifact digests, ingests each trial, scores, then emits the evidence artifact unless the verdict is Invalid (`src/application/score.ts:267-333`).
- Twelve outcome states (`src/core/schemas/evidence-artifact.ts:24-37`): `caught`, `confirmed`, `missed`, `passed-clean-control`, `false-positive`, `abstained`, `bypassed`, `unreached`, `oracle-error`, `judge-error`, `infrastructure-error`, `not-applicable`.
- Trial-set reduction (`src/core/score/reduce-trials.ts:39-154`): invalidating states (`oracle-error`, `judge-error`, `infrastructure-error`) leave the valid count; unvoted states (`not-applicable`, `unreached`) count nowhere; the other seven vote. A probe is caught when `caughtCount / validCount > catchThreshold` (strict).
- Contract strength (`src/core/score/strength.ts:67-139`): an unweighted catch rate per probe class (`defect`, `gameability`, `zero-action`) over unique qualified probes; canaries and clean controls are excluded; an admitted but unexercised class reports `rate: null`.
- `compareDominance` (`strength.ts:157-295`) requires equal `comparabilityKey`, both sides `comparable`, consistent reductions and unique probe outcomes, then returns `a-dominates-b`, `b-dominates-a`, `equivalent` or `incomparable`. The severity floor can only downgrade a win to `incomparable`. `comparable` requires completed trials >= `minimumTrialCount` and no `unreached` oracle (`src/core/emit/emit.ts:79-80`).
- `ScoringPolicy` (`schemas/scoring-policy.schema.json:36-94`), every field required: `catchThreshold`, `minimumTrialCount`, `severityFloor`, `confidenceThreshold`, `reExecutionCap`, `remediationCap`, `regexMatchStepBudget`. Published default artifact: `catchThreshold 0.5`, `minimumTrialCount 3`, `reExecutionCap 2`, `remediationCap 3`, `regexMatchStepBudget 1000000`.
- Verdicts (`src/core/score/ladder.ts`): `PASS`, `WAIVED`, `CONCERNS`, `FAIL`, plus Invalid (`verdict: null`). Precedence invalid, FAIL, CONCERNS, WAIVED, then PASS by fallthrough (`:773-826`). Production and contract-scoring ladders differ only in two production rows that read the evaluator's own recommendation (`:610-619,716-725,753-771`).
- Invalid rows (19, `:288-533`): invalidating outcome state, failed preflight, isolation violation, re-execution cap breach, missing disposition, unresolved required check, selector ambiguity, unwitnessed detection claim or quotation, the eight ingest conditions, operation identifier collision, trial-set field disagreement.
- FAIL rows (`:541-608`): behavioral failure (`missed`, `abstained`, `bypassed`, `false-positive`) at or above `severityFloor`; evidence incomplete, over-truncated, unavailable, internally inconsistent; lineage chain inconsistent. Over-truncated, unavailable and internally inconsistent are hard-coded `false` in `src/core/score/score.ts:804-813`, so those three rows cannot fire from the shipped pipeline.
- CONCERNS rows (`:627-714`): behavioral failure below the floor, coverage gap at or above the floor, finding confidence below threshold, uncited defect finding, below-minimum trial count, oracle `unreached`. The last two are evidence conditions (`evidenceCondition: true`), which `--strict` never promotes to exit 1 (`:802-805`).
- WAIVED rows (`:733-747`): an honoured waiver.

### Failure classification already present in eval-quality

| Class | Where it shows up |
| --- | --- |
| Target behavior failure | Outcome states `missed`, `abstained`, `bypassed`, `false-positive` (`ladder.ts:222-227`); FAIL at or above floor, CONCERNS below |
| Evaluation weakness | Evidence conditions `unreached` and below-minimum trials (CONCERNS, never strict-promoted); coverage gaps; canary `nonDetectionEvidence`; low or null strength-vector rates; probe qualification failures (20 codes) |
| Contract authoring defect | 26 compile structural failures, exit 4 |
| Evidence or lineage integrity | FAIL rows for evidence and lineage; eight ingest conditions and isolation violations as Invalid, exit 3 |
| Infrastructure or invocation failure | Outcome states `oracle-error`, `judge-error`, `infrastructure-error` (Invalid, exit 3); runtime faults (exit 5) |
| Repository policy violation | `eval-quality-gates` exit 1 |

Exit codes (`src/cli/exit-codes.ts:11-72`): `0` PASS, WAIVED, unpromoted CONCERNS and every non-verdict success; `1` CONCERNS promoted by `--strict`; `2` FAIL; `3` Invalid, including failed preflight; `4` structural failure; `5` runtime fault; `64` usage error.

- The run output is the `EvidenceArtifact` (`src/core/emit/emit.ts:44-232`): `scoringVersion` (digest over contract schema version, `corpusDigest`, fixture digest, evaluator configuration digest, scoring policy digest, mode), `comparabilityKey`, `exitCode`, `verdictBasis`, `trials`, `outcomes`, `reducedProbeOutcomes`, `uncitedFindings`, `coverageGaps`, `strength`, `remediation`, and the mode's verdict. Serialized as RFC 8785 canonical JSON (`src/application/serialize.ts:6-12`).
- `docs/explanation/contract-strength.md` omits the WAIVED verdict; otherwise no doc-vs-code drift was found in any slice.

## Public surface: CLI, gates, config, programmatic API, CI

- Package `eval-quality` 3.4.0 at the `verified` date above, now released as `4.0.0`; ESM only, Node >=22.20.0, sole runtime dependency `zod`; optional peer `typescript >=5.7.0` (`package.json:2-3,21,78-88`).
- Binaries: `eval-quality` (`dist/cli/main.js`) and `eval-quality-gates` (`dist/gates/gates-cli.js`) (`package.json:14-17`).
- eval-quality runs nothing under evaluation itself; the caller supplies sealed run records (`src/index.ts:12`, `README.md:87`).

### `eval-quality` CLI: four commands (`src/cli/arguments.ts:8,46-51`)

- `compile`, `seal`: `--in` (stdin when omitted or `-`), `--out`, `--strict-inputs` (default on), `--strict` (`arguments.ts:55-56,84-90`).
- `preflight`: required `--contract`, `--probes`, `--observations`, `--run-id`; optional `--out`, `--strict` (`arguments.ts:57,93-98`).
- `score`: required `--record` (repeatable), `--contract`, `--probe`, `--preflight-verdict`, `--policy`, `--corpus-digest`; optional `--isolation-manifest`, `--evaluator-configuration`, `--private-manifest`, `--corpus-root`, `--out`, `--strict`. `--corpus-root` becomes required when private references are present (`arguments.ts:58-67,100-114`, `src/cli/run.ts:173-194,443-527`). On the Invalid rung it emits no evidence artifact; from 4.1.3 it writes each reason of the ladder's basis to stderr as `eval-quality: invalid: <reason>` (eval-quality#162), where 4.1.2 wrote nothing.
- `--out` ending in `.json` is a file, otherwise a directory receiving `<kind>.json` (`run.ts:100-111,240-253`). Output that collides with an input is refused (`run.ts:261-281`).
- Exit codes (`src/cli/exit-codes.ts:11-72`): `0` success, `1` CONCERNS promoted by `--strict` (never an evidence-conditions-only CONCERNS), `2` FAIL, `3` Invalid (including failed preflight), `4` structural failure, `5` runtime fault, `64` usage error.

### `eval-quality-gates`: repository policy, no behavioral scoring

- Source `scripts/gates-cli.ts` and `scripts/gate-config.ts`, compiled into `dist/gates/gates-cli.js` (`tsconfig-gates.json:2-20`).
- Eight gates: `lockfile-age`, `licences`, `dependency-direction`, `package-boundary`, `field-ownership`, `doc-invocations`, `doc-counts`, `doc-claims` (`scripts/gate-config.ts:59-67`). All deterministic repository policy (`docs/how-to/run-the-gates-on-your-repository.md:20-55`).
- Config: `eval-quality.config.json` (default; `--config <path>` overrides), one object keyed by gate name, paths relative to the config file. A gate with no section refuses by name; there are no fallback defaults (`gate-config.ts:41,449-546`). Whole document: eight optional keys (`gate-config.ts:412-424`).
- `lockfile-age`: `lockfiles` (required), `windowDays` (default 7), `cache`, `exclude` (`gate-config.ts:71,127-165`). `licences`: `lockfiles`, `allowlist` (required SPDX list), `policies`, `tolerances`, `undeclared` (`gate-config.ts:257-330`).
- Exit codes: `0` pass, `1` violation, `64` usage or config error (missing config or section, malformed section, missing `typescript` peer, scan root matching zero files) (`scripts/gates-cli.ts:70-75`).
- `dependency-direction` and `field-ownership` need the optional `typescript` peer (`gate-config.ts:47-52`). `doc-invocations` needs a built entry point and refuses when it is absent (`gates-cli.ts:41-44`).
- The config file holds gate configuration only. It carries no behavioral-evaluation settings.

### Programmatic API

- Root export: `compile`, `seal`, `preflightFromObservations`, `runPreflight`, `runScore`, `serializeArtifact`, digest helpers, `StructuralFailure`, `RuntimeFault`, `FAILURE_CODES`, `RUNTIME_FAULT_CODES`, `validateLineageChain`, `VERDICTS`, `EVALUATOR_RECOMMENDATIONS`, `QUALIFICATION_FAILURES`, `compareDominance`, `DOMINANCE_RELATIONS`, plus artifact types and schema versions (`src/index.ts:31-77`, `src/application/index.ts:8-79`).
- `eval-quality/adapters`: `createCommandLineAdapter`, `nodeCommandMechanism`, `createLocalCorpusAdapter`, `createMcpAdapter`, `nodeStdioMcpMechanism`, `createNodeFileSystemAdapter`, `createSystemClockAdapter` (`src/adapters/index.ts:12-27`).
- `eval-quality/conformance` (maps to `dist/testing/index.js`): port types and conformance suites for clock, corpus, file system, command-line probe, environment probe, MCP probe (`package.json:45-48`, `src/testing/index.ts:14-73`).
- `eval-quality/schemas/*` and `eval-quality/corpus/*` are raw-file subpaths (`package.json:49-50`).

### CI

- The package's own `.github/workflows/pr-checks.yml` runs its gates and checks. No shipped GitHub Action or reusable workflow exists for consumers; the consumer pattern is the CLI invocation in `docs/how-to/run-the-gates-on-your-repository.md`.

No doc-vs-code drift found in README or the gates how-to; the package runs its own `doc-claims`, `doc-counts` and `doc-invocations` gates.
